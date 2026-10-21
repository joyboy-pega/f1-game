# Buddh GP — v3 work log

One section per task (newest last). Evidence only: numbers, test names, what the screenshot showed, what is NOT VERIFIED.
Session decisions are in `docs/PLAN-v3.md` §12.2.

Environment note: port 3000 on this machine is held by another process (returns 404 for `/game`), so `npm run dev`
comes up on **3001**; all `shoot.mjs` runs use `--url http://localhost:3001/game`.

---

## 2026-10-22 — S1 input triggers + result timer (branch `v3/S1-input-triggers`)

**Files:** `lib/game/sim/world.ts`, `components/game/GameLoop.tsx`, `lib/game/sim/world.test.ts`.

**Changes**
- B1: `GameWorld.step` now latches the six edge-triggered requests (DRS toggle, brake bias up/down, pit, reset,
  compound cycle) into `pending*` booleans on every call and hands them to the first fixed step that actually runs.
  A frame with zero steps keeps them pending. Paused frames and `setup()` clear them. No allocation added.
- B4: the results `setTimeout` in `GameLoop` is now cancellable (`cancelResultsTimer`), cleared on unmount and
  guarded with `world.raceId !== raceIdAtFinish`. Deviation from the plan text: the timer id is module-level rather
  than a `useRef`, because `handleEvent` is a module function and `GameCanvas` is already remounted on `sessionId`
  (so unmount cleanup covers the restart path); the raceId guard covers anything else.

**Evidence**
- New tests (8) in `world.test.ts` → 13 tests in that file, 37 total (was 29). Per trigger (5 kinds): press on a
  4 ms frame, then a 5 ms frame → applied exactly once (spy on `fixedStep` sees `[true]`, later steps `false`);
  multi-step frame → `[true,false,false]`; press while paused → dropped; press before `setup()` → not leaked.
- Test validity check: with the old `world.ts` restored, the 5 zero-step tests FAIL and the 3 others pass; with the
  new code all pass.
- `npm run typecheck` clean. `npm test` 37/37. `npm run build` OK.
- `shoot.mjs --url http://localhost:3001/game --out shots/S1 --wait 9000 --hold ArrowUp:3000`:
  `fps: 61`, `errors: []`. PNG viewed: chase cam on the main straight, red car at 211 km/h in gear 6, P10/10,
  timing tower, lap timer 0:05.233, minimap with the Buddh outline, grandstand on the left, cars ahead — no
  rendering problems.

**NOT VERIFIED**
- Real-hardware behaviour at 144/240 Hz (headless Chrome runs ~60 Hz). The unit tests simulate the zero-step frame.
- The B4 restart-within-2.5 s path has no automated test (needs the React tree); verified by reading only.

**Follow-ups noted (not done, outside S1)**
- `world.ts:92` `rand = Math.random` default and `:111` seed fallback: per the session decision on R6, handle in S5.

---

## 2026-10-22 — S5 allocation-free hot path + golden + determinism (branch `v3/S5-alloc-golden`)

**Files:** `lib/game/sim/race.ts`, `lib/game/sim/world.ts`, `lib/game/physics.ts`, new `lib/game/sim/golden.test.ts`.

**Changes**
- `arcPosition(phys, out)` writes into a caller-owned `ArcPos` (callers: `world.ts` step loop via `this.arc`; `makeCar`
  via module scratch).
- `advanceTiming`: returns one module-level reused `TimingResult` (documented "consume immediately"); the `timeAt`
  closure is inlined with the **same expression** `t0 + ((p - prevProgress) / delta) * dt` so floats are identical.
- `sortRunningOrder(order)` is now an in-place insertion sort with `compareRunning`. I added an `a.id - b.id`
  tie-break so equal keys resolve exactly as the old stable sort of the id-ordered car list did.
  `updateOrder` no longer reassigns `this.order` or uses `forEach`.
- `physics.ts`: the per-car-per-step `updateSingleTire` closure is now a module function taking an explicit
  `TireStepCtx` (module-scope scratch `tireCtx`, filled before the four calls). Arithmetic unchanged.
- `world.ts` `fixedStep`: the per-car `extras`, timing-context and track-limits-context object literals are replaced by
  reused fields (`this.extras`, `this.timingCtx`, `this.limitsCtx`). (Beyond the plan's list, same R7 intent, same files.)
- R6 (per session decision): `rand` default is now `makeRng(0)` (placeholder, setup() replaces it); the single remaining
  `Math.random` is the seed fallback in `setup()`, commented.

**Evidence**
- **Golden race** (`golden.test.ts`): seed 12345, race, 3 laps, 9 AI, pro, sunny, player on autopilot brain 99.
  Digest = finish order + every car's lap times to 1e-6. FNV-1a hash **`9c69d82f`**, recorded from the UNMODIFIED code,
  stable over 3 separate vitest processes, then **identical after the refactor** → the refactor is behaviour-neutral.
  Digest: `order=0,1,2,4,3,5,7,9,6,8`, 3 laps for all 10 cars, laps ≈ 65–71 s.
- Determinism test: same seed twice in one process → identical digest (pass).
- R6 scan tests: no `Date.now`/`performance.now` in non-test files under `sim/`, `physics*.ts`, `vehicle/`;
  `Math.random` appears exactly once (world.ts seed fallback).
- Totals: typecheck clean; `npm test` **44/44** (was 37); `npm run build` OK.
- **Micro-benchmark** (12 cars, 30 s sim after 12 s warm-up, wall ms per simulated second):
  before 10.13 / 10.05 / 10.21 / 10.11 → after 9.85 / 10.49 (run-to-run noise ≈ ±5 %). **No measurable speed-up**:
  the removed allocations were small and V8 handles short-lived objects cheaply. The win is GC-pressure hygiene, not CPU.
  Baseline for §11.4: ≈ 10 ms per simulated second for 12 cars (≈ 0.084 ms per 120 Hz step).
- Screenshot `shots/S5.png` (`--wait 9000 --hold ArrowUp:3000`): `fps 59`, `errors: []`; chase cam, car at 204 km/h gear 5,
  P10/10, tower, minimap, grandstand — same scene as S1, no visual change.

**NOT VERIFIED**
- GC behaviour (no allocation profiler run). Allocations REMAIN in the step and are not S5 scope: `updateCarPhysics`
  returns a fresh object and calls `findNearestTrackPoint` which returns a tuple; `aiCtx`/`pitCtx` literals per step
  (240 objects/s); `buildHud` (10 Hz, accepted); lap-completion `slice()`/array literals (once per lap). Left for T1/V2 which
  rewrite those call sites anyway.

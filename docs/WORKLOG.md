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

---

## 2026-10-22 — S6 measurement harness + baseline (branch `v3/S6-measurement`)

**Files:** new `lib/game/devStats.ts`, new `components/game/DevStats.tsx`, `components/game/GameCanvas.tsx` (one additive
line), `components/game/GameLoop.tsx` (sim timer around `world.step`), `scripts/shoot.mjs` (prints `stats`), new
`scripts/probe-physics.ts`, `package.json` (`"probe": "vite-node scripts/probe-physics.ts"`; vite-node is already installed
as a vitest dependency, nothing added to package.json dependencies).

**Mistake I made, corrected:** I told the human `shoot.mjs --settings` did not exist (my grep looked for the literal
`--settings`; the script reads it via `opt('settings')`). It exists. I did not add it; PLAN-v3 §12.2 now says so.
I also first added a `--quality` flag writing `formula_v_quality`; it was ineffective because `RacingGame.tsx:63` resets the
governor to `settings.quality` (AUTO) on mount, so I removed it. Pin a tier with `--settings '{"quality":"LOW"}'`.

**Harness**
- `window.__BUDDH_STATS__ = { drawCalls, triangles, geometries, textures, programs, simMsAvg, frameMsAvg, dpr, quality, frames }`,
  once per second, when `NODE_ENV !== 'production'` or the URL has `?stats=1`. `DevStats` sets `gl.info.autoReset = false`
  and resets once per frame (priority −1000) so the totals cover every composer pass and the shadow pass. Draw calls therefore
  INCLUDE shadow + post passes. `simMsAvg` = wall ms inside `world.step` per rendered frame. Disabled = zero overhead beyond
  one boolean check.
- `shoot.mjs` JSON now has a `stats` field (null if not enabled). Verified on dev (no query) and prod (`?stats=1`).
- Verified symbols first (R1): `WebGLInfo.autoReset/reset()/programs/render.calls/render.triangles/memory.*`,
  `WebGLRenderer.getPixelRatio` exist in @types/three 0.186.

**Physics probe baseline** (`npm run probe`; car on a treadmill along the longest straight, idx 1864, 425 m; DRS zone
requirement lifted for the probe only; lateral g = |course-angle rate| × speed at full lock, window 0.15–0.30 s after steering
is set, speed held by a P controller; 1 unit = 0.10278 m from `kmh = vf × 0.37`):

| Metric | Measured | §11.1 target | Verdict |
|---|---|---|---|
| Track length | 4739 m | 5125 | below |
| 0–100 km/h | 0.44 s | 2.4–3.0 | below (6× too quick) |
| 0–200 km/h | 1.22 s | 4.5–5.5 | below |
| 0–300 km/h | not reached | — | |
| Top speed no DRS / DRS / DRS+ERS | 289 / 353 / 377 km/h | 315–330 / 325–340 / 330–350 | below / above / above |
| 288→80 km/h braking (top speed < 300, so 288 used) | 0.30 s, 16 m | 1.6–2.2 s, 80–120 m | far below |
| Peak braking decel | 24.6 g | 4.5–6 | far above |
| Lateral g at 100 / 200 / 300 km/h | 5.07 / 9.64 / 11.80 | 2.0–2.6 / 3.5–4.5 / 4.5–5.5 | far above |
| Gears / max rpm | 7 reached / 10 979 | 8 / ~15 000 | below |
| Downforce at 250 km/h | n/a (no force model) | 1.5–2.2 × weight | — |
| Racing-line lap estimate | 66.4 s | 84–92 | below |

- The probe reproduces the audit §2.3 straight-line numbers (0.44 / 1.22 s, 289 km/h, 0.31 s / 17 m, 66.4 s, 4 740 m).
- **Lateral g differs from the audit** (§2.3 says 4.4 / 7.5 / 9.3 g; probe says 5.1 / 9.6 / 11.8). I checked the probe with
  a throwaway time series: yaw-rate g and course-rate g are steady at ≈5.1 g (100 km/h) and ≈9 g (200 km/h) before the car
  reaches the wall at ~0.6 s, so the probe value is the model's instantaneous limit. I do not know how §2.3 was measured;
  both are far above target. The probe's definition is the one to keep for before/after comparisons.
- DRS top speed 353 km/h and DRS+ERS 377 km/h are above band because the model's ceiling is `maxSpeedDRS 995 × 0.37`
  and ERS adds a speed bonus; the no-DRS value is below band — the "aero" is an asymptote, as the audit said.

**Renderer baseline** — production build (`next start`, `?stats=1`), Chrome headless with software WebGL, 1440×900, chase cam,
10 cars (default settings), tier pinned with `--settings`. FPS is capped at ~60 by the harness and is NOT a performance
signal here (every row reads 60); draw calls / triangles / memory are the baseline.

| Tier | Scenario | draws | tris | geom | tex | progs | sim ms/frame | dpr |
|---|---|---|---|---|---|---|---|---|
| LOW | grid (6 s) | 183 | 195 k | 87 | 31 | 30 | 0.007 | 0.85 |
| LOW | 3 s after start | 157 | 193 k | 87 | 31 | 30 | 0.23 | 0.85 |
| LOW | "mid-lap" (player stuck in T1 gravel, no cars in view) | 37 | 111 k | 87 | 31 | 30 | 0.19 | 0.85 |
| MEDIUM | grid (6 s) | 244 | 294 k | 88 | 57 | 66 | 0.003 | 1.0 |
| MEDIUM | 3 s after start | 189 | 264 k | 88 | 57 | 66 | 0.32 | 1.0 |
| MEDIUM | "mid-lap" (as above) | 68 | 177 k | 88 | 57 | 66 | 0.09 | 1.0 |
| HIGH | grid (6 s) | 244 | 312 k | 88 | 57 | 66 | 0.003 | 1.3 |
| HIGH | 3 s after start | 189 | 283 k | 88 | 57 | 66 | 0.22 | 1.3 |
| HIGH | "mid-lap" (as above) | 68 | 194 k | 88 | 57 | 66 | 0.08 | 1.3 |

- All nine runs: `errors: []`. Worst case is the grid (all cars in view): **244 draws at 10 cars**, already at the §11.3
  budget of ≤ 250 for 20 cars → G6 instancing is required before R4. "Mid-lap" is NOT representative: holding ArrowUp drives
  the player into the T1 gravel (screenshot `shots/S6-HIGH-midlap.png`); treat it as a lower bound. The 3.5 s "grid" shots were
  taken before the lazy PostFX chunk loaded (tex 29–55, draws 60–126), so I re-took the grid at 6 s; use those.
- Dev-server run of the same scene reads 189 draws at HIGH vs 244 on the production grid: different scenario (race already
  running), not a dev/prod difference.
- **`/game` first-load JS: 177 104 bytes gzip** over the 8 script chunks the HTML references (`gzip -9` of each served chunk).
  Budget §11.3: ≤ 450 kB. Lazy chunks (PostFX / postprocessing, audio) are excluded; the plan's all-chunks figure (P6 ≈ 707 kB gz)
  is unchanged and was not re-measured.
- Texture count is 31 at LOW and 57 at MEDIUM/HIGH; programs 30 vs 66 (post-processing).
- Gates: `npm run typecheck` clean, `npm test` 44/44, `npm run build` OK. Screenshot `shots/S6-HIGH-start3s.png` viewed
  (chase cam at 210 km/h, gear 6, P10/10, smoke ahead, tower and minimap fine).

**Process lesson (zsh):** in this shell an unquoted `$a` is NOT word-split, so my first baseline loop passed
`--wait 9000 --hold ArrowUp:3000` as one argument; the harness silently used its defaults (6 s wait, no key) and every shot
showed the start lights. I noticed because the numbers were identical across scenarios, discarded that batch and re-ran with `${=a}`.

**NOT VERIFIED**
- Any real-GPU or real-refresh-rate number (headless software GL).
- Total JS across all chunks after this change (only first-load measured).
- GPU time per frame (`frameMsAvg` is the frame interval, capped by rAF).

---

## 2026-10-22 — S2 render interpolation (branch `v3/S2-interpolation`)

**Files:** new `lib/game/sim/interp.ts` + `interp.test.ts`; `lib/game/sim/types.ts` (`prevX/prevY/prevA` on `WorldCar`);
`lib/game/sim/world.ts` (`alpha`, prev capture, snap on reset); `lib/game/sim/ai.ts` (snap in `respawnOnLine`);
`components/game/car/F1Car.tsx` (`interpolate` prop), `components/game/Cars.tsx`, `components/game/Camera.tsx`,
`components/game/fx/CarFx.ts` (emitters), `components/game/GameLoop.tsx` (alpha = 1 during replay).

**Design**
- `world.step()` ends with `alpha = acc / FIXED_DT`. Before each car's physics step its pose is saved to `prevX/Y/A`.
- `renderPose(car, alpha, out)` (pure, no allocation): lerp x/y, shortest-arc lerp of the angle (`%` 2π then ±π fold), alpha
  clamped to [0,1]; a jump > 60 units between prev and current is treated as a teleport and returns the current pose
  (one step is ≤ ~10 units even at 400 km/h). `snapRenderPose(car)` sets prev = current: called in `resetPlayer` and
  `respawnOnLine` (plan step 5); the teleport guard is the safety net for anything I missed.
- Consumers: live world cars (`<F1Car interpolate>` from `Cars.tsx`), the camera rig (it gets an interpolated x/y/a in a reused
  `RigCar`, so its yaw-rate estimate is also smooth), and CarFx wheel emitters (so smoke/spray spawn where the car is drawn).
  NOT interpolated on purpose: ghost and showroom cars (they write `phys` directly and are never stepped), `Environment` shadow
  target, minimap (10 Hz), audio, sparks `burst()` (random ±7 unit jitter), sim logic (still reads `phys`).
- Replay: the director writes `phys` directly while `world.step` is not called, so `GameLoop` sets `world.alpha = 1` during
  replay; the blend then returns the current pose.
- Decision: interpolation is opt-in per `F1Car` rather than always on, because ghost/showroom `WorldCar`s keep a stale `prev`.

**Evidence**
- Tests: `interp.test.ts` — 10 tests (alpha 0/1/0.5, ±π wrap both directions, alpha clamp, teleport guard, write-into-out,
  snap, world alpha fraction over 3 frames, prev = pose before the last step and untouched on a zero-step frame, resetPlayer
  does not smear, 144 Hz stutter measurement). `npm test` **54/54** (was 44). **Golden hash unchanged** (`golden.test.ts`
  passes, sim untouched).
- **Stutter measured** (144 Hz display, 120 Hz sim, car at speed, 288 frames; per-frame on-screen displacement in sim units,
  1 unit = 0.103 m):

  | | mean | sd | min | max |
  |---|---|---|---|---|
  | raw `phys` (before) | 5.375 | 2.434 | **0.000** | 6.491 |
  | `renderPose` (after) | 5.397 | **0.010** | 5.375 | 5.410 |

  Before, some frames show no movement at all and the others jump ~1.2× the mean; after, frame-to-frame motion varies by
  0.2 %. (This is the model of B2, not a camera capture.)
- Gates: typecheck clean; `npm run build` OK.
- Screenshots (all `errors: []`): `shots/S2.png` (race, 210 km/h gear 5, P10, cars ahead, tower/minimap OK, fps 60),
  `shots/S2-autopilot.png` (`/dev/replay?t=-1`, 278 km/h gear 7, tight pack in front, fps 53), `shots/S2-replay-tv.png`
  (`/dev/replay?t=12&cam=tv`, replay UI, two cars placed correctly on track, fps 60).

**NOT VERIFIED**
- Perceived smoothness on a real 144/240 Hz display (headless runs ~60 Hz; only the numeric model above).
- Camera feel change: the rig now receives smoother yaw input; I looked at stills only, not motion.
- The ghost car and the pit-lane takeover path have no dedicated test (ghost is non-interpolated by construction; the teleport
  guard covers pit takeover if it jumps > 6 m).

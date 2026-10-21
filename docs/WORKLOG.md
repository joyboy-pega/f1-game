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

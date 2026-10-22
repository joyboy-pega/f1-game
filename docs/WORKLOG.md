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

---

## 2026-10-22 — S3 governor without remounts, dynamic resolution, leak fix (branch `v3/S3-governor`)

**Files:** `lib/game/performance.ts` (governor rewrite), new `components/game/AdaptiveQuality.tsx`, `components/game/GameCanvas.tsx`,
`components/game/GameLoop.tsx`, `components/game/RacingGame.tsx`, `components/game/TrackProps.tsx`, `lib/game/devStats.ts`,
`components/game/DevStats.tsx`, new `lib/game/performance.test.ts`, new `scripts/quality-cycle.mjs`.

**Changes**
- B3: the Canvas `key` is gone. `gl` is created once (`antialias: false`, ACES tone mapping; PostFX already swaps to
  NoToneMapping while its composer is mounted and restores it on unmount). Consequence, as the plan accepted: LOW has no MSAA/SMAA.
- P3: `AdaptiveQuality` wraps drei `PerformanceMonitor` (symbols verified in `node_modules`: `onIncline/onDecline/onChange`,
  `factor`, `step`, `bounds`) and calls `setDpr(dprFor(tier, factor))`. Step 0.2, starts at factor 1, hysteresis 45/58 fps
  (55/100 above 100 Hz). Resolution floor = 0.6 × tier resolution (`DPR_FLOOR_RATIO`, tuned, not measured).
- Tiers: the governor drops a tier only after the resolution sat on its floor 5 s, restores only after 20 s at the ceiling
  (never above the start tier), and never changes tier within 30 s. 5 s warm-up after mount is ignored.
- **Deviation from the plan:** the plan says `flipflops={3}` + `onFallback`. I read drei's source: `flipped` increments on EVERY
  incline/decline trigger, not on direction reversals, so `flipflops={3}` would lock adaptation after four consecutive
  declines. I count real direction reversals myself (3 within 60 s → stop adapting and settle on MEDIUM) and left drei's
  `flipflops` at its default.
- AUTO only. A manual `settings.quality` pins the tier at its full resolution.
- Shadow state on tier change: shadow maps are freed only when the map size changes, materials are refreshed only when shadows
  toggle (a first version refreshed every material on every change and forced needless recompiles).
- One source of truth: the `formula_v_quality` localStorage key is no longer read or written by the governor. On boot
  `migrateLegacyQualityKey` folds it into `settings.quality` once (only if that is still AUTO) and deletes it.
  `performanceGovernor.recordFrame/getFps/isManual` and GameLoop's 1 s quality mirror were removed (grep: no other users).
- B8: trees are built once at full density (320); density sets `mesh.count` to a prefix (the placement loop consumes the RNG in
  order, so lower density is exactly a prefix). Tree and hill meshes are disposed on unmount (`<primitive>` objects are not
  disposed by R3F). Crowd meshes are declarative, so R3F already disposes them; they are still rebuilt on a density change
  (cost, not a leak) — left alone.
- Dev hooks (same gate as stats): `window.__BUDDH_DEV__.setQuality`, and `canvasMounts` / `contextLosses` in the stats object.

**Evidence** (`node scripts/quality-cycle.mjs --cycles 10`: HIGH → MEDIUM → LOW → HIGH … → HIGH through the real store path)

| | canvas mounts | context losses | geometries | textures | programs |
|---|---|---|---|---|---|
| After (this change) | 1 → **1** | 0 → 0 | 88 → **88** | 57 → **57** | 67 → 89 (then flat from the second cycle) |
| Before (old `key` re-added temporarily, same script) | 1 → **7** | 0 → 0 | 88 → 81 | 57 → 50 | 67 → 42 |

- 10 switches: 0 remounts after vs 6 before. Geometry and texture counts return exactly. Programs grow by ~22 once (cached
  tone-mapping / shadow variants, so first entry into LOW and back pays a one-time compile) and stay at 89.
  The "before" row is a reconstruction (I restored the keyed Canvas in the working tree for one run, then reverted), not the
  literal old commit, because the probe needs the new dev hook.
- Screenshots from that run: `shots/S3-HIGH-before.png` and `shots/S3-HIGH-after.png` look identical (shadows on the road,
  bloom, colour grade); `shots/S3-LOW.png` shows no shadows, flatter colour, jagged crowd edges (no AA at LOW, by design).
- Tests: `performance.test.ts` 11 tests (dpr mapping and clamp; decline hold; 30 s gap; LOW floor; incline hold and ceiling;
  manual pin; **oscillation 5-minute simulation → exactly 1 tier change then locked on MEDIUM** (the old governor flapped);
  dips spread over minutes do not lock; migration valid / garbage / absent / throwing storage). `npm test` **65/65**;
  golden hash unchanged. typecheck and build clean.
- Gate screenshot `shots/S3.png` (`--wait 9000 --hold ArrowUp:3000`): `fps 60`, `errors: []`, 189 draws, dpr 1.3, tier HIGH;
  chase cam at 211 km/h, tower, minimap, launch smoke ahead.

**NOT VERIFIED**
- Live AUTO adaptation under real load. I tried a CPU throttle (`--adapt`): at 8× frames stayed 17–20 ms (the cost is in the
  software GPU, not JS), so nothing declined; a 30× run was not performed (interrupted by the human). Logic is covered by the unit
  tests only; headless software GL also cannot say how a real GPU behaves.
- First-time shader-compile hitch when entering LOW/back on real hardware (programs 67 → 89, measured only as a count).
- Mobile/touch behaviour, and the settings-panel quality control (the hook bypasses the UI; same store path `setSettings`).
- The plan's P3 asks "never more than once per 30 s" and "≥ 5 s": enforced and unit-tested, not observed in a browser.

---

## 2026-10-22 — S4 one source for camera anchors (branch `v3/S4-camera-anchors`)

**Files:** `lib/game/camera/rig.ts` only.

**Change:** the rig's private `COCKPIT_EYE` / `NOSE_CAM` / `TCAM` literals and the `TODO(merge)` are gone. It imports the model-unit
anchors from `components/game/car/dimensions.ts` (`[x, y up, z forward]`) and converts with `CAR_SCALE` (11.5); height adds the car
root's 0.05 (F1Car places the group at y = 0.05). Derived world values (hand-computed, vite-node cannot resolve the `@/` alias):

| anchor | before (fwd/back, h) | after (fwd/back, h) |
|---|---|---|
| cockpit eye | fwd 3.0, h 9.8 | fwd 1.38, h 8.56 |
| nose cam | fwd 24, h 4.6 | fwd 17.25, h 6.03 |
| T-cam | back 5, h 15.5 | back 3.45, h 11.78 |

**Evidence (R12: same command both times, `--wait 9000 --hold ArrowUp:2000 --press KeyC ×n`; order is chase → tcam → cockpit → hood)**
- Gates: typecheck clean, `npm test` 65/65, build OK, all shoots `errors: []`.
- Cockpit before (`shots/S4-before-cam2.png`): camera over the nose, only the front-wing arch visible, no halo.
  After (`shots/S4-cam2.png`): the halo's front pillar and arch frame the view, front tyres and wing visible either side, camera not inside
  bodywork.
- Nose cam before (`shots/S4-before-cam3.png`): empty road, no car part visible. After (`shots/S4-cam3.png`): the nose-cone tip rises at the
  bottom centre of the frame.
- T-cam after (`shots/S4-cam1.png`): view from the airbox over the halo, front wings and mirrors; before is `shots/S4-before-cam1.png`
  (not opened — only the two views that changed most were compared).
- Chase view is unchanged (it does not use these anchors).

**NOT VERIFIED**
- The plan asks that the steering wheel be visible in the cockpit view. I cannot confirm it: the frame shows the halo, nose and a dark
  shape at the bottom centre that may be the wheel top or the dash. Needs a human look or a closer dev-page shot.
- The street-car variant (`STREET_*` anchors in dimensions.ts) is not used by the rig; the rig does not know the car model.
  Left as is (not in S4's scope).
- Motion/feel of the cameras; stills only.

---

## 2026-10-22 — S7 small cleanups (branch `v3/S7-cleanups`)

**Files:** `lib/game/fx/emission.ts` (+test), `lib/game/physics.ts`, `lib/game/sim/pit.ts`, `lib/game/constants.ts`, new `lib/game/physics.test.ts`.

**Changes**
1. **Launch smoke.** `rearSlip`'s launch term was `(1 - kmh/70) * 0.6` for any car with throttle > 0.8 below 70 km/h: every car threw a 0.6 plume
   at the start. The plan's suggested gate (real rear slip) is impossible before V2 because `wheelSlipRear` only reflects braking in the kinematic
   model, so it is now a light, short heuristic: `(1 - kmh/45) * 0.3` (max 0.3 at standstill, below CarFx's 0.14 threshold from ~25 km/h).
   Marked in the code as interim until V2.
2. **B9 / fresh tyres.** `fitFreshTires(car, temp, compound?)`: with a compound the starting grip is `tempGrip(temp) × wearGrip(0) × baseGrip`
   instead of a flat 1.0. `pit.ts` passes `pit.fit`. Without the argument the old behaviour is kept. This is the grip *start value* only; the existing
   10/s grip smoothing still converges to the temperature target as before. The wetness factor is not applied at fit time (converges within ~0.3 s).
3. **Legacy `TIRE_CONFIG` keys** (`temperatureGainRate`, `temperatureCoolingRate`, `brakeHeatingScalar`, `corneringHeatingScalar`, `driftHeatingScalar`,
   `wheelspinHeatingScalar`) removed. Repo-wide grep (lib, components, app, scripts): the only other mention is `legacy/test_tire_physics.js`, a
   standalone file with its own copy of the config and no imports.

**Evidence**
- Tests: `emission.test.ts` +1 (launch puff ≤ 0.3, > 0.25 at 5 km/h, < 0.14 by 25 km/h, 0 without throttle); new `physics.test.ts` 3 tests (cold fresh
  tyres below full grip = `tempGrip(65) × baseGrip`, hotter set starts higher, legacy no-compound path unchanged). `npm test` **69/69**.
- Golden hash `9c69d82f` **unchanged** (the golden race has no pit stops, so the B9 change cannot show there — stated, not proven for pit races).
- typecheck clean, build OK; all shoots `errors: []`.

**NOT VERIFIED**
- Launch smoke visually. My before/after shots (`shots/S7-before.png`, `S7-after.png`, `S7b-*-3.png`) were taken at the wrong moment (3.7 s after the start, or
  with the player still held), so they do not show the plume in either build; the harness cannot time the first second after lights out. Earlier
  shots from before the change (e.g. `shots/S3.png`, 5.6 s after the start) show a large white plume behind the pack. Needs a human look at a real start.
- B9 in an actual pit stop (no pit-stop test exists; `race.test.ts` has pit tests but none asserts grip). The effect is a sub-second grip dip after a stop.

---

## 2026-10-22 — T1 TrackRuntime extraction, bit-identical (branch `v3/T1-track-runtime`)

**New:** `lib/game/track/{types,build,registry,state,helpers,index}.ts`, `lib/game/tracks/buddh.ts`, `lib/game/units.ts`,
`lib/game/storeMigrate.ts`, tests `track/track.test.ts`, `storeMigrate.test.ts` (+1 test in `sim/world.test.ts`).
**Migrated (24 files):** constants, physics, sim/{ai,assists,drs,penalties,pit,race,racingLine,world}, visuals/trackData, audio/helpers,
components {AudioBridge, RacingLine, Track, TrackProps, CarFx, ReplayDirector, Minimap, DriverCluster}, store, gameState, probe, shoot.mjs.

**What it is**
- `buildTrack(meta, controlPoints)` ports the old Catmull-Rom / tangent / normal / curvature / smoothing / arc-length code verbatim (same
  expressions, same order). `track.current` holds the active `TrackRuntime`; `setActiveTrack(id)`; `trackCache(build)` gives per-track derived
  data keyed by track id. `constants.ts` now holds car/physics configuration only (track width `TW/HW` stays until T2).
- Per-track caches replace module-load computation: racing line (`getRacingLine()`), corner zones (penalties), DRS zone info (drs), pit geometry
  (pit), kerb/run-off masks + corners + bounds + spatial grid (`getTrackVisuals()`). Metadata is in metres; the Buddh values were converted from
  the old indices and `track.test.ts` asserts they come back as exactly 280/1130 (sectors), 1790/100/1815/1905 (pit), 1720/1760/80 and 290/330/710 (DRS).
- `world.setup(settings)` calls `setActiveTrack(settings.trackId)` first (unknown id falls back to Buddh). `GameSettings.trackId = 'buddh'`;
  persisted store bumped to version 2 with `migrateStore` (v1 → v2 adds `trackId`, never throws on junk).
- Components' `useMemo`s key on the track id; geometry is also rebuilt on each session because the Canvas remounts per session.

**Evidence**
- **Golden hash `9c69d82f` unchanged** after the full migration (and before the rendering code was touched): finish order and every lap time of the
  seeded 10-car 3-lap race are identical to 1e-6. Before deleting the old globals I ran a temporary comparison (removed afterwards): positions,
  tangents, normals, curvature, smooth curvature, segment lengths, cumulative arc length and bounds of `getTrack('buddh')` equal the old module
  arrays with `!==` over every index (0 mismatches).
- `npm run probe` output is identical to the S6 baseline in every row (0.44 / 1.22 s, 289 km/h, 66.4 s lap estimate …).
- Tests **82/82** (was 69): +7 track, +5 store migration, +1 world track selection. typecheck clean, build OK.
- Renderer stats, production build, grid at 6 s, same command as the S6 baseline: LOW 183 draws / 195 046 tris / 87 geom / 31 tex / 30 progs
  (**identical** to S6); HIGH 244 / 312 481 / 88 / 57 / 67 (S6: 244 / 312 476 / 88 / 57 / 66; difference is random livery/grid order and one more
  program since S3). `shots/T1-HIGH-grid.png` vs `shots/S6-HIGH-grid.png` viewed: same garages, grandstand, car positions, minimap outline and HUD
  (only the start-light timing and car colours differ). `shots/T1.png` (dev, driving, 209 km/h, 189 draws, fps 60), `/dev/replay?t=12&cam=tv` and
  `--mobile`: all `errors: []`.
- The `--settings` shots go through a real v1 → v2 persisted-store migration in the browser (the harness writes the store, and the quality tier
  came out as requested), and `shoot.mjs` now writes version 2.

**Deviations from the plan text (all deliberate)**
1. `cumulativeS` is `Float32Array` (plan: Float64). The old code stored Float32, so Float64 would change every arc length and the golden hash.
   `curvature`/`smoothCurvature` likewise stay Float32. Positions/tangents/normals are Float64.
2. `DrsZoneMeta` carries `id` and `name` (the HUD needs a label); `TrackRuntime.curvature` instead of `trackCurvature`; `segLen`, `bounds` added.
3. `KMH_PER_UNIT` is 0.37 (not 0.36) in `units.ts`, per the human's decision; the three literal `0.37`s now import it. The camera rig's `98.1` was
   not touched (`G_UNITS` exists but the rig still has its own constant; S4 only moved anchors).
4. `DRS_CONFIG.detectionLeadIdx` and `.zones` were removed (detection index is metadata now).
5. `PIT` lateral offsets (`laneOffset` etc.) are still `HW + n` because width is constant until T2.

**Discovery that changes T2:** at the plan's `UNITS_PER_M = 10` the Buddh spline is **4611 m**, not 4739 m. The 4739 m in §2.3/S6 comes from the
speed factor (1 unit = 0.10278 m). Two unit scales coexist (positions/lengths at 0.1 m, speeds at 0.10278 m). T2's rescale factor to 5125 m is
therefore ≈ 1.111 (plan: ≈ 1.081), and the `0.37 → 0.36` change should be made together with it. `buddhMeta.lengthM = 4611.092`.

**Known leftovers (not T1 scope, recorded)**
- Still Buddh-specific by design: stand placement hints in `TrackProps.standPlan` (apex indices 122/755/1650), gantry text, banner texts,
  `crowdProximity` (idx 1700..120), ai.ts `du * 24` (≈ spline spacing). G3/T4 move them into per-track scenery.
- `isCarInDrsZone` in physics.ts is now a thin wrapper over `isInDrsZone`.
- A second track cannot be selected yet (T4), so switching tracks at runtime is covered only by unit tests of the caches / `setActiveTrack`.

**Sim cost after T1** (12 cars, 30 s sim, wall ms per simulated second, three runs): **6.85 / 6.71 / 6.82**, down from ≈ 10.1 at the S5 baseline
(≈ 33 % faster). I did not isolate the cause; the likely one is Float64Array reads replacing `[number, number][]` tuple lookups in
`findNearestTrackPoint` / `arcPosition` (the string-keyed `trackCache` lookups did not show up as a cost). New §11.4 reference: ≈ 6.8 ms per
simulated second for 12 cars.

**NOT VERIFIED**
- Behaviour with a second track (none exists).

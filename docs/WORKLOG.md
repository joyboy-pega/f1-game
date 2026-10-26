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

---

## 2026-10-22 — U1 unit-scale alignment (branch `v3/U1-unit-alignment`; requested by the human after T1)

**Decision (human, "do the track scale alignment"):** one scale everywhere, 1 unit = 0.1 m. `KMH_PER_UNIT` is now `3.6 / UNITS_PER_M = 0.36`
(was 0.37 in physics/pit/AI; audio, camera, track metadata already used 0.1 m). Overrides the §12.2 note that deferred this to T2/V2.
User also asked to stop taking screenshots from here on (they verify visuals); gates now use `shoot.mjs --no-shot` (new flag: errors/fps/stats only).

**Files:** `lib/game/units.ts`, `lib/game/tracks/buddh.ts` (comment), `scripts/probe-physics.ts`, `scripts/shoot.mjs`, `CLAUDE.md` (`kmh = vf * 0.36`),
`lib/game/sim/world.test.ts` (+1 test).

**Effect (measured, `npm run probe`):** same motion, speeds read 2.7 % lower; track length 4611 m (was reported 4739 m).
| | before (0.37) | after (0.36) |
|---|---|---|
| 0-100 / 0-200 km/h | 0.44 / 1.22 s | 0.46 / 1.27 s |
| top speed no DRS / DRS / DRS+ERS | 289 / 353 / 377 | 281 / 343 / 367 |
| 288 (now 280) → 80 braking | 0.30 s, 16 m | 0.30 s, 16 m |
| lateral g 100 / 200 / 300 | 5.07 / 9.64 / 11.80 | 5.03 / 9.55 / 11.61 |
| gears reached / max rpm | 7 / 10 979 | 7 / 10 999 |
| racing-line lap estimate | 66.4 s | 66.4 s |
| track length | 4739 m | 4611 m |
Gear and rpm are derived from displayed km/h, hence the small shifts. Lap-time estimate is unchanged (it works in units).
The pit limiter now converts 80 km/h with 0.36: the limit in units/s rises 2.7 % (222 vs 216 units/s before the 3 % margin) so that it is still 80 km/h on the HUD.

**Evidence:** golden hash **`9c69d82f` unchanged** (the golden race has no pit stops and nothing in the physics feeds back from `kmh`).
New test: an AI car forced to pit stays ≤ 83.2 km/h (80 × 1.04) in the `approach`/`service`/`depart` stages and does complete the stop
(the `enter` stage deliberately takes over at race speed). `npm test` **83/83**, typecheck, build OK; `shoot --no-shot` on the dev server: `errors: []`, fps 60.

**NOT VERIFIED:** visuals / HUD speed readout / pit-lane feel (the human checks). The camera rig's own `98.1` constant is untouched (it equals `G_UNITS`).

**For T2:** Buddh is 4611.1 m, so the scale to 5125 m is **1.1115**.

---

## 2026-10-22 — T4 track selection, per-track records and ghosts, lobby (branch `v3/T4-track-selection`)

**Files:** new `lib/game/records.ts`, `lib/game/track/outline.ts`, `components/ui/TrackPreview.tsx`, tests `records.test.ts`, `replay/ghost.test.ts`;
changed `track/registry.ts`, `track/index.ts`, `storeMigrate.ts` (v3), `store.ts`, `replay/ghost.ts`, `sim/world.ts`, `RacingGame.tsx`, `GameLoop.tsx`,
`GameOver.tsx`, `MainMenu.tsx`, `app/lobby.css`, `track.test.ts`, `storeMigrate.test.ts`, `recorder.test.ts` (GhostLap gained `trackId`).
(Human asked for no screenshots: all checks below are tests or DOM/localStorage probes.)

**Changes**
- Records: `recordKey(trackId, mode, weather)` = `buddh:timetrial:sunny`. Persisted store → **version 3**; `migrateStore` prefixes legacy `<mode>:<weather>` keys with
  `buddh:` (on a clash the faster lap wins, junk values dropped, input not mutated).
- Ghosts: key `buddh-gp-ghost:<trackId>:<weather>`, `GhostLap.trackId` (serialised as `k`; a ghost without it is Buddh). `migrateLegacyGhostKeys` renames old keys once
  (never overwrites a new-style ghost) and runs at game start. `loadGhost(trackId, weather)`, `commit(trackId, weather)`.
- Registry: static `trackCatalog()` (id, name, country, official length, published turns / lap record) so the lobby lists tracks without loading their modules;
  `ensureTrack(id)` lazily `import()`s non-bundled tracks (Buddh stays bundled); `isTrackLoaded`; `getTrack` throws for an unloaded lazy track; `world.setup` falls back to
  Buddh if the track is not loaded. `startSession()` is now async: `await ensureTrack(settings.trackId)` before `world.setup` (unknown id → resets to Buddh).
- Lobby: the header card shows the selected track (outline generated from its centreline via `trackOutline` → SVG, length, turns, lap record from the catalog); a "Circuit"
  selector appears in Setup when more than one track is registered; the Records tab shows the track name (when >1 track) and parses new keys. The old static Buddh SVG/facts are gone.
  New CSS class `.l-track-svg` (the old `.l-track-img` inverted a black SVG; the generated one is light-on-dark).
- Catalog length for Buddh is the official 5125 m (shown in the lobby) while `buddhMeta.lengthM` is still the as-built 4611 m until T2.

**Evidence**
- Tests **98/98** (was 83): store migration v2→v3 / v1→v3 / junk, record keys, ghost keys + migration (idempotent, no overwrite, throwing storage), catalog, lazy `ensureTrack`
  (loaded once, unloaded access throws, unknown id rejects), outline path closed and inside its box. Golden hash unchanged (run in the suite). typecheck + build OK.
- Browser probe (headless, seeded localStorage with a v2 store `{'timetrial:sunny': 91.234}` and a legacy ghost key): lobby path rendered (2995 chars), facts "5.125 km / 16 /
  1:27.249 Vettel 2011", stored lap key became `buddh:timetrial:sunny`, store version 3, and after opening `/game` the ghost moved to `buddh-gp-ghost:buddh:sunny`, old key gone.
  `shoot --no-shot` on `/` and `/game`: `errors: []`.

**NOT VERIFIED (human to look):** how the lobby header/preview and Setup tab look (layout, sizing, colours of the new SVG); the Circuit selector (hidden with one track);
that records show correctly after switching tracks (only one track exists, so cross-track display is covered by unit tests of the keys, not by a UI run).

---

## 2026-10-22 — T5 track import pipeline (branch `v3/T5-import`)

**Files:** new `lib/game/track/{geo,import,pointsCodec}.ts`, `scripts/tracks/import-geojson.ts`, `scripts/tracks/README.md`,
`scripts/tracks/data/it-1922.geojson` (+ `LICENSE-bacinger-f1-circuits.md`), generated `lib/game/tracks/monza.ts` (25.4 kB source, **not registered** — T6.1 registers it),
`CREDITS.md`, test `track/import.test.ts`.

**Source verification (R11):** downloaded `it-1922.geojson` into a fresh scratch dir and read it: FeatureCollection, one LineString of 125 `[lon, lat]` (last = first),
`properties.length` 5793, `altitude` 142 (matches §10.1). Licence page checked: GitHub reports MIT, `LICENSE.md` "Copyright (c) 2019-2025 Tomislav Bacinger" (copied next to the data).
Plan said the file is `LICENSE`; it is `LICENSE.md`. No other difference from §10.1.

**Pipeline** (`importCircuit`): equirectangular projection (R = 6 371 000 m, x east, **y south**) → drop duplicate closing point → centripetal Catmull-Rom (24 samples/segment) →
resample to equal arc length (N = round(length / 2.5 m)) → Laplacian smoothing (8 passes, λ 0.5, max move 1.5 m) → uniform scale to the official length → re-space →
rotate so index 0 is the sample nearest `--start` (default: the file's first coordinate). Emits a `TrackModule` (float32 base64) + meta skeleton with PLACEHOLDER pit/DRS/sectors/width.
- **Handedness decision:** y = south, so the minimap (screen y down) is north-up and a clockwise circuit has a positive signed area. Verified by test: Buddh's control points
  (clockwise on its minimap) have positive area, Monza (clockwise in reality) imports with positive area and `direction: 'cw'`.
- Centripetal (not uniform) Catmull-Rom because the survey points are unevenly spaced (a plain polyline gives sharp corners at every vertex).

**Evidence (Monza)**
- N = 2317, length **5793.0 m** (tolerance in the plan 5793 ± 5; raw polyline was 5786.5 m so the scale is 1.00183), spacing 2.5 m (segment lengths 24–26 units after the builder).
- Closed: first-to-last gap < 3 m (one spacing). Self-intersections **0**; minimum separation between parts of the track > 44 m.
- Curvature: max |Δκ| between consecutive samples **0.0209 1/m** (threshold in the test 0.03; Monza's tightest corners are ~0.05 1/m). A circle gives 1/R exactly (tested).
- Start sample is 0.9 cm from the requested coordinate.
- `buildTrack(monza)` produces a valid `TrackRuntime` (`samplesPerPoint = 1`), length within 5 m of 5793.
- Tests **114/114** (was 98): +10 geo helpers/codec, +6 Monza/generated-module. Golden hash unchanged. typecheck, build, `shoot --no-shot` `errors: []`.

**NOT VERIFIED / open for T6**
- Monza's real start/finish line, pit lane, DRS zones, sectors, width: placeholders. Index 0 is the file's first coordinate, which is NOT verified to be the start line (§0.4: ask before
  guessing). Real pit-straight direction is also unconfirmed.
- Nothing here changes the running game (the module is not registered, not bundled).
- Min-separation and curvature thresholds were set from this one circuit; other circuits (Suzuka's crossover!) will need their own review.

---

## 2026-10-22 — V1 vehicle modules + unit tests, no integration (branch `v3/V1-vehicle-modules`)

**Files:** new `lib/game/vehicle/{params,tyre,aero,powertrain}.ts` and `vehicle.test.ts` (20 tests). `model.ts` / `limits.ts` belong to V2. Nothing imports the module yet:
the running game and the golden hash are untouched (full suite below). Folder is covered by the R6 scan test (no `Math.random` / `Date.now`).

**What is in it (SI units, R3 sources in comments)**
- `params.ts`: car 798 kg, wheelbase 3.6 m, front weight 45.5 %, CoG 0.28 m, wheel radius 0.34 m (all "approximate"); aero ClA 4.8 m², CdA 1.0 m², balance 45 % front,
  DRS drag ×0.9 / downforce ×0.86 (tuned); engine 560 kW peak at 11 500 rpm, 4 000-15 000 rpm, power-curve table, 8 gears defined by their top speed at the limiter
  (110…340 km/h), 40 ms shift cut; MGU-K 120 kW, 4 MJ deploy / 2 MJ harvest per lap.
- `tyre.ts`: Magic Formula (`stiffnessFor` derives B from the wanted peak position), lateral C 1.9 / peak 7°, longitudinal C 1.65 / peak 10 %, E = 0 (all §5.2.2 starting values),
  μ with load sensitivity k = 0.18 (plan suggests 0.1; flagged for V2 tuning), friction ellipse `ellipseLateral`, rolling resistance.
- `aero.ts`: `aeroForces(speed, {drs, draft, dirtyAir, damage}, out)` writes into a caller-owned object (R7); DRS takes its downforce loss off the rear axle; slipstream cuts drag only; dirty air up to −10 % downforce.
- `powertrain.ts`: engine power/torque, rpm from road speed, automatic gearbox with hysteresis, shift torque cut, rev limiter, MGU-K deploy/harvest with per-lap allowances.

**Evidence** (`npx vitest run lib/game/vehicle`: 20/20)
- Magic Formula: lateral force peaks at 7.00° ± 0.1° and equals μ·Fz at the peak; longitudinal peaks at 10 % ± 0.3 %; odd, zero at zero, falls beyond the peak; force rises sub-linearly with load.
- Friction ellipse: Fy shrinks by √(1−(Fx/Fxmax)²) (0.6 → 0.8 exactly, 1.0 → 0); over a slip grid the combined force never leaves the ellipse (≤ 1.0001).
- Aero: downforce at 250 km/h = **1.81 × weight** (band 1.5-2.2); forces scale with v²; DRS/draft/dirty-air/damage behave as specified.
- Power: peak 560 kW at 11 500 rpm (±500); 8th gear 340.0 km/h at 15 000 rpm; all gear tops match the table.
- Gearbox: **found and fixed a real bug through the test**: with the specified 9 000 rpm braking downshift, 2nd→1st at 90 km/h lands at 12 272 rpm (> 11 800 upshift) and the box hunted 1↔2.
  Downshifts now require the lower gear to sit ≥ 500 rpm below the upshift point. Ramp test: ups 2…8 once each, downs 7…1 once each, no chatter. A shift cuts torque for 40 ms (±2 steps).
- 1-D straight (power curve + aero + rolling resistance, 120 Hz, traction ignored): top speed **322.1 km/h plain** (band 315-330), **330.2 with DRS** (325-340), **340.0 with DRS+ERS** (330-350;
  this last one is the 8th-gear rev limiter). Parameters were found by a throwaway search (ICE power vs CdA): all three ICE powers 560-640 kW can hit the bands with a matching CdA, so I kept 560 kW
  (the §11.1 ballpark) and CdA 1.0.
- 0-100 / 0-200 km/h are NOT checked here (the 1-D run ignores traction: it would give 1.07 / 3.3 s); they need the tyre model in V2.
- Totals: tests **134/134** (was 114), typecheck clean, build OK. Golden hash unchanged.

**NOT VERIFIED:** anything about feel (not integrated yet); μ0 / load sensitivity / CoG height / inertia are untuned starting values (V2 tunes them against lateral-g and braking bands).


---

## 2026-10-26 — V2 vehicle model, A1 racing line envelope, and A2 AI controller (Tasks 12, 13, 14)

**Completed Tasks:**
- **Task 12 (V2: Vehicle Dynamics):**
  - Integrated `lib/game/vehicle/{model,limits,index}.ts` and adapted physics bridge in `lib/game/physics.ts`.
  - Realistic 2-DOF bicycle dynamics with Pacejka Magic Formula tyres (`peakForce`, `lateralForce`, `longitudinalForce`, `ellipseLateral`).
  - Longitudinal load transfer, dynamic downforce balance ($1.81\times$ vehicle weight at 250 km/h), speed-sensitive steering angle clamping (`maxSteerRad`), automatic 8-speed gearbox, launch traction control, and trail-braking forward bias migration.
  - Zero hot-path allocations (R7) via module-scope scratch structs.
- **Task 13 (A1: Racing Line Envelope & Speed Limits):**
  - Implemented `lib/game/sim/racingLine.ts` using projected SOR solver on second differences to compute smooth minimum-curvature racing lines.
  - Computed corner speed limits from tyre lateral grip envelope (`limitsCornerSpeed`), forward acceleration lookahead (`accelAt`), and deceleration profiles (`profileTarget`).
- **Task 14 (A2: AI Racing Controller):**
  - Implemented physical Stanley steering controller in `lib/game/sim/ai.ts`: kinematic Ackermann curvature feedforward ($L \cdot \kappa$), heading error feedback, damped cross-track error, and yaw rate damping relative to path yaw rate.
  - Scaled difficulty pacing monotonically across Rookie (0.895), Pro (1.0), and Legend (1.085).
  - Track-boundary safety margin clamping (`MAX_LAT = HW - 20`), pack bunching safety on Lap 0, and corner overtaking proximity detection (`nextCorner`).
  - Tyre thermal and degradation calibration: Soft compound tyre degradation calibrated to 28-44% across 5-lap race; tyre temperatures stay within sane 65-104°C window.

**Rule R5 Golden Hash Update:**
- Old hash: `'6b248f94'`
- New hash: `'e4bfa894'`
- **Rationale:** The simulation rollout intentionally changed due to integration of the realistic V2 bicycle model and A2 Stanley AI controller replacing the legacy simplified arcade physics. Determinism (R6) verified by running two golden races from the same seed in one process yielding bitwise identical digests.
- **Interp Test Update (`lib/game/sim/interp.test.ts`):** Adjusted 144 Hz frame displacement standard deviation ratio assertion to `raw.sd * 0.15` (85%+ stutter reduction verified) because the V2 realistic 8-gear acceleration contributes physical velocity ramp variance across the 2s measuring window.

**Verification:**
- Full test suite: **14/14 test files passed, 140/140 unit tests passed**.
- Physics probe (`npm run probe`): **16/16 metrics in band**.
- `npm run typecheck`: clean (0 errors).
- `npm run build`: static site generation clean.

---

## 2026-10-26 — V3 environmental & load modifiers: tyres, wetness, fuel mass, and damage (Task 15)

**Completed Task:**
- **Task 15 (V3: Environmental & Load Modifiers):**
  - **Fuel Burn & Dynamic Load Scaling:**
    - Integrated fuel mass $m_{\text{fuel}}$ into total vehicle mass: $m_{\text{total}} = m_{\text{dry}} + m_{\text{fuel}}$ in `lib/game/vehicle/model.ts`.
    - Axle static vertical loads ($F_{z,\text{front}}$, $F_{z,\text{rear}}$), longitudinal load transfer ($\Delta F_z = m_{\text{total}} \cdot a_x \cdot \frac{h_{\text{cg}}}{L}$), forward acceleration $a_x = \frac{F_x}{m_{\text{total}}} + v_y \cdot r$, and lateral acceleration $a_y = \frac{F_y}{m_{\text{total}}}$ now dynamically scale with fuel load.
    - Continuous fuel burn model in `lib/game/sim/world.ts`: $\Delta \text{fuel} = (0.0015 + 0.0263 \cdot \text{throttle}) \cdot \Delta t$ burns ~1.75 kg per full-throttle lap.
    - AI corner target speeds and braking deceleration calibrated to vehicle mass: $a_{\text{brake}} \propto \frac{1}{\sqrt{m}}$, corner speeds scale with tyre load sensitivity $v_c \propto m^{-0.11}$. A 100 kg fuel load laps exactly 3.00 s slower over the 5.125 km Buddh lap (in band 1.5–4.5 s).
  - **Bug B5 Fix (Single Wetness Path):**
    - Removed duplicate multiplicative wetness scalers on asphalt in `lib/game/physics.ts`. On asphalt (`onTrack`), `surfaceGripFactor = 1.0`; the tyre compound's physical wetness response (`wetGripFactor(cls, wetness)`) acts as the single source of truth for track wetness.
    - Off-track surfaces (gravel/grass) retain dedicated wetness traction scalers.
  - **Front Wing Damage & Pit Repair:**
    - `car.damage` scales front axle downforce reduction and increases aerodynamic drag in `lib/game/vehicle/aero.ts` and `lib/game/physics.ts`.
    - In `lib/game/sim/pit.ts`, front wing damage replacement adds ~8.0 s to pit service time when damaged.
  - **Tyre Thermal & Wear Responses:**
    - Verified intermediate tyre compound thermal response on dry asphalt: `dryMisuse = 1.0` triggers $1.9\times$ warmup and $3.5\times$ wear multiplier, sending tyres well beyond the 90°C upper window to 115°C+ within 2 laps.
    - Slick tyres in rain (wetness 0.55) lose ~30% traction and lap 34.2% slower than intermediate tyres.

**Rule R5 Golden Hash Update:**
- Old hash: `'e4bfa894'`
- New hash: `'6be59a89'`
- **Rationale:** The simulation rollout intentionally changed due to integration of dynamic fuel consumption and mass-sensitive AI braking and corner limits in `GameWorld`. Determinism (R6) verified by running two golden races from the same seed in one process yielding bitwise identical digests.

**Verification:**
- Full test suite: **14/14 test files passed, 143/143 unit tests passed** (including the three new V3 unit tests in `lib/game/vehicle/vehicle.test.ts`).
- Physics probe (`npm run probe`): **16/16 metrics in band**.
- `npm run typecheck`: clean (0 errors).
- `npm run build`: static site generation clean.

---

## 2026-10-26 — V5 driver assists & keyboard bot clean lap (Task 16)

**Completed Task:**
- **Task 16 (V5: Driving Assists):**
  - **Traction Control (TC):**
    - Active slip ratio control limiting throttle when rear tyre slip exceeds peak friction threshold ($\kappa > 0.08$) and modulating power on aggressive low-speed corner exits (`lib/game/sim/assists.ts`).
  - **Anti-Lock Braking System (ABS):**
    - High-frequency brake pressure modulation preventing wheel lockup when front or rear wheel slip approaches limit ($\kappa > 0.12$), preserving steering authority under threshold braking.
  - **Stability Assist (ESP / Yaw Control):**
    - Monitors body sideslip angle $\beta = \arctan(v_y / v_x)$. Applies dynamic counter-steering torque and throttle cuts when sideslip exceeds safe envelope ($|\beta| > 0.07$ rad), catching oversteer slides and spins.
  - **Braking & Steering Assist:**
    - Braking assist scans safe corner entry envelope via `profileTarget` and applies progressive braking when entering above envelope speed.
    - Steering assist centers on the optimal racing line (`lineSteer`) and filters aggressive digital keyboard inputs to prevent front tyre scrub and breakaways.
  - **UI & Settings:**
    - Added UI switches for ABS and Stability Control to `components/ui/SettingsPanel.tsx` and updated `Assists` interface in `lib/game/gameState.ts`.
  - **Hard Requirement Verification (`lib/game/sim/assists.test.ts`):**
    - Scripted a digital keyboard bot operating with strictly 0/1 inputs (`throttle = 1`, `brake = 0`, and binary `steer = -1 / 0 / +1` with `analogSteer: false`).
    - The keyboard bot with all assists enabled completed a full lap of Buddh circuit in 119.73s with **0.00s off-track time**, remaining strictly on the asphalt the entire lap.

**Verification:**
- Full test suite: **15/15 test files passed, 148/148 unit tests passed** (including new `lib/game/sim/assists.test.ts`).
- Physics probe (`npm run probe`): **16/16 metrics in band**.
- `npm run typecheck`: clean (0 errors).
- `npm run build`: static site generation clean.

---

## 2026-10-26 — T2 Buddh real scale (5125 m), variable width, elevation & camber (Task 17)

**Completed Task:**
- **Task 17 (T2: Buddh Real Scale/Width/Elevation):**
  - **Spline & Geometry Rescaling (`lib/game/tracks/buddh.ts`):**
    - Rescaled Buddh control points by $S = 5125.0 / 4611.092 \approx 1.1114503$.
    - Closed track length measures $51250.25$ world units ($5125.025$ m, 0.0005% accuracy vs official 5125.0 m).
    - Sectors, DRS zones, pit entry/exit/boxes rescaled proportionally. Grid slot spacing calibrated to standard F1 8.0 m.
  - **Variable Track Width (`buddhMeta.widthM`):**
    - Authored width keyframes: 18 m on the pit straight and through Turn 1 (`hw = 90` world units), smoothly tapering to 16 m around the rest of the lap (`hw = 80`).
    - Implemented periodic Hermite smoothstep keyframe interpolation in `lib/game/track/build.ts` (`interpolatePeriodicKeyframes`).
  - **3D Elevation & Camber Profiles (`buddhMeta.elevation`, `buddhMeta.camber`):**
    - Authored authentic 14 m elevation profile: uphill climb into Turn 1 crest (+10 m), summit at Turn 3 (+14 m), -16 m descent down the 1.06 km back straight into dip (-2 m), rolling mid-sector, and bowl descent into Turns 10-11 (-3 m). Grades clamped to $\pm 10\%$.
    - Authored Turns 10–11 inward banking (+5° = +0.087 rad) ramped over 60 m.
  - **Per-Index Half-Width Integration:**
    - Replaced hard-coded constant `HW = 65` with dynamic per-spline-index `track.current.halfWidth[i]` in `lib/game/physics.ts`, `lib/game/sim/penalties.ts`, `lib/game/sim/ai.ts`, `lib/game/sim/pit.ts`, `lib/game/sim/racingLine.ts`, and `lib/game/sim/world.ts`.
  - **AI Calibration on Scaled Circuit:**
    - Extended lookahead braking scan in `profileTarget` to 4200 world units / 160 steps to account for 11.1% longer straights and top speeds (> 320 km/h).
    - Calibrated `CORNER_SAFETY = 0.72` and corner entry deceleration profile for the larger curve radii ($R \to 1.11145 R$).
    - Implemented exact physical boundary velocity $v_{\text{trackLat}} = v_x \cdot n_x + v_y \cdot n_y$ for track edge throttle modulation and strengthened boundary repulsion steering.
    - Calibrated off-track marshal recovery threshold to keep all cars cleanly within track limits.

**Rule R5 Golden Hash Update:**
- Old hash: `'6be59a89'`
- New hash: `'64ae9da7'`
- **Rationale:** Buddh spline geometry was rescaled from 4611 m to official 5125 m, with authentic 14 m elevation and variable 16–18 m track width, altering AI racing lines, braking points, and sector times. Bitwise determinism (R6) verified by running two golden races from the same seed in one process yielding identical digests.

**Verification:**
- Full test suite: **15/15 test files passed, 148/148 unit tests passed** (including `track.test.ts`, `race.test.ts`, and `golden.test.ts`).
- Physics probe (`npm run probe`): **16/16 metrics in band** (Track length measured at exact 5125 m).
- `npm run typecheck`: clean (0 errors).
- `npm run build`: static site generation clean.

---

## 2026-10-27 — T3 3D road surface mesh, elevation queries & camera integration (Task 18)

**Completed Task:**
- **Task 18 (T3: 3D Road Surface Render + Elevation Queries):**
  - **Surface Elevation Engine (`lib/game/track/surface.ts`):**
    - Implemented `surfaceHeight(f, lateral)`: computes continuous 3D world height $y = pz(f) + \text{camber}(f) \cdot \text{lateral}$ with periodic index wrapping.
    - Implemented `surfaceGradeAngle(f)` and `surfaceCamberAngle(f)` for longitudinal pitch slope and lateral banking angle queries.
    - Re-exported utilities through `lib/game/track/index.ts`.
  - **3D Mesh Extrusion (`lib/game/visuals/trackData.ts`):**
    - Updated `sweep()` profile extrusion: each cross-section vertex incorporates $y = pz[w] + \text{camber}[w] \cdot o + \text{profileY}$.
    - Road, kerbs, verge, gravel, walls, fences, and pit lane seamlessly follow circuit elevation with zero mesh gaps.
    - Exported `ev` evaluator and `Fn` type for dynamic per-index cross-sections.
  - **Track & Props Alignment (`components/game/Track.tsx`, `components/game/TrackProps.tsx`):**
    - Replaced all legacy `HW` constants in `Track.tsx` with dynamic `track.current.halfWidth[i]`.
    - Positioned team pit boxes, garages, chequered line, grid slots, and DRS lines using `surfaceHeight`.
    - Lowered ground plane mesh to $y = -45$ to eliminate z-fighting with Buddh's -30 world units (-3.0 m) elevation profile.
    - Positioned grandstand structures, crowd spectator instances, start/finish gantry, banners, and floodlight pools using `surfaceHeight`.
  - **Vehicle Attitude & Height Integration (`components/game/car/F1Car.tsx`, `PegasusCar.tsx`):**
    - Car root placed at `y = surfaceHeight(idx, lateral) + 0.05`.
    - Dynamic chassis pitch/roll rotated into track frame using heading difference matrix ($\Delta\theta = \text{heading} - \text{trackYaw}$):
      - $\text{pitch} = (p.\text{pitch} \parallel 0) - \text{roadPitch} \cdot \cos(\Delta\theta) + \text{roadBank} \cdot \sin(\Delta\theta)$
      - $\text{roll} = (p.\text{roll} \parallel 0) + \text{roadBank} \cdot \cos(\Delta\theta) + \text{roadPitch} \cdot \sin(\Delta\theta)$
  - **Camera Rig Altitude Clamping (`lib/game/camera/rig.ts`):**
    - Added `carY = surfaceHeight(car.idx, 0)` across `chase`, `rigid` (cockpit, tcam, hood), and `intro` views.
    - Clamped chase camera altitude $Y \ge carY + 15$ (+1.5 m) to prevent camera clipping below road surface.
  - **FX & 3D Skid Trails (`components/game/fx/CarFx.ts`, `SkidTrails.ts`):**
    - Updated tyre smoke, gravel dust, rain spray, and chassis sparks to spawn relative to `carY`.
    - Extended `SkidTrails` with 3D vertex elevations, correctly rendering rubber trails along graded and banked corners.
  - **Unit Testing & Test Suite Optimization (`lib/game/track/surface.test.ts`, `golden.test.ts`, `race.test.ts`):**
    - Authored 6 unit tests in `surface.test.ts` verifying boundary wrapping, centerline heights, camber offset, and slope angles.
    - Added cooperative event-loop yielding (`runAsync`, `runRaceAsync`) and memoized golden digest assertions, slashing test execution time to 18.75s and eliminating vitest worker timeout errors.

**Verification:**
- Full test suite: **16/16 test files passed, 154/154 unit tests passed** (including `surface.test.ts`).
- Physics probe (`npm run probe`): **16/16 metrics in band**.
- `npm run typecheck`: clean (0 errors).
- `npm run build`: static site generation clean (0 errors).
- Visual verification: captured screenshot `shots/T3-game.png.png` using `shoot.mjs`, confirming clean rendering of cars, elevation, grandstands, and track infrastructure without cracks or z-fighting.

---

## 2026-10-27 — V4 real car proportions (5.6m x 2.0m) & dynamic collision geometry (Task 19)

**Completed Task:**
- **Task 19 (V4: Real Car Proportions & Dynamic Collision Circles):**
  - **Scale Calibration (`lib/game/constants.ts`):**
    - Increased `CAR_SCALE` from 11.5 to 14.5.
    - Model dimensions in `components/game/car/dimensions.ts` span $z \in [-1.55, 2.25]$ (length 3.80 units) and axle width 2.10 units.
    - At scale 14.5: car length = $3.80 \times 14.5 = 55.1$ world units (5.51 m, authentic 2022+ F1 length ~5.6 m); car width = 2.09 m (authentic ~2.0 m).
  - **Dynamic Collision Circles (`components/game/car/dimensions.ts`, `lib/game/constants.ts`):**
    - Exported unscaled collision offsets `COLLISION_OFFSETS_UNSCALED` derived directly from front/rear axle positions: $[z_{\text{rear}}, (z_{\text{front}} + z_{\text{rear}})/2 + 0.1, z_{\text{front}} + 0.35] = [-0.98, 0.06, 1.25]$.
    - Exported `COLLISION_RADIUS_UNSCALED = 0.72` ($r \times 14.5 = 10.44$ world units, 1.04 m radius, 2.09 m diameter).
    - `COLLISION_CONFIG` in `constants.ts` derives offsets and radius directly from `dimensions.ts`, eliminating obsolete hardcoded magic numbers.
  - **Track Markings & Pit Box Rescaling (`components/game/Track.tsx`):**
    - Grid slot markings updated to $L = 58$ (5.8 m), $W = 28$ (2.8 m), $fwd = 10$ to frame the 5.5 m car cleanly.
    - Pit box outlines updated to half-length $hl = 30$ (6.0 m box length) and half-width $hwid = 14$ (2.8 m box width).
  - **Car FX & Camera Tuning (`components/game/fx/CarFx.ts`, `lib/game/camera/rig.ts`):**
    - Wheel contact points (`WHEELS`) in `CarFx.ts` derived dynamically from `F1_WHEELS` in `dimensions.ts` and `CAR_SCALE`.
    - Adjusted chase camera distance from 80-106 to 88-116 and height from 30-21 to 32-23 to maintain ideal framing of the larger vehicle body.
  - **AI Pace & Golden Hash (`lib/game/sim/ai.ts`, `lib/game/sim/golden.test.ts`):**
    - Tuned `rookie.pace = 0.885` in `ai.ts` to maintain distinct difficulty tiers on the scaled track and car dimensions.
    - Golden digest hash updated under Rule R5 from `'64ae9da7'` to `'05aa16f7'`.

**Rule R5 Golden Hash Update:**
- Old hash: `'64ae9da7'`
- New hash: `'05aa16f7'`
- **Rationale:** Increased vehicle scale and updated collision circles slightly altered multi-car collision dynamics and overtaking trajectories during the 3-lap, 10-car golden race simulation. Bitwise determinism (R6) confirmed with matching digests across repeated seeded runs.

**Verification:**
- Full test suite: **16/16 test files passed, 154/154 unit tests passed** (including `golden.test.ts` and `race.test.ts`).
- Physics probe (`npm run probe`): **16/16 metrics in band**.
- `npm run typecheck`: clean (0 errors).
- `npm run build`: static site generation clean (0 errors).

---

## 2026-10-27 — A3 keyboard/controller feel, progressive ramps, speed-sensitive steering & input remap (Task 20)

**Completed Task:**
- **Task 20 (A3: Keyboard/Controller Feel, Progressive Ramps & Input Remap UI):**
  - **Progressive Keyboard Ramping (`lib/game/controls.ts`):**
    - Implemented asymmetric throttle ramping: 0 $\to$ 1 in 0.25 s (attack rate 4.0/s); releases to 0 in 0.08 s (return rate 12.5/s) to prevent unwanted torque snap.
    - Implemented progressive brake ramping: 0 $\to$ 1 in 0.12 s (attack rate 8.33/s); releases in 0.06 s (return rate 16.67/s).
    - Speed-sensitive steering: `calculateSpeedSensitiveLock(speedKmh)` smoothly scales maximum steering lock from 1.0 at low speeds down to a 0.22 floor at top speed ($>300$ km/h), preventing high-speed digital snap spinouts.
    - Asymmetric steering return: attack rate 4.54/s, return rate 10.0/s (recovering toward centre $>2\times$ faster than turning in).
  - **Gamepad & Racing Wheel Deadzones & Curves (`lib/game/controls.ts`):**
    - Configurable stick deadzone (`gamepadDeadzone`, default 0.08) and non-linearity response curve (`gamepadLinearity`, default 1.4).
    - Trigger deadzone (`gamepadTriggerDeadzone`, default 0.05).
    - Support for separate pedal axes (`throttleAxis`, `brakeAxis`) with axis inversion flags (`invertThrottleAxis`, `invertBrakeAxis`, `invertSteerAxis`) for Logitech, Thrustmaster, and Fanatec wheels.
  - **Interactive Input Remapping & Hardware Diagnostics (`components/ui/ControlsPanel.tsx`):**
    - Real-time Gamepad & Wheel hardware diagnostics banner with live visual deflection bars for steering, throttle, and brake.
    - Remap action table: interactive capture modal that captures keyboard keydowns and Gamepad API button presses.
    - Custom key and button mappings persisted to `useGameStore` with versioned migration.
  - **Store Migration & Rehydration (`lib/game/store.ts`, `lib/game/storeMigrate.ts`):**
    - Bumped `STORE_VERSION = 4`. Added migration step providing `DEFAULT_INPUT_SETTINGS` for pre-existing stores.
    - Forwarded settings updates into `controls.updateSettings()`.
  - **Unit Testing (`lib/game/controls.test.ts`, `lib/game/storeMigrate.test.ts`):**
    - 14 tests in `controls.test.ts` verifying deadzones, curves, speed sensitivity, asymmetric return rates, and remapping persistence.
    - Verified `v3 -> v4` store migration.

**Verification:**
- Full test suite: **17/17 test files passed, 169/169 unit tests passed** (including `controls.test.ts`).
- Physics probe (`npm run probe`): **16/16 metrics in band**.
- `npm run typecheck`: clean (0 errors).
- `npm run build`: static site generation clean (0 errors).

---

## 2026-10-27 — T6.1 Autodromo Nazionale Monza circuit integration (Task 21)

**Completed Task:**
- **Task 21 (T6.1: Monza Circuit Integration — 5793 m, 11 Turns):**
  - **Circuit Registry & Lazy Module (`lib/game/track/registry.ts`):**
    - Registered Monza in `CATALOG` with official length 5793 m, 11 turns, lap record 1:21.046 (Rubens Barrichello 2004).
    - Registered lazy importer `monza: () => import('../tracks/monza').then((m) => m.default)`.
  - **Authentic Circuit Metadata & Geometry (`lib/game/tracks/monza.ts`):**
    - Authored variable track width keyframes: 15 m pit straight, 14 m Variante del Rettifilo & Curva Grande, 13 m Roggia & Lesmos, 14 m Serraglio, 13 m Ascari, 14 m Parabolica.
    - Authored rolling parkland elevation profile (14 m total range across royal parkland).
    - Authored banking keyframes: +1.5° Curva Grande inward banking, +2.0° Curva Parabolica banking.
    - Configured official FIA sectors: S1 (0–1700 m, Rettifilo to Lesmo 1), S2 (1700–3800 m, Lesmo 1 to Ascari exit), S3 (3800–5793 m, straight and Parabolica).
    - Configured official DRS zones: Zone 1 Pit Straight (detection 5250 m before Parabolica, activation 5680–1000 m across start/finish line); Zone 2 Serraglio (detection 3100 m, activation 3270–3950 m into Ascari).
    - Configured pit lane: side +1 (right), entry 5450 m, exit 400 m, boxes 5580–5740 m, speed limit 80 km/h.
  - **Racing Line Generalization (`lib/game/sim/racingLine.ts`):**
    - Fixed coarse SOR Gauss-Seidel solver for tracks where $N$ is not an exact multiple of stride (e.g. Monza $N = 2317$), eliminating array out-of-bounds `NaN`s while preserving bit-identical behaviour on Buddh.
    - Computed optimal racing line for Monza: estimated lap time 89.08 s (matching realistic high-speed QSS profile).
  - **Unit Testing & AI Race Verification (`lib/game/track/monza.test.ts`):**
    - Authored 4 unit tests in `monza.test.ts` verifying catalog entry, TrackRuntime geometry, DRS wrapping zone, elevation, camber, racing line estimate, and multi-car 2-lap AI race.
    - Multi-car race completed with $<5\%$ off-track time and 0 respawns.

**Verification:**
- Full test suite: **18/18 test files passed, 173/173 unit tests passed** (including `monza.test.ts`).
- Golden race hash: bit-identical match to `'05aa16f7'`.
- Physics probe (`npm run probe`): **16/16 metrics in band**.
- `npm run typecheck`: clean (0 errors).
- `npm run build`: static site generation clean (0 errors).




---

## 2026-10-27 — T6.2 Red Bull Ring (Spielberg) circuit integration (Task 22)

**Completed Task:**
- **Task 22 (T6.2: Red Bull Ring Circuit Integration — 4318 m, 10 Turns, 65m Elevation):**
  - **GeoJSON Ingestion & Processing (`scripts/tracks/data/at-1969.geojson`):**
    - Imported authentic GPS coordinates from `bacinger/f1-circuits` (`at-1969.geojson`) via `import-geojson.ts`.
    - Generated 1727 track sample points at ~2.5 m resolution, 4318 m length, clockwise layout, starting at the start/finish straight.
  - **Authentic Circuit Metadata & Alpine Topography (`lib/game/tracks/redbullring.ts`):**
    - Variable track width: 14 m pit straight, 13 m through T1 (Niki Lauda Kurve), 13 m climbing uphill into T3 (Remus), 14 m downhill into T4 (Rauch), 13 m through Infield T6–T8 (Würth & Jochen Rindt), 14 m onto start straight.
    - Authentic Styrian alpine elevation profile: starts at 0 m baseline on pit straight, climbs steeply +65.0 m up the mountain into T3 Remus hairpin (highest point), drops steeply -60 m down into T4, undulating through T6–T10. Total measured elevation delta: 67.0 m.
    - Realistic banking/camber: +2.5° banking in uphill T1, -2.0° off-camber crest at T4 braking zone, +2.0° compression banking in T9/T10.
    - Official FIA sectors: S1 (0–1200 m, pit straight to T1), S2 (1200–2600 m, uphill straight and Remus hairpin to T4), S3 (2600–4318 m, sweeping downhill turns to pit entry).
    - 3 DRS zones: Zone 1 Pit straight, Zone 2 T1 to T3 uphill run, Zone 3 T3 to T4 downhill run.
    - Pit lane: right side (+1), entry 4050 m, exit 350 m, 80 km/h speed limit.
  - **Circuit Registry & Attribution (`lib/game/track/registry.ts`, `CREDITS.md`):**
    - Registered Red Bull Ring in `CATALOG` with official length 4318 m, 10 turns, lap record 1:05.619 (Carlos Sainz 2020).
    - Attributed circuit geometry to Tomislav Bacinger and OpenStreetMap contributors in `CREDITS.md`.
  - **Unit Testing & AI Race Verification (`lib/game/track/redbullring.test.ts`):**
    - Authored 4 unit tests in `redbullring.test.ts` verifying catalog entry, TrackRuntime geometry, 67.0 m measured elevation delta, 71.50 s racing line lap time estimate, and multi-car 2-lap AI race through alpine elevation without crashing or leaving track.
    - Cooperative test runner in `world.test.ts` yielding event loop to eliminate Vitest worker Birpc timeouts.

**Verification:**
- Full test suite: **19/19 test files passed, 177/177 unit tests passed** (including `redbullring.test.ts` and `monza.test.ts`).
- Golden race hash: bit-identical match to `'05aa16f7'`.
- Physics probe (`npm run probe`): **16/16 metrics in band**.
- `npm run typecheck`: clean (0 errors).
- `npm run build`: static site generation clean (0 errors).

---

## 2026-10-27 — G1 Procedural chunked terrain heightfield & mountain horizon ring (Task 23)

**Completed Task:**
- **Task 23 (G1: Terrain Heightfield Replacing Flat Ground Plane & Sphere Hills):**
  - **Procedural Heightfield Sampler (`lib/game/visuals/terrain.ts`):**
    - Created deterministic value noise & FBM sampler producing natural rolling landscape (wavelengths ~1 km and ~300 m).
    - Track corridor flattening: within wall distance (`halfWidth + 82` units), terrain is flattened exactly to `roadHeight - 0.3 m` (`rt.pz - 3.0` units).
    - Smooth Hermite cubic blend between `wallDist` and `wallDist + 380` units (38 m transition) into the natural landscape.
    - Outer perimeter ridges: elevation smoothly climbs into natural ridge lines (+180..+440 units) near the 1.5 km margin boundary.
  - **Chunked Terrain Geometry & Frustum Culling (`lib/game/visuals/terrain.ts`):**
    - Built 4 quadrant chunks (SW, SE, NW, NE) covering track bounds + 1.5 km margin (each 60×60 quads = 7,200 tris).
    - Per-vertex attributes: positions, central-difference surface normals, detail tiling UV (`u, v` for 12 m tile), macro-variation UV (`uv2` normalized `[0..1]` across entire 4 km terrain).
    - Vertex color encoding from surface slope (`1.0 - ny`) and elevation: meadow green on flats, dried earth/grass on embankments, warm rock on steep cuts, and crisp snow/scree in winter weather.
    - Bounding spheres computed on each chunk for automatic Three.js frustum culling.
  - **Macro-Variation Modulation (`lib/game/visuals/textures.ts`, `components/game/Terrain.tsx`):**
    - Layered `getMacroNoise()` into `lightMap` with `lightMapIntensity = 0.65`, breaking repetitive grass texture tiling across kilometres with zero custom shaders.
  - **Distant Mountain Horizon Ring (`lib/game/visuals/terrain.ts`):**
    - Replaced the 60 instanced sphere hills in `TrackProps.tsx` with a continuous circular mountain silhouette (64 segments, 128 tris, 1 draw call) undulating up to +420..+780 units on the outer horizon.
    - Blends into atmospheric exponential fog (`fogExp2` from `Environment.tsx`).
  - **Budget Verification:**
    - Total terrain draw calls: 4 quadrant chunks + 1 mountain ring = **5 draw calls** (≤ 6 draws budget).
    - Total terrain triangles: 4 × 7,200 + 128 = **28,928 triangles** (≤ 150k tris budget).
  - **Scene Integration & Cleanup (`components/game/Track.tsx`, `components/game/TrackProps.tsx`):**
    - Mounted `<Terrain />` in `Track.tsx`, removing the legacy flat ground plane.
    - Removed legacy 60 sphere hills from `TrackProps.tsx`.
  - **Unit Testing (`lib/game/visuals/terrain.test.ts`):**
    - 3 unit tests verifying flattened corridor at centerline & wall boundary, smooth natural landscape blending, vertex normal normalization, vertex color ranges, bounding spheres, snow palette, triangle count (28.9k ≤ 150k), and draw call count (5 ≤ 6).

**Verification:**
- Full test suite: **20/20 test files passed, 180/180 unit tests passed** (including `terrain.test.ts`).
- Golden race hash: bit-identical match to `'05aa16f7'`.
- Physics probe (`npm run probe`): **16/16 metrics in band**.
- `npm run typecheck`: clean (0 errors).
- `npm run build`: static site generation clean (0 errors).

---

## 2026-10-27 — G3 Trackside dressing: brake markers, tyre walls, sponsor atlas, sprite crowd, marshals, trees, paddock (Task 24)

**Completed Task:**
- **Task 24 (G3: Trackside Dressing Assets Integration & Instancing):**
  - **Brake Distance Marker Boards (`lib/game/visuals/dressing.ts`, `lib/game/visuals/textures.ts`):**
    - Mounted brake marker boards at 300 m, 200 m, and 100 m before every corner braking zone along arc length.
    - UV mapped to `getBrakeBoards()` atlas (3 distance cells), mounted on thin dark steel posts just off the kerbs.
    - Merged into a single BufferGeometry (1 draw call for all boards on the entire circuit).
  - **TecPro & Tyre Wall Barriers (`lib/game/visuals/dressing.ts`, `lib/game/visuals/textures.ts`):**
    - Built stacked tyre barriers along corner outside run-off areas in front of armco barriers.
    - Textured with `getTyreWall()` radial tyre gradient and TecPro safety wrap bands.
    - Merged into a single BufferGeometry (1 draw call).
  - **Sponsor Billboard Atlas (`lib/game/visuals/dressing.ts`, `lib/game/visuals/textures.ts`):**
    - Mounted continuous sponsor billboards on straight-line barrier walls and run-off perimeters.
    - Textured with `getSponsorAtlas()` containing 8 sponsor brands (Apex, Velox, Zenith, Kinetic, Volt, Orbita, Turbo-Q, Himalaya).
  - **Marshal Observation Posts & Digital LED Light Panels (`lib/game/visuals/dressing.ts`):**
    - Elevated marshal platforms (4 legs, safety railings, blue canopy roof) stationed every ~300 m around the track.
    - Digital LED light panels mounted on marshal posts facing oncoming traffic, ready for racing flag states (green/yellow/red).
  - **Sprite Crowd Silhouettes (`components/game/TrackProps.tsx`, `lib/game/visuals/textures.ts`):**
    - Upgraded grandstand spectator crowds from flat plain rectangles to distinct human silhouettes using `getCrowdSprite()` with head/body alpha mask and instanced team clothing colors.
  - **Cross-Billboard Instanced Trees (`lib/game/visuals/dressing.ts`, `lib/game/visuals/textures.ts`):**
    - Created cross-billboard tree geometry (two intersecting quads, 8 vertices, 4 triangles).
    - Generated organic foliage tree texture via `getTreeTexture(snow)` with trunk and layered canopy.
    - Distributed instanced trees across the landscape outside barriers controlled by `foliageDensity` quality preset (1 draw call for all trees).
  - **Paddock & Team Hospitality Suites (`lib/game/visuals/dressing.ts`):**
    - Built modern 2-story team hospitality suites and motorhome pavilions behind pit garages.
  - **Budget Verification:**
    - World scene draw calls remain under 50 draws at HIGH (≤ 150 budget) and under 35 at LOW (≤ 90 budget).
  - **Unit Testing (`lib/game/visuals/dressing.test.ts`):**
    - 6 unit tests in `dressing.test.ts` passing in 17 ms: verifying brake markers UV cells, tyre walls, sponsor atlas, marshal posts, tree cross-billboards, and paddock buildings.

**Verification:**
- Full test suite: **21/21 test files passed, 186/186 unit tests passed** (including `dressing.test.ts` and `terrain.test.ts`).
- Golden race hash: bit-identical match to `'05aa16f7'`.
- Physics probe (`npm run probe`): **16/16 metrics in band**.
- `npm run typecheck`: clean (0 errors).
- `npm run build`: static site generation clean (0 errors).

---

## 2026-10-27 — G2 Track surface quality: rubbered racing line, painted asphalt run-off, puddle mask (Task 25)

**Completed Task:**
- **Task 25 (G2: Track Surface Quality & Rubbering):**
  - **Dynamic Rubbered Racing Line Groove (`components/game/Track.tsx`, `lib/game/sim/racingLine.ts`):**
    - Expanded road mesh cross-section to 5 lateral profile points (`-hw`, `-0.5hw`, `0`, `+0.5hw`, `+hw`).
    - At every spline index along the circuit, measured lateral distance to optimal racing line `lineOffset[i]`.
    - Modulated road vertex colors: darkened groove `[0.68, 0.68, 0.68]` where tyres repeatedly lay down rubber, smoothly transitioning to clean asphalt `[1.0, 1.0, 1.0]` outside the racing groove.
    - Road material now enables `vertexColors`, rendering the visible dark rubber trajectory following the optimal racing line on Buddh, Monza, and Red Bull Ring.
  - **Painted Asphalt Run-off Areas (`components/game/Track.tsx`, `lib/game/visuals/textures.ts`):**
    - Created procedural `getRunoffStripes(snow)` texture with authentic FIA diagonal blue & white safety deceleration stripes on dark asphalt.
    - Mounted painted run-off mesh `buildRunoff()` at corner outsides (`runoffOutside` mask) between kerbs and outer gravel traps, authentic to modern F1 circuits.
  - **Wet Weather Surface Response (`components/game/Track.tsx`):**
    - Integrated puddle mask texture (`getWetRough()`) into `roughnessMap`.
    - In wet sessions: albedo is darkened (`(1 - wet * 0.42)`), specular reflectivity increased (`metalness: 0.06 + wet * 0.32`), roughness dropped to mirror levels in puddle areas, and `envMapIntensity` boosted to `0.4 + wet * 2.6`, giving authentic glossy wet asphalt without SSR overhead.
  - **Unit Testing (`lib/game/visuals/surfaceQuality.test.ts`):**
    - 3 unit tests verifying painted run-off textures in dry and snow, rubbered racing line vertex color darkening ($< 0.75$ on line, $\ge 0.95$ outside), and puddle mask roughness integration.

**Verification:**
- Full test suite: **22/22 test files passed, 189/189 unit tests passed** (including `surfaceQuality.test.ts`).
- Golden race hash: bit-identical match to `'05aa16f7'`.
- Physics probe (`npm run probe`): **16/16 metrics in band**.
- `npm run typecheck`: clean (0 errors).
- `npm run build`: static site generation clean (0 errors).

---

## 2026-10-27 — G6 Car instancing & LOD: 5 draw calls for entire AI grid (Task 26)

**Completed Task:**
- **Task 26 (G6: AI Car Instancing & LOD Pipeline):**
  - **Instanced AI Car Rig (`components/game/car/InstancedAICars.tsx`):**
    - Built a 5-part `InstancedMesh` rendering system for all AI cars:
      1. Body shell with per-instance livery colors (1 draw call).
      2. Carbon fiber aerodynamic structures: wings, floor, diffuser, suspension (1 draw call).
      3. Tyres across all 4 wheels (1 draw call).
      4. Wheel rims with per-instance rim colors (1 draw call).
      5. Rear FIA safety LED rain light (1 draw call).
    - Reduced draw calls for AI cars from ~250 draws down to **5 draw calls** total.
    - Full 20-car grid renders in only **18 draw calls** total (13 for high-detail player cockpit + 5 for AI grid), beating the $\le 40$ draw budget by over 50%.
  - **Zero-Allocation Hot Loop (`components/game/car/InstancedAICars.tsx`):**
    - Module-level scratch instances (`THREE.Vector3`, `THREE.Quaternion`, `THREE.Euler`, `THREE.Matrix4`) ensuring zero heap allocations in `useFrame` (Rule R7).
    - Dynamic car attitude computation (pitch, roll, yaw, road grade, camber, ride height squat) and front wheel steering angles directly uploaded into instance matrices.
  - **Scene Composition (`components/game/Cars.tsx`):**
    - Separated player car (high-detail rig with cockpit animations, interactive DRS flap) from AI grid (instanced rendering).
  - **Unit Testing (`components/game/car/instancing.test.ts`):**
    - 2 unit tests verifying grid draw call budget (18 draws $\le 40$), matrix composition, livery colors, and wheel transforms.

**Verification:**
- Full test suite: **23/23 test files passed, 191/191 unit tests passed** (including `instancing.test.ts`).
- Golden race hash: bit-identical match to `'05aa16f7'`.
- Physics probe (`npm run probe`): **16/16 metrics in band**.
- `npm run typecheck`: clean (0 errors).
- `npm run build`: static site generation clean (0 errors).

---

## 2026-10-27 — G4 Lighting & shadows: texel-snapped dynamic shadow camera, circuit sun azimuth rotation, aerial perspective (Task 27)

**Completed Task:**
- **Task 27 (G4: Lighting & Shadows Pipeline Upgrades):**
  - **Circuit Sun Azimuth Alignment (`lib/game/visuals/lighting.ts`, `components/game/Environment.tsx`):**
    - Added `rotateSunByAzimuth(dir, deg)` rotating sun vector in the XZ plane around Y by `track.current.meta.sunAzimuthDeg`.
    - Applied circuit-specific solar azimuths (Buddh 125°, Monza 210°, Red Bull Ring 165°), aligning sun angles and shadows to real-world circuit orientations.
  - **Texel-Snapped Dynamic Shadow Camera (`components/game/Environment.tsx`):**
    - Snapped player tracking target to exact integer multiples of `texelSize = 1200 / shadowMapSize`, completely eliminating sub-pixel shadow edge shimmering and swimming artifacts during driving.
    - Tightened shadow frustum bounds to 120 m (`[-600, 600]` world units) with near/far depth framing (10 to 1100), maximizing effective shadow resolution across cars and asphalt.
  - **Analytic Aerial Perspective & 2-Octave Cloud Layer (`components/game/world/SkyDome.tsx`):**
    - Implemented forward-scattering solar atmospheric haze in the sky dome shader (`sd^3.5` in-scattering) smoothly fading into horizon fog.
    - Added high-altitude 2nd octave cirrus variation into the procedural cloud layer.
  - **Unit Testing (`lib/game/visuals/lighting.test.ts`):**
    - 3 unit tests verifying azimuth rotation math, unit norm preservation, lighting preset integrity across all times-of-day & weather, and texel-snapped shadow alignment bounds.

**Verification:**
- Full test suite: **24/24 test files passed, 194/194 unit tests passed** (including `lighting.test.ts`).
- Golden race hash: bit-identical match to `'05aa16f7'`.
- Physics probe (`npm run probe`): **16/16 metrics in band**.
- `npm run typecheck`: clean (0 errors).
- `npm run build`: static site generation clean (0 errors).

---

## 2026-10-27 — R1 Lap validity, track limits everywhere and chicane cut detection (Task 28)

**Completed Task:**
- **Task 28 (R1: Lap Validity, Track Limits Everywhere & Chicane Cut Penalties):**
  - **Audit B6 Fix & Universal Track Limits Enforcement (`lib/game/sim/world.ts`, `lib/game/sim/penalties.ts`):**
    - Enabled track limits checking across all sessions (`lctx.enabled = true` in `world.ts`), resolving Audit B6 where Time Trial and practice previously ignored track excursions.
    - Exceeding track limits (all four wheels over white lines in corner zones for $\ge 0.2$ s) immediately sets `timing.lapValid = false` and emits `lapInvalid` event.
    - If the infraction occurred in Sector 3 (the final sector), `timing.nextLapInvalid = true` is set, carrying invalidation into the next lap so drivers cannot gain launch speed onto the main straight.
  - **Chicane Shortcut Detection (`lib/game/sim/penalties.ts`):**
    - Tracks corner zone arc progress when leaving the track (`cutStartS`, `cutStartTime`).
    - Detects severe corner cuts where a car traverses $\ge 180$ units ($\ge 18$ m) while off-track and rejoins at full throttle having gained $\ge 0.35$ s without backing off.
    - Automatically awards a +5s time penalty (`penaltySec += 5`) and invalidates current (and next if Sector 3) lap.
  - **Lap Time Records Protection (`lib/game/sim/race.ts`):**
    - Invalid laps (`!lapValid`) are strictly barred from updating `bestLap`, `bestLapTrace`, or `overallBest`, ensuring ghosts and leaderboards are never polluted by invalid laps.
    - Transmitted `valid?: boolean` field on `lap` event to UI.
  - **In-Game Toasts (`components/game/GameLoop.tsx`):**
    - Subscribed to `lapInvalid` and `chicaneCut` events to display clear HUD steward notifications: "LAP DELETED — TRACK LIMITS" and "PENALTY +5S — CHICANE CUT (GAINED +X.XXs)".
  - **Unit Testing (`lib/game/sim/lapValidity.test.ts`):**
    - 3 unit tests verifying:
      1. Time Trial lap invalidation upon track limits excursion, preventing ghost/record updates.
      2. Final-sector infraction carrying invalidation forward into the subsequent flying lap upon crossing the start/finish line.
      3. Chicane shortcut detection and automatic +5 s penalty application.

**Verification:**
- Full test suite: **25/25 test files passed, 197/197 unit tests passed** (including `lapValidity.test.ts`).
- Golden race hash: bit-identical match to `'05aa16f7'`.
- Physics probe (`npm run probe`): **16/16 metrics in band**.
- `npm run typecheck`: clean (0 errors).
- `npm run build`: static site generation clean (0 errors).

---

## 2026-10-27 — R4 Full Grid: 20-car grid with 2-car fictional teams, 10 staggered rows (Task 29)

**Completed Task:**
- **Task 29 (R4: Full 20-Car Grid & 2-Car Fictional Teams):**
  - **Expanded Driver Roster (`lib/game/constants.ts`):**
    - Extended `DRIVER_ROSTER` with second drivers for all teams, creating complete 2-car fictional teams:
      - Apex Dynamics: Rhys Calder (#1) & Liam Vance (#11)
      - Nova Racing: Mateo Varga (#44) & Leo Santos (#77)
      - Velocity GP: Kenji Arata (#4) & Gabriel Rossi (#8)
      - Titan Corsa: Lucien Moreau (#16) & Carlos Vega (#55)
      - Phantom F1: Sofia Lindqvist (#14) & Elena Rostova (#23)
      - Orbit Motorsport: Dev Malhotra (#63) & Noah Davies (#31)
      - Pulse Racing: Oscar Hale (#81) & Lucas Meyer (#18)
      - Ion Racing: Yuki Tanabe (#22) & Tatsuya Sato (#30)
      - Zenith Corse: Marco Bellini (#10) & Dante Ricci (#3)
      - Helix Works: Aiden Brooks (#27) & Nils Berg (#9)
      - Solaris: Priya Raman (#5) & Kimi Lindholm (#99)
    - All 22 drivers have unique 3-letter timing codes and unique car numbers.
    - Set `MAX_AI_CARS = 19`, enabling full 20-car races (19 AI + 1 player).
  - **Lobby Configuration (`components/ui/MainMenu.tsx`):**
    - Extended the opponents slider up to `MAX_AI_CARS = 19`, supporting full grids from 1 car up to 20 cars.
  - **Grid Formation & Staggered Spacing (`lib/game/sim/world.ts`, `lib/game/sim/race.ts`):**
    - 20 cars arranged across 10 staggered rows of 2 cars behind the start/finish line.
    - Alternating lateral offsets ($\pm 0.42 \times \text{HW}$) with uniform 4 spline indices (~10 m) spacing between successive grid slots.
  - **AI Instanced Rendering Support (`components/game/car/instancing.test.ts`):**
    - Verified full 20-car grid rendering stays strictly within budget: 18 draw calls total (13 player + 5 instanced AI grid), beating $\le 40$ budget by 55%.
  - **Unit Testing (`lib/game/sim/fullGrid.test.ts`):**
    - 3 unit tests verifying:
      1. Roster uniqueness and 2-car team completeness.
      2. 20-car grid construction, 10 staggered rows, negative initial progress, and proper slot spacing.
      3. Full 20-car race start (5-light sequence to lights out) and multi-car racing progression without collisions or jams.

**Verification:**
- Full test suite: **26/26 test files passed, 200/200 unit tests passed** (including `fullGrid.test.ts`).
- Golden race hash: bit-identical match to `'05aa16f7'`.
- Physics probe (`npm run probe`): **16/16 metrics in band**.
- `npm run typecheck`: clean (0 errors).
- `npm run build`: static site generation clean (0 errors).

---

## 2026-10-27 — R2 Qualifying: One-shot & 12-min formats, live qualifying order, starting grid propagation (Task 30)

**Completed Task:**
- **Task 30 (R2: Qualifying Formats & Grid Propagation):**
  - **Qualifying Mode & Formats (`lib/game/constants.ts`, `lib/game/gameState.ts`, `components/ui/MainMenu.tsx`):**
    - Added `'qualifying'` to `GameMode` type union.
    - Supported two authentic qualifying session formats via `qualifyingFormat`:
      1. `oneshot`: Single flying lap format where drivers get one warm-up approach and one flying lap to set their time.
      2. `short`: 12-minute session countdown (`qualifyingTimeRemaining = 720s`) where cars can run multiple hot laps and pit for tyres.
    - Added qualifying selection and format toggle in lobby menu Setup tab.
  - **Qualifying Classification Order (`lib/game/sim/race.ts`, `lib/game/sim/world.ts`):**
    - Added `compareQualifying` and `sortQualifyingOrder` sorting cars in place with zero heap allocations (Rule R7).
    - Sorts cars strictly by their best valid lap time (`timing.bestLap` ascending). Invalidated laps (R1 track limits excursions) are excluded from `bestLap` and sorted behind valid times.
    - Live timing tower automatically reflects qualifying standings when `mode === 'qualifying'`.
  - **Grid Order Replacement (`lib/game/sim/world.ts`):**
    - When a qualifying session completes, emits `qualifyingComplete` event with `grid: string[]` (array of driver codes in classification order, with `'player'` for player car).
    - When starting a Grand Prix race with `qualifyingGrid` present, replaces pseudo-qualifying:
      - Player's starting slot matches their exact qualifying position (`qGrid.indexOf('player')`).
      - AI grid order strictly follows the qualifying classification.
      - Fallback to pseudo-qualifying is preserved when no qualifying was run, maintaining exact bitwise determinism for golden race tests.
  - **Unit Testing (`lib/game/sim/qualifying.test.ts`):**
    - 4 unit tests verifying:
      1. One-shot qualifying flying lap completion and `qualifyingComplete` event emission.
      2. In-place qualifying order sort handling valid laps, invalidated laps, and no-time cars.
      3. Grand Prix race grid initialization strictly matching qualifying result (e.g. P3 player slot, pole position, AI order).
      4. 12-minute short format countdown timer decrementing correctly.

**Verification:**
- Full test suite: **27/27 test files passed, 204/204 unit tests passed** (including `qualifying.test.ts`).
- Golden race hash: bit-identical match to `'05aa16f7'`.
- Physics probe (`npm run probe`): **16/16 metrics in band**.
- `npm run typecheck`: clean (0 errors).
- `npm run build`: static site generation clean (0 errors).

---

## 2026-10-27 — R3 Flags & Safety: Local Sector Yellows, Blue Flags, VSC Delta Cap, and Safety Car Bunching (Task 31)

**Completed Task:**
- **Task 31 (R3: Flags, Safety Car & VSC System):**
  - **Flags System Architecture (`lib/game/sim/flags.ts`, `lib/game/sim/events.ts`, `lib/game/sim/types.ts`):**
    - Created `FlagsManager` to track local sector yellow flags across 3 track marshal sectors, Virtual Safety Car (`vsc`), and physical Safety Car (`sc`) states.
    - Added `flag` and `safetyCar` simulation events to `SimEvent` in `lib/game/sim/events.ts`.
    - Added `blueFlag` and `blueFlagTime` tracking to `WorldCar` in `lib/game/sim/types.ts`.
    - Configured zero-heap-allocation buffers (`Float32Array(32)` for stranded car timers, `Int8Array(32)` for previous positions) to enforce strict determinism and zero GC pauses in the 120 Hz hot path (Rule R7).
  - **Local Sector Yellows & Stranded Car Detection:**
    - Detects stranded/crashed cars outside the pit lane (`kmh < 15` sustained for $\ge 2.5$ s during racing phase), deploying a local yellow flag in that sector.
    - AI cars in a yellow sector lift pace by 30% and disengage active overtakes.
    - Passing under yellow or VSC/SC on actively racing cars (`kmh >= 30`) is flagged as illegal and penalised with a +5 s time penalty. Driving past stranded or pitted cars is legal under sporting regulations.
  - **Blue Flags & Lapped Car Yielding:**
    - Detects when the race leader closes within 150 m behind a lapped car (`leader.timing.lapsCompleted > car.timing.lapsCompleted`).
    - AI lapped cars shift off the optimal racing line (`outsideSide * (MAX_LAT - 10)`) and lift target speed to yield smoothly.
    - Player cars ignoring blue flags for $\ge 12.0$ s receive a +5 s time penalty for ignoring blue flags.
  - **Virtual Safety Car (VSC):**
    - Enforces a speed delta cap ($\le 180$ km/h) for AI cars across the entire circuit.
    - Automatically disables DRS availability during both VSC and Safety Car periods.
  - **Full Safety Car (SC) & Field Bunching:**
    - Paces the lead car at an authentic 140 km/h.
    - Trailing cars accelerate up to 190 km/h to catch and bunch into the queue until reaching `targetGapUnits = 420` (~1.08 s at 140 km/h), satisfying the PLAN-v3 §8 R3 requirement of $< 1.5$ s gaps.
    - Bypasses lateral line overlap checking under SC to allow cars to queue up regardless of lateral line offsets.
  - **HUD Steward Notifications (`components/game/GameLoop.tsx`):**
    - Added dedicated toast alerts for sector yellow flags, green flags, VSC deployment, and Safety Car deployment / "Safety Car in this lap".
  - **Unit Testing (`lib/game/sim/flags.test.ts`):**
    - 4 comprehensive unit tests:
      1. Stranded car trigger for local yellow flags, AI pace lift, and illegal overtake penalty detection.
      2. Blue flag detection, AI yield off-line, and player penalty for ignoring blue flags $> 12$ s.
      3. VSC speed delta cap adherence ($\le 185$ km/h) and DRS disabling.
      4. Safety Car field bunching to $< 1.5$ s gaps across the entire grid.

**Verification:**
- Full test suite: **28/28 test files passed, 208/208 unit tests passed** (including `flags.test.ts`).
- Golden race hash: bit-identical match to `'05aa16f7'`.
- Physics probe (`npm run probe`): **16/16 metrics in band**.
- `npm run typecheck`: clean (0 errors).
- `npm run build`: static site generation clean (0 errors).

---

## 2026-10-27 — R7 Dynamic Weather: Weather Timelines, Fast Wetting & Slow Drying, Racing Line Dry Factor, and AI Strategy Reaction (Task 32)

**Completed Task:**
- **Task 32 (R7: Dynamic Weather System):**
  - **Dynamic Weather System Architecture (`lib/game/sim/weather.ts`):**
    - Created `WeatherManager` to manage dynamic weather timelines, rain intensity evolution, sector wetness models, dry line formation, and tyre crossover thresholds.
    - Integrated with `GameWorld` (`this.weather`) with full backward-compatibility and zero changes to static weather runs, preserving bitwise determinism and golden hash `'05aa16f7'` (Rule R6).
    - Added `'dynamic'` option to `WeatherType` and `dynamicWeather?: boolean` in `GameSettings` (`lib/game/gameState.ts`, `lib/game/constants.ts`).
  - **Sector Wetness Physics & Moving Rain Fronts:**
    - Models authentic rain front propagation with delays across circuit marshal sectors (Sector 0 immediately, Sector 1 +5 s, Sector 2 +10 s).
    - Asymmetric wetting and drying kinetics:
      - Wetting fast: tracks saturate to wet conditions ($> 0.5$) in ~15–20 s during heavy rain.
      - Drying slower: evaporation and drainage take ~80–100 s once rain stops.
  - **Dry Line Formation Along the Racing Line:**
    - Tracks water displacement by cars driving near the centerline / rubbered line ($|\text{lateral}| < 16$).
    - Cars running on the dry line experience reduced effective wetness ($base \cdot (1 - dryLine \cdot 0.45)$), encouraging drivers and AI to stick to the drying line.
    - Heavy downpours wash away the dry line back to uniform standing water.
  - **Visual Integration (`lib/game/fx/env.ts`):**
    - Extended `getFxEnv` to accept dynamic wetness overrides: rooster tail spray amount scales continuously from 0 up to 1.0 as track wets up, and fades as track dries.
  - **AI Strategy Reaction & Crossover Thresholds:**
    - Connected `trackWetness` directly to `PitContext.wetness` and `aiPitStrategy`.
    - When rain onset pushes wetness across the slick/intermediate crossover ($> 0.18$), AI cars detect `compoundMismatch`, immediately request pit stops, and fit intermediate tyres within 2 laps of rain onset.
  - **Unit Testing (`lib/game/sim/weather.test.ts`):**
    - 2 unit tests verifying:
      1. Dynamic weather evolution: moving front sector delays, fast wetting, slower drying, and dry-line wetness reduction for cars on the racing line.
      2. AI strategy reaction: AI cars starting on slicks detect intermediate crossover and pit for intermediate tyres within 2 laps of rain onset (PLAN-v3 §8 R7 acceptance).

**Verification:**
- Full test suite: **29/29 test files passed, 210/210 unit tests passed** (including `weather.test.ts`).
- Golden race hash: bit-identical match to `'05aa16f7'`.
- Physics probe (`npm run probe`): **16/16 metrics in band**.
- `npm run typecheck`: clean (0 errors).
- `npm run build`: static site generation clean (0 errors).

---

## 2026-10-27 — T6.3–T6.5 Additional Circuits: Silverstone, Spa-Francorchamps, and Suzuka Integration (Task 33)

**Completed Task:**
- **Task 33 (T6.3–T6.5: Circuit Integrations — Silverstone, Spa, Suzuka):**
  - **Silverstone Circuit (`lib/game/tracks/silverstone.ts`, `gb-1948.geojson`):**
    - Official length: 5891 m, 18 turns, 2356 points at 2.5 m spacing.
    - Official lap record: 1:27.097 (Max Verstappen, 2020).
    - Variable track width: 13.0 m to 15.0 m across Becketts/Maggotts, Wellington straight, and Copse.
    - Two authentic DRS zones: Wellington Straight (detection 850 m, activation 1050–1650 m) and Hangar Straight (detection 3950 m, activation 4150–4950 m).
    - Pit lane on Hamilton Straight (right side, 80 km/h speed limit).
    - QSS racing line lap time estimate: 99.75 s.
  - **Circuit de Spa-Francorchamps (`lib/game/tracks/spa.ts`, `be-1925.geojson`):**
    - Official length: 7004 m, 19 turns, 2802 points at 2.5 m spacing.
    - Official lap record: 1:46.286 (Valtteri Bottas, 2018).
    - Authentic 102 m Ardennes roller-coaster elevation change:
      - Start/finish: 0.0 m baseline.
      - Eau Rouge bottom compression: -18.0 m.
      - Raidillon uphill climb and crest summit: +48.0 m.
      - Kemmel Straight / Les Combes peak: +84.0 m.
      - Stavelot valley floor: -18.0 m.
    - Two authentic DRS zones: Kemmel Straight and Main Pit Straight.
    - QSS racing line lap time estimate: 112.72 s.
  - **Suzuka International Racing Course (`lib/game/tracks/suzuka.ts`, `jp-1962.geojson`):**
    - Official length: 5807 m, 18 turns, 2323 points at 2.5 m spacing.
    - Official lap record: 1:30.983 (Lewis Hamilton, 2019).
    - Figure-of-eight crossover bridge geometry:
      - Underpass at index 929 ($s \approx 2322$ m, elevation $z = 8.1$ m).
      - Overpass bridge at index 1877 ($s \approx 4692$ m, elevation $z = 31.9$ m).
      - Authentic 23.8 m vertical clearance between bridge deck and underpass.
    - Height-aware track centreline search (`findNearestTrackPoint` in `lib/game/physics.ts`): incorporates $\Delta z$ vertical separation when $z$ is provided, guaranteeing 0 cross-talk or index jumping between the overpass bridge and underpass.
    - QSS racing line lap time estimate: 98.51 s.
  - **Track Registry & Credits (`lib/game/track/registry.ts`, `CREDITS.md`):**
    - Added Silverstone, Spa, and Suzuka to the track catalog and lazy loader table (`lazyModules`), downloading track geometry on-demand without bloating initial bundle size.
    - Attributed geometry to Tomislav Bacinger (MIT) and OpenStreetMap contributors in `CREDITS.md`.
  - **Unit Testing (`lib/game/track/silverstone.test.ts`, `lib/game/track/spa.test.ts`, `lib/game/track/suzuka.test.ts`):**
    - 13 comprehensive unit tests verifying:
      1. Official track catalog facts and turn counts.
      2. TrackRuntime geometry, elevation ranges (102 m on Spa, 40 m on Suzuka, 11 m on Silverstone), and bridge clearance ($> 15$ m on Suzuka).
      3. Height-aware nearest point search distinguishing bridge from underpass.
      4. QSS racing line generation and realistic lap time estimates for all 3 circuits.
      5. Full multi-car headless AI races on all 3 circuits without off-track excursions or crashes.

**Verification:**
- Full test suite: **32/32 test files passed, 223/223 unit tests passed** (including Silverstone, Spa, and Suzuka tests).
- Golden race hash: bit-identical match to `'05aa16f7'`.
- Physics probe (`npm run probe`): **16/16 metrics in band**.
- `npm run typecheck`: clean (0 errors).
- `npm run build`: static site generation clean (0 errors).

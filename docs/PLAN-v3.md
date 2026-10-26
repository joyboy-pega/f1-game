# Buddh GP — Plan v3: simulation, tracks, graphics, performance

Written 2026-10-22 from a full audit of `main` @ `8e3a492` (typecheck, 29 tests and build all green).
v2 (`docs/PLAN.md`) is history: it records how the current game was built. **This file is the plan to execute next.**

**Who executes this:** a Sonnet agent working alone, one task at a time, in a long session.
**Read §0 and §1 completely before touching code.** Then work through §9 in order. Every task in §3–§8 is
self-contained: *why → files → steps → acceptance → tests*. Do not start a task whose dependencies are not ✅.

---

## Contents
- §0 Operating protocol (how to work, gates, commits, stopping)
- §1 Quality & anti-hallucination rules (non-negotiable)
- §2 Audit findings: what is wrong today, with evidence
- §3 Phase S — Stabilise & instrument (bugs, measurement)
- §4 Phase T — Data-driven tracks + new circuits
- §5 Phase V — Vehicle dynamics v2 (a real, cheap car model)
- §6 Phase A — AI, assists and input on the new model
- §7 Phase G — Better graphics for less GPU
- §8 Phase R — Race-simulation features
- §9 Execution order & status board
- §10 Reusable code, data and assets (verified, with licences)
- §11 Budgets & target numbers
- §12 Risks, decisions, open questions for the human

---

## 0. Operating protocol

### 0.1 Before every task
1. Re-read the task block here and its dependencies' status in §9.
2. `git status` must be clean. Create a branch: `git switch -c v3/<task-id>` (e.g. `v3/S1-input-triggers`) from `main`.
3. Open (Read) **every** file the task lists before editing it. If a line number in this plan no longer matches,
   find the code by content (grep), never by guessing.

### 0.2 Gates (run all four, in this order, after every task)
```bash
npm run typecheck
npm test
npm run build
npm run dev   # in background, then:
node scripts/shoot.mjs --url http://localhost:3000/game --out shots/<task-id> --wait 9000 --hold ArrowUp:3000
```
- **Open the PNG with the Read tool and look at it.** Describe in the work log what you see. A green build with a
  black or broken screenshot is a failed task.
- The shoot JSON must report `"errors": []`.
- In this shell `head` is a Perl tool: always use `/usr/bin/head`.
- Headless Chrome renders with software WebGL. FPS from the harness is a *relative* signal only (compare
  before/after on the same machine), never proof of real-GPU performance.

### 0.3 Finishing a task
1. Gates pass. Acceptance criteria measured, and the numbers pasted into `docs/WORKLOG.md` (create it on the first task;
   one section per task: date, task id, files changed, evidence, anything not verified).
2. Commit on the task branch. Message: `<area>(<task-id>): <what changed>` + a body that says *why*.
   End the message with the attribution lines your harness asks for. One task = one commit where practical.
3. Merge to `main` with `git switch main && git merge --no-ff v3/<task-id>`. Never push, never force, never rebase `main`.
4. Update the status board in §9 (⏳ → ✅, with commit hash).

### 0.4 Stop and ask the human (do not improvise) when
- A task needs a new npm dependency not already approved in §10.4.
- An acceptance target in §11 looks impossible without changing another pinned contract.
- A test that passed before your change fails and the fix is not obviously inside your task.
- Licence of an asset is unclear, or a download page differs from §10.
- Race direction / start-line location of a real circuit is uncertain (see T6).
- You would need to delete more than ~50 lines of code you do not fully understand.

### 0.5 Working style
- Sequential. One task in flight. Do not spawn sub-agents unless the human asks.
- Smallest change that meets acceptance. No drive-by refactors outside the task's file list; note them in WORKLOG
  as follow-ups instead.
- Keep files under ~500 lines; split by responsibility when a task would grow one past that.
- Follow `CLAUDE.md`: TypeScript strict, functional React, 2-space indent, single quotes, comments explain *why*.

---

## 1. Quality & anti-hallucination rules

These exist because an agent can confidently write code against APIs, files or numbers that do not exist.
Every rule is checkable. Breaking one is a failed task even if the gates pass.

**R1 — Verify every external symbol before using it.** Before importing anything from `three`, `@react-three/fiber`,
`@react-three/drei`, `postprocessing` or `zustand`, confirm it exists in the *installed* version:
```bash
ls node_modules/@react-three/drei/core | grep -i <Name>
grep -n "export" node_modules/@react-three/drei/core/<Name>.d.ts
ls node_modules/three/examples/jsm/<dir>
grep -n "<method>" node_modules/@types/three/src/<path>.d.ts
```
Installed versions (from `package.json`): three 0.186, @types/three 0.186, R3F 9.8, drei 10.7, postprocessing 6.39,
@react-three/postprocessing 3.2, zustand 5, next 16.4, vitest 3.2. Docs found online may describe other versions:
the `.d.ts` in `node_modules` wins.

**R2 — Never invent files, functions or fields.** Before calling a project function, grep its definition and read its
signature. Before reading a `WorldCar` / `CarPhysicsState` field, check it in `lib/game/sim/types.ts` /
`lib/game/physics.ts`. If something this plan names is missing, say so in WORKLOG; do not create a look-alike.

**R3 — Numbers carry units and a source.** Every physical constant you add gets a comment with its unit and where it
comes from: a §11 target, a measurement you ran, or "tuned to hit §11 target X". No unexplained magic numbers.
Never present a guessed real-world figure as fact; §11 lists the approximate real figures this plan uses.

**R4 — Done means measured.** "Acceptance" items are numbers or observable behaviour. Measure them with a test,
a probe script (§3 S6 adds a harness) or a screenshot, and paste the result into WORKLOG. Write "NOT VERIFIED: <why>"
when you cannot measure something. Never write "should work".

**R5 — Tests are not weakened.** Do not loosen a tolerance, skip, or delete an existing test to get green. If physics
changes legitimately move a number, update the expectation **in the same commit** with a WORKLOG note giving the
old value, the new value and why.

**R6 — Determinism.** No `Math.random()` anywhere under `lib/game/sim/**` or `lib/game/physics*` or `lib/game/vehicle/**`;
use `world.rand` or the per-car `brain.rng`. No `Date.now()` / `performance.now()` in sim logic. A seeded race must
reproduce bit-for-bit (S5 adds the test that enforces it).

**R7 — No allocation in hot paths.** Inside `world.step`/`fixedStep`, `updateCarPhysics`, AI, collisions and any
`useFrame` / `useTicker` callback: no object/array literals, no closures, no `.map/.filter/.slice/spread`, no
`new THREE.*`. Use module-scope scratch objects or preallocated typed arrays. Allocation at setup time is fine.

**R8 — Simulation stays out of React.** (Unchanged from `CLAUDE.md`.) The store gets settings, records, phase, the
10 Hz HUD snapshot, toasts and results. Nothing per-frame.

**R9 — Contracts.** The pinned contracts in `docs/PLAN.md` §3.2 still hold unless a task here explicitly replaces one.
When a task replaces a contract, it updates the contract table in this file (§4.1 / §5.1) in the same commit.

**R10 — Dependencies.** No new runtime or dev dependency unless §10.4 approves it. One-off tools may be run with
`npx <tool>` without adding them to `package.json` (asset conversion only, never at runtime).

**R11 — Assets.** Only CC0, MIT, or CC-BY (with attribution) assets. Download into a fresh empty directory under the
scratchpad, inspect files before converting, never execute anything from an archive. Every shipped asset gets a row
in `CREDITS.md` (create it) with source URL, author, licence, date and what was changed. Respect the size budgets
in §11.3.

**R12 — Visual changes need before/after screenshots** of the same view (same `--settings`, same `--wait`),
both opened and compared in WORKLOG.

**R13 — Honest status.** The §9 board only says ✅ when every acceptance line is measured. Partial work is 🟡 with a
list of what is missing.

**R14 — Don't fight the harness.** If a command is denied or a tool fails twice the same way, stop and record it
instead of retrying variations.

---

## 2. Audit findings (2026-10-22)

How these were found: reading every sim/render module, running probe scripts against `updateCarPhysics`
(vite-node), the full gate run, and a production-build screenshot.

### 2.1 Bugs (confirmed in code)

| # | Bug | Where | Effect | Fix task |
|---|---|---|---|---|
| B1 | Edge-triggered inputs are lost when a rendered frame runs **zero** fixed steps. `controls.poll()` clears triggers every frame, but `world.step` only copies them into `ctrl` inside the `while (acc >= FIXED_DT)` loop. | `lib/game/sim/world.ts:170-184`, `lib/game/controls.ts:190-200` | On 144 Hz screens ~1 frame in 6 has no step; on 240 Hz about half. DRS, pit request, reset, compound and bias presses silently do nothing. | S1 |
| B2 | No render interpolation. Cars are drawn at the last fixed-step state. | `components/game/car/F1Car.tsx:74-75`, `components/game/Camera.tsx` | At refresh rates that are not a multiple of 120 Hz, frames show 0, 1 or 2 steps of motion → visible micro-stutter at speed. | S2 |
| B3 | Quality changes that toggle post-processing remount the **whole Canvas** (`key={post ? 'post' : 'plain'}`), and the governor can oscillate MEDIUM↔LOW (drop after 3 s < 42 fps, rise after 10 s > 57 fps). | `components/game/GameCanvas.tsx:41`, `lib/game/performance.ts:107-142` | Every switch rebuilds the GL context, all geometry, the IBL and shaders: a multi-second hitch, repeating every ~13 s on borderline GPUs. | S3 |
| B4 | Stale results after a quick restart: `finish` schedules `setTimeout(… setResults …, 2500)` with no cancellation. | `components/game/GameLoop.tsx:65-73` | Restarting within 2.5 s of the flag shows the previous race's results screen over the new race. | S1 |
| B5 | Rain grip is applied three times: `surfaceGripFactor` ×0.65, compound `wetGripFactor`, and again `baseNormalGrip/baseDriftGrip` ×0.65/0.55. | `lib/game/physics.ts:376-379`, `:385-386`, `:534-543` | Wet running is far slipperier than the compound model intends; inters cannot be tuned. | V3 (replaced by single wetness path) |
| B6 | Time Trial / practice laps ignore track limits (`enabled: this.isRace`). | `lib/game/sim/world.ts:283` | Ghost and best-lap records can be set by cutting corners. | R1 |
| B7 | Camera anchors are duplicated with different numbers: the rig uses its own `COCKPIT_EYE`/`NOSE_CAM` (TODO(merge) left in), `car/dimensions.ts` exports others nobody reads. | `lib/game/camera/rig.ts:29-33`, `components/game/car/dimensions.ts:38-45` | Cockpit/nose cams don't sit where the car model's cockpit is; contract in PLAN v2 §3.2 is not honoured. | S4 |
| B8 | Tree and hill `InstancedMesh`es are created in `useMemo` with fresh geometry/material and never disposed; `density` changes (quality tier) create new ones. | `components/game/TrackProps.tsx:191-224`, `:262-276` | GPU memory leak on each quality change. | S3 |
| B9 | `fitFreshTires` sets every tyre's `grip = 1.0` regardless of temperature. | `lib/game/physics.ts:180-195` | One-frame grip spike on cold new tyres; masks cold-tyre behaviour after pit stops. | V3 |
| B10 | Records and ghosts are keyed by mode+weather only (`recordKey`, `ghostKey`). | `lib/game/store.ts:26-28`, `lib/game/replay/ghost.ts:31` | As soon as a second track exists, records/ghosts from different tracks collide. | T4 |
| B11 | Dead dressing: `getBrakeBoards`, `getTyreWall`, `getSponsorAtlas`, `getCrowdSprite`, `getMacroNoise` are implemented but never used. | `lib/game/visuals/textures.ts:215,268,302,366,402` | Brake marker boards, tyre walls and sprite crowd were planned (WS-B) and never mounted; the circuit looks bare. | G3 |

### 2.2 Performance problems
| # | Problem | Where | Fix task |
|---|---|---|---|
| P1 | Per-step allocations: `sortRunningOrder` copies + sorts the car array every fixed step (120 Hz); `arcPosition` returns a new object per car per step; `updateSingleTire` is a closure created per car per step; `advanceTiming` allocates `result` and `timeAt` closure; `buildHud` maps arrays at 10 Hz (fine). | `lib/game/sim/race.ts:22-31,100-112,202-210`, `lib/game/physics.ts:422` | S5 |
| P2 | Each car is ~13 draw calls (body, carbon, flap, wheel, brake light, 4 tyres, 4 rims) plus the same again in the shadow pass; 12 cars ≈ 300 draws before the world. A 20-car grid makes this worse. | `components/game/car/F1Car.tsx:144-178` | G6 |
| P3 | No dynamic resolution. DPR is fixed per tier (0.85 / 1.0 / 1.3). | `lib/game/performance.ts:20-60` | S3 |
| P4 | Shadow camera follows the player but is not snapped to texels → shadow edges shimmer while driving. | `components/game/Environment.tsx:50-59` | G4 |
| P5 | All world textures are generated on canvases at load; cost is unmeasured (could be fine). | `lib/game/visuals/textures.ts` | S6 measures, G2 decides |
| P6 | JS: ~707 kB gzip across all chunks; largest chunk 233 kB gz (three). `/game` first-load not measured. | `.next/static/chunks` | S6 measures |

### 2.3 Simulation realism (measured, this is the big one)
Probe: `updateCarPhysics` driven directly with full throttle / full brake / full lock on the back straight.
World unit: `kmh = vf × 0.37` → 1 unit ≈ 0.103 m.

| Quantity | Game today | Real modern F1 (approx., §11) | Verdict |
|---|---|---|---|
| 0–100 km/h | **0.44 s** | ~2.6 s | 6× too quick |
| 0–200 km/h | **1.22 s** | ~4.8 s | 4× too quick |
| 300 → 80 km/h braking | **0.31 s, 17 m** (~20 g) | ~1.8 s, 80–110 m (peak ~5–6 g) | 6–8× too short |
| Lateral at 100 / 200 / 300 km/h (full lock) | **4.4 / 7.5 / 9.3 g** | ~2.2 / ~3.8 / ~5 g | ~2× too much at speed |
| Track length (Buddh) | **4 740 m** | 5 125 m | layout scaled ~8 % small |
| Racing-line top speed (no DRS) | 289 km/h | ~315–325 km/h at Buddh | low |
| Racing-line lap estimate | 66.4 s | ~1:25–1:30 | far too fast |

Model-level gaps (`lib/game/physics.ts`):
- Kinematic, not force-based: no mass, no tyre forces, no load-dependent grip. Lateral velocity is damped by
  `exp(-grip·dt)` (`:556`); yaw rate is a function of steer and speed (`:582-585`), so understeer/oversteer limits do
  not emerge from tyre saturation.
- No downforce or drag force model; "aero" is a `maxSpeed` asymptote (`:354-359`) and a brake multiplier (`:381`).
- Gearbox is fake: gear = `floor(kmh/42)+1`, rpm linear in gear (`:656-659`). No shift time, no torque curve,
  no wheelspin limited by traction.
- Load transfer is computed from *inputs* (steer, pedals) not accelerations (`:402-408`).
- Flat world: no elevation, no camber, no gradient force. Buddh has ~14 m of elevation change and a banked T10–T11.
- AI, assists, pit controller and the racing-line speed profile all hard-code copies of physics constants
  (`2.6`, `220`, `620`, `760`, `900`): `lib/game/sim/ai.ts:149`, `lib/game/sim/pit.ts:191`,
  `lib/game/sim/racingLine.ts:23-37`. Changing physics silently breaks AI. **Any physics rewrite must replace these
  with calls into the vehicle module.**
- Fuel mass, engine modes, tyre pressures, setup: absent.
- Car is ~4 m long in world (footprint 3.45 model units × `CAR_SCALE` 11.5); real cars are ~5.6 m. Track is 13.4 m
  wide; Buddh is ~14–20 m. Proportions are off.

### 2.4 Content & feature gaps (simulation perspective)
- One circuit, hard-coded as module globals in `lib/game/constants.ts` and imported by 20+ modules.
- No qualifying, weekend or championship; grid is pseudo-qualified by skill (`world.ts:130-134`).
- Weather is a static setting; no evolving wetness, no drying line.
- No safety car / VSC / yellow flags / blue flags; no jump-start or pit-speeding penalties; no unsafe release.
- 11 AI drivers max (grid of 12); real grid is 20.
- No fuel, no engine/ERS deployment modes, no car setup.
- Damage only reduces front grip (max 15 %) and is fully repaired at any stop.
- Keyboard throttle/brake are binary (`controls.ts:155-157`); no speed-sensitive steering; no input remapping; no
  separate pedal axes for wheels.
- No lap invalidation, no telemetry comparison/export.

### 2.5 Environment (from the screenshot `race.png`, day/sunny, 3 s after start)
Flat green ground to the horizon, sphere "hills", coloured rectangles as crowd, a giant X-pattern fence, plain
gradient sky, no buildings, no trees visible from the track, uniform asphalt with no rubbered line, no marker
boards, no tyre walls, no run-off paint. Cars and kerbs read well. Heavy launch smoke from every car at the start.

---

## 3. Phase S — Stabilise & instrument

### S1 — Input triggers survive zero-step frames; cancel stale result timers
- **Why:** B1, B4.
- **Files:** `lib/game/sim/world.ts`, `components/game/GameLoop.tsx`, `lib/game/sim/world.test.ts`.
- **Steps:**
  1. In `GameWorld`, keep a `pendingTriggers` copy: when `step()` receives input with any trigger true, OR it into
     a pending set; apply pending triggers on the first fixed step that runs, then clear. If the world is paused,
     drop them (current behaviour).
  2. In `GameLoop`, keep the results timeout id in a ref; clear it when `sessionId` or `world.raceId` changes and on
     unmount. Also guard inside the callback: `if (world.raceId !== raceIdAtFinish) return`.
- **Acceptance:** new test: call `world.step(0.004, inputWithDrsToggle)` (less than one fixed step) then
  `world.step(0.005, neutral)` → the trigger is applied exactly once. Test for reset trigger likewise.
- **Tests:** add to `world.test.ts`.

### S2 — Render interpolation between fixed steps
- **Why:** B2.
- **Files:** `lib/game/sim/world.ts`, `lib/game/sim/types.ts` (add `prev` pose), `components/game/car/F1Car.tsx`,
  `components/game/Camera.tsx`, `lib/game/camera/rig.ts`, `components/game/Ghost.tsx` (check), FX that read `phys.x/y`
  (`components/game/fx/CarFx.ts` — check).
- **Steps:**
  1. Before each fixed step store `prevX, prevY, prevA` per car (plain numbers on `WorldCar`, no allocation).
  2. Expose `world.alpha = acc / FIXED_DT` after `step()`.
  3. Add `renderPose(car, out)` helper in `lib/game/sim/interp.ts` that lerps x/y and shortest-arc-lerps the angle into
     a reused `out` object.
  4. F1Car, camera rig target and anything that positions a mesh per car use `renderPose`. Sim logic keeps using
     `phys` directly.
  5. On teleports (reset, respawn, pit takeover, setup) set prev = current to avoid a smear.
- **Acceptance:** unit test for `renderPose` (alpha 0 → prev, 1 → current, angle wrap across ±π). Screenshot unchanged.
  WORKLOG note on how it looks at 144 Hz if the human can test (otherwise NOT VERIFIED).

### S3 — Quality governor without remounts; dynamic resolution; leak fixes
- **Why:** B3, B8, P3.
- **Files:** `components/game/GameCanvas.tsx`, `lib/game/performance.ts`, `components/game/fx/PostFX.tsx`,
  `components/game/TrackProps.tsx`, `components/game/GameLoop.tsx`.
- **Steps:**
  1. Remove the Canvas `key`. Create the Canvas once with `antialias: false` and keep the composer mounted at every
     tier except an explicit "LOW" where `PostFX` returns null but the renderer stays. Put tone mapping in exactly one
     place per tier (keep the existing `useEffect` swap in PostFX). Accept that LOW has no MSAA (it already had
     reduced DPR); optionally use SMAA-only composer on LOW if measurement shows it is cheaper than no AA + higher DPR.
  2. Wrap the scene in drei `PerformanceMonitor` (verify: `node_modules/@react-three/drei/core/PerformanceMonitor.d.ts`
     exports `onIncline`, `onDecline`, `onChange`, `factor`, `flipflops`, `onFallback`). Drive DPR continuously:
     `dpr = clamp(minDpr, maxDpr, factor)` via `setDpr` from `useThree`. Use `flipflops={3}` and `onFallback` →
     lock to MEDIUM.
  3. Tier changes (shadows on/off, particles, foliage) only on sustained decline (≥ 5 s) and never more than once per
     30 s. Hysteresis band: down below 45 fps, up above 58 fps.
  4. `TrackProps` trees/hills: build geometry+material once at module scope (or `useMemo` with `useEffect` cleanup that
     disposes geometry and material). Changing density changes `mesh.count`, not the mesh.
  5. Delete the separate `formula_v_quality` localStorage key path or make it read/write `settings.quality` only
     (one source of truth). Keep backwards compatibility: if the old key exists, migrate once and remove it.
- **Acceptance:** switching quality 10× from the pause menu causes no Canvas remount (log `gl` context id / count of
  `webglcontextlost`), and `renderer.info.memory.geometries` returns to the same number after cycling (S6 exposes it).

### S4 — One source of truth for camera anchors
- **Why:** B7.
- **Files:** `lib/game/camera/rig.ts`, `components/game/car/dimensions.ts`.
- **Steps:** rig imports `COCKPIT_EYE`, `NOSE_CAM`, `TCAM` from `dimensions.ts` (model units) and converts with
  `CAR_SCALE`. Remove the rig's copies and the TODO. Check the cockpit view screenshot: the halo and steering wheel
  must be visible and the camera must not be inside the bodywork.
- **Acceptance:** `node scripts/shoot.mjs ... --press KeyC --press KeyC` (cycle to cockpit) screenshot reviewed for
  each of the 4 views.

### S5 — Allocation-free hot path + determinism test + golden race
- **Why:** P1; R6; and a safety net before the big refactors (T, V).
- **Files:** `lib/game/sim/race.ts`, `lib/game/sim/world.ts`, `lib/game/physics.ts`, new `lib/game/sim/golden.test.ts`.
- **Steps:**
  1. `arcPosition(phys, out)` writes into a caller-owned object. `advanceTiming` returns into a reused result; replace
     the `timeAt` closure with inline math. `updateSingleTire` becomes a module function taking explicit arguments.
  2. `sortRunningOrder` sorts `this.order` in place (insertion sort: the order is almost sorted every step) without
     copying.
  3. **Golden test:** with `world.seed = 12345`, settings: race, 3 laps, 9 AI, pro, sunny; run until finished (cap
     sim time); hash `[finish order, each car's lap times rounded to 1e-6]`. Store the expected hash in the test with
     a comment "update only when behaviour changes on purpose (R5)".
  4. **Determinism test:** run the same seed twice in one process → identical hash.
- **Acceptance:** golden hash identical before and after steps 1–2 (this proves the refactor is behaviour-neutral).
  Micro-benchmark (vitest, not a hard assert in CI, logged): 12 cars × 120 steps time per simulated second; record
  before/after in WORKLOG.

### S6 — Measurement harness
- **Why:** R4. Later phases need numbers, not impressions.
- **Files:** `components/game/GameLoop.tsx` (or a new `components/game/DevStats.tsx`), `scripts/shoot.mjs`,
  new `scripts/probe-physics.ts`, `package.json` scripts.
- **Steps:**
  1. In dev builds (or when `?stats=1`) publish `window.__BUDDH_STATS__ = { drawCalls, triangles, geometries,
     textures, programs, simMsAvg, frameMsAvg, dpr, quality }` once per second from `gl.info` and timers around
     `world.step`.
  2. `shoot.mjs` reads it after `--wait` and includes it in the JSON output.
  3. `scripts/probe-physics.ts` (run with `npx vite-node`): straight-line 0–100 / 0–200 / 0–300 times, top speed,
     300→80 braking time & distance, steady-state lateral g at 100/200/300 km/h on a long straight (use a synthetic
     straight track if T1 has landed), and the racing-line lap estimate. Prints a table matching §11.1.
     Add `"probe": "vite-node scripts/probe-physics.ts"` to package.json scripts.
  4. Record a **baseline** in WORKLOG: stats for chase cam at grid, 3 s, mid-lap, for LOW/MEDIUM/HIGH; probe table;
     `/game` first-load JS (sum gz of the chunks the page HTML references).
- **Acceptance:** `npm run probe` prints the table; shoot JSON contains the stats object.

### S7 — Small cleanups found in the audit
- Launch smoke: every car emits a big smoke plume at the start (`race.png`). Gate wheelspin smoke on real rear slip
  (after V2) or, before V2, on `throttle > 0.9 && vf < 120 && wheelSlipRear > x`. Check `components/game/fx/CarFx.ts`.
- `pit.ts:155-158`: after `fitFreshTires`, set the grip to the temperature-based value (see B9) — or leave to V3 if V3
  is next.
- Remove the now-unused legacy `TIRE_CONFIG` keys marked "Legacy keys" only if grep shows no reader.

---

## 4. Phase T — Data-driven tracks + new circuits

### 4.1 Target contract (replaces the module-global track in `constants.ts`)
```ts
// lib/game/track/types.ts
export interface TrackMeta {
  id: string;                 // 'buddh', 'monza', ...
  name: string;               // display name (place names OK; no F1/FOM trademarks or logos)
  country: string;
  lengthM: number;            // official length; the imported centreline is scaled to it
  direction: 'cw' | 'ccw';    // for sanity checks only
  widthM: number | [sM: number, widthM: number][];   // default width or per-arc-length keyframes
  elevation?: [sM: number, hM: number][];            // smooth keyframes; omitted = flat
  camber?: [sM: number, radians: number][];          // + = banked toward +normal
  sectorsM: [number, number];                        // arc length of S1/S2 and S2/S3 boundaries
  drsZones: { detectionM: number; startM: number; endM: number }[];
  pit: { side: 1 | -1; entryM: number; exitM: number; boxStartM: number; boxEndM: number; speedLimitKmh: number };
  gridSlotSpacingM: number;   // 8 m in F1
  sunAzimuthDeg?: number;     // lighting presets rotate the sun per track
  scenery: SceneryPlan;       // grandstands, buildings, tree density, barrier types per arc-length range
}
export interface TrackRuntime {   // derived once per track, immutable afterwards
  meta: TrackMeta;
  N: number;
  px: Float64Array; py: Float64Array; pz: Float64Array;   // centreline (pz = elevation, world units)
  tx: Float64Array; ty: Float64Array; nx: Float64Array; ny: Float64Array;
  halfWidth: Float32Array;  camber: Float32Array; grade: Float32Array;
  curvature: Float32Array;  smoothCurvature: Float32Array;
  cumulativeS: Float64Array; length: number;
  // derived index ranges (from the *M metadata)
  sectorIdx: [number, number]; drs: DrsZoneIdx[]; pitIdx: PitIdx;
}
```
Rules: metadata is in **metres of arc length**, never spline indices (indices change when N changes).
`N` varies per track (target spacing 2.5 m). Typed arrays, not `[number, number][]`.
Units: introduce `lib/game/units.ts` with `UNITS_PER_M = 10` and `KMH_PER_UNIT = 0.36`; replace the 5 literal `0.37`s
and `G = 98.1` (rig) with imports. (This is a deliberate ~3 % change in displayed speed; note it in WORKLOG.)

### T1 — Extract the Buddh track into `TrackRuntime` (behaviour-neutral)
- **Depends on:** S5 (golden test).
- **Files:** new `lib/game/track/{types,build,registry,index}.ts`, `lib/game/tracks/buddh.ts`; modify
  `lib/game/constants.ts` and every importer of the track globals. Current importers (grep 2026-10-22):
  `components/game/{AudioBridge,Track,TrackProps}.tsx`, `components/game/replay/ReplayDirector.tsx`,
  `components/ui/Minimap.tsx`, `components/ui/hud/DriverCluster.tsx`, `lib/game/audio/helpers.ts`,
  `lib/game/physics.ts`, `lib/game/sim/{ai,drs,penalties,pit,race,racingLine,types,world}.ts`,
  `lib/game/sim/race.test.ts`, `lib/game/visuals/trackData.ts`, `components/game/RacingLine.tsx`,
  `lib/game/sim/assists.ts`. (`car/geom.ts`, `car/wheels.ts`, `fx/CarFx.ts` matched only the word `normals`; check.)
- **Steps:**
  1. `buildTrack(meta, controlPoints)` reproduces *exactly* today's Catmull-Rom (2 samples per control point),
     tangents, normals, curvature, smoothing and cumulativeS — same math, same order — so floats are identical.
  2. Module `lib/game/track/index.ts` exports `track` (a mutable holder `{ current: TrackRuntime }`) and
     `setActiveTrack(id)`. Consumers read `track.current` at call time, never cache arrays at module load.
  3. Things computed at module load from the track must become per-track caches keyed by `track.id`:
     racing line (`racingLine.ts` — `buildRacingLine(rt)` returning a `RacingLine` object), corner zones
     (`penalties.ts`), DRS zone info (`drs.ts`), pit constants (`pit.ts` top-level consts), minimap bounds,
     `visuals/trackData.ts` (`corners`, `TRACK_BOUNDS`, kerb masks).
  4. `constants.ts` keeps car/physics config only. Track-specific consts (`PIT_LANE`, `DRS_CONFIG.zones`,
     `SECTOR_BOUNDS`) move into `tracks/buddh.ts` meta (converted to metres using today's `cumulativeS`, and
     converted back to identical indices at build).
  5. `world.setup(settings)` calls `setActiveTrack(settings.trackId)` first. `GameSettings` gets `trackId: 'buddh'`
     (store `merge` already fills defaults; bump persist `version` to 2 with a migration that sets `trackId`).
  6. React: components that build geometry `useMemo(..., [trackId])` and dispose old geometry on change.
- **Acceptance:** golden hash unchanged (bit-identical). All 29+ tests pass. Screenshot identical to baseline.
- **Pitfall:** do not "improve" the spline or smoothing in this task. Behaviour-neutral first, improvements later.

### T2 — Real scale, width and elevation for Buddh
- **Depends on:** T1. **Intentionally changes behaviour** — update golden hash with a WORKLOG note (R5).
- **Steps:**
  1. Scale Buddh control points so `length === 5125 m` (factor ≈ 1.081 from the measured 4 740 m; compute it, don't
     hard-code it).
  2. Width: Buddh is wide (pit straight ~18 m+). Start with `widthM` keyframes: 16 m default, 18 m on the main
     straight. Physics bands (verge, gravel, wall) become per-index from `halfWidth` instead of `HW` constants.
     Every use of `HW` gets reviewed: replace with `rt.halfWidth[i]` (sim) or kept as a car-scale constant where it is
     actually a car dimension.
  3. Elevation: author ~10 keyframes from public descriptions of the circuit (known: total change ~14 m, uphill run
     into T1 area, the drop from T3 down the back straight, banked T10–T11). Record each keyframe's source in a
     comment; where unknown, mark "approximate". Smooth with a C2 spline; clamp grade to ±10 %.
  4. Camber: T10–T11 banking ~ +4–6° toward the inside (sign by the turn direction), ramped over 60 m.
- **Acceptance:** `rt.length` within 0.5 % of 5125 m. Screenshot shows visible elevation (T3→T4 hill) with no cracks
  between road, kerbs and verge. Golden hash updated.

### T3 — 3D road surface: render + physics read elevation/camber
- **Files:** `lib/game/visuals/trackData.ts` (`sweep`, `frameAt`), `components/game/Track.tsx`, `TrackProps.tsx`,
  `components/game/car/F1Car.tsx`, camera rig, FX (particles spawn at car height), physics (V-phase reads grade).
- **Steps:**
  1. `sweep` profile points get `y = pz[i] + camber[i] * lateral + profileY`. Kerbs, verge, gravel, walls, fences,
     markings, pit lane and props all follow the same height function `surfaceHeight(i, lateral)` from
     `lib/game/track/surface.ts`.
  2. Cars: root y = `surfaceHeight(idx, lateral)`; pitch/roll add the road's grade/camber angles to the dynamic ones.
  3. Camera: chase/T-cam targets include height; ensure the camera never goes under the terrain (clamp to
     `surfaceHeight + 2 m` near the car).
  4. Ground plane replaced by terrain in G1; until then lower it to `min(pz) - 1 m`.
- **Acceptance:** screenshots at 3 points with elevation change (crest, dip, banking) — no floating or buried cars,
  no z-fighting.

### T4 — Track selection, per-track records/ghosts, lobby
- **Why:** B10.
- **Files:** `lib/game/store.ts`, `lib/game/replay/ghost.ts`, `components/ui/MainMenu.tsx`, `lib/game/gameState.ts`.
- **Steps:** `recordKey(trackId, mode, weather)`; ghost key `buddh-gp-ghost:<trackId>:<weather>`. Migration: existing
  keys are Buddh's (rename on load, once). Lobby gets a track picker (card with minimap SVG generated from the
  centreline at runtime, length, turns, record). Load the selected track module lazily (`import()`) before
  `world.setup`.
- **Acceptance:** old Buddh records still show after migration (test with a seeded localStorage in a unit test of the
  migration function). Switching tracks in the lobby updates the minimap and records.

### T5 — Track import pipeline
- **Files:** new `scripts/tracks/import-geojson.ts`, `scripts/tracks/README.md`, output `lib/game/tracks/<id>.ts`.
- **Source data:** `bacinger/f1-circuits` (MIT; GeoJSON `LineString` of `[lon, lat]`, ~100–200 points per circuit,
  `properties.length` in metres; verified on `it-1922` Monza: 125 points, length 5793). See §10.1.
- **Steps:**
  1. Download the single circuit file into a fresh scratch directory (`curl -L -o <dir>/<id>.geojson <raw url>`).
     Read it before use.
  2. Project to local metres: equirectangular around the centroid (`x = R·Δλ·cos φ0`, `y = R·Δφ`, R = 6 371 000).
     Note the sign: sim `y` maps to three.js `z`, and +z is "south" if y = north; pick a convention and **verify
     handedness with a test** (a known clockwise circuit must come out clockwise in sim space).
  3. Close the loop, resample uniformly by arc length (2.5 m spacing), smooth with a small Laplacian (keep corners —
     max lateral move 1.5 m), scale to `properties.length` or the official length you put in meta.
  4. Rotate the array so index 0 is the start/finish line. Determine it from the pit straight; put the chosen point
     and evidence in a comment.
  5. Emit a TS module with `Float32Array` data as a compact literal (or base64) + the meta skeleton for hand editing.
  6. Write the source URL, retrieval date and licence into `CREDITS.md`.
- **Acceptance:** import of Monza produces a closed loop of length 5793 ± 5 m, curvature plot has no spikes (unit
  test: `max |Δcurvature|` below a threshold), self-intersection test passes.

### T6 — Add circuits (one task per circuit)
Order chosen for value vs. risk. Each needs: import (T5), meta (pit, DRS, sectors, width, elevation, scenery),
racing line sanity, AI race test, screenshots, record entry.
| Order | Circuit (bacinger id) | Why | Special work |
|---|---|---|---|
| 1 | Monza `it-1922` | Fast, flat, simple; validates top speed & braking | Chicanes need kerb/sausage-kerb rules; penalise chicane cutting (R1) |
| 2 | Red Bull Ring `at-1969` | Short lap (good for testing), big elevation | Elevation keyframes (~65 m change) |
| 3 | Silverstone `gb-1948` | High-speed corners test aero model | Wide run-offs |
| 4 | Spa `be-1925` | Elevation + long lap + weather showcase | Eau Rouge compression/crest |
| 5 | Suzuka `jp-1962` | Figure-of-eight | **Crossover**: needs a bridge and a height-aware nearest-point search (see below) |
| later | Interlagos, Bahrain (night), Marina Bay (street, night) | Variety | Street circuits need walls at the track edge and buildings |
- **Race direction / start line:** confirm from the circuit's Wikipedia map (direction arrow, pit straight). If not
  certain, stop and ask (§0.4).
- **Pit lane, DRS zones, sectors:** author approximate values in metres from public track maps; mark "approximate".
- **Nearest-point search on crossovers:** `findNearestTrackPoint` scans ±30 indices around the last index, then
  falls back to a global scan when > 140 units away. On a crossover the global scan can snap to the other level. Fix:
  global fallback must also compare `|pz[i] - carHeight|` and prefer the candidate within 3 m vertically; and AI
  respawn uses the car's own last index.
- **Acceptance per circuit:** (a) 10-car pro race of 3 laps finishes in a seeded test with no car > 5 % off-track time
  and no respawns; (b) pro AI lap time within §11.2 band for that circuit; (c) screenshots: grid, T1, a high-speed
  corner, elevation feature; (d) DRS & pit stop exercised in the test.

### T7 — Track dev page
- `app/dev/track/page.tsx`: top-down canvas of the active track with index/metre ruler, racing line, speed profile
  colouring, DRS/sector/pit markers, curvature graph. Read-only; used to author meta. Not linked from the lobby.

---

## 5. Phase V — Vehicle dynamics v2

Goal: forces and masses in SI units, emerging understeer/oversteer, downforce, traction and braking limits, a real
gearbox — and still cheap (20 cars × 120 Hz ≪ 1 ms) and deterministic. Keep the arcade feel available via assists,
not via fake physics.

### 5.1 Contract
- New folder `lib/game/vehicle/`: `params.ts` (car parameters), `tyre.ts` (force curves), `aero.ts`, `powertrain.ts`,
  `model.ts` (`stepVehicle(state, input, env, dt)`), `limits.ts` (g-g envelope for AI/racing line),
  `vehicle.test.ts`.
- `lib/game/physics.ts` becomes a thin adapter: `updateCarPhysics(car, ctrl, dt, …)` keeps its signature and return
  shape (so world.ts, AI and tests keep working) and calls `stepVehicle`. `CarPhysicsState` keeps every field the HUD,
  audio, FX and camera read (`kmh`, `rpm`, `gear`, `tires.*`, `wheelSlipFront/Rear`, `isDrifting`, `driftIntensity`,
  `drsOpen`, `pitch`, `roll`, …) — grep their readers before removing or renaming any.
- Internals in SI (m, s, kg, N). Convert at the boundary with `UNITS_PER_M`.
- **No other module may hard-code a vehicle constant.** AI, assists, pit controller and racing line ask
  `lib/game/vehicle/limits.ts`.

### 5.2 Model (deliberately simple, well-known pieces)
1. **Planar two-axle ("bicycle") model with load transfer.** States: x, y, yaw, vx_body, vy_body, yawRate, plus
   engine rpm, gear, ERS charge, fuel mass, tyre temps/wear per wheel. Front and rear axle each produce lateral force
   from slip angle; longitudinal forces from drive/brake requests limited by a friction ellipse.
   Rationale: a full four-wheel model with wheel spin ODEs is stiff at 120 Hz; the two-axle model is stable, cheap and
   produces correct limit behaviour. Per-wheel loads are still computed (for tyre temps and HUD) from axle loads and
   lateral transfer.
2. **Tyre force:** simplified Pacejka Magic Formula `F = D·sin(C·atan(B·x − E·(B·x − atan(B·x))))`, with
   `D = μ(load, temp, wear, wetness, compound) · Fz`. Start values: lateral `C = 1.9`, longitudinal `C = 1.65`;
   choose `B` so the peak sits at ~7° slip angle laterally (`B ≈ tan(π/(2C)) / 0.12 ≈ 9`) and ~10 % slip ratio
   longitudinally; `E = 0` initially. These are starting points to tune, not facts — say so in comments (R3).
   Load sensitivity: `μ = μ0 · (Fz/Fz0)^(-0.1)` (mild).
3. **Combined slip:** scale lateral capacity by `sqrt(1 − (Fx/Fx_max)²)` (friction ellipse).
4. **Low-speed blend:** below ~5 m/s, blend to a kinematic bicycle model (slip angles are ill-defined near 0 speed);
   use relaxation length (~0.5 m) on slip angles to avoid jitter.
5. **Aero:** `Fdown = ½ρ·ClA·v²` split front/rear by aero balance (~45 % front); `Fdrag = ½ρ·CdA·v²`; DRS reduces
   CdA and rear ClA; slipstream reduces CdA by the existing `draft` factor; dirty air reduces ClA for the follower
   (new: up to −10 % within 1 s gap in corners — makes following hard, like real F1).
6. **Powertrain:** ICE torque curve (table vs rpm, peak power around 11 000–12 000 rpm, limiter 15 000), 8 forward
   gears with ratios + final drive chosen so 8th tops out ~340 km/h at the limiter; automatic shifting by default
   (upshift at ~11 800 rpm, downshift to keep rpm > 9 000 under braking), manual paddles optional (R-phase input);
   shift time 30–50 ms (torque cut, audio uses it). MGU-K adds up to 120 kW while ERS charge allows (DRS era rules);
   harvest under braking limited per lap. Rolling resistance small.
7. **Brakes:** max brake torque per axle limited so peak decel ≈ 5–6 g at high speed (where downforce allows) and
   lock-up happens when torque exceeds the friction-ellipse capacity of the axle (lock-up → reduced lateral grip on that
   axle, flat-spot wear). Brake bias already exists: map it directly to the front/rear torque split.
8. **Gradient & camber:** gravity along the road grade affects longitudinal acceleration; camber adds a lateral gravity
   component. Vertical curvature (crests) changes normal load: `Fz += m·v²·κ_vertical` (optional, after T3).
9. **Mass:** car 798 kg incl. driver + fuel (start 100 kg race / 10 kg time trial), burn rate per lap from meta
   length (≈ 1.7 kg per 5 km lap at race pace); fuel effect ~0.03 s/kg/lap emerges from mass.
10. **Tyre temperature & wear:** keep the existing thermal model structure (`lib/game/sim/tyres.ts`, compound windows)
    but drive heat input from **tyre work** (|F·slip velocity|) instead of steer/pedal proxies. Wear ∝ work too.
    One wetness path: `wetness → compound wetGripFactor → μ`. Delete the extra weather multipliers (B5).
11. **Integration:** semi-implicit Euler at 120 Hz. If tests show instability at high yaw rates, substep the vehicle
    model ×2 internally (240 Hz) — budget check required (§11.4).
12. **Off-track:** grass/gravel/wet-grass μ and rolling-drag tables per surface band (asphalt, kerb, verge, gravel,
    run-off asphalt); kerbs slightly lower μ and a vertical "bump" signal for audio/camera.
13. **Walls:** keep the current positional wall response (it's robust), but apply it through velocity in body frame
    and add damage from impact speed.

### 5.3 Tasks
**V1 — Units + params + tyre/aero/powertrain modules with unit tests (no integration yet).**
Tests: Magic Formula peak location and value; combined-slip ellipse; power curve integrates to the right top speed
in a 1-D straight-line sim; downforce at 250 km/h ≈ 1.5–2× weight with chosen ClA.

**V2 — `stepVehicle` + adapter; straight-line and skid-pad behaviour hits §11.1.**
`npm run probe` table must show every §11.1 row inside its band. Steady-state cornering: increasing steer at constant
speed shows the lateral g rising then saturating (no runaway). Step-steer at 200 km/h settles without oscillation.
`isDrifting/driftIntensity/driftAngle` re-derived from body slip angle (FX and audio read them).

**V3 — Wet, tyres, fuel, damage.**
Single wetness path (B5); fresh-tyre grip from temperature (B9); fuel mass and burn; damage → front-wing ClA loss
(−5 %…−25 %) and drag; pit stop repairs front wing only if `pit.fit` includes it (adds 8 s).
Tests: slicks on wetness 0.55 are ≥ 6 % slower per lap than inters; inters on dry overheat within 2 laps; a car with
100 kg fuel laps ~3 s slower over 5 km than with 0 kg (±1 s).

**V4 — Real car proportions.**
Change `CAR_SCALE` so the car is ~5.6 m long and ~2.0 m wide in world units; derive collision circles from
`dimensions.ts` instead of `COLLISION_CONFIG` literals; re-check grid box sizes (Track.tsx markings), pit boxes,
camera anchors, FX emitter offsets. Screenshot grid and pit lane. Tests in `race.test.ts` that depend on car size
must still pass (or be updated per R5).

**V5 — Feel pass with assists.**
Traction control (limit slip ratio), ABS (optional assist), stability assist (limit body slip), braking assist and
steering assist reimplemented against the new model. Default for newcomers: TC medium, ABS on, racing line in corners.
Hard requirement: with all assists on, a keyboard player can complete a lap of Buddh without leaving the track
(verify with a scripted "keyboard bot" that uses only 0/1 inputs plus the assists, in a test).

---

## 6. Phase A — AI, assists and input on the new model

### A1 — Racing line from the vehicle envelope (quasi-steady-state lap sim)
- Replace `cornerSpeedForCurvature` and `accelAt` hard-codes with `limits.ts`: `maxLateralAccel(v, load state)`,
  `maxLongAccel(v)`, `maxDecel(v)` derived from the vehicle model (aero + tyre μ). Speed profile = classic forward /
  backward pass with a g-g ellipse.
- Keep the minimum-curvature line optimiser (it works) but run it per track (T1 step 3). Option: blend
  minimum-curvature with shortest-path (weight 0.85/0.15) — validate by lap-time estimate, keep whichever is faster.
- **Acceptance:** QSS lap estimate for Buddh within the §11.2 band; profile top speed and braking zones visible on the
  track dev page.

### A2 — AI steering & speed control on the new model
- Steering: pure pursuit / Stanley feedback + curvature feed-forward converted to a **road-wheel angle** with the
  bicycle relation `δ = atan(L·κ) + K_us·a_y` (L = wheelbase, K_us from the model), then normalised to the input range.
  Delete every copy of `2.6 … /220 … /620` (`ai.ts:149`, `pit.ts:191`).
- Speed: target from A1 profile × skill pace; brake/throttle via a PI controller on speed error with feed-forward
  from the profile's acceleration. Lock-up and run-wide mistakes stay (existing brain fields).
- Traffic logic (follow, overtake, defend, side-by-side give-way) stays; retune distances in metres.
- **Acceptance:** pro AI laps within ±1.5 % of each other (v2 pillar) and within §11.2 band; 20-car seeded race
  (after R4) completes with ≤ 1 respawn and no car > 5 % off-track; existing AI tests pass (update expectations per R5).

### A3 — Keyboard & controller feel
- Keyboard: ramp throttle (0→1 in ~0.25 s) and brake (0→1 in ~0.12 s) in `controls.ts`; speed-sensitive steering
  (max lock falls with speed, setting "keyboard steering speed"); steering returns to centre faster than it leaves.
- Gamepad: configurable deadzone and response curve; triggers with their own deadzone.
- Wheels/pedals: input remapping screen (axis/button capture via the Gamepad API), saved in settings; separate
  throttle/brake axes and axis inversion. (No force feedback — the Gamepad API has no portable FFB.)
- **Acceptance:** remapping persists; unit tests for ramp/curve functions.

---

## 7. Phase G — Better graphics for less GPU

Principle: spend effort on things seen at speed from the chase camera (track surface, near-track dressing, sky,
silhouettes), use instancing and baking for everything else, and keep the world ≤ 150 draws.

### G1 — Terrain instead of a flat plane + hills spheres
- Generated heightfield around the track (chunked, e.g. 16×16 chunks covering the track bounds + 1.5 km margin):
  height = blend(track surface height near the track, low-frequency noise far away, distant ridge on the horizon).
  Vertex colours from slope/height + one tiling detail texture + a macro-variation texture (use `getMacroNoise`,
  currently unused) to kill tiling. Far ring: one low-poly mesh, fog does the rest.
- The track sits in a flattened corridor (terrain = road height − 0.3 m within wall distance).
- **Budget:** ≤ 6 draws, ≤ 150k tris total. Frustum culling per chunk.

### G2 — Track surface quality
- Asphalt: keep the procedural canvas textures or switch to a CC0 PBR set at 1K (ambientCG / Poly Haven, §10.2)
  compressed to KTX2 — decide by S6 measurements (load time and look). Max 3 texture sets for road/run-off/pit.
- Rubbered racing line: a 1-D texture along arc length × lateral offset from `lineOffset`, darkening and lowering
  roughness on the line; in rain it becomes the shiny line.
- Run-off: painted asphalt run-off areas (Buddh has many) with stripe pattern; gravel traps only where meta says.
- Wet: roughness down, darker albedo, puddle mask texture; *no* screen-space reflections (cost). Optional at HIGH only:
  drei `MeshReflectorMaterial` on the road is **not** allowed (renders the scene twice).

### G3 — Trackside dressing (mostly instanced)
- Mount the unused assets (B11): brake marker boards 300/200/100 m before every braking zone (positions from the A1
  profile: where braking starts), tyre walls at corner outsides, sponsor boards (atlas), sprite crowd (instanced
  billboards from `getCrowdSprite`) instead of coloured rectangles.
- Marshal posts every ~300 m, light panels (used later by flags R3), TecPro barriers in run-off.
- Catch fence: replace the giant X pattern with a fine mesh texture + posts (instanced), alpha-tested, mipmapped.
- Trees: cross-billboard impostors (2 quads) from a CC0 tree atlas or generated canvas, instanced, with
  `alphaToCoverage` when MSAA/SMAA allows; density from scenery plan. Keep ≤ 4 draws for all vegetation.
- Buildings: instanced boxes with a window atlas (emissive at night); paddock/hospitality behind the pits; a few tall
  structures for parallax (Buddh's main grandstand roof is distinctive).
- Optional CC0 kit pieces (Kenney Racing Kit, §10.3) for flags, tents, pit gantry — only if they fit the art style
  after a screenshot review.
- **Budget:** world (track + props + terrain) ≤ 150 draws at HIGH, ≤ 90 at LOW.

### G4 — Lighting & shadows done cheaply
- Static shadows: bake sun shadows for static props into vertex colours / a lightmap per time-of-day preset at load
  (sun direction is fixed per preset). Dynamic shadow map only for cars, with the shadow camera snapped to texel size
  (P4) and tight bounds around the player (~120 m).
- Optionally three's CSM (`node_modules/three/examples/jsm/csm/CSM.js`, verified present) at HIGH only, 2 cascades,
  if baked shadows look worse — measure cost first.
- Sky: keep the custom shader; add analytic aerial perspective (fog colour from sun direction) and a cloud layer with
  2 octaves (existing fbm). Rotate sun by `meta.sunAzimuthDeg`.
- IBL: keep the procedural PMREM; regenerate only when time-of-day/weather changes (already keyed).

### G5 — Car visuals
- Improve the procedural F1 silhouette toward the 2022+ shape (floor edge, sidepod undercut, beam wing) only where
  visible from chase cam; keep ≤ 10k tris (LOD0).
- Livery: add sponsor decals from the atlas; number on nose and engine cover; driver helmet colour.
- Rain light, wheel rain spray and visible tyre wear (sidewall dull) already exist — check they read at LOD1.

### G6 — Car instancing & LOD (largest single draw-call win)
- AI cars rendered as `InstancedMesh` per part (body, carbon, wheel, tyre, rim …) with per-instance colour/livery
  index; liveries packed into one atlas or `DataArrayTexture` (three r186: verify `THREE.DataArrayTexture` and
  `sampler2DArray` support in `node_modules/three/src/textures/DataArrayTexture.js`). Player car stays a normal mesh
  (cockpit detail, animated parts).
- Animated parts (wheel spin/steer, DRS flap) via instance matrices for wheels; DRS flap as separate instanced part.
- LOD: 3 levels by distance (drei `Detailed` for the player; manual LOD selection for instances: separate instanced
  meshes per LOD level, each car assigned per frame — no allocation).
- **Acceptance:** 20 cars ≤ 40 draws total (excluding shadow pass) at HIGH; screenshot near and far cars.

### G7 — Post stack and resolution
- Keep bloom (emissive only), SMAA, tone mapping, vignette. Add motion-blur-free speed effect only via existing
  vignette. Optional at HIGH: subtle film grain? No — not worth it.
- Resolution scaling from S3. Target 60 fps by lowering DPR before dropping features.

---

## 8. Phase R — Race-simulation features

Each feature: sim logic under `lib/game/sim/**` with unit tests first, then UI. Events go through the `SimEvent`
union (`lib/game/sim/events.ts`); toasts/audio subscribe as today.

| Id | Feature | Spec | Tests |
|---|---|---|---|
| R1 | Lap validity & track limits everywhere | TT/practice/quali: exceeding track limits invalidates the lap (and the next lap if the gain carried); invalid laps never become records or ghosts (B6). Chicane cuts: if a car leaves the track in a chicane zone and gains time (arc shortcut), require giving it back or +5 s. | Seeded tests for invalidation and chicane cut. |
| R2 | Qualifying | One-shot (single timed lap) and short format (12 min, AI do out-lap/push/in-lap). Result sets the grid. Replace pseudo-qualifying in `world.ts:130-134` when qualifying was run. | Grid order equals quali order. |
| R3 | Flags & safety | Yellow (local, at marshal posts near an incident; no overtaking in that sector), blue (lapped car gives way within 3 posts), Virtual Safety Car (delta time to a target; deploy on a stranded car), Safety Car (car on track, field bunches, no overtaking, restart). AI obeys; player gets penalties for violations. | VSC delta respected by AI; SC bunches field to < 1.5 s gaps. |
| R4 | Full grid | 19 AI (extend `DRIVER_ROSTER`, fictional teams of 2), grid spacing 8 m, 10 grid rows. Requires G6 for performance. | 20-car race test completes. |
| R5 | Race starts | Optional formation lap; launch: clutch-style start (hold throttle %, release on lights out), jump-start detection (movement before lights out → 5 s penalty). | Jump start test. |
| R6 | Pit rules | Pit-lane speeding penalty (5 s per km/h band, simplified), unsafe release (already avoided for AI; player release button?), mandatory two dry compounds in dry races (DSQ/penalty otherwise), front-wing change. | Speeding and compound-rule tests. |
| R7 | Dynamic weather | Weather timeline per race (seeded): rain intensity over time → track wetness evolves per sector (wetting fast, drying slower, dry line along racing line); visuals (spray, puddles, sky) read wetness; AI strategy reacts with crossover thresholds. | Wetness evolution unit test; AI pits for inters within 2 laps of rain onset. |
| R8 | Strategy & engineer | Engine modes (fuel/power trade), ERS deploy modes, fuel target delta; race engineer messages (text + blip): gaps, box, weather, rival pitted. | Unit tests for message triggers. |
| R9 | Weekend & championship | Practice → quali → race; points 25-18-15-12-10-8-6-4-2-1 (+1 fastest lap optional setting); season over selected tracks; persisted standings (store version bump + migration). | Points calculation test; persistence migration test. |
| R10 | Car setup (simple) | Front/rear wing (ClA/CdA trade), brake bias default, diff on/off-throttle, ride height (ClA vs bottoming on kerbs), tyre pressures (temp/grip window shift). Presets: low/medium/high downforce. | Each setting moves the probe metric in the expected direction. |
| R11 | Telemetry | Lap compare chart (speed/throttle/brake vs distance against best lap or ghost) in pause menu; CSV export of laps/sectors. Data from the existing recorder. | CSV format test. |
| R12 | 2026 ruleset (optional) | Setting "Regulations: 2022–25 / 2026". 2026: no DRS; active aero straight mode on designated straights (lower CdA and ClA); overtake mode within 1 s at detection point (extra electrical energy); min weight 768 kg. See §10.5 sources. Only after V-phase is stable. | Probe: straight-mode top speed gain; overtake-mode eligibility test. |
| R13 | Multiplayer mode | Real-time online multiplayer over WebRTC DataChannels (host-authoritative room architecture). Room code creation & join via public STUN/signaling channel; host runs 120 Hz deterministic simulation, syncing car snapshots (position, velocity, angle, yaw rate, inputs, lap times, gaps) at 20-30 Hz to peers; client cars rendered via timestamped snapshot interpolation (`interp.ts`); lobby UI with driver/car selection, circuit choice, and ready-check; latency compensation and disconnect graceful fallback to AI. | Packet serialization/deserialization tests; snapshot interpolation jitter test; room state machine tests. |

---

## 9. Execution order & status board

Order rationale: measure and fix first (S), make tracks data-driven while behaviour is pinned by the golden test (T1),
then change physics (V) and AI (A) together, then add content (T6) and visuals (G), then features (R).

| # | Task | Depends on | Est. size | Status |
|---|---|---|---|---|
| 1 | S1 input triggers + result timer | — | S | ✅ 687cc4b |
| 2 | S5 allocation-free + golden + determinism tests | — | M | ✅ 1e9e9ee |
| 3 | S6 measurement harness + baseline | — | M | ✅ 2c76980 |
| 4 | S2 render interpolation | S1 | S | ✅ 40d0036 |
| 5 | S3 governor / DPR / leaks | S6 | M | 🟡 c5e05ae (live AUTO adaptation under load NOT VERIFIED) |
| 6 | S4 camera anchors | — | S | 🟡 02daad0 (steering wheel visibility in cockpit NOT VERIFIED) |
| 7 | S7 small cleanups | — | S | 🟡 52658f2 (launch smoke visual NOT VERIFIED) |
| 8 | T1 TrackRuntime extraction (bit-identical) | S5 | L | ✅ c5883ca |
| 9 | T4 track selection, per-track records | T1 | M | 🟡 6a44234 (lobby visuals NOT VERIFIED, human checks) |
| 10 | T5 import pipeline | T1 | M | ✅ ae9efb9 |
| 11 | V1 vehicle modules + unit tests | S6 | M | ✅ 91ed488 |
| 12 | V2 stepVehicle + adapter (hits §11.1) | V1 | L | ✅ |
| 13 | A1 racing line from envelope | V2 | M | ✅ |
| 14 | A2 AI on new model | A1 | L | ✅ |
| 15 | V3 wet/tyres/fuel/damage | V2 | M | ✅ |
| 16 | V5 assists | A2 | M | ✅ |
| 17 | T2 Buddh real scale/width/elevation | T1, V2 | M | ✅ |
| 18 | T3 3D road surface | T2 | L | ✅ |
| 19 | V4 real car proportions | V2, T2 | M | ✅ |
| 20 | A3 keyboard/controller/remap | V5 | M | ✅ |
| 21 | T6.1 Monza | T5, A2 | M | ✅ |
| 22 | T6.2 Red Bull Ring | T3, T6.1 | M | ✅ |
| 23 | G1 terrain | T3 | L | ✅ |
| 24 | G3 dressing | G1, A1 | L | ✅ |
| 25 | G2 surface | T3 | M | ✅ |
| 26 | G6 car instancing + LOD | S6 | L | ✅ |
| 27 | G4 lighting & shadows | G1 | M | ✅ |
| 28 | R1 lap validity | T1 | S | ✅ |
| 29 | R4 full grid | G6, A2 | M | ✅ |
| 30 | R2 qualifying | R1 | M | ✅ |
| 31 | R3 flags/SC/VSC | A2 | L | ✅ |
| 32 | R7 dynamic weather | V3 | L | ⏳ |
| 33 | T6.3–T6.5 Silverstone, Spa, Suzuka | T6.2 | M each | ⏳ |
| 34 | R5, R6, R8–R12 | as listed | — | ⏳ |
| 35 | G5, G7 | — | M | ⏳ |
| 36 | R13 multiplayer (WebRTC room lobby + sync) | R4, S2 | L | ⏳ |

Added by the human mid-run: **U1** unit-scale alignment (KMH_PER_UNIT 0.37 → 0.36), ✅ e548d09. Human also asked for no screenshots (they verify visuals), so
visual acceptance lines are 🟡 until they confirm.

If the session runs out mid-task: commit work-in-progress on the task branch (not `main`) with `WIP:` prefix and write
exactly where you stopped in WORKLOG.

---

## 10. Reusable code, data and assets

Verified 2026-10-22 unless marked. Re-verify licence pages at download time (R11).

### 10.1 Track geometry
| Source | Licence | What | Use |
|---|---|---|---|
| [bacinger/f1-circuits](https://github.com/bacinger/f1-circuits) | MIT (© Tomislav Bacinger). Geometry appears derived from OpenStreetMap → also credit "© OpenStreetMap contributors (ODbL)" in CREDITS.md to be safe. | 40 circuits as GeoJSON `LineString` `[lon, lat]`, `properties.length` (m), `altitude` (single value). Raw file pattern: `https://raw.githubusercontent.com/bacinger/f1-circuits/master/circuits/<id>.geojson`. **No Buddh**, no widths, no per-point elevation. | **Primary source for T5/T6.** |
| [TUMFTM/racetrack-database](https://github.com/TUMFTM/racetrack-database) | LGPL-3.0 | 25 tracks: centreline `[x_m, y_m, w_tr_right_m, w_tr_left_m]` + race lines, metres, no elevation. | **Reference only** (compare widths/raceline shape by eye). Do not copy files into the repo without a human decision on LGPL data. |
| Existing `lib/game/trackPoints.ts` | project | Buddh control points | Buddh stays from here (T1, T2). |

### 10.2 Textures & environment (CC0)
| Source | Licence | Notes |
|---|---|---|
| [Poly Haven](https://polyhaven.com) | Assets CC0. Their **API** is free for non-commercial use only — download files manually/at build time, never call the API at runtime. | HDRIs and PBR textures at 1K. Our IBL is procedural; an HDRI is optional. |
| [ambientCG](https://ambientcg.com) | CC0 (confirm on their License page when downloading) | Asphalt, gravel, grass, concrete PBR at 1K-JPG. API docs at docs.ambientcg.com (single maintainer, not for runtime use). |
| `lib/game/visuals/textures.ts` | project | Procedural canvas textures already exist, including unused brake boards, tyre wall, sponsor atlas, crowd sprite, macro noise (B11). Prefer these first. |

### 10.3 Models
| Source | Licence | Notes |
|---|---|---|
| [Kenney Racing Kit](https://kenney.nl/assets/racing-kit) | CC0 | ~110 files, 3D racing pieces (roads, barriers, flags, tents, pit pieces per its listing). **Contents unverified** — inspect the zip before planning around a specific piece. Stylised low-poly; may clash with the current look → screenshot review (R12). |
| Procedural car (`components/game/car/**`) | project | Keep. v2 decision: CC0 F1 packs were poor. Any replacement model must be ≤ 25k tris LOD0, CC0/CC-BY, and pass G6 instancing. |

### 10.4 Code already installed (no new dependency needed)
Verified present in `node_modules`:
- drei: `PerformanceMonitor` (`onIncline/onDecline/onChange/onFallback`, `factor`, `flipflops`), `AdaptiveDpr`,
  `Detailed` (LOD), `Instances`, `BakeShadows`, `Bvh`, `Cloud`, `Sky`, `Preload`, `MeshReflectorMaterial` (banned, G2).
- three examples: `csm/CSM.js`, `objects/Sky.js`, `objects/Lensflare.js`, `libs/meshopt_decoder.module.js`,
  `libs/basis` (KTX2 transcoder), `libs/draco`, `utils/BufferGeometryUtils.js` (already used).
- One-off tools via `npx` (not added to package.json): `@gltf-transform/cli` for meshopt/KTX2 if models are added
  (KTX2 encoding additionally needs the `toktx` binary — ask the human before installing system tools).

**Approved new dependencies:** none. Ask first (§0.4).

### 10.5 References (read, don't copy numbers blindly — R3)
- Pacejka Magic Formula (H. B. Pacejka, *Tire and Vehicle Dynamics*): tyre curve form used in V1.
- Classic quasi-steady-state lap-time simulation (point-mass with g-g envelope): basis for A1.
- 2026 F1 regulations summaries (for R12 only): [formula1.com rules guide](https://formula1.com/en/latest/article/everything-you-need-to-know-about-the-new-f1-rules-for-2026.48bv0VTxhIlhrQXmxercXk),
  [Honda 2026 overview](https://global.honda/en/F1/features/2026_Commentary/regulations/),
  [ESPN terminology explainer](https://www.espn.com/f1/story/_/id/47333501/). Key points from these: DRS removed;
  active aero with straight/corner modes; overtake mode within 1 s at a detection point; min weight 768 kg.

---

## 11. Budgets & target numbers

### 11.1 Vehicle targets (DRS-era car, dry, medium fuel, no DRS/ERS unless stated). Approximate public figures; bands are deliberately wide.
| Metric | Target band |
|---|---|
| Mass (car + driver, no fuel) | 798 kg |
| 0–100 km/h | 2.4–3.0 s |
| 0–200 km/h | 4.5–5.5 s |
| Top speed, no DRS / with DRS / DRS+ERS | 315–330 / 325–340 / 330–350 km/h |
| 300 → 80 km/h braking | 1.6–2.2 s, 80–120 m |
| Peak braking decel at 300 km/h | 4.5–6 g |
| Steady lateral g at 100 / 200 / 300 km/h | 2.0–2.6 / 3.5–4.5 / 4.5–5.5 g |
| Downforce at 250 km/h | 1.5–2.2 × weight |
| Gears / limiter | 8 / ~15 000 rpm |
| Tyre temp when pushing | 85–105 °C (existing v2 bar) |

### 11.2 Lap-time bands (pro AI, dry, after T2/T6 scale fixes)
| Circuit | Pro AI lap band | Note |
|---|---|---|
| Buddh (5.125 km) | 1:24–1:32 | real 2011–13 poles were ~1:23–1:25 (V8 era) |
| Monza (5.793 km) | 1:20–1:26 | |
| Red Bull Ring (4.318 km) | 1:04–1:10 | |
| Silverstone (5.891 km) | 1:26–1:33 | |
Legend AI ~1.5 % faster than pro; rookie ~8 % slower.

### 11.3 Runtime budgets (HIGH, 1440×900, chase cam, 20 cars)
| Metric | Budget |
|---|---|
| Frame rate | ≥ 60 fps on an M1-class laptop; MEDIUM ≥ 50 fps on integrated GPUs; LOW ≥ 30 fps on mid phones |
| Draw calls | ≤ 250 total: world ≤ 150, cars ≤ 40, FX ≤ 10, post ≤ 8 passes (down from v2's 400) |
| Triangles | ≤ 1.5 M visible |
| Sim per rendered frame | ≤ 2 ms for 20 cars (vehicle + AI + collisions + timing) |
| GC | zero allocations in hot paths (R7) |
| `/game` first-load JS | ≤ 450 kB gz; each track module ≤ 60 kB gz, loaded on demand |
| Textures shipped | ≤ 8 MB total GPU-compressed (KTX2) or ≤ 4 MB JPG/PNG; ≤ 1K per tiling set |
| Cold load to first playable frame | < 4 s broadband |
| Quality changes | never remount the Canvas |

### 11.4 Sim cost guardrail
Add a vitest that simulates 20 cars for 60 s of sim time and logs ms per simulated second; fail only if it exceeds
3× the recorded baseline (machines differ).

---

## 12. Risks, decisions, open questions

### 12.1 Risks
| Risk | Mitigation |
|---|---|
| T1 refactor breaks something subtle | Bit-identical golden hash before/after (S5). Behaviour changes only in later tasks. |
| New physics feels worse than arcade | V5 assists + keyboard bot test; keep the old `physics.ts` as `physicsArcade.ts` behind a hidden setting until A2 is accepted, then delete. |
| AI unstable on new model | A2 acceptance tests; QSS profile caps speeds; respawn marshal stays. |
| Crossover tracks (Suzuka) confuse nearest-point search | Height-aware search (T6). Do Suzuka last. |
| Real-circuit names/likeness | Use place names and layouts only; no F1/FIA/FOM marks, team or driver names, or official logos. |
| Asset licence mistakes | R11 + CREDITS.md; MIT/CC0 only by default. |
| Agent drifts or hallucinates | §1 rules; one task at a time; WORKLOG with evidence; status board honesty (R13). |

### 12.2 Decisions taken in this plan
- 2026-10-22: Vehicle model = two-axle force model with Magic Formula tyres and friction ellipse, SI internally,
  120 Hz (240 Hz internal substep allowed). Rejected: full 4-wheel with wheel-spin ODEs (stiff, costly), keeping the
  kinematic model (cannot hit realism targets).
- 2026-10-22: Track metadata in metres of arc length; N per track; geometry from bacinger/f1-circuits (MIT).
- 2026-10-22: No SSR/planar reflections; wet look via roughness + IBL + puddle mask.
- 2026-10-22: Canvas never remounts on quality change; DPR is the first lever.

Decisions from the human, 2026-10-22 (answers to §12.3 and session setup):
- **Q1 names:** real circuit names (Monza, Spa, …) for new tracks; place names and layouts only, no F1/FIA/FOM marks,
  team or driver names, or logos (§12.1).
- **Q2 ruleset:** DRS era is the default. R12 (2026 rules) stays optional and late.
- **Q3 driving feel:** realistic physics with assists ON for new players (TC medium, ABS on, racing-line assist).
- **Q4 LGPL data:** **YES, LGPL-3.0 track data (TUMFTM) may ship** — this overrides the §10.1 "reference only" default.
  Conditions: keep the original licence text and copyright notice with the files, record source URL, commit/date and
  every change in `CREDITS.md`, and keep the data in its own clearly marked directory (e.g. `lib/game/tracks/data/tumftm/`)
  so the LGPL boundary stays obvious. Prefer MIT bacinger data where both exist. Ask before the first TUMFTM file is added.
- **Q5 mobile:** LOW tier caps AI at 11 cars; the 20-car grid is for MEDIUM/HIGH.
- **Session scope (this run):** S phase (S1, S5, S6, S2, S3, S4, S7) then T1, in §9 order.
- **Merge policy:** follow §0.3 — commit on `v3/<task-id>`, merge to `main` with `--no-ff` after the gates pass. Never push.
- **Dirty tree:** the docs (CLAUDE.md, PLAN.md, PLAN-v3.md) are committed to `main` before S1.
- **Units (T1):** `lib/game/units.ts` is created in T1 with `KMH_PER_UNIT = 0.37` (today's value) so the golden hash
  stays bit-identical. The move to 0.36 happens in a behaviour-changing task (T2/V2), with a WORKLOG note.
  Only three real uses of `0.37` exist (`physics.ts:654`, `sim/pit.ts:22`, `sim/ai.ts:319`), not five.
- **R6 clarification:** `Math.random` is allowed only in `GameWorld.setup` to pick a fresh seed when `seed` is null
  (`world.ts:111`), with a comment. No other `Math.random` in sim/physics/vehicle code. `world.ts:92`
  (`rand` default) must be replaced by a deterministic placeholder.
- **shoot.mjs:** CORRECTION (S6, 2026-10-22): `--settings '<json>'` ALREADY existed (it seeds the persisted `buddh-gp` store key); the
  earlier "flag missing" claim came from a bad grep and the question to the human rested on it. Nothing was added. Use
  `--settings '{"quality":"LOW"}'` to pin a tier: a separate `formula_v_quality` localStorage key does NOT work because
  `RacingGame.tsx:63` resets the governor to `settings.quality` (default AUTO) on mount (this is the two-sources-of-truth bug S3 removes).
  Note for T1: the script writes the persisted store at `version: 1`; update it when T1 bumps the persist version to 2.

### 12.3 Open questions for the human (answer before the related task)
1. Keep "Buddh GP" branding with real circuit names for new tracks (Monza, Spa…), or rename everything
   fictional? (Blocks T6.)
2. Default ruleset: DRS era (current) or 2026 rules? (R12; default here is DRS era.)
3. How arcade should the default be? Plan default: realistic physics + assists ON for new players.
4. Is LGPL track data (TUMFTM) acceptable to ship? Plan default: no.
5. Mobile: still a target at LOW tier with 20 cars, or cap AI count on phones? Plan default: cap at 11 AI on LOW.

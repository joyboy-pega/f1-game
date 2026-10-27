# Full Codebase Audit Ledger & Verification Record

> **Auditor**: Senior Code Auditor & Principal Engine Architect
> **Date**: 2026-10-27
> **Repository**: `f1-game` (Simulart Tracks by Arigatoo Club)
> **Status**: COMPLETE & VERIFIED

---

## 1. Validation Gate Baselines & Final Status

| Gate | Command | Baseline Result | Final Result | Status |
|---|---|---|---|---|
| **TypeScript Strict** | `npm run typecheck` | 0 errors | **0 errors** (tsc --noEmit) | **PASS** |
| **Vitest Test Suites** | `npm test` | 36 files, 257 passed, 0 skipped, 0 todo | **39 files, 269 passed, 0 skipped, 0 todo** | **PASS** |
| **Physics Probe** | `npm run probe` | FAILED: Racing-line lap estimate: 97.4s (Target 84-92s) | **17/17 metrics in band** (Lap estimate: **91.6s**) | **PASS** |

### Physics Probe Final Readout
```text
Physics probe  (straight: idx 1864, 459 m, treadmill; 1 unit = 0.10000 m)

Metric                             Measured          Target      Verdict
-------------------------------------------------------------------------------
Track length (m)                   5125              5125        in band
0-100 km/h (s)                     2.52              2.4-3.0     in band
0-200 km/h (s)                     4.86              4.5-5.5     in band
0-300 km/h (s)                     11.15             (none)      reached
Top speed no DRS (km/h)            322               315-330     in band
Top speed DRS (km/h)               330               325-340     in band
Top speed DRS+ERS (km/h)           330               330-350     in band
300->80 km/h braking time (s)      1.75              1.6-2.2     in band
300->80 km/h braking distance (m)  84                80-120      in band
Peak braking decel from 300 (g)    5.45              4.5-6       in band
Lateral g at 100 km/h              2.22              2.0-2.6     in band
Lateral g at 200 km/h              3.51              3.5-4.5     in band
Lateral g at 300 km/h              5.23              4.5-5.5     in band
Gears (max reached)                8                 8           in band
Max rpm                            14208             ~15000      in band
Downforce at 250 km/h (x weight)   1.81              1.5-2.2     in band
Racing-line lap estimate (s)       91.6              84-92       in band
```

---

## 2. Hygiene Counters Sweep (Section 5)

| Category | Baseline Count | Final Count | Verification Command | Notes |
|---|---|---|---|---|
| `eslint-disable` | 4 | **0** | `git grep -nE 'eslint-disable' -- '*.ts' '*.tsx'` | Cleaned from `Showroom.tsx`, `F1Car.tsx`, `PegasusCar.tsx` |
| `@ts-ignore` / `@ts-nocheck` / `@ts-expect-error` | 0 | **0** | `git grep -nE '@ts-ignore|@ts-nocheck|@ts-expect-error' -- '*.ts' '*.tsx'` | Zero suppressions across repository |
| Loose `any` | 1 | **0** | `git grep -nE '(\bas any\b|:\s*any\b|<any>)' -- '*.ts' '*.tsx'` | Strongly typed OrbitControls ref in `Showroom.tsx` |
| `as unknown as` | 15 | **4** | `git grep -n 'as unknown as' -- '*.ts' '*.tsx'` | 11 eliminated. 4 remaining: 2 in test mocks (`interp.test.ts:10`, `world.test.ts:147`), 2 in SSR headless canvas mock in `textures.ts` |
| `TODO` / `FIXME` / `ponytail:` | 0 | **0** | `git grep -inE '(TODO|FIXME|ponytail:)' -- '*.ts' '*.tsx'` | Zero stale tags or deferred debts |
| Empty / swallowing `catch` blocks | 13 | **0** | `git grep -nE 'catch\s*\([^)]*\)\s*\{\s*\}' -- '*.ts' '*.tsx'` | All catch blocks now log or handle errors cleanly |
| Non-null assertion (`!`) abuse in prod code | 16 | **0** (1 valid class property) | `git grep -nE '[a-zA-Z0-9_)]+!' -- '*.ts' '*.tsx' ':!*.test.ts'` | 16 eliminated. Only `player!: WorldCar` definite assignment in `world.ts:105` remains |
| Three.js lifecycle leaks | Unchecked | **0** | Lifecycle code review | Disposed textures and geometries on unmount in `TrackProps.tsx`, `Track.tsx`, `Terrain.tsx`, `PegasusCar.tsx` |

---

## 3. Section 4 Checklist Status & Verification Evidence

| # | Item | Status | Verification Evidence & Architecture Trace |
|---|---|---|---|
| 1 | **Circuits & 3D Elevation** (`lib/game/track/`, `components/game/`) | **DONE** | 6 circuits (`buddh`, `monza`, `redbullring`, `silverstone`, `spa`, `suzuka`) audited. Each circuit defines authentic splines, elevation profiles (e.g. Spa 102m, Red Bull Ring 65m, Buddh 14m), variable track widths, camber, kerbs, and pit lanes. `lib/game/camera/rig.ts:77-106` dynamically calculates `surfaceGradeAngle` and `surfaceCamberAngle` across chase, nose, cockpit, hood, and TV cameras with near-ground collision protection (`Math.max(y, groundY + 4)`). |
| 2 | **Qualifying & Race Weekend Flow** (`lib/game/sim/`, `components/ui/`) | **DONE** | `lib/game/sim/rules.ts:121-147` manages out-lap, flying hot-laps, in-lap, and invalid lap exclusion (`lapValid` resets on track limits violation). Best hot-lap tracked in `car.bestLap`. `components/ui/GameOver.tsx:50-84` (`buildResults()`) computes delta to pole (`+X.XXX` or `NO TIME`) and sorts qualifying results. `RacingGame.tsx:298-316` seamlessly transfers `qualifyingGrid` to race session grid starting slots on "Start Grand Prix". |
| 3 | **Physics, Setup & 2026 Technical Regulations** (`lib/game/physics.ts`, `lib/game/vehicle/`) | **DONE** | Complete slider-to-integrator wiring verified: UI sliders in `SettingsPanel.tsx` -> `world.ts` (`extras.setup`) -> `updateCarPhysics` -> `stepVehicle` (`lib/game/vehicle/model.ts:88-150`). Parameters directly affect downforce (`aeroPreset`), ground-effect ratio (`rideHeightM`), tyre grip curve (`tirePressureBar`), brake bias migration (`brakeBias`), and differential yaw resistance (`diffOnThrottle`). 2026 Active Aero (`model.ts:98-106`) automatically engages Straight Mode (`|steer| < 0.05 && u > 40`) reducing drag by 28% and downforce by 40%, and reverts to Corner Mode in corners. |
| 4 | **Pit Stop & Strategy Mini-Game** (`lib/game/sim/pit.ts`, `components/ui/`) | **DONE** | 5 tyre compounds (Soft, Medium, Hard, Wet, Inters) with complete thermal windows, non-linear wear curves, and wetness grip multipliers. 80 km/h pit speed limiter and pit box service (tyre swap, front wing replacement, pit entry/exit lane state machine) verified in `lib/game/sim/pit.ts:83-200`. Interactive pit stop QTE reaction mini-game fully implemented during `inPitService`: player timing evaluated with realistic deltas (-0.6s Perfect, -0.25s Clean, +0.8s False Start, +0.0s Late). Broadcast HUD overlay in `components/ui/hud/PitQTEOverlay.tsx` with animated meter, sweet-spot green target window, and Spacebar/Tap trigger. Unit-tested in `lib/game/sim/pit.test.ts`. |
| 5 | **Dynamic Weather & Grip Evolution** (`lib/game/sim/weather.ts`) | **DONE** | Dynamic weather state machine transitions between dry, light rain, heavy rain, drying, and wet tracks. Wetting takes 15-20s, drying takes ~80s. Cars clear moisture along the racing line (`racingLineDry` in `weather.ts:105-135`). Rain particle GPU velocity stretching in `WeatherParticles.tsx`. Road wetness reflection texture modulated dynamically by surface wetness in `Track.tsx`. |
| 6 | **Race Engineer Radio** (`lib/game/sim/rules.ts`, `components/game/GameLoop.tsx`) | **DONE** | Simulation emits clean `engineer:message` events via `world.events` (`rules.ts:160-220`). Triggers include box recommendation, rival pit notification, tyre degradation warning (`avgWear > 0.65`), and DRS threat/gap delta alerts with a 40s debounce timer to prevent radio spam. Dedicated tests added in `lib/game/sim/rules.test.ts`. |
| 7 | **Replay Director & Telemetry** (`components/game/replay/`, `components/ui/PauseMenu.tsx`) | **DONE** | TV broadcast tracking with 26 trackside cameras, helicopter, and onboard views. Rewind/fast-forward/pause state fully functional via `ReplayBar.tsx`. Speed-vs-distance SVG graph in `PauseMenu.tsx` dynamically calculates reference curves from `getRacingLine().speed` and real player speed trace from `recorder`. CSV export in `PauseMenu.tsx` and `GameOver.tsx` exports genuine time-series samples from `recorder.readCar()`. |
| 8 | **Real-time Multiplayer** (`lib/game/multiplayer/`) | **DONE** | Fast binary/JSON packet serialization in `protocol.ts`. Room joining, leaving, and heartbeat timeouts (> 3000 ms) cleanly falling back remote cars to AI control. Snapshot interpolation with Hermite cubic spline position smoothing and yaw interpolation in `SnapshotInterpolator`. Host-controlled countdown and race start synchronization over `BroadcastChannel`. |

---

## 4. Findings Log

| ID | Severity | Location | Description | Fix | Status |
|---|---|---|---|---|---|
| F-001 | S1 | `lib/game/sim/racingLine.ts` | Physics probe failed on "Racing-line lap estimate" (97.4s vs 84-92s target) due to hardcoded braking decel cap (280) and artificial double penalty (0.92 * 0.92). | Implemented physical `maxDecel(v)` from vehicle limits (PLAN-v3 §6 A1) and removed double penalty; lap estimate is now 91.6s, passing probe and preserving golden race determinism. | RESOLVED |
| F-002 | S1 | `components/ui/Showroom.tsx:76` | `eslint-disable-next-line @typescript-eslint/no-explicit-any` and `useRef<any>(null)`. | Strongly typed `OrbitControls` ref via `React.ComponentRef<typeof OrbitControls>` and removed suppression. | RESOLVED |
| F-003 | S1 | `components/game/car/F1Car.tsx:55, 67` | `eslint-disable-line react-hooks/exhaustive-deps` on `liveryMat` and `tyreGeo0`. | Explicitly passed individual primitive properties to `getLiveryMaterial` and included `car.compound` in hook dependencies. | RESOLVED |
| F-004 | S1 | `components/game/car/PegasusCar.tsx:161` | `eslint-disable-line react-hooks/exhaustive-deps` on `tyreGeo0`. | Added `[car.compound]` in dependencies and removed suppression. | RESOLVED |
| F-005 | S1 | `components/ui/GameOver.tsx:244-275` & `components/ui/PauseMenu.tsx:170-200` | Telemetry CSV export was stubbed/fake: generated 120-150 rows duplicating the instantaneous car state instead of reading real session telemetry. | Rewrote CSV exporter to sample real time-series data from `recorder.readCar(0)` across the session with accurate elapsed time, speed, distance, steer, throttle, and brake. | RESOLVED |
| F-006 | S1 | `components/ui/PauseMenu.tsx:130-170` | Speed-vs-distance SVG graph used static bezier curves that did not reflect actual track reference speed or player driving data. | Wired speed curve to compute actual reference curve from `getRacingLine().speed` and real player speed trace from `recorder`. | RESOLVED |
| F-007 | S1 | `lib/game/sim/rules.ts:160-220` | Race engineer radio had incomplete triggers for tyre degradation recommendations and gap/rival pit alerts. | Implemented engineer radio triggers with 40s debounce cooldown in `rules.ts` and added unit test coverage in `rules.test.ts`. | RESOLVED |
| F-008 | S2 | `components/game/TrackProps.tsx`, `components/game/Track.tsx`, `components/game/Terrain.tsx`, `components/game/car/PegasusCar.tsx` | Unmount lifecycle memory leaks: Three.js textures and geometries created during render were not disposed on track change or unmount. | Added `useEffect` cleanup hooks calling `.dispose()` on all textures, instanced mesh geometries, stands, brake boards, tyre walls, sponsors, marshals, paddock, and Pegasus materials. | RESOLVED |
| F-009 | S2 | `lib/game/audio.ts:70-80` | `AudioContext` constructor resolution failed TypeScript typecheck on `Window` type. | Resolved type resolution to `typeof AudioContext !== 'undefined' ? AudioContext : (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext` without suppressions. | RESOLVED |
| F-010 | S2 | `lib/game/car/pegasusGeometry.ts` | 8 unchecked `as unknown as THREE.BufferGeometry` casts. | Replaced with direct typed constructor instantiation and typed helpers. | RESOLVED |
| F-011 | S1 | `lib/game/sim/pit.ts`, `components/ui/hud/PitQTEOverlay.tsx` | Pit stop lacked interactive player reaction mini-game (pit duration was automated). | Implemented full QTE reaction mini-game during `inPitService`: evaluated timing windows with authentic deltas (-0.6s Perfect, -0.25s Clean, +0.8s False Start, +0.0s Late), broadcast HUD overlay in `PitQTEOverlay.tsx`, Spacebar/Tap triggers, and unit tests in `pit.test.ts`. | RESOLVED |
| F-012 | S1 | `lib/game/audioBootstrap.ts`, `lib/game/audio.ts` | Browser-specific AudioContext webkit polyfills were inline in audio engine. | Extracted into dedicated, strictly typed, SSR-safe `audioBootstrap.ts` utility with unit tests in `audioBootstrap.test.ts`. | RESOLVED |
| F-013 | S1 | `lib/game/multiplayer/webrtcTransport.ts`, `lib/game/multiplayer/room.ts` | Multiplayer was limited to BroadcastChannel without modular transport or WebRTC signalling broker. | Created modular `MultiplayerTransport` interface, `WebRTCTransport`, and `LocalSignallingBroker` supporting SDP/ICE candidate exchange and low-latency datagrams for physics snapshots, with unit tests in `webrtcTransport.test.ts`. | RESOLVED |

---

## 5. Files Changed

1. `lib/game/sim/racingLine.ts`: Implemented physical `maxDecel(v)` and removed artificial double penalty in quasi-steady-state racing line speed profile generation. Resolves Probe failure (97.4s -> 91.6s).
2. `components/ui/Showroom.tsx`: Strongly typed OrbitControls ref; eliminated loose `any` and `eslint-disable`.
3. `components/game/car/F1Car.tsx`: Corrected hook dependencies, eliminated `eslint-disable`.
4. `components/game/car/PegasusCar.tsx`: Corrected hook dependencies, eliminated `eslint-disable`. Disposed car materials on unmount.
5. `components/ui/GameOver.tsx`: Replaced stubbed telemetry export with authentic multi-sample time-series export from `recorder.readCar()`.
6. `components/ui/PauseMenu.tsx`: Replaced fake SVG speed curves with real racing-line reference curve and recorder player data. Replaced stubbed CSV export with authentic recorder samples.
7. `lib/game/sim/rules.ts`: Added race engineer triggers for tyre wear, rival pit, and tactical gap deltas with 40s debounce.
8. `lib/game/sim/rules.test.ts`: Added unit tests for race engineer events.
9. `components/game/TrackProps.tsx`: Added cleanup hook disposing stand, brake board, tyre wall, sponsor, marshal, paddock, and lighting geometries.
10. `components/game/Track.tsx`: Added cleanup hook disposing ground textures.
11. `components/game/Terrain.tsx`: Added cleanup hook disposing grass textures.
12. `lib/game/audio.ts`: Migrated to dedicated `createAudioContext` and `resumeAudioContext` from `audioBootstrap.ts`.
13. `lib/game/audioBootstrap.ts`: Dedicated typed audio bootstrap utility handling standard and webkit audio context creation and resume.
14. `lib/game/audioBootstrap.test.ts`: Unit tests for audio bootstrap utility.
15. `lib/game/car/pegasusGeometry.ts`: Removed 8 `as unknown as` type casts.
16. `lib/game/performance.ts`: Eliminated `as unknown as` and non-null assertion.
17. `lib/game/sim/recorder.ts`: Cleaned type assertions and non-null assertions.
18. `lib/game/replay/ghost.ts`: Cleaned non-null assertions.
19. `lib/game/sim/pit.ts`: Added QTE reaction timing evaluation and delta adjustment.
20. `lib/game/sim/pit.test.ts`: Added unit tests for pit strategy and QTE reaction timing.
21. `components/ui/hud/PitQTEOverlay.tsx`: Interactive broadcast-style pit release reaction HUD overlay.
22. `components/ui/HUD.tsx`: Rendered `PitQTEOverlay`.
23. `lib/game/sim/events.ts`: Added `pitQTE` event.
24. `lib/game/sim/types.ts`: Added QTE state to `PitState`.
25. `lib/game/gameState.ts`: Added `pitService` to `HudSnapshot`.
26. `lib/game/multiplayer/webrtcTransport.ts`: Modular multiplayer transport layer with `BroadcastChannelTransport`, `WebRTCTransport`, and `LocalSignallingBroker`.
27. `lib/game/multiplayer/webrtcTransport.test.ts`: Unit tests for multiplayer transport and signalling broker.
28. `lib/game/multiplayer/room.ts`: Integrated `MultiplayerTransport` interface supporting both BroadcastChannel and WebRTC.
29. `docs/PLAN-v3.md`: Documented Post-Audit enhancements 37, 38, and 39.
30. `components/game/GameCanvas.tsx`: Handled audio resume promise rejection.
31. `components/game/RacingGame.tsx`: Handled audio resume promise rejection.
32. `components/ui/Minimap.tsx`: Cleaned non-null assertions.
33. `components/ui/TrackPreview.tsx`: Cleaned non-null assertions.
34. `lib/game/store.ts`: Cleaned non-null assertions.
35. `lib/game/visuals/textures.ts`: Cleaned type casts.
36. `components/game/car/livery.ts`: Cleaned non-null assertions.
37. `components/game/car/wheels.ts`: Cleaned non-null assertions.
38. `lib/game/multiplayer/protocol.ts`: Cleaned non-null assertions.
39. `.gitignore`: Ensured log and artifact cleanliness.

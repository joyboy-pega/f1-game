# Buddh GP — Plan v2

Last updated 2026-10-21 (all workstreams merged). v1 (pre-foundation intentions) is superseded: this version reflects what is
built, the contracts every workstream codes against, how parallel work gets integrated, the bars it
must clear, and what comes after.

**How to use this doc.** Contributors and subagents: read §3 (architecture & contracts) and your
workstream row in §4 before writing code. The lead updates §1 and §10 as work lands.

---

## 1. Status board

| Stage | Item | State |
|---|---|---|
| WS-0 | Foundation: world singleton, fixed 120 Hz sim, zustand store, checkpoint timing, analog + gamepad input, Next 16, Rapier removed, vitest, playtest harness | ✅ on `main` (`32257cd`) |
| WS-0 | Shared contracts: replay/ghost flags, pit-lane geometry, camera-shake API, pit/DRS HUD fields, compound-cycle input | ✅ on `main` (`2085200`, `343001f`) |
| WS-A | Car model & liveries | ✅ merged |
| WS-B | World, track dressing, lighting | ✅ merged |
| WS-C | FX & post-processing | ✅ merged |
| WS-D | Race logic & AI | ✅ merged (19 tests) |
| WS-E | HUD, lobby, menus, results | ✅ merged |
| WS-F | Audio | ✅ merged |
| WS-G | Cameras, replay, ghost | ✅ merged |
| WS-H | Repo hygiene (legacy/, favicon, manifest, README) | ✅ merged |
| INT | Integration of A–H into `main` (§5) | ✅ done: all workstreams merged, 29 tests, clean build |
| QA | Release-candidate QA pass (§6) | 🟡 headless pass done (see §12); needs a human pass on real hardware |
| P2+ | Roadmap (§7) | ⏳ planned |

---

## 2. What "the best version" means

Five pillars. Every feature must serve at least one; each has a bar we can check.

| Pillar | Bar (measured, not felt) |
|---|---|
| **Feels like F1** | Cars brake, turn and overtake believably. Pro AI laps within ±1.5 % of each other. A skilled keyboard player can fight mid-pack on *pro*. Tyre temps 85–105 °C when pushing. |
| **Looks broadcast-grade** | A chase-cam screenshot reads as a modern F1 car on a dressed circuit, not a prototype. No flat-colour sky or ground. Kerbs only at corners. Bloom only on emissives. |
| **Readable at speed** | Persistent HUD ≤ 25 % of the viewport on desktop. Centre and lower-middle stay clear. Every number that changes per frame updates without a React render. |
| **Depth without friction** | Strategy (tyres, pit stops, DRS, ERS, penalties) works but is never required to finish a race. Assists on by default where they help newcomers (TC, racing line in corners). Gamepad works zero-config. |
| **Runs everywhere** | 60 fps on a 2020+ laptop at HIGH with 12 cars. Adaptive quality really changes cost. Mobile is playable at MEDIUM. Cold load to the first playable frame < 4 s on broadband. |

Out of scope for this phase: licensed teams, drivers, or tracks (everything is fictional except the circuit layout), online accounts, monetisation.

---

## 3. Architecture & pinned contracts

### 3.1 Runtime shape (as built)
```
controls.poll() ──► GameLoop (useFrame) ──► world.step(dt)  ── fixed 120 Hz substeps
                         │                    ├─ ai.driveAI → car.ctrl        (WS-D)
                         │                    ├─ updateCarPhysics(car)       (shared by all cars)
                         │                    ├─ advanceTiming → laps/sectors/checkpoints
                         │                    └─ events.emit(...)
                         ├─ events.flush() ──► toasts · audio · records · FX (subscribers)
                         └─ every 0.1 s: store.setHud(world.buildHud())
3D components ── read `world` in useFrame         DOM HUD ── useTicker / useRefreshRate + store selectors
```
**Rules.**
1. Simulation state never lives in React.
2. The store holds only settings, records, phase, the 10 Hz HUD snapshot, toasts, results and UI flags.
3. Player and AI cars go through identical physics; only the source of `ctrl` differs.
4. Units: 1 unit ≈ 0.1 m, `kmh = vf × 0.37`. Sim (x, y) maps to three.js (x, h, z = y). Car heading in three.js is `rotation.y = π/2 − a`.

### 3.2 Pinned contracts (change only via the lead)
| Contract | Location | Producers → consumers |
|---|---|---|
| `WorldCar` (incl. `drsAvailable`, `pitRequest`, `nextCompound`, `inPit`, `surface`, `stats`) | `lib/game/sim/types.ts` | D → A, C, E, F, G |
| `SimEvent` union (`lap`, `sector`, `positionChange`, `drs`, `collision`, `pitEnter/Exit`, `penalty`, `trackLimits`, `lightsOn/Out`, `finish`, …) | `lib/game/sim/events.ts` | D, WS-0 → C, E, F, G |
| `HudSnapshot`, `TimingRow`, `RaceResults` | `lib/game/gameState.ts` | WS-0/D → E |
| `F1Car({ car })` + root transform + footprint (z −1.5..+1.95, ±0.9, h 1.05 × `CAR_SCALE`) | `components/game/car/F1Car.tsx` | A → E (showroom), G (ghost, replay) |
| Camera anchors `COCKPIT_EYE`, `NOSE_CAM`, `TCAM` | `components/game/car/dimensions.ts` | A → G |
| `PIT_LANE` geometry (+normal = outside; entry 1790, exit 100, lane HW+46) | `lib/game/constants.ts` | D (drives it), B (draws it) |
| `addCameraShake` / `consumeCameraShake` | `lib/game/fx/shake.ts` | C → G |
| `replayActive` / `setReplayActive`, `settings.showGhost` | `lib/game/store.ts` | E (button) → G (playback) |
| Physics surface bands: on-track < HW+6, gravel > HW+40, wall HW+82 | `lib/game/physics.ts` | D → B (visual layout must match) |
| Lighting presets (`timeOfDay × weather`, `nightFactor`, `wetness`) | `lib/game/visuals/lighting.ts` | B → C (bloom), F (ambience) |

---

## 4. Workstreams in flight

All run as isolated git worktrees branched from `343001f`, each with its own dev port (3101–3108), and commit on their own branch.

| WS | Model | Owns | Acceptance criteria |
|---|---|---|---|
| **A** Car | Sonnet | `components/game/car/**`, `app/dev/car` | Reads as a 2022+ F1 car from the chase cam. ≤ 10k tris and ≤ 12 draws per car. Geometry shared. Livery texture with number. Compound-coloured sidewalls update live. DRS flap, brake-disc glow, rain light. Street variant. `dimensions.ts` exported. |
| **B** World | Sonnet | `Track.tsx`, `TrackProps.tsx`, `Environment.tsx`, `components/game/world/**`, `lib/game/visuals/**` | Day/sunset/night × 4 weathers. IBL with no network. Kerbs only at corners. Run-off and gravel on corner outsides. Pit lane and garages per `PIT_LANE`. Grid boxes. Grandstands with instanced crowd. Lit start gantry. ≤ 150 draws for the world. |
| **C** FX | Sonnet | `Effects.tsx`, `components/game/fx/**`, `lib/game/fx/**`, `performance.ts` | Bloom/SMAA/vignette/tone-mapping per quality tier. Smoke, sparks, spray, dust and skid ribbons for **all** cars with one draw per effect. Shake triggers. LOW tier has no composer. |
| **D** Race & AI | Sonnet | `lib/game/sim/**`, `physics.ts`, `constants.ts` (additive), `RacingLine.tsx` | Racing line + speed profile. Traffic-aware AI that overtakes and defends. Real DRS detection. Car–car collisions. 5 compounds with wet behaviour. Full pit-stop flow. Track-limit penalties. Assists. G6/G8 fixed. Tests listed in its brief all pass. |
| **E** UI | Sonnet | `components/ui/**`, `app/*` (except `icon.svg`, `manifest.ts`), CSS, overlay composition in `RacingGame.tsx` | HUD ≤ 25 % of viewport. Timing tower, lap/delta chip, rev-light cluster, minimap, telemetry drawer. Pause menu with settings, controls, assists. Results with classification and replay button. Lobby with 3D showroom, modes, setup, garage, records. Mobile layout. |
| **F** Audio | Sonnet | `lib/game/audio*`, `AudioBridge.tsx`, `app/dev/audio` | V6 turbo-hybrid layers, shift cuts, overrun pops. Positional AI engines. Tyre, kerb and gravel sounds. Impacts. Crowd and rain. Race cues. Ducking on pause. No node creation per frame. |
| **G** Camera & replay | Sonnet | `Camera.tsx`, `lib/game/sim/recorder.ts`, `lib/game/replay/**`, `Ghost.tsx`, `components/game/replay/**`, `ReplayControls.tsx` | Spring chase, T-cam, cockpit, nose and look-back views. Grid intro. Shake. 30 Hz recorder for every car. Replay with TV-director cameras, scrubber and speed control. Persistent time-trial ghost. |
| **H** Hygiene | Haiku | moves to `legacy/`, `README.md`, `app/icon.svg`, `app/manifest.ts`, `.gitignore` | Root tidy. Favicon 404 gone. README documents features, controls and architecture. Build passes. |

---

## 5. Integration plan

### 5.1 Merge order (and why)
1. **H**: touches only files nobody else owns, so it lands first to give a clean tree.
2. **D**: changes the simulation others observe (collision events, pit flow, DRS rules, tyre compounds). Landing it early means every later merge is tested against real race behaviour.
3. **A**: the car model. E's showroom and G's ghost render it, so it should exist before they are verified.
4. **B**: world and lighting. C's bloom tuning depends on B's emissives and night presets.
5. **C**: FX and post-processing, tuned on top of A + B.
6. **G**: cameras and replay. Reconcile its local camera constants with A's `dimensions.ts`, and hook `consumeCameraShake` to C.
7. **F**: audio. It moves audio wiring out of `GameLoop`, which D and G also touched, so it merges after them.
8. **E**: UI last. It consumes every HUD field (D), the showroom car (A), and the replay flag (G), and owns `RacingGame.tsx` composition, the biggest conflict surface.

### 5.2 Conflict hotspots & resolution rules
| File | Touched by | Rule |
|---|---|---|
| `components/game/GameCanvas.tsx` | B, C, D, F, G | Keep every mount. Order: Environment → world → Cars → RacingLine → Effects → Ghost/Replay → Camera → PostFX (last) → GameLoop/AudioBridge. |
| `components/game/GameLoop.tsx` | D (toasts), F (audio moved out), G (replay guard, recorder) | Final shape: poll → (skip triggers if replay) → step (unless replay) → recorder.capture → flush → store sync. No audio calls left in GameLoop. |
| `components/game/RacingGame.tsx` | E (overlay), G (ReplayControls) | E's layout wins; add G's mount behind `replayActive`. |
| `lib/game/sim/world.ts` | D, G | D's logic wins; G only adds read-only hooks. |
| `package.json` | any | Union; reject a new dependency unless §8 justifies it. |

### 5.3 Cross-workstream wiring (no single WS owns these, so the lead does them during INT)
- G camera anchors ← A `dimensions.ts`.
- C sparks/shake and F impact sounds ← D `collision` events (check intensity scales agree).
- C bloom strength ← B `nightFactor`; F crowd/rain beds ← B `wetness` / weather.
- E HUD pit/DRS lines ← D populated fields; E tyre widget compound colours = A sidewall colours (one shared `COMPOUND_COLORS` constant).
- G ghost/replay render through A's `F1Car` with translucent material overrides.
- Remove the legacy `HUD`/`TelemetryPods` props paths left from WS-0 once E lands.

### 5.4 Gate after every merge
`npm run typecheck && npm test && npm run build`, then the smoke shot list (§6.2) on the merged tree. Any regression is fixed before the next merge, never batched.

---

## 6. Quality bars

### 6.1 Performance budgets (HIGH quality, 1440×900, 12 cars, chase cam)
| Metric | Budget |
|---|---|
| Frame rate | ≥ 60 fps (M1-class laptop); MEDIUM ≥ 50 fps on integrated GPUs; LOW ≥ 30 fps on mid phones |
| Draw calls | ≤ 400 total (world ≤ 150, cars ≤ 12 each, FX ≤ 10, post ≤ 8 passes) |
| Triangles | ≤ 1.5 M visible |
| Sim + JS per frame | ≤ 4 ms (12 cars × 120 Hz physics, AI, collisions, timing) |
| React commits | ≤ 15/s during racing (10 Hz HUD + toasts) |
| First load JS (`/game`) | ≤ 450 kB gzip; lobby ≤ 250 kB |
| GC | No per-frame allocations in useFrame/useTicker hot paths |

### 6.2 Smoke shot list (run by the lead after each merge, via `scripts/shoot.mjs`)
lobby desktop · lobby mobile · grid with lights · 3 s into the race · mid-lap corner · drift · pause menu · telemetry open · rain · night · results (dev page) · replay (dev page). Every shot is opened and reviewed; the JSON must show no console errors.

### 6.3 Gameplay scenarios (manual + vitest where possible)
Full 5-lap race on pro finishes with a sane classification. A pit stop costs 20–30 s. 3 track-limit warnings give +5 s. Reversing over the line adds no lap. DRS is only usable within 1 s at detection. Rain on slicks is clearly slower than inters. Pause and resume freeze everything, including audio. Restart builds a fresh grid. Time-trial ghost persists across reloads. Gamepad drives with analog steer, throttle and brake.

### 6.4 Accessibility
Every menu works by keyboard. Focus is visible. `prefers-reduced-motion` respected. Colour is never the only signal (sector bars carry text). Text ≥ 12 px on mobile. Separate volume controls; audio can be fully muted.

---

## 7. Roadmap after integration (prioritised)

Ranked by player value per unit of effort, building on what Phase 1 creates.

### P2 — Race weekend depth (next)
| # | Feature | Why now | Builds on |
|---|---|---|---|
| 1 | **Qualifying session** (one timed run → sets the grid) | Makes grid position earned rather than picked. Mostly reuses time-trial timing. | race.ts timing, TT mode |
| 2 | **Grand Prix weekend & championship** (practice → quali → race; points 25-18-15…; season across weather/time variants) | Gives races a reason to exist. The only real progression loop. | records in store, results |
| 3 | **Dynamic weather** (rain arriving and drying mid-race; track wetness 0..1) | Turns tyres and pit stops into real decisions. | D compounds, B wetness, C spray |
| 4 | **Race engineer radio** (text + blip: "Box this lap", gap ahead/behind, rain incoming, DRS enabled) | Surfaces strategy without HUD clutter. | events, toasts, audio cues |
| 5 | **Safety car / VSC** on heavy crashes | Signature F1 drama; bunches the field. | collisions, AI controller |
| 6 | **Visual damage** (detached front wing, sparks) + **blue flags** for lapped cars | Consequences for contact; fairness when lapping. | D damage, A parts |
| 7 | **Honest progression** (XP from results → unlock livery patterns, helmet designs, car numbers) | Replaces the old fake currencies with rewards tied to driving. | records, garage |

### P3 — Social & content
| # | Feature | Notes |
|---|---|---|
| 8 | **Local split-screen** (2 players, one keyboard + gamepad) | The legacy `duo_race.html` had it. R3F renders two viewports via scissor. Budget halves per view, so it needs the LOW/MEDIUM tiers to be real. |
| 9 | **Data-driven tracks** (`Track` object instead of module constants) + a second circuit | Prerequisite for any new content. Refactors `constants.ts` spline, sectors, DRS, pit and props placement. |
| 10 | **Ghost sharing** (export/import ghost codes) | Cheap asynchronous competition on top of G's ghost format. |
| 11 | **Online multiplayer** (WebRTC P2P, host-authoritative) | The legacy prototype used PeerJS. The fixed 120 Hz deterministic step makes input sync feasible, but it's the largest item. Only if P2 lands well. |

### P4 — Platform & ops
| # | Item | Why |
|---|---|---|
| 12 | **CI** (GitHub Actions: typecheck, vitest, build, headless smoke screenshot as artifact) | Parallel contributors need a gate that isn't the lead's laptop. |
| 13 | **Vercel preview deploys** per PR | Review gameplay without cloning. |
| 14 | **Input remapping + wheel profiles** | Common request from sim players; Gamepad API already exposes most wheels. |
| 15 | **PWA offline + install** | The manifest from WS-H is the first step; add a service worker for assets. |
| 16 | **Telemetry export** (CSV of laps/sectors/speed trace) | Fits the existing telemetry fans; cheap with the recorder. |

---

## 8. Tech stack decisions
| Decision | Why |
|---|---|
| Next.js 16 (App Router, client-only game routes) | Vercel-native, file routing for lobby/game/dev pages, Turbopack dev. No server features needed. |
| R3F 9 + three r186 on **WebGL2** | R3F v10/WebGPU is still alpha. WebGL2 runs everywhere. Revisit WebGPU when R3F v10 is stable (P4). |
| Removed `@react-three/rapier` | It was unused (one floor collider). Track-relative arcade physics plus custom circle collisions is cheaper, deterministic, and testable. |
| `zustand` | Selector subscriptions keep React out of the frame loop; pmndrs standard. |
| `@react-three/postprocessing` | One merged effect pass for bloom/SMAA/vignette/tone-mapping. |
| `vitest` | Headless race simulation tests in about 1 s; the sim has no DOM dependencies. |
| `playwright-core` + system Chrome (`scripts/shoot.mjs`) | Screenshot playtests with no browser download. CI will use the Playwright Chromium build instead. |
| Procedural car, world and audio; no downloaded assets | No licence risk, tiny payload, liveries recolour freely. The CC0 car packs surveyed were low quality or not F1. |
| No new dependency without a row here | Keeps the bundle inside §6.1. |

---

## 9. Risks & mitigations
| Risk | Mitigation |
|---|---|
| Parallel branches conflict in shared files | Ownership table (§4), pinned contracts (§3.2), merge order and rules (§5). |
| AI looks worse after the racing-line rewrite (collisions, pile-ups) | D's acceptance tests measure off-track time and position changes. If AI regresses, the baseline `ai.ts` stays available as a fallback. |
| Post-processing and the dressed world blow the frame budget | Measure per tier at INT. The governor drops tiers. LOW must disable the composer and shadows and halve foliage. |
| Headless Chrome uses software WebGL, so FPS in screenshots is not real-world | Treat harness FPS as a relative regression signal only. Do a real-GPU check before release. |
| Audio can't be verified by agents | `/dev/audio` audition page; a human tuning pass is listed in QA. |
| Persisted settings from older versions break new fields | Store `merge` fills defaults. Bump the persist `version` with a migration when the shape changes. |

---

## 10. Decision log
| Date | Decision |
|---|---|
| 2026-10-21 | Unified player and AI physics; AI only produce controls. |
| 2026-10-21 | Checkpoint-based timing (200 per lap) for gaps, sectors and live delta, instead of index distance. |
| 2026-10-21 | Cars held stationary on the grid; lights random hold 0.6–2.2 s after the 5th light. |
| 2026-10-21 | Pit lane on the outside (+normal) of the main straight, entry index 1790 → exit index 100. |
| 2026-10-21 | Stay on WebGL2; upgrade Next 15 → 16; drop Rapier. |
| 2026-10-21 | Eight parallel workstreams in worktrees (Sonnet for features, Haiku for hygiene); the lead owns foundation, contracts and integration. |

## 11. Process notes (lessons so far)
- Spawning many worktree agents at the same instant can fail or base a worktree on a stale commit. Spawn them in small batches and check `git worktree list` for the base commit right after.
- In this shell `head` resolves to a Perl HTTP tool; scripts use `/usr/bin/head`.
- Harness screenshots must be *looked at*: the baseline bugs (phantom overtakes, cars driving through each other, kerbs everywhere) were found visually, not by the type-checker.

## 12. Release-candidate notes (2026-10-21)

**Verified headlessly** (Chrome via `scripts/shoot.mjs`, software WebGL; no console errors in any run):
lobby (desktop + mobile), grid and lights, standing start, mid-race HUD, telemetry drawer, pause menu,
results screen (mock and real), full 1-lap race to the flag with classification, replay opened from the
results (TV, helicopter, onboard, chase cameras), Time Trial + Night started from the lobby, rain, sunset,
night, touch layout in landscape and portrait. `npm run typecheck`, `npm test` (29 tests) and
`npm run build` all pass.

**Fixed during integration:** DRS detection was cancelled on the step it fired (checkpoint sat before the
zone start); TV replay cameras were landing inside garages and grandstands; replay timing tower showed
final standings; touch controls were hidden on landscape phones; minimap collided with the tower on
small screens; night was unreadable; `postprocessing` (~123 kB gz) is now lazy-loaded.

**Known gaps / not verified**
| Area | Gap |
|---|---|
| Audio | Written and wired, but nobody has listened to it. Needs a tuning pass by ear. |
| Performance | Harness FPS is software-rendered (30–60). Real-GPU frame times are unmeasured. Total JS is ~700 kB gz across all routes before the lazy-load; the `/game` first-load number was not measured. |
| Pit stops, ghost | Covered by unit tests (pit flow, ghost round-trip) but not played through by hand in a browser. |
| Gamepad | Mapping implemented per the standard layout; no physical pad was tested. |
| Wet starts | A player who holds throttle straight on a wet grid rear-ends slower cars (expected); compound choice matters in rain. |
| Portrait phones | Playable but cramped; landscape is the target (manifest requests it). |
| Deferred features | Everything in §7 (qualifying, championship, dynamic weather, safety car, split-screen, multiplayer). |

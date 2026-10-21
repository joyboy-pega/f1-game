# Buddh GP — Overhaul Plan

Status: in progress (started 2026-10-21). This file is the shared brief for every
contributor and subagent. Read it before touching code.

## 1. Audit findings (baseline `c32c54d`)

### Architecture / performance
| # | Finding | Impact |
|---|---------|--------|
| A1 | `GameManager` calls `setLapTime` every frame → `RacingGame` (Canvas props + every HUD) re-renders at 60 Hz. | CPU waste, jank, GC churn |
| A2 | Simulation state lives in React refs passed as props through 3 levels (24-prop interfaces). | Hard to extend, every feature touches 4 files |
| A3 | `@react-three/rapier` loads a WASM physics world with one floor collider; nothing uses it. | ~2 MB WASM + per-frame step for nothing |
| A4 | Variable timestep physics (`dt` clamped to 0.06). | Non-deterministic → no ghosts/replays, frame-rate dependent handling |
| A5 | Every AI car builds ~25 unique geometries + materials. | Draw calls / memory scale with grid |
| A6 | Performance governor changes quality but nothing re-reads it. | Adaptive quality is a no-op |
| A7 | Sun shadow `target={ref.current}` is null on first render → shadow camera aims at origin. | Shadows wrong away from start |

### Gameplay bugs
| # | Finding |
|---|---------|
| G1 | AI start at `idx ≈ N-10` with `lapNo=1` → counted ~1 lap ahead. Positions/gaps are wrong all race; "OVERTAKE" fires on the grid. |
| G2 | Player physics runs during the start-light countdown (can jump the start). |
| G3 | No car-to-car collision; AI drive through the player and each other. |
| G4 | AI follow the exact centreline at one lane — no racing line, no overtakes, no DRS/ERS, no tyre wear. |
| G5 | `P` fits fresh tyres anywhere, instantly, for free. |
| G6 | Tyres cool from 85 °C to ~29 °C in ~10 s while driving slowly (cooling constant ~10x too high). |
| G7 | `street` car model is selectable but renders the F1 car. |
| G8 | Lap/finish uses `idx < N*0.1` after halfway → laps can be credited while reversing over the line region. |
| G9 | Gap text is `distance/720` — not a time gap. |

### Visual / UX
| # | Finding |
|---|---------|
| V1 | Flat colour sky and ground, no environment lighting, no post-processing. |
| V2 | Cars are ~25 axis-aligned boxes with a "cardboard" texture. |
| V3 | Kerbs run the entire lap (should be corners only); no pit lane, grandstands, boards. |
| V4 | HUD covers ~45 % of the viewport: 7-button top bar, timing card, minimap, two telemetry pods, dash, controls help — all always on. |
| V5 | Lobby has fake currencies, "store", "challenges", a canvas-2D wireframe turntable — none functional. |
| V6 | Missing favicon (404 on every load). |

## 2. Target product

A browser F1 game that feels like a compact F1 25: race a full grid around Buddh,
with proper racing AI, strategy (tyres, pit stops, ERS, DRS), broadcast-grade
visuals, and a low-chrome HUD.

### Modes
- **Grand Prix** — 1–20 laps vs up to 11 AI, grid position, difficulty, tyre strategy, pit stops, penalties.
- **Time Trial** — solo, sector timing, ghost of personal best (persisted).
- **Free Practice** — no timer pressure, change weather/time live, tyre testing.

### Feature list (owner → workstream)
- Core sim (WS-0): fixed 120 Hz timestep, analog input + gamepad, world singleton, event bus, zustand store, correct timing (checkpoint-based gaps), lights → racing state machine, no movement before lights out.
- Race & AI (WS-D): AI drive the *same* physics via a driver controller (pure-pursuit on a racing line, speed profile from curvature); difficulty; lane offsets & overtaking; AI DRS/ERS; car-car collisions; tyre compounds (S/M/H/I/W) with distinct grip/wear; pit lane + timed pit stop; track-limit warnings → time penalties; fix G5/G6/G8.
- Car visuals (WS-A): new procedural F1 car (shared geometry, physical materials, livery canvas with number, compound-coloured tyre sidewalls, halo, steering wheel w/ display, brake glow, rain light), street-racer variant.
- World visuals (WS-B): sky + sun per time of day (day/sunset/night), procedural env lighting, textured terrain, kerbs only at corners, run-off, pit building & pit lane, grandstands with instanced crowd, billboards, brake boards, floodlights at night, distant hills.
- FX & post (WS-C): bloom, SMAA, vignette, tone mapping; tyre smoke, sparks, rain spray, per-wheel skid ribbons, camera shake, speed effects; quality tiers that actually apply.
- HUD & menus (WS-E): low-chrome HUD (timing tower, lap/pos/delta chip, speed/gear/rev-lights cluster, compact minimap), optional telemetry drawer, new lobby with 3D showroom, mode/setup screens, garage livery editor, records, results screen with classification.
- Replay, ghost & cameras (WS-G): input/transform recorder, ghost car in Time Trial, post-race replay with TV cameras, look-back, improved cockpit/chase cameras.
- Audio (WS-F): layered engine (harmonics + turbo + ERS whine), AI positional engines, crowd, rain, kerb rumble, collisions, start-light beeps, radio blips.
- Polish (WS-H, Haiku): repo cleanup (legacy HTML → `legacy/`), README, favicon/manifest, metadata.

## 3. Architecture (after WS-0)

```
lib/game/
  constants.ts      track spline, configs (unchanged units: 1 unit ≈ 0.1 m, kmh = vf*0.37)
  controls.ts       keyboard + touch + Gamepad → analog ControlState
  physics.ts        car dynamics (pure functions on CarPhysicsState)
  sim/
    world.ts        GameWorld singleton: cars[], session, step(dt) fixed 120 Hz, events
    race.ts         RaceSession: phase machine, timing loops, laps, positions, gaps
    events.ts       typed SimEvent bus (lap, sector, overtake, drs, penalty, pit, collision, ...)
    ai.ts           AI driver controller → ControlState for AI cars (WS-D)
  store.ts          zustand: settings (persisted), phase, 10 Hz HUD snapshot, toasts, results
  useTicker.ts      rAF hook for DOM HUD that reads `world` directly (no React re-render)
components/game/
  GameCanvas.tsx    <Canvas> + scene composition (mount points for every workstream)
  GameLoop.tsx      useFrame: poll input → world.step → drain events → audio/store
  Cars.tsx          renders every world car through car/F1Car.tsx
  car/F1Car.tsx     the car model (WS-A owns)
  world/*           track & environment (WS-B owns)
  fx/*              particles + post-processing (WS-C owns)
components/ui/*     DOM HUD + menus (WS-E owns)
```

Rules:
1. **Simulation state never lives in React.** Read `world` directly in `useFrame` (3D) or `useTicker` (DOM). The store only holds UI-rate data (≤10 Hz) and settings.
2. Every world car (player and AI) is a `CarPhysicsState` advanced by `updateCarPhysics`. AI only differ in where their `ControlState` comes from.
3. Shared geometry/material per model; per-car only livery textures.
4. Settings are persisted in the store; the lobby writes them, `/game` reads them.
5. Workstreams own their directories; edits to shared files (`store.ts`, `world.ts`, `GameCanvas.tsx`) must be additive and minimal.

## 4. Tech stack decisions
| Decision | Why |
|---|---|
| Keep Next.js (App Router) + R3F v9 + three r186 on **WebGL2** | R3F v10/WebGPU still alpha; WebGL2 covers every browser; game is client-only so Next mostly serves the shell. |
| Upgrade Next 15.2 → 16 | Turbopack default, faster dev; app has no server features that break. Webpack WASM hack no longer needed once Rapier is gone. |
| Remove `@react-three/rapier` | Unused (A3). Track-relative arcade physics + custom collision is cheaper and deterministic. |
| Add `zustand` | Selector-based subscriptions fix A1/A2; pmndrs standard alongside R3F. |
| Add `@react-three/postprocessing` | Bloom/SMAA/vignette in one merged pass. |
| Add `vitest` | Unit tests for physics/race logic so sim changes are verifiable without a browser. |
| Procedural car + world (no downloaded GLBs) | No licence risk, tiny bundle, liveries recolour freely; CC0 car packs found were low quality or non-F1. |
| `playwright-core` + system Chrome (`scripts/shoot.mjs`) | Screenshot-based playtests for every workstream. |

## 5. Verification
- `npx tsc --noEmit` and `npx vitest run` clean.
- `node scripts/shoot.mjs --url http://localhost:<port>/game --out shots/x --wait 9000 --hold ArrowUp:3000` → no console errors, screenshot reviewed.
- `npm run build` passes before merging any workstream.

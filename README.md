# Buddh GP

Buddh GP is a browser F1 racing game set on the Buddh International Circuit. Race a full grid of AI rivals around the track, manage tyres, pit stops, DRS and ERS, and watch the race back with TV-style cameras. It runs entirely in the browser on WebGL2, with no install step beyond the dev server.

## Features

- **Game modes:** Grand Prix (laps against up to 11 AI rivals), Time Trial with a ghost of your best lap, and Free Practice with no timer pressure.
- **Strategy:** tyre compounds with distinct grip and wear, timed pit stops, and a box-this-lap request.
- **Systems:** DRS and ERS boost, adjustable brake bias, and a telemetry panel.
- **Conditions:** weather and time of day.
- **Replays:** post-race replays with TV cameras, plus look-back and cockpit/chase camera views.
- **Input:** keyboard, gamepad, and on-screen controls for touch devices.

## Controls

| Action | Keyboard | Gamepad (standard layout) |
| --- | --- | --- |
| Throttle | W / ↑ | RT |
| Brake / reverse | S / ↓ | LT |
| Steer | A / D or ← / → | Left stick (analog) |
| Handbrake | Space | B |
| ERS boost | Shift | X |
| DRS | F or E | A |
| Brake bias up / down | ] / [ | RB / LB |
| Box this lap | P | D-pad down |
| Next tyre compound | O | D-pad right |
| Camera cycle | C | Y |
| Look back | B (hold) | Right stick down / L3 |
| Reset car | R | D-pad up |
| Telemetry panel | T | View / Back |
| Pause menu | Esc or M | Start |

## Getting started

Requires Node.js 20 or newer.

```bash
npm ci
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000). The game lives at `/game`.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Start the Next.js dev server (Turbopack) on port 3000. |
| `npm run build` | Produce a production build. |
| `npm run start` | Serve the production build. |
| `npm run typecheck` | Run `tsc --noEmit`. |
| `npm test` | Run the vitest unit tests for the simulation and physics. |
| `npm run shoot` | Headless screenshot run with console error and FPS reporting. |

Example screenshot run against a dev server:

```bash
node scripts/shoot.mjs --url http://localhost:3000/game --out shots/run --wait 9000 --hold ArrowUp:3000
```

Output lands in `shots/`, which is git-ignored.

## Tech stack

- Next.js 16 (App Router) and React 19
- React Three Fiber 9 and three.js (WebGL2)
- @react-three/postprocessing for bloom, anti-aliasing, and vignette
- zustand for UI state and settings
- vitest for unit tests

## Project layout

```
app/                 Next.js routes, layout, metadata, favicon and manifest
components/game/     3D scene, game loop, cars, track and environment
components/ui/       DOM HUD, menus, and overlays
lib/game/            controls, physics, constants and track geometry
lib/game/sim/        fixed-step world simulation, race state, AI driver
docs/                PLAN.md, the design and workstream plan
scripts/             shoot.mjs, the headless screenshot tool
public/              static assets served by Next.js
legacy/              standalone prototype pages from before the Next.js app
```

## Architecture

The simulation runs on a fixed 120 Hz step in a single `world` singleton in `lib/game/sim/`. Player and AI cars share the same physics function, and AI cars differ only in where their controls come from. React never holds per-frame simulation state: 3D components read `world` inside `useFrame`, and the DOM HUD reads it through a ticker hook. The zustand store carries only settings and UI-rate data at 10 Hz or less. See [`docs/PLAN.md`](docs/PLAN.md) section 3 for the full layout and rules.

## Legacy prototypes

The `legacy/` folder holds the original standalone HTML and JavaScript prototypes that predate the Next.js app. They are not used by the app and are kept for reference:

- `legacy/index.html` is the telemetry and SVG track dashboard. Its styles and scripts are in `legacy/assets/`.
- `legacy/Buddh Circuit – F1 Cockpit.html` and `legacy/Buddh Circuit – F1 Cockpit.canvas2d.html` are standalone cockpit driving prototypes (three.js and canvas 2D).
- `legacy/garage.html`, `legacy/duo_race.html`, and `legacy/multiplayer_race.html` are the earlier garage, split-screen, and peer-to-peer multiplayer pages.
- `legacy/test_brake_physics.js` and `legacy/test_tire_physics.js` are standalone physics checks.
- `legacy/data/` holds the track data in JavaScript and JSON form.
- `legacy/drafts/` holds unfinished experiments.

Open the HTML files directly in a browser to run them. Some pages load libraries from a CDN, so they need an internet connection.

## Credits

Made by Arigatoo Club for fun. Teams and drivers are fictional. Circuit layout data is based on the Buddh International Circuit.

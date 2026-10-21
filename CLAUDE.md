# Buddh GP — contributor notes

Browser F1 game: Next.js 16 (App Router, client-only game) + React Three Fiber 9 + three r186 (WebGL2) + zustand.
Full plan, audit and workstream ownership: `docs/PLAN.md`.

## Commands
- `npm run dev` — dev server (Turbopack). `npm run build` — production build.
- `npm run typecheck` — `tsc --noEmit`. `npm test` — vitest (sim/physics unit tests in `lib/**/*.test.ts`).
- `node scripts/shoot.mjs --url http://localhost:3000/game --out <path> --wait 9000 [--hold ArrowUp:3000] [--press KeyC] [--mobile]`
  — headless Chrome screenshot + console errors + FPS. Use it to verify any visual change, and look at the PNG.
- In this shell `head` is shadowed by a Perl tool: use `/usr/bin/head`.

## Architecture rules
- `lib/game/sim/world.ts` exports the `world` singleton: all cars (`WorldCar`), race session, fixed 120 Hz `step`, `events` bus.
  Simulation state never lives in React. 3D components read `world` inside `useFrame`; DOM HUD reads it via
  `useTicker` / `useRefreshRate` (`lib/game/useTicker.ts`).
- `lib/game/store.ts` (zustand) holds settings (persisted), records, phase, the 10 Hz `hud` snapshot, toasts, results.
  Never push per-frame data into the store.
- Player and AI cars share `updateCarPhysics` (`lib/game/physics.ts`); AI differ only in that `sim/ai.ts` writes their `ctrl`.
- World units: 1 unit ≈ 0.1 m; `kmh = vf * 0.37`; track spline `trackSplinePoints` (N=1920), arc length `cumulativeS`.
  Ground plane is XZ: world (x, y) of the sim maps to three.js (x, *, z=y). Car heading: `rotation.y = PI/2 - phys.a`.
- Scene composition lives in `components/game/GameCanvas.tsx`; keep edits there additive.
- Reuse geometry/materials across cars; per-car only livery textures.

## Style
- TypeScript strict, functional React components, 2-space indent, single quotes, comment *why* not *what*.
- Don't add dependencies without a reason noted in `docs/PLAN.md` §4.

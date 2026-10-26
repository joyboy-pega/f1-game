# Simulart Tracks (by Arigatoo Club) — Antigravity Agent Rules

> This file is the **Antigravity** (`GEMINI.md`) rules file for this project.
> It works alongside `AGENTS.md` (Next.js agent rules auto-written by `next dev`).
> Skill runbooks live in `.agents/skills/`.

---

## Project Identity

- **Game Name:** **Simulart Tracks**
- **Creator / Studio:** **Arigatoo Club**
- **Description:** Browser-based racing simulation game.
- **Stack:** **Next.js 16** (App Router, fully client-side) · **React Three Fiber 9** · **Three.js r186 (WebGL2)** · **Zustand** · **Vitest**.
- **Repo:** `https://github.com/joyboy-pega/f1-game`
- **Dev server:** `http://localhost:3000` (`npm run dev` — Turbopack).

---

## Mandatory Pre-Coding Checklist

Before writing **any** Next.js code:
1. Read `node_modules/next/dist/docs/` (see `AGENTS.md` — this version has breaking changes).
2. Run `npm run typecheck` before and after your changes — zero errors required.
3. Run `npm test` — all 29 tests must pass.
4. Use `node scripts/shoot.mjs --url http://localhost:3000/game --out <path> --wait 9000` to verify visual changes.

> **`head` is shadowed** in this shell — use `/usr/bin/head` instead.

---

## Architecture Constraints (Hard Rules)

### Simulation
- `lib/game/sim/world.ts` → `world` singleton; fixed **120 Hz** `step`; `events` bus.
- **Never push per-frame data into the Zustand store.** Store = settings, records, phase, 10 Hz `hud` snapshot, toasts, results.
- Player + AI cars share `updateCarPhysics` (`lib/game/physics.ts`). AI-only logic lives in `sim/ai.ts`.
- World units: 1 unit ≈ 0.1 m · `kmh = vf * 0.37` · Ground plane is XZ.
- Car heading: `rotation.y = PI/2 - phys.a`.

### 3D / Rendering
- **WebGL2 only** — WebGPU is P4, do NOT add it now.
- **Rapier is removed** — do NOT re-add it; physics is custom arcade.
- Reuse geometry/materials across cars; per-car livery textures only.
- Scene root: `components/game/GameCanvas.tsx` — keep edits additive.

### Car System
- `VehicleModelType` = `'f1' | 'roadster' | 'pegasus'`.
- Pegasus #53 detection: `carModel === 'pegasus' || car.driver.team === 'Pegasus'`.
- Pegasus coordinate conversion: `toGamePt([xu, yu, zu]) => [-zu, yu, xu]`.
- All Pegasus textures cached in `Map<string, THREE.CanvasTexture>` keyed by `body_accent_number_driverCode`.
- SSR guard in texture generators: `if (typeof document === 'undefined') return new THREE.Texture()`.

---

## Design System (Never Break These)

### Tokens
Always use CSS design tokens — **never** raw Tailwind colour utilities in non-game UI:
- `var(--ink)`, `var(--lime)`, `var(--orange)`, `var(--panel)`, `var(--glass)`.

### Typography — Three-Font System
| Role | Font | Usage |
|---|---|---|
| Display / hero | **Anton** | Race names, lap times, big numbers |
| UI labels | **Archivo** | Buttons, menus, HUD text |
| Data / telemetry | **JetBrains Mono** | Sector times, speed readouts |

Do NOT mix in Tailwind font utilities — use the CSS font-family variables.

### Clip-Path Corner Language
All panels must use:
```css
clip-path: polygon(0 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%);
```

### Timing Colours (Match F1 TV broadcast)
- 🟣 **Purple** — overall best lap
- 🟢 **Green** — personal best lap
- 🟡 **Yellow** — slower than personal best

---

## Dependency Rule

**Do not add npm dependencies without a reason noted in `docs/PLAN.md §4`.**

---

## Code Style

- TypeScript strict mode, functional React components.
- 2-space indent, single quotes.
- Comment *why*, not *what*.
- Preserve all existing comments and docstrings unrelated to your change.

---

## Skills Available

The following project skills are registered in `.agents/skills/`:

| Skill | When to use |
|---|---|
| `buddh-gp-dev` | Running dev workflows: build, test, screenshot, git push |
| `buddh-gp-ui` | Implementing UI improvements aligned to the design system |

> Skills are loaded on-demand. To activate one, the agent reads `.agents/skills/<name>/SKILL.md`.

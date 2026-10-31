---
name: buddh-gp-dev
description: >-
  Development workflow runbook for the Buddh GP F1 game. Use this skill when
  the user asks to build, test, screenshot, deploy, or push changes to the
  Buddh GP project at /Users/joy/Desktop/project/tea party/f1 game.
---

# Buddh GP — Development Workflow

## Commands Reference

| Task | Command |
|---|---|
| Dev server (Turbopack) | `npm run dev` |
| Production build | `npm run build` |
| Type check | `npm run typecheck` |
| Unit tests | `npm test` |
| Headless screenshot | `node scripts/shoot.mjs --url http://localhost:3000/game --out <path> --wait 9000` |
| Screenshot with throttle | Add `--hold ArrowUp:3000` |
| Screenshot mobile | Add `--mobile` |
| Screenshot + camera cycle | Add `--press KeyC` |

> ⚠️ `head` is shadowed in this shell — always use `/usr/bin/head`.

## Before Every PR / Push

1. `npm run typecheck` → must show **0 errors**
2. `npm test` → must show **29/29 passing**
3. Take a headless screenshot of the game view and inspect the PNG for regressions
4. `git push origin main`

## Git Conventions

- Remote: `https://github.com/joyboy-pega/open-race`
- Branch: `main`
- Commit format: `<type>(<scope>): <description>`
  - Types: `feat`, `fix`, `perf`, `docs`, `refactor`, `test`, `chore`
  - Scope examples: `car`, `ui`, `hud`, `physics`, `ai`, `audio`, `track`

## Dev Server

- Port: **3000** (`http://localhost:3000`)
- If already running, do NOT start a second instance — reuse the existing one.
- Check with: `lsof -ti:3000`

## Vercel Deployment

The project is Vercel-ready:
- `vercel.json` is present at the root
- No custom build config needed
- Import `joyboy-pega/open-race` at vercel.com → Deploy
- All routes are static (no server-side features)

## Key File Map

| File | Purpose |
|---|---|
| `lib/game/sim/world.ts` | World singleton, 120 Hz step, events bus |
| `lib/game/store.ts` | Zustand store (settings, HUD, phase, results) |
| `lib/game/physics.ts` | Shared `updateCarPhysics` for player + AI |
| `lib/game/sim/ai.ts` | AI `ctrl` writer |
| `components/game/GameCanvas.tsx` | Scene root — keep edits additive |
| `components/game/car/F1Car.tsx` | Car router (F1 / Roadster / Pegasus) |
| `components/game/car/PegasusCar.tsx` | Pegasus #53 RTF component |
| `components/game/car/pegasusGeometry.ts` | Pegasus procedural geometry + texture cache |
| `components/ui/MainMenu.tsx` | Lobby + garage selector |
| `app/layout.tsx` | Root layout + font imports |
| `docs/PLAN.md` | Full project plan, workstream ownership |

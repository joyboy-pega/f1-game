---
name: buddh-gp-ui
description: >-
  UI implementation runbook for the Buddh GP F1 game. Use this skill when
  the user asks to improve, redesign, or fix any UI component — including
  menus, HUD, loading screen, mobile controls, transitions, or results screen.
  Enforces the Buddh GP design system and the B+→A upgrade checklist.
---

# Buddh GP — UI Implementation Guide

## Design System Quick Reference

### CSS Tokens (always use these, never raw Tailwind colours)
```css
var(--ink)      /* background: near-black */
var(--lime)     /* primary accent: lime green */
var(--orange)   /* secondary accent: orange */
var(--panel)    /* panel background with opacity */
var(--glass)    /* glass/frosted panel */
```

### Three-Font System
```css
font-family: 'Anton', sans-serif;       /* Display: lap times, hero numbers */
font-family: 'Archivo', sans-serif;     /* UI: buttons, menus, labels */
font-family: 'JetBrains Mono', mono;   /* Data: sector times, speed readouts */
```

### Clip-Path Corner Language (required on ALL panels)
```css
clip-path: polygon(0 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%);
```

### Timing Colours
- `color: purple` — overall best lap
- `color: #22c55e` (green) — personal best lap  
- `color: #eab308` (yellow) — slower than personal best

---

## Current UI Issues (Priority Order)

### 🔴 P1 — Loading Screen (CRITICAL)
**File:** `components/ui/LoadingScreen.tsx`

Problems to fix:
- Uses raw Tailwind colours (off-brand)
- Wrong fonts — should use Anton + Archivo
- Copy says "Rapier Physics" — Rapier was removed, delete this line
- Should use `var(--lime)` for the progress bar, `var(--ink)` for background

Fix steps:
1. Replace background with `var(--ink)` 
2. Replace progress bar colour with `var(--lime)`
3. Replace all font classes with the three-font system
4. Remove all mentions of "Rapier" 
5. Apply clip-path to the progress container panel
6. Run screenshot to verify

---

### 🔴 P2 — Mobile Controls Consolidation (CRITICAL)
**Problem:** Two competing mobile control systems exist:
- `components/ui/MobileControls.tsx` — OLD, off-brand (Tailwind cyan colours)
- HUD CSS `.mc-*` system inside the HUD stylesheet — CORRECT, lime/orange branded

**Fix:** Delete `MobileControls.tsx`. Ensure the `.mc-*` CSS system is the only mobile control path. Verify no import of `MobileControls` remains.

Steps:
1. `grep -r "MobileControls" components/ app/` — find all imports
2. Remove all imports
3. Delete `components/ui/MobileControls.tsx`
4. Verify mobile screenshot still shows controls

---

### 🟡 P3 — Lobby → Game Page Transition
**Problem:** Hard cut between lobby and game — no transition animation.

Implementation:
- Use CSS `@keyframes` fade + scale: opacity 0→1, scale 0.97→1, duration 400ms ease-out
- Apply to the game canvas container on mount
- Do NOT use a React state transition (avoid re-renders at 60Hz)

---

### 🟡 P4 — Pause Menu Session Summary Bar
**Problem:** Pause menu has no session context (lap count, best lap, position).

Add a summary bar at the top of the pause menu showing:
- Current lap / total laps
- Best lap time (green if personal best, purple if overall best)
- Current position

Read from `useStore(s => s.hud)` — never from `world` directly in UI components.

---

### 🟢 P5 — Results P1 Reveal Animation
**Problem:** Results screen shows all positions simultaneously — no drama.

Implementation:
- Stagger positions P10 → P2 → P1 with 200ms delays
- P1 row: scale up from 0.9→1.0, fade in, with a `var(--lime)` glow pulse
- Trophy icon animates in last with a bounce keyframe

---

## Verification After Any UI Change

1. `npm run typecheck` → 0 errors
2. `npm test` → 29 passing
3. Desktop screenshot: `node scripts/shoot.mjs --url http://localhost:3000 --out /tmp/menu.png --wait 3000`
4. Mobile screenshot: add `--mobile` flag
5. Game screenshot: `--url http://localhost:3000/game --wait 9000`
6. Inspect PNGs before committing

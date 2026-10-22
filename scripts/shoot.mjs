#!/usr/bin/env node
// Headless playtest harness: loads a page in system Chrome, optionally drives
// keyboard input, captures screenshots, and reports console errors + FPS.
//
// Usage:
//   node scripts/shoot.mjs --url http://localhost:3000/game --out shots/run \
//     [--wait 6000] [--hold ArrowUp:4000] [--press KeyC] [--shots 3] [--interval 1500]
//     [--width 1440] [--height 900] [--mobile] [--settings '<json patch of GameSettings>']
//   e.g. --settings '{"quality":"LOW"}' pins a tier (the governor is otherwise AUTO and adapts at runtime).
//   Add ?stats=1 to the URL on a production build to get window.__BUDDH_STATS__ (always on in `npm run dev`).
//
// Steps run in order: wait -> (hold/press actions) -> shots.
// Exit code 1 if any page error / console.error occurred.

import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const multi = (name) => args.flatMap((a, i) => (a === `--${name}` ? [args[i + 1]] : []));
const flag = (name) => args.includes(`--${name}`);

const url = opt('url', 'http://localhost:3000/game');
const out = opt('out', 'shots/run');
const wait = Number(opt('wait', '6000'));
const shots = Number(opt('shots', '1'));
const interval = Number(opt('interval', '1500'));
const width = Number(opt('width', flag('mobile') ? '390' : '1440'));
const height = Number(opt('height', flag('mobile') ? '844' : '900'));

const CHROME =
  process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

fs.mkdirSync(path.dirname(out) || '.', { recursive: true });

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--use-angle=metal', '--autoplay-policy=no-user-gesture-required'],
});
const context = await browser.newContext({
  viewport: { width, height },
  deviceScaleFactor: 1,
  isMobile: flag('mobile'),
  hasTouch: flag('mobile'),
});
// Persisted game settings (zustand 'buddh-gp' key) injected before the page boots.
const settingsJson = opt('settings', null);
if (settingsJson) {
  const patch = JSON.parse(settingsJson);
  await context.addInitScript((p) => {
    try {
      localStorage.setItem('buddh-gp', JSON.stringify({ state: { settings: p }, version: 2 }));
    } catch {}
  }, patch);
}
const page = await context.newPage();

const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
});

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForTimeout(wait);

// Actions: --hold Key:ms (keydown, wait, keyup), --press Key, --click selector
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  const v = args[i + 1];
  if (a === '--hold') {
    const [keys, ms] = v.split(':');
    const list = keys.split('+');
    for (const k of list) await page.keyboard.down(k);
    await page.waitForTimeout(Number(ms || 1000));
    for (const k of list) await page.keyboard.up(k);
  } else if (a === '--press') {
    await page.keyboard.press(v);
    await page.waitForTimeout(400);
  } else if (a === '--click') {
    await page.click(v, { timeout: 5000 }).catch((e) => errors.push(`click failed ${v}: ${e.message}`));
    await page.waitForTimeout(600);
  } else if (a === '--sleep') {
    await page.waitForTimeout(Number(v));
  }
}

// Measure rAF FPS over 2s
const fps = await page.evaluate(
  () =>
    new Promise((res) => {
      let n = 0;
      const t0 = performance.now();
      const tick = () => {
        n++;
        if (performance.now() - t0 < 2000) requestAnimationFrame(tick);
        else res(Math.round((n * 1000) / (performance.now() - t0)));
      };
      requestAnimationFrame(tick);
    })
);

// Renderer/sim stats published once per second by components/game/DevStats.tsx (null when not enabled).
const stats = await page.evaluate(() => window.__BUDDH_STATS__ ?? null);

const files = [];
for (let s = 0; s < shots; s++) {
  const f = `${out}${shots > 1 ? `-${s + 1}` : ''}.png`;
  await page.screenshot({ path: f });
  files.push(f);
  if (s < shots - 1) await page.waitForTimeout(interval);
}

console.log(JSON.stringify({ url, fps, stats, screenshots: files, errors }, null, 2));
await browser.close();
process.exit(errors.length ? 1 : 0);

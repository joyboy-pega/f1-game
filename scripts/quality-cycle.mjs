#!/usr/bin/env node
// S3 acceptance probe: switch graphics quality repeatedly through the dev hook and report whether the Canvas was
// remounted, whether the GL context was lost, and whether GPU resource counts return to where they started.
//   node scripts/quality-cycle.mjs --url http://localhost:3001/game [--cycles 10] [--settle 1800] [--out shots/S3]
//   --adapt <rate> [--seconds 90]: instead of cycling, throttle the CPU <rate>x (CDP) and log dpr/quality/fps every 5 s,
//   to watch AUTO adaptation (resolution first, tier only after the floor holds) without a Canvas remount.
// With --out it also saves <out>-HIGH-before.png, <out>-LOW.png and <out>-HIGH-after.png for a visual check.
// Needs window.__BUDDH_STATS__ / __BUDDH_DEV__ (dev build, or ?stats=1 on a production build).
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : d;
};
const url = opt('url', 'http://localhost:3001/game');
const cycles = Number(opt('cycles', '10'));
const settle = Number(opt('settle', '1800'));
const out = opt('out', null);
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--use-angle=metal', '--autoplay-policy=no-user-gesture-required'],
});
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && errors.push(`console.error: ${m.text()}`));
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => window.__BUDDH_STATS__ && window.__BUDDH_DEV__, null, { timeout: 60000 });
await page.waitForTimeout(9000); // let lazy chunks (post-processing) and shaders settle
const read = () => page.evaluate(() => window.__BUDDH_STATS__);
const adapt = Number(opt('adapt', '0'));
if (adapt > 0) {
  const seconds = Number(opt('seconds', '90'));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: adapt });
  const t0 = Date.now();
  const log = [];
  while (Date.now() - t0 < seconds * 1000) {
    await page.waitForTimeout(5000);
    const s = await read();
    log.push(`${((Date.now() - t0) / 1000).toFixed(0)}s q=${s.quality} dpr=${s.dpr.toFixed(2)} frameMs=${s.frameMsAvg.toFixed(1)} mounts=${s.canvasMounts}`);
  }
  console.log(JSON.stringify({ adaptThrottle: adapt, log, errors }, null, 2));
  await browser.close();
  process.exit(errors.length ? 1 : 0);
}
const set = async (q) => {
  await page.evaluate((v) => window.__BUDDH_DEV__.setQuality(v), q);
  await page.waitForTimeout(settle);
};

await set('HIGH'); // baseline in a known tier
const before = await read();
const shot = async (name) => out && (await page.screenshot({ path: `${out}-${name}.png` }));
await shot('HIGH-before');
const trace = [];
const order = ['MEDIUM', 'LOW', 'HIGH'];
for (let i = 0; i < cycles; i++) {
  const q = order[i % 3];
  await set(q);
  const s = await read();
  if (i === 1) await shot('LOW');
  trace.push(`${q}: geom ${s.geometries} tex ${s.textures} prog ${s.programs} dpr ${s.dpr}`);
}
await set('HIGH');
const after = await read();
await shot('HIGH-after');
console.log(
  JSON.stringify(
    {
      cycles,
      canvasMounts: { before: before.canvasMounts, after: after.canvasMounts },
      contextLosses: { before: before.contextLosses, after: after.contextLosses },
      geometries: { before: before.geometries, after: after.geometries },
      textures: { before: before.textures, after: after.textures },
      programs: { before: before.programs, after: after.programs },
      trace,
      errors,
    },
    null,
    2
  )
);
await browser.close();
process.exit(errors.length ? 1 : 0);

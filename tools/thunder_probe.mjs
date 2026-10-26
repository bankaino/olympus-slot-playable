// thunder_probe.mjs — plays one effect in headless Chrome and reports where its energy sits (share of power below 150 Hz, 150-500, 500-2000, above 2000 Hz) and the master peak.
//   node tools/thunder_probe.mjs [strike|slam|title|burst|win] [dist/classic4/applovin.html]
import { createRequire } from 'node:module'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT || 'playwright');
const names = (process.argv[2] || 'strike,slam').split(','), file = path.resolve(process.argv[3] || 'dist/classic4/applovin.html');
const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--enable-gpu', '--ignore-gpu-blocklist'] }); const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
await ctx.route('**/mraid.js', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: 'window.mraid={getState:()=>"default",isViewable:()=>true,addEventListener(){},open(){}};' }));
const p = await ctx.newPage(); await p.goto(pathToFileURL(file).href); await p.waitForFunction(() => window.__ready); await p.mouse.click(195, 100); await p.waitForTimeout(1200);
await p.evaluate(() => { SCENE.state.ev.length = 0; });                        // keep the game's own events out of the measurement
for (const nm of names) {
  await p.waitForTimeout(2500);
  const r = await p.evaluate(async (nm) => { const acc = [0, 0, 0, 0]; let peak = 0; AUDIO.mute(false); AUDIO.sfx(nm, { pay: 1000, x: 10, xs: 10, v: 10, n: 2, amount: 1000, step: 1 });
    for (let i = 0; i < 70; i++) { await new Promise((r) => setTimeout(r, 25)); const B = AUDIO.bands(); if (B) for (let k = 0; k < 4; k++) acc[k] += B[k]; peak = Math.max(peak, AUDIO.level()); } return { acc, peak }; }, nm);
  const tot = r.acc.reduce((a, c) => a + c, 0) || 1; console.log(nm.padEnd(8), '< 150 Hz', (100 * r.acc[0] / tot).toFixed(1).padStart(5) + '%', '| 150-500', (100 * r.acc[1] / tot).toFixed(1).padStart(5) + '%', '| 0.5-2 kHz', (100 * r.acc[2] / tot).toFixed(1).padStart(5) + '%', '| > 2 kHz', (100 * r.acc[3] / tot).toFixed(2).padStart(5) + '%', '| master peak', r.peak.toFixed(2));
}
await b.close();

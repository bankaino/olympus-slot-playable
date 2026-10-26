// audio_probe.mjs — plays the built ad in headless Chrome with autoplay allowed and prints what the audio engine does (clips decoded, music mode, master peak) — not a listening test.
import { createRequire } from 'node:module'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT || 'playwright');
const file = path.resolve(process.argv[2] || 'dist/classic4/applovin.html');
const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }); const p = await ctx.newPage(); const errs = [];
p.on('pageerror', (e) => errs.push(String(e))); p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
await ctx.route('**/mraid.js', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: 'window.mraid={getState:()=>"default",isViewable:()=>true,addEventListener(){},open(){}};' }));
await p.goto(pathToFileURL(file).href); await p.waitForFunction(() => window.__ready, null, { timeout: 20000 }); await p.waitForTimeout(500);
const box = await p.locator('canvas').boundingBox(); const t0 = Date.now(), rows = []; let tapped = 0;
while (Date.now() - t0 < 36000) {
  const st = await p.evaluate(() => ({ t: SCENE.state ? +SCENE.state.t.toFixed(1) : 0, ph: SCENE.state && SCENE.state.phase, sp: SCENE.state && SCENE.state.spinNo, end: SCENE.state && SCENE.state.end, a: AUDIO.info(), lv: +AUDIO.level().toFixed(2) }));
  if (st.ph === 'ready' && st.end < 0 && Date.now() - tapped > 900) { await p.mouse.click(box.x + box.width / 2, box.y + box.height * 0.7); tapped = Date.now(); }
  rows.push(st); if (st.end >= 0 && Date.now() - tapped > 6000) break; await p.waitForTimeout(250);
}
let lastKey = ''; for (const r of rows) { const k = r.a.playing.join('+') + '|' + r.sp; if (k !== lastKey) { console.log(`t=${r.t}s spin ${r.sp} phase ${r.ph} music [${r.a.playing}] mode=${r.a.mode} ctx=${r.a.state} peak=${r.lv}`); lastKey = k; } }
const peaks = rows.map((r) => r.lv); console.log('clips decoded:', rows[rows.length - 1].a.loaded.join(','), '| max peak', Math.max(...peaks), '| silent samples', peaks.filter((x) => x < 0.01).length + '/' + peaks.length, '| errors', errs.length ? errs.join(' ; ') : 'none');
await b.close();

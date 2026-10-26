// smoke_test.mjs — plays a built single-file playable headless, like a QA tester on a phone would.
//   node tools/smoke_test.mjs [dist/default/applovin.html] [--shots dir]
// Mobile viewport + touch, a stub MRAID container that records mraid.open, a tap on SPIN, a tap
// on the persistent CTA. Fails (exit 1) on: page errors, any network request other than mraid.js, no spin started,
// CTA not reaching mraid.open, fps below 50.
import { createRequire } from 'node:module'; import path from 'node:path'; import fs from 'node:fs'; import { pathToFileURL } from 'node:url';
const req = createRequire(import.meta.url);
const { chromium } = req(process.env.PLAYWRIGHT || 'playwright');
const file = path.resolve(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'dist/default/applovin.html');
const si = process.argv.indexOf('--shots'), shots = si > 0 ? process.argv[si + 1] : 'frames/smoke'; fs.mkdirSync(shots, { recursive: true });

const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const errors = [], external = []; let touchFail = '';
ctx.on('request', (r) => { const u = r.url(); if (!u.startsWith('data:') && !u.startsWith('file:')) external.push(u); });
await ctx.route('**/mraid.js', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: `
  window.mraid = { _l: {}, opened: [], getState: () => 'default', isViewable: () => true,
    addEventListener(k, f) { (this._l[k] = this._l[k] || []).push(f); }, open(u) { this.opened.push(u); } };` }));
const p = await ctx.newPage();
p.on('pageerror', (e) => errors.push(String(e))); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await p.goto(pathToFileURL(file).href);
try { await p.waitForFunction(() => window.__ready, null, { timeout: 20000 }); }
catch (e) { console.log(JSON.stringify({ file: path.basename(file), fails: ['did not boot: ' + (errors.join(' | ') || e.message)] })); await browser.close(); process.exit(1); }
await p.waitForTimeout(600); await p.screenshot({ path: path.join(shots, '0_start.png') });
const box = await p.locator('canvas').boundingBox(), VIEW = await p.evaluate(() => SIM.VIEW);
const V = (x, y) => [box.x + x / VIEW.W * box.width, box.y + y / VIEW.H * box.height];
// tap SPIN with the mouse: a spin must start (the sim owns the hit area: the whole screen is the button while the reels are idle)
const SPIN = await p.evaluate(() => SIM.LAY.spin); const [ax, ay] = V(SPIN.x, SPIN.y); await p.mouse.move(ax, ay); await p.mouse.down(); await p.waitForTimeout(80); await p.mouse.up(); await p.waitForTimeout(1800);
await p.screenshot({ path: path.join(shots, '1_spin.png') });
// a real touch drag (touch events, not the mouse): pointer events must keep flowing and the pointer must be released when the
// finger lifts. Without touch-action:none the browser fires pointercancel after a few moves and the control sticks.
{ const cdp = await ctx.newCDPSession(p), tp = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
  const [tx, ty] = V(540, 1500); await tp('touchStart', tx, ty); let lastX = tx; for (let i = 1; i <= 12; i++) { lastX = tx + i * 6; await tp('touchMove', lastX, ty); await p.waitForTimeout(40); }
  const mid = await p.evaluate(() => ({ x: window.__ptr && __ptr.x, down: window.__ptr && __ptr.down })); await tp('touchEnd'); await p.waitForTimeout(300);
  const after = await p.evaluate(() => ({ down: window.__ptr && __ptr.down })), want = (lastX - box.x) / box.width * VIEW.W;
  if (!mid.down || Math.abs(mid.x - want) > 40) touchFail = 'touch drag stopped following the finger (pointer x ' + Math.round(mid.x) + ', finger at ' + Math.round(want) + ')';
  else if (after.down) touchFail = 'pointer still down after the finger lifted'; }
const money = await p.evaluate(() => SCENE.state && SCENE.state.spinNo);
const fps = await p.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(f); else res(n); }; requestAnimationFrame(f); }));
// tap the CTA: the always-visible one, or (no persistent CTA bar) the endcard's — the sim is played to the endcard with taps on SPIN (this ad has no idle timer), which is fast and deterministic
const findCta = () => p.evaluate(() => (SCENE.hit || []).find((b) => b.id === 'cta'));
let cta = await findCta();
if (!cta) { await p.evaluate(() => { const s = SCENE.state; for (let i = 0; s && i < 120 * 90 && s.end < 0; i++) SIM.step(s, { click: s.phase === 'ready' ? 1 : 0 }); }); await p.waitForTimeout(1500); await p.screenshot({ path: path.join(shots, '1b_endcard.png') }); cta = await findCta(); }
if (cta) { const [cx, cy] = V(cta.x + cta.w / 2, cta.y + cta.h / 2); await p.mouse.click(cx, cy); }
const opened = await p.evaluate(() => (window.mraid && window.mraid.opened) || []);
await p.screenshot({ path: path.join(shots, '2_after_cta.png') });
await browser.close();
const fails = [];
if (errors.length) fails.push('page errors: ' + errors.join(' | '));
const ext = external.filter((u) => !u.endsWith('/mraid.js')); if (ext.length) fails.push('external requests: ' + ext.join(', '));
if (!(money > 0)) fails.push('tap on SPIN did not start a spin (spinNo=' + money + ')');
if (touchFail) fails.push(touchFail);
if (!opened.length) fails.push('CTA did not call mraid.open');
if (fps < 50) fails.push('fps ' + fps);
console.log(JSON.stringify({ file: path.basename(file), view: VIEW, money, fps, cta: opened[0] || null, fails }));
process.exit(fails.length ? 1 : 0);

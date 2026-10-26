// bet_probe.mjs — taps the stake buttons and SPIN in the built page like a finger would (mouse events on the canvas), checks the stake, the balance and the payout formula.
import { createRequire } from 'node:module'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT || 'playwright');
const file = path.resolve(process.argv[2] || 'dist/classic4/applovin.html');
const b = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist'] }); const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
await ctx.route('**/mraid.js', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: 'window.mraid={getState:()=>"default",isViewable:()=>true,addEventListener(){},open(){}};' }));
const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
await p.goto(pathToFileURL(file).href); await p.waitForFunction(() => window.__ready); await p.waitForTimeout(500);
const box = await p.locator('canvas').boundingBox(), VIEW = await p.evaluate(() => SIM.VIEW);
const at = (x, y) => [box.x + x / VIEW.W * box.width, box.y + y / VIEW.H * box.height];
const tap = async (x, y, wait = 120) => { const [px, py] = at(x, y); await p.mouse.click(px, py); await p.waitForTimeout(wait); };
const st = () => p.evaluate(() => ({ bet: SCENE.state.bet, money: SCENE.state.money, spins: SCENE.state.spinNo, phase: SCENE.state.phase, wins: SCENE.state.stat.wins, bets: SCENE.state.stat.bets }));
const LAY = await p.evaluate(() => SIM.LAY), out = [];
await tap(LAY.bet.plus, LAY.bet.y); await tap(LAY.bet.plus, LAY.bet.y); out.push(['2x plus', await st()]);       // 100 → 200 → 400
await tap(LAY.bet.minus, LAY.bet.y); out.push(['1x minus', await st()]);                                           // 200
await p.screenshot({ path: 'frames/bet_ui.png' });
await tap(LAY.spin.x, LAY.spin.y - 300); out.push(['spin 1 (tap on the field)', await st()]);
for (let i = 0; i < 80 && (await st()).phase !== 'ready'; i++) await p.waitForTimeout(150);
await tap(LAY.bet.plus, LAY.bet.y); await tap(LAY.bet.plus, LAY.bet.y); await tap(LAY.bet.plus, LAY.bet.y); await tap(LAY.bet.plus, LAY.bet.y); out.push(['plus ×4 (clamped at the top of the ladder)', await st()]);
await tap(LAY.spin.x, LAY.spin.y - 300);
for (let i = 0; i < 80 && (await st()).phase !== 'ready'; i++) await p.waitForTimeout(150);
out.push(['after spin 2', await st()]);
// a tap just beside a stake button (outside its 150 px hit zone, inside the dead margin) must change nothing: no stake change, no spin
{ const before = await st(); await tap(LAY.bet.plus + 75 + 20, LAY.bet.y); const near = await st(); await tap(LAY.bet.plus + 105 + 25, LAY.bet.y, 200); const far = await st();
  console.log('tap 20 px beside +  (dead margin):'.padEnd(42), near.spins === before.spins && near.bet === before.bet ? 'ignored OK' : 'MISTAKE: ' + JSON.stringify(near)); console.log('tap 25 px past the margin (anywhere):'.padEnd(42), far.spins === before.spins + 1 ? 'spin started OK' : 'no spin: ' + JSON.stringify(far)); }
for (const [n, s] of out) console.log(n.padEnd(42), JSON.stringify(s));
const last = (await st()), want = Math.round(1.75 * last.bets[1]); console.log('spin 2 win', last.wins[1], 'want 1.75 × bet', last.bets[1], '=', want, last.wins[1] === want ? 'OK' : 'MISMATCH', '| errors', errs.length ? errs : 'none');
await b.close();

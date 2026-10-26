// bots.mjs — a headless funnel of casual viewers (taps with human delays, spammers, people who stop tapping, people who never touch).
//   node tools/bots.mjs [N=300] [--k KEY=VAL ...]      (--k overrides SIM.K; in zsh pass overrides as array elements)
// Outcomes do not depend on player ability (the ad is scripted), so the corridors are about PACE: everybody reaches the endcard, nobody who keeps tapping is cut off in the
// middle of the show, the big win is on screen long enough. There is no autospin and no idle timer: a viewer who stops tapping (or never taps) simply waits — the endcard comes only after the finale (set K.END_IDLE / K.END_NO_INPUT to bring the ad-network timers back).
import { createRequire } from 'node:module';
const SIM = createRequire(import.meta.url)('../live/sim.js');
const { K, DT } = SIM;
const args = process.argv.slice(2), N = +(args.find((a) => /^\d+$/.test(a)) || 300);
for (let i = 0; i < args.length; i++) if (args[i] === '--k') { const [k, v] = args[i + 1].split('='); K[k] = isNaN(+v) ? v : +v; }
const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

function runBot(seed) {
  const R = rng(seed), U = (a, b) => a + (b - a) * R(), LN = (med, sg) => med * Math.exp(sg * Math.sqrt(-2 * Math.log(R() + 1e-9)) * Math.cos(2 * Math.PI * R()));
  const kind = (() => { const x = R(); return x < 0.08 ? 'passive' : x < 0.18 ? 'spammer' : x < 0.33 ? 'stopper' : x < 0.38 ? 'quitter' : 'normal'; })();
  const first = kind === 'spammer' ? U(0.6, 2) : LN(1.4, 0.45), impatient = R() < 0.3, S = SIM.spawn(0);
  let next = first, spins = 0, lastTap = -1;
  for (let i = 0; i < 90 * 120 && S.end < 0; i++) {
    const t = S.t, inp = { press: 0, click: 0, px: SIM.LAY.spin.x, py: SIM.LAY.spin.y };
    if (kind !== 'passive' && t >= next) {
      const ready = S.phase === 'ready', stopped = (kind === 'stopper' && S.spinNo >= 2) || (kind === 'quitter' && S.spinNo >= 1);
      if (!stopped) {
        if (kind === 'spammer') { inp.click = 1; inp.press = 1; next = t + U(0.15, 0.3); }
        else if (ready) { inp.click = 1; inp.press = 1; next = t + LN(1.0, 0.5); spins++; }
        else if (impatient && R() < 0.02) { inp.click = 1; inp.press = 1; next = t + LN(0.8, 0.4); }
      }
    }
    if (inp.click) lastTap = t;
    SIM.step(S, inp);
  }
  const reached = S.end >= 0, tt = S.firstIn >= 0 && reached ? S.end - S.firstIn : null, big = S.stat.bigStart >= 0 && reached ? S.end - S.stat.bigStart : null;
  return { kind, reached, tt, why: S.endWhy, big, wins: S.stat.wins, spins: S.stat.spins, turbo: S.stat.turbo, idleEnd: reached && lastTap >= 0 ? S.end - lastTap : null };
}
const q = (a, p) => { const s = a.filter((x) => x !== null).sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN; };
const Rs = []; for (let i = 1; i <= N; i++) Rs.push(runBot(i));
const tap = Rs.filter((r) => r.kind !== 'passive'), act = Rs.filter((r) => r.kind === 'normal' || r.kind === 'spammer'), gone = Rs.filter((r) => r.kind === 'stopper' || r.kind === 'quitter'), spam = Rs.filter((r) => r.kind === 'spammer');
const pct = (n, d = N) => (100 * n / d).toFixed(0) + '%', why = {}; Rs.forEach((r) => (why[r.why] = (why[r.why] || 0) + 1));
const timers = K.END_IDLE < 1e8 && K.END_NO_INPUT < 1e8;
const st = { reach: act.filter((r) => r.reached).length / act.length, tMed: q(act.map((r) => r.tt), 0.5), tP95: q(act.map((r) => r.tt), 0.95), spamMin: q(spam.map((r) => r.tt), 0),
  bigMin: q(act.map((r) => r.big), 0), cut: act.filter((r) => r.why !== 'win').length, goneMax: q(gone.map((r) => r.idleEnd), 1), goneWhy: gone.filter((r) => r.why !== 'time').length };
console.log(`bots ${N}: endcard for active viewers ${pct(act.filter((r) => r.reached).length, act.length)}, for those who stop or never tap ${pct(Rs.filter((r) => r.reached && !act.includes(r)).length, N - act.length)} (${timers ? 'timers on' : 'they wait'}) | active viewers first tap→end median ${st.tMed.toFixed(1)} s, p95 ${st.tP95.toFixed(1)} s | spammer min ${st.spamMin.toFixed(1)} s | big win on screen min ${st.bigMin.toFixed(1)} s | people who stop tapping: ${timers ? 'endcard ≤ ' + st.goneMax.toFixed(1) + ' s after the last tap' : 'wait for the tap'} | end ${JSON.stringify(why)}`);
const bad = [];
if (st.reach < 1) bad.push('not every active viewer reaches the endcard'); const [lo, hi] = K.SCRIPT_ID === 'fast3' ? [15, 21] : [21, 26]; if (!(st.tMed >= lo && st.tMed <= hi)) bad.push(`median first-tap→endcard outside ${lo}-${hi} s`); if (st.tP95 > 34) bad.push('p95 > 34 s');
const spamLo = K.SCRIPT_ID === 'fast3' ? 14 : 18; if (st.spamMin < spamLo) bad.push(`a spammer skips the show in < ${spamLo} s`); if (st.bigMin < 3.5) bad.push('big win visible < 3.5 s');
if (st.cut) bad.push(st.cut + ' tapping viewers cut off before the show ends (endWhy != win)'); if (timers && st.goneMax > K.END_IDLE + 15) bad.push('a viewer who stopped tapping waits too long for the endcard'); if (timers && st.goneWhy) bad.push(st.goneWhy + ' viewers who stopped did not end by idle'); if (!timers && Rs.some((r) => !act.includes(r) && r.reached)) bad.push('a viewer who stopped or never tapped got an endcard although there are no timers');
console.log(bad.length ? 'CORRIDORS FAIL: ' + bad.join('; ') : 'corridors ok'); process.exit(bad.length ? 1 : 0);

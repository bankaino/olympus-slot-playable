// script_check.mjs — the generator must produce exactly the scripted wins for every seed AND every stake: payout = stake multiple × bet (× orb multipliers).
//   node tools/script_check.mjs [seeds=20]
import { createRequire } from 'node:module';
const SIM = createRequire(import.meta.url)('../live/sim.js');
const N = +process.argv[2] || 20, K = SIM.K, defs = SIM.SCRIPTS[K.SCRIPT_ID] || SIM.SCRIPTS.classic4, X = defs.map((d) => d.expect);
// stake ladders to try: the default, the smallest, the largest, and a staircase (changed with the real +/- input before each spin)
const LADDERS = [defs.map(() => 100), defs.map(() => K.BETS[0]), defs.map(() => K.BETS[K.BETS.length - 1]), defs.map((_, i) => K.BETS[(i * 2) % K.BETS.length])];
let bad = 0, maxTries = 0, runs = 0;
for (let seed = 1; seed <= N; seed++) {
  const { plans } = SIM.planAll(seed); maxTries = Math.max(maxTries, ...plans.map((p) => p.tries));
  if (JSON.stringify(plans.map((p) => p.spinWinX)) !== JSON.stringify(X)) { bad++; console.log('seed', seed, 'plan multiples', JSON.stringify(plans.map((p) => p.spinWinX)), 'want', JSON.stringify(X)); continue; }
  for (const ladder of LADDERS) {
    runs++; const S = SIM.create(seed); let guard = 0, bal = K.BALANCE0; const wantWins = [], wantBets = [];
    while (S.end < 0 && guard++ < 120 * 120) {
      if (S.phase === 'ready' && S.spinNo < ladder.length) {                  // walk the stake to the wanted one with the real input, then spin
        const target = ladder[S.spinNo]; if (S.bet !== target) { SIM.step(S, { bet: S.bet < target ? 1 : -1 }); continue; }
        wantBets.push(target); wantWins.push(Math.round(X[S.spinNo] * target)); bal += wantWins[wantWins.length - 1] - target; SIM.step(S, { click: 1 }); continue; }
      SIM.step(S, {});
    }
    const ok = S.endWhy === 'win' && JSON.stringify(S.stat.wins) === JSON.stringify(wantWins) && JSON.stringify(S.stat.bets) === JSON.stringify(wantBets) && S.money === bal;
    if (!ok) { bad++; console.log('seed', seed, 'bets', JSON.stringify(ladder), 'played', JSON.stringify(S.stat.wins), 'want', JSON.stringify(wantWins), 'money', S.money, 'want', bal, 'end', S.endWhy); }
  }
}
console.log(bad ? `SCRIPT FAIL ${bad}` : `script ok: ${N} seeds × ${LADDERS.length} stake ladders (${runs} runs) → multiples ${JSON.stringify(X)}, max generator tries ${maxTries}`);
process.exit(bad ? 1 : 0);

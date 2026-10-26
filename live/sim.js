// live/sim.js — ГРОМ ОЛИМПА playable ad: deterministic 6×5 pay-anywhere tumble slot, fixed 120 Hz.
// The ad is scripted by spin: lose → small win → medium win (first Zeus bolt) → Zeus strike + cascade + big win → endcard.
// Boards are GENERATED so that the real cascade engine (evaluate/drop) produces exactly the scripted wins; every reaction lives here, the scene only draws.
(function (root) {
  const DT = 1 / 120, L = 30.0, COLS = 6, ROWS = 5;
  const ASPECT = typeof window !== 'undefined' && window.innerWidth ? window.innerHeight / window.innerWidth : 16 / 9;
  const VIEW = { W: 1080, H: Math.round(1080 * Math.max(16 / 9, Math.min(19.5 / 9, ASPECT))) }, WORLD = { x0: 0, y0: 0, x1: VIEW.W, y1: VIEW.H };
  const HINT = 'tap SPIN';
  const GEMS = ['g_blue', 'g_green', 'g_purple', 'g_yellow', 'g_red'], PREM = ['s_cup', 's_amph', 's_lyre', 's_helm'], NORMAL = GEMS.concat(PREM);
  const K = {
    BET: 100, BETS: [20, 40, 100, 200, 400, 1000], BALANCE0: 5000, SEED: 7, SCRIPT_ID: 'classic4', OFFER: 'deposit', CTA_BAR: false,
    // pay anywhere: stake multiples for 8-9 / 10-11 / 12+ identical symbols
    PAY: { s_helm: [10, 20, 50], s_lyre: [3, 10, 25], s_amph: [2, 6, 15], s_cup: [1.5, 3, 12], g_red: [1, 2, 10], g_purple: [0.8, 1.5, 8], g_yellow: [0.5, 1, 5], g_green: [0.4, 0.8, 4], g_blue: [0.3, 0.75, 2] },
    T: { slam: 0.4, out: 0.2, in: 0.45, inCol: 0.05, inRow: 0.02, hilite: 0.3, burst: 0.2, fall: 0.35, strike: 0.7, strike1: 1.1, tail: 0.5, nice: 0.8, charge: 0.5, settle: 0.25, titleDur: 1.1, bigHold: 0.9 },
    TURBO: 1.4, SKIP_AFTER: 2.2, HAND_IDLE: 2.5, TITLE_X: [20, 100, 300], END_AFTER_WIN: 0.3, END_IDLE: 1e9, END_NO_INPUT: 1e9, SKIP_HOLD: 1.5,
  };
  // scripted spins: wins = [[symbol, count]] per cascade step, orbs = [[step the orb lands on the board, value]], expect = the spin's total
  const SCRIPTS = {
    classic4: [
      { wins: [], near: ['s_helm', 7], scatters: 1, storm: 0, charge: 1, expect: 0 },
      { wins: [['g_blue', 10], ['g_red', 8]], scatters: 2, storm: 0.1, charge: 2, expect: 1.75 },
      { wins: [['g_purple', 9], ['s_amph', 8]], orbs: [[0, 5]], scatters: 1, storm: 0.35, charge: 4, nice: true, expect: 14 },
      { wins: [['s_lyre', 10], ['g_blue', 12], ['s_helm', 9], ['g_green', 8]], orbs: [[0, 5], [1, 10], [3, 10]], scatters: 1, storm: 1, slam: true, charge: 0, expect: 560 },
    ],
    fast3: [
      { wins: [['g_blue', 10], ['g_red', 8]], scatters: 2, storm: 0.1, charge: 2, expect: 1.75 },
      { wins: [['g_purple', 9], ['s_amph', 8]], orbs: [[0, 5]], scatters: 1, storm: 0.35, charge: 4, nice: true, expect: 14 },
      { wins: [['s_lyre', 10], ['g_blue', 12], ['s_helm', 9], ['g_green', 8]], orbs: [[0, 5], [1, 10], [3, 10]], scatters: 1, storm: 1, slam: true, charge: 0, expect: 560 },
    ],
  };

  // ---------------- layout (view px; the scene reads it, the sim owns the hit areas) ----------------
  // FR: the frame sprite and its window (the transparent hole), measured on live/assets/frame.png; the grid sits exactly in that window
  const FR = { w: 1017, h: 980, x0: 122, y0: 236, x1: 896, y1: 883, plate: [510, 120] };
  const ZS = { w: 1024, h: 1485, hand: [900, 400] };                               // Zeus sprite size (prepped px) and the fist that holds the bolt
  const LAY = (() => { const extra = Math.max(0, VIEW.H - 1920), k = 1072 / FR.w, yF = Math.round(520 + extra * 0.6), cell = 136, gw = cell * COLS, gh = cell * ROWS;
    const gx = Math.round(VIEW.W / 2 - gw / 2), gy = Math.round(yF + FR.y0 * k + ((FR.y1 - FR.y0) * k - gh) / 2), fh = FR.h * k, panelY = Math.round(yF + fh + 8);
    const zh = Math.round(1200 + 0.2 * extra), zk = zh / ZS.h, zw = ZS.w * zk, zx = 640 - zw / 2, zy = Math.round(95 + 0.3 * extra);
    return { cell, gx, gy, gw, gh, frame: { x: (VIEW.W - FR.w * k) / 2, y: yF, w: FR.w * k, h: fh, k, plate: [(VIEW.W - FR.w * k) / 2 + FR.plate[0] * k, yF + FR.plate[1] * k] }, panelY, spin: { x: 720, y: panelY + 150, r: 118 }, bet: { y: panelY + 150, minus: 502, plus: 938, r: 50 },
      zeus: { x: zx, y: zy, w: zw, h: zh, k: zk, hand: [zx + ZS.hand[0] * zk, zy + ZS.hand[1] * zk] }, medal: { x: 150, y: yF - 230 } }; })();

  // ---------------- rng, pay table, cascade engine ----------------
  const rng = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const shuffle = (a, rg) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rg() * (i + 1)); const x = a[i]; a[i] = a[j]; a[j] = x; } return a; };
  const payOf = (s, n) => K.PAY[s][n >= 12 ? 2 : n >= 10 ? 1 : 0];                 // stake multiple of one winning group: rubles = payOf × bet
  const mk = (ctx, s, v) => { const c = { id: ctx.id++, s }; if (v) c.v = v; return c; };
  const countsOf = (B) => { const n = {}; for (const col of B) for (const x of col) if (x) n[x.s] = (n[x.s] || 0) + 1; return n; };

  // groups of >= 8 identical regular symbols anywhere on the board (orbs and scatters never count)
  function evaluate(B) {
    const cells = {};
    for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) { const x = B[c][r]; if (x && NORMAL.indexOf(x.s) >= 0) (cells[x.s] = cells[x.s] || []).push([c, r]); }
    const out = [];
    for (const s of NORMAL) if (cells[s] && cells[s].length >= 8) out.push({ s, n: cells[s].length, cells: cells[s], x: payOf(s, cells[s].length) });
    return out;
  }
  // remove the winning cells, drop survivors per column; returns the next board with holes at the top (slots), the moves and the per-column hole counts
  function drop(B, groups) {
    const gone = new Set(), moves = [], nb = [], slots = [], kc = [];
    for (const g of groups) for (const [c, r] of g.cells) gone.add(c * ROWS + r);
    for (let c = 0; c < COLS; c++) {
      const keep = []; for (let r = 0; r < ROWS; r++) { const x = B[c][r]; if (!x) continue; if (gone.has(c * ROWS + r)) moves.push({ id: x.id, c, r0: r, r1: -1 }); else keep.push([x, r]); }
      const k = ROWS - keep.length, col = new Array(ROWS).fill(null); kc.push(k);
      keep.forEach(([x, r0], i) => { col[k + i] = x; moves.push({ id: x.id, c, r0, r1: k + i }); });
      for (let j = 0; j < k; j++) slots.push([c, j]);
      nb.push(col);
    }
    return { nb, moves, slots, kc };
  }
  const pickFiller = (rg, cnt, blocked, caps) => { const ok = NORMAL.filter((s) => !blocked.has(s) && (cnt[s] || 0) < (caps[s] !== undefined ? caps[s] : 6)); return ok.length ? ok[Math.floor(rg() * ok.length)] : null; };

  // one scripted spin → boards B0..Bm built so that the engine yields exactly def.wins (≥ 4 columns, ≤ 3 per column per group, nothing else ≥ 8)
  function genSpin(def, rg, ctx) {
    const T = def.wins || [], m = T.length, tg = T.map((w) => w[0]), ns = T.map((w) => w[1]), near = def.near || null, scat = def.scatters || 0;
    const orbsAt = (st) => (def.orbs || []).filter((o) => o[0] === st);
    const d = m ? [ns[0]] : [];                                                 // d[j]: copies of target j standing on B0
    for (let j = 1; j < m; j++) { const lo = Math.max(0, ns[j] - ns[j - 1] + orbsAt(j).length), hi = Math.min(7, ns[j] - 2); if (hi < lo) return null; d[j] = lo + Math.floor(rg() * (hi - lo + 1)); }
    const cells = [], add = (s, k, v) => { for (let q = 0; q < k; q++) cells.push(mk(ctx, s, v)); };
    for (let j = 0; j < m; j++) add(tg[j], d[j]);
    if (near) add(near[0], near[1]);
    for (const o of orbsAt(0)) add('orb', 1, o[1]);
    add('scatter', scat);
    if (cells.length > COLS * ROWS - 2) return null;
    const cnt = countsOf([cells]), blocked = new Set(tg.concat(near ? [near[0]] : []));
    while (cells.length < COLS * ROWS) { const s = pickFiller(rg, cnt, blocked, {}); if (!s) return null; cnt[s] = (cnt[s] || 0) + 1; cells.push(mk(ctx, s)); }
    shuffle(cells, rg);
    let B = []; for (let c = 0; c < COLS; c++) B.push(cells.slice(c * ROWS, c * ROWS + ROWS));
    const boards = [B], moves = [], groups = [];
    for (let i = 0; i < m; i++) {
      const g = evaluate(B); if (g.length !== 1 || g[0].s !== tg[i] || g[0].n !== ns[i]) return null;
      const per = new Array(COLS).fill(0); for (const [c] of g[0].cells) per[c]++;
      if (per.filter((x) => x > 0).length < 4 || Math.max.apply(null, per) > 3) return null;
      groups.push(g);
      const dr = drop(B, g), nb = dr.nb, need = i + 1 < m ? ns[i + 1] - d[i + 1] : 0, orbs = orbsAt(i + 1);
      if (dr.slots.length < need + orbs.length) return null;
      const slots = shuffle(dr.slots.slice(), rg), cnt2 = countsOf(nb), block2 = new Set(tg.slice(i + 1)), caps = {}; for (let j = 0; j <= i; j++) caps[tg[j]] = 3;
      const mv = dr.moves.slice(); let q = 0;
      const put = (x) => { const [c, j] = slots[q++]; nb[c][j] = x; cnt2[x.s] = (cnt2[x.s] || 0) + 1; mv.push({ id: x.id, c, r0: j - dr.kc[c], r1: j }); };
      for (let a = 0; a < need; a++) put(mk(ctx, tg[i + 1]));
      for (const o of orbs) put(mk(ctx, 'orb', o[1]));
      while (q < slots.length) { const s = pickFiller(rg, cnt2, block2, caps); if (!s) return null; put(mk(ctx, s)); }
      moves.push(mv); boards.push(nb); B = nb;
    }
    if (evaluate(B).length) return null;
    const tumbleX = groups.reduce((a, g) => a + g[0].x, 0), orbList = [];
    for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) { const x = B[c][r]; if (x && x.s === 'orb') orbList.push({ id: x.id, c, r, v: x.v }); }
    orbList.sort((a, b) => a.id - b.id);
    const mult = orbList.length ? orbList.reduce((a, o) => a + o.v, 0) : 1;
    return { def, n: m, boards, groups, moves, tumbleX, mult, spinWinX: tumbleX * mult, orbs: orbList };
  }
  function makePlan(def, seed, ctx) {
    for (let a = 0; a < 400; a++) { const p = genSpin(def, rng(seed * 1009 + a * 7919 + 13), ctx); if (p) { p.tries = a; return p; } }
    throw new Error('no board found for spin ' + JSON.stringify(def.wins));
  }
  function makePre(rg, ctx) {                                                    // the board on screen before spin 1: no wins, plenty of variety
    for (let a = 0; a < 50; a++) { const cnt = {}, B = []; let bad = false;
      for (let c = 0; c < COLS; c++) { const col = []; for (let r = 0; r < ROWS; r++) { const s = pickFiller(rg, cnt, new Set(), {}) ; if (!s) { bad = true; break; } cnt[s] = (cnt[s] || 0) + 1; col.push(mk(ctx, s)); } if (bad) break; B.push(col); }
      if (!bad && !evaluate(B).length) { B[3][1] = mk(ctx, 'scatter'); return B; } }
    throw new Error('no pre board');
  }
  const planAll = (seed) => { const ctx = { id: 1 }, defs = SCRIPTS[K.SCRIPT_ID] || SCRIPTS.classic4; const plans = defs.map((d, i) => makePlan(d, seed * 31 + i, ctx)); return { plans, pre: makePre(rng(seed + 99), ctx) }; };

  // ---------------- the spin state machine ----------------
  const TURBO_OK = { out: 1, in: 1, hilite: 1, burst: 1, fall: 1, settle: 1 };
  const titleCount = (win, bet) => (win >= K.TITLE_X[2] * bet ? 3 : win >= K.TITLE_X[1] * bet ? 2 : win >= K.TITLE_X[0] * bet ? 1 : 0);
  const DUR = {
    slam: () => K.T.slam, out: () => K.T.out, in: () => K.T.in + K.T.inCol * (COLS - 1) + K.T.inRow * (ROWS - 1), hilite: () => K.T.hilite, burst: () => K.T.burst, fall: () => K.T.fall,
    strike: (S) => (S.strikes === 0 ? K.T.strike1 : K.T.strike), tail: () => K.T.tail, nice: () => K.T.nice, charge: () => K.T.charge, settle: () => K.T.settle, big: (S) => S.bigN * K.T.titleDur + K.T.bigHold,
  };
  function enter(S, ph) {
    const t = S.t, plan = S.plan; S.phase = ph; S.pt = 0; S.applied = 0;
    if (ph === 'slam') { S.stormGoal = 1; S.ev.push({ k: 'slam', t }); }
    else if (ph === 'out') S.ev.push({ k: 'out', t });
    else if (ph === 'in') S.ev.push({ k: 'in', t });
    else if (ph === 'hilite') { const gs = plan.groups[S.stepNo]; for (const g of gs) { const amt = Math.round(g.x * S.bet); S.tumble += amt; S.ev.push({ k: 'win', t, s: g.s, n: g.n, pay: amt, x: g.x, cells: g.cells, step: S.stepNo, tumble: S.tumble }); } }
    else if (ph === 'burst') S.ev.push({ k: 'burst', t, step: S.stepNo });
    else if (ph === 'fall') { S.moves = plan.moves[S.stepNo]; S.ev.push({ k: 'fall', t, step: S.stepNo }); }
    else if (ph === 'strike') { const o = plan.orbs[S.orbIdx]; S.strikes++; S.ev.push({ k: 'strike', t, c: o.c, r: o.r, v: o.v, i: S.orbIdx, first: S.strikes === 1 }); }
    else if (ph === 'charge') { S.charge = 4; S.ev.push({ k: 'charge', t, n: 4 }); }
    else if (ph === 'big') { S.bigN = titleCount(S.spinWin, S.bet); S.titleShown = 0; S.stat.bigStart = t; S.ev.push({ k: 'bigstart', t, win: S.spinWin }); }
    S.dur = DUR[ph](S);
  }
  function startSpin(S) {
    const plan = S.plans[S.spinNo]; if (!plan) return;
    if (S.money < S.bet) { const ok = K.BETS.filter((b) => b <= S.money); if (!ok.length) return; S.bet = ok[ok.length - 1]; S.betIdx = K.BETS.indexOf(S.bet); }
    S.plan = plan; S.spinNo++; S.money -= S.bet; S.tumble = 0; S.mult = 0; S.win = 0; S.stepNo = 0; S.orbIdx = 0; S.mul = 1; S.moves = null; S.stormGoal = plan.def.storm;
    S.stat.spins++; if (S.stat.firstSpin < 0) S.stat.firstSpin = S.t;
    S.ev.push({ k: 'spin', t: S.t, n: S.spinNo, bet: S.bet });
    enter(S, plan.def.slam ? 'slam' : 'out');
  }
  function payout(S) {
    const plan = S.plan; S.spinWin = S.tumble * Math.max(1, S.mult); S.money += S.spinWin; S.win = S.spinWin; S.stat.wins.push(S.spinWin); S.stat.bets.push(S.bet);
    if (S.spinWin > 0) { S.ev.push({ k: 'pay', t: S.t, amount: S.spinWin, xs: S.spinWin / S.bet, mult: Math.max(1, S.mult) }); if (S.stat.firstWin < 0) S.stat.firstWin = S.t; }
    if (S.spinWin >= K.TITLE_X[0] * S.bet) enter(S, 'big'); else if (plan.def.nice) { S.ev.push({ k: 'nice', t: S.t }); enter(S, 'nice'); } else enter(S, 'settle');
  }
  function finishSpin(S) {
    const def = S.plan.def; if (def.charge) S.charge = Math.max(S.charge, def.charge);
    if (S.charge >= 1 && def.charge < 4) S.ev.push({ k: 'charge', t: S.t, n: S.charge });
    S.board = S.board.map((col) => col.map((x) => (x && x.s === 'orb' ? null : x)));
    S.phase = 'ready'; S.pt = 0; S.readyT = 0; S.mul = 1; S.ev.push({ k: 'ready', t: S.t, n: S.spinNo });
  }
  function cascadeDone(S) { if (S.plan.orbs.length) { S.orbIdx = 0; enter(S, 'strike'); } else payout(S); }

  function phaseStep(S) {
    const ph = S.phase, plan = S.plan;
    if (ph === 'ready') { S.readyT += DT; return; }
    if (ph === 'over') return;
    S.pt += DT * (TURBO_OK[ph] ? S.mul : 1);
    if (ph === 'strike' && !S.applied && S.pt >= S.dur * 0.45) { S.applied = 1; const o = plan.orbs[S.orbIdx]; S.mult += o.v; S.ev.push({ k: 'mult', t: S.t, v: o.v, total: S.mult, c: o.c, r: o.r }); if (plan.def.nice && S.orbIdx === 0) S.charge = 3; }
    if (ph === 'big') while (S.titleShown < S.bigN && S.pt >= S.titleShown * K.T.titleDur) { S.stat.titles.push(S.titleShown); S.ev.push({ k: 'title', t: S.t, n: S.titleShown }); S.titleShown++; }
    if (S.pt < S.dur) return;
    if (ph === 'slam') enter(S, 'out');
    else if (ph === 'out') enter(S, 'in');
    else if (ph === 'in') { S.board = plan.boards[0]; S.stepNo = 0; S.ev.push({ k: 'land', t: S.t, step: 0 }); if (plan.groups[0]) enter(S, 'hilite'); else { if (!plan.n) { S.stat.wins.push(0); S.stat.bets.push(S.bet); S.ev.push({ k: 'lose', t: S.t }); } enter(S, 'settle'); } }
    else if (ph === 'hilite') enter(S, 'burst');
    else if (ph === 'burst') enter(S, 'fall');
    else if (ph === 'fall') { S.stepNo++; S.board = plan.boards[S.stepNo]; S.moves = null; S.ev.push({ k: 'land', t: S.t, step: S.stepNo }); if (plan.groups[S.stepNo]) enter(S, 'hilite'); else cascadeDone(S); }
    else if (ph === 'strike') { const o = plan.orbs[S.orbIdx]; S.board[o.c][o.r] = null; S.orbIdx++; if (S.orbIdx < plan.orbs.length) enter(S, 'strike'); else enter(S, 'tail'); }
    else if (ph === 'tail') payout(S);
    else if (ph === 'nice') { if (plan.def.charge === 4) enter(S, 'charge'); else finishSpin(S); }
    else if (ph === 'charge' || ph === 'settle') finishSpin(S);
    else if (ph === 'big') { S.phase = 'over'; S.winT = S.t; S.ev.push({ k: 'bigdone', t: S.t }); }
  }
  // the big-win counter at the current phase time: three segments (BIG → MEGA → EPIC), each easing toward its threshold; the last one lands on the total
  function bigValue(S) {
    if (S.phase === 'over') return S.spinWin; if (S.phase !== 'big') return 0;
    const n = S.bigN, d = K.T.titleDur, thr = [0, K.TITLE_X[0] * S.bet, K.TITLE_X[1] * S.bet];
    if (S.pt >= n * d) return S.spinWin;
    const k = Math.min(n - 1, Math.floor(S.pt / d)), u = Math.max(0, Math.min(1, (S.pt - k * d) / d)), e = 1 - (1 - u) * (1 - u), a = thr[k], b = k === n - 1 ? S.spinWin : thr[k + 1];
    return Math.round(a + (b - a) * e);
  }

  function create(seed = K.SEED) {
    const { plans, pre } = planAll(seed);
    return { t: 0, steps: 0, wt0: 0, ev: [], freeze: 0, seed, plans, plan: null, board: pre, moves: null,
      money: K.BALANCE0, bet: K.BET, betIdx: Math.max(0, K.BETS.indexOf(K.BET)), spinNo: 0, phase: 'ready', pt: 0, dur: 0, readyT: 0, mul: 1, applied: 0, stepNo: 0, orbIdx: 0, strikes: 0,
      tumble: 0, mult: 0, win: 0, spinWin: 0, charge: 0, storm: 0, stormGoal: 0, bigN: 0, titleShown: 0,
      stat: { spins: 0, wins: [], bets: [], titles: [], firstSpin: -1, firstWin: -1, turbo: 0, bigStart: -1 },
      end: -1, endWhy: '', winT: -9, lastIn: 0, firstIn: -1, anc: null };
  }
  let spawns = 0;                                                                // a replay (spawn after the first) re-rolls the symbols, the outcomes stay the same
  const spawn = (worldT) => Object.assign(create(K.SEED + (spawns++)), { wt0: worldT });
  const respawn = (S, worldT) => spawn(worldT);
  const outOfPlay = () => false;

  function step(S, inp) {
    const t = S.t + DT; S.t = t; S.steps++;
    if (S.ev.length > 220) S.ev.splice(0, S.ev.length - 220);
    S.storm += (S.stormGoal - S.storm) * Math.min(1, 1.2 * DT);
    if (S.end < 0) {
      const click = !!inp.click;
      if (inp.bet && S.phase === 'ready') { const i = Math.max(0, Math.min(K.BETS.length - 1, S.betIdx + (inp.bet > 0 ? 1 : -1)));
        if (i !== S.betIdx && K.BETS[i] <= S.money) { S.betIdx = i; S.bet = K.BETS[i]; S.ev.push({ k: 'bet', t, bet: S.bet }); } S.lastIn = t; S.readyT = 0; if (S.firstIn < 0) S.firstIn = t; }
      if (click || inp.press) { S.lastIn = t; if (S.firstIn < 0) S.firstIn = t; }
      if (click) {
        if (S.phase === 'ready') startSpin(S, false);
        else if (TURBO_OK[S.phase] && S.mul === 1) { S.mul = K.TURBO; S.stat.turbo++; S.ev.push({ k: 'turbo', t }); }
        else if (S.phase === 'big' && !S.skipped && S.pt > K.SKIP_AFTER) { S.skipped = 1; S.pt = S.bigN * K.T.titleDur; S.dur = S.pt + K.SKIP_HOLD; S.titleShown = S.bigN; S.ev.push({ k: 'skip', t }); }
      }
      phaseStep(S);
      const why = S.winT > 0 && t - S.winT > K.END_AFTER_WIN ? 'win' : S.firstIn >= 0 && S.phase === 'ready' && S.readyT > K.END_IDLE ? 'time' : S.firstIn < 0 && t > K.END_NO_INPUT ? 'passive' : '';
      if (why) { S.end = t; S.endWhy = why; S.ev.push({ k: 'end', t }); }
    }
    return S;
  }

  // ---- attract demo: a planner that plays the ad the way the script wants (taps on SPIN, one turbo tap in spin 2) ----
  const demoDelay = (n) => (n === 0 ? 1.5 : 0.6 + 0.3 * (n % 2));                 // seconds the demo player waits (in 'ready') before the tap
  const scriptInput = (t, S) => {
    const inp = { px: LAY.spin.x, py: LAY.spin.y, press: 0, click: 0 };
    if (S.end >= 0) return inp;
    if (S.phase === 'ready') {
      const d = demoDelay(S.spinNo);
      if (S.readyT >= d) inp.click = 1; if (S.readyT >= d - 0.14 && S.readyT <= d + 0.05) inp.press = 1;
    } else if (S.plan && S.plan.n && !S.plan.orbs.length && S.phase === 'burst' && S.stepNo === 0 && !S.stat.turbo) inp.click = 1;
    return inp;
  };
  let cache = null;
  function at(t) {
    const loop = Math.floor(t / L), q = t - loop * L, n = Math.round(q / DT);
    if (!cache || cache.loop !== loop || cache.S.steps > n) { const S0 = Object.assign(create(), { wt0: loop * L }); cache = { loop, S: S0 }; }
    const S = cache.S; while (S.steps < n) step(S, scriptInput(S.t, S));
    return Object.assign({}, S, { loop, q, demo: true, inp: scriptInput(S.t, S) });
  }
  // the demo must hit every beat of the ad inside its loop
  const demoCheck = (S) => {
    const f = [], st = S.stat, exp = (SCRIPTS[K.SCRIPT_ID] || SCRIPTS.classic4).map((d) => d.expect * K.BET);
    if (st.firstSpin < 0 || st.firstSpin > 3) f.push('first spin late: ' + st.firstSpin.toFixed(1));
    if (JSON.stringify(st.wins) !== JSON.stringify(exp)) f.push('spin wins ' + JSON.stringify(st.wins) + ' != ' + JSON.stringify(exp));
    if (st.firstWin < 0 || st.firstWin > 6.5) f.push('first win late: ' + st.firstWin.toFixed(1));
    if (S.strikes !== 4) f.push('strikes ' + S.strikes + ' != 4');
    if (JSON.stringify(st.titles) !== '[0,1,2]') f.push('titles ' + JSON.stringify(st.titles));
    const bal = K.BALANCE0 - exp.length * K.BET + exp.reduce((a, b) => a + b, 0); if (S.money !== bal) f.push('balance ' + S.money + ' != ' + bal);
    if (S.end < 0 || S.end > 26) f.push('endcard late: ' + S.end.toFixed(1)); else if (S.endWhy !== 'win') f.push('endWhy ' + S.endWhy);
    return f;
  };

  root.SIM = { DT, L, K, VIEW, WORLD, HINT, COLS, ROWS, NORMAL, GEMS, PREM, SCRIPTS, LAY, create, spawn, respawn, outOfPlay, step, at, scriptInput, demoCheck,
    evaluate, drop, payOf, planAll, bigValue, titleCount, demoDelay };
  if (typeof module !== 'undefined') module.exports = root.SIM;
})(typeof window !== 'undefined' ? window : globalThis);

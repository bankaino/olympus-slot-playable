// live/scene.js — ГРОМ ОЛИМПА. Pure function of t and the sim state (no Math.random, no accumulated state).
// Layers: sky (dusk ↔ storm crossfade) → Zeus (one painted sprite bent by soft bones; a second sprite for the triumph) → play field + symbols (positions from the
// spin phase, clipped to the frame window) → frame → FX (bursts, bolts, popups, coins) → grade → HUD, hand, titles, endcard.
(function () {
  const S = (window.SCENE = {}), A = window.ASSETS, L = LIB, M = L.M, W = SIM.VIEW.W, H = SIM.VIEW.H, LAY = SIM.LAY, K = SIM.K, SS = L.SS, Z = window.SIZES, RIG = (window.RIGS || {}).zeus;
  S.REPEAT = [];
  const SK = window.SKIN, FONT = SK.font, TFONT = SK.titleFont || SK.font;
  S.programs = () => { L.init(W, H); L.glyphs('0123456789 ,.+×x₽%', { font: FONT }); };
  const has = (n) => !!A[n];
  const TXT = { font: FONT, outW: SK.txt.outW, shadow: SK.txt.shadow, weight: SK.txt.weight };
  const label = (slot, str, x, y, o = {}) => { const q = Object.assign({}, TXT, o); if (o.ink) { const k = SK.ink[o.ink] || SK.ink.base; q.col = k[0]; q.out = k[1]; } delete q.ink; if (o.title) { q.font = TFONT; q.weight = '400'; delete q.title; } return L.label(slot, str, x, y, q); };
  const labelW = (slot, str, o = {}) => L.labelW(slot, str, Object.assign({}, TXT, o.title ? { font: TFONT, weight: '400' } : {}, o));
  const rr = (x, y, w, h, round, c0, c1, a) => L.rrect(x, y, w, h, round <= 1 ? Math.min(w, h) * round : round, c0, c1, a);
  const panel = (x, y, w, h, k = 1, rPx) => { const rad = SK.panel.round <= 1 ? Math.min(w, h) * SK.panel.round : SK.panel.round, r = rPx ? Math.min(rPx, rad) : rad;
    if (SK.panel.rim) rr(x - 4, y - 4, w + 8, h + 8, r + 4, GOLD0, GOLD1, Math.min(1, 0.9 * k)); rr(x, y, w, h, r, SK.panel.a, SK.panel.b, Math.min(1, SK.panel.alpha * k)); };
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x)), ease = (x) => 1 - (1 - x) * (1 - x), lerp = (a, b, w) => a + (b - a) * w, rnd = L.rnd;
  const EASE = { out: ease, back: (x) => 1 + 2.70158 * Math.pow(x - 1, 3) + 1.70158 * Math.pow(x - 1, 2), soft: (x) => x * x * (3 - 2 * x) };
  const hex = (s) => [parseInt(s.slice(1, 3), 16) / 255, parseInt(s.slice(3, 5), 16) / 255, parseInt(s.slice(5, 7), 16) / 255];
  const fmt = (n) => String(Math.max(0, Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const GOLD0 = hex('#F5C542'), GOLD1 = hex('#B9771E'), GOLDL = hex('#FFF1A8'), PLUM0 = hex('#3A1236'), PLUM1 = hex('#24081F'), ICE = [0.6, 0.85, 1];
  const deco = (fn) => { const n0 = L.UI.length; fn(); L.UI.length = n0; };            // art stand-ins and transient FX are not HUD: keep them out of the QA overlap list
  S.hit = []; S.dead = [];
  const CELL = LAY.cell, cellXY = (c, r) => [LAY.gx + c * CELL, LAY.gy + r * CELL];
  const tw = (n) => G.tex(n);
  // a sprite centred on (cx, cy): scale, rotation, alpha, tint; w from SIZES unless given
  const spr = (n, cx, cy, o = {}) => { const w = o.w || Z[n][0], h = w * tw(n).h / tw(n).w, sx = o.sx === undefined ? 1 : o.sx, sy = o.sy === undefined ? sx : o.sy;
    L.sprite(n, 0, 0, { m: M.of(M.t(cx, cy), M.r(o.rot || 0), M.s(sx, sy)), w, h, pivot: [w / 2, h / 2], u: { alpha: o.a === undefined ? 1 : o.a, tint: o.tint || [1, 1, 1, 0] } }); return [w, h]; };
  const rays = (cx, cy, a, t0) => { if (a <= 0.004) return; G.blend('add'); for (let j = 0; j < 14; j++) L.solid(cx - 46, cy, 92, 1500, [1, 0.82, 0.4], j * 6.2832 / 14 + t0 * 0.12, 46, 0, a * (0.6 + 0.4 * Math.sin(t0 * 1.7 + j))); G.blend(); };
  const textW = (str, h) => { let w = 0; const k = h / L.GLYPH_H; for (const c of str) w += (L.GLYPH[c] || [0, 0])[1] * k * 0.86; return w; };
  const fitH = (str, h, maxW) => Math.min(h, h * maxW / Math.max(1, textW(str, h)));
  const segment = (p, q, th, col, a) => { const len = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1, an = Math.atan2(q[1] - p[1], q[0] - p[0]); L.solid(p[0], p[1] - th / 2, len, th, col, an, 0, th / 2, a); };
  const bolt = (x0, y0, x1, y1, seed, th, a, branches = 1) => {                      // midpoint-displaced polyline, additive: wide ice halo + thin white core
    const build = (ax, ay, bx, by, sd, lv0) => { let pts = [[ax, ay], [bx, by]];
      for (let lv = lv0; lv < lv0 + 5; lv++) { const nx = [pts[0]]; for (let i = 0; i < pts.length - 1; i++) { const [px, py] = pts[i], [qx, qy] = pts[i + 1], len = Math.hypot(qx - px, qy - py) || 1, d = (rnd(sd + lv * 17 + i, lv) - 0.5) * len * 0.55;
        nx.push([(px + qx) / 2 - (qy - py) / len * d, (py + qy) / 2 + (qx - px) / len * d]); nx.push(pts[i + 1]); } pts = nx; } return pts; };
    const draw = (pts, k) => { for (let i = 0; i < pts.length - 1; i++) { segment(pts[i], pts[i + 1], th * 3.4 * k, ICE, a * 0.38); segment(pts[i], pts[i + 1], th * k, [1, 1, 1], a); } };
    G.blend('add'); const main = build(x0, y0, x1, y1, seed, 0); draw(main, 1);
    for (let b = 0; b < branches; b++) { const i = Math.floor(main.length * (0.25 + 0.4 * rnd(seed, b))), [px, py] = main[i], an = Math.atan2(y1 - y0, x1 - x0) + (rnd(seed + 5, b) - 0.5) * 1.6, len = 90 + 140 * rnd(seed + 9, b);
      draw(build(px, py, px + Math.cos(an) * len, py + Math.sin(an) * len, seed + 31 * (b + 1), 1), 0.6); }
    G.blend(); };

  // ---------------- Zeus: pose from events, soft-bone forward map for the points the FX hang on ----------------
  const RB = RIG ? RIG.bones : [[500, 1150], [800, 650], [480, 520]];
  const rotp = (p, c, a) => { const dx = p[0] - c[0], dy = p[1] - c[1], cs = Math.cos(a), sn = Math.sin(a); return [c[0] + dx * cs - dy * sn, c[1] + dx * sn + dy * cs]; };
  const pose = (ST, GT) => {
    let a0 = 0.012 * Math.sin(GT * 0.9), a1 = 0.03 * Math.sin(GT * 1.3 + 1), a2 = 0.022 * Math.sin(GT * 0.7 + 2), eyes = 0.12;
    for (const e of ST.ev) { const a = GT - e.t; if (a < 0 || a > 1.6) continue;
      if (e.k === 'spin' && a < 0.5) a2 -= 0.05 * Math.sin(Math.PI * a / 0.5);
      if (e.k === 'win' && a < 0.6) { a2 -= 0.07 * Math.sin(Math.PI * a / 0.6); a1 -= 0.08 * Math.sin(Math.PI * a / 0.6); }
      if (e.k === 'lose' && a < 0.8) a2 += 0.06 * Math.sin(a * 22) * (1 - a / 0.8);
      if (e.k === 'strike' || e.k === 'slam') { const d = e.k === 'slam' ? 1.4 : 1; if (a < 0.12) { a1 += 0.38 * d * a / 0.12; eyes = 1; } else if (a < 1.2) { a1 += (-0.16 + 0.54 * 0) * d * Math.exp(-(a - 0.12) * 7); eyes = Math.max(eyes, 1 - (a - 0.12) / 0.9); a2 -= 0.05 * d * Math.exp(-(a - 0.12) * 6); } }
      if (e.k === 'charge' && a < 1.2) { eyes = Math.max(eyes, 1 - a / 1.2); a1 -= 0.1 * Math.sin(Math.PI * Math.min(1, a / 0.6)); } }
    if (ST.charge >= 4 && ST.phase === 'ready') { eyes = 0.75 + 0.25 * Math.sin(GT * 6); a1 -= 0.1; }
    return { a0, a1, a2, eyes: clamp(eyes, 0, 1) };
  };
  const zeusPt = (p, w, ps, ox, oy) => { const z = LAY.zeus; let r = rotp(p, RB[2], ps.a2 * w[2]); r = rotp(r, RB[0], ps.a0 * w[0]); r = rotp(r, RB[1], ps.a1 * w[1]); return [z.x + r[0] * z.k + ox, z.y + r[1] * z.k + oy]; };

  S.render = (t) => {
    const ST = S.state || SIM.at(t), GT = ST.t, ph = ST.phase, plan = ST.plan, endc = ST.end >= 0;
    const triumph = ph === 'big' || ph === 'over' || endc;
    // ---- trauma shake from recent events ----
    let tr = 0; for (const e of ST.ev) { const a = GT - e.t; if (a < 0) continue;
      if (e.k === 'strike' && a < 0.5) tr = Math.max(tr, 0.8 * (1 - a / 0.5)); if (e.k === 'slam' && a < 0.6) tr = Math.max(tr, 1 - a / 0.6);
      if (e.k === 'burst' && a < 0.25) tr = Math.max(tr, 0.3 * (1 - a / 0.25)); if (e.k === 'title' && a < 0.4) tr = Math.max(tr, 0.7 * (1 - a / 0.4)); }
    const sh = 14 * tr * tr, ox = sh * Math.sin(GT * 83), oy = sh * Math.sin(GT * 101 + 1);

    // ===== sky: dusk ↔ storm, drifting; far lightning in the storm =====
    const st = clamp(ST.storm, 0, 1), bw = tw('bg_day').w * W / tw('bg_day').w * 1.06, bh = bw * tw('bg_day').h / tw('bg_day').w;
    L.beginBG([0.45, 0.28, 0.4, 1]);
    rr(0, 0, W, H, 0, hex('#C98A8C'), hex('#8A5A72'));
    { const bx = -(bw - W) / 2 + 14 * Math.sin(GT * 0.12);
      L.sprite('bg_day', bx, 0, { w: bw, h: bh, u: { alpha: 1 } });
      if (st > 0.01 && has('bg_storm')) L.sprite('bg_storm', bx, 0, { w: bw, h: bh, u: { alpha: st } });
      if (bh < H) rr(0, bh - 2, W, H - bh + 2, 0, hex('#C98A8C'), hex('#7A4A62')); }
    L.beginComp();
    { const fl = st > 0.5 ? Math.max(0, 1 - ((GT * 0.7 + 0.31) % 1.9) / 0.22) : 0, k = Math.floor((GT * 0.7 + 0.31) / 1.9);
      if (fl > 0) { L.solid(0, 0, W, LAY.frame.y + 200, [0.8, 0.9, 1], 0, 0, 0, 0.28 * fl * st); bolt(120 + 700 * rnd(k, 3), -20, 200 + 600 * rnd(k, 4), LAY.frame.y - 80, k * 13, 3, 0.55 * fl * st, 2); }
      L.motes(GT, { n: 70, amt: 0.3 * (1 - 0.6 * st), col: [1, 0.85, 0.5], h: LAY.frame.y + 400 }); }

    // ===== Zeus =====
    { const z = LAY.zeus, ps = pose(ST, GT), br = 1 + 0.008 * Math.sin(GT * 1.6), stormTint = [0.55, 0.65, 1, 0.22 * st];
      L.glow(z.x + z.w * 0.45 + ox, z.y + z.h * 0.22 + oy, 520, lerp3([1, 0.75, 0.4], [0.5, 0.65, 1], st), 0.28 + 0.2 * (triumph ? 1 : 0), 2.2);
      if (triumph && has('zeus_triumph')) {                                          // second pose: both arms up; lands with the white flash, head just above the frame
        const q = SS(0, 0.22, ph === 'big' ? ST.pt : 9), asp = tw('zeus_triumph').w / tw('zeus_triumph').h, y2 = 14, hc = LAY.frame.y - 80, h2 = (hc - y2) / 0.43 * (0.94 + 0.06 * q), w2 = h2 * asp, x2 = W / 2 - w2 / 2 + 12 * (w2 / 700), edge = w2 < W * 1.02 ? 0.14 : 0.03;   // the head centre sits at 43 % of the sprite: it lands just above the frame on every phone height
        rays(x2 + w2 * 0.5 + ox, y2 + h2 * 0.43 + oy, 0.1 * q * (ph === 'big' || ph === 'over' ? 1 : 0.6), GT);
        L.sprite('zeus_triumph', x2 + ox, y2 + oy, { w: w2, h: h2, pad: 0.02, u: { alpha: q, fade: [edge, edge], vfade: 0.05, tint: stormTint, bulge: [0.5, 0.45, 0.28, 0.012 * Math.sin(GT * 2)] } });
        if (ph === 'big' && ST.pt < 0.25) L.solid(0, 0, W, H, [1, 1, 1], 0, 0, 0, 0.6 * (1 - ST.pt / 0.25));
        for (const [fx, fy] of [[0.23, 0.02], [0.8, 0.02]]) L.glow(x2 + w2 * fx + ox, y2 + h2 * fy + oy + 40, 180, ICE, 0.4 + 0.2 * Math.sin(GT * 30 + fx * 9), 2.2); }
      else {
        L.sprite('zeus', z.x + ox, z.y + oy, { w: z.w, h: z.h, pad: 0.05, u: { tint: stormTint, bulge: [0.48, 0.40, 0.3, 0.012 * (br - 1) * 80],
          bone0: [RB[0][0] / RIG.w, RB[0][1] / RIG.h, ps.a0, 1], bone1: [RB[1][0] / RIG.w, RB[1][1] / RIG.h, ps.a1, 1], bone2: [RB[2][0] / RIG.w, RB[2][1] / RIG.h, ps.a2, 1], wtex: G.tex('zeus_w'), wsz: [RIG.w, RIG.h] } });
        // glowing eyes + the always-crackling bolt in his fist
        const eL = zeusPt([362, 303], [0.78, 0, 1], ps, ox, oy), eR = zeusPt([432, 290], [0.78, 0, 1], ps, ox, oy), hd = zeusPt([900, 400], [0.45, 1, 0], ps, ox, oy);
        if (ps.eyes > 0.05) for (const e of [eL, eR]) { L.glow(e[0], e[1], 15 + 12 * ps.eyes, [0.6, 0.85, 1], 0.7 * ps.eyes, 2.6); L.star(e[0], e[1], 10 + 12 * ps.eyes, [0.85, 0.95, 1], 0.8 * ps.eyes); }
        L.glow(hd[0], hd[1] - 80, 90, ICE, 0.35 + 0.15 * Math.sin(GT * 22), 2.4); } }

    if (st > 0.3) { const H0 = LAY.frame.y + 70; G.blend('add'); for (let i = 0; i < 70; i++) { const sp = 1300 + 500 * rnd(i, 1), x = ((rnd(i, 2) * (W + 400) - GT * 140 * (0.6 + rnd(i, 3))) % (W + 400) + W + 400) % (W + 400) - 100, y = ((rnd(i, 4) * H0 + GT * sp) % H0);
      L.solid(x, y, 2.4, 46 + 40 * rnd(i, 5), [0.7, 0.85, 1], 0.18, 0, 0, 0.16 * st); } G.blend(); }
    // ===== play field (behind the symbols) =====
    const GX = LAY.gx + ox, GY = LAY.gy + oy;
    rr(GX - 3, GY - 3, LAY.gw + 6, LAY.gh + 6, 0, PLUM0, PLUM1);
    for (let c = 1; c < SIM.COLS; c += 2) L.solid(GX + c * CELL, GY, CELL, LAY.gh, [0.13, 0.04, 0.12], 0, 0, 0, 0.55);
    for (let r = 1; r < SIM.ROWS; r++) L.solid(GX, GY + r * CELL - 1, LAY.gw, 2, [0.5, 0.3, 0.1], 0, 0, 0, 0.12);

    // ===== symbols (clipped to the frame window) =====
    const texOf = (cell) => (cell.s === 'orb' ? (cell.v >= 10 ? 'orb_blue' : 'orb_green') : cell.s);
    const dimT = [0.1, 0.03, 0.14, 0.5];
    const cellDraw = (cx, cy, cell, o = {}) => {
      const sc = o.sc === undefined ? 1 : o.sc, a = o.a === undefined ? 1 : o.a; if (a <= 0.01) return;
      if (o.glow) L.glow(cx, cy, 110 * sc, [1, 0.8, 0.25], o.glow * a, 2.2);
      const [, h] = spr(texOf(cell), cx, cy, { sx: sc * (o.sx || 1), sy: sc * (o.sy || 1), a, tint: o.dim ? dimT : null });
      if (cell.s === 'orb') deco(() => label('orb' + cell.v, 'x' + cell.v, cx, cy - h * 0.1 * sc, { size: Math.round(50 * sc), ink: 'gold', al: 0.5, a })); };
    const cc = (c, r) => [LAY.gx + c * CELL + CELL / 2 + ox, LAY.gy + r * CELL + CELL / 2 + oy];
    const winCells = new Set(); if (plan && (ph === 'hilite' || ph === 'burst')) for (const g of plan.groups[ST.stepNo] || []) for (const [c, r] of g.cells) winCells.add(c * 8 + r);
    G.clip(LAY.gx + ox, LAY.gy + oy, LAY.gw, LAY.gh);
    if (ph === 'in' && plan) {                                                   // new spin: column by column, bottom first, ease-out with a squash on arrival
      for (let c = 0; c < SIM.COLS; c++) for (let r = SIM.ROWS - 1; r >= 0; r--) { const cell = plan.boards[0][c][r], d = K.T.inCol * c + K.T.inRow * (SIM.ROWS - 1 - r), q = clamp((ST.pt - d) / K.T.in, 0, 1); if (ST.pt < d) continue;
        const [x, y] = cc(c, r), dist = (r + 2) * CELL + 120, land = ST.pt - d - K.T.in, sq = land > 0 ? Math.exp(-land * 22) * Math.sin(land * 34) * 0.1 : 0;
        cellDraw(x, y - (1 - ease(q)) * dist + CELL * 0.0, cell, { sx: 1 + sq, sy: 1 - sq }); }
    } else if (ph === 'fall' && plan) {                                          // survivors and refills drop to their rows with a small bounce
      const mv = {}; for (const m of ST.moves || []) mv[m.id] = m; const B = plan.boards[ST.stepNo + 1], q = clamp(ST.pt / K.T.fall, 0, 1), e = q < 0.8 ? (q / 0.8) * (q / 0.8) : 1 - 0.06 * Math.sin((q - 0.8) / 0.2 * Math.PI);
      for (let c = 0; c < SIM.COLS; c++) for (let r = 0; r < SIM.ROWS; r++) { const cell = B[c][r]; if (!cell) continue; const m = mv[cell.id] || { r0: r, r1: r }, x = LAY.gx + c * CELL + CELL / 2 + ox, y = LAY.gy + oy + (lerp(m.r0, m.r1, e) + 0.5) * CELL;
        cellDraw(x, y, cell); }
    } else if (ST.board) {
      const out = ph === 'out', hl = ph === 'hilite' || ph === 'burst';
      for (let c = 0; c < SIM.COLS; c++) for (let r = 0; r < SIM.ROWS; r++) { const cell = ST.board[c][r]; if (!cell) continue; const [x, y] = cc(c, r);
        if (out) { const q = clamp((ST.pt - 0.012 * (SIM.ROWS - 1 - r)) / K.T.out, 0, 1); cellDraw(x, y + q * q * (SIM.ROWS - r + 1.2) * CELL, cell, { a: 1 - SS(0.5, 1, q) }); continue; }
        const w = winCells.has(c * 8 + r), bq = ph === 'burst' ? clamp(ST.pt / K.T.burst, 0, 1) : 0, pul = ph === 'hilite' ? 0.5 + 0.5 * Math.sin(GT * 28) : 0;
        const orbHit = ph === 'strike' && plan.orbs[ST.orbIdx] && plan.orbs[ST.orbIdx].c === c && plan.orbs[ST.orbIdx].r === r;
        const idle = 1 + 0.015 * Math.sin(GT * 2 + c * 1.3 + r * 0.9);
        cellDraw(x, y, cell, { sx: cell.s === 'orb' ? 1 + 0.04 * Math.sin(GT * 8 + c * 1.7) : 1, sc: w ? (ph === 'burst' ? 1 + 0.5 * bq : 1.05 + 0.05 * pul) : orbHit ? 1.2 + 0.1 * Math.sin(GT * 40) : cell.s === 'orb' ? idle : 1, a: w && ph === 'burst' ? 1 - bq : 1,
          glow: w ? (ph === 'burst' ? 1.2 : 0.7 + 0.3 * pul) : orbHit ? 1.1 : 0, dim: hl && !w }); }
    }
    G.clip();
    // ===== frame =====
    { const f = LAY.frame; L.sprite('frame', f.x + ox, f.y + oy, { w: f.w, h: f.h });
      for (const [i, fx, fy] of [[0, 110, 60], [1, 905, 60], [2, 509, 22], [3, 80, 905], [4, 935, 905], [5, 509, 940]]) { const a = Math.pow(Math.max(0, Math.sin(GT * 1.3 + i * 2.1)), 8); if (a > 0.02) L.star(f.x + fx * f.k + ox, f.y + fy * f.k + oy, 26 + 20 * a, [1, 0.95, 0.7], a); } }
    if (ph === 'slam') L.solid(0, 0, W, H, [1, 1, 1], 0, 0, 0, 0.55 * (1 - SS(0, 1, ST.pt / K.T.slam)) * SS(0, 0.08, ST.pt));

    // ===== FX from events =====
    const hand = (() => { const ps = pose(ST, GT); return zeusPt([900, 330], [0.45, 1, 0], ps, ox, oy); })();
    for (const e of ST.ev) { const a = GT - e.t; if (a < 0) continue;
      if (e.k === 'win' && a < 0.9) { let sx = 0, topY = 1e9; for (const [c, r] of e.cells) { sx += cellXY(c, r)[0] + CELL / 2; topY = Math.min(topY, cellXY(c, r)[1]); } sx /= e.cells.length;
        const q = a / 0.9, py = Math.max(LAY.gy + 40, topY - 6) - 46 * ease(q); deco(() => label('winpop', '+' + fmt(e.pay) + ' ₽', sx + ox, py + oy, { size: Math.round(64 * (a < 0.12 ? 0.6 + 3.3 * a : 1)), ink: 'hot', al: 0.5, a: 1 - SS(0.7, 1, q) })); }
      if (e.k === 'burst' && a < 0.55) { const q = a / 0.55, win = (ST.plan && ST.plan.groups[e.step]) || [];
        for (const g of win) { let gx = 0, gy = 0;
          for (const [c, r] of g.cells) { const [x, y] = cc(c, r); gx += x; gy += y;
            if (a < 0.14) L.glow(x, y, 96, [1, 0.88, 0.45], 0.85 * (1 - a / 0.14), 2.2);                          // the flash where the symbol pops
            G.blend('add');
            for (let j = 0; j < 2; j++) { const sd = c * 17 + r * 5 + j * 3, an = rnd(sd, 1) * 6.283, v = 500 + 400 * rnd(sd, 2), len = 16 + 14 * rnd(sd, 3), vx = Math.cos(an) * v, vy = Math.sin(an) * v + 1200 * a, vl = Math.hypot(vx, vy) || 1,
                px = x + Math.cos(an) * v * a, py = y + Math.sin(an) * v * a + 600 * a * a; segment([px - vx / vl * len, py - vy / vl * len], [px, py], 3.5, [1, 0.86, 0.45], 0.9 * (1 - q)); }
            G.blend(); }
          gx /= g.cells.length; gy /= g.cells.length; L.ring(gx, gy, 80 + 300 * ease(q), 80 + 300 * ease(q), [1, 0.8, 0.3], 0.3 * (1 - q), 0.1); } }
      if (e.k === 'strike' && a < 0.4) { const [x, y] = cellXY(e.c, e.r), fl = 1 - a / 0.4; bolt(hand[0], hand[1], x + CELL / 2 + ox, y + CELL / 2 + oy, Math.floor(GT * 20) * 3, 7, fl, 2); L.glow(x + CELL / 2, y + CELL / 2, 260, ICE, fl, 2); if (a < 0.08) L.solid(0, 0, W, H, [1, 1, 1], 0, 0, 0, 0.3 * (1 - a / 0.08)); }
      if (e.k === 'slam' && a < 0.45) for (let j = 0; j < 4; j++) bolt(hand[0], hand[1], LAY.gx + (j + 0.6) * LAY.gw / 4, LAY.gy + LAY.gh * (0.25 + 0.17 * j), Math.floor(GT * 20) * 5 + j * 11, 8, 1 - a / 0.45, 2);
      if (e.k === 'mult' && a < 0.6) { const [x, y] = cellXY(e.c, e.r), q = ease(a / 0.6), fx = lerp(x + CELL / 2, LAY.medal.x, q), fy = lerp(y + CELL / 2, LAY.medal.y, q) - 90 * Math.sin(Math.PI * q);
        L.glow(fx, fy, 70, ICE, 0.9 * (1 - SS(0.8, 1, q)), 2.2); L.star(fx, fy, 38 * (1 - 0.4 * q), [1, 1, 1], 1 - SS(0.85, 1, q)); }
    }
    if (triumph && has('coin')) for (let j = 0; j < 140; j++) { const t0 = (ph === 'big' ? ST.t - ST.pt : ST.end >= 0 ? ST.end - 6 : ST.t) + j * 0.03, a = GT - t0 - ((ph === 'big') ? 0 : 0); if (ph === 'big' && a < 0) continue; if (a < 0) continue;
      const life = 1.9, q = (a % life) / life, x0 = 80 + (W - 160) * rnd(j, 7), vx = (rnd(j, 8) - 0.5) * 260, vy = -(900 + 600 * rnd(j, 9)), tt = q * life, x = x0 + vx * tt, y = H * 0.9 + vy * tt + 1500 * tt * tt;
      if (y > H + 60) continue; spr('coin', x, y, { w: 52 + 24 * rnd(j, 10), sx: Math.cos(tt * 9 + j), sy: 1, a: 1 - SS(0.8, 1, q) }); }
    for (const e of ST.ev) { if (e.k !== 'pay' || ph === 'big' || ph === 'over' || endc) continue; const a = GT - e.t; if (a < 0.1 || a > 1.5) continue; const nn = Math.min(14, 4 + Math.floor(Math.log10(Math.max(100, e.xs * 100)) * 3));
      for (let j = 0; j < nn; j++) { const q = clamp((a - 0.1 - 0.045 * j) / 0.75, 0, 1); if (q <= 0 || q >= 1) continue; const u = q * q * (3 - 2 * q), x0 = W / 2 + (rnd(j, 5) - 0.5) * 360, y0 = LAY.gy + LAY.gh * (0.4 + 0.2 * rnd(j, 6)), x1 = 160, y1 = LAY.panelY + 112;
        spr('coin', lerp(x0, x1, u), lerp(y0, y1, u) - 170 * Math.sin(Math.PI * u) * (0.6 + 0.4 * rnd(j, 7)), { w: 54, sx: Math.cos(q * 18 + j), sy: 1, a: 1 - SS(0.9, 1, q) }); } }
    if (bigDimOn(ph, endc)) L.solid(0, 0, W, H, [0.02, 0.0, 0.06], 0, 0, 0, endc ? 0.0 : 0.38 * SS(0, 0.5, ph === 'big' ? ST.pt : 1));
    L.finish(t, SK.grade);

    // ===================== HUD (screen space) =====================
    S.hit = []; S.dead = [];                                                       // dead = a margin around the stake buttons: a tap that just misses them must not start a spin
    if (!(endc && SK.end.layout === 'card')) {
      const bigNow = ph === 'big' || ph === 'over';
      if (!bigNow) { const lw0 = labelW('brand', 'ГРОМ ОЛИМПА', { size: 46, title: true }), pw0 = lw0 + 150, px0 = 34, py0 = 30;
        panel(px0, py0, pw0, 86, 1, 43); spr('scatter', px0 + 62, py0 + 43, { w: 92 }); label('brand', 'ГРОМ ОЛИМПА', px0 + 112 + lw0 / 2, py0 + 45, { size: 46, ink: 'logo', al: 0.5, title: true }); }
      // plaque on the frame's gold plate: hook line → pay-anywhere rule → the running cascade win
      const [pcx, pcy] = LAY.frame.plate;
      // the plate shows the running total win: the cascade sums as it grows, then × the orbs as each one lands; it stays after the spin until the next spin starts
      const spinAt = (() => { for (let i = ST.ev.length - 1; i >= 0; i--) if (ST.ev[i].k === 'spin') return i; return -1; })(), ms = [];
      for (let i = spinAt + 1; i < ST.ev.length; i++) { const e = ST.ev[i]; if (e.k === 'win') ms.push([e.t, e.tumble]); else if (e.k === 'mult') ms.push([e.t, ST.tumble * e.total]); }
      let rwin = 0; if (bigNow) rwin = SIM.bigValue(ST); else if (ms.length) { let ix = -1; for (let j = 0; j < ms.length; j++) if (ms[j][0] <= GT) ix = j; if (ix >= 0) rwin = lerp(ix > 0 ? ms[ix - 1][1] : 0, ms[ix][1], ease(clamp((GT - ms[ix][0]) / 0.45, 0, 1))); } else rwin = ST.win;
      if (rwin > 0.5) { const txt = fmt(rwin) + ' ₽', th = 66, tw0 = textW(txt, th), lw1 = labelW('plq1', 'ВЫИГРЫШ', { size: 40 }), gap = 30, x0 = pcx - (lw1 + gap + tw0) / 2;
        label('plq1', 'ВЫИГРЫШ', x0, pcy, { size: 40, ink: 'plateText' }); L.text(txt, x0 + lw1 + gap, pcy + 2, th, 0); }
      else if (ST.spinNo === 0) label('plq0', 'Крути — и лови молнию Зевса!', pcx, pcy, { size: 46, ink: 'plateText', al: 0.5 });
      // total multiplier medallion (the purple orb frame, number in code)
      if (ST.mult > 0 && ph !== 'ready') { const md = LAY.medal, last = ST.ev.filter((e) => e.k === 'mult').pop() || { t: -9 }, pop = 1 + 0.18 * Math.max(0, 1 - (GT - last.t) / 0.25);
        const R = 112 * pop; rr(md.x - R - 5, md.y - R - 5, 2 * R + 10, 2 * R + 10, R + 5, GOLD0, GOLD1); rr(md.x - R, md.y - R, 2 * R, 2 * R, R, [0.34, 0.1, 0.46], [0.16, 0.04, 0.26]);
        label('medal1', 'ОБЩИЙ', md.x, md.y - 60 * pop, { size: 23, ink: 'panelText', al: 0.5 }); label('medal2', 'МНОЖИТЕЛЬ', md.x, md.y - 35 * pop, { size: 23, ink: 'panelText', al: 0.5 });
        const mt = 'x' + ST.mult, mh = fitH(mt, 78, 150) * pop; L.text(mt, md.x, md.y + 30 * pop, mh, 0.5); }
      // bottom panel: balance, bet, win; SPIN with Zeus's charge
      const by = LAY.panelY, bh = 300, counting = bigNow, cv = counting ? SIM.bigValue(ST) : ST.win; let pend = 0;
      if (!counting) for (const e of ST.ev) { if (e.k !== 'pay') continue; const a = GT - e.t; if (a < 0 || a > 2) continue;
        const nn = Math.min(14, 4 + Math.floor(Math.log10(Math.max(100, e.xs * 100)) * 3)); pend += e.amount * (1 - clamp((a - 0.85) / (0.045 * nn), 0, 1)); }
      const shownMoney = counting ? ST.money - ST.spinWin + cv : ST.money - pend;
      panel(24, by, W - 48, bh, 1, 40);
      const lx = 58, nh = 70, mw = 350;
      label('lbal', 'БАЛАНС', lx, by + 50, { size: 32, ink: 'panelText' }); L.text(fmt(shownMoney) + ' ₽', lx, by + 112, fitH(fmt(shownMoney) + ' ₽', nh, mw), 0);
      label('lbet', 'СТАВКА', lx, by + 186, { size: 32, ink: 'panelText' }); L.text(fmt(ST.bet) + ' ₽', lx, by + 248, fitH(fmt(ST.bet) + ' ₽', nh, mw), 0);
      { const bt = LAY.bet, lastBet = ST.ev.filter((e) => e.k === 'bet').pop() || { t: -9 }, kp = 1 - 0.1 * Math.max(0, 1 - (GT - lastBet.t) / 0.15), can = ph === 'ready' && !endc;
        for (const [id, cx, dir] of [['bet-', bt.minus, -1], ['bet+', bt.plus, 1]]) { const lim = dir < 0 ? ST.betIdx <= 0 : ST.betIdx >= K.BETS.length - 1 || K.BETS[ST.betIdx + 1] > ST.money, on = can && !lim, r = bt.r * kp;
          rr(cx - r - 5, bt.y - r - 5, 2 * r + 10, 2 * r + 10, r + 5, on ? GOLD0 : [0.4, 0.3, 0.3], on ? GOLD1 : [0.25, 0.18, 0.2]); rr(cx - r, bt.y - r, 2 * r, 2 * r, r, [0.30, 0.09, 0.40], [0.14, 0.04, 0.24]);
          const a = on ? 1 : 0.35, th = 9, ln = 44 * kp; L.solid(cx - ln / 2, bt.y - th / 2, ln, th, GOLDL, 0, 0, 0, a); if (dir > 0) L.solid(cx - th / 2, bt.y - ln / 2, th, ln, GOLDL, 0, 0, 0, a);
          S.hit.push({ id, x: cx - 75, y: bt.y - 75, w: 150, h: 150 }); S.dead.push({ x: cx - 105, y: bt.y - 105, w: 210, h: 210 }); } }
      const sp = LAY.spin, ready = ph === 'ready' && !endc, slamReady = ready && ST.charge >= 4, spinning = !ready && !endc, pul = 1 + (ready ? SK.cta.pulse * Math.sin(t * 5) : 0);
      if (slamReady) L.glow(sp.x, sp.y, sp.r * 1.9, [1, 0.8, 0.3], 0.4 + 0.2 * Math.sin(t * 8), 2.2);
      for (let i = 0; i < 4; i++) { const an = -Math.PI * (0.8 - i * 0.2), rx = sp.x + Math.cos(an) * (sp.r + 62), ry = sp.y + Math.sin(an) * (sp.r + 62), on = i < ST.charge;
        spr('g_blue', rx, ry, { w: 48 + (on ? 6 * Math.sin(t * 6 + i) : 0), a: on ? 1 : 0.35, tint: on ? null : [0.1, 0.05, 0.15, 0.6] }); if (on) L.glow(rx, ry, 46, ICE, 0.55, 2.4); }
      spr('btn_spin', sp.x, sp.y, { w: 2 * sp.r * 1.06 * pul, rot: spinning ? t * 9 : 0, tint: slamReady ? [1, 0.9, 0.5, 0.25] : null });
      if (slamReady) label('slam', 'УДАР ЗЕВСА!', sp.x, sp.y - sp.r - 86, { size: 44, ink: 'hot', al: 0.5 });
      // callouts
      for (const e of ST.ev) { const a = GT - e.t; if (a < 0 || endc) continue;
        if (e.k === 'nice' && a < 1.1) { const q = a / 1.1; label('nice', 'ОТЛИЧНО!', W / 2, LAY.gy + LAY.gh * 0.45 - 40 * EASE.out(q), { size: Math.round(120 * (a < 0.15 ? 0.4 + 4 * a : 1)), ink: 'hot', al: 0.5, a: 1 - SS(0.75, 1, q), title: true }); }
        if (e.k === 'slam' && a < 1.0) { const q = a / 1.0; label('slamt', 'УДАР ЗЕВСА!', W / 2, LAY.gy + LAY.gh * 0.4, { size: Math.round(100 * (a < 0.15 ? 0.4 + 4 * a : 1)), ink: 'hot', al: 0.5, a: 1 - SS(0.7, 1, q), title: true }); }
        if (e.k === 'turbo' && a < 0.6) label('turbo', 'ТУРБО', LAY.spin.x, LAY.spin.y - LAY.spin.r - 40, { size: 34, ink: 'base', al: 0.5, a: 1 - a / 0.6 }); }
      // big win: ribbon + title + counter
      if (bigNow) { const n = ST.bigN, k = Math.min(n - 1, Math.floor(ST.pt / K.T.titleDur)), kk = ph === 'over' ? n - 1 : k, tt = ph === 'over' ? 99 : ST.pt - kk * K.T.titleDur;
        const names = ['БОЛЬШОЙ ВЫИГРЫШ!', 'МЕГА ВЫИГРЫШ!', 'ЭПИЧЕСКИЙ ВЫИГРЫШ!'], cy = LAY.gy + LAY.gh * 0.28, rw = 960, fit = Math.min(1, 860 / labelW('tm' + kk, names[kk], { size: 78, title: true })), sz = Math.round(78 * fit * (tt < 0.18 ? 0.4 + 3.4 * tt : 1));
        rr(W / 2 - rw / 2 - 5, cy - 83, rw + 10, 166, 44, GOLD0, GOLD1, 0.95); rr(W / 2 - rw / 2, cy - 78, rw, 156, 40, [0.30, 0.09, 0.40], [0.14, 0.04, 0.24], 0.95);
        { const lt = ST.ev.filter((e) => e.k === 'title').pop(); if (lt && GT - lt.t < 0.3) { G.blend('add'); L.solid(W / 2 - rw / 2, cy - 78, rw, 156, [1, 0.95, 0.7], 0, 0, 0, 0.45 * (1 - (GT - lt.t) / 0.3)); G.blend(); } }
        label('title' + kk, names[kk], W / 2, cy, { size: sz, ink: 'hot', al: 0.5, title: true }); L.text(fmt(SIM.bigValue(ST)) + ' ₽', W / 2, cy + 200, 150, 0.5); }
      // tutorial hand: one continuous gesture — it glides in from below, presses the button (the button answers with a ripple), lifts away and fades; nothing switches abruptly
      const idle = ready && (ST.spinNo === 0 ? ST.readyT > 0.2 : ST.readyT > K.HAND_IDLE);
      let hu = -1;
      if (!endc && ST.demo) { const d = SIM.demoDelay(ST.spinNo), lastSpin = ST.ev.filter((e) => e.k === 'spin').pop();
        if (ready) { const u = (ST.readyT - (d - 0.45)) / 0.9; if (u >= 0 && u <= 1) hu = u; } else if (lastSpin && GT - lastSpin.t < 0.45) hu = 0.5 + (GT - lastSpin.t) / 0.9; }
      else if (!endc && idle) hu = (((ST.readyT - (ST.spinNo === 0 ? 0.2 : K.HAND_IDLE)) / 1.8) % 1 + 1) % 1;
      if (hu >= 0) { const sm = (a0, a1, x) => SS(a0, a1, x), press = Math.sin(Math.PI * clamp((hu - 0.4) / 0.2, 0, 1)), off = 120 * Math.max(1 - sm(0, 0.4, hu), sm(0.62, 0.95, hu)) + 12 * press,
          al = sm(0, 0.18, hu) * (1 - sm(0.84, 1, hu)), hw = Z.hand[0] * (1 - 0.06 * press), hh = hw * tw('hand').h / tw('hand').w, rp = clamp((hu - 0.44) / 0.4, 0, 1);
        if (rp > 0 && rp < 1) L.ring(sp.x, sp.y, sp.r * (0.75 + 0.6 * ease(rp)), sp.r * (0.75 + 0.6 * ease(rp)), [1, 0.95, 0.8], 0.55 * (1 - rp), 0.07);
        if (press > 0.05) L.glow(sp.x, sp.y, 100, [1, 1, 1], SK.hand.glow * press, 2.5);
        L.sprite('hand', sp.x + 8 - hw / 2, sp.y + 14 + off, { w: hw, h: hh, u: { alpha: al } }); }
    }
    // ===== endcard =====
    if (endc) { const a = GT - ST.end, k = SS(0, 0.45, a), oy2 = (H - 1920) / 2, pop = (d) => { const q = clamp((a - d) / 0.35, 0, 1); return q < 1 ? 1.12 * ease(q) - 0.12 * q * q : 1; };
      const bgw = bw, bgh = bh; L.sprite('bg_storm', -(bgw - W) / 2, 0, { w: bgw, h: bgh, u: { alpha: k * 0.55, tint: [0.1, 0.05, 0.2, 0.35] } });
      rr(0, 0, W, H, 0, SK.end.bg[0], SK.end.bg[1], k * 0.72);
      for (let i = 0; i < 10; i++) L.glow(W * rnd(i + 40, 1), H * rnd(i + 40, 2), 100 + 140 * rnd(i + 40, 3), [1, 0.8, 0.3], 0.14 * k, 2.2);
      const zt = SS(0.1, 0.6, a), zw = 520, zh2 = zw * tw('zeus_triumph').h / tw('zeus_triumph').w;
      L.glow(W / 2, 360 + oy2, 420, [1, 0.8, 0.4], 0.35 * zt, 2.2); rays(W / 2, 430 + oy2, 0.07 * zt, GT);
      L.sprite('zeus_triumph', W / 2 - zw / 2 + 8, 100 + oy2 - 50 * (1 - zt) + 5 * Math.sin(t * 1.5), { w: zw, h: zh2, u: { alpha: zt, fade: [0.14, 0.14], vfade: 0.05 } });
      const win = ST.endWhy === 'win', head = win ? 'ЭПИЧЕСКИЙ ВЫИГРЫШ!' : ST.endWhy === 'passive' ? 'ИСПЫТАЙ УДАЧУ ОЛИМПА' : 'ЗЕВС ЖДЁТ ТЕБЯ!', s1 = pop(0.2), hy = 905 + oy2;
      if (s1 > 0.01) { const hh = win ? 250 : 130; rr(56, hy - 62, W - 112, hh + 8, 50, GOLD0, GOLD1, k); rr(60, hy - 58, W - 120, hh, 46, [0.30, 0.09, 0.40], [0.14, 0.04, 0.24], 0.97 * k);
        label('head2', head, W / 2, hy, { size: Math.round(60 * s1), ink: 'hot', al: 0.5, title: true }); if (win) L.text(fmt(ST.spinWin) + ' ₽', W / 2, hy + 112, 112 * s1, 0.5); }
      const s2 = pop(0.45); if (s2 > 0.01) { const fs = K.OFFER === 'fs', cw = 900, ch = 280, cy = 1285 + oy2;
        panel(W / 2 - cw / 2, cy - ch / 2, cw, ch, 1, 50); label('of0', 'БОНУС НОВИЧКУ', W / 2, cy - 82, { size: Math.round(40 * s2), ink: 'panelText', al: 0.5 });
        label('of1', fs ? '200 ФРИСПИНОВ' : '+100% К ДЕПОЗИТУ', W / 2, cy - 5, { size: Math.round(72 * s2), ink: 'gold', al: 0.5 }); label('of2', fs ? 'БЕЗ ДЕПОЗИТА' : '+ 200 ФРИСПИНОВ', W / 2, cy + 72, { size: Math.round(50 * s2), ink: 'hot', al: 0.5 }); }
      if (has('treasure') && s2 > 0.01) { const tw2 = Z.treasure[0], th2 = tw2 * tw('treasure').h / tw('treasure').w; L.sprite('treasure', W / 2 - tw2 / 2, 1408 + oy2, { w: tw2, h: th2, u: { alpha: s2 } }); }
      const s3 = pop(0.7), pul = 1 + 0.04 * Math.sin(t * 6), bw3 = 880 * s3 * pul, bh3 = 170 * s3 * pul, bx = W / 2 - bw3 / 2, by2 = 1610 + oy2 - bh3 / 2;
      if (s3 > 0.01) { L.glow(W / 2, 1610 + oy2, 480, [0.3, 0.9, 0.5], 0.28 * k, 2.2); rr(bx, by2 + 14, bw3, bh3, 0.5, SK.cta.endBase[0], SK.cta.endBase[1]); rr(bx - 7, by2 - 7, bw3 + 14, bh3 + 14, 0.5, GOLD0, GOLD1); rr(bx, by2, bw3, bh3, 0.5, SK.cta.end[0], SK.cta.end[1]);
        { const gx0 = bx + bh3 * 0.35, gw0 = bw3 - bh3 * 0.7, ph0 = ((t * 0.5) % 1.6); G.clip(gx0, by2, gw0, bh3); G.blend('add'); L.solid(gx0 - 160 + ph0 * (gw0 + 320), by2 - 20, 70, bh3 + 40, [1, 1, 1], 0.35, 0, 0, 0.28 * k); G.blend(); G.clip(); }
        label('endcta', 'ЗАРЕГИСТРИРОВАТЬСЯ', W / 2, by2 + bh3 / 2, { size: Math.round(58 * s3), ink: 'ctaEnd', al: 0.5 }); S.hit.push({ id: 'cta', x: bx, y: by2, w: bw3, h: bh3 }); }
      if (a > 1.0) { const rw = 380, ry = 1776 + oy2, q = SS(1.0, 1.4, a); rr(W / 2 - rw / 2, ry - 42, rw, 84, 0.5, SK.end.plate[0], SK.end.plate[1], 0.85 * q);
        label('replay', 'ЕЩЁ РАЗ', W / 2, ry, { size: 40, ink: 'plateText', al: 0.5, a: q }); S.hit.unshift({ id: 'replay', x: W / 2 - 220, y: ry - 62, w: 440, h: 124 }); }
      if (a > 0.6 && K.CTA_FULLSCREEN) S.hit.push({ id: 'cta', x: 0, y: 0, w: W, h: H });
    }
  };
  const lerp3 = (a, b, w) => [lerp(a[0], b[0], w), lerp(a[1], b[1], w), lerp(a[2], b[2], w)];
  function bigDimOn(ph, endc) { return ph === 'big' || ph === 'over' || endc; }

  // QA hooks: every HUD screen at its worst case, staged from the attract replay where it happens naturally
  S.QA = () => {
    const at = (tt, o = {}) => Object.assign(JSON.parse(JSON.stringify(SIM.at(tt))), o);
    return { states: [['start', at(0.3)], ['spin1', at(1.9)], ['win2', at(5.1)], ['orb', at(10)], ['nice', at(11.3)], ['charged', at(12.4)], ['slam', at(13.3)], ['cascade', at(16.5)], ['strikes', at(19)],
      ['big', at(22)], ['money_worst', at(22, { money: 9999999, win: 9999999, tumble: 9999999, spinWin: 9999999 })], ['end', at(26)], ['end_passive', at(26, { endWhy: 'passive' })], ['end_time', at(26, { endWhy: 'time' })]], cycles: {}, sprites: {}, box: () => [0, 0, W, H] };
  };
})();

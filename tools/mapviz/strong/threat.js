// strong threat (MV-STR): enemy ground G_e(d), the threat samples TH, the threat heat layer and the route samples
// (design 6 frame). G_e(d) = cells the enemy (THREAT kind) reaches at least d s before me (my kind); d steps 30, 15, 5,
// 0 s while G_e holds under 16 lattice samples (ruling 13). TH = a seeded jittered 8 m lattice over G_e, weight
// 0.25 + 0.75 x route density of the enemy's routes. Heat = weighted share of threat samples that see the cell.
// Author: Imperator_Aug (ARSENAL, ia-8141e1a3)
'use strict';
const F = require('./frame');

const HEAT_N = 16, HEAT_N_BIG = 8, HEAT_CELLS = 20000;

function enemyGround(ctx) {
  const fr = ctx.fr, wb = ctx.doc.boxes.world;
  const tS = new Float32Array(fr.w * fr.h).fill(-1), tE = new Float32Array(fr.w * fr.h).fill(-1);
  for (let j = 0; j < fr.h; j++) for (let i = 0; i < fr.w; i++) {
    const p = F.centre(fr, i, j), k = j * fr.w + i;
    if (!F.inBox(wb, p.x, p.y)) continue;
    const a = F.tAt(ctx.Ts, p.x, p.y), b = F.tAt(ctx.TeThr, p.x, p.y);
    tS[k] = a === null ? -1 : a; tE[k] = b === null ? -1 : b;
  }
  let d = null, mask = null;
  for (const dd of F.D_STEPS) {
    const m = new Uint8Array(fr.w * fr.h);
    for (let k = 0; k < m.length; k++) if (tE[k] >= 0 && (tS[k] < 0 || tS[k] - tE[k] >= dd)) m[k] = 1;
    let n = 0;
    for (let y = wb[1]; y <= wb[3]; y += F.LAT_TH) for (let x = wb[0]; x <= wb[2]; x += F.LAT_TH) { const k = F.cellOf(fr, x, y); if (k >= 0 && m[k]) n++; }
    d = dd; mask = m;
    if (n >= F.D_MIN_SAMPLES) break;
  }
  if (d !== 30) ctx.note('STRONG_ENEMY_GROUND_D', 'side ' + ctx.s + ': enemy ground held under 16 samples at 30 s; d = ' + d + ' s');
  ctx.d = d; ctx.G = mask;
  // distance to enemy ground (u), for binocular reach and mortar reach
  const R = require('../lib/raster');
  // raster.distance measures from each nonzero cell to the nearest zero cell: give it "not enemy ground"
  const inv = new Uint8Array(mask.length);
  let any = false;
  for (let k = 0; k < mask.length; k++) { inv[k] = mask[k] ? 0 : 1; if (mask[k]) any = true; }
  const g = { name: 'g', w: fr.w, h: fr.h, cell: fr.cell, ox: fr.ox, oy: fr.oy, etype: 'u8', sample: 'cell', scale: 1, offset: 0, nodata: null, meta: {}, data: inv };
  ctx.distG = any ? R.distance(g) : null;
}

function samples(ctx) {
  const fr = ctx.fr, wb = ctx.doc.boxes.world, TH = [];
  const dens = ctx.routeDensE;
  let id = 0, ix = 0;
  for (let y = wb[1] + F.LAT_TH / 2; y < wb[3]; y += F.LAT_TH) {
    let jx = 0;
    for (let x = wb[0] + F.LAT_TH / 2; x < wb[2]; x += F.LAT_TH) {
      const px = x + (F.hash(ctx.seed, ix, jx, 11) - 0.5) * F.LAT_TH * 0.5, py = y + (F.hash(ctx.seed, ix, jx, 12) - 0.5) * F.LAT_TH * 0.5;
      jx++;
      const k = F.cellOf(fr, px, py);
      if (k < 0 || !ctx.G[k]) continue;
      const g = F.hAt(ctx.grids.height, px, py);
      if (g === null) continue;
      const dv = dens ? F.valAt(dens, px, py) : null;
      const w = 0.25 + 0.75 * (dv === null ? 0 : Math.min(250, dv) / 250);
      TH.push({ id: id++, x: px, y: py, w, eye: { x: px, y: py, z: g + ctx.thr.eyeU }, top: { x: px, y: py, z: g + ctx.thr.topU } });
    }
    ix++;
  }
  ctx.TH = TH;
  ctx.thOrder = TH.map((t, i) => i).sort((a, b) => F.hash(ctx.seed, a, 7, 3) - F.hash(ctx.seed, b, 7, 3) || a - b);
}

// heat (share of threat samples that see the cell) and dfT (share of fire lines terrain blocks), strong frame; NaN
// where not computed (off ground, outside the world box). Big frames are computed every st cells and filled.
function heat(ctx) {
  const fr = ctx.fr, S = ctx.rules.sight, R = ctx.R, n = fr.w * fr.h, wb = ctx.doc.boxes.world;
  const H = new Float32Array(n).fill(NaN), D = new Float32Array(n).fill(NaN);
  const st = Math.max(1, Math.ceil(Math.sqrt(n / HEAT_CELLS)));
  const N = st > 1 ? HEAT_N_BIG : HEAT_N;
  if (st > 1) ctx.capHit('heat computed every ' + st + ' cells with ' + N + ' samples');
  const pick = require('./factors').pick;
  const maxR = Math.max(R.enemySightU, R.enemyFireU);
  for (let j = 0; j < fr.h; j += st) {
    if (ctx.tick) ctx.tick();
    for (let i = 0; i < fr.w; i += st) {
      const p = F.centre(fr, i, j);
      if (!F.inBox(wb, p.x, p.y)) continue;
      const g = F.hAt(ctx.grids.height, p.x, p.y);
      if (g === null) continue;
      const top = { x: p.x, y: p.y, z: g + ctx.me.topU };
      let ws = 0, wse = 0, wf = 0, wt = 0;
      for (const s of pick(ctx, p.x, p.y, maxR, N)) {
        if (s.d <= R.enemySightU) { ws += s.t.w; if (S.canSee(ctx.sg, s.t.eye, top, { uncoverU: R.enemyUncoverU, rangeU: R.enemySightU })) wse += s.t.w; }
        if (s.d <= R.enemyFireU) { wf += s.t.w; if (S.fireLine(ctx.fg, s.t.eye, top, { rangeU: R.enemyFireU }).block === 'terrain') wt += s.t.w; }
      }
      const hv = ws ? wse / ws : 0, dv = wf ? wt / wf : 0;
      for (let b = 0; b < st && j + b < fr.h; b++) for (let a = 0; a < st && i + a < fr.w; a++) { const k = (j + b) * fr.w + i + a; H[k] = hv; D[k] = dv; }
    }
  }
  ctx.heat = H; ctx.dfT = D;
}

// route samples of one side and unit: every 4 m along each route, merged on a grid of a quarter of the range (design
// 6: "deduplicated every quarter of the sight range"); weight = time share (cell cost of the unit, >= 1)
function routeSamples(ctx, items, side, unit, mcost, tgt) {
  const step = 80, q = Math.max(80, ctx.R.engU / 4);
  const cells = new Map();
  let tot = 0;
  for (const r of items) {
    if (r.side !== side || r.unit !== unit || !Array.isArray(r.pts)) continue;
    for (let k = 1; k < r.pts.length; k++) {
      const a = r.pts[k - 1], b = r.pts[k], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (!(L > 0)) continue;
      const dx = (b[0] - a[0]) / L, dy = (b[1] - a[1]) / L;
      for (let s = 0; s < L; s += step) {
        const x = a[0] + dx * s, y = a[1] + dy * s;
        const c = mcost ? F.valAt(mcost, x, y) : null;
        const w = Math.min(step, L - s) / step * (c === null || !(c >= 1) ? 1 : Math.min(c, 20));
        tot += w;
        const key = Math.floor(x / q) + ',' + Math.floor(y / q);
        let e = cells.get(key);
        if (!e) { e = { x: 0, y: 0, w: 0, dx: 0, dy: 0 }; cells.set(key, e); }
        e.x += x * w; e.y += y * w; e.w += w; e.dx += dx * w; e.dy += dy * w;
      }
    }
  }
  const pts = [];
  for (const k of [...cells.keys()].sort()) {
    const e = cells.get(k), x = e.x / e.w, y = e.y / e.w, g = F.hAt(ctx.grids.height, x, y);
    if (g === null) continue;
    const L = Math.hypot(e.dx, e.dy) || 1;
    pts.push({ x, y, z: g + tgt.topU, eyeZ: g + tgt.eyeU, w: e.w, dx: e.dx / L, dy: e.dy / L });
  }
  return { pts, tot };
}

module.exports = { enemyGround, samples, heat, routeSamples };

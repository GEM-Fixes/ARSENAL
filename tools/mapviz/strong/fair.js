// strong fairness (MV-STR): the map maker's view (design 6): per flag and side the mean of the five best scores near the
// flag among cells that side reaches first, the best hull-down and ambush value and the count of uncontested covers;
// each side's score distribution (10 bins), their largest gap (deciles), each side's share of the top 50; symmetry
// (180 deg turn or mirror about the world box centre, residual <= 3 m) with a difference map's ten largest patches and
// the objects in them. FAIR_FLAG check items: best5 difference > 0.15 or ratio > 1.25.
// Author: Imperator_Aug (ARSENAL, ia-7724b7c5)
'use strict';
const F = require('./frame');

const rd = v => Math.round(v * 1000) / 1000;

function flags(base, bySide) {
  const out = [], checks = [];
  for (const fl of base.flags) {
    const row = { flag: fl.name };
    const per = {};
    for (const s of Object.keys(bySide)) {
      const ctx = bySide[s].ctx, list = bySide[s].all;
      const zr = Math.max(...F.zoneBox(fl).map((v, i) => Math.abs(v - (i % 2 ? fl.y : fl.x))));
      const near = list.filter(c => c.gate === 1 && Math.hypot(c.x - fl.x, c.y - fl.y) <= Math.max(zr, ctx.R.engU) && ctx.firstAt(c.x, c.y));
      const sc = near.map(c => c.score).sort((a, b) => b - a).slice(0, 5);
      per[s] = {
        best5: sc.length ? rd(sc.reduce((a, b) => a + b, 0) / sc.length) : 0,
        hull: rd(Math.max(0, ...near.map(c => c.f.hu || 0))),
        amb: rd(Math.max(0, ...near.map(c => c.f.amb || 0))),
        uncont: near.filter(c => c.cls && c.cls.includes('uncont')).length,
      };
      out.push({ flag: fl.name, side: s, best5: per[s].best5, hull: per[s].hull, amb: per[s].amb, uncont: per[s].uncont });
    }
    if (per.a && per.b) {
      const a = per.a.best5, b = per.b.best5, hi = Math.max(a, b), lo = Math.min(a, b);
      const diff = hi - lo, ratio = lo > 0 ? hi / lo : (hi > 0 ? Infinity : 1);
      // value and limit are those of the test that fired: the difference (limit 0.15), else the ratio (limit 1.25)
      if (diff > 0.15 || ratio > 1.25) {
        const byDiff = diff > 0.15;
        checks.push({ kind: 'check', code: 'FAIR_FLAG', x: fl.x, y: fl.y, region: 0, side: a > b ? 'a' : 'b', unit: base.kind, flag: fl.name,
          value: byDiff ? rd(diff) : (Number.isFinite(ratio) ? rd(ratio) : null), limit: byDiff ? 0.15 : 1.25 });
      }
    }
    void row;
  }
  return { flags: out, checks };
}

function dist(bySide) {
  const d = {}, q = {};
  for (const s of Object.keys(bySide)) {
    const sc = bySide[s].all.filter(c => c.gate === 1).map(c => c.score).sort((a, b) => a - b);
    const h = new Array(10).fill(0);
    for (const v of sc) h[Math.min(9, Math.floor(v * 10))]++;
    d[s] = h;
    q[s] = [];
    for (let k = 1; k <= 9; k++) q[s].push(sc.length ? sc[Math.floor(k / 10 * (sc.length - 1))] : 0);
  }
  let gap = 0;
  if (q.a && q.b) for (let k = 0; k < 9; k++) gap = Math.max(gap, Math.abs(q.a[k] - q.b[k]));
  const all = [];
  for (const s of Object.keys(bySide)) for (const c of bySide[s].all) if (c.gate === 1) all.push(c);
  all.sort((p, r) => r.score - p.score || p.x - r.x || p.y - r.y);
  const top = all.slice(0, 50), top50 = {};
  for (const s of Object.keys(bySide)) top50[s] = top.length ? rd(top.filter(c => c.side === s).length / top.length) : 0;
  return { dist: d, gap: rd(gap), top50 };
}

// symmetry: the transform that maps side a's spawns and the flags best (mean distance to the nearest image), when
// <= 3 m; then a height difference map (> 0.5 m) on the strong frame, its ten largest patches, and the objects in them
// that have no twin of the same def within 2 m under the transform
function symmetry(base) {
  const wb = base.doc.boxes.world, cx = (wb[0] + wb[2]) / 2, cy = (wb[1] + wb[3]) / 2;
  const T = { rot180: (x, y) => [2 * cx - x, 2 * cy - y], mirrorX: (x, y) => [2 * cx - x, y], mirrorY: (x, y) => [x, 2 * cy - y] };
  const a = base.m.spawns.filter(s => s.team === 'a'), b = base.m.spawns.filter(s => s.team === 'b');
  let best = null;
  for (const k of Object.keys(T)) {
    const ds = [];
    for (const s of a) { const p = T[k](s.x, s.y); ds.push(Math.min(Infinity, ...b.map(t => Math.hypot(t.x - p[0], t.y - p[1])))); }
    for (const f of base.flags) { const p = T[k](f.x, f.y); ds.push(Math.min(Infinity, ...base.flags.map(t => Math.hypot(t.x - p[0], t.y - p[1])))); }
    if (!ds.length) continue;
    const r = ds.reduce((x, y) => x + y, 0) / ds.length / F.UPM;
    if (!best || r < best.r) best = { k, r };
  }
  if (!best || !Number.isFinite(best.r) || best.r > 3) return { kind: null, residualM: best && Number.isFinite(best.r) ? rd(best.r) : null, patches: [] };
  const fr = base.fr, n = fr.w * fr.h, mask = new Uint8Array(n), tf = T[best.k];
  for (let j = 0; j < fr.h; j++) for (let i = 0; i < fr.w; i++) {
    const p = F.centre(fr, i, j);
    if (!F.inBox(wb, p.x, p.y)) continue;
    const q = tf(p.x, p.y), h1 = F.hAt(base.grids.height, p.x, p.y), h2 = F.hAt(base.grids.height, q[0], q[1]);
    if (h1 !== null && h2 !== null && Math.abs(h1 - h2) > 10) mask[j * fr.w + i] = 1;
  }
  const objs = base.objects.filter(o => o.fp && o.fp.pts && o.fp.pts.length).map(o => {
    let x = 0, y = 0; for (const p of o.fp.pts) { x += p[0]; y += p[1]; }
    return { uid: o.uid, def: o.def, x: x / o.fp.pts.length, y: y / o.fp.pts.length };
  });
  const odd = objs.filter(o => { const q = tf(o.x, o.y); return !objs.some(t => t.def === o.def && Math.hypot(t.x - q[0], t.y - q[1]) <= 40); });
  for (const o of odd) { const k = F.cellOf(fr, o.x, o.y); if (k >= 0) mask[k] = 1; }
  const R = require('../lib/raster');
  const reg = R.regions({ name: 'sym', w: fr.w, h: fr.h, cell: fr.cell, ox: fr.ox, oy: fr.oy, etype: 'u8', sample: 'cell', scale: 1, offset: 0, nodata: null, meta: {}, data: mask }, { conn: 8 });
  const patches = reg.list.slice().sort((p, q) => q.area - p.area || p.id - q.id).slice(0, 10).map(r => {
    const inR = odd.filter(o => { const k = F.cellOf(fr, o.x, o.y); return k >= 0 && reg.grid.data[k] === r.id; }).map(o => o.uid).sort((p, q) => p - q);
    return { x: rd(r.ax !== undefined ? r.ax : r.cx), y: rd(r.ay !== undefined ? r.ay : r.cy), areaM2: rd(r.area), objects: inR };
  });
  return { kind: best.k, residualM: rd(best.r), patches };
}

module.exports = { flags, dist, symmetry };

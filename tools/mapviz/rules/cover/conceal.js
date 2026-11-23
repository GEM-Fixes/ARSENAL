// cover conceal (MV-COV): bush covers 9..11 and the cover.conceal layer (design 5.4; rules.md 4.1 of waves C and D).
//   conceal(doc, grids, placed, o?) -> {conceal (u8 grid 'cover.conceal'), points:[coverPoint 9..11], counts}
// Port of on the map.net frame (ruling 6: from entcat
// solids, not from the sight grid) [I frame]. Per cell (value at its south-west lattice point, README 4.2):
//   soft top = the highest top of a concealing solid over the cell centre (able visible, not bullet, not obstacle);
//   hard     = a solid over the cell centre that is visible and bullet or obstacle (a wall: field 1, never concealment);
//   object height = max(ground, soft top, hard top) (the object grid);
//   a soft cell (not hard) whose object height is >= 0.7 m over its ground is tried at stand (the cell itself >= 1.64 m),
//   squat (>= 1.31 m), then lie (share >= 0.8 of the cells within the lie reach >= 0.7 m) [V thresholds and order].
// The share is tested on an object grid of the engine's own cell (profile objCellU: 7 u as2, 5 u goh, GHAI-29) laid from
// the frame origin, around the object cell that holds the map.net cell centre [I centre]:
//   stand, squat: int(0.3 m / object cell) = 0 on as2 (the cell alone), 1 on goh (3 x 3 cells of 5 u = a 15 u box);
//   lie:          int(0.7 m / object cell) = 2 on both (5 x 5 cells: 35 u as2, 25 u goh).
// No rounding to map.net cells: a 10 u goh map keeps the 15 u stand box (COV_CONCEAL_REACH [I], in-game check pending).
// Points: the cell's corner, a free place for the pose (ground 3 refuses lie, 4 and 5 all; footprints), no cover within
// 0.6 m (HasCoverNear, walls and lip points first) -> type 9 stand, 10 squat, 11 lie, uid = the object whose soft solid
// gives the cell's highest top (rules.md 4.2: only type 12 has uid null). Concealment never shields.
// The draft names `not contact` too; entcat cover.conceal leaves contact out and so does this (contract note in REPORT).
// Author: Imperator_Aug (ARSENAL, ia-7b730880)
'use strict';
const E = require('./edges');
const P = require('./probe');
const U = E.U;

// placed = entcat placeSolids rows, or null with o.objects and o.catalog (fallback solids, note COVER_NO_SOLIDS)
// o {target, profile, objects, catalog, near (points laid before), tick}
function conceal(doc, grids, placed, o) {
  o = o || {};
  const prof = o.profile || require('./index').profile(o.target || (doc && doc.game) || 'mowas2');
  const hg = grids && grids.height;
  if (!hg) throw Object.assign(new Error('cover conceal: grids.height is needed'), { code: 'COVER_GRID' });
  const f = E.frameOf(grids);
  const so = P.solidsOf(doc, grids, o.catalog, o.objects || [], placed);
  const n = f.w * f.h;
  const soft = new Float64Array(n).fill(-Infinity), hard = new Float64Array(n).fill(-Infinity);
  const softUid = new Array(n).fill(null);
  // the object grid (engine cell objCellU from the frame origin): the highest top of any visible solid per object cell
  const oc = prof.objCellU;
  const ow = Math.max(1, Math.ceil(f.w * f.cell / oc)), oh = Math.max(1, Math.ceil(f.h * f.cell / oc));
  const otop = new Float32Array(ow * oh).fill(-Infinity);
  const tick = typeof o.tick === 'function' ? o.tick : null;
  let lastT = Date.now();
  let k = 0;
  for (const s of so.solids) {
    if (tick && Date.now() - lastT >= 100) { lastT = Date.now(); tick(k, so.solids.length * 2); }
    k++;
    const a = s.able;
    if (!a.visible || s.flat) continue;
    const isHard = !!(a.bullet || a.obstacle);
    // nocover only drops the probe mask; concealment stays
    const tgt = isHard ? hard : soft;
    const i0 = Math.max(0, Math.floor((s.box[0] - f.ox) / f.cell)), i1 = Math.min(f.w - 1, Math.floor((s.box[2] - f.ox) / f.cell));
    const j0 = Math.max(0, Math.floor((s.box[1] - f.oy) / f.cell)), j1 = Math.min(f.h - 1, Math.floor((s.box[3] - f.oy) / f.cell));
    for (let j = j0; j <= j1; j++) {
      const cy = f.oy + (j + 0.5) * f.cell;
      for (let i = i0; i <= i1; i++) {
        const cx = f.ox + (i + 0.5) * f.cell;
        if (!E.inPoly(s.hull, cx, cy)) continue;
        const c = j * f.w + i;
        if (s.zMax > tgt[c]) { tgt[c] = s.zMax; if (!isHard) softUid[c] = s.uid === undefined ? null : s.uid; }
      }
    }
    const p0 = Math.max(0, Math.floor((s.box[0] - f.ox) / oc)), p1 = Math.min(ow - 1, Math.floor((s.box[2] - f.ox) / oc));
    const q0 = Math.max(0, Math.floor((s.box[1] - f.oy) / oc)), q1 = Math.min(oh - 1, Math.floor((s.box[3] - f.oy) / oc));
    for (let q = q0; q <= q1; q++) {
      const cy = f.oy + (q + 0.5) * oc;
      for (let p = p0; p <= p1; p++) {
        const c = q * ow + p;
        if (s.zMax > otop[c] && E.inPoly(s.hull, f.ox + (p + 0.5) * oc, cy)) otop[c] = s.zMax;
      }
    }
  }
  const ground = new Float64Array(n).fill(NaN);
  for (let j = 0; j < f.h; j++) for (let i = 0; i < f.w; i++) {
    const g = E.latticeH(hg, i, j);
    if (g !== null) ground[j * f.w + i] = g;
  }
  // the object height of an object cell = max(ground under it, its top); the ground is read only when no top clears
  const ogr = new Map();
  function objH(p, q, thr) {
    const c = q * ow + p;
    if (otop[c] >= thr) return otop[c];
    let g = ogr.get(c);
    if (g === undefined) { g = E.groundAt(hg, f.ox + (p + 0.5) * oc, f.oy + (q + 0.5) * oc); ogr.set(c, g); }
    return g === null ? otop[c] : Math.max(g, otop[c]);
  }
  // the engine reach in object cells: int(radius / object cell), no rounding to the map.net cell
  const reachLie = Math.floor(U.placeStep / oc + 1e-9);
  const reachStand = Math.floor(U.placeRadius / oc + 1e-9);
  function share(i, j, reach, height) {
    const p = Math.min(ow - 1, Math.floor(((i + 0.5) * f.cell) / oc)), q = Math.min(oh - 1, Math.floor(((j + 0.5) * f.cell) / oc));
    const x0 = Math.max(0, p - reach), x1 = Math.min(ow - 1, p + reach), y0 = Math.max(0, q - reach), y1 = Math.min(oh - 1, q + reach);
    const thr = ground[j * f.w + i] + height;
    let high = 0, total = 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { total++; if (objH(x, y, thr) >= thr) high++; }
    return total ? high / total : 0;
  }
  const data = new Uint8Array(n);
  const counts = { lie: 0, squat: 0, stand: 0, points: 0, solids: so.solids.length, source: so.source };
  const place = P.placeCheck(grids, o.objects || []);
  const nearIdx = P.buckets(32);
  for (const p of o.near || []) nearIdx.add({ x: p.x, y: p.y }, [p.x, p.y, p.x, p.y]);
  const hasNear = (x, y) => {
    for (const q of nearIdx.query([x - U.near, y - U.near, x + U.near, y + U.near])) if ((q.x - x) * (q.x - x) + (q.y - y) * (q.y - y) < U.near * U.near) return true;
    return false;
  };
  const pts = [];
  const NAME = { 1: 'lie', 2: 'squat', 3: 'stand' };
  for (let j = 0; j < f.h; j++) {
    if (tick && Date.now() - lastT >= 100) { lastT = Date.now(); tick(so.solids.length + Math.round(so.solids.length * j / f.h), so.solids.length * 2); }
    for (let i = 0; i < f.w; i++) {
      const c = j * f.w + i;
      if (!(soft[c] > -Infinity) || hard[c] > -Infinity || Number.isNaN(ground[c])) continue;
      if (!(Math.max(ground[c], soft[c]) - ground[c] >= U.low)) continue;   // hard is none here
      let pose = 0;
      if (share(i, j, reachStand, U.high) >= 0.8) pose = 3;
      else if (share(i, j, reachStand, U.mid) >= 0.8) pose = 2;
      else if (share(i, j, reachLie, U.low) >= 0.8) pose = 1;
      if (!pose) continue;
      data[c] = pose;
      counts[NAME[pose]]++;
      const px = f.ox + i * f.cell, py = f.oy + j * f.cell;
      if (!place.free([px, py], pose, -1) || hasNear(px, py)) continue;
      pts.push({ x: px, y: py, type: pose === 3 ? 9 : pose === 2 ? 10 : 11, uid: softUid[c], row: 0, wall: null });
      nearIdx.add({ x: px, y: py }, [px, py, px, py]);
    }
  }
  if (tick) tick(1, 1);
  counts.points = pts.length;
  const grid = { name: 'cover.conceal', w: f.w, h: f.h, cell: f.cell, ox: f.ox, oy: f.oy, etype: 'u8', sample: 'cell', scale: 1, offset: 0, nodata: null,
    meta: { counts: { lie: counts.lie, squat: counts.squat, stand: counts.stand }, reachCells: { stand: reachStand, lie: reachLie }, objCellU: oc, game: prof.game }, data };
  const out = { conceal: grid, points: pts.map(P.item), counts, notes: so.notes };
  return out;
}

module.exports = { conceal };

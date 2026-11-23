// sight grid: sight.grid, sight.ground and sight.field (rules.md 3.1), the engine's sector grid
// Build, Rebuild) on the sight frame.
//   frame(doc, game) -> {C, ox, oy, w, h}
//   levels(height) -> {hMin, hMax, step} min ground - 60 u, max ground + 240 u, 256 steps [V]
//   grid(doc, grids, placed, o?) -> {grid, ground, field, counts, notes}   o {target, tick(done, total)}
//   trackObject(row, F, game) -> {entries:[{i, j, z, bits}], thin, ignored}   one placeSolids row through the tracker port
// Cell value = ground at the cell's south-west corner (bilinear, clamped into the height lattice), level = floor
// (ruling 2). The tracker port, per object row of placeSolids (world u):
//   - sight volumes: able visible [V]; their world box (hulls, zMin..zMax). Both box sides under half
//     a cell: the object stays out [V; the half cell is C/2 on goh too; I].
//   - as2: one box volume, not holed, half x > C > half y: an entry every 1 u along its local x at y 0, z = its top, at
//     the nearest cell corner [V]. goh: no thin stamp [V GHVIS-124].
//   - else an upward ray at each cell corner of the box: the highest top of the volumes whose hull holds the corner; a
//     holed volume's top is cut to the lowest bottom of the entity's hole volumes the ray passes [V].
//     goh: a corner no hull holds is tried again on a disc of r 0.7 x C/2 (1.75 u) [V GHVIS-124].
//   - bits: 1 when a hit volume has contact or obstacle, else 2 [V, 222-225].
//   - nothing: one entry at the box centre's nearest corner, the box top, bits 1 [V].
//   Register: cell = max(cell, entry); field 1 stays 1, else the entry's bits [I].
// Author: Imperator_Aug (ARSENAL, ia-d241ad45)
'use strict';

const CELL = Object.freeze({ as2: 7, goh: 5 });
const UNDER = 60, OVER = 240;

function frame(doc, game) {
  const net = doc && doc.net;
  if (!net || !(net.w > 0) || !(net.h > 0) || !(net.cell > 0)) throw Object.assign(new Error('sight: the mapdoc has no net frame'), { code: 'SIGHT_DOC' });
  const C = CELL[game];
  return { C, ox: -net.offX, oy: -net.offY, w: Math.ceil(net.w * net.cell / C), h: Math.ceil(net.h * net.cell / C) };
}

function levels(height) {
  const d = height.data, nd = height.nodata === null || height.nodata === undefined ? null : height.nodata;
  const sc = height.scale === undefined ? 1 : height.scale, off = height.offset || 0;
  let lo = Infinity, hi = -Infinity;
  for (let k = 0; k < d.length; k++) {
    if (nd !== null && d[k] === nd) continue;
    const v = d[k] * sc + off;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (!Number.isFinite(lo)) { lo = 0; hi = 0; }
  const hMin = lo - UNDER, hMax = hi + OVER;
  return { hMin, hMax, step: (hMax - hMin) / 256 };
}
const levelOf = (z, L) => Math.max(0, Math.min(255, Math.floor((z - L.hMin) / L.step)));

// ground at a world point: bilinear, the point clamped into the lattice (the sight frame reaches past the last point)
function groundAt(height, x, y) {
  const K = require('../../lib/mapkit');
  const x1 = height.ox + (height.w - 1) * height.cell, y1 = height.oy + (height.h - 1) * height.cell;
  return K.heightAt(height, Math.max(height.ox, Math.min(x1, x)), Math.max(height.oy, Math.min(y1, y)));
}

// ---------------------------------------------------------------- geometry
function inHull(h, x, y) {   // convex hull, either winding; on the edge counts
  const n = h.length;
  if (n === 0) return false;
  if (n === 1) return h[0][0] === x && h[0][1] === y;
  let sgn = 0;
  for (let k = 0; k < n; k++) {
    const a = h[k], b = h[(k + 1) % n];
    const c = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
    if (Math.abs(c) < 1e-9) continue;
    const s = c > 0 ? 1 : -1;
    if (sgn === 0) sgn = s;
    else if (s !== sgn) return false;
  }
  if (n === 2 || sgn === 0) return distHull(h, x, y) < 1e-6;
  return true;
}
function distSeg(a, b, x, y) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
  let t = L > 0 ? ((x - a[0]) * dx + (y - a[1]) * dy) / L : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(a[0] + t * dx - x, a[1] + t * dy - y);
}
function distHull(h, x, y) {
  if (h.length === 1) return Math.hypot(h[0][0] - x, h[0][1] - y);
  let m = Infinity;
  for (let k = 0; k < h.length; k++) m = Math.min(m, distSeg(h[k], h[(k + 1) % h.length], x, y));
  return m;
}
function bbox(solids) {
  const b = { x0: Infinity, y0: Infinity, z0: Infinity, x1: -Infinity, y1: -Infinity, z1: -Infinity };
  for (const s of solids) {
    for (const p of s.hull || []) { b.x0 = Math.min(b.x0, p[0]); b.x1 = Math.max(b.x1, p[0]); b.y0 = Math.min(b.y0, p[1]); b.y1 = Math.max(b.y1, p[1]); }
    b.z0 = Math.min(b.z0, s.zMin); b.z1 = Math.max(b.z1, s.zMax);
  }
  return b;
}
// GetTrackerCell: the nearest cell corner (trunc, +1 past half a cell) [V]
function trackerCell(F, x, y) {
  const fx = (x - F.ox) / F.C, fy = (y - F.oy) / F.C;
  let i = Math.trunc(fx), j = Math.trunc(fy);
  if ((fx - i) * F.C > F.C / 2) i++;
  if ((fy - j) * F.C > F.C / 2) j++;
  return { i, j };
}

const isSight = s => !!(s && s.able && s.able.visible);
const hardOf = s => !!(s.able.contact || s.able.obstacle);

function trackObject(row, F, game) {
  const all = (row && row.solids) || [];
  const vols = all.filter(s => isSight(s) && Array.isArray(s.hull) && s.hull.length && Number.isFinite(s.zMax));
  if (!vols.length) return { entries: [], thin: false, ignored: false, none: true };
  const B = bbox(vols);
  if (F.C / 2 > B.x1 - B.x0 && F.C / 2 > B.y1 - B.y0) return { entries: [], thin: false, ignored: true };
  const entries = [];
  const inside = (i, j) => i >= 0 && i < F.w && j >= 0 && j < F.h;
  // thin stamp (as2 only)
  if (game === 'as2' && vols.length === 1 && vols[0].box && !vols[0].able.holed) {
    const v = vols[0], hx = v.box.half[0], hy = v.box.half[1];
    if (hx > F.C && F.C > hy) {
      const a = v.box.yaw * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
      const bits = hardOf(v) ? 1 : 2;
      let li = null, lj = null;
      for (let lx = -hx; hx > lx; lx += 1) {
        const x = v.box.center[0] + c * lx, y = v.box.center[1] + s * lx;
        const t = trackerCell(F, x, y);
        if (t.i !== li || t.j !== lj) {
          if (inside(t.i, t.j)) entries.push({ i: t.i, j: t.j, z: v.zMax, bits });
          li = t.i; lj = t.j;
        }
      }
      if (entries.length) return { entries, thin: true, ignored: false };
    }
  }
  // corner rays
  const holes = all.filter(s => s.able && s.able.hole && Array.isArray(s.hull) && s.hull.length);
  const disc = game === 'goh' ? 0.7 * F.C / 2 : 0;
  const i0 = Math.max(0, Math.floor((B.x0 - F.ox) / F.C)), i1 = Math.min(F.w - 1, Math.ceil((B.x1 - F.ox) / F.C));
  const j0 = Math.max(0, Math.floor((B.y0 - F.oy) / F.C)), j1 = Math.min(F.h - 1, Math.ceil((B.y1 - F.oy) / F.C));
  const hitAt = (x, y, r) => {
    let top = -Infinity, bits = 2, seen = false;
    for (const v of vols) {
      const hit = r > 0 ? distHull(v.hull, x, y) <= r || inHull(v.hull, x, y) : inHull(v.hull, x, y);
      if (!hit) continue;
      let z = v.zMax;
      if (v.able.holed) for (const hl of holes) if (inHull(hl.hull, x, y)) z = Math.min(z, hl.zMin);
      top = Math.max(top, z);
      seen = true;
      if (hardOf(v)) bits = 1;
    }
    return seen ? { top, bits } : null;
  };
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const x = F.ox + i * F.C, y = F.oy + j * F.C;
      const h = hitAt(x, y, 0) || (disc > 0 ? hitAt(x, y, disc) : null);
      if (h) entries.push({ i, j, z: h.top, bits: h.bits });
    }
  }
  if (!entries.length) {
    const t = trackerCell(F, (B.x0 + B.x1) / 2, (B.y0 + B.y1) / 2);
    if (inside(t.i, t.j)) entries.push({ i: t.i, j: t.j, z: B.z1, bits: 1 });
  }
  return { entries, thin: false, ignored: false };
}

function mkGrid(name, F, etype, data, L, meta) {
  return { name, w: F.w, h: F.h, cell: F.C, ox: F.ox, oy: F.oy, etype, sample: 'cell', scale: etype === 'u8' && L ? L.step : 1,
    offset: etype === 'u8' && L ? L.hMin : 0, nodata: null, meta, data };
}

function grid(doc, grids, placed, o) {
  o = o || {};
  const game = o.target === 'goh' || o.game === 'goh' ? 'goh' : 'as2';
  const height = grids && grids.height;
  if (!height || !height.data) throw Object.assign(new Error('sight: no height grid'), { code: 'SIGHT_GRID' });
  const F = frame(doc, game);
  const L = levels(height);
  const n = F.w * F.h;
  const g = new Uint8Array(n), gr = new Uint8Array(n), fd = new Uint8Array(n);
  const notes = [];
  let nodata = 0;
  const tick = typeof o.tick === 'function' ? o.tick : null;
  for (let j = 0; j < F.h; j++) {
    for (let i = 0; i < F.w; i++) {
      const z = groundAt(height, F.ox + i * F.C, F.oy + j * F.C);
      let v = 0;
      if (z === null || !Number.isFinite(z)) nodata++;
      else v = levelOf(z, L);
      g[j * F.w + i] = v; gr[j * F.w + i] = v;
    }
    if (tick && (j & 31) === 0) tick(j, F.h * 2);
  }
  if (nodata) notes.push({ code: 'SIGHT_HEIGHT_NODATA', msg: nodata + ' sight cells have no ground height (off ground); level 0 used, sight view leaves them out', count: nodata });
  const counts = { objects: 0, entered: 0, thin: 0, hard: 0, soft: 0, skipped: 0 };
  if (!Array.isArray(placed)) notes.push({ code: 'SIGHT_NO_SOLIDS', msg: 'no object solids (entcat placeSolids); the grid is the ground only' });
  const rows = Array.isArray(placed) ? placed : [];
  for (const nt of (placed && placed.notes) || []) {
    if (nt && nt.uid !== null && nt.uid !== undefined) {
      counts.skipped++;
      notes.push({ code: 'SIGHT_NO_SOLIDS', msg: 'object ' + nt.uid + ' (' + nt.def + ') left out: ' + nt.code, uid: nt.uid, def: nt.def });
    }
  }
  for (let k = 0; k < rows.length; k++) {
    const row = rows[k];
    counts.objects++;
    const t = trackObject(row, F, game);
    if (!t.entries.length) continue;
    counts.entered++;
    if (t.thin) counts.thin++;
    for (const e of t.entries) {
      const c = e.j * F.w + e.i;
      const lv = levelOf(e.z, L);
      if (lv > g[c]) g[c] = lv;
      if (fd[c] !== 1) fd[c] = e.bits;
    }
    if (tick && (k & 63) === 0) tick(rows.length + k, rows.length * 2);
  }
  if (counts.thin) notes.push({ code: 'SIGHT_THIN_STAMP', msg: counts.thin + ' objects stamped along their centre line (thin box)', count: counts.thin });
  for (let c = 0; c < n; c++) { if (fd[c] === 1) counts.hard++; else if (fd[c] === 2) counts.soft++; }
  counts.offGround = nodata;
  const meta = { cellU: F.C, hMinU: L.hMin, hMaxU: L.hMax, stepU: L.step, game, offGround: nodata };
  return {
    grid: mkGrid('sight.grid', F, 'u8', g, L, Object.assign({}, meta)),
    ground: mkGrid('sight.ground', F, 'u8', gr, L, Object.assign({}, meta)),
    field: Object.assign(mkGrid('sight.field', F, 'u8', fd, null, { counts: { hard: counts.hard, soft: counts.soft } }), { scale: 1, offset: 0 }),
    counts, notes, frame: F, levels: L,
  };
}

module.exports = { CELL, frame, levels, levelOf, groundAt, grid, trackObject, trackerCell, inHull, distHull, bbox, isSight };

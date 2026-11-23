// sight fire: sight.fire.top and sight.fire.bottom on the map.net frame, and the fire line (rules.md 3.1, 3.3).
//   fireGrid(doc, grids, placed, o?) -> {top, bottom, height, gtype, W}   o {mode, tick}
//   fireLine(fg, a, b, o?) -> {clear, block:'terrain'|'object'|'water'|null, at:[x, y]|null}   o {rangeU, stepU}
//   wOf(doc, mode, grids?) -> W (u) | null
// top / bottom (i16, u): the highest zMax and lowest zMin of the `able bullet` solids whose hull overlaps the cell
// (positive area; ruling 11 rasters footprints by any overlap) [I]; nodata -32768.
// The fire line samples every stepU (default 2.5 u) from a to b, z linear from a.z to b.z, the end points left out:
// terrain when the full-resolution ground (bilinear on the height lattice) is at or over the line; object when the
// cell's bottom <= z <= top; water when the nearest lattice point is type 4 or 5 and z is under W [V
// for the water rule; sampling I]. The first block met wins. rangeU: a farther b is {clear:false, block:null, at:null}.
// Author: Imperator_Aug (ARSENAL, ia-c56a1fc9)
'use strict';

const NODATA = -32768;
const STEP = 2.5;

function wOf(doc, mode, grids) {
  const lvl = doc && doc.water && Number.isFinite(Number(doc.water.level)) ? Number(doc.water.level) : null;
  if (mode !== undefined && mode !== null && mode !== '') {
    const m = ((doc && doc.modes) || []).find(x => x.id === mode || x.name === mode);
    if (m && m.water !== null && m.water !== undefined && Number.isFinite(Number(m.water))) return Number(m.water);
  }
  if (lvl !== null) return lvl;
  return grids && typeof grids.W === 'number' ? grids.W : null;
}

// convex polygon vs axis box, positive-area overlap (separating axis)
function overlaps(h, x0, y0, x1, y1) {
  let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
  for (const p of h) { a0 = Math.min(a0, p[0]); a1 = Math.max(a1, p[0]); b0 = Math.min(b0, p[1]); b1 = Math.max(b1, p[1]); }
  if (!(a1 > x0 && a0 < x1 && b1 > y0 && b0 < y1)) return false;
  if (h.length < 3) return false;
  const box = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  for (let k = 0; k < h.length; k++) {
    const p = h[k], q = h[(k + 1) % h.length];
    const nx = q[1] - p[1], ny = p[0] - q[0];
    if (nx === 0 && ny === 0) continue;
    let pmin = Infinity, pmax = -Infinity, bmin = Infinity, bmax = -Infinity;
    for (const v of h) { const d = v[0] * nx + v[1] * ny; pmin = Math.min(pmin, d); pmax = Math.max(pmax, d); }
    for (const v of box) { const d = v[0] * nx + v[1] * ny; bmin = Math.min(bmin, d); bmax = Math.max(bmax, d); }
    const eps = 1e-9 * Math.max(1, Math.abs(pmax), Math.abs(bmax));
    if (!(pmax > bmin + eps && bmax > pmin + eps)) return false;
  }
  return true;
}

function fireGrid(doc, grids, placed, o) {
  o = o || {};
  const net = doc && doc.net;
  if (!net || !(net.w > 0) || !(net.h > 0) || !(net.cell > 0)) throw Object.assign(new Error('sight: the mapdoc has no net frame'), { code: 'SIGHT_DOC' });
  if (!grids || !grids.height) throw Object.assign(new Error('sight: no height grid'), { code: 'SIGHT_GRID' });
  const w = net.w, h = net.h, cell = net.cell, ox = -net.offX, oy = -net.offY;
  const top = new Int16Array(w * h).fill(NODATA), bot = new Int16Array(w * h).fill(NODATA);
  const rows = Array.isArray(placed) ? placed : [];
  const tick = typeof o.tick === 'function' ? o.tick : null;
  const clampI = v => Math.max(-32767, Math.min(32767, Math.round(v)));
  for (let k = 0; k < rows.length; k++) {
    for (const s of (rows[k] && rows[k].solids) || []) {
      if (!s || !s.able || !s.able.bullet || !Array.isArray(s.hull) || s.hull.length < 3) continue;
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const p of s.hull) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
      const i0 = Math.max(0, Math.floor((x0 - ox) / cell)), i1 = Math.min(w - 1, Math.floor((x1 - ox) / cell));
      const j0 = Math.max(0, Math.floor((y0 - oy) / cell)), j1 = Math.min(h - 1, Math.floor((y1 - oy) / cell));
      const zt = clampI(s.zMax), zb = clampI(s.zMin);
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const cx = ox + i * cell, cy = oy + j * cell;
          if (!overlaps(s.hull, cx, cy, cx + cell, cy + cell)) continue;
          const c = j * w + i;
          if (top[c] === NODATA || zt > top[c]) top[c] = zt;
          if (bot[c] === NODATA || zb < bot[c]) bot[c] = zb;
        }
      }
    }
    if (tick && (k & 63) === 0) tick(k, rows.length);
  }
  const mk = (name, data) => ({ name, w, h, cell, ox, oy, etype: 'i16', sample: 'cell', scale: 1, offset: 0, nodata: NODATA, meta: { unit: 'u' }, data });
  return { top: mk('sight.fire.top', top), bottom: mk('sight.fire.bottom', bot), height: grids.height, gtype: grids.gtype || null, W: wOf(doc, o.mode, grids) };
}

function fireLine(fg, a, b, o) {
  o = o || {};
  const K = require('../../lib/mapkit');
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const dist = Math.hypot(dx, dy);
  if (typeof o.rangeU === 'number' && dist > o.rangeU) return { clear: false, block: null, at: null, out: true };
  const st = o.stepU > 0 ? o.stepU : STEP;
  const n = Math.max(1, Math.ceil(dist / st));
  const T = fg.top, B = fg.bottom, H = fg.height, G = fg.gtype, W = typeof fg.W === 'number' ? fg.W : null;
  const r2 = v => Math.round(v * 100) / 100;
  for (let k = 1; k < n; k++) {
    const t = k / n, x = a.x + dx * t, y = a.y + dy * t, z = a.z + dz * t;
    const g = H ? K.heightAt(H, x, y) : null;
    if (g !== null && g >= z) return { clear: false, block: 'terrain', at: [r2(x), r2(y)] };
    if (T) {
      const i = Math.floor((x - T.ox) / T.cell), j = Math.floor((y - T.oy) / T.cell);
      if (i >= 0 && j >= 0 && i < T.w && j < T.h) {
        const c = j * T.w + i, tp = T.data[c];
        if (tp !== T.nodata && z <= tp && z >= B.data[c]) return { clear: false, block: 'object', at: [r2(x), r2(y)] };
      }
    }
    if (G && W !== null && z < W) {
      const i = Math.round((x - G.ox) / G.cell), j = Math.round((y - G.oy) / G.cell);
      if (i >= 0 && j >= 0 && i < G.w && j < G.h) {
        const ty = G.data[j * G.w + i];
        if (ty === 4 || ty === 5) return { clear: false, block: 'water', at: [r2(x), r2(y)] };
      }
    }
  }
  return { clear: true, block: null, at: null };
}

module.exports = { fireGrid, fireLine, wOf, overlaps, NODATA, STEP };

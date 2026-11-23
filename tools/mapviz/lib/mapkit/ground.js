// mapkit ground: which lattice points of map.net hold a height of the map's ground mesh (map.ply). The editor writes a
// lattice point's height only when a face of the ground mesh covers it ( BuildHeights:
// face, over the cells of its box), and the lattice is grown without a fill (GrowHeights
//  -> fillNew false) [V]. So a lattice point past
// the mesh holds a value no ground face gave: 0, or what an older, larger grid had there. On vanilla maps these are whole
// edge rows and columns: MoW:AS2 meshes start 0.95 cell inside the lattice on the south and west (multi/1v1_road row 0
// mean 28.8 u against -17.1 u in row 1), GoH meshes stop short on the east and north (multi/1v1_riverbank: the north row
// and the last 8 columns, all 0) [V data, REPORT.json].
// Second rule, the rim [I data]: inside the mesh every lattice height equals the mesh height there within 1.5 u (100% of
// the sampled points on 5 maps), but the outermost covered column or row on the east and north often does not (6v6_dubovka
// east 34% equal, 3v3_river_bank east 18%, GoH 1v1_riverbank east 2%): the editor did not write it from this mesh [I which
// editor step]. So a covered point with a 4-neighbour that is not covered (or off the grid) is kept only when its stored
// height is within RIM_TOL of the mesh height there. grids.js marks every point not kept nodata in the height layer.
//   mask(src, key, net, o) -> {mask: Uint8Array(w*h) 1 = kept | null, under, rim, faces, reason, ms}
//     o = {map (the map file's {map} block, for {Land {Position}}), height (the file heights, row-major), tick(done, total,
//     force) (every 4096 faces, and with force true right after the map.ply parse)}. under = points kept, rim = covered rim points dropped. mask null (reason given) when the map has
//     no map.ply or it cannot be read: then nothing is marked. Without o.height the rim rule is not applied.
//   spans(t, w, h, fn(j, i0, i1)) -> scanline of one triangle in lattice units (t = [[fi, fj] x 3]), points on an edge count
//   cover(mask, w, h, t) -> number of lattice points newly set to 1
// The mesh frame: world x = mesh x, world y = -mesh y (as render/l1 and tools/mapgen) plus the map's {Land {Position x y}}
// as a plain shift [I: every vanilla map of MoW:AS2 and the GoH sample has Position 0 0]. Both face windings count
// (IsInsideXY takes one sign; the ground mesh of every vanilla map holds the heights it covers, so the winding the editor
// keeps is the mesh's own) [I]. A point on a face edge counts (EPS = 1e-4 cell).
// Author: Imperator_Aug (ARSENAL, ia-57404ad7)
'use strict';
const S = require('./sdl');
const { MAP_ROOT } = require('./source');

const EPS = 1e-4;
const RIM_TOL = 2;   // u; file heights are the mesh height cut to an integer (inside the mesh within 1.5 u)

function spans(t, w, h, fn) {
  const y0 = Math.min(t[0][1], t[1][1], t[2][1]), y1 = Math.max(t[0][1], t[1][1], t[2][1]);
  const j0 = Math.max(0, Math.ceil(y0 - EPS)), j1 = Math.min(h - 1, Math.floor(y1 + EPS));
  for (let j = j0; j <= j1; j++) {
    let lo = Infinity, hi = -Infinity;
    for (let e = 0; e < 3; e++) {
      const p = t[e], q = t[(e + 1) % 3];
      const ya = Math.min(p[1], q[1]), yb = Math.max(p[1], q[1]);
      if (j < ya - EPS || j > yb + EPS) continue;
      const dy = q[1] - p[1];
      let xa, xb;
      if (Math.abs(dy) < 1e-12) { xa = Math.min(p[0], q[0]); xb = Math.max(p[0], q[0]); }
      else { const s = Math.min(1, Math.max(0, (j - p[1]) / dy)); xa = xb = p[0] + s * (q[0] - p[0]); }
      if (xa < lo) lo = xa;
      if (xb > hi) hi = xb;
    }
    if (!(hi >= lo)) continue;
    const i0 = Math.max(0, Math.ceil(lo - EPS)), i1 = Math.min(w - 1, Math.floor(hi + EPS));
    if (i1 >= i0) fn(j, i0, i1);
  }
}

function cover(mask, w, h, t) {
  let set = 0;
  spans(t, w, h, (j, i0, i1) => { for (let k = j * w + i0, e = j * w + i1; k <= e; k++) if (!mask[k]) { mask[k] = 1; set++; } });
  return set;
}

function landShift(mapBlock) {
  const land = mapBlock ? S.kid(mapBlock, 'land') : null;
  const pos = land ? S.kid(land, 'position') : null;
  if (!pos) return [0, 0];
  const w = S.words(pos);
  return [S.num(w[1]) || 0, S.num(w[2]) || 0];
}

function mask(src, key, net, o) {
  o = o || {};
  const t0 = Date.now();
  const k = MAP_ROOT + key + '/map.ply';
  const none = reason => ({ mask: null, under: 0, rim: 0, faces: 0, reason, ms: Date.now() - t0 });
  if (!src.has(k)) return none('no map.ply');
  const tk = typeof o.tick === 'function' ? o.tick : null;
  let p;
  try { p = require('../../../lib/model/ply').parse(src.read(k)); } catch (e) { return none('map.ply cannot be read: ' + e.message); }
  if (tk) tk(0, 1, true);   // after the parse, a single call
  const V = p && p.vertices, P = V && V.position, I = p && p.indices;
  if (!p || p.error || !P || !I || !I.length) return none('map.ply cannot be read: ' + (p && p.error ? p.error : 'no vertices or faces'));
  const w = net.width, h = net.height, c = net.cell, n = V.count;
  const [sx, sy] = landShift(o.map);
  const m = new Uint8Array(w * h);
  const ranges = [];
  const seen = new Set();
  for (const r of (p.parts && p.parts.length ? p.parts.map(q => [q.firstFace, q.faceCount]) : [[0, Math.floor(I.length / 3)]])) {
    if (seen.has(r[0] + ':' + r[1])) continue;
    seen.add(r[0] + ':' + r[1]);
    ranges.push(r);
  }
  const all = ranges.reduce((s, r) => s + Math.max(0, r[1]), 0) * (o.height ? 2 : 1);
  let done = 0;
  // each face with an area, in lattice units with its z: fn(t)
  const eachFace = fn => {
    for (const [f0, fc] of ranges) {
      for (let f = Math.max(0, f0); f < f0 + fc && (f + 1) * 3 <= I.length; f++) {
        if (tk && (++done & 4095) === 0) tk(done, all);
        const a = I[f * 3], b = I[f * 3 + 1], d = I[f * 3 + 2];
        if (a >= n || b >= n || d >= n) continue;
        const t = [a, b, d].map(v => [(P[v * 3] + sx + net.offX) / c, (-P[v * 3 + 1] + sy + net.offY) / c, P[v * 3 + 2]]);
        const area = (t[1][0] - t[0][0]) * (t[2][1] - t[0][1]) - (t[2][0] - t[0][0]) * (t[1][1] - t[0][1]);
        if (!(Math.abs(area) > 1e-9)) continue;   // a face standing on edge covers no area
        fn(t, area);
      }
    }
  };
  let faces = 0, covered = 0;
  eachFace(t => { faces++; covered += cover(m, w, h, t); });
  if (!faces) return none('map.ply has no face with an area');
  let rim = 0;
  if (o.height) {
    // the rim: covered points with a 4-neighbour not covered or off the grid -> 2, then checked against the mesh height
    for (let j = 0; j < h; j++) {
      for (let i = 0, q = j * w; i < w; i++, q++) {
        if (m[q] !== 1) continue;
        if (i === 0 || j === 0 || i === w - 1 || j === h - 1 || !m[q - 1] || !m[q + 1] || !m[q - w] || !m[q + w]) m[q] = 2;
      }
    }
    const H = o.height;
    eachFace((t, area) => {
      spans(t, w, h, (j, i0, i1) => {
        for (let i = i0, q = j * w + i0; i <= i1; i++, q++) {
          if (m[q] !== 2) continue;
          // barycentric height of the face at the lattice point
          const a = ((t[1][0] - i) * (t[2][1] - j) - (t[2][0] - i) * (t[1][1] - j)) / area;
          const b = ((t[2][0] - i) * (t[0][1] - j) - (t[0][0] - i) * (t[2][1] - j)) / area;
          const z = a * t[0][2] + b * t[1][2] + (1 - a - b) * t[2][2];
          if (Math.abs(H[q] - z) <= RIM_TOL) m[q] = 3;
          else { m[q] = 0; rim++; }
        }
      });
    });
    for (let q = 0; q < m.length; q++) if (m[q]) m[q] = 1;
  }
  return { mask: m, under: covered - rim, rim, faces, reason: null, ms: Date.now() - t0 };
}

module.exports = { mask, cover, spans, landShift, EPS, RIM_TOL };

// strong synth (MV-STR tests): stand-in rules for the parts strong reads that are not built yet or too slow for a unit
// test (rules.md 6.1 "what synth.js fakes"). sight: terrain-only lines on the height lattice (no object heights) with a
// small range table [I]; cover: wall points every 1 m on both faces of each footprint edge, the VALUE table of rules.md
// 4.1, segment shields and a terrain-line shield; no lip, no concealment. pass and water: the real modules (wave B/C),
// which the fixture known answers of rules.md 10 are written against.
// rules(o?) -> {sight, cover, pass, water}; o.realSight / o.realCover take the real module when it exports what strong
// calls (real.test.js), else the stand-in.
// Author: Imperator_Aug (ARSENAL, ia-9c35bd7c)
'use strict';
const F = require('../frame');

const POSE = { stand: { eyeM: 1.6, topM: 1.75 }, kneel: { eyeM: 1.16, topM: 1.2 }, prone: { eyeM: 0.54, topM: 0.4 } };
const VIEW_M = { inf: 52.5, mg: 52.5, at: 52.5, tank: 50.6 };
const VEHICLE_M = 135;
const POSE_K = { stand: 1, kneel: 0.8, prone: 0.5, vehicle: 1 };

// line test on the ground: the first sample (every 20 u, ends excluded) where the ground rises above the line
function line(ground, a, b) {
  const L = Math.hypot(b.x - a.x, b.y - a.y), n = Math.max(1, Math.floor(L / 20));
  for (let k = 1; k < n; k++) {
    const t = k / n, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t, z = a.z + (b.z - a.z) * t;
    const h = F.hAt(ground, x, y);
    if (h !== null && h > z) return { x, y };
  }
  return null;
}

const sight = {
  synth: true,
  POSE,
  needsPlaced: false,
  profile() { return { synth: true, viewM: VIEW_M, vehicleM: VEHICLE_M }; },
  grid(doc, grids) { return { grid: Object.assign({}, grids.height, { name: 'sight.grid', meta: { stepU: 7, synth: true } }), ground: grids.height, field: null }; },
  fireGrid(doc, grids) { return { top: null, bottom: null }; },
  rangeM(vprof, viewer, target, o) {
    o = o || {};
    const base = target === 'tank' && viewer !== 'tank' ? VEHICLE_M : VIEW_M[viewer] || 52.5;
    return base * (POSE_K[o.pose] || 1) * (o.cover ? 0.75 : 1);
  },
  canSee(sg, a, b, o) {
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    if (o && o.rangeU !== undefined && d > o.rangeU) return false;
    if (o && o.uncoverU !== undefined && d <= o.uncoverU) return true;
    return !line(sg.ground, a, b);
  },
  fireLine(fg, a, b, o) {
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    if (o && o.rangeU !== undefined && d > o.rangeU) return { clear: false, block: 'range', at: null };
    const at = line(fg.height, a, b);
    return at ? { clear: false, block: 'terrain', at: [at.x, at.y] } : { clear: true, block: null, at: null };
  },
  eyeZ(grids, x, y, who) { const g = F.hAt(grids.height, x, y); return g === null ? null : g + POSE[who && POSE[who] ? who : 'stand'].eyeM * F.UPM; },
  visibleHeight() { return null; },
  pSeen() { return null; },
};

const VALUE = { 1: 0.9, 2: 0.9, 3: 0.9, 4: 1.0, 5: 0.8, 6: 0.45, 7: 0.35, 8: 0.5, 9: 0, 10: 0, 11: 0, 12: 0.5 };
function segsCross(p1, p2, p3, p4) {
  const d = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const d1 = d(p3, p4, p1), d2 = d(p3, p4, p2), d3 = d(p1, p2, p3), d4 = d(p1, p2, p4);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}
const cover = {
  synth: true,
  needsPlaced: false,
  VALUE,
  shields(pt, threat) {
    if (!pt || !pt.wall || !threat) return false;
    const t = Array.isArray(threat) ? threat : [threat.x, threat.y];
    return segsCross(pt.wall[0], pt.wall[1], t, [pt.x, pt.y]);
  },
  terrainShields(grids, pt, threat) {
    const g = F.hAt(grids.height, pt.x, pt.y), gt = Number.isFinite(threat.z) ? threat.z : F.hAt(grids.height, threat.x, threat.y);
    if (g === null || gt === null) return false;
    return !!line(grids.height, { x: threat.x, y: threat.y, z: gt + 27 }, { x: pt.x, y: pt.y, z: g + 9 });
  },
  points(doc, grids, catalog, objects) {
    const out = [];
    for (const ob of objects || []) {
      const en = catalog && catalog.entries && catalog.entries[String(ob.def).toLowerCase()];
      const pts = ob.fp && ob.fp.pts;
      if (!en || !pts || pts.length < 3 || en.category === 'tree' || en.category === 'bush' || /tree|bush|road|flag|map_point/.test(ob.def)) continue;
      for (let k = 0; k < pts.length; k++) {
        const a = pts[k], b = pts[(k + 1) % pts.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (!(L > 0)) continue;
        const nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L;
        for (let s = 10; s < L; s += 20) {
          const x = a[0] + (b[0] - a[0]) * s / L, y = a[1] + (b[1] - a[1]) * s / L;
          for (const sg of [1, -1]) out.push({ kind: 'coverPoint', x: r2(x + nx * 12 * sg), y: r2(y + ny * 12 * sg), type: 4, band: 3, uid: ob.uid, wall: [[a[0], a[1]], [b[0], b[1]]], row: 0, look: 'none' });
        }
      }
    }
    return out.sort((p, q) => p.uid - q.uid || p.x - q.x || p.y - q.y);
  },
  lip(grids) {
    const h = grids.height;
    return { lip: { name: 'cover.lip', w: h.w, h: h.h, cell: h.cell, ox: h.ox, oy: h.oy, etype: 'u8', sample: 'cell', scale: 1, offset: 0, nodata: null, meta: { synth: true }, data: new Uint8Array(h.w * h.h) }, points: [] };
  },
};
const r2 = v => Math.round(v * 100) / 100;

function rules(o) {
  o = o || {};
  const real = n => { try { return require('../../rules/' + n); } catch (e) { return null; } };
  const fns = (m, l) => m && l.every(f => typeof m[f] === 'function');
  const rs = o.realSight ? real('sight') : null, rc = o.realCover ? real('cover') : null;
  return {
    sight: fns(rs, ['canSee', 'fireLine', 'rangeM', 'grid', 'fireGrid', 'profile']) ? rs : sight,
    cover: fns(rc, ['shields', 'terrainShields', 'points', 'lip']) && rc.VALUE ? rc : cover,
    pass: real('pass'),
    water: real('water'),
  };
}

module.exports = { rules, sight, cover, POSE };

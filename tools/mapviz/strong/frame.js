// strong frame (MV-STR): the strong grid (cell 40 u = 2 m on the map.net origin), point samplers, the seeded hash, and
// the base frame of a run: flags of the phase, contact line C, enemy ground G_e(d), boxes, ranges, poses (design 6,
// rules.md 6.2, 6.3, 9.4). Same rules on as64, mowas2 and goh; goh branches carry their source tag.
// Author: Imperator_Aug (ARSENAL, ia-bb720658)
'use strict';

const UPM = 20;
const CELL = 40;                 // strong frame cell, u (rules.md 6.3)
const LAT_TH = 160;              // threat lattice 8 m (design 6)
const D_STEPS = [30, 15, 5, 0];  // enemy ground d, s (ruling 13)
const D_MIN_SAMPLES = 16;

function mv() { return require('../mapviz'); }
function mk() { return require('../lib/mapkit'); }
function fail(code, msg, detail) { const M = mv(); return new M.MvError(code, msg, detail); }
const gameOf = t => t === 'goh' ? 'goh' : 'as2';

// ---- the strong frame
function strongFrame(doc) {
  const n = doc && doc.net;
  if (!n || !(n.w > 0) || !(n.h > 0) || !(n.cell > 0)) throw fail('MV_USAGE', 'strong: the map document has no net frame', { code: 'STRONG_FRAME' });
  return { cell: CELL, ox: -n.offX, oy: -n.offY, w: Math.ceil(n.w * n.cell / CELL), h: Math.ceil(n.h * n.cell / CELL) };
}
// layer grid object (README 4.3) on the strong frame; scale 0.004 (0..250 = 0..1) or 1 (raw = value), nodata 255
function layer(fr, name, scale, meta, data) {
  return { name, w: fr.w, h: fr.h, cell: fr.cell, ox: fr.ox, oy: fr.oy, etype: 'u8', sample: 'cell', scale: scale === 1 ? 1 : 0.004,
    offset: 0, nodata: 255, meta: meta || {}, data: data || new Uint8Array(fr.w * fr.h).fill(255) };
}
const centre = (fr, i, j) => ({ x: fr.ox + (i + 0.5) * fr.cell, y: fr.oy + (j + 0.5) * fr.cell });
function cellOf(fr, x, y) {
  const i = Math.floor((x - fr.ox) / fr.cell), j = Math.floor((y - fr.oy) / fr.cell);
  return i < 0 || j < 0 || i >= fr.w || j >= fr.h ? -1 : j * fr.w + i;
}
const u8 = v => v === null || v === undefined || !Number.isFinite(v) ? 255 : Math.max(0, Math.min(250, Math.round(v * 250)));
const u8raw = v => v === null || v === undefined || !Number.isFinite(v) ? 255 : Math.max(0, Math.min(250, Math.round(v)));

// value of a cell grid at a world point (cell sample: floor); null outside, on nodata or not finite
function valAt(g, x, y) {
  if (!g) return null;
  const i = Math.floor((x - g.ox) / g.cell), j = Math.floor((y - g.oy) / g.cell);
  if (g.sample === 'lattice') return hAt(g, x, y);
  if (i < 0 || j < 0 || i >= g.w || j >= g.h) return null;
  const v = g.data[j * g.w + i];
  if (g.nodata !== null && g.nodata !== undefined && v === g.nodata) return null;
  if (!Number.isFinite(v)) return null;
  return v;
}
// travel seconds at a point: null when nodata or negative (unreached)
function tAt(g, x, y) { const v = valAt(g, x, y); return v === null || v < 0 ? null : v; }
// ground height (u) at a world point, bilinear on the lattice height grid (mapkit.heightAt); null off ground
function hAt(g, x, y) { return g ? mk().heightAt(g, x, y) : null; }

// ---- seeded hash in [0, 1): integer hash of the seed and up to three integers (README 9.2: no Math.random)
function hash(seed, a, b, c) {
  let h = (seed | 0) ^ 0x9e3779b9;
  for (const v of [a | 0, b | 0, c | 0]) {
    h = Math.imul(h ^ v, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  }
  return (h >>> 0) / 4294967296;
}

// ---- mode, flags, spawns
function pickMode(doc, mode) {
  const modes = doc.modes || [];
  if (mode) {
    const m = modes.find(x => x.id === mode);
    if (!m) throw fail('MV_NOT_FOUND', 'strong: the map has no mode ' + mode, { code: 'STRONG_NO_MODE', mode });
    return m;
  }
  // default on every game: battle_zones when it has both sides, else the mode with the most flags that are not home
  // flags (names base_flag*: goh ammunition lists only base_flag_a and base_flag_b in doc.modes [V 1v1_balzerweg]),
  // document order on ties
  const both = modes.filter(m => m.spawns.some(s => s.team === 'a') && m.spawns.some(s => s.team === 'b'));
  const field = mm => mm.flags.filter(f => !/^base_flag/i.test(String(f.name || ''))).length;
  let m = both.find(x => x.id === 'battle_zones' && x.flags.length) || null;
  if (!m) for (const x of both) if (x.flags.length && (!m || field(x) > field(m))) m = x;
  m = m || both[0] || modes[0];
  if (!m) throw fail('MV_NOT_FOUND', 'strong: the map has no mode', { code: 'STRONG_NO_MODE' });
  return m;
}
// the phase in use: the given one, else the lowest phase present among spawns, flags and clipsBySide (late R3; the same
// rule as rules/pass resolvePhase, which inputs() calls first when it is built)
function phaseOf(m, phase) {
  if (phase !== null && phase !== undefined) return phase;
  const ps = m.spawns.concat(m.flags, m.clipsBySide || []).map(x => x.phase).filter(p => p !== null && p !== undefined);
  return ps.length ? Math.min.apply(null, ps) : null;
}
const inPhase = (x, ph) => ph === null || x.phase === null || x.phase === undefined || x.phase === ph;
function flagsOf(m, ph) { return m.flags.filter(f => inPhase(f, ph) && !f.slaveOf); }
function spawnsOfDoc(m, side, ph) { return m.spawns.filter(s => s.team === side && inPhase(s, ph)).map(s => ({ name: s.name, x: s.x, y: s.y })); }

// zone membership and weight of a flag (design 6 ow: 1 - d2/r2 on AS2 [V]; GoH flat
// [V GHMAP-03]); weight 0 outside
function zoneWeight(flag, x, y, game) {
  const z = flag.zone;
  if (!z) { const d = Math.hypot(x - flag.x, y - flag.y); return d <= 200 ? (game === 'goh' ? 1 : 1 - (d * d) / (200 * 200)) : 0; }
  if (z.kind === 'circle') {
    const rA = z.rA || 1, rB = z.rB || rA, dx = (x - flag.x) / rA, dy = (y - flag.y) / rB, q = dx * dx + dy * dy;
    if (q > 1) return 0;
    return game === 'goh' ? 1 : 1 - q;
  }
  if (z.kind === 'poly') return inPoly(z.pts, x, y) ? 1 : 0;
  return 0;
}
function zoneBox(flag) {
  const z = flag.zone;
  if (z && z.kind === 'poly') {
    const xs = z.pts.map(p => p[0]), ys = z.pts.map(p => p[1]);
    return [Math.min.apply(null, xs), Math.min.apply(null, ys), Math.max.apply(null, xs), Math.max.apply(null, ys)];
  }
  const rA = z && z.kind === 'circle' ? z.rA : 200, rB = z && z.kind === 'circle' ? (z.rB || z.rA) : 200;
  return [flag.x - rA, flag.y - rB, flag.x + rA, flag.y + rB];
}
function inPoly(pts, x, y) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}
const inBox = (b, x, y) => !b || (x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3]);

module.exports = { UPM, CELL, LAT_TH, D_STEPS, D_MIN_SAMPLES, gameOf, strongFrame, layer, centre, cellOf, u8, u8raw, valAt, tAt, hAt,
  hash, pickMode, phaseOf, flagsOf, spawnsOfDoc, zoneWeight, zoneBox, inPoly, inBox, fail };

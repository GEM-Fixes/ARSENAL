// render waterplane (MV-R2, R2a): the water planes of a map and the water optics that tint the ground under them
// (render.md 4.2).
//   planes(src, doc, catalog, o) -> {planes:[plane], entityPlanes, ocean: null | {zlevel, kind, omask}, gaps:Set, notes, files}
//     o = {mode?, loader?, given? (o.planes of l2)}
//     plane = {kind:'entity'|'ocean', z, tris:Float64Array (x, y per corner, 3 corners a triangle, world u), cut?(x, y)
//              -> true where the plane is not drawn, w: optics numbers (optics())}
//   Entity planes: water_surface entities (entcat category) of the map file and the mode's .mi: the triangles of their
//   meshes (scenecache L.load(entry.mdl), mesh x bone world, then the entity scale, yaw and position: entcat geom
//   transform), at z = W of the mode (modes[i].water, else doc.water.level) [V].
//   A def whose mesh cannot be loaded: RENDER_WATER_PLANE. Optics numbers from the part material's water_details block:
//   pollution (0), pollution_color (white), opaque_depth (100), coastal_softness (5), view_distance (1500)
//   [V; keys I]. Vanilla AS2 water mtls carry no water_details [V data]: the defaults.
//   Ocean (an active {Ocean} of the map file): all targets: z = trunc(zlevel), the engine reads zlevel as int32
//   [V; goh GHMAP-09]. as64 = mowas2: one plane over the world box
//   pollution 0.6 [I design]. goh: cut by map.omask (else map.ocean), deep
//   colour = 0.25 x lerp(ww_ocean_base_color, ww_pollution_color, ww_pollution_factor) / 255, pollution = the factor and
//   pollution colour = ww_pollution_color in the rest of the formula [I ruling]. Both: RENDER_WATER_APPROX (no waves,
//   foam, reflection).
//   map.omask [V data probe, all 155 GoH files]: u32 version 0, u8 flag, f32 cornerX, f32 cornerY, u32 R, u32 C, then
//   R x C cells of 10 bytes {u8 type, u8 depth, f32, f32}; cell index i x C + j covers x = cx + 20 i .. + 20,
//   y = cy + 20 j .. + 20 (depth matches W - ground within 0.3 levels). The flag byte says which type is water
//   (engine OCEAN_MASK_INVERTED, editor Inverse Cut: GHMAP-11, GHED-18) [I]: flag 1 (142 files): type 0 = no ocean (cut),
//   type 1 = water; flag 0 (13 files, 12 of them hold both types): inverted, type 1 = cut, type 0 = water. Data: share of
//   cells with ground below the ocean z is high for flag-1 type 1 and flag-0 type 0, near 0 for the other [V probe].
//   type 2 (shore) is never cut; outside the rectangle: not cut. map.ocean (no vanilla file):
//   f32 cx, f32 cy, u32 R, u32 C, R x C bytes, 0 = cut [I guess].
//   optics(w) -> {apply(rgb (0..1, changed in place), d (u)), ...}: wo_functions.inc CalculateWaterColor
//   [V shader/dx10/water_optics/wo_functions.inc; blend I]: ext = (45, 750, 3000); T = sat(d / (ext + (3000 - ext) p));
//   deep = lerp(0.1, 0.25 pc, p); c = lerp(g, deep, T); c = lerp(c, deep, sat(d / maxDepth)); fog = sat((vd - 1900) / vd);
//   c = lerp(deep, c, fog); c = lerp(c, pc c, p); out = lerp(g, c, sat(d / coastDepth)).
// Author: Imperator_Aug (ARSENAL, ia-78fc60e5)
'use strict';
const crypto = require('crypto');

const sha1 = b => crypto.createHash('sha1').update(b).digest('hex');
const lc = s => String(s == null ? '' : s).toLowerCase();
const unq = v => String(v == null ? '' : v).replace(/^"|"$/g, '');
const sat = x => x < 0 ? 0 : x > 1 ? 1 : x;
const EXT = [45, 750, 3000];
const DEF = { maxDepth: 100, coastDepth: 5, viewDistance: 1500, pollution: 0, pollutionColor: [255, 255, 255] };
const OCEAN_P = 0.6;
const GOH_BASE = 0xff1c2b8e;   // ww_ocean_base_color when the key is absent: the vanilla value [V data, 1v1_barbarossa]
const OMASK_CELL = 20;

function argb(v) {
  let n = null;
  if (typeof v === 'number' && Number.isFinite(v)) n = v >>> 0;
  else if (typeof v === 'string') { const m = /^0x([0-9a-f]{1,8})$/i.exec(v.trim()); if (m) n = parseInt(m[1], 16) >>> 0; else if (/^\d+$/.test(v.trim())) n = Number(v) >>> 0; }
  return n === null ? null : [(n >>> 16) & 255, (n >>> 8) & 255, n & 255];
}
const numOr = (v, d) => { const n = Number(v); return v !== null && v !== undefined && v !== '' && Number.isFinite(n) ? n : d; };

// the optics numbers in full: w = {maxDepth, coastDepth, viewDistance, pollution, pollutionColor:[r,g,b] 0..255, deep?:[r,g,b] 0..1}
function optics(w) {
  w = Object.assign({}, DEF, w || {});
  const p = sat(numOr(w.pollution, 0));
  const pc = (Array.isArray(w.pollutionColor) ? w.pollutionColor : DEF.pollutionColor).map(c => sat(numOr(c, 255) / 255));
  const deep = Array.isArray(w.deep) ? w.deep.map(c => sat(c)) : pc.map(c => 0.1 + (0.25 * c - 0.1) * p);
  const maxD = numOr(w.maxDepth, 100) > 0 ? numOr(w.maxDepth, 100) : 100;
  const coast = numOr(w.coastDepth, 5) > 0 ? numOr(w.coastDepth, 5) : 5;
  const vd = numOr(w.viewDistance, 1500) > 0 ? numOr(w.viewDistance, 1500) : 1500;
  const fog = sat((vd - 1900) / vd);
  const tExt = EXT.map(e => e + (3000 - e) * p);
  function apply(g, d) {
    if (!(d > 0)) return;
    const kd = sat(d / maxD), kc = sat(d / coast);
    for (let c = 0; c < 3; c++) {
      const T = sat(d / tExt[c]);
      let x = g[c] + (deep[c] - g[c]) * T;
      x = x + (deep[c] - x) * kd;
      x = deep[c] + (x - deep[c]) * fog;
      x = x + (pc[c] * x - x) * p;
      g[c] = g[c] + (x - g[c]) * kc;
    }
  }
  return { p, pc, deep, maxDepth: maxD, coastDepth: coast, viewDistance: vd, fog, apply };
}

// water_details of a water mtl text -> optics numbers (keys found) | null
function waterDetails(text) {
  const mats = require('./mats');
  let root = null;
  try { root = mats.tree(text); } catch (e) { root = null; }
  if (!root) return null;
  let wd = null;
  const walk = (n, d) => { if (wd || d > 4) return; if (lc(n.k) === 'water_details') { wd = n; return; } for (const k of n.kids || []) walk(k, d + 1); };
  walk(root, 0);
  if (!wd) return {};
  const out = {};
  const v1 = name => { const k = (wd.kids || []).find(x => lc(x.k) === name); return k && k.v && k.v.length ? k.v.map(unq) : null; };
  let v;
  if ((v = v1('pollution'))) out.pollution = numOr(v[0], 0);
  if ((v = v1('pollution_color'))) {
    const c = v.length >= 3 ? v.slice(0, 3).map(Number) : argb(v[0]);
    if (c && c.every(Number.isFinite)) out.pollutionColor = c.map(x => (x <= 1 && v.length >= 3 && v.slice(0, 3).some(s => /\./.test(s)) ? x * 255 : x));
  }
  if ((v = v1('opaque_depth'))) out.maxDepth = numOr(v[0], 100);
  if ((v = v1('coastal_softness'))) out.coastDepth = numOr(v[0], 5);
  if ((v = v1('view_distance'))) out.viewDistance = numOr(v[0], 1500);
  return out;
}

const mul43 = (w, x, y, z) => [x * w[0] + y * w[3] + z * w[6] + w[9], x * w[1] + y * w[4] + z * w[7] + w[10]];

function entityPlanes(src, doc, catalog, o, out) {
  const E = require('../entcat'), G = require('../entcat/geom');
  const d = E.docForMode(doc, o.mode || null);
  const entries = (catalog && catalog.entries) || {};
  const ents = (d.entities || []).filter(e => e && Number.isFinite(e.x) && Number.isFinite(e.y) && entries[lc(e.def)] && entries[lc(e.def)].category === 'water_surface');
  if (!ents.length) return;
  const mode = o.mode ? (doc.modes || []).find(m => m && m.id === o.mode) : null;
  const W = mode && Number.isFinite(mode.water) ? mode.water : doc.water && Number.isFinite(doc.water.level) ? doc.water.level : null;
  if (W === null) { out.notes.push('water planes: no water level W for this mode; ' + ents.length + ' water entities not drawn'); out.gaps.add('RENDER_WATER_PLANE'); return; }
  const L = o.loader || E.loaderFor(src);
  const byDef = new Map();
  const local = def => {
    if (byDef.has(def)) return byDef.get(def);
    const en = entries[def];
    let r = null;
    try {
      if (!en.mdl) throw new Error('no model');
      const res = L.load(en.mdl);
      if (!res || res.error || !res.scene) throw new Error((res && res.error) || 'not loaded');
      const tris = [];
      let w = null;
      const dir = en.mdl.slice(0, en.mdl.lastIndexOf('/') + 1);
      for (const m of res.scene.meshes || []) {
        const p = m.ply;
        if (!p || !p.vertices || !p.vertices.position) continue;
        const P = p.vertices.position, nv = p.vertices.count;
        const ply = require('../../lib/model/ply');
        for (let i = 0; i < (p.parts || []).length; i++) {
          const t = ply.partTriangles(p, i);
          for (let q = 0; q + 2 < t.length; q += 3) {
            if (t[q] >= nv || t[q + 1] >= nv || t[q + 2] >= nv) continue;
            for (let c = 0; c < 3; c++) { const k = t[q + c] * 3; tris.push(mul43(m.world, P[k], P[k + 1], P[k + 2])); }
          }
          const mat = p.parts[i].material;
          if (w === null && mat) {
            const mf = (dir + (m.file || '')).replace(/[^/]*$/, '') + lc(String(mat)).replace(/\\/g, '/');
            const key = /\.mtl$/.test(mf) ? mf : mf + '.mtl';
            const b = src.has(key) ? src.read(key) : null;
            if (b) { out.files[key] = sha1(b); w = waterDetails(b.toString('latin1')) || {}; }
          }
        }
      }
      if (!tris.length) throw new Error('no triangles');
      r = { tris, w: w || {} };
    } catch (e) {
      out.gaps.add('RENDER_WATER_PLANE');
      out.notes.push('water ' + def + ': mesh cannot be loaded (' + String(e && e.message || e) + '); not drawn');
      r = null;
    }
    byDef.set(def, r);
    return r;
  };
  for (const e of ents) {
    const lp = local(lc(e.def));
    if (!lp) continue;
    const world = G.transform(lp.tris, { x: e.x, y: e.y, yaw: e.yaw, scale: e.scale }, true);
    const tris = new Float64Array(world.length * 2);
    for (let i = 0; i < world.length; i++) { tris[i * 2] = world[i][0]; tris[i * 2 + 1] = world[i][1]; }
    out.planes.push({ kind: 'entity', z: W, tris, w: optics(lp.w), uid: e.uid, def: lc(e.def) });
    out.entityPlanes++;
  }
}

function readOmask(buf) {
  if (!buf || buf.length < 21) return null;
  const R = buf.readUInt32LE(13), C = buf.readUInt32LE(17);
  if (21 + R * C * 10 > buf.length) return null;
  return { cx: buf.readFloatLE(5), cy: buf.readFloatLE(9), R, C, type: (i, j) => buf[21 + (i * C + j) * 10] };
}
function readOceanMask(buf) {
  if (!buf || buf.length < 16) return null;
  const R = buf.readUInt32LE(8), C = buf.readUInt32LE(12);
  if (16 + R * C > buf.length) return null;
  return { cx: buf.readFloatLE(0), cy: buf.readFloatLE(4), R, C, type: (i, j) => buf[16 + i * C + j] };
}

function boxTris(b) {
  return Float64Array.from([b[0], b[1], b[2], b[1], b[2], b[3], b[0], b[1], b[2], b[3], b[0], b[3]]);
}

function oceanPlane(src, doc, target, out) {
  const oc = doc.water && doc.water.ocean;
  if (!oc || !oc.active || !Number.isFinite(oc.zlevel)) return;
  const box = doc.boxes && doc.boxes.world;
  if (!box) return;
  const goh = target === 'goh';
  out.gaps.add('RENDER_WATER_APPROX');
  // zlevel is read as int32 on every target [V, GHMAP-09]
  const z = Math.trunc(oc.zlevel);
  if (!goh) {
    out.planes.push({ kind: 'ocean', z, tris: boxTris(box), w: optics({ pollution: OCEAN_P }) });
    out.ocean = { zlevel: z, kind: oc.kind || null, omask: false };
    out.notes.push('ocean at z ' + z + ' over the world box: flat tint, no waves, foam or reflection');
    return;
  }
  // the Ocean block's colours (mapdoc reads zlevel, kind, active only)
  let base = argb(GOH_BASE), pcol = [255, 255, 255], fac = 0;
  try {
    const md = require('../lib/mapkit/mapdoc'), S = require('../lib/mapkit/sdl');
    const m = md.readMap(src, doc.key);
    const ob = m && m.map ? S.kid(m.map, 'ocean') : null;
    if (ob) {
      const b = argb(S.val(ob, 'ww_ocean_base_color')), pc = argb(S.val(ob, 'ww_pollution_color')), f = S.num(S.val(ob, 'ww_pollution_factor'));
      if (b) base = b;
      if (pc) pcol = pc;
      if (f !== null) fac = sat(f);
    }
  } catch (e) { out.notes.push('ocean colours cannot be read: ' + String(e && e.message || e) + '; vanilla defaults used'); }
  // ruling [I]: the base colour takes the place of the AS2 grey 0.1 at the pollution colour's scale (0.25), the pollution
  // pair works as AS2's water_details pollution (deep = lerp(0.25 base, 0.25 pc, f), then T and the pc x c step use f)
  const deep = base.map((c, i) => 0.25 * (c + (pcol[i] - c) * fac) / 255);
  let mask = null, from = null, cutType = 0;
  for (const [name, rd] of [['map.omask', readOmask], ['map.ocean', readOceanMask]]) {
    const k = 'resource/map/' + doc.key + '/' + name;
    if (!src.has(k)) continue;
    const b = src.read(k);
    if (!b) continue;
    out.files[k] = sha1(b);
    from = name;
    mask = rd(b);
    if (!mask) out.notes.push(name + ': size does not match its header; no ocean cut');
    // map.omask flag 0: inverted, type 1 is cut (e.g. 4v4_swamp, 1v1_farmland); flag 1: type 0 is cut [I, GHMAP-11]
    else if (name === 'map.omask' && b[4] === 0) { cutType = 1; from = 'map.omask (flag 0: inverted, type 1 cut)'; }
    break;
  }
  const plane = { kind: 'ocean', z, tris: boxTris(box), w: optics({ deep, pollution: fac, pollutionColor: pcol }) };
  if (mask) {
    const M = mask, CT = cutType;
    plane.cut = (x, y) => {
      const i = Math.floor((x - M.cx) / OMASK_CELL), j = Math.floor((y - M.cy) / OMASK_CELL);
      if (i < 0 || j < 0 || i >= M.R || j >= M.C) return false;
      return M.type(i, j) === CT;
    };
  }
  out.planes.push(plane);
  out.ocean = { zlevel: z, kind: oc.kind || null, omask: !!mask };
  out.notes.push('ocean at z ' + z + (mask ? ', cut by ' + from : ', no omask: not cut') + ': flat tint, no waves, foam or reflection');
}

function planes(src, doc, catalog, o) {
  o = o || {};
  const out = { planes: [], entityPlanes: 0, ocean: null, gaps: new Set(), notes: [], files: {} };
  if (Array.isArray(o.given)) {
    for (const g of o.given) {
      if (!g || !Array.isArray(g.pts) || g.pts.length < 3 || !Number.isFinite(g.z)) continue;
      const t = [];
      for (let i = 1; i + 1 < g.pts.length; i++) t.push(g.pts[0][0], g.pts[0][1], g.pts[i][0], g.pts[i][1], g.pts[i + 1][0], g.pts[i + 1][1]);
      out.planes.push({ kind: g.kind === 'ocean' ? 'ocean' : 'entity', z: g.z, tris: Float64Array.from(t), w: optics(g.water || {}) });
      if (g.kind !== 'ocean') out.entityPlanes++;
    }
    out.notes.push(out.planes.length + ' water planes given (the map\'s own planes are not read)');
    return out;
  }
  entityPlanes(src, doc, catalog, o, out);
  oceanPlane(src, doc, o.target, out);
  return out;
}

// per sample of a band: index of the plane drawn there (the highest plane z covering the sample), -1 none
function cover(pls, B) {
  const { sj0, sj1, SW, x0, y0, sx, sy } = B;
  const n = (sj1 - sj0) * SW;
  const idx = new Int16Array(n).fill(-1);
  const top = new Float32Array(n).fill(-Infinity);
  for (let p = 0; p < pls.length; p++) {
    const P = pls[p], T = P.tris;
    for (let t = 0; t + 5 < T.length; t += 6) {
      const ax = T[t], ay = T[t + 1], bx = T[t + 2], by = T[t + 3], cx = T[t + 4], cy = T[t + 5];
      const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
      if (!(Math.abs(den) > 1e-12)) continue;
      const i0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - x0) / sx - 0.5)), i1 = Math.min(SW - 1, Math.ceil((Math.max(ax, bx, cx) - x0) / sx - 0.5));
      const j0 = Math.max(sj0, Math.floor((Math.min(ay, by, cy) - y0) / sy - 0.5)), j1 = Math.min(sj1 - 1, Math.ceil((Math.max(ay, by, cy) - y0) / sy - 0.5));
      for (let sj = j0; sj <= j1; sj++) {
        const py = y0 + (sj + 0.5) * sy;
        for (let si = i0; si <= i1; si++) {
          const k = (sj - sj0) * SW + si;
          if (top[k] >= P.z) continue;
          const px = x0 + (si + 0.5) * sx;
          const w0 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / den;
          const w1 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / den;
          if (w0 < -1e-9 || w1 < -1e-9 || 1 - w0 - w1 < -1e-9) continue;
          if (P.cut && P.cut(px, py)) continue;
          top[k] = P.z; idx[k] = p;
        }
      }
    }
  }
  return idx;
}

module.exports = { planes, cover, optics, waterDetails, readOmask, readOceanMask, argb, DEF, OCEAN_P, EXT };

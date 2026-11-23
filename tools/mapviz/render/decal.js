// render decal (MV-R2, R2a): the road and ground decals of a map as textured quads over the l2 samples (render.md 4.1).
//   list(doc, catalog, mode) -> {rows:[{uid, def, pts:[[x,y] x 4], order, seq, color:[r,g,b], opacity, sprite}], noSize:[..]}
//     rows: entities (the map file's and the mode's .mi, entcat docForMode) whose catalog entry has footprint.kind 'decal',
//     sorted by decal.order (null = 0), then doc entity order (seq) [I]. noSize: decal defs entcat could not size
//     (entry note ENTCAT_DECAL_SIZE): RENDER_DECAL_SIZE, not drawn.
//   textures(src, rows, foot) -> {byMtl: Map(mtl key -> tex | null), notes, files:{key: sha1}}
//     tex = {levels:[{w, h, rgba}], frame:[fw, fh] (level 0 texels), key}: the mtl's diffuse texture (straight alpha) and
//     its level chain (the file's mips while its bytes hold them, then 2 x 2 box filters, as l1 'file'); frame = the
//     diffuse {Axis w h} sprite frame, else the whole texture. A '$/' name is resource/texture/common/ [V data: AS2
//     $/wall/wall_destroy_decal = resource/texture/common/wall/wall_destroy_decal.dds; GoH the same, I].
//   draw(rows, texs, band) : over-composites every decal on the samples of one band (premultiplied, in place).
//     band = {sj0, sj1, SW, x0, y0, sx, sy (sample size), foot (u per sample), z, n (ground), D (Float32Array x 4:
//     premultiplied rgb + alpha of the decal layer)}; returns the samples touched per row (for offGround).
//   uv: u along pts[0] -> pts[1] (texture column, 0 at pts[0]), v along pts[0] -> pts[3] (texture row 0 first) [ruling];
//   sampled bilinear in premultiplied space, clamped to the sprite frame (no atlas bleed: CLIP_BY_UV, GHVIS-80), level by
//   texel density (l1 lodFor, trilinear). Colour: texel x 2 [V] x entity colour / 255 x f0(N) x GAIN
//   clamped to 1; alpha = texel alpha x opacity. Same on as64, mowas2 and goh (GoH x 2 [I]).
// Author: Imperator_Aug (ARSENAL, ia-225fc45d)
'use strict';
const crypto = require('crypto');

const sha1 = b => crypto.createHash('sha1').update(b).digest('hex');
const lc = s => String(s == null ? '' : s).toLowerCase();
const unq = v => String(v == null ? '' : v).replace(/^"|"$/g, '');

function L1() { return require('./l1'); }

// world vector toward the sun (render.md 2.2: normalize(-dir0, +dir1, -dir2)) and f0 of a world normal
function sunWorld() {
  const d = L1().LIGHT.dir, L = Math.hypot(d[0], d[1], d[2]);
  return [-d[0] / L, d[1] / L, -d[2] / L];
}
function f0Of(sun) {
  const Lt = L1().LIGHT, s = Lt.sun[0], a = Lt.amb[0];
  return (nx, ny, nz) => s * Math.max(nx * sun[0] + ny * sun[1] + nz * sun[2], 0) + a;
}

function list(doc, catalog, mode) {
  const E = require('../entcat');
  const d = E.docForMode(doc, mode || null);
  const entries = (catalog && catalog.entries) || {};
  const rows = [], noSize = [];
  let seq = 0;
  for (const e of d.entities || []) {
    seq++;
    if (!e || e.x === null || e.x === undefined || e.y === null || e.y === undefined) continue;
    const en = entries[lc(e.def)];
    if (!en) continue;
    const fp = en.footprint;
    if (fp && fp.kind === 'decal') {
      const f = E.footprintOf(en, { x: e.x, y: e.y, yaw: e.yaw, scale: e.scale });
      if (!f || f.kind !== 'decal' || !f.pts || f.pts.length !== 4) { noSize.push({ uid: e.uid, def: lc(e.def) }); continue; }
      const dc = e.decal || {};
      const col = Array.isArray(dc.color) ? dc.color.slice(0, 3) : [255, 255, 255];
      const op = Number.isFinite(dc.opacity) ? Math.max(0, Math.min(1, dc.opacity)) : 1;
      rows.push({ uid: e.uid, def: lc(e.def), pts: f.pts, order: Number.isFinite(dc.order) ? dc.order : 0, seq, color: col, opacity: op,
        sprite: fp.sprite || null });
    } else if ((en.notes || []).some(n => n && n.code === 'ENTCAT_DECAL_SIZE')) noSize.push({ uid: e.uid, def: lc(e.def) });
  }
  rows.sort((a, b) => a.order - b.order || a.seq - b.seq);
  return { rows, noSize };
}

// the diffuse name and the {Axis} frame of a decal mtl -> {name, axis:[w,h]|null} | null
function mtlDiffuse(text) {
  const mats = require('./mats');
  let root = null;
  try { root = mats.tree(text); } catch (e) { root = null; }
  if (!root) return null;
  const find = (n, name, depth) => {
    for (const k of n.kids || []) { if (lc(k.k) === name) return k; }
    if (depth > 0) for (const k of n.kids || []) { const r = find(k, name, depth - 1); if (r) return r; }
    return null;
  };
  const dif = lc(root.k) === 'diffuse' ? root : find(root, 'diffuse', 1);
  if (!dif || !dif.v || !dif.v.length) return null;
  const ax = find(dif, 'axis', 0);
  const an = ax && ax.v ? ax.v.map(Number) : [];
  return { name: unq(dif.v[0]), axis: an.length >= 2 && an[0] > 0 && an[1] > 0 ? [an[0], an[1]] : null };
}

// a texture name of a mtl in folder base -> mats.texture result ('$/' = resource/texture/common/)
function findTexture(src, name, base) {
  const mats = require('./mats');
  let n = String(name || '').replace(/\\/g, '/');
  if (/^\$\//.test(n)) return mats.texture(src, 'resource/texture/common/' + n.slice(2));
  return mats.texture(src, n, base) || mats.texture(src, 'resource/texture/common/' + n);
}

function chainOf(buf) {
  const dds = require('../../lib/model/dds');
  const info = dds.parse(buf);
  if (!info || info.error) return { error: (info && info.error) || 'not a dds' };
  const file = L1().fileLevels(info, buf.length);
  const n = L1().chainLevels(info.width, info.height);
  const levels = [];
  for (let m = 0; m < n; m++) {
    let r = null;
    if (m < Math.max(1, file)) {
      const d = dds.decode(buf, { mip: m });
      if (d && !d.error && d.rgba && d.mip === m) r = { w: d.width, h: d.height, rgba: d.rgba };
      else if (m === 0) return { error: (d && d.error) || 'unreadable' };
    }
    if (!r) {
      const p = levels[m - 1];
      const h = dds.downscale(p.rgba, p.w, p.h, Math.max(1, Math.max(p.w, p.h) >> 1));
      r = { w: h.width, h: h.height, rgba: h.rgba };
    }
    levels.push(r);
    if (r.w === 1 && r.h === 1) break;
  }
  return { levels, width: info.width, height: info.height };
}

function textures(src, rows) {
  const byMtl = new Map(), notes = [], files = {};
  for (const r of rows) {
    const mk = r.sprite && r.sprite.mtl;
    if (!mk || byMtl.has(mk)) { if (!mk && !byMtl.has('')) { byMtl.set('', null); notes.push('decal ' + r.def + ': no sprite mtl'); } continue; }
    let tex = null;
    const buf = src.has(mk) ? src.read(mk) : null;
    if (!buf) notes.push('decal mtl ' + mk + ': not found');
    else {
      files[mk] = sha1(buf);
      const md = mtlDiffuse(buf.toString('latin1'));
      if (!md) notes.push('decal mtl ' + mk + ': no diffuse texture');
      else {
        const t = findTexture(src, md.name, mk.slice(0, mk.lastIndexOf('/') + 1));
        if (!t) notes.push('decal texture ' + md.name + ' (' + mk + '): not found');
        else if (t.error || !t.buf) notes.push('decal texture ' + md.name + ': ' + (t.error || 'unreadable'));
        else {
          const c = chainOf(t.buf);
          if (c.error) notes.push('decal texture ' + t.key + ': ' + c.error);
          else {
            files[t.key] = sha1(t.buf);
            const fw = md.axis ? Math.min(md.axis[0], c.width) : c.width, fh = md.axis ? Math.min(md.axis[1], c.height) : c.height;
            tex = { levels: c.levels, frame: [fw, fh], key: t.key, size: [c.width, c.height] };
          }
        }
      }
    }
    byMtl.set(mk, tex);
  }
  return { byMtl, notes, files };
}

// premultiplied bilinear sample of level lv at texel coords (tx, ty) (level-0 units), clamped to the frame -> out[0..3]
function sampleLevel(tex, lv, tx, ty, out, wgt) {
  const L = tex.levels[lv], s = 1 / (1 << lv);
  const fw = Math.max(1, tex.frame[0] * s), fh = Math.max(1, tex.frame[1] * s);
  let x = tx * s - 0.5, y = ty * s - 0.5;
  const xmax = Math.min(L.w, Math.ceil(fw)) - 1, ymax = Math.min(L.h, Math.ceil(fh)) - 1;
  if (x < 0) x = 0; if (y < 0) y = 0; if (x > xmax) x = xmax; if (y > ymax) y = ymax;
  const i0 = Math.floor(x), j0 = Math.floor(y), i1 = Math.min(i0 + 1, xmax), j1 = Math.min(j0 + 1, ymax);
  const fx = x - i0, fy = y - j0, d = L.rgba, w = L.w;
  const q = [[i0, j0, (1 - fx) * (1 - fy)], [i1, j0, fx * (1 - fy)], [i0, j1, (1 - fx) * fy], [i1, j1, fx * fy]];
  for (const [i, j, ww] of q) {
    if (!ww) continue;
    const k = (j * w + i) * 4, a = d[k + 3] / 255, f = ww * wgt;
    out[0] += d[k] / 255 * a * f; out[1] += d[k + 1] / 255 * a * f; out[2] += d[k + 2] / 255 * a * f; out[3] += a * f;
  }
}

function draw(rows, texs, B) {
  const { sj0, sj1, SW, x0, y0, sx, sy, foot, z, n, D } = B;
  const sun = sunWorld(), f0 = f0Of(sun), GAIN = L1().GAIN;
  const touched = new Array(rows.length).fill(0);
  const acc = new Float64Array(4);
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r], tex = row.sprite && texs.get(row.sprite.mtl);
    if (!tex) continue;
    const [p0, p1, , p3] = row.pts;
    const e1x = p1[0] - p0[0], e1y = p1[1] - p0[1], e3x = p3[0] - p0[0], e3y = p3[1] - p0[1];
    const l1 = e1x * e1x + e1y * e1y, l3 = e3x * e3x + e3y * e3y;
    if (!(l1 > 0 && l3 > 0)) continue;
    const det = e1x * e3y - e1y * e3x;
    if (!(Math.abs(det) > 1e-12)) continue;
    // texel density -> level (l1 lodFor: texels per sample)
    const tpu = Math.max(tex.frame[0] / Math.sqrt(l1), tex.frame[1] / Math.sqrt(l3));
    const lod = L1().lodFor(1, tex.levels.length, 1, tpu, foot);
    const xs = row.pts.map(p => p[0]), ys = row.pts.map(p => p[1]);
    const i0 = Math.max(0, Math.floor((Math.min(...xs) - x0) / sx - 0.5)), i1 = Math.min(SW - 1, Math.ceil((Math.max(...xs) - x0) / sx - 0.5));
    const j0 = Math.max(sj0, Math.floor((Math.min(...ys) - y0) / sy - 0.5)), j1 = Math.min(sj1 - 1, Math.ceil((Math.max(...ys) - y0) / sy - 0.5));
    const kr = 2 * row.color[0] / 255 * GAIN, kg = 2 * row.color[1] / 255 * GAIN, kb = 2 * row.color[2] / 255 * GAIN;
    for (let sj = j0; sj <= j1; sj++) {
      const py = y0 + (sj + 0.5) * sy - p0[1];
      for (let si = i0; si <= i1; si++) {
        const px = x0 + (si + 0.5) * sx - p0[0];
        // (px, py) = u e1 + v e3
        const u = (px * e3y - py * e3x) / det, v = (e1x * py - e1y * px) / det;
        if (u < 0 || u >= 1 || v < 0 || v >= 1) continue;
        const k = (sj - sj0) * SW + si;
        if (!(z[k] === z[k])) continue;
        const tx = u * tex.frame[0], ty = v * tex.frame[1];
        acc[0] = acc[1] = acc[2] = acc[3] = 0;
        sampleLevel(tex, lod.a, tx, ty, acc, 1 - lod.f);
        if (lod.f > 0) sampleLevel(tex, lod.b, tx, ty, acc, lod.f);
        const a = acc[3] * row.opacity;
        if (!(a > 0)) continue;
        touched[r]++;
        const f = f0(n[k * 3], n[k * 3 + 1], n[k * 3 + 2]);
        // straight colour of the decal, clamped to 1 (the render target clamps), then "over" in premultiplied form
        const ia = 1 / acc[3];
        const cr = Math.min(1, acc[0] * ia * kr * f), cg = Math.min(1, acc[1] * ia * kg * f), cb = Math.min(1, acc[2] * ia * kb * f);
        const q = k * 4, o = 1 - a;
        D[q] = cr * a + D[q] * o; D[q + 1] = cg * a + D[q + 1] * o; D[q + 2] = cb * a + D[q + 2] * o; D[q + 3] = a + D[q + 3] * o;
      }
    }
  }
  return touched;
}

module.exports = { list, textures, draw, mtlDiffuse, findTexture, chainOf, sunWorld, f0Of };

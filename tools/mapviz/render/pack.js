// render pack (MV-R2, builder R2b): the scene pack of a map, the object meshes and their instances that L3 draws and L4
// casts shadows with (freeze render.md 2.1, 3.3, 4.3; design 7 L3). Same code for as64, mowas2 and goh; the GoH branches
// are the TexMod common lookup, the `<mesh>#<variant>.ply` swap, the lightmap slot and the LOD fall-through (each tagged).
//   pack(src, doc, o) -> {pack, json, bin: Buffer}
//     o = {mode?, catalog? (entcat catalog: {entries, failed}), loader? (scenecache L), grids? ({height}), links?,
//          progress?, cancelFlag?, made?}
//     json = pack.json (render.md 3.3), bin = pack.bin bytes, pack = json + the typed arrays readPack gives
//   write(dir, r)  -> [file names]   pack.json (LF) and pack.bin, each written atomically
//   readPack(x)    -> pack   x = a folder holding pack.json + pack.bin, or {json, bin}. pack = the json fields plus
//     pos, nrm (Float32Array 3 per vertex), uv0, uv1 (2 per vertex), idx (Uint32Array), inst {count, geom, uid, flags
//     (Uint32Array), m (Float32Array 12 per instance)}, from ('in' for a folder, 'given' for {json, bin}).
//     A size or sha1 mismatch, a bad magic or a section past the end: MvError MV_FAULT, detail.code RENDER_PACK_BAD.
//   STATES, BIN_VERSION
// Objects come from the doc of the mode (map records + that mode's .mi records, entcat docForMode rule) placed by the walk
// of entcat place(): placed records, structure parts on their root's bones (doc link/seats, else links.js), unlinked
// seats left out. z = record z, else height at the root (mapkit heightAt) [I].
// Def states: decal (entcat footprint decal or category road_decal/ground_decal; l2 draws it), water (water_surface; l2),
// service (category service, or a def with no visible mesh: code RENDER_NO_MESH; also a def whose missing model is a
// sound extension [I]), unit (placed_unit), skinned (a skinned mesh that is not a tree or bush; bind pose; a skinned tree
// or bush stays drawn, bind pose [I]), failed (catalog failure or model load failure: RENDER_MODEL_MISSING /
// RENDER_MODEL_BAD), else drawn. geoms[].variant = texmod.texModKey of the record's TexMod (head word, per-texture
// entries, {default}).
// Author: Imperator_Aug (ARSENAL, ia-9d67c27f)
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');

const PACK_V = 1, BIN_VERSION = 1;
const STATES = ['drawn', 'decal', 'water', 'service', 'unit', 'skinned', 'failed'];
const MAX_NOTES = 200;
const FLORA = new Set(['tree', 'bush']);
const SOUND_EXT = /extension "(?:[^"]*\/)?(?:sound|sfx)[^"\/]*\.mdl"/i;

function mv() { return require('../mapviz'); }
const lc = s => String(s == null ? '' : s).toLowerCase().replace(/\\/g, '/');
const sha1 = b => crypto.createHash('sha1').update(b).digest('hex');
const fin = Number.isFinite;
const numOr = (v, d) => (fin(Number(v)) && v !== null && v !== '' ? Number(v) : d);
const f6 = x => Math.round(x * 1e6) / 1e6;

// ---------------------------------------------------------------- placing (entcat walk, with the bone matrix kept)
function docSeats(doc) {
  const out = {};
  for (const e of (doc && doc.entities) || []) {
    if (!e || !e.seats || typeof e.seats !== 'object' || !fin(Number(e.uid))) continue;
    const s = out[e.uid] || (out[e.uid] = {});
    for (const [pl, st] of Object.entries(e.seats)) s[lc(pl)] = { unlinked: !!(st && st.unlinked), entity: st && st.def ? lc(st.def) : null };
  }
  return out;
}
function linkTables(doc, links) {
  const parts = new Map(), seats = new Map();
  const L = links || {};
  for (const [u, l] of Object.entries(L.parts || {})) if (l && fin(Number(u))) parts.set(Number(u), { root: Number(l.root), place: lc(l.place) });
  for (const e of (doc && doc.entities) || []) if (e && e.link && e.link.root != null && !parts.has(e.uid)) parts.set(e.uid, { root: Number(e.link.root), place: lc(e.link.place) });
  for (const src of [docSeats(doc), L.seats || {}]) {
    for (const [u, s] of Object.entries(src)) {
      const m = seats.get(Number(u)) || new Map();
      for (const [pl, st] of Object.entries(s || {})) m.set(lc(pl), st || {});
      seats.set(Number(u), m);
    }
  }
  return { parts, seats };
}
// emit(uid, def, root record, place|null (a structure place name), part:bool)
function walk(doc, links, entries, emit) {
  const notes = [];
  const ents = (doc && doc.entities) || [];
  const T = linkTables(doc, links);
  const absent = v => v === null || v === undefined;
  const placed = new Map(), byRoot = new Map();
  for (const e of ents) {
    if (absent(e.x) && absent(e.y)) continue;
    if (!fin(e.x) || !fin(e.y)) { notes.push({ code: 'RENDER_BAD_POSITION', text: 'uid ' + e.uid + ' ' + lc(e.def) + ': position is not a number; left out' }); continue; }
    if (!placed.has(e.uid)) placed.set(e.uid, e);
  }
  for (const e of ents) {
    if (!(absent(e.x) && absent(e.y))) continue;
    const l = T.parts.get(e.uid);
    if (!l || !placed.has(l.root)) { notes.push({ code: 'RENDER_PART_UNPLACED', text: 'uid ' + e.uid + ' ' + lc(e.def) + ': no position and no placed root; left out' }); continue; }
    const list = byRoot.get(l.root) || [];
    list.push({ e, place: l.place });
    byRoot.set(l.root, list);
  }
  for (const e of ents) {
    if (placed.get(e.uid) !== e) continue;
    emit(e.uid, e.def, e, null, false, e);
    const recs = byRoot.get(e.uid) || [];
    const seats = T.seats.get(e.uid) || new Map();
    const en = entries[lc(e.def)];
    const parts = en && en.structure ? en.structure.parts : [];
    const used = new Set();
    for (const p of parts) {
      const r = recs.find(x => !used.has(x) && x.place === lc(p.place));
      const st = seats.get(lc(p.place));
      if (r) { used.add(r); emit(r.e.uid, r.e.def, e, lc(p.place), true, r.e); continue; }
      if (st && st.unlinked) continue;
      emit(e.uid, st && st.entity ? st.entity : p.def, e, lc(p.place), true, null);
    }
    for (const r of recs) if (!used.has(r)) emit(r.e.uid, r.e.def, e, null, true, r.e);
  }
  return notes;
}

// 3 x 4 row-major affine helpers (world = m x [x y z 1])
function mul34(a, b) {
  const o = new Array(12);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 4; j++) {
      o[i * 4 + j] = a[i * 4] * b[j] + a[i * 4 + 1] * b[4 + j] + a[i * 4 + 2] * b[8 + j] + (j === 3 ? a[i * 4 + 3] : 0);
    }
  }
  return o;
}
// T(x, y, z) Rz(yaw) S(s)
function placeMatrix(x, y, z, yawDeg, s) {
  const a = yawDeg * Math.PI / 180, c = Math.cos(a), n = Math.sin(a);
  return [c * s, -n * s, 0, x, n * s, c * s, 0, y, 0, 0, s, z];
}
// a scene bone / mesh world (row vector: rows X, Y, Z, T; p' = p.x X + p.y Y + p.z Z + T) as a 3 x 4 column matrix
function boneMatrix(w) {
  return [w[0], w[3], w[6], w[9], w[1], w[4], w[7], w[10], w[2], w[5], w[8], w[11]];
}

// ---------------------------------------------------------------- mesh reading
function plyLib() { return require('../../lib/model/ply'); }

// the meshes a def shows at LOD 0, with the GoH swap and LOD fall-through. -> {meshes:[{ply, world, key, skinned}], missing, swapped}
function meshesOf(r, target, variant) {
  const P = plyLib();
  const out = [];
  let missing = 0, swapped = false;
  const bones = r.scene.bones || [];
  for (const m of r.scene.meshes || []) {
    const b = bones[m.boneIndex];
    if (b && b.visible === false) continue;
    let ply = m.ply && !m.ply.error ? m.ply : null, file = m.file;
    // GoH: <mesh>#<variant>.ply replaces the mesh when that file exists [V GHFMT-10; T]
    if (target === 'goh' && variant && file && /\.ply$/i.test(file)) {
      const alt = file.replace(/\.ply$/i, '#' + variant + '.ply');
      const buf = r.files.get(alt);
      if (buf) { const p = P.parse(buf); if (!p.error) { ply = p; file = alt; swapped = true; } }
    }
    // GoH: a LOD view that fails to load takes no LOD slot: the next one is LOD 0 [V GHFMT-38]
    if (!ply && target === 'goh' && m.kind === 'LODView' && b) {
      const v = (b.views || []).find(x => x.kind === 'LODView' && x.lods && x.lods.length);
      for (const f of v ? v.lods.slice(1) : []) {
        if (!f || !/\.ply$/i.test(f)) continue;
        const buf = r.files.get(f);
        if (!buf) continue;
        const p = P.parse(buf);
        if (!p.error) { ply = p; file = f; break; }
      }
    }
    if (!ply) { missing++; continue; }
    out.push({ ply, world: m.world || [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], file, key: r.files.key(file), skinned: !!(ply.skin && ply.skin.length) || !!m.skinned });
  }
  return { meshes: out, missing, swapped };
}

const compsOf = (attrs, key) => { const e = (attrs.layout || []).find(x => x.key === key); return e ? e.comps || 0 : 0; };
function numAt(arr, i) {
  if (arr instanceof Uint8Array) return arr[i] / 127.5 - 1;   // ubyte4 packed normal [I]
  return arr[i];
}
function uvAt(arr, i) {
  if (arr instanceof Int16Array) return arr[i] / 2048;   // short2 texture coordinate [I: scale not traced]
  return arr[i];
}

// the vertex data of one def (one variant): pos/nrm/uv in the model frame (mesh world applied), parts with their material
// specs. -> {pos, nrm, uv0, uv1 (JS arrays), idx, parts:[{spec, iOff, iCount}], box, skinned, hasUv1}
function geometry(meshes) {
  const pos = [], nrm = [], uv0 = [], uv1 = [], idx = [], parts = [];
  const box = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  let skinned = false, hasUv1 = false;
  const P = plyLib();
  for (const m of meshes) {
    if (m.skinned) skinned = true;
    const p = m.ply, w = m.world;
    const dir = String(m.key || '').slice(0, String(m.key || '').lastIndexOf('/') + 1);
    for (let pi = 0; pi < p.parts.length; pi++) {
      const part = p.parts[pi];
      if (part.flags & 0x20) continue;   // hidden part
      let tri, at;
      try { tri = P.partTriangles(p, pi); at = P.partAttributes(p, pi); } catch (e) { continue; }
      if (!tri || !tri.length || !at || !at.position) continue;
      const cp = compsOf(at, 'position') || 3, cn = compsOf(at, 'normal'), c0 = compsOf(at, 'uv0'), c1 = compsOf(at, 'uv1');
      const N = cn >= 3 ? at.normal : null, U0 = c0 >= 2 ? at.uv0 : null, U1 = c1 >= 2 ? at.uv1 : null;
      if (U1) hasUv1 = true;
      const remap = new Map();
      const iOff = idx.length;
      const faceN = N ? null : new Map();
      for (let t = 0; t + 2 < tri.length; t += 3) {
        const ks = [tri[t], tri[t + 1], tri[t + 2]];
        if (ks.some(k => k * cp + 2 >= at.position.length)) continue;
        for (const k of ks) {
          if (remap.has(k)) continue;
          const x = at.position[k * cp], y = at.position[k * cp + 1], z = at.position[k * cp + 2];
          const X = x * w[0] + y * w[3] + z * w[6] + w[9], Y = x * w[1] + y * w[4] + z * w[7] + w[10], Z = x * w[2] + y * w[5] + z * w[8] + w[11];
          pos.push(X, Y, Z);
          if (X < box[0]) box[0] = X; if (Y < box[1]) box[1] = Y; if (Z < box[2]) box[2] = Z;
          if (X > box[3]) box[3] = X; if (Y > box[4]) box[4] = Y; if (Z > box[5]) box[5] = Z;
          if (N) {
            const a = numAt(N, k * cn), b = numAt(N, k * cn + 1), c = numAt(N, k * cn + 2);
            let nx = a * w[0] + b * w[3] + c * w[6], ny = a * w[1] + b * w[4] + c * w[7], nz = a * w[2] + b * w[5] + c * w[8];
            const l = Math.hypot(nx, ny, nz) || 1;
            nrm.push(nx / l, ny / l, nz / l);
          } else nrm.push(0, 0, 0);
          uv0.push(U0 ? uvAt(U0, k * c0) : 0, U0 ? uvAt(U0, k * c0 + 1) : 0);
          uv1.push(U1 ? uvAt(U1, k * c1) : 0, U1 ? uvAt(U1, k * c1 + 1) : 0);
          remap.set(k, pos.length / 3 - 1);
        }
        const a = remap.get(ks[0]), b = remap.get(ks[1]), c = remap.get(ks[2]);
        idx.push(a, b, c);
        if (faceN) {   // no normals in the mesh: area-weighted face normals [I]
          const ax = pos[a * 3], ay = pos[a * 3 + 1], az = pos[a * 3 + 2];
          const ux = pos[b * 3] - ax, uy = pos[b * 3 + 1] - ay, uz = pos[b * 3 + 2] - az;
          const vx = pos[c * 3] - ax, vy = pos[c * 3 + 1] - ay, vz = pos[c * 3 + 2] - az;
          const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
          for (const q of [a, b, c]) { const s = faceN.get(q) || [0, 0, 0]; s[0] += n[0]; s[1] += n[1]; s[2] += n[2]; faceN.set(q, s); }
        }
      }
      if (faceN) {
        for (const [q, s] of faceN) {
          const l = Math.hypot(s[0], s[1], s[2]) || 1;
          let nx = s[0] / l, ny = s[1] / l, nz = s[2] / l;
          if (nz < 0) { nx = -nx; ny = -ny; nz = -nz; }   // seen from above
          nrm[q * 3] = nx; nrm[q * 3 + 1] = ny; nrm[q * 3 + 2] = nz;
        }
      }
      const iCount = idx.length - iOff;
      if (!iCount) continue;
      let spec;
      if (part.material) spec = { mtl: part.material, from: 'mtl' };
      else if (part.inlineMaterial && part.inlineMaterial.layers && part.inlineMaterial.layers.length) {
        const L0 = part.inlineMaterial.layers[0], t0 = (L0.textures || [])[0];
        spec = { tex: t0 ? t0.texture : null, from: 'inline' };
      } else if (part.textures && part.textures.length) spec = { tex: part.textures[0], from: 'textures' };
      else spec = { from: 'none' };
      spec.dir = dir;
      spec.meshKey = m.key;
      parts.push({ spec, iOff, iCount });
    }
  }
  return { pos, nrm, uv0, uv1, idx, parts, box: box[0] <= box[3] ? box : [0, 0, 0, 0, 0, 0], skinned, hasUv1 };
}

// ---------------------------------------------------------------- materials and textures
function imageSize(io, key) {
  const buf = io.read(key);
  if (!buf) return null;
  const ext = key.slice(key.lastIndexOf('.') + 1);
  try {
    if (ext === 'dds') { const p = require('../../lib/model/dds').parse(buf); return p.error ? null : [p.width, p.height]; }
    if (ext === 'tga') { const p = require('../../lib/model/tga').parse(buf); return p.error || !p.width ? null : [p.width, p.height]; }
    if (ext === 'jpg') return null;   // l3 has no jpg reader (node only): listed as not readable, drawn flat, like l3 [I]
    const f = require('../../lib/model/picture').facts(ext, buf);
    return f && !f.error && f.width ? [f.width, f.height] : null;
  } catch (e) { return null; }
}

function makeTables(io, target, files) {
  const TM = require('./texmod');
  const vix = TM.variants(io), cix = target === 'goh' ? TM.commonIndex(vix) : null;
  const textures = [], texIds = new Map(), materials = [], matIds = new Map(), mtls = new Map();
  const gaps = new Set(), notes = [];
  const note = (code, text) => { if (notes.length < MAX_NOTES) notes.push({ code, text }); };
  function texId(name, mtlKey, tm, what) {
    const r = TM.resolve(io, name, { mtlKey, tm: tm || null, target, vix, cix });
    if (!r) return { id: null, stem: null };
    const k = r.key + '|' + (r.variant || '') + '|' + r.from;
    if (texIds.has(k)) return { id: texIds.get(k), stem: r.stem, r };
    const size = imageSize(io, r.key);
    if (!size) { gaps.add('RENDER_OBJ_TEXTURE'); note('RENDER_OBJ_TEXTURE', what + ' ' + r.key + ' cannot be read; drawn flat'); texIds.set(k, null); return { id: null, stem: r.stem, r }; }
    const id = textures.length;
    textures.push({ id, key: r.key, variant: r.variant || null, from: r.from, size });
    texIds.set(k, id);
    files[r.key] = files[r.key] || sha1(io.read(r.key));
    return { id, stem: r.stem, r };
  }
  function mtlOf(key) {
    if (!mtls.has(key)) mtls.set(key, require('./texmod').readMtl(io, key, target));
    return mtls.get(key);
  }
  // material id of a part spec under a TexMod (texmod.texModOf form | null); hasVariant: a texture took a variant
  function material(spec, tm, def) {
    let took = false;
    let mt = null, texName = null, mtlKey = null;
    if (spec.from === 'mtl') {
      const base = spec.dir || '';
      const name = lc(spec.mtl);
      const norm = k => path.posix.normalize(k).replace(/^\/+/, '');
      const cand = name.startsWith('resource/') ? [name] : [norm(base + name), norm('resource/' + name.replace(/^\//, ''))];
      mtlKey = cand.find(k => io.has(k)) || null;
      if (!mtlKey && !/\.mtl$/.test(name)) mtlKey = cand.map(k => k + '.mtl').find(k => io.has(k)) || null;
      if (mtlKey) { mt = mtlOf(mtlKey); texName = mt.diffuse; }
    } else if (spec.tex) texName = spec.tex;
    const blend = mt ? mt.blend : 'none', alpharef = mt ? mt.alpharef : 128, a2c = mt ? mt.a2c : false;
    const color = mt ? mt.color.slice() : [255, 255, 255, 255], noLight = mt ? mt.noLight : false;
    let tex = null, lm = null, stems = [];
    const where = def + (mtlKey ? ' (' + mtlKey + ')' : '');
    if (spec.from === 'none') {
      // GoH: a ply part with no material draws flat grey [V GHFMT-25]; the same rule on as64 / mowas2 [I]
    } else if (spec.from === 'mtl' && !mtlKey) {
      gaps.add('RENDER_OBJ_TEXTURE'); note('RENDER_OBJ_TEXTURE', where + ': material ' + spec.mtl + ' not found; drawn flat');
    } else if (texName) {
      const t = texId(texName, mtlKey || (spec.meshKey || ''), tm, where);
      tex = t.id; if (t.stem) stems.push(t.stem);
      if (t.r && t.r.from !== 'default') took = true;
      if (tex === null && !t.r) { gaps.add('RENDER_OBJ_TEXTURE'); note('RENDER_OBJ_TEXTURE', where + ': texture ' + texName + ' not found; drawn flat'); }
    } else { gaps.add('RENDER_OBJ_TEXTURE'); note('RENDER_OBJ_TEXTURE', where + ': material has no diffuse texture; drawn flat'); }
    if (mt && mt.lightmap && target === 'goh') {
      const t = texId(mt.lightmap, mtlKey, null, where + ' lightmap');
      lm = t.id;
      if (lm === null) { gaps.add('RENDER_LIGHTMAP_MISSING'); note('RENDER_LIGHTMAP_MISSING', where + ': lightmap ' + mt.lightmap + ' cannot be read; drawn without it'); }
    }
    const rec = { tex, lm, blend, alpharef, a2c, color, scale: 2, noLight };
    const k = JSON.stringify(rec);
    if (!matIds.has(k)) { matIds.set(k, materials.length); materials.push(Object.assign({ id: materials.length }, rec)); }
    if (mtlKey) files[mtlKey] = files[mtlKey] || sha1(io.read(mtlKey));
    return { id: matIds.get(k), stems, hasVariant: took };
  }
  return { textures, materials, material, gaps, notes, note, vix, cix };
}

// ---------------------------------------------------------------- TexMod blocks of the map records
// uid -> {v, d, e:[[texture, variant]]} for the records whose {TexMod} holds per-texture entries or {default} (the doc
// keeps only the head word). Read only when a file holds such a block. Map file first, then the mode's .mi.
const NESTED_TEXMOD = /\{\s*texmod\b[^{}]*\{/i;
function texModTable(src, doc, mode) {
  const out = new Map();
  const S = require('../lib/mapkit/sdl');
  const keys = ['resource/map/' + doc.key + '/map'].concat(mode ? ['resource/map/' + doc.key + '/' + mode + '.mi'] : []);
  for (const key of keys) {
    let buf = null;
    try { buf = src.has(key) ? src.read(key) : null; } catch (e) { buf = null; }
    if (!buf || !NESTED_TEXMOD.test(buf.toString('latin1'))) continue;
    let root;
    try { root = S.parse(src, key, buf).root; } catch (e) { continue; }
    const visit = (b, depth) => {
      for (const c of S.blocks(b)) {
        if (S.head(c) === 'entity') {
          const w = S.words(c), uid = Number(w[2]), tb = S.kid(c, 'texmod');
          if (tb && Number.isFinite(uid)) {
            const tw = S.words(tb), subs = S.blocks(tb);
            if (subs.length) {
              let d = null;
              const e = [];
              for (const s of subs) {
                const sw = S.words(s);
                if (lc(sw[0]) === 'default') d = sw[1] == null ? null : String(sw[1]);
                else if (sw[0] != null) e.push([String(sw[0]), sw[1] == null ? '' : String(sw[1])]);
              }
              out.set(uid, { v: tw[1] == null ? null : String(tw[1]), d, e });
            }
          }
        }
        if (depth < 6) visit(c, depth + 1);
      }
    };
    visit(root, 0);
  }
  return out;
}

// ---------------------------------------------------------------- pack
function stateOf(en) {
  if (!en) return 'failed';
  const c = en.category;
  if ((en.footprint && en.footprint.kind === 'decal') || c === 'road_decal' || c === 'ground_decal') return 'decal';
  if (c === 'water_surface') return 'water';
  if (c === 'service') return 'service';
  if (c === 'placed_unit') return 'unit';
  return 'drawn';
}
function failCode(code) {
  return code === 'ENTCAT_DEF_MISSING' || code === 'ENTCAT_MDL_MISSING' ? 'RENDER_MODEL_MISSING' : 'RENDER_MODEL_BAD';
}

function pack(src, doc, o) {
  o = o || {};
  const M = mv();
  if (!src || typeof src.read !== 'function') throw new M.MvError('MV_USAGE', 'render pack needs a mapkit source', { code: 'RENDER_SRC' });
  if (!doc || !doc.key) throw new M.MvError('MV_USAGE', 'render pack needs the mapdoc of the map', { code: 'RENDER_DOC' });
  const prog = o.progress || null;
  const t0 = Date.now();
  const target = require('./l1').targetOf(src);
  const ec = require('../entcat');
  const L = o.loader || ec.loaderFor(src);
  const TM = require('./texmod');
  const io = TM.ioOf(L);
  const mode = o.mode || null;
  const mdoc = Object.assign({}, doc, { entities: ((doc.entities) || []).filter(e => e && (e.src === 'map' || e.src === undefined || (mode && e.src === 'mi' && e.mode === mode))) });
  let links = o.links;
  if (links === undefined) { try { links = ec.linksFor(src, doc.key, mdoc, { mode }); } catch (e) { links = null; } }
  if (prog) prog.stage('read', 1);   // stage words: only read, defs, build, draw, write (render.md 2.3)
  const cat = o.catalog && o.catalog.entries ? o.catalog : ec.forDoc(src, mdoc, { loader: L, links: links || undefined, progress: prog || undefined });
  const entries = cat.entries || {};
  const failedCat = new Map(((cat.failed) || []).map(f => [lc(f.def), f.code]));
  const failedMsg = new Map(((cat.failed) || []).map(f => [lc(f.def), String(f.msg || '')]));
  // ground heights
  let hg = o.grids && o.grids.height ? o.grids.height : null;
  const notes = [];
  if (!hg) { try { hg = require('../lib/mapkit').grids(src, doc.key, { mode: mode || undefined }).height; } catch (e) { hg = null; } }
  const heightAt = require('../lib/mapkit').heightAt;
  let noGround = 0;
  const baseZ = new Map();
  const zOf = root => {
    if (baseZ.has(root)) return baseZ.get(root);
    let z = fin(root.z) ? root.z : null;
    if (z === null && hg) { const h = heightAt(hg, root.x, root.y); z = h === null || !fin(h) ? null : h; }
    if (z === null) { z = 0; noGround++; }
    baseZ.set(root, z);
    return z;
  };
  // place every object
  const placedList = [];
  const wn = walk(mdoc, links, entries, (uid, def, root, place, part, rec) => { placedList.push({ uid, def: lc(def), root, place, part, rec }); });
  for (const n of wn) notes.push(n);
  // root bones of structures (L.load of the root model)
  const boneOf = (root, place) => {
    const en = entries[lc(root.def)];
    if (!en || !en.mdl || !place) return null;
    let r;
    try { r = L.load(en.mdl); } catch (e) { return null; }
    const b = r && r.scene ? (r.scene.bones || []).find(x => lc(x.name) === place) : null;
    return b && b.world ? boneMatrix(b.world) : null;
  };
  // TexMod of each placed object: its own record's (a structure part with its own record reads that record); a part
  // with no record takes its root's [I: T one seasonal house]. The doc holds the head word; the per-texture entries and
  // {default} are read from the map and mode files (texModTable).
  const tmTable = texModTable(src, doc, mode);
  const tmOf = p => {
    const rec = p.rec || p.root;
    if (!rec) return null;
    const x = tmTable.get(Number(rec.uid));
    return x ? TM.texModOf(x.v != null ? x.v : rec.texmod, x.d, x.e) : TM.texModOf(rec.texmod, null, null);
  };
  // defs and their variants
  const byDef = new Map();
  for (const p of placedList) {
    const d = byDef.get(p.def) || { def: p.def, list: [] };
    d.list.push(p);
    byDef.set(p.def, d);
  }
  const defNames = [...byDef.keys()].sort();
  const files = {};
  try { const k = 'resource/map/' + doc.key + '/map'; const b = src.has(k) ? src.read(k) : null; if (b) files.map = sha1(b); } catch (e) { /* none */ }
  if (mode) { try { const k = 'resource/map/' + doc.key + '/' + mode + '.mi'; const b = src.has(k) ? src.read(k) : null; if (b) files[mode + '.mi'] = sha1(b); } catch (e) { /* none */ } }
  const T = makeTables(io, target, files);
  const gaps = T.gaps;
  const POS = [], NRM = [], UV0 = [], UV1 = [], IDX = [];
  const geoms = [], defs = [];
  const geomOf = new Map();   // def|variant -> geom id
  if (prog) prog.stage('defs', defNames.length);
  for (const dn of defNames) {
    if (prog) prog.check();
    const D = byDef.get(dn), en = entries[dn];
    let state = stateOf(en), code = null;
    if (!en) code = failCode(failedCat.get(dn) || 'ENTCAT_DEF_MISSING');
    // a def whose only missing model is a sound emitter's extension (GoH fire_loop: Extension "sound.mdl") shows nothing
    // in game: service, RENDER_NO_MESH, no gap [I]
    if (!en && failedCat.get(dn) === 'ENTCAT_MDL_MISSING' && SOUND_EXT.test(failedMsg.get(dn) || '')) { state = 'service'; code = 'RENDER_NO_MESH'; }
    const row = { def: dn, category: en ? en.category : 'other', state, code, geoms: [], instances: D.list.length };
    if (state === 'drawn' || state === 'unit') {
      if (!en.mdl) { row.state = 'service'; row.code = 'RENDER_NO_MESH'; }
      else {
        let r = null;
        try { r = L.load(en.mdl); } catch (e) { r = null; }
        if (!r || r.error || !r.scene) { row.state = 'failed'; row.code = r && /not in the mod folder/.test(String(r.error)) ? 'RENDER_MODEL_MISSING' : 'RENDER_MODEL_BAD'; }
        else {
          const tms = new Map([[null, null]]);
          for (const p of D.list) { const tm = tmOf(p), k = TM.texModKey(tm); if (!tms.has(k)) tms.set(k, tm); }
          const variants = [...tms.keys()].sort((a, b) => (a === null ? -1 : b === null ? 1 : a < b ? -1 : a > b ? 1 : 0));
          let baseGeo = null;
          for (const v of variants) {
            const tm = tms.get(v);
            const ms = meshesOf(r, target, tm ? tm.v || tm.d : null);
            if (v === null) {
              if (!ms.meshes.length) {
                if (ms.missing) { row.state = 'failed'; row.code = 'RENDER_MODEL_MISSING'; } else { row.state = 'service'; row.code = 'RENDER_NO_MESH'; }
                break;
              }
              // a skinned mesh: drawn only with --units (men, vehicles), except trees and bushes, whose skin is a wind
              // rig: those stay 'drawn' in the bind pose [I: bind pose = the rest pose of the rig; T one GoH shot]
              if (ms.meshes.some(m => m.skinned) && row.state === 'drawn' && !FLORA.has(row.category)) row.state = 'skinned';
            }
            let geo, vOff, iOff, own = false;
            if (v === null || ms.swapped) {
              geo = geometry(ms.meshes);
              if (!geo.idx.length) { if (v === null) { row.state = 'service'; row.code = 'RENDER_NO_MESH'; break; } continue; }
              vOff = POS.length / 3; iOff = IDX.length; own = true;
              for (let q = 0; q < geo.pos.length; q++) POS.push(geo.pos[q]);
              for (let q = 0; q < geo.nrm.length; q++) NRM.push(geo.nrm[q]);
              for (let q = 0; q < geo.uv0.length; q++) UV0.push(geo.uv0[q]);
              for (let q = 0; q < geo.uv1.length; q++) UV1.push(geo.uv1[q]);
              for (let q = 0; q < geo.idx.length; q++) IDX.push(geo.idx[q]);
              if (v === null) baseGeo = { geo, vOff, iOff };
            } else { geo = baseGeo.geo; vOff = baseGeo.vOff; iOff = baseGeo.iOff; }
            const parts = geo.parts.map(p => Object.assign({ pp: p }, T.material(p.spec, tm, dn)));
            if (v !== null && !own) {
              // TexMod: no texture of the def has the variant -> the default geom, RENDER_TEXMOD_MISSING
              if (!parts.some(p => p.hasVariant)) {
                gaps.add('RENDER_TEXMOD_MISSING');
                T.note('RENDER_TEXMOD_MISSING', dn + ': TexMod ' + v + ' not found for any of its textures; default textures used');
                geomOf.set(dn + '|' + v, geomOf.get(dn + '|'));
                continue;
              }
            }
            const id = geoms.length;
            geoms.push({ id, def: dn, variant: v, vOff, vCount: geo.pos.length / 3, iOff, iCount: geo.idx.length,
              parts: parts.map(p => ({ mat: p.id, iOff: p.pp.iOff, iCount: p.pp.iCount })), box: geo.box.map(f6), skinned: geo.skinned });
            row.geoms.push(id);
            geomOf.set(dn + '|' + (v || ''), id);
          }
        }
      }
    } else if (state === 'failed') { /* code set */ }
    if (row.state === 'failed') gaps.add(row.code);
    defs.push(row);
    if (prog) prog.step(1);
  }
  if (noGround) notes.push({ code: 'RENDER_NO_GROUND', text: noGround + ' objects have no z and no ground height under them; drawn at z 0' });
  // instances
  const stOf = new Map(defs.map(d => [d.def, d.state]));
  const inst = [];
  placedList.forEach((p, order) => {
    const st = stOf.get(p.def);
    if (!(st === 'drawn' || st === 'unit' || st === 'skinned')) return;
    const v = TM.texModKey(tmOf(p)) || '';
    let g = geomOf.get(p.def + '|' + v);
    if (g === undefined) g = geomOf.get(p.def + '|');
    if (g === undefined) return;
    const root = p.root;
    const z = zOf(root);
    let m = placeMatrix(numOr(root.x, 0), numOr(root.y, 0), z, numOr(root.yaw, 0), numOr(root.scale, 1));
    let onBone = false;
    if (p.part && p.place) { const B = boneOf(root, p.place); if (B) { m = mul34(m, B); onBone = true; } }
    if (p.part && !onBone && p.rec && fin(p.rec.z)) m[11] = p.rec.z;
    // bit 1 marks what is drawn only with --units (l3, l4): a skinned tree or bush drawn by default keeps geoms[].skinned
    // true and no bit 1
    const flags = (st === 'unit' ? 1 : 0) | (st === 'skinned' || (st === 'unit' && geoms[g].skinned) ? 2 : 0) | (onBone ? 4 : 0);
    inst.push({ geom: g, uid: Number(p.uid) >>> 0, flags, m, order });
  });
  inst.sort((a, b) => (a.uid - b.uid) || (a.order - b.order));
  // counts
  const skipped = {};
  let drawn = 0, failed = 0;
  for (const d of defs) {
    if (d.state === 'drawn') drawn += d.instances;
    else skipped[d.state] = (skipped[d.state] || 0) + d.instances;
    if (d.state === 'failed') failed++;
  }
  const nv = POS.length / 3, ni = IDX.length;
  // bin
  const al8 = n => (n + 7) & ~7;
  const sec = {};
  let off = 8;
  const plan = [['pos', nv * 12, nv], ['nrm', nv * 12, nv], ['uv0', nv * 8, nv], ['uv1', nv * 8, nv], ['idx', ni * 4, ni], ['inst', inst.length * 64, inst.length]];
  for (const [k, bytes, count] of plan) { off = al8(off); sec[k] = { off, count }; off += bytes; }
  const total = al8(off);
  const bin = Buffer.alloc(total);
  bin.write('MVPK', 0, 'latin1'); bin.writeUInt32LE(BIN_VERSION, 4);
  const putF = (arr, at) => { for (let q = 0; q < arr.length; q++) bin.writeFloatLE(arr[q], at + q * 4); };
  putF(POS, sec.pos.off); putF(NRM, sec.nrm.off); putF(UV0, sec.uv0.off); putF(UV1, sec.uv1.off);
  for (let q = 0; q < ni; q++) bin.writeUInt32LE(IDX[q] >>> 0, sec.idx.off + q * 4);
  inst.forEach((s, q) => {
    const a = sec.inst.off + q * 64;
    bin.writeUInt32LE(s.geom, a); bin.writeUInt32LE(s.uid, a + 4); bin.writeUInt32LE(s.flags, a + 8); bin.writeUInt32LE(0, a + 12);
    for (let k = 0; k < 12; k++) bin.writeFloatLE(s.m[k], a + 16 + k * 4);
  });
  const allGaps = [...gaps].sort();
  const json = {
    v: PACK_V, kind: 'scenepack', target, stackHash: (doc.stack && doc.stack.hash) || src.stackHash || null,
    mapHashes: files, map: doc.key, mode, box: (doc.boxes && doc.boxes.world ? doc.boxes.world.slice() : null), units: 'included',
    textures: T.textures, materials: T.materials, geoms, defs,
    counts: { defs: defs.length, geoms: geoms.length, verts: nv, tris: ni / 3, instances: inst.length, drawn, skipped, failed },
    gaps: allGaps, notes: notes.concat(T.notes).slice(0, MAX_NOTES),
    bin: { file: 'pack.bin', bytes: bin.length, sha1: sha1(bin), sections: sec },
    made: o.made || new Date().toISOString(),
  };
  const pk = fromBin(json, bin, 'built');
  Object.defineProperty(pk, 'ms', { value: Date.now() - t0, enumerable: false });
  return { pack: pk, json, bin };
}

function write(dir, r) {
  const M = mv();
  M.writeAtomic(path.join(dir, 'pack.bin'), r.bin);
  M.writeAtomic(path.join(dir, 'pack.json'), JSON.stringify(r.json, null, 1) + '\n');
  return ['pack.json', 'pack.bin'];
}

function bad(msg) { const M = mv(); return new M.MvError('MV_FAULT', 'scene pack: ' + msg, { code: 'RENDER_PACK_BAD' }); }

function fromBin(json, bin, from) {
  if (!json || json.kind !== 'scenepack' || json.v !== PACK_V || !json.bin || !json.bin.sections) throw bad('pack.json is not a v' + PACK_V + ' scene pack');
  if (!Buffer.isBuffer(bin)) bin = Buffer.from(bin);
  if (bin.length !== json.bin.bytes) throw bad('pack.bin holds ' + bin.length + ' bytes, pack.json says ' + json.bin.bytes);
  if (sha1(bin) !== json.bin.sha1) throw bad('pack.bin sha1 differs from pack.json');
  if (bin.length < 8 || bin.toString('latin1', 0, 4) !== 'MVPK' || bin.readUInt32LE(4) !== BIN_VERSION) throw bad('pack.bin has no MVPK v' + BIN_VERSION + ' header');
  const ab = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.length);
  const S = json.bin.sections;
  const view = (k, per, T) => {
    const s = S[k];
    if (!s || !(s.off >= 8) || s.off % 4 || s.off + s.count * per * T.BYTES_PER_ELEMENT > bin.length) throw bad('section ' + k + ' lies past the end of pack.bin');
    return new T(ab, s.off, s.count * per);
  };
  const pos = view('pos', 3, Float32Array), nrm = view('nrm', 3, Float32Array), uv0 = view('uv0', 2, Float32Array), uv1 = view('uv1', 2, Float32Array);
  const idx = view('idx', 1, Uint32Array);
  const n = S.inst ? S.inst.count : 0;
  const raw = view('inst', 16, Uint32Array), rawF = new Float32Array(ab, S.inst.off, n * 16);
  const inst = { count: n, geom: new Uint32Array(n), uid: new Uint32Array(n), flags: new Uint32Array(n), m: new Float32Array(n * 12) };
  for (let i = 0; i < n; i++) {
    inst.geom[i] = raw[i * 16]; inst.uid[i] = raw[i * 16 + 1]; inst.flags[i] = raw[i * 16 + 2];
    for (let k = 0; k < 12; k++) inst.m[i * 12 + k] = rawF[i * 16 + 4 + k];
  }
  const nv = pos.length / 3, nMat = (json.materials || []).length;
  for (const g of json.geoms || []) {
    if (!(g.vOff + g.vCount <= nv) || !(g.iOff + g.iCount <= idx.length)) throw bad('geom ' + g.id + ' runs past the vertex or index section');
    for (const p of g.parts || []) {
      if (!(Number.isInteger(p.iOff) && Number.isInteger(p.iCount) && p.iOff >= 0 && p.iCount >= 0 && p.iOff + p.iCount <= g.iCount && p.iCount % 3 === 0)) {
        throw bad('a part of geom ' + g.id + ' runs past its geom indices or holds a partial triangle');
      }
      if (!(Number.isInteger(p.mat) && p.mat >= 0 && p.mat < nMat)) throw bad('a part of geom ' + g.id + ' names material ' + p.mat + ', which is not in pack.json');
    }
    for (let q = g.iOff, e = g.iOff + g.iCount; q < e; q++) if (idx[q] >= g.vCount) throw bad('geom ' + g.id + ' holds a vertex index past its vertices');
  }
  for (let i = 0; i < n; i++) if (inst.geom[i] >= (json.geoms || []).length) throw bad('instance ' + i + ' names geom ' + inst.geom[i] + ', which is not in pack.json');
  return Object.assign({}, json, { pos, nrm, uv0, uv1, idx, inst, from });
}

function readPack(x) {
  if (typeof x === 'string') {
    const jf = path.join(x, 'pack.json'), bf = path.join(x, 'pack.bin');
    if (!fs.existsSync(jf) || !fs.existsSync(bf)) throw bad('no pack.json and pack.bin in ' + path.basename(x));
    let json;
    try { json = JSON.parse(fs.readFileSync(jf, 'utf8')); } catch (e) { throw bad('pack.json cannot be read: ' + e.message); }
    return fromBin(json, fs.readFileSync(bf), 'in');
  }
  if (!x || !x.json || !x.bin) throw bad('readPack needs a folder or {json, bin}');
  return fromBin(x.json, x.bin, x.from || 'given');
}

module.exports = { pack, write, readPack, STATES, BIN_VERSION, placeMatrix, mul34, boneMatrix };

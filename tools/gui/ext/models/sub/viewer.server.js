// Models page part `viewer` (sub/README.md): the data of the 3D view. Reads only: writes nothing anywhere.
//   POST /api/x/models/viewer/scene { mod, target, anm, frame, meshes, lod } -> { ok, scene: scene/1 JSON (tools/lib/model/scene.js
//   toJSON) + scene.obstacles / scene.areas (2D shapes of the .mdl, model space: { name, kind, center, extent, axis, radius,
//   vertices }), frames, frame, anm, anmList: [{ name, file, key }], model, lod, lodCount }  |  { ok: false, error: plain sentence }
//   POST /api/x/models/viewer/texture { mod, target, rel, mesh } -> { ok, name, key, width, height, format, scaled, rgba: base64 of
//   width*height*4 bytes, top row first } | { ok: false, error, format? }. `rel` is a material or texture name exactly as a part of
//   the mesh `mesh` (its file name as scene/1 gives it) names it; nothing else is read. A .mtl name (or name + .mtl, from the ply
//   folder, then the .mdl folder, as tools/soedit/stage.js finds them) gives its {diffuse "..."} texture; a texture name is looked
//   up as stage.js texBase ($/ texture/common, / resource root, else relative). Only .dds is decoded (tools/lib/model/dds.js:
//   DXT1, DXT3, DXT5, uncompressed); the picture is at most 1024 on its larger side (a smaller mip, else box-filtered).
// target: every form of tools/soedit/target.js (entity name of any kind, game key or disk path of a .mdl / .def / breed .set,
// breed:<key>, pak:<pak>!<entry>). In process: target.resolve with the mod folder as a layer over the game (its loose files and
// its own paks, active or not), the .mdl parsed (tools/lib/model/mdl.js) and built (scene.build) with names read through that
// source, then the animation read through the same lookup (files.get), parsed with tools/lib/model/anm.js and posed with
// scene.pose at `frame`. A human skin (or a breed) lists the clips of the shared human.mdl (its {extension} clip list,
// properties/animation/human/<name>.anm): the skin's bones are posed by name; scene.js does not skin the mesh, so a skinned
// body stays in its bind pose while bones and the views on them move.
// lod n: every {LODView} shows its n-th entry (the last when it has fewer); 0 = the most detailed, as scene.js.
// The models used last are kept in memory (KEEP of them, the one asked last first; key: mod + target + game, fresh while the
// names, sizes and mtimes of the files in the model's folder inside the mod, or next to a .mdl given by path, stay the same), so
// stepping frames does not re-read meshes and a line-up of several targets (a scene of another route whose meshes carry
// `target`) can ask its textures target by target without each request reading a model again; meshes:false sends bones and
// volumes only (the page keeps the mesh buffers it has).
// Decoded pictures are kept once for all models by the bytes of the file (sha1): many meshes, materials or targets that show the
// same .dds decode it once (DEC, at most DEC_MAX characters of answers, the one used longest ago goes first).
// The mod check is the Units page's modOf, as ../server.js modNeed (not exported there: the two lines are copied).
// Game (../game.js): under MoW:AS2 target.resolve reads with exe 'mowas_2' (no as64/core) and the kept model's key carries the
// game; under AS64 nothing changes. Under Gates of Hell both routes read the GoH install (exe goh).
// Author: Imperator_Aug (ARSENAL, ia-0bdfb2ce)
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const TG = require('../../../../soedit/target'), mdlLib = require('../../../../lib/model/mdl'), sceneLib = require('../../../../lib/model/scene'), anmLib = require('../../../../lib/model/anm');
const ddsLib = require('../../../../lib/model/dds'), names = require('../../../../lib/names');
const G = require('../game');

const TEX_MAX = 1024;
const gameOpt = (ctx, b) => G.gameDir(ctx, b);   // the open game's own install (GoH: the GoH folder)
function modNeed(ctx, b) { return require('../../units/server').lib.modOf(b, gameOpt(ctx, b), true); }   // reads only: no write guard
function targetOf(b) {
  if (!String(b.target || '').trim()) return { error: 'Pick a model first: a unit name or the path to a .mdl file.' };
  const p = TG.parse(b.target);
  return p.error ? { error: p.error } : { t: TG.canonical(p), form: p.form };
}
// names, sizes, mtimes of the files in one folder (not recursive): a change there means the cached model is stale
function sigOf(dir) {
  if (!dir) return '';
  try {
    return fs.readdirSync(dir).sort().map(n => { try { const s = fs.statSync(path.join(dir, n)); return s.isFile() ? n + ':' + s.size + ':' + s.mtimeMs : ''; } catch (e) { return ''; } }).join('|');
  } catch (e) { return ''; }
}
function dirFor(target, mod, key) {
  if (/\.(mdl|def|set)$/i.test(target) && path.isAbsolute(target)) return path.dirname(target);
  if (/^pak:/i.test(target)) return null;
  if (!key) return null;
  const k = String(key).replace(/^resource\//i, '');
  return path.join(mod, 'resource', ...k.slice(0, k.lastIndexOf('/') + 1).split('/').filter(Boolean));
}

const KEEP = 8;
let MODELS = [];   // most recently used first: { id, dir, sig, res, anms: Map, lods: Map, tex: Map }
const STAT = { loads: 0, decodes: 0 };
// decoded pictures by the bytes of the file: sha1 -> the answer without `name`; least recently used out past DEC_MAX characters
const DEC = new Map(), DEC_MAX = 192 * 1024 * 1024;
let DECN = 0;
const decSize = o => 256 + (o.rgba ? o.rgba.length : 0);
function decGet(h) { const o = DEC.get(h); if (o) { DEC.delete(h); DEC.set(h, o); } return o || null; }
function decPut(h, o) {
  if (DEC.has(h)) { DECN -= decSize(DEC.get(h)); DEC.delete(h); }
  DEC.set(h, o); DECN += decSize(o);
  while (DECN > DEC_MAX && DEC.size > 1) { const k = DEC.keys().next().value; DECN -= decSize(DEC.get(k)); DEC.delete(k); }
}
function shut(m) { try { m.res.files.close(); } catch (e) { /* closed */ } }
function drop() { MODELS.forEach(shut); MODELS = []; DEC.clear(); DECN = 0; }
function getModel(mod, target, game, exe) {
  const id = [mod, target, game || ''].concat(exe ? [exe] : []).join('\n');
  const i = MODELS.findIndex(m => m.id === id);
  if (i >= 0) {
    const m = MODELS[i];
    MODELS.splice(i, 1);
    if (sigOf(m.dir) === m.sig) { MODELS.unshift(m); return { m, cached: true }; }
    shut(m);   // a file of its folder changed: read again
  }
  const res = loadModel(target, mod, game, exe);
  if (!res || !res.scene) return { error: (res && res.error) || ('The model ' + target + ' could not be read.') };
  STAT.loads++;
  const dir = dirFor(target, mod, res.key);
  const m = { id, dir, sig: sigOf(dir), res, anms: new Map(), lods: new Map(), tex: new Map() };
  MODELS.unshift(m);
  while (MODELS.length > KEEP) shut(MODELS.pop());
  return { m, cached: false };
}
const kDir = k => k.slice(0, k.lastIndexOf('/') + 1);
// the model a target names, read with the mod folder as a layer over the game (as sceneload.load, through tools/soedit/target.js)
function loadModel(target, mod, game, exe) {
  if (!game) { try { game = require('../../../../lib/gamedir').resolve().dir; } catch (e) { game = null; } }
  const r = TG.resolve(Object.assign({ target, game, modDirs: mod ? [mod] : [] }, exe ? { exe } : {}));
  if (r.error) return { error: r.error };
  const src = r.src, key = r.mdlKey;
  if (!key || !src.has(key)) { src.close(); return { error: 'Model ' + target + ' is not in the mod folder, the mods or the game.' }; }
  const got = src.get(key), model = mdlLib.parse(got.buf), dir = kDir(key);
  const files = {
    key: name => refKey(name, dir),
    get(name) { try { const g = src.get(refKey(name, dir)); return g ? g.buf : null; } catch (e) { return null; } },
    origin(name) { try { const g = src.get(refKey(name, dir)); return g ? g.origin : null; } catch (e) { return null; } },
    has: k => src.has(k),
    raw: k => { const g = src.get(k); return g ? g.buf : null; },
    close: () => src.close(),
  };
  return { scene: sceneLib.build(model, files), model, files, key, origin: got.origin, entity: r.def, human: !!r.human, breed: r.breed, error: model.error || null };
}
// the clips of the shared human.mdl: its {extension} file lists {sequence "name"}, each a <name>.anm next to that file
function humanClips(files) {
  const h = files.raw(TG.HUMAN_MDL), out = [];
  const ext = h && TG.extensionOf(h);
  if (!ext) return out;
  const ek = refKey(ext, kDir(TG.HUMAN_MDL)), eb = files.raw(ek);
  if (!eb) return out;
  const dir = kDir(ek), re = /\{\s*sequence\s+"([^"]+)"/gi, text = eb.toString('latin1').replace(/;[^\n]*/g, '');
  let m;
  while ((m = re.exec(text))) { const key = dir + names.normalize(m[1]) + '.anm'; if (files.has(key)) out.push({ name: m[1], file: '/' + key.slice(9), key }); }
  return out;
}
function anmList(model, files, human) {
  const out = [], seen = new Set();
  if (human && files.raw) for (const c of humanClips(files)) if (!seen.has(c.key)) { seen.add(c.key); out.push(c); }
  for (const s of (model && model.sequences) || []) {
    const file = s.file || (s.name ? s.name + '.anm' : null);
    if (!file) continue;
    let key = file; try { key = files.key(file); } catch (e) { /* as written */ }
    if (seen.has(key)) continue; seen.add(key);
    out.push({ name: s.name || file, file, key });
  }
  return out;
}
// the animation as the page names it: a rel from the file set (resource/...), a vfs key, or a name relative to the .mdl
function readAnm(m, name) {
  if (m.anms.has(name)) return m.anms.get(name);
  const tries = [];
  if (/^resource\//i.test(name)) tries.push('/' + name.slice(9));
  tries.push(name);
  let buf = null;
  for (const t of tries) { buf = m.res.files.get(t); if (buf) break; }
  const r = buf ? anmLib.parse(buf) : null;
  const got = !buf ? { error: 'The animation ' + name + ' was not found in the mod folder or the game.' }
    : r.error && !r.frames ? { error: 'The animation ' + name + ' could not be read: ' + r.error }
      : { anm: r };
  m.anms.set(name, got);
  return got;
}
// how many LOD levels the model has (the longest {LODView})
function lodCount(model) {
  let n = 1;
  for (const b of (model && model.bones) || []) for (const v of b.views || []) if (v.kind === 'LODView' && v.lods) n = Math.max(n, v.lods.filter(l => l.file).length);
  return n;
}
// the scene with every {LODView} showing entry `lod`
function lodScene(m, lod) {
  if (!lod) return m.res.scene;
  if (m.lods.has(lod)) return m.lods.get(lod);
  const model = Object.assign({}, m.res.model, {
    bones: (m.res.model.bones || []).map(b => Object.assign({}, b, {
      views: (b.views || []).map(v => {
        if (v.kind !== 'LODView' || !v.lods || !v.lods.length) return v;
        const l = v.lods.filter(x => x.file), pick = l[Math.min(lod, l.length - 1)];
        return pick ? Object.assign({}, v, { lods: [pick], file: pick.file }) : v;
      }),
    })),
  });
  const sc = sceneLib.build(model, m.res.files);
  m.lods.set(lod, sc);
  return sc;
}
function shape2(o) {
  const s = o.shape || {};
  const nums = a => (Array.isArray(a) ? a.map(Number) : null);
  return { name: o.name || null, kind: s.kind || o.kind || null, center: nums(s.center), extent: nums(s.extent), axis: nums(s.axis),
    radius: s.radius == null ? null : Number(s.radius), vertices: (s.vertices || []).map(nums) };
}

// the engine's own preview cameras of a model: {Extender "preview" {"Stuff" {camera {origin x y z} {lookat x y z} {fov deg}
// {horizon deg}} {lights ..}} {"Stuff_primary" ..}} in the .mdl. The game draws an item's inventory picture through the one named
// "stuff" (its fields and camera set up) [V].
// -> {<name, lower case>: {origin, lookat, fov, horizon}} | null. The lights are not read (the 3D view has its own light)
function previewCams(buf) {
  if (!buf) return null;
  const s = buf.toString('latin1').replace(/;[^\n]*/g, ''), at = s.search(/\{\s*extender\s+"preview"/i);
  if (at < 0) return null;
  const close = from => { let d = 0; for (let i = from; i < s.length; i++) { if (s[i] === '{') d++; else if (s[i] === '}' && --d === 0) return i; } return s.length; };
  const end = close(at), out = {}, re = /\{\s*"([^"]+)"/g;
  re.lastIndex = at + 1;
  let m, n = 0;
  while ((m = re.exec(s)) && m.index < end) {
    const e2 = close(m.index), blk = s.slice(m.index, e2 + 1), c = blk.search(/\{\s*camera\b/i);
    re.lastIndex = e2 + 1;
    if (c < 0) continue;
    const num = '(-?(?:\\d+\\.?\\d*|\\.\\d+)(?:e[-+]?\\d+)?)';
    const v3 = k => { const x = new RegExp('\\{\\s*' + k + '\\s+' + num + '\\s+' + num + '\\s+' + num, 'i').exec(blk.slice(c)); return x ? [+x[1], +x[2], +x[3]] : null; };
    const v1 = k => { const x = new RegExp('\\{\\s*' + k + '\\s+' + num, 'i').exec(blk.slice(c)); return x ? +x[1] : null; };
    const origin = v3('origin'), lookat = v3('lookat');
    if (!origin || !lookat) continue;
    out[m[1].toLowerCase()] = { origin, lookat, fov: v1('fov'), horizon: v1('horizon') || 0 }; n++;
  }
  return n ? out : null;
}

async function sceneRoute(ctx, b) {
  try {
    const mod = modNeed(ctx, b), game = gameOpt(ctx, b);
    const tg = targetOf(b);
    if (tg.error) return { ok: false, error: tg.error };
    const g = getModel(mod, tg.t, game, G.exeOpt(ctx, b));
    if (g.error) return { ok: false, error: g.error };
    const m = g.m, lods = lodCount(m.res.model);
    const lod = Math.max(0, Math.min(lods - 1, Math.floor(Number(b.lod) || 0)));
    let sc = lodScene(m, lod), frames = 0, frame = 0, anmName = null;
    if (b.anm) {
      anmName = String(b.anm);
      const a = readAnm(m, anmName);
      if (a.error) return { ok: false, error: a.error };
      frames = a.anm.frames || 0;
      frame = Math.max(0, Math.min(frames ? frames - 1 : 0, Math.floor(Number(b.frame) || 0)));
      sc = sceneLib.pose(sc, a.anm, frame);
    }
    const scene = sceneLib.toJSON(sc, { meshes: b.meshes !== false });
    scene.obstacles = (m.res.model.obstacles || []).map(shape2);
    scene.areas = (m.res.model.areas || []).map(shape2);
    if (m.preview === undefined) m.preview = previewCams(m.res.model && m.res.model.bytes);
    if (m.preview) scene.preview = m.preview;
    return { ok: true, scene, frames, frame, anm: anmName, anmList: anmList(m.res.model, m.res.files, m.res.human), model: m.res.key || null,
      cached: g.cached, lod, lodCount: lods, human: !!m.res.human, breed: m.res.breed || null, entity: m.res.entity || null };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e).split('\n')[0] };
  }
}

// ---------- textures ----------
const dirOf = k => k.slice(0, k.lastIndexOf('/') + 1);
const refKey = (s, dir) => path.posix.normalize(names.resolve(s, dir).key);
function byKey(files, k) { return files.get(/^resource\//i.test(k) ? '/' + k.slice(9) : '//' + k); }
function texBase(t, dir) {   // as tools/soedit/stage.js texBase
  const l = names.normalize(t);
  return path.posix.normalize(l.startsWith('$/') ? 'resource/texture/common/' + l.slice(2) : l.startsWith('/') ? 'resource/' + l.slice(1) : dir + l);
}
function diffuseOf(buf) {
  const s = buf.toString('latin1');
  const m = /\{\s*diffuse\s+"([^"]*)"/i.exec(s) || /\{\s*(?:diffuse1|simple)\s+"([^"]*)"/i.exec(s);
  return m ? m[1] : null;
}
// the picture a part shows, read with the mod over the game: { key, buf } | { error }
// variant: the model's texture variant (units ext look.js: a file "<texture>#<variant>.<ext>" beside the texture, a "$" after the
// variant marks a dynamic one [V]); a texture that has no such file shows its plain picture
function findTexture(m, name, meshFile, variant) {
  const files = m.res.files, mdlDir = dirOf(m.res.key || ''), plyDir = dirOf(files.key(meshFile));
  let texName = name, texDir = plyDir, via = null;
  const isMtl = /\.mtl$/i.test(name), isTex = /\.(dds|tga|bmp|jpg|png|ebm|tex)$/i.test(name);
  if (!isTex) {
    const tries = isMtl ? [refKey(name, plyDir), refKey(name, mdlDir)] : [refKey(name + '.mtl', plyDir), refKey(name + '.mtl', mdlDir)];
    for (const k of tries) { const buf = byKey(files, k); if (buf) { via = k; texName = diffuseOf(buf); texDir = dirOf(k); break; } }
    if (isMtl && !via) return { error: 'The material ' + name + ' was not found in the mod folder or the game.' };
    if (via && !texName) return { error: 'The material ' + name + ' names no diffuse texture.' };
  }
  if (texName.startsWith('#')) return { error: 'The texture ' + texName + ' is a texture map name, not a file.' };
  const base = texBase(texName, texDir), ext = names.ext(base).toLowerCase();
  const keys = ext ? [base] : [base + '.dds', base + '.tga', base + '.bmp', base + '.png', base + '.jpg'];
  const all = variant ? keys.flatMap(k => [variant, variant + '$'].map(v => k.replace(/(\.[a-z0-9]+)$/i, '#' + v + '$1'))).concat(keys) : keys;
  for (const k of all) {
    const buf = byKey(files, k);
    if (!buf) continue;
    if (!/\.dds$/i.test(k)) return { error: 'The texture ' + k.split('/').pop() + ' is not shown: only .dds pictures are read here.', format: names.ext(k).slice(1).toUpperCase() };
    return { key: k, buf };
  }
  return { error: 'The texture ' + texName + ' was not found in the mod folder or the game.' };
}
function namedBy(m, name, meshFile) {
  const low = String(name).toLowerCase();
  return m.res.scene.meshes.some(me => me.file === meshFile && me.ply && (me.ply.parts || []).some(p =>
    (p.material && p.material.toLowerCase() === low) || (p.textures || []).some(t => String(t).toLowerCase() === low)));
}
async function textureRoute(ctx, b) {
  try {
    const mod = modNeed(ctx, b), game = gameOpt(ctx, b);
    const tg = targetOf(b);
    if (tg.error) return { ok: false, error: tg.error };
    const name = String(b.rel || '').trim(), meshFile = String(b.mesh || '').trim();
    if (!name || name.includes('\0') || !meshFile) return { ok: false, error: 'Name the texture and the mesh that uses it.' };
    const g = getModel(mod, tg.t, game, G.exeOpt(ctx, b));
    if (g.error) return { ok: false, error: g.error };
    const m = g.m;
    if (!namedBy(m, name, meshFile)) return { ok: false, error: 'The mesh ' + meshFile + ' does not use ' + name + '.' };
    // per model: (mesh, name) -> a refusal, or the sha1 of the file found; the decoded picture itself is in DEC, once for all
    const variant = /^[a-z0-9_][a-z0-9_.\-]{0,40}$/i.test(String(b.variant || '')) ? String(b.variant).toLowerCase() : '';
    const ck = meshFile + '\n' + name + (variant ? '\n#' + variant : '');
    const named = o => (o.ok ? Object.assign({ ok: true, name }, o) : o);
    const known = m.tex.get(ck);
    if (known && known.out) return known.out;
    if (known) { const o = decGet(known.h); if (o) return named(o); }
    const f = findTexture(m, name, meshFile, variant);
    if (f.error) {
      const out = { ok: false, error: f.error, format: f.format || null };
      if (m.tex.size > 256) m.tex.delete(m.tex.keys().next().value);
      m.tex.set(ck, { out });
      return out;
    }
    const h = crypto.createHash('sha1').update(f.buf).digest('hex') + ':' + f.key.split('/').pop();
    let o = decGet(h);
    if (!o) {
      const d = ddsLib.decode(f.buf, { maxSize: TEX_MAX });
      STAT.decodes++;
      o = d.error ? { ok: false, error: 'The texture ' + f.key.split('/').pop() + ' is not shown: ' + d.error + '.', format: d.format || null }
        : { ok: true, key: f.key, width: d.width, height: d.height, format: d.format, scaled: d.scaled || d.mip > 0,
          rgba: Buffer.from(d.rgba.buffer, d.rgba.byteOffset, d.rgba.byteLength).toString('base64') };
      decPut(h, o);
    }
    if (m.tex.size > 256) m.tex.delete(m.tex.keys().next().value);
    m.tex.set(ck, { h });
    return named(o);
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e).split('\n')[0] };
  }
}

const wrap = fn => async (url, body, ctx) => fn(ctx, body || {});
module.exports = {
  routes: { 'POST /api/x/models/viewer/scene': wrap(sceneRoute), 'POST /api/x/models/viewer/texture': wrap(textureRoute) },
  _t: { sigOf, dirFor, targetOf, drop, lodCount, diffuseOf, texBase, loadModel, humanClips, previewCams, KEEP,
    stat: () => ({ loads: STAT.loads, decodes: STAT.decodes, models: MODELS.map(m => m.id), pictures: DEC.size }) },
};

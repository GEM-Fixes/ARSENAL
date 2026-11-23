// armorsim/origin: where a file the checker reads comes from, and the open model document laid over the mod and the game.
//
//   overlay(src, doc) -> src'   src = a tools/lib/sdlset source (armordata.openSource); doc = an open model document
//       (tools/lib/model/edit/core.js: doc.files Map rel -> { rel, bytes, from, dirty }). src' reads a file of the document
//       from the document's current bytes (unsaved edits included) and everything else as src does. src is not changed.
//   originOf(src, fileOrKey) -> { from: 'unsaved' | 'mod' | 'other mod' | 'vanilla' | 'unknown', key, mod }   mod = name (see below)
//       unsaved  = a document file whose bytes differ from the disk     mod = a loose file of the mod folder (src.local)
//       other mod = the winning layer is a mounted mod (src.isModKey)    vanilla = the game's own files
//   stamp(src, loc) -> loc + { from, mod, layer, rel }     for the { file, line } records armordata gives
//   fields(src, file) -> { from, mod, layer, rel }        originOf also returns layer, rel (see below)
// Order = the game's: one file path, the highest layer wins whole (a mod that ships only one include gets the game's other files).
// Author: Imperator_Aug (ARSENAL, ia-98eda894)
'use strict';
const lc = s => String(s == null ? '' : s).toLowerCase().replace(/\\/g, '/');
const keyOf = rel => { const r = lc(rel).replace(/^\.\//, ''); return r.startsWith('resource/') ? r : 'resource/' + r; };

function overlay(base, doc) {
  const map = new Map();
  for (const e of doc.files.values()) map.set(keyOf(e.rel), e);
  const s = Object.create(base);
  s._doc = map;
  s._base = base;
  s._docMod = doc.mod || null;
  s.get = key => { const e = map.get(lc(key)); return e ? e.bytes : base.get(key); };
  s.open = (r, from) => { const x = base.open(r, from); return x && map.has(lc(x.key)) ? Object.assign({}, x, { buf: map.get(lc(x.key)).bytes }) : x; };
  const keys = new Set(base.local.keys());
  if (base.v) for (const k of base.v.files.keys()) keys.add(k);
  if (typeof base.packed === 'function') for (const k of base.packed().keys()) keys.add(k);
  for (const k of map.keys()) keys.add(k);
  s._armorKeys = [...keys].sort();
  return s;
}

// mod = the mod's name for 'mod' (base name of the mod folder) and 'other mod' (the vfs layer: the mounted mod's folder id,
// tools/lib/vfs.js layer '<mod>' | '<mod> patch N'), else null
const folderName = f => { const s = String(f || '').replace(/[\\/]+$/, '').split(/[\\/]/).pop(); return s || null; };
const layerMod = (base, k) => { const r = base.v && base.v.files.get(k); return r && r.layer ? String(r.layer).replace(/ patch [0-9]+$/, '') : null; };
// layer + rel = the exact file the text was read from (the page's Open goes there, not to the load-order winner of the path):
//   layer = absolute path (forward slashes) of the mod folder, the game folder (or loose layer dir) or the .pak; rel = the path
//   inside it as stored there (case kept). Unsaved: the document's mod folder and its rel (the bytes are the editor's).
const fwd = p => (p == null ? null : String(p).replace(/\\/g, '/'));
const relIn = (root, f) => { const r = fwd(f), b = fwd(root).replace(/\/+$/, '') + '/'; return r.toLowerCase().startsWith(b.toLowerCase()) ? r.slice(b.length) : r; };
function localAt(base, k) {
  if (base.local && base.local.has(k)) { const f = base.local.get(k); return { layer: fwd(base.folder) ? fwd(base.folder).replace(/\/+$/, '') : null, rel: base.folder ? relIn(base.folder, f) : fwd(f) }; }
  return null;
}
function packedAt(base, k) {   // a pak inside a loose mod folder (sdlset packed(): file = '<rel pak>!<entry>')
  let r = null;
  try { r = typeof base.packed === 'function' ? base.packed().get(k) : null; } catch (e) { r = null; }
  if (!r || !r.file) return null;
  const i = r.file.indexOf('!'), pk = r.file.slice(0, i);
  return { layer: fwd(require('path').resolve(base.folder || '.', pk)), rel: r.file.slice(i + 1) };
}
function vfsAt(base, k) {
  const r = base.v && base.v.files.get(k);
  return r && r.container ? { layer: fwd(r.container).replace(/\/+$/, ''), rel: fwd(r.entry) } : null;
}
const NOWHERE = { layer: null, rel: null };
function originOf(src, file) {
  if (!file) return { from: 'unknown', key: null, mod: null, layer: null, rel: null };
  const base = src._base || src;
  // '<rel pak>!<entry>' = a file sdlset open() read from a pak of the mod folder (includes, scripts): back to its key
  const bang = String(file).indexOf('!');
  if (bang > 0 && typeof base.packed === 'function') {
    if (!base._packedByFile) { base._packedByFile = new Map(); for (const [k, r] of base.packed()) base._packedByFile.set(lc(r.file), k); }
    const pk = base._packedByFile.get(lc(file));
    if (pk) file = pk;
  }
  const k0 = lc(file), cands = k0.startsWith('resource/') ? [k0] : [k0, 'resource/' + k0];
  for (const k of cands) {
    const e = src._doc && src._doc.get(k);
    if (e && (e.dirty || e.from === 'new')) return Object.assign({ from: 'unsaved', key: k, mod: null }, { layer: src._docMod ? fwd(src._docMod).replace(/\/+$/, '') : null, rel: fwd(e.rel) });
  }
  // the folder's loose file vs its own pak: the one the engine mounts last (sdlset winner
  const pakWins = k => typeof base.winner === 'function' && base.winner(k) === 'pak';
  for (const k of cands) if (base.local && base.local.has(k) && !pakWins(k)) return Object.assign({ from: 'mod', key: k, mod: folderName(base.folder) }, localAt(base, k));
  for (const k of cands) { const p = base.folder && packedAt(base, k); if (p) return Object.assign({ from: 'mod', key: k, mod: folderName(base.folder) }, p); }
  for (const k of cands) if (typeof base.isModKey === 'function' && base.isModKey(k)) return Object.assign({ from: 'other mod', key: k, mod: layerMod(base, k) }, vfsAt(base, k) || NOWHERE);
  for (const k of cands) if (base.v && base.v.files.has(k)) return Object.assign({ from: 'vanilla', key: k, mod: null }, vfsAt(base, k) || NOWHERE);
  // a loose file of the mod folder is named relative to the folder when it was reached through an include
  if (base.local) for (const k of base.local.keys()) if (k.endsWith('/' + k0)) return Object.assign({ from: 'mod', key: k, mod: folderName(base.folder) }, localAt(base, k));
  return { from: 'unknown', key: cands[cands.length - 1], mod: null, layer: null, rel: null };
}
function stamp(src, loc) { if (!loc || !loc.file) return loc; const o = originOf(src, loc.file); return Object.assign({}, loc, { from: o.from, mod: o.mod, layer: o.layer, rel: o.rel }); }
// the origin fields every `from` object carries: { from, mod, layer, rel } (nulls when there is no file)
function fields(src, file) { const o = file ? originOf(src, file) : null; return o ? { from: o.from, mod: o.mod || null, layer: o.layer, rel: o.rel } : { from: null, mod: null, layer: null, rel: null }; }

// a copy of a value with every { file, line } object in it stamped (shell().source: locs, chains, damage entries)
function stampDeep(src, x, cache = new Map()) {
  if (Array.isArray(x)) return x.map(v => stampDeep(src, v, cache));
  if (!x || typeof x !== 'object') return x;
  const o = {};
  for (const [k, v] of Object.entries(x)) o[k] = stampDeep(src, v, cache);
  if (typeof x.file === 'string' && x.file) {
    if (!cache.has(x.file)) cache.set(x.file, fields(src, x.file));
    Object.assign(o, cache.get(x.file));
  }
  return o;
}

module.exports = { overlay, originOf, stamp, stampDeep, fields, keyOf };

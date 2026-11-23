// model/edit/core: the editable model document under the built-in model and animation editor (contract: README.md here).
//   One document = one .mdl and the files it uses (ply, vol, anm, mtl, the unit .def), read with the mod folder laid over the game
//   (tools/soedit/stage.js openSource + collect, the same lookup tools/lib/model/sceneload.js uses). Edits are ops from the domain
//   modules in this folder (bytes in, bytes out); the core keeps the bytes, one undo step per op, and writes nothing until save.
//
// Exports:
//   open({ mod, target | mdl, game, mods }) -> doc     mod: the mod folder (checked by writeguard); target: entity name | .mdl path on disk
//       | vfs key of a .mdl; mdl: same as target (a key relative to the mod like resource/entity/x/x.mdl is taken as a vfs key).
//       game: the install (default tools/lib/gamedir resolve; null = no game, the mod folder only). Throws a plain-words Error.
//       exe (optional): the game's vfs exe 'as64' | 'mowas_2' (alias 'mowas2') | 'goh': the game files are read in that game's view (MoW:AS2
//       shares the AS2 install, without it the as64/core files show); none = the vfs default, as before. doc.exe keeps it.
//       exe 'goh': the Gates of Hell install is read (the same file forms, README.md Scope); the mod folder is the caller's to guard
//       (lib/writeguard). Owner 2026-11-15
//       The document is kept in the registry (at most MAX open; the least recently used one without unsaved changes is closed).
//   get(id) -> doc | null     close(id) -> boolean     list() -> [summary]
//   register(name, { apply, check? }) / registerState(name, fn)   add an op or a state read by hand (tests; domain files do it by exporting)
//   ops() -> [names]    states() -> [names]    problems() -> [{ file, error }] domain files that were missing pieces or threw on load
//   reload()   forget the loaded domain modules and read the folder again (registered-by-hand ops stay)
//   kindOf(rel) -> 'mdl'|'ply'|'vol'|'anm'|'mtl'|'def'|'other'     normRel(rel) -> 'resource/..' with forward slashes, or throws
//
// doc (fields and methods as the contract, plus):
//   doc.game, doc.target, doc.entity (def key | null), doc.removed: Map rel -> entry of files an op removed that exist in the mod or game
//   doc.read(rel): mdl, ply, vol, anm: tools/lib/model/<kind>.js parse(); mtl, def, other: mdl.js parse() (the SDL tree with byte spans,
//     so mdl.edit works on it). Cached per file until its bytes change. Unknown rel -> null.
//   doc.has(rel), doc.bytes(rel) -> Buffer | null (current), doc.fetch(rel) -> Buffer | null: the file as the mod over the game has it on
//     disk now (for an op that brings in a file that is not in the document yet), doc.state(what, query), doc.summary()
//   doc.history() -> { undo: [op names], redo: [op names] }
//   doc.exists(rel) -> boolean: in the document, in the mod on disk (stat) or in the game (key lookup, no read)
//   doc.listDir(dir, ext) -> [rel] the files of one folder with that extension (document, mod, game), sorted
//   An op whose info names { mdl: rel } of a .mdl in the document makes that the document's main file (save as, rename,
//     new model in place); undo and redo put the main file back with the bytes. apply/undo/redo results carry mdl.
//   doc.scene({ anm, frame, meshes, lod }) also gives lod (clamped), lodCount, obstacles and areas (scene.js shapes2).
//   doc.save({ dry, force, backup, lint }): backup copies the mod's own copy of each file about to be replaced to
//     <mod>/.arsenal/model-edit/backup/<time>/<rel> first (result: backups: [{ rel, to }]); lint (true or a run function as
//     tools/soedit/check.js linters takes) adds check.lint (binhdr, expcheck findings on the new bytes) and check.ran.
//   An op may return a rel that is not in the document yet: it joins as from 'mod' (on disk in the mod), 'game' (in the game) or 'new'.
//   doc.save({ dry, force }) -> { writes: [{ rel, bytes, was, size }], removes: [{ rel, to }], refused: [{ rel, reason }], notes: [string],
//     check, written: boolean }. Writes are all or nothing: every refusal is listed and nothing is written. A file in the mod that changed
//     on disk since it was opened is refused unless force. A removed mod file is moved to <mod>/.arsenal/model-edit/removed/<time>/<rel>
//     (never deleted); a removed game file stays in the game (a note). Each file: temp file next to it, then rename; on a failed rename
//     the files already replaced are put back. check = { findings: [{ file, line, code, msg }] } from tools/soedit/check.js mdlLoss,
//     anmLoss, plyLoss on each changed file (as opened -> as written), or null when check.js cannot be loaded.
// Author: Imperator_Aug (ARSENAL, ia-b5682d8f)
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const names = require('../../names'), wg = require('../../writeguard');
const mdlLib = require('../mdl'), sceneLib = require('../scene');
const PARSERS = { mdl: mdlLib, ply: require('../ply'), vol: require('../vol'), anm: require('../anm') };

const MAX = 8, UNDO_MAX = 500;
const fwd = p => String(p).replace(/\\/g, '/');
const dirOf = k => k.slice(0, k.lastIndexOf('/') + 1);
const keyToDisk = (root, key) => path.join(root, ...key.split('/'));
const inside = (a, b) => { const r = path.relative(b, a); return !!r && !r.startsWith('..') && !path.isAbsolute(r); };
const readOr = f => { try { return fs.statSync(f).isFile() ? fs.readFileSync(f) : null; } catch (e) { return null; } };
const plain = (msg, code) => Object.assign(new Error(msg), { status: 400, code: code || 'EDIT' });
const stageLib = () => require('../../../soedit/stage');

function kindOf(rel) {
  const e = path.extname(String(rel)).toLowerCase().slice(1);
  return ['mdl', 'ply', 'vol', 'anm', 'mtl', 'def'].includes(e) ? e : 'other';
}
function normRel(rel) {
  let r = fwd(String(rel == null ? '' : rel)).trim().replace(/^\.\//, '');
  if (!r || r.includes('\0') || /^[a-z]:/i.test(r) || r.startsWith('/')) throw plain(`"${rel}" is not a file name inside the model's folders.`);
  r = path.posix.normalize(r);
  if (r === '.' || r.startsWith('../') || r === '..') throw plain(`"${rel}" points outside the mod folder.`);
  return r;
}

// ---------- op registry ----------
const REG = { ops: new Map(), states: new Map(), byHand: new Set(), problems: [], loaded: false };
// spelled out for the single-exe build (it only bundles requires it can see); every other .js here is found by reading the folder
const KNOWN = {
  tree: () => require('./tree'), vol: () => require('./vol'), ply: () => require('./ply'), anm: () => require('./anm'), file: () => require('./file'),
};
function addModule(file, m) {
  if (!m || typeof m !== 'object') { REG.problems.push({ file, error: 'it exports nothing the editor can use (no ops, no state)' }); return; }
  for (const [name, op] of Object.entries(m.ops || {})) {
    if (!op || typeof op.apply !== 'function') { REG.problems.push({ file, error: `op ${name} has no apply function` }); continue; }
    if (REG.ops.has(name)) { REG.problems.push({ file, error: `op ${name} is also in ${REG.ops.get(name).file}; the first one is kept` }); continue; }
    REG.ops.set(name, { apply: op.apply, check: typeof op.check === 'function' ? op.check : null, file });
  }
  for (const [name, fn] of Object.entries(m.state || {})) {
    if (typeof fn !== 'function') { REG.problems.push({ file, error: `state ${name} is not a function` }); continue; }
    if (REG.states.has(name)) { REG.problems.push({ file, error: `state ${name} is also in ${REG.states.get(name).file}; the first one is kept` }); continue; }
    REG.states.set(name, { fn, file });
  }
}
function load() {
  if (REG.loaded) return;
  REG.loaded = true;
  const seen = new Set();
  for (const [n, req] of Object.entries(KNOWN)) {
    try { addModule(n + '.js', req()); seen.add(n + '.js'); } catch (e) {
      seen.add(n + '.js');
      if (e && e.code === 'MODULE_NOT_FOUND' && !fs.existsSync(path.join(__dirname, n + '.js'))) continue;   // not written yet: not a problem
      REG.problems.push({ file: n + '.js', error: String((e && e.message) || e).split('\n')[0] });
    }
  }
  let list = [];
  try { list = fs.readdirSync(__dirname).filter(f => /\.js$/i.test(f) && f.toLowerCase() !== 'core.js' && !seen.has(f)).sort(); } catch (e) { list = []; }
  for (const f of list) {
    try { addModule(f, require(path.join(__dirname, f))); } catch (e) { REG.problems.push({ file: f, error: String((e && e.message) || e).split('\n')[0] }); }
  }
}
function reload() {
  for (const [k] of [...REG.ops]) if (!REG.byHand.has('op:' + k)) REG.ops.delete(k);
  for (const [k] of [...REG.states]) if (!REG.byHand.has('state:' + k)) REG.states.delete(k);
  for (const k of Object.keys(require.cache)) if (dirOf(fwd(k)) === fwd(__dirname) + '/' && !/core\.js$/i.test(k)) delete require.cache[k];
  REG.problems = []; REG.loaded = false; load();
}
function register(name, op) {
  if (!name || typeof name !== 'string') throw new Error('register: an op needs a name');
  if (!op || typeof op.apply !== 'function') throw new Error(`register: op ${name} needs an apply function`);
  REG.ops.set(name, { apply: op.apply, check: typeof op.check === 'function' ? op.check : null, file: '(registered)' });
  REG.byHand.add('op:' + name);
}
function registerState(name, fn) {
  if (typeof fn !== 'function') throw new Error(`registerState: ${name} needs a function`);
  REG.states.set(name, { fn, file: '(registered)' }); REG.byHand.add('state:' + name);
}

// ---------- open ----------
function sourceFor(o) {
  const S = stageLib();
  const mod = o.mod;
  let target = String(o.mdl || o.target || '').trim();
  if (!target) throw plain('Pick a model first: a unit name or the path to a .mdl file.');
  // a .mdl named relative to the mod (resource/...) is a vfs key; an absolute path is a file on disk
  if (/\.mdl$/i.test(target) && !path.isAbsolute(target)) target = fwd(target).replace(/^\/+/, '');
  const t = path.isAbsolute(target) || !/\.mdl$/i.test(target) ? S.resolveTarget({ target }) : { keys: [names.normalize(target).replace(/^\/+/, '')].concat(/^resource\//i.test(target) ? [] : ['resource/' + names.normalize(target).replace(/^\/+/, '')]) };
  if (t.error) throw plain(t.error);
  let overlay = t.overlay || { root: path.join(mod, 'resource'), prefix: 'resource/' };
  const src = S.openSource({ game: o.game || null, mods: o.mods || [], overlay, exe: o.exe });
  return { src, t, overlay };
}
function open(o = {}) {
  load();
  if (!o.mod) throw plain('Pick your mod folder first: edits are saved there.');
  const mod = path.resolve(String(o.mod));
  const game = 'game' in o ? (o.game ? path.resolve(o.game) : null) : (require('../../gamedir').resolve().dir || null);
  const why = wg.refuseWrite(mod, { game, purpose: 'model edit' });
  if (why) throw plain(why);
  let st;
  try { st = sourceFor(Object.assign({}, o, { mod, game })); } catch (e) { throw e.status ? e : plain(String(e.message || e)); }
  const { src, t, overlay } = st;
  try {
    let key = t.key || null, entity = null;
    if (t.keys) key = t.keys.find(k => src.has(k)) || null;
    if (t.entity) {
      if (!game) throw plain(`To open the unit "${t.entity}" by name the game folder is needed. Give the path to its .mdl instead.`);
      const e = require('../sceneload').entityModel(t.entity, Object.assign({ game, mods: o.mods || [] }, o.exe ? { exe: o.exe } : {}));
      if (e.error) throw plain(e.error);
      key = e.key; entity = e.def || null;
    }
    if (!key || !src.has(key)) throw plain(`The model ${o.mdl || o.target} is not in the mod folder, the mods or the game.`);
    const col = stageLib().collect(src, key, { textures: 'none' });
    if (col.error) throw plain(col.error);
    const doc = makeDoc({ mod, game, exe: o.exe || null, mods: o.mods || [], mdl: key, target: String(o.target || o.mdl), entity, overlay });
    const add = (rel, kind) => {
      const g = src.get(rel); if (!g) return;
      doc.files.set(rel, entry(rel, kind, g.buf, fromOf(doc, rel)));
    };
    for (const [rel, f] of col.files) add(rel, f.kind === 'texture' ? 'other' : f.kind);
    if (entity && !doc.files.has(entity) && src.has(entity)) add(entity, 'def');
    doc.unresolved = col.unresolved || [];
    if (!doc.files.has(key)) throw plain(`The model ${key} could not be read.`);
    keep(doc);
    return doc;
  } finally { try { src.close(); } catch (e) { /* closed */ } }
}
// where a file of the document lives now: in the mod folder on disk, else the game (or another mod: not writable either)
function fromOf(doc, rel) { return readOr(keyToDisk(doc.mod, rel)) ? 'mod' : 'game'; }
function entry(rel, kind, bytes, from) { return { rel, kind: kind || kindOf(rel), bytes, bytes0: bytes, from, dirty: from === 'new' }; }
const cloneEntry = e => e && Object.assign({}, e);
function setDirty(e) { e.dirty = e.from === 'new' || !e.bytes.equals(e.bytes0); }

// ---------- the document ----------
function makeDoc(o) {
  const doc = {
    id: crypto.randomBytes(6).toString('hex'), rev: 0, mod: o.mod, game: o.game, exe: o.exe || null, mods: o.mods, mdl: o.mdl, target: o.target, entity: o.entity,
    files: new Map(), removed: new Map(), unresolved: [], used: Date.now(),
  };
  const U = [], R = [], cache = new Map();   // cache: rel -> { bytes, obj }
  let sceneCache = null;                     // { rev, sc }
  const look = rel => {
    if (rel == null) return null;
    let r; try { r = normRel(rel); } catch (e) { return null; }
    if (doc.files.has(r)) return r;
    const low = r.toLowerCase();
    for (const k of doc.files.keys()) if (k.toLowerCase() === low) return k;
    return null;
  };
  doc.has = rel => !!look(rel);
  doc.bytes = rel => { const k = look(rel); return k ? doc.files.get(k).bytes : null; };
  doc.read = rel => {
    const k = look(rel); if (!k) return null;
    const e = doc.files.get(k), c = cache.get(k);
    if (c && c.bytes === e.bytes) return c.obj;
    const P = PARSERS[e.kind] || mdlLib;
    let obj; try { obj = P.parse(e.bytes); } catch (err) { obj = { error: String(err.message || err) }; }
    cache.set(k, { bytes: e.bytes, obj });
    return obj;
  };
  // the game (and mods) source, opened once per document on first use: its key index makes exists() a lookup, not a read
  let SRC = null;
  const source = () => {
    if (SRC === null) { try { SRC = stageLib().openSource({ game: doc.game, mods: doc.mods, overlay: o.overlay, exe: doc.exe || undefined }); } catch (e) { SRC = false; } }
    return SRC || null;
  };
  doc._dropSource = () => { if (SRC) try { SRC.close(); } catch (e) { /* closed */ } SRC = null; };
  doc.fetch = rel => {
    const r = normRel(rel);
    const disk = readOr(keyToDisk(doc.mod, r));
    if (disk) return disk;
    const src = source(); if (!src) return null;
    try { const g = src.get(r); return g ? g.buf : null; } catch (e) { return null; } finally { try { src.close(); } catch (e) { /* pak handles released */ } }
  };
  // is the file there (document, mod folder on disk, or the game): no bytes are read
  doc.exists = rel => {
    let r; try { r = normRel(rel); } catch (e) { return false; }
    if (look(r)) return true;
    try { if (fs.statSync(keyToDisk(doc.mod, r)).isFile()) return true; } catch (e) { /* not in the mod */ }
    const src = source(); if (!src) return false;
    try { return !!(src.v && src.v.files.has(r)) || src.has(r); } catch (e) { return false; }
  };
  // the files of one folder (rel ending in '/') with an extension ('.anm'), from the document, the mod and the game, sorted
  doc.listDir = (dir, ext) => {
    let d; try { d = normRel(dir).replace(/\/?$/, '/'); } catch (e) { return []; }
    const want = ext ? String(ext).toLowerCase() : null, out = new Map();
    const add = k => { const l = k.toLowerCase(); if (l.slice(0, d.length) !== d.toLowerCase() || l.slice(d.length).includes('/')) return; if (want && !l.endsWith(want)) return; if (!out.has(l)) out.set(l, k); };
    for (const k of doc.files.keys()) add(k);
    try { for (const n of fs.readdirSync(keyToDisk(doc.mod, d))) if (readOr(path.join(keyToDisk(doc.mod, d), n))) add(d + n.toLowerCase()); } catch (e) { /* none in the mod */ }
    const src = source();
    if (src) { try { for (const k of src.keysIn(d)) add(k); } catch (e) { /* none in the game */ } }
    for (const k of doc.removed.keys()) out.delete(k.toLowerCase());
    return [...out.values()].sort((a, b) => a.localeCompare(b));
  };
  Object.defineProperty(doc, 'canUndo', { get: () => U.length > 0, enumerable: true });
  Object.defineProperty(doc, 'canRedo', { get: () => R.length > 0, enumerable: true });
  doc.dirty = () => doc.removed.size > 0 || [...doc.files.values()].some(e => e.dirty);
  doc.history = () => ({ undo: U.map(s => s.op), redo: R.map(s => s.op) });
  const snap = rels => rels.map(r => [r, cloneEntry(doc.files.get(r) || null), cloneEntry(doc.removed.get(r) || null)]);
  const restore = sn => { for (const [r, f, rm] of sn) { if (f) doc.files.set(r, f); else doc.files.delete(r); if (rm) doc.removed.set(r, rm); else doc.removed.delete(r); } };

  doc.apply = (name, args) => {
    load();
    const op = REG.ops.get(name);
    if (!op) throw plain(`There is no edit called "${name}". ${REG.ops.size ? 'The editor knows: ' + [...REG.ops.keys()].sort().join(', ') + '.' : 'No edit modules are loaded.'}`, 'UNKNOWN_OP');
    doc.used = Date.now();
    if (op.check) {
      let why; try { why = op.check(doc, args || {}); } catch (e) { throw plain(String(e.message || e)); }
      if (why) throw plain(String(why), 'CHECK');
    }
    let res;
    try { res = op.apply(doc, args || {}); } catch (e) { throw e && e.message ? Object.assign(e, { status: e.status || 400 }) : plain(String(e)); }
    const files = (res && res.files) || {};
    // check everything before anything changes: an op that returns a bad value changes nothing
    const plan = [];
    for (const [rel0, buf] of Object.entries(files)) {
      const rel = look(rel0) || normRel(rel0);
      if (buf !== null && !Buffer.isBuffer(buf)) throw plain(`The edit ${name} gave something that is not file bytes for ${rel}.`);
      plan.push([rel, buf]);
    }
    const changed = plan.filter(([rel, buf]) => {
      const e = doc.files.get(rel);
      if (buf === null) return !!e;
      return !e || !e.bytes.equals(buf);
    }).map(([rel]) => rel);
    if (!changed.length) return { rev: doc.rev, changed: [], info: (res && res.info) || null };
    const before = snap(changed);
    for (const [rel, buf] of plan) {
      if (!changed.includes(rel)) continue;
      const e = doc.files.get(rel);
      if (buf === null) {
        doc.files.delete(rel);
        if (e.from !== 'new') doc.removed.set(rel, Object.assign(cloneEntry(e), { bytes: e.bytes0 }));
        continue;
      }
      if (e) { const n = Object.assign(cloneEntry(e), { bytes: buf }); setDirty(n); doc.files.set(rel, n); continue; }
      const gone = doc.removed.get(rel);
      if (gone) { doc.removed.delete(rel); const n = Object.assign(cloneEntry(gone), { bytes: buf }); setDirty(n); doc.files.set(rel, n); continue; }
      const was = doc.fetch(rel), n = entry(rel, kindOf(rel), buf, was ? fromOf(doc, rel) : 'new');
      if (was) { n.bytes0 = was; setDirty(n); }
      doc.files.set(rel, n);
    }
    // an op that names a new main file (save as, rename, a new model in place) moves the document to it
    const mdlBefore = doc.mdl, nm = res && res.info && typeof res.info.mdl === 'string' ? look(res.info.mdl) : null;
    if (nm && kindOf(nm) === 'mdl') doc.mdl = nm;
    else if (!look(doc.mdl)) { const any = [...doc.files.keys()].find(k => kindOf(k) === 'mdl'); if (any) doc.mdl = any; }
    U.push({ op: name, before, after: snap(changed), mdl: [mdlBefore, doc.mdl] }); if (U.length > UNDO_MAX) U.shift();
    R.length = 0; doc.rev++;
    return { rev: doc.rev, changed, info: (res && res.info) || null, mdl: doc.mdl };
  };
  doc.undo = () => {
    const s = U.pop(); if (!s) return { rev: doc.rev, changed: [] };
    restore(s.before); if (s.mdl) doc.mdl = s.mdl[0]; R.push(s); doc.rev++;
    return { rev: doc.rev, changed: s.before.map(x => x[0]), op: s.op, mdl: doc.mdl };
  };
  doc.redo = () => {
    const s = R.pop(); if (!s) return { rev: doc.rev, changed: [] };
    restore(s.after); if (s.mdl) doc.mdl = s.mdl[1]; U.push(s); doc.rev++;
    return { rev: doc.rev, changed: s.after.map(x => x[0]), op: s.op, mdl: doc.mdl };
  };
  doc.state = (what, query) => {
    load();
    if (what === 'doc.files' || what === 'doc.info') return doc.summary();
    if (what === 'doc.exists') return { exists: doc.exists((query || {}).rel) };
    if (what === 'doc.history') return doc.history();
    if (what === 'doc.dir') { const q = query || {}; const dir = q.dir || dirOf(doc.mdl); return { dir: dir.replace(/\/?$/, '/'), files: doc.listDir(dir, q.ext || '.anm') }; }
    const s = REG.states.get(what);
    if (!s) throw plain(`There is no view called "${what}".`, 'UNKNOWN_STATE');
    return s.fn(doc, query || {});
  };
  doc.summary = () => ({
    doc: doc.id, rev: doc.rev, mdl: doc.mdl, target: doc.target, mod: doc.mod,
    files: [...doc.files.values()].map(e => ({ rel: e.rel, kind: e.kind, from: e.from, dirty: e.dirty, size: e.bytes.length }))
      .concat([...doc.removed.values()].map(e => ({ rel: e.rel, kind: e.kind, from: e.from, dirty: true, removed: true, size: 0 }))),
    canUndo: doc.canUndo, canRedo: doc.canRedo, dirty: doc.dirty(), unresolved: doc.unresolved,
  });

  // ---------- scene from the current bytes ----------
  doc.anmRel = name => {
    if (!name) return null;
    const direct = look(name); if (direct) return direct;
    try { const k = path.posix.normalize(names.resolve(String(name), dirOf(doc.mdl)).key); return look(k); } catch (e) { return null; }
  };
  doc.scene = (q = {}) => {
    const model0 = doc.read(doc.mdl), lodCount = sceneLib.lodCount(model0);
    const lod = Math.max(0, Math.min(lodCount - 1, Math.floor(Number(q.lod) || 0)));
    if (!sceneCache || sceneCache.rev !== doc.rev || sceneCache.lod !== lod) {
      const model = sceneLib.atLod(model0, lod);
      const dir = dirOf(doc.mdl), extra = new Map();
      const files = {
        key: n => path.posix.normalize(names.resolve(n, dir).key),
        get(n) {
          let k; try { k = files.key(n); } catch (e) { return null; }
          const hit = look(k); if (hit) return doc.files.get(hit).bytes;
          if (!extra.has(k)) extra.set(k, doc.fetch(k));
          return extra.get(k);
        },
      };
      sceneCache = { rev: doc.rev, lod, sc: sceneLib.build(model, files) };
    }
    let sc = sceneCache.sc, frames = 0, frame = 0, anm = null;
    if (q.anm) {
      anm = doc.anmRel(q.anm);
      if (!anm) throw plain(`The animation ${q.anm} is not part of this model.`);
      const a = doc.read(anm);
      if (!a || (a.error && !a.frames)) throw plain(`The animation ${q.anm} could not be read${a && a.error ? ': ' + a.error : ''}.`);
      frames = a.frames || 0;
      frame = Math.max(0, Math.min(frames ? frames - 1 : 0, Math.floor(Number(q.frame) || 0)));
      sc = sceneLib.pose(sc, a, frame);
    }
    if (q.raw) return sc;                    // the built scene itself (volumes with trace shapes), for tools/armorsim; not for the page
    return Object.assign(sceneLib.toJSON(sc, { meshes: q.meshes !== false }), { rev: doc.rev, anm, frame, frames, lod, lodCount,
      obstacles: sceneLib.shapes2(model0 && model0.obstacles), areas: sceneLib.shapes2(model0 && model0.areas) });
  };

  // ---------- save ----------
  doc.save = (so = {}) => save(doc, so);
  return doc;
}

function lossCheck(doc, writes) {
  let C;
  try { C = require('../../../soedit/check'); } catch (e) { return null; }
  const LOSS = { mdl: C.mdlLoss, anm: C.anmLoss, ply: C.plyLoss };
  const findings = [];
  for (const w of writes) {
    const e = doc.files.get(w.rel), fn = e && LOSS[e.kind];
    if (!fn || e.from === 'new' || !e.bytes0 || e.bytes0.equals(e.bytes)) continue;
    try { fn(e.bytes0, e.bytes, (line, code, msg) => findings.push({ file: w.rel, line: line || null, code, msg })); }
    catch (err) { findings.push({ file: w.rel, line: null, code: 'LOSS_CHECK_FAILED', msg: String(err.message || err) }); }
  }
  return { findings };
}

// binhdr and expcheck on the files about to be written (as tools/soedit/check.js linters, the Files part's lint route):
// the new bytes go to a temp folder, the tools read them there. check.lint = [{ file, line, code, msg }], check.ran = [{ code, msg }].
function lintCheck(doc, writes, check, run) {
  let C, R;
  try { C = require('../../../soedit/check'); R = require('../../report'); } catch (e) { return; }
  if (typeof C.linters !== 'function') return;
  const root = path.join(require('os').tmpdir(), 'arsenal-model-lint-' + crypto.randomBytes(6).toString('hex'));
  try {
    const rels = [];
    for (const w of writes) { const p = keyToDisk(root, w.rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, w.bytes); rels.push(w.rel); }
    const rep = R.createReport();
    C.linters(root, rels, doc.game, rep, run, doc.exe || undefined);
    const j = rep.toJSON({ tool: 'models' });
    check.lint = (j.findings || []).map(f => ({ file: fwd(String(f.file || '')), line: f.line || null, code: String(f.code || ''), msg: String(f.msg || '') }));
    check.ran = (j.info || []).filter(x => /^LINTER_/.test(x.code)).map(x => ({ code: x.code, msg: String(x.msg || '') }));
  } catch (e) {
    check.ran = [{ code: 'LINTER_FAILED', msg: String((e && e.message) || e).split('\n')[0] }];
  } finally { try { fs.rmSync(root, { recursive: true, force: true }); } catch (e) { /* temp left */ } }
}

function save(doc, so) {
  const mod = doc.mod, writes = [], removes = [], refused = [], notes = [];
  const guard = (rel, p) => {
    if (!inside(p, mod)) return 'it would land outside the mod folder';
    return wg.refuseWrite(p, { game: doc.game, purpose: 'model edit' });
  };
  for (const e of doc.files.values()) {
    if (!e.dirty) continue;
    const p = keyToDisk(mod, e.rel), why = guard(e.rel, p);
    if (why) { refused.push({ rel: e.rel, reason: why }); continue; }
    const disk = readOr(p);
    if (disk && e.from === 'mod' && !so.force && !disk.equals(e.bytes0)) { refused.push({ rel: e.rel, reason: 'the file in the mod folder was changed by another program since the model was opened' }); continue; }
    writes.push({ rel: e.rel, bytes: e.bytes, was: disk ? 'changed' : 'new', size: e.bytes.length });
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  for (const e of doc.removed.values()) {
    const p = keyToDisk(mod, e.rel);
    if (!readOr(p)) { notes.push(`${e.rel} is only in the game: it stays there, a mod cannot take a game file away.`); continue; }
    const why = guard(e.rel, p); if (why) { refused.push({ rel: e.rel, reason: why }); continue; }
    const to = path.join(mod, '.arsenal', 'model-edit', 'removed', stamp, ...e.rel.split('/'));
    const why2 = wg.refuseWrite(to, { game: doc.game, purpose: 'model edit' }); if (why2) { refused.push({ rel: e.rel, reason: why2 }); continue; }
    removes.push({ rel: e.rel, to: fwd(path.relative(mod, to)) });
  }
  const check = lossCheck(doc, writes);
  if (check && so.lint && writes.length) lintCheck(doc, writes, check, typeof so.lint === 'function' ? so.lint : undefined);
  // backup: the mod's own copy of each file about to be replaced goes to <mod>/.arsenal/model-edit/backup/<time>/<rel> first
  const backups = [];
  if (so.backup) {
    for (const w of writes) {
      if (w.was !== 'changed') continue;
      const to = path.join(mod, '.arsenal', 'model-edit', 'backup', stamp, ...w.rel.split('/'));
      const why = wg.refuseWrite(to, { game: doc.game, purpose: 'model edit backup' });
      if (why) { refused.push({ rel: w.rel, reason: why }); continue; }
      backups.push({ rel: w.rel, to: fwd(path.relative(mod, to)) });
    }
  }
  const out = { writes, removes, refused, notes, check, backups, written: false };
  if (so.dry || refused.length || (!writes.length && !removes.length)) return out;

  // phase 0: backups (copies; nothing is replaced yet)
  try {
    for (const b of backups) { const to = path.join(mod, ...b.to.split('/')); fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(keyToDisk(mod, b.rel), to); }
  } catch (err) {
    out.refused.push({ rel: '', reason: 'Nothing was written: the backup copy failed: ' + String(err.message || err).split('\n')[0] });
    return out;
  }
  // phase 1: every new file as a temp next to its target
  const tag = '.arsenal-tmp-' + crypto.randomBytes(4).toString('hex'), temps = [];
  try {
    for (const w of writes) {
      const p = keyToDisk(mod, w.rel), t = p + tag;
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(t, w.bytes); temps.push([t, p, w]);
    }
  } catch (err) {
    for (const [t] of temps) try { fs.rmSync(t, { force: true }); } catch (e) { /* best effort */ }
    out.refused.push({ rel: '', reason: 'Nothing was written: ' + String(err.message || err).split('\n')[0] });
    return out;
  }
  // phase 2: keep the old file aside, put the new one in place; on a failure put the old ones back
  const done = [];
  try {
    for (const [t, p] of temps) {
      const old = readOr(p) ? p + tag + '-old' : null;
      if (old) fs.renameSync(p, old);
      try { fs.renameSync(t, p); } catch (err) { if (old) fs.renameSync(old, p); throw err; }
      done.push([p, old]);
    }
    for (const r of removes) {
      const src = keyToDisk(mod, r.rel), to = path.join(mod, ...r.to.split('/'));
      fs.mkdirSync(path.dirname(to), { recursive: true }); fs.renameSync(src, to); done.push([null, null, src, to]);
    }
  } catch (err) {
    for (const d of done.reverse()) {
      try {
        if (d[2]) fs.renameSync(d[3], d[2]);
        else { fs.rmSync(d[0], { force: true }); if (d[1]) fs.renameSync(d[1], d[0]); }
      } catch (e) { /* best effort */ }
    }
    for (const [t] of temps) try { fs.rmSync(t, { force: true }); } catch (e) { /* best effort */ }
    out.refused.push({ rel: '', reason: 'Nothing was written (the files already replaced were put back): ' + String(err.message || err).split('\n')[0] });
    return out;
  }
  for (const [, old] of done) if (old) try { fs.rmSync(old, { force: true }); } catch (e) { /* left aside */ }
  for (const w of writes) { const e = doc.files.get(w.rel); e.bytes0 = e.bytes; e.from = 'mod'; e.dirty = false; }
  doc.removed.clear();
  out.written = true;
  return out;
}

// ---------- registry of open documents ----------
const DOCS = new Map();
function keep(doc) {
  while (DOCS.size >= MAX) {
    const clean = [...DOCS.values()].filter(d => !d.dirty()).sort((a, b) => a.used - b.used)[0];
    if (!clean) throw plain(`${MAX} models with unsaved changes are open. Save or close one first.`);
    close(clean.id);
  }
  DOCS.set(doc.id, doc);
}
function get(id) { const d = DOCS.get(String(id || '')) || null; if (d) d.used = Date.now(); return d; }
function close(id) { const d = DOCS.get(String(id || '')); if (d && d._dropSource) d._dropSource(); return DOCS.delete(String(id || '')); }
function list() { return [...DOCS.values()].map(d => ({ doc: d.id, mdl: d.mdl, mod: d.mod, rev: d.rev, dirty: d.dirty() })); }

module.exports = {
  open, get, close, list, register, registerState, reload, kindOf, normRel, MAX,
  ops: () => { load(); return [...REG.ops.keys()].sort(); },
  states: () => { load(); return [...REG.states.keys()].sort(); },
  problems: () => { load(); return REG.problems.slice(); },
};

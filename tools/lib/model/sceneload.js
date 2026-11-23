// model/sceneload: the IO half of scene.js. Finds a model the way tools/soedit/stage.js does and builds its scene.
//   load(target, { game, mods, modDir, indexCache, exe }) -> { scene, model, files, key, origin, entity, error }
//   exe: the game's vfs exe ('as64' | 'mowas_2' (alias 'mowas2') | 'goh'), handed to stage.openSource and to the entity index
//     (its own cache file per exe); none = the vfs default, as before. exe goh with no game: the GoH install (lib/games install),
//     read only here (editing: edit/core.js, the same exe).
//   target: entity name (tools/entityindex over game + mods -> .def -> Extension -> .mdl, as stage.js entityModel)
//           | path to a .mdl on disk | vfs path of a .mdl (resource/... or entity/...)   (stage.resolveTarget)
//   files are read through stage.openSource: modDir (a mod folder on disk; its resource/ is laid over the vfs, so mod
//   files win) first, then the vfs of game + mods (mods over game). A .mdl given by path overlays its own resource tree.
//   files = { get(nameAsWrittenInTheMdl) -> Buffer|null, key(name) -> vfs key, origin(name), close() }; names resolve
//   relative to the .mdl folder ('/x' = resource/x, '//x' = game root), as stage.js refKey (tools/lib/names.js resolve).
//   Never throws for a missing model: { error } instead. Reads only.
//   o.source (optional; tools/lib/model/scenecache.js passes it): a shared file source { read(key) -> Buffer|null, has(key),
//   keys(prefix) } and, when present, get(key) -> {buf, origin} and entityModel(name) -> {key, def}|{error}. Files are read
//   through it (a .mdl given by path, or o.modDir, still lays its disk tree over it) and it is never closed here. An entity
//   name with a source that has no entityModel resolves through o.game's index, or gives { error } when no o.game. Without
//   o.source every result is what it was.
// Author: Imperator_Aug (ARSENAL, ia-a932ed59)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');
const stage = require('../../soedit/stage'), names = require('../names');
const mdlLib = require('./mdl'), scene = require('./scene');

const fwd = p => String(p).replace(/\\/g, '/');
const dirOf = k => k.slice(0, k.lastIndexOf('/') + 1);
const refKey = (s, dir) => path.posix.normalize(names.resolve(s, dir).key);

function entityModel(name, o) {   // same as stage.js entityModel (not exported there)
  const ix = require('../../entityindex/index');
  const cache = o.indexCache || path.join(os.tmpdir(), 'ARSENAL', 'soedit', 'entityindex-' +
    crypto.createHash('md5').update(fwd(path.resolve(o.game)).toLowerCase() + '|' + (o.mods || []).join(',')).digest('hex').slice(0, 8) + '.json');
  fs.mkdirSync(path.dirname(cache), { recursive: true });
  const { idx } = ix.build(Object.assign({ gameDir: o.game, mods: o.mods || [], cache }, o.exe ? { exe: o.exe } : {}));
  const recs = idx.byName(name);
  if (!recs.length) return { error: `No entity named "${name}" in the game${(o.mods || []).length ? ' or the mods ' + o.mods.join(',') : ''}.` };
  const withModel = recs.find(r => r.model && r.model.endsWith('.mdl'));
  if (!withModel) return { error: `Entity "${name}" (${recs[0].key}) has no .mdl model.` };
  return { key: withModel.model, def: withModel.key };
}

// o.source seen through sceneload's src interface {has, get -> {buf, origin}, close}, with the disk overlay on top (as stage.openSource)
function sourceView(s, ov) {
  const ovPath = key => ov && key.startsWith(ov.prefix) ? path.join(ov.root, ...key.slice(ov.prefix.length).split('/')) : null;
  const isFile = p => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } };
  return {
    has: key => { const p = ovPath(key); return !!(p && isFile(p)) || !!s.has(key); },
    get(key) {
      const p = ovPath(key);
      if (p && isFile(p)) return { buf: fs.readFileSync(p), origin: { source: 'file', where: 'file', pakName: '', path: fwd(p) } };
      if (s.get) return s.get(key);
      const buf = s.read(key);
      return buf ? { buf, origin: s.origin ? s.origin(key) : null } : null;
    },
    close() { /* the caller owns the source */ },
  };
}

function load(target, o = {}) {
  if (!o.game && !o.source) o = Object.assign({}, o, { game: o.exe === 'goh' ? require('../games').install('goh').dir : require('../gamedir').resolve().dir });
  const t = stage.resolveTarget({ target });
  if (t.error) return { error: t.error };
  let overlay = t.overlay || null;
  if (!overlay && o.modDir) overlay = { root: path.join(path.resolve(o.modDir), 'resource'), prefix: 'resource/' };
  const src = o.source ? sourceView(o.source, overlay) : stage.openSource({ game: o.game, mods: o.mods || [], overlay, exe: o.exe });
  let key = t.key || null, entity = null;
  if (t.keys) key = t.keys.find(k => src.has(k)) || null;
  if (t.entity) {
    const e = o.source ? (o.source.entityModel ? o.source.entityModel(t.entity) : o.game ? entityModel(t.entity, o)
      : { error: 'An entity name needs a game folder or a source that resolves entity names.' }) : entityModel(t.entity, o);
    if (e.error) { src.close(); return { error: e.error }; }
    key = e.key; entity = e.def;
  }
  if (!key || !src.has(key)) { src.close(); return { error: `Model ${target} is not in the mod folder, the mods or the game.` }; }
  const got = src.get(key);
  const model = mdlLib.parse(got.buf);
  const dir = dirOf(key);
  const files = {
    key: name => refKey(name, dir),
    get(name) { try { const r = src.get(refKey(name, dir)); return r ? r.buf : null; } catch (e) { return null; } },
    origin(name) { try { const r = src.get(refKey(name, dir)); return r ? r.origin : null; } catch (e) { return null; } },
    close: () => src.close(),
  };
  const sc = scene.build(model, files);
  return { scene: sc, model, files, key, origin: got.origin, entity, error: model.error || null };
}

module.exports = { load, entityModel };

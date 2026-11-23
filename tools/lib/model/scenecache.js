// model/scenecache: one model loader per game + mod stack (mapviz contract tools/mapviz/README.md 1.4). sceneload.load builds
// its file source and the whole entity index again on every call (1.45-2.1 s a def on MoW:AS2, 2.5-3.9 s on GoH); a map
// loads hundreds of defs, so L keeps one vfs, one file source and one entity-name index, and remembers every model it loaded.
//   open({target, game?, mods?, modDirs?, vfs?}) -> L          sync; memory only, no cache folder, no CLI
//     target 'as64' | 'mowas2' | 'goh' (required, else Error code SCENECACHE_TARGET); exe id given to vfs = as64 | mowas_2 | goh,
//     never guessed from the folder. game = install folder (default: gamedir.resolve().dir, GoH gamedir.goh()); mods = stack in
//     mount order, last wins; modDirs = mod folders by path laid on top (vfs opts.modDirs). vfs given = reused as is (its exe
//     must be the target's, else SCENECACHE_TARGET); no game anywhere = Error code SCENECACHE_GAME. mods given and no vfs:
//     L's vfs is built in open, and a named mod that does not mount throws Error code MOD_NOT_MOUNTED (.unmounted =
//     [{name, why}], why = vfs.dropped), as tools/entityindex openSource refuses; L never answers from vanilla instead.
//   L.load(model) -> sceneload.load(model, {game, mods, source}) result, remembered per model string (the same object comes
//     back: treat it as read-only). model = entity name | vfs key of a .mdl | path of a .mdl on disk (sceneload targets).
//     An entity name resolves through L.entity (the engine's winner), not through sceneload's own first-by-path pick.
//   L.read(key) -> Buffer | null (absent)      L.entity(name) -> {name, key, mdl, layer} | null
//     entity name = basename of any resource/entity/**/*.def (loose or in paks, GoH paks too).
//     Several defs with one name: first mounted wins (base, patches, as64/core, the mods in order, then modDirs, each mod
//     and mod folder with its N.pat layers right after it), same layer
//     = path order (ENG-04, the rule refcheck uses). A def that cannot be read is skipped. mdl = the def's first {Extension}
//     (includes followed) resolved as tools/entityindex resolveModel, when it names a .mdl that exists; else null.
//   L.reads() -> [{kind:'pak'|'loose', file, key?, size, mtimeMs}] every file read since open or invalidate (README 8.3);
//     a pak counts once whatever entries were read; loose files carry their vfs key.
//   L.invalidate(): forget models, entities, reads; a vfs L built itself is built again on next use (a given one is kept);
//     open pak handles are closed (vfs.closeRecs).
//   extras: L.source (the file source sceneload gets), L.vfs() (the vfs), L.stats() -> {reads, loads, hits, entities},
//     L.target, L.exe, L.game, L.mods, L.modDirs.
// Reads only. Opt-in: the Models page, soedit and armorsim keep calling sceneload.load without a source.
// Author: Imperator_Aug (ARSENAL, ia-01608a5f)
'use strict';
const fs = require('fs'), path = require('path');
const vfsLib = require('../vfs'), sdlx = require('../sdlx'), sceneload = require('./sceneload');

const EXE = { as64: 'as64', mowas2: 'mowas_2', goh: 'goh' };
const fwd = p => String(p).replace(/\\/g, '/');
const GAME_LAYER = l => l === 'base' || /^patch \d+$/.test(l) || l === 'as64/core';   // as tools/soedit/stage.js
const err = (code, msg) => { const e = new Error('scenecache: ' + msg); e.code = code; return e; };

function defaultGame(target) {
  const gd = require('../gamedir');
  if (target === 'goh') return gd.goh() || null;
  const r = gd.resolve();
  return r && r.dir || null;
}

function open(o = {}) {
  const target = o.target;
  if (typeof target !== 'string' || !Object.prototype.hasOwnProperty.call(EXE, target)) {
    throw err('SCENECACHE_TARGET', `target must be as64, mowas2 or goh (got ${JSON.stringify(target === undefined ? null : target)})`);
  }
  const exe = EXE[target];
  if (o.vfs && o.vfs.exe && o.vfs.exe !== exe) throw err('SCENECACHE_TARGET', `the vfs given was built for ${o.vfs.exe}, not for ${exe} (target ${target})`);
  const game0 = o.game || (o.vfs && o.vfs.gameDir) || defaultGame(target);
  if (!game0) throw err('SCENECACHE_GAME', `no ${target} install folder: give game`);
  const game = path.resolve(game0);
  const mods = (o.mods || []).slice(), modDirs = (o.modDirs || []).slice();
  const ix = require('../../entityindex/index');   // kidsOf, nameOf, str0, resolveModel: the entity index's own readers

  let v = o.vfs || null;
  const own = !o.vfs;
  function build() {   // L's own vfs; a named mod that does not mount is refused (as entityindex openSource, MOD_NOT_MOUNTED)
    const nv = vfsLib.build({ gameDir: game, mods, modDirs, exe });
    const active = new Set((nv.mods || []).map(m => String(m).toLowerCase()));
    const bad = mods.filter(t => !active.has(String(t).split(':')[0].toLowerCase()));
    if (bad.length) {
      const why = vfsLib.dropped(nv);
      const e = err('MOD_NOT_MOUNTED', `named mod(s) did not mount, refusing to answer from vanilla instead: ${bad.join(', ')}` +
        (why.length ? '\n' + why.map(w => '  ' + w).join('\n') : ' (not in the active mod list, no reason reported by vfs)'));
      e.unmounted = bad.map(name => ({ name, why }));
      vfsLib.closeRecs();
      throw e;
    }
    return nv;
  }
  const V = () => v || (v = build());
  if (own && mods.length) V();   // at once: a misspelt or unavailable mod throws here, not later as vanilla answers
  let models = new Map(), ents = new Map(), byName = null, inputs = new Map();
  const stats = { reads: 0, loads: 0, hits: 0, entities: 0 };

  function stat(f) { try { const s = fs.statSync(f); return { size: s.size, mtimeMs: s.mtimeMs }; } catch (e) { return { size: -1, mtimeMs: 0 }; } }
  function note(rec, key) {
    if (rec.source === 'pak') {
      const f = path.resolve(rec.container), id = 'p|' + fwd(f).toLowerCase();
      if (!inputs.has(id)) inputs.set(id, Object.assign({ kind: 'pak', file: f }, stat(f)));
    } else {
      const f = path.resolve(rec.container, rec.entry), id = 'l|' + fwd(f).toLowerCase();
      if (!inputs.has(id)) inputs.set(id, Object.assign({ kind: 'loose', file: f, key }, stat(f)));
    }
  }
  function rec(key) { return V().files.get(key) || null; }
  function readKey(key) {
    const r = rec(key);
    if (!r) return null;
    const buf = vfsLib.readRec(r);
    stats.reads++;
    note(r, key);
    return buf;
  }
  function originOf(r) {   // the origin stage.openSource gives a vfs record
    const g = GAME_LAYER(r.layer);
    return r.source === 'pak'
      ? { source: g ? 'pak' : 'mod', where: g ? 'game' : 'mod', pakName: path.posix.basename(r.container), pak: r.container, entry: r.entry, layer: r.layer }
      : { source: g ? 'game' : 'mod', where: g ? 'game' : 'mod', pakName: '', path: fwd(path.join(r.container, r.entry)), layer: r.layer };
  }

  // ---- entity names
  function nameIndex() {
    if (byName) return byName;
    byName = new Map();
    for (const k of V().files.keys()) {
      if (!k.startsWith('resource/entity/') || !k.endsWith('.def')) continue;
      const n = k.slice(k.lastIndexOf('/') + 1, -4);
      const l = byName.get(n);
      if (l) l.push(k); else byName.set(n, [k]);
    }
    return byName;
  }
  function rank(layer) {   // tools/refcheck/refcheck.js ENG-04 order, mod folders after the listed mods
    const l = String(layer || '');
    if (l === 'base') return [0, 0];
    let m = /^patch (\d+)$/.exec(l);
    if (m) return [1, +m[1]];
    if (l === 'as64/core') return [1, 1e6];
    const vv = V(), list = vv.mods || [], dirIds = (vv.modDirs || []).map(d => d.id);
    m = /^(.*?)(?: patch (\d+))?$/.exec(l);   // '<id>' or '<id> patch N' (vfs mountRoot layer names)
    const j0 = dirIds.indexOf(l), j = j0 >= 0 ? j0 : dirIds.indexOf(m[1]);
    if (j >= 0) return [2 + list.length + j, j0 >= 0 ? 0 : +(m[2] || 0)];   // a mod folder and its N.pat layers
    const i = list.indexOf(m[1]);
    return [2 + (i < 0 ? 1e3 : i), m[2] ? +m[2] : 0];
  }
  function incOpen(r) {   // sdlx include resolver, as tools/entityindex openSource
    if (r.kind === 'fs') {
      const p = path.join(game, r.key);
      try { const buf = fs.readFileSync(p); const f = path.resolve(p), id = 'l|' + fwd(f).toLowerCase(); if (!inputs.has(id)) inputs.set(id, Object.assign({ kind: 'loose', file: f }, stat(f))); return { buf, file: r.key, key: r.key }; } catch (e) { return null; }
    }
    if (r.kind === 'user') return null;
    const b = readKey(r.key);
    return b ? { buf: b, file: r.key, key: r.key } : null;
  }
  function firstExtension(root) {   // first {Extension "x"} in the order tools/entityindex extractEntity lists refs
    let found = null;
    (function walk(b) {
      for (const c of ix.kidsOf(b)) {
        if (found !== null) return;
        if (c.disabled) continue;
        const s0 = ix.str0(c);
        if ((ix.nameOf(c) || '').toLowerCase() === 'extension' && s0) { found = s0; return; }
        walk(c);
      }
    })(root);
    return found;
  }
  function readDef(key) {   // -> {model: key|null} | null (unreadable)
    let buf;
    try { buf = readKey(key); } catch (e) { return null; }
    if (!buf) return null;
    let res;
    try { res = sdlx.read(buf, { file: key, key, open: incOpen, onError: () => {}, preInclude: [] }); } catch (e) { return null; }
    if (!res || !res.root) return null;
    const ext = firstExtension(res.root);
    const has = k => V().files.has(k);
    return { model: ext ? ix.resolveModel(has, key, ext) : null };
  }
  function entity(name) {
    const n = String(name || '').toLowerCase().replace(/\.def$/, '');
    if (ents.has(n)) return ents.get(n);
    stats.entities++;
    const keys = (nameIndex().get(n) || []).slice();
    const vv = V();
    keys.sort((a, b) => { const x = rank(vv.files.get(a).layer), y = rank(vv.files.get(b).layer); return x[0] - y[0] || x[1] - y[1] || (a < b ? -1 : a > b ? 1 : 0); });
    let out = null;
    for (const k of keys) {
      const d = readDef(k);
      if (!d) continue;
      out = { name: n, key: k, mdl: d.model && d.model.endsWith('.mdl') ? d.model : null, layer: vv.files.get(k).layer };
      break;
    }
    ents.set(n, out);
    return out;
  }

  const source = {
    has: key => V().files.has(key),
    read: readKey,
    keys(prefix) { const out = []; const p = prefix || ''; for (const k of V().files.keys()) if (k.startsWith(p)) out.push(k); return out.sort(); },
    get(key) { const r = rec(key); if (!r) return null; const buf = readKey(key); return { buf, origin: originOf(r) }; },
    origin(key) { const r = rec(key); return r ? originOf(r) : null; },
    entityModel(name) {   // sceneload's entityModel answer, from L.entity (same wording as sceneload)
      const e = entity(name);
      if (!e) return { error: `No entity named "${name}" in the game${mods.length ? ' or the mods ' + mods.join(',') : ''}.` };
      if (!e.mdl) return { error: `Entity "${name}" (${e.key}) has no .mdl model.` };
      return { key: e.mdl, def: e.key };
    },
  };

  const L = {
    target, exe, game, mods, modDirs, source,
    vfs: V,
    load(model) {
      const k = String(model);
      if (models.has(k)) { stats.hits++; return models.get(k); }
      stats.loads++;
      const r = sceneload.load(k, { game, mods, source });
      models.set(k, r);
      return r;
    },
    read: key => readKey(fwd(key).toLowerCase()),
    entity,
    reads: () => [...inputs.values()].sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0)).map(x => Object.assign({}, x)),
    invalidate() {
      models = new Map(); ents = new Map(); byName = null; inputs = new Map();
      if (own) v = null;
      vfsLib.closeRecs();
    },
    stats: () => Object.assign({}, stats),
  };
  return L;
}

module.exports = { open, EXE };

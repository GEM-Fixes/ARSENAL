// soedit/target: the one place that says what a model "target" may be and how it resolves. Used by stage.js, the Models page
// routes (tools/gui/ext/models/server.js and sub/*.server.js) and the model search index (modelindex.js), so they cannot drift.
//   parse(t) -> { form, value, ext?, pak?, entry? } | { error, code }     no IO. forms:
//     name   entity name: the .def file name without .def, any kind (vehicle, human skin, object); letters, digits, _ . - # ( ) and
//            single spaces inside (vanilla has "#stone01", "lci(l)", "plates 2")
//     key    vfs key of a .mdl, .def or .set (resource/entity/x/x.mdl, entity/x/x.def, /set/breed/mp/ger/admiral.set)
//     file   absolute path of a .mdl, .def or .set file anywhere on disk
//     breed  breed:<path under set/breed without .set>, e.g. breed:mp/ger/admiral
//     pak    pak:<absolute path of a .pak>!<entry>, the entry a .mdl, .def or .set inside that pak
//   resolve({ target, game, mods, modDirs, src?, exe? }) -> { error } | { mdlKey, def, breed, skin, entity, form, extras: [{ key, why }],
//     others: [{ key, why }], overlay, pakOverlay, modDirs, src }      reads through stage.openSource (game, mods, the mod folders
//     as layers, plus the file's own tree / pak); the caller closes src (src.close()) unless it passed its own. exe = the game's vfs
//     exe (stage.openSource, the entity index build and its cache file); none = the vfs default, as before.
//   A breed resolves to its {skin "x"} entity (entity/humanskin first) and that def's model; a human skin (a def under
//   entity/humanskin/) adds the shared human model (entity/humanskin/human/human.mdl, human.def and the clip list its
//   {extension} names): the engine plays clips on human.mdl and the skin only gives views (PORT-185).
//   unitName(t) -> entity name for a tool that takes a unit name (armorsim), from the string alone, or null.
// Author: Imperator_Aug (ARSENAL, ia-1c08d975)
'use strict';
const fs = require('fs'), path = require('path');
const names = require('../lib/names');

const HUMAN_MDL = 'resource/entity/humanskin/human/human.mdl', HUMAN_DEF = 'resource/entity/humanskin/human/human.def';
const FILE_EXT = /\.(mdl|def|set)$/i;
const NAME = /^[\w.\-#()]+( [\w.\-#()]+)*$/;
const fwd = p => String(p).replace(/\\/g, '/');
const dirOf = k => k.slice(0, k.lastIndexOf('/') + 1);
const isFile = p => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } };
const fail = (code, error) => ({ code, error });

// ---- parse: string -> form (no IO)
function parse(t0) {
  const t = String(t0 == null ? '' : t0).trim();
  if (!t) return fail('empty', 'Type a unit name or the path to a .mdl file first.');
  if (t[0] === '-' || /[\0-\x1f]/.test(t)) return fail('dash', 'That name cannot start with "-".');
  let m = /^breed:(.+)$/i.exec(t);
  if (m) {
    const k = fwd(m[1]).replace(/^\/+/, '').replace(/^(resource\/)?set\/breed\//i, '').replace(/\.set$/i, '');
    if (!k || k.split('/').some(s => !s || s === '..' || s === '.')) return fail('breed', 'A breed is written breed:<folder>/<name>, for example breed:mp/ger/admiral.');
    return { form: 'breed', value: names.normalize(k) };
  }
  m = /^pak:(.+\.pak)!(.+)$/i.exec(t);
  if (m) {
    const entry = fwd(m[2]).replace(/^\/+/, '');
    if (!path.isAbsolute(m[1])) return fail('pak', 'Give the full path of the .pak file: pak:<path>!<file in the pak>.');
    if (!FILE_EXT.test(entry) || entry.split('/').includes('..')) return fail('pak', 'The file inside the pak must be a .mdl, .def or .set file.');
    return { form: 'pak', value: t, pak: path.resolve(m[1]), entry, ext: path.extname(entry).toLowerCase() };
  }
  if (FILE_EXT.test(t)) {
    const ext = path.extname(t).toLowerCase();
    if (path.isAbsolute(t) && (/^([a-z]:|\\\\|\/)/i.test(t))) {
      // a disk path; '/entity/x.mdl' (a game path written with a leading slash) is a key when it is not a file
      if (/^[a-z]:|^\\\\/i.test(t) || isFile(t)) return { form: 'file', value: path.resolve(t), ext };
    }
    const k = names.normalize(fwd(t)).replace(/^\/+/, '');
    if (k.split('/').includes('..')) return fail('key', 'A game path cannot contain "..".');
    return { form: 'key', value: k, ext };
  }
  if (!NAME.test(t)) return fail('name', 'A unit name has only letters, digits, "_", "." and "-". For a model file type its path ending in .mdl.');
  return { form: 'name', value: t };
}
// the form a page route accepts: parse, then a plain sentence thrown as status 400 (bad) when it is not one
function check(t, bad) { const p = parse(t); if (p.error) bad(p.error); return p; }
// the target string a route passes on (absolute paths resolved, keys with forward slashes)
function canonical(p) {
  if (p.form === 'file') return p.value;
  if (p.form === 'breed') return 'breed:' + p.value;
  if (p.form === 'pak') return 'pak:' + p.pak + '!' + p.entry;
  if (p.form === 'key') return p.value;
  return p.value;
}
// candidate vfs keys of a key target (resource/ prefix optional; entity/ for a bare mdl/def file name)
function keyCands(k, ext) {
  if (k.startsWith('resource/')) return [k];
  const c = ['resource/' + k];
  if (ext !== '.set' && !k.startsWith('entity/')) c.push('resource/entity/' + k);
  return c;
}
// entity name from the string alone (for a tool that takes a unit name), null when it cannot be told without reading files
function unitName(t) {
  const p = parse(t);
  if (p.error) return null;
  if (p.form === 'name') return p.value;
  if (p.form === 'breed') return null;
  const base = (p.form === 'pak' ? p.entry : fwd(p.value)).split('/').pop();
  return /\.(def|mdl)$/i.test(base) ? base.replace(/\.(def|mdl)$/i, '') : null;
}

// ---- reading defs and breeds
const strip = s => s.replace(/;[^\n]*/g, '');
// first {Extension "x"} of a def text (comments dropped)
function extensionOf(buf) { const m = /\{\s*extension\s+"([^"]*)"/i.exec(strip(buf.toString('latin1'))); return m ? m[1] : null; }
// {skin "x"} of a breed text
function skinOf(buf) { const m = /\{\s*skin\s+"([^"]*)"/i.exec(strip(buf.toString('latin1'))); return m ? m[1] : null; }
// the same for a breed whose skin line comes from an include or a macro call (a mod that builds its soldiers from shared macros):
// the file is written out first (lib/breedflat). readBuf: key -> Buffer | null
function skinOfKey(buf, key, readBuf) {
  const own = skinOf(buf); if (own || buf.indexOf(40) < 0) return own;
  const f = require('../lib/breedflat').flat(buf, key, readBuf);
  return f.expanded ? skinOf(f.text) : null;
}
const bufOf = src => k => { try { const g = src.get(k); return g ? g.buf : null; } catch (e) { return null; } };
// def Extension value -> mdl key (next to the def, under entity/, from the root: tools/entityindex resolveModel)
// A def that keeps its Extension in an (include "x") file (GoH: 76mm_qf17_late.def -> ../76mm_qf17/76mm_qf17.inc) is followed
// there, includes relative to the including file, "/x" from resource/; the model is then also looked for beside that file.
function extensionIn(src, key, buf, depth) {
  const own = extensionOf(buf);
  if (own) return { v: own, dir: key.slice(0, key.lastIndexOf('/') + 1) };
  if (depth >= 4) return null;
  const re = /\(\s*include\s+"([^"]+)"/ig, t = strip(buf.toString('latin1'));
  for (let m; (m = re.exec(t));) {
    let k = null; try { k = path.posix.normalize(names.resolve(m[1], key.slice(0, key.lastIndexOf('/') + 1)).key); } catch (e) { continue; }
    const g = k && /\.(inc|def|ext)$/i.test(k) ? src.get(k) : null, r = g && g.buf ? extensionIn(src, k, g.buf, depth + 1) : null;
    if (r) return r;
  }
  return null;
}
function modelOfDef(src, defKey, buf) {
  const r = buf ? extensionIn(src, defKey, buf, 0) : null;
  if (!r) return null;
  return require('../entityindex/index').resolveModel(k => src.has(k), defKey, r.v, r.dir) || null;
}
// every def key with this file name (case-blind); humanskin first when asked, else in key order
function defsByName(src, name, humanFirst) {
  const want = '/' + names.normalize(name) + '.def', out = [];
  for (const k of src.allKeys()) if (k.startsWith('resource/entity/') && k.endsWith(want)) out.push(k);
  out.sort();
  if (humanFirst) out.sort((a, b) => (b.startsWith('resource/entity/humanskin/') ? 1 : 0) - (a.startsWith('resource/entity/humanskin/') ? 1 : 0));
  return out;
}
// entity name -> { def, mdlKey } | { error }; a def whose model is only in an include falls back to the entity index
function entityModel(src, name, o, humanFirst) {
  const defs = defsByName(src, name, humanFirst);
  for (const d of defs) { const g = src.get(d); const mk = g && modelOfDef(src, d, g.buf); if (mk && mk.endsWith('.mdl')) return { def: d, mdlKey: mk }; }
  if (o.game) {
    try {
      const ix = require('../entityindex/index');
      const { idx } = ix.build(Object.assign({ gameDir: o.game, mods: o.mods || [], modDirs: o.modDirs || [], cache: indexCache(o), allowUnmounted: true }, o.exe ? { exe: o.exe } : {}));
      const r = idx.byName(name).find(e => e.model && e.model.endsWith('.mdl'));
      if (r) return { def: r.key, mdlKey: r.model };
    } catch (e) { /* no index: the plain error below */ }
  }
  if (defs.length) return { error: `Entity "${name}" (${defs[0]}) has no .mdl model (its Extension does not name a .mdl).` };
  return { error: `No entity named "${name}" in the mod folder or the game.` };
}
function indexCache(o) {
  const crypto = require('crypto'), os = require('os');
  const h = crypto.createHash('md5').update(fwd(path.resolve(o.game)).toLowerCase() + '|' + (o.mods || []).join(',') + '|' + (o.modDirs || []).map(d => fwd(path.resolve(d)).toLowerCase()).join(',')).digest('hex').slice(0, 8);
  const f = path.join(os.tmpdir(), 'ARSENAL', 'soedit', 'entityindex-' + h + '.json');
  try { fs.mkdirSync(path.dirname(f), { recursive: true }); } catch (e) { /* read-only: the index works without its cache */ }
  return f;
}
// the human model a skin needs: human.mdl, human.def and the clip list (the {extension} of human.mdl's Skeleton)
function humanExtras(src, mdlKey) {
  const out = [];
  if (mdlKey === HUMAN_MDL || !src.has(HUMAN_MDL)) return out;
  out.push({ key: HUMAN_MDL, why: 'the shared human model: skeleton and clips (the skin gives the views)' });
  return out;
}
function humanOthers(src, mdlKey) {
  const out = [];
  if (!src.has(HUMAN_MDL)) return out;
  if (mdlKey !== HUMAN_MDL && src.has(HUMAN_DEF)) out.push({ key: HUMAN_DEF, why: 'the human entity that carries human.mdl' });
  const g = src.get(HUMAN_MDL);
  const m = g && /\{\s*extension\s+"([^"]*)"/i.exec(strip(g.buf.toString('latin1')));
  if (m) { const k = path.posix.normalize(names.resolve(m[1], dirOf(HUMAN_MDL)).key); if (src.has(k)) out.push({ key: k, why: 'the clip list of human.mdl' }); }
  return out;
}

// ---- the key a file or pak entry stands for, and the source extras it needs
function fileLayout(abs) {
  const a = fwd(path.resolve(abs)), low = a.toLowerCase(), i = low.lastIndexOf('/resource/');
  if (i >= 0) return { key: 'resource/' + low.slice(i + 10), overlay: { root: a.slice(0, i) + '/resource', prefix: 'resource/' }, modDir: a.slice(0, i) };
  return { key: 'resource/' + path.basename(low), overlay: { root: path.dirname(a), prefix: 'resource/' }, modDir: null };
}
// a pak given by path: the key prefix its entries get (the pak's folder under resource/, as vfs mountDir; else resource/)
function pakLayout(pakAbs) {
  const a = fwd(path.resolve(pakAbs)), low = a.toLowerCase(), i = low.lastIndexOf('/resource/');
  if (i >= 0) return { root: 'resource/' + dirOf(low.slice(i + 10)), modDir: a.slice(0, i) };
  if (/\/resource\.pak$/.test(low)) return { root: 'resource/', modDir: a.slice(0, a.length - '/resource.pak'.length) };
  return { root: 'resource/', modDir: null };
}

// ---- resolve
function resolve(o) {
  const p = parse(o.target);
  if (p.error) return { error: p.error, code: p.code };
  const S = require('./stage');
  let overlay = null, pakOverlay = null, extraDir = null, key = null, keys = null;
  if (p.form === 'file') {
    if (!isFile(p.value)) return { error: `The file ${fwd(p.value)} was not found.` };
    const L = fileLayout(p.value); overlay = L.overlay; key = L.key; extraDir = L.modDir;
  } else if (p.form === 'pak') {
    if (!isFile(p.pak)) return { error: `The pak ${fwd(p.pak)} was not found.` };
    const L = pakLayout(p.pak); extraDir = L.modDir;
    pakOverlay = { file: p.pak, root: L.root };
    key = path.posix.normalize(L.root + names.normalize(p.entry));
  } else if (p.form === 'key') keys = keyCands(p.value, p.ext);
  const modDirs = (o.modDirs || []).slice();
  if (extraDir && fwd(path.resolve(extraDir)).toLowerCase() !== fwd(path.resolve(o.game || '.')).toLowerCase() && !modDirs.some(d => fwd(path.resolve(d)).toLowerCase() === fwd(path.resolve(extraDir)).toLowerCase())) modDirs.push(extraDir);
  if (!o.game && !overlay && !pakOverlay && !o.src) return { error: 'No game folder: pick the game folder (or pass --game).' };
  const own = !o.src;
  const src = o.src || S.openSource({ game: o.game, mods: o.mods || [], modDirs, overlay, pakOverlay, noInfer: true, exe: o.exe });
  const res = { form: p.form, target: canonical(p), mdlKey: null, def: null, breed: null, skin: null, entity: null, extras: [], others: [], overlay, pakOverlay, modDirs, src };
  const done = r => { if (r.error && own) src.close(); return r; };
  try {
    if (keys) key = keys.find(k => src.has(k)) || null;
    if ((p.form === 'key' || p.form === 'file' || p.form === 'pak') && (!key || !src.has(key))) {
      return done({ error: `${p.form === 'key' ? 'The game path ' + p.value : 'The file ' + (p.form === 'pak' ? p.entry + ' in ' + fwd(p.pak) : fwd(p.value))} is not in the mod folder or the game.` });
    }
    let breedKey = null, defKey = null, name = null;
    if (p.form === 'breed') { breedKey = 'resource/set/breed/' + p.value + '.set'; if (!src.has(breedKey)) return done({ error: `No breed ${p.value} (set/breed/${p.value}.set) in the mod folder or the game.` }); }
    else if (p.ext === '.set') breedKey = key;
    else if (p.ext === '.def') defKey = key;
    else if (p.ext === '.mdl') res.mdlKey = key;
    else name = p.value;
    if (breedKey) {
      const g = src.get(breedKey), skin = g && skinOfKey(g.buf, breedKey, bufOf(src));
      res.breed = breedKey; res.others.push({ key: breedKey, why: 'the breed' });
      if (!skin) return done({ error: `The breed ${breedKey} names no {skin "..."}.` });
      res.skin = skin; name = skin;
    }
    if (name) {
      const e = entityModel(src, name, { game: o.game, mods: o.mods, modDirs, exe: o.exe }, !!breedKey);
      if (e.error) return done({ error: breedKey ? `The breed's skin "${name}": ${e.error}` : e.error });
      defKey = e.def; res.mdlKey = e.mdlKey;
    } else if (defKey) {
      const g = src.get(defKey), mk = g && modelOfDef(src, defKey, g.buf);
      if (!mk || !mk.endsWith('.mdl')) return done({ error: `The definition ${defKey} names no .mdl model (no {Extension "x.mdl"} that resolves).` });
      res.mdlKey = mk;
    }
    if (defKey) { res.def = defKey; res.entity = defKey.slice(defKey.lastIndexOf('/') + 1, -4); res.others.push({ key: defKey, why: 'the definition' }); }
    const human = (defKey && defKey.startsWith('resource/entity/humanskin/')) || (res.mdlKey && res.mdlKey.startsWith('resource/entity/humanskin/'));
    if (human) { res.extras = humanExtras(src, res.mdlKey); res.others.push(...humanOthers(src, res.mdlKey)); }
    res.human = !!human;
    return res;
  } catch (e) { if (own) src.close(); throw e; }
}

module.exports = { parse, check, canonical, resolve, unitName, extensionOf, skinOf, skinOfKey, bufOf, modelOfDef, defsByName, fileLayout, pakLayout, keyCands, HUMAN_MDL, HUMAN_DEF, NAME };

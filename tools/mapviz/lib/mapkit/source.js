// mapkit source: one game + stack seen through tools/lib/vfs.js (exe id explicit, README 2.1), with the inputs it read
// (README 8.3), and the map list (README 1.1 list).
//   source(o) -> src (README 1.1)       list(src) -> rows sorted by key      stackHash(mods, modDirs) -> hex16
// Author: Imperator_Aug (ARSENAL, ia-d2153821)
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const mv = require('../../mapviz');

const MAP_ROOT = 'resource/map/';
const PICTURE_STEMS = ['minimap', 'preview', 'preview_small', 'header', 'header_interface'];
const fwd = p => String(p).replace(/\\/g, '/');
const sha16 = s => crypto.createHash('sha1').update(s).digest('hex').slice(0, 16);
const GAME_LAYER = l => l === 'base' || /^patch \d+$/.test(l) || l === 'as64/core';

// vanilla (no mods, no mod folders) = sha16(''); else mods joined by ',' and the mod folders (resolved, lower case, forward
// slashes) joined by ';', the two lines joined by a newline [I: README leaves the formula to mapkit]
function stackHash(mods, modDirs) {
  const m = (mods || []).map(String), d = (modDirs || []).map(x => fwd(path.resolve(typeof x === 'string' ? x : x.dir)).toLowerCase());
  if (!m.length && !d.length) return sha16('');
  return sha16(m.join(',') + '\n' + d.join(';'));
}

function statInput(kind, file, key) {
  let st = null;
  try { st = fs.statSync(file); } catch (e) { st = null; }
  const o = { kind, file: fwd(file) };
  if (key) o.key = key;
  o.size = st ? st.size : null;
  o.mtimeMs = st ? st.mtimeMs : null;
  return o;
}

function source(o) {
  o = o || {};
  const target = o.target;
  if (!mv.TARGETS[target]) throw new mv.MvError('MV_USAGE', 'target must be as64, mowas2 or goh, got ' + target);
  const exe = mv.TARGETS[target];
  const vfsLib = require('../../../lib/vfs');
  if (o.vfs && o.vfs.exe && o.vfs.exe !== exe) throw new mv.MvError('MV_USAGE', 'the vfs given was built for ' + o.vfs.exe + ', not for ' + exe);
  const game = o.vfs && o.vfs.gameDir && !o.game ? path.resolve(o.vfs.gameDir) : mv.gameFolder({ target, game: o.game });
  let st = null;
  try { st = fs.statSync(game); } catch (e) { st = null; }
  if (!st || !st.isDirectory()) throw new mv.MvError('MV_NOT_FOUND', 'no ' + target + ' install at the game folder given', { target });
  const mods = (o.mods || []).slice(), modDirs = (o.modDirs || []).map(d => path.resolve(d));
  const v = o.vfs || vfsLib.build({ gameDir: game, mods, modDirs, exe });
  let anyRes = false;
  for (const k of v.files.keys()) { if (k.startsWith('resource/')) { anyRes = true; break; } }
  if (!anyRes) throw new mv.MvError('MV_NOT_FOUND', 'no ' + target + ' install at the game folder given (no resource files)', { target });
  const active = new Set((v.mods || []).map(m => String(m).toLowerCase()));
  const unmounted = mods.filter(m => !active.has(String(m).split(':')[0].toLowerCase()));
  if (unmounted.length) {
    throw new mv.MvError('MV_NOT_FOUND', 'mod not mounted: ' + unmounted.join(', '),
      { unmounted: unmounted.map(n => ({ name: n, why: (vfsLib.dropReason(v, n) || {}).reason || null })) });
  }
  const inputs = new Map();
  let sorted = null;
  function note(rec, key) {
    if (!rec) return;
    if (rec.source === 'pak') { if (!inputs.has('p:' + rec.container)) inputs.set('p:' + rec.container, { kind: 'pak', file: rec.container }); }
    else { const f = path.join(rec.container, rec.entry); if (!inputs.has('l:' + f)) inputs.set('l:' + f, { kind: 'loose', file: f, key }); }
  }
  const src = {
    target, exe, game, mods, modDirs, vfs: v,
    stackHash: stackHash(mods, modDirs),
    has: key => v.files.has(key),
    rec: key => v.files.get(key) || null,
    read(key) {
      const r = v.files.get(key);
      if (!r) return null;
      note(r, key);
      return vfsLib.readRec(r);
    },
    keys(prefix) {
      if (!sorted) sorted = [...v.files.keys()].sort();
      const p = prefix || '';
      let lo = 0, hi = sorted.length;
      while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < p) lo = m + 1; else hi = m; }
      const out = [];
      for (let i = lo; i < sorted.length && sorted[i].startsWith(p); i++) out.push(sorted[i]);
      return out;
    },
    // a map folder counted as one loose input (list), or a pak
    noteFolder(rec, key) {
      if (rec.source === 'pak') note(rec, key);
      else {
        const f = path.join(rec.container, path.posix.dirname(rec.entry));
        if (!inputs.has('d:' + f)) inputs.set('d:' + f, { kind: 'loose', file: f, key });
      }
    },
    addInputs(list) {   // inputs another reader collected (scenecache L.reads())
      for (const x of list || []) {
        const id = (x.kind === 'pak' ? 'p:' : 'l:') + path.resolve(x.file);
        if (!inputs.has(id)) inputs.set(id, { kind: x.kind, file: x.kind === 'pak' ? x.file : x.file, key: x.key });
      }
    },
    reads() {
      const seen = new Set(), out = [];
      for (const x of inputs.values()) {
        const id = x.kind + ':' + fwd(path.resolve(x.file)).toLowerCase();
        if (seen.has(id)) continue;
        seen.add(id);
        out.push(statInput(x.kind, path.resolve(x.file), x.kind === 'loose' ? x.key : undefined));
      }
      return out.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
    },
  };
  return src;
}

// container as shown in the list: relative to the game folder ('<game>' for the folder itself), a mod folder given by
// path as '<mod-dir:id>/rest', anything else by its base name. vfs gives a loose record container = <root>/resource, so a
// loose file is shown by its root (the game folder, a mod folder), not by that resource folder.
function containerOf(src, rec) {
  const base = rec.source === 'loose' && /\/resource$/i.test(fwd(rec.container)) ? path.dirname(rec.container) : rec.container;
  const c = fwd(path.resolve(base)), g = fwd(path.resolve(src.game));
  const lc = s => s.toLowerCase();
  if (lc(c) === lc(g)) return '<game>';
  if (lc(c).startsWith(lc(g) + '/')) return c.slice(g.length + 1);
  for (const d of src.vfs.modDirs || []) {
    const dd = fwd(path.resolve(d.dir));
    if (lc(c) === lc(dd)) return '<mod-dir:' + d.id + '>';
    if (lc(c).startsWith(lc(dd) + '/')) return '<mod-dir:' + d.id + '>/' + c.slice(dd.length + 1);
  }
  return '<other>/' + path.basename(c);
}
function modOf(layer) {
  if (!layer || GAME_LAYER(layer)) return null;
  return String(layer).replace(/ patch \d+$/, '');
}

// every map folder (a folder under resource/map/ that holds map.net), with its direct files
function folders(src) {
  const dirs = new Map();
  for (const k of src.keys(MAP_ROOT)) {
    const i = k.lastIndexOf('/');
    const dir = k.slice(MAP_ROOT.length, i), name = k.slice(i + 1);
    if (!dir) continue;
    if (!dirs.has(dir)) dirs.set(dir, []);
    dirs.get(dir).push(name);
  }
  return dirs;
}

function picturesIn(names) {
  const pic = require('../../../lib/model/picture');
  const out = [];
  for (const stem of PICTURE_STEMS) {
    if (names.some(n => n.slice(0, n.lastIndexOf('.')) === stem && pic.typeOf(n))) out.push(stem);
  }
  return out;
}

function list(src) {
  const rows = [];
  for (const [dir, names] of folders(src)) {
    if (!names.includes('map.net')) continue;
    const rec = src.rec(MAP_ROOT + dir + '/map.net');
    src.noteFolder(rec, MAP_ROOT + dir);
    const files = names.slice().sort();
    const i = dir.lastIndexOf('/');
    rows.push({
      key: dir,
      group: i >= 0 ? dir.slice(0, i) : '',
      source: rec.source,
      container: containerOf(src, rec),
      mod: modOf(rec.layer),
      modes: files.filter(n => /\.mi$/.test(n)).map(n => n.slice(0, -3)).sort(),
      files,
      pictures: picturesIn(files),
    });
  }
  return rows.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

module.exports = { source, list, stackHash, containerOf, modOf, folders, picturesIn, MAP_ROOT, PICTURE_STEMS, sha16, GAME_LAYER };

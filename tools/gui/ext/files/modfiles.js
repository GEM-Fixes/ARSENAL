// modfiles: the file list of a mod for the Editor and Mod Files, taken from the shared walk (lib/modtree) and kept in the shared
// store (lib/cachestore), gui README "CACHE" contract 1. Nothing here walks the mod or stats its files.
//   kit(ctx) -> { S, mt, gv }   ctx.cache / ctx.modtree / ctx.gameview; a ctx without them (a test, a lib's own ctx) gets the modules
//     themselves and a store under ctx.tmpRoot/cache/store (as tools/gui/gui.js start({tmpRoot}) does), else the user's store.
//   listing(T, {noDot}) -> [[rel, size, mtimeMs]]   the files of a modtree T in explorer order (each folder by name, depth first),
//     without the folders the explorer never shows (.git .svn .hg node_modules .vs .vscode .idea, *.arsenal-undo; modtree itself
//     leaves out .arsenal and links). noDot: also no dot folders and dot files (the whole-mod check's rule). Kept per T.
//   pakEntries(ctx, file, size, mtimeMs) -> { ents: [[name, size]], ok }   the entries of one pak (folders included), from the store:
//     section 'ide.pak', parts {file}, stamps {pak: size:mtimeMs}. ok false = the pak could not be read (nothing stored).
//   tree(ctx, mod, o) -> Promise<{ from: 'store'|'build', total, unread, notes, game, loose, maxPak }>   the Editor's tree rows
//     { rel, size, state, key }, pushed into o.rows as they come. Store: section 'ide.tree', parts {game, gid, mod, prof, chunk},
//     stamps game + mod:all; chunk 'head' = { chunks, total, unread, notes, game, loose, maxPak }, chunk N = CH rows as arrays.
//     prof = files/lib profileSig (the profile's mod list). The head is written last, so a head that is there has all its chunks.
//     o: view() -> files/lib vfsFor answer (or a Promise of it), asked only on a miss; rows; tick() (awaited between slices, may
//     throw to stop); onHead({notes, game}); onRows() (all rows are in o.rows; the store write follows); maxAgeMs for modtree.
//   filesTree(ctx, mod, o) -> Promise<{ files, truncated, notes, game }>   the Mod Files answer (files/lib tree): the same store
//     entry as the Editor's tree, cut at o.maxTree loose files. Built on its own (not stored) only when its rows differ: GoH (keys
//     of language folders, o.kl) or a pak with over o.maxPak entries.
//   loose(ctx, mod) -> Map(key -> file) | null   the loose files under <mod>/resource from the last walk of this process (null: none
//     yet); a new walk is started in the background when the last one is old.
//   treeState(ctx, mod) -> cachestore state of the stored tree, without a walk.
// Author: Imperator_Aug (ARSENAL, ia-a508d216)
'use strict';
const path = require('path');
const pak = require('../../../lib/pak'), names = require('../../../lib/names');

const SKIP_DIRS = new Set(['.git', '.svn', '.hg', 'node_modules', '.vs', '.vscode', '.idea']), UNDO_SUFFIX = '.arsenal-undo';   // as files/lib walk
const TREE = 'ide.tree', TREE_VER = 1, PAK = 'ide.pak', PAK_VER = 1, CH = 20000;
const TEXT_ROOT = 'resource/interface/text/';
const lc = s => String(s).toLowerCase();
const norm = p => lc(String(path.resolve(p)).replace(/\\/g, '/')).replace(/\/+$/, '');
const L = () => require('./lib');   // lazy: files/lib requires this file
const turn = () => new Promise(r => setImmediate(r));

const _own = new Map();   // store root -> S, for a ctx that brings no store
function kit(ctx) {
  const mt = (ctx && ctx.modtree) || require('../../../lib/modtree');
  const gv = (ctx && ctx.gameview) || require('../../../lib/gameview');
  let S = ctx && ctx.cache;
  if (!S) {
    const cs = require('../../../lib/cachestore');
    if (ctx && ctx.tmpRoot) {
      const root = path.join(ctx.tmpRoot, 'cache', 'store');
      S = _own.get(root);
      if (!S) { S = cs.open({ root }); _own.set(root, S); if (!ctx.modtree) mt._reset({ store: S }); }   // the walks of a scratch run stay in its folder
    } else S = cs.open();
  }
  return { S, mt, gv };
}

// ---------------------------------------------------------------- the list
const _lists = new WeakMap();   // T -> { plain, noDot }
function listing(T, o) {
  const noDot = !!(o && o.noDot), slot = noDot ? 'noDot' : 'plain';
  let c = _lists.get(T);
  if (!c) _lists.set(T, c = {});
  if (c[slot]) return c[slot];
  const out = [];
  for (const f of T.files) {
    const p = f[0].split('/'), n = p.length - 1;
    let keep = true;
    for (let i = 0; i < n && keep; i++) if (SKIP_DIRS.has(lc(p[i])) || p[i].endsWith(UNDO_SUFFIX) || (noDot && p[i].startsWith('.'))) keep = false;
    if (keep && noDot && p[n].startsWith('.')) keep = false;
    if (keep) out.push([f[0].replace(/\//g, '\u0000'), f]);   // '/' below every name character: a folder's files come before its later siblings
  }
  out.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return (c[slot] = out.map(x => x[1]));
}

function pakEntries(ctx, file, size, mtimeMs) {
  const { S } = kit(ctx), parts = { file: norm(file) }, stamps = { pak: size + ':' + mtimeMs };
  const hit = S.get(PAK, PAK_VER, parts, stamps);
  if (hit && Array.isArray(hit.value)) return { ents: hit.value, ok: true };
  let ents; try { ents = pak.list(file).map(e => [e.name, e.size]); } catch { return { ents: [], ok: false }; }   // a broken pak is shown as is
  S.put(PAK, PAK_VER, parts, stamps, ents);
  return { ents, ok: true };
}

// ---------------------------------------------------------------- rows
// one row maker for both pages. kl = GoH language folders (files/lib keyLangs) or null; maxPak = entries taken of one pak (0 = all)
function rowMaker(ctx, mod, cv, kl, maxPak) {
  const lib = L(), m = { unread: 0, loose: 0, maxPak: 0, cut: false };
  const stateOf = key => {
    if (!key) return 'unmounted';
    if (!cv.v) return 'mounted';
    const ch = cv.v.chain(key);
    const below = ch.filter(r => lib.kindOf(r, cv) !== 'mine' && !r.deleted);
    const win = ch.length ? ch[ch.length - 1] : null;
    if (cv.inMods && win && lib.kindOf(win, cv) !== 'mine') return 'loses';
    return below.length ? 'override' : 'new';
  };
  m.file = f => {
    const r = f[0];
    m.loose++;
    if (!/\.(pak|pat)$/i.test(r)) { const key = lib.keyOf(r, kl); return [{ rel: r, size: f[1], state: lib.isModInfo(r) ? 'modinfo' : stateOf(key), key }]; }
    const out = [{ rel: r, size: f[1], state: 'pak', key: null }];
    const pe = pakEntries(ctx, path.join(mod, ...r.split('/')), f[1], f[2]);
    if (!pe.ok) m.unread++;
    let base = r.includes('/') ? null : (/\.pat$/i.test(r) || /^resource\.pak$/i.test(r) ? 'resource/' : /^localization\.pak$/i.test(r) ? TEXT_ROOT : null);
    // GoH: a pak under resource/ is keyed at its own folder (vfs mountDir), localizations/<lang>.pak entries <lang>/x at resource/x (GHLOC-01)
    let gl = null;
    if (kl && !base) {
      const nr = names.normalize(r), lm = /^localizations\/([^/]+)\.pak$/.exec(nr);
      if (nr.startsWith('resource/')) base = nr.slice(0, nr.lastIndexOf('/') + 1);
      else if (lm && kl.includes(lm[1])) gl = lm[1] + '/';
    }
    if (pe.ents.length > m.maxPak) m.maxPak = pe.ents.length;
    let ents = pe.ents;
    if (maxPak && ents.length > maxPak) { m.cut = true; ents = ents.slice(0, maxPak); }
    for (const e of ents) {
      if (e[0].endsWith('/')) continue;
      const en = names.zipEntryName(e[0]);
      out.push({ rel: r + '::' + e[0], size: e[1], state: 'inpak', key: base ? base + en : gl && en.startsWith(gl) ? 'resource/' + en.slice(gl.length) : null });
    }
    return out;
  };
  return m;
}

// ---------------------------------------------------------------- the stored tree
function gameQ(ctx) { const lib = L(); return { gameDir: lib.gameOf(ctx) || '', gid: lib.gidOf(ctx), exe: lib.exeOf(ctx) }; }
function treeId(ctx, mod, T) {
  const { mt, gv } = kit(ctx), g = gameQ(ctx);
  return {
    parts: { game: g.gameDir ? norm(g.gameDir) : '', gid: g.gid, mod: norm(mod), prof: L().profileSig(ctx) },
    stamps: Object.assign({ game: g.gameDir ? gv.stamp(g) : '' }, mt.stamps(T, ['all'])),
  };
}
const toRow = a => ({ rel: a[0], size: a[1], state: a[2], key: a[3] });
async function tree(ctx, mod, o) {
  const { S, mt } = kit(ctx), rows = o.rows, tick = o.tick || turn;
  const T = await mt.ensure(mod, o.maxAgeMs === undefined ? {} : { maxAgeMs: o.maxAgeMs });
  const id = treeId(ctx, mod, T), P = c => Object.assign({ chunk: c }, id.parts);
  const head = S.get(TREE, TREE_VER, P('head'), id.stamps), hv = head && head.value;
  if (hv && Number.isInteger(hv.chunks)) {
    if (o.onHead) o.onHead({ notes: hv.notes || [], game: hv.game || null });
    let ok = true;
    for (let i = 0; i < hv.chunks && ok; i++) {
      const c = S.get(TREE, TREE_VER, P(i), id.stamps);
      if (!c || !Array.isArray(c.value)) { ok = false; break; }   // a chunk went (the size cap): the rest is built below
      for (const a of c.value) rows.push(toRow(a));
      await tick();
    }
    if (ok && rows.length === hv.total) {
      if (o.onRows) o.onRows({ unread: hv.unread || 0 });
      return { from: 'store', total: rows.length, unread: hv.unread || 0, notes: hv.notes || [], game: hv.game || null, loose: hv.loose || 0, maxPak: hv.maxPak || 0 };
    }
  }
  // miss: the view, then a row per file. Rows already taken from the store stay (same stamps = same rows); the rest is added.
  const have = rows.length, cv = await o.view();
  const notes = cv.notes || [], game = cv.game || null;
  if (o.onHead) o.onHead({ notes, game });
  const mk = rowMaker(ctx, mod, cv, null, 0), all = [];
  for (const f of listing(T)) {
    for (const r of mk.file(f)) { all.push(r); if (all.length > have) rows.push(r); }
    await tick();
  }
  if (o.onRows) o.onRows({ unread: mk.unread });
  const res = { from: 'build', total: all.length, unread: mk.unread, notes, game, loose: mk.loose, maxPak: mk.maxPak };
  if (!cv.v) return res;   // no game view (no game folder, a failed build): shown, not kept
  const n = Math.ceil(all.length / CH);
  for (let i = 0; i < n; i++) {
    S.put(TREE, TREE_VER, P(i), id.stamps, all.slice(i * CH, (i + 1) * CH).map(r => [r.rel, r.size, r.state, r.key]));
    await turn();
  }
  S.put(TREE, TREE_VER, P('head'), id.stamps, { chunks: n, total: all.length, unread: mk.unread, notes, game, loose: mk.loose, maxPak: mk.maxPak });
  return res;
}
// the state of the stored tree, without a walk: the last known signature of the mod (none known = stale, why mod)
function treeState(ctx, mod) {
  const { S, mt } = kit(ctx), T = mt.last(mod);
  if (!T) return { state: 'stale', why: ['mod'] };
  const id = treeId(ctx, mod, T);
  return S.state(TREE, TREE_VER, Object.assign({ chunk: 'head' }, id.parts), id.stamps);
}

async function filesTree(ctx, mod, o) {
  const lib = L(), { mt } = kit(ctx);
  if (lib.gidOf(ctx) !== 'goh') {
    const rows = [];
    const r = await tree(ctx, mod, { view: o.view, rows, maxAgeMs: o.maxAgeMs });
    if (!(o.maxPak && r.maxPak > o.maxPak)) {
      if (r.loose <= o.maxTree) return { files: rows, truncated: false, notes: r.notes, game: r.game };
      let n = 0, i = 0;
      for (; i < rows.length; i++) if (rows[i].state !== 'inpak' && ++n > o.maxTree) break;
      return { files: rows.slice(0, i), truncated: true, notes: r.notes, game: r.game };
    }
  }
  const T = await mt.ensure(mod, o.maxAgeMs === undefined ? {} : { maxAgeMs: o.maxAgeMs }), cv = await o.view();
  const mk = rowMaker(ctx, mod, cv, o.kl ? o.kl(cv) : null, o.maxPak || 0), files = [], list = listing(T);
  const n = Math.min(list.length, o.maxTree);
  for (let i = 0; i < n; i++) { for (const r of mk.file(list[i])) files.push(r); if ((i & 255) === 255) await turn(); }
  return { files, truncated: list.length > o.maxTree || mk.cut, notes: cv.notes, game: cv.game || null };
}

// ---------------------------------------------------------------- loose files of a mod outside the game folder
const BORN = Date.now() - Math.round(process.uptime() * 1000);
const _loose = new Map();   // mod -> { all, m }
function loose(ctx, mod) {
  const { mt } = kit(ctx);
  mt.ensure(mod, { maxAgeMs: 15000 }).catch(() => {});   // an old walk is replaced in the background; this answer is the last one's
  const T = mt.last(mod);
  if (!T || T.at < BORN) return null;   // a list kept from an earlier run says nothing about the files now
  const k = norm(mod), c = _loose.get(k);
  if (c && c.all === T.all) return c.m;
  const m = new Map();
  for (const f of T.files) if (/^resource\//i.test(f[0])) m.set(names.normalize(f[0]), path.join(mod, ...f[0].split('/')));
  _loose.set(k, { all: T.all, m });
  if (_loose.size > 4) _loose.delete(_loose.keys().next().value);
  return m;
}

module.exports = { kit, listing, pakEntries, rowMaker, tree, treeState, treeId, filesTree, loose, gameQ, SKIP_DIRS, UNDO_SUFFIX, TREE, TREE_VER, PAK, CH,
  _reset: () => { _loose.clear(); } };

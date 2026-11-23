// gameview: one file view of the game's own data (no mod) for everybody (gui README, CACHE contract 1). The GUI modules each
// kept their own vfs.build({gameDir, mods: []}) copy (bots GCACHE, modes VIEWS, pro NAMES, files _vfs, ...); they share this one.
//   get({gameDir, exe, gid}) -> view   lib/vfs build({gameDir, mods: []}) with the exe the game id needs: the same options the
//     pages pass today, so gid 'as64' (or no game named) gives no exe (vfs picks it from the folder: as64.exe -> as64,
//     binaries/x64/call_to_arms.exe -> goh, else mowas_2) and 'mowas2' / 'goh' give exe 'mowas_2' / 'goh' (lib/games exeOf).
//     gid wins over exe; exe may be a game id or a vfs exe. One view per game folder + exe, the same object until `stamp`
//     moves, then it is built again. Sync, as vfs.build is. No gameDir -> null; a build that throws is not kept.
//   stamp({gameDir, exe, gid}, {force}) -> string   sha1 of the exe version (lib/gamever, read again only when the exe file's
//     size or mtime moved) and name, size, mtime of every pak the view mounts: resource.pak, localization.pak and N.pat in the
//     game folder, *.pak at any depth under resource/, localization/, localizations/ and every file directly in those three
//     (so a loose top-level file counts too), the same for as64/core when the view is the as64 one. Folders .git/.svn are
//     not entered. Asked at most every 5 s per game folder + exe (STAMP_MS); force = now.
//   text(view, resPath, enc = 'latin1') -> string | null   one file of the view ('set/x.set' or 'resource/set/x.set', any
//     case, either slash); latin1 keeps the bytes as the bots parts do. null = not in the view or not readable.
//   withMods(o) -> Promise<view>   the game plus mods, for everybody: nobody stat-walks a mod for a view any more.
//     o = {gameDir, exe, gid} as for get, plus
//       list: ['name', 'name:2', ...]   the mod list (lib/vfs opts.mods: mods of <game>/mods and Workshop items by id, with the
//                                       engine's order, version and mode rules)
//       mods: [dir | {dir, id}]         mod folders by path, mounted on top in this order (lib/vfs opts.modDirs)
//       lang, disableVersionControl, gameVersion, plainVersion, workshop   handed to lib/vfs build as they are
//       maxAgeMs, signal                handed to modtree.ensure
//     Awaits modtree.ensure of every folder that will be mounted (the listed mods that are installed, then o.mods), then builds
//     with lib/vfs opts.listings (no fs call per mod file) on top of get(o) (opts.base: the game is not mounted again). The view
//     is the one lib/vfs build gives for the same options. Kept per game folder + exe + list + folders + options, at most 3
//     (LRU; a big mod's view is large); the same object comes back while the game stamp and each folder's modtree 'all'
//     signature stand, a moved one builds again. A folder that cannot be scanned (missing) is left to lib/vfs and that view
//     is not kept. No list, no folders, no lang, no workshop: get(o). When the game view is not built yet it is built first and
//     the loop gets one turn (setImmediate) before the mod build, so the longest block is one build, not both.
//   has({gameDir, exe, gid}) -> bool   the game view is built and its stamp stands (no build).
//   withModsSync(o, {fresh, revalidate}) -> view   for callers that cannot await. Every folder has a scan of this process that
//     nothing touched since (modtree.fresh): as withMods, by signature, no walk. Else the old way: lib/vfs walks the folders
//     itself (13 s on a 112k-file mod, blocking). While a scan is missing or the mod was touched, a kept view of that slot
//     (walked or from listings) is served for 60 s or 20 build times, whichever is longer, counted from its build or its last
//     signature hit. fresh: walk now whatever is kept, and modtree.touch the folders. revalidate (a server; not a one-shot
//     tool): start modtree.ensure in the background when a scan is missing or older than 15 s, so a later call goes by
//     signature, and serve the kept view up to 30 s past its time meanwhile instead of walking.
//     noAge (a tool that must see the disk as it is: lib/sdlset): by signature when every folder has a scan, else a walk
//     now, and that view is not kept.
//     Prefer withMods; a sync caller is fast when some route awaited withMods (or modtree.ensure) for the mod shortly before.
//   drop(gameDir?)   forget views and stamps (all, or one game folder); for tests and after a game folder change.
// Author: Imperator_Aug (ARSENAL, ia-b04d8c86)
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const vfs = require('./vfs'), games = require('./games'), gamever = require('./gamever'), modtree = require('./modtree');

const STAMP_MS = 5000;
const VIEWS = new Map();    // key -> {view, stamp}
const STAMPS = new Map();   // key -> {stamp, at}
const VERS = new Map();     // key -> {sig, ver}

const low = d => path.resolve(String(d)).replace(/\\/g, '/').toLowerCase();
// the vfs exe the pages pass: none for as64 (the vfs default), else the game's vfs exe; an unknown word goes through as given
function exeOf(o) {
  const g = games.get(o.gid) || games.get(o.exe);
  if (g) return g.id === 'as64' ? undefined : g.exe;
  return o.exe || undefined;
}
const keyOf = (o, exe) => low(o.gameDir) + '|' + (exe || '');
const statOf = p => { try { return fs.statSync(p); } catch (e) { return null; } };

function version(o, exe, key) {
  const files = exe ? [(games.get(exe) || {}).file].filter(Boolean) : ['as64.exe', 'mowas_2.exe'];
  const sig = files.map(f => { const s = statOf(path.join(o.gameDir, f)); return s ? f + ':' + s.size + ':' + s.mtimeMs : f + ':-'; }).join('|');
  const c = VERS.get(key);
  if (c && c.sig === sig && c.ver) return c.ver;
  let ver = null; try { ver = gamever.read(o.gameDir, exe); } catch (e) { /* unknown exe word */ }
  // a version that came from an exe is kept until that exe moves; one from a version file (no exe here) is read each time
  if (ver && /:\d/.test(sig)) VERS.set(key, { sig, ver }); else VERS.delete(key);
  return ver || '';
}

const ROOT_PAK = /^(?:resource\.pak|localization\.pak|\d+\.pat)$/i, DATA_DIR = /^(?:resource|localization|localizations)$/i, SKIP_DIR = /^\.(?:git|svn)$/i;
function pakRows(root, tag, rows) {
  const list = d => { try { return fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return []; } };
  const row = (rel, p) => { const s = statOf(p); if (s) rows.push(tag + rel + '|' + s.size + '|' + s.mtimeMs); };
  const deep = (dir, rel, top) => {
    for (const e of list(dir)) {
      const p = path.join(dir, e.name), r = rel + '/' + e.name.toLowerCase();
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) { if (!SKIP_DIR.test(e.name)) deep(p, r, false); }
      else if (top || /\.pak$/i.test(e.name)) row(r, p);
    }
  };
  for (const e of list(root)) {
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) { if (DATA_DIR.test(e.name)) deep(path.join(root, e.name), e.name.toLowerCase(), true); }
    else if (ROOT_PAK.test(e.name)) row(e.name.toLowerCase(), path.join(root, e.name));
  }
}

function stamp(o, opt = {}) {
  if (!o || !o.gameDir) return '';
  const exe = exeOf(o), key = keyOf(o, exe), now = Date.now(), c = STAMPS.get(key);
  if (c && !opt.force && now - c.at < STAMP_MS) return c.stamp;
  const rows = [];
  pakRows(o.gameDir, '', rows);
  if (!exe || exe === 'as64') pakRows(path.join(o.gameDir, 'as64', 'core'), 'as64/core/', rows);
  rows.sort();
  const s = crypto.createHash('sha1').update('ver ' + version(o, exe, key) + '\n' + rows.join('\n')).digest('hex');
  STAMPS.set(key, { stamp: s, at: now });
  return s;
}

function get(o) {
  if (!o || !o.gameDir) return null;
  const exe = exeOf(o), key = keyOf(o, exe), s = stamp(o), c = VIEWS.get(key);
  if (c && c.stamp === s) return c.view;
  VIEWS.delete(key);
  const view = vfs.build(exe ? { gameDir: o.gameDir, mods: [], exe } : { gameDir: o.gameDir, mods: [] });
  VIEWS.set(key, { view, stamp: s });
  return view;
}

// ---------- game + mods
// is the game-only view of this game built and current (no build; the Prepare page asks)
function has(o) {
  if (!o || !o.gameDir) return false;
  const exe = exeOf(o), c = VIEWS.get(keyOf(o, exe));
  return !!c && c.stamp === stamp(o);
}

const MEMO = new Map();     // slot (identity + options, no signatures) -> {sig | null (walked), stamp, view, t, ms}; LRU
const LISTED = new Map();   // slot -> {at, dirs}
const MEMO_MAX = 3, REVAL_MS = 15000, LISTED_MS = 3000, STALE_MS = 30000;
const PASS = ['lang', 'disableVersionControl', 'gameVersion', 'plainVersion', 'workshop'];
function plan(o) {
  const exe = exeOf(o), bo = { gameDir: o.gameDir, mods: (o.list || []).map(String) };
  if (exe) bo.exe = exe;
  for (const k of PASS) if (o[k] !== undefined && o[k] !== null) bo[k] = o[k];
  const md = (o.mods || []).filter(Boolean).map(m => (typeof m === 'object' ? { dir: String(m.dir), id: m.id } : String(m)));
  if (md.length) bo.modDirs = md;
  const slot = JSON.stringify([keyOf(o, exe), bo.mods, md.map(m => (typeof m === 'object' ? [low(m.dir), m.id || ''] : low(m))), PASS.map(k => (bo[k] === undefined ? null : bo[k]))]);
  // the folders build will read: installed mods the list names, then the folders given by path
  const now = Date.now(); let L = LISTED.get(slot);
  if (!L || now - L.at > LISTED_MS) {
    const dirs = [], seen = new Set(), add = d => { const k = low(d); if (!seen.has(k)) { seen.add(k); dirs.push(d); } };
    if (bo.mods.length) for (const m of vfs.listed(bo)) add(m.dir);
    for (const m of md) add(typeof m === 'object' ? m.dir : m);
    if (LISTED.size > 16) LISTED.clear();
    LISTED.set(slot, L = { at: now, dirs });
  }
  // no list, no folders, no language, no Workshop folder named: the game view itself (the version options only judge listed mods)
  return { bo, slot, dirs: L.dirs, plain: !bo.mods.length && !md.length && bo.lang === undefined && bo.workshop === undefined };
}
function keep(slot, c) {
  MEMO.delete(slot); MEMO.set(slot, c);
  while (MEMO.size > MEMO_MAX) MEMO.delete(MEMO.keys().next().value);
  return c.view;
}
function construct(o, P, Ts) {
  const bo = Object.assign({}, P.bo), ls = Ts.filter(Boolean);
  if (ls.length) bo.listings = ls;
  if (!bo.lang || bo.lang === 'default') bo.base = get(o);
  return vfs.build(bo);
}
// every folder has a scan: the kept view when the game stamp and the signatures stand, else a build from the listings
function bySig(o, P, Ts) {
  const st = stamp(o), sig = st + '|' + Ts.map(T => T.all).join('|'), c = MEMO.get(P.slot);
  if (c && c.sig === sig) { c.t = Date.now(); c.stale = 0; return keep(P.slot, c); }
  const t0 = Date.now(), view = construct(o, P, Ts);
  return keep(P.slot, { sig, stamp: st, view, t: Date.now(), ms: Date.now() - t0 });
}
async function withMods(o) {
  if (!o || !o.gameDir) return null;
  const P = plan(o);
  if (P.plain) return get(o);
  const Ts = await Promise.all(P.dirs.map(d => modtree.ensure(d, { maxAgeMs: o.maxAgeMs, signal: o.signal }).catch(e => { if (e && e.code === 'ABORT_ERR') throw e; return null; })));
  // the game's own view is built first and the loop gets a turn before the mod is laid over it: two shorter blocks
  // instead of one (construct finds the game view built)
  const all = Ts.every(Boolean), c = all ? MEMO.get(P.slot) : null;
  const kept = !!c && c.sig === stamp(o) + '|' + Ts.map(T => T.all).join('|');
  if (!kept && (!P.bo.lang || P.bo.lang === 'default') && !has(o)) { get(o); await new Promise(r => setImmediate(r)); }
  if (all) return bySig(o, P, Ts);
  return construct(o, P, Ts);
}
function withModsSync(o, opt = {}) {
  if (!o || !o.gameDir) return null;
  const P = plan(o);
  if (P.plain) return get(o);
  const Ts = P.dirs.map(d => modtree.fresh(d)), all = Ts.every(Boolean), now = Date.now();
  if (opt.revalidate && !opt.fresh) for (let i = 0; i < Ts.length; i++) if (!Ts[i] || now - Ts[i].at > REVAL_MS) modtree.ensure(P.dirs[i]).catch(() => {});
  if (all && !opt.fresh) return bySig(o, P, Ts);
  const st = stamp(o), c = MEMO.get(P.slot);
  // no usable scan (none yet, or the mod was touched): the kept view, whichever way it was built, for 60 s or 20 build times
  // after it was last built or found right; a server whose scan is on its way (revalidate) may serve it 30 s longer rather
  // than block on a walk
  if (!opt.fresh && !opt.noAge && c && c.stamp === st) {
    const ttl = now - c.t <= Math.max(60000, 20 * c.ms);
    if (!ttl && opt.revalidate && !c.stale) c.stale = now;
    if (ttl || (opt.revalidate && now - c.stale <= STALE_MS)) return keep(P.slot, c);
  }
  const view = construct(o, P, []);
  if (opt.noAge) return view;
  if (opt.fresh) for (const d of P.dirs) { modtree.touch(d); if (opt.revalidate) modtree.ensure(d).catch(() => {}); }
  return keep(P.slot, { sig: null, stamp: st, view, t: Date.now(), ms: Date.now() - now });
}

function text(view, resPath, enc = 'latin1') {
  if (!view || !view.files || !resPath) return null;
  let k = String(resPath).replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase();
  if (!k.startsWith('resource/')) k = 'resource/' + k;
  const rec = view.files.get(k);
  if (!rec) return null;
  try { return vfs.readRec(rec).toString(enc); } catch (e) { return null; } finally { try { vfs.closeRecs(); } catch (e) { /* nothing open */ } }
}

function drop(gameDir) {
  if (!gameDir) { VIEWS.clear(); STAMPS.clear(); VERS.clear(); MEMO.clear(); LISTED.clear(); return; }
  const pre = low(gameDir) + '|';
  for (const m of [VIEWS, STAMPS, VERS]) for (const k of [...m.keys()]) if (k.startsWith(pre)) m.delete(k);
  for (const m of [MEMO, LISTED]) for (const k of [...m.keys()]) if (k.startsWith('["' + pre)) m.delete(k);
}

module.exports = { get, has, withMods, withModsSync, stamp, text, drop, STAMP_MS };

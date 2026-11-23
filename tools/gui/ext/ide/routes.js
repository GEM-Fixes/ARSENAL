// ide ext routes (contract: tools/ide/README.md "Routes"). JSON in, JSON out; errors = Error with .status, message only (no stack).
// Reads only. The one write is a read-only view copy of a pak entry / game index layer under ctx.tmpRoot/ide-view (for Notepad++).
// Spawns: Notepad++ through tools/ide/npp open(), show in folder through tools/lib/platform (files on disk only). shell:false, argv arrays, never the game.
// Sibling modules (intel, npp, cm, ui parts) are required lazily inside handlers so a missing part fails one route, not the ext.
// Author: Imperator_Aug (ARSENAL, ia-17c8c69a)
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const lib = require('../files/lib'), mf = require('../files/modfiles');
const names = require('../../../lib/names'), pak = require('../../../lib/pak'), games = require('../../../lib/games');

// listings (vdir, tree, vfind) have no file maximum: a big one is read in pages (PAGE_MAX = the largest page one ask may take; the
// answer then says where the next page starts)
const MAX_TEXT = 4 * 1024 * 1024, INBOX_CAP = 50, TAIL = 200, LOG_CAP = 500, PAGE_MAX = 50000;
const TEXT_ROOT = 'resource/interface/text/';

const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });
const Q = url => { const o = {}; if (url && url.searchParams) for (const [k, v] of url.searchParams) o[k] = v; return o; };
const stat = f => { try { return fs.statSync(f); } catch { return null; } };
const isFile = f => { const s = stat(f); return !!(s && s.isFile()); };
const isDir = f => { const s = stat(f); return !!(s && s.isDirectory()); };
const fwd = p => String(p).replace(/\\/g, '/');
const lc = s => String(s).toLowerCase();
const norm = p => lc(fwd(path.resolve(p))).replace(/\/+$/, '');
const inside = (p, root) => norm(p).startsWith(norm(root) + '/');

// ---------------------------------------------------------------- the page's game (tools/gui/gui.js ctx; brief game-parity)
// gidOf = 'as64' | 'mowas2' | 'goh' (nothing sent, or an older ctx with no gameId = 'as64', so AS64 stays as it was).
// exeOf = the vfs exe for MoW:AS2 and GoH, undefined for AS64 (the vfs then picks as64 first, as before).
// curDirOf = the install of the page's game: the GoH install under GoH (ctx.curDir, else ctx.gohDir), else the AS2 install.
const gidOf = ctx => { try { const g = ctx && typeof ctx.gameId === 'function' ? games.idOf(ctx.gameId()) : null; return g || 'as64'; } catch { return 'as64'; } };
const isGoh = ctx => gidOf(ctx) === 'goh';
function exeOf(ctx) {
  const g = gidOf(ctx);
  if (g === 'as64') return undefined;
  try { const e = ctx && typeof ctx.exe === 'function' ? games.exeOf(ctx.exe()) : null; return e || games.exeOf(g); } catch { return games.exeOf(g); }
}
function curDirOf(ctx) {
  if (!isGoh(ctx)) return lib.gameOf(ctx);
  try { return (typeof ctx.curDir === 'function' && ctx.curDir()) || (typeof ctx.gohDir === 'function' && ctx.gohDir()) || null; } catch { return null; }
}
// a cache or list key part: '' for AS64 (keys as before), else '<id>|'
const gkey = ctx => { const g = gidOf(ctx); return g === 'as64' ? '' : g + '|'; };

// a sibling part that is not there yet -> 501 with its name; any other throw -> its message, status kept or 500
function need(id, load) {
  try { return load(); } catch (e) {
    if (e && e.code === 'MODULE_NOT_FOUND') throw bad('This part of the editor is not built yet (' + id + ').', 501);
    throw bad(id + ' failed to load: ' + String((e && e.message) || e).split('\n')[0].slice(0, 400), 500);   // one line, never a stack
  }
}
function clean(e) {
  if (e && e.status) return e;
  return bad(String((e && e.message) || e || 'error').split('\n')[0].slice(0, 400), 500);
}
async function safe(fn) { try { return await fn(); } catch (e) { throw clean(e); } }
// JOBS (tools/gui/README.md "JOBS"): the name of this request in the job list (a language key of the Editor) and its page. more = a
// later page or slice of work that already has its row (a paged walk, the whole-mod check): that request is not listed again.
function jobSay(ctx, what, whatP, more) {
  const j = ctx && ctx.job;
  if (!j || typeof j.set !== 'function') return;
  try { j.set({ what, whatP: whatP || null }); j.page = 'ide'; if (more) j.hidden = true; } catch { /* the list only */ }
}
const offQ = q => Number(q && q.off) > 0;

// intel: tools/ide/intel.js (all three parts); while a part is missing, the parts that exist
let _intel = null;
function intel() {
  if (_intel) return _intel;
  try { _intel = require('../../../ide/intel'); return _intel; } catch (e) { if (!e || e.code !== 'MODULE_NOT_FOUND') throw clean(e); }
  const o = {};
  for (const p of ['check', 'nav', 'fixes']) { try { Object.assign(o, require('../../../ide/intel/' + p)); } catch (e) { if (!e || e.code !== 'MODULE_NOT_FOUND') throw clean(e); } }
  return o;   // not cached: picks up parts as they land
}
function fnOf(name) {
  const f = intel()[name];
  if (typeof f !== 'function') throw bad('This part of the editor is not built yet (intel ' + name + ').', 501);
  return f;
}
let _npp = null;
const npp = () => _npp || need('npp', () => require('../../../ide/npp'));
let _spawn = null, _plat = null;   // test hooks: fake spawn, platform name for lib/platform
// lib/platform options: real launcher by default; with the test spawn, the same argv goes to the fake (detached, no shell)
function platOpt() {
  const o = {};
  if (_plat) o.platform = _plat;
  if (_spawn) o.spawn = (file, args, so) => {
    const ch = _spawn(file, args, Object.assign({}, so, { shell: false, detached: true }));
    if (ch && ch.on) ch.on('error', () => {});
    if (ch && ch.unref) ch.unref();
    return ch || { error: new Error('could not start ' + file) };
  };
  return o;
}
const platform = () => require('../../../lib/platform');
let _nppOpts = {};   // test hook: fake settingsDir / exe

// ---------------------------------------------------------------- inputs
const posInt = (v, what, def) => {
  if ((v === undefined || v === null || v === '') && def !== undefined) return def;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 1e7) throw bad(what + ': a whole number from 1 is needed');
  return n;
};
const absFile = (v, what) => {
  if (typeof v !== 'string' || !v || v.length > 1024 || /\0/.test(v) || !path.isAbsolute(v)) throw bad(what + ': a full file path is needed');
  return path.resolve(v);
};
const textOf = body => {
  const t = body.text;
  if (typeof t !== 'string') throw bad('text: the editor text is missing');
  if (t.length > MAX_TEXT) throw bad('text: over 4 MB, too big to check here', 413);
  return t.replace(/\r\n?/g, '\n');
};
const keyNorm = k => {
  if (typeof k !== 'string' || !k || k.length > 512 || /\0/.test(k)) throw bad('key: a game file name like resource/set/x.set is needed');
  let n = names.normalize(k).replace(/^\.?\/+/, '');
  if (!n.startsWith('resource/')) n = 'resource/' + n;
  if (n.split('/').some(x => x === '..')) throw bad('key: ".." is not allowed');
  return n;
};
// key of an entry inside one of my mod's paks (same rule as files/lib tree)
function pakKey(pr, entry) {
  if (pr.includes('/')) return null;
  const base = /\.pat$/i.test(pr) || /^resource\.pak$/i.test(pr) ? 'resource/' : /^localization\.pak$/i.test(pr) ? TEXT_ROOT : null;
  return base ? base + names.zipEntryName(entry) : null;
}
function pakEntry(mod, rel) {
  const i = rel.indexOf('::'), pr = rel.slice(0, i), entry = rel.slice(i + 2);
  if (!/\.(pak|pat)$/i.test(pr) || !entry) throw bad('file: not a pak in your mod');
  const pf = path.join(mod, ...pr.split(/[\\/]/).filter(Boolean));
  if (!inside(pf, mod) || !isFile(pf)) throw bad('file: not a pak in your mod', 404);
  return { pf, pr, entry, key: pakKey(pr, entry) };
}

// ---------------------------------------------------------------- refs -> doc + ictx
// CACHE (gui README, contract 1): the game stamp of the page's game ('' with no game folder)
function gameStamp(ctx) {
  const g = curDirOf(ctx);
  if (!g) return '';
  try { return mf.kit(ctx).gv.stamp({ gameDir: g, gid: gidOf(ctx) }); } catch { return ''; }
}
const _mods = new Map();   // mod -> {sig, mods}; modsFor builds the game index, so its answer is kept while what it is read from stays
// what the mod list is read from: the profile's mod list, the game (gameview stamp), the mod's own mod.info and which mods are installed
function modsSig(ctx, mod) {
  const sm = f => { const s = stat(f); return s ? s.size + ':' + s.mtimeMs : '-'; };
  let prof = ''; try { prof = lib.profileSig(ctx); } catch { prof = ''; }
  const g = curDirOf(ctx);
  return [prof, gameStamp(ctx), sm(path.join(mod, 'mod.info')), g ? sm(path.join(g, 'mods')) : ''].join('|');
}
// The list is also kept in the shared store (section 'ide.mods', parts {game, gid, mod}, stamp src = modsSig), so the first hover
// after a restart does not build the game view for it. modsPeek = the kept answer or null, never a build (the Prepare state).
const MODS_SEC = 'ide.mods', MODS_VER = 1;
const modsParts = (ctx, mod) => ({ game: curDirOf(ctx) ? norm(curDirOf(ctx)) : '', gid: gidOf(ctx), mod: norm(mod) });
function modsPeek(ctx, mod) {
  const g = curDirOf(ctx) || '', k = gkey(ctx) + norm(mod) + '|' + g, c = _mods.get(k), sig = modsSig(ctx, mod);
  if (c && c.sig === sig) return c.mods.slice();
  try {
    const hit = mf.kit(ctx).S.get(MODS_SEC, MODS_VER, modsParts(ctx, mod), { src: sig });
    if (hit && Array.isArray(hit.value)) { _mods.delete(k); _mods.set(k, { sig, mods: hit.value.map(String) }); return hit.value.map(String); }
  } catch { /* asked again below */ }
  return null;
}
function modsCached(ctx, mod) {
  const g = curDirOf(ctx) || '', k = gkey(ctx) + norm(mod) + '|' + g;   // one answer per game: AS64 and MoW:AS2 share the folder
  const kept = modsPeek(ctx, mod);
  if (kept) return kept;
  const sig = modsSig(ctx, mod);
  let mods = [], good = true; try { mods = lib.modsFor(ctx, mod); } catch (e) { if (e && e.status) throw e; mods = []; good = false; }
  if (good && curDirOf(ctx)) { try { mf.kit(ctx).S.put(MODS_SEC, MODS_VER, modsParts(ctx, mod), { src: sig }, mods); } catch { /* memory only */ } }
  _mods.delete(k); _mods.set(k, { sig, mods });
  if (_mods.size > 16) _mods.delete(_mods.keys().next().value);
  return mods.slice();
}
// ictx.vfs: the layered file view (tools/lib/vfs build: .files Map key -> rec) for this mod + game, or null. Lazy: built on first
// read only (files/lib keeps it 60 s), then kept on this ictx; any throw inside gives null.
// MoW:AS2 and GoH: ictx.exe (the vfs exe: 'mowas_2' | 'goh') and ictx.game (the id) go to tools/ide/intel, which hands exe to every
// vfs.build, entityindex and sdlset call; gameDir is the page's game install (the GoH install under GoH: keylint takes vocab.goh.json
// from it). AS64: neither field, gameDir the AS2 install, as before.
function ictxOf(ctx, mod) {
  const o = { gameDir: curDirOf(ctx) || undefined, mods: mod ? modsCached(ctx, mod) : [], folder: mod || undefined };
  const exe = exeOf(ctx);
  if (exe) { o.exe = exe; o.game = gidOf(ctx); }
  // CACHE: the shared store and walk of this server, for tools/ide/intel (not enumerable: the context stays plain data)
  try { const k = mf.kit(ctx); Object.defineProperty(o, 'shared', { value: { cache: k.S, modtree: k.mt, gameview: k.gv }, enumerable: false }); } catch { /* intel then uses the modules itself */ }
  let done = false, val = null;
  Object.defineProperty(o, 'vfs', {
    enumerable: true, configurable: true,
    get() {
      if (done) return val;
      done = true;
      try { val = lib.vfsFor(ctx, mod || null).v || null; } catch { val = null; }   // no mod: the game as it ships (files/lib vfsFor)
      return val;
    },
  });
  return o;
}
// {mod, rel} | {mod?, key, idx} | {mod, path} -> {key, file, mod, kind:'rel'|'pak'|'layer'|'path', ...}. The key form (a layer of the
// game, read only) works with no mod: the game as it ships (files/lib readMod: a game folder is needed, a phone must be shown it)
function refOf(ctx, body, needMod = true, read = false) {   // read: a read route (lint, hover, ...): files/lib read zones (GoH mods folder passes)
  body = body || {};
  let mod = null;
  const hasKey = body.key !== undefined && body.key !== null && body.key !== '';
  if (body.mod !== undefined && body.mod !== null && body.mod !== '') mod = lib.checkMod(ctx, body.mod, { read });
  else if (hasKey && !(typeof body.rel === 'string' && body.rel)) mod = lib.readMod(ctx, '');
  else if (needMod || !body.path) throw bad('Pick your mod folder first (Mods page).');
  if (typeof body.rel === 'string' && body.rel) {
    if (!mod) throw bad('Pick your mod folder first (Mods page).');   // a file of the mod needs the mod
    if (body.rel.includes('::')) { const p = pakEntry(mod, body.rel); return { kind: 'pak', mod, key: p.key, file: null, rel: body.rel, pak: p }; }
    const t = lib.target(mod, body.rel);
    return { kind: 'rel', mod, key: lib.keyOf(t.rel), file: t.f, rel: t.rel };
  }
  if (body.key !== undefined && body.key !== null && body.key !== '') {
    const key = keyNorm(body.key), idx = Number(body.idx);
    if (!Number.isInteger(idx) || idx < 0 || idx > 1e5) throw bad('idx: pick a layer from the list');
    return { kind: 'layer', mod, key, idx, file: null };
  }
  if (body.path) {
    const f = absFile(body.path, 'path');
    if (mod && inside(f, mod)) return refOf(ctx, { mod, rel: fwd(path.relative(mod, f)) });
    return { kind: 'path', mod, key: null, file: f };
  }
  throw bad('Open a file first: rel, key or path is needed.');
}
// disk = true (hover, def, refs, symbols): a saved doc may send only its ref; the text is then read here with the open route's own
// reader (same 2 MB and binary limits), so the page does not post the whole file on every hover. lint always needs the buffer.
function diskText(ctx, r) {
  const q = r.kind === 'layer' ? { mod: r.mod, key: r.key, idx: r.idx } : r.kind === 'path' ? { mod: r.mod || undefined, path: r.file } : { mod: r.mod, rel: r.rel };
  return String(lib.openFile(ctx, q).text || '');
}
function docOf(ctx, body, needText = true, disk = false) {
  const r = refOf(ctx, body, true, true);
  const doc = { key: r.key || null, text: disk && typeof body.text !== 'string' ? diskText(ctx, r) : needText ? textOf(body) : (typeof body.text === 'string' ? textOf(body) : '') };
  if (r.file) doc.file = r.file;
  return { doc, ictx: ictxOf(ctx, r.mod), mod: r.mod, ref: r };
}
const posOf = body => ({ line: posInt(body.line, 'line'), col: posInt(body.col, 'col') });

// ---------------------------------------------------------------- vdir
const _sorted = new WeakMap();   // vfs object -> sorted key array
function sortedKeys(v) {
  let a = _sorted.get(v);
  if (!a) { a = Array.from(v.files.keys()).sort(); _sorted.set(v, a); }
  return a;
}
function lowerBound(a, s) { let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < s) lo = m + 1; else hi = m; } return lo; }

// ---------------------------------------------------------------- listings in pages (vdir, vfind, tree)
// No listing stops at a file count. A caller that sends `lim` gets one page: `off` (where it starts), `next` (where the next page
// starts, null on the last one), `total` (every row of the whole list; null while the tree walk still runs) and `ver` (the stamp of
// the list). The list is read once and kept a short while under its stamp; a page asked with the stamp comes from that same list, so
// the order stays stable while the pages are read. A stamp that is gone (dropped, or older than LIST_TTL) gives a list read again with
// a new stamp: the caller sees `ver` change and starts again from 0. A caller without `lim` gets the whole list in one answer.
// The store drops the list used least lately, never a tree walk still running nor a list asked for in the last LIST_BUSY ms (so a
// long read is not thrown away by other folders or filter words asked meanwhile); past LIST_HARD lists it drops the oldest anyway.
const LIST_KEEP = 8, LIST_HARD = 32, LIST_TTL = 120000, LIST_BUSY = 10000;
const _lists = new Map();   // ver -> list { ver, t, sig, done? }; Map order = least lately used first
let _verN = 0;
function dropList(ver) { const o = _lists.get(ver); if (o && o.done === false) o.dead = true; _lists.delete(ver); }
function keepList(o) {
  o.ver = (++_verN).toString(36) + '.' + Date.now().toString(36);
  o.t = Date.now();
  _lists.set(o.ver, o);
  const t = Date.now();
  for (const [v, x] of _lists) {
    if (_lists.size <= LIST_KEEP) break;
    if (x !== o && x.done !== false && t - x.t > LIST_BUSY) _lists.delete(v);
  }
  while (_lists.size > LIST_HARD) dropList(_lists.keys().next().value);
  return o;
}
function listOf(ver, sig) {
  const o = ver ? _lists.get(ver) : null;
  if (!o || o.sig !== sig) return null;
  if (o.done !== false && Date.now() - o.t > LIST_TTL) { _lists.delete(ver); return null; }
  o.t = Date.now();
  _lists.delete(ver); _lists.set(ver, o);   // used now: last to be dropped
  return o;
}
function pageQ(q) {
  const off = q.off === undefined || q.off === null || q.off === '' ? 0 : Number(q.off);
  if (!Number.isInteger(off) || off < 0 || off > 1e9) throw bad('off: a whole number from 0 is needed');
  let lim = null;
  if (q.lim !== undefined && q.lim !== null && q.lim !== '') {
    lim = Number(q.lim);
    if (!Number.isInteger(lim) || lim < 1) throw bad('lim: a whole number from 1 is needed');
    lim = Math.min(lim, PAGE_MAX);
  }
  return { off: lim ? off : 0, lim, ver: typeof q.ver === 'string' && q.ver ? q.ver.slice(0, 40) : null };
}
// one page of a row array: { rows, off, next }
function pageOf(all, pq) {
  if (!pq.lim) return { rows: all, off: 0, next: null };
  const a = Math.min(pq.off, all.length), b = Math.min(all.length, a + pq.lim);
  return { rows: all.slice(a, b), off: a, next: b < all.length ? b : null };
}
const dirQ = d => {
  d = String(d || '');
  if (d.length > 400 || /[\0:*?"<>|]/.test(d)) throw bad('dir: a folder of the game like set/multiplayer is needed');
  const parts = names.normalize(d).split('/').filter(Boolean);
  if (parts.some(x => x === '..' || x === '.')) throw bad('dir: ".." is not allowed');
  if (parts[0] === 'resource') parts.shift();
  return parts;
};
// the loose files of a mod outside the game folder (not in the index): key -> file on disk. No size here:
// a stat per file of a big mod takes seconds; the sizes are read only for the rows of the page answered (sizeOf).
// CACHE: taken from the shared walk of the mod (files/modfiles loose: lib/modtree, fresh by its signature, no walk here). Only
// before the first walk of this process has ended is the folder read here, once; that list is dropped when the walk is there.
const _loose = new Map();
const sizeOf = f => { const st = stat(f); return st ? st.size : null; };
function looseOf(ctx, mod) {
  const k = norm(mod);
  let shared = null; try { shared = mf.loose(ctx, mod); } catch { shared = null; }
  if (shared) {
    _loose.delete(k);
    try { lib.remoteRead(ctx, path.join(mod, 'resource')); } catch { return new Map(); }   // a phone: only folders the PC page shows
    return shared;
  }
  const c = _loose.get(k);
  if (c) return c.m;
  const m = new Map(), root = path.join(mod, 'resource');
  const walk = (d, pre) => {
    let ents = []; try { lib.remoteRead(ctx, d); ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const nm = names.normalize(e.name);
      if (e.isDirectory()) walk(path.join(d, e.name), pre + nm + '/');
      else if (e.isFile()) m.set(pre + nm, path.join(d, e.name));
    }
  };
  walk(root, 'resource/');
  _loose.set(k, { t: Date.now(), m });
  if (_loose.size > 4) _loose.delete(_loose.keys().next().value);
  return m;
}
// the whole folder: { dirs:[name], files:[row] } (dirs and files each sorted by name)
// (merged) the game's own copy of a key: { at, rec } or null. under = a mod: null too when the mod has its own copy (a layer of the
// mod in the chain, or a loose file of a mod outside the game folder), so the "My mod" list shows only the game files it does not change
function vanAt(cv, k, under) {
  const ch = cv.v.chain(k);
  if (under && (under.loose && under.loose.has(k) || ch.some(r => !r.deleted && lib.kindOf(r, cv) === 'mine'))) return null;
  for (let j = ch.length - 1; j >= 0; j--) if (!ch[j].deleted && lib.kindOf(ch[j], cv) === 'vanilla') return { at: j, rec: ch[j] };
  return null;
}
const pakName = rec => (rec && rec.source === 'pak' && rec.container ? path.basename(String(rec.container)) : null);
const vanRow = (name, k, v) => ({ name, key: k, where: 'vanilla', layer: v.rec.layer, size: v.rec.size == null ? null : v.rec.size, idx: v.at, pak: pakName(v.rec) });
const underOf = (ctx, mod, cv, q) => ((q.under === '1' || q.under === 'true') && mod ? { loose: cv.inMods ? null : looseOf(ctx, mod) } : null);
function vdirList(ctx, mod, cv, parts, vanilla, under) {
  const dir = parts.join('/'), prefix = 'resource/' + (dir ? dir + '/' : '');
  const keys = sortedKeys(cv.v), dirs = new Set(), files = [];
  let i = lowerBound(keys, prefix);
  while (i < keys.length && keys[i].startsWith(prefix)) {
    const rest = keys[i].slice(prefix.length), sl = rest.indexOf('/');
    if (sl >= 0) { const d = rest.slice(0, sl); dirs.add(d); i = lowerBound(keys, prefix + d + '0'); continue; }   // '0' sorts right after '/'
    if (vanilla) {   // the game's own copy of the file, whatever a mod puts on top of it; files only mods have are left out
      const v = vanAt(cv, keys[i], under);
      if (v) files.push(vanRow(rest, keys[i], v));
      i++; continue;
    }
    const rec = cv.v.files.get(keys[i]);
    files.push({ name: rest, key: keys[i], where: lib.kindOf(rec, cv), layer: rec.layer, size: rec.size == null ? null : rec.size });
    i++;
  }
  // a mod outside the game folder is not in the index: its loose files are shown on top, as files/lib chainFor does
  if (!vanilla && mod && !cv.inMods) {
    const local = path.join(mod, 'resource', ...parts);
    let ents = []; try { lib.remoteRead(ctx, local); ents = fs.readdirSync(local, { withFileTypes: true }); } catch { /* none, or a phone and a link out of the folders the PC page shows */ }
    const at = new Map(); files.forEach((f, j) => at.set(f.key, j));
    for (const e of ents) {
      const nm = names.normalize(e.name);
      if (e.isDirectory()) { dirs.add(nm); continue; }
      if (!e.isFile()) continue;
      const k = prefix + nm, row = { name: nm, key: k, where: 'mine', layer: 'this mod', size: null, _f: path.join(local, e.name) };   // size: per page (vdir)
      if (at.has(k)) files[at.get(k)] = row; else { at.set(k, files.length); files.push(row); }
    }
  }
  return { dirs: [...dirs].sort(), files: files.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) };
}
// GET vdir?mod=&dir=[&vanilla=1[&under=1]][&off=&lim=&ver=] -> { dir, dirs, files, truncated:false, total, off, next, ver?, notes? }
// vanilla rows carry idx (the layer) and pak (the game pak's file name, null for a loose game file). under=1 (with vanilla and a mod):
// only the game files the mod has no copy of (the "My mod" list with game files shown).
// The rows of the folder are its dirs, then its files; a page is a run of those rows (dirs part first).
function vdir(ctx, q) {
  const mod = lib.readMod(ctx, q.mod);   // null: no mod, the game as it ships
  const parts = dirQ(q.dir), dir = parts.join('/'), pq = pageQ(q);
  const vanilla = q.vanilla === '1' || q.vanilla === 'true';
  const cv = lib.vfsFor(ctx, mod);
  if (!cv.v) return { dir, dirs: [], files: [], truncated: false, total: 0, off: 0, next: null, notes: cv.notes };
  const under = vanilla ? underOf(ctx, mod, cv, q) : null;
  const sig = gkey(ctx) + 'vdir|' + (mod ? norm(mod) : '') + '|' + dir + '|' + (vanilla ? 1 : 0) + (under ? 'u' : '');
  let L = pq.lim ? listOf(pq.ver, sig) : null;
  if (L && L.v !== cv.v) L = null;   // the game view was built again: read the folder again
  if (!L) { L = Object.assign({ sig, v: cv.v }, vdirList(ctx, mod, cv, parts, vanilla, under)); if (pq.lim) keepList(L); }
  const nd = L.dirs.length, total = nd + L.files.length;
  const out = { dir, dirs: L.dirs, files: L.files, truncated: false, total, off: 0, next: null };
  if (pq.lim) {
    const a = Math.min(pq.off, total), b = Math.min(total, a + pq.lim);
    Object.assign(out, { dirs: L.dirs.slice(Math.min(a, nd), Math.min(b, nd)), files: L.files.slice(Math.max(0, a - nd), Math.max(0, b - nd)), off: a, next: b < total ? b : null, ver: L.ver });
  }
  // a loose file of a mod outside the game folder gets its size here, for the rows of this answer only (copies: the kept list stays as is)
  out.files = out.files.map(f => {
    if (!f._f) return f;
    const { _f, ...r } = f;
    r.size = sizeOf(_f);
    return r;
  });
  if (cv.notes && cv.notes.length) out.notes = cv.notes;
  return out;
}
// GET vfind?mod=&q=[&vanilla=1[&under=1]][&off=&lim=&ver=] -> { q, hits:[{ name, key, where, layer, size, idx?, pak? }], total, off, next, ver?, truncated:false, notes? }
// Every file of the game view whose path under resource/ holds q (case does not matter), in key order. name = that path. The rows of a
// page are made only for that page.
function vfind(ctx, q) {
  const mod = lib.readMod(ctx, q.mod);
  const w = names.normalize(String(q.q || '')).replace(/\/{2,}/g, '/').replace(/^\/+/, '').replace(/^resource\//, '');
  if (!w || w.length > 200 || /\0/.test(w)) throw bad('q: 1 to 200 characters of a file path are needed');
  const pq = pageQ(q), vanilla = q.vanilla === '1' || q.vanilla === 'true';
  const cv = lib.vfsFor(ctx, mod);
  if (!cv.v) return { q: w, hits: [], total: 0, off: 0, next: null, truncated: false, notes: cv.notes };
  const under = vanilla ? underOf(ctx, mod, cv, q) : null;
  const sig = gkey(ctx) + 'vfind|' + (mod ? norm(mod) : '') + '|' + (vanilla ? 1 : 0) + (under ? 'u' : '') + '|' + w;
  let L = pq.lim ? listOf(pq.ver, sig) : null;
  if (L && L.v !== cv.v) L = null;
  if (!L) {
    const keys = sortedKeys(cv.v), hits = [];
    const loose = !vanilla && mod && !cv.inMods ? looseOf(ctx, mod) : null;
    let i = lowerBound(keys, 'resource/');
    for (; i < keys.length && keys[i].startsWith('resource/'); i++) {
      const k = keys[i];
      if (k.indexOf(w, 9) < 0) continue;
      if (vanilla) {
        const v = vanAt(cv, k, under);
        if (v) hits.push({ k, v });
        continue;
      }
      hits.push(k);
    }
    if (loose) { let more = false; for (const k of loose.keys()) if (k.indexOf(w, 9) >= 0 && !cv.v.files.has(k)) { hits.push(k); more = true; } if (more) hits.sort(); }
    L = { sig, v: cv.v, cv, hits, loose, vanilla };
    if (pq.lim) keepList(L);
  }
  const row = h => {
    if (L.vanilla) return vanRow(h.k.slice(9), h.k, h.v);
    if (L.loose && L.loose.has(h)) return { name: h.slice(9), key: h, where: 'mine', layer: 'this mod', size: sizeOf(L.loose.get(h)) };
    const rec = cv.v.files.get(h);
    return { name: h.slice(9), key: h, where: lib.kindOf(rec, cv), layer: rec.layer, size: rec.size == null ? null : rec.size };
  };
  const p = pageOf(L.hits, pq);
  const out = { q: w, hits: p.rows.map(row), total: L.hits.length, off: p.off, next: p.next, truncated: false };
  if (pq.lim) out.ver = L.ver;
  if (cv.notes && cv.notes.length) out.notes = cv.notes;
  return out;
}
// GET tree?mod=[&off=&lim=&ver=] -> the files/tree answer with no file maximum, read in pages:
//   { mod, files:[{ rel, size, state, key }], total (null while the walk runs), off, next, ver, done, unread, partial?, error?,
//     truncated:false, notes, game, undo }
// Same rows and order as files/lib tree (folders by name, depth first; a pak's entries right after the pak). The walk runs in slices
// (the server stays free) and a page is answered as soon as its rows are there, so the first rows come before the walk ends.
// unread = folders or paks that could not be read (their files are missing). Without lim: waits for the whole walk.
const TREE_IDLE = 10000;
const nextTick = () => new Promise(r => setImmediate(r));
function wake(job) {
  const ws = job.waits; job.waits = [];
  for (const w of ws) { if (job.done || job.rows.length >= w.need) w.res(); else job.waits.push(w); }
}
function until(job, need) { return job.done || job.rows.length >= need ? Promise.resolve() : new Promise(res => job.waits.push({ need, res })); }
// CACHE (gui README, contract 1): no walk here. The file list is the shared walk of the mod (lib/modtree), a pak's entries and the
// finished rows are kept in the shared store (files/modfiles: 'ide.pak' by the pak's size and time, 'ide.tree' with the stamps game +
// mod:all), so a second look, also after a restart, builds neither the game view nor the rows. The view is asked for only on a miss.
// opt.maxAgeMs: how old the shared walk may be (the page: 5 s, so a file made outside the GUI shows on the next look).
function treeJob(ctx, mod, sig, opt) {
  const job = keepList({ sig, rows: [], done: false, unread: 0, err: null, waits: [], notes: [], game: null, started: Date.now() });
  let since = Date.now();
  // a walk nobody reads any more stops: dropped from the store (dead), or no page asked and no one waiting for TREE_IDLE ms
  // (the page asks the next page as soon as one comes, so a reader keeps job.t fresh)
  const tick = async () => {
    if (Date.now() - since < 15) return;
    if (job.dead || (!job.waits.length && Date.now() - job.t > TREE_IDLE)) throw new Error('The list was not read to the end: nobody asked for it any more.');
    wake(job); await nextTick(); since = Date.now();
  };
  // the rows are all there: the page is answered; job.stored ends when the store has them too (the Prepare section waits for that)
  const end = () => { if (job.done) return; job.done = true; job.t = Date.now(); wake(job); };
  job.stored = (async () => {
    await nextTick();
    return await mf.tree(ctx, mod, {
      rows: job.rows, tick, maxAgeMs: opt && opt.maxAgeMs,
      view: () => lib.vfsForAsync(ctx, mod),
      onHead: h => { job.notes = h.notes; job.game = h.game; },
      onRows: r => { job.unread = r.unread; end(); },
    });
  })().catch(e => { job.err = e; return null; }).then(r => { end(); return r; });
  return job;
}
async function treeRoute(ctx, q) {
  const mod = lib.checkMod(ctx, q.mod, { read: true }), pq = pageQ(q), sig = gkey(ctx) + 'tree|' + norm(mod);
  let job = listOf(pq.ver, sig);
  if (!job && !pq.off) {   // two first asks at once share one walk
    for (const o of _lists.values()) if (o.sig === sig && !o.done && !o.dead && Date.now() - o.started < 1500) job = o;
  }
  if (!job) job = treeJob(ctx, mod, sig, { maxAgeMs: 5000 });
  await until(job, pq.lim ? pq.off + pq.lim : Infinity);
  job.t = Date.now();
  if (job.err && !job.rows.length) throw clean(job.err);
  const files = pq.lim ? job.rows.slice(pq.off, pq.off + pq.lim) : job.rows.slice();
  const off = pq.lim ? Math.min(pq.off, job.rows.length) : 0, end = off + files.length;
  const last = job.done && end >= job.rows.length;
  const out = { mod, files, total: job.done ? job.rows.length : null, off, next: last ? null : end, ver: job.ver, done: last, unread: job.unread, truncated: false,
    notes: job.notes, game: job.game, undo: lib.undoRoot(mod) };
  if (job.err) { out.partial = 'error'; out.error = String(job.err.message || job.err).split('\n')[0].slice(0, 300); }
  return treeBytes(job, out, off);
}
// PERF A4: the answer carries its own JSON text as bytes (out.__json: not enumerable, made only when the server asks for it; the
// server writes them instead of stringifying the answer). They equal JSON.stringify(out): head + rows + tail in the key order of out.
// The rows of a finished list are final, so the JSON text of a page of it is kept beside the list (it goes when the list goes) and a
// page asked again is not stringified again. Pages of a list still being walked are not kept.
const TREE_JB_MAX = 64 << 20;   // kept row text per list, bytes
function treeBytes(job, out, off) {
  const fin = job.done === true;
  let buf = null;
  Object.defineProperty(out, '__json', { enumerable: false, configurable: true, get() {
    if (buf) return buf;
    const rest = Object.assign({}, out); delete rest.mod; delete rest.files;
    const tail = JSON.stringify(rest);
    if (typeof out.mod !== 'string' || !Array.isArray(out.files) || tail === '{}') return (buf = Buffer.from(JSON.stringify(out), 'utf8'));
    const k = off + ':' + out.files.length;
    let rows = fin && job.jb ? job.jb.get(k) : null;
    if (!rows) {
      rows = Buffer.from(JSON.stringify(out.files), 'utf8');
      if (fin && (job.jbN || 0) + rows.length <= TREE_JB_MAX) { (job.jb || (job.jb = new Map())).set(k, rows); job.jbN = (job.jbN || 0) + rows.length; }
    }
    return (buf = Buffer.concat([Buffer.from('{"mod":' + JSON.stringify(out.mod) + ',"files":', 'utf8'), rows, Buffer.from(',' + tail.slice(1), 'utf8')]));
  } });
  return out;
}

// ---------------------------------------------------------------- copies: the same file everywhere
// Every copy of one game path: the layers the game loads for this mod (vanilla, the active mods, mine; pak entries too), then the
// loose copy in each mod that is installed but not loaded: folders of <game>/mods and of the Steam Workshop folder beside the
// game's library (<library>/steamapps/workshop/content/<app id>). Paks of mods that are not loaded are not opened.
//   -> { key, copies:[{ label, kind:'mine'|'othermod'|'vanilla'|'off', where, winner, active, ref:{key,idx}|{rel}|{path} }], truncated }
// Every copy is listed, however many mods hold one (truncated stays false; kept for older callers).
function modTitle(dir) {
  try { const m = /\{\s*name\s+"([^"]{1,80})"/i.exec(fs.readFileSync(path.join(dir, 'mod.info'), 'latin1').slice(0, 4000)); return m ? m[1] : null; } catch { return null; }
}
function copies(ctx, q) {
  const mod = lib.readMod(ctx, q.mod), w = lib.which(ctx, { mod, key: q.key, rel: q.rel });   // null: no mod, the game alone
  if (!w.key) throw bad('The game does not read this file, so other mods have no copy of it.');
  const out = [], seen = new Set(mod ? [norm(mod)] : []), ci = require('../../../lib/cipath'), ciOpt = { cache: new Map() };
  for (const r of w.chain) {
    if (r.kind === 'deleted' || r.source === 'deleted') continue;
    const cont = String(r.container || '').replace(/[\\/]+$/, '');
    let ref = { key: w.key, idx: r.idx };
    if (mod && r.kind === 'mine' && r.source === 'loose' && cont && (norm(cont) === norm(mod) || inside(cont, mod))) {
      const f = path.join(cont, ...fwd(r.entry).split('/').filter(Boolean));
      if (isFile(f)) ref = { rel: fwd(path.relative(mod, f)) };
    }
    if (r.source === 'loose' && cont) { let d = cont; for (let i = 0; i < 2 && d; i++) { seen.add(norm(d)); d = path.dirname(d); } }   // the mod folder holds resource/ or is the container itself
    out.push({ label: r.kind === 'vanilla' ? 'vanilla' : r.kind === 'mine' ? path.basename(mod) : r.layer, kind: r.kind, where: cont + (r.source === 'pak' ? ' :: ' : ' / ') + String(r.entry || '').replace(/^[\\/]+/, ''), winner: !!r.winner, active: true, ref });
  }
  const loaded = new Set(w.chain.map(r => lc(String(r.layer).replace(/ patch \d+$/, ''))));
  // GoH (GHVFS-24 [V]): the GoH install's mods folder and Workshop app 400750 (lib/gamedir GOH_APPID); a Workshop item folder is the
  // item number and the game names that mod mod_<item>. A mod's text sits under localizations/<code>/interface/text/ (GHLOC-01 [V]):
  // the default language's folder is looked at. MoW:AS2: the same folders as AS64 (one install, one Workshop app).
  const goh = isGoh(ctx);
  const game = goh ? curDirOf(ctx) : ctx.game && (() => { try { return ctx.game(); } catch { return null; } })();
  const rels = !w.key.startsWith(TEXT_ROOT) ? [w.key]
    : goh ? ['localizations/default/' + w.key.slice('resource/'.length), w.key] : ['localization/' + w.key.slice(TEXT_ROOT.length), w.key];
  const roots = [];
  if (game) {
    roots.push({ dir: path.join(game, 'mods'), ws: false });
    try { const gd = require('../../../lib/gamedir'); roots.push({ dir: path.join(path.resolve(game, '..', '..'), 'workshop', 'content', String(goh ? gd.GOH_APPID : gd.APPID)), ws: goh }); } catch { /* no app id: game mods only */ }
  }
  const truncated = false;
  for (const { dir: root, ws } of roots) {
    let ds = []; try { ds = fs.readdirSync(root, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name).sort(); } catch { continue; }
    for (const n of ds) {
      const dir = path.join(root, n);
      if (seen.has(norm(dir)) || loaded.has(lc(n)) || (ws && loaded.has('mod_' + lc(n)))) continue;
      let f = null; for (const rel of rels) { f = ci.resolve(dir, rel, ciOpt); if (f && isFile(f)) break; f = null; }
      if (!f) continue;
      const t = modTitle(dir), id = ws ? 'mod_' + n : n;
      out.push({ label: t && lc(t) !== lc(id) ? t + ' (' + id + ')' : id, kind: 'off', where: fwd(f), winner: false, active: false, ref: { path: f } });
    }
  }
  return { key: w.key, copies: out, truncated, game: !!game };
}

// ---------------------------------------------------------------- log
const toKey = p => { p = lc(fwd(p)); const i = p.indexOf('/resource/'); if (i >= 0) return p.slice(i + 1); if (p.startsWith('resource/')) return p; return 'resource/' + p.replace(/^\/+/, ''); };
function resolveKey(cv, p) {
  if (!p || !/\.[a-z0-9_]+$/i.test(p)) return null;
  const k = toKey(p);
  if (!cv || !cv.v) return k;
  if (cv.v.files.has(k)) return k;
  const base = '/' + k.split('/').pop();          // a bare file name: the one key that ends with it
  let hit = null;
  for (const key of sortedKeys(cv.v)) if (key.endsWith(base)) { if (hit) return null; hit = key; }
  return hit;
}
function tailOf(file) {
  const st = stat(file); if (!st) return [];
  const len = Math.min(st.size, 512 * 1024), fd = fs.openSync(file, 'r'), b = Buffer.alloc(len);
  try { fs.readSync(fd, b, 0, len, st.size - len); } finally { fs.closeSync(fd); }
  let lines;
  try { lines = lib.decodeBuf(b).lines.map(l => l.t); } catch { lines = b.toString('latin1').split(/\r?\n/); }
  if (len < st.size) lines.shift();                // first line is cut
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines.slice(-TAIL);
}
let _logsLoad = () => require('../logs/routes');   // test hook: _setLogs
async function logRoute(ctx, q) {
  const empty = why => ({ file: null, time: null, findings: [], tail: [], why });
  const goh = isGoh(ctx);
  if (!curDirOf(ctx)) return empty('nogame');
  let newest = null;
  // the logs ext's find(url, ctx) reads the page's game from ctx (logs/routes gidOf): the AS2 user folders for AS64 and MoW:AS2,
  // the GoH user folder under GoH (its answer then says game 'goh')
  let logs = null;
  try { logs = _logsLoad(); } catch (e) { if (!(e && e.code === 'MODULE_NOT_FOUND')) throw bad('logs ext failed to load: ' + (e && e.message), 500); logs = null; }
  const found = () => { try { return logs && typeof logs.find === 'function' ? logs.find(null, ctx) : null; } catch { return null; } };
  if (goh) {
    // GoH writes its own game.log in its user folder (GHVFS-13 [V]: Documents/My Games/Gates of Hell, or LocalAppData
    // digitalmindsoft/gates of hell). The AS2 log folder is never read for GoH: a logs answer is taken only when it says game 'goh',
    // else lib/userdir gohLogDir is read here. One user folder, no instances.
    const r = found();
    if (r && r.game === 'goh') newest = r.newest || null;
    else {
      let d = null; try { d = require('../../../lib/userdir').gohLogDir(process.env.AS2_HOME ? { home: process.env.AS2_HOME, env: { LOCALAPPDATA: path.join(process.env.AS2_HOME, 'AppData', 'Local') }, readReg: () => null } : {}); } catch { d = null; }   // options as logs/routes gohOpt: under tests the LocalAppData fallback stays in AS2_HOME
      const f = d && path.join(d, 'game.log'), st = f && stat(f);
      if (st && st.isFile()) newest = { path: f, mtimeMs: st.mtimeMs };
    }
  } else {
    if (!logs || typeof logs.find !== 'function') return empty('nologs');
    const r = found(); newest = r ? r.newest : null;
  }
  if (!newest || !isFile(newest.path)) return empty('nolog');
  const file = newest.path;
  let cv = null;
  if (q.mod) { const mod = lib.checkMod(ctx, q.mod, { read: true }); cv = lib.vfsFor(ctx, mod); }
  const lt = need('logtriage', () => require('../../../logtriage/logtriage'));
  const exe = exeOf(ctx);
  const { rep, sink } = lt.check(exe ? { target: file, keep: 1, exe } : { target: file, keep: 1 });
  const L = lt.parseLog(file);
  const evAt = new Map(); for (const ev of L.events) { let a = evAt.get(ev.line); if (!a) evAt.set(ev.line, a = []); a.push(ev); }
  const exAt = new Map(); for (const ex of L.exceptions) exAt.set(ex.line, ex);
  const grp = new Map(); for (const g of sink.groups) grp.set(g.line + '|' + g.code, g);
  const j = rep.toJSON({ tool: 'logtriage', limits: false });
  const linkOf = (line, g) => {
    let p = null, n = 0;
    const ex = exAt.get(line);
    if (ex && ex.file) { p = ex.file; n = ex.fileLine || 0; }
    else {
      const ev = (evAt.get(line) || []).find(e => !g || e.msg === g.msg) || (evAt.get(line) || [])[0];
      if (ev && ev.where && !ev.isEngine) { p = ev.where; n = ev.srcLine || 0; }
      else if (g && g.where && !/\.(cpp|h|hpp|inl)$/i.test(g.where)) p = g.where;
    }
    const key = resolveKey(cv, p);
    return key ? 'key:' + key + (n > 0 ? ':' + n : '') : null;
  };
  const out = [];
  const push = (f, sev) => {
    const g = grp.get(f.line + '|' + f.code);
    const row = { sev, code: f.code, msg: String((g && g.msg) || f.msg).slice(0, 600), count: (g && g.count) || 1, logLine: f.line || 0 };
    const link = f.line ? linkOf(f.line, g) : null;
    if (link) row.link = link;
    out.push(row);
  };
  for (const f of j.findings) push(f, f.code === 'LOG_CRASH' || /^FATAL/.test(f.msg) ? 'error' : 'warn');
  for (const f of j.info) push(f, 'info');
  const rank = { error: 0, warn: 1, info: 2 };
  out.sort((a, b) => rank[a.sev] - rank[b.sev] || a.logLine - b.logLine);
  const findings = out.slice(0, LOG_CAP);
  const res = { file, time: newest.mtimeMs || (stat(file) || {}).mtimeMs || null, findings, tail: tailOf(file) };
  if (out.length > LOG_CAP) res.truncated = true;
  // AS64 and MoW:AS2 write one log folder: a log whose command line names the other game's exe is marked (logOf = that game's id),
  // so the panel can say whose log it is. A log with no exe on its command line is not marked.
  // the exe of the log's CMD line (logtriage keeps it as header.cmd; L.exe / sink.mainExe = 'as64', 'mowas_2', 'call_to_arms')
  const cm = /([\w.-]+)\.exe/i.exec(String((L.header && L.header.cmd) || ''));
  const le = String(L.exe || sink.mainExe || (cm ? cm[1] : '')).replace(/\\/g, '/').split('/').pop().toLowerCase().replace(/\.exe$/, '');
  const logGame = le ? games.idOf(le) || games.idOf(le + '.exe') : null;
  if (logGame && logGame !== gidOf(ctx)) res.logOf = logGame;
  return res;
}

// ---------------------------------------------------------------- extopen
const safeName = (tag, name) => {
  const h = crypto.createHash('sha1').update(String(tag)).digest('hex').slice(0, 8);
  return h + '-' + String(name).split('/').pop().replace(/[^A-Za-z0-9._-]/g, '_').slice(-80);
};
const VIEW_AGE = 24 * 3600 * 1000;
let _viewSwept = false;
// first view copy of this process: drop plain files directly in ide-view older than 24 h (errors ignored)
function sweepView(dir) {
  _viewSwept = true;
  let ents = []; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  const old = Date.now() - VIEW_AGE;
  for (const e of ents) {
    if (!e.isFile()) continue;
    const f = path.join(dir, e.name);
    try { const st = fs.lstatSync(f); if (!st.isFile() || st.mtimeMs >= old) continue; try { fs.chmodSync(f, 0o666); } catch { /* */ } fs.unlinkSync(f); } catch { /* in use or gone */ }
  }
}
function viewCopy(ctx, tag, name, buf) {
  if (!ctx.tmpRoot) throw bad('No temp folder for the read-only copy.', 500);
  const dir = path.join(ctx.tmpRoot, 'ide-view'), f = path.join(dir, safeName(tag, name));
  if (!_viewSwept) sweepView(dir);
  fs.mkdirSync(dir, { recursive: true });
  try { fs.chmodSync(f, 0o666); } catch { /* new file */ }
  fs.writeFileSync(f, buf);
  try { fs.chmodSync(f, 0o444); } catch { /* best effort: read-only flag */ }
  return f;
}
// ref -> {file (on disk), readOnly, disk: the file is the real one (not a view copy)}
function fileFor(ctx, r) {
  if (r.kind === 'rel') { if (!isFile(r.file)) throw bad('No such file in your mod: ' + r.rel, 404); return { file: r.file, readOnly: false, disk: true }; }
  if (r.kind === 'path') { if (!isFile(r.file)) throw bad('No such file.', 404); return { file: r.file, readOnly: true, disk: true }; }
  if (r.kind === 'pak') {
    const ent = pak.list(r.pak.pf).find(e => e.name === r.pak.entry);
    if (!ent) throw bad('No such entry in that pak.', 404);
    if (ent.size > 8 * 1024 * 1024) throw bad('File over 8 MB.', 413);
    return { file: viewCopy(ctx, r.pak.pf + '::' + r.pak.entry, r.pak.entry, pak.read({ file: r.pak.pf }, ent)), readOnly: true, disk: false };
  }
  // layer of the game index
  const { cv, chain } = lib.chainFor(ctx, r.mod, r.key);
  const rec = chain[r.idx];
  if (!rec || rec.deleted) throw bad('That layer has no file.', 404);
  if (rec.source === 'loose') {
    const f = path.join(rec.container, ...String(rec.entry).split('/'));
    if (!isFile(f)) throw bad('No such file.', 404);
    const mine = lib.kindOf(rec, cv) === 'mine' && inside(f, r.mod);
    return { file: f, readOnly: !mine, disk: true };
  }
  const buf = lib.readChainRec(ctx, r.mod, r.key, r.idx);
  return { file: viewCopy(ctx, rec.container + '::' + (rec.entry || r.key) + '|' + rec.layer, r.key, buf), readOnly: true, disk: false };
}
// (reveal) folders a file may be shown in or opened from by an absolute path: the mod, the game install (its mods folder included)
// and the Steam Workshop content folder beside the game's library. Nothing else the page names is opened.
function revealRoots(ctx, mod) {
  const out = []; if (mod) out.push(mod);
  const g = curDirOf(ctx) || (ctx && typeof ctx.game === 'function' ? ctx.game() : null);
  if (g) { out.push(g); try { const gd = require('../../../lib/gamedir'); out.push(path.join(path.resolve(g, '..', '..'), 'workshop', 'content', String(isGoh(ctx) ? gd.GOH_APPID : gd.APPID))); } catch { /* no app id */ } }
  return out;
}
const revealOk = (ctx, mod, f) => revealRoots(ctx, mod).some(r => inside(f, r) || norm(f) === norm(r));
function reveal(ctx, f, mod) {
  if (!revealOk(ctx, mod, f)) throw bad('That file is outside your mod and the game folders: it is not shown.', 403);
  // lib/platform: Windows explorer.exe /select,<file>; macOS open -R <file>; Linux xdg-open <folder>. argv array, no shell
  const o = platform().revealInFolder(f, platOpt());
  if (!o.ok) throw bad('could not show the file in its folder: ' + f, 500);
}
async function extopen(ctx, body) {
  body = body || {};
  const app = body.app;
  if (app !== 'npp' && app !== 'explorer') throw bad('app: npp or explorer');
  // a phone (LAN Remote, view only) never starts a program on the PC
  if (lib.isRemote(ctx)) throw bad('Not from a phone: this opens a program on the PC.', 403);
  // a folder of the mod (the explorer's "Show in Explorer" on a folder row): open that folder
  if (app === 'explorer' && typeof body.rel === 'string' && body.rel && !body.rel.includes('::') && body.mod) {
    const mod = lib.checkMod(ctx, body.mod), parts = body.rel.split(/[\\/]+/).filter(Boolean);
    const d = parts.length && !parts.some(x => x === '..' || x === '.') ? path.join(mod, ...parts) : null;
    if (d && inside(d, mod) && isDir(d)) {
      // lib/platform: explorer.exe / open / xdg-open on the folder, argv array, no shell
      const o = platform().openPath(d, platOpt());
      if (!o.ok) throw bad('could not open the folder: ' + d, 500);
      return { ok: true, file: d, folder: true };
    }
  }
  const r = refOf(ctx, body, false);
  const line = posInt(body.line, 'line', 1), col = posInt(body.col, 'col', 1);
  if (app === 'explorer') {
    // a file inside a pak has no place of its own on disk: the pak itself is shown (inPak = the entry, so the page says so)
    if (r.kind === 'pak') { reveal(ctx, r.pak.pf, r.mod); return { ok: true, file: r.pak.pf, pak: true, entry: r.pak.entry }; }
    if (r.kind === 'layer') {
      const { chain } = lib.chainFor(ctx, r.mod, r.key), rec = chain[r.idx];
      if (!rec || rec.deleted) throw bad('That layer has no file.', 404);
      if (rec.source !== 'loose') { const pf = rec.container; if (!pf || !isFile(pf)) throw bad('No such file.', 404); reveal(ctx, pf, r.mod); return { ok: true, file: pf, pak: true, entry: rec.entry || r.key }; }
    }
    const t = fileFor(ctx, r);
    if (!t.disk || !isFile(t.file)) throw bad('No such file.', 404);
    reveal(ctx, t.file, r.mod);
    return { ok: true, file: t.file };
  }
  const t = fileFor(ctx, r);
  const res = await npp().open({ file: t.file, line, col, readOnly: t.readOnly });
  // the page (ui/core.js extOpen) reports success on any 200: Notepad++ missing / file gone must be an error answer
  if (!res || res.ok === false) throw bad(String((res && res.error) || 'Notepad++ could not open the file.').split('\n')[0].slice(0, 400), 404);
  return Object.assign({ ok: !!(res && res.ok), readOnly: t.readOnly, file: t.file }, res && typeof res === 'object' ? res : {});
}

// ---------------------------------------------------------------- npp
function launcher(ctx) {
  let sea = false; try { sea = require('node:sea').isSea(); } catch { sea = false; }
  return sea ? { file: process.execPath, args: ['ide'] } : { file: process.execPath, args: [path.join(ctx.tools, 'ide', 'ide.js')] };
}
async function nppPost(ctx, body) {
  body = body || {};
  const act = body.action;
  if (!['plan', 'install', 'uninstall'].includes(act)) throw bad('action: plan, install or uninstall');
  const o = Object.assign({}, _nppOpts, { launcher: launcher(ctx) });
  if (body.theme !== undefined && body.theme !== null && body.theme !== '') {
    const f = absFile(body.theme, 'theme');
    if (!isFile(f)) throw bad('theme: that file does not exist', 404);
    o.theme = f;
  }
  // the pack has no force switch: a refusal always stops. The two options below only narrow or widen what is added.
  if (body.functionList === true) o.functionList = true;
  if (Array.isArray(body.extSkip)) o.extSkip = body.extSkip.filter(s => typeof s === 'string' && /^[a-z0-9_]{1,12}$/i.test(s)).slice(0, 40);
  return await npp()[act](o);
}

// ---------------------------------------------------------------- inbox (Notepad++ -> GUI)
// waiters: one per held GET (one per GUI tab). A new GET never releases an older one; a POST releases all live ones with the same
// items; a closed connection drops its waiter (ctx.onClose) so a jump is never handed to a dead response. Cap 8: the oldest goes empty.
const WAIT_CAP = 8;
const inbox = { q: [], waiters: [], holdMs: 25000 };
// a mod folder: it holds mod.info, or it is <game>/mods/<name> (a bare parent holding resource/ is not enough). <game> = the AS2
// install, and under GoH also the GoH install (<GoH>/mods/<name>); whether such a folder may be read as a mod is files/lib checkMod's
// answer (a refusal leaves the file a plain read-only path, as before).
function modDirOf(ctx, d) {
  if (isFile(path.join(d, 'mod.info'))) return true;
  if (lc(path.basename(path.dirname(d))) !== 'mods') return false;
  const up = norm(path.dirname(path.dirname(d)));
  let as2 = null; try { as2 = (ctx && typeof ctx.game === 'function' && ctx.game()) || null; } catch { as2 = null; }   // ctx.game() = the AS2 install
  return [as2, curDirOf(ctx)].some(g => g && up === norm(g));
}
function inboxRef(ctx, f, vanilla) {
  for (let d = path.dirname(f); ; ) {   // nearest mod folder (checkMod refuses the game folder and vanilla); none -> {path} as before
    let mod = null;
    if (modDirOf(ctx, d)) { try { mod = lib.checkMod(ctx, d); } catch { mod = null; } }
    if (mod && inside(f, mod)) {
      const rel = fwd(path.relative(mod, f));
      if (vanilla) {
        const key = lib.keyOf(rel);
        if (key) {
          const { cv, chain } = lib.chainFor(ctx, mod, key);
          for (let i = chain.length - 1; i >= 0; i--) if (!chain[i].deleted && lib.kindOf(chain[i], cv) !== 'mine') return { mod, key, idx: i };
        }
      }
      return { mod, rel };
    }
    const up = path.dirname(d); if (up === d) break; d = up;
  }
  return { path: f };
}
function inboxPost(ctx, body) {
  body = body || {};
  if (!ctx.session || typeof ctx.session.token !== 'string' || !ctx.session.token || body.token !== ctx.session.token) throw bad('Refused: wrong or missing token.', 403);
  const f = absFile(body.file, 'file');
  if (!isFile(f)) throw bad('file: no such file', 404);
  const item = { ref: inboxRef(ctx, f, !!body.vanilla), line: posInt(body.line, 'line', 1), col: posInt(body.col, 'col', 1) };
  inbox.q.push(item);
  if (inbox.q.length > INBOX_CAP) inbox.q.splice(0, inbox.q.length - INBOX_CAP);
  const live = inbox.waiters.slice();
  if (live.length) { const items = inbox.q.splice(0); for (const w of live) w.finish(items.slice()); }
  return { ok: true, ref: item.ref, delivered: live.length };
}
function inboxGet(q, ctx) {
  if (inbox.q.length || q.wait !== '1') return { items: inbox.q.splice(0) };
  return new Promise(resolve => {
    const w = { done: false };
    const drop = () => { w.done = true; clearTimeout(w.timer); const i = inbox.waiters.indexOf(w); if (i >= 0) inbox.waiters.splice(i, 1); };
    w.finish = items => { if (w.done) return; drop(); resolve({ items }); };
    w.timer = setTimeout(() => w.finish(inbox.q.splice(0)), inbox.holdMs);
    inbox.waiters.push(w);
    while (inbox.waiters.length > WAIT_CAP) inbox.waiters[0].finish([]);
    if (ctx && typeof ctx.onClose === 'function') {
      try { ctx.onClose(() => { if (w.done) return; drop(); resolve({ items: [] }); }); } catch { /* no close hook: timeout still ends it */ }
    }
  });
}

// ---------------------------------------------------------------- asset
const JS = 'text/javascript; charset=utf-8', CSS = 'text/css; charset=utf-8';
const optCss = load => { try { const m = load(); return (m && typeof m.css === 'string') ? m.css : ''; } catch { return ''; } };
function asset(q) {
  const f = q.f;
  if (f === 'cm.js' || f === 'cm.css') {
    const b = need('cm5 bundle', () => require('../../vendor/cm5/cm5.bundle.json'));
    return { __raw: String(f === 'cm.js' ? b.js : b.css), type: f === 'cm.js' ? JS : CSS };
  }
  if (f === 'ide.js') { const cm = need('cm', () => require('./cm')); return { __raw: String(cm.js || ''), type: JS }; }
  if (f === 'ide.css') {
    const css = [optCss(() => require('./cm')), optCss(() => require('./ui/core')), optCss(() => require('./ui/explorer')), optCss(() => require('./ui/panels')),
      optCss(() => require('./ui/kit')), optCss(() => require('./ui/inc')), optCss(() => require('./ui/jump'))];
    return { __raw: css.filter(Boolean).join('\n'), type: CSS };
  }
  throw bad('f: cm.js, cm.css, ide.js or ide.css', 404);
}

// ---------------------------------------------------------------- kit (the Code Pieces pane)
// GET kit?kind=<kitKind>&lang=en|ru|uk|zh -> tools/ide/kit index.catalog(kind, lang, { game }) (contract "tools/ide/kit"). Read only,
// no mod; game = a game folder is set (the page's ?game= override counts, as for every route). The answer is the catalog's own memo
// (one object per kind, language and game flag): sent as JSON, never changed here. Not open to a phone: not in remote.js ALLOW, and
// refused here too when the session is a remote one.
let _kitLoad = () => require('../../../ide/kit');   // test hook: _setKit
function kitRoute(ctx, q) {
  if (ctx && ctx.session && ctx.session.remote) throw bad('View only on this device.', 403);
  const kind = typeof q.kind === 'string' ? q.kind : '', lang = typeof q.lang === 'string' ? q.lang : '';
  if (!/^[a-z][a-z0-9-]{1,23}$/.test(kind)) throw bad('kind: a file kind like ia-entity is needed');
  if (!/^(en|ru|uk|zh)$/.test(lang)) throw bad('lang: en, ru, uk or zh');
  const kit = need('kit', _kitLoad);
  if (!kit || typeof kit.catalog !== 'function') throw bad('This part of the editor is not built yet (kit).', 501);
  // MoW:AS2 and GoH: the catalog also gets the game id (words.json is built from MoW:AS2 data, so MoW:AS2 is as AS64; GoH: 368 of the
  // 391 pieces use only keys GoH's own interaction files use, keylint vocab.goh.json [I]). AS64: the call as before.
  const gid = gidOf(ctx);
  return kit.catalog(kind, lang, gid === 'as64' ? { game: !!lib.gameOf(ctx) } : { game: !!curDirOf(ctx), gameId: gid });   // a kind it does not know: its own Error with status 400
}

// ---------------------------------------------------------------- (inc) inline include windows
// POST inc {mod, rel|key,idx|path (the including doc), from? (key of the including file: a nested window names the include it sits
// in), value (the include string as written), off?, lim?} -> one page of the included file, read the way the game finds it
// (intel incLocate: relative to the including file, this mod's loose file first, then the layered game view, paks included).
// Answer: { value, kind, key, found, special, where, layer, tried, ref, editable, inPak, size, off, next, text, cut, whole }
// ref = how to open it as a tab ({rel} = a loose file of this mod, editable; {key, idx} = the copy the game reads, read only).
// text = the page as text with \n line ends (UTF-8, else cp1251; a leading BOM dropped); a page ends after its last whole line,
// next = the byte offset of the next page or null. A pak entry is read by range (view/ref.js readRange), never whole.
const INC_PAGE = 256 * 1024, INC_MAX = 4 * 1024 * 1024;
let _viewRef = null;
const viewRef = () => _viewRef || (_viewRef = need('view', () => require('../view/ref')));
async function incRoute(ctx, body) {
  body = body || {};
  const r = refOf(ctx, body);
  if (typeof body.value !== 'string' || !body.value || body.value.length > 512 || /\0/.test(body.value)) throw bad('value: the include path as written is needed');
  const from = typeof body.from === 'string' && body.from ? keyNorm(body.from) : (r.key || null);
  const off = body.off == null || body.off === '' ? 0 : Number(body.off);
  if (!Number.isInteger(off) || off < 0) throw bad('off: a byte offset from 0 is needed');
  const lim = body.lim == null || body.lim === '' ? INC_PAGE : Number(body.lim);
  if (!Number.isInteger(lim) || lim < 1 || lim > INC_MAX) throw bad('lim: 1 to ' + INC_MAX + ' bytes');
  // fast path: the include is a loose file of this mod (the usual case). Answered from the folder alone, without the game file
  // index (whose first build takes seconds on a big install); everything else goes through incLocate.
  let loc = null;
  try {
    const rk = require('../../../lib/sdlx').resolveInclude(body.value, lc(from || 'resource/x'));
    if (rk && rk.kind === 'virtual' && rk.key && /^resource\//.test(rk.key) && !rk.key.split('/').includes('..')) {
      const f = path.join(r.mod, ...rk.key.split('/')), st = stat(f);
      if (st && st.isFile()) loc = { value: body.value, kind: 'virtual', key: rk.key, found: true, where: 'mine', layer: null, size: st.size, tried: [rk.key], rel: rk.key };
    }
  } catch { loc = null; }
  if (!loc) loc = fnOf('incLocate')(body.value, from, ictxOf(ctx, r.mod));
  if (!loc) throw bad('include could not be looked up', 500);
  const out = Object.assign({}, loc, { from, special: loc.kind !== 'virtual', ref: null, editable: false, inPak: null, text: '', off, next: null, cut: false, whole: false });
  if (!loc.found) return out;
  let rs;
  try { rs = loc.rel && loc.where === 'mine' ? viewRef().resolve(ctx, { mod: r.mod, rel: loc.rel }) : viewRef().resolve(ctx, { mod: r.mod, key: loc.key }); }
  catch (e) { if (e && e.status === 404) { out.found = false; return out; } throw e; }
  out.size = rs.size; out.inPak = rs.inPak || null; out.layer = rs.layer || out.layer; out.where = rs.where || out.where;
  out.ref = rs.rel ? { rel: rs.rel } : { key: rs.key, idx: rs.idx };
  out.editable = !!(rs.rel && !rs.inPak && rs.where === 'mine');
  if (off >= rs.size) { out.whole = off === 0; return out; }
  let buf = await viewRef().readRange(rs.src, off, lim);
  const end = off + buf.length >= rs.size;
  if (!end) {   // a page ends after its last whole line (a line longer than the page is cut at the page)
    const nl = buf.lastIndexOf(0x0A);
    if (nl >= 0) buf = buf.subarray(0, nl + 1);
    out.next = off + buf.length; out.cut = true;
  }
  out.whole = off === 0 && end;
  let b = buf;
  if (off === 0 && b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF) b = b.subarray(3);
  const enc = require('../../../lib/enc');
  out.text = (enc.isUtf8(b) ? b.toString('utf8') : enc.decodeCp1251(b)).replace(/\r\n?/g, '\n');
  return out;
}

// ---------------------------------------------------------------- (jump) modcheck: every text file of the mod through intel check
// POST {mod, from?, job?, again?, at?, stop?} -> { job, done, total, checked, start, upto, wrapped, files:[{ rel, key, findings:[{ line,
// col, len, code, sev, msg }] }], off, next, ms, stat, error?, stopped? }.
// JOBS: each check is one background job of the footer list (what job.w.modcheck, page ide, done/total = files checked / files). Cancel
// there, or a POST with stop:true (the page left the mod), stops the walk; the page's next slice request (same job id) is answered
// stopped:true, done:false and the page stops asking. A request without that job id, or with again:true, starts a new check.
// Files: the text data the check reads (sdl, lng, lua, po kinds; model text .mdl .mtl .tex .info, map folders and extension-less
// files outside resource/set/ are left out), loose and inside the mod's own paks, at most 512 KB each (a bigger one, a long mission, would hold the server thread for seconds:
// counted in stat.skippedBig; its tab's own check still covers it); dot folders and restore
// folders (.arsenal-undo) are skipped. Order = the explorer's (each folder by name), and the walk starts at the file after `at` (the
// page's current file) and goes round, so the problems after the cursor come first (`start`, `upto`, `wrapped` say what is done).
// Check = intel check (the lint route's; one ictx for the whole walk, so the game context is built once). The walk runs in slices of
// MC_SLICE ms on the server thread (one file is never split: a 1 MB mission can take 0.3 s), so other asks wait at most about that.
// Kept results: the shared store (section 'ide.check', see mcJob), per file size + mtime + MC_VER (and the game, exe and game stamp): a
// second run, also after a restart, checks only changed files. The file list is the shared walk of the mod (lib/modtree). Findings that depend on other files (a macro defined elsewhere) are as of the run that checked the file;
// `again:true` ignores the cache. A done job is kept 10 min per mod. Read only (the mod is never written).
const MC_KEEP = 4, MC_TTL = 10 * 60 * 1000, MC_MAXF = 512 * 1024, MC_KINDS = new Set(['sdl', 'lng', 'lua', 'po']), MC_SLICE = 60, MC_VER = 1;
const MC_SKIPEXT = new Set(['mdl', 'mtl', 'tex', 'info', 'ply', 'dds', 'tga', 'png', 'jpg', 'wav', 'ogg', 'mp3', 'anm', 'pak', 'pat', 'ptx', 'fx', 'fxh', 'hlsl', 'dll', 'exe', 'bin', 'dat']);
const _mc = new Map();   // sig -> job
let _mcSeq = 0;
const extOfRel = r => { const b = r.slice(r.lastIndexOf('/') + 1), i = b.lastIndexOf('.'); return i <= 0 ? '' : lc(b.slice(i + 1)); };
function mcWanted(kindOf, rel, key) {
  const e = extOfRel(rel);
  if (MC_SKIPEXT.has(e)) return false;
  if (!e && !/^resource\/set\//.test(key || '')) return false;   // extension-less: stuff files only (maps and the rest are not data text)
  if (/^resource\/map\//.test(key || '') && e !== 'mi' && e !== 'set' && e !== 'lua') return false;
  try { return MC_KINDS.has(kindOf(key || rel)); } catch { return false; }
}
// the mod's text data files, explorer order: [{ rel, key, f?, size, pak? }]
// CACHE: the list is the shared walk of the mod (lib/modtree through files/modfiles: no walk, no stat here; size and time of a
// loose file come with it as sm), a pak's entries come from the store. T = that walk (its signature marks a finished check).
// fresh: the page's own check walks now (a file changed outside the GUI a moment ago is seen, as before); Prepare takes the shared walk
async function mcWalk(ctx, mod, kindOf, job, fresh) {
  const T = await mf.kit(ctx).mt.ensure(mod, fresh ? { maxAgeMs: 0 } : {});
  const rows = []; let since = Date.now();
  for (const f of mf.listing(T, { noDot: true })) {
    if (job.dead) break;
    const r = f[0];
    if (/\.(pak|pat)$/i.test(r)) {
      for (const x of mf.pakEntries(ctx, path.join(mod, ...r.split('/')), f[1], f[2]).ents) {
        if (x[0].endsWith('/')) continue;
        const key = pakKey(r, x[0]);
        if (key && x[1] <= MC_MAXF && mcWanted(kindOf, x[0], key)) rows.push({ rel: r + '::' + x[0], key, size: x[1], pak: true });
      }
    } else {
      const key = lib.keyOf(r);
      if (!lib.isModInfo(r) && mcWanted(kindOf, r, key)) rows.push({ rel: r, key, f: path.join(mod, ...r.split('/')), size: f[1], sm: f[1] + ':' + Math.round(f[2]) });
    }
    if (Date.now() - since > MC_SLICE) { await nextTick(); since = Date.now(); }
  }
  return { rows, T };
}
function mcText(buf) {
  if (buf.includes(0)) return null;
  let b = buf; if (b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF) b = b.subarray(3);
  const enc = require('../../../lib/enc');
  return (enc.isUtf8(b) ? b.toString('utf8') : enc.decodeCp1251(b)).replace(/\r\n?/g, '\n');
}
// CACHE (gui README, contract 1): the per-file results live in the shared store, one entry per game + mod: section 'ide.check', parts
// {game, exe, gid, mod}, stamp game only (each file's own size and time is inside, so a changed file is checked again and the rest is
// reused). 'ide.check.done' (stamps game + mod:all) is written when a check ran to its end: the Prepare screen reads it to say whether
// the mod changed since. The old files under <tmpRoot>/ide-modcheck are removed on the first check.
const MC_SEC = 'ide.check', MC_DONE = 'ide.check.done';
const mcParts = (ctx, mod) => ({ game: curDirOf(ctx) ? norm(curDirOf(ctx)) : '', exe: exeOf(ctx) || '', gid: gidOf(ctx), mod: norm(mod) });
let _mcOld = false;
function mcDropOld(ctx) {
  if (_mcOld || !ctx || !ctx.tmpRoot) return;
  _mcOld = true;
  try { fs.rmSync(path.join(ctx.tmpRoot, 'ide-modcheck'), { recursive: true, force: true }); } catch { /* in use: left */ }
}
// quiet: no row of its own in the job list (the Prepare section that runs it has one)
function mcJob(ctx, mod, sig, at, again, quiet) {
  const job = { id: 'mc' + (++_mcSeq) + '-' + Date.now().toString(36), sig, t: Date.now(), done: false, total: null, checked: 0, start: null, upto: null, wrapped: false,
    files: [], err: null, ms: 0, stat: { walkMs: 0, ctxMs: 0, firstCheckMs: 0, checkMs: 0, readMs: 0, skippedBig: 0, cached: 0, checkedNew: 0, firstFindMs: null } };
  _mc.set(sig, job); while (_mc.size > MC_KEEP) { const k = _mc.keys().next().value; const o = _mc.get(k); if (o) mcKill(o); _mc.delete(k); }
  // JOBS: one background job in the footer list for the whole check (the page's slice requests are not listed). Cancel there =
  // mcStop: the walk ends at its next slice and the page's next slice request is answered stopped:true
  job.h = null;
  if (!quiet && ctx && ctx.jobs && typeof ctx.jobs.add === 'function') {
    try { job.h = ctx.jobs.add({ kind: 'bg', what: 'job.w.modcheck', page: 'ide', game: gidOf(ctx), cancel() { mcStop(job); } }); } catch { job.h = null; }
  }
  const tell = () => { if (job.h) job.h.set({ done: job.checked, total: job.total }); };
  const kindOf = fnOf('kindOf'), check = fnOf('check');
  job.p = (async () => {
    const t0 = Date.now();
    await nextTick();
    // the check context (game file index, mod list) is built only when a file is not in the cache: its first build on a big
    // install takes seconds (lib/vfs mounts every file), and a run that finds every file in the cache needs none of it
    let ictx = null;
    const ictxNow = () => { if (!ictx) { const a = Date.now(); ictx = ictxOf(ctx, mod); job.stat.ctxMs = Date.now() - a; job.ictx = ictx; try { fnOf('memoBegin')(ictx); } catch (e) {} } return ictx; };   // memoBegin..memoEnd: an included file is read once per check (ide/intel/fixes)
    mcDropOld(ctx);
    const S = mf.kit(ctx).S, parts = mcParts(ctx, mod), stamps = { game: gameStamp(ctx) };
    let cache = {};
    if (!again) { try { const c = S.get(MC_SEC, MC_VER, parts, stamps); if (c && c.value && c.value.files) cache = c.value.files; } catch { cache = {}; } }
    const { rows, T } = await mcWalk(ctx, mod, kindOf, job, again || !quiet);
    if (job.dead) return;
    job.stat.walkMs = Date.now() - t0;
    job.total = rows.length; tell();
    let i0 = 0;
    if (at) { i0 = rows.findIndex(r => mcCmp(r.rel, at) > 0); if (i0 < 0) i0 = 0; }
    job.start = rows.length ? rows[i0].rel : null;
    const next = {}; let since = Date.now();
    for (let n = 0; n < rows.length; n++) {
      if (job.dead) return;
      const r = rows[(i0 + n) % rows.length];
      if (i0 + n >= rows.length) job.wrapped = true;
      let fl = null;
      const sm = r.pak ? 'p' + r.size : r.sm;   // a loose file: size and time as the shared walk saw them
      const c = cache[r.rel];
      if (c && c[0] === sm) { fl = c[1]; job.stat.cached++; }
      else {
        let text = null, gone = false; const a = Date.now();
        if (!r.pak && r.size > MC_MAXF) job.stat.skippedBig++;
        try { text = r.pak ? String(lib.openFile(ctx, { mod, rel: r.rel }).text || '').replace(/\r\n?/g, '\n') : (r.size <= MC_MAXF ? mcText(fs.readFileSync(r.f)) : null); }
        catch (e) { text = null; gone = !r.pak && !!e && e.code === 'ENOENT'; }
        if (gone) { job.checked++; job.upto = r.rel; continue; }   // removed since the walk: no result, as a file that is not there
        const b = Date.now(); job.stat.readMs += b - a;
        let fs0 = [];
        if (text != null) { const ic = ictxNow(), b2 = Date.now(); try { fs0 = check({ key: r.key || null, text }, ic) || []; } catch { fs0 = []; } if (!job.stat.firstCheckMs) job.stat.firstCheckMs = Date.now() - b2; }
        job.stat.checkMs += Date.now() - b; job.stat.checkedNew++;
        fl = fs0.filter(f => f && (f.sev === 'error' || f.sev === 'warn')).map(f => ({ line: f.line, col: f.col || 1, len: f.len || 0, code: f.code, sev: f.sev, msg: f.msg }));
      }
      if (fl) next[r.rel] = [sm, fl];
      if (fl && fl.length) { job.files.push({ rel: r.rel, key: r.key || null, findings: fl }); if (job.stat.firstFindMs == null) job.stat.firstFindMs = Date.now() - t0; }
      job.checked++; job.upto = r.rel;
      if (Date.now() - since > MC_SLICE) { tell(); await nextTick(); since = Date.now(); }
    }
    job.ms = Date.now() - t0;
    try {
      S.put(MC_SEC, MC_VER, parts, stamps, { files: next });
      S.put(MC_DONE, MC_VER, parts, Object.assign({}, stamps, mf.kit(ctx).mt.stamps(T, ['all'])), { files: rows.length, found: job.files.length, ms: job.ms });
    } catch { /* cache only */ }
  })().catch(e => { job.err = e; }).then(() => { if (job.ictx) { try { fnOf('memoEnd')(job.ictx); } catch (e) {} job.ictx = null; } job.done = true; job.t = Date.now(); tell(); if (job.h) job.h.end(job.stopped ? 'cancelled' : job.err ? 'failed' : 'done'); });
  return job;
}
// a check nobody reads any more (replaced by a new one, pushed out of the store): its walk ends at the next slice, its row in the job list ends now
function mcKill(job) { job.dead = true; if (job.h) job.h.end('cancelled'); }
// stopped by the user (Cancel in the job list) or by its page (the mod changed): kept in the store so the page's next slice request learns it
function mcStop(job) { if (job.done) return; job.stopped = true; mcKill(job); }
// explorer order of two rels (each folder by name, code units)
function mcCmp(a, b) { if (a === b) return 0; const x = a.split('/'), y = b.split('/'); for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1; return x.length - y.length; }
function modcheck(ctx, body) {
  body = body || {};
  const mod = lib.checkMod(ctx, body.mod, { read: true }), sig = gkey(ctx) + 'mc|' + norm(mod);
  const from = body.from == null ? 0 : Number(body.from);
  if (!Number.isInteger(from) || from < 0) throw bad('from: a whole number, 0 or more');
  const at = typeof body.at === 'string' && body.at.length <= 1024 ? body.at : null;
  let job = _mc.get(sig);
  jobSay(ctx, 'job.w.modcheck', null, true);   // the check's own background job is its row
  // stop:true = the page does not read this check any more (its mod changed): the walk stops, nothing is started
  if (body.stop) {
    if (job && (!body.job || body.job === job.id)) mcStop(job);
    return { job: job ? job.id : null, stopped: true, done: false, total: job ? job.total : null, checked: job ? job.checked : 0, files: [], off: from, next: from };
  }
  // a stopped check answers stopped:true to the page that was reading it (same job id); any other ask starts a new check
  const halted = !!job && !!job.stopped && !body.again && body.job === job.id;
  if (job && !halted && (body.again || job.stopped || (job.done && Date.now() - job.t > MC_TTL))) { mcKill(job); job = null; }
  if (!job) job = mcJob(ctx, mod, sig, at, !!body.again);
  const files = job.files.slice(from, from + 2000);
  const out = { job: job.id, done: job.done && from + files.length >= job.files.length, total: job.total, checked: job.checked, start: job.start, upto: job.upto,
    wrapped: job.wrapped, files, off: from, next: from + files.length, ms: job.ms, stat: job.stat };
  if (job.err) out.error = String(job.err.message || job.err).split('\n')[0].slice(0, 300);
  if (halted) { out.stopped = true; out.done = false; }
  return out;
}

// ---------------------------------------------------------------- Prepare sections (gui README, CACHE contract 1 "Prepare sections")
// Exported by ./index.js as prep. state: no walk, no build (the last known signature of the mod, the store's own state). run: the
// same job code the page's routes use, to the end, so the page then finds everything in the store. Nothing is written into mod or game.
//   ide.tree   the Editor's and Mod Files' file tree, pak listings included (store 'ide.tree', 'ide.pak')
//   ide.index  the index of unit and item names the Editor's hover, go to definition and usages read (tools/ide/intel/nav: a file
//              copy under the tool cache with its release and stamps beside it; the mod list it is built for is 'ide.mods')
//   ide.check  the whole-mod check (store 'ide.check'; 'ide.check.done' marks a check that ran to its end for these mod files)
// the ctx of the section's game: q.game = {id, dir, exe} answers what the page's request would
function prepCtx(ctx, q) {
  const g = q && q.game;
  if (!g || !g.id) return ctx;
  const o = { gameId: () => g.id, exe: () => g.exe || g.id, curDir: () => g.dir || null };
  if (g.id === 'goh') o.gohDir = () => g.dir || null; else if (g.dir) o.game = () => g.dir;
  return Object.assign({}, ctx, o);
}
const NA = e => ({ state: 'na', why: [], note: String((e && e.message) || e).split('\n')[0].slice(0, 200) });
const tell = (job, o) => { try { if (job && typeof job.set === 'function') job.set(o); } catch { /* the list only */ } };
const every = (ms, fn) => { const t = setInterval(() => { try { fn(); } catch { /* next tick */ } }, ms); if (t.unref) t.unref(); return t; };
const PREP = [
  {
    id: 'ide.tree', title: 'ide.prep.tree', needs: ['mod.tree', 'game.view'], areas: ['all'], store: ['ide.tree', 'ide.pak'],
    state(ctx, q) {
      let c, mod; try { c = prepCtx(ctx, q); mod = lib.checkMod(c, q.mod, { read: true }); } catch (e) { return NA(e); }
      return mf.treeState(c, mod);
    },
    async run(ctx, q, job) {
      const c = prepCtx(ctx, q), mod = lib.checkMod(c, q.mod, { read: true });
      const tj = treeJob(c, mod, gkey(c) + 'tree|' + norm(mod), {});
      const wait = until(tj, Infinity);   // a reader: the walk is not taken for one nobody reads
      const iv = every(250, () => { if (job && job.cancelled) dropList(tj.ver); else tell(job, { stage: 'ide.prep.st.tree', done: tj.rows.length }); });
      tell(job, { stage: 'ide.prep.st.tree', done: 0 });
      try { await wait; await tj.stored; } finally { clearInterval(iv); }
      if (job && job.cancelled) return;
      if (tj.err) throw clean(tj.err);
      tell(job, { stage: 'ide.prep.st.tree', done: tj.rows.length, total: tj.rows.length });
    },
  },
  {
    id: 'ide.index', title: 'ide.prep.index', needs: ['mod.tree', 'game.view'], areas: ['entity', 'set'], store: ['ide.mods'],
    state(ctx, q) {
      let c, mod; try { c = prepCtx(ctx, q); mod = lib.checkMod(c, q.mod, { read: true }); } catch (e) { return NA(e); }
      if (!curDirOf(c)) return { state: 'na', why: [] };
      const mods = modsPeek(c, mod);
      if (!mods) return { state: 'none', why: [] };   // which mods the game loads is not known yet: run finds out
      const o = { gameDir: curDirOf(c), mods, folder: mod }, exe = exeOf(c);
      if (exe) { o.exe = exe; o.game = gidOf(c); }
      try { const k = mf.kit(c); Object.defineProperty(o, 'shared', { value: { cache: k.S, modtree: k.mt, gameview: k.gv }, enumerable: false }); } catch { /* the modules */ }
      return fnOf('indexState')(o);
    },
    async run(ctx, q, job) {
      const c = prepCtx(ctx, q), mod = lib.checkMod(c, q.mod, { read: true });
      tell(job, { stage: 'ide.prep.st.index' });
      await nextTick();
      const ac = new AbortController();
      if (job && typeof job.onCancel === 'function') job.onCancel(() => ac.abort());
      const iv = every(250, () => { if (job && job.cancelled) ac.abort(); });
      try { await fnOf('indexPrepare')(ictxOf(c, mod), { signal: ac.signal }); } finally { clearInterval(iv); }
    },
  },
  {
    id: 'ide.check', title: 'ide.prep.check', needs: ['mod.tree', 'game.view'], areas: ['all'], store: ['ide.check', 'ide.check.done'],
    state(ctx, q) {
      let c, mod; try { c = prepCtx(ctx, q); mod = lib.checkMod(c, q.mod, { read: true }); } catch (e) { return NA(e); }
      const k = mf.kit(c), T = k.mt.last(mod);
      if (!T) return { state: 'stale', why: ['mod'] };
      return k.S.state(MC_DONE, MC_VER, mcParts(c, mod), Object.assign({ game: gameStamp(c) }, k.mt.stamps(T, ['all'])));
    },
    async run(ctx, q, job) {
      const c = prepCtx(ctx, q), mod = lib.checkMod(c, q.mod, { read: true }), sig = gkey(c) + 'mc|' + norm(mod);
      if (job && job.cancelled) return;
      // a check the page runs now is joined (and left running on Cancel); else one is started here, with no row of its own
      let mj = _mc.get(sig), own = false;
      if (!mj || mj.done || mj.dead || mj.stopped) { if (mj) mcKill(mj); mj = mcJob(c, mod, sig, null, false, true); own = true; }
      const say = () => tell(job, { stage: 'ide.prep.st.check', done: mj.checked, total: mj.total });
      let left = null;
      const gone = new Promise(res => { left = res; });
      const iv = every(250, () => { if (job && job.cancelled) { if (own) mcStop(mj); left(); } else say(); });
      say();
      try { await Promise.race([mj.p, gone]); } finally { clearInterval(iv); }
      if (job && job.cancelled) return;
      if (mj.err) throw clean(mj.err);
      if (mj.dead || mj.stopped) throw bad('The check was stopped before its end.', 409);
      say();
    },
  },
];

// ---------------------------------------------------------------- routes
const R = {
  'POST /api/x/ide/modcheck': async (url, body, ctx) => safe(() => modcheck(ctx, body)),
  'POST /api/x/ide/inc': async (url, body, ctx) => safe(() => incRoute(ctx, body)),
  'GET /api/x/ide/asset': async (url) => safe(() => asset(Q(url))),
  'POST /api/x/ide/lint': async (url, body, ctx) => safe(() => {
    const { doc, ictx } = docOf(ctx, body || {});
    const t0 = Date.now();
    const findings = fnOf('check')(doc, ictx) || [];
    const I = intel();
    const fixes = typeof I.fixes === 'function' ? I.fixes(doc, findings, ictx) || [] : [];
    const multi = typeof I.multi === 'function' ? I.multi(findings) || [] : [];
    const res = { findings, fixes, multi, ms: Date.now() - t0 };
    try { if (typeof I.warm === 'function') I.warm(ictx); } catch { /* background index build only */ }
    return res;
  }),
  'POST /api/x/ide/hover': async (url, body, ctx) => safe(() => { const { doc, ictx } = docOf(ctx, body || {}, true, true), pos = posOf(body); return { hover: fnOf('hover')(doc, pos, ictx) || null }; }),
  'POST /api/x/ide/def': async (url, body, ctx) => safe(() => { const { doc, ictx } = docOf(ctx, body || {}, true, true), pos = posOf(body); const targets = fnOf('def')(doc, pos, ictx) || []; let loading = false; if (!targets.length) { try { loading = !fnOf('defReady')(ictx); } catch (e) { loading = false; } } return { targets, loading }; }),
  'POST /api/x/ide/refs': async (url, body, ctx) => safe(async () => {
    // refsAsync scans in slices (the server has one thread); the plain refs stays as the fallback and keeps its own 400 ms budget
    const sliced = typeof intel().refsAsync === 'function', refs = sliced ? intel().refsAsync : fnOf('refs');
    body = body || {};
    // JOBS: one named row; Cancel in the job list and a page that went away stop the sliced scan (refsAsync signal)
    jobSay(ctx, 'ide.job.refs');
    const ac = sliced && typeof AbortController === 'function' ? new AbortController() : null, so = ac ? { signal: ac.signal } : undefined;
    if (ac && ctx && ctx.job && typeof ctx.job.onCancel === 'function') { ctx.job.onCancel(() => ac.abort()); ctx.job.canCancel = true; }
    if (ac && ctx && typeof ctx.onClose === 'function') { try { ctx.onClose(() => ac.abort()); } catch { /* no close hook */ } }
    if (typeof body.name === 'string' && body.text === undefined) {
      const mod = lib.readMod(ctx, body.mod), name = body.name.trim();   // null: no mod, the game alone
      if (!name || name.length > 200) throw bad('name: 1 to 200 characters');
      return await refs({ key: null, text: '' }, { name }, ictxOf(ctx, mod), so);
    }
    const { doc, ictx } = docOf(ctx, body, true, true);
    const pos = posOf(body);
    return await refs(doc, pos, ictx, so);
  }),
  'POST /api/x/ide/symbols': async (url, body, ctx) => safe(() => { const { doc } = docOf(ctx, body || {}, true, true); return { symbols: fnOf('symbols')(doc) || [] }; }),
  'GET /api/x/ide/words': async (url, body, ctx) => safe(() => {
    const q = Q(url), mod = lib.checkMod(ctx, q.mod, { read: true }), kind = String(q.kind || '');
    if (!/^[A-Za-z0-9._-]{1,24}$/.test(kind)) throw bad('kind: a file kind like sdl or an extension like .def');
    return { words: fnOf('words')(kind, ictxOf(ctx, mod)) || [] };
  }),
  // JOBS: the first page of a walk is one named row, its later pages (off > 0) are not listed
  'GET /api/x/ide/vdir': async (url, body, ctx) => safe(() => { const q = Q(url); jobSay(ctx, 'ide.job.vdir', { p: 'resource' + (q.dir ? '/' + String(q.dir).slice(0, 120) : '') }, offQ(q)); return vdir(ctx, q); }),
  'GET /api/x/ide/vfind': async (url, body, ctx) => safe(() => { const q = Q(url); jobSay(ctx, 'ide.job.vfind', { q: String(q.q || '').slice(0, 60) }, offQ(q)); return vfind(ctx, q); }),
  'GET /api/x/ide/tree': async (url, body, ctx) => safe(() => { const q = Q(url); jobSay(ctx, 'ide.job.tree', null, offQ(q)); return treeRoute(ctx, q); }),
  'GET /api/x/ide/copies': async (url, body, ctx) => safe(() => copies(ctx, Q(url))),
  'GET /api/x/ide/log': async (url, body, ctx) => safe(() => logRoute(ctx, Q(url))),
  'GET /api/x/ide/kit': async (url, body, ctx) => safe(() => kitRoute(ctx || {}, Q(url))),
  'POST /api/x/ide/extopen': async (url, body, ctx) => safe(() => extopen(ctx, body)),
  'GET /api/x/ide/npp': async (url, body, ctx) => safe(() => npp().status(Object.assign({}, _nppOpts))),
  'POST /api/x/ide/npp': async (url, body, ctx) => safe(() => nppPost(ctx, body)),
  'POST /api/x/ide/inbox': async (url, body, ctx) => safe(() => inboxPost(ctx, body)),
  'GET /api/x/ide/inbox': async (url, body, ctx) => safe(() => inboxGet(Q(url), ctx || {})),
};
// SPEED: these routes read files/lib's view of the game + mod through sync code (vfsFor, chainFor, modsFor, ictx.vfs). Each waits for
// lib.vfsWarm first: the shared scan of the mod's folders, not blocking, so the view is found by signature instead of a 13-16 s walk
// on the first call. Same view, same answer; vfsWarm never throws and does nothing for a request with no mod (tree: vfsForAsync).
for (const k of ['POST /api/x/ide/modcheck', 'POST /api/x/ide/inc', 'POST /api/x/ide/lint', 'POST /api/x/ide/hover', 'POST /api/x/ide/def', 'POST /api/x/ide/refs', 'POST /api/x/ide/symbols',
  'GET /api/x/ide/words', 'GET /api/x/ide/vdir', 'GET /api/x/ide/vfind', 'GET /api/x/ide/copies', 'GET /api/x/ide/log', 'POST /api/x/ide/extopen', 'POST /api/x/ide/inbox']) {
  const fn = R[k];
  if (typeof fn !== 'function') continue;
  R[k] = async (url, body, ctx) => {
    try { if (typeof lib.vfsWarm === 'function') await lib.vfsWarm(ctx, (body && typeof body.mod === 'string' && body.mod) || Q(url).mod); } catch { /* the route says it */ }
    return fn(url, body, ctx);
  };
}
// test hooks (not enumerable: never taken for routes)
const hide = (k, v) => Object.defineProperty(R, k, { value: v, enumerable: false });
hide('_setSpawn', fn => { _spawn = fn || null; });
hide('_setPlatform', p => { _plat = p || null; });
hide('_setNpp', m => { _npp = m || null; });
hide('_setNppOpts', o => { _nppOpts = o || {}; });
hide('_setHoldMs', ms => { inbox.holdMs = ms; });
hide('_reset', () => { for (const j of _mc.values()) mcKill(j); _mc.clear(); _mods.clear(); _lists.clear(); _loose.clear(); mf._reset(); inbox.q.length = 0; for (const w of inbox.waiters.slice()) w.finish([]); _intel = null; });
hide('_docOf', docOf);
hide('_prep', PREP);
hide('_ictxOf', ictxOf);
hide('_modDirOf', modDirOf);
hide('_waiters', () => inbox.waiters.length);
hide('_setLogs', fn => { _logsLoad = fn || (() => require('../logs/routes')); });
hide('_setIntel', o => { _intel = o || null; });
hide('_viewSweep', v => { _viewSwept = !!v; });
hide('_setKit', fn => { _kitLoad = fn || (() => require('../../../ide/kit')); });
module.exports = R;

#!/usr/bin/env node
// sdllint: strict SDL syntax linter for def/ext/set/mdl/mi/inc/info... (not .lng). rows SDL-01,02,04..08,10,12,13,16,17,19,21..25; WARN_STR_NOT_UTF8 (string value not UTF-8
// usage: node sdllint.js <folder> [--game <gameDir>] [--mods a,b] [-q]     include/define resolve: folder first, then game vfs
//        [--game-version V] [--no-version-check] [--exe as64|mowas_2|goh]  vfs mount version gate (default 3.262.1 AS2, GoH exe version); --exe goh, no --game = the GoH install
//        node sdllint.js --vfs --game <gameDir> [--mods a,b]               lint every SDL file in the vfs (vanilla regression)
//        [--restore-points]  also read <folder>/.arsenal-undo (restore points; the game never mounts them, so off by default)
//        [--listing f]  f = a lib/modtree scan of <folder> as JSON (wouldload hands its own): the folder is not listed again; a file
//        that does not read or is of another folder is ignored. Findings are the same either way
//        a folder reads only what the game mounts from a mod root (lib/sdlset keepOf). env ARSENAL_READ_WINDOW = files read ahead
//        at once (default 32, 0 = one by one); SDLLINT_THREADS = worker count
//        [--no-file-cache]  read every root (env ARSENAL_FILE_CACHE=0 the same). Default: a root whose kept read still stands (the file,
//        every include it opened and the game unchanged: filecache.js) is not read again; the report is the same. --time adds a
//        "file cache:" stderr line
// Author: Imperator_Aug (ARSENAL, ia-1428557a)
require('../lib/help')(__filename); // --help / -h: header usage, exit 0 (HELPFIX2)
const fs = require('fs'), path = require('path'), sdlset = require('../lib/sdlset'), sdlx = require('../lib/sdlx');
const rawchecks = require('./rawchecks');
const { createReport } = require('../lib/report'), cli = require('../lib/cli'), { sdlScan, bomKind } = require('../lib/enc');
const games = require('../lib/games');

const WARN = new Set(['PARAM_UNBALANCED', 'INT_RANGE', 'PAREN_STRAY']);   // INT_RANGE: consumer may read int64/float; PAREN_STRAY: 4 in vanilla

// macro findings of a file read alone, when the file is built to get its defines from an includer the mod doesn't ship:
// .inc/.ext, and rosters the base game includes. not proof of a bug, kept as info
const MACRO_CODES = new Set(['MACRO_UNDEFINED', 'UNREPLACED_PARAM', 'PARAM_UNBALANCED', 'WARN_PARAM_UNBALANCED']);
const isFragment = k => /\.(inc|ext)$/.test(k) || k.startsWith('resource/set/multiplayer/units/');
// {##on: an author-disabled block (GoH data: 79 in one mod; AS2: RobZ tank_armoredcar.inc:1447). check-false D: info on every game,
// refcheck DISABLED_ON (review) reports the same line [I]
const disabledTag = (code, msg) => code === 'TAG_SWALLOWS' && msg.startsWith('"{##');
// check-false D:
//  - a .def root outside resource/entity/ is never indexed as an entity ( enumerates /entity/**/*.def) [V]: info
//  - an OBJ-style .mtl (newmtl / no SDL block) that no .ply of its folder names is never read (wouldload/classes.js:49) [I]: info
//  - a fragment read alone: arithmetic/lexing on a caller's %param is not judgeable: info
//  - IDENT_SPLIT / NUMBER_GLUED on a line with a %param: macro text glued in a live roster, silent not crash (SDL-04/05) [I]
//  - MACRO_UNDEFINED in a file whose include is missing: follow-ons of that include, folded into the INCLUDE_MISSING line
const isEntityDef = k => !/\.def$/.test(k) || k.startsWith('resource/entity/');
const PCT_CODES = new Set(['ARITH_BAD', 'IDENT_SPLIT', 'NUMBER_GLUED']);

// ---- GoH only (GOHMOD-3; AS2/as64 runs never reach these). each = a vanilla GoH form the AS2 rule calls an error [V]
// -> [infoCode, why] or null. GoH the game not on hand: the GoH meaning of each form is [I]
function gohInfo(f, key, inDisabled) {
  if (inDisabled) return ['SDL_GOH_DISABLED_TAG', 'inside a {## disabled block'];
  if (f.code === 'MOD_NAME') return ['SDL_GOH_MOD_NAME', 'GoH sets more mod names (gametype:*, gameclass:*, hardcore in vanilla)'];
  if (f.code === 'UNREPLACED_PARAM' && /parameter % stays/.test(f.msg)) return ['SDL_GOH_PERCENT', 'bare % is a GoH value unit (vanilla dynamic_campaign "40 % MP")'];
  if (f.code === 'UNREPLACED_PARAM' && /\.reg$/.test(key)) return ['SDL_GOH_REG_TEMPLATE', 'GoH registry template name (vanilla library.reg {%faction ...})'];
  if (f.code === 'WARN_INT_RANGE') return ['SDL_GOH_INT64', 'GoH stores 64-bit ids here (Steam ids in vanilla .reg/.set)'];
  return null;
}
// line ranges of {## ... } blocks (strings and ; comments skipped). GoH data writes {##/* ... */} and {##if ...} there
function disabledRanges(buf) {
  const s = buf.toString('latin1'), out = [];
  let line = 1, depth = 0; const open = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\n') line++;
    else if (c === '"') { while (++i < s.length && s[i] !== '"') if (s[i] === '\n') line++; }
    else if (c === ';') { while (i + 1 < s.length && s[i + 1] !== '\n') i++; }
    else if (c === '{') { depth++; if (s[i + 1] === '#' && s[i + 2] === '#') open.push([depth, line]); }
    else if (c === '}') { if (open.length && open[open.length - 1][0] === depth) out.push([open.pop()[1], line]); depth--; }
  }
  return out;
}
// GoH folder not under <game>/mods (a Workshop mod is all paks): read the SDL entries of its paks directly. Only paks the GoH
// mount reads at resource/: <mod>/resource.pak and <mod>/resource/*.pak (lib/sdlset packed() keys them at 'resource/')
function gohPakItems(src, have) {
  const out = [], paks = new Set();
  for (const [k, r] of src.packed()) {
    const pf = r.file.slice(0, r.file.indexOf('!')).replace(/\\/g, '/').toLowerCase();
    if (pf !== 'resource.pak' && !/^resource\/[^/]+\.pak$/.test(pf)) continue;
    paks.add(pf);
    if (have.has(k) || !sdlset.isSdl(k) || !sdlset.extOf(k) && !k.startsWith('resource/set/stuff/')) continue;
    out.push({ key: k, file: r.file, get: () => src.readPacked(k) });
  }
  return { items: out, paks: paks.size };
}

// vfs files whose winning layer is the mod <scope> or one of its "<scope> patch N" layers (row 168). sdlset.modItems matches the layer name exactly
function scopedModItems(src, scope) {
  const s = scope && String(scope).toLowerCase(), layerOf = k => String(src.v.files.get(k).layer).toLowerCase();
  return src.vfsItems().filter(t => src.isModKey(t.key) && (!s || layerOf(t.key) === s || layerOf(t.key).startsWith(s + ' patch ')));
}

// rows 57/163: includers of a file, found in the vfs beside it (same first 3 path segments, e.g. resource/set/multiplayer) by reading include statements
// memo (the file cache, filecache.js fc.inc): get(key) -> [targets] | null (not text) | undefined (read it); put(key, that)
function findIncluders(src, key, cache, memo) {
  if (!src.v) return [];
  const seg = key.split('/'), pre = seg.slice(0, Math.min(3, seg.length - 1)).join('/') + '/';
  let list = cache.get(pre);
  if (!list) {
    list = [];
    for (const t of src.vfsItems()) {
      if (!t.key.startsWith(pre)) continue;
      const kept = memo ? memo.get(t.key) : undefined;
      if (kept !== undefined) { if (kept && kept.length) list.push({ t, targets: new Set(kept) }); continue; }
      let b; try { b = t.get(); } catch (e) { continue; }
      if (!b || b.includes(0)) { if (memo && b) memo.put(t.key, null); continue; }
      const txt = b.toString('latin1').toLowerCase(); let m; const re = /\binclude\s*"([^"]+)"/g; const targets = new Set();
      while ((m = re.exec(txt))) { try { const r = sdlx.resolveInclude(m[1], t.key); if (r && r.kind === 'virtual') targets.add(r.key); } catch (e) {} }
      if (memo) memo.put(t.key, [...targets]);
      if (targets.size) list.push({ t, targets });
    }
    cache.set(pre, list);
  }
  return list.filter(x => x.targets.has(key) && x.t.key !== key).map(x => x.t);
}

// --exe names the game (lib/games); none = as before: GoH when the game folder holds the GoH exe (binaries/x64, row 86)
const gohOf = opts => (opts.exe ? games.kindOf(opts.exe) === 'goh' : !!opts.gameDir && ['binaries/x64/call_to_arms.exe', 'call_to_arms.exe'].some(x => fs.existsSync(path.join(opts.gameDir, x))));
const finding = (list, file, line, code, msg, via) => {
  let m = msg;
  for (let x = via; x; x = x.via) m += ` [via ${x.file}:${x.line}]`;
  list.push({ file, line, code: (WARN.has(code) ? 'WARN_' : '') + code, msg: m, dk: file + ':' + line + ':' + code + ':' + msg });
};
// one root read: {skipped} | {read, list (its findings), extra (report rows [file, line, code, msg], in order)}. Plain data, so a worker
// (part.js) can hand it back. The bytes of the root are read once (before: once for the parse, again for the raw checks)
// rec (the file cache, filecache.js): also .opens = what the read opened (kind letter v|f|u + key, in order), .crashed on a throw
function readRoot(src, t, rec) {
  const list = [], extra = [], opens = rec ? [] : null;
  let read = false, mtlObj;
  try {
    let bb; const t1 = { key: t.key, file: t.file, get: () => (bb !== undefined ? bb : (bb = t.get())) };
    if (!(opens ? recRead(src, opens) : src.read)(t1, (file, line, code, msg, via) => finding(list, file, line, code, msg, via))) return opens ? { skipped: true, opens } : { skipped: true };
    read = true;
    // ENCFIX: as64 decodes every string value as UTF-8 [V shot]); bad bytes become U+FFFD with no log line
    let b = null; try { b = t1.get(); } catch (e) {}
    if (opens && b && /\.mtl$/.test(t.key)) mtlObj = objStyle(b);   // lint's objMtl takes it instead of reading the root again
    if (b) for (const x of rawchecks.scan(t.key, b)) extra.push([t.file, x.line, x.code, x.msg]);   // CHK-SDL: MAP-29 SDL-57 TST-104 SDL-09 SDL-11 SDL-18 SDL-20 SDL-28
    if (b && !b.includes(0)) for (const x of sdlScan(b, 5).badStr) extra.push([t.file, x.line, 'WARN_STR_NOT_UTF8', 'string value is not valid UTF-8: legacy cp1251 bytes, shows as U+FFFD on as64. change: resave the string as UTF-8 (lib/enc cp1251StringsToUtf8)']);
  } catch (e) { extra.push([t.file, 0, 'CRASH', e.stack.split('\n').slice(0, 3).join(' | ')]); if (opens) return { read, list, extra, opens, crashed: true }; }
  return opens ? (mtlObj === undefined ? { read, list, extra, opens } : { read, list, extra, opens, mtlObj }) : { read, list, extra };
}
// an OBJ-style .mtl (newmtl, or no SDL block)
const objStyle = b => { const s = b ? b.toString('latin1') : ''; return /^\s*newmtl\b/m.test(s) || !s.includes('{'); };
// src.read (lib/sdlset) with each include open noted in opens: the same steps, the same open
const recRead = (src, opens) => (t, onError) => {
  const b = t.get();
  if (b.includes(0) && !bomKind(b)) return null;
  const open = (r, from) => { opens.push((r.kind === 'virtual' ? 'v' : r.kind === 'fs' ? 'f' : 'u') + r.key); return src.open(r, from); };
  return sdlx.read(b, { file: t.file, key: t.key, open, onError, preInclude: src.preInclude(t.key) });
};
// the roots of a run, in reading order (rep: where the notes about paks go; a worker passes a scratch one)
function todoOf(opts, src, goh, rep) {
  let todo = opts.vfs ? src.vfsItems() : src.folderItems();
  if (!opts.vfs && opts.mods && opts.mods.length) { const have = new Set(todo.map(t => t.key)); todo = todo.concat(scopedModItems(src, opts.scope).filter(t => !have.has(t.key))); }
  else if (!opts.vfs && opts.folder && goh && [...src.local.keys()].some(k => k.endsWith('.pak'))) {
    const g = gohPakItems(src, new Set(todo.map(t => t.key)));
    todo = todo.concat(g.items);
    rep.info(opts.folder, 0, 'SDLLINT_PAKS_READ', `GoH mod not mounted: ${g.paks} resource paks read directly, ${g.items.length} SDL entries (pak order = name order [I])`);
  }
  else if (!opts.vfs && opts.folder && [...src.local.keys()].some(k => k.endsWith('.pak'))) rep.add(opts.folder, 0, 'WARN_SDLLINT_PAKS_UNREAD', 'mod has paks and they were not read: loose files only. change: pass --game and the folder from <game>/mods, or --mods <name>');
  // GoH: extensionless files outside set/stuff are text (vanilla texture/fx/.../license), not SDL
  if (goh) todo = todo.filter(t => sdlset.extOf(t.key) || t.key.startsWith('resource/set/stuff/'));
  return todo;
}

// ARSENAL_READ_WINDOW: how many root files are read at once ahead of the parser (lib/sdlset readAhead), default 32; 0 = none
function readWindow() {
  const v = process.env.ARSENAL_READ_WINDOW;
  if (v === undefined || v === '') return 32;
  const n = Math.floor(+v);
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 1024) : 32;
}
// readRoots(src, todo, idx) -> Promise<[readRoot result per idx]>: the same reads as idx.map(i => readRoot(src, todo[i])), in the
// same order; the loose root files (folder items: t.path) come through the thread pool, window at a time, ahead of the parse
// (lib/sdlset readAhead). A file the read-ahead does not hold is read by t.get as before (a failed read fails the same way)
async function readRoots(src, todo, idx, rec) {
  const win = readWindow();
  if (!win) return idx.map(i => readRoot(src, todo[i], rec));
  const ra = sdlset.readAhead({ window: win });
  try {
    for (const i of idx) if (todo[i].path) ra.add(todo[i].key, todo[i].path);
    const out = [];
    for (const i of idx) {
      const t = todo[i];
      if (!t.path) { out.push(readRoot(src, t, rec)); continue; }
      const w = ra.wait(t.key); if (w) await w;
      out.push(readRoot(src, { key: t.key, file: t.file, get: () => { const b = ra.take(t.key); return b !== undefined ? b : t.get(); } }, rec));
      ra.drop(t.key);
    }
    return out;
  } finally { ra.close(); }
}

// pre (optional, lintPar): {src, keys, roots: [readRoot result per root], included: [keys]} = the root reads done already (workers);
// used only when its keys are this run's roots, else every root is read here as before. pre.inc: the file cache's memo of the
// include targets of vfs files (findIncluders); a root result's mtlObj: its OBJ-style test, from the bytes the read had
function lint(opts, pre) {
  const rep = createReport();
  const goh = gohOf(opts);
  const src = pre && pre.src || sdlset.createSource(opts), included = src.included;
  let cur = null;   // findings of the current read (the includer reads below)
  const onError = (file, line, code, msg, via) => finding(cur, file, line, code, msg, via);
  const todo = todoOf(opts, src, goh, rep);
  const done = pre && pre.roots && pre.keys && pre.keys.length === todo.length && todo.every((t, i) => t.key === pre.keys[i]) ? pre : null;
  if (done) for (const k of done.included) included.add(k);
  const getOf = new Map(todo.map(t => [t.file, t.get])), ranges = new Map();
  const inDisabled = (file, line) => {
    if (!ranges.has(file)) {
      let b = null;
      try { const g = getOf.get(file); b = g ? g() : src.get(String(file).replace(/\\/g, '/').toLowerCase()); } catch (e) {}
      ranges.set(file, b ? disabledRanges(b) : []);
    }
    return ranges.get(file).some(([a, z]) => line >= a && line <= z);
  };
  let n = 0, skipped = 0;
  // every file is read as a root; files that some other file includes are fragments (defines/context come from the
  // includer), so findings of their standalone read are dropped. includer reads report them in context.
  const reads = [];
  for (let i = 0; i < todo.length; i++) {
    const t = todo[i], r = done ? done.roots[i] : readRoot(src, t);
    if (r.skipped) { skipped++; continue; }
    if (r.read) reads.push(r.mtlObj !== undefined && getOf.get(t.file) === t.get ? { key: t.key, file: t.file, list: r.list, mtlObj: r.mtlObj } : { key: t.key, file: t.file, list: r.list });
    for (const x of r.extra) rep.add(x[0], x[1], x[2], x[3]);
  }
  const seen = new Set(), incCache = new Map();
  // a root with macro findings that some vfs file includes: judge it through that includer (its defines are there), not alone
  const viaIncluder = r => {
    if (!src.v || !r.list.some(f => MACRO_CODES.has(f.code))) return null;
    const incs = findIncluders(src, r.key, incCache, pre && pre.inc);
    if (!incs.length) return null;
    const out = [];
    for (const it of incs) {
      cur = [];
      try { if (!src.read(it, onError)) continue; } catch (e) { continue; }
      for (const f of cur) if (f.file === r.file && MACRO_CODES.has(f.code)) out.push(f);
    }
    return out;
  };
  // source line text of a finding (for %param checks)
  const lines = new Map();
  const lineOf = (file, line) => {
    if (!lines.has(file)) {
      let b = null;
      try { const g = getOf.get(file); b = g ? g() : src.get(String(file).replace(/\\/g, '/').toLowerCase()); } catch (e) {}
      lines.set(file, b ? b.toString('latin1').split('\n') : []);
    }
    return lines.get(file)[line - 1] || '';
  };
  // .ply keys of a folder (loose, folder paks, vfs), read lazily: does any name this .mtl?
  let plyIdx = null;
  const plyNames = (key, base) => {
    if (!plyIdx) {
      plyIdx = new Map();
      const add = k => { if (!/\.ply$/.test(k)) return; const d = k.slice(0, k.lastIndexOf('/')); let a = plyIdx.get(d); if (!a) plyIdx.set(d, a = new Set()); a.add(k); };
      for (const k of src.local.keys()) add(k);
      for (const k of src.packed().keys()) add(k);
      if (src.v) for (const k of src.v.files.keys()) add(k);
    }
    const d = key.slice(0, key.lastIndexOf('/'));
    for (const k of plyIdx.get(d) || []) { try { const p = src.get(k); if (p && p.toString('latin1').toLowerCase().includes(base.toLowerCase())) return true; } catch (e) {} }
    return false;
  };
  const objMtl = r => {
    if (!/\.mtl$/.test(r.key)) return false;
    let obj = r.mtlObj;   // from the root read (file cache on), else read here
    if (obj === undefined) { let b = null; try { b = getOf.get(r.file) ? getOf.get(r.file)() : src.get(r.key); } catch (e) {} obj = objStyle(b); }
    return obj && !plyNames(r.key, r.key.slice(r.key.lastIndexOf('/') + 1));
  };
  // a bare folder of files (no resource/ dir) gets keys resource/<rel>: no layout to judge, so no root-level skip
  const realKeys = !!(opts.vfs || (opts.mods && opts.mods.length) || src.hasRes);
  let gi;
  for (const r of reads) {
    if (included.has(r.key)) continue;
    n++;
    const ctx = viaIncluder(r);
    let list = ctx ? r.list.filter(x => !MACRO_CODES.has(x.code)).concat(ctx) : r.list;
    // root-level skips: whole file never read by the engine
    const skip = realKeys && !isEntityDef(r.key) ? ['SDL_DEF_NOT_ENTITY', '.def outside resource/entity/: the engine indexes only /entity/**/*.def, so this file is not loaded as an entity [V]']
      : objMtl(r) ? ['SDL_MTL_UNREFERENCED', 'OBJ-style .mtl that no .ply in its folder names: never read [I]'] : null;
    if (skip) {
      for (const f of list) { if (seen.has(f.dk)) continue; seen.add(f.dk); rep.info(f.file, f.line, skip[0], `${f.code} ${f.msg} (${skip[1]})`); }
      continue;
    }
    // MACRO_UNDEFINED follow-ons of a missing include in the same file
    const incMiss = new Map();
    for (const f of list) if (f.code === 'INCLUDE_MISSING' && !incMiss.has(f.file)) incMiss.set(f.file, f);   // first missing include; macros used after it may come from it
    if (incMiss.size) {
      const fold = new Map();
      list = list.filter(f => { if (f.code === 'MACRO_UNDEFINED' && incMiss.has(f.file) && f.line > incMiss.get(f.file).line) { fold.set(f.file, (fold.get(f.file) || 0) + 1); return false; } return true; });
      for (const [file, k] of fold) { const f = incMiss.get(file); f.msg += ` (+${k} MACRO_UNDEFINED follow-on${k > 1 ? 's' : ''} in this file, folded)`; }
    }
    for (const f of list) {
      if (seen.has(f.dk)) continue; seen.add(f.dk);
      const pct = PCT_CODES.has(f.code) && (/"%/.test(f.msg) || lineOf(f.file, f.line).includes('%'));
      if (MACRO_CODES.has(f.code) && !ctx && isFragment(r.key)) rep.info(f.file, f.line, 'SDL_FRAGMENT_MACRO', f.msg + ' (fragment read alone: its includer is not in this mod)');
      else if (pct && isFragment(r.key) && f.code === 'ARITH_BAD') rep.info(f.file, f.line, 'SDL_FRAGMENT_MACRO', f.msg + ' (%param of the caller in a fragment read alone: not judgeable)');
      else if (pct && f.code !== 'ARITH_BAD') rep.add(f.file, f.line, f.code + '_MACRO', f.msg + ' (on a %param line: macro text, silent not crash [I] SDL-04/05)');
      else if (disabledTag(f.code, f.msg)) rep.info(f.file, f.line, goh ? 'SDL_GOH_DISABLED_TAG' : 'SDL_DISABLED_TAG', f.msg + ' ({## disables the block on purpose)');
      else if (goh && (gi = gohInfo(f, String(f.file).replace(/\\/g, '/').toLowerCase(), inDisabled(f.file, f.line)))) rep.info(f.file, f.line, gi[0], `${f.code} ${f.msg} (${gi[1]} [I])`);
      else rep.add(f.file, f.line, f.code, f.msg);
    }
  }
  return { rep, files: n, skipped };
}

// run(opts) -> report (no printing); opts as lint: {folder|vfs, gameDir, mods}
function run(opts) { return lint(opts).rep; }

// lintPar(opts) -> Promise<the lint result>: the same answer as lint(opts), with the root reads (parse + raw checks, the bulk: a mod
// with 120 maps is 235 MB of SDL, 20 s on one thread) shared out to worker threads (part.js) when there are many roots. Each worker
// builds the same source and roots itself (its keys must match, else lint reads every root here as before). A worker that fails
// or dies = its share only is read here, with one stderr line naming the worker and its error (out of memory shows); the good
// shares are kept, so the findings are the same. SDLLINT_THREADS=n sets the count (0 or 1 = one thread). Test hook:
// SDLLINT_TEST_FAIL_WORKER=N makes worker N (1..n-1) throw at start (part.js). CLI only; lint(opts) stays sync.
// File cache (filecache.js, on unless opts.fileCache === false or ARSENAL_FILE_CACHE=0): roots whose kept read still stands are not
// read; only the rest (want) are read here or by the workers. opts.cacheStats: set to the cache's stats ({kept, read, uncached, ms})
const PAR_MIN = 400;
async function lintPar(opts) {
  const os = require('os');
  const src = sdlset.createSource(opts), todo = todoOf(opts, src, gohOf(opts), createReport());
  const env = process.env.SDLLINT_THREADS;
  let n = env !== undefined && env !== '' ? Math.max(0, Math.min(16, +env || 0)) : Math.min(4, Math.floor(os.cpus().length / 3), Math.floor(os.freemem() / (600 << 20)));
  const keys = todo.map(t => t.key);
  const fc = require('./filecache').open(opts, src), rec = !!fc;
  const roots = new Array(todo.length), kept = [];
  let want = todo.map((t, i) => i);
  if (fc) { const h = fc.hits(todo); for (const [i, r] of h.got) roots[i] = r; for (const k of h.included) kept.push(k); want = h.miss; opts.cacheStats = fc.stats; }
  // the reads are all in roots: the cache keeps them (before lint, which appends to finding messages), lint takes them as done
  const finish = included => {
    const blob = fc ? fc.pack(todo, roots) : null;
    const r = lint(opts, { src, keys, roots, included: included.concat(kept), inc: fc ? fc.inc : null });
    if (blob) fc.write(blob);
    return r;
  };
  // one thread: every root read here (read-ahead), then lint takes the reads as done
  if (want.length < PAR_MIN || n < 2) {
    (await readRoots(src, todo, want, rec)).forEach((r, j) => { roots[want[j]] = r; });
    return finish([...src.included]);
  }
  const { Worker } = require('worker_threads');
  // a worker that fails or dies = {w, idx, why}: only its share is read again here (the good shares are kept)
  const one = w => new Promise(resolve => {
    const idx = []; for (let j = w; j < want.length; j += n) idx.push(want[j]);
    let got = null, err = null;
    const wk = new Worker(path.join(__dirname, 'part.js'), { workerData: { opts, keys, idx, w, rec }, stdout: true, stderr: true });
    wk.on('message', m => { got = m; });
    wk.on('error', e => { err = e; resolve({ w, idx, why: (e && e.message) || String(e) }); });
    wk.on('exit', code => resolve(got && got.ok ? Object.assign(got, { idx }) : { w, idx, why: err ? err.message : got && got.why ? got.why : got ? 'its roots differ from this run' : `exit ${code} without a result` }));
  });
  // share 0 is read here meanwhile (its source is built already); the workers take shares 1..n-1
  const run = Array.from({ length: n - 1 }, (x, w) => one(w + 1));
  const mine = [];
  for (let j = 0; j < want.length; j += n) mine.push(want[j]);
  (await readRoots(src, todo, mine, rec)).forEach((r, j) => { roots[mine[j]] = r; });
  const parts = await Promise.all(run);
  for (const p of parts) {
    if (p.ok) continue;
    try { fs.writeSync(2, `sdllint: worker ${p.w} failed (${String(p.why).replace(/[\r\n]+/g, ' ')}): its share was read on the main thread\n`); } catch { /* closed pipe */ }
    (await readRoots(src, todo, p.idx, rec)).forEach((r, j) => { roots[p.idx[j]] = r; });
  }
  const included = [...src.included];
  for (const p of parts) { if (!p.ok) continue; p.idx.forEach((i, j) => { roots[i] = p.roots[j]; }); for (const k of p.included) included.push(k); }
  return finish(included);
}

// readListing(file, dir) -> T | null: a lib/modtree scan saved as JSON (wouldload --listing) when it is a full scan of dir, taken
// as this process's scan (modtree.adopt); anything else (unreadable, another folder, names only) = null, the folder is listed here
function readListing(file, dir) {
  try {
    const T = JSON.parse(fs.readFileSync(file, 'utf8')), A = path.resolve(T.dir), B = path.resolve(dir);
    if ((process.platform === 'win32' ? A.toLowerCase() !== B.toLowerCase() : A !== B) || !require('../lib/modtree').adopt(T)) return null;
    return T;
  } catch (e) { return null; }
}

if (require.main === module) cli.run(async () => {
  const o = cli.parse(process.argv.slice(2), { flags: ['--vfs', '--no-version-check', '--time', '--restore-points', '--no-file-cache'], values: ['--game-version', '--exe', '--listing'] });
  if (o.x.exe && !games.get(o.x.exe)) { console.error('sdllint: --exe ' + o.x.exe + ': as64, mowas_2 (mowas2) or goh'); process.exit(2); }
  // --game-version V: mount mods as on that game version (vfs default: AS2 3.262.1, GoH the exe's version); --no-version-check: mount out-of-range mods anyway
  const opts = { gameDir: o.gameDir, mods: o.mods.length ? o.mods : undefined, vfs: o.x.vfs, folder: o.pos[0], gameVersion: o.x['game-version'], disableVersionControl: !!o.x['no-version-check'], exe: o.x.exe };
  if (games.kindOf(o.x.exe) === 'goh' && !opts.gameDir) opts.gameDir = games.install('goh').dir || undefined;   // --exe goh, no --game: the GoH install
  // a folder that is itself a mod of this game: mount it so its paks are read
  if (!opts.mods && opts.folder && opts.gameDir && path.resolve(path.dirname(opts.folder)).toLowerCase() === path.resolve(opts.gameDir, 'mods').toLowerCase()) opts.mods = [path.basename(path.resolve(opts.folder))];
  // only the mod asked about: dependencies mounted beside it have their own report
  if (opts.folder && opts.mods && opts.mods.length) opts.scope = path.basename(path.resolve(opts.folder));
  if (!opts.folder && !opts.vfs || opts.vfs && !opts.gameDir) { console.error('usage: sdllint <folder> [--game dir] [--mods a,b] [-q] [--summary] [--format text|json|sarif] [-o file] | --vfs --game dir'); process.exit(2); }
  if (o.x['restore-points']) opts.restorePoints = true;
  if (o.x['no-file-cache']) opts.fileCache = false;
  const t0 = Date.now();
  // the folder listed once (lib/modtree scan: readdir + stat through the thread pool); the source and every worker list it from
  // this scan. A scan that fails = each walks the folder as before
  // --listing f: that scan, made by the caller just before (wouldload), when it is of this folder: not listed again
  if (opts.folder && !opts.vfs && o.x.listing) { const T = readListing(o.x.listing, opts.folder); if (T) opts.listing = T; }
  if (opts.folder && !opts.vfs && !opts.listing) { try { if (fs.statSync(opts.folder).isDirectory()) opts.listing = await require('../lib/modtree').scan(path.resolve(opts.folder)); } catch (e) { /* walk */ } }
  const { rep, files, skipped } = await lintPar(opts);
  cli.printReport(rep, o, { tool: 'sdllint' });
  const line = `${files} files (${skipped} binary skipped)` + (o.x.time ? ` in ${Date.now() - t0} ms` : '');   // DET-FIX: duration only with --time
  if (o.format === 'text' && !o.output) console.log(line); else console.error(line);
  if (o.x.time) { const c = opts.cacheStats; console.error(c ? `file cache: ${c.kept} roots kept, ${c.read} read, ${c.uncached} not cacheable, includers ${c.incKept} kept ${c.incRead} read, ${c.ms} ms` : 'file cache: off'); }
});
module.exports = { lint, lintPar, run, readRoot, readRoots, todoOf, gohOf, readListing };

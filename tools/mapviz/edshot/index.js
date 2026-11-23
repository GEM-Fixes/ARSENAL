// edshot (MV-EDC, wave A): the editor shot parts that start nothing (tools/mapviz/README.md 1.6, design 8). Sync.
//   preflight({exe, root, instance?, profile?}, io?) -> record {v, ok, refuse:[code], absent:{name: bool}, running:[exe],
//       exe, root, instance, profile, at, seen:[name], notes:[{code, text}]}
//       refusal codes: EDSHOT_RUNNING (a game or editor exe that blocks this editor runs, or no process list),
//       EDSHOT_FILE_PRESENT (a run file is already in the working folder), EDSHOT_NOT_WRITABLE (the working folder is
//       not writable; checked without a test file), EDSHOT_INSTANCE0 (as64_ed without -instance N, N >= 1)
//   walk(root, {links:true, skip:[]}) -> [{rel, size, mtimeMs, dir, link?, followed?, why?, broken?, err?}]
//       own stat walker; follows a directory link once: not when its target is inside the walked tree or an
//       ancestor of it (a cycle) or was already followed through another link
//   diff(before, after, expected:[pattern]) -> {added, removed, changed, unexpected, limits}
//   EXPECTED, expectedFor({scope, route?, bak?}) -> [pattern]   the expected-change list of design 8 as data
//   moveout(root, runDir, record, io?) -> [{name, to}]  moves only minimap_render.png, minimap_render.png.temp and
//       dialogs.txt that the preflight record says were absent; throws MvError MV_REFUSED (detail {moved, refused})
//   importPicture(file, doc) -> rgba8 grid 'pic.edshot' over doc.boxes.world (README 1.6, 4.2); sidecar(grid, doc, made?)
//       resampled with raster resample(grid, w, h, 'box') when lib/raster is there, else with its own box filter
//   processList(io?) -> [lower case image name] | null    through tools/lib/platform processList (tasklist /fo csv /nh):
//       the only process call of this part. Shared libs it uses may run their own read-only calls (the CLI's checkOut
//       and --target go through gamedir, which may run reg export to find Steam).
// io (tests and the CLI): {tasklist() -> CSV text | [name] | null, spawn = platform's runner seam, env, rename(from, to)}.
// Never: start a game, an editor or uidrive; send input; write into an install or a profile; read a file in a profile.
// Author: Imperator_Aug (ARSENAL, ia-59c161c9)
'use strict';
const fs = require('fs'), path = require('path');
const mv = require('../mapviz');
const platform = require('../../lib/platform');
const { MvError } = mv;

const VERSION = 1;
const RUN_FILES = ['minimap_render.png', 'minimap_render.png.temp', 'dialogs.txt'];
const REFUSALS = ['EDSHOT_RUNNING', 'EDSHOT_FILE_PRESENT', 'EDSHOT_NOT_WRITABLE', 'EDSHOT_INSTANCE0'];
// a run file whose modification time is this long before the preflight was there before it. Modification time only: NTFS
// tunneling gives a new file the creation time of a same-named file removed from the folder in the last ~15 s
const TIME_SLACK_MS = 1000;

// Which running exe blocks which editor (design 8 preflight). tasklist shows no command line, so an as64 or as64_ed
// of unknown instance counts as instance 0 for mowas_2_ed. One editor at a time across games (an out-of-memory run is
// on record), so every editor exe blocks every editor.
const EDITORS = ['as64_ed.exe', 'mowas_2_ed.exe', 'call_to_arms_ed.exe'];
const EXES = {
  as64_ed: { file: 'as64_ed.exe', instance: true, game: 'AS64 build', blocks: ['as64.exe'].concat(EDITORS) },
  mowas_2_ed: { file: 'mowas_2_ed.exe', instance: false, game: 'MoW:AS2', blocks: ['mowas_2.exe', 'as64.exe'].concat(EDITORS) },
  goh_ed: { file: 'binaries/x64/call_to_arms_ed.exe', instance: false, game: 'Gates of Hell',
    blocks: ['call_to_arms.exe', 'call_to_arms_server.exe'].concat(EDITORS) },
};

// The expected-change list of design 8, as data. Patterns: '/' separated, '*' and '?' inside one name, '**' any depth
// (also none), no case. install = the working folder (root level only); profile = the player profile folder.
const EXPECTED = Object.freeze({
  install: Object.freeze(RUN_FILES.slice()),
  profile: Object.freeze(['log/**', 'shader_cache/**', 'profiles/*/options.set', 'profiles/*/options.set.modswitch.bak',
    'settings.set', 'profiles/*/settings.set', 'options.set.temp', 'profiles/*/options.set.temp']),
  // the GoH console route: ed_storeMinimap writes a PNG somewhere in the profile [T -> G7: narrow to its folder]
  gohConsole: Object.freeze(['**/*.png']),
});
const SAME_SIZE_TIME = 'a rewrite that keeps a file\'s size and time (for example inside mods/) is not seen by this check';

function expectedFor(o) {
  o = o || {};
  if (o.scope === 'install') return EXPECTED.install.slice();
  if (o.scope !== 'profile') throw new MvError('MV_USAGE', 'scope must be install or profile, got ' + o.scope);
  let list = EXPECTED.profile.slice();
  if (o.route === 'console') list = list.concat(EXPECTED.gohConsole);
  if (o.bak) {
    if (!/^[A-Za-z0-9_.-]{1,80}$/.test(String(o.bak)) || /^\.+$/.test(String(o.bak))) throw new MvError('MV_USAGE', 'bad backup file name ' + o.bak);
    list.push('profiles/*/' + o.bak);
  }
  return list;
}

// ---- small helpers ----
const isWinPath = process.platform === 'win32';
function norm(p) { const r = path.resolve(p).replace(/\\/g, '/').replace(/\/+$/, ''); return isWinPath ? r.toLowerCase() : r; }
function inside(child, parent) { const c = norm(child), p = norm(parent); return c === p || c.startsWith(p + '/'); }
function realOf(p) { try { return fs.realpathSync.native(p); } catch (e) { try { return fs.realpathSync(p); } catch (e2) { return path.resolve(p); } } }
function lstat(p) { try { return fs.lstatSync(p); } catch (e) { return null; } }
function stat(p) { try { return fs.statSync(p); } catch (e) { return null; } }
function note(code, text) { return { code, text }; }

// ---- the process list (tools/lib/platform: tasklist /fo csv /nh, null when there is no list) ----
function parseTasklist(text) {
  return platform.parseTasklistCsv(text).map(p => String(p.name).toLowerCase()).filter(Boolean);
}
// processList(io) -> [lower case names] | null when no list can be read (callers refuse: fail closed)
function processList(io) {
  if (io && typeof io.tasklist === 'function') {
    const r = io.tasklist();
    if (r === null || r === undefined) return null;
    return Array.isArray(r) ? r.map(s => String(s).toLowerCase()) : parseTasklist(r);
  }
  let list;
  try { list = platform.processList(io && typeof io.spawn === 'function' ? { spawn: io.spawn } : undefined); } catch (e) { return null; }
  if (!Array.isArray(list)) return null;
  const names = list.map(p => String((p && p.name) || '').toLowerCase()).filter(Boolean);
  return names.length ? names : null;
}

function exeInfo(exe) {
  const x = EXES[exe];
  if (!x) throw new MvError('MV_USAGE', '--exe must be as64_ed, mowas_2_ed or goh_ed, got ' + exe);
  return x;
}

function runningBlockers(exe, io) {
  const list = processList(io);
  if (!list) return null;
  const want = EXES[exe].blocks;
  return want.filter(n => list.includes(n));
}

// writable(dir, io) -> {ok, why, note}: no test file. A folder under Windows is not writable for the editor. A folder
// under Program Files is not either (UAC, 64-bit exe, no virtual store) [I], except a Steam library there: Steam's
// installer gives Users write access to its folder [I], so that is a note (EDSHOT_MAYBE_UNWRITABLE), not a refusal; the
// engine's "Error creating filestream" stop reason (design 8) covers one that really cannot be written. access(W_OK)
// catches a read-only folder where the system reports it (on Windows it ignores a folder's read-only flag).
function writable(dir, io) {
  const env = (io && io.env) || process.env;
  for (const k of ['SystemRoot', 'windir']) {
    const g = env[k];
    if (g && inside(dir, g)) return { ok: false, why: 'the folder is under the Windows folder', note: null };
  }
  let maybe = null;
  for (const k of ['ProgramFiles', 'ProgramFiles(x86)', 'ProgramW6432']) {
    const g = env[k];
    if (!g || !inside(dir, g)) continue;
    if (!/\/steamapps\/common\//.test(norm(dir) + '/')) return { ok: false, why: 'the folder is under a system folder (' + g.replace(/.*[\\/]/, '') + ')', note: null };
    maybe = note('EDSHOT_MAYBE_UNWRITABLE', 'the folder is a Steam library under ' + g.replace(/.*[\\/]/, '') + '; Steam usually lets users write there, but if the editor cannot it stops with a write error');
  }
  try { fs.accessSync(dir, fs.constants.W_OK); } catch (e) { return { ok: false, why: 'the system says the folder is not writable (' + e.code + ')', note: null }; }
  return { ok: true, why: null, note: maybe };
}

// ---- preflight ----
function preflight(o, io) {
  o = o || {};
  const x = exeInfo(o.exe);
  if (!o.root) throw new MvError('MV_USAGE', 'give --root <folder>, the folder the editor runs in');
  const root = path.resolve(String(o.root));
  const rst = stat(root);
  if (!rst || !rst.isDirectory()) throw new MvError('MV_NOT_FOUND', 'no folder ' + root);
  const at = Date.now();
  const refuse = [], notes = [], absent = {};
  let instance = o.instance === undefined || o.instance === null || o.instance === '' ? null : Number(o.instance);
  if (instance !== null && !Number.isFinite(instance)) instance = NaN;
  // 1. which exes run
  const running = runningBlockers(o.exe, io);
  if (running === null) { refuse.push('EDSHOT_RUNNING'); notes.push(note('EDSHOT_NO_PROCESS_LIST', 'the process list could not be read, so a running game cannot be ruled out')); }
  else if (running.length) { refuse.push('EDSHOT_RUNNING'); notes.push(note('EDSHOT_RUNNING', 'running now: ' + running.join(', '))); }
  // 2. the run files
  const seen = [];
  try { for (const n of fs.readdirSync(root)) seen.push(n.toLowerCase()); } catch (e) { notes.push(note('EDSHOT_UNLISTED', 'the folder could not be listed (' + e.code + ')')); }
  seen.sort();
  for (const n of RUN_FILES) {
    const there = !!lstat(path.join(root, n)) || seen.includes(n);
    absent[n] = !there;
  }
  const present = RUN_FILES.filter(n => !absent[n]);
  if (present.length) { refuse.push('EDSHOT_FILE_PRESENT'); notes.push(note('EDSHOT_FILE_PRESENT', 'already there: ' + present.join(', '))); }
  // 3. writable without a test file
  const w = writable(root, io);
  if (!w.ok) { refuse.push('EDSHOT_NOT_WRITABLE'); notes.push(note('EDSHOT_NOT_WRITABLE', w.why)); }
  else if (w.note) notes.push(w.note);
  // 4. instance
  if (x.instance) {
    if (!(Number.isInteger(instance) && instance >= 1)) { refuse.push('EDSHOT_INSTANCE0'); notes.push(note('EDSHOT_INSTANCE0', 'as64_ed runs only with -instance N, N from 1 up; got ' + (instance === null ? 'none' : o.instance))); }
  } else if (instance) notes.push(note('EDSHOT_NO_INSTANCE', o.exe + ' has no -instance switch: it runs as instance 0 and uses the main profile'));
  // the editor exe and the profile: stat only, notes only
  if (!stat(path.join(root, x.file))) notes.push(note('EDSHOT_EXE_ABSENT', x.file + ' is not in this folder'));
  let profile = null;
  if (o.profile) {
    profile = path.resolve(String(o.profile));
    const pst = stat(profile);
    if (!pst || !pst.isDirectory()) notes.push(note('EDSHOT_PROFILE_ABSENT', 'no profile folder there'));
  }
  return { v: 1, ok: refuse.length === 0, refuse, absent, running: running || [], exe: o.exe, root, instance: Number.isFinite(instance) ? instance : null,
    profile, at, seen, notes };
}

// ---- walk ----
// globRe(pattern): '/' separated; '*' and '?' stay inside one name; '**' = any number of names (also none); no case
function globRe(p) {
  const segs = String(p).replace(/\\/g, '/').split('/').filter(s => s !== '');
  let re = '', sep = false;     // sep: the next name needs a '/' before it
  segs.forEach((s, i) => {
    if (s === '**') {
      if (i === segs.length - 1) re += sep ? '(?:/.*)?' : '.*';
      else re += sep ? '(?:/[^/]+)*' : '(?:[^/]+/)*';
      return;
    }
    if (sep) re += '/';
    re += s.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]');
    sep = true;
  });
  return new RegExp('^' + re + '$', 'i');
}

function walk(root, o) {
  o = Object.assign({ links: true, skip: [] }, o || {});
  const top = path.resolve(String(root));
  const tst = stat(top);
  if (!tst || !tst.isDirectory()) throw new MvError('MV_NOT_FOUND', 'no folder ' + top);
  const skips = (o.skip || []).map(globRe);
  const topReal = realOf(top);
  const followed = [];            // real targets of links already followed
  const out = [];
  function covered(real, stack) {
    if (inside(real, topReal)) return 'inside';
    for (const s of stack) if (inside(s, real)) return 'cycle';
    for (const f of followed) if (inside(real, f)) return 'seen';
    return null;
  }
  function visit(abs, rel, stack) {
    let names;
    try { names = fs.readdirSync(abs); } catch (e) { return e.code || 'EREAD'; }
    names.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    for (const n of names) {
      const r = rel ? rel + '/' + n : n;
      if (skips.some(re => re.test(r))) continue;
      const a = path.join(abs, n);
      const ls = lstat(a);
      if (!ls) { out.push({ rel: r, size: 0, mtimeMs: 0, dir: false, err: 'ESTAT' }); continue; }
      if (ls.isSymbolicLink()) {
        const ts = stat(a);
        if (!ts) { out.push({ rel: r, size: ls.size, mtimeMs: ls.mtimeMs, dir: false, link: true, broken: true }); continue; }
        if (!ts.isDirectory()) { out.push({ rel: r, size: ts.size, mtimeMs: ts.mtimeMs, dir: false, link: true }); continue; }
        const e = { rel: r, size: 0, mtimeMs: ts.mtimeMs, dir: true, link: true, followed: false };
        out.push(e);
        if (!o.links) { e.why = 'off'; continue; }
        const real = realOf(a);
        const why = covered(real, stack);
        if (why) { e.why = why; continue; }
        followed.push(real);
        e.followed = true;
        const err = visit(a, r, stack.concat([real]));
        if (err) e.err = err;
      } else if (ls.isDirectory()) {
        const e = { rel: r, size: 0, mtimeMs: ls.mtimeMs, dir: true };
        out.push(e);
        const err = visit(a, r, stack.concat([stack.length ? path.join(stack[stack.length - 1], n) : a]));
        if (err) e.err = err;
      } else out.push({ rel: r, size: ls.size, mtimeMs: ls.mtimeMs, dir: false });
    }
    return null;
  }
  const err = visit(top, '', [topReal]);
  if (err) throw new MvError('MV_NOT_FOUND', 'the folder could not be listed (' + err + ')');
  return out;
}

// ---- diff ----
function parentRes(patterns) {
  const out = [];
  for (const p of patterns) {
    const segs = String(p).replace(/\\/g, '/').split('/').filter(Boolean);
    if (segs.length > 1) out.push(globRe(segs.slice(0, -1).join('/')));
    if (segs[segs.length - 1] === '**') out.push(globRe(p));
  }
  return out;
}

function checkList(l, what) {
  if (!Array.isArray(l) || l.some(e => !e || typeof e.rel !== 'string')) throw new MvError('MV_USAGE', what + ' is not a walk list');
}

function diff(before, after, expected) {
  checkList(before, 'before'); checkList(after, 'after');
  const pats = (expected || []).map(String);
  const res = pats.map(globRe), pres = parentRes(pats);
  const A = new Map(before.map(e => [e.rel, e])), B = new Map(after.map(e => [e.rel, e]));
  const added = [], removed = [], changed = [], unexpected = [];
  const isExp = rel => res.some(re => re.test(rel));
  for (const e of after) if (!A.has(e.rel)) { added.push(e); if (!isExp(e.rel)) unexpected.push({ rel: e.rel, change: 'added' }); }
  for (const e of before) if (!B.has(e.rel)) { removed.push(e); if (!isExp(e.rel)) unexpected.push({ rel: e.rel, change: 'removed' }); }
  for (const e of before) {
    const f = B.get(e.rel);
    if (!f) continue;
    const what = [];
    if (!!e.dir !== !!f.dir) what.push('kind');
    if ((e.size || 0) !== (f.size || 0)) what.push('size');
    if (Math.floor(e.mtimeMs || 0) !== Math.floor(f.mtimeMs || 0)) what.push('time');   // whole ms: a time set back by a tool keeps only that
    if (!!e.link !== !!f.link || (e.err || null) !== (f.err || null)) what.push('link');
    if (!what.length) continue;
    changed.push({ rel: e.rel, what, before: e, after: f });
    // a folder's time moves whenever a name inside it is made or removed: expected where the list expects a name inside it
    const dirTimeOnly = e.dir && f.dir && what.length === 1 && what[0] === 'time';
    if (isExp(e.rel) || (dirTimeOnly && pres.some(re => re.test(e.rel)))) continue;
    unexpected.push({ rel: e.rel, change: 'changed', what });
  }
  unexpected.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  return { added, removed, changed, unexpected, limits: [SAME_SIZE_TIME] };
}

// ---- moveout ----
function refusal(name, code, why) { return { name, code, why }; }

function moveout(root, runDir, record, io) {
  io = io || {};
  const R = path.resolve(String(root || ''));
  const bad = why => { throw new MvError('MV_REFUSED', 'move-out refused: ' + why, { moved: [], refused: [refusal(null, 'EDSHOT_RECORD', why)] }); };
  if (!record || typeof record !== 'object' || record.v !== 1 || !record.absent || typeof record.at !== 'number' || !Array.isArray(record.seen))
    bad('no preflight record (a bare absent list carries no time to check against)');
  if (!root || norm(record.root || '') !== norm(R)) bad('the preflight record is for another folder');
  if (record.ok !== true || (record.refuse || []).length) bad('the preflight refused this run');
  if (!EXES[record.exe]) bad('the preflight record names no editor');
  for (const n of RUN_FILES) if (typeof record.absent[n] !== 'boolean') bad('the preflight record has no answer for ' + n);
  if (!runDir) throw new MvError('MV_USAGE', 'no run folder');
  const D = path.resolve(String(runDir));
  if (inside(D, R) || inside(R, D)) bad('the run folder and the working folder overlap');
  const running = runningBlockers(record.exe, io);
  if (running === null || running.length)
    throw new MvError('MV_REFUSED', 'move-out refused: ' + (running ? 'still running: ' + running.join(', ') : 'the process list could not be read'),
      { moved: [], refused: [refusal(null, 'EDSHOT_RUNNING', running ? running.join(', ') : 'no process list')] });
  // plan every file first: a record that does not hold up moves nothing
  const plan = [], refused = [];
  for (const n of RUN_FILES) {
    const src = path.join(R, n), ls = lstat(src);
    if (!ls) continue;
    if (!record.absent[n] || record.seen.includes(n)) { refused.push(refusal(n, 'EDSHOT_NOT_OURS', 'it was there at the preflight; left in place')); continue; }
    if (!ls.isFile()) { refused.push(refusal(n, 'EDSHOT_NOT_FILE', 'not a plain file; left in place')); continue; }
    if (ls.mtimeMs < record.at - TIME_SLACK_MS) { refused.push(refusal(n, 'EDSHOT_NOT_OURS', 'it was last written before the preflight, so the record is wrong; left in place')); continue; }
    plan.push({ name: n, src, size: ls.size });
  }
  if (refused.length) throw new MvError('MV_REFUSED', 'move-out refused: ' + refused.map(r => r.name + ' ' + r.code).join(', '), { moved: [], refused });
  const moved = [];
  if (!plan.length) return moved;
  const stop = (n, code, why) => { throw new MvError('MV_REFUSED', 'move-out stopped at ' + n + ': ' + why, { moved, refused: [refusal(n, code, why)] }); };
  try { fs.mkdirSync(D, { recursive: true }); } catch (e) { stop(plan[0].name, 'EDSHOT_TARGET_UNWRITABLE', 'the run folder cannot be made (' + e.code + ')'); }
  const dst0 = stat(D);
  if (!dst0 || !dst0.isDirectory()) stop(plan[0].name, 'EDSHOT_TARGET_UNWRITABLE', 'the run folder is not a folder');
  const rename = io.rename || fs.renameSync;
  for (const p of plan) {
    const to = path.join(D, p.name);
    if (lstat(to)) stop(p.name, 'EDSHOT_TARGET_EXISTS', 'the run folder already holds ' + p.name);
    try { rename(p.src, to); } catch (e) {
      if (e.code !== 'EXDEV') stop(p.name, 'EDSHOT_TARGET_UNWRITABLE', 'cannot move (' + (e.code || e.message) + ')');
      // another drive: copy, check the size, then remove the source
      try { fs.copyFileSync(p.src, to, fs.constants.COPYFILE_EXCL); } catch (e2) { stop(p.name, 'EDSHOT_TARGET_UNWRITABLE', 'cannot copy (' + e2.code + ')'); }
      const c = stat(to);
      if (!c || c.size !== p.size) { try { fs.unlinkSync(to); } catch (e3) { /* named below */ } stop(p.name, 'EDSHOT_TARGET_UNWRITABLE', 'the copy is not whole'); }
      try { fs.unlinkSync(p.src); } catch (e4) { stop(p.name, 'EDSHOT_SOURCE_LOCKED', 'copied, but the file in the working folder cannot be removed (' + e4.code + ')'); }
    }
    moved.push({ name: p.name, to });
  }
  return moved;
}

// ---- import ----
function worldBox(doc) {
  const b = doc && doc.boxes && doc.boxes.world;
  if (!Array.isArray(b) || b.length !== 4 || b.some(v => typeof v !== 'number' || !Number.isFinite(v)) || !(b[2] > b[0]) || !(b[3] > b[1]))
    throw new MvError('MV_USAGE', 'the map document has no usable world box (boxes.world [x0,y0,x1,y1] with x0 < x1, y0 < y1)');
  return b;
}

function weights(n, m) {          // source n pixels -> m pixels: per output pixel [k0, w0, w1, ...]
  const s = n / m, out = new Array(m);
  for (let x = 0; x < m; x++) {
    const s0 = x * s, s1 = (x + 1) * s, k0 = Math.floor(s0), k1 = Math.min(n, Math.ceil(s1));
    const w = [];
    for (let k = k0; k < k1; k++) w.push((Math.min(s1, k + 1) - Math.max(s0, k)) / s);
    out[x] = { k0, w };
  }
  return out;
}

// fallback box resample (only while lib/raster is absent) of straight-alpha RGBA, premultiplied by alpha first
// (README 9.2), one output row at a time; its bytes may differ from raster's by rounding
function resampleBox(src, pw, ph, w, h) {
  const out = new Uint8ClampedArray(w * h * 4);
  if (pw === w && ph === h) { out.set(src); return out; }
  const wx = weights(pw, w), wy = weights(ph, h);
  const rowCache = new Map();
  function hrow(y) {
    let r = rowCache.get(y);
    if (r) return r;
    r = new Float64Array(w * 4);
    const base = y * pw * 4;
    for (let x = 0; x < w; x++) {
      const { k0, w: ws } = wx[x];
      let pr = 0, pg = 0, pb = 0, pa = 0;
      for (let t = 0; t < ws.length; t++) {
        const i = base + (k0 + t) * 4, a = src[i + 3], f = ws[t];
        pr += ((src[i] * a + 127) / 255 | 0) * f; pg += ((src[i + 1] * a + 127) / 255 | 0) * f;
        pb += ((src[i + 2] * a + 127) / 255 | 0) * f; pa += a * f;
      }
      r[x * 4] = pr; r[x * 4 + 1] = pg; r[x * 4 + 2] = pb; r[x * 4 + 3] = pa;
    }
    if (rowCache.size > 4) rowCache.delete(rowCache.keys().next().value);
    rowCache.set(y, r);
    return r;
  }
  const acc = new Float64Array(w * 4);
  for (let y = 0; y < h; y++) {
    acc.fill(0);
    const { k0, w: ws } = wy[y];
    for (let t = 0; t < ws.length; t++) {
      const r = hrow(k0 + t), f = ws[t];
      for (let i = 0; i < acc.length; i++) acc[i] += r[i] * f;
    }
    const o = y * w * 4;
    for (let x = 0; x < w; x++) {
      const a = acc[x * 4 + 3], A = Math.round(a);
      out[o + x * 4 + 3] = A;
      if (A === 0) continue;
      for (let c = 0; c < 3; c++) out[o + x * 4 + c] = Math.min(255, Math.round(acc[x * 4 + c] * 255 / a));
    }
  }
  return out;
}

function importPicture(file, doc) {
  const box = worldBox(doc);
  let buf;
  try { buf = fs.readFileSync(String(file)); } catch (e) { throw new MvError('MV_NOT_FOUND', 'no picture file ' + file); }
  const png = require('../lib/raster/png');
  let pic;
  try { pic = png.decode(buf); } catch (e) { throw new MvError('MV_USAGE', 'the picture cannot be read: ' + e.message, { code: e.code || null }); }
  const bw = box[2] - box[0], bh = box[3] - box[1];
  const cell = Math.max(bw, bh) / Math.max(pic.w, pic.h);
  const w = Math.max(1, Math.round(bw / cell)), h = Math.max(1, Math.round(bh / cell));
  // file row 0 = min world y = grid row 0: no flip (README 4.2 "Pictures read from files")
  let data, by;
  const ras = rasterLib();
  if (pic.w === w && pic.h === h) { data = new Uint8ClampedArray(pic.rgba.length); data.set(pic.rgba); by = 'none'; }
  else if (ras) {
    // the contract's box resample (README 1.2), so an imported shot and a raster-resampled picture agree byte for byte
    const g = ras.make({ name: 'pic.edshot', w: pic.w, h: pic.h, cell, ox: box[0], oy: box[1], etype: 'rgba8', sample: 'cell' });
    g.data.set(pic.rgba);
    data = ras.resample(g, w, h, 'box').data;
    by = 'raster';
  } else { data = resampleBox(pic.rgba, pic.w, pic.h, w, h); by = 'edshot'; }
  return { name: 'pic.edshot', w, h, cell, ox: box[0], oy: box[1], etype: 'rgba8', sample: 'cell', scale: 1, offset: 0, nodata: null,
    meta: { from: [pic.w, pic.h], resample: by }, data };
}
// lib/raster (MV-RAS) is loaded lazily: absent while it is written, then the own box filter stands in
function rasterLib() { return mv.opt(() => require('../lib/raster'), '../lib/raster', __filename); }

// sidecar(grid, doc, made) -> the picture sidecar of README 4.4
function sidecar(grid, doc, made) {
  return { v: 1, layer: grid.name, w: grid.w, h: grid.h, box: worldBox(doc).slice(), cell: grid.cell, rowOrder: 'minY-first',
    target: (doc && doc.game) || null, stackHash: (doc && doc.stack && doc.stack.hash) || null, mapHashes: null, rung: null, env: null,
    gaps: null, approx: null, brightness: null, made: made || new Date().toISOString() };
}

module.exports = { VERSION, RUN_FILES, REFUSALS, EXES, EXPECTED, TIME_SLACK_MS, expectedFor, processList, parseTasklist,
  preflight, walk, diff, moveout, importPicture, sidecar, globRe, _resampleBox: resampleBox, _rasterLib: rasterLib };

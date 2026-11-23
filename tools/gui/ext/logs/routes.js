// logs ext routes. Everything here is read-only: logs, options.set, mod folders and game data are only read. Nothing is cleared, copied or deleted.
//   GET  /api/x/logs/find[?dir=]                  log folders of every instance, newest first (game.log, game.prev.log, crash dumps, oos)
//   POST /api/x/logs/explain {dir|file, inst, all, mod}  logtriage -> plain cards
//   POST /api/x/logs/dump {file}                  one crash sidecar -> Exception block in plain words
//   GET  /api/x/logs/enabled[?options=&game=]     what the game has enabled (options.set), read-only, with warnings
//   POST /api/x/logs/modwhy {mod, game?, deep?}   why is my mod not in the list
//   POST /api/x/logs/unit {mod, unit, game?, deep?}  unit chain: def, model, material, buy card, army, icon
//   GET  /api/x/logs/ticklist?mod=                test lines to try in the game after a run
// The game of the request (lib/games id: as64 | mowas2 | goh) comes from body.target, else ctx.gameId() (the page's game, sent by api());
// none named = as before (the AS2 user dir, the AS2 install, the as64 view). find(url, ctx) and logs.find for other exts take the same ctx.
//   as64, mowas2: one AS2 user dir with its instance dirs (both exes use the same AS2 user and log dir [I]; -instance is as64.exe only, TST-19, so under mowas2 find
//     lists the main log folder only and counts the skipped "- instance N" folders in skippedInstances). mowas2: no as64+ (VFS-47: built into as64.exe
//     only), a new-mode mod (MinGameVersion 3.301 or more) is skipped by mowas_2.exe; unit chain reads the vfs view exe mowas_2;
//     tools get --exe mowas_2 (logtriage, refcheck) or --exe mowas2 (wouldload).
//   goh: user dir from userdir.gohUserDir (GHVFS-13, LOG-22: Documents\My Games\Gates of Hell or %LOCALAPPDATA%\digitalmindsoft\gates of hell),
//     no instance dirs; minidumps in log/minidumps (GHLOG-36); the game folder is ctx.curDir() (the GoH install); logtriage --exe goh;
//     crash text form GHLOG-09/GHLOG-10 (RIP=, 0x0bad000N, "message (file:line) @ [thread]") [I];
//     the error line is taken only from a few lines around the code or RIP line (same stamp first) and is called a guess;
//     enabled/modwhy: no as64+, folder name rule GHVFS-27, mod.info bounds open when missing and Tags "develop" (GHVFS-02,
//     vfs/goh-modinfo-version-rule), list wipe version from settings.set as modswitch [T]; wouldload --exe goh --goh <dir>;
//     unit chain on the vfs view exe goh: cards in set/multiplayer/units/** ({"name" ("template" side(x) ...)} or (... name(x) side(x))
//     or vehicle(x) in a squad card), doctrine/conditions shown (GHGPL-05) [I]; no bot.data.lua (GHMIS-66).
// Author: Imperator_Aug (ARSENAL, ia-22d48061)
const fs = require('fs'), path = require('path');
const userdir = require('../../../lib/userdir');
const vfsLib = require('../../../lib/vfs');
const games = require('../../../lib/games');
const plain = require('./plain');

// the request's game: body.target (the page's curGame().target), else the ctx game; null = none named (old behaviour)
function gidOf(ctx, body) {
  const t = body && typeof body.target === 'string' && games.idOf(body.target);
  if (t) return t;
  try { return (ctx && typeof ctx.gameId === 'function' && games.idOf(ctx.gameId())) || null; } catch { return null; }
}
const isGoh = gid => gid === 'goh';
// GoH user dir; AS2_HOME (tests) keeps the search inside that home
const gohOpt = () => (process.env.AS2_HOME ? { home: process.env.AS2_HOME, env: { LOCALAPPDATA: path.join(process.env.AS2_HOME, 'AppData', 'Local') }, readReg: () => null } : {});
const gohUser = () => { try { return userdir.gohUserDir(gohOpt()); } catch { return null; } };
function gohProfiles() {
  const u = gohUser(), p = u && path.join(u, 'profiles');
  if (!p || !isDir(p)) return [];
  return fs.readdirSync(p).map(id => path.join(p, id, 'options.set')).filter(f => { const s = stat(f); return !!(s && s.isFile()); });
}
const profilesOf = gid => (isGoh(gid) ? gohProfiles() : userdir.profiles(0, homeOpt()));
// GoH folder name rule (GHVFS-27): byte >= 0x80, space or one of <>+()[]{}!@#$%^&*-=;:|'" -> the folder is skipped
const gohBadName = n => /[^\x00-\x7f]|[\s<>+()[\]{}!@#$%^&*\-=;:|'"]/.test(n);
// GoH game version for the mod.info bounds: the exe's own (1.0.6.7 -> 1.067, as tools/modinfo), else settings.set lastGameVersion
function gohVersion(game, prof) {
  try { const exe = game && path.join(game, 'binaries', 'x64', 'call_to_arms.exe'); const pe = exe && stat(exe) && require('../../../lib/gamever').peVersion(exe), m = pe && /^(\d+)\.(\d)\.(\d)\.(\d)/.exec(pe); if (m) return m[1] + '.' + m[2] + m[3] + m[4]; } catch { /* no exe */ }
  return lastGameVersion(prof);
}
function lastGameVersion(prof) {
  try { const m = /lastGameVersion\s+"([^"]*)"/i.exec(fs.readFileSync(path.join(path.dirname(prof), 'settings.set'), 'latin1')); return m ? m[1] : null; } catch { return null; }
}
const verNums = s => String(s || '').replace(/[^0-9.]/g, '').split('.').filter(x => x !== '').map(Number);
const verCmp = (a, b) => { for (let i = 0; i < Math.max(a.length, b.length); i++) { const d = (a[i] || 0) - (b[i] || 0); if (d) return d < 0 ? -1 : 1; } return 0; };
// GoH version gate (vfs/goh-modinfo-version-rule, GHVFS-02): tag develop = any version; Min and Max each optional (missing = open)
function gohGate(mi, ver) {
  if (!mi) return { ok: false, why: 'no mod.info' };
  if (/(^|\s)develop(\s|$)/i.test(mi.tags || '')) return { ok: true, why: 'tag develop: any game version' };
  if (!ver) return { ok: true, why: 'game version unknown' };
  const v = verNums(ver), lo = verNums(mi.min), hi = verNums(mi.max);
  if (lo.length && verCmp(v, lo) < 0) return { ok: false, why: 'MinGameVersion ' + mi.min + ' is above the game version ' + ver };
  if (hi.length && verCmp(v, hi) > 0) return { ok: false, why: 'MaxGameVersion ' + mi.max + ' is below the game version ' + ver };
  return { ok: true, why: 'game version ' + ver + ' is inside the range' };
}
// the install of the request's game: GoH install under goh, else the AS2 install (ctx.game)
function installOf(ctx, gid) {
  try {
    if (isGoh(gid)) return (ctx && typeof ctx.curDir === 'function' && ctx.curDir()) || (ctx && typeof ctx.gohDir === 'function' && ctx.gohDir()) || null;
    return (ctx && ctx.game && ctx.game()) || null;
  } catch { return null; }
}

const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });
const stat = f => { try { return fs.statSync(f); } catch { return null; } };
const isDir = f => { const s = stat(f); return !!(s && s.isDirectory()); };
const homeOpt = () => (process.env.AS2_HOME ? { home: process.env.AS2_HOME } : {});
const absArg = (v, what) => {
  if (typeof v !== 'string' || !v || v.length > 1024 || /\0/.test(v) || !path.isAbsolute(v)) throw bad(what + ': a full folder path is needed');
  return path.resolve(v);
};
const insideGameNonMod = (p, game) => {
  if (!game) return false;
  const n = x => path.resolve(x).toLowerCase(), g = n(game), q = n(p);
  return false && (q === g || q.startsWith(g + path.sep)); // reads are allowed anywhere; kept as a hook
};

// ---------- find
function instanceDirs() {
  const o = homeOpt(), base = userdir.userDir(0, o), out = [];
  if (!base) return { base: null, list: out };
  const par = path.dirname(base), nm = path.basename(base);
  out.push({ inst: 0, userDir: base });
  let names = [];
  try { names = fs.readdirSync(par); } catch { /* no parent */ }
  const found = [];
  for (const d of names) {
    if (!d.startsWith(nm + ' - instance ')) continue;
    const n = d.slice((nm + ' - instance ').length);
    if (/^[0-9]+$/.test(n) && isDir(path.join(par, d))) found.push({ inst: +n, userDir: path.join(par, d) });
  }
  return { base, list: out.concat(found.sort((a, b) => a.inst - b.inst)) };
}
// GoH: one user dir, no instance dirs (GHVFS-13)
function gohDirs() {
  const base = gohUser();
  return { base, list: base ? [{ inst: 0, userDir: base }] : [] };
}
function listLogDir(dir, goh) {
  const r = { dir, exists: isDir(dir), files: [], dumps: [], oos: [] };
  if (!r.exists) return r;
  for (const n of ['game.log', 'game.prev.log']) {
    const s = stat(path.join(dir, n));
    if (s && s.isFile()) r.files.push({ name: n, path: path.join(dir, n), size: s.size, mtimeMs: s.mtimeMs });
  }
  const md = path.join(dir, 'minidumps');
  if (isDir(md)) {
    const byName = new Map();
    for (const n of fs.readdirSync(md)) {
      const m = (goh ? /^(.*\.m?dmp)(\.log|\.txt)?$/i : /^(.*\.mdmp)(\.log)?$/i).exec(n);   // GoH dump names [I] (GHLOG-36: log/minidumps)
      if (!m) continue;
      const s = stat(path.join(md, n));
      if (!s) continue;
      const e = byName.get(m[1]) || { name: m[1], mtimeMs: 0, size: 0, sidecar: null };
      if (m[2]) e.sidecar = path.join(md, n); else e.size = s.size;
      e.mtimeMs = Math.max(e.mtimeMs, s.mtimeMs);
      byName.set(m[1], e);
    }
    r.dumps = [...byName.values()].sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, 40);
  }
  const od = path.join(dir, 'oos');
  if (isDir(od)) {
    for (const n of fs.readdirSync(od)) { const s = stat(path.join(od, n)); if (s && s.isDirectory()) r.oos.push({ name: n, path: path.join(od, n), mtimeMs: s.mtimeMs }); }
    r.oos.sort((a, b) => b.mtimeMs - a.mtimeMs); r.oos = r.oos.slice(0, 30);
  }
  return r;
}
function find(url, ctx) {
  const gid = gidOf(ctx, null), goh = isGoh(gid);
  const { base, list: all } = goh ? gohDirs() : instanceDirs();
  // mowas2: mowas_2.exe has no -instance (TST-19 [I]), so a "- instance N" log folder was written by as64.exe: only the main folder counts
  const list = gid === 'mowas2' ? all.filter(it => it.inst === 0) : all;
  const insts = list.map(it => Object.assign({ inst: it.inst, userDir: it.userDir }, listLogDir(path.join(it.userDir, 'log'), goh)));
  const dir = url && url.searchParams && url.searchParams.get('dir');
  let extra = null;
  if (dir) { const d = absArg(dir, 'dir'); if (!isDir(d)) throw bad('dir: not a folder'); extra = Object.assign({ inst: null, userDir: null }, listLogDir(d, goh)); }
  let newest = null;
  for (const it of insts.concat(extra ? [extra] : [])) for (const f of it.files) if (f.name === 'game.log' && (!newest || f.mtimeMs > newest.mtimeMs)) newest = { inst: it.inst, dir: it.dir, file: f.name, path: f.path, mtimeMs: f.mtimeMs };
  const newestDump = insts.concat(extra ? [extra] : []).flatMap(it => it.dumps.map(d => Object.assign({ dir: it.dir }, d))).sort((a, b) => b.mtimeMs - a.mtimeMs)[0] || null;
  const out = { base, instances: insts, extra, newest, newestDump, now: Date.now() };
  if (gid) out.game = gid;
  if (all.length > list.length) out.skippedInstances = all.length - list.length;
  return out;
}

// ---------- explain
const LEVEL_ORDER = { stop: 0, crash: 1, warn: 2, note: 3 };
const TESTS = {
  LOG_NO_STUFF: 'Buy the unit that uses the ammo or item named in the log, fire it, and reload. Check the game does not crash.',
  LOG_MISSING_FILE: 'Spawn the unit or map that uses the missing file and look at it (model, texture, sound).',
  LOG_WARN: 'Spawn the unit named in the warning and check it appears in the buy list and can move and fire.',
  LOG_LEVEL_PARAM: 'Check the ability named in the log works at the level you expect.',
  LOG_PANEL_ITEM: 'Open the command panel of the unit and look for a blank button.',
};
function parseJsonOut(out) {
  const s = String(out || '').trim();
  try { return JSON.parse(s); } catch { /* fall through */ }
  const i = s.indexOf('{'); if (i >= 0) { try { return JSON.parse(s.slice(i)); } catch { /* no json */ } }
  return null;
}
function cardsFrom(j, label) {
  let explain = null; try { explain = require('../../../lib/explain'); } catch { /* no explain */ }
  const cards = [], notes = [], tests = new Set();
  const lineOf = new Map();
  for (const l of j.lines || []) { const m = /^(?:info: )?([^:]+(?:\.log|\.mdmp\.log)):(\d+): ([A-Z_]+) /.exec(l); if (m) lineOf.set(m[1] + ':' + m[2] + ':' + m[3], l); }
  for (const g of j.groups || []) {
    if (plain.INFO.has(g.code)) { if (plain.INFO_PLAIN[g.code] && g.code !== 'LOG_BENIGN' && g.code !== 'LOG_UNCLASSIFIED') notes.push({ code: g.code, text: plain.INFO_PLAIN[g.code], msg: g.msg, file: g.file, line: g.line }); continue; }
    let c = plain.logCard(g);
    if (!c && explain) {
      const e = explain.explain(g.code);
      if (e && e.known && !/^A (line found in game\.log|mod setup)/.test(e.what || '')) c = { level: e.severity === 'crash' ? 'crash' : 'warn', title: e.what, what: e.why, fix: e.fix || [] };
    }
    if (!c) c = { level: 'warn', title: 'The game reported something', what: 'This message has no plain-words entry yet. The text below is what the game wrote.', fix: ['Read the message. It names the file or thing involved.'] };
    const detail = lineOf.get(g.file + ':' + g.line + ':' + g.code) || '';
    const card = { code: g.code, level: c.level, title: c.title, what: c.what, fix: c.fix, msg: g.msg || '', where: g.where || g.fn || '', file: g.file || '', line: g.line || 0, count: g.count || 1, row: g.row || null, detail: detail.slice(0, 900), label };
    if (g.code === 'LOG_CRASH') { const h = plain.crashHint(g.msg, g.fn, (/0x0*([0-9a-f]+)/i.exec(g.msg || '') || [])[1]); card.hint = h; }
    cards.push(card);
    if (TESTS[g.code]) tests.add(TESTS[g.code]);
  }
  // the "written by another exe" note (LOG-20: under MoW:AS2 the shared log folder may hold an as64.exe log) comes only as an info line
  for (const l of j.lines || []) {
    const m = /^info: (.*?): LOG_NOTE (.*)$/.exec(l), t = m && plain.exeNotePlain(m[2]);
    if (t && !notes.some(n => n.text === t)) notes.unshift({ code: 'LOG_NOTE', text: t, msg: m[2].slice(0, 300), file: m[1].replace(/:\d+$/, ''), line: 0 });
  }
  cards.sort((a, b) => (LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]));
  return { cards: cards.slice(0, 120), more: Math.max(0, cards.length - 120), notes: notes.slice(0, 20), tests: [...tests] };
}
async function runLogtriage(ctx, target, mod, game, gid) {
  const args = [target, '--json'];
  if (mod) args.push('--mod', mod);
  if (game) args.push('--game', game);
  if (gid && gid !== 'as64') args.push('--exe', games.exeOf(gid));   // the AS64 argument list stays as it was
  const r = await ctx.runTool('logtriage', 'logtriage/logtriage.js', args, { timeoutMs: 90000 });
  // JOBS: stopped from the footer. Thrown, so no caller reads the killed tool's output as "the log reader did not answer" (the dispatcher answers 499)
  if (r.cancelled) throw Object.assign(new Error('Stopped.'), { status: 499, cancelled: true });
  const j = parseJsonOut(r.stdout);
  if (!j) throw bad('the log reader did not answer' + (r.stderr ? ': ' + String(r.stderr).split('\n')[0].slice(0, 200) : ''), 500);
  return j;
}
async function explain(url, body, ctx) {
  body = body || {};
  const mod = body.mod ? absArg(body.mod, 'mod') : null;
  const gid = gidOf(ctx, body);
  let game = null; try { game = typeof body.game === 'string' && body.game ? absArg(body.game, 'game') : installOf(ctx, gid); } catch { game = null; }
  const targets = [];
  const f = find(null, gid ? { gameId: () => gid } : ctx);
  if (body.file) { const p = absArg(body.file, 'file'); if (!stat(p)) throw bad('file: not found'); targets.push({ label: path.basename(p), target: p }); }
  else if (body.dir) { const p = absArg(body.dir, 'dir'); if (!isDir(p)) throw bad('dir: not a folder'); targets.push({ label: p, target: p }); }
  else if (body.all) { for (const it of f.instances) if (it.files.length) targets.push({ label: 'instance ' + it.inst, target: it.dir, inst: it.inst }); }
  else if (body.inst != null && Number.isInteger(+body.inst)) { const it = f.instances.find(x => x.inst === +body.inst); if (!it || !it.files.length) throw bad('no game log for that instance', 404); targets.push({ label: 'instance ' + it.inst, target: it.dir, inst: it.inst }); }
  else { if (!f.newest) throw bad(isGoh(gid) ? 'no game.log found in the usual places (Documents\\My Games\\Gates of Hell\\log, or %LOCALAPPDATA%\\digitalmindsoft\\gates of hell\\log). Start the game once, or pick the folder yourself.' : 'no game.log found in the usual places (Documents\\My Games\\Men of War - Assault Squad 2\\log). Start the game once, or pick the folder yourself.', 404); targets.push({ label: 'instance ' + f.newest.inst + ': ' + f.newest.file, target: f.newest.dir, inst: f.newest.inst, newest: f.newest }); }
  const results = [];
  for (const t of targets) {
    const j = await runLogtriage(ctx, t.target, mod, game, gid);
    const c = cardsFrom(j, t.label);
    results.push(Object.assign({ label: t.label, target: t.target, inst: t.inst == null ? null : t.inst, header: (j.header || []).slice(0, 6), headline: (j.lines || []).filter(l => /^\d+ findings$/.test(l))[0] || '' }, c));
  }
  const all = results.reduce((a, r) => a + r.cards.length, 0);
  return { ok: true, results, total: all, copyWarn: true, files: targets.map(t => t.target) };
}

// ---------- dump
// GoH crash report (GHLOG-09, GHLOG-10, GHLOG-40; modweb logs/goh-game-log) [I: built from the notes]:
// lines carry the [hh:mm:ss] stamp (GHLOG-07); error text "message (file:line) @ [thread]"; the report names APP_* and prints
// RIP= and eight registers; codes 0x0bad0001..0007
const GOH_CODES = {
  1: ['APP_ERROR', 'crash', 'The game stopped on an error of its own and wrote a crash report and a minidump. The message names the cause.'],
  2: ['', 'error', 'The game closed at once (code 0x0bad0002): no box, no minidump.'],
  3: ['APP_SDL_ERROR', 'error', 'The game stopped on a data (SDL) file error. The message names the file.'],
  4: ['APP_ERROR_OUT_OF_MEMORY', 'error', 'The game ran out of memory. It shows an Error box and closes, with no minidump.'],
  5: ['APP_SIGCHECK_ERROR', 'error', 'A game file failed the signature check. It shows an Error box and closes, with no minidump.'],
  6: ['APP_OOS_ERROR', 'error', 'The players fell out of sync (OOS). The game wrote a crash report and a minidump.'],
  7: ['APP_DX_ERROR', 'error', 'A DirectX (graphics) error. The game closes at once, with no box and no minidump.'],
};
const GOH_FIX = {
  1: ['Read the message and the lines before it in game.log. If a mod is on, switch it off and try again to see if the mod causes it.'],
  2: ['Read the last lines of game.log before the stop.'],
  3: ['Fix the file named in the message, then start the game again.'],
  4: ['Close other programs, lower the graphics settings, or switch off big mods.'],
  5: ['Let Steam check the game files (Properties, Installed files, Verify).'],
  6: ['Every player needs the same game version and the same mods. Read the oos folder in the log folder.'],
  7: ['Update the graphics driver, or lower the graphics settings.'],
};
const ERR_BEFORE = 5, ERR_AFTER = 4;
// the registers of a GoH crash report (GHLOG-10: RIP and eight); RIP itself is the address, not one of them
const GOH_REGS = new Set(['RAX', 'RBX', 'RCX', 'RDX', 'RSI', 'RDI', 'RBP', 'RSP', 'R8', 'R9', 'R10', 'R11', 'R12', 'R13', 'R14', 'R15']);
function dumpGoh(file, s, lines) {
  const L = lines.map(l => l.replace(/^\[\d\d:\d\d:\d\d\] ?/, ''));
  const out = { file, name: path.basename(file), mtimeMs: s.mtimeMs, game: 'goh', hasException: false, exception: null };
  out.header = L.filter(l => /\bversion\b/i.test(l) && /\d+\.\d+/.test(l)).slice(0, 2).map(l => l.slice(0, 200));
  const codeAt = L.findIndex(l => /0x0bad000[1-7]\b|\bAPP_(ERROR(_OUT_OF_MEMORY)?|SDL_ERROR|SIGCHECK_ERROR|OOS_ERROR|DX_ERROR)\b/i.test(l));
  const ripAt = L.findIndex(l => /\bRIP\s*=\s*(0x)?[0-9a-f]+/i.test(l));
  // only a code or a RIP= line makes a crash report: a plain game.log carries many "(file:line) @ [thread]" lines, warnings among them
  if (codeAt < 0 && ripAt < 0) { out.plain = ['This file has no Gates of Hell crash report (no RIP= line, no 0x0bad000N code), so it is not a crash report.']; return out; }
  out.hasException = true;
  // the error line: a "(file:line) @ [thread]" line close to the code or RIP line (up to ERR_BEFORE lines before, ERR_AFTER after),
  // warnings skipped; one with the same [hh:mm:ss] stamp as the code or RIP line wins, else the nearest one before, else after.
  // A real GoH game.log prints harmless lines in the same form, so the window stays small and the
  // plain words call the line inferred [I]
  const anchor = Math.min(...[codeAt, ripAt].filter(i => i >= 0));
  const isErr = l => /\([\w.\-]+\.(cpp|h|c):\d+\)\s*@\s*\[[^\]]*\]/i.test(l) && !/^\s*!*\s*warning\b/i.test(l);
  const stampOf = l => (/^\[(\d\d:\d\d:\d\d)\]/.exec(l || '') || [])[1] || '';
  const aStamp = stampOf(lines[anchor]);
  const near = [];
  for (let i = anchor; i >= Math.max(0, anchor - ERR_BEFORE); i--) if (isErr(L[i])) near.push(i);
  for (let i = anchor + 1; i <= Math.min(L.length - 1, anchor + ERR_AFTER); i++) if (isErr(L[i])) near.push(i);
  const same = aStamp ? near.find(i => stampOf(lines[i]) === aStamp) : undefined;
  const errAt = same !== undefined ? same : near.length ? near[0] : -1;
  let n = 0;
  if (codeAt >= 0) {
    const c = /0x0bad000([1-7])\b/i.exec(L[codeAt]);
    if (c) n = +c[1]; else { const nm = /\bAPP_\w+/.exec(L[codeAt])[0].toUpperCase(); n = +(Object.keys(GOH_CODES).find(k => GOH_CODES[k][0] === nm) || 0); }
  }
  const rip = ripAt >= 0 ? (/\bRIP\s*=\s*(?:0x)?([0-9a-f]+)/i.exec(L[ripAt]) || [])[1] : '';
  const regs = ripAt >= 0 ? [...new Set([...L.slice(ripAt, ripAt + 4).join(' ').matchAll(/\b(R[A-Z0-9]{1,2})\s*=/gi)].map(m => m[1].toUpperCase()).filter(r => GOH_REGS.has(r)))] : [];
  const em = errAt >= 0 ? /^(.*?)\s*\(([\w.\-]+\.(?:cpp|h|c)):(\d+)\)\s*@\s*\[([^\]]*)\]/i.exec(L[errAt]) : null;
  const def = GOH_CODES[n];
  const kind = def ? def[1] : (rip ? 'crash' : 'error');
  out.exception = { kind, code: def ? (def[0] || '0x0bad000' + n) : (rip ? 'crash' : ''), codeNum: n ? '0x0bad000' + n : '', fn: '', src: em ? em[2] + ':' + em[3] : '', address: rip ? '0x' + rip.replace(/^0+(?=.)/, '') : '', registers: regs, message: em ? em[1].slice(0, 300) : '', messageInferred: !!em, thread: em ? em[4] : '', file: '' };
  const stop = Math.min(...[codeAt, ripAt, errAt].filter(i => i >= 0));
  out.before = lines.slice(Math.max(0, stop - 4), stop).filter(l => l.trim()).map(l => l.slice(0, 200));
  const p = [];
  // with no error line found, the "message names ..." sentence and a fix that points at the message would say what the log does not
  if (def) p.push(em ? def[2] : def[2].replace(/\s*The message names [^.]*\.$/, '')); else if (rip) p.push('The game crashed in its own code at RIP ' + out.exception.address + '. The address alone does not name the cause.');
  if (em) p.push('The nearest error line ' + (errAt <= anchor ? 'before' : 'after') + ' the stop is: ' + em[1].slice(0, 200) + ' (' + em[2] + ', line ' + em[3] + '). It is a guess from its place in the log: it may be the cause.');
  else p.push('No error line was found within a few lines of the stop, so the cause is not named in the log.');
  ((em || (n !== 1 && n !== 3)) && GOH_FIX[n] || ['Read the lines before the stop in game.log. If a mod is on, switch it off and try again to see if the mod causes it.']).forEach(x => p.push(x));
  p.push('Gates of Hell sends its crash reports to BugSplat, but not while a mod is applied; the minidump is kept in log\\minidumps either way.');
  out.plain = p;
  return out;
}
function dump(url, body, ctx) {
  const file = absArg(body && body.file, 'file');
  const s = stat(file);
  if (!s || !s.isFile() || s.size > 2 << 20) throw bad('file: a crash sidecar (.mdmp.log) up to 2 MB is needed');
  if (!/\.(mdmp\.log|log|txt)$/i.test(file)) throw bad('file: only .mdmp.log, .log or .txt');
  const lines = fs.readFileSync(file).toString('latin1').split(/\r?\n/);
  if (isGoh(gidOf(ctx, body)) && !lines.some(l => /\*{5,} Exception \*{5,}/.test(l))) return dumpGoh(file, s, lines);
  const i = lines.findIndex(l => /\*{5,} Exception \*{5,}/.test(l));
  const out = { file, name: path.basename(file), mtimeMs: s.mtimeMs, hasException: i >= 0, exception: null };
  const hdr = lines.slice(0, 12).filter(l => /^(Build|Product|Repository):/.test(l));
  out.header = hdr;
  if (i < 0) { out.plain = ['This file has no Exception block, so it is not a crash report.']; return out; }
  const blk = lines.slice(i + 1, i + 40);
  const codeLine = blk.find(l => /^EXCEPTION_\w+|^\w+ violation|ACCESS_VIOLATION/.test(l)) || '';
  const atLine = blk.find(l => /^At\s/.test(l)) || '';
  const fn = (/\(([A-Za-z_:~0-9<>]+)\+0x[0-9a-f]+/.exec(atLine) || [])[1] || '';
  const src = (/,\s*([\w.]+:\d+)\)/.exec(atLine) || [])[1] || '';
  const addr = (/at 0x0*([0-9a-f]+)/i.exec(codeLine) || [])[1];
  const msgLine = blk.find(l => l && !/^Program will be/.test(l) && !/^[-*]/.test(l)) || '';
  const fileLine = blk.find(l => /^> file "/.test(l)) || '';
  const kind = codeLine ? 'crash' : 'error';
  out.exception = { kind, code: codeLine, fn, src, address: addr ? '0x' + addr : '', message: kind === 'error' ? msgLine : '', file: (/"([^"]+)"/.exec(fileLine) || [])[1] || '' };
  const before = lines.slice(0, i).filter(l => /^\[\d\d:\d\d:\d\d\]/.test(l)).slice(-4).map(l => l.slice(0, 200));
  out.before = before;
  out.plain = kind === 'crash' ? plain.crashHint(codeLine, fn, addr) : ['The game stopped on its own on a data error: ' + (msgLine || 'see the message') + (out.exception.file ? ' (file ' + out.exception.file + ')' : '') + '.', 'Fix the file named, then start the game again.'];
  return out;
}

// ---------- enabled (options.set, read-only)
function miRead(dir) {
  const f = path.join(dir, 'mod.info');
  let t = ''; try { t = fs.readFileSync(f).toString('latin1'); } catch { return null; }
  const g = k => { const m = new RegExp('\\{\\s*' + k + '\\s+"([^"]*)"', 'i').exec(t); return m ? m[1] : ''; };
  const req = [...t.matchAll(/\(?\{?\s*require\s+"([^"]+)"/gi)].map(m => m[1]);
  const verParse = s => String(s || '').replace(/[^0-9.]/g, '').split('.').filter(x => x !== '').map(Number);
  const m = verParse(g('MinGameVersion'));
  const modern = m.length > 0 && (m[0] > 3 || (m[0] === 3 && (m[1] || 0) >= 301));
  return { text: t, name: g('Name'), desc: g('Desc'), min: g('MinGameVersion'), max: g('MaxGameVersion'), tags: g('Tags'), require: req, modern, hasMod: /\{\s*mod\b/i.test(t) };
}
// the game folder: the one the page sent, else the install of the request's game (GoH install under goh, ctx.curDir)
function gameOf(ctx, arg, gid) {
  if (arg) { const g = absArg(arg, 'game'); if (!isDir(g)) throw bad('game: not a folder'); return g; }
  return installOf(ctx, gid);
}
const MOWAS2_SKIP = 'mowas_2.exe (MoW:AS2, 3.262) has no as64+ and no new mode: it skips a mod written for the new mode (MinGameVersion 3.301 or more). Play it under AS64, or use a version of the mod made for 3.262.';
function enabled(url, body, ctx) {
  const q = k => url && url.searchParams && url.searchParams.get(k);
  const gid = gidOf(ctx, { target: q('target') }), goh = isGoh(gid), mw = gid === 'mowas2';
  const game = gameOf(ctx, q('game'), gid);
  let optFile = q('options');
  const profs = profilesOf(gid);
  if (optFile) { optFile = absArg(optFile, 'options'); if (path.basename(optFile).toLowerCase() !== 'options.set') throw bad('options: the file must be called options.set'); }
  else optFile = profs[0] || null;
  const out = { game, options: optFile, profiles: profs, mods: [], warnings: [], note: '' };
  if (gid) out.target = gid;
  if (!optFile || !stat(optFile)) { out.note = 'no-options'; return out; }
  // GoH: readModList's default is the AS2 version; the list wipe rule on GoH is [T], so the version saved beside the profile is used (as modswitch)
  const r = goh ? vfsLib.readModList(optFile, lastGameVersion(optFile) || undefined) : vfsLib.readModList(optFile);
  for (const p of r.problems || []) out.warnings.push({ level: p.level === 'error' ? 'stop' : 'note', text: p.code === 'MODS_WIPED_VERSION' ? 'The game was updated since this list was saved, so it will empty the mod list at the next start. Switch your mods on again in the game Options.' : p.msg, code: p.code });
  let found = null;
  if (game) { try { found = goh ? vfsLib.discover(game, [], { items: true }) : vfsLib.discover(game, []); } catch { found = null; } }
  const list = r.mods || [];
  const idx = n => list.findIndex(s => s.split(':')[0] === n);
  const plusAt = idx('as64+');
  const gver = goh ? gohVersion(game, optFile) : null;
  let anyLegacy = false, anyModern = false;
  list.forEach((s, i) => {
    const name = s.split(':')[0];
    const e = { order: i + 1, raw: s, name, installed: null, capitals: name !== name.toLowerCase(), mode: '', min: '', max: '' };
    if (name === 'as64+' && !goh && !mw) { e.mode = 'built-in'; e.installed = true; }
    else if (name === 'as64+' && mw) { e.mode = 'as64only'; e.installed = false; }
    else if (found) {
      // discover keys are lower case; GoH has no capitals rule (GHVFS-27), so its lookup is case-blind
      const key = goh ? name.toLowerCase() : name;
      e.installed = found.has(key);
      const fd = found.get(key), d = goh ? (fd && fd.dir) || (game && path.join(game, 'mods', name)) : game && path.join(game, 'mods', name), mi = d && miRead(d);
      if (mi && goh) { e.min = mi.min; e.max = mi.max; const gt = gohGate(mi, gver); e.gate = gt; if (!gt.ok) e.mode = 'goh-out'; }
      else if (mi) { e.min = mi.min; e.max = mi.max; e.mode = mi.modern ? (mw ? 'as64only' : 'modern') : 'legacy'; if (mi.modern) anyModern = true; else anyLegacy = true; }
    }
    out.mods.push(e);
  });
  for (const e of out.mods) {
    if (mw && e.name === 'as64+') { out.warnings.push({ level: 'warn', code: 'MOWAS2_NO_PLUS', mod: e.name, text: '"as64+" is the mod built into AS64. mowas_2.exe has no as64+ and drops it from the list.' }); continue; }
    if (e.installed === false) out.warnings.push({ level: 'stop', code: 'DOC_MOD_NOT_INSTALLED', mod: e.name, text: '"' + e.name + '" is in the list but there is no mods\\' + e.name + '\\mod.info in the game folder' + (goh ? ' (nor a Workshop item of that name)' : '') + '. The game drops it from the list when it starts.' });
    if (goh) {
      if (gohBadName(e.name)) out.warnings.push({ level: 'stop', code: 'GOH_BAD_NAME', mod: e.name, text: '"' + e.name + '": Gates of Hell skips a mod folder whose name has a space, a letter outside A-Z, or one of < > + ( ) [ ] { } ! @ # $ % ^ & * - = ; : | \' ". Rename the folder to letters, digits, _ and . only.' });
      if (e.gate && !e.gate.ok) out.warnings.push({ level: 'stop', code: 'GOH_VERSION', mod: e.name, text: '"' + e.name + '": Gates of Hell refuses it: ' + e.gate.why + '. Fix MinGameVersion and MaxGameVersion in mod.info, or leave them out (each one is optional on Gates of Hell).' });
    } else if (e.capitals && e.installed !== true) out.warnings.push({ level: 'stop', code: 'DOC_CAPITALS', mod: e.name, text: '"' + e.name + '" has capital letters. The game only finds mod folders written in small letters.' });
  }
  if (found && mw) out.mods.forEach(e => { if (e.mode === 'as64only' && e.name !== 'as64+') out.warnings.push({ level: 'stop', code: 'MOWAS2_NEW_MODE', mod: e.name, text: '"' + e.name + '" is written for the new mode of AS64. ' + MOWAS2_SKIP }); });
  if (found && !goh && !mw) {
    if (anyModern && plusAt < 0) out.warnings.push({ level: 'stop', code: 'NO_AS64PLUS', text: 'A mod in your list is written for the new mode (it needs as64+), but as64+ is not in the list. The game skips that mod. Switch as64+ on in the game Options.' });
    if (anyLegacy && plusAt >= 0) out.warnings.push({ level: 'stop', code: 'LEGACY_WITH_PLUS', text: 'as64+ is on, and a mod in your list is an old-style mod. The game skips old-style mods while as64+ is on. Switch as64+ off, or use a version of the mod made for as64+.' });
    out.mods.forEach(e => { if (plusAt >= 0 && e.mode === 'modern' && idx(e.name) < plusAt) out.warnings.push({ level: 'warn', code: 'PLUS_BELOW', mod: e.name, text: 'as64+ should be above "' + e.name + '" in the list, but it is below. Move as64+ up.' }); });
  }
  const u = new Set(); out.mods.forEach(e => { if (u.has(e.name)) out.warnings.push({ level: 'note', code: 'DUP', text: '"' + e.name + '" is listed twice.' }); u.add(e.name); });
  if (!game) out.warnings.push({ level: 'note', code: 'NO_GAME', text: goh ? 'The Gates of Hell folder is not set, so the list cannot be compared with the folders in the game. Set it with the folder button at the top.' : 'The game folder is not set, so the list cannot be compared with the folders in the game. Use the "Game folder..." button at the top.' });
  if (!out.warnings.length) out.warnings.push({ level: 'ok', code: 'OK', text: 'Nothing looks wrong with the list.' });
  return out;
}

// ---------- modwhy
function parseModinfoLines(out, modDir) {
  const res = [];
  for (const l of String(out || '').split(/\r?\n/)) {
    const m = /^(.*?):(\d+): ([A-Z_]+) (.*)$/.exec(l.trim());
    if (m) res.push({ file: path.basename(m[1]), line: +m[2], code: m[3], msg: m[4] });
  }
  return res;
}
async function modwhy(url, body, ctx) {
  const mod = absArg(body && body.mod, 'mod');
  if (!isDir(mod)) throw bad('mod: not a folder');
  const gid = gidOf(ctx, body), goh = isGoh(gid), mw = gid === 'mowas2';
  const game = gameOf(ctx, body.game, gid);
  const reasons = [], facts = [];
  const add = (level, what, fix, code) => reasons.push({ level, what, fix: fix || [], code: code || '' });
  const folder = path.basename(mod);
  const mi = miRead(mod);
  // where the GUI can make one depends on the page's game: the New mod card is on the AS64 Mods page only
  const miFix = gid === 'mowas2' ? 'Add a mod.info file. Tools & Settings > Other Tools > Generator can make a mod with one.'
    : gid === 'as64' ? 'Add a mod.info file. The New mod card on the Mods page can create one.'
    : goh ? 'Add a mod.info file with at least {Mod {Name "..."}}. On Gates of Hell MinGameVersion and MaxGameVersion are optional.'
    : 'Add a mod.info file. Under AS64 the New mod card on the Mods page can create one; under MoW:AS2 use Tools & Settings > Other Tools > Generator.';
  if (!mi) add('stop', 'This folder has no mod.info file. The game only lists folders that have one.', [miFix], 'NO_MODINFO');
  else {
    const gver = goh ? gohVersion(game, profilesOf(gid)[0]) : null;
    facts.push({ k: 'Name', v: mi.name || '(none)' }, { k: 'MinGameVersion', v: mi.min || '(none)' }, { k: 'MaxGameVersion', v: mi.max || '(none)' });
    if (goh) { facts.push({ k: 'Tags', v: mi.tags || '(none)' }); const gt = gohGate(mi, gver); if (!gt.ok) add('stop', 'Gates of Hell refuses this mod: ' + gt.why + '.', ['Fix MinGameVersion and MaxGameVersion in mod.info, or leave them out (each one is optional on Gates of Hell), or add {Tags "develop"} while you test.'], 'GOH_VERSION'); else facts.push({ k: 'Version', v: gt.why }); }
    else facts.push({ k: 'Type', v: mi.modern ? (mw ? 'new mode (AS64 only: mowas_2.exe skips it)' : 'new mode (needs as64+)') : 'old mode (classic)' });
    if (mi.require.length) facts.push({ k: 'Require', v: mi.require.join(', ') });
    // modinfo: GoH rules with --goh and the GoH install (its own version); AS2 as before
    const r = await ctx.runTool('modinfo', 'modinfo/modinfo.js', goh ? [mod, '--goh'].concat(game ? ['--game', game] : []) : [mod], { timeoutMs: 30000 });
    if (r.cancelled) return { cancelled: true };   // JOBS: stopped from the footer
    const seen = new Set();
    for (const f of parseModinfoLines(r.stdout, mod)) {
      // GoH: the version gate above follows the note [V] (Min and Max optional, tag develop); modinfo's GoH version codes are left out
      if (goh && /^VER_(MISSING|RANGE)$/.test(f.code)) continue;
      const p = plain.modinfoPlain(f.code);
      if (!p || seen.has(f.code)) continue;
      seen.add(f.code);
      add(/^(SYNTAX|MODINFO_PARSE|ENC_BOM|VER_MISSING|VER_RANGE|VER_ORDER|REQ_MISSING)$/.test(f.code) ? 'stop' : 'warn', p.what, [p.fix], f.code);
    }
  }
  if (goh) { if (gohBadName(folder)) add('stop', 'The folder name "' + folder + '" has a character Gates of Hell does not accept (a space, a letter outside A-Z, or one of < > + ( ) [ ] { } ! @ # $ % ^ & * - = ; : | \' "). The game skips the folder and writes "invalid mod folder name" in game.log.', ['Rename the folder to "' + folder.replace(/[^A-Za-z0-9_.]/g, '_') + '" (letters, digits, _ and . only).'], 'GOH_BAD_NAME'); }
  else if (folder !== folder.toLowerCase()) add('stop', 'The folder name "' + folder + '" has capital letters. The game only finds mod folders written in small letters.', ['Rename the folder to "' + folder.toLowerCase() + '".'], 'CAPITALS');
  if (mw && mi && mi.modern) add('stop', 'This mod is written for the new mode of AS64. ' + MOWAS2_SKIP, ['Play it under AS64, or set MinGameVersion and MaxGameVersion for 3.262 if the mod does not need AS64.'], 'MOWAS2_NEW_MODE');
  if (game) {
    const mods = path.resolve(game, 'mods').toLowerCase();
    const parent = path.dirname(path.resolve(mod)).toLowerCase();
    if (parent !== mods) {
      // GoH: ARSENAL does not write into the GoH install (lib/writeguard); a Workshop item also loads from the Steam workshop folder
      if (goh) add('warn', 'This folder is not inside the Gates of Hell mods folder. The game only sees it there, or as a Steam Workshop item.', ['Copy it to ' + path.join(game, 'mods') + ' yourself. ARSENAL does not write into the Gates of Hell folder.'], 'NOT_IN_MODS');
      else add('stop', 'This folder is not inside the game\'s mods folder, so the game will not see it.', ['Copy or move it to ' + path.join(game, 'mods') + '. Use the Play page "install" step (it asks first).'], 'NOT_IN_MODS');
    } else facts.push({ k: 'Place', v: 'inside the game mods folder' });
    // enabled in the game's options
    const prof = profilesOf(gid)[0];
    if (prof && parent === mods) {
      try {
        const list = ((goh ? vfsLib.readModList(prof, lastGameVersion(prof) || undefined) : vfsLib.readModList(prof)).mods || []).map(s => s.split(':')[0]);
        if (!list.includes(folder)) add('warn', 'The mod folder is fine but the mod is not switched on in the game\'s list.', ['Start the game, open Options, Mods, and tick it.'], 'NOT_ENABLED');
        else facts.push({ k: 'Enabled', v: 'yes, in the game\'s mod list' });
        // as64+ reasons only under AS64 (or no game named): mowas_2.exe and GoH have no as64+ (VFS-47)
        if (!goh && !mw && mi && mi.modern && !list.includes('as64+')) add('stop', 'The mod is written for the new mode, but as64+ is not switched on.', ['Switch as64+ on in the game Options.'], 'NO_AS64PLUS');
        if (!goh && !mw && mi && !mi.modern && list.includes('as64+')) add('stop', 'as64+ is on, and this is an old-mode mod. The game skips old-mode mods while as64+ is on.', ['Switch as64+ off, or move the mod to the new mode with Mods > Upgrade or Port.'], 'LEGACY_WITH_PLUS');
      } catch { /* options unreadable */ }
    }
  }
  let verdict = null;
  if (game && body.deep) {
    // the build to judge: the page's current game (as64, mowas2 or goh; none named is as64)
    const exe = gid === 'mowas2' ? 'mowas2' : goh ? 'goh' : 'as64';
    const r = await ctx.runTool('wouldload', 'wouldload/wouldload.js', goh ? [mod, '--exe', 'goh', '--goh', game] : [mod, '--exe', exe, '--game', game], { timeoutMs: 170000 });
    if (r.cancelled) return { cancelled: true };   // JOBS: stopped, not "The check did not finish"
    const v = new RegExp('^VERDICT ' + exe + ': (.*)$', 'm').exec(r.stdout || '');
    const ver = /^VERSION: (.*)$/m.exec(r.stdout || '');
    if (v) { const p = plain.verdictPlain(v[1]); verdict = { level: p.level, text: p.text, raw: v[1].slice(0, 400) }; if (ver && /refused/i.test(ver[1])) add('stop', 'The game checks the version lines first and refuses this mod: ' + ver[1].replace(/^refused on [\d.]+ \([^)]*\):\s*/i, '').slice(0, 200) + '.', ['Fix MinGameVersion and MaxGameVersion in mod.info.'], 'VERSION_REFUSED'); }
    else verdict = { level: 'note', text: 'The check did not finish' + (r.timedOut ? ' (too slow).' : '.'), raw: String(r.stderr || '').slice(0, 200) };
  }
  if (!reasons.length) add('ok', 'Nothing found that hides this mod. If it is still missing, check that it is switched on in the game Options, and read the game log (box above).', []);
  const res = { ok: true, mod, folder, facts, reasons, verdict, game };
  if (gid) res.target = gid;
  return res;
}

// ---------- unit chain
const SKIP_DIR = new Set(['.git', '.svn']);
function walkMod(root, cap = 40000) {
  const out = [];
  (function w(d) {
    let es; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of es) {
      if (out.length >= cap) return;
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (!SKIP_DIR.has(e.name)) w(p); } else out.push(p);
    }
  })(root);
  return out;
}
// CACHE (gui README contract 1): the file rows of the mod's resource folder from a scan of the shared walk (lib/modtree), in the
// order walkMod gives them (folder by folder as a folder listing is: by name, letter case ignored; depth first), so the cap cuts at
// the same file and the first name of two alike is the same. The rows leave out links, .arsenal and node_modules (no mod data).
const ROWS = new WeakMap();
function scanRows(T, cap = 40000) {
  let o = ROWS.get(T);
  if (!o) {
    const rows = [];
    for (const r of T.files || []) { const rel = String(r[0]); if (rel.length > 9 && rel.slice(0, 9).toLowerCase() === 'resource/') rows.push({ r: rel, p: rel.toUpperCase().split('/') }); }
    rows.sort((x, y) => { const a = x.p, b = y.p, n = Math.min(a.length, b.length); for (let i = 0; i < n; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1; return a.length - b.length; });
    o = rows.map(x => x.r); ROWS.set(T, o);
  }
  return o.length > cap ? o.slice(0, cap) : o;
}
// the scan of the mod for a route (awaited, shared by every page; null = no folder, or it cannot be read: makeSource then walks as before)
async function scanOf(ctx, mod) {
  if (!mod || !isDir(mod)) return null;
  try { return await ((ctx && ctx.modtree) || require('../../../lib/modtree')).ensure(mod); } catch { return null; }
}
// exe: the vfs exe of the page's game (as64 | mowas_2 | goh); none = the vfs default (as64 first), as before
// T: a lib/modtree scan of mod (the routes await it); none = the mod's resource folder is walked here, as before.
// The game's view is the shared one (lib/gameview), not a build of its own.
function makeSource(mod, game, exe, T) {
  const keys = new Map(); // lower key -> {src:'mod'|'game', file | rec}
  const resRoot = path.join(mod, 'resource');
  if (T) { for (const rel of scanRows(T)) keys.set(rel.toLowerCase(), { src: 'mod', file: path.join(mod, ...rel.split('/')) }); }
  else if (isDir(resRoot)) for (const f of walkMod(resRoot)) keys.set(('resource/' + path.relative(resRoot, f).replace(/\\/g, '/')).toLowerCase(), { src: 'mod', file: f });
  let v = null;
  if (game) { try { v = require('../../../lib/gameview').get(exe ? { gameDir: game, exe } : { gameDir: game }); } catch { v = null; } }
  const get = key => {
    const k = key.toLowerCase();
    const m = keys.get(k); if (m) return m;
    const g = v && v.files.get(k); if (g) return { src: 'game', rec: g };
    return null;
  };
  const text = key => { const e = get(key); if (!e) return null; try { return (e.file ? fs.readFileSync(e.file) : vfsLib.readRec(e.rec)).toString('latin1'); } catch { return null; } };
  const all = () => { const s = new Set(keys.keys()); if (v) for (const k of v.files.keys()) s.add(k); return s; };
  const prefix = p => { p = p.toLowerCase(); for (const k of keys.keys()) if (k.startsWith(p)) return { src: 'mod', key: k }; if (v) for (const k of v.files.keys()) if (k.startsWith(p)) return { src: 'game', key: k }; return null; };
  const find = re => { const out = []; for (const [k, e] of keys) if (re.test(k)) out.push({ key: k, src: 'mod' }); if (v) for (const k of v.files.keys()) if (re.test(k) && !keys.has(k)) out.push({ key: k, src: 'game' }); return out; };
  return { get, text, all, prefix, find, hasGame: !!v, exe: v ? v.exe : null };
}
// GoH buy card of a unit [I]: {"name" ("template" ... side(x) ... cost(n))} (vehicles), or ("template" ... side(x) ... name(x) ...)
// (squads), or a squad card with vehicle(x); doctrine / conditions shown when the card has them (GHGPL-05)
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function gohCard(t, name, base) {
  const strip = t.replace(/;[^\r\n]*/g, m => ' '.repeat(m.length));   // SDL comments out, offsets kept
  const blk = new RegExp('\\{\\s*"' + reEsc(name) + '"\\s*\\(', 'i').exec(strip);
  let body = '', how = '';
  if (blk) { let d = 0, i = blk.index, e = i; for (; e < strip.length; e++) { const c = strip[e]; if (c === '{') d++; else if (c === '}') { d--; if (!d) break; } } body = strip.slice(i, e + 1); how = 'card'; }
  if (!body) { const m = new RegExp('[^\\n]*\\bname\\(' + reEsc(base) + '\\)[^\\n]*', 'i').exec(strip); if (m) { body = m[0]; how = 'squad'; } }
  if (!body) { const m = new RegExp('[^\\n]*\\bvehicle\\(' + reEsc(base) + '\\)[^\\n]*', 'i').exec(strip); if (m) { body = m[0]; how = 'vehicle'; } }
  if (!body) return null;
  const one = s => (s ? s.replace(/\s+/g, ' ').trim().slice(0, 200) : '');
  const side = (/\bside\((\w+)\)/i.exec(body) || [])[1] || '';
  const cost = (/\bcost\((\d+)\)/i.exec(body) || /\{\s*cost\s+(\d+)/i.exec(body) || [])[1] || '';
  const doctrine = (/\bdoctrine\(([^)]*)\)/i.exec(body) || /\{\s*doctrine\s+"?([^"}]*)"?\s*\}/i.exec(body) || [])[1] || '';
  const conditions = (/\bconditions?\(([^)]*)\)/i.exec(body) || /\{\s*conditions\s+"([^"]*)"/i.exec(body) || [])[1] || '';
  return { line: one(body), side, cost, doctrine: one(doctrine), conditions: one(conditions), how };
}
const resolveInc = (from, inc) => {
  inc = String(inc).replace(/\\/g, '/');
  if (inc.startsWith('/')) return 'resource' + inc.toLowerCase();
  const dir = from.slice(0, from.lastIndexOf('/'));
  const parts = (dir + '/' + inc).split('/'), o = [];
  for (const p of parts) { if (p === '..') o.pop(); else if (p !== '.') o.push(p); }
  return o.join('/').toLowerCase();
};
function collectIncludes(S, start, depth) {
  const seen = new Set(), order = [];
  (function w(key, d) {
    if (seen.has(key) || d > depth) return; seen.add(key);
    const t = S.text(key); if (t == null) { order.push({ key, missing: true }); return; }
    order.push({ key, text: t, src: S.get(key).src });
    for (const m of t.matchAll(/[({]\s*include\s+"([^"]+)"/gi)) w(resolveInc(key, m[1]), d + 1);
  })(start, 0);
  return order;
}
async function unit(url, body, ctx) {
  const mod = absArg(body && body.mod, 'mod');
  if (!isDir(mod)) throw bad('mod: not a folder');
  const name = String((body && body.unit) || '').trim();
  if (!/^[A-Za-z0-9_().+\-]{1,80}$/.test(name)) throw bad('unit: the unit name, for example t34_0, letters digits _ ( ) only');
  const gid = gidOf(ctx, body), goh = isGoh(gid);
  const game = gameOf(ctx, body.game, gid);
  // the check of one unit walks the mod itself (no scan): a file added a moment ago by the user's fix must be seen on the next ask
  const S = makeSource(mod, game, gid ? games.exeOf(gid) : undefined);
  const base = name.replace(/\(.*$/, '').toLowerCase(), steps = [];
  const step = (id, status, where, note, fix) => { const s = { id, status, where: where || '', note: note || '', fix: fix || [] }; steps.push(s); return s; };
  if (!game) steps.push({ id: 'game', status: 'warn', where: '', note: 'The game folder is not set, so only your mod folder can be checked. Vanilla files count as missing. Use "Game folder..." at the top.', fix: [] });
  // 1 definition
  const defs = S.find(new RegExp('/' + base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\.def$'));
  const def = defs.find(d => d.src === 'mod') || defs[0];
  if (!def) step('def', 'broken', '', 'No entity file "' + base + '.def" was found in your mod' + (game ? ' or in the game' : '') + '. Without it the unit does not exist.', ['Check the spelling of the unit name. The name is the file name without .def.', 'Put the .def file under resource/entity/ in your mod.']);
  else step('def', 'ok', def.key + ' (' + def.src + ')', 'The unit file exists.');
  // 2 model + 3 material
  let modelStep = null;
  if (def) {
    const chain = collectIncludes(S, def.key, 4);
    const miss = chain.filter(c => c.missing);
    const models = [];
    for (const c of chain) if (c.text) for (const m of c.text.matchAll(/\{\s*extension\s+"([^"]+\.mdl)"/gi)) models.push({ ref: m[1], from: c.key });
    for (const m of miss) step('inc', 'broken', m.key, 'A file included by the unit is missing: ' + m.key + '.', ['Add the file, or fix the include path in the unit file.']);
    if (!models.length) modelStep = step('model', 'warn', '', 'No model line ({Extension "...mdl"}) was found in the unit file or what it includes. The unit may take its model from somewhere this check cannot read.', ['Open the unit file and check it names a model.']);
    else {
      const bads = [];
      for (const m of models) { const key = resolveInc(m.from, m.ref); if (!S.get(key)) bads.push({ m, key }); }
      if (bads.length) modelStep = step('model', 'broken', bads[0].key, 'The model file is missing: ' + bads.map(b => b.key).join(', ') + '. The unit would be invisible or crash the game when it appears.', ['Check the name and capital letters.', 'Copy the model into your mod, or point the unit at a model that exists.']);
      else {
        modelStep = step('model', 'ok', resolveInc(models[0].from, models[0].ref) + ' (' + S.get(resolveInc(models[0].from, models[0].ref)).src + ')', 'The model file exists.');
        const mk = resolveInc(models[0].from, models[0].ref), mdir = mk.slice(0, mk.lastIndexOf('/') + 1);
        const mt = S.text(mk) || '';
        const named = [...mt.matchAll(/"([^"]+\.mtl)"/gi)].map(m => resolveInc(mk, m[1]));
        const missM = named.filter(k => !S.get(k));
        if (missM.length) step('material', 'broken', missM[0], 'A material file named by the model is missing: ' + missM.join(', ') + '. The unit would look white or flat.', ['Add the .mtl file next to the model.']);
        else if (named.length || S.prefix(mdir) && S.find(new RegExp('^' + mdir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[^/]*\\.mtl$')).length) step('material', 'ok', mdir, 'Material files were found with the model.');
        else step('material', 'warn', mdir, 'No material (.mtl) file was found next to the model.', ['Check the model folder has its .mtl files.']);
      }
    }
  } else { step('model', 'skip', '', 'Skipped: no unit file.'); step('material', 'skip', '', 'Skipped: no unit file.'); }
  // 4 buy card + 5 army
  // GoH keeps its cards in subfolders (conquest/, early/, mid/, late/) [I: real GoH install, 2026-11-14]
  const unitFiles = S.find(goh ? /^resource\/set\/multiplayer\/units\/.+\.set$/ : /^resource\/set\/multiplayer\/units\/[^/]+\.set$/);
  let card = null;
  const re = new RegExp('\\{\\s*"' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"\\s*(\\([^\\n]*)', 'i');
  const reSq = new RegExp('(?:^|[^\\w])name\\(' + base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\)[^\\n]*side\\((\\w+)\\)', 'i');
  for (const f of unitFiles.sort((a, b) => (a.src === 'mod' ? -1 : 1) - (b.src === 'mod' ? -1 : 1))) {
    const t = S.text(f.key); if (!t) continue;
    if (goh) { const c = gohCard(t, name, base); if (c) { card = Object.assign({ key: f.key, src: f.src }, c); break; } continue; }
    const m = re.exec(t);
    if (m) { card = { key: f.key, src: f.src, line: m[1], side: (/\bs\((\w+)\)/.exec(m[1]) || [])[1] || '', cost: (/\{cost\s+(\d+)/i.exec(t.slice(m.index, m.index + 400)) || [])[1] || '' }; break; }
    const ms = reSq.exec(t);
    if (ms) { card = { key: f.key, src: f.src, line: ms[0], side: ms[1], cost: '' }; break; }
  }
  if (!card) step('card', 'broken', 'resource/set/multiplayer/units/', 'No buy card for "' + name + '" was found in any file under set/multiplayer/units. Without a card nobody can buy the unit.', goh ? ['Add a card like {"' + name + '" ("vehicle" period(mid) side(ger) t(vehicle) b(vehicles) cost(50))} to a units .set (for example mid/units_ger.set) in your mod, copied from a vanilla card of the same kind.'] : ['Add a line like {"' + name + '" ("vs" c(60) t(all) s(ger) ...)} to a vehicles or squads .set in your mod.', 'See the guide chapter "Balance, pricing, gameplay".']);
  else step('card', 'ok', card.key + ' (' + card.src + ')', (card.how === 'vehicle' ? 'The unit is the vehicle of a squad card' : 'The buy card exists') + (card.side ? ' for army "' + card.side + '"' : '') + (card.cost ? ', cost ' + card.cost : '') + '.');
  if (card && goh && (card.doctrine || card.conditions)) step('doctrine', 'note', card.key, (card.doctrine ? 'The card shows only to a player whose doctrine is "' + card.doctrine + '".' : '') + (card.conditions ? (card.doctrine ? ' ' : '') + 'It needs the conditions "' + card.conditions + '" (tags of the selected units, or an ability of the selected soldier).' : ''), []);
  if (card) {
    const chain = collectIncludes(S, 'resource/set/multiplayer/units/common.set', 6);
    const reach = new Set(chain.filter(c => !c.missing).map(c => c.key));
    // GoH: roster_conquest.set is included by no file (the game mode reads it), so every units/roster_*.set is a root too [I]
    if (goh) for (const r of S.find(/^resource\/set\/multiplayer\/units\/roster_[^/]+\.set$/)) for (const c of collectIncludes(S, r.key, 6)) if (!c.missing) reach.add(c.key);
    if (goh ? !reach.size : (!chain.length || chain[0].missing)) step('army', 'warn', 'resource/set/multiplayer/units/common.set', 'The main roster file common.set could not be read, so the army list cannot be checked.', []);
    else if (!card.side) step('army', 'warn', card.key, 'The card has no army (s(...)) part.', ['Add s(ger), s(rus), s(usa) or another army to the card.']);
    else if (!reach.has(card.key)) step('army', goh ? 'warn' : 'broken', card.key, 'The card file is not reached from the roster (common.set and what it includes). The card exists but never shows in the game.', ['Add (include "' + card.key.split('/').pop() + '") to the roster file that lists the other card files, or put the card into a file that is already listed.']);
    else step('army', 'ok', card.key, 'The card file is part of the roster for army "' + card.side + '".');
  } else step('army', 'skip', '', 'Skipped: no card.');
  // 6 icon
  const ic = S.prefix('resource/interface/scene/unit_icon/' + base + '_0') || (card && S.prefix('resource/interface/scene/unit_icon/' + (name.toLowerCase()) + '_0'));
  const isq = S.prefix('resource/interface/scene/squad/' + name.toLowerCase());
  if (ic) step('icon', 'ok', ic.key + ' (' + ic.src + ')', 'The buy-card picture exists.');
  else if (isq) step('icon', 'ok', isq.key + ' (' + isq.src + ')', 'The squad picture exists.');
  else step('icon', game ? 'warn' : 'skip', 'resource/interface/scene/unit_icon/', 'No buy-card picture (' + base + '_00.tga) was found. The game does not complain: it shows a blank card. The unit can still be bought.', ['Copy an existing picture set (_00 to _03) under the new name into interface/scene/unit_icon/ in your mod.']);
  const sm = S.prefix('resource/interface/scene/unit_icon_small/' + base + '_0');
  if (!sm && def) step('icon_small', 'warn', 'resource/interface/scene/unit_icon_small/', 'No small in-game card picture (' + base + '_00.tga). A generic picture is used.', []);
  // bot
  const botFile = path.join(mod, 'resource', 'script', 'multiplayer', 'bot.data.lua');
  if (goh) { if (stat(botFile)) step('bot', 'note', 'resource/script/multiplayer/bot.data.lua', 'Gates of Hell does not read bot.data.lua: its computer player uses script/multiplayer/bot.main.lua and modes/*.lua (GHMIS-66). This file has no effect there.', []); }
  else if (stat(botFile)) { let bt = ''; try { bt = fs.readFileSync(botFile, 'latin1'); } catch { /* skip */ } step('bot', bt.indexOf(name) >= 0 ? 'ok' : 'note', 'resource/script/multiplayer/bot.data.lua', bt.indexOf(name) >= 0 ? 'The computer player knows this unit.' : 'The mod has its own bot list and the unit is not in it. Computer players will never buy it. Players still can.', []); }
  // deep: refcheck
  let deep = null;
  if (game && body.deep) {
    // the cache is per game (the three games never share an answer); AS64 and no game named keep the old name and argument list
    const other = gid && gid !== 'as64';
    const cache = path.join(ctx.tmpRoot || require('os').tmpdir(), other ? 'logs-unit-cache.' + gid + '.json' : 'logs-unit-cache.json');
    const r = await ctx.runTool('refcheck', 'refcheck/refcheck.js', [game, '--folder', mod, '--scope', 'mod', '--cache', cache, '-q'].concat(other ? ['--exe', games.exeOf(gid)] : []), { timeoutMs: 170000 });
    if (r.cancelled) return { cancelled: true };   // JOBS: stopped, not "found no broken links"
    const lines = String(r.stdout || '').split(/\r?\n/).filter(l => /REF_|OVERMATCH|LOD_/.test(l) && l.toLowerCase().indexOf(base) >= 0).slice(0, 12);
    const refused = r.code === 2 && (/not available for [^:]+:[^\n]*/.exec(String(r.stderr || '')) || [])[0];
    deep = { ran: !r.timedOut && !refused, lines };
    if (refused) step('refs', 'note', '', 'The reference checker did not run: ' + refused.replace(/^not available for/, 'it is not available for') + '.', []);
    else if (lines.length) step('refs', 'broken', '', 'The reference checker found broken links for this unit: ' + lines.length + '. See the list below.', ['Fix each line, then check again.']);
    else if (!r.timedOut) step('refs', 'ok', '', 'The reference checker found no broken links for this unit.');
    else step('refs', 'note', '', 'The reference checker did not finish (too slow).', []);
  }
  const firstBroken = steps.findIndex(s => s.status === 'broken');
  const res = { ok: true, unit: name, mod, game, steps, firstBroken, deep, guides: ['guide/15-interface-and-icons.md', 'guide/17-balance-pricing-gameplay.md'] };
  if (gid) { res.target = gid; res.exe = S.exe; }
  return res;
}

// ---------- ticklist
function ticklist(url) {
  const mod = url && url.searchParams && url.searchParams.get('mod');
  const items = [], seen = new Set();
  const add = (t, from) => { t = t.replace(/\s+/g, ' ').trim(); if (t && !seen.has(t) && items.length < 60) { seen.add(t); items.push({ text: t, from }); } };
  if (mod) {
    const m = absArg(mod, 'mod');
    for (const n of ['UPGRADE.md', 'upgrade.md']) {
      let t = ''; try { t = fs.readFileSync(path.join(m, n), 'utf8'); } catch { continue; }
      for (const l of t.split(/\r?\n/)) { const x = /\btest:\s*(.+)$/i.exec(l); if (x && !/^none/i.test(x[1])) add(x[1], n); }
    }
  }
  add('Start a match with your mod on. Wait for the map to load.', 'basic');
  add('Buy and spawn every unit you changed. Check each one appears, moves and fires.', 'basic');
  add('Close the game, then press "Explain my last game log" and check it shows no new red cards.', 'basic');
  return { items };
}

// ---------- unit names: the unit box's index and Browse list on the page (searchKit, owner 2026-11-19). Every entity .def of the mod
// and of the page's game (its own vfs exe), by name; the mod's first, the game's grouped by entity folder. Read once per page load.
const UNITS = new WeakMap(), NO_VIEW = {};   // game view (or none) -> Map(mod folder + scan signature -> the answer)
async function units(url, ctx) {
  const q = k => url && url.searchParams && url.searchParams.get(k);
  const mod = q('mod') ? absArg(q('mod'), 'mod') : '';
  const gid = gidOf(ctx, { target: q('target') });
  let game = null; try { game = gameOf(ctx, q('game'), gid); } catch { game = null; }
  const has = !!mod && isDir(mod), exe = gid ? games.exeOf(gid) : undefined, T = await scanOf(ctx, mod);
  // the answer is a function of the mod's rows (its scan signature) and the game's view (one object until the game's files
  // move, lib/gameview): the same two give the kept answer instead of the regex over every key again. A mod folder that
  // could not be scanned is walked here each time, as before, and is not kept.
  let view = null, slot = null;
  if (!has || T) {
    if (game) { try { view = require('../../../lib/gameview').get(exe ? { gameDir: game, exe } : { gameDir: game }); } catch { view = null; } }
    let m = UNITS.get(view || NO_VIEW); if (!m) UNITS.set(view || NO_VIEW, m = new Map());
    const k = has ? mod + '|' + T.all : '';
    slot = { m, k };
    if (m.has(k)) return m.get(k);
  }
  const S = makeSource(has ? mod : path.join(require('os').tmpdir(), 'no-such-mod-' + process.pid), game, exe, T);
  const out = [], seen = new Set(), MAX = 40000;
  for (const d of S.find(/^resource\/entity\/.+\.def$/)) {
    if (out.length >= MAX) break;
    const n = d.key.slice(d.key.lastIndexOf('/') + 1, -4);
    if (seen.has(n)) continue; seen.add(n);
    const dir = d.key.slice('resource/entity/'.length, d.key.lastIndexOf('/'));
    out.push({ n, src: d.src, dir: dir.split('/').slice(0, 2).join('/') });
  }
  const res = { units: out, truncated: out.length >= MAX, game: !!game };
  if (slot && !!view === S.hasGame) { if (slot.m.size >= 4) slot.m.clear(); slot.m.set(slot.k, res); }
  return res;
}

const R = {
  'GET /api/x/logs/units': async (url, b, ctx) => units(url, ctx),
  'GET /api/x/logs/find': async (url, b, ctx) => find(url, ctx),
  'POST /api/x/logs/explain': explain,
  'POST /api/x/logs/dump': async (u, b, ctx) => dump(u, b, ctx),
  'GET /api/x/logs/enabled': async (u, b, ctx) => enabled(u, b, ctx),
  'POST /api/x/logs/modwhy': modwhy,
  'POST /api/x/logs/unit': unit,
  'GET /api/x/logs/ticklist': async url => ticklist(url),
};
module.exports = { routes: R, find, dump, enabled, ticklist, cardsFrom, miRead, resolveInc, makeSource, insideGameNonMod, gidOf, gohCard, gohGate, gohBadName, dumpGoh };

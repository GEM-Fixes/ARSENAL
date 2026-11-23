// pro ext: server routes. All tool runs go through ctx.runTool, read-only, cwd = a scratch folder under tmpRoot.
//   tools/help/check/run    "All tools" launcher (E-13), deny-list in policy.js
//   cmdline                 contract command + form values -> CLI line (E-30, contract.buildArgv)
//   overdiff/misdiff/verdiff/conflicts   Diff page (E-4, E-15) with counts for plain-word summaries (the page words them)
//   clean                   conflicts --clean: ITM-clean copy of one mod. Preview (--itm) first, write only into a new/empty folder the user picked
//   sheet                   statsheet --sheet all --fmt csv -> tables (E-7)
// Game: the page's game comes with every request (ctx.gameId/exe/kind/curDir). An empty game folder is the
// install of that game (the GoH install on the GoH tab, else the AS2 install); a tool run for MoW:AS2 or GoH gets `--exe <vfs exe>`
// (AS64: the argument list as before). Launcher slots: {mod}, {game} (that folder), {exe} (the vfs exe: as64 | mowas_2 | goh; for a
// port group tool on the GoH tab the AS2 target as64, since GoH is their source, and {game} the AS2 install for them),
// {goh} (the GoH install, for the port tools; a port tool's GoH slot --goh, --a, --goh-mod or --base-a given {game} keeps the GoH install).
// research is a GoH-only sheet (statsheet GHCQ-16); the launcher run gives {na} on a refusal too. Cache keys carry the game id. A tool that refuses the game (games.refuse, exit 2,
// "<tool>: not available for <game>: ...") gives {na: line}: the page shows that plain line instead of an error.
// Author: Imperator_Aug (ARSENAL, ia-79620059)
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
const C = require('./catalog'), P = require('./policy'), GAMES = require('../../../lib/games');

const bad = (m, st) => Object.assign(new Error(m), { status: st || 400 });
const str = (v, n) => (typeof v === 'string' ? v : '').slice(0, n || 400);
const lastLines = (s, n) => String(s || '').trim().split(/\r?\n/).slice(-(n || 3)).join(' ').slice(0, 600);
const md5 = s => crypto.createHash('md5').update(s).digest('hex').slice(0, 12);
function within(child, parent) { if (!parent) return false; const rel = path.relative(path.resolve(parent), path.resolve(child)); return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel)); }

// installedAs(mod, game) -> {dir, how:'in'|'link'|'copy'} | null: where the game (and so overdiff) finds this mod folder
function installedAs(mod, game) {
  const md = path.resolve(game, 'mods'), low = s => path.resolve(s).toLowerCase();
  if (low(path.dirname(mod)) === low(md)) return { dir: mod, how: 'in' };
  let real = mod; try { real = fs.realpathSync(mod); } catch (e) { /* as given */ }
  let names = []; try { names = fs.readdirSync(md); } catch (e) { return null; }
  for (const n of names) { const d = path.join(md, n); try { if (low(fs.realpathSync(d)) === low(real) && fs.existsSync(path.join(d, 'mod.info'))) return { dir: d, how: 'link' }; } catch (e) { /* broken link */ } }
  const n = names.find(x => x.toLowerCase() === path.basename(mod).toLowerCase());
  if (n && fs.existsSync(path.join(md, n, 'mod.info'))) return { dir: path.join(md, n), how: 'copy' };
  return null;
}

function scratch(ctx, sub) { const d = path.join(ctx.tmpRoot || os.tmpdir(), 'as2gui-pro', sub || 'run'); fs.mkdirSync(d, { recursive: true }); return d; }
function absDir(v, what, must) {
  const d = str(v, 2000).trim();
  if (!d) { if (must) throw bad(what + ': pick a folder.'); return null; }
  if (!path.isAbsolute(d)) throw bad(what + ': need a full path.');
  if (!fs.existsSync(d)) throw bad(what + ': not found: ' + d);
  return path.resolve(d);
}
function absPath(v, what) { const d = str(v, 2000).trim(); if (!d || !path.isAbsolute(d)) throw bad(what + ': need a full path.'); if (!fs.existsSync(d)) throw bad(what + ': not found: ' + d); return path.resolve(d); }
// the request's game: id ('as64' when the shell sends none, or in a ctx without game helpers), vfs exe, kind, and its install
const fn = (ctx, k) => (ctx && typeof ctx[k] === 'function' ? ctx[k]() : null);
function gameIdOf(ctx) { return fn(ctx, 'gameId') || GAMES.DEFAULT; }
function exeOfCtx(ctx) { return fn(ctx, 'exe') || GAMES.exeOf(gameIdOf(ctx)) || GAMES.exeOf(GAMES.DEFAULT); }
function curDirOf(ctx) { return typeof (ctx && ctx.curDir) === 'function' ? ctx.curDir() : fn(ctx, 'game'); }
// `--exe <vfs exe>` for MoW:AS2 and GoH; nothing for AS64 (its argument lists stay as they were)
function exeArgs(ctx) { return gameIdOf(ctx) === 'as64' ? [] : ['--exe', exeOfCtx(ctx)]; }
function gameOf(b, ctx, must) {
  const g = absDir(b.game, 'Game folder', false);
  if (g) return g;
  const a = curDirOf(ctx);
  if (!a && must) throw bad(gameIdOf(ctx) === 'goh' ? 'Gates of Hell folder not found. Set it on the Mods page or pick it here.' : 'Game folder not found. Set it on the Mods page or pick it here.');
  return a || null;
}
// a tool's games.refuse line (exit 2): shown as a plain line, not as an error
function naOf(r) { if (!r || r.code !== 2) return null; const m = /^.*: not available for .*$/m.exec(String(r.stderr || '') + '\n' + String(r.stdout || '')); return m ? m[0].trim() : null; }
function modsOf(v, must) {
  const a = (Array.isArray(v) ? v : str(v, 4000).split(',')).map(x => String(x).trim()).filter(Boolean);
  for (const m of a) if (!/^[\w.+ -]{1,80}$/.test(m) || m.startsWith('-') || m.includes('..')) throw bad('Bad mod name: ' + m);
  if (must && !a.length) throw bad('Pick at least one mod.');
  return a;
}
function jsonOf(s) { const t = String(s || ''); const i = t.indexOf('{'), j = t.lastIndexOf('}'); if (i < 0 || j < i) return null; try { return JSON.parse(t.slice(i, j + 1)); } catch (e) { return null; } }
function items(j, max) {
  const out = [];
  for (const [k, sev] of [['findings', 'warn'], ['info', 'info']]) for (const x of (j && j[k]) || []) out.push({ file: x.file, line: x.line || 0, code: x.code, msg: x.msg, sev: x.severity === 'error' ? 'error' : sev });
  return out.slice(0, max || 5000);
}
const countBy = (arr, f) => arr.reduce((o, x) => { const k = f(x); if (k) o[k] = (o[k] || 0) + 1; return o; }, {});

// ---- argv text <-> list
function parseArgs(s) {
  s = str(s, 8000);
  const out = []; let cur = null, q = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === q) q = null; else cur += c; continue; }
    if (c === '"' || c === "'") { q = c; if (cur === null) cur = ''; continue; }
    if (/\s/.test(c)) { if (cur !== null) { out.push(cur); cur = null; } continue; }
    cur = (cur || '') + c;
  }
  if (q) throw bad('A quote is not closed.');
  if (cur !== null) out.push(cur);
  if (out.length > 200) throw bad('Too many arguments.');
  if (out.some(a => a.includes('\0'))) throw bad('Bad character in the arguments.');
  return out;
}
function quote(a) { a = String(a); return /^[\w@%+=:,./\\-]+$/.test(a) ? a : '"' + a.replace(/"/g, '\\"') + '"'; }
function lines(tool, entry, argv) { return { node: ['node', 'tools/' + entry].concat(argv).map(quote).join(' '), exe: ['ARSENAL', tool].concat(argv).map(quote).join(' ') }; }

// ---- launcher
function catalogue(ctx) { return C.load(ctx && ctx.tools ? ctx.tools : path.join(__dirname, '..', '..', '..')); }
// maintainer-only rows (dev:true) are neither listed nor found by name (GT-24)
function findTool(ctx, name) { const n = str(name, 80); const t = C.visible(catalogue(ctx).tools).find(x => x.name === n); if (!t) throw bad('Unknown tool: ' + n); return t; }
const GOH_SLOTS = new Set(['--goh', '--a', '--goh-mod', '--base-a']);
function prep(ctx, b) {
  const t = findTool(ctx, b.tool);
  // the port tools write AS2 data from GoH: on the GoH tab their {exe} is the AS2 target (as64; type mowas_2 for MoW:AS2), never goh,
  // and their {game} is the AS2 install (their --game is the AS2 view; {goh} gives the GoH install). The page's game box holds the GoH
  // install on that tab, so an empty box or one equal to the GoH install becomes the AS2 install; another folder picked is kept.
  const portGoh = t.group === 'port' && exeOfCtx(ctx) === 'goh';
  const exe = portGoh ? 'as64' : exeOfCtx(ctx);
  const gohd = fn(ctx, 'gohDir'), typed = str(b.game, 2000).trim();
  const same = (x, y) => !!x && !!y && path.resolve(x).toLowerCase() === path.resolve(y).toLowerCase();
  const mod = str(b.mod, 2000).trim();
  const game = portGoh && (!typed || same(typed, gohd)) ? (fn(ctx, 'game') || '') : (typed || curDirOf(ctx) || '');
  let argv = Array.isArray(b.argv) ? b.argv.map(x => String(x)) : parseArgs(b.args);
  const usesGoh = argv.some(a => a.includes('{goh}'));
  const goh = usesGoh ? (fn(ctx, 'gohDir') || '') : '';
  // a GoH slot of a port tool (--goh, --a, --goh-mod, --base-a) given {game} on the GoH tab keeps the GoH install (the game box), not the AS2 one
  const gohSlot = (a, prev) => portGoh && ((a === '{game}' && GOH_SLOTS.has(prev)) || (GOH_SLOTS.has(a.split('=')[0]) && a.endsWith('={game}')));
  argv = argv.map((a, i) => (gohSlot(a, argv[i - 1]) ? a.split('{game}').join(gohd || typed || '') : a)
    .split('{mod}').join(mod).split('{game}').join(game).split('{exe}').join(exe).split('{goh}').join(goh));
  if (argv.some(a => a === '')) throw bad('{mod}, {game} or {goh} is empty: pick the folder first.');
  const j = P.judge(t.name, argv, t);
  // MoW:AS2 shares the AS2 folder with as64.exe: a tool given no --exe reads the AS64 files there (vfs picks as64 first)
  const exeHint = gameIdOf(ctx) === 'mowas2' && !argv.some(a => a === '--exe' || a.startsWith('--exe='));
  return { t, argv, j, exeHint, line: t.entry ? lines(t.name, t.entry, argv) : null };
}

const routes = {
  'GET /api/x/pro/tools': async (u, b, ctx) => {
    const c = catalogue(ctx);
    // dir: the tools folder (the tools search box's Browse opens there)
    return { from: c.from, dir: ctx && ctx.tools ? ctx.tools : path.join(__dirname, '..', '..', '..'), tools: C.visible(c.tools).map(t => ({ name: t.name, group: t.group, run: t.run, what: t.what, entry: t.entry, state: P.state(t.name, t),
      why: P.state(t.name, t) === 'block' ? P.judge(t.name, [], t).why : null, dry: P.DRY[t.name] ? P.judge(t.name, [], t).dry || null : null })) };
  },
  'POST /api/x/pro/help': async (u, b, ctx) => {
    b = b || {};
    const t = findTool(ctx, b.tool);
    const head = C.header(ctx && ctx.tools ? ctx.tools : path.join(__dirname, '..', '..', '..'), t.entry);
    if (head) return { tool: t.name, from: 'source', text: head, run: t.run, what: t.what };
    // exe: no source; --help only for tools the launcher may run as they are
    if (!b.run) return { tool: t.name, from: 'index', text: '', run: t.run, what: t.what };
    const j = P.judge(t.name, ['--help'], t);
    if (!j.ok) return { tool: t.name, from: 'index', text: '', run: t.run, what: t.what, refused: j };
    const r = await ctx.runTool(t.name, t.entry, ['--help'], { timeoutMs: 15000, cwd: scratch(ctx) });
    if (r.cancelled) return STOPPED;
    return { tool: t.name, from: '--help', text: String(r.stdout + '\n' + r.stderr).trim().slice(0, 20000), run: t.run, what: t.what };
  },
  // JOBS: every route below returns STOPPED right after a ctx.runTool that the footer's Cancel stopped (the dispatcher answers 499
  // whatever comes back), so a killed tool's output is never read as a failure or a result
  'POST /api/x/pro/check': async (u, b, ctx) => { const p = prep(ctx, b || {}); return Object.assign({ tool: p.t.name, argv: p.argv, line: p.line, exeHint: p.exeHint }, p.j); },
  'POST /api/x/pro/run': async (u, b, ctx) => {
    b = b || {};
    const p = prep(ctx, b);
    if (!p.j.ok) return Object.assign({ tool: p.t.name, argv: p.argv, line: p.line, exeHint: p.exeHint, ran: false }, p.j);
    const sec = Math.max(5, Math.min(600, Number(b.timeoutSec) || 120));
    const t0 = Date.now();
    const r = await ctx.runTool(p.t.name, p.t.entry, p.argv, { timeoutMs: sec * 1000, cwd: scratch(ctx) });
    if (r.cancelled) return STOPPED;
    const cut = s => { s = String(s || ''); return s.length > 1 << 20 ? s.slice(0, 1 << 20) + '\n... (cut at 1 MB)' : s; };
    // a tool that refuses the page's game (games.refuse, exit 2) gives na: the page shows that plain line, not a failed run
    return { tool: p.t.name, argv: p.argv, line: p.line, exeHint: p.exeHint, ok: true, ran: true, na: naOf(r), code: r.code, timedOut: !!r.timedOut, ms: Date.now() - t0, stdout: cut(r.stdout), stderr: cut(r.stderr) };
  },

  // ---- E-30: contract command + form values -> CLI line (same argv the GUI run would use)
  'POST /api/x/pro/cmdline': async (u, b) => {
    b = b || {};
    const contract = require('../../contract');   // lazy: contract.js requires ext/index.js, which requires this file
    const c = contract.COMMANDS[str(b.cmd, 80)];
    if (!c || c.inproc) throw bad('Unknown command: ' + str(b.cmd, 80));
    let r;
    try { r = contract.buildArgv(str(b.cmd, 80), b.input || {}); } catch (e) { throw bad(e.message); }
    const argv = r.args;
    const node = ['node', 'tools/' + c.entry].concat(argv).map(quote).join(' ');
    const exe = ['ARSENAL', c.tool].concat(argv).map(quote).join(' ');   // same as gui.js childCmd in the single exe: exe <tool> args
    return { cmd: b.cmd, argv, node, exe, launches: r.launches, safeFlag: c.launch || null };
  },

  // ---- E-4 diff page
  // GT-36: overdiff (lib/vfs.js discover) finds a mod only in <game>/mods. A mod folder elsewhere (the GUI's own mod folders) is
  // compared through its installed copy (a junction to it, or a folder of the same name), or not run at all: the page says which.
  // Before this, the tool answered OVR_UNREADABLE (info) and the page counted no change: "No differences".
  'POST /api/x/pro/overdiff': async (u, b, ctx) => {
    b = b || {};
    let mod = absDir(b.mod, 'Mod folder', false);
    const mods = modsOf(b.mods, !mod);
    let game = gameOf(b, ctx, false);
    if (!game && mod && path.basename(path.dirname(mod)).toLowerCase() === 'mods') game = path.dirname(path.dirname(mod));
    if (!game && !mod) throw bad('Game folder not found. Set it on the Mods page or pick it here.');
    let via = null;
    // GoH: mods live outside the install (lib/writeguard); overdiff --exe goh mounts such a folder by path, so it is passed as given
    if (mod && game && gameIdOf(ctx) !== 'goh') {
      const inst = installedAs(mod, game);
      if (!inst) return { notInGame: true, mod, game, line: null, summary: { files: 0, changed: 0, added: 0, removed: 0, fullShadow: 0, identical: 0, opaque: 0, deleted: 0, unreadable: 0 }, byCode: {}, items: [] };
      if (inst.how !== 'in') { via = { how: inst.how, dir: inst.dir }; mod = inst.dir; }
    }
    const args = mod ? [mod] : [];
    if (game) args.push('--game', game);
    if (mods.length) args.push('--mods', mods.join(','));
    args.push(...exeArgs(ctx));
    args.push('--format', 'json');
    const r = await ctx.runTool('overdiff', 'overdiff/overdiff.js', args, { timeoutMs: 600000, cwd: scratch(ctx) });
    if (r.cancelled) return STOPPED;
    const na = naOf(r); if (na) return { na, line: lines('overdiff', 'overdiff/overdiff.js', args).node };
    const j = jsonOf(r.stdout);
    if (!j) throw bad('overdiff failed: ' + lastLines(r.stderr || r.stdout));
    const it = items(j), by = countBy(it, x => x.code);
    const unread = it.filter(x => x.code === 'OVR_UNREADABLE' || /^VFS_/.test(x.code || ''));
    return { line: lines('overdiff', 'overdiff/overdiff.js', args).node, via, summary: { files: new Set(it.filter(x => !/^VFS_/.test(x.code || '') && x.code !== 'OVR_UNREADABLE').map(x => x.file)).size,
      changed: by.OVR_KEY_CHANGED || 0, added: by.OVR_KEY_ADDED || 0, removed: by.OVR_KEY_REMOVED || 0, fullShadow: by.OVR_FULL_SHADOW || 0, identical: by.OVR_IDENTICAL || 0,
      opaque: by.OVR_OPAQUE_REPLACED || 0, deleted: by.OVR_FILE_DELETED || 0, unreadable: unread.length }, byCode: by, items: it };
  },
  'POST /api/x/pro/misdiff': async (u, b, ctx) => {
    b = b || {};
    let args;
    if (str(b.map, 200).trim()) {
      // vfs keys are lower case: a map typed as on disk ('multi/1v1_Hiekalla') must still find multi/1v1_hiekalla
      const map = str(b.map, 200).trim().toLowerCase(); if (!/^[\w./-]+$/.test(map) || map.startsWith('-') || map.includes('..')) throw bad('Bad map name.');
      args = ['--game', gameOf(b, ctx, true), '--map', map];
      const m = modsOf(b.mods, true); args.push('--mods', m.join(','));
      const ma = modsOf(b.modsA, false); if (ma.length) args.push('--mods-a', ma.join(','));
      args.push(...exeArgs(ctx));   // the --map form reads the game view: the page's game, not the vfs first pick
    } else args = [absPath(b.a, 'First map (old)'), absPath(b.b, 'Second map (new)')];
    args.push('--format', 'json');
    const r = await ctx.runTool('misdiff', 'misdiff/misdiff.js', args, { timeoutMs: 300000, cwd: scratch(ctx) });
    if (r.cancelled) return STOPPED;
    const na = naOf(r); if (na) return { na, line: lines('misdiff', 'misdiff/misdiff.js', args).node };
    const j = jsonOf(r.stdout);
    if (!j) throw bad('misdiff failed: ' + lastLines(r.stderr || r.stdout));
    const it = items(j), by = countBy(it, x => x.code);
    const sum = (re) => Object.entries(by).filter(([k]) => re.test(k)).reduce((s, [, n]) => s + n, 0);
    return { line: lines('misdiff', 'misdiff/misdiff.js', args).node, summary: { added: by.MIS_DIFF_ENTITY_ADDED || 0, removed: by.MIS_DIFF_ENTITY_REMOVED || 0, moved: by.MIS_DIFF_ENTITY_MOVED || 0,
      changed: (by.MIS_DIFF_ENTITY_CHANGED || 0) + (by.MIS_DIFF_ENTITY_DEF_CHANGED || 0), logic: sum(/^MIS_DIFF_(TRIGGER|ZONE|EVENT|WAYPOINT|TASK|VAR|LINK)_/), modes: sum(/^MIS_DIFF_MODE_/),
      other: sum(/^MIS_DIFF_(MAPINFO|HELPER|BLOCK|SPAWN)/), warnings: it.filter(x => x.sev !== 'info').length }, byCode: by, items: it };
  },
  'POST /api/x/pro/verdiff': async (u, b, ctx) => {
    b = b || {};
    const A = absPath(b.a, 'Old version'), B = absPath(b.b, 'New version');
    const top = Math.max(1, Math.min(200, Number(b.top) || 12));
    const jf = path.join(scratch(ctx, 'verdiff'), 'v-' + md5(A + '|' + B + '|' + Date.now()) + '.json');
    const args = [A, B, '--top', String(top), '--json', jf];
    const r = await ctx.runTool('verdiff', 'verdiff/verdiff.js', args, { timeoutMs: 600000, cwd: scratch(ctx) });
    let j = null; try { j = JSON.parse(fs.readFileSync(jf, 'utf8')); } catch (e) { j = null; }
    try { fs.rmSync(jf, { force: true }); } catch (e) { /* scratch */ }
    if (r.cancelled) return STOPPED;
    if (!j) throw bad('verdiff failed: ' + lastLines(r.stderr || r.stdout));
    const f = j.file || {};
    // keyLevel (verdiff): 'keys' | 'names+crc only' (snapshots) | 'files only (games differ)' (two games, e.g. AS2 and GoH): each has its own hint
    const differ = j.keyLevel === 'files only (games differ)', snap = j.keyLevel ? j.keyLevel === 'names+crc only' : !j.keys;
    return { line: lines('verdiff', 'verdiff/verdiff.js', [A, B, '--top', String(top)]).node, summary: { added: f.added || 0, removed: f.removed || 0, changed: f.changed || 0,
      renames: (j.renames || []).length, maybes: (j.maybes || []).length, keyLevel: !!j.keys, snap, differ }, keys: j.keys || null,
      renames: (j.renames || []).slice(0, 500), maybes: (j.maybes || []).slice(0, 500), text: String(r.stdout || '').slice(0, 200000) };
  },

  // ---- E-15 conflicts (resolver view)
  'POST /api/x/pro/conflicts': async (u, b, ctx) => {
    b = b || {};
    const game = gameOf(b, ctx, true), mods = modsOf(b.mods, true);
    const base = ['--game', game, '--mods', mods.join(',')].concat(exeArgs(ctx));
    const file = str(b.file, 300).trim(); if (file) { if (file.startsWith('-')) throw bad('Bad file filter.'); base.push('--file', file); }
    const [c, f] = await Promise.all([
      ctx.runTool('conflicts', 'conflicts/conflicts.js', base.concat(['--keys', '--fmt', 'csv']), { timeoutMs: 600000, cwd: scratch(ctx) }),
      ctx.runTool('conflicts', 'conflicts/conflicts.js', base.concat(['--fmt', 'json', '-q', '--joint']), { timeoutMs: 600000, cwd: scratch(ctx) })]);
    if (c.cancelled || f.cancelled) return STOPPED;
    const na = naOf(c); if (na) return { na, line: lines('conflicts', 'conflicts/conflicts.js', base.concat(['--keys', '--fmt', 'csv'])).node };
    if (c.code === 2) throw bad(lastLines(c.stderr || c.stdout) || 'conflicts failed');
    const rows = csvRows(c.stdout);
    // the second run is the tool's own json (items with their parts, the joint view checks): the same kind groups and codes as
    // Share > Mods together (share/routes togGroups), read-only here; the guided fixes are on that tab
    const j = jsonOf(f.stdout), own = j && Array.isArray(j.items);
    const it = own ? j.items.slice(0, 5000).map(x => ({ file: x.file, line: x.line || 0, code: x.code, msg: x.msg, sev: x.level === 'warn' ? 'warn' : 'info' })) : items(j);
    let groups = [];
    if (own) { try { groups = require('../share/routes').togGroups(j.items.filter(x => x.level === 'warn'), exeArgs(ctx).includes('goh')).map(g => ({ kind: g.kind, count: g.count, codes: g.codes || [], wins: g.wins || {}, files: [...new Set(g.items.map(c => c.file))].slice(0, 5) })); } catch (e) { groups = []; } }
    const per = {}; for (const m of mods) per[m] = { wins: 0, loses: 0 };
    for (const r of rows) {
      if (per[r.winner]) per[r.winner].wins++;
      const w = r.values.find(v => v.src === r.winner);
      for (const v of r.values) if (v.src !== 'vanilla' && v.src !== r.winner && per[v.src] && (!w || v.val !== w.val)) per[v.src].loses++;
    }
    const by = countBy(rows, r => r.kind), fb = countBy(it, x => x.code);
    // what a merge patch would hold (no tool writes one yet: plan text only)
    const plan = rows.filter(r => r.kind !== 'OVERRIDDEN').slice(0, 2000).map(r => r.file + '  ' + r.key + '  -> keeps ' + r.winner + ' (' + ((r.values.find(v => v.src === r.winner) || {}).val || '') + '); lost: ' +
      r.values.filter(v => v.src !== r.winner && v.src !== 'vanilla').map(v => v.src + '=' + v.val).join(', '));
    return { line: lines('conflicts', 'conflicts/conflicts.js', base.concat(['--keys', '--fmt', 'csv'])).node, order: mods,
      summary: { keys: rows.length, modMod: by.MOD_MOD || 0, overridden: by.OVERRIDDEN || 0, shadowed: by.SHADOWED || 0, fileShadow: fb.CONFLICT_FILE_SHADOW || 0, opaque: fb.WARN_CONFLICT_OPAQUE_MOD_MOD || 0 },
      perMod: per, groups, rows: rows.slice(0, 5000), files: it.filter(x => /FILE_SHADOW|OPAQUE/.test(x.code)), plan, patchTool: false };
  },
  'POST /api/x/pro/clean': async (u, b, ctx) => {
    b = b || {};
    const game = gameOf(b, ctx, true), mods = modsOf(b.mods, true), mod = modsOf([str(b.mod, 80)], true)[0];
    if (!mods.includes(mod)) throw bad('The mod to clean must be in the mod list.');
    const base = ['--game', game, '--mods', mods.join(',')].concat(exeArgs(ctx));
    if (!b.write) {   // preview: which files would be left out (identical to what they override)
      const r = await ctx.runTool('conflicts', 'conflicts/conflicts.js', base.concat(['--itm', '--format', 'json']), { timeoutMs: 600000, cwd: scratch(ctx) });
      if (r.cancelled) return STOPPED;
      const na = naOf(r); if (na) return { na, dry: true, mod, omit: [], itmKeys: 0 };
      if (r.code === 2) throw bad(lastLines(r.stderr || r.stdout) || 'conflicts failed');
      const it = items(jsonOf(r.stdout));
      const omit = it.filter(x => x.code === 'ITM_FILE' && String(x.msg).startsWith(mod + ':')).map(x => x.file);
      const keys = it.filter(x => x.code === 'ITM_KEY' && String(x.msg).startsWith(mod + ':')).length;
      return { dry: true, mod, omit, itmKeys: keys };
    }
    const out = outGuard(str(b.out, 2000), game, ctx, gameIdOf(ctx) === 'goh' || (fn(ctx, 'gohDir') && within(game, fn(ctx, 'gohDir'))));
    // JOBS: this request writes a copy of the mod into out. outGuard took only a folder that is not there or is empty, so every
    // file in it afterwards is this request's: a stopped run removes them (and the folder when the run made it), a half copy helps nobody
    const outWas = fs.existsSync(out);
    if (ctx.job) ctx.job.writes = true;
    const r = await ctx.runTool('conflicts', 'conflicts/conflicts.js', base.concat(['--clean', mod, '--out', out, '--format', 'json']), { timeoutMs: 600000, cwd: scratch(ctx) });
    if (r.cancelled) {
      try { if (!outWas) fs.rmSync(out, { recursive: true, force: true }); else for (const n of fs.readdirSync(out)) fs.rmSync(path.join(out, n), { recursive: true, force: true }); } catch (e) { /* in use: left */ }
      return STOPPED;
    }
    const it = items(jsonOf(r.stdout));
    const done = it.find(x => x.code === 'ITM_CLEANED' && x.file === '.');
    if (r.code === 2 || !done) throw bad('Could not write the copy: ' + lastLines(r.stderr || r.stdout));
    const m = /wrote (\d+) files .* omitted (\d+)/.exec(done.msg) || [];
    return { dry: false, mod, out, wrote: Number(m[1] || 0), omitted: Number(m[2] || 0), reparse: it.filter(x => x.code === 'CLEAN_REPARSE').length };
  },

  // the search boxes' index (searchKit): from the game's file view (vfs, cached 2 min per game): maps as 'multi/<name>' (misdiff --map),
  // unit and weapon names (sheet filter), resource folders as globs 'resource/<a>/<b>/**' (conflicts --file). No game: empty lists
  'GET /api/x/pro/names': async (u, b, ctx) => names(gameOf({ game: (u && u.searchParams.get('game')) || '' }, ctx, false), gameIdOf(ctx) === 'as64' ? '' : exeOfCtx(ctx), ctx),

  // ---- E-7 sheets
  'POST /api/x/pro/sheet': async (u, b, ctx) => {
    b = b || {};
    const folder = absDir(b.folder, 'Mod folder', false), game = gameOf(b, ctx, !folder), mods = modsOf(b.mods, false);
    const filt = str(b.filter, 200).trim();
    if (filt) { if (filt.startsWith('-')) throw bad('The filter may not start with "-".'); try { new RegExp(filt, 'i'); } catch (e) { throw bad('The filter is not a valid pattern: ' + e.message); } }
    // the cache key carries the game: MoW:AS2 and AS64 read the same folder but not the same files (as64/core)
    const gid = gameIdOf(ctx), cache = path.join(scratch(ctx, 'sheet'), 'ix-' + md5((gid === 'as64' ? '' : gid + '|') + (game || '-') + '|' + mods.join(',') + '|' + (folder || '')) + '.json');
    const args = [game || '-', '--sheet', 'all', '--fmt', 'csv', '-q', '--cache', cache];
    if (mods.length) args.push('--mods', mods.join(','));
    if (folder) args.push('--folder', folder);
    if (b.scope === 'mod') args.push('--scope', 'mod');
    if (filt) args.push('--filter', filt);
    args.push(...exeArgs(ctx));
    // GoH's cold read of the whole install takes longer than the AS2 one (479 s to over 600 s measured): 30 min there, 10 min else
    const limitSec = gid === 'goh' ? 1800 : 600;
    const r = await ctx.runTool('statsheet', 'statsheet/statsheet.js', args, { timeoutMs: limitSec * 1000, cwd: scratch(ctx) });
    if (r.cancelled) return STOPPED;
    const na = naOf(r); if (na) { const show = args.filter(a => a !== cache); show.splice(show.indexOf('--cache'), 1); return { na, line: lines('statsheet', 'statsheet/statsheet.js', show).node, sheets: {} }; }
    // statsheet keeps its cache only when a run finishes: a stopped run leaves none, so no promise of a faster second run
    if (r.timedOut) throw bad('Reading the game data took longer than ' + (limitSec / 60) + ' minutes and was stopped. Nothing was kept, so a second try starts over: run it when the machine is less busy, or pick a mod folder instead of the whole game.');
    const sheets = sheetsOf(r.stdout);
    if (r.code === 2 || !Object.keys(sheets).length) throw bad('statsheet failed: ' + lastLines(r.stderr || r.stdout));
    const show = args.filter(a => a !== cache); show.splice(show.indexOf('--cache'), 1);
    return { line: lines('statsheet', 'statsheet/statsheet.js', show).node, sheets };
  },
};

// ---- names for the search boxes (GET /api/x/pro/names)
// CACHE (gui README contract 1): the names come from the shared game view (lib/gameview, no view of its own) and are kept in the
// shared store: section pro.names, ver NAMES_VER, parts {game, exe}, stamps {game: gameview.stamp}. No age rule (it was 2 minutes):
// the stamp decides; NAMES is a memory in front of the store, per store + game + exe, dropped when the stamp moves.
const NAMES = new Map(), NAMES_VER = 1;
const namesStore = ctx => (ctx && ctx.cache) || require('../../../lib/cachestore').open({ root: path.join((ctx && ctx.tmpRoot) || os.tmpdir(), 'cache', 'store') });
function names(game, exe, ctx) {
  const none = { maps: [], names: [], dirs: [], truncated: false };
  if (!game) return none;
  const gv = require('../../../lib/gameview'), go = exe ? { gameDir: game, exe } : { gameDir: game };
  let S, st; try { S = namesStore(ctx); st = { game: gv.stamp(go) }; } catch (e) { return none; }
  const key = S.root + '|' + game + '|' + exe, parts = namesParts(game, exe);
  const c = NAMES.get(key); if (c && c.stamp === st.game) return c.v;
  try { const k = S.get('pro.names', NAMES_VER, parts, st); if (k && k.value && Array.isArray(k.value.names)) { NAMES.set(key, { stamp: st.game, v: k.value }); return k.value; } } catch (e) { /* no entry */ }
  let files;
  try { files = gv.get(go).files; } catch (e) { return none; }
  const MAX = 40000, maps = new Set(), nm = new Map(), dirs = new Set();
  for (const k of files.keys()) {
    let m = /^resource\/map\/(multi|single)\/([^/]+)\//.exec(k); if (m && maps.size < MAX) maps.add(m[1] + '/' + m[2]);
    m = /^resource\/(entity|set\/stuff)\/(?:.*\/)?([^/]+)\.(def|set|ext)$/.exec(k);
    if (m && !/\/x\//.test(k) && nm.size < MAX && !nm.has(m[2])) nm.set(m[2], m[1] === 'entity' ? 'unit' : 'stuff');
    const p = k.split('/'); if (p[0] === 'resource' && p.length > 2 && dirs.size < MAX) { dirs.add(p.slice(0, 2).join('/') + '/**'); if (p.length > 3) dirs.add(p.slice(0, 3).join('/') + '/**'); }
  }
  const v = { maps: [...maps].sort(), names: [...nm].map(([n, k]) => ({ n, k })), dirs: [...dirs].sort(), truncated: nm.size >= MAX };
  if (NAMES.size > 8) NAMES.clear();
  NAMES.set(key, { stamp: st.game, v });
  try { S.put('pro.names', NAMES_VER, parts, st, v); } catch (e) { /* the store is best effort */ }
  return v;
}

// ---- CSV
function csvSplit(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur); return out;
}
function csvRows(txt) {
  const L = String(txt || '').split(/\r?\n/);
  const i = L.findIndex(l => l.startsWith('file,key,kind,winner,values'));
  if (i < 0) return [];
  const out = [];
  for (const l of L.slice(i + 1)) {
    if (!l.startsWith('"')) continue;
    const [file, key, kind, winner, vals] = csvSplit(l);
    out.push({ file, key, kind, winner, values: String(vals || '').split(' | ').map(s => { const k = s.indexOf('='); return k < 0 ? { src: s, val: '' } : { src: s.slice(0, k), val: s.slice(k + 1) }; }) });
  }
  return out;
}
function sheetsOf(txt) {
  const out = {}; let cur = null;
  for (const l of String(txt || '').split(/\r?\n/)) {
    const m = /^# (weapons|ammo|armor|price|research)\s*$/.exec(l);   // research: GoH only (statsheet --sheet all under --exe goh)
    if (m) { cur = out[m[1]] = { cols: null, rows: [] }; continue; }
    if (!cur) continue;
    if (!l.trim()) { if (cur.cols) cur = cur.rows.length || cur.cols ? cur : null; continue; }
    if (!cur.cols) { cur.cols = csvSplit(l); continue; }
    if (cur.rows.length < 20000) cur.rows.push(csvSplit(l));
  }
  for (const k of Object.keys(out)) if (!out[k].cols) out[k].cols = [];
  return out;
}

// clean copy target: a new or empty folder; never in the game (except a new <game>/mods/<name>), Steam Workshop, GoH or the tools folder.
// goh = the game folder is the GoH install: ARSENAL does not write into it at all, its mods folder included (writeguard rule).
function outGuard(v, game, ctx, goh) {
  const d = str(v, 2000).trim();
  if (!d || !path.isAbsolute(d)) throw bad('Pick a new folder for the copy (full path).');
  const out = path.resolve(d);
  if (fs.existsSync(out)) { if (!fs.statSync(out).isDirectory() || fs.readdirSync(out).length) throw bad('That folder is not empty. Pick a new or empty folder.'); }
  else if (!fs.existsSync(path.dirname(out))) throw bad('The parent folder does not exist.');
  const gd = fn(ctx, 'gohDir');
  const inMods = g => within(out, path.join(g, 'mods')) && path.resolve(out) !== path.resolve(path.join(g, 'mods'));   // owner decision 2026-11-15: <GoH>/mods/<name> is allowed
  if ((goh && game && within(out, game) && !inMods(game)) || (gd && within(out, gd) && !inMods(gd))) throw bad('ARSENAL does not write into the Gates of Hell install: pick a folder outside it.');
  if (game && within(out, game) && path.resolve(path.dirname(out)) !== path.resolve(game, 'mods')) throw bad('Inside the game folder only a new folder directly in mods/ is allowed.');
  if (/[\\/]steamapps[\\/]workshop([\\/]|$)/i.test(out)) throw bad('Pick a folder outside the Steam Workshop folder.');
  if (/gates of hell|call to arms/i.test(out)) throw bad('Pick a folder outside Gates of Hell.');
  if (ctx && ctx.tools && within(out, ctx.tools)) throw bad('Pick a folder outside the ARSENAL tools folder.');
  return out;
}

const STOPPED = { cancelled: true };
// Prepare (gui README "Prepare sections"): the names of the search boxes. q = {mod, game: {id, dir, exe}}. Game only. Reading them
// from the shared view takes about 0.4 s in one step on the AS2 install (plus the view itself when nobody built it), 6 ms from the store.
const namesArgs = q => { const g = (q && q.game) || {}, id = GAMES.idOf(g.id) || GAMES.DEFAULT; return { game: g.dir || '', exe: id === 'as64' ? '' : GAMES.exeOf(id) }; };
const namesParts = (game, exe) => ({ game: path.resolve(game).replace(/\\/g, '/').toLowerCase(), exe: exe || '' });
const prepSections = [{
  id: 'pro.names', title: 'pro.prep.names', needs: ['game.view'], areas: [],
  state(ctx, q) {
    const a = namesArgs(q); if (!a.game || !fs.existsSync(a.game)) return { state: 'na', why: [] };
    return namesStore(ctx).state('pro.names', NAMES_VER, namesParts(a.game, a.exe), { game: require('../../../lib/gameview').stamp(a.exe ? { gameDir: a.game, exe: a.exe } : { gameDir: a.game }) });
  },
  async run(ctx, q, job) {
    const a = namesArgs(q);
    if (job && job.set) job.set({ stage: 'pro.prep.names', done: 0, total: 1 });
    await new Promise(r => setImmediate(r));
    if (job && job.cancelled) return { cancelled: true };
    const v = names(a.game, a.exe, ctx);
    if (job && job.set) job.set({ stage: 'pro.prep.names', done: 1, total: 1 });
    return { names: v.names.length, maps: v.maps.length };
  },
}];
module.exports = { routes, prep: prepSections, parseArgs, quote, csvRows, sheetsOf, outGuard, installedAs, _names: { names, NAMES, NAMES_VER, namesStore, namesParts } };

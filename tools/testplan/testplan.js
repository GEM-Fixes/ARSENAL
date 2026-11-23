#!/usr/bin/env node
// testplan: test every recent change of a mod. One document (plan.json) says what the mod changed, which test rows that makes,
// how each row is tested (no game, a game run, the player) and what its result is. Contract: tools/testplan/README.md.
//   node tools/testplan/testplan.js <verb> <mod folder> [--game dir] [--exe as64|mowas_2|mowas2|goh] [--mods a,b] [--state dir]
//        [--out dir] [--since last|Nh|Nd|ISO|git[:ref]|vanilla|all] [--only check,check] [--json]
//   changes     the change list (--since, default last: against the snapshot of the last `mark`)
//   plan        changes + items + rows + checklist, written to <out>/plan.json (default out: <state>/run); prints the summary.
//               --everything = since all, every model and gun of the mod
//               --in-game = only the checks done in the game (game runs and the player's list); file checks are Check & Fix's job
//   static      runs the no-game checks into the plan
//   emit        writes the runner files (edrun pairs, prove lines, sweep names) and prints the commands; starts nothing
//   read        [--dirs a,b] reads run reports into the plan
//   list        [--how static|run|player] [--status s] [--q words] prints rows: code, status, check, item
//   checklist   [--md file] the list for the player (markdown)
//   tick        <code> pass|fail|skip [--note text]: the player's result of a row (player rows and checklist rows only)
//   mark        records the snapshot: the mod as tested now (the next `changes --since last` starts here)
//   pairs suggest <mod folder> --shooter a [--foe b] [--cls c]     pairs check [<mod folder>] <file>     pairs id <file>
//   --game: none given = the game the mod sits in (<game>/mods/<mod>), else the installed game; `--game -` = no game (only
//     `changes` and the file-level items work). --state default <mod>/.arsenal/testplan. --mods default: as64 = as64+, else none.
//   --json: one JSON document on stdout and nothing else (an error: {ok:false, error, exit}).
//   exit 0 ok, 1 a row failed (static, read), 2 usage, 3 could not run (a part is missing or failed, no plan yet).
//   writes only to --out and --state (and the --md file). Reads the game and the mod. Starts no game.
// Author: Imperator_Aug (ARSENAL, ia-c41128d6)
'use strict';
require('../lib/help')(__filename);
const fs = require('fs'), path = require('path');

const VERBS = ['changes', 'plan', 'static', 'emit', 'read', 'list', 'checklist', 'tick', 'mark', 'pairs'];
const VALUES = ['game', 'exe', 'mods', 'state', 'out', 'since', 'only', 'how', 'status', 'q', 'note', 'md', 'dirs', 'shooter', 'foe', 'cls', 'lang', 'check-json'];
const FLAGS = ['json', 'everything', 'in-game'];
const USAGE = 'usage: node tools/testplan/testplan.js <' + VERBS.join('|') + '> <mod folder> [--game dir] [--exe as64|mowas_2|mowas2|goh] [--mods a,b] [--state dir] [--out dir] [--since last|Nh|Nd|ISO|git[:ref]|vanilla|all] [--only check,check] [--json]  (--help: every verb)';

class Stop extends Error { constructor(exit, msg, extra) { super(msg); this.exit = exit; this.extra = extra || null; } }
const usage = msg => new Stop(2, msg);
const cannot = (msg, extra) => new Stop(3, msg, extra);

function parseArgs(argv) {
  const a = { pos: [] };
  for (let i = 0; i < argv.length; i++) {
    const s = argv[i];
    if (!/^--./.test(s)) { a.pos.push(s); continue; }
    const k = s.slice(2);
    if (FLAGS.includes(k)) a[k] = true;
    else if (VALUES.includes(k)) {
      if (i + 1 >= argv.length) throw usage(s + ' needs a value');
      a[k] = argv[++i];
    } else throw usage('unknown option ' + s);
  }
  return a;
}
const list = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean);

// ---- parts: required inside the verb that needs them, so --help and the other verbs work while one is missing ----
function part(name) {
  const file = path.join(__dirname, 'lib', name + '.js');
  if (!fs.existsSync(file)) throw cannot('testplan: part ' + name + ' is missing (tools/testplan/lib/' + name + '.js)', { part: name });
  try { return require(file); }
  catch (e) { throw cannot('testplan: part ' + name + ' failed to load: ' + (e && e.message || e), { part: name }); }
}
// one call into a part: a throw (or a rejected promise) is "could not run", named after the part
async function call(name, fn, args) {
  const p = part(name);
  if (typeof p[fn] !== 'function') throw cannot('testplan: part ' + name + ' has no ' + fn + '() (README contract)', { part: name });
  try { return await p[fn](...args); }
  catch (e) {
    if (e instanceof Stop) throw e;
    throw cannot('testplan: part ' + name + ' failed (' + name + '.' + fn + '): ' + (e && e.message || e), { part: name, needsGame: !!(e && e.needsGame) });
  }
}

// ---- plan document ----
const planFile = out => path.join(out, 'plan.json');
function loadPlan(out) {
  const f = planFile(out);
  let t;
  try { t = fs.readFileSync(f, 'utf8'); } catch (e) { throw cannot('testplan: no plan yet (' + f + '): run `plan` first'); }
  let p;
  try { p = JSON.parse(t); } catch (e) { throw cannot('testplan: ' + f + ' is not JSON: ' + e.message); }
  if (!p || p.tool !== 'testplan' || !Array.isArray(p.rows)) throw cannot('testplan: ' + f + ' is not a testplan plan');
  return p;
}
function savePlan(out, plan) {
  fs.mkdirSync(out, { recursive: true });
  const f = planFile(out), tmp = f + '.' + process.pid + '.part';
  fs.writeFileSync(tmp, JSON.stringify(plan, null, 1) + '\n');
  fs.renameSync(tmp, f);
  return f;
}
const stackOf = st => ({ gid: st.gid, exe: st.exe, gameDir: st.gameDir, folder: st.folder, name: st.name, mods: st.mods, canRun: st.canRun, why: st.why });
// the status counts follow the rows; the other counts of the summary (rows part) do not change with a status
function recount(plan) {
  const s = plan.summary && typeof plan.summary === 'object' ? plan.summary : (plan.summary = {});
  const by = {};
  for (const r of plan.rows) by[r.status] = (by[r.status] || 0) + 1;
  s.byStatus = by;
  if (typeof s.rows !== 'number') s.rows = plan.rows.length;
  if (!s.byHow) { s.byHow = { static: 0, run: 0, player: 0 }; for (const r of plan.rows) s.byHow[r.how] = (s.byHow[r.how] || 0) + 1; }
  if (!s.byCheck) { s.byCheck = {}; for (const r of plan.rows) s.byCheck[r.check] = (s.byCheck[r.check] || 0) + 1; }
  if (typeof s.items !== 'number') s.items = Array.isArray(plan.items) ? plan.items.length : 0;
  return plan;
}
const notesOf = x => x == null ? [] : Array.isArray(x) ? x.map(String) : [String(x)];
// a part may take the list or the object it came in: the list carries the object's fields too
function both(arr, obj, key) {
  const a = Array.isArray(arr) ? arr.slice() : [];
  for (const k of Object.keys(obj || {})) if (k !== key) Object.defineProperty(a, k, { value: obj[k], enumerable: false });
  Object.defineProperty(a, key, { value: a, enumerable: false });
  return a;
}
const checklistRows = plan => {
  const ids = new Set();
  for (const s of (plan.checklist && plan.checklist.sessions) || []) for (const e of s.entries || []) { if (e.row) ids.add(e.row); }
  return ids;
};
const tickable = (plan, row, inList) => row.how === 'player' || (inList || checklistRows(plan)).has(row.id);
// the player's ticks kept in the state dir, laid over a new plan: only a tick set after the last change of the row's files
function applyTicks(plan, ticks) {
  const map = Array.isArray(ticks) ? Object.fromEntries(ticks.filter(t => t && (t.id || t.row)).map(t => [t.id || t.row, t])) : (ticks || {});
  if (!Object.keys(map).length) return 0;
  const mtime = new Map(((plan.changes && plan.changes.files) || []).map(f => [f.rel, f.mtimeMs || 0]));
  const items = new Map((plan.items || []).map(i => [i.id, i]));
  let n = 0;
  for (const r of plan.rows) {
    const t = map[r.id];
    if (!t || !/^(pass|fail|skip)$/.test(String(t.v)) || r.how !== 'player') continue;
    const at = Date.parse(t.at || '');
    if (!isFinite(at)) continue;
    const it = items.get(r.item);
    const newest = Math.max(0, ...((it && it.why) || []).map(w => mtime.get(w.rel) || 0));
    if (newest > at) continue;
    r.status = t.v; r.result = { tool: 'player', note: t.note || '', at: t.at };
    n++;
  }
  return n;
}
async function refreshChecklist(plan, st, lang) {
  // names and numbers of the units list (statsheet, kept in the state dir); none without a game folder or when it fails
  let units = [];
  try { units = await require('./lib/stack').units(st); } catch (e) { units = []; }
  plan.checklist = await call('checklist', 'build', [plan, { lang: lang || 'en', units, stack: st }]);
  return plan.checklist;
}
// results of a static or a read run into the plan (results.apply), then the checklist again: failed rows go to the player
async function applyResults(plan, res, st, lang) {
  const rows = both(res && res.rows, res, 'rows');
  const p = await call('results', 'apply', [plan, rows]);
  const next = p && Array.isArray(p.rows) ? p : plan;
  recount(next);
  await refreshChecklist(next, st, lang);
  return next;
}

// ---- output ----
let JSON_MODE = false;
const out = s => { if (!JSON_MODE) process.stdout.write(s + '\n'); };
const doc = o => { if (JSON_MODE) process.stdout.write(JSON.stringify(o) + '\n'); };
const counts = o => Object.keys(o || {}).filter(k => o[k]).map(k => k + ' ' + o[k]).join(', ') || 'none';
function printSummary(plan, file) {
  const c = (plan.changes && plan.changes.counts) || {}, s = plan.summary || {}, b = (plan.changes && plan.changes.base) || {};
  out('testplan: ' + plan.stack.name + ' (' + plan.stack.gid + ')' + (plan.stack.gameDir ? '' : ', no game folder') + ', since ' + (plan.changes && plan.changes.since) + (b.kind ? ' (base ' + b.kind + ')' : ''));
  out('changes: ' + (c.added || 0) + ' added, ' + (c.changed || 0) + ' changed, ' + (c.removed || 0) + ' removed');
  const its = plan.items || [];
  out('items: ' + its.length + ' (' + its.filter(i => i.source === 'depends').length + ' through a dependency), ' + (plan.unmapped || []).length + ' files mapped to no item');
  out('rows: ' + plan.rows.length + ' (' + counts(s.byHow) + ')');
  out('status: ' + counts(s.byStatus));
  const cl = plan.checklist;
  if (cl && Array.isArray(cl.sessions)) out('checklist: ' + cl.sessions.reduce((n, x) => n + ((x.entries || []).length), 0) + ' entries in ' + cl.sessions.length + ' sessions');
  for (const n of notesOf(plan.changes && plan.changes.notes).concat(notesOf(plan.notes))) out('note: ' + n);
  if (file) out('plan: ' + file);
}
const rowLine = r => [r.code, String(r.status).padEnd(8), String(r.check).padEnd(7), r.item + (r.target && r.target.weapon ? ' [' + r.target.weapon + ']' : '')].join('  ');

// ---- verbs ----
async function main(argv) {
  const a = parseArgs(argv);
  JSON_MODE = !!a.json;
  const verb = a.pos.shift();
  if (!verb) throw usage(USAGE);
  if (!VERBS.includes(verb)) throw usage('unknown verb "' + verb + '"\n' + USAGE);
  const stackLib = require('./lib/stack');
  const mkStack = (folder, need) => {
    if (need && !folder) throw usage(verb + ': the mod folder is missing\n' + USAGE);
    if (folder && !(fs.existsSync(folder) && fs.statSync(folder).isDirectory())) throw usage(verb + ': not a folder: ' + folder);
    try { return stackLib.resolve({ game: a.game, exe: a.exe, mods: a.mods === undefined ? undefined : list(a.mods), folder, state: a.state }); }
    catch (e) { if (e && e.code === 'BAD_EXE') throw usage(e.message); throw e; }
  };

  if (verb === 'pairs') return pairsVerb(a, mkStack);

  const st = mkStack(a.pos.shift(), true);
  const OUT = a.out ? path.resolve(a.out) : path.join(st.state, 'run');
  let only = a.only === undefined ? undefined : list(a.only);
  // --in-game (the Test Run page): only the checks done in the game, by a run or by the player; the file checks stay on Check & Fix
  if (a['in-game'] || a.inGame) { const ig = require('./lib/catalog').CHECKS.filter(c => c.how !== 'static').map(c => c.id); only = only ? only.filter(x => ig.includes(x)) : ig; }

  if (verb === 'changes') {
    const ch = await call('changes', 'find', [st, { since: a.since || 'last' }]);
    doc(ch);
    for (const f of ch.files || []) out(String(f.state).padEnd(8) + String(f.area || '').padEnd(11) + f.rel);
    const c = ch.counts || {};
    out((ch.files || []).length + ' files since ' + ch.since + ((ch.base && ch.base.kind) ? ' (base ' + ch.base.kind + ')' : '') + ': ' + (c.added || 0) + ' added, ' + (c.changed || 0) + ' changed, ' + (c.removed || 0) + ' removed');
    for (const n of notesOf(ch.notes)) out('note: ' + n);
    return 0;
  }

  if (verb === 'plan') {
    const since = a.everything ? 'all' : (a.since || 'last');
    const ch = await call('changes', 'find', [st, { since }]);
    const it = await call('items', 'from', [st, ch, { deps: true }]);
    const rw = await call('rows', 'build', [st, both(it && it.items, it, 'items'), { only, everything: !!a.everything }]);
    const plan = {
      v: 1, tool: 'testplan', made: new Date().toISOString(), stack: stackOf(st), changes: ch,
      items: (it && it.items) || [], unmapped: (it && it.unmapped) || [], rows: (rw && rw.rows) || [], summary: (rw && rw.summary) || {},
      emitted: null, checklist: null, notes: notesOf(it && it.notes),
    };
    if (!st.gameDir) plan.notes.push('no game folder: only the file-level items and rows; give --game for the rest');
    let ticks = null;
    try { const state = part('state').open(st.state); ticks = state.ticks(); } catch (e) { if (!(e instanceof Stop)) plan.notes.push('ticks not read: ' + (e && e.message || e)); }
    const kept = ticks ? applyTicks(plan, ticks) : 0;
    if (kept) plan.notes.push(kept + ' player results kept from before (set after the last change of their files)');
    recount(plan);
    await refreshChecklist(plan, st, a.lang);
    for (const w of st.warnings) plan.notes.push(w);
    const f = savePlan(OUT, plan);
    doc(plan);
    printSummary(plan, f);
    return 0;
  }

  if (verb === 'mark') {
    let plan = null;
    try { plan = loadPlan(OUT); } catch (e) { plan = null; }
    const r = await call('changes', 'mark', [st, { plan, out: OUT }]);
    doc(r && typeof r === 'object' ? r : { ok: true, marked: true, state: st.state });
    out('marked: the mod as it is now is the base of `--since last` (' + st.state + ')');
    return 0;
  }

  // every verb below works on the saved plan
  let plan = loadPlan(OUT);

  if (verb === 'list') {
    const words = String(a.q || '').toLowerCase().split(/\s+/).filter(Boolean);
    const hay = r => [r.code, r.id, r.check, r.item, r.how, r.status, r.title, r.runner, ...Object.values(r.target || {})].filter(x => x != null).join(' ').toLowerCase();
    const rows = plan.rows.filter(r => (!a.how || r.how === a.how) && (!a.status || r.status === a.status) && (!words.length || (h => words.every(w => h.includes(w)))(hay(r))));
    doc({ rows, count: rows.length, of: plan.rows.length });
    for (const r of rows) out(rowLine(r));
    out(rows.length + ' rows' + (rows.length !== plan.rows.length ? ' of ' + plan.rows.length : ''));
    return 0;
  }

  if (verb === 'checklist') {
    const cl = await refreshChecklist(plan, st, a.lang);
    savePlan(OUT, plan);
    const md = await call('checklist', 'md', [cl]);
    if (a.md) { fs.mkdirSync(path.dirname(path.resolve(a.md)), { recursive: true }); fs.writeFileSync(path.resolve(a.md), String(md).replace(/\s*$/, '\n')); }
    doc(cl);
    if (a.md) out('checklist: ' + path.resolve(a.md)); else out(String(md).replace(/\s+$/, ''));
    return 0;
  }

  if (verb === 'tick') {
    const code = a.pos.shift(), v = a.pos.shift();
    if (!code || !v) throw usage('tick: give the row code and pass|fail|skip');
    if (!['pass', 'fail', 'skip'].includes(v)) throw usage('tick: the result is pass, fail or skip, not "' + v + '"');
    const row = plan.rows.find(r => String(r.code).toLowerCase() === code.toLowerCase()) || plan.rows.find(r => r.id === code);
    if (!row) throw usage('tick: no row ' + code + ' in ' + planFile(OUT));
    if (!tickable(plan, row)) throw usage('tick: ' + row.code + ' (' + row.check + ') is a ' + row.how + ' row that is not on the checklist: its result comes from `' + (row.how === 'static' ? 'static' : 'read') + '`, not from the player');
    const at = new Date().toISOString(), note = a.note || '';
    const state = part('state').open(st.state);
    try { state.setTick(row.id, { v, note, at }); }
    catch (e) { throw cannot('testplan: part state failed (setTick): ' + (e && e.message || e), { part: 'state' }); }
    row.status = v; row.result = { tool: 'player', note, at };
    for (const s of (plan.checklist && plan.checklist.sessions) || []) for (const e of s.entries || []) if (e.row === row.id) e.status = v;
    recount(plan);
    savePlan(OUT, plan);
    doc({ ok: true, row, summary: plan.summary });
    out(rowLine(row));
    return 0;
  }

  if (verb === 'static' || verb === 'read') {
    const res = verb === 'static'
      ? await call('static', 'run', [st, plan, { only, checkJson: a['check-json'] === undefined ? undefined : path.resolve(a['check-json']), onProgress: p => { if (!JSON_MODE) process.stderr.write('static: ' + (typeof p === 'string' ? p : JSON.stringify(p)) + '\n'); } }])
      : await call('results', 'read', [st, plan, { out: OUT, dirs: a.dirs === undefined ? undefined : list(a.dirs).map(d => path.resolve(d)) }]);
    plan = await applyResults(plan, res, st, a.lang);
    const got = (res && res.rows) || [], tools = (res && res.tools) || [];
    const f = savePlan(OUT, plan);
    const failed = got.filter(r => r.status === 'fail');
    doc({ ok: !failed.length, verb, rows: got, tools, notes: notesOf(res && res.notes), summary: plan.summary, plan: f });
    const byId = new Map(plan.rows.map(r => [r.id, r]));
    for (const t of tools) out('tool ' + t.tool + ': ' + (t.ok === false ? 'could not run: ' + (t.error || '?') : 'ok') + (t.ms != null ? ' (' + t.ms + ' ms)' : ''));
    for (const r of got) {
      if (r.status !== 'fail' && r.status !== 'unproven' && r.status !== 'void' && r.status !== 'held') continue;
      const row = byId.get(r.id);
      out(row ? rowLine(row) : r.id + '  ' + r.status);
      for (const x of ((r.result && r.result.findings) || []).slice(0, 5)) out('    ' + [x.file ? x.file + (x.line ? ':' + x.line : '') + ':' : '', x.code || '', x.msg || ''].filter(Boolean).join(' '));
      if (r.result && r.result.note) out('    ' + r.result.note);
    }
    for (const n of notesOf(res && res.notes)) out('note: ' + n);
    out(verb + ': ' + got.length + ' rows answered, ' + failed.length + ' failed; status: ' + counts(plan.summary.byStatus));
    return failed.length ? 1 : 0;
  }

  if (verb === 'emit') {
    const e = await call('emit', 'write', [st, plan, { out: OUT }]);
    plan.emitted = e || null;
    savePlan(OUT, plan);
    doc(e);
    for (const f of (e && e.files) || []) out('file ' + String(f.kind || '').padEnd(8) + f.path + ' (' + ((f.rows || []).length) + ' rows)');
    for (const c of (e && e.commands) || []) {
      out([c.id, c.runner || c.how, c.dry ? 'dry' : c.needsLaunch ? 'starts the game' : 'no game', ((c.rows || []).length) + ' rows'].join('  '));
      out('    ' + (c.cmd || ('node ' + (c.argv || []).join(' '))));
    }
    for (const n of notesOf(e && e.notes)) out('note: ' + n);
    out('emit: ' + (((e && e.files) || []).length) + ' files, ' + (((e && e.commands) || []).length) + ' commands in ' + OUT + ' (nothing started)');
    return 0;
  }
  throw usage(USAGE);
}

async function pairsVerb(a, mkStack) {
  const sub = a.pos.shift();
  const readPairs = f => {
    if (!f) throw usage('pairs ' + sub + ': the pairs file is missing');
    let j;
    try { j = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { throw usage('pairs ' + sub + ': cannot read ' + f + ': ' + e.message); }
    const l = Array.isArray(j) ? j : j && Array.isArray(j.pairs) ? j.pairs : null;
    if (!l) throw usage('pairs ' + sub + ': ' + f + ' holds no pair list');
    return l;
  };
  if (sub === 'id') {
    const l = readPairs(a.pos.shift()), p = part('pairs');
    const r = l.map(x => ({ id: p.id(x), name: x.name || (p.name ? p.name(x) : '') }));
    doc(r);
    for (const x of r) out(x.id + '  ' + x.name);
    return 0;
  }
  // one sentence and the id per pair, from the pair alone (no game read: the id follows the distance and the switches)
  if (sub === 'describe') {
    const l = readPairs(a.pos.pop()), p = part('pairs');
    const r = l.map(x => p.describe(x));
    doc(r);
    for (const x of r) out(x.id + '  ' + x.text);
    return 0;
  }
  if (sub === 'suggest') {
    if (!a.shooter) throw usage('pairs suggest: --shooter is missing');
    const st = mkStack(a.pos.shift(), false);
    const o = { shooter: a.shooter };
    if (a.foe) o.foe = a.foe;
    if (a.cls) o.cls = a.cls;
    const r = await call('pairs', 'suggest', [st, o]);
    doc(r);
    out(JSON.stringify(r, null, 1));
    return 0;
  }
  if (sub === 'check') {
    const file = a.pos.pop(), st = mkStack(a.pos.shift(), false);
    const r = await call('pairs', 'check', [st, readPairs(file)]);
    doc(r);
    for (const x of r || []) out([x.id, x.status, ...(x.notes || []), ...(x.warns || [])].filter(Boolean).join('  '));
    return 0;
  }
  throw usage('pairs: suggest, check, describe or id\n' + USAGE);
}

function finish(code) { process.exitCode = code; }
if (require.main === module) {
  main(process.argv.slice(2)).then(finish, e => {
    const exit = e instanceof Stop ? e.exit : 3;
    const msg = e instanceof Stop ? e.message : 'testplan: could not run: ' + (e && e.stack || e);
    if (process.argv.includes('--json')) process.stdout.write(JSON.stringify(Object.assign({ ok: false, error: msg.split('\n')[0], exit }, e instanceof Stop && e.extra ? e.extra : {})) + '\n');
    process.stderr.write(msg + '\n');
    finish(exit);
  });
}
module.exports = { main, parseArgs, recount, applyTicks, VERBS };

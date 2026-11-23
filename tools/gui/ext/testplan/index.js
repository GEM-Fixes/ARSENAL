// GUI-EXT testplan: the Test Plan page (Test, Share & Play > Test Run, first page; AS64, MoW:AS2 and GoH) and the routes of the
// unit pair picker on the core Test Run page. Contract: tools/testplan/README.md ("GUI routes"). The tool is used only through its
// command line with --json (ctx.runTool); the page never requires tools/testplan/**. The only files read here directly are the ones
// the contract names and gives no verb for: <state>/history.json, <state>/ticks.json, <out>/plan.json and <state>/pairs/<name>.json.
//
// Routes (all under /api/x/testplan/; every body may carry mod = the mod folder; the game is the request's game, ctx.gameId()):
//   POST plan       {mod, since, everything, q, file, how, status, limit, force, wait} -> the plan view (below), or {pending:true, running}
//                   while the plan is being made as a background job (wait:true = answer when it is made)
//   GET  status     ?mod= -> {running, verb, secs, stage, done, total, state, error, key}
//   POST emit       {mod, since, everything} -> {out, files, commands:[{id, how, runner, cmd, argv, dry, needsLaunch, rows, input, partial}], notes, canRun}
//   POST read       {mod, since, everything, dirs:[..]} -> the plan view
//   POST tick       {mod, since, everything, code, v:'pass'|'fail'|'skip', note} -> {ok, code, v, summary, counts}
//   POST mark       {mod} -> {ok, mark:{at, files, rowsPassed, rowsFailed, rowsOpen}}
//   POST checklist  {mod, since, everything} -> {file, text}   (markdown, written into the state dir)
//   GET  state      ?mod= -> {mod, gid, state:{dir, own, why}, lastMark, marks, ticks:{pass, fail, skip}, canRun, why, running}
//   POST pairs/suggest  {mod, shooter, foe, cls} -> {pair}
//   POST pairs/check    {mod, pairs:[..]} -> {results:[{id, status, notes, warns}]}
//   GET  pairs/lib      ?mod=            -> {dir, names:[{name, pairs, mtimeMs}]}
//   GET  pairs/lib      ?mod=&name=      -> {name, file, pairs:[..]}
//   POST pairs/lib      {mod, name, pairs:[..]}  (or op:'save')    -> {ok, name, file, pairs}   each pair carries id
//   POST pairs/lib      {mod, name, remove:true} (or op:'remove')  -> {ok, name, removed}
//   POST pairs/lib      {mod, name, op:'get'}                      -> {name, file, path, pairs}
//   (the picker of the core Test Run page reads files, path, count and pairs from these answers: they are given under both names)
//   POST pairs/describe {mod, pairs:[..]} -> {pairs:[{id, name, text, shooter, foe, dist, flags}], local}   local:true = the tool has no
//                       describe verb here; the texts were then made from the ids alone
// Plan view: plan.json without items and with rows cut to the filter and the limit:
//   {pending:false, v, made, since, everything, stack, changes:{.., files (300 at most), filesTotal}, summary, notes, state:{dir, own, why},
//    rows:[{id, code, item, name, kind, check, how, runner, title, status, target, expect, why, limits, result}], rowsTotal, rowsMatched,
//    index:[{label, value, hint}], checklist:{sessions, counts, more}, emitted, lastMark}
// State dir: <GUI data dir>/testplan/<hash of the mod path> (the folder of gui/settings.js's file), or <mod>/.arsenal/testplan when
// that is there already or a write route makes it first (stateOf); a read route never makes it. A mod the page may not write into
// (lib/writeguard: a GoH mod inside the GoH install without Advanced, a Workshop item) always uses the data dir. --out = <state>/run.
// CACHE (PERF.md part 1): the plan is kept in the store (section testplan.plan) by game, game id, mod, since; stamps: the game, the
// mod's whole listing (lib/modtree 'all'), and the state files last.json and ticks.json (.arsenal is not in the walk, C7). The newest
// plans also stay in memory (parsing a large plan costs more than the filter). <out>/page.json says which request the plan.json on
// disk belongs to, so emit, read and tick never run on the plan of another choice. A mark, a tick and a mod edit move a stamp.
// A time choice (1d, 7d) is not made again by the clock alone: Reload (force) does that.
// IN-GAME ONLY (owner 2026-11-21): every plan is asked with --in-game, so it holds only rows done by a game run or by the player. Files
// are checked on Mods > Check & Fix; this page has no static step and no static route.
// JOBS: plan (when it must be made) runs as a bg job with cancel; the tool's child process belongs to the job.
// Author: Imperator_Aug (ARSENAL, ia-7e557e7f)
'use strict';
const fs = require('fs'), fsp = fs.promises, path = require('path'), crypto = require('crypto');
const LANG = require('./lang.json');
const games = require('../../../lib/games');

const VER = 1, SECTION = 'testplan.plan';
// for the tests: entry = the script that stands in for tools/testplan/testplan.js (path under tools/), dataRoot = the GUI data dir
const T = { entry: process.env.ARSENAL_TESTPLAN_ENTRY || 'testplan/testplan.js', dataRoot: process.env.ARSENAL_TESTPLAN_DATA || '', builds: 0, calls: 0 };
const LONG_MS = 30 * 60000, MAX_OUT = 400 << 20, FILES_MAX = 300, LIST_MAX = 400, INDEX_MAX = 1000, ROW_DEF = 200, ROW_MAX = 500;

const bad = (msg, key, params, status = 400) => Object.assign(new Error(msg), { status, key, params: params || {} });
const sha1 = s => crypto.createHash('sha1').update(String(s)).digest('hex');
const low = p => path.resolve(String(p)).replace(/\\/g, '/').toLowerCase();
const lines = s => String(s || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean).slice(0, 3).join(' ').slice(0, 400);

// ---------- game, mod, state dir ----------
function gameOf(ctx) {
  const id = games.idOf((ctx && ctx.gameId && ctx.gameId()) || 'as64') || 'as64', kind = games.kindOf(id) || 'as2';
  let dir = null;
  try { dir = kind === 'goh' ? (ctx.curDir ? ctx.curDir() : ctx.gohDir && ctx.gohDir()) : (ctx.game && ctx.game()); } catch (e) { /* none */ }
  return { id, kind, exe: games.exeOf(id) || 'as64', dir: dir ? path.resolve(dir) : null };
}
// what the game can run (README lib/stack.js canRun), for the page before a plan exists
const CAN = { as64: { edrun: 'run', prove: 'run', sweep: 'plan' }, mowas2: { edrun: 'dry', prove: 'plan', sweep: 'plan' }, goh: { edrun: 'no', prove: 'score', sweep: 'plan' } };
async function modOf(p, g, need) {
  if (typeof p !== 'string' || !p.trim()) { if (need) throw bad('Pick your mod folder first.', 'testplan.e.nomod'); return ''; }
  const abs = path.resolve(p.trim());
  let st = null; try { st = await fsp.stat(abs); } catch (e) { /* missing */ }
  if (!st || !st.isDirectory()) throw bad('The mod folder was not found: ' + abs, 'testplan.e.nofolder', { p: abs });
  if (g.dir) {
    const r = path.relative(g.dir, abs).replace(/\\/g, '/').toLowerCase();
    if (r === '' || (!r.startsWith('..') && !path.isAbsolute(r) && !/^mods\/[^/]+$/.test(r))) throw bad('That folder is the game itself, not a mod.', 'testplan.e.ingame', { p: abs });
  }
  return abs;
}
function dataRoot() { return T.dataRoot || path.join(path.dirname(require('../../settings').defaultFile()), 'testplan'); }
// {dir, own, why}: own = inside the mod. No mod (the pair picker with game units only): a folder per game in the data dir.
// A read (plan, read, state, status, pairs) never makes <mod>/.arsenal: it uses the in-mod state when it is there already, else
// the data dir. A write (o.write: emit, tick, mark, checklist, pairs save) makes the in-mod one only when the data dir has none
// for this mod yet, so a mod keeps one state dir.
const isDir = d => { try { return fs.statSync(d).isDirectory(); } catch (e) { return false; } };
function stateOf(g, mod, o = {}) {
  if (!mod) return { dir: path.join(dataRoot(), 'nomod-' + g.id), own: false, why: '' };
  const own = path.join(mod, '.arsenal', 'testplan'), ext = path.join(dataRoot(), sha1(low(mod)).slice(0, 16));
  let why = null;
  try { why = require('../../../lib/writeguard').refuseWrite(own, { game: g.dir || undefined, purpose: 'keep the test plan' }); } catch (e) { why = String((e && e.message) || e); }
  if (why) return { dir: ext, own: false, why: String(why).replace(/^refused:\s*/, '') };
  // both there (an older ARSENAL, or the mod moved in and out of a game folder): the newer one is used, read or write, and the page
  // says which (both, other); the older one is left as it was. Nothing is made or copied by this choice.
  if (isDir(own) && isDir(ext)) {
    const useOwn = newest(own) >= newest(ext);
    return { dir: useOwn ? own : ext, own: useOwn, why: '', both: true, other: useOwn ? ext : own };
  }
  if (isDir(own) || (o.write && !isDir(ext))) return { dir: own, own: true, why: '' };
  return { dir: ext, own: false, why: '' };
}
// the last time a state dir was written: its files (snapshot, ticks, history, the plan of the last run) and the dir itself
function newest(d) {
  let t = 0;
  for (const f of [d, path.join(d, 'last.json'), path.join(d, 'ticks.json'), path.join(d, 'history.json'), path.join(d, 'run', 'plan.json')]) {
    try { t = Math.max(t, fs.statSync(f).mtimeMs); } catch (e) { /* not there */ }
  }
  return t;
}
const stateOut = st => Object.assign({ dir: st.dir, own: st.own, why: st.why }, st.both ? { both: true, other: st.other } : {});
const outOf = st => path.join(st.dir, 'run');
const stackArgs = (g, mod, st) => [mod].concat(g.dir ? ['--game', g.dir] : [], ['--exe', g.exe, '--state', st.dir, '--out', outOf(st)]);

const SINCE = /^(last|vanilla|all|git(:[A-Za-z0-9_.\/~^@{}-]{1,120})?|[0-9]{1,4}[hd]|[0-9]{4}-[0-9]{2}-[0-9]{2}(T[0-9:.]{1,12}Z?)?)$/;
// A mod never marked as tested has no snapshot, so 'since the last test' would compare the whole mod with the game (minutes on a
// large mod). Until the first mark that choice means the last week; the whole mod stays the choice 'all' the user picks.
const hasSnap = st => { try { return fs.statSync(path.join(st.dir, 'last.json')).isFile(); } catch (e) { return false; } };
const firstQ = st => (st && !hasSnap(st) ? { since: '7d', everything: false, first: true } : { since: 'last', everything: false });
function askOf(body, st) {
  const everything = !!(body && body.everything), since = everything ? 'all' : String((body && body.since) || 'last').trim();
  if (!SINCE.test(since)) throw bad('Unknown choice of changes: ' + since.slice(0, 60), 'testplan.e.since', { s: since.slice(0, 60) });
  if (!everything && since === 'last' && st) return firstQ(st);
  return { since, everything };
}
const sinceArgs = q => (q.everything ? ['--everything'] : ['--since', q.since]);

// ---------- the tool ----------
async function cli(ctx, args, o = {}) {
  T.calls++;
  const r = await ctx.runTool('testplan', T.entry, args.concat('--json'), { timeoutMs: o.timeoutMs || 600000, job: o.job, max: MAX_OUT });
  if (r.cancelled) throw bad('Stopped.', 'job.cancelled', {}, 499);
  if (r.timedOut) throw bad('The test plan tool took too long and was stopped.', 'testplan.e.timeout', {}, 504);
  let j = null; try { j = JSON.parse(r.stdout); } catch (e) { /* not JSON */ }
  if ((r.code === 0 || r.code === 1) && j && typeof j === 'object') return { j, code: r.code };
  if ((r.code === 0 || r.code === 1) && o.fileOk) return { j: null, code: r.code };   // output too large to read back: the caller reads plan.json
  const m = (j && typeof j === 'object' && (j.error || j.message)) || lines(r.stderr) || lines(r.stdout) || ('exit ' + r.code);
  throw bad(String(m), r.code === 2 ? 'testplan.e.usage' : 'testplan.e.tool', { m: String(m) }, r.code === 2 ? 400 : r.code === 3 ? 409 : 500);
}
const isPlan = p => !!p && typeof p === 'object' && Array.isArray(p.rows) && !!p.stack && typeof p.stack === 'object';
async function readJson(file) { try { return JSON.parse(await fsp.readFile(file, 'utf8')); } catch (e) { return null; } }
async function diskPlan(st) { const p = await readJson(path.join(outOf(st), 'plan.json')); return isPlan(p) ? p : null; }
async function fstamp(file) { try { const s = await fsp.stat(file); return s.size + ':' + Math.round(s.mtimeMs); } catch (e) { return ''; } }

// ---------- cache ----------
const MT = ctx => (ctx && ctx.modtree) || require('../../../lib/modtree');
const GV = ctx => (ctx && ctx.gameview) || require('../../../lib/gameview');
function storeOf(ctx) {
  if (ctx && ctx.cache) return ctx.cache;
  const CS = require('../../../lib/cachestore');
  return CS.open(ctx && ctx.tmpRoot ? { root: path.join(ctx.tmpRoot, 'cache', 'store') } : {});
}
const partsOf = (g, mod, q) => ({ game: g.dir ? low(g.dir) : '', gid: g.id, mod: low(mod), since: q.since, everything: q.everything });
async function stampsOf(ctx, g, mod, st) {
  const mt = MT(ctx), tree = await mt.ensure(mod), s = Object.assign({}, mt.stamps(tree, ['all']));
  let gs = ''; if (g.dir) { try { gs = String(GV(ctx).stamp({ gameDir: g.dir, gid: g.id }) || ''); } catch (e) { gs = ''; } }
  s.game = gs;
  s.snap = await fstamp(path.join(st.dir, 'last.json'));
  s.ticks = await fstamp(path.join(st.dir, 'ticks.json'));
  return s;
}
// the newest plans, parsed (3 at most): key = parts, value {sj: stamps, plan}
const MEM = new Map(), FLIGHT = new Map();
function remember(k, sj, plan) { MEM.delete(k); MEM.set(k, { sj, plan }); while (MEM.size > 3) MEM.delete(MEM.keys().next().value); }
const markerFile = st => path.join(outOf(st), 'page.json');
async function markerIs(st, sig) { const m = await readJson(markerFile(st)); return !!m && m.sig === sig; }
async function markerPut(st, sig) { try { await fsp.mkdir(outOf(st), { recursive: true }); await fsp.writeFile(markerFile(st), JSON.stringify({ v: 1, sig }) + '\n'); } catch (e) { /* the next verb makes the plan again */ } }

// the whole plan of one request. o.cached: answer null instead of starting the tool. o.force: make it again. o.job: the bg job
async function planFull(ctx, g, mod, st, q, o = {}) {
  const parts = partsOf(g, mod, q), k = JSON.stringify(parts), stamps = await stampsOf(ctx, g, mod, st), sj = JSON.stringify(stamps), sig = sha1(k + sj);
  const onDisk = await markerIs(st, sig), store = storeOf(ctx);
  if (!o.force && onDisk) {
    const m = MEM.get(k);
    if (m && m.sj === sj) return m.plan;
    const hit = store.get(SECTION, VER, parts, stamps);
    if (hit && isPlan(hit.value)) { remember(k, sj, hit.value); return hit.value; }
  }
  if (o.cached) return null;
  if (FLIGHT.has(sig) && !o.force) return FLIGHT.get(sig);
  const make = async () => {
    T.builds++;
    const r = await cli(ctx, ['plan'].concat(stackArgs(g, mod, st), sinceArgs(q), ['--in-game']), { job: o.job, timeoutMs: LONG_MS, fileOk: true });
    const plan = isPlan(r.j) ? r.j : await diskPlan(st);
    if (!plan) throw bad('The test plan tool gave no plan.', 'testplan.e.noplan', {}, 500);
    return plan;
  };
  // the plan.json on disk is of another request (or none): the tool runs whatever the store holds, so the later verbs find their plan
  const p = (async () => {
    let plan;
    if (o.force || !onDisk) { plan = await make(); store.put(SECTION, VER, parts, stamps, plan); }
    else plan = await store.wrap(SECTION, VER, parts, stamps, make);
    await markerPut(st, sig); remember(k, sj, plan);
    return plan;
  })();
  FLIGHT.set(sig, p);
  try { return await p; } finally { if (FLIGHT.get(sig) === p) FLIGHT.delete(sig); }
}
// after a verb changed the plan (statuses, emitted, ticks): the same identity under the stamps of now
async function commit(ctx, g, mod, st, q, plan) {
  const parts = partsOf(g, mod, q), stamps = await stampsOf(ctx, g, mod, st), sj = JSON.stringify(stamps), k = JSON.stringify(parts);
  storeOf(ctx).put(SECTION, VER, parts, stamps, plan);
  await markerPut(st, sha1(k + sj)); remember(k, sj, plan);
  return plan;
}

// ---------- plan arithmetic ----------
const OPEN = new Set(['todo', 'unproven', 'void', 'held']);
function recount(plan) {
  const s = plan.summary && typeof plan.summary === 'object' ? plan.summary : (plan.summary = {}), byStatus = {}, byHow = { run: 0, player: 0 };
  for (const r of plan.rows) { byStatus[r.status || 'todo'] = (byStatus[r.status || 'todo'] || 0) + 1; byHow[r.how] = (byHow[r.how] || 0) + 1; }
  s.rows = plan.rows.length; s.byStatus = byStatus; s.byHow = byHow;
  return plan;
}
// row results {id, status, result} into the plan (a verb that printed results and no plan)
function applyRows(plan, list) {
  const by = new Map(plan.rows.map(r => [r.id, r]));
  for (const x of list || []) { const r = x && by.get(x.id); if (!r || !x.status) continue; r.status = x.status; if (x.result !== undefined) r.result = x.result; }
  return recount(plan);
}
// what a verb left: its own plan on stdout, else the plan.json it wrote (read saves it with the checklist made again),
// else its row results merged into ours
async function planAfter(j, st, prev) {
  if (isPlan(j)) return j;
  const d = await diskPlan(st);
  if (d) return d;
  return j && Array.isArray(j.rows) && prev ? applyRows(prev, j.rows) : prev;
}
function applyTick(plan, code, v, note) {
  let n = 0;
  for (const r of plan.rows) if (r.code === code) { r.status = v; r.result = Object.assign({}, r.result || {}, { tool: 'player', note: note || '' }); n++; }
  const cl = plan.checklist;
  if (cl && Array.isArray(cl.sessions)) for (const s of cl.sessions) for (const e of s.entries || []) if (e.code === code) { e.status = v; e.note = note || ''; n++; }
  recount(plan);
  return n;
}
const sumOf = plan => {
  const s = plan.summary || {}, bs = s.byStatus || {}, rows = s.rows != null ? s.rows : plan.rows.length;
  let open = 0; for (const k of Object.keys(bs)) if (OPEN.has(k)) open += bs[k];
  return { rows, byHow: s.byHow || {}, byStatus: bs, byCheck: s.byCheck || {}, items: s.items != null ? s.items : (plan.items || []).length, passed: bs.pass || 0, failed: bs.fail || 0, open };
};
function listCounts(plan) {
  const c = { entries: 0, pass: 0, fail: 0, skip: 0, open: 0 }, cl = plan.checklist;
  if (cl && Array.isArray(cl.sessions)) for (const s of cl.sessions) for (const e of s.entries || []) { c.entries++; if (e.status === 'pass' || e.status === 'fail' || e.status === 'skip') c[e.status]++; else c.open++; }
  return c;
}

// ---------- the view of a plan ----------
const AUX = new WeakMap();   // plan -> {items: Map, hay: [lower-case text per row], index}
function auxOf(plan) {
  let a = AUX.get(plan); if (a) return a;
  const items = new Map((plan.items || []).map(i => [i.id, i])), hay = new Array(plan.rows.length), seen = new Set(), index = [];
  const add = (label, value, hint) => { const k = value.toLowerCase(); if (!value || seen.has(k) || index.length >= INDEX_MAX) return; seen.add(k); index.push({ label, value, hint }); };
  plan.rows.forEach((r, i) => {
    const it = items.get(r.item) || {}, t = r.target || {};
    hay[i] = [r.code, r.id, r.title, r.check, it.name, it.key, t.entity, t.weapon, t.ammo, t.card, t.army, t.file].filter(Boolean).join(' ').toLowerCase();
  });
  for (const c of new Set(plan.rows.map(r => r.check))) { const r = plan.rows.find(x => x.check === c); add(r.title ? r.title + ' (' + c + ')' : c, c, 'check'); }
  for (const i of plan.items || []) add(i.name && i.name !== i.key ? i.name + ' (' + i.key + ')' : String(i.key || i.id), String(i.key || i.id), String(i.kind || ''));
  for (const r of plan.rows) { const w = r.target && r.target.weapon; if (w) add(String(w), String(w), 'weapon'); }
  a = { items, hay, index }; AUX.set(plan, a); return a;
}
const relOf = (mod, f) => { const r = path.relative(mod, path.resolve(String(f))).replace(/\\/g, '/'); return r && !r.startsWith('..') && !path.isAbsolute(r) ? r : String(f).replace(/\\/g, '/'); };
function view(plan, st, q, body, mod) {
  body = body || {};
  const a = auxOf(plan), words = String(body.q || '').trim().toLowerCase().split(/\s+/).filter(Boolean), files = body.file ? [relOf(mod || '', String(body.file)).toLowerCase()] : [];
  const how = String(body.how || ''), status = String(body.status || ''), limit = Math.max(1, Math.min(ROW_MAX, Number(body.limit) || ROW_DEF));
  const fileHit = r => {
    const it = a.items.get(r.item) || {}, t = r.target || {}, c = [it.file, t.file].concat((it.why || []).map(w => w && w.rel)).filter(Boolean).map(x => String(x).replace(/\\/g, '/').toLowerCase());
    return files.every(f => c.some(x => x === f || x.endsWith('/' + f) || f.endsWith('/' + x)));
  };
  const groups = new Map(); let matched = 0;
  plan.rows.forEach((r, i) => {
    if (how && r.how !== how) return;
    if (status && !(status === 'open' ? OPEN.has(r.status || 'todo') : (r.status || 'todo') === status)) return;
    if (words.length && !words.every(w => a.hay[i].indexOf(w) >= 0)) return;
    if (files.length && !fileHit(r)) return;
    matched++; let gr = groups.get(r.item); if (!gr) groups.set(r.item, gr = []); gr.push(r);
  });
  const rows = [];
  for (const gr of groups.values()) { for (const r of gr) { if (rows.length >= limit) break; rows.push(r); } if (rows.length >= limit) break; }
  const ch = plan.changes || {}, cf = Array.isArray(ch.files) ? ch.files : [];
  let left = LIST_MAX, more = 0; const cl = plan.checklist, sessions = [];
  if (cl && Array.isArray(cl.sessions)) for (const s of cl.sessions) {
    const es = s.entries || [], take = es.slice(0, Math.max(0, left)); left -= take.length; more += es.length - take.length;
    if (take.length) sessions.push({ id: s.id, n: s.n, of: s.of, title: s.title, titleKey: s.titleKey || '', titleArgs: s.titleArgs || {}, setup: s.setup || [], setupKeys: s.setupKeys || [], entries: take, total: es.length });
  }
  return {
    pending: false, v: plan.v, made: plan.made, since: q.since, everything: q.everything, first: !!q.first,
    stack: plan.stack ? { gid: plan.stack.gid, exe: plan.stack.exe, name: plan.stack.name, folder: plan.stack.folder, canRun: plan.stack.canRun, why: plan.stack.why } : null,
    changes: { since: ch.since, base: ch.base || null, counts: ch.counts || {}, notes: ch.notes || [], files: cf.slice(0, FILES_MAX).map(f => ({ rel: f.rel, state: f.state, area: f.area })), filesTotal: cf.length },
    summary: sumOf(plan), notes: plan.notes || [], unmapped: (plan.unmapped || []).length, state: stateOut(st),
    rows: rows.map(r => {
      const it = a.items.get(r.item) || {}, res = r.result && typeof r.result === 'object' ? Object.assign({}, r.result, { findings: (r.result.findings || []).slice(0, 20), findingsTotal: (r.result.findings || []).length }) : r.result || null;
      return { id: r.id, code: r.code, item: r.item, name: it.name || it.key || r.item, kind: it.kind || '', check: r.check, how: r.how, runner: r.runner || '', title: r.title || r.check,
        status: r.status || 'todo', target: r.target || {}, expect: r.expect || '', why: r.why || '', limits: r.limits || [], result: res };
    }),
    rowsTotal: plan.rows.length, rowsMatched: matched, index: a.index,
    checklist: cl ? { sessions, counts: listCounts(plan), more } : null, emitted: plan.emitted ? { out: plan.emitted.out, commands: (plan.emitted.commands || []).length } : null,
  };
}

// ---------- background runs: one per state dir ----------
const RUNS = new Map();   // state dir -> {verb, job, t0, state, error, key, ended, done}
function startBg(ctx, st, g, verb, fn) {
  const k = low(st.dir), cur = RUNS.get(k);
  if (cur && !cur.ended) return { started: false, run: cur };
  const noJob = { cancelled: false, set() {}, end() {} };
  const h = ctx.jobs && typeof ctx.jobs.add === 'function' ? ctx.jobs.add({ kind: 'bg', what: 'testplan.job.' + verb, page: 'testplan', game: g.id, canCancel: true, cancel: () => {} }) : noJob;
  const run = { verb, job: h, t0: Date.now(), state: '', error: '', key: '', ended: 0, done: null };
  run.done = Promise.resolve().then(() => fn(h)).then(
    () => (h.cancelled ? 'cancelled' : 'done'),
    e => { if (h.cancelled || (e && e.status === 499)) return 'cancelled'; run.error = String((e && e.message) || e); run.key = (e && e.key) || ''; run.params = (e && e.params) || {}; return 'failed'; }
  ).then(s => { run.state = s; run.ended = Date.now(); h.end(s); return s; });
  RUNS.delete(k); RUNS.set(k, run);
  for (const [x, r] of RUNS) { if (RUNS.size <= 8) break; if (r.ended) RUNS.delete(x); }
  return { started: true, run };
}
const runOf = st => RUNS.get(low(st.dir)) || null;
function failOf(run) { return bad(run.error || 'The run failed.', run.key || 'testplan.e.tool', run.key ? run.params : { m: run.error }, 500); }

// ---------- routes ----------
async function open(ctx, body, need = true, write = false) {
  const g = gameOf(ctx), mod = await modOf(body && body.mod, g, need), st = stateOf(g, mod, { write });
  return { g, mod, st };
}
async function planRoute(url, body, ctx) {
  body = body || {};
  const { g, mod, st } = await open(ctx, body), q = askOf(body, st);
  const busy = runOf(st);
  if (busy && !busy.ended) { if (!body.wait) return { pending: true, running: busy.verb }; await busy.done; }
  let plan = await planFull(ctx, g, mod, st, q, { cached: true, force: !!body.force });
  if (body.force) plan = null;
  if (!plan) {
    const s = startBg(ctx, st, g, 'plan', h => { h.set({ stage: 'testplan.stage.plan' }); return planFull(ctx, g, mod, st, q, { job: h, force: !!body.force }); });
    if (!body.wait) return { pending: true, running: s.run.verb };
    const end = await s.run.done;
    if (end === 'cancelled') throw bad('Stopped.', 'job.cancelled', {}, 499);
    if (end === 'failed') throw failOf(s.run);
    plan = await planFull(ctx, g, mod, st, q, {});
  }
  const v = view(plan, st, q, body, mod);
  v.lastMark = await lastMark(st);
  return v;
}
async function statusRoute(url, body, ctx) {
  const { st } = await open(ctx, { mod: url.searchParams.get('mod') }), r = runOf(st);
  if (!r) return { running: false, verb: '', secs: 0, stage: '', done: null, total: null, state: '', error: '', key: '' };
  const j = r.job || {};
  return { running: !r.ended, verb: r.verb, secs: Math.round(((r.ended || Date.now()) - r.t0) / 1000), stage: j.stage || '', done: j.done == null ? null : j.done, total: j.total == null ? null : j.total,
    state: r.state, error: r.error, key: r.key };
}
// a tool command line (argv for node, relative to tools/) -> the input of the contract command of that runner; a flag the contract
// does not know leaves partial:true (the page then shows the line as text only)
function inputOf(runner, argv) {
  const c = require('../../contract').COMMANDS[runner];
  if (!c || !Array.isArray(argv)) return null;
  const by = new Map(c.fields.map(f => [f.flag, f])), input = {}; let partial = false;
  const a = argv.slice(/\.js$/i.test(String(argv[0] || '')) ? 1 : 0);
  for (let i = 0; i < a.length; i++) {
    const f = by.get(a[i]);
    if (!f) { partial = true; continue; }
    if (f.type === 'bool') { input[f.name] = true; continue; }
    const v = a[++i]; if (v == null) { partial = true; break; }
    input[f.name] = f.type === 'int' ? Number(v) : f.type === 'list' ? String(v).split(',').filter(Boolean) : f.type === 'repeat' ? (input[f.name] || []).concat(String(v)) : String(v);
  }
  return { input, partial };
}
const quote = s => (/^[A-Za-z0-9_.,:=\/\\+-]+$/.test(s) ? s : '"' + String(s).replace(/"/g, '\\"') + '"');
async function emitRoute(url, body, ctx) {
  body = body || {};
  const { g, mod, st } = await open(ctx, body, true, true), q = askOf(body, st);
  if (ctx && ctx.job) ctx.job.writes = true;
  const plan = await planFull(ctx, g, mod, st, q, {});
  const r = await cli(ctx, ['emit'].concat(stackArgs(g, mod, st), sinceArgs(q)), { timeoutMs: LONG_MS });
  const em = r.j && Array.isArray(r.j.commands) ? r.j : (r.j && r.j.emitted) || ((await diskPlan(st)) || {}).emitted;
  if (!em || !Array.isArray(em.commands)) throw bad('The test plan tool gave no commands.', 'testplan.e.noemit', {}, 500);
  const next = isPlan(r.j) ? r.j : plan; next.emitted = em;
  await commit(ctx, g, mod, st, q, next);
  const commands = em.commands.map(c => {
    const m = c.runner === 'edrun' || c.runner === 'prove' ? inputOf(c.runner, c.argv) : null;
    return { id: c.id, how: c.how, runner: c.runner, cmd: c.cmd || (Array.isArray(c.argv) ? 'node ' + c.argv.map(x => quote(String(x))).join(' ') : ''), argv: c.argv || [], dry: !!c.dry, needsLaunch: !!c.needsLaunch,
      rows: Array.isArray(c.rows) ? c.rows.length : 0, input: m ? m.input : null, partial: m ? m.partial : true };
  });
  commands.sort((x, y) => (x.needsLaunch ? 1 : 0) - (y.needsLaunch ? 1 : 0));   // dry runs and plans first
  return { out: em.out || outOf(st), files: (em.files || []).map(f => ({ path: f.path, kind: f.kind, rows: Array.isArray(f.rows) ? f.rows.length : 0 })), commands, notes: em.notes || [],
    canRun: (plan.stack && plan.stack.canRun) || CAN[g.id], why: (plan.stack && plan.stack.why) || {} };
}
async function readRoute(url, body, ctx) {
  body = body || {};
  const { g, mod, st } = await open(ctx, body), q = askOf(body, st);
  const plan = await planFull(ctx, g, mod, st, q, {});
  const dirs = Array.isArray(body.dirs) ? body.dirs.map(String).filter(Boolean) : [];
  if (dirs.some(d => /,/.test(d))) throw bad('A result folder name holds a comma.', 'testplan.e.dirs');
  const r = await cli(ctx, ['read'].concat(stackArgs(g, mod, st), sinceArgs(q), dirs.length ? ['--dirs', dirs.join(',')] : []), { timeoutMs: LONG_MS, fileOk: true });
  await commit(ctx, g, mod, st, q, await planAfter(r.j, st, plan));
  return planRoute(url, Object.assign({}, body, { force: false, wait: true }), ctx);
}
async function tickRoute(url, body, ctx) {
  body = body || {};
  const code = String(body.code || ''), v = String(body.v || ''), note = String(body.note == null ? '' : body.note).replace(/[\r\n\t]+/g, ' ').trim().slice(0, 500);
  if (!/^T-[A-Za-z0-9]{3,10}$/.test(code)) throw bad('That is not a test code.', 'testplan.e.code');
  if (!['pass', 'fail', 'skip'].includes(v)) throw bad('A tick is pass, fail or skip.', 'testplan.e.tick');
  const { g, mod, st } = await open(ctx, body, true, true), q = askOf(body, st);
  if (ctx && ctx.job) ctx.job.writes = true;
  const plan = await planFull(ctx, g, mod, st, q, {});
  const r = await cli(ctx, ['tick', mod, code, v].concat(stackArgs(g, mod, st).slice(1), note ? ['--note', note] : []), {});
  const next = isPlan(r.j) ? r.j : plan;
  applyTick(next, code, v, note);
  await commit(ctx, g, mod, st, q, next);
  return { ok: true, code, v, note, summary: sumOf(next), counts: listCounts(next) };
}
async function markRoute(url, body, ctx) {
  body = body || {};
  const { g, mod, st } = await open(ctx, body, true, true);
  if (ctx && ctx.job) ctx.job.writes = true;
  const r = await cli(ctx, ['mark'].concat(stackArgs(g, mod, st)), { timeoutMs: LONG_MS });
  for (const k of [...MEM.keys()]) { try { if (JSON.parse(k).mod === low(mod)) MEM.delete(k); } catch (e) { MEM.delete(k); } }
  return { ok: true, mark: (r.j && r.j.mark) || r.j || (await lastMark(st)) };
}
async function checklistRoute(url, body, ctx) {
  body = body || {};
  const { g, mod, st } = await open(ctx, body, true, true), q = askOf(body, st);
  if (ctx && ctx.job) ctx.job.writes = true;
  await planFull(ctx, g, mod, st, q, {});
  const file = path.join(st.dir, 'checklist.md');
  const r = await cli(ctx, ['checklist'].concat(stackArgs(g, mod, st), sinceArgs(q), ['--md', file]), {});
  let text = ''; try { text = await fsp.readFile(file, 'utf8'); } catch (e) { text = (r.j && typeof r.j.md === 'string' && r.j.md) || ''; }
  if (!text) throw bad('The list could not be written.', 'testplan.e.nolist', {}, 500);
  return { file, text: text.length > (2 << 20) ? text.slice(0, 2 << 20) : text };
}
async function lastMark(st) { const a = await readJson(path.join(st.dir, 'history.json')); return Array.isArray(a) && a.length ? a[a.length - 1] : null; }
async function stateRoute(url, body, ctx) {
  const { g, mod, st } = await open(ctx, { mod: url.searchParams.get('mod') });
  const hist = await readJson(path.join(st.dir, 'history.json')), tk = await readJson(path.join(st.dir, 'ticks.json')), ticks = { pass: 0, fail: 0, skip: 0 };
  if (tk && typeof tk === 'object') for (const k of Object.keys(tk)) { const v = tk[k] && tk[k].v; if (ticks[v] != null) ticks[v]++; }
  const marks = Array.isArray(hist) ? hist : [], r = runOf(st);
  return { mod, gid: g.id, state: stateOut(st), lastMark: marks.length ? marks[marks.length - 1] : null, marks: marks.length, ticks,
    canRun: CAN[g.id], needsGame: !g.dir, running: r && !r.ended ? r.verb : '' };
}

// ---------- pairs (the picker on the Test Run page) ----------
const NAME = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,59}$/;
const pairsOf = body => { const p = body && body.pairs; if (!Array.isArray(p) || !p.length || p.length > 400 || !p.every(x => x && typeof x === 'object' && !Array.isArray(x))) throw bad('Give a list of pairs.', 'testplan.e.pairs'); return p; };
const libDir = st => path.join(st.dir, 'pairs');
async function tmpPairs(ctx, pairs) {
  const d = path.join((ctx && ctx.tmpRoot) || path.join(dataRoot(), 'tmp'), 'testplan');
  await fsp.mkdir(d, { recursive: true });
  const f = path.join(d, 'pairs-' + process.pid + '-' + crypto.randomBytes(4).toString('hex') + '.json');
  await fsp.writeFile(f, JSON.stringify(pairs, null, 1) + '\n');
  return f;
}
const pairArgs = (g, mod, st, file) => (mod ? [mod] : []).concat(file ? [file] : [], g.dir ? ['--game', g.dir] : [], ['--exe', g.exe, '--state', st.dir]);
async function suggestRoute(url, body, ctx) {
  body = body || {};
  const shooter = String(body.shooter || '').trim(), foe = String(body.foe || '').trim(), cls = String(body.cls || '').trim();
  if (!/^[A-Za-z0-9_.\/-]{1,120}$/.test(shooter)) throw bad('Name the shooter first.', 'testplan.e.shooter');
  if (foe && !/^[A-Za-z0-9_.\/-]{1,120}$/.test(foe)) throw bad('That foe name cannot be used.', 'testplan.e.foe');
  const { g, mod, st } = await open(ctx, body, false);
  const r = await cli(ctx, ['pairs', 'suggest'].concat(pairArgs(g, mod, st), ['--shooter', shooter], foe ? ['--foe', foe] : [], /^[a-z]{1,12}$/.test(cls) ? ['--cls', cls] : []), {});
  return { pair: (r.j && r.j.pair) || r.j };
}
const listOf = j => (Array.isArray(j) ? j : (j && (j.results || j.pairs || j.ids)) || []);
async function checkRoute(url, body, ctx) {
  body = body || {};
  const pairs = pairsOf(body), { g, mod, st } = await open(ctx, body, false), f = await tmpPairs(ctx, pairs);
  try { const r = await cli(ctx, ['pairs', 'check'].concat(pairArgs(g, mod, st, f)), { timeoutMs: LONG_MS }); const l = listOf(r.j); return { results: l, pairs: l }; }
  finally { fsp.unlink(f).catch(() => {}); }
}
// ids for a pair list (pairs id <file>); a tool that cannot give them leaves the pairs as they came
async function withIds(ctx, pairs, file) {
  try {
    const r = await cli(ctx, ['pairs', 'id', file], {}), l = listOf(r.j);
    return pairs.map((p, i) => { const x = l[i], id = typeof x === 'string' ? x : x && x.id; return id ? Object.assign({}, p, { id: String(id) }) : p; });
  } catch (e) { return pairs; }
}
async function libGet(url, body, ctx) {
  const { st } = await open(ctx, { mod: url.searchParams.get('mod') }, false), name = url.searchParams.get('name'), dir = libDir(st);
  if (name) {
    if (!NAME.test(name)) throw bad('That name cannot be used.', 'testplan.e.name');
    const file = path.join(dir, name + '.json'), j = await readJson(file), pairs = Array.isArray(j) ? j : j && Array.isArray(j.pairs) ? j.pairs : null;
    if (!pairs) throw bad('No such pair list: ' + name, 'testplan.e.nolib', { name }, 404);
    return { name, file, path: file, pairs };
  }
  let es = []; try { es = await fsp.readdir(dir, { withFileTypes: true }); } catch (e) { /* none yet */ }
  const names = [];
  for (const e of es.slice(0, 500)) {
    const m = e.isFile() && /^(.+)\.json$/i.exec(e.name); if (!m || !NAME.test(m[1])) continue;
    const f = path.join(dir, e.name), j = await readJson(f); let mt = 0; try { mt = Math.round((await fsp.stat(f)).mtimeMs); } catch (x) { /* gone */ }
    names.push({ name: m[1], path: f, pairs: Array.isArray(j) ? j.length : j && Array.isArray(j.pairs) ? j.pairs.length : 0, mtimeMs: mt });
  }
  names.sort((a, b) => b.mtimeMs - a.mtimeMs || (a.name < b.name ? -1 : 1));
  names.forEach(n => { n.count = n.pairs; });
  return { dir, names, files: names };
}
async function libPost(url, body, ctx) {
  body = body || {};
  const name = String(body.name || ''), op = body.op || (body.remove ? 'remove' : 'save');
  if (!NAME.test(name)) throw bad('That name cannot be used. Letters, digits, - and _ are safe.', 'testplan.e.name');
  const { st } = await open(ctx, body, false, op === 'save'), dir = libDir(st), file = path.join(dir, name + '.json');
  if (ctx && ctx.job) ctx.job.writes = true;
  if (op === 'remove') { let removed = true; try { await fsp.unlink(file); } catch (e) { removed = false; } return { ok: true, name, removed }; }
  if (op === 'get') {
    const j = await readJson(file), got = Array.isArray(j) ? j : j && Array.isArray(j.pairs) ? j.pairs : null;
    if (!got) throw bad('No such pair list: ' + name, 'testplan.e.nolib', { name }, 404);
    return { name, file, path: file, pairs: got };
  }
  if (op !== 'save') throw bad('Unknown action.', 'testplan.e.op');
  let pairs = pairsOf(body);
  await fsp.mkdir(dir, { recursive: true });
  const tmp = file + '.' + process.pid + '.tmp';
  await fsp.writeFile(tmp, JSON.stringify(pairs, null, 1) + '\n');
  const ided = await withIds(ctx, pairs, tmp);
  if (ided !== pairs) { pairs = ided; await fsp.writeFile(tmp, JSON.stringify(pairs, null, 1) + '\n'); }
  await fsp.rename(tmp, file);
  return { ok: true, name, file, path: file, pairs };
}
async function describeRoute(url, body, ctx) {
  body = body || {};
  const pairs = pairsOf(body), { g, mod, st } = await open(ctx, body, false), f = await tmpPairs(ctx, pairs);
  try {
    const r = await cli(ctx, ['pairs', 'describe'].concat(pairArgs(g, mod, st, f)), {}), l = listOf(r.j);
    if (l.length === pairs.length && l.every(x => x && typeof x === 'object' && x.text)) return { pairs: l, local: false };
  } catch (e) { if (e && (e.status === 499 || e.status === 504)) throw e; /* no such verb: the plain form below */ }
  finally { fsp.unlink(f).catch(() => {}); }
  const side = id => ({ id: String(id || ''), name: String(id || ''), army: '', cls: '' });
  return { local: true, pairs: pairs.map(p => {
    const sh = String(p.shooter || ''), foe = String(p.foe || ''), dist = p.dist == null ? null : Number(p.dist);
    return { id: p.id || '', name: p.name || '', text: sh + (foe ? ' fires at ' + foe : '') + (dist ? ' from ' + Math.round(dist / 20 * 10) / 10 + ' m' : ''), shooter: side(sh), foe: side(foe), dist, flags: Object.keys(p).filter(k => p[k] === true) };
  }) };
}

// ---------- Prepare: the plan of the default choice (since the last test) ----------
const PREP = [{
  id: 'testplan.plan', title: 'testplan.prep.plan', needs: ['mod.tree'], areas: ['all'],
  async state(ctx, q) {
    const c = prepCtx(ctx, q), g = gameOf(c), mod = q && q.mod;
    if (!mod) return { state: 'na', why: [] };
    const st = stateOf(g, path.resolve(mod)), tree = MT(c).last(mod);
    if (!tree) return { state: 'none', why: [] };
    const s = Object.assign({}, MT(c).stamps(tree, ['all']));
    try { s.game = g.dir ? String(GV(c).stamp({ gameDir: g.dir, gid: g.id }) || '') : ''; } catch (e) { s.game = ''; }
    s.snap = await fstamp(path.join(st.dir, 'last.json')); s.ticks = await fstamp(path.join(st.dir, 'ticks.json'));
    return storeOf(c).state(SECTION, VER, partsOf(g, path.resolve(mod), firstQ(st)), s);
  },
  async run(ctx, q, job) {
    const c = prepCtx(ctx, q), g = gameOf(c), mod = await modOf(q && q.mod, g, true), st = stateOf(g, mod);
    if (job && job.set) job.set({ stage: 'testplan.stage.plan', done: 0, total: 1 });
    const plan = await planFull(c, g, mod, st, firstQ(st), { job });
    if (job && job.set) job.set({ done: 1, total: 1 });
    return { rows: plan.rows.length };
  },
}];
function prepCtx(ctx, q) {
  const g = (q && q.game) || {}, c = Object.create(ctx || null);
  if (g.id) c.gameId = () => g.id;
  if (g.dir) { c.game = () => g.dir; c.curDir = () => g.dir; if (games.kindOf(games.idOf(g.id) || 'as64') === 'goh') c.gohDir = () => g.dir; }
  return c;
}

module.exports = {
  id: 'testplan', nav: 'testplan.nav', adv: false,
  script: require('./client'),
  lang: LANG,
  commands: {},
  routes: {
    'POST /api/x/testplan/plan': planRoute,
    'GET /api/x/testplan/status': statusRoute,
    'POST /api/x/testplan/emit': emitRoute,
    'POST /api/x/testplan/read': readRoute,
    'POST /api/x/testplan/tick': tickRoute,
    'POST /api/x/testplan/mark': markRoute,
    'POST /api/x/testplan/checklist': checklistRoute,
    'GET /api/x/testplan/state': stateRoute,
    'POST /api/x/testplan/pairs/suggest': suggestRoute,
    'POST /api/x/testplan/pairs/check': checkRoute,
    'GET /api/x/testplan/pairs/lib': libGet,
    'POST /api/x/testplan/pairs/lib': libPost,
    'POST /api/x/testplan/pairs/describe': describeRoute,
  },
  prep: PREP,
  _t: { T, gameOf, stateOf, view, inputOf, applyTick, recount, CAN, forget() { MEM.clear(); RUNS.clear(); FLIGHT.clear(); }, settle: async () => { for (const r of [...RUNS.values()]) await r.done; } },
};

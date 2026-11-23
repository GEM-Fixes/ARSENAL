// Bots part botmatch (group F, Try it): "Try a bot match". The form picks a map (only modes that allow bots), the army of each team,
// difficulty, 1-3 bots and minutes; "Show plan" writes the generated scenario and runs `testrun --dry` (nothing starts); "Start" runs
// tools/testrun with that scenario through ctx.runTool, only when the server was started with --allow-launch, one match at a time, and
// never while a game is already running. The host joins and does nothing; the bots buy and fight; mp_userUnits is read every 60 s until the
// match ends or the minutes run out. The report says per bot: its army, what it bought in order (with the time it was first seen), what
// its list has that it never bought, Lua call failed (MIS-33) and Spawning Unit Not found (MIS-32) lines, and an early end with one side
// empty (TST-26). AS64 only: MoW:AS2 has no control pipe (TST-19), Gates of Hell neither, and no bot.data.lua (GHMIS-66).
// JOBS (gui README "JOBS"): the match is a 'bg' job (what job.w.botmatch {map}, page bots; done/total = whole minutes played of the
// minutes asked). The testrun child belongs to that job ({job: handle} in the runTool options), not to the start request, which ends
// when it has answered. The job list's Cancel and the card's Stop (POST stop) are the same registry cancel: it kills testrun's process
// tree, which holds the game testrun started. The status is then the plain state 'stopped': no report, no error; gameUp says whether a
// game is still seen running. Nothing has to be put back after a stop: testrun is run with --inst 1 and without --backup or a staged
// fixture, so it writes only instance 1's own options.set (seeded with the mod list at every start, also of a full run) and never the
// player's real profile, mod list or mod; the scenario file and the run folder stay in ARSENAL's temp folder. A stopped plan (testrun
// --dry) returns at once.
// Routes: GET form, GET maps, POST plan, POST start, POST stop, GET status. Refusals are codes (bots.botmatch.e.*, bots.botmatch.na.*) the page
// words in four languages; the shared lib's English refusals pass through recipes/errs libErr. The report carries the in-game unit names
// (names) and the army labels (labels) so the page can lead with plain sentences.
// Author: Imperator_Aug (ARSENAL, ia-21953424)
'use strict';
const fs = require('fs');
const path = require('path');
const games = require('../../../../../lib/games');
const platform = require('../../../../../lib/platform');
const ud = require('../../../../../lib/userdir');
const MAPS = require('../../../maps');
const BL = require('../../lib');
const { readiness } = require('../modeready')._t;
const L = require('./lib');

const { libErr } = require('../recipes/errs');
const bad = (msg, status, extra) => Object.assign(new Error(msg), { status: status || 400, key: String(msg).split(' ')[0] }, extra || {});
const arg = (url, body, k) => (body && body[k] != null ? String(body[k]) : (url && url.searchParams && url.searchParams.get(k)) || '');
const GAME_EXE = /^(as64|as64_ed|mowas_2|mowas_2_ed|call_to_arms|call_to_arms_ed)\.exe$/i;
// not available: the code the page words (the reasons and IDs sit in its Details fold: GHMIS-66, TST-19)
const NA = { goh: 'bots.botmatch.na.goh', mowas2: 'bots.botmatch.na.mowas2' };
// test hooks: the process probe, the clock and the log folder of instance 1
const T = { running: () => platform.isRunning(GAME_EXE), now: () => Date.now(), logDir: g => ud.logDirFor(g.id === 'as64' ? null : g.id, 1) };
let JOB = null;   // {state: running|done|error|stopped, t0, plan, archive, logdir, report, error, stdout, h (job handle), reg (its registry), gameUp}
// JOBS: the server's registry (ctx.jobs); a ctx without it (tests) gets a private one, so the code is the same
const OWNJOBS = require('../../../../joblist').create({ keepMs: 0 });
const jobsOf = ctx => (ctx && ctx.jobs && typeof ctx.jobs.add === 'function' ? ctx.jobs : OWNJOBS);
const gidOf = ctx => { try { return typeof ctx.gameId === 'function' ? ctx.gameId() : 'as64'; } catch (e) { return 'as64'; } };

function gameOf(ctx) {
  const g = BL.gameOf(ctx);
  return Object.assign(g, { na: NA[g.kind === 'goh' ? 'goh' : g.id] || null });
}
// bot lists of the effective mod: {army: [unit]} and the army labels; null when there is no list (the form still works)
function listsOf(ctx, mod) {
  try { const b = BL.buys(ctx, mod || null); return { lists: L.listsOf(b.stages), labels: b.labels || {} }; } catch (e) { return { lists: null, labels: {}, why: e.message }; }
}
const modeRows = (ctx, mod) => { try { return readiness(ctx, mod).rows; } catch (e) { return []; } };
const bestMode = (ctx, mod) => { try { return require('../modeready')._t.botModes(ctx, mod).best; } catch (e) { return null; } };
// helper unit files are no army (S17: x, xnotanks); the frame's list wins when it has one
function isArmy(a) {
  try { if (typeof BL.isArmy === 'function') return !!BL.isArmy(a); } catch (e) { /* own list */ }
  return !(Array.isArray(BL.PSEUDO_ARMIES) ? BL.PSEUDO_ARMIES : ['x', 'xnotanks']).map(x => String(x).toLowerCase()).includes(String(a || '').toLowerCase());
}
// the in-game army name: the frame's lobby names (lib.armyNames), its list labels, its stock names (lib.armyName), else the code
function armyLabels(ctx, mod, armies, labels) {
  let lobby = {}; try { lobby = typeof BL.armyNames === 'function' ? BL.armyNames(ctx, mod || null) || {} : {}; } catch (e) { lobby = {}; }
  const out = {};
  for (const a of armies) out[a] = lobby[a] || (labels && labels[a]) || (typeof BL.armyName === 'function' ? BL.armyName(a) : a) || a;
  return out;
}
// player seats a match needs: the host on team A plus the bots, hosted as a 2- or 4-player game (lib scenarioOf)
const seatsNeed = bots => (bots >= 2 ? 4 : 2);
// the seats of each map the last map list read (key -> players), so a plan is checked even when the page sends no count
const SEATS = new Map();
// the mods a listed map may come from: the game, the picked mod and the mods it requires (mod.info Require, buycheck/deps), by folder
// name and id; a map only another mod of the install has would not load with this mod, so it is not offered
const normId = x => String(x || '').toLowerCase().replace(/\s+/g, ' ').trim();
function modIds(ctx, mod) {
  const ids = new Set();
  if (!mod) return ids;
  ids.add(normId(path.basename(path.resolve(mod))));
  try { for (const d of require('../buycheck/deps').depsOf(ctx, mod).list || []) { if (d.dir) ids.add(normId(path.basename(d.dir))); if (d.id) ids.add(normId(d.id)); } } catch (e) { /* no deps */ }
  return ids;
}

async function formRoute(url, body, ctx) {
  const g = gameOf(ctx), mod = arg(url, body, 'mod');
  if (g.kind === 'goh') return { gid: g.id, kind: g.kind, na: g.na, launch: false };
  const ls = listsOf(ctx, mod), rows = modeRows(ctx, mod), armies = ls.lists ? Object.keys(ls.lists).filter(isArmy).sort() : [];
  // the game loads mods from <game>/mods only: said up front on the card (false = the mod sits elsewhere), not only after Preview
  let inGame = null;
  try { if (mod && g.dir) inGame = path.dirname(path.resolve(mod)).toLowerCase() === path.resolve(g.dir, 'mods').toLowerCase(); } catch (e) { inGame = null; }
  return { gid: g.id, kind: g.kind, na: g.na, inGame, launch: !!ctx.allowLaunch && !g.na, armies, labels: armyLabels(ctx, mod, armies, ls.labels), listWhy: ls.why || null,
    // the in-game mode names and the default (a mode bots join that has flags: modeready botmodes, page standard S16)
    modes: rows.map(r => ({ mode: r.mode, name: r.name || r.mode, bots: !!r.bots, orders: r.cls !== 'combat', armyMode: r.armyMode || null })), best: bestMode(ctx, mod),
    diffs: L.DIFFS, maxMin: L.MAX_MIN, job: jobView() };
}

// the Maps page's own list (a background job; state running until it has read every map), cut to modes that allow bots here and to the
// maps of the game, the picked mod and the mods it requires (other: how many maps of other mods were left out); off = maps that load
// but have no mode bots can play, so a typed name can be answered plainly
async function mapsRoute(url, body, ctx) {
  const g = gameOf(ctx);
  if (g.kind === 'goh') return { state: 'done', maps: [], na: g.na };
  const r = await MAPS.routes['GET /api/x/maps/list'](url, body, ctx);
  if (r.state !== 'done') return r;
  const mod = arg(url, body, 'mod'), ok = new Map(modeRows(ctx, mod).filter(x => x.bots).map(x => [x.mode, x.armyMode || null])), ids = modIds(ctx, mod);
  const maps = [], off = [];
  let other = 0;
  for (const m of r.maps || []) {
    const from = Array.isArray(m.mods) && m.mods.length ? m.mods : String(m.mod || '').split(',').map(x => x.trim()).filter(Boolean);
    if (from.some(x => !ids.has(normId(x)))) { other++; continue; }
    if (m.players) SEATS.set(m.key, m.players);
    const modes = (m.modes || []).filter(x => ok.has(x));
    if (modes.length) maps.push({ key: m.key, name: m.name || '', players: m.players || 0, mod: from.join(', '), modes, armyMode: Object.fromEntries(modes.map(x => [x, ok.get(x)])) });
    else off.push({ key: m.key, name: m.name || '' });
  }
  return { state: 'done', maps, off, other, all: (r.maps || []).length };
}

// the request checked and turned into a plan: {o (scenarioOf input), g, exe, modName}
function planOf(url, body, ctx) {
  body = body || {};
  const g = gameOf(ctx);
  if (g.kind === 'goh') throw bad(g.na, 400, { na: true });
  if (!g.dir) throw bad('bots.botmatch.e.nogame');
  const mod = arg(url, body, 'mod');
  if (!mod) throw bad('bots.botmatch.e.needmod');
  try { BL.checkMod(ctx, mod); } catch (e) { throw libErr('bots.botmatch', e); }
  const modDir = path.resolve(mod), mods = path.resolve(g.dir, 'mods');
  if (path.dirname(modDir).toLowerCase() !== mods.toLowerCase()) throw bad('bots.botmatch.e.notInGame');   // the game loads mods from <game>/mods only
  const mapKey = String(body.map || '').replace(/\\/g, '/').replace(/^map\//, '');
  if (!/^multi\/[A-Za-z0-9_.-]+$/.test(mapKey)) throw bad('bots.botmatch.e.map');
  const rows = modeRows(ctx, mod), mode = String(body.mode || ''), row = rows.find(r => r.mode === mode);
  if (!row) throw bad('bots.botmatch.e.mode');
  if (!row.bots) throw bad('bots.botmatch.e.noBots');
  const bots = +body.bots, minutes = +body.minutes, difficulty = String(body.difficulty || 'normal');
  if (![1, 2, 3].includes(bots)) throw bad('bots.botmatch.e.bots');
  if (!(minutes >= 1 && minutes <= L.MAX_MIN && Math.floor(minutes) === minutes)) throw bad('bots.botmatch.e.minutes');
  if (!L.DIFFS.includes(difficulty)) throw bad('bots.botmatch.e.diff');
  const ls = listsOf(ctx, mod), armyA = String(body.armyA || ''), armyB = String(body.armyB || '');
  for (const a of [armyA, armyB]) if (!/^[a-z0-9_]+$/i.test(a) || (ls.lists && !ls.lists[a])) throw bad('bots.botmatch.e.army');
  // the map's seats: the Maps list this server read, else the count the page sent; too few for the host and the bots is refused
  const players = SEATS.get('map/' + mapKey) || +body.players || 0, need = seatsNeed(bots);
  if (players && players < need) throw bad('bots.botmatch.e.small ' + JSON.stringify({ seats: players, need, fit: players >= 4 ? 3 : players >= 2 ? 1 : 0 }));
  const o = { name: String(body.name || '').slice(0, 80), map: mapKey, mode, bots, difficulty, armyA, armyB, armyMode: row.armyMode || null, minutes, mods: [path.basename(modDir)] };
  return { o, g, mod, exe: path.join(g.dir, games.get(g.id).file), lists: ls.lists, sc: L.scenarioOf(o) };
}
function writeScenario(ctx, sc) {
  const dir = path.join(ctx.tmpRoot || require('os').tmpdir(), 'botmatch');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'botmatch-' + T.now() + '.json');
  fs.writeFileSync(file, JSON.stringify(sc.scenario, null, 2));
  return { dir, file };
}
function logDirOf(g) { try { return T.logDir(g) || null; } catch (e) { return null; } }
function argsOf(p, file, archive, logdir, dry) {
  const a = ['--scenario', file, '--exe', p.exe, '--inst', '1', '--timeout', '300', '--connect-timeout', '90'];
  if (logdir) a.push('--logdir', logdir);
  if (archive) a.push('--archive', archive);
  if (dry) a.push('--dry');
  return a;
}

// Show plan: the scenario and testrun's own --dry plan (testrun stops before it starts anything)
async function planRoute(url, body, ctx) {
  const p = planOf(url, body, ctx), w = writeScenario(ctx, p.sc);
  const r = await ctx.runTool('testrun', 'testrun/testrun.js', argsOf(p, w.file, null, logDirOf(p.g), true), { timeoutMs: 60000 });
  if (r.cancelled || (ctx.job && ctx.job.cancelled)) return { ok: false, cancelled: true, file: w.file };   // stopped from the job list: nothing started, nothing more read
  return { ok: r.code === 0, scenario: p.sc.scenario, slots: p.sc.slots, pinned: p.sc.pinned, file: w.file, dry: String(r.stdout || '').slice(0, 8000), err: String(r.stderr || '').slice(0, 2000),
    na: p.g.na, launch: !!ctx.allowLaunch && !p.g.na };
}

function jobView() {
  if (!JOB) return { state: 'none' };
  return { state: JOB.state, elapsed: Math.round(((JOB.t1 || T.now()) - JOB.t0) / 1000), minutes: JOB.plan.minutes, map: JOB.plan.map, name: JOB.plan.name || '', mode: JOB.plan.mode, report: JOB.report || null, error: JOB.error || null,
    stopping: JOB.state === 'running' && !!(JOB.h && JOB.h.cancelled), gameUp: JOB.state === 'stopped' ? !!JOB.gameUp : undefined };
}
// the map as people read it in the job list: the game's name, else the folder with spaces
const mapSay = plan => plan.name || String(plan.map || '').split('/').pop().replace(/[_-]+/g, ' ').trim();
// newest run folder under the archive that holds a pipe.jsonl
function pipeOf(archive) {
  let best = null;
  try { for (const d of fs.readdirSync(archive)) { const f = path.join(archive, d, 'pipe.jsonl'); if (fs.existsSync(f) && (!best || d > best.d)) best = { d, f }; } } catch (e) { /* none */ }
  return best ? best.f : null;
}
// squad cards and their members from the units sets the game sees with this mod (stages/cards mount); null = unread (cards n/a)
function membersFor(ctx, mod) {
  try { const C = require('../stages/cards'), M = require('../buycheck/mount'); const V = M.view(ctx, mod, C.layersOf(ctx, mod).deps); return V.sets && V.sets.length ? L.membersOf(V.sets.map(f => f.text)) : null; } catch (e) { return null; }
}
// in-game names of every unit the report names (bought, never bought); empty when the mod has no .lng text for them
function namesFor(ctx, mod, rep) {
  const all = new Set();
  for (const b of rep.bots || []) { for (const x of b.bought || []) all.add(x.card); for (const u of b.never || []) all.add(u); }
  try { return BL.namesOf(ctx, mod, [...all]) || {}; } catch (e) { return {}; }
}
const readOr = (f, alt) => { try { return f ? fs.readFileSync(f, 'latin1') : alt; } catch (e) { return alt; } };

const warmed = fn => require('../stages/cards').route(fn);
async function startRoute(url, body, ctx) {
  const g = gameOf(ctx);
  if (g.na) throw bad(g.na, 400, { na: true });
  if (!ctx.allowLaunch) throw bad('bots.botmatch.e.launchOff', 403);
  if (JOB && JOB.state === 'running') throw bad('bots.botmatch.e.busy', 409);
  if (T.running() === true) throw bad('bots.botmatch.e.gameUp', 409);
  const p = planOf(url, body, ctx);
  if (!fs.existsSync(p.exe)) throw bad('bots.botmatch.e.noexe');
  const w = writeScenario(ctx, p.sc), archive = path.join(w.dir, 'run-' + T.now()), logdir = logDirOf(p.g);
  const plan = { name: p.o.name, map: p.o.map, mode: p.o.mode, bots: p.o.bots, minutes: p.o.minutes, pinned: p.sc.pinned, slots: p.sc.slots, armies: { a: p.o.armyA, b: p.o.armyB } };
  const job = JOB = { state: 'running', t0: T.now(), plan, archive, logdir, file: w.file };
  const timeoutMs = (p.o.minutes * 60 + 600) * 1000;   // load + minutes + quit, the scenario waits are the real limit
  // JOBS: the run outlives this request, so it is a background job of its own; its stop function only marks it (the registry kills the
  // child attached below), the run's own code ends the job on every path
  const reg = job.reg = jobsOf(ctx);
  const h = job.h = reg.add({ kind: 'bg', what: 'job.w.botmatch', whatP: { map: mapSay(plan) }, page: 'bots', game: gidOf(ctx), cancel() { job.stopAsked = true; } });
  const prog = () => h.set({ done: Math.min(plan.minutes, Math.floor((T.now() - job.t0) / 60000)), total: plan.minutes });
  prog(); const pt = setInterval(prog, 5000); if (pt.unref) pt.unref();
  const done = (async () => {
    let end = 'done';
    try {
      const r = await ctx.runTool('testrun', 'testrun/testrun.js', argsOf(p, w.file, archive, logdir, false), { timeoutMs, job: h });
      // stopped (job list Cancel or the card's Stop): testrun and the game it started were killed. A plain state, no report is read from
      // the half run, nothing is written. gameUp: a game is still seen running after the kill (the card then says to close it by hand)
      if (r.cancelled || h.cancelled || job.stopAsked) {
        job.stdout = String(r.stdout || '').slice(-20000);
        try { job.gameUp = T.running() === true; } catch (e) { job.gameUp = false; }
        job.state = 'stopped'; end = 'cancelled'; return;
      }
      if (r.timedOut) end = 'timeout';
      const pipeFile = pipeOf(archive);
      job.stdout = String(r.stdout || '').slice(-20000);
      try { await require('../stages/cards').warm(ctx, p.mod); } catch (e) { /* the readers go the old way */ }
      job.report = L.report({ pipe: readOr(pipeFile, ''), log: logdir ? readOr(path.join(logdir, 'game.log'), null) : null, stdout: r.stdout, plan, lists: p.lists, members: membersFor(ctx, p.mod) });
      job.report.names = namesFor(ctx, p.mod, job.report); job.report.labels = listsOf(ctx, p.mod).labels || {};
      job.report.code = r.code; job.report.timedOut = !!r.timedOut; job.report.pipe = !!pipeFile; job.report.archive = archive;
      job.state = 'done';
    } catch (e) { job.state = 'error'; job.error = String(e.message || e).slice(0, 300); end = 'failed'; }
    finally { clearInterval(pt); job.t1 = T.now(); h.end(end); }   // every path ends the job, or it is listed forever
  })();
  if (body && body._wait) await done;   // tests
  return { ok: true, started: true, file: w.file, archive, id: h.id, job: jobView() };
}
// the one stop: the registry's cancel of the match's job (what the job list's Cancel calls too). -> true when a running match was told to stop
function stopMatch() {
  const j = JOB;
  if (!j || j.state !== 'running' || !j.h || !j.reg) return false;
  return j.reg.cancel(j.h.id) === true;
}
async function stopRoute() { const asked = stopMatch(); return { ok: true, asked, job: jobView() }; }
async function statusRoute() { return jobView(); }

module.exports = {
  id: 'botmatch', group: 'F', order: 10,
  routes: {
    // SPEED: warmed = the shared mod scan waited for first (stages/cards warm): the bot lists and army names read the mounted view
    'GET /api/x/bots/botmatch/form': warmed(formRoute),
    'GET /api/x/bots/botmatch/maps': mapsRoute,
    'POST /api/x/bots/botmatch/plan': warmed(planRoute),
    'POST /api/x/bots/botmatch/start': warmed(startRoute),
    'POST /api/x/bots/botmatch/stop': stopRoute,
    'GET /api/x/bots/botmatch/status': statusRoute,
  },
  lang: require('./lang'),
  script: require('./client'),
  _t: { T, L, planOf, SEATS, isArmy, modIds, jobView, pipeOf, stopMatch, job: () => JOB, reset: () => { JOB = null; } },
};

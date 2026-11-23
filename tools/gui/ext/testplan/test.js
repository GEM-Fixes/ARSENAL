// GUI-EXT testplan test. Arg: scratch dir. No game, no network: the routes run against fake-tool.js (a stand-in for
// tools/testplan/testplan.js with the same verbs and JSON shapes), seeded game and mod folders in the scratch dir, all three game ids;
// then the whole page in the fake DOM (blkboot of ext/bots) with the views the routes gave. Prints "<n> passed, <m> failed".
// Author: Imperator_Aug (ARSENAL, ia-842123cb)
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(require('os').tmpdir(), 'testplan-')));
require('../../../lib/testscratch').guard(work);   // never wipe a shared root, the repo, a game or a mod
fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
delete process.env.ARSENAL_ADVANCED; delete process.env.FAKE_FAIL;
const LOG = path.join(work, 'calls.log'); process.env.FAKE_LOG = LOG;
const X = require('./index');
const TOOLS = path.join(__dirname, '..', '..', '..');
X._t.T.entry = 'gui/ext/testplan/fake-tool.js'; X._t.T.dataRoot = path.join(work, 'data');
let good = 0, bad = 0;
const ok = (c, m) => { if (c) good++; else { bad++; console.log('FAIL ' + m); } };

const put = (f, t) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t || ''); };
// seeded folders: an AS64 game, a MoW:AS2 game, a GoH install with a mod someone else made, and a mod of the player's own
const as64 = path.join(work, 'as64'), mow = path.join(work, 'mow'), goh = path.join(work, 'goh'), mod = path.join(work, 'my_mod'), gohMod = path.join(goh, 'mods', 'their_mod');
put(path.join(as64, 'as64.exe')); put(path.join(as64, 'resource', 'x.txt'), 'x');
put(path.join(mow, 'mowas_2.exe')); put(path.join(mow, 'resource', 'x.txt'), 'x');
put(path.join(goh, 'call_to_arms.exe')); put(path.join(goh, 'resource', 'x.txt'), 'x');
put(path.join(mod, 'mod.info'), '{mod}\r\n'); put(path.join(mod, 'resource', 'set', 'stuff', 'gun', 'kwk36'), '{x}\r\n');
put(path.join(gohMod, 'mod.info'), '{mod}\r\n');

const jobs = [];
const runTool = (tool, entry, args, o = {}) => new Promise(res => {
  cp.execFile(process.execPath, [path.join(TOOLS, entry)].concat(args), { encoding: 'utf8', maxBuffer: 64 << 20, timeout: o.timeoutMs || 60000, windowsHide: true },
    (e, stdout, stderr) => res({ code: e ? (typeof e.code === 'number' ? e.code : 2) : 0, stdout: stdout || '', stderr: stderr || '', timedOut: false, cancelled: false }));
});
const mk = (gid, dir) => ({ gameId: () => gid, game: () => dir, curDir: () => dir, gohDir: () => dir, tools: TOOLS, tmpRoot: path.join(work, 'tmp-' + gid), runTool,
  jobs: { add: o => { const h = Object.assign({ cancelled: false, set(x) { Object.assign(h, x); }, end(s) { h.ended = s; } }, o); jobs.push(h); return h; } } });
const U = q => ({ searchParams: new URLSearchParams(q) });
const R = X.routes, P = (name, body, ctx) => R['POST /api/x/testplan/' + name](U(''), body, ctx), G = (name, q, ctx) => R['GET /api/x/testplan/' + name](U(q), null, ctx);
const refused = async (fn, key, status, m) => { let e = null; try { await fn(); } catch (x) { e = x; } ok(e && e.key === key && (!status || e.status === status), m + (e ? ' (' + e.status + ' ' + e.key + ' ' + e.message + ')' : ' (not refused)')); return e; };
const calls = () => { try { return fs.readFileSync(LOG, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)); } catch (e) { return []; } };
const slots = v => (v.match(/\{\w+\}/g) || []).sort().join();

(async () => {
  // ---- contract: shape, script rules, strings
  ok(X.id === 'testplan' && X.nav === 'testplan.nav' && X.adv === false && typeof X.script === 'string', 'shape');
  ok(!/`|\$\{/.test(X.script) && /EXT_SCREENS\.testplan=function/.test(X.script) && !/innerHTML|insertAdjacentHTML|document\.write/.test(X.script), 'script rules');
  ok(/return \{refresh:sync,focus:/.test(X.script), 'script: the screen answers refresh and focus');
  try { new (require('vm').Script)(X.script); ok(true, 'script parses'); } catch (e) { ok(false, 'script parses: ' + e.message); }
  const EXT = require('..'); ok(EXT.some(x => x.id === 'testplan'), 'registered in ext/index.js');
  ok(Object.keys(R).length === 13 && Object.keys(R).every(k => /^(GET|POST) \/api\/x\/testplan\/[a-z/]+$/.test(k)), 'routes: 13, all under /api/x/testplan/');
  const en = X.lang.en, core = require('../../lang/en.json');
  for (const c of ['ru', 'uk', 'zh']) { const miss = Object.keys(en).filter(k => !X.lang[c][k]); ok(!miss.length, 'lang ' + c + ' has every key, missing: ' + miss.join()); }
  for (const c of ['ru', 'uk', 'zh']) { const d = Object.keys(en).filter(k => slots(en[k]) !== slots(X.lang[c][k] || '')); ok(!d.length, 'lang ' + c + ' same slots, differ: ' + d.join()); }
  for (const c of ['ru', 'uk', 'zh']) { const same = Object.keys(en).filter(k => X.lang[c][k] === en[k]); ok(same.length === 0, 'lang ' + c + ' is translated, same as en: ' + same.join()); }
  ok(en['testplan.nav'] === 'Test Plan', 'nav label');
  { const d = Object.keys(en).filter(k => /\s[-\u2013\u2014]\s/.test(en[k])); ok(!d.length, 'no dash as punctuation in the page texts: ' + d.join()); }
  { const miss = []; for (const m of X.script.matchAll(/\btx\('([a-zA-Z0-9_.]+)'/g)) if (!m[1].endsWith('.') && !en[m[1]] && !core[m[1]]) miss.push(m[1]); ok(!miss.length, 'every tx key is known: ' + miss.join()); }
  { // every key the routes send exists
    const src = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8'), miss = [...new Set([...src.matchAll(/'(testplan\.[a-z0-9.]+[a-z0-9])'/gi)].map(m => m[1]))].filter(k => k !== 'testplan.plan' && !en[k]);
    ok(!miss.length, 'every key of the routes is in the strings: ' + miss.join());
  }
  { // the checklist sentences mirror the tool's: same keys, same slots (when the tool is in the tree)
    let TEXT = null; try { TEXT = require('../../../testplan/lib/checklist').TEXT; } catch (e) { TEXT = null; }
    if (TEXT && typeof TEXT === 'object') {
      const miss = Object.keys(TEXT).filter(k => typeof TEXT[k] === 'string' && !/^md./.test(k) && !en['testplan.cl.' + k]), diff = Object.keys(TEXT).filter(k => typeof TEXT[k] === 'string' && en['testplan.cl.' + k] && slots(TEXT[k]) !== slots(en['testplan.cl.' + k]));
      ok(!miss.length, 'checklist keys of the tool have a string here, missing: ' + miss.join());
      ok(!diff.length, 'checklist strings carry the tool\'s slots, differ: ' + diff.join());
    }
  }

  // ---- state dir: inside a mod the page may write, in the data dir otherwise
  const A = mk('as64', as64), M = mk('mowas2', mow), H = mk('goh', goh);
  {
    const g = X._t.gameOf(A), s = X._t.stateOf(g, mod, { write: true }), r0 = X._t.stateOf(g, mod);
    ok(!r0.own && r0.dir.startsWith(path.join(work, 'data')) && !r0.why, 'state: a read never makes a state dir in the mod: ' + r0.dir);
    { const m2 = path.join(work, 'own-state-mod'); fs.mkdirSync(path.join(m2, '.arsenal', 'testplan'), { recursive: true }); const r2 = X._t.stateOf(g, m2); ok(r2.own && r2.dir === path.join(m2, '.arsenal', 'testplan'), 'state: a read uses an in-mod state that is there already'); }
    ok(g.id === 'as64' && g.exe === 'as64' && s.own && s.dir === path.join(mod, '.arsenal', 'testplan') && !s.why, 'state: a mod of your own keeps its plan inside (' + s.why + ')');
    const gg = X._t.gameOf(H), t = X._t.stateOf(gg, gohMod);
    ok(gg.id === 'goh' && gg.kind === 'goh' && !t.own && t.dir.startsWith(path.join(work, 'data')) && !!t.why && !/^refused:/.test(t.why), 'state: a GoH mod ARSENAL did not make keeps its plan in the data dir: ' + t.dir);
    ok(X._t.stateOf(gg, gohMod).dir === t.dir && X._t.stateOf(gg, path.join(goh, 'mods', 'other')).dir !== t.dir, 'state: one folder per mod, the same each time');
    process.env.ARSENAL_ADVANCED = '1'; const adv = X._t.stateOf(gg, gohMod, { write: true }); delete process.env.ARSENAL_ADVANCED;
    ok(adv.own, 'state: with Advanced on the GoH mod keeps its own (' + adv.why + ')');
    {   // both the in-mod state and the data-dir state there: the newer is used (read and write), the page is told which; nothing made
      const m3 = path.join(work, 'both-state-mod'); fs.mkdirSync(m3, { recursive: true });
      const ext = X._t.stateOf(g, m3).dir, own = path.join(m3, '.arsenal', 'testplan');
      fs.mkdirSync(ext, { recursive: true }); fs.mkdirSync(own, { recursive: true });
      fs.writeFileSync(path.join(own, 'ticks.json'), '{}'); fs.writeFileSync(path.join(ext, 'ticks.json'), '{}');
      const old = new Date(Date.now() - 3600e3), nw = new Date();
      for (const [d, tm] of [[own, old], [ext, nw]]) { fs.utimesSync(path.join(d, 'ticks.json'), tm, tm); fs.utimesSync(d, tm, tm); }
      const b1 = X._t.stateOf(g, m3), b1w = X._t.stateOf(g, m3, { write: true });
      ok(b1.both && !b1.own && b1.dir === ext && b1.other === own && b1w.dir === ext, 'state: both there, the data-dir one is newer: it is used and the in-mod one named ' + JSON.stringify(b1));
      for (const [d, tm] of [[own, nw], [ext, old]]) { fs.utimesSync(path.join(d, 'ticks.json'), tm, tm); fs.utimesSync(d, tm, tm); }
      const b2 = X._t.stateOf(g, m3);
      ok(b2.both && b2.own && b2.dir === own && b2.other === ext, 'state: both there, the in-mod one is newer: it is used');
      const ls = d => fs.readdirSync(d).sort().join(',');
      ok(ls(own) === 'ticks.json' && ls(ext) === 'ticks.json', 'state: choosing made or copied nothing');
      const en = JSON.parse(fs.readFileSync(path.join(__dirname, 'lang.json'), 'utf8'));
      ok(['en', 'ru', 'uk', 'zh'].every(c => /\{dir\}/.test(en[c]['testplan.state.both']) && /\{other\}/.test(en[c]['testplan.state.both'])), 'state: the both line in four languages, names both folders');
    }
    const none = X._t.stateOf(g, '');
    ok(!none.own && /nomod-as64$/.test(none.dir), 'state: no mod, a folder per game in the data dir');
    ok(X._t.gameOf(M).id === 'mowas2' && X._t.gameOf(M).exe === 'mowas_2', 'game: MoW:AS2 id and exe');
  }

  // ---- AS64: plan as a background job, then from the cache
  const B0 = { mod };
  const st0 = await G('state', 'mod=' + encodeURIComponent(mod), A);
  ok(st0.gid === 'as64' && !st0.state.own && st0.lastMark === null && st0.marks === 0 && st0.canRun.edrun === 'run' && st0.needsGame === false && st0.running === '', 'state route before a plan');
  ok(calls().length === 0 && !fs.existsSync(path.join(mod, '.arsenal')), 'state route starts no tool and writes nothing');
  const p0 = await P('plan', B0, A);
  ok(p0.pending === true && p0.running === 'plan', 'plan: a new choice is made by a background job');
  const s0 = await G('status', 'mod=' + encodeURIComponent(mod), A);
  ok(s0.verb === 'plan' && (s0.running || s0.state === 'done'), 'status while the plan is made');
  await X._t.settle();
  const s1 = await G('status', 'mod=' + encodeURIComponent(mod), A);
  ok(!s1.running && s1.state === 'done' && s1.stage === 'testplan.stage.plan', 'status: done');
  ok(jobs.length === 1 && jobs[0].kind === 'bg' && jobs[0].what === 'testplan.job.plan' && jobs[0].page === 'testplan' && jobs[0].game === 'as64' && jobs[0].canCancel && jobs[0].ended === 'done', 'job: listed as a background job of this page and ended');
  const v0 = await P('plan', B0, A);
  ok(v0.pending === false && v0.rows.length === 5 && v0.rowsTotal === 5 && v0.rowsMatched === 5, 'plan view: 5 rows');
  ok(v0.summary.byHow.run === 3 && v0.summary.byHow.player === 2 && v0.summary.open === 5 && v0.summary.passed === 0 && v0.summary.failed === 0, 'plan view: summary by how and by status');
  ok(v0.changes.filesTotal === 3 && v0.changes.counts.added === 1 && v0.changes.files.length === 3 && v0.lastMark === null, 'plan view: changed files');
  const SD = v0.state.dir;
  ok(!v0.state.own && SD.startsWith(path.join(work, 'data')) && !fs.existsSync(path.join(mod, '.arsenal')) && v0.stack.gid === 'as64' && v0.stack.canRun.edrun === 'run' && !('items' in v0), 'plan view: stack, state in the data dir, nothing in the mod, no item list');
  ok(v0.rows[0].name === 'Tiger I' && v0.rows[0].kind === 'entity' && /^T-/.test(v0.rows[0].code) && v0.rows[0].status === 'todo', 'plan view: a row carries its item name, code and status');
  ok(v0.index.some(i => i.value === 'tiger') && v0.index.some(i => i.value === 'kwk36') && v0.index.some(i => i.value === 'fire' && i.hint === 'check'), 'plan view: the filter index has units, weapons and checks');
  const ses = v0.checklist.sessions[0];
  ok(v0.checklist.sessions.length === 1 && ses.entries.length === 2 && ses.titleKey === 'session.editor' && ses.titleArgs.n === 1 && ses.setupKeys.length === 2 && v0.checklist.counts.entries === 2 && v0.checklist.counts.open === 2, 'plan view: the list for the player with its keys');
  ok(X._t.T.builds === 1, 'plan made once');
  const nCalls = calls().length;
  await P('plan', B0, A); await P('plan', Object.assign({ q: 'fire' }, B0), A);
  ok(X._t.T.builds === 1 && calls().length === nCalls, 'plan again and a filter: from the cache, no tool run');
  { const c = calls()[0]; ok(c[0] === 'plan' && path.resolve(c[1]) === mod && c.includes('--json') && c[c.indexOf('--game') + 1] === as64 && c[c.indexOf('--exe') + 1] === 'as64' && c[c.indexOf('--since') + 1] === '7d' && v0.first === true && c[c.indexOf('--state') + 1] === SD && c[c.indexOf('--out') + 1] === path.join(SD, 'run'), 'tool call: plan <mod> --game --exe --state --out --since --in-game --json (a mod never marked: the last week, not the whole mod)'); }
  // filters
  const f = async b => P('plan', Object.assign({}, B0, b), A);
  ok((await f({ q: 'fire' })).rowsMatched === 1 && (await f({ q: 'TIGER gun' })).rowsMatched === 2 && (await f({ q: v0.rows[2].code })).rows[0].id === v0.rows[2].id, 'filter: words, case blind, a code');
  ok((await f({ how: 'player' })).rowsMatched === 2 && (await f({ status: 'open' })).rowsMatched === 5 && (await f({ status: 'pass' })).rowsMatched === 0, 'filter: by how and status');
  ok((await f({ file: path.join(mod, 'resource', 'set', 'stuff', 'gun', 'kwk36') })).rowsMatched === 1 && (await f({ file: 'resource/entity/-vehicle/tank_heavy/tiger/tiger.def' })).rowsMatched === 4, 'filter: the rows of one mod file');
  ok((await f({ limit: 3 })).rows.length === 3 && (await f({ limit: 3 })).rowsMatched === 5, 'filter: the limit cuts the rows, not the count');

  // ---- in-game only: the page has no file check step and no static route
  ok(!R['POST /api/x/testplan/static'] && calls().filter(c => c[0] === 'plan').every(c => c.includes('--in-game')) && !v0.rows.some(r => r.how === 'static') && !('static' in v0.summary.byHow), 'in-game only: every plan is asked with --in-game, no static route, no static rows');
  const parse = { code: v0.rows.find(r => r.check === 'spawn').code };   // a row that is not the player's

  // ---- emit: commands, dry runs and plans first, the input of the contract command
  const em = await P('emit', B0, A);
  ok(em.commands.length === 3 && em.commands[0].id === 'sweep-plan' && !em.commands[0].needsLaunch && em.commands.slice(1).every(c => c.needsLaunch), 'emit: commands, the ones that start no game first');
  const ed = em.commands.find(c => c.runner === 'edrun'), pv = em.commands.find(c => c.runner === 'prove');
  ok(ed.partial === false && ed.input.game === as64 && /g1\.json$/.test(ed.input.pairs) && /g1$/.test(ed.input.out) && ed.input.pipe === 'dbg_blast 1;dbg_health 1' && ed.input.dry === undefined && ed.rows === 2, 'emit: the edrun input from the command line');
  ok(pv.partial === true && pv.input.unit === 'tiger' && pv.input.army === 'ger', 'emit: a flag the contract does not know marks the command partial');
  ok(/dbg_blast 1;dbg_health 1/.test(ed.cmd) && em.commands[0].input === null && em.commands[0].partial === true && em.files.length === 2 && em.canRun.edrun === 'run' && fs.existsSync(ed.input.pairs), 'emit: text, files, canRun');
  ok((await P('plan', B0, A)).emitted.commands === 3 && X._t.T.builds === 1, 'emit: the plan knows it was emitted');
  { const i = X._t.inputOf('edrun', ['edrun/edrun.js', '--pairs', 'p.json', '--out', 'o', '--dry', '--secs', '20', '--mods', 'a,b']); ok(i.partial === false && i.input.dry === true && i.input.secs === 20 && i.input.mods.join() === 'a,b', 'inputOf: bool, int, list'); ok(X._t.inputOf('sweep', ['x']) === null && X._t.inputOf('edrun', ['edrun/edrun.js', '--pairs']).partial, 'inputOf: unknown runner, a flag with no value'); }

  // ---- read
  await refused(() => P('read', Object.assign({ dirs: ['a,b'] }, B0), A), 'testplan.e.dirs', 400, 'read: a folder name with a comma refused');
  const v2 = await P('read', Object.assign({ dirs: ['r1', 'r2'] }, B0), A);
  ok(v2.rows.find(r => r.check === 'spawn').status === 'pass' && v2.rows.find(r => r.check === 'dmgout').status === 'unproven' && v2.rows.find(r => r.check === 'fire').result.findingsTotal === 1 && v2.summary.passed === 1 && v2.summary.failed === 1 && v2.summary.open === 3, 'read: run rows answered, unproven stays open');
  ok(calls().some(c => c[0] === 'read' && c[c.indexOf('--dirs') + 1] === 'r1,r2'), 'read: --dirs passed');

  // ---- tick
  const look = v2.rows.find(r => r.check === 'look'), feel = v2.rows.find(r => r.check === 'feel');
  await refused(() => P('tick', Object.assign({ code: 'nope', v: 'pass' }, B0), A), 'testplan.e.code', 400, 'tick: not a code');
  await refused(() => P('tick', Object.assign({ code: look.code, v: 'maybe' }, B0), A), 'testplan.e.tick', 400, 'tick: not a result');
  await refused(() => P('tick', Object.assign({ code: parse.code, v: 'pass' }, B0), A), 'testplan.e.usage', 400, 'tick: a row that is not the player\'s is refused by the tool');
  const jw = { writes: false };
  const tk = await P('tick', Object.assign({ code: look.code, v: 'fail', note: 'left track\nfloats' }, B0), Object.assign({}, A, { job: jw }));
  ok(tk.ok && tk.v === 'fail' && tk.note === 'left track floats' && tk.summary.failed === 2 && tk.counts.fail === 1 && tk.counts.open === 1 && jw.writes === true, 'tick: saved, counts moved, the job is a write');
  const tfile = JSON.parse(fs.readFileSync(path.join(SD, 'ticks.json'), 'utf8'));
  ok(tfile[look.id] && tfile[look.id].v === 'fail' && tfile[look.id].note === 'left track floats', 'tick: in ticks.json');
  { const c = calls().filter(x => x[0] === 'tick').pop(); ok(path.resolve(c[1]) === mod && c[2] === look.code && c[3] === 'fail' && c[c.indexOf('--note') + 1] === 'left track floats', 'tool call: tick <mod> <code> <v> --note'); }
  const v3 = await P('plan', B0, A);
  ok(v3.rows.find(r => r.id === look.id).status === 'fail' && v3.checklist.sessions[0].entries.find(e => e.code === look.code).status === 'fail' && v3.checklist.counts.fail === 1 && X._t.T.builds === 1, 'tick: in the rows and the list, the plan not made again');
  ok(v3.rows.find(r => r.check === 'fire').status === 'fail' && v3.rows.find(r => r.check === 'spawn').status === 'pass', 'tick: the other results stay');
  const st1 = await G('state', 'mod=' + encodeURIComponent(mod), A);
  ok(st1.ticks.fail === 1 && st1.ticks.pass === 0, 'state route counts the ticks');

  // ---- checklist file
  const cl = await P('checklist', B0, A);
  ok(cl.file === path.join(SD, 'checklist.md') && fs.existsSync(cl.file) && /^# Test list/.test(cl.text) && cl.text.includes(look.code), 'checklist: markdown in the state dir');

  // ---- everything: a large plan stays light
  const big = await P('plan', { mod, everything: true, wait: true }, A);
  ok(big.everything === true && big.since === 'all' && big.rowsTotal >= 250 && big.rows.length === 200 && big.rowsMatched === big.rowsTotal, 'everything: 200 rows sent of ' + big.rowsTotal);
  ok((await P('plan', { mod, everything: true, limit: 9999 }, A)).rows.length === Math.min(500, big.rowsTotal) && (await P('plan', { mod, everything: true, q: 'unit12' }, A)).rowsMatched < 30, 'everything: the limit is capped, the filter runs on the server');
  ok(calls().some(c => c[0] === 'plan' && c.includes('--everything') && !c.includes('--since')), 'tool call: --everything');
  // the plan.json on disk is now of the other choice: a verb of the first choice makes its plan again first
  const b4 = X._t.T.builds; await P('emit', B0, A);
  ok(X._t.T.builds === b4 + 1, 'a verb never runs on the plan of another choice');

  // ---- mark
  const mk1 = await P('mark', B0, A);
  ok(mk1.ok && mk1.mark && typeof mk1.mark.at === 'string' && mk1.mark.rowsFailed >= 1, 'mark: recorded with the row counts');
  const st2 = await G('state', 'mod=' + encodeURIComponent(mod), A);
  ok(st2.marks === 1 && st2.lastMark.at === mk1.mark.at, 'mark: the state route shows it');
  const v4 = await P('plan', Object.assign({ wait: true }, B0), A);
  ok(v4.changes.filesTotal === 1 && v4.rowsTotal === 1 && v4.lastMark && v4.lastMark.at === mk1.mark.at, 'mark: the next look since the last test is made again and is smaller');

  // ---- refusals and tool failures
  await refused(() => P('plan', {}, A), 'testplan.e.nomod', 400, 'no mod refused');
  await refused(() => P('plan', { mod: path.join(work, 'nosuch') }, A), 'testplan.e.nofolder', 400, 'a missing folder refused');
  await refused(() => P('plan', { mod: as64 }, A), 'testplan.e.ingame', 400, 'the game folder refused');
  await refused(() => P('plan', { mod: path.join(as64, 'resource') }, A), 'testplan.e.ingame', 400, 'the game data refused');
  await refused(() => P('plan', { mod, since: 'yesterday; rm' }, A), 'testplan.e.since', 400, 'an unknown choice refused');
  ok((await P('plan', { mod, since: 'git:HEAD~2', wait: true }, A)).since === 'git:HEAD~2' && calls().some(c => c[c.indexOf('--since') + 1] === 'git:HEAD~2'), 'since a git commit goes to the tool');
  process.env.FAKE_FAIL = 'emit';
  const e1 = await refused(() => P('emit', { mod, since: 'git:HEAD~2' }, A), 'testplan.e.tool', 409, 'a tool failure (exit 3) reaches the page with a key');
  ok(e1 && /told to fail/.test(e1.params.m), 'a tool failure carries the tool\'s words');
  process.env.FAKE_FAIL = 'plan';
  const pf = await P('plan', { mod, since: '1d' }, A);
  await X._t.settle();
  const sf = await G('status', 'mod=' + encodeURIComponent(mod), A);
  ok(pf.pending && sf.state === 'failed' && sf.key === 'testplan.e.tool' && /told to fail/.test(sf.error), 'a failed plan job: status says failed and why');
  await refused(() => P('plan', { mod, since: '1d', wait: true }, A), 'testplan.e.tool', 0, 'a failed plan with wait:true throws');
  delete process.env.FAKE_FAIL;
  ok((await P('plan', { mod, since: '1d', wait: true }, A)).pending === false, 'after the failure the plan can be made');

  // ---- no game folder: the tool is told nothing about a game
  {
    const N = mk('as64', null), n0 = calls().length;
    const st = await G('state', 'mod=' + encodeURIComponent(mod), N);
    ok(st.needsGame === true, 'no game: the state route says so');
    const v = await P('plan', { mod, since: '7d', wait: true }, N), c = calls().slice(n0).find(x => x[0] === 'plan');
    ok(v.pending === false && c && !c.includes('--game') && v.notes.length === 1, 'no game: no --game, the tool\'s note is passed on');
  }

  // ---- pairs (the picker of the Test Run page)
  const sg = await P('pairs/suggest', { shooter: 'tiger' }, A);
  ok(sg.pair.shooter === 'tiger' && sg.pair.foe === 't34_76' && sg.pair.dist === 1000, 'pairs suggest: without a mod');
  { const c = calls().filter(x => x[0] === 'pairs' && x[1] === 'suggest').pop(); ok(c[2] === '--game' && /nomod-as64$/.test(c[c.indexOf('--state') + 1]), 'pairs suggest without a mod: no mod argument, the per game state dir'); }
  ok((await P('pairs/suggest', { mod, shooter: 'tiger', foe: 'kv1', cls: 'tank' }, A)).pair.foe === 'kv1', 'pairs suggest: with a foe');
  await refused(() => P('pairs/suggest', { mod, shooter: '' }, A), 'testplan.e.shooter', 400, 'pairs suggest: no shooter');
  await refused(() => P('pairs/suggest', { mod, shooter: 'a', foe: 'b c' }, A), 'testplan.e.foe', 400, 'pairs suggest: a bad foe');
  const PAIRS = [{ shooter: 'tiger', foe: 't34_76', dist: 1000 }, { shooter: 'nosuch', foe: 'kv1' }];
  const ck = await P('pairs/check', { mod, pairs: PAIRS }, A);
  ok(ck.results.length === 2 && ck.results[0].status === 'ok' && ck.results[1].status === 'fail' && ck.pairs === ck.results, 'pairs check: one answer per pair, under both names');
  await refused(() => P('pairs/check', { mod, pairs: [] }, A), 'testplan.e.pairs', 400, 'pairs check: an empty list refused');
  const sv = await P('pairs/lib', { mod, name: 'heavy', pairs: PAIRS }, A);
  ok(sv.ok && sv.file === path.join(SD, 'pairs', 'heavy.json') && sv.path === sv.file && sv.pairs[0].id === 'P-1' && JSON.parse(fs.readFileSync(sv.file, 'utf8'))[1].id === 'P-2', 'pairs lib save: a file in the state dir, ids from the tool');
  const ll = await G('pairs/lib', 'mod=' + encodeURIComponent(mod), A);
  ok(ll.names.length === 1 && ll.names[0].name === 'heavy' && ll.names[0].pairs === 2 && ll.files[0].count === 2 && ll.files[0].path === sv.file, 'pairs lib list');
  ok((await G('pairs/lib', 'mod=' + encodeURIComponent(mod) + '&name=heavy', A)).pairs.length === 2 && (await P('pairs/lib', { mod, name: 'heavy', op: 'get' }, A)).path === sv.file, 'pairs lib get, by GET and by op');
  await refused(() => G('pairs/lib', 'mod=' + encodeURIComponent(mod) + '&name=none', A), 'testplan.e.nolib', 404, 'pairs lib get: an unknown name');
  await refused(() => P('pairs/lib', { mod, name: '../x', pairs: PAIRS }, A), 'testplan.e.name', 400, 'pairs lib: a bad name');
  await refused(() => P('pairs/lib', { mod, name: 'x', op: 'burn' }, A), 'testplan.e.op', 400, 'pairs lib: an unknown action');
  const rm = await P('pairs/lib', { mod, name: 'heavy', remove: true }, A);
  ok(rm.removed === true && !fs.existsSync(sv.file) && (await P('pairs/lib', { mod, name: 'heavy', op: 'remove' }, A)).removed === false, 'pairs lib remove');
  const ds = await P('pairs/describe', { mod, pairs: PAIRS }, A);
  ok(ds.local === true && ds.pairs.length === 2 && /tiger fires at t34_76/.test(ds.pairs[0].text) && ds.pairs[0].shooter.id === 'tiger', 'pairs describe: the plain form when the tool has no such verb');

  // ---- MoW:AS2: dry run and plan only
  const mowMod = path.join(work, 'mow_mod'); put(path.join(mowMod, 'mod.info'), '{mod}\r\n');
  const vm = await P('plan', { mod: mowMod, wait: true }, M);
  ok(vm.stack.gid === 'mowas2' && vm.stack.canRun.edrun === 'dry' && vm.stack.canRun.prove === 'plan', 'MoW:AS2: plan, canRun dry and plan');
  const emM = await P('emit', { mod: mowMod }, M);
  ok(emM.commands.every(c => !c.needsLaunch) && emM.commands.find(c => c.runner === 'edrun').input.dry === true && emM.canRun.edrun === 'dry', 'MoW:AS2: no command starts the game');
  ok(calls().some(c => c[0] === 'plan' && c[c.indexOf('--exe') + 1] === 'mowas_2' && c[c.indexOf('--game') + 1] === mow), 'MoW:AS2: the tool is told its exe and game');

  // ---- GoH: a mod the page may not write into; nothing is written there
  const stG = await G('state', 'mod=' + encodeURIComponent(gohMod), H);
  ok(stG.gid === 'goh' && !stG.state.own && !!stG.state.why && stG.canRun.edrun === 'no' && stG.canRun.prove === 'score', 'GoH: state route, plan kept outside the mod');
  const vg = await P('plan', { mod: gohMod, wait: true }, H);
  ok(vg.pending === false && vg.stack.gid === 'goh' && !vg.state.own && vg.state.dir === stG.state.dir && fs.existsSync(path.join(stG.state.dir, 'run', 'plan.json')), 'GoH: plan made, kept in the data dir');
  const emG = await P('emit', { mod: gohMod }, H);
  ok(emG.commands.length === 1 && emG.commands[0].runner === 'sweep' && !emG.commands[0].needsLaunch && emG.commands[0].input === null && emG.canRun.edrun === 'no' && emG.notes.length === 1, 'GoH: only the load test, as text');
  const lookG = vg.rows.find(r => r.how === 'player');
  ok((await P('tick', { mod: gohMod, code: lookG.code, v: 'pass' }, H)).counts.pass === 1 && fs.existsSync(path.join(stG.state.dir, 'ticks.json')), 'GoH: a tick is saved in the data dir');
  ok((await P('checklist', { mod: gohMod }, H)).file.startsWith(stG.state.dir) && (await P('mark', { mod: gohMod }, H)).ok, 'GoH: the list file and the mark go to the data dir');
  ok(fs.readdirSync(gohMod).join() === 'mod.info' && fs.readdirSync(goh).sort().join() === 'call_to_arms.exe,mods,resource', 'GoH: nothing written into the mod or the install');
  ok(calls().some(c => c[0] === 'plan' && c[c.indexOf('--exe') + 1] === 'goh' && c[c.indexOf('--state') + 1] === stG.state.dir), 'GoH: the tool is told the state dir');
  ok(fs.readdirSync(as64).sort().join() === 'as64.exe,resource' && fs.readdirSync(mow).sort().join() === 'mowas_2.exe,resource', 'the game folders are untouched');

  // ---- Prepare: the plan of the default choice
  {
    const pr = X.prep[0], pm = path.join(work, 'prep_mod'); put(path.join(pm, 'mod.info'), '{mod}\r\n');
    ok(X.prep.length === 1 && pr.id === 'testplan.plan' && pr.title === 'testplan.prep.plan' && !!en[pr.title], 'prep: one job, titled');
    ok((await pr.state(A, {})).state === 'na', 'prep: no mod, not applicable');
    const q = { mod: pm, game: { id: 'as64', dir: as64 } }, b = X._t.T.builds, r = await pr.run(A, q, { set() {} });
    ok(r.rows === 5 && X._t.T.builds === b + 1, 'prep: the plan is made');
    const s = await pr.state(A, q);
    ok(s && s.state !== 'none' && s.state !== 'na', 'prep: state after the run: ' + (s && s.state));
    ok((await P('plan', { mod: pm }, A)).pending === false && X._t.T.builds === b + 1, 'prep: the page then finds the plan ready');
  }

  // ---- the page in the fake DOM
  const BK = require('../bots/blkboot');
  const VIEW = JSON.parse(JSON.stringify(v3)), EM = JSON.parse(JSON.stringify(em));
  const server = (o = {}) => {
    const st = { plans: 0, pendings: o.pendings || 0, verb: 'plan' };
    const route = (p, m, body) => {
      if (!/\/api\/x\/testplan\//.test(p)) return p === '/api/run' ? undefined : {};
      const name = p.replace(/^.*\/testplan\//, '');
      if (name === 'state') return { mod: 'C:/m', gid: o.gid || 'as64', state: { dir: 'C:/m/.arsenal/testplan', own: true, why: '' }, lastMark: null, marks: 0, ticks: { pass: 0, fail: 0, skip: 0 }, canRun: X._t.CAN[o.gid || 'as64'], needsGame: false, running: '' };
      if (name === 'plan') { st.plans++; if (st.pendings-- > 0) return { pending: true, running: 'plan' }; const v = JSON.parse(JSON.stringify(o.view || VIEW)); if (body.q) { v.rows = v.rows.filter(r => r.check === body.q); v.rowsMatched = v.rows.length; } return v; }
      if (name === 'status') return { running: false, verb: st.verb, secs: 2, stage: 'testplan.stage.plan', done: null, total: null, state: 'done', error: '', key: '' };
      if (name === 'emit') return o.emit || EM;
      if (name === 'read') return JSON.parse(JSON.stringify(VIEW));
      if (name === 'tick') return { ok: true, code: body.code, v: body.v, note: body.note, summary: Object.assign({}, VIEW.summary, { passed: 99 }), counts: { entries: 2, pass: 1, fail: 1, skip: 0, open: 0 } };
      if (name === 'checklist') return { file: 'C:/m/.arsenal/testplan/checklist.md', text: '# list' };
      if (name === 'mark') return { ok: true, mark: { at: '2026-11-21T10:00:00.000Z', files: 3 } };
      return {};
    };
    return { st, route };
  };
  const tp = c => /\/api\/x\/testplan\//.test(c[1]);
  const fill = (s, p) => s.replace(/\{(\w+)\}/g, (m, n) => (p[n] == null ? m : String(p[n])));
  {
    const sv1 = server({ pendings: 1 });
    const P1 = await BK.boot({ 'as2gui.mod': 'C:/m' }, sv1.route);
    await P1.settle();
    const s = P1.sec('testplan');
    ok(!!s, 'page: the Test Plan screen is built');
    if (s) {
      const all = () => s.all(), Q = (tag, fn) => all().find(e => e.tagName === tag && fn(e)), btn = t => Q('BUTTON', e => e.textContent === t);
      const say = (m, pr) => ok(!pr.length, m + (pr.length ? ': ' + pr.slice(0, 12).join('; ') : ''));
      ok(!P1.calls.some(tp), 'page: nothing is asked before the page is opened');
      say('blocks: before the page is opened', BK.check(s));
      P1.ctx.as2Link('page:testplan'); await P1.settle();
      const names = P1.calls.filter(tp).map(c => c[1].replace(/^.*\/testplan\//, '').split('?')[0]);
      ok(names.filter(n => n === 'plan').length === 2 && names.filter(n => n === 'status').length === 1 && names.filter(n => n === 'state').length === 1, 'page: pending plan, one status, then the plan: ' + names.join());
      { const b = P1.calls.find(c => /\/plan$/.test(c[1]))[2]; ok(b.mod === 'C:/m' && b.since === 'last' && b.everything === false && b.limit === 200 && b.q === '', 'page: the plan request'); }
      say('blocks: loaded', BK.check(s));
      const want = ['title', 'who', 'need', 'chg', 'chg.since', 'chg.btns', 'chg.state', 'chg.files', 'rows', 'rows.chips', 'rows.filter', 'rows.table', 'chg.check', 'run', 'run.btns', 'run.cmds', 'run.log', 'list', 'list.btns', 'list.items', 'mark', 'mark.btns'];
      ok(want.every(i => BK.ids(s).includes(i)), 'blocks: every card drawn, missing: ' + want.filter(i => !BK.ids(s).includes(i)).join());
      { const cards = all().filter(e => BK.isBox(e)).map(e => e.dataset.blk); ok(cards.join() === 'chg,rows,run,list,mark', 'cards top to bottom: ' + cards.join()); }
      ok(s.has(fill(en['testplan.ch.count'], { n: 3, a: 1, c: 1, r: 1 })) && s.has('tiger.def') && s.has(en['testplan.ch.never']), 'page: changed files counted and listed, never marked said');
      ok(s.has(fill(en['testplan.chip.run'], { n: 3 })) && all().filter(e => e.dataset && e.dataset.chip).length === 5 && s.has(fill(en['testplan.chip.player'], { n: 2 })) && s.has(fill(en['testplan.chip.fail'], { n: VIEW.summary.failed })) && s.has(fill(en['testplan.rows.count'], { n: 5, m: 5 })), 'page: summary chips and the row count');
      ok(VIEW.rows.every(r => s.has(r.code)) && s.has('Tiger I') && s.has(en['testplan.how.player']) && s.has(en['testplan.status.fail']) && s.has(en['testplan.status.unproven']), 'page: rows by item with code, status and how');
      // a row opens
      const fireR = VIEW.rows.find(r => r.check === 'fire'), rb = btn(fireR.code); rb.click();
      ok(s.has('EXPECT fire') && s.has('RUN-1: no shot was seen (edrun/g1/report.json)') && s.has('TST-19') && rb.attrs['aria-expanded'] === 'true', 'page: a row opens to its target, expectation and findings');
      rb.click(); ok(!s.has('EXPECT fire'), 'page: and closes');
      // the filter box is the shared kit: index, history, browse
      const qin = Q('INPUT', e => e.attrs['aria-label'] === en['testplan.q.label']);
      ok(!!qin && all().some(e => /\bsk\b/.test(e.className || '')) && s.has(core['sk.browse'] || 'Browse'), 'page: the filter is a searchKit box');
      qin.value = 'fire'; qin.fire('change'); await P1.settle();
      ok(P1.calls.filter(c => /\/plan$/.test(c[1])).pop()[2].q === 'fire' && s.has(fill(en['testplan.rows.count.1'], { m: 5 })) && !Q('BUTTON', e => e.textContent === look.code), 'page: the filter asks the server and draws its rows');
      qin.value = ''; qin.fire('change'); await P1.settle();
      const sel = Q('SELECT', e => e.attrs['aria-label'] === en['testplan.show.label']); sel.value = 'player'; sel.fire('change'); await P1.settle();
      ok(P1.calls.filter(c => /\/plan$/.test(c[1])).pop()[2].how === 'player', 'page: Show asks for the player\'s rows');
      sel.value = ''; sel.fire('change'); await P1.settle();
      // what changed: another choice
      const since = Q('SELECT', e => e.attrs['aria-label'] === en['testplan.ch.since']); since.value = 'all'; since.fire('change'); await P1.settle();
      { const b = P1.calls.filter(c => /\/plan$/.test(c[1])).pop()[2]; ok(b.everything === true, 'page: everything asks for every model and every gun'); }
      since.value = 'git'; since.fire('change'); await P1.settle();
      const ref = Q('INPUT', e => e.attrs['aria-label'] === en['testplan.ch.ref']); ref.value = 'HEAD~3'; ref.fire('change'); await P1.settle();
      ok(P1.calls.filter(c => /\/plan$/.test(c[1])).pop()[2].since === 'git:HEAD~3', 'page: since a git commit');
      since.value = 'last'; since.fire('change'); await P1.settle();
      btn(en['testplan.ch.reload']).click(); await P1.settle();
      ok(P1.calls.filter(c => /\/plan$/.test(c[1])).pop()[2].force === true, 'page: Look again makes the plan again');
      // files are checked elsewhere: one line and a link, no check and no fix feature here
      ok(s.has(en['testplan.ch.check']) && !!Q('BUTTON', e => e.dataset.check === '1' && e.textContent === en['testplan.ch.checkgo']) && !P1.calls.some(c => /\/static$/.test(c[1])) && !BK.ids(s).some(i => /^static/.test(i)), 'page: no file check step; one line says where files are checked, with the link');
      // the list for the player
      ok(s.has(en['testplan.cl.look.unit.do'].replace('{unit}', 'tiger')) && s.has(en['testplan.cl.setup.start'].replace('{mod}', 'my_mod')) && s.has('A step the page has no key for.') && s.has(fill(en['testplan.cl.session.editor'], { n: 1, of: 1 })), 'page: the list by session, sentences from the keys, English when a key is missing');
      ok(s.has(fill(en['testplan.cl.counts'], { n: 2, p: 0, f: 1, s: 0, o: 1 })), 'page: list counts');
      const lookE = VIEW.checklist.sessions[0].entries.find(e => e.check === 'look'), feelE = VIEW.checklist.sessions[0].entries.find(e => e.check === 'feel');
      const box = (code, v) => Q('INPUT', e => e.attrs.type === 'checkbox' && e.dataset.tick === v && e.dataset.code === code);
      ok(box(lookE.code, 'fail').checked && !box(lookE.code, 'pass').checked && !box(feelE.code, 'pass').checked, 'page: a saved tick is shown');
      const note = Q('INPUT', e => e.dataset.note === feelE.code); note.value = 'too strong';
      box(feelE.code, 'pass').checked = true; box(feelE.code, 'pass').fire('change'); await P1.settle();
      { const c = P1.calls.filter(x => /\/tick$/.test(x[1])).pop(); ok(c && c[2].code === feelE.code && c[2].v === 'pass' && c[2].note === 'too strong' && c[2].mod === 'C:/m', 'page: a tick box saves through tick with the note'); }
      ok(s.has(fill(en['testplan.cl.counts'], { n: 2, p: 1, f: 1, s: 0, o: 0 })) && s.has(fill(en['testplan.chip.pass'], { n: 99 })) && box(feelE.code, 'pass').checked && !box(feelE.code, 'skip').checked, 'page: counts and chips follow the tick');
      note.value = 'fine now'; note.fire('change'); await P1.settle();
      ok(P1.calls.filter(x => /\/tick$/.test(x[1])).pop()[2].note === 'fine now', 'page: a changed note is saved with the tick');
      btn(en['testplan.cl.save']).click(); await P1.settle();
      ok(s.has(fill(en['testplan.cl.saved'], { file: 'C:/m/.arsenal/testplan/checklist.md' })), 'page: Save as file shows the path');
      btn(en['testplan.cl.copy']).click(); await P1.settle();
      ok(P1.calls.filter(x => /\/checklist$/.test(x[1])).length === 2 && s.has('C:/m/.arsenal/testplan/checklist.md'), 'page: Copy as text asks for the list');
      // game runs: AS64
      btn(en['testplan.run.make']).click(); await P1.settle();
      say('blocks: commands drawn', BK.check(s));
      const runs = () => all().filter(e => e.tagName === 'BUTTON' && e.dataset.run === '1');
      const dry = runs().find(e => e.textContent === en['testplan.run.dry']), real = runs().find(e => e.textContent === en['testplan.run.real']);
      ok(runs().length === 2 && !!dry && !!real && real.dataset.launch === '1' && real.dataset.blocked === '1' && real.disabled && !dry.dataset.launch, 'page AS64: Dry run and Run in game per game file; the real run sits behind the launch gate');
      ok(s.has(en['testplan.run.partial']) && s.has('--brand-new-flag') && all().filter(e => e.tagName === 'BUTTON' && e.dataset.copy === '1').length === 3, 'page: a command the page cannot pass whole is text to copy');
      { const rows = all().filter(e => e.dataset && e.dataset.cmd).map(e => e.dataset.cmd); ok(rows[0] === 'sweep-plan', 'page: plans and dry runs first: ' + rows.join()); }
      // mark as tested: asks once when rows failed or are open
      P1.ctx.confirm = () => false; btn(en['testplan.mk.go']).click(); await P1.settle();
      ok(!P1.calls.some(c => /\/mark$/.test(c[1])), 'page: mark asks first when rows failed or are open; cancel marks nothing');
      P1.ctx.confirm = () => true; btn(en['testplan.mk.go']).click(); await P1.settle();
      ok(P1.calls.filter(c => /\/mark$/.test(c[1])).length === 1 && s.has(en['testplan.mk.done'].split('{')[0]), 'page: mark after the yes');
      btn(en['testplan.run.read']).click(); await P1.settle();
      ok(P1.calls.some(c => /\/read$/.test(c[1])) && s.has(fill(en['testplan.run.readDone'], { p: VIEW.summary.passed, f: VIEW.summary.failed, o: VIEW.summary.open })), 'page: Read results');
      // the dry run goes through the contract command with dry forced on
      dry.click(); await P1.settle();
      { const c = P1.calls.find(x => x[1] === '/api/run'); ok(c && c[2].cmd === 'edrun' && c[2].input.dry === true && c[2].input.pairs === ed.input.pairs && c[2].input.out === ed.input.out, 'page: Dry run starts edrun with the emitted pairs file and dry on'); }
      real.disabled = false; real.click(); await P1.settle();
      ok(P1.calls.filter(x => x[1] === '/api/run').length === 1, 'page: a real run does not start while game runs are off');
    }
  }
  { // a mod with nothing failed or open is marked without a question; no mod = one plain line and no request
    const clean = JSON.parse(JSON.stringify(VIEW)); clean.summary.failed = 0; clean.summary.open = 0;
    const sv2 = server({ view: clean }), P2 = await BK.boot({ 'as2gui.mod': 'C:/m' }, sv2.route);
    await P2.settle(); P2.ctx.as2Link('page:testplan'); await P2.settle();
    const s = P2.sec('testplan'); let asked = 0; P2.ctx.confirm = () => { asked++; return false; };
    s.all().find(e => e.tagName === 'BUTTON' && e.textContent === en['testplan.mk.go']).click(); await P2.settle();
    ok(asked === 0 && P2.calls.filter(c => /\/mark$/.test(c[1])).length === 1, 'page: nothing failed or open, mark without a question');
    s.all().find(e => e.tagName === 'BUTTON' && e.dataset.check === '1').click(); await P2.settle();
    ok(P2.ctx.__as2gui && P2.ctx.__as2gui.cur === 'check', 'page: the link opens Check & Fix: ' + (P2.ctx.__as2gui && P2.ctx.__as2gui.cur));
    const P3 = await BK.boot({}, server().route); await P3.settle(); P3.ctx.as2Link('page:testplan'); await P3.settle();
    const s3 = P3.sec('testplan');
    ok(!P3.calls.some(tp) && s3.has(en['testplan.needmod']) && !BK.check(s3).length, 'page: no mod, one plain line, no request');
  }
  // the other games and languages
  for (const gid of ['mowas2', 'goh']) {
    const emX = gid === 'mowas2' ? JSON.parse(JSON.stringify(emM)) : JSON.parse(JSON.stringify(emG));
    for (const c of emX.commands) if (c.runner === 'prove') { c.partial = false; c.input = { unit: 'tiger', army: 'ger', plan: true }; }
    const games = {}; games[gid] = { dir: '', mod: 'C:/m', roots: null, screen: '' }; games.as64 = { dir: '', mod: '', roots: null, screen: '' };
    // the page language comes from the cookie first: the GoH page is drawn in Russian
    const FD = require('../../test/fakedom'), make0 = FD.make; if (gid === 'goh') FD.make = () => { const d = make0(); d.cookie = 'as2lang=ru'; return d; };
    const sv = server({ gid, emit: emX }), PG = await BK.boot({ 'as2gui.games': games, 'as2gui.gameId': gid}, sv.route);
    FD.make = make0;
    await PG.settle(); PG.ctx.as2Link('page:testplan'); await PG.settle();
    const s = PG.sec('testplan'), L = gid === 'goh' ? X.lang.ru : en;
    ok(!!s && PG.calls.some(c => /\/plan$/.test(c[1]) && c[2].mod === 'C:/m'), 'page ' + gid + ': built and loaded');
    if (!s) continue;
    const pr = BK.check(s); ok(!pr.length, 'blocks ' + gid + ': ' + pr.slice(0, 8).join('; '));
    s.all().find(e => e.tagName === 'BUTTON' && e.textContent === L['testplan.run.make']).click(); await PG.settle();
    const runs = s.all().filter(e => e.tagName === 'BUTTON' && e.dataset.run === '1'); const nas = s.all().filter(e => e.dataset && e.dataset.na).map(e => e.dataset.na);
    if (gid === 'mowas2') {
      ok(runs.length === 2 && runs.every(b => !b.dataset.launch) && runs.map(b => b.textContent).sort().join() === [en['testplan.run.dry'], en['testplan.run.plan']].sort().join(), 'page MoW:AS2: dry run and plan only');
      ok(nas.join() === 'testplan.na.edrun.mowas2,testplan.na.prove.mowas2' && s.has(en['testplan.na.edrun.mowas2']), 'page MoW:AS2: one line of reason each');
      runs.find(b => b.textContent === en['testplan.run.dry']).click(); await PG.settle();
      const c = PG.calls.find(x => x[1] === '/api/run');
      ok(c && c[2].cmd === 'edrun' && c[2].input.dry === true && c[2].input.exe === 'mowas_2_ed.exe', 'page MoW:AS2: the dry run names the MoW:AS2 editor');
    } else {
      ok(runs.length === 0 && nas.join() === 'testplan.na.run.goh' && s.has(L['testplan.na.run.goh']) && s.has(L['testplan.run.goh.cmds']) && s.has('preloadsweep/preloadsweep.js plan'), 'page GoH: no run button, one line why, the load test as text');
      ok(s.all().find(e => e.tagName === 'BUTTON' && e.textContent === L['testplan.run.read']).hidden === true, 'page GoH: no Read results');
      ok(s.has(L['testplan.cl.look.unit.do'].replace('{unit}', 'tiger')) && s.has(fill(L['testplan.cl.feel.weapon.do'], { carrier: L['testplan.cl.carrier.any'], weapon: 'kwk36', foe: L['testplan.cl.foe.any'] })) && s.has('A step the page has no key for.') && !s.has('DO look tiger'),
        'page ru: the list is translated, the fillers too, English only where a key is missing');
      ok(s.has(L['testplan.ch.h']) && s.has(L['testplan.mk.go']), 'page ru: card titles and buttons');
    }
  }

  console.log(good + ' passed, ' + bad + ' failed');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('FAIL crashed: ' + (e && e.stack || e)); console.log(good + ' passed, ' + (bad + 1) + ' failed'); process.exit(1); });

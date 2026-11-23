// Map Viewer export part test (MV-PG4c): node tools/gui/ext/mapviz/sub/export.test.js [scratch dir]
// Server: the routes on stubbed modules (previews, styles, cache, table, the child runner, the game resolver), a fake game
// and mod folder in the scratch dir (ARSENAL_CACHE inside it): the target rows of MoW:AS2 and Gates of Hell (header tag T,
// GoH small none PRV_NO_FILE_IN_GAME, GoH minimap sketch or real with PRV_FALLBACK_SOURCE), 501 when previews is absent,
// the plan argv (--in the cached dirs, no --source for the GoH minimap by default, a 404 need l1 when no realistic
// picture is cached), write with no planHash (403 PRV_CONFIRM, no child), a second write while one runs (409), runs that
// end done, failed (the code from stdout) and cancelled (the flag file), the run log with no folder path, undo with no
// confirm (403), edshot plan with start (501), the AS64 editor with no folder (EDSHOT_NO_ROOT), a stubbed mowas_2.exe
// running (MoW:AS2 refuse EDSHOT_RUNNING; GoH has no EDSHOT_RUNNING).
// Page: the part on a stub V in the fake DOM: RMT, the blocks, switch off (target rows only, no plan), switch on (plan
// rows, stretch line, notes, warnings), Write with confirm then one write, No, the run line, Cancel, Undo with its own
// confirm, Check, Make it on a 404 need, the editor shot plan (Close only), the language file, the help entry.
// Seeded defects: a changed plan hash (PRV_PLAN_CHANGED shown, no second write), a plan target with an unknown id (not
// drawn), an editor shot answer with starts true (the page still shows only Close), a disabled switch with no mod.
// Author: Imperator_Aug (ARSENAL, ia-97c88b48)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const OWN = !process.argv[2];
const SCR = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'mv-export-')));
fs.mkdirSync(SCR, { recursive: true });
process.env.ARSENAL_CACHE = path.join(SCR, 'cache');
const { harness: H } = require('./shell.test');
const fake = require('../../../test/fakedom');
const SRV = require('./export.server');
const PART = require('./export.client');
const LE = require('./export.lang.json'), L = H.mergeLang([require('./shell.lang.json'), LE]);
let pass = 0, failN = 0;
const ok = (c, what, extra) => { if (c) pass++; else { failN++; console.log('FAIL mapviz export: ' + what + (extra !== undefined ? '\n  ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 600) : '')); } };
const en = (k, p) => H.txOf(L, 'en')(k, p);

// ---------- fake folders ----------
const GAME = path.join(SCR, 'game'), MOD = path.join(SCR, 'mods', 'my_mod'), ROOT64 = path.join(SCR, 'build64');
for (const d of [GAME, MOD, ROOT64, path.join(SCR, 'cache')]) fs.mkdirSync(d, { recursive: true });
const CD = n => { const d = path.join(SCR, 'cache', 'x', n); fs.mkdirSync(d, { recursive: true }); return d; };

// ---------- stubs ----------
const ROWS = {
  mowas2: [{ id: 'preview', file: 'preview.dds', state: 'write', tag: 'V', size: [1024, 512], format: 'DXT1', mips: 1 },
    { id: 'small', file: 'small.dds', state: 'write', tag: 'V', size: [256, 128], format: 'DXT1', mips: 1 },
    { id: 'minimap', file: 'minimap.dds', state: 'write', tag: 'V', size: [1024, 1024], format: 'DXT1', mips: 1 },
    { id: 'header', file: 'header.dds', state: 'write', tag: 'T', size: [1024, 256], format: 'DXT1', mips: 1 },
    { id: 'header_interface', file: 'header_interface.png', state: 'none', why: 'PRV_SP_GOH_ONLY', tag: 'V' }],
  goh: [{ id: 'preview', file: 'preview.dds', state: 'write', tag: 'V', size: [1024, 512], format: 'DXT1', mips: 1 },
    { id: 'small', file: 'small.dds', state: 'none', why: 'PRV_NO_FILE_IN_GAME', tag: 'V' },
    { id: 'minimap', file: 'minimap.dds', state: 'write', tag: 'I', size: [1024, 1024], format: 'DXT1', mips: 1 },
    { id: 'header', file: 'header.dds', state: 'write', tag: 'V', size: [1024, 256], format: 'DXT1', mips: 1 },
    { id: 'header_interface', file: 'header_interface.png', state: 'none', why: 'PRV_SP_GOH_ONLY', tag: 'V' }],
};
ROWS.as64 = ROWS.mowas2;
let guardAns = null, styles = [], cached = {}, runs = [], plainRun = null;
const PRV = { targets: (t, m) => ROWS[t] || [], guard: () => guardAns };
const TABLE = { JOBS: { doc: {}, grids: {}, terrain: {}, water: {}, entcat: {}, l1: {}, l2: {}, l3: {}, l4: {}, strong: {}, recon: {} }, SIZE: { l1: 2048, l2: 2048, l3: 2048, l4: 2048 },
  reduce: (req, what) => Object.assign({ what, target: req.target, map: req.map }, req.mode ? { mode: req.mode } : {}, req.size ? { size: req.size } : {}) };
const CACHE = { entryKey: o => o.what + (o.size ? '@' + o.size : '') + (o.kind ? ':' + o.kind : ''), open: k => (cached[k] ? { dir: cached[k] } : null), root: () => path.join(SCR, 'cache') };
// the child: every call is recorded; a write or undo waits for the test to end it, plan and check answer at once
function runStub(argv, o) {
  return new Promise(res => {
    const r = { argv, ctl: o.ctl, end: (code, stdout, stderr) => res({ code, stdout: stdout || '', stderr: stderr || '', timedOut: false }) };
    o.ctl.kill = () => r.end(5, '', 'killed');
    runs.push(r);
    if (plainRun && (argv[1] === 'plan' || argv[1] === 'check')) { const a = plainRun(argv); r.end(a.code, a.stdout, a.stderr); }
  });
}
function use(o) {
  SRV._t.reset();
  SRV._t.use(Object.assign({ previews: PRV, styles: () => styles, cache: CACHE, table: TABLE, run: runStub, game: () => GAME, partBuilt: () => true, now: () => Date.now() }, o || {}));
}
const api = H.routeApi(SRV.routes, []);
const call = (m, p, b) => api('/api/x/mapviz/' + p, m === 'GET' ? undefined : b);
const q = o => Object.keys(o).map(k => k + '=' + encodeURIComponent(o[k])).join('&');
const body = o => Object.assign({ target: 'mowas2', game: GAME, modDirs: [MOD], map: 'multi/mv_fixture', mode: 'battle_zones', mod: MOD }, o || {});
const errOf = async p => { try { await p; return null; } catch (e) { return e; } };
const PLAN = { v: 1, target: 'mowas2', map: 'multi/mv_fixture', hash: '0123456789abcdef', files: ['resource/map/multi/mv_fixture/preview.dds'], targets: [], notes: [] };

async function server() {
  // target rows
  use();
  let r = await call('GET', 'previews/targets?' + q({ target: 'mowas2', map: 'multi/mv_fixture' }));
  ok(r.rows.map(x => x.id).join() === 'preview,small,minimap,header,header_interface', 'AS2 rows', r.rows.map(x => x.id));
  ok(r.rows.find(x => x.id === 'header').tag === 'T' && r.kind === 'mp', 'AS2 header tag T, kind mp', r);
  ok(r.rows.find(x => x.id === 'preview').source === 'real' && r.rows.find(x => x.id === 'preview').marks === 'flags', 'AS2 preview defaults');
  r = await call('GET', 'previews/targets?' + q({ target: 'goh', map: 'multi/mv_fixture' }));
  const gs = r.rows.find(x => x.id === 'small'), gm = r.rows.find(x => x.id === 'minimap');
  ok(gs.state === 'none' && gs.why === 'PRV_NO_FILE_IN_GAME', 'GoH small none PRV_NO_FILE_IN_GAME', gs);
  ok(gm.source === 'real' && gm.notes.indexOf('PRV_FALLBACK_SOURCE') >= 0, 'GoH minimap real + PRV_FALLBACK_SOURCE with no sketch style', gm);
  styles = [{ id: 'sketch', state: 'built' }];
  r = await call('GET', 'previews/targets?' + q({ target: 'goh', map: 'multi/mv_fixture' }));
  ok(r.rows.find(x => x.id === 'minimap').source === 'sketch' && !r.rows.find(x => x.id === 'minimap').notes.length, 'GoH minimap sketch when the sketch style is built');
  styles = [];
  use({ previews: null });
  let e = await errOf(call('GET', 'previews/targets?' + q({ target: 'goh', map: 'multi/mv_fixture' })));
  ok(e && e.status === 501 && e.key === 'mapviz.err.MV_NOT_BUILT', 'previews absent: 501', e && e.status);
  use();
  e = await errOf(call('GET', 'previews/targets?' + q({ map: 'multi/mv_fixture' })));
  ok(e && e.status === 400, 'targets with no target: 400');

  // plan: needs
  use(); cached = {}; runs = [];
  e = await errOf(call('POST', 'previews/plan', body()));
  ok(e && e.status === 404 && e.params.need && e.params.need.what === 'doc' && !runs.length, 'plan with no doc: 404 need doc, no child', e && e.params);
  cached = { doc: CD('doc') };
  e = await errOf(call('POST', 'previews/plan', body()));
  ok(e && e.status === 404 && e.params.need && e.params.need.what === 'l1' && e.params.need.args.size === 2048, 'plan with no realistic picture: 404 need l1 at 2048', e && e.params);
  cached = { doc: CD('doc'), grids: CD('grids'), 'l2@2048': CD('l2'), 'l1@2048': CD('l1') };
  plainRun = () => ({ code: 0, stdout: JSON.stringify(PLAN) });
  r = await call('POST', 'previews/plan', body({ target: 'goh' }));
  let a = runs[runs.length - 1].argv;
  ok(r.hash === PLAN.hash, 'plan answer passed on');
  const ins = a.reduce((o, x, i) => (x === '--in' ? o.concat(a[i + 1]) : o), []);
  ok(ins.indexOf(CD('doc')) >= 0 && ins.indexOf(CD('grids')) >= 0 && ins.indexOf(CD('l2')) >= 0 && ins.indexOf(CD('l1')) < 0, 'plan --in: doc, grids, the best rung (l2 before l1)', ins);
  ok(a.indexOf('--source') < 0, 'GoH minimap: no --source by default', a);
  ok(a[0] === 'previews' && a[1] === 'plan' && a.slice(-2).join(' ') === '--json -q' && a[a.indexOf('--mod') + 1] === path.resolve(MOD), 'plan argv shape', a);
  e = await errOf(call('POST', 'previews/plan', body({ set: { 'minimap.source': 'topo' } })));
  ok(e && e.status === 501, 'a source with no job row: 501', e && e.status);
  TABLE.JOBS.topo = {}; cached.topo = CD('topo');
  r = await call('POST', 'previews/plan', body({ set: { 'minimap.source': 'topo' } }));
  a = runs[runs.length - 1].argv;
  ok(a.indexOf('minimap.source=topo') > 0 && a.indexOf(CD('topo')) > 0, 'a set source goes as --set and its dir as --in', a);
  e = await errOf(call('POST', 'previews/plan', body({ set: { 'minimap.size': '9' } })));
  ok(e && e.status === 400 && e.params.code === 'PRV_SET', 'a bad set key: 400 PRV_SET', e && e.params);
  guardAns = { code: 'PRV_WORKSHOP', why: 'workshop ' + MOD };
  e = await errOf(call('POST', 'previews/plan', body()));
  ok(e && e.status === 403 && e.params.code === 'PRV_WORKSHOP' && e.params.msg.indexOf(MOD) < 0, 'guard refusal: 403 with the code, no folder in the message', e && e.params);
  guardAns = { code: 'PRV_MOD_MISSING' };
  e = await errOf(call('POST', 'previews/plan', body()));
  ok(e && e.status === 404 && e.params.code === 'PRV_MOD_MISSING', 'missing mod: 404 PRV_MOD_MISSING');
  guardAns = null;
  plainRun = () => ({ code: 6, stdout: JSON.stringify({ v: 1, error: { code: 'MV_REFUSED', msg: 'no in ' + MOD, detail: { code: 'PRV_NOT_IN_STACK' } } }) });
  e = await errOf(call('POST', 'previews/plan', body()));
  ok(e && e.status === 403 && e.params.code === 'PRV_NOT_IN_STACK' && e.params.msg.indexOf(MOD) < 0, 'plan child refusal: the own code, no folder', e && e.params);

  // write
  runs = []; plainRun = null;
  e = await errOf(call('POST', 'previews/write', body()));
  ok(e && e.status === 403 && e.params.code === 'PRV_CONFIRM' && !runs.length, 'write with no planHash: 403 PRV_CONFIRM, no child', e && e.params);
  r = await call('POST', 'previews/write', body({ planHash: PLAN.hash }));
  ok(r && /^prv-/.test(r.id) && r.state === 'running' && runs.length === 1, 'write starts a run', r);
  a = runs[0].argv;
  ok(a[1] === 'write' && a[a.indexOf('--plan-hash') + 1] === PLAN.hash && a.indexOf('--progress') > 0 && a.indexOf('--cancel-flag') > 0 && a.slice(-2).join(' ') === '--json -q', 'write argv', a);
  e = await errOf(call('POST', 'previews/write', body({ planHash: PLAN.hash })));
  ok(e && e.status === 409, 'a second write while one runs: 409', e && e.status);
  e = await errOf(call('POST', 'previews/undo', body({ confirm: true })));
  ok(e && e.status === 409, 'an undo while a write runs: 409');
  fs.writeFileSync(a[a.indexOf('--progress') + 1], JSON.stringify({ stage: 'encode', done: 2, total: 4 }) + '\n');
  let v = await call('GET', 'previews/run?' + q({ id: r.id }));
  ok(v.state === 'running' && v.stage === 'encode' && v.done === 2 && v.total === 4, 'run view: stage and progress', v);
  runs[0].end(0, JSON.stringify({ v: 1, written: ['a', 'b'], backups: ['a'], entry: { n: 3 }, path: MOD }));
  await H.flush();
  v = await call('GET', 'previews/run?' + q({ id: r.id }));
  ok(v.state === 'done' && v.result && v.result.entry.n === 3, 'run ends done', v);
  const log = fs.readFileSync(path.join(SCR, 'cache', 'runs', r.id, 'stdout.txt'), 'utf8');
  ok(log.indexOf(MOD) < 0 && log.indexOf(MOD.replace(/\\/g, '/')) < 0 && log.indexOf('<mod>') >= 0, 'run log: the mod folder hidden', log);
  // failed: the code from stdout
  runs = [];
  r = await call('POST', 'previews/write', body({ planHash: PLAN.hash }));
  runs[0].end(6, JSON.stringify({ v: 1, error: { code: 'MV_REFUSED', msg: 'plan changed', detail: { code: 'PRV_PLAN_CHANGED' } } }));
  await H.flush();
  v = await call('GET', 'previews/run?' + q({ id: r.id }));
  ok(v.state === 'failed' && v.error.code === 'PRV_PLAN_CHANGED', 'run ends failed with the code from stdout', v);
  // cancelled
  runs = [];
  r = await call('POST', 'previews/write', body({ planHash: PLAN.hash }));
  const flag = runs[0].argv[runs[0].argv.indexOf('--cancel-flag') + 1];
  const c = await call('POST', 'previews/cancel', { id: r.id });
  ok(c.state === 'running' && fs.existsSync(flag), 'cancel writes the flag file', c);
  runs[0].end(5, '');
  await H.flush();
  v = await call('GET', 'previews/run?' + q({ id: r.id }));
  ok(v.state === 'cancelled', 'run ends cancelled', v);
  e = await errOf(call('GET', 'previews/run?' + q({ id: 'prv-none' })));
  ok(e && e.status === 404, 'unknown run: 404');

  // JOBS (tools/gui/README.md): a run is one bg job of the GUI job list; plan and check can be stopped while the child lives
  {
    const reg = require('../../../joblist').create({ keepMs: 600000 });
    const rt = (p, b, ctx) => SRV.routes['POST /api/x/mapviz/' + p](new URL('/api/x/mapviz/' + p, 'http://x'), b, ctx);
    const byId = id => reg.list().find(j => j.id === id);
    plainRun = null; runs = [];
    let w = await rt('previews/write', body({ planHash: PLAN.hash }), { jobs: reg });
    let lj = reg.list();
    ok(lj.length === 1 && lj[0].kind === 'bg' && lj[0].what === 'job.w.previews' && lj[0].whatP.map === 'multi/mv_fixture' && lj[0].page === 'mapviz' && lj[0].game === 'mowas2' && lj[0].writes === true && lj[0].canCancel === true && lj[0].state === 'running',
      'JOBS: a write run is one bg job that writes', lj);
    const arg = n => runs[0].argv[runs[0].argv.indexOf(n) + 1];
    fs.appendFileSync(arg('--progress'), JSON.stringify({ stage: 'encode', done: 1, total: 3 }) + '\n');
    await H.until(() => byId(lj[0].id).done === 1, 5000);
    ok(byId(lj[0].id).stage === 'mapviz.export.stage.encode' && byId(lj[0].id).total === 3 && !!LE.en['mapviz.export.stage.encode'], 'JOBS: stage, done and total follow the run with no poll from the page', byId(lj[0].id));
    ok(reg.cancel(lj[0].id) === true && fs.existsSync(arg('--cancel-flag')) && SRV._t.runs[w.id].cancelled === true, 'JOBS: the footer Cancel writes the cancel flag (the stop of POST previews/cancel)');
    ok(byId(lj[0].id).state === 'running', 'JOBS: the job stays running until the child ends');
    runs[0].end(5, '');
    await H.flush();
    ok(byId(lj[0].id).state === 'cancelled' && (await call('GET', 'previews/run?' + q({ id: w.id }))).state === 'cancelled', 'JOBS: the run and its job end cancelled', byId(lj[0].id));
    const ends = [];
    for (const [code, out] of [[0, JSON.stringify({ v: 1, n: 5, written: ['a'], backups: [], notes: {} })], [6, JSON.stringify({ v: 1, error: { code: 'MV_REFUSED', msg: 'plan changed', detail: { code: 'PRV_PLAN_CHANGED' } } })]]) {
      runs = [];
      w = await rt(code ? 'previews/undo' : 'previews/write', code ? body({ confirm: true }) : body({ planHash: PLAN.hash }), { jobs: reg });
      runs[0].end(code, out);
      await H.flush();
      ends.push(reg.list()[reg.list().length - 1].state);
    }
    ok(ends.join() === 'done,failed' && reg.list().length === 3 && reg.list().every(j => j.state !== 'running'), 'JOBS: done and failed runs (write, undo) end their job', reg.list());
    // a cancel the child ignores: killed after the wait, the job ends cancelled
    use({ killWaitMs: 5 }); runs = [];
    w = await rt('previews/write', body({ planHash: PLAN.hash }), { jobs: reg });
    const kid = reg.list()[reg.list().length - 1].id;
    reg.cancel(kid);
    await H.until(() => byId(kid).state !== 'running', 5000);
    ok(byId(kid).state === 'cancelled', 'JOBS: a child that ignores the flag is killed and the job ends', byId(kid));
    use();
    // plan: stoppable while its child lives
    for (const p of ['previews/plan', 'previews/check']) {
      runs = [];
      const job = reg.add({ kind: 'req', canCancel: false });
      const pr = rt(p, body(), { jobs: reg, job });
      await H.until(() => runs.length === 1, 5000);
      ok(byId(job.id).canCancel === true, 'JOBS: ' + p + ' can be stopped while its child lives');
      reg.cancel(job.id);
      const ans = await pr;
      ok(ans === null && job.cancelled === true && job.canCancel === false, 'JOBS: ' + p + ' stopped: the child is killed and the route returns early', ans);
      job.end();
    }
    // plan: the child dies when the page goes away; a finished plan cannot be stopped any more
    runs = [];
    let gone = null;
    const pr2 = rt('previews/plan', body(), { onClose: fn => { gone = fn; } });
    await H.until(() => runs.length === 1, 5000);
    gone();
    const e2 = await errOf(pr2);
    ok(typeof gone === 'function' && e2 && e2.key === 'mapviz.err.MV_CANCELLED', 'JOBS: the plan child is killed when the page goes away', e2);
    plainRun = () => ({ code: 0, stdout: JSON.stringify(PLAN) });
    const job3 = reg.add({ kind: 'req', canCancel: false });
    const ans3 = await rt('previews/plan', body(), { jobs: reg, job: job3 });
    ok(ans3 && ans3.hash === PLAN.hash && job3.canCancel === false, 'JOBS: a plan that ended is not stoppable any more');
    job3.end(); plainRun = null;
  }

  // undo, check
  runs = [];
  e = await errOf(call('POST', 'previews/undo', body()));
  ok(e && e.status === 403 && e.params.code === 'PRV_CONFIRM' && !runs.length, 'undo with no confirm: 403 PRV_CONFIRM');
  r = await call('POST', 'previews/undo', body({ confirm: true, n: 3 }));
  ok(r.id && runs[0].argv[1] === 'undo' && runs[0].argv[runs[0].argv.indexOf('--n') + 1] === '3', 'undo starts a run with --n', runs[0] && runs[0].argv);
  runs[0].end(0, JSON.stringify({ v: 1, restored: ['a'], kept: [] }));
  await H.flush();
  plainRun = () => ({ code: 0, stdout: JSON.stringify({ v: 1, files: [{ path: 'x', ok: true }], ok: true }) });
  r = await call('POST', 'previews/check', body());
  ok(r.ok === true && runs[runs.length - 1].argv[1] === 'check', 'check answers');

  // fixer checks (checker findings): cancel then exit 0 is done; a forced stop is a cancel that names no "unchanged"
  plainRun = null; runs = [];
  r = await call('POST', 'previews/write', body({ planHash: PLAN.hash }));
  await call('POST', 'previews/cancel', { id: r.id });
  runs[0].end(0, JSON.stringify({ v: 1, n: 4, written: ['a', 'b'], backups: [], notes: {} }));
  await H.flush();
  v = await call('GET', 'previews/run?' + q({ id: r.id }));
  ok(v.state === 'done' && v.result && v.result.n === 4 && !v.error, 'cancel asked, then the child ends 0: done with the result kept', v);
  runs = [];
  r = await call('POST', 'previews/write', body({ planHash: PLAN.hash }));
  await call('POST', 'previews/cancel', { id: r.id });
  runs[0].end(null, '', 'killed');
  await H.flush();
  v = await call('GET', 'previews/run?' + q({ id: r.id }));
  ok(v.state === 'cancelled' && v.error.forced === true && v.error.msg.indexOf('nothing in the mod changed') < 0, 'cancel then a killed child: cancelled, forced, no "nothing changed" promise', v);
  runs = [];
  r = await call('POST', 'previews/write', body({ planHash: PLAN.hash }));
  runs[0].end(null, '', 'gone');
  await H.flush();
  v = await call('GET', 'previews/run?' + q({ id: r.id }));
  ok(v.state === 'failed', 'a child that dies with no cancel asked: failed', v);
  // recon as a source: the same --in as real (late F3), no recon job
  runs = []; plainRun = () => ({ code: 0, stdout: JSON.stringify(PLAN) });
  cached = { doc: CD('doc'), 'l2@2048': CD('l2') };
  r = await call('POST', 'previews/plan', body({ set: { 'preview.source': 'recon' } }));
  a = runs[runs.length - 1].argv;
  ok(a.indexOf(CD('l2')) > 0 && a.indexOf('preview.source=recon') > 0, 'recon source: --in the best cached rung (l2), no need recon', a);
  cached = { doc: CD('doc') };
  e = await errOf(call('POST', 'previews/plan', body({ set: { 'preview.source': 'recon' } })));
  ok(e && e.status === 404 && e.params.need.what === 'l1' && e.params.need.args.size === 2048, 'recon source with no rung: 404 need l1 at 2048', e && e.params);
  // marks full: the routes entry of kind inf, phase null when cached, never a need (late F4)
  TABLE.JOBS.routes = {};
  cached = { doc: CD('doc'), 'l2@2048': CD('l2'), 'routes:inf': CD('routes') };
  r = await call('POST', 'previews/plan', body({ set: { 'preview.marks': 'full' } }));
  a = runs[runs.length - 1].argv;
  ok(a.indexOf(CD('routes')) > 0, 'marks full: the routes dir goes as --in', a);
  delete cached['routes:inf'];
  r = await call('POST', 'previews/plan', body({ marks: 'full' }));
  a = runs[runs.length - 1].argv;
  ok(r.hash === PLAN.hash && a.indexOf(CD('routes')) < 0, 'marks full with no routes cached: no need, the plan runs', a);
  // strong tick: strong of kind inf whatever the page kind; the child gets --kind inf
  cached = { doc: CD('doc'), 'l2@2048': CD('l2'), 'strong:inf': CD('strong') };
  r = await call('POST', 'previews/plan', body({ kind: 'tank', set: { 'preview.strong': 1 } }));
  a = runs[runs.length - 1].argv;
  ok(a.indexOf(CD('strong')) > 0 && a[a.indexOf('--kind') + 1] === 'inf', 'strong tick on kind tank: strong of kind inf, --kind inf', a);
  r = await call('POST', 'previews/plan', body({ kind: 'tank' }));
  a = runs[runs.length - 1].argv;
  ok(a.indexOf('--kind') < 0, 'no tick: no --kind', a);
  // check and undo with an empty cache: no need doc; undo has no --in
  cached = {}; runs = [];
  plainRun = () => ({ code: 0, stdout: JSON.stringify({ v: 1, files: [], ok: true }) });
  r = await call('POST', 'previews/check', body());
  ok(r.ok === true && runs[0].argv.indexOf('--in') < 0, 'check with an empty cache runs, no --in', runs[0] && runs[0].argv);
  r = await call('POST', 'previews/undo', body({ confirm: true }));
  ok(r.id && runs[1].argv[1] === 'undo' && runs[1].argv.indexOf('--in') < 0, 'undo with an empty cache runs, no --in', runs[1] && runs[1].argv);
  runs[1].end(0, JSON.stringify({ v: 1, n: 1, restored: [], removed: ['a'], kept: [] }));
  await H.flush();
  cached = { doc: CD('doc') }; runs = [];
  r = await call('POST', 'previews/undo', body({ confirm: true }));
  ok(runs[0].argv.indexOf('--in') < 0, 'undo with a cached doc: still no --in', runs[0].argv);
  runs[0].end(0, '{}'); await H.flush();
  plainRun = null;

  // late F11 deploy all: POST previews/deploy-list (what a deploy writes), plan and write with all:true
  { const DOCD = CD('docF11');
    fs.writeFileSync(path.join(DOCD, 'mapdoc.json'), JSON.stringify({ v: 1, boxes: { world: [-2000, -1000, 2000, 1000] } }));
    const MAPD = path.join(MOD, 'resource', 'map', 'multi', 'mv_fixture');
    fs.mkdirSync(MAPD, { recursive: true }); fs.writeFileSync(path.join(MAPD, 'preview.dds'), 'old');
    cached = { doc: DOCD, 'l2@2048': CD('l2') }; runs = [];
    r = await call('POST', 'previews/deploy-list', body());
    ok(r && r.size === 2048 && r.files.map(f => f.id).join() === 'preview,small,minimap,header' && r.skipped.length === 1 && r.skipped[0].id === 'header_interface' && r.skipped[0].why === 'PRV_SP_GOH_ONLY',
      'deploy-list AS2: the four files the game reads at the long side 2048, the interface header left out with why', r);
    const pf = r.files[0], sf = r.files[1];
    ok(pf.action === 'replace' && sf.action === 'new' && pf.path === 'resource/map/multi/mv_fixture/preview.dds' && pf.format === 'DXT1' && pf.size.join() === '1024,512' && pf.source === 'real' && pf.marks === 'flags' && pf.compose === 'stretch' && !r.needs.length && !runs.length,
      'deploy-list: file, size, format, new or replace, the picture, marks and layout; nothing to make; no child', r.files);
    ok(JSON.stringify(r).indexOf(MOD) < 0 && JSON.stringify(r).indexOf(MOD.replace(/\\/g, '/')) < 0, 'deploy-list names no mod folder path');
    r = await call('POST', 'previews/deploy-list', body({ target: 'goh' }));
    ok(r.files.map(f => f.id).join() === 'preview,minimap,header' && r.skipped.map(x => x.id + ':' + x.why).join() === 'small:PRV_NO_FILE_IN_GAME,header_interface:PRV_SP_GOH_ONLY', 'deploy-list GoH: no small (the game has no such file), the interface header per its rows', r.skipped);
    cached = { doc: DOCD };
    r = await call('POST', 'previews/deploy-list', body({ set: { 'header.compose': 'crop' } }));
    ok(r.needs.length === 1 && r.needs[0].what === 'l1' && r.needs[0].args.size === 2048 && r.files.find(f => f.id === 'header').compose === 'crop' && r.files.every(f => !f.problem),
      'deploy-list with no picture: one need l1 at the long side; a per-file choice shows', r);
    let e2 = await errOf(call('POST', 'previews/deploy-list', body({ mod: undefined })));
    ok(e2 && e2.status === 400 && e2.params.code === 'PRV_MOD_MISSING', 'deploy-list with no mod folder: refused', e2 && e2.params);
    e2 = await errOf(call('POST', 'previews/deploy-list', body({ map: 'multi/../../escape' })));
    ok(e2 && e2.status === 400 && e2.params.code === 'PRV_PATH', 'deploy-list with a map key that climbs out: refused PRV_PATH', e2 && e2.params);
    guardAns = { code: 'PRV_WORKSHOP', why: 'workshop ' + MOD };
    e2 = await errOf(call('POST', 'previews/deploy-list', body()));
    ok(e2 && e2.status === 403 && e2.params.code === 'PRV_WORKSHOP' && e2.params.msg.indexOf(MOD) < 0, 'deploy-list: the mod guard refuses a workshop folder, no path in the words', e2 && e2.params);
    guardAns = null;
    cached = { doc: DOCD, 'l2@2048': CD('l2') }; runs = [];
    plainRun = () => ({ code: 0, stdout: JSON.stringify(PLAN) });
    r = await call('POST', 'previews/plan', body({ all: true }));
    ok(runs[0].argv.indexOf('--all') > 0 && runs[0].argv.indexOf('--targets') < 0, 'plan all: --all to the child, no --targets', runs[0].argv);
    e2 = await errOf(call('POST', 'previews/plan', body({ all: true, targets: ['preview'] })));
    ok(e2 && e2.status === 400 && e2.params.code === 'PRV_SET', 'plan all with targets: refused', e2 && e2.params);
    e2 = await errOf(call('POST', 'previews/plan', body({ all: 'yes' })));
    ok(e2 && e2.status === 400, 'all that is not true or false: refused', e2 && e2.params);
    plainRun = null; runs = [];
    r = await call('POST', 'previews/write', body({ all: true, planHash: PLAN.hash }));
    ok(r.id && runs[0].argv[1] === 'write' && runs[0].argv.indexOf('--all') > 0, 'write all: --all to the child', runs[0] && runs[0].argv);
    runs[0].end(1, JSON.stringify({ v: 1, all: true, n: 9, written: ['resource/map/multi/mv_fixture/preview.dds'], backups: [], skipped: [], failed: [{ id: 'header', path: 'resource/map/multi/mv_fixture/header.dds', code: 'PRV_FILE_FAILED', why: 'boom' }] }));
    await H.flush();
    const v2 = await call('GET', 'previews/run?' + q({ id: r.id }));
    ok(v2.state === 'done' && v2.result.failed.length === 1 && v2.result.n === 9, 'write all that ends 1 (a file failed): done with the failed list', v2);
    cached = {}; plainRun = null;
  }

  // edshot plan
  use({ edshotIo: { tasklist: () => ['mowas_2.exe'] } });
  e = await errOf(call('POST', 'edshot/plan', { target: 'mowas2', map: 'multi/mv_fixture', game: GAME, start: true }));
  ok(e && e.status === 501, 'edshot plan with start: 501');
  r = await call('POST', 'edshot/plan', { target: 'as64', map: 'multi/mv_fixture' });
  ok(r.refuse.join() === 'EDSHOT_NO_ROOT' && r.starts === false && r.editor === 'as64_ed', 'AS64 editor with no folder: EDSHOT_NO_ROOT', r);
  r = await call('POST', 'edshot/plan', { target: 'as64', map: 'multi/mv_fixture', root: path.join(SCR, 'nope') });
  ok(r.refuse.join() === 'EDSHOT_NO_ROOT', 'AS64 editor with a missing folder: EDSHOT_NO_ROOT', r);
  r = await call('POST', 'edshot/plan', { target: 'as64', map: 'multi/mv_fixture', root: ROOT64 });
  ok(r.instance === 1 && r.profile.kind === 'instance' && r.root === 'build64' && r.refuse.indexOf('EDSHOT_NO_ROOT') < 0, 'AS64 editor: instance 1, folder name only', r);
  r = await call('POST', 'edshot/plan', { target: 'mowas2', map: 'multi/mv_fixture', game: GAME });
  ok(r.refuse.indexOf('EDSHOT_RUNNING') >= 0 && !r.ok && r.starts === false && JSON.stringify(r).indexOf(SCR) < 0, 'mowas_2.exe running: MoW:AS2 refuse EDSHOT_RUNNING, no folder path', r);
  use({ edshotIo: { tasklist: () => [] } });
  r = await call('POST', 'edshot/plan', { target: 'goh', map: 'multi/mv_fixture', game: GAME });
  ok(r.refuse.indexOf('EDSHOT_RUNNING') < 0 && r.routes.indexOf('console') >= 0 && r.profile.yes === false && r.secs.join() === '150,270', 'GoH with no GoH exe running: no EDSHOT_RUNNING', r);
  SRV._t.reset();
}

// ---------- the page part on a stub V ----------
function load(o) {
  o = o || {};
  const doc = fake.make(), store = {};
  const ls = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
  const X = { mapviz: { parts: [] } };
  // o.poll: the page's real pause rule (pollLater, pollStop, pollWake of page.js) in front of the part; X.__wake = pollWake; o.S = the page's S
  const POLLSRC = o.poll ? ['var POLLS=[];'].concat(['pageHid', 'pollOn', 'pollLater', 'pollStop', 'pollWake'].map(require('../../../test/blockcheck').fnSrc), ['EXT_SCREENS.__wake=pollWake;']) : [];
  const fn = new Function('EXT_SCREENS', 'h', 'tx', 'api', 'S', 'RMT', 'cssv', 'onTheme', 'document', 'window', 'setTimeout', 'Image', 'gohDir', 'navigator', POLLSRC.concat(o.kit ? [require('../../../test/blockcheck').kitSrc(), 'searchKit.picker=function(s,d){MVPICK.push({spec:s,done:d})};'] : []).concat([PART]).join('\n'));
  fn(X, H.hOf(doc), H.txOf(L, o.code || 'en'), () => Promise.reject(new Error('no api')), o.S || {}, false, (n, d) => d || '', () => () => {}, doc,
    { requestAnimationFrame: f => f(), localStorage: ls }, (f, ms) => setTimeout(f, 2), H.ImageStub, () => '', undefined);
  return { X, doc, store, part: X.mapviz.parts.find(p => p.id === 'export') };
}
function stubV(L0, o) {
  o = o || {};
  const rec = { panels: [], on: {}, calls: [], jobs: [], boxes: {} };
  const q = Object.assign({ target: 'mowas2', map: 'multi/mv_fixture', mode: 'battle_zones', mod: '/x/mods/my_mod', game: '<game>', kind: 'inf', rmt: false, jobs: [] }, o.q || {});
  const routes = o.routes || {};
  const V = {
    q: n => q[n],
    addPanel(p) { rec.panels.push(p); const box = L0.doc.createElement('div'); rec.boxes[p.id] = box; p.build(box, V); },
    on(e, f) { (rec.on[e] = rec.on[e] || []).push(f); }, emit(e, d) { (rec.on[e] || []).forEach(f => f(d)); },
    redraw() {}, say() {}, token: n => 'var-' + n,
    // like the shell's vapi: GET previews/targets (QCOM list) gets target, game, modDir, map and mode; a field the part
    // sends wins; raw = what the part sent
    api(m, p, b) {
      const raw = b === undefined ? undefined : JSON.parse(JSON.stringify(b));
      if (m === 'GET' && p === 'previews/targets') b = Object.assign({ target: q.target, game: q.game, modDir: q.mod, map: q.map, mode: q.mode }, b || {});
      rec.calls.push({ m, p, b: b === undefined ? undefined : JSON.parse(JSON.stringify(b)), raw });
      const f = routes[m + ' ' + p];
      if (!f) return Promise.reject({ status: 404, key: 'mapviz.err.MV_NOT_FOUND', params: { msg: 'no route' } });
      return Promise.resolve().then(() => f(b));
    },
    job(w, a) { rec.jobs.push({ w, a }); return Promise.resolve({ id: 'j1' }); },
  };
  rec.V = V; rec.q = q;
  return rec;
}
const blkOf = (box, id) => box.all().find(e => e.attrs && e.attrs['data-blk'] === id) || null;
const txt = e => (e ? e.textContent : '');
const btn = (box, label) => box.all().find(e => e.tagName === 'BUTTON' && e.textContent === label) || null;
const calls = (rec, m, p) => rec.calls.filter(c => c.m === m && c.p === p);
const rejectErr = (status, code, extra) => () => { throw Object.assign({ status, key: 'mapviz.err.' + (status === 403 ? 'MV_REFUSED' : status === 404 ? 'MV_NOT_FOUND' : status === 501 ? 'MV_NOT_BUILT' : 'MV_FAULT'), params: Object.assign({ msg: 'x' }, code ? { code } : {}, extra || {}) }); };

const TROWS = { v: 1, target: 'mowas2', map: 'multi/mv_fixture', kind: 'mp', rows: ROWS.mowas2.map(r => Object.assign({ source: 'real', marks: 'flags', compose: 'stretch', notes: [] }, r)) };
function planOf(hash) {
  const t = (id, more) => Object.assign({ id, file: id + '.dds', path: 'resource/map/multi/mv_fixture/' + id + '.dds', state: 'write', tag: 'V', size: [1024, 512], format: 'DXT1', mips: 1,
    source: { name: 'real', resolved: 'pic.l1', from: 'in', state: 'ok' }, compose: 'stretch', marks: 'flags', stretch: { sx: 1, sy: 1, ratio: 1, scaleBar: true }, existing: { backup: null }, winner: { file: id + '.dds', ours: true }, warnings: [], notes: [] }, more || {});
  return { v: 1, target: 'mowas2', map: 'multi/mv_fixture', hash, files: ['resource/map/multi/mv_fixture/preview.dds', 'resource/map/multi/mv_fixture/small.dds'],
    targets: [t('preview', { stretch: { sx: 1.3, sy: 1, ratio: 1.3, scaleBar: true }, warnings: [{ code: 'PRV_SAFE_SIDE', name: 'a1', px: [10, 200] }, { code: 'PRV_SAFE_SIDE', name: 'b1', px: [1010, 200] }, { code: 'PRV_SAFE_TOP', name: 'f2', px: [500, 4] }], existing: { backup: 'new' } }),
      t('small'), t('minimap', { marks: 'none' }), t('header', { tag: 'T', stretch: { sx: 2.75, sy: 1, ratio: 2.75, scaleBar: false }, notes: ['PRV_HEADER_WIDE'] }),
      { id: 'header_interface', file: 'header_interface.png', state: 'none', why: 'PRV_SP_GOH_ONLY' }, t('bogus', { file: 'bogus.dds', path: 'resource/map/multi/mv_fixture/bogus.dds' })],
    notes: [] };
}

async function page() {
  // RMT: nothing
  let L0 = load(), rec = stubV(L0, { q: { rmt: true } });
  L0.part.init(rec.V);
  ok(!rec.panels.length && !rec.calls.length, 'RMT: no panel, no call');
  ok(L0.part && typeof L0.part.init === 'function', 'part registers as export');

  // switch off: target rows only
  let plans = 0, hash = 'aaaaaaaa11111111', writes = 0, runState = [], undoAns = null;
  const routes = {
    'GET previews/targets': () => TROWS,
    'POST previews/plan': () => { plans++; return planOf(hash); },
    'POST previews/write': b => { writes++; if (b.planHash !== hash) rejectErr(403, 'PRV_PLAN_CHANGED')(); return { id: 'prv-1', state: 'running' }; },
    'GET previews/run': () => runState.length > 1 ? runState.shift() : runState[0],
    'POST previews/cancel': b => ({ id: b.id, state: 'running' }),
    'POST previews/undo': () => undoAns,
    'POST previews/check': () => ({ v: 1, files: [{ path: 'resource/map/multi/mv_fixture/preview.dds', ok: true }, { path: 'resource/map/multi/mv_fixture/small.dds', ok: false, notes: ['PRV_CHECK_CHANGED'] }], ok: false }),
    'POST edshot/plan': b => ({ v: 1, target: b.target, editor: 'mowas_2_ed', exe: 'mowas_2_ed.exe', root: 'game', map: b.map, instance: null, routes: ['editor'], profile: { kind: 'own', yes: false },
      files: ['minimap_render.png', 'minimap_render.png.temp'], size: 4096, secs: [25, 40], ok: false, refuse: ['EDSHOT_RUNNING'], notes: ['EDSHOT_EXE_ABSENT'], starts: true }),
  };
  L0 = load(); rec = stubV(L0, { routes });
  L0.part.init(rec.V);
  rec.V.emit('map', {});
  await H.flush();
  const box = rec.boxes.export;
  ok(!!box, 'the part adds its panel');
  for (const b of ['mv.export.title', 'mv.export.switch', 'mv.export.mod', 'mv.export.deploy', 'mv.export.files', 'mv.export.adv', 'mv.export.warn', 'mv.export.run', 'mv.export.confirm', 'mv.export.edshot', 'mv.export.status'])
    ok(blkOf(box, b) && blkOf(box, b).attrs['data-blkname'], 'block ' + b + ' with a name');
  ok(box.all().some(e => e.attrs && e.attrs.role === 'dialog'), 'confirm has role dialog');
  const sw = blkOf(box, 'mv.export.switch').all().find(e => e.tagName === 'INPUT');
  ok(sw && !sw.disabled && !sw.checked, 'switch on page open: off, enabled with a mod and a map');
  ok(calls(rec, 'GET', 'previews/targets').length === 1 && calls(rec, 'GET', 'previews/targets')[0].b.target === 'mowas2' && calls(rec, 'GET', 'previews/targets')[0].b.mode === 'battle_zones', 'switch off: GET targets with target and mode', rec.calls);
  ok(['target', 'game', 'modDir', 'map', 'mode'].every(k => !(k in (calls(rec, 'GET', 'previews/targets')[0].raw || {}))), 'GET previews/targets: the part sends no context field (the shell adds them)', calls(rec, 'GET', 'previews/targets')[0]);
  ok(/'previews\/targets':\[[^\]]*'map'[^\]]*'mode'/.test(require('./shell.client')), 'the shell QCOM lists previews/targets with map and mode');
  ok(!calls(rec, 'POST', 'previews/plan').length, 'switch off: no plan');
  let files = txt(blkOf(box, 'mv.export.files'));
  ok(files.indexOf('resource/map/multi/mv_fixture/preview.dds') >= 0 && files.indexOf(en('mapviz.export.target.header')) >= 0 && files.indexOf(en('mapviz.export.tagT')) >= 0, 'switch off: AS2 rows and the header tag T', files);
  ok(files.indexOf(en('mapviz.export.prv.PRV_SP_GOH_ONLY')) >= 0, 'none row shows why');
  ok(txt(blkOf(box, 'mv.export.mod')) === en('mapviz.export.mod', { name: 'my_mod' }), 'mod line names the folder only', txt(blkOf(box, 'mv.export.mod')));

  // switch on: the plan
  sw.checked = true; sw.fire('change');
  await H.flush();
  ok(plans === 1, 'switch on: one plan', plans);
  const pb = calls(rec, 'POST', 'previews/plan')[0].b;
  ok(pb.target === 'mowas2' && pb.mod === '/x/mods/my_mod' && pb.modDirs[0] === '/x/mods/my_mod' && pb.mode === 'battle_zones' && pb.map === 'multi/mv_fixture', 'plan body', pb);
  files = txt(blkOf(box, 'mv.export.files'));
  ok(files.indexOf(en('mapviz.export.stretch', { ax: '1.30', ay: '1.00' })) >= 0, 'preview stretch "1.30 times across"', files);
  ok(files.indexOf(en('mapviz.export.stretch', { ax: '2.75', ay: '1.00' })) >= 0 && files.indexOf(en('mapviz.export.noScaleBar')) >= 0, 'header stretch 2.75 and no scale bar');
  ok(files.indexOf(en('mapviz.export.prv.PRV_HEADER_WIDE')) >= 0, 'header PRV_HEADER_WIDE');
  ok(files.indexOf('bogus') < 0, 'seeded: a plan target with an unknown id is not drawn');
  ok(files.indexOf(en('mapviz.export.backupNew')) >= 0 && files.indexOf(en('mapviz.export.lobby')) >= 0, 'backup and lobby lines');
  const warn = txt(blkOf(box, 'mv.export.warn'));
  ok(warn.indexOf(en('mapviz.export.prv.PRV_SAFE_SIDE', { name: 'a1', px: '10, 200' })) >= 0 && warn.indexOf(en('mapviz.export.prv.PRV_SAFE_SIDE', { name: 'b1', px: '1010, 200' })) >= 0 && warn.indexOf(en('mapviz.export.prv.PRV_SAFE_TOP', { name: 'f2', px: '500, 4' })) >= 0, 'battle_zones warnings a1, b1 side, f2 top', warn);
  const adv = txt(blkOf(box, 'mv.export.adv'));
  ok(adv.indexOf(en('mapviz.export.strongT', { file: 'preview.dds' })) >= 0 && adv.indexOf(en('mapviz.export.dangerT', { file: 'header.dds' })) >= 0, 'Advanced ticks name their file', adv);
  // a strong tick asks the plan again with the set and the kind
  const tick = blkOf(box, 'mv.export.adv').all().find(e => e.tagName === 'INPUT' && e.attrs.type === 'checkbox');
  tick.checked = true; tick.fire('change');
  await H.flush();
  const pb2 = calls(rec, 'POST', 'previews/plan').slice(-1)[0].b;
  ok(pb2.set && pb2.set['preview.strong'] === '1' && pb2.kind === undefined, 'strong tick: set preview.strong=1, no page kind (late F4: the server uses inf)', pb2);
  tick.checked = false; tick.fire('change');
  await H.flush();

  // write: confirm, No, then Yes
  const W = btn(box, en('mapviz.export.write'));
  W.click();
  const conf = blkOf(box, 'mv.export.confirm');
  ok(txt(conf).indexOf(en('mapviz.export.confirm', { n: 2, mod: 'my_mod' })) >= 0 && !writes, 'Write asks first, names the count and the mod', txt(conf));
  btn(conf, en('mapviz.export.no')).click();
  await H.flush();
  ok(!writes && !txt(blkOf(box, 'mv.export.confirm')), 'No: no write');
  // seeded: the plan hash changed under the page
  W.click();
  hash = 'bbbbbbbb22222222';
  btn(blkOf(box, 'mv.export.confirm'), en('mapviz.export.yes')).click();
  await H.flush(60);
  ok(writes === 1 && txt(blkOf(box, 'mv.export.status')) === en('mapviz.export.prv.PRV_PLAN_CHANGED'), 'seeded: a changed plan hash shows PRV_PLAN_CHANGED', txt(blkOf(box, 'mv.export.status')));
  ok(writes === 1 && plans >= 4, 'seeded: no second write, the plan is asked again', { writes, plans });
  // write that runs to its end
  runState = [{ id: 'prv-1', state: 'running', stage: 'compose', done: 1, total: 4, elapsed: 1 }, { id: 'prv-1', state: 'done', result: { written: ['a', 'b'], backups: ['a'], entry: { n: 7 } } }];
  btn(box, en('mapviz.export.write')).click();
  btn(blkOf(box, 'mv.export.confirm'), en('mapviz.export.yes')).click();
  await H.until(() => txt(blkOf(box, 'mv.export.status')).indexOf(en('mapviz.export.written', { n: 2, b: 1, w: 7 })) >= 0, 3000);
  ok(writes === 2 && calls(rec, 'POST', 'previews/write')[1].b.planHash === hash, 'Yes: one write with the plan hash');
  ok(txt(blkOf(box, 'mv.export.status')).indexOf(en('mapviz.export.written', { n: 2, b: 1, w: 7 })) >= 0, 'run ends: written line', txt(blkOf(box, 'mv.export.status')));
  // undo with its own confirm
  undoAns = { v: 1, restored: ['a', 'b'], kept: [] };
  btn(box, en('mapviz.export.undo')).click();
  ok(txt(blkOf(box, 'mv.export.confirm')).indexOf(en('mapviz.export.undoConfirm', { n: 7 })) >= 0 && !calls(rec, 'POST', 'previews/undo').length, 'Undo asks "Put back the files of write 7?"');
  btn(blkOf(box, 'mv.export.confirm'), en('mapviz.export.yes')).click();
  await H.flush(60);
  const ub = calls(rec, 'POST', 'previews/undo');
  ok(ub.length === 1 && ub[0].b.confirm === true && ub[0].b.n === 7, 'undo posts confirm true and n', ub);
  ok(txt(blkOf(box, 'mv.export.status')) === en('mapviz.export.undone', { n: 2, k: 0 }), 'undo answer line', txt(blkOf(box, 'mv.export.status')));
  // cancel a running write
  runState = [{ id: 'prv-1', state: 'running', stage: 'odd', elapsed: 2 }];
  btn(box, en('mapviz.export.write')).click();
  btn(blkOf(box, 'mv.export.confirm'), en('mapviz.export.yes')).click();
  await H.until(() => !!btn(box, en('mapviz.export.cancel')), 3000);
  ok(txt(blkOf(box, 'mv.export.run')).indexOf(en('mapviz.export.stage.other')) >= 0, 'an unknown stage shows "working"');
  btn(box, en('mapviz.export.cancel')).click();
  await H.flush();
  ok(calls(rec, 'POST', 'previews/cancel').length === 1 && !btn(box, en('mapviz.export.cancel')), 'Cancel posts once');
  runState = [{ id: 'prv-1', state: 'cancelled', error: { code: 'MV_CANCELLED' } }];
  await H.until(() => txt(blkOf(box, 'mv.export.status')) === en('mapviz.export.cancelled'), 3000);
  ok(txt(blkOf(box, 'mv.export.status')) === en('mapviz.export.cancelled'), 'run ends cancelled');
  // the write and undo bodies of the previews CLI as built (late P3 plus extras): write entry {n, made} and a top-level n,
  // notes [{code, text, target}]; undo restored (the removed files listed in it and again in deleted), kept, notes, already
  runState = [{ id: 'prv-1', state: 'done', result: { v: 1, target: 'mowas2', map: 'multi/mv_fixture', planHash: 'x', entry: { n: 1, made: 't' }, n: 1, written: ['p', 'q', 'r', 's'], backups: [], renamed: [], files: [], notes: [{ code: 'PRV_SCALEBAR_OFF', text: 'preview.dds: x', target: 'preview' }] } }];
  btn(box, en('mapviz.export.write')).click();
  btn(blkOf(box, 'mv.export.confirm'), en('mapviz.export.yes')).click();
  await H.until(() => txt(blkOf(box, 'mv.export.status')).indexOf(en('mapviz.export.written', { n: 4, b: 0, w: 1 })) >= 0, 3000);
  ok(txt(blkOf(box, 'mv.export.status')) === en('mapviz.export.written', { n: 4, b: 0, w: 1 }), 'CLI write body: "Write 1." from the top-level n', txt(blkOf(box, 'mv.export.status')));
  ok(txt(blkOf(box, 'mv.export.run')).indexOf(en('mapviz.export.prv.PRV_SCALEBAR_OFF')) >= 0, 'CLI write body: notes keyed by target are shown', txt(blkOf(box, 'mv.export.run')));
  undoAns = { v: 1, target: 'mowas2', map: 'multi/mv_fixture', n: 1, restored: ['p', 'q', 'r', 's'], kept: [], notes: [], deleted: ['p', 'q', 'r', 's'], already: [] };
  btn(box, en('mapviz.export.undo')).click();
  ok(txt(blkOf(box, 'mv.export.confirm')).indexOf(en('mapviz.export.undoConfirm', { n: 1 })) >= 0, 'CLI write body: Undo names write 1', txt(blkOf(box, 'mv.export.confirm')));
  btn(blkOf(box, 'mv.export.confirm'), en('mapviz.export.yes')).click();
  await H.flush(60);
  ok(txt(blkOf(box, 'mv.export.status')) === en('mapviz.export.undone', { n: 4, k: 0 }), 'CLI undo body: 4 files put back, the removed ones (deleted) not counted twice', txt(blkOf(box, 'mv.export.status')));
  // a forced stop: the words do not promise an unchanged mod
  runState = [{ id: 'prv-1', state: 'cancelled', error: { code: 'MV_CANCELLED', msg: 'x', forced: true } }];
  btn(box, en('mapviz.export.write')).click();
  btn(blkOf(box, 'mv.export.confirm'), en('mapviz.export.yes')).click();
  await H.until(() => txt(blkOf(box, 'mv.export.status')) === en('mapviz.export.cancelledForce'), 3000);
  ok(txt(blkOf(box, 'mv.export.status')) === en('mapviz.export.cancelledForce'), 'a forced stop: cancelledForce words', txt(blkOf(box, 'mv.export.status')));
  // check
  btn(box, en('mapviz.export.check')).click();
  await H.flush();
  const run = txt(blkOf(box, 'mv.export.run'));
  ok(run.indexOf(en('mapviz.export.checkBad', { file: 'resource/map/multi/mv_fixture/small.dds', why: en('mapviz.export.prv.PRV_CHECK_CHANGED') })) >= 0, 'check lines', run);

  // editor shot: MoW:AS2 plan, seeded starts true: Close only
  btn(box, en('mapviz.export.edBtn')).click();
  await H.flush();
  const cf = blkOf(box, 'mv.export.confirm');
  const bl = cf.all().filter(e => e.tagName === 'BUTTON').map(e => e.textContent);
  ok(bl.join() === en('mapviz.export.close'), 'seeded: an editor shot answer with starts true still shows only Close', bl);
  ok(txt(cf).indexOf('In this version nothing starts: this is the plan only.') >= 0 && txt(cf).indexOf(en('mapviz.export.editor.mowas_2_ed')) >= 0 && txt(cf).indexOf('25 to 40 seconds') >= 0, 'editor shot confirm text', txt(cf));
  ok(txt(blkOf(box, 'mv.export.edshot')).indexOf(en('mapviz.export.edRefuse', { why: en('mapviz.export.ed.EDSHOT_RUNNING') })) >= 0, 'editor shot refusal line');
  btn(cf, en('mapviz.export.close')).click();
  ok(!txt(blkOf(box, 'mv.export.confirm')), 'Close shuts the plan');
  ok(!calls(rec, 'POST', 'edshot/plan').some(c => c.b.start !== undefined), 'the page never sends start');
  // a target change on the same map key drops the editor plan (AS64 shares the vanilla map keys of MoW:AS2)
  ok(txt(blkOf(box, 'mv.export.edshot')).indexOf(en('mapviz.export.editor.mowas_2_ed')) >= 0, 'the MoW:AS2 editor plan is on screen');
  rec.q.target = 'as64'; rec.V.emit('map', {});
  ok(txt(blkOf(box, 'mv.export.edshot')).indexOf(en('mapviz.export.editor.mowas_2_ed')) < 0, 'target mowas2 -> as64 on the same map: the editor plan is dropped', txt(blkOf(box, 'mv.export.edshot')));
  rec.q.target = 'mowas2'; rec.V.emit('map', {}); await H.flush();
  // the editor confirm reads whole for every profile kind
  const ownTxt = en('mapviz.export.edConfirm', { editor: 'e', folder: 'f', map: 'm', size: 1, files: 'x', profile: en('mapviz.export.prof.own'), lo: 1, hi: 2 });
  const instTxt = en('mapviz.export.edConfirm', { editor: 'e', folder: 'f', map: 'm', size: 1, files: 'x', profile: en('mapviz.export.prof.instance'), lo: 1, hi: 2 });
  ok(ownTxt.indexOf('The mod list of your own game profile is set') >= 0 && instTxt.indexOf("The mod list of the build's own profile is set") >= 0 && !/the your/.test(ownTxt), 'edConfirm en: whole phrase for both profiles', [ownTxt, instTxt]);

  // AS64 editor with no folder: no call
  L0 = load(); rec = stubV(L0, { q: { target: 'as64' }, routes });
  L0.part.init(rec.V); rec.V.emit('map', {}); await H.flush();
  let b2 = rec.boxes.export;
  btn(b2, en('mapviz.export.edBtn')).click(); await H.flush();
  ok(!calls(rec, 'POST', 'edshot/plan').length && txt(blkOf(b2, 'mv.export.edshot')).indexOf(en('mapviz.export.ed.EDSHOT_NO_ROOT')) >= 0, 'AS64 with no folder: EDSHOT_NO_ROOT and no call');
  const rootIn = blkOf(b2, 'mv.export.edshot').all().find(e => e.tagName === 'INPUT');
  rootIn.value = 'build64'; btn(b2, en('mapviz.export.edBtn')).click(); await H.flush();
  ok(calls(rec, 'POST', 'edshot/plan').length === 1 && calls(rec, 'POST', 'edshot/plan')[0].b.root === 'build64' && L0.store['mapviz.export.edRoot'] === 'build64', 'AS64 folder: sent as root and kept in local storage');
  // searchKit with the page's real kit: Browse = the folder picker on the disk at the folder in the box; a pick puts the path in (seeded)
  { if (!global.LS) global.LS = { m: {}, get(k, d) { return Object.prototype.hasOwnProperty.call(this.m, k) ? this.m[k] : d; }, set(k, v) { this.m[k] = v; } };
    global.MVPICK = []; const LK = load({ kit: true }), rk = stubV(LK, { q: { target: 'as64' }, routes });
    LK.part.init(rk.V); rk.V.emit('map', {}); await H.flush();
    const sk = rk.boxes.export.all().find(e => e.attrs && e.attrs['data-sk'] === 'mapviz.exportEdRoot');
    const ri = sk && sk.all().find(e => e.tagName === 'INPUT'); if (ri) ri.value = '/x/b64';
    sk && sk.all().find(e => / sk-browse/.test(' ' + e.className)).click();
    const b0 = global.MVPICK.pop();
    ok(!!b0 && b0.spec.mode === 'dir' && b0.spec.view === 'disk' && b0.spec.start === '/x/b64', 'AS64 folder box: Browse opens the folder picker on the disk at the folder in the box', b0 && b0.spec);
    if (b0) { b0.done('/x/b65', { view: 'disk', path: '/x/b65' }); ok(ri.value === '/x/b65', 'AS64 folder box: a Browse pick puts the folder path in the box', ri.value); } }

  // seeded: no mod, the switch is disabled
  L0 = load(); rec = stubV(L0, { q: { mod: '' }, routes });
  L0.part.init(rec.V); rec.V.emit('map', {}); await H.flush();
  b2 = rec.boxes.export;
  const sw2 = blkOf(b2, 'mv.export.switch').all().find(e => e.tagName === 'INPUT');
  ok(sw2.disabled && txt(blkOf(b2, 'mv.export.mod')) === en('mapviz.export.noMod'), 'seeded: no mod, the switch is disabled');

  // Make it on a 404 need; job words while a fitting job runs
  const need = { what: 'l1', args: { map: 'multi/mv_fixture', size: 2048 } };
  L0 = load(); rec = stubV(L0, { routes: Object.assign({}, routes, { 'POST previews/plan': rejectErr(404, null, { need }) }) });
  L0.part.init(rec.V); rec.V.emit('map', {}); await H.flush();
  b2 = rec.boxes.export;
  let s3 = blkOf(b2, 'mv.export.switch').all().find(e => e.tagName === 'INPUT'); s3.checked = true; s3.fire('change'); await H.flush();
  const mk = btn(b2, en('mapviz.export.make'));
  ok(mk && txt(blkOf(b2, 'mv.export.files')).indexOf(en('mapviz.export.what.l1')) >= 0, 'a 404 need shows Make it', txt(blkOf(b2, 'mv.export.files')));
  mk.click(); mk.click();
  ok(rec.jobs.length === 1 && rec.jobs[0].w === 'l1' && rec.jobs[0].a.size === 2048, 'Make it posts the need once', rec.jobs);
  await H.flush();
  rec.q.jobs = [{ what: 'l1', target: 'mowas2', map: 'multi/mv_fixture', args: { map: 'multi/mv_fixture', size: 2048 }, text: 'Textured ground 40%' }];
  rec.V.emit('job', {});
  ok(txt(blkOf(b2, 'mv.export.files')).indexOf('Textured ground 40%') >= 0 && !btn(b2, en('mapviz.export.make')), 'a fitting job shows its words, no button');

  // 501: not available yet
  L0 = load(); rec = stubV(L0, { routes: { 'GET previews/targets': rejectErr(501) } });
  L0.part.init(rec.V); rec.V.emit('map', {}); await H.flush();
  ok(txt(blkOf(rec.boxes.export, 'mv.export.files')) === en('mapviz.export.notBuilt'), '501: not available yet');

  // the picture on screen
  L0 = load(); rec = stubV(L0, { routes });
  L0.part.init(rec.V); rec.V.emit('map', {}); await H.flush();
  b2 = rec.boxes.export;
  s3 = blkOf(b2, 'mv.export.switch').all().find(e => e.tagName === 'INPUT'); s3.checked = true; s3.fire('change'); await H.flush();
  rec.V.emit('picture', { base: 'staff', size: 2048, from: 'pictures' });
  btn(b2, en('mapviz.export.usePic')).click(); await H.flush();
  const pb3 = calls(rec, 'POST', 'previews/plan').slice(-1)[0].b;
  ok(pb3.set && pb3.set['preview.source'] === 'staff' && pb3.set['minimap.source'] === 'staff' && !pb3.set['header_interface.source'], 'use the picture on screen sets each source', pb3);
  rec.V.emit('picture', { base: 'painted', size: 1024, from: 'pictures' });
  ok(btn(b2, en('mapviz.export.usePic')).disabled, 'a picture at 1024 (not the 2048 the server reads): the button is off');
  rec.V.emit('picture', { base: 'topo', size: null, from: 'pictures' });
  ok(!btn(b2, en('mapviz.export.usePic')).disabled, 'a picture with no size (topo): the button is on');
  // late F11: deploy all, at the top
  { const MAPK = 'resource/map/multi/mv_fixture/';
    const DL = { v: 1, target: 'mowas2', map: 'multi/mv_fixture', kind: 'mp', size: 2160,
      files: [{ id: 'preview', file: 'preview.dds', path: MAPK + 'preview.dds', size: [1920, 1080], format: 'DXT1', mips: 1, action: 'replace', source: 'real', marks: 'flags', compose: 'stretch', problem: null },
        { id: 'small', file: 'small.dds', path: MAPK + 'small.dds', size: [400, 300], format: 'DXT1', mips: 1, action: 'new', source: 'real', marks: 'flags', compose: 'stretch', problem: null },
        { id: 'minimap', file: 'minimap.dds', path: MAPK + 'minimap.dds', size: [1024, 1024], format: 'DXT1', mips: 1, action: 'new', source: 'real', marks: 'none', compose: 'stretch', problem: null },
        { id: 'header', file: 'header.dds', path: MAPK + 'header.dds', size: [960, 256], format: 'DXT1', mips: 1, action: 'new', source: 'real', marks: 'flags', compose: 'stretch', problem: 'PRV_SOURCE_MISSING' }],
      skipped: [{ id: 'header_interface', file: 'header_interface.png', path: MAPK + 'header_interface.png', why: 'PRV_SP_GOH_ONLY' }],
      needs: [{ what: 'l1', args: { map: 'multi/mv_fixture', mode: 'battle_zones', size: 2160 } }] };
    const RES = { v: 1, all: true, n: 7, entry: { n: 7 }, written: [MAPK + 'preview.dds', MAPK + 'small.dds', MAPK + 'minimap.dds'], backups: [MAPK + 'preview.dds'],
      skipped: [{ id: 'header_interface', path: MAPK + 'header_interface.png', code: 'PRV_SP_GOH_ONLY', why: 'x' }], failed: [{ id: 'header', path: MAPK + 'header.dds', code: 'PRV_FILE_FAILED', why: 'boom' }] };
    let runQ = [], dlBodies = [], undoB = null;
    const dr = {
      'GET previews/targets': () => TROWS,
      'POST previews/deploy-list': b => { dlBodies.push(JSON.parse(JSON.stringify(b))); const a = JSON.parse(JSON.stringify(DL)); if (b.set && b.set['preview.compose']) a.files[0].compose = b.set['preview.compose']; return a; },
      'POST previews/plan': () => planOf('dddddddd22222222'),
      'POST previews/write': b => ({ id: 'prv-d', state: 'running' }),
      'GET previews/run': () => (runQ.length > 1 ? runQ.shift() : runQ[0]),
      'POST previews/undo': b => { undoB = b; return { id: 'prv-u', state: 'running' }; },
    };
    const wait = ms => new Promise(r => setTimeout(r, ms));
    // no mod folder: the button is off, the words say to choose a mod, a press asks nothing
    { const N0 = load(), NR = stubV(N0, { routes: dr, q: { mod: null } }); N0.part.init(NR.V); NR.V.emit('map', {}); await H.flush();
      const db = blkOf(NR.boxes.export, 'mv.export.deploy'), b0 = btn(db, en('mapviz.export.deploy'));
      ok(db && b0 && b0.disabled && txt(db).indexOf(en('mapviz.export.deployNoMod')) >= 0, 'no mod: deploy off, the words say to choose a mod', txt(db));
      b0.click(); await H.flush();
      ok(!calls(NR, 'POST', 'previews/deploy-list').length, 'no mod: a press asks nothing'); }
    // a remembered choice of this game (and a stale one the page drops) goes into the deploy list
    const D0 = load(); D0.store['mapviz.export.choices.mowas2'] = JSON.stringify({ 'small.compose': 'crop', 'minimap.compose': 'crop', 'bogus.marks': 'full', 'header.source': 'nope' });
    const DR = stubV(D0, { routes: dr }); D0.part.init(DR.V); DR.V.emit('map', {}); await H.flush();
    const dbox = DR.boxes.export, dblk = blkOf(dbox, 'mv.export.deploy');
    ok(dblk && dblk.attrs['data-blkname'] === en('mapviz.export.blk.deploy') && dbox.children.indexOf(dblk) < dbox.children.indexOf(blkOf(dbox, 'mv.export.files')) && dbox.children.indexOf(dblk) < dbox.children.indexOf(blkOf(dbox, 'mv.export.adv')),
      'deploy block at the top (before the file list and Advanced), with a name');
    const dbtn = btn(dblk, en('mapviz.export.deploy'));
    ok(dbtn && !dbtn.disabled, 'with a mod and a map: "Write all previews into the mod" is on');
    dbtn.click(); await H.flush();
    ok(dlBodies.length === 1 && dlBodies[0].mod === '/x/mods/my_mod' && dlBodies[0].target === 'mowas2' && JSON.stringify(dlBodies[0].set) === JSON.stringify({ 'small.compose': 'crop' }), 'deploy-list asked once with the mod and the remembered choice (bad ones dropped)', dlBodies);
    let dt = txt(dblk);
    ok(dt.indexOf(en('mapviz.export.deployHead', { n: 4, mod: 'my_mod' })) >= 0 && dt.indexOf(en('mapviz.export.deployFile', { name: en('mapviz.export.target.preview'), file: MAPK + 'preview.dds', size: '1920 x 1080', format: 'DXT1', action: en('mapviz.export.action.replace') })) >= 0 &&
      dt.indexOf(en('mapviz.export.action.new')) >= 0 && dt.indexOf(en('mapviz.export.deploySkip', { name: en('mapviz.export.target.header_interface'), file: MAPK + 'header_interface.png', why: en('mapviz.export.prv.PRV_SP_GOH_ONLY') })) >= 0 &&
      dt.indexOf(en('mapviz.export.deployNeeds', { n: 1, px: 2160 })) >= 0 && dt.indexOf(en('mapviz.export.prv.PRV_SOURCE_MISSING')) >= 0, 'the list: mod, each file with size, format, new or replace; the left out file and why; the pictures to make; a problem', dt);
    ok(!DR.jobs.length && !calls(DR, 'POST', 'previews/write').length && !calls(DR, 'POST', 'previews/plan').length, 'listing writes nothing, makes nothing');
    // a per-file choice: asked again, remembered for this game
    const pcs = dblk.all().filter(x => x.tagName === 'SELECT' && x.attrs['aria-label'] === en('mapviz.export.advCompose'))[0];
    pcs.value = 'crop'; pcs.fire('change'); await H.flush();
    ok(dlBodies.length === 2 && dlBodies[1].set['preview.compose'] === 'crop' && JSON.parse(D0.store['mapviz.export.choices.mowas2'])['preview.compose'] === 'crop', 'a per-file layout change asks the list again and is remembered per game', [dlBodies[1], D0.store]);
    // No: nothing
    btn(dblk, en('mapviz.export.no')).click(); await H.flush();
    ok(txt(dblk).indexOf(en('mapviz.export.deployT')) >= 0 && !DR.jobs.length, 'No: the list goes, nothing made');
    // Yes: the picture, the plan and the write with all, progress per file, the summary, one undo
    dbtn.click(); await H.flush();
    { const r1 = { state: 'running', stage: 'compose', done: 1, total: 4 }; runQ = [r1, r1, r1, r1, r1, r1, { state: 'done', result: RES }]; }
    btn(dblk, en('mapviz.export.deployYes')).click(); await H.flush();
    ok(DR.jobs.length === 1 && DR.jobs[0].w === 'l1' && DR.jobs[0].a.size === 2160, 'Yes: the missing picture is made at its size first', DR.jobs);
    const pa = calls(DR, 'POST', 'previews/plan').pop(), wr = calls(DR, 'POST', 'previews/write').pop();
    ok(pa && pa.b.all === true && !pa.b.targets && wr && wr.b.all === true && wr.b.planHash === 'dddddddd22222222' && wr.b.set['preview.compose'] === 'crop', 'then one plan and one write with all:true and the plan hash, the choices kept', [pa && pa.b, wr && wr.b]);
    dt = txt(dblk);
    ok(dt.indexOf(en('mapviz.export.fstate.composed')) >= 0 && dt.indexOf(en('mapviz.export.fstate.compose')) >= 0 && dt.indexOf(en('mapviz.export.fstate.wait')) >= 0, 'per-file progress while it runs', dt);
    // the deploy ends after several polls: wait for the summary itself (up to 3 s), not for a fixed time
    for (let i = 0; i < 60; i++) { await wait(50); await H.flush(); dt = txt(dblk); if (dt.indexOf(en('mapviz.export.deployDone', { w: 3, s: 1, f: 1, n: 7 })) >= 0) break; }
    ok(dt.indexOf(en('mapviz.export.deployDone', { w: 3, s: 1, f: 1, n: 7 })) >= 0 && dt.indexOf(en('mapviz.export.prv.PRV_FILE_FAILED')) >= 0 && dt.indexOf(en('mapviz.export.fstate.failed')) >= 0 && dt.indexOf(en('mapviz.export.fstate.written')) >= 0,
      'summary: written, skipped, failed with why', dt);
    btn(dblk, en('mapviz.export.deployUndo')).click(); await H.flush();
    const cf = txt(blkOf(dbox, 'mv.export.confirm'));
    ok(cf.indexOf(en('mapviz.export.deployUndoConfirm', { n: 7 })) >= 0, 'Undo this deploy asks once', cf);
    btn(blkOf(dbox, 'mv.export.confirm'), en('mapviz.export.yes')).click(); await H.flush();
    ok(undoB && undoB.confirm === true && undoB.n === 7, 'undo of the deploy: one journal entry, n 7', undoB);
    // single-file Write, Check and Undo stay
    ok(btn(dbox, en('mapviz.export.write')) && btn(dbox, en('mapviz.export.check')) && btn(dbox, en('mapviz.export.undo')), 'single Write, Check and Undo stay'); }
  // JOBS: every request of the part carries a name for the job list; a stopped plan and check show the plain word
  { let stop = false, stopC = false;
    const L4 = load(), r4 = stubV(L4, { routes: Object.assign({}, routes, {
      'POST previews/plan': () => { if (stop) throw Object.assign(new Error('Stopped'), { status: 499, key: 'job.cancelled', text: 'Stopped', cancelled: true }); return planOf(hash); },
      'POST previews/check': () => { if (stopC) throw Object.assign(new Error('Stopped'), { status: 499, key: 'job.cancelled', text: 'Stopped', cancelled: true }); return { v: 1, files: [], ok: true }; } }) });
    const whats = [], api0 = r4.V.api;
    r4.V.api = function (m, p, b, o) { whats.push({ m, p, o }); return api0(m, p, b); };
    L4.part.init(r4.V); r4.V.emit('map', {}); await H.flush();
    const b4 = r4.boxes.export, sw4 = blkOf(b4, 'mv.export.switch').all().find(e => e.tagName === 'INPUT');
    stop = true; sw4.checked = true; sw4.fire('change'); await H.flush(60);
    const f4 = txt(blkOf(b4, 'mv.export.files'));
    ok(f4.indexOf('Stopped') >= 0 && f4.indexOf(en('mapviz.export.failed', { msg: 'Stopped' })) < 0, 'JOBS: a stopped plan shows the plain word, not a failure', f4);
    stopC = true; btn(b4, en('mapviz.export.check')).click(); await H.flush(60);
    ok(txt(blkOf(b4, 'mv.export.status')) === 'Stopped', 'JOBS: a stopped check shows the plain word', txt(blkOf(b4, 'mv.export.status')));
    ok(whats.length >= 3 && whats.every(c => c.o && typeof c.o.what === 'string' && c.o.what.indexOf('mapviz.') < 0 && c.o.what.length > 3), 'JOBS: every request carries a name', whats);
    const src = require('./export.client');
    ok((src.match(/V\.api\(/g) || []).length === (src.match(/V\.api\([^;]*?(jw\('mapviz\.export\.[A-Za-z]+'\)|\{what:tx\('mapviz\.export\.edBtn'\)\})\)\.then\(/g) || []).length + 1,
      'JOBS: every V.api call of the part names its request (the run poll is a hidden GET)', (src.match(/V\.api\(/g) || []).length); }
  // need words for every job the server can name
  for (const w of ['doc', 'grids', 'terrain', 'water', 'entcat', 'topo', 'pass', 'l0', 'l1', 'l2', 'l3', 'l4', 'strong', 'recon', 'staff', 'painted', 'sketch', 'routes'])
    for (const c of ['en', 'ru', 'uk', 'zh']) ok(!!LE[c]['mapviz.export.what.' + w], 'need words ' + c + ' what.' + w);
}

// ---------- language and help ----------
// K5 (PERF.md): the 0.5 s read of a running write waits while the Map Viewer page or the window is hidden (pollLater, page.js):
// no previews/run request then; shown again = one read at once and the end drawn as before (the run is never lost)
async function polls() {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  for (const how of ['page', 'window']) {
    let ans = { id: 'prv-1', state: 'running', stage: 'compose', done: 1, total: 4, elapsed: 1 };
    const S = { cur: 'mapviz', sec: { mapviz: {} } };
    const routes = {
      'GET previews/targets': () => TROWS, 'POST previews/plan': () => planOf('aaaaaaaa11111111'),
      'POST previews/write': () => ({ id: 'prv-1', state: 'running' }), 'GET previews/run': () => ans,
    };
    const L0 = load({ poll: true, S }), rec = stubV(L0, { routes });
    const hide = v => { if (how === 'page') S.cur = v ? 'share' : 'mapviz'; else L0.doc.hidden = v; };
    L0.part.init(rec.V); rec.V.emit('map', {}); await H.flush();
    const box = rec.boxes.export, sw = blkOf(box, 'mv.export.switch').all().find(e => e.tagName === 'INPUT');
    sw.checked = true; sw.fire('change'); await H.flush();
    btn(box, en('mapviz.export.write')).click(); btn(blkOf(box, 'mv.export.confirm'), en('mapviz.export.yes')).click();
    const rc = () => calls(rec, 'GET', 'previews/run').length, done = en('mapviz.export.written', { n: 2, b: 1, w: 7 });
    await H.until(() => rc() >= 3, 3000);
    ok(rc() >= 3 && !!btn(box, en('mapviz.export.cancel')), 'poll (' + how + '): on screen a running write is read again and again', rc());
    hide(true); await wait(40); const n1 = rc(); await wait(120);
    ok(rc() === n1, 'poll (' + how + ' hidden): no previews/run request while the write runs', [n1, rc()]);
    ok(txt(blkOf(box, 'mv.export.status')).indexOf(done) < 0, 'poll (' + how + ' hidden): the run is still shown as running');
    ans = { id: 'prv-1', state: 'done', result: { written: ['a', 'b'], backups: ['a'], entry: { n: 7 } } };
    hide(false); L0.X.__wake(); await H.flush();
    ok(rc() === n1 + 1 && txt(blkOf(box, 'mv.export.status')).indexOf(done) >= 0 && !btn(box, en('mapviz.export.cancel')), 'poll (' + how + ' shown again): one read at once and the written line is drawn', [n1, rc(), txt(blkOf(box, 'mv.export.status'))]);
    await wait(60);
    ok(rc() === n1 + 1, 'poll (' + how + '): no read after the end', rc());
  }
}

function langs() {
  const codes = ['en', 'ru', 'uk', 'zh'];
  ok(Object.keys(LE).sort().join() === codes.slice().sort().join(), 'lang: four languages');
  const keys = Object.keys(LE.en).sort().join();
  for (const c of codes) {
    ok(Object.keys(LE[c]).sort().join() === keys, 'lang ' + c + ': the same keys');
    for (const [k, v] of Object.entries(LE[c])) {
      if (!/^mapviz\.export\./.test(k) || typeof v !== 'string' || !v || /^TODO:/.test(v) || / - /.test(v) || v.indexOf(String.fromCharCode(8212)) >= 0) ok(false, 'lang ' + c + ' ' + k, v);
      if (c !== 'en' && (String(v).match(/\{\w+\}/g) || []).sort().join() !== (String(LE.en[k]).match(/\{\w+\}/g) || []).sort().join()) ok(false, 'lang ' + c + ' ' + k + ' slots', v);
      if (c !== 'en' && v === LE.en[k] && /[a-z]{4}/.test(v) && !/^\{|AS64|MoW|Gates|px|DXT/.test(v)) ok(false, 'lang ' + c + ' ' + k + ' is not translated', v);
    }
  }
  for (const m of PART.matchAll(/\btx\('([a-zA-Z0-9_.]+)'/g)) if (!m[1].endsWith('.') && !L.en[m[1]]) ok(false, 'tx key ' + m[1] + ' undefined');
  const pr = ['PRV_MOD_MISSING', 'PRV_SOURCE_MISSING', 'PRV_NO_JOURNAL', 'PRV_WORKSHOP', 'PRV_GOH_PATH', 'PRV_GOH_WORKSHOP_ID', 'PRV_MOD_REFUSED', 'PRV_NOT_A_MOD', 'PRV_PATH', 'PRV_CONFIRM', 'PRV_PLAN_CHANGED', 'PRV_SET',
    'PRV_NO_FILE_IN_GAME', 'PRV_SP_GOH_ONLY', 'PRV_FALLBACK_SOURCE', 'PRV_STRONG_ON', 'PRV_DANGER_ON', 'PRV_TITLE_GLYPHS', 'PRV_HEADER_WIDE', 'PRV_SCALEBAR_OFF', 'PRV_BAND_OUT', 'PRV_SAFE_TOP', 'PRV_SAFE_BOTTOM', 'PRV_SAFE_SIDE',
    'PRV_GOH_DESK', 'PRV_STRONGER_FILE', 'PRV_STRONGER_OTHER', 'PRV_NOT_IN_STACK', 'PRV_MOD_PAK', 'PRV_GOH_NO_MODINFO', 'PRV_UNDO_CHANGED', 'PRV_CHECK_CHANGED'];
  ok(pr.length === 32 && pr.every(c => LE.en['mapviz.export.prv.' + c]), 'every previews code has words');
  // every PRV_ code the previews part writes (guard, plan notes, compose, commit) has words and is in the page's list, so it
  // never shows as "Code PRV_..." (the GoH folder name rule, the MoW:AS2 install rule and the GoH mod info version are among them)
  const pdir = path.join(__dirname, '..', '..', '..', '..', 'mapviz', 'previews'), live = new Set();
  for (const f of fs.readdirSync(pdir)) if (/\.js$/.test(f)) for (const m of fs.readFileSync(path.join(pdir, f), 'utf8').matchAll(/'(PRV_[A-Z0-9_]+)'/g)) live.add(m[1]);
  const listM = /var PRV=\[([^\]]*)\]/.exec(PART), list = listM ? listM[1].match(/PRV_[A-Z0-9_]+/g) || [] : [];
  const noWords = [...live].filter(c => !LE.en['mapviz.export.prv.' + c] || !list.includes(c));
  ok(live.size >= 35 && !noWords.length, 'every PRV code in tools/mapviz/previews has words and is in the page list (' + live.size + ')', noWords);
  ok(['PRV_GOH_FOLDER_NAME', 'PRV_AS2_PATH', 'PRV_GOH_MODINFO_VERSION', 'PRV_GOH_ROOT_PAK', 'PRV_LOCK'].every(c => list.includes(c) && codes.every(l => LE[l]['mapviz.export.prv.' + c])), 'GoH and lock codes in four languages');
  ok(['EDSHOT_RUNNING', 'EDSHOT_NO_ROOT', 'EDSHOT_SOURCE_LOCKED', 'EDSHOT_TARGET_EXISTS'].every(c => LE.en['mapviz.export.ed.' + c]), 'editor shot codes have words');
  ok(LE.en['mapviz.export.confirm'] === "Write {n} files into the mod {mod}? A copy of each file it replaces is kept in the mod's backup folder." && LE.en['mapviz.export.undoConfirm'] === 'Put back the files of write {n}?', 'confirm texts as frozen');
  ok(/^[\x09\x0a\x20-\x7e]*$/.test(PART) && !/`|\$\{|innerHTML|\b(let|const)\s|=>/.test(PART.replace(/^[\s\S]*?String\.raw`/, '')), 'client: ASCII, ES5, no backtick, no dollar-brace, no HTML writes');
  // help
  const HL = require('../../help/lang.js');
  const hl = HL && (HL.en ? HL : HL.lang || HL);
  for (const c of codes) ok(hl[c] && typeof hl[c]['help.page.mapviz'] === 'string' && hl[c]['help.page.mapviz'].length > 20, 'help entry in ' + c);
  ok(hl.en['help.page.mapviz'] === 'Map Viewer: look at a map of AS64, MoW:AS2 or Gates of Hell: height, water, where units can go, cover and sight. Make pictures of the map and use one as its loading screen, lobby picture and minimap in your mod.', 'help entry en text');
  const hs = fs.readFileSync(path.join(__dirname, '..', '..', 'help', 'script.js'), 'utf8');
  ok(/'maps','mapviz','missions'/.test(hs), 'help: mapviz after maps in the page list');
}

(async () => {
  try { await server(); } catch (e) { ok(false, 'server section threw', (e && e.params ? JSON.stringify(e.params) + ' ' : '') + (e && e.stack)); }
  try { await page(); } catch (e) { ok(false, 'page section threw', e && e.stack); }
  try { await polls(); } catch (e) { ok(false, 'poll section threw', e && e.stack); }
  try { langs(); } catch (e) { ok(false, 'language section threw', e && e.stack); }
  SRV._t.reset();
  if (OWN) { try { fs.rmSync(SCR, { recursive: true, force: true }); } catch (e) { /* held */ } }
  if (failN) { console.log('FAIL mapviz export (' + failN + ' of ' + (pass + failN) + ')'); process.exit(1); }
  console.log('PASS mapviz export (' + pass + ')');
})();

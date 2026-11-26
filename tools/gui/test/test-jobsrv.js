// JOBS, server half (README.md "JOBS", contract 1): the job registry (joblist.js) and its use in gui.js. Loopback only, no game started.
//   node tools/gui/test/test-jobsrv.js [scratchDir]
// 1. joblist.js alone: ids, record fields, set, end (twice), cancel, cancelAll, the keep time
// 2. an extension request is a 'req' job: header id, canCancel only while a child lives, /api/cancel kills the child's tree, the request
//    answers 499 job.cancelled, a later ctx.runTool resolves cancelled at once; no child = 409 job.e.nostop; a closed client kills the child
// 3. a 'bg' job (ctx.jobs.add) outlives its request, shows progress, its cancel function is called, it leaves after the keep time;
//    a child attached with {job: handle} dies with it
// 4. /api/run jobs list with the old fields; server close kills the children
// 5. speed (same answers, less work): one request reads the registry at most once however often a route asks for the game folder;
//    GET / is sent with Content-Length from kept bytes; /api/mod (async walk) answers what the sync walk answered; the Prepare state
//    starts the mod walk in the background without changing its answer
// The made-up ext routes are added before gui.js reads the ext list (test only). The slow child is this file run with --child.
// Author: Imperator_Aug (ARSENAL, ia-5abb8c83)
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
if (process.argv[2] === '--child') {
  // the child: writes its pid to the file named, then sleeps (slow) or prints a line and exits 3 (quick)
  if (process.argv[3] === 'quick') { process.stdout.write('hi\n'); process.exit(3); }
  fs.writeFileSync(process.argv[4], String(process.pid)); process.stdout.write('started\n'); setInterval(() => {}, 1000);
  return;
}
const S = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'as2gui-jobsrv-')));
fs.mkdirSync(S, { recursive: true });
const ME = 'gui/test/test-jobsrv.js';   // under tools/, the way runTool names a tool file
const seen = {}, holds = {};
let pidN = 0;
const pidFile = () => path.join(S, 'pid' + (++pidN) + '.txt');
const EXT = require('../ext');
EXT.push({ id: 'zzjob', routes: {
  // a slow child, then a second runTool; answers ok (the dispatcher must answer 499 after a cancel all the same)
  'GET /api/x/zzjob/slow': async (u, b, ctx) => {
    seen.slowJob = ctx.job;
    seen.first = await ctx.runTool('zz', ME, ['--child', 'slow', u.searchParams.get('pf')], { timeoutMs: 600000 });   // the test cancels it: the limit is only a backstop
    const t = Date.now(); seen.second = await ctx.runTool('zz', ME, ['--child', 'slow', u.searchParams.get('pf') + '.2'], { timeoutMs: 600000 }); seen.secondMs = Date.now() - t;
    return { ok: true };
  },
  // no child: held until the test lets go
  'GET /api/x/zzjob/hold': async (u, b, ctx) => {
    const k = u.searchParams.get('k'); seen['hold' + k] = ctx.job;
    if (u.searchParams.get('mark')) { ctx.job.set({ what: 'job.w.test', whatP: { n: 2 } }); ctx.job.writes = true; }
    await new Promise(r => { holds[k] = r; });
    return { ok: true, id: ctx.job.id };
  },
  // asks for the game folders many times, the way the bots routes do
  'GET /api/x/zzjob/games': async (u, b, ctx) => { const a = new Set(), g = new Set(), c = new Set(); for (let i = 0; i < 50; i++) { a.add(ctx.game()); g.add(ctx.gohDir()); c.add(ctx.curDir()); } return { game: [...a], goh: [...g], cur: [...c] }; },
  'GET /api/x/zzjob/quick': async (u, b, ctx) => { seen.quickJob = ctx.job; return { r: await ctx.runTool('zz', ME, ['--child', 'quick']) }; },
  'GET /api/x/zzjob/boom': async (u, b, ctx) => { seen.boomJob = ctx.job; throw Object.assign(new Error('no good'), { status: 400 }); },
  // a background job with its own cancel function
  'POST /api/x/zzjob/bg': async (u, b, ctx) => {
    const h = ctx.jobs.add({ kind: 'bg', what: 'job.w.test', whatP: { n: 1 }, page: 'maps', game: ctx.gameId(), writes: true, cancel: () => { seen.bgCancel = (seen.bgCancel || 0) + 1; } });
    h.set({ stage: 'half', done: 3, total: 10 }); seen.bg = h;
    return { id: h.id };
  },
  // a background job that owns a child ({job: handle}); no cancel function of its own
  'POST /api/x/zzjob/bgkid': async (u, b, ctx) => {
    const h = ctx.jobs.add({ id: b.id, kind: 'bg', what: 'job.w.kid', page: 'mapviz' }); seen.bgk = h;
    ctx.runTool('zz', ME, ['--child', 'slow', b.pf], { timeoutMs: 600000, job: h }).then(r => { seen.bgkRes = r; h.end(); });
    return { id: h.id };
  },
} });
const gui = require('../gui'), joblist = require('../joblist');

let pass = 0, failN = 0;
const ok = (c, m, extra) => { if (c) pass++; else { failN++; console.log('FAIL ' + m + (extra !== undefined ? '\n  ' + String(extra).slice(0, 600) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const alive = pid => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const W = require('../../lib/test/wait');
// backstop at least 60 s (WAIT line), only then a miss is reported. Backup, never a hang
async function waitFor(fn, what, ms = 8000) { const v = await W.until(fn, { who: 'test-jobsrv', what, ms, step: 40 }); if (!v) { ok(false, 'waited too long for ' + what); return null; } return v; }
const pidIn = f => { try { return Number(fs.readFileSync(f, 'utf8')) || 0; } catch (e) { return 0; } };
// -> {done: Promise<{status, j, text}>, abort()}
function open(port, method, p, o = {}) {
  let r;
  const done = new Promise(resolve => {
    const headers = Object.assign({ host: '127.0.0.1:' + port }, o.headers || {});
    let body = null; if (method === 'POST') { body = JSON.stringify(o.body || {}); headers['content-type'] = 'application/json'; }
    r = http.request({ host: '127.0.0.1', port, method, path: p, headers }, res => {
      let t = ''; res.setEncoding('utf8'); res.on('data', d => { t += d; }); res.on('end', () => { let j = null; try { j = JSON.parse(t); } catch (e) { /* text */ } resolve({ status: res.statusCode, text: t, j }); });
      res.on('error', () => resolve({ status: 0, text: 'aborted' }));
    });
    r.on('error', e => resolve({ status: 0, text: e.message }));
    if (body) r.write(body); r.end();
  });
  return { done, abort: () => r.destroy() };
}
const req = (port, method, p, o) => open(port, method, p, o).done;
const list = async port => ((await req(port, 'GET', '/api/jobs')).j || {}).jobs || [];
const FIELDS = ['id', 'kind', 'what', 'whatP', 'page', 'game', 'state', 'stage', 'done', 'total', 'startedMs', 'endedMs', 'canCancel', 'writes', 'cmd', 'interactive'];

(async () => {
  // ===== 1. joblist.js alone
  {
    const J = joblist.create({ keepMs: 150 });
    let stops = 0;
    const a = J.add({ id: 'mine01', kind: 'bg', what: 'k', cancel: () => { stops++; return Promise.reject(new Error('late')); } }), b = J.add({ kind: 'bg', what: 'k2' }), c = J.add({ id: 'mine01', kind: 'req' });
    ok(a.id === 'mine01' && /^b/.test(b.id) && /^b/.test(c.id) && c.id !== b.id, 'joblist: the given id, else b..; an id in use gets a made one', [a.id, b.id, c.id].join(' '));
    const l = J.list();
    ok(l.length === 3 && l[0].id === 'mine01' && l[2].id === c.id && l.every(r => FIELDS.every(f => f in r) && Object.keys(r).length === FIELDS.length), 'joblist: list has every field of the record, newest last', JSON.stringify(l[0]));
    ok(l[0].canCancel === true && l[1].canCancel === false && l[0].state === 'running' && l[0].done === null && l[0].cmd === '' && l[0].interactive === false && l[0].game === 'as64', 'joblist: canCancel follows the cancel function; defaults');
    a.set({ stage: 's', done: 1, total: 4, what: 'k3', whatP: { x: 1 } });
    const r1 = J.list()[0]; ok(r1.stage === 's' && r1.done === 1 && r1.total === 4 && r1.what === 'k3' && r1.whatP.x === 1, 'joblist: set() shows in the list');
    ok(J.cancel('nope') === false && J.cancel('mine01') === true && stops === 1 && a.cancelled === true && J.get('mine01') === a, 'joblist: cancel calls the stop function (a rejected promise is harmless) and marks the handle');
    a.end(); a.end('failed'); ok(J.list()[0].state === 'cancelled' && typeof J.list()[0].endedMs === 'number' && J.list()[0].canCancel === false, 'joblist: end() after a cancel = cancelled; a second end changes nothing');
    ok(J.cancel('mine01') === false, 'joblist: a finished job cannot be cancelled');
    b.end('failed'); let hooks = 0; c.onCancel(() => { hooks++; }); J.cancelAll(); ok(hooks === 1 && c.cancelled && !b.cancelled, 'joblist: cancelAll stops the running jobs only');
    ok(J.list().length === 3, 'joblist: finished jobs stay listed for the keep time');
    await W.until(() => J.list().length === 1, { who: 'test-jobsrv', what: 'finished jobs leave after the keep time', step: 20 }); ok(J.list().length === 1 && J.get('mine01') === null, 'joblist: and leave after it', JSON.stringify(J.list()));
    c.end();
  }

  const A = await gui.start({ port: 0, cwd: S, tmpRoot: path.join(S, 'tmp'), jobKeepMs: 600, spawnHook: () => ({ file: process.execPath, args: ['-e', 'setInterval(function(){},1000)'] }) });
  const P = A.port;
  let closed = false;
  try {
    ok((await list(P)).length === 0, 'jobs: empty when idle');
    // ===== 2. an extension request
    let pf = pidFile();
    let s = open(P, 'GET', '/api/x/zzjob/slow?pf=' + encodeURIComponent(pf), { headers: { 'x-arsenal-job': 'page_job-01', 'x-arsenal-game': 'goh' } });
    const pid1 = await waitFor(() => pidIn(pf), 'the slow child');
    let jl = await list(P), j0 = jl[0] || {};
    ok(jl.length === 1 && j0.kind === 'req' && j0.id === 'page_job-01' && j0.canCancel === true && j0.state === 'running' && j0.game === 'goh' && j0.what === '' && j0.cmd === '' && j0.interactive === false && FIELDS.every(f => f in j0),
      'req: a slow child behind an ext route is listed (kind req, the header id, canCancel, game)', JSON.stringify(jl));
    ok(alive(pid1), 'req: the child runs');
    const tc = Date.now();
    let r = await req(P, 'POST', '/api/cancel', { body: { id: 'page_job-01' } }); ok(r.status === 200 && r.j.ok === true, 'cancel: 200 ok', r.text);
    r = await s.done; const took = Date.now() - tc;
    ok(r.status === 499 && r.j && r.j.error === 'cancelled' && r.j.key === 'job.cancelled', 'cancel: the request answers 499 job.cancelled whatever the handler returned', r.status + ' ' + r.text);
    ok(took < 60000, 'cancel: the request ends long before the child limit (under 60 s; it used to take 2 s at most)', took + ' ms');
    await waitFor(() => !alive(pid1), 'the cancelled child to go'); ok(!alive(pid1), 'cancel: the child process is gone');
    ok(seen.first && seen.first.cancelled === true && seen.first.code === null && seen.first.timedOut === false && /started/.test(seen.first.stdout) && typeof seen.first.stderr === 'string', 'cancel: runTool resolves {code:null, stdout, stderr, timedOut:false, cancelled:true}', JSON.stringify(seen.first));
    ok(seen.second && seen.second.cancelled === true && seen.second.code === null && seen.secondMs < 60000 && !fs.existsSync(pf + '.2'), 'cancel: a second ctx.runTool resolves cancelled at once, no child started', seen.secondMs + ' ms ' + JSON.stringify(seen.second));
    ok(seen.slowJob.state === 'cancelled' && seen.slowJob.cancelled === true, 'cancel: the request job ends cancelled', seen.slowJob.state);
    ok((await req(P, 'POST', '/api/cancel', { body: { id: 'page_job-01' } })).status === 404, 'cancel: a finished job 404');
    ok((await req(P, 'POST', '/api/cancel', { body: { id: 'nope' } })).status === 404 && (await req(P, 'POST', '/api/cancel', { body: {} })).status === 404, 'cancel: an unknown or missing id 404');
    ok((await list(P)).length === 0, 'req: a finished request leaves the list');

    // the client goes away
    pf = pidFile(); s = open(P, 'GET', '/api/x/zzjob/slow?pf=' + encodeURIComponent(pf));
    const pid2 = await waitFor(() => pidIn(pf), 'the slow child (client close)');
    jl = await list(P); ok(jl.length === 1 && /^x/.test(jl[0].id) && jl[0].kind === 'req', 'req: no header = an id the server makes (x..)', JSON.stringify(jl));
    s.abort(); await waitFor(() => !alive(pid2), 'the child to go after the client left'); ok(!alive(pid2), 'client close: the child is killed');
    await waitFor(async () => !(await list(P)).length, 'the list to empty after the client left'); ok(seen.slowJob.state === 'cancelled', 'client close: the request job ends cancelled', seen.slowJob.state);

    // no child: not cancellable
    const h1 = open(P, 'GET', '/api/x/zzjob/hold?k=1&mark=1', { headers: { 'x-arsenal-job': 'hold-one' } });
    await waitFor(() => holds['1'], 'held request 1');
    const h2 = open(P, 'GET', '/api/x/zzjob/hold?k=2', { headers: { 'x-arsenal-job': 'hold-one' } }), h3 = open(P, 'GET', '/api/x/zzjob/hold?k=3', { headers: { 'x-arsenal-job': 'bad id' } });
    await waitFor(() => holds['2'] && holds['3'], 'held requests 2 and 3');
    jl = await list(P); const jh = jl.find(x => x.id === 'hold-one') || {};
    ok(jl.length === 3 && jh.kind === 'req' && jh.canCancel === false && jh.state === 'running', 'req: a request with no child lists canCancel false', JSON.stringify(jl));
    ok(jh.what === 'job.w.test' && jh.whatP && jh.whatP.n === 2 && jh.writes === true, 'req: ctx.job.set({what, whatP}) and ctx.job.writes show in the list', JSON.stringify(jh));
    ok(jl.filter(x => /^x/.test(x.id)).length === 2 && jl[0].id === 'hold-one' && jl.slice(1).some(x => x.id === seen.hold3.id), 'req: a header id in use or badly formed gets a made id; the first request is listed first', jl.map(x => x.id).join(' '));
    r = await req(P, 'POST', '/api/cancel', { body: { id: 'hold-one' } });
    ok(r.status === 409 && r.j && r.j.key === 'job.e.nostop' && typeof r.j.error === 'string', 'cancel: 409 job.e.nostop when the job cannot be stopped', r.status + ' ' + r.text);
    holds['1'](); holds['2'](); holds['3']();
    r = await h1.done; ok(r.status === 200 && r.j.ok === true && r.j.id === 'hold-one' && seen.hold1.state === 'done', 'req: it goes on and ends done', r.text + ' ' + seen.hold1.state);
    await h2.done; await h3.done;

    // the old runTool shape; a failed request
    r = await req(P, 'GET', '/api/x/zzjob/quick'); const q = r.j && r.j.r;
    ok(q && q.code === 3 && q.stdout === 'hi\n' && q.stderr === '' && q.timedOut === false && q.cancelled === false && seen.quickJob.state === 'done' && seen.quickJob.canCancel === false, 'runTool: {code, stdout, stderr, timedOut} as before, cancelled false', r.text);
    r = await req(P, 'GET', '/api/x/zzjob/boom'); ok(r.status === 400 && r.j.error === 'no good' && seen.boomJob.state === 'failed', 'req: a thrown error ends the job failed, the answer is as before', r.text + ' ' + seen.boomJob.state);

    // ===== 3. background jobs
    r = await req(P, 'POST', '/api/x/zzjob/bg', { headers: { 'x-arsenal-game': 'mowas2' } }); const bid = r.j && r.j.id;
    jl = await list(P); let jb = jl[0] || {};
    ok(jl.length === 1 && jb.id === bid && /^b/.test(bid) && jb.kind === 'bg' && jb.state === 'running' && jb.what === 'job.w.test' && jb.whatP.n === 1 && jb.page === 'maps' && jb.game === 'mowas2' && jb.writes === true && jb.canCancel === true,
      'bg: a job added through ctx.jobs.add outlives its request', JSON.stringify(jl));
    ok(jb.stage === 'half' && jb.done === 3 && jb.total === 10, 'bg: progress from set()', JSON.stringify(jb));
    seen.bg.set({ done: 7 }); ok((await list(P))[0].done === 7, 'bg: later progress shows too');
    r = await req(P, 'POST', '/api/cancel', { body: { id: bid } });
    ok(r.status === 200 && seen.bgCancel === 1 && seen.bg.cancelled === true, 'bg: /api/cancel calls its cancel function and marks the handle', r.text + ' ' + seen.bgCancel);
    ok((await list(P))[0].state === 'running', 'bg: it stays running until its owner ends it');
    seen.bg.end(); const tEnd = Date.now();
    jb = (await list(P))[0] || {}; ok(jb.state === 'cancelled' && typeof jb.endedMs === 'number' && jb.canCancel === false, 'bg: ended after a cancel = cancelled, still listed', JSON.stringify(jb));
    ok((await req(P, 'POST', '/api/cancel', { body: { id: bid } })).status === 404, 'bg: a finished job 404');
    await waitFor(async () => !(await list(P)).length, 'the finished job to leave', 4000);
    const gone = Date.now() - tEnd; ok(gone >= 500 && gone < 60000, 'bg: a finished job leaves the list after the keep time (600 ms here)', gone + ' ms');

    pf = pidFile(); r = await req(P, 'POST', '/api/x/zzjob/bgkid', { body: { id: 'kid-job-1', pf } });
    const pid3 = await waitFor(() => pidIn(pf), 'the background child');
    jl = await list(P); jb = jl[0] || {};
    ok(r.j.id === 'kid-job-1' && jl.length === 1 && jb.id === 'kid-job-1' && jb.kind === 'bg' && jb.page === 'mapviz' && jb.canCancel === true, 'bg: a child attached with {job: handle} makes the job cancellable; its request is over', JSON.stringify(jl));
    r = await req(P, 'POST', '/api/cancel', { body: { id: 'kid-job-1' } }); ok(r.status === 200, 'bg child: cancel 200', r.text);
    await waitFor(() => seen.bgkRes, 'the background runTool to resolve');
    ok(seen.bgkRes && seen.bgkRes.cancelled === true && seen.bgkRes.code === null && !alive(pid3) && seen.bgk.state === 'cancelled', 'bg child: killed, runTool resolves cancelled, the job ends cancelled', JSON.stringify(seen.bgkRes));
    await waitFor(async () => !(await list(P)).length, 'the list to empty', 4000);

    // ===== 4. /api/run jobs: the old fields
    const run = open(P, 'POST', '/api/run', { body: { cmd: 'check', input: { mod: S, fast: true } }, headers: { 'x-arsenal-game': 'mowas2' } });
    jl = await waitFor(async () => { const l = await list(P); return l.length ? l : null; }, 'the run job');
    const jr = (jl || [])[0] || {};
    ok(jl && jl.length === 1 && /^r/.test(jr.id) && jr.cmd === 'check' && jr.interactive === false && typeof jr.startedMs === 'number' && jr.game === 'mowas2', 'run: listed with the old fields id, cmd, interactive, startedMs, game', JSON.stringify(jl));
    ok(jr.kind === 'run' && jr.state === 'running' && jr.canCancel === true && FIELDS.every(f => f in jr), 'run: and the new ones (kind run, canCancel)');
    ok((await req(P, 'POST', '/api/answer', { body: { id: jr.id, answer: { a: 1 } } })).status === 400 && (await req(P, 'POST', '/api/answer', { body: { id: 'kid-job-1', answer: {} } })).status === 404, 'answer: run jobs only, as before');
    r = await req(P, 'POST', '/api/cancel', { body: { id: jr.id } }); ok(r.status === 200, 'run: cancel 200');
    r = await run.done; ok(/"cancelled":true/.test(r.text), 'run: the end event says cancelled', r.text.slice(-200));
    await waitFor(async () => !(await list(P)).length, 'the run job to leave'); ok((await list(P)).length === 0, 'run: gone from the list when it ends');

    // ===== 5. speed: same answers, less work
    {
      const gd = require('../../lib/gamedir'), wr = require('../../lib/winreg'), win = process.platform === 'win32';
      const st = path.join(S, 'steam'), as2 = path.join(st, 'steamapps', 'common', gd.FOLDER), goh = path.join(st, 'steamapps', 'common', gd.GOH_FOLDER), envGame = path.join(S, 'envgame');
      for (const d of [as2, goh, envGame]) fs.mkdirSync(d, { recursive: true });
      const keep = {}; for (const k of ['AS2_GAME', 'GOH_GAME', 'AS2_NO_STEAM']) { keep[k] = process.env[k]; delete process.env[k]; }
      const realRead = wr.readValue; let regN = 0;
      wr.readValue = (key, name, o) => { if (/Valve.Steam$/i.test(key)) { regN++; return st; } return realRead(key, name, o); };   // the registry reader, counted; never the real Steam key
      try {
        // an as2.json above the working dir would answer before Steam: then only the checks that do not need Steam run
        const steam = win && gd.findJson(process.cwd(), x => { try { return fs.readFileSync(x, 'utf8'); } catch (e) { return null; } }) === null;
        gd.defaultReg.forget(); regN = 0;
        let r = await req(P, 'GET', '/api/x/zzjob/games');
        if (steam) ok(regN === 1 && r.j.game.length === 1 && r.j.game[0] === as2 && r.j.goh.length === 1 && r.j.goh[0] === goh && r.j.cur[0] === as2, 'speed: 150 asks for the game folders in one request = one registry read, the Steam answers as before', regN + ' ' + r.text);
        r = await req(P, 'GET', '/api/x/zzjob/games', { headers: { 'x-arsenal-game': 'goh' } });
        if (steam) ok(regN === 1 && r.j.cur.length === 1 && r.j.cur[0] === goh, 'speed: the next request within the keep time reads no registry; under goh the folder of the request is the GoH one', regN + ' ' + r.text);
        gd.defaultReg.forget(); r = await req(P, 'GET', '/api/x/zzjob/games');
        if (steam) ok(regN === 2, 'speed: a forgotten registry answer is read again, once', regN);
        if (steam) ok(gd.resolve({}).dir === as2 && gd.resolve({ readReg: () => null }).dir === null && gd.resolve({}).dir === as2 && regN === 2, 'gamedir: an injected reader is asked every time and is never the kept answer');
        r = await req(P, 'GET', '/api/x/zzjob/games?game=' + encodeURIComponent(path.join(S, 'no such game')));
        ok(r.j.game.length === 1 && r.j.game[0] === path.join(S, 'no such game'), 'speed: ?game= is the folder as given, unchecked, as before', r.text);
        process.env.AS2_GAME = envGame; r = await req(P, 'GET', '/api/x/zzjob/games'); delete process.env.AS2_GAME;
        ok(r.j.game.length === 1 && r.j.game[0] === envGame, 'speed: AS2_GAME wins over Steam, as before', r.text);
        r = await req(P, 'GET', '/api/game'); ok(steam ? r.j.dir === as2 && r.j.source === 'steam' : r.status === 200, 'speed: /api/game says the same folder and source', r.text);
      } finally { wr.readValue = realRead; gd.defaultReg.forget(); for (const k of Object.keys(keep)) { if (keep[k] === undefined) delete process.env[k]; else process.env[k] = keep[k]; } }

      // GET /: the kept bytes, with their length, every header as before, the same text each time
      const raw = p => new Promise(resolve => { http.get({ host: '127.0.0.1', port: P, path: p, headers: { host: '127.0.0.1:' + P } }, res => { const b = []; res.on('data', d => b.push(d)); res.on('end', () => resolve({ status: res.statusCode, h: res.headers, body: Buffer.concat(b) })); }); });
      const p1 = await raw('/'), p2 = await raw('/'), page = require('../page');
      ok(p1.status === 200 && p1.body.equals(Buffer.from(page, 'utf8')) && p2.body.equals(p1.body), 'page: GET / is the page text, byte for byte, each time');
      ok(Number(p1.h['content-length']) === p1.body.length && !p1.h['transfer-encoding'] && p1.h['content-type'] === 'text/html; charset=utf-8' && p1.h['cache-control'] === 'no-store' && p1.h['x-content-type-options'] === 'nosniff', 'page: sent with Content-Length and the headers it always had', JSON.stringify(p1.h));
      await A.setRemote(true); const p3 = await raw('/'), p4 = await raw('/'); await A.setRemote(false); const p5 = await raw('/');
      const want = page.replace('<script>', () => '<script>window.AS2CFG=' + JSON.stringify({ live: false, dev: false, rOn: true }) + ';</script><script>');
      ok(p3.body.equals(Buffer.from(want, 'utf8')) && p4.body.equals(p3.body) && Number(p3.h['content-length']) === p3.body.length && p5.body.equals(p1.body), 'page: the LAN Remote variant has its own kept bytes; the plain page comes back after');

      // /api/mod: the async walk answers what the sync walk did (reference = the walk as it was)
      const md = path.join(S, 'walkmod-' + Date.now().toString(36)); let n = 0;   // a new folder each run: the kept walk of an earlier run (scratch given) is not this one's
      const put = (rel, size) => { const x = path.join(md, ...rel.split('/')); fs.mkdirSync(path.dirname(x), { recursive: true }); fs.writeFileSync(x, Buffer.alloc(size, 97)); n++; };
      put('mod.info', 40); put('resource/set/a.set', 10); put('resource/set/deep/x/y/z.inc', 7); put('resource/entity/t/tank.def', 1234); put('localization/en/a.lng', 5); put('1.pat', 99);
      for (let i = 0; i < 70; i++) put('resource/map/m' + i + '/0.mi', i + 1);
      fs.mkdirSync(path.join(md, 'empty', 'dir'), { recursive: true });
      const syncWalk = dir => {
        let files = 0, bytes = 0; const stack = [dir], top = [];
        while (stack.length) {
          const d = stack.pop(), ents = fs.readdirSync(d, { withFileTypes: true });
          for (const e of ents) {
            const rel = path.relative(dir, path.join(d, e.name)).split(path.sep).join('/');
            if (rel.split('/').length <= 3 && top.length < 200) top.push(e.isDirectory() ? rel + '/' : rel);
            if (e.isDirectory()) stack.push(path.join(d, e.name)); else if (e.isFile()) { files++; bytes += fs.statSync(path.join(d, e.name)).size; }
          }
        }
        return { files, bytes, tree: top.sort() };
      };
      const ref = syncWalk(md), m1 = await req(P, 'GET', '/api/mod?dir=' + encodeURIComponent(md));
      ok(m1.status === 200 && m1.j.files === n && m1.j.files === ref.files && m1.j.bytes === ref.bytes && JSON.stringify(m1.j.tree) === JSON.stringify(ref.tree) && m1.j.truncated === false && m1.j.hasInfo === true && m1.j.path === md && !('note' in m1.j),
        'mod: the async walk gives the files, bytes and tree of the sync walk', m1.text.slice(0, 400) + ' vs ' + JSON.stringify(ref).slice(0, 300));
      ok(ref.tree.includes('resource/set/deep/') && ref.tree.includes('empty/dir/') && !ref.tree.some(x => x.split('/').filter(Boolean).length > 3), 'mod: the tree keeps its three levels', ref.tree.length);
      ok((await req(P, 'GET', '/api/mod?dir=' + encodeURIComponent(path.join(S, 'nope')))).status === 404 && (await req(P, 'GET', '/api/mod?dir=' + encodeURIComponent(path.parse(S).root))).status === 400 && (await req(P, 'GET', '/api/mod?dir=rel')).status === 400, 'mod: no folder 404, a drive root 400, a relative path 400, as before');

      // the Prepare state: the answer is the one before any walk, and the walk of the named mod starts behind it
      const mt = require('../../lib/modtree');
      ok(mt.last(md) === null, 'prep: no walk of the mod yet');
      const ps = await req(P, 'GET', '/api/x/prep/state?mod=' + encodeURIComponent(md)), row = ((ps.j || {}).sections || []).find(x => x.id === 'mod.tree') || {};
      ok(ps.status === 200 && ps.j.mod === md && row.state === 'none' && row.at === null, 'prep: state answers before the walk (mod.tree not made)', JSON.stringify(row));
      const T = await waitFor(() => mt.fresh(md), 'the early walk of the mod', 6000);
      ok(T && T.count === n, 'prep: the walk started by state finishes in the background', T && T.count);
      const at = T && T.at; await req(P, 'GET', '/api/x/prep/state?mod=' + encodeURIComponent(md)); await sleep(150);
      ok(mt.fresh(md) && mt.fresh(md).at === at, 'prep: a later state does not walk again');
      const p0 = await req(P, 'GET', '/api/x/prep/state'); ok(p0.status === 200 && p0.j.mod === '', 'prep: no mod named = nothing to walk');
      await waitFor(async () => !(await list(P)).length, 'the list to empty after the speed checks', 4000);
    }

    // server close: children of a request and of a background job die
    const pfa = pidFile(), pfb = pidFile();
    s = open(P, 'GET', '/api/x/zzjob/slow?pf=' + encodeURIComponent(pfa)); seen.bgkRes = null;
    await req(P, 'POST', '/api/x/zzjob/bgkid', { body: { pf: pfb } });
    const pa = await waitFor(() => pidIn(pfa), 'child a'), pb = await waitFor(() => pidIn(pfb), 'child b');
    ok(alive(pa) && alive(pb), 'close: two children run');
    await A.close(); closed = true;
    await waitFor(() => !alive(pa) && !alive(pb), 'the children to go on server close'); ok(!alive(pa) && !alive(pb), 'close: the server kills the children of its jobs');
    await s.done;
  } catch (e) { ok(false, 'threw: ' + (e && e.stack || e)); }
  finally { for (const k of Object.keys(holds)) try { holds[k](); } catch (e) { /* done */ } if (!closed) await A.close(); }
  if (!process.argv[2]) { try { fs.rmSync(S, { recursive: true, force: true }); } catch (e) { /* scratch */ } }
  console.log(failN ? 'FAIL jobsrv: ' + failN + ' of ' + (pass + failN) + ' checks failed' : 'PASS jobsrv: ' + pass + ' checks');
  process.exit(failN ? 1 : 0);
})();

// The Editor in the job list of the footer (tools/gui/README.md "JOBS"): the whole-mod check as one background job with Cancel, the
// paged walks and usages as one named row, the inbox long poll never listed, a stopped request shown as a plain state.
// Run by tools/gui/ext/ide/test.js (hook at its end, or alone: IDE_ONLY=joblist node tools/gui/ext/ide/test.js <scratch>).
// module.exports = async function(env){}. Loopback only for the server part; nothing is launched, nothing written outside <scratch>.
// Author: Imperator_Aug (ARSENAL, ia-8e8d290e)
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');

module.exports = async function (env) {
  const { boot, R, PENDING } = env;
  const ok = (c, m, x) => env.ok(c, c || x === undefined ? m : m + ' [' + String(x).slice(0, 500) + ']');
  const wr = (f, b) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, b); };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const EN = {}; for (const r of require('./lang/jump').concat(require('./lang/core'))) EN[r[0]] = r[1];
  const fill = (k, p) => String(EN[k] || k).replace(/\{(\w+)\}/g, (m, n) => (p && p[n] != null ? String(p[n]) : m));
  const joblist = require('../../joblist');
  for (const f of ['lang/core.js', 'lang/jump.js']) for (const r of require('./' + f)) if (/^ide\.(job\.|j\.stopped)/.test(r[0])) ok(r.length === 5 && r.slice(1).every(s => typeof s === 'string' && s.trim()), 'joblist lang: ' + r[0] + ' has en, ru, uk, zh');

  const W = env.scratch('joblist'), game = path.join(W, 'game'), mod = path.join(game, 'mods', 'mine');
  wr(path.join(game, 'as64.exe'), 'MZ');
  wr(path.join(game, 'resource', 'set', 'van.set'), '{v 1}\r\n');
  wr(path.join(mod, 'mod.info'), '{mod {name "Mine"}}\r\n');
  const files = { 'resource/set/a.set': '{x 1\r\n', 'resource/set/b.set': '{y 1}}\r\n', 'resource/set/ok.set': '{z 1}\r\n' };
  for (const k of Object.keys(files)) wr(path.join(mod, k), files[k]);

  // ================================================================ routes over a real registry
  {
    const jobs = joblist.create({ keepMs: 60000 });
    const base = Object.assign({}, env.ctx, { game: () => game, tmpRoot: path.join(W, 'tmp'), jobs, gameId: () => 'mowas2' });
    const mk = () => Object.assign({}, base, { job: jobs.add({ kind: 'req', what: '', canCancel: false, keepMs: 0 }) });
    const bg = () => jobs.list().filter(j => j.kind === 'bg');
    const run = async (b) => { let r = null; for (let i = 0; i < 400; i++) { const c = mk(); r = await env.post('modcheck', Object.assign({ mod, from: 0 }, b), c); c.job.end(); if (r.done || r.stopped) break; await sleep(5); } return r; };
    R._reset();
    // ---- one background job per check, however many slice requests
    const c0 = mk(), r0 = await env.post('modcheck', { mod, from: 0 }, c0);
    let L = bg();
    ok(L.length === 1 && L[0].what === 'job.w.modcheck' && L[0].page === 'ide' && L[0].game === 'mowas2' && L[0].state === 'running' && L[0].canCancel === true && L[0].writes === false,
      'joblist check: a whole-mod check is one background job (job.w.modcheck, page ide, the request\'s game, can be stopped, writes nothing)', JSON.stringify(L));
    ok(c0.job.hidden === true && !jobs.list().some(j => j.id === c0.job.id), 'joblist check: the slice request itself is not listed');
    c0.job.end();
    const r1 = await run({ job: r0.job });
    L = bg();
    ok(r1.done && r1.job === r0.job && L.length === 1 && L[0].state === 'done' && L[0].done === r1.total && L[0].total === 3, 'joblist check: the row ends done with files checked / files; its slice requests added no row', JSON.stringify(L));
    ok(jobs.list().filter(j => j.kind === 'req').length === 0, 'joblist check: no slice request is left in the list');
    // ---- Cancel in the list: the next slice request says stopped, the row ends cancelled, a new ask starts a new check
    const r2 = await env.post('modcheck', { mod, from: 0, again: true }, mk());
    const row2 = bg().find(j => j.state === 'running');
    ok(r2.job !== r0.job && row2 && bg().length === 2, 'joblist check: again:true starts a new check with its own row', JSON.stringify(bg()));
    ok(jobs.cancel(row2.id) === true, 'joblist check: the registry stops a running check');
    const r3 = await env.post('modcheck', { mod, from: 0, job: r2.job }, mk());
    ok(r3.stopped === true && r3.done === false && r3.job === r2.job, 'joblist check: after Cancel the next slice request answers stopped:true, done:false', JSON.stringify({ s: r3.stopped, d: r3.done }));
    ok(bg().find(j => j.id === row2.id).state === 'cancelled', 'joblist check: the stopped check\'s row ends cancelled', JSON.stringify(bg()));
    await sleep(30);
    const r3b = await env.post('modcheck', { mod, from: 0, job: r2.job }, mk());
    ok(r3b.stopped === true && r3b.done === false, 'joblist check: a stopped check stays stopped for its page (never done)');
    const r4 = await run({});
    ok(r4.done && !r4.stopped && r4.job !== r2.job && bg().filter(j => j.state === 'running').length === 0 && bg().length === 3, 'joblist check: a new ask after the stop starts a new check, which ends done', JSON.stringify(bg().map(j => j.state)));
    // ---- stop:true (the page left the mod): the walk stops, nothing is started
    const r5 = await env.post('modcheck', { mod, from: 0, again: true }, mk());
    const n5 = bg().length;
    const r6 = await env.post('modcheck', { mod, job: r5.job, stop: true }, mk());
    ok(r6.stopped === true && r6.job === r5.job && bg().length === n5 && bg().filter(j => j.state === 'running').length === 0, 'joblist check: stop:true stops the running check and starts none', JSON.stringify(bg().map(j => j.state)));
    const r7 = await env.post('modcheck', { mod, job: 'mc-other', stop: true }, mk());
    ok(r7.stopped === true && bg().length === n5, 'joblist check: stop:true for another job id changes nothing');
    // ---- a replaced check and a reset end their rows
    await env.post('modcheck', { mod, from: 0, again: true }, mk());
    await env.post('modcheck', { mod, from: 0, again: true }, mk());
    ok(bg().filter(j => j.state === 'running').length <= 1, 'joblist check: a check replaced by a new one ends its row', JSON.stringify(bg().map(j => j.state)));
    R._reset();
    ok(bg().filter(j => j.state === 'running').length === 0, 'joblist check: no row is left running when the checks are dropped', JSON.stringify(bg().map(j => j.state)));
    // ---- without a registry (older server, tests): the check works as before
    const plain = Object.assign({}, env.ctx, { game: () => game, tmpRoot: path.join(W, 'tmp') });
    let rp = null; for (let i = 0; i < 400; i++) { rp = await env.post('modcheck', { mod, from: 0 }, plain); if (rp.done) break; await sleep(5); }
    ok(rp && rp.done && rp.total === 3, 'joblist check: a server without the registry still checks the mod');
    R._reset();

    // ---- paged walks: the first page is named, a later page is not listed
    const named = async (name, q, what) => {
      const a = mk(); await env.get(name, Object.assign({ mod, lim: '1' }, q), a);
      ok(a.job.what === what && a.job.page === 'ide' && a.job.hidden !== true, 'joblist walk: the first page of ' + name + ' is named ' + what, JSON.stringify({ w: a.job.what, p: a.job.page, h: a.job.hidden }));
      const b = mk(); await env.get(name, Object.assign({ mod, lim: '1', off: '1' }, q), b);
      ok(b.job.hidden === true && !jobs.list().some(j => j.id === b.job.id), 'joblist walk: a later page of ' + name + ' is not listed');
      a.job.end(); b.job.end();
      return a.job;
    };
    await named('tree', {}, 'ide.job.tree');
    const jv = await named('vdir', { dir: 'set' }, 'ide.job.vdir');
    ok(jv.whatP && jv.whatP.p === 'resource/set', 'joblist walk: the folder row carries its game path', JSON.stringify(jv.whatP));
    const jf = await named('vfind', { q: 'set' }, 'ide.job.vfind');
    ok(jf.whatP && jf.whatP.q === 'set', 'joblist walk: the search row carries its word', JSON.stringify(jf.whatP));

    // ---- usages: named, stoppable (Cancel and a page that went away abort the sliced scan)
    const real = require('../../../ide/intel');
    let sig = null, closeFn = null;
    R._setIntel(Object.assign({}, real, { refsAsync: (doc, pos, ictx, o) => new Promise(res => { sig = o && o.signal; if (!sig) return res({ name: 'x', kind: 'text', hits: [], truncated: false }); sig.addEventListener('abort', () => res({ name: 'x', kind: 'text', hits: [], truncated: true, why: 'abort' })); }) }));
    const cr = Object.assign(mk(), { onClose: fn => { closeFn = fn; } });
    const pr = env.post('refs', { mod, name: 'x' }, cr);
    await sleep(10);
    ok(cr.job.what === 'ide.job.refs' && cr.job.page === 'ide' && cr.job.canCancel === true && jobs.list().find(j => j.id === cr.job.id).canCancel === true, 'joblist usages: the request is named and can be stopped', JSON.stringify(jobs.list().find(j => j.id === cr.job.id)));
    ok(jobs.cancel(cr.job.id) === true && sig && sig.aborted === true, 'joblist usages: Cancel aborts the scan');
    const rr = await pr;
    ok(rr && rr.why === 'abort', 'joblist usages: the stopped scan answers at once', JSON.stringify(rr));
    cr.job.end();
    const cr2 = Object.assign(mk(), { onClose: fn => { closeFn = fn; } }); sig = null; closeFn = null;
    const pr2 = env.post('refs', { mod, name: 'x' }, cr2);
    await sleep(10);
    ok(typeof closeFn === 'function' && sig && !sig.aborted, 'joblist usages: the request watches for a page that went away');
    if (closeFn) closeFn();
    ok(sig && sig.aborted === true && (await pr2).why === 'abort', 'joblist usages: a page that went away stops the scan');
    cr2.job.end();
    R._setIntel(null);
    // no Editor route writes into the mod (the writes are ext/files routes): nothing here marks writes
    ok(Object.keys(files).every(k => fs.readFileSync(path.join(mod, k), 'utf8') === files[k]), 'joblist routes: the mod was only read');
  }

  // ================================================================ the real server: what GET /api/jobs shows
  {
    const gui = require('../../gui');
    const A = await gui.start({ port: 0, cwd: W, tmpRoot: path.join(W, 'srvtmp'), jobKeepMs: 60000 });
    const P = A.port || (A.server && A.server.address().port);
    const open = (method, p, o) => {
      o = o || {}; let rq = null;
      const done = new Promise((res, rej) => {
        const data = o.body === undefined ? null : Buffer.from(JSON.stringify(o.body));
        rq = http.request({ host: '127.0.0.1', port: P, method, path: p, headers: Object.assign(data ? { 'content-type': 'application/json', 'content-length': data.length } : {}, o.headers || {}) }, r => {
          let s = ''; r.setEncoding('utf8'); r.on('data', d => { s += d; }); r.on('end', () => { let j = null; try { j = JSON.parse(s); } catch { j = null; } res({ status: r.statusCode, j, text: s }); });
        });
        rq.on('error', rej); if (data) rq.write(data); rq.end();
      });
      return { done, abort: () => { try { rq.destroy(); } catch { /* gone */ } } };
    };
    const req = (m, p, o) => open(m, p, o).done;
    const list = async () => ((await req('GET', '/api/jobs')).j || {}).jobs || [];
    const gq = '&game=' + encodeURIComponent(game);
    try {
      R._reset(); R._setHoldMs(700);
      // ---- the inbox long poll: held, never listed (the wait=1 rule of the dispatcher)
      const held = open('GET', '/api/x/ide/inbox?wait=1', { headers: { 'x-arsenal-job': 'inboxPoll01' } });
      await sleep(150);
      let L = await list();
      ok(R._waiters() === 1 && !L.some(j => j.id === 'inboxPoll01') && L.filter(j => j.kind === 'req').length === 0, 'joblist server: the held inbox long poll is not in GET /api/jobs', JSON.stringify(L));
      const hr = await held.done;
      ok(hr.status === 200 && hr.j && Array.isArray(hr.j.items) && hr.j.items.length === 0, 'joblist server: the long poll still answers when its time is up', hr.text);
      R._setHoldMs(25000);
      // ---- the whole-mod check: one bg row, its slice requests never listed; /api/cancel stops it
      let r = await req('POST', '/api/x/ide/modcheck', { body: { mod, from: 0, game }, headers: { 'x-arsenal-job': 'sliceAsk0001', 'x-arsenal-game': 'as64' } });
      ok(r.status === 200 && r.j && /^mc\d+-/.test(r.j.job), 'joblist server: the check starts through the server', r.text);
      const j0 = r.j.job;
      for (let i = 0; i < 300 && !(r.j && r.j.done); i++) { await sleep(10); r = await req('POST', '/api/x/ide/modcheck', { body: { mod, from: 0, job: j0, game } }); }
      L = await list();
      const rows = L.filter(j => j.what === 'job.w.modcheck');
      ok(r.j && r.j.done && rows.length === 1 && rows[0].kind === 'bg' && rows[0].page === 'ide' && rows[0].state === 'done' && rows[0].done === 3 && rows[0].total === 3 && rows[0].game === 'as64',
        'joblist server: the list holds one row for the whole check (bg, page ide, 3 of 3, done)', JSON.stringify(L));
      ok(L.filter(j => j.kind === 'req').length === 0, 'joblist server: no slice request shows in the list', JSON.stringify(L));
      r = await req('POST', '/api/x/ide/modcheck', { body: { mod, from: 0, again: true, game } });
      const j1 = r.j && r.j.job, run1 = (await list()).find(j => j.what === 'job.w.modcheck' && j.state === 'running');
      if (run1) {   // a small mod can end before the cancel gets there: then there is nothing to stop (the direct cases above cover it)
        const c = await req('POST', '/api/cancel', { body: { id: run1.id } });
        if (c.status === 200) {
          r = await req('POST', '/api/x/ide/modcheck', { body: { mod, from: 0, job: j1, game } });
          ok(r.j && r.j.stopped === true && r.j.done === false && (await list()).find(j => j.id === run1.id).state === 'cancelled', 'joblist server: POST /api/cancel stops the check; the next slice says stopped', r.text);
        }
      }
      // ---- a walk: first page named, later page hidden (seen from inside the route through a slow second request is not needed: the
      // registry cases above cover the flag; here the answers must still be right)
      r = await req('GET', '/api/x/ide/tree?mod=' + encodeURIComponent(mod) + '&lim=2' + gq);
      ok(r.status === 200 && r.j && r.j.files.length === 2 && r.j.next === 2, 'joblist server: the first page of the tree answers as before', r.text.slice(0, 300));
      r = await req('GET', '/api/x/ide/tree?mod=' + encodeURIComponent(mod) + '&lim=2&off=2&ver=' + encodeURIComponent(r.j.ver) + gq);
      ok(r.status === 200 && r.j && r.j.off === 2 && r.j.files.length >= 1, 'joblist server: a later page of the tree answers as before', r.text.slice(0, 300));
    } finally { R._setHoldMs(25000); R._reset(); await A.close(); }
  }

  // ================================================================ page
  const A1 = 'resource/a.set';
  const pfiles = () => ({ [A1]: 'ok\nBAD\n', 'resource/b.set': 'BAD\n' });
  const names = P => Array.prototype.slice.call(P.bx.JOBS.list()).map(j => j.name);
  // is the request of that ask a row of the list (by the id the page gave it in the header x-arsenal-job)
  const listed = (P, a) => !!a && !!a.jobId && Array.prototype.slice.call(P.bx.JOBS.list()).some(j => j.id === a.jobId);
  const ask = (P, f) => P.asked.filter(f).pop();
  // ---- P1. names and rows: usages named; inbox long poll, check slices and later pages of a walk never listed
  {
    let treeAsks = 0;
    const P = await boot({ files: pfiles(), api: req => {
      if (req.path === '/api/x/ide/refs') return PENDING;
      if (req.path === '/api/x/ide/modcheck') return PENDING;
      if (req.path === '/api/x/ide/tree') { treeAsks++; return req.q.off && req.q.off !== '0' ? PENDING : { mod: req.q.mod, files: [{ rel: A1, size: 3, state: 'new', key: A1 }], total: null, off: 0, next: 1, ver: 't', done: false, unread: 0, truncated: false, notes: [], game: null, undo: '' }; }
      return undefined;
    } });
    await P.open(A1); await P.flush();
    const inboxAsk = P.asked.filter(a => a.path === '/api/x/ide/inbox');
    ok(inboxAsk.length >= 1 && inboxAsk.every(a => a.q.wait === '1'), 'joblist page: the inbox long poll is asked with wait=1', JSON.stringify(inboxAsk.map(a => a.url)));
    ok(P.bx.JOBS.skip.some(r => r.q && r.q.test('wait=1')) && inboxAsk.every(a => a.jobId && !listed(P, a)), 'joblist page: the held inbox long poll is not a row', names(P).join(' | '));
    ok(treeAsks >= 2 && P.asked.some(a => a.path === '/api/x/ide/tree' && a.q.off === '1'), 'joblist page: the tree is read in pages', String(treeAsks));
    ok(!listed(P, ask(P, a => a.path === '/api/x/ide/tree' && a.q.off === '1')) && names(P).indexOf(fill('ide.job.tree')) < 0, 'joblist page: a later page of the tree walk is not a row (its first page was the row)', names(P).join(' | '));
    P.IDE.run('refs'); await P.flush();
    ok(listed(P, ask(P, a => a.path === '/api/x/ide/refs')) && names(P).indexOf(fill('ide.job.refs')) >= 0, 'joblist page: find usages is one named row', names(P).join(' | '));
    const before = names(P).length;
    P.IDE.run('jNext'); await P.flush(); await P.flush();
    ok(ask(P, a => a.path === '/api/x/ide/modcheck').jobId && !listed(P, ask(P, a => a.path === '/api/x/ide/modcheck')) && names(P).length === before, 'joblist page: a slice request of the whole-mod check is not a row (the server\'s background job is)', names(P).join(' | '));
  }
  // ---- P1b. the first page of a walk is the named row
  {
    const P = await boot({ files: pfiles(), api: req => (req.path === '/api/x/ide/tree' ? PENDING : undefined) });
    await P.flush();
    ok(listed(P, ask(P, a => a.path === '/api/x/ide/tree')) && names(P).indexOf(fill('ide.job.tree')) >= 0, 'joblist page: the first page of the tree walk is one named row', names(P).join(' | '));
  }
  // ---- P2. a stopped request: call() gives the translated word and the flag; the status line is not an error line
  {
    const P = await boot({ files: pfiles(), api: req => {
      if (req.path === '/api/x/ide/refs') throw Object.assign(new Error('cancelled'), { status: 499 });
      if (req.path === '/api/x/ide/symbols') throw Object.assign(new Error('broke'), { status: 500 });
      return undefined;
    } });
    await P.open(A1);
    let e = null; try { await P.IDE.call('/api/x/ide/refs', { mod: 'm', name: 'x' }); } catch (x) { e = x; }
    const stopped = require('../../lang/en.json')['job.cancelled'];
    ok(e && e.cancelled === true && e.status === 499 && e.key === 'job.cancelled' && e.message === stopped && stopped !== 'job.cancelled' && stopped !== 'cancelled', 'joblist page: a stopped request rejects with cancelled:true and the translated word', e && JSON.stringify({ c: e.cancelled, s: e.status, m: e.message }));
    let e2 = null; try { await P.IDE.call('/api/x/ide/symbols', { mod: 'm' }); } catch (x) { e2 = x; }
    ok(e2 && !e2.cancelled && e2.status === 500 && e2.message === 'broke', 'joblist page: any other failure is as before (status, the server\'s message)');
    ok(P.IDE.errMsg(e) === stopped && P.IDE.errMsg(e2) === fill('ide.err', { m: 'broke' }) && P.IDE.errMsg(e2, 'ide.openFail') === fill('ide.openFail', { m: 'broke' }), 'joblist page: errMsg = the plain word for a stopped request, the error line for a failure');
    const said = []; const say = P.IDE.status; P.IDE.status = t => { said.push(t || ''); return say(t); };
    P.IDE.run('refs'); await P.flush();
    ok(said.indexOf(stopped) >= 0 && !said.some(s => s.indexOf(fill('ide.err', { m: '' })) === 0), 'joblist page: stopped usages say "Stopped", not "Something went wrong"', JSON.stringify(said));
  }
  // ---- P3. the whole-mod check stopped from the list: the asks end, the strip says so, the next step starts a new check
  {
    const asks = []; let mode = 'stop';
    const P = await boot({ files: pfiles(), api: req => {
      if (req.path !== '/api/x/ide/modcheck') return undefined;
      asks.push(req.body);
      if (req.body.stop) return { job: req.body.job, stopped: true, done: false, files: [], off: 0, next: 0 };
      if (mode === 'stop') return asks.length === 1 ? { job: 'j1', done: false, total: 2, checked: 1, start: A1, upto: A1, wrapped: false, files: [], off: 0, next: 0, ms: 0 }
        : { job: 'j1', stopped: true, done: false, total: 2, checked: 1, start: A1, upto: A1, wrapped: false, files: [], off: 0, next: 0, ms: 0 };
      return { job: 'j2', done: true, total: 2, checked: 2, start: A1, upto: 'resource/b.set', wrapped: false, files: [{ rel: 'resource/b.set', key: 'resource/b.set', findings: [{ line: 1, col: 1, len: 3, code: 'E_BAD', sev: 'error', msg: 'bad thing' }] }].slice(req.body.from || 0), off: req.body.from || 0, next: 1, ms: 1 };
    } });
    const said = []; const say = P.IDE.status; P.IDE.status = t => { said.push(t || ''); return say(t); };
    P.IDE.jump.start(); await P.flush(); await P.flush(); await P.flush();
    const st = P.IDE.jump.state(), n = asks.length;
    ok(st && st.stopped === true && st.done === false && !st.err && !st.pending, 'joblist jump: a check stopped from the job list is in a plain stopped state (no error)', JSON.stringify(st));
    ok(said.indexOf(fill('ide.j.stopped')) >= 0 && !said.some(s => s.indexOf(fill('ide.j.fail', { m: '' })) === 0), 'joblist jump: the status says the check was stopped and how to start it again', JSON.stringify(said));
    await P.flush(); await P.flush();
    ok(asks.length === n && n === 2, 'joblist jump: no further slice is asked after the stop', String(asks.length));
    const bar = P.IDE.jumpBar(), txt = bar.all ? bar.all().map(x => x.textContent).join('|') : '';
    ok(txt.indexOf(fill('ide.j.stopped')) >= 0, 'joblist jump: the strip of the problems panel shows the stopped state', txt);
    mode = 'go';
    P.IDE.run('jNext'); await P.flush(); await P.flush(); await P.flush();
    const st2 = P.IDE.jump.state();
    ok(asks.length > n && asks[n].job === undefined && !asks[n].stop && st2 && st2.done && !st2.stopped, 'joblist jump: the next step starts a new check (no old job id) and it ends', JSON.stringify({ a: asks[n], st: st2 }));
  }
  // ---- P4. a 499 on the slice ask itself is the same plain stop
  {
    let n = 0;
    const P = await boot({ files: pfiles(), api: req => { if (req.path !== '/api/x/ide/modcheck') return undefined; n++; throw Object.assign(new Error('cancelled'), { status: 499 }); } });
    P.IDE.jump.start(); await P.flush(); await P.flush();
    const st = P.IDE.jump.state();
    ok(n === 1 && st && st.stopped === true && !st.err, 'joblist jump: a stopped slice request (499) is the plain stopped state, not a failure', JSON.stringify(st));
  }
  // ---- P5. the mod changes while the check runs: the server is told to stop it
  {
    const asks = [];
    const P = await boot({ files: pfiles(), api: req => {
      if (req.path !== '/api/x/ide/modcheck') return undefined;
      asks.push(req.body);
      if (req.body.stop) return { job: req.body.job, stopped: true, done: false, files: [], off: 0, next: 0 };
      return asks.length === 1 ? { job: 'j1', done: false, total: 2, checked: 1, start: A1, upto: A1, wrapped: false, files: [], off: 0, next: 0, ms: 0 } : PENDING;
    } });
    P.IDE.jump.start(); await new Promise(r => setImmediate(r)); await new Promise(r => setImmediate(r)); await new Promise(r => setImmediate(r));
    const m0 = P.St.mod;
    P.IDE.emit('mod', { mod: 'C:/g/mods/other' }); await P.flush();
    const sp = asks.filter(a => a.stop);
    ok(sp.length === 1 && sp[0].job === 'j1' && sp[0].mod === m0, 'joblist jump: leaving the mod mid-check tells the server to stop that check', JSON.stringify(asks));
    ok(P.IDE.jump.state() === null, 'joblist jump: the list of the old mod is dropped as before');
  }
};

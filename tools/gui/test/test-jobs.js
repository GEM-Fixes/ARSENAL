// JOBS, the current job list in the footer bar, page half (tools/gui/page.js; tools/gui/README.md "JOBS", contract 1). No server, no
// browser, no game: the page script (page.js with every ext script) runs in the fake DOM with a clock the test drives and a fake fetch
// the test answers (a request waits until the test calls its done(); GET /api/jobs gives the list the test set in P.srv).
// Checks: a request under 0.6 s never shows; a longer one shows, named by the page and the clicked button; the header x-arsenal-job is
// sent and is the listed id; the bar button follows the newest running job with +N; jobs only the server knows appear, and merge by id;
// progress, stage and state from the server show; Cancel posts /api/cancel with the id; a job that writes needs two clicks; a job that
// cannot be stopped has a greyed button and the reason; Cancel all; a finished job goes away; the bar with jobs only, jumps only, both,
// neither; polls and opt.job===false never list; a run is listed under its run id and stops through the header's Cancel; the Editor's
// call() is tracked; JOBS.track / on / list / cancel; the name goes to the job's page and records a jump; Esc; the four languages; CSS.
// usage: node test-jobs.js
// Author: Imperator_Aug (ARSENAL, ia-job1121)
'use strict';
const path = require('path'), vm = require('vm');
const GUI = path.join(__dirname, '..');
const fakedom = require('./fakedom'), contract = require(path.join(GUI, 'contract')), html = require(path.join(GUI, 'page.js'));
const LANG = c => require(path.join(GUI, 'lang', c + '.json'));
const ORDER = ['en', 'ru', 'uk', 'zh'];
let pass = 0, failN = 0;
const ok = (c, m, extra) => { if (c) { pass++; console.log('ok ' + m); } else { failN++; console.log('FAIL ' + m + (extra !== undefined ? '\n  ' + String(extra).slice(0, 700) : '')); } };
const tick = () => new Promise(r => setImmediate(r));
const clone = o => JSON.parse(JSON.stringify(o));
const GAMEP = 'F:\\Games\\Men of War Assault Squad 2';
const GOOD = { dir: GAMEP, source: 'steam', ok: true, exes: ['as64.exe', 'mowas_2.exe'], hasMods: true, codes: [] };
const IDRX = /^[A-Za-z0-9_-]{6,40}$/;

// one page with a clock (timers wait in a queue; adv(ms) runs what came due) and a fetch the test answers
async function load() {
  const doc = fakedom.make(), store = new Map(), timers = []; let now = 0, seq = 0;
  const row = doc.createElement('div'); row.setAttribute('id', 'taskrow'); doc.body.insertBefore(row, doc.getElementById('nav'));
  for (const id of ['langbox', 'foot', 'footq']) { const e = doc.createElement('span'); e.setAttribute('id', id); doc.body.appendChild(e); }
  const mk = (x, status) => ({ ok: !status || status < 400, status: status || 200, json: () => Promise.resolve(clone(x)), body: null });
  const resp = (x, status) => Promise.resolve(mk(x, status));
  const P = { doc, calls: [], pend: [], srv: [], jobsDown: false, cancelReply: null, run: null };
  // the body of POST /api/run: the test pushes events, the page reads them
  const stream = () => { const q = [], wait = [], enc = new TextEncoder(), put = x => { if (wait.length) wait.shift()(x); else q.push(x); };
    return { read: () => new Promise(r => { if (q.length) r(q.shift()); else wait.push(r); }), push: ev => put({ done: false, value: enc.encode(JSON.stringify(ev) + '\n') }), close: () => put({ done: true }) }; };
  const w = {
    document: doc, console, TextDecoder, WeakMap, setInterval: () => 0,
    setTimeout: (f, ms) => { const id = ++seq; timers.push({ id, f, at: now + (ms > 0 ? ms : 0) }); return id; },
    clearTimeout: id => { const i = timers.findIndex(t => t.id === id); if (i >= 0) timers.splice(i, 1); },
    AS2CFG: {}, scrollY: 0, innerHeight: 800,
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k), get length() { return store.size; }, key: i => [...store.keys()][i] },
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    confirm: () => true,
    fetch: (u, op) => {
      const m = (op && op.method) || 'GET', url = new URL(String(u), 'http://127.0.0.1'), p = url.pathname;
      const c = { m, p, q: url.search, headers: Object.assign({}, op && op.headers), body: op && op.body ? JSON.parse(op.body) : undefined };
      P.calls.push(c);
      if (p === '/api/health') return resp({ ok: true, allowLaunch: false, version: 'test' });
      if (p === '/api/commands') return resp({ commands: contract.describe() });
      if (p === '/api/settings') return resp(m === 'GET' ? { settings: {}, empty: true, file: '' } : { ok: true });
      if (p === '/api/game') return resp(url.searchParams.get('kind') === 'goh' ? { codes: ['none'] } : GOOD);
      if (p === '/api/mods') return resp({ mods: [], roots: [] });
      if (p === '/api/jobs') return P.jobsDown ? Promise.reject(new Error('down')) : resp({ jobs: P.srv });
      if (p === '/api/cancel') return P.cancelReply ? resp(P.cancelReply.j, P.cancelReply.status) : resp({ ok: true });
      if (p === '/api/run' && m === 'POST') { P.run = stream(); return Promise.resolve({ ok: true, status: 200, body: { getReader: () => P.run } }); }
      return new Promise(res => { c.done = (j, status) => res(mk(j === undefined ? { ok: true } : j, status)); P.pend.push(c); });
    },
  };
  w.scrollTo = (x, y) => { w.scrollY = y; };
  const adv = ms => { const end = now + ms; for (let n = 0; n < 5000; n++) { const due = timers.filter(t => t.at <= end).sort((a, b) => a.at - b.at || a.id - b.id)[0]; if (!due) break; timers.splice(timers.indexOf(due), 1); now = Math.max(now, due.at); try { due.f(); } catch (e) { console.log('timer threw: ' + (e && e.stack || e)); } } now = end; };
  const settle = async ms => { for (let i = 0; i < 6; i++) { await tick(); adv(i ? 0 : (ms || 0)); } await tick(); };
  w.window = w; vm.createContext(w);
  vm.runInContext(/<script>([\s\S]*)<\/script>/.exec(html)[1], w, { filename: 'page.js:script' });
  w.JOBS.tune({ wait: 1e12 });   // the requests of the page's own start are never answered here: they are not this test's jobs
  for (let i = 0; i < 800 && !w.__as2gui; i++) { await tick(); adv(20); }
  await settle(3000);
  w.JOBS.tune({ wait: 600 });
  doc.documentElement.scrollHeight = 6000; P.pend.length = 0; P.calls.length = 0;
  Object.assign(P, { w, adv, settle, S: () => w.__as2gui, IN: w.__as2in, J: w.JOBS });
  P.bar = () => doc.getElementById('jmpbar');
  P.shown = () => { const b = P.bar(); return !!b && !b.hidden; };
  P.jb = () => doc.getElementById('jobbtn');
  P.jbOn = () => { const b = P.jb(); return P.shown() && !!b && !b.hidden; };
  P.backOn = () => { const b = doc.getElementById('jmpback'); return P.shown() && !!b && !b.hidden; };
  P.lst = () => doc.getElementById('joblist');
  P.open = () => { const l = P.lst(); return !!l && !l.hidden; };
  P.row = id => { const l = P.lst(); return l ? l.querySelector('[data-job=' + id + ']') : null; };
  P.cb = id => { const r = P.row(id); return r ? r.querySelector('button[data-jcancel]') : null; };
  P.list = () => clone(w.JOBS.list());
  P.job = id => P.list().find(j => j.id === id) || null;
  P.click = el => { doc.fire('mousedown', { target: el }); doc.fire('click', { target: el }); el.click(); };
  P.sec = () => doc.querySelectorAll('section').find(s => s.dataset.id === P.S().cur);
  // a button on the current page whose click runs fn (the way a page's own button calls api)
  P.btn = (text, fn) => { const b = doc.createElement('button'); b.textContent = text; b.addEventListener('click', fn); P.sec().appendChild(b); return b; };
  P.last = p => P.pend.filter(c => c.p === p).pop();
  P.cancels = () => P.calls.filter(c => c.p === '/api/cancel' && c.m === 'POST').map(c => c.body && c.body.id);
  P.sync = () => settle(1500);   // one read of /api/jobs while anything is listed
  P.toast = () => doc.getElementById('toast').textContent;
  return P;
}
const SJ = o => Object.assign({ id: 'b1', kind: 'bg', what: '', whatP: null, page: '', game: 'as64', state: 'running', stage: '', done: null, total: null, startedMs: Date.now(), endedMs: null, canCancel: true, writes: false, cmd: '', interactive: false }, o);

(async () => {
  const EN = LANG('en');
  const T = (k, p) => String(EN[k]).replace(/\{(\w+)\}/g, (m, n) => (p && p[n] != null ? String(p[n]) : m));

  // ===== 1. a short request never shows; a long one shows, named by the page and the button; the header is the id
  {
    const P = await load(), d = P.doc, S = P.S(), api = P.IN.api;
    ok(!!S && !!S.cur, 'the page built', S && S.cur);
    ok(P.J && ['list', 'cancel', 'on', 'track'].every(k => typeof P.J[k] === 'function'), 'window.JOBS has list, cancel, on, track');
    ok(P.list().length === 0 && !P.shown() && !d.body.classList.contains('jmpon'), 'no job and no jump: no bar, no bottom room', JSON.stringify(P.list()));
    let seen = 0; P.J.on(() => { seen++; });

    let got = null;
    const bShort = P.btn('Quick look', () => { api('/api/x/t/short', { a: 1 }).then(j => { got = j; }); });
    P.click(bShort); await P.settle(0);
    const cS = P.last('/api/x/t/short');
    ok(cS && IDRX.test(cS.headers['x-arsenal-job'] || ''), 'every request carries x-arsenal-job, an id of 6 to 40 safe characters', cS && cS.headers['x-arsenal-job']);
    ok(cS && cS.headers['x-arsenal-game'] && cS.headers['content-type'] === 'application/json' && cS.body.a === 1, 'the game header, the content type and the body are as before');
    P.adv(500); cS.done({ fine: 1 }); await P.settle(0); await P.settle(2000);
    ok(got && got.fine === 1, 'api() still resolves with the reply', JSON.stringify(got));
    ok(P.list().length === 0 && !P.shown() && seen === 0, 'a request that ends inside 0.6 s is never listed, and nobody is told', seen);

    let err = null;
    const bLong = P.btn('  Build   the things ', () => { api('/api/x/t/long', { b: 2 }).catch(e => { err = e; }); });
    P.click(bLong); await P.settle(0);
    const cL = P.last('/api/x/t/long'), idL = cL.headers['x-arsenal-job'];
    P.adv(590);
    ok(P.list().length === 0 && !P.shown(), 'still pending after 0.59 s: not listed yet');
    await P.settle(10);
    const L1 = P.list();
    ok(L1.length === 1 && L1[0].state === 'running' && L1[0].kind === 'req', 'pending after 0.6 s: listed, running, kind req', JSON.stringify(L1));
    ok(L1[0] && L1[0].id === idL && idL !== cS.headers['x-arsenal-job'], 'the listed id is the id in the header (a new one per request)', idL);
    const nm = L1[0] ? L1[0].name : '', pre = nm.slice(0, nm.length - ': Build the things'.length);
    ok(/^.+: Build the things$/.test(nm) && pre.length > 1 && !/job\./.test(nm), 'named "<page name>: <button text>", the text trimmed', nm);
    ok(seen > 0, 'JOBS.on(fn) is called when the list changes', seen);
    ok(P.shown() && P.jbOn() && !P.backOn() && d.body.classList.contains('jmpon'), 'jobs only: the bar shows with #jobbtn, without the jump back part; the page gets bottom room');
    const jb = P.jb();
    ok(jb.tagName === 'BUTTON' && jb.getAttribute('aria-expanded') === 'false' && jb.getAttribute('aria-controls') === 'joblist', '#jobbtn is a button with aria-expanded and aria-controls');
    ok(jb.textContent.indexOf(nm) === 0 && jb.textContent.indexOf(T('job.sec', { s: 0 })) > 0 && jb.querySelector('.jbm').hidden, 'the button shows the job name and its seconds, no +N', jb.textContent);
    ok(!P.open(), 'the list is closed until the button is clicked');
    P.click(jb); await P.settle(0);
    const lst = P.lst();
    ok(P.open() && jb.getAttribute('aria-expanded') === 'true' && lst.getAttribute('role') === 'list', 'a click opens #joblist (role list), aria-expanded true');
    const r1 = P.row(idL);
    ok(r1 && r1.getAttribute('role') === 'listitem' && r1.textContent.indexOf(nm) >= 0 && r1.querySelector('.jrg').textContent.length > 1 && /\d/.test(r1.querySelector('.jrs').textContent), 'one row per job [data-job=id]: name, game, seconds', r1 && r1.textContent);
    // the server has not been asked yet when the row was first drawn; after one read it knows the request, with no tool running
    P.srv = [SJ({ id: idL, kind: 'req', canCancel: false, page: 'x' })];
    await P.sync();
    let cb = P.cb(idL);
    ok(cb && cb.disabled && P.row(idL).textContent.indexOf(EN['job.r.nochild']) > 0, 'the server runs it with no tool to kill: Cancel is greyed and the row says why', P.row(idL).textContent);
    ok(P.job(idL).name === nm, 'merged by id: the page keeps its own name for a request');
    P.srv = [SJ({ id: idL, kind: 'req', canCancel: true, stage: 'unpacking' })];
    await P.sync();
    cb = P.cb(idL);
    ok(cb && !cb.disabled && cb.textContent === EN['job.cancel'], 'the server says it can be stopped: Cancel is live');
    ok(P.row(idL).querySelector('.jrp').textContent === 'unpacking' && P.jb().textContent.indexOf('unpacking') > 0, 'the stage from the server shows in the row and on the bar button', P.jb().textContent);
    // a refused cancel: 409 job.e.nostop
    P.cancelReply = { status: 409, j: { error: 'cannot be stopped', key: 'job.e.nostop' } };
    P.click(cb); await P.settle(0);
    ok(P.cancels().join() === idL && P.toast() === EN['job.e.nostop'] && !P.cb(idL).disabled, 'a 409 answer: one toast in words, the button is live again', P.toast());
    P.cancelReply = null; P.calls.length = 0;
    P.click(P.cb(idL)); await tick();
    ok(P.cb(idL).disabled && P.cb(idL).textContent === EN['job.stopping'], 'Cancel: the button reads Stopping… and is disabled', P.cb(idL).textContent);
    await P.settle(0);
    ok(P.cancels().join() === idL, 'Cancel posted /api/cancel with the id of the job', P.cancels().join());
    const cc = P.calls.find(c => c.p === '/api/cancel');
    ok(P.list().length === 1, 'the cancel request itself is not a job');
    ok(cc && IDRX.test(cc.headers['x-arsenal-job'] || ''), 'it still carries a header id');
    // the server answers the stopped request 499 job.cancelled
    cL.done({ error: 'cancelled', key: 'job.cancelled' }, 499); await P.settle(0);
    ok(err && err.status === 499 && err.key === 'job.cancelled' && err.message === EN['job.cancelled'] && err.text === EN['job.cancelled'] && err.cancelled === true, 'the stopped request rejects as before, worded "Stopped" (message and text), marked cancelled', err && err.message);
    ok(P.job(idL) && P.job(idL).state === 'cancelled', 'the job ended as cancelled', JSON.stringify(P.job(idL)));
    ok(!P.cb(idL) && P.row(idL).querySelector('.jrst').textContent === EN['job.s.cancelled'], 'a finished row has its state in words and no Cancel button', P.row(idL).textContent);
    ok(P.jb().textContent.indexOf(EN['job.s.cancelled']) > 0, 'nothing runs: the bar button says how the last job ended', P.jb().textContent);
    const live = d.getElementById('joblive');
    ok(live && live.getAttribute('aria-live') === 'polite' && live.textContent === T('job.end', { name: nm, state: EN['job.s.cancelled'] }), 'a polite live region says the job ended', live && live.textContent);
    P.srv = []; await P.settle(9000);
    ok(P.list().length === 1, 'a finished job stays listed for a while');
    await P.settle(1500);
    ok(P.list().length === 0 && !P.shown() && !P.open() && !d.body.classList.contains('jmpon'), 'after 10 s it goes: no job, no jump, the bar and the list hide, the bottom room goes', JSON.stringify(P.list()));
  }

  // ===== 2. +N, jobs only the server knows, progress, writes (two clicks), not cancellable, Cancel all, finished
  {
    const P = await load(), d = P.doc, S = P.S(), api = P.IN.api;
    const b1 = P.btn('First', () => { api('/api/x/t/one', {}).catch(() => {}); }), b2 = P.btn('Second', () => { api('/api/x/t/two', {}).catch(() => {}); });
    P.click(b1); await P.settle(700); P.click(b2); await P.settle(700);
    const id1 = P.last('/api/x/t/one').headers['x-arsenal-job'], id2 = P.last('/api/x/t/two').headers['x-arsenal-job'];
    ok(P.list().length === 2, 'two long requests: two jobs', JSON.stringify(P.list().map(j => j.name)));
    ok(P.jb().textContent.indexOf(': Second') > 0 && P.jb().querySelector('.jbm').textContent === '+1' && !P.jb().querySelector('.jbm').hidden, 'the bar button names the newest running job, +1 for the other', P.jb().textContent);
    // the server lists a background job of its own, with a name key and progress
    P.srv = [SJ({ id: id1, kind: 'req', canCancel: true }), SJ({ id: id2, kind: 'req', canCancel: true }), SJ({ id: 'bmap1', what: 'job.w.mapviz', whatP: { map: '2v2_farm' }, page: 'mapviz', game: 'goh', done: 3, total: 12 })];
    await P.sync();
    ok(P.list().length === 3 && P.job('bmap1') && P.job('bmap1').kind === 'bg' && P.job('bmap1').name === T('job.w.mapviz', { map: '2v2_farm' }), 'a job only the server knows is listed, named by its key and params', JSON.stringify(P.job('bmap1')));
    ok(P.jb().textContent.indexOf(T('job.w.mapviz', { map: '2v2_farm' })) === 0 && P.jb().textContent.indexOf(T('job.of', { a: 3, b: 12 })) > 0 && P.jb().querySelector('.jbm').textContent === '+2', 'it is the newest: the bar shows its name, 3 / 12 and +2', P.jb().textContent);
    P.click(P.jb()); await P.settle(0);
    const rb = P.row('bmap1');
    ok(rb && rb.querySelector('.jrp').textContent === T('job.of', { a: 3, b: 12 }) && /Gates of Hell|GoH/.test(rb.querySelector('.jrg').textContent), 'its row shows the progress and the game it runs for', rb && rb.textContent);
    ok(d.getElementById('joblist').querySelectorAll('.jr')[0] === rb, 'the newest job is the first row');
    P.srv[2] = SJ({ id: 'bmap1', what: 'job.w.mapviz', whatP: { map: '2v2_farm' }, page: 'mapviz', game: 'goh', done: 7, total: 12 });
    await P.sync();
    ok(P.row('bmap1').querySelector('.jrp').textContent === T('job.of', { a: 7, b: 12 }) && P.list().length === 3, 'the next read updates the same row (7 / 12), no second entry', P.row('bmap1').textContent);
    // an unknown name key shows its last part; a job that cannot be stopped; a job that writes
    P.srv.push(SJ({ id: 'bzz', what: 'job.w.nosuchname', canCancel: false }), SJ({ id: 'bwr', what: 'job.w.spmis', writes: true, page: 'missions' }));
    await P.sync();
    ok(P.job('bzz').name === 'nosuchname', 'a name key the page does not have shows as its last part', P.job('bzz').name);
    const cz = P.cb('bzz');
    ok(cz && cz.disabled && P.row('bzz').textContent.indexOf(EN['job.r.nostop']) > 0 && P.job('bzz').canCancel === false, 'canCancel false: the button is greyed and the row gives the reason', P.row('bzz').textContent);
    P.click(cz); await P.settle(0);
    ok(P.cancels().length === 0 && P.J.cancel('bzz') === false, 'it cannot be clicked, and JOBS.cancel(id) refuses it too');
    // writes: two clicks
    P.click(P.cb('bwr')); await P.settle(0);
    ok(P.cancels().length === 0 && P.cb('bwr').textContent === EN['job.sure'] && P.row('bwr').textContent.indexOf(EN['job.sureN']) > 0, 'a job that writes: the first click only asks "Stop anyway?" and says files already written stay', P.row('bwr').textContent);
    await P.sync();
    ok(P.cb('bwr').textContent === EN['job.sure'], 'the question stays through a read of the server list');
    P.click(P.cb('bwr')); await P.settle(0);
    ok(P.cancels().join() === 'bwr' && P.cb('bwr').disabled && P.cb('bwr').textContent === EN['job.stopping'], 'the second click stops it', P.cancels().join());
    // Cancel all: three can still be stopped (the two requests and the map job)
    const allBtn = () => P.lst().querySelectorAll('button').find(x => x.getAttribute('id') === 'jobcancelall') || null, all = allBtn();   // the fake DOM keeps ids of removed elements
    ok(all && all.tagName === 'BUTTON' && all.textContent === EN['job.all'], 'two or more can be cancelled: Cancel all is there');
    P.calls.length = 0; P.click(all); await P.settle(0);
    ok(P.cancels().slice().sort().join() === [id1, id2, 'bmap1'].sort().join(), 'Cancel all posts /api/cancel for every job that can be stopped, not for the greyed one or the one already stopping', P.cancels().join());
    ok(!allBtn(), 'nothing left to cancel: Cancel all is gone');
    // the server ends them; the requests answer 499
    P.srv = [SJ({ id: 'bmap1', what: 'job.w.mapviz', whatP: { map: '2v2_farm' }, state: 'cancelled', endedMs: Date.now() }), SJ({ id: 'bwr', what: 'job.w.spmis', state: 'failed', endedMs: Date.now() }), SJ({ id: 'bzz', what: 'job.w.nosuchname', state: 'timeout', canCancel: false })];
    P.last('/api/x/t/one').done({ error: 'cancelled', key: 'job.cancelled' }, 499); P.last('/api/x/t/two').done({ ok: true });
    await P.sync();
    const st = id => { const r = P.row(id), s = r && r.querySelector('.jrst'); return s ? s.textContent : ''; };
    ok(st('bmap1') === EN['job.s.cancelled'] && st('bwr') === EN['job.s.failed'] && st('bzz') === EN['job.s.timeout'], 'the states the server gives show in words (Stopped, Failed, Timed out)', [st('bmap1'), st('bwr'), st('bzz')].join(' | '));
    ok(st(id1) === EN['job.s.cancelled'] && st(id2) === EN['job.s.done'], 'the page own requests: 499 is Stopped, a normal reply is Done', st(id1) + ' | ' + st(id2));
    ok(!d.getElementById('joblist').querySelector('button[data-jcancel]'), 'no Cancel button on a finished job');
    P.srv = [];
    await P.sync();
    ok(!P.job('bmap1') && !P.job('bwr') && !P.job('bzz'), 'the server dropped its finished jobs: their rows go', JSON.stringify(P.list().map(j => j.id)));
    await P.settle(10000);
    ok(P.list().length === 0 && !P.shown(), 'and the page own finished ones go after 10 s; the bar hides');

    // ===== 3. the bar: jobs only, both, jumps only, neither; the name goes to the job page; Esc
    const other = Object.keys(S.sec).find(p => P.IN.INGAME[p] && p !== S.cur && p !== 'settings'), p0 = S.cur;
    P.srv = [SJ({ id: 'bgo', what: 'job.w.guides', page: other })];
    await P.settle(15000);
    ok(P.job('bgo') && P.jbOn() && !P.backOn() && P.w.JUMPS.size() === 0, 'idle, the server list is still read (every 15 s): a new job shows; jobs only = no jump back part', JSON.stringify(P.list()));
    P.click(P.jb()); await P.settle(0);
    const go = P.row('bgo').querySelector('button.jrn');
    ok(go && go.textContent === EN['job.w.guides'], 'the name of a job with a page is a button');
    P.click(go); await P.settle(0);
    // the page it goes to asks for its own data when it is first shown: answered at once here, so those are not jobs of this test
    P.pend.filter(c => c.p.indexOf('/api/x/' + other + '/') === 0).forEach(c => c.done({}));
    ok(S.cur === other && P.w.JUMPS.size() === 1, 'a click on the name goes to the job page and that is a jump (' + p0 + ' to ' + other + ')', S.cur + ' ' + P.w.JUMPS.size());
    ok(P.jbOn() && P.backOn() && d.body.classList.contains('jmpon'), 'both: #jobbtn and the jump back part in one bar');
    ok(P.open(), 'the list stays open');
    d.key('Escape'); await P.settle(0);
    ok(!P.open() && P.jb().getAttribute('aria-expanded') === 'false', 'Esc closes the list');
    P.srv = []; await P.sync();
    ok(!P.jbOn() && P.backOn() && P.shown() && d.body.classList.contains('jmpon'), 'jumps only: the bar stays for jump back, #jobbtn is hidden');
    P.click(d.getElementById('jmpback')); await P.settle(0);
    ok(S.cur === p0 && !P.shown() && !d.body.classList.contains('jmpon'), 'back to the first page; neither a job nor a jump: the bar hides', S.cur);

    // ===== 4. a request of another window: listed once two reads saw it running, with a general name from its page
    P.srv = [SJ({ id: 'xOtherWin0001', kind: 'req', page: other, canCancel: false })];
    await P.settle(15000);
    const after1 = P.list().length;
    await P.sync();
    const ow = P.job('xOtherWin0001');
    ok(after1 === 0 && ow && ow.kind === 'req' && ow.name.indexOf(T('job.other', { p: '' }).trim()) > 0 && !/job\./.test(ow.name), 'a request another window started: not on the first read, listed on the second, named by its page', after1 + ' ' + JSON.stringify(ow));
    P.srv = [SJ({ id: 'xOtherDone001', kind: 'req', state: 'done' })]; await P.sync(); await P.sync();
    ok(P.list().length === 0, 'it goes when the server drops it; a finished request of another window is never listed', JSON.stringify(P.list()));
    // the server stops answering: jobs only it knew are taken off after three tries
    P.srv = [SJ({ id: 'blost', what: 'job.w.modcheck' })]; await P.settle(15000);
    ok(!!P.job('blost'), 'setup: a server job is listed');
    P.jobsDown = true; await P.sync(); await P.sync();
    const still = !!P.job('blost'); await P.sync(); await P.sync();
    ok(still && !P.job('blost') && !P.shown(), 'the server is gone: after three failed reads its jobs leave the list');
    P.jobsDown = false;
  }

  // ===== 5. polls, opt.job===false, opt.what, a run, the Editor call(), JOBS.track
  {
    const P = await load(), d = P.doc, S = P.S(), api = P.IN.api;
    const polls = ['/api/x/a/status', '/api/x/a/progress?mod=m', '/api/x/a/joblist', '/api/x/a/jobs', '/api/x/a/job?id=7', '/api/x/a/run?mod=m&id=r9', '/api/x/a/events?since=4&wait=1', '/api/x/b/sub/status?x=1'];
    for (const u of polls) api(u).catch(() => {});
    api('/api/x/a/hold', { wait: 1 }, { job: false }).catch(() => {});
    api('/api/x/a/held', undefined, { job: false }).catch(() => {});
    await P.settle(5000);
    ok(P.list().length === 0 && !P.shown(), 'polls (status, progress, joblist, jobs, job?id, run?id, wait=1) and opt.job===false are never listed', JSON.stringify(P.list().map(j => j.name)));
    ok(P.pend.length === polls.length + 2 && P.pend.every(c => IDRX.test(c.headers['x-arsenal-job'] || '')), 'they still carry the header, so the server copy can be told from another window');
    // the server lists them as requests: this page knows they are its own and keeps them out
    P.srv = P.pend.map(c => SJ({ id: c.headers['x-arsenal-job'], kind: 'req', canCancel: false }));
    await P.settle(15000); await P.sync(); await P.sync();
    ok(P.list().length === 0, 'the server lists those requests: still not shown here', JSON.stringify(P.list()));
    P.srv = [];
    // the same paths as work: a POST, and a GET that only looks alike
    api('/api/x/a/status', { set: 1 }).catch(() => {}); api('/api/x/a/job').catch(() => {}); api('/api/x/a/statusx').catch(() => {});
    api('/api/x/a/named', { n: 1 }, { what: 'Packing the mod' }).catch(() => {});
    await P.settle(700);
    const names = P.list().map(j => j.name);
    ok(P.list().length === 4, 'a POST to /status, a GET of /job with no id and of /statusx are work: listed', JSON.stringify(names));
    ok(names.indexOf('Packing the mod') >= 0, 'opt.what names the job');
    ok(names.filter(n => n !== 'Packing the mod').every(n => n.indexOf(EN['job.work']) > 0 && n.length > EN['job.work'].length + 2), 'no button was clicked: the page name and "working"', JSON.stringify(names));
    for (const c of P.pend) c.done({ ok: true });
    await P.settle(0); await P.settle(11000);
    ok(P.list().length === 0, 'all answered: the list empties');

    // a run through streamRun
    const lines = []; let ended = null, started = null;
    const bRun = P.btn('Check the mod', () => { P.IN.streamRun('validate', { mod: 'm' }, { start: e => { started = e; }, line: (k, t) => lines.push(k + t), end: e => { ended = e; } }).then(() => {}); });
    P.click(bRun); await P.settle(700);
    ok(P.run && P.list().length === 0, 'a run that has not answered yet is not listed');
    ok(!d.getElementById('cancel').hidden && d.getElementById('runstate').textContent.length > 0, 'the header still shows the run and its Cancel');
    P.run.push({ t: 'start', id: 'r77' }); await P.settle(0);
    const rj = P.job('r77');
    ok(started && rj && rj.kind === 'run' && rj.state === 'running' && /: Check the mod$/.test(rj.name), 'the start event lists the run under its run id, named by the page and the button', JSON.stringify(rj));
    P.srv = [SJ({ id: 'r77', kind: 'run', cmd: 'validate', interactive: false, canCancel: true })]; await P.sync();
    ok(P.list().length === 1 && P.job('r77').name === rj.name, 'the server entry of the run merges into the same row');
    P.run.push({ t: 'out', line: 'hello' }); await P.settle(0);
    ok(lines.join() === 'ohello', 'the run lines reach the page as before', lines.join());
    P.click(P.jb()); await P.settle(0);
    P.calls.length = 0; P.click(P.cb('r77')); await P.settle(0);
    ok(P.cancels().join() === 'r77' && P.cb('r77').disabled && P.cb('r77').textContent === EN['job.stopping'], 'Cancel in the list stops the run the way the header Cancel does (POST /api/cancel, its run id)', P.cancels().join());
    P.run.push({ t: 'end', code: 1, signal: 'SIGTERM', ms: 5 }); P.run.close(); await P.settle(0);
    ok(ended && ended.code === 1 && d.getElementById('cancel').hidden && P.job('r77').state === 'cancelled', 'the run ended: on.end as before, the header Cancel hides, the job reads Stopped', JSON.stringify(P.job('r77')));
    P.srv = []; await P.settle(11000);
    ok(P.list().length === 0, 'the run leaves the list');
    // a run that ends well
    P.click(bRun); await P.settle(0); P.run.push({ t: 'start', id: 'r78' }); await P.settle(0);
    P.run.push({ t: 'end', code: 0, signal: null, ms: 5 }); P.run.close(); await P.settle(0);
    ok(P.job('r78') && P.job('r78').state === 'done', 'a run with exit code 0 ends as done');
    await P.settle(11000);

    // the Editor: its own call() goes through the same list
    ok(P.w.IDE && typeof P.w.IDE.call === 'function', 'the Editor script is in the page (IDE.call)');
    let ej = null, ee = null;
    P.w.IDE.call('/api/x/ide/slowthing', { x: 1 }).then(j => { ej = j; }, e => { ee = e; });
    await P.settle(700);
    const ce = P.last('/api/x/ide/slowthing'), le = P.list();
    ok(ce && IDRX.test(ce.headers['x-arsenal-job'] || '') && ce.headers['x-arsenal-game'] && ce.body.x === 1, 'the Editor call() sends the job header next to the game header');
    ok(le.length === 1 && le[0].id === ce.headers['x-arsenal-job'], 'and is listed after 0.6 s under that id', JSON.stringify(le));
    ce.done({ error: 'nope' }, 409); await P.settle(0);
    ok(ee && ee.status === 409 && ee.message === 'nope' && P.job(le[0].id).state === 'failed', 'call() rejects as before (status on the error); the job reads Failed');
    P.w.IDE.call('/api/x/ide/status').catch(() => {}); P.w.IDE.call('/api/x/ide/quick', {}).then(j => { ej = j; });
    P.adv(100); P.last('/api/x/ide/quick').done({ q: 1 }); await P.settle(1000);
    ok(ej && ej.q === 1 && P.list().length === 1, 'an Editor poll and a short Editor request are not listed');
    await P.settle(11000);

    // a page's own reads (GET, no name, no click) share one row and vanish when they end
    {
      const api = P.IN.api; await P.settle(50);
      api('/api/x/t/own1').catch(() => {}); api('/api/x/t/own2').catch(() => {});
      await P.settle(700);
      if (!P.open()) { P.click(P.jb()); await P.settle(0); }
      const au = P.lst().querySelectorAll('[data-jobauto]'), rows = P.lst().querySelectorAll('[data-job]');
      ok(au.length === 1 && rows.length === 0 && P.jbOn(), 'two unnamed page reads: one shared row, no row each', au.length + '/' + rows.length);
      ok(P.jb().textContent.indexOf(T('job.load', { n: 2 })) === 0, 'the button reads Loading page data (2)', P.jb().textContent);
      P.last('/api/x/t/own1').done({}); P.last('/api/x/t/own2').done({}); await P.settle(50);
      ok(!P.lst().querySelector('[data-jobauto]') && !P.jbOn(), 'they leave at once when they end, with no Done line');
      if (P.open()) { P.click(P.jb()); await P.settle(0); }
    }

    // JOBS.track for work that goes around api()
    let stopN = 0, fin = null; const work = new Promise(r => { fin = r; });
    const ret = P.J.track(work, { what: 'Drawing 40 tiles', page: 'maps', cancel: () => { stopN++; } });
    ok(ret === work, 'JOBS.track returns the promise it was given');
    await P.settle(500);
    ok(P.list().length === 0, 'tracked work waits 0.6 s too');
    await P.settle(200);
    const tj = P.list()[0];
    ok(tj && tj.name === 'Drawing 40 tiles' && tj.page === 'maps' && tj.canCancel === true && IDRX.test(tj.id), 'then it is listed with its name, page and its own cancel', JSON.stringify(tj));
    P.calls.length = 0;
    ok(P.J.cancel(tj.id) === true && stopN === 1 && P.cancels().length === 0, 'JOBS.cancel(id) calls the cancel function the page gave (no server call)');
    ok(P.J.cancel(tj.id) === false && stopN === 1 && P.J.cancel('nosuchjob') === false, 'a second cancel and an unknown id return false');
    fin(1); await P.settle(0);
    ok(P.job(tj.id).state === 'done', 'the promise resolved: done');
    const t2 = P.J.track(Promise.reject(Object.assign(new Error('x'), { name: 'AbortError' })), { what: 'Aborted fetch' }); t2.catch(() => {});
    const t3 = new Promise(() => {}); P.J.track(t3, { what: 'No way to stop' });
    await P.settle(700);
    ok(!P.list().some(j => j.name === 'Aborted fetch'), 'tracked work that ended early is never listed');
    P.click(P.jb()); await P.settle(0); if (!P.open()) { P.click(P.jb()); await P.settle(0); }
    const nj = P.list().find(j => j.name === 'No way to stop'), nb = nj && P.cb(nj.id);
    await P.sync();
    const nb2 = nj && P.cb(nj.id);
    ok(nj && nb2 && nb2.disabled && nj.canCancel === false && P.row(nj.id).textContent.indexOf(EN['job.r.gone']) > 0, 'work the server does not know and with no cancel of its own cannot be stopped: greyed, with the reason', nj && P.row(nj.id).textContent);
    ok(!!nb, 'its row had a (greyed) button from the start');
  }

  // ===== 6. the page source: the poll table, CSS, the four languages
  {
    const src = /<script>([\s\S]*)<\/script>/.exec(html)[1], css = /<style>([\s\S]*?)<\/style>/.exec(html)[1];
    ok(/var JOBSKIP=\[/.test(src), 'the polls that are never listed are one table (JOBSKIP)');
    const rb = (/#jobbtn\{[^}]*\}/.exec(css) || [''])[0], rl = (/#joblist\{[^}]*\}/.exec(css) || [''])[0];
    ok(/display:flex/.test(rb) && /min-width:0/.test(rb), 'CSS: #jobbtn has a rule (it may shrink)', rb);
    ok(/position:fixed/.test(rl) && /max-height:50vh/.test(rl) && /overflow:auto/.test(rl) && /bottom:\d+px/.test(rl), 'CSS: #joblist is fixed above the bar, half the window at most, scrolls inside', rl);
    const zb = +(/z-index:(\d+)/.exec((/#jmpbar\{[^}]*\}/.exec(css) || [''])[0]) || [0, 0])[1], zl = +(/z-index:(\d+)/.exec(rl) || [0, 0])[1];
    ok(zl === zb && zl > 20 && zl < 50, 'the list sits at the z-index of the bar (' + zl + '): over the page, under menus, search lists and pickers');
    ok(/#joblist\[hidden\]\{display:none\}/.test(css) && /#jmpbar button\[hidden\]\{display:none\}/.test(css), 'hidden parts of the bar and the hidden list take no room');
    ok(!/#[0-9a-f]{3,8}\b|rgba?\(/i.test(css.split('\n').filter(l => /#job|\.jr|\.jb/.test(l)).join('\n').replace(/#(job|jmp)\w+/g, '')), 'the job rules use theme tokens only');
    ok(/@media \(max-width:700px\)\{#jmpbar[^\n]*#joblist\{bottom:\d+px\}/.test(css), 'the phone width rule covers the list');
    ok(/body\.jmpon\{padding-bottom:\d+px\}/.test(css), 'body.jmpon keeps its bottom room rule');
    const keys = Object.keys(EN).filter(k => k.indexOf('job.') === 0), miss = [];
    const need = ['job.bar', 'job.cancel', 'job.all', 'job.stopping', 'job.sure', 'job.sureN', 'job.s.running', 'job.s.done', 'job.s.failed', 'job.s.cancelled', 'job.s.timeout', 'job.r.nostop', 'job.r.nochild', 'job.r.gone', 'job.cancelled', 'job.e.nostop', 'job.work', 'job.other',
      'job.w.mapviz', 'job.w.previews', 'job.w.guides', 'job.w.docsjoin', 'job.w.botmatch', 'job.w.mapslist', 'job.w.modcheck', 'job.w.spmis', 'job.w.task', 'job.w.step'];
    ok(need.every(k => keys.indexOf(k) >= 0) && keys.length >= need.length, 'en has the job.* keys (' + keys.length + '), the server job names among them', need.filter(k => keys.indexOf(k) < 0).join(', '));
    const slots = s => [...String(s).matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',');
    const samey = /^job\.(of|name|end|sec)$/;   // made of slots and marks only: may read the same in two languages
    for (const c of ORDER) { const L = LANG(c); for (const k of keys) { const v = L[k]; if (typeof v !== 'string' || !v.trim()) miss.push(c + ' ' + k); else if (slots(v) !== slots(EN[k])) miss.push(c + ' ' + k + ' slots'); else if (c !== 'en' && v === EN[k] && !samey.test(k)) miss.push(c + ' ' + k + ' not translated'); }
      for (const k of Object.keys(L)) if (k.indexOf('job.') === 0 && !(k in EN)) miss.push(c + ' extra ' + k); }
    ok(miss.length === 0, 'en, ru, uk, zh each have every job.* key en has, with the same slots, translated', miss.join(', '));
    ok(EN['job.w.mapviz'] === 'Map picture: {map}' && EN['job.w.step'] === '{name}: step {n} of {total}' && EN['job.cancelled'] === 'Stopped', 'the names a later batch sends are worded as agreed');
  }

  // ===== 12. a hidden window (another browser tab): the idle reads wait and nothing is missed; the run line clock; the log pane; /api/mod
  {
    const P = await load(), d = P.doc, n = () => P.calls.filter(c => c.p === '/api/jobs').length;
    const vis = hid => { d.hidden = hid; d.fire('visibilitychange'); };
    await P.settle(15000); await P.settle(15000);
    const shownN = n();
    ok(shownN >= 2, 'on the screen and idle: the job list is read every 15 s', shownN);
    vis(true); await P.settle(15000);
    const hidN = n();
    await P.settle(60000); await P.settle(60000);
    ok(n() === hidN && hidN <= shownN + 1, 'hidden and idle: at most the read that was due, then none', shownN + ' ' + hidN + ' ' + n());
    P.srv = [SJ({ id: 'bhid', what: 'job.w.guides' })];
    vis(false); await P.settle(0);
    ok(n() === hidN + 1 && !!P.job('bhid'), 'seen again: one read at once, a job that started meanwhile is listed', n() - hidN + ' ' + JSON.stringify(P.list()));
    vis(true); const l0 = n(); await P.sync(); await P.sync();
    ok(n() >= l0 + 2 && P.job('bhid').state === 'running', 'hidden with a job listed: the reads go on (only the idle read waits)', n() - l0);
    P.srv = []; await P.sync(); await P.settle(10000);
    const goneN = n(); await P.settle(60000);
    ok(!P.job('bhid') && n() === goneN, 'the job ended while hidden: its row goes, then the idle read waits again', JSON.stringify(P.list()) + ' ' + (n() - goneN));
    vis(false); await P.settle(0);
    ok(n() === goneN + 1, 'seen again: read at once');
    // the run line clock: its timer stops while hidden and starts again (with the line written at once) when seen
    const iv = []; let cleared = 0;
    P.w.setInterval = (f, ms) => { iv.push({ f, ms }); return iv.length; }; P.w.clearInterval = () => { cleared++; };
    vis(true); ok(cleared === 1 && iv.length === 0, 'hidden: the run line timer is stopped', cleared + ' ' + iv.length);
    vis(true); ok(cleared === 1, 'a second hidden event stops nothing twice');
    vis(false); ok(iv.length === 1 && iv[0].ms === 1000, 'seen again: one 1 s timer runs', JSON.stringify(iv.map(x => x.ms)));
    vis(false); ok(iv.length === 1, 'a second seen event starts no second timer');
    // the log pane: with frames, one scroll to the end per frame; without, one per line (as before); same text either way
    const mkPane = () => { const L = P.IN.mkLog(); let reads = 0; Object.defineProperty(L.el, 'scrollHeight', { get() { reads++; return L.el.children.length * 10; } }); return { L, reads: () => reads }; };
    const A = mkPane(); for (let i = 0; i < 50; i++) A.L.add('o', 'line ' + i);
    ok(A.reads() === 50 && A.L.el.scrollTop === 500, 'log pane, no frames: the end is followed on every line', A.reads() + ' ' + A.L.el.scrollTop);
    const frames = []; P.w.requestAnimationFrame = f => { frames.push(f); return frames.length; };
    const B = mkPane(); for (let i = 0; i < 50; i++) B.L.add(i % 7 ? 'o' : 'e', 'line ' + i);
    ok(B.reads() === 0 && frames.length === 1, 'log pane, frames: 50 lines ask for one frame and read no layout', B.reads() + ' ' + frames.length);
    frames.splice(0).forEach(f => f());
    ok(B.reads() === 1 && B.L.el.scrollTop === 500 && B.L.lines() === A.L.lines() && B.L.el.children.length === 50, 'the frame scrolls once to the same end; the text is the same', B.reads() + ' ' + B.L.el.scrollTop);
    for (let i = 0; i < 4100; i++) B.L.add('o', 'more ' + i); frames.splice(0).forEach(f => f());
    ok(B.L.el.children.length === 4000 && B.L.el.scrollTop === 40000 && B.L.el.children[3999].textContent === 'more 4099' && B.reads() === 2, 'the 4000 line cap and the end hold over a long burst (one more layout read)', B.L.el.children.length + ' ' + B.L.el.scrollTop + ' ' + B.reads());
    delete P.w.requestAnimationFrame;
    // /api/mod: two askers of one folder share the request while it is on its way; nothing is kept once it answered
    const mq = () => P.calls.filter(c => c.p === '/api/mod'), m0 = mq().length, dir = 'F:/Games/x/mods/m1';
    const p1 = P.IN.modInfo(dir), p2 = P.IN.modInfo(dir), p3 = P.IN.modInfo(dir + '2'); let r1 = null, r2 = null;
    p1.then(j => { r1 = j; }); p2.then(j => { r2 = j; }); p3.catch(() => {});
    ok(p1 === p2 && p1 !== p3 && mq().length === m0 + 2, 'modInfo: the same folder twice in flight = one request; another folder has its own', mq().length - m0);
    P.pend.filter(c => c.p === '/api/mod' && /m1$/.test(decodeURIComponent(c.q))).forEach(c => c.done({ name: 'M1', files: 3 })); await P.settle(0);
    ok(r1 && r2 && r1.name === 'M1' && r2.files === 3, 'both askers get the answer', JSON.stringify([r1, r2]));
    const p4 = P.IN.modInfo(dir);
    ok(p4 !== p1 && mq().length === m0 + 3, 'after the answer the next call asks the server again (nothing cached)', mq().length - m0);
    let e5 = null; const p5 = P.IN.modInfo(dir); p5.catch(e => { e5 = e; }); p4.catch(() => {});
    P.pend.filter(c => c.p === '/api/mod' && /m1$/.test(decodeURIComponent(c.q))).forEach(c => c.done({ error: 'no such folder' }, 404)); await P.settle(0);
    ok(p5 === p4 && e5 && /no such folder/.test(e5.message) && P.IN.modInfo(dir) !== p4, 'a failed read reaches every asker and is not kept either', e5 && e5.message);
  }

  console.log(failN ? 'FAIL jobs: ' + failN + ' of ' + (pass + failN) : 'PASS jobs: ' + pass + ' checks');
  process.exit(failN ? 1 : 0);
})().catch(e => { console.log('FAIL jobs: ' + (e && e.stack || e)); process.exit(1); });

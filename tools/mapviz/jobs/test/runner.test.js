// jobs runner test with an injected fake run: needs first, sharing, one heavy job, two light jobs beside it, queue
// positions, cache hits, failures with their error codes, a missing product, timeout (child stops, child killed),
// cancel (running, queued, a parent of a cancelled need), the cross-process heavy lock, the needs line of a key and the
// manifest needVersions, progress lines (a broken line
// is a seeded defect), a job table row naming an unknown need (seeded defect), a need cycle, list and close.
// usage: node tools/mapviz/jobs/test/runner.test.js [scratch dir]
// Author: Imperator_Aug (ARSENAL, ia-177bb03d)
'use strict';
const fs = require('fs'), path = require('path');
const h = require('./harness')('jobs-runner');
const index = require('../index');
const table = require('../table');
const cache = require('../cache');
const { W, ok, eq, throwsCode, flush, until, sleep } = h;

const fakeCli = v => ({ version: v, run() { return 0; }, commands: {} });
const PARTS = [{ part: 'fa', id: 'MV-FA', wave: 'A', dir: 'fa', load: () => fakeCli(3) }, { part: 'fb', id: 'MV-FB', wave: 'A', dir: 'fb', load: () => fakeCli(5) }];
const T = {
  maps: { part: 'fa', cmd: 'maps', heavy: false, timeoutS: 300, needs: [], keys: [], products: ['maps.json'] },
  g: { part: 'fa', cmd: 'g', heavy: false, timeoutS: 300, needs: [], keys: ['mode'], products: ['g'] },
  d: { part: 'fa', cmd: 'd', heavy: false, timeoutS: 300, needs: [], keys: [], products: ['d.json'] },
  t: { part: 'fb', cmd: 't', heavy: true, timeoutS: 300, needs: ['g'], keys: [], products: ['t'] },
  w: { part: 'fb', cmd: 'w', heavy: true, timeoutS: 300, needs: ['d', 'g'], keys: ['mode'], products: ['w', 'w.labels'] },
  p: { part: 'fb', cmd: 'p', heavy: true, timeoutS: 300, needs: ['g', 't'], keys: ['mode', 'kind'], products: ['pass.<kind>'] },
  x: { part: 'fb', cmd: 'x', heavy: true, timeoutS: 300, needs: ['nope'], keys: [], products: ['x'] },
  s: { part: 'fb', cmd: 's', heavy: true, timeoutS: 0.3, needs: [], keys: ['size'], products: ['s'] },
  l: { part: 'fa', cmd: 'l', heavy: false, timeoutS: 300, needs: [], keys: ['size'], products: ['l'] },
};
const G = path.join(W, 'game');
fs.mkdirSync(G, { recursive: true });
const gst = fs.statSync(G);
const req = (what, o) => Object.assign({ what, target: 'mowas2', game: G, map: 'multi/x' }, o || {});

// fake run: records calls; the test finishes them by hand (call.finish) or they behave by mode
function makeFake() {
  const f = { calls: [], events: [], live: 0, maxLive: 0, heavyLive: 0, maxHeavy: 0, lightLive: 0, maxLight: 0, mode: {} };
  f.run = (argv, opt) => new Promise(resolve => {
    const cmd = argv[1], out = argv[argv.indexOf('--out') + 1];
    const heavy = T[cmd] ? T[cmd].heavy : false;
    const c = { cmd, argv, opt, out, heavy, done: false };
    f.calls.push(c); f.events.push('start ' + cmd + ' ' + (argv.includes('--mode') ? argv[argv.indexOf('--mode') + 1] : '-'));
    f.live++; f.maxLive = Math.max(f.maxLive, f.live);
    if (heavy) { f.heavyLive++; f.maxHeavy = Math.max(f.maxHeavy, f.heavyLive); } else { f.lightLive++; f.maxLight = Math.max(f.maxLight, f.lightLive); }
    c.end = (code, stderr) => {
      if (c.done) return; c.done = true;
      f.live--; if (heavy) f.heavyLive--; else f.lightLive--;
      f.events.push('end ' + cmd);
      clearInterval(c.watch);
      resolve({ code, stdout: '', stderr: stderr || '', timedOut: false });
    };
    c.finish = (code, o) => {
      o = o || {};
      if (code === 0 || code === 1) {
        if (!o.noProducts) for (const p of table.productFiles(T[cmd], { kind: argv.includes('--kind') ? argv[argv.indexOf('--kind') + 1] : 'inf' }))
          fs.writeFileSync(path.join(out, p.alt[0]), cmd);
        if (!o.noReads) fs.writeFileSync(path.join(out, 'reads.json'), JSON.stringify({ v: 1, inputs: o.inputs || [] }));
      }
      c.end(code, o.stderr);
    };
    opt.ctl.kill = () => { c.killed = true; c.end(null, 'killed'); };
    const m = f.mode[cmd];
    if (m === 'honour') c.watch = setInterval(() => { if (fs.existsSync(opt.cancelFlag)) c.end(5, 'mapviz fb: cancelled at stage x'); }, 10);
    if (m === 'ok') setImmediate(() => c.finish(0));
    if (m && m.fail) setImmediate(() => c.finish(m.fail, { stderr: m.stderr }));
  });
  f.find = (cmd, mode) => f.calls.find(c => !c.done && c.cmd === cmd && (mode === undefined || (c.argv.includes('--mode') ? c.argv[c.argv.indexOf('--mode') + 1] : null) === mode));
  return f;
}
function mk(f, o) {
  return index.create(Object.assign({ root: path.join(W, 'root-' + Math.random().toString(36).slice(2, 8)), jobs: T, parts: PARTS, run: f.run, killWaitMs: 150, pollMs: 20, lockPollMs: 40 }, o || {}));
}
const lockNames = r => { try { return fs.readdirSync(path.join(r.cache.root, 'locks')); } catch (e) { return []; } };
const jobOf = (r, what) => [...r.list().running, ...r.list().queued].find(j => j.what === what);

(async () => {
  // ---- 1. needs first, sharing, the heavy slot, light jobs, queue positions ----
  {
    const f = makeFake(), r = mk(f);
    eq(r.problems, ['job x: need nope is not a job'], 'the runner reports the bad row of its table');
    const s1 = r.submit(req('p', { mode: 'm1', kind: 'tank' }));
    const s2 = r.submit(req('p', { mode: 'm1', kind: 'tank', side: 'a' }));
    ok(s1.shared === false && s2.shared === true && s2.id === s1.id, 'identical requests share one job (a non-key field differs)');
    const sw = r.submit(req('w', { mode: 'm1' }));
    ok(sw.id !== s1.id && !sw.shared, 'another job gets its own id');
    await flush();
    ok(f.lightLive === 2 && f.heavyLive === 0, 'two light jobs run, no heavy job before its needs (' + f.events.join('; ') + ')');
    const L = r.list();
    eq(L.running.map(j => j.what + ':' + j.queue), ['g:0', 'g:0'], 'running: g(m1) and g(null), queue 0');
    eq(L.queued.map(j => j.what + ':' + j.queue), ['t:1', 'p:2', 'd:1', 'w:3'], 'queued in submit order with positions per slot');
    eq(Object.keys(r.status(s1.id)), ['id', 'what', 'key', 'state', 'stage', 'done', 'total', 'elapsed', 'queue'], 'job record fields (README 6.3)');
    f.find('g', 'm1').finish(0);
    await until(() => f.find('d'));
    ok(!!f.find('d') && !f.find('t'), 'the queued light job d starts when a light slot frees; t still waits for its need');
    f.find('g', null).finish(0);
    await until(() => f.find('t'));
    ok(r.status(jobOf(r, 't').id).state === 'running' && r.status(s1.id).queue === 1 && r.status(sw.id).queue === 2, 'heavy t runs; p and w queue 1 and 2');
    f.find('d').finish(0);
    await flush(); await sleep(30);
    ok(f.heavyLive === 1 && !f.find('w'), 'w is ready but waits for the heavy slot');
    const tcall = f.find('t');
    tcall.finish(0);
    await until(() => f.find('p'));
    ok(!!f.find('p') && !f.find('w'), 'p (submitted before w) takes the heavy slot first');
    const pa = f.find('p').argv;
    const gKey = cache.entryKey(Object.assign(req('g', { mode: 'm1' }), { jobs: T, parts: PARTS }));
    const tKey = cache.entryKey(Object.assign(req('t'), { jobs: T, parts: PARTS }));
    const ins = pa.filter((a, i) => pa[i - 1] === '--in');
    eq(ins, [path.join(r.cache.root, 'e', gKey), path.join(r.cache.root, 'e', tKey)], 'p gets its needs entry folders as --in, in need order');
    ok(pa[0] === 'fb' && pa[1] === 'p' && pa.join(' ').includes('--mode m1 --kind tank') && pa.includes('--progress') && pa.includes('--cancel-flag') && pa.includes('-q'), 'p command line: part, command, key flags, progress, cancel flag');
    ok(pa[pa.indexOf('--game') + 1] === path.resolve(G) && pa[pa.indexOf('--target') + 1] === 'mowas2' && pa[pa.indexOf('--map') + 1] === 'multi/x', 'p command line: target, game, map');
    ok(pa[pa.indexOf('--out') + 1] === path.join(r.cache.root, 'jobs', s1.id, 'out'), 'products go to jobs/<id>/out');
    f.find('p').finish(0, { inputs: [{ kind: 'loose', file: G, size: gst.size, mtimeMs: gst.mtimeMs }] });
    await until(() => f.find('w'));
    f.find('w').finish(0);
    const jp = await r.wait(s1.id), jw = await r.wait(sw.id);
    ok(jp.state === 'done' && jw.state === 'done', 'p and w done');
    eq(jp.result, { entry: jp.key, products: ['pass.tank.mvg'] }, 'p result: entry key and products');
    eq(jw.result.products, ['w.labels.mvg', 'w.mvg'], 'w result products');
    ok(f.maxHeavy === 1 && f.maxLight <= 2, 'never more than one heavy and two light jobs (' + f.maxHeavy + ', ' + f.maxLight + ')');
    const order = f.events.join('; ');
    const at = s => f.events.indexOf(s);
    ok(at('end g') < at('start t -') && at('end t') < at('start p m1') && at('end d') < at('start w m1'), 'every job started after its needs ended (' + order + ')');
    const m = JSON.parse(fs.readFileSync(path.join(r.cache.root, 'e', jp.key, 'manifest.json'), 'utf8'));
    eq(m.deps.map(d => d.what + ':' + d.key), ['g:' + gKey, 't:' + tKey], 'manifest deps = the needs with their keys');
    ok(m.part === 'fb' && m.partVersion === 5 && m.variant.kind === 'tank' && m.variant.mode === 'm1' && m.map === 'multi/x' && m.inputs.length === 1, 'manifest part, version, variant, map, inputs from reads.json');
    eq(m.needVersions, { fa: 3, fb: 5 }, 'manifest needVersions = the parts below p (g on fa, t on fb), the needs line of its key');
    ok(jp.key === cache.entryKey(Object.assign(req('p', { mode: 'm1', kind: 'tank' }), { jobs: T, parts: PARTS })), 'the runner key = entryKey with the needs followed in its job table');
    ok(!fs.existsSync(path.join(r.cache.root, 'jobs', s1.id, 'out')), 'out/ moved into the entry');
    ok(fs.existsSync(path.join(r.cache.root, 'jobs', s1.id, 'job.json')) && JSON.parse(fs.readFileSync(path.join(r.cache.root, 'jobs', s1.id, 'job.json'), 'utf8')).state === 'done', 'job.json holds the final state');
    eq(lockNames(r), [], 'no lock left after the jobs');
    const n = f.calls.length;
    const again = r.submit(req('p', { mode: 'm1', kind: 'tank' }));
    ok(again.state === 'done' && again.id !== s1.id && f.calls.length === n, 'a later identical request is a cache hit (no run)');
    ok(r.status(again.id).result.entry === jp.key, 'the cache hit answers the same entry');
    const ld = r.list().done;
    ok(ld.length <= 20 && ld[0].id === again.id, 'list done: newest first');
    ok(jp.elapsed >= 0 && r.status(s1.id).elapsed === jp.elapsed, 'elapsed is fixed once done');
    await r.close();
  }

  // ---- 2. failures and their codes ----
  {
    const f = makeFake(), r = mk(f);
    f.mode.l = { fail: 3, stderr: 'mapviz fa: no map multi/x' };
    const a = await r.wait(r.submit(req('l', { size: 64 })).id);
    ok(a.state === 'failed' && a.error.code === 'MV_NOT_FOUND' && /no map multi\/x/.test(a.error.msg), 'exit 3 -> failed MV_NOT_FOUND with the message (' + JSON.stringify(a.error) + ')');
    ok(r.cache.open(a.key) === null && !fs.existsSync(path.join(r.cache.root, 'jobs', a.id, 'out')), 'a failed job leaves no entry and no out/');
    f.mode.l = { fail: 2, stderr: 'mapviz fa: fault: boom' };
    const b = await r.wait(r.submit(req('l', { size: 65 })).id);
    ok(b.error.code === 'MV_FAULT', 'exit 2 with fault -> MV_FAULT');
    f.mode.l = { fail: 2, stderr: 'mapviz fa: flag --x is not known here' };
    const c = await r.wait(r.submit(req('l', { size: 66 })).id);
    ok(c.error.code === 'MV_USAGE', 'exit 2 without fault -> MV_USAGE');
    f.mode.l = { fail: 4, stderr: 'mapviz fa: not built (MV-FA, wave A)' };
    ok((await r.wait(r.submit(req('l', { size: 67 })).id)).error.code === 'MV_NOT_BUILT', 'exit 4 -> MV_NOT_BUILT');
    f.mode.l = { fail: 6, stderr: 'mapviz fa: refused' };
    ok((await r.wait(r.submit(req('l', { size: 68 })).id)).error.code === 'MV_REFUSED', 'exit 6 -> MV_REFUSED');
    f.mode.l = { fail: 1 };
    const fd = await r.wait(r.submit(req('l', { size: 69 })).id);
    ok(fd.state === 'done' && r.cache.readManifest(fd.key).notes.some(n => n.code === 'JOBS_FINDINGS'), 'exit 1 (findings) is done, with a note');
    // a failing need fails its parent with the need's code
    f.mode.g = { fail: 6, stderr: 'mapviz fa: refused' };
    const t = await r.wait(r.submit(req('t', { map: 'multi/y' })).id);
    ok(t.state === 'failed' && t.error.code === 'MV_REFUSED' && /need g ended failed/.test(t.error.msg), 'a failed need fails the parent with its code (' + JSON.stringify(t.error) + ')');
    f.mode.g = 'ok';
    // missing product
    f.mode.l = undefined;
    const sm = r.submit(req('l', { size: 70 }));
    await until(() => f.find('l'));
    f.find('l').finish(0, { noProducts: true });
    const mp = await r.wait(sm.id);
    ok(mp.state === 'failed' && mp.error.code === 'MV_FAULT' && /wrote no l/.test(mp.error.msg), 'a missing product fails the job, nothing enters the cache');
    // no reads.json -> note
    const sn = r.submit(req('l', { size: 71 }));
    await until(() => f.find('l'));
    f.find('l').finish(0, { noReads: true });
    const nr = await r.wait(sn.id);
    ok(nr.state === 'done' && r.cache.readManifest(nr.key).notes.some(n => n.code === 'JOBS_NO_READS'), 'no reads.json: done with note JOBS_NO_READS');
    // run throws
    const r2 = mk({ run() { throw new Error('spawn broke'); } });
    const th = await r2.wait(r2.submit(req('l', { size: 72 })).id);
    ok(th.state === 'failed' && th.error.code === 'MV_FAULT' && /spawn broke/.test(th.error.msg), 'a run that throws fails the job with MV_FAULT');
    eq(lockNames(r2), [], 'no lock left after a throw');
    await r.close(); await r2.close();
  }

  // ---- 3. timeout and cancel ----
  {
    const f = makeFake(), r = mk(f);
    f.mode.s = 'honour';
    const t0 = Date.now();
    const a = await r.wait(r.submit(req('s', { size: 100 })).id);
    const dt = Date.now() - t0;
    ok(a.state === 'timeout' && a.error.code === 'MV_CANCELLED' && /timed out after 0.3 s/.test(a.error.msg), 'timeout: flag written, child exits 5, state timeout (' + JSON.stringify(a.error) + ')');
    ok(dt >= 280 && dt < 60000, 'timeout after about timeoutS (' + dt + ' ms)');   // upper bound loose: a busy PC is late, never early
    ok(!f.calls[0].killed, 'a child that stops on the flag is not killed');
    f.mode.s = undefined;   // hangs: never looks at the flag
    const t1 = Date.now();
    const sb = r.submit(req('s', { size: 101 }));
    const b = await r.wait(sb.id);
    const dt2 = Date.now() - t1;
    const hc = f.calls[1];
    ok(b.state === 'timeout' && hc.killed && dt2 >= 430, 'a child that ignores the flag is killed after the kill wait (' + dt2 + ' ms)');
    ok(fs.existsSync(path.join(r.cache.root, 'jobs', sb.id, 'cancel')), 'the cancel flag was written before the kill');
    ok(r.cache.open(b.key) === null && !fs.existsSync(path.join(r.cache.root, 'jobs', sb.id, 'out')) && lockNames(r).length === 0, 'a killed child leaves no entry, no out/ and no lock');
    // cancel running (child honours)
    f.mode.t = 'honour';
    f.mode.g = 'ok';
    const st = r.submit(req('t', { map: 'multi/c' }));
    await until(() => f.find('t'));
    ok(r.cancel(st.id) === true, 'cancel a running job answers true');
    ok(fs.existsSync(path.join(r.cache.root, 'jobs', st.id, 'cancel')), 'cancel writes the flag file');
    const c = await r.wait(st.id);
    ok(c.state === 'cancelled' && c.error.code === 'MV_CANCELLED', 'state cancelled');
    ok(r.cache.open(c.key) === null && lockNames(r).length === 0, 'a cancelled job leaves no entry and no lock');
    const gk = cache.entryKey(Object.assign(req('g', { map: 'multi/c' }), { jobs: T, parts: PARTS }));
    ok(r.cache.open(gk, { touch: false }), 'its finished need stays cached');
    ok(r.cancel(st.id) === false && r.cancel('nope') === false, 'cancel of a finished or unknown job answers false');
    // cancel queued, and its parent
    f.mode.g = undefined; f.mode.t = undefined;
    const sp = r.submit(req('p', { map: 'multi/q' }));
    await until(() => f.find('g'));
    const tq = jobOf(r, 't');
    ok(tq && tq.state === 'queued', 't is queued behind its need');
    ok(r.cancel(tq.id) && r.status(tq.id).state === 'cancelled', 'cancel a queued job: cancelled at once');
    const pp = await r.wait(sp.id);
    ok(pp.state === 'failed' && pp.error.code === 'MV_CANCELLED', 'its parent fails with MV_CANCELLED');
    f.find('g').finish(0);
    await r.close();
  }

  // ---- 4. the heavy lock across processes, close ----
  {
    const f = makeFake(), r = mk(f);
    f.mode.g = 'ok';
    const other = cache.at(r.cache.root).lock('heavy', { what: 'other process' });
    const sx = r.submit(req('t', { map: 'multi/h' }));
    await until(() => r.status(sx.id).stage === 'wait'); await sleep(50);   // 50 ms: room for a start that must not come
    ok(r.status(sx.id).state === 'queued' && r.status(sx.id).stage === 'wait' && !f.find('t'), 'a heavy job waits while another process holds the heavy slot');
    other.release();
    await until(() => f.find('t'));
    ok(!!f.find('t'), 'it starts once the slot is free');
    f.find('t').finish(0);
    ok((await r.wait(sx.id)).state === 'done', 'and ends done');
    // a key lock held by another process: wait, then a cache hit when that process made it
    const kk = cache.entryKey(Object.assign(req('l', { size: 300 }), { jobs: T, parts: PARTS }));
    const otherKey = cache.at(r.cache.root).lock(kk, { what: 'l' });
    const sl = r.submit(req('l', { size: 300 }));
    await sleep(100);
    ok(r.status(sl.id).state === 'queued' && !f.find('l'), 'a job waits while another process runs the same key');
    const od = path.join(W, 'other-out'); fs.mkdirSync(od, { recursive: true }); fs.writeFileSync(path.join(od, 'l.mvg'), 'x');
    cache.at(r.cache.root).commit(kk, od, { what: 'l', part: 'fa' });
    otherKey.release();
    const lj = await r.wait(sl.id);
    ok(lj.state === 'done' && !f.find('l') && f.calls.every(c => c.cmd !== 'l'), 'then it takes the other process\'s entry without a run');
    // close cancels queued and running
    f.mode.s = 'honour';
    const s1 = r.submit(req('s', { size: 500 })), s2 = r.submit(req('s', { size: 501 }));
    await until(() => f.find('s'));
    await r.close();
    ok(r.status(s1.id).state === 'cancelled' && r.status(s2.id).state === 'cancelled', 'close cancels running and queued jobs and waits');
    throwsCode(() => r.submit(req('l')), 'MV_BUSY', 'a closed runner takes no job');
  }

  // ---- 5. seeded defects: an unknown need, a need cycle, broken progress lines ----
  {
    const f = makeFake(), r = mk(f);
    const sx = r.submit(req('x'));
    ok(sx.state === 'failed' && r.status(sx.id).error.code === 'MV_FAULT' && /need nope of x is not a job/.test(r.status(sx.id).error.msg), 'a job table row naming an unknown need: the job fails with MV_FAULT');
    eq(table.check(table.JOBS), [], 'the real job table is sound');
    const cyc = { a: { part: 'fa', cmd: 'a', heavy: false, timeoutS: 1, needs: ['b'], keys: [], products: ['a'] }, b: { part: 'fa', cmd: 'b', heavy: false, timeoutS: 1, needs: ['a'], keys: ['bogus'], products: [] } };
    const pr = table.check(cyc);
    ok(pr.some(p => /need cycle/.test(p)) && pr.some(p => /key bogus/.test(p)) && pr.some(p => /products is empty/.test(p)), 'table.check finds a cycle, a bad key and empty products (' + pr.join('; ') + ')');
    const rc = mk(f, { jobs: cyc });
    throwsCode(() => rc.submit(req('a')), 'MV_FAULT', 'a need cycle is refused at submit');
    throwsCode(() => r.submit(req('zz')), 'MV_USAGE', 'an unknown job is refused');
    throwsCode(() => r.submit(req('l', { target: 'nope' })), 'MV_USAGE', 'a bad target is refused');
    const rnb = mk(f, { parts: [PARTS[0]] });
    throwsCode(() => rnb.submit(req('t')), 'MV_FAULT', 'a job whose part is missing from the parts table is refused');
    const rnb2 = mk(f, { parts: [PARTS[0], { part: 'fb', id: 'MV-FB', wave: 'A', dir: 'fb', load: () => null }] });
    throwsCode(() => rnb2.submit(req('t')), 'MV_NOT_BUILT', 'a job whose part is not built is refused with MV_NOT_BUILT');
    // progress lines
    const sl = r.submit(req('l', { size: 200 }));
    await until(() => f.find('l'));
    const c = f.find('l');
    fs.appendFileSync(c.opt.progress, '{"t":1,"stage":"read","done":0,"total":2}\nnot json at all\n[1,2]\n{"t":5,"stage":"tiles","done":3,"total":9}\n{"t":6,"stage":"til');
    await until(() => r.status(sl.id).stage === 'tiles');
    const s = r.status(sl.id);
    ok(s.stage === 'tiles' && s.done === 3 && s.total === 9, 'progress lines reach the job record (' + JSON.stringify(s) + ')');
    fs.appendFileSync(c.opt.progress, 'es","done":4,"total":9}\n{"t":9,"end":"done","code":0}\n');
    await until(() => r.status(sl.id).done === 4);
    ok(r.status(sl.id).done === 4, 'a half-written line is read once it is complete');
    c.finish(0);
    const done = await r.wait(sl.id);
    const notes = r.cache.readManifest(done.key).notes;
    ok(notes.some(n => n.code === 'JOBS_PROGRESS_BAD_LINES' && /^2 /.test(n.text)), 'seeded defect: the broken progress lines are counted and noted (' + JSON.stringify(notes) + ')');
    const st = index.readProgress(c.opt.progress);
    ok(st.lines === 3 && st.bad === 2 && st.end && st.end.end === 'done' && st.end.code === 0 && st.rest === '', 'readProgress: lines, bad lines, end line');
    eq(index.readProgress(path.join(W, 'none.jsonl')).lines, 0, 'readProgress of a missing file');
    await r.close(); await rc.close(); await rnb.close(); await rnb2.close();
  }

  // ---- 6. maps (no map key), list shape ----
  {
    const f = makeFake(), r = mk(f);
    f.mode.maps = 'ok';
    const a = r.submit({ what: 'maps', target: 'goh', game: G });
    const j = await r.wait(a.id);
    ok(j.state === 'done' && !f.calls[0].argv.includes('--map'), 'maps runs without --map');
    ok(r.submit({ what: 'maps', target: 'goh', game: G, map: 'multi/zzz' }).state === 'done', 'maps with any map is the same entry');
    const L = r.list();
    eq(Object.keys(L), ['running', 'queued', 'done'], 'list shape');
    await r.close();
  }

  // ---- 7. buildArgv and codeOf ----
  {
    const c = cache.canon(req('p', { mods: ['m1', 'm2'], modDirs: [path.join(W, 'md')], mode: 'combat', kind: 'at' }), T.p);
    const a = index.buildArgv(T.p, c, 'O', ['I1', 'I2'], 'P', 'F');
    eq(a, ['fb', 'p', '--target', 'mowas2', '--game', path.resolve(G), '--mods', 'm1,m2', '--mod-dir', path.join(W, 'md'), '--map', 'multi/x', '--mode', 'combat', '--kind', 'at',
      '--in', 'I1', '--in', 'I2', '--out', 'O', '--progress', 'P', '--cancel-flag', 'F', '-q', '--json'], 'buildArgv: the full command line (with --json)');
    eq(index.codeOf({ code: null, stderr: '' }), 'MV_FAULT', 'codeOf: killed -> MV_FAULT');
    eq(index.codeOf({ code: 7, stderr: '' }), 'MV_BUSY', 'codeOf: 7 -> MV_BUSY');
    const jl = code => JSON.stringify({ v: 1, error: { code, msg: 'x', part: 'jobs' } });
    eq(index.codeOf({ code: 2, stdout: jl('MV_FAULT') + '\n', stderr: 'mapviz jobs: cutTile gave no 256 x 256 picture for tile 0/0_0\n' }), 'MV_FAULT', 'codeOf: an MvError MV_FAULT (no fault: prefix) is read from the --json error line');
    eq(index.codeOf({ code: 2, stdout: jl('MV_USAGE'), stderr: 'mapviz fb: fault: oops' }), 'MV_USAGE', 'codeOf: the --json line wins over the stderr text');
    eq(index.codeOf({ code: 2, stdout: '', stderr: 'mapviz jobs: bad --z' }), 'MV_USAGE', 'codeOf: no --json line: the stderr rule (MV_USAGE)');
    eq(index.codeOf({ code: 2, stdout: '{"v":1,"error":{"code":"MV_FAU', stderr: 'mapviz fb: fault: x' }), 'MV_FAULT', 'seeded defect: a cut --json line falls back to the stderr rule');
    eq(index.codeOf({ code: 3, stdout: jl('MV_BUSY'), stderr: '' }), 'MV_NOT_FOUND', 'codeOf: a --json code that does not fit the exit code is not trusted');
    eq(index.codeOf({ code: 4, stdout: '{"v":1,"maps":[]}\n' + jl('MV_NOT_BUILT') + '\n' }), 'MV_NOT_BUILT', 'codeOf: the last error line of stdout');
  }

  // ---- 8. a refused need queues nothing: the needs this submit queued are taken back ----
  {
    const P2 = PARTS.concat([{ part: 'fc', id: 'MV-FC', wave: 'B', dir: 'fc', load: () => null }]);
    const T2 = Object.assign({}, T, {
      nb: { part: 'fc', cmd: 'nb', heavy: false, timeoutS: 300, needs: [], keys: [], products: ['nb'] },
      q: { part: 'fb', cmd: 'q', heavy: true, timeoutS: 300, needs: ['t', 'nb'], keys: [], products: ['q'] },
    });
    const f = makeFake(), r = mk(f, { jobs: T2, parts: P2 });
    f.mode.g = 'ok'; f.mode.t = 'ok';
    let code = null;
    try { r.submit(req('q')); } catch (e) { code = e.code; }
    eq(code, 'MV_NOT_BUILT', 'submit q (needs t, then nb whose part is not built) throws MV_NOT_BUILT');
    await flush(); await sleep(60); await flush();
    const L = r.list();
    eq([f.calls.length, L.queued.length, L.running.length], [0, 0, 0], 'nothing ran or stays queued: t and g were taken back');
    // a shared need queued by an earlier submit stays
    const gs = r.submit(req('g'));
    let code2 = null;
    try { r.submit(req('q')); } catch (e) { code2 = e.code; }
    const gst2 = r.status(gs.id);
    ok(code2 === 'MV_NOT_BUILT' && gst2 && ['queued', 'running', 'done'].includes(gst2.state), 'a need queued by an earlier submit is left alone (' + (gst2 && gst2.state) + ')');
    await r.wait(gs.id);
    ok(f.calls.map(c => c.cmd).join() === 'g', 'only the job asked for on its own ran (' + f.calls.map(c => c.cmd).join() + ')');
    await r.close();
  }

  // ---- 9. watch: every change of a queued job is told (the GUI job list hangs here) ----
  {
    const f = makeFake(), r = mk(f), ev = [];
    const un = r.watch(e => { ev.push(e); if (e.state === 'done') throw new Error('a watcher fault is ignored'); });
    const st = r.submit(req('t'));                       // t needs g: two jobs, both queued by this one submit
    const sh = r.submit(req('t'));                       // the same request again: shared, nothing new told
    eq([sh.shared, ev.map(e => e.what + ':' + e.state).join()], [true, 'g:queued,t:queued'], 'watch: one queued event per job, needs first; a shared submit tells nothing');
    eq(Object.keys(ev[0]), ['id', 'what', 'state', 'stage', 'done', 'total', 'target', 'map'], 'watch: the event fields');
    eq([ev[1].id, ev[1].target, ev[1].map], [st.id, 'mowas2', 'multi/x'], 'watch: id, target and map of the job');
    await until(() => f.find('g'));
    ok(ev.some(e => e.what === 'g' && e.state === 'running'), 'watch: running is told');
    const gc = f.find('g'), gp = gc.argv[gc.argv.indexOf('--progress') + 1];
    fs.appendFileSync(gp, JSON.stringify({ stage: 'read', done: 2, total: 5 }) + '\n');
    await until(() => ev.some(e => e.what === 'g' && e.stage === 'read'));
    const pe = ev.find(e => e.what === 'g' && e.stage === 'read');
    eq(pe && [pe.state, pe.done, pe.total], ['running', 2, 5], 'watch: a new stage and count is told');
    const n0 = ev.length;
    await sleep(80);
    eq(ev.length, n0, 'watch: an unchanged progress is not told again');
    gc.finish(0);
    await until(() => f.find('t'));
    ok(ev.some(e => e.what === 'g' && e.state === 'done'), 'watch: the end of the need is told (the throwing watcher did not stop the runner)');
    r.cancel(st.id);
    f.find('t').end(5, 'cancelled');
    await r.wait(st.id);
    const last = ev[ev.length - 1];
    eq([last.what, last.state], ['t', 'cancelled'], 'watch: a cancelled job ends cancelled');
    // a cache hit is never told; unwatch stops the telling
    const n1 = ev.length;
    const hit = r.submit(req('g'));
    eq([hit.state, ev.length], ['done', n1], 'watch: a cache hit at submit is not told');
    un();
    f.mode.d = 'ok';
    await r.wait(r.submit(req('d')).id);
    eq(ev.length, n1, 'watch: nothing after unwatch');
    // a refused submit tells nothing of the needs it took back
    const P2 = PARTS.concat([{ part: 'fc', id: 'MV-FC', wave: 'B', dir: 'fc', load: () => null }]);
    const T2 = Object.assign({}, T, { nb: { part: 'fc', cmd: 'nb', heavy: false, timeoutS: 300, needs: [], keys: [], products: ['nb'] },
      q: { part: 'fb', cmd: 'q', heavy: true, timeoutS: 300, needs: ['t', 'nb'], keys: [], products: ['q'] } });
    const f2 = makeFake(), r2 = mk(f2, { jobs: T2, parts: P2 }), ev2 = [];
    r2.watch(e => ev2.push(e));
    try { r2.submit(req('q')); } catch (e) { /* MV_NOT_BUILT */ }
    await flush();
    eq(ev2.length, 0, 'watch: a refused submit tells nothing');
    await r.close(); await r2.close();
  }

  h.end();
})().catch(e => { console.log('FAIL mapviz jobs-runner: ' + (e && e.stack || e)); process.exit(1); });

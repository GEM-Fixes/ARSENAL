// jobs pool test: n children at once, one at a time with n 1, a failing kernel (throw, exit code, absent), a kernel
// outside tools/mapviz refused (in the pool and in the child), io writes only into task.out (seeded defect: an escape),
// grids and PNG through io, the cancel flag reaching children, close, the `work` command in process and its refusals.
// usage: node tools/mapviz/jobs/test/pool.test.js [scratch dir]
// Author: Imperator_Aug (ARSENAL, ia-2518f711)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), { spawnSync } = require('../../../lib/test/wait');   // wait.js spawnSync: limit at least 5 min, killed by it -> WAIT and one rerun with twice the limit
const h = require('./harness')('jobs-pool');
const pool = require('../pool');
const cli = require('../cli');
const { W, ok, eq, throwsCode } = h;

const MVJS = path.resolve(__dirname, '..', '..', 'mapviz.js');
const out = n => { const d = path.join(W, 'out-' + n); fs.rmSync(d, { recursive: true, force: true }); return d; };
const probe = (d, name) => JSON.parse(fs.readFileSync(path.join(d, (name || 'probe') + '.json'), 'utf8'));

(async () => {
  // ---- n ----
  {
    const n = pool.defaultN(), cpus = typeof os.availableParallelism === 'function' ? os.availableParallelism() : os.cpus().length;
    ok(n >= 1 && n <= Math.max(1, cpus - 1), 'default n within 1 .. cpus - 1 (' + n + ')');
    eq(pool.defaultN({ cpus: 8, freemem: 1.5 * 1024 * 1024 * 1024 }), 3, 'RAM budget: 1.5 GB free / 512 MB = 3 children');
    eq(pool.defaultN({ cpus: 4, freemem: 64 * 1024 * 1024 * 1024 }), 3, 'cpus - 1 when RAM is plenty');
    eq(pool.defaultN({ cpus: 1, freemem: 0 }), 1, 'at least one child');
  }

  // ---- kernel names ----
  {
    ok(pool.kernelFile('jobs/kprobe') === path.join(path.dirname(MVJS), 'jobs', 'kprobe.js'), 'jobs/kprobe names jobs/kprobe.js');
    ok(pool.kernelFile('render/l1tile') && pool.kernelFile('lib/raster/kshade') && pool.kernelFile('paint/staff/kdraw'), 'kernels in part folders (and a paint style folder) pass the name rule');
    for (const bad of ['../x', 'jobs/../x', 'edshot/kshot', 'lib/kx', 'jobs/test/kfake', '/abs/x', 'C:/x/y', 'Render/x', 'render', 'jobs/k.js', 'nopart/k', 'jobs/kprobe/', 'render/sub/k', 'lib/raster/x/k', 'paint/staff/deep/k'])
      throwsCode(() => pool.kernelFile(bad), 'MV_USAGE', 'kernel ' + bad + ' is refused');
  }

  // ---- n children at once ----
  {
    const p = pool.create({ n: 3 });
    ok(p.n === 3, 'n given');
    // the overlap needs the three children started within 700 ms: a busy PC may start them later, so a miss runs once more
    // with 5 s each after a WAIT line (backup, not a time-only FAIL)
    let t0, d, rs, dt, pr, ms = 700;
    for (let round = 0; ; round++, ms = 5000) {
      t0 = Date.now(); d = out('par' + (round || ''));
      rs = await Promise.all(['a', 'b', 'c'].map(name => p.run('jobs/kprobe', { inputs: ['x'], args: { mode: 'ok', ms, name }, out: d })));
      dt = Date.now() - t0;
      pr = ['a', 'b', 'c'].map(n => probe(d, n));
      if (round || Math.max(...pr.map(x => x.start)) < Math.min(...pr.map(x => x.end))) break;
      process.stderr.write('WAIT mapviz jobs-pool: three children of 700 ms did not overlap on a busy PC, run once more with 5 s each\n');
    }
    ok(rs.every(r => r.code === 0), 'three kernels exit 0');
    ok(Math.max(...pr.map(x => x.start)) < Math.min(...pr.map(x => x.end)), 'they ran at the same time (' + dt + ' ms for 3 x ' + ms + ' ms)');
    ok(new Set(pr.map(x => x.pid)).size === 3 && !pr.some(x => x.pid === process.pid), 'three child processes');
    ok(pr.every(x => x.kernel === 'jobs/kprobe' && x.inputs === 1), 'the task file reached the kernel');
    h.note('pool: 3 children x ' + ms + ' ms in ' + dt + ' ms');
    // failing kernels
    eq((await p.run('jobs/kprobe', { args: { mode: 'code', code: 1 }, out: out('c1') })).code, 1, 'a kernel exit code is the result');
    const th = await p.run('jobs/kprobe', { args: { mode: 'throw' }, out: out('th') });
    ok(th.code === 2 && /failed on purpose/.test(th.stderr), 'a kernel that throws -> exit 2 with its message');
    const bm = await p.run('jobs/kprobe', { args: { mode: 'nomode' }, out: out('nm') });
    ok(bm.code === 2, 'a kernel error -> exit 2');
    const ab = await p.run('jobs/knone', { args: {}, out: out('ab') });
    ok(ab.code === 3 && /no kernel jobs\/knone/.test(ab.stderr), 'an absent kernel -> exit 3 (' + ab.stderr.trim() + ')');
    const rf = await p.run('../lib/x', { args: {}, out: out('rf') });
    ok(rf.code === 2 && /tools\/mapviz/.test(rf.stderr), 'a kernel outside tools/mapviz is refused, no child');
    const es = await p.run('jobs/kprobe', { args: { mode: 'escape', name: 'esc' }, out: out('es') });
    ok(es.code === 2 && /writes only into task\.out/.test(es.stderr) && !fs.existsSync(path.join(W, 'esc-escaped.mvg')), 'seeded defect: a kernel writing outside task.out is refused');
    const gd = out('gd');
    eq([(await p.run('jobs/kprobe', { args: { mode: 'grid' }, out: gd })).code, probe(gd).sum], [0, 10], 'io.writeGrid and io.readGrid (gridfile.js)');
    const pd = out('pd');
    eq([(await p.run('jobs/kprobe', { args: { mode: 'png' }, out: pd })).code, probe(pd).rgba], [0, [10, 20, 30, 255]], 'io.writePng and io.readPng (png.js)');
    ok((await p.run('jobs/kprobe', { args: {} })).code === 2, 'a task without out is refused');
    await p.close();
    ok(!fs.existsSync(p.dir), 'close removes the pool temp folder');
  }

  // ---- one at a time ----
  {
    const p = pool.create({ n: 1, dir: path.join(W, 'pool1') });
    const d = out('seq');
    await Promise.all(['a', 'b'].map(name => p.run('jobs/kprobe', { args: { mode: 'ok', ms: 200, name }, out: d })));
    const a = probe(d, 'a'), b = probe(d, 'b');
    ok(b.start >= a.end || a.start >= b.end, 'n 1: one child at a time');
    ok(fs.readdirSync(path.join(W, 'pool1')).length === 0, 'task files are removed after each child');
    await p.close();
    ok(fs.existsSync(path.join(W, 'pool1')), 'a given dir is kept by close');
  }

  // ---- cancel reaches the children ----
  {
    const flag = path.join(W, 'cancel.flag');
    const p = pool.create({ n: 2, cancelFlag: flag });
    const t0 = Date.now();
    const runs = [p.run('jobs/kprobe', { args: { mode: 'wait', ms: 120000, name: 'w1' }, out: out('w1') }), p.run('jobs/kprobe', { args: { mode: 'wait', ms: 120000, name: 'w2' }, out: out('w2') }),
      p.run('jobs/kprobe', { args: { mode: 'wait', ms: 120000, name: 'w3' }, out: out('w3') })];
    await h.sleep(600);
    fs.writeFileSync(flag, '1');
    const rs = await Promise.all(runs);
    const dt = Date.now() - t0;
    eq(rs.map(r => r.code), [5, 5, 5], 'the cancel flag stops running children (exit 5) and the queued one');
    ok(dt < 60000, 'they stopped soon after the flag, not after their 120 s (' + dt + ' ms)');   // loose: a busy PC is slow, never 120 s
    ok(!fs.existsSync(path.join(W, 'out-w1', 'w1.json')), 'a cancelled kernel wrote no product');
    let late;   // W.fast: over 200 ms (a busy PC) it asks once more and keeps the better time
    const lf = await require('../../../lib/test/wait').fast(async () => { late = await p.run('jobs/kprobe', { args: {}, out: out('late') }); }, 200, { who: 'mapviz jobs-pool', what: 'a task asked after the flag' });
    ok(late.code === 5 && lf.ok, 'a task asked after the flag answers 5 without a child (' + lf.ms + ' ms)');
    await p.close();
    const p2 = pool.create({ n: 1 });
    const a = p2.run('jobs/kprobe', { args: { mode: 'wait', ms: 20000 }, out: out('cl1') }), b = p2.run('jobs/kprobe', { args: {}, out: out('cl2') });
    await h.sleep(300);
    await p2.close();
    const ra = await a, rb = await b;
    ok(rb.code === 5 && ra.code !== 0, 'close kills running children and answers the queue with 5 (' + ra.code + ', ' + rb.code + ')');
  }

  // ---- the work command ----
  {
    const tf = path.join(W, 'task.json'), d = out('work');
    fs.writeFileSync(tf, JSON.stringify({ v: 1, kernel: 'jobs/kprobe', inputs: [], args: { mode: 'ok' }, out: d }));
    eq(await cli.run(['work', 'jobs/kprobe', '--task', tf]), 0, 'work in process: exit 0');
    ok(probe(d).kernel === 'jobs/kprobe', 'work gave the kernel its task');
    fs.writeFileSync(tf, JSON.stringify({ v: 1, kernel: 'jobs/kprobe', args: { mode: 'code', code: 4 }, out: d }));
    eq(await cli.run(['work', 'jobs/kprobe', '--task', tf]), 4, 'work returns the kernel code');
    throwsCode(() => cli.run(['work', 'jobs/kprobe', '--task', path.join(W, 'none.json')]), 'MV_NOT_FOUND', 'work: a missing task file');
    fs.writeFileSync(tf, '{"v":1, "out": ');
    throwsCode(() => cli.run(['work', 'jobs/kprobe', '--task', tf]), 'MV_USAGE', 'seeded defect: a task file that is not JSON');
    fs.writeFileSync(tf, JSON.stringify({ v: 1, kernel: 'render/x', out: d }));
    throwsCode(() => cli.run(['work', 'jobs/kprobe', '--task', tf]), 'MV_USAGE', 'work: the task names another kernel');
    fs.writeFileSync(tf, JSON.stringify({ v: 2, out: d }));
    throwsCode(() => cli.run(['work', 'jobs/kprobe', '--task', tf]), 'MV_USAGE', 'work: a task file of another version');
    throwsCode(() => cli.run(['work', 'jobs/kprobe']), 'MV_USAGE', 'work: no --task');
    throwsCode(() => cli.run(['work', 'edshot/x', '--task', tf]), 'MV_USAGE', 'work refuses a kernel under edshot/');
    // README 9.1: task.out inside an install is refused before any folder is made (the fixture's fake install)
    const fx = require('../../test/fxmake').make(path.join(W, 'fxw'), { form: 'as2' });
    const inGame = path.join(fx.gameDir, 'mapviz-out');
    fs.writeFileSync(tf, JSON.stringify({ v: 1, kernel: 'jobs/kprobe', args: { mode: 'ok' }, out: inGame }));
    throwsCode(() => cli.run(['work', 'jobs/kprobe', '--task', tf]), 'MV_REFUSED', 'seeded defect: a task whose out lies inside an install is refused');
    ok(!fs.existsSync(inGame), 'no folder was made inside the install');
    const ri = spawnSync(process.execPath, [MVJS, 'work', 'jobs/kprobe', '--task', tf], { encoding: 'utf8', windowsHide: true, timeout: 30000 });
    ok(ri.status === 6 && !fs.existsSync(inGame), 'mapviz work with out inside an install exits 6 (' + ri.status + ' ' + ri.stderr.trim().slice(0, 120) + ')');
    const nk = path.join(W, 'nk-out');
    fs.writeFileSync(tf, JSON.stringify({ v: 1, out: nk }));
    throwsCode(() => cli.run(['work', 'jobs/knone', '--task', tf]), 'MV_NOT_FOUND', 'work: an absent kernel');
    ok(!fs.existsSync(nk), 'an absent kernel makes no out folder');
    throwsCode(() => cli.run(['work', 'render/sub/k', '--task', tf]), 'MV_USAGE', 'work refuses a kernel in a subfolder of a part folder');
    // through the real entry: the child refuses on its own
    fs.writeFileSync(tf, JSON.stringify({ v: 1, out: d }));
    for (const [k, why] of [['../lib/x', 'outside'], ['edshot/kshot', 'edshot'], ['lib/kx', 'not in a part folder'], ['render/sub/k', 'a subfolder of a part folder']]) {
      const r = spawnSync(process.execPath, [MVJS, 'work', k, '--task', tf], { encoding: 'utf8', windowsHide: true, timeout: 30000 });
      ok(r.status === 2 && /^mapviz work: /m.test(r.stderr), 'mapviz work ' + k + ' (' + why + ') exits 2 (' + r.status + ' ' + r.stderr.trim() + ')');
    }
    const r = spawnSync(process.execPath, [MVJS, 'jobs', 'work', 'jobs/kprobe', '--task', tf], { encoding: 'utf8', windowsHide: true, timeout: 30000 });
    ok(r.status === 0, 'mapviz jobs work reaches the same command (' + r.status + ' ' + r.stderr.trim() + ')');
  }
  h.end();
})().catch(e => { console.log('FAIL mapviz jobs-pool: ' + (e && e.stack || e)); process.exit(1); });

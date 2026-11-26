// jobs spawn test: the runner with the REAL spawn against a tiny fake part that this test writes into its scratch dir
// (a test-only parts table given to mapviz dispatch by a scratch entry script; nothing is added to other parts' folders).
// Checks: progress lines parsed into the job record, the heartbeat (a line at least every 2 s of work), the end line,
// exit 5 on cancel, a timeout that kills a child which ignores the flag (no entry, no lock, the process gone), a failure
// with its code, the tiles step (`jobs tiles` child) and the single-exe child command form.
// usage: node tools/mapviz/jobs/test/spawn.test.js [scratch dir]
// Author: Imperator_Aug (ARSENAL, ia-91c34aa4)
'use strict';
const fs = require('fs'), path = require('path');
const h = require('./harness')('jobs-spawn');
const index = require('../index');
const pool = require('../pool');
const tiles = require('../tiles');
const gridfile = require('../../lib/raster/gridfile');
const { W, ok, eq, until } = h;

const MVJS = path.resolve(__dirname, '..', '..', 'mapviz.js');
const GRIDFILE = path.resolve(__dirname, '..', '..', 'lib', 'raster', 'gridfile.js');
const FP = path.join(W, 'fakepart');
fs.mkdirSync(FP, { recursive: true });
fs.writeFileSync(path.join(FP, 'cli.js'), [
  "'use strict';",
  "const fs = require('fs'), path = require('path');",
  'const mv = require(' + JSON.stringify(MVJS) + ');',
  'const SAB = new Int32Array(new SharedArrayBuffer(4));',
  'const sleep = ms => Atomics.wait(SAB, 0, 0, ms);',
  'module.exports = { part: \'fake\', version: 7, commands: { make: {}, heart: {}, slow: {}, hang: {}, fail: {}, pic: {} }, run(argv) {',
  '  const cmd = argv[0], o = mv.parseArgs(argv.slice(1)), p = mv.progress(o);',
  "  const reads = () => fs.writeFileSync(path.join(o.out, 'reads.json'), JSON.stringify({ v: 1, inputs: [] }));",
  "  if (cmd === 'make') { p.stage('build', 4); for (let i = 0; i < 4; i++) { sleep(150); p.step(); } fs.writeFileSync(path.join(o.out, 'fk.json'), '{}'); reads(); return 0; }",
  "  if (cmd === 'heart') { p.stage('long', 0); const end = Date.now() + 2600; while (Date.now() < end) { sleep(100); p.check(); } fs.writeFileSync(path.join(o.out, 'hb.json'), '{}'); reads(); return 0; }",
  "  if (cmd === 'slow') { fs.writeFileSync(path.join(o.out, '..', 'pid.txt'), String(process.pid)); p.stage('slow', 0); for (;;) { sleep(50); p.check(); } }",
  "  if (cmd === 'hang') { fs.writeFileSync(path.join(o.out, '..', 'pid.txt'), String(process.pid)); p.stage('hang', 0); sleep(60000); return 0; }",
  "  if (cmd === 'fail') throw new mv.MvError('MV_NOT_FOUND', 'no map ' + o.map);",
  "  if (cmd === 'pic') { const g = require(" + JSON.stringify(GRIDFILE) + "); const w = 600, hh = 300, d = new Uint8ClampedArray(w * hh * 4);",
  '    for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; d[i] = x & 255; d[i + 1] = y & 255; d[i + 2] = 9; d[i + 3] = 255; }',
  "    g.write(path.join(o.out, 'pic.fk.mvg'), { name: 'pic.fk', w, h: hh, cell: 10, ox: 0, oy: 0, etype: 'rgba8', sample: 'cell', scale: 1, offset: 0, nodata: null, meta: {}, data: d }); reads(); return 0; }",
  '  return 2;',
  '} };',
  ''].join('\n'));
fs.writeFileSync(path.join(W, 'fakemv.js'), [
  "'use strict';",
  'const mv = require(' + JSON.stringify(MVJS) + ');',
  "const parts = [{ part: 'fake', id: 'MV-FAKE', wave: 'A', dir: 'fake', load: () => require('./fakepart/cli.js') }, mv.findPart('jobs')];",
  'mv.dispatch(process.argv.slice(2), parts).then(c => { process.exitCode = c; });',
  ''].join('\n'));
const PARTS = [{ part: 'fake', id: 'MV-FAKE', wave: 'A', dir: 'fake', load: () => require(path.join(FP, 'cli.js')) }];
const row = (cmd, heavy, timeoutS, products) => ({ part: 'fake', cmd, heavy, timeoutS, needs: [], keys: [], products });
const T = { fk: row('make', true, 300, ['fk.json']), hb: row('heart', false, 300, ['hb.json']), sl: row('slow', true, 300, ['x']), hg: row('hang', true, 1, ['x']),
  fl: row('fail', false, 300, ['x']), pc: row('pic', true, 300, ['pic.fk', 'tiles/fk']) };
const G = path.join(W, 'game');
fs.mkdirSync(G, { recursive: true });
const req = (what, map) => ({ what, target: 'mowas2', game: G, map: map || 'multi/fx' });
// twice: a step whose check needs the PC to keep pace (progress seen while it runs, the heartbeat gap) runs once more on a
// miss (another map, so no cache hit) after a WAIT line; the better run is checked. Backup, never a time-only FAIL.
async function twice(step, good, what) {
  const a = await step('multi/fx');
  if (good(a)) return a;
  process.stderr.write('WAIT mapviz jobs-spawn: ' + what + ' missed on a busy PC, runs once more\n');
  return step('multi/fx2');
}
const lines = f => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
const alive = pid => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

(async () => {
  // ---- child command forms ----
  {
    const n = pool.childCmd(['jobs', 'list-what'], { sea: false }), s = pool.childCmd(['work', 'jobs/kprobe'], { sea: true });
    ok(n.file === process.execPath && n.args[0] === MVJS && n.args[1] === 'jobs', 'under node: process.execPath + [mapviz.js, ...]');
    ok(s.file === process.execPath && s.args.join(' ') === 'mapviz work jobs/kprobe', 'in the exe: the exe + [mapviz, ...]');
    ok(pool.isSea() === false && pool.childCmd(['x']).args[0] === MVJS, 'this test runs under node, not the exe');
    ok(pool.childCmd(['x'], { entry: '/e.js', sea: false }).args[0] === '/e.js', 'entry replaces mapviz.js (tests)');
  }

  const r = index.create({ root: path.join(W, 'root'), jobs: T, parts: PARTS, entry: path.join(W, 'fakemv.js'), killWaitMs: 1500, pollMs: 50 });

  // ---- progress, end line ----
  {
    const { s, seen, j } = await twice(async map => {
      const t0 = Date.now();
      const s = r.submit(req('fk', map));
      const seen = [];
      while (true) { const j = r.status(s.id); seen.push(j.stage + ':' + j.done + '/' + j.total); if (!['queued', 'running'].includes(j.state)) break; await h.sleep(40); }
      const j = await r.wait(s.id);
      h.note('fk job (spawn + 4 x 150 ms of work): ' + (Date.now() - t0) + ' ms');
      return { s, seen, j };
    }, x => x.seen.some(y => /^build:[1-3]\/4$/.test(y)), 'progress seen while the fk job runs');
    ok(j.state === 'done' && j.result.products.includes('fk.json'), 'a real child finishes and its product enters the cache');
    ok(seen.some(x => /^build:[1-3]\/4$/.test(x)), 'progress lines are parsed into the record while it runs (' + [...new Set(seen)].join(' ') + ')');
    const pl = lines(path.join(r.cache.root, 'jobs', s.id, 'progress.jsonl'));
    const last = pl[pl.length - 1];
    ok(last.end === 'done' && last.code === 0 && typeof last.t === 'number', 'the dispatcher appends the end line (' + JSON.stringify(last) + ')');
    ok(pl.filter(l => l.stage === 'build').length >= 2, 'stage lines with done and total');
    eq(j.done + '/' + j.total, '4/4', 'final done and total');
  }

  // ---- heartbeat ----
  {
    const { j, st, gap } = await twice(async map => {
      const s = r.submit(req('hb', map));
      const j = await r.wait(s.id);
      const pl = lines(path.join(r.cache.root, 'jobs', s.id, 'progress.jsonl'));
      const st = pl.filter(l => l.stage === 'long');
      let gap = 0;
      for (let i = 1; i < pl.length; i++) gap = Math.max(gap, pl[i].t - pl[i - 1].t);
      return { j, st, gap };
    }, x => x.st.length >= 2 && x.st[x.st.length - 1].t >= 2000 && x.gap <= 2300, 'the heartbeat line within 2.3 s');
    ok(j.state === 'done' && st.length >= 2 && st[st.length - 1].t >= 2000, 'heartbeat: a progress line again after 2 s with no step (' + st.map(l => l.t).join(',') + ')');
    ok(gap <= 2300, 'no gap over 2 s between progress lines (largest ' + gap + ' ms)');
  }

  // ---- cancel: the child exits 5 ----
  {
    // its own runner with a long kill wait: a busy PC may take more than 1.5 s to see the flag; it is never killed here
    const r = index.create({ root: path.join(W, 'root-c'), jobs: T, parts: PARTS, entry: path.join(W, 'fakemv.js'), killWaitMs: 60000, pollMs: 50 });
    const s = r.submit(req('sl'));
    await until(() => r.status(s.id).stage === 'slow', 8000);
    const t0 = Date.now();
    ok(r.cancel(s.id), 'cancel answers true');
    const j = await r.wait(s.id);
    const dt = Date.now() - t0;
    const pl = lines(path.join(r.cache.root, 'jobs', s.id, 'progress.jsonl'));
    const last = pl[pl.length - 1];
    ok(j.state === 'cancelled' && last.end === 'cancelled' && last.code === 5, 'the child saw the flag and exited 5 (' + JSON.stringify(last) + ')');
    ok(dt < 60000, 'it stopped before the kill wait (' + dt + ' ms)');
    ok(/cancelled/.test(fs.readFileSync(path.join(r.cache.root, 'jobs', s.id, 'stderr.txt'), 'utf8')), 'stderr.txt holds the child message');
    ok(r.cache.open(j.key) === null && !fs.existsSync(path.join(r.cache.root, 'locks', j.key)) && !fs.existsSync(path.join(r.cache.root, 'locks', 'heavy')), 'no entry and no lock after a cancel');
    await r.close();
  }

  // ---- timeout: the child ignores the flag and is killed ----
  {
    const t0 = Date.now();
    const s = r.submit(req('hg'));
    const j = await r.wait(s.id);
    const dt = Date.now() - t0;
    const pid = Number(fs.readFileSync(path.join(r.cache.root, 'jobs', s.id, 'pid.txt'), 'utf8'));
    ok(j.state === 'timeout' && dt >= 2400 && dt < 60000, 'timeout 1 s + kill wait 1.5 s -> state timeout (' + dt + ' ms)');   // upper bound loose: late on a busy PC, never early
    ok(fs.existsSync(path.join(r.cache.root, 'jobs', s.id, 'cancel')), 'the flag was written first');
    await until(() => !alive(pid), 3000);
    ok(!alive(pid), 'the killed child is gone');
    ok(r.cache.open(j.key) === null && !fs.existsSync(path.join(r.cache.root, 'jobs', s.id, 'out')), 'a killed child leaves no entry and no out/');
    let locks = []; try { locks = fs.readdirSync(path.join(r.cache.root, 'locks')); } catch (e) { /* none */ }
    eq(locks, [], 'a killed child leaves no lock');
  }

  // ---- failure code from a real child ----
  {
    const j = await r.wait(r.submit(req('fl')).id);
    ok(j.state === 'failed' && j.error.code === 'MV_NOT_FOUND' && /no map multi\/fx/.test(j.error.msg), 'a real child failing with exit 3 -> MV_NOT_FOUND (' + JSON.stringify(j.error) + ')');
  }

  // ---- the tiles step ----
  {
    const t0 = Date.now();
    const j = await r.wait(r.submit(req('pc')).id);
    if (tiles.rasterCutTile()) {
      ok(j.state === 'done' && j.result.products.includes('tiles/fk'), 'pic + jobs tiles child: done with tiles/fk (raster cutTile ran) ' + JSON.stringify(j.error || ''));
      const e = path.join(r.cache.root, 'e', j.key, 'tiles', 'fk');
      ok(fs.existsSync(path.join(e, '0', '2_1.png')) && fs.existsSync(path.join(e, '2', '0_0.png')) && !fs.existsSync(path.join(e, '3')), 'tiles of every level, zmax 2 for 600 x 300');
      h.note('pc job with tiles (raster cutTile): ' + (Date.now() - t0) + ' ms');
    } else {
      ok(j.state === 'failed' && j.error.code === 'MV_NOT_BUILT', 'pic + jobs tiles child: raster cutTile not built -> failed MV_NOT_BUILT (' + JSON.stringify(j.error) + ')');
      ok(r.cache.open(j.key) === null, 'nothing partial enters the cache when the tiles step fails');
      h.skip('tiles step with the real raster cutTile: lib/raster/index.js has no cutTile yet (checked the not-built answer instead)');
    }
  }
  await r.close();
  ok(gridfile.read && true, 'gridfile loads');
  h.end();
})().catch(e => { console.log('FAIL mapviz jobs-spawn: ' + (e && e.stack || e)); process.exit(1); });

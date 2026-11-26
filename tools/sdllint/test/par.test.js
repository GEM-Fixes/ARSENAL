// lintPar: a worker that fails (test hook SDLLINT_TEST_FAIL_WORKER=N, part.js) = only its share is read on the main thread, the
// other shares are kept, one stderr line names the worker and its error; stdout byte-identical to a run with no failure
// Author: Imperator_Aug (ARSENAL, ia-1261f6c8)
const fs = require('fs'), path = require('path'), os = require('os'), { spawnSync } = require('child_process');
let bad = 0; const ok = (c, m) => { if (!c) { console.log('FAIL: ' + m); bad++; } };
const w = fs.mkdtempSync(path.join(process.env.ARSENAL_TMP || os.tmpdir(), 'sdllint-par-'));
try {
  const put = (f, s) => { fs.mkdirSync(path.dirname(path.join(w, f)), { recursive: true }); fs.writeFileSync(path.join(w, f), s); };
  put('m/mod.info', '{name "m"}\r\n');
  // > PAR_MIN (400) roots; findings spread over every share (BLOCK_UNCLOSED, an include missing, a fragment read alone)
  for (let i = 0; i < 450; i++) put('m/resource/entity/many/e' + i + '.def', i % 7 === 0 ? '{game_entity\r\n\t{x 1\r\n' : i % 11 === 0 ? '(include "nope' + i + '.inc")\r\n{game_entity\r\n}\r\n' : '{game_entity\r\n}\r\n');
  const m = path.join(w, 'm'), tool = path.join(__dirname, '..', 'sdllint.js');
  const run = env => spawnSync(process.execPath, [tool, m, '--no-rc'], { encoding: 'utf8', env: Object.assign({}, process.env, { SDLLINT_TEST_FAIL_WORKER: '', ARSENAL_PROGRESS: '', ARSENAL_FILE_CACHE: '0' }, env) });
  const base = run({ SDLLINT_THREADS: '3' }), one = run({ SDLLINT_THREADS: '1' });
  ok(base.status === one.status && base.stdout === one.stdout && /e7\.def/.test(base.stdout) && /e440\.def/.test(base.stdout), 'threads 3 = threads 1');
  ok(!/worker \d+ failed/.test(base.stderr), 'no failure line without a failure: ' + base.stderr);
  for (const n of ['1', '2']) {
    const f = run({ SDLLINT_THREADS: '3', SDLLINT_TEST_FAIL_WORKER: n });
    ok(f.stdout === base.stdout && f.status === base.status, `worker ${n} failed: stdout byte-identical to a normal run`);
    const ls = f.stderr.split(/\r?\n/).filter(l => /^sdllint: worker /.test(l));
    ok(ls.length === 1 && ls[0] === `sdllint: worker ${n} failed (SDLLINT_TEST_FAIL_WORKER=${n}): its share was read on the main thread`, 'one stderr line naming the worker and its error: ' + JSON.stringify(ls));
  }
  // only the failed share is read again: with progress on, every root is named once (no full re-read)
  const p = run({ SDLLINT_THREADS: '3', SDLLINT_TEST_FAIL_WORKER: '2', ARSENAL_PROGRESS: '1' });
  const at = p.stderr.split(/\r?\n/).filter(l => l.startsWith('PROGRESS at ') && /many\/e\d+\.def/.test(l));
  const names = at.map(l => /many\/(e\d+)\.def/.exec(l)[1]);
  ok(names.length === 450 && new Set(names).size === 450, `each root parsed once (${names.length} lines, ${new Set(names).size} distinct)`);
  ok(p.stdout === base.stdout, 'progress on + failed worker: same stdout');
  // every worker failing still gives the same answer
  const env2 = run({ SDLLINT_THREADS: '2', SDLLINT_TEST_FAIL_WORKER: '1' }), base2 = run({ SDLLINT_THREADS: '2' });
  ok(env2.stdout === base2.stdout && base2.stdout === base.stdout, 'two threads, the only worker failed: same stdout');
} finally { fs.rmSync(w, { recursive: true, force: true }); }
if (!bad) console.log('par ok');
process.exit(bad ? 1 : 0);

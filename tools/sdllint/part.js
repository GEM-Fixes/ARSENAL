// sdllint worker (lintPar in sdllint.js): reads its share of the roots (workerData.idx) of the same run and hands the plain results back.
// It builds the source and the roots itself from the same opts (opts.listing: the main thread's scan of the folder, so it does not
// walk the mod again); when its roots are not the ones the main thread listed (keys) it answers ok:false and the main thread reads
// this worker's share itself. Its root files are read ahead through the thread pool (sdllint readRoots). Reads only.
// Author: Imperator_Aug (ARSENAL, ia-c08a0b0b)
const { parentPort, workerData } = require('worker_threads');
const sdlset = require('../lib/sdlset'), { createReport } = require('../lib/report');
const L = require('./sdllint');
// test hook (sdllint/test/par.test.js): SDLLINT_TEST_FAIL_WORKER=N = worker N throws (the main thread reads its share)
if (process.env.SDLLINT_TEST_FAIL_WORKER && +process.env.SDLLINT_TEST_FAIL_WORKER === workerData.w) throw new Error('SDLLINT_TEST_FAIL_WORKER=' + workerData.w);
(async () => {
  const { opts, keys, idx, rec } = workerData;
  const src = sdlset.createSource(opts), todo = L.todoOf(opts, src, L.gohOf(opts), createReport());
  if (todo.length !== keys.length || todo.some((t, i) => t.key !== keys[i])) return parentPort.postMessage({ ok: false });
  const roots = await L.readRoots(src, todo, idx, rec);   // rec: the file cache is on (each result names what its read opened)
  parentPort.postMessage({ ok: true, roots, included: [...src.included] });
})().catch(e => parentPort.postMessage({ ok: false, why: e && e.message }));

// sdllint worker (lintPar in sdllint.js): reads its share of the roots (workerData.idx) of the same run and hands the plain results back.
// It builds the source and the roots itself from the same opts; when its roots are not the ones the main thread listed (keys) it
// answers ok:false and the main thread reads every root itself. Reads only.
// Author: Imperator_Aug (ARSENAL, ia-1428557a)
const { parentPort, workerData } = require('worker_threads');
const sdlset = require('../lib/sdlset'), { createReport } = require('../lib/report');
const L = require('./sdllint');
try {
  const { opts, keys, idx } = workerData;
  const src = sdlset.createSource(opts), todo = L.todoOf(opts, src, L.gohOf(opts), createReport());
  if (todo.length !== keys.length || todo.some((t, i) => t.key !== keys[i])) parentPort.postMessage({ ok: false });
  else {
    const roots = idx.map(i => L.readRoot(src, todo[i]));
    parentPort.postMessage({ ok: true, roots, included: [...src.included] });
  }
} catch (e) { parentPort.postMessage({ ok: false, why: e.message }); }

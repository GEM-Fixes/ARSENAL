// kprobe: the pool's probe kernel (kernel name jobs/kprobe). It proves a pool child end to end: the child command (node or
// the exe), the task file, io (grids, PNG, progress and cancel) and the exit code. Node built-ins only, no relative
// require (README 1.5), so it can also start from source text. Writes only into task.out.
//   task.args.mode: ok (default; waits args.ms, writes <name>.json), code (returns args.code), throw (throws), wait (waits
//   until the cancel flag, at most args.ms or 30 s), grid (writes and reads back <name>.mvg), png (writes and reads back
//   <name>.png), escape (tries to write outside task.out; io refuses it)
// <name>.json = {kernel, pid, start, end, inputs, ...}; name = task.args.name or 'probe'.
// Author: Imperator_Aug (ARSENAL, ia-d3bfaa2f)
'use strict';
const fs = require('fs'), path = require('path');

const SAB = new Int32Array(new SharedArrayBuffer(4));

function hold(ms, io) {
  const end = Date.now() + ms;
  for (;;) {
    io.progress.check();
    const left = end - Date.now();
    if (left <= 0) return;
    Atomics.wait(SAB, 0, 0, Math.min(25, left));
  }
}

function grid(name) {
  const data = new Uint8Array([1, 2, 3, 4]);
  return { name, w: 2, h: 2, cell: 1, ox: 0, oy: 0, etype: 'u8', sample: 'cell', scale: 1, offset: 0, nodata: null, meta: {}, data };
}

function run(task, io) {
  const a = task.args || {};
  const mode = a.mode || 'ok', name = a.name || 'probe', t0 = Date.now();
  const mark = extra => fs.writeFileSync(path.join(task.out, name + '.json'),
    JSON.stringify(Object.assign({ kernel: task.kernel, pid: process.pid, start: t0, end: Date.now(), inputs: (task.inputs || []).length }, extra || {})));
  if (mode === 'ok') { hold(a.ms || 0, io); mark(); return 0; }
  if (mode === 'code') return a.code;
  if (mode === 'throw') throw new Error('probe kernel failed on purpose');
  if (mode === 'wait') { hold(a.ms || 30000, io); mark({ waited: true }); return 0; }
  if (mode === 'grid') {
    const f = path.join(task.out, name + '.mvg');
    io.writeGrid(f, grid(name));
    const back = io.readGrid(f);
    mark({ sum: Array.from(back.data).reduce((s, v) => s + v, 0) });
    return 0;
  }
  if (mode === 'png') {
    const f = path.join(task.out, name + '.png');
    io.writePng(f, { w: 1, h: 1, rgba: new Uint8ClampedArray([10, 20, 30, 255]) });
    const back = io.readPng(f);
    mark({ rgba: Array.from(back.rgba) });
    return 0;
  }
  if (mode === 'escape') { io.writeGrid(path.join(task.out, '..', name + '-escaped.mvg'), grid(name)); return 0; }
  throw new Error('probe kernel: no mode ' + mode);
}

module.exports = { run };

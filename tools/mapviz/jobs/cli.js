// jobs cli: `mapviz jobs <command>` and `mapviz work <kernel> --task <file>` (tools/mapviz/README.md section 1.5).
//   run <what> [common flags] [--json]   runs one job and its needs through the cache with a runner in this process (the
//                                        part commands run as children); prints {v:1, what, key, dir, cached}
//   list-what [--json]                   the job table (README 6.2)
//   cache [--json] [--clear all|map --map K [--target T]] [--evict]   cache stats {v:1, root, bytes, cap, entries, jobs};
//                                        --clear prints {v:1, removed, bytes}; --evict prints {v:1, removed:[key]}
//   tiles --in <pic.mvg> --out D [--z n|all]   cuts the picture into D/<z>/<x>_<y>.png; prints {v:1, zmax, count}
//   work <kernel> --task <file> [--cancel-flag F]   a pool child: checks the kernel name, reads the task file, checks
//                                        task.out with checkOut (MV_REFUSED inside an install), runs the kernel with io;
//                                        exit = the kernel's code (a throw 2, a cancel 5)
// Light at load time: everything is required inside run.
// Author: Imperator_Aug (ARSENAL, ia-3bd5af44)
'use strict';
const fs = require('fs'), path = require('path');

function mvlib() { return require('../mapviz'); }
function print(o, json) { process.stdout.write((json === false ? o : JSON.stringify(o)) + '\n'); }

async function cmdRun(argv) {
  const mv = mvlib();
  const o = mv.parseArgs(argv, { at: 'str', pose: 'str', light: 'str' });
  const what = o.pos[0];
  if (!what || o.pos.length > 1) throw new mv.MvError('MV_USAGE', 'jobs run needs one job name: ' + Object.keys(require('./table').JOBS).join(', '));
  const index = require('./index'), cache = require('./cache');
  const runner = index.create({});
  let sub;
  try {
    sub = runner.submit({ what, target: o.target, game: o.game, mods: o.mods, modDirs: o.modDirs, map: o.map, mode: o.mode, kind: o.kind, side: o.side, size: o.size,
      phase: o.phase, at: o.extra.at, pose: o.extra.pose, light: o.extra.light });
  } catch (e) { await runner.close(); throw e; }
  const cached = sub.state === 'done';
  const watch = o.cancelFlag ? setInterval(() => { if (fs.existsSync(o.cancelFlag)) runner.cancel(sub.id); }, 250) : null;
  const j = await runner.wait(sub.id);
  if (watch) clearInterval(watch);
  await runner.close();
  if (!j || j.state !== 'done') {
    const code = j && j.error && mv.CODES[j.error.code] !== undefined ? j.error.code : 'MV_FAULT';
    throw new mv.MvError(code, what + ' ' + (j ? j.state : 'lost') + (j && j.error ? ': ' + j.error.msg : ''), { job: j });
  }
  print({ v: 1, what, key: j.key, dir: path.join(cache.root(), 'e', j.key), cached });
  return 0;
}

function cmdListWhat(argv) {
  const mv = mvlib(), o = mv.parseArgs(argv), JOBS = require('./table').JOBS;
  if (o.json) { print({ v: 1, jobs: JOBS }); return 0; }
  for (const [w, r] of Object.entries(JOBS))
    print([w, r.part + ' ' + r.cmd + (r.argv ? ' ' + r.argv.join(' ') : ''), r.heavy ? 'heavy' : 'light', r.timeoutS + ' s', 'needs ' + (r.needs.join(',') || '-'), 'keys ' + (r.keys.join(',') || '-'), r.products.join(',')].join('\t'), false);
  return 0;
}

function cmdCache(argv) {
  const mv = mvlib(), o = mv.parseArgs(argv, { clear: 'str', evict: 'bool' }), cache = require('./cache');
  if (o.extra.clear !== undefined) {
    const s = o.extra.clear;
    if (s !== 'all' && s !== 'map') throw new mv.MvError('MV_USAGE', '--clear must be all or map');
    if (s === 'map' && !o.map) throw new mv.MvError('MV_USAGE', '--clear map needs --map <key>');
    const r = cache.clear(s === 'all' ? 'all' : { scope: 'map', map: o.map, target: o.target });
    print(o.json ? { v: 1, removed: r.removed, bytes: r.bytes } : 'removed ' + r.removed + ' entries, ' + r.bytes + ' bytes', o.json);
    return 0;
  }
  if (o.extra.evict) {
    const removed = cache.evict();
    print(o.json ? { v: 1, removed } : 'evicted ' + removed.length + ' entries', o.json);
    return 0;
  }
  const s = cache.stats();
  if (o.json) print(s);
  else print(['root\t' + s.root, 'bytes\t' + s.bytes, 'cap\t' + s.cap, 'entries\t' + s.entries, 'jobs\t' + s.jobs].join('\n'), false);
  return 0;
}

function cmdTiles(argv) {
  const mv = mvlib(), o = mv.parseArgs(argv, { z: 'str' }), tiles = require('./tiles');
  if (o.in.length !== 1) throw new mv.MvError('MV_USAGE', 'jobs tiles needs one --in <pic.mvg>');
  const out = mv.checkOut(o.out, o);
  const r = tiles.cut(path.resolve(o.in[0]), out, { z: o.extra.z, progress: mv.progress(o) });
  print(o.json ? { v: 1, zmax: r.zmax, count: r.count } : 'zmax ' + r.zmax + ' tiles ' + r.count, o.json);
  return 0;
}

// io for a kernel (README 1.5): grids and PNG through gridfile.js and png.js; writes only inside task.out
function makeIo(task, cancelFlag) {
  const mv = mvlib(), gridfile = require('../lib/raster/gridfile'), png = require('../lib/raster/png');
  const out = path.resolve(task.out);
  const inside = f => {
    const abs = path.resolve(out, String(f));
    const rel = path.relative(out, abs);
    if (!rel || rel.indexOf('..') === 0 || path.isAbsolute(rel)) throw new mv.MvError('MV_REFUSED', 'a kernel writes only into task.out; refused ' + f);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    return abs;
  };
  return {
    readGrid: f => gridfile.read(path.resolve(out, String(f))),
    writeGrid: (f, g) => gridfile.write(inside(f), g),
    readPng: f => png.decode(fs.readFileSync(path.resolve(out, String(f)))),
    writePng: (f, g) => mv.writeAtomic(inside(f), png.encode(g)),
    progress: mv.progress({ cancelFlag }),
  };
}

function cmdWork(argv) {
  const mv = mvlib(), o = mv.parseArgs(argv, { task: 'str' }), pool = require('./pool');
  const kernel = o.pos[0];
  if (o.pos.length !== 1) throw new mv.MvError('MV_USAGE', 'work needs one kernel name');
  const file = pool.kernelFile(kernel);
  if (!o.extra.task) throw new mv.MvError('MV_USAGE', 'work needs --task <file>');
  if (!fs.existsSync(o.extra.task)) throw new mv.MvError('MV_NOT_FOUND', 'no task file ' + o.extra.task);
  let task;
  try { task = JSON.parse(fs.readFileSync(o.extra.task, 'utf8')); } catch (e) { throw new mv.MvError('MV_USAGE', 'the task file is not JSON: ' + e.message); }
  if (!task || task.v !== 1 || typeof task.out !== 'string' || !task.out) throw new mv.MvError('MV_USAGE', 'a task file is {v:1, kernel, inputs, args, out}');
  if (task.kernel !== undefined && task.kernel !== kernel) throw new mv.MvError('MV_USAGE', 'the task is for kernel ' + task.kernel + ', not ' + kernel);
  if (task.inputs !== undefined && !Array.isArray(task.inputs)) throw new mv.MvError('MV_USAGE', 'task inputs must be a list');
  task.kernel = kernel;
  task.inputs = task.inputs || [];
  task.args = task.args && typeof task.args === 'object' ? task.args : {};
  if (!fs.existsSync(file)) throw new mv.MvError('MV_NOT_FOUND', 'no kernel ' + kernel + ' (not built yet)');
  task.out = mv.checkOut(task.out, {});   // README 9.1: never inside an install (MV_REFUSED, exit 6); installs found walking up
  fs.mkdirSync(task.out, { recursive: true });
  const k = require(file);
  if (!k || typeof k.run !== 'function') throw new mv.MvError('MV_FAULT', 'kernel ' + kernel + ' exports no run');
  let r;
  try { r = k.run(task, makeIo(task, o.cancelFlag)); } catch (e) {
    if (e && e.code === 'MV_CANCELLED') { process.stderr.write('mapviz work: ' + kernel + ': ' + e.message + '\n'); return 5; }
    process.stderr.write('mapviz work: ' + kernel + ': ' + (e && e.message ? e.message : String(e)) + '\n');
    if (process.env.MAPVIZ_DEBUG && e && e.stack) process.stderr.write(e.stack + '\n');
    return 2;
  }
  if (r && typeof r.then === 'function') { process.stderr.write('mapviz work: ' + kernel + ': run must be sync\n'); return 2; }
  if (r === undefined) return 0;
  if (!Number.isInteger(r) || r < 0 || r > 255) { process.stderr.write('mapviz work: ' + kernel + ': run returned ' + r + ', not an exit code\n'); return 2; }
  return r;
}

module.exports = {
  part: 'jobs',
  version: 1,
  summary: 'job runner, process pool, cache and tiles',
  commands: {
    run: { args: '<what> --target T [--game G] [--mods a,b] [--mod-dir D] [--map K] [--mode m] [--kind k] [--size px] [--phase n] [--at x,y] [--pose p] [--light w] [--cancel-flag F] [--json]', summary: 'run one job and its needs through the cache' },
    'list-what': { args: '[--json]', summary: 'the jobs the runner knows' },
    cache: { args: '[--json] [--clear all|map --map K [--target T]] [--evict]', summary: 'cache size; clear it or evict down to the cap' },
    tiles: { args: '--in <pic.mvg> --out D [--z n|all] [--json]', summary: 'cut a picture into 256 px PNG tiles' },
    work: { args: '<kernel> --task <file> [--cancel-flag F]', summary: 'run one pool kernel (a pool child)' },
  },
  run(argv) {
    const cmd = argv[0], rest = argv.slice(1);
    if (cmd === 'run') return cmdRun(rest);
    if (cmd === 'list-what') return cmdListWhat(rest);
    if (cmd === 'cache') return cmdCache(rest);
    if (cmd === 'tiles') return cmdTiles(rest);
    if (cmd === 'work') return cmdWork(rest);
    throw new (mvlib().MvError)('MV_USAGE', 'no command ' + cmd);
  },
};

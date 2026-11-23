// jobs/pool: child processes for mapviz (tools/mapviz/README.md sections 1.5 and 7; design 3 "Execution model").
//   childCmd(args, o?) -> {file, args}   the one way mapviz starts a child: process.execPath + [mapviz.js, ...args] under
//                                        node, the exe + ['mapviz', ...args] inside the single-exe build (the same test as
//                                        tools/gui/gui.js childCmd: require('node:sea').isSea()). o = {sea?, entry?} (tests)
//   spawnRun(o?) -> run(argv, opt) -> Promise<{code, stdout, stderr, timedOut}>   the job runner's default run; opt =
//                                        {cwd, ctl}; run sets ctl.kill() so the runner can kill the child (README 7)
//   kernelFile(kernel, parts?) -> absolute file   README 1.5 kernel rule (directly in a part folder or a paint style
//                                        folder, no subfolder); throws MvError MV_USAGE when refused
//   defaultN(o?) -> n                    min(availableParallelism - 1, free RAM / 512 MB), at least 1
//   create({n?, cancelFlag?, dir?, run?, entry?}) -> {n, run(kernel, task) -> Promise<{code, stderr}>, close() -> Promise}
//     each task runs as `mapviz work <kernel> --task <file> --cancel-flag <flag>`; task = {inputs, args, out} (v and
//     kernel are filled in); the child's exit code is the result. A task asked after the cancel flag exists, or after
//     close(), answers code 5 without a child. Task files go to dir (default a temp folder, removed by close()).
// Why processes, not worker threads, in version 1: the single exe runs tools through its own module loader over embedded
// assets, and gui.js already starts `ARSENAL.exe <tool>` children of process.execPath (proven in the exe); a child also
// gets its own heap, so a big picture cannot take the GUI process down, and a kill always works. Kernels hold no relative
// require, so a later in-process worker can start them from source text (design 3).
// Author: Imperator_Aug (ARSENAL, ia-e9ddbc9e)
'use strict';
const cp = require('child_process'), fs = require('fs'), path = require('path'), os = require('os');
const mv = require('../mapviz');

const MV_DIR = path.join(__dirname, '..');
const MV_JS = path.join(MV_DIR, 'mapviz.js');
const PER_CHILD = 512 * 1024 * 1024;   // design 7: a child's texture cache stays under 300 MB; the rest is grids and the heap
const KERNEL_RE = /^[a-z0-9_]+(\/[a-z0-9_]+)+$/;
// owning folders with no row of their own in mapviz.PARTS: the paint style folders of MV-PNT1/2/3 (README 1 owned paths
// paint/staff/**, paint/painted/**, paint/recon/**, paint/sketch/**). A kernel sits directly in one of the part folders
// or in one of these, never in a subfolder (README 1.5).
const STYLE_DIRS = ['paint/staff', 'paint/painted', 'paint/recon', 'paint/sketch'];
const SKIPSEG = new Set(['test', 'cache', 'node_modules', 'dist', 'out', 'work', '_retired']);   // folders the exe build skips

let SEA = null;
function isSea() {
  if (SEA === null) { try { SEA = !!require('node:sea').isSea(); } catch (e) { SEA = false; } }
  return SEA;
}

function childCmd(args, o) {
  o = o || {};
  const sea = o.sea === undefined ? isSea() : !!o.sea;
  if (sea) return { file: process.execPath, args: ['mapviz'].concat(args) };
  return { file: process.execPath, args: [o.entry || MV_JS].concat(args) };
}

function cleanEnv() { const e = Object.assign({}, process.env); delete e.NODE_OPTIONS; return e; }

function spawnRun(o) {
  o = o || {};
  const max = o.max || 32 << 20;
  return function run(argv, opt) {
    opt = opt || {};
    const cc = childCmd(argv, o);
    return new Promise(resolve => {
      let out = '', err = '', done = false, child;
      try { child = cp.spawn(cc.file, cc.args, { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: cleanEnv(), cwd: opt.cwd || process.cwd() }); }
      catch (e) { resolve({ code: 2, stdout: '', stderr: String(e && e.message), timedOut: false }); return; }
      if (opt.ctl) opt.ctl.kill = () => { try { child.kill(); } catch (e) { /* gone */ } };
      child.stdout.on('data', d => { if (out.length < max) out += d; });
      child.stderr.on('data', d => { if (err.length < (1 << 20)) err += d; });
      const fin = (code, extra) => { if (done) return; done = true; if (opt.ctl) opt.ctl.kill = null; resolve({ code, stdout: out, stderr: err + (extra || ''), timedOut: false }); };
      child.on('error', e => fin(2, String(e && e.message)));
      child.on('close', code => fin(code));
    });
  };
}

function kernelFile(kernel, parts) {
  const no = msg => new mv.MvError('MV_USAGE', msg);
  if (typeof kernel !== 'string' || !KERNEL_RE.test(kernel)) throw no('kernel must be a path under tools/mapviz without .js, such as render/l1tile; got ' + kernel);
  const segs = kernel.split('/');
  if (segs[0] === 'edshot') throw no('kernel ' + kernel + ': nothing under edshot/ runs as a kernel');
  if (segs.some(s => SKIPSEG.has(s))) throw no('kernel ' + kernel + ': a folder named ' + segs.find(s => SKIPSEG.has(s)) + ' is not shipped');
  const dir = segs.slice(0, -1).join('/');
  const owners = parts ? parts.map(p => p.dir) : mv.PARTS.map(p => p.dir).concat(STYLE_DIRS);
  if (!owners.includes(dir)) throw no('kernel ' + kernel + ' is not directly in a part folder (' + owners.join(', ') + ')');
  const file = path.join(MV_DIR, kernel + '.js');
  const rel = path.relative(MV_DIR, file);
  if (!rel || rel.indexOf('..') === 0 || path.isAbsolute(rel)) throw no('kernel ' + kernel + ' is outside tools/mapviz');
  return file;
}

function defaultN(o) {
  o = o || {};
  const cpus = o.cpus || (typeof os.availableParallelism === 'function' ? os.availableParallelism() : os.cpus().length);
  const free = o.freemem === undefined ? os.freemem() : o.freemem;
  return Math.max(1, Math.min(cpus - 1, Math.floor(free / PER_CHILD)));
}

function create(o) {
  o = o || {};
  const n = o.n > 0 ? Math.floor(o.n) : defaultN();
  const own = !o.dir;
  const dir = o.dir ? path.resolve(o.dir) : fs.mkdtempSync(path.join(os.tmpdir(), 'mapviz-pool-'));
  fs.mkdirSync(dir, { recursive: true });
  const run = o.run || spawnRun({ entry: o.entry });
  const flag = o.cancelFlag || null;
  const queue = [], ctls = new Set(), running = new Set();
  let active = 0, seq = 0, closed = false;
  const cancelled = () => closed || (flag && fs.existsSync(flag));

  function pump() {
    while (active < n && queue.length) {
      const t = queue.shift();
      active++;
      const p = start(t).then(t.resolve, e => t.resolve({ code: 2, stderr: String(e && e.message) })).then(() => { active--; running.delete(p); pump(); });
      running.add(p);
    }
  }

  async function start(t) {
    if (cancelled()) return { code: 5, stderr: 'cancelled before it started' };
    try { kernelFile(t.kernel); } catch (e) { return { code: 2, stderr: 'mapviz work: ' + e.message }; }
    const task = { v: 1, kernel: t.kernel, inputs: Array.isArray(t.task.inputs) ? t.task.inputs : [], args: t.task.args || {}, out: path.resolve(String(t.task.out)) };
    const file = path.join(dir, 'task-' + process.pid + '-' + (++seq) + '.json');
    fs.writeFileSync(file, JSON.stringify(task));
    const args = ['work', t.kernel, '--task', file];
    if (flag) args.push('--cancel-flag', flag);
    const ctl = {};
    ctls.add(ctl);
    let r;
    try { r = await run(args, { ctl, cwd: dir }); } finally { ctls.delete(ctl); try { fs.rmSync(file, { force: true }); } catch (e) { /* temp */ } }
    const code = Number.isInteger(r.code) ? r.code : (cancelled() ? 5 : 2);
    return { code, stderr: String(r.stderr || '').slice(-4096) };
  }

  return {
    n, dir,
    run(kernel, task) {
      return new Promise(resolve => {
        if (!task || typeof task !== 'object' || typeof task.out !== 'string') { resolve({ code: 2, stderr: 'a pool task needs out' }); return; }
        queue.push({ kernel, task, resolve });
        pump();
      });
    },
    async close() {
      closed = true;
      while (queue.length) queue.shift().resolve({ code: 5, stderr: 'pool closed' });
      for (const c of ctls) if (c.kill) c.kill();
      await Promise.all([...running]);
      if (own) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* temp */ } }
    },
  };
}

module.exports = { MV_JS, MV_DIR, PER_CHILD, KERNEL_RE, STYLE_DIRS, isSea, childCmd, spawnRun, kernelFile, defaultN, create };

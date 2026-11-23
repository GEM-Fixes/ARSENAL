// jobs: the mapviz job runner (tools/mapviz/README.md sections 1.5, 6.2, 6.3, 7, 8).
//   VERSION                      part version (cache key; = cli.js version)
//   create(o) -> runner          o = {root?, cap?, run?(argv, opt) -> Promise<{code, stdout, stderr, timedOut}>, light?: 2,
//                                jobs? (a job table, tests), parts? (a parts table, tests), entry? (the script the default
//                                run starts, tests), killWaitMs?: 10000, pollMs?: 250, lockPollMs?: 1000, timeoutUnitMs?:
//                                1000 (ms per timeoutS, tests), now? (the cache clock, tests)}
//     run defaults to pool.spawnRun(): a child of process.execPath running mapviz.js (the exe: `ARSENAL.exe mapviz`).
//     opt given to run = {cancelFlag, progress, cwd, ctl}; run sets ctl.kill so the runner can kill the child.
//   runner.submit(req) -> {id, shared, state, queue}   req = README 6.2 body; throws MvError MV_USAGE (bad request),
//                                MV_NOT_FOUND (no install), MV_NOT_BUILT (the job's part, or the part of a job below
//                                it, is not built: their versions enter the key), MV_FAULT (need cycle)
//   runner.status(id) -> job (README 6.3) | null;  runner.cancel(id) -> bool;  runner.list() -> {running, queued, done}
//   runner.wait(id) -> Promise<job> (resolves when the job ends);  runner.close() -> Promise (cancels all, waits)
//   runner.problems              table.check() of the job table in use ([] when sound)
//   runner.watch(fn) -> unwatch() fn({id, what, state, stage, done, total, target, map}) on every change of a job that was
//                                queued: queued (once the submit that made it is accepted), a new stage or count, running,
//                                and its end (done, failed, cancelled, timeout). A cache hit at submit is never told. A
//                                watcher that throws is ignored. (The GUI job list hangs here: tools/gui/README.md JOBS.)
// Rules held here: one heavy job at a time in this process (submit order among the ready ones) and across processes
// (locks/heavy); at most `light` light jobs beside it; identical requests (same cache key) share one queued or running
// job; a job's needs are submitted first as their own jobs and it starts only when all are done (a failed need fails it);
// a job runs its part's command into jobs/<id>/out/, then for each tiles/<base> product `jobs tiles` into out/tiles/<base>;
// only a finished job with every product present is committed (manifest last); cancel, timeout and failure delete out/.
// Cancel: the flag file is written, the child gets 10 s (killWaitMs) to stop with exit 5, then it is killed. Timeout: the
// same, state 'timeout'. Children run with --json; error codes of failed jobs come from the stdout error line, checked
// against the exit code (README 2.4, 2.5), else from the exit code alone; a submit refused below a need queues nothing
// (the needs it queued are taken back); a timeout or a cancel carries
// MV_CANCELLED. The job record holds only the README 6.3 fields.
// Author: Imperator_Aug (ARSENAL, ia-a77b897e)
'use strict';
const fs = require('fs'), path = require('path');
const mv = require('../mapviz');
const table = require('./table');
const cache = require('./cache');
const pool = require('./pool');

const VERSION = 1;
const DONE_KEEP = 20;
const TERMINAL = new Set(['done', 'failed', 'cancelled', 'timeout']);
const EXIT_CODE = { 2: 'MV_FAULT', 3: 'MV_NOT_FOUND', 4: 'MV_NOT_BUILT', 5: 'MV_CANCELLED', 6: 'MV_REFUSED', 7: 'MV_BUSY' };

function rmrf(p) { try { fs.rmSync(p, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); } catch (e) { /* best effort */ } }
function readJson(f) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } }
function lastLine(s) { const l = String(s || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean); return l.length ? l[l.length - 1] : ''; }

// jsonError(stdout): the error of a child run with --json (README 2.5: {"v":1,"error":{code, msg, part}} on stdout), the
// last such line; null when there is none
function jsonError(s) {
  const lines = String(s || '').split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i].trim();
    if (!l || l[0] !== '{' || l.indexOf('"error"') < 0) continue;
    let r = null;
    try { r = JSON.parse(l); } catch (e) { continue; }
    if (r && r.v === 1 && r.error && typeof r.error.code === 'string') return r.error;
  }
  return null;
}

// codeOf(res): the error code of a child that did not finish (README 2.4). The children run with --json, so the code
// comes from the error line on stdout when it names one the exit code allows; without it (a crash, a kill, an old
// part) exit 2 is MV_USAGE unless the message says fault.
function codeOf(res) {
  const je = jsonError(res.stdout);
  if (je && mv.CODES[je.code] !== undefined && mv.CODES[je.code] === res.code) return je.code;
  if (res.code === 2) return /:\s*fault:/.test(lastLine(res.stderr)) || !lastLine(res.stderr) ? 'MV_FAULT' : 'MV_USAGE';
  return EXIT_CODE[res.code] || 'MV_FAULT';
}

// readProgress(file, st): reads the lines appended since st.off. st = {off, rest, bad, lines, last, end}; a line that is
// not a JSON object with stage or end counts in st.bad and is skipped; a half-written last line waits for the next read.
function readProgress(file, st) {
  st = st || { off: 0, rest: '', bad: 0, lines: 0, last: null, end: null };
  let fd;
  try { fd = fs.openSync(file, 'r'); } catch (e) { return st; }
  try {
    const size = fs.fstatSync(fd).size;
    if (size <= st.off) return st;
    const b = Buffer.alloc(size - st.off);
    fs.readSync(fd, b, 0, b.length, st.off);
    st.off = size;
    const parts = (st.rest + b.toString('utf8')).split('\n');
    st.rest = parts.pop();
    for (const l of parts) {
      const s = l.trim();
      if (!s) continue;
      let r = null;
      try { r = JSON.parse(s); } catch (e) { r = null; }
      if (!r || typeof r !== 'object' || Array.isArray(r)) { st.bad++; continue; }
      if (typeof r.end === 'string') st.end = r;
      else if (typeof r.stage === 'string') { st.last = r; st.lines++; }
      else st.bad++;
    }
  } finally { fs.closeSync(fd); }
  return st;
}

// buildArgv(row, c, out, needDirs, prog, flag) -> the part command line (README 6.2, 7): <part> <cmd> [row.argv], the
// identity flags, one --<field> <value> per key field that is not null (mode, kind, size, phase, at, pose, light ...)
function buildArgv(row, c, out, needDirs, prog, flag) {
  const a = [row.part, row.cmd].concat(Array.isArray(row.argv) ? row.argv : [], ['--target', c.target, '--game', c.game]);
  if (c.mods.length) a.push('--mods', c.mods.join(','));
  for (const d of c.modDirs) a.push('--mod-dir', d);
  if (c.map !== null) a.push('--map', c.map);
  for (const k of row.keys) if (c[k] !== null && c[k] !== undefined) a.push('--' + k, String(c[k]));
  for (const d of needDirs) a.push('--in', d);
  a.push('--out', out, '--progress', prog, '--cancel-flag', flag, '-q', '--json');   // --json: an error names its code on stdout
  return a;
}

function productsOf(dir) {
  const out = [];
  let names = [];
  try { names = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
  for (const e of names) {
    if (e.isFile() && e.name !== 'manifest.json' && e.name !== 'reads.json') out.push(e.name);
    if (e.isDirectory() && e.name === 'tiles') { try { for (const b of fs.readdirSync(path.join(dir, 'tiles'))) out.push('tiles/' + b); } catch (x) { /* none */ } }
  }
  return out.sort();
}

function validInput(i) {
  return i && typeof i === 'object' && (i.kind === 'pak' || i.kind === 'loose') && typeof i.file === 'string' && path.isAbsolute(i.file) &&
    typeof i.size === 'number' && typeof i.mtimeMs === 'number';
}

function create(o) {
  o = o || {};
  const JOBS = o.jobs || table.JOBS;
  const parts = o.parts;
  const C = cache.at(o.root || cache.root(), { now: o.now, cap: o.cap });
  const run = o.run || pool.spawnRun({ entry: o.entry });
  const LIGHT = Number.isInteger(o.light) && o.light >= 0 ? o.light : 2;
  const killWaitMs = o.killWaitMs >= 0 ? o.killWaitMs : 10000;
  const pollMs = o.pollMs > 0 ? o.pollMs : 250;
  const lockPollMs = o.lockPollMs > 0 ? o.lockPollMs : 1000;
  const unitMs = o.timeoutUnitMs > 0 ? o.timeoutUnitMs : 1000;
  const problems = table.check(JOBS);
  const jobs = new Map(), active = new Map(), doneList = [];
  let seq = 0, counter = 0, closed = false, kicked = false, retry = null, creating = null;
  try { C.pruneJobs(7 * 24 * 3600 * 1000); } catch (e) { /* old job folders stay until the next clear */ }

  const bySeq = (a, b) => a.seq - b.seq;
  const watchers = [];
  function tell(j) {
    if (!watchers.length || !j.seq) return;   // seq 0: never queued (a cache hit at submit)
    const ev = { id: j.id, what: j.what, state: j.state, stage: j.stage, done: j.done, total: j.total, target: j.c.target, map: j.c.map };
    for (const w of watchers.slice()) { try { w(ev); } catch (e) { /* the watcher's own fault */ } }
  }
  const owner = j => ({ what: j.what, target: j.c.target, map: j.c.map, job: j.id });

  function queuePos(j) {
    if (j.state !== 'queued') return 0;
    const same = [...active.values()].filter(x => x.state === 'queued' && x.heavy === j.heavy).sort(bySeq);
    return same.indexOf(j) + 1;
  }

  function record(j) {
    const r = { id: j.id, what: j.what, key: j.key, state: j.state, stage: j.stage, done: j.done, total: j.total,
      elapsed: j.started ? (j.ended || Date.now()) - j.started : 0, queue: queuePos(j) };
    if (j.error) r.error = { code: j.error.code, msg: j.error.msg };
    if (j.result) r.result = { entry: j.result.entry, products: j.result.products.slice() };
    return r;
  }

  function writeJob(j) {
    if (!j.files) return;
    try { mv.writeAtomic(path.join(j.files.dir, 'job.json'), JSON.stringify(Object.assign(record(j), { request: j.c, needs: j.needIds })) + '\n'); } catch (e) { /* the record lives in memory */ }
  }

  function kick() {
    if (kicked || closed) return;
    kicked = true;
    setImmediate(() => { kicked = false; schedule(); });
  }

  function pruneMap() {
    if (jobs.size <= 500) return;
    const keep = new Set(doneList.map(j => j.id));
    for (const a of active.values()) { keep.add(a.id); for (const n of a.needIds) keep.add(n); }
    for (const [id, j] of jobs) if (TERMINAL.has(j.state) && !keep.has(id)) jobs.delete(id);
  }

  function finish(j, state, error, result) {
    if (TERMINAL.has(j.state)) return;
    j.state = state;
    j.error = error || null;
    j.result = result || null;
    j.ended = Date.now();
    j.starting = false;
    for (const t of j.timers) { clearTimeout(t); clearInterval(t); }
    j.timers = [];
    for (const l of j.locks) l.release();
    j.locks = [];
    if (state !== 'done' && j.files) rmrf(j.files.out);
    if (active.get(j.key) === j) active.delete(j.key);
    doneList.unshift(j);
    if (doneList.length > DONE_KEEP) doneList.length = DONE_KEEP;
    writeJob(j);
    tell(j);
    const r = record(j);
    for (const w of j.waiters.splice(0)) w(r);
    pruneMap();
    kick();
  }

  function newJob(what, row, c, key, version) {
    const id = 'j' + Date.now().toString(36) + '-' + process.pid.toString(36) + '-' + (++counter).toString(36);
    return { id, what, row, c, key, version, heavy: !!row.heavy, state: 'queued', stage: '', done: 0, total: 0, started: 0, ended: 0,
      seq: 0, needIds: [], error: null, result: null, waiters: [], ctl: {}, cancelReq: false, timedOut: false, timers: [], locks: [],
      files: null, starting: false, resubmits: 0, prog: null, promise: null };
  }

  function resultOf(hit, key) { return { entry: key, products: productsOf(hit.dir) }; }

  function submitIn(req, stack) {
    if (closed) throw new mv.MvError('MV_BUSY', 'the job runner is closed');
    const what = req && req.what;
    const row = JOBS[what];
    if (!row) throw new mv.MvError('MV_USAGE', 'no job named ' + what + '; jobs: ' + Object.keys(JOBS).join(', '));
    if (stack.includes(what)) throw new mv.MvError('MV_FAULT', 'job table: need cycle ' + stack.concat(what).join(' -> '));
    const c = cache.canon(req, row);
    const versionOf = p => cache.partVersion(p, parts);
    const version = versionOf(row.part);
    const needVersions = cache.needVersions(row, JOBS, versionOf);   // the parts below it enter the key (README 8.2)
    const key = cache.entryKey(Object.assign({}, c, { row, jobs: JOBS, version, needVersions }));
    const a = active.get(key);
    if (a) return { id: a.id, shared: true, state: a.state, queue: queuePos(a) };
    const j = newJob(what, row, c, key, version);
    j.needVersions = needVersions;
    jobs.set(j.id, j);
    const hit = C.open(key);
    if (hit) { finish(j, 'done', null, resultOf(hit, key)); return { id: j.id, shared: false, state: j.state, queue: 0 }; }
    const bad = row.needs.filter(n => !JOBS[n]);
    if (bad.length) {
      finish(j, 'failed', { code: 'MV_FAULT', msg: 'job table: need ' + bad.join(', ') + ' of ' + what + ' is not a job' });
      return { id: j.id, shared: false, state: j.state, queue: 0 };
    }
    try { j.needIds = row.needs.map(n => submitIn(table.reduce(c, n, JOBS), stack.concat(what)).id); }
    catch (e) { jobs.delete(j.id); throw e; }
    j.seq = ++seq;
    active.set(key, j);   // job.json is written when the job gets its folder (exec)
    if (creating) creating.push(j);
    kick();
    return { id: j.id, shared: false, state: j.state, queue: queuePos(j) };
  }

  // submitAll(req, stack): submitIn, and when any need below it is refused (part not built or broken, need cycle, bad
  // request) the jobs this call queued are taken back before the error goes up, so no need runs for a refused request.
  // Shared jobs (queued by an earlier call) and cache hits are left alone. Submit is sync: nothing queued here has started.
  function submitAll(req, stack) { return rollback(() => submitIn(req, stack)); }
  function rollback(fn) {
    const outer = creating, mine = [];
    creating = mine;
    try { const r = fn(); for (const x of mine) if (x.state === 'queued') tell(x); return r; } catch (e) {
      for (const x of mine) if (x.state === 'queued' && active.get(x.key) === x) { active.delete(x.key); jobs.delete(x.id); }
      throw e;
    } finally { creating = outer; }
  }

  function waitLock() {
    if (!retry && !closed) retry = setTimeout(() => { retry = null; kick(); }, lockPollMs);
    return false;
  }

  // start(j): take the locks, recheck the cache and the needs, then exec. false = not started (stays queued).
  function start(j) {
    const locks = [];
    const held = () => { if (j.stage !== 'wait') { j.stage = 'wait'; tell(j); } return waitLock(); };
    if (j.heavy) {
      const h = C.lock('heavy', owner(j));
      if (!h) return held();
      locks.push(h);
    }
    const k = C.lock(j.key, owner(j));
    if (!k) { for (const l of locks) l.release(); return held(); }
    locks.push(k);
    const hit = C.open(j.key);
    if (hit) { j.locks = locks; finish(j, 'done', null, resultOf(hit, j.key)); return false; }
    const gone = j.needIds.map(id => jobs.get(id)).filter(n => !n || !C.open(n.key, { touch: false }));
    if (gone.length) {
      for (const l of locks) l.release();
      if (++j.resubmits > 2) { finish(j, 'failed', { code: 'MV_FAULT', msg: 'need ' + gone.map(n => n ? n.what : '?').join(', ') + ' is stale right after it was made (an input changed while it ran)' }); return false; }
      try {
        j.needIds = rollback(() => j.needIds.map(id => {
          const n = jobs.get(id);
          if (n && C.open(n.key, { touch: false })) return id;
          return submitIn(table.reduce(j.c, n ? n.what : '', JOBS), [j.what]).id;
        }));
      } catch (e) { finish(j, 'failed', { code: e.code in mv.CODES ? e.code : 'MV_FAULT', msg: e.message }); }
      return false;
    }
    j.locks = locks;
    j.state = 'running';
    j.stage = '';
    j.starting = false;
    j.started = Date.now();
    tell(j);
    j.promise = exec(j).catch(e => finish(j, 'failed', { code: e && e.code in mv.CODES ? e.code : 'MV_FAULT', msg: String(e && e.message) }));
    return true;
  }

  function schedule() {
    if (closed) return;
    const q = [...active.values()].filter(x => x.state === 'queued').sort(bySeq);
    for (const j of q) {
      for (const id of j.needIds) {
        const n = jobs.get(id);
        if (!n) { finish(j, 'failed', { code: 'MV_FAULT', msg: 'a need of ' + j.what + ' was lost' }); break; }
        if (n.state !== 'done' && TERMINAL.has(n.state)) {
          finish(j, 'failed', { code: n.error ? n.error.code : 'MV_FAULT', msg: 'need ' + n.what + ' ended ' + n.state + (n.error ? ': ' + n.error.msg : '') });
          break;
        }
      }
    }
    const all = [...active.values()];
    let heavyBusy = all.some(x => x.heavy && x.state === 'running');
    let lightN = all.filter(x => !x.heavy && x.state === 'running').length;
    for (const j of q) {
      if (j.state !== 'queued' || !j.needIds.every(id => jobs.get(id) && jobs.get(id).state === 'done')) continue;
      if (j.heavy ? heavyBusy : lightN >= LIGHT) continue;
      if (start(j)) { if (j.heavy) heavyBusy = true; else lightN++; }
    }
  }

  function writeFlag(j) { try { fs.writeFileSync(j.files.flag, String(Date.now())); } catch (e) { /* the kill still comes */ } }
  function killLater(j) { j.timers.push(setTimeout(() => { if (j.ctl.kill) j.ctl.kill(); }, killWaitMs)); }

  function poll(j) {
    if (!j.files) return;
    const st = readProgress(j.files.prog, j.prog);
    if (st.last) {
      const was = j.stage + '|' + j.done + '|' + j.total;
      j.stage = String(st.last.stage); j.done = Number(st.last.done) || 0; j.total = Number(st.last.total) || 0;
      if (was !== j.stage + '|' + j.done + '|' + j.total && !TERMINAL.has(j.state)) tell(j);
    }
    if (Date.now() - j.touched > 60000) { j.touched = Date.now(); for (const l of j.locks) l.refresh(); }
  }

  async function exec(j) {
    const dir = C.jobDir(j.id);
    j.files = { dir, out: path.join(dir, 'out'), prog: path.join(dir, 'progress.jsonl'), flag: path.join(dir, 'cancel') };
    rmrf(dir);
    fs.mkdirSync(j.files.out, { recursive: true });
    j.prog = { off: 0, rest: '', bad: 0, lines: 0, last: null, end: null };
    j.touched = Date.now();
    writeJob(j);
    const needs = j.needIds.map(id => jobs.get(id));
    const argv = buildArgv(j.row, j.c, j.files.out, needs.map(n => C.entryDir(n.key)), j.files.prog, j.files.flag);
    j.timers.push(setTimeout(() => {
      if (j.state !== 'running' || j.cancelReq) return;
      j.timedOut = true; writeFlag(j); killLater(j);
    }, j.row.timeoutS * unitMs));
    j.timers.push(setInterval(() => poll(j), pollMs));
    const opt = { cancelFlag: j.files.flag, progress: j.files.prog, cwd: dir, ctl: j.ctl };
    const outs = [];
    let res = await run(argv, opt);
    outs.push(res);
    const ok = r => r.code === 0 || r.code === 1;
    const stopped = () => j.cancelReq || j.timedOut;
    if (ok(res) && !stopped()) {
      for (const base of table.tilesOf(j.row)) {
        res = await run(['jobs', 'tiles', '--in', path.join(j.files.out, 'pic.' + base + '.mvg'), '--out', path.join(j.files.out, 'tiles', base),
          '--progress', j.files.prog, '--cancel-flag', j.files.flag, '-q', '--json'], opt);
        outs.push(res);
        if (!ok(res) || stopped()) break;
      }
    }
    poll(j);
    try {
      fs.writeFileSync(path.join(dir, 'stdout.txt'), outs.map(r => r.stdout || '').join(''));
      fs.writeFileSync(path.join(dir, 'stderr.txt'), outs.map(r => r.stderr || '').join(''));
    } catch (e) { /* diagnostics only */ }
    if (j.cancelReq) return finish(j, 'cancelled', { code: 'MV_CANCELLED', msg: 'cancelled' });
    if (j.timedOut || res.timedOut) return finish(j, 'timeout', { code: 'MV_CANCELLED', msg: 'timed out after ' + j.row.timeoutS + ' s' });
    if (!ok(res)) {
      const code = codeOf(res);
      return finish(j, code === 'MV_CANCELLED' ? 'cancelled' : 'failed', { code, msg: lastLine(res.stderr) || 'exit ' + res.code });
    }
    const miss = table.productFiles(j.row, j.c).filter(p => !p.alt.some(f => fs.existsSync(path.join(j.files.out, f))));
    if (miss.length) return finish(j, 'failed', { code: 'MV_FAULT', msg: 'the part wrote no ' + miss.map(m => m.name).join(', ') });
    const notes = [];
    const rj = readJson(path.join(j.files.out, 'reads.json'));
    let inputs = [];
    if (rj && Array.isArray(rj.inputs)) {
      inputs = rj.inputs.filter(validInput);
      if (inputs.length !== rj.inputs.length) notes.push({ code: 'JOBS_READS_BAD', text: (rj.inputs.length - inputs.length) + ' inputs in reads.json were not input records and were left out' });
    } else notes.push({ code: 'JOBS_NO_READS', text: 'the part wrote no reads.json; only the needs guard this entry' });
    if (j.prog.bad) notes.push({ code: 'JOBS_PROGRESS_BAD_LINES', text: j.prog.bad + ' progress lines were not progress records' });
    if (outs.some(r => r.code === 1)) notes.push({ code: 'JOBS_FINDINGS', text: 'the part finished with findings (exit 1)' });
    const deps = [];
    for (const n of needs) {
      const m = C.readManifest(n.key);
      if (!m) return finish(j, 'failed', { code: 'MV_FAULT', msg: 'need ' + n.what + ' left the cache while ' + j.what + ' ran' });
      deps.push({ what: n.what, key: n.key, made: m.made });
    }
    const manifest = { part: j.row.part, partVersion: j.version, needVersions: j.needVersions || {}, contract: mv.CONTRACT, what: j.what, variant: j.c.variant, target: j.c.target,
      game: j.c.game, mods: j.c.mods, modDirs: j.c.modDirs, map: j.c.map, made: C.now(), inputs, deps, notes };
    const edir = C.commit(j.key, j.files.out, manifest);
    return finish(j, 'done', null, { entry: j.key, products: productsOf(edir) });
  }

  function cancel(id) {
    const j = jobs.get(id);
    if (!j || TERMINAL.has(j.state)) return false;
    if (j.state === 'queued') { finish(j, 'cancelled', { code: 'MV_CANCELLED', msg: 'cancelled before it ran' }); return true; }
    if (j.cancelReq) return true;
    j.cancelReq = true;
    writeFlag(j);
    killLater(j);
    return true;
  }

  return {
    problems,
    submit: req => submitAll(req, []),
    status(id) { const j = jobs.get(id); return j ? record(j) : null; },
    cancel,
    watch(fn) {
      if (typeof fn !== 'function') return () => {};
      watchers.push(fn);
      return () => { const i = watchers.indexOf(fn); if (i >= 0) watchers.splice(i, 1); };
    },
    list() {
      const all = [...active.values()].sort(bySeq);
      return { running: all.filter(j => j.state === 'running').map(record), queued: all.filter(j => j.state === 'queued').map(record), done: doneList.map(record) };
    },
    wait(id) {
      const j = jobs.get(id);
      if (!j) return Promise.resolve(null);
      if (TERMINAL.has(j.state)) return Promise.resolve(record(j));
      return new Promise(res => j.waiters.push(res));
    },
    async close() {
      const all = [...active.values()];
      for (const j of all) cancel(j.id);
      closed = true;
      if (retry) { clearTimeout(retry); retry = null; }
      await Promise.all(all.map(j => j.promise).filter(Boolean));
    },
    cache: C,
  };
}

module.exports = { VERSION, create, buildArgv, readProgress, codeOf, jsonError, productsOf, TERMINAL };

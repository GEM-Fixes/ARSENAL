// Author: Imperator_Aug (ARSENAL, ia-c11d626b)
// edrun multi (SPEED-B3): several games per edrun invocation (--list) and run lists across instances at once (--insts).
//   --list <run-list.md | .txt | .json>: every line starting `node tools/edrun/edrun.js` (or a bare pairs .json path) is one job. The edrun command line's own args
//     win over a line's, except --pairs/--out/--run-id (per line). Every job must share --game, --root, --exe and --mods: modswitch and options.set restore run
//     once per list (per instance with --insts), not once per game. A .json list is ["a.json", ...] or [{pairs, out, ...}, ...].
//   --insts 1,2,3: one worker edrun per instance (--worker --inst n), each takes the next job from this parent. A job starts only when free Windows commit
//     >= --commit-reserve MB (default 1500, 0 = off; about 1.2 GB a game, ram-1) and --stagger s (default 12) after the last start. Never instance 0.
// writes nothing itself; the workers write as edrun does.
const fs = require('fs'), path = require('path'), cp = require('child_process');
const SRC = path.resolve(__dirname, '../..');
const SHARED = ['game', 'root', 'exe', 'mods'];
const PER_LINE = ['pairs', 'out', 'run-id'];
const NOT_IN_LINE = ['inst', 'insts', 'list', 'worker'];

const splitArgs = l => (l.match(/"[^"]*"|\S+/g) || []).map(s => s.replace(/^"|"$/g, ''));
function argObj(v) {
  const a = {};
  for (let i = 0; i < v.length; i++) {
    const k = v[i];
    if (!k.startsWith('--')) throw new Error('list line: unknown arg ' + k);
    if (v[i + 1] !== undefined && !v[i + 1].startsWith('--')) a[k.slice(2)] = v[++i]; else a[k.slice(2)] = true;
  }
  return a;
}
// -> [{sec, argv}] from a run-list text (## headings name sections, as runlist.js)
function parseList(text) {
  const out = [];
  let sec = '';
  for (const l of String(text).split(/\r?\n/)) {
    const h = /^##\s+(\S+)/.exec(l);
    if (h) { sec = h[1]; continue; }
    const t = l.trim();
    if (t.startsWith('node tools/edrun/edrun.js')) out.push({ sec, argv: splitArgs(t).slice(2) });
    else if (/^[^\s`#-][^\s]*\.json$/i.test(t)) out.push({ sec, argv: ['--pairs', t] });
  }
  return out;
}
const abs = p => (path.isAbsolute(p) ? p : path.join(SRC, p));
// -> [args object per job]; throws on a list edrun cannot run in one modswitch. cli: edrun's own args (with list). known: edrun's arg names
function jobsOf(cli, known) {
  if (typeof cli.list !== 'string') throw new Error('--list needs a run list file');
  let text;
  try { text = fs.readFileSync(cli.list, 'utf8'); } catch (e) { throw new Error('--list: ' + e.message); }
  let lines;
  if (/\.json$/i.test(cli.list)) {
    let j;
    try { j = JSON.parse(text); } catch (e) { throw new Error('--list: bad json ' + e.message); }
    if (!Array.isArray(j)) throw new Error('--list json must be an array');
    lines = j.map(x => (typeof x === 'string' ? { pairs: x } : { ...x }));
  } else lines = parseList(text).map(x => argObj(x.argv));
  if (!lines.length) throw new Error('--list: no edrun line in ' + cli.list);
  const own = {};
  for (const [k, v] of Object.entries(cli)) if (!NOT_IN_LINE.includes(k) && !PER_LINE.includes(k)) own[k] = v;
  const jobs = lines.map((l, k) => {
    const j = {};
    for (const [key, v] of Object.entries(l)) if (!NOT_IN_LINE.includes(key)) j[key] = v;
    Object.assign(j, own);   // the command line wins
    if (typeof j.pairs !== 'string') throw new Error(`list job ${k}: no --pairs`);
    j.pairs = abs(j.pairs);
    if (typeof l.out === 'string') j.out = abs(l.out);
    else if (typeof cli.out === 'string') j.out = path.join(path.resolve(cli.out), path.basename(j.pairs, '.json'));
    else j.out = path.join(SRC, '../run/edrun', path.basename(j.pairs, '.json'));
    if (known) for (const key of Object.keys(j)) if (!known.includes(key)) throw new Error(`list job ${k}: unknown arg --${key}`);
    return j;
  });
  for (const key of SHARED) {
    const vals = [...new Set(jobs.map(j => (j[key] === undefined ? '' : String(j[key]).toLowerCase())))];
    if (vals.length > 1) throw new Error(`list lines differ in --${key} (${vals.join(' | ')}): one list is one mod stack and one exe; split the list`);
  }
  const outs = jobs.map(j => path.resolve(j.out).toLowerCase());
  const dup = outs.find((o, i) => outs.indexOf(o) !== i);
  if (dup) throw new Error('list: two jobs write the same --out ' + dup);
  return jobs;
}

// free commit MB (limit - committed), cached 5 s; null = unreadable. test hook: env AS64_COMMIT_FILE = "<total KB> <free KB>" (as runlist.js)
let cmC = null, cmT = 0;
function commitFreeMB() {
  const hook = process.env.AS64_COMMIT_FILE;
  if (hook) { try { return +fs.readFileSync(hook, 'utf8').trim().split(/\s+/)[1] / 1024; } catch (e) { return null; } }
  if (Date.now() - cmT < 5000) return cmC;
  cmT = Date.now(); cmC = null;
  try {
    const r = cp.spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', '$o=Get-CimInstance Win32_OperatingSystem;"$($o.TotalVirtualMemorySize) $($o.FreeVirtualMemory)"'], { encoding: 'utf8', timeout: 8000, windowsHide: true });
    const m = /(\d+)\s+(\d+)/.exec(r.stdout || '');
    if (m) cmC = +m[2] / 1024;
  } catch (e) { /* null */ }
  return cmC;
}
// -> insts [n] or an error text. never 0
function instsOf(v) {
  const xs = String(v === true ? '' : v).split(',').map(s => s.trim()).filter(Boolean).map(Number);
  if (!xs.length || xs.some(n => !(Number.isInteger(n) && n >= 1 && n <= 7))) return '--insts lists instances 1..7 (never 0), e.g. 1,2,3';
  if (new Set(xs).size !== xs.length) return '--insts: an instance twice';
  return xs;
}
// the gate: resolves when the last start is stagger ms ago and free commit >= reserve MB (null read: logged once, no commit check). opt: {now, sleep, read, log} for tests
function makeGate(opt) {
  const now = opt.now || Date.now, sleep = opt.sleep || (ms => new Promise(r => setTimeout(r, ms))), read = opt.read || commitFreeMB, log = opt.log || console.log;
  let last = -Infinity, busy = Promise.resolve(), warned = false;
  const pass = async () => {
    for (;;) {
      const wait = last + opt.stagger - now();
      if (wait > 0) { await sleep(Math.min(wait, 1000)); continue; }
      if (opt.reserve > 0) {
        const f = read();
        if (f === null || f === undefined) { if (!warned) { warned = true; log('commit read failed: no commit gate'); } }
        else if (f < opt.reserve) { await sleep(2000); continue; }
      }
      last = now();
      return;
    }
  };
  return () => (busy = busy.then(pass));
}
// parent of --insts: forks one worker per instance; each asks {ask:true}, gets {job:k|null}. -> exit code (0 all workers 0, 3 any 3, else 1)
async function parallel(script, argv, insts, jobs, opt) {
  const gate = makeGate(opt);
  let next = 0;
  const base = [];
  for (let i = 0; i < argv.length; i++) {   // drop --insts N and any --inst N
    if (argv[i] === '--insts' || argv[i] === '--inst') { i++; continue; }
    base.push(argv[i]);
  }
  const runs = insts.map(n => new Promise(res => {
    const w = cp.fork(script, [...base, '--inst', String(n), '--worker'], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    const pre = s => String(s).split(/\r?\n/).filter(Boolean).map(l => `[i${n}] ${l}`).join('\n') + '\n';
    w.stdout.on('data', d => process.stdout.write(pre(d)));
    w.stderr.on('data', d => process.stderr.write(pre(d)));
    w.on('message', async m => {
      if (!m || !m.ask) return;
      if (next >= jobs.length) { w.send({ job: null }); return; }
      const k = next++;
      await gate();
      console.log(`[i${n}] job ${k}: ${path.basename(jobs[k].pairs)} -> ${jobs[k].out}`);
      w.send({ job: k });
    });
    w.on('exit', c => res(c === null ? 3 : c));
  }));
  const codes = await Promise.all(runs);
  console.log(`--insts ${insts.join(',')}: worker exits ${codes.join(', ')}`);
  return codes.some(c => c === 3) ? 3 : codes.every(c => c === 0) ? 0 : 1;
}
// worker side: -> next job index or null
function askJob() {
  return new Promise(res => { process.once('message', m => res(m && Number.isInteger(m.job) ? m.job : null)); process.send({ ask: true }); });
}

module.exports = { parseList, jobsOf, argObj, commitFreeMB, instsOf, makeGate, parallel, askJob, SHARED, PER_LINE };

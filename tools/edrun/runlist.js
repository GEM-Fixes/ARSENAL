// runlist: run a whole edrun run list with no claude -p session in the loop. speed levers 1, 3, 4.
//   node tools/edrun/runlist.js --list <run-list.md> [--out dir] [--inst 1,2,3] [--reserve MB] [--dry-jobs 8] [--no-dry] [--allow-held]
//        [--no-stop] [--rerun 1] [--score "node x.js"] [--edrun path] [--only id,id] [--dry-only] [--stagger 20] [--claims dir]
// list: every line starting `node tools/edrun/edrun.js` (in ``` blocks or not); `## <id>` headings name sections, --only picks some.
// 1 dry check: each line with --dry --check into <out>/.dry/<game>, --dry-jobs at once; any "preflight HELD" stops the run (--allow-held: go on).
// 2 games: queue over the free instances (--inst, default 1-7, never 0); a game starts only when available RAM >= --reserve MB (default 400:
//   Windows pages and frees standby on demand, user 2026-11-08) and --stagger s (default 20) after the last start, so RAM reads the loaded game.
//   and free Windows commit (limit - committed) >= --commit-reserve MB (default 1500; 0 = off; ~1.2 GB commit a game, ram-1). Read failure: logged once, RAM check only.
//   An instance a wave session or another runlist claims (../run/sessions/claims/<n>.json, live pid) is skipped; runlist claims its own while a game runs.
// 3 control: a game whose control pair (control:true or name ctlpz) doesn't count, or with no report, is run again (--rerun times, default 1) to <out>-rerun.
// 4 early stop: a pair whose final verdict can't change (pass rule runs>=4 and ok*2>=runs, over its planned runs) is dropped from games not yet started;
//   a game left with only its control is skipped. --no-stop runs everything. ok = moved for sm_ pairs, else score.js killCounts.
// out: <out>/runlist.json {games:[{id,out,valid,rerun,skipped}], pairs:{name:{planned,runs,ok,decided,verdict}}}, runlist.txt (one line a pair). exit 0 done, 1 held or failed, 2 usage.
// Author: Imperator_Aug (ARSENAL, ia-0134d09f)
const fs = require('fs'), path = require('path'), os = require('os'), { spawn } = require('child_process');
const SRC = path.resolve(__dirname, '../..');
const args = process.argv.slice(2), a = {};
for (let i = 0; i < args.length; i++) { const k = args[i]; if (!k.startsWith('--')) continue; const n = args[i + 1]; if (n == null || n.startsWith('--')) a[k.slice(2)] = true; else { a[k.slice(2)] = n; i++; } }
if (!a.list) { console.error('usage: runlist.js --list run-list.md [--out dir] [--inst 1,2,3] [--reserve MB] [--no-dry] [--no-stop] [--score cmd]'); process.exit(2); }
const insts = String(a.inst || '1,2,3,4,5,6,7').split(',').map(Number).filter(n => n > 0);
if (!insts.length) { console.error('--inst: instance 0 is never used'); process.exit(2); }
const reserve = +(a.reserve != null ? a.reserve : 400), stagger = +(a.stagger != null ? a.stagger : 20) * 1000, dryJobs = +(a['dry-jobs'] || 8), reruns = a.rerun != null ? +a.rerun : 1;
const commitReserve = +(a['commit-reserve'] != null ? a['commit-reserve'] : 1500);
// free commit MB (limit - committed) from Win32_OperatingSystem FreeVirtualMemory (KB), cached 5 s; null = unreadable (RAM check only, logged once).
// test hook: env AS64_COMMIT_FILE = file holding "<total KB> <free KB>", read each call, no powershell.
let cmC = null, cmT = 0, cmWarned = false;
function commitFreeMB() {
  const warn = m => { if (!cmWarned) { cmWarned = true; log('commit read failed (' + m + '): RAM check only'); } return null; };
  const hook = process.env.AS64_COMMIT_FILE;
  if (hook) { try { return +fs.readFileSync(hook, 'utf8').trim().split(/\s+/)[1] / 1024; } catch (e) { return warn(e.message); } }
  if (Date.now() - cmT < 5000) return cmC;
  cmT = Date.now(); cmC = null;
  try {
    const r = require('child_process').spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', '$o=Get-CimInstance Win32_OperatingSystem;"$($o.TotalVirtualMemorySize) $($o.FreeVirtualMemory)"'], { encoding: 'utf8', timeout: 8000, windowsHide: true });
    const m = /(\d+)\s+(\d+)/.exec(r.stdout || ''); if (!m) return warn(r.error ? r.error.message : 'no numbers');
    cmC = +m[2] / 1024;
  } catch (e) { return warn(e.message); }
  return cmC;
}
const CLAIMS = path.resolve(a.claims || path.join(SRC, '../run/sessions/claims'));
const claimedElse = k => { try { const c = JSON.parse(fs.readFileSync(path.join(CLAIMS, k + '.json'), 'utf8')); if (c.pid === process.pid) return false; process.kill(c.pid, 0); return true; } catch { return false; } };
const claim = k => { try { fs.mkdirSync(CLAIMS, { recursive: true }); fs.writeFileSync(path.join(CLAIMS, k + '.json'), JSON.stringify({ pid: process.pid, wave: 'runlist', id: 'runlist' })); } catch { } };
const unclaim = k => { try { const c = JSON.parse(fs.readFileSync(path.join(CLAIMS, k + '.json'), 'utf8')); if (c.pid === process.pid) fs.unlinkSync(path.join(CLAIMS, k + '.json')); } catch { } };
const EDRUN = a.edrun ? path.resolve(a.edrun) : path.join(__dirname, 'edrun.js');

// parse the list: section ids from ## headings; argv split on spaces with "..." kept
const splitArgs = l => (l.match(/"[^"]*"|\S+/g) || []).map(s => s.replace(/^"|"$/g, ''));
let sec = '', games = [];
for (const l of fs.readFileSync(a.list, 'utf8').split(/\r?\n/)) {
  const h = l.match(/^##\s+(\S+)/); if (h) { sec = h[1]; continue; }
  if (!l.startsWith('node tools/edrun/edrun.js')) continue;
  const v = splitArgs(l).slice(2), get = k => { const i = v.indexOf(k); return i >= 0 ? v[i + 1] : null; };
  games.push({ sec, argv: v, pairs: get('--pairs'), out: get('--out') });
}
if (a.only) { const o = String(a.only).split(','); games = games.filter(g => o.includes(g.sec)); }
const abs = p => path.isAbsolute(p) ? p : path.join(SRC, p);
const OUT = abs(a.out || path.dirname(games[0] ? games[0].out : '.'));
fs.mkdirSync(OUT, { recursive: true });
games.forEach(g => { g.id = path.basename(g.out); g.list = JSON.parse(fs.readFileSync(abs(g.pairs), 'utf8')); });
const log = s => { const t = new Date().toTimeString().slice(0, 8) + ' ' + s; console.log(t); fs.appendFileSync(path.join(OUT, 'runlist.log'), t + '\n'); };
const withArg = (v, k, val) => { const r = v.slice(), i = r.indexOf(k); if (i >= 0) { if (val === null) r.splice(i, 2); else r[i + 1] = val; } else if (val !== null) r.push(k, val); return r; };
const run = (argv) => new Promise(res => { const p = spawn(process.execPath, [EDRUN, ...argv], { cwd: SRC }); let o = ''; p.stdout.on('data', d => o += d); p.stderr.on('data', d => o += d); p.on('close', c => res({ code: c, out: o })); });

const isCtl = p => p.control === true || p.name === 'ctlpz';
let killCounts; try { killCounts = require('../score/score.js').killCounts; } catch { killCounts = p => !!p.counted; }
const okOf = p => p.name.startsWith('sm_') ? p.moved != null : !!killCounts(p);
const P = {};
for (const g of games) for (const p of g.list) if (!isCtl(p)) (P[p.name] = P[p.name] || { planned: 0, runs: 0, ok: 0, decided: false, verdict: null }).planned++;
const pass = e => e.runs >= 4 && e.ok * 2 >= e.runs;
function decide(e) { // verdict over the planned runs, fixed whatever the remaining runs do; null = still open
  const rem = e.planned - e.runs;
  if (e.planned < 4 || (e.ok + rem) * 2 < e.planned) return 'fail'; // even all-ok remaining can't pass
  if (e.ok * 2 >= e.planned) return 'pass';                          // even all-fail remaining still passes
  return null;
}

async function dry() {
  let i = 0, held = [];
  const worker = async () => { while (i < games.length) { const g = games[i++];
    const r = await run(withArg(withArg(g.argv.filter(x => x !== '--dry' && x !== '--check'), '--out', path.join(OUT, '.dry', g.id)), '--inst', String(insts[0])).concat(['--dry', '--check']));
    for (const m of r.out.matchAll(/preflight HELD (.*)/g)) held.push(g.id + ': ' + m[1]);
    if (r.code) held.push(g.id + ': dry exit ' + r.code + ' ' + r.out.trim().split('\n').pop()); } };
  await Promise.all(Array.from({ length: Math.min(dryJobs, games.length) }, worker));
  return held;
}

async function main() {
  log(`runlist ${a.list}: ${games.length} games, ${Object.keys(P).length} pairs, inst ${insts.join(',')}, out ${OUT}`);
  if (!a['no-dry']) { const t = Date.now(), held = await dry(); log(`dry check ${((Date.now() - t) / 1000).toFixed(0)} s, held ${held.length}`); held.forEach(h => log('HELD ' + h));
    if (held.length && !a['allow-held']) { log('stop: held pairs (--allow-held to run anyway)'); process.exit(1); } }
  if (a['dry-only']) return;
  if (!require('../lib/platform').requireWin('running games in the editor (runlist)')) return;
  const queue = games.map(g => ({ g, tries: 0 })), free = insts.slice(), res = []; let active = 0, lastStart = 0, commitHeld = false;
  await new Promise(done => {
    const next = () => {
      while (free.length && queue.length) {
        if (os.freemem() / 1048576 < reserve && active) break;
        if (active && commitReserve > 0) { const cf = commitFreeMB(); const low = cf != null && cf < commitReserve;
          if (low !== commitHeld) { commitHeld = low; log(low ? `commit hold: free commit ${cf.toFixed(0)} MB < --commit-reserve ${commitReserve}` : 'commit release'); }
          if (low) break; }
        if (active && Date.now() - lastStart < stagger) break;
        const fi = free.findIndex(n => !claimedElse(String(n))); if (fi < 0) break;
        const q = queue.shift(), g = q.g;
        let list = g.list; if (!a['no-stop']) list = list.filter(p => isCtl(p) || !P[p.name].decided);
        if (!list.some(p => !isCtl(p))) { log(`skip ${g.id}: every pair decided`); res.push({ id: g.id, skipped: true }); continue; }
        const out = abs(g.out) + (q.tries ? '-rerun' + (q.tries > 1 ? q.tries : '') : '');
        let argv = withArg(g.argv, '--out', out);
        if (list.length !== g.list.length) { const f = path.join(OUT, '.pairs', g.id + '.json'); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(list, null, 1)); argv = withArg(argv, '--pairs', f); }
        const inst = free.splice(fi, 1)[0]; claim(String(inst)); lastStart = Date.now(); active++; argv = withArg(argv, '--inst', String(inst));
        log(`start ${path.basename(out)} inst ${inst}, ${list.length} pairs`);
        run(argv).then(r => {
          active--; unclaim(String(inst)); free.push(inst);
          const rf = path.join(out, 'report.json'); let R = null; try { R = JSON.parse(fs.readFileSync(rf, 'utf8')); } catch { }
          const rows = R ? R.pairs || [] : [], ctl = rows.find(isCtl), valid = !!(ctl && okOf(ctl));
          log(`done ${path.basename(out)} exit ${r.code}, ${R ? 'report' : 'no report: ' + (r.out.trim().split('\n').pop() || '').slice(0, 200)}, control ${valid ? 'ok' : 'FAILED'}`);
          if (!valid && q.tries < reruns) { q.tries++; queue.unshift(q); }
          else { res.push({ id: g.id, out, valid, rerun: q.tries });
            if (valid) for (const p of rows) { if (isCtl(p) || !P[p.name]) continue; const e = P[p.name]; e.runs++; if (okOf(p)) e.ok++; }
            for (const p of g.list) if (!isCtl(p) && P[p.name]) P[p.name].planned -= list.includes(p) && valid ? 0 : 1; // a void or dropped run is not planned any more
            for (const [n, e] of Object.entries(P)) if (!e.decided && e.runs < e.planned && !a['no-stop']) { const d = decide(e); if (d) { e.decided = true; e.verdict = d; log(`decided ${n} ${d} at ${e.ok}/${e.runs} of ${e.planned}`); } } }
          next();
        });
      }
      if (!queue.length && !active) done();
      else if (free.length && queue.length) setTimeout(next, Math.min(5000, Math.max(500, stagger))); // RAM below --reserve: look again
    };
    next();
  });
  for (const e of Object.values(P)) if (!e.verdict) e.verdict = pass(e) ? 'pass' : 'fail';
  fs.writeFileSync(path.join(OUT, 'runlist.json'), JSON.stringify({ games: res, pairs: P }, null, 1));
  const lines = Object.entries(P).sort().map(([n, e]) => `${e.verdict === 'pass' ? 'PASS' : 'fail'} ${n} ${e.ok}/${e.runs}${e.decided ? ' early' : ''}`);
  const np = Object.values(P).filter(e => e.verdict === 'pass').length, nv = res.filter(r => r.valid).length;
  fs.writeFileSync(path.join(OUT, 'runlist.txt'), `games ${res.length}, valid ${nv}, skipped ${res.filter(r => r.skipped).length}; passing ${np}/${lines.length}\n` + lines.join('\n') + '\n');
  log(`end: games ${res.length}, valid ${nv}, passing ${np}/${lines.length} -> ${path.join(OUT, 'runlist.txt')}`);
  if (a.score) { const s = await new Promise(r => { const p = spawn(a.score, { cwd: SRC, shell: true, stdio: 'inherit' }); p.on('close', r); }); log('score exit ' + s); }
}
main().catch(e => { console.error(e); process.exit(1); });

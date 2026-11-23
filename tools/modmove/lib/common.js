// modmove common: targets, install resolution, versions, child-tool runner, process helpers.
// targets: as64 (as64.exe, x64, control pipe) | mowas2 (mowas_2.exe, retail 3.262 x86, no pipe/-instance/-console/-control, TST-19) | goh (call_to_arms.exe, x64)
// Author: Imperator_Aug (ARSENAL, ia-a5d21d5a)
const fs = require('fs'), path = require('path'), os = require('os');
const cp = require('child_process');
const platform = require('../../lib/platform');
const gamedir = require('../../lib/gamedir'), gamever = require('../../lib/gamever');

const TARGETS = ['as64', 'mowas2', 'goh'];
const DEFAULT_GOH = require('../../lib/gamedir').goh();
const DEFAULT_AS2 = require('../../lib/gamedir').resolve().dir;
const TOOLS = path.resolve(__dirname, '..', '..');
const MODERN_MIN = [3, 301];   //
const verParse = s => String(s || '').replace(/[^0-9.]/g, '').split('.').filter(x => x !== '').map(Number);
// same as : only components present in both count, so 3.262.1 == 3.262
function verCmp(a, b) { const n = Math.min(a.length, b.length); for (let i = 0; i < n; i++) { if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1; } return 0; }
const fwd = p => String(p).replace(/\\/g, '/');
const sleepSync = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

// install roots. o.as2 / o.goh explicit, else env AS2_GAME / GOH_GAME, else gamedir (AS2), else the default install paths when they exist.
function installs(o) {
  let as2 = o.as2 || process.env.AS2_GAME || null;
  if (!as2) { const r = gamedir.resolve({}); as2 = r.dir || (typeof DEFAULT_AS2 === 'string' && fs.existsSync(DEFAULT_AS2) ? DEFAULT_AS2 : null); }
  let goh = o.goh || process.env.GOH_GAME || (typeof DEFAULT_GOH === 'string' && fs.existsSync(DEFAULT_GOH) ? DEFAULT_GOH : null);
  return { as2, goh };
}
function exeOf(target, inst, o) {
  const ov = o && o['exe-' + target];
  if (ov) return path.resolve(ov);
  if (target === 'goh') return inst.goh && path.join(inst.goh, 'binaries', 'x64', 'call_to_arms.exe');
  return inst.as2 && path.join(inst.as2, target === 'as64' ? 'as64.exe' : 'mowas_2.exe');
}
const rootOf = (target, inst) => target === 'goh' ? inst.goh : inst.as2;

// "3.2.6.2" (PE FILEVERSION of both AS2 exes) -> data version "3.262" [I: PE field layout inferred; matches vfs.js 3.262.1]
function dataVersion(target, exe) {
  const pe = exe && fs.existsSync(exe) ? gamever.peVersion(exe) : null;
  if (target === 'goh') {
    const g = pe && /^(\d+)\.(\d)\.(\d)\.(\d)/.exec(pe);   // "1.0.6.7-aaa36ed4d" -> 1.067, same as settings.set lastGameVersion 1.067.0
    return { ver: g ? g[1] + '.' + g[2] + g[3] + g[4] : pe, scale: 'goh', src: pe ? 'exe PE ProductVersion' : 'unknown', inferred: !g };
  }
  const m = pe && /^(\d+)\.(\d)\.(\d)\.(\d)/.exec(pe);
  if (m) return { ver: m[1] + '.' + m[2] + m[3] + m[4], scale: 'as2', src: 'exe PE ' + pe, inferred: false };
  return { ver: '3.262', scale: 'as2', src: 'default (eMod data version 3.262)', inferred: true };
}

// ---- child tools: node tools/<tool>/<script> args -> {status, out}
function runTool(tool, args, opt = {}) {
  const script = path.join(TOOLS, tool, (opt.script || tool) + '.js');
  const r = cp.spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', maxBuffer: 256 << 20, timeout: opt.timeout || 600000, cwd: opt.cwd || process.cwd(), windowsHide: true });
  return { status: r.status, out: (r.stdout || '') + '', err: (r.stderr || '') + '', error: r.error };
}
// `file:line: CODE msg` lines -> [{file,line,code,msg}]
function parseFindings(text) {
  const out = [];
  for (const l of text.split(/\r?\n/)) {
    const m = /^(?:info: )?(.+?)(?::(\d+))?: ((?:WARN_)?[A-Z][A-Z0-9_]+) (.*)$/.exec(l);
    if (m && !/^\d+ findings/.test(l)) out.push({ file: m[1], line: m[2] ? +m[2] : 0, code: m[3], msg: m[4], info: l.startsWith('info: ') });
  }
  return out;
}

// ---- processes (Windows). full-path lookups only, never by bare image name
function listProcs() {
  if (!platform.isWin()) {
    const r = cp.spawnSync('ps', ['-eo', 'pid=,ppid=,args='], { encoding: 'utf8' });
    return (r.stdout || '').split('\n').map(l => /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(l)).filter(Boolean).map(m => ({ pid: +m[1], ppid: +m[2], path: m[3].split(' ')[0], cmd: m[3] }));
  }
  const ps = 'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,ExecutablePath,CommandLine | ConvertTo-Json -Compress';
  // an empty list reads as 'game not running': a failed query must never look like that, so retry and then throw
  let why = '';
  for (let n = 0; n < 4; n++) {
    const r = cp.spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8', maxBuffer: 64 << 20, windowsHide: true });
    try {
      const j = JSON.parse(r.stdout || '[]');
      if (Array.isArray(j) && j.length) {
        // a retry that then worked: say why the earlier tries failed (fix-later: cause of the intermittent empty list under test-all load)
        if (n) console.error(`listProcs: ok on try ${n + 1}; earlier: ${why}`);
        return j.map(p => ({ pid: p.ProcessId, ppid: p.ParentProcessId, path: p.ExecutablePath || '', cmd: p.CommandLine || '' }));
      }
      why += `try ${n + 1}: empty list; ` + String(r.stderr || r.error || '').slice(0, 200);
    } catch (e) { why += `try ${n + 1}: ` + e.message + '; ' + String(r.stderr || '').slice(0, 200); }
    cp.spawnSync(process.execPath, ['-e', 'setTimeout(()=>{},500)']);
  }
  throw new Error('process list unavailable: ' + why);
}
// matcher for an exe path; a .js override (tests: stub game run via node) matches by command line containing the script path
function matcherFor(exe) {
  const lo = fwd(path.resolve(exe)).toLowerCase();
  if (/\.js$/i.test(exe)) return p => fwd(p.cmd).toLowerCase().includes(lo) && p.pid !== process.pid;
  return p => !!p.path && fwd(p.path).toLowerCase() === lo;
}
function killTree(pid) {
  if (platform.isWin()) platform.killPid(pid);
  else { try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ } }
}

// ---- cleanup stack: run on error, SIGINT, SIGTERM, exit (LIFO, each once)
const cleanups = [];
let hooked = false;
function onCleanup(fn) {
  if (!hooked) {
    hooked = true;
    const run = () => { while (cleanups.length) { const f = cleanups.pop(); try { f(); } catch (e) { console.error('cleanup failed: ' + e.message); } } };
    process.on('exit', run);
    for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(s, () => { run(); process.exit(130); });
    cleanups.runAll = run;
  }
  cleanups.push(fn);
  return () => { const i = cleanups.indexOf(fn); if (i >= 0) cleanups.splice(i, 1); };
}

function tmpDir(prefix) { return fs.mkdtempSync(path.join(os.tmpdir(), prefix)); }
function copyDir(src, dst) { fs.cpSync(src, dst, { recursive: true }); }
function walk(dir, base = dir, out = []) {
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) walk(p, base, out); else out.push(fwd(path.relative(base, p)));
  }
  return out;
}
// tree signature for byte-identical checks: rel path + size + sha1 of content
function treeHash(dir) {
  const h = require('crypto').createHash('sha1');
  if (!fs.existsSync(dir)) return 'absent';
  for (const f of walk(dir).sort()) { h.update(f + '\0'); h.update(fs.readFileSync(path.join(dir, f))); h.update('\0'); }
  return h.digest('hex');
}

module.exports = { TARGETS, DEFAULT_GOH, DEFAULT_AS2, TOOLS, MODERN_MIN, verParse, verCmp, fwd, sleepSync, installs, exeOf, rootOf, dataVersion,
  runTool, parseFindings, listProcs, matcherFor, killTree, onCleanup, tmpDir, copyDir, walk, treeHash };

// platform: the one place that knows which operating system the tools run on.
// Open a URL / file / folder, list and kill processes, per-user data/config/cache folders, scratch folder (tmpDir),
// installed-program lookup (findProgram, findBlender),
// and a plain "this needs Windows" error for features that drive the game (a Windows program).
// Every export takes opt {platform, env, spawn, home} so tests never run real commands for other systems:
//   platform  'win32' | 'darwin' | 'linux' (default process.platform)
//   env       environment object (default process.env)
//   spawn     spawnSync-like (file, args, options) -> {status, stdout, error} (default: child_process)
//   home      home folder (default os.homedir())
// Commands are always an argv array with shell:false; nothing built from input goes through a shell string,
// except the Windows `cmd /c start` that the tools used before, where the URL is checked and quoted first.
// Non-Windows branches are unproven on real Linux/macOS: kept small on purpose.
// Author: Imperator_Aug (ARSENAL, ia-358695f6)
'use strict';
const path = require('path'), os = require('os'), cp = require('child_process');

const plat = opt => (opt && opt.platform) || process.platform;
const envOf = opt => (opt && opt.env) || process.env;
const homeOf = opt => (opt && opt.home) || os.homedir();
const P = opt => (plat(opt) === 'win32' ? path.win32 : path.posix);

const isWin = opt => plat(opt) === 'win32';
const isMac = opt => plat(opt) === 'darwin';
const isLinux = opt => plat(opt) === 'linux';
// display name of the system
function name(opt) { const p = plat(opt); return p === 'win32' ? 'Windows' : p === 'darwin' ? 'macOS' : p === 'linux' ? 'Linux' : p; }

// default launcher for open*: detached, not waited for (a browser or file manager may stay running).
// spawnSync-like result: ok when the OS gave a pid (a missing program gives none).
function launch(file, args) {
  try {
    const ch = cp.spawn(file, args, { shell: false, detached: true, stdio: 'ignore', windowsHide: false });
    ch.on('error', () => {});
    if (ch.pid) { ch.unref(); return { status: 0, pid: ch.pid }; }
    return { status: null, error: new Error('could not start ' + file) };
  } catch (e) { return { status: null, error: e }; }
}
function run(opt, file, args, launcher) {
  const r = opt && opt.spawn ? opt.spawn(file, args, { shell: false, windowsHide: true, stdio: 'ignore' }) : launcher(file, args);
  return { ok: !!r && !r.error, cmd: [file, ...args] };
}

// cmd.exe would expand %NAME% of a defined variable even inside quotes: refuse such URLs
function cmdSafe(url, env) {
  if (/["\s\x00-\x1f\x7f]/.test(url)) return false;
  const keys = new Set(Object.keys(env).map(k => k.toLowerCase()));
  const re = /%([^%]+)%/g; let m;
  while ((m = re.exec(url))) if (keys.has(m[1].toLowerCase())) return false;
  return true;
}

// openUrl(url) -> {ok, cmd}. Only http, https and file URLs.
function openUrl(url, opt) {
  let u;
  try { u = new URL(String(url)); } catch (e) { return { ok: false, cmd: null, why: 'not a URL' }; }
  if (!/^(https?|file):$/.test(u.protocol)) return { ok: false, cmd: null, why: 'only http, https and file URLs open' };
  const s = String(url);
  if (isWin(opt)) {
    if (!cmdSafe(s, envOf(opt))) return { ok: false, cmd: null, why: 'URL has characters the Windows shell would change' };
    // what the tools did before (cmd /c start "" url); quoted so & | < > stay part of the URL
    const args = ['/d', '/s', '/c', 'start "" "' + s + '"'];
    const r = opt && opt.spawn ? opt.spawn('cmd', args, { shell: false, windowsHide: true, windowsVerbatimArguments: true, stdio: 'ignore' })
      : (() => { try { const ch = cp.spawn('cmd', args, { shell: false, detached: true, stdio: 'ignore', windowsHide: true, windowsVerbatimArguments: true }); ch.on('error', () => {}); if (ch.pid) { ch.unref(); return { status: 0 }; } return { error: new Error('cmd') }; } catch (e) { return { error: e }; } })();
    return { ok: !!r && !r.error, cmd: ['cmd', ...args] };
  }
  return run(opt, isMac(opt) ? 'open' : 'xdg-open', [s], launch);
}

// openPath(file): open a file or folder with its default program
function openPath(file, opt) {
  const f = String(file);
  if (isWin(opt)) return run(opt, 'explorer.exe', [f], launch);
  return run(opt, isMac(opt) ? 'open' : 'xdg-open', [f], launch);
}

// revealInFolder(file): show the file selected in its folder (Linux: open the parent folder)
function revealInFolder(file, opt) {
  const f = String(file);
  if (isWin(opt)) return run(opt, 'explorer.exe', ['/select,' + f], launch);
  if (isMac(opt)) return run(opt, 'open', ['-R', f], launch);
  // a drive-letter or UNC path keeps its own rules whatever the platform is (a test host that plays Linux, a path from a Windows share):
  // posix dirname of 'C:\\m\\x.def' is '.', which opened the current folder
  const pp = /^[A-Za-z]:[\\/]/.test(f) || f.startsWith('\\\\') ? path.win32 : P(opt);
  return run(opt, 'xdg-open', [pp.dirname(f)], launch);
}

// tasklist CSV: "name","pid","session","#","mem"
function parseTasklistCsv(text) {
  const out = [];
  for (const line of String(text).split(/\r?\n/)) {
    const m = /^"([^"]*)","(\d+)"/.exec(line.trim());
    if (m) out.push({ name: m[1], pid: +m[2] });
  }
  return out;
}
// ps -A -o pid=,comm= : "  123 /usr/bin/foo" (macOS gives a path, Linux a name cut to 15 chars)
function parsePs(text) {
  const out = [];
  for (const line of String(text).split(/\r?\n/)) {
    const m = /^\s*(\d+)\s+(.+?)\s*$/.exec(line);
    if (m) out.push({ name: path.posix.basename(m[2]), pid: +m[1] });
  }
  return out;
}

// processList() -> [{name, pid}], or null when the system gave no usable list (callers fail closed)
function processList(opt) {
  const sp = (opt && opt.spawn) || cp.spawnSync, win = isWin(opt);
  const [file, args] = win ? ['tasklist', ['/fo', 'csv', '/nh']] : ['ps', ['-A', '-o', 'pid=,comm=']];
  let r;
  try { r = sp(file, args, { shell: false, encoding: 'latin1', windowsHide: true, timeout: 15000, maxBuffer: 32 << 20 }); } catch (e) { return null; }
  if (!r || r.error || r.status !== 0 || r.signal) return null;
  const list = (win ? parseTasklistCsv : parsePs)(r.stdout || '');
  return list.length ? list : null;
}

// isRunning(name | RegExp) -> true | false | null (null: no process list). Names compare without case;
// on Linux ps cuts names to 15 characters, so a longer name also matches its first 15.
function isRunning(want, opt) {
  const list = processList(opt);
  if (!list) return null;
  if (want instanceof RegExp) return list.some(p => want.test(p.name));
  const w = String(want).toLowerCase(), cut = isLinux(opt) && w.length > 15 ? w.slice(0, 15) : null;
  return list.some(p => { const n = p.name.toLowerCase(); return n === w || (cut !== null && n === cut); });
}

// commandLines() -> [{pid, name, cmd}] of every process, or null when unreadable. Windows: Win32_Process through PowerShell
// (cmd null while a process starts or closes); others: ps -A -o pid=,args= (a game under Proton/Wine shows its .exe path and
// arguments there [I], so name is the first "*.exe" in the line, else the program's base name)
function commandLines(opt) {
  const sp = (opt && opt.spawn) || cp.spawnSync;
  if (isWin(opt)) {
    const ps = 'Get-CimInstance Win32_Process | Select-Object ProcessId,Name,CommandLine | ConvertTo-Json -Compress';
    let r;
    try { r = sp('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { shell: false, encoding: 'utf8', windowsHide: true, timeout: 20000, maxBuffer: 64 << 20 }); } catch (e) { return null; }
    if (!r || r.error || r.status !== 0) return null;
    try { return [].concat(JSON.parse(String(r.stdout || '').trim())).map(p => ({ pid: p.ProcessId, name: p.Name || '', cmd: p.CommandLine || null })); } catch (e) { return null; }
  }
  let r;
  try { r = sp('ps', ['-A', '-o', 'pid=,args='], { shell: false, encoding: 'utf8', timeout: 15000, maxBuffer: 64 << 20 }); } catch (e) { return null; }
  if (!r || r.error || r.status !== 0) return null;
  const out = [];
  for (const line of String(r.stdout || '').split(/\r?\n/)) {
    const m = /^\s*(\d+)\s+(.+?)\s*$/.exec(line);
    if (!m) continue;
    const exe = /([^\\\/\s"]+\.exe)(?=[\s"]|$)/i.exec(m[2]);
    out.push({ pid: +m[1], name: exe ? exe[1] : path.posix.basename(m[2].split(/\s+/)[0]), cmd: m[2] });
  }
  return out;
}

// killPid(pid) -> {ok, cmd}. Windows: taskkill /PID pid /T /F (the tree, forced). Others: kill -KILL pid.
function killPid(pid, opt) {
  const n = Number(pid);
  if (!Number.isInteger(n) || n <= 0) return { ok: false, cmd: null, why: 'not a process id' };
  const sp = (opt && opt.spawn) || cp.spawnSync;
  const [file, args] = isWin(opt) ? ['taskkill', ['/PID', String(n), '/T', '/F']] : ['kill', ['-KILL', String(n)]];
  let r;
  try { r = sp(file, args, { shell: false, stdio: 'ignore', windowsHide: true }); } catch (e) { r = { error: e }; }
  return { ok: !!r && !r.error && r.status === 0, cmd: [file, ...args] };
}

// absolute value of an XDG variable, else null (the spec says relative values are ignored)
function xdg(opt, key) { const v = envOf(opt)[key]; return v && path.posix.isAbsolute(v) ? v : null; }

// per-user data folder. Windows %LOCALAPPDATA%\ARSENAL (no LOCALAPPDATA: ~\.arsenal, as the tools did before)
function dataDir(opt) {
  const h = homeOf(opt), p = P(opt);
  if (isWin(opt)) { const l = envOf(opt).LOCALAPPDATA; return l ? p.join(l, 'ARSENAL') : p.join(h, '.arsenal'); }
  if (isMac(opt)) return p.join(h, 'Library', 'Application Support', 'ARSENAL');
  return p.join(xdg(opt, 'XDG_DATA_HOME') || p.join(h, '.local', 'share'), 'arsenal');
}
function configDir(opt) {
  if (isWin(opt) || isMac(opt)) return dataDir(opt);
  return P(opt).join(xdg(opt, 'XDG_CONFIG_HOME') || P(opt).join(homeOf(opt), '.config'), 'arsenal');
}
function cacheDir(opt) {
  const h = homeOf(opt), p = P(opt);
  if (isWin(opt)) return p.join(dataDir(opt), 'cache');
  if (isMac(opt)) return p.join(h, 'Library', 'Caches', 'ARSENAL');
  return p.join(xdg(opt, 'XDG_CACHE_HOME') || p.join(h, '.cache'), 'arsenal');
}

// tmpDir(sub) -> scratch folder for tools and tests: env ARSENAL_TMP (absolute), else <os temp>/arsenal; + sub when given.
// Not created here (callers mkdir what they use).
function tmpDir(sub, opt) {
  const e = envOf(opt).ARSENAL_TMP, p = P(opt);
  const base = e && p.isAbsolute(e) ? e : p.join((opt && opt.tmp) || os.tmpdir(), 'arsenal');
  return sub ? p.join(base, sub) : base;
}

// findProgram(spec) -> full path of an installed program, or null. Order: spec.path (given by the user), env spec.env,
// Windows registry values spec.reg [{key, value}] (folder or exe), known folders spec.dirs (Windows: names under
// ProgramFiles / ProgramFiles(x86) / LOCALAPPDATA\Programs; a '*' segment matches any subfolder), spec.unix full paths
// (macOS / Linux), then PATH. spec.exe = file name without .exe. Several hits: highest version number in the path wins.
function findProgram(spec, opt) {
  const fs = require('fs'), env = envOf(opt), p = P(opt), win = isWin(opt), sp = (opt && opt.spawn) || cp.spawnSync;
  const exe = win ? spec.exe + '.exe' : spec.exe;
  const isFile = f => { try { return !!f && fs.statSync(f).isFile(); } catch (e) { return false; } };
  const asExe = f => { try { return fs.statSync(f).isDirectory() ? p.join(f, exe) : f; } catch (e) { return f; } };
  for (const f of [spec.path, spec.env && env[spec.env]]) if (f && isFile(asExe(f))) return asExe(f);
  const c = [];
  const expand = (base, rel) => {
    let cur = [base];
    for (const seg of rel.split(/[\\/]/)) {
      const next = [];
      for (const d of cur) {
        if (seg !== '*') { next.push(p.join(d, seg)); continue; }
        try { for (const n of fs.readdirSync(d)) next.push(p.join(d, n)); } catch (e) { /* no folder */ }
      }
      cur = next;
    }
    return cur;
  };
  if (win) {
    for (const r of spec.reg || []) {
      let out = '';
      try { out = (sp('reg', ['query', r.key, '/s', '/v', r.value], { encoding: 'utf8', windowsHide: true }) || {}).stdout || ''; } catch (e) { /* no reg */ }
      for (const m of String(out).matchAll(/REG_(?:EXPAND_)?SZ\s+(.+)/g)) c.push(asExe(m[1].trim()));
    }
    const bases = [env.ProgramFiles, env['ProgramFiles(x86)'], env.ProgramW6432, env.LOCALAPPDATA && p.join(env.LOCALAPPDATA, 'Programs')].filter(Boolean);
    for (const b of bases) for (const d of spec.dirs || []) for (const f of expand(b, d)) c.push(asExe(f));
  } else for (const f of spec.unix || []) c.push(f);
  for (const d of String(env.PATH || env.Path || '').split(win ? ';' : ':')) if (d) c.push(p.join(d, exe));
  const ver = f => { const m = /(\d+)\.(\d+)/.exec(f); return m ? +m[1] * 1000 + +m[2] : 0; };
  return [...new Set(c)].filter(isFile).sort((a, b) => ver(b) - ver(a))[0] || null;
}
// Blender: --blender / $BLENDER, registry, Program Files\Blender Foundation\*, macOS / Linux folders, PATH
const findBlender = (given, opt) => findProgram({ exe: 'blender', path: given, env: 'BLENDER',
  reg: [{ key: 'HKLM\\SOFTWARE\\BlenderFoundation', value: 'InstallDir' }, { key: 'HKCU\\SOFTWARE\\BlenderFoundation', value: 'InstallDir' }],
  dirs: ['Blender Foundation/*'],
  unix: ['/Applications/Blender.app/Contents/MacOS/Blender', '/usr/bin/blender', '/usr/local/bin/blender', '/snap/bin/blender', '/opt/blender/blender'] }, opt);

// unsupported(feature) -> Error {code: 'PLATFORM_UNSUPPORTED'}, e.g. "Starting the game works on Windows only, not on Linux."
function unsupported(feature, opt) {
  const f = String(feature || 'This feature');
  const e = new Error(f.charAt(0).toUpperCase() + f.slice(1) + ' works on Windows only, not on ' + name(opt) + '.');
  e.code = 'PLATFORM_UNSUPPORTED';
  e.feature = f;
  e.platform = plat(opt);
  return e;
}

// for CLI mains: on a system other than Windows print the unsupported sentence and exit 2 (opt.exit, opt.log for tests).
// Returns true on Windows.
function requireWin(feature, opt) {
  if (isWin(opt)) return true;
  const e = unsupported(feature, opt);
  ((opt && opt.log) || (s => process.stderr.write(s + '\n')))(e.message);
  ((opt && opt.exit) || process.exit)(2);
  return false;
}

module.exports = { isWin, isMac, isLinux, name, openUrl, openPath, revealInFolder, processList, isRunning, commandLines, killPid,
  dataDir, configDir, cacheDir, tmpDir, findProgram, findBlender, unsupported, requireWin, parseTasklistCsv, parsePs };

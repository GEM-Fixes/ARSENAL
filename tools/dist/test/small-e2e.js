// The small package's launchers, end to end, on this machine. Windows only (the cmd part needs cmd.exe, curl.exe, tar.exe, certutil.exe;
// the sh part runs the POSIX launchers under Git Bash's sh, which proves argument passing, folder resolution and the fetch path there,
// NOT Linux or macOS). Nothing touches the internet: a fixture server on 127.0.0.1 (fixserve.js) serves
//   node-v<ver>-win-x64.zip     a stored zip holding a copy of this node.exe (built in scratch now, never committed)
//   node-v<ver>-linux-x64.tar.gz holding bin/node = a sh shim that execs this node.exe (so the sh fetch path can run under Git Bash)
// The package is a test build (test/smallbuild.js: loopback pin, sh launchers told they run on Linux x86_64) of a small fixture tools tree
// (the real as2.js, menu.js, credit.js, INDEX.md, index/ + stub tools), unzipped into a folder whose name has spaces, parentheses and &.
// LOCALAPPDATA, HOME and XDG_DATA_HOME point into scratch; the real profile is never written. A read-only package folder is made with
// an icacls deny (create files / folders) for the current user on the scratch package folder, removed afterwards.
// usage: node tools/dist/test/small-e2e.js [--scratch dir] [--keep]
// Author: Imperator_Aug (ARSENAL, ia-eefe0639)
const fs = require('fs'), os = require('os'), path = require('path'), zlib = require('zlib'), crypto = require('crypto'), { spawnSync, spawn } = require('child_process');
const DIST = path.join(__dirname, '..'), TOOLS = path.join(DIST, '..');
const Z = require(path.join(DIST, 'zip.js')), L = require(path.join(DIST, 'launch.js')), SEA = require(path.join(DIST, 'sea.js'));
const argv = process.argv.slice(2), opt = n => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
if (process.platform !== 'win32') { console.log('small-e2e: SKIP (Windows only; see tools/dist/ci/test.yml for Linux and macOS)'); process.exit(0); }
const S = opt('--scratch') ? path.resolve(opt('--scratch')) : fs.mkdtempSync(path.join(os.tmpdir(), 'arsenal-small-e2e-'));
fs.rmSync(S, { recursive: true, force: true }); fs.mkdirSync(S, { recursive: true });
let fails = 0, server = null;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL: ' + m); } return c; };
const mk = (p, s) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); return p; };
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const VER = process.versions.node, SYSROOT = process.env.SystemRoot || 'C:\\Windows', SYS32 = path.join(SYSROOT, 'System32');
const STAMP = '// Author: Imperator_Aug (as64 toolkit, ia-00000000)\n';
const fwd = p => p.replace(/\\/g, '/');

// ---- fixtures: download files
function storedZip(name, data) {
  const n = Buffer.from(name), crc = zlib.crc32(data), h = Buffer.alloc(30), c = Buffer.alloc(46), e = Buffer.alloc(22);
  h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt32LE(crc, 14); h.writeUInt32LE(data.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(n.length, 26);
  c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt32LE(crc, 16); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(n.length, 28);
  const cstart = 30 + n.length + data.length;
  e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(1, 8); e.writeUInt16LE(1, 10); e.writeUInt32LE(46 + n.length, 12); e.writeUInt32LE(cstart, 16);
  return Buffer.concat([h, n, data, c, n, e]);
}
function tarGz(files) {
  const parts = [];
  for (const f of files) {
    const h = Buffer.alloc(512), oct = (v, len) => v.toString(8).padStart(len - 1, '0') + '\0';
    h.write(f.name, 0, 100); h.write(oct(f.mode, 8), 100); h.write(oct(0, 8), 108); h.write(oct(0, 8), 116); h.write(oct(f.data.length, 12), 124); h.write(oct(0, 12), 136);
    h.write('        ', 148); h.write('0', 156); h.write('ustar\0', 257); h.write('00', 263);
    let sum = 0; for (const b of h) sum += b;
    h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);
    parts.push(h, f.data, Buffer.alloc((512 - f.data.length % 512) % 512));
  }
  parts.push(Buffer.alloc(1024));
  return zlib.gzipSync(Buffer.concat(parts));
}
const SRV = path.join(S, 'srv'), LOG = path.join(S, 'requests.log');
fs.mkdirSync(SRV, { recursive: true }); fs.writeFileSync(LOG, '');
const winZip = storedZip(`node-v${VER}-win-x64/node.exe`, fs.readFileSync(process.execPath));
fs.writeFileSync(path.join(SRV, `node-v${VER}-win-x64.zip`), winZip);
const tgz = tarGz([{ name: `node-v${VER}-linux-x64/bin/node`, mode: 0o755, data: Buffer.from(`#!/bin/sh\nexec '${fwd(process.execPath)}' "$@"\n`) }]);
fs.writeFileSync(path.join(SRV, `node-v${VER}-linux-x64.tar.gz`), tgz);
const requests = () => fs.readFileSync(LOG, 'utf8').split('\n').filter(Boolean);

// ---- fixture tools tree: the real front door files + stubs for the gate lists
const FX = path.join(S, 'tools-fx');
for (const k of ['as2/as2.js', 'as2/menu.js', 'lib/credit.js', 'INDEX.md']) mk(path.join(FX, k), fs.readFileSync(path.join(TOOLS, k)));
for (const n of fs.readdirSync(path.join(TOOLS, 'index')).filter(n => fs.statSync(path.join(TOOLS, 'index', n)).isFile())) mk(path.join(FX, 'index', n), fs.readFileSync(path.join(TOOLS, 'index', n)));
for (const k of ['score/score.js', 'usage/usage.js', 'soedit/soedit.js']) mk(path.join(FX, k), STAMP + 'console.log("stub")\n');
const KEYS = [...new Set(SEA.manifestKeys(FX, Z.RELEASE_DROP.split(',')))];

function pinFor(port, over = {}) {
  const files = {};
  for (const k of L.SYSTEMS) files[k] = { file: `node-v${VER}-${k}.${k.startsWith('win-') ? 'zip' : 'tar.gz'}`, sha256: '0'.repeat(64) };
  files['win-x64'].sha256 = sha(winZip); files['linux-x64'].sha256 = sha(tgz);
  for (const [k, v] of Object.entries(over)) files[k].sha256 = v;
  return { version: VER, base: `http://127.0.0.1:${port}/`, files };
}
const renderAs = (pin, sys = 'Linux', mach = 'x86_64') => L.render(pin, { arsenalVersion: SEA.buildVersion(), keys: KEYS, moduleOnly: Z.MODULE_ONLY }, { sys, mach });
function unzip(f, dest) {
  const b = fs.readFileSync(f), e = b.lastIndexOf(Buffer.from([0x50, 0x4b, 5, 6])), n = b.readUInt16LE(e + 10);
  let p = b.readUInt32LE(e + 16);
  for (let i = 0; i < n; i++) {
    const nl = b.readUInt16LE(p + 28), xl = b.readUInt16LE(p + 30), cl = b.readUInt16LE(p + 32), off = b.readUInt32LE(p + 42), cs = b.readUInt32LE(p + 20);
    const name = b.slice(p + 46, p + 46 + nl).toString('utf8'), lo = off + 30 + b.readUInt16LE(off + 26) + b.readUInt16LE(off + 28);
    mk(path.join(dest, name), zlib.inflateRawSync(b.slice(lo, lo + cs)));
    p += 46 + nl + xl + cl;
  }
}

// ---- runners
const LAD = path.join(S, 'localappdata'), HOME = path.join(S, 'home'), XDG = path.join(S, 'xdg');
const CLEAR = /^(path|localappdata|arsenal_node|node_options|xdg_data_home|home|gem_index_dir|gemindex_data|arsenal_soedit|arsenal_version)$/i;
function baseEnv(pathList, extra = {}) {
  const e = {};
  for (const [k, v] of Object.entries(process.env)) if (!CLEAR.test(k)) e[k] = v;
  return { ...e, PATH: pathList.join(';'), LOCALAPPDATA: LAD, HOME, XDG_DATA_HOME: XDG, ...extra };
}
const NOPATH = [SYS32, SYSROOT];
// cmd: the line a user types, through cmd.exe /d /s /c "<line>"
function cmd(script, rawArgs, env, cwd) {
  const line = `"${script}"${rawArgs ? ' ' + rawArgs : ''}`;
  const r = spawnSync(path.join(SYS32, 'cmd.exe'), ['/d', '/s', '/c', `"${line}"`], { env, cwd: cwd || S, encoding: 'utf8', windowsVerbatimArguments: true, timeout: 300000, maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  return { rc: r.status, out: r.stdout || '', err: r.stderr || '' };
}
const PRE = mk(path.join(S, 'pre', 'argv.js'), "process.stdout.write(JSON.stringify({ exec: process.execPath, argv: process.argv.slice(1) }) + '\\n'); process.exit(process.argv.includes('rc7') ? 7 : 0);\n");
const parse = s => { try { return JSON.parse(s.trim().split('\n').pop()); } catch (e) { return null; } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sameFile = (a, b) => path.resolve(fwd(a).replace(/^\/([a-z])\//i, '$1:/')).toLowerCase() === path.resolve(b).toLowerCase();
const icacls = (dir, args) => spawnSync(path.join(SYS32, 'icacls.exe'), [dir, ...args], { encoding: 'utf8', windowsHide: true });
const WHO = process.env.USERNAME;
const readOnly = dir => icacls(dir, ['/deny', `${WHO}:(WD,AD)`]);
const writable = dir => icacls(dir, ['/remove:d', WHO]);

async function startServer() {
  server = spawn(process.execPath, [path.join(__dirname, 'fixserve.js'), SRV, LOG], { stdio: ['ignore', 'pipe', 'inherit'], windowsHide: true });
  return new Promise((res, rej) => {
    let buf = ''; const t = setTimeout(() => rej(new Error('fixture server did not start')), 15000);
    server.stdout.on('data', d => { buf += d; const m = /port (\d+)/.exec(buf); if (m) { clearTimeout(t); res(Number(m[1])); } });
    server.on('exit', c => rej(new Error('fixture server exited ' + c)));
  });
}

async function main() {
  const port = await startServer();
  // ---- build the test package and unzip it into a folder with spaces and parentheses
  const pin = pinFor(port), pinFile = mk(path.join(S, 'pin.json'), JSON.stringify(pin));
  const b = spawnSync(process.execPath, [path.join(__dirname, 'smallbuild.js'), 'Linux', 'x86_64', '--ver', '9.9.9', '--assets-root', FX, '--out-dir', path.join(S, 'out'), '--no-workshop_gui', '--no-gemindex', '--no-ww2sources', '--no-pdf', '--no-whole', '--pin', pinFile], { encoding: 'utf8' });
  if (!ok(b.status === 0, 'build rc ' + b.status + '\n' + b.stdout + b.stderr)) return;
  const pkgParent = path.join(S, 'pkg dir (x86) & co'), pkg = path.join(pkgParent, 'ARSENAL-9.9.9');
  unzip(path.join(S, 'out', 'ARSENAL-9.9.9-small.zip'), pkgParent);
  const as2 = path.join(pkg, 'tools', 'as2', 'as2.js'), nodeDir = path.join(pkg, 'node'), fetched = path.join(nodeDir, VER, 'node.exe');
  const direct = spawnSync(process.execPath, [as2, 'help'], { encoding: 'utf8' }).stdout;
  ok(/ARSENAL/.test(direct), 'direct help output');
  const launcher = n => path.join(pkg, n), put = (n, buf) => fs.writeFileSync(launcher(n), buf);
  const orig = {}; for (const n of L.NAMES) orig[n] = fs.readFileSync(launcher(n));
  const reset = () => { fs.rmSync(nodeDir, { recursive: true, force: true }); fs.rmSync(LAD, { recursive: true, force: true }); fs.rmSync(XDG, { recursive: true, force: true }); for (const n of L.NAMES) put(n, orig[n]); };

  // ======== Windows: ARSENAL.cmd / ARSENAL-gui.cmd
  const C = launcher('ARSENAL.cmd'), G = launcher('ARSENAL-gui.cmd');
  let r = cmd(C, 'help', baseEnv(NOPATH));
  ok(r.rc === 0 && r.out === direct, 'cmd 1 first run: help output equals node as2.js help (rc ' + r.rc + ')\n' + r.err.slice(-600));
  ok(/ARSENAL: first start: downloading Node\.js .* from http:\/\/127\.0\.0\.1:\d+\/ into ".*\\node\\/.test(r.err), 'cmd 1 one line says what, from where, into which folder\n' + r.err.slice(0, 400));
  ok(requests().length === 1 && fs.existsSync(fetched) && same(fs.readdirSync(nodeDir), [VER]) && same(fs.readdirSync(path.join(nodeDir, VER)), ['node.exe']), 'cmd 1 fetched once, only node.exe kept, no part folder: ' + requests().join(' ') + ' | ' + (fs.existsSync(nodeDir) ? fs.readdirSync(nodeDir).join(' ') : 'no node dir'));
  r = cmd(C, 'help', baseEnv(NOPATH));
  ok(r.rc === 0 && r.out === direct && requests().length === 1 && !/downloading/.test(r.err), 'cmd 2 second run: no download (requests ' + requests().length + ')');
  r = cmd(C, '--version', baseEnv(NOPATH));
  ok(r.rc === 0 && r.out.includes(SEA.buildVersion()), 'cmd 3 --version carries the build version: ' + r.out.trim());
  for (const [a, want] of [['score', /unknown tool 'score'/], ['dev usage', /'usage' needs the source tree/], ['dev score', /unknown tool 'score'/], ['soedit build', /soedit build: SOEdit is not part of ARSENAL. ARSENAL soedit install/]]) {
    r = cmd(C, a, baseEnv(NOPATH));
    ok(r.rc === 2 && want.test(r.err), `cmd 4 refused like the exe: ARSENAL ${a} (rc ${r.rc}) ${r.err.trim()}`);
  }
  const pre = { NODE_OPTIONS: `--require ${PRE}` };
  r = cmd(C, 'zz "a b" "say \\"hi\\"" plain "" "x&y" "100%" "(p)"', baseEnv(NOPATH, { ARSENAL_NODE: process.execPath, ...pre }));
  let j = parse(r.out);
  ok(j && sameFile(j.exec, process.execPath), 'cmd 5 ARSENAL_NODE honoured: ' + (j && j.exec) + ' rc ' + r.rc + ' ' + r.err);
  ok(j && sameFile(j.argv[0], as2) && same(j.argv.slice(1), ['zz', 'a b', 'say "hi"', 'plain', '', 'x&y', '100%', '(p)']), 'cmd 5 arguments with spaces and quotes arrive intact: ' + JSON.stringify(j && j.argv));
  r = cmd(C, 'zz rc7', baseEnv(NOPATH, { ARSENAL_NODE: process.execPath, ...pre }));
  ok(r.rc === 7, 'cmd 5 exit code passed through: ' + r.rc);
  r = cmd(G, '', baseEnv(NOPATH, { ARSENAL_NODE: process.execPath, ...pre }));
  j = parse(r.out); ok(j && same(j.argv.slice(1), ['gui', '--open']), 'cmd 6 ARSENAL-gui.cmd with no arguments = gui --open: ' + JSON.stringify(j && j.argv));
  r = cmd(G, 'help', baseEnv(NOPATH, { ARSENAL_NODE: process.execPath, ...pre }));
  j = parse(r.out); ok(j && same(j.argv.slice(1), ['help']), 'cmd 6 ARSENAL-gui.cmd with arguments passes them: ' + JSON.stringify(j && j.argv));
  r = cmd(C, 'help', baseEnv(NOPATH, { ARSENAL_NODE: path.join(S, 'nope', 'node.exe') }));
  ok(r.rc === 3 && /ARSENAL_NODE is set to/.test(r.err), 'cmd 7 a missing ARSENAL_NODE stops (rc ' + r.rc + ')');
  // c: node on PATH
  reset(); let n0 = requests().length;
  r = cmd(C, 'help', baseEnv([path.dirname(process.execPath), ...NOPATH]));
  ok(r.rc === 0 && r.out === direct && requests().length === n0 && !fs.existsSync(nodeDir), 'cmd 8 a node ' + L.MIN_MAJOR + '+ on PATH is used, nothing fetched (rc ' + r.rc + ')\n' + r.err.slice(-300));
  const fake = mk(path.join(S, 'oldnode', 'node.cmd'), '@echo off\r\nrem stands for a node older than MIN_MAJOR: prints no path\r\nexit /b 0\r\n');
  r = cmd(C, 'help', baseEnv([path.dirname(fake), ...NOPATH]));
  ok(r.rc === 0 && requests().length === n0 + 1 && fs.existsSync(fetched), 'cmd 9 a node below MIN_MAJOR on PATH is not used: fetched (rc ' + r.rc + ')');
  // wrong sha256: stops before unpacking, leaves nothing
  reset(); n0 = requests().length;
  put('ARSENAL.cmd', renderAs(pinFor(port, { 'win-x64': 'f'.repeat(64) }))['ARSENAL.cmd']);
  r = cmd(C, 'help', baseEnv(NOPATH));
  ok(r.rc === 3 && /checksum mismatch .* want sha256 f{64}, got [0-9a-f]{64}/.test(r.err) && requests().length === n0 + 1, 'cmd 10 wrong sha256 stops, rc 3 (rc ' + r.rc + ')\n' + r.err.slice(-400));
  ok(!fs.existsSync(nodeDir) && !fs.existsSync(path.join(LAD, 'ARSENAL')), 'cmd 10 nothing left behind: ' + (fs.existsSync(nodeDir) ? fs.readdirSync(nodeDir).join(' ') : '') + (fs.existsSync(path.join(LAD, 'ARSENAL')) ? ' LOCALAPPDATA\\ARSENAL' : ''));
  // download failure (404): stops, leaves nothing
  reset(); const p404 = pinFor(port); p404.files['win-x64'].file = `node-v${VER}-win-x64.zip`; fs.renameSync(path.join(SRV, p404.files['win-x64'].file), path.join(SRV, 'hidden.zip'));
  r = cmd(C, 'help', baseEnv(NOPATH));
  fs.renameSync(path.join(SRV, 'hidden.zip'), path.join(SRV, p404.files['win-x64'].file));
  ok(r.rc === 3 && /the download of .* failed/.test(r.err) && !fs.existsSync(nodeDir), 'cmd 11 a failed download stops and leaves nothing (rc ' + r.rc + ')');
  // read-only package folder: the per-user folder under LOCALAPPDATA (scratch)
  reset(); n0 = requests().length;
  const ro = readOnly(pkg);
  try {
    ok(ro.status === 0, 'cmd 12 icacls deny ' + ro.stdout + ro.stderr);
    ok((() => { try { fs.mkdirSync(path.join(pkg, 'probe')); fs.rmdirSync(path.join(pkg, 'probe')); return false; } catch (e) { return true; } })(), 'cmd 12 the package folder is really read-only');
    r = cmd(C, 'help', baseEnv(NOPATH));
    ok(r.rc === 0 && r.out === direct && requests().length === n0 + 1 && fs.existsSync(path.join(LAD, 'ARSENAL', 'node', VER, 'node.exe')) && !fs.existsSync(nodeDir), 'cmd 12 read-only package: fetched into LOCALAPPDATA\\ARSENAL\\node\\<ver> (rc ' + r.rc + ')\n' + r.err.slice(-400));
    r = cmd(C, 'help', baseEnv(NOPATH));
    ok(r.rc === 0 && requests().length === n0 + 1, 'cmd 12 second run uses the per-user copy');
  } finally { writable(pkg); }

  // ======== POSIX sh launchers under Git Bash (argument passing, folder resolution, fetch path; NOT Linux/macOS)
  const shExe = (() => { const w = spawnSync(path.join(SYS32, 'where.exe'), ['sh'], { encoding: 'utf8' }); const c = [...(w.stdout || '').split(/\r?\n/).filter(Boolean), ...[process.env.ProgramFiles, process.env.ProgramW6432].filter(Boolean).map(p => path.join(p, 'Git', 'usr', 'bin', 'sh.exe'))]; return c.find(p => /usr\\bin\\sh\.exe$/i.test(p) && fs.existsSync(p)); })();
  if (!shExe) { console.log('small-e2e: no Git Bash sh found: sh launcher part skipped'); return; }
  const gitUsr = path.dirname(shExe), gitMingw = path.join(gitUsr, '..', '..', 'mingw64', 'bin');
  const SHPATH = [gitUsr, gitMingw, SYS32, SYSROOT];
  const posix = p => fwd(p).replace(/^([A-Za-z]):/, (m, d) => '/' + d.toLowerCase());   // what HOME / XDG_DATA_HOME look like to a POSIX shell
  const sh = (args, env, cwd) => {
    env = { ...env, HOME: posix(HOME), XDG_DATA_HOME: posix(XDG) }; const x = spawnSync(shExe, args, { env, cwd: cwd || S, encoding: 'utf8', timeout: 300000, maxBuffer: 1 << 26, windowsHide: true }); return { rc: x.status, out: x.stdout || '', err: x.stderr || '' }; };
  reset();
  for (const n of ['arsenal', 'arsenal-gui']) { r = sh(['-n', launcher(n)], baseEnv(SHPATH)); ok(r.rc === 0, `sh 0 sh -n ${n}: ${r.err}`); }
  const A = launcher('arsenal');
  const shPre = { ARSENAL_NODE: fwd(process.execPath), NODE_OPTIONS: `--require ${PRE}` };
  // the call is written as a sh script (POSIX quoting), so the Windows-to-Cygwin command line parsing of this test harness plays no part
  const call = mk(path.join(S, 'call.sh'), `exec sh '${fwd(A)}' zz 'a b' 'say "hi"' '' 'x&y' '$HOME' 'semi;colon' "it's"\n`);
  r = sh([fwd(call)], baseEnv(SHPATH, shPre));
  j = parse(r.out);
  ok(j && sameFile(j.exec, process.execPath) && sameFile(j.argv[0], as2) && same(j.argv.slice(1), ['zz', 'a b', 'say "hi"', '', 'x&y', '$HOME', 'semi;colon', "it's"]), 'sh 1 ARSENAL_NODE honoured, arguments intact: ' + JSON.stringify(j) + ' rc ' + r.rc + ' ' + r.err);
  r = sh([fwd(path.relative(S, A))], baseEnv(SHPATH, { ...shPre }), S);
  j = parse(r.out); ok(j && sameFile(j.argv[0], as2), 'sh 2 started by a relative path from another folder: finds its package: ' + JSON.stringify(j && j.argv[0]));
  const link = path.join(S, 'bin', 'arsenal'); fs.mkdirSync(path.dirname(link), { recursive: true });
  const ln = sh(['-c', 'ln -s "$1" "$2" && test -h "$2"', 'sh', fwd(A), fwd(link)], baseEnv(SHPATH, { MSYS: 'winsymlinks:nativestrict' }));
  if (ln.rc === 0) { r = sh([fwd(link)], baseEnv(SHPATH, shPre)); j = parse(r.out); ok(j && sameFile(j.argv[0], as2), 'sh 3 started through a symlink: finds its package: ' + JSON.stringify(j && j.argv[0])); }
  else console.log('small-e2e: sh 3 symlink case not run: this account cannot make native symlinks (' + (ln.err.trim().split('\n')[0] || 'ln failed') + ')');
  r = sh([launcher('arsenal-gui')], baseEnv(SHPATH, shPre)); j = parse(r.out);
  ok(j && same(j.argv.slice(1), ['gui', '--open']), 'sh 4 arsenal-gui with no arguments = gui --open: ' + JSON.stringify(j && j.argv));
  r = sh([A, 'zz', 'rc7'], baseEnv(SHPATH, shPre)); ok(r.rc === 7, 'sh 4 exit code passed through: ' + r.rc);
  r = sh([A, 'score'], baseEnv(SHPATH)); ok(r.rc === 2 && /unknown tool 'score'/.test(r.err), 'sh 5 refused like the exe: score');
  r = sh([A, 'dev', 'usage'], baseEnv(SHPATH)); ok(r.rc === 2 && /'usage' needs the source tree/.test(r.err), 'sh 5 refused like the exe: dev usage');
  // fetch (the tar.gz fixture; Linux x86_64 baked in by the test build), second run, checksum mismatch, unknown system, read-only package
  n0 = requests().length;
  r = sh([A, 'help'], baseEnv(SHPATH));
  ok(r.rc === 0 && r.out === direct && requests().length === n0 + 1 && /first start: downloading Node\.js .*linux-x64\.tar\.gz/.test(r.err), 'sh 6 fetch, check, unpack bin/node, run help (rc ' + r.rc + ')\n' + r.err.slice(-500));
  ok(fs.existsSync(path.join(nodeDir, VER, 'node')) && same(fs.readdirSync(nodeDir), [VER]) && same(fs.readdirSync(path.join(nodeDir, VER)), ['node']), 'sh 6 only node kept, no part folder');
  r = sh([A, 'help'], baseEnv(SHPATH));
  ok(r.rc === 0 && requests().length === n0 + 1, 'sh 7 second run: no download');
  reset(); n0 = requests().length;
  put('arsenal', renderAs(pinFor(port, { 'linux-x64': 'e'.repeat(64) }))['arsenal']);
  r = sh([A, 'help'], baseEnv(SHPATH));
  ok(r.rc === 3 && /checksum mismatch .* want sha256 e{64}, got [0-9a-f]{64}/.test(r.err) && requests().length === n0 + 1 && !fs.existsSync(nodeDir), 'sh 8 wrong sha256 stops, rc 3, nothing left (rc ' + r.rc + ')\n' + r.err.slice(-400));
  reset();
  put('arsenal', renderAs(pinFor(port), 'Plan9', 'mips')['arsenal']);
  r = sh([A, 'help'], baseEnv(SHPATH));
  ok(r.rc === 3 && /no Node\.js download is pinned for this system \(Plan9 mips\)\. Install Node\.js /.test(r.err) && !fs.existsSync(nodeDir), 'sh 9 unknown system: says what to install, rc 3 (rc ' + r.rc + ')');
  reset(); n0 = requests().length;
  const ro2 = readOnly(pkg);
  try {
    ok(ro2.status === 0, 'sh 10 icacls deny');
    r = sh([A, 'help'], baseEnv(SHPATH));
    ok(r.rc === 0 && r.out === direct && fs.existsSync(path.join(XDG, 'arsenal', 'node', VER, 'node')) && !fs.existsSync(nodeDir), 'sh 10 read-only package: fetched into $XDG_DATA_HOME/arsenal/node/<ver> (rc ' + r.rc + ')\n' + r.err.slice(-400));
  } finally { writable(pkg); }
  reset();
}

main().catch(e => ok(false, 'exception: ' + (e && e.stack || e))).finally(() => {
  if (server) server.kill();
  if (!argv.includes('--keep')) { try { fs.rmSync(S, { recursive: true, force: true }); } catch (e) { console.log('small-e2e: scratch not removed: ' + e.message); } }
  console.log(fails ? `small-e2e: ${fails} failed` : 'small-e2e: PASS');
  process.exit(fails ? 1 : 0);
});

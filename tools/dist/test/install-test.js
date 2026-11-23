// W6 U1: Install-ARSENAL.cmd and the Uninstall-ARSENAL.cmd it writes, end to end on this machine (Windows only), never into the real
// profile: LOCALAPPDATA, APPDATA, TEMP, TMP and USERPROFILE point into a scratch folder, PATH holds only System32 (no node), and every
// install goes into <scratch>/... with --no-shortcuts. Downloads only from the fixture server on 127.0.0.1 (fixserve.js).
//   small: a test build of the small package (smallbuild.js, loopback pin) of a fixture tools tree, unzipped into a folder with spaces
//          and parentheses: --dry changes nothing; --dir installs, the installed ARSENAL.cmd fetches the pinned Node.js (sha256 checked)
//          into <install>/node; the record lists what was made; Uninstall-ARSENAL.cmd --dry changes nothing, then --remove-caches
//          removes the folder, its own temp copy and nothing else.
//   exe:   a fake full download (ARSENAL.exe = a copy of System32 where.exe, so `ARSENAL.exe game` fails = game not found) installs
//          and uninstalls the same way; a file the user put into the install folder is kept.
//   refusals: a non-empty folder without the record, a folder inside steamapps\common, uninstall of a folder without the record.
// After each step: the download folder and the scratch profile folders are byte for byte as before; the real profile's
// %LOCALAPPDATA%\Programs\ARSENAL and Start menu ARSENAL.lnk are as before.
// usage: node tools/dist/test/install-test.js [--scratch dir] [--keep]
// Author: Imperator_Aug (ARSENAL, ia-b74a8197)
const fs = require('fs'), os = require('os'), path = require('path'), zlib = require('zlib'), crypto = require('crypto'), { spawnSync, spawn } = require('child_process');
const DIST = path.join(__dirname, '..'), TOOLS = path.join(DIST, '..');
const Z = require(path.join(DIST, 'zip.js')), L = require(path.join(DIST, 'launch.js')), SEA = require(path.join(DIST, 'sea.js'));
const argv = process.argv.slice(2), opt = n => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
if (process.platform !== 'win32') { console.log('install-test: SKIP (Windows only)'); process.exit(0); }
const S = opt('--scratch') ? path.resolve(opt('--scratch')) : fs.mkdtempSync(path.join(os.tmpdir(), 'arsenal-install-test-'));
fs.rmSync(S, { recursive: true, force: true }); fs.mkdirSync(S, { recursive: true });
let fails = 0, server = null;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL: ' + m); } return c; };
const mk = (p, s) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); return p; };
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const VER = process.versions.node, SYSROOT = process.env.SystemRoot || 'C:\\Windows', SYS32 = path.join(SYSROOT, 'System32');
const STAMP = '// Author: Imperator_Aug (as64 toolkit, ia-00000000)\n';

// ---- fixture download: a stored zip holding a copy of this node.exe
function storedZip(name, data) {
  const n = Buffer.from(name), crc = zlib.crc32(data), h = Buffer.alloc(30), c = Buffer.alloc(46), e = Buffer.alloc(22);
  h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt32LE(crc, 14); h.writeUInt32LE(data.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(n.length, 26);
  c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt32LE(crc, 16); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(n.length, 28);
  e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(1, 8); e.writeUInt16LE(1, 10); e.writeUInt32LE(46 + n.length, 12); e.writeUInt32LE(30 + n.length + data.length, 16);
  return Buffer.concat([h, n, data, c, n, e]);
}
const SRV = path.join(S, 'srv'), LOG = path.join(S, 'requests.log');
fs.mkdirSync(SRV, { recursive: true }); fs.writeFileSync(LOG, '');
const winZip = storedZip(`node-v${VER}-win-x64/node.exe`, fs.readFileSync(process.execPath));
fs.writeFileSync(path.join(SRV, `node-v${VER}-win-x64.zip`), winZip);

// ---- fixture tools tree (the real front door + stubs), as small-e2e.js
const FX = path.join(S, 'tools-fx');
for (const k of ['as2/as2.js', 'as2/menu.js', 'lib/credit.js', 'INDEX.md']) mk(path.join(FX, k), fs.readFileSync(path.join(TOOLS, k)));
for (const n of fs.readdirSync(path.join(TOOLS, 'index'))) mk(path.join(FX, 'index', n), fs.readFileSync(path.join(TOOLS, 'index', n)));
for (const k of ['score/score.js', 'usage/usage.js', 'soedit/soedit.js']) mk(path.join(FX, k), STAMP + 'console.log("stub")\n');
function pinFor(port) {
  const files = {};
  for (const k of L.SYSTEMS) files[k] = { file: `node-v${VER}-${k}.${k.startsWith('win-') ? 'zip' : 'tar.gz'}`, sha256: '0'.repeat(64) };
  files['win-x64'].sha256 = sha(winZip);
  return { version: VER, base: `http://127.0.0.1:${port}/`, files };
}
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

// ---- scratch profile + runner
const PROF = { LOCALAPPDATA: path.join(S, 'prof', 'localappdata'), APPDATA: path.join(S, 'prof', 'appdata'), TEMP: path.join(S, 'prof', 'temp'), USERPROFILE: path.join(S, 'prof', 'home') };
for (const d of Object.values(PROF)) fs.mkdirSync(d, { recursive: true });
const CLEAR = /^(path|localappdata|appdata|temp|tmp|userprofile|home|arsenal_node|node_options|gem_index_dir|gemindex_data|arsenal_soedit|arsenal_version|as2_game)$/i;
const env = {};
for (const [k, v] of Object.entries(process.env)) if (!CLEAR.test(k)) env[k] = v;
Object.assign(env, PROF, { TMP: PROF.TEMP, HOME: PROF.USERPROFILE, PATH: [SYS32, SYSROOT].join(';') });
function cmd(script, rawArgs) {
  const line = `"${script}"${rawArgs ? ' ' + rawArgs : ''}`;
  const r = spawnSync(path.join(SYS32, 'cmd.exe'), ['/d', '/s', '/c', `"${line}"`], { env, cwd: PROF.USERPROFILE, encoding: 'utf8', windowsVerbatimArguments: true, timeout: 300000, maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  return { rc: r.status, out: (r.stdout || '') + (r.stderr || '') };
}
// snapshot: every file under the folders that must not change (path, size, sha256)
function snap(dirs) {
  const acc = [];
  const walk = (d, rel) => { if (!fs.existsSync(d)) return; for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { acc.push(rel + e.name + '/'); walk(p, rel + e.name + '/'); } else acc.push(rel + e.name + ' ' + sha(fs.readFileSync(p))); } };
  for (const d of dirs) { acc.push('# ' + d); walk(d, ''); }
  return acc.join('\n');
}
const real = () => { const l = process.env.LOCALAPPDATA || '', a = process.env.APPDATA || ''; return [fs.existsSync(path.join(l, 'Programs', 'ARSENAL')), fs.existsSync(path.join(a, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'ARSENAL.lnk'))].join(','); };
const list = d => fs.existsSync(d) ? fs.readdirSync(d).sort() : null;

async function startServer() {
  server = spawn(process.execPath, [path.join(__dirname, 'fixserve.js'), SRV, LOG], { stdio: ['ignore', 'pipe', 'inherit'], windowsHide: true });
  return new Promise((res, rej) => {
    let buf = ''; const t = setTimeout(() => rej(new Error('fixture server did not start')), 15000);
    server.stdout.on('data', d => { buf += d; const m = /port (\d+)/.exec(buf); if (m) { clearTimeout(t); res(Number(m[1])); } });
    server.on('exit', c => rej(new Error('fixture server exited ' + c)));
  });
}

async function main() {
  const realBefore = real(), port = await startServer();
  const pinFile = mk(path.join(S, 'pin.json'), JSON.stringify(pinFor(port)));
  const b = spawnSync(process.execPath, [path.join(__dirname, 'smallbuild.js'), 'Linux', 'x86_64', '--ver', '9.9.9', '--assets-root', FX, '--out-dir', path.join(S, 'out'), '--no-workshop_gui', '--no-gemindex', '--no-ww2sources', '--no-pdf', '--no-whole', '--pin', pinFile], { encoding: 'utf8' });
  if (!ok(b.status === 0, 'small build rc ' + b.status + '\n' + b.stdout + b.stderr)) return;
  const dl = path.join(S, 'dl (x86) small'), pkg = path.join(dl, 'ARSENAL-9.9.9');
  unzip(path.join(S, 'out', 'ARSENAL-9.9.9-small.zip'), dl);
  const instFile = path.join(pkg, 'Install-ARSENAL.cmd');
  ok(fs.existsSync(instFile) && fs.readFileSync(instFile).equals(L.installer()), 'small zip carries Install-ARSENAL.cmd with the builder bytes');
  const keep = () => snap([pkg, ...Object.values(PROF)]);
  const base = keep();

  // A. dry run, default folder (the scratch LOCALAPPDATA\Programs\ARSENAL): prints the steps, changes nothing
  let r = cmd(instFile, '--dry');
  ok(r.rc === 0, 'A dry rc ' + r.rc + '\n' + r.out);
  for (const re of [/ok    system: Windows 1[01], 64-bit/, /to    ".*localappdata\\Programs\\ARSENAL"/i, /dry   would copy/, /dry   would run ARSENAL\.cmd version/, /web browser: /, /WebGL: cannot be checked/, /dry   would check that the cache folder/, /dry   would run ARSENAL game/, /dry   would make an ARSENAL shortcut in the Start menu/, /Dry run done: nothing was changed/])
    ok(re.test(r.out), 'A dry output has ' + re + '\n' + r.out);
  ok(keep() === base && !fs.existsSync(path.join(PROF.LOCALAPPDATA, 'Programs')), 'A dry changed nothing');
  ok(fs.readFileSync(LOG, 'utf8') === '', 'A dry downloaded nothing');

  // B. install into a scratch folder, no shortcuts: copy, fetch the pinned node through the installed ARSENAL.cmd, record, uninstaller
  const inst = path.join(S, 'inst dir (1)', 'ARSENAL');
  r = cmd(instFile, `--dir "${inst}" --no-shortcuts`);
  ok(r.rc === 0, 'B install rc ' + r.rc + '\n' + r.out);
  const got = list(inst) || [];
  for (const n of [...L.NAMES, 'Install-ARSENAL.cmd', 'START-HERE.md', 'tools', 'node', 'Uninstall-ARSENAL.cmd', 'ARSENAL-install.txt']) ok(got.includes(n), 'B installed ' + n + ': ' + got.join(' '));
  ok(fs.existsSync(path.join(inst, 'node', VER, 'node.exe')), 'B the pinned node.exe is in <install>/node/' + VER);
  ok(/node-v[\d.]+-win-x64\.zip/.test(fs.readFileSync(LOG, 'utf8')), 'B node fetched from the fixture server');
  ok(/ok    Node\.js: the pinned version is in/.test(r.out) && /--    Men of War: Assault Squad 2: not found/.test(r.out) && /ok    cache folder: .* can be written/.test(r.out) && /shortcuts: none \(--no-shortcuts\)/.test(r.out), 'B report lines\n' + r.out);
  const rec = fs.existsSync(path.join(inst, 'ARSENAL-install.txt')) ? fs.readFileSync(path.join(inst, 'ARSENAL-install.txt'), 'utf8') : '';
  ok(/^item node\r?$/m.test(rec) && /^item tools\r?$/m.test(rec) && /^item Uninstall-ARSENAL\.cmd\r?$/m.test(rec) && !/^link /m.test(rec), 'B record\n' + rec);
  ok(keep() === base, 'B nothing outside the install folder changed (download folder, scratch profile)');
  const un = path.join(inst, 'Uninstall-ARSENAL.cmd');
  ok(fs.existsSync(un) && /--uninstall "%~dp0\." %\*/.test(fs.readFileSync(un, 'utf8')), 'B uninstaller hands over to Install-ARSENAL.cmd --uninstall');

  // B2. a second install over it is allowed (record present); a refusal for a folder with other files
  const other = path.join(S, 'other'); mk(path.join(other, 'mine.txt'), 'x');
  r = cmd(instFile, `--dir "${other}" --no-shortcuts`);
  ok(r.rc === 3 && /already holds other files/.test(r.out) && JSON.stringify(list(other)) === '["mine.txt"]', 'B2 non-empty folder refused\n' + r.out);
  r = cmd(instFile, `--dir "${path.join(S, 'lib', 'steamapps', 'common', 'Game', 'ARSENAL')}" --no-shortcuts`);
  ok(r.rc === 3 && /inside a Steam game folder/.test(r.out) && !fs.existsSync(path.join(S, 'lib')), 'B2 steamapps\\common refused\n' + r.out);
  r = cmd(instFile, `--uninstall "${other}"`);
  ok(r.rc === 3 && /no ARSENAL-install\.txt/.test(r.out) && JSON.stringify(list(other)) === '["mine.txt"]', 'B2 uninstall of a folder without the record refused\n' + r.out);

  // C. uninstall: --dry changes nothing; then remove (caches: the scratch LOCALAPPDATA\ARSENAL made here is removed)
  const before = snap([inst]);
  r = cmd(un, '--dry');
  ok(r.rc === 0 && /dry   would remove ".*tools"/.test(r.out) && /Dry run done/.test(r.out), 'C uninstall --dry rc ' + r.rc + '\n' + r.out);
  ok(snap([inst]) === before && keep() === base, 'C uninstall --dry changed nothing');
  mk(path.join(PROF.LOCALAPPDATA, 'ARSENAL', 'cache', 'x.json'), '{}');
  r = cmd(un, '--remove-caches');
  ok(r.rc === 0, 'C uninstall rc ' + r.rc + '\n' + r.out);
  ok(!fs.existsSync(inst) && /ARSENAL is removed/.test(r.out), 'C install folder gone\n' + r.out + '\n' + (list(inst) || []).join(' '));
  ok(!fs.existsSync(path.join(PROF.LOCALAPPDATA, 'ARSENAL')), 'C caches removed (--remove-caches)');
  ok(keep() === base, 'C nothing else changed (download folder, scratch profile; the uninstaller temp copy is gone)\n' + (list(PROF.TEMP) || []).join(' '));
  ok(JSON.stringify(list(path.join(S, 'inst dir (1)'))) === '[]', 'C only the install folder went, its parent stays');

  // D. full download kind (fake exe), a user file in the install folder is kept, caches kept by default
  const dl2 = path.join(S, 'dl exe'), pkg2 = path.join(dl2, 'ARSENAL-9.9.9');
  fs.mkdirSync(pkg2, { recursive: true });
  fs.copyFileSync(path.join(SYS32, 'where.exe'), path.join(pkg2, 'ARSENAL.exe'));
  fs.writeFileSync(path.join(pkg2, 'ARSENAL-gui.cmd'), L.exeGui()); fs.writeFileSync(path.join(pkg2, 'Install-ARSENAL.cmd'), L.installer());
  mk(path.join(pkg2, 'guide', 'README.md'), '# guide\n');
  const base2 = snap([pkg2, ...Object.values(PROF)]), inst2 = path.join(S, 'inst2');
  r = cmd(path.join(pkg2, 'Install-ARSENAL.cmd'), `/dir "${inst2}" /no-shortcuts`);
  ok(r.rc === 0 && /the exe download/.test(r.out) && /Men of War: Assault Squad 2: not found/.test(r.out) && !/Node\.js/.test(r.out), 'D exe install rc ' + r.rc + '\n' + r.out);
  ok(JSON.stringify(list(inst2)) === JSON.stringify(['ARSENAL-gui.cmd', 'ARSENAL-install.txt', 'ARSENAL.exe', 'Install-ARSENAL.cmd', 'Uninstall-ARSENAL.cmd', 'guide']), 'D installed files: ' + (list(inst2) || []).join(' '));
  mk(path.join(inst2, 'my notes.txt'), 'mine');
  r = cmd(path.join(inst2, 'Uninstall-ARSENAL.cmd'), '--keep-caches');
  ok(r.rc === 0 && JSON.stringify(list(inst2)) === '["my notes.txt"]' && /kept  ".*my notes\.txt" \(not made by the installer\)/.test(r.out), 'D uninstall keeps the user file\n' + r.out + '\n' + (list(inst2) || []).join(' '));
  ok(snap([pkg2, ...Object.values(PROF)]) === base2, 'D nothing else changed');

  ok(real() === realBefore, 'the real profile: Programs\\ARSENAL and the Start menu ARSENAL.lnk as before (' + realBefore + ' -> ' + real() + ')');
}
main().catch(e => { fails++; console.log('FAIL: ' + (e && e.stack || e)); }).finally(() => {
  if (server) server.kill();
  if (!argv.includes('--keep')) { try { fs.rmSync(S, { recursive: true, force: true }); } catch (e) { /* a file still held */ } }
  console.log(fails ? `install-test: ${fails} failed` : 'install-test: PASS');
  process.exit(fails ? 1 : 0);
});

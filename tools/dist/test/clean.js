// T-ZIP clean.js: machine-local check (not in run.sh) that the release zip works on a machine with no Node.
// Unzips ARSENAL-<ver>.zip into a new temp folder, removes node from PATH, runs every front-door `--help` from the exes.
// One line per check: "PASS|FAIL <what>". Exit 0 when all pass.
// usage: node tools/dist/test/clean.js --zip <ARSENAL-ver.zip> [--keep]
//        node tools/dist/test/clean.js --build <scratch dir>   (build the zip there first with zip.js, then check it)
// Author: Imperator_Aug (ARSENAL, ia-dbedaf7e)
const fs = require('fs'), path = require('path'), os = require('os'), zlib = require('zlib'), { spawnSync } = require('child_process'), Wt = require('../../lib/test/wait');
const a = process.argv.slice(2), arg = k => (a.indexOf(k) >= 0 ? a[a.indexOf(k) + 1] : null);
let zip = arg('--zip');
if (!zip && arg('--build')) {
  const out = path.resolve(arg('--build'));
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'zip.js'), '--out-dir', out, '--ver', 'clean'], { encoding: 'utf8' });
  if (r.status !== 0) { console.log('FAIL build zip rc ' + r.status + '\n' + r.stdout + r.stderr); process.exit(1); }
  zip = path.join(out, 'ARSENAL-clean.zip');
}
if (!zip || !fs.existsSync(zip)) { console.error('usage: node tools/dist/test/clean.js --zip <file.zip> | --build <scratch dir> [--keep]'); process.exit(2); }
// minimal zip reader (central directory, deflate or stored)
function unzip(file, dest) {
  const b = fs.readFileSync(file), e = b.lastIndexOf(Buffer.from([0x50, 0x4b, 5, 6])), n = b.readUInt16LE(e + 10);
  let p = b.readUInt32LE(e + 16); const names = [];
  for (let i = 0; i < n; i++) {
    const nl = b.readUInt16LE(p + 28), xl = b.readUInt16LE(p + 30), cl = b.readUInt16LE(p + 32), off = b.readUInt32LE(p + 42), m = b.readUInt16LE(p + 10), cs = b.readUInt32LE(p + 20);
    const name = b.slice(p + 46, p + 46 + nl).toString('utf8'), lo = off + 30 + b.readUInt16LE(off + 26) + b.readUInt16LE(off + 28);
    const raw = b.slice(lo, lo + cs), data = m === 8 ? zlib.inflateRawSync(raw) : raw, to = path.join(dest, name);
    if (!path.resolve(to).startsWith(path.resolve(dest) + path.sep)) throw new Error('zip path escapes: ' + name);
    fs.mkdirSync(path.dirname(to), { recursive: true }); fs.writeFileSync(to, data); names.push(name);
    p += 46 + nl + xl + cl;
  }
  return names;
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'arsenal-clean-'));
let fails = 0;
const say = (ok, m) => { if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + m); };
const names = unzip(zip, tmp), root = path.join(tmp, names[0].split('/')[0]);
say(names.length > 0, `unzipped ${names.length} entries`);
// PATH without node: only the Windows system folder (or /usr/bin,/bin), proven by `node` not resolving
const sysPath = process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32') : '/usr/bin:/bin';
const env = { ...process.env, PATH: sysPath, Path: sysPath, AS2_NO_STEAM: '1' };
const nodeProbe = spawnSync('node', ['-v'], { env, encoding: 'utf8' });
say(nodeProbe.error && nodeProbe.error.code === 'ENOENT', 'PATH has no node (node -v does not start)');
const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'arsenal-clean-cwd-'));
const FRONT = ['new', 'gen', 'check', 'fix', 'upgrade', 'install', 'uninstall', 'play', 'maps'];
const exeName = process.platform === 'win32' ? '.exe' : '';
// one exe since W6 U1 (no arguments = the window, never started here); the zip's second entry is ARSENAL-gui.cmd
say(!fs.existsSync(path.join(root, 'ARSENAL-gui' + exeName)) && fs.existsSync(path.join(root, 'ARSENAL-gui.cmd')) && fs.existsSync(path.join(root, 'Install-ARSENAL.cmd')), 'one exe: no ARSENAL-gui.exe; ARSENAL-gui.cmd and Install-ARSENAL.cmd are in the zip');
for (const ex of ['ARSENAL']) {
  const exe = path.join(root, ex + exeName);
  say(fs.existsSync(exe), `${ex}${exeName} is in the zip (${fs.existsSync(exe) ? (fs.statSync(exe).size / 1048576).toFixed(1) + ' MB' : 'missing'})`);
  if (!fs.existsSync(exe)) continue;
  const v = Wt.spawnSync(exe, ['--version'], { cwd, env, encoding: 'utf8' }, 'dist clean');
  say(v.status === 0, `${ex} --version rc ${v.status}: ${(v.stdout || v.stderr || '').split(/\r?\n/)[0].slice(0, 70)}`);
  if (ex === 'ARSENAL') {
    const h = Wt.spawnSync(exe, ['--help'], { cwd, env, encoding: 'utf8' }, 'dist clean');
    say(h.status === 0 && FRONT.every(f => new RegExp('^\\s*' + f + '\\b', 'm').test(h.stdout)), `${ex} --help rc ${h.status}, lists the ${FRONT.length} front-door commands`);
  }
  for (const f of FRONT) {
    const r = Wt.spawnSync(exe, [f, '--help'], { cwd, env, encoding: 'utf8' }, 'dist clean');
    const ok = r.status === 0 && new RegExp('^usage: (?:ARSENAL|as2) ' + f + '(\\s|$)', 'm').test(r.stdout || '');
    say(ok, `${ex} ${f} --help rc ${r.status}${ok ? '' : ' ' + ((r.stdout || '') + (r.stderr || '')).split(/\r?\n/)[0].slice(0, 90)}`);
  }
}
if (!a.includes('--keep')) { fs.rmSync(tmp, { recursive: true, force: true }); fs.rmSync(cwd, { recursive: true, force: true }); }
console.log(fails ? `clean: ${fails} FAIL` : 'clean: ALL PASS');
process.exit(fails ? 1 : 0);

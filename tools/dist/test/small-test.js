// zip.js --small: the small package (tools as plain files + launchers) and its release gate rule. Fixtures only, except block 4.
//   1 fixture build: launchers at the top level with the builder's bytes and the real pin, sh launchers 0755 in the central directory,
//     tools/ = sea.js manifestKeys (dropped tools out, module-only tools in, test/ out), the rest = the exe zip golden minus the exes; deterministic
//   2 gate: wrong launcher bytes, a launcher in the wrong place, extra scripts (.cmd, .sh, extension-less), a launcher in the exe zip,
//     a launcher text naming the user: all refused, no zip
//   3 pin: a base that is not https://nodejs.org/dist/.../ (or a bad sha / file name) stops the build (exit 2) on the command line;
//     the loopback base works only through test/smallbuild.js and then says TEST BUILD
//   4 real tree: the small zip's tools/ equals the manifest sea.js writes for the release exe (same RELEASE_DROP, MODULE_ONLY)
// usage: node tools/dist/test/small-test.js [--tools <dir>] [--keep]   (--tools: the tree for block 4, default the real tools/)
// Author: Imperator_Aug (ARSENAL, ia-241342fb)
const fs = require('fs'), path = require('path'), zlib = require('zlib'), crypto = require('crypto'), { spawnSync } = require('child_process');
const DIST = path.join(__dirname, '..'), ZIP = path.join(DIST, 'zip.js'), TOOLS = path.join(DIST, '..');
const Z = require(ZIP), L = require(path.join(DIST, 'launch.js')), SEA = require(path.join(DIST, 'sea.js'));
const W = path.join(__dirname, 'work-small');
const argv = process.argv.slice(2), opt = n => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL: ' + m); } };
fs.rmSync(W, { recursive: true, force: true });
const mk = (p, s) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); return p; };
const STAMP = '// Author: Imperator_Aug (as64 toolkit, ia-00000000)\n';
const PIN = path.join(DIST, 'launch', 'node-pin.json'), pin = L.readPin(PIN);
const P = 'ARSENAL-9.9.9/';
// fixture tools tree: a kept tool, a dropped tool (notes), a module-only tool (score), a dev tool needing the source (usage), test/ and cache/ (skipped)
function assets(name) {
  const d = path.join(W, name, 'assets');
  for (const [k, v] of Object.entries({ 'a/a.js': 'module.exports=1', 'score/score.js': 'x', 'usage/usage.js': 'x', 'soedit/soedit.js': 'x', 'notes/notes.js': 'dropped', 'a/test/t.js': 'test', 'a/cache/c.json': '{}', 'a/data.yaml': 'k: v' }))
    mk(path.join(d, k), (/\.js$/.test(k) ? STAMP : '') + v);
  mk(path.join(d, 'INDEX.md'), '# index\n'); mk(path.join(d, 'index', 'front.md'), '# front\n');
  return d;
}
function run(script, args, env = {}) {
  const r = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', env: { ...process.env, ZIP_EXTRA_ID: 'zzseedname', ...env } });
  return { rc: r.status, out: (r.stdout || '') + (r.stderr || '') };
}
const SIDE = ['--no-workshop_gui', '--no-gemindex', '--no-ww2sources', '--no-pdf', '--no-whole'];
const small = (name, extra = [], root) => { const out = path.join(W, name, 'out'); const r = run(ZIP, ['--small', '--ver', '9.9.9', '--assets-root', root || assets(name), '--out-dir', out, ...SIDE, ...extra]); return { ...r, zip: path.join(out, 'ARSENAL-9.9.9-small.zip') }; };
// central directory reader: name, made-by, external attributes, data
function readZip(f) {
  const b = fs.readFileSync(f), e = b.lastIndexOf(Buffer.from([0x50, 0x4b, 5, 6]));
  const n = b.readUInt16LE(e + 10); let p = b.readUInt32LE(e + 16); const out = [];
  for (let i = 0; i < n; i++) {
    const nl = b.readUInt16LE(p + 28), xl = b.readUInt16LE(p + 30), cl = b.readUInt16LE(p + 32), off = b.readUInt32LE(p + 42);
    const name = b.slice(p + 46, p + 46 + nl).toString('utf8'), cs = b.readUInt32LE(p + 20);
    const lo = off + 30 + b.readUInt16LE(off + 26) + b.readUInt16LE(off + 28), data = zlib.inflateRawSync(b.slice(lo, lo + cs));
    out.push({ name, madeBy: b.readUInt16LE(p + 4), ext: b.readUInt32LE(p + 38), crcOk: zlib.crc32(data) === b.readUInt32LE(p + 16), data });
    p += 46 + nl + xl + cl;
  }
  return out;
}
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const GOLD = fs.readFileSync(path.join(__dirname, 'zip-entries.gold.txt'), 'utf8').split(/\r?\n/).filter(l => l && !l.startsWith('# '));
// the exe zip's ARSENAL.exe and its ARSENAL-gui.cmd (= ARSENAL.exe gui) out, the four launchers in (ARSENAL-gui.cmd there is the node one);
// Install-ARSENAL.cmd is in both zips
const expectNonTools = [...new Set([...GOLD.filter(n => !/^ARSENAL-VER\/ARSENAL(\.exe|-gui\.cmd)$/.test(n)), ...L.NAMES.map(n => 'ARSENAL-VER/' + n)])].sort();

// 1 fixture build
{
  const root = assets('fx'), r = small('fx', [], root);
  ok(r.rc === 0, '1 small build rc ' + r.rc + '\n' + r.out);
  if (r.rc === 0) {
    const es = readZip(r.zip), names = es.map(e => e.name);
    ok(es.every(e => e.crcOk) && JSON.stringify(names) === JSON.stringify([...names].sort()), '1 crc and order');
    const keys = [...new Set(SEA.manifestKeys(root, Z.RELEASE_DROP.split(',')))];
    const tools = names.filter(n => n.startsWith(P + 'tools/')).map(n => n.slice((P + 'tools/').length));
    ok(JSON.stringify(tools) === JSON.stringify(keys), '1 tools/ = manifestKeys: ' + tools.join(' '));
    ok(tools.includes('score/score.js') && !tools.some(k => /^notes\/|\/test\/|\/cache\//.test(k)), '1 module-only kept, dropped/test/cache out: ' + tools.join(' '));
    const rest = names.filter(n => !n.startsWith(P + 'tools/')).map(n => n.replace(/^ARSENAL-9\.9\.9\//, 'ARSENAL-VER/')).sort();
    const add = rest.filter(n => !expectNonTools.includes(n)), gone = expectNonTools.filter(n => !rest.includes(n));
    ok(!add.length && !gone.length, '1 small zip = exe zip golden - exes + launchers. new: ' + add.join(' ') + ' | gone: ' + gone.join(' '));
    const want = L.render(pin, { arsenalVersion: SEA.buildVersion(), keys, moduleOnly: Z.MODULE_ONLY });
    { const e = es.find(x => x.name === P + L.INSTALLER); ok(e && e.data.equals(L.installer()) && e.madeBy === 20 && e.ext === 0, '1 Install-ARSENAL.cmd has the builder bytes, no unix mode'); }
    for (const n of L.NAMES) {
      const e = es.find(x => x.name === P + n);
      ok(e && e.data.equals(want[n]), '1 launcher bytes ' + n);
      const unix = !/\.cmd$/.test(n);
      ok(e && (unix ? (e.madeBy >> 8) === 3 && e.ext >>> 16 === 0o100755 : e.madeBy === 20 && e.ext === 0), `1 ${n} attributes madeBy ${e && e.madeBy.toString(16)} ext ${e && (e.ext >>> 16).toString(8)}`);
      const shas = (unix ? ['linux-x64', 'linux-arm64', 'darwin-x64', 'darwin-arm64'] : ['win-x64', 'win-arm64']).map(k => pin.files[k].sha256);
      ok(e && e.data.includes(pin.base) && shas.every(s => e.data.includes(s)) && !e.data.includes('TEST BUILD'), '1 ' + n + ' has the pin, no TEST BUILD');
      ok(e && (unix ? !e.data.includes('\r') : /\r\n/.test(e.data.toString()) && !/[^\r]\n/.test(e.data.toString())), '1 ' + n + (unix ? ' LF only' : ' CRLF'));
    }
    ok(es.filter(e => e.name.startsWith(P + 'tools/')).every(e => e.madeBy === 20 && e.ext === 0), '1 other entries keep DOS attributes');
    const h = sha(r.zip), r2 = small('fx', [], root);
    ok(r2.rc === 0 && sha(r2.zip) === h, '1 deterministic');
    ok(/wrote .*ARSENAL-9\.9\.9-small\.zip/.test(r.out) && /tools\/\s+\d+ files, \d+ B/.test(r.out), '1 summary\n' + r.out);
  }
}
// 2 gate
{
  const root = assets('g'), keys = [...new Set(SEA.manifestKeys(root, Z.RELEASE_DROP.split(',')))];
  const want = L.render(pin, { arsenalVersion: SEA.buildVersion(), keys, moduleOnly: Z.MODULE_ONLY });
  const g = (entries, launchers = want) => Z.gate(entries, [], root, ['zzseedname'], [], launchers).refused.join('\n');
  const good = mk(path.join(W, 'g', 'l', 'ARSENAL.cmd'), want['ARSENAL.cmd']);
  ok(g([{ name: P + 'ARSENAL.cmd', file: good }]) === '', '2 launcher with the builder bytes accepted');
  const bad = mk(path.join(W, 'g', 'bad', 'ARSENAL.cmd'), Buffer.concat([want['ARSENAL.cmd'], Buffer.from('rem extra\r\n')]));
  ok(/ARSENAL\.cmd: launcher bytes differ/.test(g([{ name: P + 'ARSENAL.cmd', file: bad }])), '2 wrong bytes refused');
  const shGood = mk(path.join(W, 'g', 'l', 'arsenal'), want['arsenal']);
  ok(/ARSENAL\.cmd: launcher bytes differ/.test(g([{ name: P + 'ARSENAL.cmd', file: shGood }])), '2 one launcher under another launcher name refused');
  ok(/tools\/ARSENAL\.cmd: launcher or script outside the launcher rule/.test(g([{ name: P + 'tools/ARSENAL.cmd', file: good }])), '2 launcher in a sub folder refused');
  ok(/ARSENAL-9\.9\.9\/sub\/arsenal: launcher or script outside/.test(g([{ name: P + 'sub/arsenal', file: shGood }])), '2 sh launcher in a sub folder refused');
  ok(/ARSENAL\.cmd: launcher or script outside/.test(g([{ name: 'ARSENAL.cmd', file: good }])), '2 launcher above the top folder refused');
  ok(/ARSENAL\.cmd: launcher or script outside/.test(g([{ name: P + 'ARSENAL.cmd', file: good }], null)), '2 no launcher rule without the builder bytes (exe zip)');
  // W6 U1: the installer and the exe zip's ARSENAL-gui.cmd pass only with the builder bytes, only at the top level
  const exeL = { 'ARSENAL-gui.cmd': L.exeGui(), 'Install-ARSENAL.cmd': L.installer() };
  const inst = mk(path.join(W, 'g', 'i', 'Install-ARSENAL.cmd'), exeL['Install-ARSENAL.cmd']), eg = mk(path.join(W, 'g', 'i', 'ARSENAL-gui.cmd'), exeL['ARSENAL-gui.cmd']);
  ok(g([{ name: P + 'Install-ARSENAL.cmd', file: inst }, { name: P + 'ARSENAL-gui.cmd', file: eg }], exeL) === '', '2 installer + exe ARSENAL-gui.cmd with the builder bytes accepted');
  const instBad = mk(path.join(W, 'g', 'ib', 'Install-ARSENAL.cmd'), Buffer.concat([exeL['Install-ARSENAL.cmd'], Buffer.from('del x\r\n')]));
  ok(/Install-ARSENAL\.cmd: launcher bytes differ/.test(g([{ name: P + 'Install-ARSENAL.cmd', file: instBad }], exeL)), '2 installer with other bytes refused');
  ok(/tools\/Install-ARSENAL\.cmd: launcher or script outside/.test(g([{ name: P + 'tools/Install-ARSENAL.cmd', file: inst }], exeL)), '2 installer in a sub folder refused');
  ok(/ARSENAL\.cmd: launcher or script outside/.test(g([{ name: P + 'ARSENAL.cmd', file: good }], exeL)), '2 the exe zip passes no ARSENAL.cmd');
  ok(/ARSENAL-gui\.cmd: launcher bytes differ/.test(g([{ name: P + 'ARSENAL-gui.cmd', file: eg }])), '2 the exe ARSENAL-gui.cmd is not the small one');
  const named = { 'ARSENAL.cmd': Buffer.from('@echo off\r\nrem by zzseedname\r\n') }, nf = mk(path.join(W, 'g', 'n', 'ARSENAL.cmd'), named['ARSENAL.cmd']);
  ok(/ARSENAL\.cmd: names the local\/git user/.test(g([{ name: P + 'ARSENAL.cmd', file: nf }], named)), '2 text scan runs on launchers');
  for (const [n, body] of [['extra.cmd', '@echo off\r\n'], ['run.sh', '#!/bin/sh\n'], ['arsenal-extra', '#!/bin/sh\n'], ['go.bat', '@echo off\r\n'], ['go.ps1', 'Write-Host x\n']]) {
    const r = small('g-' + n.replace(/\W/g, ''), ['--add', mk(path.join(W, 'seed', n), body)]);
    ok(r.rc === 1 && new RegExp(n.replace(/\./g, '\\.') + ': launcher or script outside the launcher rule').test(r.out) && !fs.existsSync(r.zip), `2 extra ${n} refused (rc ${r.rc})\n${r.out}`);
  }
  // the exe zip: a file named ARSENAL.cmd with the exact launcher bytes is still refused
  const ex = path.join(W, 'gexe'); mk(path.join(ex, 'exes', 'ARSENAL.exe'), 'MZ'); mk(path.join(ex, 'exes', 'manifest.json'), '["a/a.js"]'); mk(path.join(ex, 'assets', 'a', 'a.js'), STAMP + 'x');
  const re = run(ZIP, ['--exes', path.join(ex, 'exes'), '--assets-root', path.join(ex, 'assets'), '--out-dir', path.join(ex, 'out'), '--ver', '9.9.9', ...SIDE, '--add', good]);
  ok(re.rc === 1 && /ARSENAL\.cmd: launcher or script outside the launcher rule/.test(re.out), '2 launcher in the exe zip refused\n' + re.out);
}
// 3 pin
{
  const variant = (name, f) => { const p = JSON.parse(JSON.stringify(pin)); f(p); return mk(path.join(W, 'pins', name + '.json'), JSON.stringify(p)); };
  for (const [name, f, want] of [
    ['loopback', p => { p.base = 'http://127.0.0.1:8080/'; }, /download must come from https:\/\/nodejs\.org/],
    ['http', p => { p.base = 'http://nodejs.org/dist/v26.13.0/'; }, /download must come from/],
    ['otherhost', p => { p.base = 'https://nodejs.org.example.net/dist/v26.13.0/'; }, /download must come from/],
    ['port', p => { p.base = 'https://nodejs.org:8443/dist/v26.13.0/'; }, /download must come from/],
    ['badsha', p => { p.files['linux-x64'].sha256 = 'abc'; }, /linux-x64: sha256/],
    ['badfile', p => { p.files['win-x64'].file = 'node.zip'; }, /win-x64: file/],
    ['oldmajor', p => { p.version = '24.1.0'; for (const k of Object.keys(p.files)) p.files[k].file = p.files[k].file.replace('26.13.0', '24.1.0'); }, /below MIN_MAJOR 26/],
  ]) {
    const r = small('p-' + name, ['--pin', variant(name, f)]);
    ok(r.rc === 2 && want.test(r.out) && !fs.existsSync(r.zip), `3 pin ${name} refused (rc ${r.rc})\n${r.out}`);
  }
  const lb = variant('lb', p => { p.base = 'http://127.0.0.1:8080/'; });
  const out = path.join(W, 'p-test', 'out'), rt = run(path.join(__dirname, 'smallbuild.js'), ['Linux', 'x86_64', '--ver', '9.9.9', '--assets-root', assets('p-test'), '--out-dir', out, ...SIDE, '--pin', lb]);
  const zt = path.join(out, 'ARSENAL-9.9.9-small.zip');
  ok(rt.rc === 0 && fs.existsSync(zt) && readZip(zt).filter(e => L.NAMES.some(n => e.name === P + n)).every(e => e.data.includes('TEST BUILD') && e.data.includes('http://127.0.0.1:8080/')), '3 loopback pin through smallbuild.js = TEST BUILD\n' + rt.out);
  const rn = run(path.join(__dirname, 'smallbuild.js'), ['Linux', 'x86_64', '--ver', '9.9.9', '--assets-root', assets('p-test2'), '--out-dir', path.join(W, 'p-test2', 'out'), ...SIDE]);
  ok(rn.rc === 2 && /test pin base/.test(rn.out), '3 a test build takes only a loopback pin\n' + rn.out);
  ok(!/smallbuild|main\(argv, \{/.test(fs.readFileSync(ZIP, 'utf8').split('\n').filter(l => /require\.main === module/.test(l)).join('\n')) && /if \(require\.main === module\) main\(\);/.test(fs.readFileSync(ZIP, 'utf8')), '3 the command line calls main() without test settings');
}
// 4 real tree: tools/ of the small zip = manifest.json from sea.js with the release arguments
{
  const tools = path.resolve(opt('--tools') || TOOLS), w4 = path.join(W, 'real');
  const ms = spawnSync(process.execPath, [...Z.seaArgs(path.join(w4, 'sea'), 'ARSENAL'), '--manifest-only'], { encoding: 'utf8' });
  ok(ms.status === 0, '4 sea.js --manifest-only rc ' + ms.status + '\n' + ms.stdout + ms.stderr);
  const r = small('real', [], tools);
  ok(r.rc === 0, '4 real tree small build rc ' + r.rc + ' (a refusal here is the release gate on the real tools/)\n' + r.out.split('\n').filter(l => /REFUSED|error/.test(l)).slice(0, 12).join('\n'));
  if (ms.status === 0 && r.rc === 0) {
    const manifest = JSON.parse(fs.readFileSync(path.join(w4, 'sea', 'manifest.json'), 'utf8'));
    const names = readZip(r.zip).map(e => e.name), got = names.filter(n => n.startsWith(P + 'tools/')).map(n => n.slice((P + 'tools/').length));
    const add = got.filter(k => !manifest.includes(k)), gone = manifest.filter(k => !got.includes(k));
    ok(!add.length && !gone.length, `4 tools/ differs from the exe manifest. extra: ${add.slice(0, 10).join(' ')} | missing: ${gone.slice(0, 10).join(' ')}`);
    const rest = names.filter(n => !n.startsWith(P + 'tools/')).map(n => n.replace(/^ARSENAL-9\.9\.9\//, 'ARSENAL-VER/')).sort();
    ok(JSON.stringify(rest) === JSON.stringify(expectNonTools), '4 real small zip outside tools/ = golden - exes + launchers');
    console.log(`small-test: real tree ${got.length} tools files, small zip ${(fs.statSync(r.zip).size / 1048576).toFixed(1)} MB without sidecars and pdf`);
  }
}
if (!argv.includes('--keep')) fs.rmSync(W, { recursive: true, force: true });
console.log(fails ? `small-test: ${fails} failed` : 'small-test: PASS');
process.exit(fails ? 1 : 0);

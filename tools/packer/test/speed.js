// packer speed layout (the default; --speed still accepted): text + map .net/.grs deflated (method 8), the rest stored (0), text entries first in each pak, every entry
// unpacks to its input bytes; with --no-speed methods and order are as before (text only deflated, path order). --package too.
// Author: Imperator_Aug (ARSENAL, ia-dadb0a3e)
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const pak = require('../../lib/pak');
const P = path.join(__dirname, '..', 'packer.js');
const base = process.env.ARSENAL_TMP || os.tmpdir();
fs.mkdirSync(base, { recursive: true });
const tmp = fs.mkdtempSync(path.join(base, 'packspeed-'));
let bad = 0;
const fail = m => { console.log('FAIL ' + m); bad++; };
const put = (rel, s) => { const f = path.join(mod, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
const mod = path.join(tmp, 'smod');
try {
  const big = n => Buffer.from(Array.from({ length: n }, (_, i) => 'row ' + (i % 50) + '\r\n').join(''));
  put('mod.info', '{mod\r\n\t{name "s"}\r\n}\r\n');
  put('resource/map/m1/a.net', big(400));
  put('resource/map/m1/b.GRS', big(300));
  put('resource/map/m1/map.set', '{x 1}\r\n');            // text after the binaries in path order
  put('resource/map/m1/z.dds', Buffer.from([0, 1, 2, 3, 0, 1, 2, 3]));
  put('resource/entity/tank/t.dds', Buffer.from([9, 8, 7, 6]));
  put('resource/entity/tank/t.def', '{y 2}\r\n');
  const files = {};
  (function walk(d) { for (const n of fs.readdirSync(d)) { const p = path.join(d, n); if (fs.statSync(p).isDirectory()) walk(p); else files[path.relative(path.join(mod, 'resource'), p).split(path.sep).join('/')] = fs.readFileSync(p); } })(path.join(mod, 'resource'));
  const run = (out, extra) => cp.spawnSync('node', [P, mod, '--out', out, '-q', ...extra], { encoding: 'utf8' });
  const check = (dir, speed, label) => {
    for (const role of ['map', 'entity']) {
      const all = pak.list(path.join(dir, role + '.pak')), ents = all.filter(e => !e.name.endsWith('/'));
      const isText = n => /\.(set|def)$/i.test(n), isZ = n => isText(n) || (speed && /\.(net|grs)$/i.test(n));
      for (const e of ents) {
        if (e.method !== (isZ(e.name) ? 8 : 0)) fail(`${label} ${role}.pak ${e.name} method ${e.method}`);
        if (!files[e.name] || Buffer.compare(pak.read(all, e), files[e.name]) !== 0) fail(`${label} ${e.name} bytes differ`);
      }
      const names = ents.map(e => e.name);
      const want = speed ? names.filter(isText).sort().concat(names.filter(n => !isText(n)).sort()) : names.slice().sort();
      if (names.join() !== want.join()) fail(`${label} ${role}.pak order ${names}`);
      if (Object.keys(files).filter(f => f.startsWith(role + '/')).length !== names.length) fail(`${label} ${role}.pak count`);
    }
  };
  const r0 = run(path.join(tmp, 'plain'), ['--no-speed']);
  if (r0.status !== 0) fail('plain exit ' + r0.status + r0.stderr);
  check(path.join(tmp, 'plain'), false, 'plain');
  if (/PACK_SPEED_LAYOUT/.test(cp.spawnSync('node', [P, mod, '--no-speed'], { encoding: 'utf8' }).stdout)) fail('PACK_SPEED_LAYOUT with --no-speed');
  // the default is the speed layout, same as --speed
  const rd = run(path.join(tmp, 'deflt'), []);
  if (rd.status !== 0) fail('default exit ' + rd.status + rd.stderr);
  check(path.join(tmp, 'deflt'), true, 'default');
  if (!/PACK_SPEED_LAYOUT/.test(cp.spawnSync('node', [P, mod], { encoding: 'utf8' }).stdout)) fail('default: no PACK_SPEED_LAYOUT info row');
  const r1 = run(path.join(tmp, 'fast'), ['--speed']);
  if (r1.status !== 0) fail('speed exit ' + r1.status + r1.stderr);
  check(path.join(tmp, 'fast'), true, 'speed');
  if (!/PACK_SPEED_LAYOUT/.test(cp.spawnSync('node', [P, mod, '--speed'], { encoding: 'utf8' }).stdout)) fail('no PACK_SPEED_LAYOUT info row');
  // map .net / .grs really shrink; .dds stays stored
  const me = pak.list(path.join(tmp, 'fast', 'map.pak')).find(e => e.name === 'map/m1/a.net');
  if (!me || me.csize >= me.size) fail('a.net not smaller deflated');
  // --package and --goh carry it too
  const r2 = run(path.join(tmp, 'pkg'), ['--speed', '--package']);
  if (r2.status !== 0) fail('package exit ' + r2.status + r2.stderr);
  check(path.join(tmp, 'pkg', 'smod', 'resource'), true, 'package');
  const r3 = run(path.join(tmp, 'goh'), ['--speed', '--package', '--goh']);
  if (r3.status !== 0) fail('goh exit ' + r3.status + r3.stderr);
  check(path.join(tmp, 'goh', 'smod', 'resource'), true, 'goh');
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
if (!bad) console.log('speed ok');
process.exit(bad ? 1 : 0);

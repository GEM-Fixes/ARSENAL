// Author: Imperator_Aug (ARSENAL, ia-030a951d)
const fs = require('fs'), path = require('path'), zlib = require('zlib'), cp = require('child_process');
const { snap, diff } = require('../snap'), w = process.argv[2];
let bad = 0; const ok = (c, m) => { if (!c) { console.log('FAIL: ' + m); bad++; } };
// stored zip with one entry
function zip(name, data) {
  const crc = zlib.crc32 ? zlib.crc32(data) : 0x12345678, n = Buffer.from(name);
  const lf = Buffer.alloc(30); lf.writeUInt32LE(0x04034b50, 0); lf.writeUInt16LE(20, 4); lf.writeUInt32LE(crc, 14); lf.writeUInt32LE(data.length, 18); lf.writeUInt32LE(data.length, 22); lf.writeUInt16LE(n.length, 26);
  const cd = Buffer.alloc(46); cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt32LE(crc, 16); cd.writeUInt32LE(data.length, 20); cd.writeUInt32LE(data.length, 24); cd.writeUInt16LE(n.length, 28);
  const cdOff = 30 + n.length + data.length, cdLen = 46 + n.length;
  const e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(1, 8); e.writeUInt16LE(1, 10); e.writeUInt32LE(cdLen, 12); e.writeUInt32LE(cdOff, 16);
  return Buffer.concat([lf, n, data, cd, n, e]);
}
const put = (r, f, s) => { fs.mkdirSync(path.dirname(path.join(w, r, f)), { recursive: true }); fs.writeFileSync(path.join(w, r, f), s); };
put('a', 'same.set', 'x'); put('a', 'chg.set', 'one'); put('a', 'gone.set', 'y'); put('a', 'mods/x/skip.set', 'z');
put('b', 'same.set', 'x'); put('b', 'chg.set', 'two'); put('b', 'new.set', 'w');
put('a', 'resource/r.pak', zip('entity/Tank.def', Buffer.from('aa'))); put('b', 'resource/r.pak', zip('entity/Tank.def', Buffer.from('bbb')));
const before = fs.readdirSync(path.join(w, 'a')).join();
const A = snap(path.join(w, 'a')), B = snap(path.join(w, 'b')), d = diff(A, B);
ok(!A.loose['mods/x/skip.set'], 'mods skipped');
ok(A.entries['entity/tank.def'] && A.entries['entity/tank.def'][1] === 2, 'pak entry read');
ok(d.looseChanged.join() === 'chg.set', 'changed ' + d.looseChanged);
ok(d.looseAdded.join() === 'new.set', 'added ' + d.looseAdded);
ok(d.looseRemoved.join() === 'gone.set', 'removed ' + d.looseRemoved);
ok(!zlib.crc32 || d.changed.join() === 'entity/tank.def', 'pak changed ' + d.changed);
ok(fs.readdirSync(path.join(w, 'a')).join() === before, 'game dir untouched');
// CLI writes outside the game, diff reads it back
const js = path.join(__dirname, '../snap.js'), run = (...a) => cp.spawnSync(process.execPath, [js, ...a], { encoding: 'utf8' });
run('--game', path.join(w, 'a'), '--label', 'a', '--out', path.join(w, 'out')); run('--game', path.join(w, 'b'), '--label', 'b', '--out', path.join(w, 'out'));
const o = run('--diff', path.join(w, 'out/a-noexe.json.gz'), path.join(w, 'out/b-noexe.json.gz'));
ok(/looseChanged: 1/.test(o.stdout), 'cli diff ' + o.stdout + o.stderr);
ok(run('--bogus').status === 2, 'bad arg');
process.exit(bad ? 1 : 0);

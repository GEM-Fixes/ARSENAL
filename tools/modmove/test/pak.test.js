// a finding inside a pak must reach the report, a model named only by a pak must not read as missing, and the range check follows the engine
// Author: Imperator_Aug (ARSENAL, ia-16c36808)
const fs = require('fs'), path = require('path'), os = require('os');
const S = require('../lib/static'), C = require('../lib/common');
let bad = 0; const ok = (c, m) => { if (!c) { console.log('FAIL: ' + m); bad++; } };
function zip(files) {
  const lfs = [], cds = []; let off = 0;
  for (const [name, text] of Object.entries(files)) {
    const n = Buffer.from(name), d = Buffer.from(text);
    const lf = Buffer.alloc(30); lf.writeUInt32LE(0x04034b50, 0); lf.writeUInt16LE(20, 4); lf.writeUInt32LE(d.length, 18); lf.writeUInt32LE(d.length, 22); lf.writeUInt16LE(n.length, 26);
    const cd = Buffer.alloc(46); cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt32LE(d.length, 20); cd.writeUInt32LE(d.length, 24); cd.writeUInt16LE(n.length, 28); cd.writeUInt32LE(off, 42);
    lfs.push(lf, n, d); cds.push(cd, n); off += 30 + n.length + d.length;
  }
  const cd = Buffer.concat(cds), e = Buffer.alloc(22), cnt = Object.keys(files).length;
  e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(cnt, 8); e.writeUInt16LE(cnt, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat([...lfs, cd, e]);
}
const w = fs.mkdtempSync(path.join(os.tmpdir(), 'modmove-paktest-'));
try {
  fs.mkdirSync(path.join(w, 'resource'), { recursive: true });
  fs.writeFileSync(path.join(w, 'mod.info'), '{mod "t"}\r\n{name "t"}\r\n{MinGameVersion "3.262.1"}\r\n{MaxGameVersion "3.262.1"}\r\n');
  fs.writeFileSync(path.join(w, 'resource/t.pak'), zip({
    'set/stuff/a.def': '{include "/properties/resupply_generic.inc"}\r\n',
    'entity/x/skin.dds': 'not text',
  }));
  // seeded: an extension-less entry and a folder of the same name (real mod: entity/.../fieldcap2_rus). must not unread the other paks
  fs.writeFileSync(path.join(w, 'resource/clash.pak'), zip({
    'entity/head/cap': 'x',
    'entity/head/cap/cap.def': '{include "/properties/resupply_generic.inc"}\r\n',
  }));
  const r = S.check(w, 'mowas2', 'goh', { as2: path.join(w, 'none'), goh: path.join(w, 'none') });
  const codes = r.findings.map(f => f.code);
  ok(codes.includes('MOVE_INCLUDE_RENAME'), 'include inside pak not found: ' + codes);
  ok(!codes.includes('WARN_MOVE_PAKS_UNREAD'), 'pak reported unread');
  ok(r.notes.some(n => /2 pak\(s\) read/.test(n)), 'no pak note: ' + r.notes);
  ok(r.notes.some(n => /file\/folder clash/.test(n)), 'clash not noted: ' + r.notes);
  // engine: only components both versions have count
  const v = C.verParse, cmp = (a, b) => C.verCmp(v(a), v(b));
  ok(cmp('3.262.1', '3.262') === 0, '3.262.1 == 3.262');
  ok(cmp('3.262', '3.262.9') === 0, '3.262 == 3.262.9');
  ok(cmp('3.261.9', '3.262') < 0, '3.261.9 < 3.262');
  ok(cmp('1.067', '1.500') < 0, '1.067 < 1.500');
} finally { fs.rmSync(w, { recursive: true, force: true }); }
if (!bad) console.log('pak ok');
process.exit(bad ? 1 : 0);

// pak entries: the engine CRC Crc32(stream, size) comes from the central-directory crc32 (crcShift), no read (speed fix for big
// GoH exports). Checks: crcShift against zlib.crc32 with a start value over many sizes; a made-up game P with the files in
// resource.pak (stored and deflated) and a game Q with the same files loose give the same fingerprint (sizes, crc32, engine CRC, trees).
// Author: Imperator_Aug (ARSENAL, ia-cbc3720c)
const fs = require('fs'), path = require('path'), os = require('os'), zlib = require('zlib'), assert = require('assert');
const { crcShift, engineFromPlain, fingerprint } = require('../mpsync.js');
const vfs = require('../../lib/vfs'), { zip } = require('../../lib/zipwrite');

// affine rule: crc32(buf, s) = crc32(buf, 0) ^ crcShift(s, len)
for (const n of [0, 1, 2, 3, 7, 8, 31, 255, 256, 511, 4096, 65537, 100003]) {
  const buf = Buffer.alloc(n); for (let i = 0; i < n; i++) buf[i] = (i * 131 + 7) & 0xff;
  assert.strictEqual(engineFromPlain(zlib.crc32(buf, 0) >>> 0, n), zlib.crc32(buf, n) >>> 0, 'engine crc from plain, n=' + n);
  assert.strictEqual(((zlib.crc32(buf, 0) ^ crcShift(0xdeadbeef, n)) >>> 0), zlib.crc32(buf, 0xdeadbeef) >>> 0, 'shift of any start, n=' + n);
}
assert.strictEqual(crcShift(123, 0), 123);

const W = fs.mkdtempSync(path.join(os.tmpdir(), 'mpsync-pak-'));
try {
  const files = [['set/a.set', '{a 1}\r\n'], ['entity/x.def', '{x\r\n {y 2}\r\n}\r\n'.repeat(50)], ['entity/m.ply', 'PLY0'], ['map/multi/m1/map', 'onetwo']];
  fs.mkdirSync(path.join(W, 'P'), { recursive: true });
  fs.writeFileSync(path.join(W, 'P', 'resource.pak'), zip(files.map(([n, s], i) => [n, Buffer.from(s, 'latin1'), i % 2 === 1])));
  for (const [n, s] of files) { const f = path.join(W, 'Q', 'resource', n); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s, 'latin1'); }
  const vp = vfs.build({ gameDir: path.join(W, 'P'), mods: [] }), vq = vfs.build({ gameDir: path.join(W, 'Q'), mods: [] });
  assert.ok([...vp.files.values()].some(r => r.source === 'pak'), 'P is read from its pak');
  const fp = fingerprint(vp), fq = fingerprint(vq);
  vfs.closeRecs();
  assert.strictEqual(fp.files['/set/a.set'][0], 'S', 'a.set is a content-CRC file');
  assert.strictEqual(fp.files['/entity/x.def'][0], 'S', 'x.def is a content-CRC file (deflated entry)');
  assert.deepStrictEqual(fp.files, fq.files, 'pak and loose copies give the same file rows');
  assert.deepStrictEqual(fp.trees, fq.trees, 'pak and loose copies give the same tree CRCs');
  console.log('OK pakcrc: engine CRC of pak entries from the central directory equals the read CRC');
} finally { fs.rmSync(W, { recursive: true, force: true }); }

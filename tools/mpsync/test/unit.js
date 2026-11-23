// unit checks for the CRC emulation primitives: NET-17 (size start value), NET-18 (word-loop re-read only if unaligned: not modelled),
// NET-19 (MatchWildcard case-sensitive, '*/map' = ends '/map')
// Author: Imperator_Aug (ARSENAL, ia-44b9baf5)
const assert = require('assert'), zlib = require('zlib');
const { matchWildcard, sizeCrc, classify } = require('../mpsync.js');

// independent bitwise CRC-32 with caller start value (zlib semantics: start is the previous crc, xored internally)
function crcRaw(buf, start) {
  let c = (start ^ 0xffffffff) >>> 0;
  for (const b of buf) { c ^= b; for (let i = 0; i < 8; i++) c = (c & 1) ? (c >>> 1) ^ 0xedb88320 : c >>> 1; }
  return (c ^ 0xffffffff) >>> 0;
}
assert.strictEqual(crcRaw(Buffer.from('123456789'), 0), 0xcbf43926);                 // standard check value
for (const n of [0, 1, 511, 512, 100000]) {
  const buf = Buffer.alloc(n, 7);
  assert.strictEqual(zlib.crc32(buf, n) >>> 0, crcRaw(buf, n), 'start value = size, n=' + n);   // NET-17: engine Crc32(stream, size)
  assert.notStrictEqual(crcRaw(buf, n), crcRaw(buf, 0xffffffff) , 'size start differs from 0xffffffff start (n>0 or n=0 alike)');
}
const le = Buffer.alloc(4); le.writeUInt32LE(1234);
assert.strictEqual(sizeCrc(1234), crcRaw(le, 0xffffffff));                           // size-only files: LE size fed from 0xffffffff

// NET-19
assert.ok(matchWildcard('/entity/x/map', '*/map'));
assert.ok(!matchWildcard('/entity/x/map.bak', '*/map'));
assert.ok(!matchWildcard('/entity/x/MAP', '*/map'), 'case-sensitive');
assert.ok(!matchWildcard('/Set/a.set', '/set/*'), 'case-sensitive prefix');
assert.ok(matchWildcard('/set/a/b.set', '/set/*'));
assert.ok(matchWildcard('/a/b/c.mi', '*.mi'));
assert.ok(matchWildcard('/a/b/c.mi', '*/b/*.mi'));
assert.ok(!matchWildcard('a/b.mi', '/a/*'), 'leading slash required');
const M = { exclude: [], crc: ['*/map', '*.mi'] };
assert.strictEqual(classify('/map/multi/x/map', M).cls, 'S');
console.log('unit ok');

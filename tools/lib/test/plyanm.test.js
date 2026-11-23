// lib/ply.js + lib/anm.js unit tests
// Author: Imperator_Aug (ARSENAL, ia-96dda12b)
module.exports = (t, assert) => {
  const ply = require('../ply'), anm = require('../anm');
  const i32 = n => { const b = Buffer.alloc(4); b.writeInt32LE(n); return b; };
  const T = s => Buffer.from(s, 'latin1');
  t('ply: SKIN names + bad magic', () => {
    const b = Buffer.concat([T('EPLY'), T('SKIN'), i32(2), Buffer.from([1, 97, 1, 98])]);
    assert.deepEqual(ply.parse(b).skin, ['a', 'b']);
    assert.equal(ply.parse(T('XXXX')).error, 'bad magic');
    assert.match(ply.parse(Buffer.concat([T('EPLY'), T('SKIN'), i32(3), Buffer.from([1, 97])])).error, /truncated/);
  });
  t('anm: header', () => {
    const b = Buffer.concat([T('EANM'), i32(0x60000), T('FRMS'), i32(3), T('BMAP'), i32(1), i32(2), T('ab')]);
    const h = anm.parseHeader(b);
    assert.deepEqual([h.version, h.frames, h.boneCount, h.bones.join()], [0x60000, 3, 1, 'ab']);
    assert.equal(anm.parseHeader(T('EANM')).error.startsWith('truncated'), true);
  });
};

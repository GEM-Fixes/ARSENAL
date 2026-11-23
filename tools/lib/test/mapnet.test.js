// mapnet unit tests
// Author: Imperator_Aug (ARSENAL, ia-3a0b1e25)
const mapnet = require('../mapnet');
const cstr = s => Buffer.concat([Buffer.from([s.length]), Buffer.from(s)]);
const tab = (tag, l) => Buffer.concat([Buffer.from(tag), Buffer.from([l.length]), ...l.flatMap(([i, n]) => [Buffer.from([i]), cstr(n)])]);
function mk(ver, w, h, cells, types = [[1, 'ground']], mats = [[1, 'ground'], [4, 'water']]) {
  const hd = Buffer.alloc(14); hd[0] = 10; hd[1] = ver; hd.writeInt16LE(w, 2); hd.writeInt16LE(h, 4); hd.writeFloatLE(-2.5, 6);
  const cs = cells.map(([hh, t, m]) => { const b = Buffer.alloc(ver ? 4 : 3); if (ver) b.writeInt16LE(hh, 0); else b.writeUInt16LE(hh, 0); b[2] = t; if (ver) b[3] = m; return b; });
  return Buffer.concat([hd, ...(ver >= 2 ? [tab('MAP0', types), tab('MAP1', mats), Buffer.from('GRID')] : []), ...cs]);
}
module.exports = (t, assert) => {
  t('mapnet v2 parse', () => {
    const m = mapnet.parse(mk(2, 2, 1, [[7, 1, 1], [-1200, 1, 4]]));
    assert.deepEqual(m.problems, []); assert.equal(m.width, 2); assert.equal(m.offX, -2.5);
    assert.equal(mapnet.typeName(m, 1), 'ground'); assert.equal(mapnet.materialName(m, 4), 'water'); assert.equal(mapnet.materialName(m, 9), null);
    assert.deepEqual(mapnet.cellAt(m, 1, 0), { height: -1200, type: 1, material: 4 }); assert.equal(mapnet.cellAt(m, 2, 0), null);
    const s = mapnet.stats(m); assert.equal(s.noGround, 1); assert.equal(s.minH, -1200); assert.equal(s.combo.get('1,4'), 1);
  });
  t('mapnet v0 3-byte cells', () => {
    const m = mapnet.parse(mk(0, 2, 1, [[5, 1], [6, 2]]));
    assert.deepEqual(m.problems, []); assert.deepEqual(mapnet.cellAt(m, 1, 0), { height: 6, type: 2, material: 0 });
  });
  t('mapnet problems', () => {
    assert.equal(mapnet.parse(mk(1, 2, 2, [[1, 1, 1]])).problems[0].code, 'NET_SIZE');
    assert.equal(mapnet.parse(Buffer.from([10, 2, 1])).problems[0].code, 'NET_TRUNCATED');
    assert.equal(mapnet.parse(mk(3, 1, 1, [[0, 0, 0]])).problems[0].code, 'NET_VERSION');
    const b = mk(2, 1, 1, [[0, 0, 0]]); b.write('XXXX', 14);
    assert.equal(mapnet.parse(b).problems[0].code, 'NET_BAD_MARKER');
  });
};

// lib/model/obj.js unit tests: OBJ and OBJ .mtl text made up here. Run inside tools/lib/test/test.js or alone:
// node tools/lib/test/model-obj.test.js (last line PASS)
// Author: Imperator_Aug (ARSENAL, ia-0ee50fd7)
'use strict';
module.exports = (t, assert) => {
  const OBJ = require('../model/obj');
  const quad = ['# a comment', 'mtllib a.mtl b.mtl', 'o Plate', 'v 0 0 0', 'v 1 0 0', 'v 1 1 0', 'v 0 1 0 1.0', 'vt 0 0', 'vt 1 0', 'vt 1 1', 'vt 0 1',
    'vn 0 0 1', 'usemtl red', 'f 1/1/1 2/2/1 3/3/1 4/4/1', 'usemtl blue', 'f -4/-4/-1 -2/-2/-1 \\', '  -1/-1/-1', 'usemtl red', 'f 1//1 3//1 4//1', ''].join('\r\n');

  t('model/obj parse: counts, groups, negative indexes, line joins, mtllib', () => {
    const o = OBJ.parse(quad);
    assert.equal(o.error, null);
    assert.deepEqual([o.v.length / 3, o.vt.length / 2, o.vn.length / 3], [4, 4, 1]);
    assert.deepEqual(o.mtllib, ['a.mtl', 'b.mtl']);
    assert.deepEqual(o.groups.map(g => [g.material, g.object, g.faces.length]), [['red', 'Plate', 1], ['blue', 'Plate', 1], ['red', 'Plate', 1]]);
    assert.deepEqual(o.groups[1].faces[0], [[0, 0, 0], [2, 2, 0], [3, 3, 0]]);
    assert.deepEqual(o.groups[2].faces[0][0], [0, -1, 0], 'v//vn: no texture index');
  });

  t('model/obj toMesh: fan triangles, materials kept together, corners shared by v/vt/vn', () => {
    const m = OBJ.toMesh(OBJ.parse(quad));
    assert.deepEqual(m.groups, [{ material: 'red', firstFace: 0, faceCount: 3 }, { material: 'blue', firstFace: 3, faceCount: 1 }]);
    assert.deepEqual(Array.from(m.indices.subarray(0, 6)), [0, 1, 2, 0, 2, 3]);
    assert.equal(m.positions.length / 3, 7, '4 full corners + 3 without uv');
    assert.ok(m.normals && m.uvs);
    const n = OBJ.toMesh(OBJ.parse('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n'));
    assert.ok(n.normals === null && n.uvs === null && n.groups[0].material === null);
  });

  t('model/obj write then parse gives the same mesh within rounding', () => {
    const m = OBJ.toMesh(OBJ.parse(quad));
    const txt = OBJ.write(m, { name: 'Plate', mtllib: 'p.mtl' });
    assert.ok(/^mtllib p\.mtl$/m.test(txt) && /^o Plate$/m.test(txt) && /^usemtl blue$/m.test(txt));
    const m2 = OBJ.toMesh(OBJ.parse(txt));
    assert.deepEqual(Array.from(m2.indices), Array.from(m.indices));
    assert.deepEqual(Array.from(m2.positions), Array.from(m.positions));
    assert.deepEqual(m2.groups, m.groups);
    const odd = OBJ.write({ positions: [1 / 3, -0.0000001, 2], indices: [0, 0, 0] });
    assert.ok(/^v 0\.333333 0 2$/m.test(odd) && /^f 1 1 1$/m.test(odd), odd);
  });

  t('model/obj mtl read and write', () => {
    const l = OBJ.parseMtl('newmtl red\nKd 1 0 0\nmap_Kd -bm 1 tex\\red.png\nmap_Bump red_n.png\nnewmtl blue\nd 0.5\n');
    assert.deepEqual(l.map(x => [x.name, x.map_Kd, x.map_Bump, x.d]), [['red', 'tex\\red.png', 'red_n.png', null], ['blue', null, null, 0.5]]);
    assert.deepEqual(l[0].Kd, [1, 0, 0]);
    const w = OBJ.writeMtl([{ name: 'red', map_Kd: 'red.dds' }]);
    assert.deepEqual(OBJ.parseMtl(w).map(x => [x.name, x.map_Kd, x.Kd.join()]), [['red', 'red.dds', '1,1,1']]);
  });

  t('model/obj refusals: no faces, indexes outside the lists, short faces', () => {
    assert.match(OBJ.parse('v 0 0 0\n').error, /no faces/);
    const o = OBJ.parse('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 9\nf 1 2\nf 1 2 3\n');
    assert.equal(o.error, null);
    assert.equal(o.warnings.length, 2);
    assert.equal(o.groups[0].faces.length, 1);
    assert.equal(OBJ.parse(null).error, 'not text');
  });
};

if (require.main === module) {
  const assert = require('assert');
  let n = 0, bad = 0;
  const t = (name, fn) => { try { fn(); n++; } catch (e) { bad++; console.log('FAIL ' + name + ': ' + e.message); } };
  module.exports(t, assert);
  console.log(`${n} passed, ${bad} failed`);
  console.log(bad ? 'FAIL' : 'PASS');
  if (bad) process.exitCode = 1;
}

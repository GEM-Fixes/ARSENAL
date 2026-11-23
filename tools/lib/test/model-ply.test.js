// lib/model/ply.js unit tests: synthetic EPLY/BPLY built byte by byte. Run inside tools/lib/test/test.js or alone:
// node tools/lib/test/model-ply.test.js (last line PASS)
// Author: Imperator_Aug (ARSENAL, ia-bd719425)
'use strict';
module.exports = (t, assert) => {
  const ply = require('../model/ply');
  const T = s => Buffer.from(s, 'latin1');
  const i32 = (...a) => Buffer.concat(a.map(n => { const b = Buffer.alloc(4); b.writeInt32LE(n); return b; }));
  const u32 = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; };
  const u16 = (...a) => Buffer.concat(a.map(n => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; }));
  const f32 = (...a) => Buffer.concat(a.map(n => { const b = Buffer.alloc(4); b.writeFloatLE(n); return b; }));
  const s = x => { const b = T(x); return Buffer.concat([b.length < 255 ? Buffer.from([b.length]) : Buffer.from([255, b.length & 255, b.length >> 8, 0]), b]); };
  const B = (...a) => Buffer.concat(a.map(x => (Buffer.isBuffer(x) ? x : Buffer.from(x))));
  const same = (a, b, m) => assert.ok(Buffer.compare(a, b) === 0, m || 'bytes differ');

  // 1. static EPLY: 2 MESH parts (named mtl / one texture name), fvf 0x112 stride 32, MROR
  const vert112 = (x, y, z, u, v) => f32(x, y, z, 0, 0, 1, u, v);
  const quad = B(vert112(0, 0, 0, 0, 0), vert112(20, 0, 0, 1, 0), vert112(20, 40, 0, 1, 1), vert112(0, 40, 10, 0, 1));
  const eply = B(T('EPLY'), T('BNDS'), f32(0, 0, 0, 20, 40, 10),
    T('MESH'), u32(0x112), i32(0, 1), u32(0x404), s('body.mtl'),
    T('MESH'), u32(0x112), i32(1, 1), u32(0x004), s('tex/a.dds'),
    T('VERT'), i32(4), u16(32, 7), quad, T('INDX'), i32(6), u16(0, 1, 2, 0, 2, 3), T('MROR'));
  t('model/ply EPLY MESH parts', () => {
    const o = ply.parse(eply);
    assert.equal(o.error, null);
    assert.equal(o.magic, 'EPLY');
    assert.deepEqual(Array.from(o.bounds), [0, 0, 0, 20, 40, 10]);
    assert.deepEqual(o.parts.map(p => [p.tag, p.fvf, p.firstFace, p.faceCount, p.flags, p.material, p.textures && p.textures.join()]),
      [['MESH', 0x112, 0, 1, 0x404, 'body.mtl', null], ['MESH', 0x112, 1, 1, 4, null, 'tex/a.dds']]);
    const v = o.vertices;
    assert.deepEqual([v.count, v.stride, v.flags, v.layout.map(e => `${e.key}@${e.offset}`).join()], [4, 32, 7, 'position@0,normal@12,uv0@24']);
    assert.ok(v.position instanceof Float32Array && v.uv0 instanceof Float32Array);
    assert.deepEqual(Array.from(v.position.subarray(6, 9)), [20, 40, 0]);
    assert.deepEqual(Array.from(v.uv0.subarray(2, 4)), [1, 0]);
    assert.ok(o.indices instanceof Uint16Array && o.indices.length === 6);
    assert.equal(o.mirrored, true);
    assert.deepEqual(o.chunks.map(c => c.tag).join(), 'BNDS,MESH,MESH,VERT,INDX,MROR');
    same(ply.write(o), eply);
  });

  // 2. BPLY: SUBM with a declaration + non-empty stream list, BAS2, IND4, InfG
  const decl = Buffer.from([0x02, 0, 0, 0x12, 0, 0, 0x26, 0, 0, 0x31, 0, 0, 0x81, 7, 0, 0xff, 0x01, 0x02, 0xff]);
  const bv = (x, y, z) => B(f32(x, y, z, 0, 0, 1), Buffer.from([10, 20, 30, 255]), f32(x / 20, y / 20, 0.5, 0.25), f32(9));
  const bply = B(T('BPLY'), T('BNDS'), f32(0, 0, 0, 20, 20, 0),
    T('SUBM'), decl, i32(0, 1, 0, 3), u32(0x1404), s('$/ground.mtl'),
    T('SUBM'), decl, i32(1, 1, 1, 3), u32(0x1404), s('$/grass.mtl'),
    T('BAS2'), f32(0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1),
    T('VERT'), i32(4, 48), bv(0, 0, 0), bv(20, 0, 0), bv(20, 20, 0), bv(0, 20, 0),
    T('IND4'), i32(6), u32(0), u32(1), u32(2), u32(1), u32(2), u32(3),
    T('InfG'), i32(0, 0, 4, 4), f32(-1, 5), i32(2), u16(0, 0x8001));
  t('model/ply BPLY SUBM declaration', () => {
    const o = ply.parse(bply);
    assert.equal(o.error, null);
    const p = o.parts[0];
    assert.deepEqual([p.tag, p.firstVertex, p.vertexCount, p.flags, p.material], ['SUBM', 0, 3, 0x1404, '$/ground.mtl']);
    assert.deepEqual(p.declaration.map(e => [e.usage, e.type, e.index]), [[0, 2, 0], [1, 2, 0], [2, 6, 0], [3, 1, 0], [8, 1, 7]]);
    assert.deepEqual(Array.from(p.streams), [1, 2]);
    const v = o.vertices;
    assert.deepEqual(v.layout.map(e => `${e.key}@${e.offset}`).join(), 'position@0,normal@12,color@24,uv0@28,extra7@36');
    assert.deepEqual([v.stride, v.count], [48, 4]);
    assert.deepEqual(Array.from(v.color.subarray(0, 4)), [10, 20, 30, 255]);
    assert.ok(o.indices instanceof Uint32Array);
    assert.deepEqual([o.basis.tag, o.basis.values.length], ['BAS2', 12]);
    assert.deepEqual([o.grid.rect, o.grid.minZ, o.grid.maxZ, Array.from(o.grid.faces)], [[0, 0, 4, 4], -1, 5, [0, 0x8001]]);
    same(ply.write(o), bply);
  });

  // 3. skinned: SKIN, fvf 0x1118, flags 0xc14 (skinned + material + bone map), weight + boneIndex
  const sv = (x, w, b0) => B(f32(x, 0, 0, w), Buffer.from([b0, 1, 0, 0]), f32(0, 0, 1, 0, 0));
  const skinned = B(T('EPLY'), T('BNDS'), f32(0, 0, 0, 2, 0, 0), T('SKIN'), i32(2), s('root'), s('arm'),
    T('MESH'), u32(0x1118), i32(0, 1), u32(0xc14), s('soldier.mtl'), Buffer.from([2, 1, 2]),
    T('VERT'), i32(3), u16(40, 0), sv(0, 1, 0), sv(1, 0.5, 1), sv(2, 0, 1), T('INDX'), i32(3), u16(0, 1, 2));
  t('model/ply skinned bone map', () => {
    const o = ply.parse(skinned);
    assert.equal(o.error, null);
    assert.deepEqual(o.skin, ['root', 'arm']);
    assert.deepEqual(o.parts[0].boneMap, [1, 2]);
    const v = o.vertices;
    assert.deepEqual(v.layout.map(e => `${e.key}@${e.offset}`).join(), 'position@0,weight@12,boneIndex@16,normal@20,uv0@32');
    assert.deepEqual(Array.from(v.weight), [1, 0.5, 0]);
    assert.deepEqual(Array.from(v.boneIndex.subarray(4, 8)), [1, 1, 0, 0]);
    same(ply.write(o), skinned);
  });

  // 4. detail+light textures + tangent, inline layered material with bump, long name, normal-less fvf, NaN bits
  const nan = Buffer.from([1, 0, 0xc0, 0x7f]);   // NaN with payload
  const dv = x => B(f32(x, 0, 0), f32(0, 0, 1), f32(0, 0), f32(1, 0, 0, 1));
  const longName = 'x'.repeat(300) + '.dds';
  const misc = B(T('EPLY'), T('BNDS'), nan, f32(0, 0, 1, 0, 0),
    T('MESH'), u32(0x112), i32(0, 1), u32(0x304), u32(0x19e6e6e6), s('d.dds'), s(longName), s('l.dds'),
    T('MESH'), u32(0x112), i32(1, 0), u32(0x404), s(''), i32(2), s('simple'), Buffer.from([1]), s('diffuse'), s('a.dds'),
    s('bump'), Buffer.from([2]), s('diffuse'), s('b.dds'), s('bump'), s('b_nm.dds'), u32(0xff808080), f32(0.04),
    T('MESH'), u32(0x102), i32(1, 0), u32(0x4), s('n.dds'),
    T('VERT'), i32(3), u16(48, 1), dv(0), dv(1), dv(2), T('INDX'), i32(3), u16(0, 1, 2),
    T('ADJA'), i32(1), u16(0, 0, 0), T('SHDW'), i32(3), Buffer.from([1, 2, 3]));
  t('model/ply materials, tangent, raw chunks', () => {
    const o = ply.parse(misc);
    assert.equal(o.error, null);
    const [a, b, c] = o.parts;
    assert.deepEqual([a.textureFlags, a.textures.length, a.textures[1]], [0x19e6e6e6, 3, longName]);
    assert.deepEqual(b.inlineMaterial.layers.map(L => [L.type, L.textures.length, L.specular]), [['simple', 1, undefined], ['bump', 2, 0xff808080]]);
    assert.deepEqual(c.textures, ['n.dds']);
    assert.deepEqual(o.vertices.layout.map(e => e.key).join(), 'position,normal,uv0,tangent');
    assert.deepEqual(ply.partLayout(c, 48).map(e => e.key).join(), 'position,uv0');
    assert.equal(o.vertices.mixed, true);
    assert.deepEqual(Array.from(ply.partAttributes(o, 2).uv0.subarray(0, 2)), [0, 0]);
    assert.ok(o.chunks.find(x => x.tag === 'ADJA').raw.length === 10);
    same(ply.write(o), misc);
  });

  t('model/ply truncated / garbage never throw, raw tail kept', () => {
    for (const buf of [eply, bply, skinned, misc]) for (let n = 0; n < buf.length; n++) {
      const cut = buf.subarray(0, n), o = ply.parse(cut);
      if (n < buf.length && n > 4 && o.error === null) {
        // a cut on a chunk boundary is a valid shorter file
        assert.ok(o.chunks.length > 0);
      }
      same(ply.write(o), cut, 'cut at ' + n);
    }
    assert.match(ply.parse(T('EP')).error, /shorter/);
    assert.match(ply.parse(T('XXXXjunk')).error, /bad magic/);
    assert.match(ply.parse(B(T('EPLY'), T('IND4'), i32(0))).error, /unknown chunk/);
    assert.match(ply.parse(B(T('EPLY'), T('VERT'), i32(5), u16(32, 0))).error, /truncated/);
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) >>> 0) >>> 24;
    for (let k = 0; k < 300; k++) {
      const g = Buffer.from(Array.from({ length: 20 + (k % 60) }, rnd));
      const buf = B(T(k & 1 ? 'BPLY' : 'EPLY'), T(['MESH', 'SUBM', 'SKIN', 'VERT'][k & 3]), g);
      const o = ply.parse(buf);
      same(ply.write(o), buf, 'garbage ' + k);
    }
  });

  t('model/ply helpers: triangles, bounds, flags, material', () => {
    const o = ply.parse(eply);
    assert.deepEqual(Array.from(ply.partTriangles(o, 1)), [0, 2, 3]);
    assert.deepEqual(Array.from(ply.bounds(o)), [0, 0, 0, 20, 40, 10]);
    const f = ply.setFlags(o, 1, 0x404 | 0x800);
    assert.equal(o.parts[1].flags, 4);
    const p = ply.parse(ply.write(ply.setMaterial(f, 1, 'other.mtl')));
    assert.deepEqual([p.parts[1].flags, p.parts[1].material, p.parts[1].boneMap], [0xc04, 'other.mtl', []]);
    assert.equal(p.error, null);
  });

  t('model/ply transform', () => {
    const o = ply.parse(eply);
    const m = [-1, 0, 0, 0, 1, 0, 0, 0, 2, 100, 0, 0];   // mirror x, scale z, move
    const x = ply.transform(o, m);
    assert.deepEqual(Array.from(x.vertices.position.subarray(3, 6)), [80, 0, 0]);
    assert.deepEqual(Array.from(x.vertices.normal.subarray(0, 3)), [0, 0, 1]);
    assert.deepEqual(Array.from(x.bounds), [80, 0, 0, 100, 40, 20]);
    assert.deepEqual(Array.from(x.indices), [0, 2, 1, 0, 3, 2]);
    assert.deepEqual(Array.from(o.vertices.position.subarray(3, 6)), [20, 0, 0]);   // input untouched
    const back = ply.parse(ply.write(x));
    assert.deepEqual(Array.from(back.vertices.position.subarray(9, 12)), [100, 40, 20]);
    const r = ply.transform(ply.parse(misc), [0, 1, 0, -1, 0, 0, 0, 0, 1, 0, 0, 0]);   // 90 deg about z
    assert.deepEqual(Array.from(r.vertices.tangent.subarray(0, 4)), [0, 1, 0, 1]);
  });

  t('model/ply concat + split', () => {
    const a = ply.parse(eply), c = ply.concat(a, a);
    assert.equal(c.parts.length, 4);
    assert.deepEqual(c.parts.map(p => p.firstFace), [0, 1, 2, 3]);
    assert.equal(c.vertices.count, 8);
    assert.deepEqual(Array.from(c.indices.subarray(6)), [4, 5, 6, 4, 6, 7]);
    const cw = ply.parse(ply.write(c));
    assert.equal(cw.error, null);
    assert.deepEqual(cw.chunks.map(x => x.tag).join(), 'BNDS,MESH,MESH,MESH,MESH,VERT,INDX,MROR');
    const sp = ply.split(cw, [3]);
    assert.equal(sp.parts.length, 1);
    assert.deepEqual([sp.parts[0].firstFace, sp.vertices.count, Array.from(sp.indices).join()], [0, 3, '0,1,2']);
    assert.deepEqual(Array.from(sp.vertices.position.subarray(6, 9)), [0, 40, 10]);
    assert.deepEqual(Array.from(sp.bounds), [0, 0, 0, 20, 40, 10]);
    same(ply.write(ply.split(a, [0, 1])), eply, 'split of all parts keeps the file');
    // skins merged by name, b's bone map remapped
    const s1 = ply.parse(skinned), s2 = ply.parse(skinned);
    s2.skin = ['arm', 'leg'];
    const sc = ply.concat(s1, s2);
    assert.deepEqual(sc.skin, ['root', 'arm', 'leg']);
    assert.deepEqual(sc.parts[1].boneMap, [2, 3]);
    // reconcile: skinned layout into a static one -> a's layout wins
    const mix = ply.concat(a, s1);
    assert.deepEqual(mix.vertices.layout.map(e => e.key).join(), 'position,normal,uv0');
    assert.deepEqual(Array.from(mix.vertices.position.subarray(15, 18)), [1, 0, 0]);
    // BPLY: SUBM firstVertex shift + InfG faces
    const b = ply.parse(bply), bc = ply.concat(b, b);
    assert.deepEqual(bc.parts.map(p => [p.tag, p.firstVertex]), [['SUBM', 0], ['SUBM', 1], ['SUBM', 4], ['SUBM', 5]]);
    assert.deepEqual(Array.from(bc.grid.faces), [0, 0x8001, 2, 0x8003]);
    const bs = ply.split(bc, [3]);
    assert.deepEqual([Array.from(bs.grid.faces), bs.parts[0].firstVertex, bs.parts[0].vertexCount], [[0x8000], 0, 3]);
    assert.equal(ply.parse(ply.write(bs)).error, null);
    assert.throws(() => ply.concat(a, b), /magic/);
  });

  t('model/ply fresh object (no chunks) writes the default order', () => {
    const o = ply.parse(eply);
    delete o.chunks;
    const back = ply.parse(ply.write(o));
    assert.deepEqual(back.chunks.map(c => c.tag).join(), 'BNDS,MESH,MESH,VERT,INDX,MROR');
    same(ply.write(back), eply);
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

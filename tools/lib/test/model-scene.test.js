// lib/model/scene.js unit tests: a synthetic two-level skeleton (rotated child), box + polyhedron volumes, a mesh, an
// animation, all built here. Run inside tools/lib/test/test.js or alone: node tools/lib/test/model-scene.test.js (last line PASS)
// Author: Imperator_Aug (ARSENAL, ia-2404c40a)
'use strict';
module.exports = (t, assert) => {
  const scene = require('../model/scene'), mdl = require('../model/mdl'), vol = require('../model/vol'), trace = require('../model/trace');
  const anm = require('../model/anm'), ply = require('../model/ply');
  const T = s => Buffer.from(s, 'latin1');
  const i32 = (...a) => Buffer.concat(a.map(n => { const b = Buffer.alloc(4); b.writeInt32LE(n); return b; }));
  const u32 = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; };
  const u16 = (...a) => Buffer.concat(a.map(n => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; }));
  const f32 = (...a) => Buffer.concat(a.map(n => { const b = Buffer.alloc(4); b.writeFloatLE(n); return b; }));
  const s = x => { const b = T(x); return Buffer.concat([Buffer.from([b.length]), b]); };
  const B = (...a) => Buffer.concat(a.map(x => (Buffer.isBuffer(x) ? x : Buffer.from(x))));
  const near = (a, b, m) => { assert.equal(a.length, b.length, m); a.forEach((x, i) => assert.ok(Math.abs(x - b[i]) < 1e-4, (m || '') + ' [' + i + '] ' + x + ' vs ' + b[i])); };

  // mesh: one quad, fvf 0x112 (position, normal, uv0), one MESH part with a texture name
  const v112 = (x, y, z, u, v) => f32(x, y, z, 0, 0, 1, u, v);
  const quad = B(v112(0, 0, 0, 0, 0), v112(20, 0, 0, 1, 0), v112(20, 40, 0, 1, 1), v112(0, 40, 10, 0, 1));
  const plyBuf = B(T('EPLY'), T('BNDS'), f32(0, 0, 0, 20, 40, 10), T('MESH'), u32(0x112), i32(0, 2), u32(0x004), s('tex/a.dds'),
    T('VERT'), i32(4), u16(32, 7), quad, T('INDX'), i32(6), u16(0, 1, 2, 0, 2, 3));
  const volBuf = vol.write(vol.fromBox([4, 4, 4]));

  // body at (0,0,10); turret under body rotated +90 deg about Z (local X -> world +Y), at (20,0,5) in body space
  const text = [
    '{Skeleton',
    '\t{bone "body"',
    '\t\t{Position 0\t0\t10}',
    '\t\t{VolumeView "body.ply"}',
    '\t\t{bone "turret"',
    '\t\t\t{Orientation',
    '\t\t\t\t0\t1\t0',
    '\t\t\t\t-1\t0\t0',
    '\t\t\t\t0\t0\t1',
    '\t\t\t}',
    '\t\t\t{Position 20\t0\t5}',
    '\t\t\t{LODView {View "turret.ply"} {View "turret_lod1.ply"} {OFF}}',
    '\t\t\t{bone "gun"',
    '\t\t\t\t{VolumeView "gone.ply"}',
    '\t\t\t}',
    '\t\t}',
    '\t}',
    '}',
    '{Volume "armor"',
    '\t{Box 10 6 4}',
    '\t{Bone "turret"}',
    '}',
    '{Volume "hull"',
    '\t{Polyhedron "hull.vol"}',
    '\t{Bone "turret"}',
    '\t{Position 0\t0\t30}',
    '}',
    '',
  ].join('\r\n');
  const store = { 'body.ply': plyBuf, 'turret.ply': plyBuf, 'turret_lod1.ply': plyBuf, 'hull.vol': volBuf };
  const files = { get: n => store[n.toLowerCase()] || null };
  const model = mdl.parse(Buffer.from(text, 'latin1'));
  const sc = scene.build(model, files);

  t('scene: bone and volume world matrices', () => {
    assert.equal(model.error, null);
    assert.deepEqual(sc.bones.map(b => [b.name, b.parent]), [['body', -1], ['turret', 0], ['gun', 1]]);
    near(sc.bones[0].world, [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 10]);
    near(sc.bones[1].world, [0, 1, 0, -1, 0, 0, 0, 0, 1, 20, 0, 15], 'turret');
    const hull = sc.volumes.find(v => v.name === 'hull');
    assert.equal(hull.id, 'body/turret/hull');
    near(hull.world, [0, 1, 0, -1, 0, 0, 0, 0, 1, 20, 0, 45], 'hull');
    near(sc.volumes[0].world, sc.bones[1].world, 'armor');
    assert.deepEqual(sc.missing, ['gone.ply']);
  });

  t('scene: meshes take LOD 0 and the bone world', () => {
    assert.deepEqual(sc.meshes.map(m => [m.bone, m.file, m.kind, !!m.ply]),
      [['body', 'body.ply', 'VolumeView', true], ['body/turret', 'turret.ply', 'LODView', true], ['body/turret/gun', 'gone.ply', 'VolumeView', false]]);
    near(sc.meshes[1].world, sc.bones[1].world);
    // body mesh 0..20 x 0..40 x 0..10 at z+10; turret mesh rotated: x -> y, y -> -x, at (20,0,15)
    near(sc.meshBounds.min, [-20, 0, 10]); near(sc.meshBounds.max, [20, 40, 25]);
    near(sc.bounds.max, [23, 40, 47]);
  });

  t('scene: a ray through shapes() hits the expected sides', () => {
    const sh = scene.shapes(sc);
    assert.deepEqual(sh.map(x => [x.id, x.kind]), [['body/turret/armor', 'box'], ['body/turret/hull', 'polyhedron']]);
    // from world +Y toward the turret: crosses the box's local +X face = front
    let hits = trace.traceAll({ origin: [20, 50, 15], dir: [0, -1, 0] }, sh);
    assert.equal(hits[0].id, 'body/turret/armor'); assert.equal(hits[0].sideIn, trace.SIDE.FRONT); near([hits[0].tIn], [45]);
    // straight down on the polyhedron: its top
    hits = trace.traceAll({ origin: [20, 0, 100], dir: [0, 0, -1] }, sh);
    assert.equal(hits[0].id, 'body/turret/hull'); assert.equal(hits[0].sideIn, trace.SIDE.TOP); near([hits[0].tIn], [53]);
    // from world -X: local +Y maps to world -X, so the local +Y face = left
    hits = trace.traceAll({ origin: [-50, 0, 15], dir: [1, 0, 0] }, sh);
    assert.equal(hits[0].sideIn, trace.SIDE.LEFT);
  });

  // animation: turret keyed at frames 0 and 2 (identity rotation; z 5 -> 25), hidden at frame 2
  const mat = (z) => B(T('MATR'), f32(1, 0, 0, 0, 1, 0, 0, 0, 1, 20, 0, z));
  const anmBuf = B(T('EANM'), i32(6), T('FRMS'), i32(3), T('BMAP'), i32(1), i32(6), T('turret'),
    T('FRMN'), i32(0), T('BONE'), i32(0), mat(5), T('FRMN'), i32(2), T('BONE'), i32(0), mat(25), T('VISI'), i32(0));
  t('scene: pose replaces the bone local with the animation matrix', () => {
    const a = anm.parse(anmBuf);
    assert.equal(a.error, null);
    const p1 = scene.pose(sc, a, 1);
    near(p1.bones[1].world, [1, 0, 0, 0, 1, 0, 0, 0, 1, 20, 0, 25], 'interpolated');
    assert.equal(p1.bones[1].visible, true);
    near(p1.volumes[1].world, [1, 0, 0, 0, 1, 0, 0, 0, 1, 20, 0, 55], 'hull follows');
    near(p1.bones[2].world.slice(9), [20, 0, 25], 'child follows');
    const p2 = scene.pose(sc, a, 2);
    near(p2.bones[1].world.slice(9), [20, 0, 35]); assert.equal(p2.bones[1].visible, false);
    near(sc.bones[1].world, [0, 1, 0, -1, 0, 0, 0, 0, 1, 20, 0, 15], 'input untouched');
    near(p1.bones[0].world, sc.bones[0].world, 'body not keyed');
  });

  t('scene: toJSON round-trips counts', () => {
    const j = JSON.parse(JSON.stringify(scene.toJSON(sc, { meshes: true })));
    assert.equal(j.format, 'scene/1');
    assert.deepEqual(j.bones.map(b => b.parent), [-1, 0, 1]);
    const part = j.meshes[0].parts[0];
    assert.equal(part.vertexCount, 4); assert.equal(part.indexCount, 6); assert.equal(part.material, 'tex/a.dds');
    assert.equal(scene.unb64(part.positions, Float32Array).length, 12);
    assert.equal(scene.unb64(part.normals, Float32Array).length, 12);
    assert.deepEqual(Array.from(scene.unb64(part.uv0, Float32Array)), [0, 0, 1, 0, 1, 1, 0, 1]);
    assert.deepEqual(Array.from(scene.unb64(part.indices, Uint32Array)), [0, 1, 2, 0, 2, 3]);
    assert.deepEqual(j.meshes[2].parts, []);
    const box = j.volumes[0], poly = j.volumes[1];
    assert.deepEqual([box.kind, box.size, box.bone], ['box', [10, 6, 4], 1]);
    assert.equal(poly.triangleCount, 12); assert.equal(poly.sides.length, 12);
    assert.equal(scene.unb64(poly.triangles, Float32Array).length, 108);
    const lean = scene.toJSON(sc, { meshes: false });
    assert.deepEqual(lean.meshes.map(m => m.parts.length), [0, 0, 0]);
    assert.ok(ply.parse(plyBuf).error === null);
  });
};

if (require.main === module) {
  const assert = require('assert'); let fail = 0, n = 0;
  module.exports((name, fn) => { try { fn(); n++; console.log('ok   ' + name); } catch (e) { fail++; console.log('FAIL ' + name + '\n' + (e.stack || e.message)); } }, assert);
  console.log(fail ? `FAIL ${fail}` : `PASS ${n}`);
  process.exit(fail ? 1 : 0);
}

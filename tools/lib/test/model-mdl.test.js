// model/mdl tests, loaded by test.js: (t, assert) => ...   standalone: node tools/lib/test/model-mdl.test.js (last line PASS)
// synthetic tank-like .mdl: nested bones with every matrix form, volumes of each kind, obstacle, area, sequences,
// extender, unknown keywords, cp1251 comment bytes, CRLF. Every edit is checked to leave all other bytes identical.
// Author: Imperator_Aug (ARSENAL, ia-ea494a45)
'use strict';
const mdl = require('../model/mdl');

const L = [
  ';Exported by: test \xCF\xF0\xE8\xE2\xE5\xF2 \xEC\xE8\xF0',      // cp1251 bytes in a comment
  '{Skeleton',
  '\t{extension "/properties/animation/x.ext"}',
  '\t{animation',
  '\t\t{sequence "start" {speed 0.6} {resume}}',
  '\t\t{sequence "fire" {file "fire_x.anm"} {smooth 0.5} {store} {autostart}}',
  '\t}',
  '\t{bone revolute "basis"',
  '\t\t{limits 0 0}',
  '\t\t{Orientation',
  '\t\t\t1\t0\t0',
  '\t\t\t0\t-1\t0',
  '\t\t\t0\t0\t1',
  '\t\t}',
  '\t\t{bone "body"',
  '\t\t\t{parameters "ID=body;WheelRadius=0.3;"}',
  '\t\t\t{animation',
  '\t\t\t\t{sequence "repair" {file "body_r.anm"}}',
  '\t\t\t}',
  '\t\t\t{Position 0\t0\t20.3574}',
  '\t\t\t{VolumeView "body.ply"}',
  '\t\t\t{FutureKey 1 2} ; unknown keyword, kept \xE0\xE1',
  '\t\t\t{bone revolute "turret"',
  '\t\t\t\t{parameters "ID=turret;"}',
  '\t\t\t\t{limits -180 180}',
  '\t\t\t\t{speed 0.5}',
  '\t\t\t\t{Matrix34',
  '\t\t\t\t\t0\t1\t0',
  '\t\t\t\t\t-1\t0\t0',
  '\t\t\t\t\t0\t0\t1',
  '\t\t\t\t\t10\t0\t5.0',
  '\t\t\t\t}',
  '\t\t\t\t{LODView {VolumeView "turret.ply"} {VolumeView "turret_lod1.ply"} {OFF}}',
  '\t\t\t\t{bone "gun"',
  '\t\t\t\t\t{Matrix34',
  '\t\t\t\t\t\t1\t0\t0',
  '\t\t\t\t\t\t0\t1\t0',
  '\t\t\t\t\t\t0\t0\t1',
  '\t\t\t\t\t\t30\t0\t-6.67894e-005',
  '\t\t\t\t\t}',
  '\t\t\t\t\t{Terminator}',
  '\t\t\t\t}',
  '\t\t\t}',
  '\t\t}',
  '\t\t{bone "emit1"}',
  '\t}',
  '}',
  '{Volume "body1"',
  '\t{Polyhedron "body1.vol"}',
  '\t{Bone "body"}',
  '\t{Position 3.2147\t-3.64085\t-17.0654}',
  '}',
  '{Volume "turret"',
  '\t{Box 20.2358 8.82678 33.7292}',
  '\t{Bone "turret"}',
  '\t{Matrix34',
  '\t\t1\t0\t0',
  '\t\t0\t1\t0',
  '\t\t0\t0\t1',
  '\t\t1\t2\t3',
  '\t}',
  '\t{Strange 7}',
  '}',
  '{Volume "barrel"',
  '\t{Cylinder 2 40}',
  '\t{Bone "gun"}',
  '\t{Orientation 0 0 1 0 1 0 -1 0 0}',
  '\t{Thickness 30 {front 50}}',
  '}',
  '{Volume "ball"',
  '\t{Sphere 4.5}',
  '\t{Bone "nosuchbone"}',
  '}',
  '{Obstacle "body01"',
  '\t{Obb2',
  '\t\t{Center -14.7476 22.8267}',
  '\t\t{Extent 35.1561 3.80355}',
  '\t\t{Axis 1 0}',
  '\t}',
  '\t{Rotate}',
  '\t{Tags "wall"}',
  '}',
  '{Area "interior"',
  '\t{Polygon2',
  '\t\t{Radius 0}',
  '\t\t{Vertex 1 2}',
  '\t\t{Vertex 3 4}',
  '\t\t{Vertex 5 6}',
  '\t}',
  '}',
  '{Extender "preview"',
  '\t{"Stuff"',
  '\t\t{camera {fov 22.6199}}',
  '\t}',
  '}',
  ''
];
const SRC = L.join('\r\n');
const BUF = Buffer.from(SRC, 'latin1');

const near = (a, b, eps = 1e-5) => a.length === b.length && a.every((x, i) => Math.abs(x - b[i]) < eps);

module.exports = (t, assert) => {
  const m = mdl.parse(BUF);
  t('mdl: parse fields', () => {
    assert.equal(m.error, null);
    assert.deepEqual(m.bones.map(b => b.path), ['basis', 'basis/body', 'basis/body/turret', 'basis/body/turret/gun', 'basis/emit1']);
    const [basis, body, turret, gun, emit] = m.bones;
    assert.equal(basis.type, 'revolute'); assert.deepEqual(basis.limits, [0, 0]); assert.deepEqual(basis.form, ['Orientation']);
    assert.deepEqual(basis.matrix, [1, 0, 0, 0, -1, 0, 0, 0, 1, 0, 0, 0]);
    assert.deepEqual(body.form, ['Position']); assert.deepEqual(body.matrix.slice(9), [0, 0, 20.3574]);
    assert.equal(body.paramMap.ID, 'body'); assert.equal(body.paramMap.WheelRadius, '0.3');
    assert.deepEqual(body.views.map(v => [v.kind, v.file]), [['VolumeView', 'body.ply']]);
    assert.deepEqual(body.unknown, ['FutureKey']);
    assert.equal(turret.speed, 0.5); assert.deepEqual(turret.form, ['Matrix34']); assert.deepEqual(turret.matrix, [0, 1, 0, -1, 0, 0, 0, 0, 1, 10, 0, 5]);
    assert.equal(turret.views[0].kind, 'LODView'); assert.deepEqual(turret.views[0].lods.map(l => l.file), ['turret.ply', 'turret_lod1.ply']); assert.ok(turret.views[0].off);
    assert.deepEqual(gun.flags, ['Terminator']); assert.equal(gun.parent, 'basis/body/turret');
    assert.deepEqual(emit.form, []); assert.deepEqual(emit.matrix, mdl.IDENTITY.slice());
    assert.equal(m.skeleton.extension, '/properties/animation/x.ext');
    assert.deepEqual(m.sequences.map(s => [s.name, s.bone]), [['start', null], ['fire', null], ['repair', 'basis/body']]);
    const fire = m.sequences[1]; assert.equal(fire.file, 'fire_x.anm'); assert.equal(fire.smooth, 0.5); assert.ok(fire.store && fire.autostart && !fire.resume);
    assert.ok(m.sequences[0].resume); assert.equal(m.sequences[0].speed, 0.6);
    assert.deepEqual(m.volumes.map(v => [v.id, v.kind]), [['basis/body/body1', 'polyhedron'], ['basis/body/turret/turret', 'box'], ['basis/body/turret/gun/barrel', 'cylinder'], ['nosuchbone/ball', 'sphere']]);
    const [b1, tv, bar, ball] = m.volumes;
    assert.equal(b1.file, 'body1.vol'); assert.deepEqual(tv.size, [20.2358, 8.82678, 33.7292]); assert.deepEqual(tv.unknown, ['Strange']);
    assert.equal(bar.radius, 2); assert.equal(bar.length, 40); assert.equal(bar.thickness.all, 30); assert.equal(bar.thickness.sides.front, 50);
    assert.ok(ball.orphan); assert.equal(ball.radius, 4.5);
    assert.deepEqual(body.volumes, ['basis/body/body1']);
    assert.equal(m.obstacles[0].kind, 'Obb2'); assert.deepEqual(m.obstacles[0].shape.extent, [35.1561, 3.80355]); assert.deepEqual(m.obstacles[0].flags, ['Rotate']); assert.deepEqual(m.obstacles[0].tags, ['wall']);
    assert.equal(m.areas[0].shape.vertices.length, 3);
    assert.deepEqual(m.blocks.map(b => [b.keyword, b.label]), [['Extender', 'preview']]);
  });
  t('mdl: matrix math, world = local * parent', () => {
    const w = mdl.worldMatrix(m, 'gun');
    // gun at (30,0,~0) in turret; turret rotated 90 deg about z at (10,0,5) in body; body at z 20.3574; basis flips y
    const p = mdl.transformPoint(w, [0, 0, 0]);
    assert.ok(near(p, [10, -30, 25.3574 - 6.67894e-5], 1e-4), p.join(' '));
    const inv = mdl.invert(w), id = mdl.mul(w, inv);
    assert.ok(near(id, mdl.IDENTITY.slice(), 1e-6));
    assert.ok(near(mdl.transformPoint(inv, p), [0, 0, 0], 1e-4));
    assert.equal(mdl.invert([0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3]), null);
    const vw = mdl.volumeWorld(m, 'basis/body/turret/turret');
    assert.ok(near(mdl.transformPoint(vw, [0, 0, 0]), mdl.transformPoint(mdl.worldMatrix(m, 'basis/body/turret'), [1, 2, 3])));
    assert.equal(mdl.fmtNum(-6.67894e-5), '-6.67894e-005'); assert.equal(mdl.fmtNum(0.999983), '0.999983'); assert.equal(mdl.fmtNum(5), '5'); assert.equal(mdl.fmtNum(0.1 + 0.2), '0.3');
  });
  t('mdl: no-op edits are byte-identical', () => {
    assert.ok(mdl.edit(m, []).equals(BUF));
    const all = m.bones.map(b => ({ op: 'setMatrix', bone: b.path, matrix: b.matrix }))
      .concat(m.volumes.map(v => ({ op: 'setVolume', volume: v.id, matrix: v.matrix, size: v.size || undefined, radius: v.radius ?? undefined })));
    assert.ok(mdl.edit(m, all).equals(BUF));
    // forced rewrite: only number formatting may differ ("5.0" -> "5")
    const f = mdl.edit(m, m.bones.map(b => ({ op: 'setMatrix', bone: b.path, matrix: b.matrix, force: true })));
    assert.equal(f.toString('latin1'), SRC.replace('\t10\t0\t5.0\r\n', '\t10\t0\t5\r\n'));
    const m2 = mdl.parse(f); assert.deepEqual(m2.bones.map(b => b.matrix), m.bones.map(b => b.matrix));
  });
  // edit result must equal SRC with exactly these [from, to] text replacements (first match each): all other bytes identical
  const one = (changes, ...pairs) => {
    const out = mdl.edit(m, changes);
    let want = SRC; for (const [a, b] of pairs) { assert.ok(want.includes(a), 'fixture lacks ' + JSON.stringify(a)); want = want.replace(a, b); }
    assert.equal(out.toString('latin1'), want);
    assert.ok(out.includes(Buffer.from('\xCF\xF0\xE8\xE2\xE5\xF2', 'latin1')));
    const r = mdl.parse(out); assert.equal(r.error, null);
    return r;
  };
  t('mdl: setMatrix in each form, other bytes identical', () => {
    let r = one([{ op: 'setMatrix', bone: 'turret', matrix: [0, 1, 0, -1, 0, 0, 0, 0, 1, 12.5, 0, 5] }], ['\t10\t0\t5.0\r\n', '\t12.5\t0\t5.0\r\n']);
    assert.deepEqual(r.bones[2].matrix.slice(9), [12.5, 0, 5]);
    r = one([{ op: 'setMatrix', bone: 'basis/body', matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 0, 20.3574] }], ['{Position 0\t0\t20.3574}', '{Position 1\t0\t20.3574}']);
    r = one([{ op: 'setMatrix', bone: 'basis', matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0] }], ['\t\t\t0\t-1\t0', '\t\t\t0\t1\t0']);
    // no form: Position is inserted ({bone "emit1"} is one line: stays one line)
    r = one([{ op: 'setMatrix', bone: 'emit1', matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 2, 3] }], ['{bone "emit1"}', '{bone "emit1" {Position 1 2 3}}']);
    assert.deepEqual(r.bones[4].matrix, [1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 2, 3]); assert.deepEqual(r.bones[4].form, ['Position']);
    // Position only + rotation: Orientation inserted above the Position line
    r = mdl.parse(mdl.edit(m, [{ op: 'setMatrix', bone: 'body', matrix: [0, 1, 0, -1, 0, 0, 0, 0, 1, 0, 0, 20.3574] }]));
    assert.deepEqual(r.bones[1].form, ['Orientation', 'Position']); assert.deepEqual(r.bones[1].matrix, [0, 1, 0, -1, 0, 0, 0, 0, 1, 0, 0, 20.3574]);
    assert.ok(mdl.edit(m, [{ op: 'setMatrix', bone: 'body', matrix: [0, 1, 0, -1, 0, 0, 0, 0, 1, 0, 0, 20.3574] }]).toString('latin1').includes('\t\t\t{Orientation\r\n\t\t\t\t0\t1\t0\r\n'));
  });
  t('mdl: volume edits, other bytes identical', () => {
    let r = one([{ op: 'setVolume', volume: 'basis/body/turret/turret', size: [20.2358, 9, 33.7292] }], ['{Box 20.2358 8.82678 33.7292}', '{Box 20.2358 9 33.7292}']);
    assert.deepEqual(r.volumes[1].size, [20.2358, 9, 33.7292]);
    r = one([{ op: 'setVolume', volume: 'barrel', radius: 2.5, length: 40 }], ['{Cylinder 2 40}', '{Cylinder 2.5 40}']);
    r = one([{ op: 'setVolume', volume: 'body1', file: 'body1b.vol' }], ['"body1.vol"', '"body1b.vol"']);
    r = one([{ op: 'setVolume', volume: 'ball', kind: 'box', size: [1, 2, 3] }], ['{Sphere 4.5}', '{Box 1 2 3}']);
    assert.equal(r.volumes[3].kind, 'box');
    r = one([{ op: 'setVolume', volume: 'basis/body/body1', matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1, 3.2147, -3.64085, -17] }], ['-17.0654}', '-17}']);
    r = one([{ op: 'setVolume', volume: 'ball', matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 2] }], ['\t{Bone "nosuchbone"}\r\n', '\t{Bone "nosuchbone"}\r\n\t{Position 0 0 2}\r\n']);
    r = one([{ op: 'setKey', volume: 'turret', key: 'Density', value: 2 }], ['\t{Strange 7}\r\n', '\t{Strange 7}\r\n\t{Density 2}\r\n']);
    assert.equal(r.volumes[1].density, 2);
    r = one([{ op: 'setKey', volume: 'turret', key: 'Strange', value: 8 }], ['{Strange 7}', '{Strange 8}']);
    r = one([{ op: 'setKey', volume: 'turret', key: 'strange', value: null }], ['\t{Strange 7}\r\n', '']);
    r = one([{ op: 'rename', volume: 'basis/body/turret/turret', name: 'turret1' }], ['{Volume "turret"', '{Volume "turret1"']);
    assert.equal(r.volumes[1].id, 'basis/body/turret/turret1');
    r = one([{ op: 'deleteVolume', volume: 'ball' }], ['{Volume "ball"\r\n\t{Sphere 4.5}\r\n\t{Bone "nosuchbone"}\r\n}\r\n', '']);
    assert.equal(r.volumes.length, 3);
    r = one([{ op: 'addVolume', bone: 'gun', name: 'mantlet', kind: 'box', size: [1, 2, 3], matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1, 4, 5, 6], keys: { Tags: ['mantlet'] } }],
      ['{Obstacle "body01"', '{Volume "mantlet"\r\n\t{Box 1 2 3}\r\n\t{Bone "gun"}\r\n\t{Tags "mantlet"}\r\n\t{Position 4\t5\t6}\r\n}\r\n{Obstacle "body01"']);
    const nv = r.volumes.find(v => v.name === 'mantlet'); assert.equal(nv.id, 'basis/body/turret/gun/mantlet'); assert.deepEqual(nv.matrix.slice(9), [4, 5, 6]);
  });
  t('mdl: bone keys, flags, rename, sequences', () => {
    let r = one([{ op: 'setKey', bone: 'turret', key: 'speed', value: 0.75 }], ['{speed 0.5}', '{speed 0.75}']);
    r = one([{ op: 'setKey', bone: 'turret', key: 'limits', value: [-90, 90] }], ['{limits -180 180}', '{limits -90 90}']);
    assert.deepEqual(r.bones[2].limits, [-90, 90]);
    r = one([{ op: 'setKey', bone: 'turret', key: 'limits', value: [-90, 90, 1] }], ['{limits -180 180}', '{limits -90 90 1}']);
    r = one([{ op: 'setKey', bone: 'basis/body', key: 'Visibility', value: 0 }], ['\t\t\t{animation\r\n\t\t\t\t{sequence "repair"', '\t\t\t{Visibility 0}\r\n\t\t\t{animation\r\n\t\t\t\t{sequence "repair"']);
    assert.equal(r.bones[1].visibility, 0);
    r = one([{ op: 'addFlag', bone: 'turret', flag: 'Terminator' }], ['\t\t\t\t{LODView', '\t\t\t\t{Terminator}\r\n\t\t\t\t{LODView']);
    assert.deepEqual(r.bones[2].flags, ['Terminator']);
    r = one([{ op: 'removeFlag', bone: 'gun', flag: 'terminator' }], ['\t\t\t\t\t{Terminator}\r\n', '']);
    r = one([{ op: 'rename', bone: 'gun', name: 'gun1' }], ['{bone "gun"', '{bone "gun1"'], ['{Bone "gun"}', '{Bone "gun1"}']);
    assert.equal(r.bones[3].path, 'basis/body/turret/gun1'); assert.equal(r.volumes[2].id, 'basis/body/turret/gun1/barrel');
    r = one([{ op: 'setSequence', sequence: 'start', fields: { speed: 0.8 } }], ['{speed 0.6}', '{speed 0.8}']);
    r = one([{ op: 'setSequence', sequence: 'start', fields: { store: true } }], ['{resume}}', '{resume} {store}}']);
    assert.ok(r.sequences[0].store);
    r = one([{ op: 'setSequence', sequence: 'fire', fields: { autostart: false } }], [' {autostart}', '']);
    r = one([{ op: 'setSequence', sequence: 'repair', bone: 'body', fields: { file: 'body_r2.anm' } }], ['"body_r.anm"', '"body_r2.anm"']);
    r = one([{ op: 'setSequence', sequence: 'repair', fields: { name: 'fix' } }], ['"repair"', '"fix"']);
    assert.equal(r.sequences[2].name, 'fix');
    assert.throws(() => mdl.edit(m, [{ op: 'setMatrix', bone: 'nope', matrix: mdl.IDENTITY }]), /not found/);
    // two edits at once, each region intact
    const out = mdl.edit(m, [{ op: 'setKey', bone: 'turret', key: 'speed', value: 0.25 }, { op: 'setVolume', volume: 'ball', radius: 5 }]).toString('latin1');
    assert.equal(out, SRC.replace('{speed 0.5}', '{speed 0.25}').replace('{Sphere 4.5}', '{Sphere 5}'));
  });
  t('mdl: bad data never throws in parse', () => {
    assert.match(mdl.parse(Buffer.from('{Skeleton {bone "a"\r\n')).error, /not closed/);
    assert.match(mdl.parse(Buffer.from('{Skeleton}}\r\n')).error, /stray/);
    assert.ok(mdl.parse(Buffer.from([0xFF, 0xFE, 0x41, 0])).error);
    const e = mdl.parse(Buffer.from('')); assert.equal(e.error, null); assert.equal(e.bones.length, 0);
  });
};

if (require.main === module) {
  const assert = require('assert'); let fail = 0, n = 0;
  module.exports((name, fn) => { try { fn(); n++; console.log('ok   ' + name); } catch (e) { fail++; console.log('FAIL ' + name + '\n' + (e.stack || e.message)); } }, assert);
  console.log(fail ? `FAIL ${fail}` : `PASS ${n}`);
  process.exit(fail ? 1 : 0);
}

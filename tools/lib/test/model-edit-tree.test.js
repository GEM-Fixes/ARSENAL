// model/edit/tree tests, loaded by test.js: (t, assert) => ...   standalone: node tools/lib/test/model-edit-tree.test.js (last line PASS)
// A stand-in document (contract edit/README.md: files Map rel -> { rel, kind, bytes }, mdl) over a synthetic tank-like .mdl with
// CRLF, tabs, a cp1251 comment, every placement form, a LOD view, a joint with limits, sequences, volumes, an obstacle, and a
// synthetic .anm. Every op: round trip parse, untouched lines kept byte for byte, CRLF only, and its refusals.
// Author: Imperator_Aug (ARSENAL, ia-714804fd)
'use strict';
const mdl = require('../model/mdl');
const anm = require('../model/anm');
const tree = require('../model/edit/tree');

const MDL = [
  ';Exported by: test \xCF\xF0\xE8\xE2\xE5\xF2',
  '{Skeleton',
  '\t{bone "basis"',
  '\t\t{Orientation',
  '\t\t\t1\t0\t0',
  '\t\t\t0\t-1\t0',
  '\t\t\t0\t0\t1',
  '\t\t}',
  '\t\t{bone "body"',
  '\t\t\t{Position 0\t0\t20.3574}',
  '\t\t\t{VolumeView "body.ply" {NoCastShadows}}',
  '\t\t\t{bone revolute "turret"',
  '\t\t\t\t{limits -180 180}',
  '\t\t\t\t{speed 0.5}',
  '\t\t\t\t{Position 10\t0\t30}',
  '\t\t\t\t{VolumeView "turret.ply"}',
  '\t\t\t\t{bone "gun" ; the gun \xE0\xE1',
  '\t\t\t\t\t{Matrix34',
  '\t\t\t\t\t\t0\t1\t0',
  '\t\t\t\t\t\t-1\t0\t0',
  '\t\t\t\t\t\t0\t0\t1',
  '\t\t\t\t\t\t25\t0\t5',
  '\t\t\t\t\t}',
  '\t\t\t\t\t{LODView {VolumeView "gun.ply"} {VolumeView "gun_lod1.ply"}}',
  '\t\t\t\t}',
  '\t\t\t}',
  '\t\t\t{bone "wheel1"',
  '\t\t\t\t{Position 5\t-10\t0}',
  '\t\t\t}',
  '\t\t}',
  '\t}',
  '\t{animation',
  '\t\t{sequence "turn" {file "turn.anm"} {speed 1.5}}',
  '\t}',
  '}',
  '{Volume "hull"',
  '\t{Box 40 20 10}',
  '\t{Bone "body"}',
  '}',
  '{Volume "tower"',
  '\t{Cylinder 8 6}',
  '\t{Bone "turret"}',
  '\t{Position 1\t2\t3}',
  '}',
  '{Volume "barrel"',
  '\t{Box 20 2 2}',
  '\t{Bone "gun"}',
  '}',
  '{Obstacle "o1" {Circle2 {Radius 3} {Center 0 0}}}',
  ''].join('\r\n');

const B = (...a) => Buffer.concat(a.map(x => (Buffer.isBuffer(x) ? x : Buffer.from(x, 'latin1'))));
const i32 = (...a) => Buffer.concat(a.map(v => { const b = Buffer.alloc(4); b.writeInt32LE(v); return b; }));
const f32 = (...a) => Buffer.concat(a.map(v => { const b = Buffer.alloc(4); b.writeFloatLE(v); return b; }));
const ANM = B('EANM', i32(0x60000), 'FRMS', i32(2), 'BMAP', i32(2), i32(6), 'turret', i32(3), 'gun',
  'FRMN', i32(0), 'BONE', i32(0), 'MATR', f32(1, 0, 0, 0, 1, 0, 0, 0, 1, 10, 0, 30), 'BONE', i32(1), 'MATR', f32(1, 0, 0, 0, 1, 0, 0, 0, 1, 25, 0, 5));

function mkDoc(text) {
  const files = new Map();
  const add = (rel, kind, bytes) => files.set(rel, { rel, kind, bytes, bytes0: bytes, from: 'mod', dirty: false });
  add('resource/entity/t/t.mdl', 'mdl', Buffer.from(text === undefined ? MDL : text, 'latin1'));
  add('resource/entity/t/turn.anm', 'anm', ANM);
  add('resource/entity/t/t.def', 'def', Buffer.from('{game_entity\r\n\t{boneTurret "turret"}\r\n}\r\n', 'latin1'));
  return { id: 'd1', rev: 0, mdl: 'resource/entity/t/t.mdl', files, read(rel) { return mdl.parse(files.get(rel).bytes); } };
}
const REL = 'resource/entity/t/t.mdl';
function run(doc, op, args) {
  const r = tree.ops[op].apply(doc, args);
  for (const [rel, b] of Object.entries(r.files)) { if (b === null) doc.files.delete(rel); else doc.files.get(rel).bytes = b; }
  doc.rev++;
  return r;
}
const text = doc => doc.files.get(REL).bytes.toString('latin1');
const model = doc => mdl.parse(doc.files.get(REL).bytes);
const lines = s => s.split('\r\n');
// lines of `before` (all but those `skip` accepts) appear in `after` in the same order, byte for byte; CRLF only; parses
function kept(assert, before, after, skip) {
  assert.ok(!/[^\r]\n/.test(after) && !/\r(?!\n)/.test(after), 'CRLF only');
  const m = mdl.parse(Buffer.from(after, 'latin1')); assert.equal(m.error, null, 'parses: ' + m.error);
  const A = lines(after); let j = 0;
  for (const l of lines(before)) {
    if (skip && skip(l)) continue;
    while (j < A.length && A[j] !== l) j++;
    assert.ok(j < A.length, 'line kept: ' + JSON.stringify(l));
    j++;
  }
  return m;
}
const near = (assert, a, b, m) => { assert.equal(a.length, b.length, m); a.forEach((x, i) => assert.ok(Math.abs(x - b[i]) < 1e-4, (m || '') + ' [' + i + '] ' + x + ' vs ' + b[i])); };
const throwsLike = (assert, fn, re) => assert.throws(fn, e => re.test(e.message) && !/\n\s+at /.test(e.message));

module.exports = (t, assert) => {
  t('edit-tree: tree.list', () => {
    const d = mkDoc(), L = tree.state['tree.list'](d);
    assert.equal(L.error, null);
    assert.deepEqual(L.bones.map(b => b.path), ['basis', 'basis/body', 'basis/body/turret', 'basis/body/turret/gun', 'basis/body/wheel1']);
    const tu = L.bones[2], gun = L.bones[3];
    assert.equal(tu.kind, 'revolute'); assert.equal(tu.mesh, 'turret.ply'); assert.deepEqual(tu.volumes, ['basis/body/turret/tower']);
    assert.equal(gun.lods, 2); assert.equal(gun.mesh, 'gun.ply'); assert.equal(gun.line, 17); assert.equal(tu.index, 0); assert.equal(tu.siblings, 2);
    assert.equal(L.volumes.length, 3); assert.equal(L.obstacles[0].name, 'o1'); assert.deepEqual(L.skeleton.sequences, ['turn']);
    assert.ok(JSON.stringify(L).length > 10, 'JSON only');
  });

  t('edit-tree: bone.get (local, world, Euler, metres, joint fields)', () => {
    const d = mkDoc(), g = tree.state['bone.get'](d, { bone: 'gun' });
    assert.equal(g.path, 'basis/body/turret/gun');
    near(assert, g.local, [0, 1, 0, -1, 0, 0, 0, 0, 1, 25, 0, 5]);
    near(assert, g.world, mdl.worldMatrix(model(d), 'gun'));
    near(assert, g.euler, [90, 0, 0], 'yaw 90'); near(assert, g.scale, [1, 1, 1]); near(assert, g.positionM, [1.25, 0, 0.25], 'metres');
    assert.equal(g.lod.entries.length, 2); assert.equal(g.lod.entries[1].file, 'gun_lod1.ply');
    const tu = tree.state['bone.get'](d, { bone: 'turret' });
    assert.equal(tu.type, 'revolute'); assert.deepEqual(tu.limits, [-180, 180]); assert.equal(tu.speed, 0.5);
    const b = tree.state['bone.get'](d, { bone: 'basis' }); assert.equal(b.mirrored, true, 'basis flips Y');
    assert.equal(tree.state['bone.get'](d, { bone: 'body' }).mesh.flags.NoCastShadows, true);
    throwsLike(assert, () => tree.state['bone.get'](d, { bone: 'nope' }), /There is no bone "nope"/);
  });

  t('edit-tree: Euler round trip', () => {
    for (const e of [[30, 20, 10], [-120, 45, 170], [0, 0, 0], [90, 0, 0]]) {
      const m = tree._t.compose([1, 2, 3], e, [1, 2, 0.5]), d = tree._t.decompose(m);
      near(assert, d.euler, e, 'euler ' + e); near(assert, d.scale, [1, 2, 0.5]); near(assert, d.position, [1, 2, 3]);
    }
  });

  t('edit-tree: bone.add child, sibling, from mesh, new skeleton; refusals', () => {
    const d = mkDoc(), before = text(d);
    let r = run(d, 'bone.add', { parent: 'wheel1' });
    assert.equal(r.info.bone, 'basis/body/wheel1/bone0');
    let m = kept(assert, before, text(d));
    assert.ok(m.bones.some(b => b.path === 'basis/body/wheel1/bone0'));
    assert.ok(text(d).includes('\t\t\t\t{bone "bone0"}\r\n\t\t\t}'), 'own line, child indent');
    const b2 = text(d);
    r = run(d, 'bone.add', { after: 'wheel1', name: 'wheel2', position: [5, 10, 0] });
    m = kept(assert, b2, text(d));
    assert.deepEqual(m.bones.find(b => b.name === 'wheel2').matrix.slice(9), [5, 10, 0]);
    assert.equal(r.info.bone, 'basis/body/wheel2');
    assert.ok(text(d).includes('\t\t\t{bone "wheel2"\r\n\t\t\t\t{Position 5\t10\t0}\r\n\t\t\t}'));
    r = run(d, 'bone.add', { parent: 'body', mesh: 'parts/hatch.ply', type: 'revolute' });
    m = model(d); const h = m.bones.find(b => b.name === 'hatch');
    assert.ok(h && h.type === 'revolute' && h.views[0].file === 'parts/hatch.ply');
    run(d, 'bone.add', { parent: 'body', mesh: 'hatch.ply' }); assert.ok(model(d).bones.some(b => b.name === 'hatch0'), 'mesh name taken: hatch0');
    throwsLike(assert, () => run(d, 'bone.add', { parent: 'body', name: 'GUN' }), /already a bone named "GUN"/);
    throwsLike(assert, () => run(d, 'bone.add', { parent: 'body', name: 'a.b' }), /dot/);
    throwsLike(assert, () => run(d, 'bone.add', { parent: 'body', name: 'a"b' }), /quotes/);
    throwsLike(assert, () => run(d, 'bone.add', { parent: 'nope' }), /no bone "nope"/);
    const e = mkDoc('; empty model\r\n{Volume "v"\r\n\t{Box 1 1 1}\r\n}\r\n');
    run(e, 'bone.add', {});
    const me = model(e); assert.equal(me.bones[0].name, 'basis'); assert.ok(text(e).startsWith('; empty model\r\n{Skeleton\r\n\t{Bone "basis"}\r\n}\r\n{Volume'));
  });

  t('edit-tree: bone.rename follows volumes and animations, lists .def mentions', () => {
    const d = mkDoc(), before = text(d);
    const r = run(d, 'bone.rename', { bone: 'turret', name: 'tower2' });
    const m = kept(assert, before, text(d), l => /"turret"/.test(l));
    assert.ok(m.bones.some(b => b.path === 'basis/body/tower2/gun'));
    assert.equal(m.volumes.find(v => v.name === 'tower').bone, 'basis/body/tower2');
    assert.deepEqual(anm.parse(d.files.get('resource/entity/t/turn.anm').bytes).bones, ['tower2', 'gun']);
    assert.deepEqual(r.info.anm, ['resource/entity/t/turn.anm']); assert.equal(r.info.defMentions[0].line, 2);
    const ab = d.files.get('resource/entity/t/turn.anm').bytes; assert.equal(ab.length, ANM.length + 0, 'same name length: same size');
    throwsLike(assert, () => run(d, 'bone.rename', { bone: 'tower2', name: 'Body' }), /already a bone named/);
    throwsLike(assert, () => run(d, 'bone.rename', { bone: 'tower2', name: '' }), /needs a name/);
    run(d, 'bone.rename', { bone: 'gun', name: 'cannon', anm: false });
    assert.deepEqual(anm.parse(d.files.get('resource/entity/t/turn.anm').bytes).bones, ['tower2', 'gun'], 'anm: false leaves animations');
  });

  t('edit-tree: bone.delete branch with volumes; refusing the root', () => {
    const d = mkDoc(), before = text(d);
    const r = run(d, 'bone.delete', { bone: 'turret' });
    const m = kept(assert, before, text(d), l => /^\t\t\t\t|^\t\t\t\{bone revolute|"tower"|"barrel"|\{Cylinder|\{Bone "turret"|\{Bone "gun"|\{Box 20|^\t\{Position 1|^\}$|^\t\t\t\}$/.test(l));
    assert.deepEqual(m.bones.map(b => b.name), ['basis', 'body', 'wheel1']);
    assert.deepEqual(m.volumes.map(v => v.name), ['hull']);
    assert.deepEqual(r.info.volumes.deleted.sort(), ['barrel', 'tower']);
    assert.ok(text(d).includes('{Obstacle "o1"'));
    throwsLike(assert, () => run(d, 'bone.delete', { bone: 'basis' }), /root bone/);
  });

  t('edit-tree: bone.delete keeping children and moving volumes keeps world places', () => {
    const d = mkDoc(), m0 = model(d);
    const gw = mdl.worldMatrix(m0, 'gun'), tw = mdl.volumeWorld(m0, 'basis/body/turret/tower'), bw = mdl.volumeWorld(m0, 'basis/body/turret/gun/barrel');
    const r = run(d, 'bone.delete', { bone: 'turret', children: false, volumes: 'parent' });
    const m = model(d); assert.equal(m.error, null);
    assert.deepEqual(m.bones.map(b => b.path), ['basis', 'basis/body', 'basis/body/gun', 'basis/body/wheel1']);
    near(assert, mdl.worldMatrix(m, 'gun'), gw, 'gun world kept');
    near(assert, mdl.volumeWorld(m, 'basis/body/tower'), tw, 'tower world kept');
    near(assert, mdl.volumeWorld(m, 'basis/body/gun/barrel'), bw, 'barrel untouched');
    assert.deepEqual(r.info.volumes.moved, ['tower']);
    assert.ok(text(d).includes('\t\t\t{bone "gun" ; the gun \xE0\xE1\r\n'), 'comment bytes and own indent');
    const d2 = mkDoc(); run(d2, 'bone.delete', { bone: 'gun', volumes: 'keep' });
    assert.equal(model(d2).volumes.find(v => v.name === 'barrel').orphan, true);
  });

  t('edit-tree: bone.move keeps the world place; cycles refused', () => {
    const d = mkDoc(), before = text(d), m0 = model(d), gw = mdl.worldMatrix(m0, 'gun');
    const r = run(d, 'bone.move', { bone: 'gun', parent: 'wheel1' });
    assert.equal(r.info.bone, 'basis/body/wheel1/gun');
    const m = kept(assert, before, text(d), l => /^\t\t\t\t\t|\{bone "gun"|^\t\t\t\t\}$|\t\t\t\t\{Position 5/.test(l));
    near(assert, mdl.worldMatrix(m, 'gun'), gw, 'world kept');
    assert.ok(/\t\t\t\t\{bone "gun" ; the gun \xE0\xE1\r\n\t\t\t\t\t\{Matrix34/.test(text(d)), 'indent re-based');
    throwsLike(assert, () => run(d, 'bone.move', { bone: 'body', parent: 'gun' }), /inside itself/);
    throwsLike(assert, () => run(d, 'bone.move', { bone: 'basis', parent: 'body' }), /inside itself|root bone/);
    const r2 = run(d, 'bone.move', { bone: 'turret', parent: 'body', index: 0 }); assert.ok(r2.info.unchanged && !Object.keys(r2.files).length, 'no change, no file');
    run(d, 'bone.move', { bone: 'gun', parent: 'body', index: 0, keepWorld: false });
    const m2 = model(d); assert.deepEqual(m2.bones.find(b => b.name === 'body').children, ['basis/body/gun', 'basis/body/turret', 'basis/body/wheel1']);
  });

  t('edit-tree: bone.up / bone.down', () => {
    const d = mkDoc(), before = text(d);
    run(d, 'bone.up', { bone: 'wheel1' });
    const m = kept(assert, before, text(d), l => /wheel1|\{Position 5|^\t\t\t\}$/.test(l));
    assert.deepEqual(m.bones.find(b => b.name === 'body').children, ['basis/body/wheel1', 'basis/body/turret']);
    throwsLike(assert, () => run(d, 'bone.up', { bone: 'wheel1' }), /already the first/);
    run(d, 'bone.down', { bone: 'wheel1' }); assert.equal(text(d), before, 'down again: bytes as they were');
    throwsLike(assert, () => run(d, 'bone.down', { bone: 'wheel1' }), /already the last/);
  });

  t('edit-tree: bone.duplicate with volumes, names _0', () => {
    const d = mkDoc(), before = text(d);
    const r = run(d, 'bone.duplicate', { bone: 'turret' });
    const m = kept(assert, before, text(d));
    assert.deepEqual(r.info.names, { turret: 'turret_0', gun: 'gun_0' });
    assert.ok(m.bones.some(b => b.path === 'basis/body/turret_0/gun_0'));
    const v = m.volumes.find(x => x.name === 'tower_0'); assert.ok(v && v.bone === 'basis/body/turret_0');
    assert.equal(m.volumes.find(x => x.name === 'barrel_0').bone, 'basis/body/turret_0/gun_0');
    near(assert, mdl.volumeWorld(m, v.id), mdl.volumeWorld(m, 'basis/body/turret/tower'), 'copy sits on the original');
    const names = m.bones.map(b => b.name.toLowerCase()); assert.equal(new Set(names).size, names.length, 'unique names');
    run(d, 'bone.duplicate', { bone: 'turret', branch: false, volumes: false });
    const m2 = model(d), t1 = m2.bones.find(b => b.name === 'turret_1'); assert.ok(t1 && !t1.children.length, 'bone only');
    throwsLike(assert, () => run(d, 'bone.duplicate', { bone: 'basis' }), /one root/);
  });

  t('edit-tree: bone.copy and bone.paste (next, nested), bad text refused', () => {
    const d = mkDoc(), c = tree.state['bone.copy'](d, { bone: 'turret' });
    assert.ok(c.text.startsWith('{bone revolute "turret"\r\n\t{limits') && /\{bone "gun"/.test(c.text));
    const c1 = tree.state['bone.copy'](d, { bone: 'turret', branch: false }); assert.ok(!/gun/.test(c1.text), 'bone only: no child');
    const before = text(d);
    const r = run(d, 'bone.paste', { bone: 'wheel1', text: c.text, as: 'nested' });
    const m = kept(assert, before, text(d));
    assert.deepEqual(r.info.bones, ['basis/body/wheel1/turret_0']);
    assert.ok(m.bones.some(b => b.path === 'basis/body/wheel1/turret_0/gun_0'));
    assert.ok(text(d).includes('\t\t\t\t{bone revolute "turret_0"\r\n\t\t\t\t\t{limits'), 'indent at the new depth');
    run(d, 'bone.paste', { bone: 'wheel1', text: '{bone "a"}\n{bone "b" {Position 1 2 3}}', as: 'next' });
    const m2 = model(d); const kids = m2.bones.find(b => b.name === 'body').children;
    assert.deepEqual(kids.slice(-2), ['basis/body/a', 'basis/body/b']);
    assert.ok(!/[^\r]\n/.test(text(d)), 'pasted LF became CRLF');
    throwsLike(assert, () => run(d, 'bone.paste', { bone: 'wheel1', text: '{Volume "x"}' }), /bone \.\.\} blocks|bone block/);
    throwsLike(assert, () => run(d, 'bone.paste', { bone: 'wheel1', text: '{bone "x"' }), /not a bone block/);
    throwsLike(assert, () => run(d, 'bone.paste', { bone: 'wheel1', text: '' }), /nothing to paste/);
  });

  t('edit-tree: setMatrix local/world, place, nudge, round, mirror', () => {
    const d = mkDoc(), before = text(d);
    const W = [1, 0, 0, 0, 1, 0, 0, 0, 1, 100, 50, 25];
    run(d, 'bone.setMatrix', { bone: 'gun', matrix: W, space: 'world' });
    let m = kept(assert, before, text(d), l => /^\t\t\t\t\t\t/.test(l));
    near(assert, mdl.worldMatrix(m, 'gun'), W, 'world set');
    const b2 = text(d);
    run(d, 'bone.place', { bone: 'turret', euler: [30, 0, 0] });
    m = kept(assert, b2, text(d), l => /^\t\t\t\t\{Position 10/.test(l));
    const g = tree.state['bone.get'](d, { bone: 'turret' }); near(assert, g.euler, [30, 0, 0]); near(assert, g.position, [10, 0, 30], 'position kept');
    assert.ok(/\{Orientation\r\n\t\t\t\t\t0\.866025/.test(text(d)), 'Orientation inserted before Position: ' + text(d).slice(text(d).indexOf('turret'), text(d).indexOf('turret') + 120));
    run(d, 'bone.place', { bone: 'wheel1', position: [1, 2, 3] }); assert.ok(text(d).includes('\t\t\t\t{Position 1\t2\t3}'), 'only numbers that change');
    run(d, 'bone.place', { bone: 'wheel1', position: [20, 0, 0], space: 'world' });
    near(assert, mdl.worldMatrix(model(d), 'wheel1').slice(9), [20, 0, 0]);
    const d3 = mkDoc();
    run(d3, 'bone.nudge', { bone: 'wheel1', move: [1, 0, 0] }); assert.ok(text(d3).includes('{Position 6\t-10\t0}'));
    run(d3, 'bone.nudge', { bone: 'wheel1', rotate: [0, 0, 90] }); near(assert, tree.state['bone.get'](d3, { bone: 'wheel1' }).euler, [90, 0, 0]);
    run(d3, 'bone.nudge', { bone: 'wheel1', scale: [2, 2, 2] }); near(assert, tree.state['bone.get'](d3, { bone: 'wheel1' }).scale, [2, 2, 2]);
    throwsLike(assert, () => run(d3, 'bone.nudge', { bone: 'wheel1', scale: [0, 1, 1] }), /scale of 0/);
    const d4 = mkDoc(MDL.replace('\t\t\t\t\t\t0\t1\t0', '\t\t\t\t\t\t0.0001\t0.9999\t0'));
    const b4 = text(d4); run(d4, 'bone.round', { bone: 'gun' });
    kept(assert, b4, text(d4), l => l === '\t\t\t\t\t\t0.0001\t0.9999\t0');
    assert.ok(text(d4).includes('\t\t\t\t\t\t0\t1\t0\r\n\t\t\t\t\t\t-1\t0\t0\r\n\t\t\t\t\t\t0\t0\t1\r\n\t\t\t\t\t\t25\t0\t5'), 'rounded, position untouched');
    const d5 = mkDoc(); run(d5, 'bone.mirror', { bone: 'wheel1' }); assert.ok(text(d5).includes('{Position 5\t10\t0}'), 'mirror across y');
    run(d5, 'bone.mirror', { bone: 'gun' }); near(assert, model(d5).bones.find(b => b.name === 'gun').matrix, [0, -1, 0, 1, 0, 0, 0, 0, 1, 25, 0, 5]);
    throwsLike(assert, () => run(d5, 'bone.setMatrix', { bone: 'gun', matrix: [1, 2] }), /12 numbers/);
  });

  t('edit-tree: bone.set joint type, limits, speed, visibility, parameters, colour, terminator', () => {
    const d = mkDoc(), before = text(d);
    let r = run(d, 'bone.set', { bone: 'turret', type: 'none' });
    let m = kept(assert, before, text(d), l => /revolute|\{limits|\{speed/.test(l));
    const tu = m.bones.find(b => b.name === 'turret'); assert.ok(tu.type === null && tu.limits === null && tu.speed === null);
    assert.deepEqual(r.info.removed.sort(), ['Limits', 'Speed']);
    throwsLike(assert, () => run(d, 'bone.set', { bone: 'turret', limits: [0, 30] }), /only on a joint/);
    run(d, 'bone.set', { bone: 'turret', type: 'socket', limits: [-10, 20], speed: 2 });
    m = model(d); const t2 = m.bones.find(b => b.name === 'turret'); assert.ok(t2.type === 'socket' && t2.limits.join() === '-10,20' && t2.speed === 2);
    throwsLike(assert, () => run(d, 'bone.set', { bone: 'turret', speed: 0 }), /Zero speed/);
    throwsLike(assert, () => run(d, 'bone.set', { bone: 'turret', wobble: 1 }), /Unknown bone field/);
    const b2 = text(d);
    r = run(d, 'bone.set', { bone: 'wheel1', visibility: 1, params: '"ID=wheel;WheelRadius=0.4;', color: '#ff8000', terminator: true });
    m = kept(assert, b2, text(d));
    const w = m.bones.find(b => b.name === 'wheel1');
    assert.equal(w.visibility, 1); assert.equal(w.params, 'ID=wheel;WheelRadius=0.4;'); assert.equal(w.paramMap.WheelRadius, '0.4');
    assert.ok(text(d).includes('{Color 0xff8000}')); assert.ok(w.flags.includes('Terminator'));
    const g = tree.state['bone.get'](d, { bone: 'wheel1' }); assert.equal(g.color, '#ff8000'); assert.equal(g.terminator, true);
    const b3 = text(d);
    run(d, 'bone.set', { bone: 'wheel1', visibility: null, params: null, color: null, terminator: false });
    kept(assert, b3, text(d), l => /Visibility|Parameters|Color|Terminator/.test(l));
    assert.ok(!/Visibility|Parameters|Color|Terminator/.test(text(d).slice(text(d).indexOf('wheel1'), text(d).indexOf('wheel1') + 80)));
  });

  t('edit-tree: bone.mesh, LOD add / remove / off', () => {
    const d = mkDoc(), before = text(d);
    run(d, 'bone.mesh', { bone: 'body', file: 'hull.ply', flags: { NoCastShadows: false, Ground: true }, layer: 'WaterScissor' });
    let m = kept(assert, before, text(d), l => /body\.ply/.test(l));
    assert.ok(text(d).includes('\t\t\t{VolumeView "hull.ply" {Ground} {Layer WaterScissor}}\r\n'), text(d).split('\r\n')[10]);
    run(d, 'bone.mesh', { bone: 'wheel1', file: 'wheel.ply' });
    m = model(d); assert.equal(m.bones.find(b => b.name === 'wheel1').views[0].file, 'wheel.ply');
    run(d, 'bone.mesh', { bone: 'wheel1', file: null }); assert.equal(model(d).bones.find(b => b.name === 'wheel1').views.length, 0, 'mesh removed (file stays)');
    throwsLike(assert, () => run(d, 'bone.mesh', { bone: 'wheel1', flags: { Ground: true } }), /no mesh/);
    const b2 = text(d);
    run(d, 'bone.lod.add', { bone: 'turret', file: 'turret_lod1.ply' });
    m = kept(assert, b2, text(d), l => /turret\.ply/.test(l));
    const L = m.bones.find(b => b.name === 'turret').views[0];
    assert.equal(L.kind, 'LODView'); assert.deepEqual(L.lods.map(x => x.file), ['turret.ply', 'turret_lod1.ply']);
    run(d, 'bone.lod.add', { bone: 'gun', file: 'gun_lod2.ply' }); run(d, 'bone.lod.off', { bone: 'gun', on: true });
    let G = model(d).bones.find(b => b.name === 'gun').views[0]; assert.equal(G.lods.length, 3); assert.equal(G.off, true);
    run(d, 'bone.lod.add', { bone: 'gun', file: 'gun_lod3.ply' });
    G = model(d).bones.find(b => b.name === 'gun').views[0]; assert.equal(G.lods[3].file, 'gun_lod3.ply', 'added before OFF');
    run(d, 'bone.lod.remove', { bone: 'gun', index: 0 }); run(d, 'bone.lod.off', { bone: 'gun', on: false });
    G = model(d).bones.find(b => b.name === 'gun').views[0]; assert.deepEqual(G.lods.map(x => x.file), ['gun_lod1.ply', 'gun_lod2.ply', 'gun_lod3.ply']); assert.equal(G.off, false);
    run(d, 'bone.mesh', { bone: 'gun', lod: 1, flags: { NoGroupMesh: true } });
    assert.ok(text(d).includes('{VolumeView "gun_lod2.ply" {NoGroupMesh}}'));
    throwsLike(assert, () => run(d, 'bone.lod.remove', { bone: 'gun', index: 9 }), /no level of detail number 9/);
  });

  t('edit-tree: sequences on a bone and on the skeleton', () => {
    const d = mkDoc(), before = text(d);
    run(d, 'bone.seq.add', { bone: 'turret', name: 'open', file: 'open.anm', speed: 2, autostart: true });
    let m = kept(assert, before, text(d));
    let s = m.sequences.find(x => x.name === 'open'); assert.ok(s && s.bone === 'basis/body/turret' && s.file === 'open.anm' && s.speed === 2 && s.autostart);
    assert.ok(text(d).includes('\t\t\t\t{Animation\r\n\t\t\t\t\t{Sequence "open" {File "open.anm"} {Speed 2} {Autostart}}\r\n\t\t\t\t}\r\n\t\t\t\t{bone "gun"'), 'before the child bones');
    run(d, 'bone.seq.add', { bone: 'turret', name: 'close', store: true });
    run(d, 'bone.seq.set', { bone: 'turret', sequence: 'open', fields: { name: 'opening', speed: 1.25, autostart: false, resume: true } });
    m = model(d); s = m.sequences.find(x => x.name === 'opening'); assert.ok(s && s.speed === 1.25 && !s.autostart && s.resume);
    throwsLike(assert, () => run(d, 'bone.seq.set', { bone: 'turret', sequence: 'close', fields: { name: 'OPENING' } }), /already a sequence/);
    run(d, 'bone.seq.remove', { bone: 'turret', sequence: 'opening' }); run(d, 'bone.seq.remove', { bone: 'turret', sequence: 'close' });
    assert.equal(text(d), before, 'add then remove: bytes as they were');
    run(d, 'bone.seq.add', { bone: null, name: 'idle', file: 'idle.anm' });
    assert.ok(text(d).includes('\t\t{sequence "turn" {file "turn.anm"} {speed 1.5}}\r\n\t\t{Sequence "idle" {File "idle.anm"}}\r\n\t}'));
    throwsLike(assert, () => run(d, 'bone.seq.add', { bone: null, name: 'TURN' }), /already a sequence/);
    const e = mkDoc(MDL.replace('{speed 1.5}}', '{speed 1.5} {events {3 "x"}}}'));
    assert.equal(tree.state['tree.sequences'](e).sequences[0].events, true);
    run(e, 'bone.seq.events.remove', { bone: null, sequence: 'turn' }); assert.ok(!/events/.test(text(e)));
    throwsLike(assert, () => run(e, 'bone.seq.events.remove', { bone: null, sequence: 'turn' }), /no events/);
  });

  t('edit-tree: every op is registered with apply; states are JSON', () => {
    for (const [k, o] of Object.entries(tree.ops)) { assert.ok(/^(bone|tree)\./.test(k), k); assert.equal(typeof o.apply, 'function', k); }
    const d = mkDoc();
    for (const k of Object.keys(tree.state)) { const v = tree.state[k](d, { bone: 'gun' }); assert.deepEqual(JSON.parse(JSON.stringify(v)), v, k); }
    const bad = mkDoc('{Skeleton {bone "a"'); assert.ok(tree.state['tree.list'](bad).error, 'unreadable model: error in the list');
    throwsLike(assert, () => run(bad, 'bone.add', { parent: 'a' }), /cannot be read/);
  });
};

if (require.main === module) {
  const assert = require('assert'); let fail = 0, n = 0;
  module.exports((name, fn) => { try { fn(); n++; console.log('ok   ' + name); } catch (e) { fail++; console.log('FAIL ' + name + '\n' + (e.stack || e.message)); } }, assert);
  console.log(fail ? `FAIL ${fail}` : `PASS ${n}`);
  process.exit(fail ? 1 : 0);
}

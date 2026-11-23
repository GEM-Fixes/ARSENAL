// model/edit/vol tests, loaded by test.js: (t, assert) => ...   standalone: node tools/lib/test/model-edit-vol.test.js (last line PASS)
// Synthetic model made here: a .mdl with box, cylinder, sphere and polyhedron volumes, an obstacle and an area, a box
// mesh (.ply) on one bone, a .vol from vol.fromBox. Every op runs on a small stand-in document (contract shape: files
// Map rel -> { rel, kind, bytes }, read(rel)); after each op the .mdl parses again, the bytes outside the changed block
// are the same, and refusals change nothing. When tools/lib/model/edit/core.js exists one op also runs through it.
// Author: Imperator_Aug (ARSENAL, ia-3d0c3e40)
'use strict';
const fs = require('fs'), path = require('path');
const E = require('../model/edit/vol'), M = require('../model/mdl'), V = require('../model/vol'), P = require('../model/ply');

const L = [
  '; test model \xCF\xF0\xE8',
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
  '\t\t\t{bone "gun"}',
  '\t\t}',
  '\t}',
  '}',
  '{Volume "hull"',
  '\t{Polyhedron "hull.vol"}',
  '\t{Bone "body"}',
  '\t{Tags "body"}',
  '\t{Component "body"}',
  '\t{Thickness 45 {front 80} {rear 20}}',
  '}',
  '{Volume "turret1"',
  '\t{Box 10 6 4}',
  '\t{Bone "turret"}',
  '\t{Position 1\t2\t3}',
  '}',
  '{Volume "barrel"',
  '\t{Cylinder 1 30}',
  '\t{Bone "gun"}',
  '\t{Orientation 0 0 1 0 1 0 -1 0 0}',
  '}',
  '{Volume "ball"',
  '\t{Sphere 2}',
  '\t{Bone "body"}',
  '}',
  '{Obstacle "body01"',
  '\t{Obb2',
  '\t\t{Center 1 2}',
  '\t\t{Extent 30 10}',
  '\t\t{Axis 1 0}',
  '\t}',
  '\t{Rotate}',
  '}',
  '{Area "inside"',
  '\t{Polygon2',
  '\t\t{Radius 0}',
  '\t\t{Vertex 0 0}',
  '\t\t{Vertex 10 0}',
  '\t\t{Vertex 0 10}',
  '\t}',
  '}',
  '',
];
const MDL = Buffer.from(L.join('\r\n'), 'latin1');
const DIR = 'resource/entity/vt/';

// a box mesh 20 x 40 x 10 from (0,0,0): 8 points, 12 triangles, the minimal layout viewer.test.js uses
function boxPly() {
  const B = (...a) => Buffer.concat(a.map(x => (Buffer.isBuffer(x) ? x : Buffer.from(x, 'latin1'))));
  const i32 = (...a) => Buffer.concat(a.map(v => { const b = Buffer.alloc(4); b.writeInt32LE(v); return b; }));
  const u32 = v => { const b = Buffer.alloc(4); b.writeUInt32LE(v >>> 0); return b; };
  const u16 = (...a) => Buffer.concat(a.map(v => { const b = Buffer.alloc(2); b.writeUInt16LE(v); return b; }));
  const f32 = (...a) => Buffer.concat(a.map(v => { const b = Buffer.alloc(4); b.writeFloatLE(v); return b; }));
  const s8 = x => B(Buffer.from([x.length]), x);
  const pts = []; for (const z of [0, 10]) for (const y of [0, 40]) for (const x of [0, 20]) pts.push([x, y, z]);
  const quads = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]];
  const idx = []; for (const [a, b, c, d] of quads) idx.push(a, b, c, a, c, d);
  return B('EPLY', 'BNDS', f32(0, 0, 0, 20, 40, 10), 'MESH', u32(0x112), i32(0, 12), u32(0x004), s8('tex/a.dds'),
    'VERT', i32(8), u16(32, 7), ...pts.map(p => f32(p[0], p[1], p[2], 0, 0, 1, 0, 0)), 'INDX', i32(36), u16(...idx));
}

const KIND = rel => (/\.mdl$/i.test(rel) ? 'mdl' : /\.vol$/i.test(rel) ? 'vol' : /\.ply$/i.test(rel) ? 'ply' : 'other');
const PARSE = { mdl: M.parse, vol: V.parse, ply: P.parse };
// stand-in document (contract shape) + apply that records undo like the core would
function mkDoc(extra) {
  const files = new Map(), put = (rel, b) => files.set(rel, { rel, kind: KIND(rel), bytes: b, bytes0: b, from: 'game', dirty: false });
  put(DIR + 'vt.mdl', MDL); put(DIR + 'body.ply', boxPly()); put(DIR + 'hull.vol', V.write(V.fromBox([40, 20, 10])));
  for (const [k, b] of Object.entries(extra || {})) put(k, b);
  const doc = { mdl: DIR + 'vt.mdl', files, rev: 0, undo: [],
    read(rel) { const f = files.get(rel); return f ? PARSE[f.kind](f.bytes) : null; },
    apply(name, args) {
      const op = E.ops[name]; if (!op) throw new Error('no op ' + name);
      const r = op.apply(doc, args), old = {};
      for (const [rel, b] of Object.entries(r.files)) {
        old[rel] = files.has(rel) ? files.get(rel).bytes : undefined;
        if (b === null) files.delete(rel); else if (files.has(rel)) Object.assign(files.get(rel), { bytes: b, dirty: true }); else files.set(rel, { rel, kind: KIND(rel), bytes: b, bytes0: null, from: 'new', dirty: true });
      }
      doc.undo.push(old); doc.rev++;
      return { rev: doc.rev, changed: Object.keys(r.files), info: r.info };
    } };
  return doc;
}
const mdlOf = doc => doc.files.get(doc.mdl).bytes;
// bytes outside [start, end) of `before` are the same in `after`
function sameOutside(assert, before, after, start, end, what) {
  assert.ok(before.subarray(0, start).equals(after.subarray(0, start)), what + ': bytes before the block kept');
  const tail = before.length - end;
  assert.ok(before.subarray(end).equals(after.subarray(after.length - tail)), what + ': bytes after the block kept');
}
const nodeSpan = (buf, pick) => { const m = M.parse(buf), n = pick(m).node; return [n.start, n.end]; };
const vSpan = (buf, name) => nodeSpan(buf, m => m.volumes.find(v => v.name === name));
const near = (a, b, eps = 1e-4) => a.length === b.length && a.every((x, i) => Math.abs(x - b[i]) < eps);
function refused(assert, doc, op, args, re) {
  const before = new Map([...doc.files].map(([k, f]) => [k, f.bytes]));
  assert.throws(() => doc.apply(op, args), re, op + ' ' + JSON.stringify(args));
  assert.strictEqual(E.ops[op].check(doc, args) !== null, true, op + ' check gives the reason');
  for (const [k, b] of before) assert.ok(doc.files.get(k).bytes === b, op + ': nothing changed in ' + k);
}

module.exports = (t, assert) => {
  t('edit-vol: list state', () => {
    const doc = mkDoc(), s = E.state['vol.list'](doc, {});
    assert.deepStrictEqual(s.volumes.map(v => [v.id, v.kind]), [['body/hull', 'polyhedron'], ['body/turret/turret1', 'box'], ['body/turret/gun/barrel', 'cylinder'], ['body/ball', 'sphere']]);
    const h = s.volumes[0];
    assert.deepStrictEqual(h.thickness.list, [80, 45, 45, 45, 20, 45], 'sides front top left right rear bottom');
    assert.deepStrictEqual(h.tags, ['body']); assert.strictEqual(h.component, 'body'); assert.strictEqual(h.fileRel, DIR + 'hull.vol');
    assert.strictEqual(s.bones.find(b => b.path === 'body').mesh, DIR + 'body.ply');
    assert.deepStrictEqual(E.state['vol.list'](doc, { bone: 'body/turret' }).volumes.map(v => v.name), ['turret1']);
    assert.deepStrictEqual(E.state['vol.list'](doc, { q: 'cyl' }).volumes.map(v => v.name), ['barrel']);
    const g = E.state['vol.get'](doc, { volume: 'body/hull' });
    assert.strictEqual(g.vol.triangles, 12); assert.strictEqual(g.vol.sides[1], 2); assert.deepStrictEqual(g.vol.users, ['body/hull']);
    assert.ok(near(g.world.slice(9), [0, 0, 10]), 'world');
    const o = E.state['obst.list'](doc);
    assert.strictEqual(o.obstacles[0].id, 'obstacle:0'); assert.ok(o.obstacles[0].rotate); assert.deepStrictEqual(o.areas[0].vertices, [[0, 0], [10, 0], [0, 10]]);
  });

  t('edit-vol: add box / cylinder / sphere / polyhedron', () => {
    const doc = mkDoc(), b0 = mdlOf(doc);
    let r = doc.apply('vol.add', { bone: 'body/turret', kind: 'box', size: [2, 3, 4], matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1, 5, 0, 0] });
    assert.strictEqual(r.info.id, 'body/turret/volume0', 'SOEdit default name volume0');
    let m = M.parse(mdlOf(doc)); assert.strictEqual(m.error, null);
    let v = M.findVolume(m, 'body/turret/volume0'); assert.deepStrictEqual(v.size, [2, 3, 4]); assert.deepStrictEqual(v.matrix.slice(9), [5, 0, 0]);
    assert.ok(mdlOf(doc).subarray(0, vSpan(b0, 'ball')[1]).equals(b0.subarray(0, vSpan(b0, 'ball')[1])), 'everything up to the last volume kept');
    doc.apply('vol.add', { bone: 'gun', name: 'muzzle', kind: 'cylinder', radius: 1, length: 4 });
    doc.apply('vol.add', { bone: 'body', name: 'tip', kind: 'sphere', radius: 0.5 });
    doc.apply('vol.add', { bone: 'body', kind: 'polyhedron', file: 'hull.vol' });
    r = doc.apply('vol.add', { bone: 'body', name: 'plate', kind: 'polyhedron', fromBox: true, size: [1, 2, 3] });
    assert.ok(doc.files.has(DIR + 'plate.vol') && doc.files.get(DIR + 'plate.vol').from === 'new', 'new .vol next to the .mdl');
    const data = V.write(V.fromBox([3, 3, 3])).toString('base64');
    r = doc.apply('vol.add', { bone: 'body', name: 'imp', kind: 'polyhedron', data, file: 'imported' });
    assert.ok(doc.files.has(DIR + 'imported.vol'));
    m = M.parse(mdlOf(doc)); assert.strictEqual(m.error, null);
    assert.deepStrictEqual(m.volumes.slice(4).map(x => [x.id, x.kind, x.file]), [['body/turret/volume0', 'box', null], ['body/turret/gun/muzzle', 'cylinder', null],
      ['body/tip', 'sphere', null], ['body/hull0', 'polyhedron', 'hull.vol'], ['body/plate', 'polyhedron', 'plate.vol'], ['body/imp', 'polyhedron', 'imported.vol']]);
    assert.ok(/\r\n/.test(mdlOf(doc).toString('latin1')) && !/[^\r]\n/.test(mdlOf(doc).toString('latin1')), 'CRLF kept');
  });

  t('edit-vol: refusals change nothing', () => {
    const doc = mkDoc();
    refused(assert, doc, 'vol.add', { bone: 'body', name: 'HULL', kind: 'box', size: [1, 1, 1] }, /already a volume named "hull"/);
    refused(assert, doc, 'vol.add', { bone: 'body', kind: 'box', size: [1, 0, 1] }, /Width must be a number above zero/);
    refused(assert, doc, 'vol.add', { bone: 'nosuch', kind: 'box', size: [1, 1, 1] }, /no bone "nosuch"/);
    refused(assert, doc, 'vol.add', { bone: 'body', kind: 'cylinder', radius: -1, length: 2 }, /radius must be/);
    refused(assert, doc, 'vol.add', { bone: 'body', kind: 'polyhedron', file: 'none.vol' }, /not open/);
    refused(assert, doc, 'vol.add', { bone: 'body', kind: 'box', size: [1, 1, 1], name: 'a"b' }, /quotes/);
    refused(assert, doc, 'vol.rename', { volume: 'body/ball', name: 'barrel' }, /already a volume/);
    refused(assert, doc, 'vol.setShape', { volume: 'body/turret/turret1', size: [0, 1, 1] }, /above zero/);
    refused(assert, doc, 'vol.setBone', { volume: 'ball', bone: 'nobone' }, /no bone/);
    refused(assert, doc, 'vol.delete', { volume: 'nothere' }, /no volume "nothere"/);
    refused(assert, doc, 'vol.setMatrix', { volume: 'ball', matrix: [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3] }, /flat/);
    refused(assert, doc, 'vol.setThickness', { volume: 'ball', sides: { side: 3 } }, /not a side/);
    refused(assert, doc, 'vol.setThickness', { volume: 'ball', all: -2 }, /zero or more/);
    refused(assert, doc, 'vol.fit', { volume: 'body/turret/turret1' }, /no mesh/);
    refused(assert, doc, 'vol.transform', { volume: 'hull', scale: [2, 2, 2] }, /scale the file instead/);
    refused(assert, doc, 'vol.transform', { volume: 'barrel', scale: [2, 1, 1] }, /stays round/);
    refused(assert, doc, 'vol.toBox', { volume: 'ball' }, /not a polyhedron/);
    refused(assert, doc, 'obst.add', { type: 'obstacle', kind: 'Polygon2', vertices: [[0, 0], [1, 1]] }, /three points/);
    refused(assert, doc, 'obst.set', { id: 'area:5', name: 'x' }, /no area number 6/);
    // a second bone with the same name cannot hold a volume (the game links by the first name)
    const dup = mkDoc(); dup.files.get(dup.mdl).bytes = Buffer.from(MDL.toString('latin1').replace('{bone "gun"}', '{bone "body"}'), 'latin1');
    refused(assert, dup, 'vol.add', { bone: 'body/turret/body', kind: 'box', size: [1, 1, 1] }, /same name/);
  });

  t('edit-vol: delete, rename, duplicate, bone link', () => {
    let doc = mkDoc(), b0 = mdlOf(doc), [s, e] = vSpan(b0, 'ball');
    doc.apply('vol.delete', { volume: 'body/ball' });
    sameOutside(assert, b0, mdlOf(doc), s, e + 2, 'delete'); assert.ok(!M.parse(mdlOf(doc)).volumes.some(v => v.name === 'ball'));
    doc = mkDoc(); doc.apply('vol.delete', { volume: 'hull', dropFile: true });
    assert.ok(!doc.files.has(DIR + 'hull.vol'), 'only user: its .vol leaves the document');

    doc = mkDoc(); b0 = mdlOf(doc); [s, e] = vSpan(b0, 'turret1');
    const r = doc.apply('vol.rename', { volume: 'body/turret/turret1', name: 'turret_main' });
    assert.strictEqual(r.info.id, 'body/turret/turret_main'); sameOutside(assert, b0, mdlOf(doc), s, e, 'rename');

    doc = mkDoc(); b0 = mdlOf(doc); [s, e] = vSpan(b0, 'hull');
    const d = doc.apply('vol.duplicate', { volume: 'hull', name: 'hull2', bone: 'turret' });
    assert.strictEqual(d.info.id, 'body/turret/hull2');
    let m = M.parse(mdlOf(doc)), c = M.findVolume(m, 'hull2');
    assert.ok(mdlOf(doc).subarray(0, e).equals(b0.subarray(0, e)), 'original kept');
    assert.strictEqual(c.file, 'hull.vol'); assert.deepStrictEqual(c.tags, ['body']); assert.strictEqual(c.thickness.sides.front, 80); assert.strictEqual(c.bone, 'body/turret');
    assert.strictEqual(doc.apply('vol.duplicate', { volume: 'barrel' }).info.name, 'barrel0');

    doc = mkDoc(); b0 = mdlOf(doc); [s, e] = vSpan(b0, 'ball');
    assert.strictEqual(doc.apply('vol.setBone', { volume: 'ball', bone: 'body/turret/gun' }).info.id, 'body/turret/gun/ball');
    sameOutside(assert, b0, mdlOf(doc), s, e, 'set bone'); assert.strictEqual(M.findVolume(M.parse(mdlOf(doc)), 'ball').bone, 'body/turret/gun');
  });

  t('edit-vol: shape, matrix, position, orientation, transform, round', () => {
    let doc = mkDoc(), b0 = mdlOf(doc), [s, e] = vSpan(b0, 'turret1');
    doc.apply('vol.setShape', { volume: 'turret1', size: [12, 6, 4] });
    sameOutside(assert, b0, mdlOf(doc), s, e, 'box size'); assert.ok(/\{Box 12 6 4\}/.test(mdlOf(doc).toString('latin1')));
    doc.apply('vol.setShape', { volume: 'barrel', radius: 1.5 });
    assert.deepStrictEqual([M.findVolume(M.parse(mdlOf(doc)), 'barrel').radius, M.findVolume(M.parse(mdlOf(doc)), 'barrel').length], [1.5, 30]);
    doc.apply('vol.setShape', { volume: 'ball', kind: 'box', size: [1, 1, 1] });
    assert.strictEqual(M.findVolume(M.parse(mdlOf(doc)), 'ball').kind, 'box');
    doc.apply('vol.setShape', { volume: 'ball', kind: 'polyhedron', file: 'hull.vol' });
    assert.strictEqual(M.findVolume(M.parse(mdlOf(doc)), 'ball').file, 'hull.vol');

    doc = mkDoc(); b0 = mdlOf(doc); [s, e] = vSpan(b0, 'turret1');
    doc.apply('vol.setPosition', { volume: 'turret1', position: [7, 8, 9] });
    sameOutside(assert, b0, mdlOf(doc), s, e, 'position');
    assert.ok(/\{Position 7\t8\t9\}/.test(mdlOf(doc).toString('latin1')), 'the Position line keeps its form');
    doc.apply('vol.setOrientation', { volume: 'turret1', angles: [0, 0, 90] });
    let v = M.findVolume(M.parse(mdlOf(doc)), 'turret1');
    assert.ok(near(v.matrix, [0, 1, 0, -1, 0, 0, 0, 0, 1, 7, 8, 9]), 'turn 90 about Z: ' + v.matrix);
    doc.apply('vol.setMatrix', { volume: 'ball', matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1, 4, 5, 6] });
    assert.deepStrictEqual(M.findVolume(M.parse(mdlOf(doc)), 'ball').matrix.slice(9), [4, 5, 6]);

    doc = mkDoc();
    doc.apply('vol.transform', { volume: 'turret1', move: [1, 0, 0], rotate: [0, 0, 90], scale: [2, 1, 1] });
    v = M.findVolume(M.parse(mdlOf(doc)), 'turret1');
    assert.deepStrictEqual(v.size, [20, 6, 4], 'scale goes into the box size');
    assert.ok(near(v.matrix, [0, 1, 0, -1, 0, 0, 0, 0, 1, 2, 2, 3]), 'turned then moved: ' + v.matrix);

    doc = mkDoc(); doc.files.get(doc.mdl).bytes = Buffer.from(MDL.toString('latin1').replace('{Box 10 6 4}', '{Box 10.04 5.98 4}').replace('{Position 1\t2\t3}', '{Position 1.01\t2\t3}'), 'latin1');
    const r = doc.apply('vol.round', { step: 0.5 });
    v = M.findVolume(M.parse(mdlOf(doc)), 'turret1');
    assert.deepStrictEqual(v.size, [10, 6, 4]); assert.deepStrictEqual(v.matrix.slice(9), [1, 2, 3]); assert.deepStrictEqual(r.info.changed, ['body/turret/turret1']);
    refused(assert, doc, 'vol.round', { step: 0.5 }, /already on the step/);
  });

  t('edit-vol: thickness per side and whole, tags, component', () => {
    let doc = mkDoc(), b0 = mdlOf(doc), [s, e] = vSpan(b0, 'hull');
    doc.apply('vol.setThickness', { volume: 'hull', sides: { front: 90, left: 30 } });
    sameOutside(assert, b0, mdlOf(doc), s, e, 'thickness');
    assert.ok(/\{Thickness 45 \{front 90\} \{rear 20\} \{left 30\}\}/.test(mdlOf(doc).toString('latin1')), mdlOf(doc).toString('latin1'));
    let h = E.state['vol.list'](doc).volumes[0];
    assert.deepStrictEqual(h.thickness.list, [90, 45, 30, 45, 20, 45]);
    doc.apply('vol.setThickness', { volume: 'hull', all: 50, sides: { rear: null } });
    assert.deepStrictEqual(E.state['vol.list'](doc).volumes[0].thickness.list, [90, 50, 30, 50, 50, 50]);
    doc.apply('vol.setThickness', { volume: 'ball', sides: [10, 20, 30, 40, 50, 60] });
    h = E.state['vol.get'](doc, { volume: 'ball' });
    assert.deepStrictEqual(h.thickness.list, [10, 20, 30, 40, 50, 60]);
    doc.apply('vol.setThickness', { volume: 'turret1', all: 25 });
    assert.ok(/\{Thickness 25\}/.test(mdlOf(doc).toString('latin1')));

    doc = mkDoc(); b0 = mdlOf(doc); [s, e] = vSpan(b0, 'turret1');
    doc.apply('vol.setProps', { volume: 'turret1', tags: ['turret', 'armor'], component: 'turret', density: 2, material: 'steel' });
    sameOutside(assert, b0, mdlOf(doc), s, e, 'props');
    const v = M.findVolume(M.parse(mdlOf(doc)), 'turret1');
    assert.deepStrictEqual([v.tags, v.component, v.density, v.material], [['turret', 'armor'], 'turret', 2, 'steel']);
    doc.apply('vol.setProps', { volume: 'hull', tags: null, component: null });
    const hv = M.findVolume(M.parse(mdlOf(doc)), 'hull'); assert.strictEqual(hv.tags, null); assert.strictEqual(hv.component, null);
    refused(assert, doc, 'vol.setProps', { volume: 'hull', tags: ['two words'] }, /one plain word/);
  });

  t('edit-vol: fit to the bone mesh (VOL-10/12 done right), mesh volumes, hull', () => {
    let doc = mkDoc();
    doc.apply('vol.fit', { volume: 'ball', kind: 'box' });
    let v = M.findVolume(M.parse(mdlOf(doc)), 'ball');
    assert.strictEqual(v.kind, 'box'); assert.deepStrictEqual(v.size, [20, 40, 10]); assert.deepStrictEqual(v.matrix.slice(9), [10, 20, 5], 'centred on the mesh');
    doc.apply('vol.fit', { volume: 'ball', kind: 'cylinder', axis: 'y' });
    v = M.findVolume(M.parse(mdlOf(doc)), 'ball');
    assert.strictEqual(v.length, 40); assert.ok(Math.abs(v.radius - Math.hypot(10, 5)) < 1e-4); assert.deepStrictEqual(v.matrix.slice(0, 3), [0, 0, 1]);
    let r = doc.apply('vol.addFromMesh', { bone: 'body', how: 'sphere', name: 'round' });
    assert.ok(Math.abs(M.findVolume(M.parse(mdlOf(doc)), 'round').radius - Math.hypot(10, 20, 5)) < 1e-4);
    r = doc.apply('vol.addFromMesh', { bone: 'body', how: 'hull' });
    assert.strictEqual(r.info.triangles, 12); assert.strictEqual(r.info.file, DIR + 'body_hull.vol');
    const o = V.parse(doc.files.get(DIR + 'body_hull.vol').bytes);
    assert.strictEqual(o.error, null); assert.strictEqual(o.faces.length, 36); assert.deepStrictEqual(V.bounds(o), { min: [0, 0, 0], max: [20, 40, 10] });
    const tr = V.triangles(o), cen = [10, 20, 5];
    for (const t of tr) { const n = V.normal(t.p), d = (cen[0] - t.p[0]) * n[0] + (cen[1] - t.p[1]) * n[1] + (cen[2] - t.p[2]) * n[2]; assert.ok(d > 0, 'vanilla winding: normal points inside'); }
    const sides = [...o.sides].sort().join(''); assert.strictEqual(sides, '112233445566', 'two triangles per side');
    assert.strictEqual(M.findVolume(M.parse(mdlOf(doc)), 'body_hull').file, 'body_hull.vol');
    refused(assert, doc, 'vol.addFromMesh', { bone: 'turret', how: 'box' }, /no mesh/);
  });

  t('edit-vol: box <-> polyhedron, .vol transform, mirror, sides', () => {
    let doc = mkDoc();
    let r = doc.apply('vol.toPolyhedron', { volume: 'turret1' });
    assert.strictEqual(r.info.file, DIR + 'turret1.vol');
    let v = M.findVolume(M.parse(mdlOf(doc)), 'turret1'); assert.strictEqual(v.kind, 'polyhedron'); assert.deepStrictEqual(v.matrix.slice(9), [1, 2, 3]);
    doc.apply('vol.toBox', { volume: 'turret1' });
    v = M.findVolume(M.parse(mdlOf(doc)), 'turret1'); assert.deepStrictEqual(v.size, [10, 6, 4]); assert.deepStrictEqual(v.matrix.slice(9), [1, 2, 3]);
    r = doc.apply('vol.toPolyhedron', { volume: 'barrel', segments: 8 });
    const cyl = V.parse(doc.files.get(r.info.file).bytes); assert.strictEqual(cyl.faces.length / 3, 32); assert.strictEqual(cyl.error, null);

    doc = mkDoc();
    const v0 = V.parse(doc.files.get(DIR + 'hull.vol').bytes);
    doc.apply('vol.volTransform', { volume: 'hull', move: [5, 0, 0], scale: [2, 1, 1] });
    let o = V.parse(doc.files.get(DIR + 'hull.vol').bytes);
    assert.deepStrictEqual(V.bounds(o), { min: [-35, -10, -5], max: [45, 10, 5] }); assert.deepStrictEqual([...o.sides], [...v0.sides]);
    assert.ok(mdlOf(doc).equals(MDL), 'the .mdl is untouched by a .vol edit');
    doc.apply('vol.volTransform', { file: DIR + 'hull.vol', mirror: 'x' });
    o = V.parse(doc.files.get(DIR + 'hull.vol').bytes);
    const fr = V.triangles(o).filter(t => t.side === 1);
    assert.ok(fr.length === 2 && fr.every(t => t.p[0] > 0 && t.p[3] > 0 && t.p[6] > 0), 'after mirror x the front side is still at +X');
    for (const t of V.triangles(o)) { const n = V.normal(t.p), c = [5, 0, 0], d = (c[0] - t.p[0]) * n[0] + (c[1] - t.p[1]) * n[1] + (c[2] - t.p[2]) * n[2]; assert.ok(d > 0, 'winding still inward'); }
    doc.apply('vol.volSides', { volume: 'hull', triangles: [0, 1], side: 'bottom' });
    assert.deepStrictEqual([...V.parse(doc.files.get(DIR + 'hull.vol').bytes).sides.slice(0, 2)], [6, 6]);
    doc.apply('vol.volSides', { volume: 'hull', auto: true });
    o = V.parse(doc.files.get(DIR + 'hull.vol').bytes);
    assert.ok(V.triangles(o).every(t => { const n = V.normal(t.p).map(x => -x); return V.faceSideFromNormal(n) === t.side; }), 'sides from the normals');
    refused(assert, doc, 'vol.volSides', { volume: 'hull', triangles: [99], side: 1 }, /no triangle 99/);
  });

  t('edit-vol: obstacles and areas', () => {
    let doc = mkDoc(), b0 = mdlOf(doc);
    const [s, e] = nodeSpan(b0, m => m.obstacles[0]);
    doc.apply('obst.set', { id: 'obstacle:0', extent: [31, 10] });
    sameOutside(assert, b0, mdlOf(doc), s, e, 'obstacle shape');
    let o = E.state['obst.list'](doc).obstacles[0];
    assert.deepStrictEqual([o.kind, o.center, o.extent, o.axis, o.rotate], ['Obb2', [1, 2], [31, 10], [1, 0], true]);
    doc.apply('obst.set', { id: 'obstacle:0', name: 'wall', rotate: false, tags: ['wall'] });
    o = E.state['obst.list'](doc).obstacles[0]; assert.deepStrictEqual([o.name, o.rotate, o.tags], ['wall', false, ['wall']]);
    doc.apply('obst.set', { id: 'obstacle:0', kind: 'Circle2', radius: 5 });
    o = E.state['obst.list'](doc).obstacles[0]; assert.deepStrictEqual([o.kind, o.radius, o.center], ['Circle2', 5, [0, 0]]);
    doc.apply('obst.set', { id: 'area:0', vertices: [[0, 0], [10, 0], [10, 10], [0, 10]] });
    assert.strictEqual(E.state['obst.list'](doc).areas[0].vertices.length, 4);
    const r = doc.apply('obst.add', { type: 'area', kind: 'Obb2', center: [0, 0], extent: [2, 3], axis: [0, 1] });
    assert.strictEqual(r.info.id, 'area:1'); assert.strictEqual(r.info.name, 'area1');
    doc.apply('obst.add', { type: 'obstacle', name: 'post', kind: 'Circle2', center: [3, 3], radius: 1, rotate: true });
    let all = E.state['obst.list'](doc);
    assert.deepStrictEqual(all.obstacles.map(x => x.name), ['wall', 'post']); assert.deepStrictEqual(all.areas.map(x => x.name), ['inside', 'area1']);
    assert.strictEqual(M.parse(mdlOf(doc)).error, null);
    doc.apply('obst.delete', { id: 'obstacle:0' });
    all = E.state['obst.list'](doc); assert.deepStrictEqual(all.obstacles.map(x => x.name), ['post']);
    assert.strictEqual(M.parse(mdlOf(doc)).volumes.length, 4, 'volumes kept');
  });

  t('edit-vol: through the real core when it exists', () => {
    const corePath = path.join(__dirname, '..', 'model', 'edit', 'core.js');
    if (!fs.existsSync(corePath)) return;            // E0 not there yet: the stand-in document above covers the contract
    const core = require(corePath);
    // a synthetic mod folder in the temp dir, no game: the core reads the model and its files from the mod only
    const mod = fs.mkdtempSync(path.join(require('os').tmpdir(), 'edit-vol-'));
    const dir = path.join(mod, ...DIR.split('/').filter(Boolean)); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'vt.mdl'), MDL); fs.writeFileSync(path.join(dir, 'body.ply'), boxPly());
    const VOLB = V.write(V.fromBox([40, 20, 10])); fs.writeFileSync(path.join(dir, 'hull.vol'), VOLB);
    let doc;
    try {
      doc = core.open({ mod, mdl: DIR + 'vt.mdl', game: null });
      assert.ok(core.ops().includes('vol.setPosition') && core.states().includes('vol.get'), 'core loads the vol module');
      assert.ok(doc.has(DIR + 'hull.vol') && doc.has(DIR + 'body.ply'), 'the core collects the .vol and the mesh');
      const r = doc.apply('vol.setPosition', { volume: 'turret1', position: [7, 8, 9] });
      assert.deepStrictEqual(r.changed, [DIR + 'vt.mdl']);
      assert.deepStrictEqual(doc.state('vol.get', { volume: 'turret1' }).position, [7, 8, 9]);
      assert.strictEqual(doc.state('vol.list').volumes.length, 4);
      assert.strictEqual(doc.state('vol.get', { volume: 'hull' }).vol.rel, DIR + 'hull.vol');
      assert.throws(() => doc.apply('vol.rename', { volume: 'turret1', name: 'hull' }), e => e.code === 'CHECK' || /already|name/i.test(e.message));
      assert.strictEqual(doc.rev, 1, 'a refusal changes nothing');
      const m = doc.apply('vol.volTransform', { volume: 'hull', mirror: 'y' });
      assert.ok(m.changed.includes(DIR + 'hull.vol'));
      doc.undo(); doc.undo();
      assert.ok(doc.bytes(DIR + 'vt.mdl').equals(MDL) && doc.bytes(DIR + 'hull.vol').equals(VOLB), 'undo gives the old bytes');
      assert.ok(!doc.dirty());
      // a .vol in the model folder that the model does not name yet: found through the core (doc.exists, doc.fetch)
      if (typeof doc.exists === 'function') {
        fs.writeFileSync(path.join(dir, 'spare.vol'), V.write(V.fromBox([4, 4, 4])));
        doc.apply('vol.add', { bone: 'body', name: 'spare', kind: 'polyhedron', file: 'spare.vol' });
        assert.ok(doc.state('vol.list').volumes.some(v => v.name === 'spare' && v.kind === 'polyhedron'), 'polyhedron on a folder file');
        doc.undo(); assert.ok(!doc.dirty());
      }
    } finally {
      if (doc) core.close(doc.id);
      fs.rmSync(mod, { recursive: true, force: true });
    }
  });
};

if (require.main === module) {
  const assert = require('assert'); let n = 0, bad = 0;
  module.exports((name, fn) => { try { fn(); n++; } catch (e) { bad++; console.log('FAIL ' + name + ': ' + (e.stack || e.message)); } }, assert);
  console.log(bad ? `FAIL ${bad} failed, ${n} passed` : `${n} passed\nPASS`);
  process.exitCode = bad ? 1 : 0;
}

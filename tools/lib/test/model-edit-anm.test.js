// lib/model/edit/anm.js tests: the animation and timeline ops and states on a stand-in document (shape of
// tools/lib/model/edit/README.md) holding a synthetic 3-bone .mdl and a 10-frame .anm made through anm.js write.
// Each op, a parse after each op, byte identity of files an op does not change, interpolation checked against
// hand-computed numbers, refusals. When edit/core.js exists, one op also runs through the real core.
// Run alone: node tools/lib/test/model-edit-anm.test.js (or from test.js: require(..)(t, assert)).
// Author: Imperator_Aug (ARSENAL, ia-d0f17edb)
'use strict';
module.exports = (t, assert) => {
  const fs = require('fs'), path = require('path');
  const A = require('../model/anm'), M = require('../model/mdl'), E = require('../model/edit/anm');
  const ops0 = require('../../soedit/ops/animops');
  const DIR = 'resource/entity/test/car/', MDL = DIR + 'car.mdl', ANM = DIR + 'open.anm', ANM2 = DIR + 'close.anm';
  const MDL_TEXT = ['{Skeleton', '\t{bone "body"', '\t\t{Position 0 0 10}', '\t\t{bone "door_l"', '\t\t\t{Position 0 20 0}', '\t\t}',
    '\t\t{bone "door_r"', '\t\t\t{Position 0 -20 0}', '\t\t}', '\t}', '\t{animation', '\t\t{sequence "open" {file "open.anm"} {speed 2}}', '\t}', '}', ''].join('\r\n');
  const rz = (deg, p) => { const a = deg * Math.PI / 180; return [Math.cos(a), Math.sin(a), 0, -Math.sin(a), Math.cos(a), 0, 0, 0, 1].concat(p); };
  function makeAnm() {
    let o = ops0.newAnimation(['body', 'door_l', 'door_r'], 10, [rz(0, [0, 0, 10]), rz(0, [0, 20, 0]), rz(0, [0, -20, 0])], 0x60000);
    o = A.setMatrix(o, 4, 'door_l', Float32Array.from(rz(90, [40, 20, 0])));
    o = A.setMatrix(o, 4, 'door_r', Float32Array.from(rz(-90, [40, -20, 0])));
    return A.write(o);
  }
  // stand-in document: files Map, read, apply with undo (the contract's shape; the real core may replace it)
  function mkDoc() {
    const files = new Map();
    const add = (rel, kind, bytes) => files.set(rel, { rel, kind, bytes, bytes0: bytes, from: 'mod', dirty: false });
    add(MDL, 'mdl', Buffer.from(MDL_TEXT, 'latin1'));
    add(ANM, 'anm', makeAnm());
    const doc = { id: 'stand-in', rev: 0, mdl: MDL, files, undo: [],
      read(rel) { const f = files.get(rel); return f.kind === 'mdl' ? M.parse(f.bytes) : A.parse(f.bytes); },
      apply(name, args) {
        const o = E.ops[name]; if (!o) throw new Error('no op ' + name);
        const r = o.apply(doc, args || {}), before = new Map();
        for (const [rel, b] of Object.entries(r.files)) {
          before.set(rel, files.has(rel) ? files.get(rel).bytes : null);
          if (b === null) files.delete(rel);
          else if (files.has(rel)) { const f = files.get(rel); f.bytes = b; f.dirty = !b.equals(f.bytes0); }
          else files.set(rel, { rel, kind: /\.anm$/i.test(rel) ? 'anm' : 'other', bytes: b, bytes0: Buffer.alloc(0), from: 'new', dirty: true });
        }
        doc.undo.push(before); doc.rev++;
        return { rev: doc.rev, changed: Object.keys(r.files), info: r.info };
      },
      back() { const b = doc.undo.pop(); for (const [rel, x] of b) { if (x === null) files.delete(rel); else if (files.has(rel)) files.get(rel).bytes = x; else files.set(rel, { rel, kind: 'anm', bytes: x }); } doc.rev++; } };
    return doc;
  }
  const st = (doc, what, q) => E.state[what](doc, q || {});
  const anmOf = (doc, rel = ANM) => { const o = A.parse(doc.files.get(rel).bytes); assert.strictEqual(o.error, null, 'parses'); assert.ok(A.write(o).equals(doc.files.get(rel).bytes), 'write(parse) identical'); return o; };
  const refuse = (doc, name, args, re) => { const before = new Map([...doc.files].map(([k, f]) => [k, f.bytes])); assert.throws(() => doc.apply(name, args), e => re.test(e.message), name + ' ' + JSON.stringify(args));
    for (const [k, b] of before) assert.ok(doc.files.get(k).bytes.equals(b), 'nothing changed by a refused ' + name); };
  const near = (a, b, eps, m) => { assert.strictEqual(a.length, b.length, m); a.forEach((x, i) => assert.ok(Math.abs(x - b[i]) < eps, (m || '') + ' [' + i + '] ' + x + ' vs ' + b[i])); };
  const angZ = m => Math.atan2(m[1], m[0]) * 180 / Math.PI;
  const mdlBytes = doc => doc.files.get(MDL).bytes;

  t('fixture: 3-bone mdl, 10-frame anm, round trip, states list/get/pose/tl', () => {
    const doc = mkDoc(), o = anmOf(doc);
    assert.strictEqual(o.frames, 10); assert.deepStrictEqual(o.bones, ['body', 'door_l', 'door_r']);
    const L = st(doc, 'anm.list');
    assert.strictEqual(L.animations.length, 1); assert.deepStrictEqual(L.animations[0].sequences, ['open']); assert.deepStrictEqual(L.modelBones, ['body', 'door_l', 'door_r']);
    assert.strictEqual(L.animations[0].versionHex, '0x60000'); assert.deepStrictEqual(L.missing, []);
    const G = st(doc, 'anm.get', { rel: ANM });
    assert.deepStrictEqual(G.keyFrames, [0, 4]); assert.deepStrictEqual(G.bones[1].keys, [0, 4]); assert.ok(G.bones.every(b => b.inModel));
    const P = st(doc, 'anm.pose', { rel: ANM, frame: 4 });
    const dl = P.bones.find(b => b.name === 'door_l');
    near(dl.pos, [40, 20, 0], 1e-4); near(dl.rot, [0, 0, 90], 1e-3); near(dl.world.slice(9), [40, 20, 10], 1e-4, 'world = local then parent');
    const T = st(doc, 'tl.get');
    assert.strictEqual(T.sequences[0].name, 'open'); assert.strictEqual(T.sequences[0].frames, 10); assert.strictEqual(T.sequences[0].fps, 100);
    assert.ok(Math.abs(T.sequences[0].seconds - 0.1) < 1e-9, '10 frames at 50 x 2 per second'); assert.deepStrictEqual(T.ranges, [{ sequence: 'open', rel: ANM, from: 0, to: 9 }]);
  });

  t('interpolate: linear position, engine slerp rotation, hand-computed', () => {
    const doc = mkDoc();
    doc.apply('anm.bake', { rel: ANM });
    assert.deepStrictEqual(st(doc, 'anm.get', { rel: ANM }).bones[1].keys, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 'bake keys every frame');
    doc.apply('anm.key.set', { rel: ANM, bone: 'door_l', frame: 2, pos: [99, 0, 0], rot: [0, 0, -30] });
    assert.ok(Math.abs(st(doc, 'anm.pose', { rel: ANM, frame: 2 }).bones[1].pos[0] - 99) < 1e-4);
    const r = doc.apply('anm.interpolate', { rel: ANM, bone: 'door_l', from: 0, to: 4 });
    assert.deepStrictEqual(r.changed, [ANM]);
    const o = anmOf(doc), f1 = A.matrixAt(o, 'door_l', 1), f2 = A.matrixAt(o, 'door_l', 2), f3 = A.matrixAt(o, 'door_l', 3);
    // t = 0.5: halfway rotation 45 degrees, x = 20
    assert.ok(Math.abs(angZ(f2) - 45) < 1e-3, 'frame 2 angle ' + angZ(f2)); near(Array.from(f2.slice(9)), [20, 20, 0], 1e-4);
    // t = 0.25: engine slerp uses half the angle (22.5 deg): weights sin(16.875)/sin(22.5) = 0.758556, sin(5.625)/sin(22.5) = 0.256132,
    // q = norm(0.758556*(0,0,0,1) + 0.256132*(0,0,sin45,cos45)) = (0,0,0.189258,0.981928) -> 2*atan(0.192741) = 21.820 deg; x = 10
    assert.ok(Math.abs(angZ(f1) - 21.820) < 0.01, 'frame 1 angle ' + angZ(f1)); near(Array.from(f1.slice(9)), [10, 20, 0], 1e-4);
    assert.ok(Math.abs(angZ(f3) - (90 - 21.820)) < 0.01, 'frame 3 angle ' + angZ(f3)); near(Array.from(f3.slice(9)), [30, 20, 0], 1e-4);
    // other bones untouched, frame 0 and 4 untouched
    near(Array.from(A.matrixAt(o, 'door_r', 4)), rz(-90, [40, -20, 0]), 1e-5);
    near(Array.from(A.matrixAt(o, 'door_l', 4)), rz(90, [40, 20, 0]), 1e-5);
    // ease in: t = 0.25 -> 0.0625, position 2.5
    doc.apply('anm.interpolate', { rel: ANM, bone: 'door_l', from: 0, to: 4, ease: 'in' });
    near(Array.from(A.matrixAt(anmOf(doc), 'door_l', 1).slice(9)), [2.5, 20, 0], 1e-4);
    refuse(doc, 'anm.interpolate', { rel: ANM, from: 4, to: 2 }, /first before the last/);
    refuse(doc, 'anm.interpolate', { rel: ANM, from: 0, to: 4, ease: 'bounce' }, /Ease/);
  });

  t('key set (local, world, matrix, only this frame, forward), key delete, unknown bone and frame refused', () => {
    const doc = mkDoc(), mdl0 = mdlBytes(doc);
    // keyframe semantics: a key at 2 re-times 0..4
    doc.apply('anm.key.set', { rel: ANM, bone: 'door_l', frame: 2, pos: [0, 50, 0] });
    let o = anmOf(doc);
    near(Array.from(A.matrixAt(o, 'door_l', 2).slice(9)), [0, 50, 0], 1e-4); assert.deepStrictEqual(st(doc, 'anm.get', { rel: ANM }).keyFrames, [0, 2, 4]);
    assert.ok(Math.abs(angZ(A.matrixAt(o, 'door_l', 2)) - 45) < 1e-3, 'rotation kept when only the position is given');
    assert.ok(mdlBytes(doc).equals(mdl0), 'the .mdl is not touched');
    // world entry: door_l world = local then body (0,0,10)
    doc.apply('anm.key.set', { rel: ANM, bone: 'door_l', frame: 6, pos: [5, 25, 10], rot: [0, 0, 0], space: 'world' });
    const p6 = st(doc, 'anm.pose', { rel: ANM, frame: 6 }).bones[1];
    near(p6.pos, [5, 25, 0], 1e-4, 'local'); near(p6.world.slice(9), [5, 25, 10], 1e-4, 'world');
    // full matrix, only this frame (neighbours keep their values)
    o = anmOf(doc); const n7 = Array.from(A.matrixAt(o, 'door_r', 7)), n9 = Array.from(A.matrixAt(o, 'door_r', 9));
    doc.apply('anm.key.set', { rel: ANM, bone: 'door_r', frame: 8, matrix: rz(10, [1, 2, 3]), only: true });
    o = anmOf(doc);
    near(Array.from(A.matrixAt(o, 'door_r', 8)), rz(10, [1, 2, 3]), 1e-5); near(Array.from(A.matrixAt(o, 'door_r', 7)), n7, 1e-5); near(Array.from(A.matrixAt(o, 'door_r', 9)), n9, 1e-5);
    // forward: frame 8's value copied to the end
    doc.apply('anm.key.set', { rel: ANM, bone: 'body', frame: 5, pos: [0, 0, 12], forward: true });
    o = anmOf(doc); for (let f = 5; f < 10; f++) near(Array.from(A.matrixAt(o, 'body', f).slice(9)), [0, 0, 12], 1e-5, 'frame ' + f);
    // delete key at 2: door_l at 2 falls back between its neighbours
    doc.apply('anm.key.delete', { rel: ANM, bone: 'door_l', frame: 2 });
    assert.ok(!st(doc, 'anm.get', { rel: ANM }).bones[1].keys.includes(2));
    refuse(doc, 'anm.key.delete', { rel: ANM, bone: 'door_l', frame: 3 }, /no key/);
    refuse(doc, 'anm.key.set', { rel: ANM, bone: 'door_l', frame: 10, pos: [0, 0, 0] }, /outside 0 to 9/);
    refuse(doc, 'anm.key.set', { rel: ANM, bone: 'door_l', frame: -1, pos: [0, 0, 0] }, /outside/);
    refuse(doc, 'anm.key.set', { rel: ANM, bone: 'wheel', frame: 1, pos: [0, 0, 0] }, /no bone "wheel"/);
    refuse(doc, 'anm.key.set', { rel: ANM, bone: 'body', frame: 1, matrix: [1, 2, 3] }, /12 numbers/);
    refuse(doc, 'anm.key.set', { rel: ANM, bone: 'body', frame: 1 }, /position, a rotation/);
    refuse(doc, 'anm.key.set', { rel: 'resource/x.anm', bone: 'body', frame: 1, pos: [0, 0, 0] }, /no animation/);
    // move a key (timeline drag): door_l's key at 4 to 7
    const v4 = Array.from(A.matrixAt(anmOf(doc), 'door_l', 4));
    doc.apply('anm.key.move', { rel: ANM, bone: 'door_l', from: 4, to: 7 });
    o = anmOf(doc); near(Array.from(A.matrixAt(o, 'door_l', 7)), v4, 1e-5, 'moved key');
    assert.ok(!st(doc, 'anm.get', { rel: ANM }).bones[1].keys.includes(4) && st(doc, 'anm.get', { rel: ANM }).bones[1].keys.includes(7));
    doc.back();
    // delete the first key: the bone holds its next key from the start
    const next = st(doc, 'anm.get', { rel: ANM }).bones[2].keys[1];
    const del = doc.apply('anm.key.delete', { rel: ANM, bone: 'door_r', frame: 0 });
    assert.strictEqual(del.info.heldFrom, next);
    o = anmOf(doc); near(Array.from(A.matrixAt(o, 'door_r', 0)), Array.from(A.matrixAt(o, 'door_r', next)), 1e-5);
  });

  t('frames: insert, delete, duplicate, move, length, dropFirst, reverse twice, loop; nothing-changes ops return no file', () => {
    const doc = mkDoc(), b0 = doc.files.get(ANM).bytes;
    assert.deepStrictEqual(doc.apply('anm.reverse', { rel: ANM, from: 3, to: 3 }).changed, [], 'a one-frame reverse changes nothing');
    assert.deepStrictEqual(doc.apply('anm.frames.length', { rel: ANM, frames: 10 }).changed, []);
    assert.deepStrictEqual(doc.apply('anm.time.scale', { rel: ANM, frames: 10 }).changed, []);
    assert.deepStrictEqual(doc.apply('anm.interpolate', { rel: ANM, from: 3, to: 4 }).changed, []);
    assert.ok(doc.files.get(ANM).bytes.equals(b0), 'byte-identical');
    doc.apply('anm.frames.insert', { rel: ANM, at: 4, count: 2 }); assert.strictEqual(anmOf(doc).frames, 12);
    near(Array.from(A.matrixAt(anmOf(doc), 'door_l', 6)), rz(90, [40, 20, 0]), 1e-5, 'copies of frame 4');
    doc.apply('anm.frames.delete', { rel: ANM, from: 5, to: 6 }); assert.strictEqual(anmOf(doc).frames, 10);
    doc.apply('anm.frames.duplicate', { rel: ANM, from: 0, to: 1 }); assert.strictEqual(anmOf(doc).frames, 12);
    doc.apply('anm.frames.delete', { rel: ANM, from: 2, to: 3 });
    doc.apply('anm.frames.move', { rel: ANM, from: 4, to: 4, at: 0 });
    near(Array.from(A.matrixAt(anmOf(doc), 'door_l', 0)), rz(90, [40, 20, 0]), 1e-5, 'frame 4 moved to 0');
    doc.back(); assert.ok(doc.files.get(ANM).bytes.length > 0);
    doc.apply('anm.frames.length', { rel: ANM, frames: 14 }); assert.strictEqual(anmOf(doc).frames, 14);
    doc.apply('anm.frames.length', { rel: ANM, frames: 10 }); assert.strictEqual(anmOf(doc).frames, 10);
    doc.apply('anm.dropFirst', { rel: ANM }); assert.strictEqual(anmOf(doc).frames, 9, 'one frame, once');
    doc.back();
    const before = Array.from(A.matrixAt(anmOf(doc), 'door_l', 4));
    doc.apply('anm.reverse', { rel: ANM });
    near(Array.from(A.matrixAt(anmOf(doc), 'door_l', 5)), before, 1e-5, 'frame 4 now at 5');
    doc.apply('anm.reverse', { rel: ANM });
    near(Array.from(A.matrixAt(anmOf(doc), 'door_l', 4)), before, 1e-5, 'reverse twice');
    doc.apply('anm.loop', { rel: ANM, mode: 'end' });
    const o = anmOf(doc); near(Array.from(A.matrixAt(o, 'door_l', 9)), Array.from(A.matrixAt(o, 'door_l', 0)), 1e-5, 'last = first');
    doc.apply('anm.loop', { rel: ANM, mode: 'append' }); assert.strictEqual(anmOf(doc).frames, 11);
    refuse(doc, 'anm.frames.delete', { rel: ANM, from: 0, to: 10 }, /at least one frame/);
    refuse(doc, 'anm.frames.insert', { rel: ANM, at: 1.5 }, /whole number/);
    refuse(doc, 'anm.frames.move', { rel: ANM, from: 2, to: 1, at: 0 }, /before the first/);
  });

  t('time scale, bake, shift, offset, mirror pose, visibility, copy and paste between animations', () => {
    const doc = mkDoc();
    doc.apply('anm.time.scale', { rel: ANM, frames: 19 });
    let o = anmOf(doc); assert.strictEqual(o.frames, 19);
    near(Array.from(A.matrixAt(o, 'door_l', 8)), rz(90, [40, 20, 0]), 1e-4, 'old frame 4 at 8');
    assert.ok(Math.abs(angZ(A.matrixAt(o, 'door_l', 4)) - 45) < 1e-3, 'old frame 2 at 4');
    doc.back();
    doc.apply('anm.track.shift', { rel: ANM, bone: 'door_l', by: 2 });
    o = anmOf(doc); near(Array.from(A.matrixAt(o, 'door_l', 6)), rz(90, [40, 20, 0]), 1e-4); near(Array.from(A.matrixAt(o, 'door_l', 1)), rz(0, [0, 20, 0]), 1e-4);
    doc.back();
    doc.apply('anm.track.offset', { rel: ANM, bone: 'body', pos: [0, 0, 5] });
    o = anmOf(doc); for (const f of [0, 3, 9]) near(Array.from(A.matrixAt(o, 'body', f).slice(9)), [0, 0, 15], 1e-4);
    // mirror frame 4: door_l gets door_r's pose reflected (rot -90 -> +90, y -20 -> +20)
    doc.apply('anm.key.set', { rel: ANM, bone: 'door_r', frame: 4, matrix: rz(-30, [7, -20, 1]) });
    doc.apply('anm.pose.mirror', { rel: ANM, frame: 4 });
    o = anmOf(doc); near(Array.from(A.matrixAt(o, 'door_l', 4)), rz(30, [7, 20, 1]), 1e-4, 'mirrored'); near(Array.from(A.matrixAt(o, 'door_r', 4)), rz(-90, [40, -20, 0]), 1e-4);
    assert.deepStrictEqual(E._t.mirrorPairs(['L_Hand', 'R_Hand', 'arm.left', 'arm.right', 'LeftFoot', 'RightFoot', 'head']), { L_Hand: 'R_Hand', R_Hand: 'L_Hand', 'arm.left': 'arm.right', 'arm.right': 'arm.left', LeftFoot: 'RightFoot', RightFoot: 'LeftFoot' });
    // visibility
    doc.apply('anm.vis.set', { rel: ANM, bone: 'door_r', from: 2, to: 3, visible: false });
    const G = st(doc, 'anm.get', { rel: ANM }); assert.deepStrictEqual(G.bones[2].vis, [[2, false], [4, true]]);
    assert.strictEqual(st(doc, 'anm.pose', { rel: ANM, frame: 3 }).bones[2].visible, false);
    refuse(doc, 'anm.vis.set', { rel: ANM, bone: 'door_r', from: 2, visible: 'no' }, /shown or hidden/);
    // copy a frame range, paste into a new animation
    const clip = st(doc, 'anm.clip', { rel: ANM, from: 2, to: 4 });
    assert.strictEqual(clip.frames, 3); assert.strictEqual(clip.bones.length, 3);
    doc.apply('anm.new', { rel: 'close.anm', frames: 5 });
    doc.apply('anm.paste', { rel: ANM2, at: 1, clip });
    o = anmOf(doc, ANM2);
    near(Array.from(A.matrixAt(o, 'door_l', 3)), Array.from(A.matrixAt(anmOf(doc), 'door_l', 4)), 1e-5, 'pasted');
    assert.strictEqual(st(doc, 'anm.pose', { rel: ANM2, frame: 2 }).bones[2].visible, false, 'visibility pasted');
    refuse(doc, 'anm.paste', { rel: ANM2, at: 3, clip }, /past the end/);
    doc.apply('anm.paste', { rel: ANM2, at: 3, clip, grow: true }); assert.strictEqual(anmOf(doc, ANM2).frames, 6);
    refuse(doc, 'anm.paste', { rel: ANM2, at: 0, clip: null }, /Nothing to paste/);
  });

  t('files: new (bones from the model), attach, rename, duplicate, delete; sequences follow; unreadable data kept', () => {
    const doc = mkDoc(), anm0 = doc.files.get(ANM).bytes;
    const r = doc.apply('anm.new', { rel: 'walk.anm', frames: 4, sequence: 'walk' });
    assert.deepStrictEqual(r.changed.sort(), [MDL, DIR + 'walk.anm'].sort());
    const w = anmOf(doc, DIR + 'walk.anm'); assert.deepStrictEqual(w.bones, ['body', 'door_l', 'door_r']); assert.strictEqual(w.frames, 4); assert.strictEqual(w.version, 0x60000);
    near(Array.from(A.matrixAt(w, 'door_r', 0)), rz(0, [0, -20, 0]), 1e-6, 'rest matrix from the .mdl');
    let m = M.parse(mdlBytes(doc)); assert.strictEqual(m.error, null); assert.deepStrictEqual(m.sequences.map(s => [s.name, s.file]), [['open', 'open.anm'], ['walk', 'walk.anm']]);
    assert.ok(mdlBytes(doc).toString('latin1').startsWith(MDL_TEXT.slice(0, 200)), 'rest of the .mdl kept');
    assert.ok(doc.files.get(ANM).bytes.equals(anm0), 'open.anm untouched');
    refuse(doc, 'anm.new', { rel: 'walk.anm' }, /already has/);
    refuse(doc, 'anm.new', { rel: 'walk.txt' }, /end in \.anm/);
    refuse(doc, 'anm.new', { rel: '../x.anm' }, /inside/);
    doc.apply('anm.rename', { rel: DIR + 'walk.anm', to: 'run.anm' });
    assert.ok(!doc.files.has(DIR + 'walk.anm') && doc.files.has(DIR + 'run.anm'));
    m = M.parse(mdlBytes(doc)); assert.strictEqual(m.sequences[1].file, 'run.anm', 'sequence follows the rename');
    doc.apply('anm.duplicate', { rel: DIR + 'run.anm', to: 'run2.anm' });
    assert.ok(doc.files.get(DIR + 'run2.anm').bytes.equals(doc.files.get(DIR + 'run.anm').bytes));
    doc.apply('anm.delete', { rel: DIR + 'run.anm', sequences: true });
    m = M.parse(mdlBytes(doc)); assert.deepStrictEqual(m.sequences.map(s => s.name), ['open']);
    // attach: a file whose tail is unknown is kept, listed, not editable
    const bad = Buffer.concat([anm0, Buffer.from('XXXXjunk', 'latin1')]);
    doc.apply('anm.attach', { rel: 'odd.anm', data: bad.toString('base64') });
    assert.ok(doc.files.get(DIR + 'odd.anm').bytes.equals(bad));
    assert.ok(A.write(A.parse(bad)).equals(bad), 'unknown chunk carried raw');
    assert.strictEqual(st(doc, 'anm.list').animations.find(x => x.rel === DIR + 'odd.anm').readable, false);
    refuse(doc, 'anm.reverse', { rel: DIR + 'odd.anm' }, /cannot read/);
    refuse(doc, 'anm.attach', { rel: 'odd2.anm', data: Buffer.from('nope').toString('base64') }, /not an animation/);
    refuse(doc, 'anm.attach', { rel: 'none.anm' }, /no file "resource\/entity\/test\/car\/none.anm"/);
    doc.fetch = rel => (rel === DIR + 'disk.anm' ? anm0 : null);
    doc.apply('anm.attach', { rel: 'disk.anm', sequence: true });
    assert.ok(doc.files.get(DIR + 'disk.anm').bytes.equals(anm0)); assert.ok(M.parse(mdlBytes(doc)).sequences.some(s => s.name === 'disk' && s.file === 'disk.anm'));
  });

  t('bones: add from the model, remove the first, rename, clone, export, import, reset', () => {
    const doc = mkDoc();
    doc.apply('anm.bone.remove', { rel: ANM, bone: 'body' });
    assert.deepStrictEqual(anmOf(doc).bones, ['door_l', 'door_r'], 'bone 0 removed (SOEdit could not)');
    doc.apply('anm.bone.add', { rel: ANM, bone: 'BODY' });
    assert.deepStrictEqual(anmOf(doc).bones, ['door_l', 'door_r', 'body']);
    near(Array.from(A.matrixAt(anmOf(doc), 'body', 5)), rz(0, [0, 0, 10]), 1e-6, 'rest matrix');
    refuse(doc, 'anm.bone.add', { rel: ANM, bone: 'wheel' }, /no bone "wheel" in the model/);
    refuse(doc, 'anm.bone.add', { rel: ANM, bone: 'body' }, /already/);
    doc.apply('anm.bone.rename', { rel: ANM, bone: 'door_l', name: 'door_left_long_name_beyond_thirty_chars' });
    assert.strictEqual(anmOf(doc).bones[0], 'door_left_long_name_beyond_thirty_chars');
    doc.back();
    doc.apply('anm.bone.clone', { rel: ANM, bone: 'door_l' });
    assert.strictEqual(anmOf(doc).bones[3], 'door_l_Clone_0');
    doc.apply('anm.bone.export', { rel: ANM, bone: 'door_l', to: 'door.anm' });
    const ex = anmOf(doc, DIR + 'door.anm'); assert.deepStrictEqual(ex.bones, ['door_l']); assert.strictEqual(ex.version, 0x60000);
    doc.apply('anm.bone.import', { rel: ANM, from: DIR + 'door.anm' });
    assert.strictEqual(anmOf(doc).bones[4], 'door_l_0', 'clash named into its own slot');
    near(Array.from(A.matrixAt(anmOf(doc), 'door_l_0', 4)), rz(90, [40, 20, 0]), 1e-5);
    doc.apply('anm.bone.reset', { rel: ANM, bone: 'door_l', frame: 4 });
    near(Array.from(A.matrixAt(anmOf(doc), 'door_l', 4)), rz(0, [0, 20, 0]), 1e-5, 'reset to rest at one frame');
    doc.apply('anm.bone.reset', { rel: ANM, bone: 'door_r', value: 'identity' });
    near(Array.from(A.matrixAt(anmOf(doc), 'door_r', 9)), rz(0, [0, 0, 0]), 1e-6, 'whole track to identity');
    refuse(doc, 'anm.bone.remove', { rel: ANM, bone: 'nope' }, /no bone "nope"/);
  });

  t('timeline: sequences add, set, delete; Gates of Hell keys refused; events listed', () => {
    const doc = mkDoc();
    doc.apply('tl.seq.add', { name: 'idle', file: 'open.anm', fields: { autostart: true, smooth: 0.5 } });
    let m = M.parse(mdlBytes(doc)); const s = m.sequences.find(x => x.name === 'idle');
    assert.ok(s && s.autostart && s.smooth === 0.5 && s.file === 'open.anm');
    doc.apply('tl.seq.set', { sequence: 'open', fields: { speed: 1.5, resume: true, store: true } });
    m = M.parse(mdlBytes(doc)); const o = m.sequences.find(x => x.name === 'open');
    assert.ok(o.speed === 1.5 && o.resume && o.store);
    assert.strictEqual(st(doc, 'tl.get').sequences.find(x => x.name === 'open').fps, 75);
    const same = doc.apply('tl.seq.set', { sequence: 'open', fields: { speed: 1.5 } }); assert.deepStrictEqual(same.changed, [], 'same value: no change');
    doc.apply('tl.seq.set', { sequence: 'open', fields: { duration: 'frames 20' } });
    assert.ok(Math.abs(st(doc, 'tl.get').sequences.find(x => x.name === 'open').speed - 0.5) < 1e-9, 'duration frames 20 over 10 frames');
    refuse(doc, 'tl.seq.set', { sequence: 'open', fields: { events: 'x' } }, /Gates of Hell/);
    refuse(doc, 'tl.seq.set', { sequence: 'open', fields: { smooth: 2 } }, /between 0 and 1/);
    refuse(doc, 'tl.seq.set', { sequence: 'open', fields: { speed: 0 } }, /other than 0/);
    refuse(doc, 'tl.seq.add', { name: 'idle' }, /already/);
    refuse(doc, 'tl.seq.set', { sequence: 'nope', fields: { speed: 1 } }, /no sequence/);
    doc.apply('tl.seq.delete', { sequence: 'idle' });
    assert.deepStrictEqual(M.parse(mdlBytes(doc)).sequences.map(x => x.name), ['open']);
    doc.apply('anm.vis.set', { rel: ANM, bone: 'door_l', from: 1, to: 1, visible: false });
    assert.deepStrictEqual(st(doc, 'tl.get').events.map(e => [e.bone, e.frame, e.kind]), [['door_l', 1, 'hide'], ['door_l', 2, 'show']]);
  });

  t('euler degrees round trip; maths helpers', () => {
    for (const e of [[0, 0, 0], [10, 20, 30], [-45, 60, 170], [90, 0, 0]]) near(E._t.toEuler(E._t.fromEuler(e)), e, 1e-6, e.join(','));
    near(E._t.fromEuler([0, 0, 90]), [0, 1, 0, -1, 0, 0, 0, 0, 1], 1e-12, 'about Z, row vectors');
    near(E._t.mirrorM(rz(30, [1, 2, 3])), rz(-30, [1, -2, 3]), 1e-12);
  });

  t('real core (edit/core.js), when it exists', () => {
    const core = path.join(__dirname, '..', 'model', 'edit', 'core.js');
    if (!fs.existsSync(core)) return;   // the stand-in above is the contract's shape
    const C = require(core);
    const mod = fs.mkdtempSync(path.join(require('os').tmpdir(), 'edit-anm-core-'));
    try {
      const files = { [MDL]: Buffer.from(MDL_TEXT, 'latin1'), [ANM]: makeAnm() };
      for (const [rel, b] of Object.entries(files)) { const p = path.join(mod, ...rel.split('/')); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, b); }
      const doc = C.open({ mod, mdl: MDL, game: null });
      assert.ok(C.ops().includes('anm.key.set') && C.states().includes('anm.pose'), 'the core loads this module: ' + JSON.stringify(C.problems()));
      assert.strictEqual(doc.files.get(ANM).kind, 'anm');
      assert.deepStrictEqual(doc.state('anm.list').animations.map(a => a.rel), [ANM]);
      const r = doc.apply('anm.reverse', { rel: ANM });
      assert.deepStrictEqual(r.changed, [ANM]);
      doc.apply('anm.new', { rel: 'walk.anm', frames: 3, sequence: true });
      assert.ok(doc.files.get(DIR + 'walk.anm').from === 'new' && doc.files.get(MDL).dirty);
      const sv = doc.save({ dry: true });
      assert.deepStrictEqual(sv.writes.map(w => w.rel).sort(), [ANM, MDL, DIR + 'walk.anm'].sort());
      doc.undo(); doc.undo();
      assert.ok(doc.files.get(ANM).bytes.equals(files[ANM]) && !doc.files.has(DIR + 'walk.anm'));
      C.close(doc.id);
    } finally { fs.rmSync(mod, { recursive: true, force: true }); }
  });
};

if (require.main === module) {
  const assert = require('assert');
  let n = 0, bad = 0;
  module.exports((name, fn) => { try { fn(); n++; console.log('ok ' + name); } catch (e) { bad++; console.log('FAIL ' + name + ': ' + (e && e.stack || e)); } }, assert);
  console.log(bad ? `${bad} failed, ${n} passed` : `${n} passed`);
  if (bad) process.exitCode = 1;
}

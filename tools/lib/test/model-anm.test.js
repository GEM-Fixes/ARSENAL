// lib/model/anm.js unit tests: synthetic .anm files of every version and frame chunk kind, byte-identical round trip,
// edit helpers, bad input. Run alone: node tools/lib/test/model-anm.test.js (or from test.js: require(..)(t, assert)).
// Author: Imperator_Aug (ARSENAL, ia-4e7c2924)
'use strict';
module.exports = (t, assert) => {
  const anm = require('../model/anm');
  const T = s => Buffer.from(s, 'latin1');
  const I = n => { const b = Buffer.alloc(4); b.writeInt32LE(n); return b; };
  const U16 = n => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
  const F = a => { const b = Buffer.alloc(a.length * 4); a.forEach((v, i) => b.writeFloatLE(v, i * 4)); return b; };
  // independent builder (does not use the module's writer)
  function build({ version, frames, bones, chunks }) {
    const p = [T('EANM'), I(version), T('FRMS'), I(frames), T('BMAP'), I(bones.length)];
    for (const n of bones) { const b = T(n); p.push(I(b.length), b); }
    for (const c of chunks) {
      if (c.tag === 'FRM2') {
        p.push(T('FRM2'), U16(c.index), Buffer.from([c.recs.length]));
        for (const r of c.recs) {
          p.push(Buffer.from([r.bone]), U16(r.flags));
          if (r.flags & 1) p.push(F(r.pos));
          if (r.flags & 2) p.push(F(r.rot));
          if (r.flags & 0x20) p.push(I(r.mesh.length), r.mesh);
        }
      } else if (c.tag === 'FRMN') {
        p.push(T('FRMN'), I(c.index));
        for (const r of c.recs) {
          p.push(T('BONE'), I(r.bone));
          for (const [k, v] of r.items) { p.push(T(k)); if (k === 'MATR') p.push(F(v)); else if (k === 'VISI') p.push(I(v)); else p.push(I(v.length), v); }
        }
      } else p.push(c.raw);
    }
    return Buffer.concat(p);
  }
  const qAxis = (ax, ang) => { const s = Math.sin(ang / 2), c = Math.cos(ang / 2); return [ax[0] * s, ax[1] * s, ax[2] * s, c]; };
  const xyz = q => q.slice(0, 3);
  const near = (a, b, eps = 1e-4) => { assert.ok(a && b, 'matrix missing'); for (let i = 0; i < 12; i++) assert.ok(Math.abs(a[i] - b[i]) <= eps, `m[${i}] ${a[i]} vs ${b[i]}`); };
  const same = (b, msg) => assert.ok(anm.write(anm.parse(b)).equals(b), msg || 'round trip differs');
  const MESH = Buffer.from([0, 0, 0, 0, 2, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 0, 0, 0, 0, 0, 0, 0, 0]);
  const q1 = qAxis([0, 0, 1], 0.5), q2 = qAxis([0, 1, 0], 1.2), q3 = qAxis([1, 0, 0], -0.7);

  const frm2 = (version = 0x60000) => build({
    version, frames: 6, bones: ['root', 'arm_lod1', 'gun', 'n\xe9e'], chunks: [
      { tag: 'FRM2', index: 0, recs: [
        { bone: 0, flags: 3, pos: [1, 2, 3], rot: xyz(q1) },
        { bone: 1, flags: 3 | 4, pos: [0, 0, 5], rot: xyz(q2) },
        { bone: 2, flags: 3 | 8, pos: [4, 0, 0], rot: [0, 0, 0] },
        { bone: 3, flags: 0x20 | 0x10, mesh: MESH }] },
      { tag: 'FRM2', index: 2, recs: [{ bone: 0, flags: 2, rot: xyz(q3) }, { bone: 2, flags: 1, pos: [8, 0, 0] }] },
      { tag: 'FRM2', index: 4, recs: [{ bone: 0, flags: 1, pos: [3, 2, 1] }, { bone: 3, flags: 0x08 }] }] });
  const M1 = [1, 0, 0, 0, 1, 0, 0, 0, 1, 10, 20, 30], M2 = Array.from(anm.toMatrix(q2, [1, 1, 1], false)), M3 = Array.from(anm.toMatrix(q1, [0, 5, 0], true));
  const frmn = (version = 0x40000) => build({
    version, frames: 3, bones: ['a', 'b', 'c'], chunks: [
      { tag: 'FRMN', index: 0, recs: [{ bone: 0, items: [['MATR', M1], ['VISI', 1]] }, { bone: 1, items: [['MATR', M2]] }, { bone: 2, items: [['MATR', M3], ['VISI', 0], ['MESH', MESH]] }] },
      { tag: 'FRMN', index: 1, recs: [{ bone: 2, items: [['MESH', MESH]] }, { bone: 1, items: [] }] },
      { tag: 'FRMN', index: 2, recs: [{ bone: 0, items: [['VISI', 7], ['MATR', M2]] }] }] });

  t('model/anm: FRM2 round trip, versions 0x30000..0x60001', () => {
    for (const v of [0x30000, 0x40000, 0x50000, 0x60000, 0x60001]) { const b = frm2(v); same(b); assert.equal(anm.parse(b).version, v); }
  });
  t('model/anm: FRM2 decode (matrix, held parts, mirror, visibility, mesh, latin1 names)', () => {
    const o = anm.parse(frm2());
    assert.equal(o.error, null); assert.deepEqual(o.problems, []);
    assert.deepEqual(o.bones, ['root', 'arm_lod1', 'gun', 'n\xe9e']);
    assert.equal(o.frame.length, 6); assert.equal(o.chunks.map(c => c.tag).join(), 'EANM,FRMS,BMAP,FRM2,FRM2,FRM2');
    near(o.frame[0][0].matrix, anm.toMatrix(q1, [1, 2, 3], false));
    const m1 = o.frame[0][1].matrix; near(m1, anm.toMatrix(q2, [0, 0, 5], true));
    const x = [m1[0], m1[1], m1[2]], y = [m1[3], m1[4], m1[5]], cz = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]];
    near([...cz.map(v => -v), 0, 0, 0, 0, 0, 0, 0, 0, 0], [m1[6], m1[7], m1[8], 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    near(o.frame[2][0].matrix, anm.toMatrix(q3, [1, 2, 3], false)); // rot-only keeps pos
    near(o.frame[4][0].matrix, anm.toMatrix(q3, [3, 2, 1], false)); // pos-only keeps rot
    assert.equal(o.frame[0][2].visible, true); assert.equal(o.frame[0][3].visible, false); assert.equal(o.frame[4][3].visible, true);
    assert.equal(o.frame[0][3].matrix, null); assert.ok(o.frame[0][3].mesh.equals(MESH));
    assert.equal(o.frame[1][0].matrix, null); assert.equal(o.frame[2][1].matrix, null);
  });
  t('model/anm: FRMN round trip + decode (0x40000, 0x50000)', () => {
    for (const v of [0x40000, 0x50000]) same(frmn(v));
    const o = anm.parse(frmn());
    assert.deepEqual(Array.from(o.frame[0][0].matrix), M1);
    assert.equal(o.frame[0][0].visible, true); assert.equal(o.frame[0][2].visible, false); assert.equal(o.frame[2][0].visible, true);
    assert.ok(o.frame[1][2].mesh.equals(MESH)); assert.equal(o.frame[1][1].matrix, null);
    assert.deepEqual(o.chunks[4].recs[1].items, []);
  });
  t('model/anm: mixed kinds, header only, raw tail', () => {
    const mixed = build({ version: 0x60001, frames: 2, bones: ['a'], chunks: [
      { tag: 'FRMN', index: 0, recs: [{ bone: 0, items: [['MATR', M1]] }] }, { tag: 'FRM2', index: 1, recs: [{ bone: 0, flags: 1, pos: [0, 0, 0] }] }] });
    same(mixed);
    near(anm.parse(mixed).frame[1][0].matrix, [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]); // pos-only after MATR keeps its rotation
    const empty = build({ version: 0x60000, frames: 1, bones: [], chunks: [] });
    assert.equal(empty.length, 24); same(empty); assert.match(anm.parse(empty).problems.join(), /Empty animation frames/);
    const unk = Buffer.concat([frm2(), T('XXXX'), I(5)]);
    const o = anm.parse(unk); assert.match(o.error, /unknown chunk "XXXX"/); same(unk);
    assert.ok(o.chunks[o.chunks.length - 1].raw);
  });
  t('model/anm: truncated and garbage input never throw, round trip anyway', () => {
    for (const b of [frm2(), frmn()]) for (let n = 0; n < b.length; n++) {
      const cut = b.subarray(0, n), o = anm.parse(cut);
      assert.ok(anm.write(o).equals(cut), 'prefix ' + n);
      if (n < 24) assert.ok(o.error, 'error for prefix ' + n);
    }
    assert.ok(anm.parse(frm2().subarray(0, 60)).error);
    let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) & 255;
    for (let k = 0; k < 200; k++) {
      const g = Buffer.from(Array.from({ length: 1 + (k % 90) }, rnd));
      if (k % 2) T('EANM').copy(g, 0, 0, Math.min(4, g.length));
      const o = anm.parse(g); assert.ok(anm.write(o).equals(g));
    }
    const bad = Buffer.concat([T('EANM'), I(0x60000), T('FRMS'), I(1), T('BMAP'), I(1), I(-5)]);
    assert.match(anm.parse(bad).error, /bone name length/);
  });
  t('model/anm: engine problems listed', () => {
    const b = build({ version: 0x20000, frames: 2, bones: ['a', 'b'], chunks: [
      { tag: 'FRM2', index: 0, recs: [{ bone: 0, flags: 1, pos: [0, 0, 0] }] },
      { tag: 'FRM2', index: 5, recs: [{ bone: 1, flags: 1, pos: [0, 0, 0] }, { bone: 9, flags: 0 }] },
      { tag: 'FRMN', index: 1, recs: [{ bone: 0, items: [['MATR', [1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0]]] }] }] });
    const p = anm.parse(b).problems.join('|');
    for (const re of [/Unsupported/, /Invalid frame # 5/, /Invalid bone index 9/, /out of order/, /bone b keyed only after/, /non-orthogonal/]) assert.match(p, re);
    same(b);
  });
  t('model/anm: boneTrack / matrixAt (hold, interpolate, clamp)', () => {
    const o = anm.parse(frm2());
    const tr = anm.boneTrack(o, 'gun');
    assert.equal(tr.length, 6);
    assert.ok(Math.abs(tr[1][9] - 6) < 1e-5); // 4 -> 8 between frames 0 and 2
    assert.ok(Math.abs(tr[3][9] - 8) < 1e-5 && Math.abs(tr[5][9] - 8) < 1e-5); // held (chunk 4 does not key gun), clamp after last
    assert.equal(anm.matrixAt(o, 3, 2), null); // never keyed a transform
    near(anm.matrixAt(o, 'root', 1), anm.toMatrix(anm.slerp(q1, q3, 0.5), [1, 2, 3], false));
    near(anm.matrixAt(o, 0, 3), anm.toMatrix(q3, [2, 2, 2], false));
    assert.throws(() => anm.boneTrack(o, 'nope'), RangeError);
  });
  const tracks = o => o.bones.map((_, b) => anm.boneTrack(o, b));
  t('model/anm: setMatrix (existing key, new key frame, FRMN exact), input untouched', () => {
    const b = frm2(), o = anm.parse(b), before = tracks(o);
    const m = anm.toMatrix(qAxis([0, 1, 0], 0.3), [9, 9, 9], false);
    const e = anm.setMatrix(o, 2, 'gun', m);
    near(anm.matrixAt(e, 'gun', 2), m);
    assert.ok(anm.write(o).equals(b), 'input changed');
    const r = anm.parse(anm.write(e)); near(r.frame[2][2].matrix, m); near(anm.matrixAt(r, 'root', 2), before[0][2]);
    const g = anm.setMatrix(o, 1, 'gun', m); // frame 1 had no chunk
    near(anm.matrixAt(g, 'gun', 1), m);
    const gt = tracks(g);
    for (const bb of [0, 1]) for (let f = 0; f < 6; f++) near(gt[bb][f], before[bb][f], 1e-3);
    assert.equal(g.chunks.filter(c => c.recs).map(c => c.index).join(), '0,1,2,4');
    const n = anm.setMatrix(anm.parse(frmn()), 1, 'b', M1);
    const rn = anm.parse(anm.write(n)); assert.deepEqual(Array.from(rn.frame[1][1].matrix), M1);
    const mir = anm.setMatrix(o, 0, 'root', M3); assert.ok(mir.frame[0][0].flags & 4); near(mir.frame[0][0].matrix, M3);
    assert.throws(() => anm.setMatrix(o, 6, 0, M1), RangeError);
  });
  t('model/anm: edits in place on the view are written', () => {
    const o = anm.parse(frm2());
    o.frame[0][0].matrix[9] = 55; o.frame[0][2].visible = false; o.frame[0][3].mesh = null;
    const r = anm.parse(anm.write(o));
    assert.equal(r.frame[0][0].matrix[9], 55); near(r.frame[0][0].matrix, anm.toMatrix(q1, [55, 2, 3], false), 1e-5);
    assert.equal(r.frame[0][2].visible, false); assert.equal(r.frame[0][3].mesh, null);
    const n = anm.parse(frmn()); n.frame[0][1].matrix[10] = -3; n.frame[0][0].visible = false;
    const rn = anm.parse(anm.write(n)); assert.equal(rn.frame[0][1].matrix[10], -3); assert.equal(rn.frame[0][0].visible, false);
  });
  t('model/anm: insertFrame / deleteFrames keep the other frames', () => {
    const o = anm.parse(frm2()), tr = tracks(o);
    const ins = anm.insertFrame(o, 3, 0), ti = tracks(ins);
    assert.equal(ins.frames, 7);
    for (let b = 0; b < 3; b++) {
      near(ti[b][3], tr[b][0], 1e-3);
      for (let f = 0; f < 6; f++) near(ti[b][f < 3 ? f : f + 1], tr[b][f], 1e-3);
    }
    same(anm.write(ins));
    const del = anm.deleteFrames(o, 1, 2), td = tracks(del);
    assert.equal(del.frames, 4);
    for (let b = 0; b < 3; b++) for (const f of [0, 3, 4, 5]) near(td[b][f < 1 ? f : f - 2], tr[b][f], 1e-3);
    const d0 = anm.deleteFrames(o, 0, 0), t0 = tracks(d0);
    for (let b = 0; b < 3; b++) for (let f = 1; f < 6; f++) near(t0[b][f - 1], tr[b][f], 1e-3);
    assert.throws(() => anm.deleteFrames(o, 0, 5), RangeError);
    const nd = anm.deleteFrames(anm.parse(frmn()), 1); same(anm.write(nd)); assert.equal(nd.frames, 2);
  });
  t('model/anm: reverse', () => {
    const o = anm.parse(frm2()), tr = tracks(o), rv = anm.reverse(o), trv = tracks(rv);
    for (let b = 0; b < 3; b++) for (const f of [0, 2, 4, 5]) near(trv[b][5 - f], tr[b][f], 1e-3);
    const back = tracks(anm.reverse(rv));
    for (let b = 0; b < 3; b++) for (let f = 0; f < 6; f++) near(back[b][f], tr[b][f], 1e-3);
    assert.deepEqual(rv.problems, []);
    assert.ok(rv.frame[5][3].mesh); // mesh event moved with its frame
    const n = anm.parse(frmn()), tn = tracks(n), rn = tracks(anm.reverse(n));
    for (let b = 0; b < 3; b++) for (let f = 0; f < 3; f++) near(rn[b][2 - f], tn[b][f], 1e-3);
  });
};

if (require.main === module) {
  const assert = require('assert');
  let n = 0, bad = 0;
  module.exports((name, fn) => { try { fn(); n++; } catch (e) { bad++; console.log('FAIL ' + name + ': ' + e.message); } }, assert);
  console.log(bad ? `${bad} failed, ${n} passed` : `${n} passed`);
  if (bad) process.exitCode = 1;
}

// lib/model/vol.js unit tests (synthetic .vol only). run alone: node tools/lib/test/model-vol.test.js
// Author: Imperator_Aug (ARSENAL, ia-45fa1afb)
module.exports = (t, assert) => {
  const vol = require('../model/vol');
  const i32 = n => { const b = Buffer.alloc(4); b.writeInt32LE(n); return b; };
  const T = s => Buffer.from(s, 'latin1');
  const f32 = a => { const b = Buffer.alloc(a.length * 4); a.forEach((x, i) => b.writeFloatLE(x, i * 4)); return b; };
  const u16 = a => { const b = Buffer.alloc(a.length * 2); a.forEach((x, i) => b.writeUInt16LE(x, i * 2)); return b; };
  // one tetrahedron, vanilla winding (cross(b-a,c-a) inward)
  const V = [0, 0, 0, 10, 0, 0, 0, 10, 0, 0, 0, 10], I = [0, 1, 2, 0, 3, 1, 0, 2, 3, 1, 3, 2];
  const vert = Buffer.concat([T('VERT'), i32(4), f32(V)]), indx = Buffer.concat([T('INDX'), i32(12), u16(I)]);
  const side = Buffer.concat([T('SIDE'), i32(4), Buffer.from([6, 4, 5, 7])]);
  const withSide = Buffer.concat([T('EVLM'), vert, indx, side]), noSide = Buffer.concat([T('EVLM'), vert, indx]);

  t('vol: parse with SIDE + round trip', () => {
    const o = vol.parse(withSide);
    assert.equal(o.error, null); assert.equal(o.magic, 'EVLM'); assert.equal(o.version, null);
    assert.deepEqual([...o.vertices], V); assert.deepEqual([...o.faces], I); assert.deepEqual([...o.sides], [6, 4, 5, 7]);
    assert.deepEqual(o.chunks.map(c => [c.tag, c.offset, c.count]), [['VERT', 4, 4], ['INDX', 60, 12], ['SIDE', 92, 4]]);
    assert.ok(vol.write(o).equals(withSide));
  });
  t('vol: no SIDE -> sides null, warning, round trip', () => {
    const o = vol.parse(noSide);
    assert.equal(o.error, null); assert.equal(o.sides, null); assert.match(o.warnings.join(), /no SIDE/);
    assert.ok(vol.write(o).equals(noSide));
  });
  t('vol: NaN bits and odd INDX count kept', () => {
    const nan = Buffer.from([1, 0, 0xc0, 0x7f]);
    const b = Buffer.concat([T('EVLM'), T('VERT'), i32(1), nan, f32([1, 2]), T('INDX'), i32(4), u16([0, 0, 0]), T('SIDE'), i32(1), Buffer.from([1])]);
    const o = vol.parse(b);
    assert.equal(o.error, null); assert.equal(o.faces.length, 3); assert.match(o.warnings.join(), /multiple of 3/);
    assert.ok(vol.write(o).equals(b));
  });
  t('vol: changed object rewritten with counts', () => {
    const o = vol.parse(withSide);
    o.vertices = Float32Array.from([...V, 5, 5, 5]); o.faces = Uint16Array.from([...I, 0, 1, 4]); o.sides = Uint8Array.from([1, 2, 3, 4, 5]);
    const p = vol.parse(vol.write(o));
    assert.equal(p.error, null); assert.equal(p.vertices.length, 15); assert.equal(p.faces.length, 15); assert.deepEqual([...p.sides], [1, 2, 3, 4, 5]);
    assert.deepEqual(p.chunks.map(c => c.count), [5, 15, 5]);
    o.sides = null; assert.ok(vol.write(o).indexOf('SIDE') < 0);
    const q = vol.parse(noSide); q.sides = Uint8Array.from([1, 1, 1, 1]);
    assert.deepEqual(vol.parse(vol.write(q)).chunks.map(c => c.tag), ['VERT', 'INDX', 'SIDE']);
  });
  t('vol: several SIDE chunks append; kept raw untouched, merged when changed', () => {
    const b = Buffer.concat([T('EVLM'), vert, indx, T('SIDE'), i32(2), Buffer.from([1, 2]), T('SIDE'), i32(2), Buffer.from([3, 4])]);
    const o = vol.parse(b);
    assert.deepEqual([...o.sides], [1, 2, 3, 4]); assert.ok(vol.write(o).equals(b));
    o.sides[0] = 5; const p = vol.parse(vol.write(o));
    assert.deepEqual([...p.sides], [5, 2, 3, 4]); assert.equal(p.chunks.length, 3);
  });
  t('vol: truncated + garbage give error, no throw', () => {
    for (let n = 0; n < withSide.length; n++) {
      const o = vol.parse(withSide.subarray(0, n));
      if (n === 0 || n === 4 || n === 60 || n === 92) continue; // whole-chunk boundaries parse cleanly (n=0: error)
      assert.ok(o.error, 'cut at ' + n);
    }
    assert.equal(vol.parse(Buffer.alloc(0)).error, 'truncated: no magic');
    assert.equal(vol.parse(T('XXXXjunk')).error, 'bad magic');
    assert.equal(vol.parse('nope').error, 'not a buffer');
    const g = Buffer.concat([T('EVLM'), vert, T('BNDS'), i32(1), Buffer.alloc(9)]);
    const o = vol.parse(g);
    assert.match(o.error, /Invalid block/); assert.equal(o.vertices.length, 12);
    assert.ok(vol.write(o).equals(g));            // raw tail carried
    assert.match(vol.parse(Buffer.concat([T('EVLM'), T('VERT'), i32(-1)])).error, /negative/);
    const rnd = Buffer.alloc(300); let s = 7; for (let i = 0; i < rnd.length; i++) rnd[i] = (s = (s * 1103515245 + 12345) >>> 0) >>> 24;
    T('EVLM').copy(rnd); assert.ok(vol.parse(rnd).error);
  });
  t('vol: helpers', () => {
    const o = vol.parse(withSide);
    const tr = vol.triangles(o);
    assert.equal(tr.length, 4); assert.deepEqual(tr[1].p, [0, 0, 0, 0, 0, 10, 10, 0, 0]);
    assert.deepEqual(tr.map(x => [x.side, x.material]), [[6, 5], [4, 3], [5, 4], [7, 0]]);
    assert.deepEqual(vol.bounds(o), { min: [0, 0, 0], max: [10, 10, 10] });
    assert.equal(vol.bounds(vol.parse(Buffer.concat([T('EVLM'), T('VERT'), i32(0)]))), null);
    const m = vol.transform(o, [0, 1, 0, -1, 0, 0, 0, 0, 1, 100, 0, 0]); // x -> +Y, y -> -X, then +100 X
    assert.deepEqual(vol.bounds(m), { min: [90, 0, 0], max: [100, 10, 10] });
    assert.deepEqual([...o.vertices], V);        // input untouched
    assert.equal(vol.parse(vol.write(m)).vertices[3], 100);
    assert.equal(vol.material(7), 0); assert.equal(vol.material(1), 0); assert.equal(vol.material(6), 5); assert.equal(vol.material(0), -1);
    assert.deepEqual([[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1], [1, 1, 0], [0, 2, 2], [0.1, -0.2, -0.9]].map(vol.faceSideFromNormal), [1, 5, 3, 4, 2, 6, 1, 3, 6]);
  });
  t('vol: fromBox / fromTriangles', () => {
    const b = vol.fromBox([4, 6, 2]);
    assert.equal(b.vertices.length, 24); assert.equal(b.faces.length, 36);
    assert.deepEqual(vol.bounds(b), { min: [-2, -3, -1], max: [2, 3, 1] });
    // stored sides match the outward normal (= -cross, vanilla winding)
    for (const x of vol.triangles(b)) assert.equal(vol.faceSideFromNormal(vol.normal(x.p).map(v => -v)), x.side);
    assert.deepEqual([...b.sides].sort().join(''), '112233445566');
    const back = vol.parse(vol.write(b));
    assert.equal(back.error, null); assert.deepEqual([...back.sides], [...b.sides]); assert.deepEqual([...back.vertices], [...b.vertices]);
    const p = vol.triangles(b).flatMap(x => x.p);
    const g = vol.fromTriangles(p, null);
    assert.deepEqual([...g.sides], [...b.sides]); assert.equal(g.vertices.length, 24);
    assert.deepEqual([...vol.fromTriangles(p.slice(0, 9), [3]).sides], [3]);
  });
};

if (require.main === module) {
  const assert = require('assert'); let n = 0, bad = 0;
  module.exports((name, fn) => { try { fn(); n++; } catch (e) { bad++; console.log('FAIL ' + name + ': ' + e.message); } }, assert);
  console.log(bad ? `FAIL ${bad} failed, ${n} passed` : `${n} passed\nPASS`);
  process.exitCode = bad ? 1 : 0;
}

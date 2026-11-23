// lib/model/trace.js unit tests: sides per shape from six directions, moved boxes, grazing/miss/inside, polyhedron
// cube with SIDE data == box, traceAll order, angle helpers. Run alone: node tools/lib/test/model-trace.test.js
// Author: Imperator_Aug (ARSENAL, ia-88c9632f)
module.exports = (t, assert) => {
  const tr = require('../model/trace');
  const { SIDE } = tr;
  const I = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
  const at = (x, y, z) => [1, 0, 0, 0, 1, 0, 0, 0, 1, x, y, z];
  const near = (a, b, eps = 1e-6) => {
    if (Array.isArray(a)) a.forEach((v, i) => near(v, b[i], eps));
    else assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);
  };
  // the six head-on shots: ray from far out along +axis/-axis toward the centre, and the side it enters by
  const SHOTS = [
    { from: [1, 0, 0], side: SIDE.FRONT, out: SIDE.REAR },
    { from: [-1, 0, 0], side: SIDE.REAR, out: SIDE.FRONT },
    { from: [0, 1, 0], side: SIDE.LEFT, out: SIDE.RIGHT },
    { from: [0, -1, 0], side: SIDE.RIGHT, out: SIDE.LEFT },
    { from: [0, 0, 1], side: SIDE.TOP, out: SIDE.BOTTOM },
    { from: [0, 0, -1], side: SIDE.BOTTOM, out: SIDE.TOP },
  ];
  const shot = (from, dist = 1000, c = [0, 0, 0]) => ({
    origin: [c[0] + from[0] * dist, c[1] + from[1] * dist, c[2] + from[2] * dist], dir: from.map(v => -v) });
  // a cube as a .vol: faces wound with cross(b-a,c-a) pointing inward (as every vanilla .vol), SIDE byte = side + 1
  function cube(h) {
    const tris = [], sides = [];
    const faces = [[0, 1, SIDE.FRONT], [0, -1, SIDE.REAR], [1, 1, SIDE.LEFT], [1, -1, SIDE.RIGHT], [2, 1, SIDE.TOP], [2, -1, SIDE.BOTTOM]];
    for (const [a, s, side] of faces) {
      const u = (a + 1) % 3, v = (a + 2) % 3;
      const P = (pu, pv) => { const p = [0, 0, 0]; p[a] = s * h[a]; p[u] = pu * h[u]; p[v] = pv * h[v]; return p; };
      for (const tri of [[P(-1, -1), P(1, -1), P(1, 1)], [P(-1, -1), P(1, 1), P(-1, 1)]]) {
        const e1 = tri[1].map((x, i) => x - tri[0][i]), e2 = tri[2].map((x, i) => x - tri[0][i]);
        const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
        if (n[a] * s > 0) tri.reverse(); // make it point inward
        tris.push(...tri.flat()); sides.push(side + 1);
      }
    }
    return { triangles: tris, sides };
  }

  t('trace: SIDE table and names', () => {
    assert.deepEqual([SIDE.FRONT, SIDE.TOP, SIDE.LEFT, SIDE.RIGHT, SIDE.REAR, SIDE.BOTTOM], [0, 1, 2, 3, 4, 5]);
    assert.equal(tr.sideName(SIDE.LEFT), 'left'); assert.equal(tr.sideName(9), 'side?9');
    assert.deepEqual([1, 6, 7, 255, 0].map(tr.sideFromVolByte), [0, 5, 0, 0, -1]);
  });

  t('trace: box six directions, full size, centred', () => {
    const box = { matrix: I, size: [40, 20, 10] };
    for (const s of SHOTS) {
      const h = tr.rayBox(shot(s.from), box);
      assert.ok(h, 'hit from ' + s.from);
      assert.equal(h.sideIn, s.side, 'side from ' + s.from); assert.equal(h.sideOut, s.out);
      near(h.normalIn, s.from); near(h.normalOut, s.from.map(v => -v));
      const half = [20, 10, 5][s.from.findIndex(v => v)];
      near(h.tIn, 1000 - half); near(h.tOut, 1000 + half); near(h.length, 2 * half);
      assert.equal(h.inside, false);
    }
  });

  t('trace: rotated and moved box', () => {
    // local X -> world +Y, local Y -> world -X; centre at (100,50,7)
    const box = { matrix: [0, 1, 0, -1, 0, 0, 0, 0, 1, 100, 50, 7], size: [40, 20, 10] };
    let h = tr.rayBox({ origin: [100, 500, 7], dir: [0, -2, 0] }, box); // from world +Y = local +X
    assert.equal(h.sideIn, SIDE.FRONT); near(h.normalIn, [0, 1, 0]); near(h.pointIn, [100, 70, 7]);
    near(h.tIn, (500 - 70) / 2); // t in units of dir
    h = tr.rayBox({ origin: [0, 50, 7], dir: [1, 0, 0] }, box); // from world -X = local +Y
    assert.equal(h.sideIn, SIDE.LEFT); assert.equal(h.sideOut, SIDE.RIGHT); near(h.pointIn, [90, 50, 7]);
    assert.equal(tr.rayBox({ origin: [0, 500, 7], dir: [0, -1, 0] }, box), null);
    near(tr.transformPoint(tr.invertRigid(box.matrix), [100, 70, 7]), [20, 0, 0]);
    near(tr.invert(box.matrix), tr.invertRigid(box.matrix));
  });

  t('trace: grazing, miss, behind, inside, zero dir', () => {
    const box = { matrix: I, size: [20, 20, 20] };
    assert.equal(tr.rayBox({ origin: [-100, 0, 10], dir: [1, 0, 0] }, box), null, 'along the top face plane');
    assert.ok(tr.rayBox({ origin: [-100, 0, 9.99], dir: [1, 0, 0] }, box), 'just under it');
    assert.equal(tr.rayBox({ origin: [-100, 0, 0], dir: [1, 0, 0.5] }, box), null, 'passes over');
    assert.equal(tr.rayBox({ origin: [-100, 10, 10], dir: [1, 0, 0] }, box), null, 'exact edge: engine misses');
    assert.equal(tr.rayBox({ origin: [100, 0, 0], dir: [1, 0, 0] }, box), null, 'box behind');
    const h = tr.rayBox({ origin: [0, 0, 0], dir: [0, 3, 0] }, box);
    assert.equal(h.inside, true); assert.equal(h.tIn, 0); assert.equal(h.sideIn, SIDE.FRONT);
    near(h.normalIn, [0, 1, 0]); assert.equal(h.sideOut, SIDE.LEFT); near(h.tOut, 10 / 3);
    assert.equal(tr.rayBox({ origin: [0, 0, 0], dir: [0, 0, 0] }, box), null);
    assert.equal(tr.raySphere({ origin: [0, 0, 0], dir: [0, 0, 0] }, { matrix: I, radius: 5 }), null);
    assert.equal(tr.rayBox({ origin: [-100, 0, 0], dir: [1, 0, 0] }, { matrix: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], size: [1, 1, 1] }), null);
  });

  t('trace: cylinder (axis local Z, length full) and sphere: always FRONT', () => {
    const cyl = { matrix: at(0, 0, 100), radius: 10, length: 40 };
    for (const s of SHOTS) {
      const h = tr.rayCylinder(shot(s.from, 1000, [0, 0, 100]), cyl);
      assert.ok(h); assert.equal(h.sideIn, SIDE.FRONT); assert.equal(h.sideOut, SIDE.FRONT);
      near(h.normalIn, s.from);
      near(h.tIn, 1000 - (s.from[2] ? 20 : 10));
    }
    assert.equal(tr.rayCylinder({ origin: [-100, 0, 121], dir: [1, 0, 0] }, cyl), null, 'above the cap');
    let h = tr.rayCylinder({ origin: [-100, 0, 130], dir: [100, 0, -20] }, cyl); // slanted, meets the wall at z 112
    assert.ok(h); near(h.normalIn, [-1, 0, 0]);
    h = tr.rayCylinder({ origin: [0, 0, 100], dir: [1, 0, 0] }, cyl);
    assert.equal(h.inside, true); near(h.tOut, 10);
    const sph = { matrix: at(5, 5, 5), radius: 10 };
    for (const s of SHOTS) {
      const r = tr.raySphere(shot(s.from, 1000, [5, 5, 5]), sph);
      assert.equal(r.sideIn, SIDE.FRONT); near(r.normalIn, s.from); near(r.tIn, 990);
    }
    assert.equal(tr.raySphere({ origin: [-100, 20, 5], dir: [1, 0, 0] }, sph), null);
    assert.equal(tr.raySphere({ origin: [100, 5, 5], dir: [1, 0, 0] }, sph), null, 'behind');
  });

  t('trace: polyhedron cube with SIDE data equals the box', () => {
    const size = [40, 20, 10], c = cube(size.map(v => v / 2));
    const mats = [I, [0, 1, 0, -1, 0, 0, 0, 0, 1, 100, 50, 7], [0.8, 0, -0.6, 0, 1, 0, 0.6, 0, 0.8, -3, 4, 12]];
    for (const m of mats) {
      const box = { matrix: m, size }, poly = { matrix: m, triangles: c.triangles, sides: c.sides };
      const rays = SHOTS.map(s => { const o = tr.transformPoint(m, s.from.map(v => v * 500)); return { origin: o, dir: tr.transformDir(m, s.from.map(v => -v)) }; });
      rays.push({ origin: [-300, 3, 2], dir: [1, 0.01, 0.02] }, { origin: [7, -300, 9], dir: [0.03, 1, -0.01] });
      for (const ray of rays) {
        const a = tr.rayBox(ray, box), b = tr.rayPolyhedron(ray, poly);
        assert.equal(!!a, !!b);
        if (!a) continue;
        assert.equal(b.sideIn, a.sideIn); assert.equal(b.sideOut, a.sideOut);
        near(b.tIn, a.tIn, 1e-4); near(b.tOut, a.tOut, 1e-4); near(b.normalIn, a.normalIn, 1e-6); near(b.normalOut, a.normalOut, 1e-6);
        near(b.length, a.length, 1e-4);
      }
    }
    const poly = { matrix: I, triangles: c.triangles, sides: c.sides };
    const h = tr.rayPolyhedron({ origin: [0, 0, 0], dir: [-1, 0, 0] }, poly);
    assert.equal(h.inside, true); assert.equal(h.sideOut, SIDE.REAR); near(h.tOut, 20, 1e-4);
    assert.equal(tr.rayPolyhedron({ origin: [-300, 50, 0], dir: [1, 0, 0] }, poly), null);
    // no SIDE data: FRONT; side byte 0 reads -1 as in the engine
    assert.equal(tr.rayPolyhedron({ origin: [0, 0, 300], dir: [0, 0, -1] }, { matrix: I, triangles: c.triangles }).sideIn, SIDE.FRONT);
    assert.equal(tr.rayPolyhedron({ origin: [0, 0, 300], dir: [0, 0, -1] }, { matrix: I, triangles: c.triangles, sides: c.sides.map(() => 0) }).sideIn, -1);
  });

  t('trace: traceAll order and events', () => {
    const shapes = [
      { id: 'b/far', matrix: at(200, 0, 0), size: [10, 10, 10] },
      { id: 'b/near', matrix: at(50, 0, 0), size: [10, 10, 10] },
      { id: 'b/miss', matrix: at(100, 100, 0), size: [10, 10, 10] },
      { id: 'b/sph', matrix: at(100, 0, 0), radius: 5 },
      { id: 'b/cyl', kind: 'cylinder', matrix: at(150, 0, 0), radius: 5, length: 10 },
      { id: 'b/around', matrix: at(0, 0, 0), size: [10, 10, 10] },
    ];
    const hits = tr.traceAll({ origin: [0, 0, 0], dir: [1, 0, 0] }, shapes);
    assert.deepEqual(hits.map(h => h.id), ['b/around', 'b/near', 'b/sph', 'b/cyl', 'b/far']);
    assert.deepEqual(hits.map(h => h.kind), ['box', 'box', 'sphere', 'cylinder', 'box']);
    const ev = tr.traceEvents({ origin: [0, 0, 0], dir: [1, 0, 0] }, shapes);
    assert.equal(ev.length, 10); near(ev[0].t, 0.001); assert.equal(ev[0].inside, true);
    assert.deepEqual(ev.slice(1, 4).map(e => [e.id, e.enter]), [['b/around', false], ['b/near', true], ['b/near', false]]);
    shapes[5].hole = true;
    assert.equal(tr.traceEvents({ origin: [0, 0, 0], dir: [1, 0, 0] }, shapes)[0].t, 0);
    assert.deepEqual(tr.traceAll({ origin: [0, 0, 0], dir: [0, 0, 0] }, shapes), []);
  });

  t('trace: angle helpers', () => {
    near(tr.angleOfIncidence([1, 0, 0], [-1, 0, 0]), 0);
    near(tr.angleOfIncidence([1, 0, 0], [-0.5, Math.sqrt(3) / 2, 0]), 60, 1e-9);
    near(tr.angleOfIncidence([0, 3, 0], [1, 0, 0]), 90);
    near(tr.angleOfIncidence([2, 0, 0], [3, 0, 0]), 0);
    near(tr.lineOfSightThickness(10, 60), 20, 1e-9);
    near(tr.lineOfSightThickness(10, 0), 10);
    assert.equal(tr.lineOfSightThickness(10, 90), Infinity);
  });
};

if (require.main === module) {
  const assert = require('assert');
  let n = 0, fail = 0;
  const t = (name, fn) => { try { fn(); n++; } catch (e) { fail++; console.log('FAIL ' + name + ': ' + e.message); } };
  module.exports(t, assert);
  console.log(fail ? `${fail} failed, ${n} passed` : `${n} passed\nPASS`);
  process.exitCode = fail ? 1 : 0;
}

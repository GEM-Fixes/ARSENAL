// MB-R9 harness-edrun:94 seeded test: mappick.lineCheck and preflight's terrain hold. A 40x40 cell-10 flat map with a 5-high ridge at row 20.
// Author: Imperator_Aug (ARSENAL, ia-368c9be7)
const assert = require('assert'), mp = require('../mappick'), pf = require('../preflight');
const W = 40, H = 40, cells = Buffer.alloc(W * H * 4);
const net = { cell: 10, width: W, height: H, bytesPer: 4, cells, types: [{ index: 0, name: 'ground' }], materials: [] };
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const o = (y * W + x) * 4; cells.writeInt16LE(y === 20 ? 5 : 0, o); cells[o + 2] = 0; }
const map = { name: 't', net, x0: 0, y0: 0, clip: [0, 0, 400, 400], ents: [[100, 200]] };
assert.strictEqual(mp.heightAt(map, 100, 200), 5);
const over = mp.lineCheck(map, { x: 100, y: 50 }, { x: 100, y: 350 });          // crosses the ridge
assert.ok(over.block && /terrain 5/.test(over.block), 'ridge must block: ' + JSON.stringify(over));
assert.strictEqual(over.ents, 1);
const along = mp.lineCheck(map, { x: 50, y: 100 }, { x: 350, y: 100 });         // flat row, no ridge
assert.strictEqual(along.block, null); assert.strictEqual(along.rise, 0);
const off = mp.lineCheck(map, { x: -50, y: 100 }, { x: 350, y: 100 });          // shooter off the map
assert.ok(/no ground height at the shooter/.test(off.unknown));
// preflight: the same pair held BLOCKED with terrain, OK (with the flat-map warning) without
const pairs = [{ name: 'a', class: 'vehicle', shooter: 's', foe: 'f' }], lay = () => ({ s: { x: 100, y: 50 }, f: { x: 100, y: 350 } });
const r1 = pf.check(pairs, lay, { terrain: (s, f) => mp.lineCheck(map, s, f) });
assert.strictEqual(r1.a.status, 'BLOCKED'); assert.ok(/terrain/.test(r1.a.notes.join()));
const r2 = pf.check(pairs, lay, {});
assert.strictEqual(r2.a.status, 'OK'); assert.ok(/no terrain data/.test(r2.a.warns.join()));
const r3 = pf.check(pairs, () => ({ s: { x: 50, y: 100 }, f: { x: 350, y: 100 } }), { terrain: (s, f) => mp.lineCheck(map, s, f) });
assert.strictEqual(r3.a.status, 'OK'); assert.ok(/map terrain checked/.test(r3.a.warns.join()));
// mappick box uses edrun's fire DIST (300) for a vehicle pair with no dist
assert.strictEqual(mp.DIST_FIRE.vehicle, 300);
console.log('terrain-test PASS');

// EDRUN-16: 16 pairs per game, slots 8-15 share sides with 0-7. no game
// Author: Imperator_Aug (ARSENAL, ia-3d4ee805)
const assert = require('assert'), e = require('../edrun.js');
const crew = n => Array(n).fill('mp/rus/tankman');
const veh = (name, shooter, foe, x = {}) => ({ name, class: 'vehicle', shooter, crew: crew(4), foe, foeCrew: crew(4), ...x });
const P16 = Array.from({ length: 16 }, (_, i) => veh('p' + i, 's' + i, i % 2 ? 'gaz67b' : 't34_0'));
let n = 0;
const t = (name, f) => { f(); n++; };

t('twin cells: a permutation, every twin at least 1500 units off', () => {
  assert.deepStrictEqual([...e.TWIN_CELL].sort(), [0, 1, 2, 3, 4, 5, 6, 7]);
  for (let k = 0; k < 8; k++) { const a = e.CELLS[k], b = e.cellOf(8 + k); assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) >= 1500, 'twin ' + k); }
  assert.strictEqual(e.twinIdx(3, 8), null); assert.strictEqual(e.twinIdx(3, 12), 11); assert.strictEqual(e.twinIdx(4, 12), null); assert.strictEqual(e.twinIdx(11, 12), 3);
});
t('8 or fewer: Players block and sides as before', () => {
  assert.strictEqual(e.playersBlock(16), e.playersBlock(8));
  const m8 = e.buildMission(P16.slice(0, 8), 'x', {});
  assert.strictEqual(e.buildMission(P16.slice(0, 8), 'x', {}), m8);
});
t('16: slot 8+k writes slot k sides, inside +-1700, validates with --per-game 16 only', () => {
  const ent = e.entities(P16);
  const sides = [...ent.matchAll(/\{Player (\d+)\}/g)].map(m => +m[1]);
  assert.ok(Math.max(...sides) <= 16, 'no side over 16');
  for (const m of ent.matchAll(/\{Position (-?[\d.]+) (-?[\d.]+)\}/g)) assert.ok(Math.abs(+m[1]) <= 1700 && Math.abs(+m[2]) <= 1700, m[0]);
  assert.deepStrictEqual(e.validate(P16, false, 16), []);
  assert.deepStrictEqual(e.validate(P16.map(p => ({ ...p, dist: 600 })), false, 16), []);
  const L8 = e.layout(P16[8], 8), L0 = e.layout(P16[0], 0);
  assert.notDeepStrictEqual(L8.s, L0.s);
});
t('SHARED: a reach holds the later slot; no weapon passes; unknown warns', () => {
  const ranges = { s8: { weapon: 'gun', aim: 200, max: 250 }, t34_0: { unknown: 'pattern default' }, gaz67b: { unknown: 'def lists no weapon' } };
  const opt = { rangeOf: d => ranges[d] || { weapon: 'w', aim: 10, max: 20 }, minOf: () => ({ unknown: 'stub' }) };
  const r = e.preflightChunk(P16, opt);
  const held = r.held.map(h => h.p.name);
  assert.deepStrictEqual(held, ['p8']);
  assert.strictEqual(r.held[0].r.status, 'SHARED');
  assert.ok(/shares|shared with p0/.test(r.held[0].r.notes.join()), r.held[0].r.notes.join());
  // after the hold p9 slides to slot 8 and shares p0's sides: its range 20 m cannot reach
  assert.strictEqual(r.run.length, 15);
  assert.strictEqual(r.res.p9.twin, 'p0');
  assert.ok(r.res.p9.warns.some(w => /twin reach unknown/.test(w)), 'unknown foe range warns');
  // 8 pairs: no twin fields, nothing held
  const r8 = e.preflightChunk(P16.slice(0, 8), opt);
  assert.strictEqual(r8.held.length, 0); assert.ok(!('twin' in r8.res.p0));
});
t('twin guard: a PASS with no own muzzle line does not count, the twin row says who', () => {
  const pairs = P16.slice(0, 9), times = { start: 1, 'clock 0': 1 }, ticks = {};
  for (const p of pairs) { times[p.name + ' order'] = 5; times[p.name + ' kill'] = 20; ticks[p.name + ' order'] = 10; ticks[p.name + ' kill'] = 30; }
  // KILLPROOF: each kill proven by a damaged mark before the kill mark, so only the twin guard can drop it
  const logText = pairs.map(p => ['order', 'damaged', 'kill'].map(k => 'EDRUN rT ' + p.name + ' ' + k).join('\n')).join('\n');
  const rows = e.rowsOf(pairs, { times, ticks, logText, pipeLines: [] }, {});
  assert.strictEqual(rows[1].proof, 'damage'); assert.strictEqual(rows[1].killVerdict, 'KILL');
  assert.strictEqual(rows[0].twin, 'p8'); assert.strictEqual(rows[8].twin, 'p0'); assert.ok(!('twin' in rows[1]));
  assert.strictEqual(rows[0].verdict, 'PASS'); assert.strictEqual(rows[0].counted, false); assert.strictEqual(rows[0].countReason, 'twin in game: own shot not seen');
  assert.strictEqual(rows[1].counted, true);
  const bare = e.rowsOf(pairs, { times, ticks, logText: '', pipeLines: [] }, {});
  assert.strictEqual(bare[1].counted, false); assert.strictEqual(bare[1].countReason, 'unproven: none'); assert.strictEqual(bare[1].killVerdict, 'KILL_UNPROVEN');
});
console.log(`share-test: ${n} PASS`);

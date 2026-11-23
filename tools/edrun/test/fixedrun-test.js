// Author: Imperator_Aug (ARSENAL, ia-77e0f5ed)
// FIX-EDRUN seeded tests, no game: one block per item (1-7, 9; item 8 is tools/testrun/test/keeplist.js). node fixedrun-test.js
const assert = require('assert'), fs = require('fs'), path = require('path'), os = require('os');
const e = require('../edrun.js'), pf = require('../preflight'), mp = require('../mappick');
const fail = []; let n = 0;
const t = (name, f) => { try { f(); n++; } catch (x) { fail.push(name + ': ' + x.message); } };
const crew = ['mp/rus/tankman'];
const house = { name: 'h', class: 'vehicle', shooter: 't34_0', crew, foe: 'covb_house', static: true, dist: 300 };
const lineOf = (m, k) => m.split('\n').find(l => l.includes(`{"${k}" `)) || '';

// item 1: static aim point on the near face at half wall height, re-ordered every STATIC_REORDER s; foeActor drops the fallen probe; fallen at arm flagged
t('item1: static aim on the near face, z half wall, reorder every 5 s', () => {
  const m = e.buildMission([house], 'rX', {}), L = e.layout(house, 0);
  const wp = /\{"960" \{position (-?[\d.]+) (-?[\d.]+) (-?[\d.]+)\}/.exec(m);
  assert.ok(wp, 'WPS 960 written');
  // foe at +y from the shooter: the near face is HOUSE_R + 5 = 65 short of the centre, toward the shooter
  assert.deepStrictEqual([+wp[1], +wp[2], +wp[3]], [L.f.x, L.f.y - 65, 60]);
  // seeded defect: the pre-fix point was the centre at GROUND_UP 20 (MB-R8: never fired at)
  assert.notDeepStrictEqual([+wp[2], +wp[3]], [L.f.y, 20]);
  const ln = lineOf(m, 'p_h'), d = [...ln.matchAll(/"delay" \{time (\d+)\}/g)].map(x => +x[1]);
  assert.ok(d.length >= 3 && d.every(x => x === e.STATIC_REORDER), 'delays all 5: ' + d.join(','));
  assert.strictEqual(e.reorderOf({ ...house, reorder: 0 }), 0, 'reorder:0 turns it off');
  assert.strictEqual(e.reorderOf({ ...house, static: false, foe: 'gaz67b' }), undefined, 'not on a vehicle foe');
  assert.ok(m.includes('probe fallen'), 'fallen probe on a plain static');
  assert.ok(!e.buildMission([{ ...house, foeActor: true }], 'rX', {}).includes('probe fallen'), 'foeActor: no fallen probe');
  const sa = e.staticAimOf({ ...house, foeRadius: 20, aimZ: 90 }, L);
  assert.deepStrictEqual([sa.off, sa.z], [25, 90]);
});
t('item1: fallen probe true at arm is flagged as an actor (rowsOf)', () => {
  const ch = { runId: 'rX', times: { start: 1, 'h arm': 2, 'h probe fallen': 2.5, 'h order': 3 }, logText: '', ticks: {}, speed: null };
  const r = e.rowsOf([house], ch, {}, {})[0];
  assert.strictEqual(r.fallenAtArm, true); assert.ok(/foeActor/.test(r.note));
  const ok = e.rowsOf([house], { ...ch, times: { start: 1, 'h arm': 2, 'h order': 3, 'h probe fallen': 30 } }, {}, {})[0];
  assert.ok(!ok.fallenAtArm, 'a later fall is a fall');
});

// item 2: TOOCLOSE on a static reads the near face at half wall height
t('item2: static TOOCLOSE checks the near face, aim at half wall height', () => {
  let got = null;
  const minOf = (s, f, m, o) => { got = o; return { min: 260, by: 'depression', reach: 0, ground: 0, D: 7 }; };
  const lay = p => e.layout(p, 0);
  // centre 300, near face 235: under 260 -> TOOCLOSE; the pre-fix check (centre 300 vs 260) said OK
  const r = pf.check([house], lay, { minOf }).h;
  assert.strictEqual(r.status, 'TOOCLOSE', JSON.stringify(r)); assert.strictEqual(r.near, 235);
  assert.deepStrictEqual(got, { staticFoe: true, foeAim: pf.STATIC_WALL_H / 2 });
  assert.ok(/near face 235.*half wall height 60/.test(r.notes[0]), r.notes[0]);
  // MB-R8 shape: house at 300 with the old man-height min 398.1 was held; at wall height the min is lower and the face clears it
  const r2 = pf.check([house], lay, { minOf: () => ({ min: 180, by: 'depression', reach: 0, ground: 0, D: 7 }) }).h;
  assert.strictEqual(r2.status, 'OK', JSON.stringify(r2));
  assert.strictEqual(pf.check([{ ...house, aimZ: 100 }], lay, { minOf }).h && got.foeAim, 100, 'aimZ reaches the reader');
  // a vehicle foe is unchanged: centre dist, no opts
  got = 'unset'; pf.check([{ ...house, static: false, foe: 'gaz67b', foeCrew: crew }], lay, { minOf });
  assert.strictEqual(got, undefined);
});
t('item2: makeRangeReader.minOf forwards margin and opts (the old wrapper dropped them)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'preflight.js'), 'utf8');
  assert.ok(/fn\.minOf = \(shooter, foe, margin, o\) =>[^\n]*\(shooter, foe, margin, o\)/.test(src));
});

// item 3: a def not in the mounted stack is held before launch
t('item3: NOUNIT / NOSPAWN before launch', () => {
  const lay = p => e.layout(p, 0);
  const have = new Set(['t34_0', 'pz6bh']);
  const existsOf = d => have.has(d);
  const p = { name: 'a', class: 'vehicle', shooter: 'pz6bh', crew, foe: 'uk-staghound_mk2', foeCrew: crew, dist: 400 };
  const r = pf.check([p], lay, { existsOf }).a;
  assert.strictEqual(r.status, 'NOSPAWN'); assert.ok(/foe uk-staghound_mk2/.test(r.notes[0]));
  assert.strictEqual(pf.check([{ ...p, shooter: 'nosuch' }], lay, { existsOf }).a.status, 'NOUNIT');
  assert.strictEqual(pf.check([{ ...p, foe: 't34_0' }], lay, { existsOf }).a.status, 'OK');
  assert.strictEqual(pf.check([{ ...p, noExistCheck: true }], lay, { existsOf }).a.status, 'OK');
  // infantry breeds are not looked up; index not built (undefined) only warns
  assert.strictEqual(pf.check([{ name: 'i', class: 'infantry', shooter: 'mp/ger/rifle', foe: 'mp/rus/rifle' }], lay, { existsOf: () => false }).i.status, 'OK');
  const u = pf.check([p], lay, { existsOf: () => undefined }).a;
  assert.strictEqual(u.status, 'OK'); assert.ok(u.warns.some(w => /not looked up/.test(w)));
  // seeded defect: without the lookup the same pair said OK (MB-R6 e1: di_stag uk-staghound, NOSPAWN after the game)
  assert.strictEqual(pf.check([p], lay, {}).a.status, 'OK');
});

// item 4: timeout with the game alive and no start mark = still loading
t('item4: still loading at timeout', () => {
  const p = { name: 'a', class: 'vehicle', shooter: 'pz6bh', crew, foe: 't34_0', foeCrew: crew, dist: 400 };
  const ch = { runId: 'rX', times: {}, logText: '', ticks: {}, speed: null, loadTimeout: true, elapsed: 300.2, loadSecs: 60 };
  const r = e.rowsOf([p], ch, {}, {})[0];
  assert.strictEqual(r.verdict, 'ERROR'); assert.ok(/still loading at timeout: no start mark after 300 s.*--load-secs 60.*raise --load-secs/.test(r.note), r.note);
  const r0 = e.rowsOf([p], { ...ch, loadTimeout: false }, {}, {})[0];
  assert.ok(/mission never started/.test(r0.note), 'game gone or stopped early keeps the old note');
});

// item 5: infantry spawn heading and the second early re-issue
t('item5: infantry men face the foe ({xform zl 90}) and get a 15 s re-issue', () => {
  const p = { name: 'inf', class: 'infantry', shooter: 'mp/ger/rifle', count: 2, foe: 'mp/rus/rifle' };
  const m = e.buildMission([p], 'rX', {});
  const sh = [...m.matchAll(/\{Human "mp\/ger\/rifle" 0x[0-9a-f]+\n\t\t\{Position [^\n]*\n\t\t\{xform zl (\d+)\}/g)];
  assert.strictEqual(sh.length, 2, 'both shooter men turned'); assert.strictEqual(+sh[0][1], e.INF_FACE);
  assert.strictEqual(e.early2Of(p), e.EARLY_ORDER2);
  assert.ok(/inf reorder 0b/.test(lineOf(m, 'p_inf')));
  assert.strictEqual(e.early2Of({ ...p, early: 8 }), 0, 'an own early: no second');
  assert.strictEqual(e.early2Of({ ...p, once: true }), 0);
  assert.strictEqual(e.early2Of({ name: 'v', class: 'vehicle', shooter: 'pz6bh', crew, foe: 't34_0' }), 0, 'vehicles: none');
});

// item 6: mappick water level and snow
t('item6: water level from the map text, cells at or under it are water; snow fallback', () => {
  assert.strictEqual(mp.waterOf('{Clips\n\t\t{water -58}\n\t}\n\t{Ocean\n\t\t{active}\n\t\t{zlevel -40}\n\t}\n'), -40);
  assert.strictEqual(mp.waterOf('\t{Ocean\n\t\t{zlevel -40}\n\t}\n{water -58}'), -58, 'inactive ocean: the clip water');
  assert.strictEqual(mp.waterOf('{world 0 0 1 1}'), null);
  // a 10x10 map, cell 10: types ground (0) / snow (1); heights 0 except a low strip
  const cells = [];
  const net = { cell: 10, width: 10, height: 10, types: ['ground', 'snow'], cells };
  const mapnet = require('../../lib/mapnet');
  const old = { cellAt: mapnet.cellAt, typeName: mapnet.typeName };
  mapnet.cellAt = (m, x, y) => m.cells[y * m.width + x];
  mapnet.typeName = (m, id) => m.types[id];
  try {
    for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) cells.push({ height: x < 2 ? -60 : 0, type: 0 });
    const map = { net, x0: 0, y0: 0, water: -58 };
    assert.strictEqual(mp.heightAt(map, 5, 5), null, 'under the water surface');
    assert.strictEqual(mp.heightAt(map, 50, 50), 0);
    assert.strictEqual(mp.heightAt({ ...map, water: null }, 5, 5), -60, 'seeded defect: no water level read -> the river bed is ground');
    for (const c of cells) c.type = 1;
    assert.strictEqual(mp.heightAt(map, 50, 50), null, 'snow refused by default');
    assert.strictEqual(mp.heightAt({ ...map, walk: mp.SNOW_WALK }, 50, 50), 0, 'snow walkable when allowed');
    assert.strictEqual(mp.snowShare(net), 1);
  } finally { Object.assign(mapnet, old); }
});

// item 7: --hold
t('item7: --hold keeps polling N s after all pairs ended; a crash never holds', () => {
  assert.strictEqual(e.stopNow(false, false, 0, 1000, 30), false);
  assert.strictEqual(e.stopNow(true, false, 1000, 1000, 0), true, 'no hold: stop at once');
  assert.strictEqual(e.stopNow(true, false, 1000, 20000, 30), false, 'held');
  assert.strictEqual(e.stopNow(true, false, 1000, 31000, 30), true, 'hold over');
  assert.strictEqual(e.stopNow(true, true, 1000, 1000, 30), true, 'crash');
  const src = fs.readFileSync(path.join(__dirname, '..', 'edrun.js'), 'utf8');
  assert.ok(src.length > 0 && e.KNOWN_ARGS.includes('hold'), '--hold is a known arg');   // SPEED-B3: the arg list is KNOWN_ARGS (shared with --list jobs)
});

// item 9: secs scaling and the overcap control in a move-only game
t('item9: --secs grows per pair type, capped; --no-scale-secs keeps it', () => {
  const mv = { name: 'sm_1', class: 'vehicle', shooter: 'pz6bh', crew, move: { dy: 400 } }, ctl = { name: 'ctlpz', class: 'vehicle', shooter: 'pz6bh', crew, foe: 't34_0', control: true };
  assert.deepStrictEqual(e.secsOf([mv, ctl], 75, false), { secs: 150, scaled: true, asked: 75 });
  assert.deepStrictEqual(e.secsOf([mv, ctl], 75, true), { secs: 75, scaled: false });
  assert.deepStrictEqual(e.secsOf([mv], 240, false), { secs: 240, scaled: false }, 'never shrinks');
  assert.ok(e.secsOf([mv], 285, false).secs <= 285);
});
t('item9: C39R r1-g1 replay: overcap control in a move-only game keeps the game, weak', () => {
  const f = process.env.C39R_REPORT || ''; // the saved C39R run/C39R/runs/r1-g1/report.json when set
  let rows;
  if (fs.existsSync(f)) rows = JSON.parse(fs.readFileSync(f, 'utf8')).pairs.filter(r => r.game === 0 || r.game === undefined);
  else rows = [{ name: 'ctlpz', control: true, verdict: 'PASS', counted: false, countReason: 'overcap' }, { name: 'sm_1', verdict: 'PASS', counted: null, moved: 3, arrived: 30 }];
  const c = e.controlsOf(rows);
  assert.strictEqual(c.void, false, JSON.stringify(c)); assert.strictEqual(c.weak, true);
  // a fire pair in the game: an overcap control still voids it
  const fire = [{ name: 'ctlpz', control: true, verdict: 'PASS', counted: false, countReason: 'overcap' }, { name: 'f1', verdict: 'PASS', counted: true }];
  assert.strictEqual(e.controlsOf(fire).void, true);
});

if (fail.length) { console.log('FAIL fixedrun -- ' + fail.join('\n ')); process.exit(1); }
console.log(`PASS fixedrun ${n}`);

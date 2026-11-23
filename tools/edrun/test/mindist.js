// mindist test: synthetic model (no game) + pz6bh from the real game files when present, + preflight TOOCLOSE once wired. node tools/edrun/test/mindist.js
// Author: Imperator_Aug (ARSENAL, ia-1cc303a7)
const assert = require('assert'), fs = require('fs'), path = require('path');
const md = require('../mindist.js'), sdlx = require('../../lib/sdlx'), ix = require('../../entityindex/index.js');
const fail = [];
const t = (name, f) => { try { f(); } catch (x) { fail.push(name + ': ' + x.message); } };
const parse = txt => md.parseBones(ix, sdlx.read(Buffer.from(txt, 'latin1'), { file: 'x.mdl', key: 'x.mdl', open: () => null, onError: () => {}, preInclude: [] }).root);
const flat = { aim: 20, half: 0 };

// a tank like pz6bh: body offset, turret (yaw, no limits), gun_rot (pitch -7..15, rotated frame under a Y-mirrored basis), foresight 100 ahead
const TANK = `{Skeleton {bone "basis" {Orientation 1 0 0 0 -1 0 0 0 1}
 {bone "body" {Position 0 0 25}
  {bone revolute "turret" {Position 0 0 20}
   {bone revolute "gun_rot" {limits -7 15} {Matrix34 1 0 0 0 0 1 0 -1 0 30 0 1}
    {bone "foresight1" {Matrix34 1 0 0 0 1 0 0 0 1 100 0 0}}}}}}}`;
t('parse: chain and world position', () => {
  const m = parse(TANK), f = m.bones.get('foresight1');
  assert.ok(Math.abs(f.W.t[0] - 130) < 1e-9 && Math.abs(f.W.t[2] - 46) < 1e-9, 'world ' + f.W.t);
  assert.deepStrictEqual(m.bones.get('gun_rot').lim, [-7, 15]);
});
t('depression is -7 (not 15), pivot, reach', () => {
  const r = md.minDist(parse(TANK), { link: null, foresight: null }, null, flat, 10);
  assert.ok(!r.unknown, JSON.stringify(r));
  assert.ok(Math.abs(r.D - 7) < 0.01, 'D ' + r.D);
  assert.deepStrictEqual(r.pivot, [30, 46]);
  assert.ok(Math.abs(r.reach - 130) < 0.01, 'reach ' + r.reach);
  assert.ok(Math.abs(r.maxElev - 15) < 0.01, 'maxElev ' + r.maxElev);
});
t('min = max(reach+margin, depression ray)', () => {
  // foresight at -7 deg: x = 30 + 100 cos7 = 129.25, z = 46 - 100 sin7 = 33.8; aim 20 -> 13.8 / tan7 = 112.4 -> 241.7; reach 130 + 10 = 140
  const r = md.minDist(parse(TANK), {}, null, { aim: 20, half: 0 }, 10);
  assert.ok(Math.abs(r.ground - 241.7) < 0.3, 'ground ' + r.ground);
  assert.strictEqual(r.by, 'depression'); assert.ok(Math.abs(r.min - 241.7) < 0.3);
  const lowFoe = md.minDist(parse(TANK), {}, null, { aim: 40, half: 50 }, 10);   // foe aim above the muzzle: reach + half + margin rules
  assert.strictEqual(lowFoe.by, 'reach'); assert.ok(Math.abs(lowFoe.min - 190) < 0.01, 'min ' + lowFoe.min);
});
t('VOL-FX: def bone limits override the mdl (-10 deeper than -7)', () => {
  const def = sdlx.read(Buffer.from('{game_entity {bone "gun_rot" {speed 0.01} {limits -10 45}}}', 'latin1'), { file: 'x.def', key: 'x.def', open: () => null, onError: () => {}, preInclude: [] }).root;
  const dl = md.defLimitsOf(ix, def);
  assert.deepStrictEqual(dl.get('gun_rot'), [-10, 45]);
  const r = md.minDist(parse(TANK), {}, null, flat, 10, dl), r0 = md.minDist(parse(TANK), {}, null, flat, 10);
  assert.ok(Math.abs(r.D - 10) < 0.01 && r.limFrom === 'def' && r0.limFrom === 'mdl' && r.ground < r0.ground, JSON.stringify([r.D, r.limFrom, r.ground, r0.ground]));
  const free = md.minDist(parse(TANK.replace('{limits -7 15} ', '')), {}, null, flat, 10, dl);
  assert.ok(!free.unknown && Math.abs(free.D - 10) < 0.01, 'def limits on an mdl bone with none');
});
t('no limits -> unknown, never a number', () => {
  const r = md.minDist(parse(TANK.replace('{limits -7 15} ', '')), {}, null, flat, 10);
  assert.ok(r.unknown && r.min === undefined, JSON.stringify(r));
});
t('missing aim bone -> unknown', () => {
  const r = md.minDist(parse(TANK), { foresight: 'nosuch' }, null, flat, 10);
  assert.ok(r.unknown);
});
t('place foresight beats the weapon foresight', () => {
  const two = TANK.replace('}}}}}}}', '}} {bone "foresight4" {Matrix34 1 0 0 0 1 0 0 0 1 60 0 0}}}}}}}');
  const m = parse(two);
  assert.strictEqual(md.chainOf(m, { foresight: 'foresight4' }, 'foresight1').aim.name, 'foresight4');
  assert.strictEqual(md.chainOf(m, {}, 'foresight1').aim.name, 'foresight1');
});
t('rear-facing gun reaches forward by its offset', () => {
  // gun_rot turned 180 deg about z: barrel points -x at zero pose; turret yaw (no limits) swings it round
  const back = TANK.replace('{Matrix34 1 0 0 0 0 1 0 -1 0 30 0 1}', '{Matrix34 -1 0 0 0 0 1 0 1 0 -30 0 1}');
  const r = md.minDist(parse(back), {}, null, flat, 10);
  assert.ok(!r.unknown && r.reach > 0, JSON.stringify(r));
});

// ---- real files: pz6bh and t34_0 from the game, when the install is here
const G = require('../../lib/gamedir').resolve().dir;   // AS2_GAME, as2.json or Steam; null: the real-file checks are skipped
let real = null;
if (G && fs.existsSync(path.join(G, 'resource'))) {
  try { real = md.makeMinReader(G, ['as64+']); } catch (e) { fail.push('index: ' + e.message); }
}
if (real) {
  const pz = real('pz6bh', 't34_0');
  t('pz6bh: -7 deep, 88mm_kwk43 gun place, aim foresight1', () => {
    assert.ok(!pz.unknown, JSON.stringify(pz));
    assert.deepStrictEqual(pz.limits, [-7, 15]); assert.strictEqual(pz.D, 7); assert.strictEqual(pz.aimBone, 'foresight1'); assert.strictEqual(pz.place, 'gun');
    assert.ok(pz.min > 120 && pz.min < 300, 'min ' + pz.min);
    assert.ok(Math.abs(pz.reach - 125) < 1, 'reach ' + pz.reach);
  });
  t('class spread: tank, casemate, light, howitzer, gun have a number; unit with no model is unknown', () => {
    for (const d of ['t34_0', 'pz4h', 'pz2l', 'jagdpanzer_iv', 'zis2', 'lefh18', 'sdkfz8']) { const r = real(d, 't34_0'); assert.ok(r.min > 0, d + ' ' + JSON.stringify(r)); }
    assert.ok(real('no_such_def_zz', 't34_0').unknown);
  });
  t('infantry foe: aim height default, no model read', () => {
    const r = real('pz6bh', 'mp/ger/rifle');
    assert.ok(r.foe.half === 0 && r.foe.aim > 0);
  });
  // ---- preflight wiring: TOOCLOSE at 120, allowed at 300
  const pf = require('../preflight.js');
  const rr = pf.makeRangeReader(G, ['as64+']);
  const lay = p => ({ s: { x: 0, y: 0 }, f: { x: p.dist, y: 0 } });
  const mk = (n, d) => ({ name: n, class: 'vehicle', shooter: 'pz6bh', foe: 't34_0', dist: d });
  const res = pf.check([mk('d120', 120)], lay, { rangeOf: rr });
  const res3 = pf.check([mk('d300', 300)], lay, { rangeOf: rr });
  t('preflight: pz6bh at 120 is TOOCLOSE', () => { assert.strictEqual(res.d120.status, 'TOOCLOSE', JSON.stringify(res.d120)); assert.ok(res.d120.min > 120); });
  t('preflight: pz6bh at 300 is OK', () => { assert.ok(['OK'].includes(res3.d300.status), JSON.stringify(res3.d300)); });
  t('preflight: pair without dist reports the minimum', () => {
    const one = pf.check([{ name: 'nd', class: 'vehicle', shooter: 'pz6bh', foe: 't34_0' }], p => ({ s: { x: 0, y: 0 }, f: { x: 300, y: 0 } }), { rangeOf: rr });
    assert.ok(one.nd.warns.some(w => /smallest usable dist \d/.test(w)), JSON.stringify(one.nd.warns));
  });
  t('preflight: an unknown model is a warning, not a refusal', () => {
    const o = pf.check([{ name: 'u', class: 'vehicle', shooter: 'no_such_def_zz', foe: 't34_0', dist: 50 }], p => ({ s: { x: 0, y: 0 }, f: { x: 50, y: 0 } }), { rangeOf: rr });
    assert.notStrictEqual(o.u.status, 'TOOCLOSE');
  });
  t('preflight: noMinCheck skips', () => {
    const o = pf.check([{ ...mk('s', 120), noMinCheck: true }], lay, { rangeOf: rr });
    assert.notStrictEqual(o.s.status, 'TOOCLOSE');
  });
} else console.log('no game files: real-model tests skipped');

if (fail.length) { console.log('FAIL\n' + fail.join('\n')); process.exit(1); }
console.log('PASS mindist');

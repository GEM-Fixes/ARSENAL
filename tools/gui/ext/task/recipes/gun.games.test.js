// recipe "gun" games test: node gun.games.test.js <scratch>. A made-up AS2 install (as64.exe, a stock weapon set and one that
// only as64/core has): the weapon source of as64 lists both, the source of mowas2 (exe mowas_2) lists the stock one only, and
// the two are cached apart; GoH (a made-up loose resource/ tree, shapes of the vanilla gun/ files): the GoH branch reads a cannon's
// numbers, compiles make (one gen gun op) and change (macro ops on the gun's own calls, set rows) and refuses a weapon outside gun/
// with a translated key. The ammo task shares this source (ammo.games.test.js checks its GoH branch). Author: Imperator_Aug (ARSENAL, ia-5d2e81c4)
// Author: Imperator_Aug (ARSENAL, ia-e610a598)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const scratch = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'task-gun-games-')));
fs.mkdirSync(scratch, { recursive: true });
const R = require('./gun.recipe'), L = require('./gun.lang'), G = R.lib;
const DASH = new RegExp('[' + String.fromCharCode(0x2010) + '-' + String.fromCharCode(0x2015) + ']');
const w = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
let n = 0; const t = async (name, f) => { await f(); n++; console.log('ok ' + name); };

(async () => {
  const g = fs.mkdtempSync(path.join(scratch, 'as2-'));
  w(path.join(g, 'as64.exe'), 'x');
  w(path.join(g, 'resource', 'set', 'stuff', 'gun', 'zz_stock.set'), '{"zz_stock" {inherit "base"}}\r\n');
  w(path.join(g, 'as64', 'core', 'resource', 'set', 'stuff', 'gun', 'zz_core.set'), '{"zz_core" {inherit "base"}}\r\n');
  const RE = /^resource\/set\/stuff\/gun\/zz_/;
  await t('gidOf: function, word, none', () => {
    assert.equal(G.gidOf({ gameId: () => 'mowas2' }), 'mowas2');
    assert.equal(G.gidOf({ gameId: 'goh' }), 'goh');
    assert.equal(G.gidOf({}), 'as64');
  });
  await t('source: as64 sees as64/core, mowas2 does not, cached apart', () => {
    const a = G.source({ game: () => g, gameId: () => 'as64' }, null), m = G.source({ game: () => g, gameId: 'mowas2' }, null);
    assert.equal(G.keys(a, RE).join(','), 'resource/set/stuff/gun/zz_core.set,resource/set/stuff/gun/zz_stock.set');
    assert.equal(G.keys(m, RE).join(','), 'resource/set/stuff/gun/zz_stock.set');
    assert.equal(a.gid, 'as64'); assert.equal(m.gid, 'mowas2'); assert.notStrictEqual(a, m);
    assert.strictEqual(G.source({ game: () => g }, null), a);
  });
  await t('GoH: the AS2 source is not used, the task is on GoH, its rows are there', async () => {
    assert.equal(G.source({ game: () => g, gameId: () => 'goh' }, null), null);
    assert.deepEqual(R.games, ['as64', 'mowas2', 'goh']); assert.ok(!R.na || !R.na.goh);
    for (const k of ['q.grange', 'h.grange', 'q.gacc', 'h.gacc', 'q.gpen', 'h.gpen', 'q.gdamage', 'h.gdamage', 'e.gohdir', 'e.nogoh']) {
      const row = L.find(r => r[0] === 'task.gun.' + k);
      assert.ok(row && row.length === 5 && row.slice(1).every(s => s && !DASH.test(s)), k);
    }
  });
  const h = fs.mkdtempSync(path.join(scratch, 'goh-')), mod = path.join(h, 'mymod'), GD = path.join(h, 'resource', 'set', 'stuff', 'gun');
  fs.mkdirSync(mod, { recursive: true });
  w(path.join(GD, '.presets'), '(define "reload time"\n\t{rechargeTime %seconds}\n)\n(define "range_220"\n\t{range 220 220}\n)\n(define "range_160"\n\t{range 160 160}\n)\n');
  w(path.join(GD, 'gun.pattern'), '{weapon\n}\n');
  w(path.join(GD, 'zz_100mm'), '{from "pattern gun"\n\t("reload time" seconds(9))\n\t("velocity m/s" ap(890) apcr(1) he(880) heat(1))\n\t("range_220")\n\t("accuracy_direct" r1(0.55) range_ap(220) range_he(220) range_heat(220))\n\t("armor health" damage(280))\n\t("armor health custom" shell(aphe) damage(280) velocity(890) filler(88))\n\t("penetration_long" shell(aphe) range(220) a(209) b(187) c(162) d(141) e(122))\n\t("human health" damage(50))\n}\n');
  w(path.join(h, 'resource', 'set', 'stuff', 'flame', 'zz_fl'), '{from "pattern flame"\n}\n');
  // small arms (the shapes of vanilla rifle/ and smg/): calls in the file, its pattern and a folder macro of .presets
  const SD = path.join(h, 'resource', 'set', 'stuff');
  w(path.join(SD, 'rifle', '.presets'), '(include "\\set\\small_firearms_accuracy.inc")\n(define "penetration"\n\t{projectileDamageTable \t{20 %0} {100 %1} {155 %2} {250 %3} {400 %4}}\n)\n(define "armor health"\n\t{minimumDamageModifier (* 1.0 %damage)}\n)\n(define "semi_rifle"\n\t{Automatic}\n\t("human health" damage(70))\n\t("fire rate" rpm(150))\n)\n');
  w(path.join(h, 'resource', 'set', 'small_firearms_accuracy.inc'), '(define "velocity"\n\t{speed (* 0.70 %mps)}\n)\n(define "fire rate"\n\t{recoveryTime (/ 60 (* %rpm 1.07))}\n)\n(define "reload time"\n\t{rechargeTime %seconds}\n)\n(define "human health"\n\t{healthDamage %damage}\n)\n');
  w(path.join(SD, 'rifle', 'rifle.pattern'), '{weapon\n\t("reload time" seconds(6))\n\t("fire rate" rpm(29))\n\t("penetration" args 7 5 3 1 0)\n\t("armor health" damage(4))\n}\n');
  w(path.join(SD, 'rifle', 'zz_svt'), '{from "pattern rifle"\n\t{filling "zz_svt" 10}\n\t{calibre 7.62}\n\t{mass 3.85}\n\t("velocity" mps(840))\n\t("semi_rifle")\n}\n');
  w(path.join(SD, 'rifle', 'zz_bolt'), '{from "pattern rifle"\n\t("velocity" mps(865))\n\t("reload time" seconds(5))\n\t("penetration" args 9 6 4 2 1)\n}\n');
  w(path.join(SD, 'smg', '.presets'), '(include "\\set\\small_firearms_accuracy.inc")\n(define "penetration"\n\t{projectileDamageTable {25 %0} {100 0}}\n)\n');
  w(path.join(SD, 'smg', 'smg.pattern'), '{weapon\n\t("penetration" args 4)\n}\n');
  w(path.join(SD, 'smg', 'zz_mp'), '{from "pattern smg"\n\t("fire rate" rpm(500))\n\t("velocity" mps(380))\n}\n');
  const ctx = { task: { kind: 'goh', dir: h }, gameId: 'goh', mod };
  const cc = (verb, a, values) => ({ verb, game: 'goh', gameDir: h, mod, values, value: id => (id in a ? a[id] : values[id]), kept: id => !(id in a) });
  await t('GoH values: the cannon numbers read through gohgun', async () => {
    const v = await R.values(ctx, { id: 'zz_100mm', ref: { key: 'resource/set/stuff/gun/zz_100mm' } });
    assert.equal(v.reload, 9); assert.equal(v.speed, 890); assert.equal(v.health, 50); assert.equal(v.grange, '220');
    assert.equal(v.gacc, 'direct'); assert.equal(v.gpen, '209 187 162 141 122'); assert.equal(v.gdamage, 280);
    assert.equal(v._meta.kind, 'cannon'); assert.ok(v.f_gpen && v.f_gdamage);
    const shown = require('../lib/recipe').steps(R, { verb: 'change', game: 'goh', answers: {} }, v).filter(s => s.kind === 'q').map(s => s.q);
    assert.ok(shown.includes('gpen') && shown.includes('reload') && !shown.some(x => /^(kindq|mountq|rangep|accp|name)$/.test(x)), shown.join(','));
  });
  await t('GoH make: one gen gun op', async () => {
    const v = await R.values(ctx, { ref: { key: 'resource/set/stuff/gun/zz_100mm' } });
    const out = await R.compile({}, cc('make', { id: 'zz_new', reload: 7, gpen: '250 200 180 150 120', gdamage: 300, grange: '160' }, v));
    const op = out.gen.ops[0];
    assert.equal(out.gen.ops.length, 1); assert.equal(op.op, 'gun'); assert.equal(op.like, 'zz_100mm'); assert.equal(op.name, 'zz_new');
    assert.equal(op.recharge, 7); assert.equal(op.pen, '250 200 180 150 120'); assert.equal(op.damage, 300); assert.equal(op.range, '160');
  });
  await t('GoH change: macro ops on own calls', async () => {
    const v = await R.values(ctx, { ref: { key: 'resource/set/stuff/gun/zz_100mm' } });
    const out = await R.compile({}, cc('change', { reload: 7, gdamage: 560, grange: '160', speed: 979 }, v)), ops = out.gen.ops;
    const m = (macro, arg) => ops.find(o => o.op === 'macro' && o.macro === macro && o.arg === arg && !o.match);
    assert.equal(m('reload time', 'seconds').value, 7);
    assert.equal(m('armor health', 'damage').value, 560);
    assert.equal(ops.find(o => o.macro === 'armor health custom' && o.match === 'shell(aphe)').value, 560);
    assert.equal(m('velocity m/s', 'ap').value, 979); assert.equal(m('velocity m/s', 'he').value, 968); assert.ok(!m('velocity m/s', 'apcr'));
    assert.ok(ops.some(o => o.macro === 'range_220' && o.rename === 'range_160'));
    assert.equal(m('accuracy_direct', 'range_ap').value, 160);
    const pr = ops.find(o => o.macro === 'penetration_long' && o.arg === 'range');
    assert.equal(pr.value, 160); assert.ok(ops.some(o => o.macro === 'penetration_long' && o.rename === 'penetration_medium'));
    assert.ok(ops.every(o => o.op !== 'macro' || o.entity === 'file:resource/set/stuff/gun/zz_100mm'));
  });
  await t('GoH small arm values: own calls, the pattern and a folder macro', async () => {
    const v = await R.values(ctx, { ref: { key: 'resource/set/stuff/rifle/zz_svt' } });
    assert.equal(v._meta.kind, 'small'); assert.equal(v.kindq, 'rifle');
    assert.equal(v.speed, 840); assert.equal(v.reload, 6); assert.equal(v.grpm, 150); assert.equal(v.health, 70); assert.equal(v.gdamage, 4); assert.equal(v.gpen, '7 5 3 1 0');
    assert.ok(v.f_grpm && v.f_gpen && !v.f_grange && !v.f_gacc);
    const shown = require('../lib/recipe').steps(R, { verb: 'change', game: 'goh', answers: {} }, v).filter(s => s.kind === 'q').map(s => s.q);
    assert.ok(shown.includes('grpm') && shown.includes('gpen') && !shown.includes('grange'), shown.join(','));
  });
  await t('GoH small arm change: macro op on an own call, set rows (the macro\'s own key) for inherited ones', async () => {
    const v = await R.values(ctx, { ref: { key: 'resource/set/stuff/rifle/zz_svt' } });
    const out = await R.compile({}, cc('change', { speed: 900, reload: 4, grpm: 200, gpen: '10 8 6 4 2', gdamage: 6 }, v)), ops = out.gen.ops;
    const mac = ops.find(o => o.op === 'macro'), rows = ops.find(o => o.op === 'set').rows, r = p => (rows.find(x => x.path === 'from/' + p) || {}).value;
    assert.equal(mac.macro, 'velocity'); assert.equal(mac.arg, 'mps'); assert.equal(mac.value, 900); assert.equal(mac.entity, 'file:resource/set/stuff/rifle/zz_svt');
    assert.equal(r('rechargeTime'), '4'); assert.equal(r('recoveryTime'), String(Math.round(60 / (200 * 1.07) * 10000) / 10000)); assert.equal(r('minimumDamageModifier'), '6');
    assert.equal(r('projectileDamageTable'), '{20 10} {100 8} {155 6} {250 4} {400 2}');
    const own = await R.compile({}, cc('change', { reload: 4, gpen: '9 7 5 3 1' }, await R.values(ctx, { ref: { key: 'resource/set/stuff/rifle/zz_bolt' } })));
    assert.ok(own.gen.ops.some(o => o.macro === 'reload time' && o.value === 4) && own.gen.ops.some(o => o.macro === 'penetration' && o.arg === 'args' && o.value === '9 7 5 3 1') && !own.gen.ops.some(o => o.op === 'set'));
    let err = null; try { await R.compile({}, cc('change', { gpen: '1 2 3' }, v)); } catch (e) { err = e; }
    assert.ok(err && /5 numbers/.test(err.message), String(err && err.message));
  });
  await t('GoH smg: one penetration number, the fixed table row kept', async () => {
    const v = await R.values(ctx, { ref: { key: 'resource/set/stuff/smg/zz_mp' } });
    assert.equal(v.kindq, 'smg'); assert.equal(v.gpen, '4'); assert.equal(v.grpm, 500);
    const out = await R.compile({}, cc('change', { gpen: '6', grpm: 550 }, v)), ops = out.gen.ops;
    assert.equal(ops.find(o => o.op === 'set').rows[0].value, '{25 6} {100 0}');
    assert.ok(ops.some(o => o.op === 'macro' && o.macro === 'fire rate' && o.arg === 'rpm' && o.value === 550));
  });
  await t('GoH small arm make: gen gun op with class and the folder macros', async () => {
    const v = await R.values(ctx, { ref: { key: 'resource/set/stuff/rifle/zz_svt' } });
    const out = await R.compile({}, cc('make', { id: 'zz_svt2', grpm: 300, reload: 5, gpen: '9 7 5 3 1', gdamage: 5 }, v)), op = out.gen.ops[0];
    assert.equal(op.op, 'gun'); assert.equal(op.class, 'rifle'); assert.equal(op.name, 'zz_svt2'); assert.equal(op.like, 'zz_svt');
    assert.equal(op.rof, 300); assert.equal(op.reload, 5); assert.equal(op.params.penetration, 'args 9 7 5 3 1'); assert.equal(op.params['armor health'], 'damage(5)');
  });
  await t('GoH: the weapon list holds small arms', async () => {
    const l = await R.lookups.weapon(ctx, 'zz', { mod });
    assert.ok(l.some(x => x.ref.key.endsWith('/rifle/zz_svt')) && l.some(x => x.ref.key.endsWith('/gun/zz_100mm')), l.map(x => x.sub).join(','));
  });
  await t('GoH: a weapon outside gun/ and the small arms folders is refused with a key', async () => {
    const v = await R.values(ctx, { ref: { key: 'resource/set/stuff/flame/zz_fl' } });
    let err = null; try { await R.compile({}, cc('change', { reload: 2 }, v)); } catch (e) { err = e; }
    assert.ok(err && err.key === 'task.gun.e.gohdir', String(err && err.message));
  });
  fs.rmSync(h, { recursive: true, force: true });
  fs.rmSync(g, { recursive: true, force: true });
  console.log(n + ' passed, 0 failed');
  console.log('PASS');
})().catch(e => { console.error(e); console.log('FAIL'); process.exit(1); });

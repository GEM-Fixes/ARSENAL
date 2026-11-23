// recipe "ammo" games test: node ammo.games.test.js <scratch>. The ammunition task reads through the gun source (its mowas2 file
// set is checked in gun.games.test.js); here a made-up AS2 install: a stock round and one only as64/core has, seen by the as64
// source and not by the mowas2 one; GoH (a made-up loose resource/ tree, vanilla shell shapes): values read the own blast and
// he_level calls, make is a gen shell op plus he_level macro ops, change is macro ops and set rows, a non .ammo round is refused.
// Author: Imperator_Aug (ARSENAL, ia-e05a7954)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const scratch = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'task-ammo-games-')));
fs.mkdirSync(scratch, { recursive: true });
const R = require('./ammo.recipe'), L = require('./ammo.lang'), G = require('./gun.recipe').lib;
const DASH = new RegExp('[' + String.fromCharCode(0x2010) + '-' + String.fromCharCode(0x2015) + ']');
const w = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
let n = 0; const t = async (name, f) => { await f(); n++; console.log('ok ' + name); };

(async () => {
  const g = fs.mkdtempSync(path.join(scratch, 'as2-'));
  w(path.join(g, 'as64.exe'), 'x');
  w(path.join(g, 'resource', 'set', 'stuff', 'shell', 'zz.stock.ammo'), '{mass 1}\r\n');
  w(path.join(g, 'as64', 'core', 'resource', 'set', 'stuff', 'shell', 'zz.core.ammo'), '{mass 2}\r\n');
  const RE = /^resource\/set\/stuff\/shell\/zz\./;
  await t('rounds: as64 sees as64/core, mowas2 does not', () => {
    assert.equal(G.keys(G.source({ game: () => g }, null), RE).length, 2);
    assert.deepEqual(G.keys(G.source({ game: () => g, gameId: 'mowas2' }, null), RE), ['resource/set/stuff/shell/zz.stock.ammo']);
  });
  await t('GoH: the task is on GoH, its rows are there', async () => {
    assert.deepEqual(R.games, ['as64', 'mowas2', 'goh']); assert.ok(!R.na || !R.na.goh);
    for (const k of ['q.heweight', 'h.heweight', 'q.hefiller', 'h.hefiller', 'e.gohdir', 'e.nogoh']) {
      const row = L.find(r => r[0] === 'task.ammo.' + k);
      assert.ok(row && row.length === 5 && row.slice(1).every(s => s && !DASH.test(s)), k);
    }
  });
  const h = fs.mkdtempSync(path.join(scratch, 'goh-')), mod = path.join(h, 'mymod'), SD = path.join(h, 'resource', 'set', 'stuff', 'shell');
  fs.mkdirSync(mod, { recursive: true });
  w(path.join(SD, 'aphe.pattern'), '{bullet\n\t{mass 10}\n\t{inventory {size 4 1}}\n}\n');
  w(path.join(SD, 'zz_100.aphe.ammo'), '{from "pattern aphe"\n\t{inventory {size 8 1}}\n\t{mass 30}\n\t("ap_blast" args 1.1)\n}\n');
  w(path.join(SD, 'zz_100.he.ammo'), '{from "pattern aphe"\n\t{mass 15}\n\t("he_level_3" weight(15) filler(2))\n}\n');
  w(path.join(SD, 'zz_odd.bullet'), '{from "pattern aphe"\n}\n');
  // a magazine (the shape of vanilla smg/mp40.ammo): a whole {bullet} file, no {from}
  w(path.join(h, 'resource', 'set', 'stuff', 'smg', 'zz_mp.ammo'), '{bullet\n\t{tag "zz"}\n\t{inventory {weight 3.1} {block 32} {size 1 2} {fsm "belt"}}\n\t{mass 0.021}\n}\n');
  const ctx = { task: { kind: 'goh', dir: h }, gameId: 'goh', mod };
  const cc = (verb, a, values) => ({ verb, game: 'goh', gameDir: h, mod, values, value: id => (id in a ? a[id] : values[id]), kept: id => !(id in a) });
  const key = n => ({ ref: { key: 'resource/set/stuff/shell/' + n } });
  await t('GoH values: blast args, he_level, mass, size', async () => {
    const a = await R.values(ctx, key('zz_100.aphe.ammo')), e = await R.values(ctx, key('zz_100.he.ammo'));
    assert.equal(a.strength, 1.1); assert.equal(a.mass, 30); assert.equal(a.isize, '8 1'); assert.equal(a._meta.kind, 'shell');
    assert.equal(e.heweight, 15); assert.equal(e.hefiller, 2); assert.ok(e.f_he && !e.f_preset);
  });
  await t('GoH make: shell op with args, he_level macros on the new file', async () => {
    const a = await R.values(ctx, key('zz_100.aphe.ammo'));
    const o = (await R.compile({}, cc('make', { id: 'zz_100.aphe2', strength: 1.4, mass: 32 }, a))).gen.ops;
    assert.equal(o[0].op, 'shell'); assert.equal(o[0].args, 1.4); assert.equal(o[0].mass, 32); assert.equal(o[0].id, 'zz_100.aphe2');
    const e = await R.values(ctx, key('zz_100.he.ammo'));
    const p = (await R.compile({}, cc('make', { id: 'zz_100.he2', heweight: 20 }, e))).gen.ops;
    assert.ok(p.some(x => x.op === 'macro' && x.macro === 'he_level_3' && x.arg === 'weight' && x.value === 20 && x.entity === 'file:resource/set/stuff/shell/zz_100.he2.ammo'));
  });
  await t('GoH change: macro and set rows on the shell file', async () => {
    const a = await R.values(ctx, key('zz_100.aphe.ammo'));
    const o = (await R.compile({}, cc('change', { strength: 2, mass: 31, isize: '6 1' }, a))).gen.ops;
    assert.ok(o.some(x => x.op === 'macro' && x.macro === 'ap_blast' && x.arg === 'args' && x.value === 2));
    const s = o.find(x => x.op === 'set'); assert.deepEqual(s.rows.map(r => r.path + '=' + r.value), ['from/mass=31', 'from/inventory/size=6 1']);
  });
  const mk = { ref: { key: 'resource/set/stuff/smg/zz_mp.ammo' } };
  await t('GoH magazine: values, change rows on the bullet root, make = whole copy first', async () => {
    const v = await R.values(ctx, mk);
    assert.equal(v._meta.kind, 'mag'); assert.equal(v.mass, 0.021); assert.equal(v.isize, '1 2'); assert.ok(!v.f_preset && !v.f_he);
    const c = await R.compile({}, cc('change', { mass: 0.03, isize: '1 3' }, v));
    assert.deepEqual(c.gen.ops[0].rows.map(r => r.entity + ' ' + r.path + '=' + r.value), ['file:resource/set/stuff/smg/zz_mp.ammo bullet/mass=0.03', 'file:resource/set/stuff/smg/zz_mp.ammo bullet/inventory/size=1 3']);
    const m = await R.compile({}, cc('make', { id: 'zz_mp2', mass: 0.03 }, v));
    assert.ok(m.copiesFirst); assert.deepEqual(m.copies, [{ key: 'resource/set/stuff/smg/zz_mp.ammo', to: 'resource/set/stuff/smg/zz_mp2.ammo' }]);
    assert.equal(m.gen.ops[0].rows[0].entity, 'file:resource/set/stuff/smg/zz_mp2.ammo'); assert.equal(m.result, 'zz_mp2');
    const l = await R.lookups.round(ctx, 'zz', { mod });
    assert.ok(l.some(x => x.ref.key.endsWith('/smg/zz_mp.ammo')) && l.some(x => x.ref.key.endsWith('/shell/zz_100.aphe.ammo')), l.map(x => x.sub).join(','));
  });
  await t('GoH: a round that is not a .ammo shell is refused with a key', async () => {
    const v = await R.values(ctx, key('zz_odd.bullet'));
    let err = null; try { await R.compile({}, cc('change', { mass: 2 }, v)); } catch (x) { err = x; }
    assert.ok(err && err.key === 'task.ammo.e.gohdir', String(err && err.message));
  });
  fs.rmSync(h, { recursive: true, force: true });
  fs.rmSync(g, { recursive: true, force: true });
  console.log(n + ' passed, 0 failed');
  console.log('PASS');
})().catch(e => { console.error(e); console.log('FAIL'); process.exit(1); });

// recipe "soldier" games test: node soldier.games.test.js <scratch>. A made-up Gates of Hell install with stuff files, and the Units
// page's GoH catalogue and routes stood in by fakes (units/server.js lib.both, routes change, kit/set: this test checks what the
// recipe asks of them, the Units page has its own tests): goh is in games with no na, the goh group is asked on a GoH change only and
// every AS2 question on AS2 only; lookups list the GoH soldiers and the items a soldier carries; values read name and price; change is
// Units change calls (cost, name) plus one kit/set call (add, take away); a new soldier (make) is the gen steps breed and kit, its
// plan and write put the breed file, the cards in every period list that declares the copy, the name .pot and the kit into the mod;
// bad lines, an unknown item, a taken name and no GoH folder refuse.
// Author: Imperator_Aug (ARSENAL, ia-goh-soldier)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const scratch = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'task-soldier-games-')));
fs.mkdirSync(scratch, { recursive: true });
const kit = require('../lib/testkit'), D = require('../lib/draft'), CP = require('../lib/compile');
const US = require('../../units/server');
const R = require('./soldier.recipe'), SG = require('./soldier.goh'), L = require('./soldier.lang');
const DASH = new RegExp('[' + String.fromCharCode(0x2010) + '-' + String.fromCharCode(0x2015) + ']');
const w = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
let n = 0; const t = async (name, f) => { await f(); n++; console.log('ok ' + name); };
const v = x => ({ src: 'value', value: x });
const ST = 'resource/set/stuff/', UL = 'resource/set/multiplayer/units/';

(async () => {
  const g = fs.mkdtempSync(path.join(scratch, 'goh-')), mod = path.join(scratch, 'mods', 'soldier_goh');
  const G = (k, s) => w(path.join(g, ...k.split('/')), s);
  G('binaries/x64/call_to_arms.exe', 'x');
  G(ST + 'med/zzbandage', '{item\r\n\t{inventory {size 1 1} {weight 50}}\r\n}\r\n');
  G(ST + 'grenade/zzg.grenade', '{grenade\r\n\t{inventory {size 1 1} {weight 120}}\r\n}\r\n');
  G(ST + 'grenade/grenade.pattern', '{grenade\r\n\t{inventory {size 1 1}}\r\n}\r\n');
  G('resource/set/breed/mp/ger/mid/rifleman.set', '{breed\r\n\t(include "ability.inc")\r\n\t{inventory\r\n\t\t{item "zzg grenade" 1}\r\n\t}\r\n}\r\n');
  G('resource/set/breed/mp/ger/mid/ability.inc', '{perks}\r\n');
  G('resource/set/multiplayer/main.set', '(include "units/mid/inf_ger.set")\r\n(include "units/conquest/inf_ger.set")\r\n');
  G(UL + 'mid/inf_ger.set', ';SDL\r\n{"mp/ger/mid/rifleman"\t\t("inf_tier1" side(ger) period(mid) cost(12.0))} ; k98\r\n{"mp/ger/mid/medic"\t("inf_medic" side(ger) period(mid) cost(40.0))}\r\n');
  G(UL + 'conquest/inf_ger.set', ';SDL\r\n{"mp/ger/mid/rifleman"\t\t("inf_tier1" side(ger) cost(12.0))}\r\n');
  w(path.join(mod, 'mod.info'), '{Mod {Name "m"}}\r\n');
  const card = 'mp/ger/mid/rifleman@' + UL + 'mid/inf_ger.set@mid';
  const units = [
    { id: 'mp/ger/mid/rifleman', name: 'Rifleman', army: 'ger', kind: 'soldier', cost: 12, ownCost: 12, buyable: true, period: 'mid', card },
    { id: 'pz4h', name: 'Panzer IV H', army: 'ger', kind: 'vehicle', cost: 300, ownCost: 300, buyable: true, period: 'mid', card: 'pz4h@' + UL + 'mid/units_ger.set@mid' },
  ];
  const CAT = { units, byId: new Map(units.map(u => [u.id, u])), byCard: new Map(units.map(u => [u.card, u])) };
  US.lib.both = async () => ({ cur: CAT, van: CAT });
  const ctx = kit.ctxFor(scratch, { game: 'goh', gohDir: g });
  const lc = Object.assign({}, ctx, { mod, task: { id: 'goh', kind: 'goh', dir: g } });
  const mk = (answers, verb, base) => D.save(ctx, { id: D.newId('soldier'), recipe: 'soldier', verb: verb || 'change', game: 'goh', mod, base: base || SB, answers, kept: [], state: 'open' });
  const run = d => CP.compile(ctx, d, { soldier: R });
  const SB = { id: card, ref: { id: units[0].id, card } };

  await t('games: goh in, no na; the GoH rows in four languages without dashes; goh group on GoH only (the new name on make), the rest AS2 only', () => {
    assert.deepEqual(R.games, ['as64', 'mowas2', 'goh']); assert.ok(!R.na || !R.na.goh);
    assert.ok(!L.some(r => r[0] === 'task.soldier.na.goh'));
    assert.ok(!L.some(r => r[0] === 'task.soldier.na.gohmake'));
    const keys = ['g.goh', 'e.nogoh'].concat(...['gohnewid', 'gohname', 'gohcost', 'gohadd', 'gohdel'].map(i => ['q.' + i, 'h.' + i]));
    for (const k of keys) { const row = L.find(r => r[0] === 'task.soldier.' + k); assert.ok(row && row.length === 5 && row.slice(1).every(s => s && !DASH.test(s)), k); }
    assert.equal(R.groups[0].id, 'goh');
    for (const gr of R.groups) for (const q of gr.q) {
      assert.deepEqual(q.when.$game, gr.id === 'goh' ? ['goh'] : ['as64', 'mowas2'], q.id);
      if (gr.id === 'goh') assert.deepEqual(q.when.$verb, q.id === 'gohnewid' ? 'make' : ['make', 'change'], q.id);
    }
  });
  await t('lookups: the GoH soldiers; the items a soldier carries (no patterns)', async () => {
    assert.deepEqual((await R.lookups.breed(lc, '', { game: 'goh', mod })).map(x => x.ref.id), ['mp/ger/mid/rifleman']);
    const it = (await R.lookups.gohitem(lc, '', { game: 'goh', mod })).map(x => x.id).sort();
    assert.deepEqual(it, ['zzbandage', 'zzg grenade']);
    assert.deepEqual((await R.lookups.gohitem(lc, 'grenade', { game: 'goh', mod })).map(x => x.id), ['zzg grenade']);
  });
  await t('values: name, price, the breed; a vehicle is not a soldier', async () => {
    const x = await R.values(lc, SB, { game: 'goh', verb: 'change' });
    assert.deepEqual([x.gohname, x.gohcost, x._goh.breed, x.gohadd, x.gohdel], ['Rifleman', 12, 'ger/mid/rifleman', [], []]);
    assert.ok(!('gohid' in x) && !('gohremove' in x));
    const nv = await R.values(lc, { id: units[1].card, ref: { id: 'pz4h', card: units[1].card } }, { game: 'goh' });
    assert.ok(!nv._goh);
  });
  await t('change: Units change calls for cost and name, one kit/set call for the items', async () => {
    const r = await run(mk({ gohcost: v(15), gohname: v('Grenadier'), gohadd: v(['zzbandage:2', 'zzg grenade']), gohdel: v(['zzg grenade']) }));
    assert.deepEqual(r.calls.map(c => [c.route, c.body.field || '', c.body.value || '', c.dryFlag]), [
      ['POST /api/x/units/change', 'cost', '15', 'write'], ['POST /api/x/units/change', 'name', 'Grenadier', 'write'], ['POST /api/x/units/kit/set', '', '', 'write']]);
    assert.ok(r.calls.slice(0, 2).every(c => c.body.gid === 'goh' && c.body.id === 'mp/ger/mid/rifleman' && c.body.card === card));
    const k = Object.assign({}, r.calls[2].body); delete k.mod;
    assert.deepEqual(k, { gid: 'goh', breed: 'ger/mid/rifleman', add: [{ item: 'zzbandage', count: 2 }, { item: 'zzg grenade', count: 1 }], del: ['zzg grenade'] });
    assert.equal(r.result, 'ger/mid/rifleman');
    const r0 = await run(mk({}));
    assert.equal(r0.calls.length, 0); assert.ok(r0.notes.some(x => /Nothing differs/.test(x)));
  });
  await t('refusals: a taken or bad new name, an unknown item, a bad item line, a count, no GoH folder', async () => {
    const bad = async (ans, verb, re, key) => { let e = null; try { await run(mk(ans, verb)); } catch (x) { e = x; } assert.ok(e && re.test(e.message), e && e.message); if (key) assert.equal(e.key, key); };
    await bad({ gohnewid: v('rifleman') }, 'make', /already a soldier ger\/mid\/rifleman/);
    await bad({ gohnewid: v('Bad-Name') }, 'make', /small letters, digits and _/);
    await bad({ gohnewid: v('zz_new'), gohadd: v(['nosuchthing:1']) }, 'make', /no item nosuchthing/);
    await bad({ gohadd: v(['bad-item']) }, 'change', /item line/);
    await bad({ gohadd: v(['zzbandage:0']) }, 'change', /count is 1 to 100/);
    let e = null; try { await SG.compile({}, { verb: 'change', values: {}, gameDir: null }); } catch (x) { e = x; }
    assert.equal(e && e.key, 'task.soldier.e.nogoh');
  });
  await t('make: values give a free new name; the unique check sees taken names; compile is the gen steps breed and kit', async () => {
    const x = await R.values(lc, SB, { game: 'goh', verb: 'make' });
    assert.equal(x.gohnewid, 'rifleman_2');
    assert.deepEqual([(await R.lookups.gohbreedname(lc, 'rifleman', { game: 'goh', mod })).exact, (await R.lookups.gohbreedname(lc, 'rifleman_2', { game: 'goh', mod })).exact], [true, false]);
    const r = await run(mk({ gohnewid: v('grenadier_x'), gohcost: v(15), gohname: v('Grenadier'), gohadd: v(['zzbandage:2']), gohdel: v(['zzg grenade']) }, 'make'));
    assert.deepEqual(r.gen.ops, [{ op: 'breed', name: 'grenadier_x', like: 'rifleman', army: 'ger', period: 'mid', decl: { cost: '15.0' }, display: 'Grenadier' },
      { op: 'kit', breed: 'ger/mid/grenadier_x', add: [{ item: 'zzbandage', count: 2 }], del: ['zzg grenade'] }]);
    assert.equal(r.calls.length, 0); assert.equal(r.result, 'ger/mid/grenadier_x');
    const r0 = await run(mk({}, 'make'));
    assert.deepEqual(r0.gen.ops, [{ op: 'breed', name: 'rifleman_2', like: 'rifleman', army: 'ger', period: 'mid' }]);
  });
  await t('make: plan names the files, write puts breed file, cards, name and kit into the mod with restore points; the game stays', async () => {
    const d = mk({ gohnewid: v('grenadier_x'), gohcost: v(15), gohname: v('Grenadier'), gohadd: v(['zzbandage:2']), gohdel: v(['zzg grenade']) }, 'make');
    const p = await CP.plan(ctx, d, { soldier: R });
    assert.ok(!p.errors.length, JSON.stringify(p.errors));
    for (const want of ['resource/set/breed/mp/ger/mid/grenadier_x.set', UL + 'mid/inf_ger.set', UL + 'conquest/inf_ger.set']) assert.ok(p.genFiles.includes(want), want + ' ' + JSON.stringify(p.genFiles));
    assert.ok(p.genFiles.some(k => /\.pot$/.test(k)), JSON.stringify(p.genFiles));
    assert.ok(!fs.existsSync(path.join(mod, 'resource')), 'plan wrote nothing');
    const wr = await CP.write(ctx, d, { soldier: R });
    assert.ok(wr.written, JSON.stringify(wr.errors));
    const rd = k => fs.readFileSync(path.join(mod, ...k.split('/')), 'utf8');
    const br = rd('resource/set/breed/mp/ger/mid/grenadier_x.set');
    assert.ok(/\(include "ability\.inc"\)/.test(br) && /zzbandage/.test(br) && !/zzg grenade/.test(br) && !/(^|[^\r])\n/.test(br), br);
    const mid = rd(UL + 'mid/inf_ger.set'), cq = rd(UL + 'conquest/inf_ger.set');
    assert.ok(/\{"mp\/ger\/mid\/grenadier_x"\t\t\("inf_tier1" side\(ger\) period\(mid\) cost\(15\.0\)\)\}/.test(mid) && /"mp\/ger\/mid\/rifleman"/.test(mid) && !/(^|[^\r])\n/.test(mid), mid);
    assert.ok(/"mp\/ger\/mid\/grenadier_x"\t\t\("inf_tier1" side\(ger\) cost\(15\.0\)\)/.test(cq) && !/(^|[^\r])\n/.test(cq), cq);
    const potDir = path.join(mod, 'localizations', 'default', 'interface', 'text'), pots = fs.readdirSync(potDir);
    const pot = fs.readFileSync(path.join(potDir, pots[0]), 'utf8');
    assert.ok(/msgctxt "desc\/human\/mp\/ger\/mid\/grenadier_x"\r?\nmsgid "Grenadier"/.test(pot), pot);
    assert.ok(wr.restore.length >= 3, JSON.stringify(wr.restore.length));
    assert.ok(!fs.existsSync(path.join(g, 'resource', 'set', 'breed', 'mp', 'ger', 'mid', 'grenadier_x.set')));
    assert.ok(!/grenadier_x/.test(fs.readFileSync(path.join(g, ...(UL + 'mid/inf_ger.set').split('/')), 'utf8')));
  });
  fs.rmSync(g, { recursive: true, force: true });
  console.log(n + ' passed, 0 failed');
  console.log('PASS');
})().catch(e => { console.error(e); console.log('FAIL'); process.exit(1); });

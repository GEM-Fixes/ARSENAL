// recipes "squad" and "vehicle" games test: node card.games.test.js <scratch>. A made-up Gates of Hell install with buy lists, and the
// Units page's GoH catalogue and routes stood in by fakes (units/server.js lib.both, routes add, describe, change: this test checks
// what the recipes ask of them, the Units page has its own tests): goh is in games with no na, the goh group is asked on GoH only and
// every AS2 question on AS2 only; lookups list the GoH cards of one kind; values read id, name, period, price, members; make is one
// gohcard route call (Preview: the Add preview; Write with members, armour or speed: the describe write of one checked plan); change
// is Units change calls (cost, name, armour percent, speed); take off goes to army.gohcards and writes the comment lines into the mod;
// bad answers and no GoH folder refuse.
// Author: Imperator_Aug (ARSENAL, ia-goh-cards)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const scratch = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'task-card-games-')));
fs.mkdirSync(scratch, { recursive: true });
const kit = require('../lib/testkit'), D = require('../lib/draft'), CP = require('../lib/compile');
const US = require('../../units/server');
const SQ = require('./squad.recipe'), VE = require('./vehicle.recipe'), CG = require('./card.goh');
const LS = require('./squad.lang'), LV = require('./vehicle.lang');
const DASH = new RegExp('[' + String.fromCharCode(0x2010) + '-' + String.fromCharCode(0x2015) + ']');
const w = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
let n = 0; const t = async (name, f) => { await f(); n++; console.log('ok ' + name); };
const v = x => ({ src: 'value', value: x });
const UL = 'resource/set/multiplayer/units/';

(async () => {
  const g = fs.mkdtempSync(path.join(scratch, 'goh-')), mod = path.join(scratch, 'mods', 'card_goh');
  const G = (k, s) => w(path.join(g, ...k.split('/')), s);
  G('binaries/x64/call_to_arms.exe', 'x');
  G(UL + 'mid/units_ger.set', '{"pz4h" ("tank" side(ger) period(mid) cost(300) b(tanks) g(tank_m))\r\n}\r\n("sq_inf" side(ger) name(gren) period(mid) g(inf_g) b(inf1) c1(rifleman))\r\n');
  w(path.join(mod, 'mod.info'), '{Mod {Name "m"}}\r\n');
  // the fake catalogue and routes of the Units page
  const units = [
    { id: 'pz4h', name: 'Panzer IV H', army: 'ger', kind: 'vehicle', cost: 300, ownCost: 300, buyable: true, period: 'mid', card: 'pz4h@' + UL + 'mid/units_ger.set@mid' },
    { id: 'gren(ger)', name: 'Grenadiers', army: 'ger', kind: 'squad', cost: 120, ownCost: null, buyable: true, period: 'mid', card: 'gren(ger)@' + UL + 'settings.set@mid', members: [{ breed: 'mp/ger/mid/rifleman', n: 4 }, { breed: 'mp/ger/mid/mg', n: 1 }] },
  ];
  const CAT = { units, byId: new Map(units.map(u => [u.id, u])), byCard: new Map(units.map(u => [u.card, u])) };
  US.lib.both = async () => ({ cur: CAT, van: CAT });
  const seen = [];
  for (const r of ['POST /api/x/units/add', 'POST /api/x/units/describe', 'POST /api/x/units/change']) US.routes[r] = async (url, b) => { seen.push([r, b]); return { files: [{ file: UL + 'mid/units_ger.set' }], errors: [], written: !!b.write }; };
  const ctx = kit.ctxFor(scratch, { game: 'goh', gohDir: g });
  const lc = Object.assign({}, ctx, { mod, task: { id: 'goh', kind: 'goh', dir: g } });
  const mk = (rid, answers, verb, base) => D.save(ctx, { id: D.newId(rid), recipe: rid, verb: verb || 'make', game: 'goh', mod, base, answers, kept: [], state: 'open' });
  const run = d => CP.compile(ctx, d, { squad: SQ, vehicle: VE });
  const SQB = { id: units[1].card, ref: { id: 'gren(ger)', card: units[1].card } }, VEB = { id: units[0].card, ref: { id: 'pz4h', card: units[0].card } };

  await t('games: goh in, no na; the goh rows in four languages without dashes; goh group GoH only, the rest AS2 only', () => {
    for (const [R, L, rid, extra] of [[SQ, LS, 'squad', ['gohmembers']], [VE, LV, 'vehicle', ['gohpct', 'gohspeed']]]) {
      assert.deepEqual(R.games, ['as64', 'mowas2', 'goh']); assert.ok(!R.na || !R.na.goh, rid);
      assert.ok(!L.some(r => r[0] === 'task.' + rid + '.na.goh'), rid);
      const ids = ['gohremove', 'gohid', 'gohperiod', 'gohname', 'gohcost'].concat(extra);
      const keys = ['g.goh', 'e.nogoh', 'v.gohperiod.early', 'v.gohperiod.conquest'].concat(...ids.map(i => ['q.' + i, 'h.' + i]));
      for (const k of keys) { const row = L.find(r => r[0] === 'task.' + rid + '.' + k); assert.ok(row && row.length === 5 && row.slice(1).every(s => s && !DASH.test(s)), rid + ' ' + k); }
      assert.equal(R.groups[0].id, 'goh');
      for (const gr of R.groups) for (const q of gr.q) assert.deepEqual(q.when.$game, gr.id === 'goh' ? ['goh'] : ['as64', 'mowas2'], rid + ' ' + q.id);
    }
  });
  await t('lookups: the GoH cards of one kind; the free id check', async () => {
    assert.deepEqual((await SQ.lookups.squad(lc, '', { game: 'goh', mod })).map(x => x.ref.id), ['gren(ger)']);
    assert.deepEqual((await VE.lookups.vehicle(lc, 'pz', { game: 'goh', mod })).map(x => x.ref.id), ['pz4h']);
    assert.equal((await SQ.lookups.gohfree(lc, 'gren', { game: 'goh', mod })).exact, true);
    assert.equal((await VE.lookups.gohfree(lc, 'pz4h_2', { game: 'goh', mod })).exact, false);
  });
  await t('values: a free id, the name, period, price and members', async () => {
    const s = await SQ.values(lc, SQB, { game: 'goh', verb: 'make' });
    assert.deepEqual([s.gohid, s.gohname, s.gohperiod, s.gohcost, s.gohmembers], ['gren_2', 'Grenadiers', 'mid', 120, ['rifleman:4', 'mg:1']]);
    const x = await VE.values(lc, VEB, { game: 'goh', verb: 'change' });
    assert.deepEqual([x.gohid, x.gohcost, x.gohpct, x._goh.list], ['pz4h_2', 300, 100, 'ger']);
    assert.deepEqual(await VE.values(lc, SQB, { game: 'goh' }), { gohremove: false, gohpct: 100 }, 'a squad is not a vehicle');
  });
  await t('make: one gohcard route call; members, armour and speed ride along', async () => {
    const r = await run(mk('squad', { gohid: v('gren_late'), gohperiod: v('late'), gohname: v('Late grenadiers'), gohmembers: v(['rifleman:6', 'mg:1']) }, 'make', SQB));
    assert.deepEqual(r.calls.map(c => [c.route, c.dryFlag]), [['POST /api/x/task/r/squad/gohcard', 'write']]);
    const b = Object.assign({}, r.calls[0].body); delete b.mod;
    assert.deepEqual(b, { op: 'make', like: 'gren(ger)', card: units[1].card, id: 'gren_late', period: 'late', name: 'Late grenadiers', price: null, members: ['rifleman:6', 'mg:1'] });
    const rv = await run(mk('vehicle', { gohid: v('pz4h_x2'), gohcost: v(350), gohpct: v(120), gohspeed: v(45) }, 'make', VEB));
    assert.deepEqual(rv.calls[0].body.armor, { k: 1.2 }); assert.deepEqual(rv.calls[0].body.speed, { kmh: 45 }); assert.equal(rv.calls[0].body.price, 350);
    assert.equal(rv.result, 'pz4h_x2');
  });
  await t('the gohcard route: Preview is the Add preview, Write with extras is the describe write of one plan', async () => {
    seen.length = 0;
    const R = (b, write) => CG.cardRoute(null, Object.assign({ mod, write }, b), lc);
    await R({ op: 'make', like: 'pz4h', card: units[0].card, id: 'pz4h_x2', period: 'mid', price: 350, armor: { k: 1.2 }, speed: { kmh: 45 } }, false);
    await R({ op: 'make', like: 'pz4h', card: units[0].card, id: 'pz4h_x2', period: 'mid', price: 350, armor: { k: 1.2 }, speed: { kmh: 45 } }, true);
    await R({ op: 'make', like: 'pz4h', id: 'pz4h_x3', period: 'mid', price: null }, true);
    assert.deepEqual(seen.map(s => [s[0], !!s[1].write, s[1].gid]), [['POST /api/x/units/add', false, 'goh'], ['POST /api/x/units/describe', true, 'goh'], ['POST /api/x/units/add', true, 'goh']]);
    assert.deepEqual(seen[1][1].spec, { goh: true, ops: [{ op: 'gohcard', like: 'pz4h', card: units[0].card, id: 'pz4h_x2', period: 'mid', name: undefined, price: 350, armor: { k: 1.2 }, speed: { kmh: 45 } }] });
    assert.equal(seen[0][1].price, 350); assert.equal(seen[2][1].price, '');
  });
  await t('change: Units change calls for cost, name, armour percent and speed', async () => {
    const r = await run(mk('vehicle', { gohcost: v(320), gohname: v('Pz IV'), gohpct: v(150), gohspeed: v(40) }, 'change', VEB));
    assert.deepEqual(r.calls.map(c => [c.body.field, c.body.value, c.body.part || '']), [['cost', '320', ''], ['name', 'Pz IV', ''], ['armor', '150', '*'], ['armor', '40', 'speed']]);
    assert.ok(r.calls.every(c => c.route === 'POST /api/x/units/change' && c.body.gid === 'goh' && c.body.id === 'pz4h'));
    const r0 = await run(mk('squad', {}, 'change', SQB));
    assert.equal(r0.calls.length, 0); assert.ok(r0.notes.some(x => /Nothing differs/.test(x)));
  });
  await t('take off: the gohcard route; the write makes the card lines comments in the mod copy', async () => {
    const d = mk('vehicle', { gohremove: v(true) }, 'change', VEB), r = await run(d);
    const b = Object.assign({}, r.calls[0].body); delete b.mod;
    assert.deepEqual(b, { op: 'remove', army: 'ger', period: 'mid', remove: ['pz4h'] });
    const wr = await CP.write(ctx, d, { vehicle: VE });
    assert.ok(wr.written, JSON.stringify(wr.errors));
    const out = fs.readFileSync(path.join(mod, ...(UL + 'mid/units_ger.set').split('/')), 'latin1');
    assert.ok(/^;\{"pz4h"/m.test(out) && /^\("sq_inf"/m.test(out) && !/(^|[^\r])\n/.test(out), out);
    assert.ok(wr.restore.length >= 1);
  });
  await t('refusals: a member the copy has not, a bad id, a period, no GoH folder', async () => {
    const bad = async (rid, ans, base, re) => { let e = null; try { await run(mk(rid, ans, 'make', base)); } catch (x) { e = x; } assert.ok(e && re.test(e.message), e && e.message); };
    await bad('squad', { gohid: v('g2'), gohmembers: v(['sniper:2']) }, SQB, /sniper is not one of them/);
    await bad('vehicle', { gohid: v('2bad') }, VEB, /small letters/);
    await bad('vehicle', { gohid: v('pz_new'), gohpct: v(2) }, VEB, /percent of the copy/);
    let e = null; try { CG.compile('vehicle', 'vehicle', {}, { values: {}, gameDir: null }); } catch (x) { e = x; }
    assert.equal(e && e.key, 'task.vehicle.e.nogoh');
  });
  fs.rmSync(g, { recursive: true, force: true });
  console.log(n + ' passed, 0 failed');
  console.log('PASS');
})().catch(e => { console.error(e); console.log('FAIL'); process.exit(1); });

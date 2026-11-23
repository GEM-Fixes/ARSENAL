// recipe "prices" games test: node prices.games.test.js <scratch>. The Units page's GoH catalogue stood in by a fake (units/server.js
// lib.both: this test checks what the recipe asks of it, the Units page has its own tests): goh is in games with no na, the goh group
// is asked on GoH only and every AS2 question on AS2 only; the army lookup lists armies with priced cards; a percent is one
// units/armyprice call with gid goh; 0 changes nothing; a bad percent and no GoH folder refuse; the rows in four languages, no dash.
// Author: Imperator_Aug (ARSENAL, ia-goh-prices)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const scratch = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'task-prices-games-')));
fs.mkdirSync(scratch, { recursive: true });
const US = require('../../units/server');
const R = require('./prices.recipe'), PG = require('./prices.goh'), L = require('./prices.lang');
const DASH = new RegExp('[' + String.fromCharCode(0x2010) + '-' + String.fromCharCode(0x2015) + ']');
let n = 0; const t = async (name, f) => { await f(); n++; console.log('ok ' + name); };

(async () => {
  const gh = fs.mkdtempSync(path.join(scratch, 'goh-'));
  const cu = [
    { id: 'pz4h', army: 'ger', kind: 'vehicle', cost: 300, buyable: true, card: 'a' },
    { id: 'mp/ger/mid/rifleman', army: 'ger', kind: 'soldier', cost: 12, buyable: true, card: 'b' },
    { id: 't34', army: 'rus', kind: 'vehicle', cost: 250, buyable: true, card: 'c' },
    { id: 'x', army: 'fin', kind: 'vehicle', cost: null, buyable: true, card: 'd' },
  ];
  US.lib.both = async () => { const cur = { units: cu, byId: new Map(cu.map(u => [u.id, u])), byCard: new Map(cu.map(u => [u.card, u])) }; return { cur, van: cur }; };
  const gc = { task: { id: 'goh', kind: 'goh', dir: gh }, mod: scratch };

  await t('games: goh in, no na; the GoH rows; goh group GoH only, the rest AS2 only', () => {
    assert.deepEqual(R.games, ['as64', 'mowas2', 'goh']); assert.ok(!R.na || !R.na.goh);
    assert.ok(!L.some(r => r[0] === 'task.prices.na.goh'));
    const keys = ['g.goh', 'e.nogoh', 'q.gohkind', 'h.gohkind', 'q.gohpct', 'h.gohpct'].concat(PG.KINDS.map(k => 'v.gohkind.' + k));
    for (const k of keys) { const row = L.find(r => r[0] === 'task.prices.' + k); assert.ok(row && row.length === 5 && row.slice(1).every(s => s && !DASH.test(s)), k); }
    assert.equal(R.groups[0].id, 'goh');
    for (const gr of R.groups) for (const q of gr.q) assert.deepEqual(q.when.$game, gr.id === 'goh' ? ['goh'] : ['as64', 'mowas2'], q.id);
  });
  await t('lookups and values: the armies with priced cards', async () => {
    assert.deepEqual((await R.lookups.army(gc, '', { game: 'goh' })).map(x => [x.id, x.sub]), [['ger', '2 priced cards'], ['rus', '1 priced cards']]);
    assert.deepEqual(await R.values(gc, { id: 'ger' }, { game: 'goh' }), { gohkind: 'all', gohpct: 0 });
  });
  await t('compile: one armyprice call with gid goh; 0 changes nothing; refusals', async () => {
    const vals = { gohkind: 'soldier', gohpct: 15 };
    const c = { game: 'goh', gameDir: gh, mod: scratch, base: { id: 'ger' }, value: k => vals[k], answer: () => ({ src: 'value' }), values: {} };
    const r = await R.compile({ game: 'goh' }, c);
    assert.deepEqual(r.calls.map(x => [x.route, x.dryFlag, JSON.stringify(x.body)]), [['POST /api/x/units/armyprice', 'write', JSON.stringify({ gid: 'goh', army: 'ger', kind: 'soldier', percent: 15 })]]);
    assert.equal(r.calls[0].ok({ errors: [], skipped: ['sq(ger)'] }), true); assert.equal(r.calls[0].ok({ errors: ['x'] }), false);
    const z = await R.compile({ game: 'goh' }, Object.assign({}, c, { value: k => (k === 'gohpct' ? 0 : vals[k]) }));
    assert.equal(z.calls.length, 0);
    let e = null; try { await R.compile({ game: 'goh' }, Object.assign({}, c, { value: k => (k === 'gohpct' ? 900 : vals[k]) })); } catch (x) { e = x; }
    assert.ok(e && /percent between/.test(e.message));
    e = null; try { await R.compile({ game: 'goh' }, Object.assign({}, c, { gameDir: null })); } catch (x) { e = x; }
    assert.equal(e && e.key, 'task.prices.e.nogoh');
  });
  fs.rmSync(gh, { recursive: true, force: true });
  console.log(n + ' passed, 0 failed');
  console.log('PASS');
})().catch(e => { console.error(e); console.log('FAIL'); process.exit(1); });

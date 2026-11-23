// recipe "bots" games test: node bots.games.test.js <scratch>. The task is for AS64, MoW:AS2 and GoH (games). GoH has no
// bot.data.lua (GHMIS-66): there the goh group adds a unit to one purchase list through the Bots page (lib gohBuys and buyFirst stood
// in by fakes here; the Bots page has its own tests), the stock buy route still refuses GoH with the plain line. The page ctx a game
// word makes carries the game, exe and kind as functions (mowas2: mowas_2, the exe the stock buy passes to botrecipe); the GoH rows
// are in 4 languages with no dash. Author: Imperator_Aug (ARSENAL, ia-5d2e81c4)
// Author: Imperator_Aug (ARSENAL, ia-68421b28)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const scratch = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'task-bots-games-')));
fs.mkdirSync(scratch, { recursive: true });
const R = require('./bots.recipe'), L = require('./bots.lang'), B = R._bots;
const DASH = new RegExp('[' + String.fromCharCode(0x2010) + '-' + String.fromCharCode(0x2015) + ']');
let n = 0; const t = async (name, f) => { await f(); n++; console.log('ok ' + name); };

(async () => {
  const g = fs.mkdtempSync(path.join(scratch, 'as2-'));
  fs.writeFileSync(path.join(g, 'as64.exe'), 'x');
  await t('games: goh in, no na; the GoH rows; goh group GoH only, the rest AS2 only', () => {
    assert.deepEqual(R.games, ['as64', 'mowas2', 'goh']); assert.ok(!R.na || !R.na.goh);
    assert.ok(!L.some(r => r[0] === 'task.bots.na.goh'));
    for (const k of ['g.goh', 'e.nogoh'].concat(...['gohadd', 'gohlist', 'gohunit', 'gohcls', 'gohpri'].map(i => ['q.' + i, 'h.' + i]))) {
      const row = L.find(r => r[0] === 'task.bots.' + k); assert.ok(row && row.length === 5 && row.slice(1).every(s => s && !DASH.test(s)), k);
    }
    assert.ok(/GHMIS-66/.test(B.NA_GOH) && /^Not available in GoH: /.test(B.NA_GOH), B.NA_GOH);
    assert.equal(R.groups[0].id, 'goh');
    for (const gr of R.groups) for (const q of gr.q) assert.deepEqual(q.when.$game, gr.id === 'goh' ? ['goh'] : ['as64', 'mowas2'], q.id);
  });
  await t('botCtx: the game word as gui.js functions', () => {
    const m = B.botCtx({ mod: 'x', gameId: 'mowas2' }, g, 'mowas2');
    assert.equal(m.game(), g); assert.equal(m.curDir(), g);
    assert.equal(m.gameId(), 'mowas2'); assert.equal(m.exe(), 'mowas_2'); assert.equal(m.kind(), 'as2'); assert.equal(m.mod, 'x');
    const a = B.botCtx({ game: () => g }, undefined, undefined);
    assert.equal(a.game(), g); assert.equal(a.gameId(), 'as64'); assert.equal(a.exe(), 'as64');
  });
  // GoH: the Bots page's gohBuys and buyFirst stood in by fakes (what the recipe asks of them)
  const BL = require('../../bots/lib'), gh = fs.mkdtempSync(path.join(scratch, 'goh-')), seen = [];
  const LISTS = { mid: { ger: [{ unit: 'pz4h', cls: 'Tank' }, { unit: 'gren(ger)', cls: 'Infantry' }], rus: [{ unit: 't34', cls: 'Tank' }] }, late: { ger: [{ unit: 'tiger', cls: 'HeavyTank' }] } };
  BL.gohBuys = (ctx, mod, want) => {
    seen.push(['buys', ctx.gameId(), ctx.curDir(), want]);
    const list = LISTS[want] ? want : 'mid', armies = Object.keys(LISTS[list]);
    return { list, lists: ['mid', 'late'], armies, labels: { ger: 'Germany', rus: 'USSR' }, files: {}, stages: [{ n: 1, armies: LISTS[list] }] };
  };
  BL.buyFirst = async (ctx, b) => { seen.push(['add', ctx.gameId(), ctx.curDir(), b]); return { ok: true, wrote: !!b.write, rel: 'script/multiplayer/units/' + b.army + '/' + b.list + '.' + b.army + '.lua' }; };
  const US = require('../../units/server'), cu = [{ id: 'panther(ger)', name: 'Panther', army: 'ger', kind: 'vehicle', cost: 400, period: 'late', buyable: true, card: 'panther(ger)@x' }, { id: 'is2', name: 'IS-2', army: 'rus', kind: 'vehicle', cost: 450, period: 'late', buyable: true, card: 'is2@x' }];
  US.lib.both = async () => { const cur = { units: cu, byId: new Map(cu.map(u => [u.id, u])), byCard: new Map(cu.map(u => [u.card, u])) }; return { cur, van: cur }; };
  const gc = { task: { id: 'goh', kind: 'goh', dir: gh }, mod: scratch };
  await t('GoH: lookups and values read the purchase lists of the GoH install', async () => {
    assert.deepEqual((await R.lookups.army(gc, '', { game: 'goh' })).map(x => [x.id, x.name]), [['ger', 'Germany'], ['rus', 'USSR']]);
    assert.deepEqual((await R.lookups.gohlist(gc, '', { game: 'goh' })).map(x => x.id), ['mid', 'late']);
    assert.deepEqual((await R.lookups.gohunit(gc, 'i', { game: 'goh' })).map(x => x.id), ['tiger', 'is2']);
    assert.deepEqual((await R.lookups.gohunit(gc, 'panther', { game: 'goh' })).map(x => [x.id, x.where]), [['panther(ger)', 'ger']]);
    assert.deepEqual((await R.lookups.gohcls(gc, '', { game: 'goh' })).map(x => x.id), ['HeavyTank', 'Infantry', 'Tank']);
    assert.ok(seen.every(s => s[1] === 'goh' && s[2] === gh));
    const v = await R.values(gc, { id: 'ger' }, { game: 'goh' });
    assert.equal(v.gohadd, false); assert.equal(v.gohlist, 'mid'); assert.equal(v.botcharge_easy, undefined);
  });
  await t('GoH: compile is one own gohbuy call; the route hands the Bots page a GoH ctx and names the file under resource/', async () => {
    const vals = { gohadd: true, gohlist: 'late', gohunit: 'panther', gohcls: 'Tank', gohpri: 2.5 };
    const ans = { gohpri: { src: 'value' } };
    const c = { game: 'goh', gameDir: gh, mod: scratch, base: { id: 'ger' }, value: k => vals[k], answer: k => ans[k], values: vals };
    const r = await R.compile({ game: 'goh' }, c);
    assert.deepEqual(r.calls.map(x => [x.route, x.dryFlag]), [['POST /api/x/task/r/bots/gohbuy', 'write']]);
    assert.deepEqual(r.calls[0].body, { army: 'ger', list: 'late', unit: 'panther', cls: 'Tank', priority: 2.5 });
    const out = await R.routes['POST /api/x/task/r/bots/gohbuy'](null, Object.assign({ mod: scratch, write: false }, r.calls[0].body), gc);
    assert.equal(out.rel, 'resource/script/multiplayer/units/ger/late.ger.lua'); assert.equal(out.ok, true);
    const last = seen[seen.length - 1]; assert.deepEqual([last[0], last[1], last[2], last[3].unit], ['add', 'goh', gh, 'panther']);
    const none = await R.compile({ game: 'goh' }, Object.assign({}, c, { value: k => (k === 'gohadd' ? false : vals[k]) }));
    assert.equal(none.calls.length, 0);
    let err = null; try { await R.compile({ game: 'goh' }, Object.assign({}, c, { value: k => (k === 'gohunit' ? 'bad unit!' : vals[k]) })); } catch (e) { err = e; }
    assert.ok(err && /Pick the unit/.test(err.message));
    err = null; try { await R.compile({ game: 'goh' }, Object.assign({}, c, { gameDir: null })); } catch (e) { err = e; }
    assert.equal(err && err.key, 'task.bots.e.nogoh');
  });
  // the stock buy route: botrecipe gets --exe mowas_2 for MoW:AS2 only (the AS64 argument list as it was); GoH is refused
  await t('stock buy route: --exe for mowas2 only', async () => {
    const mod = fs.mkdtempSync(path.join(scratch, 'mod-')), stock = path.join(scratch, 'stock.lua');
    fs.writeFileSync(stock, '-- stock\r\n');
    const runs = [];
    const ctx = gid => ({ game: () => g, gameId: () => gid, runTool: async (name, rel, args) => { runs.push({ name, rel, args }); return { code: 0, stdout: 'ok', stderr: '' }; } });
    const body = { mod, unit: 'tiger', cls: 'Tank', army: 'ger', stockFile: stock };
    const r = await R.routes['POST /api/x/task/r/bots/buy'](null, body, ctx('as64'));
    assert.equal(r.ok, true);
    const want = [mod, '--out', mod, '--buy-first', 'tiger', '--class', 'Tank', '--priority', '1.0', '--stock'];
    const a0 = runs[0].args;
    assert.deepEqual(a0.slice(0, want.length), want);
    assert.deepEqual(a0.slice(want.length + 1), ['--army', 'ger', '--game', g, '--dry-run']);
    await R.routes['POST /api/x/task/r/bots/buy'](null, Object.assign({ gid: 'mowas2' }, body), ctx('as64'));
    assert.deepEqual(runs[1].args.slice(-3), ['--exe', 'mowas_2', '--dry-run']);
    await R.routes['POST /api/x/task/r/bots/buy'](null, body, ctx('mowas2'));
    assert.deepEqual(runs[2].args.slice(-3), ['--exe', 'mowas_2', '--dry-run']);
    let err = null;
    try { await R.routes['POST /api/x/task/r/bots/buy'](null, body, ctx('goh')); } catch (e) { err = e; }
    assert.ok(err && /GHMIS-66/.test(err.message) && runs.length === 3, String(err && err.message));
  });
  // compile: the stock buy call body carries gid for MoW:AS2 only
  await t('compile: gid in the stockFile call body for mowas2 only', async () => {
    const vals = { addunit: true, unit: 'tiger', cls: 'Tank', first: true, stage: 0, stockfile: [path.join(scratch, 'stock.lua')] };
    const ans = { addunit: { src: 'value' }, unit: { src: 'value' }, stockfile: { src: 'file' } };
    const c = game => ({ game, gameDir: g, mod: scratch, base: { id: 'ger' }, value: k => vals[k], answer: k => ans[k], values: vals });
    const buyOf = o => (o.calls || []).find(x => x.route === 'POST /api/x/task/r/bots/buy');
    const a = buyOf(await R.compile({ game: 'as64' }, c('as64'))), m = buyOf(await R.compile({ game: 'mowas2' }, c('mowas2')));
    assert.ok(a && m, 'both have the stock buy call');
    assert.equal(a.body.gid, undefined);
    assert.equal(m.body.gid, 'mowas2');
  });
  fs.rmSync(g, { recursive: true, force: true });
  console.log(n + ' passed, 0 failed');
  console.log('PASS');
})().catch(e => { console.error(e); console.log('FAIL'); process.exit(1); });

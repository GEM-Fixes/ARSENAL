// recipe "gohunit" games test: node gohunit.games.test.js <scratch>. The task runs on the three tabs (games). Made-up installs: a
// GoH folder (binaries/x64/call_to_arms.exe, resource) and an AS2 folder (as64.exe). The folders: the GoH tab gives ctx.game() as
// the GoH folder, so it is taken as the GoH side and never as the AS2 side; ctx.gohDir() wins when the AS2 tab names one; a typed
// folder wins over both. The target: mowas2 for a MoW:AS2 draft (goh2as2 gets --exe mowas_2), as64 for the rest (the argument
// list of AS64 is as it was, no --exe). The game word comes from a draft, ctx.gameId as a function or a word.
// Author: Imperator_Aug (ARSENAL, ia-376566a2)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const scratch = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'task-gohunit-games-')));
fs.mkdirSync(scratch, { recursive: true });
const R = require('./gohunit.recipe');
const w = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
let n = 0; const t = async (name, f) => { await f(); n++; console.log('ok ' + name); };

(async () => {
  const goh = fs.mkdtempSync(path.join(scratch, 'goh-')), as2 = fs.mkdtempSync(path.join(scratch, 'as2-')), as2b = fs.mkdtempSync(path.join(scratch, 'as2b-'));
  w(path.join(goh, 'binaries', 'x64', 'call_to_arms.exe'), 'x'); w(path.join(goh, 'resource', 'x.txt'), 'x');
  w(path.join(as2, 'as64.exe'), 'x'); w(path.join(as2b, 'as64.exe'), 'x');
  await t('games: all three tabs', () => assert.deepEqual(R.games, ['as64', 'mowas2', 'goh']));
  await t('gidOf and targetOf', () => {
    assert.equal(R.gidOf({ gameId: () => 'goh' }), 'goh');
    assert.equal(R.gidOf({ gameId: 'mowas2' }), 'mowas2');
    assert.equal(R.gidOf({}, 'mowas2'), 'mowas2');
    assert.equal(R.targetOf('mowas2'), 'mowas2'); assert.equal(R.targetOf('as64'), 'as64'); assert.equal(R.targetOf('goh'), 'as64'); assert.equal(R.targetOf(undefined), 'as64');
  });
  await t('dirs: the GoH tab gives the GoH folder as ctx.game()', () => {
    const d = R.dirs({ game: () => goh, gameId: () => 'goh', gohDir: () => null }, 'goh', null);
    assert.equal(d.goh, goh); assert.notEqual(d.as2, goh);
  });
  await t('dirs: the AS2 tab with a GoH folder named', () => {
    const d = R.dirs({ game: () => as2, gameId: () => 'mowas2', gohDir: () => goh }, 'mowas2', null);
    assert.deepEqual(d, { goh, as2 });
    const v = R.dirs({ game: as2, gohDir: goh }, 'as64', null);
    assert.deepEqual(v, { goh, as2 });
  });
  await t('dirs: typed folders win', () => {
    const d = R.dirs({ game: () => as2, gohDir: () => null }, 'as64', { gohDir: goh, gameDir: as2b });
    assert.deepEqual(d, { goh, as2: as2b });
  });
  await t('chainArgs: --exe mowas_2 for MoW:AS2 only', () => {
    const i = { unit: 'u', donor: 'd', flags: [], fit: true }, dd = { goh, as2 };
    const a = R.chainArgs(Object.assign({ target: 'as64' }, i), dd, 'o');
    assert.deepEqual(a, ['--goh', goh, '--entity', 'u', '--donor', 'd', '--game', as2, '--out', 'o', '--format', 'json']);
    const m = R.chainArgs(Object.assign({ target: 'mowas2' }, i), dd, 'o');
    assert.deepEqual(m, a.concat(['--exe', 'mowas_2']));
  });
  // gen ops: the same on the three tabs (a goh draft writes for as64 through genGame and lib/compile.js writeDraft)
  await t('genOf: the same gen ops on every tab', () => {
    const buy = { army: 'ger', like: 'tiger', cost: 150, name: 'Neu', icon: 'tiger', bots: true };
    for (const g of ['as64', 'mowas2', 'goh', '', undefined]) {
      const notes = [], gen = R.genOf({ buy, name: 'Neu' }, 'u1', g, notes);
      assert.deepEqual(gen, { ops: [{ op: 'roster', unit: 'u1', like: 'tiger', army: 'ger', bots: true, icon_like: 'tiger', fields: { cost: 150 }, name: 'Neu' }] });
      assert.equal(notes.length, 1);
      const n2 = [], tx = R.genOf({ buy: null, name: 'Neu' }, 'u1', g, n2);
      assert.deepEqual(tx, { ops: [{ op: 'text', key: 'desc/entity/u1', text: 'Neu' }] });
      assert.equal(R.genOf({ buy: null, name: '' }, 'u1', g, []), null);
    }
  });
  // the game the task writes for: genGame, lib/recipe.js forPage writes and lib/compile.js writeDraft (the two halves meet)
  await t('genGame: a goh draft writes for as64', () => {
    const RC = require('../lib/recipe'), CP = require('../lib/compile');
    assert.equal(R.genGame({ game: 'goh' }), 'as64'); assert.equal(R.genGame({ game: 'mowas2' }), 'mowas2');
    assert.equal(R.genGame({ game: 'as64' }), 'as64'); assert.equal(R.genGame({ game: '' }), 'as64');
    assert.deepEqual(RC.forPage(R).writes, { goh: 'as64' });
    assert.equal(CP.writeDraft({ recipe: 'gohunit', game: 'goh' }, { gohunit: R }).game, 'as64');
    assert.equal(CP.writeDraft({ recipe: 'gohunit', game: '' }, { gohunit: R }).game, 'as64');
    const dm = { recipe: 'gohunit', game: 'mowas2' };
    assert.equal(CP.writeDraft(dm, { gohunit: R }), dm);
    const TG = require('../lib/game');
    assert.equal(TG.of({ gameId: () => 'goh' }, CP.writeDraft({ recipe: 'gohunit', game: '' }, { gohunit: R })).id, 'as64');
  });
  // the task's GoH folder (lib/game.js task.gohDir) comes before ctx.gohDir; a typed folder still wins
  await t('dirs: ctx.task.gohDir first', () => {
    const TG = require('../lib/game');
    const tg = TG.of({ game: () => as2, gameId: () => 'goh', gohDir: () => goh }, { game: '' });
    assert.equal(tg.id, 'goh');
    const d = R.dirs({ game: () => as2, gohDir: () => null, task: tg }, 'goh', null);
    assert.deepEqual(d, { goh, as2 });
    const d2 = R.dirs({ game: () => as2, gohDir: () => path.join(scratch, 'nope'), task: { gohDir: goh } }, 'as64', null);
    assert.equal(d2.goh, goh);
    const d3 = R.dirs({ game: () => as2, task: { gohDir: path.join(scratch, 'nope') } }, 'as64', { gohDir: goh });
    assert.equal(d3.goh, goh);
  });
  // the target: the draft's word, else the task's game (a draft saved with game '' before this batch takes the tab's)
  await t('inputs: target from the draft, else the task game', () => {
    const v = () => undefined;
    assert.equal(R.inputs(v, { game: '' }, 'mowas2').target, 'mowas2');
    assert.equal(R.inputs(v, { game: 'as64' }, 'mowas2').target, 'as64');
    assert.equal(R.inputs(v, { game: '' }, 'goh').target, 'as64');
    assert.equal(R.inputs(v, { game: '' }).target, 'as64');
  });
  // compile gives the roster op on every tab, also with c.game 'goh' and for an older draft (game ''); gen then runs as the game
  // writeDraft names (as64 for goh, tested above), never with the GoH gen target
  await t('compile: the roster op on every tab, also for a draft with game ""', () => {
    const ST = require('./upgrade.recipe').ST, keep = ST.copies;
    ST.copies = () => ({ map: { unit: 'u1' }, copies: [{ staged: 'x', to: 'resource/entity/u1/u1.def' }], notes: [] });
    try {
      const vals = { unit: 'u1', donor: 'd1', no_translate: true, buyable: true, army: 'ger', like: 'tiger', cost: 150, name: 'Neu', icon_like: 'tiger', bots: true };
      const c = g => ({ game: g, value: k => vals[k] });
      const mod = path.join(scratch, 'mod');
      for (const dg of ['', 'goh', 'as64', 'mowas2']) for (const g of ['goh', 'as64', 'mowas2']) {
        const o = R.compile({ game: dg, mod }, c(g));
        assert.equal(o.gen.ops[0].op, 'roster', dg + '/' + g); assert.ok(!o.notes.some(x => /^Not made/.test(x)), o.notes.join('|'));
      }
    } finally { ST.copies = keep; }
  });
  for (const d of [goh, as2, as2b]) fs.rmSync(d, { recursive: true, force: true });
  console.log(n + ' passed, 0 failed');
  console.log('PASS');
})().catch(e => { console.error(e); console.log('FAIL'); process.exit(1); });

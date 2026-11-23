// recipe "fixmod" games test: node fixmod.games.test.js <scratch>. The task runs on the three tabs (games). The folder the scan
// reads: the AS2 install (ctx.game()) for AS64 and MoW:AS2 drafts; for a GoH draft the GoH folder: ctx.gohDir() first, else a
// ctx.game() that holds call_to_arms.exe (the GoH tab), never the AS2 install. The game word comes from the draft, ctx.gameId as
// a function or as a word. Author: Imperator_Aug (ARSENAL, ia-5d2e81c4)
// Author: Imperator_Aug (ARSENAL, ia-024e052f)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const scratch = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'task-fixmod-games-')));
fs.mkdirSync(scratch, { recursive: true });
const R = require('./fixmod.recipe');
const w = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
let n = 0; const t = async (name, f) => { await f(); n++; console.log('ok ' + name); };

(async () => {
  const goh = fs.mkdtempSync(path.join(scratch, 'goh-')), as2 = fs.mkdtempSync(path.join(scratch, 'as2-'));
  w(path.join(goh, 'binaries', 'x64', 'call_to_arms.exe'), 'x'); w(path.join(as2, 'as64.exe'), 'x');
  await t('games: all three tabs', () => assert.deepEqual(R.games, ['as64', 'mowas2', 'goh']));
  await t('gidOf', () => {
    assert.equal(R.gidOf({ gameId: () => 'goh' }), 'goh'); assert.equal(R.gidOf({ gameId: 'mowas2' }), 'mowas2');
    assert.equal(R.gidOf({}, 'goh'), 'goh'); assert.equal(R.gidOf({}), 'as64');
  });
  await t('AS64 and MoW:AS2 drafts read the AS2 install', () => {
    const ctx = { game: () => as2, gohDir: () => goh };
    assert.equal(R.gameDirFor(ctx, { game: 'as64' }), as2);
    assert.equal(R.gameDirFor(ctx, { game: 'mowas2' }), as2);
    assert.equal(R.gameDirFor(ctx, {}), as2);
  });
  await t('a GoH draft reads the GoH folder, never the AS2 install', () => {
    assert.equal(R.gameDirFor({ game: () => as2, gohDir: () => goh }, { game: 'goh' }), goh);
    assert.equal(R.gameDirFor({ game: () => goh, gohDir: () => null, gameId: () => 'goh' }, { game: 'goh' }), goh);
    const d = R.gameDirFor({ game: () => as2, gohDir: () => null }, { game: 'goh' });
    assert.notEqual(d, as2);
  });
  await t('check time: 10 minutes, GoH 25 (check ends itself and writes its json)', () => {
    const v = () => undefined;
    assert.equal(R.checkMs(R.inputs(v, { game: 'as64', mod: as2 }, as2)), 600000);
    assert.equal(R.checkMs(R.inputs(v, { game: 'mowas2', mod: as2 }, as2)), 600000);
    assert.equal(R.checkMs(R.inputs(v, { game: 'goh', mod: as2 }, goh)), 1500000);
  });
  // the task's game: a draft saved with game '' takes the task's (the tab's) game, as lib/game.js of() does; the draft's word wins
  await t('inputs: goh and target from the draft, else the task game', () => {
    const v = () => undefined;
    const g = R.inputs(v, { game: '', mod: as2 }, goh, 'goh');
    assert.equal(g.goh, true); assert.equal(R.checkMs(g), 1500000);
    assert.equal(R.inputs(v, { game: '', mod: as2 }, as2, 'mowas2').target, 'mowas2');
    assert.equal(R.inputs(v, { game: 'as64', mod: as2 }, as2, 'goh').goh, false);
    assert.equal(R.inputs(v, { game: '', mod: as2 }, as2).goh, false);
    // compile on the GoH tab for an older draft: the GoH line, no copies
    const o = R.compile({ game: '', mod: as2 }, { game: 'goh', gameDir: goh, value: v });
    assert.ok(!o.copies && /^Gates of Hell: /.test(o.notes[0]), JSON.stringify(o));
  });
  await t('a GoH task reads ctx.task.gohDir first', () => {
    const TG = require('../lib/game');
    const tg = TG.of({ game: () => as2, gameId: () => 'goh', gohDir: () => goh }, { game: '' });
    assert.equal(R.gameDirFor({ game: () => as2, gohDir: () => null, gameId: () => 'goh', task: tg }, { game: '' }), goh);
    assert.equal(R.gameDirFor({ game: () => as2, gohDir: () => path.join(scratch, 'nope'), task: { gohDir: goh } }, { game: 'goh' }), goh);
    assert.equal(R.gameDirFor({ game: () => as2, task: { gohDir: goh } }, { game: 'as64' }), as2);
  });
  for (const d of [goh, as2]) fs.rmSync(d, { recursive: true, force: true });
  console.log(n + ' passed, 0 failed');
  console.log('PASS');
})().catch(e => { console.error(e); console.log('FAIL'); process.exit(1); });

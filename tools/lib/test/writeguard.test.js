// writeguard: fake AS2 / GoH / workshop trees in a temp dir
// Author: Imperator_Aug (ARSENAL, ia-df4ec2b0)
const fs = require('fs'), path = require('path'), os = require('os');
module.exports = (t, assert) => {
  const W = require('../writeguard');
  const R = fs.mkdtempSync(path.join(os.tmpdir(), 'wg-'));
  const mk = (p, body) => { const f = path.join(R, p); fs.mkdirSync(path.dirname(f), { recursive: true }); if (body !== undefined) fs.writeFileSync(f, body); else fs.mkdirSync(f, { recursive: true }); return f; };
  const game = path.dirname(mk('lib/fakegame/as64.exe', 'x')); mk('lib/fakegame/resource/gamelogic.pak', 'PK'); mk('lib/fakegame/mods');
  const goh = path.dirname(path.dirname(path.dirname(mk('lib/gohcopy/binaries/x64/call_to_arms.exe', 'x')))); mk('lib/gohcopy/resource');
  mk('lib/gohcopy/mods/x/mod.info', '{mod}');   // an existing GoH mod that ARSENAL did not make
  const ws = mk('steamapps/workshop/content/244450/123');
  const empty = mk('emptydir');
  const res = path.dirname(mk('loose/resource/a.pak', 'PK'));
  t('writeguard GoH mods: copies ARSENAL made and new folders; an existing mod only with Advanced (owner 2026-11-15)', () => {
    const env0 = process.env.ARSENAL_ADVANCED; delete process.env.ARSENAL_ADVANCED;
    try {
      const x = path.join(goh, 'mods', 'x'), deep = path.join(x, 'resource', 'entity', 'a');
      assert.match(W.refuseWrite(x) || '', /did not make.*Advanced under Tools & Settings/);
      assert.match(W.refuseWrite(deep, { advanced: false }) || '', /did not make/);
      assert.equal(W.refuseWrite(x, { advanced: true }), null);
      assert.equal(W.refuseWrite(deep, { advanced: true, game: goh }), null);
      process.env.ARSENAL_ADVANCED = '1'; assert.equal(W.refuseWrite(deep), null);
      assert.match(W.refuseWrite(deep, { advanced: false }) || '', /did not make/, 'opt.advanced wins over the env');
      process.env.ARSENAL_ADVANCED = '0'; assert.match(W.refuseWrite(x) || '', /did not make/);
      assert.equal(W.refuseWrite(path.join(goh, 'mods', 'newcopy')), null, 'a folder that does not exist yet');
      const made = mk('lib/gohcopy/mods/made'); W.mark(made, 'test');
      assert.equal(W.refuseWrite(path.join(made, 'resource', 'set')), null, 'a folder ARSENAL made');
      for (const adv of [false, true]) {
        assert.match(W.refuseWrite(path.join(goh, 'mods'), { advanced: adv }) || '', /Gates of Hell/, 'the mods folder itself');
        assert.match(W.refuseWrite(path.join(goh, 'resource', 'x'), { advanced: adv }) || '', /never writes into Gates of Hell/, 'GoH game files');
        assert.match(W.refuseWrite(goh, { advanced: adv }) || '', /Gates of Hell/);
      }
      assert.match(W.refuseWrite(x, { advanced: true, allowGameMods: false }) || '', /Gates of Hell/, 'allowGameMods false');
    } finally { if (env0 === undefined) delete process.env.ARSENAL_ADVANCED; else process.env.ARSENAL_ADVANCED = env0; }
  });
  t('writeguard Workshop items: written only with Advanced, for every game (owner 2026-11-15)', () => {
    const env0 = process.env.ARSENAL_ADVANCED; delete process.env.ARSENAL_ADVANCED;
    try {
      const lib = mk('lib/wslib/steamapps/workshop/content');
      for (const app of ['244450', '400750']) {   // MoW:AS2 and AS64 share 244450; Gates of Hell 400750
        const item = mk('lib/wslib/steamapps/workshop/content/' + app + '/123'), deep = path.join(item, 'resource', 'set', 'a.set');
        assert.match(W.refuseWrite(item) || '', /Steam Workshop download folder.*Advanced under Tools & Settings/);
        assert.match(W.refuseWrite(deep, { advanced: false }) || '', /Steam Workshop/);
        assert.equal(W.refuseWrite(item, { advanced: true }), null);
        assert.equal(W.refuseWrite(deep, { advanced: true }), null);
        process.env.ARSENAL_ADVANCED = '1'; assert.equal(W.refuseWrite(deep), null); delete process.env.ARSENAL_ADVANCED;
        assert.match(W.refuseWrite(item, { advanced: true, allowWorkshop: false }) || '', /Steam Workshop/, 'allowWorkshop false');
        assert.match(W.refuseWrite(path.dirname(item), { advanced: true }) || '', /Steam Workshop/, 'the folder of all items of one game');
      }
      assert.match(W.refuseWrite(lib, { advanced: true }) || '', /Steam Workshop/, 'the download folder itself');
      assert.match(W.refuseWrite(path.join(path.dirname(path.dirname(lib)), 'common', 'Other Game', 'x'), { advanced: true }) || '', /Steam library/, 'another game in the library');
    } finally { if (env0 === undefined) delete process.env.ARSENAL_ADVANCED; else process.env.ARSENAL_ADVANCED = env0; }
  });
  t('writeguard refuses by content', () => {
    for (const g of [undefined, '', empty, path.join(R, 'other')]) {
      assert.match(W.refuseWrite(path.join(game, 'resource', 'x'), { game: g }) || '', /game folder/, 'game resource with game=' + g);
      assert.match(W.refuseWrite(path.join(goh, 'mods', 'x'), { game: g }) || '', /Gates of Hell/, 'goh with game=' + g);
      assert.match(W.refuseWrite(path.join(ws, 'x'), { game: g }) || '', /Workshop/);
    }
    assert.match(W.refuseWrite(game) || '', /game folder/);
    assert.match(W.refuseWrite(path.join(game, 'mods')) || '', /whole mods folder/);
    assert.match(W.refuseWrite(path.join(R, 'Call to Arms - Gates of Hell', 'pk')) || '', /Gates of Hell/);
    assert.match(W.refuseWrite(path.join(res, 'x')) || '', /pak/);
    assert.match(W.refuseWrite(path.parse(R).root) || '', /whole drive/);
    assert.match(W.refuseWrite(os.homedir()) || '', /user folder/);
    assert.match(W.refuseWrite(path.resolve(__dirname, '..', '..')) || '', /tools folder/);
    assert.match(W.refuseWrite('D:/Steam/steamapps/common/Call to Arms - Gates of Hell/resource/x') || '', /Gates of Hell/);
    mk('game2'); assert.match(W.refuseWrite(path.join(R, 'game2', 'resource', 'y'), { game: path.join(R, 'game2'), purpose: 'make the mod' }) || '', /^refused: ARSENAL will not make the mod at /);
  });
  t('writeguard names', () => {
    for (const n of ['con', 'AUX', 'nul.txt', 'COM1', 'lpt9', 'a.', 'b ', 'x'.repeat(201), 'a\nb', 'a|b'])
      assert.ok(W.refuseWrite(path.join(R, 'new', n)), 'name ' + JSON.stringify(n.slice(0, 20)));
    assert.match(W.refuseWrite(R + '/new/../x') || '', /"\.\."/);
    assert.match(W.refuseWrite(path.join(R, 'y'.repeat(150), 'z'.repeat(150))) || '', /characters long/);
  });
  t('writeguard allows', () => {
    assert.equal(W.refuseWrite(path.join(R, 'my', 'newmod')), null);
    assert.equal(W.refuseWrite(path.join(game, 'mods', 'new1')), null);
    assert.equal(W.refuseWrite(path.join(game, 'mods', 'new1', 'resource', 'set')), null);
    assert.equal(W.refuseWrite(path.join(R, 'gamecopy', 'resource', 'x'), { game: path.join(R, 'nothere') }), null);
    assert.match(W.refuseWrite(path.join(game, 'mods', 'new1'), { allowGameMods: false }) || '', /game folder/);
    assert.equal(W.badGame(game), null);
    assert.match(W.badGame(goh), /Gates of Hell/);
    assert.match(W.badGame(empty), /no as64\.exe/);
    assert.match(W.badGame(path.join(R, 'nope')), /does not exist/);
  });
  t('writeguard safeRemove', () => {
    const mine = mk('rm/mine'); W.mark(mine, 'test'); fs.writeFileSync(path.join(mine, 'a.txt'), 'x');
    const theirs = mk('rm/theirs'); fs.writeFileSync(path.join(theirs, 'precious.txt'), 'x');
    assert.match(W.safeRemove(theirs) || '', /did not make this folder/);
    assert.ok(fs.existsSync(path.join(theirs, 'precious.txt')));
    assert.equal(W.safeRemove(mine), null); assert.ok(!fs.existsSync(mine));
    assert.equal(W.safeRemove(path.join(R, 'rm', 'gone')), null);
    const gm = mk('lib/fakegame/mods/m1'); W.mark(gm);
    assert.equal(W.canRemove(gm), null);
    fs.writeFileSync(path.join(game, W.MARKER), '{}');
    assert.match(W.canRemove(game) || '', /game folder/);
    assert.equal(W.canRemove(theirs, { markers: ['precious.txt'] }), null);
  });
  t('writeguard detect', () => {
    assert.equal(W.detectInstall(path.join(game, 'resource', 'a', 'b')).kind, 'as2');
    assert.equal(W.detectInstall(path.join(goh, 'resource')).kind, 'goh');
    assert.equal(W.detectInstall(path.join(R, 'my')), null);
  });
  try { fs.rmSync(R, { recursive: true, force: true }); } catch (e) { /* left in temp */ }
};

// builds a fake install under test/work: game/{as64.exe, resource/gamelogic.pak, mods/target/...}. no real game needed
// Author: Imperator_Aug (ARSENAL, ia-d4b7c161)
const fs = require('fs'), path = require('path');
const { writeZip } = require('../../lib/zipwrite');
const root = path.join(__dirname, 'work'), game = path.join(root, 'game'), mod = path.join(game, 'mods', 'target mod');
const put = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
const def = t => Buffer.from(`{entity ${t}\r\n}\r\n`, 'latin1');

fs.rmSync(root, { recursive: true, force: true });
put(path.join(game, 'as64.exe'), 'not a real exe, hashed only');
fs.mkdirSync(path.join(game, 'resource'), { recursive: true });
writeZip(path.join(game, 'resource', 'gamelogic.pak'), [
  ['set/multiplayer/preload', Buffer.from('entity\t"fx_dust"\r\nentity\t"fx_smoke"\r\nsound\t"boom"\r\n', 'latin1')],
  ['entity/fx/fx_dust.def', def('fx_dust')], ['entity/fx/fx_smoke.def', def('fx_smoke')],
]);
put(path.join(mod, 'mod.info'), '{Mod\r\n\t{Name "Target Mod"}\r\n\t{MinGameVersion "3.262"}\r\n\t{MaxGameVersion "3.262"}\r\n}\r\n');
put(path.join(mod, 'resource', 'entity', 'a', 'looseone.def'), def('looseone'));
put(path.join(mod, 'resource', 'entity', 'a', 'UpperName.def'), def('uppername'));
writeZip(path.join(mod, 'resource', 'entity.pak'), [
  ['entity/b/alpha.def', def('alpha')], ['entity/b/bravo.def', def('bravo')], ['entity/b/charlie.def', def('charlie')],
]);
put(path.join(game, 'mowas_2.exe'), 'not a real mowas_2 exe, hashed only');   // the shared AS2 install holds both exes

// GoH: a fake install (binaries/x64/call_to_arms.exe, loose resource/) and a target mod outside it, lower-case keys, no version bounds
const goh = path.join(root, 'goh'), gmod = path.join(root, 'gohmods', 'target_goh');
put(path.join(goh, 'binaries', 'x64', 'call_to_arms.exe'), 'not a real GoH exe, hashed only');
put(path.join(goh, 'resource', 'set', 'multiplayer', 'preload'), 'entity\t"conquest_blank"\r\nentity\t"fx_dust"\r\n');
put(path.join(goh, 'resource', 'entity', 'fx', 'fx_dust.def'), def('fx_dust'));
put(path.join(goh, 'resource', 'entity', 'fx', 'conquest_blank.def'), def('conquest_blank'));
put(path.join(goh, 'mods', 'readme.txt'), 'GoH mods folder\r\n');
put(path.join(gmod, 'mod.info'), '{mod\r\n\t{name "Target GoH"}\r\n\t{desc "fixture"}\r\n}\r\n');
put(path.join(gmod, 'resource', 'entity', 'g', 'tiger.def'), def('tiger'));
put(path.join(gmod, 'resource', 'entity', 'g', 'panther.def'), def('panther'));
console.log(root);

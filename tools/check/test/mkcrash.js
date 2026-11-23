// T-CRASH fixture: <out>/game = tiny game dir (loose resource/, stub exe) with two mods built from one tiny map (tools/testmap):
//   mods/crash : one seeded cause each, nothing else wrong:
//     obstacleID name not in obstacles.reg (STR-29, Can_Crush crash ), cell-5 map.net (PORT-70), missing (include) in combat.mi
//     mod.info with no Min/Max (PORT-48), terrain .mtl with 1 layer (MAP-29), captureflag.mi on a map without captureflaga/b clips (MIS-62)
//   mods/clean : the same mod with every cause fixed (control: no finding, verdict in words "No known crash pattern...")
// usage: node mkcrash.js [out]   (rewrites out, default ./cr)
// Author: Imperator_Aug (ARSENAL, ia-1b3a3700)
const fs = require('fs'), path = require('path'), testmap = require('../../testmap/testmap');
const out = path.resolve(process.argv[2] || path.join(__dirname, 'cr'));
require('../../lib/testscratch').guard(out);   // never wipe a shared root, the repo, a game or a mod
fs.rmSync(out, { recursive: true, force: true });
const crlf = s => s.replace(/\r?\n/g, '\r\n');
const put = (root, k, b) => { const f = path.join(root, k); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, typeof b === 'string' ? crlf(b) : b); };
const G = path.join(out, 'game');

// ---- vanilla: obstacle table, the two mode sets, stub exe
put(G, 'resource/set/registry/obstacles.reg', '{obstacles\n\t{tree\n\t\t{"human" -1}\n\t\t{"tank" 10}\n    }\n\t{building\n\t\t{flag_crush_in_battle}\n\t\t{"human" -1}\n    }\n}\n');
put(G, 'resource/set/multiplayer/games/combat.set', '{game\n}\n');
put(G, 'resource/set/multiplayer/games/captureflag.set', '{game\n}\n');
put(G, 'resource/interface/font/main10.font', '{font_atlas\n\t{name "main"}\n\t{size 10}\n}\n');
fs.writeFileSync(path.join(G, 'mowas_2.exe'), 'stub');
// captureflag.mi: one flag_point_frontlines (vanilla shape, milint MAP-20) so only the clip rule speaks
const FLAG = '\t{Entity "flag_point_frontlines" 0x8100\r\n\t\t{Position 0 0}\r\n\t\t{Extender "map_point"\r\n\t\t\t{name captureflag}\r\n\t\t}\r\n\t\t{Player 0}\r\n\t\t{MID 256}\r\n\t}\r\n';

function mod(name, bad) {
  const M = path.join(G, 'mods', name);
  put(M, 'mod.info', bad ? `{Mod\n\t{Name "${name}"}\n\t{Desc "fixture"}\n}\n` : `{Mod\n\t{Name "${name}"}\n\t{Desc "fixture"}\n\t{MinGameVersion "3.262.1"}\n\t{MaxGameVersion "3.262.1"}\n}\n`);
  put(M, `resource/entity/${name}/box/box.def`, `{game_entity\n\t{obstacleID "${bad ? 'nosuch_obstacle' : 'tree'}"}\n}\n`);
  const m = testmap.build({ name: name + 'map' }), d = 'resource/map/' + m.dir + '/';
  for (const [f, b] of Object.entries(m.files)) put(M, d + f, b);
  const net = Buffer.from(m.files['map.net']); if (bad) net[0] = 5; put(M, d + 'map.net', net);
  if (bad) put(M, d + 'mtl0.mtl', m.files['mtl0.mtl'].toString('latin1').replace(/\t\{layer[\s\S]*?\r\n\t\}\r\n/, ''));
  const mi = m.files['combat.mi'].toString('latin1');
  if (bad) put(M, d + 'combat.mi', mi.replace('{mission\r\n', '{mission\r\n\t(include "nowhere.inc")\r\n'));
  put(M, d + 'captureflag.mi', mi.replace('{mission\r\n', '{mission\r\n' + FLAG));
  if (!bad) put(M, d + 'map', m.files.map.toString('latin1').replace('\t{Clips\r\n', '\t{Clips\r\n\t\t{"captureflaga"\r\n\t\t\t{world -100 -100 100 100}\r\n\t\t}\r\n\t\t{"captureflagb"\r\n\t\t\t{world -100 -100 100 100}\r\n\t\t}\r\n'));
}
mod('crash', true);
mod('clean', false);
console.log('fixture ok');

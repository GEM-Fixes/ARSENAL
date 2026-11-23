// place-entity fixture: fixture/game = mini game dir (loose map folder multi/tm + entity defs), fixture/game/mods/* = out mods
// Author: Imperator_Aug (ARSENAL, ia-62a90293)
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, 'fixture');
fs.rmSync(dir, { recursive: true, force: true });
function put(rel, lines) {
  const f = path.join(dir, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, lines.join('\r\n') + '\r\n', 'latin1');
}
const M = 'game/resource/map/multi/tm/';
put(M + 'map', ['{map', '\t{Land', '\t\t{Position 0 0}', '\t}', '\t{Clips', '\t\t{"[auto]"', '\t\t\t{world -1000 -1000 1000 1000}', '\t\t\t{camera -900 -900 900 900}', '\t\t\t{pather -900 -900 900 900}', '\t\t\t{distance 200 800}', '\t\t\t{viewAngle 20 50}', '\t\t}', '\t}',
  '\t{Entity "tree1" 0x2', '\t\t{Position 10 10}', '\t}', '\t{Entity "tree1" 0x10', '\t\t{Position 20 10}', '\t\t{xform zl 5}', '\t}', '\t{Link 0x2 {0x10 "1"}}', '}']);
put(M + 'combat.mi', ['{mission', '\t{Entity "tree1" 0x11', '\t\t{Position 30 30}', '\t}', '\t{Entity "tree1" 0x8001', '\t\t{Position 40 30}', '\t}', '}']);
put('game/resource/entity/construction/eu/decor/tree1/tree1.def', ['{game_entity', '\t{Extension "tree1.mdl"}', '}']);
put('game/resource/entity/construction/eu/decor/tree1/tree1.mdl', ['{model}']);
put('game/resource/entity/construction/eu/decor/hut1/hut1.def', ['{game_entity', '\t{Extension "hut1.mdl"}', '}']);
put('game/resource/entity/construction/eu/decor/hut1/hut1.mdl', ['{model}']);
fs.mkdirSync(path.join(dir, 'game/mods/mod_a'), { recursive: true });
fs.mkdirSync(path.join(dir, 'game/mods/mod_b'), { recursive: true });
// mod_c carries its own def (mod def as level entity [T])
put('game/mods/mod_c/resource/entity/construction/eu/decor/moddef/moddef.def', ['{game_entity', '\t{Extension "tree1.mdl"}', '}']);
// mod_p ships a map only inside its resource/map.pak (--mods mod_p resolves it; spotcheck PLACE_MAP_MISSING)
const { writeZip } = require('../../lib/zipwrite');
fs.mkdirSync(path.join(dir, 'game/mods/mod_p/resource'), { recursive: true });
writeZip(path.join(dir, 'game/mods/mod_p/resource/map.pak'), [['map/multi/pk/', Buffer.alloc(0)],
  ['map/multi/pk/map', Buffer.from(['{map', '\t{Entity "tree1" 0x5', '\t\t{Position 1 1}', '\t}', '}', ''].join('\r\n'), 'latin1'), true]]);

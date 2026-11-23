// patch-entity fixture: fixture/game = mini vanilla (loose stuff + entity), fixture/mod = empty mod folder
// Author: Imperator_Aug (ARSENAL, ia-4f38ab38)
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, 'fixture');
fs.rmSync(dir, { recursive: true, force: true });
function put(rel, lines) {
  const f = path.join(dir, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, lines.join('\r\n') + '\r\n', 'latin1');
}
put('game/resource/set/stuff/rifle/k98', ['{rifle', '\t{tag "weapon rifle bolt"}', '\t{entity "k98"}', '\t{healthDamage 50}', '\t{damage blastwave 10}', '}']);
put('game/resource/entity/inventory/-weapon/k98/k98.def', ['{actor', '\t{Extension "k98.mdl"}', '}']);
fs.mkdirSync(path.join(dir, 'mod'), { recursive: true });
fs.mkdirSync(path.join(dir, 'game/mods'), { recursive: true });
// T-PATCH: mod shadows an entity def (mass 5000 in the mod, 4000 in vanilla); mod file is kept in the fixture for shadow-test.js
put('game/resource/entity/vehicle/tank/t1/t1.def', ['{game_entity', '\t{mass 4000}', '\t{name "t1"}', '}']);
put('mod/resource/entity/vehicle/tank/t1/t1.def', ['{game_entity', '\t{mass 5000}', '\t{name "t1"}', '}']);

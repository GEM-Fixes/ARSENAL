// mkfixture: writes the portverdict fixture mod to test/work/mod (CRLF, ASCII). One clean unit, one unit per failing part.
//   node mkfixture.js [outDir]
// Author: Imperator_Aug (ARSENAL, ia-047280a2)
const fs = require('fs'), path = require('path');
const out = path.resolve(process.argv[2] || path.join(__dirname, 'work', 'mod'));
require('../../lib/testscratch').guard(out);   // never wipe a shared root, the repo, a game or a mod
fs.rmSync(out, { recursive: true, force: true });
const put = (rel, text) => { const f = path.join(out, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text.replace(/\r?\n/g, '\r\n')); };
const U = 'resource/entity/-vehicle/fx/tank_medium/';
const def = (body) => '{game_entity\n\t{patherId "vehicle.small"}\n\t{mass 30000}\n' + body + '}\n';
put('mod.info', '{Mod\n {Name "pv_fixture"}\n {MinGameVersion "3.301"}\n}\n');
// clean: nothing wrong in its own files (keys/values/scale/gaps come from the stub parts)
put(U + 'pv_clean/pv_clean.def', def('\t(include "pv_clean.ext")\n'));
put(U + 'pv_clean/pv_clean.ext', '{targetclass "tank"}\n');
// keys / values / scale / gaps fail through the native and unitbox parts (stubbed in test/fx)
for (const u of ['pv_keys', 'pv_vals', 'pv_box', 'pv_gaps']) put(U + u + '/' + u + '.def', def(''));
// syntax: an unclosed block in the unit's own include
put(U + 'pv_syn/pv_syn.def', def('\t(include "pv_syn.ext")\n'));
put(U + 'pv_syn/pv_syn.ext', '{targetclass "tank"\n');
// refs, the three past load-crash kinds: a GoH PatherId, weapon/ammo stuff as64 lacks, a missing include
put(U + 'pv_path/pv_path.def', '{game_entity\n\t{patherId "panzer4"}\n\t{mass 30000}\n}\n');
put(U + 'pv_weap/pv_weap.def', def('\t{Weaponry\n\t\t{place "gun"\n\t\t\t{weapon "pv_goh_75mm_l48" filling "pv_goh_bullet_75 apcbc" 1}\n\t\t\t{gunner "gunner"}\n\t\t}\n\t}\n'));
put(U + 'pv_inc/pv_inc.def', def('\t(include "pv_absent.inc")\n'));
// text-only: the include is a listed key, so it counts as resolved
put(U + 'pv_txt/pv_txt.def', def('\t(include "pv_listed.inc")\n'));
put('text-only.tsv', 'entity/-vehicle/fx/tank_medium/pv_txt/pv_listed.inc\n');
// gaps/: one file per ported unit (content is read by native, stubbed in fx/native.json); pv_shell (a pulled-along ammo def) has none
for (const u of ['pv_clean', 'pv_keys', 'pv_vals', 'pv_syn', 'pv_path', 'pv_weap', 'pv_inc', 'pv_txt', 'pv_box', 'pv_gaps']) put('gaps/' + u + '.gaps.json', '{"form":"portgap/1","unit":"' + u + '","entries":[]}\n');
put('resource/entity/inventory/-ammo/pv_shell/pv_shell.def', '{game_entity\n\t{mass 6}\n}\n');
console.log('fixture' + path.relative(process.cwd(), out).replace(/\\/g, '/'));

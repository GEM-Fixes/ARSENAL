// GOHFIX seeded test: (1) subfolder PROP_NAMES rename + SHARED_PROPS message path, (2) {Sprite "x.ebm"} of a copied /properties file pulled
// (AS2-owned sprite and ';' lines not), (3) GoH {Slow}{Normal}{Fast} stripped inside Locomotion only. Fake trees and output under ../run/gohfix/t.
// Author: Imperator_Aug (ARSENAL, ia-3f5bcf74)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const root = path.resolve(__dirname, '../../../../run/gohfix/t');
fs.rmSync(root, { recursive: true, force: true });
const w = (rel, txt) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, txt); };
const g = 'goh/resource/';
w(g + 'entity/-vehicle/train/loco/loco.def', '{game_entity\n\t(include "/properties/selection/vehicle_elongated.inc" scale(1.0))\n\t(include "/properties/selection/vehicle_big.inc" scale(1.2))\n\t(include "/properties/railway.ext")\n\t{speed {Slow 20}}\n\t{Chassis "track"\n\t\t{Locomotion ("locomotion") {Normal 5}\n\t\t\t{MaxSpeed 30}\n\t\t}\n\t}\n}\n');
w(g + 'properties/selection/vehicle_elongated.inc', '(include "vehicle_elongated_active.inc" name("selection_active") scale(%scale) )\n');
w(g + 'properties/selection/vehicle_elongated_active.inc', '{DecalView %name\n\t{Sprite "vehicle_elongated_selected.ebm"}\n}\n');
w(g + 'properties/selection/vehicle_elongated_selected.ebm', '{bitmap\n\t{Frame "vehicle_elongated_selected.dds"}\n}\n');
w(g + 'properties/selection/vehicle_big.inc', '(include "vehicle_big_active.inc" name("selection_active") scale(%scale) )\n(include "vehicle_big_own.inc" name("selection_selected") scale(%scale) )\n');
w(g + 'properties/selection/vehicle_big_active.inc', '{DecalView %name\n;\t{Sprite "gone_active.ebm"\n\t{Sprite "vehicle_big_selected.ebm"\n\t\t{Light 1}\n\t}\n}\n');
w(g + 'properties/selection/vehicle_big_own.inc', '{DecalView %name\n\t{Sprite "selected.ebm"}\n}\n');
w(g + 'properties/selection/vehicle_big_selected.ebm', '{bitmap\n\t{Frame "vehicle_big_selected.dds"}\n}\n');
w(g + 'properties/selection/vehicle_big_selected.dds', Buffer.alloc(128));
w(g + 'properties/selection/selected.ebm', '{bitmap\n\t{Frame "goh_selected.dds"}\n}\n');
w(g + 'properties/railway.ext', '(define "locomotion"\n\t{Slow 10}\t;// km/h\n\t{Normal 17}\n\t{Fast 30} {MaxSpeed 30}\n\t{Slow %slow}\t;// macro value\n\t{Normal (* %speed (/ 3 5))}\t;// expression value (GoH mobility.inc)\n\t{StartTime 10}\n)\n');
w('as2/resource/properties/selection/vehicle.inc', '(include "vehicle_selected.inc" name("selection_active") scale(%scale) )\n');
w('as2/resource/properties/selection/selected.ebm', '{bitmap}\n');
w('as2/resource/entity/dummy/dummy.def', '{game_entity}\n');

const r = cp.spawnSync('node', [path.join(__dirname, '..', 'goh2as2.js'), '--goh', path.join(root, 'goh'), '--game', path.join(root, 'as2'), '--entity', 'loco', '--out', path.join(root, 'out'), '--no-keylint', '--no-rc'], { encoding: 'utf8' });
const so = r.stdout + r.stderr, out = k => path.join(root, 'out/resource', k), rd = k => fs.existsSync(out(k)) ? fs.readFileSync(out(k), 'latin1') : null;
let ok = true; const fail = m => { console.log('FAIL gohfix: ' + m); ok = false; };
const def = rd('entity/-vehicle/train/loco/loco.def') || '';
// (1)
if (!/"\/properties\/selection\/vehicle\.inc" scale\(1\.0\)/.test(def)) fail('subfolder include not renamed to /properties/selection/vehicle.inc');
if (/elongated/.test(def)) fail('vehicle_elongated.inc still named in the def');
if (!/WARN_PORT_SHARED_PROPS .*properties\/selection\/vehicle_elongated\.inc not copied; include now names AS2 \/properties\/selection\/vehicle\.inc/.test(so)) fail('SHARED_PROPS message path');
if (rd('properties/selection/vehicle_elongated.inc') || rd('properties/selection/vehicle_elongated_selected.ebm')) fail('renamed props chain was copied');
if (/vehicle_elongated[^ ]*: IN GoH, NOT PULLED|INCLUDE_MISSING/.test(so)) fail('closure check still reports the renamed include');
// (2)
for (const k of ['properties/selection/vehicle_big.inc', 'properties/selection/vehicle_big_active.inc', 'properties/selection/vehicle_big_selected.ebm', 'properties/selection/vehicle_big_selected.dds']) if (!rd(k)) fail('copied props chain / sprite / frame not written: ' + k);
if (/vehicle_big_selected\.ebm: IN GoH, NOT PULLED/.test(so)) fail('sprite still NOT PULLED');
if (rd('properties/selection/selected.ebm')) fail('a sprite AS2 has was written over (seeded: AS2 owns selected.ebm)');
if (/gone_active/.test(so)) fail('a ; comment Sprite line was followed or warned');
// (3)
const rw = rd('properties/railway.ext') || '';
if (/\{\s*(Slow|Normal|Fast)\b|%slow|%speed|expression value/.test(rw) || !/\{MaxSpeed 30\}/.test(rw) || !/\{StartTime 10\}/.test(rw)) fail('railway.ext locomotion not stripped right: ' + JSON.stringify(rw));
if (/\{Normal 5\}/.test(def) || !/\{speed \{Slow 20\}\}/.test(def) || !/\{MaxSpeed 30\}/.test(def)) fail('def Locomotion strip wrong (or {speed {Slow}} outside was touched): ' + JSON.stringify(def));
if ((so.match(/WARN_PORT_LOCO_SPEED/g) || []).length !== 2) fail('expected 2 WARN_PORT_LOCO_SPEED (def + railway.ext)');
console.log(ok ? 'PASS gohfix' : 'FAIL gohfix\n' + so.slice(0, 3000));
process.exit(ok ? 0 : 1);

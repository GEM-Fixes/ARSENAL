// mapport/units seeded test: in-memory GoH defs, no game data. Each case fails without its rule in units.js route().
// Author: Imperator_Aug (ARSENAL, ia-0764c078)
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const { route, logNames, writePlan, summary } = require('../units.js');
const goh = {
  'entity/flora/bush_a/bush_a.def': '{game_entity}',
  'entity/-vehicle/ussr/tank_medium/t1/t1.def': '{game_entity (include "t1.ext") {PatherId "t34"}}',
  'entity/-vehicle/ussr/tank_medium/t1/t1.ext': '{weapon "76mm_l11"}',
  // no donor, GoH pather, own ext carries a weapon -> BLOCKED
  'entity/-vehicle/ussr/cannon/g1/g1.def': '{game_entity (include "g1.ext") {PatherId "cannon"}}',
  'entity/-vehicle/ussr/cannon/g1/g1.ext': '{boarding} {weapon "45mm_m42"}',
  // no donor, pather AS2 knows, subdir props include AS2 lacks -> RAW + force; an include AS2 has -> no force
  'entity/-vehicle/generic/train/loco/loco.def': '{game_entity (include "/properties/selection/vehicle_elongated.inc" scale(2)) (include "/properties/vehicle.ext")}',
  'properties/selection/vehicle_elongated.inc': '{selection (include "vehicle_elongated_active.inc")}',
  'properties/selection/vehicle_elongated_active.inc': '{DecalView {Sprite "vehicle_elongated_selected.ebm"} ;{Sprite "gone.ebm"}}',
  'properties/selection/vehicle_elongated_selected.ebm': '{bitmap}',
  'properties/vehicle.ext': '{x}',
  // no donor, unknown pather in a relative include
  'entity/-vehicle/generic/train/w2/w2.def': '{game_entity (include "../common/w.inc")}',
  'entity/-vehicle/generic/train/common/w.inc': '{PatherId "wagon_goh"}',
};
const stem = k => k.slice(k.lastIndexOf('/') + 1, -4);
const env = {
  keyOf: n => Object.keys(goh).find(k => k.endsWith('.def') && stem(k) === n) || null,
  read: k => goh[k] == null ? null : goh[k],
  as2Has: k => k === 'properties/vehicle.ext',
  pathers: new Set(['cannon', 'kv1']),
  donorOf: n => n === 't1' ? { donor: 't34_0', class: 'tank' } : { donor: null, class: null },
};
const rows = route(['bush_a', 't1', 'g1', 'loco', 'w2', 'ghost'], env);
const by = Object.fromEntries(rows.map(r => [r.name, r]));
assert.strictEqual(by.bush_a.route, 'SCENERY');
assert.strictEqual(by.t1.route, 'DONOR'); assert.strictEqual(by.t1.donor, 't34_0');   // donor wins over the t34 pather and the weapon
assert.strictEqual(by.g1.route, 'BLOCKED'); assert.match(by.g1.why, /WEAPON "45mm_m42"/); assert.doesNotMatch(by.g1.why, /PATHER/);
assert.strictEqual(by.loco.route, 'RAW'); assert.deepStrictEqual(by.loco.force, ['properties/selection/vehicle_elongated.inc', 'properties/selection/vehicle_elongated_active.inc', 'properties/selection/vehicle_elongated_selected.ebm']);
assert.strictEqual(by.w2.route, 'BLOCKED'); assert.match(by.w2.why, /PATHER_UNKNOWN "wagon_goh"/);
assert.strictEqual(by.ghost.route, 'NO_GOH');
assert.deepStrictEqual(logNames("[00:00:55] can't spawn entity Wagon1a (/map/x/map, 2)\n[1] can't spawn entity wagon1a (/map/x/map, 9)\n[2] can't spawn entity t1 (/m, 3)\n"), ['t1', 'wagon1a']);
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'units-'));
writePlan(rows, out);
assert.strictEqual(fs.readFileSync(path.join(out, 'keys-raw.txt'), 'utf8'), 'entity/-vehicle/generic/train/loco/loco.def\nproperties/selection/vehicle_elongated.inc\nproperties/selection/vehicle_elongated_active.inc\nproperties/selection/vehicle_elongated_selected.ebm\n');
assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(out, 'units.json'), 'utf8')), [{ rep: 't1', class: 'tank', donor: 't34_0' }]);
assert.strictEqual(fs.readFileSync(path.join(out, 'keys-scenery.txt'), 'utf8'), 'entity/flora/bush_a/bush_a.def\n');
fs.rmSync(out, { recursive: true, force: true });
assert.strictEqual(summary(rows), 'units: 6 names; SCENERY 1, DONOR 1, RAW 1, BLOCKED 2, NO_GOH 1');
// LOCO_GOH: Slow/Normal/Fast go only inside a locomotion define or {Locomotion}; a {speed {Slow}} block (vanilla foot/vehicle) stays
const { stripGohLoco, fixMod } = require('../units.js');
const rw = '(define "locomotion"\r\n\t{Slow\t\t10\t}\t\t;// km/h\r\n\t{Normal 17}\r\n\t{Fast 30} {MaxSpeed 30}\r\n\t{StartTime 10}\r\n)\r\n{speed {Slow 20}}\r\n{Chassis {Locomotion ("locomotion") {Normal 5}}}\r\n';
const fx = stripGohLoco(rw);
assert.strictEqual(fx.n, 4);
assert.strictEqual(fx.text, '(define "locomotion"\r\n\t {MaxSpeed 30}\r\n\t{StartTime 10}\r\n)\r\n{speed {Slow 20}}\r\n{Chassis {Locomotion ("locomotion") }}\r\n');
assert.deepStrictEqual(stripGohLoco('{speed {Slow 1}}'), { text: '{speed {Slow 1}}', n: 0 });
const md = fs.mkdtempSync(path.join(os.tmpdir(), 'unitsfix-'));
fs.mkdirSync(path.join(md, 'resource', 'properties', 'goh'), { recursive: true });
fs.writeFileSync(path.join(md, 'resource', 'properties', 'goh', 'railway.ext'), Buffer.from(rw + ';\xe0\r\n', 'latin1'));
fs.writeFileSync(path.join(md, 'resource', 'properties', 'goh', 'other.ext'), '{speed {Slow 1}}');
assert.deepStrictEqual(fixMod(md), ['properties/goh/railway.ext (4)']);
assert.strictEqual(fs.readFileSync(path.join(md, 'resource', 'properties', 'goh', 'railway.ext')).toString('latin1'), fx.text + ';\xe0\r\n');   // cp1251 bytes kept
fs.rmSync(md, { recursive: true, force: true });
console.log('PASS units');

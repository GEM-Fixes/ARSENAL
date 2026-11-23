// mkfixture: tiny fake AS2 and GoH game dirs (loose resource/ only) for the gen tests. usage: node mkfixture.js <dir>
// text = cp1251 + CRLF on AS2, UTF-8 + CRLF on GoH (written as given, all-ASCII except the marked cp1251 byte).
// Author: Imperator_Aug (ARSENAL, ia-9f67e310)
const fs = require('fs'), path = require('path');
const dir = path.resolve(process.argv[2] || path.join(__dirname, 'work'));
function put(root, key, text, enc) {
  const f = path.join(root, key); fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, Buffer.from(text.replace(/\r?\n/g, '\r\n'), enc || 'latin1'));
}
const A = path.join(dir, 'as2'), H = path.join(dir, 'goh');

// ---- shared entity defs
const rows = []; for (let i = 1; i <= 50; i++) rows.push(`\t{k${i} ${i}}`);
const ent = root => {
  put(root, 'resource/entity/-weapon/rifle_a/rifle_a.def', '{actor\n' + rows.join('\n') + '\n\t{nested\n\t\t{depth 1}\n\t}\n}\n');
  put(root, 'resource/entity/-vehicle/tank_a/tank_a.def', '{actor\n\t{hp 100}\n}\n');
  put(root, 'resource/entity/-vehicle/tank_b/tank_b.def', '{actor\n\t{hp 1}\n}\n');
  put(root, 'resource/entity/-vehicle/tank_c/tank_c.def', '{actor\n\t{hp 1}\n}\n');
};
ent(A); ent(H);
// a binary-ish def (refused by set)
fs.mkdirSync(path.join(A, 'resource/entity/-weapon/bin_a'), { recursive: true });
fs.writeFileSync(path.join(A, 'resource/entity/-weapon/bin_a/bin_a.mdl'), Buffer.from([0, 1, 2, 3, 0xff, 0xfe, 0, 0]));
// FIX-PORT (port-donors:17): a vehicle with both wreck stages, tank_d -> tank_d_x -> tank_d_xx
for (const n of ['tank_d', 'tank_d_x', 'tank_d_xx']) put(A, `resource/entity/-vehicle/${n}/${n}.def`, '{game_entity\n\t{hp 1}\n}\n');
// two defs with the same name (ambiguous)
put(A, 'resource/entity/-weapon/dup_a/dup_a.def', '{actor\n\t{x 1}\n}\n');
put(A, 'resource/entity/-vehicle/dup_a/dup_a.def', '{actor\n\t{x 2}\n}\n');

// ---- AS2 sets
put(A, 'resource/set/multiplayer/main.set', '(include "units/soldiers.set")\n(include "units/squads.set")\n(include "units/vehicles_rus.set")\n');
put(A, 'resource/set/multiplayer/orphan.set', '; included by nothing\n{"x" ("t" side(rus))}\n');
put(A, 'resource/set/multiplayer/units/vehicles_rus.set', '; vehicles\n{"tank_b" ("tank" side(rus) cost(100) level(1) b(tanks))} ; like\n{"tank_c" ("tank" side(rus) cost(120) level(2) b(tanks))}\n');
put(A, 'resource/set/multiplayer/units/soldiers.set', '(define "x" )\n{"mp/rus/rifle" ("rifle" side(rus))}\n{"mp/rus/squadleader" ("rifle" side(rus))}\n');
put(A, 'resource/set/multiplayer/units/squads.set',
  '(define "squad_with2types" (x))\n(define "squad_with3types" (x))\n' +
  '("squad_with2types" side(rus) name(riflemans) c(30) g(squad_2) c1(squadleader:1) c2(rifle:3) b(squad1) t(all inf_only) level(1) cost(50))\n' +
  '("squad_with2types" side(ger) name(riflemans) c(30) g(squad_2) c1(squadleader:1) c2(rifle:3) b(squad1) t(all inf_only) level(1) cost(55))\n');
put(A, 'resource/set/breed/mp/rus/rifle.set', '{breed\n\t{behaviour soldier}\n\t{inventory\n\t\t{item "mosin"}\n\t\t{item "grenade"}\n\t}\n}\n');
put(A, 'resource/set/breed/mp/rus/squadleader.set', '{breed\n\t{behaviour soldier}\n\t{inventory\n\t\t{item "ppsh"}\n\t}\n}\n');

// localization (base .lng, UTF-8) + bot purchases (riflemans(rus): last entry of stage 1 = comma case, commented copy + min_income entry in stage 2)
put(A, 'resource/interface/text/desc.lng', '{tags\n\t{"human"\n\t\t{"mp"\n\t\t\t{"rus"\n\t\t\t\t{"rifle" "Стрелок"}\n\t\t\t}\n\t\t}\n\t}\n\t{"squad"\n\t\t{"riflemans(rus)" "Rifle squad"}\n\t}\n}\n', 'utf8');
put(A, 'resource/interface/text/info.lng', '{tags\n\t{"squad"\n\t\t{"riflemans(rus)" "Riflemen with \\"bolt\\" rifles"}\n\t}\n}\n', 'utf8');
put(A, 'resource/script/multiplayer/bot.data.lua', 'Purchases = {\n\t{--purchase 1\n\t\tRepeat = 1,\n\t\tUnits = {\n\t\t\t["rus"] = {\n\t\t\t\t{priority = 1.0, class = UnitClass.Vehicle, unit = "tank_b"},\n\t\t\t\t{priority = 3.0, class = UnitClass.Infantry, unit = "riflemans(rus)"} -- last\n\t\t\t},\n\t\t\t["ger"] = {\n\t\t\t\t{priority = 2.0, class = UnitClass.Infantry, unit = "riflemans(ger)"}\n\t\t\t},\n\t\t}\n\t},\n\t{--purchase 2\n\t\tUnits = {\n\t\t\t["rus"] = {\n\t\t\t\t{priority = 0.5, class = UnitClass.Vehicle, unit = "tank_c(rus)"},\n\t\t\t\t--{priority = 9.0, class = UnitClass.Infantry, unit = "riflemans(rus)"},\n\t\t\t\t{priority = 1.0, class = UnitClass.Infantry, unit = "riflemans(rus)", min_income = 10},\n\t\t\t}\n\t\t}\n\t}\n}\n');
// ---- GoH sets
put(H, 'resource/set/multiplayer/main.set', '(include "units/late/units_ger.set")\n(include "units/late/inf_ger.set")\n');
put(H, 'resource/set/multiplayer/units/late/units_ger.set',
  '(define "squad_with1types" (x))\n(define "squad_with2types" (x))\n' +
  '{"tank_b" ("tank" side(ger) period(late) cost(100) level(1) b(tanks))}\n' +
  '("squad_with2types" side(ger) name(single_mg) period(late) cd(0) ci(60) g(single_mg) c1(mgun_1:1) c2(mgun_2:1) b(inf2) t())\n');
put(H, 'resource/set/multiplayer/units/late/inf_ger.set',
  '{"mp/ger/late/rifleman_1" ("inf_tier1" side(ger) period(late) cost(7.0))} ; k98\n{"mp/ger/late/mgun_1" ("inf_tier1" side(ger) period(late) cost(9.0))}\n{"mp/ger/late/mgun_2" ("inf_tier1" side(ger) period(late) cost(9.0))}\n');
// conquest list declares cards of other period folders (as the real conquest/inf_ger.set)
put(H, 'resource/set/multiplayer/units/conquest/inf_ger.set', '{"mp/ger/late/rifleman_1" ("inf_tier1" side(ger) cost(7.0))}\n');
put(H, 'resource/set/breed/mp/ger/late/rifleman_1.set', '{breed\n\t{behaviour soldier}\n\t{inventory\n\t\t{item "k98" filled}\n\t}\n}\n');
put(H, 'resource/set/breed/mp/ger/late/mgun_1.set', '{breed\n\t{behaviour soldier}\n}\n');
put(H, 'resource/set/breed/mp/ger/late/mgun_2.set', '{breed\n\t{behaviour soldier}\n}\n');
// armor macro call on the AS2 side
put(A, 'resource/entity/-vehicle/tank_arm/tank_arm.def', '{actor\n\t("armor_light" args 10 20 30 40)\n\t{hp 5}\n}\n');
// named-part armor macro (as the real t34_0): turret(f s r t) body(f s r t)
put(A, 'resource/entity/-vehicle/tank_nam/tank_nam.def', '{actor\n\t("armor_medium" turret(52 52 52 20) body(45 45 45 22))\n\t{hp 5}\n}\n');
// ---- maps (AS2 map m1/m2, GoH map g1): map.net header only (cell size + version 2, as map-clone's fixture), map file, .mi, game mode sets
const net = cell => { const h = Buffer.alloc(14); h[0] = cell; h[1] = 2; h.writeInt16LE(1, 2); h.writeInt16LE(1, 4); return Buffer.concat([h, Buffer.from('MAP0'), Buffer.from([0]), Buffer.from('MAP1'), Buffer.from([0]), Buffer.from('GRID'), Buffer.from([1, 0, 0, 0])]); };
const mapFile = ['{map', '\t{Land', '\t\t{Position 0 0}', '\t}', '\t{Clips', '\t\t{"[auto]"', '\t\t\t{world -1000 -1000 1000 1000}', '\t\t\t{camera -900 -900 900 900}', '\t\t\t{pather -900 -900 900 900}', '\t\t\t{distance 200 800}', '\t\t\t{viewAngle 20 50}', '\t\t}', '\t}',
  '\t{Entity "tree1" 0x2', '\t\t{Position 10 10}', '\t}', '}'].join('\n');
const pt = (uid, nm, team, x, y, mid) => [`\t{Entity "map_point" ${uid}`, `\t\t{Position ${x} ${y}}`, '\t\t{Extender "map_point"', `\t\t\t{name ${nm}}`, `\t\t\t{team ${team}}`, '\t\t\t{phase 0}', '\t\t\t{order 1}', '\t\t\t{visor SpawnPoint}', '\t\t}', '\t\t{Player 0}', `\t\t{MID ${mid}}`, '\t}'];
const flag = (uid, n, x, y, mid) => [`\t{Entity "flag_point_${n}" ${uid}`, `\t\t{Position ${x} ${y}}`, '\t\t{xform scale 0.75}', '\t\t{Extender "map_point"', `\t\t\t{name f${n}}`, '\t\t\t{zoneA 12}', '\t\t\t{zoneB 12}', '\t\t\t{phase 0}', `\t\t\t{order ${n}}`, '\t\t\t{show All}', '\t\t\t{visor MapPoint}', '\t\t}', '\t\t{Player 0}', `\t\t{MID ${mid}}`, '\t}'];
const tail = ['\t{Tags "day" 0x9000}', '\t{Players', '\t\t{count 17}', '\t\t{diplomacy', ...Array.from({ length: 17 }, (_, i) => '\t\t\t' + Array.from({ length: 17 }, (_, j) => (i === 0 ? (j === 0 ? 1 : 0) : (j === 0 ? 0 : 1))).join(' ')), '\t\t}', '\t}', '\t{Fog 1}', '\t{EntityManager {Enabled}}', '}'];
const base = ['{mission', ...pt('0xc000', 'a1', 'a', -1000, 0, 1), ...pt('0xc001', 'b1', 'b', 1000, 200, 2)];
for (const [root, m, cell] of [[A, 'm1', 0x0a], [A, 'm2', 0x0a], [H, 'g1', 0x05]]) {
  const M = `resource/map/multi/${m}/`;
  fs.mkdirSync(path.join(root, M), { recursive: true });
  fs.writeFileSync(path.join(root, M, 'map.net'), net(cell));
  put(root, M + 'map', mapFile);
  put(root, M + 'map.info', ';SDL\n{game\n  {maxPlayers 2}\n}\n');
  if (m !== 'm2') put(root, M + 'combat.mi', [...base, ...tail].join('\n'));
  if (m === 'm2') put(root, M + 'battle_zones.mi', [...base, ...flag('0x8010', 1, 0, 100, 3), ...flag('0x8011', 2, -500, 50, 4), ...flag('0x8012', 3, 500, 150, 5), ...tail].join('\n'));
  for (const g of ['combat', 'battle_zones', 'captureflag']) put(root, `resource/set/multiplayer/games/${g}.set`, '{game\n\t{teammatch}\n}\n');
  put(root, 'resource/entity/construction/eu/decor/tree1/tree1.def', '{game_entity\n\t{Extension "tree1.mdl"}\n}\n');
  put(root, 'resource/entity/construction/eu/decor/hut1/hut1.def', '{game_entity\n\t{Extension "hut1.mdl"}\n}\n');
  put(root, 'resource/entity/construction/eu/decor/hut1/hut1.mdl', '{model}\n');
  put(root, 'resource/entity/construction/eu/decor/tree1/tree1.mdl', '{model}\n');
}
// ---- GOLD (T-SAMPLES): stand-ins under the real vanilla names the three samples use (t34_0, bt7a, zis2); not vanilla content, just enough
// for gen: entity defs, the rus army list (card lines shaped like the real ones: "v" c(0) .. s(rus) .. {level} {cost}), one loader, base lng
const Gd = path.join(dir, 'gold');
put(Gd, 'resource/entity/-vehicle/tank_medium/t34_0/t34_0.def', '{game_entity\n\t{hp 100}\n}\n');
put(Gd, 'resource/entity/-vehicle/tank_light/bt7a/bt7a.def', '{game_entity\n\t{hp 60}\n}\n');
put(Gd, 'resource/entity/-vehicle/tank_light/bt7a_x/bt7a_x.def', '{game_entity\n\t{hp 1}\n}\n');
put(Gd, 'resource/entity/-gun/at/zis2/zis2.def', '{game_entity\n\t{hp 40}\n}\n');
put(Gd, 'resource/set/multiplayer/main.set', '(include "units/common.set")\n');
put(Gd, 'resource/set/multiplayer/units/common.set', '(include "vehicles_rus.set")\n');
put(Gd, 'resource/set/multiplayer/units/vehicles_rus.set',
  '; stand-in rus list\n{"bt7a"\t("v" c(0) t(all medium) s(rus) n1(2) n2(1) g(e1) sc(16.00) b(v4) cw(0) cp(15)) {level 4} {cost 120}}\n' +
  '{"t34_0"\t("v" c(0) t(all medium) s(rus) n1(2) n2(1) g(e1) sc(20.00) b(v4) cw(0) cp(15)) {level 5} {cost 170}}\n' +
  '{"zis2"\t("v" c(0) t(all medium) s(rus) n1(2) n2(1) g(e1) sc(10.00) b(v1) cw(0) cp(10)) {level 3} {cost 80}}\n');
put(Gd, 'resource/interface/text/desc.lng', '{tags\n\t{"entity"\n\t\t{"zis2" "ZiS-2"}\n\t\t{"t34_0" "T-34"}\n\t\t{"bt7a" "BT-7A"}\n\t}\n}\n', 'utf8');
console.log('fixture in ' + dir);

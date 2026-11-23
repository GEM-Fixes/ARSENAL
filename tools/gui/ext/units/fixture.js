// units ext test fixture: a tiny loose AS2 game dir shaped like the real unit lists (common.set {units (include ..)},
// "v" vehicle macro cards, squad_with2types squad lines, soldiers, defs with armor macros / Weaponry / Locomotion,
// a {from "pattern rifle"} rifle, desc.lng names, bot.data.lua) and an empty mod folder under <game>/mods.
// make(dir) -> {game, mod}. Text is CRLF like the game files.
// Author: Imperator_Aug (ARSENAL, ia-bacf325c)
const fs = require('fs'), path = require('path');
function put(root, key, text, enc) {
  const f = path.join(root, key); fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, Buffer.from(text.replace(/\r?\n/g, '\r\n'), enc || 'latin1'));
}
const U = 'resource/set/multiplayer/units/';
function make(dir) {
  const G = path.join(dir, 'game');
  fs.rmSync(G, { recursive: true, force: true });
  put(G, 'resource/set/multiplayer/main.set', '(include "units/common.set")\n');
  put(G, U + 'common.set', ';SDL\n{units\n\t(include "soldiers.set")\n\t(include "squads.set")\n\t(include "vehicles.set")\n}\n');
  const sold = (n, s) => `{"mp/${s}/${n}" ("${n}" side(${s}))}`;
  put(G, U + 'soldiers.set', ';SDL\n' +
    '(define "tankman"\n    {tags   "tankman %side crew man"}\n    {cp     2.0}\n    {score  0.25}\n    {basic}\n    {breed}\n    {cw 0.25}\n)\n' + ['rus', 'ger'].map(s => sold('tankman', s)).join('\n') + '\n' +
    '(define "tankman2"\n    {tags   "tankman %side crew man"}\n    {cp     2.0}\n    {score  0.50}\n    {basic}\n    {breed}\n    {cw 0.5}\n)\n' + ['rus', 'ger'].map(s => sold('tankman2', s)).join('\n') + '\n' +
    '(define "rifle"\n    {tags   "rifle %side man"}\n    {cp     1.0}\n    {score  0.5}\n    {basic}\n    {breed}\n)\n' + ['rus', 'ger'].map(s => sold('rifle', s)).join('\n') + '\n' +
    '(define "squadleader"\n    {tags   "squadleader %side man"}\n    {cp     1.0}\n    {score  0.5}\n    {basic}\n    {breed}\n)\n' + ['rus', 'ger'].map(s => sold('squadleader', s)).join('\n') + '\n');
  put(G, U + 'squads.set', ';----- Squads -----\n' +
    '(define "squad_with2types"\n\t{"%name(%side)"\n\t\t{charge %c}\n\t\t{content "mp/%side/%c1 mp/%side/%c2"}\n\t\t{tags "frontline_cp infantry %side %t"}\n\t\t{group "%g"}\n\t\t{button "%b"}\n\t\t{level %level}\n\t\t{cost %cost}\n\t\t{fore %f}\n\t}\n)\n' +
    '("squad_with2types" side(rus) name(riflemans) c(30) g(squad_2) c1(squadleader:1) c2(rifle:5) b(squad1) t(all inf_only) level(1) cost(140) f(1.0))\n' +
    '("squad_with2types" side(ger) name(riflemans) c(30) g(squad_2) c1(squadleader:1) c2(rifle:5) b(squad1) t(all inf_only) level(1) cost(150) f(1.0))\n');
  put(G, U + 'vehicles.set', ';----- Vehicles -----\n' +
    '(define "generic_v"\n    {charge %c}\n    {score %sc}\n    {tags "%t"}\n    {group "%g"}\n    {button "%b"}\n    {cw %cw}\n    {cp %cp}\n)\n' +
    '(define "v"\n    ("generic_v" c(%c) sc(%sc) t(%t %s) g(%g) b(%b) cw(%cw) cp(%cp))\n    {content "* ( mp/%s/tankman:%n1 mp/%s/tankman2:%n2)"}\n)\n' +
    '\t(include "vehicles_ger.set")\n\t(include "vehicles_rus.set")\n');
  put(G, U + 'vehicles_ger.set', '{"pz6e"             ("v" c(0) t(all heavy) \t\t\ts(ger) n1(4) n2(1) g(e6) sc(62.50) b(v4) cw(0) cp(30)) {level 1} {cost 1250} {fore 1.0}}\n');
  put(G, U + 'vehicles_rus.set',
    '{"t34_0"            ("v" c(0) t(all medium) \t\ts(rus) n1(3) n2(1) g(e2) sc(17.50) b(v4) cw(0) cp(15)) {level 1} {cost 350} {fore 1.0}}\n' +
    '{"t34_3"            ("v" c(120) t(all medium) \t\ts(rus) n1(4) n2(1) g(e2) sc(22.50) b(v4) cw(0) cp(15)) {level 2} {cost 450} {fore 0.5}}\n');
  const tank = (gun, speed, armor) => '{game_entity\n\t' + armor + '\n\t("crew_4_human_extended")\n\t{Locomotion\n\t\t{MaxSpeed ' + speed + '}\n\t}\n\t{Weaponry\n\t\t{place "gun"\n\t\t\t{weapon "' + gun + '"}\n\t\t}\n\t\t{place "mgun2"\n\t\t\t{weapon "dt"}\n\t\t}\n\t}\n\t{Volume "Gun"\n\t\t{thickness 30}\n\t}\n}\n';
  put(G, 'resource/entity/-vehicle/tank_heavy/pz6e/pz6e.def', tank('88mm_kwk36', 22, '("armor_heavy" turret(100 80 80 25) body(100 80 80 25))'));
  put(G, 'resource/entity/-vehicle/tank_heavy/pz6e_x/pz6e_x.def', '{game_entity\n\t{hp 1}\n}\n');
  put(G, 'resource/entity/-vehicle/tank_medium/t34_0/t34_0.def', tank('76mm_f34', 34, '("armor_medium" turret(52 52 52 20) body(45 45 45 22))'));
  put(G, 'resource/entity/-vehicle/tank_medium/t34_0_x/t34_0_x.def', '{game_entity\n\t{hp 1}\n}\n');
  put(G, 'resource/entity/-vehicle/tank_medium/t34_3/t34_3.def', tank('85mm_zis_s53', 32, '("armor_medium" turret(90 75 52 20) body(45 45 45 22))'));
  put(G, 'resource/set/breed/mp/rus/rifle.set', '{breed\n\t{behaviour soldier}\n\t{inventory\n\t\t{item "mosin"}\n\t}\n}\n');
  put(G, 'resource/set/breed/mp/rus/squadleader.set', '{breed\n\t{behaviour soldier}\n}\n');
  put(G, 'resource/set/breed/mp/ger/rifle.set', '{breed\n\t{behaviour soldier}\n}\n');
  put(G, 'resource/set/breed/mp/ger/squadleader.set', '{breed\n\t{behaviour soldier}\n}\n');
  put(G, 'resource/set/stuff/rifle/rifle.pattern', '{rifle\n\t{range 65 70}\n\t{damage 30}\n}\n');
  put(G, 'resource/set/stuff/rifle/mosin', '{from "pattern rifle"\n\t{filling "rifle"}\n\t{entity "mosin"}\n}\n');
  put(G, 'resource/interface/text/desc.lng', '{tags\n\t{"entity"\n\t\t{"pz6e" "PzKpfw VI Tiger"}\n\t\t{"t34_0" "T-34/76"}\n\t\t{"t34_3" "<c(ffff00)>T-34/85"}\n\t}\n\t{"squad"\n\t\t{"riflemans(rus)" "Regular infantry"}\n\t\t{"riflemans(ger)" "Grenadiers"}\n\t}\n}\n', 'utf8');
  put(G, 'resource/script/multiplayer/bot.data.lua', 'Purchases = {\n\t{--purchase 1\n\t\tRepeat = 1,\n\t\tUnits = {\n\t\t\t["rus"] = {\n\t\t\t\t{priority = 3.0, class = UnitClass.Infantry, unit = "riflemans(rus)"},\n\t\t\t\t{priority = 1.0, class = UnitClass.MediumTank, unit = "t34_0"}\n\t\t\t},\n\t\t\t["ger"] = {\n\t\t\t\t{priority = 1.0, class = UnitClass.HeavyTank, unit = "pz6e"}\n\t\t\t},\n\t\t}\n\t},\n}\n');
  const M = path.join(G, 'mods', 'testmod');
  fs.mkdirSync(M, { recursive: true });
  put(M, 'mod.info', '{name "test mod"}\n{desc "units ext test"}\n');
  return { game: G, mod: M };
}
module.exports = { make };
if (require.main === module) console.log(make(path.resolve(process.argv[2] || 'work')));

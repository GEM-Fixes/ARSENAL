// game parity fixtures for statsheet and balance (made up, no real game data):
//   shared(dir) -> {game, mod}: the units ext fixture game with as64.exe + mowas_2.exe (the shared AS2 install) and an as64/core layer
//     that changes the t34_3 card (cost 999) and the 76mm_f34 gun file: the AS64 view sees the core layer, the MoW:AS2 view (--exe mowas_2)
//     does not (vfs: as64/core only for as64.exe)
//   goh(dir) -> {game, mod}: a tiny Gates of Hell install (binaries/x64/call_to_arms.exe) shaped like the real one: period card files with
//     macro cards, {charge {delay} {interval}}, squad_cost_factor / round_multiple, a doctrine card, soldier cards with their own cost,
//     a vehicle def one folder deeper (-vehicle/<country>/<type>/), names in localizations/default/interface/text/**.pot and a '#' .lng,
//     presets/** with budgets whose start is a macro argument, a bot preset with other factors (left out), the research tree
//     (dynamic_campaign/unit_research_ger.set), no bot.data.lua; and a mod folder outside the install
//   Known answers (GHGPL-10): pz4 = 300 + 3 x 5 + 1 x 7 = 322, rounded up to 325; squad_rifle_early(ger) = 7 + 5 x 8 = 47;
//   doctrine_pz4_early = 20 (squad_cost_factor 0). Text is CRLF.
// Author: Imperator_Aug (ARSENAL, ia-c5a7e0d2)
const fs = require('fs'), path = require('path');
function put(root, key, text, enc) {
  const f = path.join(root, key); fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, Buffer.from(text.replace(/\r?\n/g, '\r\n'), enc || 'latin1'));
}
const U = 'resource/set/multiplayer/units/';

function shared(dir) {
  const r = require('../../gui/ext/units/fixture').make(dir);
  put(r.game, 'as64.exe', ''); put(r.game, 'mowas_2.exe', '');
  put(r.game, 'as64/core/' + U + 'vehicles_rus.set',
    '{"t34_0"            ("v" c(0) t(all medium) \t\ts(rus) n1(3) n2(1) g(e2) sc(17.50) b(v4) cw(0) cp(15)) {level 1} {cost 350} {fore 1.0}}\n' +
    '{"t34_3"            ("v" c(120) t(all medium) \t\ts(rus) n1(4) n2(1) g(e2) sc(22.50) b(v4) cw(0) cp(15)) {level 2} {cost 999} {fore 0.5}}\n');
  put(r.game, 'as64/core/resource/set/stuff/gun/76mm_f34', '{from "pattern gun"\n\t{rechargeTime 9}\n\t{projectileDamage 77}\n\t{projectileDamageTable {10 77} {100 70} {600 0}}\n\t{range 500 600}\n}\n');
  return r;
}

function goh(dir) {
  const G = path.join(dir, 'goh'), M = path.join(dir, 'gohmod');
  fs.rmSync(G, { recursive: true, force: true }); fs.rmSync(M, { recursive: true, force: true });
  put(G, 'binaries/x64/call_to_arms.exe', '');
  put(G, U + 'common.set', ';SDL\n{units\n\t(include "settings.set")\n\t(include "early/inf_ger.set")\n\t(include "early/units_ger.set")\n}\n');
  put(G, U + 'settings.set', ';SDL\n' +
    '(define "inf_tankman"\n\t{cost %cost}\n\t{tags "%period %side infantry man"}\n\t{cp 2}\n)\n' +
    '(define "vehicle2"\n\t{charge\n\t\t{delay %cd}\n\t\t{interval %ci}\n\t}\n\t{tags "all %t %side %period"}\n\t{group "%g"}\n\t{button "%b"}\n\t{cost %cost}\n' +
    '\t{content "* ( mp/%side/%period/%crew1 mp/%side/%period/%crew2 )"}\n\t{squad_cost_factor 1}\n\t{round_multiple 5.0}\n)\n' +
    '(define "squad2"\n\t{charge\n\t\t{delay %cd}\n\t\t{interval %ci}\n\t}\n\t{tags "all infantry %side %period"}\n\t{group "%g"}\n\t{button "%b"}\n' +
    '\t{content "mp/%side/%period/%c1 mp/%side/%period/%c2"}\n\t{squad_cost_factor 1}\n)\n' +
    '(define "generic_d"\n\t{level 1}\n\t{research_stage 1}\n\t{squad_cost_factor 0}\n\t{tags "all doctrine %t"}\n\t{button "doctrine"}\n)\n' +
    '(define "doctrine_t1"\n\t{charge\n\t\t{delay 300}\n\t\t{interval %cool}\n\t}\n\t{group "doctrine_t1"}\n\t{doctrine %d}\n\t{cost %cost}\n)\n' +
    '(define "veh_doctrine"\n\t("generic_d" t(%side %period))\n\t{content "%vehicle ( mp/%side/%period/%crew )"}\n)\n');
  put(G, U + 'early/inf_ger.set', ';SDL\n' +
    '{"mp/ger/early/tankman"\t\t("inf_tankman" side(ger) period(early) cost(5.0))}\n' +
    '{"mp/ger/early/tank_commander"\t("inf_tankman" side(ger) period(early) cost(7.0))}\n' +
    '{"mp/ger/early/rifleman"\t\t("inf_tankman" side(ger) period(early) cost(8.0))}\n');
  put(G, U + 'early/units_ger.set', ';SDL\n' +
    '{"pz4"\n\t("vehicle2" side(ger) period(early) t(medium) g(tank) b(tanks) cd(60) ci(120) cost(300) crew1(tankman:3) crew2(tank_commander:1))\n}\n' +
    '{"squad_rifle_early(ger)"\n\t("squad2" side(ger) period(early) g(sq) b(inf1) cd(0) ci(30) c1(tank_commander:1) c2(rifleman:5))\n}\n' +
    '; // the same tank in the doctrine panel\n' +
    '{"doctrine_pz4_early"\n\t("veh_doctrine" side(ger) period(early) vehicle(pz4) crew(tankman:4))\n\t("doctrine_t1" cool(180) d(early_ger_allround) cost(20))\n}\n');
  put(G, 'resource/entity/-vehicle/germany/tank_medium/pz4/pz4.def', '{game_entity\n\t{Locomotion\n\t\t{MaxSpeed 40}\n\t}\n\t{Weaponry\n\t\t{place "gun"\n\t\t\t{weapon "75mm_kwk37"}\n\t\t}\n\t}\n' +
    '\t{Volume "body"\n\t\t{thickness 50\n\t\t\t{rear 20}\n\t\t\t{left 30}\n\t\t\t{right 30}\n\t\t\t{top 15}\n\t\t}\n\t}\n}\n');
  put(G, 'resource/set/stuff/gun/75mm_kwk37', '{from "pattern gun"\n\t{rechargeTime 5}\n\t{projectileDamage 100}\n\t{projectileDamageTable {10 60} {100 50} {500 0}}\n\t{range 400 450}\n}\n');
  put(G, 'localizations/default/interface/text/desc/desc_ger.pot', '#, fuzzy\nmsgid ""\nmsgstr ""\n"Content-Type: text/plain; charset=UTF-8\\n"\n\n' +
    'msgctxt "desc/entity/pz4"\nmsgid "Panzer IV"\nmsgstr ""\n\nmsgctxt "info/special/pz4"\nmsgid "Medium tank"\nmsgstr ""\n\n' +
    'msgctxt "desc/squad/squad_rifle_early(ger)"\nmsgid "Rifle squad"\nmsgstr ""\n\nmsgctxt "desc/human/mp/ger/early/Tankman"\nmsgid "Tankman"\nmsgstr ""\n', 'utf8');
  put(G, 'localizations/default/interface/text/desc/#names.lng', '{tags\n\t{"entity"\n\t\t{"pz4" "Pz.Kpfw. IV Ausf. D"}\n\t}\n}\n', 'utf8');
  const P = 'resource/set/multiplayer/games/presets/';
  put(G, P + 'global_parameters/budget.inc', '{budgets\n\t{vehicle\n\t\t{mode "standard"}\n\t\t{resource\n\t\t\t{start\t\t%s}\n\t\t\t{finish\t\t%f}\n\t\t}\n\t\t{buttons "inf1 inf2 empl vehicles tanks"}\n\t}\n' +
    '\t{hero\n\t\t{resource\n\t\t\t{start %d}\n\t\t}\n\t\t{buttons "doctrine"}\n\t\t{tag "special"}\n\t}\n}\n');
  put(G, P + 'global_parameters/bots_generic.inc', '{chargeFactors\n\t{value "*=9"}\n}\n');
  put(G, P + 'preset_early.inc', '(define "standard_all"\n\t{common\n\t\t{chargeFactors\n\t\t\t{value "*=1.00"}\n\t\t}\n\t\t(include "global_parameters/budget.inc" s(%start) f(%finish) d(%doctrine))\n\t}\n)\n' +
    '{presets\n\t{"s:early_standard_100"\n\t\t("standard_all" start(200) finish(2650) doctrine(150) cp(0:100))\n\t}\n\t{"s:early_standard_80"\n\t\t("standard_all" start(200) finish(2150) doctrine(150) cp(0:80))\n\t}\n}\n');
  put(G, 'resource/set/multiplayer/games/frontlines.set', '{game\n\t{presets (include "presets/preset_early.inc")}\n}\n');
  put(G, 'resource/set/dynamic_campaign/unit_research_ger.set', '{IconGap 28}\n\t{positions\n\t\t{"pz4" 0 2}\n\t}\n' +
    '\t{ tech "defense_level_1"\t\trequires "reinforcement_stage_2"\t\tcosts 1  position 2 0}\n' +
    ';\t{"commented_out"\t\trequires ""\t\tcosts 9  position 0 0}\n' +
    '\t{"squad_rifle_early(ger)"\trequires\t"pz4"\t\tcosts 2  position mid}\n');
  fs.mkdirSync(M, { recursive: true });
  return { game: G, mod: M };
}
module.exports = { shared, goh, put };
if (require.main === module) console.log(shared(path.resolve(process.argv[2] || 'work')), goh(path.resolve(process.argv[2] || 'work')));

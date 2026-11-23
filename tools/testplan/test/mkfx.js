// testplan fixture (made up, no real game data). make(dir) -> {game, mod, goh, gohMod, touch, FILES}
//   game    a tiny AS2 install (as64.exe + mowas_2.exe, as64/plus built-in mod, loose resource/): one tank def with a gun (t34_0,
//           76mm_f34, a model with a .mtl that names the texture), one field gun (zis3, 76mm_zis3), one soldier breed with a rifle
//           (mp/rus/rifle, mosin), card files (t34_0, zis3, a rifle squad), an ammo file, names in desc.lng, and the two foes
//           the runners shoot at by default (the car gaz67b, the soldier mp/ger/rifle)
//   mod     the mod under test, OUTSIDE <game>/mods (given by path): changes the tank's weapon file, adds a new vehicle def
//           (bt7_fx) and changes the tank's texture. FILES = those three, as paths inside the mod.
//   goh     a tiny Gates of Hell install (binaries/x64/call_to_arms.exe) with the same tank and gun and a period card file;
//   gohMod  the same three changes for it (mod.info without version bounds).
//   touch(file, text) rewrites one mod file with a new size and a later time (one edit after `mark`).
// Text is CRLF. usage: node mkfx.js <dir>
// Author: Imperator_Aug (ARSENAL, ia-7716e4a6)
'use strict';
const fs = require('fs'), path = require('path');
function put(root, key, text, enc) {
  const f = path.join(root, key); fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, Buffer.isBuffer(text) ? text : Buffer.from(String(text).replace(/\r?\n/g, '\r\n'), enc || 'latin1'));
  return f;
}
const U = 'resource/set/multiplayer/units/';
const FILES = {
  weapon: 'resource/set/stuff/gun/76mm_f34',
  def: 'resource/entity/-vehicle/tank_light/bt7_fx/bt7_fx.def',
  texture: 'resource/entity/-vehicle/tank_medium/t34_0/t34_0.dds',
};
const tank = (gun, speed, mdl) => '{game_entity\n' + (mdl ? '\t{Extension "' + mdl + '"}\n' : '') + '\t{Locomotion\n\t\t{MaxSpeed ' + speed + '}\n\t}\n\t{Weaponry\n\t\t{place "gun"\n\t\t\t{weapon "' + gun + '"}\n\t\t}\n\t}\n\t{Volume "body"\n\t\t{thickness 45}\n\t}\n}\n';
const gun = (dmg, range) => '{from "pattern gun"\n\t{rechargeTime 6}\n\t{projectileDamage ' + dmg + '}\n\t{projectileDamageTable {10 ' + dmg + '} {100 ' + (dmg - 10) + '} {600 0}}\n\t{range ' + range + ' ' + (range + 50) + '}\n}\n';
const dds = n => Buffer.concat([Buffer.from('DDS '), Buffer.alloc(124 + n, n)]);

function entities(G) {
  put(G, 'resource/entity/-vehicle/tank_medium/t34_0/t34_0.def', tank('76mm_f34', 34, 't34_0.mdl'));
  put(G, 'resource/entity/-vehicle/tank_medium/t34_0/t34_0.mdl', '{Skeleton\n\t{bone "body"\n\t\t{VolumeView "body.ply"}\n\t}\n}\n');
  put(G, 'resource/entity/-vehicle/tank_medium/t34_0/t34_0.mtl', '{material\n\t{diffuse "t34_0"}\n}\n');
  put(G, FILES.texture, dds(1));
  put(G, 'resource/entity/-vehicle/cannon/zis3/zis3.def', tank('76mm_zis3', 0, null));
  put(G, 'resource/set/stuff/gun/gun.pattern', '{gun\n\t{range 100 150}\n\t{damage 10}\n}\n');
  put(G, FILES.weapon, gun(90, 500));
  put(G, 'resource/set/stuff/gun/76mm_zis3', gun(100, 550));
  put(G, 'resource/set/stuff/ammo/ammo.pattern', '{ammo\n\t{tag "ammo"}\n}\n');
  put(G, 'resource/set/stuff/ammo/ammo76 ap', '{from "pattern ammo"\n\t{entity "ammo76"}\n}\n');
}

function make(dir) {
  const G = path.join(dir, 'game'), M = path.join(dir, 'fxmod'), H = path.join(dir, 'goh'), HM = path.join(dir, 'fxgoh');
  for (const d of [G, M, H, HM]) fs.rmSync(d, { recursive: true, force: true });
  // ---- AS2 game ----
  put(G, 'as64.exe', ''); put(G, 'mowas_2.exe', '');
  put(G, 'as64/plus/mod.info', '{mod\n\t{name "as64+"}\n\t{MinGameVersion "3.301"}\n}\n');
  put(G, 'resource/set/multiplayer/main.set', '(include "units/common.set")\n');
  put(G, U + 'common.set', ';SDL\n{units\n\t(include "soldiers.set")\n\t(include "squads.set")\n\t(include "vehicles.set")\n}\n');
  put(G, U + 'soldiers.set', ';SDL\n' +
    '(define "tankman"\n    {tags   "tankman %side crew man"}\n    {cp     2.0}\n    {score  0.25}\n    {basic}\n    {breed}\n    {cw 0.25}\n)\n{"mp/rus/tankman" ("tankman" side(rus))}\n' +
    '(define "rifle"\n    {tags   "rifle %side man"}\n    {cp     1.0}\n    {score  0.5}\n    {basic}\n    {breed}\n)\n{"mp/rus/rifle" ("rifle" side(rus))}\n{"mp/ger/rifle" ("rifle" side(ger))}\n');
  put(G, U + 'squads.set', ';----- Squads -----\n' +
    '(define "squad_with2types"\n\t{"%name(%side)"\n\t\t{charge %c}\n\t\t{content "mp/%side/%c1 mp/%side/%c2"}\n\t\t{tags "frontline_cp infantry %side %t"}\n\t\t{group "%g"}\n\t\t{button "%b"}\n\t\t{level %level}\n\t\t{cost %cost}\n\t\t{fore %f}\n\t}\n)\n' +
    '("squad_with2types" side(rus) name(riflemans) c(30) g(squad_2) c1(rifle:1) c2(rifle:5) b(squad1) t(all inf_only) level(1) cost(140) f(1.0))\n');
  put(G, U + 'vehicles.set', ';----- Vehicles -----\n' +
    '(define "generic_v"\n    {charge %c}\n    {score %sc}\n    {tags "%t"}\n    {group "%g"}\n    {button "%b"}\n    {cw %cw}\n    {cp %cp}\n)\n' +
    '(define "v"\n    ("generic_v" c(%c) sc(%sc) t(%t %s) g(%g) b(%b) cw(%cw) cp(%cp))\n    {content "* ( mp/%s/tankman:%n1 mp/%s/rifle:%n2)"}\n)\n' +
    '{"t34_0"            ("v" c(0) t(all medium) \t\ts(rus) n1(3) n2(1) g(e2) sc(17.50) b(v4) cw(0) cp(15)) {level 1} {cost 350} {fore 1.0}}\n' +
    '{"zis3"             ("v" c(0) t(all cannon) \t\ts(rus) n1(2) n2(1) g(c1) sc(10.00) b(v2) cw(0) cp(8)) {level 1} {cost 200} {fore 1.0}}\n' +
    '{"gaz67b"           ("v" c(0) t(all car) \t\ts(rus) n1(1) n2(1) g(a1) sc(2.00) b(v1) cw(0) cp(2)) {level 1} {cost 40} {fore 1.0}}\n');
  entities(G);
  // the foes the runners shoot at by default (edrun/pack.js: gaz67b, mp/ger/rifle)
  put(G, 'resource/entity/-vehicle/car/gaz67b/gaz67b.def', '{game_entity\n\t{Locomotion\n\t\t{MaxSpeed 70}\n\t}\n\t{Volume "body"\n\t\t{thickness 2}\n\t}\n}\n');
  put(G, 'resource/set/breed/mp/ger/rifle.set', '{breed\n\t{behaviour soldier}\n\t{inventory\n\t\t{item "mosin"}\n\t}\n}\n');
  put(G, 'resource/set/breed/mp/rus/rifle.set', '{breed\n\t{behaviour soldier}\n\t{inventory\n\t\t{item "mosin"}\n\t}\n}\n');
  put(G, 'resource/set/breed/mp/rus/tankman.set', '{breed\n\t{behaviour soldier}\n}\n');
  put(G, 'resource/set/stuff/rifle/rifle.pattern', '{rifle\n\t{range 65 70}\n\t{damage 30}\n}\n');
  put(G, 'resource/set/stuff/rifle/mosin', '{from "pattern rifle"\n\t{filling "rifle"}\n\t{entity "mosin"}\n}\n');
  put(G, 'resource/interface/text/desc.lng', '{tags\n\t{"entity"\n\t\t{"t34_0" "T-34/76"}\n\t\t{"zis3" "ZiS-3"}\n\t}\n\t{"squad"\n\t\t{"riflemans(rus)" "Regular infantry"}\n\t}\n}\n', 'utf8');
  // ---- the mod under test (outside <game>/mods) ----
  put(M, 'mod.info', '{mod\n\t{name "fxmod"}\n\t{desc "testplan fixture"}\n\t{MinGameVersion "3.301"}\n\t{MaxGameVersion "3.999"}\n}\n');
  put(M, FILES.weapon, gun(120, 600));
  put(M, FILES.def, tank('76mm_f34', 50, null));
  put(M, FILES.texture, dds(7));
  // ---- GoH game + its mod ----
  put(H, 'binaries/x64/call_to_arms.exe', '');
  put(H, U + 'common.set', ';SDL\n{units\n\t(include "early/inf_rus.set")\n\t(include "early/units_rus.set")\n}\n');
  put(H, U + 'early/inf_rus.set', ';SDL\n{"mp/rus/early/tankman"\n\t{cost 5.0}\n\t{tags "early rus infantry man"}\n\t{cp 2}\n}\n');
  put(H, U + 'early/units_rus.set', ';SDL\n{"t34_0"\n\t{charge\n\t\t{delay 60}\n\t\t{interval 120}\n\t}\n\t{tags "all medium rus early"}\n\t{group "tank"}\n\t{button "tanks"}\n\t{cost 300}\n' +
    '\t{content "* ( mp/rus/early/tankman:4 )"}\n\t{squad_cost_factor 1}\n\t{round_multiple 5.0}\n}\n');
  entities(H);
  put(H, 'localizations/default/interface/text/desc/desc_rus.pot', '#, fuzzy\nmsgid ""\nmsgstr ""\n"Content-Type: text/plain; charset=UTF-8\\n"\n\nmsgctxt "desc/entity/t34_0"\nmsgid "T-34/76"\nmsgstr ""\n', 'utf8');
  put(HM, 'mod.info', '{mod\n\t{name "fxgoh"}\n\t{desc "testplan fixture"}\n}\n');
  put(HM, FILES.weapon, gun(120, 600));
  put(HM, FILES.def, tank('76mm_f34', 50, null));
  put(HM, FILES.texture, dds(7));
  return { game: G, mod: M, goh: H, gohMod: HM, FILES, touch };
}
// one edit: other bytes, another size, a time after now
function touch(mod, rel, text) {
  const f = put(mod, rel, text), t = new Date(Date.now() + 5000);
  fs.utimesSync(f, t, t);
  return f;
}
module.exports = { make, touch, put, FILES, tank, gun };
if (require.main === module) console.log(make(path.resolve(process.argv[2] || path.join(require('os').tmpdir(), 'testplan-fx'))));

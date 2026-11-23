// clone-entity fixture: fixture/game = mini game dir (loose vanilla stuff + localization), fixture/game/mods/* = out mods.
// scenarios + expected findings live in check.js / truth.md ("scenario CODE").
// Author: Imperator_Aug (ARSENAL, ia-9db15359)
const fs = require('fs'), path = require('path');
const dir = path.join(process.env.TEST_WORK || __dirname, 'fixture');
fs.rmSync(dir, { recursive: true, force: true });
function put(rel, lines) {
  const f = path.join(dir, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, lines.join('\r\n') + '\r\n', 'latin1');   // game text = cp1251 + CRLF (ASCII here)
}
const S = 'game/resource/set/stuff/';
put(S + 'rifle.pattern', ['{rifle', '\t{tag "pattern"}', '\t{healthDamage 50}', '}']);
put(S + 'rifle/k98', ['{from "pattern rifle"', '\t{tag "weapon rifle bolt"}', '\t{entity "k98"}', '\t{damage blastwave 10}', '}']);
put(S + 'rifle/shotgun', ['{from "pattern rifle"', '\t{tag "weapon rifle shotgun"}', '\t{entity "shotgun"}', '\t{special', '\t\t{throw_off_always}', '\t}', '}']);
put(S + 'rifle/shotgun2', ['{from "shotgun"', '\t{tag "weapon rifle shotgun2"}', '}']);
put(S + 'ammo/zam.ammo', ['{bullet', '\t{tag "bullet"}', '}']);
put('game/localization/desc.lng', [
  '{tags', '\t{"weapon" {"k98" "Kar 98"} {"k98 old" "Old"}}', '\t{"ammo" {"zam bullet" "Zam"}}', '}']);
// entity fixture: vehicle tk1 (def + relative include + mdl/mtl/ply/dds), tk1 roster card, tk2 def with a dangling model
const E = 'game/resource/entity/-vehicle/tank/';
put(E + 'tk1/tk1.def', ['{game_entity', '	(include "/properties/tank.ext")', '	(include "tk1.inc")', '	(include "nosuch.inc")', '	{Extension "tk1.mdl"}', '}']);
put(E + 'tk1/tk1.inc', ['{props "medium"}']);
put(E + 'tk1/tk1.mdl', ['{model', '	{volumeview "tk1.ply"}', '}']);
put(E + 'tk1/tk1.mtl', ['{material', '	{diffuse "tk1.dds"}', '}']);
put(E + 'tk1/tk1.ply', ['{ply}']);
put(E + 'tk1/tk1.dds', ['DDS']);
// real-enough mesh: EPLY + MESH (material flag 0x400) naming its own .mtl, as vanilla does (FMT-03)
const meshNaming = n => { const fl = Buffer.alloc(16); fl.writeUInt32LE(0x400, 12); return Buffer.concat([Buffer.from('EPLYMESH', 'latin1'), fl, Buffer.from([n.length]), Buffer.from(n, 'latin1')]); };
put(E + 'tk7/tk7.def', ['{game_entity', '	{Extension "tk7.mdl"}', '}']);
put(E + 'tk7/tk7.mdl', ['{model', '	{volumeview "hull.ply"}', '	{volumeview "bad.ply"}', '}']);
fs.writeFileSync(path.join(dir, E, 'tk7/hull.ply'), meshNaming('hull_paint.mtl'));
fs.writeFileSync(path.join(dir, E, 'tk7/bad.ply'), meshNaming('nosuch.mtl'));
put(E + 'tk7/hull_paint.mtl', ['{material bump', '	{diffuse "hull_d"}', '	{bump "/texture/common/gone"}', '}']);
put(E + 'tk7/hull_d.dds', ['DDS']);
put(E + 'tk2/tk2.def', ['{game_entity', '	{Extension "gone.mdl"}', '}']);
put('game/resource/properties/tank.ext', ['{props "tank"}']);
put('game/resource/set/multiplayer/units/vehicles.set', [';cards', '{"tk1"  ("v" c(0) s(ger))  {cost 10}}', '{"other" ("v" c(0) s(ger))}']);
// made-up GoH tree (loose; never real GoH data) for --model-from: gx1 = mdl with ply/vol/anm refs, a sequence with no {file}, a missing anm,
// a {##tag, own mtl + texture, and a mesh naming its mtl; gx2 dir holds two mdl (ambiguous)
const GO = 'goh/resource/entity/-vehicle/ussr/tank/';
put(GO + 'gx1/gx1.mdl', ['{model', '\t{volumeview "gx1_hull.ply"}', '\t{##turret 1}', '\t{polyhedron "gx1.vol"}', '\t{sequence "gx1_fire"}', '\t{sequence "gx1_move" {file "gx1_move.anm"}}', '\t{sequence "gx1_gone" {file "gone.anm"}}', '}']);
put(GO + 'gx1/gx1.mtl', ['{material', '\t{diffuse "gx1_d"}', '}']);
fs.writeFileSync(path.join(dir, GO, 'gx1/gx1_hull.ply'), meshNaming('gx1_paint.mtl'));
put(GO + 'gx1/gx1_paint.mtl', ['{material', '\t{diffuse "gx1_p.dds"}', '}']);
put(GO + 'gx1/gx1_d.dds', ['DDS']);
put(GO + 'gx1/gx1_p.dds', ['DDS']);
put(GO + 'gx1/gx1.vol', ['VOL']);
put(GO + 'gx1/gx1_fire.anm', ['ANM']);
put(GO + 'gx1/gx1_move.anm', ['ANM']);
// PORTREV2 #15: gx3 mtl names rooted textures: one AS2 has (tk1.dds), one only GoH has (copied at its rooted key), one nowhere (WARN), one $/ (WARN unchecked)
put(GO + 'gx3/gx3.mdl', ['{model}']);
put(GO + 'gx3/gx3.mtl', ['{material', '\t{diffuse "/entity/-vehicle/tank/tk1/tk1"}', '\t{bump "/texture/goh/only_n"}', '\t{specular "/texture/common/gone_s"}', '\t{mask "$/fx/mask"}', '}']);
put('goh/resource/texture/goh/only_n.dds', ['DDS']);
// FIX-PORT (tools-mod:29): a Workshop item (steam/workshop/content/400750/111) whose mdl names files that sit only in the base GoH install's
// resource/entity/-vehicle.pak (steam/common/Call to Arms - Gates of Hell, made up), plus a $/ texture only the base has loose (texture/common)
const WS = 'steam/workshop/content/400750/111/resource/entity/-vehicle/ussr/tank/gw1/', GB = 'steam/common/Call to Arms - Gates of Hell/';
put(WS + 'gw1.mdl', ['{model', '\t{volumeview "gw1_body.ply"}', '\t{polyhedron "gw1.vol"}', '\t{sequence "gw1_start"}', '}']);
put(WS + 'gw1.mtl', ['{material', '\t{diffuse "$/_v/gw1_c"}', '}']);
put(GB + 'binaries/x64/call_to_arms.exe', ['MZ']);
put(GB + 'resource/texture/common/_v/gw1_c.dds', ['DDS']);
fs.mkdirSync(path.join(dir, GB, 'resource/entity'), { recursive: true });
require('../../lib/zipwrite').writeZip(path.join(dir, GB, 'resource/entity/-vehicle.pak'), [
  ['-vehicle/ussr/tank/gw1/gw1_body.ply', Buffer.from('EPLY')], ['-vehicle/ussr/tank/gw1/gw1.vol', Buffer.from('VOL')], ['-vehicle/ussr/tank/gw1/gw1_start.anm', Buffer.from('ANM')]]);
put(GO + 'gx2/a.mdl', ['{model}']);
put(GO + 'gx2/b.mdl', ['{model}']);
// mod folders (out dirs); mod_desc already carries its own desc.lng (LOC-01: it replaced vanilla's)
put('game/mods/mod_desc/localization/desc.lng', ['{tags', '\t{"weapon" {"mine" "Mine"}}', '}']);
fs.mkdirSync(path.join(dir, 'game/mods/mod_a'), { recursive: true });
fs.mkdirSync(path.join(dir, 'game/mods/mod_b'), { recursive: true });
// building fixture: concrete house with armor macro, hollow body, window volume, destroyed variant
const B = 'game/resource/entity/construction/eu/town/';
put(B + 'hse1/hse1.def', ['{game_entity', '\t(include "/properties/building.inc")', '\t{props "concrete" "construction"}', '\t("armor_house_concrete")', '\t;{ObstacleID "unbreakable"}', '\t{Extension "hse1.mdl"}', '\t{Volume "body01"', '\t\t{Thickness 20}', '\t}', '\t{Volume "body02"', '\t\t{Thickness hollow 5}', '\t}', '\t{Volume "window01"', '\t\t{Thickness 1}', '\t}', '}']);
put(B + 'hse1/hse1.mdl', ['{model}']);
put(B + 'hse1_x/hse1_x.def', ['{game_entity', '\t{Extension "hse1_x.mdl"}', '}']);
put(B + 'hse1_x/hse1_x.mdl', ['{model}']);
put(B + 'wl1/wl1.def', ['{game_entity', '\t(include "/properties/construction.inc")', '\t{props "wood" "construction"}', '\t("armor_medium" args 0.7)', '\t{Extension "wl1.mdl"}', '\t{Volume "body"', '\t\t{Thickness 30}', '\t}', '}']);
put(B + 'wl1/wl1.mdl', ['{model}']);
put('game/resource/properties/building.inc', ['{game_entity}']);
put('game/resource/properties/construction.inc', ['{game_entity}']);

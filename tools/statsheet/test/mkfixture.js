// statsheet fixture: a loose folder (fx/resource/...) with clean data + seeded defects.
// a line carrying ";@CODE" (SDL comment) must produce exactly one finding CODE on that line; truth.txt = "file:line CODE" pairs.
// Author: Imperator_Aug (ARSENAL, ia-26eb311b)
const fs = require('fs'), path = require('path');
const out = path.join(__dirname, 'fx');
fs.rmSync(out, { recursive: true, force: true });
const truth = [], md = ['# file:line: CODE (seeded defects; derived from ;@CODE markers by mkfixture.js)'];
function put(rel, lines) {
  const f = path.join(out, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  lines.forEach((l, i) => { const m = /;@([A-Z_]+)\s*$/.exec(l); if (m) { truth.push(`${rel}:${i + 1} ${m[1]}`); md.push(`${rel}:${i + 1}: ${m[1]}`); } });
  fs.writeFileSync(f, lines.join('\r\n') + '\r\n', 'latin1');   // game text = cp1251 + CRLF
}

// ---- armor: GPL-04 DMG-06 KEY-16 ----
put('resource/entity/ok/ok.def', [
  '{game_entity',
  '\t{volume "hull" {tags "hull"} {thickness 30}}',           // no area matches tag "hull": per-volume value is live
  '\t{volume "plate" {tags "body"} {thickness 40}}',          // area sets the same 40: nothing lost
  '\t{volume "slot" {tags "slot"} {thickness 25}}',           // area value 0 on every side: per-volume value is live
  '\t{armor {setting "body" {thickness 40} {volumes "body*"}} {setting "slot" {thickness 0} {volumes "slot*"}}}',
  '}']);
put('resource/entity/bad/bad.def', [
  '{game_entity',
  '\t{volume "body1" {tags "body"} {component "body"}',
  '\t\t{thickness 30}   ;@ARMOR_VOLUME_SHADOWED',
  '\t}',
  '\t{volume "turret1" {tags "turret"}',
  '\t\t{thickness 20 {top 5}}   ;@ARMOR_VOLUME_SHADOWED',
  '\t}',
  '\t{armor',
  '\t\t{setting "turret" {thickness 50 30 30 10} {volumes "turret*"}}',
  '\t\t{setting "body" {thickness 50 30 20 22} {volumes "body*"}}',
  '\t}',
  '}']);

// ---- ammo tags (vocabulary for {parameters}) + DMG-13 ----
put('resource/set/stuff/shell/b1.ap.bc.ammo', [
  '{shell',
  '\t{mass 5}',
  '\t{damage blastwave {energy 1}{area 1 2}}   ;@BLASTWAVE_REPLACED',
  '\t{damage blastwave {energy 2}{area 1 2}}',
  '\t{damage add blastwave {energy 3}{area 2 3}}',
  '}']);
put('resource/set/stuff/shell/b2.fg.ammo', [
  '{shell',
  '\t{damage blastwave {energy 2}{area 1 2}}',
  '\t{damage add blastwave {energy 3}{area 2 3}}',
  '}']);

// ---- weapon: DMG-01 DMG-02 ----
put('resource/set/stuff/gun/g1', [
  '{from "pattern gun"',
  '\t{rechargeTime 6}',
  '\t{range 100 120}   ;@WARN_PEN_TABLE_SHORT',
  '\t{projectileDamage 100}',
  '\t{projectileDamageTable {10 100}{50 90}{100 0}}',
  '\t{parameters "ap" {projectileDamageTable {10 90}{100 0}}}',
  '\t{parameters "ap bc" {range 1 2}}   ;@PARAM_BLOCK_SHADOWED',
  '\t{parameters "zzqq" {range 3 4}}   ;@PARAM_TAG_UNKNOWN',
  '\t{parameters "ap" {range 5 6}}',                           // same tags merge: not shadowed
  '\t{parameters "fg"',
  '\t\t{projectileDamageTable',
  '\t\t\t{10 100}',
  '\t\t\t{50 20}   ;@DMG_TABLE_UNTERMINATED',
  '\t\t}',
  '\t}',
  '}']);

// ---- GPL-03: table has to reach range+5; DMG-23 DMG-25 armor (CHK-MIXA) ----
put('resource/set/stuff/gun/pen_ok', ['{from "pattern gun"', '\t{range 100 120}', '\t{projectileDamage 50}', '\t{projectileDamageTable {10 50}{100 20}{125 0}}', '}']);
put('resource/set/stuff/gun/pen_short', ['{from "pattern gun"', '\t{range 100 150}   ;@WARN_PEN_TABLE_SHORT', '\t{projectileDamage 50}', '\t{projectileDamageTable {10 50}{100 20}{130 0}}', '}']);
put('resource/entity/rep/rep_twice.def', [
  '{game_entity',
  '\t{armor',
  '\t\t{setting "body" {thickness 40} {volumes "body*"}}',
  '\t\t{setting "body" {thickness 60}}   ;@WARN_ARMOR_AREA_REPEATED',
  '\t}',
  '}']);
put('resource/entity/rep/rep_once.def', [
  '{game_entity',
  '\t{armor {setting "body" {thickness 40} {volumes "body*"}} {setting "turret" {thickness 30} {volumes "turret*"}}}',
  '\t{armor {setting "body" {thickness 60}}}',          // another {armor} block re-setting an area: macros do this on purpose
  '}']);
put('resource/entity/spl/spl_flat.def', [
  '{game_entity',
  '\t{volume "body1" {tags "body"} {component "body"}',
  '\t\t{thickness 50}   ;@WARN_ARMOR_SPLIT_FLATTENED',
  '\t}',
  '\t{volume "body2" {tags "body"} {component "body"}',
  '\t\t{thickness 30}   ;@ARMOR_VOLUME_SHADOWED',
  '\t}',
  '\t{armor {setting "body" {thickness 50} {volumes "body*"}}}',
  '}']);
put('resource/entity/spl/spl_keep.def', [
  '{game_entity',
  '\t{volume "body1" {tags "body"} {component "body"} {thickness 50}}',
  '\t{volume "body2" {tags "body"} {component "body"} {thickness 30}}',
  '\t{armor {setting "body" {thickness 0} {volumes "body*"}}}',   // 0 on every side: the split stays
  '}']);

// ---- {from} chain (TST-38): a rifle and a clone inherit rows from the pattern ----
put('resource/set/stuff/rifle/rifle.pattern', [
  '{from "pattern bullet"',
  '	{rechargeTime 3}',
  '	{range 65 70}',
  '	{ProjectileDamage 5}',
  '	{projectileDamageTable {50 5} {100 0}}',
  '}']);
put('resource/set/stuff/rifle/rf1', ['{from "pattern rifle"', '	{rechargeTime 2}', '}']);
put('resource/set/stuff/rifle/rf2', ['{from "rf1"', '	{range 80 90}', '}']);

// ---- breeds: GPL-13 ----
put('resource/set/ability/rifle.set', ['{"rifle" {level "lvl_1" {stand {accuracy 1}}} {level "lvl_2" {stand {accuracy 2}}}}']);
put('resource/set/breed/b1.set', [
  '{breed',
  '\t{perks',
  '\t\t{"rifle" lvl_2}',
  '\t\t{"rifle" lvl_9}   ;@PERK_LEVEL_UNDEFINED',
  '\t\t{"speed" 0.9}',
  '\t}',
  '}']);

fs.writeFileSync(path.join(__dirname, 'truth.txt'), truth.join('\n') + '\n');
fs.writeFileSync(path.join(__dirname, 'truth.md'), md.join('\n') + '\n');

// roster-insert fixtures (outside fx/ so the index golden is unaffected): cp1251 bytes + CRLF
fs.rmSync(path.join(__dirname, 'roster'), { recursive: true, force: true });
fs.mkdirSync(path.join(__dirname, 'roster'));
fs.writeFileSync(path.join(__dirname, 'roster', 'units_a.set'), Buffer.from(['{units', '\t{"rifleman" {cost 10} {tags "inf"}}  ; \xcf\xf0\xe8\xe2\xe5\xf2', '\t{"mg" {cost 20} {tags "inf"}}', '}', ''].join('\r\n'), 'latin1'));
fs.writeFileSync(path.join(__dirname, 'roster', 'empty.set'), Buffer.from('{units\r\n}\r\n', 'latin1'));

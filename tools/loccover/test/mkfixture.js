// loccover fixture: fixture/game (mini vanilla) + fixture/game/mods/m (mod) + truth.md.
// put(rel, lines): rel under fixture/; line = text | [text, CODE...] -> truth "<path rel to mod>:line: CODE" (mod files only)
// Author: Imperator_Aug (ARSENAL, ia-f087a9df)
const fs = require('fs'), path = require('path');
if (!process.env.TEST_WORK) { console.error('mkfixture: TEST_WORK not set (run.sh sets it); a direct run would delete the tracked test/fixture'); process.exit(2); }
const dir = path.join(process.env.TEST_WORK || __dirname, 'fixture');   // run.sh: per-run TEST_WORK, tracked files untouched
fs.rmSync(dir, { recursive: true, force: true });
const truth = ['# file:line: CODE (seeded defects; diffed by run.sh)'];
const MOD = 'game/mods/m/';
function put(rel, lines) {
  const f = path.join(dir, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const text = lines.map((l, i) => {
    if (Array.isArray(l)) { for (const c of l.slice(1)) truth.push(`${rel.slice(MOD.length)}:${i + 1}: ${c}`); return l[0]; }
    return l;
  });
  fs.writeFileSync(f, text.join('\r\n') + '\r\n', 'latin1');   // ASCII only: utf8 == cp1251
}

// ---- mini vanilla
put('game/resource/set/multiplayer/units/common.set', [';SDL', '{units', '\t(include "base.set")', '}']);
put('game/resource/set/multiplayer/units/base.set', [';SDL', '{"oldtank" {tags "all"} {cost 1}}', '{"keeptank" {tags "all"}}', '{"sqv(ger)" {tags "x"}}']);
put('game/localization/desc.lng', [
  '{tags', '\t{"entity" {"oldtank" "Old"} {"keeptank" "Keep"}}', '\t{"squad" {"sqv(ger)" "SQV"}}',
  '\t{"ammo" {"zam bullet" "Zam"} {"yam aa bb" "Yam"}}', '}']);
put('game/localization/info.lng', ['{tags', '\t{"entity" {"vickers" "V"}}', '\t{"squad" {"sqv(ger)" "i"}}', '}']);
put('game/localization/#dlg_ingame.lng', ['{tags', '\t{"component" {"gun_ok" "Gun ok"}}', '}']);
put('game/resource/set/stuff/ammo/zam.ammo', ['{bullet', '\t{tag "bullet"}', '}']);
put('game/resource/set/stuff/ammo/yam.ammo', ['{bullet', '\t{tag "aa bb"}', '}']);

// ---- mod
put(MOD + 'mod.info', ['{Mod', '\t{Name "m"}', '}']);
put(MOD + 'localization/desc.lng', [   // replaces vanilla desc.lng; drops entity/oldtank (card oldtank is still in the units set)
  ['{tags', 'LOC_FILE_REPLACED'],
  '\t{"entity" {"keeptank" "Keep"} {"okcard" "Ok"}}',
  '\t{"squad" {"sqv(ger)" "SQV"} {"howcard(ger)" "How"} {"sqd(ger)" "S"} {"sqd2(ger)" "S2"} {"sqd3(ger)" "S3"}}',
  '\t{"human" {"mp" {"ger" {"rifleman" "R"}}}}',
  '\t{"ammo" {"zam bullet" "Zam"} {"yam aa bb" "Yam"}}', '}']);
put(MOD + 'localization/info.lng', ['{tags', '\t{"entity" {"vickers" "V"}}', '\t{"squad" {"sqv(ger)" "i"} {"sqd3(ger)" "i3"}}', '}']);
put(MOD + 'resource/set/multiplayer/units/common.set', [
  ';SDL',
  '{units',
  ['\t(include "base.set")', 'LOC_NAME_MISSING'],   // oldtank key dropped by the mod desc.lng; reported at the include site
  ['\t{"newtank" {tags "all"}}', 'LOC_NAME_MISSING'],
  '\t{"okcard" {tags "all"}}',
  ['\t{"howcard" {tags "all"}}', 'LOC_HOW_SIDEKEY'],
  ['\t{"mp/ger/newman" {breed}}', 'LOC_NAME_MISSING'],
  ['\t{"sqd(ger)" {tags "x"}}', 'LOC_INFO_MISSING'],
  '\t{"sqd2(ger)" {info vickers}}',
  '\t{"sqd3(ger)" {tags "x"}}',
  '\t{"mp/ger/rifleman" {breed}}',
  '}']);
put(MOD + 'resource/entity/test/t.def', [
  ';SDL', '{entity',
  '\t{damage_report "gun" "component/gun_ok"}',
  ['\t{damage_report "gun" "component/gun_brokn"}', 'LOC_DAMAGE_KEY'],
  '\t{damage_report "engine" "<c(FF1F00)>Knocked Out"}',
  '}']);
put(MOD + 'resource/set/stuff/ammo/zam.ammo', [['{bullet', 'WARN_STUFF_KEY_MISMATCH'], '\t{tag "bullet extra"}', '}']);
put(MOD + 'resource/set/stuff/ammo/yam.ammo', [['{bullet', 'LOC_STUFF_KEY_ORDER'], '\t{tag "bb aa"}', '}']);
put(MOD + 'resource/set/stuff/ammo/new.ammo', ['{bullet', '\t{tag "bullet"}', '}']);   // mod-added, no key: info only

fs.writeFileSync(path.join(process.env.TEST_WORK || __dirname, 'truth.md'), truth.join('\n') + '\n');

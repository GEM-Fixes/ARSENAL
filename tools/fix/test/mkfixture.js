// fix fixture: fx/game = tiny game dir (loose resource/ + localization/), mods/m1 loose, mods/m2 packed (resource.pak + localization.pak).
// usage: node mkfixture.js   (rewrites fx/)
// Author: Imperator_Aug (ARSENAL, ia-4879d529)
const fs = require('fs'), path = require('path'), zw = require('../../lib/zipwrite');
const out = path.resolve(process.argv[2] || path.join(__dirname, 'fx'));
require('../../lib/testscratch').guard(out);   // never wipe a shared root, the repo, a game or a mod
fs.rmSync(out, { recursive: true, force: true });
const put = (root, k, lines) => { const f = path.join(root, k); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, Array.isArray(lines) ? lines.join('\r\n') + '\r\n' : lines); };
const G = path.join(out, 'game');

// ---- vanilla
const v = (k, l) => put(G, k, l);
v('resource/entity/ok/ok.def', ['{game_entity', '\t{Extension "ok.mdl"}', '\t{Chassis {Locomotion {TurnTime 5}} {speed {Slow 5} {Normal 10} {Fast 20}}}', '}']);
v('resource/entity/ok/ok.mdl', ['{Skeleton', '\t{bone "b" {VolumeView "a.ply"} {Polyhedron "a.vol"}}', '}']);
v('resource/entity/ok/ok.mtl', ['{material bump', '\t{diffuse "tex1"}', '}']);
for (const f of ['a.ply', 'a.vol', 'tex1.dds', 'tex_dup.dds']) v('resource/entity/ok/' + f, 'x');
v('resource/entity/other/tex_unique.dds', 'x'); v('resource/entity/other/tex_dup.dds', 'x');
v('resource/sound/weapon/shot/snd/shot_unique.wav', 'x'); v('resource/sound/weapon/shot/snd/shot1.wav', 'x');
v('resource/set/stuff/rifle1', ['{weapon_bullet', '\t{fireSound "snd/shot1"}', '}']);
v('localization/desc.lng', ['{tags', '\t{"entity"', '\t\t{"ok" "Okay"}', '\t\t{"two" "Two \\"q\\""}', '\t}', '\t{"weapon" {"rifle1" "Rifle"}}', '}']);
v('localization/#base.lng', ['{tags', '\t{"menu" {"start" "Start"}}', '}']);

// ---- m1: loose. desc.lng replaces vanilla and has 1 of 3 keys (+1 own); def with texture refs: 1 candidate and 2 candidates
const mi = n => ['{Mod', `\t{Name "${n}"}`, '\t{Desc "fixture"}', '\t{MinGameVersion "3.262.1"}', '\t{MaxGameVersion "3.262.1"}', '}'];
const M1 = path.join(G, 'mods/m1');
put(M1, 'mod.info', mi('M One'));
put(M1, 'localization/desc.lng', ['﻿{tags', '\t{"entity" {"ok" "Окей"}}', '\t{"entity" {"own" "Own"}}', '}'].join('\r\n') + '\r\n');
put(M1, 'localization/#extra.lng', ['{tags', '\t{"x" "y"}', '}']);   // new file, not in vanilla: untouched
put(M1, 'resource/entity/m1/m1a.def', ['{game_entity', '\t{Extension "m1a.mdl"}', '\t{Chassis {Locomotion {TurnTime 5}} {speed {Slow 5} {Normal 10} {Fast 20}}}', '}']);
put(M1, 'resource/entity/m1/m1a.mdl', ['{Skeleton', '\t{bone "b" {VolumeView "a.ply"} {Polyhedron "a.vol"}}', '}']);
put(M1, 'resource/entity/m1/m1a.mtl', ['{material bump', '\t{diffuse "tex_unique"}', '\t{bump "tex_dup"}', '}']);
put(M1, 'resource/entity/m1/a.ply', 'x'); put(M1, 'resource/entity/m1/a.vol', 'x');

// ---- m2: packed. resource.pak: def + stuff with a unique sound candidate; localization.pak: desc.lng replacing vanilla
const M2 = path.join(G, 'mods/m2');
put(M2, 'mod.info', mi('M Two'));
const B = s => Buffer.from(s, 'latin1');
fs.writeFileSync(path.join(M2, 'resource.pak'), zw.zip([
  ['entity/m2/m2a.def', B('{game_entity\r\n\t{Extension "m2a.mdl"}\r\n}\r\n'), true],
  ['entity/m2/m2a.mdl', B('{Skeleton\r\n\t{bone "b" {VolumeView "a.ply"} {Polyhedron "a.vol"}}\r\n}\r\n'), true],
  ['entity/m2/m2a.mtl', B('{material bump\r\n\t{diffuse "tex1"}\r\n}\r\n'), true],
  ['entity/m2/a.ply', B('x')], ['entity/m2/a.vol', B('x')],
  ['set/stuff/rifle2', B('{weapon_bullet\r\n\t{fireSound "shot_unique"}\r\n}\r\n'), true],
]));
fs.writeFileSync(path.join(M2, 'localization.pak'), zw.zip([
  ['desc.lng', Buffer.from('{tags\r\n\t{"weapon" {"rifle1" "Gewehr"}}\r\n}\r\n', 'utf8'), true],
]));

// ---- m3: nothing to fix (lng that already covers every vanilla key)
const M3 = path.join(G, 'mods/m3');
put(M3, 'mod.info', mi('M Three'));
put(M3, 'localization/#base.lng', ['{tags', '\t{"menu" {"start" "Go"}}', '}']);
// ---- m4: crash-class defects. vanilla libs: set/lib/helper.inc (unique), set/lib/dup.inc + set/lib2/dup.inc (ambiguous), macros in mac.inc (unique) and dupmac in two incs
const u32 = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; }, i32 = n => { const b = Buffer.alloc(4); b.writeInt32LE(n); return b; }, u16 = n => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
const f32 = a => { const b = Buffer.alloc(4 * a.length); a.forEach((x, i) => b.writeFloatLE(x, i * 4)); return b; };
const T = s => Buffer.from(s, 'latin1'), cs = s => Buffer.concat([Buffer.from([s.length]), T(s)]), cat = (...a) => Buffer.concat(a);
const ply = mtl => cat(T('EPLY'), T('BNDS'), f32([-1, -1, -1, 1, 1, 1]), T('MESH'), u32(0x112), i32(0), i32(1), u32(0x404), cs(mtl), T('VERT'), i32(3), u16(32), u16(7), Buffer.alloc(96), T('INDX'), i32(3), cat(u16(0), u16(1), u16(2)));
v('resource/set/lib/helper.inc', ['\t{TurnTime 5}']);
v('resource/set/lib/dup.inc', ['\t{TurnTime 6}']); v('resource/set/lib2/dup.inc', ['\t{TurnTime 7}']);
v('resource/set/lib/mac.inc', ['(define "mymac" {TurnTime 8})']);
v('resource/set/lib/dm1.inc', ['(define "dupmac" {TurnTime 9})']); v('resource/set/lib2/dm2.inc', ['(define "dupmac" {TurnTime 9})']);
const M4 = path.join(G, 'mods/m4'), ent = (n, body) => put(M4, `resource/entity/m4/${n}.def`, ['{game_entity', ...body, '}']);
put(M4, 'mod.info', mi('M Four'));
ent('inc_ok', ['\t(include "lost/helper.inc")']);
ent('inc_amb', ['\t(include "lost/dup.inc")']);
ent('inc_none', ['\t(include "nowhere.inc")']);
ent('mac_ok', ['\t("mymac")']);
ent('mac_amb', ['\t("dupmac")']);
ent('mac_none', ['\t("nomac")']);
ent('mi_ref', ['\t("nomac")']);      // referenced from a .mi: unknown kind, refused
ent('arm_ref', ['\t("nomac")']);     // referenced from an armor stuff: fatal kind, refused
// map referrer (engine skips it) + lookalikes of inc_none that are not references + the two meshes the stub test needs reached
put(M4, 'resource/map/m4/ref.mis', ['{mission', '\t{note "mac_none"}', '\t{note "gap lonely"}', '\t{note "inc_none_old xinc_none inc_none2 inc_nonex"}', '}']);
put(M4, 'resource/set/m4.mi', ['{misc', '\t{x "mi_ref"}', '}']);
put(M4, 'resource/set/stuff/armor_vest', ['{armor', '\t{model "arm_ref"}', '}']);
put(M4, 'resource/entity/m4/mesh_ok.mtl', '{material bump\r\n\t{diffuse "tex1"}\r\n}\r\n');
fs.mkdirSync(path.join(M4, 'resource/entity/m4'), { recursive: true });
fs.writeFileSync(path.join(M4, 'resource/entity/m4/gap.ply'), ply('gap.mtl'));
fs.writeFileSync(path.join(M4, 'resource/entity/m4/orphan.ply'), ply('orphan.mtl'));   // nothing references it: no stub
fs.mkdirSync(path.join(M4, 'resource/entity/m4b'), { recursive: true });
fs.writeFileSync(path.join(M4, 'resource/entity/m4b/lonely.ply'), ply('lonely.mtl'));   // no sibling .mtl: refused
// ---- m5: text fixers (lib/textfix.js) + environment preset repoint. vanilla: presets day/clear (unique), x/fog + y/fog (two), a game set with an unread team key
v('resource/set/environment/day/clear.set', ['{environment', '\t{light {night_vision 0.3}}', '}']);
v('resource/set/environment/x/fog.set', ['{environment', '}']); v('resource/set/environment/y/fog.set', ['{environment', '}']);
v('resource/set/multiplayer/games/combat.set', [';SDL', '{game', '\t{teamSettings', '\t\t{minTeamPlayers 2}', '\t}', '}']);
const M5 = path.join(G, 'mods/m5'), p5 = (k, l) => put(M5, 'resource/' + k, l), L1 = s => Buffer.from(s, 'latin1');
put(M5, 'mod.info', mi('M Five'));
// enc: cp1251 "Привет мир" + "Танк" (resaved); cp1252 "café naïve" (reads as mixed Latin/Cyrillic in cp1251: refused)
p5('entity/m5/txt.def', L1('{game_entity\r\n\t{note "\xcf\xf0\xe8\xe2\xe5\xf2 \xec\xe8\xf0"}\r\n\t{note2 "\xd2\xe0\xed\xea"} ; \xea\xee\xec\xec\xe5\xed\xf2\r\n}\r\n'));
p5('entity/m5/amb.def', L1('{game_entity\r\n\t{note "caf\xe9 na\xefve"}\r\n}\r\n'));
// spell: macro used with another case than its one definition; unread team key (own file: fixed; line copied from vanilla: refused)
p5('entity/m5/case.def', ['(define "armor" {TurnTime 5})', '{game_entity', '\t("Armor")', '}']);
p5('set/multiplayer/games/m5game.set', [';SDL', '{game', '\t{teamSettings', '\t\t{maxTeamPlayers 4}', '\t}', '}']);
p5('set/multiplayer/games/combat.set', [';SDL', '{game', '\t{teamSettings', '\t\t{minTeamPlayers 2}', '\t}', '\t{own 1}', '}']);
// syntax: bare diffuse word, two tag strings
p5('entity/m5/bare.mtl', ['{material bump', '\t{diffuse tex1}', '}']);
p5('entity/m5/tags.def', ['{game_entity', '\t{tags "a b" "c"}', '}']);
// asread: threshold below 1, odd maxPlayers
p5('set/stuff/gun/m5.pattern', ['{weapon_bullet', '\t{projectileDamageThreshold 0.5}', '}']);
p5('map/multi/m5map/map.info', [';SDL', '{game', '\t{maxPlayers 3}', '\t{minPlayers 2}', '}']);
p5('map/multi/m5map/combat.mi', [';SDL', '{mission', '}']);
// environment presets: 1 candidate (old/clear -> day/clear), 2 candidates (fog), none; the 2-candidate name on two lines = one refusal row
// two fixers on one file (repoint + asread), merged line by line
p5('set/stuff/m5two', ['{weapon_bullet', '\t{projectileDamageThreshold 0.25}', '\t{fireSound "shot_unique"}', '}']);
p5('map/m5/m.mi', ['{mission', '\t{Environment "old/clear"}', '\t{triggers', '\t\t{"environment"', '\t\t\t{condition}', '\t\t\t{actions',
  '\t\t\t\t{"environment" {name "old/fog"}}', '\t\t\t\t{"environment" {name "old/fog"}}', '\t\t\t\t{"environment" {name "gone/none"}}', '\t\t\t}', '\t\t}', '\t}', '}']);
fs.writeFileSync(path.join(G, 'mowas_2.exe'), 'stub');   // so check/wouldload find an exe
console.log('fixture ok');

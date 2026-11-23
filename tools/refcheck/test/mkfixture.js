// refcheck fixture: a loose folder (resource/...) with clean data + seeded defects.
// a line ending in ";@CODE" is expected to produce exactly one finding CODE on that line (check.js derives the truth from them;
// truth.md is regenerated here for humans). usage: node mkfixture.js [outDir]
// Author: Imperator_Aug (ARSENAL, ia-de5412d9)
const fs = require('fs'), path = require('path');
const W = process.env.TEST_WORK || __dirname, out = path.resolve(process.argv[2] || path.join(W, 'fx'));   // truth.md/truth.txt go to TEST_WORK too
const files = {};
// game text data is CRLF like vanilla: SDL lines are joined with CRLF
const put = (k, lines) => { files[k] = Array.isArray(lines) ? lines.join('\r\n') + '\r\n' : lines; };

// ---- clean part ----
put('resource/entity/ok/ok.def', [
  '{game_entity',
  '\t(include "/properties/base.ext")',
  '\t{Extension "ok.mdl"}',
  '\t{extender "inventory" {box {item "ammo bullet1" 5}}}',
  '\t{Weaponry {place "gun" {weapon "rifle1" filling "ammo bullet1" 1}}}',
  '\t{Chassis {Locomotion {TurnTime 5}} {speed {Slow 5} {Normal 10} {Fast 20}}}',
  '\t{sensor {visor "main" {vision "vis_a"}}}',
  '}']);
put('resource/entity/ok/ok.mdl', ['{Skeleton', '\t{bone "b" {VolumeView "a.ply"} {Polyhedron "a.vol"}}', '}']);
put('resource/entity/ok/ok.mtl', ['{material bump', '\t{diffuse "tex1"}', '\t{bump "$/model/shared"}', '}']);
put('resource/entity/ok/a.ply', 'x'); put('resource/entity/ok/a.vol', 'x'); put('resource/entity/ok/tex1.dds', 'x');
put('resource/texture/common/model/shared.dds', 'x');
put('resource/properties/base.ext', ['{boarder {anm "driver" {forward {begin "anm_ok"} {end "anm_ok"}}}}']);
put('resource/properties/animation/anm_ok.anm', 'x');
put('resource/set/stuff/rifle1', ['{weapon_bullet', '\t{fireSound "snd/shot1"}', '\t{reloadSound "snd/reload"}', '\t{inventory {fsm "belt"}}', '}']);
put('resource/set/stuff/_settings/belt.fsm', '{fsm}');
put('resource/set/stuff/ammo/bullet1.ammo', ['{bullet', '\t{tag "stackable"}', '\t{entity "ok"}', '}']);
put('resource/sound/weapon/shot/snd/shot1.wav', 'x');
put('resource/sound/weapon/reload/snd/oggonly.ogg', 'x');
put('resource/sound/weapon/reload/snd/reload.wav', 'x');
put('resource/set/vision/vision.set', ['{visions', '\t{"vis_a" {radius 5}}', '\t{"vis_b" {radius 6}}', '\t{"vis_a" {radius 7}} ;@VISION_DUP',
  '\t{"vis_c" {radius 5}', '\t\t{rules', '\t\t\t{human 1 {firing 1.1} {tank 0.9}}', '\t\t\t{tank 0.5 {firing 1.2}}', '\t\t\t{human 0.8} ;@VISION_RULE_SHADOWED', '\t\t}', '\t}', '}']);
put('resource/set/vision/settings.set', ['{terms', '\t{t_a firing "x"}', '\t{t_b actor "y"}', '\t{t_a actor "z"} ;@TERM_DUP', '\t{t_c colour "z"} ;@TERM_PROP', '}']);
put('resource/set/level_of_detail.set', [
  '{levelofdetail',
  '\t{"human" {distance 300} {distance 800}}',
  '\t{"bad" {distance 500} {distance 400}} ;@LOD_ORDER',
  '}']);
put('resource/set/interaction_terrain/terrains.set', ['{terrains', '\t{"ground" {pp "ground no_pass"}', '\t\t{effect "ground"}', '\t}', '\t{"lava" {pp "ground"}', '\t\t{effect "lava"} ;@TERRAIN_EFFECT_UNKNOWN', '\t}', '}']);
put('resource/set/interaction_terrain/effects.set', ['{effects', '\t(include "effects/ground.inc")', '}']);
put('resource/set/interaction_terrain/effects/ground.inc', ['{"ground"', '\t{on hit {spawn "dust"}}', '}']);
put('resource/set/pather.set', ['{Pathers', '\t{Profile "human" {Terrain "ground" 1 "no_pass" 0 "deep_water" 0.1 "no_pass_human" 0}}', '\t{Profile "odd" {Terrain "ground" 1 "mud2" 0.5}} ;@PATHER_TERRAIN_UNKNOWN', '}']);
put('resource/set/stuff/gun/short.pattern', [
  '{weapon_bullet',
  '\t{OvermatchDamping {0 1} {45 1.2}} ;@OVERMATCH_SHORT',
  '\t{projectileDamageThreshold 0.5} ;@THRESHOLD_LT1',
  '\t{overmatchCalibre 20} ;@GOH_KEY',
  '}']);

// ---- seeded entity defects ----
put('resource/entity/bad/bad.def', [
  '{game_entity ;@VISION_MODE_MULTI',
  '\t{Extension "nomodel.mdl"} ;@REF_MODEL_MISSING',
  '\t{extender "vision_mode" {night}}',
  '\t{extender "vision_mode" {thermal}}',
  '\t{extender "inventory" {box {item "nothing" 1}}} ;@REF_ITEM_UNKNOWN',
  '\t{Weaponry {place "gun" {weapon "nogun"}}} ;@REF_WEAPON_UNKNOWN',
  '\t{Weaponry {place "gun2" {weapon "rifle1" filling "ammo nobullet" 1}}} ;@REF_AMMO_UNKNOWN',
  '\t{boarder {anm "driver" {forward {begin "no_anim"}}}} ;@REF_ANIM_MISSING',
  '\t{sensor {visor "main" {vision "novis"}}} ;@REF_VISION_UNKNOWN',
  '\t{Chassis',
  '\t\t{Locomotion {TurnTime 3}}',
  '\t\t{speed {Slow 5} {Normal 9} {Fast 20}}',
  '\t\t{Locomotion {TurnTime 3}} ;@SPEED_BEFORE_LOCO',
  '\t}',
  '\t{Chassis "foot"',
  '\t\t{Run {Slow 8} {Normal 15}} ;@FOOT_ROW_MISSING',
  '\t\t{Strafe {Forth 1} {Left 1} {Right 1} {Back 1} {Forth 2} {Left 2} {Right 2}} ;@STRAFE_MAX',
  '\t}',
  '\t{extender "nosuch" {x 1}} ;@EXTENDER_UNKNOWN',
  '\t{##on {call "x"}} ;@DISABLED_ON',
  '}']);
put('resource/entity/bad/bad.mdl', ['{Skeleton', '\t{bone "b" {VolumeView "gone.ply"}} ;@REF_MESH_MISSING', '}']);
put('resource/entity/bad/bad.mtl', ['{material bump', '\t{diffuse "notex"} ;@REF_TEXTURE_MISSING', '}']);
put('resource/set/stuff/badstuff', [
  '{weapon_bullet',
  '\t{fireSound "snd/none"} ;@REF_SOUND_MISSING',
  '\t{inventory {fsm "nofsm"}} ;@REF_FSM_MISSING',
  '\t{entity "noent"} ;@REF_STUFF_ENTITY_MISSING',
  '}']);
// the bad def needs its own model file to be found for the mesh/texture checks
// SDL-54 stray files in set/stuff; DMG-17 burn handler without inflammation_time
put('resource/set/stuff/gun/rifle1.bak', ['{weapon_bullet} ;@STUFF_STRAY_FILE']);
put('resource/set/stuff/gun/notes.orig', ['x ;@STUFF_STRAY_FILE']);
put('resource/set/stuff/gun/rifle2.weapon', ['{weapon_bullet', '}']);
// PORT-83 filling cycles: self match, two-file loop, a stuff filled with a different stuff stays quiet
put('resource/set/stuff/cyc/selfy.pat', ['{weapon', '\t{filling "selfy"} ;@REF_FILLING_CYCLE', '}']);
put('resource/set/stuff/cyc/loopa.ammo', ['{weapon', '\t{filling "loopb"}', '}']);
put('resource/set/stuff/cyc/loopb.ammo', ['{weapon', '\t{filling "loopa"} ;@REF_FILLING_CYCLE', '}']);
put('resource/set/stuff/cyc/fine.gun', ['{weapon', '\t{filling "fineammo"}', '}']);
put('resource/set/stuff/cyc/fineammo.ammo', ['{bullet', '}']);
put('resource/set/interaction_entity/entity.set', ['{entities',
  '{"wood thing"', '\t{inflammation_time 4}', '\t{on "burn_volume" {delete}}', '}',
  '{"wood thing big"', '\t{on "burn_volume" {delete}}', '}',
  '{"hay" ;@WARN_BURN_NO_INFLAMMATION_TIME', '\t{on "burn_volume" {delete}}', '}',
  '}']);
put('resource/entity/zdup/ok.def', ['{game_entity ;@ENTITY_REDEFINITION', '}']);
put('resource/entity/badtype/badtype.def', ['{vehicle ;@ENTITY_TYPE_UNKNOWN', '}']);
put('resource/entity/bad/bad2.def', ['{game_entity', '\t{Extension "bad.mdl"}', '}']);

// row 169: one bad ref in a shared .ext reached by 4 entities: the merged finding must name all 4 (run.sh checks)
put('resource/properties/sh.ext', ['{Weaponry {place "gx" {weapon "nogun_shared"}}} ;@REF_WEAPON_UNKNOWN']);
for (const n of ['shr1', 'shr2', 'shr3', 'shr4']) put(`resource/entity/sh/${n}.def`, ['{game_entity', '\t(include "/properties/sh.ext")', '}']);

// FMT-22: relative paths resolve against the reading file's dir only; leading / = resource/
put('resource/entity/shared.mdl', ['{Skeleton', '}']);
put('resource/a2.ply', 'x'); put('resource/entity/wf/own.ply', 'x');
put('resource/entity/wf/wf.def', ['{game_entity', '\t{Extension "shared.mdl"} ;@REF_WRONG_FOLDER', '}']);
put('resource/entity/wf/wfok.def', ['{game_entity', '\t{Extension "/entity/shared.mdl"}', '}']);
put('resource/entity/wf2/wf2.def', ['{game_entity', '\t{Extension "wf2.mdl"}', '}']);
put('resource/entity/wf2/wf2.mdl', ['{Skeleton', '\t{bone "b" {VolumeView "a2.ply"}} ;@REF_WRONG_FOLDER', '\t{bone "c" {VolumeView "/a2.ply"}}', '}']);

// ---- CHK-REF rows: each seeded line has a clean twin beside it ----
// PORT-125 / TST-108 / TST-116: breed includes resolve beside the breed file; health percent cap
put('resource/set/breed/t1/b1.set', ['{breed', '\t{"health" "90000%"} ;@WARN_BREED_PERCENT_HIGH', '\t(include "veterancy_generic.inc") ;@INCLUDE_MISSING', '\t(include "/set/breed/t2/vg.inc")', '}']);
put('resource/set/breed/t2/b2.set', ['{breed', '\t{"health" "1000%"}', '\t(include "vg.inc")', '}']);
put('resource/set/breed/t2/vg.inc', ['{veterancy {"1" {"health" "110%"}}}']);
// TST-99: def include of an .ext that is not there
put('resource/entity/inc/inc.def', ['{game_entity', '\t(include "/properties/damage_components.ext") ;@INCLUDE_MISSING', '\t(include "/properties/base.ext")', '}']);
// MIS-50: crewed card whose vehicle entity is missing; "*" = card's own name
put('resource/set/multiplayer/units/test.set', ['{units',
  '\t{"ok" {content "* ( mp/x/rifle:2 )"}}',
  '\t{"ok_card" {content "ok ( mp/x/rifle:2 )"}}',
  '\t{"bad_card" {content "nosuchveh:1 ( mp/x/rifle:2 )"}} ;@CARD_VEHICLE_MISSING',
  '\t{"inf_card" {content "nosuchbreed:3"}}', '}']);
// ENG-33: boarder base = model sequence
put('resource/entity/brd/brd.def', ['{game_entity', '\t{Extension "brd.mdl"}',
  '\t{boarder {anm "driver" {forward {begin "anm_ok"} {base "open"}}}}',
  '\t{boarder {anm "d2" {forward {begin "anm_ok"} {base "no_door"}}}} ;@WARN_BOARDER_BASE_UNKNOWN', '}']);
put('resource/entity/brd/brd.mdl', ['{Skeleton', '\t{animation', '\t\t{sequence "open" {speed 0.4}}', '\t}', '}']);
// VIS-07: night preset without a sight penalty; twin with 0.3
put('resource/set/environment/test/night.set', ['{environment', '\t{light', '\t\t{night}', '\t\t{night_vision 1} ;@WARN_NIGHT_NO_PENALTY', '\t}', '}']);
put('resource/set/environment/test/night2.set', ['{environment', '\t{light', '\t\t{night}', '\t\t{night_vision 0.3}', '\t}', '}']);
// VIS-12: map preset and helper command preset names
put('resource/map/test/m.mi', ['{mission', '\t{Environment "test/night"}', '\t{triggers', '\t\t{"environment"', '\t\t\t{condition}', '\t\t\t{actions',
  '\t\t\t\t{"environment" {name "test/night2"}}', '\t\t\t\t{"environment" {name "test/nope"}} ;@ENV_PRESET_MISSING', '\t\t\t}', '\t\t}', '\t}', '}']);
// VIS-27 / VIS-26: mod sound.set lacks default and a used name; priority above 40
put('resource/sound/sound.set', ['{sound ;@SOUND_LOUDNESS_MISSING', '\t{percent "effects" 45}', '\t{loudness "shoot loud" 35 0 30}',
  '\t{loudness "blast big" 50 0 40}', '\t{loudness "goh blast" 50 0 75} ;@WARN_SOUND_PRIORITY_HIGH', '}']);
put('resource/sound/test/folder.set', ['{sound', '\t{loudness "shoot loud"}', '}']);
put('resource/sound/test2/folder.set', ['{sound', '\t{loudness "no_such_loud"}', '}']);

fs.rmSync(out, { recursive: true, force: true });
const truth = [];
for (const [k, txt] of Object.entries(files)) {
  const p = path.join(out, k);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, txt);
  txt.split('\n').forEach((l, i) => { const m = l.match(/;@(\w+)\s*$/); if (m) truth.push(`${k}:${i + 1} ${m[1]}`); });
}
fs.writeFileSync(path.join(W, 'truth.md'), '# refcheck fixture truth: one defect per line (derived from ;@CODE markers)\n' + truth.join('\n') + '\n');
fs.writeFileSync(path.join(W, 'truth.txt'), truth.join('\n') + '\n');
console.log('fixture ' + out + ': ' + truth.length + ' seeded defects');

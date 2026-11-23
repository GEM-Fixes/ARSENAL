// strlint fixture: fixture/mod + truth.md. put(rel, lines): line = text | [text, CODE...] -> truth "rel:line: CODE"
// Author: Imperator_Aug (ARSENAL, ia-b17e3b24)
const fs = require('fs'), path = require('path');
if (!process.env.TEST_WORK) { console.error('mkfixture: TEST_WORK not set (run.sh sets it); a direct run would delete the tracked test/fixture'); process.exit(2); }
const dir = path.join(process.env.TEST_WORK || __dirname, 'fixture');   // run.sh: per-run TEST_WORK, tracked files untouched
fs.rmSync(dir, { recursive: true, force: true });
const truth = ['# file:line: CODE (seeded defects; diffed by run.sh)'];
function put(rel, lines) {
  const f = path.join(dir, 'mod', rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const text = lines.map((l, i) => {
    if (Array.isArray(l)) { for (const c of l.slice(1)) truth.push(`${rel}:${i + 1}: ${c}`); return l[0]; }
    return l;
  });
  fs.writeFileSync(f, text.join('\r\n') + '\r\n', 'latin1');   // game text = cp1251 + CRLF
}
const E = 'resource/entity/construction/t/';

// clean building: every rule satisfied
put(E + 'good/good.def', ['{game_entity', '\t{Extension "good.mdl"}', '\t{ObstacleId "building"}', '\t{Volume "body01" {Thickness 5} {able {visible 1}}}',
  '\t{Volume "win1" {Thickness 0.2} {able {window}}}', '\t{extender "structure" {place "d1" "part1"}}', '}']);
put(E + 'good/good.mdl', ['{Skeleton {bone "root" {VolumeView "root.ply"} {bone "d1"}}}', '{Obstacle "o" {Obb2 {Center 0 0}{Extent 1 1}{Axis 1 0}}}',
  '{Volume "body01" {Box 1 1 1} {Bone "root"}}', '{Volume "win1" {Box 1 1 1} {Bone "d1"}}']);
fs.mkdirSync(path.join(dir, 'mod', E, 'good'), { recursive: true });
fs.writeFileSync(path.join(dir, 'mod', E, 'good/root.ply'), 'x');
put(E + 'part1/part1.def', ['{game_entity', '}']);
put(E + 'scale/scale.def', ['{game_entity', ['\t{scale 2}', 'WARN_STR_DEF_SCALE'], '}']);

// defective building
put(E + 'bad/bad.def', ['{game_entity', '\t{Extension "bad.mdl"}',
  ['\t{ObstacleId "building"}', 'WARN_STR_OBSTACLE_MISSING'],
  ['\t{Volume "nosuch" {Thickness 5}}', 'WARN_STR_VOLUME_NO_SHAPE'],
  ['\t{Volume "win1" {able {window}}}', 'STR_WINDOW_THICKNESS'],
  '\t{extender "structure"', '\t\t{place "d1" "part1"}',
  ['\t\t{place "zz" "part1"}', 'STR_PLACE_BONE'],
  ['\t\t{place "d1" "nopart"}', 'STR_PLACE_ENTITY'],
  '\t}', '}']);
put(E + 'bad/bad.mdl', ['{Skeleton', '\t{bone "root"', ['\t\t{VolumeView "missing.ply"}', 'STR_VIEW_MISSING'], '\t\t{bone "d1"}', '\t}', '}',
  '{Volume "win1" {Box 1 1 1} {Bone "root"}}', ['{Volume "v2" {Box 1 1 1} {Bone "ghost"}}', 'WARN_STR_VOLUME_BONE']]);
put(E + 'nomdl/nomdl.def', ['{game_entity', ['\t{Extension "absent.mdl"}', 'STR_MDL_MISSING'], '}']);
put(E + 'macro/macro.def', ['{game_entity', ['\t("no_such_macro" args 1)', 'STR_MACRO_UNDEFINED'], '}']);

// obstacle names (STR-29 / PORT-188): the mod registry names building + tree; "post" is absent, the clean twin uses tree
put('resource/set/registry/obstacles.reg', ['{obstacles', '\t{building {human -1}}', '\t{tree {human -1}}', '}']);
put('resource/entity/vegetation/obs_bad.def', ['{game_entity', ['\t{ObstacleId "post"}', 'STR_OBSTACLE_NAME_MISSING'], '}']);
put('resource/entity/vegetation/obs_ok.def', ['{game_entity', '\t{ObstacleId "tree"}', '}']);

// fortification extender
put('resource/entity/social/fortification/fort/fort.def', ['{game_entity', '\t{extender "fortification"', '\t\t{level',
  '\t\t\t{entity "part1"}', '\t\t\t{steps 2}{radius 5}{buildtime 10}', ['\t\t\t{skip "1 9"}', 'STR_FORT_SKIP'], '\t\t}',
  '\t\t{level', ['\t\t\t{entity "nopart"}', 'STR_FORT_ENTITY'], '\t\t\t{steps 2}', ['\t\t\t{radius 0}', 'STR_FORT_VALUE'], '\t\t\t{buildtime 5}',
  ['\t\t\t{frob 1}', 'STR_FORT_KEY'], '\t\t}', '\t}', '}']);

// colliders: 33 distinct groups, the 33rd reported
const col = [];
for (let i = 0; i < 33; i++) { const l = `{"c${i}" {ColliderId "g${i}"}}`; col.push(i === 32 ? [l, 'STR_COLLIDER_GROUPS'] : l); }
put('resource/set/colliders.set', col);

// tear scripts
put('resource/set/interaction_entity/construction/t.inc', ['{"t"', '\t{on "x"', '\t\t{tear "part1" bone "piece01"}', '\t\t{tear "part1" bone from_volume}', '\t\t{tear "%0_x" bone "piece%0"}', ['\t\t{tear "nopiece" bone "piece02"}', 'STR_TEAR_ENTITY'], '\t}',
  '\t{on "y"', ['\t\t{call "nosuch"}', 'STR_CALL_UNDEFINED'], '\t\t{call "x"}', '\t\t{call "%0"}', '\t}',
  '\t{on "z"', ['\t\t("no_such_macro" args 1)', 'STR_MACRO_UNDEFINED'], '\t\t(define "cp" {tear "part1" bone "piece%0"})', '\t\t("cp" args 01)', '\t\t("cp" args 02)',
  ['\t\t{tear "part1" bone "ghostbone"}', 'WARN_STR_TEAR_BONE_NONE'], '\t}', '}']);
put('resource/set/interaction_entity/entity.set', ['{entities', '\t(include "construction/t.inc")', '}']);
// destroyed skeleton: piece01/piece02 are torn by the script above, piece09 is not
put(E + 'good/good_x.mdl', ['{Skeleton', '\t{bone "root"', '\t\t{bone "piece01"}', '\t\t{bone "piece02"}', ['\t\t{bone "piece09"}', 'WARN_STR_TEAR_BONE'], '\t\t{bone "other7"}', '\t}', '}']);

fs.writeFileSync(path.join(process.env.TEST_WORK || __dirname, 'truth.md'), truth.join('\n') + '\n');

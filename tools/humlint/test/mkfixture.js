// humlint fixture: fixture/mod + truth.md. put(rel, lines): line = text | [text, CODE...] → truth "rel:line: CODE"
// Author: Imperator_Aug (ARSENAL, ia-21ce3015)
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, 'fixture');
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

// vitality (HUM-01, HUM-03), inventory box (HUM-23), health_damage (HUM-07)
put('resource/properties/human.ext', [
  ';SDL', 'human', '',
  '{extender "vitality"',
  ' {Health {max 100}{inc 1.0}',
  ['  {regen 2}', 'HUM_VITALITY_KEY'],
  ' }',
  ' {Stamina {max 100}',
  '  {inc',
  '   {stay 15 10 9 5}',
  ['   {wlak 10 5 0 -10}', 'HUM_STAMINA_ROW'],
  '   {fast -5 -10 -20 -40}',
  '  }',
  '  {load 0 20 40 100}',
  '  {movement_limits {Fast 1 25}',
  ['   {Sprint 0 0}', 'HUM_VITALITY_KEY'],
  '  }',
  ['  {bonus 1}', 'HUM_VITALITY_KEY'],
  ' }',
  '}',
  '{extender "inventory"',
  ' {box',
  '  {Size 6 10}',
  ['  {Size 300 10}', 'HUM_BOX_SIZE_INT8'],
  '  {Weight 100}',
  '  {item "ammo rifle" 5 {user "mgun"}}',
  ['  {item "pistol1" 5 {user "mgun"}}', 'WARN_HUM_USER_AMOUNT'],
  ['  {item "pistol1" 1 {user "mgun"}}', 'HUM_HOLDER_TWO_ITEMS'],
  ' }',
  '}',
]);
put('resource/set/stuff/ammo/rifle.ammo', ['{tag "bullet stackable pierce"}']);
put('resource/set/stuff/gun/pistol1', ['{tag "gun"}']);

put('resource/set/interaction_entity/dmg.inc', [
  '{health_damage_pierce',
  ' {effects "" "hit" "light" "heavy" "die" "thrown" "thrown_hit" "thrown_die"}',
  ' {table {0 1}{10 5}}',
  ' {explosive_treshold 3}',
  '}',
  '{health_damage_blast',
  ' {effects "" "hit" "die"}',
  [' {table {0 1}}', 'HUM_THROW_EFFECTS'],
  ['}', ],
  '{health_damage_blow',
  ['  {explosive_threshold 3}', 'HUM_DAMAGE_KEY'],
  '}',
  '{health_damage_count 20 {effects "" "hit" "damage" "die" "die"}}',
]);

// abilities (HUM-14, HUM-16), breeds + perks (HUM-14), mp unit breed (HUM-18)
put('resource/set/ability/test.set', [
  '{health',
  ' {level "100%" 1.0}',
  '}',
  '{rifle from weapon',
  ' {item "rifle"}',
  ' {level "lvl_1"',
  '  {stand {accuracy 1}',
  ['   {reload 1}', 'HUM_POSTURE_RELOAD'],
  '  }',
  '  {default {accuracy 1}{aim_range 1}}',
  ' }',
  '}',
  ['{"mystery" from "nosuchkind"', 'HUM_ABILITY_BASE'],
  '}',
]);
put('resource/set/breed/b1.set', [
  '{breed',
  ' {perks',
  '  {"health" "100%"}',
  ['  {"melee" "lvl_1"}', 'HUM_ABILITY_NO_LEVELS'],
  '  {"speed" 0.9}',
  ' }',
  '}',
]);
put('resource/set/multiplayer/units/u.set', [
  '{"b1" {score 1}{breed}}',
  ['{"mp/x/nobreed" {score 1}{breed}}', 'WARN_HUM_BREED_UNKNOWN'],
  '{"plain" {score 1}}',
]);

// stance FSM (HUM-29)
put('resource/properties/human_fsm.ext', [
  ';SDL',
  '{FSM "human"',
  ' {Start "stand"}',
  ' {State "stand" {tag "stand"}{to "lie"}{to "die1"}}',
  [' {State "lie" {tag "lie"}{to "stand"}}', 'HUM_FSM_DYING_EDGES'],
  [' {State "die1" {tag "dying"}{split "a"}}', 'HUM_FSM_SPLIT_ORDER'],
  ' {State "dead"}',
  '}',
]);

// mdl sequence (HUM-31)
put('resource/entity/x/x.mdl', [
  '{Model',
  ' {sequence {name "a"}{duration frames 12}}',
  ['  {sequence {name "b"}{duration frames 0}}', 'HUM_DURATION_ZERO'],
  '}',
]);

// CHK-HUM rows: weapon_reload perk (HUM-11), tied veterancy (HUM-17), filled N (HUM-20), in_hands (HUM-21)
put('resource/set/ability/reload.set', [
  ['{"fast_reload" from weapon_reload', 'HUM_WEAPON_RELOAD_PERK'],
  ' {level "lvl_1" 0.1}',
  '}',
  '{"lvl_9" from veterancy',   // clean twin: weapon_reload inside a veterancy rank is the one used
  ' {"weapon_reload" 0.1}',
  '}',
]);
put('resource/set/breed/b2.set', [
  '{breed',
  ' {perks',
  ['  {"fast_reload" "lvl_1"}', 'HUM_WEAPON_RELOAD_PERK'],
  ' }',
  ' {veterancy',
  '  {"lvl_1" 4}',
  ['  {"lvl_2" 4}', 'HUM_VETERANCY_TIED'],
  '  {"lvl_3" 20}',
  ' }',
  ' {inventory',
  ['  {item "pistol1" filled 30}', 'HUM_FILLED_N_GLOBAL'],
  '  {item "ammo rifle" 5}',
  ['  {in_hands 3}', 'HUM_IN_HANDS_RANGE'],
  ' }',
  '}',
]);
put('resource/set/breed/b3.set', [   // clean twin: own stuff for filled N, in_hands in range, distinct thresholds
  '{breed',
  ' {veterancy',
  '  {"lvl_1" -1}',
  '  {"lvl_2" 0}',
  '  {"lvl_3" 20}',
  ' }',
  ' {inventory',
  '  {item "pistol1"}',
  '  {item "solo_gun" filled 12}',
  '  {in_hands 1}',
  ' }',
  '}',
]);
// holder place (HUM-25), stuff weapon tag (HUM-27), vision radius (TST-106), Health (TST-107)
put('resource/properties/humbox.ext', [
  ';SDL', 'humbox', '',
  '{extender "inventory"',
  ' {box',
  '  {Size 6 10}',
  '  {item "pistol1" 1 {user "mgun"}}',
  ['  {item "pistol1" 1 {user "mgun"}}', 'HUM_HOLDER_TWO_ITEMS'],
  '  {item "ammo rifle" 5 {user "mgun"}}',
  ' }',
  '}',
  '{extender "inventory"',
  ' {box',
  '  {Size 6 10}',
  '  {item "pistol1" 1 {user "mgun"}}',
  '  {item "pistol1" 1 {user "turret"}}',
  ' }',
  '}',
]);
put('resource/set/stuff/gun/badrifle', [['{tag "rifle bullet"}', 'HUM_WEAPON_NO_TAG']]);
put('resource/set/stuff/gun/goodrifle', ['{tag "rifle weapon"}']);
put('resource/set/vision/vision_generic.inc', [
  ['(define "vision_human" ("radius" r(1)) {mods {stand 1}})', 'HUM_VISION_RADIUS_TINY'],
  '(define "vision_humancrew" ("radius" r(40)) {mods {stand 1}})',
]);
put('resource/properties/human_big.ext', [
  ';SDL', 'human', '',
  '{extender "vitality"',
  ' {Health',
  ['  {max 5000}', 'WARN_HUM_HEALTH_FAR'],
  '  {inc 1.0}',
  ' }',
  '}',
]);

fs.writeFileSync(path.join(__dirname, 'truth.md'), truth.join('\n') + '\n');

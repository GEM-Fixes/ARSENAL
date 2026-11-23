// defcheck fixture: fixture/mod + truth.md. put(rel, lines): line = text | [text, CODE...] → truth "rel:line: CODE"
// each code: one seeded defect (bad.def, bad.mdl, x.weapon.off) and a clean twin (tank.def, tank.mdl, x.weapon, armor) that must stay silent
// Author: Imperator_Aug (ARSENAL, ia-26365d6b)
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

// clean mdl: revolute with 2 numbers, socket with 1 (legal), lamp_glass1
put('resource/entity/t/tank.mdl', [
  '{Skeleton',
  '  {bone "basis"',
  '    {bone revolute "turret" {limits -30 30}',
  '      {bone prizmatic "gun" {limits 0 1}}',
  '    }',
  '    {bone socket "hatch" {limits 30}}',
  '    {bone "lamp_glass1"}',
  '  }',
  '}',
  '{Volume "body" {bone "only_in_volume"}}',
]);
// PORT-138 in the mdl itself
put('resource/entity/t/bad.mdl', [
  '{Skeleton',
  '  {bone "basis"',
  ['    {bone revolute "turret" {limits 30}}', 'BONE_LIMITS_ONE_NUMBER'],
  '  }',
  '}',
]);
// clean twin def
put('resource/entity/t/tank.def', [
  '{game_entity',
  '  {Extension "tank.mdl"}',
  '  {bone "turret" {limits -20 20} {speed 10}}',
  '  {bone "hatch" {limits 40}}',
  '  {bone "GUN" {Matrix34 1 0 0 0 1 0 0 0 1 0 0 0}}',
  '  {extender "light"',
  '    {lamp "1" on}',
  '    {lightfx "light_search"}',
  '    {breakfx "glass_hit"}',
  '    {check_operatable}',
  '  }',
  '  {Sensor {Visor "main" {bone "not_a_bone_block"}}}',
  '}',
]);
// seeded defects
put('resource/entity/t/bad.def', [
  '{game_entity',
  '  {Extension "/entity/t/tank.mdl"}',
  ['  {bone "nope" {limits -10 10} {speed 5}}', 'DEF_BONE_NOT_IN_MDL'],
  ['  {bone "ghost" {Matrix34 1 0 0 0 1 0 0 0 1 0 0 0}}', 'DEF_BONE_NOT_IN_MDL'],
  ['  {bone "only_in_volume"}', 'DEF_BONE_NOT_IN_MDL'],
  '  {bone "turret"',
  ['    {limits 30}', 'BONE_LIMITS_ONE_NUMBER'],
  '  }',
  '  {extender "light"',
  ['    {lamp "2"}', 'LAMP_GLASS_BONE_MISSING'],
  ['    {preset {light_fx}}', 'LIGHT_EXTENDER_GOH_FORM'],
  '  }',
  '}',
]);
// PORT-171 in a GoH-style include, no mdl needed
put('resource/properties/light.inc', [
  '{Extender "light"',
  ['  {preset "head" {light_fx "x"}}', 'LIGHT_EXTENDER_GOH_FORM'],
  '}',
]);
// PORT-146
put('resource/set/stuff/mgun/x.weapon', ['{from "mgun"}']);
put('resource/set/stuff/body/armor', ['{from "body"}']);
put('resource/set/stuff/mgun/x.weapon.off', ['{from "mgun"}']);
truth.push('resource/set/stuff/mgun/x.weapon.off: STUFF_FILE_EXT');

fs.writeFileSync(path.join(process.env.TEST_WORK || __dirname, 'truth.md'), truth.join('\n') + '\n');

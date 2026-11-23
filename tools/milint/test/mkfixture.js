// regenerates fixture/mod + truth.md. each file = lines of [text, CODE?]; CODE marks the line that must produce that finding.
// Author: Imperator_Aug (ARSENAL, ia-e1a5c29d)
const fs = require('fs'), path = require('path');
const { zip } = require('../../lib/zipwrite');
if (!process.env.TEST_WORK) { console.error('mkfixture: TEST_WORK not set (run.sh sets it); a direct run would delete the tracked test/fixture'); process.exit(2); }
const root = path.join(process.env.TEST_WORK || __dirname, 'fixture', 'mod');
fs.rmSync(path.join(process.env.TEST_WORK || __dirname, 'fixture'), { recursive: true, force: true });
const truth = [];
function put(rel, lines, expect) {
  const f = path.join(root, ...rel.split('/'));
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const out = [];
  lines.forEach((l, i) => {
    const [text, ...codes] = Array.isArray(l) ? l : [l];
    out.push(text);
    for (const c of codes) truth.push(`${rel}:${i + 1}: ${c}`);
  });
  fs.writeFileSync(f, out.join('\r\n') + '\r\n', 'latin1');
}
const R = 'resource/';

// ---- game set + presets (MIS-02..06,14,17,18,19,21)
put(R + 'set/multiplayer/games/combat.set', [
  ';SDL',
  '{game',
  ['\t{class armored_warfare}', 'MIS_CLASS_NO_MI'],
  '\t{settings',
  ['\t\t{gameDuration "45 min"}', 'MIS_DURATION'],
  '\t\t{gameDuration "90 min"}',
  '\t}',
  '\t{teamSettings',
  ['\t\t{minTeamPlayers 2}', 'MIS_TEAMKEY_UNREAD'],
  '\t\t{minTeamSlots 2}',
  '\t}',
  '\t{presets',
  '\t\t{"bad"',
  '\t\t\t{common',
  ['\t\t\t\t{unitset {value "^arcade"}}', 'MIS_UNITSET_EXCLUDE_ONLY'],
  '\t\t\t\t{unitset {value "all^arcade"}}',
  ['\t\t\t\t{unitLimits "flamer=3,sniper=2"}', 'MIS_LIMITS_FORMAT'],
  '\t\t\t\t{unitLimits "flamer=3;sniper=2"}',
  ['\t\t\t\t{budgets {hero {buttons "hero"}}}', 'MIS_BUDGET_NO_VEHICLE'],
  '\t\t\t}',
  '\t\t\t{bots',
  ['\t\t\t\t{easy {balancingFactorBonus {cp 0.75}}}', 'MIS_BALANCE_NO_CHARGE'],
  '\t\t\t\t{hard {balancingFactorBonus {cp 1.5}} {chargeFactors {value "*=0"}}}',
  '\t\t\t}',
  '\t\t}',
  '\t\t{"budgets"',
  '\t\t\t{common {budgets',
  '\t\t\t\t{vehicle {mode "standard"} {resource {start 100} {finish 200} {growTime 10}',
  '\t\t\t\t\t{payback {cp "0\t25\t50"} {restore "1.5\t1\t0.5"}}}}',
  ['\t\t\t\t{v2 {mode "standard"} {resource {period 5}}}', 'MIS_BUDGET_PARAM'],
  ['\t\t\t\t{v3 {mode "custom"} {resource {speed 2}}}', 'MIS_BUDGET_PARAM'],
  ['\t\t\t\t{v4 {mode "with_update"} {resource {restoreBegin 3}}}', 'MIS_BUDGET_PARAM'],
  ['\t\t\t\t{v5 {mode "without_update"} {resource {speed 3}}}', 'MIS_BUDGET_PARAM'],
  ['\t\t\t\t{v6 {mode "standard"} {resource {payback {cp "0 25 50"} {restore "1 1 1"}}}}', 'MIS_PAYBACK_FORMAT'],
  ['\t\t\t\t{v7 {mode "standard"} {resource {payback {cp "0\t25"} {restore "1"}}}}', 'MIS_PAYBACK_FORMAT'],
  ['\t\t\t\t{v8 {mode "standard"} {resource {payback {cp "50\t25"} {restore "1\t1"}}}}', 'MIS_PAYBACK_FORMAT'],
  '\t\t\t}}',
  '\t\t}',
  '\t}',
  '}',
]);

// ---- bot scripts
put(R + 'script/multiplayer/bot.lua', [
  'BotApi.Commands:Spawn("smgs(eng)", 5)',
  'local i = BotApi.Commands:Income(1)',
  ['BotApi.Commands:Attack(1, 2)', 'WARN_MIS_BOT_ORDER'],
  '-- BotApi.Commands:Retreat(1)',
]);
put(R + 'script/multiplayer/bot.data.lua', [
  ['AttackBaseTime = 5', 'MIS_BOT_DEAD_KEY'],
  'Purchases = {',
  '\t{ Repeat = 1, Units = {',
  '\t\t["eng"] = { {priority = 1, class = "infantry", unit = "smgs(eng)"},',
  ['\t\t\t{priority = 1, class = "infantry", unit = "ghost(eng)"} },', 'MIS_BOT_UNIT_UNKNOWN'],
  '\t\t["ger"] = { {priority = 1, class = "infantry", unit = "smgs(eng)"} },',
  '\t} },',
  ['\t{ Repeat = 0, Units = {', 'MIS_BOT_ARMY_MISSING'],
  '\t\t["eng"] = { {priority = 1, class = "infantry", unit = "smgs(eng)"} },',
  '\t} },',
  '}',
]);
put(R + 'set/multiplayer/units/common.set', [
  '{units',
  '\t{"smgs(eng)"}',
  '}',
]);
put(R + 'set/multiplayer/armies/eng.set', ['{army {id 3}}']);
put(R + 'set/multiplayer/armies/ger.set', ['{army {id 1}}']);

// ---- pather
put(R + 'set/pather.set', [
  '{Profile "human"',
  '\t{Height 0 0 0 0 0 0 0 -1 -1 -1 -1 -1 -1 -1 -1}',
  ['\t{Height 0 0 0}', 'MAP_SLOPE_TABLE'],
  '}',
]);

// ---- maps
const M1 = R + 'map/multi/m1/';
put(M1 + 'map', [
  ';SDL',
  '{map',
  '\t{Land {Position 0 0}}',
  ['\t{Clip {world 0 0 1 1}}', 'MAP_CLIP_OBSOLETE'],
  '\t{Entity "bush" 0x1',
  '\t\t{Position 1 2}',
  '\t\t{xform zl 5 scale 0.5}',
  '\t}',
  '\t{Entity "bush" 0x2',
  '\t\t{Position 1 2}',
  ['\t\t{xform zl 5 foo 3}', 'MAP_XFORM_TOKEN'],
  '\t}',
  '}',
]);
put(M1 + 'combat.mi', [
  ';SDL',
  '{mission',
  '\t{Helpers',
  '\t\t{triggers}',
  ['\t\t{bogus}', 'MI_HELPER_UNKNOWN'],
  '\t}',
  '\t{Players',
  '\t\t{count 2}',
  '\t\t{alias 1 "ok"}',
  ['\t\t{alias 5 "far"}', 'MI_PLAYERS'],
  ['\t\t{diplomacy 1 0 0}', 'MI_PLAYERS'],
  '\t}',
  '}',
]);
put(M1 + 'odd.mi', ['{mission}']);
// chain-n g1: GoH battle_zones.mi includes ../bz_*.inc; a missing one stops the load (INCLUDE_MISSING), a present one is fine
put(R + 'map/multi/inc_ok.inc', ['{vars}']);
put(R + 'map/multi/m1/inc.mi', [';SDL', '{mission', ['	(include "../bz_gone.inc")', 'INCLUDE_MISSING'], '	(include "../inc_ok.inc")', '}']);
// m1 also has a valid mode file: stray odd.mi is info only, no finding
put(M1 + 'map.info', [
  ';SDL',
  '{game',
  ['\t{maxPlayers 3}', 'MAP_PLAYERS'],
  '\t{minPlayers 2}',
  ['\t{ranked {maxPlayers 99}}', 'MAP_PLAYERS'],
  '\t{rankedMinPlayers 2}',
  '}',
]);
put(M1 + 'mtl0.mtl', [
  '{material',
  '\t{layer bump {diffuse "/a"} {color 0xffffffff}}',
  '}',
]);
put(M1 + 'mtl1.mtl', [
  '{material',
  '\t{layer bump {diffuse "/a"} {color 0xffffffff}}',
  '}',
]);
put(M1 + '.materials', [
  '{materials',
  '\t{"mtl0" {layer bump {diffuse "/a"}}}',
  ['\t{"mtl1" {layer bump {diffuse "/b"}}}', 'MAP_MATERIAL_SHADOWED'],
  '\t{"mtl9" {layer bump {diffuse "/c"}}}',
  '}',
]);
put(M1 + 'mod/patch.txt', ['x']);
truth.push(M1 + 'mod/patch.txt: MAP_MOD_FOLDER');
// bare map folder without a mode file
put(R + 'map/multi/m2/map', [';SDL', '{map}']);
truth.push(R + 'map/multi/m2/map: MAP_NO_MODE');
put(R + 'map/multi/m2/odd.mi', ['{mission}']);
truth.push(R + 'map/multi/m2/odd.mi: MAP_MODE_UNDEFINED');

// ---- patches: 1.pat without .patch, 2.pat with wrong id, 3.pat ok
fs.writeFileSync(path.join(root, '1.pat'), zip([['x.txt', Buffer.from('x')]]));
truth.push('1.pat: MAP_PATCH_MISSING');
fs.writeFileSync(path.join(root, '2.pat'), zip([['.patch', Buffer.from('{id 5}\r\n')]]));
truth.push('2.pat: MAP_PATCH_ID');
fs.writeFileSync(path.join(root, '3.pat'), zip([['.patch', Buffer.from('{id 3}\r\n')]]));

require('./netfix')(root, truth, R);
// ---- MAP-20 mode flags, MAP-25 Position arity, MAP-28 map.net origin
for (const m of ['battle_zones', 'captureflag']) put(R + 'set/multiplayer/games/' + m + '.set', [';SDL', '{game}']);
const M6 = R + "map/multi/m9/";
const flag = (n, id) => ['	{Entity "' + n + '" 0x' + id.toString(16), '		{Position 1 2}', '	}'];
put(M6 + 'combat.mi', [';SDL', ['{mission', 'WARN_MAP_MODE_FLAGS'], ...flag('flag_point_1', 0xc000), '}']);
put(M6 + 'battle_zones.mi', [';SDL', ['{mission', 'WARN_MAP_MODE_FLAGS'], ...flag('map_point', 0x8000), '}']);
put(M6 + 'captureflag.mi', [';SDL', ['{mission', 'WARN_MAP_MODE_FLAGS'], ...flag('flag_point_1', 0xc000), '}']);
put(M6 + 'map', [';SDL', '{map', '	{Land {Position 0 0}}', ['	{Entity "bush" 0x1 {Position 1}}', 'WARN_MAP_POSITION'],
  ...Array.from({ length: 25 }, (_, i) => '	{Entity "bush" 0x' + (0x10 + i).toString(16) + ' {Position 5000 5000}}'), '}']);
{
  const head = Buffer.alloc(14); head[0] = 10; head[1] = 1; head.writeInt16LE(10, 2); head.writeInt16LE(10, 4);
  fs.writeFileSync(path.join(root, ...(M6 + 'map.net').split('/')), Buffer.concat([head, Buffer.alloc(400)]));
  truth.push(M6 + 'map.net: WARN_MAP_NET_ORIGIN');
}
require('./mifix')(put, truth, R);
require('./chkfix')(put, truth, R, root);
fs.writeFileSync(path.join(process.env.TEST_WORK || __dirname, 'truth.md'), '# expected findings, `file:line: CODE` (generated by mkfixture.js)\n' + truth.sort().join('\n') + '\n');

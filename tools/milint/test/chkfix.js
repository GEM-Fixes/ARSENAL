// CHK-MI fixtures: one defect per marked line + a clean twin beside it. put(rel, lines) as in mkfixture.js
// Author: Imperator_Aug (ARSENAL, ia-912b9485)
const fs = require('fs'), path = require('path');
const { zip } = require('../../lib/zipwrite');
module.exports = function (put, truth, R, root) {
  // ---- .mi triggers (mi.js): MIS-35 48 36 42 47 53, TST-123, TST-85, TST-34
  const M = R + 'map/multi/m7/';
  put(M + 'map', [';SDL', '{map', '\t{Land {Position 0 0}}', '}']);
  put(M + 'map.info', [';SDL', '{game', '\t{maxPlayers 4}', '\t{minPlayers 2}', '}']);
  put(R + 'entity/flora/tree_x/tree_x.def', ['{from "x"}']);
  put(R + 'entity/construction/entourage/cart_x/cart_x.def', ['{from "x"}']);
  const pt = (id, tm, od) => [`\t{Entity "map_point" 0x${id}`, '\t\t{Position 0 0}', `\t\t{Extender "map_point" {name ${tm}${od}} {team ${tm}} {order ${od}} {visor SpawnPoint}}`, '\t}'];
  put(M + 'combat.mi', [
    ';SDL',
    ['{mission', 'MI_MAP_POINT_MISSING'],         // maxPlayers 4: team b lacks order 2 (team a has 1, 2)
    ...pt(1, 'a', 1), ...pt(2, 'a', 2), ...pt(3, 'b', 1),
    '\t{Entity "tree_x" 0x10',
    '\t\t{Position 1 1}',
    ['\t\t{Player 1}', 'WARN_MI_PLAYER_ON_STATIC'],
    '\t}',
    '\t{Entity "cart_x" 0x11',                   // entourage: actor, Player fine
    '\t\t{Position 1 1}',
    '\t\t{Player 1}',
    '\t}',
    '\t{Helpers',
    '\t\t{event "ev1"}',
    '\t\t{triggers',
    '\t\t\t{"t_bare"',
    ['\t\t\t\t{condition {terms "1.event"}}', 'MI_TERM_BARE'],
    '\t\t\t\t{actions {"entity_state" {selector {tag x}} {inactive off}}}',
    '\t\t\t}',
    '\t\t\t{"t_empty"',
    '\t\t\t\t{condition {terms {"1.event" {id "ev1"}}}}',
    ['\t\t\t\t{actions}', 'MI_ACTIONS_EMPTY'],
    '\t\t\t}',
    '\t\t\t{"t_pose"',
    '\t\t\t\t{actions',
    ['\t\t\t\t\t{"actor_state" {selector {tag x}} {movement {type crawl}}}', 'WARN_MI_POSE_AT_START'],
    '\t\t\t\t}',
    '\t\t\t}',
    '\t\t\t{"t_pose_ok"',
    '\t\t\t\t{actions',
    '\t\t\t\t\t{delay {time 2}}',
    '\t\t\t\t\t{"actor_state" {selector {tag x}} {movement {type crawl}}}',
    '\t\t\t\t}',
    '\t\t\t}',
    '\t\t\t{"t_terms"',
    '\t\t\t\t{condition',
    '\t\t\t\t\t{terms',
    '\t\t\t\t\t\t{"1.near" {selector {tag x}}',
    ['\t\t\t\t\t\t\t{distance 1200}}', 'WARN_MI_NEAR_DISTANCE'],
    '\t\t\t\t\t\t{"2.near" {selector {tag x}} {distance 60}}',
    '\t\t\t\t\t\t{"3.entities" {selector {prop vehicle}',
    ['\t\t\t\t\t\t\t{state dead}} {count {op ">"} {value 0}}}', 'MI_DEAD_VEHICLE'],
    '\t\t\t\t\t\t{"4.entities" {selector {prop human} {state dead}} {count {op ">"} {value 0}}}',
    '\t\t\t\t\t}',
    '\t\t\t\t\t{expression "1 & 2 & 3 & 4"}',
    '\t\t\t\t}',
    '\t\t\t\t{actions',
    ['\t\t\t\t\t{"game_speed" {speed 2}}', 'MI_GAME_SPEED_MP'],
    '\t\t\t\t\t{"entity_state" {selector {tag x}',
    ['\t\t\t\t\t\t{destroyed_components {masks "body"}}} {inactive on}}', 'MI_SELECTOR_COMPONENT_STD'],
    '\t\t\t\t\t{"entity_state" {selector {source advanced} {group {select {tag {tag "x"}}} {include {destroyed_components {masks "body"}}}}} {inactive on}}',
    '\t\t\t\t}',
    '\t\t\t}',
    '\t\t}',
    '\t}',
    '}',
  ]);
  // TST-34 clean twin: team b has an order-0 point (fits any slot)
  const M2 = R + 'map/multi/m8/';
  put(M2 + 'map.info', [';SDL', '{game', '\t{maxPlayers 4}', '}']);
  put(M2 + 'map', [';SDL', '{map', '\t{Land {Position 0 0}}', '\t{Clips {"[auto]" {pather}} {"captureflaga" {pather}} {"captureflagb" {pather}}}', '}']);
  put(M2 + 'combat.mi', [';SDL', '{mission', ...pt(1, 'a', 1), ...pt(2, 'a', 2), ...pt(3, 'b', 0), '}']);
  // MIS-62: m8 has both clips (clean); m9 (mkfixture) has captureflag.mi and no {Clips}
  put(M2 + 'captureflag.mi', [';SDL', '{mission', '\t{Entity "flag_point_frontlines" 0x20', '\t\t{Position 1 2}', '\t}', ...pt(1, 'a', 1), ...pt(2, 'a', 2), ...pt(3, 'b', 0), '}']);
  truth.push(R + 'map/multi/m9/map: MAP_CAPTURE_CLIPS');
  // m1 (mkfixture) combat.mi has map.info maxPlayers 3 and no map points: both teams miss order 1..2
  truth.push(R + 'map/multi/m1/combat.mi:2: MI_MAP_POINT_MISSING', R + 'map/multi/m1/combat.mi:2: MI_MAP_POINT_MISSING');

  // ---- games sets: MIS-65 15 22
  put(R + 'set/multiplayer/games/botmode.set', [
    ';SDL',
    '{game',
    '\t{settings',
    '\t\t{enableBots}',
    ['\t\t{useUnitLevelRestrictions 0}', 'WARN_MIS_UNIT_LEVEL_OFF'],
    '\t}',
    ['\t{commandPoints "*=100;tank=20;heavy=10"}', 'MIS_CP_POOL_OVERLAP'],
    '}',
  ]);
  put(R + 'set/multiplayer/games/lvl_ok.inc', [
    '{optionsAdvanced fogOfWar useUnitLevelRestrictions}',
    '{useUnitLevelRestrictions 0}',
    '{commandPoints "*=100;tank=20;inf=10"}',
  ]);
  put(R + 'set/multiplayer/units/cp.set', [
    '{"t1" ("vs" c(60) t(all tank heavy) s(ger)) {level 2} {cost 80}}',
    '{"i1" ("vs" c(60) t(all inf) s(ger)) {cost 80}}',
  ]);
  put(R + 'map/multi/m10/botmode.mi', [';SDL', ['{mission', 'MIS_BOT_NO_FLAGS'], '}']);
  put(R + 'map/multi/m11/botmode.mi', [';SDL', '{mission', '\t{Entity "flag_point_1" 0x1', '\t\t{Position 1 2}', '\t}', '}']);

  // ---- MIS-07 army id, MIS-67 fix_inventory
  put(R + 'set/multiplayer/armies/bad.set', [['{army {id -1}}', 'MIS_ARMY_ID_NEGATIVE']]);
  put(R + 'properties/human.ext', ['{brain "human"', '\t{Properties', ['\t\t{fix_inventory 1}', 'WARN_MIS_FIX_INVENTORY'], '\t\t{fix_inventory 0}', '\t}', '}']);

  // ---- KEY-23: 4.pat deletes set/pather.set (shipped by this mod) and a file it does not ship
  fs.writeFileSync(path.join(root, '4.pat'), zip([['.patch', Buffer.from('{id 4}\r\n{delete "set/pather.set"}\r\n{delete "set/nothing.set"}\r\n')]]));
  truth.push('4.pat: WARN_MAP_PATCH_DELETE_OWN');
};

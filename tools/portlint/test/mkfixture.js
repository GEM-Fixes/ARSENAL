// portlint fixture: fixture/mod (ported mod) + fixture/base (vanilla side, --base) + truth.md.
// put(rel, lines): line = text | [text, CODE...] -> truth "rel:line: CODE". each code has a seeded defect and a clean twin
// Author: Imperator_Aug (ARSENAL, ia-f768195c)
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, 'fixture');
fs.rmSync(dir, { recursive: true, force: true });
const truth = ['# file:line: CODE (seeded defects; diffed by run.sh)'];
function write(root, rel, lines, record) {
  const f = path.join(dir, root, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const text = lines.map((l, i) => {
    if (Array.isArray(l)) { if (record) for (const c of l.slice(1)) truth.push(`${rel}:${i + 1}: ${c}`); return l[0]; }
    return l;
  });
  fs.writeFileSync(f, text.join('\r\n') + '\r\n', 'latin1');   // game text = cp1251 + CRLF
}
const put = (rel, lines) => write('mod', rel, lines, true);
const base = (rel, lines) => write('base', rel, lines, false);

// vanilla side
base('resource/entity/inventory/-weapon/m24/m24.def', ['{game_entity', '\t{extension "m24.mdl"}', '}']);
base('resource/entity/-vehicle/tank_medium/t34/t34.def', ['{game_entity', '}']);
base('resource/entity/construction/fence/fence_part/fence_part.def', ['{game_entity', '}']);
base('resource/set/stuff/rifle/kar98', ['{from "pattern rifle"', '\t{entity "kar98_goh"}', '}']);
base('resource/properties/cannon.ext', ['{x 1}']);

// PORT-47: GoH stuff.ext over the AS2 path; twin: AS2-form stuff_small.ext
put('resource/properties/stuff.ext', ['{stuff', ['\t{NoVisibilityPatch}', 'PORT_STUFF_OVERRIDE'], '}']);
put('resource/properties/stuff_small.ext', ['{stuff', '\t{x 1}', '}']);
// PORT-126: properties/goh include with no stub; twin: include with its stub present
put('resource/properties/goh/stuff_small.ext', [['(include "stuff.ext")', 'PORT_GOH_INCLUDE_DANGLES'], '{y 1}']);
put('resource/properties/goh/cannon_crew.ext', ['(include "cannon.ext")', '(include "/properties/cannon.ext")']);
put('resource/properties/goh/cannon.ext', ['(include "/properties/cannon.ext")']);

// tank: PORT-53 keys, PORT-157 bone, PORT-170 place, PORT-187 pather, PORT-183 armor_spa (ported: gaps json)
put('resource/entity/-vehicle/tank_medium/tank/tank.def', [
  '{game_entity',
  '\t{extension "tank.mdl"}',
  ['\t{PatherId "t34"}', 'PORT_PATHER_UNKNOWN'],
  ['\t{TPC_ZClip 1}', 'PORT_ENTITY_KEY_LEFT'],
  ['\t{perks {component "hull"}}', 'PORT_ENTITY_KEY_LEFT'],
  ['\t("armor_spa_front" 50)', 'WARN_PORT_DONOR_ARMOR_SPA'],
  '\t{Weaponry',
  '\t\t{place "gun" ("abm_low")}',
  ['\t\t{place "a" "ghost_part"}', 'PORT_PLACE_CHILD_MISSING'],
  '\t\t{place "b" "fence_part"}',
  '\t\t{place "c" ""}',
  '\t}',
  '\t{bone "turret" {limits -10 20}}',
  ['\t{bone "mgun_rot" {limits -10 20}}', 'PORT_BONE_MISSING'],
  '}',
]);
put('resource/entity/-vehicle/tank_medium/tank/tank.mdl', [
  '{skeleton',
  '\t{animation',
  '\t\t{sequence "fire" {speed 0.6}}',
  ['\t\t{sequence "open" {speed 0.3} {events {n "x"}}}', 'WARN_PORT_MDL_EVENTS'],
  '\t}',
  '\t{bone "basis"',
  '\t\t{bone revolute "turret"}',
  '\t}',
  '}',
]);
put('gaps/tank.gaps.json', ['{"tool": "goh2as2", "form": "gaps/1", "unit": "tank", "def": "entity/-vehicle/tank_medium/tank/tank.def"}']);
// clean twins: AS2 pather, a donor def with armor_spa that no gaps file names, same-kind name as vanilla (t34)
put('resource/entity/-vehicle/tank_medium/t34/t34.def', ['{game_entity', '\t{PatherId "tank"}', '\t("armor_spa_front" 50)', '}']);
// PORT-155: tank named like a vanilla grenade/item
put('resource/entity/-vehicle/tank_light/m24/m24.def', [['{game_entity', 'PORT_NAME_CLASH'], '\t{PatherId "tank.light"}', '}']);

// PORT-184 human table; PORT-99 twin above is a non-human mdl
put('resource/entity/humanskin/goh_t1/goh_t1.mdl', [
  '{skeleton',
  '\t{animation',
  '\t\t{sequence "walk" {speed 1}}',
  ['\t\t{sequence "run" {events {n "step"}}}', 'PORT_HUMAN_SEQ_KEY'],
  ['\t\t{sequence "aim" {additive}}', 'PORT_HUMAN_SEQ_KEY'],
  '\t}',
  '}',
]);

// PORT-85 set forms; twin: AS2 breed set keeps perks (PORT-89) and AS2 item form
put('resource/set/breed/goh/soldier.set', [
  '{breed',
  ['\t{item "pattern heavy_headgear"}', 'WARN_PORT_GOH_SET_FORM'],
  ['\t{item {tag "body"} {entity "goh_tunic"} {inventory}}', 'WARN_PORT_GOH_SET_FORM'],
  '}',
]);
put('resource/set/breed/goh/rifleman.set', ['{breed', '\t{perks {"rifle" lvl_2}}', '\t{inventory {item "kar98_goh" filled} {item "helmet pattern"}}', '}']);

// PORT-124: GoH-origin weapon defs; type38 has no stuff, arisaka has its own, kar98_goh is {entity}-pointed from vanilla stuff
put('resource/entity/inventory/-weapon/type38/type38.def', [['{game_entity', 'WARN_PORT_NO_STUFF'], '}']);
put('resource/entity/inventory/-weapon/arisaka/arisaka.def', ['{game_entity', '}']);
put('resource/entity/inventory/-weapon/kar98_goh/kar98_goh.def', ['{game_entity', '}']);
put('resource/entity/inventory/-weapon/handmade/handmade.def', ['{game_entity', '}']);   // not GoH-origin: not checked
put('GOH-ORIGIN.tsv', ['# path\tsha1\ttool\tgoh_source',
  'resource/entity/inventory/-weapon/type38/type38.def\t0\tgoh2as2\tx', 'resource/entity/inventory/-weapon/arisaka/arisaka.def\t0\tgoh2as2\tx',
  'resource/entity/inventory/-weapon/kar98_goh/kar98_goh.def\t0\tgoh2as2\tx']);

// PORT-197: GoH velocity define in stuff; twin: AS2 ("speed" m/s)
put('resource/set/stuff/rifle/arisaka', ['{from "pattern rifle"', '\t{entity "arisaka"}', ['\t("velocity" 750)', 'PORT_SPEED_DEFINE'], '}']);
put('resource/set/stuff/rifle/arisaka2', ['{from "pattern rifle"', '\t{entity "arisaka"}', '\t("speed" 750)', '}']);

fs.writeFileSync(path.join(__dirname, 'truth.md'), truth.sort().join('\n') + '\n');

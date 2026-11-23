// misdiff fixture: fixture/a + fixture/b map folders + truth.md. line = [text, CODE...] -> truth "<file>:<line>: CODE" (file = mode file name)
// markers sit on the line the tool reports: b side for added/changed, a side for removed; whole-file codes on line 1; mode/info codes no line
// Author: Imperator_Aug (ARSENAL, ia-4070a74e)
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, 'fixture');
fs.rmSync(dir, { recursive: true, force: true });
const truth = ['# file[:line]: CODE (seeded changes; info + findings; diffed by run.sh)'];
function put(side, file, lines, noLine) {
  const f = path.join(dir, side, file);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const text = lines.map((l, i) => {
    if (Array.isArray(l)) { for (const c of l.slice(1)) truth.push(noLine ? `${file}: ${c}` : `${file}:${i + 1}: ${c}`); return l[0]; }
    return l;
  });
  fs.writeFileSync(f, text.join('\r\n') + '\r\n', 'latin1');   // cp1251 + CRLF
}
const ent = (def, uid, x, z, name, team, extra = []) => [
  `\t{Entity "${def}" ${uid}`, `\t\t{Position ${x} ${z}}`, `\t\t{Extender "map_point"`, `\t\t\t{name ${name}}`, `\t\t\t{team ${team}}`, `\t\t\t{phase 0}`,
  `\t\t\t{visor SpawnPoint}`, `\t\t}`, ...extra, `\t}`];
const mark = (arr, ...codes) => { const c = arr.slice(); c[0] = [c[0], ...codes]; return c; };
const plain = (def, uid, x, z) => [`\t{Entity "${def}" ${uid}`, `\t\t{Position ${x} ${z}}`, `\t}`];

// ---- combat.mi a
put('a', 'combat.mi', [
  '{mission',
  ...ent('map_point', 1, 100, 200, 'a1', 'a'),
  ...mark(ent('map_point', 2, 110, 210, 'a2', 'a'), 'MIS_DIFF_ENTITY_REMOVED'),
  ...mark(plain('rifle', 3, 5, 5), ),
  ...ent('map_point', 4, 50, 50, 'c1', 'a'),
  ...mark([`\t{Entity "mine" 6`, `\t\t{Position 1 1}`, `\t\t{MID 7}`, `\t}`], 'MIS_DIFF_ENTITY_REMOVED'),
  ...plain('tree', 8, 0, 0),
  ...mark(['\t{Link 4 {2}}'], ),
  '\t{difficulty 1}',
  '\t{Helpers',
  '\t\t{reinforcements {scoreTotal 0}}',
  '\t\t{triggers',
  '\t\t\t{"t_keep" {condition} {actions {"delete" {selector {tag x}}}}}',
  '\t\t\t{"t_chg" {condition {type rand} {value 0.1}} {actions}}',
  ...[['\t\t\t{"t_gone" {condition} {actions}}', 'MIS_DIFF_TRIGGER_REMOVED']],
  '\t\t}',
  '\t\t{zone {Name "zA"} {Radius 10}}',
  ...[['\t\t{event "e1"}', 'MIS_DIFF_EVENT_REMOVED']],
  '\t\t{tasks {"obj1" {x 1}}}',
  '\t}',
  '}',
]);
// b: line 1 carries whole-file codes. entities: 1 moved, 2 gone (still linked), 3 def changed, 4 renamed, 5 added, 6 gone (MID 7 in {mids}), 7 twice
put('b', 'combat.mi', [
  ['{mission', 'MIS_DIFF_SPAWN_COUNT', 'WARN_MISDIFF_REMOVED_REFERENCED', 'WARN_MISDIFF_REMOVED_REFERENCED', 'WARN_MISDIFF_REMOVED_REFERENCED',
    'MIS_DIFF_HELPER_CHANGED'],
  ...mark(ent('map_point', 1, 140, 200, 'a1', 'a'), 'MIS_DIFF_ENTITY_MOVED'),
  ...mark(plain('smg', 3, 5, 5), 'MIS_DIFF_ENTITY_DEF_CHANGED'),
  ...mark(ent('map_point', 4, 50, 50, 'c9', 'a'), 'MIS_DIFF_ENTITY_CHANGED'),
  ...mark(plain('crate', 5, 9, 9), 'MIS_DIFF_ENTITY_ADDED'),
  ...mark(plain('flag', 7, 3, 3), 'MIS_DIFF_ENTITY_ADDED'),
  ...mark(plain('flag', 7, 4, 4), 'WARN_MISDIFF_UID_COLLISION'),
  ...plain('tree', 8, 0, 0),
  ...mark(['\t{Link 4 {2 5}}'], 'MIS_DIFF_LINK_CHANGED'),
  ...mark(['\t{difficulty 2}'], 'MIS_DIFF_BLOCK_CHANGED'),
  '\t{Helpers',
  '\t\t{reinforcements {scoreTotal 5}}',
  '\t\t{triggers',
  '\t\t\t{"t_keep" {condition} {actions {"delete" {selector {tag x}}}}}',
  ...[['\t\t\t{"t_chg" {condition {type rand} {value 0.5}} {actions {"trigger" {name "t_gone"} {mids 7}}}}', 'MIS_DIFF_TRIGGER_CHANGED']],
  ...[['\t\t\t{"t_new" {condition} {actions}}', 'MIS_DIFF_TRIGGER_ADDED']],
  '\t\t}',
  ...[['\t\t{zone {Name "zA"} {Radius 25}}', 'MIS_DIFF_ZONE_CHANGED']],
  ...[['\t\t{zone {Name "zB"} {Radius 5}}', 'MIS_DIFF_ZONE_ADDED']],
  ...[['\t\t{tasks {"obj1" {x 2}}}']],
  '\t}',
  '}',
]);
// tasks block is nested ({tasks {"obj1"..}}): changed obj1 -> TASK_CHANGED reported on the "obj1" block line
{
  const f = path.join(dir, 'b', 'combat.mi'), t = fs.readFileSync(f, 'latin1').split('\r\n');
  const n = t.findIndex(l => l.includes('{"obj1" ') || l.includes('{tasks {"obj1"'));
  truth.push(`combat.mi:${n + 1}: MIS_DIFF_TASK_CHANGED`);
}
// the nested tasks line is a single-line block {tasks {"obj1" ..}}: tasks children are 'obj1' (same line)

// mode sets + map.info
put('a', 'battle_zones.mi', ['{mission', '}'], true);
put('b', 'captureflag.mi', ['{mission', '}'], true);
put('a', 'map.info', [';SDL', '{game', '  {maxPlayers 8}', '}'].map((l, i) => i === 2 ? [l, 'MIS_DIFF_MAPINFO_CHANGED'] : l), true);
put('b', 'map.info', [';SDL', '{game', '  {maxPlayers 6}', '}']);
{
  const t = fs.readFileSync(path.join(dir, 'b', 'combat.mi'), 'latin1');
  // (battle_zones removed / captureflag added) mode codes carry no line
}
truth.push('battle_zones.mi: MIS_DIFF_MODE_REMOVED', 'captureflag.mi: MIS_DIFF_MODE_ADDED');
// ---- single-file pair: clean identical file -> no output; second pair with only a move
fs.writeFileSync(path.join(__dirname, 'truth.md'), truth.join('\n') + '\n');

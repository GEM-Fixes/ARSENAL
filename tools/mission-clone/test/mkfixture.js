// mission-clone fixture: fixture/game (loose resource) + truth.md ("<scenario> <CODE>" per expected finding)
// Author: Imperator_Aug (ARSENAL, ia-61d26898)
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, 'fixture');
fs.rmSync(dir, { recursive: true, force: true });
function put(rel, text) {
  const f = path.join(dir, 'game', rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, text.join('\r\n') + '\r\n', 'latin1');   // game text = cp1251 + CRLF
}
for (const m of ['combat', 'battle_zones', 'captureflag', 'frontline']) put(`resource/set/multiplayer/games/${m}.set`, ['{game', '\t{teammatch}', '}']);
const pt = (uid, nm, team, x, y, mid) => [`\t{Entity "map_point" ${uid}`, `\t\t{Position ${x} ${y}}`, '\t\t{Extender "map_point"', `\t\t\t{name ${nm}}`, `\t\t\t{team ${team}}`, '\t\t\t{phase 0}', `\t\t\t{order 1}`, '\t\t\t{visor SpawnPoint}', '\t\t}', '\t\t{Player 0}', `\t\t{MID ${mid}}`, '\t}'];
const flag = (uid, n, x, y, mid) => [`\t{Entity "flag_point_${n}" ${uid}`, `\t\t{Position ${x} ${y}}`, '\t\t{xform scale 0.75}', '\t\t{Extender "map_point"', `\t\t\t{name f${n}}`, '\t\t\t{zoneA 12}', '\t\t\t{zoneB 12}', '\t\t\t{phase 0}', `\t\t\t{order ${n}}`, '\t\t\t{show All}', '\t\t\t{visor MapPoint}', '\t\t}', '\t\t{Player 0}', `\t\t{MID ${mid}}`, '\t}'];
const tail = ['\t{Tags "day" 0x9000}', '\t{Players', '\t\t{count 17}', '\t\t{diplomacy', ...Array.from({ length: 17 }, (_, i) => '\t\t\t' + Array.from({ length: 17 }, (_, j) => (i === 0 ? (j === 0 ? 1 : 0) : (j === 0 ? 0 : 1))).join(' ')), '\t\t}', '\t}', '\t{Fog 1}', '\t{EntityManager {Enabled}}', '}'];
const base = ['{mission', ...pt('0xc000', 'a1', 'a', -1000, 0, 1), ...pt('0xc001', 'b1', 'b', 1000, 200, 2)];
put('resource/map/multi/m1/combat.mi', [...base, ...tail]);
put('resource/map/multi/m1/map.info', [';SDL', '{game {maxPlayers 2}}']);
put('resource/map/multi/m2/battle_zones.mi', [...base, ...flag('0x8010', 1, 0, 100, 3), ...flag('0x8011', 2, -500, 50, 4), ...flag('0x8012', 3, 500, 150, 5), ...tail]);
put('resource/map/multi/m2/map.info', [';SDL', '{game {maxPlayers 2}}']);
// MIS-62: captureflag needs clips captureflaga/b in the map's {Clips}; m1 has them, m2 has only [auto] (cf_noclip finds it)
const clips = n => ['{Clips', ...n.flatMap(c => ['	{"' + c + '"', '		{world -2000 -2000 2000 2000}', '	}']), '}'];
// MIS-65: m1's map file holds a flag entity, so a bot mode cloned onto m1 (wm) is not MIS_BOT_NO_FLAGS; m2 has none
put('resource/map/multi/m1/map', [...clips(['[auto]', 'captureflaga', 'captureflagb']), '{Entity "flag_point_1" 0x8000', '	{Position 0 0}', '}']);
put('resource/map/multi/m2/map', clips(['[auto]']));
// seeded (chain-n3): GoH flags carry {zone {radius 0} {zoneId "fN"}} and no zoneA/zoneB -> AS2 capture radius 1 m, flags never flip.
// m5: 2 GoH flags (get zoneA/zoneB), 1 vanilla flag (zoneA 12 kept, not doubled), 1 GoH spawn point with zoneId "" (untouched)
const gflag = (uid, n, x, y, mid) => [`	{Entity "flag_point_${n}" ${uid}`, `		{Position ${x} ${y}}`, '		{Extender "map_point"', `			{name f${n}}`, '			{zone', '				{radius 0}', `				{zoneId "f${n}"}`, '			}', '			{phase 0}', `			{order ${n}}`, '			{show All}', '			{visor MapPoint}', '		}', '		{Player 0}', `		{MID ${mid}}`, '	}'];
const gpt = ['	{Entity "map_point" 0xc009', '		{Position 0 900}', '		{Extender "map_point"', '			{name a2}', '			{team a}', '			{zone', '				{radius 0}', '				{zoneId ""}', '			}', '			{visor SpawnPoint}', '		}', '		{Player 0}', '		{MID 9}', '	}'];
// chain-n4: f1 has a GoH {zone "poly"} (square 354.49 units, points relative to its position -> equal-area circle r 200 units = 10 m);
// f2 has none -> --flag-zone fallback; "fz" with 2 points is not a polygon and is ignored
const s = 177.245, gz = ['	{Helpers', '		{zone "poly"', '			{position 0 100 0}', '			{Name "f1"}', `			{Point ${-s} ${-s}}`, `			{Point ${s} ${-s}}`, `			{Point ${s} ${s}}`, `			{Point ${-s} ${s}}`, '		}',
  '		{zone "poly"', '			{position 0 0 0}', '			{Name "fz"}', '			{Point 0 0}', '			{Point 900 900}', '		}', '	}'];
put('resource/map/multi/m5/battle_zones.mi', [...base, ...gpt, ...gflag('0x8010', 1, 0, 100, 3), ...gflag('0x8011', 2, -500, 50, 4), ...flag('0x8012', 3, 500, 150, 5), ...gz, ...tail]);
put('resource/map/multi/a_frontlines/m3/frontline.mi', [...base, ...flag('0x8010', 1, 0, 100, 3), ...tail]);
put('resource/map/multi/a_frontlines/m3/map.info', [';SDL', '{game {maxPlayers 2}}']);
// chain-n g1: a GoH battle_zones.mi includes ../bz_*.inc. One include lives in a --src (GoH) pak at resource/map/multi.pak as
// multi/bz_here.inc (copied into the mod, with its own nested include), one exists nowhere (dropped, WARN_MC_INCLUDE_DROPPED)
put('resource/map/multi/m4/battle_zones.mi', [...base, '\t(include "../bz_here.inc")', '\t(include "../bz_gone.inc")', ...flag('0x8010', 1, 0, 100, 3), ...tail]);
put('resource/map/multi/m4/map.info', [';SDL', '{game {maxPlayers 2}}']);
{ const { zip } = require('../../lib/zipwrite'); const g = path.join(dir, 'goh', 'resource', 'map'); fs.mkdirSync(g, { recursive: true });
  fs.writeFileSync(path.join(g, 'multi.pak'), zip([['multi/bz_here.inc', Buffer.from('{vars}\r\n(include "bz_inner.inc")\r\n')], ['multi/bz_inner.inc', Buffer.from('{vars}\r\n')]]));
  // seeded (chain-n2): a GoH mode .set in --src must not shadow the game's (it includes GoH-only presets/*.inc)
  const gs = path.join(dir, 'goh', 'resource', 'set', 'multiplayer', 'games'); fs.mkdirSync(gs, { recursive: true });
  fs.writeFileSync(path.join(gs, 'combat.set'), '{game\r\n\t(include "presets/goh_only.inc")\r\n}\r\n'); }

// scenarios: name | args | expected codes (counted findings)
const sc = [
  'bz_add --map map/multi/m1 --from combat --to battle_zones|WARN_MC_FLAGS_AUTOPLACED',
  'bz_strip --map map/multi/m2 --from battle_zones --to combat|',
  'cf_add --map map/multi/m1 --from combat --to captureflag|WARN_MC_FLAGS_AUTOPLACED',
  'frontline --map map/multi/m1 --from combat --to frontline|MC_NEEDS_MANUAL',
  'custom --map map/multi/m1 --from combat --to nosuchmode|MC_NO_MODE_SET MC_NEEDS_MANUAL',
  'nosrc --map map/multi/m1 --from frontline --to combat|MC_NO_SOURCE',
  'gohzone --map map/multi/m5 --from battle_zones --to nosuchmode|MC_NO_MODE_SET MC_NEEDS_MANUAL',
  'inc --map map/multi/m4 --from battle_zones --to combat --src fixture/goh|WARN_MC_INCLUDE_DROPPED',
  'cf_noclip --map map/multi/m2 --from battle_zones --to captureflag|MC_NO_CAPTURE_CLIPS WARN_MC_FLAGS_AUTOPLACED',
];
fs.writeFileSync(path.join(__dirname, 'scenarios.txt'), sc.join('\n') + '\n');
const truth = ['# scenario CODE (expected counted findings; diffed by run.sh)'];
for (const s of sc) { const [a, c] = s.split('|'); for (const code of c.split(' ').filter(Boolean)) truth.push(`${a.split(' ')[0]} ${code}`); }
fs.writeFileSync(path.join(__dirname, 'truth.md'), truth.join('\n') + '\n');

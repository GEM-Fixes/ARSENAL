// misdiff --exe / --mod-dir: made-up installs, no real game. Run by run.sh; one line per failure, then PASS.
//   AS2 (shared install, as64.exe present): base m1/combat.mi, as64/core moves entity 1, mod mx (Classic range) moves entity 2.
//     no --exe and --exe as64 = a: base + core, b: + mx -> 2 entities moved; --exe mowas_2 = no as64/core -> 1 moved (entity 2).
//     mod my (MinGameVersion 3.301, Enhanced): as64 Classic and mowas_2 refuse it -> nothing differs, WARN_MISDIFF_MOD_DROPPED said with or without --exe (a finding: the MIS_DIFF_* info lines stay the changes only).
//   GoH (binaries/x64/call_to_arms.exe present): g1/battle_zones.mi + battle_zones.info with a GoH zoneId flag and a Helpers zone "poly";
//     a GoH mod folder outside the install (--mod-dir) moves the flag and grows the poly -> ENTITY_MOVED + ZONE_CHANGED + MAPINFO_CHANGED.
// Author: Imperator_Aug (ARSENAL, ia-ff959083)
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), { spawnSync } = require('child_process');
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'misdiff-exe-'));
let fails = 0;
const bad = m => { console.log('FAIL ' + m); fails++; };
const put = (rel, text) => { const f = path.join(T, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text.replace(/\r?\n/g, '\r\n'), 'latin1'); };
const run = (...a) => spawnSync(process.execPath, [path.join(__dirname, '..', 'misdiff.js'), ...a], { encoding: 'utf8' });
const mi = (x1, x2) => `{mission\n\t{Entity "rifle" 0x1\n\t\t{Position ${x1} 0}\n\t}\n\t{Entity "crate" 0x2\n\t\t{Position ${x2} 0}\n\t}\n}\n`;
const count = (s, code) => (s.match(new RegExp(code, 'g')) || []).length;

// ---- AS2 shared install
fs.mkdirSync(path.join(T, 'as2'), { recursive: true }); fs.writeFileSync(path.join(T, 'as2/as64.exe'), '');
put('as2/resource/map/multi/m1/combat.mi', mi(0, 0));
put('as2/as64/core/resource/map/multi/m1/combat.mi', mi(10, 0));
put('as2/mods/mx/mod.info', '{Mod\n\t{Name "mx"}\n\t{MinGameVersion "3.262.0"}\n\t{MaxGameVersion "3.262.1"}\n}\n');
put('as2/mods/mx/resource/map/multi/m1/combat.mi', mi(0, 5));
put('as2/mods/my/mod.info', '{Mod\n\t{Name "my"}\n\t{MinGameVersion "3.301"}\n}\n');
put('as2/mods/my/resource/map/multi/m1/combat.mi', mi(0, 7));
const G = path.join(T, 'as2');
let r = run('--game', G, '--mods', 'mx', '--map', 'm1');
const none = r.stdout;
if (r.status !== 0 || count(none, 'MIS_DIFF_ENTITY_MOVED') !== 2) bad('no --exe: want 2 moved (as64 view) ' + r.status + ' ' + r.stdout + r.stderr);
r = run('--game', G, '--mods', 'mx', '--map', 'm1', '--exe', 'as64');
if (r.stdout !== none) bad('--exe as64 differs from no --exe: ' + r.stdout);
r = run('--game', G, '--mods', 'mx', '--map', 'm1', '--exe', 'mowas_2');
if (r.status !== 0 || count(r.stdout, 'MIS_DIFF_ENTITY_MOVED') !== 1 || !/0x2 moved 5m/.test(r.stdout)) bad('--exe mowas_2: want entity 0x2 moved only: ' + r.stdout + r.stderr);
const r2 = run('--game', G, '--mods', 'mx', '--map', 'm1', '--exe', 'mowas2');
if (r2.stdout !== r.stdout) bad('--exe mowas2 is not mowas_2');
r = run('--game', G, '--mods', 'my', '--map', 'm1', '--exe', 'mowas_2');
if (count(r.stdout, 'MIS_DIFF_ENTITY_MOVED') !== 0 || !/WARN_MISDIFF_MOD_DROPPED/.test(r.stdout)) bad('mowas_2 applied a 3.301 mod: ' + r.stdout);
// no --exe (as64 view, Classic list): the 3.301 mod is left out too, and that is said (it was 'no changes' without a word)
r = run('--game', G, '--mods', 'my', '--map', 'm1');
if (r.status !== 0 || !/mods.*WARN_MISDIFF_MOD_DROPPED.*my/.test(r.stdout) || count(r.stdout, 'MIS_DIFF_ENTITY_MOVED') !== 0) bad('no --exe: Classic drop of a 3.301 mod not said: ' + r.stdout + r.stderr);
// json: the drop is a finding, never a MIS_DIFF_* info line (a reader counting info lines as changes, the GUI Missions diff, sees 0)
{
  const j = JSON.parse(run('--game', G, '--mods', 'my', '--map', 'm1', '--format', 'json').stdout || '{}');
  if ((j.info || []).length !== 0 || !(j.findings || []).some(f => f.code === 'WARN_MISDIFF_MOD_DROPPED' && f.file === 'mods' && /my/.test(f.msg))) bad('json: drop not a finding only: ' + JSON.stringify(j));
}
// map name in any letter case (vfs keys are lower case), with or without --exe
put('as2/resource/map/multi/1v1_hiek/combat.mi', mi(0, 0));
put('as2/mods/mx/resource/map/multi/1v1_hiek/combat.mi', mi(3, 0));
for (const ex of [[], ['--exe', 'mowas_2']]) {
  r = run('--game', G, '--mods', 'mx', '--map', 'multi/1v1_Hiek', ...ex);
  if (r.status !== 0 || count(r.stdout, 'MIS_DIFF_ENTITY_MOVED') !== 1) bad('mixed-case map name ' + ex.join(' ') + ': ' + r.status + r.stdout + r.stderr);
}
// only the map folder is walked: the same output as --whole-tree, and the seam hides the other folders below resource/
put('as2/mods/mx/resource/entity/big/x.def', '{x}\n');
put('as2/mods/mx/resource/map/multi/other/combat.mi', mi(1, 1));
for (const ex of [[], ['--exe', 'mowas_2']]) {
  const a1 = run('--game', G, '--mods', 'mx', '--map', 'm1', ...ex), a2 = run('--game', G, '--mods', 'mx', '--map', 'm1', '--whole-tree', ...ex);
  if (a1.stdout !== a2.stdout) bad('map-only walk differs from --whole-tree ' + ex.join(' ') + ':\n' + a1.stdout + '\n---\n' + a2.stdout);
}
{
  const sfs = require('../misdiff').mapOnlyFs('multi/m1'), ls = d => sfs.readdirSync(path.join(T, d)).map(s => s.toLowerCase()).sort().join(' ');
  if (ls('as2/mods/mx/resource') !== 'map') bad('seam at resource/: ' + ls('as2/mods/mx/resource'));
  if (ls('as2/mods/mx/resource/map/multi') !== 'm1') bad('seam at map/multi: ' + ls('as2/mods/mx/resource/map/multi'));
  if (ls('as2/mods') !== 'mx my') bad('seam above resource/ filtered: ' + ls('as2/mods'));
  if (ls('as2/mods/mx/resource/map/multi/m1') !== 'combat.mi') bad('seam inside the map: ' + ls('as2/mods/mx/resource/map/multi/m1'));
}
// a dropped --mods-a mod is said too (side a would silently be vanilla)
r = run('--game', G, '--mods', 'mx', '--mods-a', 'my', '--map', 'm1', '--exe', 'mowas_2');
if (!/mods-a.*WARN_MISDIFF_MOD_DROPPED/.test(r.stdout)) bad('--mods-a drop not said: ' + r.stdout);
// a map only a dropped mod holds: the error names the drop
put('as2/mods/my/resource/map/multi/m5/combat.mi', mi(0, 1));
r = run('--game', G, '--mods', 'my', '--map', 'm5', '--exe', 'mowas_2');
if (r.status !== 2 || !/no files.*my/.test(r.stderr + r.stdout)) bad('only-in-dropped-mod map: no reason given: ' + r.status + r.stdout + r.stderr);
r = run('--game', G, '--mods', 'mx', '--map', 'm1', '--exe', 'nosuch');
if (r.status !== 2) bad('bad --exe exit ' + r.status);

// ---- GoH install + a GoH mod folder outside it
const goh = path.join(T, 'goh'); fs.mkdirSync(path.join(goh, 'binaries/x64'), { recursive: true }); fs.writeFileSync(path.join(goh, 'binaries/x64/call_to_arms.exe'), '');
const bz = (x, p) => `{mission\n\t{Entity "flag_point_1" 0x802f\n\t\t{Position ${x} -23.1}\n\t\t{Extender "map_point"\n\t\t\t{name center1}\n\t\t\t{zone\n\t\t\t\t{radius 0}\n\t\t\t\t{zoneId "f1"}\n\t\t\t}\n\t\t\t{phase 0}\n\t\t\t{order 1}\n\t\t\t{show All}\n\t\t\t{visor MapPoint}\n\t\t}\n\t}\n\t{Tags "flag" 0x802f}\n\t{Helpers\n\t\t{zone "poly"\n\t\t\t{position -241.7 -10.5 0}\n\t\t\t{Name "f1"}\n\t\t\t{Point ${p} 0}\n\t\t\t{Point 0 ${p}}\n\t\t\t{Point -${p} 0}\n\t\t}\n\t}\n}\n`;
put('goh/resource/map/multi/g1/battle_zones.mi', bz(-267.64, 300));
put('goh/resource/map/multi/g1/battle_zones.info', ';SDL\n{game\n  {maxPlayers 2}\n}\n');
put('gmod/mod.info', '{mod\n\t{name "gm"}\n\t{minGameVersion "1.067"}\n\t{maxGameVersion "1.067"}\n}\n');
put('gmod/resource/map/multi/g1/battle_zones.mi', bz(-200, 400));
put('gmod/resource/map/multi/g1/battle_zones.info', ';SDL\n{game\n  {maxPlayers 4}\n}\n');
r = run('--game', goh, '--exe', 'goh', '--mod-dir', path.join(T, 'gmod'), '--map', 'g1');
if (r.status !== 0) bad('goh exit ' + r.status + ' ' + r.stdout + r.stderr);
for (const c of ['MIS_DIFF_ENTITY_MOVED', 'MIS_DIFF_ZONE_CHANGED', 'MIS_DIFF_MAPINFO_CHANGED']) if (!r.stdout.includes(c)) bad('goh lacks ' + c + ': ' + r.stdout);
if (!/zone f1 changed/.test(r.stdout)) bad('goh poly not keyed by its Name: ' + r.stdout);
if (/WARN_/.test(r.stdout)) bad('goh: a finding on a plain move: ' + r.stdout);
// a GoH map only in a sub-folder pak (resource/map/multi/pack.pak, keyed at its folder) of the game and of the mod folder, plus an
// unrelated deep folder in the mod: the map-only walk still mounts the paks, and gives the --whole-tree output
const { writeZip } = require('../../lib/zipwrite');
const crlf = s => Buffer.from(s.replace(/\r?\n/g, '\r\n'), 'latin1');
writeZip(path.join(goh, 'resource/map/multi/pack.pak'), [['g2/battle_zones.mi', crlf(bz(-10, 300))]]);
fs.mkdirSync(path.join(T, 'gmod/resource/map/multi'), { recursive: true });
writeZip(path.join(T, 'gmod/resource/map/multi/pack.pak'), [['g2/battle_zones.mi', crlf(bz(-20, 300))]]);
put('gmod/resource/entity/humanskin/deep/x.def', '{x}\n');
const g2 = ['--game', goh, '--exe', 'goh', '--mod-dir', path.join(T, 'gmod'), '--map', 'multi/G2'];
r = run(...g2);
if (r.status !== 0 || count(r.stdout, 'MIS_DIFF_ENTITY_MOVED') !== 1) bad('goh sub-folder pak map: ' + r.status + r.stdout + r.stderr);
if (run(...g2, '--whole-tree').stdout !== r.stdout) bad('goh map-only walk differs from --whole-tree');
// no mod and no --mod-dir: usage, exit 2
r = run('--game', goh, '--exe', 'goh', '--map', 'g1');
if (r.status !== 2) bad('no mod accepted, exit ' + r.status);

fs.rmSync(T, { recursive: true, force: true });
console.log(fails ? `FAIL ${fails}` : 'PASS');
process.exitCode = fails ? 1 : 0;

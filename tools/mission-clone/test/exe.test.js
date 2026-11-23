// mission-clone --exe: made-up installs in a temp folder, no real game. Run by run.sh; one line per failure, then PASS.
//   AS2 shared install (as64.exe present): base m1 combat, as64/core adds m1 battle_zones, mod mz ships m9 in a top-level pak,
//     mod mc (Classic range) ships m8 loose, mod me (3.301) ships m7 loose.
//   GoH install (binaries/x64/call_to_arms.exe): g1 loose (ammunition, battle_zones + <mode>.info, a zoneId flag), g2 only in a
//     sub-folder pak resource/map/multi/pack.pak (the form the own index misses: 58 of 224 real GoH maps).
// Author: Imperator_Aug (ARSENAL, ia-e6b11b85)
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), { spawnSync } = require('child_process');
const { writeZip } = require('../../lib/zipwrite');
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-exe-'));
let fails = 0;
const bad = m => { console.log('FAIL ' + m); fails++; };
const crlf = s => Buffer.from(s.replace(/\r?\n/g, '\r\n'), 'latin1');
const put = (rel, text) => { const f = path.join(T, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, typeof text === 'string' ? crlf(text) : text); };
const run = (...a) => spawnSync(process.execPath, [path.join(__dirname, '..', 'mission-clone.js'), ...a], { encoding: 'utf8' });
const rd = rel => { try { return fs.readFileSync(path.join(T, rel), 'latin1'); } catch { return null; } };
const spawn = (n, team, x) => `\t{Entity "map_point" 0x${n}\n\t\t{Position ${x} 0}\n\t\t{Extender "map_point"\n\t\t\t{name ${team}1}\n\t\t\t{team ${team}}\n\t\t\t{phase 0}\n\t\t\t{order 1}\n\t\t\t{visor SpawnPoint}\n\t\t}\n\t\t{Player 0}\n\t\t{MID ${n}}\n\t}\n`;
const combat = `{mission\n${spawn(1, 'a', 0)}${spawn(2, 'b', 100)}}\n`;
const set = '{game\n\t{settings\n\t\t{enableBots}\n\t}\n}\n';

// ---- AS2
put('as2/as64.exe', Buffer.alloc(0));
put('as2/resource/map/multi/m1/combat.mi', combat);
put('as2/resource/map/multi/m1/map.info', '{game\n\t{maxPlayers 2}\n}\n');
put('as2/as64/core/resource/map/multi/m1/battle_zones.mi', combat);
for (const m of ['combat', 'battle_zones']) put(`as2/resource/set/multiplayer/games/${m}.set`, set);
put('as2/mods/mz/mod.info', '{Mod\n\t{Name "mz"}\n\t{MinGameVersion "3.262.0"}\n\t{MaxGameVersion "3.262.1"}\n}\n');
fs.mkdirSync(path.join(T, 'as2/mods/mz/resource'), { recursive: true });
writeZip(path.join(T, 'as2/mods/mz/resource/map.pak'), [['map/multi/m9/combat.mi', crlf(combat)]]);
put('as2/mods/mc/mod.info', '{Mod\n\t{Name "mc"}\n\t{MinGameVersion "3.262.0"}\n\t{MaxGameVersion "3.262.1"}\n}\n');
put('as2/mods/mc/resource/map/multi/m8/combat.mi', combat);
put('as2/mods/me/mod.info', '{Mod\n\t{Name "me"}\n\t{MinGameVersion "3.301"}\n}\n');
put('as2/mods/me/resource/map/multi/m7/combat.mi', combat);
const A = path.join(T, 'as2');
const list = (...a) => { const r = run('--game', A, '--list', ...a); if (r.status !== 0) bad('list exit ' + r.status + r.stderr); return r.stdout.replace(/\r/g, ''); };
const own = list();
if (!/map\/multi\/m1: combat\n/.test(own) || !/m9: combat {2}\[mod: mz\]/.test(own)) bad('no --exe list changed: ' + own);
const l64 = list('--exe', 'as64');
if (!/map\/multi\/m1: battle_zones combat\n/.test(l64)) bad('--exe as64 lacks the as64/core mode: ' + l64);
const lmw = list('--exe', 'mowas_2');
if (!/map\/multi\/m1: combat\n/.test(lmw)) bad('--exe mowas_2 shows as64/core: ' + lmw);
if (!/m9: combat {2}\[mod: mz\]/.test(lmw)) bad('--exe mowas_2 lost the [mod: x] tag of an unlisted mod pak: ' + lmw);
if (list('--exe', 'mowas2') !== lmw) bad('--exe mowas2 differs from mowas_2');
// a listed (mounted) mod's map: shown, no [mod: x] tag (as the own index: the tag is for unlisted mods)
const lmc = list('--exe', 'mowas_2', '--mods', 'mc');
if (!/map\/multi\/m8: combat\n/.test(lmc)) bad('--mods mc (Classic) not mounted through the vfs, or tagged: ' + lmc);
if (list('--mods', 'mc').split('\n').find(l => /m8:/.test(l)) !== lmc.split('\n').find(l => /m8:/.test(l))) bad('listed mod line differs from the own index');
const rme = run('--game', A, '--list', '--exe', 'mowas_2', '--mods', 'me');
if (/m7:/.test(rme.stdout)) bad('mowas_2 mounted a 3.301 mod');
if (!/info: MC_MOD_DROPPED.*me/.test(rme.stderr)) bad('--list: dropped mod not said: ' + rme.stderr);
// mod.info follows the --exe game, not as64.exe in the folder
let r = run('--game', A, '--exe', 'mowas_2', '--out', path.join(T, 'o_mw'), '--map', 'map/multi/m1', '--from', 'combat', '--to', 'battle_zones', '--no-lint', '-q');
if (!/MinGameVersion "3.262.0"/.test(rd('o_mw/mod.info') || '')) bad('--exe mowas_2 mod.info not Classic: ' + rd('o_mw/mod.info') + r.stdout);
if (!/flag_point_1/.test(rd('o_mw/resource/map/multi/m1/battle_zones.mi') || '')) bad('--exe mowas_2 derive lost: ' + r.stdout);
r = run('--game', A, '--exe', 'as64', '--out', path.join(T, 'o_64'), '--map', 'map/multi/m1', '--from', 'combat', '--to', 'captureflag', '--no-lint', '--no-modinfo', '-q');
if (!/MC_NO_MODE_SET/.test(r.stdout)) bad('as64: captureflag.set missing not said');
r = run('--game', A, '--exe', 'nosuch', '--list');
if (r.status !== 2) bad('bad --exe exit ' + r.status);
r = run('--game', A, '--exe', 'mowas_2', '--target', 'goh', '--list');
if (r.status !== 2) bad('--target goh on AS2 accepted');
// the Maps route's form: --target <game id> --exe <vfs exe>
r = run('--game', A, '--target', 'mowas2', '--exe', 'mowas_2', '--out', path.join(T, 'o_tm'), '--map', 'map/multi/m1', '--from', 'combat', '--to', 'battle_zones', '--no-lint', '-q');
if (r.status !== 0 || !/MinGameVersion "3.262.0"/.test(rd('o_tm/mod.info') || '')) bad('--target mowas2 --exe mowas_2: ' + r.status + r.stdout + r.stderr + rd('o_tm/mod.info'));
r = run('--game', A, '--target', 'as64', '--exe', 'as64', '--out', path.join(T, 'o_ta'), '--map', 'map/multi/m1', '--from', 'combat', '--to', 'captureflag', '--no-lint', '-q');
if (!/MinGameVersion "3.301"/.test(rd('o_ta/mod.info') || '') || /MaxGameVersion/.test(rd('o_ta/mod.info') || '')) bad('--target as64 --exe as64: ' + rd('o_ta/mod.info'));
// --with-mode under mowas_2: the title goes through lng-add with the same --exe (its vanilla key check reads the mowas_2 view)
r = run('--game', A, '--exe', 'mowas_2', '--out', path.join(T, 'o_wm2'), '--map', 'map/multi/m1', '--from', 'combat', '--with-mode', 'cmx', '--title', 'CMX', '--no-lint', '-q');
if (r.status !== 0 || !/cmx/.test(rd('o_wm2/localization/#cmx.lng') || '') || /MC_LNG_FAIL/.test(r.stdout)) bad('--with-mode mowas_2 title: ' + r.status + r.stdout + r.stderr);
// the lng-add argument list, seen through a stand-in spawnSync (test/lngspy.js): --exe mowas_2 is handed on; as64 and no --exe keep
// the AS64 list (no --exe)
{
  const spy = path.join(T, 'lngspy.txt');
  const lngArgs = (dir, ...ex) => {
    try { fs.unlinkSync(spy); } catch { /* none yet */ }
    spawnSync(process.execPath, ['-r', path.join(__dirname, 'lngspy.js'), path.join(__dirname, '..', 'mission-clone.js'), '--game', A, ...ex, '--out', path.join(T, dir), '--map', 'map/multi/m1', '--from', 'combat', '--with-mode', 'cmy', '--title', 'CMY', '--no-lint', '-q'], { encoding: 'utf8', env: { ...process.env, MC_LNG_SPY: spy } });
    const ls = (rd('lngspy.txt') || '').split('\n').filter(Boolean).map(l => JSON.parse(l));
    return ls.length === 1 ? ls[0] : null;
  };
  const xOf = a => a && a.indexOf('--exe') >= 0 ? a[a.indexOf('--exe') + 1] : null;
  const amw = lngArgs('o_sp1', '--exe', 'mowas_2'), a64 = lngArgs('o_sp2', '--exe', 'as64'), a0 = lngArgs('o_sp3');
  if (!amw || xOf(amw) !== 'mowas_2' || amw[amw.indexOf('--game') + 1] !== A) bad('--with-mode mowas_2: lng-add not given --exe mowas_2: ' + JSON.stringify(amw));
  if (!a64 || xOf(a64) !== null) bad('--with-mode --exe as64: lng-add given --exe: ' + JSON.stringify(a64));
  if (!a0 || xOf(a0) !== null) bad('--with-mode, no --exe: lng-add given --exe: ' + JSON.stringify(a0));
}
// --target in any letter case names the game through lib/games (the old 'target === as64' test gave Classic for 'AS64')
r = run('--game', A, '--target', 'AS64', '--exe', 'as64', '--out', path.join(T, 'o_tcase64'), '--map', 'map/multi/m1', '--from', 'combat', '--to', 'captureflag', '--no-lint', '-q');
if (r.status !== 0 && r.status !== 1 || !/MinGameVersion "3.301"/.test(rd('o_tcase64/mod.info') || '')) bad('--target AS64: ' + r.status + r.stderr + rd('o_tcase64/mod.info'));
r = run('--game', A, '--target', 'mowas_2', '--out', path.join(T, 'o_tcasemw'), '--map', 'map/multi/m1', '--from', 'combat', '--to', 'captureflag', '--no-lint', '-q');
if (!/MinGameVersion "3.262.0"/.test(rd('o_tcasemw/mod.info') || '')) bad('--target mowas_2 (vfs exe form): ' + r.status + r.stderr + rd('o_tcasemw/mod.info'));
r = run('--game', A, '--target', 'nosuch', '--exe', 'as64', '--list');
if (r.status !== 2) bad('--target nosuch accepted, exit ' + r.status);

// ---- GoH
put('goh/binaries/x64/call_to_arms.exe', Buffer.alloc(0));
const gflag = `\t{Entity "flag_point_1" 0x802f\n\t\t{Position -267.64 -23.1}\n\t\t{Extender "map_point"\n\t\t\t{name center1}\n\t\t\t{zone\n\t\t\t\t{radius 0}\n\t\t\t\t{zoneId "f1"}\n\t\t\t}\n\t\t\t{phase 0}\n\t\t\t{order 1}\n\t\t\t{show All}\n\t\t\t{visor MapPoint}\n\t\t}\n\t}\n`;
const gbz = `{mission\n${gflag}${spawn(1, 'a', 0)}${spawn(2, 'b', 100)}\t{Tags "flag" 0x802f}\n\t{Helpers\n\t\t{zone "poly"\n\t\t\t{position -241.7 -10.5 0}\n\t\t\t{Name "f1"}\n\t\t\t{Point 300 0}\n\t\t\t{Point 0 300}\n\t\t\t{Point -300 0}\n\t\t}\n\t}\n}\n`;
const ginfo = ';SDL\n{game\n  {maxPlayers 2}\n}\n';
put('goh/resource/map/multi/g1/battle_zones.mi', gbz);
put('goh/resource/map/multi/g1/battle_zones.info', ginfo);
put('goh/resource/map/multi/g1/ammunition.mi', combat);
put('goh/resource/map/multi/g1/ammunition.info', ginfo);
writeZip(path.join(T, 'goh/resource/map/multi/pack.pak'), [['g2/battle_zones.mi', crlf(gbz)], ['g2/battle_zones.info', crlf(ginfo)]]);
for (const m of ['ammunition', 'frontlines']) put(`goh/resource/set/multiplayer/games/${m}.set`, set);
put('goh/resource/set/multiplayer/games/battle_zones.set', '{game\n\t{order 0}\n\t{settings\n\t\t{enableBots}\n\t}\n}\n');   // vanilla GoH form: own {order 0}
const H = path.join(T, 'goh');
r = run('--game', H, '--list');
if (/g2:/.test(r.stdout)) bad('fixture: the own index already sees the sub-folder pak');
r = run('--game', H, '--exe', 'goh', '--list');
const gl = r.stdout.replace(/\r/g, '');
if (!/map\/multi\/g1: ammunition battle_zones\n/.test(gl) || !/map\/multi\/g2: battle_zones\n/.test(gl)) bad('--exe goh list: ' + gl);
// --with-mode in the battle zones family: verbatim, GoH .info, .pot title, GoH range, no .lng, flags untouched
r = run('--game', H, '--exe', 'goh', '--out', path.join(T, 'o_g1'), '--map', 'map/multi/g2', '--from', 'battle_zones', '--with-mode', 'bzx', '--title', 'BZ "X"', '--game-version', '1.067,1.067');
if (r.status !== 0) bad('goh --with-mode exit ' + r.status + ' ' + r.stdout + r.stderr);
const mi = rd('o_g1/resource/map/multi/g2/bzx.mi');
if (mi !== gbz.replace(/\r?\n/g, '\r\n')) bad('goh bzx.mi not the source as is');
if (/zoneA/.test(mi || '')) bad('AS2 zoneA added on a GoH target');
const bset = rd('o_g1/resource/set/multiplayer/games/bzx.set') || '';
if (!/\{class battle_zones\}/.test(bset)) bad('goh bzx.set class');
if ((bset.match(/\{order /g) || []).length !== 1 || !/\{order 100\}/.test(bset)) bad('goh bzx.set wants one {order 100}: ' + bset);
if (rd('o_g1/resource/map/multi/g2/bzx.info') !== ginfo.replace(/\n/g, '\r\n')) bad('goh bzx.info not the battle_zones.info copy');
const pot = rd('o_g1/localizations/default/interface/text/mc_bzx.pot') || '';
if (!/msgctxt "mp\/game\/bzx"\nmsgid "BZ \\"X\\""\nmsgstr ""/.test(pot)) bad('goh .pot: ' + pot);
if (fs.existsSync(path.join(T, 'o_g1/localization'))) bad('goh wrote an AS2 .lng');
const info = rd('o_g1/mod.info') || '';
if (!/MinGameVersion "1.067"/.test(info) || !/MaxGameVersion "1.067"/.test(info)) bad('goh mod.info range: ' + info);
if (!/MC_LINT_SKIPPED/.test(r.stdout) || /MC_MILINT/.test(r.stdout)) bad('goh milint not skipped: ' + r.stdout);
// plain clone across GoH classes: verbatim + MC_NEEDS_MANUAL naming the GoH flag form; <to>.info written
r = run('--game', H, '--exe', 'goh', '--out', path.join(T, 'o_g2'), '--map', 'map/multi/g1', '--from', 'ammunition', '--to', 'frontlines', '--game-version', '1.067', '-q');
if (r.status !== 1 || !/MC_NEEDS_MANUAL.*zoneId/.test(r.stdout)) bad('goh ammunition->frontlines: ' + r.stdout);
if (rd('o_g2/resource/map/multi/g1/frontlines.mi') !== combat.replace(/\n/g, '\r\n')) bad('goh frontlines.mi not verbatim');
if (!rd('o_g2/resource/map/multi/g1/frontlines.info')) bad('goh frontlines.info not written');
// AS2 mode names refused on GoH
r = run('--game', H, '--exe', 'goh', '--out', path.join(T, 'o_g3'), '--map', 'map/multi/g1', '--from', 'battle_zones', '--to', 'combat', '-q');
if (r.status !== 2 || r.stderr.trim().split('\n').length !== 1 || !/^mission-clone: not available for GoH: MC_GOH_NO_MODE combat .*use battle_zones or frontlines/.test(r.stderr) || /MC_NO_MODE_SET/.test(r.stdout + r.stderr)) bad('goh combat not refused in one line: ' + r.status + r.stdout + r.stderr);
if (fs.existsSync(path.join(T, 'o_g3'))) bad('goh combat wrote');
// no GoH version and none given: said, no mod.info
r = run('--game', H, '--exe', 'goh', '--out', path.join(T, 'o_g4'), '--map', 'map/multi/g2', '--from', 'battle_zones', '--with-mode', 'bzy', '-q');
if (!/MC_MODINFO_NO_VERSION/.test(r.stdout) || fs.existsSync(path.join(T, 'o_g4/mod.info'))) bad('goh no version: ' + r.stdout);
// refusals: AS2 target, --src, --obs-fix, --out inside the GoH install
r = run('--game', H, '--exe', 'goh', '--target', 'as64', '--list');
if (r.status !== 2) bad('--exe goh --target as64 accepted');
r = run('--game', H, '--exe', 'goh', '--target', 'GOH', '--list');
if (r.status !== 0) bad('--exe goh --target GOH (any letter case) refused: ' + r.status + r.stderr);
r = run('--game', H, '--exe', 'goh', '--src', H, '--list');
if (r.status !== 2 || !/mission-clone: --src is for AS2 targets/.test(r.stderr)) bad('--exe goh --src: ' + r.status + r.stderr);
r = run('--game', H, '--exe', 'goh', '--out', path.join(T, 'o_g5'), '--obs-fix');
if (r.status !== 2 || !/not available for GoH/.test(r.stderr)) bad('--exe goh --obs-fix: ' + r.stderr);
r = run('--game', H, '--exe', 'goh', '--out', path.join(H, 'resource', 'x'), '--map', 'map/multi/g1', '--from', 'battle_zones', '--to', 'ammunition');
if (r.status !== 2 || fs.existsSync(path.join(H, 'resource', 'x'))) bad('--out in the GoH game files not refused: ' + r.status + r.stdout + r.stderr);

if (!process.env.KEEP) fs.rmSync(T, { recursive: true, force: true }); else console.log(T);
console.log(fails ? `FAIL ${fails}` : 'PASS');
process.exitCode = fails ? 1 : 0;

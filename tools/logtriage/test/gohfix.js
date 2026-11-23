// logtriage GoH fixture: a made-up Gates of Hell game.log in the form of a vanilla one (every line "[hh:mm:ss] ", GHLOG-07;
// mount and mod lines, GHLOG-16; "(file.cpp:line) @ [thread]" errors, GHLOG-09; a 0x0bad000N code, GHLOG-10).
// writes $TEST_WORK/goh/la/digitalmindsoft/gates of hell/log/game.log (a fake LOCALAPPDATA user dir) + goh/mod + goh/truth.txt
// truth.txt = "game.log:<line> <CODE>" of every finding, sorted (diffed by run.sh)
// Author: Imperator_Aug (ARSENAL, ia-e160df1c)
const fs = require('fs'), path = require('path');
const root = path.join(process.env.TEST_WORK || __dirname, 'goh');
fs.rmSync(root, { recursive: true, force: true });
const logDir = path.join(root, 'la', 'digitalmindsoft', 'gates of hell', 'log');
fs.mkdirSync(logDir, { recursive: true });
const truth = [];
let t = 0;
const st = () => { const s = Math.floor(t++ / 4); return '[00:' + String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0') + '] '; };
const L = [
  'Found module [steam_api64.dll] at X:\\fixture\\binaries\\x64\\steam_api64.dll',
  'Steam Application ID: 400750',
  '',
  'Scanning mods in x:/fixture/mods/',
  ['Warning: invalid mod folder name "bad mod"!', 'LOG_MOD_LOAD'],
  'Found 3 available mods',
  'Mount package x:/fixture/resource/gamelogic.pak with 8969 entries',
  'Mount package x:/fixture/resource/entity/entity.pak with 2919 entries',
  'Launch information:',
  'CMD: "X:/fixture/binaries/x64/call_to_arms.exe"',
  'Attempting to synchronize profiles...',
  'SyncFile c:/fixture/profiles/1/keys.set. Local=11.04 18:37:56 Remote=11.04 18:37:56',
  'Result is : skip',
  'Sync Done.',
  '!!! WARNING: Skipping broken shader cache file //shader_cache/dx11.0/06e8.hso (eRenderShader.cpp:84) @ [main_loop]',
  'Build: 2026.09.23 14:05 - x64 - fixture - 0x0',
  'Product: CALL TO ARMS - GATES OF HELL - v1.067.0 - standard x64',
  'GUI: Initialize page manager ',
  'Mod: applying mods',
  'Mod: disable mod other_mod',
  'Mod: applying new mods',
  'Mod: activate mod fixmod',
  'Phase <c(cec7c3)f(roboto_mono)>Loading... took 1439.2ms.',
  ['No Stuff found for tags \'bullet75_ita cu\' (may lead to crash) (/set/stuff/ammo/x.set, 12)', 'LOG_NO_STUFF'],
  'No Stuff found for tags \'bullet75_ita cu\' (may lead to crash) (/set/stuff/ammo/x.set, 12)',
  ['Resource not found - /entity/x/tank.mdl (eiorepository.cpp:242) @ [main_loop]', 'LOG_MISSING_FILE'],
  ['Resource not found - /entity/x/gone.mdl (eiorepository.cpp:242) @ [main_loop]', 'LOG_MISSING_FILE'],
  'GUI: Show page page_main with mods [ 5 unique]',
  '[EVT] Tiger killed Sherman with 88mm',
  'Incorrect color definition: ff36d30 (eRGBAColor.cpp:128) @ [main_loop]',
  'Incorrect color definition: ff36d30 (eRGBAColor.cpp:128) @ [render_scene]',
  'Something brand new happened (/set/x.set, 3)',
  'GameThreadStart',
  '[LUA] Print: fixture bot ready',
  '[LUA] DBG: SpawnUnit single_rifle(fin) player#2',
  'dbg: player#2 spawned single_rifle(fin) with cost 10. budget 221.007->211.007. totalAdd: 1.00732, totalSpent: 10',
  ['Fatal: LogError 0x0bad0007 (render device lost)', 'LOG_CRASH'],
];
const text = L.map((l, i) => { if (Array.isArray(l)) { truth.push('game.log:' + (i + 1) + ' ' + l[1]); l = l[0]; } return st() + l; });
fs.writeFileSync(path.join(logDir, 'game.log'), text.join('\r\n') + '\r\n', 'latin1');
fs.mkdirSync(path.join(root, 'mod', 'resource', 'entity', 'x'), { recursive: true });
fs.writeFileSync(path.join(root, 'mod', 'resource', 'entity', 'x', 'tank.mdl'), '{model}\r\n');
fs.writeFileSync(path.join(root, 'truth.txt'), truth.sort().join('\n') + '\n');

// logtriage fixture: fixture/log (game.log, game.prev.log, minidumps/, oos/) + fixture/mod + truth.md
// log() builds a log file: line = text | [text, CODE...] -> truth "rel:line: CODE" (line = first occurrence of a collapsed group)
// Author: Imperator_Aug (ARSENAL, ia-5e949f28)
const fs = require('fs'), path = require('path');
const dir = path.join(process.env.TEST_WORK || __dirname, 'fixture');
fs.rmSync(dir, { recursive: true, force: true });
const truth = ['# file:line: CODE (seeded defects; diffed by run.sh)'];
function put(rel, lines, root = 'log', mtime) {
  const f = path.join(dir, root, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const text = lines.map((l, i) => {
    if (Array.isArray(l)) { for (const c of l.slice(1)) truth.push(`${rel}:${i + 1}: ${c}`); return l[0]; }
    return l;
  });
  fs.writeFileSync(f, text.join('\r\n') + '\r\n', 'latin1');
  if (mtime) fs.utimesSync(f, mtime, mtime);
}
const CRASH = (fn, src, addr) => ['', '***************** Exception *****************', 'Program will be terminated.',
  'EXCEPTION_ACCESS_VIOLATION read at 0x' + addr, '', `At as64.exe+0xb7e17f (${fn}+0x6ff, ${src}) [quant]`,
  'RAX=0000058147266680\tRBX=000005814ef7ab90', '>>>>>> eQuantExecutor:Execute', '> scene:quant:actor:wpn', '', 'Call stack:', '  #00 as64.exe+0x1 (' + fn + '+0x6ff, ' + src + ')'];
const HEAD = ['Steam initialized successfuly! ', 'CWD: f:/fixture', 'CMD: "F:\\Fixture\\as64.exe" ',
  '[00:00:07] Localization key redefinition: interface/ok in /interface/text/#editor.lng (/interface/text/#editor.lng, 123)',
  'Attempting to synchronize profiles...', 'SyncFile c:/users/x/profile/keys.set. Local=11.03 12:06:29 Remote=11.03 12:06:29', 'Result is : skip', 'Sync Done.',
  'Build: 2026.11.03 13:15 - 0xB269EC8B', 'Product: Men of War: Assault Squad 2 - v3.265.1x64 - standard', 'Repository: 138266 resources'];

// ---- mod folder: supplies one of the missing paths
put('resource/entity/x/tank.mdl', ['{model}'], 'mod');

// ---- game.log: warnings + fatal define-not-found at end
put('game.log', [...HEAD,
  "Mod 'fixmod' from mods/fixmod/",
  "Mod 'wsmod' from mods/wsmod/ is an old copy of a Workshop item, which is loaded instead: safe to delete",
  "Mod 'wsmod' from mods/wsmod/ is an old copy of a Workshop item, which is loaded instead: safe to delete",
  ["Mod 'legacy1' made for legacy mode: not applied", 'LOG_MOD_MODE'],
  '[00:00:12] [LUA] PROBE: bot lua loaded',
  '[LUA] DBG: tick 5',
  '[00:00:13] [LUA] DBG: tick 6',
  '[LUA] bot spawned squad 3',
  ['[00:00:16] No Stuff found for tags \'bullet75_ita cu\' (may lead to crash) (/set/stuff/ammo/x.set, 12)', 'LOG_NO_STUFF'],
  '[00:00:16] No Stuff found for tags \'bullet75_ita cu\' (may lead to crash) (/set/stuff/ammo/x.set, 12)',
  ['[00:00:16] invalid level param "275%" (/set/breed/y.set, 40)', 'LOG_LEVEL_PARAM'],
  ['[00:00:16] Unknown control panel item : "mine_big" (, 487) @ [main_loop]', 'LOG_PANEL_ITEM'],
  '[00:00:16] Unknown control panel item : "trench_long" (, 487) @ [main_loop]',
  '[00:00:16] MediaManager: can\'t open MSS media stream for file "/music/main_theme.mp3" (, 88) @ [main_loop]',
  '[00:00:16] No active entity! (, 482) @ [main_loop]',
  ['[00:00:16] Resource not found - /entity/x/tank.mdl (, 242) @ [main_loop]', 'LOG_MISSING_FILE'],
  ['[00:00:17] Resource not found - /entity/x/gone.mdl (, 242) @ [main_loop]', 'LOG_MISSING_FILE'],
  ['[00:00:17] Bone gun_rot not found in tank_a (, 310) @ [main_loop]', 'LOG_WARN'],
  ['[00:00:17] Can\'t preload the \'mp/ger/001\' entity (, 316) @ [main_loop]', 'LOG_WARN'],
  ['[00:00:17] unknown sound file \'weapon/reload/reload.smg\' (, 432) @ [quant]', 'LOG_MISSING_FILE'],
  "[00:00:17] Mission '/map/multi/a/test.mi' is skipped - game type(test) is undefined (, 267)",
  "[00:00:17] Mission '/map/multi/a/test.mi' is skipped - game type(test) is undefined (, 267)",
  '[00:00:17] Automatic MIP generation not supported. Bitmap: \'/a\' (/a.mtl, 4)',
  '[00:00:18] Something brand new happened (/set/x.set, 3)',
  'Phase Loading... took 3810.92ms.',
  'Phase Mounting mod resources from Steam Workshop... took 622.941ms.',
  'Opening main page',
  ...CRASH('x', 'x.cpp:1', '0').slice(0, 0),
  '',
  '***************** Exception *****************',
  ['define not found (name "gun_x") (, 98) @ [main_loop]'],
  '------------------------------------------------------------------',
  '>> mp.core.update',
  '> file "//fixmod/resource/set/stuff/x.set"',
  '3:\t{gun_x 1}', '',
  'Call stack (full):',
  '  #00 KERNELBASE.dll+0x25369 (RaiseException+0x69)',
  '  #01 as64.exe+0x10fb0b (RaiseAppError+0x5b)',
  '  #02 as64.exe+0x10ccf6 (LogError+0x6b6)',
  '  #03 as64.exe+0x829c66 (+0x236)',
  '',
  ['***************** Exception *****************', 'LOG_FALLBACK_FONT'],
  'Unable to determine fallback font (, 102) @ [main_loop]',
  '----', '>> startup', '',
  'Call stack (full):', '  #03 as64.exe+0x1 (+0x2)',
]);
// the define line is the exception header: truth must point at the "***** Exception" line
{ const g = fs.readFileSync(path.join(dir, 'log/game.log'), 'latin1').split(/\r\n/); const i = g.findIndex(l => /Exception \*/.test(l)); truth.push(`game.log:${i + 1}: LOG_SCRIPT_ERROR`); }

put('game.prev.log', [...HEAD.slice(0, 8).map(l => l.replace('as64.exe', 'mowas_2.exe')), 'Repository: 140000 resources',
  '',
  ['***************** Exception *****************', 'LOG_MOD_INFO_ERROR'],
  'Block terminator expected! (, 459) @ [main_loop]',
  '----', '>> startup', '> file "//mods/x/mod.info"', '3:	{name "x"', '',
  'Call stack (full):', '  #03 as64.exe+0x1 (+0x2)',
  '',
  ['[00:00:16] Invalid ricochet angle (, 94) @ [main_loop]', 'LOG_WARN'],
  'Phase Loading... took 2504.37ms.']);

// ---- second log dir: mowas_2 launch, no game.prev.log (LOG-19)
put('game.log', ['CMD: "F:\\Fixture\\mowas_2.exe" ', 'Build: x', '[00:00:01] [LUA] PROBE: second'], 'log2');

// ---- minidumps: sidecars differ from game.log; newest three listed
const t0 = Date.now() / 1000;
for (const [n, mt, body] of [
  ['2026.11.01_01.00_t1_v3265000.crash.mdmp', t0 - 100, null],
  ['2026.10.30_02.33_t2_v3265000.crash.mdmp', t0 - 200, null],
]) {
  const f = path.join(dir, 'log/minidumps', n);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, 'MDMP');
  fs.utimesSync(f, mt, mt);
}
put('minidumps/2026.11.01_01.00_t1_v3265000.crash.mdmp.log', [...HEAD,
  '[00:01:00] No Stuff found for tags \'x\' (may lead to crash) (/set/stuff/y.set, 1)',
  ...CRASH('', '', '0000000000000028').map((l, i) => i === 1 ? ['***************** Exception *****************', 'LOG_CRASH'] : l)]);
put('minidumps/2026.10.30_02.33_t2_v3265000.crash.mdmp.log', [...HEAD,
  '',
  ['***************** Exception *****************', 'LOG_ERROR_MSG'],
  'Zero speed in ik-bone "arm" (, 441) @ [main_loop]',
  '----', '> file "/entity/z.def"', '',
  'Call stack (full):', '  #02 as64.exe+0x10ccf6 (LogError+0x6b6)', '  #03 as64.exe+0x1 (+0x2)']);
// the sidecar crash truth line must follow the CRASH() offset: recompute below
{
  const fix = (rel, code) => {
    const g = fs.readFileSync(path.join(dir, 'log', rel), 'latin1').split(/\r\n/); const i = g.findIndex(l => /Exception \*/.test(l));
    return `${rel}:${i + 1}: ${code}`;
  };
  // drop wrongly computed entries for these two sidecars, then add exact ones
  for (let i = truth.length - 1; i >= 0; i--) if (/^minidumps\//.test(truth[i])) truth.splice(i, 1);
  truth.push(fix('minidumps/2026.11.01_01.00_t1_v3265000.crash.mdmp.log', 'LOG_CRASH'));
  truth.push(fix('minidumps/2026.10.30_02.33_t2_v3265000.crash.mdmp.log', 'LOG_ERROR_MSG'));
}

// ---- oos: one scene divergence (host+client), one with differing game versions
const oosFile = (hid, ver, m, crc, crc2) => ['hid:' + hid + ' , name:p' + hid, `[28.10.2026 21.49], v.${ver}, battle_zones:multi/4v4_x:battle_zones, m:${m}, q:170080`,
  '######## SNAPSHOT BEGIN ########', `crc:${crc} , crc2:${crc2} , quant:169711`, '######## SNAPSHOT END ########'];
put('oos/28.10.2026 21.49/2', oosFile(2, '3.262.1', 1, 111, 222));
put('oos/28.10.2026 21.49/9', oosFile(9, '3.262.1', 0, 333, 222));
put('oos/29.10.2026 00.04/3', oosFile(3, '3.262.1', 1, 111, 222));
put('oos/29.10.2026 00.04/5', oosFile(5, '3.265.1', 0, 333, 444));
truth.push('oos/28.10.2026 21.49: LOG_OOS', 'oos/29.10.2026 00.04: LOG_OOS', 'oos/29.10.2026 00.04: LOG_OOS_VERSION');

fs.writeFileSync(path.join(process.env.TEST_WORK || __dirname, 'truth.md'), truth.join('\n') + '\n');

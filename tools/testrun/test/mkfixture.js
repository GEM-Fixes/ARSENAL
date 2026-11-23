// testrun fixture: fixture/log with a small game.log (+ prev, minidumps/x.txt) so archive + triage have something to read
// Author: Imperator_Aug (ARSENAL, ia-dcaeae93)
const fs = require('fs'), path = require('path');
const dir = path.join(process.env.TEST_WORK || __dirname, 'fixture');
fs.rmSync(dir, { recursive: true, force: true });
const log = path.join(dir, 'log');
fs.mkdirSync(path.join(log, 'minidumps'), { recursive: true });
fs.writeFileSync(path.join(log, 'game.log'), ['[00:00:01] Start', '[00:00:02] No Stuff found for tags "x"', '[00:00:03] GameThreadStop'].join('\r\n') + '\r\n');
fs.writeFileSync(path.join(log, 'game.prev.log'), '[00:00:01] old run\r\n');
// log2: a launch that died on a bad mod.info (live run 2026-11-03), CMD without -control
const log2 = path.join(dir, 'log2');
fs.mkdirSync(log2, { recursive: true });
fs.writeFileSync(path.join(log2, 'game.log'), ['Steam initialized successfuly! ', 'CWD: f:/fixture', 'CMD: "F:\\Fixture\\as64.exe" -nosound ', '[00:00:01] Start', '',
  '***************** Exception *****************', 'Block terminator expected! (, 459) @ [main_loop]', '------------------------------------------------------------------',
  '> file "//mods/x/mod.info"', '3:\tDesc "bad "quote"', '', 'Call stack (full):', '  #00 KERNELBASE.dll+0x25369 (RaiseException+0x69)'].join('\r\n') + '\r\n');
// log3: same exception on a non-mod resource, CMD with -control (no hint, no control warning)
const log3 = path.join(dir, 'log3');
fs.mkdirSync(log3, { recursive: true });
fs.writeFileSync(path.join(log3, 'game.log'), ['CMD: "F:\\Fixture\\as64.exe" -control -nosound ', '***************** Exception *****************',
  'define not found (name "gun_x") (, 98) @ [main_loop]', '> file "//m/resource/set/stuff/x.set"', 'Call stack (full):'].join('\r\n') + '\r\n');
fs.writeFileSync(path.join(log, 'minidumps', 'old.txt'), 'dump\n');

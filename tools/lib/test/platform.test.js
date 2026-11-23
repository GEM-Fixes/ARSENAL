// platform.test: tools/lib/platform.js for win32, darwin and linux through the injected seams,
// plus one real processList() on Windows. Run: node tools/lib/test/platform.test.js
// Author: Imperator_Aug (ARSENAL, ia-a6ed9037)
'use strict';
const assert = require('assert'), path = require('path');
const P = require('../platform');
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.deepStrictEqual(a, b, m); n++; };

// a spawnSync-like fake that records calls and answers from a table
function fake(answer) {
  const calls = [];
  const spawn = (file, args, o) => { calls.push({ file, args, o }); return typeof answer === 'function' ? answer(file, args) : (answer || { status: 0, stdout: '' }); };
  return { spawn, calls };
}
const W = { platform: 'win32', env: { LOCALAPPDATA: 'C:\\Users\\u\\AppData\\Local', PATH: 'x' }, home: 'C:\\Users\\u' };
const M = { platform: 'darwin', env: {}, home: '/Users/u' };
const L = { platform: 'linux', env: {}, home: '/home/u' };
const w = s => Object.assign({}, W, s), m = s => Object.assign({}, M, s), l = s => Object.assign({}, L, s);

// isWin / isMac / isLinux / name
ok(P.isWin(W) && !P.isMac(W) && !P.isLinux(W), 'isWin');
ok(P.isMac(M) && !P.isWin(M) && !P.isLinux(M), 'isMac');
ok(P.isLinux(L) && !P.isWin(L) && !P.isMac(L), 'isLinux');
eq([P.name(W), P.name(M), P.name(L), P.name({ platform: 'freebsd' })], ['Windows', 'macOS', 'Linux', 'freebsd'], 'name');
eq(P.isWin(), process.platform === 'win32', 'default platform');

// openUrl
{
  let f = fake(); let r = P.openUrl('http://127.0.0.1:5000/?a=1&b=2', w({ spawn: f.spawn }));
  ok(r.ok && f.calls[0].file === 'cmd', 'win openUrl via cmd');
  eq(f.calls[0].args, ['/d', '/s', '/c', 'start "" "http://127.0.0.1:5000/?a=1&b=2"'], 'win openUrl quotes the URL');
  ok(f.calls[0].o.shell === false && f.calls[0].o.windowsVerbatimArguments === true, 'win openUrl no shell option, verbatim');
  f = fake(); r = P.openUrl('http://x/%PATH%', w({ spawn: f.spawn }));
  ok(!r.ok && f.calls.length === 0, 'win openUrl refuses %VAR% of a defined variable');
  f = fake(); r = P.openUrl('http://x/a"b', w({ spawn: f.spawn }));
  ok(!r.ok && f.calls.length === 0, 'win openUrl refuses a quote');
  f = fake(); r = P.openUrl('http://x/%20y', w({ spawn: f.spawn }));
  ok(r.ok, 'win openUrl keeps percent-encoding');
  f = fake(); r = P.openUrl('https://example.org/p', m({ spawn: f.spawn }));
  ok(r.ok && f.calls[0].file === 'open', 'mac openUrl');
  eq(f.calls[0].args, ['https://example.org/p'], 'mac openUrl argv');
  f = fake(); r = P.openUrl('file:///home/u/a.pdf', l({ spawn: f.spawn }));
  ok(r.ok && f.calls[0].file === 'xdg-open', 'linux openUrl');
  eq(r.cmd, ['xdg-open', 'file:///home/u/a.pdf'], 'linux openUrl cmd');
  for (const bad of ['javascript:alert(1)', 'ftp://x/y', 'not a url', 'C:\\a.txt'])
    for (const o of [W, M, L]) { f = fake(); r = P.openUrl(bad, Object.assign({}, o, { spawn: f.spawn })); ok(!r.ok && f.calls.length === 0, 'refuses ' + bad + ' on ' + o.platform); }
  f = fake({ status: null, error: new Error('ENOENT') }); r = P.openUrl('http://x/', l({ spawn: f.spawn }));
  ok(!r.ok, 'missing xdg-open -> ok false, no throw');
}

// openPath / revealInFolder
{
  let f = fake(); let r = P.openPath('C:\\m\\a b.pdf', w({ spawn: f.spawn }));
  eq(r, { ok: true, cmd: ['explorer.exe', 'C:\\m\\a b.pdf'] }, 'win openPath');
  f = fake(); r = P.openPath('/Users/u/a.pdf', m({ spawn: f.spawn })); eq(r.cmd, ['open', '/Users/u/a.pdf'], 'mac openPath');
  f = fake(); r = P.openPath('/home/u/a.pdf', l({ spawn: f.spawn })); eq(r.cmd, ['xdg-open', '/home/u/a.pdf'], 'linux openPath');
  f = fake(); r = P.revealInFolder('C:\\m\\x.def', w({ spawn: f.spawn })); eq(r.cmd, ['explorer.exe', '/select,C:\\m\\x.def'], 'win reveal');
  f = fake(); r = P.revealInFolder('/Users/u/m/x.def', m({ spawn: f.spawn })); eq(r.cmd, ['open', '-R', '/Users/u/m/x.def'], 'mac reveal');
  f = fake(); r = P.revealInFolder('/home/u/m/x.def', l({ spawn: f.spawn })); eq(r.cmd, ['xdg-open', '/home/u/m'], 'linux reveal opens the parent');
  f = fake(); r = P.revealInFolder('C:\\m\\x.def', l({ spawn: f.spawn })); eq(r.cmd, ['xdg-open', 'C:\\m'], 'linux reveal of a drive-letter path opens its folder, not .');
  ok(f.calls[0].o.shell === false, 'argv, no shell');
}

// processList / isRunning / killPid
{
  const TL = '"System Idle Process","0","Services","0","8 K"\r\n"as64.exe","4242","Console","1","900,000 K"\r\n"node.exe","77","Console","1","50,000 K"\r\n';
  let f = fake({ status: 0, stdout: TL });
  eq(P.processList(w({ spawn: f.spawn })), [{ name: 'System Idle Process', pid: 0 }, { name: 'as64.exe', pid: 4242 }, { name: 'node.exe', pid: 77 }], 'win processList');
  eq([f.calls[0].file, f.calls[0].args], ['tasklist', ['/fo', 'csv', '/nh']], 'win processList cmd');
  ok(P.isRunning('AS64.EXE', w({ spawn: fake({ status: 0, stdout: TL }).spawn })) === true, 'win isRunning ignores case');
  ok(P.isRunning(/mowas_2\.exe|as64\.exe/i, w({ spawn: fake({ status: 0, stdout: TL }).spawn })) === true, 'isRunning regexp');
  ok(P.isRunning('mowas_2.exe', w({ spawn: fake({ status: 0, stdout: TL }).spawn })) === false, 'win isRunning false');
  ok(P.isRunning('x', w({ spawn: fake({ status: 1, stdout: '' }).spawn })) === null, 'failed list -> null');
  ok(P.processList(w({ spawn: fake({ error: new Error('ENOENT') }).spawn })) === null, 'spawn error -> null');
  ok(P.processList(w({ spawn: () => { throw new Error('boom'); } })) === null, 'spawn throw -> null');
  const PSM = '    1 /sbin/launchd\n  501 /Applications/Steam.app/Contents/MacOS/steam_osx\n';
  f = fake({ status: 0, stdout: PSM });
  eq(P.processList(m({ spawn: f.spawn })), [{ name: 'launchd', pid: 1 }, { name: 'steam_osx', pid: 501 }], 'mac processList');
  eq([f.calls[0].file, f.calls[0].args], ['ps', ['-A', '-o', 'pid=,comm=']], 'mac processList cmd');
  const PSL = '    1 systemd\n 9001 call_to_arms.ex\n 9002 Mowas_2.exe\n';
  ok(P.isRunning('call_to_arms.exe', l({ spawn: fake({ status: 0, stdout: PSL }).spawn })) === true, 'linux 15-char comm');
  ok(P.isRunning('mowas_2.exe', l({ spawn: fake({ status: 0, stdout: PSL }).spawn })) === true, 'linux isRunning');
  ok(P.isRunning('as64.exe', l({ spawn: fake({ status: 0, stdout: PSL }).spawn })) === false, 'linux isRunning false');

  // commandLines
  f = fake({ status: 0, stdout: '[{"ProcessId":4242,"Name":"as64.exe","CommandLine":"\\"F:\\\\g\\\\as64.exe\\" -instance 2"},{"ProcessId":5,"Name":"x.exe","CommandLine":null}]' });
  eq(P.commandLines(w({ spawn: f.spawn })), [{ pid: 4242, name: 'as64.exe', cmd: '"F:\\g\\as64.exe" -instance 2' }, { pid: 5, name: 'x.exe', cmd: null }], 'win commandLines');
  ok(f.calls[0].file === 'powershell' && f.calls[0].o.shell === false, 'win commandLines via powershell argv');
  f = fake({ status: 0, stdout: '{"ProcessId":7,"Name":"a.exe","CommandLine":"a.exe"}' });
  eq(P.commandLines(w({ spawn: f.spawn })).length, 1, 'win commandLines single object');
  ok(P.commandLines(w({ spawn: fake({ status: 1 }).spawn })) === null, 'win commandLines failure -> null');
  const PSA = '    1 /sbin/init splash\n 9001 Z:\\home\\u\\.steam\\steamapps\\common\\Men of War Assault Squad 2\\as64.exe -instance 3\n  12 /usr/bin/bash -l\n';
  f = fake({ status: 0, stdout: PSA });
  eq(P.commandLines(l({ spawn: f.spawn })), [
    { pid: 1, name: 'init', cmd: '/sbin/init splash' },
    { pid: 9001, name: 'as64.exe', cmd: 'Z:\\home\\u\\.steam\\steamapps\\common\\Men of War Assault Squad 2\\as64.exe -instance 3' },
    { pid: 12, name: 'bash', cmd: '/usr/bin/bash -l' }], 'linux commandLines (Proton exe path with spaces)');
  eq([f.calls[0].file, f.calls[0].args], ['ps', ['-A', '-o', 'pid=,args=']], 'linux commandLines cmd');
  ok(P.commandLines(m({ spawn: fake({ error: new Error('ENOENT') }).spawn })) === null, 'mac commandLines failure -> null');

  f = fake(); eq(P.killPid(4242, w({ spawn: f.spawn })), { ok: true, cmd: ['taskkill', '/PID', '4242', '/T', '/F'] }, 'win killPid');
  f = fake(); eq(P.killPid('17', m({ spawn: f.spawn })).cmd, ['kill', '-KILL', '17'], 'mac killPid');
  f = fake(); eq(P.killPid(17, l({ spawn: f.spawn })).cmd, ['kill', '-KILL', '17'], 'linux killPid');
  f = fake({ status: 128 }); ok(P.killPid(17, w({ spawn: f.spawn })).ok === false, 'killPid status -> ok false');
  for (const bad of [0, -1, 'x; rm -rf /', 1.5, null]) { f = fake(); ok(!P.killPid(bad, l({ spawn: f.spawn })).ok && f.calls.length === 0, 'killPid refuses ' + bad); }
}

// dataDir / configDir / cacheDir
{
  eq([P.dataDir(W), P.configDir(W), P.cacheDir(W)], ['C:\\Users\\u\\AppData\\Local\\ARSENAL', 'C:\\Users\\u\\AppData\\Local\\ARSENAL', 'C:\\Users\\u\\AppData\\Local\\ARSENAL\\cache'], 'win dirs');
  eq(P.dataDir(w({ env: {} })), 'C:\\Users\\u\\.arsenal', 'win without LOCALAPPDATA: ~\\.arsenal as before');
  eq([P.dataDir(M), P.configDir(M), P.cacheDir(M)], ['/Users/u/Library/Application Support/ARSENAL', '/Users/u/Library/Application Support/ARSENAL', '/Users/u/Library/Caches/ARSENAL'], 'mac dirs');
  eq([P.dataDir(L), P.configDir(L), P.cacheDir(L)], ['/home/u/.local/share/arsenal', '/home/u/.config/arsenal', '/home/u/.cache/arsenal'], 'linux dirs');
  const X = l({ env: { XDG_DATA_HOME: '/x/d', XDG_CONFIG_HOME: '/x/c', XDG_CACHE_HOME: '/x/k' } });
  eq([P.dataDir(X), P.configDir(X), P.cacheDir(X)], ['/x/d/arsenal', '/x/c/arsenal', '/x/k/arsenal'], 'linux XDG');
  eq(P.dataDir(l({ env: { XDG_DATA_HOME: 'rel/d' } })), '/home/u/.local/share/arsenal', 'relative XDG ignored');
}

// unsupported / requireWin
{
  const e = P.unsupported('starting the game', L);
  ok(e instanceof Error && e.code === 'PLATFORM_UNSUPPORTED', 'unsupported code');
  eq(e.message, 'Starting the game works on Windows only, not on Linux.', 'unsupported sentence');
  eq(P.unsupported('the test pipe', M).message, 'The test pipe works on Windows only, not on macOS.', 'unsupported mac');
  let code = null, said = [];
  ok(P.requireWin('x', w({ exit: c => { code = c; }, log: s => said.push(s) })) === true && code === null && !said.length, 'requireWin on Windows passes');
  ok(P.requireWin('reading game memory', l({ exit: c => { code = c; }, log: s => said.push(s) })) === false && code === 2, 'requireWin exits 2');
  eq(said, ['Reading game memory works on Windows only, not on Linux.'], 'requireWin prints the sentence');
}

// the real thing on this machine
if (process.platform === 'win32') {
  const list = P.processList();
  ok(Array.isArray(list) && list.length > 3 && list.some(p => p.pid === process.pid && /node/i.test(p.name)), 'real processList sees this node');
  ok(P.isRunning(list.find(p => p.pid === process.pid).name) === true, 'real isRunning');
  ok(path.isAbsolute(P.dataDir()), 'real dataDir absolute');
}
console.log('platform: ' + n + ' checks passed');

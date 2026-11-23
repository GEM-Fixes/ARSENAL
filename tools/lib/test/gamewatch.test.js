// gamewatch: stub processes for each outcome. Stubs have no window, so "no window" stands in for not responding.
// Author: Imperator_Aug (ARSENAL, ia-e668f6c7)
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const gw = require('../gamewatch');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gamewatch-'));
const STUB = {
  // writes the Exception block, then sits like the engine's MessageBox wait
  logged: "fs.writeFileSync(log,'boot\\r\\n***************** Exception *****************\\r\\nbad (x.cpp, 1)\\r\\n'); setInterval(()=>{},1000);",
  // log, then dies without a word: the stack overflow path
  silent: "fs.writeFileSync(log,'boot\\r\\n'); process.exit(-1073741571);",
  // log, then alive and quiet
  hang: "fs.writeFileSync(log,'boot\\r\\n'); setInterval(()=>{},1000);",
  // never writes a log
  nolog: 'setInterval(()=>{},1000);',
  // keeps logging, as a long load does
  busy: "fs.writeFileSync(log,''); setInterval(()=>fs.appendFileSync(log,'x\\r\\n'),100);",
  // Exception text that is not the block line, then a clean exit
  clean: "fs.writeFileSync(log,'caught Exception here\\r\\n'); process.exit(0);",
};
async function one(name, opts, limitMs) {
  const log = path.join(dir, name + '.log'), js = path.join(dir, name + '.js');
  fs.writeFileSync(js, `const fs=require('fs'),log=${JSON.stringify(log)};${STUB[name]}`);
  const startMs = Date.now();
  const p = cp.spawn(process.execPath, [js], { stdio: 'ignore' });
  const w = gw.watch(Object.assign({ pid: () => p.pid, alive: () => p.exitCode === null, exit: () => ({ code: p.exitCode }), logFile: () => log, startMs, hangSec: 2, settleMs: 300, dialogWaitMs: 800 }, opts));
  let v = null;
  while (!v && Date.now() - startMs < limitMs) { v = await w.tick(); if (!v) await new Promise(r => setTimeout(r, 100)); }
  if (p.exitCode === null) gw.killTree(p.pid);
  return { v, w };
}
(async () => {
  const bad = [];
  const want = (n, got, exp) => { if (got !== exp) bad.push(`${n}: got ${got}, want ${exp}`); };
  const st = r => r.v ? r.v.state : null;
  want('logged', st(await one('logged', {}, 8000)), 'crashed-logged');
  const s = await one('silent', {}, 8000);
  want('silent', st(s), 'crashed-silent');
  if (s.v && !/0xC00000FD/.test(s.v.reason)) bad.push('silent reason has no exit code: ' + s.v.reason);
  want('hang', st(await one('hang', {}, 12000)), 'hung');
  want('nolog', st(await one('nolog', {}, 12000)), 'hung');
  want('busy', st(await one('busy', {}, 5000)), null);
  want('clean', st(await one('clean', {}, 8000)), 'exited');
  want('hang after quit asked', st(await one('hang', { expectExit: () => true }, 5000)), null);
  // mark variants
  if (!gw.MARK.test('x\n***************** Exception *****************\r\ny')) bad.push('MARK engine line');
  if (!gw.MARK.test('[00:00:03] ***** Exception *****')) bad.push('MARK stamped line');
  if (gw.MARK.test('Exception code 0xC0000005')) bad.push('MARK prose');
  want('isFailure', gw.isFailure({ state: 'exited' }) || !gw.isFailure({ state: 'hung' }), false);
  fs.rmSync(dir, { recursive: true, force: true });
  if (bad.length) { console.log('gamewatch FAIL\n' + bad.join('\n')); process.exit(1); }
  console.log('gamewatch ok');
})();

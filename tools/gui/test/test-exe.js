#!/usr/bin/env node
// GUI-3 test: the packaged exe, started with a PATH that has no node, from a clean folder. No browser (--no-open).
// usage: node tools/gui/test/test-exe.js <exe> <cleanRoot> [port] [mod]   (mod: a mod folder; check runs on it as an exe child, read-only)
//   exe       ARSENAL-gui.exe built by: node tools/dist/sea.js --out <dir> --name ARSENAL-gui
//   cleanRoot folder under which a fresh run folder is made (the exe is copied there and started with that cwd)
// Pass: page served, /api/game says game found or no-game, `gen --sample` runs as a child of the exe. The exe is killed after.
// Author: Imperator_Aug (ARSENAL, ia-e19fb4a7)
const fs = require('fs'), path = require('path'), http = require('http'), cp = require('child_process');
const exe = path.resolve(process.argv[2] || ''), root = path.resolve(process.argv[3] || '');
const port = Number(process.argv[4] || 47913), modDir = process.argv[5] ? path.resolve(process.argv[5]) : null; // [mod]: also run check on it
if (!process.argv[3] || !fs.existsSync(exe)) { console.error('usage: node test-exe.js <ARSENAL-gui.exe> <cleanRoot> [port] [mod]'); process.exit(2); }
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'ok   ' : 'FAIL ') + m); };
const get = (p, method, body) => new Promise((res, rej) => {
  const data = body === undefined ? null : JSON.stringify(body);
  const r = http.request({ host: '127.0.0.1', port, path: p, method: method || 'GET', headers: data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {} }, s => {
    const b = []; s.on('data', d => b.push(d)); s.on('end', () => res({ status: s.statusCode, text: Buffer.concat(b).toString('utf8') }));
  });
  r.on('error', rej); r.setTimeout(modDir ? 600000 : 60000, () => r.destroy(new Error('timeout'))); if (data) r.write(data); r.end();
});
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const run = path.join(root, 'run-' + Date.now());
  fs.mkdirSync(run, { recursive: true });
  const local = path.join(run, path.basename(exe));
  fs.copyFileSync(exe, local);
  // PATH: Windows system folder only (taskkill, reg). Refuse to go on if node is reachable there.
  const sysRoot = process.env.SystemRoot || 'C:\\Windows';
  const PATH = path.join(sysRoot, 'System32');
  const nodeOnPath = PATH.split(path.delimiter).some(d => fs.existsSync(path.join(d, 'node.exe')));
  ok(!nodeOnPath, 'test PATH has no node.exe (' + PATH + ')');
  const env = { SystemRoot: sysRoot, PATH, TEMP: process.env.TEMP, TMP: process.env.TMP, USERPROFILE: process.env.USERPROFILE, APPDATA: process.env.APPDATA, LOCALAPPDATA: process.env.LOCALAPPDATA };
  const child = cp.spawn(local, ['gui', '--no-open', '--port', String(port)], { cwd: run, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let out = '', err = ''; child.stdout.on('data', d => out += d); child.stderr.on('data', d => err += d);
  let exited = null; child.on('exit', c => exited = c);
  try {
    for (let i = 0; i < 50 && !/gui: http/.test(out) && exited === null; i++) await sleep(200);
    ok(/gui: http:\/\/127\.0\.0\.1:\d+/.test(out), 'exe printed its URL: ' + out.trim());
    const h = await get('/api/health'); const hj = JSON.parse(h.text);
    ok(h.status === 200 && hj.sea === true, '/api/health says sea:true (running as the exe)');
    const pg = await get('/');
    ok(pg.status === 200 && /<html|<!doctype/i.test(pg.text) && pg.text.length > 20000, 'page served at / (' + pg.text.length + ' bytes)');
    const cm = JSON.parse((await get('/api/commands')).text);
    ok(cm.commands.length >= 8, 'contract lists ' + cm.commands.length + ' commands');
    const g = JSON.parse((await get('/api/game')).text);
    ok(g.dir ? fs.existsSync(g.dir) : true, g.dir ? 'game found by the exe: ' + path.basename(g.dir) + ' (' + (g.how || g.source || '?') + ')' : 'no game found; message: ' + JSON.stringify(g).slice(0, 160));
    const r = await get('/api/run?stream=0', 'POST', { cmd: 'gen', input: { sample: true } });
    const rj = JSON.parse(r.text);
    ok(r.status === 200 && rj.code === 0, 'gen --sample ran as a child of the exe: code ' + rj.code + ', argv0 is the exe: ' + (rj.argv && path.basename(rj.argv[0])));
    ok(rj.argv && path.basename(rj.argv[0]) === path.basename(local) && rj.argv[1] === 'gen', 'child command line is <exe> gen ...');
    ok((rj.stdout || '').length > 50, 'child produced output (' + (rj.stdout || '').length + ' chars)');
    if (rj.code !== 0) console.log('  stderr: ' + String(rj.stderr || err).slice(0, 400));
    // L7-CLEAN: optional [mod] = full `check` as an exe child; check's doctor/wouldload spawn refcheck, sdllint ... as children of the same exe
    if (modDir) {
      const c = await get('/api/run?stream=0', 'POST', { cmd: 'check', input: { mod: modDir }, timeoutSec: 600 });
      const cj = JSON.parse(c.text), so = String(cj.stdout || '');
      ok(c.status === 200 && cj.code === 0 && /^VERDICT as64: /m.test(so), 'check ran as a child of the exe: code ' + cj.code + ', ' + ((/^VERDICT as64: \S+/m.exec(so) || ['no verdict'])[0]));
      ok(/^DOCTOR: mounted /m.test(so) && !/^ERROR: /m.test(so), 'check children (doctor, wouldload, refcheck ...) ran with no tool ERROR' + ((/^ERROR: .*/m.exec(so) || [''])[0] ? ': ' + /^ERROR: .*/m.exec(so)[0] : ''));
    }
  } catch (e) { ok(false, 'exception: ' + e.message); console.log('  exe stderr: ' + err.slice(0, 400)); }
  child.kill();
  spawnKill(child.pid);
  await sleep(500);
  ok(exited !== null || child.killed, 'exe stopped');
  console.log(pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
function spawnKill(pid) { try { cp.spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }); } catch (e) { /* gone */ } }

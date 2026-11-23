// GUI settings test: the window's settings kept by the server (tools/gui/settings.js, GET/POST /api/settings).
//   node tools/gui/test/test-settings.js [scratchDir]     every file is a scratch file; the real profile file is never touched.
// Rows: survive a stop and a second start on another port; a bad JSON file is moved aside and the settings start empty;
// a path that cannot be written gives set.cantWrite (500), not a crash; a name outside the allowed ones is refused (400);
// a foreign Host is refused (403); the default file per system; the page sends only allowed names.
// Author: Imperator_Aug (ARSENAL, ia-8bd3e5e8)
'use strict';
const http = require('http'), fs = require('fs'), os = require('os'), path = require('path');
const gui = require('../gui'), settings = require('../settings');
const S = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'as2gui-set-')));
fs.mkdirSync(S, { recursive: true });
let pass = 0, failN = 0;
const ok = (c, m, extra) => { if (c) pass++; else { failN++; console.log('FAIL ' + m + (extra !== undefined ? '\n  ' + String(extra).slice(0, 500) : '')); } };

function req(port, method, url, body, hdr) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
    const r = http.request({ host: '127.0.0.1', port, method, path: url, agent: false, headers: Object.assign({ host: '127.0.0.1:' + port }, data ? { 'content-type': 'application/json', 'content-length': data.length } : {}, hdr) }, res => {
      const ch = []; res.on('data', d => ch.push(d)); res.on('end', () => { const t = Buffer.concat(ch).toString('utf8'); let j = null; try { j = JSON.parse(t); } catch (e) { /* html */ } resolve({ status: res.statusCode, text: t, j }); });
    });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}

async function main() {
  // default file per system (no real file is opened)
  ok(settings.defaultFile({ LOCALAPPDATA: 'C:\\Users\\x\\AppData\\Local' }, 'win32', 'C:\\Users\\x') === path.join('C:\\Users\\x\\AppData\\Local', 'ARSENAL', 'settings.json'), 'default file: Windows LOCALAPPDATA\\ARSENAL');
  ok(settings.defaultFile({}, 'darwin', '/Users/x') === path.join('/Users/x', 'Library', 'Application Support', 'ARSENAL', 'settings.json'), 'default file: macOS Application Support');
  ok(settings.defaultFile({ XDG_CONFIG_HOME: '/c' }, 'linux', '/home/x') === path.join('/c', 'arsenal', 'settings.json'), 'default file: XDG_CONFIG_HOME');
  const absHome = path.resolve('arsenal-home-x'), absFile = path.resolve('arsenal-x.json');
  ok(settings.defaultFile({ ARSENAL_HOME: absHome, LOCALAPPDATA: 'C:\\L' }, 'win32', 'C:\\Users\\x') === path.join(absHome, 'settings.json'), 'default file: env ARSENAL_HOME wins');
  ok(settings.defaultFile({ ARSENAL_SETTINGS: absFile, ARSENAL_HOME: absHome }, 'linux', '/home/x') === absFile, 'default file: env ARSENAL_SETTINGS wins');
  ok(settings.defaultFile({ ARSENAL_HOME: 'rel' }, 'darwin', '/Users/x') === path.join('/Users/x', 'Library', 'Application Support', 'ARSENAL', 'settings.json'), 'default file: a relative ARSENAL_HOME is ignored');
  ok(settings.defaultFile({}, 'linux', '/home/x') === path.join('/home/x', '.config', 'arsenal', 'settings.json'), 'default file: ~/.config/arsenal');
  ok(settings.okKey('as2gui.theme') && settings.okKey('as2gui.sub.check') && settings.okKey('as2gui.sub.mods-check') && settings.okKey('as2gui.modes.x') && settings.okKey('as2gui.missions.x') && !settings.okKey('as2gui.token') && !settings.okKey('as2gui.ide.apiKey') && !settings.okKey('other.theme'), 'allowed names: page names yes, token/key and foreign names no');

  // 1 survive a stop and a second start on another port
  const f1 = path.join(S, 'a', 'settings.json');
  let A = await gui.start({ port: 0, cwd: S, tmpRoot: S, settingsFile: f1 }), portA = A.port;
  try {
    const g0 = await req(A.port, 'GET', '/api/settings');
    ok(g0.status === 200 && g0.j && g0.j.empty === true && g0.j.file === f1, 'GET: empty at first, names the file', g0.text);
    const p = await req(A.port, 'POST', '/api/settings', { set: { 'as2gui.theme': 'dark', 'as2gui.gameId': 'goh', 'as2gui.roots': ['C:\\mods'] } });
    ok(p.status === 200, 'POST: allowed names kept', p.text);
    ok(fs.existsSync(f1) && JSON.parse(fs.readFileSync(f1, 'utf8'))['as2gui.theme'] === 'dark', 'file written');
    ok(!fs.readdirSync(path.dirname(f1)).some(n => /\.tmp-/.test(n)), 'no temp file left after the write');
    // the Advanced switch reaches the write guard of the tools the app starts (lib/writeguard: a GoH mod ARSENAL did not make, owner 2026-11-15)
    ok(process.env.ARSENAL_ADVANCED === '0', 'Advanced off at first: ARSENAL_ADVANCED=0', process.env.ARSENAL_ADVANCED);
    const av = await req(A.port, 'POST', '/api/settings', { set: { 'as2gui.adv': true } });
    ok(av.status === 200 && process.env.ARSENAL_ADVANCED === '1', 'Advanced on: ARSENAL_ADVANCED=1', av.text);
    await req(A.port, 'POST', '/api/settings', { set: { 'as2gui.adv': false } });
    ok(process.env.ARSENAL_ADVANCED === '0', 'Advanced off again: ARSENAL_ADVANCED=0', process.env.ARSENAL_ADVANCED);
    // a name outside the allowed ones: 400, nothing kept
    const bad = await req(A.port, 'POST', '/api/settings', { set: { 'as2gui.theme': 'light', 'as2gui.sessionToken': 'x' } });
    ok(bad.status === 400 && bad.j && bad.j.key === 'set.badKey', 'POST: a token name is refused', bad.text);
    const bad2 = await req(A.port, 'POST', '/api/settings', { set: { 'evil.thing': 1 } });
    ok(bad2.status === 400 && bad2.j.key === 'set.badKey', 'POST: a foreign name is refused', bad2.text);
    ok(JSON.parse(fs.readFileSync(f1, 'utf8'))['as2gui.theme'] === 'dark', 'a refused POST keeps nothing');
    // foreign Host and foreign Origin
    const h = await req(A.port, 'POST', '/api/settings', { set: { 'as2gui.theme': 'light' } }, { host: 'evil.example' });
    ok(h.status === 403, 'POST: foreign Host refused', h.status);
    const hg = await req(A.port, 'GET', '/api/settings', undefined, { host: 'evil.example' });
    ok(hg.status === 403, 'GET: foreign Host refused', hg.status);
    const o = await req(A.port, 'POST', '/api/settings', { set: { 'as2gui.theme': 'light' } }, { origin: 'http://evil.example' });
    ok(o.status === 403, 'POST: foreign Origin refused', o.status);
    const big = await req(A.port, 'POST', '/api/settings', { set: { 'as2gui.ide.x': 'y'.repeat(300 << 10) } });
    ok(big.status === 400 || big.status === 413, 'POST: a value over the cap is refused', big.status);
  } finally { await A.close(); }
  A = await gui.start({ port: 0, cwd: S, tmpRoot: S, settingsFile: f1 });
  try {
    ok(A.port > 0 && A.port !== portA, 'second start on another port', A.port + ' ' + portA);
    const g = await req(A.port, 'GET', '/api/settings');
    ok(g.status === 200 && g.j.empty === false && g.j.settings['as2gui.theme'] === 'dark' && g.j.settings['as2gui.gameId'] === 'goh' && g.j.settings['as2gui.roots'][0] === 'C:\\mods', 'settings survive a stop and a start on another port', g.text);
  } finally { await A.close(); }

  // 2 bad JSON: moved aside, settings start empty, the page is told once
  const f2 = path.join(S, 'b', 'settings.json'); fs.mkdirSync(path.dirname(f2), { recursive: true }); fs.writeFileSync(f2, '{"as2gui.theme": "dark",,, not json');
  A = await gui.start({ port: 0, cwd: S, tmpRoot: S, settingsFile: f2 });
  try {
    const g = await req(A.port, 'GET', '/api/settings');
    ok(g.status === 200 && g.j.empty === true && g.j.problem && g.j.problem.key === 'set.corrupt', 'bad JSON: empty settings and set.corrupt', g.text);
    const aside = fs.readdirSync(path.dirname(f2)).filter(n => /^settings\.json\.bad-/.test(n));
    ok(aside.length === 1 && !fs.existsSync(f2), 'bad JSON: the file is renamed aside', fs.readdirSync(path.dirname(f2)).join());
    const g2 = await req(A.port, 'GET', '/api/settings');
    ok(!g2.j.problem, 'the problem is told once');
    const p = await req(A.port, 'POST', '/api/settings', { set: { 'as2gui.lang': 'ru' } });
    ok(p.status === 200 && JSON.parse(fs.readFileSync(f2, 'utf8'))['as2gui.lang'] === 'ru', 'after the bad file a new one is written', p.text);
  } finally { await A.close(); }

  // 3 a path that cannot be written (its folder is a file): 500 with set.cantWrite, the server keeps running
  const blocker = path.join(S, 'c-file'); fs.writeFileSync(blocker, 'x');
  const f3 = path.join(blocker, 'settings.json');
  A = await gui.start({ port: 0, cwd: S, tmpRoot: S, settingsFile: f3 });
  try {
    const p = await req(A.port, 'POST', '/api/settings', { set: { 'as2gui.theme': 'light' } });
    ok(p.status === 500 && p.j && p.j.key === 'set.cantWrite' && p.j.params && p.j.params.file === f3, 'read-only path: set.cantWrite', p.text);
    const g = await req(A.port, 'GET', '/api/health');
    ok(g.status === 200, 'the server still answers after a failed write');
  } finally { await A.close(); }

  // 4 no settingsFile: memory only, nothing written
  A = await gui.start({ port: 0, cwd: S, tmpRoot: S });
  try {
    const g = await req(A.port, 'GET', '/api/settings');
    ok(g.status === 200 && !g.j.file, 'no file given: memory only', g.text);
    const p = await req(A.port, 'POST', '/api/settings', { set: { 'as2gui.theme': 'light' } });
    ok(p.status === 200, 'memory only: POST accepted');
  } finally { await A.close(); }

  console.log(`settings test: ${pass} passed, ${failN} failed`);
  process.exitCode = failN ? 1 : 0;
}
main().catch(e => { console.log('settings test crashed: ' + (e && e.stack || e)); process.exitCode = 1; });

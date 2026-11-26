// live update test (live.js, gui.js --dev). Loopback, port 0, scratch folders only; never the real GUI port or settings.
//   node tools/gui/test/test-live.js [scratchDir]
// 1. without --dev: no stream (404), the plain page, no watcher
// 2. --dev: the page carries live:true; the stream says hello; a file change in a watched scratch folder sends one reload (debounced)
// 3. what a change does: server code -> restart asked (onRestart), page/strings/client scripts -> page rebuilt + reload, others nothing
// 4. supervisor: same port and token across restarts, switches kept, a crashing child is not respawned in a loop, a file change revives it
// 5. the page script: the Reconnecting status and the stream code are in the page
// Author: Imperator_Aug (ARSENAL, ia-a1646a89)
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const gui = require('../gui'), live = require('../live');
const S = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'as2gui-live-')));
fs.mkdirSync(S, { recursive: true });
let pass = 0, failN = 0;
const ok = (c, m, extra) => { if (c) pass++; else { failN++; console.log('FAIL ' + m + (extra !== undefined ? '\n  ' + String(extra).slice(0, 500) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const WT = require('../../lib/test/wait');
// by the event; backstop at least 60 s (WT.until), then the assert after it reports. Never a timing-only fail, never a hang
async function until(f, ms = 5000) { return !!(await WT.until(f, { who: 'test-live', ms, step: 40 })); }
function get(port, p, stream) {
  return new Promise(resolve => {
    const r = http.request({ host: '127.0.0.1', port, path: p, headers: { host: '127.0.0.1:' + port } }, res => {
      if (stream) return resolve({ status: res.statusCode, headers: res.headers, res });
      let t = ''; res.setEncoding('utf8'); res.on('data', d => { t += d; }); res.on('end', () => resolve({ status: res.statusCode, text: t }));
    });
    r.on('error', e => resolve({ status: 0, text: e.message })); r.end();
  });
}
const events = res => { const evs = []; let buf = ''; res.setEncoding('utf8'); res.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n\n')) >= 0) { const b = buf.slice(0, i); buf = buf.slice(i + 2); const ev = /^event: (.*)$/m.exec(b), da = /^data: (.*)$/m.exec(b); if (ev) evs.push({ ev: ev[1], data: da ? JSON.parse(da[1]) : null }); } }); return evs; };

(async () => {
  const PAGE = require('../page');
  // ---- 1. no --dev
  const A = await gui.start({ port: 0, tmpRoot: S });
  try {
    ok((await get(A.port, '/api/live')).status === 404, 'no --dev: no event stream');
    ok((await get(A.port, '/')).text === PAGE, 'no --dev: the page is served as before (byte for byte)');
  } finally { await A.close(); }

  // ---- 2. --dev with a watched scratch folder
  const W = path.join(S, 'watched'); fs.mkdirSync(W, { recursive: true });
  const asked = [];
  const B = await gui.start({ port: 0, tmpRoot: S, dev: true, watchDirs: [W], onRestart: f => asked.push(f) });
  try {
    const pg = await get(B.port, '/');
    ok(/<script>window\.AS2CFG=\{"live":true,"dev":true,"rOn":false\};<\/script>/.test(pg.text), '--dev: the page is told to open the stream');
    const st = await get(B.port, '/api/live', true);
    ok(st.status === 200 && /text\/event-stream/.test(st.headers['content-type']) && st.headers['cache-control'] === 'no-store', '--dev: GET /api/live is an event stream');
    const evs = events(st.res);
    ok(await until(() => evs.some(e => e.ev === 'hello' && /^[0-9a-f]{12}$/.test(e.data.boot))), 'hello with the boot id');
    await sleep(200);
    // 5 writes 20 ms apart: each resets the 300 ms debounce. A busy PC can stretch a gap past it: each such gap may give one more reload (WAIT line)
    let longGaps = 0; for (let i = 0; i < 5; i++) { const g0 = Date.now(); fs.writeFileSync(path.join(W, 'a' + i + '.js'), 'x' + i); if (i < 4) { await sleep(20); if (Date.now() - g0 > 250) longGaps++; } }
    if (longGaps) process.stderr.write('WAIT test-live: ' + longGaps + ' write gap(s) of the burst took over 250 ms; one more reload each is allowed\n');
    ok(await until(() => evs.some(e => e.ev === 'reload')), 'a file change in a watched folder sends reload');
    await sleep(700);
    ok(evs.filter(e => e.ev === 'reload').length >= 1 && evs.filter(e => e.ev === 'reload').length <= 1 + longGaps, 'a burst of changes = one reload (debounced)', evs.filter(e => e.ev === 'reload').length);
    const rl = evs.find(e => e.ev === 'reload'); ok(rl && rl.data.files.includes('a0.js'), 'reload names the files', JSON.stringify(rl && rl.data));

    // ---- 3. classification (no file is written: the names are handed in)
    const G = path.join(__dirname, '..');
    ok(B.changed([path.join(G, 'gui.js')]) === 'restart' && asked.length === 1, 'gui.js changed: restart asked');
    ok(B.changed([path.join(G, '..', 'lib', 'gamedir.js')]) === 'restart', 'a required lib module changed: restart asked');
    const n0 = evs.filter(e => e.ev === 'reload').length;
    ok(B.changed([path.join(G, 'lang', 'en.json')]) === 'reload' && B.changed([path.join(G, 'page.js')]) === 'reload', 'strings or page.js changed: page rebuilt, reload');
    const anyClient = Object.keys(require.cache).find(k => /[\\/]ext[\\/]share[\\/]script\.js$/.test(k));
    ok(anyClient && B.changed([anyClient]) === 'reload', 'an ext client script changed: page rebuilt, reload', anyClient);
    ok(await until(() => evs.filter(e => e.ev === 'reload').length >= n0 + 3), 'each rebuild told the pages');
    ok((await get(B.port, '/')).text.includes('id=livest'), 'the rebuilt page is served');
    ok(B.changed([path.join(G, 'test', 'not-loaded.js'), path.join(S, 'elsewhere.js')]) === 'none', 'a test file or a file outside: nothing');
    st.res.destroy();
  } finally { await B.close(); }

  // ---- watch(): debounce and close
  { const D = path.join(S, 'w2'); fs.mkdirSync(D, { recursive: true }); const got = [];
    const w = live.watch([D], f => got.push(f), 150);
    await sleep(150); fs.writeFileSync(path.join(D, 'x.js'), '1'); fs.writeFileSync(path.join(D, 'y.json'), '2'); fs.writeFileSync(path.join(D, 'z.tmp'), '3');
    ok(await until(() => got.length === 1) && got[0].some(f => f.endsWith('x.js')) && got[0].some(f => f.endsWith('y.json')) && !got[0].some(f => f.endsWith('z.tmp')), 'watch: one callback per burst, temp files skipped', JSON.stringify(got));
    w.close(); fs.writeFileSync(path.join(D, 'x.js'), '4'); await sleep(400); ok(got.length === 1, 'watch: nothing after close'); }

  // ---- 4. supervisor with a stand-in child (the real gui child would use the real settings and gui.json)
  { const D = path.join(S, 'sup'); fs.mkdirSync(D, { recursive: true });
    const child = path.join(D, 'child.js');
    fs.writeFileSync(child, [
      "const fs = require('fs'), path = require('path');",
      "fs.appendFileSync(path.join(__dirname, 'spawns.txt'), process.pid + '\\n');",
      "if (fs.existsSync(path.join(__dirname, 'crash'))) process.exit(3);",
      "const port = Number(process.argv[process.argv.indexOf('--port') + 1]);",
      "const st = JSON.parse(process.env.AS2GUI_STATE || '{}');",
      "const srv = require('http').createServer((q, r) => r.end(JSON.stringify({ pid: process.pid, token: process.env.AS2GUI_TOKEN, st, args: process.argv.slice(2) })));",
      "srv.listen(port, '127.0.0.1', () => process.send({ t: 'up', url: 'http://127.0.0.1:' + port + '/', files: [path.join(__dirname, 'srv.js')] }));",
      "process.on('message', m => { if (m.t === 'files' && m.files.some(f => /srv\\.js$/.test(f))) { process.send({ t: 'state', state: { remote: false, allowLaunch: true } }); process.send({ t: 'restart', files: m.files }); }",
      "  if (m.t === 'stop') srv.close(() => process.exit(0)); });",
      "process.on('disconnect', () => process.exit(0));",
    ].join('\n'));
    let url = null;
    const sv = await live.supervise({ script: child, args: ['--dev'], state: { remote: true, allowLaunch: false }, watchDirs: [D], noSignals: true, onUrl: u => { url = u; } });
    const ask = async () => { const r = await get(sv.port, '/'); return r.status === 200 ? JSON.parse(r.text) : null; };
    let a = null; ok(await until(async () => (a = await ask())), 'supervisor: the child serves on the chosen port');
    ok(url === 'http://127.0.0.1:' + sv.port + '/' && a.token === sv.token && a.token.length === 32 && a.st.remote === true && a.args.join(' ') === '--dev --port ' + sv.port, 'supervisor: port, token and switches handed to the child', JSON.stringify(a));
    await sleep(200); fs.writeFileSync(path.join(D, 'srv.js'), '// v2');
    let b = null; ok(await until(async () => { b = await ask(); return b && b.pid !== a.pid; }, 8000), 'server code changed: a new child');
    ok(b && b.token === a.token && b.st.allowLaunch === true && b.st.remote === false, 'the new child: same port and token, the switches as the old child left them', JSON.stringify(b));
    fs.writeFileSync(path.join(D, 'crash'), '1'); await sleep(100); fs.writeFileSync(path.join(D, 'srv.js'), '// v3');
    const spawns = () => fs.readFileSync(path.join(D, 'spawns.txt'), 'utf8').trim().split('\n').length;
    ok(await until(async () => spawns() === 3 && (await get(sv.port, '/')).status === 0, 8000), 'a child that crashes at start: the server is down');
    await sleep(300); const n1 = spawns(); await sleep(1500);
    const n2 = spawns();
    ok(n1 === n2 && n1 === 3, 'no respawn loop: it waits for the next change', n1 + ' ' + n2);
    fs.unlinkSync(path.join(D, 'crash')); fs.writeFileSync(child, fs.readFileSync(child, 'utf8') + '\n// fixed');
    let c = null; ok(await until(async () => (c = await ask()), 8000) && c.token === a.token, 'the next file change starts it again, same port and token');
    sv.close(); }

  // ---- 5. page parts
  ok(/<span id=livest role=status hidden><\/span>/.test(PAGE) && /<div id=rmban role=note hidden><\/div>/.test(PAGE), 'header: Reconnecting status and the phone banner (hidden until needed)');
  ok(/new EventSource\('\/api\/live'\)/.test(PAGE) && /sessionStorage\.setItem\('as2gui\.live'/.test(PAGE), 'page: one stream, screen and scroll kept across a reload');
  ok(/<meta name=viewport content="width=device-width,initial-scale=1">/.test(PAGE), 'page: viewport meta for phones');

  console.log('live test: ' + pass + ' passed, ' + failN + ' failed');
  process.exit(failN ? 1 : 0);
})().catch(e => { console.log('FAIL crashed: ' + (e.stack || e)); process.exit(1); });

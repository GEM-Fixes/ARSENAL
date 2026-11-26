// arsenal-gui MCP server (tools/mcp/gui.js) against a GUI started here on a free port (settings in a scratch file, no game needed).
// Over one JSON-RPC pipe: initialize, tools/list, gui_status, gui_pages, gui_routes by a word, a read call, write routes without
// write (preview: nothing sent or written), a write with write: true, the launch refusals, gui_open, gui_lang, gui_jobs.
// Author: Imperator_Aug (ARSENAL, ia-84476000)
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), { spawn } = require('child_process');
const { T, scratch, rm, cleanEnv, ROOT } = require('./rpc');
const Wt = require('../../lib/test/wait');
const GUI_MCP = path.resolve(__dirname, '..', 'gui.js');
const t = T('gui');

// one server process, asked line by line
function pipe(env) {
  const c = spawn(process.execPath, [GUI_MCP], { cwd: ROOT, env: cleanEnv(env), stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  const wait = new Map(); let buf = '', err = '', n = 0, raw = 0;
  c.stdout.setEncoding('utf8'); c.stderr.setEncoding('utf8');
  c.stderr.on('data', d => { err += d; });
  c.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); if (!l.trim()) continue; let j; try { j = JSON.parse(l); } catch (e) { raw++; continue; } const f = wait.get(j.id); if (f) { wait.delete(j.id); f(j); } } });
  // Backup, never a hang: no answer in 60 s says WAIT and waits as long again before it throws
  const NONE = {};
  const ask = (method, params) => Wt.late(new Promise(resolve => {
    const id = ++n;
    wait.set(id, resolve);
    c.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  }), { who: 'mcp gui', what: 'answer to ' + method, ms: 60000, or: NONE }).then(j => { if (j === NONE) throw new Error('no answer to ' + method + ' in 120 s\n' + err); return j; });
  const call = async (name, args) => { const r = await ask('tools/call', { name, arguments: args || {} }); return r.error ? { text: '', isError: true, error: r.error } : { text: r.result.content.map(x => x.text).join('\n'), isError: !!r.result.isError, data: r.result.structuredContent }; };
  const end = () => Wt.late(new Promise(resolve => { c.on('close', code => resolve({ code, err, raw })); c.stdin.end(); }), { who: 'mcp gui', what: 'server end after stdin closed', ms: 60000, or: { code: 'no end', err, raw } }).then(e => { if (e.code === 'no end') c.kill(); return e; });
  return { ask, call, end, send: l => c.stdin.write(l + '\n') };
}
function post(port, p, body) {
  return new Promise((resolve, reject) => {
    const b = Buffer.from(JSON.stringify(body));
    const q = http.request({ host: '127.0.0.1', port, method: 'POST', path: p, headers: { 'content-type': 'application/json', 'content-length': b.length }, agent: false }, res => { let s = ''; res.on('data', d => { s += d; }); res.on('end', () => resolve({ status: res.statusCode, text: s })); });
    q.on('error', reject); q.end(b);
  });
}
function get(port, p) {
  return new Promise((resolve, reject) => { http.get({ host: '127.0.0.1', port, path: p, agent: false }, res => { let s = ''; res.on('data', d => { s += d; }); res.on('end', () => resolve(JSON.parse(s))); }).on('error', reject); });
}

(async () => {
  const S = scratch('gui'), mod = path.join(S, 'mymod'); fs.mkdirSync(mod);
  const gui = require(path.join(ROOT, 'tools', 'gui', 'gui.js'));
  const A = await gui.start({ port: 0, cwd: S, tmpRoot: path.join(S, 'tmp'), settingsFile: path.join(S, 'settings.json'), demoXlate: true });
  const B = await gui.start({ port: 0, cwd: S, tmpRoot: path.join(S, 'tmp2'), allowLaunch: true });   // a session that may start the game
  let P = null, Q = null;
  try {
    // the page's saved choices: GoH tab off, AS2 tab with a mod
    const set = await post(A.port, '/api/settings', { set: { 'as2gui.gameId': 'mowas2', 'as2gui.games': { mowas2: { dir: '', mod } } } });
    t.ok(set.status === 200, 'test setup: settings saved (' + set.status + ' ' + set.text.slice(0, 120) + ')');

    P = pipe({ ARSENAL_GUI_PORT: String(A.port) });
    // initialize, list
    const init = await P.ask('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } });
    t.ok(init.result && init.result.serverInfo.name === 'arsenal-gui', 'initialize: server name');
    t.ok(init.result && init.result.protocolVersion === '2025-06-18', 'initialize: the client version is kept');
    t.ok(init.result && init.result.capabilities.tools, 'initialize: tools capability');
    P.send(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }));
    const list = await P.ask('tools/list', {});
    const names = (list.result ? list.result.tools : []).map(x => x.name);
    t.ok(names.join(',') === 'gui_status,gui_pages,gui_routes,gui_call,gui_jobs,gui_open,gui_lang,gui_start', 'tools/list: the eight tools (' + names.join(',') + ')');
    t.ok(list.result && list.result.tools.every(x => x.description && x.inputSchema && x.inputSchema.type === 'object'), 'tools/list: description and schema on each');
    t.ok((await P.ask('ping', {})).result, 'ping');
    const unk = await P.ask('nope/nope', {}); t.ok(unk.error && unk.error.code === -32601, 'unknown method -> -32601');
    const unt = await P.ask('tools/call', { name: 'gui_nope', arguments: {} }); t.ok(unt.error && unt.error.code === -32602, 'unknown tool -> -32602');
    t.ok((await P.ask('resources/list', {})).result.resources.length === 0, 'resources/list is empty');

    // gui_status
    let r = await P.call('gui_status');
    t.ok(!r.isError && r.data && r.data.running === true && r.data.port === A.port, 'gui_status: running on the test port');
    t.ok(r.data && r.data.game === 'mowas2', 'gui_status: the game tab the page saved (' + (r.data && r.data.game) + ')');
    t.ok(r.data && r.data.mod === mod, 'gui_status: the mod picked for that tab');
    t.ok(r.data && r.data.guiMayStartGame === false, 'gui_status: this GUI may not start the game');
    t.ok(!/token/i.test(r.text) && !JSON.stringify(r.data).includes('token'), 'gui_status: no token in the answer');

    // gui_pages
    r = await P.call('gui_pages');
    for (const g of ['as64', 'mowas2', 'goh']) t.has(r.text, '(' + g + ',', 'gui_pages: game tab ' + g);
    t.has(r.text, 'What each page is for', 'gui_pages: the purpose list');
    t.has(r.text, '[units]', 'gui_pages: the units page');
    r = await P.call('gui_pages', { game: 'goh', word: 'unit' });
    t.ok(!r.isError && r.data && r.data.games.join() === 'goh' && r.data.pages.includes('units'), 'gui_pages game + word');
    r = await P.call('gui_pages', { page: 'units' });
    t.ok(!r.isError && r.data && r.data.page.id === 'units' && r.data.page.where.length > 0, 'gui_pages page: where it sits');
    r = await P.call('gui_pages', { page: 'no-such' }); t.ok(r.isError, 'gui_pages: unknown page refused');

    // gui_routes
    r = await P.call('gui_routes');
    t.ok(r.data && r.data.counts.routes > 300 && r.data.byPage.units > 5, 'gui_routes: counts by page');
    r = await P.call('gui_routes', { word: 'glossary' });
    t.ok(!r.isError && r.data.routes.includes('GET /api/x/help/glossary'), 'gui_routes word: finds the glossary route');
    t.ok(r.data.total < 20, 'gui_routes word: narrows the list (' + r.data.total + ')');
    r = await P.call('gui_routes', { page: 'units', writes: 'flag', limit: 5 });
    t.ok(r.data.routes.length === 5 && r.data.total > 5 && r.data.routes.every(x => x.startsWith('POST /api/x/units/')), 'gui_routes page + writes + limit');
    r = await P.call('gui_routes', { route: 'POST /api/x/units/change' });
    t.ok(r.data && r.data.route.writes === 'flag' && r.data.route.flag === 'write' && r.data.route.body.some(f => f.name === 'field'), 'gui_routes route: fields and write flag of one route');
    r = await P.call('gui_routes', { route: 'POST /api/run', word: 'check' });
    t.has(r.text, 'commands (body {cmd, input})', 'gui_routes: the commands of POST /api/run');

    // gui_call: reads
    r = await P.call('gui_call', { route: 'GET /api/health' });
    t.ok(!r.isError && r.data && r.data.ok === true, 'gui_call read: GET /api/health');
    t.has(r.text, 'GET /api/health -> 200 (MoW:AS2', 'gui_call read: status line with the game tab');
    r = await P.call('gui_call', { route: 'GET /api/x/help/glossary', game: 'goh' });
    t.ok(!r.isError && r.text.includes('-> 200'), 'gui_call read: an ext route for another game tab (' + r.text.slice(0, 80) + ')');
    r = await P.call('gui_call', { route: 'GET /api/x/nope/none' });
    t.ok(r.isError && r.text.includes('404'), 'gui_call: a route the GUI does not have -> its 404');
    for (const bad of ['http://example.com/api/health', 'GET /etc/passwd', 'GET /api/../x', 'DELETE /api/health'])
      t.ok((await P.call('gui_call', { route: bad })).isError, 'gui_call: refused route "' + bad + '"');
    r = await P.call('gui_call', { route: 'GET /api/health', mod: '-rf' }); t.ok(r.isError, 'gui_call: a value starting with - is refused');

    // gui_call: write routes without write = preview, nothing sent
    r = await P.call('gui_call', { route: 'POST /api/settings', body: { set: { 'as2gui.gameId': 'goh' } } });
    t.ok(!r.isError && r.data && r.data.sent === false && r.data.preview === true, 'gui_call write without write: not sent, a preview');
    t.has(r.text, 'confirm_write: true', 'gui_call preview: says how to send it');
    r = await P.call('gui_call', { route: 'POST /api/settings', body: { write: true, set: { 'as2gui.gameId': 'goh' } } });
    t.ok(r.data && r.data.sent === false, 'gui_call: write: true in the body does not send a route that always writes');
    t.ok((await get(A.port, '/api/settings')).settings['as2gui.gameId'] === 'mowas2', 'gui_call preview: the setting is unchanged');
    r = await P.call('gui_call', { route: 'POST /api/x/testplan/mark', body: {} });
    t.ok(r.data && r.data.sent === false && r.data.body.mod === mod, 'gui_call preview: the picked mod is filled in the way the page sends it');
    r = await P.call('gui_call', { route: 'POST /api/x/missions/sp/write', body: { mod, spec: {} } });
    t.ok(r.data && r.data.sent === false && r.data.previewRoute === 'POST /api/x/missions/sp/preview' && r.text.includes('POST /api/x/missions/sp/preview'), 'gui_call: an always-write route names the preview route to call first');
    r = await P.call('gui_routes', { route: 'POST /api/x/missions/sp/preview' });
    t.ok(r.data && r.data.route.writes === 'no' && r.data.route.by === 'name', 'gui_routes: a POST classed as a read by its name says so');
    r = await P.call('gui_routes', { route: 'GET /api/cache' }); t.ok(r.data && r.data.route.page === 'core', 'gui_routes: GET /api/cache is listed');
    r = await P.call('gui_call', { route: 'GET /console' }); t.ok(!r.isError && /<html|<!doctype/i.test(r.text), 'gui_call: GET /console answers the page text');
    r = await P.call('gui_call', { route: 'POST /api/x/guides/export', body: { dir: path.join(S, 'out'), fmt: 'md' } });
    t.has(r.text, 'dry: true', 'gui_call dry route: sent as a dry run');
    t.ok(!fs.existsSync(path.join(S, 'out')), 'gui_call dry route: nothing written');
    r = await P.call('gui_call', { route: 'POST /api/run', body: { cmd: 'no-such-cmd' } }); t.ok(r.isError, 'gui_call: unknown command refused');
    for (const x of ['POST /api/remote', 'POST /api/remote/newkey']) { r = await P.call('gui_call', { route: x, body: { on: true, write: true } }); t.ok(r.isError && r.text.includes('never sent'), 'gui_call: ' + x + ' is never sent'); }
    t.ok((await get(A.port, '/api/remote')).on !== true, 'the LAN Remote side stayed off');

    // gui_call: a real write (write: true); a write that names a folder needs ARSENAL_WRITE_ROOTS
    r = await P.call('gui_call', { route: 'POST /api/settings', confirm_write: true, body: { set: { 'as2gui.adv': true } } });
    t.ok(!r.isError && r.text.includes('written'), 'gui_call confirm_write: true is sent (' + r.text.slice(0, 100).replace(/\n/g, ' / ') + ')');
    t.ok((await get(A.port, '/api/settings')).settings['as2gui.adv'] === true, 'gui_call write: the setting changed');
    r = await P.call('gui_call', { route: 'POST /api/x/missions/sp/write', confirm_write: true, body: { mod, spec: {} } });
    t.ok(r.isError && r.text.includes('ARSENAL_WRITE_ROOTS'), 'gui_call write to a folder without ARSENAL_WRITE_ROOTS is refused');

    // launch refusals
    r = await P.call('gui_start'); t.ok(r.isError && r.text.includes('ARSENAL_ALLOW_LAUNCH=1'), 'gui_start refused without ARSENAL_ALLOW_LAUNCH=1');
    r = await P.call('gui_call', { route: 'POST /api/launch', confirm_write: true }); t.ok(r.isError && r.text.includes('ARSENAL_ALLOW_LAUNCH=1'), 'gui_call POST /api/launch refused without ARSENAL_ALLOW_LAUNCH=1');
    r = await P.call('gui_call', { route: 'POST /api/x/testplan/emit', confirm_write: true, port: B.port });
    t.ok(!r.isError || !/may start the game/.test(r.text), 'a known write route is not held back by the launch rule');
    r = await P.call('gui_call', { route: 'POST /api/x/zz/unlisted', confirm_write: true, port: B.port });
    t.ok(r.isError && r.text.includes('ARSENAL_ALLOW_LAUNCH=1'), 'a POST of unknown effect on a GUI that may start the game is refused');

    // gui_open, gui_lang, gui_jobs
    r = await P.call('gui_open', { page: 'units', port: A.port });
    t.ok(r.data && r.data.url === 'http://127.0.0.1:' + A.port + '/#go=page%3Aunits', 'gui_open: the page link (' + (r.data && r.data.url) + ')');
    t.has(r.text, 'the game tab and the mod stay', 'gui_open: says the link does not pick the game tab or the mod');
    r = await P.call('gui_open', { page: 'zzz' }); t.ok(r.isError, 'gui_open: unknown page refused');
    r = await P.call('gui_lang', { key: 'nav.mods' }); t.ok(!r.isError && r.data && typeof r.data.text === 'string' && r.data.text.length > 0, 'gui_lang key (en)');
    const en = r.data && r.data.text;
    r = await P.call('gui_lang', { key: 'nav.mods', lang: 'ru' }); t.ok(r.data && r.data.en === en && r.data.text && r.data.text !== en, 'gui_lang key (ru) with the English beside it');
    r = await P.call('gui_lang', { word: 'units', limit: 3 }); t.ok(r.data && r.data.keys.length === 3 && r.data.total > 3, 'gui_lang word search');
    r = await P.call('gui_lang', { key: 'no.such.key.here' }); t.ok(r.data && r.data.found === false, 'gui_lang: a key that is not there');
    r = await P.call('gui_jobs', { port: A.port }); t.ok(!r.isError && r.data && Array.isArray(r.data.jobs), 'gui_jobs: the list');
    r = await P.call('gui_jobs', { id: 'mzzzzzzzzzzzzzz', port: A.port }); t.ok(!r.isError && r.data.state === 'unknown', 'gui_jobs: an id that is not there');
    r = await P.call('gui_status', { nope: 1 }); t.ok(r.isError, 'an unknown argument is refused');

    const e = await P.end(); P = null;
    t.ok(e.code === 0 && e.raw === 0, 'the server ends at the end of stdin, stdout held only JSON (code ' + e.code + ', ' + e.raw + ' other lines)' + (e.err ? ' | stderr: ' + e.err.slice(0, 200) : ''));

    // no GUI there: plain words, no error thrown. With the launch switch gui_start says a running GUI is already there.
    Q = pipe({ ARSENAL_GUI_PORT: String(A.port), ARSENAL_ALLOW_LAUNCH: '1' });
    r = await Q.call('gui_start'); t.ok(!r.isError && r.data && r.data.started === false && r.data.port === A.port, 'gui_start with the switch: a GUI already runs, nothing started');
    await Q.end(); Q = null;

    // --list for the catalog; the module alone
    const m = require(GUI_MCP);
    t.ok(Array.isArray(m.tools) && m.tools.length === 8 && m.tools.every(x => /^(read|write|launch)$/.test(x.kind) && typeof x.handler === 'function'), 'module: exports the tools with kind and handler');
    t.ok(m.tools.find(x => x.name === 'gui_start').kind === 'launch' && m.tools.find(x => x.name === 'gui_call').kind === 'write', 'module: gui_start is launch, gui_call is write');
    const W = m._t.writeRefusal;
    const game = path.join(S, 'game'); fs.mkdirSync(path.join(game, 'resource'), { recursive: true }); fs.writeFileSync(path.join(game, 'as64.exe'), '');
    t.ok(/resource or packages/.test(W([{ out: path.join(game, 'resource', 'x') }], true) || ''), 'write rule: never inside a game\'s resource folder');
    process.env.ARSENAL_WRITE_ROOTS = mod;
    t.ok(W([{ mod }], true) === null && W([{ mod: path.join(mod, 'sub') }], true) === null, 'write rule: inside a write root is allowed');
    t.ok(/not inside/.test(W([{ mod, out: path.join(S, 'elsewhere') }], true) || ''), 'write rule: outside the write roots is refused');
    t.ok(/resource or packages/.test(W([{ out: path.join(game, 'resource', 'x') }], true) || ''), 'write rule: game data refused even with roots set');
    delete process.env.ARSENAL_WRITE_ROOTS;
  } catch (e) { t.ok(false, 'the test broke off: ' + (e && e.stack || e)); }
  finally {
    if (P) await P.end().catch(() => {}); if (Q) await Q.end().catch(() => {});
    await A.close(); await B.close(); rm(S);
  }
  t.done();
  process.exit(process.exitCode || 0);   // the GUI modules leave handles open
})();

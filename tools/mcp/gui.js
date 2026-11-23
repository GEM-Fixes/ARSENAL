#!/usr/bin/env node
// arsenal-gui: MCP server over stdio (JSON-RPC 2.0, one JSON message per line, no deps) that talks to a running ARSENAL GUI
// (node tools/gui/gui.js, default port 47811) over HTTP. Contract: tools/mcp/README.md. Runs alone: needs nothing of tools/mcp/lib.
//   node tools/mcp/gui.js            serve on stdin/stdout (stderr = notes for a person, never protocol)
//   node tools/mcp/gui.js --gen      write tools/mcp/gui/registry.json from the GUI's own code (gui/gen.js); run after a GUI route or page change
//   node tools/mcp/gui.js --check    registry.json against the GUI code; exit 1 and the lines that differ when it is stale
//   node tools/mcp/gui.js --list     the tools as JSON (catalog.js), then exit
// Tools: gui_status, gui_pages, gui_routes, gui_call, gui_jobs, gui_open, gui_lang, gui_start. The page and route lists come from
// registry.json, which is generated, never typed.
// Where the GUI is: argument port, env ARSENAL_GUI_PORT, the GUI's own port file (<data dir>/gui.json, written by the command-line
// start: the GUI picks a free port when none is given; the token in that file is never read out), then 47811 (this repo's launch config). Only 127.0.0.1 is ever asked: the PC's own page, the way the browser on this PC asks it (Host = 127.0.0.1:port,
// no Origin, POST bodies as application/json). The GUI's LAN Remote side (view only, behind a key) is never used and never switched.
// Safety (README "Safety rules"):
//   - gui_call on a write route sends a preview unless the body holds write: true (the page's own rule); a route that writes on
//     every call, or that the registry could not class, is not sent unless the argument confirm_write is true. A real write names its
//     folders (mod, out, dir, ...) inside ARSENAL_WRITE_ROOTS and never inside a game's resource or packages folder.
//   - a route that starts the game, and gui_start, are refused unless ARSENAL_ALLOW_LAUNCH=1.
//   - the routes that open the GUI to the network (POST /api/remote...) are never sent.
// Author: Imperator_Aug (ARSENAL, ia-3c58a4e3)
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..'), GUI_JS = path.join(ROOT, 'tools', 'gui', 'gui.js');
const REG_FILE = path.join(__dirname, 'gui', 'registry.json');
const GEN_CMD = 'node tools/mcp/gui.js --gen', SKILL_REFRESH = '.claude/skills/arsenal-gui-use/refresh-pages.js';
const DEFAULT_PORT = 47811, TEXT_MAX = 40000, DATA_MAX = 100000;
const VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const INFO = { name: 'arsenal-gui', title: 'ARSENAL GUI (MoW:AS2, AS64, Gates of Hell)', version: '1.0.0' };
const INSTRUCTIONS = 'Drives a running ARSENAL GUI on this PC. gui_status first (is it running, which game tab, which mod). gui_pages = what each page is for, '
  + 'gui_routes = its API routes with their fields, gui_call = call one. Write routes answer a preview unless the body holds write: true; routes that always write need confirm_write: true. '
  + 'gui_open gives the user a link to a page. gui_start needs ARSENAL_ALLOW_LAUNCH=1.';
const GAMES = ['as64', 'mowas2', 'goh'];

const cut = (s, n) => { s = String(s); n = n || TEXT_MAX; return s.length > n ? s.slice(0, n) + '\n[cut: ' + (s.length - n) + ' more chars]' : s; };
const bad = msg => ({ text: 'refused: ' + msg, isError: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---- the registry (generated)
let REG = null;
function reg() {
  if (REG) return REG;
  let j; try { j = JSON.parse(fs.readFileSync(REG_FILE, 'utf8')); } catch (e) { throw Object.assign(new Error('the page and route list is not there (' + path.relative(ROOT, REG_FILE) + '). Make it: ' + GEN_CMD), { refused: true }); }
  j.byKey = new Map(j.routes.map(r => [r.route, r]));
  return (REG = j);
}

// ---- the running GUI (127.0.0.1 only)
function dataDir() {
  try { return require(path.join(ROOT, 'tools', 'lib', 'platform')).dataDir(); } catch (e) { /* this file alone */ }
  if (process.platform === 'win32') return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'ARSENAL');
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'ARSENAL');
  return path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'arsenal');
}
const portOk = p => Number.isInteger(p) && p > 0 && p < 65536;
let lastPort = null;
function candidates(argPort) {
  const out = [], add = (p, how) => { p = Number(p); if (portOk(p) && !out.some(x => x.port === p)) out.push({ port: p, how }); };
  if (argPort != null) add(argPort, 'the port argument');
  if (lastPort) add(lastPort, 'the last port used');
  if (process.env.ARSENAL_GUI_PORT) add(process.env.ARSENAL_GUI_PORT, 'ARSENAL_GUI_PORT');
  try { const j = JSON.parse(fs.readFileSync(path.join(dataDir(), 'gui.json'), 'utf8')); add(j.port, 'the GUI port file'); } catch (e) { /* no GUI started from the command line */ }
  add(DEFAULT_PORT, 'the default port');
  return out;
}
// one request to the GUI on this PC. -> {status, type, json?, text?, bytes?}
function request(port, method, p, o = {}) {
  return new Promise((resolve, reject) => {
    const qs = Object.entries(o.query || {}).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(typeof v === 'object' ? JSON.stringify(v) : String(v))).join('&');
    const body = method === 'POST' ? Buffer.from(JSON.stringify(o.body || {}), 'utf8') : null;
    const headers = Object.assign({ accept: 'application/json' }, o.headers || {});
    if (body) { headers['content-type'] = 'application/json'; headers['content-length'] = body.length; }
    const req = http.request({ host: '127.0.0.1', port, method, path: p + (qs ? '?' + qs : ''), headers, agent: false }, res => {
      const parts = []; let n = 0;
      res.on('data', d => { n += d.length; if (n <= (64 << 20)) parts.push(d); });
      res.on('end', () => {
        const buf = Buffer.concat(parts), type = String(res.headers['content-type'] || '');
        const out = { status: res.statusCode, type };
        if (/json/i.test(type)) {
          const t = buf.toString('utf8');
          if (/ndjson/i.test(type)) out.json = t.split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch (e) { return l; } });
          else { try { out.json = JSON.parse(t); } catch (e) { out.text = t; } }
        } else if (/^text\//i.test(type)) out.text = buf.toString('utf8');
        else out.bytes = n;
        resolve(out);
      });
      res.on('error', reject);
    });
    if (o.timeoutMs) req.setTimeout(o.timeoutMs, () => req.destroy(Object.assign(new Error('no answer in ' + o.timeoutMs + ' ms'), { timeout: true })));
    req.on('error', reject);
    if (o.onReq) o.onReq(req);
    req.end(body || undefined);
  });
}
// -> {port, how, health} of the first candidate that answers as an ARSENAL GUI, or null
async function findGui(argPort) {
  for (const c of candidates(argPort)) {
    try {
      const r = await request(c.port, 'GET', '/api/health', { timeoutMs: 1500 });
      if (r.status === 200 && r.json && r.json.ok === true && typeof r.json.version === 'number') { lastPort = c.port; return { port: c.port, how: c.how, health: r.json }; }
    } catch (e) { /* nothing there */ }
  }
  return null;
}
async function needGui(argPort) {
  const g = await findGui(argPort);
  if (!g) throw Object.assign(new Error('no ARSENAL GUI answers on this PC (tried port ' + candidates(argPort).map(c => c.port).join(', ') + '). Start it: node tools/gui/gui.js --port ' + DEFAULT_PORT + ' (or the tool gui_start).'), { refused: true });
  return g;
}
// the page's saved choices: game tab, mod, game folders. {gameId, mod, games: {id: {dir, mod}}, adv, lang, screen}
async function pageState(g) {
  let s = {}; try { const r = await request(g.port, 'GET', '/api/settings', { timeoutMs: 4000 }); s = (r.json && r.json.settings) || {}; } catch (e) { /* defaults */ }
  const games = s['as2gui.games'] && typeof s['as2gui.games'] === 'object' ? s['as2gui.games'] : {};
  const gameId = GAMES.includes(s['as2gui.gameId']) ? s['as2gui.gameId'] : 'as64', cur = games[gameId] || {};
  return { gameId, games, mod: (typeof cur.mod === 'string' && cur.mod) || (typeof s['as2gui.mod'] === 'string' ? s['as2gui.mod'] : '') || '',
    gameDir: (typeof cur.dir === 'string' && cur.dir) || (typeof s['as2gui.game'] === 'string' ? s['as2gui.game'] : '') || '',
    adv: s['as2gui.adv'] === true, lang: typeof s['as2gui.lang'] === 'string' ? s['as2gui.lang'] : 'en', screen: (typeof cur.screen === 'string' && cur.screen) || (typeof s['as2gui.screen'] === 'string' ? s['as2gui.screen'] : '') };
}
const gameName = id => { try { return (reg().games.find(g => g.id === id) || {}).name || id; } catch (e) { return id; } };

// ---- write and launch rules
const launchOn = () => process.env.ARSENAL_ALLOW_LAUNCH === '1';
const writeRoots = () => String(process.env.ARSENAL_WRITE_ROOTS || '').split(';').map(x => x.trim()).filter(x => x && path.isAbsolute(x)).map(x => path.resolve(x));
const TARGET_FIELDS = ['mod', 'out', 'dir', 'dest', 'to', 'target', 'path', 'file', 'folder', 'root', 'patch', 'pack'];
const lowp = p => (process.platform === 'win32' ? p.toLowerCase() : p);
const inside = (root, p) => { const a = lowp(path.resolve(root)), b = lowp(path.resolve(p)); return b === a || b.startsWith(a.endsWith(path.sep) ? a : a + path.sep); };
// a path inside a game's own resource or packages folder (the folder above holds a game exe)
function inGameData(p) {
  const parts = path.resolve(p).split(path.sep);
  for (let i = parts.length - 1; i > 0; i--) {
    if (!/^(resource|packages)$/i.test(parts[i])) continue;
    const up = parts.slice(0, i).join(path.sep) || path.sep;
    if (['as64.exe', 'mowas_2.exe', 'call_to_arms.exe', path.join('binaries', 'x64', 'call_to_arms.exe')].some(x => fs.existsSync(path.join(up, x)))) return true;
  }
  return false;
}
// the folders a write call names -> a plain refusal, or null. strict = a route known to write (roots must be set)
function writeRefusal(objs, strict) {
  const targets = [];
  for (const o of objs) if (o && typeof o === 'object') for (const k of TARGET_FIELDS) if (typeof o[k] === 'string' && path.isAbsolute(o[k])) targets.push([k, o[k]]);
  for (const [k, p] of targets) if (inGameData(p)) return k + ' = ' + p + ' is inside a game\'s own resource or packages folder: never written.';
  const roots = writeRoots();
  if (!roots.length) return strict && targets.length ? 'writing is off: env ARSENAL_WRITE_ROOTS is not set. Set it to the folders that may be written (; between them), e.g. the mod folder, then call again.' : null;
  for (const [k, p] of targets) if (!roots.some(r => inside(r, p))) return k + ' = ' + p + ' is not inside a folder of ARSENAL_WRITE_ROOTS (' + roots.join('; ') + ').';
  return null;
}

// ---- calls that take long: the answer is kept here until gui_jobs asks
const PENDING = new Map();
const newId = () => 'm' + crypto.randomBytes(7).toString('hex');
function keep(J) { PENDING.set(J.id, J); if (PENDING.size > 40) for (const [k, v] of PENDING) { if (v.state !== 'running') { PENDING.delete(k); if (PENDING.size <= 40) break; } } }

function showResult(res, head) {
  const lines = head ? [head] : [];
  let data;
  if (res.json !== undefined) {
    const s = JSON.stringify(res.json, null, 1);
    lines.push(cut(s, TEXT_MAX - 600));
    if (res.json && typeof res.json === 'object' && s.length <= DATA_MAX) data = Array.isArray(res.json) ? { items: res.json } : res.json;
  } else if (res.text !== undefined) lines.push(cut(res.text, TEXT_MAX - 600));
  else lines.push('(' + res.bytes + ' bytes of ' + (res.type || 'data') + ': not text, not shown. The page shows it; gui_open gives the link.)');
  const failed = res.status >= 400;
  if (failed) lines.unshift('the GUI answered ' + res.status + (res.json && res.json.error ? ': ' + res.json.error : '') + (res.status === 403 ? ' (the GUI takes requests only from this PC, with its own address as Host and Origin, and POST bodies as application/json)' : ''));
  return { text: lines.join('\n'), data, isError: failed };
}

// ---- tools
async function guiStatus(a) {
  const g = await findGui(a.port);
  if (!g) return { text: 'No ARSENAL GUI is running on this PC (tried port ' + candidates(a.port).map(c => c.port).join(', ') + ').\nStart it: node tools/gui/gui.js --port ' + DEFAULT_PORT + '   (or gui_start, which needs ARSENAL_ALLOW_LAUNCH=1).',
    data: { running: false, tried: candidates(a.port).map(c => c.port) } };
  const st = await pageState(g);
  let jobs = []; try { const r = await request(g.port, 'GET', '/api/jobs', { timeoutMs: 4000 }); jobs = (r.json && r.json.jobs) || []; } catch (e) { /* none */ }
  let lan = null; try { const r = await request(g.port, 'GET', '/api/remote', { timeoutMs: 4000 }); lan = r.json ? !!r.json.on : null; } catch (e) { /* unknown */ }
  const running = jobs.filter(j => j.state === 'running');
  const data = { running: true, port: g.port, url: 'http://127.0.0.1:' + g.port + '/', foundBy: g.how, game: st.gameId, gameName: gameName(st.gameId), mod: st.mod || null, gameFolder: st.gameDir || null,
    page: st.screen || null, advanced: st.adv, lang: st.lang, guiMayStartGame: !!g.health.allowLaunch, lanRemote: lan, jobsRunning: running.length, mods: {} };
  for (const id of GAMES) if (st.games[id] && st.games[id].mod) data.mods[id] = st.games[id].mod;
  const text = ['ARSENAL GUI is running: ' + data.url + ' (found by ' + g.how + ')',
    'game tab: ' + data.gameName + ' (' + st.gameId + ')' + (st.gameDir ? ', game folder ' + st.gameDir : ''),
    'mod: ' + (st.mod || 'none picked'), 'page last shown: ' + (st.screen || 'not known') + (st.adv ? ', Advanced on' : ''),
    'the GUI may start the game: ' + (g.health.allowLaunch ? 'yes' : 'no') + '; LAN Remote: ' + (lan === null ? 'not known' : lan ? 'on (view only, behind its key)' : 'off'),
    'jobs running: ' + running.length + (running.length ? ' (' + running.slice(0, 5).map(j => j.id + ' ' + (j.cmd || j.what || j.kind)).join(', ') + ')' : ''),
    'Game tab and mod are what the page saved last; gui_call sends them unless you pass game or mod.'].join('\n');
  return { text, data };
}

function guiPages(a) {
  const R = reg(), word = a.word ? String(a.word).toLowerCase() : '', L = [];
  const games = a.game ? R.games.filter(g => g.id === a.game) : R.games;
  if (a.page) {
    const p = R.pages[a.page]; if (!p) return bad('no page "' + a.page + '". Pages: ' + Object.keys(R.pages).join(', '));
    const routes = R.routes.filter(r => r.page === p.id);
    L.push(p.name + ' (' + p.id + ')' + (p.title ? ': ' + p.title : ''), p.intro || '', p.tab ? 'link: page:' + p.id : 'no tab of its own: it serves every page', p.adv ? 'shown with Advanced on' : '',
      'where: ' + (p.where.length ? [...new Set(p.where.map(w => gameName(w.game) + ' > ' + w.tab + ' > ' + w.sub + (w.view ? ' (view ' + w.view + ')' : '')))].join('; ') : 'in no tab row'),
      routes.length + ' API routes' + (routes.length ? ' (gui_routes page ' + p.id + ')' : ''));
    return { text: L.filter(Boolean).join('\n'), data: { page: p } };
  }
  const hit = (p, extra) => !word || [p.id, p.name, p.title, p.intro, extra || ''].join(' ').toLowerCase().includes(word);
  const shown = new Set();
  for (const g of games) {
    const rows = [];
    for (const t of g.tabs) for (const s of t.subs) {
      const ps = s.pages.filter(p => hit(R.pages[p.page] || { id: p.page, name: p.name }, t.name + ' ' + s.name + ' ' + s.why));
      if (!ps.length) continue;
      ps.forEach(p => shown.add(p.page));
      rows.push('  ' + t.name + ' > ' + s.name + ': ' + ps.map(p => p.name + ' [' + p.ref + ']' + (p.adv ? ' (Advanced)' : '') + (p.na ? ' (not available: ' + p.na + ')' : '') + (p.missing ? ' (no page yet)' : '')).join(', '));
    }
    if (rows.length) L.push(g.name + ' (' + g.id + ', ' + g.exe + '), tabs Alt+1..9:', ...rows);
  }
  if (!L.length) return { text: 'no page matches "' + a.word + '"' };
  L.push('', 'What each page is for:');
  for (const id of Object.keys(R.pages)) {
    const p = R.pages[id]; if (!(shown.has(id) || (!p.tab && hit(p)))) continue;
    L.push('- ' + p.name + ' [' + id + ']' + (p.tab ? '' : ' (no tab)') + ': ' + cut(p.title && p.intro ? p.title + '. ' + p.intro : p.title || p.intro || '(no intro line in the page strings)', 260) + (p.routes ? ' (' + p.routes + ' routes)' : ''));
  }
  L.push('', '[ref] is what gui_open takes (page or page/view). Detail of one page: gui_pages page <id>.');
  return { text: L.join('\n'), data: { games: games.map(g => g.id), pages: [...shown] } };
}

const WRITES_WORD = { no: 'reads only', flag: 'writes when the body holds FLAG: true, else a preview', dry: 'writes unless FLAG is true (gui_call sends FLAG: true unless the body holds write: true)',
  always: 'writes on every call (gui_call sends it only with confirm_write: true)', command: 'runs a command of the contract (see commands; preview unless write: true)',
  launch: 'lets the GUI start the game (needs ARSENAL_ALLOW_LAUNCH=1)', blocked: 'never sent by gui_call', unknown: 'a POST the scan could not class (gui_call sends it only with confirm_write: true)' };
const writesOf = r => WRITES_WORD[r.writes].replace(/FLAG/g, r.flag || 'write') + (r.why ? ': ' + r.why : '') + (r.preview ? '. Preview first: ' + r.preview : '');
const fieldsOf = list => list.map(f => f.name + (f.type ? ':' + f.type : '')).join(', ');
function guiRoutes(a) {
  const R = reg();
  if (a.route) {
    const r = R.byKey.get(String(a.route).trim().replace(/\s+/, ' '));
    if (!r) return bad('no route "' + a.route + '" in the list. Search: gui_routes word <part of the path>. A new route: ' + GEN_CMD);
    const L = [r.route, 'page: ' + r.page + (R.pages[r.page] ? ' (' + R.pages[r.page].name + ')' : ''), r.what ? 'what: ' + r.what : 'what: (no comment beside the route in the GUI code)',
      'query: ' + (fieldsOf(r.query) || 'none read'), 'body: ' + (r.method === 'POST' ? fieldsOf(r.body) || 'none read' : (fieldsOf(r.body) ? fieldsOf(r.body) + ' (a GET sends these in the query)' : 'none')),
      'fields read: ' + r.read + (r.notes ? ' (' + r.notes.join('; ') + ')' : ''), 'writes: ' + writesOf(r), r.remote ? 'also open to a view-only LAN Remote device' : '', r.src ? 'code: ' + r.src : ''];
    const data = { route: r };
    if (r.route === 'POST /api/run') { L.push('commands (body {cmd, input}): ' + R.commands.map(c => c.id + (c.launches ? '*' : '')).join(', ') + '   (* starts the game unless its dry field is set)'); if (a.word) { const c = R.commands.find(x => x.id === a.word); if (c) { L.push(JSON.stringify(c, null, 1)); data.command = c; } } else L.push('fields of one command: gui_routes route "POST /api/run" word <cmd>'); }
    return { text: L.filter(Boolean).join('\n'), data };
  }
  const word = a.word ? String(a.word).toLowerCase() : '';
  let list = R.routes.filter(r => (!a.page || r.page === a.page) && (!a.method || r.method === a.method) && (!a.writes || r.writes === a.writes)
    && (!word || (r.route + ' ' + r.what + ' ' + r.query.concat(r.body).map(f => f.name).join(' ')).toLowerCase().includes(word)));
  if (!a.word && !a.page && !a.method && !a.writes) {
    const by = {}; for (const r of R.routes) by[r.page] = (by[r.page] || 0) + 1;
    return { text: [R.routes.length + ' API routes (' + R.counts.get + ' GET, ' + R.counts.post + ' POST); fields read in full for ' + R.counts.fieldsFull + ', in part for ' + R.counts.fieldsPartial + '.',
      'By page: ' + Object.entries(by).map(([k, n]) => k + ' ' + n).join(', '),
      'Narrow it: gui_routes page <id> | word <text> | method GET|POST | writes no|flag|dry|always|unknown. One route in full: gui_routes route "POST /api/x/..."'].join('\n'), data: { counts: R.counts, byPage: by } };
  }
  const total = list.length, off = Math.max(0, a.offset | 0), lim = Math.min(Math.max(a.limit | 0 || 40, 1), 200);
  list = list.slice(off, off + lim);
  if (!total) return { text: 'no route matches. All pages: ' + [...new Set(R.routes.map(r => r.page))].join(', ') };
  const L = [total + ' routes' + (total > list.length ? ', showing ' + (off + 1) + '-' + (off + list.length) + ' (offset, limit)' : '') + ':'];
  for (const r of list) {
    const f = [r.query.length ? '?' + r.query.map(x => x.name).join('&') : '', r.body.length ? '{' + r.body.map(x => x.name).join(', ') + '}' : ''].filter(Boolean).join(' ');
    L.push(r.route + '  [' + r.writes + (r.flag ? ' ' + r.flag : '') + (r.read !== 'full' ? ', fields ' + r.read : '') + ']' + (f ? '  ' + f : '') + (r.what ? '  | ' + cut(r.what, 140) : ''));
  }
  L.push('', 'Marks: no = reads only; flag X = writes when body X is true; dry X = writes unless X is true; always, unknown = sent only with confirm_write: true; fields partial = the scan did not see every field.');
  return { text: L.join('\n'), data: { total, routes: list.map(r => r.route) } };
}

async function guiCall(a) {
  const R = reg();
  let key = String(a.route || '').trim().replace(/\s+/g, ' ');
  if (!(/^(GET|POST) \/api\/[A-Za-z0-9_\/.-]*[A-Za-z0-9_]$/.test(key) || key === 'GET /' || key === 'GET /console') || key.includes('..')) return bad('route must be "GET /api/..." or "POST /api/..." (a path on the GUI of this PC, never a URL). gui_routes lists them.');
  const method = key.slice(0, key.indexOf(' ')), p = key.slice(key.indexOf(' ') + 1);
  let r = R.byKey.get(key), notes = [];
  if (!r) { r = { route: key, method, path: p, page: '?', query: [], body: [], read: 'none', writes: method === 'GET' ? 'no' : 'unknown' }; notes.push('this route is not in the generated list (' + GEN_CMD + ' after a GUI change): treated as ' + (method === 'GET' ? 'a read' : 'a write of unknown kind')); }
  if (r.writes === 'blocked') return bad(key + ' is never sent from here: ' + (r.why || 'the user does this in the page') + '.');
  if (r.writes === 'launch' && !launchOn()) return bad(key + ' ' + (r.why || 'starts the game') + ': needs env ARSENAL_ALLOW_LAUNCH=1.');
  const query = Object.assign({}, a.query && typeof a.query === 'object' && !Array.isArray(a.query) ? a.query : {});
  let body = method === 'POST' ? Object.assign({}, a.body && typeof a.body === 'object' && !Array.isArray(a.body) ? a.body : {}) : null;
  if (method === 'GET' && a.body && typeof a.body === 'object') for (const [k, v] of Object.entries(a.body)) if (query[k] === undefined) query[k] = v;   // a GET has no body: its fields go in the query
  const g = await needGui(a.port), st = await pageState(g);
  // game tab and mod, the way the page passes them: headers x-arsenal-game and x-arsenal-goh, mod as the field `mod`
  const gameId = a.game || st.gameId, headers = { 'x-arsenal-game': gameId };
  const gohDir = a.goh || (st.games.goh && typeof st.games.goh.dir === 'string' ? st.games.goh.dir : '');
  if (gameId === 'goh' && gohDir) headers['x-arsenal-goh'] = encodeURIComponent(gohDir);
  const takes = n => r.query.concat(r.body).some(f => f.name === n);
  const cur = st.games[gameId] || {}, savedMod = (typeof cur.mod === 'string' && cur.mod) || (gameId === st.gameId ? st.mod : '');
  const bag = method === 'GET' ? query : body;
  if (a.mod) bag.mod = a.mod;
  else if (bag.mod === undefined && savedMod && takes('mod')) { bag.mod = savedMod; notes.push('mod = ' + savedMod + ' (the mod picked in the page)'); }

  // write rule: a preview unless the body asks to write
  const names = new Set(r.body.map(f => f.name)), wantWrite = !!(body && body.write === true);
  let writing = false, strict = true;
  const dropWrite = () => { if (body && !names.has('write') && r.read === 'full') delete body.write; };
  if (r.writes === 'flag') {
    if (wantWrite && r.flag !== 'write' && body[r.flag] === undefined) body[r.flag] = true;
    writing = body[r.flag] === true;
    if (r.flag !== 'write') dropWrite();
    if (!writing) notes.push('preview: nothing is written (to write, send ' + r.flag + ': true in the body)');
  } else if (r.writes === 'dry') {
    writing = wantWrite || body[r.flag] === false;
    if (writing) { if (body[r.flag] === undefined) body[r.flag] = false; }
    else { body[r.flag] = true; notes.push('preview: sent with ' + r.flag + ': true, nothing is written (to write, send write: true in the body)'); }
    dropWrite();
  } else if (r.writes === 'always' || r.writes === 'unknown') {
    strict = r.writes === 'always';
    if (a.confirm_write !== true) {
      return { text: ['not sent: ' + key + ' ' + (r.writes === 'always' ? 'writes on every call and has no preview of its own.' : 'is a POST whose effect the route scan could not class (it may write or start work).'),
        'It would be sent to the GUI on port ' + g.port + ' for ' + gameName(gameId) + ' with the body: ' + cut(JSON.stringify(body), 1500),
        r.what ? 'what it does: ' + r.what : '', r.preview ? 'Call first, to see what it would do: ' + r.preview + (R.byKey.get(r.preview).writes === 'no' ? '' : ' (itself a preview unless asked to write)') : 'No preview route sits beside it: read it with gui_routes route "' + key + '" first.',
        'To send it, call again with confirm_write: true (an argument of gui_call, not a body field).'].filter(Boolean).join('\n'), data: { sent: false, preview: true, route: key, body, game: gameId, previewRoute: r.preview || null, needs: 'confirm_write' } };
    }
    writing = true; dropWrite();
  } else if (r.writes === 'command') {
    const c = R.commands.find(x => x.id === body.cmd);
    if (!c) return bad('body.cmd must be a command of the contract: ' + R.commands.map(x => x.id).join(', '));
    const input = body.input = Object.assign({}, body.input && typeof body.input === 'object' ? body.input : {});
    delete body.write; query.stream = '0';
    if (c.read) writing = false;
    else if (c.dry) {
      const isDry = input[c.dry.field] === c.dry.value;
      writing = wantWrite && !isDry;
      if (writing) { if (c.dry.write !== undefined && input[c.dry.field] === undefined) input[c.dry.field] = c.dry.write; }
      else if (!isDry) { input[c.dry.field] = c.dry.value; notes.push('preview: command ' + c.id + ' sent with ' + c.dry.field + ': ' + JSON.stringify(c.dry.value) + ' (to run it for real, send write: true in the body)'); }
    } else {
      if (a.confirm_write !== true) return { text: 'not sent: the command ' + c.id + ' has no dry run in the contract (' + c.what + '). To run it, call again with confirm_write: true.', data: { sent: false, preview: true, route: key, body, needs: 'confirm_write' } };
      writing = true;
    }
    if (c.launches && writing && !launchOn()) return bad('the command ' + c.id + ' starts the game: needs env ARSENAL_ALLOW_LAUNCH=1 (its dry run is sent without it).');
    const why = writing ? writeRefusal([input], true) : null; if (why) return bad(why);
  }
  if (writing && r.writes !== 'command') {
    const why = writeRefusal([body, query], strict); if (why) return bad(why);
    // a GUI session that may start the game: a call of unknown effect could start it
    if (r.writes === 'unknown' && g.health.allowLaunch && !launchOn()) return bad('this GUI session may start the game and the effect of ' + key + ' is not classed: needs env ARSENAL_ALLOW_LAUNCH=1.');
  }

  if (body && Buffer.byteLength(JSON.stringify(body), 'utf8') > (8 << 20)) return bad('the body is over 8 MB: the GUI takes JSON bodies up to 8 MB.');
  // send. A call that outlasts waitMs goes on in the background: its id is the GUI job id.
  const id = newId(), J = { id, route: key, game: gameId, startedMs: Date.now(), state: 'running', res: null, error: null, writing };
  headers['x-arsenal-job'] = id;
  const prom = request(g.port, method, p, { query, body, headers, onReq: q => { J.req = q; } }).then(res => { J.state = 'done'; J.res = res; J.endedMs = Date.now(); }, e => { J.state = 'failed'; J.error = e.message; J.endedMs = Date.now(); });
  keep(J);
  const waitMs = Math.min(Math.max(a.waitMs == null ? 25000 : a.waitMs | 0, 0), 110000);
  await Promise.race([prom, sleep(waitMs)]);
  if (J.state === 'running') return { text: ['still running after ' + Math.round(waitMs / 1000) + ' s: job ' + id + ' (' + key + ').', 'gui_jobs id ' + id + ' gives its state and, when it ended, its answer; gui_jobs id ' + id + ' stop true stops it.'].concat(notes).join('\n'), data: { job: id, state: 'running', route: key } };
  PENDING.delete(id);
  if (J.state === 'failed') return { text: 'the call did not reach the GUI or broke off: ' + J.error, isError: true };
  const head = [key + ' -> ' + J.res.status + ' (' + gameName(gameId) + (writing ? ', written' : '') + ', ' + (J.endedMs - J.startedMs) + ' ms)'].concat(notes).join('\n');
  return showResult(J.res, head);
}

async function guiJobs(a) {
  const g = await needGui(a.port);
  let list = []; try { const r = await request(g.port, 'GET', '/api/jobs', { timeoutMs: 5000 }); list = (r.json && r.json.jobs) || []; } catch (e) { /* none */ }
  if (a.id) {
    const id = String(a.id), J = PENDING.get(id), row = list.find(j => j.id === id);
    if (a.stop === true) {
      const r = await request(g.port, 'POST', '/api/cancel', { body: { id }, timeoutMs: 8000 });
      if (r.status === 200) return { text: 'stop sent to job ' + id + '.', data: { id, stopped: true } };
      return { text: 'job ' + id + ' was not stopped: ' + (r.status === 404 ? 'no such running job (it ended, or the id is wrong)' : r.status === 409 ? 'this job cannot be stopped now' : 'the GUI answered ' + r.status + ' ' + ((r.json && r.json.error) || '')), isError: r.status !== 404, data: { id, stopped: false } };
    }
    if (J && J.state !== 'running') {
      PENDING.delete(id);
      if (J.state === 'failed') return { text: 'job ' + id + ' (' + J.route + ') broke off: ' + J.error, isError: true };
      return showResult(J.res, 'job ' + id + ' (' + J.route + ') ended after ' + Math.round((J.endedMs - J.startedMs) / 1000) + ' s -> ' + J.res.status);
    }
    if (row) return { text: 'job ' + id + ': ' + row.state + (row.stage ? ', ' + row.stage : '') + (row.total ? ', ' + row.done + ' of ' + row.total : '') + ', ' + Math.round((Date.now() - row.startedMs) / 1000) + ' s' + (row.canCancel ? ' (can be stopped: stop true)' : '')
      + (J ? '' : '\nThis job was not started from here, so its answer goes to the page that started it; a background job is read through its page\'s own status route (gui_routes word status).'), data: { job: row } };
    if (J) return { text: 'job ' + id + ' (' + J.route + ') is still running, ' + Math.round((Date.now() - J.startedMs) / 1000) + ' s.', data: { job: id, state: 'running' } };
    return { text: 'no job ' + id + ': it ended and its answer was already given, or the id is wrong.', data: { id, state: 'unknown' } };
  }
  const mine = [...PENDING.values()];
  const L = [list.length + ' job' + (list.length === 1 ? '' : 's') + ' in the GUI:'];
  for (const j of list.slice(0, 60)) L.push('  ' + j.id + '  ' + j.kind + '  ' + j.state + '  ' + (j.cmd || j.what || j.page || '') + (j.game ? '  ' + j.game : '') + (j.writes ? '  writes' : '') + (j.canCancel ? '  can stop' : ''));
  if (mine.length) { L.push('started from here:'); for (const J of mine) L.push('  ' + J.id + '  ' + J.state + '  ' + J.route + (J.state !== 'running' ? '  (answer waiting: gui_jobs id ' + J.id + ')' : '')); }
  return { text: L.join('\n'), data: { jobs: list.slice(0, 200), mine: mine.map(J => ({ id: J.id, state: J.state, route: J.route })) } };
}

async function guiOpen(a) {
  const R = reg(), ref = String(a.page || '').trim() + (a.view ? '/' + String(a.view).trim() : ''), [pid, view] = ref.split('/');
  const p = R.pages[pid];
  if (!p || !p.tab) return bad('no page "' + pid + '". Pages: ' + Object.values(R.pages).filter(x => x.tab).map(x => x.id).join(', '));
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(view || 'x')) return bad('view: a view id of the page (gui_pages page ' + pid + ')');
  const g = await findGui(a.port), port = g ? g.port : DEFAULT_PORT;
  const url = 'http://127.0.0.1:' + port + '/#go=' + encodeURIComponent('page:' + pid + (view ? '/' + view : ''));
  const where = [...new Set(p.where.filter(w => !view || w.view === view || !w.view).map(w => gameName(w.game) + ' > ' + w.tab + ' > ' + w.sub))];
  const L = [url, 'Opens ' + p.name + (view ? ' (' + view + ')' : '') + ' in the GUI' + (p.adv ? ' (the page shows only with Advanced on)' : '') + '. The link picks the page only: the game tab and the mod stay what the user picked in the window. Give the link to the user; nothing is opened from here.',
    where.length ? 'By hand: ' + where.join('; ') : ''];
  if (!g) L.push('No GUI is running now: the link works once it runs on port ' + port + ' (node tools/gui/gui.js --port ' + port + ').');
  if (view && !p.where.some(w => w.view === view)) L.push('Note: the tab rows name no view "' + view + '" for this page; the page opens on its first view if it does not know it.');
  return { text: L.filter(Boolean).join('\n'), data: { url, page: pid, view: view || null, running: !!g } };
}

// the page strings, from the GUI's own files (core lang/<l>.json + each ext's lang), read at the first call
const LANGS = ['en', 'ru', 'uk', 'zh'], langCache = {};
function strings(l) {
  if (langCache[l]) return langCache[l];
  const dir = path.join(ROOT, 'tools', 'gui'), out = Object.assign({}, JSON.parse(fs.readFileSync(path.join(dir, 'lang', l + '.json'), 'utf8')));
  let ext = []; try { ext = require(path.join(dir, 'ext')); } catch (e) { out.__problem = 'the page strings of the ext pages did not load: ' + String(e.message).split('\n')[0]; }
  for (const x of ext) Object.assign(out, (x.lang && x.lang[l]) || {});
  return (langCache[l] = out);
}
function guiLang(a) {
  const l = a.lang || 'en';
  const S = strings(l), EN = l === 'en' ? S : strings('en');
  if (a.key) {
    const k = String(a.key), v = S[k], e = EN[k];
    if (v === undefined && e === undefined) {
      const near = Object.keys(EN).filter(x => x.startsWith(k.split('.')[0] + '.') && x.toLowerCase().includes(k.split('.').pop().toLowerCase())).slice(0, 12);
      return { text: 'no page string with the key "' + k + '"' + (near.length ? '. Near: ' + near.join(', ') : '') + '. Search by text: gui_lang word <text>.', data: { key: k, found: false } };
    }
    return { text: k + ' (' + l + '): ' + (v !== undefined ? v : '(not translated, the page shows English) ' + e) + (l !== 'en' && e !== undefined ? '\nen: ' + e : ''), data: { key: k, lang: l, text: v !== undefined ? v : null, en: e !== undefined ? e : null } };
  }
  if (!a.word) return bad('give key (a string key, e.g. units.title) or word (text to search in keys and strings)');
  const w = String(a.word).toLowerCase(), lim = Math.min(Math.max(a.limit | 0 || 30, 1), 200);
  const hits = Object.keys(S).filter(k => k !== '__problem' && (k.toLowerCase().includes(w) || String(S[k]).toLowerCase().includes(w)));
  return { text: [hits.length + ' strings match "' + a.word + '" (' + l + ')' + (hits.length > lim ? ', first ' + lim : '') + ':'].concat(hits.slice(0, lim).map(k => k + ' = ' + cut(String(S[k]).replace(/\s+/g, ' '), 200))).concat(S.__problem ? [S.__problem] : []).join('\n'),
    data: { total: hits.length, keys: hits.slice(0, lim) } };
}

async function guiStart(a) {
  if (!launchOn()) return bad('starting the GUI is a launch: needs env ARSENAL_ALLOW_LAUNCH=1. Or the user starts it: node tools/gui/gui.js --port ' + DEFAULT_PORT);
  const had = await findGui(a.port);
  if (had) return { text: 'the GUI already runs: http://127.0.0.1:' + had.port + '/ (found by ' + had.how + '). Nothing was started.', data: { started: false, running: true, port: had.port } };
  const port = a.port != null ? a.port | 0 : Number(process.env.ARSENAL_GUI_PORT) || DEFAULT_PORT;
  if (!portOk(port)) return bad('port: 1..65535');
  if (!fs.existsSync(GUI_JS)) return bad('tools/gui/gui.js is not there');
  const env = Object.assign({}, process.env); delete env.NODE_OPTIONS;
  let child;
  try { child = require('child_process').spawn(process.execPath, [GUI_JS, '--port', String(port), '--no-open'], { cwd: ROOT, env, detached: true, stdio: 'ignore', windowsHide: true, shell: false }); child.unref(); }
  catch (e) { return { text: 'the GUI did not start: ' + e.message, isError: true }; }
  let dead = false; child.on('exit', () => { dead = true; }); child.on('error', () => { dead = true; });
  for (let i = 0; i < 120 && !dead; i++) {
    await sleep(500);
    try { const r = await request(port, 'GET', '/api/health', { timeoutMs: 1500 }); if (r.status === 200 && r.json && r.json.ok) { lastPort = port; return { text: 'the GUI is started: http://127.0.0.1:' + port + '/ (it keeps running after this server ends; the browser was not opened: gui_open gives a link).', data: { started: true, running: true, port, pid: child.pid } }; } } catch (e) { /* not up yet */ }
  }
  return { text: 'the GUI did not answer on port ' + port + (dead ? ': its process ended (the port may be taken)' : ' within 60 s') + '.', isError: true };
}

const GAME_ARG = { type: 'string', enum: GAMES, description: 'game tab: as64, mowas2 or goh. Default: the tab the page is on.' };
const PORT_ARG = { type: 'integer', description: 'port of the GUI when it is not found by itself (default: ARSENAL_GUI_PORT, the GUI port file, 47811)' };
const tools = [
  { name: 'gui_status', title: 'Is the ARSENAL GUI running', kind: 'read', games: GAMES,
    description: 'Use first. Says whether an ARSENAL GUI runs on this PC, its port and link, which game tab it is on (MoW:AS2, AS64, GoH), which mod is picked, the game folder, whether it may start the game, and the jobs running.',
    inputSchema: { type: 'object', properties: { port: PORT_ARG } }, handler: guiStatus },
  { name: 'gui_pages', title: 'Tabs and pages of the GUI', kind: 'read', games: GAMES,
    description: 'The tabs, sub-tabs and pages of the GUI for all three game tabs, with what each page is for (the page\'s own title and intro). game narrows to one game tab, word searches names and intros, page gives one page in full (where it sits, how many routes).',
    inputSchema: { type: 'object', properties: { game: { type: 'string', enum: GAMES }, word: { type: 'string' }, page: { type: 'string', description: 'a page id, e.g. units' } } }, handler: guiPages },
  { name: 'gui_routes', title: 'API routes of the GUI', kind: 'read', games: GAMES,
    description: 'The GUI\'s API routes: method, path, the query and body fields the handler reads, what it does, and whether it writes. No argument: counts by page. page, word, method, writes narrow the list; route gives one route in full (for "POST /api/run" add word <cmd> for a command\'s fields). The list is generated from the GUI code; fields marked partial were not all found.',
    inputSchema: { type: 'object', properties: { page: { type: 'string', description: 'page id, or core' }, word: { type: 'string', description: 'part of a path, a field name or a word of the description' },
      method: { type: 'string', enum: ['GET', 'POST'] }, writes: { type: 'string', enum: ['no', 'flag', 'dry', 'always', 'command', 'launch', 'blocked', 'unknown'] },
      route: { type: 'string', description: 'one route, e.g. "POST /api/x/units/change"' }, limit: { type: 'integer' }, offset: { type: 'integer' } } }, handler: guiRoutes },
  { name: 'gui_call', title: 'Call one GUI route', kind: 'write', games: GAMES,
    description: 'Calls one API route of the running GUI and gives its JSON answer. route = "GET /api/..." or "POST /api/..." (gui_routes). query and body hold the fields. game and mod go the way the page sends them (default: the page\'s game tab and picked mod). '
      + 'Routes with a write flag answer a preview unless body.write is true; a route that writes on every call, or that is not classed, is not sent unless confirm_write is true (the answer names the preview route to call first). A real write must name folders inside ARSENAL_WRITE_ROOTS. POST bodies are JSON, up to 8 MB. A call that takes longer than waitMs (default 25 s) answers a job id for gui_jobs.',
    inputSchema: { type: 'object', required: ['route'], properties: { route: { type: 'string', description: '"GET /api/x/units/status", "POST /api/x/units/search"' }, query: { type: 'object', description: 'query fields' },
      body: { type: 'object', description: 'JSON body of a POST. write: true asks a write route to write.' }, game: GAME_ARG, goh: { type: 'string', description: 'the Gates of Hell folder, when game is goh and the page has none saved' },
      mod: { type: 'string', description: 'mod folder (full path). Default: the mod picked in the page, for routes that take mod.' }, confirm_write: { type: 'boolean', description: 'true = send a route that writes on every call or that is not classed (writes: always, unknown), or a command with no dry run. Call its preview route first.' },
      waitMs: { type: 'integer', description: 'how long to wait for the answer before giving a job id (0..110000, default 25000)' }, port: PORT_ARG } }, handler: guiCall },
  { name: 'gui_jobs', title: 'Jobs of the GUI', kind: 'read', games: GAMES,
    description: 'No argument: the jobs running in the GUI and the calls started from here. id: the state of one job and, for a gui_call that ended, its answer. id with stop: true stops a running job.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, stop: { type: 'boolean', description: 'with id: stop the job' }, port: PORT_ARG } }, handler: guiJobs },
  { name: 'gui_open', title: 'Link to a GUI page', kind: 'read', games: GAMES,
    description: 'The link of one page of the GUI (#go=page:<ref>, and where it sits in the tabs) for the user to open in the browser. page = a page id or page/view from gui_pages. The link never picks the game tab or the mod. Opens nothing by itself.',
    inputSchema: { type: 'object', required: ['page'], properties: { page: { type: 'string', description: 'page id or page/view, e.g. units or docs/engine' }, view: { type: 'string' }, port: PORT_ARG } }, handler: guiOpen },
  { name: 'gui_lang', title: 'A string of the GUI', kind: 'read', games: GAMES,
    description: 'The text of a page string by its key in a language (en, ru, uk, zh), or with word a search over keys and texts. Use it to tell the user the exact label of a button or page.',
    inputSchema: { type: 'object', properties: { key: { type: 'string', description: 'e.g. units.title, nav.mods' }, word: { type: 'string' }, lang: { type: 'string', enum: LANGS }, limit: { type: 'integer' } } }, handler: guiLang },
  { name: 'gui_start', title: 'Start the GUI', kind: 'launch', games: GAMES,
    description: 'Starts the ARSENAL GUI on this PC when none runs (node tools/gui/gui.js, port 47811 or the one given; no browser is opened). Refused unless env ARSENAL_ALLOW_LAUNCH=1.',
    inputSchema: { type: 'object', properties: { port: { type: 'integer', description: 'port to start on (default 47811)' } } }, handler: guiStart },
];

// ---- MCP
const typeOf = v => (Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v === 'number' && Number.isInteger(v) ? 'integer' : typeof v);
function checkArgs(tool, args) {
  if (typeOf(args) !== 'object') return 'arguments must be an object';
  const s = tool.inputSchema, props = s.properties || {};
  for (const k of s.required || []) if (args[k] === undefined || args[k] === null || args[k] === '') return 'argument "' + k + '" is needed';
  for (const k of Object.keys(args)) {
    const v = args[k], p = props[k]; if (v === undefined || v === null) continue;
    if (!p) return 'unknown argument "' + k + '". This tool takes: ' + Object.keys(props).join(', ');
    const have = typeOf(v);
    if (p.type && !(p.type === have || (p.type === 'number' && have === 'integer'))) return 'argument "' + k + '" must be ' + p.type;
    if (Array.isArray(p.enum) && !p.enum.includes(v)) return 'argument "' + k + '" must be one of: ' + p.enum.join(', ');
    if (typeof v === 'string' && v.includes('\0')) return 'argument "' + k + '" holds a character that is not allowed';
    if (typeof v === 'string' && k !== 'word' && v.trim().startsWith('-')) return 'argument "' + k + '" may not start with "-"';
  }
  return null;
}
function shape(r) {
  if (typeof r === 'string') r = { text: r };
  if (!r || typeof r !== 'object') r = { text: 'error: the tool gave no answer', isError: true };
  const out = { isError: !!r.isError }; let tail = '';
  if (typeOf(r.data) === 'object') { let n = -1; try { n = JSON.stringify(r.data).length; } catch (e) { /* not JSON */ } if (n >= 0 && n <= DATA_MAX) out.structuredContent = r.data; else if (n > DATA_MAX) tail = '\n[data left out: ' + n + ' chars, ask for less]'; }
  out.content = [{ type: 'text', text: cut(r.text || (out.structuredContent ? JSON.stringify(out.structuredContent, null, 1) : '(no output)')) + tail }];
  return out;
}
async function call(name, args) {
  const tool = tools.find(t => t.name === name); if (!tool) return null;
  args = args == null ? {} : args;
  const why = checkArgs(tool, args); if (why) return shape(bad(why));
  try { return shape(await tool.handler(Object.assign({}, args))); }
  catch (e) {
    if (e && e.refused) return shape({ text: e.message, isError: true });
    process.stderr.write('arsenal-gui: ' + name + ' failed: ' + (e && e.stack || e) + '\n');
    return shape({ text: 'error: ' + name + ' failed: ' + String(e && e.message || e).split('\n')[0], isError: true });
  }
}
const listTools = () => tools.map(t => ({ name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema,
  annotations: { title: t.title, readOnlyHint: t.kind === 'read', destructiveHint: false, openWorldHint: false } }));
async function handle(msg) {
  if (!msg || typeof msg !== 'object' || Array.isArray(msg) || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    if (msg && typeof msg === 'object' && !Array.isArray(msg) && msg.method === undefined && (msg.result !== undefined || msg.error !== undefined)) return null;
    return { jsonrpc: '2.0', id: msg && typeof msg === 'object' && msg.id !== undefined ? msg.id : null, error: { code: -32600, message: 'invalid request' } };
  }
  const { id, method } = msg, params = msg.params && typeof msg.params === 'object' ? msg.params : {};
  const isReq = id !== undefined && id !== null;
  const ok = result => (isReq ? { jsonrpc: '2.0', id, result } : null), err = (code, message) => (isReq ? { jsonrpc: '2.0', id, error: { code, message } } : null);
  switch (method) {
    case 'initialize': return ok({ protocolVersion: typeof params.protocolVersion === 'string' && VERSIONS.includes(params.protocolVersion) ? params.protocolVersion : VERSIONS[0],
      capabilities: { tools: { listChanged: false }, resources: {}, prompts: {} }, serverInfo: INFO, instructions: INSTRUCTIONS });
    case 'ping': return ok({});
    case 'tools/list': return ok({ tools: listTools() });
    case 'resources/list': return ok({ resources: [] });
    case 'resources/templates/list': return ok({ resourceTemplates: [] });
    case 'prompts/list': return ok({ prompts: [] });
    case 'tools/call': {
      if (typeof params.name !== 'string') return err(-32602, 'tools/call needs a tool name');
      const r = await call(params.name, params.arguments);
      return r ? ok(r) : err(-32602, 'unknown tool: ' + params.name.slice(0, 80));
    }
    default: return method.startsWith('notifications/') ? null : err(-32601, 'method not found: ' + method.slice(0, 80));
  }
}
function serve() {
  let buf = '', open = 0, ended = false;
  const out = o => { if (o) process.stdout.write(JSON.stringify(o) + '\n'); };
  const done = () => { if (ended && open === 0) { for (const J of PENDING.values()) if (J.state === 'running' && J.req) J.req.destroy(); process.exitCode = 0; setImmediate(() => process.exit(0)); } };
  const line = l => {
    if (!l.trim()) return;
    let msg; try { msg = JSON.parse(l); } catch (e) { return out({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } }); }
    open++;
    handle(msg).then(out, e => out({ jsonrpc: '2.0', id: msg && msg.id !== undefined ? msg.id : null, error: { code: -32603, message: String(e && e.message || e).split('\n')[0] } })).then(() => { open--; done(); });
  };
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i).replace(/\r$/, ''); buf = buf.slice(i + 1); line(l); } });
  process.stdin.on('end', () => { if (buf.trim()) line(buf); buf = ''; ended = true; done(); });
  process.stdout.on('error', () => process.exit(0));
}

module.exports = { tools, listTools, handle, INFO, GEN_CMD, REG_FILE, _t: { writeRefusal, inGameData, candidates } };

if (require.main === module) {
  const arg = process.argv[2];
  if (arg === '--list') { process.stdout.write(JSON.stringify({ server: INFO.name, tools: tools.map(t => ({ name: t.name, title: t.title, description: t.description, kind: t.kind, games: t.games, inputSchema: t.inputSchema })) }, null, 1) + '\n'); }
  else if (arg === '--gen') {
    const gen = require('./gui/gen'), r = gen.build(), f = gen.write(r), c = r.counts;
    console.log('wrote ' + path.relative(ROOT, f).split(path.sep).join('/') + ': ' + c.pages + ' pages (+' + c.pagesNoTab + ' without a tab) in ' + c.games + ' game tabs, ' + c.routes + ' routes (' + c.get + ' GET, ' + c.post + ' POST), fields read in full for '
      + c.fieldsFull + ', in part for ' + c.fieldsPartial + ', not for ' + c.fieldsNone + '; ' + c.withFields + ' routes with fields, ' + c.described + ' with a description; writes: ' + Object.entries(c.writes).map(([k, n]) => k + ' ' + n).join(', ') + '; ' + c.commands + ' commands');
    if (fs.existsSync(path.join(ROOT, SKILL_REFRESH))) console.log('then: node ' + SKILL_REFRESH + '   (the page list of the skill arsenal-gui-use)');
    process.exit(0);   // the GUI modules leave handles open
  } else if (arg === '--check') {
    const gen = require('./gui/gen'); let saved = null; try { saved = gen.load(); } catch (e) { /* none */ }
    const d = saved ? gen.drift(saved, gen.build({ fields: false })) : { ok: false, lines: ['registry.json is not there'] };
    if (d.ok) console.log('registry.json matches the GUI code'); else { for (const l of d.lines.slice(0, 40)) console.log(l); console.log('run: ' + GEN_CMD); }
    process.exit(d.ok ? 0 : 1);
  } else if (arg === '--help' || arg === '-h') console.log('usage: node tools/mcp/gui.js [--gen | --check | --list]   (no argument: MCP server on stdin/stdout)');
  else if (arg) { console.error('usage: node tools/mcp/gui.js [--gen | --check | --list]'); process.exit(2); }
  else serve();
}

// Author: Imperator_Aug (ARSENAL, ia-973c49d0)
'use strict';
// goh-parity.js: the repeatable GoH-vs-AS64 check of the GUI's read-only API routes. Not part of the default test run.
//   node tools/gui/test/goh-parity.js [--json] [--out] [--as64-mod <dir>] [--goh-mod <dir>] [--only <word>] [--timeout ms]
// Starts the GUI in-process on a free port (scratch under ARSENAL_TMP), reads the route list the MCP layer uses
// (tools/mcp/gui/registry.json, made by `node tools/mcp/gui.js --gen`), and calls every route marked `writes: no` (minus a deny list:
// jobs, launches, opens, long polls, anything unsure) twice with the same minimal body: game as64 and game goh, each with a small real
// mod folder of that game. Each route is classed for GoH against AS64: same / refused (reason) / bad input / error / slower than 10x.
// It also greps tools/gui/ext for game gates (goh refused or `na`) and lists them with file:line. Game data and mods are only read.
const fs = require('fs'), path = require('path'), http = require('http');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const argv = process.argv.slice(2), arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const JSON_OUT = argv.includes('--json'), OUT = arg('--out', path.join(ROOT, 'plan', 'reports', 'goh-parity.md'));
const TIMEOUT = +arg('--timeout', 90000), ONLY = arg('--only', ''), PAR = +arg('--par', 4);

// routes never called: they start work, open windows, long-poll, change state or need a live id
const DENY = /\/(cancel|answer|follow|open|start|outstart|run|update|npp|blender|job|jobs|export|edshot|undo|undo-ok|install|download|uploader|inbox|live|console|joinstatus|progress|clashprogress|modcheck)(\/|$)|^\/$|\/api\/remote/;

function findMods() {
  const games = require('../../lib/games');
  const as2 = games.install('as64').dir, goh = games.install('goh').dir;
  const small = (base, prefer) => {
    if (!base) return null; const mods = path.join(base, 'mods'); let names = [];
    try { names = fs.readdirSync(mods, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name); } catch (e) { return null; }
    for (const p of prefer) if (names.includes(p)) return path.join(mods, p);
    return names.length ? path.join(mods, names[0]) : null;
  };
  return { as2, goh,
    as64Mod: arg('--as64-mod', small(as2, ['jaben mod v6.25', 'robz realism mod 1.30.10'])),
    gohMod: arg('--goh-mod', small(goh, ['targeting_testing', 'template'])) };
}

function call(port, r, game, mod, gohDir) {
  return new Promise(resolve => {
    const t0 = Date.now(), takes = n => r.query.concat(r.body).some(f => f.name === n);
    const q = new URLSearchParams(), body = {};
    if (takes('mod') && mod) (r.method === 'GET' ? q.set('mod', mod) : body.mod = mod);
    const headers = { 'x-arsenal-game': game, host: '127.0.0.1:' + port };
    if (game === 'goh' && gohDir) headers['x-arsenal-goh'] = encodeURIComponent(gohDir);
    const data = r.method === 'POST' ? JSON.stringify(body) : null;
    if (data) { headers['content-type'] = 'application/json'; headers['content-length'] = Buffer.byteLength(data); }
    const qs = q.toString();
    const req = http.request({ host: '127.0.0.1', port, method: r.method, path: r.path + (qs ? '?' + qs : ''), headers, agent: false }, res => {
      const bufs = []; let n = 0;
      res.on('data', b => { if (n < 400000) bufs.push(b); n += b.length; });
      res.on('end', () => { let j = null; const t = Buffer.concat(bufs).toString('utf8'); try { j = JSON.parse(t); } catch (e) { /* not JSON */ } resolve({ status: res.statusCode, ms: Date.now() - t0, json: j, text: j ? '' : t.slice(0, 200) }); });
    });
    req.setTimeout(TIMEOUT, () => { req.destroy(); resolve({ status: 0, ms: Date.now() - t0, timeout: true }); });
    req.on('error', e => resolve({ status: 0, ms: Date.now() - t0, err: e.message }));
    if (data) req.write(data); req.end();
  });
}

// a game refusal: an `na` mark, or a 4xx that names the game
// (a translation key that names GoH, e.g. missions.e.spgoh or bots.e.goh, is a refusal too)
const REFUSE_WORDS = /\bgoh\b|^[a-z0-9_.]+\.[a-z]*goh[a-z]*$|gates of hell|not (available|for this game|in this game)|this game|game tab|only for|na\./i;
function classOf(x) {
  if (x.timeout) return 'timeout';
  if (!x.status) return 'error';
  const j = x.json || {}, why = String(j.error || j.why || j.message || j.note || j.key || x.text || '').slice(0, 160);
  const na = j.na || j.state === 'na' || (typeof j.key === 'string' && /^na\./.test(j.key));
  if (x.status >= 500) return 'error';
  if (na || (x.status >= 400 && REFUSE_WORDS.test(why))) return 'refused';
  if (x.status >= 400) return 'bad';
  return 'ok';
}
const whyOf = x => { const j = x.json || {}; let w = j.error || (typeof j.na === 'string' ? j.na : '') || j.why || j.message || j.note || j.key || x.text || x.err || (x.timeout ? 'timeout ' + TIMEOUT + ' ms' : ''); if (typeof w !== 'string') w = JSON.stringify(w); return w.replace(/\s+/g, ' ').slice(0, 140); };

function verdict(a, g) {
  if (g.cls === 'error' && a.cls !== 'error') return 'goh-error';
  if (g.cls === 'timeout' && a.cls !== 'timeout') return 'goh-timeout';
  if (g.cls === 'refused' && a.cls !== 'refused') return 'goh-refused';
  if (g.cls === 'bad' && a.cls === 'ok') return 'goh-bad';
  if (a.cls === 'ok' && g.cls === 'ok' && g.ms > 1000 && g.ms > 10 * Math.max(a.ms, 50)) return 'goh-slow';
  if (g.cls === 'ok' && a.cls !== 'ok') return 'goh-better';
  return 'same';
}

function gates() {
  const out = [], dir = path.join(ROOT, 'tools', 'gui', 'ext');
  const re = /(kind\s*===\s*'goh'|=== 'goh'|isGoh|gid === 'goh')[^\n]*(\bna\b|refuse|notFor|throw|return\s*\{\s*state:\s*'na'|naCard|na:)|naCard\('na\.[^']*goh|na\.[a-z0-9_.]*\.goh/;
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (!/^(test|node_modules)$/.test(e.name)) walk(p); continue; }
      if (!/\.js$/.test(e.name) || /^test/.test(e.name)) continue;
      fs.readFileSync(p, 'utf8').split('\n').forEach((l, i) => { if (re.test(l)) out.push(path.relative(ROOT, p).replace(/\\/g, '/') + ':' + (i + 1) + '  ' + l.trim().slice(0, 150)); });
    }
  })(dir);
  return out;
}

async function main() {
  // scratch: ARSENAL_TMP when set, else the system temp folder (tools/lib/platform)
  const M = findMods();
  if (!M.goh) { console.log('goh-parity: skipped, Gates of Hell is not installed'); return; }
  if (!M.as2) { console.log('goh-parity: skipped, Assault Squad 2 / AS64 is not installed'); return; }
  const reg = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'mcp', 'gui', 'registry.json'), 'utf8'));
  const routes = reg.routes.filter(r => r.writes === 'no' && !DENY.test(r.path) && (!ONLY || r.route.includes(ONLY)));
  const skipped = reg.routes.filter(r => r.writes === 'no' && DENY.test(r.path)).map(r => r.route);
  const tmp = path.join(require('../../lib/platform').tmpDir(), 'goh-parity-' + process.pid);
  const G = require('../gui');
  const srv = await G.start({ port: 0, tmpRoot: tmp });
  const t0 = Date.now(), rows = [];
  try {
    let i = 0;
    const worker = async () => { while (i < routes.length) { const r = routes[i++];
      const a = await call(srv.port, r, 'as64', M.as64Mod, null), g = await call(srv.port, r, 'goh', M.gohMod, M.goh);
      a.cls = classOf(a); g.cls = classOf(g);
      rows.push({ route: r.route, page: r.page, as64: { cls: a.cls, status: a.status, ms: a.ms, why: a.cls === 'ok' ? '' : whyOf(a) }, goh: { cls: g.cls, status: g.status, ms: g.ms, why: g.cls === 'ok' ? '' : whyOf(g) }, v: verdict(a, g) });
    } };
    await Promise.all(Array.from({ length: PAR }, worker));
  } finally { await srv.close(); try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* scratch */ } }
  rows.sort((x, y) => x.page.localeCompare(y.page) || x.route.localeCompare(y.route));
  const count = (k, c) => rows.filter(r => r[k].cls === c).length, CL = ['ok', 'refused', 'bad', 'error', 'timeout'];
  const totals = { as64: {}, goh: {}, verdict: {} };
  for (const c of CL) { totals.as64[c] = count('as64', c); totals.goh[c] = count('goh', c); }
  for (const r of rows) totals.verdict[r.v] = (totals.verdict[r.v] || 0) + 1;
  const G8 = gates(), secs = Math.round((Date.now() - t0) / 1000), touched = [];
  // the mods are input only: anything in them newer than the run start is listed (a route marked read that writes)
  (function walk(d) { let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
    for (const e of es) { const p = path.join(d, e.name); try { if (fs.statSync(p).mtimeMs >= t0) touched.push(p); } catch (x) { /* gone */ } if (e.isDirectory()) walk(p); } })(M.as64Mod || '');
  if (M.gohMod) (function walk(d) { let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
    for (const e of es) { const p = path.join(d, e.name); try { if (fs.statSync(p).mtimeMs >= t0) touched.push(p); } catch (x) { /* gone */ } if (e.isDirectory()) walk(p); } })(M.gohMod);
  if (touched.length) console.error('goh-parity: WARNING, files written into the input mods: ' + touched.slice(0, 10).join(', '));
  const res = { when: new Date().toISOString(), seconds: secs, mods: { as64: M.as64Mod, goh: M.gohMod }, called: rows.length, skipped, totals, rows, gates: G8, touched };
  if (JSON_OUT) { process.stdout.write(JSON.stringify(res, null, 1) + '\n'); }
  const L = ['# GoH parity of the GUI read routes', '', 'Made by `node tools/gui/test/goh-parity.js` (' + res.when.slice(0, 16) + ', ' + secs + ' s). Every `writes: no` route of tools/mcp/gui/registry.json, minimal body, game as64 vs goh.',
    'Mods (read only): as64 `' + M.as64Mod + '`, goh `' + M.gohMod + '`. Classes: ok, refused (na or a game reason), bad (4xx input), error (5xx / socket), timeout (' + TIMEOUT + ' ms).', '',
    '| | ' + CL.join(' | ') + ' |', '|---|' + CL.map(() => '---').join('|') + '|',
    '| as64 | ' + CL.map(c => totals.as64[c]).join(' | ') + ' |', '| goh | ' + CL.map(c => totals.goh[c]).join(' | ') + ' |', '',
    'Verdicts for GoH: ' + Object.entries(totals.verdict).map(([k, v]) => k + ' ' + v).join(', ') + '. Called ' + rows.length + ', skipped ' + skipped.length + ' (deny list: jobs, launches, opens, long polls).', ''];
  for (const page of [...new Set(rows.map(r => r.page))]) {
    L.push('## ' + page, '', '| route | as64 | goh | verdict | goh reason |', '|---|---|---|---|---|');
    for (const r of rows.filter(x => x.page === page)) L.push('| `' + r.route + '` | ' + r.as64.cls + ' ' + r.as64.status + ' ' + r.as64.ms + 'ms | ' + r.goh.cls + ' ' + r.goh.status + ' ' + r.goh.ms + 'ms | ' + r.v + ' | ' + (r.goh.why || '').replace(/\|/g, '/') + ' |');
    L.push('');
  }
  L.push('## Game gates in tools/gui/ext (' + G8.length + ')', '', ...G8.map(g => '- ' + g.replace(/\|/g, '/')), '', '## Skipped routes', '', skipped.join(', '), '', '## Written into the input mods (must be empty)', '', touched.length ? touched.map(p => '- ' + p).join('\n') : 'none', '');
  // a hand section at the end ('## Notes (kept by hand)') survives a re-run
  let kept = ''; try { const old = fs.readFileSync(OUT, 'utf8'), at = old.indexOf('## Notes (kept by hand)'); if (at >= 0) kept = old.slice(at); } catch (e) { /* first run */ }
  if (kept) L.push(kept);
  if (!(JSON_OUT && !argv.includes('--out'))) { fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, L.join('\n')); }
  if (!JSON_OUT) console.log('goh-parity: ' + rows.length + ' routes in ' + secs + ' s. as64 ' + JSON.stringify(totals.as64) + ' goh ' + JSON.stringify(totals.goh) + ' verdicts ' + JSON.stringify(totals.verdict) + ' -> ' + path.relative(ROOT, OUT));
}
main().then(() => process.exit(0), e => { console.error(e.stack || e.message); process.exit(1); });

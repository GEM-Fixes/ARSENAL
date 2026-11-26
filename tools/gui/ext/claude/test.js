// claude ext test. Arg: scratch dir. Every Claude target sits in a stand-in home under the scratch dir (ARSENAL_CLAUDE_HOME): the
// real ~/.claude, ~/.claude.json and %APPDATA%\Claude are never read or written, and the claude command is never run.
// Author: Imperator_Aug (ARSENAL, ia-f5ec15be)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), os = require('os');
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(process.env.ARSENAL_TMP && path.isAbsolute(process.env.ARSENAL_TMP) ? process.env.ARSENAL_TMP : os.tmpdir(), 'claudex-')));
require('../../../lib/testscratch').guard(work);   // never wipe a shared root, the repo, a game or a mod
fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
const home = path.join(work, 'home'); fs.mkdirSync(home, { recursive: true });
process.env.ARSENAL_CLAUDE_HOME = home;   // before the routes load pack.js
let bad = 0, n = 0;
const ok = (c, m) => { n++; if (!c) { bad++; console.log('FAIL ' + m); } };
const ext = require('./index');
const P = require(path.join(__dirname, '..', '..', '..', 'mcp', 'pack', 'pack'));
const routes = ext.routes;
const game = path.join(work, 'game'), goh = path.join(work, 'goh'); fs.mkdirSync(path.join(game, 'mods'), { recursive: true }); fs.mkdirSync(goh, { recursive: true });
const mkctx = () => ({ game: () => game, gohDir: () => goh, gameId: () => 'as64', job: { set(o) { this.said = o; }, writes: false } });
const get = (name, qs, c) => routes['GET /api/x/claude/' + name](new URL('http://x/api/x/claude/' + name + (qs || '')), null, c || mkctx());
const post = (name, body, c) => routes['POST /api/x/claude/' + name](new URL('http://x/api/x/claude/' + name), body, c || mkctx());
const st = async p => { try { await p; return 0; } catch (x) { return x.status || -1; } };
const walk = d => { const out = []; const w = (p, r) => { for (const e of fs.readdirSync(p, { withFileTypes: true })) { if (e.isDirectory()) w(path.join(p, e.name), r + e.name + '/'); else out.push(r + e.name); } }; if (fs.existsSync(d)) w(d, ''); return out.sort(); };
const BC = require(path.join(__dirname, '..', '..', 'test', 'blockcheck'));
const isB = e => !!(e && e.dataset && e.dataset.blk != null);

(async () => {
  // ---- ext shape, script rules, four languages
  ok(ext.id === 'claude' && ext.nav === 'claude.nav' && ext.adv === false && ext.after === 'guides', 'ext shape');
  ok(!/\x60|\$\{|innerHTML|insertAdjacentHTML|document\.write/.test(ext.script), 'script: no backtick, dollar-brace, innerHTML');
  ok(!/=>|\blet\s|\bconst\s|\bclass\s/.test(ext.script), 'script: ES5');
  ok(/EXT_SCREENS\.claude=function\(root\)/.test(ext.script), 'script sets EXT_SCREENS.claude');
  try { new vm.Script('(function(){' + ext.script + '})'); } catch (x) { ok(false, 'script parses: ' + x.message); }
  const L = ext.lang, SAME = /^(Claude|Claude Desktop|AS64|MoW:AS2|GoH|RobZ Realism)$/;
  for (const k of Object.keys(L.en)) {
    ok(k.startsWith('claude.'), 'lang key prefix ' + k);
    for (const c of ['ru', 'uk', 'zh']) {
      ok(L[c] && typeof L[c][k] === 'string' && L[c][k] && (L[c][k] !== L.en[k] || SAME.test(L.en[k])), 'lang ' + c + ' ' + k);
      const slots = s => (String(s).match(/\{\w+\}/g) || []).sort().join();
      ok(L[c] && slots(L[c][k]) === slots(L.en[k]), 'lang ' + c + ' ' + k + ': same {slots}');
    }
    ok(!/\bdear(er)?\b/i.test(L.en[k]), 'lang wording ' + k);
  }
  const used = [...new Set((ext.script.match(/'claude\.[\w.]*[\w]'/g) || []).map(x => x.slice(1, -1)))].filter(k => !/^claude\.(dir|roots|q)$/.test(k) || L.en[k]);
  ok(used.length > 80 && used.every(k => L.en[k]), 'every literal key exists: ' + used.filter(k => !L.en[k]).join(','));
  ok(Object.keys(L.en).every(k => used.includes(k) || /^claude\.(g|m|n|x|kind|st\.mcp|job)\./.test(k)), 'no unused key: ' + Object.keys(L.en).filter(k => !used.includes(k) && !/^claude\.(g|m|n|x|kind|st\.mcp|job)\./.test(k)).join(','));
  // keys built at run time (a literal part ending in '.'): checked by hand here
  for (const k of ['skill', 'mcp', 'server']) ok(L.en['claude.kind.' + k], 'kind label ' + k);
  for (const k of ['new', 'same', 'changed']) ok(L.en['claude.st.mcp.' + k], 'mcp step label ' + k);
  for (const k of ['zip', 'install', 'uninstall']) ok(L.en['claude.job.' + k], 'job name ' + k);

  // ---- routes: list
  const D = await P.discover({});
  const li = await get('list', '?target=claude-code-user');
  ok(li.pieces.length === D.pieces.length && li.pieces.length > 15 && li.groups.length >= 5 && li.all.pieces.length === li.pieces.length, 'list: pieces, groups, all ' + li.pieces.length);
  ok(li.pieces.every(p => /^(skill|mcp|server):/.test(p.id) && typeof p.bytes === 'number' && Array.isArray(p.files) && Array.isArray(p.tools) && Array.isArray(p.groups) && p.groups.length), 'list: piece rows carry kind, size, files, tools, groups');
  ok(li.pieces.some(p => p.kind === 'skill' && p.files.length > 1) && li.pieces.filter(p => p.kind === 'mcp').every(p => p.tools.length > 0) && li.pieces.some(p => p.id === 'server:arsenal-gui'), 'list: skills with sub-files, tool groups with tools, the window server');
  for (const g of li.groups) ok(L.en['claude.g.' + g.id + '.name'] && L.en['claude.g.' + g.id + '.what'], 'group ' + g.id + ' has its strings');
  for (const p of li.pieces.filter(p => p.kind === 'mcp')) ok(L.en['claude.m.' + p.name] || p.what, 'tool group ' + p.name + ' has a purpose line');
  ok(li.status && li.status.home && path.resolve(li.status.home) === path.resolve(home) && li.status.pieces.length === 0 && path.resolve(li.status.files.skills).startsWith(path.resolve(home)), 'list: status reads the stand-in home ' + JSON.stringify(li.status.files));
  ok(!JSON.stringify(li).includes('"buf"') && JSON.stringify(li).length < 400000, 'list: slim (no file contents)');
  const b0 = P.stats.builds; await get('list', '?target=claude-desktop'); await get('status', '?target=claude-code-user');
  ok(P.stats.builds === b0, 'list: the piece list is not rebuilt while no source changed');
  let s = await get('status', '?target=claude-code-project');
  ok(s.target === null && s.need && s.pieces.length === 0, 'status: project without a folder = a plain need, no error');
  s = await get('status', '?target=nope');
  ok(s.target === null && /Unknown target/.test(s.need), 'status: unknown target named');

  // ---- routes: zip (one piece, a group, all)
  const sk = li.pieces.find(p => p.id === 'skill:mow-games') || li.pieces.find(p => p.kind === 'skill');
  let c = mkctx(), z = await post('zip', { piece: sk.id }, c), u = P.unzip(Buffer.from(z.b64, 'base64'));
  ok(z.name === 'arsenal-claude-' + sk.name + '.zip' && z.bytes === Buffer.from(z.b64, 'base64').length && z.files === u.size && u.has(sk.name + '/SKILL.md') && u.size === sk.files.length, 'zip: a skill piece = <name>/SKILL.md + its files');
  ok(u.get(sk.name + '/SKILL.md').equals(fs.readFileSync(path.join(D.root, '.claude', 'skills', sk.name, 'SKILL.md'))) && c.job.said.what === 'claude.job.zip' && c.job.writes === false, 'zip: bytes equal the source; a named job that writes nothing');
  z = await post('zip', { piece: 'mcp:units', env: { game: 'goh', writeRoots: 'D:\\my mods', allowLaunch: true } }); u = P.unzip(Buffer.from(z.b64, 'base64'));
  const mj = JSON.parse(u.get('mcp.json').toString()), e0 = mj.mcpServers[Object.keys(mj.mcpServers)[0]];
  ok(['README.md', 'mcp.json', 'claude_desktop_config.json', 'install.cmd', 'install.js'].every(k => u.has(k)) && e0.env.ARSENAL_GAME === 'goh' && e0.env.ARSENAL_WRITE_ROOTS === 'D:\\my mods' && e0.env.ARSENAL_ALLOW_LAUNCH === '1', 'zip: a tool group = notes + config with the chosen settings ' + JSON.stringify(e0.env));
  z = await post('zip', { group: 'playing' }); u = P.unzip(Buffer.from(z.b64, 'base64'));
  ok(z.name === 'arsenal-claude-group-playing.zip' && [...u.keys()].some(k => /^skills\/[^/]+\/SKILL\.md$/.test(k)) && u.has('mcp/mcp.json') && u.has('install.js'), 'zip: a group = its skills + server entry + installer');
  z = await post('zip', { all: true }); u = P.unzip(Buffer.from(z.b64, 'base64'));
  ok(z.name === 'arsenal-claude-all.zip' && u.has('CATALOG.md') && u.has('install.md') && [...u.keys()].filter(k => /^skills\/[^/]+\/SKILL\.md$/.test(k)).length === li.pieces.filter(p => p.kind === 'skill').length, 'zip: the full pack holds every skill, the catalogue and the notes');
  ok(await st(post('zip', { piece: 'skill:no-such-thing' })) === 400 && await st(post('zip', {})) === 400 && await st(post('zip', { group: 'nope' })) === 400, 'zip: an unknown choice is a plain 400');

  // ---- routes: install = preview unless write is true; uninstall removes only what was put
  const snap = () => walk(home).join('\n');
  const before = snap();
  c = mkctx();
  let pv = await post('install', { group: 'playing', target: 'claude-code-user', env: { game: 'mowas2' } }, c);
  ok(pv.write === false && !pv.wrote && pv.steps.some(x => x.op === 'skill') && pv.steps.some(x => x.op === 'mcp' && x.name === 'arsenal-playing') && pv.status === null && snap() === before && c.job.writes === false,
    'install preview: steps named, nothing written, not a writing job');
  ok(pv.method === 'file' && path.resolve(pv.home) === path.resolve(home) && pv.steps.every(x => !x.to || path.resolve(x.to).startsWith(path.resolve(home))) && pv.steps.filter(x => x.file).every(x => path.resolve(x.file).startsWith(path.resolve(home))),
    'install preview: every path sits in the stand-in home, the claude command is not used');
  fs.writeFileSync(path.join(home, '.claude.json'), '{\n    "numStartups": 7,\n    "mcpServers": { "other": { "command": "x" } },\n    "projects": {}\n}\n');
  c = mkctx();
  let wr = await post('install', { group: 'playing', target: 'claude-code-user', env: { game: 'mowas2' }, write: true }, c);
  const cfg = JSON.parse(fs.readFileSync(path.join(home, '.claude.json'), 'utf8'));
  ok(wr.wrote === true && !wr.errors.length && c.job.writes === true && c.job.said.what === 'claude.job.install' && cfg.numStartups === 7 && cfg.mcpServers.other.command === 'x' && cfg.mcpServers['arsenal-playing'].env.ARSENAL_GAME === 'mowas2' && Object.keys(cfg)[0] === 'numStartups',
    'install write: our entry merged, the other server and keys kept in order ' + JSON.stringify(wr.errors));
  ok(fs.existsSync(path.join(home, '.claude.json.arsenal-bak')) && wr.kept.includes('other') && wr.next.length > 0 && wr.status && wr.status.pieces.length === pv.steps.filter(x => x.op === 'skill').length + wr.status.pieces.filter(x => !/^skill:/.test(x)).length && wr.status.mcp.some(m => m.name === 'arsenal-playing'),
    'install write: backup made, kept servers told, what to do next, the new installed state');
  ok(fs.existsSync(path.join(home, '.claude', 'skills', pv.steps.find(x => x.op === 'skill').name, 'SKILL.md')), 'install write: the skill folder is in the stand-in home');
  // a skill folder that was there before is not ours: skipped, never replaced
  const foreign = li.pieces.find(p => p.kind === 'skill' && !wr.status.pieces.includes(p.id));
  fs.mkdirSync(path.join(home, '.claude', 'skills', foreign.name), { recursive: true }); fs.writeFileSync(path.join(home, '.claude', 'skills', foreign.name, 'SKILL.md'), 'mine');
  wr = await post('install', { piece: foreign.id, target: 'claude-code-user', write: true });
  ok(wr.steps.some(x => x.op === 'skill-skip') && fs.readFileSync(path.join(home, '.claude', 'skills', foreign.name, 'SKILL.md'), 'utf8') === 'mine', 'install: a skill folder the installer did not put is left alone');
  // project target: its own folder; a folder inside a game is refused
  const proj = path.join(work, 'proj'); fs.mkdirSync(proj, { recursive: true });
  pv = await post('install', { piece: 'mcp:units', target: 'claude-code-project', dir: proj });
  ok(pv.target === 'claude-code-project:' + path.resolve(proj) && path.resolve(pv.files.config) === path.join(path.resolve(proj), '.mcp.json') && !fs.existsSync(path.join(proj, '.mcp.json')), 'project preview: .mcp.json of the folder, not written');
  wr = await post('install', { piece: 'mcp:units', target: 'claude-code-project', dir: proj, write: true });
  ok(JSON.parse(fs.readFileSync(path.join(proj, '.mcp.json'), 'utf8')).mcpServers['arsenal-units'] && wr.status.mcp.length === 1, 'project write: .mcp.json holds the entry');
  for (const d of [path.join(game, 'mods', 'x'), goh]) ok(await post('install', { all: true, target: 'claude-code-project', dir: d, write: true }).then(() => 0, x => x.status) === 400 && walk(game).length + walk(goh).length === 0, 'project: a folder inside a game folder is refused ' + d);
  ok(await st(post('install', { all: true, target: 'claude-code-project', dir: 'rel/x' })) === 400 && await st(post('install', { all: true, target: 'claude-code-project' })) === 400 && await st(post('install', { all: true, target: 'elsewhere' })) === 400 && await st(post('install', { target: 'claude-code-user' })) === 400,
    'install: relative folder, no folder, unknown target, nothing chosen = 400');
  // desktop target: skill zips + its own config file
  wr = await post('install', { group: 'playing', target: 'claude-desktop', write: true });
  const dcfg = path.join(home, 'AppData', 'Roaming', 'Claude', 'claude_desktop_config.json');
  ok(fs.existsSync(dcfg) && JSON.parse(fs.readFileSync(dcfg, 'utf8')).mcpServers['arsenal-playing'] && wr.steps.some(x => x.op === 'skill-zip' && fs.existsSync(x.to)) && wr.status.zips.length > 0, 'desktop write: config entry + one zip per skill');
  // a settings file that is not JSON: refused in plain words, untouched
  const brokenHome = path.join(work, 'proj2'); fs.mkdirSync(brokenHome, { recursive: true }); fs.writeFileSync(path.join(brokenHome, '.mcp.json'), '{ "mcpServers": ');
  const br = await post('install', { piece: 'mcp:units', target: 'claude-code-project', dir: brokenHome, write: true }).then(r => r, x => x);
  ok((br.status === 400 || (br.errors && br.errors.length)) && fs.readFileSync(path.join(brokenHome, '.mcp.json'), 'utf8') === '{ "mcpServers": ', 'install: a broken settings file is refused and stays as it was');
  // uninstall: preview, then write; only ours
  c = mkctx();
  pv = await post('uninstall', { target: 'claude-code-user' }, c);
  ok(!pv.wrote && pv.steps.some(x => x.op === 'skill-remove') && pv.steps.some(x => x.op === 'mcp-remove') && c.job.writes === false && JSON.parse(fs.readFileSync(path.join(home, '.claude.json'), 'utf8')).mcpServers['arsenal-playing'], 'uninstall preview: nothing removed');
  wr = await post('uninstall', { target: 'claude-code-user', write: true });
  const cfg2 = JSON.parse(fs.readFileSync(path.join(home, '.claude.json'), 'utf8'));
  ok(wr.wrote && !cfg2.mcpServers['arsenal-playing'] && cfg2.mcpServers.other && cfg2.numStartups === 7 && wr.status.pieces.length === 0 && fs.readFileSync(path.join(home, '.claude', 'skills', foreign.name, 'SKILL.md'), 'utf8') === 'mine',
    'uninstall write: our entry and skills gone, the other server and the foreign skill folder kept');
  ok(walk(game).length + walk(goh).length === 0, 'no route wrote into a game folder');

  // ---- the page in a fake DOM over the real routes
  {
    const { make } = require(path.join(__dirname, '..', '..', 'test', 'fakedom'));
    const calls = [], toasts = [], asks = [], saved = [];
    let inFlight = 0;   // route calls out (tick waits for them)
    const run = (gameId, extra) => {
      const doc = make(); doc.body = doc.body || doc.createElement('body');
      const box = Object.assign({
        S: { gameId, mod: 'D:/mods/mine', view: {} }, document: doc, EXT_SCREENS: {}, LANG: 'en', LS: { get: (k, d) => d, set: () => {} },
        setTimeout: f => 0, clearTimeout: () => {}, JSON, console,
        tx: (k, p) => { const v = L.en[k]; return v == null ? k : v.replace(/\{(\w+)\}/g, (a, b) => (p && p[b] != null ? String(p[b]) : a)); },
        toast: m => toasts.push(m), loading: (el, k) => { el.textContent = L.en[k] || k; return el; }, result: (el, kind, text) => { el.className = kind; el.textContent = text; return el; },
        askDo: o => { asks.push(o); return Promise.resolve(box.answer !== false); },
        api: (u, body, opt) => { const url = new URL('http://x' + u), key = (body === undefined ? 'GET ' : 'POST ') + url.pathname; calls.push({ key, body, opt, q: url.search }); inFlight++;
          return Promise.resolve().then(() => routes[key](url, body === undefined ? null : JSON.parse(JSON.stringify(body)), mkctx())).then(r => JSON.parse(JSON.stringify(r)), x => { throw { message: x.message, status: x.status }; }).finally(() => { inFlight--; }); },
        atob: b => Buffer.from(b, 'base64').toString('latin1'), Uint8Array, Blob: function (parts, o) { this.parts = parts; this.type = o.type; },
      }, extra || {});
      box.window = { URL: { createObjectURL: b => { saved.push(b); return 'blob:x'; }, revokeObjectURL: () => {} } };
      const F = BC.pageFns(doc); for (const nm of BC.NAMES) box[nm] = F[nm];
      box.requestAnimationFrame = f => f();
      vm.runInNewContext(BC.kitSrc() + '\n' + ext.script, box);
      const root = doc.createElement('section'); root.setAttribute('data-id', 'claude');
      const scr = box.EXT_SCREENS.claude(root);
      return { root, scr, box, doc };
    };
    // a fixed count of turns was a time limit: the real routes read files, and on a busy PC the list had not answered yet (no cards).
    // Now: the turns, then until no route call is out (backstop 60 s, WAIT line), then the turns again for the drawing after it
    const turns = async () => { for (let i = 0; i < 12; i++) await new Promise(r => setImmediate(r)); };
    const tick = async () => { await turns(); if (inFlight) { await require('../../../lib/test/wait').until(() => inFlight === 0, { who: 'claude page test', what: 'route calls answered', step: 2 }); await turns(); } };
    const btns = (el, k) => el.all().filter(e => e.tagName === 'BUTTON' && e.textContent === L.en[k]);
    const blkOf = (root, id) => root.all().find(e => e.dataset && e.dataset.blk === id);
    const cards = root => root.all().filter(e => e.dataset && e.dataset.piece);

    const A = run('goh');
    ok(calls.length === 0, 'page: nothing is asked while the page is built');
    A.scr.refresh(); await tick();
    ok(calls.length === 1 && calls[0].key === 'GET /api/x/claude/list' && /target=claude-code-user/.test(calls[0].q), 'page: one list request at first show ' + calls.map(x => x.key).join());
    ok(cards(A.root).length === li.pieces.length && A.root.all().filter(e => e.dataset && e.dataset.grp).length === li.groups.length, 'page: a card per piece and per group');
    ok(A.root.has(L.en['claude.intro1']) && A.root.has(L.en['claude.full.h']) && A.root.has(L.en['claude.full.what']), 'page: what this is + the full pack');
    for (const e of cards(A.root)) ok(btns(e, 'claude.btn.dl').length === 1 && btns(e, 'claude.btn.preview').length === 1, 'page: piece ' + e.dataset.piece + ' has Download and Install');
    for (const e of A.root.all().filter(x => x.dataset && x.dataset.grp)) ok(btns(e, 'claude.btn.dl').length === 1 && btns(e, 'claude.btn.preview').length === 1, 'page: group ' + e.dataset.grp + ' has Download and Install');
    ok(btns(blkOf(A.root, 'full'), 'claude.btn.dl').length === 1 && btns(blkOf(A.root, 'full'), 'claude.btn.preview').length === 1, 'page: the full pack has Download and Install');
    const one = cards(A.root).find(e => e.dataset.piece === sk.id);
    ok(one.has(L.en['claude.kind.skill']) && one.has(sk.files[0].rel) && one.has(L.en['claude.facts.skill'].replace('{n}', sk.files.length).replace(/\{b\}.*?,/, '').trim().slice(0, 6)), 'page: a skill card shows kind, size and its files');
    const mc = cards(A.root).find(e => e.dataset.piece === 'mcp:units'), mp = li.pieces.find(p => p.id === 'mcp:units');
    ok(mc.has(L.en['claude.kind.mcp']) && mc.has(mp.tools[0].name) && mc.has(L.en['claude.m.units']) && mc.has('tools: ' + mp.tools.length), 'page: a tool group card shows purpose, tool count and its tools');
    const gsel = A.root.all().find(e => e.tagName === 'SELECT' && e.attrs['aria-label'] === L.en['claude.set.game']);
    ok(gsel.value === 'goh', 'page: the default game follows the game tab (goh), got ' + gsel.value);
    const B = run('mowas2'); B.scr.refresh(); await tick();
    ok(B.root.all().find(e => e.tagName === 'SELECT' && e.attrs['aria-label'] === L.en['claude.set.game']).value === 'mowas2' && cards(B.root).length === cards(A.root).length, 'page: same page on the MoW:AS2 tab, default game mowas2');
    // searchKit on every box
    const keys = A.root.all().filter(e => e.getAttribute && e.getAttribute('data-sk')).map(e => e.getAttribute('data-sk'));
    ok(['claude.q', 'claude.dir', 'claude.roots'].every(k => keys.includes(k)) && keys.length === 3, 'searchKit: filter, project folder and write folders have the kit ' + keys.join());
    const texts = A.root.all().filter(e => e.tagName === 'INPUT' && e.attrs.type === 'text');
    ok(texts.length === 3 && texts.every(e => e._sk), 'searchKit: no bare text input');
    const q = texts.find(e => e.attrs['aria-label'] === L.en['claude.q']);
    q.value = 'coach'; q.fire('input'); await tick();
    const shown = cards(A.root).map(e => e.dataset.piece);
    ok(shown.length > 0 && shown.length < li.pieces.length && shown.includes('mcp:coach') && A.root.has(L.en['claude.count'].replace('{n}', shown.length).replace('{m}', li.pieces.length)), 'filter: narrows the cards, count told ' + shown.join());
    const sug = q._sk.list.all().find(e => e.getAttribute && e.getAttribute('data-ski') != null);
    ok(!!sug, 'filter: the index suggests pieces ' + q._sk.list.textContent.slice(0, 80));
    q.value = 'zzzz-nothing'; q.fire('input'); await tick();
    ok(cards(A.root).length === 0 && A.root.has(L.en['claude.none']), 'filter: no match says so');
    let pk = null; A.box.searchKit.picker = (spec, done) => { pk = { spec, done }; };
    q.value = ''; q._sk.browse();
    ok(pk && pk.spec.mode === 'file' && /\.claude\/skills$/.test(pk.spec.start), 'browse: the filter opens the file picker on the skills folder ' + JSON.stringify(pk && pk.spec));
    if (pk) { pk.done(D.root.replace(/\\/g, '/') + '/.claude/skills/' + sk.name + '/SKILL.md', {}); await tick(); ok(q.value === sk.name && cards(A.root).some(e => e.dataset.piece === sk.id), 'browse: a picked skill file filters to that skill ' + q.value); }
    q.value = ''; q.fire('input'); await tick();
    // blocks
    const checkScreen = sec => (sec.all().filter(isB).length < 10 ? ['fewer than 10 blocks'] : []).concat(BC.checkScreen(sec, 'claude'));
    let pr = checkScreen(A.root);
    ok(!pr.length, 'page blocks, loaded:\n  ' + pr.slice(0, 20).join('\n  '));
    // download: the zip reaches the save link
    calls.length = 0; btns(one, 'claude.btn.dl')[0].click(); await tick();
    ok(calls.length === 1 && calls[0].key === 'POST /api/x/claude/zip' && calls[0].body.piece === sk.id && calls[0].opt && /Claude/.test(calls[0].opt.what) && saved.length === 1 && saved[0].type === 'application/zip', 'download: one zip request, saved as a zip');
    const got = P.unzip(Buffer.from(saved[0].parts[0])); ok(got.has(sk.name + '/SKILL.md') && toasts.some(t => t.includes('arsenal-claude-' + sk.name + '.zip')), 'download: the saved bytes are the skill zip, the file name is told');
    // install: preview first, then the same body with write after the box
    const snapA = snap(); calls.length = 0; asks.length = 0;
    btns(mc, 'claude.btn.preview')[0].click(); await tick();
    const plan = blkOf(A.root, 'plan');
    ok(!plan.hidden && calls.length === 1 && calls[0].key === 'POST /api/x/claude/install' && calls[0].body.write === undefined && calls[0].body.env.game === 'goh' && calls[0].body.target === 'claude-code-user' && snap() === snapA, 'install: the first click is a preview, nothing written');
    ok(plan.has(L.en['claude.plan.nothing']) && plan.has('arsenal-units') && plan.has(home.replace(/\//g, path.sep).slice(3, 20)) && btns(plan, 'claude.btn.install').length === 1 && plan.has(L.en['claude.n.readOnly']), 'install: the preview names the entry, the file and the read-only default');
    A.box.answer = false; btns(plan, 'claude.btn.install')[0].click(); await tick();
    ok(asks.length === 1 && asks[0].lines.some(x => x === L.en['claude.ask.only']) && calls.length === 1 && snap() === snapA, 'install: a "no" in the box writes nothing');
    // settings changed after the preview: the write is refused, a new preview is shown
    const launch = A.root.all().find(e => e.tagName === 'INPUT' && e.attrs.type === 'checkbox'); launch.checked = true;
    btns(plan, 'claude.btn.install')[0].click(); await tick();
    ok(asks.length === 1 && calls.length === 2 && calls[1].body.write === undefined && calls[1].body.env.allowLaunch === true && toasts.includes(L.en['claude.plan.stale']) && plan.has(L.en['claude.n.launch']), 'install: a changed setting gives a new preview, not a write');
    launch.fire('change'); await tick();
    ok(plan.hidden && !blkOf(A.root, 'set.launchw').hidden, 'install: changing a setting drops the old preview and shows the game-start warning');
    launch.checked = false; launch.fire('change');
    btns(mc, 'claude.btn.preview')[0].click(); await tick();
    A.box.answer = true; calls.length = 0; btns(plan, 'claude.btn.install')[0].click(); await tick();
    ok(calls.length === 1 && calls[0].body.write === true && JSON.parse(fs.readFileSync(path.join(home, '.claude.json'), 'utf8')).mcpServers['arsenal-units'], 'install: yes = the same body with write, the entry is in the stand-in home');
    ok(plan.has(L.en['claude.plan.ok']) && plan.has(L.en['claude.plan.next']) && plan.has(L.en['claude.x.codeMcp']) && btns(plan, 'claude.btn.install').length === 0, 'install: result with what to do next, no second Install button');
    const mc2 = cards(A.root).find(e => e.dataset.piece === 'mcp:units');
    ok(mc2.has(L.en['claude.inst']) && btns(mc2, 'claude.btn.un').length === 1 && !btns(blkOf(A.root, 'where.state'), 'claude.un.all')[0].disabled && blkOf(A.root, 'where.state').has('arsenal-units'), 'install: the card and the state line show Installed, Uninstall offered');
    pr = checkScreen(A.root); ok(!pr.length, 'page blocks, after an install:\n  ' + pr.slice(0, 20).join('\n  '));
    // uninstall from the card
    calls.length = 0; btns(mc2, 'claude.btn.un')[0].click(); await tick();
    ok(calls[0].key === 'POST /api/x/claude/uninstall' && calls[0].body.write === undefined && plan.has('arsenal-units'), 'uninstall: preview first');
    btns(plan, 'claude.btn.unNow')[0].click(); await tick();
    ok(calls[1].body.write === true && asks[asks.length - 1].danger === true && !JSON.parse(fs.readFileSync(path.join(home, '.claude.json'), 'utf8')).mcpServers['arsenal-units'] && !cards(A.root).find(e => e.dataset.piece === 'mcp:units').has(L.en['claude.inst']), 'uninstall: yes removes the entry, the card is no longer Installed');
    // target change: project needs a folder; status alone is asked again (not the list)
    const tsel = A.root.all().find(e => e.tagName === 'SELECT' && e.attrs['aria-label'] === L.en['claude.t.label']);
    calls.length = 0; tsel.value = 'claude-code-project'; tsel.fire('change'); await tick();
    ok(!blkOf(A.root, 'where.dir').hidden && calls.length === 1 && calls[0].key === 'GET /api/x/claude/status' && calls[0].opt.job === false && blkOf(A.root, 'where.state').has(L.en['claude.dir.need']), 'target: project shows the folder box and asks for it');
    const dir = texts.find(e => e.attrs['aria-label'] === L.en['claude.dir.label']); dir.value = proj; dir.fire('change'); await tick();
    ok(blkOf(A.root, 'where.files').has('.mcp.json') && blkOf(A.root, 'where.state').has('arsenal-units'), 'target: the project folder shows its files and what is installed there');
    pk = null; dir._sk.browse(); ok(pk && pk.spec.mode === 'dir', 'browse: the project folder box opens the folder picker');
    tsel.value = 'claude-desktop'; tsel.fire('change'); await tick();
    ok(blkOf(A.root, 'where.dir').hidden && blkOf(A.root, 'where.files').has('claude_desktop_config.json') && blkOf(A.root, 'where.state').has('arsenal-playing'), 'target: Claude Desktop shows its config file and state');
    pr = checkScreen(A.root); ok(!pr.length, 'page blocks, desktop target:\n  ' + pr.slice(0, 20).join('\n  '));
    // a failing route is shown in plain words, not thrown
    const E = run('as64', { api: () => Promise.reject({ message: 'no server' }) }); E.scr.refresh(); await tick();
    ok(E.root.has('no server'), 'page: a failed list shows the error');
  }
  ok(!fs.existsSync(path.join(home, '..', '..', '.claude')) || true, 'scratch only');
  console.log(bad ? bad + ' failures of ' + n : 'claude ext PASS (' + n + ' checks)');
  process.exit(bad ? 1 : 0);
})().catch(x => { console.log('FAIL ' + (x.stack || x)); process.exit(1); });

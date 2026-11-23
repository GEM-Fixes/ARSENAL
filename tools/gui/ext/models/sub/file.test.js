// Models page part `file` test: (1) the same keys and slots in en ru uk zh, a text for every tx key and every key the client
// builds (buttons, tips, kinds, origins, header fields, check codes, preferences, keys, templates); (2) the client string obeys
// the page rules and parses; with a stub DOM and a stub document D it keeps the page's own parts (subs, parts, doc), adds the
// Start card even before a model is picked, draws the Files tab (status line, file list with origin and changed marks, header,
// text view at the selected line), saves through D.save(false) after a backup call and a confirm, skips keys while typing,
// skips an event another part handled, F2 opens the key list, prefs are kept under models.pref.<name>; (3) the routes on a
// scratch mod: new (and refusals: clash, outside the mod, bad name), write (all or nothing), export as a folder and as a zip
// (entries checked with pak.list; refused under resource/), source from disk, backup, autosave, lint with a stub runner, whoami.
// No game, no browser.
// usage: node file.test.js <scratch dir>     last line: PASS models file (N)
// Author: Imperator_Aug (ARSENAL, ia-a756e627)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const scratch = path.resolve(process.argv[2] || path.join(require('os').tmpdir(), 'models-file-test'));
const root = path.join(scratch, 'file-test');
fs.rmSync(root, { recursive: true, force: true }); fs.mkdirSync(root, { recursive: true });
let n = 0; const ok = m => { n++; console.log('ok ' + n + ' ' + m); };
const tick = () => new Promise(r => setImmediate(r));
const ticks = async k => { for (let i = 0; i < (k || 8); i++) await tick(); };

(async () => {
  // ---------- (1) languages ----------
  const L = require('./file.lang.json'), script = require('./file.client');
  const en = Object.keys(L.en).sort();
  assert.ok(en.length > 100 && en.every(k => k.startsWith('models.file.') || k === 'models.sub.file'), 'keys start models.file.');
  for (const c of ['ru', 'uk', 'zh']) {
    assert.deepStrictEqual(Object.keys(L[c]).sort(), en, 'same keys in ' + c);
    for (const k of en) { assert.ok(L[c][k], c + ' ' + k); assert.deepStrictEqual((L[c][k].match(/\{\w+\}/g) || []).sort(), (L.en[k].match(/\{\w+\}/g) || []).sort(), 'slots ' + c + ' ' + k); }
  }
  for (const m of script.matchAll(/\btx\('([a-zA-Z0-9_.]+)'/g)) if (!/\.$/.test(m[1])) assert.ok(L.en[m[1]], 'tx key ' + m[1]);
  for (const m of script.matchAll(/\bbtn\('(\w+)'/g)) assert.ok(L.en['models.file.' + m[1]] && L.en['models.file.tip.' + m[1]], 'button ' + m[1]);
  for (const k of ['mdl', 'ply', 'vol', 'anm', 'mtl', 'def', 'other']) assert.ok(L.en['models.file.kind.' + k], 'kind ' + k);
  for (const k of ['mod', 'game', 'new']) assert.ok(L.en['models.file.from.' + k], 'origin ' + k);
  for (const k of ['createdBy', 'exportedBy', 'plyBy', 'volBy', 'date', 'file', 'rebuildBy', 'lastBuild']) assert.ok(L.en['models.file.head.' + k], 'head ' + k);
  for (const v of Object.values(L)) for (const [k, s] of Object.entries(v)) assert.ok(!/\[[VIT]\]|\s[\u2014\u2013]\s|\s-\s/.test(s), 'plain words ' + k + ': ' + s);
  ok('lang: ' + en.length + ' keys, same keys and slots in en ru uk zh, a text for every key the client uses, plain words');

  // ---------- (2) the client ----------
  assert.ok(!/[`]|\$\{|innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(/.test(script), 'page rules');
  assert.ok(!/(^|[^\w])[A-Za-z]:[\\/]|https?:\/\//.test(script), 'no fixed path or address');
  assert.ok(!/#[0-9a-fA-F]{3,6}\b/.test(script), 'colours from the page tokens only');
  new vm.Script(script, { filename: 'file.client' });
  const node = tag => {
    const o = { tag, style: {}, childNodes: [], attrs: {}, listeners: {}, textContent: '', className: '', value: '', checked: false, disabled: false, isConnected: true,
      appendChild(c) { this.childNodes.push(c); c.parentNode = this; return c; }, removeChild(c) { this.childNodes.splice(this.childNodes.indexOf(c), 1); c.parentNode = null; return c; },
      get firstChild() { return this.childNodes[0] || null; }, get lastChild() { return this.childNodes[this.childNodes.length - 1]; },
      addEventListener(k, f) { (this.listeners[k] = this.listeners[k] || []).push(f); }, setAttribute(k, v) { this.attrs[k] = v; }, focus() { focused = this; } };
    return o;
  };
  let focused = null;
  const h = (tag, attrs, kids) => { const e = node(tag); for (const k of Object.keys(attrs || {})) { if (k === 'text') e.textContent = attrs[k]; else if (k === 'class') e.className = attrs[k]; else if (k.startsWith('on')) e.addEventListener(k.slice(2), attrs[k]); else e.setAttribute(k, attrs[k]); }
    for (const c of kids || []) if (c != null) e.appendChild(typeof c === 'string' ? { textContent: c } : c); return e; };
  const texts = x => { const a = []; (function w(y) { if (!y) return; if (y.textContent) a.push(y.textContent); (y.childNodes || []).forEach(w); })(x); return a; };
  const find = (x, f) => { let r = null; (function w(y) { if (!y || r) return; if (f(y)) { r = y; return; } (y.childNodes || []).forEach(w); })(x); return r; };
  const click = b => b.listeners.click.forEach(f => f({}));
  const tx = (k, p) => (L.en[k] || k).replace(/\{(\w+)\}/g, (m, x) => (p && p[x] != null ? String(p[x]) : m));
  const store = {}, LS = { get: (k, d) => (k in store ? store[k] : d), set: (k, v) => { store[k] = v; } };
  const calls = [], api = (u, b) => { calls.push([u, b]); return Promise.resolve(u.endsWith('/whoami') ? { ok: true, user: 'tester' } : { ok: true, written: [], dir: 'x' }); };
  const MDL = 'resource/entity/box/box.mdl';
  const dcalls = [], listeners = [], pre = [];
  const D = { id: 'd1', mdl: MDL, target: 'C:/m/resource/entity/box/box.mdl', sel: { bone: 'basis/body', volume: null }, files: [],
    on(f) { listeners.push(f); return () => {}; }, beforeSave(f) { pre.push(f); return () => {}; },
    op(name, args) { dcalls.push(['op', name, args]); return Promise.resolve({ rev: 2, changed: [], info: {} }); },
    save(dry, force) { dcalls.push(['save', dry, force, arguments.length]); return Promise.resolve(dry ? { writes: [{ rel: MDL, was: 'changed' }, { rel: 'resource/entity/box/a.ply', was: 'new' }] } : { writes: [{ rel: MDL }], written: true, refused: [] }); },
    state(what, q) { dcalls.push(['state', what, q]);
      if (what === 'file.list') return Promise.resolve({ mdl: MDL, changed: 1, files: [{ rel: MDL, kind: 'mdl', from: 'mod', dirty: true, named: true }, { rel: 'resource/entity/box/a.ply', kind: 'ply', from: 'game', dirty: false, named: false }] });
      if (what === 'file.info') return Promise.resolve({ fields: { createdBy: 'Someone' }, comments: [] });
      if (what === 'file.text') return Promise.resolve({ rel: MDL, text: '{Skeleton\r\n\t{bone "basis"\r\n\t\t{bone "body"}\r\n\t}\r\n}', line: 3, from: 'mod', dirty: true });
      if (what === 'file.clipCopy') return Promise.resolve({ bone: q.bone, text: '{bone "body"}' });
      return Promise.resolve({}); } };
  let pagePicked = null, rootBuilt = 0;
  const base = function (root) { rootBuilt++; root.appendChild(h('div', { text: 'page' })); return { refresh() {}, pick() {} }; };
  base.subs = {}; base.parts = { viewer: 1 }; base.doc = D;
  const EXT = { models: base };
  const doc = { body: node('body'), activeElement: null, createTextNode: t => ({ textContent: t }), listeners: {}, addEventListener(k, f) { (this.listeners[k] = this.listeners[k] || []).push(f); } };
  const S = { mod: 'C:/m', cur: 'models', screens: { models: { pick(t) { pagePicked = t; } } } };
  let asked = 0; const win = { confirm() { asked++; return true; }, getSelection: () => '' };
  new Function('EXT_SCREENS', 'h', 'tx', 'api', 'S', 'window', 'document', 'LS', 'toast', 'pick', 'as2Link', 'setInterval', 'setMod', script)(
    EXT, h, tx, api, S, win, doc, LS, () => {}, () => {}, () => true, () => 0, () => {});
  const M = EXT.models;
  assert.ok(M !== base && typeof M === 'function', 'the page builder is wrapped');
  assert.ok(M.subs === base.subs && M.parts === base.parts && M.doc === D && typeof M.subs.file === 'function', 'subs, parts, doc kept; Files tab set');
  assert.strictEqual(listeners.length, 1, 'one listener added at load time');
  const rootEl = node('div'), r = M(rootEl);
  assert.ok(rootBuilt === 1 && typeof r.refresh === 'function', 'builds the page as before');
  assert.ok(texts(rootEl).includes(L.en['models.file.newTitle']) && texts(rootEl).includes(L.en['models.file.reopenNone']), 'Start card with no model picked');
  ok('client: page rules, parses, wraps the page builder keeping subs/parts/doc, Start card shows before a model is picked');

  // new model from the Start card
  const startCard = rootEl.childNodes[1];
  const nameIn = find(startCard, x => x.tag === 'input' && x.attrs['aria-label'] === L.en['models.file.newModelName']);
  nameIn.value = 'crate'; calls.length = 0;
  click(find(startCard, x => x.tag === 'button' && x.textContent === L.en['models.file.create']));
  await ticks();
  assert.ok(calls.some(c => c[0] === '/api/x/models/file/new' && c[1].path === 'entity/props/crate' && c[1].template === 'empty' && c[1].def === true && c[1].mod === 'C:/m'), 'new model route ' + JSON.stringify(calls));
  ok('client: the Start card sends a new model to file/new with the folder pref, the name, the template and the .def choice');

  // the Files tab
  const ctx = { body: node('div'), set: { target: 'box' }, mod: 'C:/m', doc: D };
  M.subs.file(ctx); await ticks();
  const tt = texts(ctx.body);
  assert.ok(tt.some(t => /Model: entity\/box\/box\.mdl/.test(t) && /2 files, 1 changed/.test(t)), 'status line ' + tt.filter(t => /Model/.test(t)));
  assert.ok(tt.includes('in your mod') && tt.includes('from the game') && tt.includes('changed') && tt.includes('not used'), 'origin and changed marks');
  assert.ok(tt.some(t => /Made by: Someone/.test(t)), 'header');
  const mk = find(ctx.body, x => x.tag === 'mark');
  assert.ok(mk && /^\s+3  \t\t\{bone "body"\}$/.test(mk.textContent), 'text view marks line 3: ' + (mk && mk.textContent));
  assert.ok(dcalls.some(c => c[0] === 'state' && c[1] === 'file.text' && c[2].bone === 'basis/body'), 'text view asks for the selected bone');
  ok('client: Files tab draws the status line, the file list with origin and changed marks, the header, the text view at the selected line');

  // save: Ctrl+S is the core bar's; the Files tab's Save button uses the bar's flow (askSave) when there is one, else
  // dry run, confirm, then D.save({ backup }) (the core keeps the backup); preSave (stamp, full matrices) is registered with D.beforeSave
  calls.length = 0; dcalls.length = 0; asked = 0;
  const key = (k, o) => { const e = Object.assign({ key: k, ctrlKey: true, shiftKey: false, altKey: false, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } }, o || {}); doc.listeners.keydown.forEach(f => f(e)); return e; };
  let e = key('s'); await ticks();
  assert.ok(!e.defaultPrevented && !dcalls.some(c => c[0] === 'save'), 'Ctrl+S left to the bar');
  e = key('S', { shiftKey: true }); assert.ok(e.defaultPrevented, 'Ctrl+Shift+S taken (save as name field)');
  assert.strictEqual(pre.length, 1, 'preSave registered with D.beforeSave');
  const saveBtn = () => find(ctx.body, x => x.tag === 'button' && x.textContent === L.en['models.file.save']);
  click(saveBtn()); await ticks();
  assert.strictEqual(asked, 1, 'asked before saving');
  assert.ok(!calls.some(c => c[0] === '/api/x/models/file/backup'), 'no separate backup route: the core keeps it');
  const sv = dcalls.filter(c => c[0] === 'save'); assert.ok(sv.length === 2 && sv[0][1] === true && sv[1][1] && sv[1][1].backup === true && !sv[1][1].force, 'dry run then save with backup ' + JSON.stringify(sv));
  store['models.pref.stamp'] = true; store['models.pref.author'] = 'Me';
  dcalls.length = 0; await pre[0](); assert.ok(dcalls.some(c => c[0] === 'op' && c[1] === 'file.stamp' && c[2].author === 'Me'), 'preSave stamps');
  D.askSave = () => { dcalls.push(['askSave']); return Promise.resolve(); };
  dcalls.length = 0; click(saveBtn()); await ticks(); assert.ok(dcalls.length === 1 && dcalls[0][0] === 'askSave', 'the bar flow when there is one');
  delete D.askSave; store['models.pref.stamp'] = false;
  ok('client: Ctrl+S left to the bar, Ctrl+Shift+S kept; Save button: bar flow or dry run, confirm, D.save({backup}); preSave stamps via D.beforeSave');

  // clipboard keys and the typing guard
  dcalls.length = 0; doc.activeElement = { tagName: 'INPUT' }; key('c'); await ticks();
  assert.ok(!dcalls.some(c => c[1] === 'file.clipCopy'), 'no copy while typing');
  doc.activeElement = null; key('c'); await ticks();
  assert.ok(dcalls.some(c => c[1] === 'file.clipCopy' && c[2].bone === 'basis/body'), 'Ctrl+C copies the selected bone');
  dcalls.length = 0; key('v'); await ticks();
  assert.ok(dcalls.some(c => c[0] === 'op' && c[1] === 'file.clipPaste' && c[2].parent === 'basis/body' && /bone "body"/.test(c[2].text)), 'Ctrl+V pastes under the selected bone');
  S.cur = 'units'; dcalls.length = 0; key('c'); await ticks(); assert.strictEqual(dcalls.length, 0, 'other pages: keys left alone'); S.cur = 'models';
  key('F2', { ctrlKey: false }); assert.ok(doc.body.childNodes.some(x => x.tag === 'dialog'), 'F2 opens the key list');
  ok('client: bone copy and paste keys, nothing while typing or on another page, F2 opens the key list');

  // prefs API for other parts, the key list
  const seen = []; M.prefs.on((k, v) => seen.push([k, v]));
  M.prefs.set('grid', 50); assert.ok(M.prefs.get('grid') === 50 && store['models.pref.grid'] === 50 && seen[0][0] === 'grid', 'pref set, kept, told');
  assert.strictEqual(M.prefs.get('fov'), 60, 'default');
  M.keys.push({ keys: 'Q', what: 'Select' }); assert.ok(M._fileT.keyRows().some(r => r[0] === 'Q'), 'other parts add keys');
  M._fileT.addRecent('a', 'm'); M._fileT.addRecent('b', 'm'); M._fileT.addRecent('a', 'm');
  assert.deepStrictEqual(store['models.recent'].map(x => x.target).slice(0, 2), ['a', 'b'], 'recent: newest first, no repeats');
  M.prefs.set('recentMax', 1); M._fileT.addRecent('c', 'm'); assert.strictEqual(store['models.recent'].length, 1, 'recent length pref');
  ok('client: prefs kept under models.pref.<name> and offered to other parts, key list grows, recent list newest first within its length');

  // ---------- (3) routes ----------
  const srv = require('./file.server'), R = srv.routes;
  const game = path.join(root, 'game'), mod = path.join(root, 'mymod');
  fs.mkdirSync(path.join(game, 'resource'), { recursive: true }); fs.mkdirSync(path.join(game, 'mods'), { recursive: true }); fs.mkdirSync(mod, { recursive: true });
  const sctx = { game: () => game, tmpRoot: path.join(root, 'tmp'), runLint: (tool, args) => ({ status: 0, stdout: JSON.stringify({ findings: [] }), stderr: '' }) };
  fs.mkdirSync(sctx.tmpRoot, { recursive: true });
  const call = (v, b) => R['POST /api/x/models/file/' + v]('', b, sctx);
  let j = await call('new', { mod, path: 'entity/props/crate', template: 'prop', def: true, author: 'T' });
  assert.ok(j.ok, j.error);
  assert.strictEqual(j.mdl, 'resource/entity/props/crate/crate.mdl');
  assert.ok(fs.existsSync(j.target) && fs.existsSync(path.join(mod, 'resource', 'entity', 'props', 'crate', 'crate.def')), 'mdl and def on disk');
  const text = fs.readFileSync(j.target, 'latin1'); assert.ok(/\r\n/.test(text) && !/[^\r]\n/.test(text), 'CRLF');
  const mdlLib = require('../../../../lib/model/mdl'); const P = mdlLib.parse(fs.readFileSync(j.target));
  assert.ok(P.bones.some(b => b.path === 'basis') && P.volumes.length === 1, 'parses: basis and one volume');
  j = await call('new', { mod, path: 'entity/props/crate', template: 'empty' }); assert.ok(!j.ok && /already has/.test(j.error), 'clash refused: ' + j.error);
  j = await call('new', { mod, path: '../outside/x', template: 'empty' }); assert.ok(!j.ok && !/\n\s+at /.test(j.error), 'outside refused: ' + j.error);
  assert.ok(!fs.existsSync(path.join(root, 'outside')), 'nothing written outside');
  j = await call('new', { mod: game, path: 'entity/x', template: 'empty' }); assert.ok(!j.ok && /game install/.test(j.error), 'the game as mod refused');
  j = await call('new', { path: 'entity/x' }); assert.ok(!j.ok && /mod folder/i.test(j.error), 'no mod refused');
  ok('routes: new writes a parsing CRLF model and a .def into the mod; a clash, a path outside the mod, the game and no mod are refused');

  const b64 = s => Buffer.from(s, 'latin1').toString('base64');
  j = await call('write', { mod, files: [{ rel: 'resource/entity/c2/c2.mdl', data: b64('{Skeleton}\r\n') }, { rel: 'resource/entity/props/crate/crate.mdl', data: b64('x') }] });
  assert.ok(!j.ok && /already has/.test(j.error) && !fs.existsSync(path.join(mod, 'resource', 'entity', 'c2')), 'all or nothing: one clash writes nothing');
  j = await call('write', { mod, files: [{ rel: 'resource/entity/c2/c2.mdl', data: b64('{Skeleton}\r\n') }, { rel: 'resource/entity/c2/c2.def', data: b64('{}') }] });
  assert.ok(j.ok && j.written.length === 2 && /c2\.mdl$/.test(j.target), 'write: ' + JSON.stringify(j));
  j = await call('write', { mod, files: [{ rel: 'resource/x/con.mdl', data: b64('x') }] }); assert.ok(!j.ok, 'a name Windows refuses');
  ok('routes: write is all or nothing, gives the new .mdl, refuses names Windows cannot use');

  const set = [{ rel: 'resource/entity/c2/c2.mdl', data: b64('{Skeleton}\r\n') }, { rel: 'resource/entity/c2/c2.ply', data: b64('EPLY') }];
  j = await call('export', { mod, dest: 'export/c2', files: set });
  assert.ok(j.ok && fs.existsSync(path.join(mod, 'export', 'c2', 'resource', 'entity', 'c2', 'c2.ply')), 'folder export');
  j = await call('export', { mod, dest: 'export/c2', files: set }); assert.ok(!j.ok && /not empty/.test(j.error), 'non-empty folder refused');
  j = await call('export', { mod, dest: 'export/c2z', zip: true, files: set });
  assert.ok(j.ok && /c2z\.zip$/.test(j.path), 'zip export');
  const names = require('../../../../lib/pak').list(j.path).map(x => x.name || x.path || x.key).sort();
  assert.deepStrictEqual(names, ['resource/entity/c2/c2.mdl', 'resource/entity/c2/c2.ply'], 'zip entries ' + JSON.stringify(names));
  j = await call('export', { mod, dest: 'resource/entity/out', files: set }); assert.ok(!j.ok && /outside resource/.test(j.error), 'export under resource refused');
  ok('routes: export as a folder and as a zip (entries listed with pak.list), a non-empty folder and resource/ refused');

  const ext = path.join(root, 'elsewhere'); fs.mkdirSync(ext, { recursive: true }); fs.writeFileSync(path.join(ext, 'Track.ANM'), 'EANM');
  j = await call('source', { mod, from: path.join(ext, 'Track.ANM') });
  assert.ok(j.ok && j.name === 'track.anm' && j.origin === 'disk' && Buffer.from(j.data, 'base64').toString() === 'EANM', 'source from disk');
  j = await call('source', { mod, from: path.join(ext, 'x.dds') }); assert.ok(!j.ok && /Only \.ply/.test(j.error), 'other kinds refused');
  j = await call('source', { mod, from: path.join(ext, 'none.ply') }); assert.ok(!j.ok && /not found/.test(j.error), 'missing file');
  ok('routes: source reads a file from disk (lower-case name), refuses other kinds and missing files');

  j = await call('backup', { mod, rels: ['resource/entity/c2/c2.mdl', 'resource/entity/none/none.ply'] });
  assert.ok(j.ok && j.written.length === 1 && j.skipped.length === 1 && fs.readFileSync(path.join(mod, '.arsenal-bak', 'resource', 'entity', 'c2', 'c2.mdl.bak'), 'latin1') === '{Skeleton}\r\n', 'backup');
  j = await call('autosave', { mod, files: set }); assert.ok(j.ok && fs.existsSync(path.join(mod, '.arsenal', 'models-autosave', 'resource', 'entity', 'c2', 'c2.ply')), 'autosave');
  j = await call('autosave', { mod, files: set }); assert.ok(j.ok, 'autosave replaces the draft');
  j = await call('lint', { mod, files: set }); assert.ok(j.ok && Array.isArray(j.findings) && Array.isArray(j.ran), 'lint ' + JSON.stringify(j).slice(0, 300));
  assert.ok(!fs.readdirSync(sctx.tmpRoot).some(x => /^models-lint-/.test(x)), 'lint temp folder removed');
  j = await call('whoami', {}); assert.ok(j.ok && typeof j.user === 'string', 'whoami');
  ok('routes: backup keeps <rel>.bak in .arsenal-bak (skips files not in the mod), autosave drafts outside resource, lint runs and cleans up, whoami');

  srv._t.drop();
  console.log('PASS models file (' + n + ')');
})().catch(e => { console.error(e && e.stack || e); console.log('FAIL models file'); process.exit(1); });

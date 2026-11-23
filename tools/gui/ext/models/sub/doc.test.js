// Models page part `doc` test: (1) the same keys and slots in en ru uk zh, a text for every tx key; (2) the client string obeys the page
// rules and parses; (3) the routes on a synthetic model in a fake game folder (open, op, undo, redo, state, scene, save dry and real,
// close) and their refusals as status 400 plain sentences (no mod, the game as mod, "-" name, unknown document, unknown op named);
// (4) the page side in a stub browser wired to the real routes: D.open, D.op with change events, undo and redo, the bar's buttons and
// unsaved mark, Ctrl+Z / Ctrl+Y only outside text fields, the save panel (dry list first, then write), the leave warning, listeners added
// while drawing dropped at the next draw; (5) the Models page with this part: picking a model opens a document and parts get ctx.doc.
// No game, no browser. usage: node doc.test.js <scratch dir>     last line: PASS models doc (N)
// Author: Imperator_Aug (ARSENAL, ia-171ab69f)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const scratch = path.resolve(process.argv[2] || path.join(require('os').tmpdir(), 'models-doc-test'));
const root = path.join(scratch, 'doc-test');
fs.rmSync(root, { recursive: true, force: true }); fs.mkdirSync(root, { recursive: true });
let n = 0; const ok = m => { n++; console.log('ok ' + n + ' ' + m); };
const flush = () => new Promise(r => setImmediate(r));

(async () => {
  // ---------- (1) languages ----------
  const L = require('./doc.lang.json'), script = require('./doc.client'), PL = require('../lang.json');
  const en = Object.keys(L.en).sort();
  assert.ok(en.length > 10 && en.every(k => k.startsWith('models.doc.')), 'keys start models.doc.');
  for (const c of ['ru', 'uk', 'zh']) {
    assert.deepStrictEqual(Object.keys(L[c]).sort(), en, 'same keys in ' + c);
    for (const k of en) { assert.ok(L[c][k], c + ' ' + k); assert.deepStrictEqual((L[c][k].match(/\{\w+\}/g) || []).sort(), (L.en[k].match(/\{\w+\}/g) || []).sort(), 'slots ' + c + ' ' + k); }
  }
  for (const m of script.matchAll(/\btx\('([a-zA-Z0-9_.]+)'/g)) assert.ok(L.en[m[1]] || PL.en[m[1]], 'tx key ' + m[1]);
  for (const c of JSON.parse(/var KNOWN=(\[[^\]]*\])/.exec(script)[1].replace(/'/g, '"'))) assert.ok(PL.en['models.code.' + c], 'loss text ' + c);
  for (const s of Object.values(L.en)) assert.ok(!/ - |–|—|\[[VIT]\]/.test(s), 'plain words: ' + s);
  ok('lang: ' + en.length + ' keys, same keys and slots in en ru uk zh, a text for every tx key and loss code, plain words');

  // ---------- (2) page rules ----------
  assert.ok(!/[`]|\$\{|innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(/.test(script), 'page rules');
  assert.ok(!/(^|[^\w])[A-Za-z]:[\\/]|https?:\/\//.test(script), 'no fixed path or address');
  assert.ok(!/#[0-9a-fA-F]{3,6}\b/.test(script), 'no fixed colours');
  new vm.Script(script, { filename: 'doc.client' });
  ok('client: page rules, no fixed colours, parses');

  // ---------- fixture: a model in a fake game folder ----------
  const game = path.join(root, 'game'), mod = path.join(root, 'mymod'), gdir = path.join(game, 'resource', 'entity', 'dt');
  fs.mkdirSync(gdir, { recursive: true }); fs.mkdirSync(path.join(game, 'mods'), { recursive: true }); fs.mkdirSync(mod, { recursive: true });
  const MDL = Buffer.from(['{Skeleton', '\t{bone "body"', '\t\t{Position 0\t0\t10}', '\t}', '}', '{Volume "armor"', '\t{Box 10 6 4}', '\t{Bone "body"}', '}', ''].join('\r\n'), 'latin1');
  fs.writeFileSync(path.join(gdir, 'dt.mdl'), MDL);
  const MK = 'resource/entity/dt/dt.mdl';
  const core = require('../../../../lib/model/edit/core'), mdlLib = require('../../../../lib/model/mdl');
  core.register('docpage.size', { apply(doc, a) { return { files: { [doc.mdl]: mdlLib.edit(doc.read(doc.mdl), [{ op: 'setVolume', volume: 'armor', size: a.size }]) }, info: { size: a.size } }; },
    check(doc, a) { return Array.isArray(a.size) ? null : 'Give the box its sizes.'; } });
  core.registerState('docpage.armor', doc => ({ size: doc.read(doc.mdl).volumes.find(v => v.name === 'armor').size }));

  // ---------- (3) routes ----------
  const srv = require('./doc.server'), R = srv.routes;
  // runTool: only the page's stage --dry call goes through it here (the file set of the picked model)
  const ctx = { game: () => game, tmpRoot: path.join(root, 'tmp'),
    runTool: async (tool, entry, args) => { const i = args.indexOf('--json'); if (i >= 0) fs.writeFileSync(args[i + 1], JSON.stringify({ files: [{ rel: MK }] })); return { code: 0, stdout: '', stderr: '' }; } };
  const call = (verb, body) => R['POST /api/x/models/doc/' + verb]('/api/x/models/doc/' + verb, body, ctx);
  const refuses = async (verb, body, re) => { try { await call(verb, body); } catch (e) { assert.strictEqual(e.status, 400, verb + ' status ' + e.status + ' ' + e.message); assert.ok(re.test(e.message) && !/\n\s+at /.test(e.message), verb + ': ' + e.message); return; } assert.fail(verb + ' was not refused'); };
  assert.deepStrictEqual(Object.keys(R).sort(), ['close', 'dir', 'open', 'op', 'redo', 'save', 'scene', 'state', 'undo'].map(v => 'POST /api/x/models/doc/' + v).sort());
  let j = await call('open', { mod, mdl: MK });
  assert.ok(j.doc && j.rev === 0 && j.mdl === MK && j.files.length === 1 && j.files[0].from === 'game' && !j.dirty && Array.isArray(j.ops) && j.ops.includes('docpage.size'));
  const id = j.doc;
  j = await call('op', { doc: id, op: 'docpage.size', args: { size: [8, 6, 4] } });
  assert.ok(j.rev === 1 && j.changed[0] === MK && j.canUndo && !j.canRedo && j.dirty && j.info.size[0] === 8);
  assert.deepStrictEqual(await call('state', { doc: id, what: 'docpage.armor' }), { size: [8, 6, 4] });
  const sc = await call('scene', { doc: id });
  assert.ok(sc.format === 'scene/1' && sc.volumes[0].size[0] === 8 && sc.rev === 1);
  j = await call('undo', { doc: id }); assert.ok(j.rev === 2 && !j.dirty && j.canRedo && j.op === 'docpage.size');
  j = await call('redo', { doc: id }); assert.ok(j.rev === 3 && j.dirty);
  j = await call('save', { doc: id, dry: true });
  assert.ok(!j.written && j.writes.length === 1 && j.writes[0].rel === MK && j.writes[0].was === 'new' && !('bytes' in j.writes[0]) && !fs.existsSync(path.join(mod, MK)));
  ok('routes: open, op, state, scene from the current bytes, undo, redo, save dry lists the file and writes nothing');
  await refuses('op', { doc: id, op: 'no.such.edit', args: {} }, /no edit called "no\.such\.edit"/);
  await refuses('op', { doc: id, op: 'docpage.size', args: {} }, /Give the box its sizes/);
  await refuses('op', { doc: 'nope', op: 'docpage.size' }, /no longer open/);
  await refuses('state', { doc: id, what: 'no.view' }, /no view called/);
  await refuses('scene', { doc: id, anm: 'x.anm' }, /not part of this model/);
  await refuses('open', { mdl: MK }, /mod folder/i);
  await refuses('open', { mod: game, mdl: MK }, /game install/);
  await refuses('open', { mod, target: '-x' }, /cannot start/);
  await refuses('open', { mod, target: 'a*b' }, /letters/);
  await refuses('open', { mod, mdl: 'resource/none/x.mdl' }, /not in the mod folder/);
  ok('routes: unknown op named, a refused op, unknown document, unknown view, missing animation, no mod, the game as mod, odd names, missing model: status 400 sentences');
  j = await call('save', { doc: id });
  assert.ok(j.written && !j.dirty && fs.readFileSync(path.join(mod, MK)).equals(core.get(id).files.get(MK).bytes), 'saved into the mod at the same rel path');
  assert.ok(fs.readFileSync(path.join(gdir, 'dt.mdl')).equals(MDL), 'the game file is untouched');
  assert.deepStrictEqual(await call('close', { doc: id }), { closed: true });
  await refuses('undo', { doc: id }, /no longer open/);
  ok('routes: save writes the game file into the mod, the game untouched; close');

  // ---------- (4) the page side in a stub browser ----------
  const ext = require('../index');
  const route = (url, body) => { const f = ext.routes['POST ' + url]; if (!f) return Promise.reject(new Error('no route ' + url)); return Promise.resolve().then(() => f(url, body, ctx)); };
  const calls = []; let busy = 0;
  const api = (url, body) => { calls.push([url, body]); busy++; return route(url, JSON.parse(JSON.stringify(body || {}))).finally(() => { busy--; }).then(x => JSON.parse(JSON.stringify(x))); };
  // settle: wait until no route call is running and the page's follow-up code has run (a fixed number of turns is too few on a
  // loaded machine, where the routes' file reads and writes take longer); gives up after 30 s so a real hang still fails
  const settle = async () => { const end = Date.now() + 30000; let quiet = 0;
    while (quiet < 3) { await flush(); if (busy) { quiet = 0; await new Promise(r => setTimeout(r, 5)); } else quiet++; if (Date.now() > end) throw new Error('settle: a route call never ended'); } };
  const node = tag => ({ tagName: String(tag).toUpperCase(), kids: [], attrs: {}, style: {}, className: '', textContent: '', hidden: false, disabled: false, isConnected: true, listeners: {},
    get firstChild() { return this.kids[0] || null; }, appendChild(c) { if (c && typeof c === 'object') this.kids.push(c); return c; },
    removeChild(c) { this.kids.splice(this.kids.indexOf(c), 1); return c; }, setAttribute(k, v) { this.attrs[k] = v; if (k === 'hidden') this.hidden = true; },
    getAttribute(k) { return this.attrs[k] == null ? null : this.attrs[k]; }, addEventListener(k, f) { (this.listeners[k] = this.listeners[k] || []).push(f); },
    contains(x) { if (x === this) return true; return this.kids.some(k => k.contains && k.contains(x)); }, focus() {}, click() { (this.listeners.click || []).forEach(f => f({})); } });
  const h = (tag, a, kids) => { const e = node(tag); for (const k of Object.keys(a || {})) { const v = a[k]; if (v == null || v === false) continue; if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v); }
    (kids || []).forEach(c => { if (c != null) e.appendChild(c); }); return e; };
  const LANGS = Object.assign({}, ext.lang.en);
  const tx = (k, p) => (LANGS[k] || k).replace(/\{(\w+)\}/g, (m, x) => (p && p[x] != null ? String(p[x]) : m));
  const docL = {}, winL = {}; let answer = true, asked = 0;
  const body = node('body');
  const document = { body, activeElement: body, addEventListener(k, f, cap) { (docL[k] = docL[k] || []).push(f); }, querySelector: () => null, createElement: node };
  const window = { addEventListener(k, f) { (winL[k] = winL[k] || []).push(f); }, confirm() { asked++; return answer; }, devicePixelRatio: 1 };
  const store = {}, LS = { get: (k, d) => (k in store ? store[k] : d), set: (k, v) => { store[k] = v; } };
  const S = { cur: 'models', mod }, EXT = {}, toasts = [];
  new Function('EXT_SCREENS', 'h', 'tx', 'LS', 'api', 'S', 'pick', 'toast', 'LANG', 'window', 'document',
    require('../client') + '\n' + script)(EXT, h, tx, LS, api, S, () => {}, m => toasts.push(m), 'en', window, document);
  const D = EXT.models.doc;
  for (const m of ['open', 'op', 'undo', 'redo', 'save', 'state', 'scene', 'on', 'select', 'bar', 'confirmLeave']) assert.strictEqual(typeof D[m], 'function', m);
  assert.deepStrictEqual(D.sel, { bone: null, volume: null, anm: null, frame: 0 });
  const evs = []; const off = D.on(e => evs.push(e.type));
  const pageRoot = node('div'), bar = D.bar(pageRoot);
  const btn = label => { let f = null; (function w(x) { if (f || !x) return; if (x.tagName === 'BUTTON' && x.textContent === label) f = x; (x.kids || []).forEach(w); })(bar); return f; };
  const bUndo = btn(tx('models.doc.undo')), bRedo = btn(tx('models.doc.redo')), bSave = btn(tx('models.doc.save'));
  assert.ok(bUndo && bRedo && bSave && bUndo.disabled && bRedo.disabled && bSave.disabled, 'nothing open: buttons off');
  const mark = (function f(x) { if (!x) return null; if (x.textContent === tx('models.doc.dirty')) return x; for (const k of x.kids || []) { const r = f(k); if (r) return r; } return null; })(bar);
  // shown as a browser draws it with the page's CSS: a class rule that sets display (.badge{display:inline-block}) beats the hidden
  // attribute unless the CSS has a [hidden] rule for that class; an inline display:none always hides
  const CSS = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'page.js'), 'utf8');
  const esc = c => c.replace(/[-]/g, '\\-');
  const shown = x => { if (x.style && x.style.display === 'none') return false; if (!x.hidden) return true;
    return String(x.className || '').split(/\s+/).filter(Boolean).some(c => new RegExp('\\.' + esc(c) + '\\{[^}]*display:(?!none)').test(CSS) && !new RegExp('(\\[hidden\\]\\.' + esc(c) + '|\\.' + esc(c) + '\\[hidden\\])\\b').test(CSS)); };
  assert.ok(mark && shown({ className: 'badge', hidden: true, style: {} }), 'the CSS model: .badge beats the hidden attribute alone');
  assert.ok(!shown(mark), 'nothing open: no unsaved mark');
  assert.ok(docL.keydown && docL.click && winL.beforeunload, 'keys, nav clicks and leaving are watched');
  await assert.rejects(D.op('docpage.size', {}), /No model is open/);
  await D.open({ mod, mdl: MK });
  assert.ok(D.id && D.mdl === MK && D.rev === 0 && evs.includes('open') && !D.dirty);
  assert.ok(!shown(mark) && bUndo.disabled && bRedo.disabled && bSave.disabled, 'a model just opened: no unsaved mark, Undo Redo Save off');
  const again = D.open({ mod, mdl: MK }); assert.strictEqual(await again, D); assert.strictEqual(calls.filter(c => /doc\/open$/.test(c[0])).length, 1, 'same model: no second open');
  ok('page: D has every method, the bar starts off, D.open opens once and sends the open event');

  let j2 = await D.op('docpage.size', { size: [20, 6, 4] });
  assert.ok(j2.rev === 1 && D.rev === 1 && D.dirty && D.canUndo && evs[evs.length - 1] === 'change');
  assert.ok(!bUndo.disabled && bRedo.disabled && !bSave.disabled, 'bar follows');
  assert.ok(shown(mark), 'unsaved mark shown');
  assert.deepStrictEqual(await D.state('docpage.armor'), { size: [20, 6, 4] });
  assert.strictEqual((await D.scene({ meshes: false })).volumes[0].size[0], 20, 'D.scene draws the unsaved edit');
  // keys: Ctrl+Z undoes when the page (or nothing) has the focus, not inside a text field
  const key = (k, shift) => { let pd = 0; docL.keydown.forEach(f => f({ key: k, ctrlKey: true, shiftKey: !!shift, preventDefault() { pd++; } })); return pd; };
  document.activeElement = h('input'); pageRoot.appendChild(document.activeElement);
  assert.strictEqual(key('z'), 0, 'in a text field Ctrl+Z is the field\'s own');
  document.activeElement = h('div'); assert.strictEqual(key('z'), 0, 'focus outside the Models page: not ours');
  document.activeElement = body; assert.strictEqual(key('z'), 1); await settle();
  assert.ok(D.rev === 2 && !D.dirty && D.canRedo && !shown(mark), 'Ctrl+Z undid');
  assert.strictEqual(key('y'), 1); await settle(); assert.ok(D.rev === 3 && D.dirty, 'Ctrl+Y redid');
  assert.strictEqual(key('z', true), 1); await settle(); assert.ok(D.rev === 3, 'Ctrl+Shift+Z with nothing to redo does nothing');
  bUndo.click(); await settle(); assert.ok(D.rev === 4 && !D.dirty); bRedo.click(); await settle(); assert.ok(D.rev === 5 && D.dirty);
  ok('page: D.op changes the bar and mark, D.state and D.scene read the current bytes, Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z and the buttons undo and redo');

  // leaving with unsaved changes
  const ue = { preventDefault() { this.p = 1; } }; winL.beforeunload[0](ue); assert.ok(ue.p, 'the browser asks before closing');
  const navBtn = { getAttribute: () => 'false' }, ne = { target: { closest: () => navBtn }, preventDefault() { this.p = 1; }, stopPropagation() { this.s = 1; } };
  answer = false; docL.click[0](ne); assert.ok(ne.p && ne.s && asked === 1, 'another page tab: asked, stays');
  answer = true; const ne2 = Object.assign({}, ne, { p: 0, s: 0 }); docL.click[0](ne2); assert.ok(!ne2.p && asked === 2, 'yes: goes');
  answer = false; assert.strictEqual(D.confirmLeave(), false); assert.strictEqual(await D.open({ mod, mdl: 'resource/entity/dt/other.mdl' }), D);
  assert.ok(D.mdl === MK && D.dirty, 'declined: the model with unsaved changes stays open');
  answer = true;
  ok('page: unsaved changes: the browser asks before closing, a page tab click asks, switching model asks and keeps the work on no');

  // save: dry list first, then write
  bSave.click(); await settle();
  const texts = x => { const a = []; (function w(y) { if (!y) return; if (y.textContent) a.push(y.textContent); (y.kids || []).forEach(w); })(x); return a; };
  let t = texts(bar);
  assert.ok(t.some(s => s.startsWith(tx('models.doc.willWrite', { m: mod }))) && t.some(s => s.includes(MK) && s.includes(tx('models.doc.was.changed'))), 'the list before writing (the route test saved a copy into the mod)');
  const before = fs.readFileSync(path.join(mod, MK));
  assert.strictEqual(mdlLib.parse(before).volumes[0].size[0], 8, 'nothing new written yet');
  btn(tx('models.doc.write')).click(); await settle();
  // on failure say why (a full scratch drive refuses the write: the bar and the toasts carry the route's words)
  assert.ok(!D.dirty && evs.includes('saved') && toasts.length === 1, 'saved; dirty ' + D.dirty + ', events ' + evs.slice(-4).join(' ') + ', toasts ' + JSON.stringify(toasts) + ', bar ' + JSON.stringify(texts(bar).slice(-6)));
  const now = fs.readFileSync(path.join(mod, MK)); assert.ok(!now.equals(before) && mdlLib.parse(now).volumes[0].size[0] === 20);
  assert.ok(bSave.disabled && !shown(mark));
  ok('page: Save shows the files it will write first, writes on the second press, then the mark goes');

  // listeners added while the page draws are dropped at the next draw; D.on's remover works
  const seen = []; D._begin(); D.on(e => seen.push(e.type)); D._end();
  D.select({ volume: 'body/armor' }); assert.deepStrictEqual(seen, ['select']); assert.deepStrictEqual(D.sel, { bone: null, volume: 'body/armor', anm: null, frame: 0 });
  D._begin(); D._end(); D.select({ frame: 3 }); assert.deepStrictEqual(seen, ['select'], 'dropped at the next draw');
  off(); const k = evs.length; D.select({}); assert.strictEqual(evs.length, k, 'removed');
  ok('page: D.select merges and sends select; draw-time listeners dropped at the next draw; D.on returns its remover');

  // the joins between parts: hidden, dir, go, key areas, close event, Ctrl+S
  const ev2 = []; const off2 = D.on(e => ev2.push(e));
  D.setHidden({ bones: ['body'], volumes: ['body/armor'] });
  assert.ok(ev2[0].type === 'hidden' && D.hidden.bones[0] === 'body' && D.hidden.volumes[0] === 'body/armor', 'hidden event');
  const dj = await D.dir(); assert.ok(dj.dir === 'resource/entity/dt/' && Array.isArray(dj.files), 'D.dir');
  const md = await D.dir({ ext: '.mdl' }); assert.ok(md.files.includes(MK), 'D.dir lists the model itself');
  let went = null; D._setGo(s => { went = s; return true; });
  assert.ok(EXT.models.go('tree', { bone: 'body' }) && went === 'tree' && D.sel.bone === 'body', 'go switches and selects');
  const tree = h('div', { 'data-keys': 'tree' }), inTree = h('button'); tree.appendChild(inTree); inTree.parentNode = tree;
  assert.strictEqual(D.area(inTree), 'tree'); assert.strictEqual(D.area(h('input')), 'text'); assert.strictEqual(D.area(body), 'page');
  assert.ok(EXT.models.keys.some(r => r.key === 'models.doc.key.save' && r.keys === 'Ctrl+S'), 'key rows');
  await D.op('docpage.size', { size: [21, 6, 4] });
  document.activeElement = h('input'); pageRoot.appendChild(document.activeElement);
  assert.strictEqual(key('s'), 1, 'Ctrl+S in a text field still saves'); await settle();
  assert.ok(texts(bar).some(s => s.startsWith(tx('models.doc.willWrite', { m: mod }))), 'Ctrl+S shows the list');
  document.activeElement = body;
  const used = { key: 'z', ctrlKey: true, defaultPrevented: true, preventDefault() { this.p = 1; } }; docL.keydown.forEach(f => f(used));
  assert.ok(!used.p && D.dirty, 'a key already used by the focused part is left alone');
  const sv = await D.save({ dry: true, lint: true });
  assert.ok(sv.check && Array.isArray(sv.check.ran), 'lint ran on the dry save');
  answer = true; D.close();
  assert.ok(ev2.some(e => e.type === 'close') && D.hidden.bones.length === 0, 'close event, hidden reset');
  off2();
  ok('page: setHidden, dir, go, key areas and rows, Ctrl+S anywhere, used keys left alone, lint on the dry save, close event');

  // ---------- (5) the Models page with this part ----------
  D.close(); assert.ok(!D.id);
  let got = null; EXT.models.subs.probe = c => { got = c; };
  const page = EXT.models(node('div'));
  page.pick(path.join(gdir, 'dt.mdl'));
  await settle();
  assert.ok(calls.some(c => /doc\/open$/.test(c[0]) && c[1].target === path.join(gdir, 'dt.mdl') && c[1].mod === mod), 'picking a model opens a document');
  await D.opening; assert.ok(D.id, 'open');
  store['models.sub'] = 'probe';
  const page2 = EXT.models(node('div')); page2.pick(path.join(gdir, 'dt.mdl'));
  await settle();
  assert.ok(got && got.doc === D, 'parts get ctx.doc');
  ok('Models page: picking a model opens a document when a mod folder is chosen; parts get ctx.doc');

  for (const c of core.list()) core.close(c.doc);
  console.log('PASS models doc (' + n + ')');
})().catch(e => { console.error(e && e.stack || e); console.log('FAIL models doc'); process.exit(1); });

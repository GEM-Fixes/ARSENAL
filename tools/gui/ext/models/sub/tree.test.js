// Models page part `tree` (Skeleton sub-tab) test: (1) the same keys and slots in en ru uk zh, a text for every tx key, every action
// and type has its text; (2) the client string obeys the page rules and parses; (3) the part drawn on a stub DOM against a document
// from the real tools/lib/model/edit/core.js (synthetic model in a scratch mod folder, no game): the tree lists the bones, a click
// selects through D.select, the toolbar adds a bone, the arrow keys move the pick, the form renames, the delete panel deletes,
// drag and drop moves a bone, every menu entry is there, bad numbers are refused in words; the bytes stay CRLF and parse.
// No game, no browser.
// usage: node tree.test.js [scratch dir]     last line: PASS models tree (N)
// Author: Imperator_Aug (ARSENAL, ia-7c064b75)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const scratch = path.resolve(process.argv[2] || path.join(require('os').tmpdir(), 'models-tree-test'));
const root = path.join(scratch, 'tree-test');
fs.rmSync(root, { recursive: true, force: true }); fs.mkdirSync(root, { recursive: true });
let n = 0; const ok = m => { n++; console.log('ok ' + n + ' ' + m); };
const tick = () => new Promise(r => setImmediate(r));
const settle = async () => { for (let i = 0; i < 20; i++) await tick(); };

(async () => {
  // ---------- (1) languages ----------
  const L = require('./tree.lang.json'), script = require('./tree.client');
  const en = Object.keys(L.en).sort();
  assert.ok(en.length > 100 && en.every(k => k.startsWith('models.tree.') || k === 'models.sub.tree'), 'keys start models.tree.');
  for (const c of ['ru', 'uk', 'zh']) {
    assert.deepStrictEqual(Object.keys(L[c]).sort(), en, 'same keys in ' + c);
    for (const k of en) { assert.ok(L[c][k], c + ' ' + k); assert.deepStrictEqual((L[c][k].match(/\{\w+\}/g) || []).sort(), (L.en[k].match(/\{\w+\}/g) || []).sort(), 'slots ' + c + ' ' + k); }
  }
  for (const m of script.matchAll(/\btx\('([a-zA-Z0-9_.]+)'/g)) if (!/\.$/.test(m[1])) assert.ok(L.en[m[1]], 'tx key ' + m[1]);
  // models.tree.mesh, .lod, .seqFile: searchKit history keys, not texts
  for (const m of script.matchAll(/'(models\.tree\.[a-zA-Z0-9_.]+[a-zA-Z0-9_])'/g)) if (!/^models\.tree\.(open|step(Move|Turn)|mesh|lod|seqFile)$/.test(m[1])) assert.ok(L.en[m[1]], 'key ' + m[1]);
  const acts = [...script.matchAll(/\['([a-zA-Z]+)',function/g)].map(m => m[1]);
  assert.ok(acts.length >= 30, 'actions listed ' + acts.length);
  for (const a of acts) assert.ok(L.en['models.tree.a.' + a], 'action text ' + a);
  for (const k of ['bone', 'revolute', 'prizmatic', 'socket', 'planarsocket', 'wild']) assert.ok(L.en['models.tree.type.' + k], k);
  for (const k of ['NoCastShadows', 'NoGetShadows', 'NoGroupMesh', 'DecalTarget', 'Ground']) assert.ok(L.en['models.tree.vf.' + k], k);
  for (const k of ['delete', 'parent', 'keep']) assert.ok(L.en['models.tree.ask.v.' + k], k);
  for (const c of ['en', 'ru', 'uk', 'zh']) for (const k of en) assert.ok(!/\[[VIT]\]| — | -- | - /.test(L[c][k]), 'plain words ' + c + ' ' + k);
  ok('lang: ' + en.length + ' keys, same keys and slots in en ru uk zh, a text for every tx key, action, joint type and mesh flag, no marks or dashes');

  // ---------- (2) page rules, parse ----------
  assert.ok(!/[`]|\$\{|innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(/.test(script), 'page rules');
  assert.ok(!/(^|[^\w])[A-Za-z]:[\\/]|https?:\/\//.test(script), 'no fixed path or address');
  assert.ok(!/#[0-9a-fA-F]{3,6}\b(?!')|rgb\(/.test(script.replace(/'#808080'/, '')), 'colours only from CSS variables');
  new vm.Script(script, { filename: 'tree.client' });
  ok('client: page rules, no fixed colours, parses');

  // ---------- (3) drawn against the real core ----------
  const core = require('../../../../lib/model/edit/core');
  const mod = path.join(root, 'mymod'), dir = path.join(mod, 'resource', 'entity', 'tt');
  fs.mkdirSync(dir, { recursive: true });
  const MDL = ['{Skeleton', '\t{bone "basis"', '\t\t{bone "body"', '\t\t\t{Position 0\t0\t10}', '\t\t\t{bone "turret" revolute', '\t\t\t\t{Position 20\t0\t5}',
    '\t\t\t\t{Limits -30 30}', '\t\t\t}', '\t\t}', '\t\t{bone "wheel"', '\t\t\t{Position 5\t5\t0}', '\t\t}', '\t}', '}', '{Volume "hull"', '\t{Box 10 6 4}', '\t{Bone "body"}', '}', ''].join('\r\n');
  fs.writeFileSync(path.join(dir, 'tt.mdl'), MDL, 'latin1');
  const doc = core.open({ mod, mdl: 'resource/entity/tt/tt.mdl', game: null });
  assert.ok(core.ops().includes('bone.add') && core.states().includes('tree.list'), 'core loads tree.js: ' + JSON.stringify(core.problems()));
  ok('core: open on a scratch mod folder without the game, tree ops and states registered by the core itself');

  // the D the page gets (sub/doc.client.js shape), backed by the real document
  const fns = [], sels = [], ops = [];
  const D = { id: doc.id, rev: 0, sel: { bone: null, volume: null, anm: null, frame: 0 }, files: [],
    on(f) { fns.push(f); return () => { const i = fns.indexOf(f); if (i >= 0) fns.splice(i, 1); }; },
    emit(ev) { fns.slice().forEach(f => f(ev)); },
    op(name, args) { ops.push([name, args]); return new Promise((res, rej) => { try { const r = doc.apply(name, args); D.rev = r.rev; const ev = { type: 'change', rev: r.rev, changed: r.changed, info: r.info }; D.emit(ev); res(ev); } catch (e) { rej(e); } }); },
    state(what, q) { return new Promise((res, rej) => { try { res(JSON.parse(JSON.stringify(doc.state(what, q)))); } catch (e) { rej(e); } }); },
    select(o) { for (const k of ['bone', 'volume', 'anm', 'frame']) if (k in o) D.sel[k] = o[k]; sels.push(o); D.emit({ type: 'select', sel: D.sel }); } };

  const node = tag => {
    const o = { tag, style: {}, childNodes: [], attrs: {}, listeners: {}, textContent: '', className: '', value: '', checked: false, disabled: false, hidden: false, focused: 0,
      appendChild(c) { this.childNodes.push(c); c.parentNode = this; return c; }, removeChild(c) { this.childNodes.splice(this.childNodes.indexOf(c), 1); return c; },
      get firstChild() { return this.childNodes[0] || null; }, get lastChild() { return this.childNodes[this.childNodes.length - 1]; },
      focus() { this.focused++; }, addEventListener(k, f) { (this.listeners[k] = this.listeners[k] || []).push(f); },
      setAttribute(k, v) { this.attrs[k] = v; if (k === 'hidden') this.hidden = true; }, getAttribute(k) { return this.attrs[k]; } };
    return o;
  };
  const h = (tag, attrs, kids) => { const e = node(tag); for (const k of Object.keys(attrs || {})) { const v = attrs[k]; if (v == null || v === false) continue;
    if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v); }
    for (const c of kids || []) if (c != null) e.appendChild(typeof c === 'string' ? { textContent: c, childNodes: [] } : c); return e; };
  const clear = x => { x.childNodes.length = 0; };
  const all = (x, f, out = []) => { if (!x) return out; if (f(x)) out.push(x); (x.childNodes || []).forEach(c => all(c, f, out)); return out; };
  const text = x => all(x, () => true).map(c => c.textContent || '').join('|');
  const fire = (x, type, ev) => { (x.listeners[type] || []).forEach(f => f(Object.assign({ preventDefault() {}, stopPropagation() {}, clientX: 10, clientY: 10, dataTransfer: { setData() {} } }, ev || {}))); };
  const store = {};
  const LS = { get: (k, d) => (k in store ? JSON.parse(JSON.stringify(store[k])) : d), set: (k, v) => { store[k] = JSON.parse(JSON.stringify(v)); } };
  const EXT = { models: { parts: {}, subs: {}, doc: D } };
  const tx = (k, p) => (L.en[k] || k).replace(/\{(\w+)\}/g, (m, x) => (p && p[x] != null ? String(p[x]) : m));
  new Function('EXT_SCREENS', 'h', 'tx', 'api', 'S', 'window', 'document', 'LS', script)(EXT, h, tx, () => new Promise(() => {}), { mod: mod }, {}, { createElement: node }, LS);
  assert.strictEqual(typeof EXT.models.subs.tree, 'function', 'sub set');
  const T = EXT.models.subs.tree._t;
  assert.strictEqual(T.num('1,5'), 1.5); assert.strictEqual(T.num(' -2.25 '), -2.25); assert.strictEqual(T.num('x'), null); assert.strictEqual(T.fmt(0.1 + 0.2), '0.3');
  const body = node('div');
  EXT.models.subs.tree({ body, el: h, clear, doc: D, set: {}, mod });
  await settle();
  const tree = () => all(body, x => x.attrs.role === 'tree')[0];
  const rows = () => all(tree(), x => x.attrs.role === 'treeitem' && x.attrs['aria-level']);
  const rowOf = name => rows().find(r => r.childNodes[2] && r.childNodes[2].textContent === name);
  const btnOf = label => all(body, x => x.tag === 'button' && x.textContent === label && !x.disabled && !all(body, m => m.attrs.role === 'menu')[0].childNodes.includes(x))[0];
  const msg = () => all(body, x => x.attrs['aria-live'] === 'polite')[0].textContent;
  assert.deepStrictEqual(rows().map(r => r.childNodes[2].textContent), ['basis'], 'closed tree shows the root');
  assert.strictEqual(T.ST.bone, 'basis', 'first bone picked');
  assert.ok(text(body).includes(L.en['models.tree.s.place']) && text(body).includes(L.en['models.tree.f.pos']), 'form drawn');
  fire(btnOf(L.en['models.tree.a.expandAll']), 'click');
  assert.deepStrictEqual(rows().map(r => r.childNodes[2].textContent), ['basis', 'body', 'turret', 'wheel'], 'open all: every bone in file order');
  assert.ok(text(tree()).includes('hull') && text(tree()).includes(L.en['models.tree.type.revolute']), 'volume row and joint badge');
  ok('page: draws the tree from tree.list (closed, then open all), the joint badge, the volume under its bone, the form of the picked bone');

  fire(rowOf('turret'), 'click'); await settle();
  assert.strictEqual(sels[sels.length - 1].bone, 'basis/body/turret', 'D.select({bone})');
  assert.ok(text(body).includes(L.en['models.tree.s.joint']), 'joint section for a revolute bone');
  const tb = tree();
  fire(tb, 'keydown', { key: 'ArrowDown' }); await settle(); assert.strictEqual(T.ST.bone, 'basis/wheel', 'down');
  fire(tb, 'keydown', { key: 'ArrowUp' }); fire(tb, 'keydown', { key: 'ArrowLeft' }); await settle(); assert.strictEqual(T.ST.bone, 'basis/body', 'up, then left goes to the parent');
  fire(tb, 'keydown', { key: 'ArrowLeft' }); await settle(); assert.ok(!rowOf('turret'), 'left on an open bone closes it');
  fire(tb, 'keydown', { key: 'ArrowRight' }); fire(tb, 'keydown', { key: 'ArrowRight' }); await settle(); assert.strictEqual(T.ST.bone, 'basis/body/turret', 'right opens, then goes in');
  const vrow = all(tree(), x => x.attrs.role === 'treeitem' && !x.attrs['aria-level'])[0]; fire(vrow, 'click');
  assert.strictEqual(sels[sels.length - 1].volume, 'basis/body/hull', 'a volume row selects the volume');
  const find = all(body, x => x.attrs.type === 'search')[0]; find.value = 'WHE'; fire(find, 'input'); await settle();
  assert.strictEqual(T.ST.bone, 'basis/wheel', 'find by the start of the name, any case');
  ok('page: click selects through D.select, arrows up, down, left, right, a volume row picks the volume, find');

  fire(btnOf(L.en['models.tree.a.addChild']), 'click'); await settle();
  assert.ok(ops.some(o => o[0] === 'bone.add' && o[1].parent === 'basis/wheel'), 'bone.add with the picked parent');
  assert.strictEqual(T.ST.bone, 'basis/wheel/bone0', 'new bone picked'); assert.ok(rowOf('bone0'), 'new row shown, its parent opened');
  const nameIn = all(body, x => x.attrs['aria-label'] === L.en['models.tree.f.name'])[0];
  assert.ok(nameIn, 'name field: ' + msg());
  nameIn.value = 'axle'; fire(nameIn, 'keydown', { key: 'Enter' }); await settle();
  assert.strictEqual(T.ST.bone, 'basis/wheel/axle', 'renamed, pick follows'); assert.ok(rowOf('axle') && !rowOf('bone0'));
  nameIn.value = 'bad"name'; await settle();
  const nameIn2 = all(body, x => x.attrs['aria-label'] === L.en['models.tree.f.name'])[0]; nameIn2.value = 'bad"name'; fire(nameIn2, 'keydown', { key: 'Enter' }); await settle();
  assert.ok(/name/i.test(msg()) && T.ST.bone === 'basis/wheel/axle', 'a bad name is refused in words: ' + msg());
  const posIn = all(body, x => x.attrs['aria-label'] === L.en['models.tree.f.pos'] + ' x')[0]; posIn.value = 'abc';
  fire(all(body, x => x.tag === 'button' && x.className === 'primary' && x.textContent === L.en['models.tree.f.apply'])[0], 'click'); await settle();
  assert.ok(msg().startsWith(L.en['models.tree.f.pos']), 'bad number refused: ' + msg());
  const pos2 = all(body, x => x.attrs['aria-label'] === L.en['models.tree.f.pos'] + ' x')[0]; pos2.value = '2,5';
  fire(all(body, x => x.tag === 'button' && x.className === 'primary' && x.textContent === L.en['models.tree.f.apply'])[0], 'click'); await settle();
  const g = doc.state('bone.get', { bone: 'basis/wheel/axle' }); assert.strictEqual(g.position[0], 2.5, 'place with a decimal comma');
  ok('page: toolbar adds a bone inside the picked one and picks it, rename from the form (Enter), refusals shown in words, place with 2,5');

  // drag axle onto turret
  fire(rowOf('axle'), 'dragstart'); fire(rowOf('turret'), 'drop'); await settle();
  assert.strictEqual(T.ST.bone, 'basis/body/turret/axle', 'drag and drop moves the bone');
  // menu: every action, disabled ones marked
  fire(btnOf(L.en['models.tree.actions']), 'click');
  const menu = all(body, x => x.attrs.role === 'menu')[0];
  assert.ok(!menu.hidden && menu.childNodes.length === acts.length + 1, 'menu has every action and Close');
  const up = menu.childNodes.find(x => x.textContent === L.en['models.tree.a.up']); assert.ok(up.disabled, 'only child: up is off');
  fire(menu.childNodes.find(x => x.textContent === L.en['models.tree.a.duplicate']), 'click'); await settle();
  assert.ok(menu.hidden && rowOf('axle_0'), 'duplicate from the menu: ' + msg() + ' ' + rows().map(r => r.childNodes[2].textContent));
  // delete through the panel, keep the bones under it
  fire(rowOf('body'), 'click'); await settle();
  fire(tree(), 'keydown', { key: 'Delete' });
  assert.ok(text(body).includes('Delete body and everything under it'), 'delete asks first');
  assert.ok(all(body, x => x.tag === 'option' && x.attrs.value === 'parent').length, 'volume choice offered');
  const cancel = btnOf(L.en['models.tree.cancel']); fire(cancel, 'click');
  assert.ok(rowOf('body'), 'cancel deletes nothing');
  fire(btnOf(L.en['models.tree.actions']), 'click');
  fire(all(body, x => x.attrs.role === 'menu')[0].childNodes.find(x => x.textContent === L.en['models.tree.a.deleteKeep']), 'click');
  const sel = all(body, x => x.tag === 'select' && x.attrs['aria-label'] === L.en['models.tree.ask.vols'])[0]; sel.value = 'parent';
  fire(all(body, x => x.tag === 'button' && x.className === 'primary' && x.textContent === L.en['models.tree.a.delete'])[0], 'click'); await settle();
  const last = ops[ops.length - 1];
  assert.deepStrictEqual(last, ['bone.delete', { bone: 'basis/body', children: false, volumes: 'parent' }]);
  assert.ok(!rowOf('body') && rowOf('turret') && T.ST.bone === 'basis', 'body gone, turret lifted, the parent picked');
  assert.ok(/1 bones.*1 moved/.test(msg()), 'delete says what happened to the volumes: ' + msg());
  ok('page: drag and drop moves a bone, the menu lists every action and turns off what cannot apply, duplicate, delete asks first with the volume choice');

  // joins: Mesh tab button and volume rows switch sub-tab through EXT_SCREENS.models.go; key area and key rows
  const went = []; EXT.models.go = (s, sel) => { went.push([s, sel]); return true; };
  assert.strictEqual(tree().attrs['data-keys'], 'tree', 'key area');
  assert.ok(['move', 'open', 'edit', 'delete', 'menu'].every(k => EXT.models.keys.some(r => r.key === 'models.tree.key.' + k && L.en[r.key])), 'key rows with texts');
  const meshBtn = all(body, x => x.tag === 'button' && x.textContent === L.en['models.tree.a.openMesh'])[0];
  assert.ok(meshBtn, 'Mesh tab button in the mesh section'); fire(meshBtn, 'click');
  assert.ok(went.length === 1 && went[0][0] === 'ply' && went[0][1].bone === T.ST.bone, 'go to the Mesh tab with the bone');
  const vrow2 = all(tree(), x => x.attrs.role === 'treeitem' && x.attrs.title === L.en['models.tree.volOpenTip'])[0];
  assert.ok(vrow2, 'a volume row'); { fire(vrow2, 'dblclick'); assert.ok(went[went.length - 1][0] === 'vol' && went[went.length - 1][1].volume, 'double click: the Volumes tab with the volume'); }
  delete EXT.models.go;
  ok('joins: Mesh tab button and volume rows go to the Mesh and Volumes tabs with the pick; key area and rows');

  const bytes = doc.bytes('resource/entity/tt/tt.mdl'), s = bytes.toString('latin1');
  assert.ok(!/[^\r]\n/.test(s), 'CRLF only'); assert.ok(!require('../../../../lib/model/mdl').parse(bytes).error, 'parses');
  const tl = doc.state('tree.list', {}); assert.deepStrictEqual(tl.bones.map(b => b.path).sort(), ['basis', 'basis/turret', 'basis/turret/axle', 'basis/turret/axle_0', 'basis/wheel'].sort());
  assert.strictEqual(tl.volumes[0].bone, 'basis', 'hull went to the parent');
  assert.ok(!fs.readFileSync(path.join(dir, 'tt.mdl')).equals(bytes) && fs.readFileSync(path.join(dir, 'tt.mdl'), 'latin1') === MDL, 'nothing written before save');
  assert.ok(doc.history().undo.length === ops.filter(o => o[0] !== 'bone.rename' || o[1].name !== 'bad"name').length, 'one undo step per op');
  core.close(doc.id);
  ok('document: CRLF, parses, the expected bones, nothing written to disk, one undo step per op');

  console.log('PASS models tree (' + n + ')');
})().catch(e => { console.error(e && e.stack || e); console.log('FAIL models tree'); process.exit(1); });

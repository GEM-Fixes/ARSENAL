// Models page part `vol` (sub-tab Volumes) test: (1) the same keys and slots in en ru uk zh, a text for every tx key, every
// dynamic key family; (2) the client string obeys the page rules and parses; (3) it builds on a stub DOM against a stand-in
// EXT_SCREENS.models.doc that runs the real ops of tools/lib/model/edit/vol.js on a synthetic model: the list, selection
// both ways with the 3D view, thickness edited here is what D.state (the Armor part's read) gives back, add, rename,
// a refusal shown as a sentence with nothing changed, two-step delete, obstacles; (4) the pure helpers. No game, no browser.
// usage: node vol.test.js      last line: PASS models vol (N)
// Author: Imperator_Aug (ARSENAL, ia-e3139c28)
'use strict';
const vm = require('vm'), assert = require('assert');
const E = require('../../../../lib/model/edit/vol'), M = require('../../../../lib/model/mdl'), V = require('../../../../lib/model/vol');
let n = 0; const ok = m => { n++; console.log('ok ' + n + ' ' + m); };
const tick = async (k = 6) => { for (let i = 0; i < k; i++) await new Promise(r => setImmediate(r)); };

const MDL = Buffer.from(['{Skeleton', '\t{bone "body"', '\t\t{bone "turret"', '\t\t\t{Position 20\t0\t5}', '\t\t}', '\t}', '}',
  '{Volume "hull"', '\t{Polyhedron "hull.vol"}', '\t{Bone "body"}', '\t{Thickness 45 {front 80}}', '}',
  '{Volume "turret1"', '\t{Box 10 6 4}', '\t{Bone "turret"}', '}',
  '{Volume "ball"', '\t{Sphere 2}', '\t{Bone "body"}', '}',
  '{Obstacle "body01"', '\t{Obb2', '\t\t{Center 1 2}', '\t\t{Extent 30 10}', '\t\t{Axis 1 0}', '\t}', '}', ''].join('\r\n'), 'latin1');
const DIR = 'resource/entity/vt/';

function standIn() {   // the document (contract shape) + the page side D, both over the real ops
  const files = new Map([[DIR + 'vt.mdl', { rel: DIR + 'vt.mdl', kind: 'mdl', bytes: MDL }], [DIR + 'hull.vol', { rel: DIR + 'hull.vol', kind: 'vol', bytes: V.write(V.fromBox([40, 20, 10])) }]]);
  const doc = { mdl: DIR + 'vt.mdl', files, read(rel) { const f = files.get(rel); return f.kind === 'mdl' ? M.parse(f.bytes) : V.parse(f.bytes); } };
  const ls = [], calls = [];
  const emit = ev => ls.forEach(f => f(ev));
  const D = { id: 'd1', rev: 0, sel: { bone: null, volume: null, anm: null, frame: 0 }, calls,
    open() { return Promise.resolve(); },
    op(name, args) {
      calls.push([name, args]);
      let r; try { r = E.ops[name].apply(doc, args); } catch (e) { return Promise.reject(e); }
      for (const [rel, b] of Object.entries(r.files)) { if (b === null) files.delete(rel); else files.set(rel, { rel, kind: /\.vol$/.test(rel) ? 'vol' : 'mdl', bytes: b }); }
      D.rev++; const out = { rev: D.rev, changed: Object.keys(r.files), info: r.info };
      emit({ type: 'change', rev: D.rev, changed: out.changed });
      return Promise.resolve(out);
    },
    state(what, q) { try { return Promise.resolve(JSON.parse(JSON.stringify(E.state[what](doc, q || {})))); } catch (e) { return Promise.reject(e); } },
    on(f) { ls.push(f); }, select(s) { Object.assign(D.sel, s); emit({ type: 'select', sel: D.sel }); } };
  return { doc, D };
}

(async () => {
  // ---------- (1) languages ----------
  const L = require('./vol.lang.json'), script = require('./vol.client');
  const en = Object.keys(L.en).sort();
  assert.ok(en.length > 50 && en.every(k => k.startsWith('models.vol.') || k === 'models.sub.vol'), 'keys start models.vol.');
  for (const c of ['ru', 'uk', 'zh']) {
    assert.deepStrictEqual(Object.keys(L[c]).sort(), en, 'same keys in ' + c);
    for (const k of en) { assert.ok(L[c][k], c + ' ' + k); assert.deepStrictEqual((L[c][k].match(/\{\w+\}/g) || []).sort(), (L.en[k].match(/\{\w+\}/g) || []).sort(), 'slots ' + c + ' ' + k); }
  }
  for (const m of script.matchAll(/\btx\('([a-zA-Z0-9_.]+)'/g)) assert.ok(L.en[m[1]], 'tx key ' + m[1]);
  for (const m of script.matchAll(/\b(?:btn|field)\('([a-zA-Z0-9_.]+)'/g)) assert.ok(L.en[m[1]], 'button/field key ' + m[1]);
  for (const m of script.matchAll(/,'(models\.vol\.[a-zA-Z]+)'\)/g)) assert.ok(L.en[m[1]], 'title key ' + m[1]);
  const fam = { side: ['front', 'top', 'left', 'right', 'rear', 'bottom'], kind: ['box', 'cylinder', 'sphere', 'polyhedron', 'none'], add: ['box', 'cylinder', 'sphere', 'polyhedron', 'meshBox', 'meshCylinder', 'meshSphere', 'meshHull'],
    axis: ['x', 'y', 'z'], xyz: ['0', '1', '2'], col: ['name', 'bone', 'kind', 'size', 'metres', 'thick'], mirror: ['x', 'y', 'z'], obCol: ['type', 'name', 'shape'], ob: ['obstacle', 'area'], okind: ['obb2', 'circle2', 'polygon2', 'none'] };
  for (const [f, list] of Object.entries(fam)) for (const k of list) assert.ok(L.en['models.vol.' + f + '.' + k], 'family ' + f + '.' + k);
  for (const v of Object.values(L.en)) assert.ok(!/ [-\u2013\u2014] |\[[VIT]\]|\.cpp|\.h:/.test(v), 'plain words: ' + v);
  ok('lang: ' + en.length + ' keys, same keys and slots in en ru uk zh, every tx key and key family has a text, plain words');

  // ---------- (2) page rules ----------
  assert.ok(!/[`]|\$\{|innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(/.test(script), 'page rules');
  assert.ok(!/(^|[^\w])[A-Za-z]:[\\/]|https?:\/\//.test(script), 'no fixed path or address');
  assert.ok(!/#[0-9a-fA-F]{3,6}\b/.test(script), 'colours only from the page tokens');
  assert.ok(!/\bapi\(/.test(script), 'no route of its own: everything through the document');
  new vm.Script(script, { filename: 'vol.client' });
  ok('client: page rules, no fixed colours, no own route, parses');

  // ---------- (3) build on a stub DOM ----------
  const node = tag => {
    const o = { tag, style: {}, childNodes: [], attrs: {}, listeners: {}, textContent: '', className: '', _v: '', checked: false,
      appendChild(c) { this.childNodes.push(c); return c; }, addEventListener(k, f) { (this.listeners[k] = this.listeners[k] || []).push(f); },
      setAttribute(k, v) { this.attrs[k] = v; }, fire(k) { (this.listeners[k] || []).forEach(f => f({ target: this })); } };
    Object.defineProperty(o, 'value', {
      get() { if (tag === 'select') { const op = this.childNodes.filter(c => c.tag === 'option'), s = op.find(c => c.selected) || op[0]; return s ? s.attrs.value : ''; } return tag === 'option' ? this.attrs.value : this._v; },
      set(v) { if (tag === 'select') this.childNodes.forEach(c => { c.selected = c.attrs.value === v; }); else this._v = v; } });
    return o;
  };
  const h = (tag, attrs, kids) => { const e = node(tag); for (const k of Object.keys(attrs || {})) { if (k === 'text') e.textContent = attrs[k]; else if (k.startsWith('on')) e.addEventListener(k.slice(2), attrs[k]); else e.setAttribute(k, attrs[k]); }
    for (const c of kids || []) if (c != null) e.appendChild(typeof c === 'string' ? { text: c, childNodes: [] } : c); return e; };
  const all = r => { const out = []; (function w(x) { if (!x) return; out.push(x); (x.childNodes || []).forEach(w); })(r); return out; };
  const texts = r => all(r).map(x => x.textContent).filter(Boolean);
  const byText = (r, t) => all(r).find(x => x.tag === 'button' && x.textContent === t);
  const byLabel = (r, t) => all(r).filter(x => x.attrs && x.attrs['aria-label'] === t);
  const tx = (k, p) => (L.en[k] || k).replace(/\{(\w+)\}/g, (m, x) => (p && p[x] != null ? String(p[x]) : m));
  const T = k => L.en['models.vol.' + k];

  const EXT = { models: { parts: {}, subs: {} } };
  new Function('EXT_SCREENS', 'h', 'tx', 'api', 'S', 'window', 'document', 'LS', script)(EXT, h, tx, () => { throw new Error('no route'); }, { mod: 'M' }, {}, { createElement: node }, { get: (k, d) => d, set() {} });
  const sub = EXT.models.subs.vol; assert.strictEqual(typeof sub, 'function', 'sub-tab hook set');
  const say = (el, cls, t) => { el.className = cls; el.textContent = t; };
  const mkCtx = (mod) => ({ body: node('div'), set: { target: 'vt' }, mod, el: h, clear: x => { x.childNodes = []; }, say, k2: (a, b) => tx(a + '.' + b), msg: node('div') });

  let c0 = mkCtx(''); sub(c0); assert.ok(texts(c0.body).includes(T('needMod')), 'no mod: one sentence');
  c0 = mkCtx('M'); sub(c0); assert.ok(texts(c0.body).includes(T('noEditor')), 'no document: one sentence');
  ok('client: without a mod folder or without the editor it says so in one sentence');

  const { doc, D } = standIn(); EXT.models.doc = D;
  const view = { hl: [], reloads: 0, opts: null };
  EXT.models.parts.viewer = (ctx, opts) => { view.opts = opts; const v = node('div'); v.highlight = id => view.hl.push(id); v.reload = () => { view.reloads++; }; return v; };
  const ctx = mkCtx('M'); sub(ctx); await tick();
  const body = ctx.body, msg = () => all(body).find(x => x.attrs && x.attrs.role === 'status');
  assert.ok(view.opts && typeof view.opts.onPick === 'function', 'the 3D view is placed with a pick handler');
  for (const nm of ['hull', 'turret1', 'ball']) assert.ok(byText(body, nm), 'row ' + nm);
  assert.ok(texts(body).includes('80 / 45 / 45 / 45 / 45 / 45'), 'thickness per side in the list');
  assert.ok(texts(body).includes('0.5 x 0.3 x 0.2'), 'box size in metres');
  assert.ok(texts(body).includes(T('pickOne')), 'no selection yet');
  ok('page: list of volumes with shape, size in units and metres, thickness per side');

  byText(body, 'turret1').fire('click'); await tick();
  assert.strictEqual(D.sel.volume, 'body/turret/turret1', 'list click selects through D.select');
  assert.strictEqual(view.hl[view.hl.length - 1], 'body/turret/turret1', 'the 3D view highlights it');
  assert.ok(texts(body).includes(tx('models.vol.selected', { v: 'body/turret/turret1' })), 'form for the volume');
  view.opts.onPick({ volume: 'body/ball', side: 0 }); await tick();
  assert.strictEqual(D.sel.volume, 'body/ball', 'a pick in the 3D view selects'); assert.ok(texts(body).includes(tx('models.vol.selected', { v: 'body/ball' })), 'form follows the pick');
  ok('page: selection both ways (list to 3D view, 3D pick to form)');

  // thickness: edited here, read back the way the Armor part reads (D.state on the same document)
  D.select({ volume: 'body/hull' }); await tick();
  byLabel(body, T('side.front'))[0].value = '95'; byLabel(body, T('side.rear'))[0].value = '25,5';
  const r0 = view.reloads;
  byText(body, T('applyThick')).fire('click'); await tick();
  const th = (await D.state('vol.list', {})).volumes.find(v => v.id === 'body/hull').thickness.list;
  assert.deepStrictEqual(th, [95, 45, 45, 45, 25.5, 45], 'front 95, rear 25.5 (comma accepted)');
  assert.ok(view.reloads > r0, 'the 3D view reloads after a change');
  assert.ok(texts(body).includes('95 / 45 / 45 / 45 / 25.5 / 45'), 'the list redraws from the document');
  assert.ok(/\{Thickness 45 \{front 95\} \{rear 25\.5\}\}/.test(doc.files.get(doc.mdl).bytes.toString('latin1')), 'written into the .mdl in place');
  ok('page: thickness per side in mm goes through D.op; D.state (what the Armor part reads) gives the new values; list and 3D view redraw');

  // add a box on the selected bone, then rename it
  byText(body, T('addBtn')).fire('click'); await tick();
  assert.deepStrictEqual(D.calls[D.calls.length - 1], ['vol.add', { bone: 'body', kind: 'box', size: [20, 20, 20] }]);
  assert.strictEqual(D.sel.volume, 'body/volume0', 'the new volume is selected');
  const nameIn = byLabel(body, T('name'))[0]; nameIn.value = 'plate';
  byText(body, T('rename')).fire('click'); await tick();
  assert.strictEqual(D.sel.volume, 'body/plate', 'renamed and still selected');
  assert.ok(M.findVolume(M.parse(doc.files.get(doc.mdl).bytes), 'body/plate'), 'in the document');
  ok('page: add a volume on a bone, rename it; selection follows the new id');

  // a refusal: zero size
  D.select({ volume: 'body/turret/turret1' }); await tick();
  const before = doc.files.get(doc.mdl).bytes;
  byLabel(body, T('length'))[0].value = '0';
  byText(body, T('applyShape')).fire('click'); await tick();
  assert.strictEqual(msg().className, 'err'); assert.strictEqual(msg().textContent, 'Length must be a number above zero.');
  assert.ok(doc.files.get(doc.mdl).bytes === before, 'nothing changed');
  byLabel(body, T('width'))[0].value = 'abc'; byLabel(body, T('length'))[0].value = '12';
  byText(body, T('applyShape')).fire('click'); await tick();
  assert.strictEqual(msg().textContent, T('badNum'), 'not a number: said before any op');
  ok('page: a refused op shows its plain sentence and changes nothing; bad numbers are caught on the page');

  // copy and paste a matrix, turn by degrees
  byText(body, T('copyM')).fire('click');
  D.select({ volume: 'body/ball' }); await tick();
  byText(body, T('pasteM')).fire('click'); await tick();
  assert.deepStrictEqual(M.findVolume(M.parse(doc.files.get(doc.mdl).bytes), 'ball').matrix, [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 'pasted');
  const turn = byLabel(body, 'Z').filter(x => x.tag === 'input');
  assert.ok(turn.length >= 2);
  ok('page: copy matrix and paste matrix');

  // two-step delete
  const del = byText(body, T('delete')); del.fire('click'); await tick();
  assert.strictEqual(del.textContent, T('deleteSure')); assert.ok(M.findVolume(M.parse(doc.files.get(doc.mdl).bytes), 'ball'), 'first click only asks');
  del.fire('click'); await tick();
  assert.ok(!M.findVolume(M.parse(doc.files.get(doc.mdl).bytes), 'ball'), 'second click deletes'); assert.strictEqual(D.sel.volume, null, 'selection cleared');
  ok('page: delete asks once, then deletes and clears the selection');

  // polyhedron: its .vol file section
  D.select({ volume: 'body/hull' }); await tick();
  assert.ok(texts(body).some(t => t.startsWith(tx('models.vol.volInfo', { t: 12, p: 8 }))), '.vol info');
  byText(body, T('mirror.y')).fire('click'); await tick();
  assert.deepStrictEqual(D.calls[D.calls.length - 1], ['vol.volTransform', { volume: 'body/hull', mirror: 'y' }]);
  ok('page: a polyhedron shows its .vol file and mirrors it');

  // obstacles
  byText(body, 'body01').fire('click'); await tick();
  const ext = byLabel(body, 'x').filter(x => x.tag === 'input'); ext[1].value = '33';
  const applies = all(body).filter(x => x.tag === 'button' && x.textContent === T('applyOb'));
  applies[applies.length - 1].fire('click'); await tick();
  assert.deepStrictEqual(D.calls[D.calls.length - 1][0], 'obst.set');
  assert.deepStrictEqual((await D.state('obst.list')).obstacles[0].extent, [33, 10], 'obstacle half size changed');
  byText(body, T('addArea')).fire('click'); await tick();
  assert.deepStrictEqual((await D.state('obst.list')).areas.map(a => a.name), ['area1']);
  ok('page: obstacle edit and a new area');

  // ---------- (4) pure helpers ----------
  const X = sub._t;
  assert.strictEqual(X.num('1,5'), 1.5); assert.ok(isNaN(X.num('1x'))); assert.deepStrictEqual(X.nums(['1', '2']), [1, 2]); assert.strictEqual(X.nums(['1', 'a']), null);
  assert.strictEqual(X.metres(30), 1.5); assert.strictEqual(X.thickText({ set: true, list: [5, 5, 5, 5, 5, 5] }), '5'); assert.strictEqual(X.thickText({ set: false, list: [0, 0, 0, 0, 0, 0] }), '');
  assert.deepStrictEqual(X.parsePoints('0 0\n1 0\n\n0 1'), [[0, 0], [1, 0], [0, 1]]); assert.strictEqual(X.parsePoints('0 0 0'), null);
  assert.strictEqual(X.pointsText([[1, 2], [3, 4]]), '1 2\n3 4');
  assert.deepStrictEqual(X.addArgs('meshHull', 'body', 'z'), ['vol.addFromMesh', { bone: 'body', how: 'hull', axis: 'z' }]);
  ok('helpers: numbers with comma, metres, thickness text, polygon points, add arguments');

  console.log('PASS models vol (' + n + ')');
})().catch(e => { console.log('FAIL ' + (e.stack || e.message)); process.exitCode = 1; });

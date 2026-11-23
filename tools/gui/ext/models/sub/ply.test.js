// Models page part `ply` (sub-tab Meshes and materials) test: (1) the same keys and slots in en ru uk zh, a text for every tx
// key and key family, plain words; (2) the client string obeys the page rules and parses, its only route is the read route;
// (3) it builds on a stub DOM against a stand-in EXT_SCREENS.models.doc that runs the real ops of tools/lib/model/edit/ply.js on
// a synthetic model: the list, selection, mirror, move, a bad number caught on the page, a refusal shown as a sentence with
// nothing changed, rename, flags, the material editor, textures found and missing, OBJ import through the route, OBJ export
// as two downloads; (4) the route on files in the scratch dir, refusals, nothing written; (5) the pure helpers; (6) when
// tools/lib/model/edit/core.js is there, the same ops through the real core on a scratch mod folder (no game).
// usage: node ply.test.js [scratch dir]      last line: PASS models ply (N)
// Author: Imperator_Aug (ARSENAL, ia-213b82f2)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const E = require('../../../../lib/model/edit/ply'), P = require('../../../../lib/model/ply'), M = require('../../../../lib/model/mdl');
const scratch = path.resolve(process.argv[2] || path.join(require('os').tmpdir(), 'models-ply-test'));
const root = path.join(scratch, 'ply-test');
fs.rmSync(root, { recursive: true, force: true }); fs.mkdirSync(root, { recursive: true });
let n = 0; const ok = m => { n++; console.log('ok ' + n + ' ' + m); };
const tick = async (k = 8) => { for (let i = 0; i < k; i++) await new Promise(r => setImmediate(r)); };

// ---------- synthetic files ----------
const DIR = 'resource/entity/t/', MDL = DIR + 't.mdl';
function cube(h, mats) {   // per-face vertices, engine winding, two parts
  const faces = [[[1, 0, 0], [0, 1, 0], [0, 0, 1]], [[-1, 0, 0], [0, -1, 0], [0, 0, 1]], [[0, 1, 0], [-1, 0, 0], [0, 0, 1]],
    [[0, -1, 0], [1, 0, 0], [0, 0, 1]], [[0, 0, 1], [0, 1, 0], [-1, 0, 0]], [[0, 0, -1], [0, 1, 0], [1, 0, 0]]];
  const pos = [], nrm = [], uv = [], idx = [];
  for (const [nn, u, v] of faces) {
    const base = pos.length / 3;
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { for (let c = 0; c < 3; c++) pos.push((nn[c] + a * u[c] + b * v[c]) * h); nrm.push(...nn); uv.push((a + 1) / 2, (1 - b) / 2); }
    idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }
  return E._t.buildPly({ positions: Float32Array.from(pos), normals: Float32Array.from(nrm), uvs: Float32Array.from(uv), indices: Uint32Array.from(idx),
    groups: [{ material: mats[0], firstFace: 0, faceCount: 8 }, { material: mats[1], firstFace: 8, faceCount: 4 }] }, { tangents: true });
}
const MDL_TEXT = ['{Skeleton', '\t{bone "body"', '\t\t{VolumeView "body.ply"}', '\t\t{bone "turret"', '\t\t\t{Position 0\t0\t20}', '\t\t\t{VolumeView "turret.ply"}',
  '\t\t}', '\t}', '}', ''].join('\r\n');
const MTL_TEXT = ['{material bump', '\t{diffuse "body"}', '\t{bump "body_nm"}', '\t{blend none}', '}', ''].join('\r\n');
const OBJ_TEXT = ['mtllib box.mtl', 'o Box', 'v -0.5 -0.5 0.5', 'v 0.5 -0.5 0.5', 'v -0.5 0.5 0.5', 'v 0.5 0.5 0.5', 'v -0.5 0.5 -0.5', 'v 0.5 0.5 -0.5', 'v -0.5 -0.5 -0.5', 'v 0.5 -0.5 -0.5',
  'vt 0 0', 'vt 1 0', 'vt 0 1', 'vt 1 1', 'usemtl paint',
  'f 1/1 2/2 4/4 3/3', 'f 3/1 4/2 6/4 5/3', 'f 5/1 6/2 8/4 7/3', 'f 7/1 8/2 2/4 1/3', 'f 2/1 8/2 6/4 4/3', 'f 7/1 1/2 3/4 5/3', ''].join('\n');
const MTLLIB = 'newmtl paint\nKd 1 1 1\nmap_Kd paint.png\n';
const files0 = () => ({ [MDL]: Buffer.from(MDL_TEXT, 'latin1'), [DIR + 'body.ply']: cube(10, ['body.mtl', 'track.mtl']), [DIR + 'turret.ply']: cube(4, ['body.mtl', 'body.mtl']),
  [DIR + 'body.mtl']: Buffer.from(MTL_TEXT, 'latin1'), [DIR + 'body.dds']: Buffer.from('DDS stand-in') });
const kindOf = rel => (/\.mdl$/i.test(rel) ? 'mdl' : /\.ply$/i.test(rel) ? 'ply' : /\.mtl$/i.test(rel) ? 'mtl' : 'other');

function standIn() {   // the document (contract shape) + the page side D, both over the real ops
  const files = new Map(Object.entries(files0()).map(([rel, b]) => [rel, { rel, kind: kindOf(rel), bytes: b, bytes0: b, from: 'mod', dirty: false }]));
  const cache = new Map();
  const doc = { mdl: MDL, files, rev: 0, read(rel) { const f = files.get(rel); if (!f) return null; const c = cache.get(rel); if (c && c.b === f.bytes) return c.o;
    const o = f.kind === 'mdl' ? M.parse(f.bytes) : f.kind === 'ply' ? P.parse(f.bytes) : f.bytes; cache.set(rel, { b: f.bytes, o }); return o; } };
  const ls = [], calls = [];
  const emit = ev => ls.slice().forEach(f => f(ev));
  const D = { id: 'd1', rev: 0, sel: { bone: null, volume: null, anm: null, frame: 0 }, calls,
    open() { return Promise.resolve(); },
    op(name, args) {
      calls.push([name, args]);
      let r; try { r = E.ops[name].apply(doc, args); } catch (e) { return Promise.reject(e); }
      for (const [rel, b] of Object.entries(r.files)) {
        if (b === null) { files.delete(rel); continue; }
        if (kindOf(rel) === 'ply') assert.strictEqual(P.parse(b).error, null, name + ' ' + rel + ' parses');
        if (kindOf(rel) === 'mdl') assert.strictEqual(M.parse(b).error, null, name + ' mdl parses');
        const f = files.get(rel); if (f) Object.assign(f, { bytes: b, dirty: true }); else files.set(rel, { rel, kind: kindOf(rel), bytes: b, bytes0: null, from: 'new', dirty: true });
      }
      D.rev++; doc.rev++; const out = { rev: D.rev, changed: Object.keys(r.files), info: r.info };
      emit({ type: 'change', rev: D.rev, changed: out.changed, info: r.info });
      return Promise.resolve(out);
    },
    state(what, q) { calls.push(['state:' + what, q]); try { return Promise.resolve(JSON.parse(JSON.stringify(E.state[what](doc, q || {})))); } catch (e) { return Promise.reject(e); } },
    on(f) { ls.push(f); return () => { const i = ls.indexOf(f); if (i >= 0) ls.splice(i, 1); }; }, select(s) { Object.assign(D.sel, s); emit({ type: 'select', sel: D.sel }); }, _ls: ls };
  return { doc, D };
}

(async () => {
  // ---------- (1) languages ----------
  const L = require('./ply.lang.json'), script = require('./ply.client');
  const en = Object.keys(L.en).sort();
  assert.ok(en.length > 100 && en.every(k => k.startsWith('models.ply.') || k === 'models.sub.ply'), 'keys start models.ply.');
  for (const c of ['ru', 'uk', 'zh']) {
    assert.deepStrictEqual(Object.keys(L[c]).sort(), en, 'same keys in ' + c);
    for (const k of en) { assert.ok(L[c][k], c + ' ' + k); assert.deepStrictEqual((L[c][k].match(/\{\w+\}/g) || []).sort(), (L.en[k].match(/\{\w+\}/g) || []).sort(), 'slots ' + c + ' ' + k); }
  }
  const fam = { col: ['file', 'bone', 'view', 'verts', 'tris', 'parts', 'skin', 'state'], pcol: ['part', 'tag', 'flags', 'tris', 'material'], mcol: ['file', 'type', 'used', 'tex'],
    kindOf: ['VolumeView', 'View'], xyz: ['0', '1', '2'], smoothBy: ['index', 'position'], byWhat: ['parts', 'material', 'islands'], flagSet: ['keep', 'on', 'off'],
    unitsOf: ['metres', 'units'], axisOf: ['y-up', 'z-up'], mirror: ['x', 'y', 'z'] };
  const famKeys = new Set(Object.keys(fam).map(f => 'models.ply.' + f));
  for (const m of script.matchAll(/'(models\.ply\.[A-Za-z0-9_.]+)'/g)) assert.ok(L.en[m[1]] || famKeys.has(m[1]), 'key ' + m[1]);
  for (const [f, list] of Object.entries(fam)) for (const k of list) assert.ok(L.en['models.ply.' + f + '.' + k], 'family ' + f + '.' + k);
  for (const c of ['en', 'ru', 'uk', 'zh']) for (const v of Object.values(L[c])) assert.ok(!/ [-\u2013\u2014] |\[[VIT]\]|\.cpp|\.h:/.test(v), 'plain words: ' + v);
  assert.ok(/no bone weights/.test(L.en['models.ply.skinNote']) && /\.ply/.test(L.en['models.ply.skinNote']), 'the skinned limit in plain words');
  ok('lang: ' + en.length + ' keys, same keys and slots in en ru uk zh, every key and key family has a text, plain words, the skin limit said');

  // ---------- (2) page rules ----------
  assert.ok(!/[`]|\$\{|innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(/.test(script), 'page rules');
  assert.ok(!/(^|[^\w])[A-Za-z]:[\\/]|https?:\/\//.test(script), 'no fixed path or address');
  assert.ok(!/#[0-9a-fA-F]{3,6}\b/.test(script), 'colours only from the page tokens');
  assert.deepStrictEqual([...script.matchAll(/\bapi\('([^']+)'/g)].map(m => m[1]), ['/api/ls?files=1&dir=', '/api/x/models/ply/import-read'], 'its only route reads the file to bring in (and the disk path boxes list a folder through the page route /api/ls)');
  new vm.Script(script, { filename: 'ply.client' });
  ok('client: page rules, no fixed colours, one read route, parses');

  // ---------- (3) build on a stub DOM ----------
  const node = tag => {
    const o = { tag, style: {}, childNodes: [], attrs: {}, listeners: {}, textContent: '', className: '', _v: '', checked: false, disabled: false,
      appendChild(c) { this.childNodes.push(c); return c; }, removeChild(c) { this.childNodes.splice(this.childNodes.indexOf(c), 1); return c; },
      addEventListener(k, f) { (this.listeners[k] = this.listeners[k] || []).push(f); },
      setAttribute(k, v) { this.attrs[k] = v; }, fire(k) { (this.listeners[k] || []).forEach(f => f({ target: this })); } };
    Object.defineProperty(o, 'value', {
      get() { if (tag === 'select') { const op = this.childNodes.filter(c => c.tag === 'option'), s = op.find(c => c.selected) || op[0]; return s ? s.attrs.value : ''; } return tag === 'option' ? this.attrs.value : this._v; },
      set(v) { if (tag === 'select') this.childNodes.forEach(c => { c.selected = c.attrs.value === v; }); else this._v = v; } });
    return o;
  };
  const h = (tag, attrs, kids) => { const e = node(tag); for (const k of Object.keys(attrs || {})) { if (k === 'text') e.textContent = attrs[k]; else if (k.startsWith('on')) e.addEventListener(k.slice(2), attrs[k]); else if (k === 'rows') e.rows = attrs[k]; else e.setAttribute(k, attrs[k]); }
    for (const c of kids || []) if (c != null) e.appendChild(typeof c === 'string' ? { text: c, childNodes: [] } : c); return e; };
  const all = r => { const out = []; (function w(x) { if (!x) return; out.push(x); (x.childNodes || []).forEach(w); })(r); return out; };
  const texts = r => all(r).map(x => x.textContent).filter(Boolean);
  const byText = (r, t) => all(r).find(x => x.tag === 'button' && x.textContent === t);
  const byLabel = (r, t) => all(r).filter(x => x.attrs && x.attrs['aria-label'] === t);
  const tx = (k, p) => (L.en[k] || k).replace(/\{(\w+)\}/g, (m, x) => (p && p[x] != null ? String(p[x]) : m));
  const T = k => L.en['models.ply.' + k];

  const srv = require('./ply.server'), route = srv.routes['POST /api/x/models/ply/import-read'];
  const apiCalls = [], api = (u, b) => { apiCalls.push([u, b]); return route(u, b, {}).then(j => (j.ok === false ? Promise.reject(new Error(j.error)) : j)); };
  const anchors = [], docStub = { createElement: node, body: { appendChild(a) { anchors.push(a); }, removeChild() {} } };
  const EXT = { models: { parts: {}, subs: {} } };
  new Function('EXT_SCREENS', 'h', 'tx', 'api', 'S', 'window', 'document', 'LS', script)(EXT, h, tx, api, { mod: 'M' }, {}, docStub, { get: (k, d) => d, set() {} });
  const sub = EXT.models.subs.ply; assert.strictEqual(typeof sub, 'function', 'sub-tab hook set');
  const say = (el, cls, t) => { el.className = cls; el.textContent = t; };
  const mkCtx = mod => ({ body: node('div'), set: { target: 't' }, mod, el: h, clear: x => { x.childNodes = []; }, say, k2: (a, b) => tx(a + '.' + b) });

  let c0 = mkCtx(''); sub(c0); assert.ok(texts(c0.body).includes(T('needMod')), 'no mod: one sentence');
  c0 = mkCtx('M'); sub(c0); assert.ok(texts(c0.body).includes(T('noEditor')), 'no document: one sentence');
  ok('client: without a mod folder or without the editor it says so in one sentence');

  const { doc, D } = standIn(); EXT.models.doc = D;
  const ctx = mkCtx('M'); sub(ctx); await tick();
  const body = ctx.body, msg = () => all(body).find(x => x.attrs && x.attrs.role === 'status');
  assert.ok(byText(body, 'body.ply') && byText(body, 'turret.ply'), 'mesh rows');
  assert.ok(texts(body).includes(T('skinNote')), 'the skinned limit on the page');
  assert.ok(texts(body).includes(T('pickOne')), 'nothing picked yet');
  assert.ok(byText(body, 'body.mtl'), 'material row');
  assert.ok(texts(body).includes(tx('models.ply.texCount', { f: 1, m: 1 })), 'body.dds found, body_nm missing');
  assert.ok(texts(body).some(t => t.startsWith('Missing material files: ') && /track\.mtl/.test(t)), 'missing material named');
  ok('page: list of meshes and materials, textures found and missing, missing material files, the skin limit');

  byText(body, 'body.ply').fire('click'); await tick();
  const rel = DIR + 'body.ply';
  assert.ok(texts(body).includes(tx('models.ply.selected', { m: rel })), 'form for the mesh');
  assert.ok(texts(body).includes(tx('models.ply.facts', { v: 24, t: 12, p: 2, u: 1 })), 'facts');
  const before = doc.files.get(rel).bytes;
  byText(body, T('mirror.y')).fire('click'); await tick();
  assert.deepStrictEqual(D.calls.filter(c => !/^state:/.test(c[0])).pop(), ['ply.mirror', { rel, axis: 'y' }]);
  assert.ok(doc.files.get(rel).bytes !== before, 'mirrored');
  assert.strictEqual(msg().textContent, T('done'));
  ok('page: pick a mesh, its facts, mirror through D.op, the page redraws');

  const xs = byLabel(body, 'X').filter(x => x.tag === 'input'); xs[0].value = '5';
  byText(body, T('applyMove')).fire('click'); await tick();
  assert.deepStrictEqual(D.calls.filter(c => !/^state:/.test(c[0])).pop(), ['ply.transform', { rel, move: [5, 0, 0] }]);
  assert.strictEqual(Math.round(P.parse(doc.files.get(rel).bytes).bounds[0]), -5, 'moved by 5');
  byLabel(body, T('factor'))[0].value = 'abc'; byText(body, T('scale')).fire('click'); await tick();
  assert.strictEqual(msg().className, 'err'); assert.strictEqual(msg().textContent, T('badNum'), 'bad number caught on the page');
  ok('page: move by numbers; a bad number is caught before any op');

  const b2 = doc.files.get(MDL).bytes;
  byLabel(body, T('newName'))[0].value = 'bad"name'; byText(body, T('rename')).fire('click'); await tick();
  assert.strictEqual(msg().className, 'err'); assert.strictEqual(msg().textContent, 'File names cannot hold quotes or braces.');
  assert.ok(doc.files.get(MDL).bytes === b2 && doc.files.has(rel), 'nothing changed');
  byLabel(body, T('newName'))[0].value = 'hull.ply'; byText(body, T('rename')).fire('click'); await tick();
  const rel2 = DIR + 'hull.ply';
  assert.ok(doc.files.has(rel2) && !doc.files.has(rel), 'renamed in the document');
  assert.ok(/\{VolumeView "hull\.ply"\}/.test(doc.files.get(MDL).bytes.toString('latin1')), 'the .mdl names the new file');
  assert.ok(texts(body).includes(tx('models.ply.selected', { m: rel2 })), 'the form follows the new name');
  ok('page: a refused op shows its plain sentence and changes nothing; rename follows into the .mdl and the form');

  const sel = byLabel(body, 'normals').find(x => x.tag === 'select'); assert.ok(sel, 'a picker per flag'); sel.value = 'off';
  byLabel(body, T('parts'))[0].value = '1';
  byText(body, T('applyFlags')).fire('click'); await tick();
  assert.deepStrictEqual(D.calls.filter(c => !/^state:/.test(c[0])).pop(), ['ply.tweak', { rel: rel2, parts: [1], force: false, clear: ['normals'] }]);
  assert.strictEqual(P.parse(doc.files.get(rel2).bytes).parts[1].flags & 4, 0, 'part 1 lost its normals flag');
  ok('page: flags per part through ply.tweak');

  // the material editor
  byText(body, 'body.mtl').fire('click'); await tick();
  assert.ok(texts(body).includes(tx('models.ply.matSel', { m: DIR + 'body.mtl' })), 'material form');
  const dif = byLabel(body, 'diffuse').find(x => x.tag === 'input'); assert.strictEqual(dif.value, 'body');
  dif.value = 'body2'; byLabel(body, 'glow').find(x => x.tag === 'input').checked = true;
  byText(body, T('applyMat')).fire('click'); await tick();
  assert.deepStrictEqual(D.calls.filter(c => !/^state:/.test(c[0])).pop(), ['mat.edit', { set: { diffuse: 'body2' }, flags: { glow: true }, rel: DIR + 'body.mtl' }]);
  const mt = doc.files.get(DIR + 'body.mtl').bytes.toString('latin1');
  assert.ok(/\{diffuse "body2"\}/.test(mt) && /\{glow\}/.test(mt) && !/[^\r]\n/.test(mt), 'written CRLF ' + JSON.stringify(mt));
  ok('page: material editor changes the texture and a switch through mat.edit');

  // bring in an OBJ through the route, then export
  const objDir = path.join(root, 'outside'); fs.mkdirSync(objDir, { recursive: true });
  fs.writeFileSync(path.join(objDir, 'box.obj'), OBJ_TEXT); fs.writeFileSync(path.join(objDir, 'box.mtl'), MTLLIB);
  const imp = all(body).filter(x => x.attrs && x.attrs['aria-label'] === T('path')).pop(); imp.value = path.join(objDir, 'box.obj');
  const bones = all(body).filter(x => x.tag === 'select' && x.attrs['aria-label'] === T('bone')).pop(); bones.value = 'body/turret';
  byText(body, T('importBtn')).fire('click'); await tick(20);
  assert.deepStrictEqual(apiCalls.pop(), ['/api/x/models/ply/import-read', { path: path.join(objDir, 'box.obj') }]);
  const call = D.calls.filter(c => !/^state:/.test(c[0])).pop();
  assert.strictEqual(call[0], 'ply.import'); assert.strictEqual(call[1].bone, 'body/turret'); assert.strictEqual(call[1].mtl[0].name, 'box.mtl');
  const boxRel = DIR + 'box.ply', box = P.parse(doc.files.get(boxRel).bytes);
  assert.ok(box.error === null && box.parts.length === 1 && Math.round(box.bounds[3]) === 10, 'a 1 m box is 20 units across');
  assert.ok(/\{VolumeView "box\.ply"\}/.test(doc.files.get(MDL).bytes.toString('latin1')), 'on the turret bone');
  assert.ok(doc.files.has(DIR + 'paint.mtl'), 'material stub made');
  assert.ok(texts(body).includes(tx('models.ply.selected', { m: boxRel })), 'the new mesh is picked');
  assert.ok(/were made/.test(msg().textContent), 'normals made said: ' + msg().textContent);
  imp.value = 'box.obj'; byText(body, T('importBtn')).fire('click'); await tick(20);
  assert.strictEqual(msg().className, 'err'); assert.ok(/full path/.test(msg().textContent), 'relative path refused');
  ok('page: OBJ brought in through the read route, 1 m = 20 units, placed on the bone, a material stub, the new mesh picked');

  byText(body, T('exportBtn')).fire('click'); await tick();
  const dl = anchors.map(a => a.attrs.download);
  assert.deepStrictEqual(dl.slice(-2), ['box.obj', 'box.mtl'], 'two downloads');
  assert.ok(texts(body).includes(tx('models.ply.exported', { m: 'box', v: 20, t: 12 })), 'export said: ' + msg().textContent);
  ok('page: export gives the .obj and .mtl as downloads');

  // ---------- (4) the route ----------
  const plyPath = path.join(objDir, 'm.ply'); fs.writeFileSync(plyPath, cube(1, ['a.mtl', 'a.mtl']));
  let j = await route('', { path: plyPath }, {}); assert.ok(j.ok && j.kind === 'ply' && Buffer.from(j.data, 'base64').equals(fs.readFileSync(plyPath)), '.ply as base64');
  j = await route('', { path: '"' + path.join(objDir, 'box.obj') + '"' }, {}); assert.ok(j.ok && j.kind === 'obj' && j.name === 'box' && j.mtl.length === 1 && !j.mtlMissing.length, 'quoted path, mtllib read');
  fs.writeFileSync(path.join(objDir, 'lone.obj'), 'mtllib none.mtl\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n');
  j = await route('', { path: path.join(objDir, 'lone.obj') }, {}); assert.deepStrictEqual(j.mtlMissing, ['none.mtl'], 'a missing library is named');
  const refused = async (b, re) => { const x = await route('', b, {}); assert.ok(x.ok === false && re.test(x.error) && !/\n\s+at /.test(x.error), JSON.stringify(x)); };
  await refused({}, /full path/); await refused({ path: 'box.obj' }, /drive letter/); await refused({ path: path.join(objDir, 'box.mtl') }, /Only \.obj and \.ply/);
  await refused({ path: path.join(objDir, 'none.obj') }, /There is no file/); fs.mkdirSync(path.join(objDir, 'd.obj'), { recursive: true }); await refused({ path: path.join(objDir, 'd.obj') }, /not a file/);
  await refused({ path: '-x.obj' }, /cannot be used/);
  assert.deepStrictEqual(fs.readdirSync(objDir).sort(), ['box.mtl', 'box.obj', 'd.obj', 'lone.obj', 'm.ply'], 'reads only');
  ok('route: .obj with its libraries, .ply as base64, quoted paths; empty, relative, wrong kind, missing, folder and "-" refused as sentences; nothing written');

  // ---------- (5) helpers ----------
  const X = sub._t;
  assert.strictEqual(X.partsArg(''), 'all'); assert.strictEqual(X.partsArg('All'), 'all'); assert.deepStrictEqual(X.partsArg('0, 2'), [0, 2]); assert.strictEqual(X.partsArg('1.5'), null);
  assert.strictEqual(X.vec(['', '', '']), null); assert.deepStrictEqual(X.vec(['1', '', '2,5']), [1, 0, 2.5]); assert.strictEqual(X.vec(['a', '', '']), false);
  assert.deepStrictEqual(X.flagArgs({ a: 'on', b: 'off', c: 'keep' }), { set: ['a'], clear: ['b'] });
  const cur = { type: 'bump', keys: [{ key: 'diffuse', args: ['a'] }, { key: 'blend', args: ['none'] }], flags: ['tile'] };
  assert.strictEqual(X.matChanges(cur, { type: 'bump', keys: { diffuse: 'a', blend: 'none', bump: '' }, flags: { tile: true, glow: false } }), null);
  assert.deepStrictEqual(X.matChanges(cur, { type: 'simple', keys: { diffuse: '', blend: 'add' }, flags: { tile: false } }), { type: 'simple', set: { diffuse: null, blend: 'add' }, flags: { tile: false } });
  assert.deepStrictEqual(X.importArgs({ kind: 'ply', name: 'm', data: 'QQ==' }, { bone: 'b' }), ['ply.attach', { bone: 'b', name: 'm', data: 'QQ==', overwrite: false }]);
  assert.strictEqual(X.importArgs({ kind: 'obj', name: 'm', text: 'x' }, { name: ' n ' })[1].name, 'n');
  ok('helpers: parts, three numbers, flag picks, material changes, import arguments');

  // ---------- (6) the real core ----------
  const corePath = path.join(__dirname, '../../../../lib/model/edit/core.js');
  if (!fs.existsSync(corePath)) console.log('skip real core: tools/lib/model/edit/core.js is not there');
  else {
    const core = require(corePath);
    const mod = path.join(root, 'mymod');
    for (const [rel0, b] of Object.entries(files0())) { const f = path.join(mod, ...rel0.split('/')); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, b); }
    const cd = core.open({ mod, mdl: MDL, game: null });
    try {
      assert.ok(core.ops().includes('ply.import') && core.states().includes('mat.list'), 'ply ops and states registered: ' + JSON.stringify(core.problems()));
      const st = cd.state('mat.list', {});
      assert.ok(st.found.some(t => /body\.dds$/i.test(t.rel)), 'texture outside the document found through the core: ' + JSON.stringify(st.missing));
      let r = cd.apply('ply.mirror', { rel: DIR + 'body.ply', axis: 'x' }); assert.deepStrictEqual(r.changed, [DIR + 'body.ply']);
      r = cd.apply('ply.import', { obj: OBJ_TEXT, mtl: [{ name: 'box.mtl', text: MTLLIB }], name: 'box', bone: 'turret' });
      assert.ok(r.changed.includes(DIR + 'box.ply') && r.changed.includes(DIR + 'paint.mtl'), 'new files join the document');
      r = cd.apply('ply.detach', { bone: 'body', drop: true }); assert.ok(r.changed.includes(DIR + 'body.ply') && !cd.has(DIR + 'body.ply'), 'a null file leaves the document');
      const dry = cd.save({ dry: true });
      assert.ok(dry.writes.some(w => w.rel === DIR + 'box.ply') && dry.removes.some(w => w.rel === DIR + 'body.ply') && !dry.written, 'dry save lists writes and the moved file');
      cd.undo(); cd.undo(); cd.undo();
      assert.ok(cd.has(DIR + 'body.ply') && !cd.has(DIR + 'box.ply') && cd.bytes(DIR + 'body.ply').equals(files0()[DIR + 'body.ply']), 'undo brings every byte back');
      assert.deepStrictEqual(fs.readdirSync(path.join(mod, 'resource', 'entity', 't')).sort(), ['body.dds', 'body.mtl', 'body.ply', 't.mdl', 'turret.ply'], 'nothing written without save');
    } finally { core.close(cd.id); }
    ok('real core: ops registered, texture found outside the document, mirror, import adds new files, detach drops a file, dry save, undo, nothing written');
  }

  console.log('PASS models ply (' + n + ')');
})().catch(e => { console.log('FAIL ' + (e.stack || e.message)); process.exitCode = 1; });

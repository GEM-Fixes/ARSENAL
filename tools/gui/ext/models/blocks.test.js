// models blocks test: the whole page built in the fake DOM (tools/gui/test/fakedom.js) with the models
// routes answered by this page's own server code (a new model from the vehicle template in a temp mod, no game, no SOEdit), then
// a model picked and every sub-tab drawn; after each draw the screen goes through the block rules of tools/gui/test/test-blocks.js
// (checkScreen, copied: every control and text in a leaf block, ids unique and well formed, blocks directly in containers, leaves
// hold no blocks, no control is a block itself). test-blocks.js sees only the first build; this one sees the loaded state.
// usage: node blocks.test.js <scratch dir>     last line: PASS models blocks (N)
// Author: Imperator_Aug (ARSENAL, ia-8209ae00)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const fakedom = require('../../test/fakedom'), contract = require('../../contract'), html = require('../../page.js');
const ext = require('./index');
const scratch = path.resolve(process.argv[2] || path.join(require('os').tmpdir(), 'models-blocks'));
require('../../../lib/testscratch').guard(scratch);   // never wipe a shared root, the repo, a game or a mod
fs.rmSync(scratch, { recursive: true, force: true }); fs.mkdirSync(scratch, { recursive: true });
const game = path.join(scratch, 'game'), mod = path.join(scratch, 'mymod');
for (const d of [path.join(game, 'resource'), path.join(game, 'mods'), mod]) fs.mkdirSync(d, { recursive: true });
let n = 0; const ok = m => { n++; console.log('ok ' + n + ' ' + m); };
const tick = () => new Promise(r => setImmediate(r));
// built: by time, not by count; backstop 60 s with a WAIT line, then the check after it reports
const built = P => require('../../../lib/test/wait').until(() => P.ctx.__as2gui, { who: 'models blocks test', what: 'the page built', step: 1 });
// settled: 60 ticks, then on while a real route call has no answer yet (a busy PC), backstop 60 s with a WAIT line
let inflight = 0;
const settled = async () => { for (let i = 0; i < 60; i++) await tick(); if (inflight) { await require('../../../lib/test/wait').until(() => !inflight, { who: 'models blocks test', what: 'a route call answered', step: 1 }); for (let i = 0; i < 60; i++) await tick(); } };
const clone = o => JSON.parse(JSON.stringify(o));

// ---------- the block rules (copy of checkScreen in tools/gui/test/test-blocks.js) ----------
const isB = e => !!(e && e.dataset && e.dataset.blk != null);
const isBox = e => isB(e) && e.classList.contains('blc');
const CTRL = new Set(['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'CANVAS', 'TABLE', 'SVG']);
const NOBLOCK = new Set(['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'CANVAS', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LABEL', 'PRE', 'UL', 'OL', 'LI', 'A', 'SUMMARY', 'OPTION', 'SVG']);
const ups = e => { const a = []; for (let p = e.parentNode; p; p = p.parentNode) a.push(p); return a; };
function desc(e) {
  if (e.tagName === '#TEXT') return 'text "' + e.textContent.trim().slice(0, 50) + '"';
  const a = e.attrs || {}, d = Object.keys(a).find(k => k.startsWith('data-') && k !== 'data-blk');
  return e.tagName.toLowerCase() + (a.id ? '#' + a.id : '') + (d ? '[' + d + '=' + a[d] + ']' : '') + (e.className ? '.' + e.className.split(/\s+/).join('.') : '') +
    (a['aria-label'] ? ' "' + a['aria-label'].slice(0, 40) + '"' : e.textContent.trim() ? ' "' + e.textContent.trim().slice(0, 40) + '"' : '');
}
function checkScreen(sec) {
  const sid = sec.dataset.id, probs = [], all = sec.all().filter(e => !ups(e).concat([e]).some(x => x.classList && x.classList.contains('blkbar')));
  const blocks = all.filter(isB), seen = {};
  if (!blocks.length) return ['screen ' + sid + ': no blocks at all'];
  for (const b of blocks) {
    const k = b.dataset.blk;
    if (!/^[a-z0-9][a-z0-9.-]{0,79}$/.test(k)) probs.push('block id "' + k + '" is not lower case a-z 0-9 . -');
    if (seen[k]) probs.push('two blocks share the id "' + k + '"'); seen[k] = 1;
    if (NOBLOCK.has(b.tagName)) probs.push(desc(b) + ' is a block itself; wrap it');
    if (!isBox(b) && b.all().some(isB)) probs.push('leaf block "' + k + '" holds blocks');
    const p = b.parentNode; if (!(p === sec || isBox(p))) probs.push('block "' + k + '" sits in ' + desc(p) + ', not directly in a container block or the screen');
  }
  // labelled controls side by side in one leaf (a label holding a control, or a text then a control): one leaf per field
  for (const b of blocks.filter(x => !isBox(x) && !x.classList.contains('fld'))) {
    const labs = b.all().filter(e => e.tagName === 'LABEL' && e.all().some(x => CTRL.has(x.tagName)) && !ups(e).some(u => u !== b && b.all().includes(u) && (u.tagName === 'TABLE' || u.tagName === 'DETAILS')));
    if (labs.length >= 2) probs.push('leaf "' + b.dataset.blk + '" holds ' + labs.length + ' labelled controls side by side; one leaf per field');
  }
  for (const e of all) {
    let what = null;
    if (e.tagName === '#TEXT') { if (e.textContent.trim() && !ups(e).some(x => CTRL.has(x.tagName) || x.tagName === 'OPTION')) what = 'text'; }
    else if (CTRL.has(e.tagName) && !(e.tagName === 'INPUT' && e.attrs.type === 'hidden')) what = 'control';
    if (!what) continue;
    const nb = ups(e).find(x => x === sec || isB(x));
    if (!nb || nb === sec) { probs.push(desc(e) + ' is not inside a block'); continue; }
    if (isBox(nb)) {
      const cap = what === 'text' && nb.tagName === 'DETAILS' && ups(e).some(x => x.tagName === 'SUMMARY' && x.parentNode === nb);
      if (!cap) probs.push(desc(e) + ' sits in the container "' + nb.dataset.blk + '", not in a leaf block');
    }
  }
  return probs;
}

// a few DOM members the parts use that the fake DOM lacks (added here, on this process's copy only)
{
  const El = fakedom.make().createElement('div').constructor, pr = El.prototype, def = (k, d) => { if (!(k in pr)) Object.defineProperty(pr, k, d); };
  def('childNodes', { get() { return this.children; } });
  def('lastChild', { get() { return this.children[this.children.length - 1] || null; } });
  def('nextSibling', { get() { const p = this.parentNode; return p ? p.children[p.children.indexOf(this) + 1] || null : null; } });
  def('isConnected', { get() { let x = this; while (x.parentNode) x = x.parentNode; return x.tagName === 'BODY'; } });
  def('contains', { value(x) { for (; x; x = x.parentNode) if (x === this) return true; return false; } });
  def('closest', { value() { return null; } });
  def('remove', { value() { if (this.parentNode) this.parentNode.removeChild(this); } });
  def('getBoundingClientRect', { value() { return { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 }; } });
  def('hasAttribute', { value(k) { return this.attrs[k] !== undefined; } });
}

// ---------- the page with the models routes answered by index.js ----------
const rctx = { game: () => game, gamedir: game, tmpRoot: path.join(scratch, 'tmp'), allowLaunch: false, tools: path.resolve(__dirname, '..', '..', '..'),
  runTool: async () => ({ code: 2, stdout: '', stderr: 'SOEdit.exe was not found.\n' }) };
let SETREPLY = null;
// fake document states for the selected volume and mesh forms (the template model has no volumes or meshes to pick)
const R = 'resource/entity/tank/blktank/', BOX = (id, more) => Object.assign({ id: 'body/' + id, name: id, bone: 'body', kind: 'box', size: [40, 20, 10],
  matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 5], exact: true, thickness: { set: true, list: [80, 45, 45, 45, 45, 45], all: 45 }, tags: ['hull'], component: '', density: null, material: '' }, more || {});
const MESH = rel => ({ rel, vertices: 8, triangles: 12, uvCount: 1, hasNormals: true, hasTangents: false, skin: null, stride: 32, vertFlags: 0, layout: ['pos'], chunks: [],
  bounds: [0, 0, 0, 1, 1, 1], usedBy: [{ bone: 'body' }], canNormals: true, canWeld: true, flagList: ['twosided', 'alpha'],
  parts: [{ index: 0, tag: 'a', flagNames: [], triangles: 10, material: 'm.mtl', materialFound: true }, { index: 1, tag: 'b', flagNames: [], triangles: 2, textures: ['t.dds'], textureFound: [false] }] });
const FAKE = {
  'vol.list': () => ({ volumes: [BOX('hull'), BOX('front', { orphan: true, boneName: 'gone', exact: false }), BOX('ballp', { kind: 'polyhedron', file: 'hull.vol' })],
    bones: [{ path: 'body', volumes: 3, mesh: true }, { path: 'body/turret', volumes: 0, mesh: false }], vols: [R + 'hull.vol'] }),
  'vol.get': () => ({ vol: { triangles: 12, vertices: 8, sides: { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2 }, users: ['body/ballp', 'body/x'] } }),
  'ply.list': () => ({ meshes: [{ rel: R + 'a.ply', bone: 'body', view: 'VolumeView', vertices: 8, triangles: 12, parts: [{}, {}] }, { rel: R + 'b.ply', bone: 'body/turret', view: 'View', vertices: 8, triangles: 12, parts: [{}, {}] }],
    loose: [], bones: [{ path: 'body' }, { path: 'body/turret' }] }),
  'ply.get': q => MESH(q.rel),
  'mat.list': () => ({ materials: [{ rel: R + 'm.mtl', type: 'simple', usedBy: [R + 'a.ply'], textures: [{ found: true }] }], found: [], missing: [], missingMaterials: [],
    types: ['simple', 'bump'], textureKeys: ['diffuse', 'bump'], blends: ['none', 'blend'], flags: ['alpha', 'twosided'] }),
  'mat.get': () => ({ rel: R + 'm.mtl', type: 'simple', keys: [{ key: 'diffuse', args: ['t.dds'] }], textures: [{ key: 'diffuse', found: true }], flags: ['alpha'] }),
};
// the "Pick a model" card's routes, faked (the real find/folder belong to the server side): calls are recorded; FK.find(body, n) and
// FK.folder(body) answer; FK.down = fetch fails as when the program behind the window is gone; /api/ls answers the shared picker
const FK = { calls: [], down: false, find: null, folder: null, ls: [] };
const netDown = () => Promise.reject(new TypeError('Failed to fetch'));
function boot(store) {
  const doc = fakedom.make(), server = {}; store = store || new Map();
  const resp = (o, status) => Promise.resolve({ ok: !status, status: status || 200, json: () => Promise.resolve(clone(o)), body: null });
  const ctx = {
    document: doc, console, TextDecoder, setTimeout: (f) => { setImmediate(f); return 0; }, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
    confirm: () => true, requestAnimationFrame: () => 0, devicePixelRatio: 1,
    fetch: (u, o) => {
      const m = (o && o.method) || 'GET', p = String(u).split('?')[0], body = o && o.body ? JSON.parse(o.body) : null;
      if (p === '/api/health') return resp({ ok: true, allowLaunch: false, version: 'test' });
      if (p === '/api/commands') return resp({ commands: contract.describe() });
      if (p === '/api/settings' && m === 'GET') return resp({ settings: server, empty: true, file: '' });
      if (p === '/api/settings' && m === 'POST') { Object.assign(server, JSON.parse(o.body).set); return resp({ ok: true }); }
      if (p === '/api/game') return resp({ dir: '', tried: [], ok: false, codes: ['none'] });
      if (p === '/api/x/units/search') return resp({ results: [], total: 0 });
      if (p === '/api/ls') { const d = new URL('http://127.0.0.1' + u).searchParams.get('dir') || ''; FK.ls.push(d); return resp({ dir: d || mod, parent: null, entries: [{ name: 'sub', isMod: false }], files: ['a.mdl', 'b.pak'] }); }
      if (p === '/api/x/models/find' || p === '/api/x/models/folder' || p === '/api/x/models/stage') {
        FK.calls.push({ p, body });
        if (FK.down) return netDown();
        if (p === '/api/x/models/stage') return resp(SETREPLY);
        const r = p === '/api/x/models/find' ? FK.find(body, FK.calls.filter(c => c.p === p).length) : FK.folder(body);
        return r && r.status ? resp({ error: r.error }, r.status) : resp(r);
      }
      if (p === '/api/x/models/doc/state' && body && FAKE[body.what]) return resp(FAKE[body.what](body.query || {}));
      if (p.startsWith('/api/x/models/')) {
        const f = ext.routes[m + ' ' + p];
        if (!f) return new Promise(() => {});
        inflight++;
        return Promise.resolve().then(() => f(m === 'GET' ? new URL('http://127.0.0.1' + u) : p, body, rctx)).then(j => resp(j), e => resp({ error: e.message }, e.status || 500)).finally(() => { inflight--; });
      }
      return new Promise(() => {});
    },
  };
  ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(/<script>([\s\S]*)<\/script>/.exec(html)[1], ctx, { filename: 'page.js:script' });
  return { doc, ctx, store };
}

// ---------- the "Pick a model" card: find over every model, the kind row, folders and paks, the shared picker, error sentences ----------
async function pickCard() {
  const EN = ext.lang.en, T = (k, o) => EN[k].replace(/\{(\w+)\}/g, (m, s) => (o && o[s] != null ? String(o[s]) : m));
  const P = boot();
  await built(P);
  const S = P.ctx.__as2gui, sec = P.doc.getElementById('main').children.find(s => s.dataset.id === 'models');
  const settle = settled;
  S.mod = mod; P.ctx.as2Link('page:models'); await settle();
  const blk = id => { const a = sec.all().filter(e => e.dataset && e.dataset.blk === id); assert.strictEqual(a.length, 1, 'one block ' + id); return a[0]; };
  const q = blk('pk.q').all().find(e => e.tagName === 'INPUT'), pIn = blk('pk.path').all().find(e => e.tagName === 'INPUT');
  const btnIn = (id, text) => { const b = blk(id).all().find(e => e.tagName === 'BUTTON' && e.textContent === text); assert.ok(b, text + ' in ' + id); return b; };
  // the search kit's Browse button (page.js searchKit) stands where the path box's own Browse file... button was
  const skBrowse = id => { const b = blk(id).all().find(e => e.tagName === 'BUTTON' && String(e.className).split(' ').indexOf('sk-browse') >= 0); assert.ok(b, 'kit Browse in ' + id); return b; };
  const say = () => blk('pk.hitsay').textContent, msg = () => blk('pk.msg').textContent;
  const rows = () => blk('pk.hits').children.filter(e => e.tagName === 'BUTTON');
  const last = p => FK.calls.filter(c => c.p === p).slice(-1)[0];
  const stage = () => last('/api/x/models/stage').body.target;
  for (const id of ['pk.title', 'pk.hint', 'pk.q', 'pk.kind', 'pk.hitsay', 'pk.hits', 'pk.path', 'pk.msg']) blk(id);
  assert.strictEqual(blk('pk.hint').textContent, EN['models.pk.hint']);
  assert.strictEqual(q.getAttribute('placeholder'), EN['models.q.ph']); assert.strictEqual(pIn.getAttribute('placeholder'), EN['models.path.ph']);
  assert.deepStrictEqual(blk('pk.kind').children.map(b => b.textContent), ['all', 'vehicle', 'human', 'object', 'breed'].map(k => EN['models.f.' + k]));
  assert.strictEqual(btnIn('pk.kind', EN['models.f.all']).getAttribute('aria-pressed'), 'true', 'All is the first choice');
  ok('the card: hint, search box, kind row (All first), path box with ' + blk('pk.path').children.filter(e => e.tagName === 'BUTTON').map(b => b.textContent).join(', '));

  // the kind choice: kept in the page store, sent with the search
  btnIn('pk.kind', EN['models.f.vehicle']).click(); await settle();
  assert.strictEqual(P.store.get('as2gui.models.kind'), '"vehicle"', 'the kind is remembered');
  assert.ok(btnIn('pk.kind', EN['models.f.vehicle']).className === 'primary' && btnIn('pk.kind', EN['models.f.all']).className === '');
  // a search: the first answer says the index is being built, the second has the rows
  const ROWS = [{ target: 'resource/entity/tank/t34_76/t34_76.def', name: 't34_76', kind: 'vehicle', key: 'resource/entity/tank/t34_76/t34_76.def', where: 'game', pak: 'entity.pak', model: 'x.mdl' },
    { target: 't34_85', name: 't34_85', kind: 'vehicle', key: 'resource/entity/tank/t34_85/t34_85.def', where: 'mod', pak: '', model: 'y.mdl' }];
  const notes = [];
  FK.find = (b, k) => { if (k === 1) return { building: true, total: 0, results: [], note: 'Making the list of models, the first time only.' }; notes.push(say()); return { total: 7, results: ROWS, didYouMean: [], building: false, note: '' }; };
  q.value = 't34'; q.fire('keydown', { key: 'Enter' }); await settle();
  const fc = FK.calls.filter(c => c.p === '/api/x/models/find');
  assert.strictEqual(fc.length, 2, 'asked again after the building answer');
  assert.deepStrictEqual(Object.assign({}, fc[0].body, { limit: 0 }), { q: 't34', mod, kind: 'vehicle', limit: 0 }, 'find gets q, mod, kind');
  assert.strictEqual(notes[0], 'Making the list of models, the first time only.', 'the building note shows while waiting');
  assert.strictEqual(say(), T('models.hitsSome', { n: 7, m: 2 }));
  const D = ' ' + String.fromCharCode(183) + ' ';
  assert.deepStrictEqual(rows().map(b => b.textContent), ['t34_76' + D + 'vehicle' + D + 'game, entity.pak', 't34_85' + D + 'vehicle' + D + 'your mod']);
  assert.deepStrictEqual(rows().map(b => b.getAttribute('title')), ROWS.map(r => r.key), 'the full key in the title');
  check(sec, 'rows drawn');
  ok('find: q, mod and the kind sent; the building note shown and the search asked again; "7 found, showing the first 2"; rows with kind, mod or game, pak');

  // one row chosen at once, its target passed unchanged
  rows()[0].click(); await settle();
  assert.strictEqual(stage(), ROWS[0].target);
  rows()[1].click(); await settle();
  assert.strictEqual(stage(), ROWS[1].target);
  assert.deepStrictEqual(rows().map(b => b.className), ['', 'primary'], 'only the chosen row is marked');
  // did you mean
  FK.find = () => ({ total: 0, results: [], didYouMean: [ROWS[0]], building: false, note: '' });
  q.value = 't43'; q.fire('keydown', { key: 'Enter' }); await settle();
  assert.ok(say() === EN['models.noHits'] && blk('pk.hits').textContent.includes(EN['models.dym']) && rows().length === 1);
  ok('a click chooses that one row (target unchanged to stage, only it marked); no hit shows the did-you-mean rows');

  // the path box: .def and .mdl chosen at once, a folder or a .pak listed
  const DEF = path.join(game, 'resource', 'entity', 'tank', 'kv1', 'kv1.def');
  pIn.value = DEF; btnIn('pk.path', EN['models.usePath']).click(); await settle();
  assert.strictEqual(stage(), DEF, 'a .def path is chosen directly');
  const nFolder = () => FK.calls.filter(c => c.p === '/api/x/models/folder').length, f0 = nFolder();
  pIn.value = 'breed:mp/ger/rifle'; pIn.fire('keydown', { key: 'Enter' }); await settle();
  assert.ok(stage() === 'breed:mp/ger/rifle' && nFolder() === f0, 'breed:<name> is chosen directly');
  const DIR = path.join(scratch, 'somefolder');
  FK.folder = b => ({ path: b.path, total: 3, results: ROWS, truncated: true });
  pIn.value = DIR; btnIn('pk.path', EN['models.usePath']).click(); await settle();
  assert.deepStrictEqual(last('/api/x/models/folder').body, { path: DIR, mod });
  assert.strictEqual(say(), T('models.folderSome', { n: 3, p: DIR, m: 2 }));
  assert.strictEqual(rows().length, 2);
  // inside a listed folder the search box filters its rows here, no find call find any model, also in paks)
  const nFind = () => FK.calls.filter(c => c.p === '/api/x/models/find').length, n0 = nFind();
  q.value = 't34_85'; q.fire('input'); q.fire('keydown', { key: 'Enter' }); await settle(); // typing draws in the next frame (rAF is a no-op here), Enter at once
  assert.ok(rows().length === 1 && rows()[0].getAttribute('title') === ROWS[1].key && nFind() === n0, 'the search box filters the folder rows locally');
  assert.strictEqual(say(), T('models.foldIn', { n: 1, p: DIR }));
  q.value = ''; q.fire('input'); q.fire('keydown', { key: 'Enter' }); await settle();
  assert.strictEqual(rows().length, 2, 'an empty box shows the folder rows again');
  const PAK = path.join(game, 'resource', 'entity.pak');
  FK.folder = b => ({ path: b.path, total: 1, results: [ROWS[0]], truncated: false });
  pIn.value = PAK; pIn.fire('keydown', { key: 'Enter' }); await settle();
  assert.ok(last('/api/x/models/folder').body.path === PAK && say() === T('models.folderHits', { n: 1, p: PAK }) && rows().length === 1, 'a .pak lists its models');
  rows()[0].click(); await settle();
  assert.strictEqual(stage(), ROWS[0].target);
  ok('path box: .def and breed: chosen at once; a folder lists its rows ("3 models in ..., showing the first 2"), a .pak too, a row is chosen');

  // Browse: the kit's Browse (file) and Browse folder..., the shared picker's two modes, opened where the path box points (else the mod folder)
  const pk = P.doc.getElementById('pk'), use = P.doc.getElementById('pkuse');
  pIn.value = DIR; btnIn('pk.path', EN['models.browseDir']).click(); await settle();
  assert.ok(pk.open && FK.ls.slice(-1)[0] === DIR, 'the folder picker opens in the path box folder: ' + FK.ls.slice(-1)[0]);
  FK.folder = b => ({ path: b.path, total: 0, results: [], truncated: false });
  use.click(); await settle();
  assert.ok(!pk.open && pIn.value === DIR && last('/api/x/models/folder').body.path === DIR && say() === T('models.folderNone', { p: DIR }), 'the picked folder is listed');
  pIn.value = DEF; skBrowse('pk.path').click(); await settle();
  assert.strictEqual(FK.ls.slice(-1)[0], path.dirname(DEF), 'the file picker opens in the folder of the path box file');
  const item = P.doc.getElementById('pklist').children.find(e => e.textContent.trim() === 'a.mdl');
  item.click(); use.click(); await settle();
  assert.strictEqual(stage(), path.join(path.dirname(DEF), 'a.mdl'), 'the picked .mdl is chosen');
  pIn.value = ''; skBrowse('pk.path').click(); await settle();
  assert.strictEqual(FK.ls.slice(-1)[0], mod, 'an empty path box: the picker opens in the mod folder');
  P.doc.getElementById('pkno').click();
  ok('Browse file... and Browse folder... (the shared picker): start in the path box folder or the mod; a folder is listed, a .mdl chosen');

  btnIn('pk.fold', EN['models.foldOff']).click(); await settle();
  assert.ok(blk('pk.fold').hidden, 'Search all models leaves the folder');
  // errors: the program gone (fetch fails), a server sentence
  FK.down = true;
  q.value = 'is3'; q.fire('keydown', { key: 'Enter' }); await settle();
  assert.strictEqual(say(), EN['models.lost'], 'search with the program gone');
  pIn.value = path.join(game, 'x.mdl'); btnIn('pk.path', EN['models.usePath']).click(); await settle();
  assert.strictEqual(msg(), EN['models.lost'], 'stage with the program gone');
  FK.down = false;
  FK.find = () => ({ status: 500, error: 'The model index could not be read.' });
  q.value = 'is2'; q.fire('keydown', { key: 'Enter' }); await settle();
  assert.strictEqual(say(), 'The model index could not be read.');
  ok('a lost program says "' + EN['models.lost'].slice(0, 40) + '..." (not "Failed to fetch"); a server error shows its sentence');

  // the model box's Browse: the shared picker on the game data at entity (.mdl .def .set); a picked file's game key is the model
  {
    const SK = P.ctx.searchKit, real = SK.picker, specs = [];
    SK.picker = (spec, done) => { specs.push(spec); done('entity/-vehicle/tank/t34x/t34x.def', { view: 'data', path: 'entity/-vehicle/tank/t34x/t34x.def', key: 'resource/entity/-vehicle/tank/t34x/t34x.def', name: 't34x.def', where: 'vanilla' }); };
    try { skBrowse('pk.q').click(); await settle(); } finally { SK.picker = real; }
    const sp = specs[0];
    assert.ok(sp && sp.mode === 'file' && sp.view === 'data' && sp.start === 'entity' && String(sp.exts) === 'mdl,def,set', 'model box Browse: the game data at entity: ' + JSON.stringify(sp));
    assert.ok(stage() === 'resource/entity/-vehicle/tank/t34x/t34x.def' && q.value === 't34x', 'model box Browse: the picked def is chosen by its key, its name in the box');
    ok('the model box Browse opens the game data at entity; a pick chooses that model');
  }
  // another page's pick(name) still works; the kind choice survives a new page load
  S.screens.models.pick('t34_76'); await settle();
  assert.ok(stage() === 't34_76' && q.value === 't34_76' && !rows().length && say() === '', 'pick(name) from another page');
  assert.strictEqual(P.store.get('as2gui.models.target'), '"t34_76"');
  const P2 = boot(P.store);
  await built(P2);
  const sec2 = P2.doc.getElementById('main').children.find(s => s.dataset.id === 'models');
  const v2 = sec2.all().find(e => e.dataset && e.dataset.blk === 'pk.kind').children.find(b => b.textContent === EN['models.f.vehicle']);
  assert.strictEqual(v2.getAttribute('aria-pressed'), 'true', 'the kind choice is back after a reload');
  ok('S.screens.models.pick(name) chooses it and clears the list; the kind choice and last target are kept across a reload');
}
const check = (sec, what) => { const pr = checkScreen(sec); assert.ok(!pr.length, what + ':\n  ' + pr.slice(0, 30).join('\n  ')); };

(async () => {
  // a model to edit: the vehicle template in the mod (sub/file.server.js), with one animation
  const made = await ext.routes['POST /api/x/models/file/new']('/api/x/models/file/new', { mod, path: 'entity/tank/blktank', template: 'vehicle', def: true }, rctx);
  const MDL = made.mdl, DIR = MDL.replace(/[^/]*$/, '');
  const files = fs.readdirSync(path.join(mod, ...DIR.split('/'))).map(f => ({ rel: DIR + f, inMod: true, missing: false, group: /\.mdl$/.test(f) ? 'model' : /\.anm$/.test(f) ? 'animations' : 'other' }));
  const groups = {}; files.forEach(f => (groups[f.group] = groups[f.group] || []).push(f));
  SETREPLY = { ok: true, target: MDL, mdl: MDL, staged: true, files, groups, order: Object.keys(groups) };
  ok('a model from the vehicle template in the temp mod (' + files.length + ' files)');

  const P = boot();
  await built(P);
  assert.ok(P.ctx.__as2gui, 'page built');
  const S = P.ctx.__as2gui, sec = P.doc.getElementById('main').children.find(s => s.dataset.id === 'models');
  const settle = async () => { await settled(); P.ctx.as2Blocks.apply(sec); };
  // MODELS_BLK_SOFT=1: list the problems of every draw and go on (while converting)
  const check = what => { const pr = checkScreen(sec); if (process.env.MODELS_BLK_SOFT) { if (pr.length) console.log('PROBLEMS ' + what + ' (' + pr.length + '):\n  ' + pr.join('\n  ')); return; } assert.ok(!pr.length, what + ':\n  ' + pr.slice(0, 30).join('\n  ') + (pr.length > 30 ? '\n  ... ' + (pr.length - 30) + ' more' : '')); };
  check('models first build');
  ok('first build: ' + sec.all().filter(isB).length + ' blocks, every control and text in a leaf');

  S.mod = mod; P.ctx.as2Link('page:models'); await settle();
  S.screens.models.pick(MDL); await settle();
  const tabs = sec.all().find(e => e.dataset && e.dataset.blk === 'ed.tabs');
  assert.ok(tabs, 'sub-tab row');
  const ids = tabs.children.filter(b => b.tagName === 'BUTTON').map(b => b.textContent);
  assert.ok(ids.length >= 5, 'sub-tabs ' + ids.join(','));
  // the search boxes of the sub-tabs: each kit's Browse is clicked once with the picker stubbed, its spec kept by history key
  const SKS = {}, SKP = P.ctx.searchKit;
  const probe = pane => {
    for (const b of pane.all().filter(e => e.tagName === 'BUTTON' && String(e.className).split(' ').indexOf('sk-browse') >= 0)) {
      let k = null, box = null; for (let x = b.parentNode; x && k == null; x = x.parentNode) if (x.attrs && x.attrs['data-sk'] != null) { k = x.attrs['data-sk']; box = x; }
      if (k == null || SKS[k]) continue;
      const real = SKP.picker; let sp = null; SKP.picker = (s, done) => { sp = Object.assign({}, s, { at: s.start, done, input: box.all().find(e => e.tagName === 'INPUT' || e.tagName === 'TEXTAREA') }); };
      try { b.click(); } finally { SKP.picker = real; }
      SKS[k] = sp || { none: true };
    }
  };
  const ONLY = (process.env.MODELS_BLK_TABS || '').split(',').filter(Boolean);
  for (const b of tabs.children.filter(x => x.tagName === 'BUTTON')) {
    b.click(); await settle();
    const pane = sec.all().find(e => e.dataset && e.dataset.blk === 'ed.sub').children[0];
    if (ONLY.length && !ONLY.includes(pane.dataset.blk)) continue;
    assert.ok(isBox(pane), 'the sub-tab ' + b.textContent + ' is a pane container');
    check('sub-tab ' + pane.dataset.blk);
    ok('sub-tab ' + pane.dataset.blk + ' drawn: ' + pane.all().filter(isB).length + ' blocks, every control and text in a leaf');
    probe(pane);
    // parts drawn on a click: the Shot tool's bar, a bone's form, the first item of a list (volume, mesh)
    const ACT = { 'tab.model': () => pane.all().find(e => e.tagName === 'BUTTON' && e.textContent === 'Shot'),
      'tab.tree': () => pane.all().find(e => e.attrs && e.attrs.role === 'treeitem'),
      'tab.vol': () => (pane.all().find(e => e.dataset && e.dataset.blk === 'vol.list') || { all: () => [] }).all().find(e => e.tagName === 'TR' || e.tagName === 'BUTTON'),
      'tab.ply': () => (pane.all().find(e => e.dataset && e.dataset.blk === 'ply.list') || { all: () => [] }).all().find(e => e.tagName === 'TR' || e.tagName === 'BUTTON') };
    const a = ACT[pane.dataset.blk] && ACT[pane.dataset.blk]();
    if (a) { a.fire('click'); await settle(); check('sub-tab ' + pane.dataset.blk + ' after a click'); ok('sub-tab ' + pane.dataset.blk + ' after a click on ' + desc(a).slice(0, 40) + ': every control and text in a leaf'); probe(pane); }
  }
  if (!ONLY.length) {
    // Browse on the boxes of the open model: the game data at the model's folder; gun boxes at set/stuff
    const mdir = String((SKS['models.anim.ed.read'] || {}).at || ''), want = DIR.replace(/\/$/, '').replace(/^resource\//, '');
    assert.ok(/^resource\//.test(mdir) && mdir.endsWith('/' + want), 'the open model\'s folder: ' + mdir + ' for ' + MDL);
    const at = [...new Set(['models.anim.ed.read', 'models.vol.q', 'models.tree.find'].concat(Object.keys(SKS).filter(k => /^models\.(ply\.(mat|tex|diff|textures)|tree\.|tl\.)/.test(k))))];
    for (const k of at) { const sp = SKS[k]; assert.ok(sp && sp.view === 'data' && sp.mode === 'file' && sp.at === mdir, k + ': Browse at the model folder (data view): ' + JSON.stringify(sp && { view: sp.view, at: sp.at })); }
    assert.strictEqual(String(SKS['models.anim.ed.read'].exts), 'anm');
    // a pick fills the box: the animation read box gets the game key, the volume box the file name
    const fill = async (k, p, e) => { const sp = SKS[k]; assert.ok(sp.input, k + ': its box'); sp.done(p, e); await settle(); return sp.input.value; };
    assert.strictEqual(await fill('models.anim.ed.read', 'x/a.anm', { view: 'data', path: 'x/a.anm', key: 'resource/x/a.anm' }), 'resource/x/a.anm', 'animation read box: the game key');
    assert.strictEqual(await fill('models.vol.q', mdir.slice(9) + '/hull.vol', { view: 'data', path: mdir.slice(9) + '/hull.vol', key: mdir + '/hull.vol' }), 'hull', 'volume box: the file name filters');
    if (SKS['models.armor.gun']) assert.ok(SKS['models.armor.gun'].view === 'data' && SKS['models.armor.gun'].at === 'set/stuff', 'gun box: set/stuff');
    ok('sub-tab boxes: Browse = the picker at the model folder (' + at.length + ' boxes: ' + at.join(', ') + ')' + (SKS['models.armor.gun'] ? ', the gun box at set/stuff' : ''));
  }

  // ---------- the selected volume and mesh forms: one leaf per field, ids the same for every selection, a moved field stays moved ----------
  const byId = id => sec.all().filter(e => e.dataset && e.dataset.blk === id);
  const one = id => { const a = byId(id); assert.strictEqual(a.length, 1, 'one block ' + id + ' (' + a.length + ')'); return a[0]; };
  const goTab = async id => { for (const b of tabs.children.filter(x => x.tagName === 'BUTTON')) { b.click(); await settle(); if (one('ed.sub').children[0].dataset.blk === id) return; } throw new Error('no sub-tab ' + id); };
  const pickIn = async (list, text) => { const b = one(list).all().find(e => e.tagName === 'BUTTON' && e.textContent === text); assert.ok(b, text + ' in ' + list); b.click(); await settle(); };
  const idsUnder = id => one(id).all().filter(isB).map(b => b.dataset.blk).sort();
  const fldIds = id => one(id).all().filter(b => isB(b) && b.classList.contains('fld')).map(b => b.dataset.blk).sort();
  // every control of the form sits in a field leaf (div.fld), a table leaf or a leaf with no label (a button group, a list)
  function perField(id) {
    const f = one(id), bad = [];
    for (const c of f.all().filter(e => ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(e.tagName))) {
      const leaf = ups(c).find(isB);
      if (!leaf || isBox(leaf)) { bad.push(desc(c) + ' not in a leaf'); continue; }
      if (leaf.classList.contains('fld') || ups(c).some(u => u.tagName === 'TABLE' && leaf.all().includes(u))) continue;
      if (c.tagName !== 'BUTTON' && c.tagName !== 'TEXTAREA') bad.push(desc(c) + ' (a field) is in the leaf ' + leaf.dataset.blk + ', not in a field leaf');
      if (leaf.all().some(e => e.tagName === 'LABEL' || (e.classList && e.classList.contains('n')))) bad.push('leaf ' + leaf.dataset.blk + ' holds a label and a control: one leaf per field');
    }
    for (const l of f.all().filter(b => isB(b) && b.classList.contains('fld'))) {
      const n = l.all().filter(e => ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.tagName)).length, labs = l.all().filter(e => e.tagName === 'LABEL').length;
      if (!n || labs !== 1) bad.push('field leaf ' + l.dataset.blk + ' holds ' + n + ' controls and ' + labs + ' labels');
    }
    assert.ok(!bad.length, id + ':\n  ' + bad.join('\n  '));
    return f.all().filter(b => isB(b) && b.classList.contains('fld')).length;
  }
  const layout = o => P.ctx.as2Blocks.import(JSON.stringify({ arsenalLayout: 1, name: 'moved ' + Object.keys(o).length, screens: { models: { o, hid: [] } } }));

  // the Shot tool in the Model view: its toggle beside the handles' mode buttons above the canvas (a tool row of the view without the
  // handles), its bar right under the canvas, hidden while off; a saved profile that lists the old card 'shot' (toggle and bar under
  // the help texts) is ignored for them and breaks nothing
  await goTab('tab.model');
  const shotPlace = what => {
    const t = one('shot.tool'), b = one('shot.bar'), vk = one('model.view').children.filter(isB).map(x => x.dataset.blk);
    assert.ok(/^model\.view\.(gizmo|tools)$/.test(t.parentNode.dataset.blk) && vk.indexOf(t.parentNode.dataset.blk) === vk.indexOf('model.view.canvas') - 1, what + ': the Shot toggle in the row right above the canvas, in ' + t.parentNode.dataset.blk);
    assert.ok(b.parentNode.dataset.blk === 'model.view' && vk.indexOf('shot.bar') === vk.indexOf('model.view.canvas') + 1 && vk.indexOf('shot.bar') < vk.indexOf('model.view.keys'), what + ': the Shot bar right under the canvas ' + vk.join(','));
    assert.ok(!byId('shot').length, what + ': no old shot card');
    return { t, b };
  };
  let sp = shotPlace('Model view');
  const sBtn = sp.t.all().find(e => e.tagName === 'BUTTON');
  if (sBtn.getAttribute('aria-pressed') !== 'true') { sBtn.click(); await settle(); }
  assert.ok(!sp.b.hidden && sp.b.all().some(e => e.tagName === 'SELECT'), 'on: the fields show under the canvas');
  sBtn.click(); await settle();
  assert.ok(sp.b.hidden && !sp.b.all().some(e => e.tagName === 'SELECT') && sBtn.getAttribute('aria-pressed') === 'false', 'off: the bar is hidden and empty');
  layout({ shot: ['shot.tool', 'shot.bar'], 'tab.model': ['model.title', 'model.view', 'shot', 'model.files', 'model.ext'], 'model.view.gizmo': ['model.view.gizmo.modes', 'model.view.gizmo.space'] }); await settle();
  await goTab('tab.vol'); await goTab('tab.model');
  sp = shotPlace('an old profile'); check('the Model view with an old profile');
  sp.t.all().find(e => e.tagName === 'BUTTON').click(); await settle(); check('the Shot tool on with an old profile');
  assert.ok(!sp.b.hidden, 'the Shot bar shows with an old profile');
  sp.t.all().find(e => e.tagName === 'BUTTON').click(); await settle();
  ok('the Shot toggle sits in the row above the canvas, its bar right under the canvas and hidden while off; an old profile breaks nothing');

  await goTab('tab.vol');
  await pickIn('vol.list', 'hull');
  check('the selected volume');
  const vf = perField('vol.form'), v1 = idsUnder('vol.form'), f1 = fldIds('vol.form');
  for (const id of ['vol.form.ident.name', 'vol.form.ident.bone', 'vol.form.shape.kind', 'vol.form.shape.length', 'vol.form.place.pos', 'vol.form.place.tr.turn', 'vol.form.props.tags']) one(id);
  ok('the selected volume: ' + vf + ' field leaves, every field its own leaf (' + f1.slice(0, 4).join(', ') + ' ...)');
  const findQ = byId('vol.find')[0].children.filter(isB).map(b => b.dataset.blk);
  layout({ 'vol.find': findQ.concat(['vol.form.ident.name']) }); await settle();
  assert.strictEqual(one('vol.form.ident.name').parentNode.dataset.blk, 'vol.find', 'the profile moved the name field');
  await pickIn('vol.list', 'front');
  check('another volume');
  assert.deepStrictEqual(fldIds('vol.form').concat(fldIds('vol.find').filter(i => i.startsWith('vol.form.'))).sort(), f1, 'the same field ids for another volume');
  assert.deepStrictEqual(idsUnder('vol.form').filter(i => !/^vol\.form\.(orphan|place\.exact)$/.test(i)).concat(['vol.form.ident.name']).sort(), v1, 'the same block ids for another volume (but the orphan and inexact hints)');
  const nm = one('vol.form.ident.name');
  assert.ok(nm.parentNode.dataset.blk === 'vol.find' && nm.all().find(e => e.tagName === 'INPUT').value === 'front', 'the moved name field stays moved after the redraw, and it is the new one');
  layout({ 'vol.find': findQ.concat(['vol.form.ident.name', 'vol.form.orphan']) }); await settle();
  assert.strictEqual(one('vol.form.orphan').parentNode.dataset.blk, 'vol.find', 'the profile moved the orphan hint');
  await pickIn('vol.list', 'ballp');
  check('a polyhedron volume'); perField('vol.form'); one('vol.form.volfile.tr.scale'); one('vol.form.volfile.mirror');
  assert.ok(!byId('vol.form.orphan').length, 'a block not drawn again is gone, also where it was moved');
  ok('another volume: the same ids, the moved name field stays moved after the redraw, a moved block not drawn again goes; a polyhedron adds its file fields');

  await goTab('tab.ply');
  await pickIn('ply.list', 'a.ply');
  check('the selected mesh');
  const pf = perField('ply.form'), p1 = idsUnder('ply.form');
  for (const id of ['ply.form.place.on.bone', 'ply.form.shape.tr.move', 'ply.form.flags.pick.f1', 'ply.form.pmat.p0.mat', 'ply.form.export.opts.units']) one(id);
  perField('ply.import'); one('ply.import.opts.bone'); one('ply.import.file.path');
  layout({ 'vol.find': findQ.concat(['vol.form.ident.name']), 'ply.form.place': ['ply.form.place.title', 'ply.form.shape.tr.move', 'ply.form.place.on', 'ply.form.place.rename', 'ply.form.place.from', 'ply.form.place.disk'] }); await settle();
  assert.strictEqual(one('ply.form.shape.tr.move').parentNode.dataset.blk, 'ply.form.place', 'the profile moved the move field');
  ok('the selected mesh: ' + pf + ' field leaves, every field its own leaf; the import controls too');
  await pickIn('ply.list', 'b.ply');
  check('another mesh');
  assert.deepStrictEqual(idsUnder('ply.form'), p1, 'the same block ids for another mesh');
  const mv = one('ply.form.shape.tr.move');
  assert.ok(mv.parentNode.dataset.blk === 'ply.form.place' && mv.parentNode.children.indexOf(mv) === 1, 'the moved field stays moved after the redraw');
  await pickIn('ply.mats.list', 'm.mtl');
  check('the selected material'); perField('ply.mats'); one('ply.mats.sel.k0'); one('ply.mats.sel.flags.f1'); one('ply.mats.new.name');
  ok('another mesh: the same ids, the moved field stays moved; the selected material: every field its own leaf');

  await pickCard();
  console.log('PASS models blocks (' + n + ')');
  process.exit(0);   // the page keeps a timer alive in the fake DOM (setTimeout runs as setImmediate here): end the run once every check passed
})().catch(e => { console.error(e && e.stack || e); console.log('FAIL models blocks'); process.exit(1); });

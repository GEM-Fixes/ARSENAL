// Map Viewer objects test (MV-PG2, builder PG2b): node tools/gui/ext/mapviz/sub/objects.test.js [scratch dir]
// The objects part on a stub V in the fake DOM, with the items of the real entcat on the fixture map
// (tools/mapviz/test/fxmake.js both forms, ARSENAL_CACHE inside the scratch dir; a small planted list when entcat is not
// built): the layer and the picker, the store keyed with mode, at() and find() answers on the fixture, ticks, the draw
// with palette colours and the selection, hit rows, the Make button and the job words, seeded defects (unknown footprint
// kind, no uid, a vector without items, another pal), each run for as64, mowas2 and goh; the part on the shell; RMT;
// the language file both ways; no colour literal; ES5 page code.
// Author: Imperator_Aug (ARSENAL, ia-fa2cbe48)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const SCR = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'mv-objects-')));
fs.mkdirSync(SCR, { recursive: true });
process.env.ARSENAL_CACHE = path.join(SCR, 'cache');
const { harness: H } = require('./shell.test');
const fake = require('../../../test/fakedom');
const SHELL = require('./shell.client'), PART = require('./objects.client');
const LO = require('./objects.lang.json'), L = H.mergeLang([require('./shell.lang.json'), LO]);
const ROOT = path.resolve(__dirname, '../../../../mapviz');
const PAL = require(path.join(ROOT, 'palette.json'));
let pass = 0, failN = 0;
const ok = (c, what, extra) => { if (c) pass++; else { failN++; console.log('FAIL mapviz objects: ' + what + (extra !== undefined ? '\n  ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 600) : '')); } };
const en = k => L.en[k];
const clone = x => JSON.parse(JSON.stringify(x));
const opt = (fn, what) => { try { return fn(); } catch (e) { if (e && e.code === 'MODULE_NOT_FOUND') { console.log('skip: ' + what + ' is not built'); return null; } throw e; } };
const ops = (log, op) => log.filter(x => x.op === op);

// ---------- the fixture items ----------
const PLANTED = [
  { kind: 'object', uid: 't1', def: 'fx_tree', category: 'tree', fp: { kind: 'obb', pts: [[-406, 294], [-394, 294], [-394, 306], [-406, 306]] } },
  { kind: 'object', uid: 't2', def: 'fx_tree', category: 'tree', fp: { kind: 'obb', pts: [[-426, 334], [-414, 334], [-414, 346], [-426, 346]] } },
  { kind: 'object', uid: 't3', def: 'fx_tree', category: 'tree', fp: { kind: 'obb', pts: [[-386, 354], [-374, 354], [-374, 366], [-386, 366]] } },
  { kind: 'object', uid: 'w1', def: 'fx_wall', category: 'wall', fp: { kind: 'obb', pts: [[103, -140], [103, -60], [97, -60], [97, -140]] } },
  { kind: 'object', uid: 'h1', def: 'fx_house', category: 'building', fp: { kind: 'obb', pts: [[-490, -392], [-350, -312], [-380, -260], [-520, -340]] } },
  { kind: 'object', uid: 'r1', def: 'fx_road', category: 'road_decal', fp: { kind: 'decal', pts: [[-64, 136], [64, 136], [64, 164], [-64, 164]] } },
  { kind: 'object', uid: 'b1', def: 'fx_bush', category: 'bush', fp: { kind: 'box-proj', pts: [[130, 280], [170, 280], [170, 320], [130, 320]] } },
  { kind: 'object', uid: 'b2', def: 'fx_bush', category: 'bush', fp: { kind: 'box-proj', pts: [[150, 300], [190, 300], [190, 340], [150, 340]] } },
  { kind: 'object', uid: 'p1', def: 'flag_point_1', category: 'other', fp: { kind: 'none', pts: [[0, 0]] } },
];
const FX = {};
function fixture(form) {
  if (FX[form] !== undefined) return FX[form];
  const E = opt(() => require(path.join(ROOT, 'entcat')), 'entcat');
  const K = E && opt(() => require(path.join(ROOT, 'lib/mapkit')), 'mapkit');
  const fx = E && opt(() => require(path.join(ROOT, 'test/fxmake')), 'the fixture maker');
  if (!E || !K || !fx) return (FX[form] = { items: clone(PLANTED), real: false });
  const f = fx.make(path.join(SCR, 'fx-' + form), { form });
  const src = K.source({ target: f.target, game: f.gameDir }), doc = K.doc(src, f.map, {});
  const mode = doc.modes && doc.modes[0] && doc.modes[0].id;
  const sub = E.docForMode(doc, mode), links = E.linksFor(src, f.map, sub, { mode });
  const cat = E.forDoc(src, sub, { loader: E.loaderFor(src), links });
  const items = E.place(sub, cat, links).map(x => Object.assign({ kind: 'object' }, x));
  return (FX[form] = { items, cat, real: true });
}
const vecEnv = (items, o) => Object.assign({ v: 1, kind: 'vector', name: 'objects', map: 'multi/mv_fixture', target: 'mowas2', items: clone(items), pal: 'objects', palette: PAL.objects }, o || {});

// ---------- the part on a stub V ----------
function load(o) {
  o = o || {};
  const doc = fake.make(), log = [];
  const make = doc.createElement;
  doc.createElement = t => { const e = make(t); if (String(t).toLowerCase() === 'canvas') e.getContext = k => (k === '2d' ? (e._ctx = e._ctx || H.stubCtx(log, e)) : null); return e; };
  const X = {};
  const fn = new Function('EXT_SCREENS', 'h', 'tx', 'api', 'S', 'RMT', 'cssv', 'onTheme', 'document', 'window', 'setTimeout', 'Image', 'gohDir', 'navigator', (o.kit ? [require('../../../test/blockcheck').kitSrc(), 'searchKit.picker=function(s,d){MVPICK.push({spec:s,done:d})};'] : []).concat([SHELL, PART]).join('\n'));
  fn(X, H.hOf(doc), H.txOf(L, o.code || 'en'), () => Promise.reject(new Error('no api in a part test')), {}, false, (n, d) => d || '', () => () => {}, doc,
    { requestAnimationFrame: f => f() }, (f, ms) => setTimeout(f, 2), H.ImageStub, () => '', undefined);
  return { X, doc, log, part: X.mapviz.parts.find(p => p.id === 'objects') };
}
function recCtx(log) {
  const c = H.stubCtx(log, { _id: 'main' });
  for (const m of ['stroke', 'fill', 'arc', 'closePath'])
    c[m] = function () { log.push({ op: m, args: [].slice.call(arguments), fillStyle: c.fillStyle, strokeStyle: c.strokeStyle, lineWidth: c.lineWidth }); };
  return c;
}
function mkView(env, o) {
  o = o || {};
  const v = { cx: 0, cy: 0, zoom: o.zoom || 1, w: 800, h: 600, env: env || null, pal: PAL, token: n => 'var-' + n };
  v.toScreen = (x, y) => [v.w / 2 + (x - v.cx) * v.zoom, v.h / 2 - (y - v.cy) * v.zoom];
  return v;
}
function stubV(L0, o) {
  o = o || {};
  const rec = { layers: [], panels: [], on: {}, calls: [], redraws: 0, relists: 0, boxes: {} };
  const q = Object.assign({ target: 'mowas2', map: 'multi/mv_fixture', mode: 'battle_zones', side: 'both', kind: 'tank', rmt: false, game: '<game>', mod: '', jobs: [] }, o.q || {});
  rec.answer = o.answer || null;
  const V = {
    q: n => q[n], pal: o.pal === undefined ? PAL : o.pal, view: { cx: 0, cy: 0, zoom: 1 },
    addLayer(l) { rec.layers.push(l); return true; },
    addPanel(p) { rec.panels.push(p); const box = L0.doc.createElement('div'); rec.boxes[p.id] = box; p.build(box, V); },
    on(e, f) { (rec.on[e] = rec.on[e] || []).push(f); }, emit(e, d) { (rec.on[e] || []).forEach(f => f(d)); },
    redraw() { rec.redraws++; }, relist() { rec.relists++; }, token: n => 'var-' + n, say() {},
    api(m, p, b) { rec.calls.push({ m, p, b, mode: q.mode }); return rec.answer ? rec.answer(m, p, b) : Promise.reject(new Error('no route')); },
    job(w, a) { rec.calls.push({ job: w, a }); return rec.jobAnswer ? rec.jobAnswer(w, a) : new Promise(() => {}); },
  };
  rec.V = V; rec.q = q;
  rec.draw = (env, view) => { const l = rec.layers.find(x => x.id === 'objects'), log = []; let err = null;
    try { l.draw(recCtx(log), view || mkView(env)); } catch (e) { err = e.message; } return { log, err }; };
  return rec;
}
function start(o) { const L0 = load(o); const R = stubV(L0, o); L0.part.init(R.V); R.S0 = L0.X.mapviz.objects.of(R.V); return Object.assign(R, { L0, MV: L0.X.mapviz }); }
const notMade = () => Promise.reject(Object.assign(new Error('MV_NOT_FOUND'), { status: 404, key: 'mapviz.err.MV_NOT_FOUND', params: { msg: 'not made', need: { what: 'entcat', args: { map: 'multi/mv_fixture', mode: 'battle_zones' } } } }));

(async () => {
  // ---- RMT ----
  { const L0 = load(), R = stubV(L0, { q: { rmt: true } }); L0.part.init(R.V);
    ok(R.layers.length === 0 && R.panels.length === 0 && R.calls.length === 0 && !(L0.X.mapviz.picks || []).length, 'RMT: no layer, no panel, no picker, no call'); }

  for (const target of ['mowas2', 'as64', 'goh']) {
    const form = target === 'goh' ? 'goh' : 'as2', F = fixture(form), T = target + ': ';
    const env = vecEnv(F.items, { target });
    // ---- registration ----
    const A = start({ q: { target }, answer: () => Promise.resolve(clone(env)) });
    const lay = A.layers[0];
    ok(A.layers.length === 1 && lay.id === 'objects' && lay.group === 'objects' && lay.engineTrue === false && lay.defaultOn === true && lay.source === 'objects' && lay.label === 'mapviz.objects.layer',
      T + 'one layer objects: group objects, an estimate (categories are ours), on by default, its own product', A.layers.map(l => l.id));
    ok(['draw', 'hit', 'list', 'legend'].every(k => typeof lay[k] === 'function'), T + 'the layer draws, hits, lists and has a legend');
    const pk = (A.MV.picks || []).filter(p => p.id === 'objects');
    ok(pk.length === 1 && pk[0].V === A.V && typeof pk[0].at === 'function', T + 'the picker objects is added with its V');
    ok(A.calls.length === 0, T + 'building makes no call');
    // ---- the store reads the layer once a map is open ----
    A.V.emit('map', {}); await H.flush();
    const lc = A.calls.filter(c => c.p === 'layer');
    ok(lc.length === 1 && lc[0].m === 'GET' && lc[0].b && lc[0].b.name === 'objects', T + 'map event: one GET layer name=objects', A.calls);
    const N = F.items.length;
    ok(A.S0.ready() && A.S0.items.length === N && A.S0.bad === 0, T + 'store ready with every item', { state: A.S0.state, n: A.S0.items.length, bad: A.S0.bad });
    ok(A.boxes.objects.has(en('mapviz.objects.count').replace('{n}', N)), T + 'panel: the object count', A.boxes.objects.textContent);
    ok(A.relists >= 1, T + 'the lists are drawn again when the items land');
    const by = c => A.S0.items.filter(i => i.category === c).length;
    ok(by('tree') === 3 && by('wall') === 1 && by('building') === 1 && by('bush') === 2 && by('road_decal') === 1, T + 'fixture kinds: 3 trees, 1 wall, 1 house, 2 bushes, 1 road', ['tree', 'wall', 'building', 'bush', 'road_decal'].map(by));
    // ---- at, find ----
    const w = A.S0.at(100, -100, 1);
    ok(w.length >= 1 && w[0].def === 'fx_wall' && w[0].category === 'wall', T + 'at (100,-100): the wall', w.map(i => i.def));
    ok(A.S0.at(0, -300, 1).length === 0, T + 'at (0,-300): nothing');
    ok(A.S0.at(105, -100, 3).some(i => i.def === 'fx_wall') && !A.S0.at(105, -100, 1).some(i => i.def === 'fx_wall'), T + 'near the thin wall outline within the tolerance counts, outside it does not');
    const dot = A.S0.at(0, 0, 2);
    ok(dot.length === 1 && dot[0].fp.kind === 'none' && dot[0].def === 'flag_point_1', T + 'a point object is hit within the tolerance', dot.map(i => i.def));
    const ov = A.S0.at(165, 310, 1);
    ok(ov.length === 2 && ov[0].area <= ov[1].area, T + 'two bushes overlap: both, the smaller first', ov.map(i => [i.uid, i.area]));
    const pa = pk[0].at(100, -100, 1);
    ok(pa.length >= 1 && pa[0].type === 'object' && pa[0].item.def === 'fx_wall', T + 'the picker gives type object items', pa);
    ok(A.S0.find('fx_tree').length === 3 && A.S0.find(' TREE ').length === 3, T + 'find by name and by kind word, any case', A.S0.find('tree').map(i => i.def));
    ok(A.S0.find('painted').length === 1 && A.S0.find('painted')[0].def === 'fx_road', T + 'find by the kind word of a road');
    ok(A.S0.find('').length === 0 && A.S0.find('nosuchthing').length === 0, T + 'find: an empty or unknown text finds nothing');
    ok(A.S0.byUid(w[0].uid).length === 1, T + 'byUid finds the wall');
    // ---- hit rows (N9: part) ----
    const hr = lay.hit(100, -100);
    ok(hr && hr.length === 2 && hr[0].value === en('mapviz.objects.cat.wall') && hr[1].value === 'fx_wall' && hr.every(r => r.part === 'objects'), T + 'hit rows: kind and name, part objects', hr);
    ok(lay.hit(0, -300) === null, T + 'hit on an empty spot: none');
    // ---- the draw ----
    { const css = A.MV.kit.colourCss, d = A.draw(clone(env));
      const nPoly = F.items.filter(i => i.fp.kind !== 'none').length, nDot = N - nPoly;
      ok(!d.err && ops(d.log, 'stroke').length === nPoly && ops(d.log, 'arc').length === nDot, T + 'draw: one outline per footprint, one dot per point object', { err: d.err, s: ops(d.log, 'stroke').length, a: ops(d.log, 'arc').length });
      const wl = css(PAL.objects.categories.wall.line), wf = css(PAL.objects.categories.wall.fill);
      ok(ops(d.log, 'stroke').some(x => x.strokeStyle === wl) && ops(d.log, 'fill').some(x => x.fillStyle === wf), T + 'draw: wall colours from palette.json objects', [wl, wf]);
      A.S0.select(w[0].uid);
      const d2 = A.draw(clone(env)), sel = css(PAL.objects.selected);
      ok(ops(d2.log, 'stroke').some(x => x.strokeStyle === sel && x.lineWidth === 3), T + 'the picked object is outlined in the selected colour');
      A.S0.select(null);
      // ticks: trees off
      const cb = A.boxes.objects.all().find(e => e.tagName === 'INPUT' && e.attrs['data-cat'] === 'tree');
      ok(cb && A.boxes.objects.all().filter(e => e.tagName === 'INPUT' && e.attrs.type === 'checkbox').length === 17, T + 'panel: one tick per kind (17)');
      cb.checked = false; cb.fire('change');
      const d3 = A.draw(clone(env));
      ok(ops(d3.log, 'stroke').length === nPoly - 3, T + 'trees ticked off: not drawn', ops(d3.log, 'stroke').length);
      ok(pk[0].at(-400, 300, 1).length === 0 && !lay.list().some(x => /fx_tree/.test(x.label)), T + 'trees ticked off: not picked, not listed');
      cb.checked = true; cb.fire('change');
      ok(pk[0].at(-400, 300, 1).length === 1, T + 'trees ticked on again: picked');
      // the layer hidden in the shell: the picker gives nothing
      A.q.allLayers = ['water.band']; ok(pk[0].at(100, -100, 1).length === 0, T + 'layer off: the picker gives nothing'); delete A.q.allLayers;
      // find box
      const fi = A.boxes.objects.all().find(e => e.tagName === 'INPUT' && e.attrs.type === 'search');
      fi.value = 'fx_tree'; fi.fire('input');
      const hb = H.blk(A.boxes.objects, 'mv.objects.hits'), btns = hb.all().filter(e => e.tagName === 'BUTTON');
      ok(btns.length === 3 && lay.list().length === 3, T + 'find box: 3 hits, the DOM list follows', btns.length);
      let picked = null; A.S0.onPick(it => { picked = it; }); btns[0].fire('click');
      ok(picked && picked.def === 'fx_tree', T + 'a hit button picks the object for the card');
      fi.value = 'zzz'; fi.fire('input');
      ok(hb.has(en('mapviz.objects.noHits')), T + 'find box: no hits says so');
      fi.value = ''; fi.fire('input');
      // searchKit (owner 2026-11-19): the find box with the page's real kit has Browse, History and an index of the object names
      { if (!global.LS) global.LS = { m: {}, get(k, d) { return Object.prototype.hasOwnProperty.call(this.m, k) ? this.m[k] : d; }, set(k, v) { this.m[k] = v; } };
        const K = start({ q: { target }, answer: () => Promise.resolve(clone(env)), kit: true }); K.V.emit('map', {}); await H.flush();
        const sk = K.boxes.objects.all().find(e => e.attrs && e.attrs['data-sk'] === 'mapviz.objectsFind');
        ok(!!sk && sk.all().filter(e => e.tagName === 'BUTTON').length >= 2, T + 'kit: the find box has Browse and History buttons');
        const nm = K.S0.names();
        ok(nm.filter(x => x.label === 'fx_tree').length === 1 && nm.find(x => x.label === 'fx_tree').n === 3 && nm.find(x => x.label === 'fx_tree').group === en('mapviz.objects.cat.tree'), T + 'kit index: each name once with its count, by kind', nm.map(x => x.label + ':' + x.n));
        const kf = sk.all().find(e => e.tagName === 'INPUT'); kf.value = 'fx_tr'; kf.fire('input'); await new Promise(r => setTimeout(r, 30)); await H.flush();
        const hit = sk.all().find(e => / sk-index/.test(' ' + e.className) && /fx_tree/.test(e.textContent));
        ok(!!hit, T + 'kit: typing offers the name from the index', sk.textContent);
        if (hit) { hit.parentNode.fire('click', { target: hit }); await new Promise(r => setTimeout(r, 30)); await H.flush();
          ok(kf.value === 'fx_tree' && H.blk(K.boxes.objects, 'mv.objects.hits').all().filter(e => e.tagName === 'BUTTON').length === 3 && global.LS.m['sk.hist.mapviz.objectsFind'][0] === 'fx_tree', T + 'kit: a pick finds that name and is in the history'); }
        // Browse = the file picker in the game data at entity/, .def files; a pick gives the name without .def and finds it (seeded)
        global.MVPICK = []; sk.all().find(e => / sk-browse/.test(' ' + e.className)).click();
        const b0 = global.MVPICK.pop();
        ok(!!b0 && b0.spec.view === 'data' && b0.spec.start === 'entity' && (b0.spec.exts || []).join() === 'def', T + 'kit: Browse opens the picker in the game data at entity/ (.def)', b0 && b0.spec);
        if (b0) { b0.done('entity/flora/fx_tree.def', { view: 'data', path: 'entity/flora/fx_tree.def', name: 'fx_tree.def' }); await new Promise(r => setTimeout(r, 30)); await H.flush();
          ok(kf.value === 'fx_tree' && H.blk(K.boxes.objects, 'mv.objects.hits').all().filter(e => e.tagName === 'BUTTON').length === 3, T + 'kit: a Browse pick gives the def name and finds it', kf.value); } }
      const lg = lay.legend();
      ok(lg && lg.some(r => r.label === en('mapviz.objects.cat.wall') && r.color === PAL.objects.categories.wall.fill) && lg[lg.length - 1].label === en('mapviz.objects.legClick'), T + 'legend: the kinds on the map with their colours, then the click line', lg); }
    // ---- keys: mode keys the store, side and kind do not ----
    { const n0 = A.calls.length; A.q.side = 'axis'; A.q.kind = 'inf'; A.V.emit('map', {}); await H.flush();
      ok(A.calls.length === n0 && A.S0.ready(), T + 'side or kind change: no new read', A.calls.slice(n0));
      A.q.mode = 'combat'; A.V.emit('map', {}); await H.flush();
      const nc = A.calls.slice(n0).filter(c => c.p === 'layer');
      ok(nc.length === 1 && nc[0].mode === 'combat' && A.S0.ready(), T + 'mode change: read again with the new mode', nc); }
    // ---- need, Make, job words ----
    { const B = start({ q: { target }, answer: notMade });
      B.V.emit('map', {}); await H.flush();
      const st = H.blk(B.boxes.objects, 'mv.objects.status'), mk = st.all().filter(e => e.tagName === 'BUTTON');
      ok(B.S0.state === 'need' && st.has(en('mapviz.objects.need')) && mk.length === 1, T + 'not made: the need line and one Make button', st.textContent);
      ok(!B.calls.some(c => c.job), T + 'a GET never starts a job');
      mk[0].fire('click');
      const jc = B.calls.filter(c => c.job);
      ok(jc.length === 1 && jc[0].job === 'entcat' && jc[0].a.mode === 'battle_zones', T + 'Make: one entcat job with the need args', jc);
      ok(st.has(en('mapviz.objects.making')) && !st.all().some(e => e.tagName === 'BUTTON'), T + 'while making: no button', st.textContent);
      const C = start({ q: { target, jobs: [{ what: 'entcat', target, map: 'multi/mv_fixture', args: { map: 'multi/mv_fixture', mode: 'battle_zones' }, text: 'Objects 40%' }] }, answer: notMade });
      C.V.emit('map', {}); await H.flush();
      const cs = H.blk(C.boxes.objects, 'mv.objects.status');
      ok(cs.has('Objects 40%') && !cs.all().some(e => e.tagName === 'BUTTON'), T + 'a fitting job runs: its words and no Make button', cs.textContent);
      const n0 = C.calls.length; C.V.emit('products', {}); await H.flush();
      ok(C.calls.length === n0, T + 'products while its job runs: no new read');
      C.q.jobs = []; C.V.emit('products', {}); await H.flush();
      ok(C.calls.length === n0 + 1, T + 'products after the job: read once more', C.calls.slice(n0)); }
    // ---- docBusy: no read ----
    { const D = start({ q: { target, docBusy: true }, answer: () => Promise.resolve(clone(env)) });
      D.V.emit('map', {}); await H.flush();
      ok(D.calls.length === 0 && H.blk(D.boxes.objects, 'mv.objects.status').has(en('mapviz.objects.waitDoc')), T + 'document being read: no read, the wait line');
      D.q.docBusy = false; D.V.emit('doc', {}); await H.flush();
      ok(D.calls.length === 1 && D.S0.ready(), T + 'after the document: one read'); }
    // ---- seeded defects ----
    { const bad = clone(F.items.slice(0, 4));
      bad[0].fp.kind = 'oval'; delete bad[1].uid;
      const E2 = start({ q: { target }, answer: () => Promise.resolve(vecEnv(bad, { target })) });
      E2.V.emit('map', {}); await H.flush();
      ok(E2.S0.items.length === 2 && E2.S0.bad === 2, T + 'seeded: an unknown footprint kind and a missing uid are left out', { n: E2.S0.items.length, bad: E2.S0.bad });
      ok(E2.boxes.objects.has(en('mapviz.objects.bad').replace('{n}', 2)), T + 'seeded: the panel says 2 could not be read', E2.boxes.objects.textContent);
      ok(E2.draw({ kind: 'vector', name: 'objects', pal: 'objects' }).err === en('mapviz.objects.na'), T + 'seeded: a vector without items is not available');
      ok(E2.draw(vecEnv(F.items, { pal: 'water.bands' })).err === en('mapviz.objects.na'), T + 'seeded: another pal is not available');
      ok(E2.draw({ kind: 'grid', name: 'objects' }).err === en('mapviz.objects.na'), T + 'seeded: a grid envelope is not available');
      const g = E2.draw(null);
      ok(!g.err && ops(g.log, 'stroke').length === 2, T + 'no envelope: the store items still draw', g);
      const F2 = start({ q: { target }, answer: () => Promise.reject(Object.assign(new Error('MV_FAULT'), { status: 500, key: 'mapviz.err.MV_FAULT', params: { msg: 'broken' } })) });
      F2.V.emit('map', {}); await H.flush();
      ok(F2.S0.state === 'error' && F2.boxes.objects.has('broken'), T + 'seeded: a fault shows its words', F2.boxes.objects.textContent);
      // a failed read: the DOM list does not ask again (no loop); the next map, products or refresh asks once
      { let n = 0; const R3 = start({ q: { target }, answer: () => (++n === 1 ? Promise.reject(Object.assign(new Error('busy'), { status: 500, key: 'mapviz.err.MV_FAULT', params: { msg: 'busy' } })) : Promise.resolve(clone(env))) });
        R3.V.emit('map', {}); await H.flush();
        const l3 = R3.layers[0]; l3.list(); l3.list(); await H.flush();
        ok(R3.S0.state === 'error' && n === 1, T + 'failed read: the list asks no more', { state: R3.S0.state, n });
        R3.V.emit('map', {}); await H.flush();
        ok(R3.S0.ready() && n === 2, T + 'failed read: the next map event asks once and is ready', { state: R3.S0.state, n });
        for (const ev of ['products', 'refresh']) {
          let m = 0; const R4 = start({ q: { target }, answer: () => (++m === 1 ? Promise.reject(new Error('busy')) : Promise.resolve(clone(env))) });
          R4.V.emit('map', {}); await H.flush(); R4.V.emit(ev, {}); await H.flush();
          ok(R4.S0.ready() && m === 2, T + 'failed read: a ' + ev + ' event asks once and is ready', { state: R4.S0.state, m }); } }
      const G = start({ q: { target }, answer: () => Promise.reject(Object.assign(new Error('stale'), { stale: true })) });
      G.V.emit('map', {}); await H.flush();
      ok(G.S0.state === 'none' && !G.boxes.objects.has('stale'), T + 'a stale read is silent'); }
  }
  if (fixture('as2').real) ok(fixture('as2').items.length === 13 && fixture('goh').items.length === 13, 'both fixture forms give the same 13 objects (8 objects, 5 map points)');

  // ---- no palette objects key: lines in marks.cursor, no fill ----
  { const pal = clone(PAL); delete pal.objects;
    const A = start({ pal, answer: () => Promise.resolve(vecEnv(PLANTED, { pal: null, palette: null })) });
    A.V.emit('map', {}); await H.flush();
    const d = A.draw(vecEnv(PLANTED, { pal: null, palette: null })), cur = A.MV.kit.colourCss(PAL.marks.cursor);
    ok(!d.err && ops(d.log, 'stroke').every(x => x.strokeStyle === cur) && ops(d.log, 'fill').filter(x => x.fillStyle && x.fillStyle !== cur).length === 0, 'no objects palette: lines in the cursor colour, no fill', d.err);
    const lg = A.layers[0].legend();
    ok(lg[0].label === en('mapviz.objects.legAll') && lg[0].color === PAL.marks.cursor, 'no objects palette: one outline legend row', lg); }

  // ---- on the shell ----
  { const calls = [], F = fixture('as2');
    const routes = {
      'GET /api/x/mapviz/palette': async () => PAL,
      'GET /api/x/mapviz/cache': async () => ({ v: 1, root: '<cache>', bytes: 0, cap: 1, entries: 0, jobs: 0 }),
      'GET /api/x/mapviz/doc': async () => ({ v: 1, key: 'multi/mv_fixture', target: 'mowas2', size: [1024, 1024], bounds: [-512, -512, 512, 512], modes: [{ id: 'battle_zones' }], entities: [], areas: [], files: {} }),
      'GET /api/x/mapviz/layer': async u => { if (u.searchParams.get('name') === 'objects') return vecEnv(F.items);
        throw Object.assign(new Error('MV_NOT_FOUND'), { status: 404, key: 'mapviz.err.MV_NOT_FOUND', params: { msg: 'not made', need: { what: 'x', args: {} } } }); },
    };
    const S = { gameId: 'mowas2', gameOv: '<game>', mod: '', mapKey: 'map/multi/mv_fixture' };
    const P = H.mkPage({ scripts: [SHELL, PART], lang: L, S, canvas: true, api: H.routeApi(routes, calls) });
    P.screen.refresh(); await H.flush(60); P.V.redraw(); await H.flush(30);
    ok(calls.some(c => c.path === '/api/x/mapviz/layer' && /name=objects/.test(c.url)), 'shell: the objects layer is read', calls.map(c => c.url));
    ok(calls.every(c => c.method === 'GET') && !calls.some(c => /job/.test(c.path)), 'shell: GET only, no job without a user action');
    ok(!P.root.has(L.en['mapviz.shell.badLayer'].replace('{msg}', en('mapviz.objects.na'))), 'shell: the objects layer draws');
    const C3 = [], P3 = H.mkPage({ scripts: [SHELL, PART], lang: L, S: Object.assign({}, S), canvas: true, rmt: true, api: H.routeApi(routes, C3) });
    let err = null; try { P3.screen && P3.screen.refresh && P3.screen.refresh(); await H.flush(10); } catch (e) { err = e.message; }
    ok(!err && C3.length === 0, 'shell on RMT: no mapviz call', C3); }

  // ---- language ----
  { const SRC = String(PART), used = new Set(), codes = ['en', 'ru', 'uk', 'zh'];
    for (const m of SRC.matchAll(/'(mapviz\.objects\.[A-Za-z0-9_.]*[A-Za-z0-9_])'/g)) used.add(m[1]);
    used.delete('mapviz.objects.cat.');
    for (const c of ['building', 'building_part', 'wall', 'fence', 'emplacement', 'tree', 'bush', 'rock', 'wreck', 'bridge', 'water_surface', 'ground_decal', 'road_decal', 'crater', 'service', 'placed_unit', 'other']) used.add('mapviz.objects.cat.' + c);
    ok(Object.keys(LO).sort().join() === codes.slice().sort().join(), 'lang: exactly en, ru, uk, zh');
    const miss = []; for (const k of used) for (const c of codes) if (!(LO[c] && LO[c][k])) miss.push(c + ' ' + k);
    ok(!miss.length, 'lang: every key used is in all four languages (' + used.size + ')', miss.join(', '));
    const unused = Object.keys(LO.en).filter(k => !used.has(k) && !(/\.1$/.test(k) && used.has(k.slice(0, -2))));
    ok(!unused.length, 'lang: every key in the file is used', unused.join(', '));
    const slots = s => (String(s).match(/\{\w+\}/g) || []).sort().join();
    const bad = []; for (const c of codes) for (const k of Object.keys(LO[c])) { const v = LO[c][k];
      if (/^TODO:/.test(v) || v.indexOf(String.fromCharCode(8212)) >= 0 || / - /.test(v)) bad.push(c + ' ' + k); if (k !== 'mapviz.objects.count.1' && slots(v) !== slots(LO.en[k])) bad.push(c + ' ' + k + ' slots'); if (!(k in LO.en)) bad.push(c + ' extra ' + k); }
    ok(!bad.length, 'lang: same slots, no TODO, no dash separator', bad.join(', '));
    const zh = start({ code: 'zh' });
    ok(zh.boxes.objects.has(LO.zh['mapviz.objects.title']) && zh.boxes.objects.has(LO.zh['mapviz.objects.cat.wall']), 'lang: the panel speaks Chinese'); }
  { const SRC = String(PART);
    ok(!/#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/.test(SRC), 'no colour literal in the part');
    ok(!/`|\$\{|innerHTML|=>|\blet\b|\bconst\b/.test(SRC), 'ES5 template: no backtick, no dollar brace, no innerHTML, no arrow, no let or const');
    ok(!/(^|[^\w])[A-Za-z]:[\\/][^\\/]/.test(SRC), 'no drive path in the part'); }

  if (failN) { console.log('FAIL mapviz objects: ' + failN + ' failed, ' + pass + ' passed'); process.exit(1); }
  console.log('PASS mapviz objects (' + pass + ')');
})().catch(e => { console.log('FAIL mapviz objects: ' + (e && e.stack || e)); process.exit(1); });

// Map Viewer water layers test (MV-PG1): node tools/gui/ext/mapviz/sub/water.test.js [scratch dir]
// The water part on a stub V that records addLayer and draw calls, in the fake DOM, with the products of the real water
// rules on the fixture map (tools/mapviz/test/fxmake.js, ARSENAL_CACHE inside the scratch dir; skipped with a message
// when the rules are not built): layers, groups, engineTrue, the checks group off by default; the pond cells of
// tools/mapviz/README.md 10.4 in the off-screen picture; drowning follows the unit kind and the class picker; the drown
// mask read only through meta.bits (a planted class in another bit order draws the same cells); labels from data with
// language keys; legend text of design 5.1 (vanilla values only where the data says so, direct control); seeded defects:
// an unknown pal, a wrong size, a missing envelope, a vector without items (not available, the others still draw);
// RMT; the part on the shell; the language file both ways; no colour literal.
// Author: Imperator_Aug (ARSENAL, ia-03879747)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const SCR = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'mv-water-')));
fs.mkdirSync(SCR, { recursive: true });
process.env.ARSENAL_CACHE = path.join(SCR, 'cache');
const { harness: H } = require('./shell.test');
const fake = require('../../../test/fakedom');
const SHELL = require('./shell.client'), PART = require('./water.client');
const LW = require('./water.lang.json'), L = H.mergeLang([require('./shell.lang.json'), LW]);
const ROOT = path.resolve(__dirname, '../../../../mapviz');
const PAL = require(path.join(ROOT, 'palette.json'));
const FXA = require(path.join(ROOT, 'test/fxanswers.json'));
let pass = 0, failN = 0;
const ok = (c, what, extra) => { if (c) pass++; else { failN++; console.log('FAIL mapviz water: ' + what + (extra !== undefined ? '\n  ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 600) : '')); } };
const en = k => L.en[k];
const clone = x => JSON.parse(JSON.stringify(x));
const opt = (fn, what) => { try { return fn(); } catch (e) { if (e && e.code === 'MODULE_NOT_FOUND') { console.log('skip: ' + what + ' is not built'); return null; } throw e; } };

// ---------- the part on a stub V ----------
function load(o) {
  o = o || {};
  const doc = fake.make(), log = [];
  let ids = 0;
  const make = doc.createElement;
  doc.createElement = t => { const e = make(t); if (String(t).toLowerCase() === 'canvas') { e._id = 'off' + (ids++); if (o.canvas !== false) e.getContext = k => (k === '2d' ? (e._ctx = e._ctx || H.stubCtx(log, e)) : null); } return e; };
  const X = {};
  const fn = new Function('EXT_SCREENS', 'h', 'tx', 'api', 'S', 'RMT', 'cssv', 'onTheme', 'document', 'window', 'setTimeout', 'Image', 'gohDir', 'navigator', [SHELL, PART].join('\n'));
  fn(X, H.hOf(doc), H.txOf(L, o.code || 'en'), () => Promise.reject(new Error('no api in a part test')), {}, false, (n, d) => d || '', () => () => {}, doc,
    { requestAnimationFrame: f => f() }, (f, ms) => setTimeout(f, 2), H.ImageStub, () => '', undefined);
  return { X, doc, log, part: X.mapviz.parts.find(p => p.id === 'water') };
}
function recCtx(log) {
  const c = H.stubCtx(log, { _id: 'main' });
  for (const m of ['fillText', 'strokeText', 'closePath', 'rect', 'translate', 'rotate'])
    c[m] = function () { log.push({ op: m, args: [].slice.call(arguments), cv: 'main', fillStyle: c.fillStyle, strokeStyle: c.strokeStyle }); };
  return c;
}
function mkView(env, o) {
  o = o || {};
  const v = { cx: o.cx || 0, cy: o.cy || 0, zoom: o.zoom || 0.5, w: 800, h: 600, env: env || null, pal: PAL, token: n => 'var-' + n };
  v.toScreen = (x, y) => [v.w / 2 + (x - v.cx) * v.zoom, v.h / 2 - (y - v.cy) * v.zoom];
  v.toWorld = (px, py) => [v.cx + (px - v.w / 2) / v.zoom, v.cy - (py - v.h / 2) / v.zoom];
  return v;
}
function stubV(L0, o) {
  o = o || {};
  const rec = { layers: [], panels: [], on: {}, calls: [], draws: [], redraws: 0, boxes: {} };
  const q = Object.assign({ target: 'mowas2', map: 'multi/mv_fixture', mode: 'battle_zones', side: 'both', kind: 'tank', rmt: false, game: '<game>' }, o.q || {});
  const V = {
    q: n => q[n], doc: clone(FXA.as2.doc.a), pal: o.pal === undefined ? PAL : o.pal,
    addLayer(l) { rec.layers.push(l); return true; },
    addPanel(p) { rec.panels.push(p); const box = L0.doc.createElement('div'); rec.boxes[p.id] = box; p.build(box, V); },
    on(e, f) { (rec.on[e] = rec.on[e] || []).push(f); }, emit(e, d) { (rec.on[e] || []).forEach(f => f(d)); },
    redraw() { rec.redraws++; }, token: n => 'var-' + n, say() {}, addTool() {}, addHover() {},
    api(m, p, b) { rec.calls.push({ m, p, b }); return Promise.reject(new Error('no route')); },
    job(w, a) { rec.calls.push({ job: w, a }); return Promise.reject(new Error('no job')); },
  };
  rec.V = V; rec.q = q;
  rec.draw = (id, env, view) => {
    const l = rec.layers.find(x => x.id === id), log = [];
    if (!l) return { log, err: 'missing layer ' + id, puts: [] };
    const n0 = L0.log.length;
    let err = null;
    try { l.draw(recCtx(log), view || mkView(env)); } catch (e) { err = e.message; }
    const puts = L0.log.slice(n0).filter(x => x.op === 'putImageData');
    rec.draws.push({ id, n: log.length, err });
    return { log, err, puts };
  };
  return rec;
}
function start(o) { const L0 = load(o); const R = stubV(L0, o); L0.part.init(R.V); return Object.assign(R, { L0 }); }
const ops = (log, op) => log.filter(x => x.op === op);
// a grid envelope as the layer route sends it (shell.server.js gridEnvelope), from an in-memory grid
const PALS = { 'water.band': 'water.bands', 'water.drown': 'water.drown', 'water.labels': 'water.label', 'water.checks': 'water.check' };
const palPart = p => { if (!p) return null; let v = PAL; for (const k of p.split('.')) v = v && v[k]; return v === undefined ? null : v; };
function gridEnv(g) {
  const pal = PALS[g.name] || null;
  return { v: 1, kind: 'grid', name: g.name, map: 'multi/mv_fixture', target: 'mowas2', w: g.w, h: g.h, cell: g.cell, ox: g.ox, oy: g.oy, etype: g.etype, sample: g.sample,
    scale: g.scale, offset: g.offset, nodata: g.nodata, meta: clone(g.meta), data: Buffer.from(g.data.buffer, g.data.byteOffset, g.data.byteLength).toString('base64'), pal, palette: palPart(pal) };
}
const vecEnv = (name, items) => ({ v: 1, kind: 'vector', name, map: 'multi/mv_fixture', target: 'mowas2', items: clone(items), pal: PALS[name], palette: palPart(PALS[name]) });
// the pixel of cell (i, j) in the off-screen picture (row 0 = min y at the bottom)
function px(put, i, j) { const img = put.args[0], o = ((img.height - 1 - j) * img.width + i) * 4; return [img.data[o], img.data[o + 1], img.data[o + 2], img.data[o + 3]]; }
const hexRgba = hx => { const m = /^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/.exec(hx); const v = parseInt(m[1], 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255, m[2] ? parseInt(m[2], 16) : 255]; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---------- the real water rules on the fixture ----------
function realWater() {
  const Wt = opt(() => require(path.join(ROOT, 'rules/water')), 'the water rules (MV-WAT)');
  const K = Wt && opt(() => require(path.join(ROOT, 'lib/mapkit')), 'mapkit');
  const fx = Wt && opt(() => require(path.join(ROOT, 'test/fxmake')), 'the fixture maker');
  if (!Wt || !K || !fx) return null;
  const f = fx.make(path.join(SCR, 'fx-as2'), { form: 'as2' });
  const src = K.source({ target: f.target, game: f.gameDir });
  const doc = K.doc(src, f.map, {}), g = K.grids(src, f.map, {}), prof = Wt.profile(src);
  const mk = Wt.masks(doc, g, prof);
  return { Wt, mk, prof, labels: Wt.labels(doc, mk, prof), checks: Wt.checks(doc, g, mk) };
}

(async () => {
  // ---- RMT ----
  { const L0 = load(), R = stubV(L0, { q: { rmt: true } }); L0.part.init(R.V);
    ok(R.layers.length === 0 && R.panels.length === 0 && R.calls.length === 0, 'RMT: no layer, no panel, no call'); }

  // ---- layers, groups, engineTrue ----
  const A = start();
  { const by = Object.fromEntries(A.layers.map(l => [l.id, l]));
    ok(same(A.layers.map(l => l.id), ['water.band', 'water.drown', 'water.depth', 'water.labels', 'water.checks']), 'five layers', A.layers.map(l => l.id));
    ok(['water.band', 'water.drown', 'water.depth', 'water.labels'].every(id => by[id].group === 'water' && by[id].engineTrue === true), 'water layers: group water, engine true');
    ok(by['water.checks'].group === 'checks' && by['water.checks'].engineTrue === false && by['water.checks'].defaultOn === false, 'water checks: group checks, not engine true, off by default');
    ok(by['water.band'].defaultOn === true && by['water.drown'].defaultOn === true && by['water.labels'].defaultOn === true && by['water.depth'].defaultOn === false, 'bands, drown and labels on, depth off by default');
    ok(A.layers.every(l => l.source === l.id && /^mapviz\.water\./.test(l.label)), 'each layer reads its own product; labels are language keys');
    ok(typeof by['water.labels'].list === 'function' && typeof by['water.checks'].list === 'function', 'labels and checks repeat in the DOM list');
    ok(A.calls.length === 0, 'building makes no call'); }

  // ---- the fixture band grid of fxanswers.json (README 10.4 pond) ----
  { const env = clone(FXA.as2.layer['water.band'].a); env.pal = 'water.bands'; env.palette = PAL.water.bands;
    const { err, puts } = A.draw('water.band', env);
    ok(!err && puts.length === 1, 'band grid drawn through one off-screen picture', err);
    if (puts[0]) {
      ok(same(px(puts[0], 94, 28), hexRgba(PAL.water.bands[2].fill)) && same(px(puts[0], 101, 28), hexRgba(PAL.water.bands[2].fill)), 'cells (94,28), (101,28): swim colour');
      ok(same(px(puts[0], 107, 28), hexRgba(PAL.water.bands[1].fill)), 'cell (107,28): no prone colour', px(puts[0], 107, 28));
      ok(px(puts[0], 111, 28)[3] === 0 && px(puts[0], 10, 10)[3] === 0, 'cell (111,28) and dry land: nothing drawn'); } }

  const RW = realWater();
  if (RW) {
    const { mk, prof } = RW, bits = mk.drown.meta.bits;
    const drownAt = (i, j) => bits.filter((b, k) => (mk.drown.data[j * mk.drown.w + i] >>> k) & 1);
    const DROWN = hexRgba(PAL.water.drown.fill);
    const hasAt = (put, i, j) => same(px(put, i, j), DROWN);
    // drowning follows the unit kind
    { const B = start({ q: { kind: 'tank' } }), env = gridEnv(mk.drown);
      const { err, puts } = B.draw('water.drown', env);
      ok(!err && puts.length === 1, 'drown grid drawn for tanks', err);
      const tanks = ['tank_light', 'tank_medium', 'tank_heavy'];
      const want = (i, j) => drownAt(i, j).some(c => tanks.includes(c));
      const cells = [[94, 28], [101, 28], [104, 28], [107, 28], [111, 28], [10, 10]];
      ok(puts[0] && cells.every(([i, j]) => hasAt(puts[0], i, j) === want(i, j)), 'tank: drown cells of README 10.4 (light tank drowns at 1.5 m, medium and heavy do not)', cells.map(([i, j]) => [i, j, drownAt(i, j).join('+'), puts[0] && px(puts[0], i, j)]));
      ok(hasAt(puts[0], 104, 28) && drownAt(104, 28).indexOf('tank_medium') < 0, 'cell (104,28): only the 1.2 m classes drown, the light tank among them');
      B.q.kind = 'inf'; const inf = B.draw('water.drown', env);
      ok(!inf.err && inf.puts.length === 0 && ops(inf.log, 'drawImage').length === 0, 'infantry: no drown cells drawn');
      ok(B.boxes.water.has(en('mapviz.water.noDrownKind')) || (B.V.emit('map', {}), B.boxes.water.has(en('mapviz.water.noDrownKind'))), 'infantry: the panel says this kind does not drown');
      // the class picker overrides the kind
      const sel = B.boxes.water.all().find(e => e.tagName === 'SELECT');
      ok(sel && sel.children.map(o => o.attrs.value).join() === ',' + bits.join(','), 'class picker: by kind, then the classes of meta.bits', sel && sel.children.map(o => o.attrs.value));
      sel.value = 'tank_heavy'; sel.fire('change');
      const hv = B.draw('water.drown', env);
      ok(hv.puts[0] && hasAt(hv.puts[0], 94, 28) && !hasAt(hv.puts[0], 104, 28), 'class picker: heavy tank drowns in the deep ring only');
      ok(B.boxes.water.has('Heavy tank drowns in water deeper than 1.8 m.'), 'panel: the depth of the picked class from meta.depthM', B.boxes.water.textContent);
      ok(B.redraws > 0, 'picking a class redraws'); }
    // the bit mask through meta.bits: a planted class and another bit order draw the same cells
    { const g = mk.drown, nb = ['airborne'].concat(bits.slice().reverse()), out = new Uint32Array(g.data.length);
      for (let s = 0; s < g.data.length; s++) { let v = 0; bits.forEach((b, k) => { if ((g.data[s] >>> k) & 1) v |= 1 << nb.indexOf(b); }); if (s === 28 * g.w + 111) v |= 1; out[s] = v >>> 0; }
      const g2 = Object.assign({}, g, { data: out, meta: Object.assign({}, g.meta, { bits: nb, depthM: [0.5].concat(g.meta.depthM.slice().reverse()) }) });
      const B1 = start({ q: { kind: 'tank' } }), B2 = start({ q: { kind: 'tank' } });
      const p1 = B1.draw('water.drown', gridEnv(g)).puts[0], p2 = B2.draw('water.drown', gridEnv(g2)).puts[0];
      ok(p1 && p2 && same(Array.from(p1.args[0].data), Array.from(p2.args[0].data)), 'meta.bits: the same tank cells in another bit order with a planted class');
      const sel = B2.boxes.water.all().find(e => e.tagName === 'SELECT');
      ok(sel.children.some(o => o.attrs.value === 'airborne'), 'the planted class is offered by the picker');
      sel.value = 'airborne'; sel.fire('change');
      const pa = B2.draw('water.drown', gridEnv(g2)).puts[0];
      ok(pa && hasAt(pa, 111, 28) && !hasAt(pa, 94, 28), 'the planted class draws only its own bit', pa && [px(pa, 111, 28), px(pa, 94, 28)]); }
    // depth
    { const { err, puts } = A.draw('water.depth', gridEnv(mk.depth));
      ok(!err && puts[0] && px(puts[0], 94, 28)[3] > 0 && px(puts[0], 104, 28)[3] > 0 && px(puts[0], 111, 28)[3] === 0, 'depth: wet cells coloured, the painted ring and dry land not', err);
      ok(puts[0] && !same(px(puts[0], 94, 28), px(puts[0], 104, 28)), 'depth: 9 m and 1.5 m differ'); }
    // labels from data with language keys
    { const env = vecEnv('water.labels', RW.labels);
      A.draw('water.drown', gridEnv(mk.drown));   // the drown meta (bits) is known to the part once drawn
      const { log, err } = A.draw('water.labels', env), t = ops(log, 'fillText').map(x => x.args[0]);
      ok(!err && t.indexOf('Infantry swim, 1.5 to 9 m, 109 m2') >= 0 && t.indexOf('No prone, 0.4 to 0.4 m, 89 m2') >= 0, 'labels: band, depth range and area from the label items', t);
      ok(t.indexOf(en('mapviz.water.allDrown')) >= 0, 'labels: every class of meta.bits drowns in the swim region', t);
      const s = ops(log, 'fillText').find(x => x.args[0].indexOf('Infantry swim') === 0), at = mkView(null).toScreen(305, -195);
      ok(s && Math.abs(s.args[1] - at[0]) < 1e-6 && Math.abs(s.args[2] - at[1]) < 13, 'the swim label at its region anchor', s && s.args);
      ok(ops(log, 'strokeText').length === t.length, 'labels have a halo');
      const li = A.layers.find(l => l.id === 'water.labels').list();
      ok(li.length === 2 && li[0].label === 'No prone, 0.4 to 0.4 m, 89 m2' && li[1].x === 305, 'the DOM list repeats the labels', li);
      const part = vecEnv('water.labels', [Object.assign({}, RW.labels[1], { drown: ['car', 'tank_light'], merged: [1] })]);
      const t2 = ops(A.draw('water.labels', part).log, 'fillText').map(x => x.args[0]);
      ok(t2.indexOf('Drowns: Car, Light tank') >= 0 && t2.indexOf(en('mapviz.water.labelMerged')) >= 0, 'labels: class names from language keys, the merged no prone edge', t2); }
    // checks
    { const env = vecEnv('water.checks', RW.checks), { log, err } = A.draw('water.checks', env);
      ok(!err && ops(log, 'strokeRect').length === 3 && ops(log, 'arc').length === 3, 'checks: a box and a marker each', err);
      const r = ops(log, 'strokeRect')[2].args, v = mkView(null), a = v.toScreen(130, -20);
      ok(Math.abs(r[0] - a[0]) < 1e-6 && Math.abs(r[1] - a[1]) < 1e-6 && Math.abs(r[2] - 175) < 1e-6, 'PAINTED_ABOVE_LEVEL box at [130,-370,480,-20]', r);
      const li = A.layers.find(l => l.id === 'water.checks').list();
      ok(li.length === 3 && li[2].label === 'Water painted above the water level: it loads as dry ground, 53 m2' && li[0].label.indexOf('(Medium tank)') > 0, 'checks listed with code words, area and class', li); }
    // vanilla values only where the data says so
    { const C = start({ q: { kind: 'tank' } }), lg = () => C.layers.find(l => l.id === 'water.drown').legend(C.V).map(r => r.label);
      // planted: the real drown meta with its source fields taken out (the rules may give meta.sources)
      const bare = Object.assign({}, mk.drown, { meta: Object.assign({}, mk.drown.meta) }); delete bare.meta.sources; delete bare.meta.source;
      C.draw('water.drown', gridEnv(bare));
      ok(lg().indexOf(en('mapviz.water.vanilla')) < 0 && lg().indexOf(en('mapviz.water.direct')) >= 0, 'legend: no vanilla line without a source in the data; the direct control note always', lg());
      ok(lg().indexOf(en('mapviz.water.noRoute')) >= 0 && C.boxes.water.has(en('mapviz.water.noRoute')), 'legend: vanilla tank depths (1.2 m and more): routes never enter the drown cells', lg());
      const sh = Object.assign({}, mk.drown, { meta: Object.assign({}, mk.drown.meta, { depthM: mk.drown.meta.depthM.map((d, k) => (mk.drown.meta.bits[k] === 'tank_light' ? 0.5 : d)) }) });
      const C2 = start({ q: { kind: 'tank' } }); C2.draw('water.drown', gridEnv(sh));
      const lg2 = C2.layers.find(l => l.id === 'water.drown').legend(C2.V).map(r => r.label);
      ok(lg2.indexOf(en('mapviz.water.noRoute')) < 0 && lg2.indexOf(en('mapviz.water.direct')) >= 0 && !C2.boxes.water.has(en('mapviz.water.noRoute')), 'legend: a mod depth under 0.7 m drops the routes line (type 3 drowns), keeps the direct control note', lg2);
      ok(!C.boxes.water.has('is a vanilla value'), 'panel: no vanilla line without a source');
      ok(prof.classes.every(c => c.source === 'vanilla'), 'the fixture profile is vanilla (README 10.2: no interaction files)');
      const g = Object.assign({}, mk.drown, { meta: Object.assign({}, mk.drown.meta, { source: 'vanilla' }) });
      C.draw('water.drown', gridEnv(g));
      ok(lg().indexOf(en('mapviz.water.vanilla')) >= 0, 'legend: vanilla values when the drown meta says vanilla', lg());
      ok(C.boxes.water.has('The depth for Light tank is a vanilla value.') && C.boxes.water.has(en('mapviz.water.direct')), 'panel: per class vanilla line and the direct control note', C.boxes.water.textContent);
      ok(C.boxes.water.has('Amphibious vehicle does not drown.'), 'panel: a class without a depth does not drown');
      if (Array.isArray(mk.drown.meta.sources)) {
        const C3 = start({ q: { kind: 'tank' } }); C3.draw('water.drown', gridEnv(mk.drown));
        ok(C3.layers.find(l => l.id === 'water.drown').legend(C3.V).map(r => r.label).indexOf(en('mapviz.water.vanilla')) >= 0 && C3.boxes.water.has('The depth for Light tank is a vanilla value.'), 'the real rules give meta.sources (vanilla on the fixture): the legend and the panel say vanilla values', mk.drown.meta.sources);
      } else console.log('skip: the water rules give no meta.sources yet'); }
  }

  // ---- unit kinds: MG is the two GoH machine gun classes, AT the unlinked gun; MG on AS2 does not drown ----
  { const g = { name: 'water.drown', w: 4, h: 1, cell: 20, ox: 0, oy: 0, etype: 'u32', sample: 'cell', scale: 1, offset: 0, nodata: null,
      meta: { bits: ['gun_unlinked', 'gun_goh_a', 'gun_goh_b'], depthM: [1.3, 1.3, 1.0] }, data: new Uint32Array([1, 2, 4, 0]) };
    const DR = hexRgba(PAL.water.drown.fill), on = (put, i) => !!put && same(px(put, i, 0), DR);
    const M = start({ q: { kind: 'mg', target: 'goh' } }), pm = M.draw('water.drown', gridEnv(g)).puts[0];
    ok(pm && !on(pm, 0) && on(pm, 1) && on(pm, 2) && !on(pm, 3), 'GoH MG kind: the wheeled and the carried machine gun cells', pm && [0, 1, 2, 3].map(i => px(pm, i, 0)));
    ok(M.boxes.water.has('Machine gun with a carried shield drowns in water deeper than 1 m.'), 'GoH MG kind: the panel names the carried machine gun and its depth', M.boxes.water.textContent);
    const T = start({ q: { kind: 'at', target: 'goh' } }), pt = T.draw('water.drown', gridEnv(g)).puts[0];
    ok(pt && on(pt, 0) && !on(pt, 1) && !on(pt, 2), 'AT kind: the unlinked gun only', pt && [0, 1, 2].map(i => px(pt, i, 0)));
    const A2 = start({ q: { kind: 'mg' } });
    ok(A2.boxes.water.has(en('mapviz.water.noDrownKind')), 'AS2 MG kind: no GoH class, the panel says this kind does not drown', A2.boxes.water.textContent); }

  // ---- the DOM lists follow the mode: a mode change drops the old items ----
  { const W = start(), lab = n => vecEnv('water.labels', [{ kind: 'waterLabel', band: 2, x: 305, y: -195, area: n, depthMin: 1.5, depthMax: 9, drown: [], merged: [] }]);
    const li = () => W.layers.find(l => l.id === 'water.labels').list().map(x => x.label);
    W.draw('water.labels', lab(109));
    ok(li().join() === 'Infantry swim, 1.5 to 9 m, 109 m2', 'list: the drawn labels', li());
    W.q.mode = 'combat'; W.V.emit('map', { key: 'multi/mv_fixture', mode: 'combat' });
    const n0 = W.calls.length, gone = li();
    ok(gone.length === 0 && W.calls.slice(n0).some(c => c.p === 'layer' && c.b && c.b.name === 'water.labels'), 'list: after a mode change the old labels are gone and the part asks for the new ones', { gone, calls: W.calls.slice(n0) });
    W.draw('water.labels', lab(77));
    ok(li().join() === 'Infantry swim, 1.5 to 9 m, 77 m2', 'list: the labels of the new mode', li());
    W.q.mode = 'battle_zones'; W.V.emit('map', {});
    ok(li().length === 0, 'list: back to the first mode, nothing stale until its labels come again'); }

  // ---- legends: what each band means (design 5.1) ----
  { const lb = A.layers.find(l => l.id === 'water.band').legend(A.V);
    ok(lb.length === 2 && lb[0].color === PAL.water.bands[1].fill && lb[0].label === en('mapviz.water.legNoProne') && lb[1].label === en('mapviz.water.legSwim'), 'band legend: no prone and swim with their colours', lb);
    const ld = A.layers.find(l => l.id === 'water.drown').legend(A.V);
    ok(ld[0].color === PAL.water.drown.fill && ld.some(r => r.label === en('mapviz.water.direct')),'drown legend: colour, classes, direct control note', ld);
    ok(A.layers.find(l => l.id === 'water.checks').legend(A.V)[0].color === PAL.water.check.fill, 'checks legend colour from the palette'); }

  // ---- seeded defects: not available, the others still draw ----
  { const D = start(), band = clone(FXA.as2.layer['water.band'].a); band.pal = 'water.bands'; band.palette = PAL.water.bands;
    const unk = Object.assign(clone(band), { pal: 'no.such.pal' });
    const r1 = D.draw('water.band', unk);
    ok(r1.err === en('mapviz.water.na') && r1.puts.length === 0, 'seeded: an envelope with an unknown pal is not available', r1.err);
    const small = Object.assign(clone(band), { w: 64 });
    ok(D.draw('water.band', small).err === en('mapviz.water.na'), 'seeded: a grid of the wrong size is not available');
    ok(D.draw('water.labels', { kind: 'vector', name: 'water.labels', pal: 'water.label' }).err === en('mapviz.water.na'), 'seeded: a label envelope without items is not available');
    ok(D.draw('water.drown', Object.assign(clone(band), { name: 'water.drown', pal: 'water.drown', palette: PAL.water.drown, meta: {} })).err === en('mapviz.water.na'), 'seeded: a drown grid without meta.bits is not available');
    const none = D.layers.map(l => D.draw(l.id, null));
    ok(none.every(r => !r.err && r.log.length === 0), 'seeded: a missing envelope (not made yet) draws nothing and throws nothing');
    const good = D.draw('water.band', band), lab = D.draw('water.labels', vecEnv('water.labels', [{ kind: 'waterLabel', band: 1, x: 0, y: 0, area: 4, depthMin: 0.1, depthMax: 0.2, drown: [], merged: [] }]));
    ok(!good.err && good.puts.length === 1 && !lab.err && ops(lab.log, 'fillText').length === 1, 'seeded: after the faults the other layers still draw');
    const noPal = start({ pal: null });
    ok(noPal.draw('water.band', Object.assign(clone(FXA.as2.layer['water.band'].a), { pal: 'water.bands', palette: null })).err === en('mapviz.water.na') && noPal.layers.every(l => !l.legend || l.legend(noPal.V) === null), 'seeded: no palette at all, not available and no legend'); }
  // no off-screen canvas: grid layers are not available, vector ones still draw, nothing throws past the layer
  { const L0 = load({ canvas: false }), R = stubV(L0, {}); L0.part.init(R.V);
    const band = clone(FXA.as2.layer['water.band'].a); band.pal = 'water.bands';
    ok(R.draw('water.band', band).err === en('mapviz.water.na'), 'no off-screen canvas: the grid layer says not available');
    let err = null; try { R.layers.forEach(l => l.draw({}, mkView(l.id === 'water.labels' ? vecEnv('water.labels', []) : null))); } catch (e) { err = e.message; }
    ok(!err, 'a context without 2D methods throws nothing', err); }

  // ---- on the shell: the unknown pal shows on the layer row, the band still draws; no canvas; RMT ----
  { const calls = [], band = clone(FXA.as2.layer['water.band'].a);
    band.pal = 'water.bands'; band.palette = PAL.water.bands;
    const routes = {
      'GET /api/x/mapviz/palette': async () => PAL,
      'GET /api/x/mapviz/cache': async () => ({ v: 1, root: '<cache>', bytes: 0, cap: 1, entries: 0, jobs: 0 }),
      'GET /api/x/mapviz/doc': async () => clone(FXA.as2.doc.a),
      'GET /api/x/mapviz/layer': async u => { const n = u.searchParams.get('name');
        if (n === 'water.band') return band;
        if (n === 'water.labels') return Object.assign(vecEnv('water.labels', []), { pal: 'no.such.pal' });
        throw Object.assign(new Error('MV_NOT_FOUND'), { status: 404, key: 'mapviz.err.MV_NOT_FOUND', params: { msg: 'not made', need: { what: 'water', args: {} } } }); },
    };
    const S = { gameId: 'mowas2', gameOv: '<game>', mod: '', mapKey: 'map/multi/mv_fixture' };
    const P = H.mkPage({ scripts: [SHELL, PART], lang: L, S, canvas: true, api: H.routeApi(routes, calls) });
    P.screen.refresh(); await H.flush(60); P.V.redraw(); await H.flush(30);
    ok(P.root.has(L.en['mapviz.shell.badLayer'].replace('{msg}', en('mapviz.water.na'))), 'shell: the labels layer row says it cannot be drawn: not available', P.root.textContent.slice(0, 400));
    ok(P.log.some(x => x.op === 'putImageData') && P.log.some(x => x.op === 'drawImage'), 'shell: the band layer still draws');
    ok(calls.every(c => c.method === 'GET') && !calls.some(c => /job/.test(c.path)), 'shell: GET only, no job without a user action', calls.map(c => c.method + ' ' + c.path));
    ok(!calls.some(c => /name=water\.checks/.test(c.url)), 'shell: the checks layer (off by default) is not fetched');
    const C2 = [], P2 = H.mkPage({ scripts: [SHELL, PART], lang: L, S: Object.assign({}, S), canvas: false, api: H.routeApi(routes, C2) });
    let err = null; try { P2.screen.refresh(); await H.flush(30); } catch (e) { err = e.message; }
    ok(!err && !C2.some(c => /job/.test(c.path)), 'shell without a canvas: builds, no throw, no job', err);
    const C3 = [], P3 = H.mkPage({ scripts: [SHELL, PART], lang: L, S: Object.assign({}, S), canvas: true, rmt: true, api: H.routeApi(routes, C3) });
    try { P3.screen && P3.screen.refresh && P3.screen.refresh(); await H.flush(10); } catch (e) { err = e.message; }
    ok(!err && C3.length === 0, 'shell on RMT: no mapviz call', C3); }
  // ---- on the shell: the DOM list follows a mode change (labels per mode), with and without a canvas ----
  for (const canvas of [true, false]) {
    const calls = [], area = { battle_zones: 109, combat: 77 };
    const routes = {
      'GET /api/x/mapviz/palette': async () => PAL,
      'GET /api/x/mapviz/cache': async () => ({ v: 1, root: '<cache>', bytes: 0, cap: 1, entries: 0, jobs: 0 }),
      'GET /api/x/mapviz/doc': async () => clone(FXA.as2.doc.a),
      'GET /api/x/mapviz/layer': async u => { const n = u.searchParams.get('name'), m = u.searchParams.get('mode');
        if (n === 'water.labels') return vecEnv('water.labels', [{ kind: 'waterLabel', band: 2, x: 305, y: -195, area: area[m] || 1, depthMin: 1.5, depthMax: 9, drown: [], merged: [] }]);
        throw Object.assign(new Error('MV_NOT_FOUND'), { status: 404, key: 'mapviz.err.MV_NOT_FOUND', params: { msg: 'not made', need: { what: 'water', args: {} } } }); },
    };
    const S = { gameId: 'mowas2', gameOv: '<game>', mod: '', mapKey: 'map/multi/mv_fixture' };
    const P = H.mkPage({ scripts: [SHELL, PART], lang: L, S, canvas, api: H.routeApi(routes, calls) });
    P.screen.refresh(); await H.flush(60);
    const items = () => (H.blk(P.root, 'mv.items') || { textContent: '' }).textContent;
    const sel = H.blk(P.root, 'mv.mode').all().find(e => e.tagName === 'SELECT');
    const how = canvas ? 'shell' : 'shell without a canvas (part fetch, then V.relist)';
    ok(sel && P.V.q('mode') === 'battle_zones' && items().indexOf('109 m2') >= 0, how + ': the DOM list shows the labels of battle_zones', items());
    sel.value = 'combat'; sel.fire('change'); await H.flush(60);
    ok(P.V.q('mode') === 'combat' && items().indexOf('77 m2') >= 0 && items().indexOf('109 m2') < 0, how + ': after the mode change the DOM list shows the combat labels only', items());
  }
  // ---- the part asks the shell for its lists again (V.relist) after its own fetch, and after a draw with new items ----
  { const L0 = load(), R = stubV(L0, {}); let rel = 0; R.V.relist = () => { rel++; }; L0.part.init(R.V);
    const item = { kind: 'waterLabel', band: 2, x: 1, y: 2, area: 5, depthMin: 1, depthMax: 2, drown: [], merged: [] };
    R.V.api = () => Promise.resolve(vecEnv('water.labels', [item]));
    const lab = R.layers.find(l => l.id === 'water.labels');
    ok(lab && lab.list().length === 0 && rel === 0, 'the labels list asks for its layer and is empty until it lands');
    for (let i = 0; i < 5; i++) await new Promise(r => setImmediate(r));
    const r1 = rel;
    ok(r1 === 1 && lab.list().length === 1, 'when the part fetch lands it calls V.relist once and the list holds the label', { r1 });
    const env = vecEnv('water.labels', [item, Object.assign({}, item, { x: 9, area: 7 })]);
    R.draw('water.labels', env); const r2 = rel; R.draw('water.labels', env);
    ok(r2 === r1 + 1 && rel === r2 && lab.list().length === 2, 'a draw with new items calls V.relist once; the same items again do not', { r1, r2, rel }); }
  // ---- W1: a list whose layer was not made asks again once after a page job ends ('products'); not before ----
  { const L0 = load(), R = stubV(L0, {}); let rel = 0, asks = 0, made = false; R.V.relist = () => { rel++; }; L0.part.init(R.V);
    const item = { kind: 'waterLabel', band: 2, x: 1, y: 2, area: 5, depthMin: 1, depthMax: 2, drown: [], merged: [] };
    R.V.api = () => { asks++; return made ? Promise.resolve(vecEnv('water.labels', [item])) : Promise.reject(Object.assign(new Error('MV_NOT_FOUND'), { status: 404, params: { need: { what: 'water', args: {} } } })); };
    const lab = R.layers.find(l => l.id === 'water.labels');
    lab.list(); await H.flush(); lab.list(); lab.list(); await H.flush();
    ok(asks === 1 && lab.list().length === 0, 'W1 setup: a labels layer not made is asked once, not on every list', asks);
    made = true; R.V.emit('products', {}); await H.flush();
    ok(rel === 1, 'W1: products: the shell is asked to draw the lists again', rel);
    lab.list(); await H.flush(); await H.flush();
    ok(asks === 2 && lab.list().length === 1, 'W1: the list asked its layer again once and holds the label', asks);
    R.V.emit('products', {}); lab.list(); await H.flush();
    ok(asks === 2, 'W1: an answered list does not ask again on a later products event', asks); }

  // ---- F3: while the document is read (V.q('docBusy')) the list asks nothing; the 'doc' event redraws the lists and the
  // list asks once, with the mode ----
  { const L0 = load(), R = stubV(L0, {}); let rel = 0, asks = [];
    R.V.relist = () => { rel++; }; L0.part.init(R.V);
    const item = { kind: 'waterLabel', band: 2, x: 1, y: 2, area: 5, depthMin: 1, depthMax: 2, drown: [], merged: [] };
    R.V.api = (m, p, b) => { asks.push([p, b && b.name, R.q.mode]); return Promise.resolve(vecEnv('water.labels', [item])); };
    const lab = R.layers.find(l => l.id === 'water.labels');
    R.q.docBusy = true; R.q.mode = null;
    lab.list(); lab.list(); await H.flush();
    ok(asks.length === 0 && lab.list().length === 0, 'F3: document being read: the labels list asks nothing (no fetch with no mode)', asks);
    R.q.docBusy = false; R.q.mode = 'combat'; R.V.emit('doc', { key: 'multi/mv_fixture', ok: true });
    ok(rel === 1, 'F3: the doc event asks the shell to draw the lists again', rel);
    lab.list(); await H.flush(); lab.list(); await H.flush();
    ok(asks.length === 1 && asks[0][2] === 'combat' && lab.list().length === 1, 'F3: then the list asked once, with the mode', asks); }
  // ---- F3 on the shell: a pick whose document comes late: no water.labels fetch before it lands, with or without canvas ----
  for (const canvas of [true, false]) {
    let relDoc = null;
    const calls = [];
    const routes = {
      'GET /api/x/mapviz/palette': async () => PAL,
      'GET /api/x/mapviz/cache': async () => ({ v: 1, root: '<cache>', bytes: 0, cap: 1, entries: 0, jobs: 0 }),
      'GET /api/x/mapviz/doc': () => new Promise(r => { relDoc = () => r(clone(FXA.as2.doc.a)); }),
      'GET /api/x/mapviz/layer': async u => { const n = u.searchParams.get('name');
        if (n === 'water.labels') return vecEnv('water.labels', [{ kind: 'waterLabel', band: 2, x: 305, y: -195, area: 109, depthMin: 1.5, depthMax: 9, drown: [], merged: [] }]);
        throw Object.assign(new Error('MV_NOT_FOUND'), { status: 404, key: 'mapviz.err.MV_NOT_FOUND', params: { msg: 'not made', need: { what: 'water', args: {} } } }); },
    };
    const S = { gameId: 'mowas2', gameOv: '<game>', mod: '', mapKey: '' };
    const P = H.mkPage({ scripts: [SHELL, PART], lang: L, S, canvas, api: H.routeApi(routes, calls) });
    P.screen.refresh(); await H.flush(30);
    P.V.emit('map', { key: 'multi/mv_fixture', pick: true }); await H.until(() => relDoc, 3000); P.V.redraw(); await H.flush(30);
    const how = canvas ? 'shell' : 'shell without a canvas';
    ok(!calls.some(c => c.path === '/api/x/mapviz/layer'), 'F3 ' + how + ': no layer fetch (water.labels) while the document is read', calls.map(c => c.url));
    relDoc(); await H.flush(60); P.V.redraw(); await H.flush(30);
    const lq = calls.filter(c => c.path === '/api/x/mapviz/layer' && /name=water\.labels/.test(c.url)).map(c => new URL(c.url, 'http://x').searchParams.get('mode'));
    ok(lq.length >= 1 && lq.every(m => !!m) && (H.blk(P.root, 'mv.items') || { textContent: '' }).textContent.indexOf('109 m2') >= 0, 'F3 ' + how + ': after the document every water.labels fetch carries the mode and the list fills', lq);
  }

  // ---- language ----
  { const SRC = String(PART), used = new Set(), codes = ['en', 'ru', 'uk', 'zh'];
    for (const m of SRC.matchAll(/'(mapviz\.water\.[A-Za-z0-9_.]*[A-Za-z0-9_])'/g)) used.add(m[1]);
    for (const k of ['BLOCKED_NOT_DEADLY', 'WET_LOOK_DRY_PLAY', 'SWAMP', 'PAINTED_ABOVE_LEVEL']) used.add('mapviz.water.check.' + k);
    for (const k of ['car', 'truck', 'moto', 'armored_car', 'tank_light', 'gun_unlinked', 'tank_medium', 'tank_heavy', 'amphibious', 'gun_goh_a', 'gun_goh_b']) used.add('mapviz.water.cls.' + k);
    ok(Object.keys(LW).sort().join() === codes.slice().sort().join(), 'lang: exactly en, ru, uk, zh');
    const miss = []; for (const k of used) for (const c of codes) if (!(LW[c] && LW[c][k])) miss.push(c + ' ' + k);
    ok(!miss.length, 'lang: every key used is in all four languages (' + used.size + ')', miss.join(', '));
    const unused = Object.keys(LW.en).filter(k => !used.has(k) && !(/\.1$/.test(k) && used.has(k.slice(0, -2))));
    ok(!unused.length, 'lang: every key in the file is used', unused.join(', '));
    const slots = s => (String(s).match(/\{\w+\}/g) || []).sort().join();
    const bad = []; for (const c of codes) for (const k of Object.keys(LW[c])) { const v = LW[c][k];
      if (/^TODO:/.test(v) || v.indexOf(String.fromCharCode(8212)) >= 0 || / - /.test(v)) bad.push(c + ' ' + k); if (slots(v) !== slots(LW.en[k])) bad.push(c + ' ' + k + ' slots'); if (!(k in LW.en)) bad.push(c + ' extra ' + k); }
    ok(!bad.length, 'lang: same slots, no TODO, no dash separator', bad.join(', '));
    const zh = start({ code: 'zh' });
    ok(zh.boxes.water.has(LW.zh['mapviz.water.title']) && zh.boxes.water.has(LW.zh['mapviz.water.direct']), 'lang: the panel speaks Chinese'); }
  { const SRC = String(PART);
    ok(!/#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/.test(SRC), 'no colour literal in the part');
    ok(!/`|\$\{|innerHTML|=>|\blet\b|\bconst\b/.test(SRC), 'ES5 template: no backtick, no dollar brace, no innerHTML, no arrow, no let or const'); }

  if (failN) { console.log('FAIL mapviz water: ' + failN + ' failed, ' + pass + ' passed'); process.exit(1); }
  console.log('PASS mapviz water (' + pass + ')');
})().catch(e => { console.log('FAIL mapviz water: ' + (e && e.stack || e)); process.exit(1); });

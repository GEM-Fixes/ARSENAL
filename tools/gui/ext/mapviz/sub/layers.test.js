// Map Viewer rule layers test (MV-PG2, builder PG2a): node tools/gui/ext/mapviz/sub/layers.test.js [scratch dir]
// The layers part on a stub V that records addLayer, addTool, addHover, addPanel, api and job calls, in the fake DOM, with
// synthetic envelopes in the frames of the fixture map (as2 128 x 96 cells of 10 u, goh 256 x 192 of 5 u, net offsets
// 640, 480): layers, groups, engineTrue, defaults, tool layers; the names this part fetches itself (kind, side, phase);
// the click snap of both forms (mowas2 and as64 the same, goh); one view job per click of a spot not made, none for a
// second click or a pose change (Make instead); cover edges, move and travel cells; the goh legend lines; seeded defects
// (an unknown pal, a wrong size, obst code 9, routes without items, a bad meta.at); no canvas; the real cover rules on
// the fixture when they are built (skipped with a message when not); the part on the shell; the language file both ways;
// no colour literal; ES5. Every form-dependent block runs on mowas2, as64 and goh (as64 must equal mowas2): the phase
// change, a view job pending on another map, P(seen) rows of sight.rings, part 'layers' on hit rows, the snap with
// offsets that are not whole; GET sight/pair of layers.server.js on the shell lib with a stubbed cache (answer shape,
// 404 need sight, 400s, 501) and the rules.md 10 pair rows on the fixture cache entries ("skip pair: not built" without
// rules/sight).
// Author: Imperator_Aug (ARSENAL, ia-2a287ce4)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const OWN = !process.argv[2];
const SCR = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'mv-layers-')));
fs.mkdirSync(SCR, { recursive: true });
process.env.ARSENAL_CACHE = path.join(SCR, 'cache');
const { harness: H } = require('./shell.test');
const fake = require('../../../test/fakedom');
const SHELL = require('./shell.client'), PART = require('./layers.client');
const LW = require('./layers.lang.json'), L = H.mergeLang([require('./shell.lang.json'), LW]);
const ROOT = path.resolve(__dirname, '../../../../mapviz');
const PAL = require(path.join(ROOT, 'palette.json'));
const FXA = require(path.join(ROOT, 'test/fxanswers.json'));
let pass = 0, failN = 0;
const ok = (c, what, extra) => { if (c) pass++; else { failN++; console.log('FAIL mapviz layers: ' + what + (extra !== undefined ? '\n  ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 600) : '')); } };
const OK = (c, what, extra) => ok(c, what, extra);   // the outer check, for blocks that prefix their target
// every page check runs in both forms (page-pg2 0, README 10): as2 as mowas2 and again as as64, goh as goh
const TG = ['mowas2', 'as64', 'goh'], formOf = t => (t === 'goh' ? 'goh' : 'as2');
const SPOT = { as2: { at: '-3,3', i: 91, j: 69, x: '-0.15', y: '0.15' }, goh: { at: '0,0', i: 128, j: 96, x: '0', y: '0' } };   // the click (3, 4)
const en = k => L.en['mapviz.layers.' + k];
const clone = x => JSON.parse(JSON.stringify(x));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const tick = async n => { for (let i = 0; i < (n || 8); i++) await new Promise(r => setImmediate(r)); };
const opt = (fn, what) => { try { return fn(); } catch (e) { if (e && e.code === 'MODULE_NOT_FOUND') { console.log('skip ' + what + ': not built'); return null; } throw e; } };

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
  return { X, doc, log, part: X.mapviz.parts.find(p => p.id === 'layers') };
}
function mkView(env, o) {
  o = o || {};
  const v = { cx: 0, cy: 0, zoom: o.zoom || 0.5, w: 800, h: 600, env: env || null, pal: PAL, token: n => 'var-' + n };
  v.toScreen = (x, y) => [v.w / 2 + (x - v.cx) * v.zoom, v.h / 2 - (y - v.cy) * v.zoom];
  v.toWorld = (px, py) => [v.cx + (px - v.w / 2) / v.zoom, v.cy - (py - v.h / 2) / v.zoom];
  return v;
}
// the answer of GET layer for a product not made yet (shell.server.js: 404 with params.need)
const WHAT = n => (/^sight\.(view|vis|fire|rings)$/.test(n) ? 'view' : /^(travel|route)\./.test(n) || n === 'routes' ? 'routes' : /^(obst|pass|move)\./.test(n) ? 'pass' : n.split('.')[0]);
function notMade(b) {
  const args = {}; for (const k of ['kind', 'phase', 'at', 'pose']) if (b && b[k] != null) args[k] = b[k];
  return Object.assign(new Error('MV_NOT_FOUND'), { status: 404, key: 'mapviz.err.MV_NOT_FOUND', params: { msg: 'not made', need: { what: WHAT(String(b && b.name)), args } } });
}
function stubV(L0, o) {
  o = o || {};
  const rec = { layers: [], panels: [], tools: [], hovers: [], on: {}, calls: [], jobs: [], redraws: 0, rel: 0, says: [], boxes: {} };
  const q = Object.assign({ target: 'mowas2', map: 'multi/mv_fixture', mode: 'battle_zones', side: 'both', kind: 'tank', rmt: false, game: '<game>', mod: '', docBusy: false, phase: null, jobs: [] }, o.q || {});
  const form = q.target === 'goh' ? 'goh' : 'as2';
  const V = {
    q: n => q[n], doc: clone(FXA[form].doc.a), pal: o.pal === undefined ? PAL : o.pal, view: { zoom: 1 },
    addLayer(l) { rec.layers.push(l); return true; },
    addPanel(p) { rec.panels.push(p); const box = L0.doc.createElement('div'); rec.boxes[p.id] = box; p.build(box, V); },
    addTool(t) { rec.tools.push(t); return true; }, addHover(f) { rec.hovers.push(f); },
    on(e, f) { (rec.on[e] = rec.on[e] || []).push(f); }, emit(e, d) { (rec.on[e] || []).forEach(f => f(d)); },
    redraw() { rec.redraws++; }, relist() { rec.rel++; }, token: n => 'var-' + n, say(k) { rec.says.push(k); },
    // the shell adds the page fields to GET layer (QCOM) and the page phase (PHQ); the part's own fields win
    api(m, p, b) { const c = { target: q.target, map: q.map, mode: q.mode, side: q.side, kind: q.kind }; if (q.phase != null) c.phase = q.phase; b = Object.assign(c, b || {});
      rec.calls.push({ m, p, b: clone(b) }); return o.api ? o.api(m, p, b) : Promise.reject(notMade(b)); },
    job(w, a) { rec.jobs.push({ what: w, args: clone(a || {}) }); return o.job ? o.job(w, a) : new Promise(() => {}); },
  };
  rec.V = V; rec.q = q;
  rec.layer = id => rec.layers.find(x => x.id === id);
  rec.draw = (id, env, view) => {
    const l = rec.layer(id), log = [];
    if (!l) return { log, err: 'missing layer ' + id, puts: [] };
    const n0 = L0.log.length;
    let err = null;
    const c = H.stubCtx(log, { _id: 'main' });
    try { l.draw(c, view || mkView(env)); } catch (e) { err = e.message; }
    return { log, err, puts: L0.log.slice(n0).filter(x => x.op === 'putImageData') };
  };
  return rec;
}
function start(o) { const L0 = load(o); const R = stubV(L0, o); L0.part.init(R.V); return Object.assign(R, { L0, kit: L0.X.mapviz.layersKit, X: L0.X }); }
const ops = (log, op) => log.filter(x => x.op === op);
// grids and vectors as the layer route sends them (shell.server.js envelopes), in the fixture frames
const FR = { as2: { w: 128, h: 96, cell: 10, ox: -640, oy: -480 }, goh: { w: 256, h: 192, cell: 5, ox: -640, oy: -480 } };
const TA = { u8: Uint8Array, u16: Uint16Array, i16: Int16Array, f32: Float32Array };
function gridEnv(name, pal, etype, o) {
  o = o || {};
  const f = Object.assign({}, FR[o.form || 'as2'], o.frame || {}), A = new TA[etype](f.w * f.h);
  if (o.fill != null) A.fill(o.fill);
  for (const [i, j, v] of o.set || []) A[j * f.w + i] = v;
  return { v: 1, kind: 'grid', name, map: 'multi/mv_fixture', target: o.target || 'mowas2', w: o.w || f.w, h: f.h, cell: f.cell, ox: f.ox, oy: f.oy, etype, sample: 'cell',
    scale: 1, offset: 0, nodata: o.nodata == null ? null : o.nodata, meta: o.meta || {}, data: Buffer.from(A.buffer).toString('base64'), pal, palette: null };
}
const vecEnv = (name, items, pal, meta) => ({ v: 1, kind: 'vector', name, map: 'multi/mv_fixture', target: 'mowas2', items: clone(items), pal, palette: null, meta: meta || {} });
function px(put, i, j) { const img = put.args[0], o = ((img.height - 1 - j) * img.width + i) * 4; return [img.data[o], img.data[o + 1], img.data[o + 2], img.data[o + 3]]; }
const hexRgba = hx => { const m = /^.([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/.exec(hx); const v = parseInt(m[1], 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255, m[2] ? parseInt(m[2], 16) : 255]; };
const passFill = c => PAL.pass.codes.find(e => e.code === c).fill;
// a router for the stub api: name -> envelope (or a function of the body); anything else is not made
const router = map => (m, p, b) => { const r = map[b.name]; if (r === undefined) return Promise.reject(notMade(b)); const v = typeof r === 'function' ? r(b) : r; return v instanceof Error ? Promise.reject(v) : Promise.resolve(clone(v)); };
// two steps of a layer the part fetches itself: the first draw asks, the second draws what came
async function draw2(R, id, view) { R.draw(id, null, view); await tick(); return R.draw(id, null, view); }

(async () => {
  // ---- RMT ----
  { const L0 = load(), R = stubV(L0, { q: { rmt: true } }); L0.part.init(R.V);
    ok(R.layers.length === 0 && R.panels.length === 0 && R.tools.length === 0 && R.calls.length === 0, 'RMT: no layer, no panel, no tool, no call'); }

  // ---- layers, groups, engineTrue, defaults, tool layers ----
  const A = start();
  const REG = {};
  for (const t of TG) { const A = start({ q: { target: t } }), ok = (c, w, e) => OK(c, t + ': ' + w, e);
    REG[t] = JSON.stringify(A.layers.map(l => [l.id, l.group, l.engineTrue, l.defaultOn, !!l.tool, l.source || null]));
    const by = Object.fromEntries(A.layers.map(l => [l.id, l]));
    const want = { obst: ['objects', true, false], 'cover.band': ['cover', true, false], 'cover.lip': ['cover', true, false], 'cover.conceal': ['cover', true, false],
      'cover.edges': ['cover', false, true], 'cover.points': ['cover', true, false], 'sight.field': ['sight', true, false], 'sight.grid': ['sight', true, false],
      'sight.fire.top': ['sight', true, false], 'sight.view': ['viewshed', true, true], 'sight.vis': ['viewshed', true, false], 'sight.fire': ['viewshed', true, true],
      'sight.rings': ['viewshed', true, true], pass: ['movement', true, false], move: ['movement', true, false], 'travel.a': ['movement', false, false], 'route.a': ['movement', false, false],
      'travel.b': ['movement', false, false], 'route.b': ['movement', false, false], routes: ['movement', false, false] };
    ok(same(A.layers.map(l => l.id).sort(), Object.keys(want).sort()), 'twenty layers', A.layers.map(l => l.id));
    const bad = Object.keys(want).filter(id => !by[id] || by[id].group !== want[id][0] || by[id].engineTrue !== want[id][1] || by[id].defaultOn !== want[id][2]);
    ok(!bad.length, 'groups, engineTrue and defaultOn as page-pg2 4.1', bad);
    const gohFalse = A.layers.filter(l => l.engineTrueGoh === false).map(l => l.id).sort();
    ok(same(gohFalse, ['cover.band', 'cover.conceal', 'cover.lip', 'cover.points']) && A.layers.every(l => l.engineTrueGoh === false || l.engineTrueGoh == null), 'GoH marks: the cover layers are estimates on Gates of Hell (bands and rules assumed), engineTrueGoh false', gohFalse);
    const tools = A.layers.filter(l => l.tool).map(l => l.id).sort();
    ok(same(tools, ['sight.fire', 'sight.rings', 'sight.view', 'sight.vis']), 'the four viewshed layers are tool layers (never in a link)', tools);
    ok(A.layers.every(l => l.label === 'mapviz.layers.l.' + l.id && typeof l.draw === 'function'), 'labels are language keys; every layer draws');
    const src = A.layers.filter(l => typeof l.source === 'string').map(l => l.id).sort();
    ok(same(src, ['cover.band', 'cover.conceal', 'cover.edges', 'cover.lip', 'cover.points', 'sight.field', 'sight.fire.top', 'sight.grid']) && A.layers.filter(l => typeof l.source === 'string').every(l => l.source === l.id),
      'fixed names are read by the shell (source); kind, phase and spot names by the part', src);
    ok(A.tools.length === 1 && A.tools[0].id === 'sightview' && A.tools[0].key === 'v' && A.tools[0].label === 'mapviz.layers.tool', 'one tool: sight from a spot, key v');
    ok(A.hovers.length === 1 && A.panels.length === 1 && A.panels[0].id === 'layers', 'one hover readout, one panel');
    ok(A.calls.length === 0 && A.jobs.length === 0, 'building makes no call and no job');
    ok((A.X.mapviz.picks || []).filter(p => p.id === 'cover').length === 1, 'picker cover for the card part'); }
  ok(REG.as64 === REG.mowas2 && REG.goh === REG.mowas2, 'the same layers in all three games (as64 = mowas2 = goh)');

  // ---- the names this part fetches: kind, side, phase ----
  for (const t of TG) { const R = start({ q: { target: t } }), ok = (c, w, e) => OK(c, t + ': ' + w, e);
    R.draw('obst', null); R.draw('move', null); R.draw('travel.a', null); R.draw('routes', null); await tick();
    const names = R.calls.map(c => c.b.name);
    ok(names.indexOf('obst.tank') >= 0 && names.indexOf('move.tank') >= 0 && names.indexOf('travel.a.tank') >= 0 && names.indexOf('routes') >= 0, 'own fetch: obst.tank, move.tank, travel.a.tank, routes', names);
    ok(R.calls.every(c => c.m === 'GET' && c.p === 'layer' && !('phase' in c.b)), 'no phase field while the page has no phase', R.calls);
    const n0 = R.calls.length; R.draw('travel.a', null); R.draw('obst', null); await tick();
    ok(R.calls.length === n0, 'a product not made is asked once, not on every draw');
    R.q.phase = 1; R.draw('travel.a', null); R.draw('routes', null); await tick();
    const ph = R.calls.slice(n0);
    ok(ph.length === 2 && ph.every(c => c.b.phase === 1), 'phase 1: travel and routes asked with phase=1', ph);
    R.q.side = 'a'; const n1 = R.calls.length; R.q.phase = 2; R.draw('travel.b', null); R.draw('route.b', null); await tick();
    ok(R.calls.length === n1, 'side a: travel.b and route.b ask nothing');
    R.q.kind = 'inf'; R.draw('move', null); await tick();
    ok(R.calls[R.calls.length - 1].b.name === 'move.inf', 'kind inf: move.inf');
    const rows = R.boxes.layers.textContent;
    ok(rows.indexOf(en('l.move') + ': ' + en('rowNeed').replace('{layer}: ', '')) >= 0, 'the panel says a layer of the part is not made', rows.slice(0, 400));
    const btn = R.boxes.layers.all().find(e => e.tagName === 'BUTTON' && e.textContent === en('make'));
    ok(!!btn && R.jobs.length === 0, 'one Make button, no job before it is pressed');
    if (btn) { btn.fire('click'); btn.fire('click'); await tick(); }
    ok(R.jobs.length === 1 && R.jobs[0].what === 'pass' && R.jobs[0].args.kind === 'inf', 'Make posts the job of the need once', R.jobs); }

  // ---- a phase change (late G6: 'map' with the same key and a new phase) leaves one row, of the new phase ----
  for (const t of TG) { const R = start({ q: { target: t, phase: 1 } }), ok = (c, w, e) => OK(c, t + ': ' + w, e);
    R.V.emit('layers', { visible: ['travel.a'] }); R.draw('travel.a', null); await tick();
    const rowsOf = () => R.boxes.layers.all().filter(e => e.tagName === 'BUTTON' && e.textContent === en('make')).length;
    ok(rowsOf() === 1, 'phase 1: one Make row for travel.a', R.boxes.layers.textContent.slice(0, 300));
    R.q.phase = 2; R.V.emit('map', { key: R.q.map, phase: 2 }); R.draw('travel.a', null); await tick();
    ok(rowsOf() === 1 && R.calls.filter(c => c.b.name === 'travel.a.tank').map(c => c.b.phase).join() === '1,2', 'phase 2: still one Make row, asked again with phase 2', R.boxes.layers.textContent.slice(0, 300));
    const btn = R.boxes.layers.all().find(e => e.tagName === 'BUTTON' && e.textContent === en('make'));
    if (btn) btn.fire('click'); await tick();
    ok(R.jobs.length === 1 && R.jobs[0].args.phase === 2, 'the Make row posts the job of phase 2', R.jobs); }

  // ---- the snap (rules.md 3.3, page-pg2 4.3): both forms, as64 = mowas2 ----
  { const K = A.kit, as2 = FXA.as2.doc.a.net, goh = FXA.goh.doc.a.net;
    const s = (x, y, n, t) => { const r = K.snap(x, y, n, t); return r && [r.at, r.i, r.j]; };
    ok(same(s(3, 4, as2, 'mowas2'), ['-3,3', 91, 69]) && same(s(3, 4, as2, 'as64'), ['-3,3', 91, 69]), 'snap as2 (3,4): -3,3 cell 91,69 on mowas2 and as64');
    ok(K.snap(-200, 0, as2, 'mowas2').at === '-206,-4' && same(s(0, 0, as2, 'as64'), ['-3,-4', 91, 68]), 'snap as2 (-200,0) and (0,0)');
    ok(same(s(3, 4, goh, 'goh'), ['0,0', 128, 96]) && K.snap(-200, 0, goh, 'goh').at === '-200,0' && K.snap(0, 0, goh, 'goh').at === '0,0', 'snap goh: (3,4), (-200,0), (0,0)');
    ok(K.snap(NaN, 0, as2, 'goh') === null && K.snap(1, 1, null, 'goh') === null, 'snap: no number or no grid gives null');
    ok(same(K.parseAt('-3,3'), [-3, 3]) && same(K.parseAt([1.5, -2]), [1.5, -2]) && K.parseAt('x,3') === null && K.parseAt('1,2,3') === null && K.parseAt('') === null, 'parseAt: two numbers only');
    ok(K.CELL.as2 === 7 && K.CELL.goh === 5, 'CELL 7 and 5');
    const SG = opt(() => require(path.join(ROOT, 'rules/sight')), 'the sight rules CELL check');
    if (SG) { const c = SG.CELL || (SG.profile && SG.profile('mowas2').cell);
      if (c == null) console.log('skip the sight rules CELL check: no CELL exported');
      else ok(Number(typeof c === 'object' ? c.as2 : c) === 7, 'CELL agrees with the sight rules', c); }
    // offsets that are not whole: the at string, snapped again the way rules/sight snaps (ruling 5), stays in the cell
    const resnap = SG && typeof SG.snap === 'function' ? (g, x, y) => SG.snap(g, x, y) : (g, x, y) => [g.ox + Math.floor((x - g.ox) / g.C) * g.C, g.oy + Math.floor((y - g.oy) / g.C) * g.C];
    let moved = 0, tried = 0, ex = null;
    for (const t of ['mowas2', 'goh']) for (const off of [640, 640.1, 643.3, 471.7, 12.25, 100.05]) for (let k = 0; k < 2000; k++) {
      const x = -off + k * 0.37 + 0.001, net = { offX: off, offY: off }, r = K.snap(x, x, net, t), C = K.CELL[formOf(t)];
      const a = r.at.split(',').map(Number), b = resnap({ C, ox: -off, oy: -off }, a[0], a[1]); tried++;
      if (Math.abs(b[0] - r.x) > 1e-6 || Math.abs(b[1] - r.y) > 1e-6 || !/^-?\d+(\.\d{1,2})?,-?\d+(\.\d{1,2})?$/.test(r.at)) { moved++; ex = ex || { t, off, x, at: r.at, corner: r.x, resnap: b }; } }
    ok(moved === 0, 'snap: the 2-decimal at string snaps again to the same corner (' + tried + ' points, offsets not whole too)', ex); }

  // ---- the viewshed click: one job per spot, no job for a second click or a pose change ----
  for (const t of TG) { const R = start({ q: { target: t } }), T = R.tools[0], ok = (c, w, e) => OK(c, t + ': ' + w, e), SP = SPOT[formOf(t)];
    T.start(); T.click(3, 4); await tick();
    const vc = R.calls.filter(c => c.b.at === SP.at).map(c => c.b.name).sort();
    ok(same(vc, ['sight.fire', 'sight.rings', 'sight.view', 'sight.vis']) && R.calls.every(c => c.b.pose === 'stand'), 'a click asks the four products of the snapped spot, standing', vc);
    ok(R.jobs.length === 1 && R.jobs[0].what === 'view' && same(R.jobs[0].args, { at: SP.at, pose: 'stand' }), 'a spot not made: the click posts one view job', R.jobs);
    T.click(3, 4); T.click(3.9, 4.9); await tick();
    ok(R.jobs.length === 1, 'clicks in the same cell while it runs post no other job', R.jobs.length);
    ok(R.boxes.layers.has(en('spot').replace('{x}', SP.x).replace('{y}', SP.y).replace('{pose}', en('pose.stand')).replace('{kind}', L.en['mapviz.shell.kind.tank'] || 'tank') + ' ' + en('making').replace('{job}', L.en['mapviz.shell.what.view'] || 'view')),
      'the panel says the spot is being made', R.boxes.layers.textContent.slice(0, 300));
    const sel = R.boxes.layers.all().find(e => e.tagName === 'SELECT');
    ok(sel && sel.children.map(o => o.attrs.value).join() === 'stand,kneel,prone', 'pose picker: stand, kneel, prone');
    sel.value = 'kneel'; sel.fire('change'); await tick();
    ok(R.jobs.length === 1, 'a pose change posts no job', R.jobs);
    const mk = R.boxes.layers.all().find(e => e.tagName === 'BUTTON' && e.textContent === en('make'));
    ok(!!mk && R.boxes.layers.has(en('notMade')), 'a pose change shows Make', R.boxes.layers.textContent.slice(0, 300));
    if (mk) mk.fire('click'); await tick();
    ok(R.jobs.length === 2 && same(R.jobs[1].args, { at: SP.at, pose: 'kneel' }), 'Make posts the kneeling view job', R.jobs);
    // a view job still running on map A does not hold up the same click on map B (the pending key has the context)
    const M2 = start({ q: { target: t } }); M2.tools[0].click(3, 4); await tick();
    M2.q.map = 'multi/other_map'; M2.V.emit('map', { key: M2.q.map }); M2.tools[0].click(3, 4); await tick();
    ok(M2.jobs.length === 2 && M2.jobs.every(j => j.what === 'view' && j.args.at === SP.at), 'a map change: the same click on map B posts its own view job', M2.jobs);
    ok(!M2.boxes.layers.has(en('notMade')), 'map B: the panel shows its own job, no stale Make', M2.boxes.layers.textContent.slice(0, 300));
    // the document is being read: no spot, a message
    const B = start({ q: { docBusy: true, target: t } }); B.tools[0].click(3, 4); await tick();
    ok(B.calls.length === 0 && B.jobs.length === 0 && B.says.indexOf('mapviz.layers.waitDoc') >= 0, 'while the document is read a click asks nothing and says wait');
    // ruling R-a: the viewshed vector is sight.rings; a refused sight.rings asks no other name (no GET json sight.view)
    const bad = Object.assign(new Error('MV_USAGE'), { status: 400, key: 'mapviz.err.MV_USAGE', params: { msg: 'name' } });
    const RA = start({ q: { target: t }, api: (m, p, b) => b.name === 'sight.rings' ? Promise.reject(bad) : Promise.reject(notMade(b)) });
    RA.tools[0].click(3, 4); await tick();
    ok(RA.calls.some(c => c.b.name === 'sight.rings') && RA.calls.every(c => c.p === 'layer'), 'a refused sight.rings asks GET layer only, never GET json sight.view', RA.calls.map(c => c.p + ' ' + c.b.name)); }

  // ---- the shell refuses at or pose (before its update): not available yet ----
  { const usage = Object.assign(new Error('MV_USAGE'), { key: 'mapviz.err.MV_USAGE', params: { msg: 'at' } });
    const R = start({ job: () => Promise.reject(usage) }); R.tools[0].click(3, 4); await tick();
    ok(R.jobs.length === 1 && R.boxes.layers.has(en('notYet')), 'a shell without at and pose: the spot says not available yet', R.boxes.layers.textContent.slice(0, 300)); }

  // ---- a spot that is made: the four products draw, counts, rings ----
  for (const t of TG) { const ok = (c, w, e) => OK(c, t + ': ' + w, e), fm = formOf(t), SP = SPOT[fm], I = SP.i, J = SP.j, at = SP.at, meta = { at, pose: 'stand' };
    const [ax, ay] = at.split(',').map(Number), o = { form: fm, target: t, meta };
    const view = gridEnv('sight.view', 'sight', 'u8', Object.assign({ set: [[I, J, 1], [I + 1, J, 1], [I + 2, J, 2], [I + 3, J, 3]] }, o));
    const vis = gridEnv('sight.vis', 'sight', 'u16', Object.assign({ fill: 65535, set: [[I, J, 0], [I + 1, J, 120]] }, o));
    const fire = gridEnv('sight.fire', 'sight.fire', 'u8', Object.assign({ set: [[I, J, 1], [I + 1, J, 2], [I + 2, J, 3], [I + 3, J, 4]] }, o));
    // P(seen) rows (late G2): two good ones, one p that is no number and one p past 1 (skipped)
    const rings = vecEnv('sight.rings', [{ kind: 'eye', x: ax, y: ay }, { kind: 'sightRing', x: ax, y: ay, r: 1000, what: 'sight' }, { kind: 'sightRing', x: ax, y: ay, r: 1400, what: 'binocular' },
      { kind: 'seen', uid: 5, def: 'fx_wall', x: 100, y: -100, p: 0.42 }, { kind: 'seen', uid: 6, def: 'fx_house', x: 200, y: 50, p: 1 },
      { kind: 'seen', uid: 7, def: 'fx_bush', x: 150, y: 300, p: 'x' }, { kind: 'seen', uid: 8, def: 'fx_tree', x: 0, y: 0, p: 1.5 }], 'sight', meta);
    let job = 0, made = false;
    const api = (m, p, b) => made ? router({ 'sight.view': view, 'sight.vis': vis, 'sight.fire': fire, 'sight.rings': rings })(m, p, b) : Promise.reject(notMade(b));
    const R = start({ q: { target: t }, api, job: () => { job++; made = true; return Promise.resolve({ id: 'j1' }); } });
    R.tools[0].click(3, 4); await tick(20);
    ok(job === 1, 'the view job ran once', job);
    const v = R.draw('sight.view', null);
    ok(!v.err && v.puts.length === 1 && same(px(v.puts[0], I, J), hexRgba(PAL.sight.seen)) && same(px(v.puts[0], I + 3, J), hexRgba(PAL.sight.partly)) && px(v.puts[0], I + 2, J)[3] === 0 && px(v.puts[0], 10, 10)[3] === 0,
      'sight.view: seen, partly, hidden and out of range cells', v.err);
    const f = R.draw('sight.fire', null);
    ok(!f.err && f.puts[0] && same(px(f.puts[0], I + 1, J), hexRgba(PAL.sight.fire.terrain)) && same(px(f.puts[0], I + 3, J), hexRgba(PAL.sight.fire.water)), 'sight.fire: the four fire codes from sight.fire', f.err);
    const s = R.draw('sight.vis', null);
    ok(!s.err && s.puts[0] && same(px(s.puts[0], I, J), hexRgba(PAL.sight.seen)) && same(px(s.puts[0], I + 1, J), hexRgba(PAL.sight.partly)) && px(s.puts[0], 0, 0)[3] === 0, 'sight.vis: 0 cm as seen, the highest as partly, 65535 not drawn', s.err);
    const r = R.draw('sight.rings', null);
    ok(!r.err && ops(r.log, 'arc').length === 3 && ops(r.log, 'stroke').length === 2, 'sight.rings: the eye and two rings (seen rows are listed, not drawn)', r.err);
    ok(R.boxes.layers.has(en('counts').replace('{seen}', '2').replace('{hidden}', '1').replace('{partly}', '1')), 'the panel counts seen, hidden and partly cells', R.boxes.layers.textContent.slice(0, 300));
    const ls = R.layer('sight.rings').list(), li = ls.map(x => x.label);
    ok(same(li, ['Sight: 50.0 m', 'Binoculars: 70.0 m', 'fx_wall: seen 42 %', 'fx_house: seen 100 %']), 'the rings list in metres, then P(seen) per object; a p that is no number or past 1 is skipped', li);
    ok(ls[2].x === 100 && ls[2].y === -100, 'a seen row goes to the object', ls[2]);
    const many = Array.from({ length: 600 }, (_, k) => ({ kind: 'seen', uid: k, def: 'd' + k, x: k, y: 0, p: 0.5 }));
    const R3 = start({ q: { target: t }, api: (m, p, b) => b.name === 'sight.rings' ? Promise.resolve(vecEnv('sight.rings', [{ kind: 'eye', x: ax, y: ay }].concat(many), 'sight', meta)) : router({ 'sight.view': view, 'sight.vis': vis, 'sight.fire': fire })(m, p, b) });
    R3.tools[0].click(3, 4); await tick(20);
    ok(R3.layer('sight.rings').list().length === 500, 'at most 500 seen rows', R3.layer('sight.rings').list().length);
    // a bad meta.at: not available
    const R2 = start({ q: { target: t }, api: router({ 'sight.view': Object.assign(clone(view), { meta: { at: 'x,y' } }) }) });
    R2.tools[0].click(3, 4); await tick();
    ok(R2.draw('sight.view', null).err === en('na'), 'seeded: a viewshed with a meta.at that is not two numbers is not available'); }

  // ---- cover edges (rules.md 4.1, fx_wall: 80 u long, top 24 u: kneel), lists, hit, picker ----
  { const items = [
      { kind: 'coverEdge', uid: 4100, def: 'fx_wall', a: [60, -103], b: [140, -103], lenM: 4.0, band: 3, topM: 1.2, side: -1, hard: true },
      { kind: 'coverEdge', uid: 4100, def: 'fx_wall', a: [140, -97], b: [60, -97], lenM: 4.0, band: 3, topM: 1.2, side: -1, hard: true },
      { kind: 'coverSector', x: 0, y: 0, a0: 0, a1: 90 }];
    const COV = {};
    for (const t of TG) { const ok = (c, w, e) => OK(c, t + ': ' + w, e), fm = formOf(t), FF = FR[fm];
    const R = start({ q: { target: t } }), env = vecEnv('cover.edges', items, 'cover');
    const d = R.draw('cover.edges', env);
    ok(!d.err && ops(d.log, 'stroke').length === 4 && ops(d.log, 'strokeRect').length === 1, 'cover.edges: two edges with a tick each, the sector box', d.err);
    const li = R.layer('cover.edges').list();
    ok(li.length === 2 && li.every(x => x.label === 'fx_wall: Kneeling, 4.0 m long, top 1.2 m') && li[0].x === 100, 'cover.edges list: fx_wall, kneel, 4.0 m', li);
    const hit = R.layer('cover.edges').hit(100, -102);
    ok(hit && hit[0].value === li[0].label && hit[0].part === 'layers', 'cover.edges hit near the wall, part layers (late G8)', hit);
    const pk = R.X.mapviz.picks.find(p => p.id === 'cover').at(100, -101, 5);
    ok(pk.length === 2 && pk[0].type === 'coverEdge' && pk[0].item.a[1] === -103, 'picker: both edges near the wall, nearest first', pk);
    ok(R.rel >= 1, 'new items ask the shell for the lists again');
    // an edge of an object marked vaultable (cover items carry vaultable, true where entry.vaultable is: GoH data) says
    // so in the list and the hit, in every game the data has it; vaultable false or absent keeps the plain words
    { const Rv = start({ q: { target: t } }), vi = [Object.assign({}, items[0], { def: 'fx_fence', vaultable: true }), Object.assign({}, items[1], { vaultable: false })];
      Rv.draw('cover.edges', vecEnv('cover.edges', vi, 'cover'));
      const lv = Rv.layer('cover.edges').list().map(x => x.label);
      ok(same(lv, ['fx_fence: Kneeling, 4.0 m long, top 1.2 m, infantry can vault it', 'fx_wall: Kneeling, 4.0 m long, top 1.2 m']), 'cover.edges: a vaultable edge says infantry can vault it, a false one does not', lv);
      const hv = Rv.layer('cover.edges').hit(100, -104);
      ok(hv && /can vault it$/.test(hv[0].value), 'cover.edges hit of the vaultable edge says it', hv);
      COV['v' + t] = JSON.stringify(lv); }
    const pts = vecEnv('cover.points', [{ kind: 'coverPoint', x: 1, y: 2, type: 8, band: 1, row: 0 }, { kind: 'coverPoint', x: 3, y: 4, type: 4, band: 3, row: 1 }], 'cover');
    const dp = R.draw('cover.points', pts);
    ok(!dp.err && ops(dp.log, 'fill').length === 2 && dp.log.filter(x => x.op === 'fill')[1].fillStyle === H.stubCtx([], {}).fillStyle + 'rgba(0,158,115,1)', 'cover.points: two dots, row 1 in the row1 colour', dp.log.filter(x => x.op === 'fill').map(x => x.fillStyle));
    const pl = R.layer('cover.points').list().map(x => x.label);
    ok(same(pl, ['Firing cover, Kneeling', 'Open ground, lie down, Lying']), 'cover.points list: the highest band first', pl);
    const ph = R.layer('cover.points').hit(1, 2);
    ok(ph && ph[0].part === 'layers', 'cover.points hit: part layers', ph);
    // cover.band through the shell's envelope: band codes, hover
    const band = gridEnv('cover.band', 'cover.bands', 'u8', { form: fm, target: t, set: [[74, 38, 5], [75, 38, 1]] });
    const b = R.draw('cover.band', band);
    ok(!b.err && b.puts[0] && same(px(b.puts[0], 74, 38), hexRgba(PAL.cover.bands[5].fill)) && px(b.puts[0], 1, 1)[3] === 0, 'cover.band: stand colour, none not drawn', b.err);
    const hx = 74 * FF.cell + FF.ox + FF.cell / 2, hy = 38 * FF.cell + FF.oy + FF.cell / 2, hv = R.hovers[0](hx, hy);
    ok(hv.some(x => x.label === 'mapviz.layers.l.cover.band' && x.value === 'Standing'), 'hover: the cover band under the cursor', hv);
    const bh = R.layer('cover.band').hit(hx, hy);
    ok(bh && bh[0].part === 'layers' && bh[0].value === 'Standing', 'cover.band hit: part layers', bh);
    COV[t] = JSON.stringify([li, pl, hit, hv]); }
    OK(COV.as64 === COV.mowas2 && COV.goh === COV.mowas2, 'cover edges, points and band: the same rows on as64, mowas2 and goh');
    OK(COV.vas64 === COV.vmowas2 && COV.vgoh === COV.vmowas2, 'vaultable edge words: the same on as64, mowas2 and goh (the data decides)'); }

  // ---- move, obst, travel and routes cells ----
  { for (const t of TG) { const ok = (c, w, e) => OK(c, t + ': ' + w, e), fm = formOf(t), FF = FR[fm], g = { form: fm, target: t };
    const R = start({ q: { kind: 'inf', target: t }, api: router({ 'move.inf': gridEnv('move.inf', 'pass.codes', 'u8', Object.assign({ set: [[74, 38, 5], [75, 38, 7], [76, 38, 1]] }, g)),
      'obst.inf': gridEnv('obst.inf', 'pass.codes', 'u8', Object.assign({ set: [[10, 10, 9]] }, g)), 'routes': vecEnv('routes', null, 'pass.route') }) });
    const m = await draw2(R, 'move');
    ok(!m.err && m.puts[0] && same(px(m.puts[0], 74, 38), hexRgba(passFill(5))) && same(px(m.puts[0], 75, 38), hexRgba(passFill(7))) && px(m.puts[0], 76, 38)[3] === 0, 'move.inf: code 5 colour at (74,38), 7 outside the pather, 1 open', m.err);
    const hv = R.hovers[0](74 * FF.cell + FF.ox + 1, 38 * FF.cell + FF.oy + 1);
    ok(hv.some(x => x.label === 'mapviz.layers.l.move' && x.value === en('move.5')), 'hover: blocked by an object', hv);
    const mh = R.layer('move').hit(74 * FF.cell + FF.ox + 1, 38 * FF.cell + FF.oy + 1);
    ok(mh && mh[0].part === 'layers' && mh[0].value === en('move.5'), 'move hit: part layers', mh);
    const o = await draw2(R, 'obst');
    ok(o.err === en('na'), 'seeded: obst code 9 is not available', o.err);
    const rt = await draw2(R, 'routes');
    ok(rt.err === en('na') && R.layer('routes').list().length === 0, 'seeded: routes without items are not available, the list is empty', rt.err); }
    // travel: the as2 form leaves (64,48) unreached, the goh form reaches it
    for (const form of ['as2', 'goh']) {
      const t = form === 'goh' ? 'goh' : 'mowas2';
      const env = gridEnv('travel.a.tank', 'pass.travel', 'f32', { form, target: t, fill: 5, set: [[64, 48, form === 'goh' ? 25 : -1], [65, 48, 25]] });
      const T = start({ q: { target: t }, api: router({ 'travel.a.tank': env }) });
      const d = await draw2(T, 'travel.a');
      const a = d.puts[0] && px(d.puts[0], 64, 48)[3];
      ok(!d.err && d.puts.length === 1 && (form === 'goh' ? a > 0 : a === 0), form + ': travel.a.tank cell (64,48) ' + (form === 'goh' ? 'reached' : 'unreached, not drawn'), { err: d.err, a });
      const f = FR[form], hv2 = T.hovers[0](64 * f.cell + f.ox + 1, 48 * f.cell + f.oy + 1);
      ok(hv2.some(x => x.label === 'mapviz.layers.l.travel.a' && x.value === (form === 'goh' ? '25 s' : en('unreached'))), form + ': travel hover', hv2); }
    // routes with items: side filter, list words
    const items = [{ kind: 'route', side: 'a', unit: 'tank', from: { name: 'spawn_a' }, to: { name: 'flag_1' }, k: 0, seconds: 61.6, lengthM: 240.4, pts: [[0, 0], [100, 0]], cross: { water: true } },
      { kind: 'route', side: 'b', unit: 'tank', from: { name: 'spawn_b' }, to: { name: 'flag_1' }, k: 0, seconds: 50, lengthM: 200, pts: [[0, 10], [100, 10]], cross: {} }];
    const Q = start({ q: { side: 'a' }, api: router({ routes: vecEnv('routes', items, 'pass.route') }) });
    const d = await draw2(Q, 'routes');
    ok(!d.err && ops(d.log, 'stroke').length === 2, 'routes: side a draws its route with a casing', d.err);
    ok(same(Q.layer('routes').list().map(x => x.label), ['spawn_a to flag_1: 62 s, 240 m (crosses water)']), 'routes list: side a only, the crossing named', Q.layer('routes').list()); }

  // ---- per game: goh lines only on goh; as64 the same as mowas2 ----
  { const lines = t => { const R = start({ q: { target: t } }); R.V.emit('map', {}); return { R, game: (H.blk(R.boxes.layers, 'mv.layers.game') || { textContent: '' }).textContent, obst: R.layer('obst').legend().map(x => x.label) }; };
    const g = lines('goh'), m = lines('mowas2'), a = lines('as64');
    ok(g.obst.indexOf(en('leg.vault')) >= 0 && m.obst.indexOf(en('leg.vault')) < 0, 'obst legend: the vault line only on goh', [g.obst, m.obst]);
    ok(g.game.indexOf(en('game.snap').replace('{n}', '5')) >= 0 && m.game.indexOf(en('game.snap').replace('{n}', '7')) >= 0, 'game lines: the snap cell 5 u on goh, 7 u on as2');
    ok(g.game.indexOf(en('game.vaultGoh')) >= 0 && g.game.indexOf(en('game.lipGoh')) >= 0 && m.game.indexOf('Gates of Hell') < 0, 'game lines: goh only lines on goh');
    ok(a.game === m.game && same(a.obst, m.obst), 'as64 shows what mowas2 shows');
    const lip = vecEnv('x', [], 'x'); void lip;
    const G = g.R, e = gridEnv('cover.lip', 'cover.lip', 'u8', { form: 'goh', target: 'goh', set: [[1, 1, 1]], meta: { used: false } });
    const d = G.draw('cover.lip', e);
    ok(!d.err && G.layer('cover.lip').legend().some(x => x.label === en('leg.lipUnused')), 'goh: cover.lip meta.used false says the soldiers do not use it', d.err);
    const M = m.R; M.draw('cover.lip', gridEnv('cover.lip', 'cover.lip', 'u8', { set: [[1, 1, 1]], meta: { used: true } }));
    ok(!M.layer('cover.lip').legend().some(x => x.label === en('leg.lipUnused')), 'as2: the lip is used, no such line');
    ok(G.layer('sight.view').legend().some(x => x.label === en('leg.targetGoh')) && M.layer('sight.view').legend().some(x => x.label === en('leg.target')), 'sight.view legend: centre on goh, random point on as2'); }

  // ---- seeded defects of the shell's envelopes ----
  for (const t of TG) { const ok = (c, w, e) => OK(c, t + ': ' + w, e), g = { form: formOf(t), target: t };
    const R = start({ q: { target: t } });
    ok(R.draw('cover.band', gridEnv('cover.band', 'no.such.pal', 'u8', g)).err === en('na'), 'seeded: an unknown pal is not available');
    ok(R.draw('cover.band', gridEnv('cover.band', 'cover.bands', 'u8', Object.assign({ w: 64 }, g))).err === en('na'), 'seeded: a grid of the wrong size is not available');
    ok(R.draw('cover.edges', { kind: 'vector', name: 'cover.edges', pal: 'cover' }).err === en('na'), 'seeded: cover edges without items are not available');
    const none = R.layers.map(l => R.draw(l.id, null)).filter(r => r.err || r.puts.length);
    ok(!none.length, 'seeded: no envelope (not made yet) draws nothing and throws nothing', none);
    const good = R.draw('cover.band', gridEnv('cover.band', 'cover.bands', 'u8', Object.assign({ set: [[2, 2, 2]] }, g)));
    ok(!good.err && good.puts.length === 1, 'seeded: after the faults the band still draws');
    const N = start({ pal: null, q: { target: t } });
    ok(N.draw('cover.band', gridEnv('cover.band', 'cover.bands', 'u8', g)).err === en('na') && N.layers.every(l => !l.legend || l.legend() === null), 'seeded: no palette: not available, no legend'); }

  // ---- no off-screen canvas: lists fill, nothing is drawn, nothing throws ----
  for (const t of TG) { const ok = (c, w, e) => OK(c, t + ': ' + w, e), L0 = load({ canvas: false }), items = [{ kind: 'coverEdge', def: 'fx_wall', a: [0, 0], b: [80, 0], lenM: 4, band: 3, topM: 1.2, side: 1 }];
    const R = stubV(L0, { q: { target: t }, api: router({ 'cover.edges': vecEnv('cover.edges', items, 'cover') }) }); L0.part.init(R.V);
    ok(R.layer('cover.edges').list().length === 0, 'no canvas: the list asks its layer');
    await tick();
    ok(R.layer('cover.edges').list().length === 1 && R.rel >= 1, 'no canvas: the list fills when the answer lands', R.layer('cover.edges').list());
    ok(!L0.log.some(x => x.op === 'putImageData' || x.op === 'drawImage'), 'no canvas: no draw call');
    let err = null; try { R.layers.forEach(l => l.draw({}, mkView(null))); } catch (e) { err = e.message; }
    ok(!err, 'a context without 2D methods throws nothing', err); }

  // ---- GET sight/pair (late G4, jobs.md 5.2): the shell lib on a stubbed cache, a stub pair, then the real rules ----
  { const SV = require('./layers.server'), SH = require('./shell.server'), RT = SV.routes['GET /api/x/mapviz/sight/pair'];
    ok(typeof RT === 'function' && Object.keys(SV.routes).length === 1, 'layers.server.js holds GET sight/pair (ruling 12)');
    const SG = opt(() => require(path.join(ROOT, 'rules/sight')), 'pair');
    const MK = SG && opt(() => require(path.join(ROOT, 'lib/mapkit')), 'pair (mapkit)'), EC = MK && opt(() => require(path.join(ROOT, 'entcat')), 'pair (entcat)');
    const FX = EC && opt(() => require(path.join(ROOT, 'test/fxmake')), 'pair (fixture maker)'), GF = require(path.join(ROOT, 'lib/raster/gridfile'));
    const DIRS = {}, MAPS = {}, GRD = {}, wj = (f, o) => fs.writeFileSync(f, JSON.stringify(o));
    // the three cache entries of the fixture map, written as the jobs write them (sight grid, mapkit grids, mapkit doc)
    for (const t of FX ? TG : []) {
      const fm = formOf(t), m = FX.make(path.join(SCR, 'pair-fx-' + t), { form: fm }), src = MK.source({ target: t, game: m.gameDir, modDirs: m.modDirs });
      const doc = MK.doc(src, m.map, {}), grids = MK.grids(src, m.map, {}), Ld = EC.loaderFor(src), d = EC.docForMode(doc, null);
      const placed = EC.placeSolids(d, EC.forDoc(src, d, { loader: Ld }), Ld, grids), sg = SG.grid(doc, grids, placed, { target: t }), fg = SG.fireGrid(doc, grids, placed, {});
      const base = path.join(SCR, 'pair-cache-' + t), sd = path.join(base, 'sight'), gd = path.join(base, 'grids'), dd = path.join(base, 'doc');
      for (const x of [sd, gd, dd]) fs.mkdirSync(x, { recursive: true });
      for (const g of [sg.grid, sg.ground, sg.field, fg.top, fg.bottom]) GF.write(path.join(sd, g.name + '.mvg'), g);
      wj(path.join(sd, 'sight.json'), { v: 1, kind: 'sight', target: t, profile: SG.profile(src) });
      GF.write(path.join(gd, 'height.mvg'), grids.height); GF.write(path.join(gd, 'gtype.mvg'), grids.gtype); wj(path.join(gd, 'grids.json'), { v: 1, w: grids.W });
      wj(path.join(dd, 'mapdoc.json'), doc);
      DIRS['sight|' + t] = sd; DIRS['grids|' + t] = gd; DIRS['doc|' + t] = dd; MAPS[t] = m; GRD[t] = grids;
    }
    const opened = [];
    const cache = { entryKey: r => r.what + '|' + r.target, open: k => { opened.push(k); return DIRS[k] ? { dir: DIRS[k], manifest: { made: 1 } } : null; } };
    const call = async (t, qs) => { const u = new URL('http://127.0.0.1/api/x/mapviz/sight/pair?' + new URLSearchParams(Object.assign({ target: t, map: MAPS[t] ? MAPS[t].map : 'multi/mv_fixture' }, qs)).toString());
      try { return { r: await RT(u, null, {}) }; } catch (e) { return { e }; } };
    SH._t.use({ cache });
    try {
      // a stub pair: the route's answer shape, the arguments it passes, 404 need, 400s
      let seen = null;
      SV._t.use({ pair: (sg, fg, grids, prof, fa, fb, o) => { seen = { sg: !!(sg && sg.grid && sg.field), fg: !!(fg && fg.top && fg.height), prof: !!(prof && prof.viewers), fa, fb, o }; return { see: true, visibleHeightM: 0.5, fire: { clear: false, block: 'object', at: [1, 2] }, distM: 3 }; } });
      const SHAPE = {};
      for (const t of FX ? TG : []) { const ok = (c, w, e) => OK(c, t + ': ' + w, e);
        const a = await call(t, { from: '1,2', to: '3,4,1.5', pose: 'kneel', kind: 'tank' });
        ok(a.r && same(Object.keys(a.r).sort(), ['distM', 'fire', 'see', 'v', 'visibleHeightM']) && a.r.v === 1 && same(a.r.fire, { clear: false, block: 'object', at: [1, 2] }), 'pair answer {v, see, visibleHeightM, fire, distM}', a.r || (a.e && a.e.message));
        ok(seen && seen.sg && seen.fg && seen.prof && same(seen.fa, [1, 2]) && same(seen.fb, [3, 4, 1.5]) && seen.o.pose === 'kneel' && seen.o.kind === 'tank', 'pair gets the cached grids, the profile, from, to, pose and kind', seen);
        const d = await call(t, { from: '1,2', to: '3,4' });
        ok(d.r && seen.o.pose === 'stand' && seen.o.kind === 'inf', 'pair defaults: stand, inf', seen && seen.o);
        SHAPE[t] = JSON.stringify(a.r); }
      ok(!FX || (SHAPE.as64 === SHAPE.mowas2 && SHAPE.goh === SHAPE.mowas2), 'pair: the same answer form in all three games');
      for (const t of TG) { const ok = (c, w, e) => OK(c, t + ': ' + w, e);
        const saved = Object.assign({}, DIRS); for (const k of Object.keys(DIRS)) delete DIRS[k];
        const nf = await call(t, { map: 'multi/not_made', mode: 'm1', from: '1,2', to: '3,4' });
        Object.assign(DIRS, saved);
        ok(nf.e && nf.e.status === 404 && nf.e.key === 'mapviz.err.MV_NOT_FOUND' && same(nf.e.params.need, { what: 'sight', args: { map: 'multi/not_made', mode: 'm1' } }), '404 need sight {map, mode} when nothing is cached', nf.e && nf.e.params);
        const bad = [[{ from: 'x,1', to: '3,4' }, 'from x,1'], [{ from: '1,2,3,4', to: '3,4' }, 'from of four numbers'], [{ from: '1', to: '3,4' }, 'from of one number'], [{ from: '1,2' }, 'no to'],
          [{ from: '1,2', to: '3,4', side: 'a' }, 'an unknown argument'], [{ from: '1,2', to: '3,4', kind: 'boat' }, 'kind boat'], [{ from: '1,2', to: '3,4', pose: 'sit' }, 'pose sit'], [{ from: '1,2', to: 'NaN,4' }, 'to NaN']];
        for (const [qs, what] of bad) { const b = await call(t, qs); ok(b.e && b.e.status === 400 && b.e.key === 'mapviz.err.MV_USAGE', 'seeded: ' + what + ' gives 400 MV_USAGE', b.e ? b.e.params : b.r); } }
      const nb = await (async () => { SV._t.use({ pair: null }); return call('mowas2', { from: '1,2', to: '3,4' }); })();
      ok(nb.e && nb.e.status === 501, 'no sight rules: 501 not built', nb.e && nb.e.params);
      // the real rules on the fixture (rules.md 10, pair rows; the as2 rows on mowas2 and again on as64, the goh form the same)
      SV._t.reset();
      if (!FX) console.log('skip pair: not built');
      const REAL = {};
      for (const t of FX ? TG : []) { const ok = (c, w, e) => OK(c, t + ': ' + w, e);
        const p1 = await call(t, { from: '-300,0', to: '-100,0' });
        ok(p1.r && p1.r.see === false && Math.abs(p1.r.visibleHeightM - 4.4) <= 0.3 && p1.r.fire.clear === false && p1.r.fire.block === 'terrain' && p1.r.distM === 10, 'real pair (-300,0) -> (-100,0): not seen, visible from 4.4 m, fire blocked by terrain', p1.r || (p1.e && p1.e.params));
        const at = p1.r && p1.r.fire.at, ax = Array.isArray(at) ? at[0] : at && at.x;
        ok(typeof ax === 'number' && ax >= -245 && ax <= -155, 'real pair: the terrain block lies between x -245 and -155', at);
        const p2 = await call(t, { from: '-200,0,1.6', to: '-100,0' });
        ok(p2.r && p2.r.see === true && p2.r.fire.clear === true, 'real pair from the crest (-200,0) -> (-100,0): seen, fire clear', p2.r || (p2.e && p2.e.params));
        // the wall rows hold heights over the flat ground at x 0 (the pond rim lowers (200, -100), as the sight test notes):
        // zM at the far end is given over its own ground so the line stays level
        const g0 = require(path.join(ROOT, 'rules/sight/grid')).groundAt, z0 = g0(GRD[t].height, 0, -100), z2 = g0(GRD[t].height, 200, -100);
        const zm = h => String(Math.round((z0 + h * 20 - z2) / 20 * 1e6) / 1e6);
        ok(z0 === 0, 'fixture: the ground at (0, -100) is flat 0', z0);
        const p3 = await call(t, { from: '0,-100,0.5', to: '200,-100,' + zm(0.5) });
        ok(p3.r && p3.r.fire.clear === false && p3.r.fire.block === 'object' && p3.r.fire.at[0] >= 90 && p3.r.fire.at[0] <= 110, 'real fire (0,-100) 0.5 m -> (200,-100) level: blocked by the wall', p3.r || (p3.e && p3.e.params));
        const p4 = await call(t, { from: '0,-100,1.6', to: '200,-100,' + zm(1.6) });
        ok(p4.r && p4.r.fire.clear === true && p4.r.see === true, 'real fire and sight (0,-100) 1.6 m -> (200,-100) level: clear, seen', p4.r || (p4.e && p4.e.params));
        // the same rows with zM over each point's own ground (the route's own form): the far end sits on the lower pond
        // rim, so the line falls; at 0.5 m it is cut before the wall (terrain or the wall), at 1.6 m the wall cuts it
        const p5 = await call(t, { from: '0,-100,0.5', to: '200,-100,0.5' });
        ok(p5.r && p5.r.fire.clear === false && (p5.r.fire.block === 'terrain' || p5.r.fire.block === 'object') && p5.r.fire.at[0] > 0 && p5.r.fire.at[0] <= 110, 'real fire (0,-100) 0.5 m -> (200,-100) 0.5 m over own ground: blocked at or before the wall', p5.r || (p5.e && p5.e.params));
        const p6 = await call(t, { from: '0,-100,1.6', to: '200,-100,1.6' });
        ok(p6.r && p6.r.fire.clear === false && p6.r.fire.block === 'object' && p6.r.fire.at[0] >= 85 && p6.r.fire.at[0] <= 110, 'real fire (0,-100) 1.6 m -> (200,-100) 1.6 m over own ground: the falling line meets the wall', p6.r || (p6.e && p6.e.params));
        ok(z2 < z0, 'fixture: the ground at (200, -100) lies under the ground at (0, -100) (pond rim)', [z0, z2]);
        REAL[t] = JSON.stringify([p1.r, p2.r, p3.r, p4.r, p5.r, p6.r]); }
      if (FX) ok(REAL.as64 === REAL.mowas2, 'real pair: as64 answers what mowas2 answers');
    } finally { SH._t.reset(); SV._t.reset(); } }

  // ---- the real cover rules on the fixture (fx_wall: two edges, kneel, 4.0 m) ----
  { const CV = opt(() => require(path.join(ROOT, 'rules/cover')), 'real cover edges (rules/cover)');
    const MK = CV && opt(() => require(path.join(ROOT, 'lib/mapkit')), 'real cover edges (mapkit)');
    const EC = MK && opt(() => require(path.join(ROOT, 'entcat')), 'real cover edges (entcat)');
    const FX = EC && opt(() => require(path.join(ROOT, 'test/fxmake')), 'real cover edges (fixture maker)');
    if (FX) {
      let items = null;
      try { const f = FX.make(path.join(SCR, 'fx-as2'), { form: 'as2' }), src = MK.source({ target: f.target, game: f.gameDir, modDirs: f.modDirs });
        const doc = MK.doc(src, f.map, {}), sub = Object.assign({}, doc, { entities: doc.entities.filter(e => e.src === 'map') }), cat = EC.forDoc(src, sub, {});
        items = CV.edges(doc, cat, EC.place(doc, cat)); items = Array.isArray(items) ? items : items && items.items;
      } catch (e) { console.log('skip real cover edges: ' + String(e && e.message || e).split('\n')[0]); }
      if (items) { const R = start(); R.draw('cover.edges', vecEnv('cover.edges', items, 'cover'));
        const w = R.layer('cover.edges').list().filter(x => /^fx_wall:/.test(x.label)).map(x => x.label);
        ok(w.length === 2 && w.every(x => x === 'fx_wall: Kneeling, 4.0 m long, top 1.2 m'), 'real cover rules: fx_wall gives two kneeling edges of 4.0 m', w); }
      else console.log('skip real cover edges: the rules gave no items');
    } }

  // ---- on the shell: builds, panel, tool, no job without a user action; RMT ----
  { const calls = [];
    const routes = {
      'GET /api/x/mapviz/palette': async () => PAL,
      'GET /api/x/mapviz/cache': async () => ({ v: 1, root: '<cache>', bytes: 0, cap: 1, entries: 0, jobs: 0 }),
      'GET /api/x/mapviz/doc': async () => clone(FXA.as2.doc.a),
      'GET /api/x/mapviz/layer': async u => { const b = Object.fromEntries(u.searchParams); throw notMade(b); },
    };
    const S = { gameId: 'mowas2', gameOv: '<game>', mod: '', mapKey: 'map/multi/mv_fixture' };
    for (const canvas of [true, false]) {
      calls.length = 0; let err = null, P = null;
      try { P = H.mkPage({ scripts: [SHELL, PART], lang: L, S: Object.assign({}, S), canvas, api: H.routeApi(routes, calls) }); P.screen.refresh(); await H.flush(60); if (P.V) P.V.redraw(); await H.flush(30); } catch (e) { err = e.stack; }
      const how = canvas ? 'shell' : 'shell without a canvas';
      ok(!err && P && H.blk(P.root, 'mv.layers.head') && H.blk(P.root, 'mv.layers.view') && H.blk(P.root, 'mv.layers.rows'), how + ': the part builds its panel', err);
      ok(P && P.root.has(en('tool')), how + ': the sight tool button', P && P.root.textContent.slice(0, 200));
      ok(!calls.some(c => c.method === 'POST'), how + ': no job without a user action', calls.map(c => c.method + ' ' + c.path));
      if (canvas && P) {
        const n0 = calls.length; let je = null;
        await P.V.job('view', { at: '-3,3', pose: 'stand' }).catch(e => { je = e; }); await H.flush(10);
        const posted = calls.slice(n0).some(c => c.method === 'POST' && /\/job$/.test(c.path) && c.body && c.body.at === '-3,3' && c.body.pose === 'stand');
        ok(posted || (je && je.key === 'mapviz.err.MV_USAGE' && /^(at|pose)$/.test(je.params && je.params.msg)), 'shell: V.job view takes at and pose (or refuses them the way the part reads as not yet)', { posted, je: je && je.message });
        if (!posted) console.log('note: the shell does not take at and pose yet; the viewshed shows not available yet'); } }
    const C3 = [], P3 = H.mkPage({ scripts: [SHELL, PART], lang: L, S: Object.assign({}, S), canvas: true, rmt: true, api: H.routeApi(routes, C3) });
    try { P3.screen && P3.screen.refresh && P3.screen.refresh(); await H.flush(10); } catch (e) { void e; }
    ok(C3.length === 0, 'shell on RMT: no mapviz call', C3); }

  // ---- language ----
  { const SRC = String(PART), codes = ['en', 'ru', 'uk', 'zh'], used = new Set(), need = new Set();
    for (const m of SRC.matchAll(/'mapviz\.layers\.([A-Za-z0-9_.]*[A-Za-z0-9_])'/g)) need.add(m[1]);
    for (const m of SRC.matchAll(/W\('([A-Za-z0-9_.]*[A-Za-z0-9_])'/g)) need.add(m[1]);
    for (const m of SRC.matchAll(/'((?:leg|game)\.[A-Za-z0-9]+)'/g)) need.add(m[1]);
    const fam = (p, list) => list.forEach(x => need.add(p + '.' + x)), nums = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
    fam('obst', nums(1, 3)); fam('move', nums(1, 7)); fam('band', ['none', 'lie', 'low', 'kneel', 'squat', 'stand']); fam('ctype', nums(1, 12)); fam('conceal', nums(1, 3));
    fam('field', nums(1, 2)); fam('view', nums(0, 3)); fam('fire', nums(1, 4)); fam('ring', ['sight', 'aim', 'binocular', 'uncover', 'exact']); fam('pose', ['stand', 'kneel', 'prone']);
    fam('cross', ['water', 'swamp', 'object']); A.layers.forEach(l => need.add('l.' + l.id));
    need.forEach(k => used.add('mapviz.layers.' + k));
    ok(Object.keys(LW).sort().join() === codes.slice().sort().join(), 'lang: exactly en, ru, uk, zh');
    const miss = []; for (const k of used) for (const c of codes) if (!(LW[c] && LW[c][k])) miss.push(c + ' ' + k);
    ok(!miss.length, 'lang: every key used is in all four languages (' + used.size + ')', miss.join(', '));
    const unused = Object.keys(LW.en).filter(k => !used.has(k));
    ok(!unused.length, 'lang: every key in the file is used', unused.join(', '));
    const slots = s => (String(s).match(/\{\w+\}/g) || []).sort().join();
    const bad = []; for (const c of codes) for (const k of Object.keys(LW[c])) { const v = LW[c][k];
      if (/^TODO:/.test(v) || v.indexOf(String.fromCharCode(8212)) >= 0 || / - /.test(v)) bad.push(c + ' ' + k); if (slots(v) !== slots(LW.en[k])) bad.push(c + ' ' + k + ' slots'); if (!(k in LW.en)) bad.push(c + ' extra ' + k);
      if (c !== 'en' && v === LW.en[k] && /[a-z]{4}/.test(v.replace(/\{\w+\}|Gates of Hell|AS64/g, ''))) bad.push(c + ' ' + k + ' untranslated'); }
    ok(!bad.length, 'lang: same slots, no TODO, no dash separator, translated', bad.join(', '));
    ok(Object.values(LW).every(t => Object.values(t).every(v => !/\bas64\b|As64/.test(v))), 'lang: AS64 in capitals');
    const zh = start({ code: 'zh' });
    ok(zh.boxes.layers.has(LW.zh['mapviz.layers.title']) && zh.boxes.layers.has(LW.zh['mapviz.layers.noSpot']), 'lang: the panel speaks Chinese'); }
  { const SRC = String(PART), FILES = ['layers.client.js', 'layers.server.js', 'layers.test.js', 'layers.lang.json'].map(f => fs.readFileSync(path.join(__dirname, f), 'utf8'));
    ok(!/#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/.test(SRC), 'no colour literal in the part');
    ok(!/`|\$\{|innerHTML|=>|\blet\b|\bconst\b/.test(SRC), 'ES5 template: no backtick, no dollar brace, no innerHTML, no arrow, no let or const');
    ok(!/(^|[^\w])[A-Za-z]:[\\/][^\\/]/.test(SRC), 'no drive path pattern in the page code');
    ok(FILES.every(t => !/Users[\\/]|@[a-z0-9-]+\.[a-z]{2,}/i.test(t)), 'no home path or email in the part files'); }

  if (OWN) try { fs.rmSync(SCR, { recursive: true, force: true }); } catch (e) { void e; }
  if (failN) { console.log('FAIL mapviz layers: ' + failN + ' failed, ' + pass + ' passed'); process.exit(1); }
  console.log('PASS mapviz layers (' + pass + ')');
})().catch(e => { console.log('FAIL mapviz layers: ' + (e && e.stack || e)); process.exit(1); });

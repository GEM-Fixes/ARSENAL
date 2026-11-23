// Map Viewer strong points test (MV-PG3, builder PG3a): node tools/gui/ext/mapviz/sub/strong.test.js [scratch dir]
// The strong part on a stub V (fake DOM) and on the real shell, and its server route on the shell's route library with a
// stub cache (page-pg3 freeze draft 4.7): layers, groups, defaults; the re-weighting formula with raw 255 = nodata; the
// label rule (p98, 0.5, suppression 15 m / 25 m tank, at most 10); the states no map, need, making, ready, error, stale and
// RMT; Make it posts one job, a tank job leaves Make it on inf; list rows, hit, why text; side pictures; fortification slots
// from the map document; the same answers for AS64 and MoW:AS2, the GoH words for Gates of Hell. Seeded defects: a need
// with no what, a factor raw 255, two candidates 10 m apart, an unknown classifier id, a fort slot without x, a v 2 file
// and a file whose candidates is not a list. The real strong job is skipped while tools/mapviz/strong is not built.
// Author: Imperator_Aug (ARSENAL, ia-a8f6c5d5)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const SCR = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'mv-strong-')));
fs.mkdirSync(SCR, { recursive: true });
process.env.ARSENAL_CACHE = path.join(SCR, 'cache');
const { harness: H } = require('./shell.test');
const fake = require('../../../test/fakedom');
const SHELL = require('./shell.client'), PART = require('./strong.client');
const LS = require('./strong.lang.json'), L = H.mergeLang([require('./shell.lang.json'), LS]);
const SRV = require('./strong.server'), SH = require('./shell.server');
const ROOT = path.resolve(__dirname, '../../../../mapviz');
const PAL = require(path.join(ROOT, 'palette.json'));
const FXA = require(path.join(ROOT, 'test/fxanswers.json'));
let pass = 0, failN = 0;
const ok = (c, what, extra) => { if (process.env.STRONG_TRACE) console.log('.. ' + what); if (c) pass++; else { failN++; console.log('FAIL mapviz strong: ' + what + (extra !== undefined ? '\n  ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 600) : '')); } };
const en = k => L.en[k];
const clone = x => JSON.parse(JSON.stringify(x));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const flush = n => H.flush(n || 20);
const hexRgba = hx => { const m = /^.([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/.exec(hx); const v = parseInt(m[1], 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255, m[2] ? parseInt(m[2], 16) : 255]; };
const MAP = 'multi/mv_fixture';
const needErr = need => Object.assign(new Error('MV_NOT_FOUND'), { status: 404, key: 'mapviz.err.MV_NOT_FOUND', params: { msg: 'not made', need } });

// ---------- the part on a stub V ----------
function load(o) {
  o = o || {};
  const doc = fake.make(), log = [];
  let ids = 0;
  const make = doc.createElement;
  doc.createElement = t => { const e = make(t); if (String(t).toLowerCase() === 'canvas') { e._id = 'off' + (ids++); e.getContext = k => (k === '2d' ? (e._ctx = e._ctx || H.stubCtx(log, e)) : null); } return e; };
  const X = {};
  const fn = new Function('EXT_SCREENS', 'h', 'tx', 'api', 'S', 'RMT', 'cssv', 'onTheme', 'document', 'window', 'setTimeout', 'Image', 'gohDir', 'navigator', [SHELL, PART].join('\n'));
  fn(X, H.hOf(doc), H.txOf(L, o.code || 'en'), () => Promise.reject(new Error('no api in a part test')), {}, false, (n, d) => d || '', () => () => {}, doc,
    { requestAnimationFrame: f => f() }, (f, ms) => setTimeout(f, 2), H.ImageStub, () => '', undefined);
  return { X, doc, log, part: X.mapviz.parts.find(p => p.id === 'strong') };
}
function recCtx(log) {
  const c = H.stubCtx(log, { _id: 'main' });
  for (const m of ['fillText', 'strokeText']) c[m] = function () { log.push({ op: m, args: [].slice.call(arguments), fillStyle: c.fillStyle }); };
  return c;
}
function mkView() {
  const v = { cx: 0, cy: 0, zoom: 1, w: 800, h: 600, env: null, pal: PAL, token: n => 'var-' + n };
  v.toScreen = (x, y) => [v.w / 2 + (x - v.cx) * v.zoom, v.h / 2 - (y - v.cy) * v.zoom];
  v.toWorld = (px, py) => [v.cx + (px - v.w / 2) / v.zoom, v.cy - (py - v.h / 2) / v.zoom];
  return v;
}
// a map document: the fixture's (AS64, MoW:AS2: no fortification slots), or with GoH slots on flag f1 (one without x)
function docOf(goh) {
  const d = clone(FXA.as2.doc.a);
  if (goh) d.modes[0].flags[0].fort = [{ x: 100, y: 120, yaw: 90, kind: 'trench' }, { y: 50, yaw: 0, kind: 'sandbag' }, { x: -60, y: 40, yaw: 180, kind: 'mg_nest' }];
  return d;
}
function stubV(L0, o) {
  o = o || {};
  const rec = { layers: [], panels: [], on: {}, calls: [], jobs: [], redraws: 0, relists: 0, boxes: {}, hovers: [] };
  const q = Object.assign({ target: 'mowas2', game: '<game>', mod: '', map: MAP, mode: 'battle_zones', phase: null, side: 'both', kind: 'inf', rmt: false, docBusy: false, jobs: [] }, o.q || {});
  const V = {
    q: n => q[n], doc: docOf(q.target === 'goh'), pal: PAL, view: { zoom: 1 },
    addLayer(l) { rec.layers.push(l); return true; },
    addPanel(p) { rec.panels.push(p); const box = L0.doc.createElement('div'); rec.boxes[p.id] = box; p.build(box, V); return box; },
    addHover(f) { rec.hovers.push(f); },
    on(e, f) { (rec.on[e] = rec.on[e] || []).push(f); }, emit(e, d) { (rec.on[e] || []).forEach(f => f(d)); },
    redraw() { rec.redraws++; }, relist() { rec.relists++; }, token: n => 'var-' + n, say() {},
    api(m, p, b) { rec.calls.push({ m, p, b: clone(b || {}) }); return o.api ? o.api(p, b || {}, rec) : Promise.reject(new Error('no route')); },
    job(w, a) { rec.jobs.push({ w, a: clone(a || {}) }); return o.job ? o.job(w, a) : new Promise(() => {}); },
    go(x) { rec.went = x; return true; },
  };
  rec.V = V; rec.q = q;
  rec.layer = id => rec.layers.find(x => x.id === id);
  rec.draw = id => { const l = rec.layer(id), log = [], n0 = L0.log.length; let err = null; try { l.draw(recCtx(log), mkView()); } catch (e) { err = e.message; } return { log, err, puts: L0.log.slice(n0).filter(x => x.op === 'putImageData') }; };
  rec.status = () => { const b = rec.boxes.strong.all().find(e => e.attrs['data-blk'] === 'mv.strong.status'); return b; };
  rec.box = id => rec.boxes.strong.all().find(e => e.attrs['data-blk'] === id);
  return rec;
}
function start(o) { const L0 = load(o); const R = stubV(L0, o); L0.part.init(R.V); return Object.assign(R, { L0 }); }
const buttons = (el, text) => el.all().filter(e => e.tagName === 'BUTTON' && (!text || e.textContent === text));

// ---------- a strong product (rules.md 6.4 shape) ----------
const F9 = { ow: 0.9, kz: 0.8, sp: 0.9, df: 0.9, cv: 0.9, rt: 0.9, fr: 0.9, px: 0.9, hu: 0.9, amb: 0.9, enf: 0.9 };
function cand(id, side, x, y, score, o) {
  return Object.assign({ id, side, x, y, z: 0, src: 'lattice', uid: null, gate: 1, gateWhy: [], f: clone(F9), score, cls: [], label: '', why: {}, rank: 0, top: false, median: score, spread: 0, presetsTop: 1 }, o || {});
}
function product(o) {
  o = o || {};
  const cands = [
    cand('c1', 'a', 1000, 1000, 0.9, { cls: ['reverse'], spread: 0.2, presetsTop: 3, why: { reverse: { crest: 1, distM: 12, riseM: 2.5, widthM: 30, rearRatio: 0.6 } } }),
    cand('c2', 'a', 1200, 1000, 0.88),
    cand('c3', 'b', -3000, -3000, 0.8, { cls: ['bogus'], f: Object.assign(clone(F9), { px: 1, ow: 0.1, kz: 0.1, sp: 0.1, df: 0.1, cv: 0.1, rt: 0.1, fr: 0.1 }) }),
    cand('c4', 'b', -2000, -2000, 0, { gate: 0, gateWhy: ['GATE_SWIM', 'weird'] }),
    cand('c5', 'a', 3000, 1000, 0.3, { f: Object.assign(clone(F9), { ow: 0.1, kz: 0.1, sp: 0.1, df: 0.1, cv: 0.1, rt: 1, fr: 1, px: 0.1 }) }),
  ];
  return Object.assign({ v: 1, kind: 'strong', target: 'mowas2', map: MAP, mode: 'battle_zones', phase: null, unit: 'inf', seed: 1, version: 1,
    frame: { d: 40, contactCells: 2, midline: [[-500, 0], [500, 0]], flagsActive: ['f1', 'f2'], boxes: {} },
    factors: [{ id: 'ow', applies: true, engineTrue: 'rule', inputs: 'engine' }, { id: 'fr', applies: true, engineTrue: 'estimate', inputs: 'engine' }, { id: 'cv', applies: true, engineTrue: 'rule', inputs: 'inferred' }],
    presets: { balanced: {}, hold: {}, attack: {} }, candidates: cands, labels: ['c1', 'c3'],
    fair: { flags: [{ flag: 'f1', side: 'a', best5: 0.7, hull: 0, amb: 0, uncont: 40 }, { flag: 'f1', side: 'b', best5: 0.4, hull: 0, amb: 0, uncont: 20 }],
      dist: { a: [], b: [] }, gap: 0.3, top50: { a: 30, b: 20 }, symmetry: { kind: 'mirrorX', residualM: 3.2, patches: [{ x: 50, y: 60, areaM2: 400, objects: [7, 9] }] } },
    checks: [], ensemble: {}, caps: { hit: false }, flat: false, notes: [{ code: 'STRONG_INPUT_COMPUTED', msg: 'cover' }, { code: 'STRONG_NEW', msg: 'later' }] }, o);
}
// a strong frame grid envelope: u8, raw 0..250 = 0..1, 255 = nodata (rules.md 6.3)
function gridEnv(name, w, h, raw, meta, o) {
  return Object.assign({ v: 1, kind: 'grid', name, map: MAP, target: 'mowas2', w, h, cell: 40, ox: 0, oy: 0, etype: 'u8', sample: 'nearest', scale: 0.004, offset: 0, nodata: 255,
    meta: meta || {}, data: Buffer.from(raw).toString('base64'), pal: 'strong', palette: PAL.strong }, o || {});
}
// the stub api of a made product: GET strong answers it, GET layer answers the grids it knows, else a need
function madeApi(j, grids) {
  return (p, b) => {
    if (p === 'strong') return Promise.resolve(clone(j));
    if (p === 'layer' && grids && grids[b.name]) return Promise.resolve(clone(grids[b.name]));
    return Promise.reject(needErr({ what: 'strong', args: { map: MAP, kind: 'inf' } }));
  };
}

(async () => {
  const K = load().X.mapviz.strongKit;
  // ---- pure helpers ----
  { ok(K && typeof K.scoreRaw === 'function', 'strongKit is exposed');
    const w = K.PRESETS.balanced;
    ok(Math.abs(K.scoreOf(F9, w, 'inf') - (0.9 * 7 + 0.8) / 8) < 1e-9, 'score: sum(w F) / sum(w) over APPLIES[inf]');
    ok(Math.abs(K.scoreOf(Object.assign(clone(F9), { kz: null }), w, 'inf') - 0.9) < 1e-9, 'score: a factor with no value is left out (as strong/factors.js)');
    const raw = { ow: 250, kz: 125, sp: 250, df: 250, cv: 250, rt: 250, fr: 250, px: 250 };
    ok(Math.abs(K.scoreRaw(raw, 250, w, 'inf') - 7.5 / 8) < 1e-9, 'scoreRaw: raw x 0.004, gate 250 = 1');
    // seeded defect: a factor raw 255 is nodata, never 1.02
    ok(K.scoreRaw(Object.assign({}, raw, { cv: 255 }), 250, w, 'inf') === null, 'scoreRaw: a factor raw 255 gives nodata');
    ok(K.scoreRaw(raw, 0, w, 'inf') === null && K.scoreRaw(raw, 255, w, 'inf') === null, 'scoreRaw: gate 0 and gate nodata give nodata');
    ok(K.scoreRaw(Object.assign({}, raw, { cv: 255 }), 250, Object.assign({}, w, { cv: 0 }), 'inf') !== null, 'scoreRaw: a factor weighted 0 is left out, its nodata does not count');
    const fv = {}; K.APPLIES.inf.forEach(f => { fv[f] = new Float64Array([1, 0.5, NaN]); });
    const wv = K.weighVals(new Float64Array([1, 0, 1]), fv, w, 'inf');
    ok(wv && wv[0] === 1 && wv[1] !== wv[1] && wv[2] !== wv[2], 'weighVals: gate 0 and a nodata factor give NaN', wv && Array.from(wv));
    ok(K.weighVals(new Float64Array([1]), {}, w, 'inf') === null, 'weighVals: a missing factor grid gives null');
    ok(same(K.APPLIES.at, ['ow', 'kz', 'sp', 'df', 'rt', 'fr', 'px', 'amb']) && same(K.APPLIES.tank, ['ow', 'kz', 'sp', 'df', 'rt', 'fr', 'px', 'hu']), 'APPLIES as rules.md 6.1');
    ok(K.PRESETS.hold.amb === 2 && K.PRESETS.attack.rt === 2 && K.PRESETS.hold.rt === 0.5, 'PRESETS as rules.md 6.1');
    // labels: seeded defect, two candidates 10 m (200 u) apart give one label
    const two = [{ id: 'p', side: 'a', gate: 1, x: 0, y: 0, s: 0.9 }, { id: 'q', side: 'a', gate: 1, x: 200, y: 0, s: 0.8 }];
    ok(K.chooseLabels(two, c => c.s, 'inf').length === 1, 'labels: two candidates 10 m apart give one label');
    const far = [{ id: 'p', side: 'a', gate: 1, x: 0, y: 0, s: 0.9 }, { id: 'q', side: 'a', gate: 1, x: 400, y: 0, s: 0.9 }];
    ok(K.chooseLabels(far, c => c.s, 'inf').length === 2 && K.chooseLabels(far, c => c.s, 'tank').length === 1, 'labels: 20 m apart give two for inf, one for tank (25 m)');
    const many = []; for (let i = 0; i < 50; i++) many.push({ id: 'm' + i, side: i % 2 ? 'b' : 'a', gate: 1, x: i * 1000, y: 0, s: (i + 1) / 50 });
    const lm = K.chooseLabels(many, c => c.s, 'inf');
    // 25 per side: p98 = the sorted score at floor(0.98 x 24) = 23, the second best, so two per side (as strong/classify.js)
    ok(lm.filter(l => l.side === 'a').length === 2 && lm.filter(l => l.side === 'b').length === 2 && lm.every(l => l.score >= 0.94), 'labels: per side, at or above the side p98', lm);
    const low = [{ id: 'l', side: 'a', gate: 1, x: 0, y: 0, s: 0.4 }];
    ok(K.chooseLabels(low, c => c.s, 'inf').length === 0, 'labels: below 0.5 never labelled');
    const top = []; for (let i = 0; i < 30; i++) top.push({ id: 't' + i, side: 'a', gate: 1, x: i * 1000, y: 0, s: 0.9 });
    ok(K.chooseLabels(top, c => c.s, 'inf').length === 10, 'labels: at most 10 per side');
    ok(K.chooseLabels([{ id: 'g', side: 'a', gate: 0, x: 0, y: 0, s: 1 }], c => c.s, 'inf').length === 0, 'labels: gated out candidates never labelled');
    ok(same(K.GATES, ['GATE_FOOTPRINT', 'GATE_UNREACHED', 'GATE_OUTSIDE_BOX', 'GATE_SWIM', 'GATE_DROWN', 'GATE_NO_PRONE', 'GATE_SLOPE', 'GATE_UNLINKED', 'GATE_ENEMY_SPAWN']), 'gate codes as rules.md 6.2 (late R4)');
    ok(K.GATES.every(c => LS.en['mapviz.strong.gate.' + c] && LS.ru['mapviz.strong.gate.' + c] && LS.uk['mapviz.strong.gate.' + c] && LS.zh['mapviz.strong.gate.' + c]), 'every gate code has words in four languages');
    ok(K.gateId(' GATE_SWIM ') === 'GATE_SWIM', 'gate codes are kept as written'); }

  // ---- RMT ----
  { const L0 = load(), R = stubV(L0, { q: { rmt: true } }); L0.part.init(R.V);
    ok(R.layers.length === 0 && R.panels.length === 0 && R.calls.length === 0, 'RMT: no layer, no panel, no call'); }

  // ---- layers, groups, defaults ----
  const A = start({ q: { map: null } });
  { const ids = A.layers.map(l => l.id), by = Object.fromEntries(A.layers.map(l => [l.id, l]));
    const want = ['strong.labels', 'strong.score'].concat(K.FACT.map(f => 'strong.f.' + f)).concat(['strong.threat', 'strong.uncont', 'strong.first', 'strong.gate', 'strong.contact', 'strong.danger', 'strong.howitzer', 'strong.nocrest', 'fair.flags', 'fair.symmetry', 'game.fort']);
    ok(same(ids, want), 'the layers of page-pg3 4.1', ids);
    const GW = { ow: 'factfire', kz: 'factfire', sp: 'factfire', df: 'factfire', amb: 'factfire', enf: 'factfire', cv: 'factplace', rt: 'factplace', fr: 'factplace', px: 'factplace', hu: 'factplace' };
    const gOf = id => (/^strong\.f\./.test(id) ? GW[id.slice(9)] : /^strong\.(danger|howitzer|nocrest)$/.test(id) ? 'danger' : /^strong\./.test(id) ? 'strong' : /^fair\./.test(id) ? 'fairness' : 'game');
    ok(K.FACT.every(f => GW[f]) && want.every(id => by[id].group === gOf(id)), 'groups: strong (results), danger, factfire, factplace (every factor in one), fairness, game (fort)', want.filter(id => by[id].group !== gOf(id)));
    const on = ids.filter(id => by[id].defaultOn === true);
    ok(same(on, ['strong.labels', 'strong.uncont', 'strong.first', 'game.fort']), 'on by default: labels, uncont, first, fort', on);
    const META = require('../../../../mapviz/strong/meta');
    ok(['sp', 'df', 'cv', 'hu'].every(f => by['strong.f.' + f].engineTrue === true) && ['ow', 'kz', 'rt', 'amb', 'fr', 'px', 'enf'].every(f => by['strong.f.' + f].engineTrue === false), 'factor layers: engine true only for the engine rules and the cover port (sp, df, cv, hu)');
    ok(K.FACT.every(f => by['strong.f.' + f].engineTrue === META.engineTrue(f)), 'factor marks: the page reads the tool meta (one source of truth)', K.FACT.filter(f => by['strong.f.' + f].engineTrue !== META.engineTrue(f)));
    ok(by['game.fort'].engineTrue === false && by['strong.labels'].engineTrue === false && by['strong.score'].engineTrue === false, 'fort slots an estimate (placement inferred), scores not engine true');
    ok(typeof by['strong.labels'].list === 'function' && typeof by['strong.labels'].hit === 'function' && typeof by['game.fort'].hit === 'function', 'labels and fort slots: list and hit');
    ok(A.calls.length === 0 && A.jobs.length === 0, 'building makes no call');
    ok(A.status().has(L.en['mapviz.shell.noMap']), 'no map: the status says so');
    // leaf blocks: a block inside the panel holds no block; every control sits in a block
    const box = A.boxes.strong, blocks = box.all().filter(e => e.attrs['data-blk']);
    ok(blocks.length >= 7 && blocks.every(b => !b.all().some(e => e.attrs['data-blk'])), 'panel blocks are leaves', blocks.map(b => b.attrs['data-blk']));
    ok(['mv.strong.title', 'mv.strong.status', 'mv.strong.preset', 'mv.strong.weights', 'mv.strong.top', 'mv.strong.why', 'mv.strong.fair', 'mv.strong.legend'].every(id => blocks.some(b => b.attrs['data-blk'] === id)), 'the blocks of page-pg3 4.2');
    const ctl = box.all().filter(e => /^(BUTTON|INPUT|SELECT|H3)$/.test(e.tagName));
    const inBlock = e => { let p = e.parentNode; while (p && p !== box) { if (p.attrs && p.attrs['data-blk']) return true; p = p.parentNode; } return false; };
    ok(ctl.length > 0 && ctl.every(inBlock), 'every control and heading sits in a leaf');
    ok(box.all().filter(e => e.tagName === 'INPUT' && e.attrs.type === 'range').length === 8, 'weights: one slider per factor of inf (8)');
    ok(A.status().attrs['aria-live'] === 'polite', 'status is aria-live'); }

  // ---- need, Make it, making; a need with no what ----
  { let made = false;
    const R = start({ api: (p, b) => (p === 'strong' ? (made ? Promise.resolve(product()) : Promise.reject(needErr({ what: 'strong', args: { map: MAP, mode: 'battle_zones', kind: 'inf' } }))) : Promise.reject(new Error('x'))) });
    R.V.emit('map', { key: MAP, mode: 'battle_zones', side: 'both', kind: 'inf', doc: R.V.doc }); await flush();
    const gs = R.calls.filter(c => c.p === 'strong');
    ok(gs.length === 1 && same(gs[0].b, { kind: 'inf' }), 'map opened: one GET strong with the kind (the shell adds the rest)', R.calls);
    const mk = buttons(R.status(), en('mapviz.shell.make'));
    ok(mk.length === 1 && R.status().has(L.en['mapviz.strong.need'].replace('{kind}', en('mapviz.shell.kind.inf'))), 'need: the status shows Make it', R.status().textContent);
    // a tank job running leaves Make it on inf
    R.q.jobs = [{ id: 'j1', what: 'strong', target: 'mowas2', map: MAP, args: { map: MAP, mode: 'battle_zones', kind: 'tank' }, text: 'tank strong points' }];
    R.V.emit('job', {});
    ok(buttons(R.status(), en('mapviz.shell.make')).length === 1, 'a tank job leaves Make it on inf');
    R.q.jobs = [];
    buttons(R.status(), en('mapviz.shell.make'))[0].click();
    ok(R.jobs.length === 1 && R.jobs[0].w === 'strong' && same(R.jobs[0].a, { phase: null }), 'Make it posts job strong once with the page phase (the shell adds map, mode, kind)', R.jobs);
    ok(R.status().has(L.en['mapviz.strong.making'].replace('{job}', en('mapviz.shell.what.strong'))), 'making: the status says so', R.status().textContent);
    ok(buttons(R.status(), en('mapviz.shell.make')).length === 0, 'making: no Make it to press again');
    R.V.emit('job', {}); R.V.emit('products', {}); await flush();
    ok(R.jobs.length === 1, 'a second press or a products event posts nothing');
    // the job ends: the product is read
    made = true;
    const J = start({ api: (p) => (p === 'strong' ? (made ? Promise.resolve(product()) : Promise.reject(needErr({ what: 'strong', args: { map: MAP, kind: 'inf' } }))) : Promise.reject(new Error('x'))), job: () => Promise.resolve({ state: 'done' }) });
    made = false; J.V.emit('map', { key: MAP }); await flush();
    made = true; buttons(J.status(), en('mapviz.shell.make'))[0].click(); await flush();
    ok(J.status().has('2 spots marked'), 'after its job the part reads the product again', J.status().textContent);
    // seeded defect: a 404 with a need that has no what is an error, not Make it
    const B = start({ api: () => Promise.reject(Object.assign(needErr({ args: {} }))) });
    B.V.emit('map', { key: MAP }); await flush();
    ok(buttons(B.status(), en('mapviz.shell.make')).length === 0 && buttons(B.status(), en('mapviz.strong.retry')).length === 1, 'a need with no what shows an error with Try again, no Make it', B.status().textContent);
    // a page phase: the part passes it on GET strong, GET layer and the job (late T1); a job of another phase leaves Make it
    const P = start({ q: { phase: 2 }, api: (p) => Promise.reject(needErr({ what: 'strong', args: { map: MAP, mode: 'battle_zones', kind: 'inf', phase: 2 } })) });
    P.V.emit('map', { key: MAP }); await flush();
    const pg = P.calls.filter(c => c.p === 'strong');
    ok(pg.length === 1 && same(pg[0].b, { kind: 'inf', phase: 2 }), 'phase 2: GET strong carries kind and phase', P.calls);
    P.q.jobs = [{ id: 'j2', what: 'strong', target: 'mowas2', map: MAP, args: { map: MAP, mode: 'battle_zones', kind: 'inf', phase: 1 } }];
    P.V.emit('job', {});
    ok(buttons(P.status(), en('mapviz.shell.make')).length === 1, 'a job of phase 1 leaves Make it on phase 2');
    P.q.jobs = [{ id: 'j3', what: 'strong', target: 'mowas2', map: MAP, args: { map: MAP, mode: 'battle_zones', kind: 'inf', phase: 2 }, text: 'phase 2 running' }];
    P.V.emit('job', {});
    ok(buttons(P.status(), en('mapviz.shell.make')).length === 0 && P.status().has('phase 2 running'), 'a job of phase 2 shows its words in place of Make it', P.status().textContent);
    P.q.jobs = [];
    P.V.emit('job', {}); buttons(P.status(), en('mapviz.shell.make'))[0].click();
    ok(P.jobs.length === 1 && same(P.jobs[0].a, { phase: 2 }), 'phase 2: Make it posts V.job(strong, {phase: 2})', P.jobs);
    P.layer('strong.threat').draw && P.V.emit('layers', { visible: ['strong.threat'] }); await flush();
    ok(P.calls.filter(c => c.p === 'layer').length === 0, 'no product: no grid is asked for'); }

  // ---- error, Try again; stale once, stale twice ----
  { let n = 0;
    const R = start({ api: () => { n++; return Promise.reject(Object.assign(new Error('MV_FAULT'), { status: 500, key: 'mapviz.err.MV_FAULT', params: { msg: 'strong.inf: candidates is not a list' } })); } });
    R.V.emit('map', { key: MAP }); await flush();
    ok(R.status().has('candidates is not a list') && buttons(R.status(), en('mapviz.strong.retry')).length === 1, 'error: the mapviz.err text and Try again', R.status().textContent);
    buttons(R.status(), en('mapviz.strong.retry'))[0].click(); await flush();
    ok(n === 2, 'Try again asks once more');
    let s = 0;
    const S1 = start({ api: p => { if (p !== 'strong') return Promise.reject(new Error('x')); s++; return s === 1 ? Promise.reject(Object.assign(new Error('stale'), { stale: true })) : Promise.resolve(product()); } });
    S1.V.emit('map', { key: MAP }); await flush();
    ok(s === 2 && S1.status().has('2 spots marked'), 'stale once: asked once more, then ready', S1.status().textContent);
    let t = 0;
    const S2 = start({ api: () => { t++; return Promise.reject(Object.assign(new Error('stale'), { stale: true })); } });
    S2.V.emit('map', { key: MAP }); await flush();
    ok(t === 2 && S2.status().textContent === '', 'stale twice: no third ask, no status', S2.status().textContent); }

  // ---- ready: list, hit, why, weights ----
  async function ready(target, o) {
    const R = start(Object.assign({ q: { target }, api: madeApi(product(), o && o.grids) }, o || {}));
    R.V.emit('map', { key: MAP }); await flush();
    return R;
  }
  const R = await ready('mowas2');
  { const lab = R.layer('strong.labels'), rows = lab.list();
    ok(R.status().has('2 spots marked for Infantry.'), 'ready: the status counts the labels', R.status().textContent);
    ok(same(rows.map(r => r.label), ['1. Side A, Reverse slope, 0.90', '1. Side B, Near what matters, 0.80']), 'list rows: rank, side word, label word, score 2 dp', rows);
    // seeded defect: c3 has the unknown classifier 'bogus': the word is its largest w x F factor (px)
    ok(rows[1].label.indexOf(en('mapviz.strong.f.px')) >= 0, 'an unknown classifier id gives the largest w x F word');
    ok(R.status().has(en('mapviz.strong.note.STRONG_INPUT_COMPUTED')) && R.status().has('Note STRONG_NEW: later'), 'notes: known codes in words, unknown ones as code and message');
    const h1 = lab.hit(1005, 1003), h2 = lab.hit(1020, 1000);
    ok(h1 && h1.part === 'strong' && h1.id === 'c1' && !h2, 'hit within 8 px (zoom 1) of a label, nothing past it', [h1, h2]);
    ok(!lab.hit(1200, 1000), 'the suppressed candidate c2 is no label');
    R.V.emit('cursor', { x: 1005, y: 1003, click: true, hit: h1 });
    const why = R.box('mv.strong.why').textContent;
    ok(why.indexOf('Reverse slope, Side A, ground spot, at 50 m, 50 m') >= 0 && why.indexOf('Behind a crest 12 m away, 2.5 m higher, 30 m wide') >= 0, 'why: head line and the reverse slope reasons', why);
    ok(why.indexOf(en('mapviz.strong.grenade17')) >= 0 && why.indexOf(en('mapviz.strong.honest')) >= 0, 'why: grenade reach 17 m on MoW:AS2 and the honest line');
    ok(why.indexOf('Overwatch: 0.90 (weighted 0.90), engine rule') >= 0 && why.indexOf('Set up first: 0.90 (weighted 0.90), our estimate') >= 0 && why.indexOf('Usable cover: 0.90 (weighted 0.90), inferred inputs') >= 0, 'why: each factor with its source mark', why);
    ok(why.indexOf('In the best spots of 3 of the 3 weightings') >= 0, 'why: presets in the top');
    // the top list goes to the spot
    const tb = buttons(R.box('mv.strong.top'));
    ok(tb.length === 2, 'top list: one button per label');
    tb[1].click(); ok(R.went && R.went.x === -3000 && R.box('mv.strong.why').has('Near what matters, Side B'), 'a top button picks the spot and goes there', R.went);
    // a gated candidate's reasons
    R.V.emit('cursor', { click: true, hit: { part: 'strong', id: 'c4' } });
    ok(R.box('mv.strong.why').has('Not usable: in swimming water, other reason (weird)'), 'why: gate reasons in words, unknown ones as other', R.box('mv.strong.why').textContent);
    // weights: attack (rt 2, fr 2) re-scores; c5 (rt 1, fr 1) stays under 0.5, c1 stays first
    const sel = R.boxes.strong.all().find(e => e.tagName === 'SELECT');
    sel.value = 'attack'; sel.fire('change');
    const rows2 = lab.list(), w = K.PRESETS.attack, s1 = K.scoreOf(F9, w, 'inf');
    ok(rows2[0].label === '1. Side A, Reverse slope, ' + (Math.round(s1 * 100) / 100).toFixed(2), 'attack weights re-score the labels', [rows2, s1]);
    const sl = R.boxes.strong.all().filter(e => e.tagName === 'INPUT' && e.attrs.type === 'range');
    ok(sl[0].value === '1' && sl[5].value === '2', 'the sliders show the preset weights', sl.map(x => x.value));
    sl[1].value = '3'; sl[1].fire('input');
    ok(lab.list()[0].label !== rows2[0].label, 'moving a slider re-scores');
    buttons(R.boxes.strong, en('mapviz.strong.reset'))[0].click();
    ok(same(lab.list(), rows2), 'Reset puts the preset weights back');
    sel.value = 'balanced'; sel.fire('change');
    ok(same(lab.list(), rows), 'balanced shows the product as written');
    // fairness
    const fair = R.box('mv.strong.fair').textContent;
    ok(fair.indexOf('Gap between the sides: 0.30') >= 0 && fair.indexOf('The map is mirrored left to right, off by 3.2 m on average') >= 0 && fair.indexOf('400 square metres differ, 2 objects: 7, 9') >= 0, 'fairness: gap, symmetry and patches', fair);
    ok(same(R.layer('fair.flags').list().map(r => r.label), ['f1: Side A 0.70, Side B 0.40']), 'fair.flags lists the flags with both sides', R.layer('fair.flags').list());
    // the side select narrows the labels
    R.q.side = 'b'; ok(same(lab.list().map(r => r.label), ['1. Side B, Near what matters, 0.80']), 'side b: only side b labels'); R.q.side = 'both';
    // drawing the labels: filled side a, outlined side b, dashed ring for spread > 0.1
    const d = R.draw('strong.labels');
    ok(!d.err && d.log.some(x => x.op === 'fillText' && x.args[0] === '1') && d.log.filter(x => x.op === 'setLineDash' && x.args[0].length).length === 1, 'labels drawn with rank text and one dashed spread ring', d.err); }

  // ---- checker faults: count by page side, pick per product, resolved phase, job phase, gate ground, howitzer, grenade ----
  { const S = await ready('mowas2', { q: { target: 'mowas2', side: 'a' } });
    ok(S.status().has('1 spots marked for Infantry.') && S.layer('strong.labels').list().length === 1, 'side a: the status counts the shown labels', S.status().textContent);
    // a pick is dropped when the kind (so the product) changes: c1 of tank is not the c1 picked under inf
    const P = await ready('mowas2');
    P.V.emit('cursor', { click: true, hit: { part: 'strong', id: 'c1' } });
    ok(P.box('mv.strong.why').has('Reverse slope, Side A'), 'pick c1 under inf');
    P.q.kind = 'tank'; P.V.emit('map', { key: MAP }); await flush();
    ok(P.box('mv.strong.why').textContent === en('mapviz.strong.whyNone'), 'kind changed: the why panel shows no pick', P.box('mv.strong.why').textContent);
    P.q.kind = 'inf'; P.V.emit('map', { key: MAP }); await flush();
    ok(P.box('mv.strong.why').textContent === en('mapviz.strong.whyNone'), 'back to inf: the old pick stays dropped');
    // the resolved phase while the mode holds two or more phases
    const ph = async (phases, phase) => { const X = start({ q: { phases }, api: madeApi(product({ phase }), {}) }); X.V.emit('map', { key: MAP }); await flush(); return X.status().textContent; };
    const t1 = await ph([0, 1], 1), t0 = await ph([0, 1], null), tn = await ph([0], 0);
    ok(t1.indexOf(L.en['mapviz.shell.phaseN'].replace('{n}', '1')) >= 0 && t0.indexOf(en('mapviz.shell.phaseFirst')) >= 0 && !/phase/i.test(tn), 'ready: Phase N, First phase for null, nothing for one phase', [t1, t0, tn]);
    // page phase null: a phase 2 job of the same mode and kind is another product, Make it stays
    const M = start({ api: () => Promise.reject(needErr({ what: 'strong', args: { map: MAP, mode: 'battle_zones', kind: 'inf' } })) });
    M.V.emit('map', { key: MAP }); await flush();
    M.q.jobs = [{ id: 'j9', what: 'strong', target: 'mowas2', map: MAP, args: { map: MAP, mode: 'battle_zones', kind: 'inf', phase: 2 }, text: 'phase 2 job' }]; M.V.emit('job', {});
    ok(buttons(M.status(), en('mapviz.shell.make')).length === 1 && !M.status().has('phase 2 job'), 'page phase null: a phase 2 job leaves Make it', M.status().textContent);
    M.q.jobs = [{ id: 'j8', what: 'strong', target: 'mowas2', map: MAP, args: { map: MAP, mode: 'battle_zones', kind: 'inf' }, text: 'null phase job' }]; M.V.emit('job', {});
    ok(buttons(M.status(), en('mapviz.shell.make')).length === 0 && M.status().has('null phase job'), 'page phase null: a job with no phase shows Making');
    // gate legend: 'ground' is off the ground mesh, not an other reason
    const gg = { 'strong.a.inf.gate': gridEnv('strong.a.inf.gate', 2, 2, [250, 255, 0, 250], { reasons: { GATE_SWIM: 1, ground: 1 } }) };
    const GG = await ready('mowas2', { grids: gg, q: { target: 'mowas2', side: 'a' } }); GG.V.emit('layers', { visible: ['strong.gate'] }); await flush();
    const gl = GG.layer('strong.gate').legend(GG.V).map(r => r.label);
    ok(gl.indexOf(en('mapviz.strong.gate.ground') + ': 1 cells') >= 0 && !gl.some(r => /other reason/.test(r)), 'gate legend: ground in its own words', gl);
    // the strong part now writes off-ground cells as meta.offGround, not in reasons: the same words, on all three games
    const go = [];
    for (const t of ['as64', 'mowas2', 'goh']) { const og = { 'strong.a.inf.gate': gridEnv('strong.a.inf.gate', 2, 2, [250, 255, 0, 250], { reasons: { GATE_SWIM: 1 }, offGround: 3 }) };
      const X = await ready(t, { grids: og, q: { target: t, side: 'a' } }); X.V.emit('layers', { visible: ['strong.gate'] }); await flush(); go.push(X.layer('strong.gate').legend(X.V).map(r => r.label)); }
    ok(go.every(l => l.indexOf(en('mapviz.strong.gate.ground') + ': 3 cells') >= 0 && l.filter(r => r.indexOf(en('mapviz.strong.gate.ground')) === 0).length === 1), 'gate legend: meta.offGround in the ground words on AS64, MoW:AS2 and GoH', go);
    const gz = { 'strong.a.inf.gate': gridEnv('strong.a.inf.gate', 2, 2, [250, 255, 0, 250], { reasons: { GATE_SWIM: 1 }, offGround: 0 }) };
    const GZ = await ready('mowas2', { grids: gz, q: { target: 'mowas2', side: 'a' } }); GZ.V.emit('layers', { visible: ['strong.gate'] }); await flush();
    ok(!GZ.layer('strong.gate').legend(GZ.V).some(r => r.label.indexOf(en('mapviz.strong.gate.ground')) === 0), 'seeded: offGround 0 gives no ground row');
    // howitzer reach: read from the gun presets (range_medium_howitzer, GoH range_190_howitzer); a grid meta without a
    // fallback source has no mark on AS64 and MoW:AS2, GoH keeps the mark (which howitzer a side brings is assumed)
    const hz = { 'strong.a.inf.howitzer': gridEnv('strong.a.inf.howitzer', 2, 2, [0, 1, 2, 3], { weapon: 'w_howitzer', reachM: 1000 }, { scale: 1 }) };
    const hl = [];
    for (const t of ['as64', 'mowas2', 'goh']) { const X = await ready(t, { grids: hz, q: { target: t, side: 'a' } }); X.V.emit('layers', { visible: ['strong.howitzer'] }); await flush(); hl.push(X.layer('strong.howitzer').legend(X.V).map(r => r.label).join('; ')); }
    ok(hl[0] === hl[1] && hl[0].indexOf('w_howitzer, reach 1000 m') >= 0 && hl[0].indexOf(en('mapviz.strong.srcInferred')) < 0 && hl[2].indexOf('w_howitzer, reach 1000 m ' + en('mapviz.strong.srcInferred')) >= 0,
      'howitzer legend: no mark on AS64 and MoW:AS2 (read from data), inferred on GoH', hl);
    // grenade reach: the product's number when it writes frame.weapons.grenade, on every game
    const gw = async (t, g) => { const j = product({ target: t }); j.frame.weapons = { grenade: g }; const X = start({ q: { target: t }, api: madeApi(j, {}) }); X.V.emit('map', { key: MAP }); await flush(); X.V.emit('cursor', { click: true, hit: { part: 'strong', id: 'c1' } }); return X.box('mv.strong.why').textContent; };
    const gs = await gw('mowas2', { name: 'grenade_ap', reachM: 19, source: 'stack' }), g6 = await gw('as64', { name: 'grenade_ap', reachM: 19, source: 'stack' });
    const gf = await gw('mowas2', { name: 'grenade_ap', reachM: 17, source: 'fallback' }), gh = await gw('goh', { name: 'anti-personnel', reachM: 20.7, source: 'stack' });
    const gn = m => L.en['mapviz.strong.grenadeN'].replace('{m}', m);
    ok(gs.indexOf(gn('19')) >= 0 && gs.indexOf(gn('19') + ' ' + en('mapviz.strong.srcInferred')) < 0 && g6.indexOf(gn('19')) >= 0 && gf.indexOf(gn('17') + ' ' + en('mapviz.strong.srcInferred')) >= 0 && gh.indexOf(gn('20.7') + ' ' + en('mapviz.strong.srcInferred')) >= 0,
      'grenade reach from the product: the number on every game, inferred on a fallback and on GoH', [gs, gf, gh]);
    // mortar reach (strong.danger legend): frame.weapons.mortar decides the mark by one rule on all three games; a grid
    // meta without the weapon takes the name and reach from frame.weapons
    const ml = async (t, wm, meta, suf, m2, fw) => { suf = suf || 'danger'; const j = product({ target: t }); if (wm) j.frame.weapons = { mortar: wm }; if (fw) j.frame.weapons = fw;
      const gd = { ['strong.a.inf.' + suf]: gridEnv('strong.a.inf.' + suf, 2, 2, [0, 1, 2, 3], m2 || meta, { scale: 1 }) };
      const X = start({ q: { target: t, side: 'a' }, api: madeApi(j, gd) }); X.V.emit('map', { key: MAP }); await flush(); X.V.emit('layers', { visible: ['strong.' + suf] }); await flush();
      return X.layer('strong.' + suf).legend(X.V).map(r => r.label).join('; '); };
    const IN = ' ' + en('mapviz.strong.srcInferred'), mst = { name: 'werfer42', reachM: 110, source: 'stack' }, mfb = { name: 'mortar', reachM: 110, source: 'fallback' };
    const m6 = await ml('as64', mst, { weapon: 'werfer42', reachM: 110 }), m2 = await ml('mowas2', mst, { weapon: 'werfer42', reachM: 110 });
    const f6 = await ml('as64', mfb, { weapon: 'mortar', reachM: 110 }), f2 = await ml('mowas2', mfb, { weapon: 'mortar', reachM: 110 });
    const mg = await ml('goh', { name: 'medium_mortar_range', reachM: 160, source: 'stack' }, { weapon: 'medium_mortar_range', reachM: 160 });
    const fg = await ml('goh', { name: 'mortar', reachM: 160, source: 'fallback' }, { weapon: 'mortar', reachM: 160 });
    ok(m6 === m2 && m6.indexOf('werfer42, reach 110 m') >= 0 && m6.indexOf('werfer42, reach 110 m' + IN) < 0, 'mortar legend: a stack reach on AS64 and MoW:AS2 has no mark, the same on both', [m6, m2]);
    ok(f6 === f2 && f6.indexOf('mortar, reach 110 m' + IN) >= 0, 'mortar legend: a fallback reach is inferred on AS64 and MoW:AS2', [f6, f2]);
    ok(mg.indexOf('medium_mortar_range, reach 160 m' + IN) >= 0 && fg.indexOf('mortar, reach 160 m' + IN) >= 0, 'mortar legend: GoH inferred, stack and fallback', [mg, fg]);
    const mo = await ml('mowas2', { name: 'werfer42', reachM: 120, source: 'stack' }, {});
    ok(mo.indexOf('werfer42, reach 120 m') >= 0, 'mortar legend: no weapon in the grid meta, the name and reach come from frame.weapons', mo);
    const hf = await ml('mowas2', null, {}, 'howitzer', { weapon: 'howitzer', reachM: 225 }, { howitzer: { name: 'howitzer', reachM: 225, source: 'fallback' } });
    ok(hf.indexOf('howitzer, reach 225 m ' + en('mapviz.strong.srcInferred')) >= 0, 'howitzer legend: a fallback reach is inferred on MoW:AS2', hf);
    const m0 = await ml('mowas2', null, {});
    ok(!/reach d/.test(m0), 'seeded: no meta weapon and no frame.weapons gives no reach row (old product)', m0);
    const bw = [1, 2, 3].map(b => en('mapviz.strong.band.' + b));
    ok(bw.every(w => m0.indexOf(w) >= 0) && /reach/i.test(bw[0]) && /observed/.test(bw[1]) && /seen directly/.test(bw[2]), 'danger bands: the words say the thresholds (reach, observed, seen directly)', bw); }

  // ---- AS64 and MoW:AS2 give the same; Gates of Hell words ----
  { const A6 = await ready('as64'), G = await ready('goh');
    const txt = X => [X.layer('strong.labels').list(), X.status().textContent, X.box('mv.strong.fair').textContent, X.layer('strong.f.ow').legend(X.V).map(r => r.label)];
    ok(same(txt(A6), txt(R)), 'AS64 and MoW:AS2: the same rows, status, fairness and legends');
    // every layer's legend and list, and the why text of a pick, for each unit kind: AS64 equals MoW:AS2 (page-pg3 4.7)
    const full = async (t, k) => { const X = await ready(t, { q: { target: t, kind: k } }); X.V.emit('cursor', { click: true, hit: { part: 'strong', id: 'c1' } });
      const ids = ['strong.labels', 'strong.score', 'strong.threat', 'strong.uncont', 'strong.first', 'strong.gate', 'strong.contact', 'strong.danger', 'strong.howitzer', 'strong.nocrest', 'fair.flags', 'fair.symmetry', 'game.fort'];
      return ids.map(id => { const l = X.layer(id); return [id, l.legend ? l.legend(X.V).map(r => r.label) : null, l.list ? l.list() : null]; }).concat([X.box('mv.strong.why').textContent, X.status().textContent]); };
    for (const k of ['inf', 'mg', 'at', 'tank']) { const a = await full('as64', k), m = await full('mowas2', k); ok(same(a, m), 'AS64 and MoW:AS2: every legend, list, the why text and the status, kind ' + k); }
    { const lr = R.layer('strong.f.df').legend(R.V), z = lr.find(r => r.label === '0.00'), nd = lr.find(r => r.label === en('mapviz.strong.legNoData'));
      ok(z && /^#[0-9a-f]{8}$/i.test(z.color) && nd && nd.color === null && lr.indexOf(z) < lr.indexOf(nd), 'factor legend: 0.00 has a colour (a value), no data has none', lr); }
    ok(R.layer('strong.f.ow').legend(R.V).some(r => r.label === en('mapviz.strong.legOw')) && G.layer('strong.f.ow').legend(G.V).some(r => r.label === en('mapviz.strong.legOwGoh')), 'Overwatch legend: weighted on MoW:AS2, flat on GoH');
    G.V.emit('cursor', { click: true, hit: { part: 'strong', id: 'c1' } });
    ok(G.box('mv.strong.why').has(en('mapviz.strong.grenadeData')) && !G.box('mv.strong.why').has(en('mapviz.strong.grenade17')), 'GoH: grenade reach from data, inferred');
    // fortification slots: GoH from the doc; a slot without x is skipped (seeded defect); none on MoW:AS2
    const fl = G.layer('game.fort').list();
    ok(same(fl.map(r => r.label), ['f1, slot 1 (trench)', 'f1, slot 3 (mg_nest)']), 'GoH: fort slots from flags[].fort, a slot without x skipped', fl);
    const fh = G.layer('game.fort').hit(102, 118);
    ok(fh && fh.part === 'strong' && fh.fort === 0, 'fort hit gives {part: strong, fort: i}', fh);
    ok(R.layer('game.fort').list().length === 0 && same(R.layer('game.fort').legend(R.V).map(r => r.label), [en('mapviz.strong.legNoFort')]), 'MoW:AS2: no fort slots, the legend says so');
    const fd = G.draw('game.fort'); ok(!fd.err && fd.log.filter(x => x.op === 'strokeRect').length === 2, 'GoH: two fort marks drawn', fd.err);
    // GoH: a candidate on a fortification slot names its source; the mortar reach is marked inferred on GoH only
    const pf = product({ target: 'goh' }); pf.candidates.push(cand('c6', 'a', 100, 120, 0.7, { src: 'fort', uid: null }));
    const dz = { 'strong.a.inf.danger': gridEnv('strong.a.inf.danger', 2, 2, [0, 1, 2, 3], { weapon: 'mortar_a', reachM: 110 }, { scale: 1 }) };
    const GF = start({ q: { target: 'goh' }, api: madeApi(pf, dz) }); GF.V.emit('map', { key: MAP }); await flush();
    GF.V.emit('cursor', { click: true, hit: { part: 'strong', id: 'c6' } });
    ok(GF.box('mv.strong.why').has(en('mapviz.strong.src.fort')), 'GoH: a fort slot candidate names its source', GF.box('mv.strong.why').textContent);
    const MW = start({ q: { target: 'mowas2' }, api: madeApi(product(), dz) }); MW.V.emit('map', { key: MAP }); await flush();
    for (const X of [GF, MW]) { X.q.side = 'a'; X.V.emit('layers', { visible: ['strong.danger'] }); await flush(); }
    const lg = X => X.layer('strong.danger').legend(X.V).map(r => r.label).join('; ');
    ok(lg(GF).indexOf('mortar_a, reach 110 m ' + en('mapviz.strong.srcInferred')) >= 0 && lg(MW).indexOf('mortar_a, reach 110 m') >= 0 && lg(MW).indexOf(en('mapviz.strong.srcInferred')) < 0, 'mortar reach: from the stack on MoW:AS2, marked inferred on GoH', [lg(GF), lg(MW)]); }

  // ---- grids: score pictures per side, gate hatch, hover, re-weighted grid ----
  { const sa = gridEnv('strong.a.inf.score', 2, 2, [250, 255, 0, 125]), sb = gridEnv('strong.b.inf.score', 2, 2, [0, 0, 250, 0]);
    const gate = gridEnv('strong.a.inf.gate', 2, 2, [250, 250, 0, 250], { reasons: { GATE_SWIM: 1 } }), gateB = gridEnv('strong.b.inf.gate', 2, 2, [250, 250, 250, 250]);
    const grids = { 'strong.a.inf.score': sa, 'strong.b.inf.score': sb, 'strong.a.inf.gate': gate, 'strong.b.inf.gate': gateB };
    K.APPLIES.inf.forEach(f => { grids['strong.a.inf.' + f] = gridEnv('strong.a.inf.' + f, 2, 2, [250, f === 'cv' ? 255 : 250, 250, 125]); grids['strong.b.inf.' + f] = gridEnv('strong.b.inf.' + f, 2, 2, [250, 250, 250, 250]); });
    const G = await ready('mowas2', { grids });
    // the balanced score grids of both sides are asked once when the product is ready (for the hover row)
    ok(same(G.calls.filter(c => c.p === 'layer' && c.b.name !== 'objects').map(c => c.b.name), ['strong.a.inf.score', 'strong.b.inf.score']), 'ready: one GET per side for the score grid, nothing else', G.calls);
    const d = G.draw('strong.score');
    ok(!d.err && d.puts.length === 1 && d.log.some(x => x.op === 'drawImage'), 'both sides: one picture, drawn over the grid box', d.err);
    const px = (put, i, j) => { const img = put.args[0], o = ((img.height - 1 - j) * img.width + i) * 4; return Array.from(img.data.slice(o, o + 4)); };
    if (d.puts[0]) {
      const wa = hexRgba(PAL.sides.a.wash), wb = hexRgba(PAL.sides.b.wash);
      ok(same(px(d.puts[0], 0, 0), [wa[0], wa[1], wa[2], 204]) && same(px(d.puts[0], 0, 1), [wb[0], wb[1], wb[2], 204]), 'both sides: each cell in the wash of the stronger side', [px(d.puts[0], 0, 0), px(d.puts[0], 0, 1)]);
      ok(same(px(d.puts[0], 1, 0), [wb[0], wb[1], wb[2], 51]), 'raw 255 on one side and 0 on the other: a 0 is a value, the faint wash of the side that has it (0.25 x 0.8)', px(d.puts[0], 1, 0)); }
    G.q.side = 'a'; const da = G.draw('strong.score');
    ok(da.puts[0] && same(px(da.puts[0], 0, 0), hexRgba(PAL.strong.stops[2].color)), 'one side: the strong stops', [da.err, da.puts.length, da.puts[0] && px(da.puts[0], 0, 0)]);
    // hover: the page side's score
    const hv = G.hovers[0](20, 20);
    ok(same(hv, [{ label: 'mapviz.strong.lay.score', value: '1.00' }]), 'hover row Strong point score of the page side', hv);
    G.q.side = 'both';
    ok(G.hovers[0](20, 20)[0].value === 'Side A 1.00, Side B 0.00', 'hover with both sides: one value each', G.hovers[0](20, 20));
    // gate: failed cells hatched in masks.blocked
    G.draw('strong.gate'); await flush(); const dg = G.draw('strong.gate');
    const bl = hexRgba(PAL.masks.blocked.fill), hc = hexRgba(PAL.masks.blocked.hatch.color);
    ok(dg.puts[0] && [bl, hc].some(c => same(px(dg.puts[0], 0, 1), c)) && px(dg.puts[0], 0, 0)[3] === 0, 'gate: a failed cell in the blocked mask, a passed cell clear', dg.puts[0] && [px(dg.puts[0], 0, 1), px(dg.puts[0], 0, 0)]);
    ok(G.layer('strong.gate').legend(G.V).some(r => r.label === 'in swimming water: 1 cells'), 'gate legend: the reasons of meta.reasons in words');
    // other weights: the score grid is made from the factor grids and the gate; a factor raw 255 is nodata
    const sel = G.boxes.strong.all().find(e => e.tagName === 'SELECT'); sel.value = 'hold'; sel.fire('change');
    G.q.side = 'a'; G.draw('strong.score'); await flush(); await flush(); const dw = G.draw('strong.score');
    const asked = G.calls.filter(c => c.p === 'layer').map(c => c.b.name);
    ok(K.APPLIES.inf.every(f => asked.indexOf('strong.a.inf.' + f) >= 0) && asked.filter(n => /^strong\.a\.inf\./.test(n)).length <= 10, 'other weights: the factor grids of the kind and the gate are fetched (at most 10 per side)', asked);
    ok(dw.puts[0] && px(dw.puts[0], 1, 0)[3] === 0 && px(dw.puts[0], 0, 1)[3] === 0 && px(dw.puts[0], 0, 0)[3] > 0, 'other weights: factor raw 255 and gate 0 cells are nodata, others drawn', dw.puts[0] && [px(dw.puts[0], 1, 0), px(dw.puts[0], 0, 1), px(dw.puts[0], 0, 0)]);
    // a layer not made shows not made in its legend
    G.draw('strong.threat'); await flush();
    ok(G.layer('strong.threat').legend(G.V).some(r => r.label === en('mapviz.shell.notMade')), 'a grid that is not made: legend says not made yet');
    ok(G.layer('strong.f.amb').legend(G.V)[0].label === en('mapviz.strong.legNA'), 'a factor not used for the kind says so');
    // checker fault: product ready, strong.score off: the hover row has the score, never "not made yet"; hovering never fetches
    const Q = await ready('mowas2', { grids, q: { target: 'mowas2', phase: 1 } });
    const n0 = Q.calls.length, hq = Q.hovers[0](20, 20);
    ok(Q.calls.length === n0 && hq.length === 1 && hq[0].value === 'Side A 1.00, Side B 0.00' && hq[0].value.indexOf(en('mapviz.shell.notMade')) < 0, 'hover with strong.score off: the score of each side, no GET while hovering', [Q.calls, hq]);
    const sq = Q.calls.filter(c => c.p === 'layer' && /score$/.test(c.b.name));
    ok(sq.length === 2 && sq.every(c => c.b.kind === 'inf' && c.b.phase === 1), 'the score grids carry kind and the page phase', sq);
    Q.V.emit('layers', { visible: ['strong.uncont'] }); await flush();
    const lq = Q.calls.filter(c => c.p === 'layer' && /uncont$/.test(c.b.name));
    ok(lq.length === 2 && lq.every(c => c.b.kind === 'inf' && c.b.phase === 1) && same(lq.map(c => c.b.name).sort(), ['strong.a.inf.uncont', 'strong.b.inf.uncont']), 'layers: GET layer per side with kind and phase', lq);
    // other weights, factor grids never asked for: the row asks to turn the layer on; a score grid that answered a need
    // is "not made yet"; one still on its way says loading
    const sel2 = Q.boxes.strong.all().find(e => e.tagName === 'SELECT'); sel2.value = 'hold'; sel2.fire('change');
    ok(Q.hovers[0](20, 20)[0].value === 'Side A ' + L.en['mapviz.strong.hoverOff'].replace('{layer}', en('mapviz.strong.lay.score')) + ', Side B ' + L.en['mapviz.strong.hoverOff'].replace('{layer}', en('mapviz.strong.lay.score')), 'other weights, factor grids not asked for: the row says turn the layer on', Q.hovers[0](20, 20));
    const N = await ready('mowas2', { grids: {} });
    ok(N.hovers[0](20, 20)[0].value === 'Side A ' + en('mapviz.shell.notMade') + ', Side B ' + en('mapviz.shell.notMade'), 'a score grid that answered a need: not made yet', N.hovers[0](20, 20));
    const W = start({ api: (p, b) => (p === 'strong' ? Promise.resolve(product()) : new Promise(() => {})) }); W.V.emit('map', { key: MAP }); await flush();
    ok(W.hovers[0](20, 20)[0].value === 'Side A ' + en('mapviz.shell.loading') + ', Side B ' + en('mapviz.shell.loading'), 'a score grid on its way: loading', W.hovers[0](20, 20)); }

  // ---- the route: on the shell's library with a stub cache ----
  const hits = {}, dirOf = n => { const d = path.join(SCR, 'e' + n); fs.mkdirSync(d, { recursive: true }); return d; };
  const keyOf = o => JSON.stringify([o.what, o.target, o.map, o.mode || null, o.kind || null, o.phase == null ? null : o.phase]);
  SH._t.use({ cache: { entryKey: keyOf, open: k => hits[k] || null } });
  const route = SRV.routes['GET /api/x/mapviz/strong'];
  const get = async qs => { try { return { j: await route(new URL('http://x/api/x/mapviz/strong?' + qs), null, {}) }; } catch (e) { return { e }; } };
  const put = (o, j, n) => { const d = dirOf(n); fs.writeFileSync(path.join(d, 'strong.' + o.kind + '.json'), typeof j === 'string' ? j : JSON.stringify(j)); hits[keyOf(Object.assign({ what: 'strong', target: 'mowas2', map: MAP }, o))] = { dir: d, manifest: {} }; };
  { ok(SRV._t.shellLib() === SH.lib, 'the route runs on the shell route library');
    put({ mode: 'battle_zones', kind: 'inf' }, product(), 1);
    const a = await get('target=mowas2&map=' + MAP + '&mode=battle_zones&side=both&kind=inf&game=g&modDir=m');
    ok(a.j && a.j.kind === 'strong' && a.j.map === MAP && a.j.target === 'mowas2' && a.j.candidates.length === 5, 'GET strong: the product with map and target', a.e && a.e.params);
    const ph = await get('target=mowas2&map=' + MAP + '&mode=battle_zones&kind=inf&phase=2');
    ok(ph.e && ph.e.status === 404 && same(ph.e.params.need, { what: 'strong', args: { map: MAP, mode: 'battle_zones', kind: 'inf', phase: 2 } }), '404 need {what: strong, args: {map, mode, kind, phase}}', ph.e && ph.e.params);
    const tk = await get('target=mowas2&map=' + MAP + '&mode=battle_zones&kind=tank');
    ok(tk.e && tk.e.status === 404 && tk.e.params.need.args.kind === 'tank' && tk.e.params.need.args.phase === undefined, 'need for another kind, no phase when none is asked', tk.e && tk.e.params);
    for (const [qs, what] of [['target=mowas2&map=' + MAP + '&kind=inf&bogus=1', 'an unknown argument'], ['target=mowas2&map=' + MAP, 'no kind'], ['target=mowas2&map=' + MAP + '&kind=heli', 'a kind not inf, mg, at or tank'], ['target=mowas2&map=' + MAP + '&kind=inf&phase=1.5', 'a phase that is not a whole number'], ['map=' + MAP + '&kind=inf', 'no target']]) {
      const r = await get(qs); ok(r.e && r.e.status === 400 && r.e.key === 'mapviz.err.MV_USAGE', '400 MV_USAGE for ' + what, r.e && [r.e.status, r.e.params]); }
    // seeded defects: version 2, candidates not a list, not JSON
    put({ mode: 'combat', kind: 'inf' }, product({ v: 2 }), 2);
    put({ mode: 'combat', kind: 'mg' }, product({ candidates: {} }), 3);
    put({ mode: 'combat', kind: 'at' }, '{not json', 4);
    put({ mode: 'combat', kind: 'tank' }, product({ kind: 'sight' }), 5);
    for (const [k, what] of [['inf', 'a v 2 file'], ['mg', 'candidates not a list'], ['at', 'a file that is not JSON'], ['tank', 'kind not strong']]) {
      const r = await get('target=mowas2&map=' + MAP + '&mode=combat&kind=' + k); ok(r.e && r.e.status === 500 && r.e.key === 'mapviz.err.MV_FAULT', '500 MV_FAULT for ' + what, r.e && [r.e.status, r.e.params]); }
    // the same answer for AS64 (its own key), GoH too
    hits[keyOf({ what: 'strong', target: 'as64', map: MAP, mode: 'battle_zones', kind: 'inf' })] = hits[keyOf({ what: 'strong', target: 'mowas2', map: MAP, mode: 'battle_zones', kind: 'inf' })];
    const a6 = await get('target=as64&map=' + MAP + '&mode=battle_zones&kind=inf');
    ok(a6.j && same(Object.assign({}, a6.j, { target: 'mowas2' }), a.j), 'AS64: the same answer under its own target');
    SRV._t.use({ lib: null });
    const nb = await get('target=mowas2&map=' + MAP + '&kind=inf');
    ok(nb.e && nb.e.status === 501 && nb.e.key === 'mapviz.err.MV_NOT_BUILT', 'no shell library: 501 MV_NOT_BUILT');
    SRV._t.reset(); }

  // ---- on the real shell: GET strong carries the page fields; the need shows Make it; no job without a press ----
  { const calls = [];
    for (const k of Object.keys(hits)) delete hits[k];
    const routes = {
      'GET /api/x/mapviz/palette': async () => PAL,
      'GET /api/x/mapviz/cache': async () => ({ v: 1, root: '<cache>', bytes: 0, cap: 1, entries: 0, jobs: 0 }),
      'GET /api/x/mapviz/doc': async () => clone(FXA.as2.doc.a),
      'GET /api/x/mapviz/strong': route,
      'GET /api/x/mapviz/layer': async () => { throw needErr({ what: 'strong', args: { map: MAP, kind: 'inf' } }); },
    };
    const S = { gameId: 'mowas2', gameOv: '<game>', mod: '', mapKey: 'map/' + MAP };
    const P = H.mkPage({ scripts: [SHELL, PART], lang: L, S, canvas: true, api: H.routeApi(routes, calls) });
    P.screen.refresh(); await flush(80); P.V.redraw(); await flush(40);
    const g = calls.find(c => c.path === '/api/x/mapviz/strong');
    const u = g && new URL(g.url, 'http://x');
    ok(u && u.searchParams.get('target') === 'mowas2' && u.searchParams.get('map') === MAP && u.searchParams.get('kind') === 'inf' && !!u.searchParams.get('mode'), 'shell: GET strong carries target, map, mode and kind', g && g.url);
    const st = H.blk(P.root, 'mv.strong.status');
    ok(st && buttons(st, en('mapviz.shell.make')).length === 1, 'shell: the need shows Make it', st && st.textContent);
    ok(calls.every(c => c.method === 'GET'), 'shell: GET only, no job without a press', calls.map(c => c.method + ' ' + c.path));
    const C3 = [], P3 = H.mkPage({ scripts: [SHELL, PART], lang: L, S: Object.assign({}, S), canvas: true, rmt: true, api: H.routeApi(routes, C3) });
    let err = null; try { P3.screen && P3.screen.refresh && P3.screen.refresh(); await flush(10); } catch (e) { err = e.message; }
    ok(!err && C3.length === 0, 'shell on RMT: no mapviz call', C3); }
  SH._t.reset();

  // ---- the page rules against the strong rules (tools/mapviz/strong) when they are built ----
  let SI = null, CLm = null;
  try { SI = require(path.join(ROOT, 'strong/index')); CLm = require(path.join(ROOT, 'strong/classify')); } catch (e) { SI = null; }
  if (!SI || typeof SI.score !== 'function' || !CLm || typeof CLm.labels !== 'function') console.log('skip strong: not built (tools/mapviz/strong), the page rules are not compared with it');
  else {
    ok(same(SI.APPLIES, K.APPLIES) && same(SI.FACTORS, K.FACT) && same(SI.CLASSIFIERS, K.CLS), 'APPLIES, FACTORS and CLASSIFIERS as strong/index.js');
    ok(['balanced', 'hold', 'attack'].every(p => K.FACT.every(f => SI.PRESETS[p][f] === K.PRESETS[p][f])), 'PRESETS as strong/index.js');
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    let agreeS = true, agreeL = true;
    for (const kind of ['inf', 'mg', 'at', 'tank']) for (const pr of ['balanced', 'hold', 'attack']) {
      const list = [];
      for (let i = 0; i < 300; i++) { const f = {}; SI.APPLIES[kind].forEach(id => { if (rnd() > 0.05) f[id] = Math.round(rnd() * 250) / 250; });
        const c = { id: 'r' + i, side: 'a', gate: rnd() > 0.1 ? 1 : 0, x: Math.round(rnd() * 8000), y: Math.round(rnd() * 8000), f };
        const s1 = SI.score(f, SI.PRESETS[pr], kind), s2 = K.scoreOf(f, K.PRESETS[pr], kind);
        if (Math.abs(s1 - s2) > 1e-12) agreeS = false;
        c.score = c.gate ? s1 : 0; list.push(c); }
      list.sort((p, q) => q.score - p.score || p.x - q.x || p.y - q.y);
      const real = CLm.labels(list, kind).map(c => c.id), mine = K.chooseLabels(list, c => c.score, kind).map(l => l.id);
      if (!same(real, mine)) { agreeL = false; console.log('  labels differ ' + kind + ' ' + pr + ': ' + real.join() + ' | ' + mine.join()); } }
    ok(agreeS, 'the page score equals strong/index.js score() on 3600 seeded candidates');
    ok(agreeL, 'the page labels equal strong/classify.js labels() on the same candidates');
  }

  // ---- the fixture [I]: strong/index.js run() on the fixture map with the stand-in sight and cover rules of
  // strong/test/synth.js (no game install: fxmake writes a fake one), read by the page in all three games ----
  let FXM = null, SYN = null, MKIT = null;
  try { FXM = require(path.join(ROOT, 'test/fxmake')); SYN = require(path.join(ROOT, 'strong/test/synth')); MKIT = require(path.join(ROOT, 'lib/mapkit')); } catch (e) { FXM = null; }
  if (!SI || typeof SI.run !== 'function' || !FXM || !SYN || !MKIT) console.log('skip strong: not built (fixture run)');
  else {
    const pix = (put, i, j) => { const img = put.args[0], o = ((img.height - 1 - j) * img.width + i) * 4; return Array.from(img.data.slice(o, o + 4)); };
    for (const [form, target] of [['as2', 'mowas2'], ['as2', 'as64'], ['goh', 'goh']]) {
      let r = null, I = null, err = null;
      try {
        const f = FXM.make(path.join(SCR, 'fx-' + target), { form });
        I = SI.inputs([], { target, map: f.map, mode: 'battle_zones', rules: SYN.rules(), src: MKIT.source({ target, game: f.gameDir }) });
        r = SI.run(I, { kind: 'inf', side: 'both', seed: 1, ensemble: 2 });
      } catch (e) { err = e && e.message || String(e); }
      ok(!err && r && r.json && Array.isArray(r.grids), target + ' fixture: strong run', err);
      if (!r || !r.json) continue;
      const grids = {};
      r.grids.forEach(g => { grids[g.name] = gridEnv(g.name, g.w, g.h, g.data, g.meta, { cell: g.cell, ox: g.ox, oy: g.oy, scale: g.scale, offset: g.offset || 0, nodata: g.nodata, target }); });
      const X = await ready(target, { api: madeApi(Object.assign({}, r.json, { map: MAP, target }), grids) });
      ok(X.status().has(en('mapviz.shell.kind.inf')) && !buttons(X.status()).length, target + ' fixture: the panel reads the product (ready, no button)', X.status().textContent);
      const b1 = ((I.doc.modes.find(m => m.id === 'battle_zones') || {}).spawns || []).find(s => s.name === 'b1');
      X.q.side = 'a';
      const rows = X.layer('strong.labels').list();
      ok(b1 && rows.length > 0 && rows.every(p => Math.hypot(p.x - b1.x, p.y - b1.y) >= 600), target + ' fixture: no side a inf label within 30 m of b1', [b1, rows]);
      X.q.side = 'both';
      X.V.emit('layers', { visible: ['strong.contact'] }); await flush();
      const dc = X.draw('strong.contact'), C = grids['strong.contact.inf'];
      const ci = C ? Math.floor((0 - C.ox) / C.cell) : 0, cj = C ? Math.floor((0 - C.oy) / C.cell) : 0;
      ok(!dc.err && dc.puts[0] && pix(dc.puts[0], ci, cj)[3] > 0, target + ' fixture: strong.contact.inf drawn at (0, 0)', [dc.err, dc.puts.length]);
      ok(dc.log.some(x => x.op === 'setLineDash' && x.args[0].length), target + ' fixture: the midline drawn dashed');
      // frame.weapons as the strong part writes it: {grenade, mortar, howitzer: {name, reachM, source}}; the danger legend
      // shows the mortar reach of the run and marks it by the one rule (fallback or GoH)
      const wp = r.json.frame && r.json.frame.weapons, wok = w => w && typeof w.name === 'string' && typeof w.reachM === 'number' && (w.source === 'stack' || w.source === 'fallback');
      ok(wp && wok(wp.grenade) && wok(wp.mortar) && wok(wp.howitzer), target + ' fixture: the product writes frame.weapons', wp);
      if (wp && wok(wp.mortar)) {
        X.V.emit('layers', { visible: ['strong.danger'] }); await flush();
        const dl = X.layer('strong.danger').legend(X.V).map(x => x.label).join('; '), mk = target === 'goh' || wp.mortar.source === 'fallback';
        const row = 'reach ' + String(Math.round(wp.mortar.reachM * 10) / 10) + ' m';
        ok(dl.indexOf(row) >= 0 && (dl.indexOf(row + ' ' + en('mapviz.strong.srcInferred')) >= 0) === mk, target + ' fixture: the danger legend shows the run mortar reach, marked ' + mk, [dl, wp.mortar]);
      }
    }
  }

  // ---- language file, page code rules ----
  { const codes = ['en', 'ru', 'uk', 'zh'], keys = Object.keys(LS.en);
    ok(codes.every(c => same(Object.keys(LS[c]).sort(), keys.slice().sort())), 'the same keys in en, ru, uk, zh');
    ok(keys.length <= 120 && keys.every(k => /^mapviz\.strong\./.test(k)), 'at most 120 keys, all mapviz.strong.', keys.length);
    ok(codes.every(c => keys.every(k => typeof LS[c][k] === 'string' && LS[c][k] && !/^TODO:/.test(LS[c][k]))), 'every string translated');
    ok(codes.every(c => keys.every(k => same((LS[c][k].match(/\{\w+\}/g) || []).sort(), (LS.en[k].match(/\{\w+\}/g) || []).sort()))), 'the same slots in every language');
    ok(['ru', 'uk', 'zh'].every(c => keys.filter(k => LS[c][k] === LS.en[k] && !/^[{}\d .,:;]*$/.test(LS.en[k].replace(/\{\w+\}/g, ''))).length <= 3), 'translations differ from English');
    ok(codes.every(c => keys.every(k => !/—| - /.test(LS[c][k]))), 'no em dash and no spaced dash');
    const used = new Set([...PART.matchAll(/'(mapviz\.strong\.[A-Za-z0-9.]*[A-Za-z0-9])'/g)].map(m => m[1]));
    ok([...used].every(k => LS.en[k] !== undefined), 'every key the part names is defined', [...used].filter(k => LS.en[k] === undefined));
    ok(!/`|\$\{|innerHTML|=>|\blet\b|\bconst\b/.test(PART), 'client string is ES5 (no backtick, template, innerHTML, arrow, let, const)');
    ok(!/(^|[^\w])[A-Za-z]:[\\/][^\\/]/.test(PART) && !/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(PART), 'client: no drive path, no colour literal');
    ok(codes.every(c => keys.every(k => !/(^|[^\w])as64\b/.test(LS[c][k]))), 'lang: AS64 in capitals'); }

  if (!process.argv[2]) { try { fs.rmSync(SCR, { recursive: true, force: true }); } catch (e) { /* a held file: the OS temp dir clears it */ } }
  console.log(failN ? 'FAIL mapviz strong (' + failN + ' of ' + (pass + failN) + ')' : 'PASS mapviz strong (' + pass + ')');
  process.exit(failN ? 1 : 0);
})().catch(e => { console.log('FAIL mapviz strong: ' + (e && e.stack || e)); process.exit(1); });

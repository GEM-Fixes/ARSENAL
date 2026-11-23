// Map Viewer map checks list test (MV-PG3, builder PG3b): node tools/gui/ext/mapviz/sub/checks.test.js [scratch dir]
// The checks part on a stub V in the fake DOM with synthetic GET checks answers in the frozen form (page-pg3 draft 3.2):
// the layer, the code rows and their states (found, passed, notRun, running, skipped), Make per source and Make all,
// Show (V.go, or metres without it), list() and hit() of checks.map, water items not drawn, a click hit opening its row,
// docBusy, 'doc', 'products', stale twice; AS64 = MoW:AS2 (equal DOM) and the GoH picture words. Then the GET checks
// route on a stubbed cache through the shell's route library (or a test copy of it while the shell has none): needs and
// made sources, the item order, FAIR_FLAG of the four kinds, notes. Then the part on the real shell with that route.
// Seeded defects: a lang file missing one code key, an item with x null (no Show), a picture file given as an engine path
// (shown as "a map picture"), a strong.checks.json that is not a vector (500 MV_FAULT), an unknown code (passes through,
// listed under "Other check"), a phase that is not a whole number from 0 to 99 (400), an argument outside the draft list
// (400). The panel, route and real-shell sections run once per target (as64, mowas2, goh; goh with the GoH fixture
// document). Fixture known answers (rules.md 10): strong.checks of the fixture map per game, through the route to the rows.
// Author: Imperator_Aug (ARSENAL, ia-aacdd8f3)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const OWN = !process.argv[2];
const SCR = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'mv-checks-')));
fs.mkdirSync(SCR, { recursive: true });
process.env.ARSENAL_CACHE = path.join(SCR, 'cache');
const { harness: H } = require('./shell.test');
const fake = require('../../../test/fakedom');
const SHELL = require('./shell.client'), PART = require('./checks.client'), SERVER = require('./checks.server'), SS = require('./shell.server');
const LC = require('./checks.lang.json'), L = H.mergeLang([require('./shell.lang.json'), LC]);
const ROOT = path.resolve(__dirname, '../../../../mapviz');
const PAL = require(path.join(ROOT, 'palette.json'));
const FXA = require(path.join(ROOT, 'test/fxanswers.json'));
let pass = 0, failN = 0;
const ok = (c, what, extra) => { if (c) pass++; else { failN++; console.log('FAIL mapviz checks [' + TG + ']: ' + what + (extra !== undefined ? '\n  ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 700) : '')); } };
const en = k => L.en[k];
const clone = x => JSON.parse(JSON.stringify(x));
const hasN = (a, code) => !!(a && Array.isArray(a.notes) && a.notes.some(n => n && n.code === code));
const flush = H.flush;
const TARGETS = ['as64', 'mowas2', 'goh'];
let TG = 'mowas2';   // the target of the section that runs (every section runs once per target, page-pg3 draft 0)

// ---------- the part on a stub V ----------
function load(o) {
  o = o || {};
  const doc = fake.make(), log = [];
  const X = {};
  const fn = new Function('EXT_SCREENS', 'h', 'tx', 'api', 'S', 'RMT', 'cssv', 'onTheme', 'document', 'window', 'setTimeout', 'Image', 'gohDir', 'navigator', [SHELL, PART].join('\n'));
  fn(X, H.hOf(doc), H.txOf(L, o.code || 'en'), () => Promise.reject(new Error('no api in a part test')), {}, false, (n, d) => d || '', () => () => {}, doc,
    { requestAnimationFrame: f => f() }, (f, ms) => setTimeout(f, 2), H.ImageStub, () => '', undefined);
  return { X, doc, log, part: X.mapviz.parts.find(p => p.id === 'checks') };
}
function stubV(L0, o) {
  o = o || {};
  const rec = { layers: [], panels: [], on: {}, calls: [], jobs: [], jobRes: [], gos: [], redraws: 0, relists: 0, boxes: {}, answers: (o.answers || []).slice() };
  const q = Object.assign({ target: TG, map: 'multi/mv_fixture', mode: 'battle_zones', side: 'both', kind: 'inf', rmt: false, game: '<game>', mod: null, docBusy: false, jobs: [] }, o.q || {});
  const V = {
    q: n => q[n], doc: clone(TG === 'goh' ? FXA.goh.doc.a : FXA.as2.doc.a), pal: o.pal === undefined ? PAL : o.pal, view: { cx: 0, cy: 0, zoom: 1 },
    addLayer(l) { rec.layers.push(l); return true; },
    addPanel(p) { rec.panels.push(p); const box = L0.doc.createElement('div'); rec.boxes[p.id] = box; p.build(box, V); },
    on(e, f) { (rec.on[e] = rec.on[e] || []).push(f); }, emit(e, d) { (rec.on[e] || []).forEach(f => f(d)); },
    redraw() { rec.redraws++; }, relist() { rec.relists++; }, token: n => 'var-' + n, say() {}, addTool() {}, addHover() {},
    api(m, p, b) { rec.calls.push({ m, p, b: clone(b || {}) }); const a = rec.answers.length ? rec.answers.shift() : o.answer;
      if (typeof a === 'function') return a(); return a instanceof Error ? Promise.reject(a) : a === undefined ? Promise.reject(new Error('no route')) : Promise.resolve(clone(a)); },
    job(w, a) { rec.jobs.push({ what: w, args: clone(a || {}) }); return new Promise(r => { if (o.deferJobs) rec.jobRes.push(r); }); },
  };
  if (o.go !== false) V.go = x => { rec.gos.push(clone(x)); };
  rec.V = V; rec.q = q;
  return rec;
}
function start(o) { const L0 = load(o); const R = stubV(L0, o); L0.part.init(R.V); return Object.assign(R, { L0 }); }
async function opened(o) { const R = start(o); R.V.emit('map', {}); await flush(10); return R; }
const box = R => R.boxes.checks;
const blkOf = (R, id) => box(R).all().find(e => e.attrs['data-blk'] === id) || null;
const rowText = (R, code) => { const b = blkOf(R, 'mv.checks.code.' + code.toLowerCase().replace(/[^a-z0-9.]+/g, '-')); return b ? b.textContent : null; };
const btn = (e, text) => e && e.all().find(x => x.tagName === 'BUTTON' && x.textContent === text);
const buttons = e => (e ? e.all().filter(x => x.tagName === 'BUTTON') : []);
function recCtx(log) { const c = H.stubCtx(log, { _id: 'main' }); return c; }
function mkView(o) {
  o = o || {};
  const v = { cx: 0, cy: 0, zoom: o.zoom || 1, w: 800, h: 600, env: null, pal: PAL, token: n => 'var-' + n };
  v.toScreen = (x, y) => [v.w / 2 + (x - v.cx) * v.zoom, v.h / 2 - (y - v.cy) * v.zoom];
  return v;
}

// ---------- synthetic answers (draft 3.2) ----------
const KINDS = ['inf', 'mg', 'at', 'tank'];
const need = (what, args) => ({ what, args: Object.assign({ map: 'multi/mv_fixture', mode: 'battle_zones' }, args || {}) });
function srcs(made) {   // made: {water, strong, fair: {inf, mg, at, tank}}
  made = made || {};
  const f = made.fair || {};
  return [{ src: 'water', what: 'water', state: made.water ? 'made' : 'need', need: made.water ? undefined : need('water') },
    { src: 'strong', what: 'checks', state: made.strong ? 'made' : 'need', need: made.strong ? undefined : need('checks') }]
    .concat(KINDS.map(k => ({ src: 'fair', what: 'strong', unit: k, state: f[k] ? 'made' : 'need', need: f[k] ? undefined : need('strong', { kind: k }) })))
    .map(s => { if (!s.need) delete s.need; return s; });
}
const ANS = (made, items, notes) => ({ v: 1, kind: 'checks', target: TG, map: 'multi/mv_fixture', mode: 'battle_zones', phase: null, sources: srcs(made), notes: notes || [], items: items || [] });
const W_ITEM = { src: 'water', code: 'SWAMP', x: 300, y: -200, region: 1, area: 53.4, box: [280, -220, 320, -180] };
const S_ITEMS = [
  { src: 'strong', code: 'FLAG_UNREACHABLE', x: -400, y: 0, region: 0, side: 'a', unit: 'tank', flag: 'f1' },
  { src: 'strong', code: 'PICTURE_MISSING', x: null, y: null, region: 0, file: 'minimap' },
  { src: 'strong', code: 'REACH_UNEQUAL', x: 0, y: 0, region: 0, unit: 'inf', flag: 'f2', value: 7.456, limit: 5 },
];
const F_ITEM = { src: 'fair', code: 'FAIR_FLAG', x: 200, y: 100, region: 0, side: 'b', unit: 'inf', flag: 'f3', value: 0.2, limit: 0.15 };
const ALL = { water: true, strong: true, fair: { inf: true, mg: true, at: true, tank: true } };

// ---------- the GET checks route on a stubbed cache ----------
const ROW = { water: { keys: ['mode'] }, checks: { keys: ['mode', 'phase'] }, strong: { keys: ['mode', 'kind', 'phase'] } };
function stubTable(rows) {
  return { JOBS: rows, reduce(req, what) { const r = { what, target: req.target, map: req.map }; for (const k of (rows[what] || { keys: [] }).keys) r[k] = req[k] === undefined ? null : req[k]; return r; } };
}
function stubCache(made) {
  return {
    entryKey(o) { return [o.what, o.map].concat(o.row.keys.map(k => (o[k] == null ? '' : o[k]))).join('|'); },
    open(key) { return made[key] ? { dir: made[key], manifest: {} } : null; },
  };
}
// the shell's lib when it has one; else a test copy of its route helpers (only here, never in the part)
function libFor(table, cache) {
  SS._t.use({ table, cache });
  if (SS.lib && typeof SS.lib.entry === 'function') return { lib: SS.lib, real: true };
  const fail = SS._t.fail, isOurs = e => e && typeof e.key === 'string' && /^mapviz\.err\./.test(e.key) && e.params;
  const lib = {
    COMMON: ['target', 'game', 'mods', 'modDir', 'map', 'mode', 'side', 'kind', 'size'], fail, needOf: SS._t.needOf,
    wrap: fn => async (u, b, c) => { try { return await fn(u, b, c || {}); } catch (e) { if (isOurs(e)) throw e; throw fail('MV_FAULT', e && e.message); } },
    query(u, allowed) { const o = {}; for (const [k, v] of u.searchParams) { if (!allowed.includes(k)) throw fail('MV_USAGE', 'unknown argument ' + k); if (k === 'modDir') { if (v) (o.modDirs = o.modDirs || []).push(v); } else if (v !== '') o[k] = v; } return o; },
    request(q, needMap) { if (!q.target) throw fail('MV_USAGE', 'target is required'); if (needMap && !q.map) throw fail('MV_USAGE', 'map is required'); const r = { target: q.target }; for (const k of ['game', 'mods', 'map', 'mode', 'side', 'kind']) if (q[k] !== undefined) r[k] = q[k]; if (q.modDirs) r.modDirs = q.modDirs; return r; },
    entry(what, req) { const row = table.JOBS[what]; if (!row) throw fail('MV_FAULT', 'no job named ' + what); const hit = cache.open(cache.entryKey(Object.assign({}, req, { what, row }))); if (!hit) throw fail('MV_NOT_FOUND', what + ' of this map is not made yet', SS._t.needOf(what, req)); return hit; },
    readJson(file, what) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { throw fail('MV_FAULT', what + ' cannot be read: ' + e.message); } },
  };
  return { lib, real: false };
}
let entN = 0;
function entryDir(files) { const d = path.join(SCR, 'ent', String(entN++)); fs.mkdirSync(d, { recursive: true }); for (const f of Object.keys(files)) fs.writeFileSync(path.join(d, f), typeof files[f] === 'string' ? files[f] : JSON.stringify(files[f])); return d; }
const vec = (name, items) => ({ v: 1, kind: 'vector', name, items });
const strongJson = (k, checks, notes) => ({ v: 1, kind: 'strong', target: TG, map: 'multi/mv_fixture', mode: 'battle_zones', phase: null, unit: k, candidates: [], labels: [], checks, notes: notes || [] });
async function route(qs, made, rows) {
  const t = libFor(stubTable(rows || ROW), stubCache(made));
  SERVER._t.use({ lib: t.lib });
  try { return { body: await SERVER.routes['GET /api/x/mapviz/checks'](new URL('http://x/api/x/mapviz/checks?' + qs), null, {}), real: t.real }; }
  catch (e) { return { err: e, real: t.real }; }
  finally { SERVER._t.reset(); SS._t.reset(); }
}

(async () => {
  // ---- RMT ----
  { const L0 = load(), R = stubV(L0, { q: { rmt: true } }); L0.part.init(R.V);
    ok(R.layers.length === 0 && R.panels.length === 0 && R.calls.length === 0, 'RMT: no layer, no panel, no call'); }

  // ---- the layer and the panel ----
  for (const target of ['as64', 'mowas2', 'goh']) {
    const R = start({ q: { target } });
    const ls = R.layers;
    ok(ls.length === 1 && ls[0].id === 'checks.map' && ls[0].group === 'checks' && ls[0].defaultOn === false && ls[0].engineTrue === false && typeof ls[0].draw === 'function' && typeof ls[0].list === 'function' && typeof ls[0].hit === 'function' && !ls[0].source,
      target + ': one layer checks.map, group checks, off, not engine true, own draw, list and hit', ls.map(l => l.id));
    ok(R.panels.length === 1 && R.panels[0].id === 'checks' && R.panels[0].side === 'right', target + ': one right panel');
    ok(['mv.checks.title', 'mv.checks.status', 'mv.checks.list'].every(id => blkOf(R, id)), target + ': title, status and list blocks');
    ok(R.calls.length === 0 && R.jobs.length === 0, target + ': building makes no call'); }

  for (TG of TARGETS) {
  // ---- no map; docBusy holds the GET; 'doc' asks once ----
  { const R = start({ q: { map: null }, answer: ANS(ALL) });
    R.V.emit('map', { key: null }); await flush(5);
    ok(box(R).has(en('mapviz.checks.noMap')) && R.calls.length === 0, 'no map: "Open a map to check it.", no call', box(R).textContent);
    R.q.map = 'multi/mv_fixture'; R.q.docBusy = true; R.V.emit('map', {}); await flush(5);
    ok(R.calls.length === 0, 'docBusy: no GET while the document is read');
    R.q.docBusy = false; R.V.emit('doc', { ok: true }); await flush(5); R.V.emit('doc', { ok: true }); await flush(5);
    ok(R.calls.length === 1 && R.calls[0].p === 'checks', 'doc: one GET checks', R.calls);
    const b = R.calls[0].b;
    ok(b.target === TG && b.map === 'multi/mv_fixture' && b.mode === 'battle_zones' && b.game === '<game>' && !('phase' in b), 'the GET carries target, game, map, mode; no phase while it is null', b);
    R.V.emit('map', {}); await flush(5);
    ok(R.calls.length === 1, 'a map event with the same key (side or kind changed) asks nothing more');
    R.q.phase = 2; R.V.emit('map', {}); await flush(5);
    ok(R.calls.length === 2 && R.calls[1].b.phase === 2, 'a phase change asks again with the phase', R.calls[1]);
    R.q.map = null; R.V.emit('map', { key: null }); await flush(5);
    ok(box(R).has(en('mapviz.checks.noMap')) && !blkOf(R, 'mv.checks.code.swamp') && R.layers[0].list().length === 0, 'map closed: cleared, says open a map'); }

  // ---- every source in need: all rows not run, Make per source, nothing drawn ----
  { const R = await opened({ answer: ANS({}) });
    const st = blkOf(R, 'mv.checks.status'), bs = buttons(st);
    ok(bs.filter(b => /^Make: /.test(b.textContent)).length === 6 && btn(st, en('mapviz.checks.makeAll')), 'need: six Make buttons and Make all', bs.map(b => b.textContent));
    ok(btn(st, 'Make: Fairness for Tank') && btn(st, 'Make: Water checks') && btn(st, 'Make: Map checks'), 'need: the buttons name each source');
    ok(st.has('0 found, 0 passed, 20 not run.'), 'need: summary 20 not run', st.textContent);
    ok(rowText(R, 'FAIR_FLAG') === en('mapviz.checks.code.FAIR_FLAG') + ': ' + en('mapviz.checks.state.notRun') && rowText(R, 'SWAMP').indexOf('not run') > 0, 'need: code rows say not run', [rowText(R, 'FAIR_FLAG'), rowText(R, 'SWAMP')]);
    const log = []; R.layers[0].draw(recCtx(log), mkView());
    ok(log.length === 0, 'need: nothing drawn');
    // Make posts the need as given, once
    btn(st, 'Make: Fairness for Tank').click(); await flush(3);
    ok(R.jobs.length === 1 && R.jobs[0].what === 'strong' && JSON.stringify(R.jobs[0].args) === JSON.stringify({ map: 'multi/mv_fixture', mode: 'battle_zones', kind: 'tank' }), 'Make: V.job(need.what, need.args)', R.jobs);
    ok(!btn(blkOf(R, 'mv.checks.status'), 'Make: Fairness for Tank') && blkOf(R, 'mv.checks.status').has('Running: Fairness for Tank'), 'Make: the button gives way to the running words', blkOf(R, 'mv.checks.status').textContent);
    btn(blkOf(R, 'mv.checks.status'), en('mapviz.checks.makeAll')).click(); await flush(3);
    ok(R.jobs.length === 6 && new Set(R.jobs.map(j => j.what + JSON.stringify(j.args))).size === 6, 'Make all: posts each other need once (no second post of the running one)', R.jobs.map(j => j.what + ' ' + (j.args.kind || '')));
    const b2 = blkOf(R, 'mv.checks.status');
    ok(!buttons(b2).length, 'Make all: no Make button left while the jobs run');
    ok(rowText(R, 'FAIR_FLAG').indexOf(en('mapviz.checks.state.running')) > 0 && rowText(R, 'SWAMP').indexOf(en('mapviz.checks.state.running')) > 0, 'running rows while their jobs are posted', rowText(R, 'FAIR_FLAG')); }
  // a need with phase null in its args: the null is left out of the post
  { const a = ANS({ water: true, strong: true, fair: { inf: true, mg: true, at: true } }); a.sources[5].need.args.phase = null;
    const R = await opened({ answer: a }); btn(blkOf(R, 'mv.checks.status'), 'Make: Fairness for Tank').click(); await flush(3);
    ok(R.jobs.length === 1 && !('phase' in R.jobs[0].args), 'Make: a null field of the need is not posted', R.jobs); }

  // ---- a running page job of a source: running words, no Make, row running ----
  { const jobs = [{ id: 'j1', what: 'checks', state: 'running', target: TG, map: 'multi/mv_fixture', args: { map: 'multi/mv_fixture', mode: 'battle_zones' }, text: 'Strong checks: frame' },
      { id: 'j2', what: 'strong', state: 'running', target: TG, map: 'multi/mv_fixture', args: { map: 'multi/mv_fixture', mode: 'battle_zones', kind: 'tank' }, text: 'Strong points: tank' }];
    const R = await opened({ q: { jobs }, answer: ANS({ water: true, fair: { mg: true, at: true } }) });
    const st = blkOf(R, 'mv.checks.status');
    ok(st.has('Running: Strong checks: frame') && st.has('Running: Strong points: tank') && !btn(st, 'Make: Map checks') && !btn(st, 'Make: Fairness for Tank') && btn(st, 'Make: Fairness for Infantry'),
      'running: job words in place of Make; the tank job leaves Make on infantry', st.textContent);
    ok(rowText(R, 'REACH_UNEQUAL').indexOf(en('mapviz.checks.state.running')) > 0 && rowText(R, 'FAIR_FLAG').indexOf(en('mapviz.checks.state.running')) > 0, 'running: strong rows running; the fair row running while one of its kinds runs (before not run)', [rowText(R, 'REACH_UNEQUAL'), rowText(R, 'FAIR_FLAG')]);
    ok(rowText(R, 'SWAMP').indexOf(en('mapviz.checks.state.passed')) > 0, 'partial: a made source with no item of the code: passed'); }

  // ---- found, passed, skipped; item rows; Show; the layer ----
  { const notes = [{ code: 'STRONG_PREVIEWS_ABSENT', msg: 'previews not built' }, { code: 'SOME_OTHER', msg: 'x' }];
    const unknown = { src: 'strong', code: 'NEW_CODE_X', x: 10, y: 10, region: 0 };
    const items = [W_ITEM].concat(S_ITEMS, [unknown, F_ITEM]);
    const R = await opened({ answer: ANS(ALL, items, notes) });
    const st = blkOf(R, 'mv.checks.status');
    ok(st.has('6 found, 14 passed, 0 not run, 1 skipped.'), 'summary: found (other counts), passed, skipped', st.textContent);
    ok(st.has(en('mapviz.checks.note.STRONG_PREVIEWS_ABSENT')) && !st.has('SOME_OTHER') && !buttons(st).length, 'notes in words; an unknown note code is not shown; no Make when all made', st.textContent);
    ok(rowText(R, 'PICTURE_REFUSED').indexOf(en('mapviz.checks.state.skipped')) > 0, 'PICTURE_REFUSED skipped with STRONG_PREVIEWS_ABSENT');
    ok(rowText(R, 'SWAMP') === en('mapviz.checks.code.SWAMP') + ': 1 found' && rowText(R, 'MINIMAP_SPAN').indexOf('passed') > 0, 'found and passed rows', [rowText(R, 'SWAMP'), rowText(R, 'MINIMAP_SPAN')]);
    ok(rowText(R, 'other') === en('mapviz.checks.code.other') + ': 1 found', 'seeded: an unknown code goes under Other check', rowText(R, 'other'));
    const codes = box(R).all().filter(e => /^mv\.checks\.code\./.test(e.attrs['data-blk'] || '')).map(e => e.attrs['data-blk']);
    ok(codes.length === 21 && codes[0] === 'mv.checks.code.fair-flag' && codes[19] === 'mv.checks.code.painted-above-level' && codes[20] === 'mv.checks.code.other', 'rows in catalogue order, other last', codes);
    ok(!box(R).all().some(e => /^mv\.checks\.item\./.test(e.attrs['data-blk'] || '')), 'item rows closed at first');
    // open rows
    const open = code => { const b = btn(blkOf(R, 'mv.checks.code.' + code), rowText(R, code.toUpperCase().replace(/-/g, '_'))); if (b) b.click(); return !!b; };
    ok(open('swamp') && open('flag-unreachable') && open('picture-missing') && open('reach-unequal') && open('fair-flag'), 'rows with items open');
    const item = i => blkOf(R, 'mv.checks.item.' + i);
    ok(item(0) && item(0).has('53 m2') && btn(item(0), en('mapviz.checks.show')), 'water item: area words and Show', item(0) && item(0).textContent);
    btn(item(0), en('mapviz.checks.show')).click();
    ok(R.gos.length === 1 && R.gos[0].x === 300 && R.gos[0].y === -200 && JSON.stringify(R.gos[0].box) === JSON.stringify(W_ITEM.box), 'Show: V.go with x, y and the box of a water item', R.gos);
    ok(item(1) && item(1).textContent.indexOf('Side A, Tank, flag f1') === 0, 'strong item words: side, unit, flag', item(1) && item(1).textContent);
    btn(item(1), en('mapviz.checks.show')).click();
    ok(R.gos.length === 2 && !('box' in R.gos[1]) && R.gos[1].x === -400, 'Show: V.go with x, y only for a strong item', R.gos[1]);
    ok(item(2) && item(2).has('the minimap') && !btn(item(2), en('mapviz.checks.show')), 'seeded: an item with x null has no Show button; picture words', item(2) && item(2).textContent);
    ok(item(3) && item(3).has('value 7.46, limit 5'), 'value and limit words', item(3) && item(3).textContent);
    ok(item(5) && item(5).has('Side B, Infantry, flag f3, value 0.2, limit 0.15'), 'fair item words', item(5) && item(5).textContent);
    // the layer: strong and fair items drawn, water not
    const lay = R.layers[0], log = []; lay.draw(recCtx(log), mkView());
    const arcs = log.filter(x => x.op === 'arc');
    const at = (x, y) => arcs.some(a => Math.abs(a.args[0] - (400 + x)) < 1e-9 && Math.abs(a.args[1] - (300 - y)) < 1e-9);
    ok(at(-400, 0) && at(0, 0) && at(200, 100) && at(10, 10) && !at(300, -200), 'draw: rings at strong and fair items, not at the water item', arcs.map(a => a.args.slice(0, 2)));
    ok(log.filter(x => x.op === 'fill').length === 4, 'draw: four marks (one has no place)', log.filter(x => x.op === 'fill').length);
    const li = lay.list();
    ok(li.length === 4 && li.every(x => typeof x.x === 'number') && li[0].label === en('mapviz.checks.code.FLAG_UNREACHABLE') + ': Side A, Tank, flag f1', 'list(): the drawn items', li);
    const h1 = lay.hit(-395, 3), h2 = lay.hit(-390, 0), h3 = lay.hit(300, -200);
    ok(h1 && h1.part === 'checks' && h1.i === 1 && h2 === null && h3 === null, 'hit(): within 8 px only, never a water item', [h1, h2, h3]);
    R.V.view.zoom = 0.5; ok(lay.hit(-390, 0) && lay.hit(-390, 0).i === 1, 'hit(): 8 px follows the zoom');
    ok(lay.legend()[0].color === PAL.water.check.fill || (PAL.checks && lay.legend()[0].color === PAL.checks.mark), 'legend colour from the palette (checks, else water.check)');
    // a click hit opens the row of the item
    const R2 = await opened({ answer: ANS(ALL, items, notes) });
    R2.V.emit('cursor', { x: 200, y: 100, click: true, hit: { part: 'other', i: 5 } });
    ok(!blkOf(R2, 'mv.checks.item.5'), 'cursor: a hit of another part is ignored');
    R2.V.emit('cursor', { x: 200, y: 100, click: true, hit: { part: 'checks', i: 5 } });
    ok(blkOf(R2, 'mv.checks.item.5') && blkOf(R2, 'mv.checks.item.5').attrs['aria-current'] === 'true', 'cursor: a checks hit opens its row and marks the item', blkOf(R2, 'mv.checks.item.5') && blkOf(R2, 'mv.checks.item.5').attrs);
    // without V.go the row shows metres
    const R3 = await opened({ answer: ANS(ALL, items, notes), go: false });
    btn(blkOf(R3, 'mv.checks.code.swamp'), rowText(R3, 'SWAMP')).click();
    ok(blkOf(R3, 'mv.checks.item.0').has('at 15.0, -10.0 m') && !btn(blkOf(R3, 'mv.checks.item.0'), en('mapviz.checks.show')), 'no V.go: the row shows the place in metres (world units / upm 20)', blkOf(R3, 'mv.checks.item.0').textContent);
    // no palette: the layer says not available (the shell shows it on the row), no colour
    const R4 = await opened({ answer: ANS(ALL, items, notes), pal: null });
    let er = null; try { R4.layers[0].draw(recCtx([]), mkView()); } catch (e) { er = e.message; }
    ok(er === en('mapviz.checks.na') && R4.layers[0].legend() === null, 'no palette: not available, no legend', er); }

  // ---- 'products' asks once; stale twice leaves no status; errors and Try again ----
  { const R = await opened({ answers: [ANS({ water: true }), ANS(ALL)] });
    ok(R.calls.length === 1, 'products setup: one GET');
    R.V.emit('products', {}); await flush(5);
    ok(R.calls.length === 2 && blkOf(R, 'mv.checks.status').has('0 found, 20 passed, 0 not run.'), 'products: asks again once while a source needs', blkOf(R, 'mv.checks.status').textContent);
    R.V.emit('products', {}); await flush(5);
    ok(R.calls.length === 2, 'products: an answer with every source made does not ask again'); }
  { const stale = () => Object.assign(new Error('MV_CANCELLED'), { stale: true, key: 'mapviz.err.MV_CANCELLED', params: { msg: 'closed' } });
    const R = await opened({ answers: [stale(), stale(), ANS(ALL)] });
    ok(R.calls.length === 2 && blkOf(R, 'mv.checks.status').textContent === '', 'stale twice: asked once more, then no status', [R.calls.length, blkOf(R, 'mv.checks.status').textContent]);
    const R2 = await opened({ answers: [stale(), ANS(ALL)] });
    ok(R2.calls.length === 2 && blkOf(R2, 'mv.checks.status').has('20 passed'), 'stale once: the second ask lands'); }
  { const e = Object.assign(new Error('MV_FAULT'), { status: 500, key: 'mapviz.err.MV_FAULT', params: { msg: 'strong.checks is not a vector product' } });
    const R = await opened({ answers: [e, ANS(ALL)] }), st = blkOf(R, 'mv.checks.status');
    ok(st.has('Something went wrong: strong.checks is not a vector product') && btn(st, en('mapviz.checks.retry')), 'error: mapviz.err text and Try again', st.textContent);
    btn(st, en('mapviz.checks.retry')).click(); await flush(5);
    ok(R.calls.length === 2 && blkOf(R, 'mv.checks.status').has('20 passed'), 'Try again: one GET');
    const R2 = await opened({ answer: { v: 1, kind: 'nope' } });
    ok(blkOf(R2, 'mv.checks.status').has(en('mapviz.checks.na')) && R2.layers[0].list().length === 0, 'seeded: an answer that is not a checks answer is an error, nothing listed'); }

  // ---- a job that ends while another GET runs asks again; Make does not come back in between ----
  { const defs = [], later = () => new Promise(r => defs.push(r));
    const R = await opened({ answers: [ANS({}), later, later], deferJobs: true });
    btn(blkOf(R, 'mv.checks.status'), en('mapviz.checks.makeAll')).click(); await flush(3);
    ok(R.jobs.length === 6 && R.jobs[0].what === 'water' && R.jobs[1].what === 'checks', 'Make all: six jobs, water then checks', R.jobs.map(j => j.what));
    R.jobRes[0](); await flush(3);
    ok(R.calls.length === 2, 'water job ends: GET checks again', R.calls.length);
    R.jobRes[1](); await flush(3);
    ok(R.calls.length === 3, 'checks job ends while that GET runs: asks once more', R.calls.length);
    ok(!btn(blkOf(R, 'mv.checks.status'), 'Make: Map checks') && !btn(blkOf(R, 'mv.checks.status'), 'Make: Water checks'), 'no Make button comes back while the re-ask runs', blkOf(R, 'mv.checks.status').textContent);
    defs[0](ANS({ water: true })); await flush(3);
    ok(!btn(blkOf(R, 'mv.checks.status'), 'Make: Map checks'), 'the older answer (read before the checks job ended) is dropped', blkOf(R, 'mv.checks.status').textContent);
    defs[1](ANS({ water: true, strong: true })); await flush(3);
    const st = blkOf(R, 'mv.checks.status');
    ok(!btn(st, 'Make: Map checks') && !btn(st, 'Make: Water checks') && rowText(R, 'REACH_UNEQUAL').indexOf(en('mapviz.checks.state.passed')) > 0 && st.has('Running: Fairness for Infantry'),
      'the last answer lands: water and checks made, fair jobs still running', st.textContent); }

  // ---- the phase the products write ----
  { const R = await opened({ answer: Object.assign(ANS(ALL), { phase: 2 }), q: { phase: 2 } });
    ok(blkOf(R, 'mv.checks.status').has('Checks of phase 2.'), 'phase: the answer phase is shown', blkOf(R, 'mv.checks.status').textContent);
    const R2 = await opened({ answer: ANS(ALL), q: { phases: [0, 1] } });
    ok(blkOf(R2, 'mv.checks.status').has(en('mapviz.checks.phase0')), 'phase null and the mode has phases: first phase', blkOf(R2, 'mv.checks.status').textContent);
    const R3 = await opened({ answer: ANS(ALL), q: { phases: [] } });
    ok(!/phase/i.test(blkOf(R3, 'mv.checks.status').textContent), 'phase null and no phases: no phase line'); }

  // ---- PICTURE_REFUSED is judged only when its skip note can be known ----
  { const a = ANS({ water: true, strong: true });
    const R = await opened({ answer: a });
    ok(rowText(R, 'PICTURE_REFUSED').indexOf(en('mapviz.checks.state.notRun')) > 0 && rowText(R, 'PICTURE_MISSING').indexOf(en('mapviz.checks.state.passed')) > 0,
      'strong made, no fair made, no notes: PICTURE_REFUSED not run (other strong rows passed)', rowText(R, 'PICTURE_REFUSED'));
    const b = ANS({ water: true, strong: true }); b.sources[1].notes = true;
    const R2 = await opened({ answer: b });
    ok(rowText(R2, 'PICTURE_REFUSED').indexOf(en('mapviz.checks.state.passed')) > 0, 'strong.checks carries notes: PICTURE_REFUSED passed', rowText(R2, 'PICTURE_REFUSED'));
    const c = ANS({ water: true, strong: true }, [], [{ code: 'STRONG_PREVIEWS_ABSENT', msg: 'm' }]); c.sources[1].notes = true;
    const R3 = await opened({ answer: c });
    ok(rowText(R3, 'PICTURE_REFUSED').indexOf(en('mapviz.checks.state.skipped')) > 0, 'strong.checks notes hold STRONG_PREVIEWS_ABSENT: skipped', rowText(R3, 'PICTURE_REFUSED'));
    const R4 = await opened({ answer: ANS({ water: true, strong: true }), q: { jobs: [{ id: 'j', what: 'strong', state: 'running', target: TG, map: 'multi/mv_fixture', args: { map: 'multi/mv_fixture', mode: 'battle_zones', kind: 'inf' }, text: 'Strong points: inf' }] } });
    ok(rowText(R4, 'PICTURE_REFUSED').indexOf(en('mapviz.checks.state.running')) > 0, 'PICTURE_REFUSED running while a fair job runs', rowText(R4, 'PICTURE_REFUSED')); }

  // ---- more than 200 items in one row ----
  { const many = []; for (let i = 0; i < 205; i++) many.push(Object.assign({}, W_ITEM, { x: i, y: i }));
    const R = await opened({ answer: ANS(ALL, many) });
    btn(blkOf(R, 'mv.checks.code.swamp'), rowText(R, 'SWAMP')).click();
    const n = () => box(R).all().filter(e => /^mv\.checks\.item\./.test(e.attrs['data-blk'] || '')).length;
    ok(n() === 200 && blkOf(R, 'mv.checks.more.swamp') && blkOf(R, 'mv.checks.more.swamp').has('And 5 more.'), 'cap: 200 rows and "And 5 more."', [n(), blkOf(R, 'mv.checks.more.swamp') && blkOf(R, 'mv.checks.more.swamp').textContent]);
    R.V.emit('cursor', { x: 203, y: 203, click: true, hit: { part: 'checks', i: 203 } });
    ok(blkOf(R, 'mv.checks.item.203') && blkOf(R, 'mv.checks.item.203').attrs['aria-current'] === 'true' && blkOf(R, 'mv.checks.more.swamp').has('And 4 more.'), 'cap: a picked item past 200 is listed and marked', n()); }
  }
  TG = 'mowas2';

  // ---- AS64 = MoW:AS2; GoH picture words ----
  { const pics = ['minimap', 'preview', 'preview_small', 'header', 'header_interface', 'map/multi/x/minimap.dds'].map(f => ({ src: 'strong', code: 'PICTURE_MISSING', x: null, y: null, region: 0, file: f }));
    const items = [W_ITEM].concat(S_ITEMS, [F_ITEM], pics);
    const dom = async target => { const R = await opened({ q: { target }, answer: Object.assign(ANS(ALL, items), { target }) });
      btn(blkOf(R, 'mv.checks.code.picture-missing'), rowText(R, 'PICTURE_MISSING')).click();
      btn(blkOf(R, 'mv.checks.code.swamp'), rowText(R, 'SWAMP')).click();
      const lg = []; R.layers[0].draw(recCtx(lg), mkView());
      return { text: box(R).all().map(e => (e.attrs['data-blk'] || '') + '=' + (e.children.length ? '' : e.textContent)).join('|'), draws: JSON.stringify(lg.map(x => [x.op, x.args])), R }; };
    const a = await dom('as64'), m = await dom('mowas2'), g = await dom('goh');
    ok(a.text === m.text && a.draws === m.draws, 'AS64 and MoW:AS2: the same DOM and the same draw log');
    const words = R => box(R).all().filter(e => /^mv\.checks\.item\./.test(e.attrs['data-blk'] || '')).map(e => e.textContent.trim());
    const gw = words(g.R);
    ok(['the minimap', 'the preview picture', 'the header picture'].every(w => gw.indexOf(w) >= 0), 'GoH: picture words minimap, preview, header', gw);
    ok(gw.indexOf('a map picture') >= 0 && !gw.some(w => /dds|\//.test(w)), 'seeded: a picture file given as an engine path shows as "a map picture"', gw);
    const zh = start({ code: 'zh', q: { map: null } }); zh.V.emit('map', { key: null }); await flush(3);
    ok(box(zh).has(LC.zh['mapviz.checks.noMap']), 'lang: the panel speaks Chinese'); }

  // ---- the GET checks route ----
  for (TG of TARGETS) { const base = 'target=' + TG + '&game=%3Cgame%3E&map=multi%2Fmv_fixture&mode=battle_zones&side=both&kind=inf';
    const made = {}, put = (key, files) => { made[key] = entryDir(files); };
    const r0 = await route(base, {});
    ok(r0.body && r0.body.kind === 'checks' && r0.body.v === 1 && r0.body.sources.length === 6 && r0.body.sources.every(s => s.state === 'need' && s.need && s.need.what) && r0.body.items.length === 0,
      'route: nothing made: six sources in need (200)' + (r0.real ? '' : ' [test copy of the shell lib]'), r0.err ? r0.err.params : r0.body);
    ok(r0.body && JSON.stringify(r0.body.sources.map(s => s.src + ':' + s.what + ':' + (s.unit || ''))) === JSON.stringify(['water:water:', 'strong:checks:', 'fair:strong:inf', 'fair:strong:mg', 'fair:strong:at', 'fair:strong:tank']), 'route: source order water, strong, fair x4');
    const ft = r0.body && r0.body.sources[5].need;
    ok(ft && ft.what === 'strong' && ft.args.map === 'multi/mv_fixture' && ft.args.mode === 'battle_zones' && ft.args.kind === 'tank', 'route: the fair tank need names map, mode, kind', ft);
    put('water|multi/mv_fixture|battle_zones', { 'water.checks.json': vec('water.checks', [{ kind: 'check', code: 'SWAMP', x: 300, y: -200, region: 1, cells: 7, area: 53.4, box: [280, -220, 320, -180] }]) });
    put('checks|multi/mv_fixture|battle_zones|', { 'strong.checks.json': vec('strong.checks', [{ kind: 'check', code: 'FLAG_UNREACHABLE', x: -400, y: 0, region: 0, side: 'a', unit: 'tank', flag: 'f1' }, { kind: 'check', code: 'BRAND_NEW', x: 1, y: 2, region: 0 }, { kind: 'check', code: 'PICTURE_MISSING', region: 0, file: 'minimap' }]) });
    for (const k of KINDS) put('strong|multi/mv_fixture|battle_zones|' + k + '|', { ['strong.' + k + '.json']: strongJson(k, [{ kind: 'check', code: 'FAIR_FLAG', x: 10, y: 20, region: 0, side: 'b', flag: 'f' + k, value: 0.3, limit: 0.15 }], [{ code: 'STRONG_PREVIEWS_ABSENT', msg: 'm' }, { code: 'STRONG_FLAT', msg: k }]) });
    const r1 = await route(base, made);
    const b = r1.body;
    ok(b && b.sources.every(s => s.state === 'made' && !s.need), 'route: every source made', r1.err ? r1.err.params : b && b.sources);
    ok(b && JSON.stringify(b.items.map(i => i.src + ':' + i.code + ':' + (i.unit || ''))) === JSON.stringify(['water:SWAMP:', 'strong:FLAG_UNREACHABLE:tank', 'strong:BRAND_NEW:', 'strong:PICTURE_MISSING:', 'fair:FAIR_FLAG:inf', 'fair:FAIR_FLAG:mg', 'fair:FAIR_FLAG:at', 'fair:FAIR_FLAG:tank']),
      'route: items in order water, strong, fair (four kinds); an unknown code passes through', b && b.items.map(i => i.src + ':' + i.code));
    ok(b && b.items[0].area === 53.4 && b.items[0].box.length === 4 && !('cells' in b.items[0]) && !('kind' in b.items[0]) && b.items[3].x === null && b.items[3].region === 0 && b.items[3].file === 'minimap', 'route: item fields; x, y null without a place', b && [b.items[0], b.items[3]]);
    ok(b && b.notes.length === 2 && b.notes[0].code === 'STRONG_PREVIEWS_ABSENT' && b.phase === null && b.mode === 'battle_zones' && b.target === TG, 'route: notes deduplicated by code; phase null', b && b.notes);
    ok(b && b.sources[1].notes === undefined, 'route: a strong.checks.json without notes: no notes mark on the strong source', b && b.sources[1]);
    // strong.checks.json with its own notes and phase; no strong.<kind>.json made
    const own = {}; own['checks|multi/mv_fixture|battle_zones|'] = entryDir({ 'strong.checks.json': Object.assign(vec('strong.checks', []), { phase: 0, notes: [{ code: 'STRONG_PREVIEWS_ABSENT', msg: 'previews is not built' }, { code: 'STRONG_PREVIEWS_ABSENT', msg: 'again' }] }) });
    const rn = await route(base, own);
    ok(rn.body && rn.body.notes.length === 1 && rn.body.notes[0].code === 'STRONG_PREVIEWS_ABSENT' && rn.body.sources[1].notes === true && rn.body.sources.slice(2).every(s => s.state === 'need'),
      'route: strong.checks.json notes are read (deduplicated) with no strong.<kind>.json made; the strong source says notes: true', rn.err ? rn.err.params : rn.body);
    ok(rn.body && rn.body.phase === 0, 'route: the answer phase is the resolved phase strong.checks.json writes (request phase null)', rn.body && rn.body.phase);
    const badN = {}; badN['checks|multi/mv_fixture|battle_zones|'] = entryDir({ 'strong.checks.json': Object.assign(vec('strong.checks', []), { notes: 'x' }) });
    ok((await route(base, badN)).err.status === 500, 'seeded: strong.checks.json notes not a list answers 500');
    const fk = {}; fk['strong|multi/mv_fixture|battle_zones|mg|'] = entryDir({ 'strong.mg.json': Object.assign(strongJson('mg', []), { phase: 3 }) });
    const rf = await route(base, fk);
    ok(rf.body && rf.body.phase === 3, 'route: without strong.checks the phase comes from the first made strong.<kind>.json', rf.body && rf.body.phase);
    for (const p of ['%20', '1e1', '150', '-1', '1.5'])
      { const r = await route(base + '&phase=' + p, made); ok(r.err && r.err.status === 400 && /from 0 to 99/.test(r.err.params.msg), 'seeded: phase "' + decodeURIComponent(p) + '" answers 400 "from 0 to 99"', r.err ? r.err.params : r.body && r.body.phase); }
    for (const a of ['at=1,2', 'pose=stand', 'light=clean', 'size=64'])
      { const r = await route(base + '&' + a, made); ok(r.err && r.err.status === 400 && r.err.key === 'mapviz.err.MV_USAGE', 'route: argument ' + a + ' is not taken (400)', r.err ? r.err.params : 'answered 200'); }
    const r2 = await route(base + '&phase=1', made);
    ok(r2.body && r2.body.phase === 1 && r2.body.sources[0].state === 'made' && r2.body.sources.slice(1).every(s => s.state === 'need' && s.need.args.phase === 1), 'route: phase 1 keys checks and strong (not water); needs carry the phase', r2.err ? r2.err.params : r2.body.sources);
    const r3 = await route(base + '&phase=1.5', made);
    ok(r3.err && r3.err.status === 400 && r3.err.key === 'mapviz.err.MV_USAGE', 'seeded: phase 1.5 answers 400 MV_USAGE', r3.err && r3.err.params);
    const r4 = await route(base + '&bogus=1', made);
    ok(r4.err && r4.err.status === 400, 'route: an unknown argument answers 400');
    const bad = Object.assign({}, made); bad['checks|multi/mv_fixture|battle_zones|'] = entryDir({ 'strong.checks.json': { v: 1, kind: 'grid', items: [] } });
    const r5 = await route(base, bad);
    ok(r5.err && r5.err.status === 500 && r5.err.key === 'mapviz.err.MV_FAULT', 'seeded: a strong.checks.json that is not a vector answers 500 MV_FAULT', r5.err ? r5.err.params : r5.body);
    const bad2 = Object.assign({}, made); bad2['strong|multi/mv_fixture|battle_zones|mg|'] = entryDir({ 'strong.mg.json': Object.assign(strongJson('mg', []), { v: 2 }) });
    const r6 = await route(base, bad2);
    ok(r6.err && r6.err.status === 500, 'seeded: a strong.mg.json of version 2 answers 500');
    const bad3 = Object.assign({}, made); bad3['water|multi/mv_fixture|battle_zones'] = entryDir({ 'water.checks.json': '{ not json' });
    ok((await route(base, bad3)).err.status === 500, 'seeded: a water.checks.json that does not parse answers 500');
    const r7 = await route(base, made, { water: ROW.water });
    ok(r7.body && r7.body.sources[1].state === 'need' && r7.body.sources[1].need.what === 'checks' && r7.body.sources[5].need.args.kind === 'tank' && r7.body.sources[0].state === 'made', 'route: a job table without the checks and strong rows: needs from the request, water still made', r7.err ? r7.err.params : r7.body.sources);
    SERVER._t.use({ lib: null }); const keep = SS.lib;
    if (!keep) { let e8 = null; try { await SERVER.routes['GET /api/x/mapviz/checks'](new URL('http://x/?' + base), null, {}); } catch (e) { e8 = e; } SERVER._t.reset();
      ok(e8 && e8.status === 501 && e8.key === 'mapviz.err.MV_NOT_BUILT', 'route: while the shell gives no route library: 501 MV_NOT_BUILT', e8 && e8.message); }
    else SERVER._t.reset();

    // ---- the part on the real shell with the route ----
    { const target = TG;
      const calls = [], t = libFor(stubTable(ROW), stubCache(made)); SERVER._t.use({ lib: t.lib });
      const routes = {
        'GET /api/x/mapviz/palette': async () => PAL,
        'GET /api/x/mapviz/cache': async () => ({ v: 1, root: '<cache>', bytes: 0, cap: 1, entries: 0, jobs: 0 }),
        'GET /api/x/mapviz/doc': async () => clone(target === 'goh' ? FXA.goh.doc.a : FXA.as2.doc.a),   // GoH: the GoH fixture document
        'GET /api/x/mapviz/checks': SERVER.routes['GET /api/x/mapviz/checks'],
      };
      const S = { gameId: target, gameOv: '<game>', mod: '', mapKey: 'map/multi/mv_fixture' };
      const P = H.mkPage({ scripts: [SHELL, PART], lang: L, S, canvas: true, api: H.routeApi(routes, calls) });
      P.screen.refresh(); await flush(80);
      const panel = H.blk(P.root, 'mv.p.checks');
      const cq = calls.filter(c => c.path === '/api/x/mapviz/checks');
      ok(panel && panel.has('5 found, 15 passed, 0 not run, 1 skipped.') && cq.length === 1 && /mode=battle_zones/.test(cq[0].url) && new RegExp('target=' + target).test(cq[0].url), 'shell ' + target + ': one GET checks with target and mode after the document; the panel fills', [cq.map(c => c.url), panel && panel.textContent.slice(0, 300)]);
      ok(!calls.some(c => c.method === 'POST'), 'shell ' + target + ': no job without a user press');
      const BC = require('../../../test/blockcheck'), probs = BC.checkScreen(P.root);
      ok(!probs.filter(p => /checks/.test(p)).length, 'shell ' + target + ': the checks blocks pass the block rules', probs.filter(p => /checks/.test(p)));
      SERVER._t.reset(); SS._t.reset();
    } }
  TG = 'mowas2';

  // ---- fixture known answers (rules.md 10), when the strong part is built ----
  // strong.checks of the fixture map (the strong part's own inputs: fxmake, synth stand-in sight and cover rules, the real
  // pass and water parts) -> strong.checks.json in a stub cache entry -> GET checks -> the panel rows. The fixture needs no
  // game install, so MAPVIZ_NO_GAME does not skip it. as2 form for as64 and mowas2, goh form for goh.
  { const S = require(path.join(ROOT, 'strong/index')), fxm = require(path.join(ROOT, 'test/fxmake')), synth = require(path.join(ROOT, 'strong/test/synth')), MK = require(path.join(ROOT, 'lib/mapkit'));
    for (TG of TARGETS) {
      const form = TG === 'goh' ? 'goh' : 'as2', f = fxm.make(path.join(SCR, 'fx-' + TG), { form });
      const I = S.inputs([], { target: TG, map: f.map, mode: 'battle_zones', rules: synth.rules(), src: MK.source({ target: TG, game: f.gameDir }) });
      const items = S.checks(I, {});
      const made = {}; made['checks|' + f.map + '|battle_zones|'] = entryDir({ 'strong.checks.json': { v: 1, kind: 'vector', name: 'strong.checks', phase: I.phase, items, notes: I.notes } });
      const r = await route('target=' + TG + '&game=%3Cgame%3E&map=' + encodeURIComponent(f.map) + '&mode=battle_zones', made);
      const b = r.body, has = (code, p) => (b ? b.items : []).filter(c => c.src === 'strong' && c.code === code && Object.keys(p || {}).every(k => c[k] === p[k]));
      ok(b && b.sources[1].state === 'made' && b.phase === I.phase, 'fixture: GET checks reads the strong.checks.json of the fixture run (phase ' + I.phase + ')', r.err ? r.err.params : b && b.sources);
      const pm = has('PICTURE_MISSING').map(c => c.file).sort().join();
      ok(pm === (TG === 'goh' ? 'header,minimap,preview' : 'minimap,preview,preview_small'), 'fixture: PICTURE_MISSING three rows ' + pm);
      ok(!has('SPAWN_SEEN').length && !has('OBJECT_OUTSIDE').length, 'fixture: no SPAWN_SEEN, no OBJECT_OUTSIDE');
      const ru = has('REACH_UNEQUAL').map(c => c.flag).sort().join();
      ok(ru === 'f2,f3' && has('REACH_UNEQUAL').every(c => c.unit === undefined || c.unit === 'inf'), 'fixture: REACH_UNEQUAL f2, f3', has('REACH_UNEQUAL'));
      ok(!has('FLAG_UNREACHABLE', { unit: 'inf' }).length, 'fixture: infantry reaches every flag');
      if (TG === 'goh') ok(!has('FLAG_UNREACHABLE', { unit: 'tank' }).length && !has('FLAG_UNREACHABLE', { unit: 'at' }).length, 'fixture goh: no FLAG_UNREACHABLE for tank and at (goh form, as the strong part finds)');
      else for (const u of ['tank', 'at']) for (const fl of ['f1', 'f3']) ok(has('FLAG_UNREACHABLE', { side: 'a', unit: u, flag: fl }).length === 1 && !has('FLAG_UNREACHABLE', { side: 'b', unit: u, flag: fl }).length, 'fixture: FLAG_UNREACHABLE side a ' + u + ' ' + fl + ', not side b');
      // the panel rows from that answer
      const R = await opened({ answer: b });
      ok(rowText(R, 'PICTURE_MISSING') === en('mapviz.checks.code.PICTURE_MISSING') + ': 3 found' && rowText(R, 'SPAWN_SEEN').indexOf(en('mapviz.checks.state.passed')) > 0 && rowText(R, 'REACH_UNEQUAL') === en('mapviz.checks.code.REACH_UNEQUAL') + ': 2 found',
        'fixture panel: PICTURE_MISSING 3 found, SPAWN_SEEN passed, REACH_UNEQUAL 2 found', [rowText(R, 'PICTURE_MISSING'), rowText(R, 'SPAWN_SEEN'), rowText(R, 'REACH_UNEQUAL')]);
      ok(rowText(R, 'PICTURE_REFUSED').indexOf(hasN(b, 'STRONG_PREVIEWS_ABSENT') ? en('mapviz.checks.state.skipped') : en('mapviz.checks.state.passed')) > 0, 'fixture panel: PICTURE_REFUSED judged from the strong.checks notes', [rowText(R, 'PICTURE_REFUSED'), b && b.notes]);
    }
    TG = 'mowas2'; }

  // ---- language ----
  { const codes = ['en', 'ru', 'uk', 'zh'], SRC = String(PART), K = require(path.join(__dirname, 'checks.client.js'));
    const cat = ['FAIR_FLAG', 'REACH_UNEQUAL', 'SPAWN_IN_DANGER', 'FLAG_IN_DANGER', 'SPAWN_IN_BINOC', 'FLAG_IN_BINOC', 'SPAWN_SEEN', 'FLAG_ZONE_WATER', 'FLAG_ZONE_BLOCKED', 'FLAG_UNREACHABLE', 'DROWN_NEAR_REACH', 'OBJECT_OUTSIDE', 'MINIMAP_SPAN', 'PICTURE_MISSING', 'PICTURE_REFUSED', 'PICTURE_SHADOWED', 'BLOCKED_NOT_DEADLY', 'WET_LOOK_DRY_PLAY', 'SWAMP', 'PAINTED_ABOVE_LEVEL'];
    const catMiss = lang => { const m = []; for (const c of codes) for (const k of cat.concat(['other'])) if (!(lang[c] && lang[c]['mapviz.checks.code.' + k])) m.push(c + ' ' + k); return m; };
    ok(!catMiss(LC).length, 'catalogue: every code has a key in four languages', catMiss(LC));
    const seeded = clone(LC); delete seeded.uk['mapviz.checks.code.SPAWN_SEEN'];
    ok(catMiss(seeded).join() === 'uk SPAWN_SEEN', 'seeded: a lang file missing one code key fails the catalogue check');
    const X = load().X, KC = X.mapviz.checksKit;
    ok(KC && KC.CAT.map(c => c[1]).join() === cat.join(), 'the part catalogue is the draft table order', KC && KC.CAT);
    const used = new Set();
    for (const m of SRC.matchAll(/'(mapviz\.checks\.[A-Za-z0-9_.]*[A-Za-z0-9_])'/g)) used.add(m[1]);
    for (const k of cat.concat(['other'])) used.add('mapviz.checks.code.' + k);
    for (const k of ['minimap', 'preview', 'preview_small', 'header', 'header_interface', 'other']) used.add('mapviz.checks.pic.' + k);
    for (const k of ['STRONG_PREVIEWS_ABSENT', 'STRONG_INPUT_COMPUTED', 'STRONG_DEGRADED']) used.add('mapviz.checks.note.' + k);
    for (const k of ['found', 'passed', 'notRun', 'running', 'skipped']) used.add('mapviz.checks.state.' + k);
    ok(Object.keys(LC).sort().join() === codes.slice().sort().join(), 'lang: exactly en, ru, uk, zh');
    const miss = []; for (const k of used) for (const c of codes) if (!(LC[c] && LC[c][k])) miss.push(c + ' ' + k);
    ok(!miss.length, 'lang: every key used is in all four languages (' + used.size + ')', miss);
    const unused = Object.keys(LC.en).filter(k => !used.has(k));
    ok(!unused.length, 'lang: every key in the file is used', unused);
    ok(Object.keys(LC.en).length <= 70, 'lang: at most 70 keys (' + Object.keys(LC.en).length + ')');
    const slots = s => (String(s).match(/\{\w+\}/g) || []).sort().join();
    const bad = []; for (const c of codes) for (const k of Object.keys(LC[c])) { const v = LC[c][k];
      if (!/^mapviz\.checks\./.test(k)) bad.push(c + ' prefix ' + k);
      if (/^TODO:/.test(v) || v.indexOf(String.fromCharCode(8212)) >= 0 || / - /.test(v) || /\bas64\b/.test(v)) bad.push(c + ' ' + k);
      if (slots(v) !== slots(LC.en[k])) bad.push(c + ' ' + k + ' slots'); if (!(k in LC.en)) bad.push(c + ' extra ' + k);
      if (c !== 'en' && v === LC.en[k] && !/^\{|m2|^[A-Z]{2,}$/.test(v)) bad.push(c + ' untranslated ' + k); }
    ok(!bad.length, 'lang: prefix, same slots, no TODO, no dash separator, no bare as64, translated', bad);
    ok(!/\.(dds|tga|mdl|ext|set|mi|bin)\b/i.test(JSON.stringify(LC)), 'lang: no engine file names');
    ok(!/#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/.test(SRC + fs.readFileSync(path.join(__dirname, 'checks.server.js'), 'utf8')), 'no colour literal in the part');
    ok(!/`|\$\{|innerHTML|=>|\blet\b|\bconst\b/.test(SRC), 'ES5 page script: no backtick, no dollar brace, no innerHTML, no arrow, no let or const');
    ok(!/[A-Za-z]:\\\\|[A-Za-z]:\//.test(SRC) && typeof K === 'string', 'no drive path pattern in the page script'); }

  if (OWN) try { fs.rmSync(SCR, { recursive: true, force: true }); } catch (e) {}
  if (failN) { console.log('FAIL mapviz checks: ' + failN + ' failed, ' + pass + ' passed'); process.exit(1); }
  console.log('PASS mapviz checks (' + pass + ')');
})().catch(e => { console.log('FAIL mapviz checks: ' + (e && e.stack || e)); process.exit(1); });

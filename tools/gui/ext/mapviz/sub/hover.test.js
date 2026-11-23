// Map Viewer hover readout test (MV-PG1, second half): node tools/gui/ext/mapviz/sub/hover.test.js [scratch dir]
// The hover part in the fake DOM on a stub V (the fixture's hover pack, tools/mapviz/test/fxanswers.json as2.hover.a):
// the ridge, pond and road cells against README 10.4, the water labels at a spot, the aria-live panel and its throttle,
// the readout rows for the shell, seeded defects (a pack with a missing layer, a layer of the wrong size, a pack with no
// water bands, a product not made, no water level), RMT and no map; then the three tool parts on the real shell with the
// keyboard cursor; the language file both ways; no colour literal in the three page files.
// Exports the stub page (module.exports.stub) for measure.test.js and profile.test.js; runs only as the main module.
// Author: Imperator_Aug (ARSENAL, ia-93574c56)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const fake = require('../../../test/fakedom');
const { harness: HS } = require('./shell.test');
const SHELL = require('./shell.client'), HOVER = require('./hover.client'), MEASURE = require('./measure.client'), PROFILE = require('./profile.client');
const LANG = { hover: require('./hover.lang.json'), measure: require('./measure.lang.json'), profile: require('./profile.lang.json') };
const L = HS.mergeLang([require('./shell.lang.json'), LANG.hover, LANG.measure, LANG.profile]);
const PAL = require('../../../../mapviz/palette.json');
const FXA = require('../../../../mapviz/test/fxanswers.json').as2;
const PACK = FXA.hover.a, DOC = FXA.doc.a;
const clone = o => JSON.parse(JSON.stringify(o));
const en = k => L.en[k];
// cell centre of the fixture pack (AS2 form: cell 10, ox -640, oy -480)
const cc = (i, j) => [PACK.ox + (i + 0.5) * PACK.cell, PACK.oy + (j + 0.5) * PACK.cell];
// water labels as water.labels gives them (README 5.3): the pond's swim area and its no-prone ring, and one far away
const LABELS = [
  { kind: 'waterLabel', band: 2, region: 1, x: cc(94, 28)[0], y: cc(94, 28)[1], area: 1200, depthMin: 1.2, depthMax: 9, drown: ['car', 'tank_heavy'], merged: [] },
  { kind: 'waterLabel', band: 1, region: 1, x: cc(107, 28)[0], y: cc(107, 28)[1], area: 3100.4, depthMin: 0.1, depthMax: 0.6, drown: [], merged: [] },
  { kind: 'waterLabel', band: 2, region: 2, x: -500, y: -400, area: 50, depthMin: 2, depthMax: 2, drown: ['car'], merged: [] },
];
const notFound = need => Object.assign(new Error('MV_NOT_FOUND'), { status: 404, key: 'mapviz.err.MV_NOT_FOUND', params: { msg: 'not made', need } });

// ---------- the stub page (exported) ----------
// load(o): runs the part scripts like the page does, the shell script first (its kit: base64 and palette colours; the shell's
// page itself is not built, V is the stub); o = {scripts, canvas (default true), code, rmt, noShell}
function load(o) {
  o = o || {};
  const doc = fake.make(), timers = [], log = [];
  const make = doc.createElement;
  doc.createElement = t => {
    const e = make(t);
    if (String(t).toLowerCase() === 'canvas') {
      e.width = 300; e.height = 150; e._id = 'c' + log.length; e.getBoundingClientRect = () => ({ left: 0, top: 0 });
      if (o.canvas !== false) e.getContext = k => (k === '2d' ? (e._ctx = e._ctx || HS.stubCtx(log, e)) : null);
    }
    return e;
  };
  const X = { mapviz: function () {} }; X.mapviz.parts = [];
  const timer = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };
  const cssv = (n, d) => ({ '--bg': 'var-bg', '--fg': 'var-fg', '--line': 'var-line', '--acc': 'var-acc', '--card': 'var-card', '--err': 'var-err' })[n] || d || '';
  const pageApi = () => Promise.reject(new Error('the parts call V.api, not the page api'));
  const fn = new Function('EXT_SCREENS', 'h', 'tx', 'api', 'S', 'RMT', 'cssv', 'onTheme', 'document', 'window', 'setTimeout', 'Image', (o.noShell ? [] : [SHELL]).concat(o.scripts || [HOVER, MEASURE, PROFILE]).join('\n'));
  const h = HS.hOf(doc);
  fn(X, h, HS.txOf(L, o.code || 'en'), pageApi, {}, !!o.rmt, cssv, () => () => {}, doc, {}, timer, HS.ImageStub);
  return { X, doc, h, timers, log, runTimers() { const t = timers.splice(0); t.forEach(x => x.fn()); return t.length; } };
}
// stubV(pg, o): the shell's V with its events, tools and cursor, on canned answers; o = {q, doc, api(m, p, b), job(what, args)}
function stubV(pg, o) {
  o = o || {};
  const ev = {};
  const V = { doc: o.doc === undefined ? clone(DOC) : o.doc, pal: o.pal || PAL, layers: {}, tools: {}, hovers: [], quiet: [], panels: {}, calls: [], redraws: 0, active: null };
  V.Q = Object.assign({ target: 'mowas2', map: 'multi/mv_fixture', mode: 'battle_zones', game: '<game>', mod: '', rmt: false, cursor: null, canvas: true, size: [800, 600], modes: ['battle_zones', 'combat', 'frontline'] }, o.q || {});
  const answer = o.api || defApi();
  V.q = k => (V.Q[k] === undefined ? null : V.Q[k]);
  V.api = (m, p, b) => { V.calls.push({ m, p, b: b || null }); return Promise.resolve().then(() => answer(m, p, b)).then(clone); };
  V.job = (what, args) => { V.calls.push({ m: 'JOB', p: what, b: args }); return Promise.resolve().then(() => (o.job ? o.job(what, args) : { state: 'done' })); };
  V.on = (n, f) => { (ev[n] = ev[n] || []).push(f); };
  V.emit = (n, d) => { (ev[n] || []).slice().forEach(f => f(d)); };
  V.addLayer = l => { V.layers[l.id] = l; };
  V.addTool = t => { V.tools[t.id] = t; };
  V.addHover = (f, o) => { if (o && o.quiet) V.quiet.push(f); else V.hovers.push(f); };
  V.addPanel = p => { const box = pg.h('div', { blk: 'mv.p.' + p.id, box: 'col' }); p.build(box, V); V.panels[p.id] = box; return box; };
  V.toScreen = (x, y) => [400 + x / 2, 300 - y / 2];
  V.toWorld = (px, py) => [(px - 400) * 2, (300 - py) * 2];
  V.token = n => 'var-' + n;
  V.redraw = () => { V.redraws++; };
  V.say = () => {};
  V.view = { toScreen: V.toScreen, toWorld: V.toWorld, token: V.token, pal: V.pal };
  // the shell's cursorAt: tool move or click first, then the cursor event (mouse or keyboard alike)
  V.cursor = (x, y, click) => { V.Q.cursor = [x, y]; const t = V.active; if (click) { if (t && t.click) t.click(x, y); } else if (t && t.move) t.move(x, y); V.emit('cursor', { x, y, px: 0, py: 0, click: click || undefined }); };
  // the shell's useTool: end the old tool, start the new one (Esc = use(null))
  V.use = id => { if (V.active && V.active.end) V.active.end(); V.active = id ? V.tools[id] : null; if (V.active && V.active.start) V.active.start(); V.emit('tool', { id: id || null }); };
  V.readout = (x, y) => { const rows = []; V.hovers.forEach(f => (f(x, y) || []).forEach(r => rows.push([String(r.label).indexOf('mapviz.') === 0 ? (L.en[r.label] || r.label) : r.label, String(r.value)]))); return rows; };
  return V;
}
// defApi(o): GET hover = the fixture pack (o.pack(p) may change it), GET layer water.labels = o.labels or LABELS
function defApi(o) {
  o = o || {};
  return (m, p, b) => {
    if (m === 'GET' && p === 'hover') { if (o.hover) return o.hover(); const pk = clone(PACK); return o.pack ? o.pack(pk) || pk : pk; }
    if (m === 'GET' && p === 'layer' && b && b.name === 'water.labels') return { v: 1, kind: 'vector', name: 'water.labels', items: o.labels || LABELS };
    throw Object.assign(new Error('no route ' + m + ' ' + p), { status: 404 });
  };
}
// start(pg, V): init every part, then the shell's map event
async function start(pg, V) {
  for (const p of pg.X.mapviz.parts) p.init(V);
  V.emit('map', { key: V.Q.map, mode: V.Q.mode, side: null, kind: 'multi', doc: V.doc });
  await HS.flush();
}
// lang(LL, src, extra, part): the language checks of one part (the same rules as list.test.js)
function langCheck(ok, LL, src, extra, part) {
  const used = new Set();
  const re = new RegExp("'(mapviz\\." + part + "\\.[A-Za-z0-9_.]*[A-Za-z0-9_])'", 'g');
  for (const m of String(src).matchAll(re)) used.add(m[1]);
  for (const k of extra) used.add('mapviz.' + part + '.' + k);
  const codes = ['en', 'ru', 'uk', 'zh'], miss = [];
  ok(Object.keys(LL).sort().join() === codes.slice().sort().join(), 'lang: exactly en, ru, uk, zh');
  for (const k of used) for (const c of codes) if (!(LL[c] && LL[c][k])) miss.push(c + ' ' + k);
  ok(!miss.length, 'lang: every key used is in all four languages (' + used.size + ')', miss.join(', '));
  const unused = Object.keys(LL.en).filter(k => !used.has(k) && !(/\.1$/.test(k) && used.has(k.slice(0, -2))));
  ok(!unused.length, 'lang: every key in the file is used', unused.join(', '));
  const slots = s => (String(s).match(/\{\w+\}/g) || []).sort().join(',');
  const bad = [];
  for (const c of codes) {
    if (Object.keys(LL[c]).sort().join() !== Object.keys(LL.en).sort().join()) bad.push(c + ' has other keys than en');
    for (const k of Object.keys(LL.en)) { const s = LL[c][k]; if (typeof s !== 'string' || !s || slots(s) !== slots(LL.en[k]) || /^TODO:/.test(s) || s.indexOf(String.fromCharCode(8212)) >= 0 || / - /.test(s) || /\bas64\b|\bAs64\b/.test(s) || k.indexOf('mapviz.' + part + '.') !== 0) bad.push(c + ' ' + k); }
  }
  ok(!bad.length, 'lang: same keys and slots, no TODO, no dash separator, part prefix', bad.join(', '));
  const same = Object.keys(LL.en).filter(k => ['ru', 'uk', 'zh'].some(c => LL[c][k] === LL.en[k] && /[a-z]{3}/i.test(LL.en[k].replace(/\{\w+\}/g, ''))));
  ok(!same.length, 'lang: ru, uk and zh are translated', same.join(', '));
}
// colourCheck: the theme sweep's rules on a page file (tools/gui/test/test-theme.js LIT and NAMEDRE), ASCII, LF
function colourCheck(ok, file, part) {
  const src = fs.readFileSync(file, 'utf8');
  const lit = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/g;
  const named = new RegExp('(?:color|background(?:-color)?|fill|stroke|border(?:-[a-z]+)*|outline|fillStyle|strokeStyle|box-shadow)[\'"]?\\s*[:=,]\\s*[\'"]?[^;\'"]*?\\b(white|black|red|green|blue|gray|grey|yellow|orange|silver|navy|maroon|purple|teal|lime|pink|gold|brown|cyan|magenta|olive|aqua|fuchsia|darkgray|lightgray|darkgrey|lightgrey)\\b', 'gi');
  ok(!lit.test(src) && !named.test(src), part + ': no colour literal in the page file');
  ok(!/[^\x00-\x7f]/.test(src) && !/\r/.test(src), part + ': the page file is ASCII with LF');
  ok(!/[`]|\$\{/.test(src.slice(src.indexOf('String.raw`') + 11, src.lastIndexOf('`'))), part + ': no backtick or template slot inside the page script');
  ok(!/=>|\blet\b|\bconst\b|innerHTML/.test(src.slice(src.indexOf('String.raw`') + 11)), part + ': ES5, no innerHTML');
}
const scratch = name => { const d = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'mv-' + name + '-'))); fs.mkdirSync(d, { recursive: true }); process.env.ARSENAL_CACHE = path.join(d, 'cache'); return d; };
module.exports = { stub: { load, stubV, defApi, start, langCheck, colourCheck, scratch, L, LANG, PACK, DOC, LABELS, PAL, cc, clone, notFound, HS } };
if (require.main !== module) return;

// ---------- the test ----------
scratch('hover');
let pass = 0, failN = 0;
const ok = (c, what, extra) => { if (process.env.MVDBG) console.log('.. ' + what); if (c) pass++; else { failN++; console.log('FAIL mapviz hover: ' + what + (extra !== undefined ? '\n  ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 700) : '')); } };
const field = (V, id) => { const e = HS.blk(V.panels.hover, 'mv.hover.' + id); return e ? e.all().filter(x => x.tagName === 'B').map(x => x.textContent).join('') : null; };
// show(V, pg, x, y): the cursor at a spot and the panel painted (the throttle's pending paint run)
const show = (V, pg, x, y) => { V.cursor(x, y); pg.runTimers(); };
// the pack decoded here on its own (Buffer), for the depths
const HB = Buffer.from(PACK.layers.height.data, 'base64');
const hLat = (i, j) => HB.readInt16LE((j * PACK.w + i) * 2);
const depthOf = (i, j) => ((PACK.waterLevel - hLat(i, j)) / 20).toFixed(2) + ' m';

(async () => {
  // 1 the fixture cells (README 10.4)
  { const pg = load({ scripts: [HOVER] }), V = stubV(pg);
    await start(pg, V);
    ok(V.calls.filter(c => c.p === 'hover').length === 1 && V.calls.every(c => c.m === 'GET'), 'the map event reads the hover pack once, GET only');
    ok(V.calls.some(c => c.p === 'layer' && c.b && c.b.name === 'water.labels'), 'the water labels are read when the pack has water bands');
    const rows = HS.blk(V.panels.hover, 'mv.hover.rows');
    ok(rows && rows.attrs['aria-live'] === 'polite' && rows.attrs['aria-atomic'] === 'true', 'the panel readout is aria-live');
    ok(rows.has(en('mapviz.hover.move')), 'no cursor yet: the panel says how to move it');
    show(V, pg, -200, 5);
    ok(field(V, 'pos') === 'x -10.0 m, y 0.3 m', 'position in metres', field(V, 'pos'));
    ok(field(V, 'height') === '3.00 m', 'ridge top: height 60 u = 3 m at x -200', field(V, 'height'));
    show(V, pg, -250, 5);
    ok(field(V, 'height') === '1.50 m', 'ridge side: height 30 u at x -250', field(V, 'height'));
    ok(field(V, 'slope') === '30 to 36 degrees', 'slope class 5 at cell (39, 48)', field(V, 'slope'));
    ok(field(V, 'ground') === 'Ground' && field(V, 'material') === 'Ground', 'ridge: ground type and material', [field(V, 'ground'), field(V, 'material')]);
    ok(field(V, 'water') === null && field(V, 'depth') === null, 'dry ground: no water rows');
    show(V, pg, ...cc(64, 48));
    ok(field(V, 'slope') === '0 to 6 degrees', 'slope class 0 at cell (64, 48)', field(V, 'slope'));
    // the pond on row 28
    show(V, pg, ...cc(94, 28));
    ok(field(V, 'ground') === 'Deep water' && field(V, 'water') === 'Infantry swim', 'cell (94, 28): type 5, band 2', [field(V, 'ground'), field(V, 'water')]);
    ok(field(V, 'depth') === depthOf(94, 28) && field(V, 'depth') === '9.00 m', 'cell (94, 28): depth 9 m, W - h of its south-west sample', [field(V, 'depth'), depthOf(94, 28)]);
    ok(field(V, 'area0') === 'Infantry swim, 1.2 to 9.0 m deep, 1200 square metres', 'cell (94, 28): its swim area label', field(V, 'area0'));
    ok(field(V, 'drown0') === 'Cars, Heavy tanks', 'cell (94, 28): what drowns there, in words', field(V, 'drown0'));
    ok(field(V, 'area1') === null, 'a label of another water area is not shown');
    show(V, pg, ...cc(101, 28));
    ok(field(V, 'ground') === 'Water' && field(V, 'water') === 'Infantry swim' && field(V, 'depth') === '3.00 m', 'cell (101, 28): type 4, band 2, depth 3 m', [field(V, 'ground'), field(V, 'water'), field(V, 'depth')]);
    show(V, pg, ...cc(104, 28));
    ok(field(V, 'ground') === 'Water' && field(V, 'water') === 'Infantry swim' && field(V, 'depth') === '1.50 m', 'cell (104, 28): type 4, band 2, depth 1.5 m', [field(V, 'ground'), field(V, 'water'), field(V, 'depth')]);
    show(V, pg, ...cc(107, 28));
    ok(field(V, 'ground') === 'Shallow water' && field(V, 'water') === 'No prone', 'cell (107, 28): type 3, band 1', [field(V, 'ground'), field(V, 'water')]);
    ok(field(V, 'area0') === 'No prone, 0.1 to 0.6 m deep, 3100 square metres' && field(V, 'drown0') === null, 'cell (107, 28): its no-prone label, nothing drowns', [field(V, 'area0'), field(V, 'drown0')]);
    show(V, pg, ...cc(111, 28));
    ok(field(V, 'ground') === 'Ground' && field(V, 'water') === null && field(V, 'depth') === null && field(V, 'area0') === null, 'cell (111, 28): ground, band 0, no water rows');
    // the road, rows 67..69
    for (const j of [67, 68, 69]) { show(V, pg, ...cc(64, j)); ok(field(V, 'ground') === 'Road' && field(V, 'material') === 'Road', 'road cell (64, ' + j + '): type 7, material road', [field(V, 'ground'), field(V, 'material')]); }
    show(V, pg, ...cc(64, 70));
    ok(field(V, 'ground') !== 'Road', 'cell (64, 70) is off the road');
    // the cell holds the point by truncation, never rounding (README 3.1): (64.9, 69.9) cells is in cell (64, 69) on the road;
    // rounding would give (65, 70), off it
    const at = (fi, fj) => [PACK.ox + fi * PACK.cell, PACK.oy + fj * PACK.cell];
    show(V, pg, ...at(64.9, 69.9));
    ok(field(V, 'ground') === 'Road' && field(V, 'material') === 'Road', 'a point near the north-east corner of road cell (64, 69) reads that cell', [field(V, 'ground'), field(V, 'material')]);
    // depth = W minus the cell's south-west lattice sample (README 4.2 cell rule), not the bilinear height: at (102.9, 28.9)
    // the south-west sample (102, 28) is -80 u, the next lattice column (103) is -50 u, so the bilinear height is -53 u
    ok(hLat(102, 28) === -80 && hLat(103, 28) === -50 && hLat(102, 29) === -80 && hLat(103, 29) === -50, 'fixture: lattice heights around cell (102, 28)', [hLat(102, 28), hLat(103, 29)]);
    show(V, pg, ...at(102.9, 28.9));
    ok(field(V, 'depth') === '3.00 m' && field(V, 'depth') === depthOf(102, 28) && field(V, 'height') === '-2.65 m', 'depth from the south-west sample (3 m), height bilinear (-2.65 m)', [field(V, 'depth'), field(V, 'height')]);
    // outside the grid
    show(V, pg, 700, 0);
    ok(field(V, 'where') === en('mapviz.hover.outside') && field(V, 'height') === null, 'outside the grid: told, no values');
    // one live readout: the rows are not given to the shell's line (aria-live too, not throttled); the stage strip gets
    // them through a quiet provider, without the position
    { const qr = V.quiet.length === 1 ? V.quiet[0](...cc(94, 28)) : null;
      ok(!!qr && qr.length > 0 && !qr.some(r => r.label === 'mapviz.hover.pos') && qr.some(r => r.label === 'mapviz.hover.height'), 'the strip gets the value rows through one quiet provider, no position row', qr); }
    ok(V.hovers.length === 0 && V.readout(...cc(94, 28)).length === 0, 'the rows go to the throttled panel only, not to the shell line');
    ok(V.calls.filter(c => c.p === 'hover').length === 1, 'moving the cursor reads nothing more');
  }
  // 2 throttle: the panel paints at most every 250 ms, and always the last spot
  { const pg = load({ scripts: [HOVER] }), V = stubV(pg);
    await start(pg, V); pg.runTimers();
    await new Promise(r => setTimeout(r, 270));   // past the throttle gap of the paint at start
    V.cursor(-200, 5); V.cursor(-250, 5); V.cursor(...cc(104, 28));
    ok(field(V, 'height') === '3.00 m', 'throttle: the first spot is painted at once');
    ok(pg.timers.length === 1 && pg.timers[0].ms > 0 && pg.timers[0].ms <= 250, 'throttle: one trailing paint is planned for the rest', pg.timers.map(t => t.ms));
    pg.runTimers();
    ok(field(V, 'depth') === '1.50 m', 'throttle: the trailing paint shows the last spot');
    // the keyboard cursor: the shell moves V.q('cursor') and emits cursor, like the mouse
    V.Q.cursor = [-200, 5]; V.emit('cursor', { x: -200, y: 5, px: 400, py: 300 }); pg.runTimers();
    ok(field(V, 'height') === '3.00 m', 'the keyboard cursor drives the readout');
  }
  // 2b a no-prone spot: its own band-1 label first; the deeper label it was merged into only when it has none (README 5.3)
  { const deep = { kind: 'waterLabel', band: 2, region: 1, x: cc(94, 28)[0], y: cc(94, 28)[1], area: 1200, depthMin: 1.2, depthMax: 9, drown: ['car'], merged: [1] };
    const ring = { kind: 'waterLabel', band: 1, region: 1, x: cc(107, 28)[0], y: cc(107, 28)[1], area: 3100.4, depthMin: 0.1, depthMax: 0.6, drown: [], merged: [] };
    const pg = load({ scripts: [HOVER] }), V = stubV(pg, { api: defApi({ labels: [deep, ring] }) });
    await start(pg, V); show(V, pg, ...cc(107, 28));
    ok(field(V, 'area0') === 'No prone, 0.1 to 0.6 m deep, 3100 square metres' && field(V, 'area1') === null, 'band-1 spot: its own label, not the merged deeper one', [field(V, 'area0'), field(V, 'area1')]);
    show(V, pg, ...cc(94, 28));
    ok(field(V, 'area0') === 'Infantry swim, 1.2 to 9.0 m deep, 1200 square metres', 'band-2 spot: the swim label', field(V, 'area0'));
    const pg2 = load({ scripts: [HOVER] }), V2 = stubV(pg2, { api: defApi({ labels: [deep] }) });
    await start(pg2, V2); show(V2, pg2, ...cc(107, 28));
    ok(field(V2, 'area0') === 'Infantry swim, 1.2 to 9.0 m deep, 1200 square metres', 'band-1 spot with no own label: the deeper label it was merged into', field(V2, 'area0'));
  }
  // 3 seeded defects
  { // a pack with a missing layer
    const pg = load({ scripts: [HOVER] }), V = stubV(pg, { api: defApi({ pack: p => { delete p.layers.gtype; return p; } }) });
    await start(pg, V); V.cursor(-200, 5); pg.runTimers();
    const st = HS.blk(V.panels.hover, 'mv.hover.status');
    ok(st.has('the ground types are missing or of the wrong size'), 'seeded: a pack with no ground type layer is refused and told', st.textContent);
    ok(V.readout(-200, 5).length === 0 && field(V, 'height') === null, 'seeded: no values from a broken pack');
    ok(!V.calls.some(c => c.p === 'layer'), 'seeded: no labels read for a broken pack');
  }
  { // a layer of the wrong size
    const pg = load({ scripts: [HOVER] }), V = stubV(pg, { api: defApi({ pack: p => { p.layers.height.data = p.layers.height.data.slice(0, 400); return p; } }) });
    await start(pg, V);
    ok(HS.blk(V.panels.hover, 'mv.hover.status').has('the heights are missing'), 'seeded: a height layer of the wrong size is refused');
  }
  { // no water bands yet (the water part not built): the rest works, water is told as not made
    const pg = load({ scripts: [HOVER] }), V = stubV(pg, { api: defApi({ pack: p => { delete p.layers['water.band']; return p; } }) });
    await start(pg, V); show(V, pg, ...cc(104, 28));
    ok(HS.blk(V.panels.hover, 'mv.hover.status').has(en('mapviz.hover.noBands')), 'seeded: no water bands: told in the status');
    ok(field(V, 'water') === en('mapviz.hover.noBands') && field(V, 'depth') === '1.50 m' && field(V, 'ground') === 'Water', 'seeded: no water bands: depth and type still shown');
    ok(!V.calls.some(c => c.p === 'layer'), 'seeded: no water bands: no labels read');
  }
  { // no water level: depth not known
    const pg = load({ scripts: [HOVER] }), V = stubV(pg, { api: defApi({ pack: p => { p.waterLevel = null; return p; } }) });
    await start(pg, V); show(V, pg, ...cc(104, 28));
    ok(field(V, 'depth') === en('mapviz.hover.unknown'), 'seeded: no water level: depth not known');
  }
  { // a product not made: a GET never starts a job; the button makes it, then the pack is read
    let made = 0, rel = null;
    const pg = load({ scripts: [HOVER] }), V = stubV(pg, { api: defApi({ hover: () => { if (!made) throw notFound({ what: 'grids', args: { mode: 'battle_zones' } }); return clone(PACK); } }), job: () => new Promise(res => { rel = () => { made++; res({ state: 'done' }); }; }) });
    await start(pg, V);
    const st = HS.blk(V.panels.hover, 'mv.hover.status'), rowsBox = () => HS.blk(V.panels.hover, 'mv.hover.rows');
    ok(st.has('The readout needs this first') && !V.calls.some(c => c.m === 'JOB'), 'seeded: a product not made: told, no job on a read', st.textContent);
    // the status asks for a Make: the rows show the position only, never "reading..."
    await new Promise(r => setTimeout(r, 270)); show(V, pg, -200, 5);
    ok(!rowsBox().has(en('mapviz.hover.wait')) && field(V, 'pos') === 'x -10.0 m, y 0.3 m' && field(V, 'height') === null, 'not made: the rows show the position only, no "reading..."', rowsBox().textContent);
    const b = st.all().find(e => e.tagName === 'BUTTON');
    ok(!!b && b.textContent === en('mapviz.hover.make'), 'the Make it button');
    b.click(); await HS.flush(); await new Promise(r => setTimeout(r, 270)); show(V, pg, -250, 5);
    ok(st.has('Making what the readout needs') &&!rowsBox().has(en('mapviz.hover.wait')) && field(V, 'pos') === 'x -12.5 m, y 0.3 m', 'making: the rows show the position only, no "reading..."', [st.textContent, rowsBox().textContent]);
    rel(); await HS.flush();
    ok(V.calls.some(c => c.m === 'JOB' && c.p === 'grids' && c.b && c.b.mode === 'battle_zones') && made === 1, 'the button runs the job the 404 named');
    show(V, pg, -200, 5);
    ok(field(V, 'height') === '3.00 m', 'after the job the pack is read and shown');
  }
  { // W3 and W1: the job that makes what the pack needs runs: its words, no Make it; when a page job ends ('products')
    // the pack that was not made asks again once
    let made = false, asks = 0;
    const jobs = [];
    const pg = load({ scripts: [HOVER] }), V = stubV(pg, { q: { jobs }, api: defApi({ hover: () => { asks++; if (!made) throw notFound({ what: 'grids', args: { mode: 'battle_zones' } }); return clone(PACK); } }) });
    await start(pg, V);
    const st = () => HS.blk(V.panels.hover, 'mv.hover.status'), btn = () => st().all().find(e => e.tagName === 'BUTTON');
    ok(!!btn(), 'W3 setup: Make it while nothing runs');
    // P4: a grids job of another mode (its posted key fields in args) is not the one this pack needs: Make it stays
    jobs.push({ id: 'g0', what: 'grids', target: 'mowas2', map: 'multi/mv_fixture', args: { map: 'multi/mv_fixture', mode: 'combat', side: 'both', kind: 'inf' }, state: 'running', text: 'Ground grids: other mode' }); V.emit('job', jobs[0]);
    ok(!!btn() && st().textContent.indexOf('other mode') < 0, 'P4: a running job of the same what for another mode does not take the Make button away', st().textContent);
    jobs.length = 0;
    jobs.push({ id: 'g1', what: 'grids', target: 'mowas2', map: 'multi/mv_fixture', args: { map: 'multi/mv_fixture', mode: 'battle_zones', side: 'both', kind: 'inf' }, state: 'running', text: 'Ground grids: reading, 1 of 3' }); V.emit('job', jobs[0]);
    ok(st().textContent === en('mapviz.hover.makingJob').replace('{job}', 'Ground grids: reading, 1 of 3') && !btn(), 'W3: the grids job runs: the readout status shows its words, no Make it', st().textContent);
    const a0 = asks; V.emit('products', {}); await HS.flush();
    ok(asks === a0, 'W1: a products event while its own job still runs asks nothing', asks - a0);
    jobs.length = 0; made = true; V.emit('job', { id: 'g1', end: true, state: 'done' }); V.emit('products', {}); await HS.flush();
    ok(asks === a0 + 1 && pg.X.mapviz.heights.of(V).ready(), 'W1: the job ended: the pack asked again once and is read', asks - a0);
    V.emit('products', {}); await HS.flush();
    ok(asks === a0 + 1, 'W1: a ready pack with every layer does not ask again', asks - a0);
  }
  { // no shell kit (no base64 reader): the pack is refused, not misread
    const pg = load({ scripts: [HOVER], noShell: true }), V = stubV(pg);
    await start(pg, V); V.cursor(-200, 5); pg.runTimers();
    ok(HS.blk(V.panels.hover, 'mv.hover.status').has(en('mapviz.hover.badPack')) && field(V, 'height') === null, 'seeded: no shell kit: the pack is refused and told');
  }
  { // a pack that is not a hover pack
    const pg = load({ scripts: [HOVER] }), V = stubV(pg, { api: defApi({ hover: () => ({ v: 1, kind: 'grid' }) }) });
    await start(pg, V);
    ok(HS.blk(V.panels.hover, 'mv.hover.status').has(en('mapviz.hover.badPack')), 'seeded: not a hover pack: told');
  }
  // 3b height nodata (R16): lattice points past the ground mesh hold -32768 and the pack header says so; the readout says
  // "no ground here" in words, never a number; a nodata corner drops out of the bilinear height (as mapkit heightAt)
  { const ND = -32768, at = (fi, fj) => [PACK.ox + fi * PACK.cell, PACK.oy + fj * PACK.cell];
    const holes = [[44, 48], [45, 48], [44, 49], [45, 49], [40, 48], [104, 28]];
    const ndPack = p => { const b = Buffer.from(p.layers.height.data, 'base64'); holes.forEach(([i, j]) => b.writeInt16LE(ND, (j * p.w + i) * 2)); p.layers.height.data = b.toString('base64'); p.layers.height.nodata = ND; return p; };
    const pg = load({ scripts: [HOVER] }), V = stubV(pg, { api: defApi({ pack: ndPack }) });
    await start(pg, V);
    const K = pg.X.mapviz.heights.kit, pk = pg.X.mapviz.heights.of(V).pack;
    ok(!!pk && pk.L.height.nodata === ND, 'nodata: the pack keeps the height nodata value of the header');
    // P8: an off-ground cell (its own sample nodata) shows the position and one "no ground here" row only: no height,
    // slope, ground type, material, water or depth row
    const offRows = ['height', 'slope', 'ground', 'material', 'water', 'depth'];
    const offGround = W => field(W, 'pos') !== null && field(W, 'where') === en('mapviz.hover.noGround') && offRows.every(id => field(W, id) === null);
    const rowIds = W => HS.blk(W.panels.hover, 'mv.hover.rows').all().filter(e => /^mv\.hover\./.test(e.attrs['data-blk'] || '') && e.attrs['data-blk'] !== 'mv.hover.rows').map(e => e.attrs['data-blk']);
    show(V, pg, ...at(44.5, 48.5));
    const hv = field(V, 'where');
    ok(hv === en('mapviz.hover.noGround') && hv === 'no ground here', 'nodata: a point whose four corners are nodata reads "no ground here"', hv);
    ok(!/\d/.test(hv) && !/327|32768|1638/.test(HS.blk(V.panels.hover, 'mv.hover.rows').textContent), 'nodata: no number for the height anywhere in the readout', HS.blk(V.panels.hover, 'mv.hover.rows').textContent);
    ok(offGround(V) && JSON.stringify(rowIds(V)) === JSON.stringify(['mv.hover.pos', 'mv.hover.where']), 'P8: an off-ground cell shows the position and one no ground row only (no slope, ground type, material or water)', rowIds(V));
    ok(K.heightAt(pk, ...at(44, 48)) === null && K.heightAt(pk, ...at(44.5, 48.5)) === null && K.sampleAt(pk, ...at(44.5, 48.5)).noGround === true, 'nodata: kit heightAt is null on and between nodata lattice points');
    // one nodata corner: the other three weighted again (u 0.25, v 0.5: weights 0.125, 0.375, 0.125 of 0.625)
    const want = (hLat(41, 48) * 0.125 + hLat(40, 49) * 0.375 + hLat(41, 49) * 0.125) / 0.625;
    ok(Math.abs(K.heightAt(pk, ...at(40.25, 48.5)) - want) < 1e-9, 'nodata: one nodata corner drops out, the other three are weighted again', [K.heightAt(pk, ...at(40.25, 48.5)), want]);
    // W5: the readout follows the cell's own south-west sample: cell (40, 48) holds a nodata south-west point, so its
    // height row says no ground while heightAt (measure, profile) still weights the other three corners
    show(V, pg, ...at(40.25, 48.5));
    ok(offGround(V), 'nodata (W5, P8): a cell whose own south-west sample is nodata: one no ground row, no height', [field(V, 'where'), field(V, 'height'), want]);
    const H0 = pg.X.mapviz.heights.of(V);
    ok(Math.abs(H0.heightAt(...at(40.25, 48.5)) - want) < 1e-9, 'nodata (W5): the store heightAt for measure and profile still gives the other three', [H0.heightAt(...at(40.25, 48.5)), want]);
    // a cell whose own south-west sample is valid: its weighted height (cell (41, 48): no nodata corner)
    const want2 = hLat(41, 48) * 0.375 + hLat(42, 48) * 0.125 + hLat(41, 49) * 0.375 + hLat(42, 49) * 0.125;
    show(V, pg, ...at(41.25, 48.5));
    ok(field(V, 'height') === (want2 / 20).toFixed(2) + ' m', 'nodata (W5): a cell with a valid own sample shows its height', [field(V, 'height'), want2]);
    ok(K.heightAt(pk, ...at(41, 48)) === hLat(41, 48), 'nodata: a valid lattice point next to a nodata one keeps its own height');
    // a water cell whose south-west lattice point is nodata: no ground type, water band or depth either (P8), one no ground row
    show(V, pg, ...cc(104, 28));
    ok(offGround(V), 'nodata (W5, P8): a water cell with a nodata south-west point: one no ground row, no water type, band or depth', rowIds(V));
    // planted: the next cell east of it (own sample valid) is still read in full: ground type and the water rows
    show(V, pg, ...cc(105, 28));
    ok(field(V, 'where') === null && field(V, 'ground') !== null && field(V, 'height') !== null, 'P8 planted: a cell with a valid own sample next to it still shows every row', rowIds(V));
    // the same pack read without the nodata header would show -1638.40 m: the header is what tells it (planted)
    const pg2 = load({ scripts: [HOVER] }), V2 = stubV(pg2, { api: defApi({ pack: p => { ndPack(p); p.layers.height.nodata = null; return p; } }) });
    await start(pg2, V2); show(V2, pg2, ...at(44.5, 48.5));
    ok(field(V2, 'height') === '-1638.40 m', 'planted: without the header nodata the raw value reads as a height (so the header is used)', field(V2, 'height'));
    { // W5 u16: the same holes in a u16 height layer (values + 1000, nodata 65535): the readout follows the own sample there too
      const OFF = 1000, U = 65535;
      const u16Pack = p => { const b = Buffer.from(p.layers.height.data, 'base64'), o = Buffer.alloc(b.length);
        for (let k = 0; k < b.length; k += 2) o.writeUInt16LE(b.readInt16LE(k) + OFF, k);
        holes.forEach(([i, j]) => o.writeUInt16LE(U, (j * p.w + i) * 2));
        p.layers.height = Object.assign({}, p.layers.height, { etype: 'u16', data: o.toString('base64'), nodata: U }); return p; };
      const pgU = load({ scripts: [HOVER] }), VU = stubV(pgU, { api: defApi({ pack: u16Pack }) });
      await start(pgU, VU);
      const pkU = pgU.X.mapviz.heights.of(VU).pack;
      ok(!!pkU && pkU.L.height.etype === 'u16' && pkU.L.height.nodata === U, 'nodata u16: the pack keeps etype u16 and nodata 65535', pkU && pkU.L.height);
      show(VU, pgU, ...at(44.5, 48.5));
      ok(offGround(VU), 'nodata u16: four nodata corners read no ground', rowIds(VU));
      show(VU, pgU, ...at(40.25, 48.5));
      ok(offGround(VU), 'nodata u16 (W5): a cell whose own south-west sample is 65535 says no ground', rowIds(VU));
      const wantU = (hLat(41, 48) + OFF) * 0.125 + (hLat(40, 49) + OFF) * 0.375 + (hLat(41, 49) + OFF) * 0.125;
      ok(Math.abs(pgU.X.mapviz.heights.of(VU).heightAt(...at(40.25, 48.5)) - wantU / 0.625) < 1e-9, 'nodata u16: heightAt weights the other three corners', wantU / 0.625);
      show(VU, pgU, ...at(41.25, 48.5));
      const want2U = want2 + OFF;
      ok(field(VU, 'height') === (want2U / 20).toFixed(2) + ' m' && !/65535|3276/.test(HS.blk(VU.panels.hover, 'mv.hover.rows').textContent), 'nodata u16: a valid cell reads its height, no raw nodata number', field(VU, 'height'));
    }
    for (const code of ['ru', 'uk', 'zh']) {
      const pg3 = load({ scripts: [HOVER], code }), V3 = stubV(pg3, { api: defApi({ pack: ndPack }) });
      await start(pg3, V3); show(V3, pg3, ...at(44.5, 48.5));
      ok(field(V3, 'where') === LANG.hover[code]['mapviz.hover.noGround'] && LANG.hover[code]['mapviz.hover.noGround'] !== LANG.hover.en['mapviz.hover.noGround'], 'nodata: "no ground here" in ' + code, field(V3, 'where'));
    }
  }
  // 4 RMT and no map
  { const pg = load({ scripts: [HOVER] }), V = stubV(pg, { q: { rmt: true } });
    await start(pg, V); V.cursor(0, 0);
    ok(V.calls.length === 0 && !V.panels.hover && V.hovers.length === 0, 'RMT: no call, no panel');
    const pg2 = load({ scripts: [HOVER] }), V2 = stubV(pg2, { q: { map: null }, doc: null });
    await start(pg2, V2);
    ok(V2.calls.length === 0 && HS.blk(V2.panels.hover, 'mv.hover.status').has(en('mapviz.hover.noMap')), 'no map: no call, told');
    const pg3 = load({ scripts: [HOVER], code: 'ru' }), V3 = stubV(pg3);
    await start(pg3, V3); show(V3, pg3, ...cc(104, 28));
    ok(field(V3, 'ground') === LANG.hover.ru['mapviz.hover.type.4'] && field(V3, 'depth') === LANG.hover.ru['mapviz.hover.m'].replace('{v}', '1.50') && LANG.hover.ru['mapviz.hover.type.4'] !== LANG.hover.en['mapviz.hover.type.4'], 'Russian page: words and units from the language file', [field(V3, 'ground'), field(V3, 'depth')]);
  }
  // 5 the three parts on the real shell: keyboard cursor, the tool keys, Enter and Esc
  { const SHELL = require('./shell.client');
    const routes = {
      'GET /api/x/mapviz/palette': async () => PAL,
      'GET /api/x/mapviz/cache': async () => ({ v: 1, root: '<cache>', bytes: 0, cap: 1, entries: 0, jobs: 0 }),
      'GET /api/x/mapviz/maps': async () => ({ v: 1, maps: [{ key: 'multi/mv_fixture', group: 'multi', modes: ['battle_zones'], pictures: [] }] }),
      'GET /api/x/mapviz/doc': async () => DOC,
      'GET /api/x/mapviz/hover': async () => PACK,
      'GET /api/x/mapviz/layer': async u => (u.searchParams.get('name') === 'water.labels' ? { v: 1, kind: 'vector', name: 'water.labels', items: LABELS } : Promise.reject(notFound({ what: 'grids', args: {} }))),
    };
    const calls = [], S = { gameId: 'mowas2', gameOv: '<game>', mod: '', mapKey: '' };
    const P = HS.mkPage({ scripts: [SHELL, HOVER, MEASURE, PROFILE], lang: L, S, canvas: true, api: HS.routeApi(routes, calls) });
    ok(!!P.V && ['hover', 'measure', 'profile'].every(id => HS.blk(P.root, 'mv.p.' + id)), 'shell: the three panels are built');
    P.screen.refresh(); await HS.flush();
    P.V.emit('map', { key: 'multi/mv_fixture', pick: true });
    await HS.until(() => P.V.doc && calls.some(c => c.path === '/api/x/mapviz/hover'), 5000); await HS.flush();
    if (process.env.MVDBG) console.log(calls.map(c => c.url).join('\n'), !!P.V.doc, HS.blk(P.root, 'mv.say') && HS.blk(P.root, 'mv.say').textContent);
    const hq = calls.find(c => c.path === '/api/x/mapviz/hover');
    const hp = hq && new URL(hq.url, 'http://x').searchParams;
    ok(!!hp && hp.get('target') === 'mowas2' && hp.get('map') === 'multi/mv_fixture' && hp.get('mode') === 'battle_zones', 'shell: GET hover carries target, map and mode', hq && hq.url);
    const cv = P.root.all().find(e => e.tagName === 'CANVAS' && (e.listeners.wheel || []).length);
    const key = k => { cv.fire('keydown', { key: k, shiftKey: false }); };
    key('ArrowRight'); await HS.until(() => HS.blk(P.root, 'mv.hover.height'), 2000);
    const c1 = P.V.q('cursor');
    ok(!!c1 && HS.blk(P.root, 'mv.hover.pos') && HS.blk(P.root, 'mv.hover.pos').has('x ' + (c1[0] / 20).toFixed(1) + ' m'), 'shell: the keyboard cursor fills the hover panel', c1);
    const live = P.root.all().filter(e => e.attrs && e.attrs['aria-live'] && e.textContent.indexOf('Height') >= 0);
    ok(!!HS.blk(P.root, 'mv.readout') && !HS.blk(P.root, 'mv.readout').has('Height') && !!HS.blk(P.root, 'mv.hover.height') && live.length === 1, 'shell: one live readout says the height (the hover panel), the shell line does not repeat it', [HS.blk(P.root, 'mv.readout') && HS.blk(P.root, 'mv.readout').textContent, live.length]);
    key('m'); key('Enter'); const a = P.V.q('cursor');
    for (let i = 0; i < 6; i++) key('ArrowUp');
    key('Enter'); const b = P.V.q('cursor');
    const mp = HS.blk(P.root, 'mv.p.measure');
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]) / 20;
    ok(mp.has('Point 2') && mp.has('Leg 1: ' + d.toFixed(2) + ' m, bearing 0.0 degrees'), 'shell: m starts the measure tool, Enter adds points, up is north', mp.textContent.slice(0, 300));
    key('Escape'); await HS.flush();
    ok(mp.has(en('mapviz.measure.ended')) && mp.has('Point 2'), 'shell: Esc ends the tool, the points stay');
    key('p'); key('Enter'); for (let i = 0; i < 6; i++) key('ArrowRight'); key('Enter'); await HS.flush();
    const pp = HS.blk(P.root, 'mv.p.profile');
    ok(pp.has('Length: ') && pp.has(en('mapviz.profile.terrain')), 'shell: p starts the profile tool, two Enters show the profile', pp.textContent.slice(0, 300));
    key('Escape');
    ok(calls.every(c => c.method === 'GET'), 'shell: nothing posted');
  }
  // 6 language and page file rules
  langCheck(ok, LANG.hover, HOVER, ['type.0', 'type.1', 'type.2', 'type.3', 'type.4', 'type.5', 'type.6', 'type.7', 'type.8', 'type.9', 'type.10', 'type.11', 'band.1', 'band.2',
    'mat.undef', 'mat.air', 'mat.ice', 'mat.swamp', 'mat.puddle', 'mat.ground', 'mat.road', 'mat.country_road', 'mat.sand', 'mat.grass', 'mat.snow', 'mat.rock', 'mat.mud', 'mat.bridge', 'mat.bridge_wood', 'mat.shallow_water', 'mat.water', 'mat.deep_water', 'mat.underwater',
    'cls.car', 'cls.truck', 'cls.moto', 'cls.armored_car', 'cls.tank_light', 'cls.tank_medium', 'cls.tank_heavy', 'cls.gun_unlinked', 'cls.amphibious', 'cls.gun_goh_a', 'cls.gun_goh_b',
    'lay.height', 'lay.slopecls', 'lay.gtype', 'lay.material', 'lay.water.band'], 'hover');
  colourCheck(ok, path.join(__dirname, 'hover.client.js'), 'hover');
  if (failN) { console.log('FAIL mapviz hover: ' + failN + ' of ' + (pass + failN)); process.exit(1); }
  console.log('PASS mapviz hover (' + pass + ')');
  process.exit(0);
})().catch(e => { console.log('FAIL mapviz hover: ' + (e && e.stack || e)); process.exit(1); });

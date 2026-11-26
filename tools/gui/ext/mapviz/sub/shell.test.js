// Map Viewer page shell test (MV-PG1): node tools/gui/ext/mapviz/sub/shell.test.js [scratch dir]
// 1 pure helpers (view maths, tiles, permalink, base64, envelope decode)
// 2 the page in the fake DOM: no canvas context (hint leaf, no throw, refresh starts no job), RMT (no call at all),
//   a stub 2D context (tile drawn at its place, zoom about the cursor, north up, grid and vector layers, seeded defects:
//   a tile batch with a missing tile, a layer envelope with a wrong size, a job that fails), permalink and the
//   strong/fairness rule, S.mapKey both ways
// 3 the routes with a stub jobs module (answer and error shapes, unknown argument, missing target)
// 4 the routes on the real jobs runner and the fixture map (ARSENAL_CACHE inside the scratch dir): maps, doc, layer,
//   tiles, hover, job poll to done, cancel, then the page on those routes
// 5 the language file: every key used is in all four languages, every key in the file is used
// 6 a real install (MoW:AS2) when present: GET maps answers need, no job (skipped when absent or MAPVIZ_NO_GAME=1)
// Required by list.test.js for the page harness (module.exports.harness); runs only as the main module.
// Author: Imperator_Aug (ARSENAL, ia-937b4292)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), vm = require('vm');
const HERE = __dirname;
const fake = require('../../../test/fakedom');

// ---------- the page harness ----------
function hOf(doc) {   // tools/gui/page.js h(), same rules
  return function h(tag, attrs, kids) {
    const e = doc.createElement(tag);
    if (attrs) for (const k in attrs) { const v = attrs[k]; if (v == null || v === false || k === 'blk' || k === 'box') continue;
      if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v); else if (v === true) e.setAttribute(k, ''); else e.setAttribute(k, v); }
    if (attrs && attrs.blk != null) { e.setAttribute('data-blk', String(attrs.blk)); e.className = (e.className ? e.className + ' ' : '') + 'blk' + (attrs.box ? ' blc box-' + attrs.box : ''); }
    (kids || []).forEach(c => { if (c == null) return; e.appendChild(typeof c === 'string' ? doc.createTextNode(c) : c); });
    return e;
  };
}
function txOf(L, code) {
  return function tx(k, p) {
    const A = L[code] || {}, E = L.en || {};
    if (p && p.n != null && String(p.n) === '1' && (A[k + '.1'] != null || E[k + '.1'] != null)) k = k + '.1';
    let s = A[k]; if (s == null) s = E[k]; if (s == null) return k;
    return p ? s.replace(/\{(\w+)\}/g, (m, n) => (p[n] == null ? m : String(p[n]))) : s;
  };
}
function mergeLang(list) { const L = {}; for (const l of list) for (const c of Object.keys(l)) Object.assign(L[c] = L[c] || {}, l[c]); return L; }
function stubCtx(log, cv) {
  const c = { canvas: cv, fillStyle: '', strokeStyle: '', globalAlpha: 1, lineWidth: 1, imageSmoothingEnabled: true };
  for (const m of ['setTransform', 'clearRect', 'fillRect', 'beginPath', 'moveTo', 'lineTo', 'stroke', 'fill', 'arc', 'ellipse', 'strokeRect', 'save', 'restore', 'setLineDash', 'putImageData'])
    c[m] = function () { log.push({ op: m, args: [].slice.call(arguments), cv: cv._id, alpha: c.globalAlpha, fillStyle: c.fillStyle }); };
  c.drawImage = function () { log.push({ op: 'drawImage', args: [].slice.call(arguments, 1), src: arguments[0], cv: cv._id, alpha: c.globalAlpha }); };
  c.createImageData = (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
  return c;
}
class ImageStub { constructor() { this.complete = true; this.width = 256; this.height = 256; this._src = ''; } set src(v) { this._src = v; } get src() { return this._src; } }
// mkPage(o): o = {scripts, lang, S, rmt, canvas, api, code, parts:[{id, init}], themeFns}
function mkPage(o) {
  const doc = fake.make(), log = [], themes = [];
  let ids = 0;
  const make = doc.createElement;
  doc.createElement = t => {
    const e = make(t);
    if (String(t).toLowerCase() === 'canvas') {
      e._id = ids++; e.width = 300; e.height = 150; e.getBoundingClientRect = () => ({ left: 0, top: 0 });
      if (o.canvas) { e.clientWidth = 800; e.clientHeight = 600; e.getContext = k => (k === '2d' ? (e._ctx = e._ctx || stubCtx(log, e)) : null); }
    }
    return e;
  };
  const X = {};
  const win = { requestAnimationFrame: fn => fn(), matchMedia: () => ({ matches: false }) };
  const onTheme = (fn, key) => { themes.push(fn); return () => {}; };
  const cssv = (n, d) => ({ '--bg': 'var-bg', '--fg': 'var-fg', '--line': 'var-line', '--acc': 'var-acc', '--card': 'var-card' })[n] || d || '';
  const timer = (fn, ms) => setTimeout(fn, Math.min(ms || 0, 2));
  const fn = new Function('EXT_SCREENS', 'h', 'tx', 'api', 'S', 'RMT', 'cssv', 'onTheme', 'document', 'window', 'setTimeout', 'Image', 'gohDir', 'navigator', o.scripts.join('\n'));
  fn(X, hOf(doc), txOf(o.lang, o.code || 'en'), o.api, o.S, !!o.rmt, cssv, onTheme, doc, win, timer, ImageStub, () => '', undefined);
  for (const p of o.parts || []) X.mapviz.parts.push(p);
  const root = doc.createElement('section'); doc.body.appendChild(root);
  const screen = X.mapviz(root);
  return { X, screen, root, doc, log, themes, V: screen && screen.V };
}
// routeApi(routes, calls): the page api() on route functions, errors shaped as tools/gui/page.js api() rejects them
function routeApi(routes, calls) {
  return function api(url, body) {
    const u = new URL(url, 'http://127.0.0.1');
    const method = body === undefined ? 'GET' : 'POST', key = method + ' ' + u.pathname;
    calls.push({ method, path: u.pathname, url, body });
    const r = routes[key];
    if (!r) return Promise.reject(Object.assign(new Error('no route ' + key), { status: 404 }));
    return Promise.resolve().then(() => r(u, body === undefined ? null : JSON.parse(JSON.stringify(body)), {})).then(
      j => JSON.parse(JSON.stringify(j)),
      e => { const er = new Error(e.message); er.status = e.status || 500; if (e.key) { er.key = e.key; er.params = e.params || {}; } er.reply = { error: e.message, key: e.key, params: e.params }; throw er; });
  };
}
const flush = async (n) => { for (let i = 0; i < (n || 30); i++) await new Promise(r => setImmediate(r)); };
// until: backstop at least 60 s whatever ms the caller names (a busy PC); then a WAIT line and the caller's check reports. Never a hang.
async function until(fn, ms) { const lim = Math.max(ms || 0, 60000), t = Date.now() + lim; while (Date.now() < t) { if (fn()) return true; await new Promise(r => setTimeout(r, 15)); } if (fn()) return true; process.stderr.write('WAIT mapviz test: not met after ' + lim / 1000 + ' s: ' + String(fn).slice(0, 120) + '\n'); return false; }
const blk = (root, id) => root.all().find(e => e.attrs['data-blk'] === id) || null;
module.exports = { harness: { hOf, txOf, mergeLang, stubCtx, mkPage, routeApi, flush, until, blk, ImageStub } };
if (require.main !== module) return;

// ---------- the run ----------
const SCR = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'mv-shell-')));
fs.mkdirSync(SCR, { recursive: true });
process.env.ARSENAL_CACHE = path.join(SCR, 'cache');
let pass = 0, failN = 0;
const ok = (c, what, extra) => { if (process.env.MVDBG) console.log('.. ' + what); if (c) pass++; else { failN++; console.log('FAIL mapviz shell: ' + what + (extra !== undefined ? '\n  ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 700) : '')); } };
const eq = (a, b, what) => ok(JSON.stringify(a) === JSON.stringify(b), what, { got: a, want: b });
const near = (a, b, what) => ok(Math.abs(a - b) < 1e-6, what, { got: a, want: b });

const CLIENT = require('./shell.client'), LANG = require('./shell.lang.json'), SERVER = require('./shell.server');
const PAL = require('../../../../mapviz/palette.json');
const L = mergeLang([LANG]);
// the GUI's LS (tools/gui/page.js) for the group folds: a plain store here
global.LS = { m: {}, get(k, d) { return Object.prototype.hasOwnProperty.call(this.m, k) ? this.m[k] : d; }, set(k, v) { this.m[k] = v; } };

(async () => {
  // ---------- 1 pure helpers ----------
  const X0 = {}; new Function('EXT_SCREENS', 'h', 'tx', 'api', 'S', 'RMT', 'cssv', 'onTheme', 'document', 'window', CLIENT)(X0, () => ({}), k => k, () => Promise.reject(new Error('x')), {}, false, () => '', () => {}, undefined, undefined);
  const T = X0.mapviz._t;
  ok(typeof X0.mapviz === 'function' && Array.isArray(X0.mapviz.parts) && X0.mapviz.kit && T, 'the script sets EXT_SCREENS.mapviz, parts, kit and _t');
  const v = { cx: 120, cy: -40, zoom: 0.37 };
  for (const [x, y] of [[0, 0], [-600, 440], [333.5, -12.25]]) { const p = T.toScreen(v, 800, 600, x, y), w = T.toWorld(v, 800, 600, p[0], p[1]); near(w[0], x, 'toWorld(toScreen) x ' + x); near(w[1], y, 'toWorld(toScreen) y ' + y); }
  ok(T.toScreen(v, 800, 600, 0, 100)[1] < T.toScreen(v, 800, 600, 0, 0)[1], 'north up: a larger world y is higher on the screen');
  const before = T.toWorld(v, 800, 600, 210, 95), z2 = T.zoomAt(v, 800, 600, 210, 95, 1.7), after = T.toWorld(z2, 800, 600, 210, 95);
  near(after[0], before[0], 'zoom about the cursor keeps world x'); near(after[1], before[1], 'zoom about the cursor keeps world y'); near(z2.zoom, 0.37 * 1.7, 'zoom factor');
  const HD = { zmax: 1, w: 300, h: 200, ox: -1500, oy: -1000, cell: 10 };
  const r0 = T.tileRect(HD, 0, 0, 0); eq([r0.x, r0.y, r0.s], [-1500, 1000, 2560], 'tile 0.0 world rect at level 0 (north-west anchor)');
  const p0 = T.toScreen({ cx: 0, cy: 0, zoom: 0.2 }, 800, 600, r0.x, r0.y); eq([p0[0], p0[1], r0.s * 0.2], [100, 100, 512], 'tile 0.0 at screen 100,100 size 512 for view 0,0 zoom 0.2');
  const r1 = T.tileRect(HD, 1, 0, 0); eq([r1.x, r1.y, r1.s], [-1500, 1000, 5120], 'tile 0.0 at level 1 (h_z 100 rows of 20 u)');
  eq([T.pickZ(HD, 0.2), T.pickZ(HD, 0.04), T.pickZ(HD, 0.001), T.pickZ(HD, 5)], [0, 1, 1, 0], 'tile level from zoom, clamped to 0..zmax');
  eq(T.tileList(HD, 0, { cx: 0, cy: 0, zoom: 0.2 }, 800, 600), ['0.0', '1.0'], 'visible tiles of level 0');
  // tile seams: a 3 x 3 block of tiles at many zooms and pans tiles its area exactly in whole pixels (each right edge is
  // the next left edge, each bottom edge the next top edge), and each tile is within half a pixel of its exact place
  { const hd = { zmax: 2, w: 1024, h: 768, ox: -640.3, oy: -480.7, cell: 1.37 }, bad = [];
    for (const zoom of [0.82, 0.37, 1.3, 0.0517, 2.71, 0.333333]) for (const [cx, cy] of [[0, 0], [13.37, -7.9], [-211.05, 99.5], [0.25, 0.75]]) for (const z of [0, 1]) {
      const vw = { cx, cy, zoom }, B = [];
      for (let ty = 0; ty < 3; ty++) { B.push([]); for (let tx = 0; tx < 3; tx++) B[ty].push(T.tileBox(hd, z, tx, ty, vw, 800, 600)); }
      for (let ty = 0; ty < 3; ty++) for (let tx = 0; tx < 3; tx++) { const b = B[ty][tx], tag = [zoom, cx, cy, z, tx, ty].join(',');
        if (!b.every(Number.isInteger)) bad.push('not whole ' + tag);
        if (tx < 2 && b[0] + b[2] !== B[ty][tx + 1][0]) bad.push('x seam ' + tag);
        if (ty < 2 && b[1] + b[3] !== B[ty + 1][tx][1]) bad.push('y seam ' + tag);
        if (b[0] !== B[0][tx][0] || b[2] !== B[0][tx][2] || b[1] !== B[ty][0][1] || b[3] !== B[ty][0][3]) bad.push('grid ' + tag);
        const r = T.tileRect(hd, z, tx, ty), p = T.toScreen(vw, 800, 600, r.x, r.y);
        if (Math.abs(b[0] - p[0]) > 0.5 || Math.abs(b[1] - p[1]) > 0.5 || Math.abs(b[2] - r.s * zoom) > 1 || Math.abs(b[3] - r.s * zoom) > 1) bad.push('place ' + tag); } }
    ok(!bad.length, 'tile seams: a 3 x 3 tile block covers its area exactly in whole pixels at 6 zooms, 4 pans and 2 levels', bad.slice(0, 5));
    ok(X0.mapviz.kit.tileBox === T.tileBox, 'the kit holds the tile box (kit.tileBox) for parts that draw a tile mosaic'); }
  const lk = T.linkOf({ target: 'mowas2', map: 'multi/mv_fixture', mode: 'combat', layers: ['topo', 'spawns'], view: { cx: 12.5, cy: -3, zoom: 0.25 } });
  eq(lk, 'page:mapviz/mowas2~multi/mv_fixture~combat~topo,spawns~12.5,-3,0.25', 'permalink form');
  eq(T.parseLink(lk), { target: 'mowas2', map: 'multi/mv_fixture', mode: 'combat', layers: ['topo', 'spawns'], view: { cx: 12.5, cy: -3, zoom: 0.25 } }, 'permalink round trip');
  for (const bad of ['mowas2~' + String.fromCharCode(67) + ':/mods/x~~~0,0,1', 'mowas2~x:y/mods~~~0,0,1', 'mowas2~../x~~~0,0,1', 'mowas2~map/multi/a~~~0,0,1', 'nope~multi/a~~~0,0,1', 'mowas2~multi/a~~Bad Layer~0,0,1', 'mowas2~multi/a~~~0,0', 'mowas2~multi/a'])
    ok(T.parseLink(bad) === null, 'a bad permalink is refused: ' + bad);
  const LS = [{ id: 'topo', group: 'base', on: true }, { id: 'st', group: 'strong', on: true }, { id: 'fa', group: 'fairness', on: true }, { id: 'off', group: 'water', on: false }];
  eq(T.shareable(LS, false), ['topo'], 'shareable layers leave out strong and fairness'); eq(T.shareable(LS, true), ['topo', 'st', 'fa'], 'include analysis puts them in');
  eq(T.shareable(LS, true, { base: { on: false }, strong: { on: true }, fairness: { on: true } }), ['st', 'fa'], 'a layer whose group tick is off is not visible (not shareable)');
  const LT = LS.concat([{ id: 'measure', group: 'checks', on: true, tool: true }, { id: 'profile', group: 'checks', on: true, tool: true }]);
  eq(T.shareable(LT, true), ['topo', 'st', 'fa'], 'seeded: tool layers (measure, profile) are never shareable');
  eq(T.shareable(LT, false, null, true), ['topo', 'measure', 'profile'], 'tool layers count as visible when asked for (the layers event)');
  ok(X0.mapviz.kit.b64 === T.b64 && Array.from(X0.mapviz.kit.b64('AQID')).join() === '1,2,3', 'the kit holds the base64 reader (kit.b64)');
  // vector drawing on a recording context: spawn arrow direction (yaw counter-clockwise from +x, screen y down), flag zones
  { const rec = [], c = {}; for (const m of ['beginPath', 'moveTo', 'lineTo', 'stroke', 'fill', 'arc', 'ellipse', 'closePath', 'strokeRect', 'setLineDash']) c[m] = function () { rec.push({ op: m, args: [].slice.call(arguments) }); };
    const vw = { cx: 0, cy: 0, zoom: 1, toScreen: (x, y) => T.toScreen({ cx: 0, cy: 0, zoom: 1 }, 800, 600, x, y), token: () => 'tok' };
    const arrow = yaw => { rec.length = 0; X0.mapviz.kit.vectorDraw(c, vw, { kind: 'vector', items: [{ kind: 'spawn', team: 'a', x: 0, y: 0, yaw }] }, { pal: PAL }); const i = rec.findIndex(r => r.op === 'moveTo'); return [rec[i].args, rec[i + 1].args]; };
    let a = arrow(0); ok(a[0][0] === 400 && a[0][1] === 300 && a[1][0] > 411 && Math.abs(a[1][1] - 300) < 1e-9, 'spawn yaw 0 points east (+screen x)', a);
    a = arrow(90); ok(Math.abs(a[1][0] - 400) < 1e-9 && a[1][1] < 289, 'spawn yaw 90 points north (-screen y)', a);
    a = arrow(-90); ok(Math.abs(a[1][0] - 400) < 1e-9 && a[1][1] > 311, 'spawn yaw -90 points south (+screen y)', a);
    a = arrow(180); ok(a[1][0] < 389 && Math.abs(a[1][1] - 300) < 1e-9, 'spawn yaw 180 points west', a);
    rec.length = 0;
    X0.mapviz.kit.vectorDraw(c, vw, { kind: 'vector', items: [{ kind: 'flag', team: 'a', x: 0, y: 0, zone: { kind: 'poly', pts: [[-100, -80], [100, -80], [140, 40], [0, 120]] } }] }, { pal: PAL });
    eq(rec.filter(r => r.op === 'moveTo' || r.op === 'lineTo').map(r => r.op + ' ' + r.args.join(',')), ['moveTo 300,380', 'lineTo 500,380', 'lineTo 540,260', 'lineTo 400,180'], 'a poly flag zone is drawn as its polygon in world u');
    ok(rec.some(r => r.op === 'closePath') && !rec.some(r => r.op === 'ellipse') && rec.some(r => r.op === 'stroke'), 'a poly flag zone is closed and stroked, no ellipse');
    rec.length = 0;
    X0.mapviz.kit.vectorDraw(c, vw, { kind: 'vector', items: [{ kind: 'flag', team: 'b', x: 10, y: 0, zone: { kind: 'circle', rA: 240, rB: 120 } }] }, { pal: PAL });
    const el0 = rec.find(r => r.op === 'ellipse'); ok(el0 && el0.args[0] === 410 && el0.args[2] === 240 && el0.args[3] === 120, 'a circle flag zone is an ellipse of rA, rB', el0);
  }
  const bytes = Buffer.from([0, 1, 2, 250, 251, 252, 253, 254, 255, 7]);
  eq(Array.from(T.b64(bytes.toString('base64'))), Array.from(bytes), 'own base64 decoder');
  const g16 = Buffer.alloc(8); [-5, 0, 300, -32768].forEach((x, i) => g16.writeInt16LE(x, i * 2));
  const d16 = T.decode({ kind: 'grid', w: 2, h: 2, etype: 'i16', scale: 0.5, offset: 1, nodata: -32768, data: g16.toString('base64') });
  eq([d16.vals[0], d16.vals[1], d16.vals[2], isNaN(d16.vals[3])], [-1.5, 1, 151, true], 'decode i16 with scale, offset and nodata');
  let threw = null; try { T.decode({ kind: 'grid', w: 4, h: 4, etype: 'u8', data: Buffer.alloc(10).toString('base64') }); } catch (e) { threw = e.message; }
  ok(threw && /16/.test(threw), 'seeded defect: a grid envelope with a wrong size is refused', threw);
  eq(X0.mapviz.kit.colour('\x2300FF0080'), [0, 255, 0, 128], 'palette colour with alpha'); ok(X0.mapviz.kit.colour('green') === null, 'a named colour is not a palette colour');

  // the layout helpers: the tab table, the scale bar, the cursor strip line and the typing guard of the page keys
  { const pl = T.placeOf;
    eq(T.TABS, ['layers', 'inspect', 'analysis', 'pictures'], 'tabs: Layers, Inspect, Analysis, Pictures in that order');
    const want = { base: 'layers', water: 'layers', layers: 'layers', hover: 'inspect', card: 'inspect', objects: 'inspect', strong: 'analysis', checks: 'analysis', pictures: 'pictures', style: 'pictures', export: 'pictures' };
    eq(Object.keys(want).map(id => pl({ id, side: id === 'export' ? 'bottom' : 'right' })), Object.values(want), 'tab table: each known panel goes to its tab (export from the bottom too)');
    ok(Object.values(T.TABOF).every(t => T.TABS.includes(t)), 'TABOF names only tabs of TABS');
    eq([pl({ id: 'list', side: 'left' }), pl({ id: 'game', side: 'left' }), pl({ id: 'zz', side: 'right' }), pl({ id: 'zz', side: 'bottom' }), pl({ id: 'zz' }),
      pl({ id: 'zz', side: 'right', tab: 'analysis' }), pl({ id: 'hover', side: 'right', tab: 'pictures' }), pl({ id: 'hover', side: 'right', tab: 'nope' }), pl({ id: 'measure', side: 'bottom' }), pl({ id: 'measure', side: 'bottom' }, true), pl({}), pl(null)],
      ['picker', 'left', 'inspect', 'bottom', 'left', 'analysis', 'pictures', 'inspect', 'bottom', 'card', null, null],
      'placeOf: list to the picker, left stays left, an unknown right panel to Inspect, the tab option wins over the table (an unknown tab does not), a tool panel is a card');
    const sb = (z, u, m) => { const r = T.scaleBar(z, u, m); return r && [r.m, Math.round(r.px * 1000) / 1000]; };
    eq([sb(1, 20, 140), sb(0.05, 20, 140), sb(0.005, 20, 140), sb(0.0005, 20, 140), sb(10, 20, 140), sb(0.0123, 20, 140), sb(1, 20, 40), sb(1, 20, 39.9), sb(1, 10, 140)],
      [[5, 100], [100, 100], [1000, 100], [10000, 100], [0.5, 100], [500, 123], [2, 40], [1, 20], [10, 100]],
      'scale bar: the longest 1, 2 or 5 times ten to a power metres that fits (zoom 1 at 20 u a metre in 140 px: 5 m, 100 px; sub-metre 0.5 m; km)');
    { const bad = [];
      for (const z of [0.0007, 0.003, 0.0177, 0.21, 0.37, 1.3, 2.71, 7.9, 33]) { const r = T.scaleBar(z, 20, 140), m10 = Math.pow(10, Math.floor(Math.log10(r.m) + 1e-9)), mant = Number((r.m / m10).toPrecision(6));
        if (![1, 2, 5].includes(mant) || r.px > 140 + 1e-9 || r.px < 140 / 2.5 - 1e-9) bad.push([z, r]); }
      ok(!bad.length, 'scale bar: at 9 zooms a round 1-2-5 length between 40 % and 100 % of the room', bad); }
    eq([T.scaleBar(0, 20, 140), T.scaleBar(1, 20, 0), T.scaleBar(NaN, 20, 140), T.scaleBar(Infinity, 20, 140), T.scaleBar(1, -20, 140)], [null, null, null, null, null], 'no scale bar without a scale');
    const D = '  \u00B7  ';
    eq(T.stripText('x 1.0 m, y 2.0 m', [['Height', '12 m'], ['', 'a note'], ['Water', 0]], 8), 'x 1.0 m, y 2.0 m' + D + 'Height: 12 m' + D + 'a note' + D + 'Water: 0', 'strip text: the position, then label: value rows on one line (a row with no label shows its value)');
    eq(T.stripText('p', [['a', '1'], ['b', '2'], ['c', '3']], 2), 'p' + D + 'a: 1' + D + 'b: 2', 'strip text: the first max rows only');
    eq([T.stripText('p', null), T.stripText('p', [null, ['', '']])], ['p', 'p'], 'strip text: no rows, empty rows: the position only');
    const on = tag => T.typing({ target: { tagName: tag } });
    eq(['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'CANVAS', 'DIV'].map(on), [true, true, true, false, false, false], 'typing guard: an input, a select or a textarea holds the page keys; a button, the canvas or a div does not');
    ok(T.typing({ target: { tagName: 'DIV', isContentEditable: true } }) === true && T.typing({ target: { tagName: 'BODY' } }) === false && T.typing(null) === false, 'typing guard: editable text holds them too; the body (no document here) and no event do not');
    eq([T.offBox([-10, -10, 10, 10], 0, 0), T.offBox([-10, -10, 10, 10], 11, 0), T.offBox([-10, -10, 10, 10], 0, -11), T.offBox(null, 1e9, 0)], [false, true, true, false], 'offBox: outside the world box (no box: never)');
  }

  // ---------- 2 the page ----------
  // 2.0 JOBS (tools/gui/README.md): every request carries a name for the job list; a part's own name and {job:false} pass through
  { const seen = [], calls = [];
    const inner = routeApi({ 'GET /api/x/mapviz/palette': async () => PAL, 'GET /api/x/mapviz/cache': async () => ({ v: 1, root: '<cache>', bytes: 0, cap: 1, entries: 0, jobs: 0 }),
      'GET /api/x/mapviz/parts': async () => ({ v: 1, parts: [], styles: [] }), 'POST /api/x/mapviz/cancel': async (u, b) => ({ id: b.id, state: 'cancelled' }),
      'POST /api/x/mapviz/cache/clear': async () => ({ removed: 0, bytes: 0 }) }, calls);
    const P = mkPage({ scripts: [CLIENT], lang: L, S: { gameId: 'mowas2', gameOv: '', mod: '', mapKey: '' }, canvas: false, api: function (url, body, opt) { seen.push({ url, post: body !== undefined, opt }); return inner(url, body); } });
    P.screen.refresh(); P.screen.focus(); await flush();
    ok(seen.length > 0 && seen.every(c => c.opt && c.opt.what === L.en['mapviz.shell.w.read'] && !c.post), 'JOBS: the reads of the page carry the read name', seen.map(c => [c.url, c.opt]));
    seen.length = 0;
    await P.V.api('GET', 'parts', {}, { what: 'my name' });
    await P.V.api('GET', 'parts', {}, { job: false });
    await P.V.api('POST', 'cancel', { id: 'j1' });
    await P.V.api('POST', 'cache/clear', { scope: 'all' });
    await P.V.api('POST', 'cancel', { id: 'j1' }, { job: false });
    eq(seen.map(c => (c.post ? 'P ' : 'G ') + JSON.stringify(c.opt)), ['G {"what":"my name"}', 'G {"job":false}', 'P ' + JSON.stringify({ what: L.en['mapviz.shell.w.stop'] }),
      'P ' + JSON.stringify({ what: L.en['mapviz.shell.w.clear'] }), 'P {"job":false}'], 'JOBS: a part name wins, {job:false} passes with no name, POSTs are named by route');
    ok(/api\('\/api\/x\/mapviz\/job'\+qs\(\{id:id\}\)\)/.test(CLIENT), 'JOBS: the job poll is a GET job?id= (never listed)');
    for (const c of ['en', 'ru', 'uk', 'zh']) ok(['read', 'send', 'job', 'stop', 'clear'].every(k => typeof LANG[c]['mapviz.shell.w.' + k] === 'string' && LANG[c]['mapviz.shell.w.' + k].length > 3), 'JOBS: request names in ' + c);
  }
  // 2a no canvas context
  { const calls = [];
    const S = { gameId: 'mowas2', gameOv: '', mod: '', mapKey: '' };
    let P = null, err = null;
    try { P = mkPage({ scripts: [CLIENT], lang: L, S, canvas: false, api: routeApi({ 'GET /api/x/mapviz/palette': async () => PAL, 'GET /api/x/mapviz/cache': async () => ({ v: 1, root: '<cache>', bytes: 0, cap: 1, entries: 0, jobs: 0 }) }, calls) }); } catch (e) { err = e; }
    ok(!err && P && P.screen, 'no canvas context: the page builds', err && err.stack);
    if (P) {
      ok(!!blk(P.root, 'mv.nocanvas') && blk(P.root, 'mv.nocanvas').textContent === L.en['mapviz.shell.noCanvas'], 'no canvas context: the hint leaf');
      ok(!blk(P.root, 'mv.canvas'), 'no canvas context: no canvas leaf');
      ok(['refresh', 'focus', 'view'].every(k => typeof P.screen[k] === 'function'), 'screen object {refresh, focus, view}');
      ok(calls.length === 0, 'building makes no call', calls);
      P.screen.refresh(); P.screen.focus(); await flush();
      ok(calls.length > 0 && calls.every(c => c.method === 'GET'), 'refresh only reads (no POST, no job)', calls.map(c => c.method + ' ' + c.path));
      ok(P.V.pal && P.V.pal.v === PAL.v, 'refresh brings the palette (V.pal)');
      ok(P.V.q('target') === 'mowas2' && P.V.q('canvas') === false, 'target from the page game; V.q canvas false');
      // every leaf and container carries a blk id; fields are div.fld > label.f > span.n + control
      const flds = P.root.all().filter(e => e.className.split(' ').includes('fld'));
      ok(flds.length >= 2 && flds.every(f => f.attrs['data-blk'] && f.children[0].tagName === 'LABEL' && f.children[0].className === 'f' && f.children[0].children[0].className === 'n'), 'fields in the fld shape (' + flds.length + ')');
      const cv = blk(P.root, 'mv.readout'); ok(cv && cv.attrs['aria-live'] === 'polite', 'the readout is aria-live');
    }
  }
  // 2a1 a screen not shown reads nothing: the page refreshes every screen at start and on a mod change (tools/gui/page.js
  // setMod, refreshAll); the Map Viewer reads only when it is the screen shown (S.cur) and not hidden, so a GUI start
  // makes no mapviz call (no 404 for a product not made yet). show() refreshes it when it is picked.
  { const calls = [];
    const routes = { 'GET /api/x/mapviz/palette': async () => PAL, 'GET /api/x/mapviz/cache': async () => ({ v: 1, root: '<cache>', bytes: 0, cap: 1, entries: 0, jobs: 0 }) };
    const S = { gameId: 'mowas2', gameOv: '', mod: '', mapKey: 'map/multi/mv_fixture', cur: 'mods', sec: {} };
    const P = mkPage({ scripts: [CLIENT], lang: L, S, canvas: true, api: routeApi(routes, calls) });
    S.sec.mapviz = P.root;
    P.screen.refresh(); await flush();
    ok(calls.length === 0 && P.V.q('map') == null, 'another screen shown: refresh reads nothing (not the palette, the cache or the map)', calls.map(c => c.path));
    S.cur = 'mapviz'; P.root.hidden = true; P.screen.refresh(); await flush();
    ok(calls.length === 0, 'the section still hidden: refresh reads nothing', calls.map(c => c.path));
    P.root.hidden = false; P.screen.refresh(); await flush();
    const ps = calls.map(c => c.path);
    ok(ps.indexOf('/api/x/mapviz/palette') >= 0 && ps.indexOf('/api/x/mapviz/cache') >= 0 && P.V.q('map') === 'multi/mv_fixture' && calls.every(c => c.method === 'GET'), 'shown: refresh reads the palette, the cache and the page map', ps);
    // planted: a section that is not the page's Map Viewer section (S.sec.mapviz is another element) is not gated by S.cur
    const c2 = [], S2 = { gameId: 'mowas2', gameOv: '', mod: '', mapKey: '', cur: 'mods', sec: { mapviz: {} } };
    const P2 = mkPage({ scripts: [CLIENT], lang: L, S: S2, canvas: true, api: routeApi(routes, c2) });
    P2.screen.refresh(); await flush();
    ok(c2.length > 0, 'planted: S.cur names another screen but this root is not the page section: it reads (the gate is for the page section only)', c2.length);
  }
  // 2a2 no canvas context with a map: the visible 'source' layers are still fetched and listed, V.relist, tool layers
  { const calls = [], seenL = [];
    const DOC = { v: 1, key: 'multi/mv_fixture', modes: [{ id: 'combat' }], boxes: { world: [-600, -440, 600, 440] }, entities: [] };
    const SPW = { v: 1, kind: 'vector', name: 'spawns', items: [{ kind: 'spawn', mode: 'combat', name: 'a1', team: 'a', order: 1, x: -500, y: 10, z: null, yaw: 0 }], pal: 'sides', palette: PAL.sides };
    const routes = { 'GET /api/x/mapviz/palette': async () => PAL, 'GET /api/x/mapviz/cache': async () => ({ v: 1, root: '<cache>', bytes: 0, cap: 1, entries: 0, jobs: 0 }),
      'GET /api/x/mapviz/doc': async () => DOC, 'GET /api/x/mapviz/layer': async u => { if (u.searchParams.get('name') === 'spawns') return SPW; throw Object.assign(new Error('MV_USAGE'), { status: 400, key: 'mapviz.err.MV_USAGE', params: { msg: 'x' } }); } };
    let late = [];
    const part = { id: 'np', init(V) {
      V.addLayer({ id: 'spawns', group: 'game', label: 'Spawns', engineTrue: true });
      V.addLayer({ id: 'offl', group: 'water', label: 'Off layer', defaultOn: false });
      V.addLayer({ id: 'late', group: 'checks', label: 'Late list', draw() {}, list: () => late });
      V.addLayer({ id: 'meas', group: 'checks', label: 'Measure line', defaultOn: true, draw() {} });
      V.addTool({ id: 'meas', label: 'Measure', key: 'm', start() {}, end() {} });
      V.addLayer({ id: 'prof', group: 'checks', label: 'Profile line', defaultOn: true, tool: true, draw() {} });
      V.on('layers', d => seenL.push(d));
    } };
    const P = mkPage({ scripts: [CLIENT], lang: L, S: { gameId: 'mowas2', gameOv: '', mod: '', mapKey: '' }, canvas: false, api: routeApi(routes, calls), parts: [part] });
    ok(typeof P.V.relist === 'function', 'V.relist is part of the page API');
    P.screen.view('mowas2~multi/mv_fixture~combat~spawns,late~0,0,1'); P.screen.refresh();
    await until(() => blk(P.root, 'mv.items').has('a1'), 5000);
    const lnames = calls.filter(c => c.path === '/api/x/mapviz/layer').map(c => new URL(c.url, 'http://x').searchParams.get('name'));
    ok(blk(P.root, 'mv.items').has('a1'), 'no canvas context: a visible source layer is fetched and its items are listed', blk(P.root, 'mv.items').textContent);
    ok(lnames.indexOf('spawns') >= 0 && lnames.indexOf('offl') < 0, 'no canvas context: a layer that is not visible is not fetched', lnames);
    ok(calls.every(c => c.method === 'GET'), 'no canvas context: only reads');
    ok(!blk(P.root, 'mv.items').has('Late item'), 'a part list starts empty');
    const nl = calls.length;
    late = [{ label: 'Late item', x: 1, y: 2 }]; P.V.relist(); P.V.redraw(); await flush();
    ok(calls.length === nl, 'no canvas context: a fetched layer is not fetched again on relist or redraw', calls.slice(nl).map(c => c.url));
    ok(blk(P.root, 'mv.items').has('Late item'), 'V.relist draws the item lists again with a part list that changed');
    const inp = P.root.all().find(e => e.tagName === 'INPUT' && e.attrs['aria-label'] === L.en['mapviz.shell.link']);
    const pl = T.parseLink(decodeURIComponent(String(inp.value).replace(/^#go=/, '')));
    ok(pl && pl.layers.indexOf('spawns') >= 0 && pl.layers.indexOf('meas') < 0 && pl.layers.indexOf('prof') < 0, 'seeded: tool layers on (by tool id and by tool: true) are not in the link', inp.value);
    ok(P.V.q('layers').indexOf('meas') < 0 && P.V.q('allLayers').indexOf('prof') < 0, 'tool layers are not in V.q layers or allLayers');
    const box = c => blk(P.root, 'mv.groups').all().find(e => e.tagName === 'INPUT' && e.attrs.type === 'checkbox' && e.parentNode && e.parentNode.has(c));
    ok(box('Measure line') && box('Measure line').checked === true && box('Profile line').checked === true, 'a permalink leaves the tick of a tool layer alone');
    const lb = box('Late list'); lb.checked = false; lb.fire('change');
    ok(seenL.length && seenL[seenL.length - 1].visible.indexOf('meas') >= 0, 'the layers event still counts a visible tool layer', seenL);
  }
  // 2b RMT
  { const calls = [];
    const P = mkPage({ scripts: [CLIENT], lang: L, S: { gameId: 'mowas2', mapKey: '' }, rmt: true, canvas: true, api: routeApi({}, calls) });
    P.screen.refresh(); P.screen.view('mowas2~multi/mv_fixture~~~0,0,1'); P.screen.focus();
    let rej = null; await P.V.api('GET', 'maps').catch(e => { rej = e; }); await P.V.job('maps').catch(() => {});
    await flush();
    ok(calls.length === 0, 'RMT: no mapviz call at all', calls);
    ok(P.root.has(L.en['mapviz.shell.rmt']) && !!blk(P.root, 'mv.rmt'), 'RMT: the view-only note');
    ok(rej && rej.key === 'mapviz.err.MV_REFUSED', 'RMT: V.api refuses without a call');
  }
  // 2c stub 2D context, stub routes
  { const calls = [], said = [];
    const G2 = Buffer.from([1, 2, 2, 1]).toString('base64');
    const routes = {
      'GET /api/x/mapviz/palette': async () => PAL,
      'GET /api/x/mapviz/cache': async () => ({ v: 1, root: '<cache>', bytes: 3 * 1048576, cap: 2048 * 1048576, entries: 1, jobs: 0 }),
      'GET /api/x/mapviz/doc': async () => { throw Object.assign(new Error('MV_NOT_FOUND'), { status: 404, key: 'mapviz.err.MV_NOT_FOUND', params: { msg: 'x', need: { what: 'doc', args: { map: 'multi/mv_fixture' } } } }); },
      'GET /api/x/mapviz/tiles': async u => {
        const z = Number(u.searchParams.get('z')), t = u.searchParams.get('t').split(',');
        return { v: 1, kind: 'tiles', base: 'tst', z, zmax: 1, w: 300, h: 200, ox: -1500, oy: -1000, cell: 10, box: [-1500, -1000, 1500, 1000], tiles: t.map(x => (x === '1.0' ? { t: x, missing: true } : { t: x, png: 'iVBORw0KGgo=' })) };
      },
      'GET /api/x/mapviz/layer': async u => {
        const n = u.searchParams.get('name');
        if (n === 'bad.grid') return { v: 1, kind: 'grid', name: n, w: 4, h: 4, cell: 10, ox: 0, oy: 0, etype: 'u8', sample: 'cell', scale: 1, offset: 0, nodata: null, meta: {}, data: Buffer.alloc(10).toString('base64'), pal: 'water.bands', palette: PAL.water.bands };
        if (n === 'good.grid') return { v: 1, kind: 'grid', name: n, w: 2, h: 2, cell: 10, ox: -10, oy: -10, etype: 'u8', sample: 'cell', scale: 1, offset: 0, nodata: null, meta: {}, data: G2, pal: 'water.bands', palette: PAL.water.bands };
        if (n === 'spawns') return { v: 1, kind: 'vector', name: n, items: [{ kind: 'spawn', mode: 'combat', name: 'a1', team: 'a', order: 1, x: -500, y: 10, z: null, yaw: 0 }, { kind: 'spawn', mode: 'combat', name: null, team: 'b', order: 1, x: 500, y: 10, z: null, yaw: 180 }], pal: 'sides', palette: PAL.sides };
        throw Object.assign(new Error('MV_NOT_FOUND'), { status: 404, key: 'mapviz.err.MV_NOT_FOUND', params: { msg: 'x', need: { what: 'water', args: { map: 'multi/mv_fixture', mode: 'combat' } } } });
      },
      'POST /api/x/mapviz/job': async b => ({ id: 'jf', shared: false, state: 'queued', queue: 2 }),
      'GET /api/x/mapviz/job': async () => ({ id: 'jf', what: 'water', key: 'k', state: 'failed', stage: '', done: 0, total: 0, elapsed: 0, queue: 0, error: { code: 'MV_FAULT', msg: 'seeded failure' } }),
    };
    routes['POST /api/x/mapviz/job'] = async (u, b) => { said.push(b); return { id: 'jf', shared: false, state: 'queued', queue: 2 }; };
    const S = { gameId: 'mowas2', gameOv: '<game>', mod: '', mapKey: '' };
    let hovered = 0, clicks = [];
    const part = { id: 'testpart', init(V) {
      V.addLayer({ id: 'tst', group: 'base', label: 'mapviz.shell.group.base', tiles: 'tst', engineTrue: false });
      V.addLayer({ id: 'good.grid', group: 'water', label: 'Good grid', legend: [{ label: 'Swim', color: PAL.water.bands[2].fill }] });
      V.addLayer({ id: 'bad.grid', group: 'water', label: 'Bad grid', legend: [{ label: 'BadSwatch', color: PAL.water.bands[2].fill }] });
      V.addLayer({ id: 'need.grid', group: 'water', label: 'Needs a job', legend: [{ label: 'NeedSwatch', color: PAL.water.bands[2].fill }] });
      V.addLayer({ id: 'selfdraw.none', group: 'fairness', label: 'Draws nothing', draw: function () {}, drawn: function () { return false; }, legend: [{ label: 'NoneSwatch', color: PAL.water.bands[2].fill }] });
      V.addLayer({ id: 'selfdraw.note', group: 'fairness', label: 'Note only', draw: function () {}, legend: [{ label: 'NoColourNote' }] });
      V.addLayer({ id: 'spawns', group: 'game', label: 'Spawns', engineTrue: true });
      V.addLayer({ id: 'strong.a', group: 'strong', label: 'Strong', defaultOn: true, draw() {} });
      V.addLayer({ id: 'fair.a', group: 'fairness', label: 'Fair', draw() {} });
      V.addLayer({ id: 'pass', group: 'game', label: 'Pass', draw() {} });
      ok(V.addLayer({ id: 'x', group: 'nogroup' }) === false, 'addLayer refuses an unknown group');
      V.addHover((x, y) => { hovered++; return [{ label: 'Test', value: 'v' }]; });
      V.addTool({ id: 't1', label: 'Tool', key: 'm', start() {}, click(x, y) { clicks.push([x, y]); }, end() {} });
    } };
    const P = mkPage({ scripts: [CLIENT], lang: L, S, canvas: true, api: routeApi(routes, calls), parts: [part] });
    ok(P.V.q('canvas') === true && !!blk(P.root, 'mv.canvas'), 'stub 2D context: the canvas leaf');
    const canvas = P.root.all().find(e => e.tagName === 'CANVAS');
    ok(canvas.attrs.tabindex === '0' && canvas.attrs['aria-label'] === L.en['mapviz.shell.canvas'], 'canvas: tabindex 0 and an aria-label');
    P.screen.view('mowas2~multi/mv_fixture~combat~tst,good.grid,bad.grid,need.grid,spawns,strong.a~0,0,0.2');
    P.screen.refresh();
    await flush(60); P.V.redraw(); await flush(30);
    ok(S.mapKey === 'map/multi/mv_fixture', 'S.mapKey written while the page game is the viewer target');
    eq([P.V.view.cx, P.V.view.cy, P.V.view.zoom], [0, 0, 0.2], 'the permalink view is applied');
    ok(P.V.q('mode') === 'combat', 'the permalink mode is applied');
    const tileDraws = P.log.filter(c => c.op === 'drawImage' && c.src instanceof ImageStub);
    ok(tileDraws.length >= 1 && tileDraws.every(c => JSON.stringify(c.args) === JSON.stringify([100, 100, 512, 512])), 'tile 0.0 drawn at 100,100 size 512; tile 1.0 (missing) never', tileDraws.map(c => c.args));
    const tileCalls = () => calls.filter(c => c.path === '/api/x/mapviz/tiles').length, tc = tileCalls();
    P.V.redraw(); await flush(20);
    ok(tileCalls() === tc, 'seeded defect: a missing tile is not drawn and not asked again (' + tc + ' tile calls)');
    ok(calls.filter(c => c.path === '/api/x/mapviz/tiles').every(c => (new URL(c.url, 'http://x').searchParams.get('t') || '').split(',').length <= 16), 'tile batches of at most 16');
    const tq = new URL(calls.find(c => c.path === '/api/x/mapviz/tiles').url, 'http://x').searchParams;
    ok(tq.get('target') === 'mowas2' && tq.get('game') === '<game>' && tq.get('map') === 'multi/mv_fixture' && tq.get('mode') === 'combat', 'calls carry target, game, map and mode from the page');
    const grp = blk(P.root, 'mv.groups');
    ok(grp.has('Bad grid') && grp.has(L.en['mapviz.shell.badLayer'].split(':')[0]), 'seeded defect: a layer envelope with a wrong size shows the layer fault', grp.textContent);
    ok(grp.has(L.en['mapviz.shell.fault.size']) && !/bytes|etype/.test(grp.textContent), 'the layer fault is in plain words (wrong data size), not a decode message', grp.textContent);
    ok(P.log.some(c => c.op === 'putImageData') && P.log.some(c => c.op === 'drawImage' && !(c.src instanceof ImageStub)), 'a good grid envelope is drawn through an off-screen picture');
    ok(P.log.some(c => c.op === 'arc'), 'the vector layer (spawns) is drawn');
    ok(grp.has(L.en['mapviz.shell.notMade']) && grp.has(L.en['mapviz.shell.make']), 'a layer not made yet offers its job');
    ok(blk(P.root, 'mv.onnow').has('Swim') && blk(P.root, 'mv.onnow').all().some(e => e.attrs['data-legend'] === 'good.grid' && e.has('Swim')), 'On now shows a visible layer with its legend swatches');
    { const lg = blk(P.root, 'mv.onnow');
      ok(!lg.has('BadSwatch') && !lg.has('NeedSwatch') && !lg.has('NoneSwatch') && !lg.has('NoColourNote'), 'the legend lists only what is drawn now: no faulty layer, no layer not made, no layer that says it draws nothing, no row without a colour', lg.textContent);
      ok(lg.has(L.en['mapviz.shell.group.water']), 'On now is in the same groups as the layer list', lg.textContent); }
    ok(blk(P.root, 'mv.items').has('a1'), 'the DOM list repeats the drawn items');
    ok(blk(P.root, 'mv.items').has(L.en['mapviz.shell.item.spawn'] + ' (combat)') && !blk(P.root, 'mv.items').has('spawn (combat)'), 'an item with no name is listed with its kind in words', blk(P.root, 'mv.items').textContent);
    ok(grp.has(L.en['mapviz.shell.engineTrue']) && grp.has(L.en['mapviz.shell.estimate']), 'engine-true and estimate marks');
    // the job that fails (seeded): the Make button of need.grid
    const make = grp.all().find(e => e.tagName === 'BUTTON' && e.textContent === L.en['mapviz.shell.make']);
    make.click(); await until(() => blk(P.root, 'mv.say').has('seeded failure'), 5000);
    ok(blk(P.root, 'mv.say').has('seeded failure'), 'seeded defect: a failed job is told on the page', blk(P.root, 'mv.say').textContent);
    ok(blk(P.root, 'mv.say').has(L.en['mapviz.shell.what.water']), 'the failed job is named in words, not by its id', blk(P.root, 'mv.say').textContent);
    ok(said[0] && said[0].what === 'water' && said[0].mode === 'combat' && said[0].map === 'multi/mv_fixture' && said[0].target === 'mowas2', 'the need button posts the need job with the page target', said[0]);
    let jerr = null; await P.V.job('water', { mode: 'combat' }).catch(e => { jerr = e; });
    ok(jerr && jerr.key === 'mapviz.err.MV_FAULT' && jerr.params.msg === 'seeded failure', 'V.job rejects a failed job with mapviz.err.<code>');
    ok(blk(P.root, 'mv.jobline').has(L.en['mapviz.shell.jobNone']), 'the job line is empty after the failure');
    let uerr = null; await P.V.job('water', { bogus: 1 }).catch(e => { uerr = e; }); ok(uerr && uerr.key === 'mapviz.err.MV_USAGE', 'V.job refuses an unknown field');
    // permalink: strong and fairness left out unless include analysis is ticked; include is never in the link
    const inp = P.root.all().find(e => e.tagName === 'INPUT' && e.attrs['aria-label'] === L.en['mapviz.shell.link']);
    const parse = () => T.parseLink(decodeURIComponent(String(inp.value).replace(/^#go=/, '')));
    let pl = parse();
    ok(pl && pl.layers.includes('tst') && !pl.layers.includes('strong.a') && pl.map === 'multi/mv_fixture' && pl.mode === 'combat', 'the link leaves out a visible strong layer', inp.value);
    ok(P.V.q('layers').indexOf('strong.a') < 0 && P.V.q('allLayers').indexOf('strong.a') >= 0, 'V.q layers is the shareable list');
    const incl = P.root.all().find(e => e.tagName === 'INPUT' && e.attrs.type === 'checkbox' && e.parentNode && e.parentNode.has(L.en['mapviz.shell.include']));
    ok(incl && incl.checked === false, 'include analysis is off by default');
    incl.checked = true; incl.fire('change');
    pl = parse(); ok(pl && pl.layers.includes('strong.a') && !pl.layers.includes('fair.a'), 'include analysis puts the visible strong layer in the link');
    ok(decodeURIComponent(inp.value).split('~').length === 5 && !/include/.test(inp.value), 'the include tick is not saved in the link');
    ok(!/<game>|game=/.test(decodeURIComponent(inp.value)), 'the link holds no game or mod path');
    // a group switched off: its layers leave the link, V.q('layers') and the layers event
    const seenL = []; P.V.on('layers', d => seenL.push(d));
    const groupBox = g => { const hd = blk(P.root, 'mv.g.' + g + '.head'); return hd && hd.all().find(e => e.tagName === 'INPUT' && e.attrs.type === 'checkbox' && e.attrs['aria-label'] === L.en['mapviz.shell.grpTick'].replace('{group}', L.en['mapviz.shell.group.' + g])); };
    let gb = groupBox('base'); ok(gb && gb.checked === true, 'the base group tick starts on');
    gb.checked = false; gb.fire('change');
    pl = parse(); ok(pl && !pl.layers.includes('tst') && pl.layers.includes('spawns'), 'group off: its layer is not in the link', inp.value);
    ok(P.V.q('layers').indexOf('tst') < 0 && P.V.q('allLayers').indexOf('tst') < 0, 'group off: V.q layers and allLayers leave it out');
    ok(seenL.length === 1 && seenL[0].visible.indexOf('tst') < 0 && seenL[0].visible.indexOf('spawns') >= 0, 'group off: the layers event leaves it out', seenL);
    gb = groupBox('base'); gb.checked = true; gb.fire('change');
    pl = parse(); ok(pl && pl.layers.includes('tst'), 'group on again: the layer is back in the link');
    // groups: a layer naming its old group lands in the new one; folds (head button, on/total, fold all, LS); tips
    ok(!!blk(P.root, 'mv.g.movement') && !!blk(P.root, 'mv.l.pass') && blk(P.root, 'mv.g.movement').all().includes(blk(P.root, 'mv.l.pass')) && !blk(P.root, 'mv.g.game').all().includes(blk(P.root, 'mv.l.pass')), 'seeded: a layer that names its old group (pass in game) lands in movement');
    const foldBtn = g => blk(P.root, 'mv.g.' + g + '.head').all().find(e => e.tagName === 'BUTTON' && e.className === 'mvfold');
    const rowsOf = g => blk(P.root, 'mv.g.' + g).all().filter(e => e.attrs && e.attrs['data-layer']);
    let fw = foldBtn('water');
    ok(fw && fw.attrs['aria-expanded'] === 'true' && fw.has(L.en['mapviz.shell.group.water']) && fw.has(L.en['mapviz.shell.grpCount'].replace('{on}', '3').replace('{n}', '3')) && rowsOf('water').every(r => r.hidden !== true), 'a group head: fold button with its name and on/total (3/3), rows shown', fw && fw.textContent);
    fw.click(); fw = foldBtn('water');
    ok(fw.attrs['aria-expanded'] === 'false' && rowsOf('water').length === 3 && rowsOf('water').every(r => r.hidden === true) && global.LS.m['maps.viewer.fold.water'] === true, 'a click on the head folds the group (rows kept, hidden) and LS keeps it', global.LS.m);
    ok(!rowsOf('game').some(r => r.hidden === true), 'folding one group leaves the others open');
    const bar = blk(P.root, 'mv.groups.bar'), bBtn = t => bar.all().find(e => e.tagName === 'BUTTON' && e.textContent === t);
    bBtn(L.en['mapviz.shell.foldAll']).click();
    ok(['base', 'water', 'game', 'movement', 'strong', 'fairness'].every(g => foldBtn(g).attrs['aria-expanded'] === 'false' && rowsOf(g).every(r => r.hidden === true)), 'fold all folds every group');
    blk(P.root, 'mv.groups.bar').all().find(e => e.tagName === 'BUTTON' && e.textContent === L.en['mapviz.shell.unfoldAll']).click();
    ok(['base', 'water', 'game', 'movement'].every(g => foldBtn(g).attrs['aria-expanded'] === 'true' && rowsOf(g).every(r => r.hidden !== true)) && global.LS.m['maps.viewer.fold.base'] === false, 'unfold all opens every group');
    const offOne = blk(P.root, 'mv.l.good.grid').all().find(e => e.tagName === 'INPUT'); offOne.checked = false; offOne.fire('change');
    ok(foldBtn('water').has(L.en['mapviz.shell.grpCount'].replace('{on}', '2').replace('{n}', '3')), 'the count follows a layer tick (2/3)', foldBtn('water').textContent);
    offOne.checked = true; offOne.fire('change');
    // tips: a layer with a tip (spawns) has it as the label title (the mouse) and as the description of its tick (screen
    // readers), and its text shows under the row while the row has the keyboard focus; no ? button. A group head the same way
    const tipS = L.en['mapviz.shell.tip.l.spawns'], rowS = blk(P.root, 'mv.l.spawns');
    const lab = rowS.all().find(e => e.tagName === 'LABEL'), cbS = rowS.all().find(e => e.tagName === 'INPUT'), tp = rowS.all().find(e => e.tagName === 'P');
    ok(tipS && lab.attrs.title === tipS && tp && tp.textContent === tipS && / ?mvtip/.test(tp.className) && tp.attrs.id && cbS.attrs['aria-describedby'] === tp.attrs.id, 'layer tip: label title, the tick described by the help text', [lab.attrs.title, cbS.attrs['aria-describedby'], tp && tp.attrs.id]);
    ok(/\.mvtop\.blc\{[^}]*isolation:isolate/.test(CLIENT), 'the page stacks its own layers (isolation), so the sticky window header goes over the tool row');
    ok(/\.mvtip\{display:none/.test(CLIENT) && /:has\(:focus-visible\)>\.mvtip\{display:block\}/.test(CLIENT) && /\.mvtip\{display:none;position:absolute/.test(CLIENT) && !/focus-within>\.mvtip/.test(CLIENT) && /function holdAt\(/.test(CLIENT), 'the help text shows for the keyboard focus only and floats over the rows; a rebuild holds the control in use in place');
    ok(!P.root.all().some(e => e.className === 'mvq') && !rowS.all().some(e => e.tagName === 'BUTTON'), 'no ? buttons: the help is the title and the description');
    ok(!blk(P.root, 'mv.l.good.grid').all().some(e => e.tagName === 'P') && !blk(P.root, 'mv.l.good.grid').all().find(e => e.tagName === 'LABEL').attrs.title && !blk(P.root, 'mv.l.good.grid').all().find(e => e.tagName === 'INPUT').attrs['aria-describedby'], 'a layer with no tip text has no title, no description and no text');
    const gh = blk(P.root, 'mv.g.water.head'), gp = gh.all().find(e => e.tagName === 'P');
    ok(gp && gp.textContent === L.en['mapviz.shell.tip.g.water'] && foldBtn('water').attrs.title === L.en['mapviz.shell.tip.g.water'] && foldBtn('water').attrs['aria-describedby'] === gp.attrs.id, 'group tip: the fold button title and description, the text in the head');
    const marks = grp.all().filter(e => e.tagName === 'SPAN' && e.className === 'mvmark');
    ok(marks.length >= 4 && marks.every(m => { const t = m.attrs['data-mark'] === 'true', vh = m.all().find(x => x.className === 'mvvh'), sy = m.all().find(x => x.attrs['aria-hidden'] === 'true');
      return m.attrs.title === L.en[t ? 'mapviz.shell.tip.engineTrue' : 'mapviz.shell.tip.estimate'] && vh && vh.textContent.trim() === L.en[t ? 'mapviz.shell.engineTrue' : 'mapviz.shell.estimate'] && sy && sy.textContent.trim() === (t ? T.MK_T : T.MK_E); }),
      'the marks: a symbol with its explanation as title and its words for screen readers', marks.length);
    ok(blk(P.root, 'mv.l.spawns').all().find(e => e.className === 'mvmark').attrs['data-mark'] === 'true' && blk(P.root, 'mv.l.good.grid').all().find(e => e.className === 'mvmark').attrs['data-mark'] === 'estimate', 'the marks keep as the game sees it apart from estimate');
    // zoom about the cursor on the canvas, keys
    const w0 = P.V.toWorld(200, 150);
    canvas.fire('wheel', { clientX: 200, clientY: 150, deltaY: -100 });
    const w1 = P.V.toWorld(200, 150);
    ok(Math.abs(w0[0] - w1[0]) < 1e-6 && Math.abs(w0[1] - w1[1]) < 1e-6 && P.V.view.zoom > 0.2, 'wheel zooms about the cursor');
    const zv = P.V.view.zoom; canvas.fire('keydown', { key: '-' }); ok(P.V.view.zoom < zv, 'minus zooms out');
    const cy0 = P.V.view.cy; canvas.fire('keydown', { key: 'ArrowUp', shiftKey: true }); ok(P.V.view.cy > cy0, 'Shift+Up pans north (screen up = +world y)');
    canvas.fire('keydown', { key: 'ArrowRight' }); ok(P.V.q('cursor') && hovered > 0 && blk(P.root, 'mv.readout').has('Test'), 'arrows move the cursor; hover rows in the readout');
    canvas.fire('keydown', { key: 'm' }); canvas.fire('keydown', { key: 'Enter' });
    ok(clicks.length === 1, 'a tool key starts the tool; Enter acts at the cursor');
    canvas.fire('keydown', { key: 'Escape' }); canvas.fire('keydown', { key: 'Enter' }); ok(clicks.length === 1, 'Esc ends the tool');
    canvas.fire('keydown', { key: '0' }); ok(P.V.view.zoom === P.V.view.zoom, '0 fits (no throw without a map box)');
    const keys = blk(P.root, 'mv.keys'); ok(keys && keys.hidden === true, 'the key list starts hidden'); canvas.fire('keydown', { key: '?' }); ok(keys.hidden === false && keys.has(L.en['mapviz.shell.key.pan']), '? shows the key list');
    const kbds = keys.all().filter(e => e.tagName === 'KBD').map(e => e.textContent), dds = keys.all().filter(e => e.tagName === 'DD').map(e => e.textContent);
    ok(kbds.indexOf('m') >= 0 && dds.indexOf('Tool') >= 0 && kbds.length === dds.length, 'the key list holds a tool key added by a part', { kbds, dds });
    ok(canvas.attrs.role === 'application', 'the canvas is an application leaf (arrow keys reach it), not an image');
    const n0 = P.log.length; P.themes.forEach(f => f()); ok(P.log.length > n0, 'colours are drawn again on a theme change');
    ok(blk(P.root, 'mv.cacheline').has('3 MB'), 'the cache line', blk(P.root, 'mv.cacheline').textContent);
    // the block rule of the GUI (tools/gui/test/blockcheck.js) on the loaded page: groups, layer rows, item lists, a legend
    const BC = require('../../../test/blockcheck');
    ok(!!blk(P.root, 'mv.onnow') && blk(P.root, 'mv.onnow').has('Swim') && !!blk(P.root, 'mv.l.good.grid') && !!blk(P.root, 'mv.items.spawns') && !!blk(P.root, 'mv.g.water.head'), 'the loaded page has On now with a legend, layer rows, item lists and group heads to check');
    const bp = BC.checkScreen(P.root, 'mapviz');
    ok(bp.length === 0, 'every control and text sits in a leaf block (the GUI block rule)', bp.slice(0, 8));
    const named = P.root.all().filter(e => e.attrs['data-blkname'] != null);
    ok(named.length >= 20 && named.every(e => e.attrs['data-blk'] && String(e.attrs['data-blkname']).trim() && !/^mapviz\./.test(e.attrs['data-blkname'])), 'block names are words, never a bare key (' + named.length + ')', named.filter(e => /^mapviz\./.test(e.attrs['data-blkname'])).map(e => e.attrs['data-blk']));
    ok(blk(P.root, 'mv.g.water').attrs['data-blkname'] === L.en['mapviz.shell.group.water'] && blk(P.root, 'mv.g.water.head').attrs['data-blkname'] === L.en['mapviz.shell.blk.grpHead'].replace('{group}', L.en['mapviz.shell.group.water']), 'a group is a named container, its head a named leaf', [blk(P.root, 'mv.g.water').attrs['data-blkname'], blk(P.root, 'mv.g.water.head').attrs['data-blkname']]);
    // planted: a bare button straight in a container and a block id with an underscore are caught
    const main = blk(P.root, 'mv.main'), bare = P.doc.createElement('button'); bare.textContent = 'Bare'; main.appendChild(bare);
    const bad = P.doc.createElement('div'); bad.setAttribute('data-blk', 'mv.bad_id'); bad.className = 'blk'; bad.textContent = 'x'; main.appendChild(bad);
    const bp2 = BC.checkScreen(P.root, 'mapviz');
    ok(bp2.some(s => /button "Bare" sits in the container "mv\.main"/.test(s)) && bp2.some(s => /"mv\.bad_id" is not lower case/.test(s)), 'planted: a bare button in a container and an id with _ are caught', bp2);
    main.removeChild(bare); main.removeChild(bad);
    ok(BC.checkScreen(P.root, 'mapviz').length === 0, 'the planted pieces taken out: clean again');
    // W2: a permalink opens only in the game it names: on an AS64 page a MoW:AS2 link waits and says which game it needs;
    // S.mapKey is not written for it; it opens when the page game becomes MoW:AS2
    const S2 = { gameId: 'as64', mapKey: 'map/old/one' };
    const P2 = mkPage({ scripts: [CLIENT], lang: L, S: S2, canvas: true, api: routeApi(routes, []) });
    P2.screen.view('mowas2~multi/mv_fixture~~~0,0,1');
    const want2 = L.en['mapviz.shell.otherGame'].split('{game}').join(L.en['mapviz.shell.gameName.mowas2']);
    ok(blk(P2.root, 'mv.say').textContent === want2 && P2.V.q('map') == null && P2.V.q('target') !== 'mowas2', 'W2: a link of another game waits and names the game it needs', blk(P2.root, 'mv.say').textContent);
    P2.screen.refresh(); await flush();
    ok(S2.mapKey === 'map/old/one' && P2.V.q('target') === 'as64' && P2.V.q('map') !== 'multi/mv_fixture', 'W2: S.mapKey kept and the page stays on its own game while the link waits', [S2.mapKey, P2.V.q('target'), P2.V.q('map')]);
    S2.gameId = 'mowas2'; P2.screen.refresh(); await flush();
    ok(P2.V.q('target') === 'mowas2' && P2.V.q('map') === 'multi/mv_fixture' && S2.mapKey === 'map/multi/mv_fixture', 'W2: the waiting link opens once the page game is the one it names', [P2.V.q('target'), P2.V.q('map'), S2.mapKey]);
    for (const code of ['as64', 'goh']) {
      const Sx = { gameId: 'mowas2', mapKey: '' }, Px = mkPage({ scripts: [CLIENT], lang: L, S: Sx, canvas: true, api: routeApi(routes, []) });
      Px.screen.refresh(); Px.screen.view(code + '~multi/a~~~0,0,1');
      ok(blk(Px.root, 'mv.say').has(L.en['mapviz.shell.gameName.' + code]) && Px.V.q('map') == null && Px.V.q('target') === 'mowas2', 'W2: a ' + code + ' link on a MoW:AS2 page does not open', blk(Px.root, 'mv.say').textContent);
    }
    const S3 = { gameId: 'mowas2', mapKey: 'map/multi/mv_fixture' }, c3 = [];
    const P3 = mkPage({ scripts: [CLIENT], lang: L, S: S3, canvas: true, api: routeApi(routes, c3) });
    P3.screen.refresh(); await flush();
    ok(P3.V.q('map') === 'multi/mv_fixture', 'S.mapKey read on refresh');
    ok(c3.every(c => c.method === 'GET'), 'refresh with a map whose document is not made starts no job');
    ok(blk(P3.root, 'mv.say').has(L.en['mapviz.shell.docNeed']), 'a map not read yet shows the read button');
    P3.screen.view('not a link'); ok(blk(P3.root, 'mv.say').has(L.en['mapviz.shell.badLink']), 'a bad link is told');
    // the job line names the job and its stage in words
    let polls = 0, line = null; const jl = [];
    const r4 = Object.assign({}, routes, {
      'POST /api/x/mapviz/job': async () => ({ id: 'jt', shared: false, state: 'queued', queue: 0 }),
      'GET /api/x/mapviz/job': async () => (line && jl.push(line.textContent), ++polls < 2 ? { id: 'jt', what: 'topo', state: 'running', stage: 'tiles', done: 1, total: 4, queue: 0 } : polls < 3 ? { id: 'jt', what: 'topo', state: 'running', stage: 'zzz', done: 0, total: 0, queue: 0 } : { id: 'jt', what: 'topo', state: 'done', stage: '', done: 4, total: 4, queue: 0 }),
    });
    const P4 = mkPage({ scripts: [CLIENT], lang: L, S: { gameId: 'mowas2', mapKey: '' }, canvas: true, api: routeApi(r4, []) });
    line = blk(P4.root, 'mv.jobline');
    P4.screen.view('mowas2~multi/mv_fixture~~~0,0,1');
    await P4.V.job('topo').catch(() => {}); jl.push(line.textContent);
    ok(line.has(L.en['mapviz.shell.jobNone']), 'job line: empty after the job is done');
    ok(jl.some(s => s.indexOf(L.en['mapviz.shell.what.topo'] + ': ' + L.en['mapviz.shell.stage.tiles'] + ', 1 of 4') >= 0), 'job line: job and stage in words', jl);
    ok(jl.some(s => s.indexOf(L.en['mapviz.shell.what.topo'] + ': ' + L.en['mapviz.shell.stage.other']) >= 0) && !jl.some(s => /zzz|topo:/.test(s)), 'job line: an unknown stage id is not shown', jl);
  }
  // 2d W2: the game, its folder or the mod changes: the open map closes (map, mode, document, item lists, cursor,
  // permalink, the parts' map event with key null) and the S.mapKey the old game left is not followed
  { const DOC = { v: 1, key: 'multi/mv_fixture', modes: [{ id: 'combat' }, { id: 'frontline' }], boxes: { world: [-600, -440, 600, 440] }, entities: [] };
    const SPW = { v: 1, kind: 'vector', name: 'spawns', items: [{ kind: 'spawn', mode: 'combat', name: 'a1', team: 'a', order: 1, x: -500, y: 10, z: null, yaw: 0 }], pal: 'sides', palette: PAL.sides };
    const calls = [], maps = [];
    const routes = { 'GET /api/x/mapviz/palette': async () => PAL, 'GET /api/x/mapviz/cache': async () => ({ v: 1, root: '<cache>', bytes: 0, cap: 1, entries: 0, jobs: 0 }),
      'GET /api/x/mapviz/doc': async () => DOC, 'GET /api/x/mapviz/layer': async () => SPW };
    const part = { id: 'w2', init(V) { V.addLayer({ id: 'spawns', group: 'game', label: 'Spawns', engineTrue: true }); V.on('map', d => maps.push(d)); } };
    const S = { gameId: 'mowas2', gameOv: '', mod: '', mapKey: 'map/multi/mv_fixture' };
    const P = mkPage({ scripts: [CLIENT], lang: L, S, canvas: true, api: routeApi(routes, calls), parts: [part] });
    P.screen.refresh(); await until(() => P.V.doc && blk(P.root, 'mv.items').has('a1'), 5000);
    const inp = P.root.all().find(e => e.tagName === 'INPUT' && e.attrs['aria-label'] === L.en['mapviz.shell.link']);
    P.root.all().find(e => e.tagName === 'CANVAS').fire('keydown', { key: 'ArrowRight' });
    ok(P.V.q('map') === 'multi/mv_fixture' && P.V.q('mode') === 'combat' && !!inp.value && P.V.q('cursor'), 'W2 setup: the MoW:AS2 map is open with a mode, a cursor and a link');
    S.gameId = 'as64'; maps.length = 0; const n0 = calls.length;
    P.screen.refresh(); await flush();
    ok(P.V.q('map') == null && P.V.q('mode') == null && P.V.doc == null && P.V.q('cursor') == null && P.V.q('target') === 'as64', 'W2: a game switch closes the open map (map, mode, document, cursor)', [P.V.q('map'), P.V.q('mode'), P.V.q('target')]);
    ok(!inp.value && blk(P.root, 'mv.map').has(L.en['mapviz.shell.chooseMap']) && !blk(P.root, 'mv.items').has('a1'), 'W2: the map line, the permalink and the item lists are emptied', [inp.value, blk(P.root, 'mv.items').textContent]);
    ok(maps.length >= 1 && maps[maps.length - 1].key == null, 'W2: the parts get the map event with key null', maps);
    ok(blk(P.root, 'mv.say').has(L.en['mapviz.shell.closed']), 'W2: the page says the map was closed', blk(P.root, 'mv.say').textContent);
    ok(!calls.slice(n0).some(c => c.path === '/api/x/mapviz/doc'), 'W2: the S.mapKey the old game left is not opened in the new game', calls.slice(n0).map(c => c.path));
    const modeSel = blk(P.root, 'mv.mode').all().find(e => e.tagName === 'SELECT');
    ok(modeSel && modeSel.children.length === 1, 'W2: the mode list is emptied', modeSel && modeSel.children.length);
    // the user picks a map of the new game: it opens and S.mapKey follows it
    P.V.emit('map', { key: 'single/one', pick: true }); await flush();
    ok(P.V.q('map') === 'single/one' && S.mapKey === 'map/single/one' && P.V.q('target') === 'as64', 'W2: a map picked in the new game opens', [P.V.q('map'), S.mapKey]);
    ok(maps.some(d => d.key === 'single/one' && d.user === true), 'W2/W6: the map event of a pick carries user: true', maps.map(d => [d.key, d.user]));
    // a mod change in the same game closes it too; a folder change likewise
    S.mod = 'some_mod'; P.screen.refresh(); await flush();
    ok(P.V.q('map') == null && P.V.q('target') === 'as64', 'W2: a mod change closes the open map', P.V.q('map'));
    P.V.emit('map', { key: 'single/one', pick: true }); await flush(); S.gameOv = '<other game folder>'; P.screen.refresh(); await flush();
    ok(P.V.q('map') == null, 'W2: a game folder change closes the open map', P.V.q('map'));
    // a refresh with nothing changed keeps the map (and a remembered map opens with user false)
    P.screen.refresh(); await flush();
    ok(P.V.q('map') == null && S.mapKey === 'map/single/one', 'W2: the S.mapKey left when the folder changed is still not followed on the next refresh');
    // another page names a new map of this game (S.mapKey written again): that one is followed
    S.mapKey = 'map/single/two'; P.screen.refresh(); await flush();
    ok(P.V.q('map') === 'single/two', 'W2: a new S.mapKey of the current game is followed', P.V.q('map'));
    P.screen.refresh(); await flush();
    ok(P.V.q('map') === 'single/two', 'W2: a refresh with no change keeps the open map');
    const P5 = mkPage({ scripts: [CLIENT], lang: L, S: { gameId: 'mowas2', gameOv: '', mod: '', mapKey: 'map/multi/mv_fixture' }, canvas: true, api: routeApi(routes, []), parts: [{ id: 'u', init(V) { V.on('map', d => maps.push(Object.assign({ p5: 1 }, d))); } }] });
    maps.length = 0; P5.screen.refresh(); await until(() => P5.V.doc, 5000);
    ok(maps.filter(d => d.p5 && d.key).every(d => d.user === false), 'W6: a map opened from S.mapKey on refresh carries user: false', maps);
    // W4 layout: side columns, stage, the item fold in the left column, the page style once per document
    const main = blk(P.root, 'mv.main');
    ok(/\bmvmain\b/.test(main.className) && /\bmvleft\b/.test(blk(P.root, 'mv.left').className) && /\bmvstage\b/.test(blk(P.root, 'mv.viewbox').className) && /\bmvright\b/.test(blk(P.root, 'mv.right').className), 'W4: the main row has its left column, stage and right column classes');
    const items = blk(P.root, 'mv.items');
    ok(items && items.tagName === 'DETAILS' && items.parentNode === blk(P.root, 'mv.left') && items.children[0].tagName === 'SUMMARY', 'W4: the item lists are a fold in the left column, not under the stage', items && items.parentNode && items.parentNode.attrs['data-blk']);
    ok(!blk(P.root, 'mv.viewbox').all().some(e => e.attrs['data-blk'] === 'mv.items'), 'W4: the stage holds no item list');
    const styles = P.doc.body.all().filter(e => e.tagName === 'STYLE' && e.attrs['data-mapviz']);
    const css = styles.map(e => e.textContent).join('\n');
    ok(styles.length === 1 && /body:not\(\.arranging\) \.mvmain/.test(css) && /max-width:900px/.test(css) && /100vh/.test(css) && /min-height:320px/.test(css), 'W4: one page style, off while arranging, a narrow rule and the window height', styles.length);
    ok(!/#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/.test(css), 'W4: the page style holds no colour literal');
  }
  // 2d2 waves C and D (page-pg2 S1 to S12, page-pg3 N1 to N9): phases, source and query functions, the why hint, the
  // phase on PHQ routes only, job fields, V.go, screen.pick and go, V.q('tool'), hits that carry their part
  { eq(T.phasesOf({ modes: [{ id: 'c', spawns: [{ phase: 1 }, { phase: 0 }, { phase: 1.5 }], flags: [{ phase: 2 }], points: [{}], clipsBySide: [{ phase: 2 }] }, { id: 'f', spawns: [{ phase: 7 }] }] }, 'c'), [0, 1, 2], 'phasesOf: whole phases of one mode from spawns, flags, points and clips, sorted, once each');
    eq([T.phasesOf(null, 'c'), T.phasesOf({ modes: [{ id: 'f', spawns: [{ phase: 7 }] }] }, 'c')], [[], []], 'phasesOf: no document or another mode, no phase');
    const hh = [{ x: 1 }, { part: 'own', x: 2 }]; T.tagHit(hh, { id: 'L', part: 'P' }); eq(hh, [{ x: 1, part: 'P', layer: 'L' }, { part: 'own', x: 2, layer: 'L' }], 'tagHit: a hit carries the part and layer, a value the part set is kept');
    ok(['card', 'strong', 'checks', 'json'].every(k => T.QCOM[k]) && ['layer', 'strong', 'checks', 'json'].every(k => T.PHQ[k]) && !T.PHQ.card && !T.PHQ.hover && !T.PHQ.tiles, 'QCOM has card, strong, checks, json; the phase goes to layer, strong, checks, json only');
    ok(['phase', 'at', 'pose', 'light'].every(k => T.JOBF[k] && T.KEYF.includes(k)), 'job args and key fields take phase, at, pose, light');
    const DOC = { v: 1, key: 'multi/mv_fixture', modes: [{ id: 'combat', spawns: [{ name: 'a1', team: 'a', order: 1, x: 0, y: 0, phase: 0 }, { name: 'a2', team: 'a', order: 2, x: 0, y: 0, phase: 1 }] }, { id: 'frontline' }], boxes: { world: [-600, -440, 600, 440] }, entities: [] };
    const calls = [], maps = [], curs = [];
    const routes = { 'GET /api/x/mapviz/palette': async () => PAL, 'GET /api/x/mapviz/cache': async () => ({ v: 1, root: '<cache>', bytes: 0, cap: 1, entries: 0, jobs: 0 }),
      'GET /api/x/mapviz/doc': async () => DOC, 'GET /api/x/mapviz/layer': async (u) => ({ v: 1, kind: 'vector', name: u.searchParams.get('name'), items: [{ x: 5, y: 5 }] }),
      'GET /api/x/mapviz/card': async () => ({ v: 1 }), 'GET /api/x/mapviz/strong': async () => ({ v: 1 }), 'POST /api/x/mapviz/job': async () => ({ id: 'jj', shared: false, state: 'queued', queue: 0 }),
      'GET /api/x/mapviz/job': async () => ({ id: 'jj', state: 'running', stage: 'grid', done: 0, total: 1 }) };
    const part = { id: 'cd', init(V) {
      V.addLayer({ id: 'thr', group: 'strong', defaultOn: true, label: 'Threat', source: q => (q('phase') == null ? null : 'strong.a.' + q('kind') + '.threat'), query: q => ({ at: '1,2' }), why: q => 'mapviz.shell.phaseLabel', hit: () => ({ label: 'Here', value: 'it' }) });
      V.on('map', d => maps.push(d)); V.on('cursor', d => curs.push(d)); } };
    const P = mkPage({ scripts: [CLIENT], lang: L, S: { gameId: 'mowas2', gameOv: '', mod: '', mapKey: 'map/multi/mv_fixture' }, canvas: true, api: routeApi(routes, calls), parts: [part] });
    P.screen.refresh(); await until(() => P.V.doc, 5000); await flush();
    const pf = blk(P.root, 'mv.phase');
    ok(pf && !pf.hidden && JSON.stringify(P.V.q('phases')) === '[0,1]' && P.V.q('phase') == null, 'phase select: shown for a mode with 2 phases, no phase picked at first', [pf && pf.hidden, P.V.q('phases')]);
    ok(pf && pf.attrs['data-blkname'] === L.en['mapviz.shell.phaseLabel'] && pf.all().filter(e => e.tagName === 'OPTION').map(e => e.textContent).join('|') === [L.en['mapviz.shell.phaseFirst'], 'Phase 0', 'Phase 1'].join('|'), 'phase select: First phase, then Phase n');
    const lay = calls.filter(c => c.path === '/api/x/mapviz/layer');
    ok(!lay.some(c => /strong\.a\./.test(c.url)), 'S1: a source function that gives no name fetches nothing', lay.map(c => c.url));
    const sel = pf.all().find(e => e.tagName === 'SELECT'); sel.value = '1'; sel.fire('change'); await flush();
    ok(P.V.q('phase') === 1 && maps.some(d => d.phase === 1), 'phase select: a pick sets V.q(phase) and the map event carries it', maps.map(d => d.phase));
    ok(calls.some(c => c.path === '/api/x/mapviz/layer' && /name=strong.a.inf.threat/.test(c.url) && /at=1%2C2|at=1,2/.test(c.url) && /phase=1/.test(c.url)), 'S1: once the source function names a layer it is fetched with its query fields and the phase', calls.filter(c => c.path === '/api/x/mapviz/layer').map(c => c.url));
    const n0 = calls.length; await P.V.api('GET', 'card', { x: 1 }).catch(() => {}); await P.V.api('GET', 'strong', {}).catch(() => {});
    const cc = calls.slice(n0); ok(cc.length === 2 && !/phase=/.test(cc[0].url) && /target=mowas2/.test(cc[0].url) && /phase=1/.test(cc[1].url), 'the phase goes to GET strong, not to GET card; both carry the page fields', cc.map(c => c.url));
    const n1 = calls.length; P.V.job('view', { at: '3,4', pose: 'prone' }).catch(() => {}); await flush();
    const jb = calls.slice(n1).find(c => c.path === '/api/x/mapviz/job' && c.method === 'POST');
    ok(jb && jb.body.phase === 1 && jb.body.at === '3,4' && jb.body.pose === 'prone' && jb.body.mode === 'combat', 'V.job carries the phase and the at, pose fields', jb && jb.body);
    const jl = P.V.q('jobs'); ok(Array.isArray(jl) && jl.some(j => j.args && j.args.phase === 1 && j.args.at === '3,4'), 'the job key args hold phase and at', jl);
    let refused = null; await P.V.job('view', { colour: 'red' }).catch(e => { refused = e.message; }); ok(refused === 'MV_USAGE', 'V.job refuses a field it does not know');
    ok(P.V.q('tool') === null, "V.q('tool') is null with no tool picked");
    curs.length = 0; ok(P.V.go({ x: 100, y: -50 }) === true && JSON.stringify(P.V.q('cursor')) === '[100,-50]' && curs.length === 1 && curs[0].x === 100 && !curs[0].click, 'V.go sets the cursor and tells the parts (no click)', curs);
    const z0 = P.V.view.zoom; P.V.go({ x: 0, y: 0, box: [-1, -1, 1, 1] }); ok(P.V.view.zoom <= z0 * 4 + 1e-9 && P.V.view.zoom > z0, 'V.go with a small box zooms in, never past 4 times', [z0, P.V.view.zoom]);
    ok(P.V.go({ x: 'a', y: 1 }) === false && P.screen.go({ x: NaN, y: 0 }) === false, 'V.go and screen.go refuse a bad point');
    P.screen.pick('multi/mv_fixture', 'frontline'); await flush();
    ok(P.V.q('mode') === 'frontline' && P.V.q('phase') == null && pf.hidden, 'screen.pick opens a map and mode; a mode with no phases hides the select and resets the phase', [P.V.q('mode'), P.V.q('phase'), pf.hidden]);
    // the hit of a layer of this part carries the part id; the layer whose source names nothing shows the why hint
    const hl = { id: 'pt', group: 'game', label: 'Pt', source: 'spawns', hit: () => ({ label: 'x', value: 1 }) };
    const P2 = mkPage({ scripts: [CLIENT], lang: L, S: { gameId: 'mowas2', gameOv: '', mod: '', mapKey: 'map/multi/mv_fixture' }, canvas: true, api: routeApi(routes, []), parts: [{ id: 'mine', init(V) { V.addLayer(hl); V.addLayer({ id: 'nos', group: 'game', label: 'Nos', source: () => null, why: () => 'mapviz.shell.noSource', defaultOn: true }); V.on('cursor', d => curs.push(d)); } }] });
    P2.screen.refresh(); await until(() => P2.V.doc, 5000); await flush();
    curs.length = 0; const cv = P2.root.all().find(e => e.tagName === 'CANVAS'); cv.fire('mousedown', { clientX: 400, clientY: 300 }); cv.fire('mouseup', { clientX: 400, clientY: 300 }); await flush();
    const ck = curs.find(d => d.click); ok(ck && ck.hit && ck.hit.part === 'mine' && ck.hit.layer === 'pt', 'a click hit carries its part and layer', ck && ck.hit);
    ok(P2.root.textContent.indexOf(L.en['mapviz.shell.noSource']) >= 0 || P2.root.all().some(e => (e.attrs.title || '') === L.en['mapviz.shell.noSource']), 'S1: a layer on whose source names nothing shows the why hint');
  }
  // 2e W1 and W3: a layer row not made, a job of its what runs: the row shows that job's words and no Make button (a
  // second Make would only join it); the job ends done: the row asks once again, by itself, and shows the layer
  { const calls = [];
    let made = false, polls = 0, layerAsks = 0;
    const WG = Buffer.from([1, 2, 2, 1]).toString('base64');
    const routes = { 'GET /api/x/mapviz/palette': async () => PAL, 'GET /api/x/mapviz/cache': async () => ({ v: 1, root: '<cache>', bytes: 0, cap: 1, entries: 0, jobs: 0 }),
      'GET /api/x/mapviz/doc': async () => ({ v: 1, key: 'multi/mv_fixture', modes: [{ id: 'combat' }], boxes: { world: [-600, -440, 600, 440] }, entities: [] }),
      'GET /api/x/mapviz/layer': async u => { const n = u.searchParams.get('name'); if (n !== 'water.band') throw new Error('x'); layerAsks++;
        if (!made) throw Object.assign(new Error('MV_NOT_FOUND'), { status: 404, key: 'mapviz.err.MV_NOT_FOUND', params: { msg: 'x', need: { what: 'water', args: { map: 'multi/mv_fixture', mode: 'combat' } } } });
        return { v: 1, kind: 'grid', name: n, w: 2, h: 2, cell: 10, ox: -10, oy: -10, etype: 'u8', sample: 'cell', scale: 1, offset: 0, nodata: null, meta: {}, data: WG, pal: 'water.bands', palette: PAL.water.bands }; },
      'POST /api/x/mapviz/job': async () => ({ id: 'jw', shared: false, state: 'queued', queue: 0 }),
      'GET /api/x/mapviz/job': async () => { polls++; if (polls < 4) return { id: 'jw', what: 'water', state: 'running', stage: 'tiles', done: polls, total: 4, queue: 0 }; made = true; return { id: 'jw', what: 'water', state: 'done', stage: '', done: 4, total: 4, queue: 0 }; } };
    const seen = { job: [], products: 0 };
    const part = { id: 'w1', init(V) { V.addLayer({ id: 'water.band', group: 'water', label: 'Water bands' }); V.on('job', d => seen.job.push(d)); V.on('products', () => seen.products++); } };
    const S = { gameId: 'mowas2', gameOv: '', mod: '', mapKey: 'map/multi/mv_fixture' };
    const P = mkPage({ scripts: [CLIENT], lang: L, S, canvas: true, api: routeApi(routes, calls), parts: [part] });
    P.screen.refresh(); await until(() => blk(P.root, 'mv.l.water.band') && blk(P.root, 'mv.l.water.band').has(L.en['mapviz.shell.notMade']), 5000);
    const row = () => blk(P.root, 'mv.l.water.band'), btn = () => row().all().find(e => e.tagName === 'BUTTON' && !/\bmvq\b/.test(e.className || ''));
    ok(row().has(L.en['mapviz.shell.notMade']) && btn() && btn().textContent === L.en['mapviz.shell.make'], 'W1 setup: the row is not made, with Make it');
    const asks0 = layerAsks;
    // another part (or the user elsewhere) starts the water job: the row shows its running words, no button
    const pj = P.V.job('water', {});
    await until(() => seen.job.some(d => d.state === 'running'), 5000);
    const runWords = L.en['mapviz.shell.jobRun'].replace('{what}', L.en['mapviz.shell.what.water']).replace('{stage}', L.en['mapviz.shell.stage.tiles']);
    ok(!btn() && row().has(runWords.split('{done}')[0]), 'W3: while the job of its what runs the row shows the job words and no Make it', row().textContent);
    ok(P.V.q('jobs').length === 1 && P.V.q('jobs')[0].what === 'water' && P.V.q('jobs')[0].target === 'mowas2' && P.V.q('jobs')[0].map === 'multi/mv_fixture' && typeof P.V.q('jobs')[0].text === 'string', 'V.q jobs gives the running page jobs with what, target, map and words', P.V.q('jobs'));
    const mid = seen.job.filter(d => d.state === 'running').map(d => d.done);
    await pj; await until(() => layerAsks > asks0 && !row().has(L.en['mapviz.shell.notMade']), 5000); await flush();
    ok(mid.length >= 1 && seen.job.some(d => d.end && d.state === 'done'), 'the job event: progress while running and one end', seen.job.map(d => d.state + (d.end ? '!' : '')));
    ok(layerAsks === asks0 + 1, 'W1: after the job ended the row asked again exactly once (' + (layerAsks - asks0) + ')');
    ok(!row().has(L.en['mapviz.shell.notMade']) && !btn() && seen.products === 1, 'W1: the row is made now; the parts were told once (products)', [row().textContent, seen.products]);
    ok(P.V.q('jobs').length === 0, 'the ended job left V.q jobs');
    // no request storm: redraws and a refresh do not ask again; a second job end with nothing not made asks nothing
    const a1 = layerAsks; P.V.redraw(); P.screen.refresh(); await flush();
    ok(layerAsks === a1, 'W1: no further ask on redraw or refresh', layerAsks - a1);
    // the cache answer changes (a job from outside the page): rows not made ask again once
    made = false; P.V.emit('map', { key: 'multi/mv_fixture', mode: 'combat', pick: true }); await flush();
    const P2 = P; P2.V.redraw(); await until(() => row().has(L.en['mapviz.shell.notMade']), 5000);
    const a2 = layerAsks; made = true; routes['GET /api/x/mapviz/cache'] = async () => ({ v: 1, root: '<cache>', bytes: 99, cap: 1, entries: 1, jobs: 0 });
    P.screen.refresh(); await until(() => !row().has(L.en['mapviz.shell.notMade']), 5000);
    ok(layerAsks === a2 + 1 && !row().has(L.en['mapviz.shell.notMade']), 'W1: a changed cache answer makes a row not made ask again once', layerAsks - a2);
    const a3 = layerAsks; P.screen.refresh(); await flush();
    ok(layerAsks === a3, 'W1: the same cache answer again asks nothing');
  }
  // 2f P1: the page hidden, the game folder changes (a hidden refresh), a page job ends: no request but the job's own
  // polls; shown again: the map is closed and the map list of the new context is asked for
  const LIST = require('./list.client'), LL = mergeLang([LANG, require('./list.lang.json')]);
  { const calls = [];
    let endNow = false;
    const DOC = { v: 1, key: 'multi/mv_fixture', modes: [{ id: 'combat' }], boxes: { world: [-600, -440, 600, 440] }, entities: [] };
    const routes = { 'GET /api/x/mapviz/palette': async () => PAL, 'GET /api/x/mapviz/cache': async () => ({ v: 1, root: '<cache>', bytes: 0, cap: 1, entries: 0, jobs: 0 }),
      'GET /api/x/mapviz/maps': async () => ({ v: 1, maps: [{ key: 'multi/mv_fixture', modes: ['combat'] }] }),
      'GET /api/x/mapviz/doc': async () => DOC,
      'GET /api/x/mapviz/layer': async () => { throw Object.assign(new Error('MV_NOT_FOUND'), { status: 404, key: 'mapviz.err.MV_NOT_FOUND', params: { msg: 'x', need: { what: 'water', args: { map: 'multi/mv_fixture', mode: 'combat' } } } }); },
      'POST /api/x/mapviz/job': async () => ({ id: 'jh', shared: false, state: 'queued', queue: 0 }),
      'GET /api/x/mapviz/job': async () => (endNow ? { id: 'jh', what: 'water', state: 'done', stage: '', done: 4, total: 4, queue: 0 } : { id: 'jh', what: 'water', state: 'running', stage: 'tiles', done: 1, total: 4, queue: 0 }) };
    const seen = { products: 0, ends: 0, late: [] };
    const part = { id: 'p1', init(V) { V.addLayer({ id: 'water.band', group: 'water', label: 'Water bands' }); V.on('products', () => seen.products++);
      V.on('job', d => { if (d.end) { seen.ends++; V.api('GET', 'layer', { name: 'water.band' }).then(() => seen.late.push('ok'), e => seen.late.push(e && e.stale ? 'stale' : 'err')); } }); } };
    const S = { gameId: 'mowas2', gameOv: '<folder one>', mod: '', mapKey: 'map/multi/mv_fixture', cur: 'mapviz', sec: {} };
    const P = mkPage({ scripts: [CLIENT, LIST], lang: LL, S, canvas: true, api: routeApi(routes, calls), parts: [part] });
    S.sec.mapviz = P.root;
    P.screen.refresh(); await until(() => P.V.doc && calls.some(c => c.path === '/api/x/mapviz/layer'), 5000); await flush();
    ok(P.V.q('map') === 'multi/mv_fixture' && calls.some(c => c.path === '/api/x/mapviz/maps'), 'P1 setup: shown, the map is open and the map list read');
    const pj = P.V.job('water', {}); await until(() => P.V.q('jobs').length === 1, 5000);
    S.cur = 'mods'; S.gameOv = '<folder two>';
    const n0 = calls.length;
    P.screen.refresh(); await flush();
    ok(P.V.q('map') == null, 'P1: a refresh while hidden takes in the folder change: the open map is closed', P.V.q('map'));
    endNow = true; await pj.catch(() => {}); await flush(); await until(() => seen.ends >= 1); await new Promise(r => setTimeout(r, 30)); await flush();   // 30 ms: room for a request that must not come
    const after = calls.slice(n0).filter(c => c.path !== '/api/x/mapviz/job');
    ok(seen.ends === 1 && after.length === 0, 'P1: hidden, folder changed, the job ended: 0 requests but its polls (' + after.length + ')', after.map(c => c.method + ' ' + c.url));
    ok(seen.products === 0 && seen.late.length === 0, 'P1: no products event and the part read is held while hidden', [seen.products, seen.late]);
    const n1 = calls.length;
    S.cur = 'mapviz'; P.screen.refresh(); await until(() => calls.slice(n1).some(c => c.path === '/api/x/mapviz/maps'), 5000); await flush();
    const shown = calls.slice(n1), mq = shown.filter(c => c.path === '/api/x/mapviz/maps').map(c => new URL(c.url, 'http://x').searchParams.get('game'));
    ok(P.V.q('map') == null && mq.length === 1 && mq[0] === '<folder two>', 'P1: shown again: the map stays closed and the map list of the new folder is asked for once', mq);
    ok(!shown.some(c => c.path === '/api/x/mapviz/doc' || (c.path === '/api/x/mapviz/layer' && /mv_fixture/.test(c.url))), 'P1: shown again: nothing of the old map is read', shown.map(c => c.url));
    ok(seen.products === 1, 'P1: the job that ended while hidden is told once on the show (products)', seen.products);
    // no refresh: hidden, the folder changes, a part read is held; the show refresh closes the map, the held read is dropped
    P.V.emit('map', { key: 'multi/mv_fixture', pick: true }); await until(() => P.V.doc, 5000); await flush();
    S.cur = 'mods'; S.gameOv = '<folder three>'; seen.late.length = 0;
    const n2 = calls.length; let got = null;
    P.V.api('GET', 'layer', { name: 'water.band' }).then(() => { got = 'ok'; }, e => { got = e && e.stale ? 'stale' : 'err'; });
    P.V.redraw(); await flush();
    ok(calls.length === n2 && got === null, 'P1: hidden, the folder changed and no refresh yet: a part read waits, nothing drawn or asked', calls.slice(n2).map(c => c.url));
    S.cur = 'mapviz'; P.screen.refresh(); await flush();
    ok(got === 'stale' && P.V.q('map') == null, 'P1: on the show the map is closed and the held read is dropped as stale', [got, P.V.q('map')]);
    ok(!calls.slice(n2).some(c => c.path === '/api/x/mapviz/layer' || c.path === '/api/x/mapviz/doc'), 'P1: the dropped read never reached the server');
    // planted: a read held while merely hidden (same context, same map) goes on the show
    P.V.emit('map', { key: 'multi/mv_fixture', pick: true }); await until(() => P.V.doc, 5000); await flush();
    S.cur = 'mods'; got = null; const n3 = calls.length;
    P.V.api('GET', 'cache').then(() => { got = 'ok'; }, () => { got = 'err'; }); await flush();
    ok(got === null && calls.length === n3, 'planted: hidden with no change: the read waits');
    S.cur = 'mapviz'; P.screen.refresh(); await until(() => got !== null, 5000);
    ok(got === 'ok', 'planted: shown with the same context: the held read goes', got);
  }
  // 2g P2: the runner joins a second request to the running job (same id): one poll chain, one end event
  { const calls = [];
    let polls = 0, posts = 0;
    const routes = { 'GET /api/x/mapviz/palette': async () => PAL, 'GET /api/x/mapviz/cache': async () => ({ v: 1, root: '<cache>', bytes: 0, cap: 1, entries: 0, jobs: 0 }),
      'POST /api/x/mapviz/job': async () => { posts++; return { id: 'js', shared: posts > 1, state: 'running', queue: 0 }; },
      'GET /api/x/mapviz/job': async () => { polls++; return polls < 4 ? { id: 'js', what: 'grids', state: 'running', stage: 'build', done: polls, total: 4, queue: 0 } : { id: 'js', what: 'grids', state: 'done', stage: '', done: 4, total: 4, queue: 0 }; } };
    const ev = [];
    const P = mkPage({ scripts: [CLIENT], lang: L, S: { gameId: 'mowas2', gameOv: '', mod: '', mapKey: '' }, canvas: false, api: routeApi(routes, calls), parts: [{ id: 'p2', init(V) { V.on('job', d => ev.push(d)); } }] });
    P.screen.refresh(); await flush();
    const a = P.V.job('grids', {}), b = P.V.job('grids', {});
    const ra = await a, rb = await b; await until(() => ev.some(d => d.end)); await new Promise(r => setTimeout(r, 30)); await flush();   // 30 ms: room for a poll or end event that must not come
    ok(posts === 2 && ra && rb && ra.state === 'done' && rb.state === 'done', 'P2: both requests resolve with the one job', [posts, ra, rb]);
    ok(polls === 4, 'P2: one poll chain for the joined id (' + polls + ' polls)');
    ok(ev.filter(d => d.end).length === 1 && ev.filter(d => d.end)[0].state === 'done', 'P2: exactly one end event', ev.map(d => d.state + (d.end ? '!' : '')));
    const n = ev.length; P.V.redraw(); await flush(); ok(ev.length === n && P.V.q('jobs').length === 0, 'P2: nothing written or told for the ended id afterwards');
  }
  // 2h P4 (shell rows): a pass job of kind inf does not make the pass layer of kind tank: the row keeps its Make button
  { const calls = [];
    let polls = 0;
    const routes = { 'GET /api/x/mapviz/palette': async () => PAL, 'GET /api/x/mapviz/cache': async () => ({ v: 1, root: '<cache>', bytes: 0, cap: 1, entries: 0, jobs: 0 }),
      'GET /api/x/mapviz/doc': async () => ({ v: 1, key: 'multi/mv_fixture', modes: [{ id: 'combat' }], boxes: { world: [-600, -440, 600, 440] }, entities: [] }),
      'GET /api/x/mapviz/layer': async () => { throw Object.assign(new Error('MV_NOT_FOUND'), { status: 404, key: 'mapviz.err.MV_NOT_FOUND', params: { msg: 'x', need: { what: 'pass', args: { map: 'multi/mv_fixture', mode: 'combat', kind: 'tank' } } } }); },
      'POST /api/x/mapviz/job': async (u, b) => ({ id: 'jp' + b.kind, shared: false, state: 'running', queue: 0 }),
      'GET /api/x/mapviz/job': async u => { polls++; return { id: u.searchParams.get('id'), what: 'pass', state: 'running', stage: 'build', done: 1, total: 4, queue: 0 }; } };
    const P = mkPage({ scripts: [CLIENT], lang: L, S: { gameId: 'mowas2', gameOv: '', mod: '', mapKey: 'map/multi/mv_fixture' }, canvas: true, api: routeApi(routes, calls), parts: [{ id: 'p4', init(V) { V.addLayer({ id: 'pass.tank', group: 'water', label: 'Tank pass' }); } }] });
    P.screen.refresh(); await until(() => blk(P.root, 'mv.l.pass.tank') && blk(P.root, 'mv.l.pass.tank').has(L.en['mapviz.shell.notMade']), 5000);
    const row = () => blk(P.root, 'mv.l.pass.tank'), btn = () => row().all().find(e => e.tagName === 'BUTTON' && e.textContent === L.en['mapviz.shell.make']);
    P.V.job('pass', { kind: 'inf' }).catch(() => {}); await until(() => P.V.q('jobs').length === 1, 5000); await flush();
    ok(!!btn() && P.V.q('jobs')[0].args.kind === 'inf' && P.V.q('jobs')[0].args.mode === 'combat', 'P4: a pass job of kind inf runs: the kind tank row keeps Make it; V.q jobs carries the args', [row().textContent, P.V.q('jobs')]);
    P.V.job('pass', { kind: 'tank' }).catch(() => {}); await until(() => P.V.q('jobs').length === 2, 5000); await flush();
    ok(!btn(), 'planted: a pass job of kind tank runs: the row shows its words, no Make it', row().textContent);
  }
  // 2i P7: a map picked whose document is not made (a doc job runs): no layer is fetched before the document is there,
  // and every layer fetch carries the mode the document gave
  { const calls = [];
    let docMade = false, polls = 0, layerBefore = 0;
    const routes = { 'GET /api/x/mapviz/palette': async () => PAL, 'GET /api/x/mapviz/cache': async () => ({ v: 1, root: '<cache>', bytes: 0, cap: 1, entries: 0, jobs: 0 }),
      'GET /api/x/mapviz/doc': async () => { if (!docMade) throw Object.assign(new Error('MV_NOT_FOUND'), { status: 404, key: 'mapviz.err.MV_NOT_FOUND', params: { msg: 'x', need: { what: 'doc', args: { map: 'multi/mv_fixture' } } } });
        return { v: 1, key: 'multi/mv_fixture', modes: [{ id: 'combat' }, { id: 'other' }], boxes: { world: [-600, -440, 600, 440] }, entities: [] }; },
      'GET /api/x/mapviz/layer': async () => { if (!docMade) layerBefore++; return { v: 1, kind: 'vector', name: 'spawns', items: [], pal: 'sides', palette: PAL.sides }; },
      'POST /api/x/mapviz/job': async () => ({ id: 'jd', shared: false, state: 'running', queue: 0 }),
      'GET /api/x/mapviz/job': async () => { polls++; if (polls < 4) return { id: 'jd', what: 'doc', state: 'running', stage: 'read', done: polls, total: 4, queue: 0 }; docMade = true; return { id: 'jd', what: 'doc', state: 'done', stage: '', done: 4, total: 4, queue: 0 }; } };
    const P = mkPage({ scripts: [CLIENT], lang: L, S: { gameId: 'mowas2', gameOv: '', mod: '', mapKey: '' }, canvas: true, api: routeApi(routes, calls), parts: [{ id: 'p7', init(V) { V.addLayer({ id: 'spawns', group: 'game', label: 'Spawns' }); } }] });
    P.screen.refresh(); await flush();
    P.V.emit('map', { key: 'multi/mv_fixture', pick: true });
    await until(() => P.V.doc && calls.some(c => c.path === '/api/x/mapviz/layer'), 5000); await flush();
    const lq = calls.filter(c => c.path === '/api/x/mapviz/layer').map(c => new URL(c.url, 'http://x').searchParams.get('mode'));
    ok(layerBefore === 0 && polls >= 4, 'P7: no layer fetch while the document is read (its job runs)', [layerBefore, polls]);
    // (the harness draws at once on every redraw, so the fit and the map change may each fetch; a browser frame joins them)
    ok(lq.length >= 1 && lq.every(m => m === 'combat'), 'P7: every layer fetch carries the mode of the document', lq);
    // planted: the doc read fails: the layers are still fetched (with no mode), not left waiting
    const c2 = [], r2 = Object.assign({}, routes, { 'GET /api/x/mapviz/doc': async () => { throw Object.assign(new Error('MV_FAULT'), { status: 500, key: 'mapviz.err.MV_FAULT', params: { msg: 'broken' } }); } });
    const P2 = mkPage({ scripts: [CLIENT], lang: L, S: { gameId: 'mowas2', gameOv: '', mod: '', mapKey: 'map/multi/mv_fixture' }, canvas: true, api: routeApi(r2, c2), parts: [{ id: 'p7b', init(V) { V.addLayer({ id: 'spawns', group: 'game', label: 'Spawns' }); } }] });
    P2.screen.refresh(); await until(() => c2.some(c => c.path === '/api/x/mapviz/layer'), 5000);
    ok(c2.some(c => c.path === '/api/x/mapviz/layer'), 'planted: a failed document read lets the layers fetch');
  }
  // 2i2 (integration, view fixer finding 1): the Editor and the Maps page open a map as S.mapKey, show, pick. The show's
  // refresh reads the document with user false; the pick of the same key while that read runs is the user's pick: on an
  // unmade map it starts the doc job. A second user pick while busy reads nothing more. Same on as64, mowas2 and goh.
  for (const game of ['as64', 'mowas2', 'goh']) {
    const calls = [], gate = [];
    let docMade = false, polls = 0;
    const need = () => Object.assign(new Error('MV_NOT_FOUND'), { status: 404, key: 'mapviz.err.MV_NOT_FOUND', params: { msg: 'x', need: { what: 'doc', args: { map: 'multi/mv_fixture' } } } });
    const routes = { 'GET /api/x/mapviz/palette': async () => PAL, 'GET /api/x/mapviz/cache': async () => ({ v: 1, root: '<cache>', bytes: 0, cap: 1, entries: 0, jobs: 0 }),
      'GET /api/x/mapviz/doc': () => new Promise((res, rej) => gate.push(() => (docMade ? res({ v: 1, key: 'multi/mv_fixture', modes: [{ id: 'combat' }], boxes: { world: [-600, -440, 600, 440] }, entities: [] }) : rej(need())))),
      'GET /api/x/mapviz/layer': async () => ({ v: 1, kind: 'vector', name: 'spawns', items: [], pal: 'sides', palette: PAL.sides }),
      'POST /api/x/mapviz/job': async () => ({ id: 'jd', shared: false, state: 'running', queue: 0 }),
      'GET /api/x/mapviz/job': async () => { polls++; if (polls < 2) return { id: 'jd', what: 'doc', state: 'running', stage: 'read', done: 1, total: 2, queue: 0 }; docMade = true; return { id: 'jd', what: 'doc', state: 'done', stage: '', done: 2, total: 2, queue: 0 }; } };
    const P = mkPage({ scripts: [CLIENT], lang: L, S: { gameId: game, gameOv: '', mod: '', mapKey: 'map/multi/mv_fixture' }, canvas: true, api: routeApi(routes, calls), parts: [] });
    P.screen.refresh(); await until(() => gate.length >= 1, 5000);
    ok(P.V.q('docBusy') === true && P.V.q('map') === 'multi/mv_fixture', 'S6 ' + game + ' setup: the show reads the S.mapKey map (user false), busy');
    P.screen.pick('multi/mv_fixture'); await flush();
    P.screen.pick('multi/mv_fixture'); await flush();
    const docs = () => calls.filter(c => c.path === '/api/x/mapviz/doc').length;
    ok(docs() === 2, 'S6 ' + game + ': the user pick of the map being read reads it again once; a second user pick reads nothing more (' + docs() + ' doc reads)');
    while (gate.length) gate.shift()(); await until(() => calls.some(c => c.path === '/api/x/mapviz/job' && c.method === 'POST'), 5000);
    await until(() => gate.length >= 1, 5000); while (gate.length) gate.shift()(); await until(() => P.V.doc, 5000); await flush();
    const posts = calls.filter(c => c.path === '/api/x/mapviz/job' && c.method === 'POST');
    ok(posts.length === 1 && posts[0].body.what === 'doc' && posts[0].body.target === game && !!P.V.doc, 'S6 ' + game + ': the pick starts one doc job and the document lands', posts.map(c => c.body));
    // planted: with no user pick the S.mapKey read of an unmade map starts no job (the shell asks with a Read button)
    const c2 = [], g2 = [];
    const r2 = Object.assign({}, routes, { 'GET /api/x/mapviz/doc': () => new Promise((res, rej) => g2.push(() => rej(need()))) });
    const P2 = mkPage({ scripts: [CLIENT], lang: L, S: { gameId: game, gameOv: '', mod: '', mapKey: 'map/multi/mv_fixture' }, canvas: true, api: routeApi(r2, c2), parts: [] });
    P2.screen.refresh(); await until(() => g2.length >= 1, 5000); while (g2.length) g2.shift()(); await flush();
    ok(!c2.some(c => c.path === '/api/x/mapviz/job'), 'planted ' + game + ': a refresh alone starts no doc job');
  }
  // engineTrueGoh: a layer true to the engine on MoW:AS2 and AS64 but an estimate on Gates of Hell marks itself per tab
  for (const game of ['as64', 'mowas2', 'goh']) {
    const routes = { 'GET /api/x/mapviz/palette': async () => PAL, 'GET /api/x/mapviz/cache': async () => ({ v: 1, root: '<cache>', bytes: 0, cap: 1, entries: 0, jobs: 0 }) };
    const part = { id: 'eg', init(V) { V.addLayer({ id: 'gx', group: 'cover', label: 'Goh mark', engineTrue: true, engineTrueGoh: false, draw() {} }); } };
    const P = mkPage({ scripts: [CLIENT], lang: L, S: { gameId: game, gameOv: '', mod: '', mapKey: '' }, canvas: false, api: routeApi(routes, []), parts: [part] });
    P.screen.refresh(); await flush();
    const grp = blk(P.root, 'mv.groups'), want = game === 'goh' ? 'mapviz.shell.estimate' : 'mapviz.shell.engineTrue', not = game === 'goh' ? 'mapviz.shell.engineTrue' : 'mapviz.shell.estimate';
    ok(grp.has(L.en[want]) && !grp.has(L.en[not]), 'engineTrueGoh ' + game + ': the row mark is ' + (game === 'goh' ? 'estimate' : 'as the game sees it'), grp.textContent);
  }
  // 2n the layer list (owner brief 2026-11-20): the filter, the views, On now with the legend inline, the marks, make on tick
  // (one job on a user tick only; none from a refresh, a permalink, a stored state or a view), Try again, Make these (n), folds
  { const calls = [], JS = {}, made = new Set(); let jn = 0;
    const DOC = { v: 1, key: 'multi/mv_fixture', modes: [{ id: 'combat', spawns: [] }], boxes: { world: [-600, -440, 600, 440] }, entities: [] };
    const NEED = { 'nm.a': { what: 'cover', args: {} }, 'nm.c': { what: 'cover', args: {} }, 'nm.b': { what: 'height', args: {} }, 'nm.d': { what: 'pass', args: {} }, shade: { what: 'shade', args: {} } };
    const G2 = Buffer.from([1, 2, 2, 1]).toString('base64');
    const grid = n => ({ v: 1, kind: 'grid', name: n, w: 2, h: 2, cell: 10, ox: -10, oy: -10, etype: 'u8', sample: 'cell', scale: 1, offset: 0, nodata: null, meta: {}, data: G2, pal: 'water.bands', palette: PAL.water.bands });
    const routes = {
      'GET /api/x/mapviz/palette': async () => PAL,
      'GET /api/x/mapviz/cache': async () => ({ v: 1, root: '<cache>', bytes: 0, cap: 1, entries: 0, jobs: 0 }),
      'GET /api/x/mapviz/doc': async () => DOC,
      'GET /api/x/mapviz/layer': async u => { const n = u.searchParams.get('name'); if (NEED[n] && !made.has(n)) throw Object.assign(new Error('MV_NOT_FOUND'), { status: 404, key: 'mapviz.err.MV_NOT_FOUND', params: { msg: 'x', need: NEED[n] } }); return grid(n); },
      'POST /api/x/mapviz/job': async (u, b) => { const id = 'j' + (++jn); JS[id] = { what: b.what, state: 'running' }; return { id, shared: false, state: 'queued', queue: 0 }; },
      'GET /api/x/mapviz/job': async u => { const id = u.searchParams.get('id'), j = JS[id] || { state: 'failed' };
        return { id, what: j.what, key: 'k', state: j.state, stage: '', done: 0, total: 0, elapsed: 0, queue: 0, error: j.state === 'failed' ? { code: 'MV_FAULT', msg: 'seeded stop' } : undefined }; },
      'POST /api/x/mapviz/cancel': async () => ({ ok: true }),
    };
    const part = { id: 'ln', init(V) {
      V.addLayer({ id: 'ok.a', group: 'water', label: 'Okay layer', defaultOn: true, legend: [{ label: 'OkSwatch', color: PAL.water.bands[2].fill }] });
      V.addLayer({ id: 'water.drown', group: 'water', label: 'Drown band', defaultOn: false, draw() {} });
      V.addLayer({ id: 'nm.a', group: 'cover', label: 'Cover need', defaultOn: false, engineTrue: true });
      V.addLayer({ id: 'nm.c', group: 'sight', label: 'Sight need', defaultOn: false });
      V.addLayer({ id: 'nm.b', group: 'height', label: 'Height need', defaultOn: false });
      V.addLayer({ id: 'shade', group: 'height', label: 'Shade need', defaultOn: false });
      V.addLayer({ id: 'nm.d', group: 'movement', label: 'Move need', defaultOn: true });
      V.addLayer({ id: 'tl', group: 'tools', label: 'Tool line', defaultOn: true, tool: true, draw() {} });
    } };
    const posts = () => calls.filter(c => c.method === 'POST' && c.path === '/api/x/mapviz/job');
    const cancels = () => calls.filter(c => c.path === '/api/x/mapviz/cancel').length;
    const finish = (what, state) => { Object.keys(JS).forEach(id => { if (JS[id].what === what && JS[id].state === 'running') { JS[id].state = state; if (state === 'done') Object.keys(NEED).forEach(n => { if (NEED[n].what === what) made.add(n); }); } }); };
    for (const k of Object.keys(global.LS.m)) if (/^maps\.viewer\.fold\./.test(k)) delete global.LS.m[k];
    const P = mkPage({ scripts: [CLIENT], lang: L, S: { gameId: 'mowas2', gameOv: '', mod: '', mapKey: '' }, canvas: true, api: routeApi(routes, calls), parts: [part] }), R = P.root;
    const row = id => blk(R, 'mv.l.' + id), onRow = id => blk(R, 'mv.on.' + id);
    const box = id => row(id).all().find(e => e.tagName === 'INPUT' && e.attrs.type === 'checkbox');
    const tick = (id, v) => { const c = box(id); c.checked = v; c.fire('change'); };
    const mkBtn = id => row(id).all().find(e => e.tagName === 'BUTTON' && / ?mvmk/.test(e.className || '') && e.textContent === L.en['mapviz.shell.make']);
    // a permalink and a refresh: the visible layers not made yet say so, and no job starts
    P.screen.view('mowas2~multi/mv_fixture~combat~ok.a,nm.b,nm.d~0,0,0.2'); P.screen.refresh();
    await until(() => !!mkBtn('nm.b') && !!mkBtn('nm.d') && blk(R, 'mv.onnow').has('OkSwatch'), 5000);
    ok(!!mkBtn('nm.b') && !!mkBtn('nm.d'), 'make on tick: a layer on from the permalink and not made shows one Make on its row', row('nm.b').textContent);
    ok(posts().length === 0, 'make on tick: a permalink and a refresh start no job', posts().map(c => c.body));
    P.screen.refresh(); await flush(30); ok(posts().length === 0, 'make on tick: a second refresh starts no job either');
    { const mb = mkBtn('nm.b'), lab = row('nm.b').all().find(e => e.tagName === 'LABEL');
      ok(mb.parentNode.parentNode === row('nm.b') && mb.attrs['aria-label'] === L.en['mapviz.shell.makeL'].replace('{name}', 'Height need') && mb.attrs.title === L.en['mapviz.shell.notMade'] && row('nm.b').has(L.en['mapviz.shell.notMade']) && !!lab,
        'the inline Make is on the row line, names its layer for screen readers and keeps the not made words', mb.attrs); }
    // On now: every visible layer (a tool layer only while its tool is in use: tl has no tool here), the legend under its layer, the group opacity, untick
    const on = blk(R, 'mv.onnow'), onIds = () => on.all().filter(e => e.attrs && e.attrs['data-on']).map(e => e.attrs['data-on']);
    eq(onIds(), ['nm.b', 'nm.d', 'ok.a'], 'On now: every visible layer in group order; a tool layer whose tool is not in use is left out');
    ok(on.parentNode === blk(R, 'mv.tab.layers') || blk(R, 'mv.tab.layers').all().includes(on), 'On now is in the Layers tab');
    { const lg = on.all().find(e => e.attrs && e.attrs['data-legend'] === 'ok.a');
      ok(!!lg && lg.has('OkSwatch') && lg.attrs.role === 'list' && onRow('ok.a').all().includes(lg), 'On now: the legend rows sit under their layer', on.textContent);
      ok(!blk(R, 'mv.legend'), 'the separate legend block is gone'); }
    ok(!!blk(R, 'mv.on.g.water') && blk(R, 'mv.on.g.water').all().some(e => e.tagName === 'INPUT' && e.attrs.type === 'range'), 'On now: a group line with its opacity slider');
    { const sl = blk(R, 'mv.on.g.water').all().find(e => e.attrs.type === 'range'); sl.value = '40'; sl.fire('input'); sl.fire('change');
      const gs = blk(R, 'mv.g.water.head').all().find(e => e.attrs.type === 'range'); ok(gs.value === '40', 'the opacity in On now and in the group head stay in step', gs.value); }
    // Make these (n): the visible layers not made, in list order, one job each
    { const mall = blk(R, 'mv.onnow.head').all().find(e => e.tagName === 'BUTTON');
      ok(mall && mall.hidden !== true && mall.textContent === L.en['mapviz.shell.makeAll'].replace('{n}', '2'), 'On now: Make these (2) when two visible layers are not made', mall && mall.textContent);
      mall.click(); await until(() => posts().length >= 2, 3000); await flush(10);
      eq(posts().map(c => c.body.what), ['height', 'pass'], 'Make these (n) queues the layers in list order, one job each');
      ok(blk(R, 'mv.onnow.head').all().find(e => e.tagName === 'BUTTON').hidden === true, 'Make these hides while their jobs run');
      ok(row('nm.b').has(L.en['mapviz.shell.makingRow'].split(':')[0]) && !mkBtn('nm.b'), 'a row whose job runs shows the progress words, no Make', row('nm.b').textContent); }
    // a user tick of a layer not known yet: one job once its answer says not made
    tick('nm.a', true); await until(() => posts().length >= 3, 3000); await flush(10);
    ok(posts().length === 3 && posts()[2].body.what === 'cover', 'make on tick: a user tick of a layer not made starts its job at once (one post)', posts().map(c => c.body.what));
    ok(row('nm.a').has(L.en['mapviz.shell.makingRow'].split(':')[0]), 'make on tick: the row shows the progress words', row('nm.a').textContent);
    tick('nm.a', false); await flush(10); tick('nm.a', true); await flush(20);
    ok(posts().length === 3 && cancels() === 0, 'make on tick: untick does not cancel and a second tick while its job runs posts nothing', calls.filter(c => c.method === 'POST').map(c => c.path.slice(16) + ':' + JSON.stringify(c.body)));
    tick('nm.c', true); await flush(40);
    ok(posts().length === 3 && row('nm.c').has(L.en['mapviz.shell.makingRow'].split(':')[0]), 'make on tick: a tick whose job is already running (another layer started it) posts nothing and shows its progress', row('nm.c').textContent);
    tick('ok.a', false); tick('ok.a', true); await flush(30);
    ok(posts().length === 3, 'make on tick: a tick of a made layer posts nothing');
    // the job fails: the row stays ticked with the reason and Try again
    finish('cover', 'failed'); await until(() => row('nm.a').all().some(e => e.tagName === 'BUTTON' && e.textContent === L.en['mapviz.shell.retry']), 4000);
    { const tb = row('nm.a').all().find(e => e.tagName === 'BUTTON' && e.textContent === L.en['mapviz.shell.retry']);
      ok(!!tb && box('nm.a').checked === true && row('nm.a').has('seeded stop') && tb.attrs['aria-label'] === L.en['mapviz.shell.retryL'].replace('{name}', 'Cover need'), 'a failed make leaves the row ticked with the reason and Try again', row('nm.a').textContent);
      ok(onRow('nm.a') && onRow('nm.a').all().some(e => e.tagName === 'BUTTON' && e.textContent === L.en['mapviz.shell.retry']), 'On now shows the same Try again');
      tb.click(); await until(() => posts().length >= 4, 3000);
      ok(posts().length === 4 && posts()[3].body.what === 'cover', 'Try again posts the job once more', posts().map(c => c.body.what)); }
    finish('cover', 'done'); await until(() => !row('nm.a').has(L.en['mapviz.shell.makingRow'].split(':')[0]) && !row('nm.a').has('seeded stop'), 4000); await flush(20);
    ok(!row('nm.a').all().some(e => e.tagName === 'BUTTON') && !row('nm.a').has(L.en['mapviz.shell.notMade']), 'a layer made is a plain row again', row('nm.a').textContent);
    // views: a press changes ticks only (the game marks stay, tool layers keep theirs), starts no job; the active one again changes nothing
    { const vb = id => blk(R, 'mv.views').all().find(e => e.tagName === 'BUTTON' && e.textContent === L.en['mapviz.shell.view.' + id]);
      const seen = []; P.V.on('layers', d => seen.push(d)); const n0 = posts().length;
      ok(T.VIEWS.every(v => !!vb(v[0])), 'views: one button per view under the filter');
      vb('terrain').click(); await flush(40);
      ok(box('shade').checked === true && box('ok.a').checked === false && box('nm.b').checked === false && box('tl').checked === true, 'views: Terrain ticks its layers, unticks the others and leaves the tool layer alone');
      ok(!!mkBtn('shade') && posts().length === n0, 'views: a view layer that is not made shows Make; the press started no job', posts().length - n0);
      ok(vb('terrain').attrs['aria-pressed'] === 'true' && vb('water').attrs['aria-pressed'] === 'false' && /Shade need/.test(vb('terrain').attrs.title), 'views: the active view is pressed and its title names its layers', vb('terrain').attrs);
      const ns = seen.length; vb('terrain').click(); await flush(10);
      ok(seen.length === ns && box('shade').checked === true, 'views: pressing the active view again changes nothing');
      vb('plain').click(); await flush(20); eq(onIds(), [], 'views: Plain map leaves only what the view names (none here; the tool layer is not listed while no tool runs)'); ok(box('tl').checked === true, 'views: the tool layer keeps its tick'); }
    // the filter: by label, by group name, by help text; matched groups open, others hide; clearing gives the folds back
    { const fi = blk(R, 'mv.filter').all().find(e => e.tagName === 'INPUT');
      const foldOf = () => T.GROUPS.filter(g => blk(R, 'mv.g.' + g)).map(g => g + ':' + blk(R, 'mv.g.' + g + '.head').all().find(e => e.className === 'mvfold').attrs['aria-expanded']).join(' ');
      const vis = () => R.all().filter(e => e.attrs && e.attrs['data-layer'] && e.hidden !== true && blk(R, 'mv.g.' + e.parentNode.attrs['data-blk'].slice(5)).hidden !== true).map(e => e.attrs['data-layer']);
      const f0 = foldOf(), set = v => { fi.value = v; fi.fire('input'); };
      ok(fi.attrs['aria-label'] === L.en['mapviz.shell.filter'] && fi.attrs.placeholder === L.en['mapviz.shell.filterHint'], 'filter: a named box with its hint');
      set('okay'); eq(vis(), ['ok.a'], 'filter by label: only the matching row shows');
      ok(blk(R, 'mv.g.water.head').all().find(e => e.className === 'mvfold').attrs['aria-expanded'] === 'true' && blk(R, 'mv.g.cover').hidden === true, 'filter: the matched group is open, a group with no match is hidden');
      set('MOVEMENT'); eq(vis(), ['nm.d'], 'filter by group name (any case)');
      set('amphibious'); eq(vis(), ['water.drown'], 'filter by help text');
      set('cover need'); eq(vis(), ['nm.a'], 'filter: every word must match');
      set('zzqq'); ok(!!blk(R, 'mv.groups.nomatch') && blk(R, 'mv.groups.nomatch').has(L.en['mapviz.shell.filterNone']) && !vis().length, 'filter: no match says so');
      set(''); ok(foldOf() === f0 && !blk(R, 'mv.groups.nomatch'), 'filter cleared: every group has its own fold back', [foldOf(), f0]);
      set('need'); fi.fire('keydown', { key: 'ArrowDown' });
      ok(P.doc.activeElement === box(vis()[0]), 'filter: Down goes to the tick of the first row it shows', P.doc.activeElement && P.doc.activeElement.attrs);
      fi.fire('keydown', { key: 'Escape' }); ok(fi.value === '' && vis().length > 0, 'filter: Esc clears it');
      // the key '/': shows the Layers tab and puts the focus in the box; not while typing in a field
      P.V.tab('inspect'); P.doc.activeElement = P.doc.body;
      ok(P.screen.keys({ key: '/', target: P.doc.body }) === true && P.V.q('tab') === 'layers' && P.doc.activeElement === fi, 'key /: the Layers tab and the focus in the filter');
      const f2 = P.doc.createElement('input'); P.doc.body.appendChild(f2); f2.focus();
      ok(P.screen.keys({ key: '/', target: f2 }) === false && P.doc.activeElement === f2, 'key /: nothing while typing in a field');
      ok(P.X.mapviz.keys.some(k => k[0] === '/' && k[1] === 'mapviz.shell.key.filter'), 'key /: in the key list'); }
    // the marks: a small symbol with a title and words for screen readers; the key under the filter explains both
    { const mk = id => row(id).all().find(e => e.className === 'mvmark');
      ok(mk('nm.a').attrs['data-mark'] === 'true' && mk('nm.b').attrs['data-mark'] === 'estimate' && mk('nm.a').has(T.MK_T) && mk('nm.b').has(T.MK_E), 'marks: as the game sees it and estimate keep their distinction');
      ok(blk(R, 'mv.markkey').has(T.MK_T) && blk(R, 'mv.markkey').has(T.MK_E) && blk(R, 'mv.markkey').has(L.en['mapviz.shell.markKey'].split('{e}')[1].trim()), 'marks: one key line under the filter', blk(R, 'mv.markkey').textContent);
      ok(!R.has(L.en['mapviz.shell.engineTrue']) || R.all().filter(e => e.tagName && e.tagName[0] !== '#' && e.textContent === ' ' + L.en['mapviz.shell.engineTrue']).every(e => e.className === 'mvvh'), 'marks: the long words are only visually hidden text'); }
    ok(require('../../../test/blockcheck').checkScreen(R, 'mapviz').length === 0, 'the layer list keeps the GUI block rule', require('../../../test/blockcheck').checkScreen(R, 'mapviz').slice(0, 6));
  }
  // 2n2 a stored state: default-on layers not made start no job when the page opens its stored map; folds: nothing on ->
  // folded, something on -> open, the user's stored fold wins; a tick in a group keeps it open; On now empty state
  { const calls = [];
    const routes = { 'GET /api/x/mapviz/palette': async () => PAL, 'GET /api/x/mapviz/cache': async () => ({ v: 1, root: '<cache>', bytes: 0, cap: 1, entries: 0, jobs: 0 }),
      'GET /api/x/mapviz/doc': async () => ({ v: 1, key: 'multi/mv_fixture', modes: [{ id: 'combat', spawns: [] }], boxes: { world: [-600, -440, 600, 440] }, entities: [] }),
      'GET /api/x/mapviz/layer': async u => { throw Object.assign(new Error('MV_NOT_FOUND'), { status: 404, key: 'mapviz.err.MV_NOT_FOUND', params: { msg: 'x', need: { what: 'water', args: {} } } }); },
      'POST /api/x/mapviz/job': async () => ({ id: 'jx', shared: false, state: 'queued', queue: 0 }), 'GET /api/x/mapviz/job': async () => ({ id: 'jx', state: 'running' }) };
    const part = { id: 'ls', init(V) {
      V.addLayer({ id: 'w.on', group: 'water', label: 'Water on', defaultOn: true });
      V.addLayer({ id: 'c.off', group: 'cover', label: 'Cover off', defaultOn: false, draw() {} });
      V.addLayer({ id: 'h.off', group: 'height', label: 'Height off', defaultOn: false, draw() {} });
      V.addLayer({ id: 'g.on', group: 'game', label: 'Game on', defaultOn: true, draw() {} });
      V.addLayer({ id: 's.on', group: 'sight', label: 'Sight on', defaultOn: true, draw() {} });
    } };
    for (const k of Object.keys(global.LS.m)) if (/^maps\.viewer\.fold\./.test(k)) delete global.LS.m[k];
    global.LS.m['maps.viewer.fold.game'] = true; global.LS.m['maps.viewer.fold.height'] = false; global.LS.m['maps.viewer.tab'] = 'layers';
    const P = mkPage({ scripts: [CLIENT], lang: L, S: { gameId: 'mowas2', gameOv: '', mod: '', mapKey: 'map/multi/mv_fixture' }, canvas: true, api: routeApi(routes, calls), parts: [part] }), R = P.root;
    P.screen.refresh(); await until(() => blk(R, 'mv.l.w.on') && blk(R, 'mv.l.w.on').has(L.en['mapviz.shell.make']), 5000);
    ok(blk(R, 'mv.l.w.on').has(L.en['mapviz.shell.make']) && !calls.some(c => c.method === 'POST' && c.path === '/api/x/mapviz/job'), 'stored state: a default-on layer not made on the stored map starts no job', calls.filter(c => c.method === 'POST').map(c => c.body));
    const fold = g => blk(R, 'mv.g.' + g + '.head').all().find(e => e.className === 'mvfold').attrs['aria-expanded'] === 'false';
    eq(['water', 'cover', 'height', 'game', 'sight'].map(g => g + ':' + (fold(g) ? 'folded' : 'open')), ['water:open', 'cover:folded', 'height:open', 'game:folded', 'sight:open'],
      'folds: nothing on -> folded, something on -> open, a stored fold wins either way');
    const sb = blk(R, 'mv.l.s.on').all().find(e => e.tagName === 'INPUT'); sb.checked = false; sb.fire('change');
    ok(!fold('sight') && !global.LS.m.hasOwnProperty('maps.viewer.fold.sight'), 'folds: unticking the last layer of an open group keeps it open (not stored)');
    blk(R, 'mv.g.cover.head').all().find(e => e.className === 'mvfold').click();
    ok(!fold('cover') && global.LS.m['maps.viewer.fold.cover'] === false, 'folds: the user choice is stored');
    // empty state
    for (const id of ['w.on', 'g.on']) { const c = blk(R, 'mv.l.' + id).all().find(e => e.tagName === 'INPUT'); c.checked = false; c.fire('change'); }
    ok(!!blk(R, 'mv.onnow.none') && blk(R, 'mv.onnow.none').has(L.en['mapviz.shell.onNone']) && !blk(R, 'mv.onnow').all().some(e => e.attrs && e.attrs['data-on']), 'On now: the empty state says how to turn something on');
    ok(!calls.some(c => c.method === 'POST'), 'stored state: unticks start nothing');
  }
  // 2n3 the filter with the GUI's searchKit: Browse, History and the layers as its index; Browse opens the product cache
  { const KIT = require('../../../test/blockcheck').kitSrc();
    global.MVPICK = [];
    const routes = { 'GET /api/x/mapviz/palette': async () => PAL, 'GET /api/x/mapviz/cache': async () => ({ v: 1, root: 'E:/c/mv', bytes: 0, cap: 1, entries: 0, jobs: 0 }) };
    const part = { id: 'kt', init(V) { V.addLayer({ id: 'water.drown', group: 'water', label: 'Drown band', draw() {} }); V.addLayer({ id: 'k.b', group: 'cover', label: 'Cover band', draw() {} }); } };
    const P = mkPage({ scripts: [KIT, 'searchKit.picker=function(s,d){MVPICK.push({spec:s,done:d})};', CLIENT], lang: L, S: { gameId: 'mowas2', gameOv: '', mod: '', mapKey: '' }, canvas: false, api: routeApi(routes, []), parts: [part] }), R = P.root;
    P.screen.refresh(); await flush(30);
    const sk = R.all().find(e => e.attrs && e.attrs['data-sk'] === 'mapviz.layerFilter');
    ok(!!sk && blk(R, 'mv.filter').all().includes(sk) && sk.all().filter(e => e.tagName === 'BUTTON').length >= 2, 'kit: the filter is a searchKit box with Browse and History');
    const fi = sk.all().find(e => e.tagName === 'INPUT'); fi.value = 'cover'; fi.fire('input'); await until(() => blk(R, 'mv.l.water.drown').hidden === true); await flush();
    ok(blk(R, 'mv.l.water.drown').hidden === true && blk(R, 'mv.l.k.b').hidden !== true, 'kit: typing filters the rows beside the box');
    sk.all().find(e => / sk-browse/.test(' ' + e.className)).click(); const b0 = global.MVPICK.pop();
    ok(!!b0 && b0.spec.mode === 'file' && b0.spec.view === 'disk' && (typeof b0.spec.start === 'function' ? b0.spec.start() : b0.spec.start) === 'E:/c/mv', 'kit: Browse opens the file picker in the product cache', b0 && b0.spec);
    if (b0) { b0.done('E:/c/mv/x/water.drown.json', { name: 'water.drown.json' }); await until(() => fi.value === 'water.drown' && blk(R, 'mv.l.k.b').hidden === true); await flush();
      ok(fi.value === 'water.drown' && blk(R, 'mv.l.water.drown').hidden !== true && blk(R, 'mv.l.k.b').hidden === true, 'kit: a picked file gives its name as the filter', fi.value); }
  }
  // views: each view names only layer ids that exist (checked on the joined page below); planted: an unknown id is caught
  { const checkViews = (views, ids) => { const bad = []; views.forEach(v => v[2].forEach(id => { if (!ids.has(id)) bad.push(v[0] + ':' + id); })); return bad; };
    const planted = T.VIEWS.concat([['bogus', 'mapviz.shell.view.plain', ['base', 'water.nope']]]);
    eq(checkViews(planted, new Set(T.VIEWS.flatMap(v => v[2]))), ['bogus:water.nope'], 'planted: a view naming an unknown layer is caught');
    ok(T.viewSet('nope') === null && T.viewSet('plain').base === 1 && T.MARKS.every(m => T.viewSet('plain')[m] === 1), 'viewSet: an unknown view is null; every view keeps the base and the game marks');
    ok(T.filterHit('drown band water', 'BAND drown') && !T.filterHit('drown band', 'band zz') && T.filterHit('x', ''), 'filterHit: every word, any case; empty matches'); }
  // 2i3 (integration, QCOM): GET pictures and export (pictures part) and GET previews/targets (export part) get the page
  // fields from the shell, each once; previews/targets gets no side or kind (its route refuses them); no phase on them
  for (const game of ['as64', 'mowas2', 'goh']) {
    const calls = [];
    const DOC = { v: 1, key: 'multi/mv_fixture', modes: [{ id: 'combat', spawns: [{ name: 'a', team: 'a', x: 0, y: 0, phase: 0 }, { name: 'b', team: 'a', x: 0, y: 0, phase: 1 }] }], boxes: { world: [-600, -440, 600, 440] }, entities: [] };
    const routes = { 'GET /api/x/mapviz/palette': async () => PAL, 'GET /api/x/mapviz/cache': async () => ({ v: 1, root: '<cache>', bytes: 0, cap: 1, entries: 0, jobs: 0 }),
      'GET /api/x/mapviz/doc': async () => DOC, 'GET /api/x/mapviz/pictures': async () => ({ v: 1 }), 'GET /api/x/mapviz/export': async () => ({ v: 1 }), 'GET /api/x/mapviz/previews/targets': async () => ({ v: 1 }) };
    const P = mkPage({ scripts: [CLIENT], lang: L, S: { gameId: game, gameOv: '', mod: 'mods/m1', mapKey: 'map/multi/mv_fixture' }, canvas: true, api: routeApi(routes, calls), parts: [] });
    P.screen.refresh(); await until(() => P.V.doc, 5000); await flush();
    const sel = blk(P.root, 'mv.phase').all().find(e => e.tagName === 'SELECT'); sel.value = '1'; sel.fire('change'); await flush();
    const n0 = calls.length;
    await P.V.api('GET', 'pictures', { bases: 'l2', map: 'multi/mv_fixture' }).catch(() => {});
    await P.V.api('GET', 'export', { base: 'l2', size: 512 }).catch(() => {});
    await P.V.api('GET', 'previews/targets', {}).catch(() => {});
    const qs = calls.slice(n0).map(c => new URL(c.url, 'http://x').searchParams);
    const once = s => ['target', 'map', 'mode'].every(k => s.getAll(k).length === 1);
    ok(qs.length === 3 && qs.every(once) && qs.every(s => s.get('target') === game && s.get('map') === 'multi/mv_fixture' && s.get('mode') === 'combat'), 'QCOM ' + game + ': pictures, export and previews/targets carry target, map and mode once', calls.slice(n0).map(c => c.url));
    ok(qs.length === 3 && qs[0].get('side') === 'both' && qs[1].get('kind') === 'inf' && qs[1].get('base') === 'l2' && !qs[2].has('side') && !qs[2].has('kind') && qs.every(s => !s.has('phase')), 'QCOM ' + game + ': pictures and export get side and kind, previews/targets not; none gets the phase', calls.slice(n0).map(c => c.url));
  }
  // 2i4 (integration, style fixer): the part order in index.js keeps pictures before style (style re-sends its picture
  // after a context change, and pictures must be listening first) and export between them (README 1.10)
  { const N = require('../index.js')._t.NAMES;
    ok(N.indexOf('pictures') >= 0 && N.indexOf('pictures') < N.indexOf('export') && N.indexOf('export') < N.indexOf('style') && N.indexOf('shell') === 0, 'index.js part order: shell first, then pictures, export, style', N); }
  // 2j P9: a tile answer that comes after the map was closed (context change) never lands in the tile store
  { const srcs = []; const desc0 = Object.getOwnPropertyDescriptor(ImageStub.prototype, 'src');
    Object.defineProperty(ImageStub.prototype, 'src', { configurable: true, set(v) { srcs.push(v); this._src = v; }, get() { return this._src; } });
    const PNG = Buffer.from([137, 80, 78, 71]).toString('base64');
    const mk = () => { const calls = [], hold = [];
      let tq = 0;
      const routes = { 'GET /api/x/mapviz/palette': async () => PAL, 'GET /api/x/mapviz/cache': async () => ({ v: 1, root: '<cache>', bytes: 0, cap: 1, entries: 0, jobs: 0 }),
        'GET /api/x/mapviz/doc': async () => ({ v: 1, key: 'multi/mv_fixture', modes: [{ id: 'combat' }], boxes: { world: [-600, -440, 600, 440] }, entities: [] }),
        'GET /api/x/mapviz/tiles': async u => { tq++; if (tq === 1) return { v: 1, kind: 'tiles', base: 'topo', z: 0, zmax: 0, w: 120, h: 88, ox: -600, oy: -440, cell: 10, box: [-600, -440, 600, 440], tiles: [] };
          const ts = u.searchParams.get('t').split(','), z = +u.searchParams.get('z'); return new Promise(res => hold.push(() => res({ v: 1, kind: 'tiles', base: 'topo', z, tiles: ts.map(t => ({ t, png: PNG })) }))); } };
      const S = { gameId: 'mowas2', gameOv: '<f1>', mod: '', mapKey: 'map/multi/mv_fixture' };
      const P = mkPage({ scripts: [CLIENT], lang: L, S, canvas: true, api: routeApi(routes, calls), parts: [{ id: 'p9', init(V) { V.addLayer({ id: 'topo', group: 'base', label: 'Topo', tiles: 'topo' }); } }] });
      return { P, S, hold, calls }; };
    let A = mk(); A.P.screen.refresh(); await until(() => A.hold.length > 0, 5000);
    srcs.length = 0; A.hold.forEach(f => f()); await flush();
    ok(A.hold.length > 0 && srcs.some(s => /^data:image\/png/.test(s)), 'planted: a tile answer for the open map lands (an image is made)', srcs.length);
    const B = mk(); B.P.screen.refresh(); await until(() => B.hold.length > 0, 5000);
    B.S.gameOv = '<f2>'; B.P.screen.refresh(); await flush();
    srcs.length = 0; B.hold.forEach(f => f()); await flush();
    ok(B.P.V.q('map') == null && srcs.length === 0, 'P9: the late tile answer after the map was closed makes no image (not in the store)', srcs.length);
    if (desc0) Object.defineProperty(ImageStub.prototype, 'src', desc0);
  }
  // 2l F1: a SHOWN page whose game folder changed with no refresh yet (the GUI sets S.gameOv, then its own refresh comes a
  // round trip later) is never frozen: a pick opens in the new context and survives the GUI's refresh; a pan, a draw or a
  // part read takes the new context in first (map closed, the map list of the new folder asked once), then goes on
  { const calls = [];
    const DOC = { v: 1, key: 'multi/mv_fixture', modes: [{ id: 'combat' }], boxes: { world: [-600, -440, 600, 440] }, entities: [] };
    const SPW = { v: 1, kind: 'vector', name: 'spawns', items: [{ kind: 'spawn', mode: 'combat', name: 'a1', team: 'a', order: 1, x: -500, y: 10, z: null, yaw: 0 }], pal: 'sides', palette: PAL.sides };
    const routes = { 'GET /api/x/mapviz/palette': async () => PAL, 'GET /api/x/mapviz/cache': async () => ({ v: 1, root: '<cache>', bytes: 0, cap: 1, entries: 0, jobs: 0 }),
      'GET /api/x/mapviz/maps': async () => ({ v: 1, maps: [{ key: 'multi/mv_fixture', modes: ['combat'] }] }),
      'GET /api/x/mapviz/doc': async () => DOC, 'GET /api/x/mapviz/layer': async () => SPW };
    const maps = [];
    const part = { id: 'f1', init(V) { V.addLayer({ id: 'spawns', group: 'game', label: 'Spawns', engineTrue: true }); V.on('map', d => maps.push(d)); } };
    const S = { gameId: 'mowas2', gameOv: '<folder one>', mod: '', mapKey: 'map/multi/mv_fixture', cur: 'mapviz', sec: {} };
    const P = mkPage({ scripts: [CLIENT, LIST], lang: LL, S, canvas: true, api: routeApi(routes, calls), parts: [part] });
    S.sec.mapviz = P.root;
    P.screen.refresh(); await until(() => P.V.doc && blk(P.root, 'mv.items').has('a1'), 5000); await flush();
    ok(P.V.q('map') === 'multi/mv_fixture', 'F1 setup: shown, the map is open');
    const gq = (c) => new URL(c.url, 'http://x').searchParams.get('game');
    const mapsOf = (n, g) => calls.slice(n).filter(c => c.path === '/api/x/mapviz/maps' && gq(c) === g).length;
    // a pick in the window between S.gameOv and the GUI's refresh came from the old folder's list: the change is taken in
    // and the pick is dropped (no document read); a pick made after that (from the new list) opens in the new folder
    S.gameOv = '<folder two>'; let n = calls.length;
    P.V.emit('map', { key: 'multi/mv_fixture', pick: true }); await flush();
    ok(P.V.q('map') == null && !calls.slice(n).some(c => c.path === '/api/x/mapviz/doc') && blk(P.root, 'mv.say').has(LL.en['mapviz.shell.closed']), 'F1: a pick that takes the folder change in is dropped: no map, no document read, the closed line', [P.V.q('map'), calls.slice(n).map(c => c.path)]);
    ok(mapsOf(n, '<folder two>') === 1 && maps.some(d => d.key == null), 'F1: the change was taken in first: the old map closed, the map list of the new folder asked once', calls.slice(n).map(c => c.path));
    P.V.emit('map', { key: 'multi/mv_fixture', pick: true }); await until(() => P.V.doc, 5000); await flush();
    const dq = calls.slice(n).filter(c => c.path === '/api/x/mapviz/doc');
    ok(P.V.q('map') === 'multi/mv_fixture' && dq.length === 1 && gq(dq[0]) === '<folder two>' && !!P.V.doc, 'F1: the next pick opens the map in the new folder (its document read goes)', dq.map(c => c.url));
    ok(!calls.slice(n).some(c => c.path === '/api/x/mapviz/layer' && gq(c) === '<folder one>'), 'F1: nothing is read in the old folder after the change');
    const n1 = calls.length; P.screen.refresh(); await flush();
    ok(P.V.q('map') === 'multi/mv_fixture' && !!P.V.doc && mapsOf(n1, '<folder two>') === 0, 'F1: the GUI refresh that comes after keeps the picked map open and asks the map list no second time', [P.V.q('map'), calls.slice(n1).map(c => c.path)]);
    // a pan (user action): the map closes, the stage draws again and the view moves, never frozen
    const cvs = P.root.all().find(e => e.tagName === 'CANVAS');
    S.gameOv = '<folder three>'; n = calls.length; const l0 = P.log.length, cx0 = P.V.view.cx;
    cvs.fire('keydown', { key: 'ArrowRight', shiftKey: true }); await flush();
    ok(P.V.q('map') == null && mapsOf(n, '<folder three>') === 1, 'F1: a pan after the folder changed takes it in (map closed, the new map list asked once)', [P.V.q('map'), calls.slice(n).map(c => c.url)]);
    ok(P.V.view.cx !== cx0 && P.log.slice(l0).some(x => x.op === 'fillRect'), 'F1: the pan still moves the view and the stage draws (not frozen)', [cx0, P.V.view.cx]);
    // a part read of the old map after a change: the change is taken in first and the read is dropped (stale), never sent
    P.V.emit('map', { key: 'multi/mv_fixture', pick: true }); await until(() => P.V.doc, 5000); await flush();
    S.gameOv = '<folder four>'; n = calls.length; let got = null;
    P.V.api('GET', 'layer', { name: 'spawns' }).then(() => { got = 'ok'; }, e => { got = e && e.stale ? 'stale' : 'err'; }); await flush();
    ok(got === 'stale' && P.V.q('map') == null && !calls.slice(n).some(c => c.path === '/api/x/mapviz/layer') && mapsOf(n, '<folder four>') === 1, 'F1: a read of the old map: the change is taken in, the read is dropped as stale', [got, calls.slice(n).map(c => c.url)]);
    // a read that is not of the map (the cache line) goes on in the new context
    P.V.emit('map', { key: 'multi/mv_fixture', pick: true }); await until(() => P.V.doc, 5000); await flush();
    S.gameOv = '<folder five>'; got = null;
    P.V.api('GET', 'cache').then(() => { got = 'ok'; }, () => { got = 'err'; }); await flush();
    ok(got === 'ok' && P.V.q('map') == null, 'F1: a read not of the map goes on after the change was taken in', got);
    // a draw (a redraw with no user action) takes it in too
    P.V.emit('map', { key: 'multi/mv_fixture', pick: true }); await until(() => P.V.doc, 5000); await flush();
    S.gameOv = '<folder six>'; n = calls.length; P.V.redraw(); await flush();
    ok(P.V.q('map') == null && mapsOf(n, '<folder six>') === 1, 'F1: a draw takes the change in', calls.slice(n).map(c => c.url));
    // a job of the old map asked after the change: dropped as stale, never posted
    P.V.emit('map', { key: 'multi/mv_fixture', pick: true }); await until(() => P.V.doc, 5000); await flush();
    S.gameOv = '<folder seven>'; n = calls.length; got = null;
    P.V.job('grids', {}).then(() => { got = 'ok'; }, e => { got = e && e.stale ? 'stale' : 'err'; }); await flush();
    ok(got === 'stale' && !calls.slice(n).some(c => c.method === 'POST'), 'F1: a job of the old map after the change is dropped as stale, nothing posted', [got, calls.slice(n).map(c => c.method + ' ' + c.path)]);
    // planted: hidden, the folder changes: a read is held, nothing is asked (the old rule still holds while hidden)
    P.V.emit('map', { key: 'multi/mv_fixture', pick: true }); await until(() => P.V.doc, 5000); await flush();
    S.cur = 'mods'; S.gameOv = '<folder eight>'; n = calls.length; got = null;
    P.V.api('GET', 'cache').then(() => { got = 'ok'; }, e => { got = e && e.stale ? 'stale' : 'err'; }); P.V.redraw(); await flush();
    ok(got === null && calls.length === n && P.V.q('map') === 'multi/mv_fixture', 'F1 planted: hidden: the read is held, nothing asked, the map not closed until a refresh', [got, calls.slice(n).map(c => c.url)]);
    S.cur = 'mapviz'; P.screen.refresh(); await until(() => got !== null, 5000);
    ok(got === 'stale' && P.V.q('map') == null && mapsOf(n, '<folder eight>') === 1, 'F1 planted: the show refresh takes the change in; the read held in the old context is dropped as stale', [got, P.V.q('map')]);
  }
  // 2l2 F1 picks across a change: a click in the list (a map or a mode button) that the old context drew, made before any
  // refresh took the change in, is dropped: no map set, no S.mapKey, no document read, no job; the closed-map line shows
  // and the list of the new context is asked once. A click in the new list opens as usual
  { const mkPick = (S0) => {
      const calls = [], made = {};
      const gq = (u, k) => new URL(u, 'http://x').searchParams.get(k);
      const routes = { 'GET /api/x/mapviz/palette': async () => PAL, 'GET /api/x/mapviz/cache': async () => ({ v: 1, root: '<cache>', bytes: 0, cap: 1, entries: 0, jobs: 0 }),
        // the list of each context names its own map: game change or folder change gives another key
        'GET /api/x/mapviz/maps': async (u) => ({ v: 1, maps: [{ key: 'multi/m_' + gq(u.href, 'target') + '_' + String(gq(u.href, 'game')).replace(/[^a-z0-9]/g, ''), modes: ['combat', 'assault'] }] }),
        // a document not made yet: a user pick posts the doc job (so a wrongly opened old pick would post one)
        'GET /api/x/mapviz/doc': async (u) => { const m = gq(u.href, 'map'); if (!made[m]) throw Object.assign(new Error('MV_NOT_FOUND'), { status: 404, key: 'mapviz.err.MV_NOT_FOUND', params: { msg: 'x', need: { what: 'doc', args: {} } } });
          return { v: 1, key: m, modes: [{ id: 'combat' }, { id: 'assault' }], boxes: { world: [-100, -100, 100, 100] }, entities: [] }; },
        'POST /api/x/mapviz/job': async (u, b) => { made[b.map] = true; return { id: 'jd' + calls.length, shared: false, state: 'queued', queue: 0 }; },
        'GET /api/x/mapviz/job': async (u) => ({ id: gq(u.href, 'id'), what: 'doc', state: 'done', stage: '', done: 1, total: 1, queue: 0 }) };
      const S = Object.assign({ mod: '', mapKey: '', cur: 'mapviz', sec: {} }, S0);
      const P = mkPage({ scripts: [CLIENT, LIST], lang: LL, S, canvas: false, api: routeApi(routes, calls) });
      S.sec.mapviz = P.root;
      const btns = (id) => (blk(P.root, id) ? blk(P.root, id).all().filter(e => e.tagName === 'BUTTON') : []);
      const since = (n, p, m) => calls.slice(n).filter(c => c.path === p && (!m || c.method === m));
      return { P, S, calls, btns, since, gq }; };
    const closedSaid = P => blk(P.root, 'mv.say').has(LL.en['mapviz.shell.closed']);
    // game change, then a click in the old list
    { const A = mkPick({ gameId: 'mowas2', gameOv: '<game one>' });
      A.P.screen.refresh(); await flush();
      const old = A.btns('mv.list.maps');
      ok(old.length === 1 && old[0].textContent.trim() === 'multi/m_mowas2_gameone', 'pick setup: the mowas2 list is drawn', old.map(b => b.textContent));
      A.S.gameId = 'as64'; A.S.gameOv = '<game two>'; const n = A.calls.length;
      old[0].click(); await flush();
      ok(A.P.V.q('map') == null && A.S.mapKey === '' && !A.since(n, '/api/x/mapviz/doc').length && !A.since(n, '/api/x/mapviz/job', 'POST').length, 'pick: a game change then a click in the old list: no map, S.mapKey not written, no document request, no job posted', [A.P.V.q('map'), A.S.mapKey, A.calls.slice(n).map(c => c.method + ' ' + c.path)]);
      const mq = A.since(n, '/api/x/mapviz/maps');
      ok(mq.length === 1 && A.gq(mq[0].url, 'target') === 'as64' && closedSaid(A.P), 'pick: the list of the new game is asked once and the closed-map line shows', [mq.map(c => c.url), blk(A.P.root, 'mv.say').textContent]);
      const neu = A.btns('mv.list.maps');
      ok(neu.length === 1 && neu[0].textContent.trim() === 'multi/m_as64_gametwo', 'pick: the new game list is drawn in place of the old one', neu.map(b => b.textContent));
      // a pick after the new list landed opens normally (its document job goes in the new game)
      const n2 = A.calls.length; neu[0].click(); await until(() => A.P.V.doc, 5000); await flush();
      const jp = A.since(n2, '/api/x/mapviz/job', 'POST');
      ok(A.P.V.q('map') === 'multi/m_as64_gametwo' && !!A.P.V.doc && A.S.mapKey === 'map/multi/m_as64_gametwo' && jp.length === 1 && jp[0].body.target === 'as64', 'pick: a click in the new list opens the map (doc job in the new game, S.mapKey written)', [A.P.V.q('map'), A.S.mapKey, jp.map(c => c.body)]); }
    // folder change (same game), then a click in the old list
    { const A = mkPick({ gameId: 'mowas2', gameOv: '<folder a>' });
      A.P.screen.refresh(); await flush();
      const old = A.btns('mv.list.maps');
      A.S.gameOv = '<folder b>'; const n = A.calls.length;
      old[0] && old[0].click(); await flush();
      const mq = A.since(n, '/api/x/mapviz/maps');
      ok(old.length === 1 && A.P.V.q('map') == null && A.S.mapKey === '' && !A.since(n, '/api/x/mapviz/doc').length && !A.since(n, '/api/x/mapviz/job', 'POST').length, 'pick: a folder change then a click in the old list: dropped (no map, no S.mapKey, no document request, no job)', A.calls.slice(n).map(c => c.method + ' ' + c.path));
      ok(mq.length === 1 && A.gq(mq[0].url, 'game') === '<folder b>' && closedSaid(A.P) && A.btns('mv.list.maps').map(b => b.textContent.trim()).join() === 'multi/m_mowas2_folderb', 'pick: the list of the new folder is asked once and drawn; the closed-map line shows', mq.map(c => c.url)); }
    // a mode button of the open map after a change
    { const A = mkPick({ gameId: 'mowas2', gameOv: '<folder c>' });
      A.P.screen.refresh(); await flush();
      A.btns('mv.list.maps')[0].click(); await until(() => A.P.V.doc, 5000); await flush();
      const modes = A.btns('mv.list.modes');
      ok(A.P.V.q('map') === 'multi/m_mowas2_folderc' && modes.map(b => b.textContent).join() === 'combat,assault', 'pick setup: the map is open with its mode buttons', modes.map(b => b.textContent));
      A.S.gameOv = '<folder d>'; const n = A.calls.length, mk = A.S.mapKey;
      modes[1].click(); await flush();
      ok(A.P.V.q('map') == null && A.P.V.q('mode') == null && A.S.mapKey === mk && !A.since(n, '/api/x/mapviz/doc').length && !A.since(n, '/api/x/mapviz/job', 'POST').length && !A.since(n, '/api/x/mapviz/layer').length, 'pick: a mode button of the old map after a change is dropped (map closed, no mode, no read, no job)', [A.P.V.q('map'), A.P.V.q('mode'), A.calls.slice(n).map(c => c.method + ' ' + c.path)]);
      ok(A.since(n, '/api/x/mapviz/maps').length === 1 && closedSaid(A.P) && !A.btns('mv.list.modes').length, 'pick: the new list is asked once, the closed-map line shows, no mode button of the old map stays', A.calls.slice(n).map(c => c.url)); }
  }
  // 2m F3: V.q('docBusy') is true from the pick until the document landed or failed; the 'doc' event tells when it ended
  { const calls = [], seen = [];
    let rel = null, fail = false;
    const DOC = { v: 1, key: 'multi/mv_fixture', modes: [{ id: 'combat' }], boxes: { world: [-600, -440, 600, 440] }, entities: [] };
    const routes = { 'GET /api/x/mapviz/palette': async () => PAL, 'GET /api/x/mapviz/cache': async () => ({ v: 1, root: '<cache>', bytes: 0, cap: 1, entries: 0, jobs: 0 }),
      'GET /api/x/mapviz/doc': () => new Promise((res, rej) => { rel = () => (fail ? rej(Object.assign(new Error('MV_FAULT'), { status: 500, key: 'mapviz.err.MV_FAULT', params: { msg: 'broken' } })) : res(DOC)); }) };
    const P = mkPage({ scripts: [CLIENT], lang: L, S: { gameId: 'mowas2', gameOv: '', mod: '', mapKey: '' }, canvas: false, api: routeApi(routes, calls), parts: [{ id: 'f3', init(V) { V.on('doc', d => seen.push(['doc', d.key, d.ok, V.q('docBusy')])); V.on('map', d => seen.push(['map', d.key, !!d.doc])); } }] });
    P.screen.refresh(); await flush();
    ok(P.V.q('docBusy') === false, 'F3: no map: docBusy is false');
    P.V.emit('map', { key: 'multi/mv_fixture', pick: true }); await until(() => rel, 5000);
    ok(P.V.q('docBusy') === true && !seen.some(s => s[0] === 'doc'), 'F3: from the pick the document is being read: docBusy true, no doc event yet');
    rel(); await flush();
    const di = seen.findIndex(s => s[0] === 'doc'), mi = seen.findIndex(s => s[0] === 'map' && s[2]);
    ok(P.V.q('docBusy') === false && di >= 0 && seen[di][2] === true && seen[di][3] === false && mi >= 0 && mi < di, 'F3: the document landed: docBusy false, the doc event (ok) after the map event with the document', seen);
    fail = true; rel = null; seen.length = 0; P.V.emit('map', { key: 'multi/other', pick: true }); await until(() => rel, 5000); rel(); await flush();
    ok(P.V.q('docBusy') === false && seen.some(s => s[0] === 'doc' && s[1] === 'multi/other' && s[2] === false), 'F3: the document read failed: docBusy false and the doc event says ok false', seen);
  }
  // 2n a poll that gets no answer once (a network blip) is tried again; the job does not end failed while it runs
  { const mkJob = (plan) => { const calls = [];
      let k = 0;
      const routes = { 'GET /api/x/mapviz/palette': async () => PAL, 'GET /api/x/mapviz/cache': async () => ({ v: 1, root: '<cache>', bytes: 0, cap: 1, entries: 0, jobs: 0 }),
        'POST /api/x/mapviz/job': async () => ({ id: 'jn', shared: false, state: 'running', queue: 0 }),
        'GET /api/x/mapviz/job': async () => { const s = plan[Math.min(k++, plan.length - 1)];
          if (s === 'blip') throw Object.assign(new Error('network'), { status: 0 });
          if (s === 'gone') throw Object.assign(new Error('MV_NOT_FOUND'), { status: 404, key: 'mapviz.err.MV_NOT_FOUND', params: { msg: 'x' } });
          return { id: 'jn', what: 'grids', state: s, stage: 'build', done: 1, total: 2, queue: 0 }; } };
      const ev = [];
      const P = mkPage({ scripts: [CLIENT], lang: L, S: { gameId: 'mowas2', gameOv: '', mod: '', mapKey: '' }, canvas: false, api: routeApi(routes, calls), parts: [{ id: 'pn', init(V) { V.on('job', d => ev.push(d)); } }] });
      P.screen.refresh(); return { P, ev, polls: () => k }; };
    let A = mkJob(['running', 'blip', 'running', 'done']); await flush();
    let res = await A.P.V.job('grids', {}).then(r => 'done:' + r.state, e => 'fail:' + e.message);
    ok(res === 'done:done' && A.ev.filter(d => d.end).length === 1 && A.ev.find(d => d.end).state === 'done', 'poll: one failed poll answer is tried again; the job ends done', [res, A.ev.map(d => d.state + (d.end ? '!' : ''))]);
    A = mkJob(['running', 'blip', 'blip', 'blip', 'running', 'done']); await flush();
    res = await A.P.V.job('grids', {}).then(r => 'done:' + r.state, e => 'fail:' + e.message);
    ok(res === 'done:done', 'poll: three failed answers in a row are still tried again', res);
    A = mkJob(['running', 'blip', 'blip', 'blip', 'blip', 'done']); await flush();
    res = await A.P.V.job('grids', {}).then(r => 'done:' + r.state, e => 'fail:' + e.message);
    ok(res === 'fail:network' && A.polls() === 5 && A.ev.filter(d => d.end).length === 1, 'poll planted: a fourth failed answer in a row ends the job on the page', [res, A.polls()]);
    ok(blk(A.P.root, 'mv.say').textContent === L.en['mapviz.shell.jobFailed'].replace('{what}', L.en['mapviz.shell.what.grids']).replace('{msg}', 'network'), 'poll: the give-up says the job-failed line before it rejects', blk(A.P.root, 'mv.say').textContent);
    // a caller that ignores the rejection still leaves the line
    A = mkJob(['running', 'blip', 'blip', 'blip', 'blip', 'done']); await flush();
    A.P.V.job('grids', {}).catch(() => {}); await until(() => A.ev.some(d => d.end), 5000);
    ok(blk(A.P.root, 'mv.say').has('network'), 'poll: a give-up whose rejection nobody reads still leaves the job-failed line', blk(A.P.root, 'mv.say').textContent);
    // an answer whose state the page does not know: never a loop for ever; a known state between resets the count
    A = mkJob(['running', 'weird']); await flush();
    res = await A.P.V.job('grids', {}).then(r => 'done:' + r.state, e => 'fail:' + e.message);
    ok(res === 'fail:MV_FAULT' && A.polls() === 21 && A.ev.filter(d => d.end).length === 1 && A.ev.find(d => d.end).state === 'failed' && blk(A.P.root, 'mv.say').has('weird'), 'poll planted: 20 answers in a row with an unknown state end the job as failed, with the job-failed line', [res, A.polls(), blk(A.P.root, 'mv.say').textContent]);
    A = mkJob(['running'].concat(Array(19).fill('weird'), ['running'], Array(19).fill('weird'), ['done'])); await flush();
    res = await A.P.V.job('grids', {}).then(r => 'done:' + r.state, e => 'fail:' + e.message);
    ok(res === 'done:done' && A.polls() === 41, 'poll: a known state between unknown ones resets the count (19, running, 19, done)', [res, A.polls()]);
    A = mkJob(['running', 'gone', 'done']); await flush();
    res = await A.P.V.job('grids', {}).then(r => 'done:' + r.state, e => 'fail:' + e.message);
    ok(res === 'fail:MV_NOT_FOUND' && A.polls() === 2, 'poll: a refusing answer of the server (404) ends it at once', [res, A.polls()]);
  }
  // 2k P5: the whole page (the shell and every part) with a map open: every mv block has a name in words, never a bare key
  { const subs = fs.readdirSync(HERE).filter(f => /\.client\.js$/.test(f) && f !== 'shell.client.js').sort();
    const LA = mergeLang([LANG].concat(fs.readdirSync(HERE).filter(f => /\.lang\.json$/.test(f) && f !== 'shell.lang.json').map(f => require('./' + f))));
    const calls = [];
    const routes = { 'GET /api/x/mapviz/palette': async () => PAL, 'GET /api/x/mapviz/cache': async () => ({ v: 1, root: '<cache>', bytes: 0, cap: 1, entries: 0, jobs: 0 }),
      'GET /api/x/mapviz/maps': async () => ({ v: 1, maps: [{ key: 'multi/mv_fixture', modes: ['combat'] }] }),
      'GET /api/x/mapviz/doc': async () => ({ v: 1, key: 'multi/mv_fixture', modes: [{ id: 'combat' }], boxes: { world: [-600, -440, 600, 440] }, entities: [] }) };
    const P = mkPage({ scripts: [CLIENT].concat(subs.map(f => require('./' + f))), lang: LA, S: { gameId: 'mowas2', gameOv: '', mod: '', mapKey: 'map/multi/mv_fixture' }, canvas: true, api: routeApi(routes, calls) });
    P.screen.refresh(); await until(() => P.V.doc, 5000); await flush(); P.V.redraw(); await flush();
    const mvb = P.root.all().filter(e => /^mv/.test(String(e.attrs['data-blk'] || '')));
    const noName = mvb.filter(e => { const n = e.attrs['data-blkname']; return n == null || !String(n).trim() || /^mapviz\./.test(String(n)); }).map(e => e.attrs['data-blk'] + '=' + e.attrs['data-blkname']);
    ok(subs.length >= 7 && mvb.length >= 60 && !noName.length, 'P5: every mv block of the whole page (' + mvb.length + ', ' + subs.length + ' parts) has a name in words', noName);
    for (const id of ['mv.top', 'mv.list.bar', 'mv.base.preset', 'mv.hover.rows', 'mv.measure.go', 'mv.measure.bar', 'mv.profile.go', 'mv.profile.toggle', 'mv.p.list', 'mv.p.hover'])
      ok(!!blk(P.root, id), 'P5: the whole page has the block ' + id);
    for (const c of ['ru', 'uk', 'zh']) { const Pc = mkPage({ scripts: [CLIENT].concat(subs.map(f => require('./' + f))), lang: LA, code: c, S: { gameId: 'mowas2', gameOv: '', mod: '', mapKey: '' }, canvas: true, api: routeApi(routes, []) });
      const enOnly = new Set(Object.keys(LA.en).filter(k => LA[c][k] && LA[c][k] !== LA.en[k]).map(k => LA.en[k]));
      const bad = Pc.root.all().filter(e => /^mv/.test(String(e.attrs['data-blk'] || '')) && (!e.attrs['data-blkname'] || /^mapviz\./.test(e.attrs['data-blkname']) || enOnly.has(e.attrs['data-blkname']))).map(e => e.attrs['data-blk'] + '=' + e.attrs['data-blkname']);
      ok(!bad.length, 'P5: block names in ' + c + ' are that language words', bad); }
    const BC = require('../../../test/blockcheck'), bp = BC.checkScreen(P.root, 'mapviz');
    ok(bp.length === 0, 'P5: the whole page keeps the GUI block rule', bp.slice(0, 8));
    // P6: the view area is one column of window height: title, bar, main row; the job line is a strip at the stage bottom
    const top = blk(P.root, 'mv.top'), vb = blk(P.root, 'mv.viewbox'), jl = blk(P.root, 'mv.jobline');
    ok(top && /\bmvtop\b/.test(top.className) && top.children.map(e => e.attrs['data-blk']).join() === 'mv.head,mv.main', 'P6: mv.top holds the head row and the main row', top && top.children.map(e => e.attrs['data-blk']));
    { const hd = blk(P.root, 'mv.head'); ok(hd && hd.children.map(e => e.attrs['data-blk']).join() === 'mv.title,mv.pickbox,mv.mode,mv.phase,mv.side,mv.kind,mv.bar', 'P6: the head row holds the title, the map choice, mode, phase, side, unit kind and the bar', hd && hd.children.map(e => e.attrs['data-blk'])); }
    ok(jl && jl.parentNode === vb && vb.children[vb.children.length - 1] === jl, 'P6: the job line is the last strip of the stage (seen without scrolling)');
    const css = P.doc.body.all().filter(e => e.tagName === 'STYLE' && e.attrs['data-mapviz']).map(e => e.textContent).join('\n');
    ok(/\.mvtop\.blc\{[^}]*height:calc\(100vh - var\(--mvy,calc\(var\(--hdh,34px\) \+ 4px\)\) - 8px\)/.test(css) && /\.mvtop>\.mvmain\.blc\{flex:1 1 auto;min-height:320px\}/.test(css) && /max-width:900px\)\{[^]*\.mvtop\.blc\{height:auto/.test(css), 'P6: the column is the window height, the main row takes the rest (at least 320 px), a narrow window lets it grow', css.slice(0, 300));
    ok(/\.mvmain>\.mvright\{overflow:hidden;display:flex;flex-direction:column/.test(css) && /\.mvright>\.mvcolbar\{flex:0 0 auto;background:var\(--bg\)\}/.test(css) && /\.mvright>\.mvtabp\{flex:1 1 auto;min-height:0;overflow:auto/.test(css)
      && /\.mvright>\.mvtabp>\[data-blk="mv\.filter"\]\{position:sticky;top:0;[^}]*background:var\(--bg\)/.test(css) && /max-width:900px\)\{[^]*\.mvright>\.mvtabp\{overflow:visible/.test(css),
      'P6: the tab row stays put (the tab shown scrolls under it) and the layer filter sticks at the top of its tab; a narrow window lets them flow');
    ok(/\.mvcards\.blc\{[^}]*top:8px;[^}]*bottom:calc\(55% - 8px\)/.test(css) && /\.mvcards>\.mvcard\.blc\{[^}]*max-height:100%;overflow:auto/.test(css), 'P6: a tool card is at most 45 % of the stage high and scrolls inside');
    ok(/\.mvmain\.mvnoleft\{--mvl:0px\}/.test(css) && /\.mvnoleft>\.mvleft,/.test(css) && /\.mvhead\.blc\{gap:4px 8px/.test(css) && /\.mvhead>\.mvtitle,[^{]*\.mvsegf>\.hint\{position:absolute;width:1px/.test(css) && /\.mvpickbtn\{min-width:10em;max-width:16em/.test(css),
      'P6: a folded left column takes no width; the head and the toolbar share one row (title and side, kind lead words for screen readers only, a narrower map button)');
    { const tl0 = blk(P.root, 'mv.title'); ok(/\bmvtitle\b/.test(tl0.className) && tl0.all().some(e => e.tagName === 'H2'), 'P6: the page title stays in the head for screen readers'); }
  }

  // 2j the view area layout: right column tabs, the map picker, side and unit kind buttons, tool cards on the stage, the
  // page keys and their typing guard, the cursor strip, the scale bar, column folds, full screen, Copy link, the job bar
  { const calls = [], ev = { picker: [], map: [], tool: [] };
    for (const k of ['maps.viewer.tab', 'maps.viewer.foldLeft', 'maps.viewer.foldRight']) delete global.LS.m[k];
    let polls = 0, srch = null;
    const DOC = { v: 1, key: 'multi/mv_fixture', modes: [{ id: 'combat' }], boxes: { world: [-600, -440, 600, 440] }, entities: [] };
    const routes = { 'GET /api/x/mapviz/palette': async () => PAL, 'GET /api/x/mapviz/cache': async () => ({ v: 1, root: '<cache>', bytes: 0, cap: 1, entries: 0, jobs: 0 }),
      'GET /api/x/mapviz/doc': async () => DOC,
      'POST /api/x/mapviz/job': async () => ({ id: 'jw', shared: false, state: 'running', queue: 0 }),
      'GET /api/x/mapviz/job': async () => { polls++; return polls < 4 ? { id: 'jw', what: 'water', state: 'running', stage: 'build', done: 1, total: 4, queue: 0 } : { id: 'jw', what: 'water', state: 'done', stage: '', done: 4, total: 4, queue: 0 }; } };
    const part = { id: 'uipart', init(V) {
      V.on('picker', d => ev.picker.push(d.open)); V.on('map', d => ev.map.push(d)); V.on('tool', d => ev.tool.push(d.id));
      V.addPanel({ id: 'list', side: 'left', name: 'Maps', build(box) { const lf = box.doc.createElement('div'); lf.setAttribute('data-blk', 'mv.uilist.bar'); lf.setAttribute('data-blkname', 'Map search'); lf.className = 'blk'; box.appendChild(lf);
        lf.appendChild(box.doc.createElement('button')); srch = box.doc.createElement('input'); srch.setAttribute('type', 'search'); lf.appendChild(srch); } });
      for (const [id, side] of [['hover', 'right'], ['strong', 'right'], ['export', 'bottom'], ['odd', 'right'], ['game', 'left']]) V.addPanel({ id, side, name: 'Panel ' + id, build() {} });
      V.addPanel({ id: 'mine', side: 'right', tab: 'analysis', name: 'My panel', build() {} });
      V.addPanel({ id: 'mt', side: 'bottom', name: 'Measure test', build() {} });   // before its tool
      V.addTool({ id: 'mt', label: 'Measure test', key: 'q', start() {}, end() {} });
      V.addTool({ id: 'pt', label: 'Profile test', key: 'w', start() {}, end() {} });
      V.addPanel({ id: 'pt', side: 'bottom', name: 'Profile test', build(box) { const lf = box.doc.createElement('div'); lf.setAttribute('data-blk', 'mv.pt.title'); lf.setAttribute('data-blkname', 'Profile test'); lf.className = 'blk'; const h3 = box.doc.createElement('h3'); h3.textContent = 'Profile test'; lf.appendChild(h3); box.appendChild(lf); } });   // after its tool; it starts with its own heading
      V.addHover(() => [{ label: 'Height', value: '12 m' }, { label: 'Score', value: L.en['mapviz.shell.notMade'] }, { label: 'Water', value: 'dry' }, { label: 'Pack', value: 'asking', state: true }, { label: 'Build', value: L.en['mapviz.shell.makingRow'].replace('{job}', 'Cover') }]);
      V.addHover(() => [{ label: 'Ground', value: 'grass' }], { quiet: true });   // its own panel says it aloud: the strip only
    } };
    const S = { gameId: 'mowas2', gameOv: '', mod: '', mapKey: '' };
    const P = mkPage({ scripts: [CLIENT], lang: L, S, canvas: true, api: routeApi(routes, calls), parts: [part] }), V = P.V, R = P.root;
    const pane = t => blk(R, 'mv.tab.' + t), inBox = (box, id) => !!box && box.all().includes(blk(R, 'mv.p.' + id));
    // the tab table on the page
    ok(inBox(pane('inspect'), 'hover') && inBox(pane('analysis'), 'strong') && inBox(pane('pictures'), 'export') && inBox(pane('inspect'), 'odd') && inBox(pane('analysis'), 'mine') && inBox(blk(R, 'mv.left'), 'game') && inBox(blk(R, 'mv.picker'), 'list'),
      'tabs: each panel is in its tab (hover Inspect, strong Analysis, export Pictures, an unknown right panel Inspect, the tab option), game in the left column, list in the picker');
    { const pp = pane('pictures'); ok(pp.children[pp.children.length - 1] === blk(R, 'mv.cacheline'), 'tabs: the cache line stays last in the Pictures tab'); }
    { const lp = pane('layers'), top = ['mv.filter', 'mv.markkey', 'mv.views', 'mv.onnow', 'mv.groups'].map(id => blk(R, id));
      ok(top.every(b => b && b.parentNode === lp) && top.every((b, i) => !i || [].indexOf.call(lp.children, top[i - 1]) < [].indexOf.call(lp.children, b)), 'tabs: the Layers tab holds the filter, the mark key, the views, On now and the groups, in that order'); }
    ok(inBox(blk(R, 'mv.tc.mt'), 'mt') && inBox(blk(R, 'mv.tc.pt'), 'pt') && blk(R, 'mv.tc.mt').parentNode === blk(R, 'mv.cards') && !inBox(blk(R, 'mv.bottom'), 'mt') && blk(R, 'mv.cards').parentNode === blk(R, 'mv.viewbox'),
      'tool cards: a tool panel added before or after its tool is a card on the stage, not in the bottom row');
    const tabs = R.all().filter(e => e.attrs.role === 'tab'), tl = R.all().find(e => e.attrs.role === 'tablist');
    const sel = () => tabs.map(b => b.attrs['aria-selected'] === 'true' ? 1 : 0).join(''), shown = () => T.TABS.map(t => pane(t).hidden ? 0 : 1).join('');
    ok(tabs.length === 4 && tabs.map(b => b.children[0].textContent).join() === ['layers', 'inspect', 'analysis', 'pictures'].map(t => L.en['mapviz.shell.tab.' + t]).join() && tabs.every(b => b.attrs['aria-controls'] === 'mvpane-' + b.attrs.id.slice(6)),
      'tabs: four role tab buttons in words, each controls its pane', tabs.map(b => b.textContent));
    ok(tabs.every(b => b.textContent.indexOf('\u25CF') < 0) && R.all().filter(e => e.className === 'mvdot').length === 1 && tabs[1].all().some(e => e.className === 'mvdot' && e.hidden === true && e.textContent === ''),
      'tabs: no tab text holds a dot at load; only Inspect has a dot, hidden and empty', tabs.map(b => b.textContent));
    ok(sel() === '1000' && shown() === '1000' && V.q('tab') === 'layers' && tabs[0].attrs.tabindex === '0' && tabs[1].attrs.tabindex === '-1', 'tabs: Layers shown first (nothing kept yet)', [sel(), shown()]);
    tl.fire('keydown', { key: 'ArrowRight' });
    ok(sel() === '0100' && shown() === '0100' && V.q('tab') === 'inspect' && global.LS.m['maps.viewer.tab'] === 'inspect' && P.doc.activeElement === tabs[1], 'tabs: an arrow moves to the next tab, shows it, keeps it (LS) and focuses it', [sel(), shown(), global.LS.m['maps.viewer.tab']]);
    tl.fire('keydown', { key: 'End' }); tl.fire('keydown', { key: 'ArrowRight' });
    ok(V.q('tab') === 'layers', 'tabs: End goes to the last tab, an arrow past it wraps to the first');
    tabs[2].click();
    ok(V.q('tab') === 'analysis' && global.LS.m['maps.viewer.tab'] === 'analysis', 'tabs: a click shows and keeps the tab');
    ok(V.tab('pictures') === true && V.q('tab') === 'pictures' && global.LS.m['maps.viewer.tab'] === 'analysis' && V.tab('nope') === false, 'V.tab(id) shows a tab without keeping it; an unknown tab is refused');
    V.tab('analysis');
    // the map picker
    const pbtn = blk(R, 'mv.map').all().find(e => e.tagName === 'BUTTON'), pk = blk(R, 'mv.picker');
    ok(pbtn.has(L.en['mapviz.shell.chooseMap']) && pbtn.attrs['aria-haspopup'] === 'dialog' && pk.attrs.role === 'dialog' && pk.hidden === true && V.q('picker') === false, 'picker: the button says Choose a map; the dialog starts closed');
    ok(blk(R, 'mv.first').hidden === false && blk(R, 'mv.first').all().filter(e => e.tagName === 'LI').length === 3, 'first-time help: three steps on the stage while no map is open');
    P.screen.refresh(); await flush();
    ok(V.q('picker') === true && pk.hidden === false && pbtn.attrs['aria-expanded'] === 'true' && ev.picker.join() === 'true' && P.doc.activeElement === srch,
      'picker: shown with no map it opens by itself, emits picker {open: true} and focuses its first field (the search box, not the button before it)', [V.q('picker'), ev.picker, P.doc.activeElement && P.doc.activeElement.tagName]);
    pk.fire('keydown', { key: 'Escape' });
    ok(V.q('picker') === false && pk.hidden === true && pbtn.attrs['aria-expanded'] === 'false' && P.doc.activeElement === pbtn && ev.picker.join() === 'true,false', 'picker: Esc closes it, emits {open: false} and gives the focus back to the button', ev.picker);
    pbtn.click(); ok(V.q('picker') === true && P.doc.activeElement === srch, 'picker: the button opens it');
    P.doc.fire('mousedown', { target: srch }); ok(V.q('picker') === true, 'picker: a press inside it keeps it open');
    { const dlg = P.doc.createElement('dialog'), inner = P.doc.createElement('button'); dlg.appendChild(inner); P.doc.body.appendChild(dlg);
      P.doc.fire('mousedown', { target: inner }); ok(V.q('picker') === true, 'picker: a press in a GUI dialog (Browse of the search box) keeps it open'); }
    P.doc.fire('mousedown', { target: P.doc.body }); ok(V.q('picker') === false && ev.picker.join() === 'true,false,true,false', 'picker: a press outside closes it', ev.picker);
    P.doc.activeElement = P.doc.body;
    ok(P.screen.keys({ key: 'F2', target: P.doc.body }) === true && V.q('picker') === true, 'picker: F2 opens it');
    ok(P.screen.keys({ key: 'F2', target: srch }) === true && V.q('picker') === false && P.doc.activeElement === pbtn, 'picker: F2 from its own search box closes it');
    pbtn.click(); const nMap = ev.map.length;
    V.emit('map', { key: 'multi/mv_fixture', mode: 'combat', pick: true }); await until(() => V.doc, 5000); await flush();
    ok(V.q('map') === 'multi/mv_fixture' && V.q('picker') === false && P.doc.activeElement === pbtn && ev.picker[ev.picker.length - 1] === false, 'picker: a map the user picks closes it, the focus back on the button');
    ok(pbtn.has('multi/mv_fixture') && !pbtn.has(L.en['mapviz.shell.chooseMap']) && blk(R, 'mv.first').hidden === true, 'the button shows the map name; the first-time help hides with a map open');
    ok(ev.map.length > nMap && ev.map.slice(nMap).every(d => !d.pick), 'mv.list.maps still works: the pick form opens the map and parts get the plain map event');
    // side and unit kind: button groups; a press sends the same 'map' form as the old selects
    const segB = (id, k) => blk(R, 'mv.' + id).all().find(e => e.tagName === 'BUTTON' && e.textContent === L.en['mapviz.shell.' + id + '.' + k]);
    ok(['a', 'b', 'both'].every(k => !!segB('side', k)) && ['inf', 'mg', 'at', 'tank'].every(k => !!segB('kind', k)) && blk(R, 'mv.side').all().some(e => e.attrs.role === 'group'), 'side and unit kind: one button per value in a role group');
    ok(segB('side', 'both').attrs['aria-pressed'] === 'true' && segB('kind', 'inf').attrs['aria-pressed'] === 'true' && segB('side', 'a').attrs['aria-pressed'] === 'false', 'side and unit kind: the value now is pressed');
    let n0 = ev.map.length; segB('side', 'a').click(); const m1 = ev.map[ev.map.length - 1];
    ok(ev.map.length === n0 + 1 && JSON.stringify(Object.keys(m1)) === JSON.stringify(['key', 'mode', 'phase', 'side', 'kind', 'doc', 'user']) && m1.side === 'a' && m1.kind === 'inf' && m1.key === 'multi/mv_fixture' && m1.mode === 'combat' && m1.doc === V.doc && V.q('side') === 'a',
      'side: a press sends one map event of the same form {key, mode, phase, side, kind, doc, user}', m1 && Object.keys(m1));
    ok(segB('side', 'a').attrs['aria-pressed'] === 'true' && segB('side', 'both').attrs['aria-pressed'] === 'false', 'side: the pressed button follows');
    n0 = ev.map.length; segB('side', 'a').click(); ok(ev.map.length === n0, 'side: the same value again sends nothing');
    segB('kind', 'tank').click(); const m2 = ev.map[ev.map.length - 1];
    ok(m2.kind === 'tank' && m2.side === 'a' && V.q('kind') === 'tank' && segB('kind', 'tank').attrs['aria-pressed'] === 'true' && segB('kind', 'inf').attrs['aria-pressed'] === 'false', 'unit kind: a press sends the map event with the kind');
    // tool cards: shown only while their tool is in use
    const cMt = blk(R, 'mv.tc.mt'), cPt = blk(R, 'mv.tc.pt'), tbtn = t => blk(R, 'mv.bar').all().find(e => e.tagName === 'BUTTON' && e.textContent === t);
    ok(cMt.hidden === true && cPt.hidden === true && cMt.attrs.role === 'region' && !!blk(R, 'mv.tc.mt.head'), 'tool cards: hidden while no tool is in use');
    { const tt = c => c.all().find(e => e.className === 'mvcardt'), xb = c => blk(R, c.attrs['data-blk'] + '.head').all().find(e => e.tagName === 'BUTTON');
      ok(tt(cMt).hidden !== true && !/\bmvown\b/.test(cMt.className), 'tool cards: a panel with no heading of its own shows the card title');
      ok(tt(cPt).hidden === true && /\bmvown\b/.test(cPt.className) && cPt.attrs['aria-label'] === 'Profile test' && !!xb(cPt) && cPt.all().filter(e => /^H[1-6]$/.test(e.tagName) || (e.className === 'mvcardt' && e.hidden !== true)).length === 1,
        'tool cards: a panel that starts with its own heading shows one title (its heading); the card keeps its close button and aria-label'); }
    tbtn('Measure test').click();
    ok(cMt.hidden === false && cPt.hidden === true && ev.tool[ev.tool.length - 1] === 'mt', 'tool cards: a tool in use shows its card only');
    const canvas = R.all().find(e => e.tagName === 'CANVAS');
    canvas.fire('keydown', { key: 'w' });
    ok(cMt.hidden === true && cPt.hidden === false && ev.tool[ev.tool.length - 1] === 'pt', 'tool cards: another tool swaps the card');
    blk(R, 'mv.tc.pt.head').all().find(e => e.tagName === 'BUTTON').click();
    ok(cMt.hidden === true && cPt.hidden === true && ev.tool[ev.tool.length - 1] === null && P.doc.activeElement === canvas, 'tool cards: the close button ends the tool and focuses the map');
    tbtn('Measure test').click(); canvas.fire('keydown', { key: 'Escape' });
    ok(cMt.hidden === true && ev.tool[ev.tool.length - 1] === null, 'tool cards: Esc on the map ends the tool and hides its card');
    // the cursor strip and the scale bar
    P.screen.view('mowas2~multi/mv_fixture~combat~~0,0,1'); await flush(); P.V.redraw(); await flush();
    const strip = blk(R, 'mv.strip');
    ok(V.view.zoom === 1 && strip.attrs['aria-hidden'] === 'true' && strip.textContent === L.en['mapviz.shell.stripHint'], 'cursor strip: aria-hidden; the hint while the pointer is not on the map', strip.textContent);
    canvas.fire('mousemove', { clientX: 420, clientY: 280 });
    ok(strip.textContent === 'x 1.0 m, y 1.0 m  \u00B7  Height: 12 m  \u00B7  Water: dry  \u00B7  Ground: grass', 'cursor strip: x, y in metres and the value rows in provider order; a state row (not made, being made, state: true) is left out, a quiet provider is in', strip.textContent);
    ok(blk(R, 'mv.readout').has('Height: 12 m') && /\bmvsr\b/.test(blk(R, 'mv.readout').className), 'the readout keeps the same rows for screen readers');
    ok(blk(R, 'mv.readout').has('Score: ' + L.en['mapviz.shell.notMade']) && blk(R, 'mv.readout').has('Pack: asking') && !blk(R, 'mv.readout').has('Ground'), 'the readout keeps the state rows; a quiet provider is not in it', blk(R, 'mv.readout').textContent);
    canvas.fire('mouseleave', {}); ok(strip.textContent === L.en['mapviz.shell.stripHint'], 'cursor strip: the hint when the pointer leaves the map');
    canvas.fire('mousemove', { clientX: 400 + 700, clientY: 300 }); ok(strip.textContent === L.en['mapviz.shell.stripHint'], 'cursor strip: the hint outside the world box');
    canvas.fire('mousemove', { clientX: 420, clientY: 280 });
    const texts = []; canvas._ctx.fillText = function (t, x, y) { texts.push([t, x, y]); }; P.log.length = 0; P.V.redraw(); await flush();
    ok(texts.some(t => t[0] === '5 m' && t[1] === 12) && P.log.some(c => c.op === 'lineTo' && c.args[0] === 112), 'scale bar: 5 m, 100 px at the bottom left for zoom 1', texts);
    // double-click zooms at the pointer (Shift: out)
    canvas.fire('dblclick', { clientX: 400, clientY: 300 }); ok(V.view.zoom === 2, 'double-click zooms in at the pointer', V.view);
    canvas.fire('dblclick', { clientX: 400, clientY: 300, shiftKey: true }); ok(V.view.zoom === 1, 'Shift+double-click zooms out', V.view);
    // the page keys and their typing guard
    P.doc.activeElement = P.doc.body;
    const main = blk(R, 'mv.main'), cls = c => main.className.split(' ').includes(c);
    for (const tag of ['input', 'select', 'textarea']) { const f = P.doc.createElement(tag); ok(P.screen.keys({ key: '[', target: f }) === false && !cls('mvnoleft'), 'keys: [ does nothing while typing in a ' + tag); }
    { const f = P.doc.createElement('input'); P.doc.body.appendChild(f); f.focus(); ok(P.screen.keys({ key: ']', target: P.doc.body }) === false && !cls('mvnoright'), 'keys: nothing while the focus is in a field'); P.doc.activeElement = P.doc.body; }
    ok(P.screen.keys({ key: '[', target: P.doc.body, ctrlKey: true }) === false && P.screen.keys({ key: '[', target: canvas }) === false && !cls('mvnoleft'), 'keys: not with Ctrl; the map keys come from the canvas itself');
    const fL = blk(R, 'mv.bar').all().find(e => e.tagName === 'BUTTON'), fR = blk(R, 'mv.tabs').all().find(e => e.tagName === 'BUTTON');
    ok(fL && fL.className === 'mvcolfold' && blk(R, 'mv.bar').children[0] === fL && !blk(R, 'mv.left.fold') && blk(R, 'mv.bar').parentNode === blk(R, 'mv.head'), 'head: the left column fold button is the toolbar first item (no row of its own in the left column)');
    ok(fL.attrs['aria-expanded'] === 'true' && fL.attrs['aria-label'] === L.en['mapviz.shell.foldLeft'] && fR.attrs['aria-label'] === L.en['mapviz.shell.foldRight'], 'folds: one button per side column, open');
    ok(P.screen.keys({ key: '[', target: P.doc.body }) === true && cls('mvnoleft') && global.LS.m['maps.viewer.foldLeft'] === true && fL.attrs['aria-expanded'] === 'false' && fL.attrs['aria-label'] === L.en['mapviz.shell.unfoldLeft'], 'keys: [ folds the left column and keeps it (LS)');
    canvas.fire('keydown', { key: ']' }); ok(cls('mvnoright') && global.LS.m['maps.viewer.foldRight'] === true, 'keys: ] on the map folds the right column');
    fR.click(); ok(!cls('mvnoright') && global.LS.m['maps.viewer.foldRight'] === false, 'folds: the button unfolds it again');
    const fullB = blk(R, 'mv.bar').all().find(e => e.tagName === 'BUTTON' && e.textContent === L.en['mapviz.shell.full']), top = blk(R, 'mv.top');
    ok(P.screen.keys({ key: 'f', target: P.doc.body }) === true && /\bmvfull\b/.test(top.className) && fullB.attrs['aria-pressed'] === 'true', 'keys: f fills the window (no Fullscreen API here: the mvfull class)');
    ok(P.screen.keys({ key: 'Escape', target: P.doc.body }) === true && !/\bmvfull\b/.test(top.className) && fullB.attrs['aria-pressed'] === 'false', 'keys: Esc leaves the window fill');
    fullB.click(); ok(/\bmvfull\b/.test(top.className), 'the Full screen button fills too'); fullB.click();
    const keysL = blk(R, 'mv.keys'); ok(P.screen.keys({ key: '?', target: P.doc.body }) === true && keysL.hidden === false, 'keys: ? shows the key list');
    const kb = keysL.all().filter(e => e.tagName === 'KBD').map(e => e.textContent);
    ok(['F2', '[ ]', 'F', 'Double-click'].every(k => kb.includes(k)) && keysL.has(L.en['mapviz.shell.key.picker']) && keysL.has(L.en['mapviz.shell.key.fold']), 'the key list names F2, [ ], F and Double-click', kb);
    P.screen.keys({ key: '?', target: P.doc.body });
    { const P2 = mkPage({ scripts: [CLIENT], lang: L, S: { gameId: 'mowas2', gameOv: '', mod: '', mapKey: '' }, canvas: true, api: routeApi(routes, []), parts: [] });
      ok(P2.V.q('tab') === 'analysis' && blk(P2.root, 'mv.tab.analysis').hidden === false && /\bmvnoleft\b/.test(blk(P2.root, 'mv.main').className) && !/\bmvnoright\b/.test(blk(P2.root, 'mv.main').className), 'a new page keeps the tab and the column folds the user chose'); }
    // Copy link: no clipboard here, so the field shows selected to copy by hand
    const link = blk(R, 'mv.bar').all().find(e => e.tagName === 'INPUT' && e.attrs.type === 'text'), cBtn = blk(R, 'mv.bar').all().find(e => e.tagName === 'BUTTON' && e.textContent === L.en['mapviz.shell.copy']);
    ok(!!cBtn && link.hidden === true && /^#go=page%3Amapviz/.test(link.value), 'Copy link: one button, the link field hidden', link.value);
    cBtn.click(); ok(link.hidden === false && blk(R, 'mv.say').has(L.en['mapviz.shell.copyHand']), 'Copy link: with no clipboard the field shows to copy by hand');
    // the job bar
    const prog = blk(R, 'mv.jobline').all().find(e => e.tagName === 'PROGRESS');
    ok(prog && prog.hidden === true, 'job bar: hidden with no job');
    V.job('water', {}).catch(() => {}); await until(() => prog.hidden === false, 5000);
    ok(prog.hidden === false && Number(prog.max) === 4 && Number(prog.value) === 1, 'job bar: shows done of total while a job runs', [prog.max, prog.value]);
    await until(() => prog.hidden === true, 5000); ok(prog.hidden === true, 'job bar: gone when the job is done');
    const bc = require('../../../test/blockcheck').checkScreen(R, 'mapviz'); ok(bc.length === 0, 'layout: the GUI block rule holds with tabs, picker and cards', bc.slice(0, 6));
  }

  // ---------- 3 routes with a stub jobs module ----------
  const R = SERVER.routes, ST = SERVER._t;
  const call = async (method, p, body) => { const r = R[method + ' /api/x/mapviz/' + p.split('?')[0]]; if (!r) return { e: { message: 'no route' } }; try { return { v: await r(new URL('/api/x/mapviz/' + p, 'http://x'), body === undefined ? null : body, {}) }; } catch (e) { return { e }; } };
  const shape = (e, status, code) => e && e.status === status && e.message === code && e.key === 'mapviz.err.' + code && e.params && typeof e.params.msg === 'string';
  { const sdir = path.join(SCR, 'stub', 'doc'); fs.mkdirSync(sdir, { recursive: true });
    fs.writeFileSync(path.join(sdir, 'mapdoc.json'), JSON.stringify({ v: 1, key: 'multi/s', boxes: { world: [-1, -1, 1, 1], auto: [-1, -1, 1, 1], camera: [0, 0, 1, 1], pather: [0, 0, 1, 1], named: [{ name: '[auto]' }, { name: 'west', world: [-1, -1, 0, 0] }] },
      modes: [{ id: 'm1', spawns: [{ name: 's', team: 'a', order: 1, x: 1, y: 2, z: null, yaw: 0, phase: 0 }, { name: 's2', team: 'b', order: 1, x: 3, y: 4, z: null, yaw: 0, phase: 1 }], flags: [] }, { id: 'm2', spawns: [{ name: 'q', team: 'b', order: 1, x: 0, y: 0, z: null, yaw: 0 }], flags: [] }], entities: [{ def: 'x' }] }));
    const subs = [], jobsMap = { j1: { id: 'j1', what: 'topo', state: 'running', stage: 'cut', done: 1, total: 4, elapsed: 1, queue: 0 } };
    const runner = { submit(b) { subs.push(b); return { id: 'j2', shared: false, state: 'queued', queue: 1 }; }, status: id => jobsMap[id] || null, cancel(id) { if (jobsMap[id]) jobsMap[id].state = 'cancelled'; return true; }, list: () => ({ running: [], queued: [], done: [] }) };
    let busy = false;
    const cache = { entryKey: o => 'k_' + o.what, open: k => (k === 'k_doc' ? { dir: sdir, manifest: {} } : null), stats: () => ({ v: 1, root: '<cache>', bytes: 0, cap: 1, entries: 0, jobs: 0 }),
      clear(s) { if (busy) { const e = new Error('busy'); e.code = 'MV_BUSY'; throw e; } return { removed: 2, bytes: 10, scope: s }; } };
    ST.use({ runner, cache });
    let r = await call('GET', 'maps'); ok(shape(r.e, 400, 'MV_USAGE'), 'missing target -> 400 MV_USAGE (refused)', r.e);
    r = await call('GET', 'maps?target=mowas2&foo=1'); ok(shape(r.e, 400, 'MV_USAGE') && /foo/.test(r.e.params.msg), 'unknown route argument -> 400 MV_USAGE', r.e);
    r = await call('GET', 'maps?target=mowas2'); ok(shape(r.e, 404, 'MV_NOT_FOUND') && JSON.stringify(r.e.params.need) === '{"what":"maps","args":{}}', 'maps not made -> 404 need maps', r.e && r.e.params);
    r = await call('GET', 'doc?target=mowas2&map=multi/s&entities=0'); ok(r.v && r.v.entities.length === 0 && r.v.modes.length === 2, 'doc entities=0 strips entities');
    r = await call('GET', 'doc?target=mowas2&map=multi/s&entities=2'); ok(shape(r.e, 400, 'MV_USAGE'), 'doc entities must be 0 or 1');
    r = await call('GET', 'doc?target=mowas2'); ok(shape(r.e, 400, 'MV_USAGE'), 'doc without a map is refused');
    r = await call('GET', 'layer?target=mowas2&map=multi/s&name=spawns&mode=m1');
    eq(r.v && r.v.items.map(i => i.name), ['s', 's2'], 'spawns of one mode');
    r = await call('GET', 'layer?target=mowas2&map=multi/s&name=spawns&mode=m1&phase=1'); eq(r.v && r.v.items.map(i => i.name), ['s2'], 'spawns of one phase');
    r = await call('GET', 'layer?target=mowas2&map=multi/s&name=boxes');
    eq(r.v && r.v.items.map(i => i.box + ':' + i.clip), ['world:null', 'auto:[auto]', 'camera:[auto]', 'pather:[auto]', 'world:west'], 'boxes: map boxes, the default clip, then named clips');
    ok(r.v && r.v.pal === 'masks' && r.v.palette && r.v.palette.outsideWorld, 'vector envelope carries its palette part');
    r = await call('GET', 'layer?target=mowas2&map=multi/s&name=water.band&mode=m1'); ok(shape(r.e, 404, 'MV_NOT_FOUND') && r.e.params.need.what === 'water' && r.e.params.need.args.mode === 'm1' && r.e.params.need.args.map === 'multi/s', 'layer not made -> need with the job key fields', r.e && r.e.params);
    r = await call('GET', 'layer?target=mowas2&map=multi/s&name=pass.tank&kind=tank'); ok(shape(r.e, 404, 'MV_NOT_FOUND') && r.e.params.need.what === 'pass' && r.e.params.need.args.kind === 'tank', 'pass.<kind> layer -> need pass with kind');
    r = await call('GET', 'layer?target=mowas2&map=multi/s&name=pic.topo'); ok(shape(r.e, 400, 'MV_USAGE'), 'a picture is not a layer');
    r = await call('GET', 'layer?target=mowas2&map=multi/s&name=nothing'); ok(shape(r.e, 400, 'MV_USAGE'), 'an unknown layer name');
    r = await call('POST', 'job', { what: 'topo', target: 'mowas2', map: 'multi/s', size: 512 }); ok(r.v && r.v.id === 'j2' && r.v.shared === false && r.v.state === 'queued' && r.v.queue === 1 && subs.length === 1 && subs[0].size === 512, 'POST job -> {id, shared, state, queue}', r);
    r = await call('POST', 'job', { what: 'topo', map: 'multi/s' }); ok(shape(r.e, 400, 'MV_USAGE') && subs.length === 1, 'POST job without a target is refused before the runner');
    r = await call('POST', 'job', { what: 'topo', target: 'mowas2', bogus: 1 }); ok(shape(r.e, 400, 'MV_USAGE'), 'POST job with an unknown field');
    r = await call('GET', 'job?id=j1'); ok(r.v && r.v.state === 'running' && r.v.done === 1, 'GET job');
    r = await call('GET', 'job?id=nope'); ok(shape(r.e, 404, 'MV_NOT_FOUND'), 'GET job unknown -> 404');
    r = await call('POST', 'cancel', { id: 'nope' }); ok(shape(r.e, 404, 'MV_NOT_FOUND'), 'cancel unknown -> 404');
    r = await call('POST', 'cancel', { id: 'j1' }); eq(r.v, { id: 'j1', state: 'cancelled' }, 'cancel -> {id, state}');
    r = await call('GET', 'jobs'); ok(r.v && Array.isArray(r.v.running), 'GET jobs');
    r = await call('GET', 'cache'); ok(r.v && r.v.v === 1 && r.v.root === '<cache>', 'GET cache');
    r = await call('POST', 'cache/clear', { scope: 'map' }); ok(shape(r.e, 400, 'MV_USAGE'), 'cache/clear map needs a map');
    r = await call('POST', 'cache/clear', { scope: 'map', map: 'multi/s', target: 'mowas2' }); eq(r.v, { removed: 2, bytes: 10 }, 'cache/clear -> {removed, bytes}');
    busy = true; r = await call('POST', 'cache/clear', { scope: 'all' }); ok(shape(r.e, 409, 'MV_BUSY'), 'cache/clear while a job runs -> 409 MV_BUSY'); busy = false;
    r = await call('GET', 'tiles?target=mowas2&map=multi/s&base=topo&z=0&t=' + Array.from({ length: 17 }, (x, i) => i + '.0').join(',')); ok(shape(r.e, 400, 'MV_USAGE'), 'more than 16 tiles -> 400');
    r = await call('GET', 'tiles?target=mowas2&map=multi/s&base=topo&z=0&t=0.0'); ok(shape(r.e, 404, 'MV_NOT_FOUND') && r.e.params.need.what === 'topo', 'tiles not made -> need topo');
    r = await call('GET', 'tiles?target=mowas2&map=multi/s&base=nopic&z=0&t=0.0'); ok(shape(r.e, 400, 'MV_USAGE'), 'tiles of an unknown picture');
    r = await call('GET', 'palette'); ok(r.v === PAL, 'GET palette');
    r = await call('GET', 'palette?x=1'); ok(shape(r.e, 400, 'MV_USAGE'), 'GET palette takes no argument');
    // hover sampling (README 5.6): the step k keeps the block at most 2097152 cells; every k-th cell from 0
    eq([ST.stepOf(1448, 1448), ST.stepOf(1449, 1449), ST.stepOf(2896, 2896), ST.stepOf(2897, 2896), ST.stepOf(4096, 1)], [1, 2, 2, 3, 1], 'hover step from the grid size');
    { const b8 = Buffer.from(Array.from({ length: 15 }, (x, i) => i));
      eq(Array.from(ST.sampled(b8, { grid: { w: 5, h: 3 }, hdrBytes: 0, dataBytes: 15 }, 2)), [0, 2, 4, 10, 12, 14], 'hover sampling k=2 of a 5 x 3 u8 grid');
      const hb = Buffer.alloc(4 + 30); for (let i = 0; i < 15; i++) hb.writeUInt16LE(1000 + i, 4 + i * 2);
      const s16 = ST.sampled(hb, { grid: { w: 5, h: 3 }, hdrBytes: 4, dataBytes: 30 }, 2);
      eq(Array.from({ length: s16.length / 2 }, (x, i) => s16.readUInt16LE(i * 2)), [1000, 1002, 1004, 1010, 1012, 1014], 'hover sampling k=2 of a 5 x 3 u16 grid after a header');
      eq(Array.from(ST.sampled(b8, { grid: { w: 5, h: 3 }, hdrBytes: 0, dataBytes: 15 }, 3)), [0, 3], 'hover sampling k=3 (ceil 5/3 x ceil 3/3)');
      ok(ST.sampled(b8, { grid: { w: 5, h: 3 }, hdrBytes: 0, dataBytes: 15 }, 1).length === 15, 'hover sampling k=1 is the whole block'); }
    eq(ST.needOf('pass', { target: 'mowas2', game: 'g', modDirs: ['m'], map: 'multi/s', mode: 'm1', kind: 'tank', side: 'a', size: 9 }), { what: 'pass', args: { map: 'multi/s', mode: 'm1', kind: 'tank' } }, 'a need holds the map and the job own key fields only');
    eq([ST.whatOfLayer('height'), ST.whatOfLayer('objects'), ST.whatOfLayer('cost.at', 'at'), ST.whatOfLayer('pass.at'), ST.whatOfLayer('contours'), ST.whatOfLayer('tiles/topo')], ['grids', 'entcat', 'pass', null, 'topo', null], 'the job of a layer name from the table products');
    r = await call('GET', 'parts'); ok(r.v && r.v.v === 1 && r.v.parts.length > 5 && r.v.parts.every(p => ['built', 'not built', 'broken'].includes(p.state)) && r.v.styles.map(s => s.id).join() === 'staff,painted,recon,sketch', 'GET parts', r.v);
    ST.reset();
  }
  // 3b waves C and D (jobs.md 5): the request fields phase, at, pose, light; layers through `also`; sight.rings (R-a);
  // GET json; the lib export; the new palette parts
  { const ent = path.join(SCR, 'stub', 'cd'); fs.mkdirSync(ent, { recursive: true });
    fs.writeFileSync(path.join(ent, 'strong.a.inf.threat.json'), JSON.stringify({ kind: 'vector', items: [{ x: 1, y: 2 }] }));
    fs.writeFileSync(path.join(ent, 'sight.rings.json'), JSON.stringify({ kind: 'vector', items: [{ x: 3, y: 4, r: 50 }] }));
    fs.writeFileSync(path.join(ent, 'sight.view.json'), JSON.stringify({ kind: 'vector', items: [{ x: 9, y: 9, r: 1 }] }));   // a planted old name: never read
    fs.writeFileSync(path.join(ent, 'sight.json'), JSON.stringify({ v: 1, rings: [50, 100] }));
    fs.writeFileSync(path.join(ent, 'pic.l2.json'), JSON.stringify({ v: 1, w: 9 }));
    const subs = [], opened = [], made = new Set(['strong', 'view', 'sight', 'l2']);
    const runner = { submit(b) { subs.push(b); return { id: 'j9', shared: false, state: 'queued', queue: 0 }; }, status: () => null, cancel: () => false, list: () => ({ running: [], queued: [], done: [] }) };
    const cache = { entryKey: o => { opened.push(o); return 'k_' + o.what; }, open: k => (made.has(k.slice(2)) ? { dir: ent, manifest: {} } : null), stats: () => ({}), clear: () => ({}) };
    ST.use({ runner, cache });
    const F = ST.fieldsOf, bad = [];
    for (const q of [{ phase: '1.5' }, { phase: '100' }, { phase: '-1' }, { at: '1' }, { at: 'a,b' }, { at: '1,2,3' }, { pose: 'crouch' }, { light: 'dusk' }])
      { try { F(q); bad.push(q); } catch (e) { if (e.message !== 'MV_USAGE') bad.push(q); } }
    ok(!bad.length, 'fieldsOf refuses a bad phase, at, pose or light with MV_USAGE', bad);
    eq(F({ phase: '3', at: '10.123,-4', pose: 'prone', light: 'mode' }), { phase: 3, at: '10.12,-4', pose: 'prone', light: 'mode' }, 'fieldsOf: phase a number, at rounded to 2 decimals, pose and light kept');
    eq(F({}), {}, 'fieldsOf: nothing asked, nothing set');
    let r = await call('POST', 'job', { what: 'view', target: 'mowas2', map: 'multi/s', mode: 'm1', at: '5,6', pose: 'kneel' });
    ok(r.v && r.v.id === 'j9' && subs[0] && subs[0].at === '5,6' && subs[0].pose === 'kneel', 'POST job carries at and pose to the runner', subs[0]);
    r = await call('POST', 'job', { what: 'l4', target: 'mowas2', map: 'multi/s', light: 'clean', phase: 2 });
    ok(r.v && subs[1] && subs[1].light === 'clean' && subs[1].phase === 2, 'POST job carries light and phase', subs[1]);
    r = await call('POST', 'job', { what: 'view', target: 'mowas2', map: 'multi/s', pose: 'lying' }); ok(shape(r.e, 400, 'MV_USAGE') && subs.length === 2, 'POST job with a bad pose is refused before the runner');
    r = await call('GET', 'layer?target=mowas2&map=multi/s&name=spawns&phase=x'); ok(shape(r.e, 400, 'MV_USAGE'), 'GET layer with a bad phase');
    eq([ST.whatOfLayer('strong.a.inf.threat', 'inf'), ST.whatOfLayer('strong.a.inf.threat', 'tank'), ST.kindOfLayer('strong.a.inf.threat', 'tank'), ST.whatOfLayer('sight.rings'), ST.whatOfLayer('cover.band'), ST.whatOfLayer('route.a.inf', 'inf')],
      ['strong', null, 'inf', 'view', 'cover', 'routes'], 'whatOfLayer: products, the also patterns of the kind, sight.rings a product of view; kindOfLayer finds the other kind');
    ok(require('../../../../mapviz/jobs/table').JOBS.view.products.includes('sight.rings.json') && !require('../../../../mapviz/jobs/table').JOBS.view.products.includes('sight.view.json') && ['doc', 'grids', 'entcat', 'sight'].every(n => require('../../../../mapviz/jobs/table').JOBS.view.needs.includes(n)), 'job row view lists sight.rings.json and needs doc, grids, entcat, sight (R-a)', require('../../../../mapviz/jobs/table').JOBS.view);
    r = await call('GET', 'layer?target=mowas2&map=multi/s&name=strong.a.inf.threat&mode=m1&kind=inf&phase=1');
    ok(r.v && r.v.kind === 'vector' && r.v.items.length === 1 && opened.some(o => o.what === 'strong' && o.phase === 1), 'GET layer finds a strong layer through also, with the phase in the entry key', r.e || opened.slice(-1));
    r = await call('GET', 'layer?target=mowas2&map=multi/s&name=strong.a.inf.threat&kind=tank'); ok(shape(r.e, 400, 'MV_USAGE') && /unit kind inf/.test(r.e.params.msg), 'GET layer of another unit kind -> 400 naming the kind', r.e && r.e.params);
    r = await call('GET', 'layer?target=mowas2&map=multi/s&name=sight.rings&mode=m1&at=3,4&pose=stand');
    ok(r.v && r.v.name === 'sight.rings' && r.v.items[0].r === 50 && opened.some(o => o.what === 'view' && o.at === '3,4' && o.pose === 'stand'), 'GET layer sight.rings reads the view product sight.rings.json, at and pose in the key', r.e || r.v);
    for (const t of ['as64', 'goh']) { r = await call('GET', 'layer?target=' + t + '&map=multi/s&name=sight.rings&mode=m1&at=3,4');
      ok(r.v && r.v.target === t && r.v.items.length === 1 && r.v.items[0].r === 50, 'GET layer sight.rings on ' + t + ' reads sight.rings.json the same way', r.e || r.v); }
    r = await call('GET', 'json?target=mowas2&map=multi/s&name=sight&mode=m1'); eq(r.v, { v: 1, rings: [50, 100] }, 'GET json sight answers the stored product');
    r = await call('GET', 'json?target=mowas2&map=multi/s&name=pic.l2&mode=m1'); eq(r.v, { v: 1, w: 9 }, 'GET json pic.l2 answers the picture sidecar of the l2 entry');
    r = await call('GET', 'json?target=mowas2&map=multi/s&name=routes&mode=m1'); ok(shape(r.e, 404, 'MV_NOT_FOUND') && r.e.params.need.what === 'routes', 'GET json not made -> 404 need routes', r.e && r.e.params);
    r = await call('GET', 'json?target=mowas2&map=multi/s&name=nothing'); ok(shape(r.e, 400, 'MV_USAGE'), 'GET json of an unknown name');
    r = await call('GET', 'json?target=mowas2&map=multi/s'); ok(shape(r.e, 400, 'MV_USAGE'), 'GET json without a name');
    r = await call('GET', 'json?target=mowas2&map=multi/s&name=strong.tank&kind=inf'); ok(shape(r.e, 400, 'MV_USAGE') && /unit kind tank/.test(r.e.params.msg), 'GET json of another unit kind names the kind', r.e && r.e.params);
    const LIB = SERVER.lib;
    ok(LIB && ['fail', 'wrap', 'query', 'bodyOf', 'request', 'fieldsOf', 'entry', 'needOf', 'readJson', 'palOf', 'palPart', 'whatOfLayer', 'whatOfJson', 'whatOfTiles', 'gridEnvelope', 'vectorEnvelope', 'runner', 'mod', 'partBuilt'].every(k => typeof LIB[k] === 'function') && LIB.COMMON.includes('light') && LIB.BODY_JOB.includes('pose') && LIB.STATUS.MV_USAGE === 400, 'the lib export holds the shared helpers for part servers');
    ok(['phase', 'at', 'pose', 'light'].every(k => LIB.COMMON.includes(k) && LIB.BODY_JOB.includes(k)), 'COMMON and BODY_JOB take phase, at, pose, light');
    const pals = { 'sight.grid': 'height', 'sight.field': 'sight', 'sight.rings': 'sight', 'sight.fire': 'sight.fire', 'cover.band': 'cover.bands', 'cover.points': 'cover', 'routes': 'pass.route', 'strong.checks': 'checks', 'objects': 'objects', 'l2.n': null, 'strong.a.inf.danger': 'danger', 'strong.a.inf.score': 'strong', 'obst.tank': 'pass.codes' };
    const badP = Object.keys(pals).filter(n => ST.palOf ? ST.palOf(n) !== pals[n] : LIB.palOf(n) !== pals[n]);
    ok(!badP.length, 'palette parts of the wave C and D layers', badP.map(n => n + '=' + LIB.palOf(n)));
    const pathOk = p => p == null || p.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), PAL) !== undefined;
    ok(Object.values(pals).every(pathOk), 'every palette part named is in palette.json', Object.values(pals).filter(p => !pathOk(p)));
    // JOBS (tools/gui/README.md): a queued or running runner job is one bg job of the GUI job list, told by runner.watch
    { const reg = require('../../../joblist').create({ keepMs: 600000 }), cancels = [];
      let wf = null, watched = 0;
      const r2 = Object.assign({}, runner, { watch(fn) { wf = fn; watched++; return () => {}; }, cancel(id) { cancels.push(id); return true; }, status: id => ({ id, state: 'running' }) });
      ST.use({ runner: r2, cache });
      const post = (p, b) => R['POST /api/x/mapviz/' + p](new URL('/api/x/mapviz/' + p, 'http://x'), b, { jobs: reg });
      await post('job', { what: 'topo', target: 'goh', map: 'multi/s' });
      await post('job', { what: 'topo', target: 'goh', map: 'multi/s' });
      ok(typeof wf === 'function' && watched === 1, 'JOBS: the runner is watched once', watched);
      const E = o => Object.assign({ id: 'j2', what: 'topo', state: 'queued', stage: '', done: 0, total: 0, target: 'goh', map: 'multi/s' }, o || {});
      wf(E()); wf(E());
      let l = reg.list();
      ok(l.length === 1 && l[0].kind === 'bg' && l[0].what === 'job.w.mapviz' && l[0].whatP.map === 'multi/s' && l[0].page === 'mapviz' && l[0].game === 'goh' && l[0].state === 'running' && l[0].canCancel === true && l[0].writes === false,
        'JOBS: one bg job per runner job (an identical request shares it)', l);
      ok(l[0].stage === 'mapviz.shell.stage.wait' && l[0].done === null && l[0].total === null && !!LANG.en[l[0].stage], 'JOBS: a queued job shows the waiting stage, no count', l[0]);
      wf(E({ state: 'running', stage: 'tiles', done: 3, total: 8 }));
      l = reg.list();
      eq([l[0].stage, l[0].done, l[0].total, l[0].state], ['mapviz.shell.stage.tiles', 3, 8, 'running'], 'JOBS: stage, done and total follow the runner job');
      wf(E({ state: 'running', stage: 'zzz', done: 0, total: 0 }));
      eq([reg.list()[0].stage, reg.list()[0].total], ['zzz', null], 'JOBS: a stage with no words of its own stays as it is');
      ok(reg.cancel(l[0].id) === true && cancels.join() === 'j2', 'JOBS: the footer Cancel stops the runner job', cancels);
      await post('cancel', { id: 'j2' });
      eq(cancels, ['j2', 'j2'], 'JOBS: POST cancel ends in the same stop');
      eq(reg.list()[0].state, 'running', 'JOBS: a cancelled job stays running until the runner ends it');
      wf(E({ state: 'cancelled' }));
      eq([reg.list()[0].state, ST.bg.size], ['cancelled', 0], 'JOBS: the runner end ends the job');
      wf(E({ id: 'j3', what: 'maps', map: null, target: 'mowas2' }));
      l = reg.list();
      ok(l.length === 2 && l[1].what === 'job.w.mapslist' && l[1].whatP === null && l[1].game === 'mowas2', 'JOBS: the map list job has its own name', l[1]);
      wf(E({ id: 'j3', what: 'maps', map: null, state: 'timeout' }));
      eq(reg.list()[1].state, 'timeout', 'JOBS: timeout ends timeout');
      for (const s of ['done', 'failed']) { wf(E({ id: 'j' + s, state: 'running' })); wf(E({ id: 'j' + s, state: s })); }
      eq(reg.list().slice(2).map(j => j.state), ['done', 'failed'], 'JOBS: done and failed end as such');
      wf(E({ id: 'j9', state: 'done' }));
      eq(reg.list().length, 4, 'JOBS: an end of a job that was never listed lists nothing');
      ST.reset();
      ST.use({ runner: r2, cache });
      wf(E({ id: 'j10' }));
      eq(reg.list().length, 4, 'JOBS: with no registry seen yet nothing is listed (and nothing throws)');
    }
    ST.reset();
  }

  // ---------- 4 the real runner on the fixture ----------
  const fxmake = require('../../../../mapviz/test/fxmake');
  const FXA = require('../../../../mapviz/test/fxanswers.json').as2;
  const fx = fxmake.make(path.join(SCR, 'fx'), { form: 'as2' });
  const enc = encodeURIComponent;
  const base = 'target=mowas2&game=' + enc(fx.gameDir);   // the vanilla stack: what fxanswers.json holds
  const ident = { target: 'mowas2', game: fx.gameDir };
  const MODQ = '&modDir=' + enc(fx.modDirs[0]);
  const t0 = Date.now();
  // pollJob: by time, not by count; at the backstop a WAIT line and once more twice as long, then the check after it reports
  async function pollJob(id, ms, gone) {
    let j = null, lim = ms;
    for (let round = 0; round < 2; round++, lim *= 2) {
      const end = Date.now() + lim;
      while (Date.now() < end) { const g = await call('GET', 'job?id=' + id); j = g.v; if (gone(j)) return j; await new Promise(r => setTimeout(r, 20)); }
      process.stderr.write('WAIT mapviz shell test: job ' + id + ' not ended after ' + lim / 1000 + ' s\n');
    }
    return j;
  }
  const ended = j => j && ['done', 'failed', 'cancelled', 'timeout'].includes(j.state);
  async function runJob(body) {
    const s = await call('POST', 'job', Object.assign({}, ident, body));
    if (!s.v) return { e: s.e };
    const j = await pollJob(s.v.id, 180000, j => !j || ended(j));
    return { v: j, sub: s.v };
  }
  // JOBS: a real registry, seen by one route; the real runner's jobs land in it
  const REGX = require('../../../joblist').create({ keepMs: 3600000 });
  await R['GET /api/x/mapviz/parts'](new URL('/api/x/mapviz/parts', 'http://x'), null, { jobs: REGX });
  let r = await call('GET', 'maps?' + base); ok(shape(r.e, 404, 'MV_NOT_FOUND') && r.e.params.need.what === 'maps', 'real: maps before its job -> need');
  const jm = await runJob({ what: 'maps' }); ok(jm.v && jm.v.state === 'done', 'real: maps job polled to done', jm);
  ok(REGX.list().length === 1 && REGX.list()[0].what === 'job.w.mapslist' && REGX.list()[0].kind === 'bg' && REGX.list()[0].state === 'done' && REGX.list()[0].game === 'mowas2', 'real: the maps job was in the GUI job list and ended done', REGX.list());
  r = await call('GET', 'maps?' + base);
  ok(r.v && r.v.v === 1 && r.v.maps.length === FXA.maps.a.maps.length && r.v.maps[0].key === 'multi/mv_fixture' && JSON.stringify(r.v.maps[0].modes) === JSON.stringify(FXA.maps.a.maps[0].modes), 'real: GET maps answer', r.v || r.e);
  r = await call('GET', 'doc?' + base + '&map=multi/mv_fixture&entities=0'); ok(shape(r.e, 404, 'MV_NOT_FOUND') && r.e.params.need.what === 'doc' && r.e.params.need.args.map === 'multi/mv_fixture', 'real: doc before its job -> need');
  const jd = await runJob({ what: 'doc', map: 'multi/mv_fixture' }); ok(jd.v && jd.v.state === 'done', 'real: doc job done');
  r = await call('GET', 'doc?' + base + '&map=multi/mv_fixture&entities=0'); ok(r.v && r.v.v === 1 && Array.isArray(r.v.entities) && r.v.entities.length === 0 && r.v.modes.length === 3, 'real: GET doc entities=0');
  for (const name of ['spawns', 'flags', 'boxes']) {
    r = await call('GET', 'layer?' + base + '&map=multi/mv_fixture&name=' + name);
    eq(r.v, FXA.layer[name].a, 'real: layer ' + name + ' = fixture answer');
  }
  // the mod folder goes through: the fixture mod moves a1 of combat
  const jdm = await runJob({ what: 'doc', map: 'multi/mv_fixture', modDirs: fx.modDirs }); ok(jdm.v && jdm.v.state === 'done', 'real: doc job with the mod folder done');
  r = await call('GET', 'layer?' + base + MODQ + '&map=multi/mv_fixture&name=spawns&mode=combat');
  ok(r.v && r.v.items.some(i => i.name === 'a1' && i.y === 52.2), 'real: modDir reaches the job and the layer (mod spawn a1 of combat)', r.v || r.e);
  r = await call('GET', 'layer?' + base + '&map=multi/mv_fixture&name=height&mode=battle_zones');
  ok(shape(r.e, 404, 'MV_NOT_FOUND') && r.e.params.need.what === 'grids' && r.e.params.need.args.mode === 'battle_zones', 'real: height before grids -> need grids with the mode', r.e && r.e.params);
  const jg = await runJob({ what: 'grids', map: 'multi/mv_fixture', mode: 'battle_zones' }); ok(jg.v && jg.v.state === 'done', 'real: grids job done');
  r = await call('GET', 'layer?' + base + '&map=multi/mv_fixture&name=height&mode=battle_zones');
  let dec = null; try { dec = T.decode(r.v); } catch (e) { dec = null; }
  ok(r.v && r.v.kind === 'grid' && r.v.w === 128 && r.v.h === 96 && r.v.pal === 'height' && dec && dec.vals.length === 128 * 96, 'real: grid envelope of height, decoded by the page', r.e);
  const jt = await runJob({ what: 'topo', map: 'multi/mv_fixture' });
  if (jt.e && jt.e.message === 'MV_NOT_BUILT') console.log('skip real topo: raster topo not built');
  else {
    ok(jt.v && jt.v.state === 'done', 'real: topo job done', jt);
    r = await call('GET', 'tiles?' + base + '&map=multi/mv_fixture&base=topo&z=0&t=0.0,9.9');
    ok(r.v && r.v.kind === 'tiles' && r.v.base === 'topo' && typeof r.v.tiles[0].png === 'string' && r.v.tiles[1].missing === true && r.v.zmax >= 0 && r.v.cell > 0 && Array.isArray(r.v.box), 'real: tile batch with a missing tile', r.v || r.e);
    r = await call('GET', 'tiles?' + base + '&map=multi/mv_fixture&base=topo&z=40&t=0.0'); ok(shape(r.e, 400, 'MV_USAGE'), 'real: a level beyond zmax');
    r = await call('GET', 'layer?' + base + '&map=multi/mv_fixture&name=contours'); ok(r.v && r.v.kind === 'vector' && Array.isArray(r.v.items) && r.v.pal === 'height.contour', 'real: contours as a vector layer', r.e);
  }
  const jr = await runJob({ what: 'terrain', map: 'multi/mv_fixture', mode: 'battle_zones' }); ok(jr.v && jr.v.state === 'done', 'real: terrain job done');
  r = await call('GET', 'hover?' + base + '&map=multi/mv_fixture&mode=battle_zones');
  let withWater = false;
  if (r.e && r.e.params && r.e.params.need && r.e.params.need.what === 'water') {
    ok(r.e.params.need.args.mode === 'battle_zones', 'real: hover needs the water job of the mode (water part built)');
    const jw = await runJob({ what: 'water', map: 'multi/mv_fixture', mode: 'battle_zones' });
    if (jw.v && jw.v.state === 'done') { withWater = true; r = await call('GET', 'hover?' + base + '&map=multi/mv_fixture&mode=battle_zones'); }
    else console.log('skip real hover answer: the water job did not finish (' + JSON.stringify(jw.v ? jw.v.error || jw.v.state : jw.e && jw.e.message) + ')');
  }
  if (r.e) ok(withWater === false && r.e.params && r.e.params.need && r.e.params.need.what === 'water', 'real: hover answer', r.e);
  else {
    const want = FXA.hover.a, got = r.v || {};
    eq([got.kind, got.step, got.w, got.h, got.cell, got.ox, got.oy, got.waterLevel], [want.kind, want.step, want.w, want.h, want.cell, want.ox, want.oy, want.waterLevel], 'real: hover pack frame');
    for (const k of ['height', 'slopecls', 'gtype', 'material']) { const g = (got.layers || {})[k] || {}, w = want.layers[k]; ok(g.data === w.data, 'real: hover layer ' + k + ' data'); eq(Object.assign({}, g, { data: 0 }), Object.assign({}, w, { data: 0 }), 'real: hover layer ' + k + ' fields'); }
    if (withWater) eq(got.layers && got.layers['water.band'], want.layers['water.band'], 'real: hover layer water.band');
    else ok(!got.layers || !got.layers['water.band'], 'real: hover leaves out water.band while the water part is not built');
  }
  // cancel: a fresh topo size (a new key) cancelled at once
  const cs = await call('POST', 'job', Object.assign({}, ident, { what: 'topo', map: 'multi/mv_fixture', size: 64 }));
  if (cs.e && cs.e.message === 'MV_NOT_BUILT') console.log('skip real cancel: raster topo not built');
  else {
    const cr = await call('POST', 'cancel', { id: cs.v.id });
    ok(cr.v && cr.v.id === cs.v.id && typeof cr.v.state === 'string', 'real: cancel answer {id, state}', cr);
    const fin = await pollJob(cs.v.id, 120000, ended);
    ok(fin && (fin.state === 'cancelled' || fin.state === 'done'), 'real: the cancelled job ends (' + (fin && fin.state) + ')');
  }
  r = await call('GET', 'doc?' + base + '&map=multi/mv_fixture&bogus=1'); ok(shape(r.e, 400, 'MV_USAGE'), 'real: unknown route argument -> error shape');
  r = await call('GET', 'doc?map=multi/mv_fixture'); ok(shape(r.e, 400, 'MV_USAGE'), 'real: missing target -> refused');
  r = await call('GET', 'cache'); ok(r.v && r.v.entries > 0 && r.v.root.indexOf(path.join(SCR, 'cache')) === 0, 'real: the cache is the scratch cache', r.v);
  // the page on the real routes
  { const calls = [], S = { gameId: 'mowas2', gameOv: fx.gameDir, mod: fx.modDirs[0] || '', mapKey: '' };
    const seenMap = [];
    const P = mkPage({ scripts: [CLIENT], lang: L, S, canvas: true, api: routeApi(R, calls), parts: [{ id: 'g', init(V) { V.addLayer({ id: 'spawns', group: 'game', label: 'Spawns', engineTrue: true }); V.on('map', d => seenMap.push({ key: d && d.key, pick: d && d.pick, form: !!d && 'side' in d && 'kind' in d && 'doc' in d, doc: !!(d && d.doc) })); } }] });
    P.screen.refresh(); await flush();
    P.V.emit('map', { key: 'multi/mv_fixture', pick: true });
    await until(() => P.V.doc, 20000); P.V.redraw(); await until(() => blk(P.root, 'mv.items').has('a1'), 20000);
    ok(P.V.doc && P.V.q('mode') === 'battle_zones' && S.mapKey === 'map/multi/mv_fixture', 'real page: choosing a map loads its document and first mode');
    const lastMap = seenMap[seenMap.length - 1] || {};
    ok(seenMap.length >= 2 && seenMap.every(d => d.pick === undefined && d.form) && lastMap.key === 'multi/mv_fixture' && lastMap.doc, 'a part sees only the shell map form (never the pick request), the last with the doc', seenMap);
    ok(blk(P.root, 'mv.items').has('a1') && P.log.some(c => c.op === 'arc'), 'real page: spawns drawn and listed');
    ok(calls.every(c => c.method === 'GET'), 'real page: a cached map needs no job');
    const dq = new URL(calls.find(c => c.path === '/api/x/mapviz/doc').url, 'http://x').searchParams;
    ok(dq.get('modDir') === (fx.modDirs[0] || null) && dq.get('entities') === '0' && !dq.get('mode'), 'real page: the doc call carries the mod folder and no mode');
  }
  ST.close && await ST.close();
  const realMs = Date.now() - t0;

  ok(REGX.list().length > 1 && REGX.list().every(j => j.state !== 'running' && j.page === 'mapviz' && (j.what === 'job.w.mapslist' || (j.what === 'job.w.mapviz' && j.whatP && j.whatP.map))), 'real: every runner job was listed and ended (' + REGX.list().length + ')', REGX.list().filter(j => j.state === 'running'));
  // ---------- 4b the joined page (every part): groups and tips of every registered layer, on each game ----------
  const ALLIDS = new Set();
  { let EXT = null; try { EXT = require('../index'); } catch (e) { ok(false, 'the joined page loads', e && e.stack); }
    if (EXT) for (const game of ['mowas2', 'as64', 'goh']) {
      for (const k of Object.keys(global.LS.m)) if (/^maps\.viewer\.fold\./.test(k)) delete global.LS.m[k];
      const S = { gameId: game, gameOv: '<game>', mod: '', mapKey: '' };
      const P = mkPage({ scripts: [EXT.script], lang: EXT.lang, S, canvas: false, api: () => Promise.reject(Object.assign(new Error('x'), { status: 500 })) });
      P.screen.refresh(); await flush();
      const rows = blk(P.root, 'mv.groups').all().filter(e => e.attrs && e.attrs['data-layer']), E = EXT.lang.en;
      const ids = rows.map(r => r.attrs['data-layer']); ids.forEach(id => ALLIDS.add(id));
      ok(ids.length >= 60, game + ': the joined page registers every part layer (' + ids.length + ')', ids);
      const want = k => (game === 'goh' && E[k + '.goh'] ? E[k + '.goh'] : E[k]);
      const noTip = ids.filter(id => !E['mapviz.shell.tip.l.' + id]);
      ok(!noTip.length, game + ': every registered layer has a tip (mapviz.shell.tip.l.<id>)', noTip);
      const badT = rows.filter(r => { const id = r.attrs['data-layer'], lab = r.all().find(e => e.tagName === 'LABEL'), cb = r.all().find(e => e.tagName === 'INPUT'), tp = r.all().find(e => e.tagName === 'P');
        return !lab || lab.attrs.title !== want('mapviz.shell.tip.l.' + id) || !cb || !tp || cb.attrs['aria-describedby'] !== tp.attrs.id || tp.textContent !== lab.attrs.title; }).map(r => r.attrs['data-layer']);
      ok(!badT.length, game + ': each row shows its tip for this game (label title, and the text the tick is described by)', badT);
      const noView = []; T.VIEWS.forEach(v => v[2].forEach(id => { if (ids.indexOf(id) < 0) noView.push(v[0] + ':' + id); }));
      ok(!noView.length, game + ': every layer a view names exists', noView);
      const em = rows.filter(r => { const m = r.all().find(e => e.className === 'mvmark'); return !m || !/^(true|estimate)$/.test(m.attrs['data-mark']); }).map(r => r.attrs['data-layer']);
      ok(!em.length, game + ': every row has its mark', em);
      const gs = T.GROUPS.filter(g => blk(P.root, 'mv.g.' + g));
      eq(gs, T.GROUPS, game + ': every group holds at least one layer');
      const noG = gs.filter(g => { const hd = blk(P.root, 'mv.g.' + g + '.head'), fb = hd && hd.all().find(e => e.className === 'mvfold'); return !E['mapviz.shell.tip.g.' + g] || !fb || fb.attrs.title !== want('mapviz.shell.tip.g.' + g); });
      ok(!noG.length, game + ': every group head has its tip', noG);
      const long = gs.filter(g => blk(P.root, 'mv.g.' + g).all().filter(e => e.attrs && e.attrs['data-layer']).length > 8);
      ok(!long.length, game + ': no group holds more than 8 layers', long);
      const folded = gs.filter(g => blk(P.root, 'mv.g.' + g).all().filter(e => e.attrs && e.attrs['data-layer']).every(r => r.hidden === true));
      const noneOn = gs.filter(g => !blk(P.root, 'mv.g.' + g).all().some(e => e.attrs && e.attrs['data-layer'] && e.all().find(x => x.tagName === 'INPUT').checked));
      eq(folded, noneOn, game + ': with no fold stored, a group with nothing on starts folded and the others open');
      ok(['factfire', 'factplace', 'height'].every(g => folded.indexOf(g) >= 0) && ['base', 'game', 'water'].every(g => folded.indexOf(g) < 0), game + ': the factor and height groups start folded, base, game and water open', folded);
      // the views on the joined page: each press changes ticks only and starts no job; the active view again changes nothing
      { const vb = id => blk(P.root, 'mv.views').all().find(e => e.tagName === 'BUTTON' && e.textContent === E['mapviz.shell.view.' + id]);
        const bad = []; for (const v of T.VIEWS) { vb(v[0]).click(); await flush(5);
          const want2 = v[2].concat(T.MARKS).filter(id => ids.indexOf(id) >= 0).sort(), got = P.V.q('allLayers').slice().sort();
          if (JSON.stringify(got) !== JSON.stringify(want2) || vb(v[0]).attrs['aria-pressed'] !== 'true') bad.push({ view: v[0], got, want: want2 }); }
        ok(!bad.length, game + ': each view shows its layers and the game marks, nothing else', bad);
        const tl = blk(P.root, 'mv.l.measure').all().find(e => e.tagName === 'INPUT'); ok(tl.checked === true, game + ': a view leaves a tool layer ticked'); }
      if (game === 'goh') ok(blk(P.root, 'mv.l.zones').all().find(e => e.tagName === 'LABEL').attrs.title === E['mapviz.shell.tip.l.zones.goh'] && E['mapviz.shell.tip.l.zones.goh'] !== E['mapviz.shell.tip.l.zones'], 'goh: a tip whose rules differ shows the Gates of Hell text');
      else ok(blk(P.root, 'mv.l.zones').all().find(e => e.tagName === 'LABEL').attrs.title === E['mapviz.shell.tip.l.zones'], game + ': the AS64 and MoW:AS2 pages show the plain tip');
      const bp = require('../../../test/blockcheck').checkScreen(P.root, 'mapviz');
      ok(bp.length === 0, game + ': the joined page keeps the GUI block rule', bp.slice(0, 6));
    }
    // 4c the joined page as a first-time user meets it (every real part, a map opened): default folds, nothing writes a fold
    // until a fold button is pressed, On now with no map and with a tool, one title on a tool card, no state row in the
    // cursor strip, no dot on any tab at load. The fake single-part pages above missed these on the real page
    if (EXT) for (const game of ['as64', 'goh']) {
      for (const k of Object.keys(global.LS.m)) if (/^maps\.viewer\.(fold\.|tab$)/.test(k)) delete global.LS.m[k];
      const writes = [], set0 = global.LS.set; global.LS.set = function (k, v) { if (/^maps\.viewer\.fold\./.test(k)) writes.push(k); return set0.call(this, k, v); };
      try {
        const E = EXT.lang.en, calls = [];
        const DOC = { v: 1, key: 'multi/mv_fixture', modes: [{ id: 'combat' }], boxes: { world: [-600, -440, 600, 440] }, entities: [] };
        const routes = { 'GET /api/x/mapviz/palette': async () => PAL, 'GET /api/x/mapviz/cache': async () => ({ v: 1, root: '<cache>', bytes: 0, cap: 1, entries: 0, jobs: 0 }),
          'GET /api/x/mapviz/doc': async () => DOC };
        const S = { gameId: game, gameOv: '<game>', mod: '', mapKey: '' };
        const P = mkPage({ scripts: [EXT.script], lang: EXT.lang, S, canvas: false, api: routeApi(routes, calls) }), R = P.root;
        P.screen.refresh(); await flush(40);
        const gs = T.GROUPS.filter(g => blk(R, 'mv.g.' + g));
        const foldState = () => gs.filter(g => blk(R, 'mv.g.' + g + '.head').all().find(e => e.className === 'mvfold').attrs['aria-expanded'] === 'false');
        const noneOn = () => gs.filter(g => !blk(R, 'mv.g.' + g).all().some(e => e.attrs && e.attrs['data-layer'] && e.all().find(x => x.tagName === 'INPUT').checked));
        eq(foldState(), noneOn(), game + ' joined: with no map, every group with nothing on starts folded (aria-expanded false), the others open');
        ok(['height', 'movement', 'sight', 'danger', 'factfire', 'factplace', 'fairness'].every(g => foldState().indexOf(g) >= 0), game + ' joined: Height, Movement, Sight, Danger, both factor groups and Fairness start folded', foldState());
        // On now with no map: one line, no rows, no Make these
        { const on = blk(R, 'mv.onnow'), mall = blk(R, 'mv.onnow.head').all().find(e => e.tagName === 'BUTTON');
          ok(!!blk(R, 'mv.onnow.nomap') && blk(R, 'mv.onnow.nomap').textContent === E['mapviz.shell.onNoMap'] && !on.all().some(e => e.attrs && e.attrs['data-on']) && mall.hidden === true,
            game + ' joined: On now with no map says to choose a map, lists no row and hides Make these', on.textContent); }
        // tabs: no dot at load
        { const tabs = R.all().filter(e => e.attrs.role === 'tab');
          ok(tabs.length === 4 && tabs.every(b => b.textContent.indexOf('\u25CF') < 0) && R.all().filter(e => e.className === 'mvdot').every(d => d.hidden === true), game + ' joined: no tab shows a dot at load', tabs.map(b => b.textContent)); }
        // open a map as the user does
        P.V.emit('map', { key: 'multi/mv_fixture', pick: true }); await until(() => P.V.doc, 5000); await flush(60);
        ok(P.V.q('map') === 'multi/mv_fixture' && !!P.V.doc, game + ' joined: the map opens');
        eq(foldState(), noneOn(), game + ' joined: with a map open, every group with nothing on is still folded');
        const onIds = () => blk(R, 'mv.onnow').all().filter(e => e.attrs && e.attrs['data-on']).map(e => e.attrs['data-on']);
        ok(onIds().length > 0 && onIds().indexOf('measure') < 0 && onIds().indexOf('profile') < 0 && !blk(R, 'mv.onnow.nomap'), game + ' joined: On now lists the visible layers but no tool layer while no tool is in use', onIds());
        // the measure tool: its layer is listed while it runs; its card shows one title (the panel's own heading)
        { const mb = blk(R, 'mv.bar').all().find(e => e.tagName === 'BUTTON' && e.textContent === E['mapviz.measure.tool']); mb.click(); await flush(10);
          ok(P.V.q('tool') === 'measure' && onIds().indexOf('measure') >= 0, game + ' joined: the measure layer is in On now while Measure is in use', onIds());
          const card = blk(R, 'mv.tc.measure'), tt = card && card.all().find(e => e.className === 'mvcardt');
          const titles = card ? card.all().filter(e => (/^H[1-6]$/.test(e.tagName) && e.textContent === E['mapviz.measure.title']) || (e === tt && e.hidden !== true)) : [];
          ok(!!card && card.hidden !== true && tt && tt.hidden === true && titles.length === 1 && card.attrs['aria-label'] === E['mapviz.measure.title'] && /\bmvown\b/.test(card.className)
            && blk(R, 'mv.tc.measure.head').all().some(e => e.tagName === 'BUTTON' && e.attrs['aria-label'] === E['mapviz.shell.cardClose'].replace('{name}', E['mapviz.measure.title'])),
            game + ' joined: the Measure card shows one Measure title, keeps its close button and its aria-label', card && card.textContent.slice(0, 80));
          mb.click(); await flush(10);
          ok(P.V.q('tool') === null && onIds().indexOf('measure') < 0, game + ' joined: the measure layer leaves On now when the tool ends'); }
        // the cursor strip: a value row only; the strong part's "not made yet" stays in the readout for screen readers
        { P.V.go({ x: 10, y: 20 }); await flush(10); const strip = blk(R, 'mv.strip'), ro = blk(R, 'mv.readout'), nm = E['mapviz.shell.notMade'], ld = E['mapviz.shell.loading'];
          ok(strip.textContent.indexOf(E['mapviz.shell.stripAt'].replace('{x}', '0.5').replace('{y}', '1.0')) === 0 && strip.textContent.indexOf(nm) < 0 && strip.textContent.indexOf(E['mapviz.strong.lay.score']) < 0,
            game + ' joined: the cursor strip holds the position and no not-made row', strip.textContent);
          ok(ro.has(E['mapviz.strong.lay.score']) && (ro.has(nm) || ro.has(ld)), game + ' joined: the readout keeps the strong score state for screen readers', ro.textContent); }
        // views and ticks write no fold either
        blk(R, 'mv.views').all().find(e => e.tagName === 'BUTTON' && e.textContent === E['mapviz.shell.view.terrain']).click(); await flush(20);
        P.screen.refresh(); await flush(20);
        eq(writes, [], game + ' joined: loading, refresh, a map pick, a tool, a view and the draws write no fold to LS');
        // seeded: the fold caret is the one thing that writes (the spy sees it)
        blk(R, 'mv.g.height.head').all().find(e => e.className === 'mvfold').click();
        eq(writes, ['maps.viewer.fold.height'], game + ' joined: seeded: a press of a fold caret writes that fold only');
        // a fold kept in the GUI settings (LS.get reads the settings file first) wins: stored false for every group shows them all
        // open, the state the browser walk met; the page leaves stored folds alone
        for (const g of T.GROUPS) global.LS.m['maps.viewer.fold.' + g] = false;
        const P2 = mkPage({ scripts: [EXT.script], lang: EXT.lang, S: { gameId: game, gameOv: '<game>', mod: '', mapKey: '' }, canvas: false, api: routeApi(routes, []) });
        P2.screen.refresh(); await flush(20);
        ok(T.GROUPS.every(g => blk(P2.root, 'mv.g.' + g + '.head').all().find(e => e.className === 'mvfold').attrs['aria-expanded'] === 'true') && T.GROUPS.every(g => global.LS.m['maps.viewer.fold.' + g] === false),
          game + ' joined: stored folds win and are left as they are (every group open when false is stored for all)');
      } finally { global.LS.set = set0; for (const k of Object.keys(global.LS.m)) if (/^maps\.viewer\.fold\./.test(k)) delete global.LS.m[k]; }
    }
    // seeded: a layer id with no tip is caught by the same check
    ok(!L.en['mapviz.shell.tip.l.zz.none'], 'seeded: an unknown layer id has no tip (the check above would name it)');
    eq(T.regroup('pass', 'game'), 'movement', 'regroup: an old group of a moved layer gives the new group');
    eq(T.regroup('pass', 'movement'), 'movement', 'regroup: the new group stays');
    eq(T.regroup('zones', 'game'), 'game', 'regroup: a layer that did not move keeps its group');
    eq(Object.keys(T.REGROUP).filter(id => T.GROUPS.indexOf(T.REGROUP[id][0]) < 0 || T.GROUPS.indexOf(T.REGROUP[id][1]) < 0), [], 'every old and new group of REGROUP is a group');
    eq(T.DRAW.slice().sort(), T.GROUPS.slice().sort(), 'DRAW and GROUPS name the same groups');
  }

  // ---------- 5 language ----------
  const used = new Set();
  for (const g of T.GROUPS) used.add('mapviz.shell.tip.g.' + g);
  for (const id of ALLIDS) used.add('mapviz.shell.tip.l.' + id);
  for (const k of [...used]) if (/^mapviz\.shell\.tip\./.test(k) && LANG.en[k + '.goh']) used.add(k + '.goh');
  for (const m of CLIENT.matchAll(/'(mapviz\.(?:shell|err)\.[A-Za-z0-9_.]*[A-Za-z0-9_])'/g)) used.add(m[1]);
  for (const g of T.GROUPS) used.add('mapviz.shell.group.' + g);
  for (const s of ['a', 'b', 'both']) used.add('mapviz.shell.side.' + s);
  for (const k of ['inf', 'mg', 'at', 'tank']) used.add('mapviz.shell.kind.' + k);
  for (const [list, pre] of [[T.WHATS, 'what'], [T.STAGES, 'stage'], [T.ITEMS, 'item'], [T.FAULTS, 'fault']]) for (const k of list) used.add('mapviz.shell.' + pre + '.' + k);
  { const J = require('../../../../mapviz/jobs/table').JOBS; const nw = Object.keys(J).filter(w => T.WHATS.indexOf(w) < 0); ok(!nw.length, 'every job of the table has a name in words', nw); }
  // stage words: every stage the job runner and the part commands emit today, listed by hand: a word of its own, or
  // deliberately the plain 'working' word. The scan of tools/mapviz fails on a stage that is in neither list.
  { const X1 = {}; new Function('EXT_SCREENS', 'h', 'tx', 'api', 'S', 'RMT', 'cssv', 'onTheme', 'document', 'window', CLIENT)(X1, () => ({}), txOf(L, 'en'), () => Promise.reject(new Error('x')), {}, false, () => '', () => {}, undefined, undefined);
    const T1 = X1.mapviz._t, WORK = L.en['mapviz.shell.stage.other'];
    const WORDED = ['wait', 'read', 'write', 'tiles', 'draw', 'build', 'place', 'masks', 'defs', 'picture',
      'solids', 'grid', 'fire', 'view', 'edges', 'probes', 'lip', 'conceal', 'obstacles', 'travel', 'routes',
      'frame', 'candidates', 'factors', 'refine', 'classify', 'ensemble', 'fair', 'checks', 'plan', 'compose', 'encode', 'commit', 'catalog', 'pack', 'textures'];
    const PLAIN = ['terrain', 'grids', 'c0', 'doc', 'links', 'parts', 'mask', 'kcontour', 'kcost', 'kregion.regions', 'kregion.distance', 'kterrain.slopeClass', 'kterrain.hillshade', 'kterrain.landform'];
    eq(T.STAGES.filter(s => s !== 'other'), WORDED, 'the stage word list is the wave B words plus the wave C and D stages of jobs.md');
    const badW = WORDED.filter(s => !(T1.stageText(s) === L.en['mapviz.shell.stage.' + s] && L.en['mapviz.shell.stage.' + s] !== WORK));
    ok(!badW.length, 'every listed stage shows its own word', badW);
    const badP = PLAIN.concat(['zzz', 'Read', 'tiles.x']).filter(s => T1.stageText(s) !== WORK);
    ok(!badP.length, 'seeded: every other stage (and an unknown one) shows the plain working word', badP);
    ok(T1.stageText('') === '', 'no stage, no word');
    const found = new Map(), MV = path.join(HERE, '..', '..', '..', '..', 'mapviz');
    (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== 'test' && e.name !== 'node_modules') walk(f); continue; }
      if (!/\.js$/.test(e.name) || /\.test\.js$/.test(e.name)) continue;
      const src = fs.readFileSync(f, 'utf8');
      for (const m of src.matchAll(/(?:\bstage\s*(?:\(\s*|=\s*|:\s*)|\.stage\s*\|\|\s*)'([^']*)'(\s*\+)?/g)) if (m[1]) found.set(m[1] + (m[2] ? '*' : ''), path.relative(MV, f).replace(/\\/g, '/')); } })(MV);
    const known = s => (/\*$/.test(s) ? PLAIN.some(p => p.indexOf(s.slice(0, -1)) === 0) : WORDED.includes(s) || PLAIN.includes(s));
    const unlisted = [...found].filter(([s]) => !known(s)).map(([s, f]) => s + ' (' + f + ')');
    ok(found.has('wait') && found.has('tiles') && found.has('masks') && found.size >= 10, 'the stage scan finds the stages of the runner and the parts (' + found.size + ')', [...found.keys()]);
    ok(!unlisted.length, 'every stage emitted today has a word or is listed as working', unlisted);
  }
  for (const c of Object.keys(ST.STATUS)) used.add('mapviz.err.' + c);
  const codes = ['en', 'ru', 'uk', 'zh'];
  eq(Object.keys(LANG).sort(), codes.slice().sort(), 'lang: exactly en, ru, uk, zh');
  const missing = []; for (const k of used) for (const c of codes) if (!(LANG[c] && LANG[c][k])) missing.push(c + ' ' + k);
  ok(!missing.length, 'lang: every key used is in all four languages (' + used.size + ')', missing.join(', '));
  const unused = Object.keys(LANG.en).filter(k => !used.has(k) && !(/\.1$/.test(k) && used.has(k.slice(0, -2))));
  ok(!unused.length, 'lang: every key in the file is used', unused.join(', '));
  const slots = s => (String(s).match(/\{\w+\}/g) || []).sort().join(',');
  const bad = []; for (const c of codes) for (const k of Object.keys(LANG.en)) { const s = LANG[c][k]; if (typeof s !== 'string' || !s || slots(s) !== slots(LANG.en[k]) || /^TODO:/.test(s) || /\u2014| - /.test(s) || /(^|[^\w.\/])as64\b/.test(s)) bad.push(c + ' ' + k); }
  ok(!bad.length, 'lang: same slots, no TODO, no dash separator, AS64 in capitals', bad.join(', '));
  for (const c of codes.slice(1)) ok(Object.keys(LANG[c]).length === Object.keys(LANG.en).length && LANG[c]['mapviz.shell.title'] !== LANG.en['mapviz.shell.title'], 'lang ' + c + ': translated, same key count');

  // ---------- 6 a real install ----------
  if (process.env.MAPVIZ_NO_GAME === '1') console.log('skip real installs: MAPVIZ_NO_GAME=1');
  else {
    let as2 = null;
    try { const gd = require('../../../../lib/gamedir'); const g = gd.resolve({}); as2 = g && g.dir && fs.existsSync(path.join(g.dir, 'resource', 'map.pak')) ? g.dir : null; } catch (e) { as2 = null; }
    if (!as2) console.log('skip mowas2: no install');
    else {
      const before = fs.readdirSync(path.join(SCR, 'cache')).length;
      const rr = await call('GET', 'maps?target=mowas2&game=' + enc(as2));
      ok(shape(rr.e, 404, 'MV_NOT_FOUND') && rr.e.params.need.what === 'maps', 'real install: GET maps answers need and starts no job');
      ok(fs.readdirSync(path.join(SCR, 'cache')).length === before, 'real install: nothing written by a GET');
    }
  }
  console.log('# real runner part ' + realMs + ' ms');
  if (failN) { console.log('FAIL mapviz shell: ' + failN + ' of ' + (pass + failN)); process.exit(1); }
  console.log('PASS mapviz shell (' + pass + ')');
  process.exit(0);
})().catch(e => { console.log('FAIL mapviz shell: ' + (e && e.stack || e)); process.exit(1); });

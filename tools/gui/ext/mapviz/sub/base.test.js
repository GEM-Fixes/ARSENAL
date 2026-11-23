// Map Viewer base layers test (MV-PG1): node tools/gui/ext/mapviz/sub/base.test.js [scratch dir]
// The base part on a stub V that records addLayer and draw calls, in the fake DOM: layers, groups, engineTrue; the base
// picker with the parts route (the schematic and ground pictures not built show as not built, never as an error); the
// one-click Topographic preset (topo tiles where README 5.2 puts them, the same rectangles as the shell's tile maths, and
// contours with index lines and upright height labels); a picture not made yet (Make button runs the job); ground types,
// materials, height bands, shaded relief and slope classes from the fixture map's real grids (tools/mapviz/test/fxmake.js
// and the raster kernels, ARSENAL_CACHE inside the scratch dir; skipped with a message when not built); seeded defects:
// an unknown pal, a wrong size, a missing envelope, a bad tile header (not available, the others still draw); RMT; the
// part on the shell; the language file both ways; no colour literal.
// Author: Imperator_Aug (ARSENAL, ia-4f883ec7)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const SCR = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'mv-base-')));
fs.mkdirSync(SCR, { recursive: true });
process.env.ARSENAL_CACHE = path.join(SCR, 'cache');
const { harness: H } = require('./shell.test');
const fake = require('../../../test/fakedom');
const SHELL = require('./shell.client'), PART = require('./base.client');
const LB = require('./base.lang.json'), L = H.mergeLang([require('./shell.lang.json'), LB]);
const ROOT = path.resolve(__dirname, '../../../../mapviz');
const PAL = require(path.join(ROOT, 'palette.json'));
const FXA = require(path.join(ROOT, 'test/fxanswers.json'));
let pass = 0, failN = 0;
const ok = (c, what, extra) => { if (c) pass++; else { failN++; console.log('FAIL mapviz base: ' + what + (extra !== undefined ? '\n  ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 600) : '')); } };
const en = k => L.en[k];
const clone = x => JSON.parse(JSON.stringify(x));
const near = (a, b, e) => Math.abs(a - b) <= (e || 1e-6);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const opt = (fn, what) => { try { return fn(); } catch (e) { if (e && e.code === 'MODULE_NOT_FOUND') { console.log('skip: ' + what + ' is not built'); return null; } throw e; } };
const PNG = 'iVBORw0KGgo=';

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
    { requestAnimationFrame: f => f() }, (f, ms) => setTimeout(f, 2), o.noImage ? undefined : H.ImageStub, () => '', undefined);
  return { X, doc, log, part: X.mapviz.parts.find(p => p.id === 'base') };
}
function recCtx(log) {
  const c = H.stubCtx(log, { _id: 'main' });
  for (const m of ['fillText', 'strokeText', 'closePath', 'rect', 'translate', 'rotate'])
    c[m] = function () { log.push({ op: m, args: [].slice.call(arguments), cv: 'main', fillStyle: c.fillStyle, strokeStyle: c.strokeStyle, lineWidth: c.lineWidth }); };
  const st = c.stroke; c.stroke = function () { st.apply(c, arguments); log[log.length - 1].strokeStyle = c.strokeStyle; log[log.length - 1].lineWidth = c.lineWidth; };
  return c;
}
function mkView(env, o) {
  o = o || {};
  const v = { cx: o.cx || 0, cy: o.cy || 0, zoom: o.zoom || 0.5, w: 800, h: 600, env: env || null, pal: PAL, token: n => 'var-' + n };
  v.toScreen = (x, y) => [v.w / 2 + (x - v.cx) * v.zoom, v.h / 2 - (y - v.cy) * v.zoom];
  v.toWorld = (px, py) => [v.cx + (px - v.w / 2) / v.zoom, v.cy - (py - v.h / 2) / v.zoom];
  return v;
}
// routes: {parts, tiles(b), layer(name), job(what, args)} each returning a value or throwing; missing = rejects
function stubV(L0, o) {
  o = o || {};
  const rec = { layers: [], panels: [], on: {}, calls: [], draws: [], redraws: 0, boxes: {} };
  const q = Object.assign({ target: 'mowas2', map: 'multi/mv_fixture', mode: 'battle_zones', side: 'both', kind: 'inf', rmt: false, game: '<game>' }, o.q || {});
  const R = o.routes || {};
  const V = {
    q: n => q[n], doc: clone(FXA.as2.doc.a), pal: o.pal === undefined ? PAL : o.pal,
    addLayer(l) { rec.layers.push(l); return true; },
    addPanel(p) { rec.panels.push(p); const box = L0.doc.createElement('div'); rec.boxes[p.id] = box; p.build(box, V); },
    on(e, f) { (rec.on[e] = rec.on[e] || []).push(f); }, emit(e, d) { (rec.on[e] || []).forEach(f => f(d)); },
    redraw() { rec.redraws++; }, token: n => 'var-' + n, say() {}, addTool() {}, addHover() {},
    api(m, p, b) { rec.calls.push({ m, p, b: clone(b || null) }); const f = R[p]; if (!f) return Promise.reject(Object.assign(new Error('no route ' + p), { status: 404 }));
      return Promise.resolve().then(() => f(b || {})); },
    job(w, a) { rec.calls.push({ job: w, a }); return R.job ? Promise.resolve().then(() => R.job(w, a)) : Promise.reject(new Error('no job')); },
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
  rec.select = () => rec.boxes.base.all().find(e => e.tagName === 'SELECT');
  rec.choose = c => { const s = rec.select(); s.value = c; s.fire('change'); };
  return rec;
}
function start(o) { const L0 = load(o); const R = stubV(L0, o); L0.part.init(R.V); return Object.assign(R, { L0 }); }
const ops = (log, op) => log.filter(x => x.op === op);
const PALS = { height: 'height', gtype: 'ground.types', material: 'ground.materials', slopecls: 'slope.classes', shade: 'height.shade', contours: 'height.contour' };
const palPart = p => { if (!p) return null; let v = PAL; for (const k of p.split('.')) v = v && v[k]; return v === undefined ? null : v; };
function gridEnv(g, name) {
  name = name || g.name; const pal = PALS[name] || null;
  return { v: 1, kind: 'grid', name, map: 'multi/mv_fixture', target: 'mowas2', w: g.w, h: g.h, cell: g.cell, ox: g.ox, oy: g.oy, etype: g.etype, sample: g.sample,
    scale: g.scale, offset: g.offset, nodata: g.nodata, meta: clone(g.meta), data: Buffer.from(g.data.buffer, g.data.byteOffset, g.data.byteLength).toString('base64'), pal, palette: palPart(pal) };
}
function px(put, i, j) { const img = put.args[0], o = ((img.height - 1 - j) * img.width + i) * 4; return [img.data[o], img.data[o + 1], img.data[o + 2], img.data[o + 3]]; }
const hexRgba = hx => { const m = /^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/.exec(hx); const v = parseInt(m[1], 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255, m[2] ? parseInt(m[2], 16) : 255]; };
const notFound = need => Object.assign(new Error('MV_NOT_FOUND'), { status: 404, key: 'mapviz.err.MV_NOT_FOUND', params: { msg: 'not made', need } });
const PARTS = render => ({ v: 1, parts: [{ part: 'mapkit', id: 'MV-KIT', wave: 'A', state: 'built' }, { part: 'raster', id: 'MV-RAS', wave: 'A', state: 'built' }, { part: 'render', id: 'MV-R1', wave: 'B', state: render }], styles: [] });
// a tile header: 4 x 3 tiles of 256 px at z 0
const HD = { v: 1, kind: 'tiles', base: 'topo', z: 0, zmax: 2, w: 1024, h: 768, ox: -640, oy: -480, cell: 1.25, box: [-640, -480, 640, 480] };
const tilesAns = (b, o) => Object.assign({}, HD, { base: b.base, z: +b.z, tiles: String(b.t).split(',').map(t => (o && o.missing ? { t, missing: true } : { t, png: PNG })) });
// contour items as README 5.3 gives them
const CONT = { v: 1, kind: 'vector', name: 'contours', pal: 'height.contour', palette: PAL.height.contour, items: [
  { kind: 'contour', level: 2.5, index: false, pts: [[-300, -100], [-200, 0], [-100, 100]] },
  { kind: 'contour', level: 5, index: true, pts: [[-260, -100], [-200, -40], [-140, 20]] },
  { kind: 'contourLabel', level: 5, x: -200, y: -40, angle: 45 }] };

(async () => {
  // ---- RMT ----
  { const L0 = load(), R = stubV(L0, { q: { rmt: true } }); L0.part.init(R.V);
    ok(R.layers.length === 0 && R.panels.length === 0 && R.calls.length === 0, 'RMT: no layer, no panel, no call'); }

  // ---- layers ----
  const A = start();
  { const by = Object.fromEntries(A.layers.map(l => [l.id, l]));
    ok(same(A.layers.map(l => l.id), ['base', 'shade', 'height', 'contours', 'slopecls']), 'five layers', A.layers.map(l => l.id));
    ok(by.base.group === 'base' && by.base.engineTrue === false && by.base.defaultOn === true && !by.base.source, 'base: group base, a picture (not engine true), on, fetched by the part itself');
    ok(['shade', 'height', 'contours', 'slopecls'].every(id => by[id].group === 'height' && by[id].defaultOn === false && by[id].source === id), 'height layers: group height, off by default, read their product');
    ok(by.shade.engineTrue === false && by.height.engineTrue === true && by.contours.engineTrue === true && by.slopecls.engineTrue === true, 'engine true: height, contours, slope classes; shaded relief is not');
    ok(A.layers.every(l => /^mapviz\.base\./.test(l.label)), 'labels are language keys');
    const sl = by.slopecls.legend(A.V);
    ok(sl.length === 3 && sl[0].label === en('mapviz.base.slopeBlock').replace('{deg}', 42).replace('{who}', en('mapviz.shell.kind.inf')) && sl[0].color === PAL.slope.classes[7] && sl[1].label === en('mapviz.base.slopeBlock').replace('{deg}', 24).replace('{who}', en('mapviz.shell.kind.at')) && sl[1].color === PAL.slope.classes[4]
      && sl[2].label === en('mapviz.base.slopeBlock').replace('{deg}', 30).replace('{who}', en('mapviz.shell.kind.tank')) && sl[2].color === PAL.slope.classes[5], 'slope legend (AS2): vanilla pather.set block angles per kind (inf 42, AT gun 24, tank 30) and their class colours', sl);
    { const G = start({ q: { target: 'goh' } }), gl = G.layers.find(l => l.id === 'slopecls').legend(G.V);
      ok(gl.length === 3 && gl[0].label === en('mapviz.base.slopeBlock').replace('{deg}', 54).replace('{who}', en('mapviz.shell.kind.inf')) && gl[0].color === PAL.slope.classes[9] && gl[1].label === en('mapviz.base.slopeCost').replace('{deg}', 30).replace('{who}', en('mapviz.shell.kind.at')) && gl[2].label === en('mapviz.base.slopeCost').replace('{deg}', 18).replace('{who}', en('mapviz.shell.kind.tank')) && gl[2].color === PAL.slope.classes[3],
        'slope legend (GoH): inf blocked at 54, AT gun and tank never blocked, cost from 30 and 18 (vanilla GoH pather.set)', gl); }
    ok(A.calls.length === 0, 'building makes no call'); }

  // ---- the picker and the parts route ----
  { const B = start({ routes: { parts: () => PARTS('not built') } });
    const opts = () => B.select().children.map(o => [o.attrs.value, o.textContent, 'disabled' in o.attrs]);
    ok(same(opts().map(x => x[0]), ['topo', 'l0', 'l1', 'gtype', 'material', 'none']), 'base choices', opts());
    ok(opts()[1][2] && opts()[2][2] && !opts()[0][2], 'before the parts route: the pictures of the render part count as not built');
    B.V.emit('refresh', {}); await H.flush();
    ok(B.calls.filter(c => c.p === 'parts').length === 1 && B.calls.every(c => c.m === 'GET'), 'refresh reads the parts route once (GET)');
    ok(opts()[1][1] === 'Schematic picture (not built)' && opts()[1][2] && opts()[2][2] && !opts()[3][2], 'render not built: schematic and ground pictures shown as not built', opts());
    B.V.emit('refresh', {}); await H.flush(); ok(B.calls.filter(c => c.p === 'parts').length === 1, 'a second refresh does not read the parts again');
    B.choose('l0'); const r = B.draw('base', null);
    ok(!r.err && r.log.length === 0 && !B.calls.some(c => c.p === 'tiles' && c.b.base === 'l0'), 'a base not built: nothing drawn, no error, no tile call', r.err);
    ok(B.calls.filter(c => c.p === 'tiles').length === 1 && B.calls.find(c => c.p === 'tiles').b.base === 'topo', 'F2: the refresh asked the current choice (topo) once with no draw', B.calls.filter(c => c.p === 'tiles').map(c => c.b));
    ok(B.boxes.base.has(en('mapviz.base.notBuilt')), 'the status line says not built', B.boxes.base.textContent);
    const C = start({ routes: { parts: () => PARTS('built'), tiles: b => tilesAns(b) } });
    C.V.emit('refresh', {}); await H.flush();
    ok(C.select().children.every(o => !('disabled' in o.attrs)), 'render built: every base can be chosen');
    C.choose('l1'); C.draw('base', null); await H.flush();
    ok(C.calls.some(c => c.p === 'tiles' && c.b.base === 'l1'), 'the ground picture reads its tiles (base l1)'); }

  // ---- the Topographic preset: tiles and contours ----
  const T = start({ routes: { parts: () => PARTS('built'), tiles: b => tilesAns(b), layer: b => (b.name === 'contours' ? CONT : Promise.reject(new Error('no ' + b.name))) } });
  { const pre = T.boxes.base.all().find(e => e.tagName === 'BUTTON');
    ok(pre && pre.textContent === en('mapviz.base.preset') && pre.attrs['aria-pressed'] === 'true', 'the Topographic preset is on at the start');
    T.choose('none'); ok(pre.attrs['aria-pressed'] === 'false', 'another base: the preset is off');
    pre.click(); ok(T.select().value === 'topo' && pre.attrs['aria-pressed'] === 'true', 'one click on the preset: topographic base');
    T.draw('base', null); await H.flush();
    const first = T.calls.find(c => c.p === 'tiles');
    ok(first && first.b.base === 'topo' && first.b.z === 0 && first.b.t === '0.0', 'first the tile header (z 0, tile 0.0)', first);
    T.draw('base', null); await H.flush();
    const more = T.calls.filter(c => c.p === 'tiles').slice(1);
    ok(more.length === 1 && more[0].b.t.split(',').length === 11, 'then the other 11 tiles of the view in one batch', more.map(c => c.b.t));
    const v = mkView(null), r = T.draw('base', null, v), di = ops(r.log, 'drawImage');
    ok(!r.err && di.length === 12, 'twelve tiles drawn', { err: r.err, n: di.length });
    const t = T.L0.X.mapviz._t, hd = Object.assign({}, HD);
    const want = []; for (let iy = 0; iy < 3; iy++) for (let ix = 0; ix < 4; ix++) { const q = t.tileRect(hd, 0, ix, iy), p = v.toScreen(q.x, q.y); want.push([p[0], p[1], q.s * 0.5, q.s * 0.5]); }
    ok(di.every((d, k) => d.args.every((a, i) => near(a, want[k][i]))), 'tiles at the shell\'s tile rectangles (README 5.2, north-west anchor)', di.slice(0, 2).map(d => d.args));
    ok(near(di[0].args[0], 80) && near(di[0].args[1], 60) && near(di[0].args[2], 160), 'tile 0.0 at the north-west corner (-640, 480)');
    // tile seams: at a zoom and pan that put tile edges between pixels, every tile is drawn on whole pixels and each
    // tile's right (bottom) edge is its neighbour's left (top) edge
    { const vs = mkView(null, { zoom: 0.82, cx: 13.37, cy: -7.9 }); T.draw('base', null, vs); await H.flush(); const ds = ops(T.draw('base', null, vs).log, 'drawImage').map(d => d.args), at = {};
      ds.forEach(a => { at[a[0] + ',' + a[1]] = a; });
      const xs = [...new Set(ds.map(a => a[0]))].sort((a, b) => a - b), ys = [...new Set(ds.map(a => a[1]))].sort((a, b) => a - b), bad = [];
      ds.forEach(a => { if (!a.every(Number.isInteger)) bad.push('not whole ' + a); const i = xs.indexOf(a[0]), j = ys.indexOf(a[1]);
        if (i < xs.length - 1 && a[0] + a[2] !== xs[i + 1]) bad.push('x seam ' + a); if (j < ys.length - 1 && a[1] + a[3] !== ys[j + 1]) bad.push('y seam ' + a); });
      ok(ds.length >= 4 && !bad.length, 'tile seams: the base mosaic at zoom 0.82 lies on whole pixels with shared edges', { n: ds.length, bad: bad.slice(0, 3) }); }
    // contours with the preset
    const st = ops(r.log, 'stroke');
    ok(st.length === 2 && st[0].strokeStyle === 'rgba(122,90,58,1)' && st[1].strokeStyle === 'rgba(90,62,34,1)' && st[0].lineWidth === 0.75 && st[1].lineWidth === 1.5, 'contours: line and index line, palette colours and widths', st.map(s => [s.strokeStyle, s.lineWidth]));
    const ft = ops(r.log, 'fillText'), ro = ops(r.log, 'rotate'), trn = ops(r.log, 'translate');
    ok(ft.length === 1 && ft[0].args[0] === '5 m' && ops(r.log, 'strokeText').length === 1, 'index label with its height in metres and a halo', ft.map(x => x.args));
    ok(ro.length === 1 && near(ro[0].args[0], -Math.PI / 4) && trn.length === 1 && near(trn[0].args[0], v.toScreen(-200, -40)[0]), 'the label turned along the line at its place', [ro, trn].map(x => x.map(y => y.args)));
    ok(ops(T.draw('contours', CONT).log, 'stroke').length === 0, 'the contours layer stays quiet under the topographic base (no double lines)');
    T.choose('none'); ok(ops(T.draw('contours', CONT).log, 'stroke').length === 2, 'with another base the contours layer draws');
    T.choose('topo');
    // zoom out: the level follows the zoom, clamped to zmax
    T.draw('base', null, mkView(null, { zoom: 0.05 })); await H.flush();
    ok(T.calls.filter(c => c.p === 'tiles').some(c => c.b.z === 2), 'far out: tiles of level zmax 2'); }
  // the part's keys hold the context: the same map, mode and target in another game folder or mod is another entry
  { const K = start({ routes: { parts: () => PARTS('built'), tiles: b => tilesAns(b) } });
    K.V.emit('refresh', {}); await H.flush();
    const heads = () => K.calls.filter(c => c.p === 'tiles' && c.b.t === '0.0').length, h0 = heads();
    K.q.game = '<game two>'; K.V.emit('map', { key: 'multi/mv_fixture', mode: 'battle_zones', doc: K.V.doc }); await H.flush();
    const h1 = heads(); K.q.mod = '<mod>'; K.V.emit('map', { key: 'multi/mv_fixture', mode: 'battle_zones', doc: K.V.doc }); await H.flush();
    ok(h0 === 1 && h1 === 2 && heads() === 3, 'keys hold the context: another game folder, then a mod, each read the topographic header again', [h0, h1, heads()]); }
  // missing tiles, no Image: nothing drawn, no throw
  { const M = start({ routes: { tiles: b => tilesAns(b, { missing: true }) } });
    M.draw('base', null); await H.flush(); const r = M.draw('base', null);
    ok(!r.err && ops(r.log, 'drawImage').length === 0, 'missing tiles: nothing drawn, no error');
    const N = start({ noImage: true, routes: { tiles: b => tilesAns(b) } });
    N.draw('base', null); await H.flush(); const r2 = N.draw('base', null);
    ok(!r2.err && ops(r2.log, 'drawImage').length === 0, 'no Image in the page: no tile drawn, no error'); }
  // a picture not made yet: the Make button runs its job
  { let made = false;
    const M = start({ routes: { tiles: b => { if (!made) throw notFound({ what: 'topo', args: { size: 1024 } }); return tilesAns(b); }, job: (w, a) => { made = true; return { id: 'j1', state: 'done' }; } } });
    M.draw('base', null); await H.flush();
    const btn = M.boxes.base.all().filter(e => e.tagName === 'BUTTON').find(b => b.textContent === en('mapviz.base.make'));
    ok(M.boxes.base.has(en('mapviz.base.need')) && !!btn, 'not made yet: the status says so, with a Make button', M.boxes.base.textContent);
    ok(!M.calls.some(c => c.job), 'no job without a click');
    btn.click(); await H.flush();
    const j = M.calls.find(c => c.job);
    ok(j && j.job === 'topo' && j.a.size === 1024, 'Make runs the job the need names', j);
    M.draw('base', null); await H.flush(); M.draw('base', null); await H.flush();
    ok(ops(M.draw('base', null).log, 'drawImage').length > 0, 'after the job the tiles are read again and drawn');
    const NB = start({ routes: { tiles: () => { throw Object.assign(new Error('MV_NOT_BUILT'), { status: 501, key: 'mapviz.err.MV_NOT_BUILT', params: { msg: 'raster' } }); } } });
    NB.draw('base', null); await H.flush();
    ok(!NB.draw('base', null).err && NB.boxes.base.has(en('mapviz.base.notBuilt')), 'a part answering not built: shown as not built, not as an error', NB.boxes.base.textContent);
    const BH = start({ routes: { tiles: () => ({ v: 1, kind: 'tiles', w: 0, h: 0, cell: 0, tiles: [] }) } });
    BH.draw('base', null); await H.flush();
    ok(BH.draw('base', null).err === en('mapviz.base.na'), 'seeded: a bad tile header is not available'); }
  // W3: while the topo job runs (this part's press or another's) the status keeps the job words and offers no second
  // Make it; a mode change does not make the topographic picture "not made" again (its key leaves the mode out)
  { let made = false, asks = 0, rel = null;
    const jobs = [];
    const M = start({ q: { jobs }, routes: { tiles: b => { if (String(b.t) === '0.0') asks++; if (!made) throw notFound({ what: 'topo', args: { size: 1024 } }); return tilesAns(b); },
      job: () => new Promise(r => { rel = r; }) } });
    M.draw('base', null); await H.flush();
    ok(M.boxes.base.has(en('mapviz.base.need')), 'W3 setup: not made yet');
    jobs.push({ id: 'x1', what: 'topo', target: 'mowas2', map: 'multi/mv_fixture', state: 'running', text: 'Topographic picture: tiles, 2 of 8' });
    M.V.emit('job', jobs[0]);
    const btns = () => M.boxes.base.all().filter(e => e.tagName === 'BUTTON' && e.textContent === en('mapviz.base.make'));
    ok(M.boxes.base.has(en('mapviz.base.makingJob').replace('{job}', 'Topographic picture: tiles, 2 of 8')) && btns().length === 0, 'W3: a running topo job of another part: its words, no Make it', M.boxes.base.textContent);
    jobs[0].text = 'Topographic picture: tiles, 5 of 8'; M.V.emit('job', jobs[0]);
    ok(M.boxes.base.has('5 of 8'), 'W3: the progress follows the job event', M.boxes.base.textContent);
    // the mode changes while it runs: still the running words, not "not made"
    M.q.mode = 'combat'; M.V.emit('map', { key: 'multi/mv_fixture', mode: 'combat', doc: M.V.doc }); M.draw('base', null); await H.flush();
    ok(M.boxes.base.has('5 of 8') && !M.boxes.base.has(en('mapviz.base.need')), 'W3: a mode change keeps the running words (the topo key has no mode)', M.boxes.base.textContent);
    ok(asks === 1, 'W3: the mode change does not ask the topo tiles again', asks);
    // W1: the job ends (gone from V.q jobs) and the page tells the parts ('products'): the entry not made asks again once
    jobs.length = 0; made = true; M.V.emit('job', { id: 'x1', what: 'topo', end: true, state: 'done' }); M.V.emit('products', {});
    M.draw('base', null); await H.flush(); M.draw('base', null); await H.flush();
    ok(asks === 2 && !M.boxes.base.has(en('mapviz.base.need')) && ops(M.draw('base', null).log, 'drawImage').length > 0, 'W1: after the job ended the picture asked again once and is drawn', [asks, M.boxes.base.textContent]);
    M.V.emit('products', {}); M.draw('base', null); await H.flush();
    ok(asks === 2, 'W1: a later products event with nothing not made asks nothing', asks);
    // own press: the status keeps the making words until the job ends; no second button
    made = false; const M2 = start({ q: { jobs: [] }, routes: { tiles: b => { if (!made) throw notFound({ what: 'topo', args: { size: 1024 } }); return tilesAns(b); }, job: () => new Promise(r => { rel = r; }) } });
    M2.draw('base', null); await H.flush();
    M2.boxes.base.all().find(e => e.tagName === 'BUTTON' && e.textContent === en('mapviz.base.make')).click(); await H.flush();
    M2.V.emit('job', {}); M2.V.emit('products', {}); await H.flush();
    ok(M2.boxes.base.has(en('mapviz.base.making')) && !M2.boxes.base.all().some(e => e.tagName === 'BUTTON' && e.textContent === en('mapviz.base.make')), 'W3: after Make it the status stays on making, even through other job events', M2.boxes.base.textContent);
    ok(M2.calls.filter(c => c.job).length === 1, 'W3: one job post');
    made = true; rel({ state: 'done' }); await H.flush(); M2.draw('base', null); await H.flush();
    ok(!M2.boxes.base.has(en('mapviz.base.making')) && !M2.boxes.base.has(en('mapviz.base.need')), 'W3: the job ended: the making words go', M2.boxes.base.textContent); }
  // P4: a running topo job of another size (its posted key fields, args) is not the one the picture needs: Make it stays.
  // P3: with no draw at all (base layer or group off), 'products' asks for the current choice at once, so the status does
  // not stay on "Reading the picture" with no button; an entry whose own job still runs waits
  { let made = false, asks = 0;
    const jobs = [];
    const P = start({ q: { jobs }, routes: { tiles: b => { if (String(b.t) === '0.0') asks++; if (!made) throw notFound({ what: 'topo', args: { size: 1024 } }); return tilesAns(b); }, job: () => new Promise(() => {}) } });
    P.draw('base', null); await H.flush();
    const btns = () => P.boxes.base.all().filter(e => e.tagName === 'BUTTON' && e.textContent === en('mapviz.base.make'));
    ok(P.boxes.base.has(en('mapviz.base.need')) && btns().length === 1 && asks === 1, 'P3/P4 setup: the topographic picture is not made', P.boxes.base.textContent);
    jobs.push({ id: 's2', what: 'topo', target: 'mowas2', map: 'multi/mv_fixture', args: { map: 'multi/mv_fixture', size: 2048 }, state: 'running', text: 'Topographic picture: other size' }); P.V.emit('job', jobs[0]);
    ok(btns().length === 1 && !P.boxes.base.has('other size'), 'P4: a topo job of another size does not take the Make button away', P.boxes.base.textContent);
    jobs[0] = { id: 's1', what: 'topo', target: 'mowas2', map: 'multi/mv_fixture', args: { map: 'multi/mv_fixture', size: 1024 }, state: 'running', text: 'Topographic picture: tiles, 1 of 8' }; P.V.emit('job', jobs[0]);
    ok(btns().length === 0 && P.boxes.base.has('1 of 8'), 'P4: the topo job of the needed size shows its words, no Make it', P.boxes.base.textContent);
    const a0 = asks; P.V.emit('products', {}); await H.flush();
    ok(asks === a0 && P.boxes.base.has('1 of 8'), 'P3: products while its own job still runs: the entry waits, no ask', [asks - a0, P.boxes.base.textContent]);
    jobs.length = 0; made = true; P.V.emit('job', { id: 's1', what: 'topo', end: true, state: 'done' }); P.V.emit('products', {}); await H.flush();
    ok(asks === a0 + 1 && !P.boxes.base.has(en('mapviz.base.loading')) && !P.boxes.base.has(en('mapviz.base.need')) && btns().length === 0, 'P3: no draw (layer off): products asked for the picture at once; the status is not left reading', [asks - a0, P.boxes.base.textContent]);
    // planted: the choice "none" asks nothing on products
    made = false; P.choose('none'); const a1 = asks; P.V.emit('products', {}); await H.flush();
    ok(asks === a1, 'P3 planted: the base choice none asks nothing on products', asks - a1); }
  // W6: a map the user picked opens with Topographic: its picture job starts by itself, once, and the status says so;
  // a map opened by a refresh (user false) or the l1 base never starts a job
  { let made = false;
    const W = start({ q: { jobs: [] }, routes: { tiles: b => { if (!made) throw notFound({ what: 'topo', args: { size: 1024 } }); return tilesAns(b); }, job: () => new Promise(() => {}) } });
    W.V.emit('map', { key: 'multi/mv_fixture', mode: 'battle_zones', doc: W.V.doc, user: false }); await H.flush();
    ok(!W.calls.some(c => c.job), 'W6: a map opened without a pick (refresh, S.mapKey, permalink) starts no job');
    W.V.emit('map', { key: 'multi/mv_fixture', mode: 'battle_zones', doc: null, user: true }); await H.flush();
    ok(!W.calls.some(c => c.job), 'W6: no job before the document is read');
    const W2 = start({ q: { jobs: [] }, routes: { tiles: b => { if (!made) throw notFound({ what: 'topo', args: { size: 1024 } }); return tilesAns(b); }, job: () => new Promise(() => {}) } });
    W2.V.emit('map', { key: 'multi/mv_fixture', mode: 'battle_zones', doc: W2.V.doc, user: true }); await H.flush();
    const jb = W2.calls.filter(c => c.job);
    ok(jb.length === 1 && jb[0].job === 'topo' && jb[0].a.size === 1024, 'W6: a picked map with the Topographic base starts the topo job by itself', W2.calls);
    ok(W2.boxes.base.has(en('mapviz.base.auto')), 'W6: the status says the picture is being made by itself', W2.boxes.base.textContent);
    W2.V.emit('map', { key: 'multi/mv_fixture', mode: 'combat', doc: W2.V.doc, user: true }); W2.V.emit('products', {}); await H.flush();
    ok(W2.calls.filter(c => c.job).length === 1, 'W6: once per open (a mode change or a products event starts no second job)');
    const W3 = start({ q: { jobs: [] }, routes: { parts: () => PARTS('built'), tiles: b => { throw notFound({ what: b.base, args: { size: 1024 } }); }, job: () => new Promise(() => {}) } });
    W3.V.emit('refresh', {}); await H.flush(); W3.choose('l1');
    W3.V.emit('map', { key: 'multi/mv_fixture', mode: 'battle_zones', doc: W3.V.doc, user: true }); await H.flush(); W3.draw('base', null); await H.flush();
    ok(!W3.calls.some(c => c.job) && W3.boxes.base.all().some(e => e.tagName === 'BUTTON' && e.textContent === en('mapviz.base.make')), 'W6: the ground picture (l1) still waits for a click', W3.calls.filter(c => c.job));
    const W4 = start({ q: { jobs: [{ id: 'o', what: 'topo', target: 'mowas2', map: 'multi/mv_fixture', state: 'running', text: 'Topographic picture: tiles' }] }, routes: { tiles: () => { throw notFound({ what: 'topo', args: { size: 1024 } }); }, job: () => new Promise(() => {}) } });
    W4.V.emit('map', { key: 'multi/mv_fixture', mode: 'battle_zones', doc: W4.V.doc, user: true }); await H.flush();
    ok(!W4.calls.some(c => c.job) && W4.boxes.base.has('Topographic picture: tiles'), 'W6: a topo job already running for the map is not started again; its words show', W4.boxes.base.textContent); }

  // F2: the status with no draw at all (base layer or group off, no canvas): the map open with its document asks the
  // current choice once, so "not made" shows with its Make button; while the topo job runs (no entry yet) its words
  // show and nothing is asked; after it ends the picture is asked once; after the user's own Make it is asked again
  { let made = false, asks = 0, rel = null;
    const jobs = [];
    const F = start({ q: { jobs }, routes: { tiles: b => { if (String(b.t) === '0.0') asks++; if (!made) throw notFound({ what: 'topo', args: { size: 1024 } }); return tilesAns(b); }, job: () => new Promise(r => { rel = r; }) } });
    const btns = () => F.boxes.base.all().filter(e => e.tagName === 'BUTTON' && e.textContent === en('mapviz.base.make'));
    F.V.emit('map', { key: 'multi/mv_fixture', mode: 'battle_zones', doc: F.V.doc, user: false }); await H.flush();
    ok(asks === 1 && F.boxes.base.has(en('mapviz.base.need')) && btns().length === 1 && !F.boxes.base.has(en('mapviz.base.loading')), 'F2: map open, no draw: the picture is asked once; not made with Make it (not left reading)', [asks, F.boxes.base.textContent]);
    F.V.emit('map', { key: 'multi/mv_fixture', mode: 'battle_zones', doc: F.V.doc, user: false }); F.V.emit('refresh', {}); F.V.emit('job', {}); await H.flush();
    ok(asks === 1, 'F2: further map, refresh and job events ask no second time (one fetch per key)', asks);
    btns()[0].click(); await H.flush();
    ok(F.boxes.base.has(en('mapviz.base.making')) && btns().length === 0, 'F2: own Make with no draw: making words', F.boxes.base.textContent);
    made = true; rel({ state: 'done' }); await H.flush();
    ok(asks === 2 && !F.boxes.base.has(en('mapviz.base.loading')) && !F.boxes.base.has(en('mapviz.base.need')) && !F.boxes.base.has(en('mapviz.base.making')), 'F2: after the own Make ended the picture was asked again with no draw; the status is settled', [asks, F.boxes.base.textContent]);
    // another map whose topo job already runs (no entry yet): its words, no fetch; it ends: asked once
    made = false; asks = 0; F.q.map = 'multi/two';
    jobs.push({ id: 'o2', what: 'topo', target: 'mowas2', map: 'multi/two', state: 'running', text: 'Topographic picture: tiles, 3 of 8' });
    F.V.emit('map', { key: 'multi/two', mode: 'battle_zones', doc: F.V.doc, user: false }); await H.flush();
    ok(asks === 0 && F.boxes.base.has('3 of 8') && btns().length === 0 && !F.boxes.base.has(en('mapviz.base.loading')), 'F2: while that choice\'s own job runs nothing is asked; its words show', [asks, F.boxes.base.textContent]);
    jobs.length = 0; made = true; F.V.emit('job', { id: 'o2', what: 'topo', end: true, state: 'done' }); F.V.emit('products', {}); await H.flush();
    ok(asks === 1 && !F.boxes.base.has('3 of 8') && !F.boxes.base.has(en('mapviz.base.loading')), 'F2: the job ended (products): the picture is asked once, no draw needed', [asks, F.boxes.base.textContent]);
    // planted: before the page is live (no refresh, no map event) building and a status redraw ask nothing
    const Q = start({ routes: { tiles: b => tilesAns(b) } }); Q.V.emit('job', {}); await H.flush();
    ok(!Q.calls.some(c => c.p === 'tiles'), 'F2 planted: before a refresh or a map event the status asks nothing', Q.calls); }
  // F3: while the document is read (V.q('docBusy')) the part fetches nothing (no tile header, no contours, no layer); the
  // 'doc' event asks once
  { const D = start({ q: { docBusy: true }, routes: { tiles: b => tilesAns(b), layer: b => (b.name === 'contours' ? CONT : Promise.reject(new Error('no'))) } });
    D.V.emit('map', { key: 'multi/mv_fixture', mode: null, doc: null, user: true }); D.draw('base', null); D.draw('base', null); await H.flush();
    D.choose('gtype'); D.draw('base', null); D.choose('topo'); await H.flush();
    ok(D.calls.length === 0 && D.boxes.base.has(en('mapviz.base.loading')), 'F3: document being read: no fetch at all (draw, map event, a choice), the status reads', D.calls);
    D.q.docBusy = false; D.V.emit('doc', { key: 'multi/mv_fixture', ok: true }); await H.flush();
    const hq = D.calls.filter(c => c.p === 'tiles');
    ok(hq.length === 1 && hq[0].b.t === '0.0', 'F3: the doc event asks the tile header once', D.calls.map(c => c.p + ' ' + JSON.stringify(c.b)));
    D.draw('base', null); await H.flush();
    ok(D.calls.filter(c => c.p === 'layer' && c.b.name === 'contours').length === 1, 'F3: then the draw asks the contours once'); }

  // ---- the fixture grids (real mapkit and raster kernels) ----
  const K = opt(() => require(path.join(ROOT, 'lib/mapkit')), 'mapkit'), RA = opt(() => require(path.join(ROOT, 'lib/raster')), 'the raster kernels'), fx = opt(() => require(path.join(ROOT, 'test/fxmake')), 'the fixture maker');
  if (K && RA && fx) {
    const f = fx.make(path.join(SCR, 'fx-as2'), { form: 'as2' });
    const g = K.grids(K.source({ target: f.target, game: f.gameDir }), f.map, {});
    const envs = { gtype: gridEnv(g.gtype), material: gridEnv(g.material), height: gridEnv(g.height), shade: gridEnv(RA.hillshade(g.height), 'shade'), slopecls: gridEnv(RA.slopeClass(g.height), 'slopecls'),
      contours: Object.assign(RA.contoursVector(RA.contours(g.height)), { pal: 'height.contour', palette: PAL.height.contour }) };
    const G = start({ routes: { parts: () => PARTS('built'), layer: b => clone(envs[b.name]) } });
    // ground types: the pond (README 10.4) and the road rows
    G.choose('gtype'); G.draw('base', null); await H.flush();
    let r = G.draw('base', null);
    ok(!r.err && r.puts.length === 1, 'ground types drawn', r.err);
    if (r.puts[0]) {
      ok(same(px(r.puts[0], 94, 28), hexRgba(PAL.ground.types[5].fill)) && same(px(r.puts[0], 101, 28), hexRgba(PAL.ground.types[4].fill)) && same(px(r.puts[0], 107, 28), hexRgba(PAL.ground.types[3].fill)), 'pond cells (94,28) deep water, (101,28) water, (107,28) shallow');
      ok(same(px(r.puts[0], 111, 28), hexRgba(PAL.ground.types[1].fill)) && same(px(r.puts[0], 64, 68), hexRgba(PAL.ground.types[7].fill)), 'cell (111,28) loads as ground; the road row 68 is road'); }
    ok(G.boxes.base.has('Deep water') && G.boxes.base.has('Road') && !G.boxes.base.has('Swamp') && !G.boxes.base.has(en('mapviz.base.gt.other')), 'legend: the ground types of the drawn grid only', G.boxes.base.textContent);
    // seeded: a code with no palette entry (GoH 15) on the drawn grid gets the 'other' row in the ground type legend
    { const g15 = Object.assign({}, g.gtype, { data: Uint8Array.from(g.gtype.data) }); g15.data[0] = 15;
      const G15 = start({ routes: { parts: () => PARTS('built'), layer: b => (b.name === 'gtype' ? gridEnv(g15) : clone(envs[b.name])) } });
      G15.choose('gtype'); G15.draw('base', null); await H.flush(); G15.draw('base', null);
      const lr = G15.boxes.base.all().filter(e => e.tagName === 'SPAN').map(e => e.textContent.trim());
      ok(lr.indexOf(en('mapviz.base.gt.other')) >= 0 && G15.boxes.base.has('Deep water'), 'seeded: a ground type code with no palette entry shows as other in the legend', lr); }
    // materials by meta.names
    G.choose('material'); G.draw('base', null); await H.flush(); r = G.draw('base', null);
    ok(!r.err && r.puts[0] && same(px(r.puts[0], 64, 68), hexRgba(PAL.ground.materials.road)) && same(px(r.puts[0], 94, 28), hexRgba(PAL.ground.materials.deep_water)), 'materials: road and deep water colours through meta.names', r.puts[0] && [px(r.puts[0], 64, 68), px(r.puts[0], 94, 28)]);
    ok(G.boxes.base.has('Road') && G.boxes.base.has('Deep water') && !G.boxes.base.has('Sand'), 'legend: the materials of the map', G.boxes.base.textContent);
    // height bands, shade, slope classes, contours as layers
    r = G.draw('height', clone(envs.height));
    ok(!r.err && r.puts[0] && px(r.puts[0], 20, 50)[3] === 255 && !same(px(r.puts[0], 94, 28), px(r.puts[0], 44, 50)), 'height bands: pond bottom and ridge crest differ', r.err);
    if (r.puts[0]) { const cols = new Set(); for (let i = 0; i < 128; i++) for (let j = 0; j < 96; j++) cols.add(px(r.puts[0], i, j).join()); ok(cols.size <= 10 && cols.size >= 3, 'height: at most 10 bands', cols.size); }
    // band order: the lowest cell takes the first band (stops 0 to 0.1), the highest the last (0.9 to 1)
    if (r.puts[0]) { const H0 = g.height, sgn = (H0.scale || 1) > 0 ? 1 : -1; let lo = 0, hi = 0;
      for (let s = 1; s < H0.data.length; s++) { if (sgn * H0.data[s] < sgn * H0.data[lo]) lo = s; if (sgn * H0.data[s] > sgn * H0.data[hi]) hi = s; }
      const S0 = PAL.height.stops.map(s => ({ at: s.at, c: hexRgba(s.color) }));
      const at = t => { let k = 1; while (k < S0.length && t > S0[k].at) k++; const a = S0[k - 1], b = S0[k], u = (t - a.at) / (b.at - a.at); return [0, 1, 2, 3].map(j => Math.round(a.c[j] + (b.c[j] - a.c[j]) * u)); };
      const cl = s => px(r.puts[0], s % H0.w, Math.floor(s / H0.w));
      ok(same(cl(lo), at(0.05)) && same(cl(hi), at(0.95)), 'height bands: the lowest cell has the first band colour, the highest the last', { lo: [lo % H0.w, Math.floor(lo / H0.w), cl(lo), at(0.05)], hi: [hi % H0.w, Math.floor(hi / H0.w), cl(hi), at(0.95)] }); }
    r = G.draw('shade', clone(envs.shade));
    ok(!r.err && r.puts[0] && px(r.puts[0], 50, 48)[3] > px(r.puts[0], 10, 10)[3], 'shaded relief: the ridge flank stronger than flat land', r.puts[0] && [px(r.puts[0], 50, 48), px(r.puts[0], 10, 10)]);
    r = G.draw('slopecls', clone(envs.slopecls));
    ok(!r.err && r.puts.length === 1 && px(r.puts[0], 10, 10)[3] === 0, 'slope classes: flat land class 0 is clear', r.err);
    G.choose('none'); r = G.draw('contours', clone(envs.contours));
    ok(!r.err && ops(r.log, 'stroke').length === envs.contours.items.filter(x => x.kind === 'contour').length && ops(r.log, 'fillText').length === envs.contours.items.filter(x => x.kind === 'contourLabel').length, 'contours of the fixture: every line and label', r.err);
    // seeded defects on real envelopes
    const unk = Object.assign(clone(envs.height), { pal: 'no.such.pal' });
    ok(G.draw('height', unk).err === en('mapviz.base.na'), 'seeded: an envelope with an unknown pal is not available');
    ok(G.draw('slopecls', Object.assign(clone(envs.slopecls), { h: 95 })).err === en('mapviz.base.na'), 'seeded: a grid of the wrong size is not available');
    ok(G.draw('contours', { kind: 'grid', pal: 'height.contour' }).err === en('mapviz.base.na'), 'seeded: contours that are not a vector are not available');
    ok(['shade', 'height', 'contours', 'slopecls'].every(id => { const x = G.draw(id, null); return !x.err && x.log.length === 0; }), 'seeded: a missing envelope (not made yet) draws nothing, no error');
    ok(!G.draw('shade', clone(envs.shade)).err && !G.draw('height', clone(envs.height)).err, 'seeded: after the faults the other layers still draw');
    const NP = start({ pal: null });
    ok(NP.draw('height', Object.assign(clone(envs.height), { palette: null })).err === en('mapviz.base.na') && NP.layers.every(l => !l.legend || l.legend(NP.V) === null), 'seeded: no palette at all, not available and no legend');
    // a theme change makes the pictures again
    G.choose('gtype'); let te = null; try { G.V.emit('theme', {}); } catch (e) { te = e.message; }
    ok(!te && G.boxes.base.has('Deep water'), 'a theme change keeps the legend', te);
  }

  // ---- no off-screen canvas, no 2D methods ----
  { const L0 = load({ canvas: false }), R = stubV(L0, {}); L0.part.init(R.V);
    ok(R.draw('height', Object.assign(clone(FXA.as2.layer['water.band'].a), { pal: 'height', palette: PAL.height })).err === en('mapviz.base.na'), 'no off-screen canvas: a grid layer says not available');
    let err = null; try { R.layers.forEach(l => l.draw({}, mkView(l.id === 'contours' ? CONT : null))); } catch (e) { err = e.message; }
    ok(!err, 'a context without 2D methods throws nothing', err); }

  // ---- on the shell ----
  { const calls = [];
    const routes = {
      'GET /api/x/mapviz/palette': async () => PAL,
      'GET /api/x/mapviz/cache': async () => ({ v: 1, root: '<cache>', bytes: 0, cap: 1, entries: 0, jobs: 0 }),
      'GET /api/x/mapviz/doc': async () => clone(FXA.as2.doc.a),
      'GET /api/x/mapviz/parts': async () => PARTS('not built'),
      'GET /api/x/mapviz/tiles': async u => tilesAns({ base: u.searchParams.get('base'), z: u.searchParams.get('z'), t: u.searchParams.get('t') }),
      'GET /api/x/mapviz/layer': async u => { if (u.searchParams.get('name') === 'contours') return CONT; throw notFound({ what: 'terrain', args: {} }); },
    };
    const S = { gameId: 'mowas2', gameOv: '<game>', mod: '', mapKey: 'map/multi/mv_fixture' };
    const P = H.mkPage({ scripts: [SHELL, PART], lang: L, S, canvas: true, api: H.routeApi(routes, calls) });
    P.screen.refresh(); await H.flush(60); P.V.redraw(); await H.flush(30); P.V.redraw(); await H.flush(30);
    const tq = calls.filter(c => c.path === '/api/x/mapviz/tiles').map(c => new URL(c.url, 'http://x').searchParams);
    ok(tq.length >= 1 && tq.every(s => s.get('target') === 'mowas2' && s.get('map') === 'multi/mv_fixture' && s.get('base') === 'topo'), 'shell: tiles asked with the page target and map', tq.map(s => s.toString()));
    ok(P.log.some(x => x.op === 'drawImage' && x.src instanceof H.ImageStub), 'shell: topographic tiles drawn on the page canvas');
    ok(!P.root.has('cannot be drawn'), 'shell: no layer fault');
    const sel = P.root.all().find(e => e.tagName === 'SELECT' && e.children.some(o => o.attrs.value === 'l0'));
    ok(sel && 'disabled' in sel.children.find(o => o.attrs.value === 'l0').attrs, 'shell: the schematic picture is not built (parts route)');
    ok(calls.every(c => c.method === 'GET'), 'shell: GET only, no job without a user action', calls.map(c => c.method + ' ' + c.path));
    const C2 = [], P2 = H.mkPage({ scripts: [SHELL, PART], lang: L, S: Object.assign({}, S), canvas: false, api: H.routeApi(routes, C2) });
    let err = null; try { P2.screen.refresh(); await H.flush(30); } catch (e) { err = e.message; }
    ok(!err && C2.every(c => c.method === 'GET'), 'shell without a canvas: builds, no throw, no job', err);
    const C3 = [], P3 = H.mkPage({ scripts: [SHELL, PART], lang: L, S: Object.assign({}, S), canvas: true, rmt: true, api: H.routeApi(routes, C3) });
    try { P3.screen && P3.screen.refresh && P3.screen.refresh(); await H.flush(10); } catch (e) { err = e.message; }
    ok(!err && C3.length === 0, 'shell on RMT: no mapviz call', C3);
    // W6 on the shell: the topo picture not made; a refresh with S.mapKey starts no job, a user pick of a map starts the
    // topo job by itself once (and the job line and the status show its words while it runs); W3: no second Make it
    let made = false, posts = [], stop = false;
    const R4 = Object.assign({}, routes, {
      'GET /api/x/mapviz/tiles': async u => { if (!made) throw notFound({ what: 'topo', args: { size: 1024 } }); return tilesAns({ base: u.searchParams.get('base'), z: u.searchParams.get('z'), t: u.searchParams.get('t') }); },
      'POST /api/x/mapviz/job': async (u, b) => { posts.push(b); return { id: 'jt' + posts.length, shared: false, state: 'queued', queue: 0 }; },
      'GET /api/x/mapviz/job': async u => ({ id: u.searchParams.get('id'), what: 'topo', state: stop ? 'done' : 'running', stage: 'tiles', done: 1, total: 4, queue: 0 }) });
    const C4 = [], S4 = Object.assign({}, S), P4 = H.mkPage({ scripts: [SHELL, PART], lang: L, S: S4, canvas: true, api: H.routeApi(R4, C4) });
    P4.screen.refresh(); await H.flush(60); P4.V.redraw(); await H.flush(30);
    ok(posts.length === 0 && P4.root.has(en('mapviz.base.need')), 'W6 shell: a map opened by refresh (S.mapKey) starts no job; it shows not made', posts);
    P4.V.emit('map', { key: 'multi/other', pick: true }); await H.flush(60); P4.V.redraw(); await H.flush(30);
    ok(posts.length === 1 && posts[0].what === 'topo' && posts[0].map === 'multi/other', 'W6 shell: a user pick starts the topo job by itself, once', posts);
    await H.until(() => P4.root.has(L.en['mapviz.shell.stage.tiles'] + ', 1 of 4'), 3000);
    const st4 = H.blk(P4.root, 'mv.base.status');
    ok(st4 && st4.has(en('mapviz.base.auto').split('...')[0]) && st4.has(', 1 of 4') && !st4.all().some(e => e.tagName === 'BUTTON'), 'W6/W3 shell: the status says it is made by itself, with the job words, no button', st4 && st4.textContent);
    P4.V.redraw(); await H.flush(30); P4.V.emit('products', {}); await H.flush(30);
    ok(posts.length === 1, 'W3 shell: redraws and products while it runs post no second job', posts.length);
    P4.screen.refresh(); await H.flush(30);
    ok(posts.length === 1, 'W6 shell: a refresh while it runs starts nothing', posts.length);
    made = true; stop = true; await H.until(() => !P4.root.has(', 1 of 4'), 3000); await H.flush(30);
    // F2 on the shell: the base layer tick off, or no canvas: the map opens and the status says not made with Make it,
    // never "Reading the picture" with no button
    made = false;
    for (const how of ['tick off', 'no canvas']) {
      let end5 = false;
      const C5 = [], P5 = H.mkPage({ scripts: [SHELL, PART], lang: L, S: Object.assign({}, S), canvas: how !== 'no canvas', api: H.routeApi(Object.assign({}, R4, { 'GET /api/x/mapviz/job': async u => ({ id: u.searchParams.get('id'), what: 'topo', state: end5 ? 'done' : 'running', stage: 'tiles', done: 1, total: 4, queue: 0 }) }), C5) });
      if (how === 'tick off') { const cb = H.blk(P5.root, 'mv.l.base').all().find(e => e.tagName === 'INPUT'); cb.checked = false; cb.fire('change'); }
      P5.screen.refresh(); await H.until(() => P5.V.doc, 3000); await H.flush(60);
      const s5 = () => H.blk(P5.root, 'mv.base.status');
      ok(s5().has(en('mapviz.base.need')) && s5().all().some(e => e.tagName === 'BUTTON') && !s5().has(en('mapviz.base.loading')), 'F2 shell (' + how + '): map open: not made with Make it, not left reading', s5().textContent);
      ok(!P5.log.some(x => x.op === 'drawImage'), 'F2 shell (' + how + '): no tile drawn');
      // the user's pick starts the topo job by itself; its words show while it runs (no draw)
      P5.V.emit('map', { key: 'multi/third', pick: true }); await H.until(() => s5().has(', 1 of 4'), 3000);
      ok(s5().has(en('mapviz.base.auto').split('...')[0]) && s5().has(', 1 of 4'), 'F2 shell (' + how + '): while the topo job runs its words show', s5().textContent);
      // it ends done: the picture is asked again with no draw and the status settles (no reading words, no job words)
      const t5 = C5.filter(c => c.path === '/api/x/mapviz/tiles').length;
      made = true; end5 = true; await H.until(() => !s5().has(', 1 of 4'), 3000); await H.flush(60);
      ok(C5.filter(c => c.path === '/api/x/mapviz/tiles').length > t5 && !s5().has(en('mapviz.base.loading')) && !s5().has(en('mapviz.base.need')), 'F2 shell (' + how + '): after the job the picture is asked again, the status settles', s5().textContent);
      made = false;
    }
    // F3 on the shell: a pick whose document comes late: no tiles or layer fetch before it lands; then every one carries the mode
    { let rel = null;
      const R6 = Object.assign({}, routes, { 'GET /api/x/mapviz/doc': () => new Promise(r => { rel = () => r(clone(FXA.as2.doc.a)); }) });
      const C6 = [], P6 = H.mkPage({ scripts: [SHELL, PART], lang: L, S: Object.assign({}, S, { mapKey: '' }), canvas: true, api: H.routeApi(R6, C6) });
      P6.screen.refresh(); await H.flush(30);
      P6.V.emit('map', { key: 'multi/mv_fixture', pick: true }); await H.until(() => rel, 3000); P6.V.redraw(); await H.flush(30);
      ok(!C6.some(c => c.path === '/api/x/mapviz/tiles' || c.path === '/api/x/mapviz/layer'), 'F3 shell: no tile or layer fetch while the document is read', C6.map(c => c.url));
      rel(); await H.flush(60); P6.V.redraw(); await H.flush(30);
      const q6 = C6.filter(c => c.path === '/api/x/mapviz/tiles' || c.path === '/api/x/mapviz/layer').map(c => new URL(c.url, 'http://x').searchParams);
      ok(q6.length >= 2 && q6.every(s => !!s.get('mode')) && q6.some(s => s.get('name') === 'contours'), 'F3 shell: after the document every tile and contours fetch carries the mode', q6.map(s => s.toString())); } }

  // ---- language ----
  { const SRC = String(PART), used = new Set(), codes = ['en', 'ru', 'uk', 'zh'];
    for (const m of SRC.matchAll(/'(mapviz\.base\.[A-Za-z0-9_.]*[A-Za-z0-9_])'/g)) used.add(m[1]);
    for (const c of ['topo', 'l0', 'l1', 'gtype', 'material', 'none']) used.add('mapviz.base.c.' + c);
    for (let i = 0; i <= 11; i++) used.add('mapviz.base.gt.' + i);
    for (const n of Object.keys(PAL.ground.materials).filter(n => n !== 'other')) used.add('mapviz.base.mat.' + n);
    ok(Object.keys(LB).sort().join() === codes.slice().sort().join(), 'lang: exactly en, ru, uk, zh');
    const miss = []; for (const k of used) for (const c of codes) if (!(LB[c] && LB[c][k])) miss.push(c + ' ' + k);
    ok(!miss.length, 'lang: every key used is in all four languages (' + used.size + ')', miss.join(', '));
    const unused = Object.keys(LB.en).filter(k => !used.has(k) && !(/\.1$/.test(k) && used.has(k.slice(0, -2))));
    ok(!unused.length, 'lang: every key in the file is used', unused.join(', '));
    const slots = s => (String(s).match(/\{\w+\}/g) || []).sort().join();
    const bad = []; for (const c of codes) for (const k of Object.keys(LB[c])) { const v = LB[c][k];
      if (/^TODO:/.test(v) || v.indexOf(String.fromCharCode(8212)) >= 0 || / - /.test(v)) bad.push(c + ' ' + k); if (slots(v) !== slots(LB.en[k])) bad.push(c + ' ' + k + ' slots'); if (!(k in LB.en)) bad.push(c + ' extra ' + k); }
    ok(!bad.length, 'lang: same slots, no TODO, no dash separator', bad.join(', '));
    const uk = start({ code: 'uk' });
    ok(uk.boxes.base.has(LB.uk['mapviz.base.preset']) && uk.select().children[0].textContent === LB.uk['mapviz.base.c.topo'], 'lang: the panel speaks Ukrainian'); }
  { const SRC = String(PART);
    ok(!/#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/.test(SRC), 'no colour literal in the part');
    ok(!/`|\$\{|innerHTML|=>|\blet\b|\bconst\b/.test(SRC), 'ES5 template: no backtick, no dollar brace, no innerHTML, no arrow, no let or const'); }

  if (failN) { console.log('FAIL mapviz base: ' + failN + ' failed, ' + pass + ' passed'); process.exit(1); }
  console.log('PASS mapviz base (' + pass + ')');
})().catch(e => { console.log('FAIL mapviz base: ' + (e && e.stack || e)); process.exit(1); });

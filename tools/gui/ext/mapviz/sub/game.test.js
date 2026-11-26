// Map Viewer game marks test (MV-PG1): node tools/gui/ext/mapviz/sub/game.test.js [scratch dir]
// The game part on a stub V that records addLayer and draw calls, in the fake DOM: layers and groups, the fixture flag
// zones, spawns and boxes drawn where tools/mapviz/README.md 10.4 puts them (AS2 doc from fxanswers.json), the GoH
// polygon zone, the side picker, the DOM list repeating everything drawn, hits inside a zone; seeded defects: a mode
// without spawns, a broken zone, no mode, no doc (the others still draw); RMT makes no call; then the part on the shell
// (harness from shell.test.js) with and without a canvas; the language file both ways; no colour literal.
// Author: Imperator_Aug (ARSENAL, ia-6a1eafa4)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const SCR = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'mv-game-')));
fs.mkdirSync(SCR, { recursive: true });
process.env.ARSENAL_CACHE = path.join(SCR, 'cache');
const { harness: H } = require('./shell.test');
const fake = require('../../../test/fakedom');
const SHELL = require('./shell.client'), PART = require('./game.client');
const LG = require('./game.lang.json'), L = H.mergeLang([require('./shell.lang.json'), LG]);
const PAL = require('../../../../mapviz/palette.json');
const FXA = require('../../../../mapviz/test/fxanswers.json');
let pass = 0, failN = 0;
const ok = (c, what, extra) => { if (c) pass++; else { failN++; console.log('FAIL mapviz game: ' + what + (extra !== undefined ? '\n  ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 600) : '')); } };
const near = (a, b, e) => Math.abs(a - b) <= (e || 1e-6);
const en = k => L.en[k];
const clone = x => JSON.parse(JSON.stringify(x));

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
  return { X, doc, log, part: X.mapviz.parts.find(p => p.id === 'game') };
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
  const q = Object.assign({ target: 'mowas2', map: 'multi/mv_fixture', mode: 'battle_zones', side: 'both', kind: 'inf', rmt: false, game: '<game>' }, o.q || {});
  const V = {
    q: n => q[n], doc: o.doc === undefined ? clone(FXA.as2.doc.a) : o.doc, pal: o.pal === undefined ? PAL : o.pal,
    addLayer(l) { rec.layers.push(l); return true; },
    addPanel(p) { rec.panels.push(p); const box = L0.doc.createElement('div'); rec.boxes[p.id] = box; p.build(box, V); },
    on(e, f) { (rec.on[e] = rec.on[e] || []).push(f); }, emit(e, d) { (rec.on[e] || []).forEach(f => f(d)); },
    redraw() { rec.redraws++; }, token: n => 'var-' + n, say() {}, addTool() {}, addHover() {},
    api(m, p, b) { rec.calls.push({ m, p, b }); return Promise.reject(new Error('no route')); },
    job(w, a) { rec.calls.push({ job: w, a }); return Promise.reject(new Error('no job')); },
  };
  rec.V = V; rec.q = q;
  // draw(id, view): one layer's draw on a recording context; the result is {log, err}
  rec.draw = (id, view) => {
    const l = rec.layers.find(x => x.id === id), log = [];
    if (!l) return { log, err: 'missing layer ' + id };
    let err = null;
    try { l.draw(recCtx(log), view || mkView(null)); } catch (e) { err = e.message; }
    rec.draws.push({ id, n: log.length, err });
    return { log, err };
  };
  return rec;
}
function start(o) { const L0 = load(o); const R = stubV(L0, o); L0.part.init(R.V); return Object.assign(R, { L0 }); }
const ops = (log, op) => log.filter(x => x.op === op);

(async () => {
  // ---- RMT: nothing at all ----
  { const L0 = load(), R = stubV(L0, { q: { rmt: true } }); L0.part.init(R.V);
    ok(R.layers.length === 0 && R.panels.length === 0 && R.calls.length === 0, 'RMT: no layer, no panel, no call'); }

  // ---- layers, groups, engineTrue ----
  const A = start();
  const ids = A.layers.map(l => l.id);
  ok(JSON.stringify(ids) === JSON.stringify(['zones', 'flags', 'spawns', 'points', 'boxes', 'mission']), 'six layers (mission: the places of the mission file)', ids);
  ok(A.layers.every(l => l.group === 'game' && l.engineTrue === (l.id !== 'points') && l.defaultOn === true && typeof l.draw === 'function' && typeof l.list === 'function'), 'all in group game, on by default, with draw and list; engine true but points (kind guessed: an estimate)');
  ok(A.layers.every(l => /^[a-z0-9_]+(\.[a-z0-9_]+)*$/.test(l.id) && /^mapviz\.game\./.test(l.label)), 'ids the shell takes, labels are language keys');
  ok(A.layers.every(l => !l.source), 'game marks come from the map document, no layer fetch');
  ok(A.calls.length === 0, 'building makes no call');
  const lg = A.layers.filter(l => typeof l.legend === 'function').map(l => l.legend(A.V));
  ok(lg.length === 5 && lg.every(r => Array.isArray(r) && r.every(x => /^#[0-9A-Fa-f]{6,8}$/.test(x.color) && typeof x.label === 'string' && !/^mapviz\./.test(x.label))), 'legends: palette colours and words', lg);

  // ---- zones at README 10.4 (zoom 0.5, centre 0,0, 800 x 600) ----
  // an AS2 circle zone holds two radii (rB for team b, rA for every other team): side both draws both rings, one when equal
  const rings = (log) => ops(log, 'arc').map(x => x.args.slice(0, 3));
  { const v = mkView(null), { log, err } = A.draw('zones', v), ar = rings(log);
    ok(!err && ops(log, 'ellipse').length === 0 && ar.length === 4, 'side both: four capture rings (f3 has two radii), no ellipse', { err, ar });
    const want = [[0, 0, 240], [-200, 300, 160], [300, 200, 200], [300, 200, 120]];
    want.forEach((w, i) => { const s = v.toScreen(w[0], w[1]), a = ar[i];
      ok(a && near(a[0], s[0]) && near(a[1], s[1]) && near(a[2], w[2] * 0.5), 'ring ' + (i + 1) + ' at (' + w[0] + ',' + w[1] + ') radius ' + w[2] + ' u', a); });
    ok(ops(log, 'fill').length === 3 && ops(log, 'stroke').length === 4, 'each zone washed once, each ring stroked');
    ok(log.filter(x => x.op === 'fill').every(x => x.fillStyle === 'rgba(127,127,127,0.149)'), 'neutral wash from the palette (sides.neutral.wash)', ops(log, 'fill').map(x => x.fillStyle));
    const dash = ops(log, 'setLineDash').map(x => JSON.stringify(x.args[0]));
    ok(dash.indexOf('[6,4]') >= 0, 'side both: the ring of side B is dashed where it differs', dash);
    A.q.side = 'a'; const ra = rings(A.draw('zones', v).log);
    A.q.side = 'b'; const rb = rings(A.draw('zones', v).log); A.q.side = 'both';
    ok(ra.length === 3 && near(ra[2][2], 100) && rb.length === 3 && near(rb[2][2], 60), 'side A draws rA 200 u for f3, side B draws rB 120 u', { ra, rb }); }
  // ---- flags ----
  { const v = mkView(null), { log, err } = A.draw('flags', v), arcs = ops(log, 'arc');
    ok(!err && arcs.length === 3 && near(arcs[0].args[0], 400) && near(arcs[0].args[1], 300) && arcs[0].args[2] === 6, 'flag marks at their places', arcs.map(a => a.args.slice(0, 3)));
    ok(ops(log, 'fillText').map(x => x.args[0]).join() === 'f1,f2,f3', 'flag names written'); }
  // ---- spawns, arrow along the yaw ----
  { const v = mkView(null), { log, err } = A.draw('spawns', v), arcs = ops(log, 'arc'), lines = ops(log, 'lineTo');
    const a1 = v.toScreen(-503.7, 12.2), b1 = v.toScreen(497.5, -15.5);
    ok(!err && arcs.length === 2 && near(arcs[0].args[0], a1[0]) && near(arcs[0].args[1], a1[1]) && near(arcs[1].args[0], b1[0]), 'spawns a1, b1 at their places', arcs.map(a => a.args));
    ok(lines.length === 2 && near(lines[0].args[0], a1[0] + 14) && near(lines[0].args[1], a1[1]) && lines[1].args[0] < b1[0] - 13.9, 'arrows: a1 faces east (yaw 0), b1 west (yaw 179.5)', lines.map(x => x.args));
    const fills = log.filter(x => x.op === 'fill').map(x => x.fillStyle);
    ok(fills.length === 1 && fills[0] === 'rgba(0,114,178,1)', 'side A filled, side B outlined (palette shape)', fills); }
  // yaw 90 points north, which is screen up (frontline spawn at (-450, 20))
  { A.q.mode = 'frontline'; const v = mkView(null), { log } = A.draw('spawns', v), p = v.toScreen(-450, 20);
    const lt = ops(log, 'lineTo').find((x, i) => near(ops(log, 'moveTo')[i].args[0], p[0]) && near(ops(log, 'moveTo')[i].args[1], p[1]));
    ok(lt && near(lt.args[0], p[0]) && near(lt.args[1], p[1] - 14), 'arrow: yaw 90 points up the screen (north)', lt && lt.args);
    A.q.mode = 'battle_zones'; }
  // ---- boxes ----
  { const v = mkView(null), { log, err } = A.draw('boxes', v), r = ops(log, 'strokeRect');
    ok(!err && r.length === 2, 'world and camera boxes', r.length);
    ok(r[0] && near(r[0].args[0], 100) && near(r[0].args[1], 80) && near(r[0].args[2], 600) && near(r[0].args[3], 440), 'world box [-600,-440,600,440]', r[0] && r[0].args);
    ok(r[1] && near(r[1].args[0], 120) && near(r[1].args[1], 100) && near(r[1].args[2], 560), 'camera box [-560,-400,560,400]', r[1] && r[1].args);
    const dash = ops(log, 'setLineDash').map(x => JSON.stringify(x.args[0]));
    ok(dash[0] === '[]' && dash[2] === '[8,4]', 'world solid, camera dashed', dash); }
  // ---- the DOM list repeats what is drawn ----
  { const fl = A.layers.find(l => l.id === 'flags').list(), zo = A.layers.find(l => l.id === 'zones').list(), sp = A.layers.find(l => l.id === 'spawns').list(), bx = A.layers.find(l => l.id === 'boxes').list();
    ok(fl.length === 3 && fl[0].label === 'Flag f1, no side, capture zone of radius 12 m' && fl[0].x === 0 && fl[0].y === 0, 'flag list: name, side and zone in metres (README 10.4 zone 12/12)', fl[0]);
    ok(fl[2].label.indexOf('capture radius 10 m for side A, 6 m for side B') >= 0, 'flag f3: zoneA 10 for side A, zoneB 6 for side B', fl[2]);
    ok(fl.concat(zo).every(x => x.label.indexOf('phase') < 0), 'one phase in the mode: no phase in the text', fl.map(x => x.label));
    ok(zo.length === 3 && sp.length === 2 && sp[0].label === 'Spawn a1, side A 1', 'zones and spawns listed', sp);
    ok(bx.length === 2 && bx[0].label === 'World box: 60 by 44 m' && bx[1].label === 'Camera box: 56 by 40 m', 'boxes listed with their size', bx);
    ok(A.layers.find(l => l.id === 'points').list().length === 0, 'no points in this mode'); }
  // ---- hits inside a zone ----
  { const z = A.layers.find(l => l.id === 'zones');
    const h1 = z.hit(10, 10), h0 = z.hit(0, -300), h3 = z.hit(300, 310), h3b = z.hit(300, 330), h3c = z.hit(300, 410);
    ok(h1 && h1[0].value === 'f1' && h1[0].label === en('mapviz.game.zoneHit'), 'a point in f1 hits it', h1);
    ok(h0 === null && h3 && h3[0].value === 'f3' && h3b && h3b[0].value === 'f3' && h3c === null, 'f3 side both: inside either ring hits, past rA 200 does not; outside every zone gives null', [h0, h3, h3b, h3c]);
    A.q.side = 'b'; const b3 = z.hit(300, 330), b3in = z.hit(300, 310);
    A.q.side = 'a'; const a3 = z.hit(300, 330); A.q.side = 'both';
    ok(b3 === null && b3in && a3 && a3[0].value === 'f3', 'f3: 130 u away is outside rB 120 for side B, inside rA 200 for side A', [b3, b3in, a3]); }
  // ---- the side picker ----
  { A.q.side = 'a';
    const { log } = A.draw('spawns'), sp = A.layers.find(l => l.id === 'spawns').list();
    ok(ops(log, 'arc').length === 1 && sp.length === 1 && sp[0].label.indexOf('a1') >= 0, 'side A: only A spawns drawn and listed', sp);
    A.q.side = 'b'; ok(A.layers.find(l => l.id === 'spawns').list().map(x => x.label).join() === 'Spawn b1, side B 1', 'side B: only B spawns');
    A.q.side = 'both'; }
  // ---- the panel ----
  { const box = A.boxes.game;
    ok(!!H.blk(box, 'mv.game.sum') && box.has('Mode: battle_zones') && box.has('3 flags') && box.has('2 spawns shown'), 'panel: mode, flag and spawn counts', box.textContent);
    A.q.side = 'a'; A.V.emit('refresh', {}); ok(box.has('1 spawn shown'), 'panel follows the side picker (plural form)', box.textContent); A.q.side = 'both'; }

  // ---- the GoH polygon zone ----
  { const G = start({ doc: clone(FXA.goh.doc.a), q: { target: 'goh' } });
    const v = mkView(null), { log, err } = G.draw('zones', v);
    const pts = [[-280, 180], [-80, 180], [-40, 300], [-180, 380], [-300, 300]].map(p => v.toScreen(p[0], p[1]));
    const mv = ops(log, 'moveTo'), lt = ops(log, 'lineTo');
    const got = mv.concat(lt).map(x => x.args);
    ok(!err && ops(log, 'arc').length === 2, 'GoH: f1 and f3 circles', ops(log, 'arc').length);
    ok(mv.length === 1 && near(mv[0].args[0], pts[0][0]) && near(mv[0].args[1], pts[0][1]) && lt.length === 4 && pts.slice(1).every((p, i) => near(lt[i].args[0], p[0]) && near(lt[i].args[1], p[1])), 'GoH: f2 polygon through its 5 absolute points', got);
    ok(ops(log, 'closePath').length === 1, 'the polygon is closed');
    const zl = G.layers.find(l => l.id === 'zones').list(), f2 = zl.find(x => x.label.indexOf('f2') >= 0);
    ok(f2 && f2.label === 'Zone of flag f2: capture zone of 5 corners' && near(f2.x, -176) && near(f2.y, 268), 'GoH: polygon zone listed at its centre', f2);
    const hz = G.layers.find(l => l.id === 'zones');
    ok(hz.hit(-180, 260) && hz.hit(-180, 260)[0].value === 'f2' && hz.hit(-10, 370) === null, 'GoH: a point in the polygon hits f2, one past its edge does not'); }

  // ---- seeded defects ----
  // a mode without spawns: the panel says so, flags and zones still draw
  { const d = clone(FXA.as2.doc.a); d.modes[0].spawns = [];
    const S2 = start({ doc: d });
    const sp = S2.draw('spawns'), fl = S2.draw('flags'), zo = S2.draw('zones');
    ok(!sp.err && ops(sp.log, 'arc').length === 0 && !fl.err && ops(fl.log, 'arc').length === 3 && ops(zo.log, 'arc').length === 4,'seeded: a mode without spawns draws no spawn, the flags and zones still draw');
    ok(S2.boxes.game.has(en('mapviz.game.noSpawns')), 'seeded: the panel says the mode has no spawns', S2.boxes.game.textContent); }
  // a broken zone (radius 0, a 2 point polygon) and a flag without a place: the flag is listed with no zone, others draw
  { const d = clone(FXA.as2.doc.a); d.modes[0].flags[1].zone = { kind: 'circle', rA: 0, rB: 0 }; d.modes[0].flags[2].zone = { kind: 'poly', pts: [[0, 0], [1, 1]] }; d.modes[0].flags.push({ name: 'fx', team: 'a', x: null, y: 5 });
    const S3 = start({ doc: d });
    ok(ops(S3.draw('zones').log, 'arc').length === 1 &&ops(S3.draw('flags').log, 'arc').length === 3, 'seeded: broken zones are not drawn, their flags are; a flag without a place is skipped');
    const fl = S3.layers.find(l => l.id === 'flags').list();
    ok(fl.length === 3 && fl[1].label.indexOf(en('mapviz.game.zoneNone')) >= 0, 'seeded: a flag with a broken zone is listed with no capture zone', fl.map(x => x.label)); }
  // a mode the doc does not hold, and no doc at all
  { const S4 = start({ q: { mode: 'nosuchmode' } });
    ok(S4.layers.every(l => !S4.draw(l.id).err) && S4.draws.every(x => x.id === 'boxes' || x.n === 0), 'seeded: an unknown mode draws no mark and throws nothing (boxes still draw)', S4.draws);
    ok(S4.boxes.game.has(en('mapviz.game.noMode')), 'seeded: the panel says the mode is not there');
    const S5 = start({ doc: null, q: { map: null } });
    ok(S5.layers.every(l => !S5.draw(l.id).err && l.list().length === 0) && S5.boxes.game.has(en('mapviz.game.noMap')), 'seeded: no map, nothing drawn, the panel says open a map'); }
  // the other side's camera box from clipsBySide, filtered by the side picker
  { const d = clone(FXA.as2.doc.a); d.boxes.named.push({ name: 'east', camera: [0, -400, 560, 400] }); d.modes[0].clipsBySide = [{ team: 'b', clip: 'east' }];
    const S6 = start({ doc: d });
    ok(ops(S6.draw('boxes').log, 'strokeRect').length === 3 && S6.layers.find(l => l.id === 'boxes').list()[2].label === 'Camera box of side B: 28 by 40 m', 'a side camera box from clipsBySide');
    S6.q.side = 'a'; ok(ops(S6.draw('boxes').log, 'strokeRect').length === 2, 'side A hides the camera box of side B'); }
  // a mode with more than one phase: every item names its phase
  { const d = clone(FXA.as2.doc.a), fr = d.modes.find(m => m.id === 'frontline');
    fr.spawns.push({ name: 'fa2', uid: 9, team: 'a', order: 1, x: -100, y: 0, z: null, yaw: 0, player: 0, phase: 2 });
    d.boxes.named.push({ name: 'west', camera: [-560, -400, 0, 400] }); fr.clipsBySide = [{ team: 'a', phase: 2, clip: 'west' }];
    const S7 = start({ doc: d, q: { mode: 'frontline' } }), sp = S7.layers.find(l => l.id === 'spawns').list().map(x => x.label), bx = S7.layers.find(l => l.id === 'boxes').list().map(x => x.label);
    ok(sp.length === 3 && sp[0] === 'Spawn fa1, side A 1 (phase 1)' && sp[2] === 'Spawn fa2, side A 1 (phase 2)', 'phases: spawns name their phase', sp);
    ok(bx.length === 3 && bx[2] === 'Camera box of side A: 28 by 40 m (phase 2)' && bx[0].indexOf('phase') < 0, 'phases: a side camera box names its phase, the world box has none', bx);
    const one = start({ q: { mode: 'frontline' } }).layers.find(l => l.id === 'spawns').list().map(x => x.label);
    ok(one.every(x => x.indexOf('phase') < 0), 'phases: one phase only (fixture frontline), no phase text', one); }
  // no 2D methods: nothing drawn, no throw
  { const L0 = load(), R = stubV(L0, {}); L0.part.init(R.V); let err = null;
    try { R.layers.forEach(l => l.draw({}, mkView(null))); } catch (e) { err = e.message; }
    ok(!err, 'a context without 2D methods draws nothing and does not throw', err); }

  // ---- on the shell: canvas and no canvas ----
  { const calls = [], DOC = clone(FXA.as2.doc.a);
    const routes = {
      'GET /api/x/mapviz/palette': async () => PAL,
      'GET /api/x/mapviz/cache': async () => ({ v: 1, root: '<cache>', bytes: 0, cap: 1, entries: 0, jobs: 0 }),
      'GET /api/x/mapviz/doc': async () => DOC,
    };
    const S = { gameId: 'mowas2', gameOv: '<game>', mod: '', mapKey: 'map/multi/mv_fixture' };
    const P = H.mkPage({ scripts: [SHELL, PART], lang: L, S, canvas: true, api: H.routeApi(routes, calls) });
    P.screen.refresh(); await H.flush(60);
    ok(P.V.q('map') === 'multi/mv_fixture' && !!P.V.doc, 'shell: the fixture map is open', P.V.q('map'));
    ok(ops(P.log, 'arc').length >= 9 && ops(P.log, 'strokeRect').length >= 2, 'shell: zone rings, flags, spawns and boxes drawn on the page canvas', { arc: ops(P.log, 'arc').length, r: ops(P.log, 'strokeRect').length });
    ok(P.root.has('Flag f1, no side, capture zone of radius 12 m') && P.root.has('Spawn b1, side B 1'), 'shell: the DOM list repeats the marks');
    ok(!P.root.has('cannot be drawn'), 'shell: no layer fault');
    ok(calls.every(c => c.method === 'GET') && !calls.some(c => /layer|job/.test(c.path)), 'shell: GET only, no layer fetch, no job', calls.map(c => c.method + ' ' + c.path));
    const before = calls.length;
    const C2 = [], P2 = H.mkPage({ scripts: [SHELL, PART], lang: L, S: Object.assign({}, S), canvas: false, api: H.routeApi(routes, C2) });
    let err = null; try { P2.screen.refresh(); await H.flush(30); } catch (e) { err = e.message; }
    ok(!err && C2.every(c => c.method === 'GET'), 'shell without a canvas: builds, no throw, no job', err);
    const C3 = [], P3 = H.mkPage({ scripts: [SHELL, PART], lang: L, S: Object.assign({}, S), canvas: true, rmt: true, api: H.routeApi(routes, C3) });
    try { P3.screen && P3.screen.refresh && P3.screen.refresh(); await H.flush(10); } catch (e) { err = e.message; }
    ok(!err && C3.length === 0, 'shell on RMT: no mapviz call', C3);
    ok(before === calls.length, 'the other pages made no call on the first page'); }

  // ---- GET places (game.server.js) on a stubbed file source: a single-player mission keeps its places in Helpers ----
  const GS = require('./game.server'), PLACES = GS.routes['GET /api/x/mapviz/places'];
  const SPKEY = 'single/t/03_test', SPMI = ['{mission', ' {Helpers',
    '  {zone circle {name "flag_b02"} {position 2600 1300} {radius 240}}',
    '  {zone circle {name "flag_b02_capture"} {position 2600 1300} {radius 400}}',
    '  {zone poly {name "village"} {position 100 100} {point -50 -50} {point 50 -50} {point 0 60}}',
    '  {zone circle {name "PlayerBase"} {position -900 -600} {radius 100}}',
    '  {waypoints "enemy:tanks" {"p1" {position 10 20}} {"p2" {position 30 40}}}', ' }', '}', ''].join('\r\n');
  const MPMI = ['{mission', ' {Helpers', '  {zone circle {name "flag_1"} {position -300 0} {radius 100}}', '  {zone circle {name "flag_2"} {position 300 0} {radius 100}}', ' }', '}', ''].join('\r\n');
  const FILES = { ['resource/map/' + SPKEY + '/map']: '{map {Clips {world -2000 -1500 3000 2500}}}\r\n', ['resource/map/' + SPKEY + '/03_test.mi']: SPMI,
    'resource/map/multi/mv_fixture/map': '{map {Clips {world -600 -440 600 440}}}\r\n', 'resource/map/multi/mv_fixture/frontline.mi': MPMI, 'resource/map/multi/mv_fixture/battle_zones.mi': '{mission}\r\n' };
  const SRCSTUB = { has: k => Object.prototype.hasOwnProperty.call(FILES, k), read: k => Buffer.from(FILES[k], 'latin1'), keys: p => Object.keys(FILES).filter(k => k.indexOf(p) === 0) };
  GS._t.use({ sourceOf: () => SRCSTUB });
  { const r = GS._t.placesOf(SRCSTUB, SPKEY, null, { target: 'mowas2' }), by = id => r.places.find(p => p.id === id);
    ok(r.mode === null && JSON.stringify(r.modes) === '["03_test"]' && r.upm === 20, 'places: the mission files of the map, units 20 per metre', [r.mode, r.modes]);
    ok(JSON.stringify(r.bounds) === '[-2000,-1500,3000,2500]', 'places: the world box from the map file when no doc is cached', r.bounds);
    const f = by('flag_b02'), v = by('village'), w = by('enemy:tanks/p1');
    ok(f && f.kind === 'zone' && f.r === 240 && f.x === 2600 && f.lab.k === 'flag' && f.lab.n === 'B2', 'places: a Helpers circle zone flag_b02 reads as Flag B2, radius in u', f);
    ok(v && JSON.stringify(v.pts) === '[[50,50],[150,50],[100,160]]', 'places: a polygon zone has absolute points (position + offsets)', v);
    ok(by('flag_b02_capture').dup === true && by('PlayerBase').lab.k === 'pbase', 'places: a _capture ring beside its zone is a dup; PlayerBase is the player base', r.places.map(p => p.id));
    ok(w && w.kind === 'waypoint' && w.group === 'enemy:tanks' && w.x === 10 && w.lab.k === 'path' && r.places.filter(p => p.kind === 'waypoint').length === 2, 'places: Helpers waypoints with their group', w);
    let e1 = null; try { GS._t.placesOf(SRCSTUB, SPKEY, 'nosuch', { target: 'mowas2' }); } catch (e) { e1 = e.code; }
    ok(e1 === 'MV_NOT_FOUND' && GS._t.keyOf('map/single/../x') === null && GS._t.keyOf('resource/map/Single/T/03_test/') === SPKEY, 'seeded: an unknown mode is not found; a key with .. is refused; resource/map/ and case are taken off');
    const u = q => new URL('http://127.0.0.1/api/x/mapviz/places?' + q);
    const a = await PLACES(u('target=mowas2&map=multi/mv_fixture&mode=frontline'), null, {});
    ok(a.v === 1 && a.kind === 'places' && a.mode === 'frontline' && a.places.length === 2 && a.places.every(p => p.lab.k === 'flag'), 'route: a multiplayer frontline mode gives its Helpers flag zones', a.places);
    let s1 = null, s2 = null; try { await PLACES(u('target=mowas2'), null, {}); } catch (e) { s1 = e.status || e.code || e.key; }
    try { await PLACES(u('target=mowas2&map=multi/mv_fixture&mode=a%20b'), null, {}); } catch (e) { s2 = e.status || e.code || e.key; }
    ok(s1 && s2 && String(s1) !== 'undefined', 'seeded: no map and a mode with a space are refused', [s1, s2]); }

  // ---- the place picker (MAPVIZ_PICK) in the fake DOM with the page's searchKit ----
  const BC = require('../../../test/blockcheck');
  function loadPick(o) {
    o = o || {};
    const doc = fake.make(), frames = [], mem = {}, calls = [], log = [], win = { requestAnimationFrame: f => f() };
    const make = doc.createElement;
    doc.createElement = t => { const e = make(t); if (String(t).toLowerCase() === 'canvas') { e.clientWidth = 800; e.clientHeight = 500; e.getContext = k => (k === '2d' ? (e._ctx = e._ctx || recCtx(log)) : null); } return e; };
    const LS = { get: (k, d) => (k in mem ? mem[k] : d), set: (k, v) => { mem[k] = v; } };
    const S = Object.assign({ gameId: 'mowas2', gameOv: '<game>', mod: '' }, o.S || {});
    const fn = new Function('EXT_SCREENS', 'h', 'tx', 'api', 'S', 'RMT', 'cssv', 'onTheme', 'document', 'window', 'setTimeout', 'Image', 'gohDir', 'navigator', 'LS', 'requestAnimationFrame',
      BC.kitSrc() + '\n' + [SHELL, PART].join('\n') + '\nreturn searchKit;');
    const X = {}, sk = fn(X, H.hOf(doc), H.txOf(L, o.code || 'en'), H.routeApi(o.routes || {}, calls), S, !!o.rmt, (n, d) => 'var' + n, () => () => {}, doc, win,
      (f, ms) => setTimeout(f, Math.min(ms || 0, 2)), H.ImageStub, () => '<goh>', undefined, LS, f => frames.push(f));
    const flushF = () => { let g = 0; while (frames.length && g++ < 30) frames.splice(0).forEach(f => f()); };
    return { X, doc, win, calls, mem, sk, flushF, PK: win.MAPVIZ_PICK, log, S };
  }
  const ov = doc => doc.body.all().find(e => e.className === 'mvpk-ov') || null;
  const btn = (doc, k) => doc.body.all().find(e => e.tagName === 'BUTTON' && e.textContent === en(k));
  const GIVEN = [{ id: 'a1', label: 'Start A1', x: 2501.09, y: 1228.63, kind: 'start', team: 'a' }, { id: 'f1', label: 'Flag one', x: 0, y: 0, kind: 'flag' },
    { id: 'vil', label: 'Village', x: -500, y: 300, kind: 'zone', r: 200 }];
  { const W = loadPick(), PK = W.PK; let got = [];
    ok(PK && W.X.mapviz.picker === PK && typeof PK.open === 'function' && typeof PK.close === 'function', 'picker: window.MAPVIZ_PICK and EXT_SCREENS.mapviz.picker');
    PK.open({ places: GIVEN, title: 'Pick a target', onPick: r => got.push(r) });
    const o = ov(W.doc), dlg = o && o.all().find(e => e.getAttribute('role') === 'dialog');
    ok(o && dlg && dlg.getAttribute('aria-modal') === 'true' && dlg.has('Pick a target') && dlg.has(en('mapviz.game.pk.noMap')) && W.calls.length === 0, 'picker: a modal dialog over the page; no map given: no call, the caller places only');
    const kit = o.all().find(e => e.classList.contains('sk') && e.dataset.sk === 'mapviz.pick');
    ok(kit && kit.children.map(c => c.tagName).join() === 'INPUT,BUTTON,BUTTON,DIV', 'picker: the search box is a searchKit box (Browse, History, list)', kit && kit.children.map(c => c.tagName));
    ok(ops(W.log, 'fillRect').length >= 2 && ops(W.log, 'arc').length >= 3 && ops(W.log, 'fillText').map(x => x.args[0]).indexOf('Village') >= 0, 'picker: the sketch draws at once: frame, marks, labels');
    ok(!/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(W.log.map(x => x.fillStyle + ' ' + x.strokeStyle).join(' ')), 'picker: colours come from page tokens only');
    const cv = o.all().find(e => e.tagName === 'CANVAS'), s = PK._t.toScreen(0, 0);
    cv.fire('click', { offsetX: s[0] + 3, offsetY: s[1] - 2 });
    ok(got.length === 1 && got[0].place && got[0].place.id === 'f1' && got[0].place.label === 'Flag one' && got[0].x === 0 && got[0].units === 'u' && got[0].m.x === 0, 'picker: a click by a place returns that place', got[0]);
    ok(got[0].inside === null, 'picker: no map, so no playable area known: inside is null (not refused)', got[0].inside);
    ok(!ov(W.doc) && !PK.isOpen(), 'picker: choosing closes it and takes the dialog out of the page'); }
  { const W = loadPick(), PK = W.PK; let got = null;
    PK.open({ places: GIVEN.slice(1), onPick: r => { got = r; } });
    const cv = ov(W.doc).all().find(e => e.tagName === 'CANVAS'), s = PK._t.toScreen(2501.09, 1228.63);
    cv.fire('click', { offsetX: s[0], offsetY: s[1] });
    ok(got && got.place === null && near(got.x, 2501.09, 0.011) && near(got.y, 1228.63, 0.011) && near(got.m.x, 125.05, 0.011) && near(got.m.y, 61.43, 0.011) && got.upm === 20,
      'picker: a click on an empty spot returns world u (README 3.3 point a1 2501.09, 1228.63) and metres', got); }
  { const W = loadPick(), PK = W.PK; let got = null;
    PK.open({ places: GIVEN, onPick: r => { got = r; } });
    const cv = ov(W.doc).all().find(e => e.tagName === 'CANVAS'), s = PK._t.toScreen(-500 + 150, 300);
    cv.fire('click', { offsetX: s[0], offsetY: s[1] });
    ok(got && got.place && got.place.id === 'vil' && got.x === -500, 'picker: a click inside a zone away from its mark returns the zone', got); }
  { const W = loadPick(), PK = W.PK; let got = null;
    PK.open({ places: GIVEN, onPick: r => { got = r; } });
    const o = ov(W.doc), inp = o.all().find(e => e.tagName === 'INPUT');
    inp.value = 'vil'; inp.selectionStart = 3; inp.fire('input'); W.flushF();
    const opt = o.all().find(e => e.getAttribute('role') === 'option' && e.has('Village'));
    ok(!!opt, 'picker: the search box finds a place label', o.all().filter(e => e.getAttribute('role') === 'option').map(e => e.textContent));
    opt.parentNode.fire('click', { target: opt }); W.flushF();
    const st = PK._t.state();
    ok(st && st.sel && st.sel.place && st.sel.place.id === 'vil' && o.has('Chosen: Village') && !btn(W.doc, 'mapviz.game.pk.choose').disabled, 'picker: a found place is selected and centred; Choose is on', st && st.sel);
    ok((W.mem['sk.hist.mapviz.pick'] || []).indexOf('Village') >= 0, 'picker: the search box remembers it (history)', W.mem);
    btn(W.doc, 'mapviz.game.pk.choose').click();
    ok(got && got.place && got.place.id === 'vil' && !ov(W.doc), 'picker: Choose returns the selected place and closes'); }
  { const W = loadPick(), PK = W.PK; let got = null, no = 0;
    PK.open({ places: GIVEN, onPick: r => { got = r; }, onCancel: () => no++ });
    const o = ov(W.doc), cv = o.all().find(e => e.tagName === 'CANVAS'), dlg = o.all().find(e => e.getAttribute('role') === 'dialog');
    ok(btn(W.doc, 'mapviz.game.pk.choose').disabled === true, 'picker: Choose is off until something is selected');
    const ev = { key: 'ArrowRight', preventDefault() {}, stopPropagation() {} };
    cv.fire('keydown', ev); cv.fire('keydown', { key: '+' }); cv.fire('keydown', { key: 'ArrowRight', shiftKey: true });
    ok(PK._t.state().sel && PK._t.state().view.zoom > 0, 'picker: arrows move the choice, plus zooms, Shift with arrows pans');
    cv.fire('keydown', { key: 'Enter' });
    ok(got && typeof got.x === 'number' && !ov(W.doc), 'picker: Enter on the map takes the choice', got);
    PK.open({ places: GIVEN, onPick: () => { got = 'no'; }, onCancel: () => no++ });
    ov(W.doc).all().find(e => e.getAttribute('role') === 'dialog').fire('keydown', { key: 'Escape' });
    ok(no === 1 && !ov(W.doc) && got !== 'no', 'picker: Esc cancels and cleans up');
    PK.open({ places: GIVEN }); PK.open({ places: GIVEN }); ok(W.doc.body.all().filter(e => e.className === 'mvpk-ov').length === 1, 'picker: one picker at a time'); PK.close();
    ok(!ov(W.doc), 'picker: close() takes it out'); }
  // with a map: the mission places from GET places, the sketch first, then the picture job's progress, then the tiles
  { let made = false, polls = 0, stat = null; const seen = [];
    const routes = {
      'GET /api/x/mapviz/places': PLACES,
      'GET /api/x/mapviz/tiles': async u => { if (!made) throw Object.assign(new Error('not made'), { status: 404, key: 'mapviz.err.MV_NOT_MADE', params: { need: { what: 'topo', args: { map: SPKEY } } } });
        const z = +u.searchParams.get('z'), ts = u.searchParams.get('t').split(',');
        return { v: 1, kind: 'tiles', base: 'topo', z, zmax: 2, w: 600, h: 400, ox: -2000, oy: -1500, cell: 8.33, box: [-2000, -1500, 3000, 2500], tiles: ts.map(t => ({ t, png: 'AAAA' })) }; },
      'POST /api/x/mapviz/job': async (u, b) => ({ id: 'j1', state: 'queued', queue: 0, _b: b }),
      // each poll also notes the status the last answer left (the 2 ms timers outrun a sampling loop on a busy machine)
      'GET /api/x/mapviz/job': async () => { if (stat) seen.push(stat.textContent); polls++; if (polls >= 2) { made = true; return { id: 'j1', state: 'done' }; } return { id: 'j1', what: 'topo', state: 'running', stage: 'tiles', done: 3, total: 9 }; },
    };
    const W = loadPick({ routes }), PK = W.PK;
    PK.open({ gameId: 'mowas2', map: 'map/' + SPKEY, mission: '03_test.mi', onPick: () => {} });
    const o = ov(W.doc); stat = o.all().find(e => e.getAttribute('role') === 'status');
    await H.until(() => { seen.push(stat.textContent); return o.has(en('mapviz.game.pk.picShown')); });
    const pq = W.calls.find(c => /places/.test(c.path)), job = W.calls.find(c => c.method === 'POST');
    ok(pq && /target=mowas2/.test(pq.url) && /map=single%2Ft%2F03_test/.test(pq.url) && /mode=03_test/.test(pq.url) && /game=%3Cgame%3E/.test(pq.url), 'picker with a map: GET places with the game, its folder, the map key and the mission', pq && pq.url);
    ok(o.has('Flag B2') || PK._t.state().places.some(p => p.id === 'flag_b02'), 'picker with a map: the mission places are there');
    ok(job && job.body.what === 'topo' && job.body.map === SPKEY && job.body.target === 'mowas2', 'picker: the picture not made starts its job', job && job.body);
    ok(seen.some(t => t.indexOf('3 of 9') >= 0) && seen.some(t => t.indexOf(en('mapviz.game.pk.sketch')) >= 0 || t.indexOf('places') >= 0), 'picker: the status shows the job progress while the sketch is usable', seen.filter((t, i) => seen.indexOf(t) === i).slice(0, 6));
    ok(o.has(en('mapviz.game.pk.picShown')) && ops(W.log, 'drawImage').length >= 1, 'picker: the picture tiles replace the sketch once made', ops(W.log, 'drawImage').length);
    const st = PK._t.state(), f = st.places.find(p => p.id === 'flag_b02'), s = PK._t.toScreen(f.x, f.y); let got = null; st.o.onPick = r => { got = r; };
    o.all().find(e => e.tagName === 'CANVAS').fire('click', { offsetX: s[0], offsetY: s[1] });
    ok(got && got.place.label === 'Flag B2' && got.mission === '03_test' && got.map === SPKEY && got.x === 2600 && got.m.x === 130 && got.inside === true, 'picker: a mission place picked returns its label, u and metres, inside true', got); }
  // the playable area (the first Clips world box, spmis's rule): drawn, a click outside refused at once, inside:true in the result
  { const TKEY = 'single/t/04_two';
    FILES['resource/map/' + TKEY + '/map'] = '{map {Clips {"[auto]" {world -1000 -1000 1000 1000}} {"big" {world -3000 -3000 3000 3000}}}}\r\n';
    FILES['resource/map/' + TKEY + '/04_two.mi'] = '{mission {Helpers {zone circle {name "flag_c1"} {position 200 100} {radius 80}} {waypoints "patrol" {"w1" {position -500 -400}}}}}\r\n';
    const bx = GS._t.boxesOf(SRCSTUB, TKEY, { target: 'mowas2' });
    ok(JSON.stringify(bx.play) === '[-1000,-1000,1000,1000]' && JSON.stringify(bx.bounds) === '[-3000,-3000,3000,3000]', 'places: play is the first Clips world box (spmis), bounds the union', bx);
    const a = await PLACES(new URL('http://127.0.0.1/api/x/mapviz/places?target=mowas2&map=' + TKEY + '&mode=04_two'), null, {});
    ok(JSON.stringify(a.play) === '[-1000,-1000,1000,1000]', 'route: GET places answers the playable area', a.play);
    const W = loadPick({ routes: { 'GET /api/x/mapviz/places': PLACES } }), PK = W.PK; let got = null;
    PK.open({ gameId: 'mowas2', map: 'map/' + TKEY, mission: '04_two', onPick: r => { got = r; } });
    await H.until(() => PK._t.playBox());
    const o = ov(W.doc), cv = o.all().find(e => e.tagName === 'CANVAS'), ln = () => o.all().find(e => e.attrs && e.attrs.id && /-ln$/.test(e.attrs.id));
    ok(JSON.stringify(PK._t.playBox()) === '[-1000,-1000,1000,1000]', 'picker: the playable area comes from GET places (it was null: wbox only)', PK._t.playBox());
    { const a0 = PK._t.toScreen(-1000, 1000), a1 = PK._t.toScreen(1000, -1000);
      ok(ops(W.log, 'strokeRect').some(x => near(x.args[0], a0[0], 0.01) && near(x.args[1], a0[1], 0.01) && near(x.args[2], a1[0] - a0[0], 0.01)) && ops(W.log, 'fillRect').filter(x => x.alpha === 0.55 && x.fillStyle === 'var--bg').length >= 4,
        'picker: the playable area is outlined and the rest dimmed, page tokens only', W.log.filter(x => /Rect/.test(x.op)).slice(-8)); }
    W.log.length = 0; PK._t.state().moved = true;
    const so = PK._t.toScreen(2000, 0);
    cv.fire('mousemove', { offsetX: so[0], offsetY: so[1] });
    ok(ln().textContent === en('mapviz.game.pk.outsideAt').replace('{x}', '100').replace('{y}', '0') && btn(W.doc, 'mapviz.game.pk.choose').disabled, 'picker: hovering outside says so in plain words', ln().textContent);
    cv.fire('click', { offsetX: so[0], offsetY: so[1] });
    ok(got === null && PK.isOpen() && ln().textContent === en('mapviz.game.pk.outside') && ln().getAttribute('role') === 'alert', 'picker: a click outside the playable area is refused at once, the picker stays open', ln().textContent);
    PK._t.state().sel = { x: 1500, y: 900, place: null }; cv.fire('keydown', { key: 'Enter' });
    ok(got === null && PK.isOpen() && ln().textContent === en('mapviz.game.pk.outside'), 'picker: Enter on a spot outside is refused too');
    const si = PK._t.toScreen(-700, 600); cv.fire('mousemove', { offsetX: si[0], offsetY: si[1] }); cv.fire('click', { offsetX: si[0], offsetY: si[1] });
    ok(got && got.inside === true && near(got.x, -700, 0.6) && near(got.y, 600, 0.6) && got.place === null && !PK.isOpen(), 'picker: a spot inside is taken with inside:true', got);
    // the header: plain words, the map folder and mission file as small secondary text
    PK.open({ gameId: 'mowas2', map: 'map/' + TKEY, mission: '04_two', places: [{ id: 'w', x: 1, y: 2, kind: 'waypoint' }] });
    const hd = ov(W.doc).all().find(e => e.className === 'mvpk-head'), main = hd && hd.children[0], small = hd && hd.children[1];
    ok(main && main.textContent === "This mission's places" && !/waypoint|mission file|\.mi\b/i.test(main.textContent), 'picker header: plain words ("this mission\'s places")', main && main.textContent);
    ok(small && small.className === 'hint' && /font-size:11px/.test(small.getAttribute('style')) && small.textContent === 'Map folder map/' + TKEY + ', mission file 04_two.mi', 'picker header: the file names only as small secondary text', small && small.textContent);
    ok(PK._t.plabel({ lab: { k: 'path', n: 'patrol w1' } }) === 'Path point patrol w1' && en('mapviz.game.pk.kind.waypoint') === 'path point' && !/waypoint/i.test(en('mapviz.game.pk.findHint')), 'picker: "path point", not "waypoint"');
    PK.open({ gameId: 'mowas2', map: 'map/' + TKEY, onPick: () => {} });
    const hd2 = ov(W.doc).all().find(e => e.className === 'mvpk-head');
    ok(hd2.children[0].textContent === en('mapviz.game.pk.allMis') && hd2.children[1].textContent === 'Map folder map/' + TKEY, 'picker header: no mission given: every mission of the map, in words', hd2.textContent);
    PK.close();
    for (const c of ['ru', 'uk', 'zh']) { const Wc = loadPick({ code: c }); Wc.PK.open({ map: 'map/' + TKEY, mission: '04_two', rmt: true });
      const h2 = ov(Wc.doc).all().find(e => e.className === 'mvpk-head'); ok(h2 && h2.children[0].textContent === LG[c]['mapviz.game.pk.mission'], 'picker header in ' + c, h2 && h2.textContent); Wc.PK.close(); } }
  // a read that fails: a sentence in the window language, never an MV_ code; the caller's map name leads the header, the path stays small
  for (const c of ['en', 'ru', 'uk', 'zh']) {
    const W = loadPick({ code: c, routes: { 'GET /api/x/mapviz/places': async () => { throw Object.assign(new Error('MV_NOT_FOUND: no such map'), { status: 404, key: 'mapviz.err.MV_NOT_FOUND' }); } } });
    W.PK.open({ gameId: 'mowas2', map: SPKEY, mission: '04_two', mapName: 'Usa Overlord', onPick: () => {} });
    await H.until(() => ov(W.doc).textContent.includes(LG[c]['mapviz.game.pk.placesFault'].replace('{why}', LG[c]['mapviz.game.pk.why.nf'])));
    const o = ov(W.doc), hd = o.all().find(e => e.className === 'mvpk-head'), txt = o.textContent;
    ok(txt.includes(LG[c]['mapviz.game.pk.placesFault'].replace('{why}', LG[c]['mapviz.game.pk.why.nf'])) && !/MV_[A-Z]|undefined|{why}/.test(txt), 'picker fault in ' + c + ': a sentence, no code', txt.slice(0, 300));
    ok(hd.children[0].textContent === LG[c]['mapviz.game.pk.missionOn'].replace('{name}', 'Usa Overlord') && !hd.children[0].textContent.includes(SPKEY) && hd.children[1].textContent.includes(SPKEY), 'picker header in ' + c + ': the map name in the main line, the path only small', hd.textContent);
    W.PK.close();
  }
  { const W = loadPick({ rmt: true }); W.PK.open({ map: SPKEY, places: GIVEN }); ok(W.calls.length === 0 && ov(W.doc).has(en('mapviz.game.pk.remote')), 'picker on a remote page: no call, the sketch with the given places'); W.PK.close(); }
  { const W = loadPick({ S: { gameId: 'goh' } }), c = W.PK._t.ctxOf({}), c2 = W.PK._t.ctxOf({ game: 'as64', gameDir: 'D:/as64', modDir: 'D:/m' });
    ok(c.target === 'goh' && c.game === '<goh>' && c2.target === 'as64' && c2.game === 'D:/as64' && c2.modDir === 'D:/m', 'picker: the same path for every game (GoH folder from gohDir, AS64 from the caller)', [c, c2]);
    ok(W.PK._t.keyOf('resource\\map\\single\\t\\03_test') === SPKEY && W.PK._t.keyOf('map/../x') === null, 'picker: map keys as other pages name them'); }

  // ---- the inline view (MAPVIZ_PICK.embed): the same map inside another page's card, with the mission drawn on it ----
  { const TKEY = 'single/t/04_two', wait = f => H.until(f);
    const ROS = []; global.ResizeObserver = function (cb) { this.cb = cb; this.seen = []; this.off = false; this.observe = e => this.seen.push(e); this.disconnect = () => { this.off = true; }; ROS.push(this); };
    const routes = { 'GET /api/x/mapviz/places': PLACES,
      'GET /api/x/mapviz/tiles': async u => { if (u.searchParams.get('map') !== SPKEY) throw Object.assign(new Error('not made'), { status: 404, key: 'mapviz.err.MV_NOT_MADE', params: { need: { what: 'topo', args: { map: TKEY } } } });
        return { v: 1, kind: 'tiles', base: 'topo', z: +u.searchParams.get('z'), zmax: 2, w: 600, h: 400, ox: -2000, oy: -1500, cell: 8.33, box: [-2000, -1500, 3000, 2500], tiles: u.searchParams.get('t').split(',').map(t => ({ t, png: 'AAAA' })) }; },
      'POST /api/x/mapviz/job': async () => ({ id: 'j9', state: 'queued' }), 'GET /api/x/mapviz/job': async () => ({ id: 'j9', state: 'failed', error: { msg: 'stub' } }) };
    const W = loadPick({ routes }), PK = W.PK, got = [], nReq = re => W.calls.filter(c => re.test(c.path)).length;
    const MARKS = [{ type: 'zone', x: 1500, y: 1500, r: 800, side: 'enemy', label: 'Enemy camp' }, { type: 'zone', pts: [[-2600, -2600], [-1800, -2600], [-2200, -1800]], side: 'player', label: 'Assembly' },
      { type: 'route', pts: [[-2200, -1500], [-800, -300], [1200, 1200]], side: 'player', label: 'Attack', dashed: true }, { type: 'route', pts: [[600, -2600], [1800, -2600]], side: 'enemy', arrow: false },
      { type: 'unit', x: 1500, y: 1500, side: 'enemy', label: 'Tanks', n: 3 }, { type: 'unit', x: 1500, y: 1500, side: 'enemy', label: 'Rifles', n: 12 }, { type: 'unit', x: -800, y: 800, side: 'ally', label: 'Friends' },
      { type: 'goal', x: 2000, y: -1500, n: 2, label: 'Hold the bridge' }, { type: 'start', x: -2200, y: -900, label: 'You start here' },
      { type: 'unit', x: null, y: 5, side: 'enemy', label: 'bad' }, { type: 'route', pts: [[1, 1]] }, { type: 'zone', x: 0, y: 0 }, { type: 'tree', x: 0, y: 0 }, null];
    const E = PK.embed({ gameId: 'mowas2', map: 'map/' + TKEY, mission: '04_two', mapName: 'Two Rivers', height: 300, marks: MARKS, onPick: r => got.push(r),
      legend: [{ side: 'player', text: 'Your troops' }, { side: 'enemy', text: 'Enemy tanks' }, { side: 'ally', text: 'Friends' }] });
    ok(E && E.el && ['update', 'fit', 'close', 'state'].every(k => typeof E[k] === 'function') && W.X.mapviz.picker.embed === PK.embed, 'embed: a handle {el, update, fit, close, state}; also EXT_SCREENS.mapviz.picker.embed');
    const cv = E.el.all().find(e => e.tagName === 'CANVAS'), stat = E.el.all().find(e => e.getAttribute('role') === 'status'), bts = E.el.all().filter(e => e.tagName === 'BUTTON');
    ok(E.el.parentNode === null && !ov(W.doc) && !PK.isOpen() && cv && stat && E.el.all().filter(e => e.getAttribute('role') === 'status').length === 1, 'embed: not a dialog; the caller places el; a canvas and one status line');
    ok(bts.length === 4 && bts.map(b => b.textContent).join('|') === ['+', '-', en('mapviz.game.pk.fit'), en('mapviz.game.pk.picMake')].join('|') && bts[0].getAttribute('aria-label') === en('mapviz.game.pk.zoomIn') && !btn(W.doc, 'mapviz.game.pk.choose'),
      'embed: a small toolbar (zoom in, zoom out, whole map), no Choose and no Cancel', bts.map(b => b.textContent));
    ok(/height:300px/.test(cv.getAttribute('style')) && /width:100%/.test(cv.getAttribute('style')) && cv.getAttribute('aria-label').indexOf('Two Rivers. ') === 0, 'embed: the height asked for, the width of its container, the map name in the canvas words', cv.getAttribute('style'));
    ok(E.el.all().filter(e => e.className === 'mvpk-sw').length === 3 && E.el.has('Your troops') && E.el.has('Enemy tanks') && /var\(--s2\)/.test(E.el.all().filter(e => e.className === 'mvpk-sw')[1].getAttribute('style')), 'embed: the legend row, a swatch by side and the text');
    const host1 = W.doc.createElement('div'), host2 = W.doc.createElement('div'); W.doc.body.appendChild(host1); W.doc.body.appendChild(host2); host1.appendChild(E.el);
    await wait(() => E.state().places > 0 && E.state().picture === 'missing');
    const s0 = E.state();
    ok(s0.map === TKEY && s0.target === 'mowas2' && s0.places === 2 && s0.marks === 9 && s0.picture === 'missing' && s0.view.zoom > 0, 'embed: state() names the map, the game, the places, the marks (bad ones left out) and the picture', s0);
    ok(nReq(/places/) === 1 && !W.calls.some(c => c.method === 'POST') && E.el.has(en('mapviz.game.pk.picNot')) && bts[3].hidden === false, 'embed: the picture not made starts no job; a plain line and a button to make it', W.calls.map(c => c.method + ' ' + c.path));
    // every type of mark is drawn, page tokens only
    W.log.length = 0; E.update({});
    { const L2 = W.log, ts = E._t.toScreen, raw = E._t.raw(), un = raw.marks.filter(m => m.type === 'unit'), b = ts(1500, 1500), arcs = ops(L2, 'arc'), texts = ops(L2, 'fillText').map(x => x.args[0]);
      ok(L2.filter(x => x.op === 'fill' && x.alpha === 0.18).length === 2 && arcs.some(a => near(a.args[0], b[0]) && near(a.args[1], b[1]) && near(a.args[2], 800 * raw.view.zoom)), 'embed marks: two zones filled lightly and outlined (a circle and a polygon)');
      ok(ops(L2, 'setLineDash').some(x => JSON.stringify(x.args[0]) === '[7,5]'), 'embed marks: a dashed route');
      ok(arcs.filter(a => a.args[2] === 8).length === 3 && un.every(m => m._s) && !near(un[0]._s[1], un[1]._s[1], 12) && un.slice(0, 2).every(m => !near(m._s[1], b[1], 4)) && near(un[2]._s[0], ts(-800, 800)[0]),
        'embed marks: three unit badges; the two on one spot are fanned out, the single one sits on its spot', un.map(m => m._s));
      ok(texts.indexOf('3') >= 0 && texts.indexOf('12') >= 0 && texts.indexOf('2') >= 0, 'embed marks: the unit counts and the goal number are written inside', texts);
      const g = ts(2000, -1500), st = ts(-2200, -900);
      ok(ops(L2, 'moveTo').some(x => near(x.args[0], g[0]) && near(x.args[1], g[1] - 10)) && L2.some(x => x.op === 'fill' && x.fillStyle === 'var--acc'), 'embed marks: the goal is a diamond in the accent colour');
      ok(ops(L2, 'rect').some(x => near(x.args[0], st[0] - 5) && x.args[2] === 10) && arcs.some(a => near(a.args[0], st[0]) && a.args[2] === 11), 'embed marks: the start is a square with a ring');
      ok(['Enemy camp', 'Attack', 'Hold the bridge', 'You start here', 'Friends'].every(t => texts.indexOf(t) >= 0) && texts.indexOf('Flag C1') >= 0 && texts.indexOf('Flag C1') < texts.indexOf('Enemy camp'), 'embed marks: labels written, after the place labels', texts);
      const sty = L2.map(x => x.fillStyle + ' ' + x.strokeStyle).join(' ');
      ok(!/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(sty) && /var--s2/.test(sty) && /var--s1/.test(sty), 'embed marks: colours from page tokens only (s1 player and ally, s2 enemy)');
      // arrow heads: one at the end, one mid-way on each leg of 120 px and more; arrow:false draws none
      const P3 = [[-900, -900], [900, -900], [900, -300]], S3 = P3.map(p => ts(p[0], p[1])), len = i => Math.hypot(S3[i][0] - S3[i - 1][0], S3[i][1] - S3[i - 1][1]);
      W.log.length = 0; E.update({ marks: [{ type: 'route', pts: P3, side: 'enemy' }] }); const tips = ops(W.log, 'closePath').length;
      W.log.length = 0; E.update({ marks: [{ type: 'route', pts: P3, side: 'enemy', arrow: false }] });
      ok(len(1) >= 120 && len(2) >= 6 && len(2) < 120 && tips === 2 && ops(W.log, 'closePath').length === 0, 'embed marks: an arrow head at the end and one mid-way on the long leg; arrow:false draws none', [len(1), len(2), tips]);
      E.update({ marks: MARKS }); }
    // the hover line names the mark under the pointer and the spot in metres
    { const m = E._t.raw().marks.find(x => x.label === 'Friends'), wpt = E._t.toWorld(m._s[0], m._s[1]);
      cv.fire('mousemove', { offsetX: m._s[0], offsetY: m._s[1] });
      const line = E.el.all().find(e => e.attrs && e.attrs.id && /-ln$/.test(e.attrs.id));
      ok(line.textContent === en('mapviz.game.pk.atMark').replace('{name}', 'Friends').replace('{x}', String(Math.round(wpt[0] / 20 * 10) / 10)).replace('{y}', String(Math.round(wpt[1] / 20 * 10) / 10)) && line.hidden === false, 'embed: the hover line names the mark and the spot in metres', line.textContent);
      cv.fire('mouseleave', {}); ok(line.hidden === true && line.textContent === '', 'embed: with nothing under the pointer the status line shows the places and picture words again'); }
    // keys and the wheel move the view; taking el out and putting it into new DOM keeps view, places and picture
    cv.fire('keydown', { key: 'ArrowRight' }); cv.fire('keydown', { key: '+' }); cv.fire('wheel', { offsetX: 300, offsetY: 200, deltaY: -1 });
    const v1 = E.state().view, n1 = W.calls.length;
    ok(v1.cx > s0.view.cx && v1.zoom > s0.view.zoom && E._t.raw().sel === null, 'embed: arrows pan, plus and the wheel zoom', [s0.view, v1]);
    host1.removeChild(E.el); E.update({ marks: MARKS }); host2.appendChild(E.el); E.update({ marks: MARKS, places: [] });
    ok(E.el.parentNode === host2 && JSON.stringify(E.state().view) === JSON.stringify(v1) && E.state().places === 2 && E.state().picture === 'missing', 'embed: detached and attached again in new DOM, the view, the places and the picture state are kept', E.state());
    E.update({ map: 'map/' + TKEY, mission: '04_two', mapName: 'Two Rivers', target: 'mowas2', height: 300 });
    ok(W.calls.length === n1, 'embed: update with the same map asks for nothing', W.calls.slice(n1).map(c => c.path));
    // the size follows the container (ResizeObserver): a moved view is kept, the canvas takes the new size
    { const ro = ROS[ROS.length - 1]; cv.clientWidth = 600; ro.cb([]);
      ok(ro.seen[0] === cv && cv.width === 600 && E._t.raw().w === 600 && near(E.state().view.zoom, v1.zoom), 'embed: a new container width resizes the canvas and keeps the moved view', [cv.width, E.state().view]);
      cv.clientWidth = 800; ro.cb([]); }
    E.update({ height: 420 }); ok(/height:420px/.test(cv.getAttribute('style')), 'embed: update takes a new height');
    // the button starts the picture job (a user's click may; a redraw never does)
    bts[3].click(); await wait(() => W.calls.some(c => c.method === 'POST'));
    ok(W.calls.filter(c => c.method === 'POST').length === 1 && W.calls.find(c => c.method === 'POST').body.what === 'topo' && bts[3].hidden === true, 'embed: the Make button posts the picture job the 404 named');
    await wait(() => E.state().picture === 'missing');
    // another map: one places request, the picture, a new fit
    const pl0 = nReq(/places/); E.update({ map: 'map/' + SPKEY, mission: '03_test', marks: [] });
    await wait(() => E.state().picture === 'ready' && E.state().places > 2);
    const s2 = E.state();
    ok(nReq(/places/) === pl0 + 1 && s2.map === SPKEY && s2.picture === 'ready' && s2.marks === 0 && JSON.stringify(s2.view) !== JSON.stringify(v1) && near(s2.view.cx, 500) && near(s2.view.cy, 500), 'embed: update with another map makes one places request, loads the picture and fits', [nReq(/places/) - pl0, s2]);
    // a click on a place and on a spot calls onPick with world coordinates; the view stays
    { const p = E._t.toScreen(2600, 1300); cv.fire('click', { offsetX: p[0] + 2, offsetY: p[1] - 1 });
      ok(got.length === 1 && got[0].place && got[0].place.id === 'flag_b02' && got[0].place.label === 'Flag B2' && got[0].x === 2600 && got[0].y === 1300 && got[0].m.x === 130 && got[0].inside === true && got[0].map === SPKEY && got[0].mission === '03_test', 'embed: a click on a place calls onPick with the place in world u and metres', got[0]);
      const q = E._t.toScreen(500.25, -400.5); cv.fire('click', { offsetX: q[0], offsetY: q[1] });
      ok(got.length === 2 && got[1].place === null && near(got[1].x, 500.25, 0.011) && near(got[1].y, -400.5, 0.011) && near(got[1].m.x, 25.01, 0.011) && got[1].inside === true && got[1].units === 'u', 'embed: a click on a spot calls onPick with its world coordinates', got[1]);
      ok(E.state() && E.el.parentNode === host2 && JSON.stringify(E.state().view) === JSON.stringify(s2.view), 'embed: one click picks and the view stays open as it was');
      const line = E.el.all().find(e => e.attrs && e.attrs.id && /-ln$/.test(e.attrs.id));
      cv.fire('click', { offsetX: 2, offsetY: 2 });
      ok(got.length === 2 && line.textContent === en('mapviz.game.pk.outside') && line.getAttribute('role') === 'alert' && line.hidden === false, 'embed: a click outside the playable area calls nothing and says so', line.textContent);
      cv.fire('mousemove', { offsetX: q[0], offsetY: q[1] }); cv.fire('keydown', { key: 'Enter' });
      ok(got.length === 3 && near(got[2].x, 500.25, 0.011), 'embed: Enter takes what the pointer is over');
      let n = 0; E.update({ onPick: () => n++ }); cv.fire('click', { offsetX: q[0], offsetY: q[1] }); ok(n === 1 && got.length === 3, 'embed: update swaps onPick'); E.update({ onPick: r => got.push(r) }); }
    // the modal picker still opens and picks while inline views exist; two inline views keep their own state
    { const E2 = PK.embed({ places: GIVEN, marks: MARKS.slice(0, 2) }); let mg = null;
      ok(E2.state().marks === 2 && E2.state().map === null && E2.state().picture === 'none' && E.state().marks === 0 && E.state().map === SPKEY, 'embed: a second view has its own state', [E2.state(), E.state()]);
      PK.open({ places: GIVEN, onPick: r => { mg = r; } });
      const o = ov(W.doc), dlg = o && o.all().find(e => e.getAttribute('role') === 'dialog'), mcv = o.all().find(e => e.tagName === 'CANVAS'), s = PK._t.toScreen(0, 0);
      ok(dlg && PK.isOpen() && mcv !== cv && btn(W.doc, 'mapviz.game.pk.choose'), 'modal with an inline view on the page: the dialog opens');
      const before = got.length; mcv.fire('click', { offsetX: s[0] + 1, offsetY: s[1] });
      ok(mg && mg.place && mg.place.id === 'f1' && !ov(W.doc) && !PK.isOpen() && got.length === before && E.state() && E.state().map === SPKEY && E.el.parentNode === host2 && E2.state().marks === 2, 'modal with an inline view on the page: it picks and closes, the inline views are untouched', mg);
      E2.close(); }
    // close(): listeners, the size watch and late answers are dropped; later calls do nothing
    { const ro = ROS.find(r => r.seen[0] === cv), nc = W.calls.length, ng = got.length; let err = null;
      E.update({ map: 'map/' + TKEY, mission: '04_two' }); E.close();
      try { E.close(); E.update({ map: 'map/' + SPKEY }); E.fit(); cv.fire('click', { offsetX: 300, offsetY: 200 }); cv.fire('mousemove', { offsetX: 300, offsetY: 200 }); cv.fire('keydown', { key: 'Enter' }); cv.fire('wheel', { deltaY: 1 }); ro.cb([]); bts[0].click(); bts[2].click(); bts[3].click(); } catch (e) { err = e.message; }
      await new Promise(r => setTimeout(r, 30));   // room for a late answer that must do nothing
      ok(!err && E.state() === null && E.el.parentNode === null && ro.off === true && got.length === ng && W.calls.length <= nc + 2 && !W.calls.slice(nc).some(c => /03_test/.test(c.url)), 'embed: close() stops everything; later calls and late answers do nothing', [err, W.calls.slice(nc).map(c => c.url)]); }
    delete global.ResizeObserver;
    { const Wr = loadPick({ rmt: true }), Er = Wr.PK.embed({ map: SPKEY, places: GIVEN, marks: MARKS });
      ok(Er && Wr.calls.length === 0 && Er.state().places === 3 && Er.state().picture === 'none' && Er.el.has(en('mapviz.game.pk.remote')), 'embed on a remote page: no call, the given places and marks on the sketch'); Er.close(); } }

  // ---- the deep link: the viewer opened for a map and mode shows that mission's named places ----
  { const SPDOC = { v: 1, kind: 'doc', modes: [{ id: '03_test', flags: [], spawns: [], points: [] }], boxes: { world: [-2000, -1500, 3000, 2500] } };
    const routes = { 'GET /api/x/mapviz/palette': async () => PAL, 'GET /api/x/mapviz/cache': async () => ({ v: 1, root: '<cache>', bytes: 0, cap: 1, entries: 0, jobs: 0 }),
      'GET /api/x/mapviz/doc': async u => (u.searchParams.get('map') === SPKEY ? SPDOC : clone(FXA.as2.doc.a)), 'GET /api/x/mapviz/places': PLACES };
    const calls = [], S = { gameId: 'mowas2', gameOv: '<game>', mod: '', mapKey: '', cur: 'mapviz', sec: {} };
    const P = H.mkPage({ scripts: [SHELL, PART], lang: L, S, canvas: true, api: H.routeApi(routes, calls) });
    P.screen.view('page:mapviz/mowas2~' + SPKEY + '~03_test'); P.screen.refresh(); await H.flush(80);
    const sum = H.blk(P.root, 'mv.game.sum');
    ok(P.V.q('map') === SPKEY && P.V.q('mode') === '03_test', 'deep link page:mapviz/<target>~<map>~<mode> opens the single-player map and mission', [P.V.q('map'), P.V.q('mode')]);
    ok(sum && sum.has('2 flags') && sum.has('3 mission zones') && sum.has('2 waypoints') && !sum.has('0 flags'), 'deep link, single player: the panel counts the mission flags and places (was "0 flags")', sum && sum.textContent);
    ok(P.root.has('area Flag B2') && P.root.has('Waypoints enemy:tanks: 2'), 'deep link, single player: the DOM list names the mission places', P.root.has('Flag B2'));
    ok(ops(P.log, 'arc').length >= 4, 'deep link: the mission zones are drawn');
    P.screen.view('page:mapviz/mowas2~multi/mv_fixture~frontline'); await H.flush(80);
    const sum2 = H.blk(P.root, 'mv.game.sum');
    ok(P.V.q('mode') === 'frontline' && sum2.has('2 flags') && P.root.has('area Flag 1'), 'deep link, multiplayer frontline mode: its Helpers flag zones are shown (was "0 flags")', sum2.textContent);
    const T0 = P.X.mapviz._t;
    ok(T0.parseLink('mowas2~multi/a') === null && T0.parseLink('mowas2~multi/a~').layers === null, 'deep link: the short form has three fields, two are refused'); }
  // a pick before the viewer was ever shown (the bots page: S.screens.mapviz.pick then show) is kept
  { const routes = { 'GET /api/x/mapviz/palette': async () => PAL, 'GET /api/x/mapviz/cache': async () => ({ v: 1, root: '<cache>', bytes: 0, cap: 1, entries: 0, jobs: 0 }),
      'GET /api/x/mapviz/doc': async () => ({ v: 1, kind: 'doc', modes: [{ id: '03_test', flags: [], spawns: [], points: [] }], boxes: {} }), 'GET /api/x/mapviz/places': PLACES };
    const calls = [], S = { gameId: 'mowas2', gameOv: '<game>', mod: '', mapKey: '', cur: 'missions', sec: {} };
    const P = H.mkPage({ scripts: [SHELL, PART], lang: L, S, canvas: true, api: H.routeApi(routes, calls) });
    S.sec.mapviz = P.root; P.screen.pick(SPKEY, '03_test'); await H.flush(10);
    ok(calls.length === 0, 'early pick: nothing read while the viewer is hidden', calls.map(c => c.path));
    S.cur = 'mapviz'; P.screen.refresh(); await H.flush(80);
    ok(P.V.q('map') === SPKEY && P.V.q('mode') === '03_test' && P.root.has('area Flag B2'), 'early pick: the first show opens the picked map and mode with its places (was lost)', [P.V.q('map'), P.V.q('mode')]); }
  GS._t.reset();

  // JOBS (tools/gui/README.md): the picker's own requests carry a name for the job list; its job poll is a hidden GET

  { const src = require('./game.client');

    const own = src.match(/[^.A-Za-z]api\('\/api\/x\/mapviz\/[a-z]+'[^;]*?\)\.then\(/g) || [];

    ok(own.length === 6 && own.filter(c => /\{what:tx\('mapviz\.game\.pk\.[A-Za-z]+'\)\}\)\.then\($/.test(c)).length === 5 && own.filter(c => /\/job'\+qs\(\{id:id\}\)\)\.then\($/.test(c)).length === 1, 'JOBS: places, tiles and the job post are named; the poll is GET job?id=', own); }


  // ---- language ----
  { const SRC = String(PART), used = new Set(), codes = ['en', 'ru', 'uk', 'zh'];
    for (const m of SRC.matchAll(/'(mapviz\.game\.[A-Za-z0-9_.]*[A-Za-z0-9_])'/g)) used.add(m[1]);
    for (const k of ['side.a', 'side.b', 'box.world', 'box.camera', 'pt.ammo', 'pt.base', 'pt.evac', 'pt.spawn_ext', 'pt.other', 'pk.flag', 'pk.pbase', 'pk.ebase', 'pk.area', 'pk.arean',
      'pk.point', 'pk.pointn', 'pk.path', 'pk.start', 'pk.kind.zone', 'pk.kind.flag', 'pk.kind.start', 'pk.kind.point', 'pk.kind.waypoint']) used.add('mapviz.game.' + k);
    ok(Object.keys(LG).sort().join() === codes.slice().sort().join(), 'lang: exactly en, ru, uk, zh');
    const miss = []; for (const k of used) for (const c of codes) if (!(LG[c] && LG[c][k])) miss.push(c + ' ' + k);
    ok(!miss.length, 'lang: every key used is in all four languages (' + used.size + ')', miss.join(', '));
    const unused = Object.keys(LG.en).filter(k => !used.has(k) && !(/\.1$/.test(k) && used.has(k.slice(0, -2))));
    ok(!unused.length, 'lang: every key in the file is used', unused.join(', '));
    const slots = s => (String(s).match(/\{\w+\}/g) || []).sort().join();
    const bad = []; for (const c of codes) for (const k of Object.keys(LG[c])) { const v = LG[c][k];
      if (/^TODO:/.test(v) || v.indexOf(String.fromCharCode(8212)) >= 0 || / - /.test(v)) bad.push(c + ' ' + k); if (slots(v) !== slots(LG.en[k])) bad.push(c + ' ' + k + ' slots'); if (!(k in LG.en)) bad.push(c + ' extra ' + k); }
    ok(!bad.length, 'lang: same slots, no TODO, no dash separator', bad.join(', '));
    const ru = load({ code: 'ru' }), R = stubV(ru, {}); ru.part.init(R.V);
    ok(R.boxes.game.has(LG.ru['mapviz.game.modeIs'].replace('{mode}', 'battle_zones')), 'lang: the panel speaks Russian'); }
  // ---- no colour literal, ES5 template ----
  { const SRC = String(PART);
    ok(!/#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/.test(SRC), 'no colour literal in the part');
    ok(!/`|\$\{|innerHTML|=>|\blet\b|\bconst\b/.test(SRC), 'ES5 template: no backtick, no dollar brace, no innerHTML, no arrow, no let or const'); }

  if (failN) { console.log('FAIL mapviz game: ' + failN + ' failed, ' + pass + ' passed'); process.exit(1); }
  console.log('PASS mapviz game (' + pass + ')');
})().catch(e => { console.log('FAIL mapviz game: ' + (e && e.stack || e)); process.exit(1); });

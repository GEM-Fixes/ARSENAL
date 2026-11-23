// paint marks test (MV-PNT1): items from the synthetic input and from the fixture doc shape, draw counts per kind, the
// thumbnail cap order, the scale bar left out of a stretched frame, danger from a grid, the four hands, read() from files,
// toFile. Seeded defects: a zone with no centre, a route with one point, a bad danger file.
// usage: node tools/mapviz/paint/test/marks.test.js [scratch dir]
// Author: Imperator_Aug (ARSENAL, ia-8cbb0afd)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');

const W0 = path.resolve(process.argv[2] ? process.argv[2] : fs.mkdtempSync(path.join(os.tmpdir(), 'mapviz-paint-marks-')));
fs.mkdirSync(W0, { recursive: true });
{
  const c = process.env.ARSENAL_CACHE;
  process.env.ARSENAL_CACHE = c && path.resolve(c).startsWith(W0 + path.sep) ? c : path.join(W0, 'cache');
}
let pass = 0, fail = 0;
function ok(c, what) { if (c) pass++; else { fail++; console.log('FAIL mapviz paint: ' + what); } }

const P = require('../index');
const Mk = require('../marks');
const R = require('../../lib/raster');
const { synth } = require('./synth');

const inp = synth({ style: 'staff' });
const palette = inp.palette;
const lit = g => { let n = 0; for (let k = 3; k < g.data.length; k += 4) if (g.data[k]) n++; return n; };

// items: flags set and full set on the synthetic input
{
  const f = Mk.items(inp, Mk.SETS.flags);
  ok(f.filter(i => i.kind === 'zone').length === 1 && f.filter(i => i.kind === 'flag').length === 1 && f.filter(i => i.kind === 'spawn').length === 2, 'items flags: 1 zone, 1 flag, 2 spawns');
  const z = f.find(i => i.kind === 'zone');
  ok(z.x === 0 && z.y === 0 && z.flag === 'f1' && z.zone.rA === 80, 'zone item carries its flag centre');
  ok(f.find(i => i.kind === 'spawn' && i.team === 'b').yaw === 180, 'spawn keeps yaw and team');
  const all = Mk.items(inp, Mk.SETS.full);
  const w = all.filter(i => i.kind === 'water');
  ok(w.length === 1 && w[0].band === 2 && w[0].drown === true && w[0].depthMax === 5, 'water item from water.labels');
  // water label drown lists: new form (no airborne, water rules) and an older file that still lists airborne
  {
    const lab = (dr) => Mk.items(Object.assign({}, inp, { vectors: Object.assign({}, inp.vectors, { 'water.labels': [{ band: 1, x: 1, y: 2, depthMax: 1, drown: dr }] }) }), ['water'])[0].drown;
    ok(lab(['tank_medium']) === true && lab([]) === false, 'label drown, new form: a ground class drowns, an empty list does not');
    ok(lab(['airborne']) === false && lab(['airborne', 'tank_medium']) === true, 'label drown, older form: airborne alone does not drown (guard kept)');
  }
  ok(Mk.items(inp, Mk.SETS.none).length === 0, 'set none: no items');
  ok(Mk.items(Object.assign({}, inp, { mode: 'other' }), Mk.SETS.flags).length === 0, 'a mode the doc lacks: no items');
  // mode null merges every mode; a flag repeated in two modes is taken once
  const d2 = JSON.parse(JSON.stringify(inp.doc));
  d2.modes.push(Object.assign(JSON.parse(JSON.stringify(d2.modes[0])), { id: 'second' }));
  d2.modes[1].flags.push({ name: 'f9', order: 2, x: 100, y: 100, team: 'a', zone: null });
  const m = Mk.items({ doc: d2, mode: null }, ['flags']);
  ok(m.length === 2 && m.map(i => i.name).sort().join() === 'f1,f9', 'mode null: every mode, each flag once');
  // extra items filtered by kinds
  const ex = Mk.items(inp, ['routes'], [{ kind: 'route', pts: [[0, 0], [10, 10]] }, { kind: 'strong', code: 'x', x: 0, y: 0 }, { kind: 'bogus' }]);
  ok(ex.length === 1 && ex[0].kind === 'route', 'extra items kept only for asked kinds');
}

// draw on the synthetic frame (128 x 96: a thumbnail) with each hand
{
  const tr = P.thumbRules(inp.frame);
  ok(tr.thumb === true && Number.isInteger(tr.maxSymbols), 'thumbRules: 128 px is a thumbnail');
  const list = Mk.items(inp, Mk.SETS.full);
  for (const style of ['staff', 'painted', 'recon', 'sketch']) {
    const g = P.canvas.create(inp.frame);
    const r = Mk.draw(g, inp.frame, list, Object.assign({ hand: Mk.HANDS[style], palette, kinds: Mk.SETS.full, seed: 1 }, tr));
    ok(r.drawn.zones === 1 && r.drawn.flags === 1 && r.drawn.spawns === 2 && r.drawn.water === 1 && r.drawn.north === 1 && r.scaleBar === true,
      style + ' hand draws zones 1, flags 1, spawns 2, water 1, north, scale: ' + JSON.stringify(r));
    ok(lit(g) > 200, style + ' hand puts ink down (' + lit(g) + ' px)');
  }
  const a = P.canvas.create(inp.frame), b = P.canvas.create(inp.frame);
  Mk.draw(a, inp.frame, list, Object.assign({ hand: 'pencil', palette, kinds: Mk.SETS.full, seed: 1 }, tr));
  Mk.draw(b, inp.frame, list, Object.assign({ hand: 'pencil', palette, kinds: Mk.SETS.full, seed: 1 }, tr));
  ok(Buffer.compare(Buffer.from(a.data), Buffer.from(b.data)) === 0, 'draw is deterministic');
}

// thumbnail cap: flags first by order, then spawns
{
  const list = [];
  for (let q = 5; q >= 1; q--) list.push({ kind: 'flag', name: 'f' + q, order: q, x: -200 + 60 * q, y: 0, team: null });
  list.push({ kind: 'spawn', team: 'a', x: 0, y: 100, yaw: 0 }, { kind: 'spawn', team: 'b', x: 0, y: -100, yaw: 0 });
  const g = P.canvas.create(inp.frame);
  const r = Mk.draw(g, inp.frame, list, { hand: 'ink', palette, kinds: ['flags', 'spawns'], thumb: true, maxSymbols: 6 });
  ok(r.drawn.flags === 5 && r.drawn.spawns === 1 && r.dropped.spawns === 1, 'cap 6: five flags, one spawn, one dropped ' + JSON.stringify(r));
  const r2 = Mk.draw(P.canvas.create(inp.frame), inp.frame, list, { hand: 'ink', palette, kinds: ['flags', 'spawns'], thumb: true, maxSymbols: 3 });
  ok(r2.drawn.flags === 3 && !r2.drawn.spawns && r2.dropped.flags === 2 && r2.dropped.spawns === 2, 'cap 3: flags 1..3 kept, the rest dropped');
  const r3 = Mk.draw(P.canvas.create(inp.frame), inp.frame, list, { hand: 'ink', palette, kinds: ['flags', 'spawns'], thumb: false, maxSymbols: 3 });
  ok(r3.drawn.flags === 5 && r3.drawn.spawns === 2, 'no cap off a thumbnail');
}

// scale bar: niceMetres, and none in a stretched frame
{
  ok(Mk.niceMetres(37) === 20 && Mk.niceMetres(7.9) === 5 && Mk.niceMetres(100) === 100 && Mk.niceMetres(0) === 1, 'niceMetres 37->20, 7.9->5, 100->100');
  const st = P.frameFor(inp.doc, { w: 128, h: 128 });
  ok(Math.abs(st.stretch - 1) > 0.05, 'frameFor w,h stretches (' + st.stretch + ')');
  const r = Mk.draw(P.canvas.create(st), st, [], { hand: 'ink', palette, kinds: ['scale', 'north'] });
  ok(r.scaleBar === false && r.drawn.north === 1, 'stretched frame: no scale bar, north still drawn');
  // a round zone becomes an ellipse in a stretched frame: wider than tall in px when sy > sx
  const g = P.canvas.create(st);
  Mk.draw(g, st, [{ kind: 'zone', flag: 'f1', zone: { kind: 'circle', rA: 80, rB: 80 }, x: 0, y: 0, team: null }], { hand: 'ink', palette, kinds: ['zones'] });
  let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
  for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) if (g.data[(j * g.w + i) * 4 + 3]) { x0 = Math.min(x0, i); x1 = Math.max(x1, i); y0 = Math.min(y0, j); y1 = Math.max(y1, j); }
  const wx = x1 - x0 + 1, hy = y1 - y0 + 1, ex = 160 / st.sx, ey = 160 / st.sy;
  // the ring stroke adds about its width on each side
  ok(Math.abs(wx - ex) <= 5 && Math.abs(hy - ey) <= 5 && hy > wx, 'zone ellipse ' + wx + ' x ' + hy + ' px vs ' + ex.toFixed(1) + ' x ' + ey.toFixed(1));
}

// seeded defects: a zone with no centre and no flag, a one-point route, a danger item with no grid
{
  const list = [
    { kind: 'zone', flag: 'nobody', zone: { kind: 'circle', rA: 50, rB: 50 }, team: null },
    { kind: 'zone', flag: 'nobody', zone: { kind: 'poly', pts: [[0, 0], [1, 1]] }, team: null },
    { kind: 'route', team: 'a', pts: [[0, 0]] },
    { kind: 'danger', team: 'a', weapon: 'mortar', grid: null },
  ];
  const r = Mk.draw(P.canvas.create(inp.frame), inp.frame, list, { hand: 'ink', palette, kinds: ['zones', 'routes', 'danger'] });
  ok(r.dropped.zones === 2 && r.dropped.routes === 1 && r.dropped.danger === 1 && !r.drawn.zones, 'bad items are dropped and counted ' + JSON.stringify(r.dropped));
}

// danger: a grid coloured 1..3 over the frame; read() finds the files in --in
{
  const fr = inp.frame;
  const g = R.make({ name: 'strong.a.inf.danger', w: 64, h: 48, cell: 10, ox: -320, oy: -240, etype: 'u8', sample: 'cell', nodata: 255 });
  for (let j = 0; j < 48; j++) for (let i = 0; i < 64; i++) g.data[j * 64 + i] = i < 16 ? 3 : i < 32 ? 0 : 255;
  g.meta = { weapon: 'mortar' };
  const c = P.canvas.create(fr);
  const r = Mk.draw(c, fr, [{ kind: 'danger', team: 'a', weapon: 'mortar', grid: g }], { hand: 'ink', palette, kinds: ['danger'] });
  ok(r.drawn.danger === 1, 'danger drawn');
  ok(c.data[(10 * fr.W + 5) * 4 + 3] > 0 && c.data[(10 * fr.W + 40) * 4 + 3] === 0 && c.data[(10 * fr.W + 100) * 4 + 3] === 0, 'danger: level 3 coloured, 0 and nodata clear');
  const dir = path.join(W0, 'in');
  fs.mkdirSync(dir, { recursive: true });
  require('../../lib/raster/gridfile').write(path.join(dir, 'strong.a.inf.danger.mvg'), g);
  fs.writeFileSync(path.join(dir, 'strong.b.inf.danger.mvg'), 'not a grid');
  fs.writeFileSync(path.join(dir, 'routes.json'), JSON.stringify({ v: 1, items: [{ side: 'a', pts: [[-200, 0], [0, 0], [100, 50]] }, { side: 'b' }] }));
  fs.writeFileSync(path.join(dir, 'strong.inf.json'), JSON.stringify({ v: 1, candidates: [{ side: 'b', label: 'reverse', x: 50, y: 50, top: true }, { side: 'a', label: 'dead', x: 0, y: 0, top: false }] }));
  const its = Mk.read(inp, { in: [dir], kinds: ['routes', 'strong', 'danger'], kind: 'inf' });
  const by = k => its.filter(i => i.kind === k);
  ok(by('route').length === 1 && by('route')[0].team === 'a', 'read: one route with points');
  ok(by('strong').length === 1 && by('strong')[0].code === 'reverse' && by('strong')[0].team === 'b', 'read: top strong candidate, code = label');
  ok(by('danger').length === 1 && by('danger')[0].layer === 'strong.a.inf.danger' && by('danger')[0].grid.w === 64, 'read: the good danger grid, the bad file left out');
  const tf = Mk.toFile(its);
  const td = tf.find(i => i.kind === 'danger');
  ok(td && !td.grid && td.layer === 'strong.a.inf.danger' && td.weapon === 'mortar', 'toFile: danger item carries the layer name, not the grid');
  ok(JSON.stringify(tf).length < 2000, 'toFile output is small');
  const d = Mk.draw(P.canvas.create(fr), fr, its, { hand: 'grease', palette, kinds: ['routes', 'strong', 'danger'] });
  ok(d.drawn.routes === 1 && d.drawn.strong === 1 && d.drawn.danger === 1, 'grease hand draws the read items');
}

// hand(): the four hands give outlined grease/pencil, a minimum stroke on a thumbnail
{
  const ink = Mk.hand({ hand: 'ink', palette }, 'a'), gr = Mk.hand({ hand: 'grease', palette }, 'b'), pe = Mk.hand({ hand: 'pencil', palette, thumb: true, minStroke: 2 }, null);
  ok(ink.amp === 0 && ink.inkMarks && gr.amp > 0 && gr.shape === 'outlined' && pe.shape === 'outlined' && pe.width >= 2, 'hands: ink straight, grease and pencil wobble, outlined; thumb min stroke');
  ok(ink.fill.join() !== Mk.hand({ hand: 'ink', palette }, 'b').fill.join(), 'ink hand: side colours differ');
}

if (!process.argv[2]) fs.rmSync(W0, { recursive: true, force: true });
if (fail) { console.log('FAIL mapviz paint marks: ' + fail + ' failed, ' + pass + ' passed'); process.exit(1); }
console.log('PASS mapviz paint marks (' + pass + ')');

// Map Viewer measure tool test (MV-PG1, second half): node tools/gui/ext/mapviz/sub/measure.test.js [scratch dir]
// The measure part in the fake DOM on a stub V (stub page from hover.test.js, the fixture's hover pack): a 3-4-5 triangle
// in world units gives 5 m (20 u = 1 m), the bearing clockwise from north with screen up = +world y, a polyline's total,
// the height change over the ridge, typed points in metres, the DOM lists, Esc ends the tool and keeps the points, the
// line drawn on the map; seeded defects (two equal points, a point outside the world box, text that is not a number,
// no map); RMT; the language file both ways; no colour literal in the page file.
// Author: Imperator_Aug (ARSENAL, ia-a922c17c)
'use strict';
const path = require('path');
const { stub: T } = require('./hover.test');
T.scratch('measure');
const HS = T.HS, HOVER = require('./hover.client'), MEASURE = require('./measure.client');
let pass = 0, failN = 0;
const ok = (c, what, extra) => { if (process.env.MVDBG) console.log('.. ' + what); if (c) pass++; else { failN++; console.log('FAIL mapviz measure: ' + what + (extra !== undefined ? '\n  ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 700) : '')); } };
const en = k => T.L.en[k];
async function page(o) { const pg = T.load({ scripts: [HOVER, MEASURE] }), V = T.stubV(pg, o); await T.start(pg, V); return { pg, V, box: V.panels.measure }; }
const texts = (box, id) => { const e = HS.blk(box, 'mv.measure.' + id); return e ? e.textContent : null; };
const items = (box, n) => box.all().filter(e => e.tagName === 'OL')[n].all().filter(e => e.tagName === 'LI').map(e => e.textContent);
const inputs = box => box.all().filter(e => e.tagName === 'INPUT');
const btn = (box, k) => box.all().find(e => e.tagName === 'BUTTON' && e.textContent === en(k));

(async () => {
  // 1 the 3-4-5 triangle, bearings, a polyline
  { const { V, box } = await page();
    ok(!!V.tools.measure && V.tools.measure.key === 'm' && V.tools.measure.label === 'mapviz.measure.tool', 'the tool is added with V.addTool, key m');
    ok(V.layers.measure && V.layers.measure.group === 'tools' && V.layers.measure.engineTrue === true, 'the line is a layer in the tools group');
    ok(items(box, 0)[0] === en('mapviz.measure.none'), 'no points yet: told');
    V.use('measure');
    ok(texts(box, 'msg') === en('mapviz.measure.started'), 'starting the tool is told');
    V.cursor(0, 0, true); V.cursor(60, 80, true);
    ok(items(box, 0).join('|') === 'Point 1: x 0.0 m, y 0.0 m|Point 2: x 3.0 m, y 4.0 m', 'the points in metres in a DOM list', items(box, 0));
    ok(/^Leg 1: 5\.00 m, bearing 36\.9 degrees/.test(items(box, 1)[0]), '3-4-5 triangle: 100 u is 5 m, bearing 36.9', items(box, 1));
    ok(texts(box, 'total') === 'Length along the line: 5.00 m over 1 leg', 'the total, one leg (plural form)', texts(box, 'total'));
    ok(texts(box, 'straight') === 'First to last point in a straight line: 5.00 m, bearing 36.9 degrees', 'the straight distance and bearing', texts(box, 'straight'));
    const sum = HS.blk(box, 'mv.measure.sum');
    ok(sum.attrs['aria-live'] === 'polite', 'the sums are aria-live');
    // bearings: north 0 (screen up = +world y), east 90, south 180, west 270
    const bear = (x, y) => { V.use('measure'); V.cursor(0, 0, true); V.cursor(x, y, true); return /bearing ([\d.]+) degrees/.exec(items(box, 1)[0])[1]; };
    ok(bear(0, 100) === '0.0' && bear(100, 0) === '90.0' && bear(0, -100) === '180.0' && bear(-100, 0) === '270.0', 'bearing: north 0, east 90, south 180, west 270',
      [bear(0, 100), bear(100, 0), bear(0, -100), bear(-100, 0)]);
    // just west of north: 359.97 degrees rounds to 0.0, never 360.0; one degree west stays 359.4
    ok(bear(-0.05, 100) === '0.0' && bear(-1, 100) === '359.4', 'bearing: just west of north is 0.0, not 360.0', [bear(-0.05, 100), bear(-1, 100)]);
    // the screen: up on the screen is north
    const up = V.toWorld(400, 200), down = V.toWorld(400, 400);
    ok(up[1] > down[1], 'stub view: screen up is +world y (as the shell)');
    // a polyline: 3 m east then 4 m north
    V.use('measure'); V.cursor(0, 0, true); V.cursor(60, 0, true); V.cursor(60, 80, true);
    ok(texts(box, 'total') === 'Length along the line: 7.00 m over 2 legs', 'polyline: 3 + 4 = 7 m', texts(box, 'total'));
    ok(texts(box, 'straight') === 'First to last point in a straight line: 5.00 m, bearing 36.9 degrees', 'polyline: first to last 5 m');
    ok(/^Leg 1: 3\.00 m, bearing 90\.0/.test(items(box, 1)[0]) && /^Leg 2: 4\.00 m, bearing 0\.0/.test(items(box, 1)[1]), 'polyline: each leg', items(box, 1));
    // the line on the map, a dashed piece to the cursor while the tool is on
    V.cursor(100, 100);
    const log = [], ctx = HS.stubCtx(log, { _id: 'map' });
    V.layers.measure.draw(ctx, V.view);
    ok(log.filter(e => e.op === 'stroke').length >= 4 && log.some(e => e.op === 'setLineDash' && e.args[0].length) && log.filter(e => e.op === 'arc').length === 3, 'the line, its casing, a dot per point and the dashed piece to the cursor', log.map(e => e.op).join());
    ok(log.some(e => e.op === 'moveTo' && e.args[0] === 400 && e.args[1] === 300), 'the line starts at the first point on the screen');
    ok(typeof ctx.strokeStyle === 'string' && /^rgba\(/.test(ctx.strokeStyle), 'colours come from the palette marks', ctx.strokeStyle);
    ok(typeof V.layers.measure.list !== 'function', 'the layer gives the shell no item list (the panel lists repeat the points)');
    // Esc (the shell's useTool(null) calls end): the tool ends, the points stay
    V.use(null);
    ok(texts(box, 'msg') === en('mapviz.measure.ended') && items(box, 0).length === 3, 'Esc ends the tool, the points stay');
    const n = V.redraws; V.cursor(200, 200, true);
    ok(items(box, 0).length === 3, 'after Esc a click adds nothing');
    // undo and clear
    btn(box, 'mapviz.measure.undo').click();
    ok(items(box, 0).length === 2 && texts(box, 'total') === 'Length along the line: 3.00 m over 1 leg', 'undo takes back the last point');
    btn(box, 'mapviz.measure.clear').click();
    ok(items(box, 0)[0] === en('mapviz.measure.none') && !texts(box, 'total'), 'clear');
    ok(V.redraws > n, 'the map is redrawn');
  }
  // 2 heights: over the ridge
  { const { V, box } = await page();
    V.use('measure'); V.cursor(-300, 0, true); V.cursor(-200, 0, true);
    ok(/height change \+3\.00 m$/.test(items(box, 1)[0]), 'leg height change from the hover pack: +3.00 m up the ridge', items(box, 1));
    ok(texts(box, 'rise') === 'Height change from first to last point: +3.00 m', 'the height change first to last', texts(box, 'rise'));
    V.cursor(-100, 0, true);
    ok(texts(box, 'rise') === 'Height change from first to last point: 0.00 m' && /height change -3\.00 m$/.test(items(box, 1)[1]), 'down the other side', [texts(box, 'rise'), items(box, 1)]);
  }
  // 3 typed points
  { const { V, box } = await page();
    const [x, y] = inputs(box);
    ok(inputs(box).length === 2 && HS.blk(box, 'mv.measure.x').className.split(' ').includes('fld'), 'two typed fields, field leaves');
    x.value = '0'; y.value = '0'; btn(box, 'mapviz.measure.add').click();
    x.value = ' 3 '; y.value = '4,0'; y.fire('keydown', { key: 'Enter' });
    ok(items(box, 0).join('|') === 'Point 1: x 0.0 m, y 0.0 m|Point 2: x 3.0 m, y 4.0 m', 'typed points in metres (Enter in y, a comma decimal)', items(box, 0));
    ok(texts(box, 'total') === 'Length along the line: 5.00 m over 1 leg' && x.value === '' && y.value === '', 'typed 3-4-5 gives 5 m, the fields are emptied');
    ok(texts(box, 'msg') === en('mapviz.measure.added'), 'a typed point is told');
    // seeded: text that is not a number
    x.value = 'abc'; y.value = '1'; btn(box, 'mapviz.measure.add').click();
    ok(texts(box, 'msg') === en('mapviz.measure.badNum') && items(box, 0).length === 2 && x.value === 'abc', 'seeded: not a number: told, nothing added, the text stays');
    x.value = '1e3'; btn(box, 'mapviz.measure.add').click();
    ok(texts(box, 'msg') === en('mapviz.measure.badNum'), 'seeded: an exponent is not taken');
    // seeded: a point outside the world box [-600, -440, 600, 440] u = 30 m by 22 m
    x.value = '700'; y.value = '0'; btn(box, 'mapviz.measure.add').click();
    ok(texts(box, 'msg') === en('mapviz.measure.outside') && items(box, 0).length === 2, 'seeded: a point outside the world box is refused');
    x.value = '30.5'; y.value = '0'; btn(box, 'mapviz.measure.add').click();
    ok(texts(box, 'msg') === en('mapviz.measure.outside'), 'seeded: just outside the box (30.5 m) is refused');
    x.value = '30'; y.value = '22'; btn(box, 'mapviz.measure.add').click();
    ok(items(box, 0).length === 3, 'the box corner (30 m, 22 m) is taken');
    // seeded: two equal points
    x.value = '30'; y.value = '22'; btn(box, 'mapviz.measure.add').click();
    ok(texts(box, 'msg') === en('mapviz.measure.same') && items(box, 0).length === 3, 'seeded: the same point twice is refused');
    V.use('measure'); V.cursor(10, 10, true); V.cursor(10, 10, true);
    ok(items(box, 0).length === 1 && texts(box, 'msg') === en('mapviz.measure.same'), 'seeded: the same point clicked twice is refused');
  }
  // 3b typed just west of north: x 0 m then x -0.001 m, 20 m north (0.003 degrees west) is said as bearing 0.0
  { const { box } = await page();
    const [x, y] = inputs(box);
    x.value = '0'; y.value = '0'; btn(box, 'mapviz.measure.add').click();
    x.value = '-0.001'; y.value = '20'; btn(box, 'mapviz.measure.add').click();
    ok(/^Leg 1: 20\.00 m, bearing 0\.0 degrees/.test(items(box, 1)[0]) && texts(box, 'straight') === 'First to last point in a straight line: 20.00 m, bearing 0.0 degrees', 'typed: just west of north is bearing 0.0', [items(box, 1), texts(box, 'straight')]);
  }
  // 4 no heights yet, no map, a new map, RMT
  { const { V, box } = await page({ api: () => { throw T.notFound({ what: 'grids', args: {} }); } });
    V.use('measure'); V.cursor(0, 0, true); V.cursor(60, 80, true);
    ok(items(box, 1)[0] === 'Leg 1: 5.00 m, bearing 36.9 degrees' && texts(box, 'rise') === en('mapviz.measure.noHeight'), 'no heights: distance and bearing, the height change said missing', [items(box, 1), texts(box, 'rise')]);
    V.Q.map = 'multi/other'; V.doc = T.clone(T.DOC); V.emit('map', { key: 'multi/other', doc: V.doc });
    ok(items(box, 0)[0] === en('mapviz.measure.none'), 'another map clears the points');
    const p2 = await page({ q: { map: null }, doc: null });
    p2.V.use('measure'); p2.V.cursor(0, 0, true);
    ok(texts(p2.box, 'msg') === en('mapviz.measure.noMap') && items(p2.box, 0)[0] === en('mapviz.measure.none'), 'seeded: no map: told, no point');
    const p3 = await page({ q: { rmt: true } });
    ok(!p3.V.tools.measure && !p3.V.panels.measure && !p3.V.layers.measure && p3.V.calls.length === 0, 'RMT: no tool, no panel, no call');
  }
  // 4b height nodata (R16): lattice points (42..47, 48) = x -220..-170 on y 0 are nodata; (-200, 0) has no ground under it
  { const ND = -32768, holes = [42, 43, 44, 45, 46, 47].map(i => [i, 48]);
    const ndPack = p => { const b = Buffer.from(p.layers.height.data, 'base64'); holes.forEach(([i, j]) => b.writeInt16LE(ND, (j * p.w + i) * 2)); p.layers.height.data = b.toString('base64'); p.layers.height.nodata = ND; return p; };
    const { V, box } = await page({ api: T.defApi({ pack: ndPack }) });
    V.use('measure'); V.cursor(-300, 0, true); V.cursor(-200, 0, true);
    ok(items(box, 1)[0] === 'Leg 1: 5.00 m, bearing 90.0 degrees' && texts(box, 'rise') === en('mapviz.measure.noGround'), 'nodata: a point with no ground: the leg has no height change and the sum says so in words', [items(box, 1), texts(box, 'rise')]);
    V.cursor(-100, 0, true);
    ok(texts(box, 'rise') === 'Height change from first to last point: 0.00 m' && texts(box, 'noh') === en('mapviz.measure.noGround') && items(box, 1).every(x => !/height change/.test(x)), 'nodata: first and last have ground: the change is given, the missing legs are told', [texts(box, 'rise'), texts(box, 'noh'), items(box, 1)]);
    ok(!/-16\d\d|-327|32768/.test(HS.blk(box, 'mv.measure.lists').textContent), 'nodata: no -1638 m or -327 m anywhere');
    ok(en('mapviz.measure.noGround') !== en('mapviz.measure.noHeight') && ['ru', 'uk', 'zh'].every(c => T.L[c]['mapviz.measure.noGround'] && T.L[c]['mapviz.measure.noGround'] !== en('mapviz.measure.noGround')), 'nodata: no ground is its own words in each language');
    // planted: without the header nodata the hole reads as -1638.40 m and the change is a number
    const p2 = await page({ api: T.defApi({ pack: p => { ndPack(p); p.layers.height.nodata = null; return p; } }) });
    p2.V.use('measure'); p2.V.cursor(-300, 0, true); p2.V.cursor(-200, 0, true);
    ok(/height change -16\d\d\.\d\d m$/.test(items(p2.box, 1)[0]), 'planted: without the header nodata the hole is taken as a height', items(p2.box, 1));
  }
  // 5 language and page file rules
  T.langCheck(ok, T.LANG.measure, MEASURE, ['noMap', 'outside', 'same'], 'measure');
  T.colourCheck(ok, path.join(__dirname, 'measure.client.js'), 'measure');
  if (failN) { console.log('FAIL mapviz measure: ' + failN + ' of ' + (pass + failN)); process.exit(1); }
  console.log('PASS mapviz measure (' + pass + ')');
  process.exit(0);
})().catch(e => { console.log('FAIL mapviz measure: ' + (e && e.stack || e)); process.exit(1); });

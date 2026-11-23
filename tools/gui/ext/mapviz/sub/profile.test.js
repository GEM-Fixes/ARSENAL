// Map Viewer height profile test (MV-PG1, second half): node tools/gui/ext/mapviz/sub/profile.test.js [scratch dir]
// The profile part in the fake DOM on a stub V (stub page from hover.test.js, the fixture's hover pack): across the ridge
// the peak height and where it is, the terrain sight line blocked or clear (worked by hand below), the terrain-only note,
// the eye heights, the chart on its own canvas and the mark on the map from the chart's cursor, keys and table rows; no
// canvas context gives the table; typed points; seeded defects (two equal points, a point outside the world box, text that
// is not a number, a pack with a missing layer, heights not made); RMT; the language file; no colour literal.
// Author: Imperator_Aug (ARSENAL, ia-5fa6c749)
'use strict';
const path = require('path');
const { stub: T } = require('./hover.test');
T.scratch('profile');
const HS = T.HS, HOVER = require('./hover.client'), PROFILE = require('./profile.client');
let pass = 0, failN = 0;
const ok = (c, what, extra) => { if (process.env.MVDBG) console.log('.. ' + what); if (c) pass++; else { failN++; console.log('FAIL mapviz profile: ' + what + (extra !== undefined ? '\n  ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 700) : '')); } };
const en = k => T.L.en[k];
async function page(o, lo) { const pg = T.load(Object.assign({ scripts: [HOVER, PROFILE] }, lo || {})), V = T.stubV(pg, o); await T.start(pg, V); return { pg, V, box: V.panels.profile }; }
const text = (box, id) => { const e = HS.blk(box, 'mv.profile.' + id); return e ? e.textContent : null; };
const btn = (box, k) => box.all().find(e => e.tagName === 'BUTTON' && e.textContent === en(k));
const rows = box => { const t = HS.blk(box, 'mv.profile.table'); return t ? t.all().filter(e => e.tagName === 'TR').slice(1).map(r => r.all().filter(e => e.tagName === 'TD').map(d => d.textContent)) : []; };
const chartCv = box => box.all().find(e => e.tagName === 'CANVAS');
// By hand, the ridge h = 60 * max(0, 1 - |x + 200| / 100) u (README 10.4), from A (-300, 0) to B (-100, 0), 200 u = 10 m,
// samples every 5 u (half a cell). Both ends are at 0, so the sight line is flat at the eye height: standing 1.6 m = 32 u.
// The ground is above 32 u where |x + 200| < 46.7, the first sample is x -245 (d 55 u = 2.75 m), 33 u, 1 u = 0.05 m over.
// The peak is 60 u = 3 m at x -200, 100 u = 5 m from A. From A (-210, 0) to B (-190, 0) both ends are at 54 u, the line at
// 86 u is over the peak at 60 u: clear.
(async () => {
  // 1 across the ridge
  { const { pg, V, box } = await page();
    ok(!!V.tools.profile && V.tools.profile.key === 'p' && V.layers.profile && V.layers.profile.group === 'tools' && V.layers.profile.engineTrue === false, 'the tool, key p; the line a tools layer, not engine truth');
    V.use('profile');
    ok(text(box, 'msg') === en('mapviz.profile.pickA'), 'the tool asks for the first point');
    V.cursor(-300, 0, true);
    ok(text(box, 'msg') === en('mapviz.profile.pickB'), 'then the last point');
    V.cursor(-100, 0, true);
    const sum = HS.blk(box, 'mv.profile.sum');
    ok(sum.attrs['aria-live'] === 'polite' && sum.has('Length: 10.00 m'), 'length 200 u = 10 m, aria-live', sum.textContent);
    ok(sum.has('Ground from 0.00 m to 3.00 m, highest 5.00 m from the first point'), 'the peak: 3 m (60 u) at 5 m from the first point', sum.textContent);
    ok(text(box, 'sight') === 'Sight line blocked at eye height 1.60 m: the ground rises 0.05 m above it, 2.75 m from the first point.', 'standing eye: blocked first at 2.75 m, 0.05 m over (by hand)', text(box, 'sight'));
    ok(sum.has(en('mapviz.profile.terrain')), 'the sight line says it is terrain only');
    const eye = box.all().find(e => e.tagName === 'SELECT');
    ok(!!eye && eye.all().filter(e => e.tagName === 'OPTION').map(o => o.textContent).join() === 'Standing,Kneeling,Lying', 'the eye height choice');
    eye.value = 'prone'; eye.fire('change');
    ok(/^Sight line blocked at eye height 0\.54 m/.test(text(box, 'sight')), 'lying eye: still blocked', text(box, 'sight'));
    // the chart: its own canvas, drawn with the stub context
    const cv = chartCv(box);
    ok(!!cv && cv.attrs.role === 'img' && cv.attrs.tabindex === '0' && cv.attrs['aria-label'] === en('mapviz.profile.chart'), 'the chart canvas: role img, focusable, named');
    ok(pg.log.some(e => e.cv === cv._id && e.op === 'fillRect') && pg.log.filter(e => e.cv === cv._id && e.op === 'stroke').length >= 3, 'the chart is drawn (ground, axes, sight line)');
    ok(pg.log.some(e => e.cv === cv._id && e.op === 'arc'), 'the chart rings the first blocked point');
    ok(HS.blk(box, 'mv.profile.table').hidden === true, 'with a chart the table waits behind a button');
    const tog = btn(box, 'mapviz.profile.showTable');
    ok(!!tog && tog.attrs['aria-expanded'] === 'false', 'the show values button');
    tog.click();
    ok(HS.blk(box, 'mv.profile.table').hidden === false && tog.textContent === en('mapviz.profile.hideTable') && tog.attrs['aria-expanded'] === 'true', 'the button shows the table');
    // the cursor on the chart marks the spot on the map: the middle of the chart is 5 m, the peak
    const n0 = V.redraws;
    cv.fire('mousemove', { clientX: 44 + 0.5 * (480 - 44 - 10), clientY: 50 });
    ok(text(box, 'mark') === 'Marked: 5.00 m from the first point, ground height 3.00 m', 'the chart cursor marks a spot', text(box, 'mark'));
    ok(V.redraws > n0, 'the map is redrawn for the mark');
    const log = [], ctx = HS.stubCtx(log, { _id: 'map' });
    V.layers.profile.draw(ctx, V.view);
    const at = V.toScreen(-200, 0);
    ok(log.some(e => e.op === 'arc' && Math.abs(e.args[0] - at[0]) < 1e-9 && Math.abs(e.args[1] - at[1]) < 1e-9), 'the mark is drawn on the map at x -200 (the peak)', log.filter(e => e.op === 'arc').map(e => e.args.slice(0, 2)));
    const bl = V.toScreen(-280, 0);   // lying eye 0.54 m = 10.8 u: ground over it where |x + 200| < 82, first sample x -280
    ok(log.some(e => e.op === 'arc' && Math.abs(e.args[0] - bl[0]) < 1e-6 && e.args[2] === 6), 'the first blocked point is ringed on the map', log.filter(e => e.op === 'arc').map(e => e.args.slice(0, 3)));
    cv.fire('keydown', { key: 'End' });
    ok(text(box, 'mark') === 'Marked: 10.00 m from the first point, ground height 0.00 m', 'End on the chart marks the last point', text(box, 'mark'));
    cv.fire('keydown', { key: 'ArrowLeft', shiftKey: true });
    ok(text(box, 'mark') === 'Marked: 7.50 m from the first point, ground height 1.50 m', 'Shift+Left steps back 10 samples', text(box, 'mark'));
    // the table rows: from the first point, ground, sight line; a row's button marks that spot
    const r = rows(box);
    ok(r.length >= 20 && r.length <= 60 && r[0].join('|') === '0.00|0.00|0.54' && r.some(x => x[0] === '5.00' && x[1] === '3.00') && r.some(x => x[0] === '2.75'), 'the values table: at most 60 rows, the peak and the first blocked point in', r.slice(0, 3));
    const rb = HS.blk(box, 'mv.profile.table').all().find(e => e.tagName === 'BUTTON' && e.textContent === '2.75');
    rb.click();
    ok(text(box, 'mark') === 'Marked: 2.75 m from the first point, ground height 1.65 m', 'a table row marks its spot', text(box, 'mark'));
    // the theme event redraws the chart
    const c0 = pg.log.length; V.emit('theme', {});
    ok(pg.log.length > c0, 'the theme event redraws the chart');
    // clear by hand
    V.use('profile'); V.cursor(-210, 0, true); V.cursor(-190, 0, true);
    ok(text(box, 'sight') === 'Sight line clear at eye height 0.54 m.' || text(box, 'sight') === 'Sight line clear at eye height 1.60 m.', 'a short line over the top: clear', text(box, 'sight'));
    eye.value = 'stand'; eye.fire('change');
    ok(text(box, 'sight') === 'Sight line clear at eye height 1.60 m.', 'standing over the top: clear (by hand)', text(box, 'sight'));
    // Esc: the tool ends, the profile stays; an unfinished first point is dropped
    V.use(null);
    ok(text(box, 'msg') === en('mapviz.profile.ended') && text(box, 'sight') === 'Sight line clear at eye height 1.60 m.', 'Esc ends the tool, the profile stays');
    V.use('profile'); V.cursor(0, 0, true); V.use(null);
    const log2 = [], ctx2 = HS.stubCtx(log2, { _id: 'map' }); V.layers.profile.draw(ctx2, V.view);
    ok(log2.length === 0, 'Esc after one point drops it');
  }
  // 2 no canvas context: the table
  { const { V, box } = await page(undefined, { canvas: false });
    ok(!chartCv(box) || !HS.blk(box, 'mv.profile.chart'), 'no canvas context: no chart');
    ok(text(box, 'nochart') === en('mapviz.profile.noChart'), 'no canvas context: told');
    V.use('profile'); V.cursor(-300, 0, true); V.cursor(-100, 0, true);
    const t = HS.blk(box, 'mv.profile.table');
    ok(t.hidden === false && rows(box).length > 0 && !btn(box, 'mapviz.profile.showTable'), 'no canvas context: the table is shown, no toggle');
    const tt = t.all().find(e => e.tagName === 'TABLE');
    ok(!!tt && !t.dataset.blk.includes('_') && t.tagName === 'DIV' && tt.attrs['aria-label'] === en('mapviz.profile.table') && tt.all().filter(e => e.tagName === 'TH').map(e => e.textContent).join('|') === 'From the first point, m|Ground height, m|Sight line height, m', 'the table (in a leaf of its own) has a name and column heads');
    ok(rows(box).some(x => x[0] === '5.00' && x[1] === '3.00'), 'the table holds the peak');
  }
  // 3 typed points and seeded defects
  { const { V, box } = await page();
    const ins = box.all().filter(e => e.tagName === 'INPUT');
    ok(ins.length === 4, 'four typed fields');
    const typeIn = (a) => { a.forEach((v, i) => { ins[i].value = v; }); btn(box, 'mapviz.profile.show').click(); };
    typeIn(['-15', '0', '-5', '0']);
    ok(text(box, 'sum').indexOf('Length: 10.00 m') === 0 && /blocked/.test(text(box, 'sight')), 'typed points in metres give the ridge profile', text(box, 'sum'));
    typeIn(['-15', '0', '-15', '0']);
    ok(text(box, 'msg') === en('mapviz.profile.same'), 'seeded: two equal points refused', text(box, 'msg'));
    typeIn(['-15', '0', '700', '0']);
    ok(text(box, 'msg') === en('mapviz.profile.outside'), 'seeded: a point outside the world box refused');
    typeIn(['x', '0', '1', '0']);
    ok(text(box, 'msg') === en('mapviz.profile.badNum'), 'seeded: text that is not a number refused');
    ok(text(box, 'sum').indexOf('Length: 10.00 m') === 0, 'a refused input keeps the last profile');
    V.use('profile'); V.cursor(5, 5, true); V.cursor(5, 5, true);
    ok(text(box, 'msg') === en('mapviz.profile.same'), 'seeded: the same point clicked twice refused');
    V.cursor(9000, 0, true);
    ok(text(box, 'msg') === en('mapviz.profile.outside'), 'seeded: a click outside the world box refused');
  }
  { // a pack with a missing layer: told, no profile
    const { V, box } = await page({ api: T.defApi({ pack: p => { delete p.layers.slopecls; return p; } }) });
    V.use('profile'); V.cursor(-300, 0, true); V.cursor(-100, 0, true);
    ok(text(box, 'msg') === T.L.en['mapviz.profile.badLayer'].replace('{what}', T.L.en['mapviz.hover.lay.slopecls']) && !text(box, 'sum'), 'seeded: a pack with no slope layer: that layer is named, no profile', text(box, 'msg'));
  }
  { // a pack refused for another reason (not a hover pack): the heights cannot be read
    const { V, box } = await page({ api: T.defApi({ hover: () => ({ v: 1, kind: 'grid' }) }) });
    V.use('profile'); V.cursor(-300, 0, true); V.cursor(-100, 0, true);
    ok(text(box, 'msg') === T.L.en['mapviz.profile.fault'].replace('{msg}', T.L.en['mapviz.profile.noHeights']) && !text(box, 'sum'), 'seeded: not a hover pack: the heights cannot be read', text(box, 'msg'));
  }
  { // heights not made: told with a button; the job runs on the press, then the profile shows
    let made = 0;
    const { V, box } = await page({ api: T.defApi({ hover: () => { if (!made) throw T.notFound({ what: 'grids', args: {} }); return T.clone(T.PACK); } }), job: () => { made++; return { state: 'done' }; } });
    V.use('profile'); V.cursor(-300, 0, true); V.cursor(-100, 0, true);
    ok(text(box, 'msg').indexOf(en('mapviz.profile.need')) === 0 && !V.calls.some(c => c.m === 'JOB'), 'heights not made: told, no job', text(box, 'msg'));
    btn(box, 'mapviz.profile.make').click(); await HS.flush();
    ok(made === 1 && text(box, 'sum').indexOf('Length: 10.00 m') === 0, 'the button makes them and the profile shows', text(box, 'sum'));
  }
  { // W3: the heights job runs (started by another part): the profile shows its words and no second Make it; W1: when
    // it ends the pack asks again and the profile shows
    let made = 0; const jobs = [];
    const { V, box } = await page({ q: { jobs }, api: T.defApi({ hover: () => { if (!made) throw T.notFound({ what: 'grids', args: {} }); return T.clone(T.PACK); } }), job: () => { made++; return { state: 'done' }; } });
    V.use('profile'); V.cursor(-300, 0, true); V.cursor(-100, 0, true);
    jobs.push({ id: 'g', what: 'grids', target: 'mowas2', map: 'multi/mv_fixture', state: 'running', text: 'Ground grids: reading' }); V.emit('job', jobs[0]);
    ok(text(box, 'msg') === en('mapviz.profile.making').replace('{job}', 'Ground grids: reading') && !btn(box, 'mapviz.profile.make'), 'W3: the heights job runs: its words, no Make it', text(box, 'msg'));
    jobs.length = 0; made = 1; V.emit('job', { id: 'g', end: true, state: 'done' }); V.emit('products', {}); await HS.flush();
    ok(text(box, 'sum') && text(box, 'sum').indexOf('Length: 10.00 m') === 0 && !V.calls.some(c => c.m === 'JOB'), 'W1: after the job ended the profile shows by itself, no job posted here', text(box, 'sum'));
  }
  { // no map; RMT
    const p1 = await page({ q: { map: null }, doc: null });
    p1.V.use('profile'); p1.V.cursor(0, 0, true);
    ok(text(p1.box, 'msg') === en('mapviz.profile.noMap'), 'seeded: no map: told');
    const p2 = await page({ q: { rmt: true } });
    ok(!p2.V.tools.profile && !p2.V.panels.profile && p2.V.calls.length === 0, 'RMT: no tool, no panel, no call');
  }
  // 3b height nodata (R16): lattice points (42..47, 48) = x -220..-170 on the line y 0 are nodata (-32768, header nodata).
  // Along y 0 only row 48 weighs, so the samples x -220..-170 (11 of them, every 5 u) have no ground; x -225 and x -230 keep
  // the left corner only (42 u), x -165 the right one (36 u). The ridge top (60 u at x -200) falls in the gap.
  { const ND = -32768, holes = [42, 43, 44, 45, 46, 47].map(i => [i, 48]);
    const ndPack = p => { const b = Buffer.from(p.layers.height.data, 'base64'); holes.forEach(([i, j]) => b.writeInt16LE(ND, (j * p.w + i) * 2)); p.layers.height.data = b.toString('base64'); p.layers.height.nodata = ND; return p; };
    const { pg, V, box } = await page({ api: T.defApi({ pack: ndPack }) });
    const K = pg.X.mapviz.heights.kit;
    V.use('profile'); V.cursor(-300, 0, true); V.cursor(-100, 0, true);
    const sum = HS.blk(box, 'mv.profile.sum');
    ok(sum.has('Ground from 0.00 m to 2.10 m, highest 3.50 m from the first point'), 'nodata: the peak and the low point leave the gap out (2.10 m at 3.50 m, not the 3 m top in the gap)', sum.textContent);
    ok(text(box, 'gap') === en('mapviz.profile.gap'), 'nodata: the summary says part of the line has no ground', text(box, 'gap'));
    const pr = K.profileOf(pg.X.mapviz.heights.of(V).pack, [-300, 0], [-100, 0], 800);
    ok(pr.miss === 11 && pr.pts.filter(p => p.z == null).map(p => p.x).join() === '-220,-215,-210,-205,-200,-195,-190,-185,-180,-175,-170', 'nodata: 11 samples have no ground, x -220 to -170', pr.pts.filter(p => p.z == null).map(p => p.x));
    ok(JSON.stringify(K.runs(pr)) === '[[0,15],[27,40]]', 'nodata: two stretches with ground, either side of the gap', K.runs(pr));
    ok(!/-16\d\d|-327/.test(sum.textContent + rows(box).join()), 'nodata: no -1638 m or -327 m anywhere');
    // the sight line is worked on the samples with ground only: standing, still blocked at x -245 before the gap
    ok(text(box, 'sight') === 'Sight line blocked at eye height 1.60 m: the ground rises 0.05 m above it, 2.75 m from the first point.', 'nodata: the sight line is unchanged before the gap', text(box, 'sight'));
    // the chart: the ground fill and the ground line are two pieces each; no piece is drawn across the gap
    const cv = chartCv(box), ops = pg.log.filter(e => e.cv === cv._id), s0 = ops.map(e => e.op).lastIndexOf('fillRect'), last = ops.slice(s0);
    const fillAt = last.findIndex(e => e.op === 'fill'), fb = last.slice(0, fillAt).map(e => e.op).lastIndexOf('beginPath'), fillPath = last.slice(fb, fillAt);
    const lb = fillAt + 1 + last.slice(fillAt + 1).findIndex(e => e.op === 'beginPath'), le = lb + last.slice(lb).findIndex(e => e.op === 'stroke'), linePath = last.slice(lb, le);
    const PL = 44, pw = 480 - 44 - 10, gx0 = PL + 80 / 200 * pw, gx1 = PL + 130 / 200 * pw;   // the gap, d 80 to 130 u
    const bridges = path => { let px = null, n = 0; path.forEach(e => { if (e.op === 'lineTo' && px !== null && px < gx0 && e.args[0] > gx1) n++; if (e.op === 'moveTo' || e.op === 'lineTo') px = e.args[0]; }); return n; };
    ok(fillPath.filter(e => e.op === 'moveTo').length === 2 && linePath.filter(e => e.op === 'moveTo').length === 2, 'nodata: the ground fill and the ground line break over the gap (two pieces each)', [fillPath.length, linePath.length]);
    ok(bridges(fillPath) === 0 && bridges(linePath) === 0 && fillPath.concat(linePath).every(e => !(e.op === 'lineTo' || e.op === 'moveTo') || e.args[0] <= gx0 + 1e-6 || e.args[0] >= gx1 - 1e-6), 'nodata: nothing of the ground is drawn inside the gap', [gx0, gx1]);
    // the mark and the table say no ground in words
    cv.fire('mousemove', { clientX: 44 + 0.5 * (480 - 44 - 10), clientY: 50 });
    ok(text(box, 'mark') === 'Marked: 5.00 m from the first point, no ground here', 'nodata: a mark in the gap says no ground here', text(box, 'mark'));
    btn(box, 'mapviz.profile.showTable').click();
    const r = rows(box);
    ok(r.some(x => x[0] === '5.00' && x[1] === en('mapviz.profile.noGroundCell')) && r.filter(x => x[1] === 'no ground').length >= 2, 'nodata: table rows in the gap say no ground', r.filter(x => x[1] === 'no ground'));
    // over the gap the sight line is clear: kneeling 1.16 m from x -260 (24 u) to x -140 (24 u) is 47.2 u; the ridge top in the
    // gap would block it, the ground left (42 u at x -225) does not
    V.use('profile'); V.cursor(-260, 0, true); V.cursor(-140, 0, true);
    const eye = box.all().find(e => e.tagName === 'SELECT'); eye.value = 'kneel'; eye.fire('change');
    ok(text(box, 'sight') === 'Sight line clear at eye height 1.16 m.' && text(box, 'gap') === en('mapviz.profile.gap'), 'nodata: the gap neither blocks nor clears; the rest of the line decides (clear)', text(box, 'sight'));
    // one end on no ground: there is no eye height there, so no sight line; the heights of the ground left are given
    V.use('profile'); V.cursor(-200, 0, true); V.cursor(-100, 0, true);
    ok(text(box, 'sight') === en('mapviz.profile.noSight') && /^Ground from /.test(text(box, 'range') || '') && text(box, 'gap') === en('mapviz.profile.gap'), 'nodata: an end with no ground: no sight line, the rest has heights', [text(box, 'sight'), text(box, 'range')]);
    // a line wholly over the gap: no heights, no sight line, said in words
    V.use('profile'); V.cursor(-215, 0, true); V.cursor(-175, 0, true);
    ok(text(box, 'gap') === en('mapviz.profile.noGround') && text(box, 'range') === null && text(box, 'sight') === en('mapviz.profile.noSight'), 'nodata: a line wholly past the ground: told, no range, no sight line', [text(box, 'gap'), text(box, 'sight')]);
    // planted: the same pack without the header nodata would put the gap at -1638 m (so the header is what is read)
    const p2 = await page({ api: T.defApi({ pack: p => { ndPack(p); p.layers.height.nodata = null; return p; } }) });
    p2.V.use('profile'); p2.V.cursor(-300, 0, true); p2.V.cursor(-100, 0, true);
    ok(/Ground from -1638\.40 m/.test(text(p2.box, 'range')) && text(p2.box, 'gap') === null, 'planted: without the header nodata the gap reads as -1638.40 m', text(p2.box, 'range'));
  }
  // 4 language and page file rules
  T.langCheck(ok, T.LANG.profile, PROFILE, ['noMap', 'outside', 'same', 'eye.stand', 'eye.kneel', 'eye.prone'], 'profile');
  T.colourCheck(ok, path.join(__dirname, 'profile.client.js'), 'profile');
  if (failN) { console.log('FAIL mapviz profile: ' + failN + ' of ' + (pass + failN)); process.exit(1); }
  console.log('PASS mapviz profile (' + pass + ')');
  process.exit(0);
})().catch(e => { console.log('FAIL mapviz profile: ' + (e && e.stack || e)); process.exit(1); });

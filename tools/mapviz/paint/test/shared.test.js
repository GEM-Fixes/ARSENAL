// paint shared test (MV-PNT1): the style table, frame, input helpers on the synthetic input (paint contract 8.1), gather on
// the fixture map in both forms (8.2 known answers), the shared draw checks with a stub style (planted wrong-size picture
// -> PAINT_DRAW_BAD, a throw -> PAINT_STYLE_BROKEN, no index.js -> MV_NOT_BUILT), the sidecar fields, the CLI exit codes
// (0, 1, 2, 3, 4, 5, 6), the stages read/draw/write, the CLI marks answers, the GoH water form (a non-ground drown class on
// every water cell), tick and l1 cancel, and a golden of the shared draw path (stub style + masks + marks, README 9.2).
// The stub style is put in through styles.row(id).load for one call and restored; no style folder is touched.
// usage: node tools/mapviz/paint/test/shared.test.js [scratch dir] [--update-golden]
// Author: Imperator_Aug (ARSENAL, ia-27e8edda)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto'), { spawnSync } = require('../../../lib/test/wait');   // wait.js spawnSync: limit at least 5 min, killed by it -> WAIT and one rerun with twice the limit

const ARG = process.argv[2] && !/^--/.test(process.argv[2]) ? process.argv[2] : null;
const W0 = path.resolve(ARG || fs.mkdtempSync(path.join(os.tmpdir(), 'mapviz-paint-shared-')));
fs.mkdirSync(W0, { recursive: true });
{
  const c = process.env.ARSENAL_CACHE;
  process.env.ARSENAL_CACHE = c && path.resolve(c).startsWith(W0 + path.sep) ? c : path.join(W0, 'cache');
}
const UPDATE = process.argv.includes('--update-golden');
let pass = 0, fail = 0;
function ok(c, what) { if (c) pass++; else { fail++; console.log('FAIL mapviz paint: ' + what); } }

const MVJS = path.resolve(__dirname, '../../mapviz.js');
const mv = require('../../mapviz');
const P = require('../index');
const I = P.input;
const fx = require('../../test/fxmake');
const { synth } = require('./synth');
const sha1 = b => crypto.createHash('sha1').update(Buffer.from(b.buffer, b.byteOffset, b.byteLength)).digest('hex');
const col = (m, fr, i, r0, r1) => { const o = []; for (let r = r0; r <= r1; r++) o.push(m[r * fr.W + i]); return o; };
const all = (a, v) => a.every(x => x === v);

function cli(args) {
  const r = spawnSync(process.execPath, [MVJS].concat(args), { encoding: 'utf8', env: Object.assign({}, process.env), timeout: 600000 });
  return { code: r.status, out: r.stdout || '', err: (r.stderr || '').trim() };
}
const json = s => { try { return JSON.parse(s); } catch (e) { return null; } };

// stub a style for one call (the row's load is swapped and restored)
async function withStub(id, mod, fn) {
  const row = P.styles.row(id), old = row.load;
  row.load = () => mod;
  try { return await fn(); } finally { row.load = old; }
}
async function rejects(p, code, det) {
  try { await p; return false; } catch (e) { return e instanceof mv.MvError && e.code === code && (!det || (e.detail && e.detail.code === det)); }
}

(async () => {
  // ---- style table
  {
    const L = P.styles.list();
    ok(L.map(s => s.id).join() === 'staff,painted,recon,sketch', 'styles.list order');
    ok(L.every(s => /^styles\./.test(s.palette)) && L.find(s => s.id === 'sketch').palette === 'styles.field_sketch', 'styles.list palette keys');
    ok(L.every(s => ['built', 'not built', 'broken'].includes(s.state)), 'styles.list states');
    ok(await rejects(Promise.resolve().then(() => P.styles.load('nope')), 'MV_USAGE', 'PAINT_STYLE_UNKNOWN'), 'load(nope) is PAINT_STYLE_UNKNOWN');
    ok(await withStub('staff', null, () => rejects(Promise.resolve().then(() => P.styles.load('staff')), 'MV_NOT_BUILT', 'PAINT_STYLE_NOT_BUILT')), 'no index.js is MV_NOT_BUILT');
    ok(await withStub('staff', { draw() {} }, () => rejects(Promise.resolve().then(() => P.styles.load('staff')), 'MV_FAULT', 'PAINT_STYLE_BROKEN')), 'no VERSION is PAINT_STYLE_BROKEN');
    const st = await withStub('staff', null, () => P.styles.list().find(s => s.id === 'staff'));
    ok(st.state === 'not built' && st.version === null, 'list shows not built');
  }

  // ---- frame
  {
    const s = synth();
    const f = s.frame;
    ok(f.W === 128 && f.H === 96 && f.sx === 5 && f.sy === 5 && f.x0 === -320 && f.y0 === -240 && f.long === 128 && f.stretch === 1, 'synth frame 128 x 96, 5 u');
    ok(P.frameFor(s.doc, {}).W === 2048, 'default size 2048');
    const t = P.thumbRules(f), u = P.thumbRules(P.frameFor(s.doc, { size: 513 }));
    ok(t.thumb === true && u.thumb === false && P.thumbRules(P.frameFor(s.doc, { size: 512 })).thumb === true, 'thumbnail at 512, not at 513');
    ok(await rejects(Promise.resolve().then(() => P.frameFor(s.doc, { size: 8 })), 'MV_USAGE'), 'size 8 refused');
  }

  // ---- input helpers on the synthetic input (8.1)
  {
    const s = synth(), fr = s.frame;
    const road = I.roadMask(s);
    ok(all(col(road, fr, 64, 60, 61), 1) && all(col(road, fr, 64, 62, 63), 2) && all(col(road, fr, 64, 70, 84), 3) && road[69 * 128 + 64] === 0 && road[85 * 128 + 64] === 0,
      'roadMask column 64: road 60..61, country road 62..63, decal 70..84');
    const wm = I.waterMask(s);
    ok(wm.from === 'water' && wm.mask[28 * 128 + 96] === 3 && wm.mask[0] === 0, 'waterMask pond centre (96, 28) = 3 drown');
    const s2 = synth({ drop: ['water.band'] }), wm2 = I.waterMask(s2);
    ok(wm2.from === 'gtype' && wm2.mask[28 * 128 + 96] === 3, 'waterMask falls back to gtype');
    const wood = I.woodMask(s);
    ok(wood[70 * 128 + 14] === 1 && wood[61 * 128 + 14] === 0 && wood[30 * 128 + 100] === 0, 'woodMask round the trees, radius ' + I.WOOD_R);
    ok(I.treePoints(s).length === 3 && I.buildings(s).length === 1 && I.walls(s).length === 1, 'trees 3, buildings 1, walls 1');
    const off = I.offGround(s);
    ok(off.reduce((a, b) => a + b, 0) === 16, 'offGround: the 16 no-value pixels of the cut corner');
    const g = P.canvas.create(fr, [255, 255, 255, 255]);
    const c = I.masks.apply(g, s, P.thumbRules(fr));
    ok(c.outsidePather === 1728 && c.noData === 16, 'masks.apply counts 1728 / 16, got ' + JSON.stringify(c));
    ok(I.baseOrder('goh').indexOf('minimap') < 0 && I.baseOrder('mowas2').indexOf('minimap') >= 0, 'baseOrder: GoH has no minimap rung');
    const h = I.toFrame(s.layers.height, fr, 'bilinear');
    ok(h.etype === 'f32' && h.w === 128 && h.h === 96 && Number.isNaN(h.data[95 * 128 + 127]), 'toFrame bilinear: f32 with NaN for no value');
    ok(I.toFrame(s.layers.gtype, fr, 'nearest').etype === 'u8', 'toFrame nearest keeps the etype');
  }

  // ---- shared draw with stub styles: planted bad pictures
  {
    const s = synth();
    const good = { VERSION: 7, NEEDS: ['height'], WANTS: ['water.band', 'objects', 'landform.r50', 'material'], draw: (inp) => ({ grid: P.canvas.create(inp.frame, '#808080'), stats: { k: 1 } }) };
    const r = await withStub('staff', good, () => P.draw(s));
    ok(r.grid.name === 'pic.staff' && r.grid.cell === 5 && r.grid.ox === -320 && r.grid.meta.styleVersion === 7 && r.gaps.length === 0, 'stub draw: name, frame fields, meta');
    const s2 = synth({ drop: ['water.band', 'objects', 'landform.r50', 'material'] });
    const r2 = await withStub('staff', good, () => P.draw(s2));
    ok(r2.gaps.join() === 'PAINT_NO_WATER_MASKS,PAINT_NO_OBJECTS,PAINT_NO_LANDFORM' && r2.notes.some(n => n.code === 'PAINT_NO_MATERIAL') && r2.approx === true,
      'absent wants: three gaps, one note, approx ' + JSON.stringify(r2.gaps));
    const wrong = { VERSION: 1, draw: (inp) => ({ grid: P.canvas.create(Object.assign({}, inp.frame, { W: inp.frame.W - 1 })) }) };
    ok(await withStub('staff', wrong, () => rejects(P.draw(s), 'MV_FAULT', 'PAINT_DRAW_BAD')), 'planted defect: a wrong-size picture is PAINT_DRAW_BAD');
    const notRgba = { VERSION: 1, draw: (inp) => ({ grid: s.layers.height }) };
    ok(await withStub('staff', notRgba, () => rejects(P.draw(s), 'MV_FAULT', 'PAINT_DRAW_BAD')), 'planted defect: a height grid as picture is PAINT_DRAW_BAD');
    const throws = { VERSION: 1, draw: () => { throw new TypeError('boom'); } };
    ok(await withStub('staff', throws, () => rejects(P.draw(s), 'MV_FAULT', 'PAINT_STYLE_BROKEN')), 'a style that throws is PAINT_STYLE_BROKEN');
    // sidecar
    const sc = P.record.sidecar(s, Object.assign({}, r, { counts: { outsidePather: 3, noData: 4 }, marks: null }), { styleVersion: 7, inputs: { height: 'given' }, made: 'T' });
    const want = ['v', 'layer', 'w', 'h', 'box', 'cell', 'rowOrder', 'target', 'stackHash', 'mapHashes', 'rung', 'env', 'gaps', 'approx', 'brightness', 'made', 'size',
      'style', 'styleVersion', 'paint', 'seed', 'thumb', 'mode', 'inputs', 'base', 'marks', 'counts', 'stats', 'notes'];
    ok(want.every(k => k in sc) && !('cellY' in sc), 'sidecar has the README 4.4 and paint fields, no cellY when square');
    ok(sc.layer === 'pic.staff' && sc.w === 128 && sc.rowOrder === 'minY-first' && sc.thumb === true && sc.paint === P.VERSION && sc.counts.noData === 4 && sc.made === 'T', 'sidecar values');
    const many = Array.from({ length: 80 }, (_, q) => ({ code: 'X' + q, text: '' }));
    ok(P.record.sidecar(s, { notes: many }, {}).notes.length === 50, 'sidecar keeps at most 50 notes');
  }

  // ---- integration asks: notes dedupe, gaps as a set, R-d codes, helper ticks, the drown note (as64, mowas2, goh alike)
  for (const target of ['as64', 'mowas2', 'goh']) {
    // a shared note whose code the style already gave is dropped (the style's wording wins); gaps merge as a set
    const s = synth({ target, drop: ['material', 'objects'] });
    const own = { VERSION: 1, NEEDS: ['height'], WANTS: ['material', 'objects'], draw: (inp) => ({ grid: P.canvas.create(inp.frame, '#808080'),
      gaps: ['PAINT_NO_OBJECTS', 'PAINT_NO_OBJECTS'], notes: [{ code: 'PAINT_NO_MATERIAL', text: 'style words' }] }) };
    const r = await withStub('staff', own, () => P.draw(s));
    const nm = r.notes.filter(n => n.code === 'PAINT_NO_MATERIAL');
    ok(nm.length === 1 && nm[0].text === 'style words', target + ': one PAINT_NO_MATERIAL note, the style wording: ' + JSON.stringify(nm));
    ok(r.gaps.join() === 'PAINT_NO_OBJECTS', target + ': style gaps and shared gaps merge as a set: ' + r.gaps.join());
    // the drown note of the shared draw: names a left-out class once, for any style that wants water.drown
    const g = synth({ target });
    const b = g.layers['water.band'], d = g.layers['water.drown'];
    for (let k = 0; k < d.data.length; k++) if (b.data[k] >= 1) d.data[k] = (d.data[k] | 2) >>> 0;
    d.meta = Object.assign({}, d.meta, { bits: ['tank_medium', 'airborne'], depthM: [1.6, -0.75] });
    const wstub = { VERSION: 1, NEEDS: ['height'], WANTS: ['water.band', 'water.drown'], draw: (inp) => ({ grid: P.canvas.create(inp.frame, '#808080') }) };
    const rw = await withStub('staff', wstub, () => P.draw(g));
    ok(rw.notes.filter(n => n.code === 'PAINT_DROWN_VEHICLE_ONLY' && /airborne/.test(n.text)).length === 1, target + ': shared draw note PAINT_DROWN_VEHICLE_ONLY names airborne');
    const rp = await withStub('staff', wstub, () => P.draw(synth({ target })));
    ok(!rp.notes.some(n => n.code === 'PAINT_DROWN_VEHICLE_ONLY'), target + ': no drown note when every class is a ground class');
    ok(I.nonGroundIds(d).join() === 'airborne' && I.nonGroundIds({ meta: {} }).length === 0, target + ': nonGroundIds');
    // helper ticks: o.tick is called inside, the bytes do not change, a throw ends the helper and nothing is remembered
    const t0 = synth({ target, size: 256 }), t1 = synth({ target, size: 256 });
    let n = 0;
    const o = { tick: () => { n++; } };
    const same = (a, c) => sha1(a) === sha1(c);
    const fr = t0.frame;
    ok(same(I.roadMask(t0), I.roadMask(t1, o)) && same(I.woodMask(t0), I.woodMask(t1, o)) && same(I.waterMask(t0).mask, I.waterMask(t1, o).mask) &&
      same(I.offGround(t0), I.offGround(t1, o)) && same(I.landCover(t0, t0.palette.styles.painted), I.landCover(t1, t1.palette.styles.painted, o)) &&
      same(I.toFrame(t0.layers.height, fr, 'bilinear').data, I.toFrame(t1.layers.height, fr, 'bilinear', o).data), target + ': helpers with o.tick give the same bytes');
    ok(n >= 6 * Math.floor(fr.H / I.TICK_ROWS), target + ': helpers tick every ' + I.TICK_ROWS + ' rows (' + n + ' ticks, H ' + fr.H + ')');
    const t2 = synth({ target, size: 256 });
    let thrown = false;
    try { I.roadMask(t2, { tick: () => { throw new mv.MvError('MV_CANCELLED', 'cancelled'); } }); } catch (e) { thrown = e.code === 'MV_CANCELLED'; }
    ok(thrown && same(I.roadMask(t2), I.roadMask(t1)), target + ': a throwing tick ends roadMask; nothing half-made is remembered');
    let pt = 0;
    const pg = P.canvas.create(fr, '#808080'), pg2 = P.canvas.create(fr, '#808080');
    P.paper.grain(pg, fr, 0.05, { seed: 1 }); P.paper.grain(pg2, fr, 0.05, { seed: 1, tick: () => { pt++; } });
    ok(same(pg.data, pg2.data) && pt >= Math.floor((fr.H - 1) / 16), target + ': paper.grain o.tick, same bytes (' + pt + ' ticks)');
  }
  {
    // R-d: bad input from code is MV_FAULT PAINT_DRAW_BAD (box, toFrame); a want gather cannot make has a note
    const s = synth();
    ok(await rejects(Promise.resolve().then(() => P.frameFor(s.doc, { size: 64, box: [0, 0, -1, 5] })), 'MV_FAULT', 'PAINT_DRAW_BAD'), 'R-d: a bad box is MV_FAULT PAINT_DRAW_BAD');
    ok(await rejects(Promise.resolve().then(() => I.toFrame(null, s.frame, 'nearest')), 'MV_FAULT', 'PAINT_DRAW_BAD'), 'R-d: toFrame with no grid is MV_FAULT PAINT_DRAW_BAD');
    ok(await rejects(Promise.resolve().then(() => I.toFrame(s.layers.height, s.frame, 'area')), 'MV_FAULT', 'PAINT_DRAW_BAD'), "R-d: toFrame 'area' on a height is MV_FAULT PAINT_DRAW_BAD");
    ok(await rejects(Promise.resolve().then(() => P.canvas.color('brown')), 'MV_FAULT', 'PAINT_DRAW_BAD'), 'R-d: a bad palette colour is MV_FAULT PAINT_DRAW_BAD');
  }

  // ---- GoH water form: a non-ground drown class ('airborne', -0.75 m) set on every water cell must not make all water drown
  {
    const goh = (withDepth) => {
      const s = synth({ target: 'goh' });
      const b = s.layers['water.band'], d = s.layers['water.drown'];
      for (let k = 0; k < d.data.length; k++) if (b.data[k] >= 1) d.data[k] = (d.data[k] | 2) >>> 0;
      d.meta.bits = ['tank_medium', 'airborne'];
      if (withDepth) d.meta.depthM = [1.6, -0.75]; else delete d.meta.depthM;
      return s;
    };
    for (const wd of [true, false]) {
      const s = goh(wd), wm = I.waterMask(s).mask, fr = s.frame, c = [0, 0, 0, 0];
      for (let k = 0; k < wm.length; k++) c[wm[k]]++;
      const ref = I.waterMask(synth()).mask, rc = [0, 0, 0, 0];
      for (let k = 0; k < ref.length; k++) rc[ref[k]]++;
      ok(wm[28 * fr.W + 96] === 3 && c[1] > 0 && c[2] > 0 && c.join() === rc.join(),
        'GoH form' + (wd ? '' : ' (no depthM, by name)') + ': airborne on every water cell leaves codes 1/2, counts ' + c.join() + ' vs ' + rc.join());
    }
    ok(I.groundBits(goh(true).layers['water.drown']) === 1 && I.groundBits({ meta: {} }) === null, 'groundBits: only the vehicle bit counts');
    const lab = (drown) => ({ doc: { modes: [] }, mode: null, vectors: { 'water.labels': [{ band: 1, x: 0, y: 0, depthMax: 0.65, drown }] } });
    ok(P.marks.items(lab(['airborne']), ['water'])[0].drown === false, 'marks water label with airborne only: not drown');
    ok(P.marks.items(lab(['tank_medium', 'airborne']), ['water'])[0].drown === true, 'marks water label with a tank class: drown');
    const wl = Object.assign(lab(['gun_goh_b']), { layers: { 'water.drown': { meta: { bits: ['gun_goh_b'], depthM: [-1] } } } });
    ok(P.marks.items(wl, ['water'])[0].drown === false, 'marks: a class at depth <= 0 by the drown grid meta does not count');
  }

  // ---- tick: progress and cancel flag together; the l1 recon base gets progress and sees the cancel
  {
    const flag = path.join(W0, 'cancel.flag');
    fs.writeFileSync(flag, '');
    let sets = 0;
    const t = P.tickOf({ progress: { set() { sets++; } }, cancelFlag: flag });
    let seen = false;
    try { t(1, 2); } catch (e) { seen = e instanceof mv.MvError && e.code === 'MV_CANCELLED'; }
    ok(seen && sets === 1, 'tickOf with progress and cancelFlag: sets the progress and sees the cancel');
    fs.rmSync(flag);
    // settleBase: a stub l1 that steps its progress; the tick throws on the second call
    let got = null, calls = 0;
    const Rn = { l1: async (src, doc, o) => { got = o; o.progress.stage('draw', 4); for (let q = 0; q < 4; q++) o.progress.step(1); return { grid: null, sidecar: null }; } };
    const s = synth({ style: 'recon', drop: ['base'] });
    s.base = { pending: true, _ctx: { Rn, src: () => null, doc: s.doc, mkGrids: () => ({}), need: () => null, W: -20, mode: 'combat', target: 'mowas2' } };
    const tick = (d, tot) => { calls++; if (calls >= 2) throw new mv.MvError('MV_CANCELLED', 'cancelled'); };
    ok(await rejects(P.settleBase(s, { tick, cancelFlag: flag }), 'MV_CANCELLED') && got && got.progress && got.cancelFlag === flag,
      'settleBase: l1 gets progress and cancelFlag; a cancel inside l1 is MV_CANCELLED, not an l0 fallback');
  }

  // ---- marks words
  {
    ok(await rejects(Promise.resolve().then(() => P.checkMarks({ marks: 'lots' })), 'MV_USAGE', 'PAINT_MARKS_SET'), 'planted defect: --marks lots refused');
    ok(await rejects(Promise.resolve().then(() => P.checkMarks({ marks: 'flags', with: 'flags,castles' })), 'MV_USAGE', 'PAINT_MARKS_SET'), '--with castles refused');
    const k = P.checkMarks({ marks: 'flags', with: 'water,flags' });
    ok(k.kinds.join() === 'zones,flags,spawns,water', 'checkMarks merges --with once');
  }

  // ---- fixture, both forms: gather answers (8.2), CLI exits and pictures
  const FX = { as2: fx.make(path.join(W0, 'fx-as2'), { form: 'as2' }), goh: fx.make(path.join(W0, 'fx-goh'), { form: 'goh' }) };
  const common = f => ['--target', f.target, '--game', f.gameDir, '--mod-dir', f.modDirs[0], '--map', f.map];
  for (const form of ['as2', 'goh']) {
    const f = FX[form];
    const inp = await P.gather({ style: 'staff', target: f.target, game: f.gameDir, mods: f.mods, modDirs: f.modDirs, map: f.map, mode: form === 'goh' ? 'battle_zones' : 'combat', size: 256, seed: 1 });
    const fr = inp.frame;
    ok(fr.W === 256 && fr.H === 188 && fr.sx === 4.6875 && Math.abs(fr.sy - 880 / 188) < 1e-9, form + ' fixture frame 256 x 188');
    const wm = I.waterMask(inp);
    ok(wm.mask[51 * 256 + 192] === 3, form + ' waterMask (192, 51) = 3 drown, got ' + wm.mask[51 * 256 + 192]);
    const road = I.roadMask(inp);
    ok(all(col(road, fr, 20, 135, 140), 1) && road[134 * 256 + 20] === 0 && road[141 * 256 + 20] === 0, form + ' roadMask column 20: rows 135..140 = 1 ' + col(road, fr, 20, 133, 142).join(''));
    ok(all(col(road, fr, 128, 123, 134), 3) && all(col(road, fr, 128, 141, 149), 3) && all(col(road, fr, 128, 135, 140), 1), form + ' roadMask column 128: decal 3 round the road ' + col(road, fr, 128, 121, 151).join(''));
    ok(I.woodMask(inp)[158 * 256 + 42] === 1, form + ' woodMask (42, 158) = 1');
    ok(I.buildings(inp).length === 1 && I.walls(inp).length === 1, form + ' buildings 1, walls 1');
    const g = P.canvas.create(fr, '#FFFFFF');
    const c = I.masks.apply(g, inp, P.thumbRules(fr));
    ok(c.outsidePather === 3488 && c.noData === 0, form + ' masks counts 3488 / 0, got ' + JSON.stringify(c));
  }

  // CLI on the AS2 form
  const as2 = FX.as2, goh = FX.goh;
  const o1 = path.join(W0, 'cli-staff');
  let r = cli(['paint', 'draw', '--style', 'staff'].concat(common(as2), ['--mode', 'combat', '--size', '256', '--marks', 'flags', '--out', o1, '--json']));
  const j = json(r.out);
  ok(r.code === 0 && j && j.w === 256 && j.h === 188, 'cli draw staff exit 0, 256 x 188: ' + r.code + ' ' + r.err.slice(0, 200));
  const sc = json(fs.existsSync(path.join(o1, 'pic.staff.json')) ? fs.readFileSync(path.join(o1, 'pic.staff.json'), 'utf8') : '');
  ok(sc && sc.style === 'staff' && Math.abs(sc.cellY - 880 / 188) < 1e-9 && sc.counts.outsidePather === 3488 && sc.marks && sc.marks.drawn.spawns === 2 && !sc.marks.drawn.flags,   // combat on the fixture: spawns, no flags
    'cli sidecar: cellY, counts, marks ' + (sc && JSON.stringify(sc.marks)));
  ok(fs.existsSync(path.join(o1, 'pic.staff.mvg')) && fs.existsSync(path.join(o1, 'reads.json')), 'cli writes pic.staff.mvg and reads.json');
  // golden: the same bytes twice, and the frozen hash (README 9.2)
  {
    const g1 = require('../../lib/raster/gridfile').read(path.join(o1, 'pic.staff.mvg'));
    const o2 = path.join(W0, 'cli-staff2');
    cli(['paint', 'draw', '--style', 'staff'].concat(common(as2), ['--mode', 'combat', '--size', '256', '--marks', 'flags', '--out', o2, '-q']));
    const g2 = require('../../lib/raster/gridfile').read(path.join(o2, 'pic.staff.mvg'));
    ok(sha1(g1.data) === sha1(g2.data), 'staff fixture picture: same bytes twice');
    // the golden covers the shared code only: a stub style with a fixed draw, then masks.apply and the full marks set
    // (the staff style stays free to move; its own test holds its golden)
    const stub = { VERSION: 1, NEEDS: ['height'], WANTS: [], draw: (inp) => {
      const g = P.canvas.create(inp.frame, '#B0A890');
      for (let q = 0; q < g.data.length; q += 4) { const k = q >> 2; g.data[q] = (k * 7) & 255; }
      return { grid: g };
    } };
    const pic = await withStub('staff', stub, () => P.picture({ style: 'staff', target: as2.target, game: as2.gameDir, mods: as2.mods, modDirs: as2.modDirs,
      map: as2.map, mode: 'battle_zones', size: 256, seed: 1, marks: 'full', made: 'T' }));
    const h = sha1(pic.grid.data);
    const gf = path.join(__dirname, 'shared.golden.json');
    if (UPDATE || !fs.existsSync(gf)) { fs.writeFileSync(gf, JSON.stringify({ sharedStubFixture256: h }, null, 1) + '\n'); console.log('golden written: ' + h); }
    const want = JSON.parse(fs.readFileSync(gf, 'utf8')).sharedStubFixture256;
    ok(h === want, 'shared draw path golden (stub style + masks + full marks, AS2 fixture 256): ' + h + ' vs ' + want);
    ok(pic.sidecar.marks && pic.sidecar.marks.drawn.flags === 3, 'golden picture has the 3 flags drawn');
  }
  // picture() hands cancelFlag to the style's draw opts; a want gather cannot make is absent with a PAINT_INPUT_ABSENT note
  for (const form of ['as2', 'goh']) {
    const f = FX[form];
    let seenOpts = null;
    const rec = { VERSION: 1, NEEDS: ['height'], WANTS: ['nope.layer'], draw: (inp, op) => { seenOpts = op; return { grid: P.canvas.create(inp.frame, '#808080') }; } };
    const flag = path.join(W0, 'never-' + form + '.flag');
    const pic = await withStub('staff', rec, () => P.picture({ style: 'staff', target: f.target, game: f.gameDir, mods: f.mods, modDirs: f.modDirs,
      map: f.map, mode: 'battle_zones', size: 64, seed: 1, cancelFlag: flag, made: 'T' }));
    ok(seenOpts && seenOpts.cancelFlag === flag, form + ': picture() passes cancelFlag to the style draw opts');
    ok(pic.sidecar.inputs['nope.layer'] === 'absent' && pic.sidecar.notes.some(n => n.code === 'PAINT_INPUT_ABSENT' && /^nope\.layer /.test(n.text)),
      form + ': an absent want has a PAINT_INPUT_ABSENT note ' + JSON.stringify(pic.sidecar.notes.map(n => n.code)));
  }
  // stages read, draw, write (ruling 0) in the progress file
  {
    const pf = path.join(W0, 'prog.jsonl');
    cli(['paint', 'draw', '--style', 'staff'].concat(common(as2), ['--mode', 'combat', '--size', '64', '--out', path.join(W0, 'cli-prog'), '--progress', pf, '-q']));
    const st = fs.existsSync(pf) ? [...new Set(fs.readFileSync(pf, 'utf8').split('\n').filter(Boolean).map(l => json(l)).filter(x => x && x.stage).map(x => x.stage))] : [];
    ok(st.join() === 'read,draw,write', 'cli draw stages read, draw, write: ' + st.join());
  }
  // exit 5: cancel flag seen; exit 4: style not built (a resolve hook hides ./staff/index from styles.js)
  {
    const flag = path.join(W0, 'cancel-cli.flag');
    fs.writeFileSync(flag, '');
    r = cli(['paint', 'draw', '--style', 'staff'].concat(common(as2), ['--mode', 'combat', '--size', '64', '--out', path.join(W0, 'cli-cancel'), '--cancel-flag', flag, '--json']));
    ok(r.code === 5, 'cli draw with a cancel flag exit 5, got ' + r.code);
    fs.rmSync(flag);
    const hook = path.join(W0, 'hide-staff.js');
    fs.writeFileSync(hook, [
      "'use strict';",
      "const Module = require('module'), path = require('path');",
      "const orig = Module._resolveFilename;",
      "Module._resolveFilename = function (req, parent, ...rest) {",
      "  if (req === './staff/index' && parent && /paint[\\\\/]styles\\.js$/.test(parent.filename)) {",
      "    const e = new Error(\"Cannot find module './staff/index'\");",
      "    e.code = 'MODULE_NOT_FOUND'; e.requireStack = [parent.filename]; throw e;",
      "  }",
      "  return orig.call(this, req, parent, ...rest);",
      "};", ''].join('\n'));
    const r4 = spawnSync(process.execPath, ['-r', hook, MVJS, 'paint', 'draw', '--style', 'staff'].concat(common(as2), ['--size', '64', '--out', path.join(W0, 'cli-nb'), '--json']), { encoding: 'utf8' });
    const j4 = json(r4.stdout || '');
    ok(r4.status === 4 && j4 && j4.error && j4.error.detail && j4.error.detail.code === 'PAINT_STYLE_NOT_BUILT', 'cli draw on a style with no index.js exit 4 PAINT_STYLE_NOT_BUILT: ' + r4.status + ' ' + (r4.stdout || '').slice(0, 200));
    const r4s = spawnSync(process.execPath, ['-r', hook, MVJS, 'paint', 'styles', '--json'], { encoding: 'utf8' });
    const j4s = json(r4s.stdout || '');
    ok(r4s.status === 0 && j4s && j4s.styles.find(s => s.id === 'staff').state === 'not built', 'cli styles lists a style with no index.js as not built');
  }
  // --base minimap with no shipped minimap: exit 3, the message names the map's minimap, not --in
  {
    r = cli(['paint', 'draw', '--style', 'recon', '--base', 'minimap'].concat(common(as2), ['--size', '64', '--out', path.join(W0, 'cli-mm'), '--json']));
    const jm = json(r.out);
    ok(r.code === 3 && jm && jm.error && /ships no readable minimap/.test(jm.error.msg) && !/--in/.test(jm.error.msg) && jm.error.detail.code === 'PAINT_NO_BASE',
      'cli recon --base minimap with none shipped: exit 3, minimap message: ' + r.code + ' ' + (jm && jm.error && jm.error.msg));
  }
  ok(cli(['paint', 'marks', '--marks', 'none'].concat(common(as2), ['--size', '64', '--out', path.join(W0, 'x8')])).code === 2, 'cli marks --marks none exit 2');
  r = cli(['paint', 'draw', '--style', 'recon'].concat(common(as2), ['--mode', 'combat', '--size', '128', '--out', path.join(W0, 'cli-recon'), '--json']));
  const jr = json(r.out);
  ok(r.code === 1 && jr && jr.base && jr.base.from === 'l0' && jr.gaps.includes('PAINT_BASE_SCHEMATIC'), 'cli recon with no --in: l0 base, PAINT_BASE_SCHEMATIC, exit 1: ' + r.code + ' ' + r.err.slice(0, 200));
  ok(cli(['paint', 'draw', '--style', 'nope'].concat(common(as2), ['--out', path.join(W0, 'x1')])).code === 2, 'cli --style nope exit 2');
  ok(cli(['paint', 'draw', '--style', 'staff', '--marks', 'lots'].concat(common(as2), ['--out', path.join(W0, 'x2')])).code === 2, 'cli --marks lots exit 2');
  ok(cli(['paint', 'draw', '--style', 'staff', '--base', 'l1'].concat(common(as2), ['--out', path.join(W0, 'x3')])).code === 2, 'cli --base on staff exit 2');
  ok(cli(['paint', 'draw', '--style', 'staff', '--pool', '2'].concat(common(as2), ['--out', path.join(W0, 'x4')])).code === 2, 'cli --pool on staff exit 2');
  ok(cli(['paint', 'draw', '--style', 'recon', '--base', 'minimap'].concat(common(goh), ['--out', path.join(W0, 'x5')])).code === 2, 'cli recon --base minimap on goh exit 2');
  ok(cli(['paint', 'draw', '--style', 'staff', '--target', as2.target, '--game', as2.gameDir, '--mod-dir', as2.modDirs[0], '--map', 'multi/no_such_map', '--size', '64', '--out', path.join(W0, 'x6')]).code === 3, 'cli unknown map exit 3');
  ok(cli(['paint', 'draw', '--style', 'staff'].concat(common(as2), ['--mode', 'no_such_mode', '--size', '64', '--out', path.join(W0, 'x7')])).code === 3, 'cli unknown mode exit 3');
  ok(cli(['paint', 'draw', '--style', 'staff'].concat(common(as2), ['--size', '64', '--out', path.join(as2.gameDir, 'paint-out')])).code === 6, 'cli --out inside the game exit 6');
  ok(!fs.existsSync(path.join(as2.gameDir, 'paint-out', 'pic.staff.mvg')), 'nothing written inside the game');
  // styles command
  r = cli(['paint', 'styles', '--json']);
  ok(r.code === 0 && json(r.out) && json(r.out).styles.length === 4, 'cli styles --json');
  // marks command, both forms
  for (const form of ['as2', 'goh']) {
    const f = FX[form], od = path.join(W0, 'cli-marks-' + form);
    r = cli(['paint', 'marks'].concat(common(f), ['--mode', 'battle_zones', '--size', '256', '--out', od, '--json']));
    const jm = json(r.out);
    ok(r.code === 0 && jm && jm.drawn.zones === 3 && jm.drawn.flags === 3 && jm.drawn.spawns === 2, form + ' cli marks battle_zones: zones 3, flags 3, spawns 2 ' + r.err.slice(0, 200));
    const mj = json(fs.existsSync(path.join(od, 'marks.json')) ? fs.readFileSync(path.join(od, 'marks.json'), 'utf8') : '');
    const zones = mj ? mj.items.filter(i => i.kind === 'zone') : [];
    const f2 = zones.find(z => z.flag === 'f2');
    ok(f2 && f2.zone.kind === (form === 'goh' ? 'poly' : 'circle'), form + ' f2 zone is ' + (form === 'goh' ? 'poly' : 'circle'));
    ok(fs.existsSync(path.join(od, 'pic.marks.mvg')) && fs.existsSync(path.join(od, 'pic.marks.json')), form + ' marks picture written');
  }

  if (!ARG) fs.rmSync(W0, { recursive: true, force: true });
  if (fail) { console.log('FAIL mapviz paint shared: ' + fail + ' failed, ' + pass + ' passed'); process.exit(1); }
  console.log('PASS mapviz paint shared (' + pass + ')');
})().catch(e => { if (!ARG) { try { fs.rmSync(W0, { recursive: true, force: true }); } catch (x) { /* temp */ } } console.log('FAIL mapviz paint shared: ' + (e && e.stack || e)); process.exit(1); });

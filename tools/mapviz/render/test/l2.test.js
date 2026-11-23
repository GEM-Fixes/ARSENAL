// render l2 test (MV-R2, R2a): decals and water planes on the fixture map, both forms, size 600, flat base (128, 128, 128,
// 255): the known answers of render.md 6 (road pixel, quad edge, base pixels, pond with and without planes, the GoH ocean,
// l2.z and kinds), the README 9.2 rules (untouched pixels keep the base bytes; same bytes twice; golden sha1), the uv
// ruling with an asymmetric texture, the ground from a map.ply this test writes, the optics formula, map.omask reading,
// seeded defects (a base of another frame, a decal with no size, a missing decal texture, a water mesh that cannot load,
// --units and --light on l2) and the CLI exits.
// usage: node tools/mapviz/render/test/l2.test.js [scratch dir] [--update-golden]     (README 9.4)
// Author: Imperator_Aug (ARSENAL, ia-d2e9a069)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto'), { spawnSync } = require('child_process');

const W = path.resolve(process.argv[2] && !/^--/.test(process.argv[2]) ? process.argv[2] : fs.mkdtempSync(path.join(os.tmpdir(), 'mapviz-l2-')));
fs.mkdirSync(W, { recursive: true });
{
  const c = process.env.ARSENAL_CACHE;
  process.env.ARSENAL_CACHE = c && path.resolve(c).startsWith(W + path.sep) ? c : path.join(W, 'cache');
}
const UPDATE = process.argv.includes('--update-golden');

let pass = 0, fail = 0;
function ok(c, what) { if (c) pass++; else { fail++; console.log('FAIL mapviz render l2: ' + what); } }
const sha1 = b => crypto.createHash('sha1').update(Buffer.from(b.buffer, b.byteOffset, b.byteLength)).digest('hex');

const MVDIR = path.resolve(__dirname, '../..');
const MVJS = path.join(MVDIR, 'mapviz.js');
const R = require('../index');
const L2 = require('../l2');
const DC = require('../decal');
const WP = require('../waterplane');
const S = require('./synth');
const mv = require(MVJS);
const mk = require(path.join(MVDIR, 'lib/mapkit'));
const gridfile = require(path.join(MVDIR, 'lib/raster/gridfile'));
const fx = require(path.join(MVDIR, 'test/fxmake'));

function cli(args) {
  const r = spawnSync(process.execPath, [MVJS].concat(args), { encoding: 'utf8', env: Object.assign({}, process.env), timeout: 300000 });
  return { code: r.status, out: r.stdout || '', err: r.stderr || '' };
}
const json = s => { try { return JSON.parse(s); } catch (e) { return null; } };
async function rejects(p) { try { await p; return null; } catch (e) { return e; } }

const SIZE = 600;
const FX = {};
function fixture(form) {
  if (!FX[form]) {
    const f = fx.make(path.join(W, 'fx-' + form), { form });
    const src = mk.source({ target: f.target, game: f.gameDir, mods: [], modDirs: f.modDirs });
    FX[form] = { f, src, doc: mk.doc(src, f.map, {}) };
  }
  return FX[form];
}
function flatBase(doc, col, size) {
  const pl = R.plan(doc, { size: size || SIZE });
  const w = pl.size[0], h = pl.size[1], data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set(col || [128, 128, 128, 255], i * 4);
  return { pl, base: { grid: { name: 'pic.l1', w, h, cell: pl.cell, ox: pl.box[0], oy: pl.box[1], etype: 'rgba8', sample: 'cell', scale: 1, offset: 0, nodata: null, meta: {}, data }, sidecar: { gaps: [], mapHashes: {} } } };
}
// the pixel holding (x, y); atEnd: the pixel whose upper corner is (x, y) (the pixel just below and left of the point)
function pix(g, x, y, atEnd) {
  const cy = (g.meta && g.meta.cellY) || g.cell;
  const i = atEnd ? Math.ceil((x - g.ox) / g.cell) - 1 : Math.floor((x - g.ox) / g.cell);
  const j = atEnd ? Math.ceil((y - g.oy) / cy) - 1 : Math.floor((y - g.oy) / cy);
  const k = j * g.w + i;
  return g.etype === 'f32' ? g.data[k] : Array.from(g.data.subarray(k * 4, k * 4 + 4));
}
const near = (a, b, t) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= t);
const lum = c => c[0] + c[1] + c[2];
const BASE = [128, 128, 128, 255];
const SQUARE = [{ pts: [[180, -320], [420, -320], [420, -80], [180, -80]], z: -20, kind: 'entity', water: {} }];

// ------------------------------------------------------------------ fixture known answers (render.md 6)
async function testFixture(golden, got) {
  for (const form of ['as2', 'goh']) {
    const { src, doc } = fixture(form);
    const { base } = flatBase(doc);
    const r = await L2.l2(src, doc, { size: SIZE, base, made: 'x' });
    const g = r.grid, n = r.aux.n, z = r.aux.z, sc = r.sidecar;
    const tag = form + ': ';
    ok(g.name === 'pic.l2' && g.w === 600 && g.h === 440 && g.cell === 2 && n.name === 'l2.n' && z.name === 'l2.z' && z.etype === 'f32' && z.nodata === -32768,
      tag + 'grids 600 x 440, cell 2, names and types');
    ok(near(pix(g, 0, 200), [82, 66, 47, 255], 2), tag + 'fx_road centre (0, 200) = (82, 66, 47, 255) +-2, got ' + pix(g, 0, 200));
    const e = pix(g, -63, 200), c = pix(g, 0, 200);
    ok(e.join() !== BASE.join() && Math.abs(lum(e) - lum(BASE)) < Math.abs(lum(c) - lum(BASE)), tag + 'quad edge (-63, 200) mixed with the base, less than the centre: ' + e);
    ok(pix(g, -66, 200).join() === BASE.join() && pix(g, 0, 266).join() === BASE.join() && pix(g, 0, 134).join() === BASE.join(), tag + 'outside the quad x -64..64, y 136..264: base');
    ok(pix(g, 0, 0).join() === BASE.join() && pix(g, 0, 300).join() === BASE.join(), tag + '(0, 0) and (0, 300) = base bytes');
    ok(pix(n, 0, 200)[3] === 2 && pix(n, 0, 0)[3] === 1 && pix(n, 0, 0).slice(0, 3).join() === '128,128,255', tag + 'kinds: road 2, flat ground 1 with n (0, 0, 1) -> 128 128 255');
    ok(Math.abs(pix(z, -200, 0, true) - 60) <= 0.5 && Math.abs(pix(z, -250, 0, true) - 30) <= 0.5 && Math.abs(pix(z, 0, 0, true)) <= 0.5 && pix(n, -250, 0, true)[3] === 1,
      tag + 'l2.z at (-200, 0) / (-250, 0) / (0, 0) = 60 / 30 / 0, kind 1: ' + [pix(z, -200, 0, true), pix(z, -250, 0, true), pix(z, 0, 0, true)].map(v => v.toFixed(2)));
    const sl = pix(n, -250, 0, true);
    ok(sl[0] < 100 && sl[1] === 128 && sl[2] < 255, tag + 'normal on the west slope of the ridge tilts to -x: ' + sl);
    ok(sc.layer === 'pic.l2' && sc.rung === 'l2' && sc.base.from === 'given' && sc.base.layer === 'pic.l1' && sc.ground === 'net' && sc.aux.join() === 'l2.n,l2.z' &&
      sc.gain === 1.08 && sc.env === 'clean_daylight' && sc.detail === null && sc.decals.placed === 1 && sc.decals.drawn === 1 && sc.made === 'x' &&
      sc.mapHashes['resource/entity/landscape/stamp/road/fx_road.mtl'], tag + 'sidecar fields');
    if (form === 'as2') {
      ok(pix(g, 300, -200).join() === BASE.join() && sc.water.planes === 0 && sc.water.ocean === null && sc.gaps.length === 0 && sc.approx === false && sc.brightness === 'fitted',
        tag + 'pond without planes = base, water.planes 0, no gaps');
    } else {
      const p = pix(g, 300, -200);
      ok(p[0] < 128 && p[1] < 128 && p[3] === 255 && sc.water.planes === 1 && sc.water.ocean && sc.water.ocean.zlevel === -20 && sc.water.ocean.kind === 'lake' &&
        sc.water.ocean.omask === false && sc.gaps.includes('RENDER_WATER_APPROX') && sc.approx === true && sc.brightness === 'unverified',
        tag + 'GoH ocean: pond darker, RENDER_WATER_APPROX, ocean zlevel -20: ' + p + ' ' + JSON.stringify(sc.water));
      ok(near(p, [7, 11, 35, 255], 1), tag + 'GoH ocean colour with no ww_ keys = 0.25 x the vanilla base colour 0x1c2b8e [I]: ' + p);
      ok(pix(n, 300, -200)[3] === 3 && pix(z, 300, -200) === -20, tag + 'ocean pixel kind 3, z -20');
    }
    // README 9.2: a pixel no sample changed keeps the base bytes; changed pixels are decal or water pixels, or a shore
    // pixel whose highest sample is dry ground (kind 1) next to a water pixel
    let diff = 0, wrong = 0, shore = 0;
    const kindAt = (i, j) => (i < 0 || j < 0 || i >= g.w || j >= g.h) ? 0 : n.data[(j * g.w + i) * 4 + 3];
    for (let i = 0; i < g.w * g.h; i++) {
      let d = false;
      for (let c2 = 0; c2 < 4; c2++) if (g.data[i * 4 + c2] !== base.grid.data[i * 4 + c2]) d = true;
      if (!d || n.data[i * 4 + 3] !== 1) { if (d) diff++; continue; }
      diff++;
      const x = i % g.w, y = (i - x) / g.w;
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => kindAt(x + a, y + b) === 3)) shore++; else wrong++;
    }
    ok(diff > 0 && diff === r.stats.changed && wrong === 0, tag + 'only decal, water and shore pixels differ from the base (' + diff + ' differ, ' + r.stats.changed + ' changed, ' + shore + ' shore, ' + wrong + ' other ground)');
    const r2 = await L2.l2(src, doc, { size: SIZE, base, made: 'x' });
    ok(sha1(r2.grid.data) === sha1(g.data) && sha1(r2.aux.n.data) === sha1(n.data) && sha1(r2.aux.z.data) === sha1(z.data), tag + 'same bytes twice');
    got[form] = { pic: sha1(g.data), n: sha1(n.data), z: sha1(z.data) };
    if (golden && golden[form]) ok(JSON.stringify(golden[form]) === JSON.stringify(got[form]), tag + 'golden sha1 (l2.golden.json; --update-golden after a deliberate change)');
    // given planes replace the map's own
    const rp = await L2.l2(src, doc, { size: SIZE, base, planes: SQUARE, made: 'x' });
    const pp = pix(rp.grid, 300, -200);
    ok(pp[0] < 128 && pp[1] < 128 && pp[2] < 128 && pix(rp.grid, 300, -30).join() === BASE.join() && pix(rp.aux.z, 300, -200) === -20 && pix(rp.aux.n, 300, -200)[3] === 3 &&
      pix(rp.aux.n, 300, -30)[3] === 1 && rp.sidecar.water.planes === 1 && rp.sidecar.water.entityPlanes === 1 && rp.sidecar.water.ocean === null,
      tag + 'o.planes square at z -20: (300, -200) darker, z -20, kind 3; (300, -30) above W = base: ' + pp + ' ' + JSON.stringify(rp.sidecar.water));
    ok(near(pp, [26, 26, 26, 255], 1), tag + 'default optics over 180 u: deep 0.1 grey (fog 0 at view_distance 1500): ' + pp);
    ok(!rp.sidecar.gaps.includes('RENDER_WATER_APPROX'), tag + 'given planes: no ocean, no RENDER_WATER_APPROX');
  }
}

// ------------------------------------------------------------------ uv ruling with an asymmetric texture
function testUv() {
  // 8 x 4 texture: column 0 red, last column blue, row 0 green in the middle columns
  const lv = { w: 8, h: 4, rgba: new Uint8Array(8 * 4 * 4) };
  for (let j = 0; j < 4; j++) for (let i = 0; i < 8; i++) {
    const c = i === 0 ? [255, 0, 0] : i === 7 ? [0, 0, 255] : j === 0 ? [0, 255, 0] : [100, 100, 100];
    lv.rgba.set(c.concat(255), (j * 8 + i) * 4);
  }
  const tex = { levels: [lv], frame: [8, 4], key: 't' };
  const E = require('../../entcat');
  const en = { footprint: { kind: 'decal', source: 'decal', rotate: true, zones: [{ kind: 'obb', center: [0, 0], half: [8, 4], axis: [1, 0] }], sprite: { mtl: 'm' } } };
  for (const yaw of [0, 90]) {
    const pts = E.footprintOf(en, { x: 0, y: 0, yaw, scale: 1 }).pts;
    const row = { pts, sprite: { mtl: 'm' }, color: [255, 255, 255], opacity: 1 };
    const SW = 64, rows = 64, z = new Float32Array(SW * rows).fill(0), nrm = new Float32Array(SW * rows * 3);
    for (let k = 0; k < SW * rows; k++) nrm[k * 3 + 2] = 1;
    const D = new Float32Array(SW * rows * 4);
    DC.draw([row], new Map([['m', tex]]), { sj0: 0, sj1: rows, SW, x0: -16, y0: -16, sx: 0.5, sy: 0.5, foot: 0.5, z, n: nrm, D });
    const at = (x, y) => { const k = Math.floor((y + 16) / 0.5) * SW + Math.floor((x + 16) / 0.5); return [D[k * 4], D[k * 4 + 1], D[k * 4 + 2], D[k * 4 + 3]]; };
    const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const p0 = pts[0], p1 = pts[1], p3 = pts[3];
    const q = (u, v) => { const a = lerp(p0, p1, u); return [a[0] + (p3[0] - p0[0]) * v, a[1] + (p3[1] - p0[1]) * v]; };
    const nearP0 = at(...q(0.03, 0.5)), nearP1 = at(...q(0.97, 0.5)), nearRow0 = at(...q(0.5, 0.05));
    ok(nearP0[0] > nearP0[2] && nearP0[0] > 0.5 && nearP1[2] > nearP1[0] && nearRow0[1] > nearRow0[0] && nearRow0[1] > nearRow0[2],
      'uv ruling yaw ' + yaw + ': texture column 0 at pts[0], the last column at pts[1], row 0 along pts[0] -> pts[1] (' + [nearP0, nearP1, nearRow0].map(c => c.map(v => v.toFixed(2)).join(' ')).join(' | ') + ')');
  }
  // the sprite frame: a 16 x 4 atlas with Axis 8 4 never reads the right half (magenta there)
  const at2 = { w: 16, h: 4, rgba: new Uint8Array(16 * 4 * 4) };
  for (let j = 0; j < 4; j++) for (let i = 0; i < 16; i++) at2.rgba.set((i < 8 ? [100, 100, 100] : [255, 0, 255]).concat(255), (j * 16 + i) * 4);
  const SW = 64, z = new Float32Array(SW * SW).fill(0), nrm = new Float32Array(SW * SW * 3), D = new Float32Array(SW * SW * 4);
  for (let k = 0; k < SW * SW; k++) nrm[k * 3 + 2] = 1;
  DC.draw([{ pts: [[-8, -4], [8, -4], [8, 4], [-8, 4]], sprite: { mtl: 'a' }, color: [255, 255, 255], opacity: 1 }], new Map([['a', { levels: [at2], frame: [8, 4] }]]),
    { sj0: 0, sj1: SW, SW, x0: -16, y0: -16, sx: 0.5, sy: 0.5, foot: 0.5, z, n: nrm, D });
  let bleed = 0;
  for (let k = 0; k < SW * SW; k++) if (D[k * 4 + 3] > 0 && D[k * 4 + 1] < D[k * 4] * 0.9) bleed++;
  ok(bleed === 0, 'sprite frame (Axis 8 4 of a 16 x 4 atlas): no texel of the right half drawn (' + bleed + ')');
}

// ------------------------------------------------------------------ optics, omask, mtl readers
function testOptics() {
  const o = WP.optics({});
  const g = [0.5, 0.5, 0.5];
  o.apply(g, 0);
  ok(g.join() === '0.5,0.5,0.5', 'optics: depth 0 leaves the colour');
  const g2 = [0.5, 0.5, 0.5]; o.apply(g2, 2.5);
  ok(Math.abs(g2[0] - (0.5 + (0.1 - 0.5) * 0.5)) < 1e-9, 'optics: default view distance 1500 -> deep colour, coast blend at d / 5: ' + g2[0]);
  const f = WP.optics({ viewDistance: 1e9, maxDepth: 1e9, coastDepth: 1 });
  const g3 = [1, 1, 1]; f.apply(g3, 45);
  const T = [1, 45 / 750, 45 / 3000];
  ok(T.every((t, c) => Math.abs(g3[c] - (1 + (0.1 - 1) * t)) < 1e-4), 'optics: per channel extinction 45 / 750 / 3000 u: ' + g3.map(v => v.toFixed(4)));
  const p = WP.optics({ pollution: 1, pollutionColor: [255, 0, 0] });
  ok(Math.abs(p.deep[0] - 0.25) < 1e-9 && Math.abs(p.deep[1]) < 1e-9, 'optics: pollution 1 -> deep = 0.25 x pollution colour');
  ok(JSON.stringify(WP.waterDetails('{material water {water_details {pollution 0.5} {opaque_depth 40} {coastal_softness 2} {view_distance 2500}}}')) ===
    JSON.stringify({ pollution: 0.5, maxDepth: 40, coastDepth: 2, viewDistance: 2500 }), 'waterDetails reads pollution, opaque_depth, coastal_softness, view_distance');
  ok(JSON.stringify(WP.waterDetails('{material water {color 0xffffffff}}')) === '{}', 'waterDetails: no block -> defaults');
  // map.omask: 2 x 3 cells from (100, 200); cell (1, 2) type 0 (cut), others 2
  const R2 = 2, C = 3, b = Buffer.alloc(21 + R2 * C * 10);
  b.writeUInt32LE(0, 0); b[4] = 1; b.writeFloatLE(100, 5); b.writeFloatLE(200, 9); b.writeUInt32LE(R2, 13); b.writeUInt32LE(C, 17);
  for (let i = 0; i < R2 * C; i++) b[21 + i * 10] = 2;
  b[21 + (1 * C + 2) * 10] = 0;
  const m = WP.readOmask(b);
  ok(m && m.R === 2 && m.C === 3 && m.type(1, 2) === 0 && m.type(0, 0) === 2, 'readOmask: header and cells (index i x C + j)');
  ok(WP.readOmask(b.subarray(0, b.length - 1)) === null, 'seeded: a map.omask one byte short is refused');
  ok(JSON.stringify(DC.mtlDiffuse('{material bump\n\t{diffuse "fx_road"\n\t\t{Axis 64 32}}\n\t{Blend blend}}')) === JSON.stringify({ name: 'fx_road', axis: [64, 32] }) &&
    DC.mtlDiffuse('{material simple {diffuse "$/wall/x"} {blend blend}}').axis === null, 'mtlDiffuse: name and Axis');
  ok(JSON.stringify(WP.argb('0xff1c2b8e')) === '[28,43,142]' && JSON.stringify(WP.argb(0xff1c2b8e)) === '[28,43,142]', 'argb: 0xAARRGGBB text and number');
}

// ------------------------------------------------------------------ the ocean on every target; the GoH map.omask cut
async function testOcean() {
  // as64 = mowas2: an active Ocean at zlevel -20.7 -> plane z trunc = -20 [V], pollution 0.6
  const { src, doc } = fixture('as2');
  const { base } = flatBase(doc);
  const d = Object.assign({}, doc, { water: Object.assign({}, doc.water, { ocean: { active: true, zlevel: -20.7, kind: 'lake' } }) });
  for (const t of ['as64', 'mowas2']) {
    const wp = WP.planes(src, d, null, { target: t });
    const P = wp.planes[0];
    ok(wp.planes.length === 1 && P.kind === 'ocean' && P.z === -20 && Math.abs(P.w.p - 0.6) < 1e-9 && !P.cut && wp.ocean && wp.ocean.zlevel === -20 && wp.ocean.omask === false &&
      wp.gaps.has('RENDER_WATER_APPROX'), t + ' ocean: plane z trunc(-20.7) = -20, pollution 0.6, no cut, RENDER_WATER_APPROX: ' + JSON.stringify(wp.ocean));
  }
  const g0 = await L2.l2(src, doc, { size: SIZE, base, made: 'x' });
  const zg = pix(g0.aux.z, 300, -200);
  const r = await L2.l2(src, d, { size: SIZE, base, made: 'x' });
  const sc = r.sidecar, p = pix(r.grid, 300, -200);
  const want = [0.5019607843137255, 0.5019607843137255, 0.5019607843137255];
  WP.optics({ pollution: 0.6 }).apply(want, -20 - zg);
  const w8 = want.map(v => Math.round(v * 255)).concat(255);
  ok(sc.water.ocean && sc.water.ocean.zlevel === -20 && sc.water.planes === 1 && sc.gaps.includes('RENDER_WATER_APPROX') && sc.approx === true &&
    pix(r.aux.z, 300, -200) === -20 && pix(r.aux.n, 300, -200)[3] === 3, 'mowas2 ocean in l2: z -20, kind 3, RENDER_WATER_APPROX: ' + JSON.stringify(sc.water));
  ok(near(p, w8, 2), 'mowas2 ocean colour = optics(pollution 0.6) over the base at depth ' + (-20 - zg).toFixed(2) + ': want ' + w8 + ', got ' + p);

  // GoH map.omask: one 20 u cell over the pond cut; flag 1 cuts type 0, flag 0 (inverted) cuts type 1 [I GHMAP-11]
  const G = fixture('goh');
  const gb = flatBase(G.doc).base;
  const box = G.doc.boxes.world;
  const R2 = Math.ceil((box[2] - box[0]) / 20), C = Math.ceil((box[3] - box[1]) / 20);
  const ci = Math.floor((300 - box[0]) / 20), cj = Math.floor((-200 - box[1]) / 20);
  const cell = [box[0] + 20 * ci + 10, box[1] + 20 * cj + 10];   // centre of the cut cell
  const keep = [cell[0] - 40, cell[1]];                            // pond, two cells west: kept
  const shore = [cell[0], cell[1] - 40];                           // pond, two cells south: type 2, never cut
  function omask(flag) {
    const b = Buffer.alloc(21 + R2 * C * 10);
    b[4] = flag; b.writeFloatLE(box[0], 5); b.writeFloatLE(box[1], 9); b.writeUInt32LE(R2, 13); b.writeUInt32LE(C, 17);
    const water = flag === 1 ? 1 : 0, cut = flag === 1 ? 0 : 1;
    for (let i = 0; i < R2 * C; i++) b[21 + i * 10] = water;
    b[21 + (ci * C + cj) * 10] = cut;
    b[21 + (ci * C + cj - 2) * 10] = 2;
    return b;
  }
  const plain = await L2.l2(G.src, G.doc, { size: SIZE, base: gb, made: 'x' });
  ok([cell, keep, shore].every(q => pix(plain.aux.n, q[0], q[1])[3] === 3), 'goh no omask: the three pond points are ocean (kind 3)');
  const shas = [];
  for (const flag of [1, 0]) {
    const key = 'resource/map/' + G.doc.key + '/map.omask', buf = omask(flag);
    const s2 = Object.create(G.src);
    s2.has = k => k === key || G.src.has(k);
    s2.read = k => k === key ? buf : G.src.read(k);
    const ro = await L2.l2(s2, G.doc, { size: SIZE, base: gb, made: 'x' });
    const n = ro.aux.n, g = ro.grid;
    ok(ro.sidecar.water.ocean && ro.sidecar.water.ocean.omask === true, 'goh omask flag ' + flag + ': used (omask true)');
    ok(pix(n, cell[0], cell[1])[3] !== 3 && pix(g, cell[0], cell[1]).join() === BASE.join(),
      'goh omask flag ' + flag + ': the cut cell has no ocean (base bytes): ' + pix(g, cell[0], cell[1]));
    ok(pix(n, keep[0], keep[1])[3] === 3 && pix(g, keep[0], keep[1]).join() === pix(plain.grid, keep[0], keep[1]).join(),
      'goh omask flag ' + flag + ': water cell kept, same bytes as with no mask');
    ok(pix(n, shore[0], shore[1])[3] === 3, 'goh omask flag ' + flag + ': type 2 (shore) cell not cut');
    shas.push(sha1(g.data));
  }
  ok(shas[0] === shas[1], 'goh omask: flag 1 (type 0 cut) and flag 0 (type 1 cut) give the same picture');
}

// ------------------------------------------------------------------ ground from a map.ply; base of another frame
async function testPly() {
  const f = fx.make(path.join(W, 'fx-ply'), { form: 'as2' });
  const plyO = { x0: -640, y0: -480, x1: 640, y1: 480, nx: 8, ny: 6, uvs: 300, z: x => 0.05 * x,
    parts: [{ x0: -640, x1: 640, material: 'mtl0.mtl', rgb: 64, alpha: () => 255 }] };
  const d = 'resource/map/' + f.map + '/';
  S.writeFiles(f.modDirs[0], {
    [d + 'map.ply']: S.plyBuf(plyO), [d + 'mtl0.mtl']: S.mtl('/texture/rtest/g', '/texture/rtest/g'),
    'resource/texture/rtest/g.dds': S.dds32(8, 8, [100, 100, 100, 255]), 'resource/texture/rtest/g_nm.dds': S.dds32(8, 8, [128, 128, 255, 255]),
  });
  const src = mk.source({ target: f.target, game: f.gameDir, mods: [], modDirs: f.modDirs });
  const doc = mk.doc(src, f.map, {});
  // seeded: a base of another frame is not used; l1 is drawn again (the map.ply route), ground 'ply'
  const { base } = flatBase(doc, [10, 200, 10, 255], 300);
  const r = await L2.l2(src, doc, { size: SIZE, base, made: 'x' });
  const sc = r.sidecar;
  ok(sc.base.from === 'drawn' && sc.ground === 'ply' && sc.detail === 'map' && (sc.notes || []).some(t => /another frame/.test(t)) && pix(r.grid, 0, 0)[1] !== 200,
    'seeded: a 300 px base on a 600 px plan is not used, l1 drawn again (from ' + sc.base.from + ', ground ' + sc.ground + ')');
  ok(sc.mapHashes['map.ply'] && Object.keys(sc.mapHashes).length > 2, 'mapHashes: the base (l1) files plus map.ply and the decal files');
  ok(Math.abs(pix(r.aux.z, 100, 0, true) - 5) < 0.06 && Math.abs(pix(r.aux.z, -300, 50, true) + 15) < 0.06 && pix(r.aux.n, 100, 0, true).slice(0, 3).join() === '128,128,255',
    'ply ground: z = 0.05 x barycentric (100 -> 5, -300 -> -15), normal from the vertices (0, 0, 1): ' + pix(r.aux.z, 100, 0, true) + ' ' + pix(r.aux.z, -300, 50, true));
  // given base on the plan frame: used, ground from the height grid
  const fb = flatBase(doc);
  const r2 = await L2.l2(src, doc, { size: SIZE, base: fb.base, made: 'x' });
  ok(r2.sidecar.base.from === 'given' && r2.sidecar.ground === 'net', 'a given base on the plan frame is used; ground net');
  const r3 = await L2.l2(src, doc, { size: SIZE, base: Object.assign({ from: 'in' }, fb.base), made: 'x' });
  ok(r3.sidecar.base.from === 'in' && r3.sidecar.ground === 'ply', 'a base read with --in: from in, ground ply');
}

// ------------------------------------------------------------------ seeded catalog defects
async function testSeeded() {
  const { src, doc } = fixture('as2');
  const { base } = flatBase(doc);
  const E = require('../../entcat');
  const cat = E.forDoc(src, doc, {});
  const clone = JSON.parse(JSON.stringify(cat));
  // decal mtl missing -> RENDER_DECAL_TEXTURE, not drawn
  clone.entries.fx_road.footprint.sprite.mtl = 'resource/entity/landscape/stamp/road/no_such.mtl';
  let r = await L2.l2(src, doc, { size: SIZE, base, catalog: clone, made: 'x' });
  ok(r.sidecar.gaps.includes('RENDER_DECAL_TEXTURE') && r.sidecar.decals.noTexture === 1 && r.sidecar.decals.drawn === 0 && pix(r.grid, 0, 200).join() === BASE.join() && r.sidecar.approx === true,
    'seeded: decal mtl missing -> RENDER_DECAL_TEXTURE, not drawn, approx');
  // a decal def with no size -> RENDER_DECAL_SIZE
  const c2 = JSON.parse(JSON.stringify(cat));
  c2.entries.fx_road.footprint = null;
  c2.entries.fx_road.notes = [{ code: 'ENTCAT_DECAL_SIZE', msg: 'x' }];
  r = await L2.l2(src, doc, { size: SIZE, base, catalog: c2, made: 'x' });
  ok(r.sidecar.gaps.includes('RENDER_DECAL_SIZE') && r.sidecar.decals.noSize === 1 && r.sidecar.decals.placed === 1, 'seeded: decal with no size -> RENDER_DECAL_SIZE');
  // a water_surface def whose model cannot load -> RENDER_WATER_PLANE
  const c3 = JSON.parse(JSON.stringify(cat));
  c3.entries.fx_water = { def: 'fx_water', category: 'water_surface', mdl: 'resource/entity/landscape/water/fx_water/no.mdl', footprint: null, notes: [] };
  const doc3 = Object.assign({}, doc, { entities: doc.entities.concat([{ uid: 9999, def: 'fx_water', x: 300, y: -200, z: null, yaw: 0, scale: 1, src: 'map', mode: null, decal: null }]) });
  r = await L2.l2(src, doc3, { size: SIZE, base, catalog: c3, made: 'x' });
  ok(r.sidecar.gaps.includes('RENDER_WATER_PLANE') && r.sidecar.water.planes === 0 && pix(r.grid, 300, -200).join() === BASE.join(), 'seeded: water mesh that cannot load -> RENDER_WATER_PLANE, nothing drawn');
  // decal order: two overlapping decals, the higher order on top
  const doc4 = Object.assign({}, doc, { entities: doc.entities.map(e => e.def === 'fx_road' ? Object.assign({}, e, { decal: { order: 5, color: [255, 0, 0, 255], opacity: 1 } }) : e)
    .concat([{ uid: 9998, def: 'fx_road', x: 0, y: 200, z: null, yaw: 0, scale: 2, src: 'map', mode: null, decal: { order: 2, color: [0, 0, 255, 255], opacity: 1 } }]) });
  r = await L2.l2(src, doc4, { size: SIZE, base, catalog: cat, made: 'x' });
  const p = pix(r.grid, 0, 200);
  ok(p[0] > 100 && p[2] < 20 && r.sidecar.decals.drawn === 2, 'decal order: order 5 (red) over order 2 (blue) though placed first: ' + p);
  // opacity fades
  const doc5 = Object.assign({}, doc, { entities: doc.entities.map(e => e.def === 'fx_road' ? Object.assign({}, e, { decal: { order: 1, color: [156, 138, 110, 255], opacity: 0.5 } }) : e) });
  r = await L2.l2(src, doc5, { size: SIZE, base, catalog: cat, made: 'x' });
  const h = pix(r.grid, 0, 200);
  ok(near(h, [105, 97, 88, 255], 2), 'decal opacity 0.5: half over the base: ' + h);
  // a transparent base pixel is never drawn
  const tb = flatBase(doc);
  for (let i = 0; i < tb.base.grid.w * tb.base.grid.h; i++) if (i % tb.base.grid.w >= 300) tb.base.grid.data[i * 4 + 3] = 0;
  r = await L2.l2(src, doc, { size: SIZE, base: tb.base, planes: SQUARE, made: 'x' });
  ok(pix(r.grid, 300, -200)[3] === 0 && pix(r.aux.n, 300, -200)[3] === 0 && pix(r.aux.z, 300, -200) === -32768 && pix(r.aux.n, -100, -200)[3] === 1,
    'base alpha 0: not drawn, kind 0, z nodata');
  // bad input
  ok((await rejects(L2.l2(src, null, { size: SIZE, base }))) instanceof mv.MvError, 'no doc: MvError');
  const em = await rejects(L2.l2(src, doc, { size: SIZE, base, mode: 'no_such_mode' }));
  ok(em && em.code === 'MV_NOT_FOUND', 'unknown mode: MV_NOT_FOUND');
  const es = await rejects(L2.l2(src, doc, { size: 0, base }));
  ok(es && es.code === 'MV_USAGE', 'size 0: MV_USAGE');
}

// ------------------------------------------------------------------ index and CLI
async function testCli() {
  const rg = R.rungs();
  ok(rg.l0 && rg.l1 && rg.c0 && rg.l2 && typeof rg.pack === 'boolean' && typeof rg.l3 === 'boolean' && typeof rg.l4 === 'boolean', 'index rungs(): ' + JSON.stringify(rg));
  ok(R.VERSION === 5 && require('../cli').version === 5 && R.KERNELS[0] === 'render/l1tile', 'VERSION 5 in index.js and cli.js; KERNELS starts with render/l1tile');
  for (const form of ['as2', 'goh']) {
    const { f, src, doc } = fixture(form);
    const common = ['--target', f.target, '--game', f.gameDir, '--mod-dir', f.modDirs[0], '--map', f.map];
    const ind = path.join(W, 'cli-in-' + form);
    fs.mkdirSync(ind, { recursive: true });
    const { base } = flatBase(doc);
    gridfile.write(path.join(ind, 'pic.l1.mvg'), base.grid);
    fs.writeFileSync(path.join(ind, 'pic.l1.json'), JSON.stringify({ v: 1, layer: 'pic.l1', gaps: [], mapHashes: {}, made: 'm', detail: 'map', keep: 0, detailTextures: [], detailChanged: false }));
    const out = path.join(W, 'cli-l2-' + form);
    let c = cli(['render', 'l2'].concat(common, ['--size', String(SIZE), '--in', ind, '--out', out, '--json']));
    const j = json(c.out);
    const want = form === 'goh' ? 1 : 0;
    ok(c.code === want && j && j.w === 600 && j.h === 440 && ['pic.l2.mvg', 'pic.l2.json', 'l2.n.mvg', 'l2.z.mvg', 'reads.json'].every(x => j.files.includes(x) && fs.existsSync(path.join(out, x))),
      form + ' cli l2 --in: exit ' + want + ' (got ' + c.code + '), five files ' + c.err.trim().slice(-300));
    if (c.code === want) {
      const sc = JSON.parse(fs.readFileSync(path.join(out, 'pic.l2.json'), 'utf8'));
      const r = await L2.l2(src, doc, { size: SIZE, base: Object.assign({ from: 'in' }, base), made: 'x' });
      const g = gridfile.read(path.join(out, 'pic.l2.mvg')), z = gridfile.read(path.join(out, 'l2.z.mvg'));
      ok(sha1(g.data) === sha1(r.grid.data) && sha1(z.data) === sha1(r.aux.z.data) && z.nodata === -32768 && z.meta.unit === 'u', form + ' cli l2 = in process, byte for byte');
      ok(sc.base.from === 'in' && sc.base.made === 'm' && sc.detail === 'map' && sc.keep === 0 && sc.detailChanged === false, form + ' cli l2 sidecar: base from in, detail fields copied from pic.l1.json');
    }
    c = cli(['render', 'l2'].concat(common, ['--size', String(SIZE), '--units', '--in', ind, '--out', path.join(W, 'cli-l2u-' + form)]));
    ok(c.code === 2, form + ' seeded: --units on l2 exits 2, got ' + c.code);
    c = cli(['render', 'l2'].concat(common, ['--size', String(SIZE), '--light', 'clean', '--in', ind, '--out', path.join(W, 'cli-l2l-' + form)]));
    ok(c.code === 2, form + ' --light on l2 exits 2, got ' + c.code);
    // --pool is not an l2 flag (render.md 2.3): accepted and ignored, a bad value too
    c = cli(['render', 'l2'].concat(common, ['--size', String(SIZE), '--pool', '99', '--in', ind, '--out', path.join(W, 'cli-l2p-' + form), '--json']));
    ok(c.code === want, form + ' --pool 99 on l2 is ignored: exit ' + want + ', got ' + c.code);
  }
  const { f } = fixture('as2');
  const common = ['--target', f.target, '--game', f.gameDir, '--mod-dir', f.modDirs[0], '--map', f.map];
  let c = cli(['render', 'l2'].concat(common, ['--size', '128', '--out', path.join(W, 'cli-l2-none'), '--json']));
  const e = (json(c.out) || {}).error;
  ok(c.code === 3 && e && e.detail && e.detail.code === 'RENDER_PLY_MISSING', 'cli l2 with no base on the fixture (no map.ply): l1 drawn in process, exit 3 RENDER_PLY_MISSING, got ' + c.code);
  c = cli(['render', 'l2'].concat(common, ['--mode', 'no_such', '--size', '128', '--out', path.join(W, 'cli-l2-mode')]));
  ok(c.code === 3, 'cli l2 unknown mode: exit 3, got ' + c.code);
  c = cli(['render', 'l2'].concat(common, ['--out', path.join(f.gameDir, 'out')]));
  ok(c.code === 6, 'cli l2 --out inside the install: exit 6, got ' + c.code);
  c = cli(['render', '--help']);
  ok(c.code === 0 && ['l2', 'pack', 'l3', 'l4'].every(w => new RegExp('\\b' + w + '\\b').test(c.out)), 'render --help lists l2, pack, l3, l4');
}

(async () => {
  const gfile = path.join(__dirname, 'l2.golden.json');
  let golden = null;
  try { golden = JSON.parse(fs.readFileSync(gfile, 'utf8')); } catch (e) { golden = null; }
  const got = {};
  await testFixture(UPDATE ? null : golden, got);
  if (UPDATE || !golden) { fs.writeFileSync(gfile, JSON.stringify(got, null, 1) + '\n'); console.log('wrote ' + gfile); }
  testUv();
  testOptics();
  await testOcean();
  await testPly();
  await testSeeded();
  await testCli();
  if (fail) { console.log(fail + ' failed, ' + pass + ' passed (work folder kept: ' + W + ')'); process.exit(1); }
  if (!process.argv[2] || /^--/.test(process.argv[2])) { try { fs.rmSync(W, { recursive: true, force: true }); } catch (e) { /* temp */ } }
  console.log('PASS mapviz render l2 (' + pass + ')');
})().catch(e => { console.log('FAIL mapviz render l2: ' + (e && e.stack || e)); process.exit(1); });

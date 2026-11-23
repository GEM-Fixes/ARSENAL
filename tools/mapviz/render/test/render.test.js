// render test (MV-R1): plan, L0 on the fixture (both forms, golden sha1), L1 on a synthetic map.ply (pixel values by
// hand: uv x tiling, v sign, vertex colour bytes, alpha in x and y, the mip level), C0 on a synthetic minimap with a known
// shift and gain, sidecars, seeded defects, the kernel through the pool and through `mapviz work`, the CLI exit codes.
// usage: node tools/mapviz/render/test/render.test.js [scratch dir]     (README 9.4)
// Author: Imperator_Aug (ARSENAL, ia-6209ec23)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto'), { spawnSync } = require('child_process');

const W = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'mapviz-render-')));
fs.mkdirSync(W, { recursive: true });
{
  const c = process.env.ARSENAL_CACHE;
  process.env.ARSENAL_CACHE = c && path.resolve(c).startsWith(W + path.sep) ? c : path.join(W, 'cache');
}
const UPDATE = process.argv.includes('--update-golden');

let pass = 0, fail = 0;
function ok(c, what) { if (c) pass++; else { fail++; console.log('FAIL mapviz render: ' + what); } }
const sha1 = b => crypto.createHash('sha1').update(b).digest('hex');

const MVDIR = path.resolve(__dirname, '../..');
const MVJS = path.join(MVDIR, 'mapviz.js');
const R = require('../index');
const F = require('../frame');
const L1 = require('../l1');
const S = require('./synth');
const mv = require(MVJS);
const gridfile = require(path.join(MVDIR, 'lib/raster/gridfile'));
const fx = require(path.join(MVDIR, 'test/fxmake'));
const pal = require(path.join(MVDIR, 'palette.json'));
const hex = s => { const v = parseInt(s.slice(1, 7), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255, s.length > 7 ? parseInt(s.slice(7, 9), 16) : 255]; };
const fill = code => hex((pal.ground.types.find(t => t.code === code) || { fill: pal.ground.other }).fill);
const px = (g, i, j) => Array.from(g.data.subarray((j * g.w + i) * 4, (j * g.w + i) * 4 + 4));
const throwsCode = (fn, code) => { try { fn(); return false; } catch (e) { return e instanceof mv.MvError && e.code === code; } };
async function rejectsCode(p, code) { try { await p; return 'resolved'; } catch (e) { return e instanceof mv.MvError && e.code === code ? true : (e.code || e.message); } }

function cli(args) {
  const r = spawnSync(process.execPath, [MVJS].concat(args), { encoding: 'utf8', env: Object.assign({}, process.env), timeout: 300000 });
  return { code: r.status, out: r.stdout || '', err: r.stderr || '' };
}

// ------------------------------------------------------------------ plan (R0)
function testPlan() {
  const doc = box => ({ boxes: { world: box } });
  let p = R.plan(doc([0, 0, 1000, 333]), { size: 4097 });
  ok(p.size[0] === 4097 && p.size[1] === Math.round(333 * 4097 / 1000), 'plan wide: size ' + p.size);
  ok(p.tile === 2048 && p.tiles.length === 3, 'plan wide: 3 tiles, got ' + p.tiles.length);
  ok(p.tiles[2].x === 4096 && p.tiles[2].w === 1 && p.tiles.every(t => t.guard === 8), 'plan wide: last tile 1 px wide, guard 8');
  ok(p.box.join() === '0,0,1000,333' && Math.abs(p.cell * p.size[0] - 1000) < 1e-9 && Math.abs(p.cellY * p.size[1] - 333) < 1e-9, 'plan covers exactly the world box');
  p = R.plan(doc([-5, -7, 5, 93]), { size: 100 });
  ok(p.size[0] === 10 && p.size[1] === 100 && p.tiles.length === 1, 'plan tall: 10 x 100, one tile');
  p = R.plan(doc([-8094.53, -9010.36, 8110.47, 8613.74]), { size: 5000, guard: 3 });
  ok(p.size[1] === 5000 && p.size[0] === Math.round(16205 * 5000 / 17624.1), 'plan odd box: aspect kept ' + p.size);
  const own = new Uint8Array(p.size[0] * p.size[1]);
  let dup = 0;
  for (const t of p.tiles) {
    ok(t.guard === 3, 'plan guard override');
    for (let y = t.y; y < t.y + t.h; y++) for (let x = t.x; x < t.x + t.w; x++) { if (own[y * p.size[0] + x]) dup++; own[y * p.size[0] + x] = 1; }
  }
  ok(!dup && own.every(v => v === 1), 'plan: every pixel has exactly one owner tile');
  ok(p.tiles.length === 9 && p.tiles[0].x === 0 && p.tiles[0].y === 0 && p.tiles[1].x === 2048 && p.tiles[3].y === 2048, 'plan: row-major from (0,0), 3 x 3 tiles');
  p = R.plan(doc([0, 0, 1, 1]), { size: 2048 });
  ok(p.tiles.length === 1 && p.tiles[0].w === 2048, 'plan exact 2048: one tile');
  ok(throwsCode(() => R.plan(doc([0, 0, 1, 1]), { size: 0 }), 'MV_USAGE'), 'plan size 0 refused (MV_USAGE)');
  ok(throwsCode(() => R.plan(doc([0, 0, 1, 1]), { size: 20.5 }), 'MV_USAGE'), 'plan size 20.5 refused');
  ok(throwsCode(() => R.plan(doc([0, 0, 0, 1]), { size: 64 }), 'MV_USAGE'), 'plan empty box refused');
  // the frame resample keeps a solid picture solid and fills the box
  const g = { name: 'x', w: 4, h: 2, cell: 10, ox: 0, oy: 0, etype: 'rgba8', sample: 'cell', meta: {}, data: new Uint8ClampedArray(32).fill(200) };
  const r = F.resampleTo(g, { x0: 0, y0: 0, sx: 7, sy: 5, W: 5, H: 4 });
  ok(r.w === 5 && r.h === 4 && px(r, 4, 3).join() === '200,200,200,200' && px(r, 0, 0).join() === '200,200,200,200', 'frame resample solid stays solid');
}

// ------------------------------------------------------------------ L0 on the fixture
const FX = {};
function fixture(form) {
  if (!FX[form]) FX[form] = fx.make(path.join(W, 'fx-' + form), { form });
  return FX[form];
}
function fxInfo(dir, form) { return fx.make(dir, { form }); }

function synthShade(height) {
  const d = new Uint8Array(height.w * height.h);
  for (let j = 0; j < height.h; j++) for (let i = 0; i < height.w; i++) d[j * height.w + i] = (i * 7 + j * 13) % 256;
  return { name: 'shade', w: height.w, h: height.h, cell: height.cell, ox: height.ox, oy: height.oy, etype: 'u8', sample: 'lattice', scale: 1, offset: 0, nodata: null, meta: { alt: 30, flat: 128 }, data: d };
}
function flatShade(height, v) { const s = synthShade(height); s.data.fill(v); return s; }

function testL0(golden) {
  const mk = require(path.join(MVDIR, 'lib/mapkit'));
  const out = {};
  for (const form of ['as2', 'goh']) {
    const fxd = fixture(form);
    const src = mk.source({ target: fxd.target, game: fxd.gameDir, mods: [], modDirs: fxd.modDirs });
    const doc = mk.doc(src, fxd.map, { entities: false });
    const g = mk.grids(src, fxd.map, {});
    const cell = g.gtype.cell, ci = x => Math.floor((x - g.gtype.ox) / cell), cj = y => Math.floor((y - g.gtype.oy) / cell);
    // flat shade: every non-water cell is exactly its type fill
    const flat = R.l0(doc, Object.assign({}, g, { shade: flatShade(g.height, 128) }), { made: 'x' });
    ok(flat.grid.w === g.gtype.w && flat.grid.h === g.gtype.h && flat.grid.ox === g.gtype.ox && flat.grid.cell === cell, form + ' l0: cell frame (R8)');
    const pi = ci(300), pj = cj(-200), pt = g.gtype.data[pj * g.gtype.w + pi];
    ok(pt >= 3 && pt <= 5 && px(flat.grid, pi, pj).join() === fill(pt).join(), form + ' l0: pond centre is the water colour of type ' + pt);
    const ri = ci(0), rj = cj(205), rt = g.gtype.data[rj * g.gtype.w + ri];
    ok(rt === 7 && px(flat.grid, ri, rj).join() === fill(7).join(), form + ' l0: road row has the road colour (type ' + rt + ')');
    // the real hillshade: the ridge flanks shade differently, the pond stays unshaded
    const real = R.l0(doc, g, { made: 'x' });
    const a = px(real.grid, ci(-240), cj(0)), b = px(real.grid, ci(-160), cj(0)), gf1 = fill(g.gtype.data[cj(0) * g.gtype.w + ci(-240)]);
    ok(a.join() !== b.join() && (a.join() !== gf1.join() || b.join() !== gf1.join()), form + ' l0: the ridge shades (' + a + ' / ' + b + ')');
    ok(px(real.grid, pi, pj).join() === fill(pt).join(), form + ' l0: water unshaded with the real shade');
    // golden: synthetic shade (raster's shade may be re-tuned; its bytes are never pinned here)
    const gold = R.l0(doc, Object.assign({}, g, { shade: synthShade(g.height) }), { made: 'x' });
    const h = sha1(gridfile.dataBlock(gridfile.encode(gold.grid)));
    out[form] = h;
    if (golden) ok(golden[form] === h, form + ' l0 golden sha1 ' + h + ' != ' + golden[form]);
    // sidecar
    const sc = gold.sidecar;
    const keys = ['v', 'layer', 'w', 'h', 'box', 'cell', 'rowOrder', 'target', 'stackHash', 'mapHashes', 'rung', 'env', 'gaps', 'approx', 'brightness', 'made', 'size'];
    ok(keys.every(k => k in sc) && sc.v === 1 && sc.layer === 'pic.l0' && sc.rung === 'l0' && sc.rowOrder === 'minY-first' && sc.size === null && sc.made === 'x', form + ' l0 sidecar fields');
    ok(sc.box.join() === [g.gtype.ox, g.gtype.oy, g.gtype.ox + g.gtype.w * cell, g.gtype.oy + g.gtype.h * cell].join(), form + ' l0 sidecar box = grid box');
    // with --size: the plan frame over the world box
    const sz = R.l0(doc, Object.assign({}, g, { shade: synthShade(g.height) }), { size: 333, src, made: 'x' });
    const pl = R.plan(doc, { size: 333 });
    ok(sz.grid.w === pl.size[0] && sz.grid.h === pl.size[1] && sz.sidecar.box.join() === doc.boxes.world.join() && sz.sidecar.size === 333, form + ' l0 --size: plan frame ' + sz.grid.w + 'x' + sz.grid.h);
    ok(sz.sidecar.mapHashes && /^[0-9a-f]{40}$/.test(sz.sidecar.mapHashes['map.net'] || ''), form + ' l0 sidecar mapHashes with src');
    // pond pixel in the plan frame is still the water colour
    const fr = F.frameOf(pl), wi = Math.floor((300 - fr.x0) / fr.sx), wj = Math.floor((-200 - fr.y0) / fr.sy);
    ok(px(sz.grid, wi, wj).join() === fill(pt).join(), form + ' l0 --size: pond still water colour');
    ok(throwsCode(() => R.l0(doc, {}, {}), 'MV_USAGE'), form + ' l0 without grids refused');
    ok(throwsCode(() => R.l0(doc, g, { size: 0 }), 'MV_USAGE'), form + ' l0 size 0 refused');
  }
  return out;
}

// ------------------------------------------------------------------ L0 with height nodata (R16: past the ground mesh)
// the fixture grids with a nodata rim (row 0, column 0) and a block of lattice points set to the height grid's nodata
function testL0Nodata() {
  const mk = require(path.join(MVDIR, 'lib/mapkit'));
  for (const form of ['as2', 'goh']) {
    const fxd = fixture(form);
    const src = mk.source({ target: fxd.target, game: fxd.gameDir, mods: [], modDirs: fxd.modDirs });
    const doc = mk.doc(src, fxd.map, { entities: false });
    const g = mk.grids(src, fxd.map, {});
    const w = g.height.w, h = g.height.h, gw = g.gtype.w;
    const ndv = g.height.etype === 'u16' ? 65535 : -32768;
    const bi0 = Math.floor(w / 3), bj0 = Math.floor(h / 3), bn = Math.max(4, Math.floor(w / 12));
    const off = (i, j) => i === 0 || j === 0 || (i >= bi0 && i < bi0 + bn && j >= bj0 && j < bj0 + bn);
    const withOff = nd => {
      const d = g.height.data.slice();
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (off(i, j)) d[j * w + i] = ndv;
      return Object.assign({}, g.height, { nodata: nd, data: d });
    };
    const H = withOff(ndv), HBad = withOff(null);
    let nOff = 0;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (off(i, j)) nOff++;
    // shade 0 (dark) on the off points, flat 128 elsewhere: a cell next to them must stay its flat fill
    const sh = flatShade(g.height, 128);
    for (let k = 0; k < w * h; k++) if (off(k % w, Math.floor(k / w))) sh.data[k] = 0;
    const base = R.l0(doc, Object.assign({}, g, { shade: flatShade(g.height, 128) }), { made: 'x' }).grid;
    const nd = R.l0(doc, Object.assign({}, g, { height: H, shade: sh }), { made: 'x' }).grid;
    const bad = R.l0(doc, Object.assign({}, g, { height: HBad, shade: sh }), { made: 'x' }).grid;
    let alphaBad = 0, realBad = 0, badOpaque = 0, badDark = 0;
    for (let j = 0; j < g.gtype.h; j++) for (let i = 0; i < gw; i++) {
      const p = px(nd, i, j), b = px(base, i, j);
      if (off(i, j)) { if (p.join() !== '0,0,0,0') alphaBad++; if (px(bad, i, j)[3] !== 0) badOpaque++; }
      else { if (p.join() !== b.join()) realBad++; if (px(bad, i, j).join() !== b.join()) badDark++; }
    }
    ok(alphaBad === 0, form + ' l0 nodata: every cell whose own lattice point is nodata is transparent (' + alphaBad + ' not)');
    ok(realBad === 0, form + ' l0 nodata: the shade of a nodata corner does not reach the cells beside it (' + realBad + ' moved)');
    ok(nd.meta.offGround === nOff && !('offGround' in base.meta), form + ' l0 nodata: meta.offGround ' + nd.meta.offGround + ' = ' + nOff);
    ok(badOpaque > 0 && badDark > 0 && !('offGround' in bad.meta), form + ' l0 nodata planted: no nodata field, the cells are drawn (' + badOpaque + ') and shaded dark beside (' + badDark + ')');
    // the shade made here from the height (raster hillshade): transparent off ground, and no ring beside it: a cell
    // next to the block differs from the same cell without nodata by little (the heights past the edge are extrapolated)
    const r0 = R.l0(doc, g, { made: 'x' }).grid, r1 = R.l0(doc, Object.assign({}, g, { height: H }), { made: 'x' }).grid;
    let rAlpha = 0, worst = 0;
    for (let j = 0; j < g.gtype.h; j++) for (let i = 0; i < gw; i++) {
      const p = px(r1, i, j), b = px(r0, i, j);
      if (off(i, j)) { if (p[3] !== 0) rAlpha++; continue; }
      for (let c = 0; c < 4; c++) worst = Math.max(worst, Math.abs(p[c] - b[c]));
    }
    ok(rAlpha === 0, form + ' l0 nodata, own shade: off ground transparent');
    ok(worst <= 24, form + ' l0 nodata, own shade: no ring beside the nodata (largest channel change ' + worst + ')');
    console.log(form + ' l0 nodata, own shade: largest channel change beside nodata ' + worst);
  }
}

// ------------------------------------------------------------------ L1 on a synthetic map.ply
// a and b: 8 x 8 textures of four 4 x 4 quadrants (index = (row >= 4 ? 2 : 0) + (col >= 4 ? 1 : 0), row 0 = the first row
// of the file), so uv0, tiling, the u/v order and the v sign each pick the texel; c and d solid. Vertex colour R G B differ
// (bytes B G R A in the file). Part 0 alpha runs with world y (a row flip fails), part 1 alpha with world x.
const QUAD = {
  a: [[200, 100, 50], [150, 30, 10], [90, 160, 40], [240, 220, 120]],
  b: [[20, 40, 80], [70, 10, 30], [10, 90, 100], [60, 60, 140]],
};
const TEX = { c: [0, 200, 0], d: [250, 250, 250] };
const VC = [90, 64, 40];   // vertex colour R, G, B
const UVS = 40;            // uv0 = world / 40
const texMean = k => QUAD[k] ? [0, 1, 2].map(c => QUAD[k].reduce((s, q) => s + q[c], 0) / 4) : TEX[k];
const ALPHA0 = [0, 128, 255];   // part 0 vertex alpha bytes at the rows y0, mid, y1
function synthFiles(o) {
  o = o || {};
  const key = o.key || 'test/syn';
  const box = o.box || [0, 0, 40, 20];
  const mid = (box[0] + box[2]) / 2;
  const plyO = {
    x0: box[0], y0: box[1], x1: box[2], y1: box[3], nx: 2, ny: 2, uvs: o.uvs || UVS,
    parts: [
      { x0: box[0], x1: mid, material: o.mat0 || 'mtl0.mtl', rgb: VC, alpha: (x, y) => ALPHA0[Math.round(2 * (y - box[1]) / (box[3] - box[1]))] },
      { x0: mid, x1: box[2], material: o.mat1 || 'mtl1.mtl', rgb: VC, alpha: o.alpha1 || (x => Math.round(255 * (1 - (x - mid) / (box[2] - mid)))) },
    ],
  };
  const files = {};
  const d = 'resource/map/' + key + '/';
  let buf = S.plyBuf(plyO);
  if (o.cut) buf = buf.subarray(0, buf.length - o.cut);
  files[d + 'map.ply'] = buf;
  files[d + 'mtl0.mtl'] = S.mtl('/texture/rtest/a', '/texture/rtest/b');
  files[d + 'mtl1.mtl'] = o.mtl1Text ? Buffer.from(o.mtl1Text, 'latin1') : S.mtl('/texture/rtest/c', '/texture/rtest/d');
  for (const k of Object.keys(QUAD)) if (!(o.drop || []).includes(k)) files['resource/texture/rtest/' + k + '.dds'] = S.dds32(8, 8, (i, j) => QUAD[k][(j >= 4 ? 2 : 0) + (i >= 4 ? 1 : 0)].concat(255));
  for (const k of Object.keys(TEX)) if (!(o.drop || []).includes(k)) files['resource/texture/rtest/' + k + '.dds'] = S.dds32(8, 8, TEX[k].concat(255));
  Object.assign(files, o.extra || {});
  return { files, key, box, plyO };
}

function expectL1(t0, t1, al, rgb) {
  const Lv = L1.LIGHT, dn = Math.hypot(...Lv.dir), d = Math.max(0, -Lv.dir[2] / dn);
  return [0, 1, 2].map(c => (t0[c] * al + t1[c] * (1 - al)) * rgb[c] / 255 * L1.MUL * L1.GAIN * (Lv.sun[c] * d + Lv.amb[c]));
}

// vertex alpha on part 1 (piecewise linear between the bytes at its vertices x = mid, mid + q, x1)
function alpha1(x, box) {
  const mid = (box[0] + box[2]) / 2, q = (box[2] - mid) / 2;
  const by = k => Math.round(255 * (1 - (k * q) / (box[2] - mid)));
  const t = (x - mid) / q, k = Math.min(1, Math.floor(t));
  return (by(k) + (by(k + 1) - by(k)) * (t - k)) / 255;
}
// vertex alpha on part 0 (piecewise linear in world y between the ALPHA0 rows)
function alpha0(y, box) {
  const t = 2 * (y - box[1]) / (box[3] - box[1]), k = Math.min(1, Math.floor(t));
  return (ALPHA0[k] + (ALPHA0[k + 1] - ALPHA0[k]) * (t - k)) / 255;
}
// quadrant of a quadrant texture at uv (u, v already x tiling), or -1 when a bilinear tap could reach another quadrant
function quadAt(u, v) {
  const fu = (u - Math.floor(u)) * 8, fv = (v - Math.floor(v)) * 8;
  const inside = f => (f >= 0.6 && f <= 3.4) || (f >= 4.6 && f <= 7.4);
  if (!inside(fu) || !inside(fv)) return -1;
  return (fv >= 4 ? 2 : 0) + (fu >= 4 ? 1 : 0);
}
// the hand value of a pixel of the synthetic map at the given tiling, or null when its texels are not certain
function handPixel(i, j, g, box, tiling) {
  const sx = g.cell, sy = (g.meta && g.meta.cellY) || g.cell;
  const x = box[0] + (i + 0.5) * sx, y = box[1] + (j + 0.5) * sy, mid = (box[0] + box[2]) / 2;
  if (x >= mid) return { q: null, v: expectL1(TEX.c, TEX.d, alpha1(x, box), VC) };
  // the four samples (ss = 2) must all read the same quadrant: then the texel is the quadrant colour exactly
  let q = null;
  for (const ox of [-0.25, 0.25]) for (const oy of [-0.25, 0.25]) {
    const k = quadAt(tiling * (x + ox * sx) / UVS, tiling * -(y + oy * sy) / UVS);
    if (k < 0 || (q !== null && k !== q)) return null;
    q = k;
  }
  return { q, v: expectL1(QUAD.a[q], QUAD.b[q], alpha0(y, box), VC) };
}
function checkHand(g, box, tiling, what) {
  let worst = 0, over = 0, checked = 0;
  const seen = new Set();
  for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) {
    const h = handPixel(i, j, g, box, tiling);
    if (!h) continue;
    checked++;
    if (h.q !== null) seen.add(h.q);
    const got = px(g, i, j);
    for (let c = 0; c < 3; c++) { const e = Math.abs(got[c] - h.v[c]); if (e > worst) worst = e; if (e > 1) over++; }
    if (got[3] !== 255) over++;
  }
  ok(over === 0 && checked > g.w * g.h * 0.6 && seen.size === 4,
    what + ': every certain pixel within 1 level of the hand value (' + checked + ' checked, quadrants ' + [...seen].sort() + ', worst ' + worst.toFixed(3) + ', ' + over + ' over)');
}

// C0 on a synthetic minimap: roads and water of a gtype grid, drawn into the minimap shifted by a known (dx, dy)
function testC0() {
  const C0 = require('../c0');
  const N = 64;
  const RECTS = { road: [[5, 20, 60, 23], [40, 8, 43, 58], [12, 50, 30, 52]], water: [[10, 30, 22, 42]] };
  const inR = (r, x, y) => x >= r[0] && x < r[2] && y >= r[1] && y < r[3];
  const gt = { name: 'gtype', w: N, h: N, cell: 1, ox: 0, oy: 0, etype: 'u8', sample: 'cell', scale: 1, offset: 0, nodata: null, meta: {}, data: new Uint8Array(N * N) };
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = i + 0.5, y = j + 0.5;
    gt.data[j * N + i] = RECTS.water.some(r => inR(r, x, y)) ? 3 : RECTS.road.some(r => inR(r, x, y)) ? 7 : 1;
  }
  const cover = (list, u, v, dx, dy) => {
    let s = 0;
    for (const r of list) {
      const w = Math.min(u + 1, r[2] + dx) - Math.max(u, r[0] + dx), h = Math.min(v + 1, r[3] + dy) - Math.max(v, r[1] + dy);
      if (w > 0 && h > 0) s += w * h;
    }
    return Math.min(1, s);
  };
  const lumAt = (u, v, dx, dy) => Math.round(120 + 60 * cover(RECTS.road, u, v, dx, dy) - 60 * cover(RECTS.water, u, v, dx, dy));
  const doc = { key: 't/c0', boxes: { world: [0, 0, N, N] }, pictures: { minimap: { file: 'minimap.dds' } } };
  for (const [dx, dy, used] of [[0, 0, true], [3, -2, false], [0.5, 0, true]]) {
    const rgba = new Uint8ClampedArray(N * N * 4);
    for (let v = 0; v < N; v++) for (let u = 0; u < N; u++) { const L = lumAt(u, v, dx, dy), k = (v * N + u) * 4; rgba[k] = rgba[k + 1] = rgba[k + 2] = L; rgba[k + 3] = 255; }
    const dds = S.dds32(N, N, (i, j) => Array.from(rgba.subarray((j * N + i) * 4, (j * N + i) * 4 + 4)));
    const src = S.memSrc({ 'resource/map/t/c0/minimap.dds': dds });
    // register() by itself on the class fractions and the minimap luminance
    const fr = { x0: 0, y0: 0, sx: 1, sy: 1, W: N, H: N };
    const masks = [t => t === 7, t => t >= 3 && t <= 5].map(test => {
      const frac = C0.fraction(gt, fr, test), idx = [];
      for (let k = 0; k < frac.length; k++) if (frac[k] >= 0.5) idx.push(k);
      return { idx, frac };
    });
    const Lm = new Float64Array(N * N);
    for (let k = 0; k < N * N; k++) Lm[k] = C0.lum(rgba[k * 4], rgba[k * 4 + 1], rgba[k * 4 + 2]);
    const reg = C0.register(Lm, N, N, masks, 8);
    ok(reg && Math.abs(reg.dx - dx) <= 0.1 && Math.abs(reg.dy - dy) <= 0.1, 'c0 register: shift (' + dx + ', ' + dy + ') found as (' + (reg && reg.dx.toFixed(3)) + ', ' + (reg && reg.dy.toFixed(3)) + ')');
    // c0() end to end with an identical picture: gain 1
    const pic = { name: 'pic.l1', w: N, h: N, cell: 1, ox: 0, oy: 0, etype: 'rgba8', sample: 'cell', scale: 1, offset: 0, nodata: null, meta: {}, data: rgba };
    const r = C0.c0(src, doc, pic, { grids: { gtype: gt } });
    ok(Math.abs(r.dx - dx) <= 0.1 && Math.abs(r.dy - dy) <= 0.1 && r.used === used && (used ? r.why === null : r.why === 'RENDER_C0_OFFSET'),
      'c0 (' + dx + ', ' + dy + '): dx ' + r.dx + ' dy ' + r.dy + ' used ' + r.used + ' ' + r.why);
    ok(r.gain === 1 && r.ssim > 0.99 && r.size.join() === N + ',' + N, 'c0 (' + dx + ', ' + dy + '): identical picture gives gain 1 (' + r.gain + '), ssim ' + r.ssim);
    if (!dx && !dy) {
      ok(r.classMeans[7] && r.classMeans[7].minimap[0] === 180 && r.classMeans[3].minimap[0] === 60 && r.classMeans[1].minimap[0] === 120 && r.classMeans[7].pic[0] === 180,
        'c0 class means: road 180, water 60, ground 120 (' + JSON.stringify(r.classMeans) + ')');
    }
  }
  // a picture at half brightness: gain 2
  {
    const rgba = new Uint8ClampedArray(N * N * 4), half = new Uint8ClampedArray(N * N * 4);
    for (let v = 0; v < N; v++) for (let u = 0; u < N; u++) {
      const L = lumAt(u, v, 0, 0), k = (v * N + u) * 4;
      rgba[k] = rgba[k + 1] = rgba[k + 2] = L; rgba[k + 3] = 255;
      half[k] = half[k + 1] = half[k + 2] = L / 2; half[k + 3] = 255;
    }
    const src = S.memSrc({ 'resource/map/t/c0/minimap.dds': S.dds32(N, N, (i, j) => Array.from(rgba.subarray((j * N + i) * 4, (j * N + i) * 4 + 4))) });
    const pic = { name: 'pic.l1', w: N, h: N, cell: 1, ox: 0, oy: 0, etype: 'rgba8', sample: 'cell', scale: 1, offset: 0, nodata: null, meta: {}, data: half };
    const r = C0.c0(src, doc, pic, { grids: { gtype: gt } });
    ok(Math.abs(r.gain - 2) <= 0.01 && r.used === true, 'c0: a picture at half the brightness gives gain 2 (' + r.gain + ')');
  }
  // GoH: never a reference, no picture needed
  const rg = C0.c0(S.memSrc({}, { target: 'goh' }), doc, null, {});
  ok(rg.used === false && rg.why === 'RENDER_C0_GOH', 'c0 GoH without a picture: used false, RENDER_C0_GOH');
}

async function testL1() {
  const sy = synthFiles();
  const src = S.memSrc(sy.files);
  const doc = { key: sy.key, boxes: { world: sy.box }, stack: { hash: 'synthetic' } };
  const r = await R.l1(src, doc, { size: 64, made: 'x' });
  ok(r.grid.w === 64 && r.grid.h === 32 && r.grid.name === 'pic.l1' && r.grid.etype === 'rgba8', 'l1 synthetic: 64 x 32 rgba8');
  ok(r.sidecar.gaps.length === 0, 'l1 synthetic: no gaps, got ' + r.sidecar.gaps);
  checkHand(r.grid, sy.box, 2.0, 'l1 synthetic (tiling 2.0)');
  // one pixel by hand: (9, 4) is world (5.9375, 2.8125); u = 2 x 5.9375 / 40 = 0.297 -> texel column 2.4 (left half);
  // v = 2 x -2.8125 / 40 = -0.1406 -> 0.859 -> texel row 6.9 (lower half): quadrant 2 of a and b; alpha = 128 x 0.28125 / 255.
  // Tiling 1 would read column 1.2 and row 7.4 (an edge), v of the other sign row 1.1 (upper half), u and v swapped
  // column 6.9 (right half): each a different texel.
  {
    const h = handPixel(9, 4, r.grid, sy.box, 2.0);
    ok(h && h.q === 2 && px(r.grid, 9, 4).slice(0, 3).every((v, c) => Math.abs(v - h.v[c]) <= 1), 'l1 pixel (9, 4): quadrant 2 of a and b, ' + px(r.grid, 9, 4) + ' ~ ' + (h && h.v.map(Math.round)));
    // the same pixel with the vertex colour bytes read R G B instead of B G R would be off in red and blue
    const sw = expectL1(QUAD.a[2], QUAD.b[2], alpha0(sy.box[1] + 4.5 * r.grid.cell, sy.box), [VC[2], VC[1], VC[0]]);
    ok(Math.abs(px(r.grid, 9, 4)[0] - sw[0]) > 2, 'l1 pixel (9, 4): vertex colour byte order is told apart (' + px(r.grid, 9, 4)[0] + ' vs ' + sw[0].toFixed(1) + ')');
  }
  // the mip levels from texel density (trilinear): uv0 = world / 1, 8 x 8 texture with 4 levels of 4 solid colours; texels
  // per sample = 8 x 2 (tiling) x 1 x 0.3125 = 5 -> lod log2 5 = 2.32: level 2 (blue) x (1 - f) + level 3 (yellow) x f,
  // f = 21/64. A one-level rule (blue alone) is told apart: its blue is 97, the blend's about 65.
  {
    const MIPC = [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0]];
    const files = synthFiles({ uvs: 1 }).files;
    files['resource/map/test/syn/mtl0.mtl'] = S.mtl('/texture/rtest/m', '/texture/rtest/m');
    files['resource/map/test/syn/mtl1.mtl'] = S.mtl('/texture/rtest/m', '/texture/rtest/m');
    files['resource/texture/rtest/m.dds'] = S.ddsMips(8, 8, MIPC.map(c => c.concat(255)));
    const rm = await R.l1(S.memSrc(files), doc, { size: 64, made: 'x' });
    const lo = L1.lodFor(8, 4, 2.0, 1, 0.3125);
    const tex = MIPC[2].map((v, c) => v * (1 - lo.f) + MIPC[3][c] * lo.f);
    const e = expectL1(tex, tex, 0.5, VC), one = expectL1(MIPC[2], MIPC[2], 0.5, VC);
    const near = (p, x) => p.slice(0, 3).every((v, c) => Math.abs(v - x[c]) <= 1);
    ok(lo.a === 2 && lo.b === 3 && lo.f === 21 / 64 && L1.mipFor(8, 4, 2.0, 1, 0.3125) === 2 && rm.sidecar.gaps.length === 0 &&
      [5, 20, 40, 60].every(i => near(px(rm.grid, i, 16), e)) && !near(px(rm.grid, 5, 16), one),
      'l1 mip from texel density: levels 2 and 3, f ' + lo.f + ' (' + px(rm.grid, 5, 16) + ' ~ ' + e.map(Math.round) + ', one level ' + one.map(Math.round) + ')');
    // the kernel's own two-level form (tex, tex2, mf) gives the same picture as the premixed texture l1 sends
    const pr = L1.prepare(S.memSrc(files), doc, { size: 64 });
    const solid = (w, c) => ({ name: 'tex', w, h: w, cell: 1, ox: 0, oy: 0, etype: 'rgba8', sample: 'cell', scale: 1, offset: 0, nodata: null, meta: {},
      data: new Uint8ClampedArray(w * w * 4).map((_, k) => (k & 3) === 3 ? 255 : c[k & 3]) });
    pr.grids.set('lv2.mvg', solid(2, MIPC[2])); pr.grids.set('lv3.mvg', solid(1, MIPC[3]));
    const n = pr.args.texs.length, args = Object.assign({}, pr.args, { texs: pr.args.texs.concat(['lv2.mvg', 'lv3.mvg']), y0: 0, y1: pr.args.H, outName: 'two.mvg' });
    args.parts = pr.args.parts.map(p => Object.assign({}, p, { layers: p.layers.map(L => Object.assign({}, L, { tex: n, tex2: n + 1, mf: lo.f })) }));
    const io = { readGrid: f => pr.grids.get(f), writeGrid: (f, g) => pr.grids.set(f, g), progress: null };
    require('../l1tile').run({ args }, io);
    const two = pr.grids.get('two.mvg');
    let worst = 0;
    for (let k = 0; k < two.data.length; k++) worst = Math.max(worst, Math.abs(two.data[k] - rm.grid.data[k]));
    ok(worst <= 1, 'l1tile two-level form (tex2, mf) = the premixed texture within 1 level (worst ' + worst + ')');
  }
  // lodFor and fileLevels by hand: magnified -> level 0 alone; past the chain -> the last level alone; an exact power of two
  // -> one level; a file whose header says 4 mips but whose bytes stop after 2 holds 2 (the rest is box-filtered)
  {
    const m = L1.lodFor(8, 4, 2, 1 / 40, 0.3125), t = L1.lodFor(8, 4, 2, 1, 100), p = L1.lodFor(8, 4, 2, 1, 0.25);
    const full = S.ddsMips(8, 8, [[1, 2, 3, 255], [4, 5, 6, 255], [7, 8, 9, 255], [9, 9, 9, 255]]);
    const info = require('../../../lib/model/dds').parse(full);
    const cutLen = 128 + 8 * 8 * 4 + 4 * 4 * 4 + 3;
    ok(m.a === 0 && m.b === 0 && m.f === 0 && t.a === 3 && t.b === 3 && t.f === 0 && p.a === 2 && p.b === 2 && p.f === 0 &&
      L1.chainLevels(8, 8) === 4 && L1.chainLevels(16, 4) === 5 && L1.fileLevels(info, full.length) === 4 && L1.fileLevels(info, cutLen) === 2,
      'lodFor: magnified, past the chain, a power of two; chainLevels; fileLevels counts the levels the bytes hold (' + JSON.stringify([m, t, p]) + ')');
  }
  // fault 1 (dot grid): a one-level 8 x 8 checker (black and white texels) seen at 5 texels per sample: the box-filtered chain
  // gives its mean colour, flat over the whole picture. The same checker magnified (uv0 = world / 40) does show texels:
  // the flatness check below tells the two apart.
  {
    const CK = (i, j) => ((i + j) & 1 ? [250, 250, 250, 255] : [0, 0, 0, 255]);
    const ckFiles = uvs => {
      const f = synthFiles({ uvs }).files;
      f['resource/map/test/syn/mtl0.mtl'] = S.mtl('/texture/rtest/k', '/texture/rtest/k');
      f['resource/map/test/syn/mtl1.mtl'] = S.mtl('/texture/rtest/k', '/texture/rtest/k');
      f['resource/texture/rtest/k.dds'] = S.dds32(8, 8, CK);
      return f;
    };
    const spread = g => { let lo = 255, hi = 0; for (let k = 0; k < g.w * g.h; k++) { lo = Math.min(lo, g.data[k * 4 + 1]); hi = Math.max(hi, g.data[k * 4 + 1]); } return hi - lo; };
    const rk = await R.l1(S.memSrc(ckFiles(1)), doc, { size: 64, made: 'x' });
    const e = expectL1([125, 125, 125], [125, 125, 125], 0.5, VC);
    ok(rk.sidecar.gaps.length === 0 && spread(rk.grid) <= 1 && Math.abs(px(rk.grid, 30, 10)[1] - e[1]) <= 1,
      'l1 checker far below its resolution: the mean colour, flat (green ' + px(rk.grid, 30, 10)[1] + ' ~ ' + e[1].toFixed(1) + ', spread ' + spread(rk.grid) + ')');
    const rkm = await R.l1(S.memSrc(ckFiles(40)), doc, { size: 64, made: 'x' });
    ok(spread(rkm.grid) > 40, 'l1 checker magnified: texels show (spread ' + spread(rkm.grid) + '), so the flatness check can fail');
    // GoH flecks (second pass): the same checker with sharpened file mips (levels 1 to 3 hold white flecks over grey, as
    // the shipped GoH ground mips do). GoH reads level 0 and box-filters the rest: the checker's mean, flat. The file mips
    // (AS2 rule, or o.mips 'file') put the flecks in: brighter and spotty. At 6.25 texels per sample (tiling 2.5) the
    // pair is levels 2 and 3.
    const SH = [CK, (i, j) => ((i + j) % 3 ? [125, 125, 125, 255] : [255, 255, 255, 255]), (i, j) => (i + j ? [125, 125, 125, 255] : [255, 255, 255, 255]), [220, 220, 220, 255]];
    const shFiles = () => { const f = ckFiles(1); f['resource/texture/rtest/k.dds'] = S.ddsMips(8, 8, SH); return f; };
    const gohSrc = () => S.memSrc(shFiles(), { target: 'goh', exe: 'goh' });
    const rb = await R.l1(gohSrc(), doc, { size: 64, made: 'x' });
    const rfm = await R.l1(gohSrc(), doc, { size: 64, made: 'x', mips: 'file' });
    const pb = L1.prepare(gohSrc(), doc, { size: 64 }), tg = [...pb.grids.values()].find(g => g.name === 'tex');
    ok(rb.stats.mips === 'box' && rfm.stats.mips === 'file' && tg && /^box/.test(tg.meta.from) && tg.meta.mip === 2 &&
      spread(rb.grid) <= 1 && Math.abs(px(rb.grid, 30, 10)[1] - e[1]) <= 1 && px(rfm.grid, 30, 10)[1] - e[1] > 5,
      'l1 GoH sharpened file mips: the box chain gives the mean, flat (green ' + px(rb.grid, 30, 10)[1] + ' ~ ' + e[1].toFixed(1) + ', spread ' + spread(rb.grid) +
      '); the file mips are brighter (' + px(rfm.grid, 30, 10)[1] + ')');
    // AS2 keeps the file mips (the engine reads them as stored)
    const ra = L1.prepare(S.memSrc(shFiles()), doc, { size: 64 }), ta = [...ra.grids.values()].find(g => g.name === 'tex');
    ok(ra.stats.mips === 'file' && ta && /^file/.test(ta.meta.from), 'l1 MoW:AS2 reads the file mips (' + (ta && ta.meta.from) + ')');
  }
  // map-scale detail rule (DETAIL in l1.js): a ground texture that repeats is drawn flat when the picture is too coarse to
  // show one repeat as more than a dot, and keeps its contrast when the picture is fine. One texture in all four slots, so
  // the vertex alpha does not matter; repeat = uvs / tiling world units.
  {
    const TIL = { mowas2: 2, goh: 2.5 };
    const repFiles = (box, repeatU, til, tex) => {
      const f = synthFiles({ box, uvs: repeatU * til }).files;
      f['resource/map/test/syn/mtl0.mtl'] = S.mtl('/texture/rtest/r', '/texture/rtest/r');
      f['resource/map/test/syn/mtl1.mtl'] = S.mtl('/texture/rtest/r', '/texture/rtest/r');
      f['resource/texture/rtest/r.dds'] = tex;
      return f;
    };
    const spread2 = g => { let lo = 255, hi = 0; for (let j = 2; j < g.h - 2; j++) for (let i = 2; i < g.w - 2; i++) { const v = g.data[(j * g.w + i) * 4 + 1]; lo = Math.min(lo, v); hi = Math.max(hi, v); } return hi - lo; };
    const same = (a, b) => a.data.length === b.data.length && a.data.every((v, k) => v === b.data[k]);
    const run = (tgt, box, size, repeatU, tex, o) => {
      const d = { key: 'test/syn', boxes: { world: box } };
      return R.l1(S.memSrc(repFiles(box, repeatU, TIL[tgt], tex), { target: tgt, exe: tgt }), d, Object.assign({ size, made: 'x' }, o || {}));
    };
    ok(L1.detailKeep(0.5) === 1 && L1.detailKeep(1) === 1 && L1.detailKeep(2) === 0.5 && L1.detailKeep(4) === 0 && L1.detailKeep(8) === 0 &&
      L1.detailKeep(8, 'gpu') === 1 && L1.detailLow(1600, 11, 341.33) === 5 && L1.detailLow(512, 10, 150) === 5 && L1.detailLow(64, 7, 0) === 6 &&
      L1.detailLow(8, 4, 4) === 3,
      'detailKeep: 1 at 1 u/px or finer, 0 at 4 u/px or coarser, log-linear between, 1 with detail gpu; detailLow: the coarsest level with texels of 10 u or less');
    // the task case: a high-contrast stripe texture (8 x 8, half black, half white) repeating every 4 u
    const stripe = S.dds32(8, 8, i => (i < 4 ? [250, 250, 250, 255] : [0, 0, 0, 255]));
    for (const tgt of ['mowas2', 'goh']) {
      const far = await run(tgt, [0, 0, 512, 256], 64, 4, stripe);   // 8 u per pixel
      const near = await run(tgt, [0, 0, 32, 16], 64, 4, stripe);    // 0.5 u per pixel
      ok(far.sidecar.gaps.length === 0 && spread2(far.grid) <= 2 && far.stats.keep === 0 && near.stats.keep === 1 && spread2(near.grid) > 60,
        'l1 ' + tgt + ' texture repeating every 4 u: flat at 8 u/px (spread ' + spread2(far.grid) + '), contrast at 0.5 u/px (spread ' + spread2(near.grid) + ')');
    }
    // a strong soft blotch (one cosine bump per 64 u repeat, luminance std above DETAIL.sigma): the GPU rule (detail gpu)
    // still shows it at 8 u/px as a regular weave; the map rule takes it out; at 0.5 u/px both rules give the same bytes
    const bump = S.dds32(64, 64, (i, j) => { const v = Math.round(135 - 115 * Math.cos(2 * Math.PI * (i + 0.5) / 64) * Math.cos(2 * Math.PI * (j + 0.5) / 64)); return [v, v, v, 255]; });
    // a weak texture (std below DETAIL.sigma): the map rule leaves it as the GPU rule draws it, at any scale
    const weak = S.dds32(64, 64, (i, j) => { const v = Math.round(120 + 8 * Math.cos(2 * Math.PI * (i + 0.5) / 64) + 6 * ((i * 7 + j * 13) % 5 - 2)); return [v, v, v, 255]; });
    for (const tgt of ['mowas2', 'goh']) {
      const bm = await run(tgt, [0, 0, 1024, 512], 128, 64, bump), bg = await run(tgt, [0, 0, 1024, 512], 128, 64, bump, { detail: 'gpu' });
      const nm = await run(tgt, [0, 0, 64, 32], 128, 64, bump), ng = await run(tgt, [0, 0, 64, 32], 128, 64, bump, { detail: 'gpu' });
      ok(bm.stats.detail === 'map' && bg.stats.detail === 'gpu' && spread2(bg.grid) > 60 && spread2(bm.grid) * 4 < spread2(bg.grid) && same(nm.grid, ng.grid) && spread2(nm.grid) > 60,
        'l1 ' + tgt + ' strong blotch every 64 u: at 8 u/px the map rule flattens it (spread ' + spread2(bm.grid) + ' against gpu ' + spread2(bg.grid) +
        '); at 0.5 u/px the same bytes as gpu (spread ' + spread2(nm.grid) + ')');
      const wm = await run(tgt, [0, 0, 1024, 512], 128, 64, weak), wg = await run(tgt, [0, 0, 1024, 512], 128, 64, weak, { detail: 'gpu' });
      const hm = await run(tgt, [0, 0, 256, 128], 128, 64, weak), hg = await run(tgt, [0, 0, 256, 128], 128, 64, weak, { detail: 'gpu' });
      ok(same(wm.grid, wg.grid) && same(hm.grid, hg.grid) && hm.stats.keep === 0.5,
        'l1 ' + tgt + ' weak texture: the map rule gives the same bytes as gpu at 8 and 2 u/px');
      // sidecar and stats fields of the rule (render VERSION 4): present in both modes; gpu never changed; a weak texture
      // the rule leaves whole is not listed
      const fieldsOk = (x, d) => ['detail', 'keep', 'detailTextures', 'detailChanged'].every(k => k in x.sidecar && k in x.stats) && x.sidecar.detail === d &&
        x.sidecar.keep === x.stats.keep && JSON.stringify(x.sidecar.detailTextures) === JSON.stringify(x.stats.detailTextures) && x.sidecar.detailChanged === x.stats.detailChanged &&
        Array.isArray(x.sidecar.detailTextures) && x.sidecar.detailTextures.every(t => Object.keys(t).join() === 'name,k' && t.k < 1);
      ok(fieldsOk(bm, 'map') && fieldsOk(bg, 'gpu') && fieldsOk(nm, 'map') && fieldsOk(wm, 'map') &&
        bm.sidecar.detailChanged === true && bm.sidecar.keep === 0 && bm.sidecar.detailTextures.length === 1 && bm.sidecar.detailTextures[0].name === '/texture/rtest/r' &&
        bg.sidecar.detailChanged === false && bg.sidecar.keep === 1 && bg.sidecar.detailTextures.length === 0 &&
        nm.sidecar.detailChanged === false && nm.sidecar.detailTextures.length === 0 && wm.sidecar.detailChanged === false && wm.sidecar.detailTextures.length === 0 &&
        bm.sidecar.approx === bg.sidecar.approx,
        'l1 ' + tgt + ' sidecar detail fields: map at 8 u/px lists ' + JSON.stringify(bm.sidecar.detailTextures) + ', gpu [] and detailChanged false, fine or weak [], approx unchanged');
    }
    // two strong textures named out of order in the materials: detailTextures sorted by name, one entry per name, k < 1
    {
      const box = [0, 0, 1024, 512];
      const bump2 = S.dds32(64, 64, (i, j) => { const v = Math.round(135 + 110 * Math.cos(2 * Math.PI * (i + 0.5) / 64)); return [v, v, v, 255]; });
      const f = repFiles(box, 64, TIL.mowas2, bump);
      f['resource/map/test/syn/mtl0.mtl'] = S.mtl('/texture/rtest/s', '/texture/rtest/r');
      f['resource/map/test/syn/mtl1.mtl'] = S.mtl('/texture/rtest/r', '/texture/rtest/s');
      f['resource/texture/rtest/s.dds'] = bump2;
      const d = { key: 'test/syn', boxes: { world: box } };
      const two = await R.l1(S.memSrc(f, { target: 'mowas2', exe: 'mowas2' }), d, { size: 128, made: 'x' });
      const tg = await R.l1(S.memSrc(f, { target: 'mowas2', exe: 'mowas2' }), d, { size: 128, made: 'x', detail: 'gpu' });
      const names = two.sidecar.detailTextures.map(t => t.name);
      ok(names.join() === '/texture/rtest/r,/texture/rtest/s' && two.sidecar.detailTextures.every(t => t.k >= 0 && t.k < 1) && two.sidecar.detailChanged === true &&
        tg.sidecar.detailTextures.length === 0 && tg.sidecar.detailChanged === false && tg.sidecar.detail === 'gpu',
        'l1 detailTextures sorted by name, one per texture (' + JSON.stringify(two.sidecar.detailTextures) + '); gpu [] (' + JSON.stringify(tg.sidecar.detailTextures) + ')');
    }
  }
  // the GoH box chain's level 2 of a DXT1 texture is the 4 x 4 block means, without decoding level 0: equal to the box
  // chain of the decoded texels within 1 level, for four-colour and three-colour (index 3 black) blocks. At size 100 the
  // texel density is 8 x 2.5 x 1 x 0.2 = 4 per sample: lod 2 exactly, one level.
  {
    const dxt1 = (w, h, blk) => {
      const bw = w >> 2, bh = h >> 2, b = Buffer.alloc(128 + bw * bh * 8);
      b.write('DDS ', 0, 'latin1'); b.writeUInt32LE(124, 4); b.writeUInt32LE(0x81007, 8); b.writeUInt32LE(h, 12); b.writeUInt32LE(w, 16);
      b.writeUInt32LE(bw * bh * 8, 20); b.writeUInt32LE(1, 28); b.writeUInt32LE(32, 76); b.writeUInt32LE(0x4, 80); b.write('DXT1', 84, 'latin1'); b.writeUInt32LE(0x1000, 108);
      for (let k = 0; k < bw * bh; k++) { const [c0, c1, bits] = blk(k); b.writeUInt16LE(c0, 128 + k * 8); b.writeUInt16LE(c1, 130 + k * 8); b.writeUInt32LE(bits >>> 0, 132 + k * 8); }
      return b;
    };
    const BL = [[0xf800, 0x001f, 0x1b6c93e4], [0x07e0, 0xffff, 0xe4e4e4e4], [0xffe0, 0x001f, 0xffffffff], [0x8410, 0xffe0, 0x0f0f5a5a]];
    const f = synthFiles({ uvs: 1 }).files;
    f['resource/map/test/syn/mtl0.mtl'] = S.mtl('/texture/rtest/x', '/texture/rtest/x');
    f['resource/map/test/syn/mtl1.mtl'] = S.mtl('/texture/rtest/x', '/texture/rtest/x');
    f['resource/texture/rtest/x.dds'] = dxt1(8, 8, k => BL[k]);
    const pr = L1.prepare(S.memSrc(f, { target: 'goh', exe: 'goh' }), doc, { size: 100 });
    const tg = [...pr.grids.values()].find(g => g.name === 'tex');
    const dds = require('../../../lib/model/dds'), d0 = dds.decode(f['resource/texture/rtest/x.dds']);
    const ref = dds.downscale(d0.rgba, 8, 8, 2).rgba;
    let worst = 0, three = 0;
    if (tg) for (let k = 0; k < 4; k++) for (let c = 0; c < 3; c++) worst = Math.max(worst, Math.abs(tg.data[k * 4 + c] - ref[k * 4 + c]));
    for (const [c0, c1] of BL) if (c0 <= c1) three++;
    ok(tg && tg.w === 2 && tg.h === 2 && tg.meta.mip === 2 && tg.meta.from === 'box' && worst <= 1 && three === 2 && pr.gaps.size === 0,
      'l1 GoH DXT1 level 2 from block means = the box chain of the decoded texels (worst ' + worst + ', ' + three + ' three-colour blocks)');
    // a texture whose bytes stop short still gives RENDER_TEXTURE_BAD (the block path does not hide it)
    f['resource/texture/rtest/x.dds'] = f['resource/texture/rtest/x.dds'].subarray(0, 128 + 20);
    const pc = L1.prepare(S.memSrc(f, { target: 'goh', exe: 'goh' }), doc, { size: 100 });
    ok(pc.gaps.has('RENDER_TEXTURE_BAD'), 'l1 GoH DXT1 cut short: RENDER_TEXTURE_BAD (' + [...pc.gaps] + ')');
  }
  // stats count the GoH Global Diffuse among the textures read (the flat colour still comes from the layer textures only)
  {
    const f = synthFiles().files;
    f['resource/map/test/syn/map'] = Buffer.from('{map {GlobalTexture {Diffuse "/texture/rtest/g"}}}\r\n', 'latin1');
    f['resource/texture/rtest/g.dds'] = S.dds32(4, 4, [128, 128, 128, 255]);
    const pg = L1.prepare(S.memSrc(f, { target: 'goh', exe: 'goh' }), doc, { size: 64 });
    ok(pg.args.global && pg.stats.textures === 5 && pg.stats.texturesRead === 5, 'l1 GoH stats: 4 layer textures + the Global Diffuse, all 5 read (' + pg.stats.textures + ' / ' + pg.stats.texturesRead + ')');
  }
  // fault 2 (stair steps): part 1 alpha a plane in x and y (0.5 x (x - mid) / 20 + 0.5 x y / 20); vertex alpha is
  // interpolated barycentrically, so every pixel of part 1 is the plane value. A nearest-vertex weight (steps at the
  // vertex Voronoi borders) would miss by far more than the tolerance; the check is shown to fail on such steps.
  {
    const mid = 20;
    const plane = (x, y) => 0.5 * (x - mid) / 20 + 0.5 * y / 20;
    const sp = synthFiles({ alpha1: (x, y) => Math.round(255 * plane(x, y)) });
    const rp = await R.l1(S.memSrc(sp.files), doc, { size: 64, made: 'x' });
    const g = rp.grid, cell = g.cell;
    const rampOk = get => {
      let worst = 0;
      for (let j = 0; j < g.h; j++) for (let i = 33; i < g.w; i++) {
        const x = (i + 0.5) * cell, y = (j + 0.5) * cell, v = expectL1(TEX.c, TEX.d, plane(x, y), VC);
        for (let c = 0; c < 3; c++) worst = Math.max(worst, Math.abs(get(i, j, x, y)[c] - v[c]));
      }
      return worst;
    };
    const wAll = rampOk((i, j) => px(g, i, j));
    const vx = [20, 30, 40], vy = [0, 10, 20], snap = (t, vs) => vs.reduce((b, s) => (Math.abs(s - t) < Math.abs(b - t) ? s : b), vs[0]);
    const wStep = rampOk((i, j, x, y) => expectL1(TEX.c, TEX.d, Math.round(255 * plane(snap(x, vx), snap(y, vy))) / 255, VC));
    ok(wAll <= 1.5 && wStep > 5, 'l1 two-layer weights across part 1: a smooth plane, barycentric (worst ' + wAll.toFixed(2) + '; nearest-vertex steps would be ' + wStep.toFixed(1) + ' off)');
  }
  // fault 4 (edge lines): a world box wider than the mesh by 2 u on every side: the cut rim takes the colour of the nearest
  // mesh pixel, alpha 255, no gap. A world box 100 u wider to the west: pixels more than 64 u past the mesh stay transparent.
  {
    const rw = await R.l1(src, { key: sy.key, boxes: { world: [-2, -2, 42, 22] }, stack: { hash: 'synthetic' } }, { size: 64, made: 'x' });
    const g = rw.grid;
    let opaque = 0;
    for (let k = 0; k < g.w * g.h; k++) if (g.data[k * 4 + 3] === 255) opaque++;
    const ia = Math.ceil(2 / g.cell), jm = Math.floor(g.h / 2);
    ok(opaque === g.w * g.h && rw.sidecar.gaps.length === 0 && rw.stats.edgeFilled > 0 && rw.stats.edgeTransparent === 0 &&
      px(g, 0, jm).join() === px(g, 2 * ia - 1, jm).join() && px(g, 1, jm).join() === px(g, 2 * ia - 2, jm).join(),
      'l1 edge fill: world box 2 u past the mesh, all ' + g.w * g.h + ' pixels opaque, ' + rw.stats.edgeFilled + ' filled, edge pixels = their mirror inside the mesh (' + px(g, 0, jm) + ' / ' + px(g, 2 * ia - 1, jm) + ')');
    // a band several pixels wide past the mesh is the mirror of the mesh beside it, not one column copied over (the old
    // clamp drew a frame of streaks): world box 10 u past on the east of a mesh whose part 1 alpha ramps in x
    const re = await R.l1(src, { key: sy.key, boxes: { world: [0, 0, 50, 20] }, stack: { hash: 'synthetic' } }, { size: 100, made: 'x' });
    const ge = re.grid, ib = Math.floor(40 / ge.cell) - 1, je = Math.floor(ge.h / 2);
    let mirrored = true, differ = 0;
    for (let i = ib + 1; i < Math.min(ge.w, ib + 16); i++) {
      if (px(ge, i, je).join() !== px(ge, 2 * ib + 1 - i, je).join()) mirrored = false;
      if (px(ge, i, je).join() !== px(ge, ib, je).join()) differ++;
    }
    ok(mirrored && differ >= 10 && re.stats.edgeTransparent === 0,
      'l1 edge fill: a band ' + (ge.w - 1 - ib) + ' px wide is the mirror of the mesh beside it, ' + differ + ' of its pixels differ from the edge pixel (no streaks)');
    const rf = await R.l1(src, { key: sy.key, boxes: { world: [-100, 0, 40, 20] }, stack: { hash: 'synthetic' } }, { size: 140, made: 'x' });
    const gf = rf.grid, far = Math.floor(30 / gf.cell), near = Math.ceil(50 / gf.cell);
    ok(px(gf, far, 5)[3] === 0 && px(gf, near, 5)[3] === 255 && rf.stats.edgeTransparent > 0 && !rf.sidecar.gaps.includes('RENDER_UNCOVERED'),
      'l1 edge fill stops at ' + L1.FILL_U + ' u: 70 u past the mesh transparent, 50 u past filled (' + rf.stats.edgeFilled + ' filled, ' + rf.stats.edgeTransparent + ' transparent)');
  }
  // sidecar
  const sc = r.sidecar;
  const keys = ['v', 'layer', 'w', 'h', 'box', 'cell', 'rowOrder', 'target', 'stackHash', 'mapHashes', 'rung', 'env', 'gaps', 'approx', 'brightness', 'made', 'size'];
  ok(keys.every(k => k in sc) && sc.layer === 'pic.l1' && sc.rung === 'l1' && sc.env === 'clean_daylight' && sc.brightness === 'fitted' && sc.approx === false && sc.size === 64 && sc.target === 'mowas2', 'l1 sidecar fields');
  ok(sc.box.join() === sy.box.join() && /^[0-9a-f]{40}$/.test(sc.mapHashes['map.ply']) && sc.mapHashes['mtl0.mtl'], 'l1 sidecar box and mapHashes');
  // determinism: again, other band split, same bytes
  const r2 = await R.l1(src, doc, { size: 64, band: 7, made: 'x' });
  ok(sha1(r.grid.data) === sha1(r2.grid.data), 'l1: same bytes for another band split');
  // GoH form: tiling 2.5, brightness unverified, approx
  const rg = await R.l1(S.memSrc(sy.files, { target: 'goh', exe: 'goh' }), doc, { size: 64, made: 'x' });
  ok(rg.sidecar.brightness === 'unverified' && rg.sidecar.approx === true && rg.grid.meta.tiling === 2.5, 'l1 GoH: tiling 2.5, unverified');
  checkHand(rg.grid, sy.box, 2.5, 'l1 GoH synthetic (tiling 2.5)');
  // seeded defects
  const miss = synthFiles({ drop: ['d'] });
  const rm = await R.l1(S.memSrc(miss.files), doc, { size: 64, made: 'x' });
  const mean = ['a', 'b', 'c'].map(texMean).reduce((s, t) => s.map((v, c) => v + t[c] / 3), [0, 0, 0]).map(Math.round);
  const xr = 39.5, ir = Math.floor(xr / rm.grid.cell), expM = expectL1(TEX.c, mean, alpha1((ir + 0.5) * rm.grid.cell, sy.box), VC);
  ok(rm.sidecar.gaps.includes('RENDER_TEXTURE_MISSING') && rm.sidecar.approx === true, 'defect texture missing: gap RENDER_TEXTURE_MISSING, never a throw');
  ok(px(rm.grid, ir, 10).slice(0, 3).every((v, c) => Math.abs(v - expM[c]) <= 1), 'defect texture missing: flat mean colour ' + px(rm.grid, ir, 10) + ' ~ ' + expM.map(Math.round));
  const um = synthFiles({ mat1: 'mtl9.mtl' });
  const ru = await R.l1(S.memSrc(um.files), doc, { size: 64, made: 'x' });
  ok(ru.sidecar.gaps.includes('RENDER_MATERIAL_MISSING') && px(ru.grid, 50, 10)[3] === 255, 'defect unknown material: gap RENDER_MATERIAL_MISSING, part drawn flat');
  // a quote never closed: in a part's mtl file, in the GoH .materials library, in an .ebm, in the GoH map head
  const mats = require('../mats');
  ok(mats.tree('{material {layer bump {diffuse "/texture/rtest/c}}}') === null && mats.tree('{a "b"} "x') !== null && mats.safeEnd('{a b"c}') === 7,
    'mats.tree: null for an unclosed quote in the first block only, carry token rules');
  const uq = synthFiles({ mtl1Text: '{material\r\n\t{layer bump\r\n\t\t{diffuse "/texture/rtest/c}\r\n\t}\r\n}\r\n' });
  let rq = null, rqErr = null;
  try { rq = await R.l1(S.memSrc(uq.files), doc, { size: 64, made: 'x' }); } catch (e) { rqErr = e; }
  ok(rq && rq.sidecar.gaps.includes('RENDER_MATERIAL_BAD') && px(rq.grid, 50, 10)[3] === 255 && (rq.sidecar.notes || []).some(n => /never closed/.test(n)),
    'defect mtl with an unclosed quote: gap RENDER_MATERIAL_BAD, part drawn flat, never a throw (' + (rqErr && rqErr.message) + ')');
  {
    const f = synthFiles({ mat1: 'mtl5.mtl' }).files;
    f['resource/map/test/syn/.materials'] = Buffer.from('{mtl5 {layer bump {diffuse "/texture/rtest/c}}}\r\n', 'latin1');
    f['resource/map/test/syn/map'] = Buffer.from('{map {GlobalTexture {Diffuse "/texture/rtest/c}}}\r\n', 'latin1');
    f['resource/map/test/syn/mtl0.mtl'] = S.mtl('/texture/rtest/e', '/texture/rtest/b');
    f['resource/texture/rtest/e.ebm'] = Buffer.from('{reference "/texture/rtest/a}\r\n', 'latin1');
    let rb = null, err = null;
    try { rb = await R.l1(S.memSrc(f, { target: 'goh', exe: 'goh' }), doc, { size: 64, made: 'x' }); } catch (e) { err = e; }
    ok(rb && ['RENDER_MATERIAL_BAD', 'RENDER_TEXTURE_BAD'].every(g => rb.sidecar.gaps.includes(g)) && px(rb.grid, 50, 10)[3] === 255 && px(rb.grid, 5, 10)[3] === 255,
      'defect GoH .materials, .ebm and map head with an unclosed quote: gaps RENDER_MATERIAL_BAD and RENDER_TEXTURE_BAD, drawn, never a throw (' + (rb ? rb.sidecar.gaps : err && err.message) + ')');
  }
  const cut = synthFiles({ cut: 40 });
  ok(await rejectsCode(R.l1(S.memSrc(cut.files), doc, { size: 64 }), 'MV_FAULT') === true, 'defect map.ply cut short: MV_FAULT (exit 2)');
  ok(await rejectsCode(R.l1(src, doc, { size: 0 }), 'MV_USAGE') === true, 'defect size 0: MV_USAGE');
  const none = Object.assign({}, sy.files); delete none['resource/map/test/syn/map.ply'];
  ok(await rejectsCode(R.l1(S.memSrc(none), doc, { size: 64 }), 'MV_NOT_FOUND') === true, 'no map.ply: MV_NOT_FOUND (exit 3)');
  // the kernel through the pool (render/l1tile run as `mapviz work` children) gives the same bytes
  let poolLib = null;
  try { poolLib = require(path.join(MVDIR, 'jobs/pool')); } catch (e) { poolLib = null; }
  if (!poolLib) console.log('skip l1 through the pool: jobs part not present');
  else {
    const wd = path.join(W, 'pool');
    fs.mkdirSync(wd, { recursive: true });
    const rp = await R.l1(src, doc, { size: 64, band: 10, pool: 2, workDir: wd, made: 'x' });
    ok(sha1(rp.grid.data) === sha1(r.grid.data) && rp.stats.pool === 2, 'l1 through the pool (2 children): same bytes as in process');
    // one task by hand: node mapviz.js work render/l1tile --task <file>
    const pr = L1.prepare(src, doc, { size: 64 });
    const td = path.join(W, 'work');
    fs.mkdirSync(td, { recursive: true });
    for (const [f, g] of pr.grids) gridfile.write(path.join(td, f), g);
    const task = { v: 1, kernel: 'render/l1tile', inputs: [...pr.grids.keys()], args: Object.assign({}, pr.args, { y0: 0, y1: 32, outName: 'band-0.mvg' }), out: td };
    fs.writeFileSync(path.join(W, 'task.json'), JSON.stringify(task));
    const c = cli(['work', 'render/l1tile', '--task', path.join(W, 'task.json')]);
    const band = c.code === 0 ? gridfile.read(path.join(td, 'band-0.mvg')) : null;
    ok(c.code === 0 && band && sha1(band.data) === sha1(r.grid.data), 'mapviz work render/l1tile: exit 0, the same band (' + c.code + ' ' + c.err.trim().slice(-200) + ')');
    const bad = Object.assign({}, task, { args: Object.assign({}, task.args, { tris: 'nothing.mvg' }) });
    fs.writeFileSync(path.join(W, 'task-bad.json'), JSON.stringify(bad));
    ok(cli(['work', 'render/l1tile', '--task', path.join(W, 'task-bad.json')]).code === 2, 'mapviz work: a bad task exits 2');
  }
}

// ------------------------------------------------------------------ CLI
async function testCli() {
  const as2 = fixture('as2'), goh = fixture('goh');
  const common = f => ['--target', f.target, '--game', f.gameDir, '--mod-dir', f.modDirs[0], '--map', f.map];
  const o1 = path.join(W, 'cli-l0');
  let c = cli(['render', 'l0'].concat(common(as2), ['--out', o1, '--json']));
  ok(c.code === 0 && ['pic.l0.mvg', 'pic.l0.json', 'reads.json'].every(f => fs.existsSync(path.join(o1, f))), 'cli l0 fixture: exit 0, three files (' + c.code + ' ' + c.err.trim() + ')');
  let j = null; try { j = JSON.parse(c.out); } catch (e) { j = null; }
  ok(j && j.w === 128 && j.h === 96, 'cli l0 --json: 128 x 96');
  const rd = JSON.parse(fs.readFileSync(path.join(o1, 'reads.json'), 'utf8'));
  ok(rd.v === 1 && Array.isArray(rd.inputs) && rd.inputs.length > 0, 'cli l0 reads.json lists inputs');
  ok(!fs.readdirSync(o1).some(f => /\.(dds|png)$/i.test(f)), 'cli l0 writes no BC1 and no preview');
  c = cli(['render', 'l0'].concat(common(goh), ['--size', '100', '--out', path.join(W, 'cli-l0g')]));
  ok(c.code === 0, 'cli l0 GoH fixture --size 100: exit 0 (' + c.err.trim() + ')');
  c = cli(['render', 'l0'].concat(common(as2), ['--mode', 'no_such_mode', '--out', path.join(W, 'cli-l0m')]));
  ok(c.code === 3, 'cli l0 unknown mode: exit 3, got ' + c.code);
  c = cli(['render', 'l0'].concat(common(as2), ['--size', '0', '--out', path.join(W, 'cli-l0z')]));
  ok(c.code === 2, 'cli l0 size 0: exit 2, got ' + c.code);
  c = cli(['render', 'l1'].concat(common(as2), ['--out', path.join(W, 'cli-l1none'), '--json']));
  let e = null; try { e = JSON.parse(c.out).error; } catch (x) { e = null; }
  ok(c.code === 3 && e && e.code === 'MV_NOT_FOUND' && e.detail && e.detail.code === 'RENDER_PLY_MISSING', 'cli l1 on the fixture (no map.ply, README 10.2): exit 3');
  console.log('note: the fixture has no ground mesh (README 10.2): L1 on the fixture is checked with a map.ply this test writes');
  // a map.ply written into a copy of the fixture's mod folder: l1 exit 0, then a missing texture: exit 1 with gaps
  // and a part material with a quote never closed: exit 1 with a gap, never exit 2
  for (const [name, drop, want, mtl1Text] of [['ok', [], 0], ['gap', ['d'], 1], ['badmtl', [], 1, '{material {layer bump {diffuse "/texture/rtest/c}}}']]) {
    const f = fxInfo(path.join(W, 'fx-ply-' + name), 'as2');
    const sy = synthFiles({ key: 'multi/mv_fixture', box: [-640, -480, 640, 480], drop, mtl1Text });
    S.writeFiles(f.modDirs[0], sy.files);
    const out = path.join(W, 'cli-l1-' + name);
    c = cli(['render', 'l1'].concat(common(f), ['--size', '128', '--out', out, '--json']));
    ok(c.code === want && fs.existsSync(path.join(out, 'pic.l1.mvg')) && fs.existsSync(path.join(out, 'pic.l1.json')), 'cli l1 ' + name + ': exit ' + want + ', got ' + c.code + ' ' + c.err.trim() + c.out.trim().slice(0, 200));
    if (name === 'badmtl') { let jb = null; try { jb = JSON.parse(c.out); } catch (x) { jb = null; } ok(jb && jb.gaps.includes('RENDER_MATERIAL_BAD'), 'cli l1 badmtl: gap RENDER_MATERIAL_BAD'); }
    if (name === 'ok') {
      const sc = JSON.parse(fs.readFileSync(path.join(out, 'pic.l1.json'), 'utf8'));
      const bw = sc.box[2] - sc.box[0], bh = sc.box[3] - sc.box[1];
      ok(sc.w === 128 && sc.h === Math.round(bh * 128 / bw) && sc.layer === 'pic.l1' && sc.gaps.length === 0, 'cli l1 sidecar: 128 wide over the world box, got ' + sc.w + 'x' + sc.h);
      c = cli(['render', 'c0'].concat(common(f), ['--in', out, '--out', path.join(W, 'cli-c0'), '--json']));
      let r0 = null; try { r0 = JSON.parse(c.out); } catch (x) { r0 = null; }
      ok(c.code === 1 && r0 && r0.used === false && r0.why === 'RENDER_C0_NO_MINIMAP' && fs.existsSync(path.join(W, 'cli-c0', 'c0.json')), 'cli c0 fixture (no minimap): exit 1, used false (' + c.code + ')');
      // --detail (render VERSION 4): gpu through the cli = o.detail 'gpu' in process, byte for byte; the default is map;
      // the sidecar and --json stats carry the rule's fields; a bad word and --detail on another command exit 2
      const og = path.join(W, 'cli-l1-gpu');
      c = cli(['render', 'l1'].concat(common(f), ['--size', '128', '--detail', 'gpu', '--out', og, '--json']));
      let jg = null; try { jg = JSON.parse(c.out); } catch (x) { jg = null; }
      const mk = require(path.join(MVDIR, 'lib/mapkit'));
      const isrc = mk.source({ target: f.target, game: f.gameDir, modDirs: f.modDirs });
      const idoc = mk.doc(isrc, f.map, { entities: false });
      const ig = await R.l1(isrc, idoc, { size: 128, detail: 'gpu', made: 'x' }), im = await R.l1(isrc, idoc, { size: 128, made: 'x' });
      const cg = c.code === 0 ? gridfile.read(path.join(og, 'pic.l1.mvg')) : null, cm = gridfile.read(path.join(out, 'pic.l1.mvg'));
      const scg = c.code === 0 ? JSON.parse(fs.readFileSync(path.join(og, 'pic.l1.json'), 'utf8')) : {};
      ok(c.code === 0 && cg && sha1(cg.data) === sha1(ig.grid.data) && sha1(cm.data) === sha1(im.grid.data) && scg.detail === 'gpu' && scg.detailChanged === false &&
        Array.isArray(scg.detailTextures) && scg.detailTextures.length === 0 && sc.detail === 'map' && sc.keep === im.stats.keep &&
        JSON.stringify(sc.detailTextures) === JSON.stringify(im.sidecar.detailTextures) && sc.detailChanged === im.sidecar.detailChanged &&
        jg && jg.stats && jg.stats.detail === 'gpu' && jg.stats.detailChanged === false && Array.isArray(jg.stats.detailTextures),
        'cli l1 --detail gpu: same bytes as o.detail gpu in process, default = map in process; sidecar and --json stats fields (' + c.code + ' ' + c.err.trim().slice(-200) + ')');
      c = cli(['render', 'l1'].concat(common(f), ['--size', '128', '--detail', 'fine', '--out', path.join(W, 'cli-l1-badd'), '--json']));
      let eb = null; try { eb = JSON.parse(c.out).error; } catch (x) { eb = null; }
      ok(c.code === 2 && eb && eb.code === 'MV_USAGE' && !fs.existsSync(path.join(W, 'cli-l1-badd', 'pic.l1.mvg')), 'cli l1 --detail fine: refused, exit 2 MV_USAGE, got ' + c.code);
      c = cli(['render', 'l0'].concat(common(f), ['--detail', 'gpu', '--out', path.join(W, 'cli-l0-badd')]));
      ok(c.code === 2, 'cli l0 --detail: refused (an l1 flag), exit 2, got ' + c.code);
    }
  }
  // GoH: the fixture has no map.ply; c0 draws no picture for GoH, so it still answers 'never a reference' (exit 1, not 3)
  c = cli(['render', 'c0'].concat(common(goh), ['--size', '64', '--out', path.join(W, 'cli-c0g'), '--json']));
  let rg = null; try { rg = JSON.parse(c.out); } catch (x) { rg = null; }
  ok(c.code === 1 && rg && rg.why === 'RENDER_C0_GOH' && rg.used === false && rg.pic === null && fs.existsSync(path.join(W, 'cli-c0g', 'c0.json')),
    'cli c0 GoH without map.ply: never a reference, no picture drawn, exit 1 (' + c.code + ' ' + c.err.trim() + ')');
  c = cli(['render', 'l9'].concat(common(as2), ['--out', path.join(W, 'x')]));
  ok(c.code === 2, 'cli unknown render command: exit 2');
  c = cli(['render', 'l0'].concat(common(as2), ['--out', path.join(as2.gameDir, 'out')]));
  ok(c.code === 6, 'cli --out inside the install: exit 6, got ' + c.code);
}

// one REPORT.json for the part (render.md 1 ruling): the R2b and R3 reports are merged in and gone; README 9.5 shape
function testReport() {
  const dir = path.join(__dirname, '..');
  ok(!fs.existsSync(path.join(dir, 'REPORT-R2b.json')) && !fs.existsSync(path.join(dir, 'REPORT-R3.json')), 'REPORT-R2b.json and REPORT-R3.json are merged and removed');
  let r = null;
  try { r = JSON.parse(fs.readFileSync(path.join(dir, 'REPORT.json'), 'utf8')); } catch (e) { r = null; }
  ok(r && r.tool === 'mapviz render' && ['id', 'rows', 'files', 'tests', 'real', 'specIssues', 'libGaps', 'tags', 'notes', 'indexLine', 'fixRows'].every(k => k in r), 'REPORT.json has the README 9.5 fields');
  if (!r) return;
  const own = fs.readdirSync(dir).filter(f => /\.js$/.test(f)).map(f => 'tools/mapviz/render/' + f);
  ok(own.every(f => r.files.includes(f)) && r.files.every(f => fs.existsSync(path.join(dir, '../../..', f))), 'REPORT.json files list every render module and only files that exist');
  ok(r.indexLine.includes('render l0|l1|c0|l2|pack|l3|l4 '),'REPORT.json indexLine names the seven commands');
  ok(['MAPVIZ_RENDER_L3_GOH_LM', 'MAPVIZ_RENDER_L4_TONE', 'MAPVIZ_RENDER_GOH_OCEAN'].every(k => r.fixRows.some(x => x.includes(k))) && !r.fixRows.some(x => /L2_JOBROW|L2a not built/.test(x)),
    'REPORT.json fixRows hold the l2, l3 and l4 rows, none out of date');
  ok(r.fixRows.every(x => /^- .+ \| .+ \| .+/.test(x)), 'every fix row has the form - what | where | how to check');
}

(async () => {
  testReport();
  const gfile = path.join(__dirname, 'l0.golden.json');
  let golden = null;
  try { golden = JSON.parse(fs.readFileSync(gfile, 'utf8')); } catch (e) { golden = null; }
  testPlan();
  const got = testL0(UPDATE ? null : golden);
  if (UPDATE || !golden) { fs.writeFileSync(gfile, JSON.stringify(got, null, 1) + '\n'); console.log('wrote ' + gfile); }
  testL0Nodata();
  await testL1();
  testC0();
  await testCli();
  if (fail) { console.log(fail + ' failed, ' + pass + ' passed (work folder kept: ' + W + ')'); process.exit(1); }
  // the temp work folder made here goes on a pass (a folder named on the command line is kept)
  if (!process.argv[2]) { try { fs.rmSync(W, { recursive: true, force: true }); } catch (e) { /* temp */ } }
  console.log('PASS mapviz render (' + pass + ')');
})().catch(e => { console.log('FAIL mapviz render: ' + (e && e.stack || e)); process.exit(1); });

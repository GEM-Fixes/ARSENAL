// paint staff drawing (see index.js for the layer order). Pure: reads only input and opts, writes only the new grid.
// No Math.random, no clock, no file; noise comes from paper.hash / paper.grain seeded by world position and opts.seed.
// Pixel (i, j) of the grid: row j = min world y first, centre (x0 + (i + 0.5) sx, y0 + (j + 0.5) sy) (paint 4.1).
// Screen px for the canvas calls: px from the west edge, py from the north edge (paint 4.6), through canvas.toPx.
// Author: Imperator_Aug (ARSENAL, ia-1e47c40b)
'use strict';

const BANDS = 6;              // hypsometric bands over the height range (art.md A: 5-7 bands)
const SHADE_FLAT = 128;       // raster hillshade: flat ground = 128 (kterrain SHADE.flat) [V]
const WOOD_WASH = 0.6;        // wood wash over the tint
const WOOD_EDGE = 0.3;        // woodStamp toward the wood edge (edge darkening, art.md A)
const COUNTRY_FILL = 0.45;    // a country road's fill: road colour toward the paper
const DASH_U = 40;            // country road casing dash, world u (2 m on, 2 m off)
const STAMP_U = 30;           // tree stamp radius in world u (1.5 m), clamped to 1..6 px
const SHADOW_PX = 1.5;        // building shadow offset (south-east, screen px)
const LABEL_PX = 10;          // contour numeral height
const NUMERIC = ['u8', 'i8', 'u16', 'i16', 'u32', 'i32', 'f32'];

function mvErr(code, msg, detail) {
  const M = require('../../mapviz');
  return new M.MvError(code, 'paint staff: ' + msg, detail);
}

// a bad input handed from code (layer, frame, palette entry): MV_FAULT PAINT_DRAW_BAD (coordinator ruling R-d)
const BAD = { code: 'PAINT_DRAW_BAD' };

function checkGrid(g, name, need) {
  if (!g) {
    if (need) throw mvErr('MV_NOT_FOUND', 'no ' + name + ' layer', { code: 'PAINT_NO_HEIGHT' });
    return null;
  }
  if (typeof g !== 'object' || !NUMERIC.includes(g.etype) || !(Number.isInteger(g.w) && g.w > 0) || !(Number.isInteger(g.h) && g.h > 0) ||
    !(g.cell > 0) || !Number.isFinite(g.ox) || !Number.isFinite(g.oy) || !g.data || g.data.length !== g.w * g.h) {
    throw mvErr('MV_FAULT', 'layer ' + name + ' is not a numeric grid (etype ' + (g && g.etype) + ')', BAD);
  }
  // NaN in a float grid: raster refuses it at contour time (RASTER_NAN), so refuse it here for every picture size
  if (g.etype === 'f32') {
    const d = g.data;
    for (let k = 0; k < d.length; k++) if (d[k] !== d[k]) throw mvErr('MV_FAULT', 'layer ' + name + ' holds NaN at column ' + (k % g.w) + ', row ' + ((k / g.w) | 0) + ' (use nodata for no value)', BAD);
  }
  return g;
}

function checkFrame(f) {
  if (!f || !(Number.isInteger(f.W) && f.W > 0) || !(Number.isInteger(f.H) && f.H > 0) ||
    !(f.sx > 0) || !(f.sy > 0) || !Number.isFinite(f.x0) || !Number.isFinite(f.y0)) {
    throw mvErr('MV_FAULT', 'input.frame is not a picture frame', BAD);
  }
  return f;
}

function checkMask(m, f, what) {
  if (!m || m.length !== f.W * f.H) throw mvErr('MV_FAULT', what + ' mask has the wrong size', { code: 'PAINT_DRAW_BAD' });
  return m;
}

// colour helpers on [r, g, b, a] arrays, integer rounding
function lerp(a, b, t) { return [0, 1, 2].map(c => Math.round(a[c] + (b[c] - a[c]) * t)).concat([255]); }
function rampLut(C, stops, n) {
  const S = stops.map(s => ({ at: s.at, c: C.color(s.color) })).sort((p, q) => p.at - q.at);
  const out = [];
  for (let b = 0; b < n; b++) {
    const t = (b + 0.5) / n;
    let k = 0;
    while (k < S.length - 2 && t > S[k + 1].at) k++;
    const a = S[k], z = S[Math.min(k + 1, S.length - 1)];
    const u = z.at > a.at ? Math.min(1, Math.max(0, (t - a.at) / (z.at - a.at))) : 0;
    out.push(lerp(a.c, z.c, u));
  }
  return out;
}

// progress in rows of work: 7 sweeps of H rows (masks, height, shade, ground, water, road, grain) + 40 (contours, objects)
function ticker(opts, total) {
  const tick = opts && typeof opts.tick === 'function' ? opts.tick : () => {};
  let done = 0;
  return { total, step(n) { done = Math.min(total, done + n); tick(done, total); }, end() { tick(total, total); } };
}
const ROWS = 32;              // rows of work between two ticks (paint 4.3: a tick at least every ~100 ms)

// the shared helpers on one row band of the frame: same pixel centres, a frame of hb rows starting at row j0
function bandInput(input, j0, hb) {
  const f = input.frame;
  return { frame: Object.assign({}, f, { H: hb, y0: f.y0 + j0 * f.sy }), layers: input.layers, vectors: input.vectors,
    palette: input.palette, doc: input.doc };
}

// off-ground, wood, water and road masks by row bands of ROWS (the shared helpers take no tick)
function maskPass(I, input, f, T) {
  const W = f.W, H = f.H, n = W * H;
  const off = new Uint8Array(n), wood = new Uint8Array(n), water = new Uint8Array(n), road = new Uint8Array(n);
  let from = 'none';
  for (let j0 = 0; j0 < H; j0 += ROWS) {
    const hb = Math.min(ROWS, H - j0), bi = bandInput(input, j0, hb), at = j0 * W;
    off.set(checkMask(I.offGround(bi), bi.frame, 'off-ground'), at);
    wood.set(checkMask(I.woodMask(bi), bi.frame, 'wood'), at);
    const wm = I.waterMask(bi);
    water.set(checkMask(wm && wm.mask, bi.frame, 'water'), at);
    from = wm.from;
    road.set(checkMask(I.roadMask(bi), bi.frame, 'road'), at);
    T.step(hb);
  }
  return { off, wood, wm: { mask: water, from }, road };
}

// a grid on the frame: bilinear at pixel centres, NaN = no value (the loop of input.toFrame 'bilinear', by row bands)
function onFrame(I, grid, f, T) {
  const W = f.W, H = f.H, out = new Float32Array(W * H), XC = new Float64Array(W);
  for (let i = 0; i < W; i++) XC[i] = f.x0 + (i + 0.5) * f.sx;
  for (let j = 0; j < H; j++) {
    const y = f.y0 + (j + 0.5) * f.sy;
    for (let i = 0; i < W; i++) { const v = I.sample(grid, XC[i], y, 'bilinear'); out[j * W + i] = v === null ? NaN : v; }
    if ((j & (ROWS - 1)) === ROWS - 1 || j === H - 1) T.step((j & (ROWS - 1)) + 1);
  }
  return out;
}

// paper grain (the loop of paper.grain, scale 8, by row bands so a cancel lands within ROWS rows)
function grainPass(P, grid, f, amount, seed, T) {
  const a = Number(amount) || 0, W = grid.w, H = grid.h, d = grid.data, fo = { scale: 8, seed };
  for (let j = 0; j < H; j++) {
    if (a) {
      const y = f.y0 + (j + 0.5) * f.sy;
      for (let i = 0; i < W; i++) {
        const k = 1 + a * (2 * P.fbm(f.x0 + (i + 0.5) * f.sx, y, fo) - 1);
        const p = (j * W + i) * 4;
        d[p] = Math.round(d[p] * k); d[p + 1] = Math.round(d[p + 1] * k); d[p + 2] = Math.round(d[p + 2] * k);
      }
    }
    if ((j & (ROWS - 1)) === ROWS - 1 || j === H - 1) T.step((j & (ROWS - 1)) + 1);
  }
}

// ---------------------------------------------------------------- the passes

function groundPass(ctx) {
  const { I, C, input, f, grid, pal, off, wood, T } = ctx;
  const height = input.layers.height, shade = input.layers.shade || null;
  const range = I.heightRange(input);
  const lo = range && Number.isFinite(range.min) ? range.min : 0, hi = range && Number.isFinite(range.max) ? range.max : lo;
  const span = hi - lo;
  const lut = rampLut(C, pal.tint, BANDS);
  const paper = C.color(pal.paper), woodC = C.color(pal.wood), woodS = C.color(pal.woodStamp);
  const light = C.color(pal.relief.light), dark = C.color(pal.relief.dark), str = Number(pal.relief.strength) || 0;
  const W = f.W, H = f.H, d = grid.data;
  const hf = onFrame(I, height, f, T);
  let sf = null;
  if (shade && str > 0) sf = onFrame(I, shade, f, T); else T.step(H);
  // band colour after the wood wash and edge: 3 variants per band (plain, wood, wood edge)
  const V = [];
  for (const c of lut) { const w = lerp(c, woodC, WOOD_WASH); V.push(c, w, lerp(w, woodS, WOOD_EDGE)); }
  const kd = str / SHADE_FLAT, kl = str / (255 - SHADE_FLAT);
  let woodPx = 0, offPx = 0, noH = 0;
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const k = j * W + i, o = k * 4;
      let r, gg, b;
      let h = off[k] ? NaN : hf[k];
      if (h !== h && !off[k]) {
        // past the last lattice point (the east and north edge of a lattice frame, README 4.2): the cell's own point
        const n = I.sample(height, f.x0 + (i + 0.5) * f.sx, f.y0 + (j + 0.5) * f.sy, 'nearest');
        if (n !== null) h = n;
      }
      if (h !== h) {
        if (off[k]) offPx++; else noH++;
        r = paper[0]; gg = paper[1]; b = paper[2];
      } else {
        const t = span > 0 ? (h - lo) / span : 0.5;
        let v = 3 * Math.min(BANDS - 1, Math.max(0, Math.floor(t * BANDS)));
        if (wood[k]) {
          woodPx++;
          v += (i > 0 && !wood[k - 1]) || (i < W - 1 && !wood[k + 1]) || (j > 0 && !wood[k - W]) || (j < H - 1 && !wood[k + W]) ? 2 : 1;
        }
        const c = V[v];
        r = c[0]; gg = c[1]; b = c[2];
        const s = sf ? sf[k] : NaN;
        if (s === s) {
          if (s < SHADE_FLAT) { const a = kd * (SHADE_FLAT - s); r += (dark[0] - r) * a; gg += (dark[1] - gg) * a; b += (dark[2] - b) * a; }
          else if (s > SHADE_FLAT) { const a = kl * (s - SHADE_FLAT); r += (light[0] - r) * a; gg += (light[1] - gg) * a; b += (light[2] - b) * a; }
        }
      }
      d[o] = Math.round(r); d[o + 1] = Math.round(gg); d[o + 2] = Math.round(b); d[o + 3] = 255;
    }
    if ((j & (ROWS - 1)) === ROWS - 1 || j === H - 1) T.step((j & (ROWS - 1)) + 1);
  }
  return { lo, hi, woodPx, offPx, noHeight: noH };
}

function fmtLevel(v) { return Number.isInteger(v) ? String(v) : (Math.round(v * 10) / 10).toFixed(1); }

// a numeral label: canvas.digits draws the decimal point as a solid dot of radius max(1, size / 8) with its halo, so
// 2.5 reads as 2.5. Returns the screen centres of the dots (the canvas '.' glyph's dot point), for the tests.
function label(C, grid, text, x, y, o) {
  const size = o.size, dots = [];
  if (text.includes('.')) {
    const G = C.GLYPHS, gap = 0.18;            // canvas GAP (glyph advance rule of canvas.digits)
    let cx = (o.align === 'center' ? x - C.textWidth(text, size) / 2 : x);
    for (let q = 0; q < text.length; q++) {
      if (q) cx += gap * size;
      const d = G[text[q]].dot;
      if (d) dots.push([cx + d[0] * size, y - size / 2 + d[1] * size]);
      cx += G[text[q]].w * size;
    }
  }
  C.digits(grid, text, x, y, o);
  return dots;
}

// is world (x, y) on a no-ground pixel of the frame (outside the frame: no)
function offAt(f, off, x, y) {
  const i = Math.floor((x - f.x0) / f.sx), j = Math.floor((y - f.y0) / f.sy);
  return i >= 0 && j >= 0 && i < f.W && j < f.H && off[j * f.W + i] === 1;
}

function contourPass(ctx) {
  const { I, C, input, f, grid, pal, opts, palette, off, T } = ctx;
  // the call of input.contours (same interval and options) made here so raster's o.tick reaches opts.tick
  const R = require('../../lib/raster'), h = input.layers.height;
  const res = R.contours(h, { interval: R.contourInterval(h), tick: () => T.step(0) });
  T.step(10);
  const hc = (palette.height && palette.height.contour) || {};
  const thin = Math.max(Number(hc.width) || 0.75, opts.minStroke > 1 ? opts.minStroke : 0);
  const thick = Math.max(Number(hc.indexWidth) || 1.5, thin);
  const line = C.color(pal.contour), idx = C.color(pal.contourIndex);
  let lines = 0, labels = 0;
  for (const l of res.lines || []) {
    if (!l.pts || l.pts.length < 2) continue;
    C.strokePath(grid, l.pts.map(p => C.toPx(f, p[0], p[1])), l.index ? thick : thin, l.index ? idx : line, { cap: 'round' });
    if ((++lines & 63) === 0) T.step(0);
  }
  const halo = hc.halo ? C.color(hc.halo) : null;
  for (const lb of res.labels || []) {
    const p = C.toPx(f, lb.x, lb.y);
    if (p[0] < 0 || p[1] < 0 || p[0] >= f.W || p[1] >= f.H || offAt(f, off, lb.x, lb.y)) continue;
    label(C, grid, fmtLevel(lb.level), p[0], p[1], { size: LABEL_PX, rgba: idx, halo, align: 'center' });
    labels++;
  }
  return { interval: res.interval === undefined ? null : res.interval, lines, labels };
}

function waterPass(ctx, wm) {
  const { C, f, grid, pal, palette, opts, off, T } = ctx;
  const W = f.W, H = f.H, d = grid.data, m = wm.mask;
  const fills = Array.isArray(pal.waterBands) && pal.waterBands.length >= 3 ? pal.waterBands.slice(0, 3).map(C.color) : [0, 1, 2].map(() => C.color(pal.water));
  const shore = C.color(pal.waterLine);
  const count = [0, 0, 0];
  for (let k = 0; k < W * H; k++) {
    if (k % (ROWS * W) === 0 && k) T.step(0);
    const w = m[k];
    if (!w || off[k]) continue;
    count[w - 1]++;
    const c = fills[w - 1], o = k * 4;
    d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
  }
  if (!(count[0] + count[1] + count[2])) T.step(H);
  else {
    const bands = (palette.water && palette.water.bands) || [];
    const hatchOf = code => {
      const src = code === 3 ? palette.water && palette.water.drown && palette.water.drown.hatch : (bands.find(b => b.code === code) || {}).hatch;
      if (!src) return null;
      if (!opts.thumb) return src;
      return Object.assign({}, src, { width: Math.max(Number(src.width) || 1, opts.minStroke), gap: Math.round((Number(src.gap) || 6) * 1.5) });
    };
    for (const code of [1, 2, 3]) {
      if (!count[code - 1]) continue;
      const h = hatchOf(code);
      // the mask callback runs row by row; it ticks at the start of every ROWS-th row
      if (h) C.hatchMask(grid, (i, j) => { if (!i && (j & (ROWS - 1)) === ROWS - 1) T.step(0); return m[j * W + i] === code && !off[j * W + i]; }, h);
    }
    // shore line: a water pixel next to dry ground (off-ground and the frame edge are not shore)
    const wide = opts.thumb && opts.minStroke > 1;
    const isDry = q => !m[q] && !off[q];
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) {
        const k = j * W + i;
        if (!m[k] || off[k]) continue;
        let edge = (i > 0 && isDry(k - 1)) || (i < W - 1 && isDry(k + 1)) || (j > 0 && isDry(k - W)) || (j < H - 1 && isDry(k + W));
        if (!edge && wide) edge = (i > 1 && isDry(k - 2)) || (i < W - 2 && isDry(k + 2)) || (j > 1 && isDry(k - 2 * W)) || (j < H - 2 && isDry(k + 2 * W));
        if (!edge) continue;
        const o = k * 4;
        d[o] = shore[0]; d[o + 1] = shore[1]; d[o + 2] = shore[2];
      }
      if ((j & (ROWS - 1)) === ROWS - 1 || j === H - 1) T.step((j & (ROWS - 1)) + 1);
    }
  }
  return count;
}

function dilate(m, W, H) {
  const out = new Uint8Array(m.length);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i;
    let v = m[k];
    if (!v) {
      for (let dj = -1; dj <= 1 && !v; dj++) for (let di = -1; di <= 1 && !v; di++) {
        const a = i + di, b = j + dj;
        if (a >= 0 && b >= 0 && a < W && b < H && m[b * W + a]) v = m[b * W + a];
      }
    }
    out[k] = v;
  }
  return out;
}

function roadPass(ctx, rm) {
  const { C, f, grid, pal, opts, off, T } = ctx;
  const W = f.W, H = f.H, d = grid.data;
  const m = opts.thumb ? dilate(rm, W, H) : rm;
  const road = C.color(pal.road), casing = C.color(pal.roadCasing);
  const country = lerp(road, C.color(pal.paper), COUNTRY_FILL);
  const count = [0, 0, 0];
  for (let j = 0; j < H; j++) {
    const y = f.y0 + (j + 0.5) * f.sy;
    for (let i = 0; i < W; i++) {
      const k = j * W + i, r = m[k];
      if (!r || off[k]) continue;
      count[r - 1]++;
      const edge = i === 0 || i === W - 1 || j === 0 || j === H - 1 || !m[k - 1] || !m[k + 1] || !m[k - W] || !m[k + W];
      let c;
      if (edge) {
        if (r === 2 && !opts.thumb) {
          const x = f.x0 + (i + 0.5) * f.sx;
          c = (Math.floor((x + y) / DASH_U) & 1) === 0 ? casing : country;
        } else c = casing;
      } else c = r === 2 ? country : road;
      const o = k * 4;
      d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2];
    }
    if ((j & (ROWS - 1)) === ROWS - 1 || j === H - 1) T.step((j & (ROWS - 1)) + 1);
  }
  return count;
}

function objectPass(ctx) {
  const { I, C, P, input, f, grid, pal, opts, off, T } = ctx;
  const line = C.color(pal.buildingLine), fill = C.color(pal.building);
  const shadow = [line[0], line[1], line[2], 102];
  const stroke = opts.thumb ? Math.max(1, opts.minStroke) : 1;
  const px = pts => pts.map(p => C.toPx(f, p[0], p[1]));
  const ok = pts => Array.isArray(pts) && pts.length >= 3 && pts.every(p => Number.isFinite(p[0]) && Number.isFinite(p[1]));
  // no ground there (README R24): an object whose centroid is on a no-ground pixel is not drawn
  const offObj = pts => { let x = 0, y = 0; for (const p of pts) { x += p[0]; y += p[1]; } return offAt(f, off, x / pts.length, y / pts.length); };
  let walls = 0, buildings = 0, stamps = 0, n = 0;
  const beat = () => { if ((++n & 63) === 0) T.step(0); };
  for (const w of I.walls(input)) {
    beat();
    if (!ok(w.pts) || offObj(w.pts)) continue;
    const q = px(w.pts);
    C.fillPoly(grid, q, line);
    C.strokePath(grid, q, stroke, line, { closed: true });
    walls++;
  }
  for (const b of I.buildings(input)) {
    beat();
    if (!ok(b.pts) || offObj(b.pts)) continue;
    const q = px(b.pts);
    C.fillPoly(grid, q.map(p => [p[0] + SHADOW_PX, p[1] + SHADOW_PX]), shadow);
    C.fillPoly(grid, q, fill);
    C.strokePath(grid, q, stroke, line, { closed: true });
    buildings++;
  }
  if (!opts.thumb) {
    const st = C.color(pal.woodStamp);
    const sc = [st[0], st[1], st[2], 192];
    const base = Math.min(6, Math.max(1, STAMP_U / Math.max(f.sx, f.sy)));
    for (const t of I.treePoints(input)) {
      beat();
      const p = C.toPx(f, t.x, t.y);
      if (p[0] < -8 || p[1] < -8 || p[0] > f.W + 8 || p[1] > f.H + 8 || offAt(f, off, t.x, t.y)) continue;
      const hsh = P.hash(Math.round(t.x), Math.round(t.y), opts.seed | 0) >>> 0;
      C.fillCircle(grid, p[0], p[1], base * (0.8 + 0.4 * (hsh % 1024) / 1023), sc);
      stamps++;
    }
  }
  return { walls, buildings, treeStamps: stamps };
}

// no ground there: paint every no-ground pixel back to plain paper (contour ends, shadows and object edges that cross it)
function offPass(ctx) {
  const { C, f, grid, pal, off } = ctx;
  const paper = C.color(pal.paper), d = grid.data;
  for (let k = 0; k < f.W * f.H; k++) if (off[k]) { const o = k * 4; d[o] = paper[0]; d[o + 1] = paper[1]; d[o + 2] = paper[2]; d[o + 3] = 255; }
}

// ---------------------------------------------------------------- draw

function draw(input, opts) {
  if (!input || typeof input !== 'object') throw mvErr('MV_FAULT', 'no input', BAD);
  opts = Object.assign({ thumb: false, minStroke: 1, maxSymbols: null, contours: true, seed: 1 }, opts || {});
  const f = checkFrame(input.frame);
  const layers = input.layers || {};
  checkGrid(layers.height, 'height', true);
  for (const n of ['shade', 'gtype', 'material', 'water.band', 'water.drown']) checkGrid(layers[n], n, false);
  const pal = input.pal;
  if (!pal || typeof pal !== 'object' || !pal.paper || !Array.isArray(pal.tint) || !pal.relief) throw mvErr('MV_FAULT', 'input.pal is not palette styles.staff', BAD);
  const palette = input.palette || {};

  const I = require('../input'), C = require('../canvas'), P = require('../paper');
  const T = ticker(opts, 7 * f.H + 40);
  const grid = C.create(f, C.color(pal.paper));
  grid.name = 'pic.staff';
  const gaps = [], notes = [];
  const vectors = input.vectors || {};
  const hasObjects = Array.isArray(vectors.objects);

  const mk = maskPass(I, input, f, T);
  const { off, wood, wm } = mk;
  const ctx = { I, C, P, input, f, grid, pal, palette, opts, off, wood, T };

  const g = groundPass(ctx);
  const ct = opts.contours && !opts.thumb ? contourPass(ctx) : { interval: null, lines: 0, labels: 0 };
  T.step(opts.contours && !opts.thumb ? 10 : 20);
  if (wm.from !== 'water') gaps.push('PAINT_NO_WATER_MASKS');
  const water = waterPass(ctx, wm);
  const road = roadPass(ctx, mk.road);
  const ob = objectPass(ctx);
  offPass(ctx);
  T.step(20);
  if (!hasObjects) gaps.push('PAINT_NO_OBJECTS');
  if (!layers.material) notes.push({ code: 'PAINT_NO_MATERIAL', text: 'no material layer: land tint from heights only, roads from ' + (layers.gtype ? 'ground type 7 and ' : '') + 'decals' });
  grainPass(P, grid, f, pal.grain, opts.seed | 0, T);
  T.end();

  const stats = {
    heightMin: g.lo, heightMax: g.hi, interval: ct.interval, contourLines: ct.lines, contourLabels: ct.labels,
    woodPx: g.woodPx, offGroundPx: g.offPx, noHeightPx: g.noHeight,
    waterPx: { noProne: water[0], swim: water[1], drown: water[2] }, waterFrom: wm.from,
    roadPx: { road: road[0], country: road[1], decal: road[2] },
    buildings: ob.buildings, walls: ob.walls, treeStamps: ob.treeStamps,
  };
  return { grid, gaps, notes, stats, approx: gaps.includes('PAINT_NO_WATER_MASKS') };
}

module.exports = { draw, BANDS, ROWS, rampLut, fmtLevel, label };

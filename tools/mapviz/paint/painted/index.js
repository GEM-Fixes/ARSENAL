// paint/painted: the Painted relief style (MV-PNT2 part b; design 9; paint contract draft 4.3, 4.4, 10.8).
//   ID 'painted', VERSION 1, NEEDS ['height'], WANTS ['shade', 'material', 'gtype', 'water.band', 'water.drown', 'objects']
//   draw(input, opts) -> {grid, gaps, notes, stats, approx}, or a Promise of it when opts.pool > 0
//   radiusFor(long) -> Kuwahara radius in px = max(2, round(8 x long / 2048)) (draft 10.8)
//   posterize(v, levels) -> v snapped to `levels` steps (the step table)
//   lumStep(d, k, r, g, b, LUT) -> d[k..k+3] = the colour posterised by its luminance, hue kept, no channel clamped
// Palette numbers: kuwahara integer 2..16 (default 8), posterize integer 2..256 (default 6); out of range throws
// MV_FAULT detail {code:'PAINT_DRAW_BAD', key}. tick: after every 16 rows of each loop, every Kuwahara row, inside the
// shared input.js helpers (their o.tick), and in pool mode every 100 ms while bands run (a throw there closes an own pool).
// opts.cancelFlag (from picture()) goes to the pool, so its children stop on their own too.
// Steps: land cover tints from the map.net materials (input.landCover; landCover.other everywhere when there is no
// material layer) -> roads (input.roadMask), wood (input.woodMask), water by the three masks (input.waterMask; water is
// drawn flat) -> colour relief: the shade layer toward relief.light / relief.dark by relief.strength, plus a light lift
// of high ground -> building footprints (input.buildings, palette landCover.building) -> off-ground pixels take the canvas
// colour -> 8-sector Kuwahara (kuwahara.js; in this process, or bands in a jobs pool when opts.pool > 0) -> posterise
// (palette posterize levels) -> building outlines (not on a thumbnail) -> canvas colour wash and grain (paper.grain,
// seeded by world position and the seed). Mask hatches and marks are the shared files' job.
// No game branch here (the game branches live in input.js): MoW:AS2, AS64 and GoH run the same steps.
// Light at load: requires only inside draw.
// Author: Imperator_Aug (ARSENAL, ia-ca8dd2ac)
'use strict';

const ID = 'painted';
const VERSION = 1;
const NEEDS = ['height'];
const WANTS = ['shade', 'material', 'gtype', 'water.band', 'water.drown', 'objects'];
const KERNEL = 'paint/painted/kuwahara';
const BAND = 256;
const WASH = 0.08;          // canvas colour washed over the whole picture
const LIFT = 0.3;           // share of relief.strength that lifts high ground toward relief.light
const GRAIN_SCALE = 8;      // world u (paper.grain default)
const RELIEF_SPAN = 48;     // shade levels from flat that give the full relief.light / relief.dark mix
const NUMERIC = ['u8', 'i8', 'u16', 'i16', 'u32', 'i32', 'f32'];
const R_MAX = 64;           // kuwahara.js takes radius 1..64
const TICK_ROWS = 16;       // tick after every 16 rows of a per-pixel loop (draft 4.3: at least every ~100 ms)
const BEAT_MS = 100;        // pool mode: tick this often while bands run

// a bad input handed from code (frame, height grid, palette entry): MV_FAULT PAINT_DRAW_BAD (coordinator ruling R-d)
const BAD = { code: 'PAINT_DRAW_BAD' };

function mvErr(code, msg, detail) {
  const M = require('../../mapviz');
  return new M.MvError(code, msg, detail);
}

// capped at the kernel's 64 (reached past 16 383 px long; no map size comes near it)
function radiusFor(long) { return Math.min(R_MAX, Math.max(2, Math.round(8 * long / 2048))); }

// a palette number: absent gives the default; present must be an integer in lo..hi
function palInt(pal, key, lo, hi, def) {
  const v = pal[key];
  if (v === undefined || v === null) return def;
  if (!(Number.isInteger(v) && v >= lo && v <= hi)) {
    throw mvErr('MV_FAULT', 'painted: palette styles.painted.' + key + ' must be an integer ' + lo + '..' + hi + ', got ' + JSON.stringify(v),
      { code: 'PAINT_DRAW_BAD', key: 'styles.painted.' + key });
  }
  return v;
}

function posterize(v, levels) {
  const L = levels - 1;
  return Math.round(Math.round(v * L / 255) * 255 / L);
}

// posterise one colour by its luminance and keep the hue: d[k..k+3] = (r, g, b) x f, 255. f = LUT[L] / L, capped at
// 255 / max(r, g, b) so no channel clamps (a clamped channel would change the channel ratios, i.e. the hue)
function lumStep(d, k, r, g, b, LUT) {
  const L = (77 * r + 150 * g + 29 * b + 128) >> 8;
  if (L === 0) { d[k] = 0; d[k + 1] = 0; d[k + 2] = 0; d[k + 3] = 255; return; }
  const mx = r > g ? (r > b ? r : b) : (g > b ? g : b);
  const f = Math.min(LUT[L] / L, 255 / mx);
  d[k] = Math.round(r * f); d[k + 1] = Math.round(g * f); d[k + 2] = Math.round(b * f); d[k + 3] = 255;
}

function hex(s) {
  const m = /^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/.exec(String(s || ''));
  if (!m) throw mvErr('MV_FAULT', 'painted: palette colour ' + s + ' is not #RRGGBB', BAD);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// a value of a grid on the frame: physical, null for nodata or NaN
function valAt(g, k) {
  const raw = g.data[k];
  if (raw === undefined || Number.isNaN(raw)) return null;
  if (g.nodata !== null && g.nodata !== undefined && raw === g.nodata) return null;
  return raw * (g.scale === undefined ? 1 : g.scale) + (g.offset || 0);
}

function checkInput(input) {
  if (!input || typeof input !== 'object') throw mvErr('MV_FAULT', 'painted: no input', BAD);
  const F = input.frame;
  if (!F || !(Number.isInteger(F.W) && F.W > 0 && Number.isInteger(F.H) && F.H > 0) || !(F.sx > 0) || !(F.sy > 0)) {
    throw mvErr('MV_FAULT', 'painted: input.frame needs integer W, H and sx, sy > 0', BAD);
  }
  const h = input.layers && input.layers.height;
  if (!h) throw mvErr('MV_NOT_FOUND', 'painted: no height layer', { code: 'PAINT_NO_HEIGHT' });
  if (!NUMERIC.includes(h.etype) || !h.data || h.data.length !== h.w * h.h) {
    throw mvErr('MV_FAULT', 'painted: height must be a numeric grid (got etype ' + h.etype + ')', { code: 'PAINT_DRAW_BAD', layer: 'height' });
  }
  const pal = input.pal || (input.palette && input.palette.styles && input.palette.styles.painted);
  if (!pal || !pal.landCover || !pal.relief) throw mvErr('MV_FAULT', 'painted: palette styles.painted is missing', BAD);
  palInt(pal, 'kuwahara', 2, 16, 8);
  palInt(pal, 'posterize', 2, 256, 6);
  return pal;
}

function prepare(input, opts) {
  const I = require('../input'), C = require('../canvas');
  const F = input.frame, W = F.W, H = F.H, N = W * H;
  const pal = checkInput(input);
  const gaps = [], notes = [];
  const tick = typeof opts.tick === 'function' ? opts.tick : () => {};
  const total = 3 * H;
  const layers = input.layers || {};
  const vec = input.vectors || {};
  const lc = pal.landCover;
  const other = hex(lc.other), water = hex(lc.water), wood = hex(lc.wood), building = hex(lc.building);
  const road = hex(lc.road), country = hex(lc.country_road || lc.road);
  const light = hex(pal.relief.light), dark = hex(pal.relief.dark);
  const strength = Number.isFinite(pal.relief.strength) ? pal.relief.strength : 0.5;

  // the shared helpers tick every 16 rows through ho.tick (at the last tick value: progress does not move, a cancel gets in)
  let at = 0;
  const ho = { tick: () => tick(at, total) };
  // 1. land cover
  let base;
  if (layers.material) base = Uint8ClampedArray.from(I.landCover(input, pal, ho));
  else {
    base = new Uint8ClampedArray(N * 4);
    for (let p = 0; p < N; p++) { base[p * 4] = other[0]; base[p * 4 + 1] = other[1]; base[p * 4 + 2] = other[2]; base[p * 4 + 3] = 255; }
    notes.push({ code: 'PAINT_NO_MATERIAL', text: 'no material layer: land cover is the palette colour for other ground everywhere' });
  }
  if (base.length !== N * 4) throw mvErr('MV_FAULT', 'painted: landCover gave ' + base.length + ' bytes, not ' + N * 4, { code: 'PAINT_DRAW_BAD' });

  // 2. roads, wood, water
  tick(0, total);
  const off = I.offGround(input, ho);
  const wm = I.waterMask(input, ho);
  tick(0, total);
  if (wm.from !== 'water') gaps.push('PAINT_NO_WATER_MASKS');
  const hasObjects = Array.isArray(vec.objects);
  if (!hasObjects) gaps.push('PAINT_NO_OBJECTS');
  const roads = I.roadMask(input, ho);
  tick(0, total);
  const woods = I.woodMask(input, ho);
  tick(0, total);
  const mix = (c, k, col, t) => {
    base[k] = Math.round(c[0] + (col[0] - c[0]) * t);
    base[k + 1] = Math.round(c[1] + (col[1] - c[1]) * t);
    base[k + 2] = Math.round(c[2] + (col[2] - c[2]) * t);
  };
  const stats = { kuwaharaR: 0, sectors: 0, levels: 0, waterPx: 0, roadPx: 0, woodPx: 0, buildingPx: 0, buildings: 0, offGroundPx: 0, outlinePx: 0, pool: 0 };
  // stage ticks: prepare spans 0..H of total 3H in three parts (cover, relief, buildings); after every TICK_ROWS rows
  const rowTick = (part, j) => { if ((j + 1) % TICK_ROWS === 0 || j === H - 1) tick(Math.floor(H * (part + (j + 1) / H) / 3), total); };
  const isWater = new Uint8Array(N);
  for (let j = 0; j < H; j++) {
    for (let p = j * W, e = p + W; p < e; p++) {
      const k = p * 4, c = [base[k], base[k + 1], base[k + 2]];
      const w = off[p] ? 0 : wm.mask[p];
      if (w >= 2) { mix(c, k, water, w === 3 ? 1 : 0.7); if (w === 3) mix([base[k], base[k + 1], base[k + 2]], k, dark, 0.2); isWater[p] = 1; stats.waterPx++; continue; }
      const rd = roads[p];
      if (rd) { mix(c, k, rd === 2 ? country : road, rd === 3 ? 0.8 : 1); stats.roadPx++; }
      else if (woods[p]) { mix(c, k, wood, 0.75); stats.woodPx++; }
      if (w === 1) { mix([base[k], base[k + 1], base[k + 2]], k, water, 0.35); stats.waterPx++; }
    }
    rowTick(0, j);
  }

  // 3. colour relief (land only; water stays flat)
  let shade = layers.shade;
  if (!shade) {
    shade = require('../../lib/raster').hillshade(layers.height);
    notes.push({ code: 'PAINT_INPUT_MADE', text: 'shade made in the style (hillshade of the height)' });
  }
  const flat = shade.meta && Number.isFinite(shade.meta.flat) ? shade.meta.flat : 128;
  at = Math.floor(H / 3);
  tick(at, total);
  const sF = I.toFrame(shade, F, 'bilinear', ho);
  tick(at, total);
  const hF = I.toFrame(layers.height, F, 'bilinear', ho);
  tick(Math.floor(H / 3), total);
  const hr = I.heightRange(input);
  const span = hr && hr.max > hr.min ? hr.max - hr.min : 0;
  for (let j = 0; j < H; j++) {
    for (let p = j * W, e = p + W; p < e; p++) {
      if (off[p]) { stats.offGroundPx++; continue; }
      if (isWater[p]) continue;
      const k = p * 4;
      const s = valAt(sF, p);
      if (s !== null) {
        let t = (s - flat) / RELIEF_SPAN;
        if (t > 1) t = 1; else if (t < -1) t = -1;
        if (t >= 0) mix([base[k], base[k + 1], base[k + 2]], k, light, t * strength);
        else mix([base[k], base[k + 1], base[k + 2]], k, dark, -t * strength);
      }
      if (span > 0) {
        const h = valAt(hF, p);
        if (h !== null) mix([base[k], base[k + 1], base[k + 2]], k, light, Math.max(0, Math.min(1, (h - hr.min) / span)) * strength * LIFT);
      }
    }
    rowTick(1, j);
  }

  // 4. buildings (flat roofs, after the relief)
  const bmask = new Uint8Array(N);
  let bpx = null;
  if (hasObjects) {
    const list = I.buildings(input);
    stats.buildings = list.length;
    if (list.length) {
      const bg = C.create(F, [0, 0, 0, 0]);
      const fill = building.concat([255]);
      for (let q = 0; q < list.length; q++) {
        const b = list[q];
        if (b.pts && b.pts.length >= 3) C.fillPoly(bg, b.pts.map(v => C.toPx(F, v[0], v[1])), fill);
        if ((q + 1) % 256 === 0) tick(Math.floor(2 * H / 3), total);
      }
      bpx = bg.data;
    }
  }

  // 5. building pixels, then off ground = canvas colour (the shared no-data hatch goes on top later)
  const canvasCol = hex(pal.canvas || '#EDE6D6');
  for (let j = 0; j < H; j++) {
    for (let p = j * W, e = p + W; p < e; p++) {
      const k = p * 4;
      if (off[p]) { base[k] = canvasCol[0]; base[k + 1] = canvasCol[1]; base[k + 2] = canvasCol[2]; base[k + 3] = 255; continue; }
      const a = bpx ? bpx[k + 3] : 0;
      if (a) {
        mix([base[k], base[k + 1], base[k + 2]], k, building, a / 255);
        if (a >= 128) { bmask[p] = 1; stats.buildingPx++; }
      }
      base[k + 3] = 255;
    }
    rowTick(2, j);
  }
  return { I, C, F, W, H, N, pal, base, bmask, off, gaps, notes, stats, tick, total, dark, canvasCol };
}

function finish(st, rows, opts) {
  const { C, F, W, H, N, pal, bmask, gaps, notes, stats, tick, total, dark, canvasCol } = st;
  const levels = palInt(pal, 'posterize', 2, 256, 6);
  stats.levels = levels;
  const LUT = new Uint8Array(256);
  for (let v = 0; v < 256; v++) LUT[v] = posterize(v, levels);
  const grid = C.create(F, [0, 0, 0, 255]);
  grid.name = 'pic.' + ID;
  const d = grid.data;
  if (d.length !== N * 4) throw mvErr('MV_FAULT', 'painted: canvas.create gave a grid of ' + d.length + ' bytes', { code: 'PAINT_DRAW_BAD' });
  // posterise the luminance and keep the hue: each colour is scaled by f = Lq / L (per-channel steps turn muted land
  // colours orange or pink). f is capped at 255 / max(r, g, b) so no channel clamps and the channel ratios hold.
  for (let j = 0; j < H; j++) {
    for (let k = j * W * 4, e = k + W * 4; k < e; k += 4) {
      lumStep(d, k, rows[k], rows[k + 1], rows[k + 2], LUT);
    }
    if ((j + 1) % TICK_ROWS === 0) tick(2 * H + Math.floor((j + 1) / 2), total);
  }
  // building outlines: a building pixel with a 4-neighbour outside (not on a thumbnail: strokes would be >= 2 px)
  if (!opts.thumb) {
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const p = j * W + i;
      if (!bmask[p]) continue;
      const edge = i === 0 || i === W - 1 || j === 0 || j === H - 1 || !bmask[p - 1] || !bmask[p + 1] || !bmask[p - W] || !bmask[p + W];
      if (!edge) continue;
      const k = p * 4;
      d[k] = Math.round(d[k] + (dark[0] - d[k]) * 0.6); d[k + 1] = Math.round(d[k + 1] + (dark[1] - d[k + 1]) * 0.6); d[k + 2] = Math.round(d[k + 2] + (dark[2] - d[k + 2]) * 0.6);
      stats.outlinePx++;
    }
  }
  // canvas: a light wash of the canvas colour, then grain seeded by world position
  // wash and grain in bands of TICK_ROWS rows (paper.grain is seeded by world position, so a band with its own frame
  // origin gives the same bytes as the whole picture at once)
  const amount = Number.isFinite(pal.grain) ? pal.grain : 0.06;
  const paper = amount > 0 ? require('../paper') : null;
  for (let j0 = 0; j0 < H; j0 += TICK_ROWS) {
    const j1 = Math.min(H, j0 + TICK_ROWS);
    for (let k = j0 * W * 4, e = j1 * W * 4; k < e; k += 4) {
      d[k] = Math.round(d[k] + (canvasCol[0] - d[k]) * WASH); d[k + 1] = Math.round(d[k + 1] + (canvasCol[1] - d[k + 1]) * WASH); d[k + 2] = Math.round(d[k + 2] + (canvasCol[2] - d[k + 2]) * WASH);
    }
    if (paper) {
      const band = { w: W, h: j1 - j0, data: d.subarray(j0 * W * 4, j1 * W * 4) };
      paper.grain(band, Object.assign({}, F, { y0: F.y0 + j0 * F.sy, H: j1 - j0 }), amount, { scale: GRAIN_SCALE, seed: st.seed });
    }
    tick(2 * H + Math.floor(H / 2) + Math.floor(j1 / 2), total);
  }
  for (let k = 3; k < N * 4; k += 4) d[k] = 255;
  stats.grain = amount;
  tick(total, total);
  return { grid, gaps: gaps.slice().sort(), notes, stats, approx: gaps.includes('PAINT_NO_WATER_MASKS') };
}

function draw(input, opts) {
  opts = opts || {};
  const st = prepare(input, opts);
  st.seed = Number.isInteger(opts.seed) ? opts.seed : (Number.isInteger(input.seed) ? input.seed : 1);
  const long = Math.max(st.W, st.H);
  const r = radiusFor(long);
  const n = palInt(st.pal, 'kuwahara', 2, 16, 8);
  st.stats.kuwaharaR = r; st.stats.sectors = n;
  const K = require('./kuwahara');
  const poolN = Number(opts.pool) > 0 ? Math.floor(Number(opts.pool)) : 0;
  if (!poolN || st.H <= BAND) {
    // every row: one row is the slowest unit (about 50 ms at 4096 px, r 16)
    const rows = K.filter(st.base, st.W, st.H, r, n, 0, st.H, j => st.tick(st.H + j, st.total));
    return finish(st, rows, opts);
  }
  return drawPool(st, r, n, poolN, opts).then(rows => { st.stats.pool = poolN; return finish(st, rows, opts); });
}

async function drawPool(st, r, n, poolN, opts) {
  const fs = require('fs'), path = require('path'), os = require('os');
  const gf = require('../../lib/raster/gridfile');
  const F = st.F;
  const dir = fs.mkdtempSync(path.join(opts.workDir || os.tmpdir(), 'mapviz-painted-'));
  const pool = opts.poolObject && typeof opts.poolObject.run === 'function' ? opts.poolObject
    : require('../../jobs/pool').create({ n: poolN, cancelFlag: opts.cancelFlag });
  const own = pool !== opts.poolObject;
  try {
    const meta = {};
    if (Math.abs(F.sy - F.sx) > 1e-9 * F.sx) meta.cellY = F.sy;
    gf.write(path.join(dir, 'pre.mvg'), { name: 'pic.painted.pre', w: st.W, h: st.H, cell: F.sx, ox: F.x0, oy: F.y0, etype: 'rgba8', sample: 'cell',
      scale: 1, offset: 0, nodata: null, meta, data: st.base });
    const bands = [];
    for (let y = 0; y < st.H; y += BAND) bands.push([y, Math.min(st.H, y + BAND)]);
    // while the bands run: tick when a band ends and every BEAT_MS between. A tick that throws (cancel) ends the wait
    // at once; the finally below closes an own pool, which kills its children (opts.cancelFlag is not needed for that).
    let done = 0;
    const all = await new Promise((resolve, reject) => {
      let ended = false, timer = null;
      const end = (fn, v) => { if (ended) return; ended = true; clearInterval(timer); fn(v); };
      const beat = () => { if (ended) return; try { st.tick(st.H + done, st.total); } catch (e) { end(reject, e); } };
      timer = setInterval(beat, BEAT_MS);
      const runs = bands.map(([j0, j1]) => {
        const name = 'band-' + j0 + '.mvg';
        return pool.run(KERNEL, { inputs: ['pre.mvg'], args: { W: st.W, H: st.H, r, n, j0, j1, input: 'pre.mvg', outName: name }, out: dir }).then(res => {
          done += j1 - j0;
          beat();
          return { j0, name, res };
        });
      });
      Promise.all(runs).then(v => end(resolve, v), e => end(reject, e));
    });
    st.tick(st.H + done, st.total);
    const rows = new Uint8ClampedArray(st.N * 4);
    for (const b of all) {
      if (b.res.code === 5) throw mvErr('MV_CANCELLED', 'painted: cancelled in the Kuwahara pool');
      if (b.res.code !== 0) throw mvErr('MV_FAULT', 'painted: kernel failed (exit ' + b.res.code + '): ' + String(b.res.stderr || '').trim().slice(-400), { code: 'PAINT_STYLE_BROKEN' });
      const g = gf.read(path.join(dir, b.name));
      rows.set(g.data, b.j0 * st.W * 4);
    }
    return rows;
  } finally {
    if (own) await pool.close();
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* temp */ }
  }
}

module.exports = { ID, VERSION, NEEDS, WANTS, KERNEL, draw, radiusFor, posterize, lumStep };

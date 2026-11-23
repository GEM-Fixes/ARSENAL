// sketch (MV-PNT3): the Field sketch style (owner decision 17; design 9; paint contract 4.3, 4.4). The family of the stock
// GoH minimaps and the default style of GoH minimaps; drawn the same way for AS64, MoW:AS2 and GoH (the style never
// branches on the game: the game rules live in the shared input helpers).
// Order: grey paper with grain -> road smudge -> graphite hachures from the slope class -> water hatched by the three
// masks -> crest lines dash-dot -> buildings (outline, light fill) -> one tree squiggle per tree entity (thumbnail: one
// per cluster) and forest ground. No mask hatches and no marks (the shared files draw them after the style).
// Thumbnail (frame long side <= 512 px, opts.thumb): hachures from slope class 3 up, tree clusters, strokes >= 2 px,
// stronger tone. No file, game or clock is read here and the only random source is paper.hash: same input and opts give
// the same bytes.
//   ID 'sketch', VERSION, NEEDS, WANTS, draw(input, opts) -> {grid, gaps, notes, stats, approx}
// Author: Imperator_Aug (ARSENAL, ia-8f2889d1)
'use strict';

const lib = require('./lib');

const ID = 'sketch';
const VERSION = 1;
const NEEDS = ['height'];
const WANTS = ['slopecls', 'landform.r50', 'objects', 'material', 'gtype', 'water.band', 'water.drown'];
const NUMERIC = ['u8', 'i8', 'u16', 'i16', 'u32', 'i32', 'f32'];

// stage weights of the progress (tick total 1000)
const STAGES = [['paper', 50], ['roads', 150], ['hachures', 400], ['water', 100], ['crests', 150], ['buildings', 50], ['trees', 100]];

// a bad input handed from code (layer, frame, palette entry): MV_FAULT PAINT_DRAW_BAD (coordinator ruling R-d)
function bad(msg) { return lib.fail('MV_FAULT', 'sketch: ' + msg, { code: 'PAINT_DRAW_BAD' }); }

function checkGrid(g, name, etypes, sample) {
  if (!g || typeof g !== 'object' || !g.data || !Number.isInteger(g.w) || !Number.isInteger(g.h) || g.w < 1 || g.h < 1 ||
      !(g.cell > 0) || !Number.isFinite(g.ox) || !Number.isFinite(g.oy)) {
    throw bad('layer ' + name + ' is not a grid object');
  }
  if (!etypes.includes(g.etype)) throw bad('layer ' + name + ' has etype ' + g.etype + ', want ' + etypes.join(' or '));
  if (sample && g.sample !== sample) throw bad('layer ' + name + ' is ' + g.sample + ' sampled, want ' + sample);
  const n = g.w * g.h * (g.etype === 'rgba8' ? 4 : 1);
  if (g.data.length !== n) throw bad('layer ' + name + ' holds ' + g.data.length + ' values, want ' + n);
}

function checkInput(input) {
  if (!input || typeof input !== 'object') throw bad('no input');
  const f = input.frame;
  if (!f || !Number.isInteger(f.W) || !Number.isInteger(f.H) || f.W < 1 || f.H < 1 || !(f.sx > 0) || !(f.sy > 0) ||
      !Number.isFinite(f.x0) || !Number.isFinite(f.y0)) throw bad('input.frame is not a picture frame');
  if (!input.layers || typeof input.layers !== 'object') throw bad('input.layers is missing');
  if (!input.layers.height) throw lib.fail('MV_NOT_FOUND', 'sketch: the height layer is absent', { code: 'PAINT_NO_HEIGHT' });
  checkGrid(input.layers.height, 'height', NUMERIC, 'lattice');
  const L = input.layers;
  if (L.slopecls) checkGrid(L.slopecls, 'slopecls', ['u8'], 'cell');
  if (L['landform.r50']) checkGrid(L['landform.r50'], 'landform.r50', ['u8'], 'cell');
  if (L.gtype) checkGrid(L.gtype, 'gtype', ['u8'], 'cell');
  if (L.material) checkGrid(L.material, 'material', ['u8'], 'cell');
  if (L['water.band']) checkGrid(L['water.band'], 'water.band', ['u8'], 'cell');
  if (L['water.drown']) checkGrid(L['water.drown'], 'water.drown', ['u32'], 'cell');
  if (input.vectors && input.vectors.objects !== undefined && !Array.isArray(input.vectors.objects)) throw bad('vectors.objects is not a list');
  const pal = input.pal;
  if (!pal || typeof pal !== 'object' || typeof pal.paper !== 'string' || typeof pal.graphite !== 'string') {
    throw bad('input.pal is not the palette styles.field_sketch entry');
  }
}

function progress(opts) {
  const tick = opts && typeof opts.tick === 'function' ? opts.tick : () => {};
  let base = 0, done = 0;
  const at = { i: 0 };
  const step = frac => {
    const w = STAGES[at.i][1];
    const d = base + Math.floor(w * Math.max(0, Math.min(1, frac)));
    if (d > done) done = d;
    tick(done, 1000);
  };
  const next = () => { base += STAGES[at.i][1]; at.i = Math.min(STAGES.length - 1, at.i + 1); if (base > done) done = base; };
  const end = () => { done = 1000; tick(1000, 1000); };
  return { step, next, end };
}

// paper grain in row strips with a tick between strips (paint contract 4.3: tick at least every ~100 ms, the only way a
// cancel gets in). The same multiply as paper.grain (paper.js), pixel for pixel, so the bytes do not change; paper.grain
// takes no tick, so the sketch runs the formula itself with P.fbm.
const GRAIN_PX = 16384;   // pixels per strip: a few ms of fbm, tens of ms on a busy machine
function grainTicked(P, grid, frame, amount, o, step) {
  const a = Number(amount) || 0;
  if (!a) { step(1); return; }
  const fo = { scale: o.scale > 0 ? o.scale : 8, seed: o.seed === undefined ? 1 : o.seed | 0 };
  const W = grid.w, H = grid.h, d = grid.data;
  const x0 = frame.x0, y0 = frame.y0, sx = frame.sx, sy = frame.sy;
  const rows = Math.max(1, Math.floor(GRAIN_PX / W));
  for (let j = 0; j < H; j++) {
    if (j % rows === 0) step(j / H);
    const y = y0 + (j + 0.5) * sy;
    for (let i = 0; i < W; i++) {
      const k = 1 + a * (2 * P.fbm(x0 + (i + 0.5) * sx, y, fo) - 1);
      const p = (j * W + i) * 4;
      d[p] = Math.round(d[p] * k); d[p + 1] = Math.round(d[p + 1] * k); d[p + 2] = Math.round(d[p + 2] * k);
    }
  }
  step(1);
}

function waterHatches(ctx, wm) {
  const { grid, frame, opts, pal, C, input } = ctx;
  const n = frame.W * frame.H;
  const P = input.palette || {}, wb = (P.water && P.water.bands) || [], dr = (P.water && P.water.drown) || {};
  const col = pal.waterHatch || pal.graphite;
  const minW = opts.thumb ? Math.max(2, opts.minStroke || 2) : 1;
  const hatchOf = h => ({ color: col, angle: h && Number.isFinite(h.angle) ? h.angle : 45, gap: h && h.gap > 0 ? h.gap : 8,
    width: Math.max(minW, h && h.width > 0 ? h.width : 1) });
  const counts = { noProne: 0, swim: 0, drown: 0 };
  const m1 = new Uint8Array(n), m2 = new Uint8Array(n), m3 = new Uint8Array(n);
  for (let k = 0; k < n; k++) {
    const c = wm[k];
    if (c === 1) { m1[k] = 1; counts.noProne++; } else if (c >= 2) { m2[k] = 1; counts.swim++; if (c === 3) { m3[k] = 1; counts.drown++; } }
  }
  const wash = (a) => { const c = C.color(col); return [c[0], c[1], c[2], a]; };
  if (counts.noProne) C.hatchMask(grid, m1, hatchOf(wb[1] && wb[1].hatch), {});
  if (counts.swim) C.hatchMask(grid, m2, hatchOf(wb[2] && wb[2].hatch), { fill: wash(opts.thumb ? 0x30 : 0x22) });
  if (counts.drown) C.hatchMask(grid, m3, hatchOf(dr.hatch), { fill: wash(opts.thumb ? 0x30 : 0x22) });
  return counts;
}

function buildings(ctx) {
  const { grid, frame, opts, pal, C, I, input, seed } = ctx;
  const fill = C.color(pal.buildingFill || pal.paper), line = C.color(pal.buildingLine || pal.graphite);
  const w = Math.max(1, opts.minStroke || 1);
  const list = I.buildings(input);
  let n = 0;
  for (const b of list) {
    if (!b.pts || b.pts.length < 3) continue;
    const px = b.pts.map(p => C.toPx(frame, p[0], p[1]));
    C.fillPoly(grid, px, fill);
    const hand = typeof C.wobble === 'function' ? C.wobble(px, { amp: 0.5, wave: 24, seed, frame }) : px;
    C.strokePath(grid, hand, w, line, { closed: true, cap: 'round' });
    n++;
  }
  return n;
}

function draw(input, opts) {
  opts = opts || {};
  checkInput(input);
  const C = lib.canvas(), P = lib.paper(), I = lib.input();
  const frame = input.frame, pal = input.pal;
  const seed = Number.isInteger(opts.seed) ? opts.seed : (Number.isInteger(input.seed) ? input.seed : 1);
  const gaps = new Set(), notes = [];
  const pg = progress(opts);
  const L = input.layers;
  const layers = Object.assign({}, L);
  if (!layers.slopecls) {
    // gather makes slopecls (contract 4.4); a caller that skipped gather still gets hachures
    const R = require('../../lib/raster');
    layers.slopecls = R.slopeClass(L.height);
    notes.push({ code: 'PAINT_INPUT_MADE', text: 'slopecls made from the height layer' });
  }
  const inp = Object.assign({}, input, { layers });
  const hasObjects = !!(input.vectors && Array.isArray(input.vectors.objects));
  if (!hasObjects) gaps.add('PAINT_NO_OBJECTS');
  if (!layers['landform.r50']) gaps.add('PAINT_NO_LANDFORM');
  if (!layers.material) notes.push({ code: 'PAINT_NO_MATERIAL', text: 'no material layer: roads from ground type 7 and road decals only' });

  // 1. paper
  const grid = C.create(frame, C.color(pal.paper));
  grid.name = 'pic.' + ID;
  grainTicked(P, grid, frame, opts.thumb ? 0.025 : 0.04, { scale: 24, seed }, pg.step);
  pg.next();
  const ctx = { grid, frame, input: inp, opts, pal, C, P, I, seed, step: pg.step, water: null, wood: null, hasObjects };

  // 2. roads
  // the shared helpers tick every 16 rows through ho.tick (progress stays at the stage base, a cancel gets in)
  const ho = { tick: () => pg.step(0) };
  const roads = I.roadMask(inp, ho);
  const rd = require('./smudge').draw(ctx, roads);
  pg.next();

  // 3. hachures (not on water)
  const wmr = I.waterMask(inp, ho);
  if (wmr.from !== 'water') gaps.add('PAINT_NO_WATER_MASKS');
  ctx.water = wmr.mask;
  const hc = require('./hachure').draw(ctx);
  pg.next();

  // 4. water
  const wc = waterHatches(ctx, wmr.mask);
  pg.step(1); pg.next();

  // 5. crests
  let crestList = [];
  if (layers['landform.r50']) crestList = require('./crest').lines(layers['landform.r50'], { tick: f => pg.step(0.8 * f) });
  require('./crest').draw(ctx, crestList);
  pg.next();

  // 6. buildings
  const nb = hasObjects ? buildings(ctx) : 0;
  pg.step(1); pg.next();

  // 7. trees and forest ground
  if (layers.gtype || hasObjects) ctx.wood = I.woodMask(inp, ho);
  const st = require('./stamps').draw(ctx);
  pg.end();

  const stats = {
    hachures: hc.strokes, hachureStep: hc.step, hachureFrom: hc.from,
    trees: st.trees, treeStamps: st.treeStamps, forestStamps: st.forestStamps,
    buildings: nb, roadPx: rd.roadPx, water: wc,
    crests: crestList.length, crestM: Math.round(crestList.reduce((s, l) => s + l.lenM, 0) * 10) / 10,
    thumb: !!opts.thumb,
  };
  const g = [...gaps].sort();
  return { grid, gaps: g, notes: notes.slice(0, 50), stats, approx: g.includes('PAINT_NO_WATER_MASKS') };
}

module.exports = { ID, VERSION, NEEDS, WANTS, draw, _grainTicked: grainTicked };

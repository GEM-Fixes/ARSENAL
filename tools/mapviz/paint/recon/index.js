// paint style "recon" (MV-PNT2 part a): the Recon photo. A realistic base picture (render l4..l1, editor shot, the shipped
// minimap on MoW:AS2 and AS64, or the l0 schematic as the last rung) made into a grey aerial photo print: grey, a tiny
// blur, a level stretch, the palette contrast curve, the palette grey ramp, a vignette and film grain. Marks (grease
// pencil) and mask hatches are drawn after this by the shared paint files (paint.md 0, 4.3); this file draws the base only.
// Behaviour: design 9 "Recon photo"; contract: paint.md 4.3 (style module), 4.4 (input), 4.10 (codes); palette
// styles.recon {ramp, curve, grain, vignette}. No game branch here: the base order per game (no shipped minimap on GoH)
// is input.js's (paint.md 0, 9). input.target is only recorded.
//
//   ID 'recon', VERSION 1, NEEDS [], WANTS []
//   draw(input, opts) -> {grid, gaps, notes, stats, approx}
//     input.base = {from, grid (rgba8 on input.frame), approx, sidecar}; null -> MvError MV_NOT_FOUND (PAINT_NO_BASE)
//     opts = {thumb, seed, tick(done, total), ...}; thumb (long side <= 512 px): no blur, a 2 % level clip, half grain
//   tone: the integer helpers (luma, blur3, levels, curveLut, rampLut, vignetteRow) for tests
//
// Pipeline per pixel (integer stages except the curve and ramp tables, built once, and the shared grain):
//   1. luma L = (77 r + 150 g + 29 b + 128) >> 8 of the straight base colour; alpha < 255 = composited over black
//      (an unexposed print), counted in stats.transparent
//   2. full size only: 3 x 3 binomial blur [1 2 1]^2 / 16, edges clamped ("tiny blur", survey art.md D)
//   3. level stretch: lo, hi = the clip % and 100 - clip % points of the luma histogram of the ground pixels (base
//      alpha > 0; no-ground pixels, alpha 0, are left out so an empty strip cannot hold lo at 0) (clip 0.5 %, thumb 2 %); a
//      picture whose spread hi - lo is under 16 levels is left unstretched (a flat base must not turn into noise)
//   4. palette curve: monotone cubic through styles.recon.curve points, as a 256-entry table
//   5. palette ramp: styles.recon.ramp stops (at 0..1, colours), linear per channel, as a 256-entry table
//   6. vignette: factor 1 - vignette x r2^2, r2 = (u^2 + v^2) / 2 with u, v = -1..1 across the frame (pixel centres);
//      applied as an integer multiply (c F + 127) / 255, F = round(255 factor)
//   7. grain: the paper.grain multiply c (1 + grain (2 fbm - 1)), grain = styles.recon.grain (half on a thumb), with the
//      shared paper.fbm seeded by world position and --seed; lattice grainScale(frame), 2 octaves (see grainScale)
// Alpha 255 everywhere.
// Author: Imperator_Aug (ARSENAL, ia-711e603a)
'use strict';

const ID = 'recon';
const VERSION = 1;
const NEEDS = [];
const WANTS = [];   // the base picture is not a layer: gather fills input.base by baseOrder (paint.md 4.5)
const FROM = ['l4', 'l3', 'l2', 'l1', 'edshot', 'minimap', 'l0'];
const MIN_SPREAD = 16;
const CLIP = 0.005, CLIP_THUMB = 0.02;
const ROWS_PER_TICK = 32;
const GRAIN_MIN = 8, GRAIN_PX = 3, GRAIN_OCTAVES = 2;

// grain lattice in world u: 8 u (paper.grain's default) or 3 pixels, whichever is larger, so the value-noise lattice is
// never near the pixel pitch (a lattice of about one pixel beats with the pixels into a regular checker, seen on
// 1v1_road at 768 px with paper.grain's 8 u). Pictures whose pixel is <= 8/3 u share one grain pattern in world space.
const c8 = v => (v <= 0 ? 0 : v >= 255 ? 255 : Math.round(v));
function grainScale(fr) { return Math.max(GRAIN_MIN, GRAIN_PX * Math.max(fr.sx, fr.sy)); }

function mverr(code, msg, sub) {
  const MvError = require('../../mapviz').MvError;
  return new MvError(code, msg, { code: sub });
}

// ---------------------------------------------------------------- tone helpers (pure, integer where it matters)

function luma(r, g, b) { return (77 * r + 150 * g + 29 * b + 128) >> 8; }

// 3 x 3 binomial blur of a W x H Uint8Array, edges clamped
function blur3(L, W, H) {
  const out = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) {
    const jm = j > 0 ? j - 1 : 0, jp = j < H - 1 ? j + 1 : H - 1;
    const rm = jm * W, r0 = j * W, rp = jp * W;
    for (let i = 0; i < W; i++) {
      const im = i > 0 ? i - 1 : 0, ip = i < W - 1 ? i + 1 : W - 1;
      const s = L[rm + im] + 2 * L[rm + i] + L[rm + ip] +
        2 * L[r0 + im] + 4 * L[r0 + i] + 2 * L[r0 + ip] +
        L[rp + im] + 2 * L[rp + i] + L[rp + ip];
      out[r0 + i] = (s + 8) >> 4;
    }
  }
  return out;
}

// level points of a luma array: lo = smallest v with count(<= v) > clip n, hi = largest v with count(>= v) > clip n.
// mask (optional, Uint8Array of L.length): only pixels with mask[k] !== 0 are counted, so no-ground pixels (base alpha 0)
// do not hold lo at 0; a mask with no pixel set counts every pixel.
function levels(L, clip, mask) {
  const hist = new Uint32Array(256);
  let n = 0;
  if (mask) { for (let k = 0; k < L.length; k++) if (mask[k]) { hist[L[k]]++; n++; } }
  if (!n) { hist.fill(0); for (let k = 0; k < L.length; k++) hist[L[k]]++; n = L.length; }
  const lim = Math.floor(clip * n);
  let lo = 0, hi = 255, c = 0;
  for (let v = 0; v < 256; v++) { c += hist[v]; if (c > lim) { lo = v; break; } }
  c = 0;
  for (let v = 255; v >= 0; v--) { c += hist[v]; if (c > lim) { hi = v; break; } }
  const stretched = hi - lo >= MIN_SPREAD;
  return { lo: stretched ? lo : 0, hi: stretched ? hi : 255, stretched, spread: hi - lo };
}

function checkPoints(pts, what) {
  if (!Array.isArray(pts) || pts.length < 2) throw mverr('MV_FAULT', 'palette styles.recon.' + what + ' needs at least two points', 'PAINT_DRAW_BAD');
  for (let k = 0; k < pts.length; k++) {
    const p = pts[k];
    if (!Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite) || p[0] < 0 || p[0] > 1 || p[1] < 0 || p[1] > 1 || (k > 0 && !(p[0] > pts[k - 1][0]))) {
      throw mverr('MV_FAULT', 'palette styles.recon.' + what + ' point ' + k + ' is not [x, y] in 0..1 with x rising', 'PAINT_DRAW_BAD');
    }
  }
}

// monotone cubic (Fritsch-Carlson) through the curve points; x outside the first / last point is held flat
function curveLut(pts) {
  checkPoints(pts, 'curve');
  const n = pts.length, x = pts.map(p => p[0]), y = pts.map(p => p[1]);
  const d = [], m = new Array(n);
  for (let k = 0; k < n - 1; k++) d.push((y[k + 1] - y[k]) / (x[k + 1] - x[k]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let k = 1; k < n - 1; k++) m[k] = d[k - 1] * d[k] <= 0 ? 0 : (d[k - 1] + d[k]) / 2;
  for (let k = 0; k < n - 1; k++) {
    if (d[k] === 0) { m[k] = 0; m[k + 1] = 0; continue; }
    const a = m[k] / d[k], b = m[k + 1] / d[k], s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[k] = t * a * d[k]; m[k + 1] = t * b * d[k]; }
  }
  const lut = new Uint8Array(256);
  for (let v = 0; v < 256; v++) {
    const t0 = v / 255;
    let f;
    if (t0 <= x[0]) f = y[0];
    else if (t0 >= x[n - 1]) f = y[n - 1];
    else {
      let k = 0;
      while (k < n - 2 && t0 > x[k + 1]) k++;
      const h = x[k + 1] - x[k], t = (t0 - x[k]) / h, t2 = t * t, t3 = t2 * t;
      f = (2 * t3 - 3 * t2 + 1) * y[k] + (t3 - 2 * t2 + t) * h * m[k] + (-2 * t3 + 3 * t2) * y[k + 1] + (t3 - t2) * h * m[k + 1];
    }
    lut[v] = Math.max(0, Math.min(255, Math.round(f * 255)));
  }
  return lut;
}

function hex(s) {
  const mm = /^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/.exec(String(s));
  if (!mm) throw mverr('MV_FAULT', 'palette styles.recon.ramp colour must be #RRGGBB, not ' + s, 'PAINT_DRAW_BAD');
  const v = parseInt(mm[1], 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

// 256 x 3 table of the ramp stops {at, color}, linear per channel between stops, held flat outside
function rampLut(stops) {
  if (!Array.isArray(stops) || stops.length < 2) throw mverr('MV_FAULT', 'palette styles.recon.ramp needs at least two stops', 'PAINT_DRAW_BAD');
  const S = stops.map((s, k) => {
    if (!s || !Number.isFinite(s.at) || s.at < 0 || s.at > 1 || (k > 0 && !(s.at > stops[k - 1].at))) {
      throw mverr('MV_FAULT', 'palette styles.recon.ramp stop ' + k + ' needs at in 0..1, rising', 'PAINT_DRAW_BAD');
    }
    return { at: s.at, c: hex(s.color) };
  });
  const lut = new Uint8Array(256 * 3);
  for (let v = 0; v < 256; v++) {
    const t = v / 255;
    let c;
    if (t <= S[0].at) c = S[0].c;
    else if (t >= S[S.length - 1].at) c = S[S.length - 1].c;
    else {
      let k = 0;
      while (t > S[k + 1].at) k++;
      const f = (t - S[k].at) / (S[k + 1].at - S[k].at);
      c = [0, 1, 2].map(q => S[k].c[q] + (S[k + 1].c[q] - S[k].c[q]) * f);
    }
    for (let q = 0; q < 3; q++) lut[v * 3 + q] = Math.max(0, Math.min(255, Math.round(c[q])));
  }
  return lut;
}

// integer vignette factors (0..255) of row j, F[i] = round(255 (1 - vig r2^2))
function vignetteRow(W, H, j, vig, out) {
  const F = out || new Uint8Array(W);
  const v = 2 * (j + 0.5) / H - 1, v2 = v * v;
  for (let i = 0; i < W; i++) {
    const u = 2 * (i + 0.5) / W - 1, r2 = (u * u + v2) / 2;
    F[i] = Math.max(0, Math.min(255, Math.round(255 * (1 - vig * r2 * r2))));
  }
  return F;
}

// ---------------------------------------------------------------- input checks

function checkInput(input) {
  if (!input || typeof input !== 'object') throw mverr('MV_FAULT', 'recon draw needs an input object', 'PAINT_DRAW_BAD');
  const fr = input.frame;
  if (!fr || !Number.isInteger(fr.W) || !Number.isInteger(fr.H) || fr.W < 1 || fr.H < 1 || !(fr.sx > 0) || !(fr.sy > 0) ||
    !Number.isFinite(fr.x0) || !Number.isFinite(fr.y0)) {
    throw mverr('MV_FAULT', 'recon draw needs input.frame {W, H, sx, sy, x0, y0}', 'PAINT_DRAW_BAD');
  }
  const base = input.base;
  if (!base) throw mverr('MV_NOT_FOUND', 'recon has no base picture (no render, editor shot, minimap or schematic)', 'PAINT_NO_BASE');
  if (FROM.indexOf(base.from) < 0) throw mverr('MV_FAULT', 'recon base.from must be one of ' + FROM.join(', ') + ', not ' + base.from, 'PAINT_DRAW_BAD');
  const g = base.grid;
  if (!g || g.etype !== 'rgba8' || g.w !== fr.W || g.h !== fr.H || !g.data || g.data.length !== fr.W * fr.H * 4) {
    throw mverr('MV_FAULT', 'recon base must be an rgba8 picture of ' + fr.W + ' x ' + fr.H + ' px on the frame (got ' +
      (g ? g.etype + ' ' + g.w + ' x ' + g.h : 'none') + ')', 'PAINT_DRAW_BAD');
  }
  const pal = input.pal || (input.palette && input.palette.styles && input.palette.styles.recon);
  if (!pal || typeof pal !== 'object') throw mverr('MV_FAULT', 'recon needs the palette entry styles.recon', 'PAINT_DRAW_BAD');
  const grain = pal.grain === undefined ? 0 : pal.grain, vig = pal.vignette === undefined ? 0 : pal.vignette;
  if (!(Number.isFinite(grain) && grain >= 0 && grain <= 1) || !(Number.isFinite(vig) && vig >= 0 && vig <= 1)) {
    throw mverr('MV_FAULT', 'palette styles.recon grain and vignette must be numbers 0..1', 'PAINT_DRAW_BAD');
  }
  return { fr, base, g, pal, grain, vig };
}

// ---------------------------------------------------------------- draw

function draw(input, opts) {
  opts = opts || {};
  const { fr, base, g, pal, grain, vig } = checkInput(input);
  const tick = typeof opts.tick === 'function' ? opts.tick : () => {};
  const thumb = !!opts.thumb;
  const seed = Number.isInteger(opts.seed) ? opts.seed : Number.isInteger(input.seed) ? input.seed : 1;
  const W = fr.W, H = fr.H, N = W * H;
  const curve = curveLut(pal.curve), ramp = rampLut(pal.ramp);
  const amount = thumb ? grain / 2 : grain;
  // tick budget: luma and tone (2 passes of H rows), grain (H rows when there is grain), the end (1)
  const total = (amount > 0 ? 3 : 2) * H + 1;
  let done = 0;

  // 1. luma over black; ground = base alpha > 0 (the level histogram counts ground pixels only)
  const src = g.data;
  let L = new Uint8Array(N), transparent = 0, empty = 0;
  const ground = new Uint8Array(N);
  for (let j = 0; j < H; j++) {
    for (let i = 0, k = j * W; i < W; i++, k++) {
      const s = k * 4, a = src[s + 3];
      const y = luma(src[s], src[s + 1], src[s + 2]);
      if (a === 255) { L[k] = y; ground[k] = 1; }
      else { transparent++; L[k] = (y * a + 127) / 255 | 0; if (a) ground[k] = 1; else empty++; }
    }
    if (++done % ROWS_PER_TICK === 0) tick(done, total);
  }
  // 2. tiny blur, full size only
  const blur = !thumb && W >= 3 && H >= 3;
  if (blur) { L = blur3(L, W, H); tick(done, total); }   // the blur is one whole-frame pass: a tick after it
  // 3. levels
  const lv = levels(L, thumb ? CLIP_THUMB : CLIP, empty ? ground : null);
  const span = lv.hi - lv.lo;
  const tone = new Uint8Array(256);   // levels then curve, one table
  for (let v = 0; v < 256; v++) {
    const s = v <= lv.lo ? 0 : v >= lv.hi ? 255 : Math.round((v - lv.lo) * 255 / span);
    tone[v] = curve[s];
  }
  // 4..6. curve, ramp, vignette into the canvas grid
  const canvas = require('../canvas');
  const grid = canvas.create(fr, [0, 0, 0, 255]);
  grid.name = 'pic.' + ID;
  grid.meta = Object.assign({}, grid.meta || {}, { style: ID, styleVersion: VERSION, seed });
  const out = grid.data, F = new Uint8Array(W);
  let sum = 0;
  for (let j = 0; j < H; j++) {
    vignetteRow(W, H, j, vig, F);
    for (let i = 0, k = j * W; i < W; i++, k++) {
      const t = tone[L[k]] * 3, f = F[i], d = k * 4;
      out[d] = (ramp[t] * f + 127) / 255 | 0;
      out[d + 1] = (ramp[t + 1] * f + 127) / 255 | 0;
      out[d + 2] = (ramp[t + 2] * f + 127) / 255 | 0;
      out[d + 3] = 255;
    }
    if (++done % ROWS_PER_TICK === 0) tick(done, total);
  }
  // 7. grain (shared paper, world-anchored)
  const gScale = grainScale(fr);
  if (amount > 0) {
    const fbm = require('../paper').fbm, fo = { scale: gScale, octaves: GRAIN_OCTAVES, gain: 0.5, seed };
    for (let j = 0; j < H; j++) {
      const y = fr.y0 + (j + 0.5) * fr.sy;
      for (let i = 0, d = j * W * 4; i < W; i++, d += 4) {
        const f = 1 + amount * (2 * fbm(fr.x0 + (i + 0.5) * fr.sx, y, fo) - 1);
        out[d] = c8(out[d] * f); out[d + 1] = c8(out[d + 1] * f); out[d + 2] = c8(out[d + 2] * f);
      }
      if (++done % ROWS_PER_TICK === 0) tick(done, total);
    }
  }
  for (let k = 0; k < N; k++) { out[k * 4 + 3] = 255; sum += out[k * 4]; }
  tick(total, total);

  const gaps = [];
  if (base.from === 'l0') gaps.push('PAINT_BASE_SCHEMATIC');
  if (base.from === 'minimap') gaps.push('PAINT_BASE_MINIMAP');
  else if (base.approx) gaps.push('PAINT_BASE_APPROX');
  const approx = gaps.length > 0;
  const stats = {
    from: base.from, baseApprox: !!base.approx, thumb, blur, levels: [lv.lo, lv.hi], stretched: lv.stretched,
    grain: amount, grainScale: gScale, vignette: vig, transparent, empty, meanOut: N ? Math.round(sum / N) : 0,
  };
  return { grid, gaps, notes: [], stats, approx };
}

module.exports = {
  ID, VERSION, NEEDS, WANTS, FROM,
  draw,
  tone: { luma, blur3, levels, curveLut, rampLut, vignetteRow, MIN_SPREAD, CLIP, CLIP_THUMB },
};

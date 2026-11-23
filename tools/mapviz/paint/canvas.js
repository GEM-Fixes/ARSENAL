// paint canvas (MV-PNT1): a small rasteriser for paint (paint contract 4.6). Straight rgba8, source-over with the integer
// rule (x * a + 127) / 255 (README 9.2). Light at load.
// Coordinates are screen pixels: px from the west edge, py from the NORTH edge (y down); a draw writes grid row
// H - 1 - floor(py), so glyphs and arrows read upright when the picture is shown north up. Antialias = 4 x 4 subsamples
// per pixel, integer counts; one shape is gathered as subsample bits first and blended once per pixel.
//   create(frame, rgba?) -> grid             rgba8 grid on the frame (name 'pic'), filled with rgba (default transparent)
//   toPx(frame, x, y) -> [px, py], toWorld(frame, px, py) -> [x, y]
//   color(s) -> [r,g,b,a]   mix(a, b, t), mul(a, k)
//   blend(grid, px, py, rgba, cover)          one pixel, cover 0..16 subsamples
//   fillPoly(grid, pts, rgba)                 even-odd
//   strokePath(grid, pts, width, rgba, o?)    o = {closed, dash:[on, off, ..] px, cap:'butt'|'round'}
//   fillCircle, strokeCircle, hatchMask(grid, mask, hatch, o?), hatchPoly(grid, pts, hatch, o?)
//   wobble(pts, o) -> pts                     hand line; o = {amp (px, 1), wave (px, 24), seed, frame}
//   digits(grid, text, px, py, o) -> {w, h}   '0'-'9' '.' '-' '+' 'm' only (else MV_FAULT PAINT_GLYPH); stroke font
//   symbol(grid, name, px, py, o)             flag, spawn, drown, swim, noProne, strong.<code>, north
// Anchors (as built): digits (px, py) = the left end (align left) or the centre (align center) of the text's vertical
// middle; symbol (px, py) = the symbol's centre; symbol o.dir = [dx, dy] screen direction (spawn, default east).
// Author: Imperator_Aug (ARSENAL, ia-0ccb1978)
'use strict';

const S = 4, BITS = S * S;
const POP = new Uint8Array(65536);
for (let i = 1; i < 65536; i++) POP[i] = POP[i >> 1] + (i & 1);

function mvErr(code, msg, detail) { const M = require('../mapviz'); return new M.MvError(code, msg, detail); }

function color(s) {
  if (Array.isArray(s) || ArrayBuffer.isView(s)) return [s[0] | 0, s[1] | 0, s[2] | 0, s[3] === undefined ? 255 : s[3] | 0];
  const m = /^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/.exec(String(s));
  if (!m) throw mvErr('MV_FAULT', 'colour must be #RRGGBB or #RRGGBBAA, not ' + s, { code: 'PAINT_DRAW_BAD' });
  const v = parseInt(m[1], 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255, m[2] ? parseInt(m[2], 16) : 255];
}
const clamp8 = v => v < 0 ? 0 : v > 255 ? 255 : v;
function mix(a, b, t) {
  a = color(a); b = color(b);
  return [0, 1, 2, 3].map(k => clamp8(Math.round(a[k] + (b[k] - a[k]) * t)));
}
function mul(a, k) { a = color(a); return [clamp8(Math.round(a[0] * k)), clamp8(Math.round(a[1] * k)), clamp8(Math.round(a[2] * k)), a[3]]; }

function create(frame, rgba) {
  const W = frame.W, H = frame.H;
  const data = new Uint8ClampedArray(W * H * 4);
  const c = rgba ? color(rgba) : [0, 0, 0, 0];
  if (c[0] || c[1] || c[2] || c[3]) for (let k = 0; k < data.length; k += 4) { data[k] = c[0]; data[k + 1] = c[1]; data[k + 2] = c[2]; data[k + 3] = c[3]; }
  const meta = {};
  if (Math.abs(frame.sy - frame.sx) > 1e-9 * frame.sx) meta.cellY = frame.sy;
  return { name: 'pic', w: W, h: H, cell: frame.sx, ox: frame.x0, oy: frame.y0, etype: 'rgba8', sample: 'cell', scale: 1, offset: 0,
    nodata: null, meta, data };
}

function toPx(frame, x, y) { return [(x - frame.x0) / frame.sx, frame.H - (y - frame.y0) / frame.sy]; }
function toWorld(frame, px, py) { return [frame.x0 + px * frame.sx, frame.y0 + (frame.H - py) * frame.sy]; }

// ---- blending (straight alpha, integer rule)
function blendIdx(d, p, c, cover) {
  if (cover <= 0) return;
  const a = cover >= BITS ? c[3] : ((c[3] * cover + 8) >> 4);
  if (!a) return;
  const da = d[p + 3];
  if (a === 255) { d[p] = c[0]; d[p + 1] = c[1]; d[p + 2] = c[2]; d[p + 3] = 255; return; }
  if (da === 255) {
    const ia = 255 - a;
    d[p] = ((c[0] * a + d[p] * ia + 127) / 255) | 0;
    d[p + 1] = ((c[1] * a + d[p + 1] * ia + 127) / 255) | 0;
    d[p + 2] = ((c[2] * a + d[p + 2] * ia + 127) / 255) | 0;
    return;
  }
  const rest = ((da * (255 - a) + 127) / 255) | 0;
  const oa = a + rest;
  if (!oa) return;
  for (let k = 0; k < 3; k++) d[p + k] = ((c[k] * a + d[p + k] * rest + (oa >> 1)) / oa) | 0;
  d[p + 3] = oa;
}

function blend(grid, px, py, rgba, cover) {
  const i = Math.floor(px), r = Math.floor(py);
  if (i < 0 || r < 0 || i >= grid.w || r >= grid.h) return;
  blendIdx(grid.data, ((grid.h - 1 - r) * grid.w + i) * 4, color(rgba), cover === undefined ? BITS : cover);
}

// ---- coverage scratch: one Uint16 of subsample bits per pixel, plus the list of touched pixels (screen index r * W + i)
const SCR = new WeakMap();
function scratch(grid) {
  let c = SCR.get(grid);
  const n = grid.w * grid.h;
  if (!c || c.bits.length !== n) { c = { bits: new Uint16Array(n), list: [] }; SCR.set(grid, c); }
  return c;
}
function orBits(c, idx, b) { if (!c.bits[idx]) c.list.push(idx); c.bits[idx] |= b; }
// flush: blend every touched pixel with its subsample count, then clear. fn(idx, bits) may return another bit set.
function flush(grid, c, rgba, fn) {
  const W = grid.w, H = grid.h, d = grid.data, col = color(rgba);
  for (const idx of c.list) {
    let b = c.bits[idx];
    c.bits[idx] = 0;
    if (fn) b = fn(idx, b);
    if (!b) continue;
    const r = (idx / W) | 0, i = idx - r * W;
    blendIdx(d, ((H - 1 - r) * W + i) * 4, col, POP[b]);
  }
  c.list.length = 0;
}
function discard(c) { for (const idx of c.list) c.bits[idx] = 0; c.list.length = 0; }

// subsample t of an axis lies at (t + 0.5) / 4 px
const subLo = v => Math.ceil(v * S - 0.5);

function polyCov(grid, c, pts) {
  if (!pts || pts.length < 3) return;
  const W = grid.w, H = grid.h, n = pts.length;
  let ymin = Infinity, ymax = -Infinity;
  for (const p of pts) { if (p[1] < ymin) ymin = p[1]; if (p[1] > ymax) ymax = p[1]; }
  const t0 = Math.max(0, subLo(ymin)), t1 = Math.min(H * S - 1, subLo(ymax) - 1);
  const xs = [];
  for (let t = t0; t <= t1; t++) {
    const y = (t + 0.5) / S;
    xs.length = 0;
    for (let e = 0, f = n - 1; e < n; f = e++) {
      const a = pts[f], b = pts[e];
      if ((a[1] <= y && y < b[1]) || (b[1] <= y && y < a[1])) xs.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
    }
    if (xs.length < 2) continue;
    xs.sort((p, q) => p - q);
    const r = t >> 2, k = t & 3, row = r * W, full = 0xF << (k * 4);
    for (let q = 0; q + 1 < xs.length; q += 2) {
      let s = Math.max(0, subLo(xs[q]));
      const s1 = Math.min(W * S - 1, subLo(xs[q + 1]) - 1);
      while (s <= s1) {
        const m = s & 3;
        if (m === 0 && s + 3 <= s1) { orBits(c, row + (s >> 2), full); s += 4; } else { orBits(c, row + (s >> 2), 1 << (k * 4 + m)); s++; }
      }
    }
  }
}

function fillPoly(grid, pts, rgba) {
  const c = scratch(grid);
  polyCov(grid, c, pts);
  flush(grid, c, rgba);
}

// one segment a -> b as a capsule of half width hw; capA / capB false = butt end (the subsample must project inside)
function segCov(grid, c, a, b, hw, capA, capB) {
  const W = grid.w, H = grid.h;
  const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
  const lo = (v, w) => Math.max(0, subLo(v - w)), hiS = (v, w, N) => Math.min(N * S - 1, subLo(v + w) - 1 + 1);
  const sx0 = lo(Math.min(a[0], b[0]), hw), sx1 = hiS(Math.max(a[0], b[0]), hw, W);
  const sy0 = lo(Math.min(a[1], b[1]), hw), sy1 = hiS(Math.max(a[1], b[1]), hw, H);
  const hw2 = hw * hw;
  for (let t = sy0; t <= sy1; t++) {
    const y = (t + 0.5) / S, r = t >> 2, k = t & 3, row = r * W;
    for (let s = sx0; s <= sx1; s++) {
      const x = (s + 0.5) / S;
      let u = L2 > 0 ? ((x - a[0]) * dx + (y - a[1]) * dy) / L2 : 0;
      if (u < 0) { if (!capA && L2 > 0) continue; u = 0; } else if (u > 1) { if (!capB && L2 > 0) continue; u = 1; }
      const ex = a[0] + u * dx - x, ey = a[1] + u * dy - y;
      if (ex * ex + ey * ey <= hw2) orBits(c, row + (s >> 2), 1 << (k * 4 + (s & 3)));
    }
  }
}

// a path into the scratch (no blend); long segments are cut into 16 px pieces so a bounding box stays small
function pathCov(grid, c, pts, width, closed, round) {
  if (!pts || !pts.length) return;
  const hw = Math.max(0.25, width / 2);
  const P = closed && pts.length > 2 ? pts.concat([pts[0]]) : pts;
  if (P.length === 1) { segCov(grid, c, P[0], P[0], hw, true, true); return; }
  const last = P.length - 2;
  for (let q = 0; q <= last; q++) {
    const a = P[q], b = P[q + 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(len / 16));
    for (let m = 0; m < n; m++) {
      const p0 = [a[0] + (b[0] - a[0]) * m / n, a[1] + (b[1] - a[1]) * m / n];
      const p1 = [a[0] + (b[0] - a[0]) * (m + 1) / n, a[1] + (b[1] - a[1]) * (m + 1) / n];
      const startEnd = !closed && q === 0 && m === 0, endEnd = !closed && q === last && m === n - 1;
      segCov(grid, c, p0, p1, hw, startEnd ? round : true, endEnd ? round : true);
    }
  }
}

function dashSplit(pts, dash, closed) {
  const P = closed && pts.length > 2 ? pts.concat([pts[0]]) : pts;
  const pat = dash.map(Number).filter(v => v >= 0);
  if (!pat.length || pat.every(v => v === 0)) return [P];
  const out = [];
  let k = 0, left = pat[0], on = true, cur = [P[0]];
  for (let q = 0; q + 1 < P.length; q++) {
    let a = P[q];
    const b = P[q + 1];
    let seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    while (seg > 0) {
      if (left >= seg) { left -= seg; if (on) cur.push(b); seg = 0; break; }
      const f = left / seg, m = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
      if (on) { cur.push(m); if (cur.length > 1) out.push(cur); }
      on = !on; cur = on ? [m] : [];
      seg -= left; a = m;
      k = (k + 1) % pat.length; left = pat[k];
      let guard = 0;
      while (left === 0 && guard++ < pat.length) { on = !on; cur = on ? [a] : []; k = (k + 1) % pat.length; left = pat[k]; }
    }
  }
  if (on && cur.length > 1) out.push(cur);
  return out;
}

function strokePath(grid, pts, width, rgba, o) {
  o = o || {};
  if (!pts || !pts.length) return;
  const c = scratch(grid);
  const round = o.cap === 'round';
  if (o.dash && o.dash.length) for (const part of dashSplit(pts, o.dash, !!o.closed)) pathCov(grid, c, part, width, false, round);
  else pathCov(grid, c, pts, width, !!o.closed, round);
  flush(grid, c, rgba);
}

function ringCov(grid, c, cx, cy, rIn, rOut) {
  const W = grid.w, H = grid.h;
  const sx0 = Math.max(0, subLo(cx - rOut)), sx1 = Math.min(W * S - 1, subLo(cx + rOut));
  const sy0 = Math.max(0, subLo(cy - rOut)), sy1 = Math.min(H * S - 1, subLo(cy + rOut));
  const o2 = rOut * rOut, i2 = rIn > 0 ? rIn * rIn : -1;
  for (let t = sy0; t <= sy1; t++) {
    const y = (t + 0.5) / S - cy, r = t >> 2, k = t & 3, row = r * W;
    for (let s = sx0; s <= sx1; s++) {
      const x = (s + 0.5) / S - cx, d2 = x * x + y * y;
      if (d2 <= o2 && d2 >= i2) orBits(c, row + (s >> 2), 1 << (k * 4 + (s & 3)));
    }
  }
}
function fillCircle(grid, cx, cy, r, rgba) { const c = scratch(grid); ringCov(grid, c, cx, cy, -1, r); flush(grid, c, rgba); }
function strokeCircle(grid, cx, cy, r, width, rgba) {
  const c = scratch(grid), hw = Math.max(0.25, width / 2);
  ringCov(grid, c, cx, cy, r - hw, r + hw); flush(grid, c, rgba);
}

// ---- hatches: lines anchored at world (0, 0), so neighbouring pictures join. Distance is measured in pixels.
function hatchTerms(grid, hatch) {
  const W = grid.w, H = grid.h;
  const a = (Number(hatch.angle) || 0) * Math.PI / 180, sa = Math.sin(a), ca = Math.cos(a);
  const x0 = grid.ox / grid.cell, cy = grid.meta && grid.meta.cellY > 0 ? grid.meta.cellY : grid.cell, y0 = grid.oy / cy;
  // A per sub column (screen x), B per sub row (screen y, top first) -> d = A + B, north up
  const A = new Float64Array(W * S), B = new Float64Array(H * S);
  for (let s = 0; s < W * S; s++) A[s] = -(x0 + (s + 0.5) / S) * sa;
  for (let t = 0; t < H * S; t++) B[t] = (y0 + H - (t + 0.5) / S) * ca;
  const gap = Math.max(1, Number(hatch.gap) || 8), hw = Math.max(0.25, (Number(hatch.width) || 1) / 2);
  return { A, B, gap, hw };
}
function lineBits(T, r, i) {
  let b = 0;
  for (let k = 0; k < S; k++) {
    const bt = T.B[r * S + k];
    for (let m = 0; m < S; m++) {
      const d = T.A[i * S + m] + bt, q = d - T.gap * Math.round(d / T.gap);
      if (q <= T.hw && q >= -T.hw) b |= 1 << (k * 4 + m);
    }
  }
  return b;
}

// mask: Uint8Array W x H in GRID rows (row 0 = min world y), nonzero = hatched; or fn(i, j) -> bool (grid indices)
function hatchMask(grid, mask, hatch, o) {
  o = o || {};
  const W = grid.w, H = grid.h, d = grid.data;
  const T = hatchTerms(grid, hatch), col = color(hatch.color), fill = o.fill ? color(o.fill) : null;
  const isFn = typeof mask === 'function';
  let n = 0;
  for (let j = 0; j < H; j++) {
    const r = H - 1 - j;
    for (let i = 0; i < W; i++) {
      if (!(isFn ? mask(i, j) : mask[j * W + i])) continue;
      n++;
      const p = (j * W + i) * 4;
      if (fill) blendIdx(d, p, fill, BITS);
      const b = lineBits(T, r, i);
      if (b) blendIdx(d, p, col, POP[b]);
    }
  }
  return n;
}

function hatchPoly(grid, pts, hatch, o) {
  o = o || {};
  const c = scratch(grid);
  polyCov(grid, c, pts);
  const T = hatchTerms(grid, hatch), W = grid.w, H = grid.h, d = grid.data;
  const col = color(hatch.color), fill = o.fill ? color(o.fill) : null;
  for (const idx of c.list) {
    const b = c.bits[idx];
    c.bits[idx] = 0;
    const r = (idx / W) | 0, i = idx - r * W, p = ((H - 1 - r) * W + i) * 4;
    if (fill) blendIdx(d, p, fill, POP[b]);
    const lb = lineBits(T, r, i) & b;
    if (lb) blendIdx(d, p, col, POP[lb]);
  }
  c.list.length = 0;
}

// ---- hand line
function wobble(pts, o) {
  o = o || {};
  if (!pts || pts.length < 2) return pts ? pts.map(p => [p[0], p[1]]) : [];
  const amp = o.amp === undefined ? 1 : Number(o.amp), wave = o.wave > 0 ? o.wave : 24, seed = o.seed === undefined ? 1 : o.seed | 0;
  const fr = o.frame || null, paper = require('./paper');
  const step = wave / 4;
  const dense = [pts[0]];
  for (let q = 0; q + 1 < pts.length; q++) {
    const a = pts[q], b = pts[q + 1], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let m = 1; m <= n; m++) dense.push([a[0] + (b[0] - a[0]) * m / n, a[1] + (b[1] - a[1]) * m / n]);
  }
  const sc = fr ? wave * fr.sx : wave;
  return dense.map(p => {
    const w = fr ? toWorld(fr, p[0], p[1]) : p;
    return [p[0] + amp * (2 * paper.noise(w[0], w[1], sc, seed) - 1), p[1] + amp * (2 * paper.noise(w[0], w[1], sc, seed ^ 0x5bd1e995) - 1)];
  });
}

// ---- stroke digit font: unit box x 0..adv, y 0 (top) .. 1 (bottom)
const GLYPHS = {
  '0': { w: 0.6, s: [[[0.15, 0], [0.45, 0], [0.6, 0.15], [0.6, 0.85], [0.45, 1], [0.15, 1], [0, 0.85], [0, 0.15], [0.15, 0]]] },
  '1': { w: 0.45, s: [[[0.1, 0.2], [0.3, 0], [0.3, 1]]] },
  '2': { w: 0.6, s: [[[0, 0.15], [0.15, 0], [0.45, 0], [0.6, 0.15], [0.6, 0.35], [0, 1], [0.6, 1]]] },
  '3': { w: 0.6, s: [[[0, 0], [0.6, 0], [0.3, 0.4], [0.45, 0.4], [0.6, 0.55], [0.6, 0.85], [0.45, 1], [0.15, 1], [0, 0.85]]] },
  '4': { w: 0.6, s: [[[0.45, 1], [0.45, 0], [0, 0.7], [0.6, 0.7]]] },
  '5': { w: 0.6, s: [[[0.6, 0], [0, 0], [0, 0.45], [0.4, 0.4], [0.6, 0.55], [0.6, 0.85], [0.45, 1], [0, 1]]] },
  '6': { w: 0.6, s: [[[0.55, 0], [0.2, 0], [0, 0.3], [0, 0.85], [0.15, 1], [0.45, 1], [0.6, 0.85], [0.6, 0.6], [0.45, 0.45], [0, 0.5]]] },
  '7': { w: 0.6, s: [[[0, 0], [0.6, 0], [0.2, 1]]] },
  '8': { w: 0.6, s: [[[0.3, 0.45], [0.05, 0.3], [0.05, 0.1], [0.15, 0], [0.45, 0], [0.55, 0.1], [0.55, 0.3], [0.3, 0.45], [0, 0.65], [0, 0.9], [0.1, 1], [0.5, 1], [0.6, 0.9], [0.6, 0.65], [0.3, 0.45]]] },
  '9': { w: 0.6, s: [[[0.6, 0.5], [0.15, 0.55], [0, 0.4], [0, 0.15], [0.15, 0], [0.45, 0], [0.6, 0.15], [0.6, 0.7], [0.4, 1], [0.05, 1]]] },
  // the point is a solid dot (dot: centre in the unit box), radius max(1, size / 8): a one-point stroke was 1-2 px at size
  // 10 and vanished under the halo, so 2.5 read as 25
  '.': { w: 0.2, s: [], dot: [0.1, 0.88] },
  '-': { w: 0.5, s: [[[0.05, 0.55], [0.45, 0.55]]] },
  '+': { w: 0.6, s: [[[0.05, 0.55], [0.55, 0.55]], [[0.3, 0.3], [0.3, 0.8]]] },
  'm': { w: 0.84, s: [[[0, 1], [0, 0.4]], [[0, 0.5], [0.15, 0.4], [0.3, 0.4], [0.42, 0.5], [0.42, 1]], [[0.42, 0.5], [0.57, 0.4], [0.72, 0.4], [0.84, 0.5], [0.84, 1]]] },
};
const GAP = 0.18;
const dotRadius = size => Math.max(1, size / 8);

function textWidth(text, size) {
  let w = 0;
  for (let q = 0; q < text.length; q++) w += GLYPHS[text[q]].w + (q ? GAP : 0);
  return w * size;
}

function digits(grid, text, px, py, o) {
  o = o || {};
  text = String(text);
  for (const ch of text) if (!GLYPHS[ch]) throw mvErr('MV_FAULT', 'paint digits: no glyph for "' + ch + '" (numerals, . - + m only)', { code: 'PAINT_GLYPH' });
  const size = o.size > 0 ? o.size : 11, lw = o.width > 0 ? o.width : Math.max(1, size / 9);
  const tw = textWidth(text, size);
  const left = o.align === 'center' ? px - tw / 2 : px, top = py - size / 2;
  const strokes = [], dots = [], dr = dotRadius(size);
  let x = left;
  for (let q = 0; q < text.length; q++) {
    const g = GLYPHS[text[q]];
    if (q) x += GAP * size;
    for (const s of g.s) strokes.push(s.map(p => [x + p[0] * size, top + p[1] * size]));
    if (g.dot) dots.push([x + g.dot[0] * size, top + g.dot[1] * size]);
    x += g.w * size;
  }
  const c = scratch(grid);
  if (o.halo) {
    for (const s of strokes) pathCov(grid, c, s, lw + 2, false, true);
    for (const d of dots) ringCov(grid, c, d[0], d[1], -1, dr + 1);
    flush(grid, c, o.halo);
  }
  for (const s of strokes) pathCov(grid, c, s, lw, false, true);
  for (const d of dots) ringCov(grid, c, d[0], d[1], -1, dr);
  flush(grid, c, o.rgba || [0, 0, 0, 255]);
  return { w: tw, h: size };
}

// ---- symbols: unit shapes centred on (0, 0), size = full height in px
const STRONG_MARK = {
  reverse: [[[-0.2, -0.08], [0, 0.14], [0.2, -0.08]]],
  dead: [[[-0.15, -0.15], [0.15, 0.15]], [[-0.15, 0.15], [0.15, -0.15]]],
  high: [[[-0.2, 0.1], [0, -0.14], [0.2, 0.1]]],
  uncont: [[[-0.2, 0], [0.2, 0]]],
  first: [[[0, -0.18], [0, 0.18]]],
  garrison: [[[-0.14, -0.14], [0.14, -0.14], [0.14, 0.14], [-0.14, 0.14], [-0.14, -0.14]]],
  hull: [[[-0.18, 0.08], [-0.12, -0.08], [0, -0.14], [0.12, -0.08], [0.18, 0.08]]],
};
function wave(y, n) { const out = []; for (let q = 0; q <= n; q++) { const x = -0.4 + 0.8 * q / n; out.push([x, y + 0.07 * Math.sin(q / n * Math.PI * 3)]); } return out; }
const SYMBOLS = {
  flag: { poly: [[-0.25, -0.5], [0.45, -0.3], [-0.25, -0.1]], lines: [[[-0.25, 0.5], [-0.25, -0.5]]] },
  spawn: { poly: [[0.5, 0], [-0.4, 0.35], [-0.2, 0], [-0.4, -0.35]], lines: [], turn: true },
  north: { poly: [[0, -0.5], [0.3, 0.4], [0, 0.2], [-0.3, 0.4]], lines: [] },
  noProne: { poly: null, lines: [wave(0, 12)] },
  swim: { poly: null, lines: [wave(-0.13, 12), wave(0.13, 12)] },
  drown: { poly: null, lines: [wave(-0.22, 12), wave(0, 12), wave(0.22, 12)], ring: 0.5 },
};

function symbol(grid, name, px, py, o) {
  o = o || {};
  name = String(name);
  let def = SYMBOLS[name], inner = null;
  if (!def && /^strong\./.test(name)) {
    def = { poly: [[0, -0.5], [0.5, 0], [0, 0.5], [-0.5, 0]], lines: [] };
    inner = STRONG_MARK[name.slice(7)] || [[[0, 0]]];
  }
  if (!def) throw mvErr('MV_FAULT', 'paint symbol: no symbol named ' + name, { code: 'PAINT_GLYPH' });
  const size = o.size > 0 ? o.size : 12, col = color(o.rgba || [0, 0, 0, 255]);
  const lw = o.width > 0 ? o.width : Math.max(1, size / 8);
  const line = o.line ? color(o.line) : null, filled = o.shape !== 'outlined';
  let cs = 1, sn = 0;
  if (def.turn && o.dir) { const L = Math.hypot(o.dir[0], o.dir[1]); if (L > 0) { cs = o.dir[0] / L; sn = o.dir[1] / L; } }
  const tf = p => [px + (p[0] * cs - p[1] * sn) * size, py + (p[0] * sn + p[1] * cs) * size];
  const c = scratch(grid);
  if (def.poly) {
    const P = def.poly.map(tf);
    if (filled) { polyCov(grid, c, P); flush(grid, c, col); if (line) { pathCov(grid, c, P, lw, true, true); flush(grid, c, line); } }
    else { if (o.halo) { polyCov(grid, c, P); flush(grid, c, o.halo); } pathCov(grid, c, P, lw, true, true); flush(grid, c, col); }
  }
  if (def.ring) { ringCov(grid, c, px, py, def.ring * size - lw / 2, def.ring * size + lw / 2); flush(grid, c, col); }
  if (def.lines.length) { for (const l of def.lines) pathCov(grid, c, l.map(tf), lw, false, true); flush(grid, c, col); }
  if (inner) {
    for (const l of inner) pathCov(grid, c, l.map(tf), Math.max(1, lw), false, true);
    flush(grid, c, filled ? (line || [255, 255, 255, 255]) : col);
  }
}

module.exports = {
  SUB: S, create, toPx, toWorld, color, mix, mul, blend, fillPoly, strokePath, fillCircle, strokeCircle, hatchMask, hatchPoly,
  wobble, digits, symbol, textWidth, GLYPHS, SYMBOLS,
  // low level, for the shared files and styles that gather several shapes into one blend
  scratch, polyCov, pathCov, flush, discard, blendIdx, POP,
};

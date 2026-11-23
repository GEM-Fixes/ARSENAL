// sketch (MV-PNT3): graphite hachures from the slope class (design 9). Short strokes down the fall line on a lattice of
// world points, so a 512 px and a 2048 px picture of one map put their strokes in the same world places when the lattice
// step is the same. Stroke density, length, tone and width grow with the slope class.
//   spacing(frame, thumb) -> lattice step in u (20 u x a power of two, at least 5 u)
//   draw(ctx) -> {strokes}
// Author: Imperator_Aug (ARSENAL, ia-1279fff3)
'use strict';

const U32 = 4294967296;

// lattice step: about 6 px (7 on a thumbnail), snapped to 20 u x 2^k so it nests between sizes
function spacing(frame, thumb) {
  const want = (thumb ? 7 : 6) * Math.max(frame.sx, frame.sy) / 20;
  const k = Math.max(-2, Math.ceil(Math.log2(Math.max(want, 1e-9))));
  return 20 * Math.pow(2, k);
}

// ctx: {grid, frame, input, opts, pal, C, P, I, water (Uint8Array or null), seed, step(frac)}
function draw(ctx) {
  const { grid, frame, input, opts, pal, C, P, I, seed } = ctx;
  const height = input.layers.height, cls = input.layers.slopecls;
  const from = opts.thumb ? Math.max(1, (pal.thumbnail && pal.thumbnail.hachureFromClass) || 3) : Math.max(1, pal.hachureFromClass || 1);
  const S = spacing(frame, opts.thumb);
  const x0 = frame.x0, y0 = frame.y0, x1 = frame.x0 + frame.W * frame.sx, y1 = frame.y0 + frame.H * frame.sy;
  const i0 = Math.floor(x0 / S), i1 = Math.ceil(x1 / S), j0 = Math.floor(y0 / S), j1 = Math.ceil(y1 / S);
  const d = height.cell;
  const dark = C.color(pal.graphite), light = C.color(pal.light || pal.graphite);
  const minW = Math.max(1, opts.minStroke || 1);
  const wm = ctx.water;
  let strokes = 0;
  const rows = j1 - j0;
  for (let j = j0; j < j1; j++) {
    if (((j - j0) & 31) === 0) ctx.step((j - j0) / rows);
    for (let i = i0; i < i1; i++) {
      const h1 = P.hash(i, j, seed) >>> 0, h2 = P.hash(i, j, seed + 7919) >>> 0;
      const x = (i + 0.5 + 0.6 * (h1 / U32 - 0.5)) * S, y = (j + 0.5 + 0.6 * ((h1 & 0xffff) / 65536 - 0.5)) * S;
      if (x < x0 || x >= x1 || y < y0 || y >= y1) continue;
      const c = I.sample(cls, x, y, 'nearest');
      if (c === null || c < from) continue;
      const p = Math.min(0.85, (c - from + 1) / 4);
      if (h2 / U32 >= p) continue;
      if (wm) {
        const pi = Math.floor((x - x0) / frame.sx), pj = Math.floor((y - y0) / frame.sy);
        if (pi >= 0 && pj >= 0 && pi < frame.W && pj < frame.H && wm[pj * frame.W + pi]) continue;
      }
      const ha = I.sample(height, x - d, y, 'bilinear'), hb = I.sample(height, x + d, y, 'bilinear');
      const hc = I.sample(height, x, y - d, 'bilinear'), hd = I.sample(height, x, y + d, 'bilinear');
      if (ha === null || hb === null || hc === null || hd === null) continue;
      const gx = hb - ha, gy = hd - hc, gl = Math.hypot(gx, gy);
      if (!(gl > 1e-9)) continue;
      const half = 0.5 * S * (0.5 + 0.08 * Math.min(c, 8)) * (0.8 + 0.4 * ((h2 & 0xffff) / 65536));
      const ux = gx / gl * half, uy = gy / gl * half;
      const a = C.toPx(frame, x - ux, y - uy), b = C.toPx(frame, x + ux, y + uy);
      const steep = c >= 3;
      const base = steep ? dark : light;
      const alpha = opts.thumb ? 255 : Math.min(255, 150 + 15 * Math.min(c, 7));
      const w = Math.max(minW, steep && c >= 5 ? 1.5 : 1);
      C.strokePath(grid, [a, b], w, [base[0], base[1], base[2], Math.round(base[3] * alpha / 255)], { cap: 'round' });
      strokes++;
    }
  }
  ctx.step(1);
  return { strokes, step: S, from };
}

module.exports = { spacing, draw };

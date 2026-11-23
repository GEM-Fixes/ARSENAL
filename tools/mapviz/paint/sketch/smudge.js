// sketch (MV-PNT3): roads as a graphite smudge (design 9): the shared road mask (road and country road materials,
// ground type 7, road decal quads) -> box blur twice -> plus value noise seeded by world position -> soft threshold ->
// the palette roadSmudge colour blended over the paper.
//   radius(frame) -> blur radius px (about 0.75 m, 1..3 px)
//   draw(ctx, roads) -> {roadPx}
// Author: Imperator_Aug (ARSENAL, ia-cc304206)
'use strict';

const BLUR_U = 15;       // u, 0.75 m [I]
const NOISE_U = 60;      // u, 3 m: edge noise lattice [I]
const FINE_U = 40;       // u, 2 m: mottle inside the smudge (two octaves) [I]
const T0 = 0.32, T1 = 0.3;

function radius(frame) {
  return Math.max(1, Math.min(3, Math.round(BLUR_U / Math.max(frame.sx, frame.sy))));
}

function boxBlur(src, w, h, r, step) {
  // rows, then columns; the column pass walks row by row (cache friendly) and adds the rows in the order t = -r..r, in
  // doubles, so each value is the same as a per-pixel sum. step() is called every few rows (paint contract 4.3)
  step = step || (() => {});
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h), n = 2 * r + 1;
  const every = Math.max(1, Math.floor(131072 / w));
  for (let j = 0; j < h; j++) {
    if (j % every === 0) step();
    const o = j * w;
    for (let i = 0; i < w; i++) {
      let s = 0;
      for (let t = -r; t <= r; t++) { const a = i + t; if (a >= 0 && a < w) s += src[o + a]; }
      tmp[o + i] = s / n;
    }
  }
  const acc = new Float64Array(w);
  for (let j = 0; j < h; j++) {
    if (j % every === 0) step();
    acc.fill(0);
    for (let t = -r; t <= r; t++) {
      const b = j + t;
      if (b < 0 || b >= h) continue;
      const o = b * w;
      for (let i = 0; i < w; i++) acc[i] += tmp[o + i];
    }
    const o = j * w;
    for (let i = 0; i < w; i++) out[o + i] = acc[i] / n;
  }
  return out;
}

// ctx: {grid, frame, opts, pal, C, P, seed, step(frac)}; roads = Uint8Array W x H (row 0 = min world y), nonzero = road
function draw(ctx, roads) {
  const { grid, frame, opts, pal, C, P, seed } = ctx;
  const W = frame.W, H = frame.H;
  let any = false;
  const m = new Float32Array(W * H);
  for (let k = 0; k < m.length; k++) if (roads[k]) { m[k] = 1; any = true; }
  if (!any) { ctx.step(1); return { roadPx: 0 }; }
  const r = radius(frame);
  const poke = () => ctx.step(0);
  poke();
  const b = boxBlur(boxBlur(m, W, H, r, poke), W, H, r, poke);
  const col = C.color(pal.roadSmudge || pal.graphite);
  const top = opts.thumb ? 235 : 200;
  let n = 0;
  for (let j = 0; j < H; j++) {
    if ((j & 63) === 0) ctx.step(j / H);
    const y = frame.y0 + (j + 0.5) * frame.sy, py = H - 1 - j;
    for (let i = 0; i < W; i++) {
      const v0 = b[j * W + i];
      if (v0 <= 0.02) continue;
      const x = frame.x0 + (i + 0.5) * frame.sx;
      const v = v0 + 0.7 * (P.noise(x, y, NOISE_U, seed + 31) - 0.5);
      const t = (v - T0) / T1;
      if (t <= 0) continue;
      const mottle = 0.7 + 0.6 * (P.fbm(x, y, { scale: FINE_U, octaves: 2, seed: seed + 37 }) - 0.5);
      const a = Math.round(Math.min(1, t) * mottle * top * col[3] / 255);
      if (!a) continue;
      C.blend(grid, i, py, [col[0], col[1], col[2], a], 16);
      n++;
    }
  }
  ctx.step(1);
  return { roadPx: n };
}

module.exports = { radius, boxBlur, draw };

// kterrain: raster terrain maths and its pool kernel (tools/mapviz/README.md sections 1.2, 1.5, 4.4; design 3).
// Self-contained: node built-ins only, no relative require (README 1.5), so the pool's `work` can run it and a later
// in-process worker can start it from source text. index.js re-exports the functions; this file holds the maths once.
//   slopeClass(height, o?) -> u8 'slopecls' (cell sample) port of
//) + plane fit, float32 maths op by op, FloatToInt = truncation, neighbours clamped
//        to the level. o.noNormals = u8 grid or array (nonzero = the cell has no normals: it
//        its use as a neighbour are skipped, class 0, as land patch cells); nodata heights count as no normals [I].
//   hillshade(height, o?) -> u8 'shade' (lattice)               o = {dirs, weights?, alt, z}; default a main light from
//        the north-west (315, alt 45) with fill lights 270, 360, 225; z absent or 'auto' = from the map's relief (1..8);
//        fine + coarse relief, the fine one lit with zFine <= z; flat ground = 128 (SHADE, see the hillshade section).
//   reliefZ(H, w, h, cell, upm) -> {z, deg}                     the automatic exaggeration and the slope it is based on
//   landform(height, r) -> u8 'landform.r<r>' (cell, 1 m grid)  0 flat, 1 ridge, 2 hollow, 3 slope, 4 peak, 5 pit (README 4.4)
//   ticker(o, total) -> step                                    the o.tick(done, total) progress hook of slopeClass,
//        hillshade (and index.js tint, topo, minFilter): at least every TICK_MS (100) of work and once at the end
//   run(task, io) -> exit code                                  kernel: task.args = {fn:'slopeClass'|'hillshade'|'landform',
//        r?, dirs?, weights?, alt?, z?}; task.inputs[0] = height.mvg; writes <task.out>/<layer>.mvg
// Errors: Error with code RASTER_GRID (not a grid), RASTER_ETYPE, RASTER_SAMPLE (wrong sample kind), RASTER_NAN, RASTER_ARG.
// Author: Imperator_Aug (ARSENAL, ia-5484003f)
'use strict';
const path = require('path');

const f = Math.fround;
const NUMERIC = { u8: 1, i8: 1, u16: 1, i16: 1, u32: 1, i32: 1, f32: 1 };
const LANDFORM = { FLAT: 0, RIDGE: 1, HOLLOW: 2, SLOPE: 3, PEAK: 4, PIT: 5 };

function fail(code, msg) { const e = new Error('raster: ' + msg); e.code = code; return e; }

// ticker(o, total) -> step(n = 1): the optional progress hook o.tick(done, total) of the long functions, called at least
// every TICK_MS of work and once at the end (step.end(): done = total). The CLI binds it to its progress reporter, which
// may throw MV_CANCELLED: that ends the call. A tick that is neither a function nor null is refused (RASTER_ARG). The
// same code is in kregion.js and kcost.js (kernels hold no relative require, README 1.5).
const TICK_MS = 100;
function ticker(o, total) {
  const f = o && o.tick != null ? o.tick : null;
  if (f !== null && typeof f !== 'function') throw fail('RASTER_ARG', 'o.tick must be a function (done, total)');
  if (!f) { const none = () => {}; none.end = none; return none; }
  const T = Math.max(1, Math.round(total) || 1);
  let done = 0, last = Date.now();
  const step = n => {
    done += n === undefined ? 1 : n;
    const t = Date.now();
    if (t - last >= TICK_MS) { last = t; f(done < T ? Math.floor(done) : T, T); }
  };
  step.end = () => f(T, T);
  return step;
}

// checkGrid: a numeric grid object of README 4.3; sample when given must match. Returns w*h.
function checkGrid(g, what, sample) {
  if (!g || typeof g !== 'object' || !g.data || typeof g.data.length !== 'number') throw fail('RASTER_GRID', what + ' is not a grid object');
  if (!NUMERIC[g.etype]) throw fail('RASTER_ETYPE', what + ' must be a numeric grid, not etype ' + g.etype);
  if (!(Number.isInteger(g.w) && Number.isInteger(g.h) && g.w > 0 && g.h > 0)) throw fail('RASTER_GRID', what + ' has no size');
  if (g.data.length !== g.w * g.h) throw fail('RASTER_GRID', what + ' data holds ' + g.data.length + ' values, w*h = ' + g.w * g.h);
  if (!(g.cell > 0)) throw fail('RASTER_GRID', what + ' cell must be > 0');
  if (sample && g.sample !== sample) throw fail('RASTER_SAMPLE', what + ' must have ' + sample + ' samples, not ' + g.sample);
  return g.w * g.h;
}

// values: physical values (raw * scale + offset) as Float64Array, NaN where raw == nodata. A NaN raw value is refused.
// tk: optional ticker step, poked (no count) once per row so a long call stays heard
function values(g, what, tk) {
  const n = checkGrid(g, what), d = g.data, out = new Float64Array(n), w = g.w;
  const sc = g.scale == null ? 1 : g.scale, of = g.offset == null ? 0 : g.offset, nd = g.nodata == null ? null : g.nodata;
  for (let k0 = 0; k0 < n; k0 += w) {
    if (tk) tk(0);
    for (let k = k0, e = k0 + w; k < e; k++) {
      const v = d[k];
      if (v !== v) throw fail('RASTER_NAN', what + ' holds NaN at column ' + (k % g.w) + ', row ' + ((k / g.w) | 0));
      out[k] = nd !== null && v === nd ? NaN : v * sc + of;
    }
  }
  return out;
}

function frame(g, o) {
  return Object.assign({ name: 'x', w: g.w, h: g.h, cell: g.cell, ox: g.ox, oy: g.oy, etype: 'u8', sample: 'cell', scale: 1, offset: 0, nodata: null, meta: {} }, o);
}

// ---------------------------------------------------------------- slope class (engine port)
const OFF_X = [-3, -2, 0, 2, 3, 2, 0, -2, 0];
const OFF_Y = [0, 2, 3, 2, 0, -2, -3, -2, 0];
const RAD_TO_CLASS = f(9.5492964);
const DET_MIN = f(1e-5);

function maskOf(m, n, what) {
  if (m == null) return null;
  const d = m.data ? m.data : m;
  if (!d || d.length !== n) throw fail('RASTER_ARG', what + ' must hold one value per cell (' + n + ')');
  return d;
}

function slopeClass(height, o) {
  const tk = ticker(o, height && height.h);
  const H = values(height, 'height', tk);
  if (height.sample !== 'lattice') throw fail('RASTER_SAMPLE', 'height must have lattice samples, not ' + height.sample);
  const w = height.w, h = height.h, n = w * h;
  const given = maskOf(o && o.noNormals, n, 'noNormals');
  let nn = null;
  for (let k = 0; k < n; k++) {
    if ((given && given[k]) || H[k] !== H[k]) { if (!nn) nn = new Uint8Array(n); nn[k] = 1; }
  }
  const out = new Uint8Array(n);
  const inv = f(1 / f(height.cell));
  const xs = new Int32Array(9), ys = new Int32Array(9);
  for (let y = 0; y < h; y++) {
    for (let t = 0; t < 9; t++) { const yy = y + OFF_Y[t]; ys[t] = (yy < 0 ? 0 : yy > h - 1 ? h - 1 : yy) * w; }
    for (let x = 0; x < w; x++) {
      const k = y * w + x;
      if (nn && nn[k]) { out[k] = 0; continue; }         // cosine = UNIT_Z.z = 1 -> acos 0 -> class 0
      const h0 = H[k];
      let cnt = 0, sX = 0, sY = 0, sXX = 0, sYY = 0, sXY = 0, sXZ = 0, sYZ = 0, sZ = 0;
      for (let t = 0; t < 9; t++) {
        const xx = x + OFF_X[t];
        const kk = ys[t] + (xx < 0 ? 0 : xx > w - 1 ? w - 1 : xx);
        if (nn && nn[kk]) continue;
        const px = OFF_X[t], py = OFF_Y[t];
        const pz = f(f(H[kk] - h0) * inv);
        // in its own order
        sX = f(px + sX); sXX = f(f(px * px) + sXX); sY = f(sY + py); sYY = f(f(py * py) + sYY); sXY = f(f(py * px) + sXY);
        sZ = f(pz + sZ); sXZ = f(f(pz * px) + sXZ); sYZ = f(sYZ + f(pz * py));
        cnt++;
      }
      let cosine = 1;
      if (cnt >= 3) {
        const N = f(cnt), sx = sX, sy = sY, sxy = sXY;
        const nSxy = f(sxy * N), sxSy = f(sx * sy), sySxy = f(sy * sxy), sySy = f(sy * sy), sxySxy = f(sxy * sxy);
        const sxSxy = f(sx * sxy), sxSx = f(sx * sx);
        let det = f(f(sxSxy + sxSxy) * sy);
        det = f(det - f(N * sxySxy));
        det = f(det + f(f(sYY * N) * sXX));
        det = f(det - f(sYY * sxSx));
        det = f(det - f(sXX * sySy));
        if (!(Math.abs(det) < DET_MIN)) {
          const iv = f(1 / det);
          let a = f(f(sXZ * N) * sYY);
          a = f(a - f(sYZ * nSxy)); a = f(a + f(sYZ * sxSy)); a = f(a - f(f(sZ * sx) * sYY)); a = f(a + f(sZ * sySxy));
          a = f(a - f(sXZ * sySy)); a = f(a * iv);
          let b = f(sXZ * nSxy);
          b = f(b - f(sZ * sxSxy)); b = f(b - f(sXZ * sxSy)); b = f(b + f(f(sZ * sy) * sXX)); b = f(b - f(f(sYZ * N) * sXX));
          b = f(b + f(sYZ * sxSx)); b = -f(b * iv);
          // Normal: (-a, -b, 1) normalised; = y*y + x*x + z*z; z * (1 / length)
          const ls = f(f(f(b * b) + f(a * a)) + 1);
          const len = f(Math.sqrt(ls));
          cosine = f(1 / len);
        }
      }
      const v = f(f(Math.acos(cosine)) * RAD_TO_CLASS);
      const c = Math.trunc(v);
      out[k] = c < 0 ? 0 : c > 14 ? 14 : c;
    }
    tk();
  }
  tk.end();
  return frame(height, { name: 'slopecls', sample: 'cell', meta: { classDeg: 6 }, data: out });
}

// ---------------------------------------------------------------- hillshade
// Lights: dirs[0] is the main light (default 315, the north-west, at alt 45, as cartographers light relief), the others
// only fill in: weights default to SHADE.weights for the default dirs, else the main light gets SHADE.main and the rest
// share the remainder. Lambert per light on the gradient x z, weighted sum s in 0..1 (flat ground: s = sin(alt)).
// Two scales: the fine relief (Horn gradient of the heights after a two-pass box blur, smoothRadius, which softens the
// 1 u height steps that would show as false contour lines) and the coarse relief (SHADE.coarseM blocks, blurred, the
// same gradient, bilinear back to the lattice), mixed (1 - SHADE.coarse) : SHADE.coarse, so a broad hill reads as one
// form and a trench as a line. Byte: flat ground = SHADE.flat (128), s = 0 -> 0, s = 1 -> 255, linear on each side.
// z: a number, or absent / 'auto' = from the map's relief (reliefZ): flat maps get more, steep maps less, within
// SHADE.zMin..SHADE.zMax. The coarse scale is lit with z; the fine scale with zFine = min(z, tan(stepDeg) cell
// (2 smooth + 1)), which is z except where the blur radius is at its SHADE.smoothMaxM cap (z above about 4.4 at cell 10,
// 3.9 at cell 5), so the 1 u steps stay under SHADE.stepDeg there too. Both scales see the heights extended past the
// map edge by odd reflection (extend), so a slope shades the same at the edge as inside; nodata heights (R16) near a
// value are filled by linear extrapolation first (fillRings), so the same holds at a nodata edge, and a nodata point
// itself is flat ground (SHADE.flat).
// meta {dirs, weights, alt, z, zAuto, zFine, flat, reliefDeg, smooth, block, coarse}.
const SHADE = Object.freeze({
  dirs: Object.freeze([315, 270, 360, 225]), weights: Object.freeze([0.6, 0.15, 0.15, 0.1]), main: 0.6, alt: 45, flat: 128,
  zMin: 1, zMax: 8, targetDeg: 30, baseM: 10, pct: 0.9, flatDeg: 0.5,
  stepDeg: 5, smoothMaxM: 2, coarseM: 8, coarse: 0.5,
});

// reliefZ: the 90th percentile of the slope (of the samples not flat, >= SHADE.flatDeg) over a 10 m baseline (central differences on a sparse lattice, so the
// micro-roughness of the height steps does not count), and the exaggeration that brings it to SHADE.targetDeg.
// side(a, c, b): the height change per r along one axis: (b - a) / 2 when both ends hold a value, else the one-sided
// difference with the centre, NaN when neither works. With no NaN this is the central difference, as before.
function side(a, c, b) {
  if (a === a && b === b) return (b - a) / 2;
  if (c !== c) return NaN;
  if (b === b) return b - c;
  if (a === a) return c - a;
  return NaN;
}
function reliefZ(H, w, h, cell, upm) {
  const lim = Math.floor((Math.min(w, h) - 1) / 2);
  const r = Math.max(1, Math.min(lim, Math.round(SHADE.baseM * upm / 2 / cell))), st = Math.max(1, r >> 1);
  const bins = new Float64Array(901);
  let n = 0;
  for (let j = r; j < h - r; j += st) {
    for (let i = r; i < w - r; i += st) {
      const k = j * w + i, c0 = H[k], xa = H[k - r], xb = H[k + r], ya = H[k - r * w], yb = H[k + r * w];
      // one end nodata (R16, the rim past the ground mesh): the one-sided difference from the centre point
      const gx = side(xa, c0, xb), gy = side(ya, c0, yb);
      if (gx !== gx || gy !== gy) continue;
      const g = Math.sqrt(gx * gx + gy * gy) / (r * cell);
      bins[Math.min(900, Math.round(Math.atan(g) * 1800 / Math.PI))]++; n++;
    }
  }
  let deg = 0;
  const b0 = Math.round(SHADE.flatDeg * 10);   // flat samples do not count: a flat plain with one hill is lit for the hill
  for (let b = 0; b < b0; b++) n -= bins[b];
  if (n > 0) { let c = 0; for (let b = b0; b <= 900; b++) { c += bins[b]; if (c >= SHADE.pct * n) { deg = b / 10; break; } } }
  const t = Math.tan(deg * Math.PI / 180);
  let z = t > 0 ? Math.tan(SHADE.targetDeg * Math.PI / 180) / t : SHADE.zMax;
  z = Math.min(SHADE.zMax, Math.max(SHADE.zMin, z));
  return { z: Math.round(z * 100) / 100, deg };
}

// one box pass of radius r along rows (step 1) or columns (step w): mean over the window clipped to the grid, or with
// sums (W given) the plain sums of S and W, for the NaN-aware blur (normalised at the end). hillshade blurs grids
// extended by extend() with a margin over the tent's reach, so the clipped windows fall only in the margin it cuts off.
function boxPass(S, D, w, h, r, rows, W, DW, tk) {
  const len = rows ? w : h, lines = rows ? h : w, step = rows ? 1 : w;
  for (let L = 0; L < lines; L++) {
    if (tk) tk();
    const base = rows ? L * w : L;
    let s = 0, c = 0;
    for (let t = 0; t < r && t < len; t++) { const k = base + t * step; s += S[k]; c += W ? W[k] : 1; }
    for (let t = 0; t < len; t++) {
      const kin = t + r, kout = t - r - 1;
      if (kin < len) { const k = base + kin * step; s += S[k]; c += W ? W[k] : 1; }
      if (kout >= 0) { const k = base + kout * step; s -= S[k]; c -= W ? W[k] : 1; }
      const k = base + t * step;
      if (W) { D[k] = s; DW[k] = c; } else D[k] = s / c;
    }
  }
}
// two box passes per axis (a tent of radius 2r); NaN (nodata) cells do not count and stay NaN. own: V is a
// Float32Array scratch the caller gives up (from extend), reused as the second buffer and returned (one array less).
// tk: optional ticker step, one call per line of each pass (2 h + 2 w)
function blur(V, w, h, r, own, tk) {
  const n = w * h;
  let nan = false;
  for (let k = 0; k < n; k++) if (V[k] !== V[k]) { nan = true; break; }
  if (own && !nan && r >= 1) {
    const A = new Float32Array(n);
    boxPass(V, A, w, h, r, true, null, null, tk); boxPass(A, V, w, h, r, true, null, null, tk);
    boxPass(V, A, w, h, r, false, null, null, tk); boxPass(A, V, w, h, r, false, null, null, tk);
    return V;
  }
  let A = new Float32Array(n), B = new Float32Array(n);
  if (r < 1) { for (let k = 0; k < n; k++) A[k] = V[k]; return A; }
  if (!nan) {
    boxPass(V, A, w, h, r, true, null, null, tk); boxPass(A, B, w, h, r, true, null, null, tk);
    boxPass(B, A, w, h, r, false, null, null, tk); boxPass(A, B, w, h, r, false, null, null, tk);
    return B;
  }
  let WA = new Float32Array(n), WB = new Float32Array(n);
  for (let k = 0; k < n; k++) { const v = V[k]; if (v === v) { A[k] = v; WA[k] = 1; } }
  for (const rows of [true, true, false, false]) {
    boxPass(A, B, w, h, r, rows, WA, WB, tk);
    let t = A; A = B; B = t; t = WA; WA = WB; WB = t;
  }
  for (let k = 0; k < n; k++) A[k] = V[k] === V[k] && WA[k] > 0 ? A[k] / WA[k] : NaN;
  return A;
}

// extend V (w x h) past its border by odd reflection: x0 columns on the west, x1 on the east, y0 rows on the south, y1
// on the north. A sample t outside 0..len-1 is 2 V[edge] - V[mirror] (mirror clamped into the grid), so a plane stays a
// plane and the blur and the gradient at the map edge see the slope continue instead of a clipped window. Float32Array
// (W x H); a NaN on either side gives NaN.
function extend(V, w, h, x0, x1, y0, y1) {
  const W = w + x0 + x1, Hh = h + y0 + y1, P = new Float32Array(W * Hh);
  for (let j = 0; j < h; j++) {
    const src = j * w, dst = (j + y0) * W + x0, e0 = V[src], e1 = V[src + w - 1];
    for (let i = 0; i < w; i++) P[dst + i] = V[src + i];
    for (let t = 1; t <= x0; t++) P[dst - t] = 2 * e0 - V[src + (t < w ? t : w - 1)];
    for (let t = 1; t <= x1; t++) P[dst + w - 1 + t] = 2 * e1 - V[src + (t < w ? w - 1 - t : 0)];
  }
  const r0 = y0 * W, r1 = (y0 + h - 1) * W;
  for (let t = 1; t <= y0; t++) {
    const d = (y0 - t) * W, m = (y0 + (t < h ? t : h - 1)) * W;
    for (let i = 0; i < W; i++) P[d + i] = 2 * P[r0 + i] - P[m + i];
  }
  for (let t = 1; t <= y1; t++) {
    const d = (y0 + h - 1 + t) * W, m = (y0 + (t < h ? h - 1 - t : 0)) * W;
    for (let i = 0; i < W; i++) P[d + i] = 2 * P[r1 + i] - P[m + i];
  }
  return P;
}

// light sum s (0..1) per lattice point of H (w x h, spacing cell) for the lights L; a NaN height is flat ground and a
// NaN neighbour takes the centre's height. Callers pass a grid extended by extend(), so the clamped neighbours of the
// outer row and column only touch the margin that is cut off afterwards.
function lightField(H, w, h, cell, z, L, tk) {
  const out = new Float32Array(w * h), k8 = z / (8 * cell), nd = L.n, LX = L.x, LY = L.y, WT = L.w, sa = L.sa;
  const at = (i, j, c) => { const v = H[(j < 0 ? 0 : j >= h ? h - 1 : j) * w + (i < 0 ? 0 : i >= w ? w - 1 : i)]; return v === v ? v : c; };
  for (let j = 0; j < h; j++) {
    if (tk) tk();
    const edgeJ = j === 0 || j === h - 1;
    for (let i = 0; i < w; i++) {
      const k = j * w + i, c = H[k];
      if (c !== c) { out[k] = sa; continue; }
      let a, b, cc, d, e, g, hh, ii;
      if (edgeJ || i === 0 || i === w - 1) {
        a = at(i - 1, j + 1, c); b = at(i, j + 1, c); cc = at(i + 1, j + 1, c);
        d = at(i - 1, j, c); e = at(i + 1, j, c);
        g = at(i - 1, j - 1, c); hh = at(i, j - 1, c); ii = at(i + 1, j - 1, c);
      } else {
        a = H[k + w - 1]; b = H[k + w]; cc = H[k + w + 1]; d = H[k - 1]; e = H[k + 1]; g = H[k - w - 1]; hh = H[k - w]; ii = H[k - w + 1];
        if (a !== a) a = c; if (b !== b) b = c; if (cc !== cc) cc = c; if (d !== d) d = c; if (e !== e) e = c;
        if (g !== g) g = c; if (hh !== hh) hh = c; if (ii !== ii) ii = c;
      }
      const p = ((cc + 2 * e + ii) - (a + 2 * d + g)) * k8;      // dz/dx (east)
      const q = ((a + 2 * b + cc) - (g + 2 * hh + ii)) * k8;     // dz/dy (north)
      let s = 0;
      for (let t = 0; t < nd; t++) {
        const dot = sa - p * LX[t] - q * LY[t];                  // n . L with n = (-p, -q, 1) unnormalised
        if (dot > 0) s += WT[t] * dot;
      }
      out[k] = s / Math.sqrt(1 + p * p + q * q);
    }
  }
  return out;
}

// block means (NaN ignored) of m x m lattice points; block (I, J) sits at lattice position (I m + (m - 1) / 2, ...).
// The last block column and row, when w or h is not a multiple of m, are filled up by odd reflection past the east and
// north edge (as extend()), so every block is whole and its mean sits where the position above says.
function blocks(V, w, h, m, tk) {
  const cw = Math.ceil(w / m), ch = Math.ceil(h / m), S = new Float64Array(cw * ch), C = new Float64Array(cw * ch);
  const PW = cw * m, PH = ch * m;
  const xv = (j, i) => { const b = j * w; return i < w ? V[b + i] : 2 * V[b + w - 1] - V[b + Math.max(0, 2 * (w - 1) - i)]; };
  for (let j = 0; j < PH; j++) {
    if (tk) tk();
    const row = ((j / m) | 0) * cw;
    if (j < h) {
      const b = j * w;
      for (let i = 0; i < w; i++) { const v = V[b + i]; if (v === v) { const K = row + ((i / m) | 0); S[K] += v; C[K]++; } }
      for (let i = w; i < PW; i++) { const v = xv(j, i); if (v === v) { const K = row + ((i / m) | 0); S[K] += v; C[K]++; } }
    } else {
      const jm = Math.max(0, 2 * (h - 1) - j);
      for (let i = 0; i < PW; i++) { const v = 2 * xv(h - 1, i) - xv(jm, i); if (v === v) { const K = row + ((i / m) | 0); S[K] += v; C[K]++; } }
    }
  }
  const out = new Float32Array(cw * ch);
  for (let K = 0; K < out.length; K++) out[K] = C[K] ? S[K] / C[K] : NaN;
  return { M: out, cw, ch };
}

// fill the nodata (NaN) points of V (w x h) within K rings of a value by linear extrapolation, ring by ring (R16: the
// heights past the ground mesh): a point of the next ring takes the mean of 2 V[p + d] - V[p + 2 d] over the 8 directions
// d whose two points hold a value (a plane continues exactly), else the mean of its neighbours that hold one. Each ring
// is computed from the rings before it only, in index order, so the result is the same on every run. The blur and the
// gradient of hillshade then see the slope run on past a nodata edge as they do past the map edge (odd reflection), so a
// plane shades the same up to the edge of the ground mesh. Returns V itself when it holds no NaN.
const D8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
function fillRings(V, w, h, K) {
  const n = w * h;
  let any = false;
  for (let k = 0; k < n; k++) if (V[k] !== V[k]) { any = true; break; }
  if (!any || K < 1) return V;
  const out = new Float64Array(V);
  const has = (i, j) => i >= 0 && j >= 0 && i < w && j < h && out[j * w + i] === out[j * w + i];
  // the first ring: NaN points with a neighbour that holds a value
  let ring = [];
  const seen = new Uint8Array(n);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const k = j * w + i;
    if (out[k] === out[k]) continue;
    for (const [dx, dy] of D8) if (has(i + dx, j + dy)) { ring.push(k); seen[k] = 1; break; }
  }
  for (let r = 0; r < K && ring.length; r++) {
    const val = new Float64Array(ring.length);
    for (let q = 0; q < ring.length; q++) {
      const k = ring[q], i = k % w, j = (k - i) / w;
      let s = 0, c = 0, s1 = 0, c1 = 0;
      for (const [dx, dy] of D8) {
        if (!has(i + dx, j + dy)) continue;
        const a = out[(j + dy) * w + i + dx];
        s1 += a; c1++;
        if (has(i + 2 * dx, j + 2 * dy)) { s += 2 * a - out[(j + 2 * dy) * w + i + 2 * dx]; c++; }
      }
      val[q] = c ? s / c : s1 / c1;
    }
    for (let q = 0; q < ring.length; q++) out[ring[q]] = val[q];
    const next = [];
    for (const k of ring) {
      const i = k % w, j = (k - i) / w;
      for (const [dx, dy] of D8) {
        const ii = i + dx, jj = j + dy;
        if (ii < 0 || jj < 0 || ii >= w || jj >= h) continue;
        const kk = jj * w + ii;
        if (!seen[kk] && out[kk] !== out[kk]) { seen[kk] = 1; next.push(kk); }
      }
    }
    next.sort((a, b) => a - b);
    ring = next;
  }
  return out;
}

// blur radius (cells, one box pass; the tent reaches 2 rs) that turns a 1 u height step into a ramp no steeper than
// SHADE.stepDeg after the exaggeration z: the tent of half-width R spreads the step over a peak slope 1 / ((R + 1) cell);
// at least 1, at most SHADE.smoothMaxM (past that cap hillshade lowers the fine scale's z instead: zFine)
function smoothRadius(z, cell, upm) {
  const need = Math.ceil((z / (Math.tan(SHADE.stepDeg * Math.PI / 180) * cell) - 1) / 2);
  const most = Math.max(1, Math.round(SHADE.smoothMaxM * upm / cell / 2));
  return Math.max(1, Math.min(most, need));
}

function hillshade(height, o) {
  o = o || {};
  const H = values(height, 'height');
  const given = Array.isArray(o.dirs) && o.dirs.length;
  const dirs = given ? o.dirs.map(Number) : SHADE.dirs.slice();
  const alt = o.alt == null ? SHADE.alt : Number(o.alt);
  const auto = o.z == null || o.z === 'auto';
  if (!dirs.every(Number.isFinite) || !Number.isFinite(alt) || !(alt > 0 && alt < 90) || (!auto && !(Number(o.z) > 0 && Number(o.z) <= 100))) {
    throw fail('RASTER_ARG', 'hillshade needs finite dirs, alt in (0, 90), z in (0, 100] or auto');
  }
  let weights;
  if (Array.isArray(o.weights)) {
    weights = o.weights.map(Number);
    if (weights.length !== dirs.length || !weights.every(x => Number.isFinite(x) && x >= 0) || !(weights.reduce((a, b) => a + b, 0) > 0)) throw fail('RASTER_ARG', 'hillshade weights: one number >= 0 per light, not all 0');
  } else if (!given) weights = SHADE.weights.slice();
  else weights = dirs.map((d, t) => dirs.length === 1 ? 1 : t === 0 ? SHADE.main : (1 - SHADE.main) / (dirs.length - 1));
  const sum = weights.reduce((a, b) => a + b, 0);
  weights = weights.map(x => x / sum);
  const w = height.w, h = height.h, cell = height.cell, n = w * h;
  const upm = height.meta && height.meta.upm > 0 ? height.meta.upm : 20;
  const rel = reliefZ(H, w, h, cell, upm);
  const z = auto ? rel.z : Number(o.z);
  const ca = Math.cos(alt * Math.PI / 180), sa = Math.sin(alt * Math.PI / 180), nd = dirs.length;
  const L = { n: nd, x: new Float64Array(nd), y: new Float64Array(nd), w: new Float64Array(weights), sa };
  for (let t = 0; t < nd; t++) { L.x[t] = Math.sin(dirs[t] * Math.PI / 180) * ca; L.y[t] = Math.cos(dirs[t] * Math.PI / 180) * ca; }   // azimuth clockwise from north
  // fine relief, on the heights extended by odd reflection past every edge (margin: the tent reaches 2 rs, Horn 1), lit
  // with zFine: z, or less where the blur radius is at its cap, so a 1 u step still stays under SHADE.stepDeg
  const rs = smoothRadius(z, cell, upm);
  const zFine = Math.min(z, Math.floor(Math.tan(SHADE.stepDeg * Math.PI / 180) * cell * (2 * rs + 1) * 100) / 100);
  const fm = 2 * rs + 1, fw = w + 2 * fm, fh = h + 2 * fm;
  const m = Math.max(2, Math.round(SHADE.coarseM * upm / cell));
  // progress: one step per line of the fine blur (4 passes) and light, the block rows and the output rows
  const tk = ticker(o, 2 * fh + 2 * fw + fh + Math.ceil(h / m) * m + h);
  // nodata heights (R16) within the reach of the fine scale and of one block are filled by linear extrapolation
  // (fillRings), so a slope shades the same up to a nodata edge; the nodata points themselves stay flat (below)
  const HF = fillRings(H, w, h, Math.max(fm + 1, m));
  const fine = lightField(blur(extend(HF, w, h, fm, fm, fm, fm), fw, fh, rs, true, tk), fw, fh, cell, zFine, L, tk);
  // coarse relief: blocks of SHADE.coarseM, extended by 4 blocks (a tent of one block reaches 2, Horn 1, the bilinear
  // step 1 more), lit with the full z; blocks with no height near them are filled 4 blocks deep the same way
  const cb = blocks(HF, w, h, m, tk), cm = 4, cw = cb.cw + 2 * cm, ch = cb.ch + 2 * cm;
  const CM = fillRings(cb.M, cb.cw, cb.ch, cm);
  const coarse = lightField(blur(extend(CM, cb.cw, cb.ch, cm, cm, cm, cm), cw, ch, 1, true), cw, ch, cell * m, z, L);
  const c1 = SHADE.coarse, c0 = 1 - c1;
  // bilinear from the block centres; the margin holds the blocks past the edge, so nothing is clamped
  const xi = new Int32Array(w), xf = new Float64Array(w);
  for (let i = 0; i < w; i++) { const u = (i - (m - 1) / 2) / m + cm; xi[i] = Math.floor(u); xf[i] = u - xi[i]; }
  const F = SHADE.flat, dn = F / sa, up = (255 - F) / (1 - sa);
  const out = new Uint8Array(n);
  for (let j = 0; j < h; j++) {
    const v = (j - (m - 1) / 2) / m + cm, J = Math.floor(v), fy = v - J, r0 = J * cw, r1 = r0 + cw, fr = (j + fm) * fw + fm;
    for (let i = 0; i < w; i++) {
      const I = xi[i], fx = xf[i];
      if (H[j * w + i] !== H[j * w + i]) { out[j * w + i] = F; continue; }   // a nodata height is flat ground at both scales
      const top = coarse[r0 + I] + (coarse[r0 + I + 1] - coarse[r0 + I]) * fx;
      const bot = coarse[r1 + I] + (coarse[r1 + I + 1] - coarse[r1 + I]) * fx;
      const k = j * w + i, s = c0 * fine[fr + i] + c1 * (top + (bot - top) * fy);
      const r = Math.round(s <= sa ? s * dn : F + (s - sa) * up);
      out[k] = r < 0 ? 0 : r > 255 ? 255 : r;
    }
    tk();
  }
  tk.end();
  return frame(height, { name: 'shade', sample: height.sample,
    meta: { dirs, weights, alt, z, zAuto: auto, zFine, flat: F, reliefDeg: rel.deg, smooth: rs, block: m, coarse: c1 }, data: out });
}

// ---------------------------------------------------------------- landform (1 m grid)
// Separable running max over a square window of radius r (van Herk / Gil-Werman), NaN ignored; out NaN when all NaN.
function maxFilter(a, w, h, r, tk) { return maxFilterHerk(a, w, h, r, tk); }
function herk1(src, dst, len, stride, base, r, g, hbuf) {
  const win = 2 * r + 1;
  for (let k = 0; k < len; k++) {
    const v = src[base + k * stride], x = v === v ? v : -Infinity;
    g[k] = k % win === 0 ? x : (x > g[k - 1] ? x : g[k - 1]);
  }
  for (let k = len - 1; k >= 0; k--) {
    const v = src[base + k * stride], x = v === v ? v : -Infinity;
    hbuf[k] = (k % win === win - 1 || k === len - 1) ? x : (x > hbuf[k + 1] ? x : hbuf[k + 1]);
  }
  for (let k = 0; k < len; k++) {
    const lo = k - r < 0 ? 0 : k - r, hi = k + r > len - 1 ? len - 1 : k + r;
    // window [lo, hi] spans at most two blocks of size win: max(hbuf[lo], g[hi]) when they differ in block
    const m = Math.floor(lo / win) === Math.floor(hi / win) ? rangeMax(src, base, stride, lo, hi) : (hbuf[lo] > g[hi] ? hbuf[lo] : g[hi]);
    dst[base + k * stride] = m;
  }
}
function rangeMax(src, base, stride, lo, hi) {
  let m = -Infinity;
  for (let t = lo; t <= hi; t++) { const v = src[base + t * stride]; if (v > m) m = v; }
  return m;
}
// tk: optional ticker step, one call per row and per column (h + w)
function maxFilterHerk(a, w, h, r, tk) {
  const tmp = new Float64Array(w * h), out = new Float64Array(w * h);
  const L = Math.max(w, h), g = new Float64Array(L), hb = new Float64Array(L);
  for (let j = 0; j < h; j++) { herk1(a, tmp, w, 1, j * w, r, g, hb); if (tk) tk(); }
  for (let i = 0; i < w; i++) { herk1(tmp, out, h, w, i, r, g, hb); if (tk) tk(); }
  for (let k = 0; k < out.length; k++) if (out[k] === -Infinity) out[k] = NaN;
  return out;
}

// heights on the 1 m grid: mean of the lattice samples whose position lies in the 1 m cell (README 4.2), u
function metreGrid(height, H, mcell) {
  const w = height.w, h = height.h, cell = height.cell;
  const W = Math.ceil(w * cell / mcell), Hh = Math.ceil(h * cell / mcell);
  const span = (I, len) => {
    let a = Math.ceil(I * mcell / cell - 1e-9), b = Math.ceil((I + 1) * mcell / cell - 1e-9) - 1;
    if (a > len - 1) a = len - 1;
    if (b > len - 1) b = len - 1;
    if (b < a) b = a;
    return [a, b];
  };
  const xs = [], ys = [];
  for (let I = 0; I < W; I++) xs.push(span(I, w));
  for (let J = 0; J < Hh; J++) ys.push(span(J, h));
  const M = new Float64Array(W * Hh);
  for (let J = 0; J < Hh; J++) {
    const [j0, j1] = ys[J];
    for (let I = 0; I < W; I++) {
      const [i0, i1] = xs[I];
      let s = 0, c = 0;
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const v = H[j * w + i]; if (v === v) { s += v; c++; } }
      M[J * W + I] = c ? s / c : NaN;
    }
  }
  return { M, W, H: Hh };
}

// landform at radius r metres: TPI = h - mean over the (2r+1) m square (clipped at the map edge), standardised by the
// TPI's own standard deviation with a floor of 0.02 r m [I]; |TPI| under the threshold: slope (>= 5 deg) or flat; above:
// ridge / hollow; ridge cells with TPI over twice the threshold that are the highest within max(2, r/5) m and stand above
// the mean of the (2r+1) m line through them in all four directions (so a crest line stays a ridge): peak (pits alike).
// Weiss 2001 / R landform thresholds (surveys/terrain.md section 2) [I].
function landform(height, r) {
  r = Number(r);
  if (!Number.isInteger(r) || r < 1 || r > 1000) throw fail('RASTER_ARG', 'landform radius must be an integer 1..1000 m, got ' + r);
  const H = values(height, 'height');
  if (height.sample !== 'lattice') throw fail('RASTER_SAMPLE', 'height must have lattice samples, not ' + height.sample);
  const upm = height.meta && height.meta.upm > 0 ? height.meta.upm : 20;
  const mg = metreGrid(height, H, upm), M = mg.M, W = mg.W, Hh = mg.H, n = W * Hh;
  // summed-area tables of value and count
  const S = new Float64Array((W + 1) * (Hh + 1)), C = new Float64Array((W + 1) * (Hh + 1)), W1 = W + 1;
  for (let J = 0; J < Hh; J++) {
    let rs = 0, rc = 0;
    for (let I = 0; I < W; I++) {
      const v = M[J * W + I];
      if (v === v) { rs += v; rc++; }
      S[(J + 1) * W1 + I + 1] = S[J * W1 + I + 1] + rs;
      C[(J + 1) * W1 + I + 1] = C[J * W1 + I + 1] + rc;
    }
  }
  const tpi = new Float64Array(n);
  let s1 = 0, s2 = 0, cnt = 0;
  for (let J = 0; J < Hh; J++) {
    const j0 = J - r < 0 ? 0 : J - r, j1 = J + r > Hh - 1 ? Hh - 1 : J + r;
    for (let I = 0; I < W; I++) {
      const k = J * W + I, v = M[k];
      if (v !== v) { tpi[k] = NaN; continue; }
      const i0 = I - r < 0 ? 0 : I - r, i1 = I + r > W - 1 ? W - 1 : I + r;
      const a = (j1 + 1) * W1 + i1 + 1, b = j0 * W1 + i1 + 1, c = (j1 + 1) * W1 + i0, d = j0 * W1 + i0;
      const sum = S[a] - S[b] - S[c] + S[d], ct = C[a] - C[b] - C[c] + C[d];
      const t = v - sum / ct;
      tpi[k] = t; s1 += t; s2 += t * t; cnt++;
    }
  }
  const mean = cnt ? s1 / cnt : 0, sd = cnt ? Math.sqrt(Math.max(0, s2 / cnt - mean * mean)) : 0;
  const thr = Math.max(sd, 0.02 * r * upm);
  const pr = Math.max(2, Math.round(r / 5));
  const mx = maxFilter(M, W, Hh, pr);
  const neg = new Float64Array(n);
  for (let k = 0; k < n; k++) neg[k] = -M[k];
  const mn = maxFilter(neg, W, Hh, pr);
  const out = new Uint8Array(n), tanFlat = Math.tan(5 * Math.PI / 180) * 2 * upm;   // rise over 2 m for 5 deg, u
  // a peak (pit) stands above (below) the mean of the line through it in each of 4 directions: a crest line does not
  const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];
  const everyWay = (I, J, v, sign) => {
    for (const [dx, dy] of DIRS) {
      let s = 0, c = 0;
      for (let t = -r; t <= r; t++) {
        const ii = I + t * dx, jj = J + t * dy;
        if (ii < 0 || jj < 0 || ii >= W || jj >= Hh) continue;
        const u = M[jj * W + ii];
        if (u === u) { s += u; c++; }
      }
      if (!(sign * (v - s / c) > thr / 2)) return false;
    }
    return true;
  };
  for (let J = 0; J < Hh; J++) {
    for (let I = 0; I < W; I++) {
      const k = J * W + I, t = tpi[k], v = M[k];
      if (t !== t) { out[k] = LANDFORM.FLAT; continue; }
      if (t > thr) { out[k] = t > 2 * thr && v >= mx[k] && everyWay(I, J, v, 1) ? LANDFORM.PEAK : LANDFORM.RIDGE; continue; }
      if (t < -thr) { out[k] = t < -2 * thr && -v >= mn[k] && everyWay(I, J, v, -1) ? LANDFORM.PIT : LANDFORM.HOLLOW; continue; }
      const at = (ii, jj) => { const u = M[(jj < 0 ? 0 : jj >= Hh ? Hh - 1 : jj) * W + (ii < 0 ? 0 : ii >= W ? W - 1 : ii)]; return u === u ? u : v; };
      const dx = at(I + 1, J) - at(I - 1, J), dy = at(I, J + 1) - at(I, J - 1);
      out[k] = dx * dx + dy * dy >= tanFlat * tanFlat ? LANDFORM.SLOPE : LANDFORM.FLAT;
    }
  }
  return {
    name: 'landform.r' + r, w: W, h: Hh, cell: upm, ox: height.ox, oy: height.oy, etype: 'u8', sample: 'cell', scale: 1, offset: 0,
    nodata: null, meta: { radiusM: r, codes: ['flat', 'ridge', 'hollow', 'slope', 'peak', 'pit'], thresholdU: Math.round(thr * 1000) / 1000 }, data: out,
  };
}

// ---------------------------------------------------------------- kernel
function run(task, io) {
  const a = (task && task.args) || {};
  const input = task && task.inputs && task.inputs[0];
  if (!input || !task.out) throw fail('RASTER_ARG', 'kterrain task needs inputs[0] (height.mvg) and out');
  const height = io.readGrid(input);
  if (io.progress) io.progress.stage('kterrain.' + a.fn, 1);
  let g;
  if (a.fn === 'slopeClass') g = slopeClass(height);
  else if (a.fn === 'hillshade') g = hillshade(height, { dirs: a.dirs, weights: a.weights, alt: a.alt, z: a.z });
  else if (a.fn === 'landform') g = landform(height, a.r);
  else throw fail('RASTER_ARG', 'kterrain fn must be slopeClass, hillshade or landform, not ' + a.fn);
  io.writeGrid(path.join(task.out, g.name + '.mvg'), g);
  if (io.progress) io.progress.step(1);
  return 0;
}

module.exports = { run, slopeClass, hillshade, reliefZ, landform, maxFilter, metreGrid, values, checkGrid, ticker, LANDFORM, SHADE, TICK_MS };

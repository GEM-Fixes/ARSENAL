// render/l4tile: the L4 kernel (render.md freeze draft 4.4; tools/mapviz/README.md 1.5; design 7 L4). Two tasks, chosen by
// task.args.op. Node built-ins only, no relative require; sync; writes only into task.out via io.
//   run(task, io) -> 0
//   op 'shadow': one orthographic shadow map along the sun.
//     N            map size (texels per side);  s0, t0  light-plane coordinate of the corner of texel (0, 0);  texel  u per texel
//     e1, e2, Ls   world unit vectors: the map's s axis, t axis, and the direction toward the sun (depth d = p . Ls; larger
//                  is nearer the sun)
//     pos, uv, idx, inst   grid files: f32 w=3 vertex positions (model frame of the pack), f32 w=2 uv0, u32 w=3 triangles of
//                  pack vertex indices (already offset to the whole pos section), f32 w=13 instance rows: [geom, m x 12]
//                  (row-major 3 x 4, world = m x [x y z 1])
//     geoms        [{tris:[[t0, tCount, mat]]}]   triangle ranges (rows of idx) per geom and material
//     mats         [{cast, test, alpharef, tex (index into alphas) | -1}]
//     alphas       u8 grid files: the alpha of each alpha-tested texture (row 0 = the texture's top row, wrap)
//     height       a lattice grid file (or null): the ground caster, two triangles per lattice cell; nodata points skipped
//     outName      f32 grid N x N: the largest depth seen per texel, EMPTY (-1e30) where nothing casts
//     A texel takes a triangle when its centre lies inside it (edge functions, inclusive); an alpha-tested material
//     drops the sample whose texel alpha (nearest texel, wrap) is below alpharef.
//   op 'relight': one band of output rows [y0, y1) of the picture.
//     W, H, x0, yb, sx, sy   the plan frame (README 4.2);  pic, n, z  grid files pic.l3, l3.n, l3.z (plan frame)
//     shadow, N, s0, t0, texel, e1, e2, Ls, bias (u)   the shadow map and its frame; 4-tap PCF (the 2 x 2 texels around
//                  the receiver, bilinear weights); a tap is lit when d + bias + biasSlope x min(tan a, tanMax) >= the texel depth
//                  (a = the angle between the receiver normal and the sun; biasSlope in u, tanMax default 8)
//     sunE, ambE   [r,g,b] light of the picture; L0, sun0, amb0  the bake light (world unit vector toward the sun, colours)
//     tune         colour tune (see tune below) or null;  translucency  foliage back light factor (0.3)
//     grass        rgba8 grid file on the plan frame or null: rgb = grass texture colour, a = weight x 255
//     gain         the l1 gain (grass target = grass rgb / 255 x 2 x gain x f0(N))
//     outName      rgba8 band grid (h = y1 - y0, oy at row y0); meta {shadowed, lit, copied}
//   Pixel: kind = l3.n alpha (0 none, 1 ground, 2 decal, 3 water, 4 object, 5 foliage, 6 unit). Kind 0 or alpha 0: copied.
//   N = l3.n rgb / 127.5 - 1 (normalised); water N = (0, 0, 1). f0 = sun0 x (max(N.L0, 0) + back0) + amb0, back0 =
//   translucency x max(-N.L0, 0) on foliage, else 0 (so clean light gives p3 back on foliage too);
//   light = sunE x max(N.LE, 0) x S + ambE (+ sunE x translucency x max(-N.LE, 0) x S on foliage);
//   c = tune(p3 / 255 x light / max(f0, amb0)) per channel, rounded and clamped to 0..255; alpha kept.
//   tune(r, g, b, t, out): c = pow(sat((c - 0.5) x contrast + 0.5) x brightness, 1 / gamma); c = sat(c + tone x toneStrength);
//   c = lerp(lum, c, saturation) with lum = (0.2125, 0.7154, 0.0721); shade: s = (0.21, 0.72, 0.07) . c x shadeTone,
//   c = lerp(c, s, shadeIntensity) (shader dx10/postprocess/color_tune.hlsl).
// Author: Imperator_Aug (ARSENAL, ia-600e9740)
'use strict';

const EMPTY = -1e30;

function tune(r, g, b, t, out) {
  out = out || [0, 0, 0];
  if (!t) { out[0] = r; out[1] = g; out[2] = b; return out; }
  const sat = v => (v < 0 ? 0 : v > 1 ? 1 : v);
  const ig = 1 / (t.gamma > 0 ? t.gamma : 1);
  const ct = t.contrast === undefined ? 1 : t.contrast, br = t.brightness === undefined ? 1 : t.brightness;
  const sa = t.saturation === undefined ? 1 : t.saturation;
  const tone = t.tone || [0, 0, 0], ts = t.toneStrength || 0;
  let c0 = sat(Math.pow(sat((r - 0.5) * ct + 0.5) * br, ig) + tone[0] * ts);
  let c1 = sat(Math.pow(sat((g - 0.5) * ct + 0.5) * br, ig) + tone[1] * ts);
  let c2 = sat(Math.pow(sat((b - 0.5) * ct + 0.5) * br, ig) + tone[2] * ts);
  const lum = c0 * 0.2125 + c1 * 0.7154 + c2 * 0.0721;
  c0 = lum + (c0 - lum) * sa; c1 = lum + (c1 - lum) * sa; c2 = lum + (c2 - lum) * sa;
  const si = t.shadeIntensity || 0;
  if (si) {
    const l2 = c0 * 0.21 + c1 * 0.72 + c2 * 0.07, st = t.shadeTone || [0, 0, 0];
    c0 += (l2 * st[0] - c0) * si; c1 += (l2 * st[1] - c1) * si; c2 += (l2 * st[2] - c2) * si;
  }
  out[0] = c0; out[1] = c1; out[2] = c2;
  return out;
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// rasterise one triangle (light-plane texel coordinates ax..cz: fx, fy, depth) into map D (N x N); keep(w0, w1, w2) -> bool
function triangle(D, N, ax, ay, ad, bx, by, bd, cx, cy, cd, keep) {
  const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  if (!(Math.abs(area) > 1e-12)) return 0;
  let i0 = Math.max(0, Math.ceil(Math.min(ax, bx, cx) - 0.5)), i1 = Math.min(N - 1, Math.floor(Math.max(ax, bx, cx) - 0.5));
  let j0 = Math.max(0, Math.ceil(Math.min(ay, by, cy) - 0.5)), j1 = Math.min(N - 1, Math.floor(Math.max(ay, by, cy) - 0.5));
  if (i0 > i1 || j0 > j1) return 0;
  const inv = 1 / area;
  let n = 0;
  for (let j = j0; j <= j1; j++) {
    const py = j + 0.5;
    for (let i = i0; i <= i1; i++) {
      const px = i + 0.5;
      const w0 = ((bx - px) * (cy - py) - (by - py) * (cx - px)) * inv;
      const w1 = ((cx - px) * (ay - py) - (cy - py) * (ax - px)) * inv;
      const w2 = 1 - w0 - w1;
      if (w0 < -1e-9 || w1 < -1e-9 || w2 < -1e-9) continue;
      if (keep && !keep(w0, w1, w2)) continue;
      const d = w0 * ad + w1 * bd + w2 * cd, k = j * N + i;
      if (d > D[k]) D[k] = d;
      n++;
    }
  }
  return n;
}

function shadow(A, io) {
  const N = A.N, D = new Float32Array(N * N).fill(EMPTY);
  const e1 = A.e1, e2 = A.e2, Ls = A.Ls, s0 = A.s0, t0 = A.t0, tx = A.texel;
  const P = (x, y, z, o, k) => { o[k] = ((x * e1[0] + y * e1[1] + z * e1[2]) - s0) / tx; o[k + 1] = ((x * e2[0] + y * e2[1] + z * e2[2]) - t0) / tx; o[k + 2] = x * Ls[0] + y * Ls[1] + z * Ls[2]; };
  const q = new Float64Array(9);
  let tris = 0, texels = 0;
  // objects
  if (A.inst) {
    const pos = io.readGrid(A.pos).data, uv = A.uv ? io.readGrid(A.uv).data : null, idx = io.readGrid(A.idx).data, ig = io.readGrid(A.inst);
    const alphas = (A.alphas || []).map(f => io.readGrid(f));
    const mats = A.mats || [];
    const nv = pos.length / 3;
    const W = new Float64Array(nv * 3);   // per-instance world positions, filled lazily per vertex
    const stamp = new Int32Array(nv).fill(-1);
    for (let r = 0; r < ig.h; r++) {
      if (io.progress && r % 256 === 0) io.progress.check();
      const o = r * 13, g = A.geoms[ig.data[o]] ;
      if (!g) continue;
      const m = ig.data.subarray(o + 1, o + 13);
      const world = v => {
        if (stamp[v] !== r) {
          const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
          W[v * 3] = m[0] * x + m[1] * y + m[2] * z + m[3];
          W[v * 3 + 1] = m[4] * x + m[5] * y + m[6] * z + m[7];
          W[v * 3 + 2] = m[8] * x + m[9] * y + m[10] * z + m[11];
          stamp[v] = r;
        }
        return v * 3;
      };
      for (const [ta, tc, mi] of g.tris) {
        const mt = mats[mi] || { cast: true, test: false, tex: -1 };
        if (!mt.cast) continue;
        const al = mt.test && mt.tex >= 0 ? alphas[mt.tex] : null;
        for (let f = ta; f < ta + tc; f++) {
          const va = idx[f * 3], vb = idx[f * 3 + 1], vc = idx[f * 3 + 2];
          if (va >= nv || vb >= nv || vc >= nv) continue;
          const a = world(va), b = world(vb), c = world(vc);
          P(W[a], W[a + 1], W[a + 2], q, 0); P(W[b], W[b + 1], W[b + 2], q, 3); P(W[c], W[c + 1], W[c + 2], q, 6);
          let keep = null;
          if (al && uv) {
            const ua = uv[va * 2], wa = uv[va * 2 + 1], ub = uv[vb * 2], wb = uv[vb * 2 + 1], uc = uv[vc * 2], wc = uv[vc * 2 + 1];
            const aw = al.w, ah = al.h, ad = al.data, ref = mt.alpharef;
            keep = (w0, w1, w2) => {
              let u = w0 * ua + w1 * ub + w2 * uc, v = w0 * wa + w1 * wb + w2 * wc;
              u -= Math.floor(u); v -= Math.floor(v);
              const i = Math.min(aw - 1, Math.floor(u * aw)), j = Math.min(ah - 1, Math.floor(v * ah));
              return ad[j * aw + i] >= ref;
            };
          }
          texels += triangle(D, N, q[0], q[1], q[2], q[3], q[4], q[5], q[6], q[7], q[8], keep);
          tris++;
        }
      }
    }
  }
  // ground from the height lattice
  let gtris = 0;
  if (A.height) {
    const h = io.readGrid(A.height), w = h.w, d = h.data, sc = h.scale === undefined ? 1 : h.scale, of = h.offset || 0;
    const nd = h.nodata === null || h.nodata === undefined ? null : h.nodata;
    const zs = new Float64Array(w * h.h);
    for (let k = 0; k < zs.length; k++) zs[k] = nd !== null && d[k] === nd ? NaN : d[k] * sc + of;
    const r = new Float64Array(12);
    for (let j = 0; j + 1 < h.h; j++) {
      if (io.progress && j % 64 === 0) io.progress.check();
      for (let i = 0; i + 1 < w; i++) {
        const k = j * w + i, za = zs[k], zb = zs[k + 1], zc = zs[k + w], zd = zs[k + w + 1];
        const xa = h.ox + i * h.cell, ya = h.oy + j * h.cell, xb = xa + h.cell, yc = ya + h.cell;
        P(xa, ya, za, r, 0); P(xb, ya, zb, r, 3); P(xa, yc, zc, r, 6); P(xb, yc, zd, r, 9);
        if (!Number.isNaN(za) && !Number.isNaN(zb) && !Number.isNaN(zd)) { texels += triangle(D, N, r[0], r[1], r[2], r[3], r[4], r[5], r[9], r[10], r[11], null); gtris++; }
        if (!Number.isNaN(za) && !Number.isNaN(zd) && !Number.isNaN(zc)) { texels += triangle(D, N, r[0], r[1], r[2], r[9], r[10], r[11], r[6], r[7], r[8], null); gtris++; }
      }
    }
  }
  io.writeGrid(A.outName, { name: 'shadow', w: N, h: N, cell: tx, ox: s0, oy: t0, etype: 'f32', sample: 'cell', scale: 1, offset: 0, nodata: null,
    meta: { empty: EMPTY, tris, groundTris: gtris, texels }, data: D });
  return 0;
}

function relight(A, io) {
  const pic = io.readGrid(A.pic), ng = io.readGrid(A.n), zg = io.readGrid(A.z);
  const W = A.W, y0 = A.y0, y1 = A.y1;
  if (pic.w !== W || ng.w !== W || zg.w !== W || pic.h !== A.H || ng.h !== A.H || zg.h !== A.H) throw new Error('render/l4tile: pic, n and z must be ' + W + ' x ' + A.H);
  const sg = A.shadow ? io.readGrid(A.shadow) : null;
  const gr = A.grass ? io.readGrid(A.grass) : null;
  const P = pic.data, Nd = ng.data, Z = zg.data, znd = zg.nodata;
  const D = sg ? sg.data : null, N = A.N, s0 = A.s0, t0 = A.t0, tx = A.texel, e1 = A.e1, e2 = A.e2, Ls = A.Ls, bias = A.bias;
  const LE = A.LE, L0 = A.L0, sunE = A.sunE, ambE = A.ambE, sun0 = A.sun0, amb0 = A.amb0, tr = A.translucency || 0;
  const t = A.tune || null, gain = A.gain || 1;
  const out = new Uint8ClampedArray(W * (y1 - y0) * 4);
  const c = [0, 0, 0];
  let shadowed = 0, lit = 0, copied = 0;
  // slope-scaled bias: a PCF tap lies up to sqrt 2 texels from the receiver, where a plane at angle a to the sun differs
  // in depth by that distance x tan a; so bias = bias + biasSlope x min(tan a, tanMax) [I]
  const bSlope = A.biasSlope || 0, tanMax = A.tanMax > 0 ? A.tanMax : 8;
  const lookup = (x, y, z, nl) => {
    if (!D) return 1;
    let bz = bias;
    if (bSlope) {
      const c = Math.abs(nl);
      bz += bSlope * (c > 1e-6 ? Math.min(tanMax, Math.sqrt(Math.max(0, 1 - c * c)) / c) : tanMax);
    }
    const s = x * e1[0] + y * e1[1] + z * e1[2], tt = x * e2[0] + y * e2[1] + z * e2[2], d = x * Ls[0] + y * Ls[1] + z * Ls[2] + bz;
    const fx = (s - s0) / tx - 0.5, fy = (tt - t0) / tx - 0.5;
    const i0 = Math.floor(fx), j0 = Math.floor(fy), ax = fx - i0, ay = fy - j0;
    let S = 0;
    for (let q = 0; q < 4; q++) {
      const i = i0 + (q & 1), j = j0 + (q >> 1);
      const w = ((q & 1) ? ax : 1 - ax) * ((q >> 1) ? ay : 1 - ay);
      if (!w) continue;
      let on = 1;
      if (i >= 0 && j >= 0 && i < N && j < N) { const v = D[j * N + i]; if (v !== EMPTY && d < v) on = 0; }
      S += w * on;
    }
    return S;
  };
  for (let j = y0; j < y1; j++) {
    if (io.progress && (j - y0) % 64 === 0) io.progress.check();
    const y = A.yb + (j + 0.5) * A.sy;
    for (let i = 0; i < W; i++) {
      const k = (j * W + i) * 4, o = ((j - y0) * W + i) * 4;
      const kind = Nd[k + 3], z = Z[j * W + i];
      if (kind === 0 || P[k + 3] === 0 || (znd !== null && znd !== undefined && z === znd)) {
        out[o] = P[k]; out[o + 1] = P[k + 1]; out[o + 2] = P[k + 2]; out[o + 3] = P[k + 3]; copied++; continue;
      }
      let nx = 0, ny = 0, nz = 1;
      if (kind !== 3) {
        nx = Nd[k] / 127.5 - 1; ny = Nd[k + 1] / 127.5 - 1; nz = Nd[k + 2] / 127.5 - 1;
        const nn = Math.hypot(nx, ny, nz);
        if (nn > 1e-6) { nx /= nn; ny /= nn; nz /= nn; } else { nx = 0; ny = 0; nz = 1; }
      }
      const x = A.x0 + (i + 0.5) * A.sx;
      const nle = nx * LE[0] + ny * LE[1] + nz * LE[2];
      const S = lookup(x, y, z, nle);
      if (S < 1 - 1e-6) shadowed++; else lit++;
      const nl0r = nx * L0[0] + ny * L0[1] + nz * L0[2], nl0 = Math.max(0, nl0r);
      const front = Math.max(0, nle) * S, back = kind === 5 ? tr * Math.max(0, -nle) * S : 0;
      // the divisor carries the same foliage back term at the bake light, so --light clean gives p3 back on foliage too
      const back0 = kind === 5 ? tr * Math.max(0, -nl0r) : 0;
      let r = P[k] / 255, g = P[k + 1] / 255, b = P[k + 2] / 255;
      const f0r = sun0[0] * (nl0 + back0) + amb0[0], f0g = sun0[1] * (nl0 + back0) + amb0[1], f0b = sun0[2] * (nl0 + back0) + amb0[2];
      if (gr && kind === 1) {
        const wq = gr.data[k + 3] / 255;
        if (wq > 0) {
          r += (gr.data[k] / 255 * 2 * gain * f0r - r) * wq;
          g += (gr.data[k + 1] / 255 * 2 * gain * f0g - g) * wq;
          b += (gr.data[k + 2] / 255 * 2 * gain * f0b - b) * wq;
        }
      }
      r = r * (sunE[0] * (front + back) + ambE[0]) / Math.max(f0r, amb0[0]);
      g = g * (sunE[1] * (front + back) + ambE[1]) / Math.max(f0g, amb0[1]);
      b = b * (sunE[2] * (front + back) + ambE[2]) / Math.max(f0b, amb0[2]);
      tune(r, g, b, t, c);
      out[o] = Math.round(c[0] * 255); out[o + 1] = Math.round(c[1] * 255); out[o + 2] = Math.round(c[2] * 255); out[o + 3] = P[k + 3];
    }
  }
  io.writeGrid(A.outName, { name: 'band', w: W, h: y1 - y0, cell: A.sx, ox: A.x0, oy: A.yb + y0 * A.sy, etype: 'rgba8', sample: 'cell', scale: 1, offset: 0,
    nodata: null, meta: { shadowed, lit, copied }, data: out });
  return 0;
}

function run(task, io) {
  const A = task && task.args;
  if (!A || (A.op !== 'shadow' && A.op !== 'relight')) throw new Error('render/l4tile: args.op must be shadow or relight');
  return A.op === 'shadow' ? shadow(A, io) : relight(A, io);
}

module.exports = { run, tune, EMPTY, dot };

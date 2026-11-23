// render/l1tile: the L1 ground kernel (tools/mapviz/README.md 1.5, 1.9; design 7 L1). One band of output rows of the
// picture from the ground mesh: rasterised at ss x ss samples per pixel (ss = 2), then box-downsampled (premultiplied,
// the integer rule of README 9.2). Node built-ins only, no relative require; sync; writes only into task.out via io.
//   run(task, io) -> 0     task.args:
//     W, H        picture size (px);  y0, y1  output rows of this band [y0, y1);  x0, yb  world origin of the picture
//     sx, sy      world units per pixel (x, y);  ss  samples per pixel per axis
//     tiling, mul, gain, sun:[r,g,b], amb:[r,g,b], L:[x,y,z] (unit vector toward the sun, mesh frame)
//     mesh        f32 grid w=12, one row per vertex: x, world y, z, nx, ny, nz (mesh frame), u, v, r, g, b, a (0..255)
//     tris        u32 grid w=3, one row per triangle, grouped by part
//     parts       [{t0, t1, layers:[{tex (index into texs) | -1, tex2? (index) | -1, mf? 0..1, flat:[r,g,b], color:[r,g,b]}, {...}]}]
//                 tex = the mip level whose texel is about one output pixel (or the finer of the two nearest), tex2 = the
//                 next coarser level, mf = its weight: the layer colour = bilinear(tex) x (1 - mf) + bilinear(tex2) x mf
//                 (trilinear; both levels wrap at the texture edge). No tex2 or mf 0: tex alone. render/l1 sends tex
//                 alone: it premixes the level pair into one texture (l1.js decodeMix), one bilinear read per layer.
//     texs        rgba8 grid files (row 0 = the texture's top row, as dds.js decodes)
//     global      {tex, box:[x0,y0,x1,y1]} | null    GoH Global Diffuse over that box (row 0 = min world y) [I]
//     mbox        [x0,y0,x1,y1] world box of the mesh (optional)
//     outName     rgba8 grid written for the band (meta.uncovered = pixels with alpha < 255 whose whole footprint is
//                 inside mbox: holes; meta.outside = those reaching past it: the mesh border cuts them or does not
//                 reach the edge of the picture there)
//   Pixel (stored values, no sRGB): blend = tex0 x color0 x a + tex1 x color1 x (1 - a), a = vertex alpha / 255 interpolated
//   with the barycentric weights of the sample in its triangle (as the GPU interpolates the vertex colour; material.inc
//   CalcMaterial k0 = alpha, k1 = 1 - alpha);
//   x global / 255; x vertex rgb / 255 x mul x gain x (sun x max(N.L, 0) + amb); clamped to 0..255 and rounded per sample.
//   Rasterisation: sample centres, edge functions with inclusive edges, the highest z wins (strict >, so the first triangle
//   in file order keeps a tie): the same bytes on every run and for any band split.
// Author: Imperator_Aug (ARSENAL, ia-c6ddded1)
'use strict';

function sampler(t) {
  const w = t.w, h = t.h, d = t.data;
  const pow2 = (w & (w - 1)) === 0 && (h & (h - 1)) === 0, mw = w - 1, mh = h - 1;
  return function (u, v, out, wrap) {
    if (wrap && !pow2) { u -= Math.floor(u); v -= Math.floor(v); }
    const fx = u * w - 0.5, fy = v * h - 0.5;
    let i0 = Math.floor(fx), j0 = Math.floor(fy);
    const tx = fx - i0, ty = fy - j0;
    let i1 = i0 + 1, j1 = j0 + 1;
    if (wrap && pow2) {
      i0 &= mw; i1 &= mw; j0 &= mh; j1 &= mh;
    } else if (wrap) {   // u, v in [0, 1): i0 in -1 .. w-1, i1 in 0 .. w
      if (i0 < 0) i0 += w; if (i1 >= w) i1 -= w; if (j0 < 0) j0 += h; if (j1 >= h) j1 -= h;
    } else {
      i0 = i0 < 0 ? 0 : i0 >= w ? w - 1 : i0; i1 = i1 < 0 ? 0 : i1 >= w ? w - 1 : i1;
      j0 = j0 < 0 ? 0 : j0 >= h ? h - 1 : j0; j1 = j1 < 0 ? 0 : j1 >= h ? h - 1 : j1;
    }
    const a = (j0 * w + i0) * 4, b = (j0 * w + i1) * 4, c = (j1 * w + i0) * 4, e = (j1 * w + i1) * 4;
    const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
    out[0] = d[a] * w00 + d[b] * w10 + d[c] * w01 + d[e] * w11;
    out[1] = d[a + 1] * w00 + d[b + 1] * w10 + d[c + 1] * w01 + d[e + 1] * w11;
    out[2] = d[a + 2] * w00 + d[b + 2] * w10 + d[c + 2] * w01 + d[e + 2] * w11;
  };
}

function fail(msg) { const e = new Error('render/l1tile: ' + msg); e.code = 'RENDER_TASK'; return e; }

function run(task, io) {
  const A = task && task.args;
  if (!A || !(A.W > 0) || !(A.y1 > A.y0) || !(A.sx > 0) || !(A.sy > 0)) throw fail('task args need W, y0 < y1, sx, sy');
  const prog = io.progress || { check() {}, stage() {}, step() {} };
  const ss = A.ss > 0 ? A.ss : 2;
  const W = A.W, SW = W * ss, rows = A.y1 - A.y0, SH = rows * ss, J0 = A.y0 * ss;
  const ssx = A.sx / ss, ssy = A.sy / ss;
  const mesh = io.readGrid(A.mesh), tris = io.readGrid(A.tris);
  if (mesh.etype !== 'f32' || mesh.w !== 12) throw fail('mesh must be an f32 grid 12 wide');
  if (tris.etype !== 'u32' || tris.w !== 3) throw fail('tris must be a u32 grid 3 wide');
  const M = mesh.data, T = tris.data, nv = mesh.h;
  const texs = (A.texs || []).map(f => { const g = io.readGrid(f); if (g.etype !== 'rgba8') throw fail(f + ' is not rgba8'); return sampler(g); });
  const glob = A.global && A.global.tex ? { s: sampler(io.readGrid(A.global.tex)), box: A.global.box } : null;
  const tiling = A.tiling, mul = A.mul, gain = A.gain;
  const sun = A.sun, amb = A.amb, L0 = A.L[0], L1 = A.L[1], L2 = A.L[2];
  const K = mul * gain / 255;
  const col = new Uint8ClampedArray(SW * SH * 4);
  const cov = new Uint8Array(SW * SH);
  const zb = new Float32Array(SW * SH).fill(-Infinity);
  const t0c = [0, 0, 0], t1c = [0, 0, 0], gc = [0, 0, 0], tq = [0, 0, 0];
  const second = (L, s) => (s && L.tex2 >= 0 && L.tex2 < texs.length && L.mf > 0 ? texs[L.tex2] : null);
  let nTri = 0;
  for (const part of A.parts || []) {
    const ly = part.layers || [];
    const l0 = ly[0] || { tex: -1, flat: [128, 128, 128], color: [255, 255, 255] };
    const l1 = ly[1] || l0;
    const s0 = l0.tex >= 0 ? texs[l0.tex] : null, s1 = l1.tex >= 0 ? texs[l1.tex] : null;
    const s0b = second(l0, s0), s1b = second(l1, s1), m0 = s0b ? Math.min(1, l0.mf) : 0, m1 = s1b ? Math.min(1, l1.mf) : 0;
    const c0 = l0.color || [255, 255, 255], c1 = l1.color || [255, 255, 255];
    const f0 = l0.flat || [128, 128, 128], f1 = l1.flat || [128, 128, 128];
    for (let t = part.t0; t < part.t1; t++) {
      if ((++nTri & 4095) === 0) prog.check();
      let a = T[t * 3], b = T[t * 3 + 1], c = T[t * 3 + 2];
      if (a >= nv || b >= nv || c >= nv) continue;
      let X0 = (M[a * 12] - A.x0) / ssx, Y0 = (M[a * 12 + 1] - A.yb) / ssy;
      let X1 = (M[b * 12] - A.x0) / ssx, Y1 = (M[b * 12 + 1] - A.yb) / ssy;
      let X2 = (M[c * 12] - A.x0) / ssx, Y2 = (M[c * 12 + 1] - A.yb) / ssy;
      let area = (X1 - X0) * (Y2 - Y0) - (X2 - X0) * (Y1 - Y0);
      if (!(area !== 0)) continue;
      if (area < 0) { let s = b; b = c; c = s; s = X1; X1 = X2; X2 = s; s = Y1; Y1 = Y2; Y2 = s; area = -area; }
      const minX = Math.min(X0, X1, X2), maxX = Math.max(X0, X1, X2), minY = Math.min(Y0, Y1, Y2), maxY = Math.max(Y0, Y1, Y2);
      const i0 = Math.max(0, Math.ceil(minX - 0.5)), i1 = Math.min(SW - 1, Math.floor(maxX - 0.5));
      const j0 = Math.max(J0, Math.ceil(minY - 0.5)), j1 = Math.min(J0 + SH - 1, Math.floor(maxY - 0.5));
      if (i0 > i1 || j0 > j1) continue;
      const ia = a * 12, ib = b * 12, ic = c * 12;
      for (let j = j0; j <= j1; j++) {
        const py = j + 0.5;
        for (let i = i0; i <= i1; i++) {
          const px = i + 0.5;
          const e0 = (X2 - X1) * (py - Y1) - (Y2 - Y1) * (px - X1);   // opposite vertex a
          if (e0 < 0) continue;
          const e1 = (X0 - X2) * (py - Y2) - (Y0 - Y2) * (px - X2);   // opposite vertex b
          if (e1 < 0) continue;
          const e2 = (X1 - X0) * (py - Y0) - (Y1 - Y0) * (px - X0);   // opposite vertex c
          if (e2 < 0) continue;
          const wa = e0 / area, wb = e1 / area, wc = e2 / area;
          const z = M[ia + 2] * wa + M[ib + 2] * wb + M[ic + 2] * wc;
          const s = (j - J0) * SW + i;
          if (!(z > zb[s])) continue;
          zb[s] = z;
          const u = (M[ia + 6] * wa + M[ib + 6] * wb + M[ic + 6] * wc) * tiling;
          const v = (M[ia + 7] * wa + M[ib + 7] * wb + M[ic + 7] * wc) * tiling;
          const al = (M[ia + 11] * wa + M[ib + 11] * wb + M[ic + 11] * wc) / 255, bl = 1 - al;
          if (al <= 0) { t0c[0] = t0c[1] = t0c[2] = 0; } else if (s0) {
            s0(u, v, t0c, true);
            if (s0b) { s0b(u, v, tq, true); t0c[0] += (tq[0] - t0c[0]) * m0; t0c[1] += (tq[1] - t0c[1]) * m0; t0c[2] += (tq[2] - t0c[2]) * m0; }
          } else { t0c[0] = f0[0]; t0c[1] = f0[1]; t0c[2] = f0[2]; }
          if (bl <= 0) { t1c[0] = t1c[1] = t1c[2] = 0; } else if (s1) {
            s1(u, v, t1c, true);
            if (s1b) { s1b(u, v, tq, true); t1c[0] += (tq[0] - t1c[0]) * m1; t1c[1] += (tq[1] - t1c[1]) * m1; t1c[2] += (tq[2] - t1c[2]) * m1; }
          } else { t1c[0] = f1[0]; t1c[1] = f1[1]; t1c[2] = f1[2]; }
          let r = t0c[0] * c0[0] / 255 * al + t1c[0] * c1[0] / 255 * bl;
          let g = t0c[1] * c0[1] / 255 * al + t1c[1] * c1[1] / 255 * bl;
          let bb = t0c[2] * c0[2] / 255 * al + t1c[2] * c1[2] / 255 * bl;
          if (glob) {
            const wx = A.x0 + px * ssx, wy = A.yb + py * ssy, gb = glob.box;
            glob.s((wx - gb[0]) / (gb[2] - gb[0]), (wy - gb[1]) / (gb[3] - gb[1]), gc, false);
            r *= gc[0] / 255; g *= gc[1] / 255; bb *= gc[2] / 255;
          }
          const nx = M[ia + 3] * wa + M[ib + 3] * wb + M[ic + 3] * wc;
          const ny = M[ia + 4] * wa + M[ib + 4] * wb + M[ic + 4] * wc;
          const nz = M[ia + 5] * wa + M[ib + 5] * wb + M[ic + 5] * wc;
          const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
          let d = (nx * L0 + ny * L1 + nz * L2) / nl;
          if (d < 0) d = 0;
          const o = s * 4;
          // Uint8ClampedArray stores round-half-even and clamps 0..255: the same bytes on every run
          col[o] = r * (M[ia + 8] * wa + M[ib + 8] * wb + M[ic + 8] * wc) * K * (sun[0] * d + amb[0]);
          col[o + 1] = g * (M[ia + 9] * wa + M[ib + 9] * wb + M[ic + 9] * wc) * K * (sun[1] * d + amb[1]);
          col[o + 2] = bb * (M[ia + 10] * wa + M[ib + 10] * wb + M[ic + 10] * wc) * K * (sun[2] * d + amb[2]);
          cov[s] = 1;
        }
      }
    }
  }
  // box downsample ss x ss, premultiplied (alpha 255 where covered, 0 where not)
  const out = new Uint8ClampedArray(W * rows * 4);
  const n = ss * ss, half = n >> 1;
  const mb = Array.isArray(A.mbox) ? A.mbox : null;
  let uncovered = 0, outside = 0;
  for (let y = 0; y < rows; y++) {
    const wy = A.yb + (A.y0 + y + 0.5) * A.sy;
    for (let x = 0; x < W; x++) {
      let sr = 0, sg = 0, sb = 0, sa = 0;
      for (let dy = 0; dy < ss; dy++) {
        const row = (y * ss + dy) * SW;
        for (let dx = 0; dx < ss; dx++) {
          const s = row + x * ss + dx;
          if (!cov[s]) continue;
          sr += col[s * 4]; sg += col[s * 4 + 1]; sb += col[s * 4 + 2]; sa += 255;
        }
      }
      const A8 = ((sa + half) / n) | 0, d = (y * W + x) * 4;
      if (A8 < 255) {
        // a pixel whose footprint reaches past the mesh box is an edge pixel (the mesh border cuts it), not a hole
        const px0 = A.x0 + x * A.sx, py0 = wy - 0.5 * A.sy;
        if (mb && (px0 < mb[0] || px0 + A.sx > mb[2] || py0 < mb[1] || py0 + A.sy > mb[3])) outside++; else uncovered++;
      }
      const un = p => (A8 ? Math.min(255, ((p * 255 + (A8 >> 1)) / A8) | 0) : 0);
      out[d] = un(((sr + half) / n) | 0); out[d + 1] = un(((sg + half) / n) | 0); out[d + 2] = un(((sb + half) / n) | 0); out[d + 3] = A8;
    }
  }
  io.writeGrid(A.outName, { name: 'pic.l1.band', w: W, h: rows, cell: A.sx, ox: A.x0, oy: A.yb + A.y0 * A.sy, etype: 'rgba8', sample: 'cell',
    scale: 1, offset: 0, nodata: null, meta: { y0: A.y0, y1: A.y1, uncovered, outside }, data: out });
  return 0;
}

module.exports = { run, sampler };

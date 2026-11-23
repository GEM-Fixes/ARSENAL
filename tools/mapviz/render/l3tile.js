// render/l3tile: the L3 object kernel (freeze render.md 3.1, 4.3; design 7 L3). One band of output rows: the scene pack
// instances drawn from straight above over the pic.l2 base, at ss x ss samples per pixel, then box-downsampled
// (premultiplied, the integer rule of README 9.2). Node built-ins only, no relative require; sync; writes only via io.
//   run(task, io) -> 0     task.args:
//     W, H, y0, y1, x0, yb, sx, sy, ss    picture frame (row 0 = min world y) and the band rows [y0, y1)
//     gain, sun:[r,g,b], amb:[r,g,b], L:[x,y,z]   unit vector toward the sun, world frame
//     pos, nrm (f32 grids w=3), uv0, uv1 (f32 w=2), idx (u32 w=3)    pack vertex data (geom-local indices)
//     inst (f32 w=12: m row-major 3 x 4), insti (u32 w=2: geom, cls 0 object | 1 tree or bush | 2 unit)
//     geoms [{vOff, vCount, iOff, iCount, parts:[{mat, iOff, iCount}], box:[x0,y0,z0,x1,y1,z1]}]
//     mats  [{tex (index into texs) | -1, lm (index) | -1, blend 'none'|'test'|'blend', alpharef, a2c, color:[r,g,b,a],
//             noLight}]
//     texs  rgba8 grid files (row 0 = the texture's top row)
//     base, bn (rgba8 W x H: pic.l2, l2.n), bz (f32 W x H: l2.z, nodata -32768)
//     outName  prefix: <outName>-c.mvg (rgba8 band), <outName>-n.mvg (rgba8), <outName>-z.mvg (f32, nodata -32768)
//   Sample colour = texel (mid grey 128 when no texture) x 2 x colour / 255 x (sun x max(N.L, 0) + amb) x gain
//   (x lightmap texel / 255 x 2 when the material has one; noLight: the light factor is 1) [I], clamped and rounded.
//   A sample is inside a triangle by its centre, with a top-left rule for a centre on an edge (drawn by one triangle).
//   Opaque and alpha-tested parts first (z-buffer, the highest z wins, strict >: the first instance in pack order keeps a
//   tie); a test or a2c part discards texel alpha < alpharef. Then blend parts by their world top z ascending, over the
//   sample with alpha = texel alpha x colour alpha, no z write, behind an opaque sample nothing, a face whose normal
//   points down skipped [I: back faces seen from above]. A fragment below the
//   pixel's ground z (l2.z) - 2 u is dropped [I]. Pixel: base alpha 0, or no sample touched -> the base bytes (and l2.n,
//   l2.z); else the premultiplied mean of the samples (untouched samples carry the base colour and alpha); n, z and kind
//   from the highest-z sample (kind 4 object, 5 foliage = an alpha-tested part of a tree or bush, 6 unit).
// Author: Imperator_Aug (ARSENAL, ia-546dd26f)
'use strict';

const NODATA = -32768;

function sampler(t) {
  const w = t.w, h = t.h, d = t.data;
  return function (u, v, out) {
    u -= Math.floor(u); v -= Math.floor(v);
    const fx = u * w - 0.5, fy = v * h - 0.5;
    let i0 = Math.floor(fx), j0 = Math.floor(fy);
    const tx = fx - i0, ty = fy - j0;
    let i1 = i0 + 1, j1 = j0 + 1;
    if (i0 < 0) i0 += w; if (i1 >= w) i1 -= w; if (j0 < 0) j0 += h; if (j1 >= h) j1 -= h;
    const a = (j0 * w + i0) * 4, b = (j0 * w + i1) * 4, c = (j1 * w + i0) * 4, e = (j1 * w + i1) * 4;
    const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
    out[0] = d[a] * w00 + d[b] * w10 + d[c] * w01 + d[e] * w11;
    out[1] = d[a + 1] * w00 + d[b + 1] * w10 + d[c + 1] * w01 + d[e + 1] * w11;
    out[2] = d[a + 2] * w00 + d[b + 2] * w10 + d[c + 2] * w01 + d[e + 2] * w11;
    out[3] = d[a + 3] * w00 + d[b + 3] * w10 + d[c + 3] * w01 + d[e + 3] * w11;
  };
}

// Edge function of the directed edge P -> Q at (px, py), > 0 on the inside of a triangle with area > 0. It is worked out
// from one fixed vertex order (the smaller point first), so the two triangles that share an edge get exact negatives.
function edge(ax, ay, bx, by, px, py) {
  if (ax < bx || (ax === bx && ay < by)) return (bx - ax) * (py - ay) - (by - ay) * (px - ax);
  return -((ax - bx) * (py - by) - (ay - by) * (px - bx));
}
// Fill rule for a sample exactly on an edge (e == 0): it belongs to the triangle for which the edge is a top or left
// edge (dy < 0, or dy == 0 and dx < 0, with area > 0). Each sample on a shared edge is drawn once.
function topLeft(ax, ay, bx, by) { const dx = bx - ax, dy = by - ay; return dy < 0 || (dy === 0 && dx < 0); }

function fail(msg) { const e = new Error('render/l3tile: ' + msg); e.code = 'RENDER_TASK'; return e; }

function run(task, io) {
  const A = task && task.args;
  if (!A || !(A.W > 0) || !(A.y1 > A.y0) || !(A.sx > 0) || !(A.sy > 0)) throw fail('task args need W, y0 < y1, sx, sy');
  const prog = io.progress || { check() {} };
  const ss = A.ss > 0 ? A.ss : 2;
  const W = A.W, SW = W * ss, rows = A.y1 - A.y0, SH = rows * ss, J0 = A.y0 * ss;
  const ssx = A.sx / ss, ssy = A.sy / ss;
  const base = io.readGrid(A.base), bn = io.readGrid(A.bn), bz = io.readGrid(A.bz);
  if (base.etype !== 'rgba8' || base.w !== W || bn.w !== W || bz.w !== W || bz.etype !== 'f32') throw fail('base, bn, bz must be the picture frame');
  const B = base.data, BN = bn.data, BZ = bz.data;
  const geoms = A.geoms || [], mats = A.mats || [];
  const n = A.inst ? io.readGrid(A.inst) : null, ni = A.insti ? io.readGrid(A.insti) : null;
  const nInst = n ? n.h : 0;
  const POS = nInst ? io.readGrid(A.pos).data : null, NRM = nInst ? io.readGrid(A.nrm).data : null;
  const UV0 = nInst ? io.readGrid(A.uv0).data : null, UV1 = nInst && A.uv1 ? io.readGrid(A.uv1).data : null;
  const IDX = nInst ? io.readGrid(A.idx).data : null;
  const texs = (A.texs || []).map(f => { const g = io.readGrid(f); if (g.etype !== 'rgba8') throw fail(f + ' is not rgba8'); return sampler(g); });
  const gain = A.gain, sun = A.sun, amb = A.amb, L0 = A.L[0], L1 = A.L[1], L2 = A.L[2];
  // samples
  const col = new Float32Array(SW * SH * 4);   // straight rgb + alpha 0..255 of touched samples
  const hit = new Uint8Array(SW * SH);          // 0 untouched, 1 opaque object, 2 blended over the base only
  const zb = new Float32Array(SW * SH).fill(-Infinity);
  const sn = new Float32Array(SW * SH * 3);
  const sk = new Uint8Array(SW * SH);
  // band world range (y) and the whole x range
  const yLo = A.yb + A.y0 * A.sy, yHi = A.yb + A.y1 * A.sy, xLo = A.x0, xHi = A.x0 + W * A.sx;
  const M = n ? n.data : null, I = ni ? ni.data : null;
  const tc = [0, 0, 0, 0], lc = [0, 0, 0, 0];
  const blends = [];
  let nTri = 0, drawn = 0;
  // world positions of one instance's geom
  let WP = new Float64Array(0), WN = new Float64Array(0);
  function prepare(k, g) {
    const m = k * 12, vc = g.vCount;
    if (WP.length < vc * 3) { WP = new Float64Array(vc * 3); WN = new Float64Array(vc * 3); }
    const m0 = M[m], m1 = M[m + 1], m2 = M[m + 2], m3 = M[m + 3], m4 = M[m + 4], m5 = M[m + 5], m6 = M[m + 6], m7 = M[m + 7];
    const m8 = M[m + 8], m9 = M[m + 9], m10 = M[m + 10], m11 = M[m + 11];
    for (let v = 0; v < vc; v++) {
      const s = (g.vOff + v) * 3, x = POS[s], y = POS[s + 1], z = POS[s + 2];
      WP[v * 3] = m0 * x + m1 * y + m2 * z + m3; WP[v * 3 + 1] = m4 * x + m5 * y + m6 * z + m7; WP[v * 3 + 2] = m8 * x + m9 * y + m10 * z + m11;
      const a = NRM[s], b = NRM[s + 1], c = NRM[s + 2];
      let nx = m0 * a + m1 * b + m2 * c, ny = m4 * a + m5 * b + m6 * c, nz = m8 * a + m9 * b + m10 * c;
      const l = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (l > 0) { nx /= l; ny /= l; nz /= l; } else { nx = 0; ny = 0; nz = 1; }
      WN[v * 3] = nx; WN[v * 3 + 1] = ny; WN[v * 3 + 2] = nz;
    }
  }
  function worldBox(k, g) {
    const m = k * 12, b = g.box;
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (let c = 0; c < 8; c++) {
      const x = c & 1 ? b[3] : b[0], y = c & 2 ? b[4] : b[1], z = c & 4 ? b[5] : b[2];
      const X = M[m] * x + M[m + 1] * y + M[m + 2] * z + M[m + 3], Y = M[m + 4] * x + M[m + 5] * y + M[m + 6] * z + M[m + 7];
      const Z = M[m + 8] * x + M[m + 9] * y + M[m + 10] * z + M[m + 11];
      if (X < x0) x0 = X; if (X > x1) x1 = X; if (Y < y0) y0 = Y; if (Y > y1) y1 = Y; if (Z < z0) z0 = Z; if (Z > z1) z1 = Z;
    }
    return [x0, y0, z0, x1, y1, z1];
  }
  // one part of one instance; mode 0 opaque, 1 blend
  function drawPart(g, part, mat, kindOf, blend) {
    const sT = mat.tex >= 0 && mat.tex < texs.length ? texs[mat.tex] : null;
    const sL = mat.lm >= 0 && mat.lm < texs.length && UV1 ? texs[mat.lm] : null;
    const test = mat.blend === 'test' || mat.a2c;
    const aref = mat.alpharef;
    const cr = mat.color[0] / 255, cg = mat.color[1] / 255, cb = mat.color[2] / 255, ca = mat.color[3] / 255;
    const kind = kindOf(test);
    const vo = g.vOff;
    for (let t = 0; t < part.iCount; t += 3) {
      if ((++nTri & 4095) === 0) prog.check();
      const q = (g.iOff + part.iOff + t);
      let a = IDX[q], b = IDX[q + 1], c = IDX[q + 2];
      if (a >= g.vCount || b >= g.vCount || c >= g.vCount) continue;
      let X0 = (WP[a * 3] - A.x0) / ssx, Y0 = (WP[a * 3 + 1] - A.yb) / ssy;
      let X1 = (WP[b * 3] - A.x0) / ssx, Y1 = (WP[b * 3 + 1] - A.yb) / ssy;
      let X2 = (WP[c * 3] - A.x0) / ssx, Y2 = (WP[c * 3 + 1] - A.yb) / ssy;
      let area = (X1 - X0) * (Y2 - Y0) - (X2 - X0) * (Y1 - Y0);
      if (!(area !== 0)) continue;
      if (area < 0) { let s = b; b = c; c = s; s = X1; X1 = X2; X2 = s; s = Y1; Y1 = Y2; Y2 = s; area = -area; }
      const i0 = Math.max(0, Math.ceil(Math.min(X0, X1, X2) - 0.5)), i1 = Math.min(SW - 1, Math.floor(Math.max(X0, X1, X2) - 0.5));
      const j0 = Math.max(J0, Math.ceil(Math.min(Y0, Y1, Y2) - 0.5)), j1 = Math.min(J0 + SH - 1, Math.floor(Math.max(Y0, Y1, Y2) - 0.5));
      if (i0 > i1 || j0 > j1) continue;
      const za = WP[a * 3 + 2], zb_ = WP[b * 3 + 2], zc = WP[c * 3 + 2];
      const ua = (vo + a) * 2, ub = (vo + b) * 2, uc = (vo + c) * 2;
      const t0 = topLeft(X1, Y1, X2, Y2), t1 = topLeft(X2, Y2, X0, Y0), t2 = topLeft(X0, Y0, X1, Y1);
      for (let j = j0; j <= j1; j++) {
        const py = j + 0.5, pj = (j / ss) | 0, rowS = (j - J0) * SW;
        for (let i = i0; i <= i1; i++) {
          const px = i + 0.5;
          const e0 = edge(X1, Y1, X2, Y2, px, py);
          if (e0 < 0 || (e0 === 0 && !t0)) continue;
          const e1 = edge(X2, Y2, X0, Y0, px, py);
          if (e1 < 0 || (e1 === 0 && !t1)) continue;
          const e2 = edge(X0, Y0, X1, Y1, px, py);
          if (e2 < 0 || (e2 === 0 && !t2)) continue;
          const wa = e0 / area, wb = e1 / area, wc = e2 / area;
          const z = za * wa + zb_ * wb + zc * wc;
          const s = rowS + i;
          if (!(z > zb[s])) continue;
          const pix = pj * W + ((i / ss) | 0);
          const gz = BZ[pix];
          if (gz !== NODATA && z < gz - 2) continue;
          let r = 128, gg = 128, bb = 128, al = 255;
          if (sT) {
            const u = UV0[ua] * wa + UV0[ub] * wb + UV0[uc] * wc, v = UV0[ua + 1] * wa + UV0[ub + 1] * wb + UV0[uc + 1] * wc;
            sT(u, v, tc);
            r = tc[0]; gg = tc[1]; bb = tc[2]; al = tc[3];
          }
          if (test && al < aref) continue;
          let fr = 1, fg = 1, fb = 1;
          const nx = WN[a * 3] * wa + WN[b * 3] * wb + WN[c * 3] * wc;
          const ny = WN[a * 3 + 1] * wa + WN[b * 3 + 1] * wb + WN[c * 3 + 1] * wc;
          const nz = WN[a * 3 + 2] * wa + WN[b * 3 + 2] * wb + WN[c * 3 + 2] * wc;
          const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
          if (!mat.noLight) {
            let d = (nx * L0 + ny * L1 + nz * L2) / nl;
            if (d < 0) d = 0;
            fr = sun[0] * d + amb[0]; fg = sun[1] * d + amb[1]; fb = sun[2] * d + amb[2];
          }
          let k = 2 * gain;
          let lr = 1, lg = 1, lb = 1;
          if (sL) {
            const u = UV1[ua] * wa + UV1[ub] * wb + UV1[uc] * wc, v = UV1[ua + 1] * wa + UV1[ub + 1] * wb + UV1[uc + 1] * wc;
            sL(u, v, lc);
            lr = lc[0] / 255 * 2; lg = lc[1] / 255 * 2; lb = lc[2] / 255 * 2;
          }
          const R = Math.min(255, Math.max(0, Math.round(r * cr * fr * k * lr)));
          const G = Math.min(255, Math.max(0, Math.round(gg * cg * fg * k * lg)));
          const Bc = Math.min(255, Math.max(0, Math.round(bb * cb * fb * k * lb)));
          const o = s * 4;
          if (!blend) {
            zb[s] = z;
            col[o] = R; col[o + 1] = G; col[o + 2] = Bc; col[o + 3] = 255;
            hit[s] = 1;
            sn[s * 3] = nx / nl; sn[s * 3 + 1] = ny / nl; sn[s * 3 + 2] = nz / nl;
            sk[s] = kind;
          } else {
            const fa = (al / 255) * ca;
            if (!(fa > 0) || nz < 0) continue;   // blend: a face turned away from the camera is not drawn [I]
            if (!hit[s]) {
              const bo = pix * 4;
              col[o] = B[bo]; col[o + 1] = B[bo + 1]; col[o + 2] = B[bo + 2]; col[o + 3] = B[bo + 3];
              hit[s] = 2;
            }
            col[o] = Math.round(R * fa + col[o] * (1 - fa));
            col[o + 1] = Math.round(G * fa + col[o + 1] * (1 - fa));
            col[o + 2] = Math.round(Bc * fa + col[o + 2] * (1 - fa));
            col[o + 3] = Math.round(255 * fa + col[o + 3] * (1 - fa));
          }
        }
      }
    }
  }
  // opaque pass, in pack order
  for (let k = 0; k < nInst; k++) {
    prog.check();
    const g = geoms[I[k * 2]];
    if (!g) continue;
    const wbx = worldBox(k, g);
    if (wbx[4] < yLo || wbx[1] > yHi || wbx[3] < xLo || wbx[0] > xHi) continue;
    const cls = I[k * 2 + 1];
    const kindOf = test => (cls === 2 ? 6 : cls === 1 && test ? 5 : 4);
    let prepared = false, any = false;
    for (const part of g.parts) {
      const mat = mats[part.mat];
      if (!mat) continue;
      if (mat.blend === 'blend') { blends.push({ k, g, part, mat, kindOf, top: wbx[5] }); continue; }
      if (!prepared) { prepare(k, g); prepared = true; }
      drawPart(g, part, mat, kindOf, false);
      any = true;
    }
    if (any) drawn++;
  }
  // blend pass: lower top z first (stable: pack order within a tie)
  blends.sort((a, b) => a.top - b.top || a.k - b.k);
  for (const e of blends) { prepare(e.k, e.g); drawPart(e.g, e.part, e.mat, e.kindOf, true); }
  // downsample
  const out = new Uint8ClampedArray(W * rows * 4), outN = new Uint8ClampedArray(W * rows * 4), outZ = new Float32Array(W * rows);
  const nS = ss * ss, half = nS >> 1;
  let objPx = 0;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < W; x++) {
      const pix = (A.y0 + y) * W + x, bo = pix * 4, d = (y * W + x) * 4;
      let touched = false;
      for (let dy = 0; dy < ss && !touched; dy++) for (let dx = 0; dx < ss; dx++) if (hit[(y * ss + dy) * SW + x * ss + dx]) { touched = true; break; }
      if (!touched || B[bo + 3] === 0) {
        out[d] = B[bo]; out[d + 1] = B[bo + 1]; out[d + 2] = B[bo + 2]; out[d + 3] = B[bo + 3];
        outN[d] = BN[bo]; outN[d + 1] = BN[bo + 1]; outN[d + 2] = BN[bo + 2]; outN[d + 3] = BN[bo + 3];
        outZ[y * W + x] = BZ[pix];
        continue;
      }
      objPx++;
      let pr = 0, pg = 0, pb = 0, pa = 0, best = -1, bestZ = -Infinity;
      const baseZ = BZ[pix] === NODATA ? -Infinity : BZ[pix];
      for (let dy = 0; dy < ss; dy++) {
        for (let dx = 0; dx < ss; dx++) {
          const s = (y * ss + dy) * SW + x * ss + dx;
          let r, g, b, a;
          if (hit[s]) { r = col[s * 4]; g = col[s * 4 + 1]; b = col[s * 4 + 2]; a = col[s * 4 + 3]; } else { r = B[bo]; g = B[bo + 1]; b = B[bo + 2]; a = B[bo + 3]; }
          pr += ((r * a + 127) / 255) | 0; pg += ((g * a + 127) / 255) | 0; pb += ((b * a + 127) / 255) | 0; pa += a;
          if (hit[s] === 1 && zb[s] > bestZ) { bestZ = zb[s]; best = s; }
        }
      }
      const A8 = ((pa + half) / nS) | 0;
      const un = p => (A8 ? Math.min(255, ((p * 255 + (A8 >> 1)) / A8) | 0) : 0);
      out[d] = un(((pr + half) / nS) | 0); out[d + 1] = un(((pg + half) / nS) | 0); out[d + 2] = un(((pb + half) / nS) | 0); out[d + 3] = A8;
      if (best >= 0 && bestZ >= baseZ) {
        outN[d] = Math.round((sn[best * 3] + 1) * 127.5); outN[d + 1] = Math.round((sn[best * 3 + 1] + 1) * 127.5);
        outN[d + 2] = Math.round((sn[best * 3 + 2] + 1) * 127.5); outN[d + 3] = sk[best];
        outZ[y * W + x] = bestZ;
      } else {
        outN[d] = BN[bo]; outN[d + 1] = BN[bo + 1]; outN[d + 2] = BN[bo + 2]; outN[d + 3] = BN[bo + 3];
        outZ[y * W + x] = BZ[pix];
      }
    }
  }
  const oy = A.yb + A.y0 * A.sy, meta = { y0: A.y0, y1: A.y1, drawn, objPx };
  const mk = (suffix, etype, data, nodata) => ({ name: 'pic.l3.band' + suffix, w: W, h: rows, cell: A.sx, ox: A.x0, oy, etype, sample: 'cell', scale: 1, offset: 0,
    nodata, meta, data });
  io.writeGrid(A.outName + '-c.mvg', mk('', 'rgba8', out, null));
  io.writeGrid(A.outName + '-n.mvg', mk('.n', 'rgba8', outN, null));
  io.writeGrid(A.outName + '-z.mvg', mk('.z', 'f32', outZ, NODATA));
  return 0;
}

module.exports = { run, sampler, edge, topLeft, NODATA };

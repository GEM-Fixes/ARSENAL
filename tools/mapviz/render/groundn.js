// render groundn (MV-R2, R2a): the ground surface under the l2 picture: z (u) and the unit normal (world frame: x east,
// y north, z up) at every sample of the plan frame (render.md 3.1; design 7).
//   ground(src, doc, pl, o) -> G
//     o = {grids? ({height}: the map.net height grid of the mode), ply? (false: do not read map.ply), ss? (2)}
//     G = {from: 'ply' | 'net', hash (sha1 of map.ply) | null, notes:[text], SW, SH, band(sj0, sj1) -> {z, n}}
//       band(): samples of the rows sj0 <= sj < sj1 (SW = W x ss samples a row); z Float32Array (NaN = no ground there),
//       n Float32Array x 3. Sample (si, sj) centre: x0 + (si + 0.5) sx / ss, y0 + (sj + 0.5) sy / ss.
//   'ply': the ground mesh l1 draws (resource/map/<key>/map.ply, mesh y = -world y [V l1]), z and the stored vertex normals
//   interpolated barycentrically (normal renormalised); a sample the mesh does not cover takes the 'net' value. 'net': the
//   height lattice, bilinear; nodata corners drop out and the others are weighted again (mapkit heightAt, R16); the
//   normal from central differences at the lattice points, then bilinear. No height there: NaN.
//   Every game the same way (as64 = mowas2 = goh): the mesh and the lattice are read alike [V l1, mapkit].
// Author: Imperator_Aug (ARSENAL, ia-24e48607)
'use strict';
const crypto = require('crypto');

const sha1 = b => crypto.createHash('sha1').update(b).digest('hex');

// normals of a lattice grid (central differences over the lattice; a nodata neighbour falls back to the point itself)
function latticeNormals(g) {
  const w = g.w, h = g.h, d = g.data, nd = g.nodata === null || g.nodata === undefined ? null : g.nodata;
  const sc = g.scale === undefined ? 1 : g.scale, c = g.cell;
  const N = new Float32Array(w * h * 3);
  const at = (i, j) => { const v = d[j * w + i]; return nd !== null && v === nd ? null : v * sc; };
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const h0 = at(i, j);
      let nx = 0, ny = 0, nz = 1;
      if (h0 !== null) {
        const l = i > 0 ? at(i - 1, j) : null, r = i < w - 1 ? at(i + 1, j) : null;
        const b = j > 0 ? at(i, j - 1) : null, t = j < h - 1 ? at(i, j + 1) : null;
        const hl = l === null ? h0 : l, hr = r === null ? h0 : r, hb = b === null ? h0 : b, ht = t === null ? h0 : t;
        const dx = (hr - hl) / (((r === null ? 0 : 1) + (l === null ? 0 : 1)) * c || 1);
        const dy = (ht - hb) / (((t === null ? 0 : 1) + (b === null ? 0 : 1)) * c || 1);
        const L = Math.hypot(dx, dy, 1);
        nx = -dx / L; ny = -dy / L; nz = 1 / L;
      }
      const k = (j * w + i) * 3;
      N[k] = nx; N[k + 1] = ny; N[k + 2] = nz;
    }
  }
  return N;
}

// bilinear z and normal of the lattice at (x, y) into z[o], n[o*3..]; nodata corners drop out (mapkit heightAt rule)
function netSampler(g) {
  const N = latticeNormals(g), d = g.data, w = g.w, h = g.h;
  const nd = g.nodata === null || g.nodata === undefined ? null : g.nodata;
  const sc = g.scale === undefined ? 1 : g.scale, off = g.offset || 0;
  return (x, y, z, n, o) => {
    const fx = (x - g.ox) / g.cell, fy = (y - g.oy) / g.cell;
    if (!(fx >= 0 && fy >= 0 && fx <= w - 1 && fy <= h - 1)) { z[o] = NaN; n[o * 3] = 0; n[o * 3 + 1] = 0; n[o * 3 + 2] = 1; return; }
    const i = Math.min(Math.floor(fx), w - 1), j = Math.min(Math.floor(fy), h - 1);
    const i1 = Math.min(i + 1, w - 1), j1 = Math.min(j + 1, h - 1), tx = fx - i, ty = fy - j;
    const ks = [j * w + i, j * w + i1, j1 * w + i, j1 * w + i1];
    const ws = [(1 - tx) * (1 - ty), tx * (1 - ty), (1 - tx) * ty, tx * ty];
    let v = 0, sw = 0, a = 0, b = 0, c = 0;
    for (let q = 0; q < 4; q++) {
      const hv = d[ks[q]];
      if (nd !== null && hv === nd) continue;
      v += hv * ws[q]; sw += ws[q];
      a += N[ks[q] * 3] * ws[q]; b += N[ks[q] * 3 + 1] * ws[q]; c += N[ks[q] * 3 + 2] * ws[q];
    }
    if (!(sw > 1e-12)) { z[o] = NaN; n[o * 3] = 0; n[o * 3 + 1] = 0; n[o * 3 + 2] = 1; return; }
    z[o] = (v / sw) * sc + off;
    const L = Math.hypot(a, b, c) || 1;
    n[o * 3] = a / L; n[o * 3 + 1] = b / L; n[o * 3 + 2] = c / L;
  };
}

// map.ply as world triangles bucketed by sample row band: {P (x, world y, z), Nn (normal world), tris, buckets} or null
function plyMesh(src, key, pl, ss, bandRows, notes) {
  const k = 'resource/map/' + key + '/map.ply';
  const buf = src.has(k) ? src.read(k) : null;
  if (!buf) { notes.push('map.ply not found: ground z and normals from the height grid'); return null; }
  let p;
  try { p = require('../../lib/model/ply').parse(buf); } catch (e) { p = { error: String(e && e.message || e) }; }
  const V = p && p.vertices;
  if (!p || p.error || !V || !V.position || !p.indices || !p.parts || !p.parts.length) {
    notes.push('map.ply cannot be read (' + ((p && p.error) || 'no vertices') + '): ground z and normals from the height grid');
    return null;
  }
  const ply = require('../../lib/model/ply');
  const nv = V.count, Pos = V.position, Nor = V.normal;
  const P = new Float64Array(nv * 3), Nn = new Float32Array(nv * 3);
  for (let i = 0; i < nv; i++) {
    P[i * 3] = Pos[i * 3]; P[i * 3 + 1] = -Pos[i * 3 + 1]; P[i * 3 + 2] = Pos[i * 3 + 2];
    if (Nor) { Nn[i * 3] = Nor[i * 3]; Nn[i * 3 + 1] = -Nor[i * 3 + 1]; Nn[i * 3 + 2] = Nor[i * 3 + 2]; } else Nn[i * 3 + 2] = 1;
  }
  const list = [];
  for (let i = 0; i < p.parts.length; i++) {
    const t = ply.partTriangles(p, i);
    for (let q = 0; q + 2 < t.length; q += 3) if (t[q] < nv && t[q + 1] < nv && t[q + 2] < nv) list.push(t[q], t[q + 1], t[q + 2]);
  }
  const tris = Uint32Array.from(list);
  const sy = pl.cellY / ss, y0 = pl.box[1], SH = pl.size[1] * ss;
  const nb = Math.ceil(SH / bandRows), buckets = Array.from({ length: nb }, () => []);
  for (let t = 0; t < tris.length; t += 3) {
    const a = tris[t], b = tris[t + 1], c = tris[t + 2];
    const ya = Math.min(P[a * 3 + 1], P[b * 3 + 1], P[c * 3 + 1]), yb = Math.max(P[a * 3 + 1], P[b * 3 + 1], P[c * 3 + 1]);
    const s0 = Math.max(0, Math.floor((ya - y0) / sy - 0.5)), s1 = Math.min(SH - 1, Math.ceil((yb - y0) / sy - 0.5));
    if (s1 < s0) continue;
    for (let q = Math.floor(s0 / bandRows); q <= Math.floor(s1 / bandRows); q++) buckets[q].push(t);
  }
  return { P, Nn, tris, buckets, hash: sha1(buf) };
}

function ground(src, doc, pl, o) {
  o = o || {};
  const ss = o.ss || 2, notes = [];
  const SW = pl.size[0] * ss, SH = pl.size[1] * ss;
  const sx = pl.cell / ss, sy = pl.cellY / ss, x0 = pl.box[0], y0 = pl.box[1];
  const BR = 128;
  let height = o.grids && o.grids.height;
  if (!height) height = require('../lib/mapkit').grids(src, doc.key, { mode: o.mode }).height;
  const net = netSampler(height);
  const mesh = o.ply === false ? null : plyMesh(src, doc.key, pl, ss, BR, notes);
  function band(sj0, sj1) {
    const n = (sj1 - sj0) * SW;
    const z = new Float32Array(n).fill(NaN), nr = new Float32Array(n * 3);
    if (mesh) {
      const { P, Nn, tris } = mesh, seen = new Set();
      for (let q = Math.floor(sj0 / BR); q <= Math.floor((sj1 - 1) / BR); q++) {
        for (const t of mesh.buckets[q] || []) {
          if (seen.has(t)) continue;
          seen.add(t);
          const a = tris[t] * 3, b = tris[t + 1] * 3, c = tris[t + 2] * 3;
          const ax = P[a], ay = P[a + 1], bx = P[b], by = P[b + 1], cx = P[c], cy = P[c + 1];
          const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
          if (!(Math.abs(den) > 1e-12)) continue;
          const i0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - x0) / sx - 0.5)), i1 = Math.min(SW - 1, Math.ceil((Math.max(ax, bx, cx) - x0) / sx - 0.5));
          const j0 = Math.max(sj0, Math.floor((Math.min(ay, by, cy) - y0) / sy - 0.5)), j1 = Math.min(sj1 - 1, Math.ceil((Math.max(ay, by, cy) - y0) / sy - 0.5));
          const e = -1e-9;
          for (let sj = j0; sj <= j1; sj++) {
            const py = y0 + (sj + 0.5) * sy;
            for (let si = i0; si <= i1; si++) {
              const px = x0 + (si + 0.5) * sx;
              const w0 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / den;
              const w1 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / den;
              const w2 = 1 - w0 - w1;
              if (w0 < e || w1 < e || w2 < e) continue;
              const k = (sj - sj0) * SW + si;
              if (z[k] === z[k]) continue;   // the first triangle that covers a sample keeps it (file order)
              z[k] = w0 * P[a + 2] + w1 * P[b + 2] + w2 * P[c + 2];
              const nx = w0 * Nn[a] + w1 * Nn[b] + w2 * Nn[c], ny = w0 * Nn[a + 1] + w1 * Nn[b + 1] + w2 * Nn[c + 1], nz = w0 * Nn[a + 2] + w1 * Nn[b + 2] + w2 * Nn[c + 2];
              const L = Math.hypot(nx, ny, nz) || 1;
              nr[k * 3] = nx / L; nr[k * 3 + 1] = ny / L; nr[k * 3 + 2] = nz / L;
            }
          }
        }
      }
    }
    for (let sj = sj0; sj < sj1; sj++) {
      const py = y0 + (sj + 0.5) * sy;
      for (let si = 0; si < SW; si++) {
        const k = (sj - sj0) * SW + si;
        if (z[k] === z[k]) continue;
        net(x0 + (si + 0.5) * sx, py, z, nr, k);
      }
    }
    return { z, n: nr };
  }
  return { from: mesh ? 'ply' : 'net', hash: mesh ? mesh.hash : null, notes, SW, SH, ss, band };
}

module.exports = { ground, latticeNormals, netSampler };

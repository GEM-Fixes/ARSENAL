// render C0 (MV-R1): registration numbers of the shipped minimap against a picture of the map (tools/mapviz/README.md 1.9;
// design 7 C0). AS2 and AS64 only: GoH minimaps are drawings and never a reference (used false, why RENDER_C0_GOH).
//   c0(src, doc, pic, o?) -> {dx, dy, gain, classMeans, ssim, used, why, size, shiftRange, classes}   sync
//     pic = an rgba8 picture on any frame (normally pic.l1 on the plan frame); o = {grids?, mode?, range? (px, default 8)}
//   The minimap file (doc.pictures.minimap; dds, mip 0) is laid over the world box, file row 0 = min world y, no flip
//   (README 4.2 "Pictures read from files").
//   dx, dy  minimap px: the map's roads (type 7) and water (types 3..5, the gtype of the mode) at minimap pixel p show at
//           p + (dx, dy). Integer search over +-range px maximising the normalised cross-correlation of the edges of the
//           class fractions (area fraction of road + water cells per minimap pixel, blur sigma 1, gradient magnitude) with
//           the edges of the minimap luminance (same blur and gradient); a class counts with >= 30 pixels of fraction
//           >= 0.5; then a parabola through the best score and its two neighbours per axis. null when no class counts.
//           A best shift on the edge of the search range is not an offset (why RENDER_C0_OFFSET_EDGE).
//   gain    one global gain: sum(m p) / sum(p p) of luminance (Rec. 709 weights on stored values), m = minimap, p = the
//           picture area-resampled onto the minimap pixels, over pixels the picture covers.
//   classMeans  {<engine type id>: {n, minimap:[r,g,b], pic:[r,g,b]}} by the gtype cell under each minimap pixel centre.
//   ssim    mean SSIM of the luminance-gradient magnitude after a Gaussian blur of sigma 1.5 px (both images; the picture
//           times gain), 8 x 8 windows at a step of 4 px, covered windows only.
//   used    false when the offset is over 1 px (or when no offset could be found): that map leaves the fit set.
// Author: Imperator_Aug (ARSENAL, ia-1f1a0ca1)
'use strict';
const F = require('./frame');

const RANGE = 8, MIN_N = 30;
const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

function mv() { return require('../mapviz'); }

function minimapOf(src, doc) {
  const m = doc && doc.pictures && doc.pictures.minimap;
  if (!m || !m.file) return { why: 'RENDER_C0_NO_MINIMAP' };
  const k = 'resource/map/' + doc.key + '/' + String(m.file).toLowerCase();
  const buf = src.has(k) ? src.read(k) : null;
  if (!buf) return { why: 'RENDER_C0_NO_MINIMAP' };
  if (!/\.dds$/i.test(m.file)) return { why: 'RENDER_C0_FORMAT' };
  const d = require('../../lib/model/dds').decode(buf, { mip: 0 });
  if (!d || d.error || !d.rgba) return { why: 'RENDER_C0_FORMAT' };
  return { w: d.width, h: d.height, rgba: d.rgba, file: m.file };
}

// fraction of each minimap pixel covered by cells whose value passes test (area weights)
function fraction(gt, fr, test) {
  const gf = F.gridFrame(gt);
  const AX = F.axis(fr.W, fr.x0, fr.sx, gf.W, gf.x0, gf.sx), AY = F.axis(fr.H, fr.y0, fr.sy, gf.H, gf.y0, gf.sy);
  const out = new Float32Array(fr.W * fr.H), d = gt.data, w = gt.w;
  for (let v = 0; v < fr.H; v++) {
    const ly = AY[v];
    for (let u = 0; u < fr.W; u++) {
      const lx = AX[u];
      let s = 0;
      for (let q = 0; q < ly.length; q += 2) {
        const row = ly[q] * w, wy = ly[q + 1];
        for (let p = 0; p < lx.length; p += 2) if (test(d[row + lx[p]])) s += wy * lx[p + 1];
      }
      out[v * fr.W + u] = s;
    }
  }
  return out;
}

function blur(src, w, h, sigma) {
  const r = Math.ceil(sigma * 3), K = [];
  let ks = 0;
  for (let i = -r; i <= r; i++) { const v = Math.exp(-i * i / (2 * sigma * sigma)); K.push(v); ks += v; }
  for (let i = 0; i < K.length; i++) K[i] /= ks;
  const tmp = new Float64Array(w * h), out = new Float64Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0;
    for (let i = -r; i <= r; i++) { const xx = x + i < 0 ? 0 : x + i >= w ? w - 1 : x + i; s += src[y * w + xx] * K[i + r]; }
    tmp[y * w + x] = s;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0;
    for (let i = -r; i <= r; i++) { const yy = y + i < 0 ? 0 : y + i >= h ? h - 1 : y + i; s += tmp[yy * w + x] * K[i + r]; }
    out[y * w + x] = s;
  }
  return out;
}

function gradMag(a, w, h) {
  const out = new Float64Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const xl = x > 0 ? x - 1 : x, xr = x < w - 1 ? x + 1 : x, yu = y > 0 ? y - 1 : y, yd = y < h - 1 ? y + 1 : y;
    const gx = (a[y * w + xr] - a[y * w + xl]) / 2, gy = (a[yd * w + x] - a[yu * w + x]) / 2;
    out[y * w + x] = Math.sqrt(gx * gx + gy * gy);
  }
  return out;
}

function ssimOf(A, B, cover, w, h) {
  const C1 = Math.pow(0.01 * 255, 2), C2 = Math.pow(0.03 * 255, 2);
  let sum = 0, n = 0;
  for (let y = 0; y + 8 <= h; y += 4) for (let x = 0; x + 8 <= w; x += 4) {
    let ma = 0, mb = 0, ok = true;
    for (let j = 0; j < 8 && ok; j++) for (let i = 0; i < 8; i++) { const k = (y + j) * w + x + i; if (!cover[k]) { ok = false; break; } ma += A[k]; mb += B[k]; }
    if (!ok) continue;
    ma /= 64; mb /= 64;
    let va = 0, vb = 0, cv = 0;
    for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) { const k = (y + j) * w + x + i, da = A[k] - ma, db = B[k] - mb; va += da * da; vb += db * db; cv += da * db; }
    va /= 63; vb /= 63; cv /= 63;
    sum += ((2 * ma * mb + C1) * (2 * cv + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2));
    n++;
  }
  return n ? sum / n : null;
}

// edges, not levels: a road may be darker (asphalt) or lighter (dirt) than the ground beside it, so the score is the
// normalised cross-correlation of the gradient magnitude of the blurred class fractions (roads + water) shifted by
// (sx, sy) with the gradient magnitude of the blurred minimap luminance, over the overlap
function register(Lm, w, h, masks, R) {
  const lists = masks.filter(m => m.idx.length >= MIN_N);
  if (!lists.length) return null;
  const N = w * h, fsum = new Float64Array(N);
  for (const m of lists) for (let k = 0; k < N; k++) fsum[k] += m.frac[k] * 255;
  const Gc = gradMag(blur(fsum, w, h, 1), w, h), Gm = gradMag(blur(Lm, w, h, 1), w, h);
  const S = 2 * R + 1, score = new Float64Array(S * S);
  for (let sy = -R; sy <= R; sy++) for (let sx = -R; sx <= R; sx++) {
    // feature at p shows at p + s: compare Gc[p] with Gm[p + s]
    const x0 = Math.max(0, -sx), x1 = Math.min(w, w - sx), y0 = Math.max(0, -sy), y1 = Math.min(h, h - sy);
    let n = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
    for (let y = y0; y < y1; y++) {
      const ra = y * w, rb = (y + sy) * w + sx;
      for (let x = x0; x < x1; x++) {
        const a = Gc[ra + x], b = Gm[rb + x];
        sa += a; sb += b; saa += a * a; sbb += b * b; sab += a * b; n++;
      }
    }
    const cov = sab - sa * sb / n, va = saa - sa * sa / n, vb = sbb - sb * sb / n;
    score[(sy + R) * S + sx + R] = va > 0 && vb > 0 ? cov / Math.sqrt(va * vb) : 0;
  }
  let best = 0;
  for (let k = 1; k < score.length; k++) if (score[k] > score[best]) best = k;
  const bx = (best % S) - R, by = ((best / S) | 0) - R;
  const at = (x, y) => score[(y + R) * S + x + R];
  const sub = (a, b, c) => { const d = a - 2 * b + c; return d < 0 ? Math.max(-0.5, Math.min(0.5, 0.5 * (a - c) / d)) : 0; };
  const fx = bx > -R && bx < R ? sub(at(bx - 1, by), at(bx, by), at(bx + 1, by)) : 0;
  const fy = by > -R && by < R ? sub(at(bx, by - 1), at(bx, by), at(bx, by + 1)) : 0;
  return { dx: bx + fx, dy: by + fy, score: at(bx, by), edge: Math.abs(bx) === R || Math.abs(by) === R };
}

function c0(src, doc, pic, o) {
  o = o || {};
  const M = mv();
  const target = src && src.target;
  const base = { dx: null, dy: null, gain: null, classMeans: {}, ssim: null, used: false, why: null, size: null, shiftRange: o.range || RANGE, classes: {} };
  if (target === 'goh') return Object.assign(base, { why: 'RENDER_C0_GOH' });
  if (!pic || pic.etype !== 'rgba8') throw new M.MvError('MV_USAGE', 'render c0 needs an rgba8 picture', { code: 'RENDER_GRID' });
  const mm = minimapOf(src, doc);
  if (mm.why) return Object.assign(base, { why: mm.why });
  const box = doc.boxes.world, w = mm.w, h = mm.h;
  const fr = { x0: box[0], y0: box[1], sx: (box[2] - box[0]) / w, sy: (box[3] - box[1]) / h, W: w, H: h };
  base.size = [w, h];
  const grids = o.grids || require('../lib/mapkit').grids(src, doc.key, { mode: o.mode });
  const gt = grids.gtype;
  const Lm = new Float64Array(w * h);
  for (let k = 0; k < w * h; k++) Lm[k] = lum(mm.rgba[k * 4], mm.rgba[k * 4 + 1], mm.rgba[k * 4 + 2]);
  const masks = [
    { name: 'road', test: t => t === 7 },
    { name: 'water', test: t => t >= 3 && t <= 5 },
  ].map(c => {
    const f = fraction(gt, fr, c.test), idx = [];
    for (let k = 0; k < f.length; k++) if (f[k] >= 0.5) idx.push(k);
    base.classes[c.name] = idx.length;
    return { name: c.name, idx, frac: f };
  });
  const reg = register(Lm, w, h, masks, base.shiftRange);
  // the picture on the minimap pixels
  const P = F.resampleTo(pic, fr, 'pic.c0');
  const Lp = new Float64Array(w * h), cover = new Uint8Array(w * h);
  let smp = 0, spp = 0;
  for (let k = 0; k < w * h; k++) {
    if (P.data[k * 4 + 3] < 255) continue;
    cover[k] = 1;
    Lp[k] = lum(P.data[k * 4], P.data[k * 4 + 1], P.data[k * 4 + 2]);
    smp += Lm[k] * Lp[k]; spp += Lp[k] * Lp[k];
  }
  const gain = spp > 0 ? smp / spp : null;
  // class means by the gtype cell under each minimap pixel centre
  const acc = new Map();
  for (let v = 0; v < h; v++) {
    const wy = fr.y0 + (v + 0.5) * fr.sy, j = Math.floor((wy - gt.oy) / gt.cell);
    if (j < 0 || j >= gt.h) continue;
    for (let u = 0; u < w; u++) {
      const wx = fr.x0 + (u + 0.5) * fr.sx, i = Math.floor((wx - gt.ox) / gt.cell);
      if (i < 0 || i >= gt.w) continue;
      const t = gt.data[j * gt.w + i], k = v * w + u;
      let a = acc.get(t);
      if (!a) { a = [0, 0, 0, 0, 0, 0, 0, 0]; acc.set(t, a); }
      a[0]++; a[1] += mm.rgba[k * 4]; a[2] += mm.rgba[k * 4 + 1]; a[3] += mm.rgba[k * 4 + 2];
      if (cover[k]) { a[4]++; a[5] += P.data[k * 4]; a[6] += P.data[k * 4 + 1]; a[7] += P.data[k * 4 + 2]; }
    }
  }
  const r1 = x => Math.round(x * 10) / 10;
  const classMeans = {};
  for (const t of [...acc.keys()].sort((a, b) => a - b)) {
    const a = acc.get(t);
    classMeans[t] = { n: a[0], minimap: [r1(a[1] / a[0]), r1(a[2] / a[0]), r1(a[3] / a[0])], pic: a[4] ? [r1(a[5] / a[4]), r1(a[6] / a[4]), r1(a[7] / a[4])] : null };
  }
  let ssim = null;
  if (gain) {
    const Bm = gradMag(blur(Lm, w, h, 1.5), w, h);
    const gp = new Float64Array(w * h);
    for (let k = 0; k < w * h; k++) gp[k] = Lp[k] * gain;
    const Bp = gradMag(blur(gp, w, h, 1.5), w, h);
    ssim = ssimOf(Bm, Bp, cover, w, h);
  }
  const r3 = x => (x == null ? null : Math.round(x * 1000) / 1000);
  const out = Object.assign(base, { gain: r3(gain), classMeans, ssim: r3(ssim) });
  if (!reg) return Object.assign(out, { why: 'RENDER_C0_NO_FEATURES' });
  out.dx = Math.round(reg.dx * 100) / 100; out.dy = Math.round(reg.dy * 100) / 100;
  out.used = !reg.edge && Math.max(Math.abs(reg.dx), Math.abs(reg.dy)) <= 1;
  if (!out.used) out.why = reg.edge ? 'RENDER_C0_OFFSET_EDGE' : 'RENDER_C0_OFFSET';
  return out;
}

module.exports = { c0, RANGE, register, fraction, blur, gradMag, ssimOf, lum };

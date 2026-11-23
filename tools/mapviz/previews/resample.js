// previews resample: a picture product (rgba8, row 0 = min world y, sidecar box) into a target frame (previews.md 4).
//   resample(pic, frameBox, W, H, o?) -> Uint8ClampedArray W x H x 4, row 0 = min world y, PREMULTIPLIED (r, g, b already
//     multiplied by alpha, (x * a + 127) / 255) with the alpha kept: so r, g, b are the picture composited over black.
//     pic = {w, h, data, box:[x0,y0,x1,y1]}. Per axis: box average where the source has more than one px per target px,
//     bilinear otherwise; source pixels outside the picture count as transparent black.
//     o.clip = [x0,y0,x1,y1]: target pixels whose centre lies outside it become transparent (crop: parts outside B are black).
//   opaque(rgba) -> same array, alpha set to 255 (the composite over black)    flipRows(rgba, W, H) -> new array
//   blit(dst, W, H, src, w, h, x, y) copies src into dst at (x, y) (row 0 = the first row of both)
// Integer maths: positions in 1/4096 source px, fixed once per axis with Math.round; every sum and division is an integer
// (division rounded to nearest), so the bytes are the same on every machine (golden = byte hash, README 9.2).
// Author: Imperator_Aug (ARSENAL, ia-82c56bf4)
'use strict';

const Q = 4096;
const div = (n, d) => Math.floor((2 * n + d) / (2 * d));   // nearest integer of n / d, n >= 0, d > 0

function premul(data, n) {
  const out = new Uint8ClampedArray(n * 4);
  for (let p = 0; p < n * 4; p += 4) {
    const a = data[p + 3];
    out[p] = Math.floor((data[p] * a + 127) / 255); out[p + 1] = Math.floor((data[p + 1] * a + 127) / 255);
    out[p + 2] = Math.floor((data[p + 2] * a + 127) / 255); out[p + 3] = a;
  }
  return out;
}

// one axis: for each target index t a list of [source index, weight] with weights summing to tot (outside -> index -1)
function axis(srcN, srcLo, srcHi, dstLo, dstHi, dstN) {
  const per = (srcHi - srcLo) / srcN;                       // world u per source px
  const o0 = Math.round((dstLo - srcLo) / per * Q);         // target 0 start, in 1/Q source px
  const step = Math.round((dstHi - dstLo) / dstN / per * Q);  // target px width, in 1/Q source px
  const taps = new Array(dstN);
  const box = step > Q;
  for (let t = 0; t < dstN; t++) {
    const list = [];
    if (box) {
      const a = o0 + t * step, b = a + step;
      for (let k = Math.floor(a / Q); k * Q < b; k++) {
        const w = Math.min(b, (k + 1) * Q) - Math.max(a, k * Q);
        if (w > 0) list.push(k >= 0 && k < srcN ? k : -1, w);
      }
      taps[t] = { list, tot: step };
    } else {
      const c2 = 2 * o0 + (2 * t + 1) * step;               // 2 x the centre
      if (c2 < 0 || c2 >= 2 * srcN * Q) { list.push(-1, Q); taps[t] = { list, tot: Q }; continue; }   // centre outside the picture
      const p = Math.floor((c2 - Q) / 2), k0 = Math.floor(p / Q), f = p - k0 * Q;   // minus half a source px
      const cl = k => (k < 0 ? 0 : k >= srcN ? srcN - 1 : k);   // inside the picture: its edge pixel stands for the half px past it
      list.push(cl(k0), Q - f);
      if (f) list.push(cl(k0 + 1), f);
      taps[t] = { list, tot: Q };
    }
  }
  return taps;
}

function resample(pic, frameBox, W, H, o) {
  if (!pic || !pic.data || !(pic.w > 0) || !(pic.h > 0) || !Array.isArray(pic.box)) throw new Error('previews resample: picture needs w, h, data, box');
  if (!(W > 0 && H > 0) || !Number.isInteger(W) || !Number.isInteger(H)) throw new Error('previews resample: bad frame size ' + W + 'x' + H);
  const sw = pic.w, sh = pic.h, b = pic.box, f = frameBox;
  if (!(b[2] > b[0] && b[3] > b[1] && f[2] > f[0] && f[3] > f[1])) throw new Error('previews resample: empty box');
  const pm = premul(pic.data, sw * sh);
  const tx = axis(sw, b[0], b[2], f[0], f[2], W), ty = axis(sh, b[1], b[3], f[1], f[3], H);
  // x pass: sh rows x W
  const mid = new Uint8ClampedArray(W * sh * 4);
  for (let j = 0; j < sh; j++) {
    const row = j * sw * 4, orow = j * W * 4;
    for (let t = 0; t < W; t++) {
      const { list, tot } = tx[t];
      let r = 0, g = 0, bl = 0, a = 0;
      for (let q = 0; q < list.length; q += 2) {
        const k = list[q]; if (k < 0) continue;
        const w = list[q + 1], p = row + k * 4;
        r += pm[p] * w; g += pm[p + 1] * w; bl += pm[p + 2] * w; a += pm[p + 3] * w;
      }
      const o4 = orow + t * 4;
      mid[o4] = div(r, tot); mid[o4 + 1] = div(g, tot); mid[o4 + 2] = div(bl, tot); mid[o4 + 3] = div(a, tot);
    }
  }
  // y pass: H rows x W
  const out = new Uint8ClampedArray(W * H * 4);
  for (let t = 0; t < H; t++) {
    const { list, tot } = ty[t];
    for (let i = 0; i < W; i++) {
      let r = 0, g = 0, bl = 0, a = 0;
      for (let q = 0; q < list.length; q += 2) {
        const k = list[q]; if (k < 0) continue;
        const w = list[q + 1], p = (k * W + i) * 4;
        r += mid[p] * w; g += mid[p + 1] * w; bl += mid[p + 2] * w; a += mid[p + 3] * w;
      }
      const o4 = (t * W + i) * 4;
      out[o4] = div(r, tot); out[o4 + 1] = div(g, tot); out[o4 + 2] = div(bl, tot); out[o4 + 3] = div(a, tot);
    }
  }
  if (o && o.clip) clipOutside(out, W, H, f, o.clip);
  return out;
}

// target pixels whose centre lies outside clip -> transparent black (the frame box may reach past the world box B)
function clipOutside(rgba, W, H, f, c) {
  const sx = (f[2] - f[0]) / W, sy = (f[3] - f[1]) / H;
  for (let j = 0; j < H; j++) {
    const y = f[1] + (j + 0.5) * sy, outY = y < c[1] || y > c[3];
    for (let i = 0; i < W; i++) {
      const x = f[0] + (i + 0.5) * sx;
      if (outY || x < c[0] || x > c[2]) { const p = (j * W + i) * 4; rgba[p] = rgba[p + 1] = rgba[p + 2] = rgba[p + 3] = 0; }
    }
  }
  return rgba;
}

function opaque(rgba) { for (let p = 3; p < rgba.length; p += 4) rgba[p] = 255; return rgba; }
// straight rgba (paint output) -> composite over black, opaque
function overBlack(rgba) {
  for (let p = 0; p < rgba.length; p += 4) {
    const a = rgba[p + 3];
    if (a !== 255) { rgba[p] = Math.floor((rgba[p] * a + 127) / 255); rgba[p + 1] = Math.floor((rgba[p + 1] * a + 127) / 255); rgba[p + 2] = Math.floor((rgba[p + 2] * a + 127) / 255); rgba[p + 3] = 255; }
  }
  return rgba;
}
function flipRows(rgba, W, H) {
  const out = new Uint8ClampedArray(rgba.length), rb = W * 4;
  for (let j = 0; j < H; j++) out.set(rgba.subarray((H - 1 - j) * rb, (H - j) * rb), j * rb);
  return out;
}
function blit(dst, W, H, src, w, h, x, y) {
  for (let j = 0; j < h; j++) {
    const dy = y + j; if (dy < 0 || dy >= H) continue;
    for (let i = 0; i < w; i++) {
      const dx = x + i; if (dx < 0 || dx >= W) continue;
      const s = (j * w + i) * 4, d = (dy * W + dx) * 4;
      dst[d] = src[s]; dst[d + 1] = src[s + 1]; dst[d + 2] = src[s + 2]; dst[d + 3] = src[s + 3];
    }
  }
  return dst;
}

module.exports = { resample, clipOutside, opaque, overBlack, flipRows, blit, axis, Q };

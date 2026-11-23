// render frame (MV-R1, R0 structure): the tile plan of a picture and the pixel <-> world frame, plus the premultiplied area
// resample every render rung uses to move a picture onto that frame (tools/mapviz/README.md 1.9, 4.2, 9.2; design 7 R0).
//   plan(doc, {size, guard?}) -> {size:[w,h], tile:2048, tiles:[{x, y, w, h, guard}], box, cell, cellY, guard}
//     size = the long side in px (README 2.2 --size). The picture covers exactly the world box doc.boxes.world, north up:
//     row 0 = the minimum world y (README 4.1). The aspect of the box is kept: the long side gets size px, the short side
//     round(short / long x size) px (at least 1); one pixel is cell u wide and cellY u tall (equal up to that rounding).
//     The tile grid comes from the output size only: tiles of 2048 px from the south-west pixel (0, 0), row-major from
//     row 0, the last column and row cut short. Every pixel has exactly one owner tile; guard = the band (px) a rung renders
//     around a tile and throws away (the largest of shadow filter, decal edge and post kernel; 8 px until L4 sets it).
//   frameOf(p) -> {x0, y0, sx, sy, W, H}   pixel (i, j) covers [x0 + i sx, x0 + (i+1) sx) x [y0 + j sy, y0 + (j+1) sy)
//   gridFrame(g) -> frame of a cell-sample grid (README 4.2: box [ox, oy, ox + w cell, oy + h cellY])
//   resampleTo(pic, frame, name?) -> rgba8 grid on that frame: area weights (box filter), premultiplied by alpha with the
//     integer rule of README 9.2; source area outside the picture counts as transparent.
//   checkSize(size) -> integer px or throws MvError MV_USAGE (detail.code RENDER_SIZE)
// Author: Imperator_Aug (ARSENAL, ia-489fe329)
'use strict';

const TILE = 2048;
const GUARD = 8;
const MIN_SIZE = 16, MAX_SIZE = 16384;

function mv() { return require('../mapviz'); }
// the premultiply rule of README 9.2 is raster's (lib/raster premul, unpremul): loaded when first used, never copied here
function raster() { return require('../lib/raster'); }
const premul = (c, a) => raster().premul(c, a);
const unpremul = (p, a) => raster().unpremul(p, a);

function checkSize(size) {
  const n = Number(size);
  if (!(Number.isInteger(n) && n >= MIN_SIZE && n <= MAX_SIZE)) {
    throw new (mv().MvError)('MV_USAGE', 'picture size must be an integer ' + MIN_SIZE + '..' + MAX_SIZE + ' px, got ' + size, { code: 'RENDER_SIZE' });
  }
  return n;
}

function boxOf(doc) {
  const b = doc && doc.boxes && doc.boxes.world;
  if (!Array.isArray(b) || b.length !== 4 || !b.every(Number.isFinite) || !(b[2] > b[0]) || !(b[3] > b[1])) {
    throw new (mv().MvError)('MV_USAGE', 'the map has no usable world box (boxes.world)', { code: 'RENDER_BOX' });
  }
  return b.slice();
}

function plan(doc, o) {
  o = o || {};
  const size = checkSize(o.size);
  const box = boxOf(doc);
  const bw = box[2] - box[0], bh = box[3] - box[1];
  const W = bw >= bh ? size : Math.max(1, Math.round(bw * size / bh));
  const H = bh >= bw ? size : Math.max(1, Math.round(bh * size / bw));
  const guard = o.guard === undefined ? GUARD : o.guard;
  if (!(Number.isInteger(guard) && guard >= 0 && guard <= 256)) throw new (mv().MvError)('MV_USAGE', 'guard must be an integer 0..256 px', { code: 'RENDER_GUARD' });
  const tiles = [];
  for (let y = 0; y < H; y += TILE) {
    for (let x = 0; x < W; x += TILE) tiles.push({ x, y, w: Math.min(TILE, W - x), h: Math.min(TILE, H - y), guard });
  }
  return { size: [W, H], tile: TILE, tiles, box, cell: bw / W, cellY: bh / H, guard };
}

function frameOf(p) { return { x0: p.box[0], y0: p.box[1], sx: p.cell, sy: p.cellY, W: p.size[0], H: p.size[1] }; }

function gridFrame(g) {
  const cy = g.meta && g.meta.cellY > 0 ? g.meta.cellY : g.cell;
  return { x0: g.ox, y0: g.oy, sx: g.cell, sy: cy, W: g.w, H: g.h };
}

// per-axis area weights: destination pixel u covers [a + u s, a + (u+1) s) in world units; source pixel k covers
// [b + k t, b + (k+1) t). Weight = overlap / s (a pixel's whole width is 1). Flat lists [k, w, k, w, ...].
function axis(dstN, a, s, srcN, b, t) {
  const out = new Array(dstN);
  for (let u = 0; u < dstN; u++) {
    const lo = a + u * s, hi = lo + s;
    const k0 = Math.max(0, Math.floor((lo - b) / t)), k1 = Math.min(srcN - 1, Math.ceil((hi - b) / t) - 1);
    const list = [];
    for (let k = k0; k <= k1; k++) {
      const wgt = (Math.min(hi, b + (k + 1) * t) - Math.max(lo, b + k * t)) / s;
      if (wgt > 1e-12) list.push(k, wgt);
    }
    out[u] = list;
  }
  return out;
}

function resampleTo(pic, fr, name) {
  if (!pic || pic.etype !== 'rgba8' || !pic.data || pic.data.length !== pic.w * pic.h * 4) {
    throw new (mv().MvError)('MV_USAGE', 'resampleTo needs an rgba8 picture', { code: 'RENDER_GRID' });
  }
  const { premul, unpremul } = raster();
  const sf = gridFrame(pic), W = fr.W, H = fr.H, src = pic.data, sw = pic.w;
  const AX = axis(W, fr.x0, fr.sx, sf.W, sf.x0, sf.sx), AY = axis(H, fr.y0, fr.sy, sf.H, sf.y0, sf.sy);
  const P = new Uint8Array(src.length);
  for (let k = 0; k < src.length; k += 4) {
    const a = src[k + 3];
    P[k] = premul(src[k], a); P[k + 1] = premul(src[k + 1], a); P[k + 2] = premul(src[k + 2], a); P[k + 3] = a;
  }
  const out = new Uint8ClampedArray(W * H * 4);
  for (let v = 0; v < H; v++) {
    const ly = AY[v];
    for (let u = 0; u < W; u++) {
      const lx = AX[u];
      let r = 0, g = 0, b = 0, a = 0;
      for (let q = 0; q < ly.length; q += 2) {
        const row = ly[q] * sw, wy = ly[q + 1];
        for (let p = 0; p < lx.length; p += 2) {
          const s = (row + lx[p]) * 4, wt = wy * lx[p + 1];
          r += P[s] * wt; g += P[s + 1] * wt; b += P[s + 2] * wt; a += P[s + 3] * wt;
        }
      }
      const A = Math.min(255, Math.round(a)), d = (v * W + u) * 4;
      out[d] = unpremul(Math.round(r), A); out[d + 1] = unpremul(Math.round(g), A); out[d + 2] = unpremul(Math.round(b), A); out[d + 3] = A;
    }
  }
  const meta = Object.assign({}, pic.meta || {});
  delete meta.cellY;
  if (Math.abs(fr.sy - fr.sx) > 1e-9 * fr.sx) meta.cellY = fr.sy;
  return { name: name || pic.name, w: W, h: H, cell: fr.sx, ox: fr.x0, oy: fr.y0, etype: 'rgba8', sample: 'cell', scale: 1, offset: 0,
    nodata: null, meta, data: out };
}

module.exports = { TILE, GUARD, MIN_SIZE, MAX_SIZE, plan, frameOf, gridFrame, resampleTo, checkSize, premul, unpremul, axis };

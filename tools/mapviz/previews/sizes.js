// previews sizes: the exact pixel size rules of the Map Viewer's size choice ("Match a game use", "Custom") and of a
// deploy of every preview file (design 10, 11). Pure and sync, except fitTo which only resamples.
//   MIN 64, MAX 8192            whole pixels per side of an asked size
//   FITS ['stretch', 'backdrop', 'crop']   what happens when the asked shape is not the map's: stretch = the whole map
//                               pulled to the size (as the previews write by default); backdrop = the whole map at its own
//                               shape, as large as fits, centred over a blurred, darkened copy (bars); crop = the size's
//                               shape cut from the middle of the map, as large as fits (the map's edges are lost)
//   checkWH(w, h) -> {w, h}     throws MvError MV_USAGE (detail.code PRV_SIZE) with plain words: not a whole number, under
//                               MIN, over MAX (a number given as text such as '12' is taken, '12.5', '-3', 'abc' are not)
//   parseOut(text) -> {w, h}    'WxH' (also 'W x H', 'W*H'), then checkWH
//   checkFit(fit) -> fit        null or '' -> 'stretch'; else one of FITS or MV_USAGE PRV_SIZE
//   shapeH(box, w), shapeW(box, h) -> the other side at the map's shape (keep the map's shape), rounded, within MIN..MAX
//   longSide(box, w, h, fit) -> L   the long side of the picture product (job field size) that covers w x h at that layout
//                               with no upsampling: px per world unit on each axis >= what the w x h frame needs. Capped at
//                               MAX (above it the picture is upsampled a little), at least MIN.
//   matchLong(box, sizes) -> L   the largest longSide(box, w, h, 'stretch') of a list of [w, h] (a deploy draws its source
//                               pictures at this long side; null or bad entries skipped; none -> 2048)
//   frameOf(box, w, h, fit) -> {frame:[x0,y0,x1,y1], inner:[x, y, iw, ih] | null}   the world box drawn into w x h; backdrop:
//                               the inner rectangle (row 0 = top, as compose backdropRect)
//   fitTo(pic, w, h, fit) -> Uint8ClampedArray w x h x 4, row 0 = min world y (the source's order), opaque (over black)
//                               pic = {w, h, data (rgba8), box}
// The page keeps a copy of longSide and shapeH/W in its ES5 script (pictures.client.js sizeKit); the part test checks both
// give the same numbers.
// Author: Imperator_Aug (ARSENAL, ia-477c81f7)
'use strict';
const RS = require('./resample');

const MIN = 64, MAX = 8192;
const FITS = ['stretch', 'backdrop', 'crop'];
const mv = () => require('../mapviz');
const bad = msg => new (mv().MvError)('MV_USAGE', msg, { code: 'PRV_SIZE' });

function whole(v, what) {
  const s = typeof v === 'number' ? String(v) : typeof v === 'string' ? v.trim() : '';
  if (!/^[0-9]+$/.test(s)) throw bad('the ' + what + ' must be a whole number of pixels from ' + MIN + ' to ' + MAX + ', got ' + (v === '' || v == null ? 'nothing' : String(v)));
  const n = Number(s);
  if (n < MIN) throw bad('the ' + what + ' must be at least ' + MIN + ' pixels, got ' + n);
  if (n > MAX) throw bad('the ' + what + ' must be at most ' + MAX + ' pixels, got ' + n);
  return n;
}
function checkWH(w, h) { return { w: whole(w, 'width'), h: whole(h, 'height') }; }
function parseOut(text) {
  const m = /^\s*([^xX*\s]+)\s*[xX*]\s*([^xX*\s]+)\s*$/.exec(String(text == null ? '' : text));
  if (!m) throw bad('the size must be width x height in pixels, such as 1920x1080, got ' + (text == null || text === '' ? 'nothing' : String(text)));
  return checkWH(m[1], m[2]);
}
function checkFit(fit) {
  if (fit == null || fit === '') return 'stretch';
  if (!FITS.includes(fit)) throw bad('the layout must be one of ' + FITS.join(', ') + ', got ' + fit);
  return fit;
}
const clamp = n => Math.min(MAX, Math.max(MIN, n));
function dims(box) {
  if (!Array.isArray(box) || box.length !== 4 || !(box[2] > box[0]) || !(box[3] > box[1])) throw bad('the map has no world box, so a size cannot be matched to it');
  return [box[2] - box[0], box[3] - box[1]];
}
function shapeH(box, w) { const [bw, bh] = dims(box); return clamp(Math.round(w * bh / bw)); }
function shapeW(box, h) { const [bw, bh] = dims(box); return clamp(Math.round(h * bw / bh)); }

// the centred crop box of shape w:h inside B, as large as fits
function cropBox(B, w, h) {
  const bw = B[2] - B[0], bh = B[3] - B[1], cx = (B[0] + B[2]) / 2, cy = (B[1] + B[3]) / 2;
  let cw = bw, ch = bw * h / w;
  if (ch > bh) { ch = bh; cw = bh * w / h; }
  return [cx - cw / 2, cy - ch / 2, cx + cw / 2, cy + ch / 2];
}
// compose backdropRect: B at its own shape, as large as fits in w x h, centred; row 0 = top
function innerRect(B, W, H) {
  const bw = B[2] - B[0], bh = B[3] - B[1];
  let w = W, h = Math.round(W * bh / bw);
  if (h > H) { h = H; w = Math.round(H * bw / bh); }
  w = Math.max(1, w); h = Math.max(1, h);
  return [Math.floor((W - w) / 2), Math.floor((H - h) / 2), w, h];
}
function frameOf(box, w, h, fit) {
  dims(box);
  const f = checkFit(fit);
  if (f === 'crop') return { frame: cropBox(box, w, h), inner: null };
  if (f === 'backdrop') return { frame: box.slice(), inner: innerRect(box, w, h) };
  return { frame: box.slice(), inner: null };
}
function longSide(box, w, h, fit) {
  const [bw, bh] = dims(box), long = Math.max(bw, bh);
  const fr = frameOf(box, w, h, fit);
  let fw = fr.frame[2] - fr.frame[0], fh = fr.frame[3] - fr.frame[1], pw = w, ph = h;
  if (fr.inner) { pw = fr.inner[2]; ph = fr.inner[3]; fw = bw; fh = bh; }
  // px per world unit the frame needs on each axis, times the long side of the box
  const need = Math.max(pw / fw, ph / fh) * long;
  return clamp(Math.ceil(need - 1e-6));
}

function matchLong(box, sizes) {
  let L = 0;
  for (const z of sizes || []) if (Array.isArray(z) && z[0] > 0 && z[1] > 0) L = Math.max(L, longSide(box, z[0], z[1], 'stretch'));
  return L || 2048;
}

function fitTo(pic, w, h, fit) {
  const B = pic.box, fr = frameOf(B, w, h, fit);
  if (!fr.inner) return RS.opaque(RS.resample(pic, fr.frame, w, h));
  const CP = require('./compose');
  const base = RS.opaque(RS.resample(pic, B, w, h));
  const out = CP.boxBlur(base, w, h, Math.max(1, Math.floor(Math.max(w, h) / 32)));
  for (let p = 0; p < out.length; p += 4) { out[p] = (out[p] + 1) >> 1; out[p + 1] = (out[p + 1] + 1) >> 1; out[p + 2] = (out[p + 2] + 1) >> 1; out[p + 3] = 255; }
  const [x, yTop, iw, ih] = fr.inner;
  const inner = RS.opaque(RS.resample(pic, B, iw, ih));
  RS.blit(out, w, h, inner, iw, ih, x, h - ih - yTop);   // row 0 = min world y: the top offset counts from the last row
  return out;
}

module.exports = { MIN, MAX, FITS, checkWH, parseOut, checkFit, shapeH, shapeW, longSide, matchLong, frameOf, cropBox, fitTo };

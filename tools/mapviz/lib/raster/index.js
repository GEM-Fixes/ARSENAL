// raster: mapviz grid functions (tools/mapviz/README.md section 1.2; design 3). Works only on grids (section 4.3): never
// reads a game. All sync, no state between calls, no Math.random (noise is an integer hash of position and seed).
//   VERSION                                   part version (cache key, README 8.2); = cli.js version
//   make(o) -> grid                           o = {name, w, h, cell, ox, oy, etype, sample?, scale?, offset?, nodata?, meta?}
//   gridfile, png                             the frozen grid file and PNG modules (README 4.1, 1.2)
//   slopeClass(height, o?) -> u8 'slopecls'   engine port (kterrain.js); hillshade(height, o?) -> u8 'shade' (lattice)
//   tint(height, stops, o?) -> rgba8 'tint'   stops = palette.json height.stops (or the whole height entry, which adds
//                                             below / above for o.min / o.max ranges); default range = the grid's min..max;
//                                             a lattice pixel = its cell (README 4.2): the mean of the corners that hold a
//                                             value, transparent (alpha 0) where its own lattice point is nodata (R16)
//   contourInterval(height) -> m; contours(height, o?) -> {interval, lines, labels}; contoursVector(res) (kcontour.js)
//   landform(height, r) -> u8 'landform.r<r>' (kterrain.js); regions(mask, o?), distance(mask, o?) (kregion.js)
//   costField(cost, seeds, o?), paths(cf, from, to, k, seed) (kcost.js)
//   minFilter(grid, r, o?) -> grid            min over the (2r+1) x (2r+1) cell window, nodata ignored
//   resample(grid, w, h, mode, o?) -> grid    mode 'nearest' or 'box' (area weights; rgba8 premultiplied, README 9.2)
//   o.tick(done, total)                       optional progress hook of slopeClass, hillshade, tint, contours, regions,
//                                             distance, costField, minFilter, resample and topo: called at least every
//                                             100 ms of work and once at the end with done = total (README 7: the CLI binds
//                                             it to its progress reporter, which may throw MV_CANCELLED and so end the call);
//                                             anything but a function or null is RASTER_ARG
//   cutTile(pic, z, tx, ty) -> {w:256, h:256, rgba}   the tile rule of README 5.2 (the only code with this maths)
//   tileLevels(w, h) -> {zmax, levels:[{z, w, h, nx, ny}]}
//   topo(height, o?) -> {grid (rgba8 'pic.topo'), sidecar}   height tint x shade (README 1.2), o = {shade, size, palette,
//                                             made, target, stackHash, mapHashes, tick} (the last three go into the
//                                             sidecar as given, null when absent); contours are never baked in; default shade = hillshade(height)
//                                             (auto exaggeration); flat ground keeps the tint, shade below / above it
//                                             darkens (a multiply with a floor) / lightens (TOPO)
//   render(grid, palette?) -> rgba8 grid      a grid as a picture for `raster png` (rgba8 as is, slopecls by the palette,
//                                             shade grey, other lattice grids tinted, the rest grey min..max)
//   premul(c, a), unpremul(p, a)              the integer alpha rule of README 9.2: (x * a + 127) / 255
//   KERNELS                                   the pool kernels of this part (README 1.5)
// Errors: Error with a stable code: RASTER_GRID, RASTER_ETYPE, RASTER_SAMPLE, RASTER_NAN, RASTER_ARG (and the codes of
// gridfile.js / png.js). The CLI maps them to MV_USAGE.
// Author: Imperator_Aug (ARSENAL, ia-105f1579)
'use strict';
const path = require('path');
const gridfile = require('./gridfile');
const png = require('./png');
const kterrain = require('./kterrain');
const kcontour = require('./kcontour');
const kregion = require('./kregion');
const kcost = require('./kcost');

const VERSION = 3;   // 3: a pixel whose own height point is nodata is transparent; shade means skip nodata corners (R16)
const TILE = 256;
const KERNELS = ['lib/raster/kterrain', 'lib/raster/kcontour', 'lib/raster/kregion', 'lib/raster/kcost'];
const NUMERIC = { u8: 1, i8: 1, u16: 1, i16: 1, u32: 1, i32: 1, f32: 1 };
const INT_RANGE = { u8: [0, 255], i8: [-128, 127], u16: [0, 65535], i16: [-32768, 32767], u32: [0, 4294967295], i32: [-2147483648, 2147483647] };

function fail(code, msg) { const e = new Error('raster: ' + msg); e.code = code; return e; }

function make(o) {
  if (!o || typeof o !== 'object') throw fail('RASTER_ARG', 'make needs an options object');
  const T = gridfile.ETYPES[o.etype];
  if (!T) throw fail('RASTER_ETYPE', 'make: etype must be one of ' + Object.keys(gridfile.ETYPES).join(' ') + ', not ' + o.etype);
  if (!(Number.isInteger(o.w) && Number.isInteger(o.h) && o.w >= 0 && o.h >= 0)) throw fail('RASTER_ARG', 'make: w and h must be integers >= 0');
  const sample = o.sample || 'cell';
  if (sample !== 'cell' && sample !== 'lattice') throw fail('RASTER_SAMPLE', "make: sample must be 'cell' or 'lattice', not " + sample);
  if (!(o.cell > 0)) throw fail('RASTER_ARG', 'make: cell must be > 0');
  const n = o.w * o.h * (o.etype === 'rgba8' ? 4 : 1);
  return {
    name: String(o.name || 'grid'), w: o.w, h: o.h, cell: o.cell, ox: o.ox || 0, oy: o.oy || 0, etype: o.etype, sample,
    scale: o.scale == null ? 1 : o.scale, offset: o.offset == null ? 0 : o.offset, nodata: o.nodata == null ? null : o.nodata,
    meta: o.meta ? JSON.parse(JSON.stringify(o.meta)) : {}, data: new T.Array(n),
  };
}

// ---------------------------------------------------------------- colour
function color(s) {
  const m = /^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/.exec(String(s));
  if (!m) throw fail('RASTER_ARG', 'colour must be #RRGGBB or #RRGGBBAA, not ' + s);
  const v = parseInt(m[1], 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255, m[2] ? parseInt(m[2], 16) : 255];
}
const premul = (c, a) => ((c * a + 127) / 255) | 0;
const unpremul = (p, a) => (a ? Math.min(255, ((p * 255 + (a >> 1)) / a) | 0) : 0);

let PALETTE = null;
function palette() {
  if (!PALETTE) PALETTE = require(path.join(__dirname, '..', '..', 'palette.json'));
  return PALETTE;
}

function stopList(stops) {
  const list = Array.isArray(stops) ? stops : stops && Array.isArray(stops.stops) ? stops.stops : null;
  if (!list || !list.length) throw fail('RASTER_ARG', 'tint needs colour stops [{at, color}]');
  const out = list.map(s => {
    if (!s || !(s.at >= 0 && s.at <= 1)) throw fail('RASTER_ARG', 'a colour stop needs at in 0..1');
    return { at: s.at, c: color(s.color) };
  }).sort((a, b) => a.at - b.at);
  return out;
}
function rampAt(S, t, out, o) {
  let c;
  if (t <= S[0].at) c = S[0].c;
  else if (t >= S[S.length - 1].at) c = S[S.length - 1].c;
  else {
    let k = 1;
    while (S[k].at < t) k++;
    const a = S[k - 1], b = S[k], u = b.at > a.at ? (t - a.at) / (b.at - a.at) : 0;
    for (let q = 0; q < 4; q++) out[o + q] = Math.round(a.c[q] + (b.c[q] - a.c[q]) * u);
    return;
  }
  out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = c[3];
}

// progress hooks (README 7): tickOf(o) = o.tick or null (anything else RASTER_ARG); part(f, a, b, T) = an options object
// whose tick maps a sub-call's (done, total) into a..b of T on f, or null without f
function tickOf(o) {
  const f = o && o.tick != null ? o.tick : null;
  if (f !== null && typeof f !== 'function') throw fail('RASTER_ARG', 'o.tick must be a function (done, total)');
  return f;
}
function part(f, a, b, T) {
  return f ? { tick: (d, t) => f(Math.round(a + (b - a) * (t > 0 ? Math.min(1, d / t) : 1)), T) } : null;
}

// physical values with NaN for nodata (kterrain.values) at cell centres: a lattice grid gives the mean of the four corners
// that hold a value. The pixel of a lattice grid covers the cell whose south-west corner is its own lattice point (README
// 4.2), so a cell whose own point is nodata is NaN (a cell rule reads that point, so the picture and the cell layers
// agree; R16: past the ground mesh). mask (optional, Float64Array of the same size, e.g. the heights under a shade grid):
// its NaN points count as nodata too. tk: optional ticker step, one call per row of a lattice grid
function centres(g, what, tk, mask) {
  const V = kterrain.values(g, what, tk);
  if (g.sample !== 'lattice') return V;
  const w = g.w, h = g.h, out = new Float64Array(w * h);
  const at = mask ? (k => (mask[k] === mask[k] ? V[k] : NaN)) : (k => V[k]);
  for (let j = 0; j < h; j++) {
    if (tk) tk();
    const j1 = j + 1 < h ? j + 1 : j;
    for (let i = 0; i < w; i++) {
      const i1 = i + 1 < w ? i + 1 : i;
      const a = at(j * w + i);
      if (a !== a) { out[j * w + i] = NaN; continue; }
      let s = a, c = 1;
      const b = at(j * w + i1), d = at(j1 * w + i), e = at(j1 * w + i1);
      if (b === b) { s += b; c++; } if (d === d) { s += d; c++; } if (e === e) { s += e; c++; }
      out[j * w + i] = s / c;
    }
  }
  return out;
}

function tint(height, stops, o) {
  o = o || {};
  const S = stopList(stops);
  const below = stops && !Array.isArray(stops) && stops.below ? color(stops.below) : null;
  const above = stops && !Array.isArray(stops) && stops.above ? color(stops.above) : null;
  const tk = kterrain.ticker(o, 2 * (height && height.h));
  const V = centres(height, 'height', tk), n = V.length, w = height.w;
  let lo = o.min, hi = o.max;
  if (lo == null || hi == null) {
    let a = Infinity, b = -Infinity;
    for (let k = 0; k < n; k++) { const v = V[k]; if (v === v) { if (v < a) a = v; if (v > b) b = v; } }
    if (lo == null) lo = a;
    if (hi == null) hi = b;
  }
  const out = new Uint8ClampedArray(n * 4), span = hi - lo;
  for (let k = 0; k < n; k++) {
    if (k % w === 0) tk();
    const v = V[k], p = k * 4;
    if (v !== v) continue;                                 // nodata: transparent
    if (v < lo && below) { out.set(below, p); continue; }
    if (v > hi && above) { out.set(above, p); continue; }
    rampAt(S, span > 0 ? (v - lo) / span : 0, out, p);
  }
  tk.end();
  return { name: 'tint', w: height.w, h: height.h, cell: height.cell, ox: height.ox, oy: height.oy, etype: 'rgba8', sample: 'cell',
    scale: 1, offset: 0, nodata: null, meta: { min: lo, max: hi }, data: out };
}

// ---------------------------------------------------------------- min filter, resample
function physical(g, what, tk) {
  if (!g || !NUMERIC[g.etype]) throw fail('RASTER_ETYPE', what + ' must be a numeric grid, not etype ' + (g && g.etype));
  return kterrain.values(g, what, tk);
}
function toRaw(g, V, name, extra) {
  const T = gridfile.ETYPES[g.etype], n = V.length, out = new T.Array(n);
  const sc = g.scale == null ? 1 : g.scale, of = g.offset == null ? 0 : g.offset, R = INT_RANGE[g.etype];
  let nodata = g.nodata == null ? null : g.nodata;
  for (let k = 0; k < n; k++) {
    const v = V[k];
    if (v !== v) {
      if (nodata === null) nodata = g.etype === 'f32' ? -3.4028234663852886e38 : R[0];
      out[k] = nodata; continue;
    }
    const raw = (v - of) / sc;
    out[k] = R ? Math.max(R[0], Math.min(R[1], Math.round(raw))) : raw;
  }
  return Object.assign({}, g, { name: name || g.name, nodata, meta: Object.assign({}, g.meta || {}, extra || {}), data: out });
}

function minFilter(grid, r, o) {
  r = Number(r);
  if (!Number.isInteger(r) || r < 0) throw fail('RASTER_ARG', 'minFilter radius must be an integer >= 0 cells, got ' + r);
  const tk = kterrain.ticker(o, grid ? grid.h + grid.w : 1);
  const V = physical(grid, 'grid', tk), n = V.length;
  if (r === 0) { tk.end(); return toRaw(grid, V); }
  const neg = new Float64Array(n);
  for (let k = 0; k < n; k++) neg[k] = -V[k];
  tk(0);
  const mx = kterrain.maxFilter(neg, grid.w, grid.h, r, tk);
  for (let k = 0; k < n; k++) mx[k] = -mx[k];
  tk(0);
  const out = toRaw(grid, mx, grid.name, { minFilter: r });
  tk.end();
  return out;
}

// per-axis box weights: output u covers source [u*s, (u+1)*s), s = src/dst
function boxAxis(src, dst) {
  const s = src / dst, out = [];
  for (let u = 0; u < dst; u++) {
    const a = u * s, b = (u + 1) * s, list = [];
    for (let i = Math.floor(a); i < Math.min(src, Math.ceil(b)); i++) {
      const wgt = Math.min(b, i + 1) - Math.max(a, i);
      if (wgt > 1e-12) list.push(i, wgt);
    }
    if (!list.length) list.push(Math.min(src - 1, Math.floor(a)), 1);
    out.push(list);
  }
  return out;
}

function resample(grid, w, h, mode, o) {
  if (!grid || !gridfile.ETYPES[grid.etype]) throw fail('RASTER_GRID', 'resample needs a grid');
  if (!(Number.isInteger(w) && Number.isInteger(h) && w > 0 && h > 0)) throw fail('RASTER_ARG', 'resample w and h must be integers > 0');
  if (mode !== 'nearest' && mode !== 'box') throw fail('RASTER_ARG', "resample mode must be 'nearest' or 'box', not " + mode);
  const tk = kterrain.ticker(o, h);
  const gw = grid.w, gh = grid.h, rgba = grid.etype === 'rgba8';
  const elems = gw * gh * (rgba ? 4 : 1);
  if (!grid.data || grid.data.length !== elems) throw fail('RASTER_GRID', 'resample: data length is not w*h' + (rgba ? '*4' : ''));
  const lat = grid.sample === 'lattice', cx = grid.cell * gw / w, cy = grid.cell * gh / h;
  const X0 = grid.ox - (lat ? grid.cell / 2 : 0), Y0 = grid.oy - (lat ? grid.cell / 2 : 0);
  const head = { name: grid.name, w, h, cell: cx, ox: X0 + (lat ? cx / 2 : 0), oy: Y0 + (lat ? cy / 2 : 0), etype: grid.etype, sample: grid.sample,
    scale: grid.scale == null ? 1 : grid.scale, offset: grid.offset == null ? 0 : grid.offset, nodata: grid.nodata == null ? null : grid.nodata,
    meta: Object.assign({}, grid.meta || {}, cy !== cx ? { cellY: cy } : {}) };
  const T = gridfile.ETYPES[grid.etype], src = grid.data;
  if (mode === 'nearest') {
    const out = new T.Array(w * h * (rgba ? 4 : 1));
    const xi = new Int32Array(w), yi = new Int32Array(h);
    for (let u = 0; u < w; u++) xi[u] = Math.min(gw - 1, Math.floor((u + 0.5) * gw / w));
    for (let v = 0; v < h; v++) yi[v] = Math.min(gh - 1, Math.floor((v + 0.5) * gh / h));
    for (let v = 0; v < h; v++, tk()) for (let u = 0; u < w; u++) {
      const s = yi[v] * gw + xi[u], d = v * w + u;
      if (rgba) { out[d * 4] = src[s * 4]; out[d * 4 + 1] = src[s * 4 + 1]; out[d * 4 + 2] = src[s * 4 + 2]; out[d * 4 + 3] = src[s * 4 + 3]; }
      else out[d] = src[s];
    }
    tk.end();
    return Object.assign(head, { data: out });
  }
  const AX = boxAxis(gw, w), AY = boxAxis(gh, h);
  if (rgba) {
    const P = new Uint8Array(gw * gh * 4);              // premultiplied source
    for (let k = 0; k < gw * gh; k++) {
      const a = src[k * 4 + 3];
      P[k * 4] = premul(src[k * 4], a); P[k * 4 + 1] = premul(src[k * 4 + 1], a); P[k * 4 + 2] = premul(src[k * 4 + 2], a); P[k * 4 + 3] = a;
    }
    const out = new Uint8ClampedArray(w * h * 4);
    for (let v = 0; v < h; v++) {
      tk();
      const ly = AY[v];
      for (let u = 0; u < w; u++) {
        const lx = AX[u];
        let r = 0, g = 0, b = 0, a = 0, sw = 0;
        for (let q = 0; q < ly.length; q += 2) {
          const row = ly[q] * gw, wy = ly[q + 1];
          for (let p = 0; p < lx.length; p += 2) {
            const s = (row + lx[p]) * 4, wt = wy * lx[p + 1];
            r += P[s] * wt; g += P[s + 1] * wt; b += P[s + 2] * wt; a += P[s + 3] * wt; sw += wt;
          }
        }
        const A = Math.round(a / sw), d = (v * w + u) * 4;
        out[d] = unpremul(Math.round(r / sw), A); out[d + 1] = unpremul(Math.round(g / sw), A); out[d + 2] = unpremul(Math.round(b / sw), A); out[d + 3] = A;
      }
    }
    tk.end();
    return Object.assign(head, { data: out });
  }
  const V = physical(grid, 'grid'), O = new Float64Array(w * h);
  for (let v = 0; v < h; v++) {
    tk();
    const ly = AY[v];
    for (let u = 0; u < w; u++) {
      const lx = AX[u];
      let s = 0, sw = 0;
      for (let q = 0; q < ly.length; q += 2) {
        const row = ly[q] * gw, wy = ly[q + 1];
        for (let p = 0; p < lx.length; p += 2) { const x = V[row + lx[p]]; if (x === x) { const wt = wy * lx[p + 1]; s += x * wt; sw += wt; } }
      }
      O[v * w + u] = sw > 0 ? s / sw : NaN;
    }
  }
  const r = toRaw(Object.assign({}, grid, { w, h }), O);
  tk.end();
  return Object.assign(head, { nodata: r.nodata, data: r.data });
}

// ---------------------------------------------------------------- tiles (README 5.2)
function picOf(pic) {
  if (!pic || typeof pic !== 'object') throw fail('RASTER_GRID', 'cutTile needs an rgba8 grid or {w, h, rgba}');
  const data = pic.etype !== undefined ? (pic.etype === 'rgba8' ? pic.data : null) : pic.rgba;
  if (!data) throw fail('RASTER_ETYPE', 'cutTile needs an rgba8 picture, not etype ' + pic.etype);
  if (!(Number.isInteger(pic.w) && Number.isInteger(pic.h) && pic.w > 0 && pic.h > 0) || data.length !== pic.w * pic.h * 4) throw fail('RASTER_GRID', 'cutTile: picture size and data differ');
  return { w: pic.w, h: pic.h, rgba: data };
}
function tileLevels(w, h) {
  const levels = [];
  for (let z = 0; ; z++) {
    const wz = Math.ceil(w / Math.pow(2, z)), hz = Math.ceil(h / Math.pow(2, z));
    levels.push({ z, w: wz, h: hz, nx: Math.ceil(wz / TILE), ny: Math.ceil(hz / TILE) });
    if (wz <= TILE && hz <= TILE) return { zmax: z, levels };
  }
}
// straight-alpha rgba of level z over columns c0..c1, rows r0..r1 (level coordinates, row 0 = min world y)
function levelRegion(P, L, z, c0, c1, r0, r1) {
  const W = c1 - c0 + 1, H = r1 - r0 + 1, out = new Uint8ClampedArray(W * H * 4);
  if (z === 0) {
    for (let r = 0; r < H; r++) out.set(P.rgba.subarray(((r0 + r) * P.w + c0) * 4, ((r0 + r) * P.w + c1 + 1) * 4), r * W * 4);
    return out;
  }
  const below = L[z - 1];
  const bc0 = 2 * c0, bc1 = Math.min(2 * c1 + 1, below.w - 1), br0 = 2 * r0, br1 = Math.min(2 * r1 + 1, below.h - 1);
  const B = levelRegion(P, L, z - 1, bc0, bc1, br0, br1), BW = bc1 - bc0 + 1;
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      let n = 0, sr = 0, sg = 0, sb = 0, sa = 0;
      for (let dy = 0; dy < 2; dy++) {
        const y = 2 * (r0 + r) + dy;
        if (y > br1) continue;
        for (let dx = 0; dx < 2; dx++) {
          const x = 2 * (c0 + c) + dx;
          if (x > bc1) continue;
          const s = ((y - br0) * BW + (x - bc0)) * 4, a = B[s + 3];
          sr += premul(B[s], a); sg += premul(B[s + 1], a); sb += premul(B[s + 2], a); sa += a; n++;
        }
      }
      const half = n >> 1, A = ((sa + half) / n) | 0, d = (r * W + c) * 4;
      out[d] = unpremul(((sr + half) / n) | 0, A); out[d + 1] = unpremul(((sg + half) / n) | 0, A); out[d + 2] = unpremul(((sb + half) / n) | 0, A);
      out[d + 3] = A;
    }
  }
  return out;
}
function cutTile(pic, z, tx, ty) {
  const P = picOf(pic), T = tileLevels(P.w, P.h);
  if (!(Number.isInteger(z) && z >= 0 && z <= T.zmax)) throw fail('RASTER_ARG', 'tile level z must be 0..' + T.zmax + ', got ' + z);
  const L = T.levels, lv = L[z];
  if (!(Number.isInteger(tx) && Number.isInteger(ty) && tx >= 0 && ty >= 0 && tx < lv.nx && ty < lv.ny)) throw fail('RASTER_ARG', 'tile ' + tx + '.' + ty + ' is outside level ' + z + ' (' + lv.nx + ' x ' + lv.ny + ' tiles)');
  const c0 = tx * TILE, c1 = Math.min(lv.w - 1, c0 + TILE - 1);
  const top = lv.h - 1 - ty * TILE, r0 = Math.max(0, top - TILE + 1), r1 = top;   // tile row 0 = level row top (north on top)
  const R = levelRegion(P, L, z, c0, c1, r0, r1), RW = c1 - c0 + 1;
  const out = new Uint8ClampedArray(TILE * TILE * 4);
  for (let tr = 0; tr <= top - r0; tr++) {
    const lr = top - tr - r0;
    out.set(R.subarray(lr * RW * 4, (lr + 1) * RW * 4), tr * TILE * 4);
  }
  return { w: TILE, h: TILE, rgba: out };
}

// ---------------------------------------------------------------- pictures
// tint x shade: a shade below flat moves the tint toward height.shade.dark by up to strength x TOPO.dark (a multiply
// with a floor when dark is black), above flat toward height.shade.light by up to strength x TOPO.light; the amount
// is ((shade - flat) / range) ^ TOPO.gamma, so gentle slopes still show. Table over quarter levels (index = 4 x shade).
const TOPO = Object.freeze({ dark: 1.3, light: 0.8, gamma: 0.75 });
function shadeLut(F, st) {
  const L = new Float64Array(1021);
  for (let x = 0; x <= 1020; x++) {
    const v = x / 4;
    if (v < F) L[x] = -st * TOPO.dark * Math.pow((F - v) / F, TOPO.gamma);
    else if (v > F) L[x] = st * TOPO.light * Math.pow((v - F) / (255 - F), TOPO.gamma);
  }
  return L;
}

function topo(height, o) {
  o = o || {};
  const pal = o.palette || palette();
  const hp = pal.height;
  // progress over 1000: the shade (when not given), the tint, the shading rows, the resample (when o.size)
  const f = tickOf(o), PT = 1000, a1 = o.shade ? 0 : 450, a3 = o.size != null ? 850 : PT, a2 = a1 + (a3 - a1) / 2;
  const shade = o.shade || kterrain.hillshade(height, part(f, 0, a1, PT));
  if (shade.w !== height.w || shade.h !== height.h) throw fail('RASTER_ARG', 'shade and height differ in size');
  const T = tint(height, hp, part(f, a1, a2, PT));
  const tk = kterrain.ticker(part(f, a2, a3, PT), 2 * height.h);
  // the shade of a cell: the mean of its corners that hold a height (a nodata height is flat in the shade grid, R14,
  // and must not pull its neighbours toward flat)
  const HV = height.nodata == null ? null : kterrain.values(height, 'height');
  const S = centres(shade, 'shade', tk, HV), n = height.w * height.h, hw = height.w;
  const sm = shade.meta || {};
  const alt = sm.alt > 0 ? sm.alt : 30;
  // flat ground's shade: meta.flat (this version), else a shade grid of version 1 (255 sin(alt))
  const F = sm.flat > 0 && sm.flat < 255 ? sm.flat : Math.round(255 * Math.sin(alt * Math.PI / 180));
  const st = hp.shade && hp.shade.strength >= 0 ? hp.shade.strength : 0.55;
  const light = color(hp.shade && hp.shade.light || '#FFFFFF'), dark = color(hp.shade && hp.shade.dark || '#000000');
  const D = T.data, LUT = shadeLut(F, st);
  for (let k = 0; k < n; k++) {
    if (k % hw === 0) tk();
    const p = k * 4, s = S[k];
    if (!D[p + 3] || s !== s) continue;
    // s is the mean of four lattice bytes: a multiple of 0.25, so the table holds every value
    const wt = LUT[Math.round(s * 4)], to = wt < 0 ? dark : light, a = wt < 0 ? -wt : wt;
    if (!a) continue;
    D[p] = Math.round(D[p] + (to[0] - D[p]) * a);
    D[p + 1] = Math.round(D[p + 1] + (to[1] - D[p + 1]) * a);
    D[p + 2] = Math.round(D[p + 2] + (to[2] - D[p + 2]) * a);
  }
  let pic = Object.assign(T, { name: 'pic.topo', meta: { min: T.meta.min, max: T.meta.max, shadeAlt: alt, shadeZ: sm.z == null ? null : sm.z } });
  const ext = [pic.ox, pic.oy, pic.ox + pic.w * pic.cell, pic.oy + pic.h * pic.cell];
  if (o.size != null) {
    const size = Number(o.size);
    if (!(Number.isInteger(size) && size >= 16 && size <= 16384)) throw fail('RASTER_ARG', 'picture size must be an integer 16..16384 px, got ' + o.size);
    const long = Math.max(pic.w, pic.h);
    const W = pic.w >= pic.h ? size : Math.max(1, Math.round(pic.w * size / long));
    const H = pic.h >= pic.w ? size : Math.max(1, Math.round(pic.h * size / long));
    if (W !== pic.w || H !== pic.h) pic = resample(pic, W, H, 'box', part(f, a3, PT, PT));
  }
  if (f) f(PT, PT);
  const sidecar = {
    v: 1, layer: 'pic.topo', w: pic.w, h: pic.h, box: ext, cell: pic.cell, rowOrder: 'minY-first', target: o.target || null,
    stackHash: o.stackHash || null, mapHashes: o.mapHashes || null, rung: null, env: null, gaps: [], approx: false, brightness: null,
    made: o.made || new Date().toISOString(),
  };
  return { grid: pic, sidecar };
}

// a deterministic colour per region id (golden-ratio hue walk, integer maths)
function idColour(id, out, p) {
  const x = Math.imul(id, 0x9e3779b1) >>> 0;
  out[p] = 64 + (x & 127); out[p + 1] = 64 + ((x >>> 8) & 127); out[p + 2] = 64 + ((x >>> 16) & 127); out[p + 3] = 255;
}

function render(grid, pal) {
  if (!grid || !gridfile.ETYPES[grid.etype]) throw fail('RASTER_GRID', 'render needs a grid');
  if (grid.etype === 'rgba8') return grid;
  pal = pal || palette();
  const n = grid.w * grid.h, out = new Uint8ClampedArray(n * 4), d = grid.data, nd = grid.nodata;
  const base = { name: grid.name, w: grid.w, h: grid.h, cell: grid.cell, ox: grid.ox, oy: grid.oy, etype: 'rgba8', sample: 'cell', scale: 1, offset: 0, nodata: null, meta: {} };
  if (grid.name === 'slopecls') {
    const cls = pal.slope.classes.map(color);
    for (let k = 0; k < n; k++) { const c = cls[Math.min(cls.length - 1, d[k])]; out.set(c, k * 4); }
    return Object.assign(base, { data: out });
  }
  if (grid.name === 'regions') {
    for (let k = 0; k < n; k++) if (d[k]) idColour(d[k], out, k * 4);
    return Object.assign(base, { data: out });
  }
  if (grid.sample === 'lattice' && grid.name !== 'shade') return tint(grid, pal.height);
  const V = kterrain.values(grid, grid.name);
  let lo = Infinity, hi = -Infinity;
  for (let k = 0; k < n; k++) { const v = V[k]; if (v === v && v > -Infinity && v < Infinity) { if (v < lo) lo = v; if (v > hi) hi = v; } }
  if (grid.name === 'shade') { lo = 0; hi = 255; }
  for (let k = 0; k < n; k++) {
    const v = V[k], p = k * 4;
    if (v !== v || (nd != null && d[k] === nd)) continue;
    const t = hi > lo ? (Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo) : 0, g = Math.round(t * 255);
    out[p] = g; out[p + 1] = g; out[p + 2] = g; out[p + 3] = 255;
  }
  return Object.assign(base, { data: out });
}

module.exports = {
  VERSION, KERNELS, TILE, make, gridfile, png,
  slopeClass: kterrain.slopeClass, hillshade: kterrain.hillshade, landform: kterrain.landform, LANDFORM: kterrain.LANDFORM,
  tint, contourInterval: kcontour.contourInterval, contours: kcontour.contours, contoursVector: kcontour.vector,
  regions: kregion.regions, distance: kregion.distance, costField: kcost.costField, paths: kcost.paths,
  minFilter, resample, cutTile, tileLevels, topo, render, palette, color, premul, unpremul,
};

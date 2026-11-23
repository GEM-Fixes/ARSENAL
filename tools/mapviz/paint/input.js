// paint input helpers (MV-PNT1): what every style reads from the input of paint contract 4.4, on the picture frame
// (paint contract 4.5). All sync. Masks are Uint8Array of W x H in GRID rows (row 0 = min world y); a pixel is tested at
// its centre. Results are remembered per input object (a style may call a helper many times). Light at load.
//   sample(grid, x, y, mode) -> number|null      'nearest' (truncate) or 'bilinear'; physical value; null outside, nodata, NaN
//   toFrame(grid, frame, mode, o?) -> grid       'nearest' (codes, masks: same etype), 'bilinear' (f32, NaN = no value),
//                                                 'area' (rgba8: render frame.resampleTo, premultiplied)
//   offGround(input, o?), waterMask(input, o?) -> {mask, from}, roadMask(input, o?), woodMask(input, o?), treePoints(input),
//   buildings(input), walls(input), materialName(input, i, j), landCover(input, pal, o?), heightRange(input),
//   o = {tick}: tick() with no argument after every 16 rows of work (a throw there, a cancel, ends the helper)
//   groundBits(drownGrid), groundDrownIds(ids, drownGrid), nonGroundIds(drownGrid): the paint drown test (below)
//   A bad grid handed from code throws MV_FAULT PAINT_DRAW_BAD.
//   contours(input), baseOrder(target), masks.apply(grid, input, opts) -> {outsidePather, noData}
// The one game branch of paint lives here: baseOrder (GoH has no shipped-minimap rung). Everything else is the same rule on
// as64, mowas2 and goh: ground type 10 (forest) only occurs in GoH maps, materials are matched by name (ids differ).
// Author: Imperator_Aug (ARSENAL, ia-eb1e0e52)
'use strict';

const WOOD_R = 80;   // u (4 m) around a tree centroid

function mv() { return require('../mapviz'); }
function raster() { return require('../lib/raster'); }

const MEMO = new WeakMap();
function memo(input, key, fn) {
  let m = MEMO.get(input);
  if (!m) { m = new Map(); MEMO.set(input, m); }
  if (!m.has(key)) m.set(key, fn());
  return m.get(key);
}

const cellYOf = g => (g.meta && g.meta.cellY > 0 ? g.meta.cellY : g.cell);
const hasNodata = g => g.nodata !== null && g.nodata !== undefined;
const scaleOf = g => (g.scale === undefined || g.scale === null ? 1 : g.scale);
const offOf = g => g.offset || 0;

function sample(grid, x, y, mode) {
  if (!grid || !grid.data) return null;
  const cy = cellYOf(grid), sc = scaleOf(grid), of = offOf(grid), nd = hasNodata(grid) ? grid.nodata : undefined;
  const W = grid.w, H = grid.h, d = grid.data;
  if (grid.etype === 'rgba8') {
    const i = Math.floor((x - grid.ox) / grid.cell), j = Math.floor((y - grid.oy) / cy);
    if (i < 0 || j < 0 || i >= W || j >= H) return null;
    const p = (j * W + i) * 4;
    return [d[p], d[p + 1], d[p + 2], d[p + 3]];
  }
  if (mode !== 'bilinear') {
    const i = Math.floor((x - grid.ox) / grid.cell), j = Math.floor((y - grid.oy) / cy);
    if (i < 0 || j < 0 || i >= W || j >= H) return null;
    const v = d[j * W + i];
    if (v === nd || v !== v) return null;
    return v * sc + of;
  }
  const half = grid.sample === 'lattice' ? 0 : 0.5;
  let fx = (x - grid.ox) / grid.cell - half, fy = (y - grid.oy) / cy - half;
  if (grid.sample === 'lattice') {
    if (fx < 0 || fy < 0 || fx > W - 1 || fy > H - 1) return null;
  } else {
    if (fx < -0.5 || fy < -0.5 || fx > W - 0.5 || fy > H - 0.5) return null;
    fx = Math.min(Math.max(fx, 0), W - 1); fy = Math.min(Math.max(fy, 0), H - 1);
  }
  const i0 = Math.min(Math.floor(fx), Math.max(0, W - 2)), j0 = Math.min(Math.floor(fy), Math.max(0, H - 2));
  const tx = fx - i0, ty = fy - j0;
  let sum = 0, wsum = 0;
  for (let q = 0; q < 4; q++) {
    const i = Math.min(W - 1, i0 + (q & 1)), j = Math.min(H - 1, j0 + (q >> 1));
    const w = ((q & 1) ? tx : 1 - tx) * ((q >> 1) ? ty : 1 - ty);
    if (w <= 0) continue;
    const v = d[j * W + i];
    if (v === nd || v !== v) continue;
    sum += w * (v * sc + of); wsum += w;
  }
  return wsum > 0 ? sum / wsum : null;
}

function centres(frame) {
  const XC = new Float64Array(frame.W), YC = new Float64Array(frame.H);
  for (let i = 0; i < frame.W; i++) XC[i] = frame.x0 + (i + 0.5) * frame.sx;
  for (let j = 0; j < frame.H; j++) YC[j] = frame.y0 + (j + 0.5) * frame.sy;
  return { XC, YC };
}

function outMeta(grid, frame) {
  const meta = Object.assign({}, grid.meta || {});
  delete meta.cellY;
  if (Math.abs(frame.sy - frame.sx) > 1e-9 * frame.sx) meta.cellY = frame.sy;
  return meta;
}

// o.tick (optional, on every helper below that loops over the frame): called with no argument after every TICK_ROWS rows
// of work, so a style's tick (and a cancel, which throws there) gets in during a long helper. A throw ends the helper and
// nothing is remembered. The results are the same bytes with or without it.
const TICK_ROWS = 16;
function rowBeat(o) {
  const t = o && typeof o.tick === 'function' ? o.tick : null;
  return t ? (j => { if ((j + 1) % TICK_ROWS === 0) t(); }) : null;
}

function toFrame(grid, frame, mode, o) {
  const M = mv();
  if (!grid || !grid.data) throw new M.MvError('MV_FAULT', 'toFrame needs a grid', { code: 'PAINT_DRAW_BAD' });
  if (mode === 'area' || grid.etype === 'rgba8') {
    if (grid.etype !== 'rgba8') throw new M.MvError('MV_FAULT', "toFrame 'area' is for rgba8 pictures, not " + grid.etype, { code: 'PAINT_DRAW_BAD' });
    return require('../render/frame').resampleTo(grid, frame, grid.name);
  }
  const W = frame.W, H = frame.H, { XC, YC } = centres(frame), beat = rowBeat(o);
  const base = { name: grid.name, w: W, h: H, cell: frame.sx, ox: frame.x0, oy: frame.y0, sample: 'cell', meta: outMeta(grid, frame) };
  if (mode === 'bilinear') {
    const out = new Float32Array(W * H);
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) { const v = sample(grid, XC[i], YC[j], 'bilinear'); out[j * W + i] = v === null ? NaN : v; }
      if (beat) beat(j);
    }
    return Object.assign(base, { etype: 'f32', scale: 1, offset: 0, nodata: null, data: out });
  }
  const cy = cellYOf(grid), sw = grid.w, sh = grid.h;
  const out = new grid.data.constructor(W * H);
  const fillV = hasNodata(grid) ? grid.nodata : 0;
  const CI = new Int32Array(W);
  for (let i = 0; i < W; i++) { const c = Math.floor((XC[i] - grid.ox) / grid.cell); CI[i] = c >= 0 && c < sw ? c : -1; }
  for (let j = 0; j < H; j++) {
    const r = Math.floor((YC[j] - grid.oy) / cy);
    for (let i = 0; i < W; i++) out[j * W + i] = r >= 0 && r < sh && CI[i] >= 0 ? grid.data[r * sw + CI[i]] : fillV;
    if (beat) beat(j);
  }
  return Object.assign(base, { etype: grid.etype, scale: scaleOf(grid), offset: offOf(grid), nodata: hasNodata(grid) ? grid.nodata : null, data: out });
}

// nearest raw codes of a layer on the frame (no copy of the grid object), -1 outside / nodata
function codesOn(input, name, o) {
  return memo(input, 'codes:' + name, () => {
    const g = input.layers && input.layers[name];
    if (!g) return null;
    const t = toFrame(g, input.frame, 'nearest', o);
    const out = new Float64Array(t.data.length), nd = hasNodata(g) ? g.nodata : undefined;
    for (let k = 0; k < out.length; k++) { const v = t.data[k]; out[k] = v === nd || v !== v ? -1 : v; }
    return out;
  });
}

// a beat for a flat loop over the n pixels of a frame W wide: o.tick after every TICK_ROWS rows of pixels
function pixBeat(o, W) {
  const t = o && typeof o.tick === 'function' ? o.tick : null, step = Math.max(1, W * TICK_ROWS);
  return t ? (k => { if ((k + 1) % step === 0) t(); }) : null;
}

function offGround(input, o) {
  return memo(input, 'offGround', () => {
    const beat = rowBeat(o);
    const fr = input.frame, W = fr.W, H = fr.H, out = new Uint8Array(W * H);
    const h = input.layers && input.layers.height;
    if (!h || !hasNodata(h)) return out;
    const { XC, YC } = centres(fr), cy = cellYOf(h), nd = h.nodata;
    for (let j = 0; j < H; j++) {
      const r = Math.floor((YC[j] - h.oy) / cy);
      for (let i = 0; i < W; i++) {
        const c = Math.floor((XC[i] - h.ox) / h.cell);
        // outside the height grid there is no ground either [I]
        out[j * W + i] = r < 0 || c < 0 || r >= h.h || c >= h.w || h.data[r * h.w + c] === nd ? 1 : 0;
      }
      if (beat) beat(j);
    }
    return out;
  });
}

// The paint drown test = a ground vehicle or gun class drowns there: a water.drown class counts only when its depth
// (meta.depthM) is above 0 m. GoH has a class 'airborne' at -0.75 m (gamelogic airborne.inc:1509-1515 [V data]); its bit
// is set on every water cell, so counting it would make all GoH water drown. What 'airborne' is in game (planes, gliders,
// para drops) is [I]. With no depthM in the meta (a labels file alone), the ids of NOT_GROUND are left out by name.
const NOT_GROUND = ['airborne'];
function countsAsDrown(id, b, meta) {
  if (NOT_GROUND.includes(id)) return false;
  const dm = meta && Array.isArray(meta.depthM) ? meta.depthM : null;
  if (dm && b >= 0 && b < dm.length) return Number(dm[b]) > 0;
  return true;
}
// -> u32 bit mask of the counting classes of a water.drown grid, or null = every bit counts (no bits list)
function groundBits(g) {
  const meta = g && g.meta, bits = meta && Array.isArray(meta.bits) ? meta.bits : null;
  if (!bits) return null;
  let m = 0;
  for (let b = 0; b < bits.length && b < 32; b++) if (countsAsDrown(bits[b], b, meta)) m = (m | (1 << b)) >>> 0;
  return m;
}
// ids (a water label's drown list) -> the ids that count; g = the water.drown grid when known (its meta gives depthM)
function groundDrownIds(ids, g) {
  const meta = g && g.meta, bits = meta && Array.isArray(meta.bits) ? meta.bits : [];
  return (ids || []).filter(id => countsAsDrown(id, bits.indexOf(id), meta));
}

// the class ids of a water.drown grid that do not count as drown (meta.depthM <= 0 or NOT_GROUND); [] with no bits list
function nonGroundIds(g) {
  const gb = groundBits(g);
  if (gb === null) return [];
  const bits = g.meta.bits, out = [];
  for (let b = 0; b < bits.length && b < 32; b++) if (!((gb >>> b) & 1)) out.push(bits[b]);
  return out;
}

function waterMask(input, o) {
  return memo(input, 'water', () => {
    const fr = input.frame, n = fr.W * fr.H, mask = new Uint8Array(n), off = offGround(input, o), beat = pixBeat(o, fr.W);
    const band = codesOn(input, 'water.band', o);
    if (band) {
      const drown = codesOn(input, 'water.drown', o);
      const gb = drown ? groundBits(input.layers['water.drown']) : null;
      for (let k = 0; k < n; k++) {
        if (beat) beat(k);
        if (off[k]) continue;
        const b = band[k];
        if (b === 1 || b === 2) mask[k] = drown && drown[k] > 0 && (gb === null || ((drown[k] & gb) >>> 0) !== 0) ? 3 : b;
      }
      return { mask, from: 'water' };
    }
    const gt = codesOn(input, 'gtype', o);
    if (!gt) return { mask, from: 'none' };
    for (let k = 0; k < n; k++) {
      if (beat) beat(k);
      if (off[k]) continue;
      const t = gt[k];
      mask[k] = t === 3 ? 1 : t === 4 ? 2 : t === 5 ? 3 : 0;
    }
    return { mask, from: 'gtype' };
  });
}

function namesOf(g) { return (g && g.meta && g.meta.names) || {}; }

// fill a world polygon into a mask at pixel centres (even-odd), only where the mask is 0
function fillCentres(mask, frame, pts, value) {
  if (!pts || pts.length < 3) return;
  const W = frame.W, H = frame.H, n = pts.length;
  let ymin = Infinity, ymax = -Infinity;
  for (const p of pts) { if (p[1] < ymin) ymin = p[1]; if (p[1] > ymax) ymax = p[1]; }
  const j0 = Math.max(0, Math.ceil((ymin - frame.y0) / frame.sy - 0.5)), j1 = Math.min(H - 1, Math.floor((ymax - frame.y0) / frame.sy - 0.5));
  const xs = [];
  for (let j = j0; j <= j1; j++) {
    const y = frame.y0 + (j + 0.5) * frame.sy;
    xs.length = 0;
    for (let e = 0, f = n - 1; e < n; f = e++) {
      const a = pts[f], b = pts[e];
      if ((a[1] <= y && y < b[1]) || (b[1] <= y && y < a[1])) xs.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
    }
    xs.sort((p, q) => p - q);
    for (let q = 0; q + 1 < xs.length; q += 2) {
      const i0 = Math.max(0, Math.ceil((xs[q] - frame.x0) / frame.sx - 0.5)), i1 = Math.min(W - 1, Math.ceil((xs[q + 1] - frame.x0) / frame.sx - 0.5) - 1);
      for (let i = i0; i <= i1; i++) if (!mask[j * W + i]) mask[j * W + i] = value;
    }
  }
}

function objects(input) { return (input.vectors && Array.isArray(input.vectors.objects)) ? input.vectors.objects : []; }

function roadMask(input, o) {
  return memo(input, 'road', () => {
    const fr = input.frame, n = fr.W * fr.H, mask = new Uint8Array(n), beat = pixBeat(o, fr.W);
    const mat = codesOn(input, 'material', o), gt = codesOn(input, 'gtype', o);
    if (mat) {
      const names = namesOf(input.layers.material);
      const code = {};
      for (const id of Object.keys(names)) code[id] = names[id] === 'country_road' ? 2 : names[id] === 'road' ? 1 : 0;
      for (let k = 0; k < n; k++) { const c = code[mat[k]]; if (c) mask[k] = c; if (beat) beat(k); }
    }
    if (gt) for (let k = 0; k < n; k++) { if (!mask[k] && gt[k] === 7) mask[k] = 1; if (beat) beat(k); }
    let q = 0;
    for (const ob of objects(input)) {
      if (o && o.tick && (++q & 255) === 0) o.tick();
      if (ob.category !== 'road_decal' || !ob.fp || !Array.isArray(ob.fp.pts) || ob.fp.pts.length < 3) continue;
      fillCentres(mask, fr, ob.fp.pts, 3);
    }
    return mask;
  });
}

function centroid(fp) {
  const P = fp && Array.isArray(fp.pts) ? fp.pts : [];
  if (!P.length) return null;
  let x = 0, y = 0;
  for (const p of P) { x += p[0]; y += p[1]; }
  return [x / P.length, y / P.length];
}

function treePoints(input) {
  return memo(input, 'trees', () => {
    const out = [];
    for (const o of objects(input)) {
      if (o.category !== 'tree') continue;
      const c = centroid(o.fp);
      if (c) out.push({ x: c[0], y: c[1], uid: o.uid });
    }
    out.sort((a, b) => (a.uid - b.uid) || (a.x - b.x) || (a.y - b.y));
    return out;
  });
}

function woodMask(input, o) {
  return memo(input, 'wood', () => {
    const fr = input.frame, W = fr.W, H = fr.H, mask = new Uint8Array(W * H), beat = pixBeat(o, W);
    const gt = codesOn(input, 'gtype', o);
    if (gt) for (let k = 0; k < mask.length; k++) { if (gt[k] === 10) mask[k] = 1; if (beat) beat(k); }
    const r2 = WOOD_R * WOOD_R;
    let q = 0;
    for (const t of treePoints(input)) {
      if (o && o.tick && (++q & 255) === 0) o.tick();
      const i0 = Math.max(0, Math.ceil((t.x - WOOD_R - fr.x0) / fr.sx - 0.5)), i1 = Math.min(W - 1, Math.floor((t.x + WOOD_R - fr.x0) / fr.sx - 0.5));
      const j0 = Math.max(0, Math.ceil((t.y - WOOD_R - fr.y0) / fr.sy - 0.5)), j1 = Math.min(H - 1, Math.floor((t.y + WOOD_R - fr.y0) / fr.sy - 0.5));
      for (let j = j0; j <= j1; j++) {
        const dy = fr.y0 + (j + 0.5) * fr.sy - t.y;
        for (let i = i0; i <= i1; i++) { const dx = fr.x0 + (i + 0.5) * fr.sx - t.x; if (dx * dx + dy * dy <= r2) mask[j * W + i] = 1; }
      }
    }
    return mask;
  });
}

function byCats(input, cats) {
  const out = [];
  for (const o of objects(input)) {
    if (!cats.includes(o.category) || !o.fp || !Array.isArray(o.fp.pts)) continue;
    out.push({ uid: o.uid, category: o.category, pts: o.fp.pts.map(p => [p[0], p[1]]) });
  }
  out.sort((a, b) => (a.uid - b.uid) || (a.pts.length && b.pts.length ? (a.pts[0][0] - b.pts[0][0]) || (a.pts[0][1] - b.pts[0][1]) : 0));
  return out;
}
function buildings(input) { return memo(input, 'buildings', () => byCats(input, ['building', 'building_part'])); }
function walls(input) { return memo(input, 'walls', () => byCats(input, ['wall', 'fence'])); }

function materialName(input, i, j) {
  const g = input.layers && input.layers.material;
  if (!g) return null;
  const fr = input.frame;
  const v = sample(g, fr.x0 + (i + 0.5) * fr.sx, fr.y0 + (j + 0.5) * fr.sy, 'nearest');
  if (v === null) return null;
  const n = namesOf(g)[v];
  return n === undefined ? null : n;
}

function landCover(input, pal, o) {
  const C = require('./canvas');
  const P = input.palette || {}, gm = (P.ground && P.ground.materials) || {};
  const lc = pal && pal.landCover ? pal.landCover : null;
  const other = C.color(lc && lc.other ? lc.other : (P.ground && P.ground.other) || '#B0A890');
  const colOf = name => {
    if (lc && lc[name]) return C.color(lc[name]);
    if (gm[name]) return C.color(gm[name]);
    return other;
  };
  const fr = input.frame, n = fr.W * fr.H, out = new Uint8ClampedArray(n * 4);
  const mat = codesOn(input, 'material', o), beat = pixBeat(o, fr.W);
  const names = mat ? namesOf(input.layers.material) : {};
  const table = {};
  for (let k = 0; k < n; k++) {
    if (beat) beat(k);
    const id = mat ? mat[k] : -1;
    let c = table[id];
    if (!c) c = table[id] = (id >= 0 && names[id] !== undefined ? colOf(names[id]) : other);
    out[k * 4] = c[0]; out[k * 4 + 1] = c[1]; out[k * 4 + 2] = c[2]; out[k * 4 + 3] = c[3];
  }
  return out;
}

function heightRange(input) {
  return memo(input, 'hrange', () => {
    const h = input.layers && input.layers.height;
    if (!h) return { min: null, max: null };
    const sc = scaleOf(h), of = offOf(h), nd = hasNodata(h) ? h.nodata : undefined;
    let mn = Infinity, mx = -Infinity;
    for (let k = 0; k < h.data.length; k++) {
      const v = h.data[k];
      if (v === nd || v !== v) continue;
      const p = v * sc + of;
      if (p < mn) mn = p; if (p > mx) mx = p;
    }
    return mn === Infinity ? { min: null, max: null } : { min: mn, max: mx };
  });
}

function contours(input) {
  return memo(input, 'contours', () => {
    const h = input.layers && input.layers.height;
    if (!h) return { interval: null, lines: [], labels: [] };
    const R = raster();
    return R.contours(h, { interval: R.contourInterval(h) });
  });
}

const BASE_AS2 = ['l4', 'l3', 'l2', 'l1', 'edshot', 'minimap', 'l0'];
const BASE_GOH = ['l4', 'l3', 'l2', 'l1', 'edshot', 'l0'];
// GoH ships its minimaps as sketches, never as photos (paint contract 9 [V art.md]): no minimap rung for goh
function baseOrder(target) { return (target === 'goh' ? BASE_GOH : BASE_AS2).slice(); }

// masks.apply: hatch outside doc.boxes.pather (palette masks.outsidePather) and the no-ground pixels (masks.noData)
function apply(grid, input, opts) {
  const C = require('./canvas');
  const fr = input.frame, W = fr.W, H = fr.H, P = input.palette || {}, PM = P.masks || {};
  const pa = input.doc && input.doc.boxes ? input.doc.boxes.pather : null;
  let outsidePather = 0, noData = 0;
  if (Array.isArray(pa) && pa.length === 4 && PM.outsidePather) {
    const m = new Uint8Array(W * H);
    for (let j = 0; j < H; j++) {
      const y = fr.y0 + (j + 0.5) * fr.sy, oy = y < pa[1] || y > pa[3];
      for (let i = 0; i < W; i++) {
        const x = fr.x0 + (i + 0.5) * fr.sx;
        if (oy || x < pa[0] || x > pa[2]) { m[j * W + i] = 1; outsidePather++; }
      }
    }
    if (outsidePather) C.hatchMask(grid, m, PM.outsidePather.hatch, { fill: PM.outsidePather.fill });
  }
  const off = offGround(input);
  for (let k = 0; k < off.length; k++) if (off[k]) noData++;
  if (noData && PM.noData) C.hatchMask(grid, off, PM.noData.hatch, { fill: PM.noData.fill });
  return { outsidePather, noData };
}

module.exports = {
  WOOD_R, sample, toFrame, offGround, waterMask, roadMask, woodMask, treePoints, buildings, walls, materialName, landCover,
  heightRange, contours, baseOrder, masks: { apply }, fillCentres, codesOn, NOT_GROUND, groundBits, groundDrownIds, nonGroundIds,
  TICK_ROWS,
};

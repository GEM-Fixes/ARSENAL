// previews compose: the frame of each target and the picture written into it (previews.md 3, 4, 7; design 10, 11).
// Geometry (sync, pure; world u, boxes [x0,y0,x1,y1]):
//   stretch(box, size) -> {sx, sy, ratio, scaleBar}   px per m per axis (rounded to 4 decimals), ratio = sx / sy,
//     scaleBar = |ratio - 1| <= 0.05
//   points(doc, mode) -> [{what:'flag'|'spawn', name, team, x, y}]   flags and spawns of the mode (no mode: every mode)
//   actionBox(doc, mode) -> box | null   union of flag zones (circle radius max(rA, rB); poly points; no zone: the centre)
//     and spawns, before the margin; no points (SP maps): doc.boxes.camera, else pather (actionOf(doc, mode) -> {box, from})
//   cropFrame(A, B, size, o?) -> box   A + 10% per side, grown to the frame aspect about its centre, shifted inside B where it
//     fits; o.leftHalf (GoH SP preview): A takes the left half of the frame, the frame reaches right by as much again
//   bandFrame(doc, mode, B) -> {frame, centre, out:[name]}   3.75:1, centred between the team a and b spawn centroids,
//     as large as fits in B, shifted inside B; out = flags and spawns outside it
//   insetRect(size, B, marksPx) -> {box:[x, y, w, h], corner}   frame px, row 0 = top; long side 28% of the frame height
//   backdropRect(size, B) -> [x, y, w, h]   B at its own aspect, as large as fits, centred
//   frameOf(row) -> the world box drawn into the frame (B for stretch)
// Pictures (async):
//   compose(src, doc, row, o) -> Promise<{w, h, rgba, notes, texts}>   row = one plan target; rgba row 0 = top of the written file;
//     notes = codes, texts = {code: text} of paint's own notes;
//     o = {sources (Sources), paint?, mode, seed, palette?, title?, font?, progress?}
//   Sources(src, doc, o) -> {get(resolved, from, file?) -> Promise<{w, h, data, box}>}   one draw or read per product per call;
//     o.size = the long side of an l1 drawn here (default 2048; write --all passes the size its largest file needs)
//   boxBlur(rgba, W, H, r) -> new array   title helpers: loadFont(src, size) -> font | null, drawTitle(rgba, W, H, text, font) -> bool
// Author: Imperator_Aug (ARSENAL, ia-c1b4be7d)
'use strict';
const path = require('path');
const RS = require('./resample');
const T = require('./targets');

const r4 = v => Math.round(v * 1e4) / 1e4;
const UPM = 20;

function stretch(box, size) {
  const wm = (box[2] - box[0]) / UPM, hm = (box[3] - box[1]) / UPM;
  const sx = size[0] / wm, sy = size[1] / hm, ratio = sx / sy;
  return { sx: r4(sx), sy: r4(sy), ratio: r4(ratio), scaleBar: Math.abs(ratio - 1) <= 0.05 };
}

function modesOf(doc, mode) { return (doc.modes || []).filter(m => !mode || m.id === mode); }
function points(doc, mode) {
  const out = [], seen = new Set();
  for (const m of modesOf(doc, mode)) {
    for (const f of m.flags || []) { const k = 'f|' + f.name + '|' + f.x + '|' + f.y; if (!seen.has(k)) { seen.add(k); out.push({ what: 'flag', name: f.name, team: f.team || null, x: f.x, y: f.y, zone: f.zone || null }); } }
    for (const s of m.spawns || []) { const k = 's|' + s.name + '|' + s.x + '|' + s.y; if (!seen.has(k)) { seen.add(k); out.push({ what: 'spawn', name: s.name, team: s.team || null, x: s.x, y: s.y }); } }
  }
  return out;
}

function zoneBox(p) {
  const z = p.zone;
  if (z && z.kind === 'circle') { const r = Math.max(z.rA || 0, z.rB || 0); return [p.x - r, p.y - r, p.x + r, p.y + r]; }
  if (z && z.kind === 'poly' && z.pts && z.pts.length) {
    const b = [Infinity, Infinity, -Infinity, -Infinity];
    for (const q of z.pts) { b[0] = Math.min(b[0], q[0]); b[1] = Math.min(b[1], q[1]); b[2] = Math.max(b[2], q[0]); b[3] = Math.max(b[3], q[1]); }
    return b;
  }
  return [p.x, p.y, p.x, p.y];
}
function union(a, b) { return a ? [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])] : b.slice(); }
// actionOf: the action box and where it came from. A mode with no flags and no spawns (every SP map in the three games,
// sampled [V]) takes doc.boxes.camera, else doc.boxes.pather, cut to the world box [I: camera box = the playable area,
// PRV-G9]; none -> {box:null, from:null}
function actionOf(doc, mode) {
  let A = null;
  for (const p of points(doc, mode)) A = union(A, p.what === 'flag' ? zoneBox(p) : [p.x, p.y, p.x, p.y]);
  if (A) return { box: A, from: 'points' };
  const B = doc.boxes && doc.boxes.world;
  for (const k of ['camera', 'pather']) {
    const b = doc.boxes && doc.boxes[k];
    if (!Array.isArray(b) || b.length !== 4 || !(b[2] > b[0] && b[3] > b[1])) continue;
    const c = B ? [Math.max(b[0], B[0]), Math.max(b[1], B[1]), Math.min(b[2], B[2]), Math.min(b[3], B[3])] : b.slice();
    if (c[2] > c[0] && c[3] > c[1]) return { box: c, from: k };
  }
  return { box: null, from: null };
}
function actionBox(doc, mode) { return actionOf(doc, mode).box; }

// shift box (size kept) inside B on each axis where it fits; o.noLeft: never move it left (GoH SP left half)
function shiftInside(box, B, o) {
  const out = box.slice();
  for (const ax of [0, 1]) {
    const lo = ax, hi = ax + 2, size = out[hi] - out[lo];
    if (size > B[hi] - B[lo]) continue;
    let d = 0;
    if (out[lo] < B[lo]) d = B[lo] - out[lo];
    else if (out[hi] > B[hi]) d = B[hi] - out[hi];
    if (ax === 0 && o && o.noLeft && d < 0) d = 0;
    out[lo] += d; out[hi] += d;
  }
  return out;
}
function growTo(box, aspect) {   // aspect = width / height of the wanted box (world)
  let w = box[2] - box[0], h = box[3] - box[1];
  const cx = (box[0] + box[2]) / 2, cy = (box[1] + box[3]) / 2;
  if (!(w > 0)) w = 1; if (!(h > 0)) h = 1;
  if (w / h < aspect) w = h * aspect; else h = w / aspect;
  return [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2];
}
function cropFrame(A, B, size, o) {
  if (!A) return B.slice();
  const mx = (A[2] - A[0]) * 0.1, my = (A[3] - A[1]) * 0.1;
  const Am = [A[0] - mx, A[1] - my, A[2] + mx, A[3] + my];
  if (o && o.leftHalf) {
    const g = growTo(Am, (size[0] / 2) / size[1]);
    const f = [g[0], g[1], g[0] + 2 * (g[2] - g[0]), g[3]];
    return shiftInside(f, B, { noLeft: true });
  }
  return shiftInside(growTo(Am, size[0] / size[1]), B);
}

const BAND = 3.75;
function centroid(list) { if (!list.length) return null; let x = 0, y = 0; for (const p of list) { x += p.x; y += p.y; } return [x / list.length, y / list.length]; }
function bandFrame(doc, mode, B) {
  const pts = points(doc, mode), sp = pts.filter(p => p.what === 'spawn');
  const ca = centroid(sp.filter(p => p.team === 'a')), cb = centroid(sp.filter(p => p.team === 'b'));
  // ruling: one team without spawns -> the centroid of every spawn; none at all -> the centre of B
  const c = ca && cb ? [(ca[0] + cb[0]) / 2, (ca[1] + cb[1]) / 2] : sp.length ? centroid(sp) : [(B[0] + B[2]) / 2, (B[1] + B[3]) / 2];
  const bw = B[2] - B[0], bh = B[3] - B[1];
  let w = bw, h = bw / BAND;
  if (h > bh) { h = bh; w = bh * BAND; }
  const frame = shiftInside([c[0] - w / 2, c[1] - h / 2, c[0] + w / 2, c[1] + h / 2], B);
  const out = pts.filter(p => p.x < frame[0] || p.x > frame[2] || p.y < frame[1] || p.y > frame[3]).map(p => p.name);
  return { frame, centre: [r4(c[0]), r4(c[1])], out };
}

function insetDims(size, B) {
  const L = Math.max(4, Math.round(0.28 * size[1])), bw = B[2] - B[0], bh = B[3] - B[1];
  return bw >= bh ? [L, Math.max(1, Math.round(L * bh / bw))] : [Math.max(1, Math.round(L * bw / bh)), L];
}
const CORNERS = ['bottom-right', 'bottom-left', 'top-right', 'top-left'];
function insetRect(size, B, marksPx) {
  const [iw, ih] = insetDims(size, B), W = size[0], H = size[1];
  const m = Math.max(4, Math.round(H / 60)) + 3;     // margin + the 3 px border
  const at = {
    'bottom-right': [W - m - iw, H - m - ih], 'bottom-left': [m, H - m - ih], 'top-right': [W - m - iw, m], 'top-left': [m, m],
  };
  let best = null;
  for (const c of CORNERS) {
    const [x, y] = at[c];
    const n = (marksPx || []).filter(p => p[0] >= x - 3 && p[0] < x + iw + 3 && p[1] >= y - 3 && p[1] < y + ih + 3).length;
    if (!best || n < best.n) best = { n, corner: c, box: [x, y, iw, ih] };
    if (n === 0) break;
  }
  return { box: best.box, corner: best.corner, marks: best.n };
}
function backdropRect(size, B) {
  const W = size[0], H = size[1], bw = B[2] - B[0], bh = B[3] - B[1];
  let w = W, h = Math.round(W * bh / bw);
  if (h > H) { h = H; w = Math.round(H * bw / bh); }
  w = Math.max(1, w); h = Math.max(1, h);
  return [Math.floor((W - w) / 2), Math.floor((H - h) / 2), w, h];
}

function frameOf(row, doc, mode, kind) {
  const B = doc.boxes.world;
  if (row.compose === 'crop') return cropFrame(actionBox(doc, mode), B, row.size, { leftHalf: row.leftHalf });
  if (row.compose === 'band') return bandFrame(doc, mode, B).frame;
  return B.slice();
}

// ---------------------------------------------------------------- pictures
function boxBlur(rgba, W, H, r) {
  if (!(r > 0)) return new Uint8ClampedArray(rgba);
  const n = 2 * r + 1, tmp = new Uint8ClampedArray(rgba.length), out = new Uint8ClampedArray(rgba.length);
  const div = s => Math.floor((2 * s + n) / (2 * n));
  for (let j = 0; j < H; j++) for (let c = 0; c < 4; c++) {
    let s = 0;
    for (let k = -r; k <= r; k++) s += rgba[(j * W + Math.min(W - 1, Math.max(0, k))) * 4 + c];
    for (let i = 0; i < W; i++) {
      tmp[(j * W + i) * 4 + c] = div(s);
      s += rgba[(j * W + Math.min(W - 1, i + r + 1)) * 4 + c] - rgba[(j * W + Math.max(0, i - r)) * 4 + c];
    }
  }
  for (let i = 0; i < W; i++) for (let c = 0; c < 4; c++) {
    let s = 0;
    for (let k = -r; k <= r; k++) s += tmp[(Math.min(H - 1, Math.max(0, k)) * W + i) * 4 + c];
    for (let j = 0; j < H; j++) {
      out[(j * W + i) * 4 + c] = div(s);
      s += tmp[(Math.min(H - 1, j + r + 1) * W + i) * 4 + c] - tmp[(Math.max(0, j - r) * W + i) * 4 + c];
    }
  }
  return out;
}

// products: one read or draw per resolved name; pic = {w, h, data (rgba8, row 0 = min world y), box}
function Sources(src, doc, o) {
  o = o || {};
  const memo = new Map();
  async function make(resolved, from, file) {
    if (from === 'in') {
      const gf = require('../lib/raster/gridfile');
      const g = gf.read(file);
      let sc = null;
      try { sc = JSON.parse(require('fs').readFileSync(file.replace(/\.mvg$/i, '.json'), 'utf8')); } catch (e) { sc = null; }
      if (g.etype !== 'rgba8') throw Object.assign(new Error('not an rgba8 picture: ' + path.basename(file)), { prv: 'PRV_SOURCE_MISSING' });
      const box = sc && Array.isArray(sc.box) ? sc.box : [g.ox, g.oy, g.ox + g.w * g.cell, g.oy + g.h * ((g.meta && g.meta.cellY) || g.cell)];
      if (sc && sc.rowOrder && sc.rowOrder !== 'minY-first') throw Object.assign(new Error('row order ' + sc.rowOrder + ' is not minY-first: ' + path.basename(file)), { prv: 'PRV_SOURCE_MISSING' });
      if (sc && (sc.w !== g.w || sc.h !== g.h)) throw Object.assign(new Error('sidecar size ' + sc.w + 'x' + sc.h + ' differs from the grid ' + g.w + 'x' + g.h + ': ' + path.basename(file)), { prv: 'PRV_SOURCE_MISSING' });
      return { w: g.w, h: g.h, data: g.data, box };
    }
    const R = require('../render');
    if (resolved === 'pic.l1') {
      const r = await R.l1(src, doc, { size: o.size || 2048, mode: o.mode || undefined, progress: o.progress || undefined, cancelFlag: o.cancelFlag || undefined });
      return { w: r.grid.w, h: r.grid.h, data: r.grid.data, box: r.sidecar.box };
    }
    if (resolved === 'pic.l0') {
      const mk = require('../lib/mapkit'), ras = require('../lib/raster');
      const g = mk.grids(src, doc.key, { mode: o.mode || undefined });
      const shade = ras.hillshade(g.height);
      const r = R.l0(doc, Object.assign({}, g, { shade }), { mode: o.mode || undefined, src, target: src.target, made: 'x' });
      return { w: r.grid.w, h: r.grid.h, data: r.grid.data, box: r.sidecar.box };
    }
    throw Object.assign(new Error('no way to draw ' + resolved + ' here'), { prv: 'PRV_SOURCE_MISSING' });
  }
  return {
    get(resolved, from, file) {
      const k = resolved + '|' + from + '|' + (file || '');
      if (!memo.has(k)) memo.set(k, make(resolved, from, file));
      return memo.get(k);
    },
  };
}

function gridOf(rgba, w, h, box) {
  return { name: 'pic.preview', w, h, cell: (box[2] - box[0]) / w, ox: box[0], oy: box[1], etype: 'rgba8', sample: 'cell', scale: 1, offset: 0, nodata: null, meta: { cellY: (box[3] - box[1]) / h }, data: rgba };
}

// the marks input of a picture that is not a style: doc and mode, plus the water labels (water.labels.json) and the drown
// layer (water.drown.mvg) when --in holds them; routes, strong and danger are read by paint.marks.read from o.in (late P2)
function marksInput(doc, o) {
  const M = require('../mapviz');
  const vectors = {}, layers = {};
  const vf = M.findIn(o.in || [], 'water.labels.json');
  if (vf) {
    try { const j = JSON.parse(require('fs').readFileSync(vf, 'utf8')); vectors['water.labels'] = Array.isArray(j) ? j : (j && Array.isArray(j.items) ? j.items : []); } catch (e) { /* a bad file is left out */ }
  }
  const df = M.findIn(o.in || [], 'water.drown.mvg');
  if (df) { try { layers['water.drown'] = require('../lib/raster/gridfile').read(df); } catch (e) { /* left out */ } }
  return { doc, mode: o.mode || null, vectors, layers };
}

// one picture of box at w x h, row 0 = min world y, opaque (over black). marks: null = no marks at all (backdrop base,
// inset); 'none' | 'flags' | 'full' = that set, plus strong and danger when the row turns them on
async function pictureAt(src, doc, row, o, box, w, h, marks, notes) {
  const B = doc.boxes.world, s = row.source;
  const withs = marks == null ? [] : [].concat(row.strong ? ['strong'] : [], row.danger ? ['danger'] : []);
  let rgba;
  if (s.from === 'paint') {
    const P = o.paint;
    const g = await P.picture({ style: s.resolved, target: src.target, game: src.game, mods: src.mods, modDirs: src.modDirs, map: doc.key,
      mode: o.mode || undefined, w, h, box, seed: o.seed || 1, in: o.in || [], src, doc, marks: marks || 'none',
      with: withs, progress: o.progress, cancelFlag: o.cancelFlag });
    rgba = RS.overBlack(new Uint8ClampedArray(g.grid.data));
    RS.clipOutside(rgba, w, h, box, B); RS.opaque(rgba);
    for (const n of (g.sidecar && g.sidecar.notes) || []) if (n && n.code) { notes.push(n.code); if (n.text && notes.texts) notes.texts[n.code] = String(n.text); }
    return rgba;
  }
  const pic = await o.sources.get(s.resolved, s.from, s.file);
  rgba = RS.opaque(RS.resample(pic, box, w, h, { clip: B }));
  if (marks != null && (marks !== 'none' || withs.length)) {
    const P = o.paint;
    if (!P || !P.marks || typeof P.marks.draw !== 'function' || typeof P.marks.read !== 'function') { notes.push('PRV_MARKS_NOT_BUILT'); return rgba; }
    const f = P.frameFor(doc, { w, h, box });
    const kinds = (P.marks.SETS[marks] || []).concat(withs);
    const items = P.marks.read(marksInput(doc, o), { in: o.in || [], kinds, kind: 'inf' });
    const grid = gridOf(rgba, w, h, box);
    P.marks.draw(grid, f, items, Object.assign({ hand: 'ink', palette: o.palette || require('../palette.json'), kinds, seed: o.seed || 1 }, P.thumbRules(f)));
    RS.opaque(grid.data);
    rgba = grid.data;
  }
  return rgba;
}

function rect(rgba, W, H, x, y, w, h, c) {
  for (let j = Math.max(0, y); j < Math.min(H, y + h); j++) for (let i = Math.max(0, x); i < Math.min(W, x + w); i++) {
    const p = (j * W + i) * 4; rgba[p] = c[0]; rgba[p + 1] = c[1]; rgba[p + 2] = c[2]; rgba[p + 3] = 255;
  }
}
function outline(rgba, W, H, x, y, w, h, t, c) {
  rect(rgba, W, H, x, y, w, t, c); rect(rgba, W, H, x, y + h - t, w, t, c);
  rect(rgba, W, H, x, y, t, h, c); rect(rgba, W, H, x + w - t, y, t, h, c);
}

async function compose(src, doc, row, o) {
  const W = row.size[0], H = row.size[1], B = doc.boxes.world, notes = [];
  notes.texts = {};   // code -> text of paint's own sidecar notes (PAINT_*)
  const north = T.TOP_IS_NORTH[row.id];
  const frame = row.frame || frameOf(row, doc, o.mode);
  let out;
  if (row.compose === 'backdrop') {
    const base = await pictureAt(src, doc, row, o, B, W, H, null, notes);
    const r = Math.max(1, Math.floor(Math.max(W, H) / 32));
    out = boxBlur(base, W, H, r);
    for (let p = 0; p < out.length; p += 4) { out[p] = (out[p] + 1) >> 1; out[p + 1] = (out[p + 1] + 1) >> 1; out[p + 2] = (out[p + 2] + 1) >> 1; out[p + 3] = 255; }
    if (north) out = RS.flipRows(out, W, H);
    const [x, y, w, h] = backdropRect(row.size, B);
    let inner = await pictureAt(src, doc, row, o, B, w, h, row.marks, notes);
    if (north) inner = RS.flipRows(inner, w, h);
    RS.blit(out, W, H, inner, w, h, x, y);
  } else {
    out = await pictureAt(src, doc, row, o, frame, W, H, row.marks, notes);
    if (north) out = RS.flipRows(out, W, H);
    if (row.compose === 'crop' && row.inset) {
      const [x, y, w, h] = row.inset.box;
      let pic = await pictureAt(src, doc, row, o, B, w, h, null, notes);
      if (north) pic = RS.flipRows(pic, w, h);
      outline(out, W, H, x - 3, y - 3, w + 6, h + 6, 1, [0, 0, 0]);
      outline(out, W, H, x - 2, y - 2, w + 4, h + 4, 2, [255, 255, 255]);
      RS.blit(out, W, H, pic, w, h, x, y);
      // the action box A' (the frame) as a 2 px white rectangle inside the inset
      const fx = v => Math.round((v - B[0]) / (B[2] - B[0]) * w), fy = v => Math.round((north ? (B[3] - v) : (v - B[1])) / (B[3] - B[1]) * h);
      const ax0 = fx(Math.max(B[0], frame[0])), ax1 = fx(Math.min(B[2], frame[2]));
      const ya = fy(Math.max(B[1], frame[1])), yb = fy(Math.min(B[3], frame[3]));
      const ay0 = Math.min(ya, yb), ay1 = Math.max(ya, yb);
      const cw = Math.max(4, ax1 - ax0), ch = Math.max(4, ay1 - ay0);
      const sub = new Uint8ClampedArray(out.length); sub.set(out);
      outline(sub, W, H, x + ax0, y + ay0, cw, ch, 2, [255, 255, 255]);
      // keep the rectangle inside the inset only
      for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) { const p = (j * W + i) * 4; if (j >= 0 && j < H && i >= 0 && i < W) { out[p] = sub[p]; out[p + 1] = sub[p + 1]; out[p + 2] = sub[p + 2]; } }
    }
  }
  if (o.title && row.title) {
    if (!o.font || !drawTitle(out, W, H, o.title, o.font)) notes.push('PRV_TITLE_GLYPHS');
  }
  return { w: W, h: H, rgba: out, notes: Array.from(new Set(notes)), texts: notes.texts };
}

// ---------------------------------------------------------------- title (the game's main_* font, design 9)
// font = {chars: Map(code -> [id, x, y, w, h, xoff, yoff, xadv, page, chnl]), pages: [{w, h, rgba}], lineHeight, base}
function loadFont(src, wantPx) {
  const B = require('../../lib/bmfont');
  const dir = 'resource/interface/font/';
  const keys = src.keys(dir);
  const fonts = [];
  for (const k of keys) {
    if (!/\.font$/i.test(k)) continue;
    let f; try { f = B.fontFacts(src.read(k).toString('latin1')); } catch (e) { continue; }
    if (f && f.name && f.name.toLowerCase() === 'main' && !f.style && f.binary && f.size) fonts.push(f);
  }
  if (!fonts.length) return null;
  fonts.sort((a, b) => a.size - b.size);
  let pick = fonts[0];
  for (const f of fonts) if (f.height ? f.height <= wantPx : f.size <= wantPx) pick = f;
  const fk = dir + pick.binary.toLowerCase().replace(/\\/g, '/');
  if (!src.has(fk)) return null;
  let p; try { p = B.parse(src.read(fk)); } catch (e) { return null; }
  if (!p || !p.chars || !p.chars.length || !p.common) return null;
  const pages = [];
  for (const name of p.pages) {
    const stem = String(name).replace(/\.[^.]*$/, '').toLowerCase();
    const pk = B.pickPage(stem, keys.map(k => k.slice(dir.length)));
    if (!pk.use || (pk.ext !== 'tga' && pk.ext !== 'dds')) return null;
    const buf = src.read(dir + pk.use);
    let im = null;
    if (pk.ext === 'tga') { try { im = B.tga(buf); } catch (e) { im = null; } }
    else { const d = require('../../lib/model/dds').decode(buf); if (!d.error) im = { w: d.width, h: d.height, rgba: d.rgba }; }
    if (!im) return null;
    pages.push(im);
  }
  const chars = new Map();
  for (const c of p.chars) chars.set(c[0] & 0xffff, c);
  return { chars, pages, lineHeight: p.common.lineHeight, base: p.common.base, size: pick.size };
}

function drawTitle(rgba, W, H, text, font) {
  const cps = Array.from(String(text)).map(c => c.codePointAt(0));
  if (!cps.length || cps.some(c => c > 0xffff || (!font.chars.has(c) && c !== 32))) return false;
  let width = 0;
  for (const c of cps) { const g = font.chars.get(c); width += g ? g[7] : Math.round(font.lineHeight / 3); }
  if (width > W - 8) return false;
  const x0 = Math.floor((W - width) / 2), y0 = Math.max(4, Math.round(H / 40));
  const pass = (dx, dy, col) => {
    let pen = x0;
    for (const c of cps) {
      const g = font.chars.get(c);
      if (!g) { pen += Math.round(font.lineHeight / 3); continue; }
      const pg = font.pages[g[8]];
      if (!pg) return false;
      const ch = g[9] === 1 ? 2 : g[9] === 2 ? 1 : g[9] === 4 ? 0 : 3;
      for (let j = 0; j < g[4]; j++) for (let i = 0; i < g[3]; i++) {
        const sx = g[1] + i, sy = g[2] + j;
        if (sx >= pg.w || sy >= pg.h) continue;
        const a = pg.rgba[(sy * pg.w + sx) * 4 + ch];
        if (!a) continue;
        const X = pen + g[5] + i + dx, Y = y0 + g[6] + j + dy;
        if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
        const p = (Y * W + X) * 4;
        for (let k = 0; k < 3; k++) rgba[p + k] = Math.floor((col * a + rgba[p + k] * (255 - a) + 127) / 255);
      }
      pen += g[7];
    }
    return true;
  };
  return pass(1, 1, 0) && pass(0, 0, 255);
}

module.exports = { stretch, points, zoneBox, actionBox, actionOf, marksInput, cropFrame, bandFrame, insetRect, insetDims, backdropRect, frameOf, shiftInside, growTo,
  compose, Sources, pictureAt, boxBlur, loadFont, drawTitle, BAND, CORNERS };

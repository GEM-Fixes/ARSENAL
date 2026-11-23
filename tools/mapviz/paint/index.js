// paint (MV-PNT1, shared files): four styles (staff, painted, recon, sketch) and the marks (paint contract 4.1). Light at
// load: the heavy parts (mapkit, raster, water, entcat, render) are required inside the functions that use them.
//   VERSION, STYLES, KERNELS, PALETTE_KEY, styles (styles.js), input (input.js), canvas, paper, marks, record, masks
//   frameFor(doc, o) -> frame          o = {size} or {w, h}, optional box [x0,y0,x1,y1] (default doc.boxes.world)
//                                       frame = {box, W, H, sx, sy, x0, y0, long, stretch}; stretch = sx / sy
//   gather(o) -> Promise<input>         the input of paint contract 4.4 (stage read); a want that cannot be made is absent
//   draw(input, opts) -> Promise<{grid, gaps, notes, stats, approx}>   the style's draw, checked
//   picture(o) -> Promise<{grid, sidecar}>   gather, draw, masks.apply, marks.draw (marks != none), record.sidecar
//   thumbRules(frame) -> {thumb, minStroke, maxSymbols, contours}
// Games: one rule for as64, mowas2 and goh. The only branch is the recon base order (input.baseOrder: GoH has no shipped
// minimap rung) and the refusal of --base minimap on goh (PAINT_BASE_GOH_MINIMAP).
// Author: Imperator_Aug (ARSENAL, ia-6a90d71a)
'use strict';
const fs = require('fs'), path = require('path');

const VERSION = 1;   // = cli.js version (cache key)
const STYLES = ['staff', 'painted', 'recon', 'sketch'];
const KERNELS = ['paint/painted/kuwahara'];
const PALETTE_KEY = { staff: 'staff', painted: 'painted', recon: 'recon', sketch: 'field_sketch' };
const THUMB = 512;
const MARK_SETS = ['none', 'flags', 'full'];
const APPROX_GAPS = ['PAINT_BASE_APPROX', 'PAINT_BASE_MINIMAP', 'PAINT_BASE_SCHEMATIC', 'PAINT_NO_WATER_MASKS'];
const BASE_WORDS = ['auto', 'l4', 'l3', 'l2', 'l1', 'edshot', 'minimap', 'l0'];
// the layer names gather knows how to read or make (README 4.4 names); vectors are JSON files
const GRID_NAMES = ['height', 'gtype', 'material', 'shade', 'slopecls', 'landform.r50', 'landform.r10', 'water.band', 'water.drown', 'water.depth'];
const VECTOR_NAMES = ['objects', 'water.labels'];

function mv() { return require('../mapviz'); }
const styles = require('./styles');
const input = require('./input');
const canvas = require('./canvas');
const paper = require('./paper');
const marks = require('./marks');
const record = require('./record');

// ---- frame
function frameFor(doc, o) {
  const M = mv(), F = require('../render/frame');
  o = o || {};
  let box;
  if (o.box !== undefined) {
    const b = o.box;
    if (!Array.isArray(b) || b.length !== 4 || !b.every(Number.isFinite) || !(b[2] > b[0]) || !(b[3] > b[1])) {
      throw new M.MvError('MV_FAULT', 'box must be [x0, y0, x1, y1] with x0 < x1 and y0 < y1', { code: 'PAINT_DRAW_BAD' });
    }
    box = b.slice();
  } else {
    const p = F.plan(doc, { size: 16 });
    box = p.box;
  }
  let W, H, sx, sy;
  if (o.w !== undefined || o.h !== undefined) {
    W = F.checkSize(o.w); H = F.checkSize(o.h);
    sx = (box[2] - box[0]) / W; sy = (box[3] - box[1]) / H;
  } else {
    const p = F.plan({ boxes: { world: box } }, { size: o.size === undefined ? 2048 : o.size });
    const f = F.frameOf(p);
    W = f.W; H = f.H; sx = f.sx; sy = f.sy;
  }
  return { box, W, H, sx, sy, x0: box[0], y0: box[1], long: Math.max(W, H), stretch: sx / sy };
}

function thumbRules(frame) {
  return frame.long <= THUMB ? { thumb: true, minStroke: 2, maxSymbols: 5, contours: false } : { thumb: false, minStroke: 1, maxSymbols: null, contours: true };
}

// ---- tick: o.tick, else a reporter (o.progress: a mapviz progress object, or a file) plus o.cancelFlag
// both progress and cancelFlag: the tick sets the progress and checks the flag (throttled at 100 ms, the end tick always)
function tickOf(o) {
  if (typeof o.tick === 'function') return o.tick;
  const M = mv();
  const set = o.progress && typeof o.progress.set === 'function' ? (d, t) => o.progress.set(d, t) : null;
  const flag = o.cancelFlag;
  if (!flag) return set || (() => {});
  let last = 0;
  return (d, t) => {
    if (set) set(d, t);
    const now = Date.now();
    if (now - last < 100 && !(t !== undefined && d >= t)) return;
    last = now;
    if (fs.existsSync(flag)) throw new M.MvError('MV_CANCELLED', 'cancelled');
  };
}

// a mapviz progress object for a sub call (render l1) whose stages and steps land in [lo, hi] of the caller's tick
function subProgress(tick, lo, hi, scale) {
  let done = 0, total = 0;
  const emit = () => tick(lo + Math.floor((hi - lo) * (total > 0 ? Math.min(done, total) / total : 0)), scale);
  return {
    stage(name, n) { done = 0; total = n || 0; emit(); },
    step(n) { done += n === undefined ? 1 : n; emit(); },
    set(d, n) { done = d; if (n !== undefined) total = n; emit(); },
    check() { emit(); },
  };
}

// gather bookkeeping kept beside the input (the input shape of 4.4 stays as frozen)
const META = new WeakMap();
function metaOf(inp) { return META.get(inp) || { inputs: {}, notes: [], gaps: [], mapHashes: null, src: null }; }

function readVector(file) {
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  return Array.isArray(j) ? j : (j && Array.isArray(j.items) ? j.items : []);
}

function sha1(buf) { return require('crypto').createHash('sha1').update(buf).digest('hex'); }
function mapHashesOf(src, key) {
  if (!src || !key || typeof src.read !== 'function') return null;
  const out = {};
  for (const n of ['map', 'map.net']) {
    const k = 'resource/map/' + key + '/' + n;
    try { if (!src.has || src.has(k)) { const b = src.read(k); if (b) out[n] = sha1(b); } } catch (e) { /* absent: no hash */ }
  }
  return Object.keys(out).length ? out : null;
}

function picFromFile(file) {
  const gf = require('../lib/raster/gridfile');
  const g = gf.read(file);
  let sc = null;
  const sf = file.replace(/\.mvg$/, '.json');
  try { if (fs.existsSync(sf)) sc = JSON.parse(fs.readFileSync(sf, 'utf8')); } catch (e) { sc = null; }
  return { g, sc };
}

// the shipped minimap stretched over boxes.world (README 4.2: file row 0 = min world y), or null with a note
function minimapGrid(src, doc, notes) {
  const P = doc.pictures && doc.pictures.minimap;
  if (!P || !src) return null;
  const key = 'resource/map/' + doc.key + '/' + P.file;
  let px = null;
  try {
    const buf = src.read(key);
    const ext = String(P.ext || '').toLowerCase();
    if (ext === 'png') { const d = require('../lib/raster/png').decode(buf); px = { w: d.w, h: d.h, rgba: d.rgba }; }
    else if (ext === 'dds' || ext === 'tga' || ext === 'bmp') {
      const d = require('../../lib/model/picture').decode(ext, buf, {});
      if (d && !d.error && d.rgba) px = { w: d.width, h: d.height, rgba: d.rgba };
    }
  } catch (e) { px = null; }
  if (!px) { notes.push({ code: 'PAINT_BASE_UNREAD', text: 'the shipped minimap ' + P.file + ' could not be read' }); return null; }
  const b = doc.boxes.world, cell = (b[2] - b[0]) / px.w, cy = (b[3] - b[1]) / px.h;
  const meta = Math.abs(cy - cell) > 1e-9 * cell ? { cellY: cy } : {};
  return { name: 'pic.minimap', w: px.w, h: px.h, cell, ox: b[0], oy: b[1], etype: 'rgba8', sample: 'cell', scale: 1, offset: 0, nodata: null, meta,
    data: new Uint8ClampedArray(px.rgba.buffer ? px.rgba.buffer.slice(px.rgba.byteOffset, px.rgba.byteOffset + px.rgba.byteLength) : px.rgba) };
}

async function gather(o) {
  const M = mv();
  o = o || {};
  const style = styles.load(o.style);
  const tick = tickOf(o);
  const notes = [], gaps = [], inputs = {};
  const target = o.target || (o.doc && o.doc.game) || null;
  if (!target || !M.TARGETS[target]) throw new M.MvError('MV_USAGE', '--target as64|mowas2|goh is needed');
  if (!o.map && !(o.doc && o.doc.key)) throw new M.MvError('MV_USAGE', '--map <map key> is needed');
  const baseWord = o.base === undefined || o.base === null ? 'auto' : o.base;
  if (typeof baseWord === 'string') {
    if (!BASE_WORDS.includes(baseWord)) throw new M.MvError('MV_USAGE', '--base must be one of ' + BASE_WORDS.join(', ') + ', got ' + baseWord);
    if (baseWord !== 'auto' && o.style !== 'recon') throw new M.MvError('MV_USAGE', '--base is a recon flag');
    if (baseWord === 'minimap' && target === 'goh') {
      throw new M.MvError('MV_USAGE', 'GoH minimaps are sketches, never a recon base', { code: 'PAINT_BASE_GOH_MINIMAP' });
    }
  }
  const dirs = o.in || [];
  let srcV = o.src || null;
  const src = () => srcV || (srcV = require('../lib/mapkit').source({ target, game: o.game, mods: o.mods, modDirs: o.modDirs }));
  // doc: given, else mapdoc.json in --in for this map, else mapkit
  let doc = o.doc || null;
  if (!doc) {
    const f = M.findIn(dirs, 'mapdoc.json');
    if (f) { try { const d = JSON.parse(fs.readFileSync(f, 'utf8')); if (d && d.key === o.map && (!d.game || d.game === target)) doc = d; } catch (e) { doc = null; } }
  }
  if (!doc) doc = require('../lib/mapkit').doc(src(), o.map, { mode: o.mode });
  const map = o.map || doc.key;
  const mode = o.mode || null;
  if (mode && !(doc.modes || []).some(m => m.id === mode)) throw new M.MvError('MV_NOT_FOUND', 'map ' + map + ' has no mode ' + mode, { map, mode });
  tick(50, 1000);
  const frame = frameFor(doc, o);
  const md = mode ? doc.modes.find(m => m.id === mode) : null;
  const W = md && typeof md.water === 'number' ? md.water : (doc.water ? doc.water.level : 0);

  const needs = (style.NEEDS || []).slice(), wants = (style.WANTS || []).slice();
  const names = needs.concat(wants.filter(n => !needs.includes(n)));
  // height is always tried: the shared no-ground hatch reads it, for every style (absent is fine when not a need)
  for (const n of (o.extraNames || []).concat(['height'])) if (!names.includes(n)) names.push(n);
  const layers = {}, vectors = {};
  const givenL = o.layers || {}, givenV = o.vectors || {};
  let grids = null, waterMk = null, prof = null;
  const mkGrids = () => {
    if (!grids) grids = require('../lib/mapkit').grids(src(), map, { mode: mode || undefined, tick: (d, t) => tick(100 + Math.floor(400 * d / (t || 1)), 1000) });
    return grids;
  };
  const made = name => { inputs[name] = 'made'; notes.push({ code: 'PAINT_INPUT_MADE', text: name + ' was made in process' }); };
  const getGrid = name => {
    if (layers[name]) return layers[name];
    if (givenL[name]) { layers[name] = givenL[name]; inputs[name] = inputs[name] || 'in'; return layers[name]; }
    const f = M.findIn(dirs, name + '.mvg');
    if (f) { layers[name] = require('../lib/raster/gridfile').read(f); inputs[name] = 'in'; return layers[name]; }
    return null;
  };
  const make = name => {
    const R = require('../lib/raster');
    if (name === 'height' || name === 'gtype' || name === 'material') return mkGrids()[name];
    if (name === 'shade' || name === 'slopecls' || name === 'landform.r50' || name === 'landform.r10') {
      const h = need('height');
      if (!h) return null;
      if (name === 'shade') return R.hillshade(h);
      if (name === 'slopecls') return R.slopeClass(h);
      return R.landform(h, name === 'landform.r50' ? 50 : 10);
    }
    if (/^water\./.test(name) && name !== 'water.labels') {
      if (!waterMk) {
        const Wt = require('../rules/water');
        const h = need('height'), g = need('gtype');
        if (!h || !g) return null;
        prof = prof || Wt.profile(src());
        waterMk = Wt.masks(doc, { height: h, gtype: g }, prof, mode || undefined);
      }
      return waterMk[name.slice(6)] || null;
    }
    return null;
  };
  function need(name) {
    const g = getGrid(name);
    if (g) return g;
    let m = null;
    try { m = make(name); } catch (e) {
      if (e instanceof M.MvError && e.code === 'MV_CANCELLED') throw e;
      if (name === 'height' && needs.includes('height')) throw new M.MvError('MV_NOT_FOUND', 'no height for ' + map + ': ' + (e && e.message), { code: 'PAINT_NO_HEIGHT', map });
      notes.push({ code: 'PAINT_INPUT_ABSENT', text: name + ' could not be made: ' + (e && e.message ? e.message : String(e)) });
      m = null;
    }
    if (m) { layers[name] = m; made(name); }
    return m;
  }
  const getVector = name => {
    if (vectors[name]) return vectors[name];
    if (givenV[name]) { vectors[name] = givenV[name]; inputs[name] = 'in'; return vectors[name]; }
    const f = M.findIn(dirs, name + '.json');
    if (f) { vectors[name] = readVector(f); inputs[name] = 'in'; return vectors[name]; }
    try {
      if (name === 'objects') {
        const E = require('../entcat');
        const ents = (doc.entities || []).filter(e => e.src === 'map' || (mode && e.src === 'mi' && e.mode === mode));
        const sub = Object.assign({}, doc, { entities: ents });
        const L = E.loaderFor(src());
        const links = E.linksFor(src(), map, sub, { mode: mode || undefined });
        const cat = E.forDoc(src(), sub, { loader: L, links });
        vectors[name] = E.place(sub, cat, links).map(x => Object.assign({ kind: 'object' }, x));
      } else if (name === 'water.labels') {
        const Wt = require('../rules/water');
        const b = need('water.band'), dr = need('water.drown'), de = need('water.depth');
        if (!b || !dr || !de) return null;
        prof = prof || Wt.profile(src());
        vectors[name] = Wt.labels(doc, { band: b, drown: dr, depth: de }, prof);
      } else return null;
    } catch (e) {
      if (e instanceof M.MvError && e.code === 'MV_CANCELLED') throw e;
      notes.push({ code: 'PAINT_INPUT_ABSENT', text: name + ' could not be made: ' + (e && e.message ? e.message : String(e)) });
      return null;
    }
    made(name);
    return vectors[name];
  };

  // a want left absent says so once (4.1), also when its maker gave nothing without a throw
  const absentNote = name => {
    if (!notes.some(n => n.code === 'PAINT_INPUT_ABSENT' && n.text.startsWith(name + ' '))) notes.push({ code: 'PAINT_INPUT_ABSENT', text: name + ' could not be read or made' });
  };
  let k = 0;
  for (const name of names) {
    k++;
    if (name === 'base') continue;
    if (VECTOR_NAMES.includes(name)) { if (!getVector(name)) { inputs[name] = 'absent'; absentNote(name); } }
    else if (GRID_NAMES.includes(name) || givenL[name]) {
      const g = need(name);
      if (!g) {
        inputs[name] = 'absent';
        if (!needs.includes(name)) absentNote(name);
        if (needs.includes(name)) {
          throw new M.MvError('MV_NOT_FOUND', 'paint ' + o.style + ' needs ' + name + ' and it could not be read or made',
            { code: name === 'height' ? 'PAINT_NO_HEIGHT' : 'PAINT_NO_INPUT', map, name });
        }
      }
    } else { inputs[name] = 'absent'; absentNote(name); }
    tick(500 + Math.floor(300 * k / names.length), 1000);
  }

  // recon base (4.5 base order)
  let base = null;
  if (o.style === 'recon') base = findBase(o, baseWord, target, doc, frame, dirs, src, () => mkGrids(), need, notes, gaps, W, mode);
  tick(800, 1000);

  const palette = o.palette || JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'palette.json'), 'utf8'));
  const inp = {
    v: 1, style: o.style, target, map, mode, doc, W, frame, layers, vectors, base,
    palette, pal: (palette.styles || {})[PALETTE_KEY[o.style]] || null, seed: o.seed === undefined ? 1 : o.seed,
  };
  META.set(inp, { inputs, notes, gaps, mapHashes: null, src: null });
  await settleBase(inp, Object.assign({}, o, { tick }));
  tick(1000, 1000);
  const gm = META.get(inp);
  gm.mapHashes = srcV ? mapHashesOf(srcV, map) : null;
  gm.src = srcV;
  return inp;
}

function findBase(o, word, target, doc, frame, dirs, src, mkGrids, need, notes, gaps, W, mode) {
  const M = mv();
  if (o.base && typeof o.base === 'object') {
    const b = o.base;
    const grid = b.grid && (b.grid.w !== frame.W || b.grid.h !== frame.H || b.grid.ox !== frame.x0 || b.grid.oy !== frame.y0) ? input.toFrame(b.grid, frame, 'area') : b.grid;
    if (b.approx) gaps.push('PAINT_BASE_APPROX');
    if (b.from === 'minimap') gaps.push('PAINT_BASE_MINIMAP');
    if (b.from === 'l0') gaps.push('PAINT_BASE_SCHEMATIC');
    return { from: b.from, grid, approx: !!b.approx, sidecar: b.sidecar || null };
  }
  const order = word === 'auto' ? input.baseOrder(target) : [word];
  for (const from of order) {
    if (from === 'minimap') {
      if (target === 'goh') continue;
      let g = null;
      try { g = minimapGrid(src(), doc, notes); } catch (e) { g = null; }
      if (!g) continue;
      gaps.push('PAINT_BASE_MINIMAP');
      return { from, grid: input.toFrame(g, frame, 'area'), approx: true, sidecar: null };
    }
    const f = M.findIn(dirs, 'pic.' + from + '.mvg');
    if (!f) continue;
    const { g, sc } = picFromFile(f);
    const approx = !!(sc && sc.approx);
    if (approx) gaps.push('PAINT_BASE_APPROX');
    if (from === 'l0') gaps.push('PAINT_BASE_SCHEMATIC');
    return { from, grid: input.toFrame(g, frame, 'area'), approx, sidecar: sc };
  }
  if (word === 'minimap') {
    // the minimap comes from the mapdoc pictures (4.5), never from --in: say why it is not there
    const un = notes.filter(n => n.code === 'PAINT_BASE_UNREAD').map(n => n.text);
    const has = !!(doc.pictures && doc.pictures.minimap);
    throw new M.MvError('MV_NOT_FOUND', 'the map ships no readable minimap' + (un.length ? ': ' + un.join('; ') : has ? '' : ' (no minimap in the map folder)'),
      { code: 'PAINT_NO_BASE', base: word, unread: un.length ? un : null, shipped: has });
  }
  if (word !== 'auto') throw new M.MvError('MV_NOT_FOUND', 'no ' + word + ' picture to use as the recon base (give --in with pic.' + word + '.mvg)', { code: 'PAINT_NO_BASE', base: word });
  // none found: render l1 in process; when it throws, l0 (schematic)
  // l1 is async: settleBase draws it at the end of gather
  const Rn = require('../render');
  return { pending: true, from: null, grid: null, approx: false, sidecar: null, _ctx: { Rn, src, doc, mkGrids, need, W, mode, target } };
}

// the render fallback of the recon base (l1 in process, else l0), run after gather's sync part. o.tick (gather's tick, which
// checks the cancel flag) is fed through a progress object, so l1's band steps tick and can cancel (read 800..990 of 1000)
async function settleBase(inp, o) {
  const M = mv();
  const b = inp.base;
  if (!b || !b.pending) return;
  o = o || {};
  const c = b._ctx, meta = metaOf(inp);
  const frame = inp.frame;
  const tick = tickOf(o);
  let pic = null, from = null, sc = null;
  try {
    const r = await c.Rn.l1(c.src(), c.doc, { size: frame.long, mode: c.mode || undefined, cancelFlag: o.cancelFlag, progress: subProgress(tick, 800, 990, 1000) });
    pic = r.grid; sc = r.sidecar; from = 'l1';
  } catch (e) {
    if (e instanceof M.MvError && e.code === 'MV_CANCELLED') throw e;
    try {
      const g = c.mkGrids();
      const shade = c.need('shade');
      const r = c.Rn.l0(c.doc, Object.assign({}, g, { shade, W: c.W }), { size: frame.long, mode: c.mode || undefined, src: c.src(), target: c.target });
      pic = r.grid; sc = r.sidecar; from = 'l0';
      meta.gaps.push('PAINT_BASE_SCHEMATIC');
    } catch (e2) {
      if (e2 instanceof M.MvError && e2.code === 'MV_CANCELLED') throw e2;
      throw new M.MvError('MV_NOT_FOUND', 'no recon base: no picture in --in and neither l1 nor l0 could be drawn (' + (e2 && e2.message) + ')', { code: 'PAINT_NO_BASE' });
    }
  }
  const approx = !!(sc && sc.approx);
  if (approx) meta.gaps.push('PAINT_BASE_APPROX');
  inp.base = { from, grid: input.toFrame(pic, frame, 'area'), approx, sidecar: sc };
  meta.notes.push({ code: 'PAINT_INPUT_MADE', text: 'the recon base ' + from + ' was drawn in process' });
}

// absent wants -> gaps and notes of paint contract 4.4 (the same for every style)
function absentGaps(inp, style) {
  const gaps = [], notes = [];
  const wants = style.WANTS || [];
  const L = inp.layers || {}, V = inp.vectors || {};
  if ((wants.includes('water.band') || wants.includes('water.drown')) && !L['water.band']) gaps.push('PAINT_NO_WATER_MASKS');
  if (wants.includes('objects') && !V.objects) gaps.push('PAINT_NO_OBJECTS');
  if (wants.includes('landform.r50') && !L['landform.r50']) gaps.push('PAINT_NO_LANDFORM');
  if (wants.includes('material') && !L.material) notes.push({ code: 'PAINT_NO_MATERIAL', text: 'no material layer: land cover from the fallback colour' });
  // the paint drown test leaves out classes that do not drown a ground vehicle (input.groundBits; GoH 'airborne' -0.75 m)
  const left = wants.includes('water.drown') && L['water.band'] && L['water.drown'] ? input.nonGroundIds(L['water.drown']) : [];
  if (left.length) notes.push({ code: 'PAINT_DROWN_VEHICLE_ONLY', text: 'drown = a ground vehicle drowns: water.drown classes ' + left.join(', ') + ' (depth <= 0 m) not counted' });
  return { gaps, notes };
}

async function draw(inp, opts) {
  const M = mv();
  const style = styles.load(inp.style);
  const fr = inp.frame;
  opts = Object.assign({}, thumbRules(fr), { seed: inp.seed === undefined ? 1 : inp.seed, tick: () => {}, pool: 0, workDir: null, cancelFlag: null }, opts || {});
  if (typeof opts.tick !== 'function') opts.tick = () => {};
  let r;
  try { r = await style.draw(inp, opts); } catch (e) {
    if (e instanceof M.MvError) throw e;
    throw new M.MvError('MV_FAULT', 'paint style ' + inp.style + ' broke: ' + (e && e.message ? e.message : String(e)), { code: 'PAINT_STYLE_BROKEN', style: inp.style });
  }
  const g = r && r.grid;
  if (!g || g.etype !== 'rgba8' || g.w !== fr.W || g.h !== fr.H || !g.data || g.data.length !== fr.W * fr.H * 4) {
    throw new M.MvError('MV_FAULT', 'paint style ' + inp.style + ' returned a bad picture (want rgba8 ' + fr.W + ' x ' + fr.H + ')',
      { code: 'PAINT_DRAW_BAD', style: inp.style, got: g ? { etype: g.etype, w: g.w, h: g.h } : null });
  }
  g.name = 'pic.' + inp.style;
  g.cell = fr.sx; g.ox = fr.x0; g.oy = fr.y0; g.sample = 'cell'; g.scale = 1; g.offset = 0; g.nodata = null;
  const meta = { style: inp.style, styleVersion: style.VERSION, seed: opts.seed };
  if (Math.abs(fr.sy - fr.sx) > 1e-9 * fr.sx) meta.cellY = fr.sy;
  g.meta = meta;
  const ab = absentGaps(inp, style), gm = metaOf(inp);
  // gaps: the style's, gather's and the absent wants' merged as a set; notes: a shared note whose code the style already
  // gave is dropped, so the style's own wording wins
  const gaps = uniq([].concat(Array.isArray(r.gaps) ? r.gaps : [], gm.gaps, ab.gaps));
  const own = Array.isArray(r.notes) ? r.notes : [];
  const ownCodes = new Set(own.map(n => n && n.code));
  const notes = own.concat(ab.notes.filter(n => !ownCodes.has(n.code)));
  return { grid: g, gaps, notes, stats: r.stats && typeof r.stats === 'object' ? r.stats : {}, approx: !!r.approx || gaps.some(c => APPROX_GAPS.includes(c)) };
}

function uniq(a) { const out = []; for (const x of a) if (x && !out.includes(x)) out.push(x); return out; }

function checkMarks(o) {
  const M = mv();
  const set = o.marks === undefined || o.marks === null ? 'none' : o.marks;
  if (!MARK_SETS.includes(set)) throw new M.MvError('MV_USAGE', '--marks must be none, flags or full, got ' + set, { code: 'PAINT_MARKS_SET' });
  const w = o.with === undefined || o.with === null ? [] : Array.isArray(o.with) ? o.with : String(o.with).split(',').map(s => s.trim()).filter(Boolean);
  for (const k of w) if (!marks.KINDS.includes(k)) throw new M.MvError('MV_USAGE', '--with takes ' + marks.KINDS.join(', ') + ', got ' + k, { code: 'PAINT_MARKS_SET' });
  const kinds = uniq(marks.SETS[set].concat(w));
  return { set, with: w, kinds };
}

async function picture(o) {
  o = o || {};
  const mk = checkMarks(o);
  const tick = tickOf(o);
  const extraNames = mk.kinds.includes('water') ? ['water.labels'] : [];
  const inp = await gather(Object.assign({}, o, { tick, extraNames }));
  // o.stage(name, total): the caller's stage hook (cli: progress stage 'draw' between read and write, ruling 0)
  if (typeof o.stage === 'function') o.stage('draw', 1000);
  const style = styles.load(inp.style);
  const fr = inp.frame;
  // cancelFlag reaches the style too: painted hands it to its pool children, so they stop on their own
  const opts = Object.assign({}, thumbRules(fr), { seed: inp.seed, tick, pool: o.pool || 0, workDir: o.workDir || null, cancelFlag: o.cancelFlag || null });
  const res = await draw(inp, opts);
  const counts = input.masks.apply(res.grid, inp, opts);
  let mres = null;
  if (mk.kinds.length) {
    const items = marks.read(inp, { in: o.in || [], kinds: mk.kinds, kind: o.kind || 'inf', extra: o.extra || [] });
    const d = marks.draw(res.grid, fr, items, Object.assign({ hand: marks.HANDS[inp.style], palette: inp.palette, kinds: mk.kinds, seed: inp.seed }, thumbRules(fr)));
    mres = { set: mk.set, kinds: mk.kinds, drawn: d.drawn, dropped: d.dropped, scaleBar: d.scaleBar };
    const nd = Object.keys(d.dropped).reduce((s, k) => s + d.dropped[k], 0);
    if (nd) res.notes.push({ code: 'PAINT_MARKS_DROPPED', text: nd + ' marks left out of a small picture' });
  }
  const gm = metaOf(inp);
  const sidecar = record.sidecar(inp, Object.assign({}, res, { counts, marks: mres }), {
    styleVersion: style.VERSION, inputs: gm.inputs, notes: gm.notes, mapHashes: gm.mapHashes, made: o.made,
  });
  return { grid: res.grid, sidecar, input: inp };
}

module.exports = {
  VERSION, STYLES, KERNELS, PALETTE_KEY, THUMB, MARK_SETS, BASE_WORDS, APPROX_GAPS,
  styles, input, canvas, paper, marks, record, masks: input.masks,
  frameFor, thumbRules, gather, settleBase, draw, picture, checkMarks, metaOf, mapHashesOf, tickOf, subProgress,
};

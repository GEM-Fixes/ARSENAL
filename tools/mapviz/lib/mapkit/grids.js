// mapkit grids: the base layers of one map (README 1.1 grids, 4.2-4.4): height (lattice), gtype, gtype.stored, material.
// Engine order [V]: maps the file ids to engine ids
// (v2 by name, v1 legacy tables, v0 legacy combined id); the terrain's own AddLand re-types every cell but the last row and
// column (the /10 end bound); then each land patch of the map (and of the mode with --mode) is laid
// and re-types its rectangle (patches.js).
// Height edges (ground.js): ReadHeights reads every lattice point (w x h, row-major, 4 bytes each; the same read here), but
// the editor gives a point a height only where a face of the ground mesh (map.ply) covers it. Points past the mesh hold
// values no ground gave (0, or an older grid's): whole edge rows and columns on vanilla maps; so does, on many maps, the
// outermost covered column or row (ground.js rim rule: kept only when it equals the mesh height there). After the re-type and the
// patches (which use the raw values, as the engine does) those points become nodata (-32768 for i16, 65535 for u16) in the
// height layer, unless a land patch wrote them. gtype, gtype.stored and material keep the file's values. No map.ply (or one
// that cannot be read): nothing is marked and nodata stays null. height.meta.offGround = the count marked (absent then).
//   grids(src, key, o) -> {height, gtype, gtypeStored, material, notes, W, patches:{applied, skipped}, ground:{faces,
//     under, rim, off, reason, ms}}
//   o = {mode?, tick?(done, total)}: tick is called at each stage start, after each read below and at least every 100 ms
//   of work in between (README 7), done rising to total = 1000; it may throw (a cancel) and the throw goes through. Three
//   reads are single calls into shared libs and cannot be split: map.net (vfs inflate), the map file (sdlx) and map.ply
//   (ply.parse); on the largest GoH maps each takes up to about 0.25 s, map.ply of 3v3_mont_cassel 0.4 s (REPORT.json).
// Author: Imperator_Aug (ARSENAL, ia-6ef56d8f)
'use strict';
const tables = require('./tables'), md = require('./mapdoc'), patches = require('./patches'), ground = require('./ground');

const TICK_MS = 100, TICK_TOTAL = 1000;
const NODATA = { i16: -32768, u16: 65535 };

// engine type id of each file-local id (64 slots as the engine's typeTable; unlisted ids give 0)
function idTables(src, net, mt, notes) {
  const T = new Uint8Array(256), M = new Uint8Array(256);
  if (net.version >= 2) {
    for (const t of net.types) {
      const e = tables.netTypeId(src.target, t.index, t.name);   // AS2 by name, GoH the index (README 3.2)
      // README 3.2 (ruling R2): an unknown name -> 0 (FindGroundType) on as64 and mowas2
      // 15 on goh [I]. A type 0 cell is left alone by the load re-type (3..5 only) and a land patch
      // with a TerrainType overwrites it like any other cell
      T[t.index] = e === null ? tables.unknownTypeId(src.target) : e;
      if (e === null && notes) notes.push(md.typeUnknownNote(src.target, t));
    }
    for (const m of net.materials) {
      const n = String(m.name).toLowerCase();
      M[m.index] = mt.byName.has(n) ? mt.byName.get(n) : 0;   // FindGroundMaterial: unknown name -> 0
    }
  } else if (net.version === 1) {
    for (let i = 0; i < 64; i++) {
      const l = tables.legacyV1(i, i);
      const t = l.type === null ? 1 : tables.typeId(src.target, l.type);   // GetLegacyGroundType: id not listed -> 1
      T[i] = t === null ? 0 : t;
      const m = l.material === null ? 1 : mt.byName.has(l.material) ? mt.byName.get(l.material) : 0;
      M[i] = m;
    }
  }
  return { T, M };
}

// progress over fixed stage spans of TICK_TOTAL; a no-op without a tick function
function progress(fn) {
  if (typeof fn !== 'function') return { stage() {}, part() {}, end() {} };
  let last = 0, base = 0, span = 0, done = 0;
  const fire = d => { done = Math.max(done, d); last = Date.now(); fn(done, TICK_TOTAL); };
  return {
    stage(from, to) { base = from; span = to - from; fire(from); },
    // force: after a step that cannot be split, so the gap is that step alone
    part(x, n, force) { if (force || Date.now() - last >= TICK_MS) fire(base + Math.floor(span * (n > 0 ? Math.min(1, x / n) : 1))); },
    end() { fire(TICK_TOTAL); },
  };
}

function grids(src, key, o) {
  o = o || {};
  const pg = progress(o.tick);
  pg.stage(0, 100);
  const { net } = md.loadNet(src, key);
  pg.part(1, 3, true);
  const notes = [];
  const map = md.readMap(src, key);
  pg.part(2, 3, true);
  const modes = {};
  let modeRec = null;
  if (o.mode) {
    modeRec = md.readMode(src, key, o.mode);
    if (!modeRec) {
      const mv = require('../../mapviz');
      throw new mv.MvError('MV_NOT_FOUND', 'map ' + key + ' has no mode ' + o.mode, { map: key, mode: o.mode });
    }
    modes[o.mode] = modeRec;
  }
  // README 3.2 (ruling R3): one note per map or .mi file the strict reader refuses
  for (const pn of [md.parseNote('map', map.errors), modeRec ? md.parseNote(o.mode + '.mi', modeRec.errors) : null]) if (pn) notes.push(pn);
  const W = md.waterOf(src, key, o.mode || null, { map, modes });
  const w = net.width, h = net.height, n = w * h, v0 = net.version === 0;
  const height = v0 ? new Uint16Array(n) : new Int16Array(n);
  const type = new Uint8Array(n), stored = new Uint8Array(n), mat = new Uint8Array(n);
  const mt = tables.materialTable(md.terrainNames(src));
  const ids = idTables(src, net, mt, notes);
  const b = net.cells, bp = net.bytesPer;
  const unlisted = new Set();
  const listed = new Set(net.types.map(t => t.index));
  pg.stage(100, 450);
  for (let k = 0, off = 0; k < n; k++, off += bp) {
    if (k % w === 0) pg.part(k, n);
    if (v0) {
      height[k] = b.readUInt16LE(off);
      const l = tables.legacyV0(b[off + 2]);
      const t = l.type === null ? 0 : tables.typeId(src.target, l.type);
      type[k] = t === null ? 0 : t;
      mat[k] = l.material === null ? 0 : mt.byName.has(l.material) ? mt.byName.get(l.material) : 0;
    } else {
      height[k] = b.readInt16LE(off);
      const ti = b[off + 2], mi = b[off + 3];
      type[k] = ti < 64 ? ids.T[ti] : 0;
      mat[k] = mi < 64 ? ids.M[mi] : 0;
      if (net.version >= 2 && !listed.has(ti)) unlisted.add(ti);
    }
  }
  for (const id of [...unlisted].sort((a, c) => a - c)) {
    notes.push({ code: 'MAPKIT_TYPE_UNKNOWN', text: 'cells use ground type id ' + id + ', which map.net does not list: the engine reads it as 0 (undef)', at: null });
  }
  // the terrain's own AddLand: every cell but the last row and column
  pg.stage(450, 600);
  stored.set(type);
  for (let y = 0; y < h - 1; y++) {
    pg.part(y, h - 1);
    for (let x = 0; x < w - 1; x++) {
      const k = y * w + x, g = tables.retypeCell(type[k], height[k], W);
      if (g) { type[k] = g[0]; mat[k] = g[1]; }
    }
  }
  // the lattice points under the ground mesh; the raw values of the others are kept to see which a patch wrote
  pg.stage(600, 750);
  const gm = ground.mask(src, key, net, { map: map.map, height, tick: (x, t, force) => pg.part(x, t, force) });
  let offIdx = null, offRaw = null;
  if (gm.mask) {
    let c = 0;
    for (let k = 0; k < n; k++) if (!gm.mask[k]) c++;
    offIdx = new Int32Array(c); offRaw = v0 ? new Uint16Array(c) : new Int16Array(c);
    for (let k = 0, q = 0; k < n; k++) if (!gm.mask[k]) { offIdx[q] = k; offRaw[q++] = height[k]; }
  }
  // land patches of the map, then of the mode
  pg.stage(750, 1000);
  const records = map.records.concat(modeRec ? modeRec.records : []);
  const ctx = { src, target: src.target, net: { w, h, cell: net.cell, offX: net.offX, offY: net.offY }, height, type, typeStored: stored, mat, W,
    records, mt, notes, tick: (x, t) => pg.part(x, t) };
  const pr = patches.apply(ctx);
  // past the ground mesh: nodata, unless a land patch wrote the point
  const et = v0 ? 'u16' : 'i16';
  let off = 0;
  if (offIdx) {
    const ND = NODATA[et];
    for (let q = 0; q < offIdx.length; q++) {
      const k = offIdx[q];
      if (height[k] === offRaw[q]) { height[k] = ND; off++; }
    }
  }
  pg.end();
  const base = { w, h, cell: net.cell, ox: -net.offX, oy: -net.offY, scale: 1, offset: 0, nodata: null };
  const grid = (name, etype, sample, meta, data) => Object.assign({ name }, base, { etype, sample, meta, data });
  const hmeta = { unit: 'u', upm: 20 };
  if (gm.mask) hmeta.offGround = off;
  const hg = grid('height', et, 'lattice', hmeta, height);
  if (off) hg.nodata = NODATA[et];
  return {
    height: hg,
    gtype: grid('gtype', 'u8', 'cell', {}, type),
    gtypeStored: grid('gtype.stored', 'u8', 'cell', {}, stored),
    material: grid('material', 'u8', 'cell', { names: mt.names }, mat),
    notes, W, patches: pr,
    ground: { faces: gm.faces, under: gm.under, rim: gm.rim, off, reason: gm.reason, ms: gm.ms },
  };
}

module.exports = { grids, idTables, NODATA, TICK_TOTAL };

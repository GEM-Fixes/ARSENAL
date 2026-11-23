// paint synthetic input (MV-PNT1, paint contract 8.1): the exact input every style test draws from, with no game and no
// cache. synth(o?) -> input; synthOpts(input) -> opts.
//   o = {style:'staff', target:'mowas2', size:128, seed:1, drop:[name]}   drop = layer or vector names left out ('base' too)
// Frame: box [-320,-240,320,240]; size 128 -> W 128, H 96, sx = sy = 5. Grids 64 x 48, cell 10, ox -320, oy -240; for
// lattice point or cell (i, j): x = -320 + 10 i, y = -240 + 10 j, d = hypot(x - 160, y + 100).
// Author: Imperator_Aug (ARSENAL, ia-7c0e1d57)
'use strict';
const fs = require('fs'), path = require('path');

const P = require('../index');
const R = require('../../lib/raster');

const BOX = [-320, -240, 320, 240];
const GW = 64, GH = 48, CELL = 10, OX = -320, OY = -240;

function doc(target) {
  return {
    v: 1, game: target, key: 'multi/mv_synth', stack: { mods: [], hash: '' }, cell: 10, upm: 20,
    net: { w: 64, h: 48, offX: 320, offY: 240, cell: 10, version: 2, types: [], materials: [] },
    boxes: { world: BOX.slice(), auto: null, camera: null, pather: [-300, -220, 300, 220], named: [] },
    water: { level: -20, source: 'map', ocean: null },
    modes: [{
      id: 'combat', file: 'combat.mi', env: null, water: null,
      spawns: [
        { name: 'a1', uid: 16, team: 'a', order: 1, x: -280, y: 0, z: null, yaw: 0, player: null, phase: null },
        { name: 'b1', uid: 17, team: 'b', order: 1, x: 280, y: 0, z: null, yaw: 180, player: null, phase: null },
      ],
      flags: [{ name: 'f1', def: 'flag_point', uid: 18, team: null, order: 1, x: 0, y: 0, z: null, phase: null, slaveOf: null, zoneId: null,
        zone: { kind: 'circle', rA: 80, rB: 80 }, fort: [] }],
      points: [], clipsBySide: [],
    }],
    entities: [], covers: [],
    pictures: { minimap: null, preview: null, preview_small: null, header: null, header_interface: null }, notes: [],
  };
}

const at = (i, j) => { const x = OX + CELL * i, y = OY + CELL * j; return { x, y, d: Math.hypot(x - 160, y + 100) }; };
const heightOf = (i, j) => {
  if (i === 63 && j >= 44) return -32768;
  const { x, d } = at(i, j);
  if (d < 20) return -120;
  if (d < 40) return -60;
  return Math.round(60 * Math.max(0, 1 - Math.abs(x + 100) / 50));
};

function grid(name, etype, sample, fn, extra) {
  const g = R.make(Object.assign({ name, w: GW, h: GH, cell: CELL, ox: OX, oy: OY, etype, sample }, extra || {}));
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) g.data[j * GW + i] = fn(i, j);
  return g;
}

function square(cx, cy, half) { return [[cx - half, cy - half], [cx + half, cy - half], [cx + half, cy + half], [cx - half, cy + half]]; }
function rect(cx, cy, w, h) { return [[cx - w / 2, cy - h / 2], [cx + w / 2, cy - h / 2], [cx + w / 2, cy + h / 2], [cx - w / 2, cy + h / 2]]; }
const obj = (uid, def, category, fp) => ({ kind: 'object', uid, def, category, fp, zMin: 0, zMax: 0 });

let LAYERS = null;
function layers() {
  if (LAYERS) return LAYERS;
  const height = grid('height', 'i16', 'lattice', heightOf, { nodata: -32768, meta: { unit: 'u', upm: 20, offGround: 4 } });
  const gtype = grid('gtype', 'u8', 'cell', (i, j) => { const d = at(i, j).d; return d < 20 ? 5 : d < 40 ? 4 : (j === 30 || j === 31) ? 7 : 1; });
  const material = grid('material', 'u8', 'cell', (i, j) => { const { x, d } = at(i, j); return d < 40 ? 4 : j === 30 ? 2 : j === 31 ? 3 : x < 0 ? 1 : 0; },
    { meta: { names: { 0: 'ground', 1: 'grass', 2: 'road', 3: 'country_road', 4: 'water' } } });
  const band = grid('water.band', 'u8', 'cell', (i, j) => { const d = at(i, j).d; return d < 30 ? 2 : d < 40 ? 1 : 0; });
  const drown = grid('water.drown', 'u32', 'cell', (i, j) => (at(i, j).d < 20 ? 1 : 0), { meta: { bits: ['tank_medium'], sources: ['vanilla'] } });
  const depth = grid('water.depth', 'i16', 'cell', (i, j) => (at(i, j).d < 40 ? Math.round(-20 - heightOf(i, j)) : -32768), { nodata: -32768 });
  LAYERS = {
    height, gtype, material, shade: R.hillshade(height), slopecls: R.slopeClass(height), 'landform.r50': R.landform(height, 50),
    'water.band': band, 'water.drown': drown, 'water.depth': depth,
  };
  return LAYERS;
}

function vectors() {
  return {
    objects: [
      obj(1, 'fx_tree', 'tree', { kind: 'poly', pts: square(-250, 150, 6) }),
      obj(2, 'fx_tree', 'tree', { kind: 'poly', pts: square(-262, 168, 6) }),
      obj(3, 'fx_tree', 'tree', { kind: 'poly', pts: square(-238, 176, 6) }),
      obj(4, 'fx_house', 'building', { kind: 'poly', pts: rect(-200, -150, 160, 120) }),
      obj(5, 'fx_wall', 'wall', { kind: 'poly', pts: rect(60, -60, 80, 6) }),
      obj(6, 'fx_road', 'road_decal', { kind: 'decal', pts: square(0, 150, 37.5) }),
      obj(7, 'fx_bush', 'bush', { kind: 'none', pts: [[100, 150]] }),
    ],
    'water.labels': [{ kind: 'waterLabel', band: 2, region: 1, x: 160, y: -100, area: 5, depthMin: 2, depthMax: 5, drown: ['tank_medium'], merged: [] }],
  };
}

// copy a grid so a test may change it without touching the cached set
function copy(g) { return Object.assign({}, g, { meta: JSON.parse(JSON.stringify(g.meta || {})), data: g.data.slice() }); }

function synth(o) {
  o = o || {};
  const style = o.style || 'staff', target = o.target || 'mowas2', size = o.size === undefined ? 128 : o.size, seed = o.seed === undefined ? 1 : o.seed;
  const drop = new Set(o.drop || []);
  const d = doc(target);
  const frame = P.frameFor(d, { size });
  const L = {}, src = layers();
  for (const k of Object.keys(src)) if (!drop.has(k)) L[k] = copy(src[k]);
  const V = {}, vs = vectors();
  for (const k of Object.keys(vs)) if (!drop.has(k)) V[k] = vs[k];
  let base = null;
  if (style === 'recon' && !drop.has('base')) {
    const g = P.canvas.create(frame);
    g.name = 'pic.l1';
    for (let j = 0; j < frame.H; j++) for (let i = 0; i < frame.W; i++) {
      const p = (j * frame.W + i) * 4;
      g.data[p] = (2 * i) & 255; g.data[p + 1] = (2 * j) & 255; g.data[p + 2] = 128; g.data[p + 3] = 255;
    }
    base = { from: 'l1', grid: g, approx: false, sidecar: null };
  }
  const palette = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'palette.json'), 'utf8'));
  return {
    v: 1, style, target, map: 'multi/mv_synth', mode: 'combat', doc: d, W: -20, frame, layers: L, vectors: V, base,
    palette, pal: (palette.styles || {})[P.PALETTE_KEY[style]] || null, seed,
  };
}

function synthOpts(input) {
  return Object.assign({}, P.thumbRules(input.frame), { seed: 1, tick: () => {}, pool: 0, workDir: null });
}

module.exports = { synth, synthOpts, doc, heightOf, BOX };

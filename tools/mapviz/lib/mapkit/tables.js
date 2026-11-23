// mapkit tables: engine ground type and material ids, the legacy map.net tables, the load re-type and the water ground
// type (AddLand).
// Pure, no IO.
//   typeId(target, name) -> engine type id | null (name outside the table)     TYPE_OTHER = 15
//   netTypeId(target, index, name) -> engine id of a map.net v2 types[] entry | null (AS2 by name, GoH the index)
//   unknownTypeId(target) -> engine id of a v2 type name outside the tables: 0 for as64 and mowas2 (FindGroundType,
// 0 = undef, blocked ground), 15 (other) for goh [I] (README 3.2, ruling R2)
//   materialTable(terrainNames) -> {byName: Map name -> id, names: {id: name}}   built-ins 0..8, terrains.set from 9
//   legacyV1(typeId, materialId) -> {type: name, material: name}   legacyV0(id) -> {type, material}   (names, null unknown)
//   waterGround(depth) -> [type, material] engine ids ([0, 0] = not set)    depth = W - height
//   retype(stored, h, W) -> engine type id after the load re-type (stored 3..5 only)
//   retypeCell(stored, h, W) -> [type, material] | null (null: the cell keeps its stored type and material)
// Author: Imperator_Aug (ARSENAL, ia-afa340ed)
'use strict';

const TYPES = { undef: 0, ground: 1, no_pass: 2, shallow_water: 3, water: 4, deep_water: 5, swamp: 6, road: 7, no_pass_human: 8 };
// GoH: the fixed table of every GoH map.net (README 3.2) [V data]
const TYPES_GOH = { ground: 1, no_pass: 2, shallow_water: 3, water: 4, deep_water: 5, swamp: 6, road: 7, no_pass_human: 8,
  snow: 9, forest: 10, slope: 11 };
const TYPE_OTHER = 15;
const TYPE_NAMES = {};
for (const t of [TYPES, TYPES_GOH]) for (const k of Object.keys(t)) TYPE_NAMES[t[k]] = k;
TYPE_NAMES[TYPE_OTHER] = 'other';

// built-in materials; terrains.set adds the rest from 9 in file order
const MATERIALS = ['undef', 'ground', 'air', 'underwater', 'shallow_water', 'water', 'deep_water', 'bridge', 'bridge_wood'];
const M = { GROUND: 1, SHALLOW: 4, WATER: 5, DEEP: 6 };
const T = { GROUND: 1, SHALLOW: 3, WATER: 4, DEEP: 5 };

// console vars g_shallowWaterDepth 14, g_mediumWaterDepth 100
const SHALLOW_DEPTH = 14, MEDIUM_DEPTH = 100;

const LEGACY_V1_TYPES = { 0: 'undef', 1: 'ground', 2: 'ground', 3: 'ground', 4: 'ground', 5: 'ground', 6: 'swamp', 7: 'ground',
  8: 'no_pass', 9: 'no_pass_human', 13: 'shallow_water', 14: 'water', 15: 'deep_water' };
const LEGACY_V1_MATS = { 0: 'undef', 1: 'ground', 2: 'road', 3: 'country_road', 4: 'rock', 5: 'ice', 6: 'swamp', 7: 'sand', 8: 'ground',
  13: 'shallow_water', 14: 'water', 15: 'deep_water', 16: 'underwater', 17: 'air', 20: 'puddle', 21: 'mud', 22: 'bridge', 23: 'snow', 25: 'grass' };
const LEGACY_V0 = { 0: ['undef', 'undef'], 10: ['ground', 'shallow_water'], 14: ['ground', 'puddle'], 7: ['ground', 'bridge'],
  18: ['ground', 'snow'], 13: ['swamp', 'shallow_water'], 8: ['ground', 'grass'], 5: ['ground', 'sand'], 11: ['ground', 'mud'],
  193: ['undef', 'air'], 194: ['undef', 'underwater'], 1: ['ground', 'ground'], 6: ['ground', 'road'], 12: ['ground', 'country_road'],
  4: ['ground', 'rock'], 19: ['ground', 'ice'], 3: ['swamp', 'swamp'], 128: ['shallow_water', 'shallow_water'], 129: ['water', 'water'],
  130: ['deep_water', 'deep_water'] };

const lc = s => String(s == null ? '' : s).toLowerCase();

function typeId(target, name) {
  const t = target === 'goh' ? TYPES_GOH : TYPES, n = lc(name);
  return Object.prototype.hasOwnProperty.call(t, n) ? t[n] : null;
}
// engine type id of one map.net v2 types[] entry (README 3.2): AS2 and AS64 by name; GoH = the index as read from the file
// when the name is one of the fixed table [I: the GoH ReadHeights is not in gohweb]; a name outside the tables -> null
// (the caller shows it as unknownTypeId(target) with note MAPKIT_TYPE_UNKNOWN)
function netTypeId(target, index, name) {
  const e = typeId(target, name);
  if (e === null) return null;
  return target === 'goh' ? index : e;
}
// a v2 type name outside the tables: the AS2 engine's FindGroundType gives 0 (a WARNING, the cell is undef = blocked);
// GoH keeps 15 (other) [I: the GoH ReadHeights is not in gohweb]
function unknownTypeId(target) { return target === 'goh' ? TYPE_OTHER : 0; }

function materialTable(terrainNames) {
  const byName = new Map(), names = {};
  MATERIALS.forEach((n, i) => { byName.set(n, i); names[i] = n; });
  let next = MATERIALS.length;
  for (const raw of terrainNames || []) {
    const n = lc(raw);
    if (!n || byName.has(n)) continue;
    byName.set(n, next); names[next] = n; next++;
  }
  return { byName, names };
}

function legacyV1(t, m) {
  return { type: LEGACY_V1_TYPES[t] || null, material: LEGACY_V1_MATS[m] || null };
}
function legacyV0(id) {
  const r = LEGACY_V0[id];
  return r ? { type: r[0], material: r[1] } : { type: null, material: null };
}

// GetWaterGroundType: depth = W - height (float maths)
function waterGround(depth) {
  if (depth > MEDIUM_DEPTH) return [T.DEEP, M.DEEP];
  if (depth > SHALLOW_DEPTH) return [T.WATER, M.WATER];
  if (depth > 0) return [T.SHALLOW, M.SHALLOW];
  return [0, 0];
}
const f32 = Math.fround;
// a cell of type 3..5 takes GetWaterGroundType(float(h - 1)); unset -> ground / ground
function retypeCell(stored, h, W) {
  if (stored < 3 || stored > 5) return null;
  const g = waterGround(f32(f32(W) - f32(h - 1)));
  return g[0] || g[1] ? g : [T.GROUND, M.GROUND];
}
function retype(stored, h, W) {
  const r = retypeCell(stored, h, W);
  return r ? r[0] : stored;
}

module.exports = { TYPES, TYPES_GOH, TYPE_OTHER, TYPE_NAMES, MATERIALS, SHALLOW_DEPTH, MEDIUM_DEPTH, LEGACY_V1_TYPES, LEGACY_V1_MATS,
  LEGACY_V0, typeId, netTypeId, unknownTypeId, materialTable, legacyV1, legacyV0, waterGround, retypeCell, retype };

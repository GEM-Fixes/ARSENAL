// entcat crush: the pather cost of each obstacle ID from resource/set/registry/obstacles.reg, read through sdlx so its
// (define "vehicles" ..) macros expand (no regex over SDL).
//   table(io) -> {ids: {id: {flags:[..], cost:{pather: n}}}, key}|null
//   crushBy(table, id) -> {tank, tankLight, armored, car} = the cost for the pathers "tank", "tank.light", "armored" and
//     "vehicle.small" [I: car = vehicle.small]; cost >= 0 passes (crushes or drives over), -1 blocks, null = id or pather
//     not in the table. Whether the object then breaks is per-def script [I] (design 4).
// Author: Imperator_Aug (ARSENAL, ia-734d3f9a)
'use strict';
const D = require('./defread');

const KEY = 'resource/set/registry/obstacles.reg';
const PATHERS = { tank: 'tank', tankLight: 'tank.light', armored: 'armored', car: 'vehicle.small' };

function table(io) {
  const buf = io.read(KEY);
  if (!buf) return null;
  let root;
  try { root = D.parse(io, KEY, buf).root; } catch (e) { return null; }
  const obs = D.kids(root).find(b => D.lc(D.nameOf(b)) === 'obstacles');
  if (!obs) return null;
  const ids = {};
  for (const b of D.kids(obs)) {
    const id = D.lc(D.nameOf(b));
    if (!id) continue;
    const rec = { flags: [], cost: {} };
    for (const c of D.kids(b)) {
      const f = c.items[0];
      if (f && f.k === 'IDENT') { rec.flags.push(D.lc(f.text)); continue; }
      if (f && f.k === 'STRING') { const n = D.nums(c); if (n.length) rec.cost[D.lc(f.value)] = n[0]; }
    }
    ids[id] = rec;
  }
  return { key: KEY, ids };
}

function crushBy(t, id) {
  const out = {};
  const rec = t && id != null ? t.ids[D.lc(id)] : null;
  for (const k of Object.keys(PATHERS)) out[k] = rec && rec.cost[PATHERS[k]] !== undefined ? rec.cost[PATHERS[k]] : null;
  return out;
}

module.exports = { table, crushBy, KEY, PATHERS };

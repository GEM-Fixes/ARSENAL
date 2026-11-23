// map.net fixtures for milint (MAP-04/05/08): builds binary files + truth lines
// Author: Imperator_Aug (ARSENAL, ia-ccf085fa)
const fs = require('fs'), path = require('path');
const cstr = s => Buffer.concat([Buffer.from([s.length]), Buffer.from(s, 'latin1')]);
const table = (tag, list) => Buffer.concat([Buffer.from(tag), Buffer.from([list.length]), ...list.flatMap(([i, n]) => [Buffer.from([i]), cstr(n)])]);
function net(o) {                       // o: {ver, w, h, types, mats, cells:[[h,t,m]...]}
  const head = Buffer.alloc(14); head[0] = 10; head[1] = o.ver; head.writeInt16LE(o.w, 2); head.writeInt16LE(o.h, 4);
  const parts = [head];
  if (o.ver >= 2) parts.push(table('MAP0', o.types), table('MAP1', o.mats), Buffer.from('GRID'));
  for (const [h, t, m] of o.cells || []) { const c = Buffer.alloc(4); c.writeInt16LE(h, 0); c[2] = t; c[3] = m; parts.push(c); }
  return Buffer.concat(parts);
}
module.exports = function (root, truth, R) {
  const put = (rel, buf) => { const f = path.join(root, ...rel.split('/')); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, buf); };
  const T = (rel, code) => truth.push(`${rel}: ${code}`);
  // terrain names the engine knows: built-in + terrains.set
  put(R + 'set/interaction_terrain/terrains.set', Buffer.from('{terrains\r\n\t{"ground" {pp "ground no_pass"}}\r\n\t{"mud" {pp "swamp no_pass"}}\r\n}\r\n'));
  // bad: unknown type + material names, ground+water, id > 15 / > 127, unlisted id, no-ground cell
  const bad = R + 'map/multi/m3/map.net';
  put(bad, net({ ver: 2, w: 3, h: 3, types: [[1, 'ground'], [2, 'no_pass'], [3, 'bogusT']], mats: [[1, 'ground'], [4, 'water'], [5, 'bogusM'], [9, 'mud']],
    cells: [[0, 1, 4], [0, 20, 1], [0, 1, 200], [0, 7, 1], [-1500, 1, 1], [0, 1, 9], [0, 2, 1], [0, 3, 5], [0, 1, 1]] }));
  for (const c of ['MAP_TERRAIN_UNKNOWN', 'MAP_TERRAIN_UNKNOWN', 'MAP_WATER_PASSABLE', 'MAP_NET_ID_RANGE', 'MAP_NET_ID_RANGE', 'WARN_MAP_NET_ID_UNLISTED', 'WARN_MAP_NET_NO_GROUND']) T(bad, c);
  // size mismatch (1 cell short)
  put(R + 'map/multi/m4/map.net', net({ ver: 1, w: 2, h: 2, cells: [[1, 1, 1], [1, 1, 1], [1, 1, 1]] }));
  T(R + 'map/multi/m4/map.net', 'MAP_NET_FORMAT');
  // clean (shallow_water over ground is vanilla-normal: info only)
  put(R + 'map/multi/m5/map.net', net({ ver: 2, w: 2, h: 1, types: [[1, 'ground']], mats: [[1, 'ground'], [4, 'shallow_water']], cells: [[5, 1, 1], [5, 1, 4]] }));
};

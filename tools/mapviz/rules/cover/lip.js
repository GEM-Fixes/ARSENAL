// cover lip (MV-COV): terrain covers, type 12 terrain_lie (design 5.4; rules.md 4.1, 4.3 of waves C and D).
//   lip(grids, o?) -> {lip (u8 grid 'cover.lip'), points:[coverPoint type 12], counts}
//   terrainShields(grids, pt, threat) -> bool TerrainOcclusion port
// Port of on the whole map [V]: on the level 0 height
// cells (the map.net lattice, one sample per cell's south-west corner), a cell whose 4-neighbour rises more than
// g_coverTerrainReject (3 u) over it casts 8 rays of 4 cells (axes) or 3 cells (diagonals); the cell is a cover when the
// line from its height + g_coverTerrainUplift (10 u) through a nearer sample clears the highest sample of the ray +
// g_coverTerrainEnemy (0). Cells within 4 of the edge are not scanned. The point is the cell's corner; it must be a free
// place for pose 1 (ground types 3, 4, 5 and footprints refuse), hold no cover within 0.6 m
// (HasCoverNear: the wall points before it and the lip points already laid) and have no obstacle zone within 1 m
// (IsClearOfStationary). Height units of the stored cells = world u [I: survey cover.md 1d].
// The layer cover.lip is 1 where the slope test passes and the place is free (before the 0.6 m thinning of the points).
// goh: the same scan on its own cell (5 u maps: rays of 1 m and 0.75 m); meta.used false, as a lying soldier gets no
// terrain covers there (GHAI-32) [V gohweb]; the layer is drawn and strong ignores it; points is [] (profile lipForProne).
// Author: Imperator_Aug (ARSENAL, ia-d79ab118)
'use strict';
const E = require('./edges');
const P = require('./probe');
const U = E.U;

const RAY_X = [-1, 1, 0, 0, -1, -1, 1, 1];
const RAY_Y = [0, 0, -1, 1, -1, 1, -1, 1];

// lip(grids, o?) o {target, profile, objects (place rows: footprints), near (points laid before: walls), tick}
function lip(grids, o) {
  o = o || {};
  const prof = o.profile || require('./index').profile(o.target || 'mowas2');
  const hg = grids && grids.height;
  if (!hg) throw Object.assign(new Error('cover lip: grids.height is needed'), { code: 'COVER_GRID' });
  const f = E.frameOf(grids);
  const W = hg.w, H = hg.h;
  const data = new Uint8Array(f.w * f.h);
  const place = P.placeCheck(grids, o.objects || []);
  const nearIdx = P.buckets(32);
  for (const p of o.near || []) nearIdx.add({ x: p.x, y: p.y }, [p.x, p.y, p.x, p.y]);
  const hasNear = (x, y) => {
    for (const q of nearIdx.query([x - U.near, y - U.near, x + U.near, y + U.near])) if ((q.x - x) * (q.x - x) + (q.y - y) * (q.y - y) < U.near * U.near) return true;
    return false;
  };
  const reject = prof.lipRejectU, uplift = prof.lipUpliftU, enemy = prof.lipEnemyU;
  const ax = prof.lipRay[0], dg = prof.lipRay[1];
  const h = (i, j) => E.latticeH(hg, i, j);
  const pts = [];
  const counts = { steep: 0, cells: 0, points: 0 };
  const tick = typeof o.tick === 'function' ? o.tick : null;
  let lastT = Date.now();
  const M = 4;   // the scan margin
  for (let y = M; y <= H - 1 - M; y++) {
    if (tick && Date.now() - lastT >= 100) { lastT = Date.now(); tick(y, H); }
    for (let x = M; x <= W - 1 - M; x++) {
      const c = h(x, y);
      if (c === null) continue;
      const n4 = [h(x + 1, y), h(x, y + 1), h(x - 1, y), h(x, y - 1)];
      if (!n4.some(v => v !== null && v - c > reject)) continue;
      counts.steep++;
      const top = uplift + c;
      for (let r = 0; r < 8; r++) {
        const dx = RAY_X[r], dy = RAY_Y[r];
        const L = Math.abs(dx) !== Math.abs(dy) ? ax : dg;
        let highest = h(x + L * dx, y + L * dy);
        if (highest === null) continue;
        let slope = -1e38, bad = false;
        for (let s = 1; s < L; s++) {
          const v = h(x + s * dx, y + s * dy);
          if (v === null) { bad = true; break; }
          if (v > highest) highest = v;
          slope = Math.max(slope, (v - top) * L / s + top);
        }
        if (bad || !(slope > enemy + highest)) continue;
        const px = f.ox + x * f.cell, py = f.oy + y * f.cell;
        // the first ray that clears decides; a refused place ends the cell (the engine breaks out of the ray loop)
        if (place.free([px, py], 1, -1) && !place.nearStationary([px, py], U.meter)) {
          if (x < f.w && y < f.h) data[y * f.w + x] = 1;
          counts.cells++;
          // goh: the layer is kept, but no type 12 point exists (a lying soldier gets no terrain covers, GHAI-32), so none
          // is listed and none blocks a later bush point
          if (prof.lipForProne && !hasNear(px, py)) {
            pts.push({ x: px, y: py, type: 12, uid: null, row: 0, wall: null });
            nearIdx.add({ x: px, y: py }, [px, py, px, py]);
          }
        }
        break;
      }
    }
  }
  if (tick) tick(H, H);
  counts.points = pts.length;
  const grid = { name: 'cover.lip', w: f.w, h: f.h, cell: f.cell, ox: f.ox, oy: f.oy, etype: 'u8', sample: 'cell', scale: 1, offset: 0, nodata: null,
    meta: { used: !!prof.lipForProne, game: prof.game, cells: counts.cells }, data };
  return { lip: grid, points: pts.map(P.item), counts };
}

// grid line: Bresenham cells from `from` towards `to`
function gridLine(from, to) {
  const dx = to[0] - from[0], dy = to[1] - from[1];
  const lx = Math.abs(dx), ly = Math.abs(dy);
  const xMajor = lx >= ly;
  const st = { cell: from.slice(), error: 0, xMajor, major: xMajor ? lx : ly, minor: xMajor ? ly : lx,
    along: (xMajor ? dx : dy) >= 0 ? 1 : -1, across: (xMajor ? dy : dx) >= 0 ? 1 : -1 };
  st.remaining = st.major;
  st.step = () => {
    if (st.remaining <= 0) return false;
    st.error += st.minor;
    st.remaining--;
    if (st.xMajor) st.cell[0] += st.along; else st.cell[1] += st.along;
    if (st.error >= st.major) { st.error -= st.major; if (st.xMajor) st.cell[1] += st.across; else st.cell[0] += st.across; }
    return true;
  };
  return st;
}

// TerrainOcclusion(eye, target, height): the share of `height` the `cells` (profile
// occlCells, 5) in front of the target hide from the eye, 0..1
function occlusion(hg, eye, target, height, cells) {
  const nCells = Number.isFinite(cells) && cells > 0 ? Math.floor(cells) : 5;
  const cell = hg.cell, ox = hg.ox, oy = hg.oy;
  const clampI = v => Math.max(0, Math.min(hg.w - 1, v)), clampJ = v => Math.max(0, Math.min(hg.h - 1, v));
  const cOf = (x, y) => [Math.floor((x - ox) / cell), Math.floor((y - oy) / cell)];
  const ec = cOf(eye[0], eye[1]), tc = cOf(target[0], target[1]);
  const ex = cell * ec[0] + ox, ey = cell * ec[1] + oy, tx = cell * tc[0] + ox, ty = cell * tc[1] + oy;
  const tg = E.latticeH(hg, clampI(tc[0]), clampJ(tc[1]));
  if (tg === null) return 0;
  const distance = Math.hypot(ey - ty, ex - tx);
  let highest = tg;
  const line = gridLine(tc, ec);
  for (let left = nCells - 1; left >= 0 && line.step(); --left) {
    const c = line.cell;
    const dx = cell * c[0] + ox - ex, dy = cell * c[1] + oy - ey;
    const between = Math.hypot(dx, dy);
    if (between > 1e-6) {
      const gr = E.latticeH(hg, clampI(c[0]), clampJ(c[1]));
      if (gr === null) continue;
      highest = Math.max(highest, (gr - eye[2]) * (distance / between) + eye[2]);
    }
  }
  return Math.max(0, Math.min(1, (highest - tg) / height));
}

// terrainShields(grids, pt, threat, o?): threat {x, y, z (world u; null = the ground there)}; eye = threat z + occlEyeM
// (1.35 m); shielded when TerrainOcclusion of occlCells (5) cells over occlRiseM (0.45 m) is above 0.
// o {profile | target}: the numbers are the same on all three games; the cell size comes from the grid.
function terrainShields(grids, pt, threat, o) {
  const hg = grids && grids.height;
  if (!hg || !pt || !threat) return false;
  const prof = (o && o.profile) || require('./index').profile((o && o.target) || 'mowas2');
  let z = Number.isFinite(threat.z) ? threat.z : E.groundAt(hg, threat.x, threat.y);
  if (z === null) return false;
  return occlusion(hg, [threat.x, threat.y, z + prof.occlEyeM * E.UPM], [pt.x, pt.y], prof.occlRiseM * E.UPM, prof.occlCells) > 0;
}

module.exports = { lip, terrainShields, occlusion, gridLine };

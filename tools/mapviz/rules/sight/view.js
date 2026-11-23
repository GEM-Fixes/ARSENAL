// sight view: the clicked spot's viewshed and fire field, the eye heights and P(seen) (rules.md 3.1-3.3, late R1, R2).
//   POSE                                     {stand, kneel, prone: {eyeM, topM}}
//   eyeZ(grids, x, y, who) -> z (u)          who = pose name, or {entry, part:'visor'|'turretTop'|'hullTop'|'gunBone'}
//   viewshed(sg, fg, a, o) -> {view, vis, fire, rings, eye}
//       a {x, y[, z]} world u (z absent: ground + the pose eye); o {pose, viewer (kind), vprof, exactM (60), target
//       ('inf'), placed (placeSolids rows, for the 'seen' items), mode}
//   pSeen(sg, a, solids, o?) -> 0..1         o {game, uncoverU, rangeU, vFovDeg}
//   seenItems(sg, a, placed, o) -> [{kind:'seen', uid, def, x, y, p}]
// view (sight frame): 0 out of range, 1 seen at the pose top, 2 hidden, 3 seen only between the top and 1 m over it.
// vis (sight frame, u16 cm): the lowest visible height over the ground at the cell's corner, 65535 out of range or
// nothing up to hMax. fire (map.net frame): 0 out of aim range, 1 clear to the pose top, 2 terrain, 3 object, 4 water.
// Within exactM every cell runs its own engine line (canSee, hiddenValue of ray.js). Past exactM a sweep: one Bresenham
// line from the eye to each cell of the range square's rim, carrying the running horizon (the same test as the engine
// line, exact for the cells on that line; a cell takes the first line that reaches it) [I]; a cell no rim line reaches
// (the diagonals: cell line lags one cell on them) runs its own exact line; meta.approx true. Off-ground cells (README
// R24): view 0, vis 65535, meta.offGround = their count. P(seen) suspends the target's own cells (suspend). Fire past
// exactM samples every map.net cell instead of every 2.5 u (meta.approx).
// Ranges: sight = rangeM(vprof, viewer, target, {pose}); aim = the sight range [I];
// uncover = the viewer's uncoverM.
// Author: Imperator_Aug (ARSENAL, ia-9f512e86)
'use strict';

const UPM = 20;
const POSE = Object.freeze({ stand: Object.freeze({ eyeM: 1.6, topM: 1.75 }), kneel: Object.freeze({ eyeM: 1.16, topM: 1.2 }), prone: Object.freeze({ eyeM: 0.54, topM: 0.4 }) });
const VEHICLE_M = Object.freeze({ hullTop: 2.0, turretTop: 2.6, visor: 2.6, gunBone: 2.2 });   // section 9.4 fallback [I]

function groundOf(grids, x, y) {
  const H = grids && grids.height ? grids.height : grids;
  return require('./grid').groundAt(H, x, y);
}

function eyeZ(grids, x, y, who) {
  const g = groundOf(grids, x, y);
  const base = g === null || !Number.isFinite(g) ? 0 : g;
  if (typeof who === 'string' || who === undefined || who === null) {
    const p = POSE[who || 'stand'];
    if (!p) throw Object.assign(new Error('no pose ' + who), { code: 'SIGHT_POSE' });
    return base + p.eyeM * UPM;
  }
  const part = who.part || 'visor';
  const hs = who.entry && who.entry.heights;
  const v = hs && typeof hs[part] === 'number' && Number.isFinite(hs[part]) ? hs[part] : null;
  if (v !== null) return base + v;
  if (VEHICLE_M[part] === undefined) throw Object.assign(new Error('no vehicle part ' + part), { code: 'SIGHT_POSE' });
  return base + VEHICLE_M[part] * UPM;
}

// ---------------------------------------------------------------- P(seen)
const isSightVol = s => s && s.able && !s.able.nolook && (s.able.visible || s.able.contact || s.able.contact_ground);   // IsSightVolume [V]
function centroid(h) { let x = 0, y = 0; for (const p of h) { x += p[0]; y += p[1]; } return [x / h.length, y / h.length]; }

// Suspend: the target's own tracker entries leave the grid while its points are tested, and come back after
// [V IsVisible: tracker->Suspend ... Resume; Suspend = Unregister;
//  restores the saved cells and raises the other trackers again]. So each own cell goes back
// max(sight.ground, the other rows' entries on it), and its field to the other rows' bits (1 when any is 1, else 2
// when any, else 0: Register keeps 1). goh keeps the same IsVisible flow [I GHVIS-121].
// tracker(sg, placed, game) -> ctx; suspend(sg, ctx, row) -> restore()   (sg is changed in place until restore runs)
const BUCKET = 32;
function tracker(sg, placed, game) {
  const G = require('./grid');
  const g = sg.grid, m = g.meta || {};
  const F = { C: m.cellU || g.cell, ox: g.ox, oy: g.oy, w: g.w, h: g.h };
  const L = { hMin: m.hMinU !== undefined ? m.hMinU : g.offset, step: m.stepU !== undefined ? m.stepU : g.scale };
  const bw = Math.ceil(F.w / BUCKET), bh = Math.ceil(F.h / BUCKET);
  const buckets = new Map();
  const rows = Array.isArray(placed) ? placed : [];
  for (let k = 0; k < rows.length; k++) {
    const vols = ((rows[k] && rows[k].solids) || []).filter(s => G.isSight(s) && Array.isArray(s.hull) && s.hull.length && Number.isFinite(s.zMax));
    if (!vols.length) continue;
    const B = G.bbox(vols);   // entries lie within one cell of the box (nearest corners, the goh disc)
    const i0 = Math.max(0, Math.floor((B.x0 - F.ox) / F.C) - 1), i1 = Math.min(F.w - 1, Math.ceil((B.x1 - F.ox) / F.C) + 1);
    const j0 = Math.max(0, Math.floor((B.y0 - F.oy) / F.C) - 1), j1 = Math.min(F.h - 1, Math.ceil((B.y1 - F.oy) / F.C) + 1);
    if (i0 > i1 || j0 > j1) continue;
    for (let bj = Math.floor(j0 / BUCKET); bj <= Math.floor(j1 / BUCKET); bj++) {
      for (let bi = Math.floor(i0 / BUCKET); bi <= Math.floor(i1 / BUCKET); bi++) {
        const key = bj * bw + bi;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(k);
      }
    }
  }
  const cache = new Map();
  const cellsOf = k => {
    if (!cache.has(k)) {
      const t = G.trackObject(rows[k], F, game);
      const by = new Map();
      for (const e of t.entries) {
        const c = e.j * F.w + e.i, lv = G.levelOf(e.z, L), was = by.get(c);
        if (!was) by.set(c, { lv, hard: e.bits === 1, soft: e.bits === 2 });
        else { was.lv = Math.max(was.lv, lv); was.hard = was.hard || e.bits === 1; was.soft = was.soft || e.bits === 2; }
      }
      cache.set(k, by);
    }
    return cache.get(k);
  };
  return { F, L, rows, buckets, bw, bh, cellsOf, index: new Map(rows.map((r, k) => [r, k])) };
}
function suspend(sg, ctx, row) {
  const k = ctx.index.get(row);
  if (k === undefined) return () => {};
  const own = ctx.cellsOf(k);
  if (!own.size) return () => {};
  const g = sg.grid.data, gr = (sg.ground || sg.grid).data, fd = sg.field ? sg.field.data : null;
  const saved = [];
  for (const c of own.keys()) {
    const i = c % ctx.F.w, j = (c - i) / ctx.F.w;
    let lv = gr[c], hard = false, soft = false;
    for (const q of ctx.buckets.get(Math.floor(j / BUCKET) * ctx.bw + Math.floor(i / BUCKET)) || []) {
      if (q === k) continue;
      const e = ctx.cellsOf(q).get(c);
      if (!e) continue;
      if (e.lv > lv) lv = e.lv;
      hard = hard || e.hard; soft = soft || e.soft;
    }
    saved.push([c, g[c], fd ? fd[c] : 0]);
    g[c] = lv;
    if (fd) fd[c] = hard ? 1 : soft ? 2 : 0;
  }
  return () => { for (const [c, v, f] of saved) { g[c] = v; if (fd) fd[c] = f; } };
}

// o.row + o.placed (+ o.ctx): the row's own cells are suspended for the test (above)
function pSeen(sg, a, solids, o) {
  o = o || {};
  if (o.row && Array.isArray(o.placed)) {
    const ctx = o.ctx || tracker(sg, o.placed, o.game === 'goh' ? 'goh' : 'as2');
    const back = suspend(sg, ctx, o.row);
    try { return pSeen(sg, a, solids, Object.assign({}, o, { row: null, placed: null, ctx: null })); } finally { back(); }
  }
  const ray = require('./ray');
  const list = (Array.isArray(solids) ? solids : (solids && solids.solids) || []).filter(s => isSightVol(s) && Array.isArray(s.hull) && s.hull.length);
  if (!list.length) return 0;
  const goh = o.game === 'goh';
  let miss = 1;
  for (const s of list) {
    let share;
    if (goh) {
      const c = centroid(s.hull);
      share = ray.canSee(sg, a, { x: c[0], y: c[1], z: (s.zMin + s.zMax) / 2 }, o) ? 1 : 0;
    } else {
      let n = 0, k = 0;
      for (const p of s.hull) for (const z of [s.zMin, s.zMax]) { n++; if (ray.canSee(sg, a, { x: p[0], y: p[1], z }, o)) k++; }
      share = n ? k / n : 0;
    }
    miss *= 1 - share;
  }
  return Math.round((1 - miss) * 1000) / 1000;
}
function seenItems(sg, a, placed, o) {
  const out = [];
  for (const row of placed || []) {
    const vols = (row.solids || []).filter(s => isSightVol(s) && Array.isArray(s.hull) && s.hull.length);
    if (!vols.length) continue;
    const B = require('./grid').bbox(vols), c = [(B.x0 + B.x1) / 2, (B.y0 + B.y1) / 2];
    const d = Math.hypot(c[0] - a.x, c[1] - a.y);
    if (typeof o.rangeU === 'number' && d > o.rangeU) continue;
    out.push({ d, row, c });
  }
  out.sort((p, q) => p.d - q.d || p.row.uid - q.row.uid);
  const ctx = out.length ? tracker(sg, placed, o.game === 'goh' ? 'goh' : 'as2') : null;
  const keep = out.slice(0, 500).map(e => ({ kind: 'seen', uid: e.row.uid, def: e.row.def, x: r2(e.c[0]), y: r2(e.c[1]),
    p: pSeen(sg, a, e.row.solids, Object.assign({}, o, { row: e.row, placed, ctx })) }));
  keep.sort((p, q) => p.uid - q.uid || p.x - q.x || p.y - q.y);
  return keep;
}
const r2 = v => Math.round(v * 100) / 100;

// ---------------------------------------------------------------- viewshed
function viewshed(sg, fg, a, o) {
  o = o || {};
  const ray = require('./ray'), F = require('./fire'), V = require('./vision');
  const pose = o.pose || 'stand';
  if (!POSE[pose]) throw Object.assign(new Error('no pose ' + pose), { code: 'SIGHT_POSE' });
  const viewer = o.viewer || 'inf';
  const vprof = o.vprof;
  if (!vprof || !vprof.viewers || !vprof.viewers[viewer]) throw Object.assign(new Error('no viewer ' + viewer + ' in the vision profile'), { code: 'SIGHT_VIEWER' });
  const vw = vprof.viewers[viewer];
  const exactM = typeof o.exactM === 'number' ? o.exactM : 60;
  const S = ray.meta(sg);
  const H = fg && fg.height ? fg.height : null;
  const gAt = (x, y) => { const z = H ? require('./grid').groundAt(H, x, y) : null; return z === null || !Number.isFinite(z) ? null : z; };
  const g0 = gAt(a.x, a.y);
  const eye = { x: a.x, y: a.y, z: typeof a.z === 'number' ? a.z : (g0 === null ? 0 : g0) + POSE[pose].eyeM * UPM };
  const rangeMv = V.rangeM(vprof, viewer, o.target || 'inf', { pose });
  const rangeU = rangeMv * UPM, uncoverU = (vw.uncoverM || 0) * UPM, exactU = exactM * UPM;
  const ro = { rangeU, uncoverU, vFovDeg: vw.vFovDeg };
  const topU = POSE[pose].topM * UPM;
  const n = S.w * S.h;
  const view = new Uint8Array(n), vis = new Uint16Array(n).fill(65535);
  const done = new Uint8Array(n);
  const ec = ray.cellOf(S, eye.x, eye.y);
  let approx = false;
  const C2 = S.C * S.C;
  const toCm = (vz, gz) => { const cm = Math.round((vz - gz) * 5); return Math.max(0, Math.min(65534, cm)); };
  // off ground (README R24): no height lattice point under the sight corner. With the height grid at hand that is
  // groundAt null; without it, a sight.ground level 0 when the grid counted off-ground cells (real ground sits 60 u
  // over hMin, so never at level 0). Such cells keep view 0 and vis 65535 and are counted in meta.offGround.
  const offN = (S.g.meta && S.g.meta.offGround) || 0;
  let offGround = 0;
  const offAt = (c, x, y) => (H ? gAt(x, y) === null : offN > 0 && S.ground.data[c] === 0);
  const exactCell = (i, j) => {
    const x = S.ox + i * S.C, y = S.oy + j * S.C, c = j * S.w + i;
    done[c] = 1;
    if (offAt(c, x, y)) { offGround++; return; }
    const g0c = gAt(x, y);
    const gz = g0c === null ? S.ground.data[c] * S.step + S.hMin : g0c;
    const t = { x, y, z: gz + topU };
    if (ray.canSee(sg, eye, t, ro)) view[c] = 1;
    else if (ray.canSee(sg, eye, { x, y, z: t.z + UPM }, ro)) view[c] = 3;
    else view[c] = 2;
    const hv = ray.hiddenValue(sg, eye, t, ro);
    if (hv !== null && hv < 256) vis[c] = toCm(hv * S.step + S.hMin, gz);
  };
  if (ec) {
    const R = Math.ceil(rangeU / S.C);
    const vEye = ray.toValue(S, eye.z);
    const I0 = Math.max(0, ec.i - R), I1 = Math.min(S.w - 1, ec.i + R), J0 = Math.max(0, ec.j - R), J1 = Math.min(S.h - 1, ec.j + R);
    // exact zone
    for (let j = J0; j <= J1; j++) {
      for (let i = I0; i <= I1; i++) {
        const d2 = ((i - ec.i) * (i - ec.i) + (j - ec.j) * (j - ec.j)) * C2;
        if (!(rangeU * rangeU > d2)) continue;
        if (d2 > exactU * exactU) continue;
        exactCell(i, j);
      }
    }
    // sweep past exactM
    if (rangeU > exactU) {
      approx = true;
      const rim = [];
      for (let k = -R; k <= R; k++) { rim.push([ec.i + k, ec.j - R], [ec.i + k, ec.j + R]); if (k > -R && k < R) rim.push([ec.i - R, ec.j + k], [ec.i + R, ec.j + k]); }
      const unc = uncoverU / S.C;
      for (const [ti, tj] of rim) {
        const line = new ray.Line(ec.i, ec.j, ti, tj, vEye);
        let maxSlope = -Infinity;
        let first = true;
        while (line.next()) {
          const i = line.pos[0], j = line.pos[1];
          if (i < 0 || j < 0 || i >= S.w || j >= S.h) break;
          const s = line.step;
          if (first) {
            first = false;
            const lb = ray.lowBound(S, eye, i, j, vw.vFovDeg);
            if (lb !== -Infinity) maxSlope = lb - vEye;
          }
          const c = j * S.w + i;
          const own = unc > s * line.stepLength && S.field && S.field.data[c] === 2 ? S.ground.data[c] : S.g.data[c];
          const d2 = ((i - ec.i) * (i - ec.i) + (j - ec.j) * (j - ec.j)) * C2;
          if (!done[c] && rangeU * rangeU > d2 && offAt(c, S.ox + i * S.C, S.oy + j * S.C)) { done[c] = 1; offGround++; }
          if (!done[c] && rangeU * rangeU > d2) {
            done[c] = 1;
            const x = S.ox + i * S.C, y = S.oy + j * S.C;
            const gz0 = gAt(x, y);
            const gz = gz0 === null ? S.ground.data[c] * S.step + S.hMin : gz0;
            const shadow = vEye + maxSlope * s;
            const tv = ray.toValue(S, gz + topU) + 1, tv2 = ray.toValue(S, gz + topU + UPM) + 1;
            const seenAt = q => own < q && (q - vEye) / s > maxSlope;
            view[c] = seenAt(tv) ? 1 : seenAt(tv2) ? 3 : 2;
            const low = Math.max(own, shadow);
            if (low < 256) vis[c] = toCm(low * S.step + S.hMin, gz);
          }
          const sl = (own - vEye) / s;
          if (sl > maxSlope) maxSlope = sl;
        }
      }
      // cells no rim line reached: cell line steps the minor axis only when error > length, so a line to a rim
      // corner lags one cell and the diagonals past exactM are never visited. Each gets its own exact line.
      for (let j = J0; j <= J1; j++) {
        for (let i = I0; i <= I1; i++) {
          const c = j * S.w + i;
          if (done[c]) continue;
          const d2 = ((i - ec.i) * (i - ec.i) + (j - ec.j) * (j - ec.j)) * C2;
          if (rangeU * rangeU > d2) exactCell(i, j);
        }
      }
    }
  }
  const metaOf = extra => Object.assign({ at: [a.x, a.y], z: r2(eye.z), pose, viewer, rangeM: rangeMv, uncoverM: vw.uncoverM || 0, exactM }, extra || {});
  const sf = (name, etype, data, extra) => ({ name, w: S.w, h: S.h, cell: S.C, ox: S.ox, oy: S.oy, etype, sample: 'cell', scale: 1, offset: 0,
    nodata: null, meta: metaOf(extra), data });
  // fire on the map.net frame
  let fire = null;
  if (fg && fg.top) {
    const T = fg.top, fdat = new Uint8Array(T.w * T.h);
    let fApprox = false;
    const R = Math.ceil(rangeU / T.cell) + 1;
    const ci = Math.floor((eye.x - T.ox) / T.cell), cj = Math.floor((eye.y - T.oy) / T.cell);
    for (let j = Math.max(0, cj - R); j <= Math.min(T.h - 1, cj + R); j++) {
      for (let i = Math.max(0, ci - R); i <= Math.min(T.w - 1, ci + R); i++) {
        const x = T.ox + (i + 0.5) * T.cell, y = T.oy + (j + 0.5) * T.cell;
        const d = Math.hypot(x - eye.x, y - eye.y);
        if (d > rangeU) continue;
        const gz = gAt(x, y);
        if (gz === null) continue;
        const far = d > exactU;
        if (far) fApprox = true;
        const r = F.fireLine(fg, eye, { x, y, z: gz + topU }, { stepU: far ? T.cell : F.STEP });
        fdat[j * T.w + i] = r.clear ? 1 : r.block === 'terrain' ? 2 : r.block === 'object' ? 3 : r.block === 'water' ? 4 : 0;
      }
    }
    fire = { name: 'sight.fire', w: T.w, h: T.h, cell: T.cell, ox: T.ox, oy: T.oy, etype: 'u8', sample: 'cell', scale: 1, offset: 0, nodata: null,
      meta: metaOf({ approx: fApprox }), data: fdat };
  }
  const rings = [
    { kind: 'eye', x: a.x, y: a.y, z: r2(eye.z), pose, viewer },
    { kind: 'sightRing', x: a.x, y: a.y, r: r2(rangeU), what: 'sight' },
    { kind: 'sightRing', x: a.x, y: a.y, r: r2(rangeU), what: 'aim' },
  ];
  if (vprof.viewers.binocular && typeof vprof.viewers.binocular.reachM === 'number') rings.push({ kind: 'sightRing', x: a.x, y: a.y, r: r2(vprof.viewers.binocular.reachM * UPM), what: 'binocular' });
  rings.push({ kind: 'sightRing', x: a.x, y: a.y, r: r2(uncoverU), what: 'uncover' });
  rings.push({ kind: 'sightRing', x: a.x, y: a.y, r: r2(exactU), what: 'exact' });
  if (Array.isArray(o.placed)) for (const it of seenItems(sg, eye, o.placed, Object.assign({}, ro, { game: vprof.game }))) rings.push(it);
  return { view: sf('sight.view', 'u8', view, { approx, offGround }), vis: sf('sight.vis', 'u16', vis, { approx, offGround }), fire, rings, eye };
}

module.exports = { POSE, UPM, VEHICLE_M, eyeZ, pSeen, seenItems, viewshed, isSightVol, tracker, suspend };

// cover probe (MV-COV): stage B of design 5.4, the engine port of the wall cover scan (rules.md 4.2, 4.3 of waves C and D).
//   points(doc, grids, catalog, objects, placed, o?) -> coverPoint items of every obstacle zone (edges and circles)
//   solidsOf(doc, grids, catalog, objects, placed) -> {solids, notes}   the probe geometry (shared with conceal.js)
//   placeCheck(ctx) -> {free(pt, pose, own), blocked(p0, p1, own), nearStationary(pt, r)}   footprint and ground tests
// Port , / AddCircle / TryAddCover /
// ClassifyAt / RefineRun* and / Classify / IsClear [V].
// The detector's ray mask is 0x186012: bullet volumes stop a probe, windows are skipped, holes
// cut gaps, an entity with tag nocover is ignored [V survey cover.md 1a]. A probe ray is a horizontal segment at a height
// over the ground at its start; it hits a solid when the height is inside the solid's z span and the segment crosses the
// solid's hull with some length left after the hole solids of the same object are cut out [I: hulls stand in for meshes].
// Ground under a probe: bilinear height (mapkit heightAt). IsPlaceFree without an actor:
// not inside another object's footprint ( [I]: footprints stand in for the pather), not on ground type
// 4 or 5, not on type 3 for pose 1; water.band 2 refuses all, band 1 pose 1 (rules.md 4.3). of the
// look test = the segment touches another object's footprint [I]. No dedupe of wall points (skipDuplicates false
// ) [I for the scene request].
// Games (profile): as2 detector box from the ground at the zone's middle to + 1.64 m; goh
// -1000..+1000 (GHAI-31); goh circle covers start half a place in and are spaced by the place radius (GHAI-30) [V gohweb,
// I the exact start]. Everything else is the same on as64, mowas2 and goh.
// Author: Imperator_Aug (ARSENAL, ia-92280431)
'use strict';
const E = require('./edges');
const U = E.U;

// ---------------------------------------------------------------- spatial buckets
function buckets(size) {
  const m = new Map();
  let stamp = 0;
  const key = (i, j) => i * 1048576 + j;
  return {
    add(item, b) {
      for (let i = Math.floor(b[0] / size); i <= Math.floor(b[2] / size); i++) {
        for (let j = Math.floor(b[1] / size); j <= Math.floor(b[3] / size); j++) {
          const k = key(i, j);
          let l = m.get(k);
          if (!l) { l = []; m.set(k, l); }
          l.push(item);
        }
      }
    },
    query(b) {
      stamp++;
      const out = [];
      for (let i = Math.floor(b[0] / size); i <= Math.floor(b[2] / size); i++) {
        for (let j = Math.floor(b[1] / size); j <= Math.floor(b[3] / size); j++) {
          const l = m.get(key(i, j));
          if (!l) continue;
          for (const it of l) if (it._q !== stamp) { it._q = stamp; out.push(it); }
        }
      }
      return out;
    },
  };
}

// ---------------------------------------------------------------- solids
function hullOf(pts) {
  const h = E.ccw(pts);
  return { hull: h, flat: h.length < 3 || Math.abs(E.area2(h)) < 1e-9 };
}
// placed = entcat placeSolids rows (rules.md 2.0), matched to objects by (uid, def) in walk order; null = the fallback:
// one solid per catalog volume over the object's footprint (note COVER_NO_SOLIDS)
function solidsOf(doc, grids, catalog, objects, placed) {
  const entries = (catalog && catalog.entries) || {};
  const notes = [];
  const solids = [];
  const objs = objects || [];
  const nocov = objs.map(ob => E.nocover(entries[E.lc(ob.def)]));
  const push = (obj, uid, s) => {
    if (!s || !Array.isArray(s.hull) || !Number.isFinite(s.zMin) || !Number.isFinite(s.zMax)) return;
    const h = hullOf(s.hull);
    if (!h.hull.length) return;
    solids.push({ obj, uid, name: s.name, able: s.able || {}, zMin: s.zMin, zMax: s.zMax, hull: h.hull, flat: h.flat, box: E.aabb(h.hull),
      nocover: obj >= 0 ? nocov[obj] : false });
  };
  if (Array.isArray(placed)) {
    const q = new Map();
    objs.forEach((ob, i) => { const k = ob.uid + '|' + E.lc(ob.def); if (!q.has(k)) q.set(k, []); q.get(k).push(i); });
    for (const r of placed) {
      const k = r.uid + '|' + E.lc(r.def);
      const l = q.get(k);
      const obj = l && l.length ? l.shift() : -1;
      for (const s of r.solids || []) push(obj, r.uid, s);
    }
    return { solids, notes, source: 'solids' };
  }
  notes.push({ code: 'COVER_NO_SOLIDS', msg: 'no entcat solids given: probes use each volume of the def over the object footprint [I]' });
  const zOf = new Map();
  for (const e of (doc && doc.entities) || []) if (e && Number.isFinite(e.z) && !zOf.has(e.uid)) zOf.set(e.uid, e.z);
  objs.forEach((ob, i) => {
    const en = entries[E.lc(ob.def)];
    const fp = ob.fp;
    if (!en || !fp || fp.kind === 'none' || fp.kind === 'decal' || !Array.isArray(fp.pts) || fp.pts.length < 3) return;
    let cx = 0, cy = 0;
    for (const p of fp.pts) { cx += p[0]; cy += p[1]; }
    cx /= fp.pts.length; cy /= fp.pts.length;
    const base = zOf.has(ob.uid) ? zOf.get(ob.uid) : E.groundAt(grids && grids.height, cx, cy);
    if (base === null) return;
    const s = E.scaleOf(ob, en);
    const dz = en.box && Number.isFinite(ob.zMin) ? ob.zMin - en.box.min[2] * s : 0;
    for (const v of en.volumes || []) {
      if (!Number.isFinite(v.zMin) || !Number.isFinite(v.zMax)) continue;
      push(i, ob.uid, { name: v.name, able: v.able, zMin: base + dz + v.zMin * s, zMax: base + dz + v.zMax * s, hull: fp.pts });
    }
  });
  return { solids, notes, source: 'fallback' };
}

// ---------------------------------------------------------------- footprints and the ground
function placeCheck(grids, objects) {
  const shapes = (objects || []).map(E.fpShape);
  const idx = buckets(64);
  shapes.forEach((s, i) => { if (s) { s.i = i; idx.add(s, s.box); } });
  return {
    shapes,
    // IsPlaceFree without an actor: ground type and water band, then the footprints but the own one
    free(pt, pose, own) {
      if (E.groundAt(grids.height, pt[0], pt[1]) === null) return false;
      const t = E.typeAt(grids, pt[0], pt[1]);
      if (t === 4 || t === 5) return false;
      if (t === 3 && pose === 1) return false;
      const b = E.bandAt(grids, pt[0], pt[1]);
      if (b === 2) return false;
      if (b === 1 && pose === 1) return false;
      for (const s of idx.query([pt[0], pt[1], pt[0], pt[1]])) if (s.i !== own && E.inPoly(s.pts, pt[0], pt[1])) return false;
      return true;
    },
    blocked(p0, p1, own) {
      const b = [Math.min(p0[0], p1[0]), Math.min(p0[1], p1[1]), Math.max(p0[0], p1[0]), Math.max(p0[1], p1[1])];
      for (const s of idx.query(b)) if (s.i !== own && E.segHitsPoly(s.pts, p0, p1)) return true;
      return false;
    },
    // IsClearOfStationary: an obstacle zone within r of the point
    nearStationary(pt, r) {
      for (const s of idx.query([pt[0] - r, pt[1] - r, pt[0] + r, pt[1] + r])) if (E.distToPoly(s.pts, pt[0], pt[1]) <= r) return true;
      return false;
    },
  };
}

// ---------------------------------------------------------------- the detector of one zone
function detector(grids, det, holes) {
  function hits(p0, p1, z) {
    for (const s of det) {
      if (z < s.zMin || z > s.zMax) continue;
      if (s.flat) { if (E.segHitsPoly(s.hull, p0, p1)) return true; continue; }
      const c = E.clipConvex(s.hull, p0, p1);
      if (!c) continue;
      const hs = holes.get(s.obj);
      if (!hs) return true;
      const cut = [];
      for (const h of hs) {
        if (z < h.zMin || z > h.zMax || h.flat) continue;
        const k = E.clipConvex(h.hull, p0, p1);
        if (k) cut.push([Math.max(k[0], c[0]), Math.min(k[1], c[1])]);
      }
      if (!cut.length) return true;
      cut.sort((a, b) => a[0] - b[0]);
      let left = c[1] - c[0], at = c[0];
      for (const [a, b] of cut) { if (b <= at) continue; const a2 = Math.max(a, at); if (b > a2) { left -= b - a2; at = b; } }
      if (left > 1e-9) return true;
    }
    return false;
  }
  function measure(pos, beside) {
    const g = E.groundAt(grids.height, pos[0], pos[1]);
    if (g === null) return 0;
    const seen = [false, false];
    const L = U.levels;
    for (let i = 0; i < L.length; i++) {
      if (hits(pos, beside, g + L[i])) continue;
      if (i < 2) { seen[i] = true; continue; }
      if (i > 2) return L[i - 1];
      if (seen[0]) { if (seen[1]) return 0; } else if (seen[1]) return L[0];
    }
    return L[L.length - 1];
  }
  function isClear(from, to, height) {
    const g = E.groundAt(grids.height, from[0], from[1]);
    if (g === null) return false;
    return !hits(from, to, g + height);
  }
  return { hits, measure, isClear };
}

// ClassifyCoverHeight, ClassifyCoverReach
function heightClass(h) { return h >= U.high ? 3 : h >= U.kneel ? 2 : h >= U.low ? 1 : 0; }
function reachClass(r) { return U.probeRadius > r ? 1 : U.wallReach > r ? 2 : U.threatFar > r ? 3 : 0; }
function classify(d) {
  switch (reachClass(d)) { case 1: return 8; case 2: return 5; case 3: return 4; default: }
  switch (heightClass(d)) { case 2: return 7; case 3: return 6; default: }
  return 0;
}

// ---------------------------------------------------------------- the shape scan of one zone
function scanner(ctx, own, uid, dt) {
  let dir = [1, 0], ends = [[0, 0], [0, 0]];
  const out = ctx.out;
  const P = ctx.place;
  function tryAdd(pt, row) {
    const beside = [pt[0] - dir[1] * U.wallMargin, pt[1] + dir[0] * U.wallMargin];
    const reading = dt.measure(pt, beside);
    if (!(reading >= U.lying)) return false;
    const hc = heightClass(reading), rc = reachClass(reading);
    if (!P.free(pt, rc, own)) return false;
    let type;
    if (hc === 3) {
      const step = [dir[0] * U.climb, dir[1] * U.climb];
      const outv = [-dir[1] * U.wallMargin, dir[0] * U.wallMargin];
      const left = [pt[0] - step[0], pt[1] - step[1]], right = [pt[0] + step[0], pt[1] + step[1]];
      let lo = !P.blocked(pt, left, own);
      if (lo) lo = dt.isClear(left, [left[0] + outv[0], left[1] + outv[1]], U.wallReach);
      let ro = !P.blocked(pt, right, own);
      if (ro) ro = dt.isClear(right, [right[0] + outv[0], right[1] + outv[1]], U.wallReach);
      type = lo ? (ro ? 3 : 1) : (ro ? 2 : 6);
    } else {
      type = classify(reading);
      if (type === 0) return false;
    }
    out.push({ x: pt[0], y: pt[1], type, uid, row, wall: null, reading });
    return true;
  }
  const probeAt = (along, reach) => [ends[0][0] + dir[0] * along + dir[1] * reach, ends[0][1] + dir[1] * along - dir[0] * reach];
  function classifyAt(along) {
    const p = probeAt(along, U.shortReach);
    const beyond = [p[0] - dir[1] * U.wallMargin, p[1] + dir[0] * U.wallMargin];
    ctx.probes++;
    return classify(dt.measure(p, beyond));
  }
  function refineStart(run, lower) {
    while (run.from - lower > U.gapTol) { const m = (run.from + lower) * 0.5; if (classifyAt(m) === run.type) run.from = m; else lower = m; }
  }
  function refineEnd(run, upper) {
    while (upper - run.to > U.gapTol) { const m = (upper + run.to) * 0.5; if (classifyAt(m) === run.type) run.to = m; else upper = m; }
  }
  function addEdge(s, e) {
    ends = [s, e];
    const len = Math.hypot(e[0] - s[0], e[1] - s[1]);
    if (U.minWall > len) return;
    dir = [(e[0] - s[0]) / len, (e[1] - s[1]) / len];
    const before = out.length;
    const usable = len - U.probeStep * 2;
    let steps = Math.floor(usable / U.probeReach);
    if (steps <= 1) steps = 1;
    const stepGap = steps >= 2 ? (usable - steps * U.probeReach) / (steps - 1) : 0;
    let along = U.probeStep;
    const runs = [{ from: along, to: along, type: classifyAt(along) }];
    for (let k = steps; k > 0; k--) {
      along += U.probeReach * 0.5;
      const t = classifyAt(along);
      const last = runs[runs.length - 1];
      if (t !== last.type) {
        const nx = { from: along, to: along, type: t };
        runs.push(nx);
        refineEnd(last, nx.from);
        refineStart(nx, last.to);
      } else last.to = along;
      along += U.probeReach * 0.5 + stepGap;
    }
    refineEnd(runs[runs.length - 1], len - U.probeStep);
    for (const r of runs) {
      const width = r.to - r.from;
      if (width > U.placeRadius * 3 + U.gap) {
        let count = Math.floor((U.gap + width) / (U.gap * 0.5 + U.placeRadius));
        if (!(count & 1)) count--;
        const gap = (width - count * U.placeRadius) / (count - 1);
        let place = U.placeRadius * 0.5 + r.from;
        for (let i = 0; i < count; i++) {
          tryAdd(probeAt(place, (i & 1) * U.rowStep + U.shortReach), i & 1);
          place += U.placeRadius * 0.5 + gap + U.placeRadius * 0.5;
        }
      } else if (width > U.minWall) tryAdd(probeAt(width * 0.5 + r.from, U.shortReach), 0);
    }
    for (let i = before; i < out.length; i++) out[i].wall = [s.slice(), e.slice()];
  }
  function addCircle(c, radius) {
    const C = radius * 2 * Math.PI;
    let steps = Math.floor(C / U.placeStep);
    if (steps <= 2) return;
    if (steps < 4) steps = 4;
    const slack = (C - steps * U.near) / steps;
    // as2: start one gap, a cover every 2 gaps + slack; goh: half a place, spaced
    // by the place radius (GHAI-30) [I]
    // the start and the gap term = profile circleGapM (0.1 m = U.gap; goh 0.3 m = U.placeRadius when circleStartHalf)
    const first = Number.isFinite(ctx.prof.circleGapM) ? ctx.prof.circleGapM * E.UPM : (ctx.prof.circleStartHalf ? U.placeRadius : U.gap);
    let offset = 0;
    for (; steps > 0; steps--) {
      const start = first + offset;
      const a = start / C * 2 * Math.PI, sn = Math.sin(a), cs = Math.cos(a);
      const reach = U.shortReach + radius;
      const pt = [c[0] + cs * reach, c[1] + sn * reach];
      dir = [-sn, cs];
      const w0 = [dir[0] * -U.gap + pt[0] + cs * -U.shortReach, dir[1] * -U.gap + pt[1] + sn * -U.shortReach];
      const w1 = [dir[0] * U.gap + pt[0] - U.shortReach * cs, dir[1] * U.gap + pt[1] - U.shortReach * sn];
      ctx.probes++;
      if (tryAdd(pt, 0)) out[out.length - 1].wall = [w0, w1];
      offset = first + slack + start;
    }
  }
  return { addEdge, addCircle };
}

// TYPES band and look of a point (index.js holds the table; repeated here to keep probe.js free of index.js)
const TYPE_BAND = [0, 5, 5, 5, 3, 2, 5, 4, 1, 0, 0, 0, 1];
const LOOK = { 1: 'left', 2: 'right', 3: 'two' };
function item(p) {
  return { kind: 'coverPoint', x: E.r2(p.x), y: E.r2(p.y), type: p.type, band: TYPE_BAND[p.type] || 0, uid: p.uid === undefined ? null : p.uid,
    wall: p.wall ? [[E.r2(p.wall[0][0]), E.r2(p.wall[0][1])], [E.r2(p.wall[1][0]), E.r2(p.wall[1][1])]] : null, row: p.row || 0, look: LOOK[p.type] || 'none' };
}

// points(doc, grids, catalog, objects, placed, o?): grids {height, gtype, band?: water.band}; placed = placeSolids rows or
// null; o {target, tick(done, total), profile}. Returns the coverPoint items sorted (uid, x, y), with non-enumerable
// `notes` [{code, msg}] and `counts` {zones, probes, points, byType, solids, source, gohSandbag}.
function points(doc, grids, catalog, objects, placed, o) {
  o = o || {};
  const prof = o.profile || require('./index').profile(o.target || (doc && doc.game) || 'mowas2');
  const entries = (catalog && catalog.entries) || {};
  const objs = objects || [];
  const so = solidsOf(doc, grids, catalog, objs, placed);
  const notes = so.notes.slice();
  const probeSolids = so.solids.filter(s => s.able.bullet && !s.able.window && !s.nocover);
  const holes = new Map();
  for (const s of so.solids) if (s.able.hole) { if (!holes.has(s.obj)) holes.set(s.obj, []); holes.get(s.obj).push(s); }
  const idx = buckets(64);
  for (const s of probeSolids) idx.add(s, s.box);
  const ctx = { prof, out: [], probes: 0, place: placeCheck(grids, objs) };
  const counts = { zones: 0, probes: 0, points: 0, byType: {}, solids: so.solids.length, source: so.source, gohSandbag: 0 };
  const total = objs.length || 1;
  const tick = typeof o.tick === 'function' ? o.tick : null;
  let lastT = Date.now();
  for (let i = 0; i < objs.length; i++) {
    if (tick && Date.now() - lastT >= 100) { lastT = Date.now(); tick(i, total); }
    const ob = objs[i];
    const en = entries[E.lc(ob.def)];
    if (en && en.category === 'placed_unit') continue;     // vehicles and guns are not stationary [I]
    const sh = ctx.place.shapes[i];
    if (!sh) continue;
    counts.zones++;
    // the detector box (AddZoneCovers): the zone's bounds + 1.5 m; z from the ground at the middle to + 1.64 m (as2),
    // -1000..+1000 u (goh)
    const b = [sh.box[0] - U.wallMargin, sh.box[1] - U.wallMargin, sh.box[2] + U.wallMargin, sh.box[3] + U.wallMargin];
    const g = E.groundAt(grids.height, (b[0] + b[2]) / 2, (b[1] + b[3]) / 2);
    const z0 = (g === null ? 0 : g) + prof.zoneBottomU, z1 = (g === null ? 0 : g) + prof.zoneTopU;
    const det = idx.query(b).filter(s => s.zMax >= z0 && s.zMin <= z1 && s.box[2] >= b[0] && s.box[0] <= b[2] && s.box[3] >= b[1] && s.box[1] <= b[3]);
    if (!det.length) continue;
    const before = ctx.out.length;
    const sc = scanner(ctx, i, ob.uid === undefined ? null : ob.uid, detector(grids, det, holes));
    if (sh.kind === 'circle') sc.addCircle(sh.c, sh.r);
    else for (let k = 0; k < sh.pts.length; k++) sc.addEdge(sh.pts[k], sh.pts[(k + 1) % sh.pts.length]);
    if (prof.game === 'goh' && en && en.obstacleId === 'nothing' && ctx.out.length > before) counts.gohSandbag++;
  }
  if (tick) tick(total, total);
  const items = E.sortItems(ctx.out.map(item));
  counts.probes = ctx.probes;
  counts.points = items.length;
  for (const p of items) counts.byType[p.type] = (counts.byType[p.type] || 0) + 1;
  if (counts.gohSandbag) notes.push({ code: 'COVER_GOH_SANDBAG', msg: counts.gohSandbag + ' objects with obstacleID nothing gave wall covers; whether the engine scans them is not settled [T]' });
  Object.defineProperty(items, 'notes', { value: notes, enumerable: false });
  Object.defineProperty(items, 'counts', { value: counts, enumerable: false });
  return items;
}

module.exports = { points, solidsOf, placeCheck, buckets, classify, heightClass, reachClass, TYPE_BAND, item };

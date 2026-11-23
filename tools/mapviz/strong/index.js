// strong (MV-STR): the strong point estimator and the map checks (design 6; rules.md 6). Same abilities on as64, mowas2
// and goh (owner rule 2026-11-14): code branches only on game = target === 'goh' ? 'goh' : 'as2', each with its tag.
//   VERSION, FACTORS, APPLIES, CLASSIFIERS, THREAT, SETUP_S, PRESETS
//   inputs(dirs, o)  o {target, map, mode, phase, kind, rules, srcFn | src}      -> I (inputs.js)
//   run(I, o)        o {kind, side 'a'|'b'|'both', seed, ensemble 8, tick, stage} -> {json, grids, checks}
//   score(f, weights, kind)                                                      -> 0..1 (G applied by the caller)
//   checks(I, o)     o {mode, phase, tick}                                         -> check items (checks.js)
// Ranges, heights and poses that no input gives are the fallback tables below [I]; rules.sight gives them when built:
// rangeM for sight ranges, the vision profile (vprof.viewers) for binocular reach, uncover and flag sight per game.
// Author: Imperator_Aug (ARSENAL, ia-9fdb835b)
'use strict';
const F = require('./frame');
const FX = require('./factors');
const TH = require('./threat');
const CA = require('./cand');
const CL = require('./classify');
const DG = require('./danger');
const FA = require('./fair');
const EN = require('./ensemble');
const IN = require('./inputs');

const VERSION = 1;
const KINDS = ['inf', 'mg', 'at', 'tank'];
const FACTORS = Object.freeze(['ow', 'kz', 'sp', 'df', 'cv', 'rt', 'fr', 'px', 'hu', 'amb', 'enf']);
const APPLIES = Object.freeze({
  inf: Object.freeze(['ow', 'kz', 'sp', 'df', 'cv', 'rt', 'fr', 'px']),
  mg: Object.freeze(['ow', 'kz', 'sp', 'df', 'cv', 'rt', 'fr', 'px', 'enf']),
  at: Object.freeze(['ow', 'kz', 'sp', 'df', 'rt', 'fr', 'px', 'amb']),
  tank: Object.freeze(['ow', 'kz', 'sp', 'df', 'rt', 'fr', 'px', 'hu']),
});
const CLASSIFIERS = Object.freeze(['reverse', 'dead', 'high', 'uncont', 'first', 'garrison', 'hull']);
const THREAT = Object.freeze({ inf: 'inf', mg: 'inf', at: 'tank', tank: 'tank' });
const SETUP_S = Object.freeze({ inf: 0, mg: 3, at: 10, tank: 0 });
const all1 = () => { const o = {}; for (const f of FACTORS) o[f] = 1; return o; };
const PRESETS = Object.freeze({
  balanced: Object.freeze(all1()),
  hold: Object.freeze({ ow: 2, kz: 2, sp: 1, df: 1.5, cv: 2, rt: 0.5, fr: 0.5, px: 1.5, hu: 1.5, amb: 2, enf: 2 }),
  attack: Object.freeze({ ow: 1, kz: 1, sp: 1.5, df: 1, cv: 1, rt: 2, fr: 2, px: 1.5, hu: 1, amb: 1, enf: 1 }),
});
// how true to the engine each factor is (rules.md 6.3 meta): meta.js, shared with the Map Viewer page
const { FACTOR_META } = require('./meta');

// fallback tables [I]
// AIM_M: the engagement range of each kind, an assumed planning number: no game file gives one range per unit kind (each
// weapon has its own {range}/aimRange), so it is not read from data [T: fix-later gui row "strong engagement ranges"]
const AIM_M = { inf: 60, mg: 80, at: 100, tank: 150 };
const POSE_OF = { inf: 'kneel', mg: 'prone', at: 'kneel', tank: 'vehicle' };
const POSE_M = { stand: { eyeM: 1.6, topM: 1.75 }, kneel: { eyeM: 1.16, topM: 1.2 }, prone: { eyeM: 0.54, topM: 0.4 } };
const TANK_M = { hullM: 2.0, turretM: 2.6, gunM: 2.2, visorM: 2.6, depressionDeg: -8, elevationDeg: 20 };
const AT_M = { gunM: 1.0, topM: 1.2, traverseDeg: 30 };
const UNCOVER_M = 7, BINOC_M = 175, FLAG_M = 20;
// fallback reaches (as2 numbers); the reaches used come from danger.weapons(I): stack files first, goh numbers on goh
const WEAPONS = { mortar: { name: 'mortar', reachM: DG.FALLBACK.mortar.as2 }, howitzer: { name: 'howitzer', reachM: DG.FALLBACK.howitzer.as2 } };
const FALLBACK_VIEW_M = { inf: 52.5, mg: 52.5, at: 52.5, tank: 50.6 }, FALLBACK_VEHICLE_M = 135;
const FLAT_M = 3;
const REFINE_MOVE = 20;          // candidates moved by the 1 m refine step [I: cost bound]

const score = (f, weights, kind) => FX.score(f, weights, kind, APPLIES);
const rd = (v, n) => { const p = Math.pow(10, n === undefined ? 3 : n); return Math.round(v * p) / p; };

// the kind's unit def (rules/pass KIND_UNITS) through entcat entry(): heights {hullTop, gunBone, turretTop, visor} (u,
// entity space), traverse, depression (rules.md 2.0 strong row). null when the def or the model is absent (the fixture)
function unitEntry(I, kind) {
  I.unitEntries = I.unitEntries || {};
  if (kind in I.unitEntries) return I.unitEntries[kind];
  let en = null;
  // mg is a prone soldier: heights() takes the pose, and no factor reads an mg traverse or depression, so its def is
  // not loaded [I]
  if (kind === 'tank' || kind === 'at') {
    try {
      const P = I.rules.pass, def = P && P.KIND_UNITS && P.KIND_UNITS[I.game === 'goh' ? 'goh' : 'as2'][kind];
      const src = I.src || (I.srcFn ? I.source('unit def') : null);
      if (def && src && src.has(def)) en = require('../entcat').entry(src, def);
    } catch (e) { en = null; }
  }
  I.unitEntries[kind] = en;
  return en;
}
// a unit height is taken when it lies between 0.5 m and 8 m (u); anything else is a model oddity and the fallback holds
const pos = v => (Number.isFinite(v) && v >= 0.5 * F.UPM && v <= 8 * F.UPM ? v : null);
function heights(kind, S, en) {
  const P = (S && S.POSE) || POSE_M;
  const pose = POSE_OF[kind];
  const h = en && en.heights || {}, dep = en && en.depression, tr = en && en.traverse;
  // limits are stored as read; which end is down is not traced in entcat: the lower end is the depression [I]
  const depOf = fb => { if (!dep) return fb; const lo = Math.min(dep.min, dep.max); return Number.isFinite(lo) && lo < 0 && lo > -45 ? lo : fb; };
  const elOf = fb => { if (!dep) return fb; const hi = Math.max(dep.min, dep.max); return Number.isFinite(hi) && hi > 0 && hi <= 90 ? hi : fb; };
  const trOf = fb => { if (!tr) return fb; if (tr.full) return 180; const half = Math.abs(tr.max - tr.min) / 2; return Number.isFinite(half) && half > 0 ? Math.min(180, half) : fb; };
  if (kind === 'tank') {
    const top = pos(h.turretTop) || pos(h.hullTop) || TANK_M.turretM * F.UPM;
    // the eye is the visor bone, raised to the hull top when the bone sits lower (a driver's visor) [I]
    const eye = pos(h.visor) ? Math.max(h.visor, pos(h.hullTop) || 0) : top;
    return { eyeU: eye, topU: top, hullU: pos(h.hullTop) || TANK_M.hullM * F.UPM, gunU: pos(h.gunBone) || TANK_M.gunM * F.UPM,
      depressionDeg: depOf(TANK_M.depressionDeg), elevationDeg: elOf(TANK_M.elevationDeg), traverseDeg: trOf(180), source: en ? 'def' : 'fallback' };
  }
  if (kind === 'at') {
    const gun = pos(h.gunBone) || AT_M.gunM * F.UPM;
    return { eyeU: gun, topU: Math.max(gun, AT_M.topM * F.UPM), hullU: gun, gunU: gun,
      depressionDeg: depOf(-10), elevationDeg: elOf(20), traverseDeg: trOf(AT_M.traverseDeg), source: en ? 'def' : 'fallback' };
  }
  const p = P[pose] || POSE_M[pose];
  return { eyeU: p.eyeM * F.UPM, topU: p.topM * F.UPM, hullU: p.topM * F.UPM, gunU: p.eyeM * F.UPM, depressionDeg: -90, elevationDeg: 90, traverseDeg: 180, source: 'pose' };
}
// the threat stands (inf) or is a vehicle (tank)
function threatHeights(kind, S, en) {
  if (kind === 'tank') return heights('tank', S, en);
  const P = (S && S.POSE) || POSE_M, p = P.stand || POSE_M.stand;
  return { eyeU: p.eyeM * F.UPM, topU: p.topM * F.UPM };
}

function ranges(I, kind) {
  const S = I.rules.sight, vp = I.sight.vprof, thr = THREAT[kind], wp = DG.weapons(I);
  const rm = (viewer, target, o) => {
    if (S && typeof S.rangeM === 'function') { const v = S.rangeM(vp, viewer, target, o); if (Number.isFinite(v) && v > 0) return v; }
    const base = target === 'tank' && viewer !== 'tank' ? FALLBACK_VEHICLE_M : FALLBACK_VIEW_M[viewer];
    return base * ({ stand: 1, kneel: 0.8, prone: 0.5, vehicle: 1 }[o.pose] || 1) * (o.cover ? 0.75 : 1);
  };
  const U = F.UPM;
  // binocular reach, uncover and flag sight radius per game from the vision profile (rules.md 3.2, 9.1: goh from data)
  // [V rules/sight profile]; the constants hold only when the profile lacks the number (the synth stand-in) [I]
  const vw = (vp && vp.viewers) || {};
  const num = (v, fb) => (Number.isFinite(v) && v > 0 ? v : fb);
  return {
    engU: Math.min(AIM_M[kind], rm(kind, thr, { pose: 'stand' })) * U,
    enemySightU: rm(thr, kind, { pose: POSE_OF[kind], cover: true }) * U,
    // the enemy standing in the open, seen by a standing enemy (SPAWN_SEEN): asked of rangeM, never backed out of factors
    enemyStandU: rm(thr, thr, { pose: 'stand' }) * U,
    enemyFireU: AIM_M[thr] * U,
    enemyUncoverU: num(vw[thr] && vw[thr].uncoverM, UNCOVER_M) * U, ownUncoverU: num(vw[kind] && vw[kind].uncoverM, UNCOVER_M) * U,
    binocU: num(vw.binocular && vw.binocular.reachM, BINOC_M) * U, flagU: num(vw.flag && vw.flag.radiusM, FLAG_M) * U,
    source: vw.binocular && Number.isFinite(vw.binocular.reachM) ? 'profile' : 'fallback',
    gunVsTankU: Math.min(AIM_M.at, rm('at', 'tank', { pose: 'kneel' })) * U,
    tankVsGunU: rm('tank', 'at', { pose: 'kneel', cover: true }) * U,
    mortarU: wp.mortar.reachM * U, howitzerU: wp.howitzer.reachM * U, grenadeU: wp.grenade.reachM * U,
  };
}

// drown test of a kind: the drown bit of the kind's class (tank: tank_medium, else the first bit naming a tank) [I]
function drownTest(I, kind) {
  const g = I.water.drown, bits = (g.meta && g.meta.bits) || [];
  let bi = -1;
  if (kind === 'tank') { bi = bits.indexOf('tank_medium'); if (bi < 0) bi = bits.findIndex(b => /tank/.test(b)); }
  if (bi < 0) return () => false;
  return (x, y) => { const v = F.valAt(g, x, y); return v !== null && ((v >>> bi) & 1) === 1; };
}

function relief(I) {
  const h = I.grids.height, nd = h.nodata;
  let lo = Infinity, hi = -Infinity;
  for (const v of h.data) { if (v === nd || !Number.isFinite(v)) continue; if (v < lo) lo = v; if (v > hi) hi = v; }
  return hi > lo ? (hi - lo) * (h.scale || 1) / F.UPM : 0;
}

// contact line C: 250 where abs(T_A - T_B) <= 2 s (my kind's travel of both sides)
function contactLayer(fr, doc, kind, K) {
  const L = F.layer(fr, 'strong.contact.' + kind, 0.004, {});
  const wb = doc.boxes.world;
  let n = 0;
  for (let j = 0; j < fr.h; j++) for (let i = 0; i < fr.w; i++) {
    const p = F.centre(fr, i, j), k = j * fr.w + i;
    if (!F.inBox(wb, p.x, p.y)) continue;
    const a = F.tAt(K.travel.a, p.x, p.y), b = F.tAt(K.travel.b, p.x, p.y);
    if (a === null || b === null) { L.data[k] = 0; continue; }
    if (Math.abs(a - b) <= 2) { L.data[k] = 250; n++; } else L.data[k] = 0;
  }
  return { L, n };
}
// midline: the principal axis of the contact cells, cut at their extent; with none, the perpendicular bisector of the
// two sides' spawn centres, cut at the world box
function midline(fr, C, m, ph, wb) {
  let sx = 0, sy = 0, n = 0;
  const pts = [];
  for (let k = 0; k < C.length; k++) if (C[k] === 250) { const p = F.centre(fr, k % fr.w, Math.floor(k / fr.w)); pts.push(p); sx += p.x; sy += p.y; n++; }
  if (n >= 2) {
    const cx = sx / n, cy = sy / n;
    let xx = 0, xy = 0, yy = 0;
    for (const p of pts) { const dx = p.x - cx, dy = p.y - cy; xx += dx * dx; xy += dx * dy; yy += dy * dy; }
    const ang = 0.5 * Math.atan2(2 * xy, xx - yy), ux = Math.cos(ang), uy = Math.sin(ang);
    let lo = Infinity, hi = -Infinity;
    for (const p of pts) { const t = (p.x - cx) * ux + (p.y - cy) * uy; if (t < lo) lo = t; if (t > hi) hi = t; }
    return [[rd(cx + ux * lo, 2), rd(cy + uy * lo, 2)], [rd(cx + ux * hi, 2), rd(cy + uy * hi, 2)]];
  }
  const ctr = s => { const l = F.spawnsOfDoc(m, s, ph); return l.length ? [l.reduce((a, p) => a + p.x, 0) / l.length, l.reduce((a, p) => a + p.y, 0) / l.length] : null; };
  const A = ctr('a'), B = ctr('b');
  if (!A || !B) return null;
  const cx = (A[0] + B[0]) / 2, cy = (A[1] + B[1]) / 2, dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy) || 1;
  const ux = -dy / L, uy = dx / L, half = Math.hypot(wb[2] - wb[0], wb[3] - wb[1]) / 2;
  return [[rd(cx - ux * half, 2), rd(cy - uy * half, 2)], [rd(cx + ux * half, 2), rd(cy + uy * half, 2)]];
}

// ow groups: each flag zone sampled (zone weights) and the contact line, each about OW_N points [I: cost bound]
const OW_N = 24;
function owGroups(ctx, game) {
  const out = [], top = ctx.thr.topU;
  for (const fl of ctx.flags) {
    const b = F.zoneBox(fl), area = Math.max(1, (b[2] - b[0]) * (b[3] - b[1]));
    const step = Math.max(40, Math.sqrt(area / OW_N));
    const pts = [];
    let tot = 0;
    for (let y = b[1] + step / 2; y < b[3]; y += step) for (let x = b[0] + step / 2; x < b[2]; x += step) {
      const w = F.zoneWeight(fl, x, y, game), g = F.hAt(ctx.grids.height, x, y);
      if (!(w > 0) || g === null) continue;
      pts.push({ x, y, z: g + top, w }); tot += w;
    }
    out.push({ flag: fl.name, pts, tot });
  }
  const cs = [];
  for (let k = 0; k < ctx.contact.length; k++) if (ctx.contact[k] === 250) cs.push(k);
  const every = Math.max(1, Math.ceil(cs.length / OW_N)), pts = [];
  for (let q = 0; q < cs.length; q += every) {
    const p = F.centre(ctx.fr, cs[q] % ctx.fr.w, Math.floor(cs[q] / ctx.fr.w)), g = F.hAt(ctx.grids.height, p.x, p.y);
    if (g !== null) pts.push({ x: p.x, y: p.y, z: g + top, w: 1 });
  }
  out.push({ flag: null, pts, tot: pts.length });
  return out;
}

function coverIndex(points) {
  const B = 200, map = new Map();
  for (const p of points) { const k = Math.floor(p.x / B) + ',' + Math.floor(p.y / B); if (!map.has(k)) map.set(k, []); map.get(k).push(p); }
  return (x, y, r) => {
    const out = [];
    for (let j = Math.floor((y - r) / B); j <= Math.floor((y + r) / B); j++) for (let i = Math.floor((x - r) / B); i <= Math.floor((x + r) / B); i++) {
      const l = map.get(i + ',' + j);
      if (l) for (const p of l) if (Math.hypot(p.x - x, p.y - y) <= r) out.push(p);
    }
    return out;
  };
}

// the last stretch of my route to c: steps of 3 m down my travel time, at most 6 points
function stretchOf(ctx) {
  return c => {
    const out = [];
    let x = c.x, y = c.y, t = F.tAt(ctx.Ts, x, y);
    if (t === null) return out;
    for (let n = 0; n < 6; n++) {
      let best = null;
      for (let a = 0; a < 8; a++) {
        const nx = x + Math.cos(a * Math.PI / 4) * 60, ny = y + Math.sin(a * Math.PI / 4) * 60, tn = F.tAt(ctx.Ts, nx, ny);
        if (tn !== null && tn < t && (!best || tn < best.t)) best = { x: nx, y: ny, t: tn };
      }
      if (!best) break;
      x = best.x; y = best.y; t = best.t;
      out.push({ x, y });
    }
    return out;
  };
}

function sideCtx(I, base, s, o) {
  const e = s === 'a' ? 'b' : 'a', kind = base.kind, thrKind = THREAT[kind];
  const P = I.rules.pass;
  const KO = base.KO, KT = base.KT;
  const box = P && typeof P.activeBox === 'function' ? P.activeBox(I.doc, I.mode, s, I.phase) : null;
  const ctx = {
    rules: I.rules, kind, s, si: s === 'a' ? 0 : 1, seed: base.seed, doc: I.doc, fr: base.fr, grids: I.grids, water: I.water,
    flags: base.flags, contact: base.contact, R: base.R, me: base.me, thr: base.thr, applies: base.applies,
    sg: I.sight.sg, fg: I.sight.fg, VALUE: I.cover.VALUE, lipUsed: I.cover.lipUsed, flat: base.flat, stepU: I.sight.stepU,
    Ts: KO.travel[s], Te: KO.travel[e], TeThr: KT.travel[e], setupS: SETUP_S[kind], K: { own: KO },
    box: box || I.doc.boxes.pather || I.doc.boxes.world, spawnsE: F.spawnsOfDoc(I.m, e, I.phase),
    enemyFlags: base.flags.filter(f => f.team === e), drowns: base.drowns, routeDensE: KT.route ? KT.route[e] : null,
    objects: I.objects, catalog: I.catalog, coverNear: base.coverNear, weapons: DG.weapons(I),
    caps: base.caps, capHit: base.capHit, note: base.note, tick: o.tick || null,
  };
  ctx.owGroups = owGroups(ctx, I.game);
  ctx.stretch = stretchOf(ctx);
  ctx.firstAt = (x, y) => { const a = F.tAt(ctx.Ts, x, y), b = F.tAt(ctx.Te, x, y); return a !== null && (b === null || a < b); };
  return ctx;
}

function evalOne(ctx, c) {
  const e = FX.evaluate(ctx, c);
  c.f = {}; for (const id of APPLIES[ctx.kind]) if (e.f[id] !== undefined) c.f[id] = rd(e.f[id]);
  c.aux = e.aux;
  c.score = c.gate ? rd(score(e.f, PRESETS.balanced, ctx.kind)) : 0;
  return c;
}

function runSide(I, base, s, o) {
  const ctx = sideCtx(I, base, s, o), stage = o.stage || (() => {});
  stage('frame');
  TH.enemyGround(ctx);
  TH.samples(ctx);
  ctx.routeE = TH.routeSamples(ctx, base.KT.routes || [], s === 'a' ? 'b' : 'a', THREAT[base.kind], base.KT.mcost, ctx.thr);
  TH.heat(ctx);
  CA.gateLayer(ctx);
  CA.pxLayer(ctx);
  stage('candidates');
  const lat = CA.lattice(ctx).map(c => Object.assign(c, { gate: 1, gateWhy: [] }));
  const ext = CA.extras(ctx).map(c => {
    const why = c.why; delete c.why;
    const g = F.hAt(ctx.grids.height, c.x, c.y);
    if (c.src === 'garrison' && g !== null) c.z = g + c.portZ - ctx.me.eyeU;
    delete c.portZ;
    return Object.assign(c, { gate: why.length ? 0 : 1, gateWhy: why.filter(w => w !== 'ground') });
  });
  stage('factors');
  for (const c of lat) { if (ctx.tick) ctx.tick(); evalOne(ctx, c); }
  for (const c of ext) { if (ctx.tick) ctx.tick(); evalOne(ctx, c); }
  // refine: the best REFINE lattice candidates stay; the best REFINE_MOVE move 1 m (four steps of 20 u) to a better spot
  stage('refine');
  lat.sort((p, q) => q.score - p.score || p.x - q.x || p.y - q.y);
  const keep = lat.slice(0, CA.REFINE);
  if (lat.length > CA.REFINE) base.caps.refineHit = true;
  for (let k = 0; k < Math.min(REFINE_MOVE, keep.length); k++) {
    const c = keep[k];
    let best = c;
    for (const [dx, dy] of [[20, 0], [-20, 0], [0, 20], [0, -20]]) {
      const x = rd(c.x + dx, 2), y = rd(c.y + dy, 2);
      if (CA.gateWhy(ctx, x, y).length) continue;
      if (ctx.tick) ctx.tick();
      const t = evalOne(ctx, { x, y, src: 'lattice', uid: null, gate: 1, gateWhy: [] });
      if (t.score > best.score) best = t;
    }
    keep[k] = best;
  }
  const list = keep.concat(ext);
  // z of the JSON: the ground height for lattice and fort candidates (garrison keeps its port z); kept apart from c.z so
  // the ensemble's ground jitter still applies
  for (const c of list) if (c.z === undefined || c.z === null) c.zg = F.hAt(ctx.grids.height, c.x, c.y);
  stage('classify');
  for (const c of list) {
    if (c.gate) { const r = CL.classify(ctx, c); c.cls = r.cls; c.why = r.why; } else { c.cls = []; c.why = {}; }
  }
  list.sort((p, q) => q.score - p.score || p.x - q.x || p.y - q.y);
  list.forEach((c, i) => { c.id = s + (i + 1); c.side = s; c.rank = i + 1; });
  // presetsTop: in how many presets the candidate is among the side's ten best
  const pt = new Map();
  for (const name of Object.keys(PRESETS)) {
    const sc = list.filter(c => c.gate).map(c => ({ c, v: score(c.f, PRESETS[name], ctx.kind) })).sort((p, q) => q.v - p.v || p.c.rank - q.c.rank).slice(0, 10);
    for (const r of sc) pt.set(r.c, (pt.get(r.c) || 0) + 1);
  }
  stage('ensemble');
  EN.run(ctx, list, o.ensemble === undefined ? 8 : o.ensemble, PRESETS.balanced, APPLIES);
  const lab = CL.labels(list, ctx.kind), labSet = new Set(lab);
  for (const c of list) { c.presetsTop = pt.get(c) || 0; c.top = labSet.has(c); c.label = CL.labelOf(c, PRESETS.balanced); }
  return { ctx, all: list, labels: lab };
}

function layersOf(base, side) {
  const { ctx, all } = side, fr = base.fr, kind = base.kind, b = 'strong.' + ctx.s + '.' + kind + '.', n = fr.w * fr.h;
  const out = [];
  const best = (name, scale, meta, val) => {
    const L = F.layer(fr, b + name, scale, meta);
    for (const c of all) {
      if (!c.gate) continue;
      const k = F.cellOf(fr, c.x, c.y), v = val(c);
      if (k < 0 || v === null || v === undefined) continue;
      const u = scale === 1 ? F.u8raw(v) : F.u8(v);
      if (L.data[k] === 255 || u > L.data[k]) L.data[k] = u;
    }
    return L;
  };
  for (const id of APPLIES[kind]) out.push(best(id, 0.004, { factor: id, engineTrue: FACTOR_META[id][0], inputs: FACTOR_META[id][1] }, c => c.f[id]));
  out.push(ctx.gateGrid);
  out.push(best('score', 0.004, { preset: 'balanced', weights: Object.assign({}, PRESETS.balanced) }, c => c.score));
  const T = F.layer(fr, b + 'threat', 0.004, { samples: ctx.TH.length, d: ctx.d });
  for (let k = 0; k < n; k++) if (Number.isFinite(ctx.heat[k])) T.data[k] = F.u8(ctx.heat[k]);
  out.push(T);
  out.push(best('uncont', 1, {}, c => c.why && c.why.uncont ? Math.max(1, c.why.uncont.openM) : 0));
  out.push(best('first', 1, {}, c => c.why && c.why.first ? Math.max(1, c.why.first.leadS) : 0));
  for (const L of DG.layers(ctx)) out.push(L);
  return out;
}

function candJson(c) {
  const why = {};
  for (const k of Object.keys(c.why || {}).sort()) why[k] = c.why[k];
  return { id: c.id, side: c.side, x: rd(c.x, 2), y: rd(c.y, 2), z: c.z !== undefined && c.z !== null ? rd(c.z, 2) : Number.isFinite(c.zg) ? rd(c.zg, 2) : null, src: c.src, uid: c.uid === undefined ? null : c.uid,
    gate: c.gate, gateWhy: c.gateWhy, f: c.f, score: c.score, cls: c.cls, label: c.label, why, rank: c.rank, top: c.top, median: c.median, spread: c.spread,
    presetsTop: c.presetsTop };
}

function run(I, o) {
  o = o || {};
  const M = require('../mapviz');
  const kind = o.kind || I.kind || 'inf';
  if (!KINDS.includes(kind)) throw new M.MvError('MV_USAGE', 'strong: --kind must be inf, mg, at or tank, got ' + kind);
  const sideOpt = o.side || 'both';
  if (!['a', 'b', 'both'].includes(sideOpt)) throw new M.MvError('MV_USAGE', 'strong: --side must be a, b or both');
  if (o.ensemble !== undefined && !(Number.isInteger(o.ensemble) && o.ensemble >= 0)) throw new M.MvError('MV_USAGE', 'strong: --ensemble must be a whole number >= 0, got ' + o.ensemble);
  const seed = Number.isInteger(o.seed) ? o.seed : 1;
  const stage = o.stage || (() => {});
  stage('read');
  IN.objects(I); IN.sight(I); IN.cover(I);
  I.seed = seed;
  const KO = IN.kindInputs(I, kind), KT = IN.kindInputs(I, THREAT[kind]);
  const fr = F.strongFrame(I.doc);
  const notes = I.notes.slice(), capMsgs = [];
  const note = (code, msg) => { if (!notes.some(n => n.code === code && n.msg === msg)) notes.push({ code, msg }); };
  const flat = relief(I) <= FLAT_M;
  if (flat) note('STRONG_FLAT', 'relief ' + rd(relief(I), 2) + ' m <= ' + FLAT_M + ' m: terrain classifiers off');
  const flags = F.flagsOf(I.m, I.phase);
  const C = contactLayer(fr, I.doc, kind, KO);
  const base = {
    kind, seed, fr, flags, contact: C.L.data, flat, KO, KT, R: ranges(I, kind), me: heights(kind, I.rules.sight, unitEntry(I, kind)), thr: threatHeights(THREAT[kind], I.rules.sight, unitEntry(I, THREAT[kind])),
    applies: Object.fromEntries(APPLIES[kind].map(k => [k, true])), drowns: drownTest(I, kind), coverNear: coverIndex(I.cover.points),
    caps: { lattice: 0 }, capHit: msg => { if (!capMsgs.includes(msg)) capMsgs.push(msg); }, note,
    doc: I.doc, m: I.m, grids: I.grids, objects: I.objects,
  };
  const sides = sideOpt === 'both' ? ['a', 'b'] : [sideOpt];
  const bySide = {}, grids = [];
  for (const s of sides) bySide[s] = runSide(I, base, s, o);
  for (const s of sides) for (const g of layersOf(base, bySide[s])) grids.push(g);
  grids.push(C.L);
  stage('fair');
  const fl = FA.flags(base, bySide), ds = FA.dist(bySide);
  const sym = FA.symmetry(base);
  for (const msg of capMsgs) note('STRONG_CAP_HIT', msg);
  // STRONG_DEGRADED: a route of the kind or of its THREAT kind runs over water (a bridge or a ford: the travel time there
  // is not tested in the game) [I], or a travel grid says it skipped patches (meta.skipped) [I]
  for (const [k, KK] of [[kind, KO], [THREAT[kind], KT]]) {
    const wet = (KK.routes || []).filter(r => r && r.cross && r.cross.water).length;
    if (wet) note('STRONG_DEGRADED', wet + ' routes of ' + k + ' cross water (bridge or ford)');
    for (const s of ['a', 'b']) { const t = KK.travel && KK.travel[s], sk = t && t.meta && t.meta.skipped; if (sk && (sk.length || sk > 0)) note('STRONG_DEGRADED', 'travel.' + s + '.' + k + ' skipped patches: ' + (sk.length || sk)); }
  }
  // no enemy route of the THREAT kind reaches this side (goh: the flag point sits in a blocked footprint, so rules/pass
  // routes none): kz, enf and amb are left out (nodata), not scored 0 [V goh 1v1_balzerweg: 0 routes]
  for (const s of sides) {
    const e = s === 'a' ? 'b' : 'a', off = ['kz', 'enf', 'amb'].filter(id => APPLIES[kind].includes(id));
    if (!(bySide[s].ctx.routeE.tot > 0) && off.length) note('STRONG_DEGRADED', 'no routes of ' + THREAT[kind] + ' for side ' + e + ': ' + off.join('/') + ' off for side ' + s);
  }
  if (base.caps.refineHit) note('STRONG_CAP_HIT', 'refine kept the best ' + CA.REFINE + ' lattice candidates per side');
  const P = I.rules.pass;
  const boxes = {};
  for (const s of ['a', 'b']) boxes[s] = P && typeof P.activeBox === 'function' ? P.activeBox(I.doc, I.mode, s, I.phase) : null;
  const D = sides.map(s => bySide[s].ctx.d);
  const cands = [], labels = [];
  for (const s of sides) { for (const c of bySide[s].all) cands.push(candJson(c)); for (const c of bySide[s].labels) labels.push(c.id); }
  const json = {
    v: 1, kind: 'strong', target: I.target, map: I.map, mode: I.mode, phase: I.phase, unit: kind, seed, version: VERSION,
    frame: { d: Math.min.apply(null, D), contactCells: C.n, midline: midline(fr, C.L.data, I.m, I.phase, I.doc.boxes.world), flagsActive: flags.map(f => f.name), boxes,
      // the reaches this run used, per game from the stack's files else the fallback (danger.weapons; page why panel)
      weapons: weaponsJson(DG.weapons(I)) },
    factors: FACTORS.map(id => ({ id, applies: APPLIES[kind].includes(id), engineTrue: FACTOR_META[id][0], inputs: FACTOR_META[id][1] })),
    presets: { balanced: Object.assign({}, PRESETS.balanced), hold: Object.assign({}, PRESETS.hold), attack: Object.assign({}, PRESETS.attack) },
    candidates: cands, labels,
    fair: { flags: fl.flags, dist: ds.dist, gap: ds.gap, top50: ds.top50, symmetry: sym },
    checks: fl.checks,
    ensemble: { runs: o.ensemble === undefined ? 8 : o.ensemble, jitter: Object.assign({}, EN.JIT) },
    caps: { lattice: base.caps.lattice, perTile: CA.PER_TILE, refine: CA.REFINE, hit: capMsgs.length > 0 || !!base.caps.refineHit },
    flat, notes,
  };
  return { json, grids, checks: fl.checks };
}

// frame.weapons {grenade, mortar, howitzer: {name, reachM, source 'stack'|'fallback'}}: a copy, never the cached object
function weaponsJson(wp) {
  const one = w => ({ name: String(w.name), reachM: w.reachM, source: w.source });
  return { grenade: one(wp.grenade), mortar: one(wp.mortar), howitzer: one(wp.howitzer) };
}

function checks(I, o) { return require('./checks').checks(I, o || {}); }
function inputs(dirs, o) { return IN.inputs(dirs, o); }

module.exports = { VERSION, KINDS, FACTORS, APPLIES, CLASSIFIERS, THREAT, SETUP_S, PRESETS, inputs, run, score, checks,
  ranges, heights, threatHeights, unitEntry, drownTest, WEAPONS, AIM_M, POSE_OF, FACTOR_META };

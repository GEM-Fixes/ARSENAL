// strong factors (MV-STR): the per-candidate factors of design 6 (ow kz sp df cv rt fr px hu amb enf), each 0..1 "good
// for me". evaluate(ctx, c, jit?) -> {f, aux}; aux carries what the classifiers read (terrain mask share, lead time,
// hull facing, the threat subset). Rays go through ctx.rules.sight (canSee, fireLine) and ctx.rules.cover (shields,
// terrainShields) only: the engine rules live in their own parts; this file only counts.
// jit (ensemble, rules.md 6.4): {dz (u, my ground), dzT (u, target heights), speedS, speedE (travel time factors)}.
// Author: Imperator_Aug (ARSENAL, ia-5480aa67)
'use strict';
const F = require('./frame');

const N_TH = 48;          // threat samples per candidate ("about 200 rays per candidate", design 6 cost)
const N_RT = 8;           // threat samples per route point of rt
const N_HU = 16;          // threat samples of hu
const FACINGS = 16;
const RING_DIRS = 16, RING_STEPS = [0.25, 0.5, 0.75, 1];

const sig = x => 1 / (1 + Math.exp(-x));
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;

// the first n threat samples in the fixed hash order within maxU of p (consistent subsets: shares stay unbiased)
function pick(ctx, x, y, maxU, n) {
  const out = [], TH = ctx.TH, ord = ctx.thOrder, m2 = maxU * maxU;
  for (let k = 0; k < ord.length && out.length < n; k++) {
    const t = TH[ord[k]], dx = t.x - x, dy = t.y - y, d2 = dx * dx + dy * dy;
    if (d2 <= m2) out.push({ t, d: Math.sqrt(d2) });
  }
  return out;
}

function evaluate(ctx, c, jit) {
  const j = jit || { dz: 0, dzT: 0, speedS: 1, speedE: 1 };
  const S = ctx.rules.sight, CV = ctx.rules.cover;
  const R = ctx.R, kind = ctx.kind, applies = ctx.applies;
  const g = F.hAt(ctx.grids.height, c.x, c.y);
  const gz = (g === null ? 0 : g) + j.dz;
  const eye = { x: c.x, y: c.y, z: (c.z !== undefined && c.z !== null ? c.z : gz) + ctx.me.eyeU };
  const top = { x: c.x, y: c.y, z: (c.z !== undefined && c.z !== null ? c.z : gz) + ctx.me.topU + j.dzT };
  const f = {}, aux = { g: gz };
  const seeO = { uncoverU: R.enemyUncoverU, rangeU: R.enemySightU };

  // threat subset: sight and fire from each sample to my top
  const maxR = Math.max(R.enemySightU, R.enemyFireU);
  const sub = pick(ctx, c.x, c.y, maxR, N_TH);
  let wS = 0, wSeen = 0, wF = 0, wHit = 0, wTer = 0;
  for (const s of sub) {
    const t = s.t;
    if (s.d <= R.enemySightU) {
      wS += t.w;
      if (S.canSee(ctx.sg, t.eye, top, seeO)) { wSeen += t.w; s.seen = true; }
    }
    if (s.d <= R.enemyFireU) {
      wF += t.w;
      const fl = S.fireLine(ctx.fg, t.eye, top, { rangeU: R.enemyFireU });
      s.fire = fl;
      if (fl.clear) wHit += t.w;
      else if (fl.block === 'terrain') wTer += t.w;
    }
  }
  aux.sub = sub;
  aux.seenShare = wS ? wSeen / wS : 0;
  aux.hitShare = wF ? wHit / wF : 0;
  aux.terrainShare = wF ? wTer / wF : 0;

  // sp: 1 - max(direct sight, binoculars x 0.5 [I], flag sight)
  const binoc = ctx.distG ? (F.valAt(ctx.distG, c.x, c.y) !== null && F.valAt(ctx.distG, c.x, c.y) <= R.binocU) : false;
  let flagNear = false;
  for (const fl of ctx.enemyFlags) if (Math.hypot(fl.x - c.x, fl.y - c.y) <= R.flagU) { flagNear = true; break; }
  if (applies.sp) f.sp = clamp01(1 - Math.max(aux.seenShare, binoc ? 0.5 : 0, flagNear ? 1 : 0));
  aux.binoc = binoc; aux.flagNear = flagNear;
  // df: 1 - weighted share of fire lines that reach my top
  if (applies.df) f.df = clamp01(1 - aux.hitShare);

  // ow: share of a flag zone (zone weights) or of C seen within engagement range; best group
  if (applies.ow) {
    let best = 0;
    for (const grp of ctx.owGroups) {
      if (!grp.tot) continue;
      let w = 0;
      for (const p of grp.pts) {
        const d = Math.hypot(p.x - c.x, p.y - c.y);
        if (d > R.engU) continue;
        if (S.canSee(ctx.sg, eye, p, { uncoverU: R.ownUncoverU, rangeU: R.engU })) w += p.w;
      }
      best = Math.max(best, w / grp.tot);
    }
    f.ow = clamp01(best);
  }

  // kz and enf (and amb): enemy route samples of the threat kind. With no enemy route (RS.tot 0) the three are not
  // computed: left out of f (nodata in the layers, skipped by the score), and run() notes STRONG_DEGRADED
  const RS = ctx.routeE;
  if ((applies.kz || applies.enf) && RS.tot > 0) {
    let wk = 0, wv = 0, wa = 0;
    for (const r of RS.pts) {
      const dx = r.x - c.x, dy = r.y - c.y, d = Math.hypot(dx, dy);
      if (d > R.engU || d < 1) continue;
      const tgt = { x: r.x, y: r.y, z: r.z + j.dzT };
      if (!S.canSee(ctx.sg, eye, tgt, { uncoverU: R.ownUncoverU, rangeU: R.engU })) continue;
      if (!S.fireLine(ctx.fg, eye, tgt, { rangeU: R.engU }).clear) continue;
      wk += r.w; wv += r.w;
      wa += r.w * Math.abs((dx * r.dx + dy * r.dy) / d);   // |cos| of route direction against the fire line
    }
    if (applies.kz) f.kz = clamp01(wk / RS.tot);
    if (applies.enf) f.enf = wv ? clamp01(wa / wv) : 0;
  }

  // cv: best cover point within 5 m, value x share of threat samples it shields from
  if (applies.cv) {
    let best = 0, bestPt = null;
    const near = ctx.coverNear(c.x, c.y, 100);
    const fireSub = sub.filter(s => s.d <= R.enemyFireU);
    for (const pt of near) {
      const v = ctx.VALUE[pt.type] || 0;
      if (v <= best) continue;
      let ws = 0, wt = 0;
      for (const s of fireSub) {
        wt += s.t.w;
        if ((pt.wall && CV.shields(pt, s.t)) || CV.terrainShields(ctx.grids, pt, s.t.eye)) ws += s.t.w;
      }
      const val = v * (wt ? ws / wt : 1);
      if (val > best) { best = val; bestPt = pt; }
    }
    f.cv = clamp01(best);
    aux.coverPt = bestPt;
  }

  // fr: set up first. The earliest enemy arrival within his direct-fire range with a fire line to me
  const tOwn = F.tAt(ctx.Ts, c.x, c.y);
  let tEnemy = Infinity;
  {
    const ring = [];
    for (let a = 0; a < RING_DIRS; a++) {
      const ang = 2 * Math.PI * a / RING_DIRS;
      for (const st of RING_STEPS) {
        const x = c.x + Math.cos(ang) * R.enemyFireU * st, y = c.y + Math.sin(ang) * R.enemyFireU * st;
        const te = F.tAt(ctx.TeThr, x, y);
        if (te !== null) ring.push({ x, y, te });
      }
    }
    ring.sort((p, q) => p.te - q.te || p.x - q.x || p.y - q.y);
    for (const q of ring) {
      const gq = F.hAt(ctx.grids.height, q.x, q.y);
      if (gq === null) continue;
      if (S.fireLine(ctx.fg, { x: q.x, y: q.y, z: gq + ctx.thr.eyeU }, top, { rangeU: R.enemyFireU }).clear) { tEnemy = q.te * j.speedE; break; }
    }
  }
  const town = tOwn === null ? null : tOwn * j.speedS;
  aux.leadS = town === null ? null : (tEnemy === Infinity ? 250 : tEnemy - town - ctx.setupS);
  if (applies.fr) f.fr = town === null ? 0 : clamp01(sig((aux.leadS) / 5));

  // rt: 1 - exposure (seen or hit) along the last stretch of my route
  if (applies.rt) {
    const pts = ctx.stretch(c);
    let ex = 0;
    for (const p of pts) {
      const gp = F.hAt(ctx.grids.height, p.x, p.y);
      if (gp === null) continue;
      const tp = { x: p.x, y: p.y, z: gp + ctx.me.topU + j.dzT };
      const ss = pick(ctx, p.x, p.y, maxR, N_RT);
      let wt = 0, we = 0;
      for (const s of ss) {
        wt += s.t.w;
        const seen = s.d <= R.enemySightU && S.canSee(ctx.sg, s.t.eye, tp, seeO);
        if (seen) { we += s.t.w; continue; }
        if (s.d <= R.enemyFireU && S.fireLine(ctx.fg, s.t.eye, tp, { rangeU: R.enemyFireU }).clear) we += s.t.w;
      }
      ex += wt ? we / wt : 0;
    }
    f.rt = clamp01(1 - (pts.length ? ex / pts.length : 0));
  }

  // px: nearness to flags and C, from the cheap layer
  if (applies.px) f.px = ctx.pxAt(c.x, c.y);

  // hu (tank): best of 16 facings: hull hidden by terrain, muzzle line clear, angle inside depression..elevation
  if (applies.hu) {
    const H = ctx.me;
    const hull = { x: c.x, y: c.y, z: gz + H.hullU }, gun = { x: c.x, y: c.y, z: gz + H.gunU };
    const hs = sub.filter(s => s.d <= R.enemyFireU).slice(0, N_HU);
    const tests = hs.map(s => {
      const hid = S.fireLine(ctx.fg, s.t.eye, hull, { rangeU: R.enemyFireU }).block === 'terrain';
      const clr = hid && S.fireLine(ctx.fg, gun, s.t.top, { rangeU: R.enemyFireU }).clear;
      return { s, ok: hid && clr, bear: Math.atan2(s.t.y - c.y, s.t.x - c.x), elev: Math.atan2(s.t.top.z - gun.z, Math.max(1, s.d)) * 180 / Math.PI };
    });
    let wt = 0; for (const t of tests) wt += t.s.t.w;
    let best = 0, bestF = 0;
    for (let k = 0; k < FACINGS; k++) {
      const fa = 2 * Math.PI * k / FACINGS, cx = Math.cos(fa), cy = Math.sin(fa);
      const hf = F.hAt(ctx.grids.height, c.x + cx * 60, c.y + cy * 60), hb = F.hAt(ctx.grids.height, c.x - cx * 60, c.y - cy * 60);
      const pitch = hf === null || hb === null ? 0 : Math.atan2(hf - hb, 120) * 180 / Math.PI;   // 6 m box along the facing
      let w = 0;
      for (const t of tests) {
        if (!t.ok) continue;
        const rel = t.elev - pitch * Math.cos(t.bear - fa);
        if (rel >= H.depressionDeg && rel <= H.elevationDeg) w += t.s.t.w;
      }
      const v = wt ? w / wt : 0;
      if (v > best) { best = v; bestF = k * 360 / FACINGS; }
    }
    f.hu = clamp01(best);
    aux.facingDeg = bestF;
  }

  // amb (AT gun): share of enemy vehicle route time where the gun sees the tank first, inside the traverse arc
  if (applies.amb && RS.tot > 0) {
    const hits = [];
    for (const r of RS.pts) {
      const dx = r.x - c.x, dy = r.y - c.y, d = Math.hypot(dx, dy);
      if (d > R.gunVsTankU || d < 1) continue;
      const tank = { x: r.x, y: r.y, z: r.z + j.dzT };
      if (!S.canSee(ctx.sg, eye, tank, { uncoverU: R.ownUncoverU, rangeU: R.gunVsTankU })) continue;
      const tankEye = { x: r.x, y: r.y, z: r.eyeZ };
      const tankSees = d <= R.tankVsGunU && S.canSee(ctx.sg, tankEye, top, { uncoverU: R.enemyUncoverU, rangeU: R.tankVsGunU });
      if (!tankSees) hits.push({ w: r.w, a: Math.atan2(dy, dx) });
    }
    let best = 0;
    const arc = ctx.me.traverseDeg * Math.PI / 180;
    for (let k = 0; k < FACINGS; k++) {
      const fa = 2 * Math.PI * k / FACINGS;
      let w = 0;
      for (const h of hits) { let da = Math.abs(h.a - fa) % (2 * Math.PI); if (da > Math.PI) da = 2 * Math.PI - da; if (da <= arc) w += h.w; }
      best = Math.max(best, w);
    }
    f.amb = clamp01(best / RS.tot);
  }
  return { f, aux };
}

// score(f, weights, kind): weighted mean over the factors that apply (G applied by the caller)
function score(f, weights, kind, APPLIES) {
  let s = 0, w = 0;
  for (const id of APPLIES[kind]) {
    if (f[id] === undefined || f[id] === null) continue;
    const wi = weights && weights[id] !== undefined ? weights[id] : 1;
    s += wi * f[id]; w += wi;
  }
  return w ? s / w : 0;
}

module.exports = { evaluate, score, pick, N_TH };

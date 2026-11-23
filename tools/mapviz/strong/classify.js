// strong classifiers (MV-STR): reverse slope / dead ground, high ground, uncontested cover, first to reach, garrison,
// hull-down (design 6). They set the label and the why; they add no weight. Labels: top 10 per side, score >= the 98th
// percentile of the side and >= 0.5, suppression 15 m (25 m tank); label text = the classifier that fires, else the
// factor with the largest w x F.
// Ruling of this part: "Dead ground / hollow" = terrain masks most enemy fire lines but some reverse-slope test fails
// (design 6 names only the rear test; on a short slope the crest-distance test fails too).
// Author: Imperator_Aug (ARSENAL, ia-1f05a3f9)
'use strict';
const F = require('./frame');

const ORDER = ['reverse', 'dead', 'high', 'uncont', 'first', 'garrison', 'hull'];

// the masking crest along the bearing to the weighted threat centre: highest elevation angle from my eye within R_eng
function scan(ctx, c, eyeZ, ang, maxU) {
  let best = -Infinity, at = null;
  for (let d = 20; d <= maxU; d += 20) {
    const x = c.x + Math.cos(ang) * d, y = c.y + Math.sin(ang) * d, h = F.hAt(ctx.grids.height, x, y);
    if (h === null) break;
    const a = Math.atan2(h - eyeZ, d);
    if (a > best) { best = a; at = { x, y, h, d }; }
  }
  return { angle: best, at };
}

function classify(ctx, c) {
  const cls = [], why = {}, f = c.f, aux = c.aux, R = ctx.R, S = ctx.rules.sight;
  const g = aux.g, myH = ctx.me.topU;
  // threat bearing: weighted centre of the samples of the candidate's subset
  let sx = 0, sy = 0, sw = 0, sz = 0;
  for (const s of aux.sub) { sx += s.t.x * s.t.w; sy += s.t.y * s.t.w; sz += F.hAt(ctx.grids.height, s.t.x, s.t.y) * s.t.w; sw += s.t.w; }
  if (sw && !ctx.flat) {
    const tx = sx / sw, ty = sy / sw, ang = Math.atan2(ty - c.y, tx - c.x);
    // high ground: mean elevation angle down to the threats >= 3 deg and at least 2 m above them
    let aSum = 0, n = 0, dzSum = 0;
    for (const s of aux.sub) {
      if (s.d > R.engU) continue;
      const th = F.hAt(ctx.grids.height, s.t.x, s.t.y);
      aSum += Math.atan2(g - th, Math.max(1, s.d)) * 180 / Math.PI; dzSum += g - th; n++;
    }
    if (n && aSum / n >= 3 && dzSum / n >= 40) { cls.push('high'); why.high = { angleDeg: rd(aSum / n), aboveM: rd(dzSum / n / F.UPM) }; }
    // reverse slope / dead ground
    if (aux.terrainShare > 0.5) {
      const eyeZ = g + ctx.me.eyeU;
      const front = scan(ctx, c, eyeZ, ang, R.engU), rear = scan(ctx, c, eyeZ, ang + Math.PI, R.engU);
      const cr = front.at;
      let ok = !!cr;
      let widthM = 0, rise = 0, distM = 0, rearRatio = null;
      if (cr) {
        distM = cr.d / F.UPM; rise = cr.h - g;
        ok = ok && cr.d >= R.grenadeU && cr.d <= R.engU && rise >= myH;
        // width across the threat direction: points beside the crest at least as high as the crest - 0.5 m
        const px = -Math.sin(ang), py = Math.cos(ang);
        let wPlus = 0, wMinus = 0;
        for (let s = 20; s <= 200; s += 20) { const h = F.hAt(ctx.grids.height, cr.x + px * s, cr.y + py * s); if (h === null || h < cr.h - 10) break; wPlus = s; }
        for (let s = 20; s <= 200; s += 20) { const h = F.hAt(ctx.grids.height, cr.x - px * s, cr.y - py * s); if (h === null || h < cr.h - 10) break; wMinus = s; }
        widthM = (wPlus + wMinus) / F.UPM;
        ok = ok && widthM >= 10;
        ok = ok && S.fireLine(ctx.fg, { x: c.x, y: c.y, z: eyeZ }, { x: cr.x, y: cr.y, z: cr.h + 10 }, { rangeU: R.engU }).block !== 'terrain';
        const fa = Math.max(1e-6, Math.tan(front.angle)), ra = rear.at ? Math.tan(Math.max(0, rear.angle)) : 0;
        rearRatio = rd(ra / fa);
      }
      const rearOpen = rearRatio !== null && rearRatio < 0.5;
      if (ok && rearOpen) {
        cls.push('reverse');
        why.reverse = { crest: [rd(cr.x), rd(cr.y)], distM: rd(distM), riseM: rd(rise / F.UPM), widthM: rd(widthM), rearRatio };
      } else {
        cls.push('dead');
        if (cr) why.reverse = { crest: [rd(cr.x), rd(cr.y)], distM: rd(distM), riseM: rd(rise / F.UPM), widthM: rd(widthM), rearRatio };
      }
    }
  }
  // uncontested cover: cv >= 0.5 and no enemy covered spot with a fire line to me within his range + 10 m
  if (f.cv !== undefined && f.cv >= 0.5) {
    const reach = R.enemyFireU + 200, search = 2 * R.enemyFireU;
    let nearest = Infinity;
    const top = { x: c.x, y: c.y, z: g + ctx.me.topU };
    for (const pt of ctx.coverNear(c.x, c.y, search)) {
      const k = F.cellOf(ctx.fr, pt.x, pt.y);
      if (k < 0 || !ctx.G[k]) continue;                             // only spots on enemy ground
      if (pt.type === 12 && !ctx.lipUsed) continue;
      const d = Math.hypot(pt.x - c.x, pt.y - c.y);
      if (d >= nearest) continue;
      if (pt.wall && !ctx.rules.cover.shields(pt, { x: c.x, y: c.y })) continue;   // the wall must face me
      const gp = F.hAt(ctx.grids.height, pt.x, pt.y);
      if (gp === null) continue;
      if (S.fireLine(ctx.fg, { x: pt.x, y: pt.y, z: gp + ctx.thr.eyeU }, top, { rangeU: search }).clear) nearest = d;
    }
    if (nearest > reach) {
      const openM = Math.min(R.enemyFireU, nearest === Infinity ? R.enemyFireU : nearest - R.enemyFireU) / F.UPM;
      cls.push('uncont'); why.uncont = { openM: rd(Math.max(0, openM)) };
    }
  }
  if (f.fr !== undefined && f.fr >= 0.8 && aux.leadS !== null) { cls.push('first'); why.first = { leadS: rd(Math.min(250, aux.leadS)) }; }
  if (c.src === 'garrison') { cls.push('garrison'); why.garrison = c.garrison; }
  if (f.hu !== undefined && f.hu >= 0.6) { cls.push('hull'); why.hull = { facingDeg: aux.facingDeg }; }
  cls.sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  return { cls, why };
}
const rd = v => Math.round(v * 100) / 100;

function labelOf(c, weights) {
  if (c.cls.length) return c.cls[0];
  let best = null, bv = -1;
  for (const id of Object.keys(c.f).sort()) { const v = (weights[id] === undefined ? 1 : weights[id]) * c.f[id]; if (v > bv) { bv = v; best = id; } }
  return best;
}

// top 10 labels of one side's list (sorted by score, best first)
function labels(list, kind) {
  const ok = list.filter(c => c.gate === 1);
  if (!ok.length) return [];
  const sc = ok.map(c => c.score).sort((a, b) => a - b);
  const p98 = sc[Math.min(sc.length - 1, Math.floor(0.98 * (sc.length - 1)))];
  const rad = (kind === 'tank' ? 25 : 15) * F.UPM;
  const out = [];
  for (const c of ok) {
    if (out.length >= 10) break;
    if (c.score < p98 || c.score < 0.5) continue;
    if (out.some(o => Math.hypot(o.x - c.x, o.y - c.y) < rad)) continue;
    out.push(c);
  }
  return out;
}

module.exports = { classify, labelOf, labels, ORDER };

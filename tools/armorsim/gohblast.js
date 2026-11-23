// armorsim/gohblast: a high explosive blast on a Gates of Hell unit's model, by GoH's own rules (untested, not run in game:
// note 'T'). Used by goh.js shot3 (the burst point of a stopped shell) and blast3 (a point given).
// The rules (GoH , , ;
// gohweb GHDMG-42/43/44):
//   desc: charge c4 (the ammo's {blastwave energy}), radii r0 / r1 m (its area), x 20 units per m
//   targets (CollectTargets): every volume a blast may meet (ABLE_BLAST: blast.js blastAbles, the AS64 able rules [I same]);
//     aim = the volume's nearest point to the blast (the blast point itself when inside); shield 1 (a vehicle)
// for every target (last first) the ray from the blast to its aim (no ray when the ground lies between, on a line one
//     unit above both); every target whose bounding sphere (frame origin, half the shape's bounds diagonal x the frame's x-axis length,
//     TouchesSegment) meets the segment, or which holds the blast, is traced: inside = its exit distance and side, else its
//     entry distance and side; nearest first, energy = the game(d) - absorbed (stop when not > 0); a target keeps its best energy
//     with that ray's hit point and side; each hit runs the game (:271-281) and absorbed += what it kept / energy_per_blastwave
// d > r1 -> 0; d < r0 -> c4; else (d - r1) c4 / (r0 - r1)
//   the game: E5 = energy_per_blastwave (damage.set, 5) x E; threshold (the game) = the area's blast value, else its
//     koef x T, else T / 1.5, T = GetThickness(true) (side thickness, area first; a ray-cast area: the least of the volume's bounds
//     x 1/20 x 1000 x steelEquivalent) x armour scale x difficulty armour; a blast takes T as it is (no overmatch or other factor);
//     kept = min(E5, threshold); pierced = E5 >= threshold and the area does not disable damage
// (targets with energy, by time = distance / 15 m/s): a part already hit by this blast is skipped; pierced ->
//     blast_wreaked, whose vanilla reaction vehicle_health_damage_blast drains the part
//     (E5 - threshold) x the unit's {perks {blastwave_modifier}} (default 1), hp then hp_broken, as a pierce does
//   run(x, targets, point, { energy, inner, outer }, ground) -> { energy, inner, outer, point, hits [{ volume, part, side, energy, e5,
//     thickness, threshold, pierced, delay, hp }], skipped [{ volume, part }], reached, epb, modifier }
// Author: Imperator_Aug (ARSENAL, ia-4138e7ba)
'use strict';
const trace = require('../lib/model/trace');
const B = require('./blast');
const UPM = 20, SPEED = 15;
const lc = s => String(s == null ? '' : s).toLowerCase();
const r2 = n => Math.round(n * 100) / 100;
const r3 = n => Math.round(n * 1000) / 1000;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const along = (o, d, t) => [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t];
const SIDES = ['front', 'top', 'left', 'right', 'rear', 'bottom'];
const G = () => require('./goh');

// the shape's bounds size in its own frame (shape->bounds)
function sizeOf(shape) {
  if (!shape) return [0, 0, 0];
  if (shape.size) return shape.size.slice(0, 3);
  if (shape.triangles && shape.triangles.length >= 3) {
    const t = shape.triangles, lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i + 2 < t.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], t[i + k]); hi[k] = Math.max(hi[k], t[i + k]); }
    return [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
  }
  if (shape.length !== undefined) return [2 * shape.radius, 2 * shape.radius, shape.length];
  if (shape.radius !== undefined) return [2 * shape.radius, 2 * shape.radius, 2 * shape.radius];
  return [0, 0, 0];
}
// TouchesSegment
function touches(shape, start, end, dir, len) {
  const m = shape.matrix || [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], center = [m[9], m[10], m[11]], axis = [m[0], m[1], m[2]];
  const s = sizeOf(shape), half = [s[0] / 2, s[1] / 2, s[2] / 2], radiusSq = dot(half, half) * dot(axis, axis);
  const a = dot(sub(center, start), dir), near = a < 0 ? start : a > len ? end : along(start, dir, a), off = sub(near, center);
  return radiusSq > dot(off, off);
}
// the volumes a blast may meet: { list [{ id, name, shape }], off [{ volume, why }] }
function targetsOf(x) {
  const ab = B.blastAbles({ armor: { model: x.model, key: x.V.def, volumes: (x.A && x.A.volumes) || {} }, src: x.src });
  const list = [], off = [];
  for (const v of x.ctx.all || []) {
    const a = ab.get(lc(v.name));
    if (a && !a.blast) off.push({ volume: v.name, why: a.why });
    else list.push(v);
  }
  return { list, off };
}
// GetThickness(true) x armour scale x difficulty armour, and the area of the volume
function plateOf(x, t, side) {
  const g = G(), vol = g.volOf(x, t.name), area = g.areaFor(x.A, t.name), sd = SIDES[side < 0 ? 0 : side] || 'front';
  let th;
  if (area && area.flags && area.flags.rayCastThickness) {
    const s = sizeOf(t.shape), m = g.matOf(x, {}, t.name), se = m.rec && m.rec.steelEquivalent != null ? m.rec.steelEquivalent : 1;
    th = { T: Math.min(s[0], Math.min(s[1], s[2])) / UPM * 1000 * se * (x.k ? x.k.mul : 1), rule: 'raycast' };
  } else th = g.thickness(vol.sides, area, sd, null, x.k ? x.k.mul : 1);
  return { vol, area, side: sd, T: th.T || 0, rule: th.rule };
}
// with (a blast's T_eff = T; its shot carries no penetration: T / 1.5)
function applyBlast(x, t, side, E) {
  const p = plateOf(x, t, side), tb = (p.area && p.area.threshold && p.area.threshold.blast) || {};
  const thr = tb.value ? tb.value : tb.koef ? Math.max(tb.koef, 1e-5) * p.T : p.T / 1.5;
  const e5 = x.V.sets.epb * E;
  return Object.assign(p, { thr, e5, kept: Math.min(e5, thr), pierced: e5 >= thr && !(p.area && p.area.flags && p.area.flags.disableDamageAcc) });
}

function run(x, targets, point, desc, ground) {
  const P = point.slice(0, 3).map(Number), c4 = +desc.energy || 0, r0 = (+desc.inner || 0) * UPM, r1 = (+desc.outer || 0) * UPM;
  const epb = x.V.sets.epb, power = d => (d > r1 ? 0 : d < r0 ? c4 : (d - r1) * c4 / (r0 - r1));
  const T = targets.list.map(v => { const n = B.nearest(v.shape, P); return { id: v.id, name: v.name, shape: v.shape, aim: n.inside ? P.slice() : n.point, inside: n.inside, E: 0, side: -1, hitPoint: [0, 0, 0], dir: [0, 0, 1] }; });
  const g = typeof ground === 'number' && Number.isFinite(ground) ? ground : null;
  for (let i = T.length - 1; i >= 0; i--) {
    const end = T[i].aim;
    let dir = sub(end, P);
    const len = Math.hypot(dir[0], dir[1], dir[2]);
    if (len > 1e-5) {
      dir = dir.map(c => c / len);
      if (g != null && Math.min(P[2], end[2]) + 1 < g) continue;   // the ground between them (a flat ground here) [I]
    } else dir = [0, 0, 1];
    const hits = [];
    for (let j = T.length - 1; j >= 0; j--) {
      if (!T[j].inside && !touches(T[j].shape, P, end, dir, len)) continue;
      const r = trace.rayShape({ origin: P, dir }, T[j].shape);
      if (!r) continue;
      hits.push(r.inside ? { d: r.tOut, side: r.sideOut, t: T[j] } : { d: r.tIn, side: r.sideIn, t: T[j] });
    }
    hits.sort((a, b) => a.d - b.d);
    let absorbed = 0;
    for (const h of hits) {
      const E = power(h.d) - absorbed;
      if (!(E > 0)) break;
      const t = h.t;
      if (E > t.E) { t.E = E; t.dir = dir; t.hitPoint = along(P, dir, h.d); t.side = h.side == null ? -1 : h.side; }
      absorbed += applyBlast(x, t, t.side, E).kept / epb;
    }
  }
  const reached = T.filter(t => t.E > 0).map((t, k) => Object.assign(t, { dist: Math.hypot(...sub(t.hitPoint, P)), k }));
  reached.sort((a, b) => a.dist - b.dist || a.k - b.k);   // CompareTargetTimes (ties: volume order [I])
  const parts = new Set(), hits = [], skipped = [], bw = x.V.perks.blastwaveModifier == null ? 1 : x.V.perks.blastwaveModifier;
  for (const t of reached) {
    const vol = G().volOf(x, t.name), part = vol.component ? lc(vol.component) : null;
    if (part) { if (parts.has(part)) { skipped.push({ volume: t.name, part }); continue; } parts.add(part); }
    const a = applyBlast(x, t, t.side, t.E);
    const hit = { volume: t.name, part, side: a.side, energy: r3(t.E), e5: r2(a.e5), thickness: r2(a.T), rule: a.rule, threshold: r2(a.thr), pierced: a.pierced,
      delay: r3(t.dist / UPM / SPEED) };
    if (a.pierced && part) {
      const loss = (a.e5 - a.thr) * bw;
      if (loss > 0) { const h = G().partHp(x.V, vol, null, 0, x.k ? x.k.vehicleHealth : 1, { loss }); hit.hp = h.refused ? { refused: true, code: h.code } : { part: h.part, loss: h.loss, state: h.state, hp: h.hp, after: h.after }; }
    }
    hits.push(hit);
  }
  return { energy: c4, inner: +desc.inner || 0, outer: +desc.outer || 0, point: P.map(r2), epb, modifier: bw, hits, skipped, off: targets.off.map(o => o.volume), reached: reached.length };
}

module.exports = { run, targetsOf, touches, sizeOf, UPM, SPEED };

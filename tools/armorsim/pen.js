// armorsim/pen: what the engine decides when a shell meets an armour volume, as pure functions (no IO, no dice).
// Mirrors (penetration) and (the game, Move, Update).
// Units: thickness and penetration in mm of steel, range in metres, angles in degrees from the plate normal
// (0 = square-on), tables as [[x, y], ...] in the units the data writes (overmatch/ricochet tables keyed by degrees).
// Rules with their engine lines and tags: tools/armorsim/RULES.md.
//
// Plain-data shapes
//   Shell (armordata.shell() returns it; every field optional except where said)
//     { calibre (mm, the WEAPON's), table [[m, mm]] | null, projectileDamage, projectileDamageClip (default 1e38),
//       curve { name, points [[range/aimRange, factor]] } | null, aimRange (m), projectileDamageThreshold (0 = unset),
//       overmatchDamping [[deg, scale]], ricochetEnergyDamping [[deg grazing, factor]], detonationThickness (mm,
//       default 1e38), applyProjectile, cumulative (m, HEAT jet reach past the first hit), noRicochet (ammo tag fg /
//       no_ricochet or weapon DisableRicochet) }
//   Area (armordata vehicleArmor().areas[i]; null = no area covers the volume)
//     { name, thickness { front, side, rear, top }, threshold { pierce { value, koef }, calibre },
//       durability { pierce { value, koef } }, flags { wholeWound, rayCastThickness, disableDamageAcc } }
//   Material (armordata.materials()[name]) { durabilityPierce, steelEquivalent, ricochet { chance [[deg grazing, p]],
//       velocityDumping } }
//   Hit (one face the ray crosses, as trace.js gives it, in ray order)
//     { volumeId ('<bone path>/<volume name>' or a bare name), side (0..5 engine index or a side name; -1/undefined =
//       front), angleDeg, enter (default true; false or kind 'exit' = the exit face)
//       thickness (nominal mm; else looked up in opts.armor), distanceM (along the ray, for HEAT reach),
//       pathLengthUnits (ray_cast_thickness areas), area, material, integrity (1 - wound damage, default 1) }
//
// Exports
//   CVARS                                   console variable defaults the formulas read
//   SIDES, sideIndex(s), sideName(i) engine side numbering
//   tableGet(points, x) (key): linear, clamped both ends
//   tableGetStrict(points, x) -> y | null (key,&v): null past the last point
//   slope(angleDeg, cv) -> { cosine, damageScale }
//   overmatchScale(shell, cosine) -> number
//   nominalThickness({ own, area, side, rayCast, armorScale, armorFactor }) -> mm
//   effectiveThickness(thickness, { calibre, damageScale, overmatchScale, blast }, cv) -> mm
//   penetrationAt(shell, rangeM) -> mm
//   threshold(eff, area, shell) -> mm (pierce)
//   durability(thickness, area, material, armorFactor) -> number (pierce)
//   armorDamage(absorbed, eff, thr, durEff, cv) -> share of the area's integrity
//   plate(shot, hit, opts) -> Verdict +
//   ricochetChance(material, angleDeg, ricochets, shell, cv) -> p
//   resolveShot(shell, rangeM, hits, opts) -> { penetration, verdicts[], stoppedAt, outcome, energyScale }
//   Verdict { volumeId, side, sideName, enter, angleDeg, result, nominal, effective, penetration, absorbed, residual,
//     energyScale, damageScale, overmatch { ratio, scale, factor }, threshold, armorDamage, broken, pierceEvent,
//     wound, chance, note }
//     result: 'penetrate' (HIT_SPENT: flies on) | 'ricochet' (the game: chance = p it bounces, else it bursts
//     there) | 'no_penetration' (the game without a pass) | 'detonate' (passed but the fuze stops it:
//     absorbed >= detonationThickness) | 'missed' (spent shell, damage < 1e-5) | 'beyond_jet' (HEAT reach over)
// Author: Imperator_Aug (ARSENAL, ia-9528c2b5)
'use strict';

// , (g_energyperprojective 1: no unit change)
const CVARS = Object.freeze({ bulletSlopeMax: 10, bulletOvermatchMin: 0.2, bulletOvermatchMax: 1.0, minAccStrength: 0.5, maximumRicochets: 2 });
const SIDES = Object.freeze(['front', 'top', 'left', 'right', 'rear', 'bottom']);   //
const DEG = Math.PI / 180;

function sideIndex(s) {
  if (s === undefined || s === null || s === -1) return 0;   // GetThickness: side -1 -> SIDE_FRONT (:90)
  if (typeof s === 'number') return s >= 0 && s < 6 ? s | 0 : 0;
  const n = String(s).toLowerCase();
  const i = SIDES.indexOf(n === 'back' ? 'rear' : n);
  return i < 0 ? 0 : i;
}
const sideName = i => SIDES[sideIndex(i)];

// (float key): empty 0, one point its value, clamped outside, linear between
function tableGet(points, x) {
  if (!points || !points.length) return 0;
  if (points.length === 1) return points[0][1];
  if (x <= points[0][0]) return points[0][1];
  const last = points[points.length - 1];
  if (x >= last[0]) return last[1];
  let prev = points[0];
  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    if (p[0] >= x) return (x - prev[0]) / (p[0] - prev[0]) * (p[1] - prev[1]) + prev[1];
    prev = p;
  }
  return 0;
}

// (float key, float* value): key raised to the first point's; false (null) past the last point
function tableGetStrict(points, x) {
  if (!points || !points.length) return null;
  if (points.length === 1) return points[0][1];
  if (x < points[0][0]) x = points[0][0];
  let prev = points[0], i = 0;
  for (; i < points.length; i++) { if (points[i][0] >= x) break; prev = points[i]; }
  if (i === points.length) return null;
  const p = points[i];
  if (prev === p) return p[1];
  return (x - prev[0]) / (p[0] - prev[0]) * (p[1] - prev[1]) + prev[1];
}

// angle from the face normal; cosine floored 0.01, slope capped g_bulletSlopeMax
function slope(angleDeg, cv = CVARS) {
  const cosine = Math.max(Math.abs(Math.cos((angleDeg || 0) * DEG)), 0.01);
  return { cosine, damageScale: Math.min(1 / cosine, cv.bulletSlopeMax) };
}

// OvermatchDamping looked up at ACos(cosine); past the last angle -> 1.0 (DMG-04)
function overmatchScale(shell, cosine) {
  const t = shell && shell.overmatchDamping;
  const v = tableGetStrict(t, Math.acos(Math.min(1, cosine)) / DEG);
  return v === null ? 1 : v;
}

// own = the volume's per-side {thickness}; area value for that side wins when
// nonzero (left/right -> side, top/bottom -> top); ray_cast_thickness = path length x steelEquivalent x 1000
function nominalThickness(o) {
  const side = sideIndex(o.side);
  const own = Array.isArray(o.own) ? (o.own[side] || 0) : (+o.own || 0);
  let t = own;
  const a = o.area;
  if (a) {
    if (a.flags && a.flags.rayCastThickness) {
      const r = o.rayCast || {};
      t = r.pathLengthUnits === undefined ? own : (r.pathLengthUnits / 20) * (r.steelEquivalent === undefined ? 1 : r.steelEquivalent) * 1000;
    } else if (a.thickness) {
      const th = a.thickness;
      const v = side === 0 ? th.front : (side === 2 || side === 3) ? th.side : side === 4 ? th.rear : th.top;
      if (v) t = v;
    }
  }
  return (o.armorScale === undefined ? 1 : o.armorScale) * t * (o.armorFactor === undefined ? 1 : o.armorFactor);
}

function effectiveThickness(thickness, s, cv = CVARS) {
  if (s.blast) return thickness;
  if (!thickness) return 0;                                   // 0 mm stays 0 (0/0 calibre guard; engine float would NaN)
  const om = thickness / (s.calibre || 0) * (s.overmatchScale === undefined ? 1 : s.overmatchScale);
  const f = Math.min(Math.max(om, cv.bulletOvermatchMin), cv.bulletOvermatchMax);
  return ((s.damageScale - 1) * f + 1) * thickness;
}

// table (metres) wins; else projectileDamage x curve(range/aimRange)
function penetrationAt(shell, rangeM) {
  if (shell.table && shell.table.length) return tableGet(shell.table, rangeM);
  const pts = shell.curve && shell.curve.points;
  const frac = tableGet(pts, rangeM / (shell.aimRange || 0));
  const pd = shell.projectileDamage || 0;
  if (Math.abs(pd) < 1e-5) return frac;
  const scaled = pd * frac, clip = shell.projectileDamageClip === undefined ? 1e38 : shell.projectileDamageClip;
  return clip >= scaled ? scaled : clip;
}

// (pierce): value; else koef x eff; else eff / projectileDamageThreshold; else 2/3 eff
function threshold(eff, area, shell) {
  const p = (area && area.threshold && area.threshold.pierce) || {};
  let value = p.value || 0;
  if (value === 0) {
    if (p.koef) value = Math.max(p.koef, 1e-5) * eff;
    else if (shell && shell.projectileDamageThreshold) value = eff / Math.max(shell.projectileDamageThreshold, 1e-5);
    else value = eff * (2 / 3);
  }
  return value;
}

// (pierce): value x armorFactor; else koef x thickness; else thickness x material
function durability(thickness, area, material, armorFactor = 1) {
  const d = (area && area.durability && area.durability.pierce) || {};
  if (d.value) return armorFactor * d.value;
  if (d.koef) return d.koef * thickness;
  const base = material && material.durabilityPierce !== undefined ? material.durabilityPierce : 1;
  return base ? thickness * base : thickness;
}

// (pierce); durEff = GetEffectiveThickness(GetDurability)
function armorDamage(absorbed, eff, thr, durEff, cv = CVARS) {
  return Math.max((absorbed - thr) * eff / Math.max(eff - thr, 0.001), cv.minAccStrength * eff) / durEff;
}

// grazing angle = 90 - angle; material chance table (degrees);
// none when the gun has DisableRicochet, the bullet already ricocheted g_maximumRicochets times, no material/entry
function ricochetChance(material, angleDeg, ricochets = 0, shell = {}, cv = CVARS) {
  if (shell.disableRicochet || ricochets >= cv.maximumRicochets) return 0;
  const t = material && material.ricochet && material.ricochet.chance;
  if (!t) return material ? 0 : null;                          // null = unknown (no material given)
  const cosine = Math.min(Math.max(Math.abs(Math.cos((angleDeg || 0) * DEG)), 0), 1);
  const grazing = 90 - Math.acos(cosine) / DEG;
  const p = tableGetStrict(t, grazing);
  return p === null ? 0 : Math.min(Math.max(p, 0), 1);
}

// One face:, then.
// shot { energy (mm now = penetrationAt x energyScale), energyScale (energy, default 1), shell, harmful (default
// true), firstStep (distance == 0), ricochets }
function plate(shot, hit, opts = {}) {
  const cv = opts.cvars || CVARS, shell = shot.shell || {};
  const side = sideIndex(hit.side), enter = hit.enter !== false && hit.kind !== 'exit';
  const area = hit.area || null, flags = (area && area.flags) || {};
  const energy = shot.energy, scale = shot.energyScale === undefined ? 1 : shot.energyScale;
  const v = { volumeId: hit.volumeId, side, sideName: SIDES[side], enter, angleDeg: hit.angleDeg || 0, result: null,
    nominal: 0, effective: 0, penetration: energy, absorbed: 0, residual: energy, energyScale: scale, damageScale: 1,
    overmatch: null, threshold: null, armorDamage: 0, broken: false, pierceEvent: false, wound: false, chance: null, note: '' };
  if (energy < 1e-5) { v.result = 'missed'; v.note = 'spent shell (damage < 1e-5)'; return v; }
  const sl = slope(hit.angleDeg, cv);
  let damageScale = sl.damageScale;
  const oms = overmatchScale(shell, sl.cosine);
  const T = hit.thickness !== undefined ? hit.thickness
    : nominalThickness({ own: hit.own, area, side, rayCast: { pathLengthUnits: hit.pathLengthUnits, steelEquivalent: hit.material && hit.material.steelEquivalent }, armorScale: opts.armorScale, armorFactor: opts.armorFactor });
  v.nominal = T;
  if (!enter && flags.rayCastThickness) { v.result = 'penetrate'; v.note = 'ray_cast_thickness exit face: not tested'; return v; }
  if (flags.wholeWound || flags.rayCastThickness) damageScale = 1;   //
  v.damageScale = damageScale;
  const sh = { calibre: shell.calibre || 0, damageScale, overmatchScale: oms };
  const eff = effectiveThickness(T, sh, cv);
  v.effective = eff;
  v.overmatch = { ratio: T / (sh.calibre || 0), scale: oms, factor: Math.min(Math.max(T / (sh.calibre || 0) * oms, cv.bulletOvermatchMin), cv.bulletOvermatchMax) };
  let pierced = false, passed = false, broken = false, absorbed;
  if (shot.harmful === false) {
    absorbed = energy;                                           // energy kept, nothing pierced
  } else {
    if (energy >= eff) pierced = passed = true;                  //
    absorbed = Math.min(eff, energy);                            // SetMin(armor, energy)
    const thrCal = (area && area.threshold && area.threshold.calibre) || 0;
    if (thrCal === 0 || sh.calibre >= thrCal) {                  //
      const thr = threshold(eff, area, shell);
      v.threshold = thr;
      if (energy >= thr && !flags.disableDamageAcc) {
        pierced = true;
        const durEff = effectiveThickness(durability(T, area, hit.material, opts.armorFactor), sh, cv);
        const dmg = armorDamage(absorbed, eff, thr, durEff, cv);
        if (dmg + 1e-5 >= (hit.integrity === undefined ? 1 : hit.integrity)) broken = true;
        v.armorDamage = dmg;
      }
    }
  }
  v.absorbed = absorbed;
  v.broken = broken;
  const detTh = shell.detonationThickness === undefined || shell.detonationThickness === null ? 1e38 : shell.detonationThickness;
  const stopped = absorbed >= detTh;                             //
  let res = 'DETONATED';
  if (pierced) {                                                 //
    res = passed ? 'SPENT' : 'DETONATED';
    if (stopped) {
      v.wound = !!shell.applyProjectile;
      res = 'DETONATED';
      if (passed) { v.result = 'detonate'; v.note = 'fuze: absorbed ' + r2(absorbed) + ' >= detonationThickness ' + detTh + ' (no pierce event)'; v.residual = 0; return v; }
    } else if (enter || shot.firstStep) {
      v.pierceEvent = passed;
      v.wound = true;
      let e = scale - absorbed / energy;                         // energy -= absorbed / damage
      e = Math.min(Math.max(e, 0), 1);
      v.energyScale = e;
      if (broken) {                                              // BreakArmor; returns without a ricochet
        v.note = 'area broken (break_armor)';
        if (res === 'SPENT') { v.result = 'penetrate'; v.residual = (energy / scale) * e; return v; }
        v.result = 'no_penetration'; v.residual = 0; return v;
      }
    }
    if (res !== 'DETONATED') {
      v.result = 'penetrate';
      v.residual = enter || shot.firstStep ? (energy / scale) * v.energyScale : energy;
      return v;
    }
  }
  v.residual = 0;
  if (!shell.noRicochet) {                                       //
    v.result = 'ricochet';
    v.chance = ricochetChance(hit.material || null, hit.angleDeg, shot.ricochets || 0, shell, cv);
    if (v.chance === 0) { v.result = 'no_penetration'; v.note = 'ricochet not possible here (material table / limit): detonates'; }
  } else {
    v.result = 'no_penetration';
    v.chance = 0;
  }
  return v;
}
const r2 = x => Math.round(x * 100) / 100;

// Walks the ordered hits of one ray. opts { armor (armordata.vehicleArmor result, for thickness/area/material by
// volume name), materials (name -> Material), cvars, armorScale, armorFactor, harmful, ricochets, firstStep }
function resolveShot(shell, rangeM, hits, opts = {}) {
  const pen = penetrationAt(shell, rangeM);
  const verdicts = [];
  let scale = 1, firstHitM = null, stoppedAt = null, outcome = 'passed_all';
  for (let i = 0; i < hits.length; i++) {
    const h = Object.assign({}, hits[i]);
    if (shell.cumulative > 0 && h.distanceM !== undefined) {   // jet reach from the first hit
      if (firstHitM === null) firstHitM = h.distanceM;
      else if (h.distanceM > firstHitM + shell.cumulative) {
        verdicts.push({ volumeId: h.volumeId, side: sideIndex(h.side), sideName: sideName(h.side), enter: h.enter !== false && h.kind !== 'exit', angleDeg: h.angleDeg || 0,
          result: 'beyond_jet', nominal: 0, effective: 0, penetration: 0, absorbed: 0, residual: 0, energyScale: scale, note: 'past cumulative reach ' + shell.cumulative + ' m' });
        stoppedAt = i; outcome = 'beyond_jet'; break;
      }
    }
    fillFromArmor(h, opts);
    const v = plate({ energy: pen * scale, energyScale: scale, shell, harmful: opts.harmful, firstStep: opts.firstStep, ricochets: opts.ricochets }, h, opts);
    verdicts.push(v);
    if (v.result !== 'penetrate') { stoppedAt = i; outcome = v.result; break; }
    scale = v.energyScale;
  }
  return { penetration: pen, verdicts, stoppedAt, outcome, energyScale: scale };
}

// thickness / area / material of a hit from a vehicleArmor() result when the hit does not carry them
function fillFromArmor(h, opts) {
  const A = opts.armor;
  const name = String(h.volumeId || '').split('/').pop().toLowerCase();
  const vol = A && A.volumes && (A.volumes[name] || Object.entries(A.volumes).find(([k]) => k.toLowerCase() === name)?.[1]);
  if (h.area === undefined && vol && A.areas) h.area = A.areas.find(a => a.name === vol.area) || null;
  if (h.thickness === undefined && h.own === undefined && vol) h.own = vol.sides;
  if (h.material === undefined && opts.materials) {
    const m = (vol && vol.material) || (A && A.defaultMaterial);
    if (m && opts.materials[m]) h.material = opts.materials[m];
  }
}

module.exports = { CVARS, SIDES, sideIndex, sideName, tableGet, tableGetStrict, slope, overmatchScale, nominalThickness,
  effectiveThickness, penetrationAt, threshold, durability, armorDamage, plate, ricochetChance, resolveShot, fillFromArmor };

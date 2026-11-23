// strong ensemble (MV-STR): 8 seeded runs on the refined set (rules.md 6.4 ensemble, design 6 uncertainty): my ground
// +-0.1 m, sight +-1 level (target heights +-stepU), travel speeds +-10% for each side. Drown depths +-10% move the
// tank gate only; the gate stays that of the main run [I: the refined set already passed it]. Each candidate gets the
// median and the spread (max - min) of its score.
// Author: Imperator_Aug (ARSENAL, ia-7f395c82)
'use strict';
const F = require('./frame');
const FX = require('./factors');

const JIT = { heightM: 0.1, sightLevels: 1, speedPct: 10, drownPct: 10 };

function jitters(seed, runs, stepU) {
  const out = [];
  for (let r = 0; r < runs; r++) {
    const u = k => F.hash(seed, r, k, 97) * 2 - 1;
    out.push({ dz: u(1) * JIT.heightM * F.UPM, dzT: Math.round(u(2) * JIT.sightLevels) * stepU, speedS: 1 + u(3) * JIT.speedPct / 100,
      speedE: 1 + u(4) * JIT.speedPct / 100 });
  }
  return out;
}

function run(ctx, list, runs, weights, APPLIES) {
  // no ensemble (runs 0): the median is the main run's score, the spread 0
  if (!(runs >= 1)) { for (const c of list) { c.median = c.score; c.spread = 0; } return; }
  const js = jitters(ctx.seed + ctx.si * 1000, runs, ctx.stepU);
  for (const c of list) {
    const v = [];
    for (const j of js) {
      if (ctx.tick) ctx.tick();
      const e = FX.evaluate(ctx, c, j);
      v.push(c.gate ? FX.score(e.f, weights, ctx.kind, APPLIES) : 0);
    }
    v.sort((a, b) => a - b);
    const mid = v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
    c.median = Math.round(mid * 1000) / 1000;
    c.spread = Math.round((v[v.length - 1] - v[0]) * 1000) / 1000;
  }
}

module.exports = { run, jitters, JIT };

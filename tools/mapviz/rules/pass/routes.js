// pass routes (MV-PAS, wave C): randomised least-time routes from each spawn of a side to its targets (wave C rules
// draft 5.2, 5.3; design 5.2).
//   routes(doc, mv, tA, tB, o) -> {items, density:{a, b}, noRoute:[{side, from, to}], pairs:{a, b}, phase}
//     phase = the resolved phase (speed.resolvePhase: o.phase, else the lowest of the mode; null when it has none), also
//     in density meta.phase
//     mv = {move, mcost?, gtype} on the move frame (or o.fold, a travel fold); tA, tB = travel.a/b grids (a target whose
//     cell they mark -1 has no route, no search is run); o {mode, phase, unit, seed, k: 8, tick, prof, speed, target}
//     o.prof and o.speed are needed to time a step (the same fold as travel)
//   targets = the mode's flags of the side's phase, else the enemy spawns. Per (target, k) one search from the target
//   (step times are symmetric) that stops when every spawn of the side is settled. k 0 = the plain least-time path;
//   k 1..7 multiply each cell's step time by 1 + value noise (lattice of 16 travel cells, hash of seed, k and the
//   lattice point; no Math.random) [ruling]. seconds and lengthM are of the plain step times along the path.
//   pts: spawn position, cell centres, target position, simplified to 0.5 m deviation (Douglas-Peucker, 10 u).
//   density: share of the side's routes that visit the cell x 250, rounded (u8 on the travel frame).
// Author: Imperator_Aug (ARSENAL, ia-ef4a19e3)
'use strict';

const TV = require('./travel');
const UPM = 20;
const NOISE_CELLS = 16;
const SIMPLIFY_U = 10;
const r2 = v => Math.round(v * 100) / 100;

function hash32(a, b, c, d) {
  let h = 0x811c9dc5 ^ (a | 0);
  for (const v of [b, c, d]) { h = Math.imul(h ^ (v | 0), 0x01000193); h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; }
  h = Math.imul(h ^ (h >>> 16), 0x297a2d39); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

function noiseField(fr, seed, k) {
  const n = fr.w * fr.h, out = new Float32Array(n);
  for (let j = 0; j < fr.h; j++) {
    const gy = j / NOISE_CELLS, y0 = Math.floor(gy), ty = gy - y0;
    for (let i = 0; i < fr.w; i++) {
      const gx = i / NOISE_CELLS, x0 = Math.floor(gx), tx = gx - x0;
      const a = hash32(seed, k, x0, y0), b = hash32(seed, k, x0 + 1, y0), c = hash32(seed, k, x0, y0 + 1), d = hash32(seed, k, x0 + 1, y0 + 1);
      const v = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
      out[j * fr.w + i] = 1 + v;
    }
  }
  return out;
}

function simplify(pts, tol) {
  if (pts.length <= 2) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = 1; keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const A = pts[a], B = pts[b];
    const dx = B[0] - A[0], dy = B[1] - A[1], L = Math.sqrt(dx * dx + dy * dy);
    let best = -1, bi = -1;
    for (let i = a + 1; i < b; i++) {
      const P = pts[i];
      const d = L > 0 ? Math.abs(dy * (P[0] - A[0]) - dx * (P[1] - A[1])) / L : Math.hypot(P[0] - A[0], P[1] - A[1]);
      if (d > best) { best = d; bi = i; }
    }
    if (best > tol) { keep[bi] = 1; stack.push([a, bi], [bi, b]); }
  }
  return pts.filter((p, i) => keep[i]);
}

function routes(doc, mv, tA, tB, o) {
  o = o || {};
  const S = require('./speed');
  const F = o.fold || TV.fold(mv, o.prof, o.speed, { target: o.target });
  const fr = F.fr, n = fr.w * fr.h, stepM = fr.cell / UPM;
  const K = Number.isInteger(o.k) && o.k > 0 ? o.k : 8;
  const seed = Number.isFinite(o.seed) ? Math.trunc(o.seed) : 1;
  const unit = o.unit || null;
  const T = { a: tA || null, b: tB || null };
  for (const s of ['a', 'b']) {
    const t = T[s];
    if (t && (t.w !== fr.w || t.h !== fr.h || t.cell !== fr.cell || t.ox !== fr.ox || t.oy !== fr.oy)) {
      const M = require('../../mapviz');
      throw new M.MvError('MV_USAGE', 'pass routes: travel.' + s + ' is not on the travel frame', { code: 'PASS_GRID', grid: 'travel.' + s });
    }
  }
  // one resolved phase (late R3, ruling R-f) for both sides, the flags and the clips; written to the products
  const phase = S.resolvePhase(doc, o.mode, o.phase === undefined ? null : o.phase);
  const plan = [];
  for (const side of ['a', 'b']) {
    const other = side === 'a' ? 'b' : 'a';
    const sp = S.spawnsOf(doc, o.mode, side, phase);
    let targets = S.flagsOf(doc, o.mode, phase).map(f => Object.assign({ type: 'flag' }, f));
    if (!targets.length) targets = S.spawnsOf(doc, o.mode, other, phase).map(f => Object.assign({ type: 'spawn' }, f));
    const block = TV.boxMask(fr, S.activeBox(doc, o.mode, side, phase));
    plan.push({ side, spawns: sp, targets, block });
  }
  const total = plan.reduce((a, p) => a + p.targets.length * K, 0) || 1;
  const tick = typeof o.tick === 'function' ? o.tick : null;
  let doneN = 0;
  const noises = [];
  for (let k = 1; k < K; k++) noises[k] = noiseField(fr, seed, k);
  const items = [], noRoute = [];
  const dens = { a: new Uint16Array(n), b: new Uint16Array(n) };
  const nRoutes = { a: 0, b: 0 }, pairs = { a: 0, b: 0 };
  const visit = new Int32Array(n).fill(-1);
  let routeId = 0;
  for (const P of plan) {
    const spCells = P.spawns.map(s => TV.cellOf(fr, s.x, s.y));
    for (const tg of P.targets) {
      const tc = TV.cellOf(fr, tg.x, tg.y);
      const ok = P.spawns.map((s, i) => spCells[i] >= 0);
      pairs[P.side] += P.spawns.length;
      const tt = T[P.side];
      const unreach = tc < 0 || (tt && !(tt.data[tc] >= 0));
      if (unreach) {
        for (const s of P.spawns) noRoute.push({ side: P.side, from: s.name, to: tg.name });
        doneN += K;
        if (tick) tick(doneN, total);
        continue;
      }
      const lost = new Set();
      for (let k = 0; k < K; k++) {
        const stop = spCells.filter(c => c >= 0);
        const res = TV.search(F, [tc], { block: P.block, noise: k ? noises[k] : null, stop });
        P.spawns.forEach((s, si) => {
          const c0 = spCells[si];
          if (!ok[si] || res.dist[c0] === Infinity) { lost.add(s.name); return; }
          // walk from the spawn back to the target
          const cells = [];
          let c = c0, guard = 0;
          while (c >= 0 && guard++ <= n) { cells.push(c); if (c === tc) break; c = res.prev[c]; }
          let sec = 0, len = 0, wat = false, sw = false, obj = false;
          const id = routeId++;
          for (let q = 0; q < cells.length; q++) {
            const a = cells[q];
            const fl = F.flags[a];
            if (fl & 1) wat = true;
            if (fl & 2) sw = true;
            if (fl & 4) obj = true;
            if (visit[a] !== id) { visit[a] = id; dens[P.side][a]++; }
            if (q + 1 < cells.length) {
              const b = cells[q + 1];
              const diag = (a % fr.w) !== (b % fr.w) && Math.floor(a / fr.w) !== Math.floor(b / fr.w);
              const L = diag ? stepM * Math.SQRT2 : stepM;
              const ra = F.rate[a] === Infinity ? F.rate[b] : F.rate[a], rb = F.rate[b] === Infinity ? ra : F.rate[b];
              sec += L * (ra + rb) / 2;
              len += L;
            }
          }
          const raw = [[s.x, s.y]];
          for (let q = 1; q + 1 < cells.length; q++) {
            const ci = cells[q] % fr.w, cj = (cells[q] - ci) / fr.w;
            raw.push([fr.ox + (ci + 0.5) * fr.cell, fr.oy + (cj + 0.5) * fr.cell]);
          }
          raw.push([tg.x, tg.y]);
          nRoutes[P.side]++;
          items.push({ kind: 'route', side: P.side, unit, from: { type: 'spawn', name: s.name }, to: { type: tg.type, name: tg.name }, k,
            seconds: r2(sec), lengthM: r2(len), pts: simplify(raw, SIMPLIFY_U).map(p => [r2(p[0]), r2(p[1])]), cross: { water: wat, swamp: sw, object: obj } });
        });
        doneN++;
        if (tick) tick(doneN, total);
      }
      for (const nm of lost) noRoute.push({ side: P.side, from: nm, to: tg.name });
    }
  }
  const cmpS = (x, y) => (x < y ? -1 : x > y ? 1 : 0);
  items.sort((x, y) => cmpS(x.side, y.side) || cmpS(x.from.name, y.from.name) || cmpS(x.to.name, y.to.name) || x.k - y.k);
  const density = {};
  for (const side of ['a', 'b']) {
    const d = new Uint8Array(n), c = dens[side], N = nRoutes[side];
    if (N) for (let q = 0; q < n; q++) d[q] = c[q] ? Math.round(c[q] / N * 250) : 0;
    density[side] = { name: 'route.' + side + '.' + (unit || 'unit'), w: fr.w, h: fr.h, cell: fr.cell, ox: fr.ox, oy: fr.oy, etype: 'u8', sample: 'cell',
      scale: 1, offset: 0, nodata: null, meta: { routes: N, pairs: pairs[side], k: K, phase }, data: d };
  }
  if (tick) tick(total, total);
  return { items, density, noRoute, pairs, phase };
}

module.exports = { routes, simplify, noiseField, hash32, NOISE_CELLS };

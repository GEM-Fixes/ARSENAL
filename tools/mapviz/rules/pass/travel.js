// pass travel (MV-PAS, wave C): travel time fields on the travel frame (wave C rules draft 5.1, 5.3; design 5.2).
//   travelFrame(g) -> {cell, ox, oy, w, h, f}   cell T = max(net.cell, 10 u), f = T / net.cell (1, or 2 on a 5 u map)
//   fold(mv, prof, speed, o?) -> {fr, code, rate, flags}   the move frame folded onto the travel frame: per travel cell
//     the worst move code of its f x f block, rate = seconds per metre = 1 / (runMs x K) of the slowest cell (Infinity
//     when blocked), flags bit 1 water (types 3, 4, 5), 2 swamp, 4 crossable object, of any cell in the block
//     mv = {move, mcost?, gtype} on the move frame; K = the profile's ground factor of the cell's type, clamped [0, 1]
//     (an unlisted type 1, K < 1e-5 blocks); slope adds no time (ruling 10)
//   travel(mv, prof, speed, sources, o?) -> {t, counts, used}   o {name, box, tick, fold}
//     8-neighbour Dijkstra from every source cell (t 0), step time = stepM x (rate_p + rate_q) / 2, no corner cutting
//     past a blocked cell [I]; t f32 on the travel frame, nodata -1 (unreached, blocked, outside the box)
//   search(F, starts, o) -> {dist Float64Array, prev Int32Array}   (routes)
// Author: Imperator_Aug (ARSENAL, ia-9dddd43d)
'use strict';

const MV = require('./obst').MOVE;
const UPM = 20;
const TRAVEL_MIN_U = 10;
const PASSABLE = new Uint8Array(8); PASSABLE[MV.OPEN] = 1; PASSABLE[MV.SLOW] = 1; PASSABLE[MV.CROSS_OBJECT] = 1;
// worst first rank of a move code in a folded block
const RANK = [7, 0, 1, 3, 3, 3, 2, 6];
const SQ2 = Math.SQRT2;

function mvLib() { return require('../../mapviz'); }
function fail(code, msg, detail) { const M = mvLib(); return new M.MvError(code, msg, detail); }
function tables() { return require('../../lib/mapkit/tables'); }

function travelFrame(g) {
  const T = Math.max(g.cell, TRAVEL_MIN_U);
  const f = Math.round(T / g.cell);
  if (Math.abs(f * g.cell - T) > 1e-9) throw fail('MV_USAGE', 'pass travel: cell ' + g.cell + ' u does not fold onto ' + T + ' u', { code: 'PASS_GRID' });
  return { cell: T, ox: g.ox, oy: g.oy, w: Math.ceil(g.w * g.cell / T), h: Math.ceil(g.h * g.cell / T), f };
}

function checkFrame(a, b, name) {
  if (!a || !a.data) throw fail('MV_USAGE', 'pass travel: grid ' + name + ' is absent', { code: 'PASS_GRID', grid: name });
  if (a.w !== b.w || a.h !== b.h || a.cell !== b.cell || a.ox !== b.ox || a.oy !== b.oy || a.data.length !== a.w * a.h) {
    throw fail('MV_USAGE', 'pass travel: grid ' + name + ' is not on the frame of move', { code: 'PASS_GRID', grid: name });
  }
}

function kTable(prof) {
  const k = new Float64Array(256).fill(1);
  for (let t = 0; t < 16; t++) {
    const gr = prof.ground && prof.ground[t];
    let v = gr && gr.k !== null && gr.k !== undefined ? Number(gr.k) : (t === 0 ? 0 : 1);
    if (gr && gr.cost < 0) v = 0;
    v = v < 0 ? 0 : v > 1 ? 1 : v;
    k[t] = v;
  }
  return k;
}

function fold(mv, prof, speed, o) {
  o = o || {};
  const m = mv && mv.move;
  if (!m || !m.data || m.etype !== 'u8') throw fail('MV_USAGE', 'pass travel: no move grid', { code: 'PASS_GRID', grid: 'move' });
  checkFrame(mv.gtype, m, 'gtype');
  if (!speed || !(speed.runMs > 0)) throw fail('MV_USAGE', 'pass travel: no run speed', { code: 'PASS_SPEED' });
  const fr = travelFrame(m);
  const n = fr.w * fr.h;
  const code = new Uint8Array(n), rate = new Float64Array(n), flags = new Uint8Array(n);
  const K = kTable(prof);
  // type ids by name in the target's table (AS2 and GoH give these four the same ids, read by name all the same)
  const T = tables(), target = o.target || 'mowas2';
  const water = new Uint8Array(256), swamp = new Uint8Array(256);
  for (const nm of ['shallow_water', 'water', 'deep_water']) { const id = T.typeId(target, nm); if (id !== null) water[id] = 1; }
  { const id = T.typeId(target, 'swamp'); if (id !== null) swamp[id] = 1; }
  const md = m.data, gd = mv.gtype.data, f = fr.f;
  const inv = 1 / speed.runMs;
  for (let J = 0; J < fr.h; J++) {
    for (let I = 0; I < fr.w; I++) {
      let worst = -1, wc = MV.NODATA, kmin = Infinity, fl = 0, any = false;
      for (let dj = 0; dj < f; dj++) {
        const j = J * f + dj;
        if (j >= m.h) continue;
        for (let di = 0; di < f; di++) {
          const i = I * f + di;
          if (i >= m.w) continue;
          any = true;
          const k = j * m.w + i, c = md[k] > 7 ? MV.NODATA : md[k], t = gd[k];
          if (RANK[c] > worst) { worst = RANK[c]; wc = c; }
          if (K[t] < kmin) kmin = K[t];
          if (water[t]) fl |= 1;
          if (swamp[t]) fl |= 2;
          if (c === MV.CROSS_OBJECT) fl |= 4;
        }
      }
      const q = J * fr.w + I;
      code[q] = any ? wc : MV.NODATA;
      flags[q] = fl;
      rate[q] = PASSABLE[code[q]] && kmin >= 1e-5 ? inv / kmin : Infinity;
    }
  }
  return { fr, code, rate, flags };
}

// ---------------------------------------------------------------- Dijkstra (binary heap of indices, lazy deletion)
function heap(cap) {
  let ki = new Int32Array(cap), kv = new Float64Array(cap), n = 0;
  function grow() { const a = new Int32Array(ki.length * 2), b = new Float64Array(kv.length * 2); a.set(ki); b.set(kv); ki = a; kv = b; }
  return {
    get size() { return n; },
    push(i, v) {
      if (n >= ki.length) grow();
      let c = n++;
      while (c > 0) { const p = (c - 1) >> 1; if (kv[p] <= v) break; ki[c] = ki[p]; kv[c] = kv[p]; c = p; }
      ki[c] = i; kv[c] = v;
    },
    pop() {
      const top = ki[0], tv = kv[0];
      const li = ki[--n], lv = kv[n];
      let c = 0;
      for (;;) {
        let l = 2 * c + 1;
        if (l >= n) break;
        if (l + 1 < n && kv[l + 1] < kv[l]) l++;
        if (kv[l] >= lv) break;
        ki[c] = ki[l]; kv[c] = kv[l]; c = l;
      }
      ki[c] = li; kv[c] = lv;
      this.v = tv;
      return top;
    },
    v: 0,
  };
}

const DI = [1, -1, 0, 0, 1, 1, -1, -1], DJ = [0, 0, 1, -1, 1, -1, 1, -1];

// search(F, starts, o): F = fold result (+ o.block Uint8Array of extra blocked cells, o.noise Float32Array factor per
// cell, o.stop = cells whose settling ends the search when all are settled, o.tick)
function search(F, starts, o) {
  o = o || {};
  const { fr, rate } = F;
  const W = fr.w, H = fr.h, n = W * H;
  const block = o.block || null, noise = o.noise || null;
  const dist = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1);
  const done = new Uint8Array(n);
  const stepM = fr.cell / UPM;
  const r = k => (block && block[k]) ? Infinity : noise ? rate[k] * noise[k] : rate[k];
  const H0 = heap(1024);
  for (const k of starts) { if (k >= 0 && k < n && dist[k] > 0) { dist[k] = 0; H0.push(k, 0); } }
  let stopLeft = 0, stop = null;
  if (o.stop) { stop = new Uint8Array(n); for (const k of o.stop) if (k >= 0 && k < n && !stop[k]) { stop[k] = 1; stopLeft++; } }
  const tick = typeof o.tick === 'function' ? o.tick : null;
  let settled = 0, last = Date.now();
  while (H0.size) {
    const p = H0.pop(), dp = H0.v;
    if (done[p] || dp > dist[p]) continue;
    done[p] = 1;
    settled++;
    if (stop && stop[p] && --stopLeft === 0) break;
    if (tick && (settled & 4095) === 0 && Date.now() - last >= 100) { last = Date.now(); tick(settled, n); }
    const pi = p % W, pj = (p - pi) / W;
    const rp0 = r(p);
    for (let d = 0; d < 8; d++) {
      const qi = pi + DI[d], qj = pj + DJ[d];
      if (qi < 0 || qj < 0 || qi >= W || qj >= H) continue;
      const q = qj * W + qi;
      if (done[q]) continue;
      const rq = r(q);
      if (rq === Infinity) continue;
      let len = stepM;
      if (d >= 4) {
        // no corner cutting past a blocked cell [I]
        if (r(pj * W + qi) === Infinity || r(qj * W + pi) === Infinity) continue;
        len = stepM * SQ2;
      }
      const rp = rp0 === Infinity ? rq : rp0;
      const v = dp + len * (rp + rq) / 2;
      if (v < dist[q]) { dist[q] = v; prev[q] = p; H0.push(q, v); }
    }
  }
  return { dist, prev };
}

function cellOf(fr, x, y) {
  const i = Math.floor((x - fr.ox) / fr.cell), j = Math.floor((y - fr.oy) / fr.cell);
  return i < 0 || j < 0 || i >= fr.w || j >= fr.h ? -1 : j * fr.w + i;
}

function boxMask(fr, box) {
  if (!Array.isArray(box) || box.length !== 4) return null;
  const b = new Uint8Array(fr.w * fr.h);
  let any = false;
  for (let j = 0; j < fr.h; j++) {
    const cy = fr.oy + (j + 0.5) * fr.cell;
    for (let i = 0; i < fr.w; i++) {
      const cx = fr.ox + (i + 0.5) * fr.cell;
      if (cx < box[0] || cx > box[2] || cy < box[1] || cy > box[3]) { b[j * fr.w + i] = 1; any = true; }
    }
  }
  return any ? b : null;
}

function travel(mv, prof, speed, sources, o) {
  o = o || {};
  const F = o.fold || fold(mv, prof, speed, o);
  const fr = F.fr, n = fr.w * fr.h;
  const starts = [], used = [], outside = [];
  for (const s of sources || []) {
    const k = cellOf(fr, s.x, s.y);
    if (k < 0) { outside.push(s.name); continue; }
    starts.push(k); used.push(s.name);
  }
  const block = boxMask(fr, o.box);
  const res = search(F, starts, { block, tick: o.tick });
  const t = new Float32Array(n);
  let reached = 0;
  for (let k = 0; k < n; k++) {
    const d = res.dist[k];
    if (d === Infinity || (block && block[k] && d > 0)) t[k] = -1;
    else { t[k] = d; reached++; }
  }
  if (typeof o.tick === 'function') o.tick(n, n);
  const grid = { name: o.name || 'travel', w: fr.w, h: fr.h, cell: fr.cell, ox: fr.ox, oy: fr.oy, etype: 'f32', sample: 'cell', scale: 1, offset: 0,
    nodata: -1, meta: Object.assign({ spawns: used.slice(), phase: o.phase === undefined ? null : o.phase, runMs: speed.runMs, speedSource: speed.source }, o.meta || {}), data: t };
  return { t: grid, counts: { reached, unreached: n - reached, sources: used.length, outside: outside.length }, used, outside, fold: F };
}

module.exports = { TRAVEL_MIN_U, travelFrame, fold, travel, search, cellOf, boxMask, kTable, PASSABLE };

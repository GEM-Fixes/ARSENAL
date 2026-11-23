// strong candidates (MV-STR): gate G, the px layer (path nearness to flags and C), the 4 m lattice with its cheap
// pre-test, the best 40 per 50 m tile, Garrison candidates (firing places of enterable objects) and fort slots
// (doc flags[].fort; vanilla only GoH maps carry them [V mapdoc 3.2]), refine to 1 m (design 6).
// Author: Imperator_Aug (ARSENAL, ia-0ff74f39)
'use strict';
const F = require('./frame');

const LAT = 80, TILE = 1000, PER_TILE = 40, REFINE = 300, PAIR_CAP = 4000, LATTICE_CAP = 60000;
const SPAWN_U = 600;         // 30 m from an enemy spawn [I]
const AT_SLOPE_CLASS = 3;    // an AT gun is not set up on slope class >= 3 (about 15 deg and more) [I]

// gate reasons at a point (rules.md 6.2 GATE codes); [] = pass; 'ground' (off the ground mesh) is nodata, not a gate
// code. o.noMove: garrison and fort slots skip the footprint and slope tests
function gateWhy(ctx, x, y, o) {
  o = o || {};
  const why = [];
  if (!F.inBox(ctx.box, x, y)) why.push('GATE_OUTSIDE_BOX');
  const g = F.hAt(ctx.grids.height, x, y);
  if (g === null) { why.push('ground'); return why; }
  if (!o.noMove) {
    const mv = F.valAt(ctx.K.own.move, x, y);
    if (!(mv === 1 || mv === 2 || mv === 6)) why.push('GATE_FOOTPRINT');
  }
  let t = F.tAt(ctx.Ts, x, y);
  if (t === null && o.ring) {
    for (let a = 0; a < 8 && t === null; a++) t = F.tAt(ctx.Ts, x + Math.cos(a * Math.PI / 4) * o.ring, y + Math.sin(a * Math.PI / 4) * o.ring);
  }
  if (t === null) why.push('GATE_UNREACHED');
  const band = F.valAt(ctx.water.band, x, y);
  if (ctx.kind !== 'tank' && band === 2) why.push('GATE_SWIM');
  if (ctx.kind === 'mg' && band !== null && band >= 1) why.push('GATE_NO_PRONE');
  if (ctx.kind === 'tank' && ctx.drowns(x, y)) why.push('GATE_DROWN');
  if (ctx.kind === 'at' && !o.noMove) { const sc = F.valAt(ctx.grids.slopecls, x, y); if (sc !== null && sc >= AT_SLOPE_CLASS) why.push('GATE_SLOPE'); }
  for (const s of ctx.spawnsE) if (Math.hypot(s.x - x, s.y - y) <= SPAWN_U) { why.push('GATE_ENEMY_SPAWN'); break; }
  return why;
}

function gateLayer(ctx) {
  const fr = ctx.fr, L = F.layer(fr, 'strong.' + ctx.s + '.' + ctx.kind + '.gate', 0.004, {}), reasons = {};
  const pass = new Uint8Array(fr.w * fr.h);
  const wb = ctx.doc.boxes.world;
  let off = 0;
  for (let j = 0; j < fr.h; j++) for (let i = 0; i < fr.w; i++) {
    const p = F.centre(fr, i, j), k = j * fr.w + i;
    if (!F.inBox(wb, p.x, p.y)) continue;
    const why = gateWhy(ctx, p.x, p.y);
    // off ground: nodata 255, not a gate failure, not in reasons (late R4); counted as meta.offGround (README R24 form)
    if (why.includes('ground')) { off++; continue; }
    if (why.length) { L.data[k] = 0; for (const c of why) reasons[c] = (reasons[c] || 0) + 1; } else { L.data[k] = 250; pass[k] = 1; }
  }
  L.meta = { reasons };
  if (off) L.meta.offGround = off;
  ctx.gateGrid = L; ctx.gatePass = pass;
  return L;
}

// px: 1 up to R_eng by path distance, falling to 0 at 3 R_eng; blend flags (max over flags, weight 1 each) and C by the
// slider "Flags <-> Middle" (0..100, default 50: 0 = flags only)
function pxLayer(ctx, slider) {
  const fr = ctx.fr, n = fr.w * fr.h, R = require('../lib/raster');
  const cost = { name: 'pxcost', w: fr.w, h: fr.h, cell: fr.cell, ox: fr.ox, oy: fr.oy, etype: 'f32', sample: 'cell', scale: 1, offset: 0, nodata: -1, meta: {}, data: new Float32Array(n).fill(-1) };
  for (let j = 0; j < fr.h; j++) for (let i = 0; i < fr.w; i++) { const p = F.centre(fr, i, j); if (F.tAt(ctx.Ts, p.x, p.y) !== null || F.tAt(ctx.Te, p.x, p.y) !== null) cost.data[j * fr.w + i] = 1; }
  const near = d => d < 0 || !Number.isFinite(d) ? 0 : d <= ctx.R.engU ? 1 : d >= 3 * ctx.R.engU ? 0 : 1 - (d - ctx.R.engU) / (2 * ctx.R.engU);
  const field = seeds => {
    const ok = seeds.filter(s => { const k = F.cellOf(fr, s.x, s.y); return k >= 0 && cost.data[k] >= 0; });
    if (!ok.length) return null;
    return R.costField(cost, ok.map(s => [s.x, s.y])).dist.data;
  };
  const flagN = new Float32Array(n);
  let haveF = false;
  for (const fl of ctx.flags) {
    const d = field([{ x: fl.x, y: fl.y }]);
    if (!d) continue;
    haveF = true;
    for (let k = 0; k < n; k++) flagN[k] = Math.max(flagN[k], near(d[k]));
  }
  const cs = [];
  for (let k = 0; k < n; k++) if (ctx.contact[k] === 250) cs.push(F.centre(fr, k % fr.w, Math.floor(k / fr.w)));
  const dc = cs.length ? field(cs) : null;
  const a = slider === undefined ? 0.5 : slider / 100;
  const out = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const nf = flagN[k], nc = dc ? near(dc[k]) : 0;
    out[k] = haveF && dc ? (1 - a) * nf + a * nc : haveF ? nf : nc;
  }
  ctx.px = out;
  ctx.pxAt = (x, y) => { const k = F.cellOf(fr, x, y); return k < 0 ? 0 : out[k]; };
}

const LF_SCORE = { 0: 0.4, 1: 1, 2: 0.3, 3: 0.6, 4: 1, 5: 0.3 };   // landform.r50 codes (README 4.4)

// lattice candidates with the cheap pre-test, best PER_TILE per tile, then the global pair cap
function lattice(ctx) {
  const b = ctx.box ? [Math.max(ctx.box[0], ctx.doc.boxes.world[0]), Math.max(ctx.box[1], ctx.doc.boxes.world[1]),
    Math.min(ctx.box[2], ctx.doc.boxes.world[2]), Math.min(ctx.box[3], ctx.doc.boxes.world[3])] : ctx.doc.boxes.world;
  let step = LAT;
  const count = ((b[2] - b[0]) / step + 1) * ((b[3] - b[1]) / step + 1);
  if (count > LATTICE_CAP) { step = Math.ceil(LAT * Math.sqrt(count / LATTICE_CAP)); ctx.capHit('lattice spacing ' + (step / F.UPM) + ' m'); }
  const tiles = new Map();
  let n = 0, ii = 0;
  for (let y = b[1] + step / 2; y < b[3]; y += step, ii++) {
    let jj = 0;
    for (let x = b[0] + step / 2; x < b[2]; x += step, jj++) {
      const px = x + (F.hash(ctx.seed, ii, jj, 21 + ctx.si) - 0.5) * step * 0.5, py = y + (F.hash(ctx.seed, ii, jj, 31 + ctx.si) - 0.5) * step * 0.5;
      n++;
      if (gateWhy(ctx, px, py).length) continue;
      const k = F.cellOf(ctx.fr, px, py);
      const lf = F.valAt(ctx.grids.landform, px, py);
      const ht = k >= 0 && Number.isFinite(ctx.heat[k]) ? ctx.heat[k] : 0;
      const pre = 0.4 * ctx.pxAt(px, py) + 0.3 * (lf === null ? 0.4 : (LF_SCORE[lf] || 0.4)) + 0.3 * (1 - ht);
      const key = Math.floor((px - b[0]) / TILE) + ',' + Math.floor((py - b[1]) / TILE);
      if (!tiles.has(key)) tiles.set(key, []);
      tiles.get(key).push({ x: Math.round(px * 100) / 100, y: Math.round(py * 100) / 100, pre, src: 'lattice', uid: null });
    }
  }
  let out = [];
  for (const key of [...tiles.keys()].sort()) {
    const t = tiles.get(key).sort((p, q) => q.pre - p.pre || p.x - q.x || p.y - q.y);
    out = out.concat(t.slice(0, PER_TILE));
  }
  if (out.length > PAIR_CAP) { out.sort((p, q) => q.pre - p.pre || p.x - q.x || p.y - q.y); out = out.slice(0, PAIR_CAP); ctx.capHit('per-pair factors on ' + PAIR_CAP + ' candidates'); }
  ctx.caps.lattice = Math.max(ctx.caps.lattice || 0, n);
  return out;
}

// Garrison: one candidate per enterable object with firing places (entcat enterable.ports), at its footprint centre
// [I: entcat keeps no x, y of a port bone]; fort: every fort slot of the flags of the phase
function extras(ctx) {
  const out = [];
  const ents = (ctx.catalog && ctx.catalog.entries) || {};
  const unl = new Set((ctx.doc.entities || []).filter(e => e.unlinked).map(e => e.uid));
  const seen = new Set();
  for (const ob of ctx.objects) {
    const en = ents[String(ob.def).toLowerCase()];
    if (!en || !en.enterable || !(en.enterable.ports || []).length) continue;
    if (seen.has(ob.uid)) continue;
    seen.add(ob.uid);
    const pts = ob.fp && ob.fp.pts && ob.fp.pts.length ? ob.fp.pts : null;
    if (!pts) continue;
    let x = 0, y = 0; for (const p of pts) { x += p[0]; y += p[1]; } x /= pts.length; y /= pts.length;
    let rad = 0; for (const p of pts) rad = Math.max(rad, Math.hypot(p[0] - x, p[1] - y));
    const why = gateWhy(ctx, x, y, { noMove: true, ring: rad + 20 });
    if (unl.has(ob.uid)) why.push('GATE_UNLINKED');
    const portZ = Math.max.apply(null, en.enterable.ports.map(p => Number.isFinite(p.z) ? p.z : 0));
    const props = en.props || [];
    out.push({ x: r2(x), y: r2(y), src: 'garrison', uid: ob.uid, why, portZ,
      garrison: { destructible: !!en.structure || props.some(p => /^delete_after/.test(p)), burnable: props.includes('break_on_burn') } });
  }
  for (const fl of ctx.flags) for (const s of (fl.fort || [])) {
    out.push({ x: r2(s.x), y: r2(s.y), src: 'fort', uid: null, why: gateWhy(ctx, s.x, s.y, { noMove: true }) });
  }
  return out;
}
const r2 = v => Math.round(v * 100) / 100;

module.exports = { gateWhy, gateLayer, pxLayer, lattice, extras, LAT, TILE, PER_TILE, REFINE, PAIR_CAP, SPAWN_U };

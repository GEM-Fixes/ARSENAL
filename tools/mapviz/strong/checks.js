// strong checks (MV-STR): the map maker's checks of design 6 and rules.md 6.4, every code but FAIR_FLAG (that one is in
// strong.<kind>.json). Item = {kind:'check', code, x, y, region} plus {side?, unit?, flag?, value?, limit?, file?};
// region 0 (no region here); file = the doc.pictures key, never a path (late R5). Checks are data: the CLI exits 0.
// Rulings of this part [I]:
// - Flag times are zone times (flagTime: the least time over the zone samples; the goh flag point is blocked).
// - REACH_UNEQUAL (inf): the two sides' zone times differ by more than 5 s or by more than 15% of the slower side's
//   time ("> max(5 s, 15%)" read as either limit; the fixture's f2 differs by about 4.7 s = 47%, rules.md 10); limit =
//   the one that fired.
// - SPAWN_IN_DANGER / FLAG_IN_DANGER: within mortar reach of the other side's enemy ground (inf, d as in run);
//   SPAWN_IN_BINOC / FLAG_IN_BINOC: within binocular reach of it. A flag is tested for the side that reaches it first.
// - SPAWN_SEEN: a spawn seen from an enemy spawn (standing eye to standing top) within the enemy's sight range.
// - FLAG_ZONE_WATER / FLAG_ZONE_BLOCKED: more than 25% of the zone samples are wet (band >= 1) / not passable to
//   infantry (move codes other than 1, 2, 6).
// - FLAG_UNREACHABLE: a kind of a side has no travel time at the flag point nor anywhere in its zone.
// - SPAWN_SEEN range: rangeM(inf sees inf, standing), asked of rules/sight (goh kneel/cover factors are 1).
// - DROWN_NEAR_REACH: cells where the tank drowns within 2 m of cells the side's tank reaches; one item per side at the
//   first such cell, value = cells.
// - OBJECT_OUTSIDE: an object whose footprint centre lies outside the world box.
// - MINIMAP_SPAN: the minimap picture's aspect differs from the world box's by more than 5%.
// Author: Imperator_Aug (ARSENAL, ia-b099e5a0)
'use strict';
const F = require('./frame');
const IN = require('./inputs');

const EXPECTED = { as2: ['minimap', 'preview', 'preview_small'], goh: ['minimap', 'preview', 'header'] };
const ROW_OF = { minimap: 'minimap', preview: 'preview', preview_small: 'small', header: 'header', header_interface: 'header_interface' };
const rd = v => Math.round(v * 1000) / 1000;
// full mip chain of a w x h picture: previews/targets mipCount (the real one), else the same count here
const mipCount = (w, h) => {
  try { const T = require('../previews/targets'); if (typeof T.mipCount === 'function') return T.mipCount(w, h); } catch (e) { /* previews absent */ }
  let n = 1, m = Math.max(w, h); while (m > 1) { m >>= 1; n++; } return n;
};
const item = (code, x, y, extra) => Object.assign({ kind: 'check', code, x: rd(x), y: rd(y), region: 0 }, extra || {});

function travelOf(I, k) {
  try { return IN.kindInputs(I, k, { travel: true, routes: false }); } catch (e) {
    if (e && e.code === 'MV_NOT_FOUND' && e.detail && e.detail.code === 'STRONG_INPUT_ABSENT') throw e;
    throw e;
  }
}
// a flag is taken from anywhere in its zone (as2 weight 1 - d2/r2 > 0 [V]; goh poly zone
// [V GHMAP-03]; no zone: 10 m circle), and on goh the flag point itself sits in the flag's blocked footprint (move 5)
// [V 1v1_balzerweg]. flagTime = the least travel time over the flag point and the zone samples (every 2 m) with weight
// > 0, null when none is reached; at = that sample
const ZSTEP = 40;
function zoneSamples(fl, game) {
  if (fl._zs && fl._zs.game === game) return fl._zs.pts;
  const b = F.zoneBox(fl), pts = [{ x: fl.x, y: fl.y }];
  for (let y = b[1] + ZSTEP / 2; y < b[3]; y += ZSTEP) for (let x = b[0] + ZSTEP / 2; x < b[2]; x += ZSTEP) if (F.zoneWeight(fl, x, y, game) > 0) pts.push({ x, y });
  Object.defineProperty(fl, '_zs', { value: { game, pts }, enumerable: false, configurable: true, writable: true });
  return pts;
}
function flagTime(g, fl, game) {
  let best = null;
  for (const p of zoneSamples(fl, game)) { const t = F.tAt(g, p.x, p.y); if (t !== null && (!best || t < best.t)) best = { t, x: p.x, y: p.y }; }
  return best;
}

function checks(I, o) {
  o = o || {};
  const S = require('./index');
  const out = [];
  const tick = o.tick || (() => {});
  const doc = I.doc, m = I.m, ph = I.phase, wb = doc.boxes.world, game = I.game;
  const flags = F.flagsOf(m, ph);
  const sp = { a: F.spawnsOfDoc(m, 'a', ph), b: F.spawnsOfDoc(m, 'b', ph) };
  const KI = travelOf(I, 'inf');
  // REACH_UNEQUAL
  for (const fl of flags) {
    const ta = flagTime(KI.travel.a, fl, game), tb = flagTime(KI.travel.b, fl, game);
    if (!ta || !tb) continue;
    const a = ta.t, b = tb.t, d = Math.abs(a - b), slow = Math.max(a, b);
    // the limit written is the one that fired: 5 s, else 15% of the slower time (both fire: the 5 s one)
    const lim = d > 5 ? 5 : d > 0.15 * slow ? rd(0.15 * slow) : null;
    if (lim !== null) out.push(item('REACH_UNEQUAL', fl.x, fl.y, { side: a < b ? 'a' : 'b', unit: 'inf', flag: fl.name, value: rd(d), limit: lim }));
  }
  tick();
  // FLAG_UNREACHABLE (every kind, both sides): no travel time anywhere in the zone
  for (const k of S.KINDS) {
    const K = travelOf(I, k);
    for (const s of ['a', 'b']) for (const fl of flags) {
      if (!flagTime(K.travel[s], fl, game)) out.push(item('FLAG_UNREACHABLE', fl.x, fl.y, { side: s, unit: k, flag: fl.name }));
    }
    tick();
  }
  // enemy ground of each side (inf): danger and binocular checks
  IN.sight(I);
  const R = S.ranges(I, 'inf'), fr = F.strongFrame(doc);
  const TH = require('./threat');
  const eg = {};
  for (const s of ['a', 'b']) {
    const e = s === 'a' ? 'b' : 'a';
    const ctx = { fr, doc, s, Ts: KI.travel[s], TeThr: KI.travel[e], note: () => {} };
    TH.enemyGround(ctx);
    eg[s] = ctx;
  }
  const dAt = (s, x, y) => eg[s].distG ? F.valAt(eg[s].distG, x, y) : null;
  for (const s of ['a', 'b']) for (const p of sp[s]) {
    const d = dAt(s, p.x, p.y);
    if (d !== null && d <= R.mortarU) out.push(item('SPAWN_IN_DANGER', p.x, p.y, { side: s, unit: 'inf', value: rd(d / F.UPM), limit: R.mortarU / F.UPM }));
    if (d !== null && d <= R.binocU) out.push(item('SPAWN_IN_BINOC', p.x, p.y, { side: s, unit: 'inf', value: rd(d / F.UPM), limit: R.binocU / F.UPM }));
  }
  for (const fl of flags) {
    // the side that reaches the zone first; d at the flag point, else the least d over that side's reached zone samples
    const ta = flagTime(KI.travel.a, fl, game), tb = flagTime(KI.travel.b, fl, game);
    if (!ta && !tb) continue;
    const s = !tb || (ta && ta.t <= tb.t) ? 'a' : 'b';
    let d = dAt(s, fl.x, fl.y);
    if (d === null) for (const p of zoneSamples(fl, game)) {
      if (F.tAt(KI.travel[s], p.x, p.y) === null) continue;
      const v = dAt(s, p.x, p.y);
      if (v !== null && (d === null || v < d)) d = v;
    }
    if (d !== null && d <= R.mortarU) out.push(item('FLAG_IN_DANGER', fl.x, fl.y, { side: s, unit: 'inf', flag: fl.name, value: rd(d / F.UPM), limit: R.mortarU / F.UPM }));
    if (d !== null && d <= R.binocU) out.push(item('FLAG_IN_BINOC', fl.x, fl.y, { side: s, unit: 'inf', flag: fl.name, value: rd(d / F.UPM), limit: R.binocU / F.UPM }));
  }
  tick();
  // SPAWN_SEEN
  const Sg = I.rules.sight, st = S.threatHeights('inf', Sg);
  for (const s of ['a', 'b']) {
    const e = s === 'a' ? 'b' : 'a';
    for (const p of sp[s]) {
      const gp = F.hAt(I.grids.height, p.x, p.y);
      if (gp === null) continue;
      for (const q of sp[e]) {
        const gq = F.hAt(I.grids.height, q.x, q.y);
        if (gq === null) continue;
        const d = Math.hypot(p.x - q.x, p.y - q.y), rng = R.enemyStandU;   // standing to standing, no cover (rangeM)
        if (d > rng) continue;
        if (Sg.canSee(I.sight.sg, { x: q.x, y: q.y, z: gq + st.eyeU }, { x: p.x, y: p.y, z: gp + st.topU }, { uncoverU: R.enemyUncoverU, rangeU: rng })) {
          out.push(item('SPAWN_SEEN', p.x, p.y, { side: s, unit: 'inf', value: rd(d / F.UPM), limit: rd(rng / F.UPM) }));
          break;
        }
      }
    }
  }
  tick();
  // flag zones: water and blocked shares
  for (const fl of flags) {
    const b = F.zoneBox(fl);
    let n = 0, wet = 0, blk = 0;
    for (let y = b[1] + 20; y < b[3]; y += 40) for (let x = b[0] + 20; x < b[2]; x += 40) {
      if (!(F.zoneWeight(fl, x, y, game) > 0) || F.hAt(I.grids.height, x, y) === null) continue;
      n++;
      const bd = F.valAt(I.water.band, x, y);
      if (bd !== null && bd >= 1) wet++;
      const mv = F.valAt(KI.move, x, y);
      if (!(mv === 1 || mv === 2 || mv === 6)) blk++;
    }
    if (n && wet / n > 0.25) out.push(item('FLAG_ZONE_WATER', fl.x, fl.y, { flag: fl.name, value: rd(wet / n), limit: 0.25 }));
    if (n && blk / n > 0.25) out.push(item('FLAG_ZONE_BLOCKED', fl.x, fl.y, { flag: fl.name, unit: 'inf', value: rd(blk / n), limit: 0.25 }));
  }
  // DROWN_NEAR_REACH
  const KT = travelOf(I, 'tank'), dr = S.drownTest(I, 'tank');
  for (const s of ['a', 'b']) {
    let first = null, cells = 0;
    for (let j = 0; j < fr.h; j++) for (let i = 0; i < fr.w; i++) {
      const p = F.centre(fr, i, j);
      if (!F.inBox(wb, p.x, p.y) || !dr(p.x, p.y)) continue;
      let near = false;
      for (let a = 0; a < 8 && !near; a++) near = F.tAt(KT.travel[s], p.x + Math.cos(a * Math.PI / 4) * 40, p.y + Math.sin(a * Math.PI / 4) * 40) !== null;
      if (near) { cells++; if (!first) first = p; }
    }
    if (cells) out.push(item('DROWN_NEAR_REACH', first.x, first.y, { side: s, unit: 'tank', value: cells }));
  }
  tick();
  // OBJECT_OUTSIDE
  IN.objects(I);
  for (const ob of I.objects) {
    const pts = ob.fp && ob.fp.pts;
    if (!pts || !pts.length) continue;
    let x = 0, y = 0; for (const p of pts) { x += p[0]; y += p[1]; } x /= pts.length; y /= pts.length;
    if (!F.inBox(wb, x, y)) out.push(item('OBJECT_OUTSIDE', x, y, {}));
  }
  // pictures
  let rows = null;
  try { rows = require('../previews').targets(I.target, I.map, doc); } catch (e) { if (!(e && e.code === 'MODULE_NOT_FOUND')) throw e; rows = null; }
  if (!rows) I.notes.push({ code: 'STRONG_PREVIEWS_ABSENT', msg: 'previews is not built: PICTURE_REFUSED skipped' });
  for (const it of pictureItems(doc, game, rows)) out.push(it);
  tick();
  return out;
}

// PICTURE_MISSING, MINIMAP_SPAN, PICTURE_SHADOWED and PICTURE_REFUSED of a doc against the previews rows (null: no
// PICTURE_REFUSED)
function pictureItems(doc, game, rows) {
  const out = [], wb = doc.boxes.world;
  const cx = (wb[0] + wb[2]) / 2, cy = (wb[1] + wb[3]) / 2, pics = doc.pictures || {};
  for (const k of EXPECTED[game]) if (!pics[k]) out.push(item('PICTURE_MISSING', cx, cy, { file: k }));
  const mm = pics.minimap;
  if (mm && Array.isArray(mm.size) && mm.size[0] > 0 && mm.size[1] > 0) {
    const a = mm.size[0] / mm.size[1], w = (wb[2] - wb[0]) / (wb[3] - wb[1]), diff = Math.abs(a / w - 1);
    if (diff > 0.05) out.push(item('MINIMAP_SPAN', cx, cy, { file: 'minimap', value: rd(diff), limit: 0.05 }));
  }
  for (const k of Object.keys(ROW_OF)) {
    const p = pics[k];
    if (!p) continue;
    if (Array.isArray(p.shadowed) && p.shadowed.length) out.push(item('PICTURE_SHADOWED', cx, cy, { file: k, value: p.shadowed.length }));
    if (!rows) continue;
    const r = rows.find(x => x.id === ROW_OF[k]);
    if (!r) continue;
    // the minimap size is per map (the previews row is only the default for a new picture, and its orientation can
    // differ from a vanilla file: goh 1v1_balzerweg 1500 x 1496 against the row's 1496 x 1500 [V]): the minimap is
    // tested on format and mips (its own full chain, or 1) only; its aspect is MINIMAP_SPAN's test
    const isMM = k === 'minimap', ps = Array.isArray(p.size) && p.size[0] > 0 && p.size[1] > 0 ? p.size : null;
    const fullMips = ps ? mipCount(ps[0], ps[1]) : r.mips;
    const bad = r.state === 'none' || (!isMM && r.size && ps && (ps[0] !== r.size[0] || ps[1] !== r.size[1])) ||
      (r.format && p.format && String(p.format).toUpperCase() !== r.format) ||
      (r.format === 'DXT1' && Number.isFinite(p.mips) && p.mips !== 1 && p.mips !== (isMM ? fullMips : r.mips));
    if (bad) out.push(item('PICTURE_REFUSED', cx, cy, { file: k }));
  }
  return out;
}

module.exports = { checks, EXPECTED, flagTime, zoneSamples, pictureItems };

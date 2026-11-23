// Units > Describe a new unit on Gates of Hell: the gun words of the plan (op.gun of the gohcard op, tools/gen/lib/describe-gohgun.js)
// run on the card's own vehicle copy after gohAdd cloned it: gen gun op (a new cannon file {from "<like>"} with reload, pen_scale, range)
// then gen weapon op (the copy's mount swapped to it). A card with no vehicle copy of its own, or a gun gen refuses, = refused piece
// 'gun' (the page says units.ds.goh.gun in four languages). Writes go through the same ctx as the card (preview first, mod only). [T]
// Author: Imperator_Aug (ARSENAL, ia-a730dbf1)
'use strict';
const lc = s => String(s == null ? '' : s).toLowerCase();
const NAME = /^[a-z0-9_()\-]{2,40}$/;
const PEN = require('../../../gen/lib/gohgun').PEN_SCALE;   // the one pen_scale range (gen gohPen)
const fin = (v, lo, hi) => v == null || (Number.isFinite(+v) && +v >= lo && +v <= hi);

function onCopy(ctx, id, opt, rows) {
  const g = opt && opt.gun; if (!g) return;
  const no = why => { if (opt.refused && !opt.refused.some(r => r.piece === 'gun')) opt.refused.push({ piece: 'gun', why }); };
  if (!id) { no('the card buys a vehicle named in its content, not a copy of its own'); return; }
  const name = lc(g.name), like = lc(g.like), place = lc(g.place || 'gun');
  if (!NAME.test(name) || !NAME.test(like) || !/^[a-z0-9_]{1,40}$/.test(place) || !fin(g.recharge, 0.1, 600) || !fin(g.pen_scale, PEN[0], PEN[1])
    || (g.range != null && !/^\d{3}(_howitzer)?$/.test(String(g.range)))) { no('the gun plan is not valid any more: press Preview again'); return; }
  const O = require('../../../gen/lib/ops');
  // the gun ops run on a trial report and a copy of the ctx state: a refusal is piece 'gun' only (rolled back, nothing of it kept and
  // nothing in the card's report), so the rest of the Describe write still goes; a clean run copies its notes into the card's report
  const R = require('../../../lib/report'), real = ctx.rep, snap = { dirty: new Map(ctx.dirty), virt: new Set(ctx.virt), names: new Set(ctx.names), virtMaps: new Set(ctx.virtMaps) };
  const lens = {}; for (const k of ['texts', 'facts', 'test', 'steps']) lens[k] = (ctx[k] || []).length;
  const back = () => { ctx.dirty = snap.dirty; ctx.virt = snap.virt; ctx.names = snap.names; ctx.virtMaps = snap.virtMaps; for (const k in lens) if (ctx[k]) ctx[k].length = lens[k]; ctx.diskKeys = null; };
  const spec = { op: 'gun', name, like };
  if (g.recharge != null) spec.recharge = +g.recharge;
  if (g.pen_scale != null) spec.pen_scale = +g.pen_scale;
  if (g.range != null) spec.range = String(g.range);
  let j;
  ctx.rep = R.createReport();
  try { O.opGun(ctx, spec); j = ctx.rep.toJSON({ tool: 'gen' }); if (!j.findings.some(f => !/^WARN_/.test(f.code))) { O.opWeapon(ctx, { op: 'weapon', entity: lc(id), weapon: name, place }); j = ctx.rep.toJSON({ tool: 'gen' }); } }
  catch (e) { j = { findings: [{ code: 'GEN_GUN_FAILED', msg: e.message }], info: [] }; }
  finally { ctx.rep = real; }
  const errs = j.findings.filter(f => !/^WARN_/.test(f.code));
  if (errs.length) { back(); no('the gun could not be made from ' + like + ' (' + errs[0].code + ': ' + errs[0].msg + ')'); return; }
  for (const f of j.findings) real.add(f.file, f.line, f.code, f.msg);
  for (const f of j.info || []) real.info(f.file, f.line, f.code, f.msg);
  rows.push({ field: 'gun', old: like, new: name + ' (from ' + like + [g.recharge != null ? ', reload ' + g.recharge + ' s' : '', g.pen_scale != null ? ', penetration x' + g.pen_scale : '', g.range != null ? ', range ' + g.range : ''].join('') + ')' });
}
module.exports = { onCopy };

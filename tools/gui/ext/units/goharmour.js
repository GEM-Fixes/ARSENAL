// Units page, the armour of a Gates of Hell vehicle or gun (change wizard field 'armor' under GoH; server.js change() hands it here).
// GoH keeps armour per hit volume in the vehicle's def and the files it includes (tools/lib/goharmour.js), not in the AS2 forms of
// armorJob. One route and one change handler:
//   POST /api/x/units/goharmor { id, card, mod? } -> { unit, def, parts: [{name, kind, macro, value, at}], speed: {kmh, at}|null }
//     value = the change wizard's text for the part: "30, front 80, top 20" (base mm, then the sides that differ)
//   change field 'armor' (server.js): part '*' + value = percent for every part ("120" = x1.2); part 'speed' + value = km/h;
//     part 'class' + value = another armour class of the same family (tank_heavy_tier1); part 'repair:<name>' + value = seconds;
//     part 'keys:<volume>' + value = the volume's keys "caststeel 0.8, highhardness yes, able.holed 1" (a key left out or "none" is
//     removed); part 'hull' + value = steel | wood;
//     else part = a part name + value = "40" (every side) or "40, front 90" (base, then side mm pairs) or "front 90" (one side)
//   (the GoH forms and their counts in the vanilla files: tools/lib/goharmour.js header)
//   The plan goes through the page's gen ctx (preview = diff, write = ctx.flush into the mod); a file shared with other units is
//   copied next to this unit and its include repointed (lib/goharmour), the shared one is never changed from here.
// [I] read from the data; [T] in game.
// Author: Imperator_Aug (ARSENAL, ia-b28ee5e1)
'use strict';
const GA = require('../../../lib/goharmour');
const S = () => require('./server').lib;
const lc = s => String(s == null ? '' : s).toLowerCase();
const bad = msg => { throw Object.assign(new Error(msg), { status: 400 }); };

function defKey(ctx, u) {
  if (u.def) { const k = lc(u.def).replace(/\\/g, '/').replace(/^\/+/, ''); const key = k.startsWith('resource/') ? k : 'resource/' + k; if (ctx.read(key)) return key; }
  const name = lc(u.vehicle || u.id).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const ks = ctx.keys(new RegExp('^resource/entity/.*/' + name + '\\.def$'));
  return ks.find(k => ctx.inMod(k)) || ks[0] || null;
}
const valueOf = p => {
  const b = p.base, out = [b == null ? '' : String(b)];
  if (p.kind === 'volume') for (const s of GA.SIDES) if (p.sides[s] != null && p.sides[s] !== b) out.push(s + ' ' + p.sides[s]);
  return out.filter(Boolean).join(', ');
};
function readUnit(ctx, u) {
  if (u.kind !== 'vehicle') bad('Only vehicles and guns have armour.');
  const def = defKey(ctx, u);
  if (!def) bad('The unit file of ' + (u.vehicle || u.id) + ' was not found.');
  const R = GA.read(ctx, def);
  return { def, R };
}
async function partsRoute(ctx0, body) {
  const L = S(), game = L.gameOf(ctx0, body), mod = L.modOf(body, game, false);
  const { cur } = await L.both(ctx0, game, mod, true);
  const u = cur.byId.get(lc(body.id)); if (!u) bad('No unit with the id "' + body.id + '".');
  const ctx = L.newCtx(game, mod || null, true, 'goh'), { def, R } = readUnit(ctx, u);
  return { unit: u.id, def: def.replace(/^resource\//, ''), speed: R.speed ? { kmh: R.speed.value, at: R.speed.key.replace(/^resource\//, '') + ':' + R.speed.line } : null,
    parts: R.parts.map(p => ({ name: p.name, kind: p.kind, macro: p.macro, value: valueOf(p), at: at(p), shared: !!p.shared })).concat(moreOf(R)) };
}
// a real armour part of that name wins over the class and hull entries
const own = (R, name) => R.parts.some(p => lc(p.name) === lc(name));
const at = p => p.key.replace(/^resource\//, '') + ':' + p.line;
// the armour class, the repair times, the volume keys and the hull material as more part entries
function moreOf(R) {
  const out = [];
  if (R.preset) out.push({ name: 'class', kind: 'class', value: R.preset.name, options: R.preset.options, at: at(R.preset), shared: !!R.preset.shared });
  for (const r of R.repairs) out.push({ name: 'repair:' + r.name, kind: 'repair', value: String(r.value), at: at(r), shared: !!r.shared });
  for (const v of R.volx) out.push({ name: 'keys:' + v.name, kind: 'keys', value: GA.volLines(v).join(', '), at: at(v), shared: !!v.shared });
  out.push({ name: 'hull', kind: 'hull', value: R.material.words.length === 1 ? R.material.value : R.material.words.join(' '), options: GA.MATERIALS });
  return out;
}
// "caststeel 0.8, highhardness yes" against the volume's keys now -> goharmour volx rows (a key left out is removed)
function volxOf(R, name, value) {
  const v = R.volx.find(x => lc(x.name) === lc(name));
  if (!v) bad('"' + name + '" is not a volume written in this unit\'s files. Its volumes: ' + (R.volx.map(x => x.name).join(', ') || 'none') + '.');
  const now = new Map(GA.volLines(v).map(l => { const i = l.indexOf(' '); return [l.slice(0, i), l.slice(i + 1)]; })), want = new Map();
  for (const item of String(value == null ? '' : value).split(/[,;]/).map(x => x.trim()).filter(Boolean)) {
    const m = /^(caststeel|highhardness|quality|material|density|able\.[a-z_]+)\s+(\S+)$/i.exec(item);
    if (!m) bad('Write the volume keys as key value, separated by commas: caststeel 0.8, highhardness yes, able.holed 1 (none removes a key).');
    want.set(lc(m[1]), lc(m[2]));
  }
  const out = [];
  for (const [k, val] of want) if (now.get(k) !== val) out.push({ part: v.name, key: k, value: val });
  for (const k of now.keys()) if (!want.has(k)) out.push({ part: v.name, key: k, value: 'none' });
  if (!out.length) bad('These are the keys the volume has now: nothing to change.');
  return out;
}
// "40" | "40, front 90, top 20" | "front 90" -> [{side, mm}]
function setsOf(part, value) {
  const toks = String(value == null ? '' : value).toLowerCase().split(/[\s,;]+/).filter(Boolean), out = [];
  const mmOf = t => { const n = Number(t); if (!isFinite(n) || n < 0 || n > 2000) bad('Armour is millimetres from 0 to 2000: "' + t + '" is not.'); return n; };
  let i = 0;
  if (toks.length && /^[\d.]+$/.test(toks[0])) { out.push({ part, side: 'base', mm: mmOf(toks[0]) }); i = 1; }
  for (; i < toks.length; i += 2) {
    if (!GA.SIDES.includes(toks[i])) bad('Write the armour as a number for every side, then side and number pairs: 40, front 90, top 20 (sides: ' + GA.SIDES.join(', ') + ').');
    out.push({ part, side: toks[i], mm: mmOf(toks[i + 1]) });
  }
  if (!out.length) bad('Type the armour in millimetres, for example 40 or 40, front 90.');
  // one number and nothing else = every side of the part
  if (out.length === 1 && out[0].side === 'base') out[0].side = 'all';
  return out;
}
// the change wizard's 'armor' field under GoH; o = { game, mod, u, body } from server.js change()
function change(o) {
  const L = S(), { game, mod, u, body } = o;
  const ctx = L.newCtx(game, mod, !body.write, 'goh'), { def, R } = readUnit(ctx, u);
  const part = String(body.part == null ? '' : body.part).trim(), ch = {}, rows = [];
  if (part === '*') {
    const pc = Number(String(body.value || '').replace(/%/g, '').replace(',', '.').trim());
    if (!isFinite(pc) || pc < 5 || pc > 1000) bad('Type a percent for every part, from 5 to 1000 (120 = 20% thicker).');
    ch.scale = pc / 100;
  } else if (lc(part) === 'speed') {
    const v = Number(String(body.value || '').replace(',', '.').trim());
    if (!isFinite(v) || v < 1 || v > 1000) bad('Type the top speed in km/h, from 1 to 1000.');
    if (!R.speed) bad('No top speed was found in this unit\'s files (it comes from the game\'s shared files).');
    ch.speed = v;
  } else if (lc(part) === 'class' && !own(R, part)) {
    const v = lc(String(body.value || '').trim());
    if (!/^[a-z0-9_]{1,80}$/.test(v)) bad('Type the armour class as one word, like tank_heavy_tier1.');
    ch.preset = v;
  } else if (/^repair:/i.test(part)) {
    const v = Number(String(body.value || '').replace(',', '.').trim());
    if (!isFinite(v) || v < 1 || v > 600) bad('Type the repair time in seconds, from 1 to 600.');
    ch.repair = [{ part: part.slice(7), s: v }];
  } else if (/^keys:/i.test(part)) {
    ch.volx = volxOf(R, part.slice(5), body.value);
  } else if (lc(part) === 'hull' && !own(R, part)) {
    ch.material = lc(String(body.value || '').trim());
  } else {
    if (!part) bad('Pick which armour part to change.');
    ch.set = setsOf(part, body.value);
  }
  const P = GA.plan(ctx, R, ch, {});
  if (!P.ok) bad(P.reason);
  for (const [k, b] of P.files) ctx.write(k, b);
  for (const c of P.changes) rows.push({ field: 'armor', part: c.part + (c.side && c.side !== 'base' && c.side !== 'all' ? ' ' + c.side : ''), old: c.before === '' ? '(none)' : c.before, new: String(c.after) });
  for (const nt of P.notes || []) ctx.info('UNITS_GOH_ARMOUR', String(nt), u.id);
  return L.finish(ctx, game, mod, body, { unit: L.brief(u), rows, names: [], job: { form: 'goh', def: def.replace(/^resource\//, ''), change: ch }, where: o.where });
}
// Describe a new unit (server.js gohAdd, after the vehicle clone): opt.armor = {k} | {front: mm} (every part scaled so the hull front
// is that), opt.speed = {k} | {kmh}; id = the copy's entity (null: the card buys a vehicle named in its content, no copy of its own).
// What cannot be applied goes to opt.refused ({piece, why}); the page shows the plain line units.ds.goh.<piece>.
function onCopy(ctx, id, opt, rows) {
  const no = (piece, why) => { if (opt.refused && !opt.refused.some(r => r.piece === piece)) opt.refused.push({ piece, why }); };
  const want = [opt.armor ? 'armor' : null, opt.speed ? 'speed' : null].filter(Boolean);
  if (!id) { for (const p of want) no(p, 'the card buys a vehicle named in its content, not a copy of its own'); return; }
  const ks = ctx.keys(new RegExp('^resource/entity/.*/' + lc(id).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\.def$')).filter(k => ctx.inMod(k));
  if (!ks.length) { for (const p of want) no(p, 'the copy\'s vehicle file was not made'); return; }
  const fin = (k, lo, hi) => Number.isFinite(+k) && +k >= lo && +k <= hi;
  if (opt.armor) {
    const R = GA.read(ctx, ks[0]), f = GA.frontOf(R);
    let k = opt.armor.front != null ? (fin(opt.armor.front, 1, 2000) && f ? +opt.armor.front / f : null) : (fin(opt.armor.k, 0.05, 10) ? +opt.armor.k : null);
    if (!R.parts.length || k == null) no('armor', R.parts.length ? 'no hull front to measure from' : 'no armour numbers in the copy\'s own files');
    else {
      const P = GA.plan(ctx, R, { scale: k }, {});
      if (!P.ok) no('armor', P.reason);
      else { for (const [key, b] of P.files) ctx.write(key, b); rows.push({ field: 'armor', old: f == null ? '' : f + ' mm front', new: Math.round((f || 0) * k) + ' mm front (every part x' + Math.round(k * 100) / 100 + ')' }); }
    }
  }
  if (opt.speed) {
    const R = GA.read(ctx, ks[0]);
    const v = R.speed && (opt.speed.kmh != null ? (fin(opt.speed.kmh, 1, 1000) ? +opt.speed.kmh : null) : (fin(opt.speed.k, 0.05, 10) ? Math.max(1, Math.round(R.speed.value * opt.speed.k)) : null));
    if (!v) no('speed', R.speed ? 'the asked speed is out of range' : 'no speed(N) in the copy\'s own files');
    else {
      const P = GA.plan(ctx, R, { speed: v }, {});
      if (!P.ok) no('speed', P.reason);
      else { for (const [key, b] of P.files) ctx.write(key, b); rows.push({ field: 'speed', old: R.speed.value, new: v }); }
    }
  }
}
module.exports = { change, onCopy, partsRoute, setsOf, valueOf, moreOf, volxOf, routes: { 'POST /api/x/units/goharmor': (url, body, ctx) => partsRoute(ctx, body || {}) } };

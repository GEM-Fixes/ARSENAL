// BALANCE apply: turns the rows of a bulk change plan (lib.planChange) into edits through gen's own ops and the Units page
// helpers (price card, armour macro, top speed, gun reload). ctx is a gen Ctx: plan = nothing written, else flush by the caller.
// Author: Imperator_Aug (ARSENAL, ia-b87a87fa)
const U = require('../gui/ext/units/server').lib;
const lc = s => String(s == null ? '' : s).toLowerCase();
const CARD = { cost: 'cost', rank: 'level', charge: 'charge', fore: 'fore' };

// GoH cards ({"id" ("macro" .. cost(N)) ("doctrine_t1" cool(N) ..) {cost N}} in the period files, [V data: units/<period>/units_<army>.set]):
// the value is the first macro argument or key of that name inside the card's own block, never the macro definition (settings.set);
// a card that only inherits the value from its macro has none to change: skipped with the reason. Keys tried in order:
const GOH_KEYS = { cost: ['cost'], charge: ['interval', 'cool', 'ci'], delay: ['delay', 'cd'] };
const reEsc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function gohBlock(ctx, u) {
  const key = lc(u.cardFile || ''); if (!key) return null;
  let b; try { b = ctx.read(key); } catch (e) { b = null; } if (!b) return null;
  const s = b.toString('latin1'), eol = s.includes('\r\n') ? '\r\n' : '\n', lines = s.split(/\r?\n/);
  const re = new RegExp('^\\s*\\{\\s*"' + reEsc(u.id) + '"(\\s|\\(|$)', 'i'), at = (u.cardLine || 0) - 1;
  const i = at >= 0 && re.test(lines[at] || '') ? at : lines.findIndex(l => re.test(l)); if (i < 0) return null;
  let d = 0, j = i;
  for (; j < lines.length; j++) { const t = lines[j].replace(/"[^"]*"/g, '').replace(/;.*$/, ''); for (const ch of t) { if (ch === '{' || ch === '(') d++; else if (ch === '}' || ch === ')') d--; } if (d <= 0) break; }
  return { key, lines, eol, i, j };
}
function gohSet(ctx, u, field, value) {
  const c = gohBlock(ctx, u); if (!c) return { why: 'its card was not found in ' + (u.cardFile || 'its units file') };
  for (const k of GOH_KEYS[field]) {
    const a = new RegExp('(\\{\\s*' + reEsc(k) + '\\s+)([-\\d.]+)(\\s*\\})', 'i'), b = new RegExp('((?:^|[\\s(])' + reEsc(k) + '\\(\\s*)([-\\d.]+)(\\s*\\))', 'i');
    for (let n = c.i; n <= c.j; n++) {
      const l = c.lines[n].replace(/;.*$/, ''), re = a.test(l) ? a : b.test(l) ? b : null; if (!re) continue;
      const old = re.exec(l)[2], lines = c.lines.slice();
      lines[n] = c.lines[n].replace(re, (m, p, x, q) => p + value + q);
      ctx.write(c.key, lines.join(c.eol));
      return { old, key: k };
    }
  }
  return { why: 'its card carries no ' + GOH_KEYS[field].join(' / ') + ' value of its own (it comes from the macro in settings.set)' };
}
// one id can stand in several period files (early, mid, late), each with its own values: a plan row names its card (p.card =
// lib.gohKey, id@units file) and that copy is edited; cat.byId (last copy wins) only for a row without one
function applyGoh(ctx, cat, plan) {
  const out = { rows: [], skipped: plan.skipped.slice() }, byCard = new Map((cat.units || []).map(u => [require('./lib').gohKey(u), u])), guns = new Map(), bodies = new Map();
  for (const p of plan.rows) {
    const u = p.card ? byCard.get(p.card) : cat.byId.get(lc(p.id));
    if (!u) { out.skipped.push({ id: p.id, why: 'not in the unit list' }); continue; }
    if (p.field === 'reload') { require('./gohreload').row(ctx, U.gen().ops, u, p, guns, out); continue; }   // the gun file (gohreload.js)
    if (p.field === 'speed' || p.field === 'armor') { require('./gohbody').row(ctx, u, p, bodies, out); continue; }   // the unit's def (gohbody.js)
    if (!GOH_KEYS[p.field]) { out.skipped.push({ id: u.id, why: 'column ' + p.field + ' cannot be changed in Gates of Hell' }); continue; }
    let v = p.new;
    if (p.field === 'cost') {   // the buy price = own cost + members (GHGPL-10): the own cost moves by the same amount
      if (u.ownCost == null) { out.skipped.push({ id: u.id, why: 'has no cost of its own: its price is the sum of its members (GHGPL-10)' }); continue; }
      v = Math.round((u.ownCost + (p.new - u.cost)) * 1000) / 1000;
      if (v < 0) { out.skipped.push({ id: u.id, why: 'the members alone cost more than ' + p.new }); continue; }
    }
    const r = gohSet(ctx, u, p.field, v);
    if (r.why) { out.skipped.push({ id: u.id, why: r.why }); continue; }
    out.rows.push(Object.assign({ id: u.id, name: u.name, field: p.field, old: p.old, new: p.new }, p.field === 'cost' && v !== p.new ? { note: 'own cost ' + r.old + ' -> ' + v } : {}, p.waitNew != null ? { waitOld: p.waitOld, waitNew: p.waitNew } : {}));
  }
  require('./gohreload').notes(cat, guns);
  if (bodies.size) require('./gohbody').notes(ctx, cat, bodies);
  return out;
}

// AS2 vehicle cards: gen's card op looks the card up in vehicles_<army>.set (or a vehicles.set / vehicles_x*.set), and the army of a
// card is its side; a card kept in an army list of another name (pz3m_ger2: side ger, list vehicles_ger2.set) gets the list's name as
// army, so the op finds the card the catalogue read it from (the list name is accepted: the op takes a card whose file ends _<army>.set)
function listArmy(u) {
  const m = /\/vehicles_([a-z0-9_]+)\.set$/.exec(lc(u.cardFile || ''));
  if (!m || u.kind === 'squad' || m[1] === lc(u.army) || /^x/.test(m[1])) return u;
  return Object.assign({}, u, { army: m[1] });
}
// -> { rows: [{id, name, field, old, new}], skipped: [{id, why}] }
// opt.game 'goh' (or a GoH catalogue, cat.exe 'goh'): the card edits above; else the AS2 path below (AS64 and MoW:AS2 alike)
function apply(ctx, cat, plan, opt) {
  if ((opt && opt.game) === 'goh' || cat.exe === 'goh') return applyGoh(ctx, cat, plan);
  const O = U.gen().ops, out = { rows: [], skipped: plan.skipped.slice() }, guns = new Map();
  for (const p of plan.rows) {
    const u = cat.byId.get(lc(p.id));
    if (!u) { out.skipped.push({ id: p.id, why: 'not in the unit list' }); continue; }
    if (CARD[p.field]) {
      const r = U.editCard(ctx, listArmy(u), { [CARD[p.field]]: String(p.new) });
      if (r.length) out.rows.push(Object.assign({ id: u.id, name: u.name, field: p.field, old: p.old, new: p.new }, p.waitNew != null ? { waitOld: p.waitOld, waitNew: p.waitNew } : {})); else out.skipped.push({ id: u.id, why: 'its price card has no such value' });
    } else if (p.field === 'speed') {
      if (!u.def) { out.skipped.push({ id: u.id, why: 'has no unit file' }); continue; }
      O.opSet(ctx, { op: 'set', rows: [{ entity: 'file:' + lc(u.def), path: 'game_entity/chassis/locomotion/maxspeed', value: String(p.new) }] }, ctx.out);
      out.rows.push({ id: u.id, name: u.name, field: 'speed', old: p.old, new: p.new });
    } else if (p.field === 'armor') {
      // every part of the hull armour line(s) is scaled by the plan's factor; engine and mantlet lines go along
      const parts = []; for (const m of u.armorMacro || []) for (const part of m.parts) if (part.values.length && part.values.every(v => typeof v === 'number')) parts.push({ m, part });
      if (!parts.length) { out.skipped.push({ id: u.id, why: 'its armour is set per part in the model, not in one armour line (change it on the Units page)' }); continue; }
      for (const { m, part } of parts) {
        const nv = part.values.map(v => Math.max(1, Math.round(v * p.factor)));
        if (nv.join(' ') === part.values.join(' ')) continue;
        O.opArmor(ctx, { op: 'armor', entity: u.id, macro: m.macro, value: part.name === 'args' ? nv.join(' ') : part.name + ' ' + nv.join(' ') });
        out.rows.push({ id: u.id, name: u.name, field: 'armor', part: m.macro + '/' + part.name, old: part.values.join(' '), new: nv.join(' ') });
      }
    } else if (p.field === 'reload') {
      // the reload time lives in the gun file: one edit per gun, every unit that carries the gun gets it
      const w = lc(u.gun && u.gun.weapon); if (!w) { out.skipped.push({ id: u.id, why: 'has no gun' }); continue; }
      if (guns.has(w)) { guns.get(w).users.push(u.id); continue; }
      let keys = []; try { keys = ctx.keys(new RegExp('^resource/set/stuff/.*/' + U.reEsc(w) + '$')); } catch (e) { keys = []; }
      if (!keys.length) { out.skipped.push({ id: u.id, why: 'gun file "' + w + '" not found' }); continue; }
      const text = ctx.read(keys[0]).toString('latin1'), root = (/^\s*\{\s*([A-Za-z_]\w*)/m.exec(text.replace(/^\s*;.*$/gm, '')) || [])[1] || 'from';
      O.opSet(ctx, { op: 'set', rows: [{ entity: 'file:' + keys[0], path: root + '/rechargeTime', value: String(p.new), op: 'add' }] }, ctx.out);
      const row = { id: w, name: 'gun ' + w, field: 'reload', old: p.old, new: p.new, users: [u.id] };
      guns.set(w, row); out.rows.push(row);
    } else out.skipped.push({ id: u.id, why: 'column ' + p.field + ' cannot be changed' });
  }
  // a gun shared with units outside the selection changes for them too: say so
  for (const row of guns.values()) {
    const all = cat.units.filter(x => x.buyable && lc(x.gun && x.gun.weapon) === row.id).map(x => x.id), extra = all.filter(id => !row.users.includes(id));
    if (extra.length) row.note = 'also changes for ' + extra.slice(0, 6).join(', ') + (extra.length > 6 ? ' and ' + (extra.length - 6) + ' more' : '');
  }
  return out;
}
module.exports = { apply, gohSet, listArmy, GOH_KEYS };

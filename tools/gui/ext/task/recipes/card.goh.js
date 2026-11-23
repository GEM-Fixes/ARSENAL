// recipes "squad" and "vehicle", the Gates of Hell branch (game parity 2026-11-23): copy a buy card under a new id, change its price,
// name, armour or top speed, or take it off. Everything goes through the Units page (call, not copy): the GoH catalogue
// (units/server.js lib.both, the statsheet GoH reader) for the lookups and values, POST /api/x/units/add (gohAdd: the card block or
// macro call line under the new id in units/<period>/units_<army>.set, a cloned entity for a card that buys its own, the name
// .pot) or, with member counts, armour or speed on a new card, POST /api/x/units/describe with a checked one card plan (its write
// path runs gohAdd with them); POST /api/x/units/change for cost, name, armor (part '*' a percent, part 'speed' km/h:
// units/goharmour.js); the card taken off by army.gohcards (its lines made comments in the mod copy of the period list).
// Read on the GoH install [V 2026-11-23]: squads built by a macro (single_with1type ..) have no cost of their own (GHGPL-10: the
// members' cost x squad_cost_factor), so a price there is refused by the Units page; the rank lock and head start are not read
// by GoH (GHMIS-85); bots buy in bot.main.lua and modes/*.lua (GHMIS-66), so no bots answer. Plan and Write run in one route of the
// recipe (POST /api/x/task/r/<squad|vehicle>/gohcard): a new card plus its armour is one step at Write, its Preview is the Add
// preview. Every buy panel change is [T].
// Author: Imperator_Aug (ARSENAL, ia-d7c71963)
'use strict';
const bad = (m, s) => Object.assign(new Error(m), { status: s || 400 });
const badK = (k, m) => Object.assign(bad(m), { key: k });
const lc = s => String(s == null ? '' : s).toLowerCase();
const US = () => require('../../units/server');
const gohDir = ctx => { try { return require('./skin.goh').gohDirOf(ctx); } catch (e) { return null; } };
const PERIODS = ['early', 'mid', 'late', 'conquest'];
const ID_RE = /^[a-z][a-z0-9_]{1,40}$/, MEM_RE = /^[a-z0-9_]+:\d{1,2}$/;
const tail = b => String(b || '').split('/').pop();
const NOGOH = id => badK('task.' + id + '.e.nogoh', 'Set the Gates of Hell folder first (the Game folder button at the top).');

// the Units catalogue of the GoH install plus the mod (the units page's own cache)
async function cat(ctx, dir, mod) {
  const fs = require('fs');
  const m = mod && fs.existsSync(String(mod)) ? String(mod) : null;
  return (await US().lib.both(ctx, dir, m, true)).cur;
}
const unitOf = (cur, ref) => {
  if (!ref) return null;
  const c = ref.card && cur.byCard ? cur.byCard.get(String(ref.card)) : null;
  return c || cur.byId.get(lc(ref.id)) || null;
};
const armyOfCard = card => (/units_([a-z0-9_]+)\.set/.exec(String(card || '')) || [])[1] || null;

// the cards of one kind (squad | vehicle) for What to copy
async function look(kind, ctx, words, opt) {
  const dir = gohDir(ctx); if (!dir) return [];
  const cur = await cat(ctx, dir, (opt && opt.mod) || ctx.mod);
  const r = US()._t.search(cur, String(words || ''), { kind, all: false, limit: (opt && opt.limit) || 60 });
  return r.results.map(b => ({ id: b.card || b.id, name: b.name || b.id, where: b.card || '', ref: { id: b.id, card: b.card || null }, sub: [b.army, b.period, b.cost != null ? b.cost + ' MP' : ''].filter(Boolean).join(', ') }));
}
// a free id: an exact hit is the one taken
async function lookFree(ctx, words, opt) {
  const dir = gohDir(ctx), w = lc(words).trim(); if (!dir || !w) return { results: [], exact: false };
  const cur = await cat(ctx, dir, (opt && opt.mod) || ctx.mod);
  const results = [...cur.byId.keys()].filter(k => k === w || k.replace(/\([^()]*\)$/, '') === w).slice(0, 5).map(k => ({ id: w, name: k, where: '', ref: null, sub: '' }));
  return { results, exact: results.length > 0 };
}
async function values(kind, ctx, base, opt) {
  const none = { gohremove: false, gohpct: 100 };
  const dir = gohDir(ctx); if (!dir || !base) return none;
  const cur = await cat(ctx, dir, ctx && ctx.mod), u = unitOf(cur, base.ref || { id: base.id, card: base.id });
  if (!u || u.kind !== kind) return none;
  const stem = lc(u.id).replace(/\([^()]*\)$/, '').replace(/[^a-z0-9_]/g, '_');
  let id = stem + '_2', n = 3; while (cur.byId.has(id) || cur.byId.has(id + lc((/\([^()]+\)$/.exec(u.id) || [''])[0]))) id = stem + '_' + n++;
  const v = { gohid: id, gohname: u.name || '', gohperiod: PERIODS.includes(lc(u.period)) ? lc(u.period) : 'mid', gohcost: u.ownCost != null ? u.ownCost : u.cost, gohremove: false, gohpct: 100 };
  if (kind === 'squad') v.gohmembers = (u.members || []).map(m => tail(m.breed) + ':' + (m.n || 1));
  if (v.gohcost == null) delete v.gohcost;
  v._goh = { id: u.id, card: u.card || null, army: lc(u.army), period: lc(u.period || ''), list: armyOfCard(u.card), members: v.gohmembers || [] };
  return v;
}

// compile on GoH: one route call (make, take off) or Units change calls
function compile(rid, kind, draft, c) {
  if (!c.gameDir) throw NOGOH(rid);
  const v = c.values || {}, m = v._goh;
  if (!m || !m.id) throw bad('Pick the ' + (kind === 'squad' ? 'squad' : 'vehicle') + ' to copy first (What to copy).');
  const val = id => c.value(id), notes = [], calls = [];
  const changed = id => !c.kept(id) && val(id) !== undefined && val(id) !== null && val(id) !== '' && JSON.stringify(val(id)) !== JSON.stringify(v[id]);
  const route = 'POST /api/x/task/r/' + rid + '/gohcard';
  const name = String(val('gohname') || '').trim();
  if (name.length > 80) throw bad('The name is 1 to 80 characters.');
  const cost = changed('gohcost') ? Number(val('gohcost')) : null;
  if (cost != null && !(cost >= 0 && cost <= 100000)) throw bad('The price is a number from 0.');
  const pct = changed('gohpct') ? Number(val('gohpct')) : null, kmh = changed('gohspeed') ? Number(val('gohspeed')) : null;
  if (pct != null && !(pct >= 5 && pct <= 1000)) throw bad('The armour is a percent of the copy, from 5 to 1000.');
  if (kmh != null && !(kmh >= 1 && kmh <= 1000)) throw bad('The top speed is 1 to 1000 km/h.');
  if (c.verb !== 'change') {
    const id = lc(val('gohid') || '').trim(), period = lc(val('gohperiod') || m.period || '');
    if (!ID_RE.test(id) || /_x+$/.test(id)) throw bad('The new id takes small letters, digits and _, starts with a letter and does not end in _x.');
    if (!PERIODS.includes(period)) throw bad('Pick the period of the new card: early, mid, late or conquest.');
    const body = { like: m.id, card: m.card, id, period, name: changed('gohname') ? name : '', price: cost };
    if (kind === 'squad' && changed('gohmembers')) {
      const mem = [].concat(val('gohmembers') || []).map(x => lc(x).replace(/\s+/g, ''));
      for (const x of mem) if (!MEM_RE.test(x)) throw bad('A member line is a soldier of the copy and a count, like rifleman:4: ' + x);
      const had = new Set(m.members.map(x => x.split(':')[0]));
      for (const x of mem) if (!had.has(x.split(':')[0])) throw bad('Gates of Hell: only the counts of the soldiers the copied card names change here (' + [...had].join(', ') + '); ' + x.split(':')[0] + ' is not one of them.');
      body.members = mem;
    }
    if (pct != null) body.armor = { k: pct / 100 };
    if (kmh != null) body.speed = { kmh };
    calls.push({ route, body: Object.assign({ op: 'make' }, body), dryFlag: 'write' });
    notes.push('The card ' + m.id + ' is copied as ' + id + ' into the ' + period + ' list by the Units page\'s Add' + (body.members || body.armor || body.speed ? ' (with ' + [body.members && 'the member counts', body.armor && 'armour ' + pct + '%', body.speed && 'top speed ' + kmh + ' km/h'].filter(Boolean).join(', ') + ', set at Write)' : '') + '. Buy it in a test match [T]. The first read of the Gates of Hell unit list can take many minutes.');
    notes.push('Bots: Gates of Hell bots buy in bot.main.lua and modes/*.lua (GHMIS-66); use the Bots page to add the new card there.');
    return { calls, notes, result: id };
  }
  if (val('gohremove') === true) {
    const army = m.list || m.army, period = PERIODS.includes(m.period) ? m.period : '';
    if (!army || !period || period === 'conquest') throw bad('This card is not in a period list (early, mid, late) that a task can take it off.');
    calls.push({ route, body: { op: 'remove', army, period, remove: [m.id] }, dryFlag: 'write' });
    notes.push('The card ' + m.id + ' is taken off the ' + army + ' ' + period + ' list: its lines become comments (;) in your mod copy. Check the buy panel in game [T].');
    return { calls, notes, result: m.id };
  }
  const ch = (field, value, part) => calls.push({ route: 'POST /api/x/units/change', body: Object.assign({ gid: 'goh', id: m.id, card: m.card, field, value: String(value) }, part ? { part } : {}), dryFlag: 'write' });
  if (cost != null) ch('cost', cost);
  if (changed('gohname') && name) ch('name', name);
  if (pct != null) ch('armor', pct, '*');
  if (kmh != null) ch('armor', kmh, 'speed');
  if (calls.length > 1 && pct != null && kmh != null) notes.push('Armour and top speed are two Units page changes of the same unit file; the second reads what the first wrote [T].');
  if (!calls.length) notes.push('Nothing differs from ' + m.id + ': there is nothing to write.');
  else notes.push(calls.length + ' change(s) of ' + m.id + ' through the Units page. Check them in game [T].');
  return { calls, notes, result: m.id };
}

// own route: POST /api/x/task/r/<squad|vehicle>/gohcard {mod, op: make | remove, ..., write}
// make: the Units Add (its own Preview); with members, armour or speed the write is the Units describe write of one checked card
// plan (gohAdd with them), the Preview the plain Add preview. remove: army.gohcards (comments in the mod copy of the period list)
async function cardRoute(url, b, ctx) {
  b = b || {};
  const mod = require('../../bots/lib').checkMod(ctx, b.mod), dir = gohDir(ctx);
  if (!dir) throw bad('Set the Gates of Hell folder first (the Game folder button at the top).');
  if (b.op === 'remove') return require('./army.gohcards').cardsRoute(url, { mod, army: b.army, period: b.period, remove: b.remove, write: !!b.write }, ctx);
  if (b.op !== 'make') throw bad('Unknown step.');
  const R = US().routes, id = lc(b.id), period = lc(b.period);
  if (!ID_RE.test(id) || !PERIODS.includes(period)) throw bad('Type the new id and pick the period.');
  const price = b.price == null || b.price === '' ? null : Number(b.price);
  const add = { gid: 'goh', game: dir, mod, like: String(b.like || ''), card: b.card || undefined, id, period, name: String(b.name || ''), price: price == null ? '' : price, bots: false, write: !!b.write };
  const extra = (Array.isArray(b.members) && b.members.length) || b.armor || b.speed;
  if (!b.write || !extra) return R['POST /api/x/units/add'](url, add, ctx);
  const op = { op: 'gohcard', like: add.like, card: add.card, id, period, name: add.name || undefined, price };
  if (Array.isArray(b.members) && b.members.length) op.members = b.members.map(String);
  if (b.armor) op.armor = { k: Number(b.armor.k) };
  if (b.speed) op.speed = { kmh: Number(b.speed.kmh) };
  return R['POST /api/x/units/describe'](url, { gid: 'goh', game: dir, mod, text: 'task ' + id, id, spec: { goh: true, ops: [op] }, write: true }, ctx);
}

// the GoH questions (group goh, first): asked only on the GoH tab; covers none (the census rows are the AS2 forms)
function questions(rid, kind) {
  const q = (id, k, o) => Object.assign({ id, kind: k, ask: 'task.' + rid + '.q.' + id, help: 'task.' + rid + '.h.' + id, covers: [] }, o, { when: Object.assign({ $game: ['goh'] }, (o && o.when) || {}) });
  const MK = { $verb: 'make' }, KEEP = { gohremove: false };
  const out = [
    q('gohremove', 'yesno', { when: { $verb: 'change' }, limits: { limit: 'GHGPL-09' } }),
    q('gohid', 'id', { when: MK, unique: { lookup: 'gohfree' }, limits: { re: '^[a-z][a-z0-9_]{1,40}$' } }),
    q('gohperiod', 'choice', { when: MK, limits: { values: PERIODS } }),
    q('gohname', 'text', { optional: true, when: KEEP, limits: { limit: 'GHLOC-06' } }),
    q('gohcost', 'number', { when: KEEP, limits: { min: 0, max: 100000, step: 1, unit: 'MP', usual: [10, 1000], limit: 'GHGPL-10' } }),
  ];
  if (kind === 'squad') out.push(q('gohmembers', 'list', { when: MK, optional: true, limits: { re: '^[a-z0-9_]+\\s*:\\s*[0-9]{1,2}$', limit: 'GHGPL-10' } }));
  if (kind === 'vehicle') out.push(q('gohpct', 'number', { when: KEEP, limits: { min: 5, max: 1000, step: 1, unit: '%', usual: [50, 200] } }), q('gohspeed', 'number', { when: KEEP, optional: true, limits: { min: 1, max: 1000, step: 1, unit: 'km/h' } }));
  return out;
}

module.exports = { PERIODS, look, lookFree, values, compile, cardRoute, questions };

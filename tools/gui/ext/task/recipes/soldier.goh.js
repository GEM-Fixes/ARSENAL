// recipe "soldier", the Gates of Hell branch (game parity 2026-11-23): change a multiplayer soldier: his card price and name, and what
// he carries. Read on the GoH install [V 2026-11-23]: a soldier is a breed file resource/set/breed/mp/<army>/<period>/<name>.set
// ({breed .. {inventory {item "<tags>" n [spread]} .. {in_hands n}}}) bought through a breed card {"mp/<army>/<period>/<name>"
// ("inf_<class>" .. cost(N))} in units/<period>/inf_<army>.set (tools/pricecalc/goh.js); an unknown item name adds nothing (GHED-33).
// Everything goes through the Units page (call, not copy): its GoH catalogue for the lookups and values, POST /api/x/units/change
// (cost, name: the card and the names .pot), POST /api/x/units/kit/set (gen kit op on the mod copy of the breed file, the grid
// checked, items the game does not know refused). A new soldier (make): gen steps on the GoH target: breed (the breed file cloned
// under the new name in the same <army>/<period> folder, so its relative includes still resolve; the breed card copied under the new
// name in units/<period>/inf_<army>.set and in every other period list that declares the copied one, conquest too; the price set on
// those cards; the name into the mod's .pot, desc/human/mp/<army>/<period>/<name>), then kit on the new breed file. He is bought
// only inside a squad: copy a squad and put him in its members. Every change is [T].
// Author: Imperator_Aug (ARSENAL, ia-789e5bbf)
'use strict';
const bad = (m, s) => Object.assign(new Error(m), { status: s || 400 });
const badK = (k, m) => Object.assign(bad(m), { key: k });
const lc = s => String(s == null ? '' : s).toLowerCase();
const CG = () => require('./card.goh'), IG = () => require('./item.goh'), AG = () => require('./army.goh'), K = () => require('../../units/kit');
const gohDir = ctx => { try { return require('./skin.goh').gohDirOf(ctx); } catch (e) { return null; } };
const LINE = /^\s*([a-z0-9_][a-z0-9_ ]{0,80}?)\s*(?::\s*(\d{1,3}))?\s*$/;

// the soldiers (Units catalogue, kind soldier) and the items a soldier can carry (units/kit.js table, no patterns, no guns or shells)
const look = (ctx, w, o) => CG().look('soldier', ctx, w, o);
async function lookItem(ctx, words, opt) {
  const g = AG().reader(gohDir(ctx), (opt && opt.mod) || ctx.mod); if (!g) return [];
  const ws = lc(words).split(/[\s,]+/).filter(Boolean), skip = K().NOT_CARRIED, out = [];
  for (const x of await IG().table(g)) {
    if (x.pattern || !x.top || skip.includes(x.top)) continue;
    if (!ws.every(w => (x.name + ' ' + x.key).includes(w))) continue;
    out.push({ id: x.name, name: x.name, where: x.key, ref: { key: x.key }, sub: x.top });
    if (out.length >= ((opt && opt.limit) || 60)) break;
  }
  return out;
}
async function values(ctx, base, opt) {
  const v = await CG().values('soldier', ctx, base, opt);
  delete v.gohremove; delete v.gohpct; delete v.gohid; delete v.gohperiod;
  v.gohadd = []; v.gohdel = [];
  if (v._goh) v._goh.breed = lc(v._goh.id).replace(/^mp\//, '');
  // make: a free new name (the copy's name plus _2 ..), free in his army and period folder
  if (v._goh && !(opt && opt.verb === 'change')) {
    const p = BREED.exec(v._goh.breed), g = p && AG().reader(gohDir(ctx), ctx && ctx.mod);
    if (p && g) { let n = 2; while (g.exists(breedFile(p[1], p[2], p[3] + '_' + n))) n++; v.gohnewid = p[3] + '_' + n; }
  }
  return v;
}
const BREED = /^([a-z0-9_]+)\/([a-z0-9_]+)\/([a-z0-9_]+)$/, NEWID = /^[a-z][a-z0-9_]{0,40}$/;
const breedFile = (army, period, name) => 'resource/set/breed/mp/' + army + '/' + period + '/' + name + '.set';
// the unique check of the new name: taken when a breed file of that name is in any army and period folder (the page sends no army)
function lookFree(ctx, words, opt) {
  const g = AG().reader(gohDir(ctx), (opt && opt.mod) || ctx.mod), w = lc(words).trim();
  if (!g || !NEWID.test(w)) return { results: [], exact: false };
  const hit = g.keys(new RegExp('^resource/set/breed/mp/[a-z0-9_]+/[a-z0-9_]+/' + w + '\\.set$')).slice(0, 5);
  return { results: hit.map(k => ({ id: w, name: k.slice('resource/set/breed/mp/'.length, -4), where: k, ref: { key: k }, sub: '' })), exact: hit.length > 0 };
}

async function compile(draft, c) {
  if (!c.gameDir) throw badK('task.soldier.e.nogoh', 'Set the Gates of Hell folder first (the Game folder button at the top).');
  const v = c.values || {}, m = v._goh;
  if (!m || !m.breed || !BREED.test(m.breed)) throw bad(c.verb === 'change' ? 'Pick the soldier to change first (What to copy).' : 'Pick the soldier to copy first (What to copy).');
  const val = id => c.value(id), notes = [], calls = [];
  const changed = id => !c.kept(id) && val(id) !== undefined && val(id) !== null && val(id) !== '' && JSON.stringify(val(id)) !== JSON.stringify(v[id]);
  if (c.verb !== 'change') return make(c, v, m, val, changed);
  const ch = (field, value) => calls.push({ route: 'POST /api/x/units/change', body: { gid: 'goh', id: m.id, card: m.card, field, value: String(value) }, dryFlag: 'write' });
  if (changed('gohcost')) { const n = Number(val('gohcost')); if (!(n >= 0 && n <= 100000)) throw bad('The price is a number from 0.'); ch('cost', n); }
  const name = String(val('gohname') || '').trim();
  if (changed('gohname') && name) { if (name.length > 80) throw bad('The name is 1 to 80 characters.'); ch('name', name); }
  const { add, del } = kitLines(val);
  if (add.length || del.length) {
    calls.push({ route: 'POST /api/x/units/kit/set', body: { gid: 'goh', breed: m.breed, add, del }, dryFlag: 'write' });
    notes.push('What ' + m.breed + ' carries changes in the mod copy of resource/set/breed/mp/' + m.breed + '.set (the Units page kit edit: the grid checked, an item the game does not know refused). Check it in game [T].');
  }
  if (!calls.length) notes.push('Nothing differs from ' + m.id + ': there is nothing to write.');
  else if (calls.length > (add.length || del.length ? 1 : 0)) notes.push('The price and name change the breed card of ' + m.id + ' through the Units page. Check the buy panel in game [T].');
  return { calls, notes, result: m.breed };
}

// make: the gen steps breed (+ kit) on the GoH target, all into the picked mod
async function make(c, v, m, val, changed) {
  const [, army, period, like] = BREED.exec(m.breed), name = lc(val('gohnewid') || v.gohnewid || '').trim(), notes = [];
  if (!NEWID.test(name)) throw bad('The new name takes small letters, digits and _ only, starting with a letter (up to 41).');
  const g = AG().reader(c.gameDir, c.mod);
  if (!g) throw badK('task.soldier.e.nogoh', 'Set the Gates of Hell folder first (the Game folder button at the top).');
  if (!g.exists(breedFile(army, period, like))) throw bad('The soldier ' + m.breed + ' to copy has no breed file any more. Pick the soldier to copy again.');
  if (g.exists(breedFile(army, period, name))) throw bad('There is already a soldier ' + army + '/' + period + '/' + name + '. Pick a new name.');
  const op = { op: 'breed', name, like, army, period };
  if (changed('gohcost')) { const n = Number(val('gohcost')); if (!(n >= 0 && n <= 100000)) throw bad('The price is a number from 0.'); op.decl = { cost: n % 1 ? String(n) : n.toFixed(1) }; }
  const shown = String(val('gohname') || '').trim();
  if (shown.length > 80) throw bad('The name is 1 to 80 characters.');
  if (shown && changed('gohname')) op.display = shown;
  const { add, del } = kitLines(val);
  if (add.length) {
    const known = new Set((await IG().table(g)).filter(x => !x.pattern).map(x => lc(x.name)));
    const unknown = add.filter(a => !known.has(a.item)).map(a => a.item);
    if (unknown.length) throw bad('Gates of Hell has no item ' + unknown.slice(0, 5).join(', ') + ' (an unknown item name adds nothing). Pick items from the list.');
  }
  const ops = [op];
  if (add.length || del.length) ops.push({ op: 'kit', breed: army + '/' + period + '/' + name, add, del });
  notes.push('A new soldier ' + army + '/' + period + '/' + name + ' copied from ' + like + ': his breed file, his breed card in the period lists that declare ' + like + (op.decl ? ' at ' + op.decl.cost + ' MP' : '') + ', his name' + (ops.length > 1 ? ', what he carries' : '') + '. He is bought only inside a squad: copy a squad and put ' + name + ' in its members. Check it in game [T].');
  return { gen: { ops }, calls: [], notes, result: army + '/' + period + '/' + name };
}
// the item lines of the gohadd and gohdel answers
function kitLines(val) {
  const add = [], del = [];
  for (const s of [].concat(val('gohadd') || []).map(String).filter(x => x.trim())) {
    const x = LINE.exec(lc(s)); if (!x) throw bad('An item line is the item name and a count, like bandage_eng:2: ' + s.slice(0, 60));
    const n = x[2] ? +x[2] : 1; if (n < 1 || n > 100) throw bad('A count is 1 to 100: ' + s.slice(0, 60));
    add.push({ item: x[1].trim().replace(/\s+/g, ' '), count: n });
  }
  for (const s of [].concat(val('gohdel') || []).map(String).filter(x => x.trim())) del.push(lc(s).trim().replace(/\s+/g, ' '));
  return { add, del };
}

// the GoH questions (group goh, first): the new name on make, the rest on make and change
function questions() {
  const P = 'task.soldier.';
  const q = (id, k, o) => Object.assign({ id, kind: k, ask: P + 'q.' + id, help: P + 'h.' + id, covers: [] }, o, { when: Object.assign({ $verb: ['make', 'change'], $game: ['goh'] }, (o && o.when) || {}) });
  return [
    q('gohnewid', 'id', { when: { $verb: 'make' }, unique: { lookup: 'gohbreedname' }, limits: { re: '^[a-z][a-z0-9_]{0,40}$', reHint: P + 'x.name', limit: 'GHLOC-06' } }),
    q('gohname', 'text', { optional: true, limits: { limit: 'GHLOC-06' } }),
    q('gohcost', 'number', { limits: { min: 0, max: 100000, step: 1, unit: 'MP', usual: [5, 200], limit: 'GHGPL-10' } }),
    q('gohadd', 'list', { optional: true, picker: { sources: ['exist', 'value'], lookup: 'gohitem' }, limits: { re: '^[a-z0-9_][a-z0-9_ ]*(\\s*:\\s*[0-9]{1,3})?$', limit: 'GHED-33' } }),
    q('gohdel', 'list', { optional: true, picker: { sources: ['exist', 'value'], lookup: 'gohitem' }, limits: { re: '^[a-z0-9_][a-z0-9_ ]*$', limit: 'GHED-33' } }),
  ];
}

module.exports = { look, lookItem, lookFree, values, compile, questions };

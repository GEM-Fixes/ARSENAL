// recipe "prices", the Gates of Hell branch (game parity 2026-11-23): a percent on every price of one army (or of its vehicles, squads or
// soldiers). Through the Units page (call, not copy): its GoH catalogue for the armies and the count of priced cards, and
// POST /api/x/units/armyprice with gid goh (the cost(N) of each card edited in place in units/<period>/*.set, the mod copy; manpower
// rounded to 5). A squad built by a macro has no price of its own (GHGPL-10): armyprice skips it and says so; the Review shows which.
// Balance > Prices reads GoH prices (its fitted model) and writes nothing; the rest of this task (lists, tabs, rank, cooldown, command
// points, presets money) writes the AS2 forms only. Every change is [T]: no GoH match played.
// Author: Imperator_Aug (ARSENAL, ia-8c9f95a7)
'use strict';
const fs = require('fs');
const bad = (m, s) => Object.assign(new Error(m), { status: s || 400 });
const badK = (k, m) => Object.assign(bad(m), { key: k });
const lc = s => String(s == null ? '' : s).toLowerCase();
const US = () => require('../../units/server');
const gohDir = ctx => { try { return require('./skin.goh').gohDirOf(ctx); } catch (e) { return null; } };
const KINDS = ['all', 'vehicle', 'squad', 'soldier'];
const hit = (w, ...s) => { const ws = lc(w).split(/[\s,]+/).filter(Boolean); return ws.every(x => s.some(y => lc(y).includes(x))); };

async function cat(ctx, opt) {
  const dir = gohDir(ctx); if (!dir) return null;
  const m = (opt && opt.mod) || (ctx && ctx.mod), mod = m && fs.existsSync(String(m)) ? String(m) : null;
  return (await US().lib.both(ctx, dir, mod, true)).cur;
}
const priced = u => u.buyable && u.cost != null;
// the armies with a priced card in the GoH catalogue
async function lookArmy(ctx, words, opt) {
  const cur = await cat(ctx, opt); if (!cur) return [];
  const by = new Map();
  for (const u of cur.units) if (priced(u) && u.army) { const a = lc(u.army); by.set(a, (by.get(a) || 0) + 1); }
  return [...by].sort((x, y) => x[0].localeCompare(y[0])).map(([a, n]) => ({ id: a, name: a, where: '', ref: null, sub: n + ' priced cards' })).filter(r => hit(words, r.id));
}
async function values() { return { gohkind: 'all', gohpct: 0 }; }

function compile(draft, c) {
  if (!c.gameDir) throw badK('task.prices.e.nogoh', 'Set the Gates of Hell folder first (the Game folder button at the top).');
  const army = c.base && c.base.id ? lc(c.base.id) : '';
  if (!/^[a-z0-9_]+$/.test(army)) throw bad('Pick the army whose prices change first.');
  const kind = KINDS.includes(c.value('gohkind')) ? c.value('gohkind') : 'all', p = Number(c.value('gohpct')), calls = [], notes = [];
  if (p) {
    if (!(p >= -90 && p <= 500)) throw bad('Type a percent between -90 and 500 (for example 10 for 10% more expensive, -20 for 20% cheaper).');
    calls.push({ route: 'POST /api/x/units/armyprice', body: { gid: 'goh', army, kind, percent: p }, dryFlag: 'write', ok: r => !!r && !(r.errors || []).length });
    notes.push('Only ' + army + ': the price of every ' + (kind === 'all' ? 'card' : kind + ' card') + ' changes by ' + p + '% in the mod copy of its period list. A squad built by a macro has no price of its own and is skipped (the Review lists it). Check the buy panel in game [T].');
  } else notes.push('Nothing to change: the percent is 0.');
  return { calls, notes, result: army };
}

function questions() {
  const P = 'task.prices.';
  const q = (id, k, o) => Object.assign({ id, kind: k, ask: P + 'q.' + id, help: P + 'h.' + id, covers: [] }, o, { when: Object.assign({ $game: ['goh'] }, (o && o.when) || {}) });
  return [
    q('gohkind', 'choice', { limits: { values: KINDS } }),
    q('gohpct', 'number', { limits: { min: -90, max: 500, step: 1, unit: '%', usual: [-50, 100], limit: 'GHGPL-10' } }),
  ];
}

module.exports = { KINDS, lookArmy, values, compile, questions };

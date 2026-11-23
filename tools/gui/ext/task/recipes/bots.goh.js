// recipe "bots", the Gates of Hell branch (game parity 2026-11-23): add a unit to what the bots of one army buy. Gates of Hell has no
// bot.data.lua (GHMIS-66): its bots buy from purchase lists script/multiplayer/units/<army>/<list>.<army>.lua (early, mid, late,
// conquest ..), picked per lobby mode by bot.main.lua and modes/*.lua. Everything goes through the Bots page (call, not copy):
// lib.gohBuys for the armies, lists, units and classes; lib.buyFirst, which on GoH is gohAddUnit (botrecipe --exe goh: a copy of the
// first row of the asked class with the new unit, --priority when given, CRLF kept; already in the list = nothing written). The task's
// own route POST /api/x/task/r/bots/gohbuy hands the Bots page a GoH ctx and names the mod file (resource/<rel>) for the restore point.
// Not on GoH: bot money, presets and fighting style of this task (AS2 forms); a GoH match is not played by any test [T].
// Author: Imperator_Aug (ARSENAL, ia-c1267567)
'use strict';
const os = require('os'), path = require('path'), fs = require('fs');
const bad = (m, s) => Object.assign(new Error(m), { status: s || 400 });
const badK = (k, m) => Object.assign(bad(m), { key: k });
const lc = s => String(s == null ? '' : s).toLowerCase();
const lib = () => require('../../bots/lib');
const GM = () => require('../../../../lib/games');
const NOMOD = path.join(os.tmpdir(), 'arsenal-task-bots-no-mod');
const WORD = /^[a-z0-9_]+$/, UNIT = /^[A-Za-z0-9_()]+$/;
const gohDir = ctx => { try { return require('./skin.goh').gohDirOf(ctx); } catch (e) { return null; } };
// the ctx the Bots page reads GoH with: the GoH install as its game folder, the game id goh
function gctx(ctx) {
  const g = gohDir(ctx);
  return Object.assign({}, ctx || {}, { game: () => g, gohDir: () => g, curDir: () => g, gameId: () => 'goh', exe: () => GM().exeOf('goh'), kind: () => 'goh' });
}
const modOf = (ctx, opt) => { const m = (opt && opt.mod) || (ctx && ctx.mod); return m && path.isAbsolute(String(m)) && fs.existsSync(String(m)) ? String(m) : NOMOD; };
function buysOf(ctx, opt, list) {
  if (!gohDir(ctx)) return null;
  try { return lib().gohBuys(gctx(ctx), modOf(ctx, opt), list || ''); } catch (e) { return null; }
}
const hit = (w, ...s) => { const ws = lc(w).split(/[\s,]+/).filter(Boolean); return ws.every(x => s.some(y => lc(y).includes(x))); };
// the army of the draft (its base) for the unit and class lookups
function draftArmy(ctx, opt) {
  try { const d = opt && opt.draft ? require('../lib/draft').load(ctx, opt.draft) : null; return d && d.base ? lc(d.base.id) : ''; } catch (e) { return ''; }
}

async function lookArmy(ctx, words, opt) {
  const b = buysOf(ctx, opt); if (!b) return [];
  return b.armies.map(a => ({ id: a, name: b.labels[a] || a, where: (b.files[a] || {}).rel || '', ref: null, sub: a })).filter(r => hit(words, r.id, r.name));
}
async function lookList(ctx, words, opt) {
  const b = buysOf(ctx, opt); if (!b) return [];
  return b.lists.map(l => ({ id: l, name: l, where: '', ref: null, sub: '' })).filter(r => hit(words, r.id));
}
// the units the purchase lists of one army name (every list), else of every army, plus the GoH cards of the Units catalogue
async function lookUnit(ctx, words, opt) {
  const b0 = buysOf(ctx, opt); if (!b0) return [];
  const a = draftArmy(ctx, opt), by = new Map();
  for (const l of b0.lists) {
    const b = l === b0.list ? b0 : buysOf(ctx, opt, l); if (!b) continue;
    for (const s of b.stages) for (const [army, us] of Object.entries(s.armies)) {
      if (a && army !== a) continue;
      for (const u of us) { const k = army + '|' + u.unit; if (!by.has(k)) by.set(k, { id: u.unit, name: u.unit, where: army, ref: null, sub: [army, u.cls, l].filter(Boolean).join(', ') }); }
    }
  }
  // the squads and vehicles of the Units page's GoH catalogue (game plus mod): a unit the lists do not name yet
  for (const kind of ['squad', 'vehicle']) {
    let r = []; try { r = await require('./card.goh').look(kind, ctx, words, Object.assign({}, opt, { limit: 400 })); } catch (e) { r = []; }
    for (const x of r) {
      const id = x.ref && x.ref.id, army = lc(String(x.sub || '').split(',')[0]);
      if (!id || !UNIT.test(id) || (a && army !== a)) continue;
      const k = army + '|' + id; if (!by.has(k)) by.set(k, { id, name: id, where: army, ref: null, sub: [army, kind, 'not in a purchase list yet'].join(', ') });
    }
  }
  return [...by.values()].filter(r => hit(words, r.id)).slice(0, (opt && opt.limit) || 400);
}
async function lookCls(ctx, words, opt) {
  const b0 = buysOf(ctx, opt); if (!b0) return [];
  const s = new Set();
  for (const l of b0.lists) { const b = l === b0.list ? b0 : buysOf(ctx, opt, l); if (b) for (const st of b.stages) for (const us of Object.values(st.armies)) for (const u of us) if (u.cls) s.add(u.cls); }
  return [...s].sort().map(c => ({ id: c, name: c, where: '', ref: null, sub: '' })).filter(r => hit(words, r.id));
}
async function values(ctx, base, opt) {
  const b = buysOf(ctx, opt), out = { gohadd: false, gohpri: 1 };
  if (b && b.lists.length) out.gohlist = b.list;
  return out;
}

function compile(draft, c) {
  if (!c.gameDir) throw badK('task.bots.e.nogoh', 'Set the Gates of Hell folder first (the Game folder button at the top).');
  const army = c.base && c.base.id ? lc(c.base.id) : '';
  if (!WORD.test(army)) throw bad('Pick the army whose bots change first.');
  const val = id => c.value(id), notes = [], calls = [];
  if (val('gohadd') === true) {
    const unit = String(val('gohunit') || '').trim(), list = lc(val('gohlist')), cls = String(val('gohcls') || '').trim();
    if (!UNIT.test(unit)) throw bad('Pick the unit by its name in the purchase lists (letters, digits, _ and brackets).');
    if (!WORD.test(list)) throw bad('Pick the purchase list (early, mid, late, conquest ..).');
    if (cls && !/^\w+$/.test(cls)) throw bad('Pick the bot class from the list.');
    const body = { army, list, unit };
    if (cls) body.cls = cls;
    const p = c.answer('gohpri');
    if (p && p.src !== 'keep' && val('gohpri') != null && val('gohpri') !== '') {
      const n = Number(val('gohpri')); if (!(n >= 0 && n <= 10000)) throw bad('Priority: a number from 0 up, for example 1.5.');
      body.priority = n;
    }
    calls.push({ route: 'POST /api/x/task/r/bots/gohbuy', body, dryFlag: 'write', ok: r => !!r && r.ok === true });
    notes.push('Only ' + army + ': one row in its purchase list ' + list + ' (script/multiplayer/units/' + army + '/' + list + '.' + army + '.lua), a copy of the first row' + (cls ? ' of class ' + cls : '') + ' with ' + unit + '. Play a match against a bot to see it bought [T].');
  }
  if (!calls.length) notes.push('Nothing to change: answer Yes to adding a unit.');
  return { calls, notes, result: army };
}
// the task's own route: the Bots page add-a-unit with a GoH ctx; the file it writes named under resource/ for the restore point
async function buyRoute(url, b, ctx) {
  if (!gohDir(ctx)) throw badK('task.bots.e.nogoh', 'Set the Gates of Hell folder first (the Game folder button at the top).');
  const r = await lib().buyFirst(gctx(ctx), Object.assign({}, b || {}));
  const out = Object.assign({}, r);
  if (r && typeof r.rel === 'string') out.rel = 'resource/' + r.rel;
  return out;
}

function questions() {
  const P = 'task.bots.';
  const q = (id, k, o) => Object.assign({ id, kind: k, ask: P + 'q.' + id, help: P + 'h.' + id, covers: [] }, o, { when: Object.assign({ $game: ['goh'] }, (o && o.when) || {}) });
  const Y = { gohadd: true };
  return [
    q('gohadd', 'yesno', {}),
    q('gohlist', 'thing', { when: Y, picker: { sources: ['exist'], lookup: 'gohlist' }, limits: { limit: 'GHMIS-66' } }),
    q('gohunit', 'thing', { when: Y, picker: { sources: ['exist'], lookup: 'gohunit' }, limits: { re: '^[A-Za-z0-9_()]+$' } }),
    q('gohcls', 'thing', { when: Y, optional: true, picker: { sources: ['keep', 'exist'], lookup: 'gohcls' } }),
    q('gohpri', 'number', { when: Y, optional: true, limits: { min: 0, max: 10000, step: 0.1, unit: 'x', usual: [0.5, 5] } }),
  ];
}

module.exports = { gctx, lookArmy, lookList, lookUnit, lookCls, values, compile, buyRoute, questions };

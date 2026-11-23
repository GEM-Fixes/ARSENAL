// recipe "prices": the prices of a whole army. One change for many cards (by percent, add, times, set, to the price model) or a table
// of new values, on the multiplayer list or a co-op or mode list; command points, kill score and capture weight by percent; the money
// rules of presets_all.inc. Writes through the units page (armyprice: a percent on every price of the army) or the Balance page
// (balance/change, one call per money: tabs, money, rounding step, add, times, set, price model, the other fields) and gen card / preset ops;
// the Review step shows every file first. Census: census/prices.json. Contract: ../README.md. Author: Imperator_Aug (ARSENAL, ia-5d2e81c4)
// Author: Imperator_Aug (ARSENAL, ia-86472a6b)
'use strict';
const A = require('./army.recipe'), RD = A._read;

const TAG = /^[a-z][a-z0-9_]{0,15}$/, ID = '[A-Za-z0-9_.()]+';
const bad = (m, s) => Object.assign(new Error(m), { status: s || 400 });
const lower = s => String(s == null ? '' : s).toLowerCase();
const PG = () => require('./prices.goh');   // Gates of Hell branch
const same = (a, b) => JSON.stringify(a == null ? '' : a) === JSON.stringify(b == null ? '' : b);
const FIELDS = ['cost', 'level', 'charge', 'fore', 'wait'];
const UNITS = { cost: 'mp', level: 'rank', charge: 's', fore: '', wait: 's' };
const RANGE = { cost: [0, 100000, 5], level: [0, 50, 1], charge: [0, 3600, 1], fore: [-10, 1, 0.05], wait: [0, 7200, 1] };
const ADD = { cost: [-5000, 5000, 5], level: [-50, 50, 1], charge: [-3600, 3600, 1], fore: [-10, 10, 0.05], wait: [-7200, 7200, 1] };
const CARDF = { cost: 'cost', level: 'level', charge: 'c', fore: 'fore' };          // gen card field names
const BALF = { cost: 'cost', level: 'rank', charge: 'charge', fore: 'fore', wait: 'wait' };   // Balance page field names
const LISTS = ['common', 'cooperative', 'combat', 'frontline', 'battle_zones', 'captureflag'];
const PRESETS = 'resource/set/multiplayer/games/presets_all.inc';

// one question per field for add and set (the head start has its own help: what its numbers mean); a table per field, filled with
// every card of the army and its value now
const perField = (pre, ask, help, R) => FIELDS.map(f => ({ id: pre + f, kind: 'number', ask, help: f === 'fore' ? help + 'fore' : help, covers: [], when: { how: pre === 'add' ? 'add' : 'set', field: f },
  limits: Object.assign({ min: R[f][0], max: R[f][1], step: R[f][2], limit: 'SDL-30' }, UNITS[f] ? { unit: UNITS[f] } : {}) }));
const setQs = perField('set', 'task.prices.q.set', 'task.prices.h.set', RANGE), addQs = perField('add', 'task.prices.q.add', 'task.prices.h.add', ADD);
const tableQs = FIELDS.map(f => ({ id: 'table' + f, kind: 'list', ask: 'task.prices.q.table', help: 'task.prices.h.table', covers: ['change.table'], optional: true, when: { how: 'table', field: f }, limits: { re: '^' + ID + '\\s+-?\\d+(\\.\\d+)?$' } }));
const RULE = ['pct', 'add', 'mul', 'set', 'model'];
// the most common value of a field among cards (what "set" offers first)
function common(cards, f) { const n = new Map(); for (const x of cards) if (x[f] != null) n.set(x[f], (n.get(x[f]) || 0) + 1); let best, k = 0; for (const [v, c] of n) if (c > k) { best = v; k = c; } return best; }

// the new value of one card field, kept inside the game's range and rounded like the Balance page does
function fit(f, v, hero, step) {
  const [lo, hi] = RANGE[f], st = f === 'cost' ? (hero ? 1 : step || 5) : f === 'fore' ? 0.05 : 1;
  const n = Math.min(hi, Math.max(lo, Math.round(v / st) * st));
  return f === 'fore' ? Math.round(n * 100) / 100 : n;
}
const r2 = v => Math.round(v * 100) / 100;

module.exports = {
  id: 'prices',
  verbs: ['change'],
  // GoH (2026-11-23): the group goh, a percent on the prices of one army through the Units page armyprice (prices.goh.js); every other
  // question is AS2 only (the loop at the end): GoH resupply and money are other blocks (resupplycost, GHCQ-08; GHCQ-25)
  games: ['as64', 'mowas2', 'goh'],
  needs: ['mod'],
  order: 65,
  title: 'task.prices.t',
  test: 'task.prices.test',
  census: 'prices',
  base: { lookup: 'army' },
  groups: [
    { id: 'goh', title: 'task.prices.g.goh', essential: true, q: require('./prices.goh').questions() },
    // this army only: its cards in its lists
    { id: 'how', title: 'task.prices.g.how', essential: true, q: [
      { id: 'list', kind: 'choice', ask: 'task.prices.q.list', help: 'task.prices.h.list', covers: ['pick.list'], limits: { values: LISTS, limit: 'TST-94' } },
      { id: 'field', kind: 'choice', ask: 'task.prices.q.field', help: 'task.prices.h.field', covers: ['change.field', 'card.cost', 'card.level', 'card.charge', 'card.fore'], limits: { values: FIELDS, limit: 'SDL-30' } },
      { id: 'how', kind: 'choice', ask: 'task.prices.q.how', help: 'task.prices.h.how', covers: ['change.mode'], limits: { values: RULE.concat(['table']) } },
      // which cards: asked for a rule only (a table names its cards); the money only when every tab is picked
      { id: 'kind', kind: 'choice', ask: 'task.prices.q.kind', help: 'task.prices.h.kind', covers: ['pick.kind'], when: { how: RULE }, limits: { values: ['all', 'vehicle', 'squad'] } },
      { id: 'tab', kind: 'choice', ask: 'task.prices.q.tab', help: 'task.prices.h.tab', covers: ['pick.filter'], when: { how: RULE }, limits: { values: ['all', 'squad1', 'squad2', 'v1', 'v2', 'v3', 'v4', 'v5', 'hero'] } },
      { id: 'res', kind: 'choice', ask: 'task.prices.q.res', help: 'task.prices.h.res', covers: ['pick.resource'], when: { how: RULE, tab: 'all' }, limits: { values: ['all', 'mp', 'sp'] } },
      { id: 'round', kind: 'number', ask: 'task.prices.q.round', help: 'task.prices.h.round', covers: ['change.round'], when: { field: 'cost' }, limits: { min: 1, max: 100, step: 1, unit: 'mp', usual: [5, 10] } },
      { id: 'percent', kind: 'number', ask: 'task.prices.q.percent', help: 'task.prices.h.percent', covers: ['change.percent'], when: { how: 'pct' }, limits: { min: -90, max: 500, step: 1, unit: '%', usual: [-50, 100] } },
      { id: 'factor', kind: 'number', ask: 'task.prices.q.factor', help: 'task.prices.h.factor', covers: [], when: { how: 'mul' }, limits: { min: 0.1, max: 10, step: 0.01, unit: 'x', usual: [0.5, 2] } },
    ].concat(addQs, setQs, tableQs) },
    { id: 'points', title: 'task.prices.g.points', essential: false, q: [
      { id: 'cppct', kind: 'number', ask: 'task.prices.q.cppct', help: 'task.prices.h.cppct', covers: ['card.cp'], limits: { min: -90, max: 500, step: 1, unit: '%', limit: 'SDL-30', usual: [-50, 100] } },
      { id: 'scorepct', kind: 'number', ask: 'task.prices.q.scorepct', help: 'task.prices.h.scorepct', covers: ['card.score'], limits: { min: -90, max: 500, step: 1, unit: '%', usual: [-50, 100] } },
      { id: 'cwpct', kind: 'number', ask: 'task.prices.q.cwpct', help: 'task.prices.h.cwpct', covers: ['card.cw'], limits: { min: -90, max: 500, step: 1, unit: '%', usual: [-50, 100] } },
    ] },
    // every army: the money rules of presets_all.inc (left as they are unless asked)
    { id: 'economy', title: 'task.prices.g.economy', essential: false, q: [
      { id: 'scope', kind: 'choice', ask: 'task.prices.q.scope', help: 'task.prices.h.scope', covers: [], limits: { values: ['all', 'standard_all', 'custom_all'] } },
      // one number each, written for every card ('*='); a value with tag rows is replaced whole (Review says so)
      { id: 'commandpoints', kind: 'number', ask: 'task.prices.q.commandpoints', help: 'task.prices.h.commandpoints', covers: ['economy.commandpoints'], limits: { min: 1, max: 10000, step: 1, unit: 'cp', usual: [60, 300] } },
      { id: 'chargefactors', kind: 'number', ask: 'task.prices.q.chargefactors', help: 'task.prices.h.chargefactors', covers: ['economy.chargefactors'], limits: { min: 0, max: 10, step: 0.05, unit: 'x', usual: [0.5, 2] } },
      { id: 'budgetmode', kind: 'choice', ask: 'task.prices.q.budgetmode', help: 'task.prices.h.budgetmode', covers: ['economy.budget.mode'], limits: { values: ['standard', 'custom', 'with_update', 'without_update', 'fullpayback'] } },
      { id: 'growtime', kind: 'number', ask: 'task.prices.q.growtime', help: 'task.prices.h.growtime', covers: ['economy.budget.growtime'], limits: { min: 60, max: 7200, step: 1, unit: 's', usual: [600, 3600] } },
      { id: 'growtable', kind: 'text', ask: 'task.prices.q.growtable', help: 'task.prices.h.growtable', covers: ['economy.budget.growtable'], limits: { re: '^\\d+(\\.\\d+)?( \\d+(\\.\\d+)?)*$' } },
      { id: 'limitmin', kind: 'number', ask: 'task.prices.q.limitmin', help: 'task.prices.h.limitmin', covers: ['economy.budget.limitmin'], limits: { min: 0, max: 1000000, step: 1, unit: 'mp' } },
      { id: 'limitmax', kind: 'number', ask: 'task.prices.q.limitmax', help: 'task.prices.h.limitmax', covers: ['economy.budget.limitmax'], limits: { min: 0, max: 1000000, step: 1, unit: 'mp' } },
      { id: 'speedset', kind: 'text', ask: 'task.prices.q.speedset', help: 'task.prices.h.speedset', covers: ['economy.budget.speedset'], limits: { re: '^\\d+( \\d+)*$' } },
    ] },
  ],
  kept: [
    ['pick.army', 'built in step: the "what to change" step picks the army'],
    ['soldier.cp', 'owned by the soldier task: soldiers.set types are shared by every army; that task changes a type\'s points'],
    ['soldier.score', 'owned by the soldier task: soldiers.set types are shared by every army; that task changes a type\'s points'],
    ['soldier.cw', 'owned by the soldier task: soldiers.set types are shared by every army; that task changes a type\'s points'],
    ['economy.balancingfactorbonus', 'owned by the bots task: the bonus of each lobby preset (Game Modes page, presets files)'],
    ['economy.budget.start', 'owned by the bots task: the start money of each lobby preset (Game Modes page, presets files)'],
    ['economy.budget.finish', 'owned by the bots task: the end money of each lobby preset (Game Modes page, presets files)'],
    ['economy.budget.payback', 'owned by the bots task: the payback of each lobby preset (Game Modes page, presets files)'],
    ['economy.unitlimits', 'owned by the army task (rules every army shares)'],
    ['check.preview', 'built in step: the Review step lists every file and the Balance page dry run has the old and new values'],
    ['check.hints', 'look only: the Units page hints show what similar units cost; nothing to write'],
    ['check.mpsync', 'built in step: the Check step runs the mod check after the write [I]'],
  ],
  checklist: ['task.prices.c.panel', 'task.prices.c.buy', 'task.prices.c.cool', 'task.prices.c.money', 'task.prices.c.log'],
  lookups: { army: async (ctx, words, opt) => (RD.gidOf(ctx, opt && opt.game) === 'goh' ? PG().lookArmy(ctx, words, opt) : RD.lookArmy(ctx, words, opt)) },
  values: async (ctx, base, opt) => {
    if (RD.gidOf(ctx, opt && opt.game) === 'goh') return PG().values(ctx, base, opt);
    const out = { kind: 'all', tab: 'all', res: 'all', round: 5, list: 'common', field: 'cost', how: 'pct', percent: 0, factor: 1, cppct: 0, scorepct: 0, cwpct: 0, scope: 'all' };
    for (const f of FIELDS) out['add' + f] = 0;
    // the game: MoW:AS2 reads the mowas_2 file set (army.recipe reader), AS64 as before
    const g = RD.reader(RD.gameOf(ctx), ctx && ctx.mod, RD.gidOf(ctx, opt && opt.game)); if (!g) return out;
    // set: the value most cards have now; table: every card of the army with its value now (lines left as they are change nothing)
    const army = base && base.id ? lower(base.id) : '', cs = TAG.test(army) ? RD.cards(g, army) : [];
    for (const f of FIELDS) {
      const v0 = common(cs, f); if (v0 !== undefined) out['set' + f] = v0;
      const rows = cs.filter(x => x[f] != null).map(x => x.id + ' ' + x[f]); if (rows.length) out['table' + f] = rows;
    }
    const pa = g.readStr(PRESETS) || '', m = re => { const x = re.exec(pa); return x ? x[1] : undefined; };
    const v = { chargefactors: m(/\{\s*chargeFactors\s*\{\s*value\s+"([^"]*)"/i), commandpoints: m(/\{\s*commandPoints\s+"([^"]*)"/i), budgetmode: m(/\{\s*vehicle\s*\{\s*mode\s+"([^"]*)"/i), growtime: m(/\{\s*growTime\s+(\d+)/i),
      growtable: m(/\{\s*growTable\s+"([^"]*)"/i), limitmin: m(/\{\s*limitmin\s+(\d+)/i), limitmax: m(/\{\s*limitmax\s+(\d+)/i), speedset: m(/\{\s*speedset\s+"([^"]*)"/i) };
    for (const k of ['growtime', 'limitmin', 'limitmax']) if (v[k] !== undefined) v[k] = Number(v[k]);
    for (const k of ['growtable', 'speedset']) if (v[k] !== undefined) v[k] = v[k].trim().replace(/\s+/g, ' ');
    // one number for every card ("*=N"); the stock "*=%cp" (the lobby's own number) and a value with tag rows show no number
    for (const k of ['commandpoints', 'chargefactors']) { const x = /^\s*\*\s*=\s*(\d+(?:\.\d+)?)\s*;?\s*$/.exec(v[k] || ''); v[k] = x ? Number(x[1]) : undefined; }
    for (const [k, x] of Object.entries(v)) if (x !== undefined) out[k] = x;
    return out;
  },
  compile: async (draft, c) => {
    if (RD.gidOf(null, c.game) === 'goh') return PG().compile(draft, c);
    const army = c.base && c.base.id ? lower(c.base.id) : '';
    if (!TAG.test(army)) throw bad('Pick the army whose prices change first.');
    const g = RD.reader(c.gameDir, c.mod, RD.gidOf(null, c.game));
    if (!g) throw bad('No game folder found. Press "Game folder..." in the top bar and pick the Assault Squad 2 folder.');
    const ops = [], calls = [], notes = [];
    const said = id => { const a = c.answer(id); return !!a && a.src !== 'keep' && !same(c.value(id), c.values[id]); };
    const kind = c.value('kind') || 'all', tab = c.value('tab') || 'all', res = c.value('res') || 'all', step = Number(c.value('round')) || 5, list = c.value('list') || 'common', field = c.value('field') || 'cost', how = c.value('how') || 'pct';
    const all = RD.cards(g, army);
    if (!all.length) throw bad('The army ' + army + ' has no cards in the multiplayer lists.');
    let pick = all.filter(x => (kind === 'all' || x.kind === kind) && (tab === 'all' || x.tab === tab) && (res === 'all' || (res === 'sp') === (x.tab === 'hero')));
    const TABN = { squad1: 'squads', squad2: 'squads', hero: 'vehicles' };
    if (how !== 'table' && kind !== 'all' && tab !== 'all' && TABN[tab] && TABN[tab] !== kind + 's') throw bad('The ' + tab + ' tab holds no ' + kind + 's. Pick All tabs, or ' + (kind === 'squad' ? 'Vehicles and guns' : 'Squads') + ' as the units that change.');
    if (how !== 'table' && kind !== 'all' && tab !== 'all' && !TABN[tab] && kind === 'squad') throw bad('The ' + tab + ' tab holds no squads. Pick All tabs, or Vehicles and guns as the units that change.');
    if (said('round') && (!Number.isInteger(step) || step < 1 || step > 100)) throw bad('Prices round to a whole step from 1 to 100 manpower.');
    if (list !== 'common') {
      const sq = pick.filter(x => x.kind === 'squad').length;
      if (sq) notes.push(sq + ' squad cards are left out: a ' + list + ' list takes vehicle cards only.');
      pick = pick.filter(x => x.kind === 'vehicle');
    }
    const cardOp = (x, fields) => Object.assign({ op: 'card', unit: x.name, army, fields }, list !== 'common' ? { list } : {});
    // the main change: only when the value for the chosen way is answered
    const val = how === 'pct' ? 'percent' : how === 'mul' ? 'factor' : how === 'add' ? 'add' + field : how === 'set' ? 'set' + field : how === 'table' ? 'table' + field : null;
    const go = how === 'model' ? said('how') : val && c.answer(val) && c.answer(val).src !== 'keep' && !(how === 'pct' && !Number(c.value('percent'))) && !(how === 'mul' && Number(c.value('factor')) === 1) && !(how === 'add' && !Number(c.value(val)));
    if (go) {
      if (how === 'model' && field !== 'cost') throw bad('The price model sets prices only. Pick price as the thing to change, or another way.');
      if (how === 'table') {
        // a line as the table was filled (the card's value now) changes nothing; a deleted line changes nothing either
        const before = new Set([].concat(c.values[val] || []).map(s => lower(String(s).trim().replace(/\s+/g, ' '))));
        const rows = [].concat(c.value(val) || []).map(s => String(s).trim()).filter(Boolean).filter(s => !before.has(lower(s.replace(/\s+/g, ' ')))).map(s => s.split(/\s+/));
        if (!rows.length) notes.push('The table is as the cards have it now: nothing to change there.');
        const bySquad = new Map();
        for (const [id, v] of rows) {
          const x = all.find(y => lower(y.id) === lower(id));
          if (!x) throw bad('No card ' + id + ' in the ' + army + ' lists. Squads are written as name(' + army + '), for example smgs(' + army + ').');
          const n = Number(v), [lo, hi] = RANGE[field];
          if (!(n >= lo && n <= hi)) throw bad(id + ': ' + field + ' is from ' + lo + ' to ' + hi + ' ' + UNITS[field] + '.');
          if (x.kind === 'vehicle' && CARDF[field]) ops.push(cardOp(x, { [CARDF[field]]: String(fit(field, n, x.tab === 'hero', step)) }));
          else if (list !== 'common') throw bad(id + ': a ' + list + ' list holds vehicle cards, and only their price, rank, cooldown and head start.');
          else { const k = String(fit(field, n, x.tab === 'hero', step)); if (!bySquad.has(k)) bySquad.set(k, []); bySquad.get(k).push(x.id); }
        }
        for (const [v, ids] of bySquad) calls.push({ route: 'POST /api/x/balance/change', body: Object.assign({ ids, field: BALF[field], op: 'set', value: Number(v) }, field === 'cost' && step !== 5 ? { step } : {}) });
      } else {
        // a plain percent on every price of the army (or of its vehicles or squads): the units page armyprice route, one call; it
        // rounds manpower to 5 and special points to whole points itself (tools/gen/test/armyprice.js: every stock army priced)
        const wide = list === 'common' && field === 'cost' && how === 'pct' && tab === 'all' && res === 'all' && step === 5;
        // the rest: one Balance page change per money, hero cards (special points) and the rest (manpower) never mixed. balance/change
        // alone filters by tab and money, rounds to another step, adds, multiplies, sets, fits the price model and changes rank,
        // cooldown, head start and wait.
        let heroes = [];
        if (field === 'cost' && tab === 'all' && !wide) {
          heroes = pick.filter(x => x.tab === 'hero'); pick = pick.filter(x => x.tab !== 'hero');
          if (heroes.length && pick.length && (how === 'model' || how === 'add' || how === 'set')) { notes.push(heroes.length + ' hero cards are left out: they are paid with special points (pick special points as the money to change them).'); heroes = []; }
        }
        if (!pick.length && !heroes.length) throw bad('No card of ' + army + ' is ' + (kind === 'all' ? 'a card' : kind === 'squad' ? 'a squad' : 'a vehicle or gun') + (tab !== 'all' ? ' on the ' + tab + ' tab' : '') + (res !== 'all' ? ' paid with ' + (res === 'sp' ? 'special points' : 'manpower') : '') + '. Pick All for the units, the tab or the money.');
        if (wide) {
          const ok = r => !!r && !(r.errors || []).length && !(r.skipped || []).length;
          calls.push({ route: 'POST /api/x/units/armyprice', body: { army, kind, percent: Number(c.value('percent')) }, dryFlag: 'write', ok });
        } else if (list === 'common') {
          const body = ids => ({ ids, field: BALF[field], op: how === 'model' ? 'fit' : how, value: how === 'model' ? null : Number(c.value(val)) });
          // the rounding step is for manpower prices; hero prices (special points) keep whole points
          if (pick.length) calls.push({ route: 'POST /api/x/balance/change', body: Object.assign(body(pick.map(x => x.id)), field === 'cost' && step !== 5 ? { step } : {}) });
          if (heroes.length) calls.push({ route: 'POST /api/x/balance/change', body: body(heroes.map(x => x.id)) });
        } else {
          pick = pick.concat(heroes);
          if (how === 'model' || field === 'wait') throw bad('A ' + list + ' list card can change its price, rank, cooldown and head start by percent, add, times or set; the price model and the wait at start are for the multiplayer list.');
          const v = Number(c.value(val));
          for (const x of pick) {
            const old = x[field]; if (old == null) continue;
            const nv = fit(field, how === 'pct' ? old * (1 + v / 100) : how === 'add' ? old + v : how === 'mul' ? old * v : v, x.tab === 'hero', step);
            if (nv !== old) ops.push(cardOp(x, { [CARDF[field]]: String(nv) }));
          }
        }
      }
    }
    // command points, kill score, capture weight: vehicle cards only (squads take them from their soldiers)
    const pts = [['cppct', 'cp', 0], ['scorepct', 'sc', 2], ['cwpct', 'cw', 0]].filter(([q]) => said(q) && Number(c.value(q)));
    if (pts.length) {
      for (const x of pick.filter(y => y.kind === 'vehicle')) {
        const fields = {};
        for (const [q, f, d] of pts) { const old = x[f]; if (!old) continue; const nv = d ? r2(old * (1 + Number(c.value(q)) / 100)) : Math.max(0, Math.round(old * (1 + Number(c.value(q)) / 100))); if (nv !== old) fields[f] = d ? nv.toFixed(2) : String(nv); }
        if (Object.keys(fields).length) ops.push(cardOp(x, fields));
      }
    }
    // money rules of presets_all.inc
    const set = {};
    const pa = g.readStr(PRESETS) || '', now = re => { const x = re.exec(pa); return x ? x[1] : ''; };
    if (said('commandpoints')) { set.commandPoints = '=*=' + Math.round(Number(c.value('commandpoints'))); const o = now(/\{\s*commandPoints\s+"([^"]*)"/i); if (o) notes.push('Command points: "' + o + '" (the lobby\'s own number) becomes ' + Math.round(Number(c.value('commandpoints'))) + ' for every unit.'); }
    if (said('chargefactors')) { set.chargeFactors = '=*=' + Number(c.value('chargefactors')); const o = now(/\{\s*chargeFactors\s*\{\s*value\s+"([^"]*)"/i); if (o && !/^\s*\*\s*=\s*[\d.]+\s*;?\s*$/.test(o)) notes.push('Cooldown factor: "' + o + '" is replaced by one factor for every card.'); }
    const lo = said('limitmin') || said('limitmax') ? Number(c.value('limitmin')) : NaN, hi = Number(c.value('limitmax'));
    if (isFinite(lo) && isFinite(hi) && hi < lo) throw bad('The highest money the host can pick must be at least the lowest (' + lo + ').');
    if (said('budgetmode')) set['budgets/vehicle/mode'] = String(c.value('budgetmode'));
    if (said('growtime')) set['budgets/vehicle/resource/growTime'] = String(c.value('growtime'));
    if (said('growtable')) set['budgets/vehicle/resource/growTable'] = String(c.value('growtable')).trim();
    if (said('limitmin')) set['budgets/vehicle/resource/limitmin'] = String(c.value('limitmin'));
    if (said('limitmax')) set['budgets/vehicle/resource/limitmax'] = String(c.value('limitmax'));
    if (said('speedset')) set['budgets/vehicle/resource/speedset'] = String(c.value('speedset')).trim();
    if (Object.keys(set).length) {
      const sc = c.value('scope') || 'all';
      ops.push({ op: 'preset', file: 'presets_all.inc', name: sc, set });
      notes.push('Every army (' + RD.armies(g).filter(a => a.id == null || a.id >= 0).map(a => a.tag).join(', ') + '), not only ' + army + ': the money rules change in presets_all.inc, ' + (sc === 'all' ? 'standard and custom lobbies' : sc) + '.');
    }
    const own = ops.filter(o => o.op === 'card').length + calls.length;
    if (own) notes.push('Only ' + army + ': its cards change' + (list !== 'common' ? ' in the ' + list + ' list' : '') + '.');
    if (!ops.length && !calls.length) notes.push('Nothing to change: every answer is as the game has it.');
    return { gen: ops.length ? { ops } : null, calls, notes, result: army };
  },
};
// the AS2 questions: asked on the AS2 tabs only (the goh group is the Gates of Hell form)
for (const g of module.exports.groups) for (const q of g.q) if (!/^goh/.test(q.id)) q.when = Object.assign({}, q.when || {}, { $game: ['as64', 'mowas2'] });

#!/usr/bin/env node
// cards: GoH buy cards -> AS2 buy cards (CARD-1, sheet Q55 Q104 Q68). Reads GoH base + Valour paks, writes only to --out.
//   node tools/cards/cards.js --out <dir> [--units a,b,..] [--sample N --seed S] [--rosters mid,late,early,conquest]
//        [--goh <GoH install>] [--valour <GoH workshop mod>] [--list] [--budgets <file>] [--stats]
//   --units  names of GoH cards (exact block name)        --sample N  N cards spread over card classes, seeded (--seed, default 1)
//   --list   print which cards spend dp (doctrine button) and counts; writes nothing
//   --budgets  AS2 budgets text to validate against (default: the structure below); --out gets cards.set, budgets.inc, report.txt
// mapping (all [I] until MP-1 buys them in game):
//   GoH button  doctrine -> hero (budget {hero {resource {tag "special"}} {buttons "hero"}}), cost = dp 1:1
//   inf1 -> squad1   inf2 -> squad2   vehicles -> v1   empl -> v2   tanks -> v3 (light) | v4 (medium, default) | v5 (heavy)
//   cost 1:1 on main budget `vehicle`; cw, cp, level, tags, group, content carried; {charge {delay D}{interval I}} -> {charge I}
//   tier: doctrine group doctrine_tN -> N, else research_stage; carried as tag tierN
// Author: Imperator_Aug (ARSENAL, ia-5a7a7de6)
require('../lib/help')(__filename); // --help / -h: header usage, exit 0 (HELPFIX2)
const fs = require('fs'), path = require('path');
const ps = require('../lib/pakset'), sdlx = require('../lib/sdlx'), enc = require('../lib/enc');

const DEF_GOH = require('../lib/gamedir').goh();
const DEF_VAL = require('../lib/gamedir').workshop(400750, 2537987794);
const ROSTERS = ['early', 'mid', 'late', 'conquest'];
const BTN = { inf1: 'squad1', inf2: 'squad2', vehicles: 'v1', empl: 'v2', doctrine: 'hero', td: 'v4' };
const TANK = { light: 'v3', medium: 'v4', heavy: 'v5' };
const SIDES = new Set(['ger', 'rus', 'usa', 'eng', 'fin', 'uk', 'fra', 'ita', 'hun', 'jap', 'pol', 'usaf']);

// AS2 budget structure (sheet Q55/Q104): main + hero. start/finish are placeholders for MP-1.
const BUDGETS = `{budgets
	{vehicle
		{mode "standard"}
		{resource
			{start 1000}
			{finish 1000}
			{growTime 1}
		}
		{buttons "squad1 squad2 v1 v2 v3 v4 v5"}
	}
	{hero
		{resource
			{start 10}
			{tag "special"}
		}
		{buttons "hero"}
	}
}
`;

// ---- load -------------------------------------------------------------------------------------------------------
// merged GoH virtual file map: base resource/**.pak, then Valour resource/*.pak overriding same key
function openGoh(goh, valour) {
  const sets = [], map = new Map();
  for (const root of [path.join(goh, 'resource'), valour && path.join(valour, 'resource')]) {
    if (!root) continue;
    const o = ps.open(root, new Set(['.set', '.inc']));
    sets.push(o);
    for (const e of o.entries) map.set(e.key, e);
  }
  return { map, close() { sets.forEach(s => s.close()); } };
}

const kid = (b, name) => b.items.find(i => i.k === 'BLOCK' && i.items[0] && i.items[0].text === name);
const val = (b, name) => { const k = kid(b, name); return k && k.items[1] ? (k.items[1].k === 'STRING' ? k.items[1].value : k.items[1].text) : undefined; };
const num = (b, name) => { const v = val(b, name); return v === undefined || v === '' || isNaN(+v) ? undefined : +v; };

function collect(items, out, src, sold) {
  for (const t of items) {
    if (t.k !== 'BLOCK' || !t.items.length) continue;
    if (t.items[0].k === 'STRING') {
      if (kid(t, 'button')) out.push(toCard(t, src));
      else if (/^mp\//.test(t.items[0].value) && num(t, 'cost') !== undefined) sold.set(t.items[0].value, num(t, 'cost'));
    } else if (t.items[0].text === 'units') collect(t.items.slice(1), out, src, sold);
  }
}

function toCard(b, src) {
  const ch = kid(b, 'charge');
  const tags = (val(b, 'tags') || '').split(/\s+/).filter(Boolean);
  return {
    name: b.items[0].value, src, line: b.line,
    button: val(b, 'button'), cost: num(b, 'cost'), cw: num(b, 'cw'), cp: num(b, 'cp'), level: num(b, 'level'),
    stage: num(b, 'research_stage'), tags, group: val(b, 'group'), content: val(b, 'content'),
    doctrine: val(b, 'doctrine'), score: num(b, 'score'), scf: num(b, 'squad_cost_factor'), round: num(b, 'round_multiple'),
    delay: ch && num(ch, 'delay'), interval: ch && num(ch, 'interval'), chargeFlat: ch && ch.items[1] && ch.items[1].k !== 'BLOCK' ? +ch.items[1].text : undefined,
  };
}

// → [{name, button, cost, ...}] every card of the named rosters (later roster/Valour wins nothing: same name kept per roster)
function loadCards(gx, rosters = ROSTERS) {
  const cards = [], errs = {};
  for (const r of rosters) {
    const key = 'set/multiplayer/units/roster_' + r + '.set', e = gx.map.get(key);
    if (!e) continue;
    const res = sdlx.read(ps.read(e), {
      file: key, key,
      open: k => { const x = gx.map.get(k.key || k); return x ? { buf: ps.read(x), file: x.key, key: x.key } : null; },
      onError: (f, l, c) => { errs[c] = (errs[c] || 0) + 1; },
    });
    const out = [], sold = new Map();
    collect(res.root.items, out, r, sold);
    out.forEach(c => { c.crewCost = crewCost(c, sold); });
    cards.push(...out);
  }
  cards.errs = errs;
  return cards;
}

// squad_cost_factor 1 (default for non-doctrine cards): cost = card cost + sum(crew soldier cost x n) [GoH settings.set header], then round_multiple.
// content "veh ( mp/ger/mid/x:2 mp/.. )" -> soldiers named in it. returns {sum, missing[]}
function crewCost(c, sold) {
  const refs = [...String(c.content || '').matchAll(/(mp\/[\w\/\-.()]+?)(?::(\d+))?(?=[\s)]|$)/g)];
  let sum = 0; const missing = [];
  for (const m of refs) {
    const k = m[1], n = m[2] === undefined ? 1 : +m[2];
    if (sold.has(k)) sum += sold.get(k) * n; else missing.push(k);
  }
  return { sum, missing, refs: refs.length };
}

// ---- classify / convert -----------------------------------------------------------------------------------------
function side(c) { return c.tags.find(t => SIDES.has(t)) || ''; }
function klass(c) {
  if (c.button === 'tanks') return 'tanks-' + (['light', 'medium', 'heavy'].find(t => c.tags.includes(t)) || 'medium');
  return c.button;
}
function as2Button(c) {
  if (c.button === 'tanks') return TANK[['light', 'medium', 'heavy'].find(t => c.tags.includes(t)) || 'medium'];
  return BTN[c.button];
}
function tierOf(c) {
  const m = /^doctrine_t(\d)$/.exec(c.group || '');
  return m ? +m[1] : c.stage;
}
const fmt = n => (Number.isInteger(n) ? String(n) : String(+n.toFixed(4)));
const q = s => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';

// → { text, button, budget, notes[] }; budget = 'hero' for dp (doctrine) cards, 'vehicle' otherwise
function convert(c) {
  const button = as2Button(c), notes = [];
  if (!button) return { error: 'no AS2 button for GoH button ' + c.button, name: c.name };
  const hero = c.button === 'doctrine';
  const tier = tierOf(c);
  const tags = c.tags.filter(t => t !== 'doctrine' && t !== 'all' && !/[%]/.test(t));
  const outTags = ['all'].concat(hero ? ['hero'] : [], tags);
  if (tier !== undefined) outTags.push('tier' + tier);
  const interval = c.interval !== undefined ? c.interval : c.chargeFlat;
  if (c.delay) notes.push('charge delay ' + c.delay + ' dropped (AS2 {charge} is one number) [I]');
  // main-budget price: own cost + crew soldiers when squad_cost_factor != 0 (GoH header), rounded to round_multiple; dp cards: cost as written
  let cost = c.cost;
  const infBtn = c.button === 'inf1' || c.button === 'inf2';
  if (!hero && c.scf !== 0 && c.crewCost && (cost !== undefined || infBtn)) {
    if (c.crewCost.missing.length) notes.push('crew cost unknown for ' + c.crewCost.missing.length + ' soldier(s): ' + c.crewCost.missing.slice(0, 3).join(','));
    if (c.crewCost.refs && !c.crewCost.missing.length) {
      cost = (c.cost || 0) + c.crewCost.sum;
      if (c.round) cost = Math.round(cost / c.round) * c.round;
      notes.push('cost = card ' + (c.cost || 0) + ' + crew ' + c.crewCost.sum + (c.round ? ' round ' + c.round : '') + ' [I]');
    }
  }
  if (cost === undefined) return { error: 'no cost in GoH card (vehicle/gun card without {cost}; crew-only price would be wrong)', name: c.name };
  if (cost < 0) return { error: 'negative cost ' + cost + ' (GoH support/barrage card, not a purchase)', name: c.name };
  const L = [];
  L.push('{' + q(c.name));
  if (interval !== undefined) L.push('\t{charge ' + fmt(interval) + '}');
  L.push('\t{tags ' + q(outTags.join(' ')) + '}');
  if (c.group) L.push('\t{group ' + q(c.group) + '}');
  L.push('\t{button ' + q(button) + '}');
  if (cost !== undefined) L.push('\t{cost ' + fmt(cost) + '}' + (hero ? ' ; dp, 1:1 [I]' : ''));
  if (c.cw !== undefined) L.push('\t{cw ' + fmt(c.cw) + '}');
  if (c.cp !== undefined) L.push('\t{cp ' + fmt(c.cp) + '}');
  if (c.level !== undefined) L.push('\t{level ' + fmt(c.level) + '}');
  if (c.content) L.push('\t{content ' + q(c.content) + '}');
  L.push('}');
  return { name: c.name, text: L.join('\n') + '\n', button, budget: hero ? 'hero' : 'vehicle', hero, tier, notes, klass: klass(c), side: side(c) };
}

// ---- validate ---------------------------------------------------------------------------------------------------
// parse budgets + cards text with sdlx; every card block: one name, exactly one button, the first budget listing that
// button is the expected one (hero cards -> a budget with {tag "special"}, others -> one without), cost number.
function parseBudgets(text) {
  const errs = [], r = sdlx.read(Buffer.from(text, 'latin1'), { file: 'budgets', key: 'budgets', open: () => null, onError: (f, l, c, m) => errs.push(c + ' ' + m) });
  const out = [];
  const bs = r.root.items.find(i => i.k === 'BLOCK' && i.items[0].text === 'budgets');
  if (!bs) return { errs: errs.concat('no {budgets}'), budgets: out };
  for (const b of bs.items.slice(1)) {
    if (b.k !== 'BLOCK') continue;
    const res = kid(b, 'resource');
    out.push({ name: b.items[0].text, buttons: (val(b, 'buttons') || '').split(/\s+/).filter(Boolean), special: !!(res && val(res, 'tag') === 'special') || val(b, 'tag') === 'special' });
  }
  return { errs, budgets: out };
}
function validate(cardsText, budgetsText) {
  const problems = [], pb = parseBudgets(budgetsText);
  pb.errs.forEach(e => problems.push('budgets: ' + e));
  const errs = [], r = sdlx.read(Buffer.from(cardsText, 'latin1'), { file: 'cards', key: 'cards', open: () => null, onError: (f, l, c, m) => errs.push(c + ' ' + m + ' @' + l) });
  errs.forEach(e => problems.push('cards: ' + e));
  const seen = new Set();
  for (const b of r.root.items) {
    if (b.k !== 'BLOCK' || !b.items.length || b.items[0].k !== 'STRING') { problems.push('top-level item that is not a named block'); continue; }
    const name = b.items[0].value;
    if (seen.has(name)) problems.push(name + ': duplicate card');
    seen.add(name);
    const bt = b.items.filter(i => i.k === 'BLOCK' && i.items[0].text === 'button');
    if (bt.length !== 1) { problems.push(name + ': ' + bt.length + ' button keys'); continue; }
    const button = bt[0].items[1] && bt[0].items[1].value;
    const bud = pb.budgets.find(x => x.buttons.includes(button));
    if (!bud) { problems.push(name + ': button ' + button + ' is in no budget (card would be free)'); continue; }
    const tg = (val(b, 'tags') || '').split(/\s+/);
    const wantHero = tg.includes('hero');
    if (wantHero && !bud.special) problems.push(name + ': hero card but button ' + button + ' is on budget ' + bud.name + ' (no tag special)');
    if (!wantHero && bud.special) problems.push(name + ': main card but button ' + button + ' is on special budget ' + bud.name);
    const cost = val(b, 'cost');
    if (cost === undefined || isNaN(+cost)) problems.push(name + ': cost missing or not a number');
  }
  return { problems, cards: seen.size, budgets: pb.budgets };
}

// ---- sample -----------------------------------------------------------------------------------------------------
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
// n cards round-robin over classes (inf1 inf2 empl vehicles tanks-* doctrine), seeded pick without repeats
function sample(cards, n, seed) {
  const r = rng(seed), by = new Map();
  const sn = new Set();
  for (const c of cards) { if (convert(c).error || sn.has(c.name)) continue; sn.add(c.name); const k = klass(c); (by.get(k) || by.set(k, []).get(k)).push(c); }
  const keys = [...by.keys()].sort(), out = [];
  while (out.length < n && keys.some(k => by.get(k).length)) {
    for (const k of keys) {
      const l = by.get(k);
      if (l.length && out.length < n) out.push(l.splice(Math.floor(r() * l.length), 1)[0]);
    }
  }
  return out;
}

// ---- cli --------------------------------------------------------------------------------------------------------
function main(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) { if (argv[i].startsWith('--')) { const k = argv[i].slice(2); a[k] = (argv[i + 1] === undefined || argv[i + 1].startsWith('--')) ? true : argv[++i]; } }
  const gx = openGoh(a.goh || DEF_GOH, a.valour === 'none' ? null : (a.valour || DEF_VAL));
  try {
    const rosters = a.rosters ? String(a.rosters).split(',') : ROSTERS;
    const all = loadCards(gx, rosters);
    if (a.list || a.stats) {
      const cnt = {}, dpn = {};
      for (const c of all) { const k = c.src + ' ' + klass(c); cnt[k] = (cnt[k] || 0) + 1; if (c.button === 'doctrine') dpn[c.src + ' ' + side(c)] = (dpn[c.src + ' ' + side(c)] || 0) + 1; }
      console.log('cards', all.length, 'sdl errors', JSON.stringify(all.errs));
      console.log('by roster+class', JSON.stringify(cnt));
      console.log('dp (doctrine button) cards by roster+side', JSON.stringify(dpn));
      return 0;
    }
    if (!a.out || a.out === true) { console.error('need --out <dir> (existing folder)'); return 2; }
    if (!fs.existsSync(a.out)) { console.error('--out folder does not exist (tool does not create it): ' + a.out); return 2; }
    let pick;
    if (a.units) { const want = new Set(String(a.units).split(',')); const sn = new Set(); pick = all.filter(c => want.has(c.name) && !sn.has(c.name) && sn.add(c.name)); const miss = [...want].filter(w => !pick.some(c => c.name === w)); if (miss.length) console.error('not found: ' + miss.join(',')); }
    else if (a.sample) pick = sample(all, +a.sample, +(a.seed || 1));
    else { console.error('need --units a,b or --sample N'); return 2; }
    const conv = pick.map(convert), bad = conv.filter(c => c.error);
    const good = conv.filter(c => !c.error);
    const cardsText = good.map(c => c.text).join('\n');
    const budgetsText = a.budgets && a.budgets !== true ? enc.readText(a.budgets, 'cp1251').lines.join('\n') : BUDGETS;
    const v = validate(cardsText, budgetsText);
    // cp1251 + CRLF (game text data)
    fs.writeFileSync(path.join(a.out, 'cards.set'), Buffer.from((';SDL\n' + cardsText).replace(/\n/g, '\r\n'), 'latin1'));
    fs.writeFileSync(path.join(a.out, 'budgets.inc'), Buffer.from(BUDGETS.replace(/\n/g, '\r\n'), 'latin1'));
    const rep = good.map(c => c.name + ' | ' + c.klass + ' | ' + c.side + ' | -> ' + c.button + ' on ' + c.budget + (c.tier !== undefined ? ' | tier ' + c.tier : '') + (c.notes.length ? ' | ' + c.notes.join('; ') : ''))
      .concat(bad.map(c => c.name + ' | ERROR ' + c.error), v.problems.map(p => 'PROBLEM ' + p));
    fs.writeFileSync(path.join(a.out, 'report.txt'), rep.join('\r\n') + '\r\n');
    console.log(rep.join('\n'));
    console.log('cards written', good.length, 'problems', v.problems.length + bad.length);
    return v.problems.length + bad.length ? 1 : 0;
  } finally { gx.close(); }
}

module.exports = { openGoh, loadCards, convert, validate, sample, parseBudgets, klass, as2Button, BUDGETS, ROSTERS };
if (require.main === module) process.exit(main(process.argv.slice(2)));

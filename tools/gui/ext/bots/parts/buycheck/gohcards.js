// bots/buycheck, Gates of Hell: the buy cards the game sells with this mod on, checked against the GoH bot purchase lists
// (script/multiplayer/units/<army>/<list>.<army>.lua, tools/botrecipe/gohbuys through bots/lib gohBuys; no bot.data.lua, GHMIS-66).
// Cards: tools/pricecalc/goh.js open + result (read only): every card of every roster root units/only_roster_<period>.set (else
// common.set), macros expanded, the mod over the game; period = the root (early, mid, late, conquest; "all" for common.set = any period),
// side = the card's own side (squad "(army)", mp/<side>/ members, a side tag), tags = its tags. A card serves army A when its side is A or
// its tags name A: the GoH Commonwealth lists buy can and pol cards tagged eng [V vanilla, 2026-11-23: every vanilla list unit is then a
// card of its own army and period, 2633 rows, 0 misses].
// Rows (check 1, unit names), one per purchase list (army + list), names under Details:
//   gohUnknown  GOH_BOT_UNIT_UNKNOWN  GHMIS-55  a unit no card has at all: a GoH bot that tries to buy it crashes the game (BotCommands.Spawn
//               of an unknown unit = null card crash [V]; no in-game test here [T])
//   gohNotSold  GOH_BOT_UNIT_NOT_SOLD  GHMIS-55  a card exists, but none of the list's army in the list's period: CanBuy fails, the bot
//               never gets it [I]
//   gohNoList   GOH_CARD_NO_BOT_LIST  GHMIS-66  the MOD's cards (card file in the mod) that no list of their army and period buys (info:
//               the game's own cards that no list buys are its design, doctrine and officer cards, left out)
// No fixes: the purchase lists are changed with "Make bots buy a unit" or by hand in the Editor.
// CACHE (PERF part 1): the card read is about 5 s on the real GoH install (read + expand), a pure function of game + mod: kept in the
// shared store, section 'bots.gohcards' ver CARDS_VER, parts {game, gid, mod}, stamps {game (gameview stamp), mod:set, pak (lib/modtree)};
// built off the request turn (setImmediate, as the Balance page's GoH read), one build for equal asks in flight, the last answers in
// memory. No store, no ctx.modtree, or a linked resource/set: built now, as is. Prepare: section bots.gohcards (bots/index.js).
// Author: Imperator_Aug (ARSENAL, ia-53858bfb)
'use strict';
const path = require('path'), os = require('os'), fs = require('fs');
const lib = require('../../lib');

const SECTION = 'bots.gohcards', CARDS_VER = 1, AREAS = ['set', 'pak'];
const PERIOD_LISTS = ['early', 'mid', 'late', 'conquest'];
const lc = s => String(s == null ? '' : s).toLowerCase();
const lowp = p => { const r = path.resolve(String(p)); return process.platform === 'win32' ? r.toLowerCase() : r; };
const turn = () => new Promise(r => setImmediate(r));
// a mod whose resource or resource/set (or a pak folder) sits behind a link: the listing cannot stamp it, so it is never stored
const linked = T => (T.left || []).some(l => /^resource(\/(set|paks?)(\/|$)|$)/i.test(String(l).replace(/\\/g, '/')));

// the read itself (pure, sync, about 5 s on the real game): -> {cards: [{unit, side, period, tags, file, line, mod}]}
function read(game, mod, tmpRoot) {
  const GOH = require('../../../../../pricecalc/goh');
  const m = mod || (() => { const d = path.join(tmpRoot || os.tmpdir(), 'bots-goh-nomod'); fs.mkdirSync(d, { recursive: true }); return d; })();
  const S = GOH.open({ game, mod: m }), r = GOH.result(S);
  const cards = r.cards.map(c => ({ unit: c.name, side: c.side ? lc(c.side) : null, period: lc(c.period || 'all'), tags: (c.tags || []).map(lc).filter(t => !/%/.test(t)), file: c.file || null, line: c.line || 0, mod: !!(mod && c.file && S.s.local && S.s.local.has(c.file)) }));
  return { cards };
}
const MEMO = new Map(), RUN = new Map(), MAX = 3;
// -> Promise {cards} ; throws when the game folder is not set
async function cardsOf(ctx, mod) {
  const G = lib.gameOf(ctx);
  if (G.kind !== 'goh' || !G.dir) throw Object.assign(new Error('nocards'), { why: 'nocards' });
  const S = lib.storeOf(ctx), MT = ctx && ctx.modtree;
  const make = async () => { await turn(); const v = read(G.dir, mod, ctx && ctx.tmpRoot); await turn(); return JSON.parse(JSON.stringify(v)); };
  if (!S || !MT || typeof MT.ensure !== 'function') return make();
  const T = mod ? await MT.ensure(mod) : null;
  if (T && linked(T)) return make();
  const parts = { game: lowp(G.dir), gid: G.id, mod: mod ? lowp(mod) : '' }, stamps = Object.assign({ game: lib.gameStamp(ctx, G) }, T ? MT.stamps(T, AREAS) : {});
  const key = JSON.stringify([parts, stamps]);
  if (MEMO.has(key)) return MEMO.get(key);
  if (!RUN.has(key)) {
    const p = S.wrap(SECTION, CARDS_VER, parts, stamps, make).then(v => { MEMO.delete(key); MEMO.set(key, v); while (MEMO.size > MAX) MEMO.delete(MEMO.keys().next().value); return v; });
    RUN.set(key, p); p.then(() => RUN.delete(key), () => RUN.delete(key));
  }
  return RUN.get(key);
}
// the store state for the Prepare screen: the last known listing of the mod, no walk, no read
function state(ctx, mod) {
  const G = lib.gameOf(ctx), S = lib.storeOf(ctx), MT = ctx && ctx.modtree;
  if (G.kind !== 'goh' || !G.dir || !mod) return { state: 'na', why: [] };
  if (!S || !MT || typeof MT.last !== 'function') return { state: 'none', why: [] };
  const T = mod ? MT.last(mod) : null;
  if (!T) return { state: 'none', why: ['mod'] };
  if (linked(T)) return { state: 'na', why: [] };
  const parts = { game: lowp(G.dir), gid: G.id, mod: mod ? lowp(mod) : '' }, stamps = Object.assign({ game: lib.gameStamp(ctx, G) }, T ? MT.stamps(T, AREAS) : {});
  return S.state(SECTION, CARDS_VER, parts, stamps);
}
const forget = () => MEMO.clear();

// a card serves army a in list l: its side or a tag is a, and its period is l (or "all")
// (or the card sits in that army's own file units_<a>.set: vanilla eng late buys doctrine_squad_carrier_late_irr, side can, tags without
// eng, from late/units_eng.set [V vanilla 2026-11-23; that the bot really gets it is [I]])
const fileArmy = f => (/(?:^|\/)units_([a-z]+)\.set$/i.exec(String(f || '')) || [])[1];
const serves = (c, a, l) => (c.side === a || c.tags.includes(a) || lc(fileArmy(c.file)) === a) && (c.period === l || c.period === 'all');

// every purchase list of the game and the mod: [{army, list, rel, from, rows: [{unit, line}]}] ; [] when there are none
async function listsOf(ctx, mod) {
  let first;
  try { first = lib.gohBuys(ctx, mod, ''); } catch (e) { if (e.status === 404) return []; throw e; }
  const out = [];
  for (const l of first.lists) {
    await turn();
    const r = l === first.list ? first : lib.gohBuys(ctx, mod, l);
    for (const a of r.armies) {
      const f = r.files[a] || {}, rows = [];
      for (const s of r.stages) for (const u of s.armies[a] || []) if (u.unit) rows.push({ unit: u.unit, line: u.line || 0 });
      out.push({ army: a, list: l, rel: f.rel, from: f.from, rows });
    }
  }
  return out;
}

// the rows (buycheck shape: check, code, lim, sev, file, from, line, id, msg, p, names, lines, fixes) + the army names; skipped as {check, why}
async function check(ctx, mod) {
  const lists = await listsOf(ctx, mod);
  if (!lists.length) return { rows: [], skipped: [{ check: 1, why: 'gohnolist' }], armies: {} };
  let C;
  try { C = await cardsOf(ctx, mod); } catch (e) { return { rows: [], skipped: [{ check: 1, why: e.why || 'gohnocards', p: { m: String(e.message || e).slice(0, 200) } }], armies: {} }; }
  const cards = C.cards || [], byUnit = new Map();
  for (const c of cards) { const k = lc(c.unit); if (!byUnit.has(k)) byUnit.set(k, []); byUnit.get(k).push(c); }
  const units = [...new Set(lists.flatMap(L => L.rows.map(r => r.unit)))];
  const names = lib.namesOf(ctx, mod, units.concat(cards.filter(c => c.mod).map(c => c.unit)));
  const nm = u => names[u] || '';
  const label = u => (nm(u) ? nm(u) + ' (' + u + ')' : u);
  const rows = [];
  for (const L of lists) {
    const unknown = new Map(), notSold = new Map();
    for (const r of L.rows) {
      const cs = byUnit.get(lc(r.unit));
      const put = (m) => { if (!m.has(r.unit)) m.set(r.unit, []); m.get(r.unit).push(r.line); };
      if (!cs || !cs.length) put(unknown);
      else if (!cs.some(c => serves(c, L.army, L.list))) put(notSold);
    }
    const row = (msg, code, lim, sev, m) => {
      const lines = [...m.values()].flat().filter(Boolean).sort((a, b) => a - b), us = [...m.keys()];
      rows.push({ check: 1, code, lim, sev, file: L.rel, from: L.from, line: lines[0] || 0, lines: lines.slice(0, 50), nLines: lines.length,
        id: msg + '|' + L.army + '|' + L.list, msg, p: { army: L.army, list: L.list, n: us.length, unit: us.length === 1 ? us[0] : null, name: us.length === 1 ? nm(us[0]) : '' },
        names: us.map(label).slice(0, 300), fixes: [] });
    };
    if (unknown.size) row('gohUnknown', 'GOH_BOT_UNIT_UNKNOWN', 'GHMIS-55', 'warn', unknown);
    if (notSold.size) row('gohNotSold', 'GOH_BOT_UNIT_NOT_SOLD', 'GHMIS-55', 'warn', notSold);
  }
  // the mod's own cards that no list of their army and period buys (one row per army and period)
  const listed = new Set(lists.flatMap(L => L.rows.map(r => L.army + '|' + L.list + '|' + lc(r.unit))));
  const lists1 = new Set(lists.map(L => L.army + '|' + L.list)), seen = new Set(), noList = new Map();
  for (const c of cards) {
    if (!c.mod) continue;
    const periods = c.period === 'all' ? PERIOD_LISTS : [c.period], armies = [...new Set([c.side, lc(fileArmy(c.file)) || null].concat(c.tags).filter(Boolean))];
    for (const a of armies) for (const l of periods) {
      if (!lists1.has(a + '|' + l) || listed.has(a + '|' + l + '|' + lc(c.unit))) continue;
      const k = a + '|' + l, u = k + '|' + lc(c.unit);
      if (seen.has(u)) continue; seen.add(u);
      if (!noList.has(k)) noList.set(k, { army: a, list: l, cards: [] });
      noList.get(k).cards.push(c);
    }
  }
  for (const x of noList.values()) {
    const L = lists.find(y => y.army === x.army && y.list === x.list) || {}, c0 = x.cards[0];
    rows.push({ check: 1, code: 'GOH_CARD_NO_BOT_LIST', lim: 'GHMIS-66', sev: 'info', file: String(c0.file || '').replace(/^resource\//, ''), from: 'mod', line: c0.line || 0,
      id: 'gohNoList|' + x.army + '|' + x.list, msg: 'gohNoList', p: { army: x.army, list: x.list, n: x.cards.length, unit: x.cards.length === 1 ? c0.unit : null, name: x.cards.length === 1 ? nm(c0.unit) : '', file: L.rel ? 'resource/' + L.rel : '' },
      names: x.cards.map(c => label(c.unit)).slice(0, 300), fixes: [] });
  }
  return { rows, skipped: [], armies: lib.armyNames(ctx, mod, [...new Set(lists.map(L => L.army))]) };
}

// the picker's list (buycheck/cards): every card a GoH army can buy, in-game name first; a card per army it serves
async function cardList(ctx, mod) {
  const C = await cardsOf(ctx, mod), seen = new Set(), out = [];
  for (const c of C.cards) {
    const a = c.side || c.tags.find(t => /^[a-z]{3}$/.test(t)) || '';
    const k = a + '|' + lc(c.unit); if (seen.has(k)) continue; seen.add(k);
    out.push({ unit: c.unit, army: a, src: c.mod ? 'mod' : 'game' });
  }
  const names = lib.namesOf(ctx, mod, [...new Set(out.map(u => u.unit))]);
  for (const u of out) u.name = names[u.unit] || '';
  return out;
}

module.exports = { cardsOf, check, cardList, listsOf, state, forget, read, serves, SECTION, CARDS_VER, AREAS };

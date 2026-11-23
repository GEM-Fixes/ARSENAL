// botcheck: shape check of a mod's script/multiplayer/bot.data.lua against vanilla's, as vanilla bot.lua reads it (COV-C13).
// Reader: luatable.js (real Lua data subset; refuses code). Consumer facts, vanilla bot.lua 3.262 (PIter, GetUnit, OnQuant):
//   Purchases[i].Repeat (number; 0 = stay, PIter:moveNext), Purchases[i].Units[army] (pairs over entries), entry.priority * k,
//   entry.class == UnitClass.X, entry.min_income / min_team (absent = -1 / 0), BotApi.Commands:Spawn(entry.unit, MaxSquadSize),
//   FlagPriority.Captured/Enemy/Neutral, OrderRotationPeriod. Required keys and allowed keys are taken from vanilla, not typed here.
// check(modText, vanText, cards?, {ownBot?: mod bot.lua text}) -> [{sev:'error'|'warn'|'info', code, line, msg}]. cards: Set of buyable names (units sets: {"name" lines
//   and squad macro name(N) side(S) -> "N(S)"); vanilla 3.262 has 0 entries without a card [V 2026-11-09, 201 names].
// Author: Imperator_Aug (ARSENAL, ia-285bacfe)
'use strict';
const { parse } = require('./luatable');
const kind = v => v === null ? 'nil' : typeof v === 'object' ? (v.$t === 'table' ? 'table' : 'ref') : typeof v;

function cardNames(texts) {
  const n = new Set();
  for (const t of texts) {
    for (const m of t.matchAll(/\{"([^"]+)"/g)) n.add(m[1]);
    for (const l of t.split(/\r?\n/)) { const a = /\bname\(([^)\s]+)\)/.exec(l), s = /\bside\(([^)\s]+)\)/.exec(l); if (a && s) n.add(`${a[1]}(${s[1]})`); }
  }
  return n;
}

function check(modText, vanText, cards, opt = {}) {
  const out = [], add = (sev, code, line, msg) => out.push({ sev, code, line: line || 0, msg });
  let M, V;
  try { V = parse(vanText); } catch (e) { add('error', 'BOT_VANILLA_UNREAD', e.line, e.message); return out; }
  try { M = parse(modText); } catch (e) { add('error', /UNSUPPORTED/.test(e.message) ? 'BOT_LUA_UNSUPPORTED' : 'BOT_LUA_PARSE', e.line, e.message); return out; }
  const g = M.globals, vg = V.globals;
  // the mod's own bot.lua (opt.ownBot) may read keys vanilla's does not: a key named in it is info, not a typo warning
  const ownReads = k => !!opt.ownBot && new RegExp('\\b' + k + '\\b').test(opt.ownBot), extra = k => ownReads(k) ? 'info' : 'warn';
  for (const d of M.dupes) add('warn', 'BOT_DUP_KEY', d.line, `key ${d.key} set twice (first line ${d.first}); Lua keeps the last`);
  for (const k of Object.keys(vg)) {
    if (!(k in g)) { const own = opt.ownBot && !ownReads(k); add(own ? 'info' : 'error', 'BOT_KEY_MISSING', 0, `global ${k} missing (vanilla line ${V.lines[k]})${own ? '; the mod bot.lua does not name it' : ''}`); continue; }
    if (kind(g[k]) !== kind(vg[k])) add('error', 'BOT_KEY_TYPE', M.lines[k], `${k} is ${kind(g[k])}, vanilla ${kind(vg[k])}`);
  }
  for (const k of Object.keys(g)) if (!(k in vg)) add('info', 'BOT_KEY_EXTRA', M.lines[k], `global ${k} not in vanilla (bot.lua does not read it)`);
  for (const k of ['FlagPriority', 'UnitClass']) {
    if (kind(g[k]) !== 'table' || kind(vg[k]) !== 'table') continue;
    for (const f of Object.keys(vg[k].hash)) if (!(f in g[k].hash)) add('error', 'BOT_KEY_MISSING', g[k].line, `${k}.${f} missing`);
  }
  if (kind(g.Purchases) !== 'table' || kind(vg.Purchases) !== 'table') return out;
  // vanilla facts
  const vStages = vg.Purchases.arr.filter(s => kind(s) === 'table'), stageKeys = new Set(), armies = new Set(), entryKeys = new Set(), keyType = {};
  let required = null;
  for (const s of vStages) {
    Object.keys(s.hash).forEach(k => stageKeys.add(k));
    const U = s.hash.Units; if (kind(U) !== 'table') continue;
    for (const [army, list] of Object.entries(U.hash)) {
      armies.add(army);
      for (const e of list.arr) {
        const ks = Object.keys(e.hash); ks.forEach(k => { entryKeys.add(k); keyType[k] = kind(e.hash[k]); });
        required = required ? new Set([...required].filter(k => ks.includes(k))) : new Set(ks);
      }
    }
  }
  required = required || new Set();
  const P = g.Purchases;
  if (Object.keys(P.hash).length) add('warn', 'BOT_STAGE_SHAPE', P.line, `Purchases has named keys (${Object.keys(P.hash).join(', ')}); PIter walks it with next(), order is not the list order`);
  if (!P.arr.length) add('error', 'BOT_STAGE_SHAPE', P.line, 'Purchases has no stages: the bot never buys');
  if (P.arr.length !== vStages.length) add('info', 'BOT_STAGE_COUNT', P.line, `${P.arr.length} stages, vanilla ${vStages.length}`);
  const unitClass = kind(g.UnitClass) === 'table' ? g.UnitClass.hash : {};
  let n = 0, stay = false;
  P.arr.forEach((s, si) => {
    const where = `stage ${si + 1}`;
    if (kind(s) !== 'table') { add('error', 'BOT_STAGE_SHAPE', P.line, `${where} is ${kind(s)}, not a table`); return; }
    for (const k of Object.keys(s.hash)) if (!stageKeys.has(k)) add(extra(k), 'BOT_STAGE_KEY', s.keyLine[k], `${where}: key ${k} not in vanilla (bot.lua does not read it)`);
    const r = s.hash.Repeat;
    if (typeof r !== 'number' || r < 0 || r !== Math.floor(r)) add('error', 'BOT_STAGE_SHAPE', s.keyLine.Repeat || s.line, `${where}: Repeat ${r === undefined ? 'missing' : JSON.stringify(r)}, needs a whole number >= 0 (0 = stay)`);
    else if (r === 0) stay = true;
    const U = s.hash.Units;
    if (kind(U) !== 'table') { add('error', 'BOT_STAGE_SHAPE', s.keyLine.Units || s.line, `${where}: Units ${U === undefined ? 'missing' : 'is ' + kind(U)}`); return; }
    if (U.arr.length) add('warn', 'BOT_STAGE_SHAPE', U.line, `${where}: Units has ${U.arr.length} unnamed entries (needs ["army"] = {...})`);
    for (const a of armies) if (!(a in U.hash)) add('warn', 'BOT_ARMY_MISSING', U.line, `${where}: no ["${a}"] list (vanilla has one in some stage); a bot of that army has nothing to buy here`);
    for (const [army, list] of Object.entries(U.hash)) {
      if (!armies.has(army)) add('warn', 'BOT_ARMY_UNKNOWN', U.keyLine[army], `${where}: army ["${army}"] not in vanilla`);
      if (kind(list) !== 'table') { add('error', 'BOT_ENTRY_SHAPE', U.keyLine[army], `${where} ${army}: not a table`); continue; }
      for (const e of list.arr) {
        n++;
        const at = e && e.line || U.keyLine[army];
        if (kind(e) !== 'table') { add('error', 'BOT_ENTRY_SHAPE', at, `${where} ${army}: entry is ${kind(e)}`); continue; }
        if (e.arr.length) add('error', 'BOT_ENTRY_SHAPE', at, `${where} ${army}: entry has unnamed values`);
        for (const k of required) if (!(k in e.hash)) add('error', 'BOT_ENTRY_KEY', at, `${where} ${army}: entry lacks ${k}`);
        for (const [k, v] of Object.entries(e.hash)) {
          if (!entryKeys.has(k)) { add(extra(k), 'BOT_ENTRY_KEY', e.keyLine[k], `${where} ${army}: key ${k} not in vanilla entries (${ownReads(k) ? 'the mod bot.lua names it' : 'bot.lua ignores it; typo?'})`); continue; }
          if (kind(v) !== keyType[k]) add('error', 'BOT_ENTRY_TYPE', e.keyLine[k], `${where} ${army}: ${k} is ${kind(v)}, vanilla ${keyType[k]}`);
        }
        const c = e.hash.class;
        if (kind(c) === 'ref' && !(c.ref.startsWith('UnitClass.') && c.ref.slice(10) in unitClass)) add('error', 'BOT_ENTRY_CLASS', e.keyLine.class, `${where} ${army}: class ${c.ref} is not a UnitClass member (nil in Lua: never matched)`);
        const u = e.hash.unit;
        if (cards && typeof u === 'string' && !cards.has(u)) add('error', 'BOT_UNIT_NO_CARD', e.keyLine.unit, `${where} ${army}: unit "${u}" has no buy card (units sets, squad name(N) side(S)); Spawn logs "Not found - ${u}"`);
      }
    }
  });
  if (P.arr.length && !stay) add('warn', 'BOT_NO_STAY_STAGE', P.line, 'no stage with Repeat = 0: PIter runs off the end and the bot stops buying');
  add('info', 'BOT_ENTRIES', 0, `${P.arr.length} stages, ${n} entries checked${cards ? ` against ${cards.size} card names` : ', cards not checked (no --game)'}`);
  return out;
}
module.exports = { check, cardNames };

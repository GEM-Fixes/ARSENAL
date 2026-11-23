// gohbuys: what Gates of Hell bots buy, read from the game's own purchase lists (no bot.data.lua in GoH, GHMIS-66).
// Format [I, no match played -> T]:
//   script/multiplayer/bot.main.lua   gameModeMap = { <lobby mode> = "<script>", ... } -> require modes/<script>.lua
//   script/multiplayer/modes/*.lua     OnGameStartUtility(<list>): BotApi.Instance.unitMode (the lobby period) or a literal ("conquest")
//   script/multiplayer/modes/utility.lua  Purchases = {}; loads units/<army>/<list>.<army>.lua and reads Purchases["<list>.<army>"]
//   script/multiplayer/units/<army>/<list>.<army>.lua  Purchases["<list>.<army>"] = { {Repeat = N, Units = { {unit = "...", ...}, ...}}, ... }
//     period lists (early, mid, late): {priority = 1.0, type = {"Class3", "Infantry", "Squad"}, unit = "..."}
//     conquest lists: {availability = "1.4", base = {...}, class = {}, grade = "Grade2", posture = {...}, roles = {...}, effects = {...},
//       mobility = {...}, identity = {...}, unit = "..."} (tags scored by modes/conquest/purchase_scoring.lua; units/unit_roster_readme.md)
// Anything else (a call, a function, an unknown key, a value that is not plain data) is listed in notRead with file and line, never guessed.
// readList(text, rel) -> {army, list, key, stages: [{n, repeat, units: [{unit, priority, availability, grade, cls, tags, line}]}], notRead}
// modesOf({rel: text}) -> {modes: [{mode, script, list: 'period' | '<literal>' | null, file, line}], notRead}
// Author: Imperator_Aug (ARSENAL, ia-d87eab22)
'use strict';
const luatable = require('./luatable');

const UNITS = 'script/multiplayer/units/';
const MAIN = 'script/multiplayer/bot.main.lua';
const MODES = 'script/multiplayer/modes/';
const FILE_RE = /^script\/multiplayer\/units\/([a-z0-9_]+)\/([a-z0-9_]+)\.([a-z0-9_]+)\.lua$/i;
// the tag lists of an entry and the scalar keys; every other key is not read
const LISTS = ['type', 'base', 'class', 'posture', 'roles', 'effects', 'mobility', 'identity'];
const SCALARS = ['unit', 'priority', 'availability', 'grade'];
const LIST_ORDER = ['early', 'mid', 'late', 'conquest'];

// rel (under resource/) of a purchase list -> {army, list} | null (the army folder and the file's army must agree, as utility.lua builds it)
function fileOf(rel) {
  const m = FILE_RE.exec(String(rel).replace(/\\/g, '/'));
  if (!m || m[1].toLowerCase() !== m[3].toLowerCase()) return null;
  return { army: m[1].toLowerCase(), list: m[2].toLowerCase() };
}
const emptyTable = () => ({ $t: 'table', hash: {}, arr: [], line: 0, keyLine: {} });
const isTable = v => v && typeof v === 'object' && v.$t === 'table';
const strList = v => isTable(v) && !Object.keys(v.hash).length && v.arr.every(x => typeof x === 'string');

function readList(text, rel) {
  const f = fileOf(rel) || {}, key = f.list + '.' + f.army, notRead = [];
  const nr = (line, what) => notRead.push({ file: rel, line: line || 0, what });
  let t;
  try { t = luatable.parse(text, { Purchases: emptyTable() }); } catch (e) { nr(e.line, e.message); return { army: f.army, list: f.list, key, stages: [], notRead }; }
  for (const g of Object.keys(t.globals)) if (g !== 'Purchases') nr(t.lines[g], 'global ' + g + ' (the bot reads only Purchases)');
  const P = t.globals.Purchases;
  if (!isTable(P)) { nr(t.lines.Purchases, 'Purchases is not a table'); return { army: f.army, list: f.list, key, stages: [], notRead }; }
  for (const k of Object.keys(P.hash)) if (k !== key) nr(P.keyLine[k], 'Purchases["' + k + '"]: the bot of this file reads Purchases["' + key + '"] only');
  const L = P.hash[key], stages = [];
  if (L === undefined) nr(0, 'no Purchases["' + key + '"] in this file');
  else if (!isTable(L)) nr(P.keyLine[key], 'Purchases["' + key + '"] is not a table');
  else {
    for (const k of Object.keys(L.hash)) nr(L.keyLine[k], 'stage key ' + k + ' (stages are a plain list)');
    L.arr.forEach((s, i) => {
      if (!isTable(s)) { nr(L.line, 'stage ' + (i + 1) + ' is not a table'); return; }
      const st = { n: i + 1, repeat: null, line: s.line, units: [] };
      for (const k of Object.keys(s.hash)) {
        const v = s.hash[k];
        if (k === 'Repeat') { if (typeof v === 'number') st.repeat = v; else nr(s.keyLine[k], 'Repeat is not a number'); }
        else if (k !== 'Units') nr(s.keyLine[k], 'stage key ' + k);
      }
      const U = s.hash.Units;
      if (!isTable(U)) nr(s.line, 'stage ' + st.n + ' has no Units table');
      else {
        for (const k of Object.keys(U.hash)) nr(U.keyLine[k], 'Units key ' + k + ' (Units is a plain list here)');
        for (const r of U.arr) {
          if (!isTable(r)) { nr(U.line, 'a Units row that is not a table'); continue; }
          if (r.arr.length) nr(r.line, 'a Units row with values that have no key');
          const unit = r.hash.unit;
          if (typeof unit !== 'string' || !unit) { nr(r.line, 'a Units row with no unit name'); continue; }
          const row = { unit, priority: null, availability: null, grade: null, cls: null, tags: [], line: r.line };
          for (const k of Object.keys(r.hash)) {
            const v = r.hash[k], ln = r.keyLine[k];
            if (k === 'unit') continue;
            if (k === 'priority') { if (typeof v === 'number') row.priority = v; else nr(ln, unit + ': priority is not a number'); }
            else if (k === 'availability') { const n = typeof v === 'number' ? v : (typeof v === 'string' && /^\d+(\.\d+)?$/.test(v) ? Number(v) : null); if (n == null) nr(ln, unit + ': availability is not a number'); else row.availability = n; }
            else if (k === 'grade') { if (typeof v === 'string') row.grade = v; else nr(ln, unit + ': grade is not a word'); }
            else if (LISTS.includes(k)) { if (strList(v)) row.tags.push(...v.arr); else nr(ln, unit + ': ' + k + ' is not a list of words'); }
            else nr(ln, unit + ': key ' + k);
          }
          // the unit's kind for the page: the first tag that is not a size tier (Class1..3), e.g. Infantry, Vehicle, Tank
          row.cls = row.tags.find(x => !/^Class\d+$/i.test(x)) || null;
          st.units.push(row);
        }
      }
      stages.push(st);
    });
  }
  return { army: f.army, list: f.list, key, stages, notRead };
}

// line number (1-based) of index i in text
const lineAt = (text, i) => { let n = 1; for (let k = 0; k < i; k++) if (text.charCodeAt(k) === 10) n++; return n; };
// texts = {rel: text} with bot.main.lua and modes/*.lua (top level). Read by pattern: these are code files, so only the two known forms are read
function modesOf(texts) {
  const modes = [], notRead = [], main = texts[MAIN];
  const listOf = {};
  for (const rel of Object.keys(texts)) {
    const m = new RegExp('^' + MODES + '([a-z0-9_]+)\\.lua$', 'i').exec(rel); if (!m) continue;
    const t = String(texts[rel]), calls = [...t.matchAll(/^[ \t]*OnGameStartUtility\(\s*([^)]*?)\s*\)/gm)];
    if (!calls.length) continue;
    const a = calls[0][1], line = lineAt(t, calls[0].index);
    let list = null;
    if (/^BotApi\.Instance\.unitMode$/.test(a)) list = 'period';
    else if (/^"([a-z0-9_]+)"$/i.test(a)) list = /^"([a-z0-9_]+)"$/i.exec(a)[1].toLowerCase();
    else notRead.push({ file: rel, line, what: 'OnGameStartUtility(' + a + ')' });
    listOf[m[1].toLowerCase()] = { list, file: rel, line };
  }
  if (main == null) return { modes, notRead };
  const mt = String(main), g = /gameModeMap\s*=\s*\{([^}]*)\}/.exec(mt);
  if (!g) { notRead.push({ file: MAIN, line: 1, what: 'no gameModeMap table' }); return { modes, notRead }; }
  const base = g.index + g[0].indexOf('{') + 1;
  for (const r of g[1].matchAll(/^[ \t]*([A-Za-z_]\w*)\s*=\s*([^,\r\n]*?)\s*,?[ \t]*(?:--[^\r\n]*)?$/gm)) {
    const line = lineAt(mt, base + r.index), v = /^"([a-z0-9_]+)"$/i.exec(r[2]);
    if (!v) { notRead.push({ file: MAIN, line, what: r[1] + ' = ' + r[2] }); continue; }
    const s = listOf[v[1].toLowerCase()];
    modes.push({ mode: r[1], script: v[1], list: s ? s.list : null, file: MAIN, line });
  }
  return { modes, notRead };
}

// the list names in page order: early, mid, late, conquest, then any other a mod adds
const sortLists = ls => [...new Set(ls)].sort((a, b) => { const i = LIST_ORDER.indexOf(a), j = LIST_ORDER.indexOf(b); return (i < 0 ? 99 : i) - (j < 0 ? 99 : j) || a.localeCompare(b); });

module.exports = { UNITS, MAIN, MODES, fileOf, readList, modesOf, sortLists };

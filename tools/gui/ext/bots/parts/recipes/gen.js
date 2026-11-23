// bots part "recipes" (Teach the bot new habits): the files it writes into a mod, made from one settings object.
//   resource/script/multiplayer/bot.habits.lua      the settings (pure data: BotHabits = {...}); the page reads it back (luatable) and edits it
//   resource/script/multiplayer/bot.habits.run.lua  the runner (habits.run.lua beside this file), written once, the same for every mod
//   resource/script/multiplayer/bot.main.lua        the bot entry: the mod's own copy, else the game's, plus ONE marked line that loads the
//                                                   runner after bot.lua (AI-22: wrap after require). "Remove habits" takes the line out and
//                                                   deletes the copy when what is left is the stock entry.
// GoH (Gates of Hell): the same three files, but the runner is habits.goh.run.lua (GoH's mode scripts, other events and API) and the
// entry is always the game's own bot.main.lua (it picks the mode script); there is no stock line to fall back on.
// All text CRLF. Settings are checked and clamped here (numbers, unit names, army ids); unit names are checked against the unit lists
// by the caller (a name Spawn does not know is bought as nothing, and Spawn still says yes: MIS-32).
// Author: Imperator_Aug (ARSENAL, ia-25de2a0d)
'use strict';
const fs = require('fs'), path = require('path');
const luatable = require('../../../../../botrecipe/luatable');

const DIR = 'script/multiplayer/';
const REL = { data: DIR + 'bot.habits.lua', run: DIR + 'bot.habits.run.lua', main: DIR + 'bot.main.lua' };
const STOCK_MAIN = 'require([[/script/multiplayer/bot]])';
// pcall: a missing or broken runner file never stops the stock bot (the entry goes on). HOOK_RE knows both the old line
// (require([[...]])) and this one, so remove and detect work on entries written by either version; mainWith upgrades an old line
const HOOK = 'pcall(require, [[/script/multiplayer/bot.habits.run]]) -- ARSENAL bot habits: the Bots page adds and removes this line';
const HOOK_RE = /^[ \t]*(?:pcall\s*\(\s*require\s*,\s*|require\s*\(?\s*)\[\[\/script\/multiplayer\/bot\.habits\.run\]\][^\r\n]*(\r?\n|$)/gm;
const OLD_HOOK_RE = /^[ \t]*require\s*\(?\s*\[\[\/script\/multiplayer\/bot\.habits\.run\]\][^\r\n]*/m;
const RUN_MARK = /^-- ARSENAL bot habits runner v(\d+)\b/;
const DATA_MARK = '-- ARSENAL bot habits: settings';
const UNIT = /^[A-Za-z0-9_()]+$/;
const ARMY = /^[a-z0-9]{0,16}$/;
const DIFFS = ['', 'easy', 'normal', 'hard', 'heroic'];

// the habits in page order; nums: [key, default, min, max, step (1 = whole numbers)]
const HABITS = [
  { id: 'attack', nums: [['size', 4, 1, 30, 1], ['wait', 5, 1, 30, 1]] },
  { id: 'fallback', nums: [['every', 4, 1, 60, 1], ['hold', 60, 10, 600, 1]] },
  { id: 'front', nums: [['any', 20, 0, 100, 1]] },
  { id: 'replace', nums: [['max', 10, 0, 200, 1], ['confirm', 20, 2, 300, 1]] },
  { id: 'tanks', nums: [['every', 2, 1, 20, 1]], units: true },
  { id: 'save', nums: [['income', 3, 0, 100, 0.1], ['every', 5, 1, 60, 1], ['wait', 120, 10, 900, 1]], units: true },
  { id: 'phases', nums: [['share', 100, 0, 100, 1]], rules: true },
  { id: 'cap', nums: [['max', 12, 1, 200, 1]] },
  { id: 'log', nums: [] },
];
const RULE_NUMS = [['from', 0, 0, 600, 1], ['to', 0, 0, 600, 1]];
const NOTE = {
  attack: 'hold new squads at a flag of ours until size are alive (or wait minutes pass), then send them all to one enemy flag',
  fallback: 'every "every" minutes while the enemy holds more flags, and whenever a flag of ours is lost: squads go to the nearest flag of ours for "hold" seconds',
  front: 'pick target flags next to ours (list order), enemy first; "any" percent of orders stay the stock random pick',
  replace: 'a squad gone for "confirm" seconds is bought again, at most "max" times per match',
  tanks: 'while the enemy has tanks, 1 buy in "every" comes from units',
  save: 'when income (points per second) reaches "income", buy nothing else until one of units is bought (give up after "wait" seconds); again after "every" minutes',
  phases: 'the first rule that fits (map name part, difficulty, minutes from-to, 0 = no end) gives "share" percent of buys from its units',
  cap: 'no buys while "max" squads are alive',
  log: 'write what the bot bought and ordered to bot_habits_<player>.log in the main game\'s log folder (instance 0, also for other instances)',
};

function defaults() {
  const s = {};
  for (const h of HABITS) {
    s[h.id] = { on: false };
    for (const [k, d] of h.nums) s[h.id][k] = d;
    if (h.units) s[h.id].units = [];
    if (h.rules) s[h.id].rules = [];
  }
  s.log.docs = '';
  return s;
}

const clampNum = (v, d, lo, hi, step) => {
  let n = Number(String(v == null ? '' : v).trim().replace(',', '.'));
  if (v === '' || v == null || !isFinite(n)) n = d;
  n = Math.min(hi, Math.max(lo, n));
  n = step === 1 ? Math.round(n) : Math.round(n * 10) / 10;
  return n;
};
// a unit list -> [{unit, army}]; idx: Map unit -> [armies] (null = no unit lists to check against). Unknown names stay, with a warning;
// an entry with no army gets one row per army that has that card (Spawn of another army's card buys nothing and still says yes, MIS-32)
function units(list, idx, where, warn) {
  const out = [], seen = new Set();
  const put = (unit, army) => { const k = army + '|' + unit; if (seen.has(k)) return; seen.add(k); out.push({ unit, army }); };
  for (const x of Array.isArray(list) ? list.slice(0, 60) : []) {
    const unit = String((x && x.unit) || '').trim(), army = String((x && x.army) || '').trim().toLowerCase();
    if (!unit) continue;
    if (!UNIT.test(unit)) { warn.push({ code: 'badName', where, unit }); continue; }
    if (!ARMY.test(army)) { warn.push({ code: 'badArmy', where, unit, army }); continue; }
    const known = idx ? idx.get(unit) || [] : null;
    if (known && !known.length) warn.push({ code: 'unknown', where, unit });
    if (army) { if (known && known.length && !known.includes(army)) warn.push({ code: 'otherArmy', where, unit, army, armies: known.join(' ') }); put(unit, army); }
    else if (known && known.length) known.forEach(a => put(unit, a));
    else put(unit, '');
  }
  return out;
}
// whatever the page or the file gave -> a clean settings object + warnings [{code, where, ...}]
function normalize(input, idx) {
  const s = defaults(), warn = [], src = input && typeof input === 'object' ? input : {};
  for (const h of HABITS) {
    const x = src[h.id] && typeof src[h.id] === 'object' ? src[h.id] : {};
    s[h.id].on = x.on === true;
    for (const [k, d, lo, hi, st] of h.nums) s[h.id][k] = clampNum(x[k], d, lo, hi, st);
    if (h.units) {
      s[h.id].units = units(x.units, idx, h.id, warn);
      if (s[h.id].on && !s[h.id].units.length) warn.push({ code: 'noUnits', where: h.id });
    }
    if (h.rules) {
      s[h.id].rules = (Array.isArray(x.rules) ? x.rules.slice(0, 20) : []).map((r, i) => {
        r = r && typeof r === 'object' ? r : {};
        const o = { name: String(r.name || '').replace(/[\x00-\x1f]/g, ' ').trim().slice(0, 40) || 'rule ' + (i + 1),
          map: String(r.map || '').replace(/[\x00-\x1f]/g, ' ').trim().slice(0, 60),
          difficulty: DIFFS.includes(String(r.difficulty || '').toLowerCase()) ? String(r.difficulty || '').toLowerCase() : '' };
        for (const [k, d, lo, hi, st] of RULE_NUMS) o[k] = clampNum(r[k], d, lo, hi, st);
        o.units = units(r.units, idx, 'phases:' + (i + 1), warn);
        if (s[h.id].on && !o.units.length) warn.push({ code: 'noUnits', where: 'phases:' + (i + 1) });
        if (o.to && o.to <= o.from) warn.push({ code: 'badTime', where: 'phases:' + (i + 1) });
        return o;
      });
      if (s[h.id].on && !s[h.id].rules.length) warn.push({ code: 'noRules', where: h.id });
    }
  }
  if (typeof src.log === 'object' && src.log && typeof src.log.docs === 'string') s.log.docs = docsRel(src.log.docs);
  return { settings: s, warn };
}
// the Documents folder relative to the user profile (no user name in a mod file): "Documents", "OneDrive\Documents", '' = unknown
function docsRel(r) { r = String(r || '').replace(/\//g, '\\').replace(/^\\+|\\+$/g, ''); return /^[A-Za-z0-9 _.\\-]{1,120}$/.test(r) && !/(^|\\)\.\.(\\|$)/.test(r) && !/:/.test(r) ? r : ''; }

// ---- Lua text
function luaStr(s) {
  let o = '"';
  for (const ch of Buffer.from(String(s), 'utf8')) {
    if (ch === 0x22) o += '\\"'; else if (ch === 0x5c) o += '\\\\'; else if (ch < 0x20 || ch === 0x7f) o += '\\' + ch; else o += String.fromCharCode(ch);
  }
  return o + '"';
}
const luaNum = n => (Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10));
const unitRows = (list, ind) => (list.length ? '{\r\n' + list.map(u => ind + '\t{unit = ' + luaStr(u.unit) + ', army = ' + luaStr(u.army) + '},\r\n').join('') + ind + '}' : '{}');
// GoH: the notes say where each habit works there (the runner header has the why)
const ONLY_BZ = '(battle zones and ammunition only, maps without waypoints) ';
const NOTE_GOH = {
  attack: ONLY_BZ + NOTE.attack, fallback: ONLY_BZ + NOTE.fallback, front: ONLY_BZ + NOTE.front,
  log: 'write what the bot bought and ordered to bot_habits_<player>.log in the Gates of Hell log folder',
};
function dataLua(s, kind) {
  const notes = kind === 'goh' ? Object.assign({}, NOTE, NOTE_GOH) : NOTE;
  const L = [DATA_MARK + ' (v1). Made by the ARSENAL Bots page, which reads this file back: keep plain values only.',
    '-- Read by bot.habits.run.lua at match start. on = true turns a habit on. Minutes unless the note says seconds.',
    'BotHabits = {'];
  for (const h of HABITS) {
    const x = s[h.id], parts = ['on = ' + (x.on ? 'true' : 'false')];
    for (const [k] of h.nums) parts.push(k + ' = ' + luaNum(x[k]));
    if (h.id === 'log') parts.push('docs = ' + luaStr(x.docs || ''));
    let tail = '';
    if (h.units) tail = ', units = ' + unitRows(x.units, '\t');
    if (h.rules) {
      tail = ', rules = ' + (x.rules.length ? '{\r\n' + x.rules.map(r => '\t\t{name = ' + luaStr(r.name) + ', map = ' + luaStr(r.map) + ', difficulty = ' + luaStr(r.difficulty) +
        ', from = ' + luaNum(r.from) + ', to = ' + luaNum(r.to) + ', units = ' + unitRows(r.units, '\t\t') + '},\r\n').join('') + '\t}' : '{}');
    }
    L.push('\t-- ' + notes[h.id]);
    L.push('\t' + h.id + ' = {' + parts.join(', ') + tail + '},');
  }
  L.push('}');
  return L.join('\r\n') + '\r\n';   // ASCII plus latin1-coded UTF-8 bytes (luaStr): written with 'latin1'
}
// the mod's bot.habits.lua -> settings (raw, before normalize); throws with a plain message when it is not plain data
function readData(text) {
  const g = luatable.parse(text).globals.BotHabits;
  if (!g || g.$t !== 'table') throw new Error('bot.habits.lua has no BotHabits table');
  const plain = v => {
    if (!v || v.$t !== 'table') return v;
    const keys = Object.keys(v.hash);
    if (!keys.length) return v.arr.map(plain);
    const o = {}; for (const k of keys) o[k] = plain(v.hash[k]); return o;
  };
  const s = plain(g);
  // the file is latin1-read text: map names go back to UTF-8
  const utf = v => (typeof v === 'string' ? Buffer.from(v, 'latin1').toString('utf8') : Array.isArray(v) ? v.map(utf) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, utf(x)])) : v);
  return utf(s);
}
const crlf = t => String(t).replace(/\r?\n/g, '\r\n');
const RUN = {};
const RUN_FILE = { as2: 'habits.run.lua', goh: 'habits.goh.run.lua' };
function runLua(kind) { const k = kind === 'goh' ? 'goh' : 'as2'; if (RUN[k] == null) RUN[k] = crlf(fs.readFileSync(path.join(__dirname, RUN_FILE[k]), 'latin1')); return RUN[k]; }
const runVersion = t => { const m = RUN_MARK.exec(String(t || '')); return m ? Number(m[1]) : 0; };
const hasHook = t => { HOOK_RE.lastIndex = 0; return HOOK_RE.test(String(t || '')); };
// GoH: the entry starts the bot by picking a mode script (initializeBotAI, a require of .../multiplayer/modes/<mode>)
const loadsBot = (t, kind) => {
  const x = String(t || '').replace(/--[^\r\n]*/g, '');
  return kind === 'goh' ? /initializeBotAI|multiplayer\/modes\//.test(x) : /\/script\/multiplayer\/bot\]\]|\/script\/multiplayer\/bot["']/.test(x);
};
// the entry with the hook line (once, at the end: after the require of bot.lua)
function mainWith(base) {
  const b = crlf(base == null ? STOCK_MAIN : base);
  if (hasHook(b)) { const u = b.replace(OLD_HOOK_RE, HOOK); return u.endsWith('\r\n') ? u : u + '\r\n'; }
  return b.replace(/\s+$/, '') + '\r\n' + HOOK + '\r\n';
}
// the entry without the hook line; same = what is left matches the stock entry (then the mod copy can go)
function mainWithout(text, stock) {
  const t = crlf(text).replace(HOOK_RE, '');
  const norm = x => String(x || '').replace(/--[^\r\n]*/g, '').replace(/\s+/g, '');
  return { text: t, same: norm(t) === norm(stock == null ? STOCK_MAIN : stock) };
}

// a line diff (LCS; the files here are a few hundred lines) -> [{t: '+'|'-'|' ', s}], unchanged runs cut to 2 lines of context
function diff(a, b) {
  const A = a == null ? [] : String(a).split(/\r?\n/), B = b == null ? [] : String(b).split(/\r?\n/);
  if (A.length && A[A.length - 1] === '') A.pop();
  if (B.length && B[B.length - 1] === '') B.pop();
  const n = A.length, m = B.length;
  if (n * m > 4e6) return [{ t: '-', s: '(' + n + ' lines)' }, { t: '+', s: '(' + m + ' lines)' }];
  const W = m + 1, D = new Uint32Array((n + 1) * W);
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) D[i * W + j] = A[i] === B[j] ? D[(i + 1) * W + j + 1] + 1 : Math.max(D[(i + 1) * W + j], D[i * W + j + 1]);
  const out = []; let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { out.push({ t: ' ', s: A[i] }); i++; j++; }
    else if (D[(i + 1) * W + j] >= D[i * W + j + 1]) out.push({ t: '-', s: A[i++] });
    else out.push({ t: '+', s: B[j++] });
  }
  while (i < n) out.push({ t: '-', s: A[i++] });
  while (j < m) out.push({ t: '+', s: B[j++] });
  const keep = out.map((x, k) => x.t !== ' ' || out.slice(Math.max(0, k - 2), k + 3).some(y => y.t !== ' '));
  const res = []; let cut = 0;
  out.forEach((x, k) => { if (keep[k]) { if (cut) { res.push({ t: '~', s: cut + ' unchanged line(s)' }); cut = 0; } res.push(x); } else cut++; });
  if (cut) res.push({ t: '~', s: cut + ' unchanged line(s)' });
  return res;
}

module.exports = { REL, STOCK_MAIN, HOOK, HABITS, RULE_NUMS, DIFFS, UNIT, defaults, normalize, docsRel, dataLua, readData, runLua, runVersion, hasHook, loadsBot, mainWith, mainWithout, diff, luaStr, crlf, DATA_MARK };

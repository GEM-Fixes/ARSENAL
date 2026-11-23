// fix/textfix: one-line text fixers for findings whose message names the exact change. plan(c, lint, refList, o) -> { edits, cant, counts, done, notMine, skipped }
//   enc     STR_NOT_UTF8 (sdllint): cp1251 string values resaved as UTF-8 (lib/enc), whole file or nothing; refused when the text does not read as cp1251 [I: heuristic]
//   spell   MACRO_CASE_MISMATCH, KEY_CASE (SDL-33), MI_KEY_CASE (MIS-11), MIS_TEAMKEY_UNREAD (MIS-18): the name is rewritten to the one spelling the finding gives
//   syntax  MTL_DIFFUSE_BARE (SDL-61): the bare word is quoted; TAGS_MULTI_STRING (SDL-43): the strings are joined into one
//   asread  THRESHOLD_LT1 (DMG-19) -> 1; odd maxPlayers (MAP-02) -> the next even number: the value the engine already uses, so nothing changes in game
//           KEY_REPEAT (SDL-46): the earlier copy of a repeated one-line key is emptied (the later one is what the game uses; in a mission file only when both say the same)
//           PAREN_STRAY: a line that holds only the stray ')' is emptied. RICOCHET_CLAMP (KEY-04): out is written as in. THUNDER_NO_SOUND (VIS-14, from fxlint): the {enable}
//           of a thunder block with no sound is emptied. An emptied line stays as an empty line, so the line numbers of the file do not move
// spell and syntax make the game read a line it skipped before (a visible change): not pre-ticked in the GUI. enc and asread keep what the game shows on as64.
// every edit is one line, found exactly once on the reported line; a line that the base game's copy of the file also has is refused (INHERITED), not "fixed".
// lint = gate.lintAll findings (sdllint + keylint + milint), refList = refcheck findings; o = { kinds: Set, target, partCodes?: { kind: Set } (GoH: a kind limited to these codes, fix.js GOH_PART), goh?: true }
// Author: Imperator_Aug (ARSENAL, ia-a6fba115)
const enc = require('../../lib/enc'), vfs = require('../../lib/vfs');
const { mineRec, editFor, defIndex, strip } = require('./crashfix');

const RANK = { asread: 0, enc: 1, syntax: 2, spell: 3 };
const CODES = {
  spell: { NOT_MINE: 'FIX_SPELL_NOT_MINE', NOT_ON_LINE: 'FIX_SPELL_NOT_ON_LINE', PARSE: 'FIX_SPELL_PARSE', AMBIGUOUS: 'FIX_SPELL_AMBIGUOUS', INHERITED: 'FIX_SPELL_INHERITED' },
  syntax: { NOT_MINE: 'FIX_SYNTAX_NOT_MINE', NOT_ON_LINE: 'FIX_SYNTAX_NOT_ON_LINE', PARSE: 'FIX_SYNTAX_PARSE', AMBIGUOUS: 'FIX_SYNTAX_PARSE', INHERITED: 'FIX_SYNTAX_INHERITED' },
  asread: { NOT_ON_LINE: 'FIX_ASREAD_NOT_ON_LINE', PARSE: 'FIX_ASREAD_PARSE', AMBIGUOUS: 'FIX_ASREAD_PARSE' },
};
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// exactly one match of re on the line, else null
const one = (L, re) => { const ms = [...L.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'))]; return ms.length === 1 ? ms[0] : null; };
// a line without its strings, its ; comment and its line end (for bracket counting and whole-line shapes)
const bare = l => String(l).replace(/"[^"]*"/g, '""').replace(/;.*$/, '').replace(/\r$/, '');
const net = t => (t.match(/\{/g) || []).length - (t.match(/\}/g) || []).length;
const splice = (L, at, len, s) => L.slice(0, at) + s + L.slice(at + len);
// {Key ...}: the key token after the brace, exact case
const keyAt = (L, name, flags = '') => { const m = one(L, new RegExp('(\\{\\s*)' + esc(name) + '(?![\\w-])', flags)); return m ? { at: m.index + m[1].length, len: m[0].length - m[1].length } : null; };

// ---- enc: does the decoded text read as cp1251 (Russian / Ukrainian)? returns the reason it does not, or null
const CYR = /[А-яЁёЄєІіЇїҐґ]/, CYRG = new RegExp(CYR.source, 'g');
const SAME = '«»°±§©® –—…“”„‘’•™';   // same byte in cp1251 and cp1252
const SYM = SAME + '№';
const VOWEL = /[аеёиоуыэюяіїє]/i;
function encJudge(strs) {
  let word = false, cyr = false, other = '';
  for (const s of strs) {
    for (const ch of s) {
      if (ch.charCodeAt(0) < 0x80) continue;
      if (ch === '�') return 'a byte (0x98) that is no cp1251 character';
      if (CYR.test(ch)) cyr = true;
      else if (SYM.includes(ch)) { if (!SAME.includes(ch)) other = ch; }
      else return `the character "${ch}" is not usual in Russian or Ukrainian cp1251 text`;
    }
    for (const w of s.match(/[A-Za-zЀ-ӿ]+/g) || []) {
      const cy = (w.match(CYRG) || []).length, la = w.replace(CYRG, '');
      if (!cy) continue;
      if (la && (cy < 2 || /[^ABCEHKMOPTXaceopxy]/.test(la))) return `the word "${w}" mixes Latin and Cyrillic letters (the text may be cp1252, or a Cyrillic look-alike letter sits in a Latin word)`;
      if (!la && cy >= 3 && VOWEL.test(w)) word = true;
    }
  }
  if (cyr && !word) return 'no Cyrillic word of 3 or more letters (the text may be cp1252)';
  if (!cyr && other) return `only the symbol "${other}", which is another character in cp1252`;
  return null;
}
function encPass(c, lint, o, edits, R) {
  const by = new Map();
  for (const f of lint) if (strip(f.code) === 'STR_NOT_UTF8') { const k = String(f.file).toLowerCase(); if (!by.has(k)) by.set(k, []); by.get(k).push(f); }
  for (const [key, fs] of by) {
    const rec = mineRec(c, fs[0]);
    if (!rec) { R.cant.push({ key: fs[0].file, line: fs[0].line, code: 'FIX_ENC_NOT_MINE', msg: `${fs.length} non-UTF-8 string(s): the file wins from ${(c.v.files.get(key) || {}).layer || 'nowhere'}, not from this mod` }); continue; }
    const e = editFor(edits, c, rec, key);
    const bad = enc.sdlScan(e.before, Infinity).badStr;
    const why = bad.length ? encJudge(bad.map(b => enc.decodeCp1251(b.bytes))) : 'no non-UTF-8 string found on a second read';
    if (why) { R.cant.push({ key: fs[0].file, line: bad.length ? bad[0].line : fs[0].line, code: 'FIX_ENC_AMBIGUOUS', msg: `${bad.length} non-UTF-8 string(s) not resaved: ${why}. Resave the file as UTF-8 by hand in an editor that shows the text right` }); continue; }
    const r = enc.cp1251StringsToUtf8(e.before);
    const a = e.work, b = r.buf.toString('latin1').split('\n');
    if (a.length !== b.length) { R.cant.push({ key: fs[0].file, line: fs[0].line, code: 'FIX_ENC_AMBIGUOUS', msg: 'the resaved text has another line count' }); continue; }
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) e.lines.add(i + 1);
    e.work = b;
    for (const f of fs) { e.targets.push(f); e.why.push(`STR_NOT_UTF8 line ${f.line}: cp1251 text resaved as UTF-8`); }
    (e.kinds = e.kinds || new Set()).add('enc');
    (e.notes = e.notes || []).push(`${r.fixed} string value(s) on ${e.lines.size} line(s) resaved as UTF-8 for as64 (the old mowas_2.exe reads cp1251: use --target classic or mowas2 to leave them)`);
    R.counts.enc += fs.length;
  }
}

// ---- one-line rules. parse(msg) -> undefined (not this form: skipped), null (unreadable) or the parsed parts; fix(p, L, x) -> { L, why } | { no: 'not_on_line'|'AMBIGUOUS'|'PARSE', msg }
const RULES = {
  MACRO_CASE_MISMATCH: {
    kind: 'spell',
    parse: m => { const r = /^macro "([^"]+)" is used but only "([^"]+)" is defined/.exec(m); return r ? { a: r[1], b: r[2] } : null; },
    fix(p, L, x) {
      if (defIndex(x.c).has(p.a)) return { no: 'ambiguous', msg: `macro "${p.a}" is defined with that exact case in ${[...defIndex(x.c).get(p.a)].slice(0, 3).join(' | ')}: an include may be what is missing, not the case` };
      const own = new Set(); for (const m of x.text().matchAll(/\(\s*define\s+"([^"]*)"/g)) if (m[1].toLowerCase() === p.a.toLowerCase()) own.add(m[1]);
      if (own.size !== 1 || !own.has(p.b)) return { no: 'ambiguous', msg: `macro "${p.a}": the file defines ${own.size} spellings (${[...own].join(', ') || 'none found'})` };
      const m = one(L, new RegExp('"' + esc(p.a) + '"'));
      if (!m) return { no: 'not_on_line' };
      // the call now expands: the keys of the define body are wanted changes, so its lines count as targeted
      const also = [], T = x.text().split('\n');
      for (let i = 0; i < T.length; i++) if (new RegExp('\\(\\s*define\\s+"' + esc(p.b) + '"').test(T[i])) { let d = 0, j = i; do { for (const ch of T[j]) d += ch === '(' ? 1 : ch === ')' ? -1 : 0; also.push(++j); } while (d > 0 && j < T.length); }
      return { L: splice(L, m.index + 1, p.a.length, p.b), why: `macro "${p.a}" -> "${p.b}"`, also };
    },
  },
  KEY_CASE: {
    kind: 'spell',
    parse: m => { const r = /^key "([^"]+)": .*vanilla spells it ((?:"[^"]+"(?: \/ )?)+)/.exec(m); return r ? { a: r[1], alts: [...r[2].matchAll(/"([^"]+)"/g)].map(q => q[1]) } : null; },
    fix(p, L) {
      if (p.alts.length !== 1 || p.alts[0].toLowerCase() !== p.a.toLowerCase()) return { no: 'ambiguous', msg: `key "${p.a}": vanilla has ${p.alts.length} spellings (${p.alts.join(', ')})` };
      const k = keyAt(L, p.a);
      return k ? { L: splice(L, k.at, k.len, p.alts[0]), why: `key ${p.a} -> ${p.alts[0]}` } : { no: 'not_on_line' };
    },
  },
  MI_KEY_CASE: {
    kind: 'spell',
    parse: m => { const r = /key '([^']+)' is case-sensitive(?:: skipped silently \(use ([^)]+)\)|; the reader knows '([^']+)')/.exec(m), b = r && (r[2] || r[3]); return r && b && b !== 'undefined' && b.toLowerCase() === r[1].toLowerCase() ? { a: r[1], b } : null; },
    fix(p, L) { const k = keyAt(L, p.a); return k ? { L: splice(L, k.at, k.len, p.b), why: `key ${p.a} -> ${p.b}` } : { no: 'not_on_line' }; },
  },
  MIS_TEAMKEY_UNREAD: {
    kind: 'spell',
    parse: m => { const r = /^(minTeamPlayers|maxTeamPlayers) is not read; use (minTeamSlots|maxTeamSlots)/.exec(m); return r ? { a: r[1], b: r[2] } : null; },
    fix(p, L, x) {
      if (new RegExp('\\{\\s*' + p.b + '(?![\\w-])', 'i').test(x.text())) return { no: 'ambiguous', msg: `${p.a}: the file already has ${p.b}` };
      const k = keyAt(L, p.a, 'i');
      return k ? { L: splice(L, k.at, k.len, p.b), why: `key ${p.a} -> ${p.b} (the game starts to read this line)` } : { no: 'not_on_line' };
    },
  },
  MTL_DIFFUSE_BARE: {
    kind: 'syntax',
    parse: m => { const r = /^\{diffuse ([^}"\s]+)\}: the texture name must be a quoted string/.exec(m); return r ? { a: r[1] } : null; },
    fix(p, L) { const m = one(L, new RegExp('(\\{\\s*diffuse\\s+)' + esc(p.a) + '(?=\\s*\\})', 'i')); return m ? { L: splice(L, m.index + m[1].length, p.a.length, '"' + p.a + '"'), why: `{diffuse ${p.a}} -> {diffuse "${p.a}"}` } : { no: 'not_on_line' }; },
  },
  TAGS_MULTI_STRING: {
    kind: 'syntax',
    parse: m => { const r = /write one string, \{tags "([^"]*)"\}/.exec(m); return r ? { b: r[1] } : null; },
    fix(p, L) {
      const m = one(L, /(\{\s*tags)((?:\s+"[^"]*"){2,})(?=\s*\})/i);
      if (!m) return { no: 'not_on_line' };
      const j = [...m[2].matchAll(/"([^"]*)"/g)].map(q => q[1]).join(' ');
      if (j !== p.b) return { no: 'parse', msg: `{tags}: the line joins to "${j}", the finding says "${p.b}"` };
      return { L: splice(L, m.index + m[1].length, m[2].length, ' "' + j + '"'), why: `{tags} strings joined: "${j}"` };
    },
  },
  THRESHOLD_LT1: {
    kind: 'asread', ref: true,
    parse: m => { const r = /^projectileDamageThreshold (\S+) is clamped to 1/.exec(m); return r && isFinite(Number(r[1])) ? { v: Number(r[1]) } : null; },
    fix(p, L) {
      const m = one(L, /(\{\s*projectileDamageThreshold\s+)([-+]?[\d.]+(?:e[-+]?\d+)?)(?=[\s}])/i);
      return m && Number(m[2]) === p.v ? { L: splice(L, m.index + m[1].length, m[2].length, '1'), why: `projectileDamageThreshold ${m[2]} -> 1 (the value the game already uses)` } : { no: 'not_on_line' };
    },
  },
  KEY_REPEAT: {
    kind: 'asread',
    parse: m => { const r = /^\{([^}]+)\} repeated in one block/.exec(m); return r ? { k: r[1] } : null; },
    fix(p, L, x) {
      const re = new RegExp('^\\s*\\{\\s*' + esc(p.k) + '(\\s[^{}]*)?\\}\\s*$', 'i'), val = l => String(l).replace(/\s+/g, ' ').trim();   // strings kept: the same text, apart from spacing
      if (!re.test(bare(L))) return { no: 'not_on_line' };
      // upwards through the same block: lines of nested blocks are passed over, the opening line of this block ends the search
      const hits = [];
      for (let j = x.line - 2, d = 0; j >= 0; j--) {
        const t = bare(x.work[j]), n = net(t);
        if (n === 0 && d === 0 && re.test(t)) hits.push(j + 1);
        d -= n; if (d < 0) break;
      }
      if (hits.length !== 1) return { no: 'ambiguous', msg: `{${p.k}}: ${hits.length} earlier one-line copies found in the block, not one` };
      const same = val(x.work[hits[0] - 1]) === val(L);
      if (!same && x.goh) return { no: 'ambiguous', msg: `{${p.k}}: lines ${hits[0]} and ${x.line} give different values; which copy GoH keeps is not proven for every file reader, so both stay` };
      if (!same && /\.(mi|mis)$/.test(x.key)) return { no: 'ambiguous', msg: `{${p.k}}: lines ${hits[0]} and ${x.line} of a mission file give different values; which one the mission reader keeps is not proven, so both stay` };
      return { L, blank: hits, why: `{${p.k}} of line ${hits[0]} emptied (${same ? 'the same as this line' : 'this later line is the one the game uses'})` };
    },
  },
  PAREN_STRAY: {
    kind: 'asread',
    parse: m => /^stray '\)'/.test(m) ? {} : undefined,
    fix(p, L, x) { return /^\s*\)\s*$/.test(L) ? { L, blank: [x.line], why: "the stray ')' the game drops is removed" } : { no: 'not_on_line', msg: "the stray ')' shares its line with other text: remove it by hand" }; },
  },
  RICOCHET_CLAMP: {
    kind: 'asread',
    parse: m => { const r = /^ricochet angle row \{(\S+) (\S+)\}: out > in/.exec(m); return r ? { a: r[1], b: r[2] } : null; },
    fix(p, L) {
      const m = one(L, new RegExp('(\\{\\s*' + esc(p.a) + '\\s+)' + esc(p.b) + '(?=\\s*\\})'));
      return m ? { L: splice(L, m.index + m[1].length, p.b.length, p.a), why: `ricochet angle row {${p.a} ${p.b}} -> {${p.a} ${p.a}} (the value the game already uses)` } : { no: 'not_on_line' };
    },
  },
  THUNDER_NO_SOUND: {
    kind: 'asread',
    parse: m => /^thunder is enabled but has no/.test(m) ? {} : undefined,
    fix(p, L, x) {
      if (!/^\s*\{\s*thunder\s*$/i.test(bare(L))) return { no: 'not_on_line' };
      const hits = [];
      for (let j = x.line, d = 1; j < x.work.length && d > 0; j++) {
        const t = bare(x.work[j]);
        if (d === 1 && /^\s*\{\s*enable\s*\}\s*$/i.test(t)) hits.push(j + 1);
        d += net(t);
      }
      return hits.length === 1 ? { L, blank: hits, why: `thunder switched off: {enable} of line ${hits[0]} emptied (with no sound it never strikes)` } : { no: 'ambiguous', msg: `thunder: ${hits.length} {enable} lines found alone on a line in the block, not one` };
    },
  },
  MAP_PLAYERS: {
    kind: 'asread',
    parse: m => { const r = /^maxPlayers (\d+) is odd/.exec(m); return r ? { n: +r[1] } : undefined; },
    fix(p, L) {
      const m = one(L, new RegExp('(\\{\\s*maxPlayers\\s+)' + p.n + '(?=[\\s}])', 'i'));
      return m ? { L: splice(L, m.index + m[1].length, String(p.n).length, String(p.n + 1)), why: `maxPlayers ${p.n} -> ${p.n + 1} (the value the game already uses)` } : { no: 'not_on_line' };
    },
  },
};

const _base = new Map();
function baseLines(c, key) {
  if (_base.has(key) && _base.get(key).vb === c.vb) return _base.get(key).set;
  let set = null;
  const rec = c.vb.files.get(key);
  if (rec) { try { set = new Set(vfs.readRec(rec).toString('latin1').split('\n').map(s => s.trim())); } catch { set = null; } }
  _base.set(key, { vb: c.vb, set });
  return set;
}

function plan(c, lint, refList, o) {
  const edits = new Map(), R = { edits: [], cant: [], counts: { enc: 0, spell: 0, syntax: 0, asread: 0 }, done: [], notMine: 0, skipped: [] };
  const kinds = o.kinds;
  if (kinds.has('enc')) {
    if (/^(classic|mowas2)$/.test(o.target || '')) R.skipped.push('enc: skipped for --target ' + o.target + ' (the old exe reads cp1251)');
    else encPass(c, lint || [], o, edits, R);
  }
  const seen = new Set();
  const feed = [...(lint || []).map(f => [f, false]), ...(refList || []).map(f => [f, true])];
  for (const [f, fromRef] of feed) {
    const code = strip(f.code), rule = RULES[code];
    if (!rule || !kinds.has(rule.kind) || !!rule.ref !== fromRef) continue;
    if (o.partCodes && o.partCodes[rule.kind] && !o.partCodes[rule.kind].has(code)) continue;   // GoH: only the rules known to hold there (fix.js GOH_PART)
    const dk = `${String(f.file).toLowerCase()}:${f.line}:${code}:${f.msg}`;
    if (seen.has(dk)) continue; seen.add(dk);
    const K = CODES[rule.kind], p = rule.parse(String(f.msg));
    if (p === undefined) continue;
    const key = String(f.file).toLowerCase(), rec = mineRec(c, f);
    if (!rec) { if (K.NOT_MINE) R.cant.push({ key: f.file, line: f.line, code: K.NOT_MINE, msg: `${code}: the file wins from ${(c.v.files.get(key) || {}).layer || 'nowhere'}, not from this mod` }); else R.notMine++; continue; }
    if (p === null) { R.cant.push({ key: f.file, line: f.line, code: K.PARSE, msg: `${code}: cannot read the change from "${String(f.msg).slice(0, 70)}"` }); continue; }
    const e = editFor(edits, c, rec, key), L = e.work[f.line - 1];
    if (L === undefined) { R.cant.push({ key: f.file, line: f.line, code: K.NOT_ON_LINE, msg: `${code}: the file has no line ${f.line}` }); continue; }
    if (K.INHERITED) { const b = baseLines(c, key); if (b && b.has(L.trim())) { R.cant.push({ key: f.file, line: f.line, code: K.INHERITED, msg: `${code}: the base game's own ${key} has the same line, so the mod copied it; changing it would differ from the base game. Left as it is` }); continue; } }
    let text = null;
    const r = rule.fix(p, L, { c, key, line: f.line, work: e.work, goh: !!o.goh, text: () => text || (text = e.work.join('\n')) });
    if (r.no) { R.cant.push({ key: f.file, line: f.line, code: K[r.no.toUpperCase()], msg: r.msg ? `${code}: ${r.msg}` : `${code}: the text to change was not found exactly once on line ${f.line} (included or macro text?)` }); continue; }
    e.work[f.line - 1] = r.L;
    for (const l of r.blank || []) { e.work[l - 1] = /\r$/.test(e.work[l - 1]) ? '\r' : ''; e.lines.add(l); }
    e.targets.push(f); e.lines.add(f.line); for (const l of r.also || []) e.lines.add(l); e.why.push(`${code} line ${f.line}: ${r.why}`);
    (e.kinds = e.kinds || new Set()).add(rule.kind);
    R.counts[rule.kind]++;
    if (fromRef) R.done.push(f);
  }
  for (const e of edits.values()) {
    if (!e.why.length) continue;
    e.kind = [...e.kinds].sort((a, b) => RANK[b] - RANK[a])[0];
    e.kindList = [...e.kinds].sort();
    e.why.push(...(e.notes || []));
    e.after = Buffer.from(e.work.join('\n'), 'latin1');
    delete e.work; delete e.kinds; delete e.notes;
    R.edits.push(e);
  }
  return R;
}

module.exports = { plan, encJudge, RULES, KINDS: Object.keys(RANK), CODES: Object.keys(RULES) };

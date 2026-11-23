// Bots page part "stages": the surgical editor of script/multiplayer/bot.data.lua (pure: text in, text out; no files, no game).
// parse(text) finds every piece the cards edit by its char range: the Purchases stages ({Repeat = N, Units = {["army"] = {rows}}}), each
// row {priority = P, [min_income = X, ][min_team = Y, ]class = UnitClass.C, unit = "U"} (the stock key order, stock bot.data.lua 3.262 [V]),
// and the movement globals FlagPriority {Captured, Enemy, Neutral}, OrderRotationPeriod (ms, stock `3 * 60 * 1000`), MaxSquadSize.
// apply(text, ops, opt) runs the ops in order, each one a splice of the text: every byte it does not touch stays as it was (CRLF, comments,
// cp1251 bytes: the caller reads and writes latin1). Shapes stock bot.lua misreads are never written: Repeat a whole number >= 0 (MIS-84),
// only the entry keys stock bot.lua reads (MIS-80), every army kept in every stage (MIS-09), a unit only when its buy card is in that army
// (MIS-32, opt.cards). The result is read back with botrecipe/luatable and checked with botrecipe/botcheck: a new error refuses the lot.
// Refusals are {code, args} (the page words them in four languages) with an English msg.
// Facts from stock bot.lua (PIter, GetUnitToSpawn, OnGameQuant) [V]: a pick happens each quant whether or not a
// unit is bought, Repeat counts picks and 0 stays forever, PIter stops after the last stage, an empty list picks nothing.
// Author: Imperator_Aug (ARSENAL, ia-144d67c4)
'use strict';
const ENTRY_KEYS = ['priority', 'min_income', 'min_team', 'class', 'unit'];
const FLAGS = ['Captured', 'Enemy', 'Neutral'];
const MAX_STAGES = 50;

class Refuse extends Error { constructor(code, args, msg) { super(msg || code); this.code = code; this.args = args || {}; } }
const no = (code, args, msg) => { throw new Refuse(code, args, msg); };

// ---------- reading ----------
// code view of the text, same length: comments become spaces (line breaks kept), string contents become '_' (quotes kept)
function blank(s) {
  let o = '', i = 0; const n = s.length;
  while (i < n) {
    const c = s[i];
    if (c === '-' && s[i + 1] === '-') {
      const lb = /^--\[(=*)\[/.exec(s.slice(i, i + 64)); let end;
      if (lb) { const e = s.indexOf(']' + lb[1] + ']', i + 2); end = e < 0 ? n : e + lb[1].length + 2; }
      else { end = s.indexOf('\n', i); if (end < 0) end = n; else if (s[end - 1] === '\r') end--; }
      o += s.slice(i, end).replace(/[^\r\n]/g, ' '); i = end; continue;
    }
    const ls = c === '[' && /^\[(=*)\[/.exec(s.slice(i, i + 64));
    if (ls) { const e = s.indexOf(']' + ls[1] + ']', i + 2), end = e < 0 ? n : e + ls[1].length + 2; o += '"' + s.slice(i + 1, end - 1).replace(/[^\r\n]/g, '_') + '"'; i = end; continue; }
    if (c === '"' || c === "'") {
      let j = i + 1; while (j < n && s[j] !== c && s[j] !== '\n') j += s[j] === '\\' ? 2 : 1;
      if (j >= n) { o += c + '_'.repeat(n - i - 1); i = n; continue; }
      o += c + '_'.repeat(j - i - 1) + (s[j] === '\n' ? '\n' : c); i = j + 1; continue;
    }
    o += c; i++;
  }
  return o;
}
function closeOf(code, o) { let d = 0; for (let i = o; i < code.length; i++) { const c = code[i]; if (c === '{') d++; else if (c === '}' && --d === 0) return i; } return -1; }
// direct child {..} pairs between o and c (o = -1, c = length: the whole file)
function kids(code, o, c) { const out = []; for (let i = o + 1; i < c; i++) if (code[i] === '{') { const k = closeOf(code, i); if (k < 0 || k > c) return null; out.push([i, k]); i = k; } return out; }
// the region o+1..c-1 with the inside of every child table blanked (its braces kept): keys of this level only
function flat(code, o, c) {
  const ks = kids(code, o, c); if (!ks) return null;
  let s = code.slice(o + 1, c);
  for (const [a, b] of ks) s = s.slice(0, a - o) + code.slice(a + 1, b).replace(/[^\r\n]/g, ' ') + s.slice(b - o - 1);
  return { s, base: o + 1, kids: ks };
}
const isWs = s => /^[ \t\r\n]*$/.test(s);
const lineStart = (t, i) => t.lastIndexOf('\n', i - 1) + 1;
const eolAt = (t, i) => { const e = t.indexOf('\n', i); return e < 0 ? t.length : (t[e - 1] === '\r' ? e - 1 : e); };   // where the line break of the line holding i starts
const afterComma = (code, c) => { let j = c + 1; while (j < code.length && /[ \t\r\n]/.test(code[j])) j++; return code[j] === ',' || code[j] === ';' ? j : -1; };
const NUM = /^\d+(?:\.\d+)?$/;

// value range after `key =` in a flat region: up to , ; } or the line end (comments are spaces in the code view)
function valAt(f, re) {
  const m = re.exec(f.s); if (!m) return null;
  const a = m.index + m[0].length; let b = a;
  while (b < f.s.length && !/[,;}\r\n]/.test(f.s[b])) b++;
  while (b > a && /[ \t]/.test(f.s[b - 1])) b--;
  return { a: f.base + a, b: f.base + b, key: f.base + m.index };
}
function lastTop(top, name) {
  const re = new RegExp('(?:^|[\\n;])[ \\t]*' + name + '[ \\t]*=[ \\t]*', 'g'); let m, last = null;
  while ((m = re.exec(top.s))) last = { key: top.base + m.index + m[0].indexOf(name), at: top.base + m.index + m[0].length };
  return last;
}

function parseRow(text, code, o, c) {
  const inner = code.slice(o + 1, c), f = {}, keys = [];
  let odd = /[{}]/.test(inner) ? 'nested' : null, p = 0;
  for (const part of inner.split(/[,;]/)) {
    const at = o + 1 + p; p += part.length + 1;
    if (isWs(part)) continue;
    const m = /^(\s*)([A-Za-z_]\w*)(\s*=\s*)(.*?)\s*$/.exec(part);
    if (!m) { odd = odd || 'positional'; continue; }
    const ka = at + m[1].length, va = ka + m[2].length + m[3].length, vb = va + m[4].length;
    f[m[2]] = { a: va, b: vb, v: text.slice(va, vb), key: ka };
    keys.push(m[2]);
  }
  const num = k => f[k] && NUM.test(f[k].v) ? Number(f[k].v) : null;
  const cm = f.class && /^UnitClass\.(\w+)$/.exec(f.class.v), um = f.unit && /^"([^"]*)"$/.exec(f.unit.v);
  if (!odd && keys.some(k => !ENTRY_KEYS.includes(k))) odd = 'key';
  if (!odd && (!cm || !um || num('priority') === null)) odd = 'value';
  const ls = lineStart(text, o), comma = afterComma(code, c), e = eolAt(text, c);
  const own = isWs(text.slice(ls, o)) && isWs(code.slice(comma >= 0 ? comma + 1 : c + 1, e));
  return { o, c, comma, ls, eol: e, own, indent: text.slice(ls, o), f, keys, odd,
    unit: um ? um[1] : (f.unit ? f.unit.v : '?'), cls: cm ? cm[1] : (f.class ? f.class.v : '?'), priority: num('priority'),
    min_income: f.min_income ? num('min_income') : null, min_team: f.min_team ? num('min_team') : null };
}

function parse(text) {
  const code = blank(text), eol = text.includes('\r\n') ? '\r\n' : '\n';
  const top = flat(code, -1, code.length);
  const R = { eol, code, odd: null, stages: [], globals: {}, unitClass: [], armies: [] };
  if (!top || (code.match(/\{/g) || []).length !== (code.match(/\}/g) || []).length) { R.odd = 'braces'; return R; }
  // movement settings
  const ms = lastTop(top, 'MaxSquadSize');
  if (ms) { const v = valAt({ s: code.slice(ms.at, eolAt(text, ms.at)), base: ms.at }, /^/); R.globals.MaxSquadSize = { a: v.a, b: v.b, v: text.slice(v.a, v.b) }; }
  const orp = lastTop(top, 'OrderRotationPeriod');
  if (orp) {
    const e = eolAt(text, orp.at), v = valAt({ s: code.slice(orp.at, e), base: orp.at }, /^/), cm = /^([ \t]*)(--.*)$/.exec(text.slice(v.b, e));
    R.globals.OrderRotationPeriod = { a: v.a, b: v.b, v: text.slice(v.a, v.b), ms: msOf(text.slice(v.a, v.b)), comment: cm ? { a: v.b + cm[1].length, b: e, v: cm[2] } : null };
  }
  const fp = lastTop(top, 'FlagPriority');
  if (fp && code[fp.at] === '{') {
    const c = closeOf(code, fp.at), f = c < 0 ? null : flat(code, fp.at, c);
    if (f) { R.globals.FlagPriority = {}; for (const k of FLAGS) { const v = valAt(f, new RegExp('\\b' + k + '\\s*=\\s*')); if (v) R.globals.FlagPriority[k] = { a: v.a, b: v.b, v: text.slice(v.a, v.b) }; } }
  }
  const uc = lastTop(top, 'UnitClass');
  if (uc && code[uc.at] === '{') { const c = closeOf(code, uc.at), f = c < 0 ? null : flat(code, uc.at, c); if (f) for (const m of f.s.matchAll(/\b([A-Za-z_]\w*)\s*=/g)) R.unitClass.push(m[1]); }
  // stages
  const pu = lastTop(top, 'Purchases');
  if (!pu || code[pu.at] !== '{') { R.odd = 'noPurchases'; return R; }
  const pc = closeOf(code, pu.at), pf = pc < 0 ? null : flat(code, pu.at, pc);
  if (!pf) { R.odd = 'braces'; return R; }
  R.P = { o: pu.at, c: pc };
  if (!/^[\s,;{}]*$/.test(pf.s.replace(/\{\s*\}/g, ''))) { R.odd = 'stageKeys'; return R; }   // named keys in Purchases: PIter order is next() order (MIS-84)
  const seen = new Map();
  for (const [o, c] of pf.kids) {
    const f = flat(code, o, c), S = { o, c, comma: afterComma(code, c), ls: lineStart(text, o), armies: [], odd: null };
    S.indent = text.slice(S.ls, o); S.own = isWs(S.indent);
    const hm = /^\{([ \t]*--[ \t]*purchase[ \t]*)(\d+)/.exec(text.slice(o, o + 40)); if (hm) S.header = { a: o + 1 + hm[1].length, b: o + 1 + hm[1].length + hm[2].length };
    const rv = valAt(f, /\bRepeat\s*=\s*/);
    if (rv) { const e = eolAt(text, rv.b), cm = /^(,?[ \t]*)(--.*)$/.exec(text.slice(rv.b, e)); S.rep = { a: rv.a, b: rv.b, v: text.slice(rv.a, rv.b), comment: cm ? { b: e, v: cm[2], pre: cm[1] } : null }; }
    S.repeat = S.rep && /^\d+$/.test(S.rep.v) ? Number(S.rep.v) : null;
    if (!S.rep || S.repeat === null) S.odd = 'repeat';
    S.keys = [...f.s.matchAll(/\b([A-Za-z_]\w*)\s*=/g)].map(m => m[1]);
    const um = /\bUnits\s*=\s*\{/.exec(f.s);
    if (!um) { S.odd = S.odd || 'units'; R.stages.push(S); continue; }
    const uo = f.base + um.index + um[0].length - 1, ucl = closeOf(code, uo), uf = flat(code, uo, ucl);
    S.U = { o: uo, c: ucl };
    const named = new Set();
    for (const m of uf.s.matchAll(/(?:\[\s*"[^"]*"\s*\]|\b[A-Za-z_]\w*)\s*=\s*\{/g)) {
      const ka = uf.base + m.index, ao = ka + m[0].length - 1, ac = closeOf(code, ao);
      const key = text.slice(ka, ao), nm = /^\[\s*"([^"]*)"/.exec(key), name = nm ? nm[1] : /^\w+/.exec(key)[0];
      const lm = /^[ \t]*--([^\r\n]*)/.exec(text.slice(ao + 1, eolAt(text, ao)));
      const A = { name, ka, o: ao, c: ac, comma: afterComma(code, ac), kls: lineStart(text, ka), label: lm ? lm[1].trim() : '', rows: [] };
      A.kindent = text.slice(A.kls, ka); A.own = isWs(A.kindent);
      named.add(ao);
      for (const [ro, rc] of kids(code, ao, ac) || []) A.rows.push(parseRow(text, code, ro, rc));
      if (!seen.has(name) || (!seen.get(name) && A.label)) seen.set(name, A.label);
      S.armies.push(A);
    }
    if (uf.kids.some(([a]) => !named.has(a))) S.odd = S.odd || 'unnamedArmy';
    R.stages.push(S);
  }
  R.armies = [...seen].map(([id, label]) => ({ id, label }));
  return R;
}
// OrderRotationPeriod expression -> ms (stock: 3 * 60 * 1000); null when not a plain product of numbers
function msOf(v) {
  const s = String(v).trim();
  if (!/^\d+(?:\.\d+)?(?:\s*\*\s*\d+(?:\.\d+)?)*$/.test(s)) return null;
  return s.split('*').reduce((x, y) => x * Number(y.trim()), 1);
}

// the plain model the page shows
function model(text) {
  const R = parse(text), g = R.globals, num = x => (x && NUM.test(x.v) ? Number(x.v) : null);
  const fp = g.FlagPriority || {};
  return {
    odd: R.odd, armies: R.armies, unitClass: R.unitClass,
    stages: R.stages.map((S, i) => ({ n: i + 1, repeat: S.repeat, odd: S.odd, armies: Object.fromEntries(S.armies.map(A => [A.name, A.rows.map(r => ({ unit: r.unit, cls: r.cls, priority: r.priority, min_income: r.min_income, min_team: r.min_team, odd: r.odd || (r.own ? null : 'line') }))])) })),
    move: {
      flag: Object.fromEntries(FLAGS.map(k => [k, num(fp[k])])),
      rotationMs: g.OrderRotationPeriod ? g.OrderRotationPeriod.ms : null, rotationText: g.OrderRotationPeriod ? g.OrderRotationPeriod.v : null,
      squad: g.MaxSquadSize && /^\d+$/.test(g.MaxSquadSize.v) ? Number(g.MaxSquadSize.v) : null,
    },
  };
}

// ---------- editing ----------
const splice = (t, a, b, s) => t.slice(0, a) + s + t.slice(b);
const fmtDec = v => { const n = Number(v); return Number.isInteger(n) ? n + '.0' : String(n); };   // stock writes 1.0, 0.5
function numIn(v, lo, hi, whole, code, args) {
  const s = String(v == null ? '' : v).trim();
  if (!(whole ? /^\d+$/ : /^\d+(?:\.\d+)?$/).test(s) || Number(s) < lo || Number(s) > hi) no(code, Object.assign({ v: s, lo, hi }, args), `${code}: ${s} (${lo} to ${hi}${whole ? ', whole number' : ''})`);
  return Number(s);
}
const UNIT_RE = /^[A-Za-z0-9_\-.()]+$/;
function stageOf(R, n) { const S = R.stages[Number(n) - 1]; if (!S) no('noStage', { stage: n }, 'no purchase stage ' + n); if (S.odd) no('oddStage', { stage: n, why: S.odd }, `stage ${n} has a form this editor does not change (${S.odd})`); return S; }
function armyOf(S, n, a) { const A = S.armies.find(x => x.name === a); if (!A) no('noArmy', { stage: n, army: a }, `stage ${n} has no ["${a}"] list`); return A; }
function rowOf(A, n, i) { const r = A.rows[Number(i)]; if (!r) no('noRow', { stage: n, army: A.name, row: Number(i) + 1 }, `stage ${n} ${A.name}: no row ${Number(i) + 1}`); return r; }
const needOwn = (r, n, a) => { if (!r.own) no('oddLine', { stage: n, army: a, unit: r.unit }, `stage ${n} ${a}: the ${r.unit} row shares its line with other text; edit it by hand`); };
function rowText(p) {
  let s = '{priority = ' + fmtDec(p.priority);
  if (p.min_income != null) s += ', min_income = ' + (Number(p.min_income) === 0 ? '0' : fmtDec(p.min_income));
  if (p.min_team != null) s += ', min_team = ' + Number(p.min_team);
  return s + ', class = UnitClass.' + p.cls + ', unit = "' + p.unit + '"}';
}
// opt.cards: Map army -> Set of card names (plus '*' = cards with no army); null = not known (an add is refused)
function hasCard(cards, army, unit) { if (!cards) return false; const a = cards.get(army), s = cards.get('*'); return !!((a && a.has(unit)) || (s && s.has(unit))); }
function checkUnitFor(opt, army, unit) {
  if (!UNIT_RE.test(unit || '')) no('badUnit', { unit }, 'unit names use letters, digits, _ - . and brackets');
  if (!opt.cards) no('noCards', { unit, army }, 'the buy cards could not be read (set the game folder), so ' + unit + ' cannot be checked');
  if (!hasCard(opt.cards, army, unit)) no('notInArmy', { unit, army }, `${unit} has no buy card in army ${army}: the ${army} bot would never get it (MIS-32)`);
}
// renumber the {--purchase N comments so they follow the stage order (lib.js stageAt and botrecipe --stage find stages by them)
function renumber(t) {
  const R = parse(t);
  for (let i = R.stages.length - 1; i >= 0; i--) { const h = R.stages[i].header; if (h && t.slice(h.a, h.b) !== String(i + 1)) t = splice(t, h.a, h.b, String(i + 1)); }
  return t;
}

const OPS = {
  repeat(t, o) {
    const R = parse(t), S = stageOf(R, o.stage), v = numIn(o.value, 0, 1000, true, 'badRepeat');
    if (v === S.repeat) return { t };
    // the stock "--infinite" note on a forever stage goes when the stage stops being forever (cut first: it lies after the number)
    let u = t; const cm = S.rep.comment;
    if (v !== 0 && cm && /^--\s*infinite\s*$/i.test(cm.v)) u = splice(u, S.rep.b + cm.pre.replace(/[ \t]+$/, '').length, cm.b, '');
    u = splice(u, S.rep.a, S.rep.b, String(v));
    return { t: u, ch: { k: 'repeat', stage: Number(o.stage), was: S.repeat, now: v } };
  },
  rowSet(t, o) {
    const R = parse(t), S = stageOf(R, o.stage), A = armyOf(S, o.stage, o.army), r = rowOf(A, o.stage, o.row);
    if (r.odd) no('oddRow', { stage: o.stage, army: o.army, unit: r.unit }, `the ${r.unit} row has a form this editor does not change`);
    const fld = o.field, ch = { k: 'rowSet', stage: Number(o.stage), army: o.army, unit: r.unit, field: fld };
    if (fld === 'priority') {
      const v = numIn(o.value, 0.01, 100000, false, 'badPriority');
      if (v === r.priority) return { t };
      return { t: splice(t, r.f.priority.a, r.f.priority.b, fmtDec(v)), ch: Object.assign(ch, { was: r.priority, now: v }) };
    }
    if (fld === 'cls') {
      if (!R.unitClass.includes(o.value)) no('badClass', { v: o.value }, 'unknown unit class ' + o.value);
      if (o.value === r.cls) return { t };
      return { t: splice(t, r.f.class.a, r.f.class.b, 'UnitClass.' + o.value), ch: Object.assign(ch, { was: r.cls, now: o.value }) };
    }
    if (fld !== 'min_income' && fld !== 'min_team') no('badField', { field: fld }, 'unknown field ' + fld);
    const empty = o.value == null || String(o.value).trim() === '';
    const v = empty ? null : (fld === 'min_team' ? numIn(o.value, 0, 64, true, 'badMinTeam') : numIn(o.value, 0, 1000, false, 'badMinIncome'));
    if (v === r[fld] && (v !== null || !r.f[fld])) return { t };
    Object.assign(ch, { was: r[fld], now: v });
    const txt = fld === 'min_team' ? String(v) : (v === 0 ? '0' : fmtDec(v));
    if (r.f[fld] && v !== null) return { t: splice(t, r.f[fld].a, r.f[fld].b, txt), ch };
    if (r.f[fld]) {   // take the key out: from the key to the next key (or from the comma before it when it is the last)
      const i = r.keys.indexOf(fld), nx = r.keys[i + 1];
      if (nx) return { t: splice(t, r.f[fld].key, r.f[nx].key, ''), ch };
      const pv = r.f[r.keys[i - 1]]; return { t: splice(t, pv.b, r.f[fld].b, ''), ch };
    }
    // add the key before class (stock order priority, min_income, min_team, class, unit); min_income goes before an existing min_team
    const before = fld === 'min_income' && r.f.min_team ? r.f.min_team : r.f.class;
    return { t: splice(t, before.key, before.key, fld + ' = ' + txt + ', '), ch };
  },
  rowAdd(t, o, opt) {
    const R = parse(t), S = stageOf(R, o.stage), A = armyOf(S, o.stage, o.army);
    checkUnitFor(opt, o.army, o.unit);
    if (!R.unitClass.includes(o.cls)) no('badClass', { v: o.cls }, 'unknown unit class ' + o.cls);
    if (A.rows.some(r => r.unit === o.unit)) no('dupRow', { stage: o.stage, army: o.army, unit: o.unit }, `${o.unit} is already in stage ${o.stage} ${o.army}; raise its priority instead`);
    const p = { unit: o.unit, cls: o.cls, priority: numIn(o.priority == null || o.priority === '' ? 1 : o.priority, 0.01, 100000, false, 'badPriority') };
    if (o.min_income != null && String(o.min_income).trim() !== '') p.min_income = numIn(o.min_income, 0, 1000, false, 'badMinIncome');
    if (o.min_team != null && String(o.min_team).trim() !== '') p.min_team = numIn(o.min_team, 0, 64, true, 'badMinTeam');
    const row = rowText(p), E = R.eol, ch = { k: 'rowAdd', stage: Number(o.stage), army: o.army, unit: o.unit, cls: o.cls, priority: p.priority };
    if (!A.rows.length) {
      const e = eolAt(t, A.o);
      if (A.c <= e || !isWs(R.code.slice(A.o + 1, e))) no('oddLine', { stage: o.stage, army: o.army, unit: '' }, 'the list braces share a line; edit by hand');
      return { t: splice(t, e, e, E + A.kindent + (A.kindent.includes('\t') ? '\t' : '    ') + row), ch };
    }
    A.rows.forEach(r => needOwn(r, o.stage, o.army));
    const after = o.after == null || o.after === '' ? A.rows.length - 1 : Number(o.after);
    if (after === -1) { const r0 = A.rows[0]; return { t: splice(t, r0.ls, r0.ls, r0.indent + row + ',' + E), ch }; }
    const r = rowOf(A, o.stage, after), last = after === A.rows.length - 1;
    let u = splice(t, r.eol, r.eol, E + r.indent + row + (!last || r.comma >= 0 ? ',' : ''));
    if (last && r.comma < 0) u = splice(u, r.c + 1, r.c + 1, ',');
    return { t: u, ch };
  },
  rowDel(t, o) {
    const R = parse(t), S = stageOf(R, o.stage), A = armyOf(S, o.stage, o.army), r = rowOf(A, o.stage, o.row), i = Number(o.row);
    needOwn(r, o.stage, o.army);
    if (A.rows.length === 1 && S.repeat === 0) no('lastRowForever', { stage: o.stage, army: o.army, unit: r.unit }, `stage ${o.stage} repeats forever: with no row the ${o.army} bot never buys again`);
    const end = r.eol < t.length ? t.indexOf('\n', r.eol) + 1 : t.length;
    let u = splice(t, r.ls, end, '');
    const last = i === A.rows.length - 1;
    if (last && r.comma < 0 && i > 0) { const pr = A.rows[i - 1]; if (pr.comma >= 0) u = splice(u, pr.comma, pr.comma + 1, ''); }
    return { t: u, ch: { k: 'rowDel', stage: Number(o.stage), army: o.army, unit: r.unit } };
  },
  rowMove(t, o) {
    const R = parse(t), S = stageOf(R, o.stage), A = armyOf(S, o.stage, o.army), i = Number(o.row), j = i + (Number(o.dir) < 0 ? -1 : 1);
    const a = rowOf(A, o.stage, i); if (!A.rows[j]) no('noMove', { stage: o.stage, army: o.army, unit: a.unit }, 'the row is already at the end');
    const b = A.rows[j], [x, y] = i < j ? [a, b] : [b, a];
    const tx = t.slice(x.o, x.c + 1), ty = t.slice(y.o, y.c + 1);
    return { t: splice(splice(t, y.o, y.c + 1, tx), x.o, x.c + 1, ty), ch: { k: 'rowMove', stage: Number(o.stage), army: o.army, unit: a.unit, from: i + 1, to: j + 1 } };
  },
  stageAdd(t, o) {
    const R = parse(t), n = Number(o.after), S = stageOf(R, n);
    if (R.stages.length >= MAX_STAGES) no('tooManyStages', { max: MAX_STAGES }, 'at most ' + MAX_STAGES + ' stages');
    const copy = t.slice(S.o, S.c + 1), E = R.eol;
    const u = S.comma >= 0 ? splice(t, S.comma + 1, S.comma + 1, E + S.indent + copy + ',') : splice(t, S.c + 1, S.c + 1, ',' + E + S.indent + copy);
    return { t: renumber(u), ch: { k: 'stageAdd', stage: n + 1, from: n } };
  },
  stageDel(t, o) {
    const R = parse(t), n = Number(o.stage), S = stageOf(R, n);
    if (R.stages.length === 1) no('onlyStage', {}, 'the only stage cannot go: the bot would never buy');
    let u;
    if (S.comma >= 0) {
      const a = S.own ? S.ls : S.o, e = eolAt(t, S.comma);
      const b = isWs(R.code.slice(S.comma + 1, e)) && S.own ? (e < t.length ? t.indexOf('\n', e) + 1 : t.length) : S.comma + 1;
      u = splice(t, a, b, '');
    } else {
      const P = R.stages[n - 2]; if (P.comma < 0) no('oddStage', { stage: n, why: 'comma' }, 'no comma between stages');
      u = splice(t, P.comma, S.c + 1, '');
    }
    return { t: renumber(u), ch: { k: 'stageDel', stage: n } };
  },
  // the rows of army `from` in stage `stage` become the list of army `to` in stage `toStage` (default the same stage). A unit with no card
  // in `to` is renamed when its squad card name(from) has a name(to) twin, else left out (listed)
  armyCopy(t, o, opt) {
    const R = parse(t), n = Number(o.stage), m = Number(o.toStage || o.stage), S = stageOf(R, n), T = stageOf(R, m), A = armyOf(S, n, o.from);
    if (o.from === o.to && n === m) no('copySame', {}, 'pick another army or stage');
    if (!opt.cards) no('noCards', { unit: '', army: o.to }, 'the buy cards could not be read (set the game folder)');
    const kept = [], skipped = [], renamed = [];
    for (const r of A.rows) {
      if (r.odd) { skipped.push(r.unit); continue; }
      let u = r.unit;
      if (!hasCard(opt.cards, o.to, u)) {
        const sm = /^(.+)\((\w+)\)$/.exec(u), tw = sm && sm[2] === o.from ? sm[1] + '(' + o.to + ')' : null;
        if (tw && hasCard(opt.cards, o.to, tw)) { renamed.push(u + ' -> ' + tw); u = tw; } else { skipped.push(u); continue; }
      }
      const rt = t.slice(r.o, r.c + 1);
      kept.push(u === r.unit ? rt : rt.slice(0, r.f.unit.a - r.o) + '"' + u + '"' + rt.slice(r.f.unit.b - r.o));
    }
    if (!kept.length) no('copyNone', { from: o.from, to: o.to, stage: n }, `none of the ${o.from} units of stage ${n} has a buy card in ${o.to}`);
    const E = R.eol, ch = { k: 'armyCopy', stage: n, toStage: m, from: o.from, to: o.to, n: kept.length, skipped, renamed };
    const B = T.armies.find(x => x.name === o.to);
    if (B) {
      const e = eolAt(t, B.o), cls = lineStart(t, B.c);
      if (!isWs(R.code.slice(B.o + 1, e)) || !isWs(t.slice(cls, B.c)) || cls <= e) no('oddLine', { stage: m, army: o.to, unit: '' }, 'the target list is not one row per line; edit by hand');
      const ind = (B.rows[0] && B.rows[0].indent) || (A.rows[0] && A.rows[0].indent) || B.kindent + '\t';
      return { t: splice(t, e, cls, E + kept.map(x => ind + x).join(',' + E) + E), ch };
    }
    // no list for that army in that stage yet (MIS-09: it buys nothing there): a new ["to"] list after the last one
    const L = T.armies[T.armies.length - 1]; if (!L) no('oddStage', { stage: m, why: 'units' }, 'stage has no army list to follow');
    const lab = (R.armies.find(x => x.id === o.to) || {}).label, ind = (A.rows[0] && A.rows[0].indent) || L.kindent + '\t';
    const block = L.kindent + '["' + o.to + '"] = {' + (lab ? '--' + lab : '') + E + kept.map(x => ind + x).join(',' + E) + E + L.kindent + '}';
    ch.added = true;
    return { t: L.comma >= 0 ? splice(t, L.comma + 1, L.comma + 1, E + block + ',') : splice(t, L.c + 1, L.c + 1, ',' + E + block), ch };
  },
  flag(t, o) {
    const R = parse(t), F = R.globals.FlagPriority;
    if (!FLAGS.includes(o.which)) no('badField', { field: o.which }, 'unknown flag kind ' + o.which);
    if (!F || !F[o.which] || !NUM.test(F[o.which].v)) no('noSetting', { key: 'FlagPriority.' + o.which }, 'FlagPriority.' + o.which + ' not found as a plain number');
    const v = numIn(o.value, 0, 1000, false, 'badFlag'), was = Number(F[o.which].v);
    if (v === was) return { t };
    return { t: splice(t, F[o.which].a, F[o.which].b, String(v)), ch: { k: 'flag', which: o.which, was, now: v } };
  },
  // minutes; written in the file's own form: `M * 60 * 1000` (stock), or plain ms when the file has a plain number. A stock "-- 3min (ms)"
  // note on that line follows the number
  rotation(t, o) {
    const R = parse(t), g = R.globals.OrderRotationPeriod;
    if (!g || g.ms === null) no('noSetting', { key: 'OrderRotationPeriod' }, 'OrderRotationPeriod not found as a plain number');
    const s = String(o.minutes == null ? '' : o.minutes).trim();
    if (!/^\d+(?:\.\d{1,2})?$/.test(s) || Number(s) < 0.25 || Number(s) > 120) no('badRotation', { v: s, lo: 0.25, hi: 120 }, 'minutes from 0.25 to 120 (two decimals at most)');
    const mins = Number(s), ms = Math.round(mins * 60000), was = g.ms / 60000;
    if (ms === g.ms) return { t };
    const txt = /^\d+$/.test(g.v.trim()) ? String(ms) : String(mins) + ' * 60 * 1000';
    let u = t;
    if (g.comment) { const cm = /^(--\s*)(\d+(?:\.\d+)?)(\s*min\b.*)$/.exec(g.comment.v); if (cm) u = splice(u, g.comment.a + cm[1].length, g.comment.a + cm[1].length + cm[2].length, String(mins)); }
    u = splice(u, g.a, g.b, txt);
    return { t: u, ch: { k: 'rotation', was, now: mins } };
  },
  squad(t, o) {
    const R = parse(t), g = R.globals.MaxSquadSize;
    if (!g || !/^\d+$/.test(g.v)) no('noSetting', { key: 'MaxSquadSize' }, 'MaxSquadSize not found as a whole number');
    const v = numIn(o.value, 0, 100, true, 'badSquad'), was = Number(g.v);
    if (v === was) return { t };
    return { t: splice(t, g.a, g.b, String(v)), ch: { k: 'squad', was, now: v } };
  },
};

// warnings on a finished text: what stock bot.lua will do that a modder may not mean
function warnings(text) {
  const R = parse(text), out = [], ids = R.armies.map(a => a.id);
  R.stages.forEach((S, i) => {
    if (S.repeat === 0 && i < R.stages.length - 1) out.push({ code: 'foreverNotLast', stage: i + 1, next: i + 2 });
    for (const a of ids) { const A = S.armies.find(x => x.name === a); if (!A) out.push({ code: 'armyMissing', stage: i + 1, army: a }); else if (!A.rows.length) out.push({ code: 'emptyList', stage: i + 1, army: a }); }
  });
  const L = R.stages[R.stages.length - 1]; if (L && L.repeat !== 0) out.push({ code: 'lastNotForever', stage: R.stages.length });
  const F = R.globals.FlagPriority; if (F && FLAGS.every(k => F[k] && Number(F[k].v) === 0)) out.push({ code: 'flagsZero' });
  return out;
}

// line diff (common head and tail cut, LCS in between), hunks with 2 lines of context; [{t:' '|'-'|'+'|'@', n, s}]
function diff(a, b, max) {
  const A = a.split('\n').map(x => x.replace(/\r$/, '')), B = b.split('\n').map(x => x.replace(/\r$/, ''));
  let h = 0; while (h < A.length && h < B.length && A[h] === B[h]) h++;
  let ta = A.length, tb = B.length; while (ta > h && tb > h && A[ta - 1] === B[tb - 1]) { ta--; tb--; }
  const x = A.slice(h, ta), y = B.slice(h, tb), ops = [];
  if (x.length * y.length <= 4e6) {
    const L = Array.from({ length: x.length + 1 }, () => new Uint16Array(y.length + 1));
    for (let i = x.length - 1; i >= 0; i--) for (let j = y.length - 1; j >= 0; j--) L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    let i = 0, j = 0;
    while (i < x.length || j < y.length) {
      if (i < x.length && j < y.length && x[i] === y[j]) { ops.push([' ', h + i, x[i]]); i++; j++; }
      else if (i < x.length && (j >= y.length || L[i + 1][j] >= L[i][j + 1])) { ops.push(['-', h + i, x[i]]); i++; }
      else { ops.push(['+', h + j, y[j]]); j++; }
    }
  } else { x.forEach((s, i) => ops.push(['-', h + i, s])); y.forEach((s, j) => ops.push(['+', h + j, s])); }
  const all = A.slice(Math.max(0, h - 2), h).map((s, k) => [' ', Math.max(0, h - 2) + k, s]).concat(ops, A.slice(ta, ta + 2).map((s, k) => [' ', tb + k, s]));
  const out = []; let lastShown = -9;
  all.forEach((op, k) => {
    const near = all.slice(Math.max(0, k - 2), k + 3).some(z => z[0] !== ' ');
    if (!near) return;
    if (k !== lastShown + 1) out.push({ t: '@', n: op[1] + 1, s: '' });
    out.push({ t: op[0], n: op[1] + 1, s: op[2] }); lastShown = k;
  });
  return max && out.length > max ? out.slice(0, max).concat([{ t: '@', n: 0, s: '... ' + (out.length - max) + ' more lines' }]) : out;
}

// run the ops; throws Refuse (with .at = the op index). opt: {cards, vanilla (stock text for the shape check)}
function apply(text, ops, opt) {
  opt = opt || {};
  const R0 = parse(text);
  if (R0.odd) no('oddFile', { why: R0.odd }, 'this bot.data.lua has a form this editor does not read (' + R0.odd + '); edit it by hand');
  let t = text; const changes = [];
  (ops || []).forEach((o, i) => {
    const f = o && OPS[o.op];
    try {
      if (!f) no('badOp', { op: o && o.op }, 'unknown edit ' + (o && o.op));
      const r = f(t, o, opt); t = r.t; if (r.ch) changes.push(r.ch);
    } catch (e) { if (e instanceof Refuse) e.at = i; throw e; }
  });
  if (t !== text) check(text, t, opt.vanilla);
  return { text: t, changes, warnings: warnings(t) };
}
// the new text must read as data (luatable) and add no shape error of botcheck over the old one
function check(before, after, vanilla) {
  const { parse: lp } = require('../../../../../botrecipe/luatable'), bc = require('../../../../../botrecipe/botcheck');
  try { lp(after); } catch (e) { no('notData', { m: e.message }, 'the edited file does not read as Lua data: ' + e.message); }
  const R = parse(after); if (R.odd) no('oddFile', { why: R.odd }, 'the edited file lost its stage shape (' + R.odd + ')');
  const ref = vanilla || before, cnt = f => f.filter(x => x.sev === 'error' || x.code === 'BOT_STAGE_SHAPE').reduce((m, x) => (m[x.code] = (m[x.code] || 0) + 1, m), {});
  const a = cnt(bc.check(before, ref)), bl = bc.check(after, ref), b = cnt(bl);
  const worse = Object.keys(b).filter(k => b[k] > (a[k] || 0));
  if (worse.length) no('shape', { m: bl.filter(x => worse.includes(x.code)).slice(0, 3).map(x => x.msg).join('; ') }, 'the edit would give a shape stock bot.lua misreads: ' + worse.join(', '));
}

module.exports = { parse, model, apply, warnings, diff, blank, msOf, rowText, Refuse, FLAGS };

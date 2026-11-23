// luatable: read a Lua data file made of `Name = <expr>` statements (bot.data.lua) into plain JS, with line numbers.
// Subset: tables ({a = 1, [ "k" ] = v, v, ...; trailing , or ;), strings ("..", '..', escapes), numbers, true/false/nil,
// dotted names (UnitClass.Tank -> {ref:'UnitClass.Tank'}), unary minus, + - * / on numbers (3 * 60 * 1000 = 180000),
// comments -- and --[[ ]] / --[==[ ]==]. Anything else (function, local, calls, ..) throws LUA_UNSUPPORTED with the line:
// the reader refuses rather than guesses, so a file it reads is a pure data file the engine's Lua reads the same way.
// `A.b.c = v` sets a field of a table global made earlier; `A = A or v` (statement level, same name) keeps an earlier A, else v. Duplicate table keys: last wins (Lua), listed in dupes.
// `A["k"].b = v` (string or number key in brackets) sets a field the same way. parse(text, seed?) -> seed = {Name: value} made before the file.
// parse(text) -> { globals: {Name: value}, lines: {Name: line}, dupes: [{key, line, first}] }. Table value = { $t: 'table', hash: {k: v}, arr: [v], line, keyLine: {k: line} }.
// Author: Imperator_Aug (ARSENAL, ia-b2f19051)
'use strict';
function lex(s) {
  const T = []; let i = 0, line = 1;
  const err = m => { const e = new Error(`LUA_PARSE line ${line}: ${m}`); e.line = line; throw e; };
  while (i < s.length) {
    const c = s[i];
    if (c === '\n') { line++; i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if (s.startsWith('--', i)) {
      const lb = /^--\[(=*)\[/.exec(s.slice(i, i + 64));
      if (lb) { const end = s.indexOf(']' + lb[1] + ']', i); if (end < 0) err('unclosed long comment'); for (let k = i; k < end; k++) if (s[k] === '\n') line++; i = end + lb[1].length + 2; continue; }
      while (i < s.length && s[i] !== '\n') i++; continue;
    }
    if (c === '"' || c === "'") {
      let v = '', j = i + 1;
      for (; j < s.length && s[j] !== c; j++) {
        if (s[j] === '\n') err('newline in string');
        if (s[j] === '\\') { j++; const e = s[j]; v += e === 'n' ? '\n' : e === 't' ? '\t' : e === 'r' ? '\r' : e; } else v += s[j];
      }
      if (j >= s.length) err('unclosed string');
      T.push({ k: 'str', v, line }); i = j + 1; continue;
    }
    const num = /^(0x[0-9a-fA-F]+|\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)/.exec(s.slice(i, i + 64));
    if (num) { T.push({ k: 'num', v: Number(num[1]), line }); i += num[1].length; continue; }
    const id = /^[A-Za-z_]\w*/.exec(s.slice(i, i + 256));
    if (id) { T.push({ k: 'id', v: id[0], line }); i += id[0].length; continue; }
    if ('{}[]=,;.+-*/()'.includes(c)) { T.push({ k: c, line }); i++; continue; }
    err(`unexpected character ${JSON.stringify(c)}`);
  }
  T.push({ k: 'eof', line });
  return T;
}
const KW = new Set(['and', 'break', 'do', 'else', 'elseif', 'end', 'false', 'for', 'function', 'if', 'in', 'local', 'nil', 'not', 'or', 'repeat', 'return', 'then', 'true', 'until', 'while']);
function parse(text, seed) {
  const T = lex(String(text)); let p = 0; const dupes = [];
  const peek = () => T[p], next = () => T[p++];
  const err = (m, t = peek()) => { const e = new Error(`LUA_PARSE line ${t.line}: ${m}`); e.line = t.line; throw e; };
  const uns = (t) => { const e = new Error(`LUA_UNSUPPORTED line ${t.line}: "${t.v || t.k}" (only data statements Name = value are read)`); e.line = t.line; throw e; };
  const want = k => { const t = next(); if (t.k !== k) err(`expected ${k}, got ${t.v || t.k}`, t); return t; };
  function primary() {
    const t = next();
    if (t.k === 'num' || t.k === 'str') return t.v;
    if (t.k === '-') { const v = primary(); if (typeof v !== 'number') err('unary minus on a non-number', t); return -v; }
    if (t.k === '(') { const v = expr(); want(')'); return v; }
    if (t.k === '{') return table(t);
    if (t.k === 'id') {
      if (t.v === 'true') return true; if (t.v === 'false') return false; if (t.v === 'nil') return null;
      if (KW.has(t.v)) uns(t);
      let r = t.v;
      while (peek().k === '.') { next(); const n = want('id'); r += '.' + n.v; }
      if (peek().k === '(' || peek().k === 'str' || peek().k === '{' || peek().k === ':') uns(peek());   // a call: f(x), f"x", f{x}
      return { ref: r, line: t.line };
    }
    err(`unexpected ${t.v || t.k}`, t);
  }
  function term() { let v = primary(); while (peek().k === '*' || peek().k === '/') { const o = next(); const w = primary(); if (typeof v !== 'number' || typeof w !== 'number') err('arithmetic on a non-number', o); v = o.k === '*' ? v * w : v / w; } return v; }
  function expr() { let v = term(); while (peek().k === '+' || peek().k === '-') { const o = next(); const w = term(); if (typeof v !== 'number' || typeof w !== 'number') err('arithmetic on a non-number', o); v = o.k === '+' ? v + w : v - w; } return v; }
  function table(open) {
    const tb = { $t: 'table', hash: {}, arr: [], line: open.line, keyLine: {} };
    // duplicate key: legal Lua, the last one wins (as here); kept in dupes for the checker to warn
    const put = (k, v, line) => { if (Object.prototype.hasOwnProperty.call(tb.hash, k)) dupes.push({ key: k, line, first: tb.keyLine[k] }); tb.hash[k] = v; tb.keyLine[k] = line; };
    while (peek().k !== '}') {
      const t = peek();
      if (t.k === '[') { next(); const k = expr(); want(']'); want('='); put(typeof k === 'object' && k ? k.ref : k, expr(), t.line); }
      else if (t.k === 'id' && T[p + 1].k === '=' && !KW.has(t.v)) { next(); next(); put(t.v, expr(), t.line); }
      else { const v = expr(); if (v && typeof v === 'object' && !v.line) v.line = t.line; tb.arr.push(v); }
      if (peek().k === ',' || peek().k === ';') next(); else if (peek().k !== '}') err(`expected , or } got ${peek().v || peek().k}`);
    }
    want('}');
    return tb;
  }
  // seed: globals another file made first (GoH units/<army>/*.lua set Purchases["early.ger"] on the Purchases = {} of modes/utility.lua)
  const globals = Object.assign({}, seed || {}), lines = {};
  while (peek().k !== 'eof') {
    const t = next();
    if (t.k === ';') continue;
    if (t.k !== 'id' || KW.has(t.v)) uns(t);
    const path = [t.v];   // Name.field.sub = v: field set on a table global made earlier (godny BotConfig.X = ...); Name["key"] = v the same
    for (;;) {
      if (peek().k === '.') { next(); path.push(want('id').v); continue; }
      if (peek().k === '[') { next(); const k = next(); if (k.k !== 'str' && k.k !== 'num') uns(k); want(']'); path.push(k.v); continue; }
      break;
    }
    if (peek().k !== '=') uns(t);
    next(); let v = expr();
    // `Name = Name or <value>` (GoH modes/conquest/runtime_config.lua: ConquestConfig = ConquestConfig or {}): the global made earlier, else
    // the value. Only this one form of `or` at statement level; any other use of `or` stays LUA_UNSUPPORTED.
    if (peek().k === 'id' && peek().v === 'or') {
      const o = next();
      if (path.length !== 1 || !v || typeof v !== 'object' || v.ref !== t.v) uns(o);
      const w = expr(); v = globals[t.v] !== undefined ? globals[t.v] : w;
    }
    if (path.length === 1) { globals[t.v] = v; lines[t.v] = t.line; continue; }
    let tb = globals[path[0]];
    for (const k of path.slice(1, -1)) tb = tb && tb.$t === 'table' ? tb.hash[k] : undefined;
    if (!tb || tb.$t !== 'table') err(`${path.slice(0, -1).join('.')} is not a table here`, t);
    const k = path[path.length - 1]; if (Object.prototype.hasOwnProperty.call(tb.hash, k)) dupes.push({ key: path.join('.'), line: t.line, first: tb.keyLine[k] });
    tb.hash[k] = v; tb.keyLine[k] = t.line;
  }
  return { globals, lines, dupes };
}
module.exports = { parse, lex };

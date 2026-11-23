// luamini: a Lua 5.2 parser (the whole grammar, for a syntax check) and a small tree-walking interpreter (enough of the language and the
// standard library to run the bot habits Lua and a stock-shaped bot.lua against a fake BotApi in a test). Node only, no runtime vendored.
//   parse(text, name?) -> AST; throws Error 'name:line: message' on a syntax error (5.2 rules: return last in its block, break inside a
//     loop, '...' only in a vararg function, goto/labels parsed)
//   check(text, name?) -> null | {line, msg}   the same, as a value
//   run(text, opt) -> {G, call(fn, ...args) -> [results], get(name), table(jsValue) -> Lua table, js(luaValue) -> plain JS}
//     opt: {name, globals: {name: value}, require(path) -> text | null, print(line), random() -> [0,1), env: {VAR: value},
//           files: Map path -> text (io.open reads and writes here), clock() -> seconds}
// Not in the interpreter (throws 'not supported in the test interpreter'): goto, coroutines, string patterns beyond the common classes.
// Values: nil = undefined, numbers = JS numbers (Lua 5.2 numbers are doubles), strings = JS strings, tables = LuaTable, functions = JS
// functions (args array) -> results array.
// Author: Imperator_Aug (ARSENAL, ia-aa1de318)
'use strict';

const KEYWORDS = new Set(['and', 'break', 'do', 'else', 'elseif', 'end', 'false', 'for', 'function', 'goto', 'if', 'in', 'local', 'nil', 'not', 'or', 'repeat', 'return', 'then', 'true', 'until', 'while']);

// ---------------- lexer ----------------
function lex(src, name) {
  const s = String(src), n = s.length, T = [];
  let i = 0, line = 1;
  const fail = m => { const e = new Error(name + ':' + line + ': ' + m); e.line = line; e.lua = true; throw e; };
  const longLevel = p => { if (s[p] !== '[') return -1; let q = p + 1; while (s[q] === '=') q++; return s[q] === '[' ? q - p - 1 : -1; };
  function readLong(p, lvl, what) {
    const close = ']' + '='.repeat(lvl) + ']';
    let start = p + lvl + 2;
    const e = s.indexOf(close, start);
    if (e < 0) fail('unfinished long ' + what);
    // a newline right after the opening bracket is skipped
    if (s[start] === '\r' && s[start + 1] === '\n') start += 2; else if (s[start] === '\n' || s[start] === '\r') start++;
    const body = s.slice(start, e);
    for (let k = p; k < e; k++) if (s[k] === '\n') line++;
    i = e + close.length;
    return body;
  }
  while (i < n) {
    const c = s[i];
    if (c === '\n') { line++; i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r' || c === '\f' || c === '\v') { i++; continue; }
    if (c === '-' && s[i + 1] === '-') {
      const lvl = longLevel(i + 2);
      if (lvl >= 0) { readLong(i + 2, lvl, 'comment'); continue; }
      while (i < n && s[i] !== '\n') i++;
      continue;
    }
    const at = line;
    if (/[A-Za-z_]/.test(c)) {
      let j = i + 1; while (j < n && /[A-Za-z0-9_]/.test(s[j])) j++;
      const w = s.slice(i, j); i = j;
      T.push(KEYWORDS.has(w) ? { t: w, line: at } : { t: 'name', v: w, line: at });
      continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(s[i + 1] || ''))) {
      let m;
      if ((m = /^0[xX]([0-9a-fA-F]*)(\.[0-9a-fA-F]*)?([pP][+-]?[0-9]+)?/.exec(s.slice(i, i + 80))) && (m[1] || (m[2] && m[2].length > 1))) {
        let v = parseInt(m[1] || '0', 16);
        if (m[2]) for (let k = 1; k < m[2].length; k++) v += parseInt(m[2][k], 16) / Math.pow(16, k);
        if (m[3]) v *= Math.pow(2, Number(m[3].slice(1)));
        i += m[0].length;
        if (/[A-Za-z0-9_.]/.test(s[i] || '')) fail('malformed number near ' + s.slice(i - m[0].length, i + 1));
        T.push({ t: 'number', v, line: at }); continue;
      }
      m = /^([0-9]*\.?[0-9]*)([eE][+-]?[0-9]+)?/.exec(s.slice(i, i + 80));
      if (!m || m[1] === '.' || m[1] === '') fail('malformed number');
      i += m[0].length;
      if (/[A-Za-z0-9_.]/.test(s[i] || '')) fail('malformed number near ' + s.slice(i - m[0].length, i + 1));
      T.push({ t: 'number', v: Number(m[0]), line: at }); continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1, out = '';
      for (;;) {
        if (j >= n || s[j] === '\n' || s[j] === '\r') fail('unfinished string');
        const d = s[j];
        if (d === c) { j++; break; }
        if (d === '\\') {
          const e = s[j + 1];
          const simple = { n: '\n', t: '\t', r: '\r', a: '\x07', b: '\b', f: '\f', v: '\v', '\\': '\\', '"': '"', "'": "'" };
          if (e in simple) { out += simple[e]; j += 2; continue; }
          if (e === '\n') { out += '\n'; line++; j += 2; continue; }
          if (e === '\r') { out += '\n'; line++; j += (s[j + 2] === '\n' ? 3 : 2); continue; }
          if (e === 'x') { const hx = /^[0-9a-fA-F]{2}/.exec(s.slice(j + 2, j + 4)); if (!hx) fail('hexadecimal digit expected'); out += String.fromCharCode(parseInt(hx[0], 16)); j += 4; continue; }
          if (e === 'z') { j += 2; while (j < n && /\s/.test(s[j])) { if (s[j] === '\n') line++; j++; } continue; }
          const dg = /^[0-9]{1,3}/.exec(s.slice(j + 1, j + 4));
          if (dg) { const v = Number(dg[0]); if (v > 255) fail('decimal escape too large'); out += String.fromCharCode(v); j += 1 + dg[0].length; continue; }
          fail('invalid escape sequence \\' + e);
        }
        out += d; j++;
      }
      i = j; T.push({ t: 'string', v: out, line: at }); continue;
    }
    if (c === '[') {
      const lvl = longLevel(i);
      if (lvl >= 0) { const body = readLong(i, lvl, 'string'); T.push({ t: 'string', v: body, line: at }); continue; }
    }
    const three = s.slice(i, i + 3), two = s.slice(i, i + 2);
    if (three === '...') { T.push({ t: '...', line: at }); i += 3; continue; }
    if (['==', '~=', '<=', '>=', '..', '::'].includes(two)) { T.push({ t: two, line: at }); i += 2; continue; }
    if ('+-*/%^#<>=(){}[];:,.'.includes(c)) { T.push({ t: c, line: at }); i++; continue; }
    fail('unexpected symbol near ' + JSON.stringify(c));
  }
  T.push({ t: '<eof>', line });
  return T;
}

// ---------------- parser ----------------
const BINPRI = { or: [1, 1], and: [2, 2], '<': [3, 3], '>': [3, 3], '<=': [3, 3], '>=': [3, 3], '~=': [3, 3], '==': [3, 3], '..': [5, 4], '+': [6, 6], '-': [6, 6], '*': [7, 7], '/': [7, 7], '%': [7, 7], '^': [10, 9] };
const UNARY_PRI = 8;

function parse(src, name) {
  name = name || 'chunk';
  const T = lex(src, name);
  let p = 0;
  const peek = () => T[p], next = () => T[p++];
  const fail = (m, tok) => { const t = tok || T[p]; const e = new Error(name + ':' + t.line + ': ' + m + ' near ' + (t.t === 'name' ? t.v : t.t === 'string' ? JSON.stringify(t.v) : t.t === 'number' ? String(t.v) : "'" + t.t + "'")); e.line = t.line; e.lua = true; throw e; };
  const check = t => { if (T[p].t !== t) fail("'" + t + "' expected"); };
  const expect = t => { check(t); return next(); };
  const accept = t => { if (T[p].t === t) { p++; return true; } return false; };
  const fs = [];   // function states: {vararg, loops}
  const blockEnd = t => t === 'return' || t === 'end' || t === 'else' || t === 'elseif' || t === 'until' || t === '<eof>';

  function block() {
    const body = [], line = peek().line;
    for (;;) {
      const t = peek().t;
      if (t === 'return') {
        const r = next(), vals = (blockEnd(peek().t) || peek().t === ';') ? [] : explist();
        accept(';');
        if (!blockEnd(peek().t)) fail("'end' expected (return must be the last statement of its block)");
        body.push({ k: 'Return', vals, line: r.line });
        break;
      }
      if (blockEnd(t)) break;
      const st = statement();
      if (st) body.push(st);
    }
    return { k: 'Block', body, line };
  }
  function cur() { return fs[fs.length - 1]; }
  function statement() {
    const tok = peek(), line = tok.line;
    switch (tok.t) {
      case ';': next(); return null;
      case '::': { next(); const nm = expect('name').v; expect('::'); return { k: 'Label', name: nm, line }; }
      case 'break': next(); if (!cur().loops) fail('<break> not inside a loop', tok); return { k: 'Break', line };
      case 'goto': { next(); const nm = expect('name').v; return { k: 'Goto', name: nm, line }; }
      case 'do': { next(); const b = block(); expect('end'); return { k: 'Do', body: b, line }; }
      case 'while': { next(); const cond = expr(); expect('do'); cur().loops++; const b = block(); cur().loops--; expect('end'); return { k: 'While', cond, body: b, line }; }
      case 'repeat': { next(); cur().loops++; const b = block(); cur().loops--; expect('until'); const cond = expr(); return { k: 'Repeat', cond, body: b, line }; }
      case 'if': {
        next(); const clauses = []; let cond = expr(); expect('then'); clauses.push({ cond, body: block() });
        let els = null;
        for (;;) {
          if (accept('elseif')) { cond = expr(); expect('then'); clauses.push({ cond, body: block() }); continue; }
          if (accept('else')) { els = block(); }
          break;
        }
        expect('end'); return { k: 'If', clauses, els, line };
      }
      case 'for': {
        next(); const n1 = expect('name').v;
        if (accept('=')) {
          const a = expr(); expect(','); const b = expr(); const c = accept(',') ? expr() : null;
          expect('do'); cur().loops++; const body = block(); cur().loops--; expect('end');
          return { k: 'NumFor', name: n1, a, b, c, body, line };
        }
        const names = [n1]; while (accept(',')) names.push(expect('name').v);
        expect('in'); const exps = explist(); expect('do'); cur().loops++; const body = block(); cur().loops--; expect('end');
        return { k: 'GenFor', names, exps, body, line };
      }
      case 'function': {
        next(); let target = { k: 'Name', name: expect('name').v, line }, method = false;
        while (peek().t === '.' || peek().t === ':') {
          const sep = next().t, key = expect('name').v;
          target = { k: 'Index', obj: target, key: { k: 'Str', v: key }, line };
          if (sep === ':') { method = true; break; }
        }
        const f = funcbody(method, line);
        return { k: 'Assign', targets: [target], vals: [f], line };
      }
      case 'local': {
        next();
        if (accept('function')) { const nm = expect('name').v; const f = funcbody(false, line); return { k: 'LocalFunction', name: nm, f, line }; }
        const names = [expect('name').v]; while (accept(',')) names.push(expect('name').v);
        const vals = accept('=') ? explist() : [];
        return { k: 'Local', names, vals, line };
      }
      default: {
        const e = suffixed();
        if (peek().t === '=' || peek().t === ',') {
          const targets = [e];
          while (accept(',')) targets.push(suffixed());
          for (const t of targets) if (t.k !== 'Name' && t.k !== 'Index') fail('syntax error (cannot assign to this)');
          expect('='); const vals = explist();
          return { k: 'Assign', targets, vals, line };
        }
        if (e.k !== 'Call' && e.k !== 'Method') fail('syntax error');
        return { k: 'CallStat', call: e, line };
      }
    }
  }
  function funcbody(method, line) {
    expect('(');
    const params = method ? ['self'] : []; let vararg = false;
    if (peek().t !== ')') {
      for (;;) {
        if (accept('...')) { vararg = true; break; }
        params.push(expect('name').v);
        if (!accept(',')) break;
      }
    }
    expect(')');
    fs.push({ vararg, loops: 0 });
    const body = block();
    fs.pop();
    expect('end');
    return { k: 'Function', params, vararg, body, line };
  }
  function explist() { const l = [expr()]; while (accept(',')) l.push(expr()); return l; }
  function primary() {
    const t = peek();
    if (t.t === 'name') { next(); return { k: 'Name', name: t.v, line: t.line }; }
    if (t.t === '(') { next(); const e = expr(); expect(')'); return { k: 'Paren', e, line: t.line }; }
    fail('unexpected symbol');
  }
  function callargs() {
    const t = peek();
    if (t.t === 'string') { next(); return [{ k: 'Str', v: t.v }]; }
    if (t.t === '{') return [table()];
    expect('(');
    if (accept(')')) return [];
    const a = explist(); expect(')'); return a;
  }
  function suffixed() {
    let e = primary();
    for (;;) {
      const t = peek();
      if (t.t === '.') { next(); e = { k: 'Index', obj: e, key: { k: 'Str', v: expect('name').v }, line: t.line }; }
      else if (t.t === '[') { next(); const key = expr(); expect(']'); e = { k: 'Index', obj: e, key, line: t.line }; }
      else if (t.t === ':') { next(); const m = expect('name').v; e = { k: 'Method', obj: e, name: m, args: callargs(), line: t.line }; }
      else if (t.t === '(' || t.t === 'string' || t.t === '{') {
        if (t.t === '(' && t.line !== T[p - 1].line) { /* Lua 5.2 accepts a call across lines */ }
        e = { k: 'Call', f: e, args: callargs(), line: t.line };
      } else return e;
    }
  }
  function table() {
    const line = expect('{').line, items = [];
    while (peek().t !== '}') {
      if (peek().t === '[') { next(); const key = expr(); expect(']'); expect('='); items.push({ key, v: expr() }); }
      else if (peek().t === 'name' && T[p + 1].t === '=') { const key = { k: 'Str', v: next().v }; next(); items.push({ key, v: expr() }); }
      else items.push({ v: expr() });
      if (!accept(',') && !accept(';')) break;
    }
    expect('}');
    return { k: 'Table', items, line };
  }
  function simple() {
    const t = peek();
    switch (t.t) {
      case 'number': next(); return { k: 'Num', v: t.v };
      case 'string': next(); return { k: 'Str', v: t.v };
      case 'nil': next(); return { k: 'Nil' };
      case 'true': next(); return { k: 'True' };
      case 'false': next(); return { k: 'False' };
      case '...': next(); if (!cur().vararg) fail("cannot use '...' outside a vararg function"); return { k: 'Vararg', line: t.line };
      case '{': return table();
      case 'function': next(); return funcbody(false, t.line);
      default: return suffixed();
    }
  }
  function expr(limit) {
    limit = limit || 0;
    let left;
    const t = peek();
    if (t.t === 'not' || t.t === '-' || t.t === '#') { next(); left = { k: 'Unop', op: t.t, e: expr(UNARY_PRI), line: t.line }; }
    else left = simple();
    for (;;) {
      const op = peek().t, pr = BINPRI[op];
      if (!pr || pr[0] <= limit) break;
      const ot = next();
      const right = expr(pr[1]);
      left = { k: 'Binop', op, a: left, b: right, line: ot.line };
    }
    return left;
  }
  fs.push({ vararg: true, loops: 0 });
  const chunk = block();
  if (peek().t !== '<eof>') fail("'<eof>' expected");
  return chunk;
}
function check(text, name) {
  try { parse(text, name); return null; } catch (e) { if (!e.lua) throw e; return { line: e.line, msg: e.message }; }
}

// ---------------- interpreter ----------------
class LuaTable {
  constructor() { this.h = new Map(); this.mt = null; }
  get(k) { return this.h.get(normKey(k)); }
  set(k, v) { k = normKey(k); if (v === undefined) this.h.delete(k); else this.h.set(k, v); }
  len() { let n = 0; while (this.h.get(n + 1) !== undefined) n++; return n; }
}
const normKey = k => (typeof k === 'number' && Object.is(k, -0) ? 0 : k);
class LuaError extends Error { constructor(v, trace) { super(typeof v === 'string' ? v : 'error object'); this.value = v; this.trace = trace; } }
class Unsupported extends Error {}

function typeOf(v) {
  if (v === undefined || v === null) return 'nil';
  if (typeof v === 'boolean') return 'boolean';
  if (typeof v === 'number') return 'number';
  if (typeof v === 'string') return 'string';
  if (v instanceof LuaTable) return 'table';
  if (typeof v === 'function') return 'function';
  return 'userdata';
}
function fmtNum(n) {
  if (Number.isNaN(n)) return 'nan';
  if (n === Infinity) return 'inf';
  if (n === -Infinity) return '-inf';
  if (Number.isInteger(n) && Math.abs(n) < 1e15) return String(n);
  let s = n.toPrecision(14);
  if (s.includes('e')) { let [m, e] = s.split('e'); if (m.includes('.')) m = m.replace(/\.?0+$/, ''); const ex = Number(e); return m + 'e' + (ex < 0 ? '-' : '+') + String(Math.abs(ex)).padStart(2, '0'); }
  if (s.includes('.')) s = s.replace(/\.?0+$/, '');
  return s;
}
function tostr(v) {
  const t = typeOf(v);
  if (t === 'nil') return 'nil';
  if (t === 'boolean') return v ? 'true' : 'false';
  if (t === 'number') return fmtNum(v);
  if (t === 'string') return v;
  if (t === 'table') {
    const m = v.mt && v.mt.get('__tostring');
    if (m) return first(callv(m, [v]));
    if (!v.__id) v.__id = (++tostr.n).toString(16).padStart(8, '0');
    return 'table: 0x' + v.__id;
  }
  if (t === 'function') { if (!v.__id) v.__id = (++tostr.n).toString(16).padStart(8, '0'); return 'function: 0x' + v.__id; }
  return 'userdata';
}
tostr.n = 0;
function tonum(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const s = v.trim();
    if (/^-?0[xX][0-9a-fA-F]+$/.test(s)) return parseInt(s, 16);
    if (/^[-+]?([0-9]+\.?[0-9]*|\.[0-9]+)([eE][-+]?[0-9]+)?$/.test(s)) return Number(s);
  }
  return undefined;
}
const truthy = v => v !== undefined && v !== null && v !== false;
const first = a => (a && a.length ? a[0] : undefined);
function callv(f, args) {
  if (typeof f === 'function') return f(args) || [];
  if (f instanceof LuaTable && f.mt && f.mt.get('__call')) return callv(f.mt.get('__call'), [f].concat(args));
  throw new LuaError('attempt to call a ' + typeOf(f) + ' value');
}

function run(text, opt) {
  opt = opt || {};
  const name = opt.name || 'chunk';
  const G = new LuaTable();
  const strLib = new LuaTable(), strMeta = new LuaTable();
  strMeta.set('__index', strLib);
  const files = opt.files || new Map();
  let rnd = opt.random || Math.random;

  function index(o, k, line) {
    if (o instanceof LuaTable) {
      const v = o.get(k);
      if (v !== undefined) return v;
      const h = o.mt && o.mt.get('__index');
      if (h == null) return undefined;
      if (typeof h === 'function') return first(h([o, k]));
      return index(h, k, line);
    }
    if (typeof o === 'string') return strLib.get(k);
    throw new LuaError(where(line) + 'attempt to index a ' + typeOf(o) + ' value');
  }
  function setIndex(o, k, v, line) {
    if (!(o instanceof LuaTable)) throw new LuaError(where(line) + 'attempt to index a ' + typeOf(o) + ' value');
    if (k === undefined) throw new LuaError(where(line) + 'table index is nil');
    if (typeof k === 'number' && Number.isNaN(k)) throw new LuaError(where(line) + 'table index is NaN');
    const h = o.mt && o.mt.get('__newindex');
    if (h != null && o.get(k) === undefined) {
      if (typeof h === 'function') { h([o, k, v]); return; }
      setIndex(h, k, v, line); return;
    }
    o.set(k, v);
  }
  const where = line => name + ':' + (line || '?') + ': ';
  function arith(op, a, b, line) {
    const x = tonum(a), y = tonum(b);
    if (x === undefined || y === undefined) {
      const bad = x === undefined ? a : b;
      throw new LuaError(where(line) + 'attempt to perform arithmetic on a ' + typeOf(bad) + ' value');
    }
    switch (op) {
      case '+': return x + y;
      case '-': return x - y;
      case '*': return x * y;
      case '/': return x / y;
      case '%': return x - Math.floor(x / y) * y;
      case '^': return Math.pow(x, y);
    }
  }
  function compare(op, a, b, line) {
    if (typeof a === 'number' && typeof b === 'number' || typeof a === 'string' && typeof b === 'string') {
      switch (op) { case '<': return a < b; case '<=': return a <= b; case '>': return a > b; case '>=': return a >= b; }
    }
    throw new LuaError(where(line) + 'attempt to compare ' + typeOf(a) + ' with ' + typeOf(b));
  }
  function concat(a, b, line) {
    const ok = v => typeof v === 'string' || typeof v === 'number';
    if (!ok(a) || !ok(b)) throw new LuaError(where(line) + 'attempt to concatenate a ' + typeOf(ok(a) ? b : a) + ' value');
    return tostr(a) + tostr(b);
  }

  // scopes: {vars: Map, up}
  const lookup = (sc, nm) => { for (let s = sc; s; s = s.up) if (s.vars.has(nm)) return s; return null; };

  function evalExp(e, sc, va) {
    switch (e.k) {
      case 'Num': return e.v;
      case 'Str': return e.v;
      case 'Nil': return undefined;
      case 'True': return true;
      case 'False': return false;
      case 'Vararg': return va[0];
      case 'Name': { const s = lookup(sc, e.name); return s ? s.vars.get(e.name) : G.get(e.name); }
      case 'Paren': return evalExp(e.e, sc, va);
      case 'Index': return index(evalExp(e.obj, sc, va), evalExp(e.key, sc, va), e.line);
      case 'Call': case 'Method': return first(evalCall(e, sc, va));
      case 'Function': return makeFn(e, sc);
      case 'Table': {
        const t = new LuaTable(); let n = 1;
        e.items.forEach((it, i) => {
          if (it.key) { const k = evalExp(it.key, sc, va); if (k === undefined) throw new LuaError(where(e.line) + 'table index is nil'); t.set(k, evalExp(it.v, sc, va)); }
          else if (i === e.items.length - 1 && (it.v.k === 'Call' || it.v.k === 'Method' || it.v.k === 'Vararg')) {
            const vs = it.v.k === 'Vararg' ? va : evalCall(it.v, sc, va);
            for (const v of vs) t.set(n++, v);
          } else t.set(n++, evalExp(it.v, sc, va));
        });
        return t;
      }
      case 'Unop': {
        const v = evalExp(e.e, sc, va);
        if (e.op === 'not') return !truthy(v);
        if (e.op === '-') return arith('-', 0, v, e.line);
        if (typeof v === 'string') return v.length;
        if (v instanceof LuaTable) { const m = v.mt && v.mt.get('__len'); return m ? first(callv(m, [v])) : v.len(); }
        throw new LuaError(where(e.line) + 'attempt to get length of a ' + typeOf(v) + ' value');
      }
      case 'Binop': {
        if (e.op === 'and') { const a = evalExp(e.a, sc, va); return truthy(a) ? evalExp(e.b, sc, va) : a; }
        if (e.op === 'or') { const a = evalExp(e.a, sc, va); return truthy(a) ? a : evalExp(e.b, sc, va); }
        const a = evalExp(e.a, sc, va), b = evalExp(e.b, sc, va);
        switch (e.op) {
          case '==': return a === b;
          case '~=': return a !== b;
          case '..': return concat(a, b, e.line);
          case '<': case '<=': case '>': case '>=': return compare(e.op, a, b, e.line);
          default: return arith(e.op, a, b, e.line);
        }
      }
    }
    throw new Unsupported('expression ' + e.k + ' not supported in the test interpreter');
  }
  // a list of expressions -> values, the last one expanded
  function evalList(list, sc, va) {
    const out = [];
    list.forEach((x, i) => {
      if (i === list.length - 1 && (x.k === 'Call' || x.k === 'Method')) out.push(...evalCall(x, sc, va));
      else if (i === list.length - 1 && x.k === 'Vararg') out.push(...va);
      else out.push(evalExp(x, sc, va));
    });
    return out;
  }
  function evalCall(e, sc, va) {
    if (e.k === 'Method') {
      const o = evalExp(e.obj, sc, va), f = index(o, e.name, e.line);
      if (f === undefined) throw new LuaError(where(e.line) + "attempt to call method '" + e.name + "' (a nil value)");
      return callv(f, [o].concat(evalList(e.args, sc, va)));
    }
    const f = evalExp(e.f, sc, va);
    if (typeof f !== 'function' && !(f instanceof LuaTable && f.mt && f.mt.get('__call'))) {
      const nm = e.f.k === 'Name' ? " (global '" + e.f.name + "')" : e.f.k === 'Index' && e.f.key.k === 'Str' ? " (field '" + e.f.key.v + "')" : '';
      throw new LuaError(where(e.line) + 'attempt to call a ' + typeOf(f) + ' value' + nm);
    }
    return callv(f, evalList(e.args, sc, va));
  }
  function makeFn(f, sc) {
    const fn = args => {
      const s = { vars: new Map(), up: sc };
      f.params.forEach((p, i) => s.vars.set(p, args[i]));
      const va = f.vararg ? args.slice(f.params.length) : [];
      const r = execBlock(f.body, s, va, true);
      return r && r.ret ? r.ret : [];
    };
    return fn;
  }
  // returns undefined | {brk:true} | {ret:[values]}
  function execBlock(b, sc, va, own) {
    const s = own ? sc : { vars: new Map(), up: sc };
    for (const st of b.body) {
      const r = exec(st, s, va);
      if (r) return r;
    }
    return undefined;
  }
  function assign(t, v, sc, va) {
    if (t.k === 'Name') { const s = lookup(sc, t.name); if (s) s.vars.set(t.name, v); else G.set(t.name, v); return; }
    setIndex(evalExp(t.obj, sc, va), evalExp(t.key, sc, va), v, t.line);
  }
  function exec(st, sc, va) {
    switch (st.k) {
      case 'Local': { const vs = evalList(st.vals, sc, va); st.names.forEach((n, i) => sc.vars.set(n, vs[i])); return; }
      case 'LocalFunction': { sc.vars.set(st.name, undefined); sc.vars.set(st.name, makeFn(st.f, sc)); return; }
      case 'Assign': {
        if (st.targets.length === 1) { assign(st.targets[0], first(evalList(st.vals, sc, va)), sc, va); return; }
        const vs = evalList(st.vals, sc, va);
        st.targets.forEach((t, i) => assign(t, vs[i], sc, va));
        return;
      }
      case 'CallStat': evalCall(st.call, sc, va); return;
      case 'Do': return execBlock(st.body, sc, va);
      case 'Return': {
        const vs = st.vals.length === 1 && (st.vals[0].k === 'Call' || st.vals[0].k === 'Method') ? evalCall(st.vals[0], sc, va) : evalList(st.vals, sc, va);
        return { ret: vs };
      }
      case 'Break': return { brk: true };
      case 'If': {
        for (const c of st.clauses) if (truthy(evalExp(c.cond, sc, va))) return execBlock(c.body, sc, va);
        if (st.els) return execBlock(st.els, sc, va);
        return;
      }
      case 'While': {
        while (truthy(evalExp(st.cond, sc, va))) { const r = execBlock(st.body, sc, va); if (r) { if (r.brk) break; return r; } }
        return;
      }
      case 'Repeat': {
        for (;;) {
          const s = { vars: new Map(), up: sc };
          const r = execBlock(st.body, s, va, true);
          if (r) { if (r.brk) break; return r; }
          if (truthy(evalExp(st.cond, s, va))) break;
        }
        return;
      }
      case 'NumFor': {
        const a = tonum(evalExp(st.a, sc, va)), b = tonum(evalExp(st.b, sc, va)), c = st.c ? tonum(evalExp(st.c, sc, va)) : 1;
        if (a === undefined || b === undefined || c === undefined) throw new LuaError(where(st.line) + "'for' value must be a number");
        for (let i = a; c > 0 ? i <= b : i >= b; i += c) {
          const s = { vars: new Map([[st.name, i]]), up: sc };
          const r = execBlock(st.body, s, va, true);
          if (r) { if (r.brk) break; return r; }
        }
        return;
      }
      case 'GenFor': {
        const vs = evalList(st.exps, sc, va);
        const f = vs[0], state = vs[1];
        let ctl = vs[2];
        for (;;) {
          const rs = callv(f, [state, ctl]);
          if (rs[0] === undefined || rs[0] === null) break;
          ctl = rs[0];
          const s = { vars: new Map(), up: sc };
          st.names.forEach((n, i) => s.vars.set(n, rs[i]));
          const r = execBlock(st.body, s, va, true);
          if (r) { if (r.brk) break; return r; }
        }
        return;
      }
      case 'Label': return;
      case 'Goto': throw new Unsupported('goto is not supported in the test interpreter');
    }
    throw new Unsupported('statement ' + st.k + ' not supported in the test interpreter');
  }

  // ---- standard library (the parts the habits and a stock bot.lua use)
  const lib = (t, nm, f) => t.set(nm, f);
  const T = o => { const t = new LuaTable(); for (const k of Object.keys(o)) t.set(k, o[k]); return t; };
  const arg = (a, i, fn, want) => { const v = a[i]; if (want && typeOf(v) !== want && !(want === 'number' && tonum(v) !== undefined)) throw new LuaError("bad argument #" + (i + 1) + " to '" + fn + "' (" + want + ' expected, got ' + (v === undefined ? 'no value' : typeOf(v)) + ')'); return want === 'number' ? tonum(v) : v; };
  // next over a table: insertion order (Lua's own order differs; scripts must not depend on it)
  function luaNext(t, k) {
    const keys = [...t.h.keys()];
    let i = 0;
    if (k !== undefined) { i = keys.indexOf(normKey(k)); if (i < 0) throw new LuaError("invalid key to 'next'"); i++; }
    for (; i < keys.length; i++) { const v = t.h.get(keys[i]); if (v !== undefined) return [keys[i], v]; }
    return [undefined];
  }
  lib(G, 'next', a => luaNext(arg(a, 0, 'next', 'table'), a[1]));
  lib(G, 'pairs', a => {
    const t = a[0];
    const m = t instanceof LuaTable && t.mt && t.mt.get('__pairs');
    if (m) return callv(m, [t]).slice(0, 3);
    arg(a, 0, 'pairs', 'table');
    // a snapshot of the keys: assigning to existing fields (or clearing them) while walking is allowed, as in Lua
    const keys = [...t.h.keys()]; let i = 0;
    const it = () => { while (i < keys.length) { const k = keys[i++], v = t.h.get(k); if (v !== undefined) return [k, v]; } return [undefined]; };
    return [it, t, undefined];
  });
  lib(G, 'ipairs', a => { const t = a[0]; if (!(t instanceof LuaTable)) arg(a, 0, 'ipairs', 'table'); return [(b) => { const i = b[1] + 1, v = index(b[0], i); return v === undefined ? [undefined] : [i, v]; }, t, 0]; });
  lib(G, 'type', a => { if (!a.length) throw new LuaError("bad argument #1 to 'type' (value expected)"); return [typeOf(a[0])]; });
  lib(G, 'tostring', a => [tostr(a[0])]);
  lib(G, 'tonumber', a => {
    if (a[1] !== undefined) { const v = parseInt(String(a[0]).trim(), a[1]); return [Number.isNaN(v) ? undefined : v]; }
    return [tonum(a[0])];
  });
  lib(G, 'select', a => { const n = a[0]; if (n === '#') return [a.length - 1]; const i = tonum(n); return a.slice(i < 0 ? a.length + i : i); });
  lib(G, 'rawget', a => [arg(a, 0, 'rawget', 'table').get(a[1])]);
  lib(G, 'rawset', a => { arg(a, 0, 'rawset', 'table').set(a[1], a[2]); return [a[0]]; });
  lib(G, 'rawequal', a => [a[0] === a[1]]);
  lib(G, 'rawlen', a => [a[0] instanceof LuaTable ? a[0].len() : String(a[0]).length]);
  lib(G, 'setmetatable', a => { const t = arg(a, 0, 'setmetatable', 'table'); t.mt = a[1] instanceof LuaTable ? a[1] : null; return [t]; });
  lib(G, 'getmetatable', a => [a[0] instanceof LuaTable ? (a[0].mt || undefined) : typeof a[0] === 'string' ? strMeta : undefined]);
  lib(G, 'assert', a => { if (!truthy(a[0])) throw new LuaError(a.length > 1 ? a[1] : 'assertion failed!'); return a; });
  lib(G, 'error', a => { const v = a[0], lvl = a[1] === undefined ? 1 : a[1]; throw new LuaError(typeof v === 'string' && lvl > 0 ? v : v); });
  function protect(f, args) {
    try { return [true].concat(callv(f, args)); } catch (e) {
      if (e instanceof Unsupported) throw e;
      if (e instanceof LuaError) return [false, e.value];
      if (e instanceof RangeError) return [false, 'stack overflow'];
      throw e;   // a fault of the interpreter itself, not of the Lua code
    }
  }
  lib(G, 'pcall', a => protect(a[0], a.slice(1)));
  lib(G, 'xpcall', a => { const r = protect(a[0], a.slice(2)); if (r[0]) return r; return [false].concat(callv(a[1], [r[1]])); });
  lib(G, 'print', a => { (opt.print || (() => {}))(a.map(tostr).join('\t')); return []; });
  lib(G, 'unpack', a => { const t = a[0], i = a[1] || 1, j = a[2] === undefined ? t.len() : a[2], out = []; for (let k = i; k <= j; k++) out.push(t.get(k)); return out; });
  G.set('_G', G); G.set('_VERSION', 'Lua 5.2');
  // require: the engine hook reads a resource path and appends .lua; loaded once per name
  const loaded = new LuaTable();
  lib(G, 'require', a => {
    const nm = String(a[0]);
    if (loaded.get(nm) !== undefined) return [loaded.get(nm)];
    const src = opt.require ? opt.require(nm) : null;
    if (src == null) throw new LuaError("module '" + nm + "' not found");
    const ast = parse(src, nm);
    const r = execBlock(ast, { vars: new Map(), up: null }, [], true);
    const v = r && r.ret && r.ret[0] !== undefined ? r.ret[0] : true;
    loaded.set(nm, v);
    return [v];
  });
  // string
  const S = strLib;
  lib(S, 'len', a => [String(arg(a, 0, 'len', 'string')).length]);
  lib(S, 'lower', a => [tostr(a[0]).toLowerCase()]);
  lib(S, 'upper', a => [tostr(a[0]).toUpperCase()]);
  lib(S, 'rep', a => [tostr(a[0]).repeat(Math.max(0, tonum(a[1])))]);
  lib(S, 'reverse', a => [tostr(a[0]).split('').reverse().join('')]);
  lib(S, 'byte', a => { const s = tostr(a[0]), i = a[1] === undefined ? 1 : tonum(a[1]), j = a[2] === undefined ? i : tonum(a[2]); const out = []; for (let k = i; k <= j && k <= s.length; k++) out.push(s.charCodeAt(k - 1)); return out; });
  lib(S, 'char', a => [String.fromCharCode(...a.map(tonum))]);
  const sidx = (len, i) => (i < 0 ? Math.max(len + i + 1, 1) : i === 0 ? 1 : i);
  lib(S, 'sub', a => { const s = tostr(a[0]), L = s.length, i = sidx(L, a[1] === undefined ? 1 : tonum(a[1])), j0 = a[2] === undefined ? -1 : tonum(a[2]), j = j0 < 0 ? L + j0 + 1 : Math.min(j0, L); return [i > j ? '' : s.slice(i - 1, j)]; });
  // Lua patterns -> JS RegExp for the common classes (%a %d %l %s %u %w %x %p %c and their capitals, ., [sets], * + - ?, ^ $, captures)
  function pat(p) {
    let out = '', i = 0;
    const cls = c => ({ a: 'A-Za-z', d: '0-9', l: 'a-z', s: '\\s', u: 'A-Z', w: 'A-Za-z0-9', x: '0-9A-Fa-f', p: '!-\\/:-@\\[-`{-~', c: '\\x00-\\x1f' })[c];
    while (i < p.length) {
      const c = p[i];
      if (c === '%') {
        const d = p[i + 1]; i += 2;
        if (cls(d.toLowerCase())) out += d === d.toLowerCase() ? '[' + cls(d) + ']' : '[^' + cls(d.toLowerCase()) + ']';
        else if (/[bf0-9]/.test(d)) throw new Unsupported('pattern %' + d + ' not supported in the test interpreter');
        else out += '\\' + d;
      } else if (c === '[') {
        let j = i + 1, set = '[';
        if (p[j] === '^') { set += '^'; j++; }
        while (j < p.length && (p[j] !== ']' || j === i + 1)) {
          if (p[j] === '%') { const d = p[j + 1]; set += cls(d.toLowerCase()) && d === d.toLowerCase() ? cls(d) : '\\' + d; j += 2; }
          else { set += /[\\\]^]/.test(p[j]) ? '\\' + p[j] : p[j]; j++; }
        }
        out += set + ']'; i = j + 1;
      } else if (c === '-') { out += '*?'; i++; }
      else if (c === '.' ) { out += '[\\s\\S]'; i++; }
      else if ('*+?()'.includes(c)) { out += c; i++; }
      else if (c === '^' && i === 0) { out += '^'; i++; }
      else if (c === '$' && i === p.length - 1) { out += '$'; i++; }
      else { out += c.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&'); i++; }
    }
    return out;
  }
  lib(S, 'find', a => {
    const s = tostr(a[0]), p = tostr(a[1]), init = sidx(s.length, a[2] === undefined ? 1 : tonum(a[2]));
    if (truthy(a[3]) || !/[\^$*+?.()[\]%-]/.test(p)) { const k = s.indexOf(p, init - 1); return k < 0 ? [undefined] : [k + 1, k + p.length]; }
    const re = new RegExp(pat(p), 'g'); re.lastIndex = init - 1;
    const m = re.exec(s); if (!m || (p[0] === '^' && m.index !== init - 1)) return [undefined];
    return [m.index + 1, m.index + m[0].length].concat(m.slice(1));
  });
  lib(S, 'match', a => {
    const s = tostr(a[0]), p = tostr(a[1]), init = sidx(s.length, a[2] === undefined ? 1 : tonum(a[2]));
    const re = new RegExp(pat(p), 'g'); re.lastIndex = init - 1;
    const m = re.exec(s); if (!m) return [undefined];
    return m.length > 1 ? m.slice(1) : [m[0]];
  });
  lib(S, 'gmatch', a => {
    const s = tostr(a[0]), re = new RegExp(pat(tostr(a[1])), 'g');
    return [() => { const m = re.exec(s); if (!m) return [undefined]; if (m[0] === '') re.lastIndex++; return m.length > 1 ? m.slice(1) : [m[0]]; }];
  });
  lib(S, 'gsub', a => {
    const s = tostr(a[0]), re = new RegExp(pat(tostr(a[1])), 'g'), r = a[2]; let n = 0;
    const out = s.replace(re, (...m) => {
      n++; const caps = m.slice(1, -2), whole = m[0], key = caps.length ? caps[0] : whole;
      let v;
      if (typeof r === 'string' || typeof r === 'number') v = String(r).replace(/%([0-9%])/g, (x, d) => (d === '%' ? '%' : d === '0' ? whole : caps[d - 1]));
      else if (r instanceof LuaTable) v = r.get(key);
      else v = first(callv(r, caps.length ? caps : [whole]));
      return truthy(v) ? tostr(v) : whole;
    });
    return [out, n];
  });
  lib(S, 'format', a => {
    const f = tostr(a[0]); let k = 1;
    const out = f.replace(/%([-+ #0]*)(\d*)(?:\.(\d+))?([diouxXeEfgGqsc%])/g, (m, fl, w, pr, c) => {
      if (c === '%') return '%';
      const v = a[k++];
      let s;
      switch (c) {
        case 'd': case 'i': { const x = tonum(v); if (x === undefined) throw new LuaError("bad argument #" + k + " to 'format' (number expected, got " + typeOf(v) + ')'); s = String(Math.trunc(x)); break; }
        case 'u': s = String(Math.trunc(Math.abs(tonum(v)))); break;
        case 'o': s = Math.trunc(tonum(v)).toString(8); break;
        case 'x': s = Math.trunc(tonum(v)).toString(16); break;
        case 'X': s = Math.trunc(tonum(v)).toString(16).toUpperCase(); break;
        case 'c': s = String.fromCharCode(tonum(v)); break;
        case 'f': s = tonum(v).toFixed(pr === undefined ? 6 : Number(pr)); break;
        case 'e': case 'E': s = tonum(v).toExponential(pr === undefined ? 6 : Number(pr)).replace(/e([+-])(\d)$/, 'e$10$2'); if (c === 'E') s = s.toUpperCase(); break;
        case 'g': case 'G': s = fmtNum(tonum(v)); break;
        case 'q': s = '"' + tostr(v).replace(/[\\"\n]/g, x => (x === '\n' ? '\\\n' : '\\' + x)) + '"'; break;
        case 's': s = tostr(v); if (pr !== undefined) s = s.slice(0, Number(pr)); break;
      }
      if (/[di]/.test(c) && pr !== undefined) s = s.replace(/^(-?)(\d+)$/, (x, sg, d) => sg + d.padStart(Number(pr), '0'));
      if (fl.includes('+') && /[dif]/.test(c) && !s.startsWith('-')) s = '+' + s;
      const W = Number(w || 0);
      if (s.length < W) s = fl.includes('-') ? s.padEnd(W) : (fl.includes('0') && /[diuxXfeEgG]/.test(c) ? s.replace(/^([+-]?)/, (x, sg) => sg + '0'.repeat(W - s.length)) : s.padStart(W));
      return s;
    });
    return [out];
  });
  G.set('string', S);
  // table
  const TB = new LuaTable();
  lib(TB, 'insert', a => {
    const t = arg(a, 0, 'insert', 'table'), n = t.len();
    if (a.length === 2) { t.set(n + 1, a[1]); return []; }
    if (a.length !== 3) throw new LuaError("wrong number of arguments to 'insert'");
    const pos = tonum(a[1]);
    if (pos < 1 || pos > n + 1) throw new LuaError("bad argument #2 to 'insert' (position out of bounds)");
    for (let i = n; i >= pos; i--) t.set(i + 1, t.get(i));
    t.set(pos, a[2]); return [];
  });
  lib(TB, 'remove', a => {
    const t = arg(a, 0, 'remove', 'table'), n = t.len();
    if (n === 0 && a[1] === undefined) return [undefined];
    const pos = a[1] === undefined ? n : tonum(a[1]), v = t.get(pos);
    for (let i = pos; i < n; i++) t.set(i, t.get(i + 1));
    if (pos <= n) t.set(n, undefined);
    return [v];
  });
  lib(TB, 'concat', a => { const t = arg(a, 0, 'concat', 'table'), sep = a[1] === undefined ? '' : tostr(a[1]), i = a[2] === undefined ? 1 : tonum(a[2]), j = a[3] === undefined ? t.len() : tonum(a[3]); const out = []; for (let k = i; k <= j; k++) { const v = t.get(k); if (typeof v !== 'string' && typeof v !== 'number') throw new LuaError("invalid value (at index " + k + ") in table for 'concat'"); out.push(tostr(v)); } return [out.join(sep)]; });
  lib(TB, 'sort', a => {
    const t = arg(a, 0, 'sort', 'table'), n = t.len(), arr = []; for (let k = 1; k <= n; k++) arr.push(t.get(k));
    const lt = a[1] ? (x, y) => truthy(first(callv(a[1], [x, y]))) : (x, y) => compare('<', x, y);
    arr.sort((x, y) => (lt(x, y) ? -1 : lt(y, x) ? 1 : 0));
    arr.forEach((v, k) => t.set(k + 1, v)); return [];
  });
  lib(TB, 'unpack', G.get('unpack'));
  lib(TB, 'pack', a => { const t = new LuaTable(); a.forEach((v, i) => t.set(i + 1, v)); t.set('n', a.length); return [t]; });
  G.set('table', TB);
  // math
  const M = new LuaTable();
  for (const f of ['floor', 'ceil', 'abs', 'sqrt', 'sin', 'cos', 'tan', 'exp', 'log']) lib(M, f, a => [Math[f](arg(a, 0, f, 'number'))]);
  lib(M, 'max', a => [Math.max(...a.map(tonum))]);
  lib(M, 'min', a => [Math.min(...a.map(tonum))]);
  lib(M, 'fmod', a => [tonum(a[0]) % tonum(a[1])]);
  lib(M, 'modf', a => { const x = tonum(a[0]), i = Math.trunc(x); return [i, x - i]; });
  lib(M, 'random', a => {
    const r = rnd();
    if (a.length === 0) return [r];
    const lo = a.length === 1 ? 1 : tonum(a[0]), hi = a.length === 1 ? tonum(a[0]) : tonum(a[1]);
    if (lo > hi) throw new LuaError("bad argument #" + a.length + " to 'random' (interval is empty)");
    return [lo + Math.floor(r * (hi - lo + 1))];
  });
  lib(M, 'randomseed', () => []);
  M.set('huge', Infinity); M.set('pi', Math.PI);
  G.set('math', M);
  // os and io (files live in opt.files; no process is ever started)
  const OS = new LuaTable();
  lib(OS, 'time', () => [Math.floor((opt.now ? opt.now() : Date.now()) / 1000)]);
  lib(OS, 'clock', () => [opt.clock ? opt.clock() : 0]);
  lib(OS, 'getenv', a => [opt.env ? opt.env[tostr(a[0])] : undefined]);
  lib(OS, 'date', () => ['2026-01-01 00:00:00']);
  lib(OS, 'remove', a => { const p = tostr(a[0]); if (!files.has(p)) return [undefined, p + ': No such file or directory']; files.delete(p); return [true]; });
  lib(OS, 'execute', () => { throw new LuaError('os.execute is not allowed'); });
  G.set('os', OS);
  const IO = new LuaTable(), fileMeta = new LuaTable(), fileM = new LuaTable();
  fileMeta.set('__index', fileM);
  const canOpen = opt.canOpen || (() => true);
  lib(IO, 'open', a => {
    const p = tostr(a[0]), mode = a[1] === undefined ? 'r' : tostr(a[1]);
    if (/^r/.test(mode) && !files.has(p)) return [undefined, p + ': No such file or directory', 2];
    if (!canOpen(p, mode)) return [undefined, p + ': No such file or directory', 2];
    if (/^w/.test(mode)) files.set(p, '');
    else if (/^a/.test(mode) && !files.has(p)) files.set(p, '');
    const f = new LuaTable(); f.mt = fileMeta; f.set('__path', p); f.set('__pos', 0);
    return [f];
  });
  lib(fileM, 'write', a => { const f = a[0], p = f.get('__path'); if (f.get('__closed')) throw new LuaError('attempt to use a closed file'); files.set(p, files.get(p) + a.slice(1).map(tostr).join('')); return [f]; });
  lib(fileM, 'close', a => { a[0].set('__closed', true); return [true]; });
  lib(fileM, 'flush', a => [a[0]]);
  lib(fileM, 'read', a => { const f = a[0], s = files.get(f.get('__path')) || '', pos = f.get('__pos'); if (pos >= s.length) return [undefined]; f.set('__pos', s.length); return [s.slice(pos)]; });
  G.set('io', IO);

  for (const [k, v] of Object.entries(opt.globals || {})) G.set(k, v);
  const ast = parse(text, name);
  execBlock(ast, { vars: new Map(), up: null }, [], true);

  const api = {
    G,
    get: nm => G.get(nm),
    call: (fn, ...args) => callv(typeof fn === 'string' ? G.get(fn) : fn, args),
    exec: (src, nm) => execBlock(parse(src, nm || 'extra'), { vars: new Map(), up: null }, [], true),
    table: js => toLua(js),
    js: v => toJs(v),
    setRandom: f => { rnd = f; },
  };
  return api;
}
// plain JS (objects, arrays, numbers, strings, booleans, functions (args) -> results) <-> Lua values
function toLua(v) {
  if (Array.isArray(v)) { const t = new LuaTable(); v.forEach((x, i) => t.set(i + 1, toLua(x))); return t; }
  if (v && typeof v === 'object' && !(v instanceof LuaTable)) { const t = new LuaTable(); for (const k of Object.keys(v)) t.set(k, toLua(v[k])); return t; }
  return v === null ? undefined : v;
}
function toJs(v, seen) {
  if (!(v instanceof LuaTable)) return v;
  seen = seen || new Set(); if (seen.has(v)) return '<cycle>'; seen.add(v);
  const n = v.len(), keys = [...v.h.keys()];
  if (n > 0 && n === keys.length) { const a = []; for (let i = 1; i <= n; i++) a.push(toJs(v.get(i), seen)); return a; }
  const o = {}; for (const k of keys) o[String(k)] = toJs(v.h.get(k), seen); return o;
}

module.exports = { parse, check, run, lex, LuaTable, LuaError, Unsupported, toLua, toJs, tostr, typeOf };

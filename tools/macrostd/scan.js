// macrostd/scan: byte-exact macro scanner for one SDL text file (latin1 string = bytes 1:1). No IO.
//   scan(s) -> { defines, calls, includes, lineOf(pos), lines }
//     define  { name, line, endLine, span:[a,b] '(' .. after ')', nameSpan:[a,b] inside quotes, bodySpan:[a,b] after name .. before ')',
//               closed:bool, header:[comment lines above, top-down], inDefine:index|-1 }
//     call    { name, line, span:[a,b] '(' .. after ')', nameSpan, params:[{name, nameSpan, valSpan, value}], args:[{text, span}],
//               dynamic: name has '%', inDefine: index of the enclosing define or -1 }
//     include { raw, line, span, nameSpan, params:[..], inDefine }
//   Emulates sdlparser/sdlx: ';' comments to CR/LF, strings never span a line end (SDL-08; `\x` skips one byte), '=' is whitespace
//   `(` + string = macro call, `(define "n" body)`, `(include "p" params)`; params raw: name immediately followed by '(' and the value
//   ends at the FIRST ')' (SDL-19); `args` without '(' = positional list. Rows SDL-17/18/19.
//   lineEnds(s) -> [{pos, len}] each CR LF / LF / CR    dynRe(name) -> RegExp for a '%' name ('%x' = any text)
// Author: Imperator_Aug (ARSENAL, ia-2a607686)

const WS = new Uint8Array(256);
for (const c of [32, 9, 13, 10, 61]) WS[c] = 1;
const DELIM = new Uint8Array(256);
for (const c of [32, 9, 13, 10, 61, 59, 34, 40, 41, 123, 125]) DELIM[c] = 1;

function scan(s) {
  const n = s.length;
  const ls = [0];
  for (let k = 0; k < n; k++) { const c = s.charCodeAt(k); if (c === 10) ls.push(k + 1); else if (c === 13 && s.charCodeAt(k + 1) !== 10) ls.push(k + 1); }
  const lineOf = pos => { let lo = 0, hi = ls.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (ls[m] <= pos) lo = m; else hi = m - 1; } return lo + 1; };

  // token at/after j: { k:'('|')'|'S'|'W'|'O', a, b, bad? }  (S: a = opening quote, b = after closing quote)
  function next(j) {
    for (;;) {
      if (j >= n) return null;
      const c = s.charCodeAt(j);
      if (c < 256 && WS[c]) { j++; continue; }
      if (c === 59) { while (j < n) { const d = s.charCodeAt(j); if (d === 10 || d === 13) break; j++; } continue; }
      break;
    }
    const c = s.charCodeAt(j);
    if (c === 40) return { k: '(', a: j, b: j + 1 };
    if (c === 41) return { k: ')', a: j, b: j + 1 };
    if (c === 123 || c === 125) return { k: 'O', a: j, b: j + 1 };
    if (c === 34) {
      let q = j + 1;
      for (;;) {
        if (q >= n) return { k: 'S', a: j, b: q, bad: true };
        const d = s.charCodeAt(q);
        if (d === 92) { q += 2; continue; }
        if (d === 10 || d === 13) return { k: 'S', a: j, b: q, bad: true };
        if (d === 34) return { k: 'S', a: j, b: q + 1 };
        q++;
      }
    }
    let q = j + 1;
    while (q < n) { const d = s.charCodeAt(q); if (d < 256 && DELIM[d]) break; q++; }
    return { k: 'W', a: j, b: q };
  }
  // after a consumed '(' at depth 1: position after the matching ')' (n if none)
  function skipClose(j) {
    for (let d = 1; ;) {
      const t = next(j); if (!t) return n;
      j = t.b;
      if (t.k === '(') d++; else if (t.k === ')' && --d === 0) return j;
    }
  }
  // sdlx readParams from j (after the name string) -> { end, params, args, bad }
  function readParams(j) {
    const params = [], args = [];
    for (;;) {
      const t = next(j);
      if (!t) return { end: n, params, args, bad: true };
      if (t.k === ')') return { end: t.b, params, args };
      if (t.k !== 'W') return { end: t.k === '(' ? skipClose(skipClose(t.b)) : skipClose(t.b), params, args, bad: true };
      const name = s.slice(t.a, t.b);
      if (name === 'args' && s.charCodeAt(t.b) !== 40) {
        let k = t.b;
        for (;;) {
          const a = next(k);
          if (!a) return { end: n, params, args, bad: true };
          if (a.k === ')') return { end: a.b, params, args };
          if (a.k === '(') { const e = skipClose(a.b); args.push({ text: s.slice(a.a, e), span: [a.a, e] }); k = e; continue; }
          if (a.k === 'S' || a.k === 'W') { args.push({ text: s.slice(a.a, a.b), span: [a.a, a.b] }); k = a.b; continue; }
          return { end: skipClose(a.b), params, args, bad: true };
        }
      }
      if (s.charCodeAt(t.b) !== 40) return { end: skipClose(t.b), params, args, bad: true };
      const e = s.indexOf(')', t.b + 1);
      if (e < 0) return { end: n, params, args, bad: true };
      params.push({ name, nameSpan: [t.a, t.b], valSpan: [t.b + 1, e], value: s.slice(t.b + 1, e) });
      j = e + 1;
    }
  }

  const defines = [], calls = [], includes = [];
  const open = [];   // define indexes whose body is being scanned
  let pos = 0;
  for (;;) {
    const t = next(pos);
    if (!t) break;
    while (open.length && defines[open[open.length - 1]].bodySpan[1] <= t.a) open.pop();
    const inDef = open.length ? open[open.length - 1] : -1;
    pos = t.b;
    if (t.k !== '(') continue;
    const u = next(pos);
    if (!u) break;
    if (u.k === 'S') {
      const r = readParams(u.b);
      const name = s.slice(u.a + 1, u.bad ? u.b : u.b - 1);
      calls.push({ name, line: lineOf(u.a), span: [t.a, r.end], nameSpan: [u.a + 1, u.bad ? u.b : u.b - 1], params: r.params, args: r.args, bad: !!(r.bad || u.bad), dynamic: name.includes('%'), inDefine: inDef });
      pos = r.end; continue;
    }
    if (u.k === 'W') {
      const w = s.slice(u.a, u.b).toLowerCase();
      if (w === 'define') {
        const v = next(u.b);
        if (v && v.k === 'S') {
          let d = 1, k = v.b, close = -1;
          for (;;) { const x = next(k); if (!x) break; k = x.b; if (x.k === '(') d++; else if (x.k === ')' && --d === 0) { close = x.a; break; } }
          const end = close < 0 ? n : close + 1;
          defines.push({ name: s.slice(v.a + 1, v.b - 1), line: lineOf(t.a), endLine: lineOf(Math.max(t.a, end - 1)), span: [t.a, end], nameSpan: [v.a + 1, v.b - 1],
            bodySpan: [v.b, close < 0 ? n : close], closed: close >= 0, inDefine: inDef });
          open.push(defines.length - 1);
          pos = v.b; continue;
        }
        pos = u.b; continue;
      }
      if (w === 'include') {
        const v = next(u.b);
        if (v && v.k === 'S') {
          const r = readParams(v.b);
          includes.push({ raw: s.slice(v.a + 1, v.b - 1), line: lineOf(t.a), span: [t.a, r.end], nameSpan: [v.a + 1, v.b - 1], params: r.params, inDefine: inDef });
          pos = r.end; continue;
        }
        pos = u.b; continue;
      }
      pos = u.b; continue;
    }
    pos = u.a;   // '(' '(' or '(' ')' : look at u again
  }
  // header comment: comment-only lines directly above the define's first line
  const lineText = i => s.slice(ls[i - 1], i < ls.length ? ls[i] : n).replace(/[\r\n]+$/, '');
  for (const d of defines) {
    const before = s.slice(ls[d.line - 1], d.span[0]);
    const h = [];
    if (/^[ \t]*$/.test(before)) for (let i = d.line - 1; i >= 1; i--) { const L = lineText(i); if (/^[ \t]*;/.test(L)) h.unshift(L); else break; }
    d.header = h;
  }
  return { defines, calls, includes, lineOf, lineStarts: ls, lineText };
}

// every line end: [{pos, len}] (CRLF = 2, lone LF / lone CR = 1)
function lineEnds(s) {
  const out = [];
  for (let k = 0; k < s.length; k++) {
    const c = s.charCodeAt(k);
    if (c === 13) { if (s.charCodeAt(k + 1) === 10) { out.push({ pos: k, len: 2 }); k++; } else out.push({ pos: k, len: 1 }); }
    else if (c === 10) out.push({ pos: k, len: 1 });
  }
  return out;
}

const esc = x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// "gore_piece%0" -> /^gore_piece.*$/ ; '%word' may stand for any text (plain text substitution, GPL-11)
function dynRe(name) { return new RegExp('^' + name.split(/%\w+/).map(esc).join('[\\s\\S]*') + '$'); }

// macro params used in a body: { named:[..], positional:[..] } in first-use order
function bodyParams(body) {
  const named = [], pos = [];
  for (const m of body.matchAll(/%(\w+)/g)) { const p = m[1]; const L = /^\d+$/.test(p) ? pos : named; if (!L.includes(p)) L.push(p); }
  pos.sort((a, b) => a - b);
  return { named, positional: pos };
}

module.exports = { scan, lineEnds, dynRe, bodyParams };

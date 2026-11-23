// bots/buycheck scan helpers: offsets, not just lines, so every fix is an exact edit of the original bytes.
//   luaTable(s, a)  walks a Lua table on text blanked by keylint stripLua (comments and string contents -> spaces, offsets kept):
//                   {a, b, fields:[{start, kind:'pos'|'name'|'br', key, kraw:[a,b], vs, ve, sub?, sep?, end}]}
//   sdlTree(t)      SDL blocks of a .set/.inc text: {name, vals, kids, a ('{'), b ('}'), line}; ; comments and strings skipped
//   cutField(t, s, f)  the edit that removes one table field: its whole line(s) when it stands alone there, else the field and one separator
//   hunks(t, edits) the preview: [{line, was:[..], now:[..]}] per group of edited lines, from edits [{a, b, t}] on the original text
// Author: Imperator_Aug (ARSENAL, ia-9f6322cb)
'use strict';

const bad = (msg, at) => Object.assign(new Error(msg), { at });
const ws = c => c === ' ' || c === '\t' || c === '\r' || c === '\n' || c === '\v' || c === '\f';
function skip(s, i) { while (i < s.length && ws(s[i])) i++; return i; }

function luaTable(s, a) {
  const T = { a, b: -1, fields: [] };
  let i = a + 1;
  for (;;) {
    i = skip(s, i);
    if (i >= s.length) throw bad('a table is not closed', a);
    if (s[i] === '}') { T.b = i; return T; }
    const f = { start: i, kind: 'pos', key: null };
    let m;
    if (s[i] === '[') {
      const e = s.indexOf(']', i); if (e < 0) throw bad('a [key] is not closed', i);
      f.kind = 'br'; f.kraw = [i + 1, e]; i = skip(s, e + 1);
      if (s[i] !== '=') throw bad('[key] without =', i); i++;
    } else if ((m = /^([A-Za-z_]\w*)[ \t\r\n]*=(?!=)/.exec(s.slice(i, i + 300)))) { f.kind = 'name'; f.key = m[1]; i += m[0].length; }
    i = skip(s, i); f.vs = i;
    if (s[i] === '{') { f.sub = luaTable(s, i); i = f.sub.b + 1; }
    else {
      let d = 0;
      while (i < s.length) {
        const c = s[i];
        if (c === '"' || c === "'") { const e = s.indexOf(c, i + 1); i = e < 0 ? s.length : e + 1; continue; }
        if (c === '(' || c === '{') d++;
        else if (c === ')' || c === '}') { if (d === 0) break; d--; }
        else if ((c === ',' || c === ';') && d === 0) break;
        i++;
      }
    }
    let ve = i; while (ve > f.vs && ws(s[ve - 1])) ve--; f.ve = ve;
    i = skip(s, i);
    if (s[i] === ',' || s[i] === ';') { f.sep = i; i++; f.end = i; }
    else if (s[i] !== '}') throw bad('expected , or } after a value', i);
    else f.end = ve;
    T.fields.push(f);
  }
}
// a [key] of a field: the string inside the brackets (from the original text t), else the raw text
function brKey(t, f) { const r = t.slice(f.kraw[0], f.kraw[1]).trim(), m = /^"([^"]*)"$|^'([^']*)'$/.exec(r); return m ? (m[1] != null ? m[1] : m[2]) : r; }

function sdlTree(t) {
  const root = { name: null, vals: [], kids: [], a: -1, b: t.length, line: 0 }, st = [root];
  let i = 0, line = 1;
  const top = () => st[st.length - 1];
  const put = v => { const n = top(); if (n !== root && n.name === null && !n.named) { n.name = v; n.named = true; } else n.vals.push(v); };
  while (i < t.length) {
    const c = t[i];
    if (c === '\n') { line++; i++; continue; }
    if (ws(c)) { i++; continue; }
    if (c === ';') { while (i < t.length && t[i] !== '\n') i++; continue; }
    if (c === '"') { let j = i + 1; while (j < t.length && t[j] !== '"' && t[j] !== '\n') { if (t[j] === '\\') j++; j++; } put(t.slice(i + 1, j)); i = t[j] === '"' ? j + 1 : j; continue; }
    if (c === '{') { const n = { name: null, vals: [], kids: [], a: i, b: -1, line }; top().kids.push(n); st.push(n); i++; continue; }
    if (c === '}') { if (st.length > 1) { top().b = i; st.pop(); } i++; continue; }
    let j = i; while (j < t.length && !ws(t[j]) && t[j] !== '{' && t[j] !== '}' && t[j] !== '"' && t[j] !== ';') j++;
    put(t.slice(i, j)); i = j;
  }
  return root;
}
const lc = s => String(s == null ? '' : s).toLowerCase();
const kid = (n, name) => n.kids.find(k => lc(k.name) === lc(name));
const str = (n, name) => { const k = kid(n, name); return k && k.vals.length ? String(k.vals[0]) : null; };

const lineStart = (t, i) => t.lastIndexOf('\n', i - 1) + 1;
const lineEnd = (t, i) => { const e = t.indexOf('\n', i); return e < 0 ? t.length : e; };
// line of offset i: binary search in the line starts of t (kept for the last text asked, so a big list with thousands of rows stays fast)
let LT = null, LS = null;
function lineOf(t, i) {
  if (t !== LT) { LT = t; LS = [0]; for (let k = t.indexOf('\n'); k >= 0; k = t.indexOf('\n', k + 1)) LS.push(k + 1); }
  let lo = 0, hi = LS.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (LS[m] <= i) lo = m; else hi = m - 1; }
  return lo + 1;
}
const indentAt = (t, i) => /^[ \t]*/.exec(t.slice(lineStart(t, i)))[0];

// remove field f (s = blanked text, t = original): whole lines when nothing else is on them (a trailing comment goes with it)
function cutField(t, s, f) {
  const ls = lineStart(s, f.start), le = lineEnd(s, f.end);
  if (s.slice(ls, f.start).trim() === '' && s.slice(f.end, le).trim() === '') return { a: ls, b: le < t.length ? le + 1 : le, t: '' };
  let q = f.end; while (s[q] === ' ' || s[q] === '\t') q++;
  if (f.sep != null) return { a: f.start, b: q, t: '' };
  let p = f.start; while (p > 0 && ws(s[p - 1])) p--;
  if (s[p - 1] === ',' || s[p - 1] === ';') return { a: p - 1, b: f.end, t: '' };
  return { a: f.start, b: f.end, t: '' };
}

function apply(t, edits) {
  let out = '', pos = 0;
  for (const e of [...edits].sort((x, y) => x.a - y.a)) { if (e.a < pos) throw bad('overlapping edits', e.a); out += t.slice(pos, e.a) + e.t; pos = e.b; }
  return out + t.slice(pos);
}
const split = x => (x === '' ? [] : x.replace(/\r?\n$/, '').split(/\r?\n/));
function hunks(t, edits) {
  const sp = [...edits].sort((x, y) => x.a - y.a).map(e => {
    const s0 = lineStart(t, e.a), s1 = e.b > e.a && t[e.b - 1] === '\n' ? e.b : Math.min(t.length, lineEnd(t, e.b) + 1);
    return { s0, s1: Math.max(s1, e.b), es: [e] };
  });
  const g = [];
  for (const x of sp) { const l = g[g.length - 1]; if (l && x.s0 < l.s1) { l.s1 = Math.max(l.s1, x.s1); l.es.push(x.es[0]); } else g.push(x); }
  return g.map(x => {
    const was = t.slice(x.s0, x.s1), now = apply(was, x.es.map(e => ({ a: e.a - x.s0, b: e.b - x.s0, t: e.t })));
    return { line: lineOf(t, x.s0), was: split(was), now: split(now) };
  });
}

module.exports = { luaTable, brKey, sdlTree, kid, str, lc, lineStart, lineEnd, lineOf, indentAt, cutField, apply, hunks, skip };

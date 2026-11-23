// macrostd step indent: leading whitespace only, one TAB per nesting level (owner rule 2026-11-18).
//   Depth = open '{' and '(' not yet closed, counted outside strings and ';' comments (strings never span a line, SDL-08); the two
//   kinds are counted together. A line starting with a run of closers ('}' / ')', e.g. `})`) sits at the depth after that run.
//   Comment-only lines take the depth of the next code line; blank lines become empty. Lines are never joined or split: line count
//   and every byte from the first non-blank char on stay the same (log line numbers stay valid); line ends kept (CRLF in, CRLF out).
//   A line that starts inside a macro/include parameter value (raw text up to the first ')', SDL-19) keeps its whitespace (it is
//   part of the value). Skipped with a case: depth below 0 or not 0 at the end (unbalanced, SDL-16/62), a byte 0x80-0xBF outside
//   strings/comments (sdlx BAD_BYTE), a '\' line end inside a string.
// Author: Imperator_Aug (ARSENAL, ia-87c0be1f)
const { lineEnds } = require('../scan');
const { escapedEol } = require('./fmt');

function indentText(s, rawSpans) {
  const bom = s.startsWith('\u00ef\u00bb\u00bf') ? 3 : 0;
  const ends = lineEnds(s), lines = [];
  let pos = bom;
  for (const e of ends) { lines.push({ a: pos, b: e.pos, eol: s.slice(e.pos, e.pos + e.len) }); pos = e.pos + e.len; }
  if (pos < s.length || !lines.length) lines.push({ a: pos, b: s.length, eol: '' });
  // line starts inside a raw parameter value
  const keep = new Set();
  for (const [a, b] of rawSpans || []) for (let i = 0; i < lines.length; i++) if (lines[i].a > a && lines[i].a <= b) keep.add(i);
  let depth = 0;
  const want = new Array(lines.length);   // number | 'C' (comment-only) | 'B' (blank) | 'K' (keep)
  for (let i = 0; i < lines.length; i++) {
    const L = s.slice(lines[i].a, lines[i].b);
    const lead = /^[ \t]*/.exec(L)[0].length, rest = L.slice(lead);
    if (keep.has(i)) want[i] = 'K';
    else if (!rest.length) want[i] = 'B';
    else if (rest[0] === ';') want[i] = 'C';
    else {
      let run = 0; while (run < rest.length && (rest[run] === '}' || rest[run] === ')')) run++;
      if (depth - run < 0) return { error: `line ${i + 1}: closer without opener (depth below 0)`, line: i + 1 };
      want[i] = depth - run;
    }
    // depth change over the line, outside strings and comments
    for (let k = lead; k < rest.length + lead; k++) {
      const c = L.charCodeAt(k);
      if (c === 59) break;
      if (c === 34) { k++; while (k < L.length && L.charCodeAt(k) !== 34) k += L.charCodeAt(k) === 92 ? 2 : 1; continue; }
      if (c >= 0x80 && c <= 0xBF) return { error: `line ${i + 1}: byte 0x${c.toString(16)} outside strings/comments (sdlx BAD_BYTE)`, line: i + 1 };
      if (c === 123 || c === 40) depth++;
      else if (c === 125 || c === 41) { depth--; if (depth < 0) return { error: `line ${i + 1}: closer without opener (depth below 0)`, line: i + 1 }; }
    }
  }
  if (depth !== 0) return { error: `end of file at depth ${depth} (unclosed '{' or '(')`, line: lines.length };
  // comment-only lines: depth of the next code line (0 when none)
  let nextCode = 0;
  for (let i = lines.length - 1; i >= 0; i--) { if (typeof want[i] === 'number') nextCode = want[i]; else if (want[i] === 'C') want[i] = nextCode; }
  let out = s.slice(0, bom);
  const rows = [];
  const show = w => w === '' ? '(none)' : w.replace(/\t/g, '\\t').replace(/ /g, '\u00b7');
  for (let i = 0; i < lines.length; i++) {
    const L = s.slice(lines[i].a, lines[i].b);
    let n = L;
    if (want[i] === 'B') n = '';
    else if (typeof want[i] === 'number') n = '\t'.repeat(want[i]) + L.replace(/^[ \t]*/, '');
    if (n !== L) rows.push({ line: i + 1, kind: want[i] === 'B' ? 'blank' : 'indent', before: show(/^[ \t]*/.exec(L)[0]), after: show(/^[ \t]*/.exec(n)[0]), note: '' });
    out += n + lines[i].eol;
  }
  return { out, rows };
}

module.exports = {
  id: 'indent',
  title: 'one TAB per nesting level of { and (, leading whitespace only',
  indentText,
  plan(ctx) {
    const changes = [], cases = [];
    for (const F of ctx.model.files.values()) {
      if (!F.scope) continue;
      const s = ctx.read(F.rel).toString('latin1');
      if (escapedEol(s) >= 0) { cases.push({ id: 'indent-escaped-eol', title: `${F.rel}: a string escapes its line end`, detail: 'left as it is' }); continue; }
      const raw = [];
      for (const c of F.scan.calls) for (const p of c.params) raw.push(p.valSpan);
      for (const c of F.scan.includes) for (const p of c.params) raw.push(p.valSpan);
      const r = indentText(s, raw.filter(([a, b]) => /[\r\n]/.test(s.slice(a, b))));
      if (r.error) { cases.push({ id: 'indent-unbalanced', title: `${F.rel}:${r.line}: not re-indented`, detail: r.error }); continue; }
      if (r.out !== s) changes.push({ file: F.rel, after: Buffer.from(r.out, 'latin1'), create: false, rows: r.rows });
    }
    return { changes, cases };
  },
};

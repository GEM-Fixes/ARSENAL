// macrostd step fmt: CRLF line ends (lone LF / lone CR -> CRLF), no spaces/tabs at line ends, final newline. Indentation untouched.
//   Files: the model's scope (resource/ set, properties, entity .def/.ext/.inc; never lua or interface). A line end is never inside a
//   string (SDL-08) unless a string escapes it with '\' (the lexer skips the next byte): such a file is left alone and becomes a case.
// Author: Imperator_Aug (ARSENAL, ia-48062d74)
const { lineEnds } = require('../scan');

// '\' + CR/LF inside a string -> position, else -1
function escapedEol(s) {
  let inStr = false;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (inStr) {
      if (c === 92) { const d = s.charCodeAt(i + 1); if (d === 10 || d === 13) return i; i++; continue; }
      if (c === 34 || c === 10 || c === 13) inStr = false;
      continue;
    }
    if (c === 34) inStr = true;
    else if (c === 59) { while (i < s.length && s.charCodeAt(i) !== 10 && s.charCodeAt(i) !== 13) i++; }
  }
  return -1;
}

function fmtText(s) {
  const ends = lineEnds(s), rows = [];
  let out = '', pos = 0, line = 0, lf = 0, cr = 0, firstEol = 0;
  const seg = (a, b, eol) => {
    line++;
    const L = s.slice(a, b), T = L.replace(/[ \t]+$/, '');
    if (T.length !== L.length) rows.push({ line, kind: 'trail', before: JSON.stringify(L.slice(T.length)), after: '', note: `${L.length - T.length} trailing space/tab` });
    out += T + eol;
  };
  for (const e of ends) {
    const eol = s.slice(e.pos, e.pos + e.len);
    if (eol !== '\r\n') { if (eol === '\n') lf++; else cr++; if (!firstEol) firstEol = line + 1; }
    seg(pos, e.pos, '\r\n');
    pos = e.pos + e.len;
  }
  if (pos < s.length) {
    const tail = s.slice(pos).replace(/[ \t]+$/, '');
    seg(pos, s.length, tail.length ? '\r\n' : '');
    if (tail.length) rows.push({ line, kind: 'final_newline', before: '', after: 'CRLF', note: 'file did not end with a line end' });
  }
  if (lf || cr) rows.unshift({ line: firstEol, kind: 'eol', before: [lf ? `LF x${lf}` : '', cr ? `CR x${cr}` : ''].filter(Boolean).join(' '), after: 'CRLF', note: 'line ends to CRLF' });
  return { out, rows };
}

module.exports = {
  id: 'fmt',
  title: 'CRLF line ends, no trailing spaces/tabs, final newline',
  fmtText, escapedEol,
  plan(ctx) {
    const changes = [], cases = [];
    for (const F of ctx.model.files.values()) {
      if (!F.scope) continue;
      const s = ctx.read(F.rel).toString('latin1');
      const x = escapedEol(s);
      if (x >= 0) { cases.push({ id: 'fmt-escaped-eol', title: `${F.rel}: a string escapes its line end`, detail: `byte ${x}: '\\' before a line end inside a string; line ends left as they are` }); continue; }
      const r = fmtText(s);
      if (r.out !== s) changes.push({ file: F.rel, after: Buffer.from(r.out, 'latin1'), create: false, rows: r.rows });
    }
    return { changes, cases };
  },
};

// sdl: tokenizer + block tree for AS2 SDL text (.lng .info .def .set .mi ...). → sdl/reader
// errors go to onError(line, code, msg); codes: STR_NEWLINE BRACES WARN_ESCAPE. tools remap codes as they like.
// Author: Imperator_Aug (ARSENAL, ia-c1d90980)
const ESC = { n: '\n', t: '\t', '"': '"', '\\': '\\' };

// lines: string[] (from enc.readText). opts.resync: 'eol' (default) ends an unclosed string at end of line;
// 'nextQuote' treats the next line's first quote as its close (one report for a string broken over lines)
// → tokens { t: '{' | '}' | 's' | 'w', v, line, col }
function tokenize(lines, onError = () => {}, opts = {}) {
  const toks = [];
  let open = null; // string token left open by previous line (resync 'nextQuote')
  for (let ln = 0; ln < lines.length; ln++) {
    const L = lines[ln], line = ln + 1;
    let i = 0;
    if (open) {
      const q = L.search(/(?<!\\)"/);
      if (q < 0) continue;
      i = q + 1; open = null;
    }
    while (i < L.length) {
      const c = L[i];
      if (c === ';') break;
      if (c === '{' || c === '}') { toks.push({ t: c, line, col: i + 1 }); i++; continue; }
      if (c === ' ' || c === '\t' || c === '\r' || c === '\n' || c === '\v' || c === '\f') { i++; continue; }
      if (c === '"') {
        let v = '', j = i + 1, closed = false;
        while (j < L.length) {
          const d = L[j];
          if (d === '\\' && j + 1 < L.length) {
            const e = L[j + 1];
            if (!(e in ESC)) onError(line, 'WARN_ESCAPE', `unknown escape '\\${e}' (known: \\" \\\\ \\n \\t)`);
            v += ESC[e] ?? e; j += 2;
          } else if (d === '"') { closed = true; j++; break; }
          else { v += d; j++; }
        }
        const tok = { t: 's', v, line, col: i + 1 };
        toks.push(tok);
        if (!closed) {
          onError(line, 'STR_NEWLINE', 'string not closed before end of line (strings never span lines)');
          if (opts.resync === 'nextQuote') open = tok;
        }
        i = j; continue;
      }
      // a word ends at ASCII blanks only. Other Unicode spaces (U+00A0 = cp1251 byte A0, U+3000 from a Chinese IME, U+FEFF) are word
      // characters here [I]. The old /\s/ test stopped at them without skipping them: an empty word, forever.
      let j = i; while (j < L.length && !/[ \t\r\n\v\f{}";]/.test(L[j])) j++;
      if (j === i) j++;   // never stand still
      toks.push({ t: 'w', v: L.slice(i, j), line, col: i + 1 }); i = j;
    }
  }
  return toks;
}

// block tree. node { name, line, vals: [tok], kids: [node] }; root node has name null, line 0.
// first word/string after `{` = name. reports unclosed/stray braces as BRACES.
function parse(toks, onError = () => {}) {
  const root = { name: null, line: 0, vals: [], kids: [] }, stack = [root];
  let named = true;
  for (const k of toks) {
    const cur = stack[stack.length - 1];
    if (k.t === '{') { const n = { name: null, line: k.line, vals: [], kids: [] }; cur.kids.push(n); stack.push(n); named = false; }
    else if (k.t === '}') { if (stack.length === 1) onError(k.line, 'BRACES', 'stray close brace'); else stack.pop(); named = true; }
    else if (!named) { cur.name = k.v; named = true; }
    else cur.vals.push(k);
  }
  while (stack.length > 1) { const n = stack.pop(); onError(n.line, 'BRACES', `block "${n.name ?? ''}" never closed`); }
  return root;
}

// convenience: lines → tree
const parseLines = (lines, onError, opts) => parse(tokenize(lines, onError, opts), onError);

// child blocks named `name` (case-insensitive, as engine keys)
const kids = (node, name) => node.kids.filter(k => (k.name ?? '').toLowerCase() === name.toLowerCase());

module.exports = { tokenize, parse, parseLines, kids };

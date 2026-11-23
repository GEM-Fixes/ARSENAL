// mapkit sdl: small readers over tools/lib/sdlx.js trees (node kinds BLOCK, IDENT, STRING, INTEGER, FLOAT, MOD).
//   parse(src, key, buf?) -> {root, errors:[{file, line, code, msg}]}   includes resolved through src.read (vfs only)
//   words(b) -> head values of a block (IDENT text, STRING value, numbers as numbers)
//   blocks(b) -> child blocks (MOD contents inline, disabled blocks left out)
//   kids(b, name) / kid(b, name) -> child blocks whose first word is name (case-blind)
//   val(b, name, k) -> word k of the first child named name (undefined when absent)
//   num(x) -> finite number | null;  text(b) -> one-line SDL text form of a block (covers raw)
// Author: Imperator_Aug (ARSENAL, ia-fb25a213)
'use strict';
const sdlx = require('../../../lib/sdlx');

function parse(src, key, buf) {
  const errors = [];
  const b = buf || src.read(key);
  const r = sdlx.read(b, {
    file: key, key,
    open: (q) => {
      const k = q && typeof q === 'object' ? q.key : String(q);
      if (!k || !src.has(k)) return null;
      return { buf: src.read(k), file: k, key: k };
    },
    onError: (file, line, code, msg) => errors.push({ file, line, code, msg }),
  });
  return { root: r.root, errors };
}

function flat(items, out) {
  for (const x of items) {
    if (x.k === 'MOD') flat(x.items || [], out);
    else out.push(x);
  }
  return out;
}
function items(b) { return b && b.items ? flat(b.items, []) : []; }
function wordOf(x) {
  if (x.k === 'STRING') return x.value;
  if (x.k === 'IDENT') return x.text;
  if (x.k === 'INTEGER' || x.k === 'FLOAT') return x.value;
  return undefined;
}
function words(b) { return items(b).filter(x => x.k !== 'BLOCK').map(wordOf); }
function blocks(b) { return items(b).filter(x => x.k === 'BLOCK' && !x.disabled); }
function head(b) { const w = words(b); return w.length ? String(w[0]).toLowerCase() : ''; }
function kids(b, name) { const n = name.toLowerCase(); return blocks(b).filter(x => head(x) === n); }
function kid(b, name) { return kids(b, name)[0] || null; }
function val(b, name, k) { const x = kid(b, name); return x ? words(x)[k === undefined ? 1 : k] : undefined; }
function num(x) { return typeof x === 'number' && Number.isFinite(x) ? x : null; }

function text(b) {
  const parts = [];
  for (const x of items(b)) {
    if (x.k === 'BLOCK') { parts.push(text(x)); continue; }
    if (x.k === 'STRING') parts.push('"' + String(x.text != null ? x.text : x.value) + '"');
    else if (x.k === 'IDENT' || x.k === 'INTEGER' || x.k === 'FLOAT') parts.push(String(x.text != null ? x.text : x.value));
  }
  return '{' + parts.join(' ') + '}';
}

module.exports = { parse, words, blocks, kids, kid, val, num, head, text, items };

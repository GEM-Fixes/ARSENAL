// sdldiff: semantic SDL flatten for overdiff/drift/conflicts. rows: VFS-01 VFS-41
//   flatten(tree | Buffer | string, opt?) -> Map path -> { val, sem, line }
//     tree = sdlx.read(...).root. path = "name/child/..." (name = first scalar item of a block, `#` if none, `mod [!]name`
//     for (mod) blocks; repeats get "[n]"). val = display text of the remaining scalar items; sem = compare string:
//     numbers by value (1.4 == 1.40 == 1.4e0), strings by decoded value, whitespace-insensitive.
//   parse(Buffer | string, { key?, file?, open? }) -> Map   sdlx.read + flatten; open(rk) resolves includes (default: none);
//     an include or macro call that does not resolve adds '(unresolved)/include <kind:key>' or '(unresolved)/macro <name>'
//   sameValue(a, b) -> bool   a, b = flatten entries (or undefined = absent): equal sem; both absent = same
// Author: Imperator_Aug (ARSENAL, ia-0819d435)
const sdlx = require('./sdlx');

const SCALAR = new Set(['IDENT', 'STRING', 'INTEGER', 'FLOAT']);
const txt = n => n.k === 'STRING' ? '"' + n.text + '"' : n.text;
const semTok = n => n.k === 'INTEGER' || n.k === 'FLOAT' ? (Number.isFinite(n.value) ? '#' + n.value : n.text) : n.k === 'STRING' ? '"' + n.value : n.text;

function flattenTree(root) {
  const out = new Map();
  (function walk(items, prefix, st) {
    let seen = null;
    for (let i = st; i < items.length; i++) {
      const n = items[i];
      if (n.k !== 'BLOCK' && n.k !== 'MOD') continue;
      const kids = n.items || [];
      let name, from = 0;
      if (n.k === 'MOD') name = 'mod ' + (n.not ? '!' : '') + n.name;
      else if (kids.length && SCALAR.has(kids[0].k)) { name = txt(kids[0]); from = 1; }
      else name = '#';
      const base = prefix ? prefix + '/' + name : name;
      if (!seen) seen = new Map();
      const c = (seen.get(base) || 0) + 1; seen.set(base, c);
      const p = c > 1 ? base + '[' + c + ']' : base;
      let val = '', sem = '', any = false;
      for (let j = from; j < kids.length; j++) { const x = kids[j]; if (!SCALAR.has(x.k)) continue; if (any) { val += ' '; sem += ' '; } any = true; val += txt(x); sem += semTok(x); }
      out.set(p, { val, sem, line: n.line });
      walk(kids, p, from);
    }
  })(root.items, '', 0);
  return out;
}

function parse(input, opt) {
  opt = opt || {};
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(String(input), 'latin1');
  const key = opt.key || 'resource/x.def';
  // (list) directives that do not resolve (include not opened, macro defined elsewhere) leave no tree node, so two files that
  // differ only there flattened equal (COV-REPLAY). Each one becomes an entry '(unresolved)/<what>' so sameValue sees the gap.
  const unres = [];
  const onError = (file, line, code, msg) => { if (code === 'INCLUDE_MISSING' || code === 'MACRO_UNDEFINED') unres.push({ line, what: code === 'INCLUDE_MISSING' ? 'include ' + (/resolved ([^)]*)\)/.exec(msg) || [, msg])[1] : 'macro ' + (/"([^"]*)"/.exec(msg) || [, msg])[1] }); };
  const r = sdlx.read(buf, { file: opt.file || key, key, open: opt.open || (() => null), onError });
  const out = flattenTree(r.root), n = new Map();
  for (const u of unres) { const b = '(unresolved)/' + u.what, c = (n.get(b) || 0) + 1; n.set(b, c); out.set(c > 1 ? b + '[' + c + ']' : b, { val: u.what, sem: u.what, line: u.line }); }
  return out;
}

function flatten(x, opt) {
  if (Buffer.isBuffer(x) || typeof x === 'string') return parse(x, opt);
  return flattenTree(x.root && !x.items ? x.root : x);
}

const sameValue = (a, b) => (!a && !b) || (!!a && !!b && a.sem === b.sem);

module.exports = { flatten, parse, sameValue };

// macrostd/expand: sdlx expansion of one root over a side (a folder overlaid on vanilla), serialized for comparison.
//   side = makeSide({ dir, vanilla, gameDir, fallback?: side, fallbackIf?(key) })   files of <dir>/resource/** win over vanilla;
//     a key the dir lacks goes to fallback when fallbackIf(key) (the before-snapshot holds only text: other files come from the mod)
//     side.has(key) side.get(key) -> Buffer|null (cached: every include is read once per side)  side.local Map key -> abs
//   expand(side, key, preInclude[]) -> { toks:[string], errs:[{code,file,line,msg}] } | null (no such file)
//     toks: node kinds, tags, texts, numeric text and order; no file/line/via/whitespace/comments
//   firstDiff(a, b) -> null | { i, path, a, b }      pathAt(toks, i) -> 'blockname/blockname[n]'
// Author: Imperator_Aug (ARSENAL, ia-a3fccf1d)
const fs = require('fs'), path = require('path');
const sdlx = require('../lib/sdlx');
const { walkFiles, relPath } = require('../lib/report');

function makeSide(o) {
  const local = new Map();
  const res = path.join(o.dir, 'resource');
  if (fs.existsSync(res)) for (const f of walkFiles(res, /./)) local.set(relPath(o.dir, f).toLowerCase(), f);
  const cache = new Map();
  const get = key => {
    if (cache.has(key)) return cache.get(key);
    let b = null;
    if (local.has(key)) b = fs.readFileSync(local.get(key));
    else if (o.fallback && o.fallbackIf && o.fallbackIf(key) && o.fallback.local.has(key)) b = o.fallback.get(key);
    else if (o.vanilla) b = o.vanilla.read(key);
    cache.set(key, b);
    return b;
  };
  const has = key => local.has(key) || !!(o.fallback && o.fallbackIf && o.fallbackIf(key) && o.fallback.local.has(key)) || !!(o.vanilla && o.vanilla.has(key));
  const open = (r) => {
    if (r.kind === 'fs') { const p = path.join(o.gameDir || '.', r.key); return fs.existsSync(p) ? { buf: fs.readFileSync(p), file: r.key, key: r.key } : null; }
    if (r.kind === 'user') return null;
    const b = get(r.key);
    return b ? { buf: b, file: r.key, key: r.key } : null;
  };
  return { local, get, has, open, dir: o.dir };
}

function flatten(node, out) {
  for (const it of node.items) {
    if (it.k === 'BLOCK') { out.push('{' + (it.tag ? '#' + it.tag : '')); flatten(it, out); out.push('}'); }
    else if (it.k === 'MOD') { out.push('(mod ' + (it.not ? 'not ' : '') + it.name); flatten(it, out); out.push(')'); }
    else if (it.k === 'STRING') out.push('"' + it.text + '"');
    else out.push(it.text);
  }
  return out;
}

function expand(side, key, pre) {
  const buf = side.get(key);
  if (!buf) return null;
  const errs = [];
  let r;
  try { r = sdlx.read(buf, { file: key, key, open: side.open, preInclude: pre || [], onError: (file, line, code, msg) => errs.push({ code, file, line, msg }) }); }
  catch (x) { errs.push({ code: 'READER_THROW', file: key, line: 0, msg: String(x && x.message) }); return { toks: [], errs }; }
  return { toks: flatten(r.root, []), errs };
}

function pathAt(toks, i) {
  const st = [];
  for (let k = 0; k < i && k < toks.length; k++) {
    const t = toks[k];
    if (t[0] === '{' || t.startsWith('(mod ')) st.push(toks[k + 1] && toks[k + 1] !== '}' ? toks[k + 1] : t);
    else if (t === '}' || t === ')') st.pop();
  }
  return st.join('/') || '(top)';
}
function firstDiff(a, b) {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return { i, path: pathAt(a[i] === undefined ? b : a, i), a: a[i] === undefined ? '(end)' : a[i], b: b[i] === undefined ? '(end)' : b[i] };
  return null;
}
const errKey = errs => errs.map(e => e.code).sort().join(' ');

module.exports = { makeSide, expand, flatten, firstDiff, pathAt, errKey };

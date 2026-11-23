// lnginc: .lng reader with (include "path") expansion, as the engine reads text files (LOC-21: expands includes
//   before walks the keys). Key = file prefix + group names joined by '/', lower-cased (LOC-03); the prefix is
//   the file's folder under the text root + its title, '#' files get no title (LOC-10). Later duplicate wins (LOC-04).
// API:
//   keyPrefix(vpath) -> 'desc/' | 'mission/single/x/y/' | '' ('#' file at the root)      vpath = path under the text root
//   expandIncludes(src, vpath, opts) -> { lines, origin:[{file,line}], fatal, files:[file] }
//     src: file path or Buffer of the root file. Each `(include "p")` outside strings and ';' comments is replaced by the lines of p:
//     a plain path is relative to the folder of the file holding the include (virtual), a leading '/' is the resource root; the text
//     root is /interface/text/. Includes nest. Problems go to opts.onError(code, msg, {file, line}), never thrown:
//       INCLUDE_MISSING INCLUDE_CYCLE INCLUDE_DEPTH INCLUDE_FATAL (UTF-16 file) DEFINE_SKIPPED ((define ..) not expanded here)
//     opts.textDir: real folder of the text root (a mod's localization/); opts.resDir: real folder of resource/ (for rooted paths
//     outside /interface/text/); opts.open(vkey) -> {buf, file} | null replaces both (vkey 'resource/...', case as written)
//   parseLng(src, vpath, opts) -> { root, lines, origin, fatal }   tree of nodes {name, nameTok, open, close, vals, kids, line}
//     (lib/sdl tokens; open/close = the brace tokens, so callers can cut a leaf's source text out of `lines`)
//   readLngKeys(src, vpath, opts) -> Map lowerKey -> {key, txt, line, file}   (line, file = where the leaf sits after expansion)
//     a file with no include gives exactly tools/lnglint/vcompare.js readKeys (+ file)
// Author: Imperator_Aug (ARSENAL, ia-f2041bb0)
const fs = require('fs'), path = require('path');
const { readText } = require('./enc'), sdl = require('./sdl');

const TEXT_ROOT = 'resource/interface/text/';
const MAX_DEPTH = 32;

function keyPrefix(vpath) {
  const p = String(vpath).replace(/\\/g, '/');
  const base = path.posix.basename(p, path.posix.extname(p)), dir = path.posix.dirname(p);
  return (dir === '.' ? '' : dir + '/') + (base.startsWith('#') ? '' : base + '/');
}

// virtual include target: 'resource/...'
function resolveVkey(p, fromVkey) {
  let s = String(p).replace(/\\/g, '/'), parts;
  if (s.startsWith('/')) parts = ('resource' + s).split('/');
  else { parts = fromVkey.split('/'); parts.pop(); parts = parts.concat(s.split('/')); }
  const out = [];
  for (const seg of parts) { if (seg === '..') out.pop(); else if (seg !== '.' && seg !== '') out.push(seg); }
  return out.join('/');
}

function defaultOpen(opts) {
  return vkey => {
    const low = vkey.toLowerCase();
    let f = null;
    if (low.startsWith(TEXT_ROOT) && opts.textDir) f = path.join(opts.textDir, vkey.slice(TEXT_ROOT.length));
    else if (low.startsWith('resource/') && opts.resDir) f = path.join(opts.resDir, vkey.slice('resource/'.length));
    if (!f) return null;
    try { if (!fs.statSync(f).isFile()) return null; return { buf: fs.readFileSync(f), file: f }; } catch { return null; }
  };
}

// one line -> [{text}|{inc, col}] pieces; strings and ';' comments are not searched
const INC = /^\(\s*include\s+"([^"]*)"\s*\)/i;
function splitLine(L) {
  const out = []; let i = 0, s = 0;
  while (i < L.length) {
    const c = L[i];
    if (c === ';') break;
    if (c === '"') { i++; while (i < L.length && L[i] !== '"') i += L[i] === '\\' ? 2 : 1; i++; continue; }
    if (c === '(') {
      const m = INC.exec(L.slice(i));
      if (m) { out.push({ text: L.slice(s, i) }); out.push({ inc: m[1], col: i + 1 }); i += m[0].length; s = i; continue; }
      if (/^\(\s*define\b/i.test(L.slice(i))) out.push({ define: true, col: i + 1 });
    }
    i++;
  }
  if (!out.length) return null;
  out.push({ text: L.slice(s) });
  return out;
}

function expandIncludes(src, vpath, opts = {}) {
  const onError = opts.onError || (() => {});
  const open = opts.open || defaultOpen(opts);
  const lines = [], origin = [], files = [];
  const rootFile = Buffer.isBuffer(src) ? (opts.file || vpath) : src;
  const r0 = readText(src, 'utf8');
  if (r0.fatal) return { lines, origin, fatal: r0.fatal, files };
  files.push(rootFile);
  const walk = (r, file, vkey, stack) => {
    r.lines.forEach((L, i) => {
      const pieces = L.includes('(') ? splitLine(L) : null;
      if (!pieces) { lines.push(L); origin.push({ file, line: i + 1 }); return; }
      for (const p of pieces) {
        if (p.define) { onError('DEFINE_SKIPPED', '(define ..) in a text file: not expanded here (LOC-21)', { file, line: i + 1 }); continue; }
        if (p.text !== undefined) { lines.push(p.text); origin.push({ file, line: i + 1 }); continue; }
        const vk = resolveVkey(p.inc, vkey), at = { file, line: i + 1 };
        if (stack.includes(vk.toLowerCase())) { onError('INCLUDE_CYCLE', `include "${p.inc}" loops back (${[...stack, vk.toLowerCase()].join(' -> ')})`, at); continue; }
        if (stack.length >= MAX_DEPTH) { onError('INCLUDE_DEPTH', `include "${p.inc}" nested deeper than ${MAX_DEPTH}`, at); continue; }
        const o = open(vk);
        if (!o) { onError('INCLUDE_MISSING', `include "${p.inc}" not found (/${vk.replace(/^resource\//, '')})`, at); continue; }
        const r = readText(o.buf, 'utf8');
        if (r.fatal) { onError('INCLUDE_FATAL', `include "${p.inc}": ${r.fatal}`, at); continue; }
        files.push(o.file);
        walk(r, o.file, vk, [...stack, vk.toLowerCase()]);
      }
    });
  };
  const vk0 = TEXT_ROOT + String(vpath).replace(/\\/g, '/');
  walk(r0, rootFile, vk0, [vk0.toLowerCase()]);
  return { lines, origin, fatal: null, files };
}

// lib/sdl parse with the name token and both brace tokens kept per node
function parseTokens(toks) {
  const root = { name: null, nameTok: null, line: 0, vals: [], kids: [], open: null, close: null }, stack = [root];
  let named = true;
  for (const k of toks) {
    const cur = stack[stack.length - 1];
    if (k.t === '{') { const n = { name: null, nameTok: null, line: k.line, vals: [], kids: [], open: k, close: null }; cur.kids.push(n); stack.push(n); named = false; }
    else if (k.t === '}') { if (stack.length > 1) { cur.close = k; stack.pop(); } named = true; }
    else if (!named) { cur.name = k.v; cur.nameTok = k; named = true; }
    else cur.vals.push(k);
  }
  return root;
}

function parseLng(src, vpath, opts = {}) {
  const x = expandIncludes(src, vpath, opts);
  if (x.fatal) return { root: null, lines: [], origin: [], fatal: x.fatal, files: x.files };
  const onSdl = opts.onSdlError || (() => {});
  const toks = sdl.tokenize(x.lines, (line, code, msg) => onSdl(line, code, msg, x.origin[line - 1]), { resync: 'nextQuote' });
  return { root: parseTokens(toks), lines: x.lines, origin: x.origin, fatal: null, files: x.files };
}

function readLngKeys(src, vpath, opts = {}) {
  const keys = new Map();
  const p = parseLng(src, vpath, opts);
  if (p.fatal) return keys;
  const prefix = keyPrefix(vpath);
  const visit = (n, kp) => {
    const key = kp + n.name;
    if (n.kids.length) return n.kids.forEach(c => visit(c, key + '/'));
    const o = p.origin[n.line - 1] || { file: null, line: n.line };
    keys.set(key.toLowerCase(), { key, txt: n.vals.filter(v => v.t === 's').map(v => v.v).join(''), line: o.line, file: o.file });
  };
  for (const t of p.root.kids) {
    if (!t.name) continue;
    if (t.name.toLowerCase() === 'tags') t.kids.forEach(c => visit(c, prefix)); else visit(t, prefix);
  }
  return keys;
}

module.exports = { keyPrefix, resolveVkey, expandIncludes, parseLng, readLngKeys, TEXT_ROOT };

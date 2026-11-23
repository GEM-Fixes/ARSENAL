// macrostd step samedef: entity .def files that are byte-identical to another .def in the SAME folder share one body file.
//   The group's root block keeps its open line (`{game_entity`) and close line in every def; the lines between go once to
//   <folder>/<common>_body.inc (common = longest common prefix of the def names, trimmed of '_' '-'; never an existing mod or
//   vanilla path; one tab less indent) and each def becomes:  ; same as the other <n> defs here; body in <common>_body.inc / {game_entity /
//   \t(include "<common>_body.inc") / }.  Relative includes and {Extension "x.mdl"} inside the body resolve from the .inc's folder =
//   the def's folder (FMT-22, KEY-27, SDL-58); the entity title stays the def file name (ENG-04); the reader expands the include
//   at token level inside the block ( -> BlockStart/ReadIdentifier, modweb sdl/reader) [T in game].
//   Groups across folders are left (a case when the def has > 20 lines). Skipped (counted, case): '{' '}' imbalance, a byte >= 0x80
//   outside comments, root block not on its own lines, more than one top-level block, no saving in lines.
//   exports toks(s) (byte-exact token list with comments, used by the volumes step too).
// Author: Imperator_Aug (ARSENAL, ia-4bc84796)
const crypto = require('crypto');

// tokens: { k: '{' '}' '(' ')' 'S' (string) 'W' (word) 'C' (comment), a, b }   '=' is whitespace (scan.js rules)
function toks(s) {
  const out = [], n = s.length;
  let i = 0;
  while (i < n) {
    const c = s.charCodeAt(i);
    if (c === 59) { let j = i; while (j < n && s.charCodeAt(j) !== 10 && s.charCodeAt(j) !== 13) j++; out.push({ k: 'C', a: i, b: j }); i = j; continue; }
    if (c === 32 || c === 9 || c === 10 || c === 13 || c === 61) { i++; continue; }
    if (c === 123 || c === 125 || c === 40 || c === 41) { out.push({ k: s[i], a: i, b: i + 1 }); i++; continue; }
    if (c === 34) {
      let q = i + 1, bad = false;
      for (;;) {
        if (q >= n) { bad = true; break; }
        const d = s.charCodeAt(q);
        if (d === 92) { q += 2; continue; }
        if (d === 10 || d === 13) { bad = true; break; }
        if (d === 34) { q++; break; }
        q++;
      }
      out.push({ k: 'S', a: i, b: Math.min(q, n), bad }); i = Math.min(q, n); continue;
    }
    let q = i + 1;
    while (q < n) { const d = s.charCodeAt(q); if (d === 32 || d === 9 || d === 10 || d === 13 || d === 61 || d === 59 || d === 34 || d === 40 || d === 41 || d === 123 || d === 125) break; q++; }
    out.push({ k: 'W', a: i, b: q }); i = q;
  }
  return out;
}

const lineStarts = s => { const ls = [0]; for (let k = 0; k < s.length; k++) { const c = s.charCodeAt(k); if (c === 10) ls.push(k + 1); else if (c === 13 && s.charCodeAt(k + 1) !== 10) ls.push(k + 1); } return ls; };
const eolOf = s => { const m = /\r\n|\n|\r/.exec(s); return m ? m[0] : '\r\n'; };
const countLines = s => s.length ? s.split(/\r\n|\n|\r/).length - (/[\r\n]$/.test(s) ? 1 : 0) : 0;

// split a def into { pre, open, inner:[lines], close } or { why }
function splitDef(s) {
  const T = toks(s);
  if (T.some(t => t.k === 'S' && t.bad)) return { why: 'shape' };
  let bal = 0;
  for (const t of T) { if (t.k === '{') bal++; else if (t.k === '}') bal--; }
  if (bal !== 0) return { why: 'imbalance' };
  // bytes >= 0x80 outside comments (identifiers/strings): left alone
  let lastEnd = 0;
  for (const t of T) { if (t.k === 'C') { if (/[\x80-\xff]/.test(s.slice(lastEnd, t.a))) return { why: 'cp1251' }; lastEnd = t.b; } }
  if (/[\x80-\xff]/.test(s.slice(lastEnd))) return { why: 'cp1251' };
  // top level: directives (paren groups) then exactly one block, then comments only
  let i = 0, open = -1, close = -1;
  while (i < T.length) {
    const t = T[i];
    if (t.k === 'C') { i++; continue; }
    if (t.k === '(') { let d = 0; for (; i < T.length; i++) { if (T[i].k === '(') d++; else if (T[i].k === ')' && --d === 0) break; } i++; if (open >= 0) return { why: 'shape' }; continue; }
    if (t.k === '{') {
      if (open >= 0) return { why: 'shape' };
      open = i;
      let d = 0; for (; i < T.length; i++) { if (T[i].k === '{') d++; else if (T[i].k === '}' && --d === 0) break; }
      if (i >= T.length) return { why: 'imbalance' };
      close = i; i++; continue;
    }
    return { why: 'shape' };
  }
  if (open < 0) return { why: 'shape' };
  const ls = lineStarts(s), lineOf = p => { let lo = 0, hi = ls.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (ls[m] <= p) lo = m; else hi = m - 1; } return lo; };
  const oL = lineOf(T[open].a), cL = lineOf(T[close].a);
  if (!/^[ \t]*$/.test(s.slice(ls[oL], T[open].a)) || !/^[ \t]*$/.test(s.slice(ls[cL], T[close].a))) return { why: 'shape' };
  // the open line holds the class word (and nothing that opens/closes); the close line only '}' + comment
  const onOpen = T.filter((t, k) => k > open && lineOf(t.a) === oL);
  if (!onOpen.length || onOpen[0].k !== 'W' || onOpen.some(t => '{}()'.includes(t.k))) return { why: 'shape' };
  if (T.some((t, k) => k > close && t.k !== 'C' && lineOf(t.a) === cL)) return { why: 'shape' };
  if (cL - oL < 2) return { why: 'shape' };
  const lineAt = l => s.slice(ls[l], l + 1 < ls.length ? ls[l + 1] : s.length);
  const inner = [];
  for (let l = oL + 1; l < cL; l++) inner.push(lineAt(l).replace(/(\r\n|\n|\r)$/, ''));
  return { pre: s.slice(0, ls[oL]), open: lineAt(oL), inner, close: s.slice(ls[cL]) };
}

function commonName(names) {
  let p = names[0];
  for (const x of names) { let k = 0; while (k < p.length && k < x.length && p[k] === x[k]) k++; p = p.slice(0, k); }
  p = p.replace(/^[_\-.\s]+|[_\-.\s]+$/g, '');
  return p || names.slice().sort()[0];
}

module.exports = {
  id: 'samedef',
  title: 'byte-identical entity defs in one folder share one _body.inc',
  toks, splitDef, commonName,
  plan(ctx) {
    const m = ctx.model, changes = [], cases = [];
    const stat = { groups: 0, merged: 0, defs: 0, linesBefore: 0, linesAfter: 0, skipped: {}, crossCases: 0, crossSmall: 0 };
    const skip = (why, n = 1) => { stat.skipped[why] = (stat.skipped[why] || 0) + n; };
    const byHash = new Map();
    for (const F of m.files.values()) {
      if (!F.scope || !/^resource\/entity\/.*\.def$/.test(F.key) || !ctx.exists(F.rel)) continue;
      const b = ctx.read(F.rel);
      const h = crypto.createHash('sha1').update(b).digest('hex');
      if (!byHash.has(h)) byHash.set(h, []);
      byHash.get(h).push({ F, s: b.toString('latin1') });
    }
    const taken = new Set();
    const groups = [...byHash.values()].filter(g => g.length > 1).sort((a, b) => a[0].F.key < b[0].F.key ? -1 : 1);
    for (const g of groups) {
      stat.groups++;
      const dirOf = k => k.slice(0, k.lastIndexOf('/'));
      const byDir = new Map();
      for (const x of g) { const d = dirOf(x.F.key); if (!byDir.has(d)) byDir.set(d, []); byDir.get(d).push(x); }
      const nLines = countLines(g[0].s);
      if (byDir.size > 1) {
        if (nLines > 20) {
          stat.crossCases++;
          cases.push({ id: 'samedef-cross', title: `${g.length} identical defs (${nLines} lines) in ${byDir.size} folders`, detail: 'relative includes / Extension resolve per folder, left as is: ' + g.map(x => x.F.rel).join(', ') });
        } else stat.crossSmall++;
      }
      for (const [dir, xs] of byDir) {
        if (xs.length < 2) continue;
        xs.sort((a, b) => a.F.key < b.F.key ? -1 : 1);
        const sp = splitDef(xs[0].s);
        const rels = xs.map(x => x.F.rel);
        if (sp.why) { skip(sp.why); cases.push({ id: 'samedef-' + sp.why, title: `${xs.length} identical defs in ${dir} not merged (${sp.why})`, detail: rels.join(', ') }); continue; }
        const names = xs.map(x => x.F.rel.slice(x.F.rel.lastIndexOf('/') + 1).replace(/\.def$/i, ''));
        const common = commonName(names);
        if (!/^[\x21-\x7e]+$/.test(common) || /["%\\/;(){}]/.test(common)) { skip('name'); cases.push({ id: 'samedef-name', title: `${dir}: no usable common name "${common}"`, detail: rels.join(', ') }); continue; }
        const folderRel = xs[0].F.rel.slice(0, xs[0].F.rel.lastIndexOf('/'));
        let inc, k = 1;
        for (;;) {
          inc = common + '_body' + (k > 1 ? '_' + k : '') + '.inc';
          const rel = folderRel + '/' + inc, key = rel.toLowerCase();
          if (!taken.has(key) && !m.files.has(key) && !ctx.exists(rel) && !ctx.vanilla.has(key)) break;
          k++;
        }
        const incRel = folderRel + '/' + inc;
        const eol = eolOf(xs[0].s);
        const defText = `; same as the other ${xs.length - 1} def${xs.length > 2 ? 's' : ''} here; body in ${inc}` + eol + sp.pre + sp.open + `\t(include "${inc}")` + eol + sp.close;
        const incText = sp.inner.map(l => l.replace(/^\t/, '')).join(eol) + eol;
        const before = nLines * xs.length, after = countLines(defText) * xs.length + countLines(incText);
        if (after >= before) { skip('no_gain'); continue; }
        taken.add(incRel.toLowerCase());
        stat.merged++; stat.defs += xs.length; stat.linesBefore += before; stat.linesAfter += after;
        changes.push({ file: incRel, after: Buffer.from(incText, 'latin1'), create: true, rows: [{ line: 1, kind: 'create', before: '', after: inc, note: `body of ${xs.length} identical defs (${sp.inner.length} lines)` }] });
        for (const x of xs) changes.push({ file: x.F.rel, after: Buffer.from(defText, 'latin1'), create: false, rows: [{ line: 1, kind: 'samedef', before: `${nLines} lines`, after: `(include "${inc}")`, note: `same as ${xs.length - 1} other defs here` }] });
      }
    }
    if (!ctx.opts || !ctx.opts.quiet) process.stderr.write(`samedef: ${stat.groups} identical groups; ${stat.merged} same-folder groups merged (${stat.defs} defs, lines ${stat.linesBefore} -> ${stat.linesAfter}, -${stat.linesBefore - stat.linesAfter}); skipped ${JSON.stringify(stat.skipped)}; cross-folder > 20 lines ${stat.crossCases}, <= 20 lines ${stat.crossSmall}\n`);
    module.exports.lastStat = stat;
    return { changes, cases };
  },
};

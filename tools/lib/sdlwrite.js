// sdlwrite: byte-exact SDL editor (splices on original text, no re-print) → sdl/roundtrip
// Author: Imperator_Aug (ARSENAL, ia-09b58e13)

//   const t = parse(buf)         → { src, root, splices }   syntactic tree only, NO macro/include expansion
//   serialize(t)                 → Buffer, byte-identical to buf when no edit was made
//   find(t|node, 'a/b[1]/c')     → first node by block/list name path (case-insens; [n] = nth same-name sibling) | null
//   findAll(t|node, 'a/b')       → all matches
//   setValue(node, text, idx=1)  atom/string: replace its text. block/list: replace item idx (0 = name), append if missing
//   insertChild(parent, index, text)  new item text (e.g. '{x 1}') before parent.items[index]; indent copied from sibling
//   removeNode(node)             drop node (whole lines when it is alone on them; comments above are left)
// node: { type:'atom'|'string'|'block'|'list'|'stray', start, end (exclusive), text, name (block/list: first item text,
//   lowercase), tag ('#x' of {#x), items[], closed, parent }. edits are recorded as splices against the ORIGINAL text;
//   serialize applies them; to edit further, parse the result again (node spans refer to the original).
// text args: latin1 string or Buffer. UTF-16/32 BOM → throws (engine aborts, rule 1). UTF-8 BOM kept untouched.
const { bomKind } = require('./enc');

const isDelim = c => c === 32 || c === 9 || c === 13 || c === 10 || c === 61 || c === 59 || c === 123 || c === 125 || c === 40 || c === 41 || c === 34;

function parse(buf) {
  const bk = bomKind(buf);
  if (bk && bk !== 'utf8') throw new Error(bk + ' BOM: engine aborts; resave as UTF-8/cp1251');
  const src = buf.toString('latin1'), n = src.length;
  const root = { type: 'block', start: 0, end: n, items: [], closed: true, root: true, name: '', parent: null };
  let stack = [root], i = bk === 'utf8' ? 3 : 0;
  const top = () => stack[stack.length - 1];
  const add = nd => { nd.parent = top(); top().items.push(nd); };
  while (i < n) {
    const c = src.charCodeAt(i);
    if (c === 10 || c === 13 || c === 32 || c === 9 || c === 61) { i++; continue; }
    if (c === 59) { while (i < n && src.charCodeAt(i) !== 10 && src.charCodeAt(i) !== 13) i++; continue; }
    if (c === 123 || c === 40) {
      const nd = { type: c === 123 ? 'block' : 'list', start: i, end: n, items: [], closed: false, tag: null, name: '' };
      i++;
      if (c === 123 && src.charCodeAt(i) === 35) { const t0 = i; i++; while (i < n && !isDelim(src.charCodeAt(i))) i++; nd.tag = src.slice(t0, i); }
      add(nd); stack.push(nd); continue;
    }
    if (c === 125 || c === 41) {
      const want = c === 125 ? 'block' : 'list';
      // close nearest matching open; stray closers (incl. mismatched ')' inside '{') are kept as stray atoms (rule 11)
      let k = stack.length - 1;
      while (k > 0 && stack[k].type !== want) k--;
      if (k > 0 && (want === 'block' || k === stack.length - 1)) {
        while (stack.length - 1 > k) stack.pop();
        const nd = stack.pop(); nd.end = i + 1; nd.closed = true; nd.closeStart = i;
      } else add({ type: 'stray', start: i, end: i + 1, text: src[i] });
      i++; continue;
    }
    if (c === 34) {
      let j = i + 1;
      while (j < n) {
        const d = src.charCodeAt(j);
        if (d === 92) { j += 2; continue; }
        if (d === 34 || d === 10 || d === 13) break;
        j++;
      }
      if (j > n) j = n;
      const e = src.charCodeAt(j) === 34 ? j + 1 : j;
      add({ type: 'string', start: i, end: e, text: src.slice(i, e) });
      i = e; continue;
    }
    let j = i + 1;
    while (j < n && !isDelim(src.charCodeAt(j))) j++;
    add({ type: 'atom', start: i, end: j, text: src.slice(i, j) });
    i = j;
  }
  // unclosed (EOF) containers: end stays n; closeStart = n
  (function fix(nd) {
    if (!nd.closed) nd.closeStart = n;
    else if (nd.closeStart === undefined && !nd.root) nd.closeStart = nd.end - 1;
        if (nd.items[0] && (nd.items[0].type === 'atom' || nd.items[0].type === 'string')) {
      let t = nd.items[0].text; if (nd.items[0].type === 'string') t = t.replace(/^"|"$/g, '');
      nd.name = t.toLowerCase();
    }
    for (const k of nd.items) if (k.items) fix(k);
  })(root);
  const t = { src, root, bom: bk === 'utf8', splices: [], orig: Buffer.from(buf) };
  root._t = t;
  return t;
}

function serialize(t) {
  if (!t.splices.length) return Buffer.from(t.orig);
  const sp = t.splices.map((s, k) => ({ s, k })).sort((a, b) => a.s.start - b.s.start || a.s.end - b.s.end || a.k - b.k).map(x => x.s);
  let out = '', pos = 0;
  for (const s of sp) {
    if (s.start < pos) continue; // overlapped by an earlier removal/replace: dropped
    out += t.src.slice(pos, s.start) + s.text; pos = s.end;
  }
  return Buffer.from(out + t.src.slice(pos), 'latin1');
}

const str = x => Buffer.isBuffer(x) ? x.toString('latin1') : String(x);
const rootOf = nd => { while (nd.parent) nd = nd.parent; return nd; };

function matchPath(start, path, all) {
  const segs = Array.isArray(path) ? path : String(path).split('/').filter(Boolean);
  let cur = [start];
  for (const seg of segs) {
    const m = /^(.*?)(?:\[(\d+)\])?$/.exec(seg), nm = m[1].toLowerCase(), nth = m[2] === undefined ? -1 : +m[2];
    const nxt = [];
    for (const p of cur) {
      const hit = p.items.filter(k => (k.type === 'block' || k.type === 'list') && (k.name === nm || (k.name && k.name[0] === '"' && k.name.slice(1, -1) === nm))); // COV-MIX6: .lng {"hints" ..} names keep their quotes
      if (nth >= 0) { if (hit[nth]) nxt.push(hit[nth]); } else nxt.push(...hit);
    }
    cur = nxt;
  }
  return cur;
}
const findAll = (t, path) => matchPath(t.root ? t.root : t, path);
const find = (t, path) => findAll(t, path)[0] || null;

function detectEol(t, at) {
  const m = /\r\n|\r|\n/.exec(t.src.slice(at));
  if (m) return m[0];
  const m2 = /\r\n|\r|\n/.exec(t.src);
  return m2 ? m2[0] : '\r\n';
}
const lineStart = (src, p) => { while (p > 0 && src[p - 1] !== '\n' && src[p - 1] !== '\r') p--; return p; };
const lineEnd = (src, p) => { while (p < src.length && src[p] !== '\n' && src[p] !== '\r') p++; return p; };
const afterEol = (src, p) => { if (src[p] === '\r' && src[p + 1] === '\n') return p + 2; return p < src.length ? p + 1 : p; };
const onlyWs = s => /^[ \t=]*$/.test(s);

function put(t, start, end, text, node) {
  if (node) { const ex = t.splices.findIndex(s => s.node === node); if (ex >= 0) t.splices.splice(ex, 1); }
  t.splices.push({ start, end, text, node });
}

const tOf = node => rootOf(node)._t;

function setValue0(t, node, text, idx = 1) {
  text = str(text);
  const keepQ = (n, s) => (n.type === 'string' && !/^"/.test(s) && !/[\s{}"]/.test(s)) ? '"' + s + '"' : s; // COV-MIX6B: a quoted value stays quoted (bare mtl diffuse crashes the engine)
  if (node.type === 'atom' || node.type === 'string' || node.type === 'stray') return put(t, node.start, node.end, keepQ(node, text), node);
  const kid = node.items[idx];
  if (kid && kid.type !== 'block' && kid.type !== 'list') return put(t, kid.start, kid.end, keepQ(kid, text), kid);
  if (kid) return put(t, kid.start, kid.start, text + ' ', null);
  const last = node.items[node.items.length - 1];
  if (last) return put(t, last.end, last.end, ' ' + text, null);
  return put(t, node.closeStart, node.closeStart, text, null);
}

function insertChild0(t, parent, index, text) {
  text = str(text);
  const src = t.src, its = parent.items;
  if (index < 0 || index > its.length) index = its.length;
  const ref = its[index] || its[index - 1];
  if (!ref) {
    const cs = parent.closeStart;
    const ls = lineStart(src, parent.start);
    if (lineEnd(src, parent.start) <= cs && lineEnd(src, parent.start) !== lineEnd(src, cs) || src.slice(parent.start, cs).search(/[\r\n]/) >= 0) {
      const ind = /^[ \t]*/.exec(src.slice(ls))[0] + '  ', eol = detectEol(t, parent.start);
      const cls = lineStart(src, cs);
      if (onlyWs(src.slice(cls, cs))) return put(t, cls, cls, ind + text.replace(/\r?\n/g, eol) + eol);
      return put(t, cs, cs, eol + ind + text.replace(/\r?\n/g, eol) + eol);
    }
    return put(t, cs, cs, parent.start + 1 === cs ? text : ' ' + text);
  }
  const ls = lineStart(src, ref.start), ind = src.slice(ls, ref.start);
  const eol = detectEol(t, ref.end);
  const beforeRef = index < its.length;
  if (onlyWs(ind)) {
    const indent = ind.replace(/=/g, ' ');
    const body = indent + text.replace(/\r?\n/g, eol);
    if (beforeRef) {
      // keep comment lines directly above the ref attached to it: insert above them
      let p = ls;
      for (;;) {
        if (p <= 0) break;
        let q = p - 1; if (src[q] === '\n' && src[q - 1] === '\r') q--;
        const pls = lineStart(src, q), pl = src.slice(pls, q);
        if (/^[ \t]*;/.test(pl)) p = pls; else break;
      }
      return put(t, p, p, body + (p === ls ? eol : eol));
    }
    // append after last item
    const le = lineEnd(src, ref.end);
    if (parent.closed && parent.closeStart <= le && parent.closeStart >= ref.end) return put(t, ref.end, ref.end, ' ' + text);
    const at = afterEol(src, le);
    if (at === le) return put(t, le, le, eol + body);   // last line without EOL
    return put(t, at, at, body + eol);
  }
  // inline sibling
  if (beforeRef) return put(t, ref.start, ref.start, text + ' ');
  const le2 = lineEnd(src, ref.end);
  if (!parent.root && parent.closeStart > le2 && /^[ \t=]*(;.*)?$/.test(src.slice(ref.end, le2))) {
    // item list ends the line and the closer is on a later line: new line, parent's indent + 2
    const ind2 = /^[ \t]*/.exec(src.slice(lineStart(src, parent.start)))[0] + '  ', at = afterEol(src, le2);
    return put(t, at, at, ind2 + text.replace(/\r?\n/g, eol) + eol);
  }
  return put(t, ref.end, ref.end, ' ' + text);
}

function removeNode0(t, node) {
  const src = t.src;
  const ls = lineStart(src, node.start), le = lineEnd(src, node.end);
  if (onlyWs(src.slice(ls, node.start)) && onlyWs(src.slice(node.end, le))) return put(t, ls, afterEol(src, le), '', node);
  let s = node.start;
  while (s > 0 && (src[s - 1] === ' ' || src[s - 1] === '\t')) s--;
  if (s === node.start || s === ls) { let e = node.end; while (e < src.length && (src[e] === ' ' || src[e] === '\t')) e++; return put(t, node.start, e, '', node); }
  return put(t, s, node.end, '', node);
}

const setValue = (node, text, idx) => setValue0(tOf(node), node, text, idx);
const insertChild = (parent, index, text) => insertChild0(tOf(parent), parent, index, text);
const removeNode = node => removeNode0(tOf(node), node);
module.exports = { parse, serialize, find, findAll, setValue, insertChild, removeNode };

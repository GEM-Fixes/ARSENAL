'use strict';
// edit.js: in-place edits of a price model text (price_model.inc). Works on byte offsets of the text, so hand comments, blank lines,
// tabs and the line ends (CRLF) stay as they are; only the numbers asked for, or one item line that moves, change.
//   scan(text)                  block tree: {tag, name, start, end, args:[{t:'num'|'str'|'word', v, s, e}], kids:[...]}
//   outline(text)               the editable parts, for a form: numeric child blocks (path + values) and item lists (path + items)
//   applyOps(text, ops)         ops: {op:'set', path:[...], values:[n...]} | {op:'move', item, to:[...]}
//                               | {op:'point', kind:'sp'|'dp', value:n|null} (creates {point_value} when absent; null removes the kind)  -> {text, done, errs}
// path = steps from the top: 'tag' or 'tag:name' (name = the block's first string), e.g. ['price_model','weapon_group:smg','tier:medium','mp']
// Author: Imperator_Aug (ARSENAL, ia-0d950bd8)

function scan(text) {
  const root = { tag: null, name: null, start: 0, end: text.length, args: [], kids: [] };
  const stack = [root];
  let i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    if (ch === ';') { while (i < n && text[i] !== '\n') i++; continue; }
    if (ch === '{') { const b = { tag: null, name: null, start: i, end: -1, args: [], kids: [], parent: stack[stack.length - 1] }; stack[stack.length - 1].kids.push(b); stack.push(b); i++; continue; }
    if (ch === '}') { if (stack.length > 1) { const b = stack.pop(); b.end = i + 1; } i++; continue; }
    if (ch === '"') {
      let j = i + 1; while (j < n && text[j] !== '"' && text[j] !== '\n') j++;
      const cur = stack[stack.length - 1];
      const a = { t: 'str', v: text.slice(i + 1, j), s: i, e: Math.min(j + 1, n) };
      cur.args.push(a); if (cur.name === null && cur.tag !== null) cur.name = a.v;
      i = j + 1; continue;
    }
    if (/\s/.test(ch)) { i++; continue; }
    let j = i; while (j < n && !/[\s{}";]/.test(text[j])) j++;
    const w = text.slice(i, j), cur = stack[stack.length - 1];
    if (cur.tag === null && cur !== root && !cur.args.length) cur.tag = w;
    else cur.args.push({ t: /^-?\d+(\.\d+)?$/.test(w) ? 'num' : 'word', v: w, s: i, e: j });
    i = j;
  }
  return root;
}

const stepOf = b => b.name !== null && b.name !== undefined ? b.tag + ':' + b.name : b.tag;
function find(root, path) {
  let cur = root;
  for (const st of path) {
    const [tag, ...rest] = String(st).split(':'), name = rest.length ? rest.join(':') : null;
    const k = cur.kids.find(b => b.tag === tag && (name === null || b.name === name));
    if (!k) return null;
    cur = k;
  }
  return cur;
}
const pathOf = b => { const p = []; for (let x = b; x && x.tag !== null; x = x.parent) p.unshift(stepOf(x)); return p; };
const nums = b => b.args.filter(a => a.t === 'num');
const isNumBlock = b => !b.kids.length && b.args.length && b.args.every(a => a.t === 'num');

// the editable parts of a model: every block of numbers (with its path) and every {items} list (with its path)
function outline(text) {
  const root = scan(text);
  const numbers = [], lists = [], blocks = [];
  const walk = (b, depth) => {
    for (const k of b.kids) {
      if (!k.tag) continue;
      if (isNumBlock(k)) numbers.push({ path: pathOf(k), values: k.args.map(a => +a.v), line: lineOf(text, k.start) });
      else if (k.tag === 'items') {
        const items = k.args.filter(a => a.t === 'str').map(a => ({ name: a.v, comment: commentAfter(text, a.e) }));
        lists.push({ path: pathOf(k).slice(0, -1), items, line: lineOf(text, k.start) });
      } else {
        if (k.kids.length || k.args.length) blocks.push({ path: pathOf(k), tag: k.tag, name: k.name, label: labelOf(k), strings: k.args.filter(a => a.t === 'str').slice(k.name !== null ? 1 : 0).map(a => a.v), depth });
        walk(k, depth + 1);
      }
    }
  };
  walk(root, 0);
  return { numbers, lists, blocks };
}
function labelOf(b) { const l = b.kids.find(k => k.tag === 'label'); const a = l && l.args.find(x => x.t === 'str'); return a ? a.v : null; }
function lineOf(text, off) { let n = 1; for (let i = 0; i < off; i++) if (text.charCodeAt(i) === 10) n++; return n; }
function commentAfter(text, off) {
  let j = off; while (j < text.length && (text[j] === ' ' || text[j] === '\t')) j++;
  if (text[j] !== ';') return '';
  let e = j; while (e < text.length && text[e] !== '\n' && text[e] !== '\r') e++;
  return text.slice(j + 1, e).trim();
}
const fmt = v => { const x = Math.round(+v * 10000) / 10000; return Object.is(x, -0) ? '0' : String(x); };

function setValues(text, path, values) {
  const root = scan(text), b = find(root, path);
  if (!b) return { err: 'no block ' + path.join(' > ') };
  if (!values.length || values.some(v => typeof v !== 'number' || !isFinite(v))) return { err: 'values must be numbers: ' + path.join(' > ') };
  const ns = nums(b), rep = values.map(fmt).join(' ');
  if (!ns.length) { const at = b.start + 1 + b.tag.length; return { text: text.slice(0, at) + ' ' + rep + text.slice(at) }; }
  return { text: text.slice(0, ns[0].s) + rep + text.slice(ns[ns.length - 1].e) };
}

// move one item line ("name"  ; comment) from its {items} list to the {items} list of the block at `to`
function moveItem(text, item, to) {
  const root = scan(text);
  let src = null, arg = null;
  const look = b => { for (const k of b.kids) { if (src) return; if (k.tag === 'items') { const a = k.args.find(x => x.t === 'str' && x.v === item); if (a) { src = k; arg = a; return; } } look(k); } };
  look(root);
  if (!src) return { err: 'item "' + item + '" is in no {items} list' };
  const tb = find(root, to), dst = tb && tb.kids.find(k => k.tag === 'items');
  if (!dst) return { err: 'no {items} list at ' + to.join(' > ') };
  if (dst === src) return { text };
  // the item's own line, when it stands alone on it (the seed writes one item per line); else just the string
  let ls = arg.s; while (ls > 0 && text[ls - 1] !== '\n') ls--;
  let le = arg.e; while (le < text.length && text[le] !== '\n') le++;
  const own = /^[ \t]*$/.test(text.slice(ls, arg.s)) && /^[ \t]*(;.*)?\r?$/.test(text.slice(arg.e, le));
  const eol = /\r\n/.test(text) ? '\r\n' : '\n';
  let cut, body;
  if (own) { cut = [ls, Math.min(le + 1, text.length)]; body = text.slice(arg.s, le).replace(/\r$/, ''); }
  else { cut = [arg.s, arg.e]; body = text.slice(arg.s, arg.e); }
  // insert before the line holding the target list's closing brace, indented like that line + one tab
  const close = dst.end - 1;
  let cs = close; while (cs > 0 && text[cs - 1] !== '\n') cs--;
  const closeOwn = /^[ \t]*$/.test(text.slice(cs, close));
  const ind = closeOwn ? text.slice(cs, close) + '\t' : '\t';
  const ins = closeOwn ? { at: cs, s: ind + body + eol } : { at: close, s: eol + ind + body + eol };
  // apply the later offset first
  const ops = [{ at: cut[0], del: cut[1] - cut[0], s: '' }, { at: ins.at, del: 0, s: ins.s }].sort((a, b) => b.at - a.at);
  let out = text;
  for (const o of ops) out = out.slice(0, o.at) + o.s + out.slice(o.at + o.del);
  return { text: out };
}

// {point_value {sp N} {dp M}} (model.js): set one kind, creating the block (own line before the closing brace of {price_model}) or the
// kind ({kind N} before the block's closing brace) when absent; value null = remove that kind (the block stays, empty = not set)
const POINT_KINDS = ['sp', 'dp'];
function setPoint(text, kind, value) {
  if (!POINT_KINDS.includes(kind)) return { err: 'unknown point kind ' + kind + ' (sp or dp)' };
  if (value !== null && (typeof value !== 'number' || !isFinite(value) || value < 0)) return { err: 'point value must be a number of 0 or more: ' + kind };
  const root = scan(text), top = find(root, ['price_model']);
  if (!top) return { err: 'no {price_model} block' };
  const pv = top.kids.find(k => k.tag === 'point_value'), cur = pv && pv.kids.find(k => k.tag === kind);
  if (cur) {
    if (value !== null) return setValues(text, ['price_model', 'point_value', kind], [value]);
    let s = cur.start; while (s > pv.start + 1 && (text[s - 1] === ' ' || text[s - 1] === '\t')) s--;
    return { text: text.slice(0, s) + text.slice(cur.end) };
  }
  if (value === null) return { text };
  const blk = '{' + kind + ' ' + fmt(value) + '}';
  if (pv) { const at = pv.end - 1; return { text: text.slice(0, at) + (/[\s{]/.test(text[at - 1]) ? '' : ' ') + blk + text.slice(at) }; }
  const eol = /\r\n/.test(text) ? '\r\n' : '\n', close = top.end - 1;
  let cs = close; while (cs > 0 && text[cs - 1] !== '\n') cs--;
  const line = '\t{point_value ' + blk + '}' + eol;
  if (/^[ \t]*$/.test(text.slice(cs, close))) return { text: text.slice(0, cs) + line + text.slice(cs) };
  return { text: text.slice(0, close) + eol + line + text.slice(close) };
}

function applyOps(text, ops) {
  const errs = [];
  let done = 0;
  for (const o of ops || []) {
    const r = o && o.op === 'set' && Array.isArray(o.path) && Array.isArray(o.values) ? setValues(text, o.path, o.values.map(Number))
      : o && o.op === 'move' && typeof o.item === 'string' && Array.isArray(o.to) ? moveItem(text, o.item, o.to)
      : o && o.op === 'point' && typeof o.kind === 'string' ? setPoint(text, o.kind, o.value === null || o.value === undefined || o.value === '' ? null : Number(o.value))
        : { err: 'unknown edit ' + JSON.stringify(o).slice(0, 80) };
    if (r.err) errs.push(r.err); else { if (r.text !== text) done++; text = r.text; }
  }
  return { text, done, errs };
}

module.exports = { scan, find, outline, setValues, moveItem, setPoint, applyOps };

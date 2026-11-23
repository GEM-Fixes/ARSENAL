// Block structure check shared by test-blocks.js and the ext tests, Test):
//   const BC = require('<repo>/tools/gui/test/blockcheck');
//   BC.checkScreen(root, screenId?) -> list of problems ([] = clean): every control and text in a leaf block, ids well formed and unique,
//     a block sits directly in a container block or the root, a leaf holds no blocks, a control/heading/table/label is never a block,
//     and ids the page's blkApply found twice among new blocks (root._blkdup).
//   BC.pageFns(document) -> {h, blkCls, blkMark, blk, asBlk, fld, card, blkPut}: the real helpers of page.js bound to that document,
//     so an ext test that runs its script in its own fake DOM needs no copies.
// Works on the page fake DOM (fakedom.js), on the smaller ones ext tests use and on a browser DOM: children or childNodes, text nodes
// or own text (_text), with or without classList.add, nextSibling or all(). Everything is feature tested, nothing assumed.
// Author: Imperator_Aug (ARSENAL, ia-24578f09)
'use strict';
const PAGE = require('../page.js');

const CTRL = new Set(['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'CANVAS', 'TABLE', 'SVG']);
const NOBLOCK = new Set([...CTRL, 'THEAD', 'TBODY', 'TR', 'TD', 'TH', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LABEL', 'PRE', 'UL', 'OL', 'LI', 'A', 'SUMMARY', 'OPTION']);
const ID = /^[a-z0-9][a-z0-9.-]{0,79}$/;

const isText = n => !!n && (n.nodeType === 3 || n.tagName === '#TEXT' || n.tagName === '#text');
const tag = n => String((n && n.tagName) || '').toUpperCase();
const kids = n => { const k = n && (Array.isArray(n.childNodes) || (n.childNodes && typeof n.childNodes.length === 'number') ? n.childNodes : n.children); return k ? Array.prototype.slice.call(k) : []; };
const clsOf = n => typeof n.className === 'string' ? n.className : (n.getAttribute && n.getAttribute('class')) || '';
const hasCls = (n, c) => !!n && !isText(n) && (' ' + clsOf(n) + ' ').indexOf(' ' + c + ' ') >= 0;
const attr = (n, k) => { if (!n || isText(n)) return null; if (n.getAttribute) { const v = n.getAttribute(k); if (v != null) return v; } return n.attrs && n.attrs[k] !== undefined ? n.attrs[k] : null; };
const blkId = n => { if (!n || isText(n)) return null; if (n.dataset && n.dataset.blk != null) return String(n.dataset.blk); return attr(n, 'data-blk'); };
const isB = n => blkId(n) != null;
const isBox = n => isB(n) && hasCls(n, 'blc');
const ownText = n => isText(n) ? String((n.nodeValue != null ? n.nodeValue : n.textContent) || '') : (typeof n._text === 'string' ? n._text : '');
const textOf = n => { try { return String(n.textContent || ''); } catch (e) { return ''; } };
const hiddenInput = n => tag(n) === 'INPUT' && String(attr(n, 'type') || n.type || '').toLowerCase() === 'hidden';

// all nodes under root (elements and text nodes), none inside an Arrange bar; parent links kept in a map (some DOMs lack parentNode on text)
function walk(root) {
  const out = [], par = new Map();
  const w = n => { for (const c of kids(n)) { if (!c || hasCls(c, 'blkbar') || hasCls(c, 'arrph') || hasCls(c, 'arrghost')) continue; par.set(c, n); out.push(c); if (!isText(c)) w(c); } };
  w(root); return { out, par };
}
function desc(e) {
  if (isText(e)) return 'text "' + ownText(e).trim().slice(0, 50) + '"';
  const id = attr(e, 'id'), al = attr(e, 'aria-label'), t = (ownText(e) || textOf(e)).trim(), c = clsOf(e).trim();
  return tag(e).toLowerCase() + (id ? '#' + id : '') + (c ? '.' + c.split(/\s+/).join('.') : '') + (al ? ' "' + al.slice(0, 40) + '"' : t ? ' "' + t.slice(0, 40) + '"' : '');
}

function checkScreen(root, screenId) {
  const sid = screenId || (root.dataset && (root.dataset.id || root.dataset.blkroot)) || attr(root, 'data-blkroot') || attr(root, 'data-id') || '?';
  const P = 'screen ' + sid + ': ', probs = [], { out, par } = walk(root);
  const ups = e => { const a = []; for (let n = par.get(e); n; n = n === root ? null : par.get(n)) a.push(n); return a; };
  const blocks = out.filter(isB), seen = {}, holds = new Set();
  for (const b of blocks) { const a = ups(b).find(n => n !== root && isB(n)); if (a && !isBox(a)) holds.add(a); }
  if (!blocks.length) return [P + 'no blocks at all'];
  for (const id of root._blkdup || []) probs.push(P + 'two new blocks had the id "' + id + '" (the apply kept the last)');
  for (const b of blocks) {
    const k = blkId(b);
    if (!ID.test(k)) probs.push(P + 'block id "' + k + '" is not lower case a-z 0-9 . -');
    if (seen[k]) probs.push(P + 'two blocks share the id "' + k + '"'); seen[k] = 1;
    if (NOBLOCK.has(tag(b))) probs.push(P + desc(b) + ' is a block itself; wrap it: blk(id,[el])');
    if (holds.has(b)) probs.push(P + 'leaf block "' + k + '" holds blocks; make it a container (box)');
    const p = par.get(b); if (!(p === root || isBox(p))) probs.push(P + 'block "' + k + '" sits in ' + desc(p) + ', not directly in a container block or the screen');
  }
  for (const e of out) {
    let what = null;
    const up = ups(e);
    if (isText(e)) { if (ownText(e).trim() && !up.some(n => CTRL.has(tag(n)) || tag(n) === 'OPTION')) what = 'text'; }
    else if (CTRL.has(tag(e)) && !hiddenInput(e)) what = 'control';
    else if (ownText(e).trim() && tag(e) !== 'OPTION' && !up.some(n => CTRL.has(tag(n)) || tag(n) === 'OPTION')) what = 'text';   // own text (DOMs without text nodes)
    if (!what) continue;
    const chain = (what === 'text' && !isText(e) ? [e] : []).concat(up), nb = chain.find(n => n === root || isB(n));
    if (!nb || nb === root) { probs.push(P + desc(e) + ' is not inside a block'); continue; }
    if (isBox(nb)) {
      const cap = what === 'text' && tag(nb) === 'DETAILS' && up.some(n => tag(n) === 'SUMMARY' && par.get(n) === nb);   // a fold's own summary = the container's caption
      if (!cap) probs.push(P + desc(e) + ' sits in the container "' + blkId(nb) + '", not in a leaf block');
    }
  }
  return probs;
}

// the page's own source of a top-level function: its line and the continuation lines (they start with a space)
const NAMES = ['h', 'blkCls', 'blkMark', 'blk', 'asBlk', 'fld', 'card', 'blkPut'];
function fnSrc(name) {
  const m = new RegExp('^function ' + name + '\\(.*(?:\\n .*)*', 'm').exec(PAGE);
  if (!m) throw new Error('blockcheck: function ' + name + ' not found in page.js');
  return m[0];
}
function pageFns(document) {
  const src = NAMES.map(fnSrc).join('\n');
  const f = new Function('document', src + '\nreturn {' + NAMES.map(n => n + ':' + n).join(',') + '};');
  const o = f(document); o.src = src; return o;
}

// the page's searchKit (one top-level function, h tx LS from the caller's scope): ext tests that run their script in a stand-in DOM put
// kitSrc() in front of it, so the page's real kit runs there (balance blockcheck.js SHIM)
function kitSrc() { return fnSrc('searchKit'); }

module.exports = { checkScreen, pageFns, kitSrc, fnSrc, NAMES, CTRL, NOBLOCK };

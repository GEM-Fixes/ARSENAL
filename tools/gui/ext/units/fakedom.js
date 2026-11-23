// A small stand-in for the browser, enough to run the Units and Balance page scripts in node: elements, events, the page
// helpers the scripts call (h, tx, api, toast, setMod, S) and the page's own "busy" lock on a card's buttons while a request runs
// (page.js holdCard). userClick() acts like a real mouse: the field that had focus loses it first (a change event when its value
// changed) and a disabled button swallows the click. Requests go straight to the page's server routes.
// Author: Imperator_Aug (ARSENAL, ia-563f25c6)
class Node {
  constructor(tag, doc) { this.tagName = String(tag).toUpperCase(); this.doc = doc; this.childNodes = []; this.parentNode = null; this.attrs = {}; this.dataset = {}; this.style = {}; this.L = {};
    this.className = ''; this._text = ''; this.disabled = false; this.checked = false; this._value = ''; this.selectedIndex = 0; this.title = ''; }
  get children() { return this.childNodes.filter(c => c.tagName !== '#TEXT'); }
  get firstChild() { return this.childNodes[0] || null; }
  get options() { return this.children.filter(c => c.tagName === 'OPTION'); }
  get value() { if (this.tagName === 'SELECT') { const o = this.options[this.selectedIndex]; return o ? o.value : ''; } return this._value; }
  set value(v) { if (this.tagName === 'SELECT') { const i = this.options.findIndex(o => o.value === String(v)); if (i >= 0) this.selectedIndex = i; return; } this._value = v == null ? '' : String(v); }
  get textContent() { return this.tagName === '#TEXT' ? this._text : this._text + this.childNodes.map(c => c.textContent).join(''); }
  set textContent(v) { this.childNodes.forEach(c => { c.parentNode = null; }); this.childNodes = []; this._text = v == null ? '' : String(v); }
  get classList() { return { contains: c => (' ' + this.className + ' ').includes(' ' + c + ' ') }; }
  appendChild(c) { if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = this; this.childNodes.push(c); return c; }
  insertBefore(c, ref) { if (!ref) return this.appendChild(c); if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = this; this.childNodes.splice(this.childNodes.indexOf(ref), 0, c); return c; }
  removeChild(c) { const i = this.childNodes.indexOf(c); if (i >= 0) this.childNodes.splice(i, 1); c.parentNode = null; return c; }
  remove(i) { const o = this.options[i]; if (o) this.removeChild(o); if (this.selectedIndex >= this.options.length) this.selectedIndex = 0; }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k.startsWith('data-')) this.dataset[k.slice(5).replace(/-(\w)/g, (m, c) => c.toUpperCase())] = String(v); if (k === 'disabled') this.disabled = true; else if (k === 'checked') this.checked = true; else if (k === 'value') this.value = v; else if (k === 'title') this.title = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  addEventListener(t, f) { (this.L[t] = this.L[t] || []).push(f); }
  fire(t, ev) { ev = Object.assign({ type: t, target: this, preventDefault() {}, stopPropagation() {} }, ev || {}); (this.L[t] || []).slice().forEach(f => f.call(this, ev)); return ev; }
  click() { if (this.disabled) return; this.doc.clicked = this; try { this.fire('click'); } finally { this.doc.clicked = null; } }
  focus() { const d = this.doc; if (d.activeElement === this) return; d.activeElement = this; this._focusValue = this.value; }
  all(pred, out) { out = out || []; for (const c of this.children) { if (pred(c)) out.push(c); c.all(pred, out); } return out; }
  querySelectorAll(sel) { const t = String(sel).toUpperCase(); return this.all(c => c.tagName === t); }
  text() { return this.textContent; }
}
function makeDom() {
  const doc = { activeElement: null, clicked: null };
  doc.createElement = t => new Node(t, doc);
  doc.createElementNS = (ns, t) => new Node(t, doc);
  doc.createTextNode = s => { const n = new Node('#text', doc); n._text = String(s); return n; };
  doc.body = new Node('body', doc);
  return doc;
}
// run a page script (the client string of tools/gui/ext/<id>) with page helpers; returns {screen, root, env}
function runPage(id, script, lang, opt) {
  const doc = makeDom(), toasts = [], sent = [], screens = {};
  const S = Object.assign({ mod: '', screens, cur: id }, opt.S || {});
  const LSm = {}; const LS = { get: (k, d) => k in LSm ? LSm[k] : d, set: (k, v) => { LSm[k] = v; } };
  const tx = (k, p) => { let s = lang.en[k]; if (s == null) return k; return p ? s.replace(/\{(\w+)\}/g, (m, n) => p[n] == null ? m : String(p[n])) : s; };
  // h and the block helpers as page.js has them: blk = leaf block, blk + box = container; no Arrange here
  const h = (tag, attrs, kids) => { const e = doc.createElement(tag); if (attrs) for (const k in attrs) { const v = attrs[k]; if (v == null || v === false || k === 'blk' || k === 'box') continue;
    if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v); else if (v === true) e.setAttribute(k, ''); else e.setAttribute(k, v); }
    if (attrs && attrs.blk != null) blkMark(e, attrs.blk, attrs.box);
    (kids || []).forEach(c => { if (c == null) return; e.appendChild(typeof c === 'string' ? doc.createTextNode(c) : c); }); return e; };
  const blkMark = (e, id, box) => { e.setAttribute('data-blk', String(id)); e.className = (e.className ? e.className + ' ' : '') + 'blk' + (box ? ' blc box-' + box : ''); return e; };
  const blk = (id, kids, o) => { o = o || {}; const a = Object.assign({}, o.attrs || {}); if (o.class) a.class = o.class; const e = h(o.tag || 'div', a, kids); if (o.name) e.setAttribute('data-blkname', o.name); return blkMark(e, id, o.box); };
  const asBlk = (e, id, o) => { o = o || {}; if (o.name) e.setAttribute('data-blkname', o.name); return blkMark(e, id, o.box); };
  const fld = (id, label, ctl, o) => { o = o || {}; return blk(id, [h('label', { class: 'f' + (o.chk ? ' chk' : ''), title: o.title || null, 'data-f': o.f || null }, [h('span', { class: 'n' + (o.req ? ' req' : ''), text: label, title: o.title || null }), ctl, o.after || h('span')])], { class: 'fld', name: label }); };
  const card = (id, kids, o) => { o = o || {}; return blk(id, kids, { box: 'col', class: 'card' + (o.class ? ' ' + o.class : ''), attrs: o.attrs, name: o.name }); };
  const blkPut = (c, e, ref) => { if (ref && ref.parentNode === c) c.insertBefore(e, ref); else c.appendChild(e); return e; };
  const cardOf = e => { while (e && !e.classList.contains('card')) e = e.parentNode; return e || null; };
  // page.js holdCard: a POST started by a click greys the buttons of that card until the reply
  const api = (url, body) => {
    const c = doc.clicked && cardOf(doc.clicked), held = [];
    if (body !== undefined && c) c.querySelectorAll('button').forEach(b => { if (!b.disabled) { b.disabled = true; b.dataset.apiBusy = '1'; held.push(b); } });
    const rel = () => held.forEach(b => { delete b.dataset.apiBusy; b.disabled = b.dataset.blocked === '1' || b.dataset.cardBusy === '1'; });
    sent.push({ url, body });
    const p = Promise.resolve().then(() => opt.route(url, body));
    return p.then(j => { rel(); return j; }, e => { rel(); throw e; });
  };
  const env = { document: doc, window: { as2Help: {}, URL: {} }, S, LS, tx, h, api, toast: m => toasts.push(m), pick: (m, s, cb) => opt.pickDir && cb(opt.pickDir),
    blk, asBlk, fld, card, blkPut, blkApply: () => {},
    show: () => {}, setMod: p => { S.mod = p || ''; Object.keys(screens).forEach(k => { const s = screens[k]; if (s.refresh) s.refresh(); }); }, EXT_SCREENS: {}, Blob: function () {} };
  if (opt.noSetMod) delete env.setMod;
  Object.assign(env, opt.env || {});   // other page helpers a script needs (fmtBytes, gameDir ..)
  // the page's real searchKit (page.js) when the script uses it and does not bring it (the Balance SHIM brings it)
  if (/\bsearchKit\(/.test(script) && !/function searchKit\(/.test(script)) script = require('../../test/blockcheck').kitSrc() + '\n' + script;
  // the kit's Browse calls searchKit.picker (page.js sets it): P.picker(fn) sets it here, fn(spec, done) sees what a Browse click sends
  const kitRef = {};
  new Function('__kitRef', ...Object.keys(env), script + '\n;if(typeof searchKit==="function")__kitRef.k=searchKit;')(kitRef, ...Object.values(env));
  const root = doc.createElement('div'); doc.body.appendChild(root);
  const screen = env.EXT_SCREENS[id](root); screens[id] = screen;
  const picker = f => { if (!kitRef.k) throw new Error('fakedom: the page has no searchKit'); kitRef.k.picker = f; };
  return { screen, root, env, doc, S, toasts, sent, picker };
}
// a real mouse click: focus leaves the old field first (change event when its value changed), a disabled button swallows it
function userClick(doc, el) {
  const a = doc.activeElement;
  if (a && a !== el && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA') && a.value !== a._focusValue) { a._focusValue = a.value; a.fire('change'); }
  el.focus();
  if (el.disabled) return false;
  el.click(); return true;
}
function type(doc, input, text) { input.focus(); input.value = text; input.fire('input'); }
const find = (root, pred) => root.all(pred);
const byText = (root, tag, text) => root.all(c => c.tagName === tag.toUpperCase() && c.textContent === text);
const settle = () => new Promise(r => setTimeout(r, 30));
// the structure rules of tools/gui/test/test-blocks.js (checkScreen) on a screen root, for the parts a screen draws after a server
// reply (test-blocks sees only the first build). Returns the problems as lines; [] = fine
// (the shared tools/gui/test/blockcheck.js, which reads this DOM's childNodes and own _text)
const BC = require('../../test/blockcheck');
const checkBlocks = root => BC.checkScreen(root);
module.exports = { makeDom, runPage, userClick, type, find, byText, settle, checkBlocks };

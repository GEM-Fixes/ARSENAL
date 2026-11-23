// A small fake DOM, just enough to run tools/gui/page.js under node (no browser): elements, attributes, listeners, ids, a few selectors.
// Not a browser: layout, focus rules and CSS do not exist here. Used only by test-gui2.js.
// Author: Imperator_Aug (ARSENAL, ia-207d9cab)
class El {
  constructor(tag, doc) {
    this.tagName = String(tag).toUpperCase(); this.doc = doc; this.children = []; this.attrs = {}; this.listeners = {}; this.style = {}; this.dataset = {};
    this.className = ''; this._v = ''; this._vset = false; this.checked = false; this.hidden = false; this.open = false; this.disabled = false; this.parentNode = null; this._t = '';
    const self = this;
    this.classList = {
      add(c) { const s = new Set(self.className.split(/\s+/).filter(Boolean)); s.add(c); self.className = [...s].join(' '); },
      remove(c) { self.className = self.className.split(/\s+/).filter(x => x && x !== c).join(' '); },
      contains(c) { return self.className.split(/\s+/).includes(c); },
    };
  }
  setAttribute(k, v) {
    this.attrs[k] = String(v);
    if (k === 'class') this.className = String(v);
    else if (k === 'id') this.doc.ids.set(String(v), this);
    else if (k === 'hidden') this.hidden = true;
    else if (k === 'open') this.open = true;
    else if (k === 'value') this.value = String(v);
    else if (k.startsWith('data-')) this.dataset[k.slice(5)] = String(v);
  }
  removeAttribute(k) { delete this.attrs[k]; if (k === 'hidden') this.hidden = false; else if (k.startsWith('data-')) delete this.dataset[k.slice(5)]; }
  getAttribute(k) { return this.attrs[k] === undefined ? null : this.attrs[k]; }
  addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); }
  fire(t, ev) { const e = Object.assign({ type: t, target: this, preventDefault() {}, stopPropagation() {} }, ev); (this.listeners[t] || []).forEach(f => f.call(this, e)); if (typeof this['on' + t] === 'function') this['on' + t].call(this, e); }
  click() { if (!this.disabled) this.fire('click'); }
  appendChild(c) { if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = this; this.children.push(c); return c; }
  removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentNode = null; return c; }
  insertBefore(c, ref) {   // like a browser: a ref that is not a child of this node throws (null/undefined ref appends)
    if (ref && this.children.indexOf(ref) < 0) { const e = new Error("Failed to execute 'insertBefore' on 'Node': The node before which the new node is to be inserted is not a child of this node."); e.name = 'NotFoundError'; throw e; }
    if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = this; const i = ref ? this.children.indexOf(ref) : -1; if (i < 0) this.children.push(c); else this.children.splice(i, 0, c); return c; }
  // a select that was never given a value shows its first option, as in a browser (the option's value attribute, else its text)
  get value() { if (this.tagName === 'SELECT' && !this._vset) { const o = this.children.find(c => c.tagName === 'OPTION'); return o ? (o.attrs.value !== undefined ? o.value : o.textContent) : ''; } return this._v; }
  set value(v) { this._v = v; this._vset = true; }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  get firstChild() { return this.children[0] || null; }
  get textContent() { return this.tagName === '#TEXT' ? this._t : this.children.map(c => c.textContent).join(''); }
  set textContent(v) { for (const c of this.children) c.parentNode = null; this.children = []; if (this.tagName === '#TEXT') { this._t = String(v); return; } if (v !== '' && v != null) this.appendChild(this.doc.createTextNode(String(v))); }
  focus() { this.doc.activeElement = this; }
  scrollIntoView() {}
  showModal() { this.open = true; }
  close() { this.open = false; }
  all() { const out = []; const w = n => { for (const c of n.children) { out.push(c); w(c); } }; w(this); return out; }
  querySelectorAll(sel) { const m = parseSel(sel); return this.all().filter(m); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  // test helpers
  byText(text, tag) { return this.all().find(e => (!tag || e.tagName === tag.toUpperCase()) && e.textContent === text) || null; }
  has(text) { return this.textContent.includes(text); }
}
// selector: tag? (.class)* ([attr] | [attr=val])*  e.g. button[data-run]  dialog[open]  section  .q-panel  button.dflt
function parseSel(sel) {
  const m = /^([a-z0-9]*)((?:\.[\w-]+)*)((?:\[[\w-]+(?:=[^\]]*)?\])*)$/i.exec(sel.trim());
  if (!m) throw new Error('fakedom: selector not supported: ' + sel);
  const tag = m[1].toUpperCase(), cls = m[2].split('.').filter(Boolean), attrs = [...m[3].matchAll(/\[([\w-]+)(?:=([^\]]*))?\]/g)].map(x => [x[1], x[2]]);
  return e => (!tag || e.tagName === tag) && cls.every(c => e.classList.contains(c)) && attrs.every(([k, v]) => {
    const val = k === 'open' ? (e.open ? '' : undefined) : k.startsWith('data-') ? e.dataset[k.slice(5)] : e.attrs[k];   // dataset writes show as data-* attributes, as in a browser
    return v === undefined ? val !== undefined : val === v;
  });
}
function make() {
  const doc = { ids: new Map(), activeElement: null, listeners: {} };
  doc.createElement = t => new El(t, doc);
  doc.createTextNode = s => { const e = new El('#text', doc); e._t = String(s); return e; };
  doc.getElementById = i => doc.ids.get(i) || null;
  doc.addEventListener = (t, f) => { (doc.listeners[t] = doc.listeners[t] || []).push(f); };
  doc.body = new El('body', doc); doc.activeElement = doc.body;
  doc.documentElement = new El('html', doc);   // W5: the theme switch sets data-theme here
  doc.querySelectorAll = s => doc.body.querySelectorAll(s);
  doc.querySelector = s => doc.body.querySelector(s);
  // the static skeleton of the page (ids the script looks up)
  const mk = (tag, id, extra) => { const e = doc.createElement(tag); e.setAttribute('id', id); if (extra) Object.assign(e, extra); doc.body.appendChild(e); return e; };
  for (const [t, i] of [['nav', 'nav'], ['div', 'subnav'], ['main', 'main'], ['div', 'nabox'], ['span', 'gamebar'], ['span', 'runoff'], ['span', 'modchip'], ['span', 'runstate'], ['label', 'advbox'], ['div', 'pagenav'], ['button', 'advchip'], ['div', 'toast'], ['header', 'hdr'], ['div', 'games'], ['button', 'modchg'], ['button', 'hdmore'], ['span', 'themebox'], ['span', 'community'], ['a', 'skip'], ['div', 'pkerr'], ['div', 'pklist'], ['input', 'pkpath'], ['span', 'pkhint'], ['button', 'pkup'], ['button', 'pkgo'], ['button', 'pkview'], ['button', 'pkuse'], ['button', 'pkno'], ['input', 'pkq'], ['button', 'pkx']]) mk(t, i);
  mk('button', 'cancel').hidden = true; doc.getElementById('pkerr').hidden = true; mk('dialog', 'pk');
  doc.fire = (type, ev) => (doc.listeners[type] || []).forEach(f => f(Object.assign({ type, target: doc.body, preventDefault() {}, stopPropagation() {} }, ev)));   // a document-level event (pointermove, pointerup)
  doc.key = (key, extra) => (doc.listeners.keydown || []).forEach(f => f(Object.assign({ key, altKey: false, ctrlKey: false, preventDefault() {} }, extra)));
  return doc;
}
module.exports = { make, El };

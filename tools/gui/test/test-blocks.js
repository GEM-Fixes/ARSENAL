// Blocks test: every screen of the page is built in the fake DOM (no server, no browser, no game).
//   node tools/gui/test/test-blocks.js
// 1. structure, for each screen not on ALLOW: every visible control (button, input, select, textarea, canvas, table) and every text with
//    content sits in a LEAF block; block ids are unique in the screen and well formed; a block sits directly in a container block or in
//    the screen; a leaf holds no blocks; a control, table, heading or label is never a block itself (it is wrapped).
//    ALLOW = screens not converted yet. A batch that converts a screen takes it off ALLOW; a screen on ALLOW that passes is reported.
// 2. Arrange: the header switch, bars with named buttons, controls inert, move up/down (buttons and arrow keys), into the next box,
//    drag and drop, hide and show, Esc ends it; the arrangement is stored in the active profile (window settings, key layout).
// 3. Profiles: applied on load (unknown ids ignored, blocks the profile does not name keep their default place) and after a redraw;
//    Save as, overwrite asks, Rename, Delete asks, Reset this screen, import (checked, overwrite asks).
// 4. CSS: wrapping containers, hidden blocks stay hidden, nothing positioned absolutely in the block rules.
// Last line PASS on success.
// Author: Imperator_Aug (ARSENAL, ia-1cb743bd)
'use strict';
const vm = require('vm'), fakedom = require('./fakedom'), contract = require('../contract'), settings = require('../settings');
const html = require('../page.js'), en = require('../lang/en.json'), BC = require('./blockcheck');

// screens not converted to blocks yet: the batches of empty this list
const ALLOW = new Set([]);

let fails = 0, passes = 0;
const ok = (c, m, extra) => { if (c) passes++; else { fails++; console.log('FAIL ' + m + (extra !== undefined ? '\n  ' + String(extra).slice(0, 1500) : '')); } };
const tick = () => new Promise(r => setImmediate(r));
const clone = o => JSON.parse(JSON.stringify(o));

function boot(serverSettings, extra) {
  const doc = fakedom.make(), store = new Map(), server = Object.assign({}, serverSettings || {}), posts = [], confirms = [];
  const resp = o => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(clone(o)), body: null });
  const ctx = {
    document: doc, console, TextDecoder, setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0,
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
    answer: true, confirm: m => { confirms.push(m); return ctx.answer; },
    fetch: (u, o) => {
      const m = (o && o.method) || 'GET', p = String(u).split('?')[0];
      if (p === '/api/health') return resp({ ok: true, allowLaunch: false, version: 'test' });
      if (p === '/api/commands') return resp({ commands: contract.describe() });
      if (p === '/api/settings' && m === 'GET') return resp({ settings: server, empty: !Object.keys(server).length, file: '' });
      if (p === '/api/settings' && m === 'POST') { const b = JSON.parse(o.body); Object.assign(server, b.set); posts.push(b.set); return resp({ ok: true }); }
      if (p === '/api/game') return resp({ dir: '', tried: [], ok: false, codes: ['none'] });
      return new Promise(() => {});   // everything else stays pending: the screens are checked as built
    },
  };
  Object.assign(ctx, extra || {});
  ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(/<script>([\s\S]*)<\/script>/.exec(html)[1], ctx, { filename: 'page.js:script' });
  return { doc, ctx, store, server, posts, confirms };
}
async function ready(P) { for (let i = 0; i < 400 && !P.ctx.__as2gui; i++) await tick(); if (!P.ctx.__as2gui) throw new Error('page did not finish building: ' + P.doc.getElementById('main').textContent.slice(0, 300)); }

const isB = e => !!(e && e.dataset && e.dataset.blk != null);
const isBox = e => isB(e) && e.classList.contains('blc');
// the structure rules live in blockcheck.js (shared with the ext tests)
const checkScreen = sec => BC.checkScreen(sec, sec.dataset.id);

// a small fake DOM like the ext tests use: childNodes, own text in _text, no classList.add, no nextSibling, no all()
function miniDom() {
  class N {
    constructor(t, d) { this.tagName = String(t).toUpperCase(); this.doc = d; this.childNodes = []; this.parentNode = null; this.attrs = {}; this.dataset = {}; this.className = ''; this._text = ''; this.L = {}; }
    get children() { return this.childNodes.filter(c => c.tagName !== '#TEXT'); }
    get textContent() { return this.tagName === '#TEXT' ? this._text : this._text + this.childNodes.map(c => c.textContent).join(''); }
    set textContent(v) { this.childNodes = []; this._text = v == null ? '' : String(v); }
    get classList() { return { contains: c => (' ' + this.className + ' ').includes(' ' + c + ' ') }; }
    setAttribute(k, v) { this.attrs[k] = String(v); if (k.startsWith('data-')) this.dataset[k.slice(5)] = String(v); }
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
    addEventListener(t, f) { (this.L[t] = this.L[t] || []).push(f); }
    appendChild(c) { if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = this; this.childNodes.push(c); return c; }
    insertBefore(c, r) { if (!r) return this.appendChild(c); if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = this; this.childNodes.splice(this.childNodes.indexOf(r), 0, c); return c; }
    removeChild(c) { const i = this.childNodes.indexOf(c); if (i >= 0) this.childNodes.splice(i, 1); c.parentNode = null; return c; }
  }
  const d = {}; d.createElement = t => new N(t, d); d.createTextNode = s => { const n = new N('#text', d); n._text = String(s); return n; }; return d;
}

// the additions of the second foundation round: shared check, double ids after a redraw, bars after a redraw, ncols, names, 800 px,
// hidden containers skipped by Arrange, fakedom remove() and select value
async function more() {
  const css = /<style>([\s\S]*?)<\/style>/.exec(html)[1];
  // ---- 1. blockcheck: the real page helpers in a small DOM, and the shared rules
  {
    const d = miniDom(), F = BC.pageFns(d), root = d.createElement('section'); root.setAttribute('data-blkroot', 'x');
    ok(['h', 'blk', 'asBlk', 'fld', 'card', 'blkPut'].every(n => typeof F[n] === 'function') && /function blkMark\(/.test(F.src), 'blockcheck.pageFns gives the page helpers for any document');
    const sel = F.h('select', {}, [F.h('option', { text: 'one' })]);
    root.appendChild(F.card('c1', [F.blk('c1.title', [F.h('h3', { text: 'Card' })]), F.fld('c1.f', 'Name', sel)]));
    F.blkPut(root, F.h('div', { blk: 'grid', box: 'ncols' }, [F.blk('g.a', ['left']), F.blk('g.b', ['right'])]), null);
    ok(BC.checkScreen(root, 'x').length === 0 && / blc box-col/.test(' ' + root.childNodes[0].className) && root.childNodes[1].className === 'blk blc box-ncols', 'page helpers work in a DOM without classList.add and the shared check passes it', BC.checkScreen(root, 'x').join('\n'));
    const bare = d.createElement('button'); bare.textContent = 'bare'; root.appendChild(bare);
    const txt = d.createElement('b'); txt.textContent = 'loose'; root.childNodes[0].appendChild(txt);
    root.appendChild(F.blk('g.a', []));
    const pr = BC.checkScreen(root).join('\n');
    ok(/button "bare" is not inside a block/.test(pr) && /b "loose" sits in the container "c1"/.test(pr) && /two blocks share the id "g.a"/.test(pr) && /^screen x: /.test(pr), 'the shared check finds a bare control, own text in a container and a doubled id in a small DOM', pr);
  }
  ok(/\.blc\.box-ncols\{[^}]*flex-wrap:wrap/.test(css) && /\.blc\.box-ncols>\.blk\{flex:2 1 18em;min-width:min-content\}/.test(css) && /\.blc\.box-ncols>\.blk~\.blk\{flex:3 1 24em\}/.test(css), 'box ncols: wrapping columns, the first one narrow, the others wide');

  // ---- a page with a profile: gi.title moved into gen.opts, gen.where moved into gi; a fake MutationObserver and timer queue
  const obs = [], q = [];
  class MO { constructor(cb) { this.cb = cb; obs.push(this); } observe(r) { this.r = r; } }
  const L = { v: 1, active: 'P', profiles: { P: { screens: { make: { o: { 'gen.opts': ['gi.title'], gi: ['gi.what', 'gen.where'] }, hid: [] } } } } };
  const R = await (async () => { const X = boot({ 'as2gui.layout': L }, { MutationObserver: MO }); await ready(X); return X; })();
  const d = R.doc, X = R.ctx.as2Blocks, mk = d.getElementById('main').children.find(s => s.dataset.id === 'make');
  const all = id => mk.all().filter(e => isB(e) && e.dataset.blk === id), B = id => all(id)[0], rootIds = () => mk.children.filter(isB).map(b => b.dataset.blk);
  ok(B('gi.title').parentNode === B('gen.opts') && B('gen.where').parentNode === B('gi'), 'profile applied on load (setup)');
  // ---- 2. a redraw while a block sits elsewhere
  {
    const old = B('gi.title'), nt = X.blk('gi.title', [d.createElement('h3')]); B('gi').insertBefore(nt, B('gi').children[0]);
    X.apply(mk);
    ok(all('gi.title').length === 1 && all('gi.title')[0] === nt && nt.parentNode === B('gen.opts') && !old.parentNode, 'a block drawn again while the old copy sits elsewhere: the new one takes the old place, the old one goes');
    const oldGi = B('gi'), at = rootIds().indexOf('gi');
    const ng = X.blk('gi', [X.blk('gi.what', [d.createElement('span')])], { box: 'col' }); mk.appendChild(ng);
    X.apply(mk);
    ok(all('gi').length === 1 && B('gi') === ng && rootIds().indexOf('gi') === at && !oldGi.parentNode, 'a container drawn again takes the old one place', rootIds().join());
    ok(B('gen.where') && B('gen.where').parentNode === ng && all('gi.what').length === 1 && all('gi.doc').length === 0, 'a block the user moved into the old container moves into the new one; the old default parts not drawn again go');
    mk.appendChild(X.blk('zz', [])); mk.appendChild(X.blk('zz', [d.createTextNode('two')]));
    X.apply(mk);
    ok(all('zz').length === 1 && all('zz')[0].textContent === 'two' && /two new blocks had the id "zz"/.test(checkScreen(mk).join()), 'two new blocks with one id: the last stays, the check names the fault');
    mk._blkdup = undefined;
    ok(X.drop(mk, 'zz') === 1 && !all('zz').length && X.drop(mk, ['gen.where']) === 1 && !B('gen.where'), 'blkDrop removes blocks by id wherever they are');
    mk.appendChild(X.blk('zz.a', [])); mk.appendChild(X.blk('zz.b', []));
    ok(X.drop(mk, 'zz.*') === 2 && !B('zz.a') && !B('zz.b'), 'blkDrop with a trailing * removes every id with that start');
  }
  // ---- 3. while arranging, a block whose content a redraw cleared gets its bar back (once), new controls are inert
  {
    R.ctx.as2Link('page:make'); X.arrange(true);
    const lf = B('gen.btns'), barN = () => lf.children.filter(k => k.classList.contains('blkbar')).length, o = obs.find(m => m.r === mk);
    ok(o && barN() === 1, 'a screen root is watched, a leaf has one bar');
    const bar = lf.children.find(k => k.classList.contains('blkbar')); lf.textContent = '';
    const st = R.ctx.setTimeout; R.ctx.setTimeout = f => { q.push(f); return 1; };
    o.cb([{ addedNodes: [], removedNodes: [bar] }]); o.cb([{ addedNodes: [], removedNodes: [] }]);
    const btn = d.createElement('button'); btn.textContent = 'again'; lf.appendChild(btn); o.cb([{ addedNodes: [btn], removedNodes: [] }]);
    ok(q.length === 1, 'one fix per burst of changes', q.length);
    q.splice(0).forEach(f => f()); R.ctx.setTimeout = st;
    ok(barN() === 1 && btn.attrs.inert === '' && lf.children[0].classList.contains('blkbar'), 'after the redraw the bar is back once and the new button is inert');
    o.cb([{ addedNodes: [lf.children[0]], removedNodes: [] }]);
    ok(q.length === 0, 'a bar added by Arrange itself starts nothing');
    // ---- 6. bars and the panel wrap at 800 px: every row wraps, nothing positioned or of fixed width, no item wider than the page
    const rules = css.split('}').filter(r => /blkbar|blkpanel|blkn/.test(r));
    ok(/\.blkbar\{display:flex;flex-wrap:wrap[^}]*max-width:100%/.test(css) && /\.blk>\.blkbar\{flex:0 0 100%\}/.test(css) && /\.blkbar \.blkn\{[^}]*overflow-wrap:anywhere/.test(css), 'an Arrange bar is a wrapping row on a line of its own that never grows past its block');
    ok(!rules.some(r => /position:\s*(absolute|fixed)|(^|[;{])(min-)?width:\s*\d{3,}px|nowrap/.test(r)), 'no bar or panel rule positions, fixes a width or forbids wrapping', rules.join('}\n'));
    const pn = d.getElementById('blkpanel'), more = pn.children.find(k => k.tagName === 'DETAILS'), rows = pn.children.concat(more ? more.children : []).filter(k => k !== more && k.tagName !== 'SUMMARY' && k.children.length > 1);
    ok(rows.length >= 3 && rows.every(k => k.classList.contains('row')) && /\.row\{display:flex;[^}]*flex-wrap:wrap/.test(css) && /\.blkpanel>\.row\{flex-wrap:wrap\}/.test(css), 'every line of the panel is a wrapping row');
    const wide = pn.all().concat(mk.all().filter(e => e.classList && e.classList.contains('blkb'))).filter(e => e.tagName === 'BUTTON' && e.textContent.length * 8 + 24 > 760);
    ok(!wide.length, 'no single bar or panel button is wider than an 800 px page', wide.map(e => e.textContent).join());
    // ---- 7. the box button and drag and drop skip containers that are not shown
    const sh = X.blk('zz.sh', [], { box: 'col' }), hd = X.blk('zz.hd', [], { box: 'col', attrs: { hidden: true } }), wrap = d.createElement('div');
    wrap.hidden = true; const inw = X.blk('zz.inw', [], { box: 'col' });
    const fold = X.blk('zz.fold', [], { box: 'col', tag: 'details' }), shut = X.blk('zz.shut', [], { box: 'col' }); fold.appendChild(shut);
    const tmp = [sh, hd, X.blk('zz.wrap', [wrap], { box: 'col' }), fold]; wrap.appendChild(inw); tmp.forEach(t => mk.appendChild(t)); X.apply(mk);
    const mv = B('gi.what'), seen = new Set();
    for (let i = 0; i < 40; i++) { barOf(mv).children.find(x => x.dataset.blkact === 'box').click(); seen.add(mv.parentNode.dataset.blk || '@'); }
    ok(seen.has('zz.sh') && !seen.has('zz.hd') && !seen.has('zz.inw') && !seen.has('zz.fold') && !seen.has('zz.shut'), 'the box button skips containers hidden, inside a hidden element or in a closed fold', [...seen].join());
    fold.open = true; seen.clear();
    for (let i = 0; i < 40; i++) { barOf(mv).children.find(x => x.dataset.blkact === 'box').click(); seen.add(mv.parentNode.dataset.blk || '@'); }
    ok(seen.has('zz.fold') && seen.has('zz.shut'), 'an open fold is a target again');
    sh.appendChild(mv); const p0 = mv.parentNode;
    barOf(mv).children[0].fire('dragstart', { dataTransfer: { setData() {}, effectAllowed: '' } });
    mk.fire('drop', { target: hd });
    ok(mv.parentNode === p0, 'drag and drop does not drop into a hidden container');
    X.arrange(false);
  }
  // ---- 5. readable default names
  {
    const h = (t, a, k) => { const e = d.createElement(t); if (a && a.text) e.textContent = a.text; for (const x in a || {}) if (x !== 'text') e.setAttribute(x, a[x]); (k || []).forEach(c => e.appendChild(typeof c === 'string' ? d.createTextNode(c) : c)); return e; };
    const nm = b => X.name(b);
    const tbl = X.blk('n1', [h('table', {}, [h('thead', {}, [h('tr', {}, [h('th', { text: 'Mod folder' }), h('th', { text: 'Works on' })])]), h('tbody', {}, [h('tr', {}, [h('td', { text: 'in game' })])])])]);
    ok(nm(tbl) === en['blk.table'].replace('{name}', 'Mod folder'), 'a table is named after its first header', nm(tbl));
    ok(nm(X.blk('n2', [h('span', { text: 'Mod' }), h('span', { text: 'Folder' })])) === 'Mod', 'the first text alone, never texts run together');
    ok(nm(X.blk('n3', [h('div', {}, [h('b', { text: 'x' }), h('h3', { text: 'Units' })])])) === 'Units', 'a heading wins');
    ok(nm(X.card('n4', [X.blk('n4.t', [h('h3', { text: 'Card name' })]), X.blk('n4.b', ['body'])])) === 'Card name', 'a container is named by its heading');
    ok(nm(X.blk('n5', [h('label', {}, [h('span', { text: 'Pick' }), h('select', {}, [h('option', { text: 'Alpha' })])])])) === 'Pick', 'a label gives its own text, not its options');
    ok(nm(X.blk('n6', [h('input', { 'aria-label': 'Filter' }), 'hits'])) === 'Filter', 'a control gives its aria-label');
    ok(nm(X.blk('n7', [])) === en['blk.empty'] && nm(X.blk('n8', [], { name: 'Given' })) === 'Given', 'an empty block says empty; data-blkname comes first');
    ok(nm(X.blk('n9', ['x'.repeat(60)])).length === 42, 'at most 40 characters and dots');
    for (const l of ['en', 'ru', 'uk', 'zh']) { const j = require('../lang/' + l + '.json'); ok(['blk.table', 'blk.tableN', 'blk.empty'].every(k => j[k] && !/ - | – | — |—|–/.test(j[k])) && /\{name\}/.test(j['blk.table']), l + ': table and empty words'); }
  }
  // ---- round 3: no percentage widths on controls inside a block (a percentage counts as 0 in the block's min-content: content spills)
  {
    const CT = /(^|[\s>+~,(])(select|input|textarea)\b/i, PCT = /(^|[;{\s])(min-|max-)?width:[^;}]*%/;
    const rs = css.replace(/\/\*[\s\S]*?\*\//g, '').split('}').map(r => r.split('{')).filter(x => x.length === 2).map(([sel, body]) => ({ sel: sel.trim(), body }));
    const inBlk = rs.filter(r => r.sel.split(',').some(s => /\.(blk|blc|fld)(?![\w-])|\.box-/.test(s) && CT.test(s.trim().split(/[\s>+~]+/).pop())) && PCT.test('{' + r.body));
    ok(!inBlk.length, 'no rule for a control inside a block has a percentage width, min-width or max-width', inBlk.map(r => r.sel + '{' + r.body).join('\n'));
    const glob = rs.filter(r => !/\.(blk|blc)(?![\w-])|#|\[style|\.blkpanel/.test(r.sel) && r.sel.split(',').some(s => CT.test(s.trim())) && PCT.test('{' + r.body));
    const over = rs.find(r => /^\.blk select,\.blk input\[type=text\],\.blk input\[type=number\],\.blk textarea$/.test(r.sel));
    ok(over && /width:auto/.test(over.body) && /min-width:8em/.test(over.body) && /max-width:none/.test(over.body) && glob.every(r => r.sel.split(',').map(s => s.trim()).filter(s => CT.test(s)).every(s => /^(select|textarea|input\[type=(text|number)\])$/.test(s))),
      'page-wide percentage widths on controls are overridden inside blocks by plain lengths', glob.map(r => r.sel).join('\n'));
    ok(/\.blc\.box-row>\.blk\{[^}]*width:max-content;max-width:100%/.test(css) && /\.blk \[style\*=nowrap\]\{white-space:normal!important\}/.test(css), 'a block in a row is as wide as its content up to its container; old inline nowrap wraps inside a block');
  }
  // ---- round 4: a field in a row container is compact (label, control, unit side by side; the leaf does not grow; tick box first)
  {
    const rs = css.replace(/\/\*[\s\S]*?\*\//g, '').split('}').map(r => r.split('{')).filter(x => x.length === 2);
    const rowFld = rs.filter(([s]) => s.split(',').some(x => /box-row>\.fld$/.test(x.trim())));
    ok(rowFld.length === 1 && /flex:0 1 auto/.test(rowFld[0][1]) && /width:max-content/.test(rowFld[0][1]) && /max-width:100%/.test(rowFld[0][1]), 'a field in a row is as wide as its content, never growing to fill the line', rowFld.map(r => r.join('{')).join('\n'));
    ok(!rs.some(([s, b]) => /box-row>\.(fld|blk)\b/.test(s) && /flex:\s*[1-9]/.test(b) && !/blkbar/.test(s)), 'no rule lets a block in a row grow');
    ok(/\.blc\.box-row>\.fld>label\.f,\.blc\.box-row>\.fld>label\.f\.chk\{display:flex;flex-wrap:nowrap;align-items:center;gap:4px 6px/.test(css), 'its label, control and unit sit next to each other with a small gap');
    ok(/\.blc\.box-row>\.fld>label\.f>select,[^{]*>input\[type=number\][^{]*\{width:auto/.test(css) && /\.blc\.box-row>\.fld>label\.f\.chk>input\[type=checkbox\][^{]*\{order:-1\}/.test(css), 'its control keeps its own width and a tick box sits right before its text');
    ok(/\.blk\.fld>label\.f\{margin:0;grid-template-columns:minmax\(min-content,9em\) minmax\(8em,1fr\) auto\}/.test(css), 'a field in a column container still fills the width');
  }
  // ---- round 3: as2Blocks.overlaps finds sibling blocks and leaf children that intersect, and a leaf wider inside than out
  {
    const rect = (l, r) => () => ({ left: l, right: r, top: 0, bottom: 20, width: r - l, height: 20 });
    const a = X.blk('zz.ov.a', []), b = X.blk('zz.ov.b', []), box = X.blk('zz.ov', [a, b], { box: 'row' }); mk.appendChild(box);
    a.getBoundingClientRect = rect(0, 100); b.getBoundingClientRect = rect(99.5, 200);
    ok(!X.overlaps(mk).length, 'overlaps: blocks that touch by under 1px are fine', JSON.stringify(X.overlaps(mk)));
    b.getBoundingClientRect = rect(60, 200);
    const o1 = X.overlaps(mk);
    ok(o1.length === 1 && o1[0].kind === 'overlap' && /zz\.ov\.a/.test(o1[0].a) && /zz\.ov\.b/.test(o1[0].b) && o1[0].screen === 'make' && o1[0].where === 'zz.ov', 'overlaps: two sibling blocks that intersect', JSON.stringify(o1));
    b.getBoundingClientRect = rect(120, 200);
    const sel = d.createElement('select'), t = d.createTextNode(' Show'); a.appendChild(sel); a.appendChild(t);
    sel.getBoundingClientRect = rect(0, 104); t._rects = [{ left: 100, right: 140, top: 2, bottom: 18, width: 40, height: 16 }];
    d.createRange = () => ({ selectNodeContents(n) { this.n = n; }, getClientRects() { return this.n._rects || []; } });
    a.scrollWidth = 140; a.clientWidth = 100;
    const o2 = X.overlaps(mk);
    ok(o2.some(x => x.kind === 'overlap' && /select/.test(x.a) && /text " ?Show"/.test(x.b) && x.where === 'zz.ov.a') && o2.some(x => x.kind === 'overflow' && /zz\.ov\.a/.test(x.a) && x.by === 40), 'overlaps: a control and its text inside a leaf, and a leaf wider inside than out', JSON.stringify(o2));
    box.hidden = true;
    ok(!X.overlaps(mk).length, 'overlaps: a hidden container is not checked');
    mk.removeChild(box); delete d.createRange;
  }
  // ---- 8. fakedom: remove() and a select's default value
  {
    const s = d.createElement('select'), o1 = d.createElement('option'), o2 = d.createElement('option');
    o1.setAttribute('value', 'a'); o2.setAttribute('value', 'b'); s.appendChild(o1); s.appendChild(o2);
    const t = d.createElement('select'), o3 = d.createElement('option'); o3.textContent = 'Text'; t.appendChild(o3);
    ok(s.value === 'a' && t.value === 'Text' && d.createElement('select').value === '', 'fakedom: a select shows its first option until a value is set');
    s.value = 'b'; ok(s.value === 'b', 'fakedom: a set value sticks');
    const p = d.createElement('div'), c = d.createElement('span'); p.appendChild(c); c.remove(); c.remove();
    ok(!p.children.length && c.parentNode === null, 'fakedom: element.remove() takes it out (twice is harmless)');
  }
  // ---- round 5: pointer drag with a live preview (pointer events on the bar, document moves, given rectangles)
  {
    R.ctx.as2Link('page:make'); X.arrange(true);
    const rect = (l, t, r, b) => () => ({ left: l, top: t, right: r, bottom: b, width: r - l, height: b - t });
    const leaf = id => X.blk(id, [d.createTextNode(id)]);
    const ra = leaf('zz.r.a'), rb = leaf('zz.r.b'), rc = leaf('zz.r.c'), row = X.blk('zz.r', [ra, rb, rc], { box: 'row' });
    const cx = leaf('zz.c.x'), cy = leaf('zz.c.y'), col = X.blk('zz.c', [cx, cy], { box: 'col' }), off = X.blk('zz.off', [], { box: 'col', attrs: { hidden: true } });
    [row, col, off].forEach(e => mk.appendChild(e)); X.apply(mk);
    mk.getBoundingClientRect = rect(0, 0, 800, 2000); row.getBoundingClientRect = rect(0, 1000, 600, 1100); col.getBoundingClientRect = rect(0, 1200, 600, 1500); off.getBoundingClientRect = rect(0, 1600, 600, 1700);
    ra.getBoundingClientRect = rect(0, 1010, 100, 1050); rb.getBoundingClientRect = rect(110, 1010, 210, 1050); rc.getBoundingClientRect = rect(220, 1010, 320, 1050);
    cx.getBoundingClientRect = rect(0, 1210, 600, 1250); cy.getBoundingClientRect = rect(0, 1260, 600, 1300);
    const has = c => e => e.classList && e.classList.contains(c), ph = () => d.body.all().filter(has('arrph')), ghost = () => d.body.all().filter(has('arrghost'));
    const seq = s => s.children.filter(e => (isB(e) && !has('arrlift')(e)) || has('arrph')(e)).map(e => has('arrph')(e) ? '[]' : e.dataset.blk).join();
    const down = (b, x, y, on) => barOf(b).fire('pointerdown', { clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', button: 0, target: on || barOf(b) });
    const mv = (x, y) => d.fire('pointermove', { clientX: x, clientY: y, pointerId: 1 }), up = (x, y) => d.fire('pointerup', { clientX: x, clientY: y, pointerId: 1 });
    const stat = () => d.getElementById('blkstat').textContent, lay = () => R.store.get('as2gui.layout'), btn = (b, a) => barOf(b).children.find(x => x.dataset.blkact === a);
    // a press on a bar button that moves less than the threshold stays a click
    down(cx, 300, 1230, btn(cx, 'down')); mv(303, 1232); up(303, 1232); btn(cx, 'down').click();
    ok(!ph().length && seq(col) === 'zz.c.y,zz.c.x' && cx.classList.contains('arrflash'), 'threshold: a bar button press that barely moves is still a click; the moved block flashes where it went', seq(col));
    btn(cx, 'up').click();
    const p0 = checkScreen(mk).length;
    down(ra, 50, 1020); mv(52, 1022);
    ok(!ph().length && !ra.classList.contains('arrlift'), 'under the threshold nothing lifts');
    mv(170, 1030);
    ok(ph().length === 1 && ghost().length === 1 && ra.classList.contains('arrlift') && seq(row) === 'zz.r.b,[],zz.r.c', 'past the threshold the block lifts, a copy follows, the placeholder opens a gap after b (pointer right of its middle)', seq(row));
    ok(d.body.classList.contains('arrdragging') && col.classList.contains('arrdrop') && mk.classList.contains('arrdrop') && !off.classList.contains('arrdrop') && stat() === en['blk.dragStart'].replace('{name}', 'zz.r.a'), 'targets are outlined (not a hidden one); the move is announced', stat());
    ok(!isB(ghost()[0]) && !ghost()[0].all().some(isB) && checkScreen(mk).length === p0 && !X.state(mk).o['zz.r'].includes(undefined) && X.overlaps(mk).every(o => !/arrph|arrghost/.test(o.a + o.b)), 'the copy and the placeholder are never blocks (state, check, overlaps)');
    mv(300, 1265);
    ok(ph().length === 1 && seq(row) === 'zz.r.b,zz.r.c' && seq(col) === 'zz.c.x,[],zz.c.y', 'into another container: the placeholder moves there, above the middle of y = before y', seq(row) + ' | ' + seq(col));
    mv(300, 1450);
    ok(seq(col) === 'zz.c.x,zz.c.y,[]', 'over an empty part of a container: at its end', seq(col));
    mv(250, 1030);
    ok(seq(row) === 'zz.r.b,[],zz.r.c', 'row: left of the middle of c = before c', seq(row));
    mv(300, 1030);
    ok(seq(row) === 'zz.r.b,zz.r.c,[]', 'row: right of the middle of the last = after it', seq(row));
    mv(300, 1265); up(300, 1265);
    const E = JSON.parse(lay()).profiles.P.screens.make;
    ok(!ph().length && !ghost().length && ra.parentNode === col && seq(col) === 'zz.c.x,zz.r.a,zz.c.y' && !ra.classList.contains('arrlift') && !d.body.classList.contains('arrdragging') && !col.classList.contains('arrdrop'), 'release drops it where the placeholder was; the preview goes', seq(col));
    ok(E.o['zz.c'].join() === 'zz.c.x,zz.r.a,zz.c.y' && stat().startsWith(en['blk.placedBefore'].split('{other}')[0].replace('{name}', 'zz.r.a')), 'the drop is saved and said', stat());
    btn(cy, 'up').click();
    ok(seq(col) === 'zz.c.x,zz.r.a,zz.c.y', 'the click that follows a release is not taken as a bar button press');
    // Esc while dragging
    const L1 = lay(); down(rb, 150, 1020); mv(300, 1265);
    ok(ph().length === 1 && rb.classList.contains('arrlift') && seq(col).includes('[]'), 'a second drag is under way');
    d.key('Escape');
    ok(!ph().length && !ghost().length && rb.parentNode === row && seq(row) === 'zz.r.b,zz.r.c' && lay() === L1 && d.body.classList.contains('arranging') && stat() === en['blk.dragCancel'].replace('{name}', 'zz.r.b'), 'Esc while dragging puts it back, saves nothing, Arrange stays on', stat());
    // release outside every container of the screen
    down(rc, 250, 1020); mv(300, 1265); mv(900, 50);
    ok(seq(row) === 'zz.r.b,[]' && seq(col) === 'zz.c.x,zz.r.a,zz.c.y', 'outside every container the placeholder goes back to the start place', seq(row));
    up(900, 50);
    ok(rc.parentNode === row && !ph().length && lay() === L1, 'release outside puts it back, nothing saved');
    X.arrange(false); [row, col, off].forEach(e => mk.removeChild(e));
  }
}
const barOf = b => { const host = b.tagName === 'DETAILS' ? b.children.find(k => k.tagName === 'SUMMARY') || b : b; return host.children.find(k => k.classList && k.classList.contains('blkbar')); };

async function main() {
  ok(settings.okKey('as2gui.layout'), 'the window settings keep the key as2gui.layout (the Arrange profiles)');
  // ---- 4. CSS
  const css = /<style>([\s\S]*?)<\/style>/.exec(html)[1], rules = css.split('}').filter(r => /\.blk|\.blc|blkbar|blkpanel|blkoff/.test(r));
  ok(/\.blc\.box-row\{[^}]*flex-wrap:wrap/.test(css) && /\.blc\.box-grid,\.blc\.box-cols\{[^}]*flex-wrap:wrap/.test(css), 'row, grid and column containers wrap their blocks (a block too wide for its line goes to the next one)');
  ok(/\.blc\.box-grid>\.blk\{[^}]*min-width:min-content/.test(css) && /\.blc\.box-cols>\.blk\{[^}]*min-width:min-content/.test(css), 'grid and column blocks never shrink below their content');
  ok(/\.blc\{display:flex;flex-direction:column[^}]*gap:/.test(css), 'a container stacks its blocks with a gap');
  ok(/\[hidden\]\.blk,\.blkoff\{display:none!important\}/.test(css), 'a hidden block stays hidden whatever its display');
  ok(/\.blc\.box-row>\.blk\{[^}]*min-width:min-content/.test(css), 'a block in a row never shrinks below its content');
  ok(rules.length > 10 && !rules.some(r => /position:\s*(absolute|fixed)|(^|[;{])width:\s*\d+px/.test(r)), 'no block rule positions a block on top of another or fixes its width', rules.filter(r => /position|width:\d/.test(r)).join('}\n'));
  ok(!/id=arrbox|id=advbox/.test(/<header[\s\S]*?<\/header>/.exec(html)[0]) && /<div id=pagenav role=tablist hidden><\/div>\s*<\/header>/.test(html), 'Advanced and Arrange left the header (they live on the Settings page); the third row sits right above the page');
  for (const k of Object.keys(en).filter(k => /^blk\./.test(k))) ok(!/ - | – | — |—|–/.test(en[k]), 'en ' + k + ': no dash as punctuation', en[k]);

  // ---- 1. structure of every screen
  const P = boot({});
  await ready(P);
  const doc = P.doc, secs = doc.getElementById('main').children.filter(s => s.tagName === 'SECTION'), ids = secs.map(s => s.dataset.id);
  ok(secs.length >= 20 && secs.every(s => s.dataset.blkroot === s.dataset.id), 'every screen section is a block root (' + secs.length + ' screens)');
  for (const a of ALLOW) ok(ids.includes(a), 'ALLOW names a screen that exists: ' + a);
  for (const s of secs) {
    const sid = s.dataset.id, probs = checkScreen(s);
    if (ALLOW.has(sid)) { if (!probs.length) console.log('note: screen ' + sid + ' passes; take it off ALLOW in test-blocks.js'); continue; }
    ok(!probs.length, 'screen ' + sid + ': every control and text in a leaf block, ids unique (' + s.all().filter(isB).length + ' blocks)', probs.slice(0, 25).join('\n  ') + (probs.length > 25 ? '\n  ... ' + (probs.length - 25) + ' more' : ''));
  }
  // the test itself catches faults: a bare button, a doubled id, a control in a container, a leaf holding a block
  {
    const s = secs.find(x => x.dataset.id === 'make'), b = P.ctx.as2Blocks;
    const tmp = [doc.createElement('button'), b.blk('title', [doc.createElement('span')]), b.blk('zz.box', [doc.createElement('select')], { box: 'row' }), b.blk('zz.leaf', [b.blk('zz.in', [])])];
    tmp[0].textContent = 'bare'; tmp.forEach(t => s.appendChild(t));
    const pr = checkScreen(s).join('\n');
    ok(/button "bare" is not inside a block/.test(pr) && /two blocks share the id "title"/.test(pr) && /select sits in the container "zz.box"/.test(pr) && /leaf block "zz.leaf" holds blocks/.test(pr), 'seeded faults are caught', pr);
    tmp.forEach(t => s.removeChild(t));
  }

  // ---- 2. Arrange on the Make screen
  P.ctx.as2Link('page:make');
  const mk = secs.find(x => x.dataset.id === 'make'), B = id => mk.all().find(e => isB(e) && e.dataset.blk === id);
  const rootIds = s => s.children.filter(isB).map(b => b.dataset.blk);
  const barOf = b => { const host = b.tagName === 'DETAILS' ? b.children.find(k => k.tagName === 'SUMMARY') : b; return host.children.find(k => k.classList && k.classList.contains('blkbar')); };
  const act = (b, a) => barOf(b).children.find(x => x.dataset.blkact === a).click();
  const lay = () => JSON.parse(P.store.get('as2gui.layout'));
  const mkOf = L => L.profiles[L.active].screens.make;
  const def = rootIds(mk);
  ok(def.join() === 'title,gi,gen', 'Generator (page id make): default order of its top blocks (W5: new went to Mods, ub and upadv to Upgrade or Port)', def.join());
  // Arrange starts on the Settings page: a page picker (it starts on the page shown before Settings) and a button
  P.ctx.as2Link('page:settings'); const pick = doc.getElementById('arrpage'), go = doc.getElementById('arrgo'), arrc = doc.getElementById('arrbox');
  ok(pick && go && arrc && arrc.dataset.blk === 'arr' && pick.value === 'make' && pick.children.some(o => o.attrs.value === 'check') && pick.attrs['aria-label'] === en['stg.arr.page'] && go.textContent === en['blk.title'], 'Settings: the Arrange card picks a page, the page shown before Settings first', pick && pick.value);
  pick.value = 'make'; go.click();
  ok(mk.hidden === false && doc.getElementById('blkpath').textContent === en['blk.titleP'].replace('{p}', en['grp.tools'] + ' > ' + en['grp.s.tools'] + ' > ' + en['nav.make']), 'the Arrange bar names the page as its path in the tabs', doc.getElementById('blkpath').textContent);
  P.ctx.as2Link('page:check'); ok(/Check/.test(doc.getElementById('blkpath').textContent) && !doc.getElementById('blkpanel').hidden, 'the Arrange bar follows the page', doc.getElementById('blkpath').textContent);
  P.ctx.as2Link('page:make');
  ok(doc.body.classList.contains('arranging') && doc.getElementById('blkpanel') && !doc.getElementById('blkpanel').hidden, 'Arrange on: the page is marked and the panel shows');
  ok(doc.getElementById('toast').textContent === en['blk.onSay'], 'Arrange on is announced (status toast)');
  const mkBlocks = mk.all().filter(isB);
  ok(mkBlocks.every(b => { const r = barOf(b); return r && r.attrs.role === 'group' && r.children.filter(x => x.tagName === 'BUTTON').every(x => x.attrs['aria-label'] && x.attrs.type === 'button'); }), 'every block has a bar of named buttons');
  ok(barOf(B('gi')).children[0].attrs.draggable === undefined && (barOf(B('gi')).listeners.pointerdown || []).length === 1 && /^Move /.test(barOf(B('gi')).children[0].attrs['aria-label']), 'the handle is a named button; the bar drags by pointer events (no native draggable, it would cancel them)');
  const lab = B('gen.target').children.find(k => k.tagName === 'LABEL');
  ok(lab && lab.attrs.inert === '' && B('gen.btns').children.filter(k => k.tagName === 'BUTTON').every(k => k.attrs.inert === ''), 'the controls of a block are inert while arranging');
  act(B('gi'), 'down');
  ok(rootIds(mk).join() === 'title,gen,gi', 'move down (button) swaps with the next block', rootIds(mk).join());
  ok(mkOf(lay()).o['@'].join() === rootIds(mk).join(), 'the move is stored in the active profile');
  ok(doc.getElementById('blkstat').textContent.length > 0, 'the move is said in the panel status line');
  barOf(B('gi')).children[0].fire('keydown', { key: 'ArrowUp' });
  ok(rootIds(mk).join() === def.join(), 'arrow key on the handle moves it back up', rootIds(mk).join());
  act(B('title'), 'up');
  ok(rootIds(mk).join() === def.join() && doc.getElementById('blkstat').textContent === en['blk.first0'].replace('{name}', P.ctx.as2Blocks && B('title')._blkn), 'the first block stays first and says so', doc.getElementById('blkstat').textContent);
  const where = B('gen.where'), p0 = where.parentNode;
  act(where, 'box');
  ok(where.parentNode !== p0 && isBox(where.parentNode), 'the box button moves a block into the next container', where.parentNode.dataset.blk);
  const whereBox = where.parentNode.dataset.blk;
  ok(mkOf(lay()).o[whereBox].includes('gen.where'), 'the new container is stored');
  // drag and drop: gi.title before gen.title (into another container)
  const gt = B('gi.title');
  barOf(gt).children[0].fire('dragstart', { dataTransfer: { setData() {}, effectAllowed: '' } });
  mk.fire('drop', { target: B('gen.title') });
  ok(gt.parentNode === B('gen.opts') && B('gen.opts').children.filter(isB)[B('gen.opts').children.filter(isB).indexOf(gt) + 1] === B('gen.title'), 'drag and drop puts a block before the one it is dropped on');
  barOf(B('gi')).children[0].fire('dragstart', { dataTransfer: { setData() {}, effectAllowed: '' } });
  mk.fire('drop', { target: B('gi.what') });
  ok(B('gi').parentNode === mk && rootIds(mk).join() === def.join(), 'a block cannot be dropped inside itself');
  // hide and show
  act(B('gi.doc'), 'hide');
  const hb = doc.getElementById('blkhid').querySelector('button[data-blkshow]');
  ok(B('gi.doc').classList.contains('blkoff') && mkOf(lay()).hid.includes('gi.doc') && hb && hb.dataset.blkshow === 'gi.doc', 'hide: the block goes, the profile notes it, the hidden list offers it back');
  hb.click();
  ok(!B('gi.doc').classList.contains('blkoff') && !mkOf(lay()).hid.includes('gi.doc'), 'show from the hidden list brings it back');
  act(B('gi.doc'), 'hide');
  P.ctx.as2Settings.flush();
  ok(P.server['as2gui.layout'] && P.server['as2gui.layout'].profiles, 'the profiles reach the server settings');

  // ---- 3. a new page with those settings: the profile is applied on load
  const saved = clone(P.server);
  {
    const Q = boot(saved); await ready(Q);
    const mk2 = Q.doc.getElementById('main').children.find(s => s.dataset.id === 'make'), B2 = id => mk2.all().find(e => isB(e) && e.dataset.blk === id);
    ok(B2('gi.title').parentNode === B2('gen.opts') && B2('gen.where').parentNode.dataset.blk === whereBox && B2('gi.doc').classList.contains('blkoff'), 'on load: moved blocks are in their containers, hidden ones hidden');
    // a redraw that puts a block back at its default place: apply puts it where the profile says
    B2('gen.opts').removeChild(B2('gi.title')); B2('gi').insertBefore(Q.doc.createElement('span'), null);
    const t2 = Q.ctx.as2Blocks.blk('gi.title', [Q.doc.createElement('h3')]); B2('gi').insertBefore(t2, B2('gi').children[0]);
    Q.ctx.as2Blocks.apply(mk2);
    ok(t2.parentNode === B2('gen.opts'), 'a block a screen draws again goes back to its place in the profile');
  }
  {
    const s2 = clone(saved), L = s2['as2gui.layout'], E = L.profiles[L.active].screens.make;
    E.o['@'] = ['ghost', 'gi', 'title'].concat(E.o['@'].filter(x => x !== 'gi' && x !== 'title')); E.o.ghostbox = ['gi.what']; E.hid.push('ghost.2');
    for (const k of Object.keys(E.o)) E.o[k] = E.o[k].filter(x => x !== 'gen.where');
    const Q = boot(s2); await ready(Q);
    const mk2 = Q.doc.getElementById('main').children.find(s => s.dataset.id === 'make'), B2 = id => mk2.all().find(e => isB(e) && e.dataset.blk === id);
    ok(rootIds(mk2)[0] === 'gi' && rootIds(mk2)[1] === 'title', 'unknown ids in a profile are ignored, the known ones ordered', rootIds(mk2).join());
    ok(B2('gen.where').parentNode === B2('gen.opts'), 'a block the profile does not name keeps its default place');
  }

  // ---- 3. profiles in the panel (P, still arranging)
  const L0 = lay(), first = L0.active, $ = id => doc.getElementById(id);
  ok(first === en['blk.first'] && $('blkprof').children.length === 1, 'one profile to start with, named ' + first);
  ok($('blkmore').tagName === 'DETAILS' && $('blkmore').open === false, 'the fold "' + en['blk.more'] + '" starts closed while the default profile is the only one');
  $('blkname').value = 'Two'; $('blksave').click();
  ok(lay().active === 'Two' && Object.keys(lay().profiles).length === 2 && JSON.stringify(lay().profiles.Two.screens) === JSON.stringify(L0.profiles[first].screens), 'Save as copies the arrangement under a new name and uses it');
  ok($('blkmore').open === true, 'the profiles fold opens by itself once there are two profiles');
  // a fold the user closed stays closed when the panel is drawn again (for the session); opened again, it stays open
  $('blkmore').open = false; $('blkmore').fire('toggle'); $('blkprof').value = first; $('blkprof').fire('change');
  ok(lay().active === first && $('blkmore').open === false, 'the profiles fold the user closed stays closed after a redraw (profile switch), although there are two profiles');
  $('blkmore').open = true; $('blkmore').fire('toggle'); $('blkprof').value = 'Two'; $('blkprof').fire('change');
  ok(lay().active === 'Two' && $('blkmore').open === true, 'opened again by the user, the profiles fold stays open after a redraw');
  // the rule has no names in it (a name depends on the language): one profile, whatever its name, starts with the fold closed
  { const Q = boot({ 'as2gui.layout': { v: 1, active: 'Mine', profiles: { Mine: { screens: {} } } } }); await ready(Q);
    Q.ctx.as2Link('page:settings'); Q.doc.getElementById('arrgo').click();
    const mq = Q.doc.getElementById('blkmore');
    ok(mq && mq.open === false, 'one profile not named as the default one: the profiles fold still starts closed (no rule on names)'); }
  $('blkprof').value = first; $('blkprof').fire('change');
  ok(lay().active === first, 'the profile select switches the profile');
  const nc = P.confirms.length; P.ctx.answer = false;
  $('blkname').value = 'Two'; $('blksave').click();
  ok(P.confirms.length === nc + 1 && /Two/.test(P.confirms[nc]) && lay().active === first, 'Save as over an existing profile asks first; Cancel keeps it');
  P.ctx.answer = true;
  $('blkname').value = 'Three'; $('blkren').click();
  ok(lay().active === 'Three' && !lay().profiles[first] && lay().profiles.Two, 'Rename');
  $('blkname').value = 'Two'; $('blkren').click();
  ok(lay().active === 'Three' && $('blkstat').textContent === en['blk.taken'].replace('{name}', 'Two'), 'Rename to a name in use is refused');
  $('blkdel').click();
  ok(P.confirms.length === nc + 2 && !lay().profiles.Three && lay().active === 'Two', 'Delete asks, then removes the profile and uses another');
  $('blkrs').click();
  ok(P.confirms.length === nc + 3 && rootIds(mk).join() === def.join() && gt.parentNode === B('gi') && where.parentNode === p0 && !mk.all().some(e => isB(e) && e.classList.contains('blkoff')) && !mkOf(lay()), 'Reset this screen asks, then puts every block back and forgets the screen');
  // import
  const X = P.ctx.as2Blocks;
  ok(X.parse('not json') === null && X.parse('{"arsenalLayout":2,"screens":{}}') === null && X.parse('{"arsenalLayout":1,"screens":[]}') === null, 'import refuses a file that is not a layout profile');
  const good = X.parse(JSON.stringify({ arsenalLayout: 1, name: '  Two ', screens: { make: { o: { '@': ['gi', 'title', 5, ''] }, hid: ['gi.when', {}] }, 'bad key!': { o: {} } } }));
  ok(good && good.name === 'Two' && JSON.stringify(good.screens) === '{"make":{"o":{"@":["gi","title"]},"hid":["gi.when"]}}', 'import keeps only well formed names and ids', JSON.stringify(good));
  X.import(JSON.stringify({ arsenalLayout: 1, name: 'Two', screens: good.screens }));
  ok(P.confirms.length === nc + 4 && lay().active === 'Two' && rootIds(mk)[0] === 'gi' && B('gi.when').classList.contains('blkoff'), 'import over a profile of that name asks, then uses it at once', rootIds(mk).join());
  // W5 Make split: a profile saved while Make held new, gen and upgrade moves its upgrade blocks to Upgrade or Port and its New Mod blocks to Mods
  {
    const oldMk = () => ({ o: { '@': ['title', 'new', 'gi', 'gen', 'ub', 'upadv'], ub: ['ub.intro', 'ub.title'], new: ['new.intro', 'new.title'], gi: ['gi.what', 'gi.title'] }, hid: ['new.next', 'upgrade.log', 'gi.doc'] });
    const sc = { make: oldMk() };
    ok(X.migrate(sc) === true && X.migrate(sc) === false, 'migrate: changes an old Make layout once, then has nothing to do');
    ok(JSON.stringify(sc.make) === JSON.stringify({ o: { '@': ['title', 'gi', 'gen'], gi: ['gi.what', 'gi.title'] }, hid: ['gi.doc'] }), 'migrate: the Generator keeps only its own blocks', JSON.stringify(sc.make));
    ok(sc.upgrade && Object.keys(sc.upgrade.o).sort().join() === '@,ub' && sc.upgrade.o['@'].join() === 'title,ub,upadv' && sc.upgrade.o.ub.join() === 'ub.intro,ub.title' && sc.upgrade.hid.join() === 'upgrade.log', 'migrate: the upgrade blocks go to Upgrade or Port with their order', JSON.stringify(sc.upgrade));
    ok(JSON.stringify(sc.mods) === JSON.stringify({ o: { new: ['new.intro', 'new.title'] }, hid: ['new.next'] }), 'migrate: the New Mod blocks go to Mods', JSON.stringify(sc.mods));
    const own = { make: oldMk(), upgrade: { o: { '@': ['upadv', 'ub', 'title'] }, hid: [] } }; X.migrate(own);
    ok(own.upgrade.o['@'].join() === 'upadv,ub,title' && !own.upgrade.o.ub && !('ub' in own.make.o), 'migrate: an Upgrade or Port layout of its own wins; the old one is dropped from make', JSON.stringify(own));
    const im = X.parse(JSON.stringify({ arsenalLayout: 1, name: 'Old', screens: { make: oldMk() } }));
    ok(im && im.screens.upgrade && im.screens.upgrade.o.ub.join() === 'ub.intro,ub.title' && im.screens.mods.hid.join() === 'new.next' && im.screens.make.o['@'].join() === 'title,gi,gen', 'import: an old Make profile file is migrated too', JSON.stringify(im && im.screens));
    const Q = boot({ 'as2gui.layout': { v: 1, active: 'Old', profiles: { Old: { screens: { make: oldMk() } }, Other: { screens: { make: oldMk() } } } } }); await ready(Q);
    const sec = id => Q.doc.getElementById('main').children.find(x => x.dataset.id === id), B3 = (id, b) => sec(id).all().find(e => isB(e) && e.dataset.blk === b);
    const L3 = Q.store.has('as2gui.layout') ? JSON.parse(Q.store.get('as2gui.layout')) : Q.server['as2gui.layout'];
    ok(L3 && Object.values(L3.profiles).every(p => p.screens.upgrade && p.screens.mods && !JSON.stringify(p.screens.make).includes('ub')), 'on load: every stored profile is migrated and saved', JSON.stringify(L3).slice(0, 600));
    const ubk = B3('upgrade', 'ub').children.filter(isB).map(b => b.dataset.blk), nwk = B3('mods', 'new').children.filter(isB).map(b => b.dataset.blk);
    ok(ubk[0] === 'ub.intro' && ubk[1] === 'ub.title' && nwk[0] === 'new.intro' && nwk[1] === 'new.title' && B3('mods', 'new.next').classList.contains('blkoff') && B3('upgrade', 'upgrade.log').classList.contains('blkoff') && !B3('make', 'ub') && !B3('make', 'new'), 'on load: the moved blocks keep their order and hidden state on their new pages', ubk.join() + ' / ' + nwk.join());
  }
  // Esc ends arranging
  doc.key('Escape');
  ok(!doc.body.classList.contains('arranging') && $('blkpanel').hidden && !mk.all().some(e => e.classList && e.classList.contains('blkbar')) && !mk.all().some(e => e.attrs && e.attrs.inert != null), 'Esc ends Arrange: bars gone, controls live again, the bar gone');
  await more();
  console.log(fails ? 'FAIL blocks (' + fails + ' of ' + (fails + passes) + ')' : 'PASS blocks (' + passes + ' checks)');
  process.exit(fails ? 1 : 0);
}
main().catch(e => { console.log('FAIL blocks: ' + (e.stack || e)); process.exit(1); });

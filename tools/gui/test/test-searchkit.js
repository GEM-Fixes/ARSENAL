// searchKit (tools/gui/page.js; tools/gui/README.md): the shared search / filter box with a manual Browse, an indexed search and a
// history list (owner 2026-11-19: every search bar in the GUI). Runs the page's own searchKit and h() in the stand-in DOM of fakedom.js
// with a frame queue the test drives, and checks the contract: missing options refused, history order / dedupe / cap / forget / clear,
// index rows drawn up to the cap with a "show more" row, stale index answers dropped, keyboard pick, token mode, Browse = always the file
// browser (searchKit.picker; no list popup), the picker's data view and its fall back to the disk, and that the page itself exports the
// kit and every core search box (Check, Mods, the folder picker, form fields) uses it.
// usage: node test-searchkit.js
// Author: Imperator_Aug (ARSENAL, ia-a5ca5d5f)
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const FD = require('./fakedom');
const BC = require('./blockcheck');
const WT = require('../../lib/test/wait');
const en = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'lang', 'en.json'), 'utf8'));

let n = 0; const ok = m => console.log('ok ' + (++n) + ' ' + m);

// one fresh world: document, LS in memory, tx from en.json, frames queued until flush()
// win: an optional stand-in window (size, listeners) for the fixed list; without it the kit has no window, as in the other test DOMs
function world(win) {
  const doc = FD.make(), store = {}, frames = [], errs = [];
  const LS = { get: (k, d) => (Object.prototype.hasOwnProperty.call(store, k) ? JSON.parse(store[k]) : d), set: (k, v) => { store[k] = JSON.stringify(v); } };
  const tx = (k, a) => { let s = en[k] == null ? k : en[k]; for (const x in a || {}) s = s.split('{' + x + '}').join(String(a[x])); return s; };
  const raf = f => frames.push(f);
  const con = { error: m => errs.push(String(m)), log() {} };
  const src = BC.fnSrc('h') + '\n' + BC.kitSrc() + '\nreturn searchKit;';
  const searchKit = new Function('document', 'LS', 'tx', 'requestAnimationFrame', 'console', 'setTimeout', 'window', src)(doc, LS, tx, raf, con, f => frames.push(f), win);
  const flush = () => { let g = 0; while (frames.length && g++ < 50) frames.splice(0).forEach(f => f()); };
  return { doc, store, LS, tx, searchKit, flush, errs };
}
function input(W, v) { const i = W.doc.createElement('input'); i.setAttribute('type', 'text'); if (v != null) i.value = v; return i; }
function type(i, v) { i.value = v; i.selectionStart = String(v).length; i.fire('input'); }
function key(i, k) { const e = { key: k, _sk: 0, prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, target: i }; (i.listeners.keydown || []).forEach(f => f.call(i, e)); return e; }   // the event object itself (fakedom fire copies it)
const opts = dd => dd.children.filter(c => c.getAttribute('role') === 'option');
const labs = dd => opts(dd).map(o => o.textContent);

// 1 refused without the three parts
{
  const W = world();
  assert.throws(() => W.searchKit(input(W), { index: () => {} }), /missing key/);
  assert.throws(() => W.searchKit(input(W), { key: 'k', browse: { mode: 'file' } }), /missing index/);
  assert.throws(() => W.searchKit(null, { key: 'k', index: () => {} }), /missing input/);
  assert.strictEqual(W.errs.length, 3, 'each refusal is also written to the console');
  assert.ok(W.searchKit(input(W), { key: 'k1', index: () => {} }), 'no browse given: still a kit (Browse = the default file browser)');
  assert.ok(W.searchKit(input(W), { key: 'k2', list: d => d([]) }), 'the older list form alone: still a kit (list = the index)');
  ok('a box without an input, a history key or an index is refused (thrown and logged); browse is optional, list alone counts as the index');
}

// 2 the wrapper: an input already on the page is wrapped in place, with Browse and History beside it
{
  const W = world(), box = W.doc.createElement('div'), i = input(W), after = W.doc.createElement('span');
  box.appendChild(i); box.appendChild(after); i.setAttribute('list', 'old');
  const k = W.searchKit(i, { key: 't.wrap', index: (q, d) => d([]), list: d => d([]) });
  assert.strictEqual(box.children[0], k.el); assert.strictEqual(box.children[1], after);
  assert.strictEqual(k.el.className, 'sk'); assert.strictEqual(k.el.dataset.sk, 't.wrap');
  assert.deepStrictEqual(k.el.children.map(c => c.tagName), ['INPUT', 'BUTTON', 'BUTTON', 'DIV']);
  assert.strictEqual(k.browseButton.textContent, en['sk.browse']); assert.strictEqual(k.historyButton.textContent, en['sk.history']);
  assert.strictEqual(i.getAttribute('role'), 'combobox'); assert.strictEqual(i.getAttribute('aria-expanded'), 'false'); assert.ok(!i.getAttribute('list'), 'the old datalist is dropped');
  assert.strictEqual(i._sk, k); assert.strictEqual(k.list.hidden, true);
  ok('the box is wrapped in place: input, Browse, History, a hidden list; combobox roles set, the old datalist dropped');
}

// 3 history: newest first, one entry per text whatever its case, at most 20, forget one, clear all
{
  const W = world(), k = W.searchKit(input(W), { key: 't.h', index: (q, d) => d([]), list: d => d([]) });
  for (let x = 1; x <= 25; x++) k.remember('item ' + x);
  let h = k.history(); assert.strictEqual(h.length, 20); assert.strictEqual(h[0], 'item 25'); assert.strictEqual(h[19], 'item 6');
  k.remember('ITEM 10'); h = k.history(); assert.strictEqual(h[0], 'ITEM 10'); assert.strictEqual(h.filter(x => x.toLowerCase() === 'item 10').length, 1);
  k.remember('   '); assert.strictEqual(k.history().length, 20, 'blank text is not remembered');
  assert.ok(W.store['sk.hist.t.h'], 'kept under sk.hist.<key>');
  k.historyButton.fire('click'); W.flush();
  assert.strictEqual(k.isOpen(), true); const rows = opts(k.list);
  assert.strictEqual(rows.length, 21, '20 recent rows and clear history');
  assert.ok(rows[0].textContent.includes('ITEM 10') && rows[0].textContent.includes(en['sk.recent']));
  const x = rows[1].all().find(c => c.className === 'sk-x'); k.list.fire('click', { target: x }); W.flush();
  assert.ok(!k.history().includes('item 25'), 'the x forgets that one entry'); assert.strictEqual(k.history().length, 19);
  const clr = opts(k.list).find(o => o.className.includes('sk-clear')); k.list.fire('click', { target: clr }); W.flush();
  assert.deepStrictEqual(k.history(), []); assert.ok(k.list.textContent.includes(en['sk.noHist']));
  ok('history: newest first, one entry per text (case ignored), at most 20, the x forgets one, clear history empties it');
}

// 4 the index: rows in the next frame, history matches first, cap with a "more" note, Enter picks, the pick goes to history
{
  const W = world(), i = input(W), asked = [];
  const names = Array.from({ length: 50 }, (_, x) => 'Tiger ' + x);
  const k = W.searchKit(i, { key: 't.i', cap: 10, index: (q, d) => { asked.push(q); const l = names.filter(s => s.toLowerCase().includes(q.toLowerCase())); d(l.slice(0, 30).map(s => ({ label: s, value: s, hint: 'tank' })), Math.max(0, l.length - 30)); }, list: d => d([]) });
  k.remember('tiger old');
  let inputs = 0; i.addEventListener('input', () => inputs++);
  type(i, 'tig'); assert.strictEqual(k.isOpen(), false, 'drawn in the next frame, not during the key press'); W.flush();
  assert.deepStrictEqual(asked, ['tig']); assert.strictEqual(k.isOpen(), true);
  const L = labs(k.list); assert.ok(L[0].includes('tiger old'), 'a matching history entry comes first');
  assert.strictEqual(opts(k.list).filter(o => o.className.includes('sk-index')).length, 10, 'index rows up to the cap');
  const mr = opts(k.list).filter(o => o.className.includes('sk-more'));
  assert.strictEqual(mr.length, 1, 'a show-more row'); assert.strictEqual(mr[0].textContent, en['sk.showMore'].replace('{n}', '10').replace('{left}', '20'));
  const note = k.list.children[k.list.children.length - 1]; assert.strictEqual(note.textContent, en['sk.more'].replace('{n}', '20'), 'hits the index did not send are said');
  const e1 = key(i, 'ArrowDown'); assert.ok(e1._sk && e1.prevented, 'a key the kit uses is marked e._sk');
  key(i, 'ArrowDown'); key(i, 'ArrowDown'); assert.ok(i.getAttribute('aria-activedescendant'));
  inputs = 0; const e2 = key(i, 'Enter'); assert.ok(e2._sk);
  assert.strictEqual(i.value, 'Tiger 0'); assert.strictEqual(inputs, 1, 'the page hears one input event'); assert.strictEqual(k.isOpen(), false);
  assert.strictEqual(k.history()[0], 'Tiger 0');
  type(i, 'ti'); W.flush(); assert.strictEqual(k.isOpen(), true); const e3 = key(i, 'Escape'); assert.ok(e3._sk); assert.strictEqual(k.isOpen(), false);
  const e4 = key(i, 'Escape'); assert.ok(!e4._sk, 'Escape on a closed list is left to the page');
  ok('index: rows in the next frame, matching history first, capped with a "more" note; arrows + Enter pick, the page hears one input, the pick is remembered; Escape closes');
}

// 5 a late answer for an older text is dropped
{
  const W = world(), i = input(W), pend = {};
  const k = W.searchKit(i, { key: 't.s', index: (q, d) => { pend[q] = d; }, list: d => d([]) });
  type(i, 'pa'); type(i, 'pan');
  pend.pan([{ label: 'Panther', value: 'panther' }]); pend.pa([{ label: 'Pak 40', value: 'pak40' }]); W.flush();
  assert.deepStrictEqual(labs(k.list), ['Panther']);
  ok('a late index answer for an older text is dropped');
}

// 6 token mode: the word under the caret is replaced, a column= pick keeps the caret there, a history pick takes the whole text
{
  const W = world(), i = input(W), asked = [];
  const k = W.searchKit(i, { key: 't.t', mode: 'token', index: (q, d) => { asked.push(q); d(q.startsWith('ar') ? [{ label: 'army=', value: 'army=' }] : [{ label: 'Tiger', value: 'id=tiger' }]); }, list: d => d([]) });
  type(i, 'cost>500 ti'); W.flush(); assert.strictEqual(asked.pop(), 'ti', 'only the word at the caret is searched');
  key(i, 'ArrowDown'); key(i, 'Enter'); assert.strictEqual(i.value, 'cost>500 id=tiger ');
  type(i, 'cost>500 ar'); W.flush(); key(i, 'ArrowDown'); key(i, 'Enter');
  assert.strictEqual(i.value, 'cost>500 army=', 'no space after an operator'); assert.strictEqual(asked.pop(), 'army=', 'the list asks again for that column');
  i.value = 'cost>500 ti rest'; i.selectionStart = 11; i.fire('input'); W.flush(); key(i, 'ArrowDown'); key(i, 'Enter');
  assert.strictEqual(i.value, 'cost>500 id=tiger rest');
  k.remember('army=ger'); k.historyButton.fire('click'); W.flush(); key(i, 'ArrowDown'); key(i, 'Enter');
  assert.strictEqual(i.value, 'army=ger', 'a history pick is the whole text');
  ok('token mode: a pick replaces only the word at the caret, "column=" keeps the caret there and asks again, a history pick is the whole text');
}

// 7 Browse = always the file browser (searchKit.picker): a spec opens it there, toValue fills the box; no browse = the default (file
// mode, base name); a list-only box (older form) still opens the picker, never a list popup; a function browse(done) is used as given
{
  const W = world(), calls = [], answer = { p: 'C:/g/mods/m/resource/entity/tiger.def', e: { view: 'disk' } };
  W.searchKit.picker = (spec, done) => { calls.push(spec); done(answer.p, Object.assign({ path: answer.p }, answer.e)); };
  const ins = () => W.doc.body.all().filter(e => e.tagName === 'DIALOG' && e.getAttribute('id') !== 'pk');   // the page's own picker dialog is part of the stand-in page
  // a spec with start (function), view, exts, toValue
  const i = input(W), k = W.searchKit(i, { key: 't.b', index: (q, d) => d([]), browse: { mode: 'file', view: 'data', start: () => 'entity', exts: ['def'], toValue: (p, e) => 'id=' + p.split('/').pop() + (e && e.view === 'disk' ? '' : '?') } });
  let inputs = 0; i.addEventListener('input', () => inputs++);
  k.browseButton.fire('click');
  assert.deepStrictEqual(calls[0], { mode: 'file', start: 'entity', view: 'data', exts: ['def'], out: false, def: false });
  assert.strictEqual(i.value, 'id=tiger.def', 'toValue decides what goes into the box'); assert.strictEqual(inputs, 1); assert.strictEqual(k.history()[0], 'id=tiger.def');
  // a spec without toValue: the path itself
  const j = input(W), kj = W.searchKit(j, { key: 't.b1', index: (q, d) => d([]), browse: { mode: 'dir', start: 'C:/g', out: true } });
  kj.browseButton.fire('click'); assert.deepStrictEqual(calls[1], { mode: 'dir', start: 'C:/g', view: 'disk', exts: null, out: true, def: false }); assert.strictEqual(j.value, answer.p, 'no toValue: the path');
  // no browse at all: the default browser, the base name without extension
  const d = input(W), kd = W.searchKit(d, { key: 't.b2', index: (q, dn) => dn([]) });
  kd.browseButton.fire('click'); assert.deepStrictEqual(calls[2], { mode: 'file', start: '', view: 'disk', exts: null, out: false, def: true }); assert.strictEqual(d.value, 'tiger');
  // the older list form: Browse still opens the browser; no dialog of the kit's own anywhere
  const l = input(W), kl = W.searchKit(l, { key: 't.b3', list: dn => dn([{ group: 'g', label: 'Panther', value: 'panther' }]) });
  kl.browseButton.fire('click'); assert.strictEqual(calls.length, 4, 'a list-only box: Browse = the file browser'); assert.strictEqual(l.value, 'tiger');
  for (const kk of [k, kj, kd, kl]) { kk.historyButton.fire('click'); W.flush(); kk.close(); }
  assert.strictEqual(ins().length, 0, 'no list popup opens from any button'); assert.ok(!('popup' in kl), 'the kit has no popup any more');
  assert.strictEqual(kl.el.children.filter(e => e.tagName === 'BUTTON').length, 2, 'two buttons: Browse and History (no List)');
  // an empty toValue answer leaves the box as it was
  const e = input(W, 'keep'), ke = W.searchKit(e, { key: 't.b4', index: (q, dn) => dn([]), browse: { toValue: () => '' } }); ke.browseButton.fire('click'); assert.strictEqual(e.value, 'keep');
  // a function browse(done) (a box that opens the same picker itself) is used as given
  let asked = 0; const f = input(W), kf = W.searchKit(f, { key: 't.b5', index: (q, dn) => dn([]), browse: done => { asked++; done('picked/path', { file: 1 }); } });
  kf.browseButton.fire('click'); assert.strictEqual(asked, 1); assert.strictEqual(f.value, 'picked/path'); assert.strictEqual(calls.length, 5, 'the function, not the picker');
  // no picker on the page (ext test DOMs): Browse says so on the console and does nothing
  const W2 = world(), g = input(W2, 'x'), kg = W2.searchKit(g, { key: 't.b6', index: (q, dn) => dn([]) });
  kg.browseButton.fire('click'); assert.strictEqual(g.value, 'x'); assert.ok(W2.errs.some(m => /no file browser/.test(m)));
  ok('Browse is always the file browser: a spec (start fn, view, exts, out) opens it there and toValue fills the box; no browse = file mode, base name; list-only boxes too; no popup; a browse(done) function is used as given');
}

// 8 the page: window.searchKit exported, contract documented, every core search box uses it, the README has the contract
{
  const page = require('../page.js');
  assert.ok(/window\.searchKit=searchKit/.test(page), 'window.searchKit');
  assert.ok(/searchKit\(\$\('pkq'\),\{key:'pk\.filter'/.test(page), 'folder picker filter');
  assert.ok(/searchKit\(filt,\{key:'check\.filter'/.test(page), 'Check filter');
  assert.ok(/searchKit\(filt,\{key:'mods\.filter'/.test(page), 'Mods filter');
  assert.ok(/\.sk-dd\{/.test(page) && !/skpop|sk-pi\b|sk-pm\b/.test(page), 'kit styles; the list popup is gone');
  assert.ok(/searchKit\.picker=function/.test(page), 'the page gives the kit its file browser');
  // the core boxes browse files: no list form left in page.js, each kit there names where its Browse opens
  const core = page.slice(page.indexOf('function fkMake('), page.indexOf('function buildForm('));
  for (const v of ["kind==='map')o.browse={mode:'dir',view:'data',start:'map'", "kind==='unit')o.browse={mode:'file',view:'data',start:'entity'"]) assert.ok(core.includes(v), 'form ' + v);
  assert.ok(!/o\.list=/.test(core), 'form fields: no list Browse');
  assert.ok(/key:'check\.filter'[^\n]*\n\s*browse:\{mode:'file'/.test(page) && /key:'mods\.filter'[^\n]*\n\s*browse:\{mode:'dir'/.test(page), 'Check and Mods filters browse files and folders');
  const bal = require('../ext/balance/client') + require('../ext/balance/prices.client');
  for (const k of ['balance.q', 'balance.breeds.q', 'balance.cards.q']) assert.ok(bal.includes("key:'" + k + "'"), 'Balance ' + k);
  const rd = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');
  assert.ok(/searchKit\(input,/.test(rd) && /sk\.hist\./.test(rd), 'README documents the contract');
  ok('the page exports searchKit; the folder picker, Check, Mods and the three Balance filters use it; README documents it');
}
// 9 the whole index through the bar: ArrowDown on an empty box shows the first rows, "show more" pages on to every row of 6,000; a
// list-only box (older form) uses its list as the index (asked once, again after refresh), the caller's "not sent" count is said
{
  const W = world(), i = input(W), L = [];
  for (let x = 0; x < 6000; x++) L.push({ group: 'big', label: 'item ' + x, value: 'v' + x });
  for (let x = 0; x < 10; x++) L.push({ group: 'small', label: 'small ' + x, value: 's' + x });
  let calls = 0; const k = W.searchKit(i, { key: 't.big', cap: 400, list: d => { calls++; d(L, 123); } });
  const idx = () => opts(k.list).filter(o => o.className.includes('sk-index')), more = () => opts(k.list).find(o => o.className.includes('sk-more'));
  i.fire('focus'); W.flush(); assert.strictEqual(k.isOpen(), false, 'focus on an empty box with no history: nothing');
  const e = key(i, 'ArrowDown'); assert.ok(e._sk); W.flush();
  assert.strictEqual(idx().length, 400, 'ArrowDown on an empty box: the first 400 rows of the whole index');
  assert.strictEqual(more().textContent, en['sk.showMore'].replace('{n}', '400').replace('{left}', '5610'));
  assert.ok(k.list.textContent.includes(en['sk.more'].replace('{n}', '123')), 'items the caller did not send are said, not cut silently');
  k.list.fire('click', { target: more() }); W.flush(); assert.strictEqual(idx().length, 800, 'show more: the next 400'); assert.ok(k.isOpen());
  let clicks = 1; while (more() && clicks < 50) { k.list.fire('click', { target: more() }); W.flush(); clicks++; }
  assert.strictEqual(clicks, 15, '6010 rows in 15 steps of 400'); assert.strictEqual(idx().length, 6010, 'every row can be reached through the bar');
  // keyboard: Enter on the show-more row pages on, it does not pick
  type(i, 'item'); W.flush(); const n0 = idx().length; let at = opts(k.list).indexOf(more()); for (let s = 0; s <= at; s++) key(i, 'ArrowDown');
  key(i, 'Enter'); W.flush(); assert.ok(idx().length > n0 && i.value === 'item', 'Enter on show more: more rows, the text kept');
  // speed guard, generous (x5 of the old 3 s); a miss runs once more and keeps the better time (a busy PC never fails it alone)
  const pass30 = () => { const t0 = Date.now(); for (let r = 0; r < 30; r++) { type(i, 'item ' + (r % 9) + (r % 3)); W.flush(); } return Date.now() - t0; };
  let ms = pass30(); if (ms >= 15000) { WT.say('test-searchkit', '30 index passes within 15000 ms (took ' + ms + ' ms; runs once more)', ms); ms = Math.min(ms, pass30()); }
  WT.time('test-searchkit', '30 index passes over 6010 items', ms); assert.ok(ms < 15000, '30 index passes over 6010 items took ' + ms + ' ms');
  type(i, 'item 59'); W.flush(); assert.strictEqual(idx().length, 111, 'the index finds across the whole list (item 59, 590-599, 5900-5999)');
  assert.strictEqual(calls, 1, 'the list is asked once'); k.refresh(); type(i, 'small'); W.flush(); assert.strictEqual(calls, 2, 'refresh reads it again'); assert.strictEqual(idx().length, 10);
  key(i, 'ArrowDown'); key(i, 'Enter'); assert.strictEqual(i.value, 's0');
  ok('the whole index through the bar: ArrowDown on an empty box, show more (click or Enter) pages to every row of 6,000, quick; list-only boxes use their list as the index; "not sent" said');
}

let T14 = null;
// 14 the picker: data view (GET /api/x/ide/vdir with the mod), exts filter, "reading" state, paging, data entry; falls back to the disk
// with a plain note when the game data cannot be read; the default Browse on a phone (RMT) shows the data view, an asked-for disk is refused
{
  const page = require('../page.js');
  const fns = ['pick', 'pkHint', 'pkExtOk', 'pkRec', 'pkLoad', 'pkData', 'pkFall', 'pkShown', 'pkRender', 'pkMark', 'pkOpen', 'pkDone', 'recGet', 'h'].map(BC.fnSrc).join('\n');
  const vars = /^var PKLIM=.*$/m.exec(page)[0], pkr = /^searchKit\.picker=function.*(?:\n .*)*/m.exec(page)[0];
  function picker(opt) {
    const doc = FD.make(), store = {}, calls = [], toasts = [];
    const LS = { get: (k, d) => (k in store ? store[k] : d), set: (k, v) => { store[k] = v; } };
    const tx = (k, a) => { let s = en[k] == null ? k : en[k]; for (const x in a || {}) s = s.split('{' + x + '}').join(String(a[x])); return s; };
    const api = u => { calls.push(u); const r = opt.api(u, calls.length); return r instanceof Error ? Promise.reject(r) : Promise.resolve(r); };
    const S = { mod: opt.mod || '' }, PK = { cb: null, mode: 'dir', dir: null, sel: -1, items: [], shown: [] }, searchKit = {};
    const env = new Function('document', 'LS', 'tx', 'api', 'S', 'PK', 'RMT', 'searchKit', 'toast', 'curFolder', 'join', 'recAdd',
      'var $=function(i){return document.getElementById(i)};\n' + fns + '\n' + vars + '\n' + pkr + '\nreturn {pick:pick,pkOpen:pkOpen,pkLoad:pkLoad};');
    const P = env(doc, LS, tx, api, S, PK, !!opt.rmt, searchKit, m => toasts.push(m), () => opt.game || '', (a, b) => a + '/' + b, (k, p) => { store['pk.recent.' + k] = [p]; });
    return { doc, P, PK, calls, toasts, store, kitPick: searchKit.picker, list: () => doc.getElementById('pklist').children.map(c => c.textContent.trim()) };
  }
  const tick = () => new Promise(r => setImmediate(r));
  T14 = async () => {
    // data view: mod sent, rows, exts, where marks, "more" page, the pick
    const V = { dir: 'entity/tank', dirs: ['german'], files: [{ name: 'tiger.def', key: 'resource/entity/tank/tiger.def', where: 'mine', layer: 'this mod' }, { name: 'tiger.mdl', key: 'resource/entity/tank/tiger.mdl', where: 'vanilla', layer: 'game' }, { name: 'panther.def', key: 'resource/entity/tank/panther.def', where: 'vanilla', layer: 'game', pak: 'entity.pak' }], total: 5, off: 0, next: 3, ver: 'v1' };
    const V2 = { dir: 'entity/tank', dirs: [], files: [{ name: 'tiger2.def', key: 'resource/entity/tank/tiger2.def', where: 'othermod', layer: 'x' }, { name: 'zz.txt', key: 'resource/entity/tank/zz.txt', where: 'vanilla', layer: 'game' }], total: 5, off: 3, next: null, ver: 'v1' };
    let got = null; const A = picker({ mod: 'M:/mods/m', game: 'M:', api: u => (/off=3/.test(u) ? V2 : V) });
    A.kitPick({ mode: 'file', start: 'resource/entity/tank/', view: 'data', exts: ['def'], out: false, def: false }, (p, e) => { got = { p, e }; });
    assert.ok(A.doc.getElementById('pk').open); assert.ok(A.list()[0] === en['pk.reading'], 'reading state while the view is read: ' + A.list()[0]);
    assert.ok(/^\/api\/x\/ide\/vdir\?mod=M%3A%2Fmods%2Fm&dir=entity%2Ftank&lim=2000$/.test(A.calls[0]), 'vdir with the mod, resource/ dropped: ' + A.calls[0]);
    await tick();
    const L1 = A.list(); assert.deepStrictEqual(L1, ['[ ] german', 'tiger.def   ' + en['pk.wMine'], 'panther.def', en['pk.moreRows'].replace('{n}', '2')], 'folders, .def files only, marks: ' + JSON.stringify(L1));
    assert.strictEqual(A.doc.getElementById('pkpath').value, 'entity/tank'); assert.ok(A.doc.getElementById('pkhint').textContent.includes(en['pk.hintData']));
    A.PK.sel = 3; A.P.pkOpen(); await tick();
    assert.ok(/off=3&ver=v1/.test(A.calls[1]), 'the next page of the same list'); assert.deepStrictEqual(A.list().slice(-2), ['panther.def', 'tiger2.def   ' + en['pk.wOther']], 'page 2 appended, more row gone, .txt left out');
    A.PK.sel = 1; A.P.pkOpen(); assert.ok(!A.doc.getElementById('pk').open);
    assert.strictEqual(got.p, 'entity/tank/tiger.def'); assert.deepStrictEqual(got.e, { view: 'data', path: 'entity/tank/tiger.def', key: 'resource/entity/tank/tiger.def', name: 'tiger.def', where: 'mine', layer: 'this mod', pak: null });
    assert.deepStrictEqual(A.store['pk.recent.dfile'], ['entity/tank/tiger.def'], 'data picks kept apart from disk picks');
    // no game folder: a plain note, then the disk at the mod
    const B = picker({ mod: 'M:/mods/m', api: u => (/vdir/.test(u) ? { dir: '', dirs: [], files: [], notes: ['no-game'] } : { dir: 'M:/mods/m', parent: 'M:/mods', entries: [{ name: 'resource' }], files: ['a.def', 'b.txt'] }) });
    B.kitPick({ mode: 'file', start: 'map', view: 'data', exts: ['def'], def: false }, () => {}); await tick(); await tick();
    assert.ok(/^\/api\/ls\?files=1&dir=M%3A%2Fmods%2Fm/.test(B.calls[1]), 'fell back to the disk at the mod: ' + B.calls[1]);
    assert.ok(B.doc.getElementById('pkhint').textContent.startsWith(en['pk.noData']), 'the note says why'); assert.deepStrictEqual(B.list(), ['[ ] resource', 'a.def'], 'exts filter on the disk too');
    assert.strictEqual(B.doc.getElementById('pkview').textContent, en['pk.toData'], 'the switch offers the game data again');
    // a refused mod: the game alone; then a broken view: disk
    const C = picker({ mod: 'M:/notamod', game: 'G:', api: (u, n) => (n === 1 ? Object.assign(new Error('Refused'), { status: 400 }) : n === 2 ? Object.assign(new Error('boom'), { status: 500 }) : { dir: null, roots: [{ name: 'home', path: 'H:' }] }) });
    C.kitPick({ mode: 'dir', start: '', view: 'data', def: false }, () => {}); for (let x = 0; x < 6; x++) await tick();
    assert.ok(/mod=/.test(C.calls[0]) && !/mod=/.test(C.calls[1]), 'a refused mod: asked again without it'); assert.ok(/^\/api\/ls\?/.test(C.calls[2]), 'a broken view: the disk');
    assert.ok(C.doc.getElementById('pkhint').textContent.includes('boom'));
    // default Browse: disk at the mod, else the game folder; on a phone: the data view; an asked-for disk on a phone: refused
    const D = picker({ mod: '', game: 'G:', api: () => ({ dir: 'G:', parent: null, entries: [], files: [] }) });
    D.kitPick({ mode: 'file', start: '', view: 'disk', def: true }, () => {}); assert.ok(/dir=G%3A/.test(D.calls[0]), 'default: the game folder when no mod');
    const R = picker({ rmt: true, game: 'G:', api: () => ({ dir: '', dirs: ['map'], files: [] }) });
    R.kitPick({ mode: 'file', start: '', view: 'disk', def: true }, () => {}); assert.ok(/ide\/vdir/.test(R.calls[0]), 'phone, default Browse: the game data (read only routes)');
    assert.strictEqual(R.doc.getElementById('pkview').hidden, true, 'no disk switch on a phone');
    R.kitPick({ mode: 'file', start: 'X:', view: 'disk', def: false }, () => {}); assert.strictEqual(R.toasts.length, 1, 'phone, disk asked: the view-only note');
    ok('picker data view: vdir with the mod, reading state, folders/files with marks, exts, paged; the pick gives the game path and entry; falls back to the disk with a note (no game, broken view), drops a refused mod; phone: data view only');
  };
}

// 10 beside: typing shows only matching history rows (no index call, no index rows), arrows and Enter are the page's, History is full
{
  const W = world(), i = input(W), asked = [];
  const k = W.searchKit(i, { key: 't.bes', beside: true, index: (q, d) => { asked.push(q); d([{ label: 'Tiger idx', value: 'tidx' }]); }, list: d => d([]) });
  k.remember('panther'); k.remember('tiger one');
  i.fire('click'); W.flush(); assert.strictEqual(k.isOpen(), false, 'no list on an empty box');
  type(i, 'tig'); W.flush();
  assert.strictEqual(k.isOpen(), true); assert.deepStrictEqual(asked, [], 'the index is not asked: the page list is the index view');
  assert.strictEqual(opts(k.list).length, 1, 'only the matching history row, no clear row, no index rows'); assert.ok(labs(k.list)[0].includes('tiger one'));
  const e1 = key(i, 'ArrowDown'); assert.ok(!e1._sk && !e1.prevented && !e1.stopped, 'ArrowDown goes to the page list'); assert.strictEqual(k.isOpen(), false, 'and the kit list steps aside');
  type(i, 'tig'); W.flush(); const e2 = key(i, 'Enter'); assert.ok(!e2._sk && !e2.stopped, 'Enter is the page\'s'); assert.strictEqual(i.value, 'tig'); assert.strictEqual(k.history()[0], 'tig');
  type(i, 'pan'); W.flush(); k.list.fire('click', { target: opts(k.list)[0] }); assert.strictEqual(i.value, 'panther', 'a click on a history row picks it');
  k.historyButton.fire('click'); W.flush(); assert.ok(opts(k.list).some(o => o.className.includes('sk-clear')), 'History shows the whole history with clear');
  const e3 = key(i, 'ArrowDown'); assert.ok(e3._sk && e3.stopped, 'arrows work in the History list'); const e4 = key(i, 'Enter'); assert.ok(e4._sk); assert.strictEqual(i.value, 'panther');
  ok('beside: typing shows only matching history (index not asked), arrows and Enter stay with the page list, History opens the whole history');
}

// 11 the open list is fixed at the box: below it, or above when there is no room below; a transformed ancestor's offset is taken off
{
  const lis = {}, win = { innerWidth: 1000, innerHeight: 800, addEventListener(t, f, c) { lis[t] = { f, c }; }, removeEventListener(t, f) { if (lis[t] && lis[t].f === f) delete lis[t]; } };
  const W = world(win), i = input(W), host = W.doc.createElement('div'); host.style.overflow = 'hidden'; host.appendChild(i);
  const k = W.searchKit(i, { key: 't.fix', index: (q, d) => d([{ label: 'Tiger', value: 'tiger' }]), list: d => d([]) });
  let at = { left: 100, top: 700, bottom: 720, width: 200, height: 20 };
  i.getBoundingClientRect = () => at; k.el.getBoundingClientRect = () => ({ left: at.left, top: at.top, bottom: at.bottom, width: 260, height: 20 });
  const OX = 50, OY = 30;   // where the containing block starts (a transformed parent)
  k.list.getBoundingClientRect = () => ({ left: parseFloat(k.list.style.left) + OX, top: parseFloat(k.list.style.top) + OY, width: 300, height: 200 });
  type(i, 'ti'); W.flush();
  assert.ok(k.isOpen() && /\bsk-fix\b/.test(k.list.className) && /\bsk-up\b/.test(k.list.className), 'no room below: fixed and upward');
  assert.strictEqual(k.list.style.top, (700 - 2 - 200 - OY) + 'px'); assert.strictEqual(k.list.style.left, (100 - OX) + 'px');
  assert.ok(parseFloat(k.list.style.maxHeight) <= 692 && k.list.style.minWidth === '260px', 'height kept in the room above, at least the box wide');
  assert.ok(lis.scroll && lis.scroll.c === true && lis.resize, 'it follows scroll (any scroller) and resize while open');
  at = { left: 950, top: 100, bottom: 120, width: 40, height: 20 }; lis.resize.f({ target: win }); W.flush();
  assert.ok(!/\bsk-up\b/.test(k.list.className), 'room below: downward'); assert.strictEqual(k.list.style.top, (122 - OY) + 'px');
  assert.strictEqual(k.list.style.left, (1000 - 8 - 300 - OX) + 'px', 'kept inside the window on the right');
  key(i, 'Escape'); assert.ok(!lis.scroll && !lis.resize, 'listeners gone when the list shuts');
  const W2 = world(), j = input(W2), k2 = W2.searchKit(j, { key: 't.fix2', index: (q, d) => d([{ label: 'A', value: 'a' }]), list: d => d([]) });
  type(j, 'a'); W2.flush(); assert.ok(k2.isOpen() && k2.list.className === 'sk-dd', 'no window or layout (test DOMs): it stays absolute under the box');
  ok('the list is fixed at the box (not cut by overflow), flips upward when there is no room below, allows for a transformed parent, follows scroll/resize');
}

// 12 Enter, arrows and Escape the kit used do not reach the page around the box; an Enter it did not use does
{
  const W = world(), i = input(W);
  const k = W.searchKit(i, { key: 't.ent', index: (q, d) => d([{ label: 'Tiger', value: 'tiger' }]), list: d => d([]) });
  type(i, 'ti'); W.flush(); const a = key(i, 'ArrowDown'); assert.ok(a._sk && a.stopped);
  const e = key(i, 'Enter'); assert.ok(e._sk && e.prevented && e.stopped, 'a pick by Enter is stopped (the guided task does not go Next)'); assert.strictEqual(i.value, 'tiger');
  const e2 = key(i, 'Enter'); assert.ok(!e2._sk && !e2.prevented && !e2.stopped, 'Enter on a shut list goes on to the page');
  type(i, 'ti'); W.flush(); const e3 = key(i, 'Enter'); assert.ok(!e3._sk && !e3.stopped, 'an open list with no row chosen: Enter is the page\'s'); assert.strictEqual(k.isOpen(), false);
  type(i, 'ti'); W.flush(); const e4 = key(i, 'Escape'); assert.ok(e4._sk && e4.stopped);
  // the guided task's boxes no longer stop every Enter first: only the Enter they use themselves (Find)
  const T = ['../ext/task/client.js', '../ext/task/recipes/x-thing.client.js', '../ext/task/recipes/x-mod.client.js', '../ext/task/recipes/text.client.js'].map(p => fs.readFileSync(path.join(__dirname, p), 'utf8')).join('\n');
  assert.ok(!/key\s*===\s*['"]Enter['"]\s*&&\s*e\.stopPropagation\)\s*e\.stopPropagation\(\);\s*if\s*\(e\._sk\)/.test(T), 'no per-box stop of every Enter before the kit check');
  ok('a key the kit used (Enter pick, arrows, Escape) is stopped as well as marked; an Enter it did not use reaches the page');
}

// 13 forms: buildForm gives a kit to boxes that name an existing thing (paths, maps, units, installed mods), plain boxes elsewhere
{
  const page = require('../page.js');
  const vars = ['DIRNAMES', 'FKMODNAME'].map(v => { const m = new RegExp('^var ' + v + '=.*$', 'm').exec(page); assert.ok(m, v); return m[0]; }).join('\n');
  const fkKind = new Function(vars + '\n' + BC.fnSrc('fkKind') + '\nreturn fkKind;')();
  const K = (c, t, nm) => fkKind(c, { type: t, name: nm });
  assert.strictEqual(K('play', 'path', 'mod'), 'dir'); assert.strictEqual(K('upgrade', 'path', 'out'), 'dir'); assert.strictEqual(K('gen', 'path', 'spec'), 'file');
  assert.strictEqual(K('play', 'str', 'map'), 'map'); assert.strictEqual(K('gohport', 'str', 'donor'), 'unit'); assert.strictEqual(K('edrun', 'list', 'mods'), 'mods');
  assert.strictEqual(K('uninstall', 'str', 'name'), 'modname'); assert.strictEqual(K('install', 'str', 'name'), null, 'a new folder name stays plain');
  assert.strictEqual(K('new', 'str', 'name'), null); assert.strictEqual(K('new', 'str', 'desc'), null); assert.strictEqual(K('play', 'int', 'port'), null); assert.strictEqual(K('play', 'bool', 'mod'), null);
  assert.ok(/fk=fkKind\(cmdId,f\),kit=fk\?fkMake\(inp,f,fk\):null/.test(page) && /key:'form\.'\+f\.name/.test(page), 'buildForm makes the kit with history form.<field>');
  for (const l of ['en', 'ru', 'uk', 'zh']) { const J = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'lang', l + '.json'), 'utf8')); for (const x of ['sk.showMore', 'sk.more', 'pk.toData', 'pk.toDisk', 'pk.reading', 'pk.noData', 'pk.moreRows', 'fk.g.recent', 'fk.g.mod', 'fk.g.game', 'fk.g.mods', 'fk.g.maps', 'fk.g.units', 'fk.g.stuff']) assert.ok(J[x], l + ' ' + x); }
  const core = fs.readFileSync(path.join(__dirname, '..', 'ext', 'ide', 'ui', 'core.js'), 'utf8');
  assert.ok(!/k\.close\(\)/.test(core.slice(core.indexOf('function kitOn'), core.indexOf('IDE.kitOn=kitOn'))), 'the Editor no longer shuts the kit list on each key (beside is the kit\'s own)');
  ok('forms: path, map, unit, mod-name and mods boxes get a kit (history form.<field>), new names and free text stay plain; texts in 4 languages; the Editor uses beside');
}
T14().then(() => console.log('PASS searchKit (' + n + ')'), e => { console.error(e); process.exit(1); });

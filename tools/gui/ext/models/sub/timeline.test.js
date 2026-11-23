// models timeline part test: the four languages have the same keys (all models.tl.*), every key is used; the client string obeys the
// page rules and has no colour literals; its pure helpers; with a stand-in DOM and canvas against a real edit document
// (tools/lib/model/edit/core.js): rows, keys drawn only in the page's CSS variable colours and redrawn on a theme change, scrub on the
// ruler, drag a key (one anm.key.move), select a range and fill between, Ctrl+wheel zoom, wheel step, the right-click menu, the
// sequence rows (speed in steps of 0.1 saved to the .mdl, add a sequence). Synthetic files only.
// usage: node timeline.test.js <scratch dir>
// Author: Imperator_Aug (ARSENAL, ia-91e554ee)
const fs = require('fs'), path = require('path'), assert = require('assert');
const scratch = path.resolve(process.argv[2] || path.join(require('os').tmpdir(), 'models-timeline-test'));
require('../../../../lib/testscratch').guard(scratch);   // never wipe a shared root, the repo, a game or a mod
fs.rmSync(scratch, { recursive: true, force: true }); fs.mkdirSync(scratch, { recursive: true });
const script = require('./timeline.client'), L = require('./timeline.lang.json');
let n = 0; const ok = m => { n++; console.log('ok ' + n + ' ' + m); };

(async () => {
  // ---------- languages ----------
  const en = Object.keys(L.en).sort();
  assert.deepStrictEqual(Object.keys(L).sort(), ['en', 'ru', 'uk', 'zh']);
  for (const l of ['ru', 'uk', 'zh']) assert.deepStrictEqual(Object.keys(L[l]).sort(), en, 'same keys in ' + l);
  for (const l of Object.keys(L)) for (const k of en) {
    assert.ok(k.startsWith('models.tl.'), k); assert.ok(L[l][k] && L[l][k].trim(), l + ' ' + k);
    assert.deepStrictEqual((L[l][k].match(/\{\w+\}/g) || []).sort(), (L.en[k].match(/\{\w+\}/g) || []).sort(), 'slots ' + l + ' ' + k);
    assert.ok(!/ [–—-] /.test(L[l][k]) && !/\[[VIT]\]/.test(L[l][k]), 'no dash as punctuation, no marks ' + l + ' ' + k);
  }
  const base = require('../lang.json').en;
  for (const k of en) assert.ok(!(k in base), 'no clash with ../lang.json ' + k);
  for (const k of en) { const m = /^(models\.tl\.(?:ease|seq\.flag))\.(\w+)$/.exec(k); assert.ok(script.includes("'" + k + "'") || (m && script.includes("'" + m[1] + "'") && script.includes("'" + m[2] + "'")), 'key used ' + k); }
  for (const m of script.matchAll(/'(models\.tl\.[a-zA-Z0-9_.]+)'/g)) if (!['models.tl.zoom', 'models.tl.ease', 'models.tl.seq.flag'].includes(m[1])) assert.ok(L.en[m[1]], 'text key ' + m[1]);
  ok('4 languages, same keys and slots, every key used and every used key there (' + en.length + ')');

  // ---------- client string ----------
  assert.strictEqual(typeof script, 'string');
  assert.ok(!/[`]|\$\{|innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(/.test(script), 'page rules');
  assert.ok(/^\s*\(function\(\)\{/.test(script) && /\}\)\(\);\s*$/.test(script), 'one function, no new global names');
  assert.ok(!/#[0-9a-fA-F]{3,6}\b|rgba?\(|hsla?\(/.test(script), 'no colour literals');
  assert.ok(/getComputedStyle/.test(script) && /MutationObserver/.test(script) && /prefers-color-scheme/.test(script), 'reads the variables, follows the theme');
  ok('client: page rules, one function, colours only from CSS variables, theme followed');

  // ---------- stand-in browser ----------
  const VARS = { '--card': 'C1', '--line2': 'C2', '--line': 'C3', '--hint': 'C4', '--fg': 'C5', '--acc': 'C6', '--err': 'C7', '--sel': 'C8', '--bad': 'C9', '--ok': 'C10', '--th': 'C11', '--hov': 'C12' };
  let vars = Object.assign({}, VARS);
  const all = [], paints = [];
  function E(tag, a, kids) {
    const e = { tagName: tag.toUpperCase(), attrs: {}, children: [], parentNode: null, listeners: {}, style: {}, textContent: '', value: '', checked: false, className: '', isConnected: true,
      width: 0, height: 0, clientWidth: 600, scrollLeft: 0,
      get firstChild() { return this.children[0] || null; },
      appendChild(c) { if (c) { c.parentNode = this; this.children.push(c); } return c; }, removeChild(c) { this.children.splice(this.children.indexOf(c), 1); c.parentNode = null; return c; },
      addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); }, removeEventListener() {},
      fire(t, ev) { (this.listeners[t] || []).forEach(f => f(Object.assign({ target: this, button: 0, preventDefault() {} }, ev || {}))); },
      focus() {}, contains(x) { return x === this || this.children.some(c => c.contains && c.contains(x)); }, getBoundingClientRect() { return { left: 0, top: 0 }; } };
    for (const [k, v] of Object.entries(a || {})) { if (v == null) continue; if (k === 'text') e.textContent = String(v); else if (k === 'class') e.className = v; else if (k === 'value') e.value = String(v); else if (k === 'checked') e.checked = !!v;
      else if (/^on/.test(k) && typeof v === 'function') e.addEventListener(k.slice(2), v); else e.attrs[k] = v; }
    if (tag === 'canvas') {
      const g = {}; let fs0 = '', ss0 = '';
      Object.defineProperty(g, 'fillStyle', { get: () => fs0, set: v => { fs0 = v; paints.push(v); } });
      Object.defineProperty(g, 'strokeStyle', { get: () => ss0, set: v => { ss0 = v; paints.push(v); } });
      for (const f of ['fillRect', 'strokeRect', 'beginPath', 'moveTo', 'lineTo', 'closePath', 'fill', 'stroke', 'fillText']) g[f] = () => {};
      e.getContext = () => g;
    }
    (kids || []).forEach(c => e.appendChild(c)); all.push(e); return e;
  }
  const docListeners = {}, body = E('body');
  const document = { documentElement: {}, body, addEventListener(t, f) { (docListeners[t] = docListeners[t] || []).push(f); },
    removeEventListener(t, f) { const a = docListeners[t] || []; const i = a.indexOf(f); if (i >= 0) a.splice(i, 1); }, fire(t, ev) { (docListeners[t] || []).slice().forEach(f => f(Object.assign({ target: null }, ev))); } };
  let mutate = null, mqFn = null;
  function MutationObserver(fn) { mutate = fn; this.observe = () => {}; this.disconnect = () => {}; }
  const window = { getComputedStyle: () => ({ getPropertyValue: k => vars[k] || '' }), matchMedia: () => ({ addEventListener: (t, f) => { mqFn = f; }, removeEventListener() {} }), confirm: () => true };
  const store = {}, LSx = { get: (k, d) => k in store ? store[k] : d, set: (k, v) => { store[k] = v; } };
  const txf = (k, p) => k + (p ? JSON.stringify(p) : '');
  const EXT = { models: { subs: {}, parts: {} } };
  new Function('EXT_SCREENS', 'LS', 'tx', 'window', 'document', 'MutationObserver', script)(EXT, LSx, txf, window, document, MutationObserver);
  const T = EXT.models.parts.timeline, H = T._t;

  // ---------- helpers ----------
  assert.strictEqual(H.frameAt(53, 12, 10), 4); assert.strictEqual(H.frameAt(-5, 12, 10), 0); assert.strictEqual(H.frameAt(9999, 12, 10), 9);
  assert.deepStrictEqual(H.rowAt(5, 3), { kind: 'ruler' }); assert.deepStrictEqual(H.rowAt(H.RULER + 2, 3), { kind: 'events' });
  assert.deepStrictEqual(H.rowAt(H.RULER + H.RH * 2 + 1, 3), { kind: 'bone', index: 1 }); assert.deepStrictEqual(H.rowAt(H.RULER + H.RH * 9, 3), { kind: 'none' });
  assert.deepStrictEqual(H.norm(5, 2), [2, 5]); assert.ok(H.inRange(3, [2, 5]) && !H.inRange(6, [2, 5]) && !H.inRange(3, null));
  assert.deepStrictEqual(H.hiddenSpans([[0, true], [3, false], [6, true], [8, false]], 10), [[3, 5], [8, 9]]);
  assert.strictEqual(H.zoomed(12, 1), 15); assert.strictEqual(H.zoomed(60, 1), 60); assert.strictEqual(H.zoomed(2, -1), 2);
  assert.strictEqual(H.fitZoom(604, 50), 12); assert.strictEqual(H.seconds(100, 2), 1); assert.strictEqual(H.seconds(50, -0.5), 2);
  assert.strictEqual(H.tick(12), 5); assert.strictEqual(H.tick(40), 1);
  assert.strictEqual(H.speedOk('1,25'), 1.3); assert.strictEqual(H.speedOk('0'), null); assert.strictEqual(H.speedOk('x'), null);
  ok('helpers: frame and row under the mouse, range, hidden spans, zoom steps and fit, seconds at 50 fps times speed, ruler ticks, speed in 0.1');

  // ---------- against a real document ----------
  const toolsDir = path.resolve(__dirname, '..', '..', '..', '..');
  const coreFile = path.join(toolsDir, 'lib', 'model', 'edit', 'core.js');
  if (!fs.existsSync(coreFile)) { console.log('PASS models timeline (' + n + ')'); return; }
  const C = require(coreFile), An = require(path.join(toolsDir, 'lib', 'model', 'anm')), ops0 = require(path.join(toolsDir, 'soedit', 'ops', 'animops'));
  const emod = path.join(scratch, 'editmod'), EDIR = 'resource/entity/test/car/', MDL = EDIR + 'car.mdl', OPEN = EDIR + 'open.anm';
  const mdlText = ['{Skeleton', '\t{bone "body"', '\t\t{Position 0 0 10}', '\t\t{bone "door_l"', '\t\t\t{Position 0 20 0}', '\t\t}', '\t\t{bone "door_r"', '\t\t\t{Position 0 -20 0}', '\t\t}', '\t}',
    '\t{animation', '\t\t{sequence "open" {file "open.anm"} {speed 2}}', '\t}', '}', ''].join('\r\n');
  const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  let o = ops0.newAnimation(['body', 'door_l', 'door_r'], 10, [I3.concat([0, 0, 10]), I3.concat([0, 20, 0]), I3.concat([0, -20, 0])], 0x60000);
  o = An.setMatrix(o, 4, 'door_l', Float32Array.from([0, 1, 0, -1, 0, 0, 0, 0, 1, 40, 20, 0]));
  fs.mkdirSync(path.join(emod, EDIR), { recursive: true });
  fs.writeFileSync(path.join(emod, MDL), mdlText); fs.writeFileSync(path.join(emod, OPEN), An.write(o));
  const doc = C.open({ mod: emod, mdl: MDL, game: null });
  const opsRun = [], fns = [];
  const D = { id: doc.id, sel: { bone: null, volume: null, anm: OPEN, frame: 0 },
    on(fn) { fns.push(fn); return () => {}; }, emit(ev) { fns.slice().forEach(f => f(ev)); },
    select(x) { const s = {}; for (const k of ['bone', 'volume', 'anm', 'frame']) s[k] = k in x ? x[k] : D.sel[k]; D.sel = s; D.emit({ type: 'select', sel: s }); },
    op(nm, a) { opsRun.push([nm, a]); return new Promise((res, rej) => { try { const r = doc.apply(nm, a); D.emit({ type: 'change' }); res(r); } catch (e) { rej(e); } }); },
    state(nm, q) { return new Promise((res, rej) => { try { res(doc.state(nm, q || {})); } catch (e) { rej(e); } }); },
    undo() { doc.undo(); D.emit({ type: 'change' }); }, redo() { doc.redo(); D.emit({ type: 'change' }); } };
  // the shared state the Animation part keeps (anim.client.js load())
  const steps = [];
  const SH = EXT.models.animShared = { go: f => D.select({ frame: f }), step: d => steps.push(d), pause() {}, edit() { SH.edited = true; } };
  function refresh() { const info = doc.state('anm.get', { rel: OPEN }), tl = doc.state('tl.get', { rel: OPEN }); info.sequences = tl.sequences; info.events = tl.events; SH.rel = OPEN; SH.frames = info.frames; SH.info = info; if (SH.redraw) SH.redraw(); }
  D.on(ev => { if (ev.type === 'change') refresh(); });
  refresh();
  const part = T({ el: E, doc: D }, {});
  const tick = () => new Promise(r => setImmediate(r)), settle = async () => { for (let i = 0; i < 8; i++) await tick(); };
  const cv = all.find(e => e.tagName === 'CANVAS'), labels = cv.parentNode.parentNode.children[0];
  assert.strictEqual(labels.children.length, 2 + 3, 'ruler, events and 3 bone rows');
  assert.strictEqual(cv.width, 10 * 12 + 4); assert.strictEqual(cv.height, H.RULER + H.RH * 4);
  const vals = new Set(Object.values(VARS));
  assert.ok(paints.length > 5 && paints.every(p => vals.has(p)), 'every colour drawn is a CSS variable: ' + [...new Set(paints)].join(','));
  assert.ok(paints.includes('C6'), 'keys in --acc'); assert.ok(paints.includes('C7'), 'cursor in --err');
  // theme change: new values, redraw through the MutationObserver and the media query
  vars = Object.fromEntries(Object.entries(VARS).map(([k, v]) => [k, 'D' + v.slice(1)])); paints.length = 0; mutate();
  assert.ok(paints.length > 5 && paints.every(p => /^D\d+$/.test(p)), 'redrawn in the new colours');
  paints.length = 0; mqFn(); assert.ok(paints.length > 5, 'redrawn on prefers-color-scheme');
  ok('draws: rows for each bone, sized by frames and zoom, colours only from the CSS variables, redrawn on data-theme and on prefers-color-scheme');

  // mouse: scrub on the ruler
  const at = (f, row) => ({ clientX: f * 12 + 6, clientY: row < 0 ? 5 : H.RULER + H.RH * row + H.RH / 2 });
  cv.fire('mousedown', at(3, -1)); document.fire('mousemove', at(6, -1)); document.fire('mouseup', at(6, -1));
  assert.strictEqual(D.sel.frame, 6, 'scrub');
  // drag the door_l key at 4 to 7: one anm.key.move
  const before = opsRun.length;
  cv.fire('mousedown', at(4, 2)); document.fire('mousemove', at(5, 2)); document.fire('mousemove', at(7, 2)); document.fire('mouseup', at(7, 2)); await settle();
  assert.strictEqual(opsRun.length, before + 1, 'one op for the whole drag');
  assert.deepStrictEqual(opsRun[opsRun.length - 1], ['anm.key.move', { rel: OPEN, bone: 'door_l', from: 4, to: 7 }]);
  assert.deepStrictEqual(doc.state('anm.get', { rel: OPEN }).bones[1].keys, [0, 7]);
  assert.strictEqual(D.sel.frame, 7); assert.strictEqual(D.sel.bone, 'door_l');
  // select a range by dragging on an empty spot, then fill between with an ease
  cv.fire('mousedown', at(1, 1)); document.fire('mousemove', at(6, 1)); document.fire('mouseup', at(6, 1));
  assert.deepStrictEqual(SH.range, [1, 6]);
  const btn = t => all.find(e => e.tagName === 'BUTTON' && e.textContent === t);
  const ease = all.find(e => e.tagName === 'SELECT' && e.attrs['aria-label'] === 'models.tl.ease'); ease.value = 'inout';
  btn('models.tl.interp').fire('click'); await settle();
  assert.deepStrictEqual(opsRun[opsRun.length - 1], ['anm.interpolate', { rel: OPEN, from: 1, to: 6, ease: 'inout' }]);
  // Shift+click stretches from the current frame
  D.select({ frame: 2 }); cv.fire('mousedown', Object.assign(at(8, 3), { shiftKey: true })); document.fire('mouseup', at(8, 3));
  assert.deepStrictEqual(SH.range, [2, 8]);
  // drag inside the range moves those frames
  SH.range = [2, 3]; cv.fire('mousedown', at(2, 1)); document.fire('mousemove', at(5, 1)); document.fire('mouseup', at(5, 1)); await settle();
  assert.deepStrictEqual(opsRun[opsRun.length - 1], ['anm.frames.move', { rel: OPEN, from: 2, to: 3, at: 5 }]);
  assert.deepStrictEqual(SH.range, [5, 6]);
  // a click on a bone row picks the frame and the bone; double-click opens the pose form
  cv.fire('mousedown', at(2, 3)); document.fire('mouseup', at(2, 3));
  assert.ok(D.sel.frame === 2 && D.sel.bone === 'door_r' && SH.range === null);
  cv.fire('dblclick', at(1, 2)); assert.ok(SH.edited && D.sel.bone === 'door_l' && D.sel.frame === 1);
  // wheel: step; Ctrl+wheel: zoom
  cv.fire('wheel', { deltaY: 100 }); assert.deepStrictEqual(steps, [1]);
  cv.fire('wheel', { deltaY: -100, ctrlKey: true }); assert.strictEqual(cv.width, 10 * 15 + 4, 'zoomed in'); assert.strictEqual(store['models.tl.zoom'], '15');
  cv.fire('wheel', { deltaY: 100, ctrlKey: true });
  ok('mouse: scrub, drag a key (one anm.key.move), drag a range, fill between with an ease, Shift+click, move frames, click, double-click, wheel step, Ctrl+wheel zoom');

  // right-click menu
  cv.fire('contextmenu', at(3, 1));
  const menu = body.children[body.children.length - 1];
  assert.strictEqual(menu.attrs.role, 'menu'); assert.strictEqual(menu.children.length, 17);
  menu.children.find(b => b.textContent === 'models.tl.m.insert').fire('click'); await settle();
  assert.deepStrictEqual(opsRun[opsRun.length - 1], ['anm.frames.insert', { rel: OPEN, at: 4, count: 1 }]);
  assert.ok(!menu.parentNode, 'menu closed');
  cv.fire('contextmenu', at(3, 1)); body.children[body.children.length - 1].children.find(b => b.textContent === 'models.tl.m.undo').fire('click'); await settle();
  assert.strictEqual(doc.state('anm.get', { rel: OPEN }).frames, 10, 'undo from the menu');
  ok('right-click menu: 17 items, insert after, undo, closes after a pick');

  // sequences
  const sp = all.filter(e => e.attrs['aria-label'] === 'models.tl.seq.speed').pop();
  assert.strictEqual(sp.value, '2');
  sp.value = '1,26'; all.filter(e => e.textContent === 'models.tl.seq.save').pop().fire('click'); await settle();
  const setOp = opsRun[opsRun.length - 1];
  assert.strictEqual(setOp[0], 'tl.seq.set'); assert.strictEqual(setOp[1].sequence, 'open'); assert.strictEqual(setOp[1].fields.speed, 1.3);
  assert.ok(/\{speed 1\.3\}/.test(doc.bytes(MDL).toString('latin1')), 'speed 1.3 in the .mdl, not rounded to a whole number');
  assert.ok(all.some(e => /models\.tl\.seq\.len/.test(e.textContent) && /"f":10,"s":0\.154/.test(e.textContent)), 'length in seconds at 50 fps times 1.3');
  const nn = all.filter(e => e.attrs['aria-label'] === 'models.tl.seq.name' && e.attrs.placeholder).pop(); nn.value = 'shut';
  all.filter(e => e.textContent === 'models.tl.seq.add').pop().fire('click'); await settle();
  assert.deepStrictEqual(opsRun[opsRun.length - 1], ['tl.seq.add', { name: 'shut', file: 'open.anm' }]);
  assert.deepStrictEqual(doc.state('tl.get', {}).sequences.map(s => s.name), ['open', 'shut']);
  C.close(doc.id);
  ok('sequences: speed saved in steps of 0.1 to the .mdl, length in seconds, add a sequence for the open animation');
  assert.ok(part && part.children.length > 3);
  console.log('PASS models timeline (' + n + ')');
})().catch(e => { console.error(e); process.exit(1); });

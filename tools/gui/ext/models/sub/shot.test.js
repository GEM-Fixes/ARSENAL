// Models page part `shot` test: (1) the same keys and slots in en ru uk zh, a text for every key the script names; (2) the client
// string obeys the page rules, parses and sets the Model sub-tab hook (keeping one set before it); (3) helpers: side to azimuth and
// elevation, typed pair limits, request body, ray end; (4) with a fake DOM, a fake document and a fake 3D view: the bar sits under
// the view, shared gun / shell / range keys, a pick (document select event) from each side sends the right effects body, typed
// azimuth and elevation, a wrong pair sends nothing, carry and Fresh tank, a pose change is not a pick, the ray is drawn, a late
// answer (tool closed, newer shot, sub-tab left) is ignored, an edit of the document runs the last shot again with prev, carry
// stops that rerun. No browser.
// usage: node shot.test.js [scratch]     last line: PASS models shot (N)
// Author: Imperator_Aug (ARSENAL, ia-7a304a69)
'use strict';
const vm = require('vm'), assert = require('assert');
let n = 0; const ok = m => { n++; console.log('ok ' + n + ' ' + m); };
const tick = () => new Promise(r => setImmediate(r));

(async () => {
  const L = require('./shot.lang.json'), script = require('./shot.client');
  const en = Object.keys(L.en).sort();
  assert.ok(en.length > 20 && en.every(k => k.startsWith('models.shot.')), 'keys start models.shot.');
  for (const c of ['ru', 'uk', 'zh']) {
    assert.deepStrictEqual(Object.keys(L[c]).sort(), en, 'same keys in ' + c);
    for (const k of en) { assert.ok(L[c][k], c + ' ' + k); assert.deepStrictEqual((L[c][k].match(/\{\w+\}/g) || []).sort(), (L.en[k].match(/\{\w+\}/g) || []).sort(), 'slots ' + c + ' ' + k); }
  }
  for (const c of Object.keys(L)) for (const k of en) assert.ok(!/\s[-–—]\s/.test(L[c][k]), 'no dash as punctuation ' + c + ' ' + k);
  for (const m of script.matchAll(/'(models\.shot\.[a-zA-Z0-9_.]+)'/g)) assert.ok(L.en[m[1]], 'key named in the script ' + m[1]);
  for (const m of script.matchAll(/\btx\('([a-zA-Z0-9_.]+)'/g)) assert.ok(L.en[m[1]], 'tx key ' + m[1]);
  ok('lang: ' + en.length + ' keys, same keys and slots in en ru uk zh, a text for every key the script names');

  assert.ok(!/[`]|\$\{|innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|setTimeout|setInterval|requestAnimationFrame/.test(script), 'page rules');
  assert.ok(!/(^|[^\w])[A-Za-z]:[\\/]|https?:\/\/|#[0-9a-fA-F]{6}\b/.test(script), 'no fixed path, address or colour');
  assert.ok(/^\s*\(function\(\)\{[\s\S]*\}\)\(\);\s*$/.test(script), 'one function, no new global names');
  new vm.Script(script, { filename: 'shot.client' });

  // ---------- fake DOM ----------
  const node = tag => ({ tag, style: {}, childNodes: [], attrs: {}, listeners: {}, textContent: '', value: '', className: '', parentNode: null,
    appendChild(c) { if (c && typeof c === 'object') c.parentNode = this; this.childNodes.push(c); return c; },
    insertBefore(c, ref) { const i = this.childNodes.indexOf(ref); c.parentNode = this; if (i < 0) this.childNodes.push(c); else this.childNodes.splice(i, 0, c); return c; },
    get nextSibling() { const p = this.parentNode; if (!p) return null; return p.childNodes[p.childNodes.indexOf(this) + 1] || null; },
    addEventListener(k, f) { (this.listeners[k] = this.listeners[k] || []).push(f); }, setAttribute(k, v) { this.attrs[k] = v; },
    fire(k) { (this.listeners[k] || []).forEach(f => f({ target: this })); } });
  const h = (tag, attrs, kids) => { const e = node(tag); for (const k of Object.keys(attrs || {})) { const v = attrs[k]; if (v == null || v === false) continue;
    if (k === 'text') e.textContent = v; else if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.attrs[k] = v; }
    for (const c of kids || []) if (c != null) e.appendChild(typeof c === 'string' ? { text: c } : c); return e; };
  const all = (r, out = []) => { out.push(r); for (const c of r.childNodes || []) if (c && c.tag) all(c, out); return out; };
  const text = r => all(r).map(x => x.textContent).filter(Boolean).join(' | ');
  const tx = (k, p) => { assert.ok(L.en[k], 'tx key used ' + k); return L.en[k].replace(/\{(\w+)\}/g, (m, x) => (p && p[x] != null ? String(p[x]) : m)); };
  const calls = [];
  const api = (url, body) => new Promise((res, rej) => calls.push({ url, body: JSON.parse(JSON.stringify(body)), res, rej }));
  const saved = { 'models.armor.gun': 'gun_a', 'models.armor.ammo': 'ap_a', 'models.armor.range': 300 };
  const LS = { get: (k, d) => (k in saved ? saved[k] : d), set(k, v) { saved[k] = v; } };
  const Ls = [];
  const D = { id: 'd1', target: 'tank_a', sel: { bone: null, volume: null, anm: null, frame: 0 }, on(fn) { Ls.push(fn); return () => {}; },
    // vanilla root: Y mirrored ({Orientation 1 0 0 0 -1 0 0 0 1}), so the vehicle's left is world -Y
    scene: () => Promise.resolve({ bones: [{ path: 'body', world: [1, 0, 0, 0, -1, 0, 0, 0, 1, 0, 0, 0] }],
      volumes: [{ id: 'body/hull', world: [1, 0, 0, 0, 1, 0, 0, 0, 1, 40, 0, 20] }, { id: 'body/turret/tur', world: [1, 0, 0, 0, 1, 0, 0, 0, 1, 10, 0, 60] }] }) };
  const emit = e => { if (e.type === 'select') D.sel = Object.assign({ bone: null, volume: null, anm: null, frame: 0 }, e.sel); Ls.slice().forEach(f => f(e)); };
  const fx = [];   // calls of the Armor part's renderer
  const EXT = { models: { subs: { model: ctx => { ctx.body.appendChild(h('div', { text: 'before' })); },
    armor: { _t: { fxMain: (el, j, prev) => { fx.push({ j, prev }); return [el('div', { text: 'FX ' + j.id + (prev ? ' after ' + prev.id : '') })]; } } } }, parts: {}, doc: D } };
  new Function('EXT_SCREENS', 'h', 'tx', 'api', 'LS', 'cssv', 'window', 'document', script)(EXT, h, tx, api, LS, () => '', {}, { createElement: node });
  const M = EXT.models.subs.model, T = M._shot;
  assert.strictEqual(typeof M, 'function', 'Model sub-tab hook set');
  ok('client: page rules, parses, one function, sets the Model sub-tab hook');

  // ---------- helpers ----------
  assert.deepStrictEqual(T.aeOf('front'), [0, 0]); assert.deepStrictEqual(T.aeOf('rear'), [180, 0]); assert.deepStrictEqual(T.aeOf('left'), [90, 0]);
  assert.deepStrictEqual(T.aeOf('right'), [-90, 0]); assert.deepStrictEqual(T.aeOf('top'), [0, 90]);
  assert.deepStrictEqual(T.aeOf('typed', '30', '-5,5'), [30, -5.5]);
  for (const [a, e] of [['400', '0'], ['0', '91'], ['x', '0'], ['', '0']]) assert.strictEqual(T.aeOf('typed', a, e), null, 'bad pair ' + a + ' ' + e);
  const who = { mod: 'm', target: 'tank_a', gun: 'g', ammo: 'a', range: 100 };
  assert.deepStrictEqual(T.bodyOf(who, { az: 0, el: 0, aim: [1, 2, 3] }, 'd1', {}), { mod: 'm', target: 'tank_a', weapon: 'g', ammo: 'a', range: 100, az: 0, el: 0, aim: [1, 2, 3], doc: 'd1', samples: 400, ground: 0 });
  assert.deepStrictEqual(T.bodyOf(who, { az: 0, el: 0, aim: [1, 2, 3] }, 'd1', { carry: true, reset: true }).carry, true);
  assert.strictEqual(T.bodyOf(who, { az: 0, el: 0, volume: 'v' }, null, { carry: true }).carry, undefined, 'no carry without a document');
  const e1 = T.rayEnd({ origin: [100, 0, 0], dir: [-1, 0, 0] }, [0, 0, 0]); assert.deepStrictEqual(e1, [0, 0, 0], 'ray drawn to the aimed point');
  const e2 = T.rayEnd({ origin: [100, 0, 0], dir: [-1, 0, 0] }, null); assert.ok(e2[0] < -90 && e2[1] === 0, 'no point: across the model');
  assert.strictEqual(T.endKey('no_penetration'), 'models.shot.end.stopped'); assert.strictEqual(T.endKey('odd'), 'models.shot.end.other');
  ok('helpers: sides, typed pair limits, request body (aim point, carry, reset), ray end, end words');

  // the camera's view direction -> azimuth and elevation, checked against armorsim's own rule (sim.js basis / toShooter)
  const sim = require('../../../../armorsim/sim'), nv = v => { const l = Math.hypot(...v); return v.map(x => x / l); };
  const ID = T.frameOf(null), MIR = T.frameOf([1, 0, 0, 0, -1, 0, 0, 0, 1, 0, 0, 0]);
  assert.deepStrictEqual(MIR.Y, [0, -1, 0], 'frame rows of the root bone');
  const near = (a, b, m) => a.forEach((x, i) => assert.ok(Math.abs(x - b[i]) < 1e-6, m + ' ' + JSON.stringify(a) + ' vs ' + JSON.stringify(b)));
  near(T.aeFromDir([-1, 0, 0], ID), [0, 0], 'straight from the front');
  near(T.aeFromDir([0, 1, 0], MIR), [90, 0], 'from the left (vanilla root, left = world -Y)');
  near(T.aeFromDir([0, -1, 0], ID), [90, 0], 'from the left (plain root, left = world +Y)');
  near(T.aeFromDir([1, 0, 0], ID).map(Math.abs), [180, 0], 'from the rear');
  near(T.aeFromDir([0, 0, -1], MIR), [0, 90], 'from above');
  for (const F of [ID, MIR]) for (const d of [[-1, 0, 0], [0, 1, 0], [0, 0, -1], nv([-1, 0.5, -0.4]), nv([0.3, -0.8, -0.2]), nv([-0.2, -0.1, 0.9])]) {
    const ae = T.aeFromDir(d, F); near(sim.basis(ae[0], ae[1], { _frame: F }).d, d, 'sim.basis gives the same direction back for ' + JSON.stringify(d));
  }
  assert.strictEqual(T.aeWords(-35, 20), '35 degrees right of the front, 20 degrees up');
  assert.strictEqual(T.aeWords(150, -10), '30 degrees left of the rear, 10 degrees down');
  assert.strictEqual(T.aeWords(0, 0), 'straight from the front, level'); assert.strictEqual(T.aeWords(0, 90), 'straight from above');
  ok('camera direction to azimuth and elevation: front, left, rear, above and slanted ones match armorsim sim.basis; in words');

  // ---------- the part in the Model sub-tab ----------
  const lines = [];
  const body = node('div'), viewEl = node('div'); viewEl.addLine = (a, b, c) => lines.push([a, b, c]); viewEl.clearLines = () => { lines.length = 0; };
  const shown = []; let cleared = 0; viewEl.showShot = j => { shown.push(j); return { missing: [] }; }; viewEl.clearShot = () => { cleared++; };
  // the view's slots (viewer.client.js addTool / addUnder): a tool row with the handles' mode buttons above the canvas, then the canvas
  const gz = node('div'), modes = node('div'), gzField = node('div'), canvas = node('div'), helpEl = node('div');
  gz.appendChild(modes); gz.appendChild(gzField); viewEl.appendChild(gz); viewEl.appendChild(canvas); viewEl.appendChild(helpEl);
  viewEl.addTool = b => gz.insertBefore(b, modes.nextSibling); viewEl.addUnder = b => viewEl.insertBefore(b, canvas.nextSibling);
  body.appendChild(node('h3')); body.appendChild(viewEl); body.appendChild(node('files'));
  const clear = x => { x.childNodes.length = 0; };
  const ctx = { body, set: { target: 'tank_a' }, mod: 'mymod', el: h, clear, say: (x, c, t) => { x.className = c; x.textContent = t; }, doc: D,
    onPick: fn => { picks.push(fn); return () => {}; } };
  // a click in the view as ../client.js passes it on: the hit to ctx.onPick listeners, then the view's own selection
  const picks = [], click = x => { picks.forEach(f => f(x)); emit({ type: 'select', sel: { bone: null, volume: x.volume || null, anm: null, frame: 0 } }); };
  M(ctx);
  assert.ok(text(body).includes('before'), 'the part set before still draws');
  const card = viewEl, btn = all(card).find(x => x.tag === 'button' && x.textContent === 'Shot');
  assert.ok(btn && btn.parentNode.parentNode === gz && gz.childNodes.indexOf(btn.parentNode) === 1 && btn.parentNode.attrs.blk === 'shot.tool', 'the Shot toggle is its own leaf beside the mode buttons, above the canvas');
  const sbar = canvas.nextSibling; assert.ok(sbar && sbar.attrs.blk === 'shot.bar' && sbar.className === 'card' && sbar.nextSibling === helpEl, 'the bar sits right under the canvas, before the help');
  assert.ok(sbar.hidden === true && !sbar.childNodes.length && !all(body).some(x => x.attrs && x.attrs.blk === 'shot'), 'off: the bar is hidden and empty, no old shot card');
  btn.fire('click'); await tick();
  assert.ok(sbar.hidden === false && sbar.childNodes.length > 3, 'on: the bar shows under the canvas');
  const q = sel => all(card).find(sel), byLabel = l => q(x => x.attrs['aria-label'] === l), byText = t => q(x => x.tag === 'button' && x.textContent === t);
  assert.strictEqual(btn.attrs['aria-pressed'], 'true');
  const sh = calls.find(c => c.url === '/api/x/models/armor/shells'); assert.deepStrictEqual(sh.body, { mod: 'mymod', weapon: 'gun_a' }, 'shells of the shared gun');
  sh.res({ shells: [{ ammo: 'he_a', kind: 'he', calibre: 75 }, { ammo: 'ap_a', calibre: 75 }, { ammo: 'heat_a', kind: 'heat', calibre: 75, cumulative: 1 },
    { ammo: 'cum_b', kind: 'Cumulative' }, { ammo: 'he_c', kind: 'he', cumulative: 2 }, { ammo: 'odd_a', kind: 'thermobaric' }] }); await tick();
  const opts = all(byLabel('Shell')).filter(x => x.tag === 'option'), optT = a => (opts.find(o => o.attrs.value === a) || {}).textContent || (opts.find(o => o.attrs.value === a) || { attrs: {} }).attrs.text;
  assert.deepStrictEqual(opts.map(o => o.attrs.value), ['he_a', 'ap_a', 'heat_a', 'cum_b', 'he_c', 'odd_a'], 'every shell the route sends is listed, heat ones too');
  const HW = L.en['models.shot.kind.heat']; assert.ok(/shaped charge/.test(HW) && /HEAT/.test(HW), 'heat in plain words: ' + HW);
  assert.ok(optT('heat_a').includes(HW) && optT('cum_b').includes(HW) && optT('he_c').includes(L.en['models.shot.kind.he'] + ', ' + HW), 'heat named, also as a cumulative word or a shaped charge in another kind: ' + opts.map(o => optT(o.attrs.value)).join(' | '));
  assert.ok(optT('odd_a').includes('thermobaric') && optT('ap_a').includes(L.en['models.shot.kind.other']), 'an unknown kind shows its own word, none blank');
  for (const c of ['ru', 'uk', 'zh']) assert.ok(/HEAT/.test(L[c]['models.shot.kind.heat']), c + ' heat word');
  assert.strictEqual(byLabel('Shell').value, 'ap_a', 'shared shell kept');assert.strictEqual(byLabel('Range').value, '300', 'shared range');
  assert.ok(all(byLabel('Aim at')).some(x => x.attrs.value === 'body/turret/tur'), 'volumes of the document in Aim at');
  const gq = byLabel('Search guns'); gq.value = 'pak'; gq.fire('input');
  const gc = calls.find(c => c.url === '/api/x/models/armor/guns'); assert.deepStrictEqual(gc.body, { mod: 'mymod', q: '', limit: 5000 }, 'the whole gun list asked for once, filtered on the page');
  gc.res({ guns: [{ name: 'kwk40', group: 'gun' }, { name: 'pak40', group: 'gun' }] }); await tick();
  assert.ok(!byText('kwk40') && byText('pak40'), 'the kept list filtered by the typed words');
  gq.value = 'pak4'; gq.fire('input'); assert.strictEqual(calls.filter(c => c.url === '/api/x/models/armor/guns').length, 1, 'no second route call while typing');
  byText('pak40').fire('click'); assert.strictEqual(saved['models.armor.gun'], 'pak40', 'gun shared with the Armor sub-tab');
  calls.filter(c => c.url === '/api/x/models/armor/shells').pop().res({ shells: [{ ammo: 'pzgr', calibre: 75 }] }); await tick();
  assert.strictEqual(saved['models.armor.ammo'], 'pzgr', 'shell shared'); const rg = byLabel('Range'); rg.value = '500'; rg.fire('change');
  assert.strictEqual(saved['models.armor.range'], 500, 'range shared');
  ok('bar under the view; gun search, shells and range through the Armor routes and keys');

  const fromSel = byLabel('Shoot from'), last = () => calls.filter(c => c.url === '/api/x/models/armor/effects').pop();
  const want = { front: [0, 0], rear: [180, 0], left: [90, 0], right: [-90, 0], top: [0, 90] };
  let k = 0;
  // the camera (first and default): a click shoots along the click's ray, at the hit point
  assert.strictEqual(fromSel.value, 'camera', 'the camera is the default'); assert.strictEqual(all(fromSel)[1].attrs.value, 'camera', 'and the first choice');
  const dC = nv([-0.8, 0.5, -0.33]), aeC = T.aeFromDir(dC, MIR);
  click({ volume: 'body/hull', side: 0, point: [60, 4, 25], origin: [600, -300, 220], dir: dC, bone: null });
  assert.deepStrictEqual(last().body, { mod: 'mymod', target: 'tank_a', weapon: 'pak40', ammo: 'pzgr', range: 500, az: aeC[0], el: aeC[1], aim: [60, 4, 25], doc: 'd1', samples: 400, ground: 0 }, 'camera click');
  near(sim.basis(last().body.az, last().body.el, { _frame: MIR }).d, dC, 'the server rebuilds the click direction');
  last().res({ id: 'cam1', ends: [], whole: [], ray: { origin: [700, -300, 230], dir: dC } }); await tick();
  assert.ok(text(card).includes('from the camera, ' + T.aeWords(aeC[0], aeC[1])), 'where it came from in words: ' + T.aeWords(aeC[0], aeC[1]));
  assert.deepStrictEqual([lines[0][0], lines[0][1]], [[700, -300, 230], [60, 4, 25]], 'line from the camera side to the hit point');
  assert.ok(shown.length === 1 && shown[0].id === 'cam1' && cleared >= 1, 'the overlay is cleared when the run starts and the view shows the result (showShot)');
  assert.strictEqual(T.notLoaded({ asked: 'he', weapon: 'g', loads: ['ap', 'apcr'] }), 'The gun g does not load the shell he. It loads: ap, apcr.'); assert.strictEqual(T.notLoaded(null), '');
  assert.ok(T.summary(h, { ammoNotLoaded: { asked: 'he', weapon: 'g', loads: [] }, ends: [], whole: [] }).some(x => x.className === 'err' || x.attrs && x.attrs.class === 'err'), 'the warning leads the summary');
  // Shoot with the camera: the active pane's eye towards the chosen volume's middle
  const fire = byText('Shoot'); assert.strictEqual(fire.disabled, true, 'no camera() on this view: Shoot is off');
  assert.ok(text(card).includes('gives no camera'), 'and says why');
  viewEl.camera = () => ({ eye: [240, 100, 120], dir: nv([-1, 0, -0.2]), ortho: false });
  fromSel.fire('change'); assert.strictEqual(fire.disabled, false, 'camera() there: Shoot is on');
  byLabel('Aim at').value = 'body/turret/tur'; byLabel('Aim at').fire('change'); fire.fire('click');
  const aeS = T.aeFromDir(nv([10 - 240, 0 - 100, 60 - 120]), MIR);
  assert.deepStrictEqual([last().body.az, last().body.el, last().body.aimVolume, last().body.aim], [aeS[0], aeS[1], 'body/turret/tur', undefined], 'Shoot: eye to the middle of the volume');
  last().res({ id: 'cam2', ends: [], whole: [] }); await tick();
  viewEl.camera = () => ({ eye: [0, 0, 500], dir: [0, 0, -1], ortho: true }); fire.fire('click');
  near([last().body.az, last().body.el], T.aeFromDir([0, 0, -1], MIR), 'Shoot in a flat view: the view direction');
  last().res({ id: 'cam3', ends: [], whole: [] }); await tick();
  ok('the camera: first and default; a click shoots along the click ray at the hit point (az, el as armorsim reads them), words and line; Shoot uses the camera or is off');
  for (const side of Object.keys(want)) {
    fromSel.value = side; fromSel.fire('change');
    const before = calls.length; click({ volume: 'body/hull', side: 0, point: [60, 4, 25], origin: [900, 0, 50], dir: [-1, 0, 0], bone: null });
    assert.strictEqual(calls.length, before + 1, 'one call for a pick from ' + side + ' (the selection after the click is not a second shot)');
    assert.deepStrictEqual(last().body, { mod: 'mymod', target: 'tank_a', weapon: 'pak40', ammo: 'pzgr', range: 500, az: want[side][0], el: want[side][1], aim: [60, 4, 25], doc: 'd1', samples: 400, ground: 0 }, side);
    last().res({ id: 'r' + (++k), ends: [{ result: 'no_penetration', volume: 'body/hull', chance: 1 }], whole: [{ key: 'burns', chance: 0.25 }], ray: { origin: [2000, 0, 0], dir: [-1, 0, 0] } }); await tick();
  }
  assert.ok(text(card).includes('is stopped (hull) 100%') && text(card).includes('Burns 25%') && text(card).includes('FX r5'), 'short result and the Armor renderer');
  assert.strictEqual(lines.length, 1, 'one ray drawn'); assert.deepStrictEqual([lines[0][0], lines[0][1]], [[2000, 0, 0], [60, 4, 25]], 'ray from the origin to the clicked point');
  let before = calls.length; click({ volume: 'body/hull', side: -1, point: null });
  assert.strictEqual(calls.length, before + 1); assert.strictEqual(last().body.aimVolume, 'body/hull'); assert.strictEqual(last().body.aim, undefined, 'a hit without a point: middle of the volume');
  last().res({ id: 'r5b', ends: [], whole: [] }); await tick();
  before = calls.length; click({ volume: null, side: -1, point: null }); assert.strictEqual(calls.length, before, 'a click on nothing sends nothing');
  before = calls.length; emit({ type: 'select', sel: { bone: null, volume: 'body/hull', anm: null, frame: 0 } });
  assert.strictEqual(last().body.aimVolume, 'body/hull'); assert.strictEqual(calls.length, before + 1, 'a selection without a hit (view without onHit): middle of the volume');
  last().res({ id: 'r5c', ends: [], whole: [] }); await tick();
  fromSel.value = 'typed'; fromSel.fire('change'); const az = byLabel('Azimuth'), elv = byLabel('Elevation');
  az.value = '45'; az.fire('change'); elv.value = '10'; elv.fire('change');
  byLabel('Aim at').value = 'body/turret/tur'; byLabel('Aim at').fire('change'); byText('Shoot').fire('click');
  assert.strictEqual(last().body.az, 45); assert.strictEqual(last().body.el, 10); assert.strictEqual(last().body.aimVolume, 'body/turret/tur');
  last().res({ id: 'r6', ends: [], whole: [] }); await tick();
  az.value = '500'; az.fire('change'); before = calls.length; byText('Shoot').fire('click');
  assert.strictEqual(calls.length, before, 'a wrong pair sends nothing'); assert.ok(text(card).includes('Azimuth is a number'), 'says why');
  az.value = '45'; az.fire('change');
  before = calls.length; emit({ type: 'select', sel: { bone: null, volume: 'body/turret/tur', anm: 'fire.anm', frame: 3 } });
  assert.strictEqual(calls.length, before, 'a new pose with the same volume is not a pick');
  emit({ type: 'select', sel: { bone: 'body', volume: null, anm: 'fire.anm', frame: 3 } }); assert.strictEqual(calls.length, before, 'a bone pick is not a shot');
  ok('a pick from each side sends the effects body; typed azimuth and elevation; a wrong pair and a pose change send nothing');

  // an outer ram box around an inner volume: the click goes through the box (shells never hit it) to the inner volume, through the
  // clicked point on it; only the box under the click: said, nothing sent
  const ramH = { volume: 'body/ram', name: 'ram', side: 0, point: [80, 4, 25], aim: [79.75, 4, 25] }, innH = { volume: 'body/hull', name: 'hull', side: 0, point: [60, 4, 25], aim: [59.75, 4, 25] };
  click({ volume: 'body/ram', side: 0, point: [80, 4, 25], origin: [900, 4, 25], dir: [-1, 0, 0], bone: null, hits: [ramH, innH] });
  const nhc = calls.filter(c => c.url === '/api/x/models/armor/nothit').pop();
  assert.ok(nhc && nhc.body.doc === 'd1' && nhc.body.target === 'tank_a' && nhc.body.mod === 'mymod', 'the volumes shells never hit are asked for the open document');
  before = calls.length; nhc.res({ notHit: [{ id: 'body/ram', name: 'ram', why: 'ram volume' }] }); await tick();
  assert.strictEqual(calls.length, before + 1, 'then one shot');
  assert.deepStrictEqual([last().body.aim, last().body.az, last().body.el, last().body.aimVolume], [[59.75, 4, 25], 45, 10, undefined], 'aimed just inside the inner volume, from the typed side');
  assert.strictEqual(byLabel('Aim at').value, 'body/hull', 'Aim at shows the volume hit, not the box');
  last().res({ id: 'r7', ends: [], whole: [] }); await tick();
  before = calls.length; click({ volume: 'body/ram', side: 0, point: [80, 4, 25], origin: [900, 4, 25], dir: [-1, 0, 0], bone: null, hits: [ramH] });
  assert.strictEqual(calls.length, before, 'only the ram box under the click: nothing sent'); assert.ok(text(card).includes(L.en['models.shot.noShellHit']), 'and says so');
  assert.ok(['ru', 'uk', 'zh'].every(c => L[c]['models.shot.noShellHit']), 'the message in every language');
  assert.deepStrictEqual(T.shellHit({ hits: [ramH, innH] }, T.noShell([{ id: 'BODY/RAM' }])), { volume: 'body/hull', side: 0, point: [59.75, 4, 25] }, 'shellHit: ids match in any case');
  ok('a click through an outer box that shells never hit: the shot goes to the inner volume; only the box: said, nothing sent');

  // the ground beside the model (hit.ground of the view): nothing shells hit under the click -> a shot at the ground point, ground: 0
  // in the body; the ground nearer along the ray than the first volume shells hit wins; a level shot from a side cannot reach it
  {
    assert.strictEqual(T.endKey('ground'), 'models.shot.end.ground', 'the ground end has its words');
    const gO = [300, 0, 200], gD = nv([-1, 0, -1]), G0 = [100, 0, 0];
    const far = { volume: 'body/hull', name: 'hull', side: 5, point: [50, 0, -50], aim: [49.8, 0, -50.2] }, nearV = { volume: 'body/hull', name: 'hull', side: 1, point: [200, 0, 100], aim: [199.8, 0, 99.8] };
    assert.deepStrictEqual(T.aimAt({ origin: gO, dir: gD, hits: [], ground: G0 }, {}), { ground: G0 }, 'aimAt: only the ground under the click');
    assert.deepStrictEqual(T.aimAt({ origin: gO, dir: gD, hits: [far], ground: G0 }, {}), { ground: G0 }, 'aimAt: the ground is nearer than the volume');
    assert.deepStrictEqual(T.aimAt({ origin: gO, dir: gD, hits: [nearV], ground: G0 }, {}), { volume: 'body/hull', side: 1, point: [199.8, 0, 99.8] }, 'aimAt: the volume is nearer');
    assert.strictEqual(T.aimAt({ origin: gO, dir: gD, hits: [], ground: null }, {}), null, 'aimAt: nothing');
    assert.deepStrictEqual(T.groundOf({ engine: { end: { result: 'ground', point: [1, 2, 0] } } }), [1, 2, 0]); assert.deepStrictEqual(T.groundOf({ verdict: 'ground', outcome: 'ground', groundPoint: [3, 4, 0] }), [3, 4, 0]);
    assert.deepStrictEqual(T.groundOf({ verdict: 'penetrate', outcome: 'ground', groundPoint: [5, 6, 0] }), [5, 6, 0], 'groundOf: through a plate, then the ground (verdict stays the plate)');
    assert.strictEqual(T.groundOf({ engine: { end: { result: 'spent', point: [1, 2, 3] } } }), null, 'groundOf: only a ground end');
    assert.strictEqual(T.crossAt([10, 20, 0], 8).length, 2, 'a cross of two lines');
    // typed 45 / 10 (from above): a click on the ground shoots there
    let b0 = calls.length; click({ volume: null, side: -1, point: null, origin: gO, dir: gD, bone: null, hits: [], ground: G0 });
    assert.strictEqual(calls.length, b0 + 1, 'one shot at the ground');
    assert.deepStrictEqual(last().body, { mod: 'mymod', target: 'tank_a', weapon: 'pak40', ammo: 'pzgr', range: 500, az: 45, el: 10, aim: G0, doc: 'd1', samples: 400, ground: 0 }, 'ground click from the typed side');
    last().res({ id: 'g1', ends: [{ result: 'ground', volume: null, chance: 1 }], whole: [], engine: { end: { result: 'ground', volume: null, point: [101, 0, 0], energyLeft: 1, burst: [101, 0, 0.3] } }, ray: { origin: [400, 0, 300], dir: gD } }); await tick();
    assert.ok(text(card).includes('Shot at the ground at 100, 0, 0') && text(card).includes(L.en['models.shot.end.ground'] + ' 100%'), 'title names the ground and its point, the end in words: ' + text(card).slice(0, 300));
    assert.deepStrictEqual([lines[0][0], lines[0][1]], [[400, 0, 300], [101, 0, 0]], 'the line ends where the shell met the ground'); assert.strictEqual(lines.length, 3, 'and a cross marks it');
    // the ground nearer than the volume under the click wins; a nearer volume wins over the ground
    click({ volume: 'body/hull', side: 5, point: [50, 0, -50], origin: gO, dir: gD, bone: null, hits: [far], ground: G0 });
    assert.ok(Array.isArray(last().body.aim) && last().body.aim.join() === G0.join() && last().body.aimVolume === undefined, 'ground nearer: the ground');
    last().res({ id: 'g2', ends: [], whole: [] }); await tick();
    click({ volume: 'body/hull', side: 1, point: [200, 0, 100], origin: gO, dir: gD, bone: null, hits: [nearV], ground: G0 });
    assert.deepStrictEqual(last().body.aim, [199.8, 0, 99.8], 'volume nearer: the volume'); assert.strictEqual(last().body.ground, 0, 'ground: 0 also on a volume shot');
    last().res({ id: 'g3', ends: [], whole: [] }); await tick();
    // a level side cannot reach the ground: said, nothing sent; the camera shoots along the click ray
    fromSel.value = 'front'; fromSel.fire('change'); b0 = calls.length;
    click({ volume: null, side: -1, point: null, origin: gO, dir: gD, bone: null, hits: [], ground: G0 });
    assert.strictEqual(calls.length, b0, 'level side at the ground: nothing sent'); assert.ok(text(card).includes(L.en['models.shot.groundLevel']), 'and says why');
    fromSel.value = 'camera'; fromSel.fire('change');
    click({ volume: null, side: -1, point: null, origin: gO, dir: gD, bone: null, hits: [], ground: G0 });
    const aeG = T.aeFromDir(gD, MIR); assert.deepStrictEqual([last().body.az, last().body.el, last().body.aim, last().body.ground], [aeG[0], aeG[1], G0, 0], 'camera: along the click ray at the ground point');
    last().res({ id: 'g4', ends: [], whole: [], ray: { origin: [400, 0, 300], dir: gD } }); await tick();
    assert.ok(text(card).includes('Shot at the ground at 100, 0, 0 from the camera, ' + T.aeWords(aeG[0], aeG[1])), 'camera ground shot in words');
    assert.deepStrictEqual(lines[0][1], G0, 'the line ends at the ground point aimed at'); assert.strictEqual(lines.length, 3, 'a cross at the aimed ground point');
    fromSel.value = 'typed'; fromSel.fire('change');
  }
  emit({ type: 'select', sel: { bone: 'body', volume: null, anm: 'fire.anm', frame: 3 } });   // back to the pose the next steps use
  ok('the ground: a click beside the model shoots at the ground point with ground: 0, the ground nearer than the volume wins, a level side says it cannot reach, camera along the ray; end words, line and cross');

  fromSel.value = 'front'; fromSel.fire('change');
  const cb = q(x => x.tag === 'input' && x.attrs.type === 'checkbox'); cb.checked = true; cb.fire('change');
  emit({ type: 'select', sel: { volume: 'body/hull', anm: 'fire.anm', frame: 3 } });
  assert.strictEqual(last().body.carry, true); assert.strictEqual(last().body.reset, undefined, 'carry');
  last().res({ id: 'c1', carried: true, ends: [], whole: [] }); await tick(); assert.ok(text(card).includes('Damage from earlier shots'), 'carried said');
  byText('Fresh tank').fire('click'); assert.strictEqual(last().body.reset, true); assert.strictEqual(last().body.carry, true, 'fresh tank: reset, then carry again');
  last().res({ id: 'c2', ends: [], whole: [] }); await tick();
  before = calls.length; emit({ type: 'change', rev: 2 }); assert.strictEqual(calls.length, before, 'carry: no rerun on an edit');
  assert.ok(text(card).includes('The model changed. The damage'), 'carry: says why');
  cb.checked = false; cb.fire('change');
  ok('carry and Fresh tank in the body; carry stops the rerun and says so');

  // rerun on an edit passes the result before the edit
  emit({ type: 'select', sel: { volume: 'body/hull', anm: 'fire.anm', frame: 3 } }); last().res({ id: 'e1', ends: [], whole: [] }); await tick();
  emit({ type: 'change', rev: 3 }); const rr = last(); assert.strictEqual(rr.body.aimVolume, 'body/hull'); assert.strictEqual(rr.body.carry, undefined);
  rr.res({ id: 'e2', ends: [], whole: [] }); await tick();
  assert.deepStrictEqual([fx[fx.length - 1].j.id, fx[fx.length - 1].prev && fx[fx.length - 1].prev.id], ['e2', 'e1'], 'prev = the result before the edit');
  assert.ok(text(card).includes('FX e2 after e1') && text(card).includes('last shot was run again'), 'rerun drawn');
  ok('an edit of the document runs the last shot again with prev');

  // late answers
  emit({ type: 'select', sel: { volume: 'body/hull', anm: 'fire.anm', frame: 3 } }); const old = last();
  emit({ type: 'select', sel: { volume: 'body/hull', anm: 'fire.anm', frame: 3 } }); const newer = last();
  old.res({ id: 'old', ends: [], whole: [] }); await tick(); assert.ok(!fx.some(x => x.j.id === 'old'), 'an older shot is ignored');
  newer.res({ id: 'new', ends: [], whole: [] }); await tick(); assert.ok(fx.some(x => x.j.id === 'new'));
  emit({ type: 'select', sel: { volume: 'body/hull', anm: 'fire.anm', frame: 3 } }); const closed = last();
  btn.fire('click'); assert.strictEqual(btn.attrs['aria-pressed'], 'false'); assert.strictEqual(lines.length, 0, 'ray cleared when the tool is closed');
  { const c1 = cleared; btn.fire('click'); await tick(); btn.fire('click'); assert.ok(cleared > c1, 'overlay cleared when the tool is closed'); }
  closed.res({ id: 'closed', ends: [], whole: [] }); await tick(); assert.ok(!fx.some(x => x.j.id === 'closed'), 'tool closed: ignored');
  before = calls.length; emit({ type: 'select', sel: { volume: 'body/hull', anm: 'fire.anm', frame: 3 } }); assert.strictEqual(calls.length, before, 'off: a pick sends nothing');
  btn.fire('click'); await tick(); emit({ type: 'select', sel: { volume: 'body/hull', anm: 'fire.anm', frame: 3 } }); const left = last();
  btn.parentNode.isConnected = false; left.res({ id: 'left', ends: [], whole: [] }); await tick(); assert.ok(!fx.some(x => x.j.id === 'left'), 'sub-tab left: ignored');
  ok('late answers ignored: a newer shot, the tool closed, the sub-tab left');

  // a view without the slots (another view, an older one): the card 'shot' with the toggle and the bar right after the view, as before
  const body2 = node('div'), view2 = node('div'); view2.addLine = () => {}; view2.clearLines = () => {};
  body2.appendChild(view2); body2.appendChild(node('files'));
  M(Object.assign({}, ctx, { body: body2, onPick: () => () => {} }));
  const card2 = view2.nextSibling, btn2 = card2 && all(card2).find(x => x.tag === 'button' && x.textContent === 'Shot');
  assert.ok(card2 && card2.className === 'card' && card2.attrs.blk === 'shot' && btn2 && btn2.parentNode.attrs.blk === 'shot.tool' && all(card2).some(x => x.attrs && x.attrs.blk === 'shot.bar'), 'no slots: the old card right under the view');
  ok('placement: the toggle beside the mode buttons above the canvas, the bar right under the canvas and hidden while off; a view without slots keeps the old card');

  console.log('PASS models shot (' + n + ')');
})().catch(e => { console.error(e && e.stack || e); console.log('FAIL models shot'); process.exit(1); });

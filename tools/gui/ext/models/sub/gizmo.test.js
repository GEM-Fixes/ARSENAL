// Models page part `gizmo` test: (1) the same keys and slots in en ru uk zh, a text for every tx key; (2) the client string obeys
// the page rules and parses; (3) the maths (closest point on an axis to a ray, plane hit, turn about an axis, snap, local matrix of a
// volume); (4) drags with a fake host and a flat top view (1 unit per pixel): a bone moved along X sends one bone.setMatrix in world
// space, a volume turned 90 degrees about Z sends one vol.setMatrix with the local matrix, a volume scaled along X sends one
// vol.transform; a bone is refused while an animation is shown, a click without a move sends nothing, Esc drops the preview.
// No browser, no WebGL.
// usage: node gizmo.test.js     last line: PASS models gizmo (N)
// Author: Imperator_Aug (ARSENAL, ia-c6222a3b)
'use strict';
const vm = require('vm'), assert = require('assert');
let n = 0; const ok = m => { n++; console.log('ok ' + n + ' ' + m); };
const near = (a, b, m) => { assert.strictEqual(a.length, b.length, m); a.forEach((x, i) => assert.ok(Math.abs(x - b[i]) < 1e-4, (m || '') + ' [' + i + '] ' + x + ' vs ' + b[i])); };

(async () => {
  const L = require('./gizmo.lang.json'), script = require('./gizmo.client');
  const en = Object.keys(L.en).sort();
  assert.ok(en.length > 10 && en.every(k => k.startsWith('models.gizmo.')), 'keys start models.gizmo.');
  for (const c of ['ru', 'uk', 'zh']) {
    assert.deepStrictEqual(Object.keys(L[c]).sort(), en, 'same keys in ' + c);
    for (const k of en) { assert.ok(L[c][k], c + ' ' + k); assert.deepStrictEqual((L[c][k].match(/\{\w+\}/g) || []).sort(), (L.en[k].match(/\{\w+\}/g) || []).sort(), 'slots ' + c + ' ' + k); }
  }
  for (const m of script.matchAll(/\btx\('([a-zA-Z0-9_.]+)'/g)) assert.ok(L.en[m[1]], 'tx key ' + m[1]);
  for (const md of ['select', 'move', 'rotate', 'scale']) assert.ok(L.en['models.gizmo.mode.' + md] && L.en['models.gizmo.key.' + md], md);
  ok('lang: ' + en.length + ' keys, same keys and slots in en ru uk zh, a text for every tx key');

  assert.ok(!/[`]|\$\{|innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(/.test(script), 'page rules');
  assert.ok(!/(^|[^\w])[A-Za-z]:[\\/]|https?:\/\/|#[0-9a-fA-F]{6}\b/.test(script), 'no fixed path, address or colour');
  new vm.Script(script, { filename: 'gizmo.client' });
  const node = tag => ({ tag, style: {}, childNodes: [], attrs: {}, listeners: {}, textContent: '', value: '',
    appendChild(c) { this.childNodes.push(c); return c; }, addEventListener(k, f) { (this.listeners[k] = this.listeners[k] || []).push(f); }, setAttribute(k, v) { this.attrs[k] = v; } });
  const h = (tag, attrs, kids) => { const e = node(tag); for (const k of Object.keys(attrs || {})) { const v = attrs[k]; if (v == null) continue; if (k === 'text') e.textContent = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v); }
    for (const c of kids || []) if (c != null) e.appendChild(typeof c === 'string' ? { text: c } : c); return e; };
  const tx = (k, p) => (L.en[k] || k).replace(/\{(\w+)\}/g, (m, x) => (p && p[x] != null ? String(p[x]) : m));
  const EXT = { models: { parts: {} } }, saved = {};
  new Function('EXT_SCREENS', 'h', 'tx', 'api', 'S', 'window', 'document', 'LS', script)(EXT, h, tx, () => new Promise(() => {}), {}, {}, { createElement: node },
    { get: (k, d) => (k in saved ? saved[k] : d), set(k, v) { saved[k] = v; } });
  const GZ = EXT.models.parts.gizmo; assert.strictEqual(typeof GZ, 'function', 'part set');
  ok('client: page rules, parses, sets the part');

  const T = GZ._t, I = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
  assert.ok(Math.abs(T.closestT([0, 0, 0], [1, 0, 0], [5, 3, 100], [0, 0, -1]) - 5) < 1e-9, 'closest point on the axis');
  assert.strictEqual(T.closestT([0, 0, 0], [0, 0, 1], [5, 3, 100], [0, 0, -1]), null, 'axis along the ray');
  near(T.planeHit([0, 0, 2], [0, 0, 1], [1, 1, 10], [0, 0, -1]), [1, 1, 2], 'plane hit');
  near(T.rotv([1, 0, 0], [0, 0, 1], Math.PI / 2), [0, 1, 0], 'turn +90 about Z: X to Y');
  assert.strictEqual(T.snap(7.4, 5), 5); assert.strictEqual(T.snap(7.6, 5), 10); assert.strictEqual(T.snap(7.6, 0), 7.6);
  near(T.turned(I, [0, 0, 1], Math.PI / 2), [0, 1, 0, -1, 0, 0, 0, 0, 1, 0, 0, 0], 'turned matrix');
  near(T.scaled(I, [2, 1, 3]), [2, 0, 0, 0, 1, 0, 0, 0, 3, 0, 0, 0], 'scaled rows');
  const P = [0, 1, 0, -1, 0, 0, 0, 0, 1, 10, 0, 5], W = [1, 0, 0, 0, 1, 0, 0, 0, 1, 10, 4, 5];
  const o1 = T.opFor({ kind: 'volume', id: 'v', world: W, parent: P }, 'move', W, [1, 1, 1]);
  assert.strictEqual(o1.name, 'vol.setMatrix'); near(T.mul12(o1.args.matrix, P), W, 'local * parent = world');
  near(o1.args.matrix, [0, -1, 0, 1, 0, 0, 0, 0, 1, 4, 0, 0], 'local of the volume');
  assert.deepStrictEqual(T.opFor({ kind: 'volume', id: 'v', world: W, parent: P }, 'scale', W, [2, 1, 1]), { name: 'vol.transform', args: { volume: 'v', scale: [2, 1, 1] } });
  assert.deepStrictEqual(T.opFor({ kind: 'bone', id: 'a/b', world: W, parent: P }, 'rotate', W, [1, 1, 1]).args, { bone: 'a/b', matrix: W, space: 'world' });
  assert.deepStrictEqual(T.OPS, { bone: { move: 'bone.setMatrix', rotate: 'bone.setMatrix', scale: 'bone.setMatrix' }, volume: { move: 'vol.setMatrix', rotate: 'vol.setMatrix', scale: 'vol.transform' } });
  ok('maths: closest point on an axis, plane hit, turn, snap, local matrix of a volume, the op table');

  // a flat top view: screen x = 200 - world y, screen y = 150 - world x, one unit per pixel
  const V = { e: [0, 0, 1000], f: [0, 0, -1], r: [0, -1, 0], u: [1, 0, 0], ortho: true,
    project: p => [200 - p[1], 150 - p[0]], ray: (x, y) => ({ o: [150 - y, 200 - x, 1000], d: [0, 0, -1] }), upp: () => 1 };
  function host(t) {
    const H = { t, ops: [], prev: [], said: [], target: () => H.t, preview(p) { H.prev.push(p); }, op(nm, a) { H.ops.push([nm, a]); return Promise.resolve({ rev: 2 }); }, say(s) { H.said.push(s); }, redraw() {} };
    return H;
  }
  // bone at (10, 0, 0): its X handle runs from screen (200, 140) up to (200, 60)
  let H = host({ kind: 'bone', id: 'body/turret', world: [1, 0, 0, 0, 1, 0, 0, 0, 1, 10, 0, 0], parent: I, posed: false });
  let G = GZ(H); assert.ok(G.el && G.el.childNodes.length >= 4, 'tool row');
  assert.strictEqual(G.hit(V, 200, 100), null, 'select mode: no handles'); assert.deepStrictEqual(G.lines(V), []);
  G.setMode('move'); assert.strictEqual(saved['models.gizmo.mode'], 'move', 'mode kept');
  const ls = G.lines(V); assert.ok(ls.length >= 7 && ls.some(s => s.c === 'x') && ls.some(s => s.c === 'z'), 'handle lines with axis colours');
  let hh = G.hit(V, 200, 100); assert.deepStrictEqual(hh, { axis: 0 }, 'X handle');
  assert.deepStrictEqual(G.hit(V, 200, 140), { axis: -1 }, 'centre handle');
  G.down(V, hh, 200, 100, {}); G.move(V, 200, 90, {}); G.move(V, 200, 79.6, {});
  assert.strictEqual(H.ops.length, 0, 'no op while dragging'); near(H.prev[H.prev.length - 1].world.slice(9), [30.4, 0, 0], 'preview follows');
  assert.ok(/Move 1\.02, 0\.00, 0\.00 m/.test(H.said[H.said.length - 1]), 'readout in metres: ' + H.said[H.said.length - 1]);
  await G.up();
  assert.strictEqual(H.ops.length, 1, 'one op'); assert.strictEqual(H.ops[0][0], 'bone.setMatrix');
  assert.deepStrictEqual(H.ops[0][1], { bone: 'body/turret', matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1, 30.4, 0, 0], space: 'world' }, 'bone moved 20.4 units along X');
  ok('move: a bone dragged along X previews, reads out in metres and sends exactly one bone.setMatrix on release');

  // snap on: 0.05 m = 1 unit
  H = host(H.t); G = GZ(H); G.setMode('move'); G.down(V, { axis: 0 }, 200, 100, {}); G.move(V, 200, 79.6, { altKey: true }); await G.up();
  near(H.ops[0][1].matrix.slice(9), [30, 0, 0], 'Alt turns snap on for this drag when it is off');
  saved['models.gizmo.snap'] = true; H = host(H.t); G = GZ(H); G.setMode('move'); G.down(V, { axis: 0 }, 200, 100, {}); G.move(V, 200, 79.6, {}); await G.up();
  near(H.ops[0][1].matrix.slice(9), [30, 0, 0], 'snap: 20.4 units to 20');
  saved['models.gizmo.snap'] = false;
  // the centre handle with Ctrl keeps the move to the screen's up and down (world X here)
  H = host(H.t); G = GZ(H); G.setMode('move'); G.down(V, { axis: -1 }, 200, 140, {}); G.move(V, 220, 130, { ctrlKey: true }); await G.up();
  near(H.ops[0][1].matrix.slice(9), [20, 0, 0], 'Ctrl: screen up and down only');
  ok('snap steps, Alt, the centre handle with Ctrl');

  // a volume turned +90 about world Z, its bone at (10, 0, 5) turned +90 too
  H = host({ kind: 'volume', id: 'hull', world: [1, 0, 0, 0, 1, 0, 0, 0, 1, 10, 0, 5], parent: P, vol: { kind: 'box' }, posed: true });
  G = GZ(H); G.setMode('rotate');
  // start on the ring at world (10 + 72, 0) -> screen (200, 68); move to world (10, 72) -> screen (128, 140)
  G.down(V, { axis: 2 }, 200, 68, {}); G.move(V, 160, 80, {}); G.move(V, 128, 140, {});
  assert.ok(/Turn 90\.0 degrees/.test(H.said[H.said.length - 1]), 'readout in degrees ' + H.said[H.said.length - 1]);
  await G.up();
  assert.strictEqual(H.ops.length, 1); assert.strictEqual(H.ops[0][0], 'vol.setMatrix');
  near(T.mul12(H.ops[0][1].matrix, P), [0, 1, 0, -1, 0, 0, 0, 0, 1, 10, 0, 5], 'the new world is the old one turned +90 about Z');
  ok('rotate: a volume turned 90 degrees about Z sends one vol.setMatrix with its local matrix; a posed volume may still turn');

  H = host({ kind: 'volume', id: 'hull', world: [1, 0, 0, 0, 1, 0, 0, 0, 1, 10, 0, 5], parent: P, posed: false });
  G = GZ(H); G.setMode('scale'); assert.deepStrictEqual(G.hit(V, 200, 100), { axis: 0 }, 'scale handle');
  G.down(V, { axis: 0 }, 200, 100, {}); G.move(V, 200, 60, {}); await G.up();
  assert.deepStrictEqual(H.ops, [['vol.transform', { volume: 'hull', scale: [2, 1, 1] }]], 'scale x2 along its X');
  ok('scale: a volume dragged to twice along X sends one vol.transform');

  H = host({ kind: 'bone', id: 'b', world: I, parent: I, posed: true }); G = GZ(H); G.setMode('move');
  G.down(V, { axis: 0 }, 200, 100, {}); G.move(V, 200, 60, {}); const r1 = G.up();
  assert.ok(r1 === undefined && H.ops.length === 0 && /rest/.test(H.said[0]), 'a bone is not moved while an animation is shown');
  H = host({ kind: 'bone', id: 'b', world: I, parent: I, posed: false }); G = GZ(H); G.setMode('move');
  G.down(V, { axis: 0 }, 200, 100, {}); G.up(); assert.strictEqual(H.ops.length, 0, 'a click without a move sends nothing');
  G.down(V, { axis: 0 }, 200, 100, {}); G.move(V, 200, 60, {}); G.cancel(); assert.strictEqual(H.prev[H.prev.length - 1], null, 'Esc drops the preview'); assert.strictEqual(G.up(), undefined);
  H = host({ kind: 'bone', id: 'b', world: I, parent: I, posed: false }); H.op = () => Promise.reject(new Error('no such bone')); G = GZ(H); G.setMode('move');
  G.down(V, { axis: 0 }, 200, 100, {}); G.move(V, 200, 60, {}); await G.up().then(() => assert.fail('should fail'), e => assert.strictEqual(e.message, 'no such bone'));
  assert.ok(H.prev[H.prev.length - 1] === null && /no such bone/.test(H.said[H.said.length - 1]), 'a failed op drops the preview and says why');
  ok('refusals: posed bone, click without a move, Esc, a failed op');

  // the snap steps follow the Files part's preferences (snapMove in game units, snapTurn in degrees) when the bar has none of its own
  delete saved['models.gizmo.stepMove']; delete saved['models.gizmo.stepRot'];
  let plis = null; const PV = { snapMove: 10, snapTurn: 30 }; EXT.models.prefs = { get: k => PV[k], on(f) { plis = f; } };
  const inputOf = (g, k) => { let r = null; (function w(x) { if (!x || r) return; if (x.tag === 'input' && x.attrs['aria-label'] === L.en['models.gizmo.step.' + k]) r = x; (x.childNodes || []).forEach(w); })(g.el); return r; };
  H = host({ kind: 'bone', id: 'b', world: [1, 0, 0, 0, 1, 0, 0, 0, 1, 10, 0, 0], parent: I, posed: false }); G = GZ(H);
  assert.ok(inputOf(G, 'move').value === '0.5' && inputOf(G, 'rotate').value === '30', 'steps from the preferences: 10 units = 0.5 m, 30 degrees');
  saved['models.gizmo.snap'] = true; H = host(H.t); G = GZ(H); G.setMode('move'); G.down(V, { axis: 0 }, 200, 100, {}); G.move(V, 200, 79.6, {}); await G.up();
  near(H.ops[0][1].matrix.slice(9), [30, 0, 0], 'snap to the 10 unit step'); saved['models.gizmo.snap'] = false;
  PV.snapMove = 4; plis('snapMove'); assert.ok(inputOf(G, 'move').value === '0.2' && saved['models.gizmo.stepMove'] === 0.2, 'a changed preference becomes the step');
  delete EXT.models.prefs;
  ok('steps: from the snapMove and snapTurn preferences, followed when they change');

  console.log('PASS models gizmo (' + n + ')');
})().catch(e => { console.error(e && e.stack || e); console.log('FAIL models gizmo'); process.exit(1); });

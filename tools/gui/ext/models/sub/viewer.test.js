// Models page part `viewer` test: (1) the same keys and slots in en ru uk zh, a text for every tx key; (2) the client string
// obeys the page rules and parses, and builds without WebGL (stub DOM) with every README method; (3) the pure maths on
// EXT_SCREENS.models.parts.viewer._t (ray/box sides in the box's own axes, ray/triangle, cylinder, sphere, row-vector 12 -> 4x4
// = scene.js tp); (4) the route on a synthetic model written to the scratch dir (two bones, a box volume, a one-quad mesh, an
// animation): scene/1 with the volume's world matrix, frame 1 moves the child bone, meshes:false sends no parts, the cache
// is used and dropped when a file changes, refusals as { ok: false, error }; (8) several models kept, one decode per picture;
// (9) a ready-made scene of many models (opts.scene, setScene, focusFigure, onFigure) on the fake WebGL. No game, no browser.
// usage: node viewer.test.js <scratch dir>     last line: PASS models viewer (N)
// Author: Imperator_Aug (ARSENAL, ia-568adc03)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const scratch = path.resolve(process.argv[2] || path.join(require('os').tmpdir(), 'models-viewer-test'));
const root = path.join(scratch, 'viewer-test');
fs.rmSync(root, { recursive: true, force: true }); fs.mkdirSync(root, { recursive: true });
let n = 0; const ok = m => { n++; console.log('ok ' + n + ' ' + m); };
const near = (a, b, m) => { assert.strictEqual(a.length, b.length, m); a.forEach((x, i) => assert.ok(Math.abs(x - b[i]) < 1e-4, (m || '') + ' [' + i + '] ' + x + ' vs ' + b[i])); };

(async () => {
  // ---------- (1) languages ----------
  const L = require('./viewer.lang.json'), script = require('./viewer.client');
  const en = Object.keys(L.en).sort();
  assert.ok(en.length > 10 && en.every(k => k.startsWith('models.viewer.')), 'keys start models.viewer.');
  for (const c of ['ru', 'uk', 'zh']) {
    assert.deepStrictEqual(Object.keys(L[c]).sort(), en, 'same keys in ' + c);
    for (const k of en) { assert.ok(L[c][k], c + ' ' + k); assert.deepStrictEqual((L[c][k].match(/\{\w+\}/g) || []).sort(), (L.en[k].match(/\{\w+\}/g) || []).sort(), 'slots ' + c + ' ' + k); }
  }
  for (const m of script.matchAll(/\btx\('([a-zA-Z0-9_.]+)'/g)) if (!/\.$/.test(m[1])) assert.ok(L.en[m[1]], 'tx key ' + m[1]);
  for (const k of ['front', 'side', 'top', 'reset', 'meshes', 'volumes', 'bones']) assert.ok(L.en['models.viewer.' + k], k);
  for (const k of ['box', 'cylinder', 'sphere', 'polyhedron']) assert.ok(L.en['models.viewer.kind.' + k] && L.en['models.viewer.size.' + k], k);
  ok('lang: ' + en.length + ' keys, same keys and slots in en ru uk zh, a text for every tx key');

  // ---------- (2) page rules, parse, build without WebGL ----------
  assert.ok(!/[`]|\$\{|innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(/.test(script), 'page rules');
  assert.ok(!/(^|[^\w])[A-Za-z]:[\\/]|https?:\/\//.test(script), 'no fixed path or address');
  new vm.Script(script, { filename: 'viewer.client' });
  const node = tag => {
    const o = { tag, style: {}, childNodes: [], attrs: {}, listeners: {}, textContent: '',
      appendChild(c) { this.childNodes.push(c); return c; }, removeChild(c) { this.childNodes.splice(this.childNodes.indexOf(c), 1); return c; },
      get lastChild() { return this.childNodes[this.childNodes.length - 1]; },
      addEventListener(k, f) { (this.listeners[k] = this.listeners[k] || []).push(f); }, setAttribute(k, v) { this.attrs[k] = v; } };
    if (tag === 'canvas') o.getContext = () => null;
    return o;
  };
  const h = (tag, attrs, kids) => { const e = node(tag); for (const k of Object.keys(attrs || {})) { if (k === 'text') e.textContent = attrs[k]; else if (k.startsWith('on')) e.addEventListener(k.slice(2), attrs[k]); else e.setAttribute(k, attrs[k]); }
    for (const c of kids || []) if (c != null) e.appendChild(typeof c === 'string' ? { text: c } : c); return e; };
  const EXT = { models: { parts: {}, subs: {} } }, apiCalls = [];
  const tx = (k, p) => (L.en[k] || k).replace(/\{(\w+)\}/g, (m, x) => (p && p[x] != null ? String(p[x]) : m));
  const win = { addEventListener() {}, devicePixelRatio: 1 };
  new Function('EXT_SCREENS', 'h', 'tx', 'api', 'S', 'window', 'document', 'LS', script)(EXT, h, tx, (u, b) => { apiCalls.push([u, b]); return new Promise(() => {}); }, { mod: '' }, win, { createElement: node }, { get: (k, d) => d, set() {} });
  const V = EXT.models.parts.viewer;
  assert.strictEqual(typeof V, 'function', 'hook set');
  const w = V({ set: { target: 'pz4h' }, mod: 'M' }, { height: 300, onPick() {} });
  for (const m of ['setPose', 'setColors', 'highlight', 'setShow', 'addLine', 'clearLines', 'reload']) { assert.strictEqual(typeof w[m], 'function', m); w[m]('a', 1); }
  const texts = []; (function walk(x) { if (!x) return; if (x.textContent) texts.push(x.textContent); (x.childNodes || []).forEach(walk); })(w);
  assert.ok(texts.includes(L.en['models.viewer.noGl']), 'no WebGL: one plain sentence');
  assert.strictEqual(apiCalls.length, 0, 'no WebGL: no route call');
  ok('client: page rules, parses, builds without WebGL and shows the plain sentence, methods do not throw');

  // ---------- (3) maths ----------
  const T = V._t;
  const I = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
  let r = T.rayBox([10, 0, 0], [-1, 0, 0], [2, 2, 2]); assert.ok(r && r.side === 0 && Math.abs(r.t - 9) < 1e-9, 'front');
  r = T.rayBox([0, 0, 10], [0, 0, -1], [2, 2, 2]); assert.strictEqual(r.side, 1, 'top');
  assert.strictEqual(T.rayBox([0, 10, 0], [0, -1, 0], [2, 2, 2]).side, 2, 'left');
  assert.strictEqual(T.rayBox([0, -10, 0], [0, 1, 0], [2, 2, 2]).side, 3, 'right');
  assert.strictEqual(T.rayBox([-10, 0, 0], [1, 0, 0], [2, 2, 2]).side, 4, 'rear');
  assert.strictEqual(T.rayBox([0, 0, -10], [0, 0, 1], [2, 2, 2]).side, 5, 'bottom');
  assert.strictEqual(T.rayBox([10, 5, 0], [-1, 0, 0], [2, 2, 2]), null, 'miss');
  // box turned +90 deg about Z (local +X -> world +Y), moved to (100, 0, 0)
  const R = [0, 1, 0, -1, 0, 0, 0, 0, 1, 100, 0, 0];
  const vb = { id: 'hull/armor', kind: 'box', world: R, size: [4, 2, 2] };
  r = T.hitVol(vb, [100, 10, 0], [0, -1, 0]); assert.ok(r && r.side === 0 && Math.abs(r.t - 8) < 1e-9, 'rotated: from world +Y = its front ' + JSON.stringify(r));
  assert.strictEqual(T.hitVol(vb, [110, 0, 0], [-1, 0, 0]).side, 3, 'rotated: from world +X = its right (-Y local)');
  const pk = T.pick([{ id: 'far', kind: 'box', world: [1, 0, 0, 0, 1, 0, 0, 0, 1, -50, 0, 0], size: [2, 2, 2] }, vb], [200, 0, 0], [-1, 0, 0]);
  assert.ok(pk.volume === 'hull/armor' && pk.side === 3 && pk.index === 1, 'pick: nearest'); near(pk.point, [101, 0, 0], 'pick point');
  // every volume under a click, nearest first: an outer (ram) box around an inner box; aim = just inside each entry point
  const ramB = { id: 'ram', name: 'ram', kind: 'box', world: I, size: [40, 40, 40] }, innB = { id: 'inner', name: 'inner', kind: 'box', world: I, size: [10, 10, 10] };
  const thin = { id: 'thin', kind: 'box', world: [1, 0, 0, 0, 1, 0, 0, 0, 1, -30, 0, 0], size: [0.2, 4, 4] };
  const pa = T.pickAll([innB, ramB, thin], [100, 0, 0], [-1, 0, 0]);
  assert.deepStrictEqual(pa.map(x => x.volume), ['ram', 'inner', 'thin'], 'pickAll: outer box first, then the inner one, then the far plate');
  assert.ok(pa[0].t < pa[1].t && pa[1].name === 'inner', 'nearest first, with names');
  near(pa[1].aim, [pa[1].point[0] - 0.25, 0, 0], 'aim: a little inside the inner volume');
  near(pa[2].aim, [-30, 0, 0], 'a plate thinner than the step: aim at the middle of its chord');
  assert.deepStrictEqual(T.pickAll([innB, ramB], [100, 0, 0], [-1, 0, 0], v => v.id === 'ram').map(x => x.volume), ['inner'], 'skip as pick');
  assert.deepStrictEqual(T.pickAll([innB, ramB], [100, 100, 0], [-1, 0, 0]), [], 'nothing under the click: empty');
  assert.ok(Math.abs(T.rayTri([0.2, 0.2, 5], [0, 0, -1], [0, 0, 0], [1, 0, 0], [0, 1, 0]) - 5) < 1e-9 && T.rayTri([2, 2, 5], [0, 0, -1], [0, 0, 0], [1, 0, 0], [0, 1, 0]) === -1, 'ray/triangle');
  const tri = Buffer.from(new Float32Array([0, -5, -5, 0, 5, -5, 0, 0, 5]).buffer).toString('base64');
  r = T.hitVol({ id: 'p', kind: 'polyhedron', world: I, triangles: tri, sides: [5] }, [10, 0, 0], [-1, 0, 0]); assert.ok(r && r.side === 4 && Math.abs(r.t - 10) < 1e-6, 'polyhedron side = byte - 1');
  r = T.hitVol({ id: 'c', kind: 'cylinder', world: I, radius: 2, length: 10 }, [10, 0, 4], [-1, 0, 0]); assert.ok(r && Math.abs(r.t - 8) < 1e-9 && r.side === 0, 'cylinder side wall');
  assert.strictEqual(T.hitVol({ id: 'c', kind: 'cylinder', world: I, radius: 2, length: 10 }, [10, 0, 6], [-1, 0, 0]), null, 'cylinder: above its half height');
  r = T.hitVol({ id: 'c', kind: 'cylinder', world: I, radius: 2, length: 10 }, [0, 0, 20], [0, 0, -1]); assert.ok(Math.abs(r.t - 15) < 1e-9, 'cylinder cap');
  r = T.hitVol({ id: 's', kind: 'sphere', world: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 3], radius: 2 }, [0, 0, 20], [0, 0, -1]); assert.ok(Math.abs(r.t - 15) < 1e-9, 'sphere');
  const M = [0.6, 0.8, 0, -0.8, 0.6, 0, 0, 0, 1, 10, 20, 30], p = [1, 2, 3];
  const tp = (m, x, y, z) => [x * m[0] + y * m[3] + z * m[6] + m[9], x * m[1] + y * m[4] + z * m[7] + m[10], x * m[2] + y * m[5] + z * m[8] + m[11]];
  near(T.xf(T.m4(M), p), tp(M, 1, 2, 3), 'm4 = tp'); near(T.xf(T.mul4(T.m4(M), T.m4(I)), p), tp(M, 1, 2, 3), 'mul4 identity');
  const mdl = require('../../../../lib/model/mdl');
  const ab = mdl.mul(R, M); near(T.xf(T.mul4(T.m4(M), T.m4(R)), p), tp(ab, 1, 2, 3), 'mdl.mul(a, b) (a then b) = m4(b) * m4(a)');
  ok('maths: box sides 0..5 from each face, in a turned box its own axes, nearest pick, triangle, polyhedron side, cylinder, sphere, 12 -> 4x4 = tp');

  // the snapshot camera: a view (az, el, fov, mirror, margin, part) fitted to the projected points
  const box = []; for (let i = 0; i < 8; i++) box.push(i & 1 ? 1 : -1, i & 2 ? 3 : -3, i & 4 ? 2 : 0);
  const ndc = (PV, q) => { const c = [0, 1, 2, 3].map(i => PV[i] * q[0] + PV[4 + i] * q[1] + PV[8 + i] * q[2] + PV[12 + i]); return [c[0] / c[3], c[1] / c[3]]; };
  const span = (cam, pts) => { let a = [Infinity, -Infinity, Infinity, -Infinity]; for (let i = 0; i < pts.length; i += 3) { const s = ndc(cam.PV, pts.slice(i, i + 3)); a = [Math.min(a[0], s[0]), Math.max(a[1], s[0]), Math.min(a[2], s[1]), Math.max(a[3], s[1])]; } return a; };
  for (const v of [{ az: 30, el: 20, fov: 30, margin: 0.05 }, { az: 90, el: 90, ortho: true, margin: 0.05 }, { az: -40, el: 10, fov: 20, margin: 0.1, mirror: true }]) {
    const cam = T.viewCam(v, box, 2), s = span(cam, box), lim = 1 - 2 * v.margin;
    assert.ok(s.every(x => Math.abs(x) <= lim + 1e-6), 'inside the margin ' + JSON.stringify(v) + ' ' + s);
    assert.ok(Math.abs(Math.max(-s[0], s[1]) - lim) < 1e-6 || Math.abs(Math.max(-s[2], s[3]) - lim) < 1e-6, 'fills to the margin ' + JSON.stringify(v));
    assert.ok(cam.ortho === !!v.ortho && cam.box.length === 4, 'flat or perspective, box');
  }
  const nose = [0, 3, 1], vc1 = T.viewCam({ az: 60, el: 15, fov: 30 }, box, 2), vc2 = T.viewCam({ az: 60, el: 15, fov: 30, mirror: true }, box, 2);
  assert.ok(Math.abs(ndc(vc1.PV, nose)[0] + ndc(vc2.PV, nose)[0]) < 1e-6 && Math.abs(ndc(vc1.PV, nose)[1] - ndc(vc2.PV, nose)[1]) < 1e-6, 'mirror flips x only');
  const front = T.viewCam({ az: 90, el: 0, fov: 30 }, box, 1); assert.ok(Math.abs(ndc(front.PV, [0, 3, 1])[0]) < 1e-6, 'az 90 looks at the +Y end');
  const col = []; for (let z = 0; z <= 2.0001; z += 0.1) col.push(0, -0.3, z, 0, 0.3, z);
  const head = T.viewCam({ az: 0, el: 0, fov: 30, margin: 0, part: { from: 0.75, to: 1 } }, col, 1), top = [0, 0, 2], low = [0, 0, 0.2];
  assert.ok(Math.abs(ndc(head.PV, top)[1]) <= 1 && ndc(head.PV, low)[1] < -1, 'part: only the top band is fitted, the rest falls out of the frame ' + ndc(head.PV, top) + ' ' + ndc(head.PV, low));
  const Ld = T.viewLight({ az: 30 }, { az: -30, el: 90 }); assert.ok(Math.abs(Math.hypot(Ld[0], Ld[1], Ld[2]) - 1) < 1e-6 && Ld[2] > 0.99, 'light from above');
  ok('snapshot camera: fitted to the margin, flat or perspective, mirror flips x, az 90 = the +Y end, a part band, the light');

  // ---------- (4) route on a synthetic model ----------
  const srv = require('./viewer.server'), route = srv.routes['POST /api/x/models/viewer/scene'];
  const game = path.join(root, 'game'), mod = path.join(root, 'mymod'), dir = path.join(mod, 'resource', 'entity', 'vt');
  fs.mkdirSync(path.join(game, 'resource'), { recursive: true }); fs.mkdirSync(path.join(game, 'mods'), { recursive: true }); fs.mkdirSync(dir, { recursive: true });
  const ctx = { game: () => game, tmpRoot: path.join(root, 'tmp') };
  const B = (...a) => Buffer.concat(a.map(x => (Buffer.isBuffer(x) ? x : Buffer.from(x, 'latin1'))));
  const i32 = (...a) => Buffer.concat(a.map(v => { const b = Buffer.alloc(4); b.writeInt32LE(v); return b; }));
  const u32 = v => { const b = Buffer.alloc(4); b.writeUInt32LE(v >>> 0); return b; };
  const u16 = (...a) => Buffer.concat(a.map(v => { const b = Buffer.alloc(2); b.writeUInt16LE(v); return b; }));
  const f32 = (...a) => Buffer.concat(a.map(v => { const b = Buffer.alloc(4); b.writeFloatLE(v); return b; }));
  const s8 = x => B(Buffer.from([x.length]), x);
  const v112 = (x, y, z, u, v) => f32(x, y, z, 0, 0, 1, u, v);
  fs.writeFileSync(path.join(dir, 'body.ply'), B('EPLY', 'BNDS', f32(0, 0, 0, 20, 40, 10), 'MESH', u32(0x112), i32(0, 2), u32(0x004), s8('tex/a.dds'),
    'VERT', i32(4), u16(32, 7), v112(0, 0, 0, 0, 0), v112(20, 0, 0, 1, 0), v112(20, 40, 0, 1, 1), v112(0, 40, 10, 0, 1), 'INDX', i32(6), u16(0, 1, 2, 0, 2, 3)));
  const mat = z => B('MATR', f32(1, 0, 0, 0, 1, 0, 0, 0, 1, 20, 0, z));
  fs.writeFileSync(path.join(dir, 'turn.anm'), B('EANM', i32(6), 'FRMS', i32(3), 'BMAP', i32(1), i32(6), 'turret', 'FRMN', i32(0), 'BONE', i32(0), mat(5), 'FRMN', i32(2), 'BONE', i32(0), mat(25)));
  const mdlFile = path.join(dir, 'vt.mdl');
  fs.writeFileSync(mdlFile, ['{Skeleton', '\t{bone "body"', '\t\t{Position 0\t0\t10}', '\t\t{VolumeView "body.ply"}', '\t\t{bone "turret"',
    '\t\t\t{Orientation', '\t\t\t\t0\t1\t0', '\t\t\t\t-1\t0\t0', '\t\t\t\t0\t0\t1', '\t\t\t}', '\t\t\t{Position 20\t0\t5}', '\t\t}', '\t}',
    '\t{animation {sequence "turn" {file "turn.anm"}}}', '}', '{Volume "armor"', '\t{Box 10 6 4}', '\t{Bone "turret"}', '}', ''].join('\r\n'));

  srv._t.drop();
  let j = await route('', { mod, target: mdlFile }, ctx);
  assert.ok(j.ok, j.error); const sc = j.scene;
  assert.strictEqual(sc.format, 'scene/1');
  const ti = sc.bones.findIndex(b => b.name === 'turret'); assert.ok(ti > 0 && sc.bones[ti].parent >= 0, 'child bone');
  near(sc.bones[ti].world, [0, 1, 0, -1, 0, 0, 0, 0, 1, 20, 0, 15], 'turret at rest');
  const vol = sc.volumes.find(v => v.kind === 'box'); assert.ok(vol, 'box volume');
  assert.deepStrictEqual(vol.size, [10, 6, 4]); near(vol.world, sc.bones[ti].world, 'volume world = bone world (no own matrix)'); assert.strictEqual(vol.bone, ti);
  assert.ok(sc.meshes.length === 1 && sc.meshes[0].parts.length === 1 && sc.meshes[0].parts[0].indexCount === 6, 'mesh part sent');
  assert.ok(!j.cached && j.frames === 0 && j.anmList.some(a => /turn\.anm$/.test(a.file)), 'anm list ' + JSON.stringify(j.anmList));
  ok('route: scene/1 with bones, the box volume and its world matrix, the mesh part, the animation list');

  j = await route('', { mod, target: mdlFile, anm: 'turn.anm', frame: 1, meshes: false }, ctx);
  assert.ok(j.ok, j.error); assert.ok(j.cached, 'cache used when stepping frames');
  assert.strictEqual(j.frames, 3); assert.strictEqual(j.frame, 1);
  near(j.scene.bones[ti].world.slice(9), [20, 0, 25], 'frame 1: turret moved (z 15 -> 25)');
  near(j.scene.volumes[0].world.slice(9), [20, 0, 25], 'the volume follows its bone');
  assert.ok(j.scene.meshes.length === 1 && j.scene.meshes[0].parts.length === 0, 'meshes:false: no parts, matrices kept');
  j = await route('', { mod, target: mdlFile, anm: 'resource/entity/vt/turn.anm', frame: 99, meshes: false }, ctx);
  assert.ok(j.ok && j.frame === 2, 'anm by its file-set rel; frame clamped');
  ok('route: animation at frame 1 moves the child bone and its volume, meshes:false sends no parts, the cache is used, rel names and frame clamp');

  const t2 = new Date(Date.now() + 5000); fs.utimesSync(path.join(dir, 'body.ply'), t2, t2);
  j = await route('', { mod, target: mdlFile, meshes: false }, ctx); assert.ok(j.ok && !j.cached, 'a changed file drops the cache');
  ok('route: a changed file in the model folder reloads the model');

  const refused = async (b, re) => { const x = await route('', b, ctx); assert.ok(x.ok === false && re.test(x.error) && !/\n\s+at /.test(x.error), JSON.stringify(x)); };
  await refused({ mod, target: path.join(dir, 'none.mdl') }, /not in the mod folder|could not|was not found/i);
  await refused({ mod, target: 'nosuchunit' }, /No entity named/);
  await refused({ mod, target: mdlFile, anm: 'nope.anm' }, /animation nope\.anm was not found/);
  await refused({ target: mdlFile }, /mod folder/i);
  await refused({ mod: game, target: mdlFile }, /game install/);
  await refused({ mod, target: '' }, /Pick a model/);
  await refused({ mod, target: '-x' }, /cannot start/);
  const before = fs.readdirSync(mod, { recursive: true }).sort().join('|');
  await route('', { mod, target: mdlFile, anm: 'turn.anm', frame: 2 }, ctx);
  assert.strictEqual(fs.readdirSync(mod, { recursive: true }).sort().join('|'), before, 'reads only');
  srv._t.drop();
  ok('route: missing model, unknown unit, missing animation, no mod, the game as mod, empty and "-" names give { ok: false, error } sentences; nothing written');

  // ---------- (5) lod, obstacles and the texture route ----------
  j = await route('', { mod, target: mdlFile, lod: 5, meshes: false }, ctx);
  assert.ok(j.ok && j.lodCount === 1 && j.lod === 0, 'one LOD level, lod clamped');
  assert.ok(Array.isArray(j.scene.obstacles) && Array.isArray(j.scene.areas), 'obstacles and areas sent');
  assert.strictEqual(srv._t.diffuseOf(Buffer.from('{material {diffuse "skin.dds"}}')), 'skin.dds', 'mtl diffuse');
  assert.strictEqual(srv._t.texBase('$/a.dds', 'resource/x/'), 'resource/texture/common/a.dds', '$/ base');
  assert.strictEqual(srv._t.texBase('b.dds', 'resource/x/'), 'resource/x/b.dds', 'relative base');
  const texRoute = srv.routes['POST /api/x/models/viewer/texture'];
  const part = sc.meshes[0].parts[0], tname = part.material || (part.textures || [])[0];
  assert.ok(tname, 'the part names a material or texture ' + JSON.stringify(part.material));
  fs.mkdirSync(path.join(dir, 'tex'), { recursive: true });
  const ddsHead = (four) => { const hd = Buffer.alloc(124); hd.writeUInt32LE(124, 0); hd.writeUInt32LE(0x1007, 4); hd.writeUInt32LE(4, 8); hd.writeUInt32LE(4, 12); hd.writeUInt32LE(1, 24); hd.writeUInt32LE(32, 72); hd.writeUInt32LE(4, 76); hd.write(four, 80, 'latin1'); return B('DDS ', hd); };
  fs.writeFileSync(path.join(dir, 'tex', 'a.dds'), B(ddsHead('DXT1'), u16(0xf800, 0xf800), u32(0)));
  const tq = { mod, target: mdlFile, rel: tname, mesh: sc.meshes[0].file };
  j = await texRoute('', tq, ctx);
  assert.ok(j.ok, JSON.stringify(j)); assert.ok(j.width === 4 && j.height === 4 && j.format === 'DXT1', 'size and format');
  const px0 = Buffer.from(j.rgba, 'base64'); assert.strictEqual(px0.length, 64); assert.deepStrictEqual(Array.from(px0.slice(0, 4)), [255, 0, 0, 255], 'red pixel');
  const nu = await texRoute('', Object.assign({}, tq, { rel: 'other.dds' }), ctx); assert.ok(nu.ok === false && /does not use/.test(nu.error), 'only names the mesh uses');
  assert.ok((await texRoute('', Object.assign({}, tq, { mesh: '' }), ctx)).ok === false, 'mesh needed');
  fs.writeFileSync(path.join(dir, 'tex', 'a.dds'), B(ddsHead('ATI1'), Buffer.alloc(16)));
  const t3 = new Date(Date.now() + 9000); fs.utimesSync(path.join(dir, 'tex', 'a.dds'), t3, t3); fs.utimesSync(path.join(dir, 'body.ply'), t3, t3);
  j = await texRoute('', tq, ctx); assert.ok(j.ok === false && /ATI1/.test(j.error), 'an unread DDS format is named ' + JSON.stringify(j));
  const before2 = fs.readdirSync(mod, { recursive: true }).sort().join('|'); await texRoute('', tq, ctx);
  assert.strictEqual(fs.readdirSync(mod, { recursive: true }).sort().join('|'), before2, 'texture route reads only');
  ok('route: lod clamp and count, obstacles and areas lists, the texture a part names decoded from DDS, refusals name the format');

  // ---------- (6) camera, panes, refresh plan, palette (pure) ----------
  const c0 = T.newCam('front', true); T.frameTo(c0, { min: [-10, -10, -10], max: [10, 10, 10] });
  let Bs = T.camBasis(c0); near(Bs.f, [-1, 0, 0], 'front looks along -X'); near(Bs.u, [0, 0, 1], 'front: up is +Z'); near(Bs.r, [0, 1, 0], 'front: right is +Y (its left side)');
  const ct = T.newCam('top', true); Bs = T.camBasis(ct); near(Bs.f, [0, 0, -1], 'top looks down'); near(Bs.u, [1, 0, 0], 'top: forward is up the screen');
  for (const v of T.VIEWS) { const c = T.newCam(v, false); const b = T.camBasis(c); assert.ok(Math.abs(Math.hypot(...b.f) - 1) < 1e-9 && Math.abs(T.inv3(b.r.concat(b.u, b.f)) ? 1 : 0) === 1, v); }
  assert.ok(Math.abs(T.camBasis(T.newCam('back')).f[0] - 1) < 1e-9 && Math.abs(T.camBasis(T.newCam('bottom')).f[2] - 1) < 1e-9 && Math.abs(T.camBasis(T.newCam('left')).f[1] + 1) < 1e-9 && Math.abs(T.camBasis(T.newCam('right')).f[1] - 1) < 1e-9, 'back, bottom, left, right look the right way');
  // a ray through a projected point comes back to that point (perspective and flat)
  for (const ortho of [false, true]) {
    const c = T.newCam('persp', ortho); T.frameTo(c, { min: [-20, -20, -20], max: [20, 20, 20] }); T.orbit(c, 30, -12);
    const P = [5, -7, 3], cm = T.camMat(c, 400 / 300), s = T.project(cm.PV, P, 400, 300); assert.ok(s, 'projects');
    const ry = T.camRay(c, 2 * s[0] / 400 - 1, 1 - 2 * s[1] / 300, 400 / 300);
    const w0 = [P[0] - ry.o[0], P[1] - ry.o[1], P[2] - ry.o[2]], t = w0[0] * ry.d[0] + w0[1] * ry.d[1] + w0[2] * ry.d[2];
    const miss = Math.hypot(w0[0] - ry.d[0] * t, w0[1] - ry.d[1] * t, w0[2] - ry.d[2] * t); assert.ok(miss < 1e-6, (ortho ? 'flat' : 'perspective') + ' ray through the projected point, miss ' + miss);
    assert.ok(T.upp(c, P, 300) > 0, 'units per pixel');
  }
  const cz = T.newCam('top', true); T.frameTo(cz, { min: [-10, -10, -10], max: [10, 10, 10] }); const d0 = cz.dist; T.zoom(cz, -100); assert.ok(cz.dist < d0 && cz.step === 13, 'flat zoom in one step');
  for (let i = 0; i < 40; i++) T.zoom(cz, 100); assert.strictEqual(cz.step, 0, 'flat zoom stops at the last of ' + T.ZSTEPS + ' steps');
  const cp = T.newCam('persp'); T.frameTo(cp, { min: [-10, -10, -10], max: [10, 10, 10] }); const dp = cp.dist; T.zoom(cp, 100, 'ctrl'); const big = cp.dist; T.frameTo(cp, { min: [-10, -10, -10], max: [10, 10, 10] }); T.zoom(cp, 100); assert.ok(big > cp.dist && cp.dist > dp, 'Ctrl zooms faster');
  T.pan(cp, 10, 0, 300); assert.ok(Math.hypot(...cp.ctr) > 0, 'pan moves the centre');
  const cf = T.newCam('persp'); T.frameTo(cf, { min: [-10, -10, -10], max: [10, 10, 10] }); const e0 = T.camBasis(cf).e; T.flyLook(cf, 40, 10); near(T.camBasis(cf).e, e0, 'fly: looking keeps the eye');
  T.flyMove(cf, { w: true }, 5); const e1 = T.camBasis(cf).e; assert.ok(Math.abs(Math.hypot(e1[0] - e0[0], e1[1] - e0[1], e1[2] - e0[2]) - 5) < 1e-6, 'fly: W moves the eye forward');
  const Lq = T.newLayout(); assert.deepStrictEqual(T.paneRects(Lq, 400, 300), [{ i: 0, x: 0, y: 0, w: 400, h: 300 }], 'one pane fills the view');
  T.toggleQuad(Lq); const RQ = T.paneRects(Lq, 401, 301);
  assert.deepStrictEqual(RQ.map(r => [r.i, r.x, r.y, r.w, r.h]), [[1, 0, 0, 200, 150], [2, 200, 0, 201, 150], [3, 0, 150, 200, 151], [0, 200, 150, 201, 151]], 'four panes: top, front / side, perspective');
  assert.strictEqual(T.paneAt(Lq, 401, 301, 300, 250).i, 0, 'pane under the pointer'); assert.strictEqual(T.paneAt(Lq, 401, 301, 10, 10).i, 1);
  Lq.active = 1; T.nextPane(Lq, 1); assert.strictEqual(Lq.active, 2, 'F6'); T.nextPane(Lq, -1); T.nextPane(Lq, -1); assert.strictEqual(Lq.active, 0, 'Shift+F6 wraps');
  T.maximise(Lq, 3); assert.ok(!Lq.quad && Lq.active === 3 && T.paneRects(Lq, 10, 10)[0].i === 3, 'maximise one pane');
  assert.ok(Lq.panes[1].ortho && Lq.panes[1].view === 'top' && Lq.panes[2].view === 'front' && Lq.panes[3].view === 'left' && !Lq.panes[0].ortho, 'pane cameras');
  assert.deepStrictEqual(T.refreshPlan(['resource/entity/vt/body.ply']), { meshes: true, pose: true, tex: true, obst: false }, 'ply: meshes again');
  assert.deepStrictEqual(T.refreshPlan(['a/vt.mdl']), { meshes: false, pose: true, tex: false, obst: true }, 'mdl: pose and obstacles');
  assert.deepStrictEqual(T.refreshPlan(['a/x.VOL', 'a/t.anm']), { meshes: false, pose: true, tex: false, obst: false }, 'vol, anm: pose');
  assert.deepStrictEqual(T.refreshPlan(['a/s.mtl']), { meshes: false, pose: false, tex: true, obst: false }, 'mtl: textures');
  assert.deepStrictEqual(T.refreshPlan([]), { meshes: false, pose: false, tex: false, obst: false }, 'nothing');
  near(T.mul12(T.inv12(M), M), I, 'inv12'); near(T.tp(T.mul12(R, M), p), T.tp(M, T.tp(R, p)), 'mul12 = a then b');
  const scP = { bones: [{ path: 'a', parent: -1, world: I }, { path: 'a/b', parent: 0, world: [1, 0, 0, 0, 1, 0, 0, 0, 1, 10, 0, 0] }, { path: 'c', parent: -1, world: I }],
    meshes: [{ bone: 1, world: [1, 0, 0, 0, 1, 0, 0, 0, 1, 10, 0, 0] }, { bone: 2, world: I }], volumes: [{ id: 'v', bone: 1, world: [1, 0, 0, 0, 1, 0, 0, 0, 1, 10, 0, 5] }] };
  const Wp = T.previewWorlds(scP, { kind: 'bone', id: 'a', world: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 3, 0] });
  near(Wp.bones[1].slice(9), [10, 3, 0], 'preview moves the child bone'); near(Wp.meshes[0].slice(9), [10, 3, 0], 'and its mesh'); near(Wp.vols[0].slice(9), [10, 3, 5], 'and its volume'); near(Wp.meshes[1], I, 'not other bones');
  near(T.previewWorlds(scP, { kind: 'volume', id: 'v', world: R }).vols[0], R, 'volume preview');
  const ob = T.outline2({ kind: 'OBB2', center: [10, 0], extent: [4, 2], axis: [1, 0] }); assert.deepStrictEqual(ob.map(x => x.map(Math.round)), [[14, 2], [6, 2], [6, -2], [14, -2]], 'OBB2 outline: extent is half');
  assert.strictEqual(T.outline2({ kind: 'Circle2', center: [0, 0], radius: 3 }).length, 32, 'circle'); assert.strictEqual(T.outline2({ kind: 'Polygon2', vertices: [[0, 0], [1, 0], [1, 1]] }).length, 3, 'polygon');
  assert.deepStrictEqual(T.parseCol('#ff0000'), [1, 0, 0]); assert.deepStrictEqual(T.parseCol(' rgb(0, 255, 0)'), [0, 1, 0]); assert.deepStrictEqual(T.parseCol('#00f'), [0, 0, 1]); assert.strictEqual(T.parseCol('nope'), null);
  const PL = T.palette(n => ({ '--card': '#101010', '--fg': '#f0f0f0', '--acc': 'rgb(0, 128, 255)' })[n] || '');
  assert.ok(PL.dark && PL.bg[0] < 0.1 && Math.abs(PL.acc[2] - 1) < 1e-9 && PL.x.length === 3 && PL.sides.length === 6, 'palette from the CSS variables, grey for a missing one');
  assert.ok(!/#[0-9a-fA-F]{6}\b|'#[0-9a-fA-F]{3}'/.test(script), 'no fixed hex colours in the view');
  assert.deepStrictEqual(T.edgesOf([0, 1, 2, 0, 2, 3]), [0, 1, 1, 2, 0, 2, 2, 3, 0, 3], 'unique edges');
  const sh = T.defShow(); T.setViewing(sh, 'collision'); assert.ok(!sh.meshes && sh.volumes && T.viewingOf(sh) === 'collision', 'collision view'); T.setViewing(sh, 'hybrid'); assert.strictEqual(T.viewingOf(sh), 'hybrid');
  T.gridResize(sh, 10); assert.strictEqual(sh.gridN, 50, 'grid at most 50'); T.gridResize(sh, -20); assert.strictEqual(sh.gridN, 5, 'grid at least 5');
  const hm = T.pickMesh([{ world: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 10], bone: 4, hit: [{ pos: new Float32Array([0, 0, 0, 10, 0, 0, 0, 10, 0]), ix: [0, 1, 2], box: T.aabbOf([0, 0, 0, 10, 0, 0, 0, 10, 0]) }] }], [2, 2, 50], [0, 0, -1]);
  assert.ok(hm && hm.bone === 4 && Math.abs(hm.t - 40) < 1e-6, 'mesh pick gives its bone');
  assert.strictEqual(T.nearPt([[0, 0, 0], [10, 10, 0], null, [3, 4, 2]], 9, 9, 8), 1, 'nearest joint on screen, behind the camera skipped');
  ok('camera: fixed views look the right way, ray through a projected point, flat zoom steps, Ctrl zoom, pan, fly; panes: one and four, pane under the pointer, F6, maximise; refresh plan; preview worlds; outlines; palette; edges; viewing; grid; mesh and joint picking');

  // ---------- (7) the view on a fake WebGL with a stand-in document ----------
  const draws = { n: 0 }, glCalls = [];
  const fakeGL = () => new Proxy({}, { get(o, k) {
    if (typeof k !== 'string') return undefined;
    if (/^[A-Z0-9_]+$/.test(k)) return 1;
    return (...a) => { glCalls.push(k); if (k === 'drawElements' || k === 'drawArrays') draws.n++;
      if (k === 'getShaderParameter' || k === 'getProgramParameter') return true;
      if (k === 'getExtension') return a[0] === 'WEBGL_lose_context' ? { loseContext() {} } : {};
      if (k === 'getAttribLocation') return 0;
      if (/^create|^getUniformLocation/.test(k)) return {};
      return undefined; };
  } });
  const texts2d = [];   // every fillText of the overlay: [text, x, y]
  const fake2d = () => new Proxy({}, { get(o, k) { return k === 'fillText' ? (t, x, y) => { texts2d.push([t, x, y]); } : typeof k === 'string' && !/Style|font|lineWidth|textAlign|lineJoin/.test(k) ? () => {} : undefined; }, set() { return true; } });
  const node2 = tag => { const o = node(tag); if (tag === 'canvas') { o.clientWidth = 400; o.clientHeight = 300; o.getContext = k => (k === '2d' ? fake2d() : fakeGL()); } return o; };
  const h2 = (tag, attrs, kids) => { const e = node2(tag); for (const k of Object.keys(attrs || {})) { const v = attrs[k]; if (v == null) continue; if (k === 'text') e.textContent = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v); }
    for (const c of kids || []) if (c != null) e.appendChild(typeof c === 'string' ? { text: c } : c); return e; };
  const VARS = { '--card': '#202020', '--fg': '#e0e0e0', '--acc': '#3080ff', '--err': '#ff4040', '--ok': '#40c040', '--link': '#4080ff', '--line': '#555555', '--hint': '#999999', '--whol': '#c0a000' };
  const win2 = { addEventListener() {}, devicePixelRatio: 1, getComputedStyle: () => ({ getPropertyValue: n => VARS[n] || '' }), matchMedia: () => ({ addEventListener() {}, removeEventListener() {} }) };
  const G = require('./gizmo.client');
  const EXT2 = { models: { parts: {}, subs: {} } }, api2 = [];
  const LSs = { get: (k, d) => d, set() {} };
  const run = s => new Function('EXT_SCREENS', 'h', 'tx', 'api', 'S', 'window', 'document', 'LS', s)(EXT2, h2, tx, (u, b) => { api2.push([u, b]); return new Promise(() => {}); }, { mod: '' }, win2, { createElement: node2, documentElement: {} }, LSs);
  run(script); run(G);
  const base = JSON.parse(JSON.stringify((await route('', { mod, target: mdlFile }, ctx)).scene));
  const calls = [], sels = [], ops = []; let alt = null;
  const D = { id: 'd1', mdl: mdlFile, sel: { bone: null, volume: null, anm: null, frame: 0 }, fn: null,
    on(f) { this.fn = f; return () => { this.fn = null; }; },
    scene(q) { calls.push(q); const s = JSON.parse(JSON.stringify(base)); if (alt) { s.meshes[0].file = alt; alt = null; } if (!q.meshes) s.meshes.forEach(m => { m.parts = []; }); return Promise.resolve(Object.assign(s, { rev: 1, anm: q.anm, frame: q.frame, frames: 3 })); },
    select(o) { sels.push(o); }, op(n, a) { ops.push([n, a]); return Promise.resolve({ rev: 2 }); }, state() { return Promise.resolve({ obstacles: [], areas: [] }); } };
  EXT2.models.doc = D;
  const tick = () => new Promise(r => setTimeout(r, 5));
  const v3 = EXT2.models.parts.viewer({ set: { target: 'pz4h' }, mod: 'M' }, {});
  await tick();
  let st = v3._st();
  assert.ok(st.SC && st.mesh === 1 && calls.length === 1 && calls[0].meshes === true && calls[0].lod === 0, 'doc: the first scene comes from D.scene with meshes');
  assert.ok(api2.every(a => a[0] !== '/api/x/models/viewer/scene'), 'doc: the scene route is not called');
  assert.ok(st.G && typeof st.G.lines === 'function', 'the gizmo part is joined');
  v3._ev.draw(); assert.ok(draws.n > 0, 'draws on the fake GL'); st = v3._st(); assert.ok(st.LAST[0] && st.LAST[0].PV.length === 16, 'pane camera kept for picking');
  assert.ok(api2.some(a => a[0] === '/api/x/models/viewer/texture' && a[1].rel === tname && a[1].mesh === base.meshes[0].file && a[1].target === mdlFile && a[1].mod === 'M'), 'texture asked for the part ' + JSON.stringify(api2));
  T.orbit(st.L.panes[0], 50, 0); const yaw = st.L.panes[0].yaw;
  D.fn({ type: 'change', changed: ['resource/entity/vt/vt.mdl'] }); await tick();
  assert.ok(calls.length === 2 && calls[1].meshes === false, 'mdl change: pose only'); assert.strictEqual(v3._st().L.panes[0].yaw, yaw, 'camera kept');
  D.fn({ type: 'change', changed: ['resource/entity/vt/body.ply'] }); await tick();
  assert.ok(calls.length === 3 && calls[2].meshes === true, 'ply change: meshes again');
  D.fn({ type: 'change', changed: ['resource/entity/vt/tex/a.dds'] }); await tick();
  assert.strictEqual(calls.length, 3, 'texture change: no scene fetch');
  alt = 'resource/entity/vt/other.ply'; D.fn({ type: 'change', changed: ['x.vol'] }); await tick(); await tick();
  assert.ok(calls.length === 5 && calls[3].meshes === false && calls[4].meshes === true, 'a pose fetch with other meshes fetches the meshes');
  D.fn({ type: 'select', sel: { bone: null, volume: null, anm: 'turn.anm', frame: 1 } }); await tick();
  assert.ok(calls.length === 6 && calls[5].anm === 'turn.anm' && calls[5].frame === 1 && calls[5].meshes === false, 'animation and frame from D.sel');
  D.fn({ type: 'select', sel: { bone: null, volume: null, anm: null, frame: 0 } }); await tick();
  const volId = base.volumes[0].id;
  D.fn({ type: 'select', sel: { bone: null, volume: volId, anm: null, frame: 0 } });
  assert.strictEqual(v3._st().sel.volume, volId, 'selection from D.sel');
  const VARS0 = VARS['--card']; VARS['--card'] = '#f0f0f0'; v3._ev.theme(); assert.ok(v3._st().PAL.bg[0] > 0.9 && !v3._st().PAL.dark, 'theme change read again'); VARS['--card'] = VARS0; v3._ev.theme();
  ok('view in a document: D.scene with meshes, only what changed is fetched again, the camera stays, frame and selection from D.sel, textures asked, theme read again');

  // joins: hidden bones and volumes (display only), obstacles from the document scene, fov and grid preferences, key rows
  const b0 = base.bones[0].path, kid = base.bones.findIndex(b => b.parent === 0);
  D.hidden = { bones: [b0], volumes: [] };
  assert.ok(v3._ev.hidBone(0) && (kid < 0 || v3._ev.hidBone(kid)) && !v3._ev.hidVol({ id: volId }), 'a hidden bone hides what is under it');
  D.hidden = { bones: [], volumes: [volId] }; D.fn({ type: 'hidden' }); v3._ev.draw();
  assert.ok(!v3._ev.hidBone(0) && v3._ev.hidVol({ id: volId }), 'a hidden volume by its id');
  D.hidden = { bones: [], volumes: [] };
  const sc0 = D.scene; D.scene = q => sc0.call(D, q).then(s => Object.assign(s, { obstacles: [{ name: 'o', kind: 'OBB2', center: [0, 0], extent: [2, 1], axis: [1, 0] }], areas: [] }));
  D.fn({ type: 'change', changed: ['resource/entity/vt/vt.mdl'] }); await tick();
  assert.ok(v3._ev.obst() && v3._ev.obst().obstacles[0].name === 'o', 'obstacles come with the document scene'); D.scene = sc0;
  const PLS = [], plis = n => PLS.forEach(f => f(n)); const PV = { fov: 90, grid: 50 }; EXT2.models.prefs = { get: n => PV[n], on(f) { PLS.push(f); } };
  const vP = EXT2.models.parts.viewer({ set: { target: 'pz4h' }, mod: 'M' }, {}); await tick();
  assert.ok(Math.abs(vP._ev.prefs().fov - Math.PI / 2) < 1e-9 && vP._ev.prefs().grid === 50 && PLS.length > 0, 'fov and grid from the preferences');
  PV.fov = 0.8 * 180 / Math.PI; PV.grid = 20; plis('fov'); assert.ok(Math.abs(vP._ev.prefs().fov - 0.8) < 1e-9 && vP._ev.prefs().grid === 20, 'a preference change is read again');
  delete EXT2.models.prefs;
  assert.ok(['gizmo', 'fit', 'views', 'ortho', 'panes', 'esc', 'fly'].every(k => EXT2.models.keys.some(r => r.key === 'models.viewer.key.' + k && L.en[r.key])), 'key rows with texts');
  ok('joins: hidden bones and volumes, obstacles from the document scene, fov and grid preferences read and followed, key rows');

  // picking from a flat top view on the volume centre: the volume (side 1, top), then the bone when bones are shown
  const picks = [];
  D.sel = { bone: null, volume: null, anm: 'turn.anm', frame: 1 };
  const v4 = EXT2.models.parts.viewer({ set: { target: 'pz4h' }, mod: 'M' }, { height: 380, show: { meshes: false, volumes: true, bones: false }, onPick(o) { picks.push(o); } });
  await tick(); st = v4._st();
  assert.strictEqual(calls[calls.length - 1].anm, null, 'with onPick the view stays at rest (Armor)');
  const vw = st.SC.volumes[0].world, cam = st.L.panes[st.L.active]; T.setView(cam, 'top'); cam.ortho = true; cam.ctr = vw.slice(9); v4._ev.draw();
  sels.length = 0; v4._ev.click({ clientX: 200, clientY: 150 });
  assert.ok(picks.length === 1 && picks[0].volume === volId && picks[0].side === 1 && picks[0].bone === null, 'click picks the volume, top side ' + JSON.stringify(picks[0]));
  for (const k of ['volume', 'side', 'point', 'origin', 'dir', 'bone']) assert.ok(k in picks[0], 'onPick has ' + k);
  assert.ok(sels.length === 1 && sels[0].volume === volId, 'and tells the document');
  v4.setShow({ bones: true }); v4._ev.draw(); v4._ev.click({ clientX: 200, clientY: 150 });
  const tpath = st.SC.bones[ti].path; assert.ok(picks[1].bone === tpath && picks[1].volume === null, 'a joint within 8 px picks the bone ' + JSON.stringify(picks[1]));
  v4._ev.click({ clientX: 5, clientY: 5 }); assert.ok(picks[2].volume === null && picks[2].bone === null, 'empty space');
  for (const m of ['setPose', 'setColors', 'highlight', 'setShow', 'addLine', 'clearLines', 'reload']) assert.strictEqual(typeof v4[m], 'function', m);
  v4.setColors({ [volId]: '#ff0000' }, { [volId]: ['#ff0000', '#00ff00'] }); v4.highlight(volId); v4.addLine([0, 0, 0], [10, 0, 0], '#00ff00'); v4._ev.draw(); v4.clearLines();
  assert.ok(Array.isArray(picks[0].hits) && picks[0].hits[0].volume === volId && picks[0].hits[0].aim.length === 3, 'the hit lists every volume under the click ' + JSON.stringify(picks[0].hits));
  assert.deepStrictEqual(picks[2].hits, [], 'empty space: no hits');
  // onPick may answer the volume it took (a shot past a ram box): that one is selected, not the one clicked
  const took = [], vT = EXT2.models.parts.viewer({ set: { target: 'pz4h' }, mod: 'M' }, { height: 380, show: { meshes: false, volumes: true, bones: false }, onPick(o) { took.push(o); return { volume: 'inner/x' }; } });
  await tick(); const stT = vT._st(), camT = stT.L.panes[stT.L.active]; T.setView(camT, 'top'); camT.ortho = true; camT.ctr = stT.SC.volumes[0].world.slice(9); vT._ev.draw();
  sels.length = 0; vT._ev.click({ clientX: 200, clientY: 150 });
  assert.ok(took.length === 1 && took[0].volume === volId && sels.length === 1 && sels[0].volume === 'inner/x', 'the answered volume is selected ' + JSON.stringify(sels));
  ok('picking: the volume and its side from a top view, a joint picks its bone, onPick keeps its shape, D.select told; the Armor methods work; hits nearest first, onPick may answer the volume it took');

  // onHit (the Model sub-tab, ../client.js -> ctx.onPick): told the same hit, the view keeps following the pose and its readout
  const hits = [], allText = r => [r.textContent || ''].concat((r.childNodes || []).filter(c => c && typeof c === 'object').map(allText)).join(' | ');
  D.sel = { bone: null, volume: null, anm: 'turn.anm', frame: 1 };
  const v5 = EXT2.models.parts.viewer({ set: { target: 'pz4h' }, mod: 'M' }, { height: 380, show: { meshes: false, volumes: true, bones: false }, onHit(o) { hits.push(o); } });
  await tick(); const st5 = v5._st();
  assert.strictEqual(calls[calls.length - 1].anm, 'turn.anm', 'with onHit the view still follows the document pose');
  const vw5 = st5.SC.volumes[0].world, cam5 = st5.L.panes[st5.L.active]; T.setView(cam5, 'top'); cam5.ortho = true; cam5.ctr = vw5.slice(9); v5._ev.draw();
  sels.length = 0; v5._ev.click({ clientX: 200, clientY: 150 });
  assert.ok(hits.length === 1 && hits[0].volume === volId && Array.isArray(hits[0].point) && hits[0].point.length === 3, 'onHit gets the hit with its point ' + JSON.stringify(hits[0]));
  for (const k of ['volume', 'side', 'point', 'origin', 'dir', 'bone']) assert.ok(k in hits[0], 'onHit has ' + k);
  assert.ok(sels.length === 1 && sels[0].volume === volId, 'the document is still told');
  assert.ok(allText(v5).includes(volId), 'the readout still names the picked volume');
  ok('onHit: told the hit with its point; pose following, D.select and the readout stay');

  // the ray of the click: in a flat top view the view direction (straight down), in perspective from the eye through the point
  const cv5 = v5.camera(); near(cv5.dir, [0, 0, -1], 'camera(): flat top view looks down'); assert.strictEqual(cv5.ortho, true);
  near(hits[0].dir, [0, 0, -1], 'flat view: the hit dir is the view direction');
  cam5.ortho = false; v5._ev.draw(); v5._ev.click({ clientX: 200, clientY: 150 });
  const hp = hits[1], c2 = v5.camera(); assert.ok(hp && hp.point && c2.ortho === false, 'perspective hit');
  near(hp.origin, c2.eye, 'perspective: the ray starts at the eye');
  const pd = [0, 1, 2].map(i => hp.point[i] - hp.origin[i]), pl = Math.hypot(...pd);
  near(pd.map(x => x / pl), hp.dir, 'perspective: dir runs from the eye through the hit point');
  assert.ok(Math.abs(Math.hypot(...hp.dir) - 1) < 1e-9, 'dir is a unit vector');
  ok('the hit carries the ray of the click (origin, dir) in flat and perspective views; camera() gives the active pane');

  // the ground: where the click ray meets z = 0, only going down, in front of its start and near the model
  {
    const gA = T.groundAt, box = { min: [-10, -10, 0], max: [10, 10, 20] };
    assert.strictEqual(T.GROUNDMIN, 400);
    near(gA([0, 0, 100], [0, 0, -1], box), [0, 0, 0], 'straight down');
    near(gA([0, 0, 100], [Math.SQRT1_2, 0, -Math.SQRT1_2], box), [100, 0, 0], 'down at 45 degrees');
    assert.strictEqual(gA([0, 0, 100], [0, 0, 1], box), null, 'going up: none');
    assert.strictEqual(gA([0, 0, 100], [1, 0, 0], box), null, 'level: none');
    assert.strictEqual(gA([0, 0, -5], [0, 0, -1], box), null, 'start below the ground: behind it, none');
    assert.strictEqual(gA([0, 0, 1], [Math.cos(0.001), 0, -Math.sin(0.001)], box), null, 'far beyond max(4 x radius, 400): none');
    const big = { min: [-200, -200, 0], max: [200, 200, 0] }, R4 = 4 * Math.hypot(400, 400) / 2;
    near(gA([0, 0, 50], [Math.cos(Math.atan2(50, 1000)), 0, -Math.sin(Math.atan2(50, 1000))], big), [1000, 0, 0], 'a big model: 4 x radius (' + Math.round(R4) + ') beats 400');
    assert.strictEqual(gA([0, 0, 50], [Math.cos(Math.atan2(50, 1000)), 0, -Math.sin(Math.atan2(50, 1000))], box), null, 'the same point past a small model: none');
    assert.strictEqual(gA(null, [0, 0, -1], box), null);
    // in the view: a flat top click meets the ground right under the click, perspective on the ray, a level flat view never
    const g0 = hits[0].ground; assert.ok(Array.isArray(g0) && g0.length === 3, 'flat top: a ground point ' + JSON.stringify(g0));
    near(g0, [hits[0].origin[0], hits[0].origin[1], 0], 'flat top: under the click');
    const g1 = hp.ground; assert.ok(g1 === null || (Array.isArray(g1) && Math.abs(g1[2]) < 1e-9), 'perspective: null or on z = 0');
    if (g1) { const gd = [0, 1, 2].map(i => g1[i] - hp.origin[i]), gl = Math.hypot(...gd); near(gd.map(x => x / gl), hp.dir, 'perspective: the ground point is on the ray'); }
    T.setView(cam5, 'front'); cam5.ortho = true; v5._ev.draw(); v5._ev.click({ clientX: 200, clientY: 150 });
    assert.strictEqual(hits[hits.length - 1].ground, null, 'a level flat view: no ground');
    for (const k of ['volume', 'side', 'point', 'origin', 'dir', 'bone', 'hits', 'ground']) assert.ok(k in hits[hits.length - 1], 'the hit has ' + k);
    // sceneInfo(): what the Armor tab needs for camera shots without an open document
    const si = v5.sceneInfo();
    assert.ok(si && Array.isArray(si.world) && si.world.length === 12 && si.middle.length === 3 && si.radius > 0, 'sceneInfo: root bone world, middle, radius ' + JSON.stringify(si && { m: si.middle, r: si.radius }));
    assert.ok(Array.isArray(si.ctr[volId]) && si.ctr[volId].length === 3, 'sceneInfo: centre per volume id');
  }
  ok('ground: z = 0 under a downward click ray, in front of its start, within max(4 x radius, 400) of the middle, else null; on the hit in flat and perspective views; sceneInfo() gives the root frame, middle and volume centres');

  // the gizmo inside the view: a drag on the volume's move handle previews, letting go sends one op
  D.fn({ type: 'select', sel: { bone: null, volume: volId, anm: null, frame: 0 } }); st = v4._st();
  const tg = st.host.target(); assert.ok(tg && tg.kind === 'volume' && tg.id === volId, 'gizmo target from the selection'); near(tg.parent, st.SC.bones[ti].world, 'its parent is the bone');
  st.G.setMode('move'); v4._ev.draw();
  const VI = v4._ev.viewInfo(st.L.active), o0 = VI.project(vw.slice(9)), ax = VI.project([vw[9] + vw[0] * 40 * VI.upp(vw.slice(9)), vw[10] + vw[1] * 40 * VI.upp(vw.slice(9)), vw[11]]);
  const hh = st.G.hit(VI, ax[0], ax[1]); assert.ok(hh && hh.axis === 0, 'the X handle is under the pointer ' + JSON.stringify(hh));
  ops.length = 0; st.G.down(VI, hh, ax[0], ax[1], {}); st.G.move(VI, ax[0] + 30, ax[1], {}); st.G.move(VI, ax[0] + 50, ax[1], {});
  assert.ok(ops.length === 0 && v4._st().PREV && v4._st().PREV.id === volId, 'dragging previews, no op yet');
  await st.G.up();
  assert.strictEqual(ops.length, 1, 'one op on release'); assert.strictEqual(ops[0][0], 'vol.setMatrix'); assert.strictEqual(ops[0][1].volume, volId);
  const k = ops[0][1].matrix[9], upx = VI.upp(vw.slice(9)); near(ops[0][1].matrix.slice(0, 9), [1, 0, 0, 0, 1, 0, 0, 0, 1], 'turn kept');
  assert.ok(Math.abs(k + 50 * upx) < 1e-3 && Math.abs(ops[0][1].matrix[10]) < 1e-6, 'moved along its own X, 50 px to the screen right = world -Y = its -X ' + k + ' ' + upx);
  void o0;
  ok('gizmo in the view: handle hit, preview while dragging, exactly one vol.setMatrix on release with the local matrix');

  // window listeners: one mousemove + one mouseup per viewer, taken off when the viewer is released (it was seen and has left the page)
  {
    const WL = { mousemove: [], mouseup: [], resize: [] }, add0 = win2.addEventListener;
    win2.addEventListener = (k, f) => { (WL[k] = WL[k] || []).push(f); };
    win2.removeEventListener = (k, f) => { const i = (WL[k] || []).indexOf(f); if (i >= 0) WL[k].splice(i, 1); };
    const mk = () => EXT2.models.parts.viewer({ set: { target: 'pz4h' }, mod: 'M' }, {});
    // drawn while on the page: seen (the draw is a 16 ms timer; wait for it by its frame, not by a fixed time)
    const drawn = w => require('../../../../lib/test/wait').until(() => Object.keys(w._st().LAST).length > 0, { who: 'models viewer test', what: 'the viewer drew' });
    const wA = mk(); wA.isConnected = true; await tick(); await drawn(wA);
    assert.deepStrictEqual([WL.mousemove.length, WL.mouseup.length], [1, 1], 'one pair of window listeners per viewer');
    const wB = mk(); wB.isConnected = true; await tick(); await drawn(wB);
    assert.deepStrictEqual([WL.mousemove.length, WL.mouseup.length], [2, 2], 'a second viewer on the page adds its own pair');
    wA.isConnected = false; wB.isConnected = false;
    const wC = mk(); await tick();
    assert.deepStrictEqual([WL.mousemove.length, WL.mouseup.length, WL.resize.length], [1, 1, 1], 'released viewers took their window listeners off (move, up, and the resize used without ResizeObserver): only the new viewer listens ' + JSON.stringify([WL.mousemove.length, WL.mouseup.length]));
    void wC; win2.addEventListener = add0; delete win2.removeEventListener;
    ok('window listeners: added per viewer, removed on release (no growth per opened model)');
  }

  // volume names: off by default, one label per drawn volume in every pane, none for hidden volumes or with volumes off,
  // the setting kept across a document reopen and the Show select, the checkbox follows it
  for (const c of ['en', 'ru', 'uk', 'zh']) assert.ok(L[c]['models.viewer.volNames'], 'volume names text in ' + c);
  assert.strictEqual(T.defShow().volNames, false, 'volume names off by default');
  D.sel = { bone: null, volume: null, anm: null, frame: 0 }; D.hidden = { bones: [], volumes: [] };
  const v6 = EXT2.models.parts.viewer({ set: { target: 'pz4h' }, mod: 'M' }, {}); await tick();
  const st6 = v6._st(), vols6 = st6.SC.volumes, vnames = vols6.map(v => v.name || v.id);
  assert.ok(vols6.length > 0 && vnames.every(Boolean), 'the scene has named volumes ' + JSON.stringify(vnames));
  const labelsOf = () => { texts2d.length = 0; v6._ev.draw(); return texts2d.filter(t => vnames.includes(t[0])); };
  assert.strictEqual(st6.show.volNames, false, 'a new view starts with volume names off');
  assert.strictEqual(labelsOf().length, 0, 'off: no volume labels');
  const findChk = (r, text) => { for (const c of r.childNodes || []) { if (!c || typeof c !== 'object') continue;
    if (c.tag === 'label' && c.childNodes.some(k => k && k.text === ' ' + text)) return c.childNodes[0]; const f = findChk(c, text); if (f) return f; } return null; };
  const cbV = findChk(v6, L.en['models.viewer.volNames']); assert.ok(cbV && cbV.tag === 'input' && !cbV.checked, 'a Volume names checkbox, unticked');
  cbV.checked = true; cbV.listeners.change.forEach(f => f()); assert.strictEqual(v6._st().show.volNames, true, 'ticking it turns volume names on');
  let lb = labelsOf(); assert.deepStrictEqual(lb.map(t => t[0]).sort(), vnames.slice().sort(), 'one label per volume ' + JSON.stringify(lb));
  const PVa = v6._st().LAST[st6.L.active].PV, ctr0 = T.project(PVa, vols6[0].world.slice(9), 400, 300);
  assert.ok(ctr0 && Math.abs(lb[0][1] - ctr0[0]) < 40 && Math.abs(lb[0][2] - ctr0[1]) < 40, 'the label sits at the volume ' + JSON.stringify([lb[0], ctr0]));
  T.toggleQuad(st6.L); lb = labelsOf(); assert.strictEqual(lb.length, vnames.length * 4, 'four panes: a label in each pane');
  const rects = T.paneRects(st6.L, 400, 300); assert.ok(rects.every(r => lb.some(t => t[1] >= r.x && t[1] <= r.x + r.w && t[2] >= r.y && t[2] <= r.y + r.h + 20)), 'labels in every pane');
  st6.L.panes.forEach(c => { c.ortho = !c.ortho; }); assert.strictEqual(labelsOf().length, vnames.length * 4, 'flat and perspective panes swapped: labels still drawn');
  T.toggleQuad(st6.L);
  D.hidden = { bones: [], volumes: [vols6[0].id] }; D.fn({ type: 'hidden' });
  assert.ok(!labelsOf().some(t => t[0] === vnames[0]), 'a hidden volume has no label'); D.hidden = { bones: [], volumes: [] };
  v6.setShow({ volumes: false }); assert.strictEqual(labelsOf().length, 0, 'volumes not shown: no labels');
  v6.setShow({ volumes: true }); assert.strictEqual(labelsOf().length, vnames.length, 'volumes back: labels back');
  D.fn({ type: 'open' }); await tick();
  assert.ok(v6._st().show.volNames === true && cbV.checked === true && labelsOf().length === vnames.length, 'the setting is kept when the document opens again');
  v6.setShow({ volNames: false }); assert.ok(cbV.checked === false && labelsOf().length === 0, 'setShow turns it off and the checkbox follows');
  ok('volume names: off by default, one label per shown volume at its centre in every pane, flat and perspective, none when hidden or volumes off, setting kept');

  // the shot result over the model (showShot / clearShot): the plan from a result, then the view on the fake GL
  const VS = [{ id: 'b/hull', name: 'hull' }, { id: 'b/t/tur' }];
  const PJ = { engine: { plates: [{ volume: 'hull', result: 'penetrate' }, { volume: 'tur', result: 'no_penetration' }, { volume: 'x', result: 'no_armor' }], events: [{ event: 'break_armor', volume: 'tur' }], end: { point: [1, 0, 0] } },
    ray: { origin: [100, 0, 0], dir: [-2, 0, 0] },
    blasts: [{ point: [0, 0, 10], radius: { inner: 20, outer: 60 }, hits: [{ volume: 'eng', result: 'held', chance: 0.5 }, { volume: 'hull', result: 'held', chance: 1 }, { volume: 'gun', result: 'pierced', chance: 0, chanceIfBlast: 0 }] }, { point: null, radius: { outer: 5 } }],
    jets: [{ distance: 2, hits: [{ volume: 'eng2', events: ['bullet_hit', 'pierce'], chance: 0.3 }] }],
    fires: [{ chance: 0.5, volumes: [{ volume: 'hull', chance: 0.4 }] }, { chance: 0.2 }] };
  const pp = T.shotPlan(PJ, VS);
  assert.deepStrictEqual(pp.vols, { 'b/hull': 'pierced', 'b/t/tur': 'damaged', eng: 'held', eng2: 'pierced' }, 'worst result per volume, short names to ids, no chance no colour');
  assert.deepStrictEqual(pp.jets, [{ from: [1, 0, 0], to: [-39, 0, 0] }], 'a jet without its own point starts at the burst point along the shot, metres to units');
  assert.deepStrictEqual(pp.blasts, [{ point: [0, 0, 10], r: 60 }], 'blast sphere of the outer radius'); assert.deepStrictEqual(pp.fires, [{ volume: 'b/hull' }], 'fire at its volume');
  assert.deepStrictEqual(pp.missing.sort(), ['blasts[].point', 'fires[].volumes'], 'missing fields named');
  assert.deepStrictEqual(T.shotPlan({ jets: [{ distance: 2 }] }, []).missing.sort(), ['jets[].dir', 'jets[].point'], 'a jet with nothing to start from is skipped and named');
  assert.deepStrictEqual(T.shotPlan({ jets: [{ point: [0, 0, 0], dir: [0, 0, 3], distanceM: 1 }] }, []).jets, [{ from: [0, 0, 0], to: [0, 0, 20] }], 'own point and direction');
  assert.deepStrictEqual(T.shotPlan({ blasts: [{ point: [1, 1, 1], radiusM: { outer: 2 } }] }, []).blasts, [{ point: [1, 1, 1], r: 40 }], 'radius in metres');
  assert.deepStrictEqual(T.shotPlan(null, VS), { vols: {}, jets: [], fires: [], blasts: [], missing: [] });
  const rs = T.ringSegs([1, 2, 3], 10); assert.ok(rs.length === 96 && rs.every(s => s.every(p => Math.abs(Math.hypot(p[0] - 1, p[1] - 2, p[2] - 3) - 10) < 1e-9)), 'wire sphere: three rings on the radius');
  assert.ok(T.defShow().shot === true, 'the overlay is on by default');
  for (const c of ['en', 'ru', 'uk', 'zh']) for (const k of ['show', 'pierced', 'damaged', 'held', 'jet', 'fire', 'blast']) assert.ok(L[c]['models.viewer.shot.' + k], c + ' shot ' + k);
  const id0 = vols6[0].id, findBlk = (r, id) => { if (!r || typeof r !== 'object') return null; if (r.attrs && r.attrs.blk === id) return r; for (const c of r.childNodes || []) { const f = findBlk(c, id); if (f) return f; } return null; };
  const sBox = findBlk(v6, 'view.shot'); assert.ok(sBox && sBox.childNodes.length === 0, 'the shot leaf is empty before a shot');
  const RJ = { engine: { plates: [{ volume: id0, result: 'penetrate' }], end: { point: [0, 0, 0] } }, ray: { origin: [50, 0, 0], dir: [-1, 0, 0] },
    blasts: [{ point: [0, 0, 0], radius: { outer: 30 }, hits: [] }], jets: [{ distance: 1, hits: [] }], fires: [{ chance: 1, volumes: [{ volume: id0, chance: 1 }] }] };
  v6.setShow({ shot: false }); draws.n = 0; v6._ev.draw(); const nOff = draws.n;
  const got = v6.showShot(RJ); assert.deepStrictEqual(got, { missing: [], volumes: 1, jets: 1, fires: 1, blasts: 1 }, 'showShot says what it drew');
  assert.ok(v6._st().plan.vols[id0] === 'pierced', 'the plan uses the scene ids');
  const allT = r => [r.textContent || r.text || ''].concat((r.childNodes || []).filter(c => c && typeof c === 'object').map(allT)).join(' | '), sTxt = allT(sBox); assert.ok(['models.viewer.shot.show', 'pierced', 'jet', 'fire', 'blast'].every(k => sTxt.includes(L.en[k] || L.en['models.viewer.shot.' + k] || k)) && !sTxt.includes(L.en['models.viewer.shot.held']), 'legend: the switch and the kinds drawn ' + sTxt);
  draws.n = 0; v6._ev.draw(); assert.strictEqual(draws.n, nOff, 'switched off: nothing more drawn');
  const sCb = findChk(sBox, L.en['models.viewer.shot.show']); assert.ok(sCb && !sCb.checked, 'the switch follows the setting');
  sCb.checked = true; sCb.listeners.change.forEach(f => f()); assert.strictEqual(v6._st().show.shot, true);
  draws.n = 0; v6._ev.draw(); assert.ok(draws.n > nOff, 'on: lines and markers drawn ' + draws.n + ' > ' + nOff);
  v6.clearShot(); assert.ok(v6._st().shot === null && sBox.childNodes.length === 0, 'clearShot empties the overlay and its leaf');
  v6.showShot(RJ); D.fn({ type: 'open' }); await tick(); assert.ok(v6._st().shot === null && sBox.childNodes.length === 0, 'a model that opens clears the overlay');
  assert.ok(typeof w.showShot === 'function' && typeof w.clearShot === 'function' && Array.isArray(w.showShot(PJ).missing), 'without WebGL the methods are there');
  ok('shot overlay: volumes by worst result, jets from the burst point, blasts as wire spheres, fires at their volume, missing fields named; legend leaf with the switch; cleared on a new model');

  // the core's own jet and fire places (tools/armorsim effects: jets[].point + jets[].dir, fires[].point | null) win over the fallbacks
  const OWN = { engine: { end: { point: [9, 9, 9], burst: [8, 8, 8] } }, ray: { origin: [100, 0, 0], dir: [-1, 0, 0] },
    jets: [{ point: [1, 2, 3], dir: [0, 1, 0], distance: 0.5 }, { distance: 1 }],
    fires: [{ chance: 1, point: [4, 5, 6], volumes: [{ volume: 'hull', chance: 1 }] }, { chance: 1, point: null, volumes: [{ volume: 'hull', chance: 1 }] }, { chance: 1, point: [7, 7, 7] }] };
  const po = T.shotPlan(OWN, VS);
  assert.deepStrictEqual(po.jets, [{ from: [1, 2, 3], to: [1, 12, 3] }, { from: [8, 8, 8], to: [-12, 8, 8] }], 'a jet with its own point and direction starts there; one without starts at the burst point along the shot');
  assert.deepStrictEqual(po.fires, [{ point: [4, 5, 6] }, { volume: 'b/hull' }, { point: [7, 7, 7] }], 'a fire with its own point is one marker there; point null: at its volumes');
  assert.deepStrictEqual(po.missing, [], 'nothing missing');
  ok('shot overlay: jets from their own point along their own direction, fires at their own point, the old drawing when absent');

  // labels on blasts, jets and fires (show.shotLabels): a synthetic result of a shaped charge shell, two blasts at one point, a jet
  // starting there, a fire at its own point and one at its volume
  const say = (k, s) => (L.en[k] || k).replace(/\{(\w+)\}/g, (m, x) => (s && s[x] != null ? String(s[x]) : m));
  const HJ = { shell: { kind: 'heat' }, engine: { end: { point: [0, 0, 0], burst: [2, 0, 4] } }, ray: { origin: [60, 0, 0], dir: [-1, 0, 0] },
    blasts: [{ source: 'shell', by: null, point: [2, 0, 4], energy: 119.6, radius: { inner: 20, outer: 70 }, radiusM: { inner: 1, outer: 3.5 }, chance: 1,
      hits: [{ volume: 'hull', part: 'body', result: 'held', chance: 1 }, { volume: 'tur', result: 'damaged', chance: 0.5 }, { volume: 'gun', result: 'held', chance: 0, chanceIfBlast: 0 }] },
    { source: 'script', by: { event: 'on_ammo_explode' }, point: [2.1, 0, 4], energy: 40, radius: { outer: 34 }, chance: 0.4, hits: [] }],
    jets: [{ damage: 300.4, distance: 1.54, point: [2, 0, 4], dir: [-1, 0, 0], chance: 0.996, hits: [{ volume: 'eng', events: ['pierce'], chance: 0.9 }] }],
    fires: [{ chance: 1, point: [0, 5, 0], radius: 2, heating: 7.5, time: 12 }, { chance: 0.3, point: null, radius: 1.25, heating: 3, volumes: [{ volume: 'hull', chance: 0.2 }] }] };
  const lbs = T.shotLabels(HJ, VS, say);
  assert.strictEqual(lbs.length, 3, 'two blasts and the jet at one point make one group; each fire its own ' + JSON.stringify(lbs));
  assert.deepStrictEqual(lbs[0].lines.map(l => l.k), ['blast', 'blast', 'jet'], 'one line per thing at that point');
  assert.strictEqual(lbs[0].lines[0].t, 'Shell burst: radius 3.5 m, energy 120, parts reached 2', 'shell burst: radius 1 decimal, energy whole, no chance at 100%, parts with a chance ' + lbs[0].lines[0].t);
  assert.strictEqual(lbs[0].lines[1].t, 'Blast from the script event on_ammo_explode: radius 1.7 m, energy 40, chance 40%, parts reached 0', 'script blast named by its event, units to metres ' + lbs[0].lines[1].t);
  assert.strictEqual(lbs[0].lines[2].t, 'Shaped charge jet: damage 300, reach 1.5 m, chance >99%', 'jet: damage, reach in metres, chance below 100 ' + lbs[0].lines[2].t);
  assert.deepStrictEqual(lbs[1], { point: [0, 5, 0], volume: null, lines: [{ k: 'fire', t: 'Fire: radius 2 m, heating 7.5, burns 12 s' }] }, 'fire at its own point');
  assert.deepStrictEqual(lbs[2], { point: null, volume: 'b/hull', lines: [{ k: 'fire', t: 'Fire: radius 1.3 m, heating 3, chance 30%' }] }, 'fire without a point: at its volume, no time when absent');
  assert.deepStrictEqual(T.shotLabels({ blasts: [{ point: null, radius: { outer: 5 } }], jets: [{ distance: 2 }] }, [], say), [], 'nothing drawn, nothing labelled');
  assert.deepStrictEqual(T.shotLabels(null, [], say), []);
  const plT = T.placeTags([{ x: 10, y: 10, w: 100, h: 14 }, { x: 12, y: 12, w: 80, h: 28 }, { x: 300, y: 10, w: 50, h: 14 }], 2);
  assert.deepStrictEqual(plT, [{ x: 10, y: 10 }, { x: 12, y: 26 }, { x: 300, y: 10 }], 'a label that would cover another goes under it; a free one stays');
  assert.ok(T.defShow().shotLabels === true, 'labels on by default');
  for (const c of ['en', 'ru', 'uk', 'zh']) for (const k of ['labels', 'l.shell', 'l.script', 'l.scriptAny', 'l.blast', 'l.jet', 'l.fire', 'q.radius', 'q.energy', 'q.chance', 'q.parts', 'q.damage', 'q.reach', 'q.heating', 'q.time']) assert.ok(L[c]['models.viewer.shot.' + k], c + ' label ' + k);
  // in the view: the leaf with its switch, labels drawn on the overlay, the switch hides the labels and keeps the shapes
  const lBox = findBlk(v6, 'view.shotlabels'); assert.ok(lBox && lBox.childNodes.length === 0, 'the labels leaf is empty before a shot');
  const kids6 = (v6.childNodes || []).map(c => c && c.attrs && c.attrs.blk); assert.strictEqual(kids6.indexOf('view.shotlabels'), kids6.indexOf('view.shot') + 1, 'right after the shot switch ' + kids6.join(','));
  const HV = JSON.parse(JSON.stringify(HJ)); HV.fires[1].volumes[0].volume = id0;
  v6.setShow({ shot: true }); const gotH = v6.showShot(HV);
  assert.deepStrictEqual(gotH, { missing: [], volumes: 3, jets: 1, fires: 2, blasts: 2 }, 'the heat shell: its jet drawn with both blasts and both fires ' + JSON.stringify(gotH));
  const lCb = findChk(lBox, L.en['models.viewer.shot.labels']); assert.ok(lCb && lCb.checked === true, 'the labels switch is there and on');
  const tagTexts = () => { texts2d.length = 0; draws.n = 0; v6._ev.draw(); return { t: texts2d.filter(t => /^(Shell burst|Blast from|Shaped charge jet|Fire)/.test(t[0])), n: draws.n }; };
  const on1 = tagTexts();
  assert.strictEqual(on1.t.length, 5, 'every line drawn ' + JSON.stringify(on1.t));
  const ys = on1.t.slice(0, 3).map(t => t[2]); assert.ok(new Set(ys).size === 3, 'lines at one point do not pile up ' + ys);
  lCb.checked = false; lCb.listeners.change.forEach(f => f()); assert.strictEqual(v6._st().show.shotLabels, false);
  const off1 = tagTexts(); assert.ok(off1.t.length === 0 && off1.n === on1.n, 'labels off: no text, the same shapes drawn ' + off1.n + ' ' + on1.n);
  v6.setShow({ shotLabels: true }); assert.ok(lCb.checked === true && tagTexts().t.length === 5, 'setShow turns them back on and the switch follows');
  v6.setShow({ shot: false }); assert.strictEqual(tagTexts().t.length, 0, 'the shot hidden: no labels'); v6.setShow({ shot: true });
  v6.clearShot(); assert.ok(lBox.childNodes.length === 0 && tagTexts().t.length === 0, 'clearShot empties the labels leaf');
  ok('shot labels: blasts (shell burst or the script event), jets and fires in plain words with radius m, energy, chance below 100, parts reached; shared points join, labels never pile up; own switch leaf, on by default');

  // the slots for another part's blocks (addTool, addUnder), on a fake DOM that keeps parents and inserts
  let gl3 = true;
  const node3 = tag => { const o = node2(tag); if (tag === 'canvas' && !gl3) o.getContext = () => null;
    o.parentNode = null; o.getAttribute = k => (k in o.attrs ? o.attrs[k] : null);
    o.appendChild = c => { if (c && typeof c === 'object') c.parentNode = o; o.childNodes.push(c); return c; };
    o.insertBefore = (c, ref) => { const i = o.childNodes.indexOf(ref); c.parentNode = o; if (i < 0) o.childNodes.push(c); else o.childNodes.splice(i, 0, c); return c; };
    o.removeChild = c => { o.childNodes.splice(o.childNodes.indexOf(c), 1); c.parentNode = null; return c; }; return o; };
  const h3 = (tag, attrs, kids) => { const e = node3(tag); for (const k of Object.keys(attrs || {})) { const v = attrs[k]; if (v == null) continue; if (k === 'text') e.textContent = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v); }
    for (const c of kids || []) if (c != null) e.appendChild(typeof c === 'string' ? { text: c } : c); return e; };
  const EXT3 = { models: { parts: {}, subs: {} } };
  const run3 = s => new Function('EXT_SCREENS', 'h', 'tx', 'api', 'S', 'window', 'document', 'LS', s)(EXT3, h3, tx, () => new Promise(() => {}), { mod: '' }, win2, { createElement: node3, documentElement: {} }, LSs);
  run3(script); run3(G);
  const ids3 = n => n.childNodes.filter(c => c && c.attrs).map(c => c.attrs.blk);
  const v7 = EXT3.models.parts.viewer({ set: { target: 'pz4h' }, mod: 'M' }, { blk: 'model.view' });
  const gzr = findBlk(v7, 'model.view.gizmo'); assert.ok(gzr && v7.childNodes.indexOf(gzr) === v7.childNodes.indexOf(findBlk(v7, 'model.view.canvas')) - 1, 'the handles row is right above the canvas');
  const t7 = h3('div', { blk: 'shot.tool' }), u7 = h3('div', { blk: 'shot.bar' });
  assert.strictEqual(v7.addTool(t7), t7); assert.strictEqual(v7.addUnder(u7), u7);
  assert.ok(t7.parentNode === gzr && ids3(gzr).indexOf('shot.tool') === ids3(gzr).indexOf('model.view.gizmo.modes') + 1, 'addTool: beside the mode buttons ' + ids3(gzr).join(','));
  const k7 = ids3(v7); assert.strictEqual(k7.indexOf('shot.bar'), k7.indexOf('model.view.canvas') + 1, 'addUnder: right under the canvas ' + k7.join(','));
  assert.ok(k7.indexOf('shot.bar') < k7.indexOf('model.view.info') && k7.indexOf('shot.bar') < k7.indexOf('model.view.legend') && k7.indexOf('shot.bar') < k7.indexOf('model.view.keys'), 'before the help, legend and keys');
  gl3 = false; const v8 = EXT3.models.parts.viewer({ set: { target: 'pz4h' }, mod: 'M' }, {}); gl3 = true;
  const t8 = h3('div', { blk: 'x.tool' }), t9 = h3('div', { blk: 'y.tool' }); v8.addTool(t8); v8.addTool(t9); v8.addUnder(h3('div', { blk: 'x.bar' }));
  const k8 = ids3(v8), tr8 = findBlk(v8, 'view.tools');
  assert.ok(tr8 && tr8.attrs.class === 'row' && /box|row/.test(String(tr8.attrs.box || 'row')) && ids3(tr8).join() === 'x.tool,y.tool', 'no handles (no WebGL): a row container of its own ' + JSON.stringify(tr8 && tr8.attrs));
  assert.ok(k8.indexOf('view.tools') === k8.indexOf('view.canvas') - 1 && k8.indexOf('x.bar') === k8.indexOf('view.canvas') + 1, 'its tool row above the canvas, the block under it ' + k8.join(','));
  ok('slots: addTool puts a tool leaf beside the mode buttons (or a tool row of its own above the canvas), addUnder right under the canvas');

  // ---------- (8) several models kept, one decode per picture (the texture route of a line-up) ----------
  {
    const T = srv._t, dirs = [];
    fs.writeFileSync(path.join(dir, 'tex', 'a.dds'), B(ddsHead('DXT1'), u16(0x07e0, 0x07e0), u32(0)));
    for (let i = 0; i < T.KEEP + 1; i++) { const d = path.join(mod, 'resource', 'entity', 'vl' + i); fs.cpSync(dir, d, { recursive: true }); fs.renameSync(path.join(d, 'vt.mdl'), path.join(d, 'vl' + i + '.mdl')); dirs.push(path.join(d, 'vl' + i + '.mdl')); }
    T.drop();
    const s0 = T.stat(), q = t => ({ mod, target: t, rel: tname, mesh: sc.meshes[0].file });
    const order = [dirs[0], dirs[1], dirs[2], dirs[0], dirs[1], dirs[2], dirs[2], dirs[0]], got = [];
    for (const t of order) got.push(await texRoute('', q(t), ctx));
    assert.ok(got.every(g => g.ok && g.name === tname && g.width === 4), 'every target answers its picture ' + JSON.stringify(got.map(g => g.error || g.ok)));
    let s1 = T.stat();
    assert.strictEqual(s1.loads - s0.loads, 3, 'three targets asked in turn: each model read once, not once per request');
    assert.strictEqual(s1.models.length, 3, 'the three models are kept');
    assert.strictEqual(s1.decodes - s0.decodes, 1, 'the same picture bytes under three targets: decoded once');
    assert.strictEqual(got[0].rgba, got[1].rgba, 'the same pixels');
    assert.ok(s1.models[0].includes('vl0') && s1.models[1].includes('vl2'), 'the one asked last is first');
    // freshness as before: a file of one model's folder changes -> that model is read again, the others stay
    const t9 = new Date(Date.now() + 20000); fs.utimesSync(path.join(path.dirname(dirs[1]), 'body.ply'), t9, t9);
    await texRoute('', q(dirs[1]), ctx); await texRoute('', q(dirs[0]), ctx);
    let s2 = T.stat();
    assert.strictEqual(s2.loads - s1.loads, 1, 'only the changed model is read again');
    assert.strictEqual(s2.decodes - s1.decodes, 0, 'its picture did not change: no new decode');
    fs.writeFileSync(path.join(path.dirname(dirs[2]), 'tex', 'a.dds'), B(ddsHead('DXT1'), u16(0x001f, 0x001f), u32(0)));
    fs.utimesSync(path.join(path.dirname(dirs[2]), 'body.ply'), t9, t9);   // the freshness check looks at the model's own folder, as before
    const blue = await texRoute('', q(dirs[2]), ctx);
    assert.deepStrictEqual(Array.from(Buffer.from(blue.rgba, 'base64').slice(0, 4)), [0, 0, 255, 255], 'a changed picture is read and decoded again ' + JSON.stringify(blue.error || ''));
    for (const t of dirs) await texRoute('', q(t), ctx);
    const s3 = T.stat();
    assert.strictEqual(s3.models.length, T.KEEP, 'at most KEEP models are kept');
    assert.ok(!s3.models.some(m => m.includes('vl0.mdl')) && s3.models[0].includes('vl' + T.KEEP), 'the one used longest ago went');
    assert.ok((await route('', { mod, target: dirs[3] }, ctx)).cached === true, 'the scene route shares the kept models');
    T.drop(); assert.strictEqual(T.stat().models.length, 0, 'drop empties');
    ok('server: about 8 models kept most recently used first with the same freshness check, a picture decoded once for every mesh and target that shows the same bytes');
  }

  // ---------- (9) a ready-made scene of many models (opts.scene) ----------
  {
    const T = EXT2.models.parts.viewer._t;
    // pure: fit by bounds, default angle, figure boxes and picking
    const inside = (c, b, w, hh) => { const PV = T.camMat(c, w / hh).PV; let edge = Infinity;
      for (let k = 0; k < 8; k++) { const s = T.project(PV, [k & 1 ? b.max[0] : b.min[0], k & 2 ? b.max[1] : b.min[1], k & 4 ? b.max[2] : b.min[2]], w, hh);
        assert.ok(s && s[0] >= -0.01 && s[0] <= w + 0.01 && s[1] >= -0.01 && s[1] <= hh + 0.01, 'corner inside the pane ' + JSON.stringify(s));
        edge = Math.min(edge, s[0] / w, 1 - s[0] / w, s[1] / hh, 1 - s[1] / hh); }
      return edge; };
    const row = { min: [-10, -500, 0], max: [10, 500, 40] };
    for (const [yaw, pitch, ortho] of [[0.4, 0.3, false], [0.7, 0.4, false], [0, 0, false], [1.5, 1.2, false], [0.4, 0.3, true], [Math.PI, Math.PI / 2, true]]) {
      const c = T.newCam('persp', ortho); c.yaw = yaw; c.pitch = pitch; T.fitBox(c, row, 2);
      assert.ok(inside(c, row, 800, 400) < 0.06, 'a long row fills the pane to the margin (yaw ' + yaw + (ortho ? ', flat' : '') + ')');
      near(c.ctr, [0, 0, 20], 'looks at the middle');
    }
    const cs = T.frameTo(T.newCam('persp', false), row), cf = T.fitBox(T.newCam('persp', false), row, 2);
    cs.yaw = cf.yaw = 0; cs.pitch = cf.pitch = 0; T.frameTo(cs, row); T.fitBox(cf, row, 2);
    assert.ok(cf.dist < cs.dist * 0.8, 'closer than the bounding sphere fit on a wide pane ' + cf.dist + ' ' + cs.dist);
    const cr = T.fitBox(T.newCam('persp', false), { min: [0, 0, 0], max: [10, 10, 30] }, 1.5, 900);
    assert.ok(cr.rad === 900 && cr.dist < 200, 'one figure: near, the scene radius kept for the clip planes');
    assert.deepStrictEqual(T.rowView(row), { yaw: 0.4, pitch: 0.3 }, 'a row across: from the front');
    assert.deepStrictEqual(T.rowView({ min: [-500, -10, 0], max: [500, 10, 40] }), { yaw: 1.0, pitch: 0.3 }, 'a column: more from the side');
    assert.deepStrictEqual(T.rowView({ min: [-10, -10, 0], max: [10, 10, 40] }), { yaw: 0.7, pitch: 0.4 }, 'compact: three quarters');
    for (const b of [row, { min: [-500, -10, 0], max: [500, 10, 40] }, null]) { const v = T.rowView(b), e = [Math.cos(v.pitch) * Math.cos(v.yaw), Math.cos(v.pitch) * Math.sin(v.yaw), Math.sin(v.pitch)];
      assert.ok(e[0] > 0.3 && e[2] > 0, 'the eye is in front of the models (+X) and above'); }
    const fb = T.figBoxes([{ world: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 100, 0], figure: 1, boxes: [{ min: [0, 0, 0], max: [20, 40, 10] }] },
      { world: [0, 1, 0, -1, 0, 0, 0, 0, 1, 0, 0, 0], figure: 0, boxes: [{ min: [0, 0, 0], max: [20, 40, 10] }, null] }, { world: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 300, 0], boxes: [{ min: [0, 0, 0], max: [1, 1, 1] }] }]);
    near(fb.figs[1].min.concat(fb.figs[1].max), [0, 100, 0, 20, 140, 10], 'a figure box in world space');
    near(fb.figs[0].min.concat(fb.figs[0].max), [-40, 0, 0, 0, 20, 10], 'through its world matrix');
    near(fb.all.min.concat(fb.all.max), [-40, 0, 0, 20, 301, 10], 'all meshes, also those of no figure');
    assert.strictEqual(T.pickFigure(fb.figs, [200, 120, 5], [-1, 0, 0]), 1); assert.strictEqual(T.pickFigure(fb.figs, [200, 60, 5], [-1, 0, 0]), -1);
    assert.strictEqual(T.pickFigure(fb.figs, [-20, 400, 5], [0, -1, 0]), 0, 'the nearest box along the ray');
    assert.strictEqual(T.fdir('Entity\\Humanskin\\Ger\\body.ply'), 'entity/humanskin/ger/'); assert.strictEqual(T.fdir('body.ply'), '');
    ok('scene maths: fitBox keeps every corner of the bounds inside the pane and fills it, default angle from the front (+X), figure boxes and the ray against them');

    // the view: a line-up of three figures (two targets) and one mesh of no target, from a route of another part
    const m0 = base.meshes[0], at = y => [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, y, 0];
    const lineup = () => ({ ok: true, count: 3, scene: { format: 'scene/1', meshes: [
      Object.assign({}, m0, { world: at(0), target: 'tA', figure: 0 }), Object.assign({}, m0, { world: at(100), target: 'tB', figure: 1 }),
      Object.assign({}, m0, { world: at(200), target: 'tA', figure: 2 }), Object.assign({}, m0, { world: at(300), bone: 7 })] } });
    const api4 = []; let answer = lineup, texHold = false;
    const apiF = (u, b) => { api4.push([u, b]);
      if (u === '/api/x/units/lineup') return Promise.resolve(answer());
      if (u === '/api/x/models/viewer/texture' && !texHold) return Promise.resolve({ ok: true, width: 4, height: 4, format: 'DXT1', rgba: Buffer.alloc(64, 200).toString('base64') });
      return new Promise(() => {}); };
    let size4 = true;
    const node4 = tag => { const o = node2(tag); if (tag === 'canvas' && !size4) { o.clientWidth = 0; o.clientHeight = 0; } return o; };
    const h4 = (tag, attrs, kids) => { const e = node4(tag); for (const k of Object.keys(attrs || {})) { const v = attrs[k]; if (v == null) continue; if (k === 'text') e.textContent = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v); }
      for (const c of kids || []) if (c != null) e.appendChild(typeof c === 'string' ? { text: c } : c); return e; };
    const EXT4 = { models: { parts: {}, subs: {} } };
    const run4 = s => new Function('EXT_SCREENS', 'h', 'tx', 'api', 'S', 'window', 'document', 'LS', s)(EXT4, h4, tx, apiF, { mod: '' }, win2, { createElement: node4, documentElement: {} }, LSs);
    run4(script); run4(G);
    let docScenes = 0; EXT4.models.doc = Object.assign({}, D, { fn: null, scene(q) { docScenes++; return D.scene(q); } });
    const canvasOf = w => { let c = null; (function walk(x) { if (!x || c) return; if (x.tag === 'canvas') { c = x; return; } (x.childNodes || []).forEach(walk); })(w); return c; };
    const texCalls = () => api4.filter(a => a[0] === '/api/x/models/viewer/texture');
    const figs = [], made0 = glCalls.filter(k => k === 'createTexture').length;
    const vs = EXT4.models.parts.viewer({ set: { target: 'pz4h' }, mod: 'M' }, { scene: { url: '/api/x/units/lineup', body: { side: 'ger', buy: ['a', 'b'] } }, onFigure: i => figs.push(i) });
    await tick(); await tick();
    let s = vs._st();
    assert.deepStrictEqual(api4[0], ['/api/x/units/lineup', { side: 'ger', buy: ['a', 'b'], mod: 'M' }], 'the scene route gets the body as given plus the mod, nothing else');
    assert.ok(docScenes === 0 && EXT4.models.doc.fn === null && !s.G, 'no document following, no handles');
    assert.ok(api4.every(a => a[0] !== '/api/x/models/viewer/scene'), 'the viewer\'s own scene route is not asked');
    assert.ok(s.SC && s.mesh === 4 && (vs.anmList || []).length === 0 && !vs.frames, 'the scene is shown: four meshes, no animation list');
    const tc = texCalls().map(a => a[1]);
    assert.deepStrictEqual(tc.map(b => b.target).sort(), ['tA', 'tB'], 'one request per (target, name): two figures of one target share it, a mesh of no target asks nothing ' + JSON.stringify(tc.map(b => b.target)));
    assert.ok(tc.every(b => b.mod === 'M' && b.rel === tname && b.mesh === m0.file), 'with the mesh\'s target, the name and the mesh file');
    assert.strictEqual(glCalls.filter(k => k === 'createTexture').length - made0, 2, 'two GL textures for four parts');
    assert.ok(s.meshes[0].parts[0].tk === s.meshes[2].parts[0].tk && s.meshes[0].parts[0].tk !== s.meshes[1].parts[0].tk && s.tex[s.meshes[0].parts[0].tk].t, 'the parts of one target name the same loaded picture');
    near(s.figs.figs[1].min.concat(s.figs.figs[1].max), [0, 100, 0, 20, 140, 10], 'figure 1 box');
    near(s.SC.bounds.min.concat(s.SC.bounds.max), [0, 0, 0, 20, 340, 10], 'the bounds are those of the meshes');
    const c0 = s.L.panes[0];
    assert.ok(Math.abs(c0.yaw - 0.4) < 1e-9 && Math.abs(c0.pitch - 0.3) < 1e-9, 'a row across: seen from the front at an angle');
    assert.ok(inside(c0, s.SC.bounds, 400, 300) < 0.06, 'the whole row is in the picture and fills it');
    vs._ev.draw();
    // a click on a figure, on the mesh of no figure, on nothing
    const scr = p => { const x = T.project(T.camMat(vs._st().L.panes[0], 400 / 300).PV, p, 400, 300); return { clientX: x[0], clientY: x[1] }; };
    vs._ev.click(scr([15, 110, 0]), 0); vs._ev.click(scr([15, 310, 0]), 0); vs._ev.click({ clientX: 2, clientY: 2 }, 0); vs._ev.click(scr([15, 210, 0]), 0);
    assert.deepStrictEqual(figs, [1, 2], 'onFigure gets the number of the figure clicked, nothing for a mesh of no figure or the background ' + JSON.stringify(figs));
    assert.deepStrictEqual(vs._st().sel, { bone: null, volume: null }, 'a click selects nothing in a scene');
    // focusFigure, then fit all by a double click
    assert.strictEqual(vs.focusFigure(2), true); s = vs._st();
    near(s.L.panes[0].ctr, [10, 220, 5], 'the camera looks at figure 2'); assert.ok(inside(s.L.panes[0], s.figs.figs[2], 400, 300) < 0.06 && s.focus === 2, 'and fits it');
    assert.ok(s.L.panes[0].rad > 150, 'the rest of the row is not clipped away');
    assert.strictEqual(vs.focusFigure(9), false, 'no such figure');
    const cvs = canvasOf(vs), ev = o => Object.assign({ preventDefault() {}, clientX: 200, clientY: 150 }, o);
    vs.focusFigure(2); cvs.listeners.dblclick[0](ev({})); s = vs._st();
    near(s.L.panes[0].ctr, [10, 170, 5], 'double click: the whole scene again'); assert.ok(inside(s.L.panes[0], s.SC.bounds, 400, 300) < 0.06 && s.focus === null);
    assert.strictEqual(vs.focusFigure(null), true, 'focusFigure(null) fits all');
    // setScene: asked again with the new body, the pictures still named are kept, the angle the user chose stays
    s.L.panes[0].yaw = 1.2; const nTex = texCalls().length;
    assert.strictEqual(vs.setScene({ url: '/api/x/units/lineup', body: { side: 'rus' } }), true); assert.ok(vs._st().SC, 'the old picture stays until the new scene arrives');
    await tick(); s = vs._st();
    assert.deepStrictEqual(api4.filter(a => a[0] === '/api/x/units/lineup').pop()[1], { side: 'rus', mod: 'M' }, 'setScene asks the route with the new body');
    assert.ok(texCalls().length === nTex && Object.keys(s.tex).length === 2, 'the same targets: no picture is asked twice');
    assert.ok(Math.abs(s.L.panes[0].yaw - 1.2) < 1e-9 && inside(s.L.panes[0], s.SC.bounds, 400, 300) < 0.06, 'fitted again, the angle kept');
    assert.strictEqual(vs.setScene({}), false, 'a scene needs its route');
    // a scene without one target any more drops its picture; reload asks everything again
    answer = () => { const j = lineup(); j.scene.meshes.splice(1, 1); return j; };
    vs.setScene({ url: '/api/x/units/lineup', body: {} }); await tick(); s = vs._st();
    assert.ok(Object.keys(s.tex).length === 1 && s.mesh === 3 && !s.figs.figs[1], 'the picture no part names any more is freed');
    answer = lineup; const nSc = api4.filter(a => a[0] === '/api/x/units/lineup').length;
    vs.reload(); await tick(); await tick();
    assert.ok(api4.filter(a => a[0] === '/api/x/units/lineup').length === nSc + 1 && texCalls().length === nTex + 2, 'reload asks the scene and its pictures again');
    // a refusal is one plain sentence in place of the picture; a later scene brings the picture back
    answer = () => ({ ok: false, error: 'This buy has no units.' });
    const vf = EXT4.models.parts.viewer({ mod: 'M' }, { scene: { url: '/api/x/units/lineup', body: {} }, compact: true });
    await tick();
    const txt = w => { const o = []; (function walk(x) { if (!x) return; if (x.textContent) o.push(x.textContent); (x.childNodes || []).forEach(walk); })(w); return o.join(' | '); };
    assert.ok(/This buy has no units\./.test(txt(vf)) && canvasOf(vf).style.display === 'none', 'the route\'s sentence is shown, no target needed ' + txt(vf));
    answer = lineup; vf.setScene({ url: '/api/x/units/lineup', body: {} }); await tick();
    assert.ok(vf._st().SC && canvasOf(vf).style.display === 'block' && !/This buy has no units/.test(txt(vf)), 'the picture is back');
    // compact: canvas only, the tip on the picture, drag turns, wheel zooms, double click fits all
    const kids = vf.childNodes.filter(c => c && c.attrs), shown = kids.filter(c => !c.hidden);
    assert.ok(shown.length === 1 && shown[0].attrs.blk === 'view.canvas', 'compact: only the canvas leaf is shown ' + shown.map(c => c.attrs.blk));
    const cvf = canvasOf(vf); assert.strictEqual(cvf.attrs.title, L.en['models.viewer.sceneTip'], 'the tip says how to turn, zoom and fit all');
    assert.strictEqual(canvasOf(vs).attrs.title, undefined, 'no tip on the full view (it has its bar and help)');
    const cA = vf._st().L.panes[0], d0 = cA.dist, y0 = cA.yaw;
    cvf.listeners.wheel[0](ev({ deltaY: 400 })); assert.ok(cA.dist > d0 * 1.2, 'wheel zooms');
    T.orbit(cA, 80, 0); assert.ok(Math.abs(cA.yaw - y0) > 0.5, 'turned');
    cvf.listeners.dblclick[0](ev({})); assert.ok(inside(cA, vf._st().SC.bounds, 400, 300) < 0.06 && Math.abs(cA.yaw - (y0 - 0.8)) < 1e-9, 'double click fits all, the turn kept');
    // a scene that arrives before the canvas has a size is fitted again at the first draw with one; focusFigure waits for the scene
    size4 = false; const vz = EXT4.models.parts.viewer({ mod: 'M' }, { scene: { url: '/api/x/units/lineup', body: {} }, compact: true }); size4 = true;
    assert.strictEqual(vz.focusFigure(1), false, 'no scene yet: kept for later');
    await tick(); const cz = canvasOf(vz), dz = vz._st().L.panes[1].dist; cz.clientWidth = 800; cz.clientHeight = 200; vz._ev.draw();
    s = vz._st(); assert.ok(inside(s.L.panes[1], s.SC.bounds, 800, 200) < 0.06 && s.L.panes[1].dist !== dz, 'fitted to the real shape of the pane');
    near(s.L.panes[0].ctr, [10, 120, 5], 'the figure asked before the scene came is the one shown'); assert.ok(inside(s.L.panes[0], s.figs.figs[1], 800, 200) < 0.06);
    // many targets: only a few picture requests run at once, the rest follow as they answer
    texHold = true; const many = () => ({ scene: { format: 'scene/1', meshes: Array.from({ length: 11 }, (x, i) => Object.assign({}, m0, { world: at(i * 60), target: 't' + i, figure: i })) } });
    answer = many; const n0 = texCalls().length;
    const vq = EXT4.models.parts.viewer({ mod: 'M' }, { scene: { url: '/api/x/units/lineup', body: {} } }); await tick();
    assert.ok(texCalls().length - n0 === T.TEXQ && vq._st().texQ.wait === 11 - T.TEXQ, 'at most TEXQ picture requests at once ' + (texCalls().length - n0));
    // without opts.scene nothing changed: the document is followed, the own key of a picture is the mesh file and the name
    const vd = EXT4.models.parts.viewer({ set: { target: 'pz4h' }, mod: 'M' }, {}); await tick();
    assert.ok(docScenes === 1 && vd._st().meshes[0].parts[0].tk === m0.file + '\n' + tname && vd.focusFigure(0) === false, 'no scene option: as before');
    ok('scene option: route + body + mod, no document, per mesh target for pictures, one picture per (target, name), fit by bounds from the front, onFigure, focusFigure, setScene, reload, compact tip and double click to fit all');

    // ---------- a picture of one model: the game's preview camera, snapshot, setTarget, the pictures queue ----------
    const pc = srv._t.previewCams(Buffer.from('{Skeleton}\n{Extender "preview"\n\t{"Stuff_primary" {camera {origin 1 2 3}{lookat 0 0 0}{fov 45}{horizon 10}} {lights {"0" {type point}{position 1 1 1}}}}\n' +
      '\t{"Stuff"\n\t\t{camera\n\t\t\t{origin 3.9\t-6.08\t19.03} ; the eye\n\t\t\t{lookat 2.94 -0.42 -0.09}\n\t\t\t{fov 45}\n\t\t\t{horizon -172.307}\n\t\t}\n\t\t{lights {"0" {type point}}}\n\t}\n}\n'));
    assert.deepStrictEqual(Object.keys(pc), ['stuff_primary', 'stuff']);
    assert.deepStrictEqual(pc.stuff, { origin: [3.9, -6.08, 19.03], lookat: [2.94, -0.42, -0.09], fov: 45, horizon: -172.307 });
    assert.strictEqual(srv._t.previewCams(Buffer.from('{Skeleton}\n{Extender "other" {"x" {camera {origin 1 2 3}}}}')), null);
    assert.strictEqual((await route('', { mod, target: mdlFile }, ctx)).scene.preview, undefined, 'a model without the block: no preview in the scene');
    ok('server: the preview cameras of a .mdl ({Extender "preview"}: name, origin, lookat, fov, horizon; lights and comments skipped)');
    // the engine's frame: right = z x forward, turned about forward by the roll; straight down: right = x
    let fr = T.engineFrame([10, 0, 0], [0, 0, 0], 0); near(fr.f, [-1, 0, 0]); near(fr.r, [0, -1, 0]); near(fr.u, [0, 0, 1]);
    fr = T.engineFrame([10, 0, 0], [0, 0, 0], Math.PI / 2); near(fr.r, [0, 0, -1], 'roll of a quarter turn'); near(fr.u, [0, -1, 0]);
    fr = T.engineFrame([0, 0, 9], [0, 0, 0], 0); near(fr.r, [1, 0, 0], 'looking straight down'); near(fr.u, [0, -1, 0]);
    const bx = { min: [-2, -1, -1], max: [2, 1, 1] }, corners = b => [0, 1, 2, 3, 4, 5, 6, 7].map(k => [k & 1 ? b.max[0] : b.min[0], k & 2 ? b.max[1] : b.min[1], k & 4 ? b.max[2] : b.min[2]]);
    const fill = (cm, b, w, hh) => { let lo = Infinity, hi = 0; for (const p of corners(b)) { const s = T.project(cm.PV, p, w, hh); assert.ok(s, 'corner in front'); lo = Math.min(lo, s[0], s[1], w - s[0], hh - s[1]); hi = Math.max(hi, Math.abs(s[0] - w / 2) / (w / 2), Math.abs(s[1] - hh / 2) / (hh / 2)); } return { lo, hi }; };
    let cm = T.shotCam(null, bx, 2); let fl = fill(cm, bx, 200, 100);
    assert.ok(cm.how === 'fit' && fl.lo >= 0 && fl.hi > 0.85, 'no camera: fitted, every corner inside ' + JSON.stringify(fl));
    const camOk = { origin: [0, -1, 12], lookat: [0, 0, 0], fov: 45, horizon: 0 };
    cm = T.shotCam(camOk, bx, 2); near(cm.B.e, camOk.origin, 'a camera that frames the model is used as it is'); assert.strictEqual(cm.how, 'preview');
    // fov is across the width: a point at tan(fov / 2) to the right of the middle lands on the right edge
    const edge = T.project(cm.PV, [0, 0, 0].map((x, i) => cm.B.e[i] + cm.B.f[i] * 10 + cm.B.r[i] * 10 * Math.tan(Math.PI / 8)), 200, 100);
    assert.ok(Math.abs(edge[0] - 200) < 1e-6 && Math.abs(edge[1] - 50) < 1e-6, 'fov across the width ' + edge);
    for (const bad of [{ origin: [0, -10, 500], lookat: [0, 0, 0], fov: 45, horizon: 0 }, { origin: [0, -1, 12], lookat: [0, 0, 0], fov: 2.17, horizon: 30 }, { origin: [0, 0, 0.5], lookat: [0, 0, 0], fov: 45, horizon: 0 }]) {
      cm = T.shotCam(bad, bx, 1); fl = fill(cm, bx, 100, 100); const ef = T.engineFrame(bad.origin, bad.lookat, bad.horizon * Math.PI / 180);
      assert.ok(cm.how === 'preview-fit' && fl.lo >= 0 && fl.hi > 0.85, 'a camera that cuts the model off or leaves it tiny: fitted ' + JSON.stringify(fl)); near(cm.B.f, ef.f, 'its angle kept'); near(cm.B.r, ef.r);
    }
    ok('picture camera: the engine frame, the preview camera as it is when it frames the model (fov across the width), else its angle fitted, none: fitted');
    {
      const api5 = []; let scene5 = t => ({ ok: true, scene: Object.assign(JSON.parse(JSON.stringify(base)), { preview: t === 'far' ? { stuff: { origin: [0, -10, 9000], lookat: [0, 0, 0], fov: 45, horizon: 0 } } : undefined }) });
      const apiS = (u, b) => { api5.push([u, b]);
        if (u === '/api/x/models/viewer/scene') return Promise.resolve(scene5(b.target));
        if (u === '/api/x/models/viewer/texture') return Promise.resolve({ ok: true, width: 4, height: 4, format: 'DXT1', rgba: Buffer.alloc(64, 200).toString('base64') });
        return new Promise(() => {}); };
      const shots = [];
      const node5 = tag => { const o = node2(tag); if (tag === 'canvas') { o.clientWidth = 0; o.clientHeight = 0; o.toDataURL = () => { shots.push([o.width, o.height]); return 'data:image/png;base64,AAAA' + shots.length; }; } return o; };
      const h5 = (tag, attrs, kids) => { const e = node5(tag); for (const k of Object.keys(attrs || {})) { const v = attrs[k]; if (v == null) continue; if (k === 'text') e.textContent = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v); }
        for (const c of kids || []) if (c != null) e.appendChild(typeof c === 'string' ? { text: c } : c); return e; };
      const EXT5 = { models: { parts: {}, subs: {} } };
      new Function('EXT_SCREENS', 'h', 'tx', 'api', 'S', 'window', 'document', 'LS', script)(EXT5, h5, tx, apiS, { mod: '' }, win2, { createElement: node5, documentElement: {} }, LSs);
      // wait: on what the check after it reads (backstop 60 s, WAIT line), not a fixed time
      const wait = f => require('../../../../lib/test/wait').until(f, { who: 'models viewer test', what: String(f).slice(0, 100) }), scenes = () => api5.filter(a => a[0] === '/api/x/models/viewer/scene').map(a => a[1].target);
      const V5 = EXT5.models.parts.viewer, vp = V5({ set: { target: 'far' }, mod: 'M' }, { doc: false, compact: true });
      const got = []; const d0 = draws.n;
      vp.snapshot({ width: 76, height: 38 }, (url, info) => got.push([url, info.camera]));
      vp.snapshot({ width: 38, height: 38, camera: false }, (url, info) => got.push([url, info.camera]));
      assert.strictEqual(got.length, 0, 'not before the scene is there'); await wait(() => got.length >= 2);
      assert.deepStrictEqual(got, [['data:image/png;base64,AAAA1', 'preview-fit'], ['data:image/png;base64,AAAA2', 'fit']], 'both pictures, one after the other');
      assert.deepStrictEqual(shots, [[76, 38], [38, 38]], 'the canvas has the picture\'s size while it is taken');
      let s5 = vp._st(); assert.ok(draws.n > d0 && s5.show.grid === true && s5.show.meshes === true && s5.L.panes[0].mode === 'shaded', 'the view\'s own switches are back');
      assert.ok(api5.some(a => a[0] === '/api/x/models/viewer/texture'), 'the pictures of the meshes were asked before the snapshot');
      assert.strictEqual(vp.setTarget('near'), true); vp.snapshot({ width: 38, height: 38 }, (url, info) => got.push([url, info.camera])); await wait(() => got.length >= 3);
      assert.deepStrictEqual([scenes(), got[2]], [['far', 'near'], ['data:image/png;base64,AAAA3', 'fit']], 'setTarget loads another model into the same view');
      scene5 = () => ({ ok: false, error: 'No entity named "x".' }); vp.setTarget('x'); let none = 0; vp.snapshot({ width: 38, height: 38 }, url => { none = url === null ? 1 : 2; }); await wait(() => none !== 0);
      assert.strictEqual(none, 1, 'a model that cannot be read: null, at once');
      ok('snapshot: a PNG data URL of the asked size once the scene and its pictures are there, only meshes drawn, the view left as it was; setTarget; null when the model cannot be read');
      // the queue: one hidden view, one model at a time, each picture made once per data signature
      scene5 = t => ({ ok: true, scene: JSON.parse(JSON.stringify(base)) });
      let sigv = 'g1|m1'; const P = V5.pictures({ sig: () => sigv, mod: () => 'M2' }), out = [], n0 = scenes().length;
      P.get('a', 76, 38, u => out.push('a1 ' + u)); P.get('a', 76, 38, u => out.push('a2 ' + u)); P.get('b', 38, 38, u => out.push('b ' + u)); P.get('', 38, 38, u => out.push('none ' + u));
      assert.deepStrictEqual([out, P.peek('a', 76, 38)], [['none null'], undefined], 'nothing blocks: the pictures come later'); await wait(() => out.length >= 4 && P.stats().made >= 2);
      assert.deepStrictEqual([scenes().slice(n0), out.slice(1).map(x => x.split(' ')[0]), out[1].split(' ')[1] === out[2].split(' ')[1], P.stats().made], [['a', 'b'], ['a1', 'a2', 'b'], true, 2]);
      assert.ok(api5.filter(a => a[0] === '/api/x/models/viewer/scene').slice(n0).every(a => a[1].mod === 'M2'), 'the mod of the caller');
      let again = null; P.get('a', 76, 38, u => { again = u; }); assert.ok(again && again === P.peek('a', 76, 38) && scenes().length === n0 + 2, 'kept: answered at once, not rendered again');
      sigv = 'g1|m2'; P.get('a', 76, 38, () => {}); await wait(() => scenes().length >= n0 + 3 && P.stats().kept >= 3); assert.deepStrictEqual([scenes().length, P.stats().kept], [n0 + 3, 3], 'another mod: its own picture');
      ok('pictures: one hidden view renders the asked models one at a time, the same picture asked twice is made once, kept per data signature + model + size');
    }
  }

  console.log('PASS models viewer (' + n + ')');
})().catch(e => { console.error(e && e.stack || e); console.log('FAIL models viewer'); process.exit(1); });

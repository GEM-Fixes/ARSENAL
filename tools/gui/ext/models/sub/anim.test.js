// models anim part test: the four languages have the same keys (all models.anim.*), a name and a description for every operation,
// the client string (the animation editor) obeys the page rules and every text key it uses exists; its pure helpers; it runs with a
// stand-in DOM against a real edit document (tools/lib/model/edit/core.js): the list, picking an animation, the keys (Space, arrows,
// Home / End, K, Delete, Page Down, ignored inside a text field), the pose form, set key through the form, playback, v.setPose;
// the batch routes of anim.server.js:
// every operation builds exactly the expected argv through a stub runTool (--json, --dry); refusals (outside the mod, missing file,
// negative or fractional frame, unknown operation, a name starting with "-"); undo puts the .bak back and refuses without one;
// info reads boneList or bones as an array. Synthetic files only; no game, no soedit.js.
// usage: node anim.test.js <scratch dir>
// Author: Imperator_Aug (ARSENAL, ia-f13fcedc)
const fs = require('fs'), path = require('path'), assert = require('assert');
const scratch = path.resolve(process.argv[2] || path.join(require('os').tmpdir(), 'models-anim-test'));
require('../../../../lib/testscratch').guard(scratch);   // never wipe a shared root, the repo, a game or a mod
fs.rmSync(scratch, { recursive: true, force: true }); fs.mkdirSync(scratch, { recursive: true });
const S = require('./anim.server'), script = require('./anim.client'), L = require('./anim.lang.json');
const OPS = S._t.OPS;
const game = path.join(scratch, 'game'), mod = path.join(scratch, 'mymod'), dir = path.join(mod, 'resource', 'entity', 'tank', 't34');
fs.mkdirSync(path.join(game, 'mods'), { recursive: true }); fs.mkdirSync(dir, { recursive: true });
const REL = 'resource/entity/tank/t34/fire.anm', ANM = path.join(mod, REL);
fs.writeFileSync(ANM, 'EANM new');
fs.writeFileSync(path.join(dir, 'turret.json'), '{}');
fs.writeFileSync(path.join(scratch, 'outside.anm'), 'x');

let calls = [], reply = () => ({ code: 0, stdout: JSON.stringify({ ok: true, frames: 10, bones: 3, version: 0x60000, changed: ['frame 0'] }), stderr: '' });
const ctx = { tmpRoot: path.join(scratch, 'tmp'), game: () => game, runTool: async (tool, entry, args, o) => { calls.push({ tool, entry, args, o }); return reply(args); } };
const last = () => calls[calls.length - 1];
const call = (verb, body) => S.routes['POST /api/x/models/anim/' + verb]('/api/x/models/anim/' + verb, body, ctx);
const refuses = async (verb, body, re) => { const before = calls.length; try { await call(verb, body); } catch (e) { assert.strictEqual(e.status, 400, verb + ': ' + e.message); assert.ok(re.test(e.message), verb + ': ' + e.message); assert.strictEqual(calls.length, before, 'tool not called'); return; } assert.fail(verb + ' was not refused: ' + JSON.stringify(body)); };
let n = 0; const ok = m => { n++; console.log('ok ' + n + ' ' + m); };

(async () => {
  // ---------- languages ----------
  const en = Object.keys(L.en).sort();
  assert.deepStrictEqual(Object.keys(L).sort(), ['en', 'ru', 'uk', 'zh']);
  for (const l of ['ru', 'uk', 'zh']) { assert.deepStrictEqual(Object.keys(L[l]).sort(), en, 'same keys in ' + l); }
  for (const l of Object.keys(L)) for (const k of en) {
    assert.ok(k.startsWith('models.anim.'), k); assert.ok(L[l][k] && L[l][k].trim(), l + ' ' + k);
    assert.deepStrictEqual((L[l][k].match(/\{\w+\}/g) || []).sort(), (L.en[k].match(/\{\w+\}/g) || []).sort(), 'slots ' + l + ' ' + k);
    assert.ok(!/ [–—-] /.test(L[l][k]), 'no dash as punctuation ' + l + ' ' + k);
  }
  for (const op of Object.keys(OPS)) for (const l of Object.keys(L)) { assert.ok(L[l]['models.anim.op.' + op], l + ' name ' + op); assert.ok(L[l]['models.anim.desc.' + op], l + ' desc ' + op); }
  for (const g of ['frames', 'bones', 'whole']) assert.ok(L.en['models.anim.grp.' + g]);
  const base = require('../lang.json').en;
  for (const k of en) assert.ok(!(k in base), 'no clash with ../lang.json ' + k);
  ok('4 languages, same keys and slots, a name and a description for each of ' + Object.keys(OPS).length + ' operations');

  // ---------- client string ----------
  assert.strictEqual(typeof script, 'string');
  assert.ok(!/[`]|\$\{|innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(/.test(script), 'page rules');
  assert.ok(/^\s*\(function\(\)\{/.test(script) && /\}\)\(\);\s*$/.test(script), 'one function, no new global names');
  for (const m of script.matchAll(/\btx\('([a-zA-Z0-9_.]+)'/g)) assert.ok(L.en[m[1]], 'tx key ' + m[1]);
  for (const m of script.matchAll(/\btx\(\w+\?'([a-zA-Z0-9_.]+)':'([a-zA-Z0-9_.]+)'/g)) { assert.ok(L.en[m[1]], m[1]); assert.ok(L.en[m[2]], m[2]); }
  for (const m of script.matchAll(/'(models\.anim\.ed\.[a-zA-Z0-9_.]+)'/g)) assert.ok(L.en[m[1]], 'text key ' + m[1]);
  for (const k of en.filter(k => k.startsWith('models.anim.ed.'))) assert.ok(script.includes("'" + k + "'"), 'key used ' + k);
  assert.ok(!/#[0-9a-fA-F]{3,6}\b|rgba?\(/.test(script), 'no colour literals');
  ok('client: page rules, one function, every text key exists and is used, no colour literals');

  // ---------- client: pure helpers ----------
  const EXT = { models: { subs: {}, parts: {} } }, store = {};
  const LSx = { get: (k, d) => k in store ? store[k] : d, set: (k, v) => { store[k] = v; } };
  let win = { confirm: () => true }, timers = [];
  const txf = (k, p) => k + (p ? JSON.stringify(p) : '');
  new Function('EXT_SCREENS', 'LS', 'tx', 'api', 'S', 'h', 'window', 'document', 'setTimeout', 'clearTimeout', script)(EXT, LSx, txf, () => Promise.resolve({}), { cur: 'models' }, () => ({}), win, {},
    (fn) => { timers.push(fn); return timers.length; }, () => {});
  assert.strictEqual(typeof EXT.models.subs.anim, 'function');
  const H = EXT.models.subs.anim._t;
  assert.ok(H.num('1,5') === 1.5 && isNaN(H.num('x')) && H.nums(['1', 'a']) === null);
  assert.strictEqual(H.clampF(12, 10), 9); assert.strictEqual(H.clampF(-3, 10), 0); assert.strictEqual(H.clampF(4.7, 10), 4);
  assert.strictEqual(H.advance(9, 10, 1, true), 0); assert.strictEqual(H.advance(9, 10, 1, false), null); assert.strictEqual(H.advance(0, 10, -1, true), 9); assert.strictEqual(H.advance(3, 10, 2, false), 5);
  assert.strictEqual(H.nextKey([0, 4, 9], 4, 1), 9); assert.strictEqual(H.nextKey([0, 4, 9], 4, -1), 0); assert.strictEqual(H.nextKey([0, 4], 4, 1), null);
  assert.strictEqual(H.speedOf('1.26'), 1.3); assert.strictEqual(H.speedOf('0.5'), 0.5); assert.strictEqual(H.speedOf('99'), 10); assert.strictEqual(H.speedOf('x'), 1);
  const LIST = [{ rel: 'a/x.anm' }, { rel: 'a/y.anm' }, { rel: 'a/z.anm' }];
  assert.strictEqual(H.sibling(LIST, 'a/Y.anm', 1), 'a/z.anm'); assert.strictEqual(H.sibling(LIST, 'a/z.anm', 1), 'a/x.anm'); assert.strictEqual(H.sibling(LIST, null, -1), 'a/z.anm');
  assert.ok(H.typing({ tagName: 'INPUT' }) && H.typing({ tagName: 'div', isContentEditable: true }) && !H.typing({ tagName: 'DIV' }));
  ok('client helpers: numbers, frame clamp, advance with and without loop, next key, speed in steps of 0.1, previous / next file, text-field test');

  // ---------- client against a real edit document ----------
  const toolsDir = path.resolve(__dirname, '..', '..', '..', '..');
  const coreFile = path.join(toolsDir, 'lib', 'model', 'edit', 'core.js');
  if (fs.existsSync(coreFile)) {
    const C = require(coreFile), An = require(path.join(toolsDir, 'lib', 'model', 'anm')), ops0 = require(path.join(toolsDir, 'soedit', 'ops', 'animops'));
    const emod = path.join(scratch, 'editmod'), EDIR = 'resource/entity/test/car/', MDL = EDIR + 'car.mdl', OPEN = EDIR + 'open.anm';
    const mdlText = ['{Skeleton', '\t{bone "body"', '\t\t{Position 0 0 10}', '\t\t{bone "door_l"', '\t\t\t{Position 0 20 0}', '\t\t}', '\t\t{bone "door_r"', '\t\t\t{Position 0 -20 0}', '\t\t}', '\t}',
      '\t{animation', '\t\t{sequence "open" {file "open.anm"} {speed 2}}', '\t}', '}', ''].join('\r\n');
    const I = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    let o = ops0.newAnimation(['body', 'door_l', 'door_r'], 10, [I.concat([0, 0, 10]), I.concat([0, 20, 0]), I.concat([0, -20, 0])], 0x60000);
    o = An.setMatrix(o, 4, 'door_l', Float32Array.from([0, 1, 0, -1, 0, 0, 0, 0, 1, 40, 20, 0]));
    fs.mkdirSync(path.join(emod, EDIR), { recursive: true });
    fs.writeFileSync(path.join(emod, MDL), mdlText); fs.writeFileSync(path.join(emod, OPEN), An.write(o));
    fs.writeFileSync(path.join(emod, EDIR, 'close.anm'), An.write(ops0.newAnimation(['body'], 3, [I.concat([0, 0, 10])], 0x60000)));
    // walk.anm sits in the model's folder but the model does not use it: Page Up / Page Down reaches it (ANM-30)
    fs.writeFileSync(path.join(emod, EDIR, 'walk.anm'), An.write(ops0.newAnimation(['body'], 2, [I.concat([0, 0, 10])], 0x60000)));
    const doc = C.open({ mod: emod, mdl: MDL, game: null });
    doc.apply('anm.attach', { rel: EDIR + 'close.anm' });
    // stand-in page document D (doc.client.js shape) over the real core
    const opsRun = [], fns = [];
    const D = { id: doc.id, sel: { bone: null, volume: null, anm: null, frame: 0 },
      on(fn) { fns.push(fn); return () => {}; }, emit(ev) { fns.slice().forEach(f => f(ev)); },
      select(x) { const s = {}; for (const k of ['bone', 'volume', 'anm', 'frame']) s[k] = k in x ? x[k] : D.sel[k]; D.sel = s; D.emit({ type: 'select', sel: s }); },
      op(n, a) { opsRun.push([n, a]); return new Promise((res, rej) => { try { const r = doc.apply(n, a); D.emit({ type: 'change' }); res(r); } catch (e) { rej(e); } }); },
      state(n, q) { return new Promise((res, rej) => { try { res(doc.state(n, q || {})); } catch (e) { rej(e); } }); },
      dir(q) { return Promise.resolve(doc.state('doc.dir', q || {})); },
      undo() { doc.undo(); D.emit({ type: 'change' }); }, redo() { doc.redo(); D.emit({ type: 'change' }); } };
    // stand-in DOM
    const all = [];
    function E(tag, a, kids) {
      const e = { tagName: tag.toUpperCase(), attrs: {}, children: [], parentNode: null, listeners: {}, style: {}, textContent: '', value: '', checked: false, className: '', isConnected: true,
        get firstChild() { return this.children[0] || null; },
        appendChild(c) { if (c) { c.parentNode = this; this.children.push(c); } return c; }, removeChild(c) { this.children.splice(this.children.indexOf(c), 1); c.parentNode = null; return c; },
        addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); }, removeEventListener() {},
        fire(t, ev) { (this.listeners[t] || []).forEach(f => f(Object.assign({ target: this, preventDefault() { this.prevented = true; } }, ev || {}))); },
        focus() {}, scrollIntoView() {}, contains(x) { return x === this || this.children.some(c => c.contains && c.contains(x)); } };
      for (const [k, v] of Object.entries(a || {})) { if (v == null) continue; if (k === 'text') e.textContent = String(v); else if (k === 'class') e.className = v; else if (k === 'value') e.value = String(v); else if (k === 'checked') e.checked = !!v;
        else if (/^on/.test(k) && typeof v === 'function') e.addEventListener(k.slice(2), v); else e.attrs[k] = v; }
      (kids || []).forEach(c => e.appendChild(c)); all.push(e); return e;
    }
    const find = pred => all.filter(pred);
    const byText = t => all.find(e => e.tagName === 'BUTTON' && e.textContent === t);
    const tick = () => new Promise(r => setImmediate(r));
    const settle = async () => { for (let i = 0; i < 8; i++) await tick(); };
    // a viewer part with setPose; no timeline part here (timeline.test.js covers it)
    const posed = [];
    EXT.models.parts.viewer = () => { const v = E('div'); v.setPose = (rel, f) => posed.push([rel, f]); return v; };
    const body = E('div'); let redraws = 0;
    EXT.models.subs.anim({ body, el: E, doc: D, mod: emod, redraw() { redraws++; } });
    await settle();
    const box = body.children[0];
    assert.ok(byText('open.anm') && byText('close.anm'), 'both animations listed');
    assert.ok(find(e => /models\.anim\.ed\.usedBy/.test(e.textContent) && /open/.test(e.textContent)).length, 'the sequence that uses open.anm is named');
    byText('open.anm').fire('click'); await settle();
    assert.strictEqual(D.sel.anm, OPEN);
    assert.deepStrictEqual(posed[posed.length - 1], [OPEN, 0], 'v.setPose at frame 0');
    const sel = find(e => e.tagName === 'SELECT' && e.attrs['aria-label'] === 'models.anim.ed.bone')[0];
    assert.deepStrictEqual(sel.children.map(c => c.value), ['body', 'door_l', 'door_r'], 'bones of the model in the pose form');
    // keys on the editor box
    const key = (k, extra) => box.fire('keydown', Object.assign({ key: k }, extra || {}));
    key('ArrowRight'); await settle(); assert.strictEqual(D.sel.frame, 1);
    key('End'); await settle(); assert.strictEqual(D.sel.frame, 9);
    key('Home'); await settle(); assert.strictEqual(D.sel.frame, 0);
    key('ArrowLeft'); await settle(); assert.strictEqual(D.sel.frame, 9, 'loop is on: back from 0 goes to the last frame');
    key('Home'); sel.value = 'door_l'; sel.fire('change'); await settle();
    key('ArrowDown'); await settle(); assert.strictEqual(D.sel.frame, 4, 'next key of door_l');
    const pos = find(e => e.tagName === 'INPUT' && /^models\.anim\.ed\.pos [XYZ]$/.test(e.attrs['aria-label'] || ''));
    const rot = find(e => e.tagName === 'INPUT' && /^models\.anim\.ed\.rot [XYZ]$/.test(e.attrs['aria-label'] || ''));
    assert.deepStrictEqual(pos.map(x => Number(x.value)), [40, 20, 0], 'pose form: position at the key');
    assert.deepStrictEqual(rot.map(x => Number(x.value)), [0, 0, 90], 'pose form: rotation in degrees');
    // a key typed into a text field does nothing
    const before = D.sel.frame; box.fire('keydown', { key: 'ArrowRight', target: pos[0] }); await settle(); assert.strictEqual(D.sel.frame, before);
    // K: set key from the form at frame 6
    D.select({ frame: 6 }); await settle();
    pos[0].value = '5'; pos[1].value = '20'; pos[2].value = '0'; rot[0].value = '0'; rot[1].value = '0'; rot[2].value = '45';
    key('k'); await settle();
    let last2 = opsRun[opsRun.length - 1];
    assert.strictEqual(last2[0], 'anm.key.set'); assert.deepStrictEqual(last2[1], { rel: OPEN, bone: 'door_l', frame: 6, space: 'local', pos: [5, 20, 0], rot: [0, 0, 45] });
    assert.deepStrictEqual(doc.state('anm.get', { rel: OPEN }).bones[1].keys, [0, 4, 6], 'key at 6 in the document');
    await settle();
    assert.deepStrictEqual(pos.map(x => Number(x.value)), [5, 20, 0], 'the form shows the new key');
    key('Delete'); await settle();
    assert.strictEqual(opsRun[opsRun.length - 1][0], 'anm.key.delete');
    assert.deepStrictEqual(doc.state('anm.get', { rel: OPEN }).bones[1].keys, [0, 4]);
    // I inserts a frame after this one, Shift+Delete takes it out again, ] moves this frame one later
    key('i'); await settle(); assert.deepStrictEqual(opsRun[opsRun.length - 1], ['anm.frames.insert', { rel: OPEN, at: 7, count: 1 }]); assert.strictEqual(doc.state('anm.get', { rel: OPEN }).frames, 11);
    D.select({ frame: 7 }); await settle(); key('Delete', { shiftKey: true }); await settle();
    assert.deepStrictEqual(opsRun[opsRun.length - 1], ['anm.frames.delete', { rel: OPEN, from: 7, to: 7 }]); assert.strictEqual(doc.state('anm.get', { rel: OPEN }).frames, 10);
    D.select({ frame: 4 }); await settle(); key(']'); await settle();
    assert.deepStrictEqual(opsRun[opsRun.length - 1], ['anm.frames.move', { rel: OPEN, from: 4, to: 4, at: 5 }]); assert.strictEqual(D.sel.frame, 5);
    D.undo(); await settle(); assert.deepStrictEqual(doc.state('anm.get', { rel: OPEN }).bones[1].keys, [0, 4]);
    D.select({ frame: 6 }); await settle();
    // copy pose, mirror pose through buttons
    byText('models.anim.ed.mirror').fire('click'); await settle();
    assert.strictEqual(opsRun[opsRun.length - 1][0], 'anm.pose.mirror');
    // playback: Space starts, the timer moves the frame, Space stops
    D.select({ frame: 0 }); await settle();
    key(' '); assert.ok(timers.length > 0, 'play set a timer');
    const t0 = Date.now; Date.now = () => t0() + 50; timers.shift()(); Date.now = t0;
    // 50 frames a second times the sequence speed 2: 0.05 s is 5 frames
    assert.strictEqual(D.sel.frame, 5, 'playing moved the frame at the engine pace');
    key(' '); const fz = D.sel.frame; timers.splice(0).forEach(f => f()); assert.strictEqual(D.sel.frame, fz, 'paused');
    // Page Down: next animation
    key('PageDown'); await settle(); assert.strictEqual(D.sel.anm, EDIR + 'walk.anm', 'next animation of the folder, by name');
    assert.deepStrictEqual(opsRun[opsRun.length - 1], ['anm.attach', { rel: EDIR + 'walk.anm' }], 'a folder file the model does not hold is read in first');
    key('PageDown'); await settle(); assert.strictEqual(D.sel.anm, EDIR + 'close.anm', 'round to the first');
    key('PageUp'); await settle(); assert.strictEqual(D.sel.anm, EDIR + 'walk.anm', 'back');
    assert.strictEqual(opsRun.filter(o => o[0] === 'anm.attach').length, 1, 'read in once');
    assert.ok(EXT.models.keys.some(r => r.key === 'models.anim.key.file' && r.area === 'anim') && box.attrs['data-keys'] === 'anim', 'key rows and key area');
    // undo through the document puts things back; the list redraws on change
    D.undo(); await settle();
    assert.strictEqual(redraws, 0, 'open document: no full redraw needed');
    C.close(doc.id);
    ok('client against a real document: list, pick, arrows / Home / End / loop, next key, pose form in degrees, K sets a key, Delete, mirror, play / pause, Page Down, v.setPose');
  }

  // ---------- argv for every operation ----------
  const V = { bone: 'turret', from: 2, to: 5, at: 7, count: 3, name: 'turret2', track: 'resource/entity/tank/t34/turret.json', visible: '0' };
  const FL = { bone: '--bone', from: '--from', to: '--to', at: '--at', count: '--count', name: '--name', track: '--track', visible: '--visible' };
  assert.deepStrictEqual(Object.keys(OPS).sort(), ['add-bone', 'clone-bone', 'copy-forward', 'delete-frames', 'drop-first-frame', 'duplicate', 'export-bone', 'fill', 'import-bone',
    'info', 'insert-frame', 'move', 'remove-bone', 'rename-bone', 'reset-bone', 'reverse', 'set-visibility'], 'the names ops/anim.js knows (new left out)');
  const real = require('../../../../soedit/ops/anim.js');
  for (const op of Object.keys(OPS)) assert.ok(real.OPS[op], 'ops/anim.js has ' + op);
  for (const op of Object.keys(OPS)) for (const dry of [false, true]) {
    const r = await call('run', Object.assign({ mod, anm: REL, operation: op, dry }, V));
    const want = ['ops', 'anim', op, ANM];
    for (const k of S._t.FIELDS) if (OPS[op].need.includes(k) || OPS[op].opt.includes(k)) want.push(FL[k], k === 'track' ? path.join(mod, V.track) : String(V[k]));
    want.push('--json'); if (dry) want.push('--dry');
    assert.deepStrictEqual(last().args, want, op + (dry ? ' dry' : ''));
    assert.strictEqual(last().entry, 'soedit/soedit.js'); assert.strictEqual(last().tool, 'soedit');
    assert.ok(r.ok && r.frames === 10 && r.bones === 3 && r.version === 0x60000 && r.changed.length === 1 && r.dry === dry && typeof r.raw === 'string', op);
  }
  // optional field left out; export without a track file gets one beside the animation
  await call('run', { mod, anm: REL, operation: 'insert-frame', at: '4' });
  assert.deepStrictEqual(last().args, ['ops', 'anim', 'insert-frame', ANM, '--at', '4', '--json']);
  await call('run', { mod, anm: REL, operation: 'reverse', from: 1, to: 3 });
  assert.deepStrictEqual(last().args, ['ops', 'anim', 'reverse', ANM, '--from', '1', '--to', '3', '--json']);
  await call('run', { mod, anm: REL, operation: 'set-visibility', bone: 'gun', from: 0, to: 1, visible: 'show' });
  assert.deepStrictEqual(last().args, ['ops', 'anim', 'set-visibility', ANM, '--bone', 'gun', '--from', '0', '--to', '1', '--visible', '1', '--json']);
  await call('run', { mod, anm: ANM, operation: 'export-bone', bone: 'gun' });
  assert.deepStrictEqual(last().args, ['ops', 'anim', 'export-bone', ANM, '--bone', 'gun', '--track', path.join(dir, 'fire.gun.json'), '--json']);
  // the tool refuses (exit 1): ok false with its reason, not a thrown error; usage error (exit 2) is thrown
  reply = () => ({ code: 1, stdout: JSON.stringify({ ok: false, error: 'frame 40 is past the end (10 frames)' }), stderr: '' });
  let r = await call('run', { mod, anm: REL, operation: 'delete-frames', from: 1, to: 2 });
  assert.ok(!r.ok && /past the end/.test(r.error));
  reply = () => ({ code: 2, stdout: '', stderr: 'usage: soedit ops anim ...' });
  await assert.rejects(call('run', { mod, anm: REL, operation: 'reverse' }), e => e.status === 400 && /usage/.test(e.message));
  ok('argv: every operation, with and without --dry, always --json, fields in one order; refusal and usage error');

  // ---------- refusals before the tool ----------
  await refuses('run', { mod, anm: path.join(scratch, 'outside.anm'), operation: 'reverse' }, /inside your mod/);
  await refuses('run', { mod, anm: '../outside.anm', operation: 'reverse' }, /inside your mod/);
  await refuses('run', { mod, anm: 'resource/none.anm', operation: 'reverse' }, /not in your mod/);
  await refuses('run', { mod, anm: 'resource/entity/tank/t34/turret.json', operation: 'reverse' }, /\.anm file/);
  await refuses('run', { mod, anm: REL, operation: 'delete-frames', from: -1, to: 2 }, /whole number/);
  await refuses('run', { mod, anm: REL, operation: 'delete-frames', from: 1.5, to: 2 }, /whole number/);
  await refuses('run', { mod, anm: REL, operation: 'insert-frame', at: '2.5' }, /whole number/);
  await refuses('run', { mod, anm: REL, operation: 'delete-frames', from: 4, to: 2 }, /after/);
  await refuses('run', { mod, anm: REL, operation: 'explode' }, /not one this page knows/);
  await refuses('run', { mod, anm: REL, operation: '__proto__' }, /not one this page knows/);
  await refuses('run', { mod, anm: REL, operation: 'rename-bone', bone: 'turret', name: '--out' }, /start with "-"/);
  await refuses('run', { mod, anm: REL, operation: 'reset-bone', bone: '-x' }, /start with "-"/);
  await refuses('run', { mod, anm: REL, operation: 'add-bone', name: 'a\nb' }, /control/);
  await refuses('run', { mod, anm: REL, operation: 'reset-bone' }, /Fill in/);
  await refuses('run', { mod, anm: REL, operation: 'set-visibility', bone: 'gun', from: 0, to: 1, visible: 'maybe' }, /Show or Hide/);
  await refuses('run', { mod, anm: REL, operation: 'reverse', from: 3, to: 1 }, /after/);
  await refuses('run', { mod, anm: REL, operation: 'import-bone', bone: 'gun', track: '../x.json' }, /inside your mod/);
  await refuses('run', { mod, anm: REL, operation: 'import-bone', bone: 'gun', track: 'nope.json' }, /not found/);
  await refuses('run', { anm: REL, operation: 'reverse' }, /mod folder/);
  await refuses('run', { mod: game, anm: REL, operation: 'reverse' }, /game install/);
  ok('refusals: outside the mod, missing file, not .anm, negative / fractional / reversed frames, unknown operation, "-" names, control chars, no mod, the game as mod');

  // ---------- info ----------
  // the real shape (ops/anim.js): bones = names, per-bone data under info
  reply = () => ({ code: 0, stdout: JSON.stringify({ ok: true, frames: 12, bones: ['body', 'gun'], version: 393216, info: { keyed: [{ bone: 'body', keys: 12 }, { bone: 'gun', keys: 3 }], visibility: [{ bone: 'gun', frame: 1, visible: false }, { bone: 'gun', frame: 3, visible: true }], problems: ['p'] } }, null, 1), stderr: '' });
  r = await call('info', { mod, anm: REL });
  assert.deepStrictEqual(last().args, ['ops', 'anim', 'info', ANM, '--json']);
  assert.ok(r.frames === 12 && r.bones === 2 && r.version === 0x60000 && r.hasBak === false && r.problems.length === 1);
  assert.deepStrictEqual(r.boneList, [{ name: 'body', keys: 12, visibilityChanges: 0 }, { name: 'gun', keys: 3, visibilityChanges: 2 }]);
  reply = () => ({ code: 0, stdout: 'reading\n' + JSON.stringify({ ok: true, frames: 12, version: '0x60000', boneList: [{ name: 'body', keys: 12, visibilityChanges: 0 }, { name: 'gun', keyCount: 3, visibility: [1, 2] }] }), stderr: '' });
  r = await call('info', { mod, anm: REL });
  assert.ok(r.bones === 2 && r.version === 0x60000);
  assert.deepStrictEqual(r.boneList, [{ name: 'body', keys: 12, visibilityChanges: 0 }, { name: 'gun', keys: 3, visibilityChanges: 2 }]);
  reply = () => ({ code: 0, stdout: JSON.stringify({ frameCount: 5, version: 0x40000, bones: [{ bone: 'a', keys: [0, 4] }, 'b'] }), stderr: '' });
  r = await call('info', { mod, anm: REL });
  assert.ok(r.frames === 5 && r.bones === 2 && r.version === 0x40000 && r.boneList[0].name === 'a' && r.boneList[0].keys === 2 && r.boneList[1].name === 'b');
  reply = () => ({ code: 1, stdout: '', stderr: "Error: Cannot find module 'X/tools/soedit/soedit.js'" });
  await assert.rejects(call('info', { mod, anm: REL }), e => e.status === 400 && /not part of this copy/.test(e.message));
  ok('info: boneList or bones as an array, version as hex text or number, helper missing');

  // ---------- undo ----------
  await refuses('undo', { mod, anm: REL }, /no earlier copy/);
  fs.writeFileSync(ANM + '.bak', 'EANM old');
  reply = () => ({ code: 0, stdout: JSON.stringify({ frames: 1, boneList: [] }), stderr: '' });
  r = await call('info', { mod, anm: REL }); assert.strictEqual(r.hasBak, true);
  r = await call('undo', { mod, anm: REL });
  assert.ok(r.ok && fs.readFileSync(ANM, 'utf8') === 'EANM old' && !fs.existsSync(ANM + '.bak'));
  await refuses('undo', { mod, anm: REL }, /no earlier copy/);
  await refuses('undo', { mod, anm: path.join(scratch, 'outside.anm') }, /inside your mod/);
  ok('undo: puts the .bak back, then refuses with none left; outside the mod refused');

  // ---------- one real run: tools/soedit/soedit.js spawned, no stub ----------
  const tools = path.resolve(__dirname, '..', '..', '..', '..');
  const spawn = (entry, args) => { const p = require('child_process').spawnSync(process.execPath, [path.join(tools, entry)].concat(args), { encoding: 'utf8', timeout: 60000 });
    return { code: p.status, stdout: p.stdout || '', stderr: p.stderr || '' }; };
  const realCtx = { tmpRoot: ctx.tmpRoot, game: () => game, runTool: async (tool, entry, args) => spawn(entry, args) };
  const rcall = (verb, body) => S.routes['POST /api/x/models/anim/' + verb]('/api/x/models/anim/' + verb, body, realCtx);
  const REL2 = 'resource/entity/tank/t34/real.anm', ANM2 = path.join(mod, REL2);
  const made2 = spawn('soedit/soedit.js', ['ops', 'anim', 'new', ANM2, '--bones', 'body,gun', '--count', '4', '--json']);
  assert.strictEqual(made2.code, 0, made2.stdout + made2.stderr);
  r = await rcall('info', { mod, anm: REL2 });
  assert.ok(r.frames === 4 && r.bones === 2 && r.version === 0x60000 && !r.hasBak, JSON.stringify(r));
  assert.deepStrictEqual(r.boneList.map(b => b.name), ['body', 'gun']);
  r = await rcall('run', { mod, anm: REL2, operation: 'insert-frame', at: 1, dry: true });
  assert.ok(r.ok && r.dry && r.frames === 5 && !fs.existsSync(ANM2 + '.bak'), JSON.stringify(r));
  assert.strictEqual((await rcall('info', { mod, anm: REL2 })).frames, 4, 'dry wrote nothing');
  r = await rcall('run', { mod, anm: REL2, operation: 'insert-frame', at: 1 });
  assert.ok(r.ok && r.frames === 5 && r.hasBak && fs.existsSync(ANM2 + '.bak'), JSON.stringify(r));
  assert.strictEqual((await rcall('info', { mod, anm: REL2 })).frames, 5);
  r = await rcall('undo', { mod, anm: REL2 });
  assert.ok(r.ok && !fs.existsSync(ANM2 + '.bak'));
  r = await rcall('info', { mod, anm: REL2 });
  assert.ok(r.frames === 4 && !r.hasBak);
  r = await rcall('run', { mod, anm: REL2, operation: 'set-visibility', bone: 'gun', from: 1, to: 2, visible: '0' });
  assert.ok(r.ok, JSON.stringify(r));
  r = await rcall('info', { mod, anm: REL2 });
  assert.ok(r.boneList.find(b => b.name === 'gun').visibilityChanges > 0 && r.boneList.find(b => b.name === 'body').visibilityChanges === 0, JSON.stringify(r.boneList));
  r = await rcall('run', { mod, anm: REL2, operation: 'delete-frames', from: 40 });
  assert.ok(!r.ok && r.code === 1 && /^The animation helper refused this change: [^\n]*out of range[^\n]*\.$/.test(r.message), r.message);
  ok('real run: new, info, dry and real insert-frame (+1 frame, .bak), undo (frames back, .bak gone), hide a bone, a refusal as one sentence');

  console.log('PASS models anim (' + n + ')');
})().catch(e => { console.error(e); process.exit(1); });

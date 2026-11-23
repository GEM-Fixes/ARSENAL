// model/edit/anm: the animation and timeline domain of the built-in model editor (contract: tools/lib/model/edit/README.md).
// Ops `anm.*` change .anm files of the document (and the .mdl for sequences); ops `tl.*` change the {sequence ..} blocks of the
// .mdl; states `anm.*`, `tl.*` are JSON views for the page (tools/gui/ext/models/sub/anim.client.js, timeline.client.js).
// Bytes in, bytes out: .anm through tools/lib/model/anm.js write, .mdl through mdl.js edit() and sdlwrite splices. A file an
// op does not change is not returned (stays byte-identical). An op that cannot run throws a plain-words Error, changes nothing.
// Batch algorithms are reused from tools/soedit/ops/animops.js (reverse, fill, insert/delete/duplicate/move frames, bone track
// ops, visibility); the key-frame edits (set/delete key, paste, interpolate with ease, bake, mirror, shift, offset, time scale)
// are here. Parity rows: tools/soedit/parity.md ANM and TL, record tools/soedit/parity-done/ANM.json, TL.json.
//
// Engine facts used [V]: a sequence plays at 50 frames per second times {speed} (line 96, 254)
//   {duration frames N} sets speed = (last frame + 1) / N, {smooth} is clamped to 0..1, an unknown key in {sequence} stops the
//   loader (`events`, `additive` are Gates of Hell keys: limits PORT-184). A sequence without {file} plays "<name>.anm".
//   The .anm format holds no frame rate; speed lives on the sequence.
// Names: an .anm bone maps to the model bone of the same name (case-insensitive, first in tree order, as FindBone).
// Matrices: number[12], rows X Y Z then translation, row vectors; world = local followed by the parent's world (mdl.js).
// Euler degrees [x, y, z]: R = Rx * Ry * Rz in row-vector form (rotate about X first, then Y, then Z); toEuler inverts it.
//
// Ops (args; `rel` = the .anm's path in the document as doc.files lists it; frames from 0; bone = .anm bone name or index):
//   anm.new {rel, frames=1, bones:'model'|[names], version=0x60000, sequence?}   anm.attach {rel, data?(base64), sequence?}
//   anm.rename {rel, to}   anm.delete {rel, sequences?:true}   anm.duplicate {rel, to, sequence?}
//   anm.key.set {rel, bone, frame, matrix | pos?, rot?(deg), space:'local'|'world', only?, forward?}   anm.key.delete {rel, bone, frame}
//   anm.key.move {rel, bone, from, to}   anm.key.forward {rel, bone, at, count?}   anm.paste {rel, at, clip, bones?, grow?}   anm.vis.set {rel, bone, from, to?, visible}
//   anm.frames.insert {rel, at, count=1}   anm.frames.delete {rel, from, to?}   anm.frames.duplicate {rel, from, to}
//   anm.frames.move {rel, from, to, at}   anm.frames.length {rel, frames}   anm.dropFirst {rel}
//   anm.reverse {rel, from?, to?}   anm.loop {rel, mode:'end'|'append'}   anm.interpolate {rel, from, to, bone?, ease}
//   anm.bake {rel, from?, to?}   anm.pose.mirror {rel, frame, to?}   anm.track.shift {rel, by, bone?, from?, to?}
//   anm.track.offset {rel, bone, pos?, rot?, from?, to?}   anm.time.scale {rel, frames}
//   anm.bone.add {rel, bone, matrix?}  .remove {rel, bone}  .rename {rel, bone, name}  .clone {rel, bone, name?}
//   anm.bone.export {rel, bone, to}  .import {rel, from | data, bones?}  .reset {rel, bone, frame? | from,to, value:'rest'|'identity'|'first'}
//   tl.seq.add {name, file?, bone?, fields?}   tl.seq.set {sequence, bone?, fields}   tl.seq.delete {sequence, bone?}
// States: anm.list, anm.get {rel}, anm.pose {rel, frame}, anm.clip {rel, from, to, bones?}, tl.get {rel?}
// _t: euler, fromEuler, toEuler, mirrorPairs, setDense (for tests)
// Author: Imperator_Aug (ARSENAL, ia-df39818a)
'use strict';
const path = require('path');
const A = require('../anm');
const M = require('../mdl');
const sw = require('../../sdlwrite');
const ops0 = require('../../../soedit/ops/animops');

const FPS = 50;
const VERSIONS = ops0.VERSIONS;
const SEQ_FLAGS = new Set(['autostart', 'store', 'resume', 'movement']);
const SEQ_OK = new Set(['file', 'speed', 'smooth', 'resume', 'store', 'autostart', 'movement', 'pinback', 'rotate', 'duration', 'dynamicspeed', 'name']);
const SEQ_GOH = new Set(['events', 'additive']);
const isFrame = c => !!c && (c.tag === 'FRM2' || c.tag === 'FRMN');
const fail = m => { throw new Error(m); };
const fresh = o => A.parse(A.write(o));
const lc = s => String(s == null ? '' : s).toLowerCase();
const IDM = () => [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];

// ---------- document access ----------
function fileOf(doc, rel, kind) {
  if (rel === undefined || rel === null || rel === '') fail('Pick an animation first.');
  const want = lc(rel).replace(/\\/g, '/');
  for (const [k, f] of doc.files) if (lc(k) === want && (!kind || f.kind === kind)) return f;
  return fail(`There is no animation "${rel}" in this model.`);
}
function hasFile(doc, rel) { const w = lc(rel).replace(/\\/g, '/'); for (const k of doc.files.keys()) if (lc(k) === w) return k; return null; }
function readAnm(doc, rel, forEdit = true) {
  const f = fileOf(doc, rel);
  const o = A.parse(f.bytes);   // own copy: ops never touch the document's cached parse
  if (forEdit && o.error) fail(`This animation has data the editor cannot read (${o.error}). It is kept exactly as it is and cannot be changed here.`);
  if (forEdit && !(o.frames >= 1)) fail('This animation has no frames.');
  return { f, o };
}
const res = r => { if (ops0.isError(r)) fail(r.error.charAt(0).toUpperCase() + r.error.slice(1) + '.'); return r; };
function result(doc, f, o, info, extra) {
  const files = Object.assign({}, extra || {});
  const b = A.write(o);
  if (!b.equals(f.bytes)) files[f.rel] = b;
  return { files, info: Object.assign({ rel: f.rel, frames: o.frames, bones: o.bones.length }, info || {}) };
}
function mdlFile(doc) { if (!doc.mdl) return null; const k = hasFile(doc, doc.mdl); return k ? doc.files.get(k) : null; }
function mdlOf(doc) { const f = mdlFile(doc); return f ? M.parse(f.bytes) : null; }
const dirOf = rel => { const s = String(rel).replace(/\\/g, '/'); return s.slice(0, s.lastIndexOf('/') + 1); };
// a sequence's file (as written) -> document rel, relative to the .mdl folder ('/x' = resource/x, '//x' = game root)
function seqRel(doc, s) {
  const name = String(s.file || s.fileDefault || '').replace(/\\/g, '/');
  if (!name) return null;
  if (name.startsWith('//')) return name.slice(2);
  if (name.startsWith('/')) return 'resource' + name;
  return path.posix.normalize(dirOf(doc.mdl || '') + name);
}
function fileText(doc, rel) {   // how a .mdl names the file `rel`
  const d = dirOf(doc.mdl || ''), r = String(rel).replace(/\\/g, '/');
  if (lc(r).startsWith(lc(d))) return r.slice(d.length);
  if (/^resource\//i.test(r)) return r.slice(8);
  return path.posix.relative(d || '.', r);
}

// ---------- maths ----------
const D2R = Math.PI / 180;
function mul3(a, b) { const o = new Array(9); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j]; return o; }
function fromEuler(e) {
  const [x, y, z] = e.map(v => (+v || 0) * D2R), cx = Math.cos(x), sx = Math.sin(x), cy = Math.cos(y), sy = Math.sin(y), cz = Math.cos(z), sz = Math.sin(z);
  const Rx = [1, 0, 0, 0, cx, sx, 0, -sx, cx], Ry = [cy, 0, -sy, 0, 1, 0, sy, 0, cy], Rz = [cz, sz, 0, -sz, cz, 0, 0, 0, 1];
  return mul3(mul3(Rx, Ry), Rz);
}
function toEuler(m) {
  const sy = Math.max(-1, Math.min(1, -m[2])), y = Math.asin(sy);
  let x, z;
  if (Math.abs(Math.cos(y)) > 1e-6) { x = Math.atan2(m[5], m[8]); z = Math.atan2(m[1], m[0]); } else { z = 0; x = Math.atan2(-m[7], m[4]); }
  return [x / D2R, y / D2R, z / D2R].map(v => (Math.abs(v) < 1e-9 ? 0 : v));
}
const det3 = m => m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]);
const S = [1, 0, 0, 0, -1, 0, 0, 0, 1];   // left-right reflection: +Y is left
function mirrorM(m) { const r = mul3(mul3(S, Array.from(m).slice(0, 9)), S); return r.concat([m[9], -m[10], m[11]]); }
const EASE = { linear: t => t, in: t => t * t, out: t => 1 - (1 - t) * (1 - t), inout: t => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t)) };

// left/right partner of a bone name (l/r, left/right as a word part: door_l, L_Hand, hand.left, LeftArm)
function partner(name, all) {
  const n = String(name), set = new Map(all.map(x => [lc(x), x]));
  const tries = [];
  const swap = (re, f) => { if (re.test(n)) tries.push(n.replace(re, f)); };
  const lr = { l: 'r', r: 'l', L: 'R', R: 'L', left: 'right', right: 'left', Left: 'Right', Right: 'Left', LEFT: 'RIGHT', RIGHT: 'LEFT' };
  swap(/([_.\- ])(l|r|L|R|left|right|Left|Right|LEFT|RIGHT)$/, (m, a, b) => a + lr[b]);
  swap(/^(l|r|L|R|left|right|Left|Right|LEFT|RIGHT)([_.\- ])/, (m, b, a) => lr[b] + a);
  swap(/([_.\- ])(l|r|L|R|left|right|Left|Right)([_.\- ])/, (m, a, b, c) => a + lr[b] + c);
  swap(/^(Left|Right)(?=[A-Z0-9])/, (m, b) => lr[b]);
  swap(/([a-z0-9])(Left|Right)(?=[A-Z0-9]|$)/, (m, a, b) => a + lr[b]);
  for (const t of tries) if (t !== n && set.has(lc(t))) return set.get(lc(t));
  return null;
}
function mirrorPairs(names) { const m = {}; for (const n of names) { const p = partner(n, names); if (p) m[n] = p; } return m; }

// ---------- dense edits (the technique of animops applyDense: key every animated bone on the changed frames and the frame either
// side with its target value, so frames outside the change keep their pose) ----------
function newRec(kind, bone) { return kind === 'FRM2' ? { bone, flags: 0, pos: null, rot: null, mesh: null, matrix: null, visible: null } : { bone, items: [], matrix: null, visible: null, mesh: null }; }
function chunkAt(o, f) { let c = null; for (const x of o.chunks) if (isFrame(x) && x.index === f) c = x; return c; }
function recFor(c, b, create) { let r = null; for (const x of c.recs) if (x.bone === b) r = x; if (!r && create) { r = newRec(c.tag, b); c.recs.push(r); } return r; }
function kindFor(o, f) { let best = null; for (const c of o.chunks) if (isFrame(c) && (!best || Math.abs(c.index - f) < Math.abs(best.index - f))) best = c; return best ? best.tag : o.version >= 0x60000 ? 'FRM2' : 'FRMN'; }
function insertChunk(o, f) {
  const c = { tag: kindFor(o, f), offset: null, size: null, index: f, recs: [] };
  let at = o.chunks.length;
  for (let i = 0; i < o.chunks.length; i++) if (isFrame(o.chunks[i]) && o.chunks[i].index > f) { at = i; break; }
  if (at === o.chunks.length) while (at > 0 && o.chunks[at - 1].raw) at--;
  o.chunks.splice(at, 0, c);
  return c;
}
const tracksOf = o => o.bones.map((_, b) => A.boneTrack(o, b));
function ensureChunks(o, frames) {
  const want = [...new Set(frames)].filter(f => f >= 0 && f < o.frames && !chunkAt(o, f)).sort((a, b) => a - b);
  if (!want.length) return o;
  for (const f of want) {
    const tr = tracksOf(o), b = tr.findIndex(t => t[f]);
    if (b >= 0) o = A.setMatrix(o, f, b, tr[b][f]);
    else { o = fresh(o); insertChunk(o, f); o = fresh(o); }
  }
  return o;
}
const sameM = (x, y) => (!x && !y) || (!!x && !!y && Array.from(x).every((v, i) => Math.fround(v) === Math.fround(y[i])));
// newTr[bone][frame] = matrix | null (null: leave). D = frames whose value changes. force: key them even when equal (bake)
function setDense(o, newTr, D, force) {
  const oldTr = tracksOf(o);
  let differs = !!force;
  for (const f of D) for (let b = 0; b < o.bones.length && !differs; b++) if (newTr[b] && newTr[b][f] && !sameM(oldTr[b][f], newTr[b][f])) differs = true;
  if (!differs) return o;
  const K = new Set();
  for (const f of D) for (const g of force ? [f] : [f - 1, f, f + 1]) if (g >= 0 && g < o.frames) K.add(g);
  // a bone animated for the first time must be keyed in the first frame chunk too (the loader gives a bone first keyed later no transform)
  const firstNew = [];
  for (let b = 0; b < o.bones.length; b++) if (newTr[b] && oldTr[b].every(m => !m) && newTr[b].some(m => m)) firstNew.push(b);
  let first = o.chunks.find(isFrame);
  if (!first) { o = fresh(o); insertChunk(o, 0); o = fresh(o); first = o.chunks.find(isFrame); }
  if (firstNew.length) K.add(first.index);
  o = fresh(ensureChunks(o, [...K]));
  const tgt = b => newTr[b] || oldTr[b];
  for (const f of K) for (let b = 0; b < o.bones.length; b++) {
    const t = tgt(b); if (!t) continue;
    let m = t[f];
    if (!m && firstNew.includes(b)) m = t.find(x => x);   // before its first value the engine holds the first key
    if (m) recFor(chunkAt(o, f), b, true).matrix = Float32Array.from(m);
  }
  return fresh(o);
}
function visState(o) {
  const ev = Array.from({ length: o.frames }, () => new Map());
  for (const c of o.chunks) if (isFrame(c) && c.index >= 0 && c.index < o.frames) for (const r of c.recs) if (r.visible !== null && r.visible !== undefined && r.bone >= 0 && r.bone < o.bones.length) ev[c.index].set(r.bone, r.visible);
  return o.bones.map((_, b) => { let cur = null; const a = []; for (let f = 0; f < o.frames; f++) { if (ev[f].has(b)) cur = ev[f].get(b); a.push(cur); } return a; });
}
// make bone b's visibility (false = hidden, other = shown) equal want[0..frames-1], through animops setVisibility runs
function setVis(o, b, want) {
  for (let pass = 0; pass < 2; pass++) {
    const cur = visState(o)[b];
    let f = 0, changed = false;
    while (f < o.frames) {
      const w = want[f] === false;
      if ((cur[f] === false) === w) { f++; continue; }
      let g = f; while (g + 1 < o.frames && (want[g + 1] === false) === w && (cur[g + 1] === false) !== w) g++;
      o = res(ops0.setVisibility(o, { bone: b, from: f, to: g, visible: !w })); changed = true; f = g + 1;
    }
    if (!changed) break;
  }
  return o;
}

// ---------- argument checks ----------
function int(v, name, lo, hi) {
  const n = typeof v === 'string' && /^\s*-?\d+\s*$/.test(v) ? Number(v) : v;
  if (!Number.isInteger(n)) fail(`The ${name} must be a whole number (got ${v === undefined ? 'nothing' : v}).`);
  if (n < lo || n > hi) fail(`The ${name} ${n} is outside ${lo} to ${hi}.`);
  return n;
}
const frameArg = (o, v, name = 'frame') => int(v, name, 0, o.frames - 1);
function rangeArg(o, a, whole) {
  const has = v => v !== undefined && v !== null && v !== '';
  const from = has(a.from) ? frameArg(o, a.from, 'first frame') : whole ? 0 : fail('Give the first frame.');
  const to = has(a.to) ? frameArg(o, a.to, 'last frame') : whole ? o.frames - 1 : from;
  if (to < from) fail(`The last frame ${to} is before the first frame ${from}.`);
  return [from, to];
}
function boneArg(o, bone) {
  if (bone === undefined || bone === null || bone === '') fail('Pick a bone first.');
  if (typeof bone === 'number') { if (Number.isInteger(bone) && bone >= 0 && bone < o.bones.length) return bone; fail(`There is no bone number ${bone} in this animation.`); }
  const i = o.bones.findIndex(n => lc(n) === lc(bone));
  if (i >= 0) return i;
  return fail(`There is no bone "${bone}" in this animation.`);
}
function matArg(m, name = 'matrix') {
  const a = typeof m === 'string' ? m.split(/[\s,;]+/).filter(Boolean).map(Number) : Array.from(m || []);
  if (a.length !== 12 || !a.every(Number.isFinite)) fail(`The ${name} needs 12 numbers (X row, Y row, Z row, position).`);
  return a;
}
function vec3(v, name) { const a = Array.from(v || []).map(Number); if (a.length !== 3 || !a.every(Number.isFinite)) fail(`The ${name} needs 3 numbers.`); return a; }
function anmRelArg(doc, rel) {
  const r = String(rel || '').replace(/\\/g, '/').trim();
  if (!r) fail('Give the animation a file name.');
  if (!/\.anm$/i.test(r)) fail('The file name must end in .anm.');
  if (/(^|\/)\.\.(\/|$)/.test(r) || /^[a-z]:/i.test(r) || r.startsWith('/')) fail('The file must stay inside the model\'s folders.');
  if (/[\x00-\x1f"]/.test(r)) fail('The file name has characters a .mdl cannot hold.');
  return r.includes('/') ? r : dirOf(doc.mdl || '') + r;
}

// ---------- model facts ----------
function modelBones(doc) {
  const m = mdlOf(doc);
  if (!m || !m.bones) return [];
  return m.bones.map(b => ({ name: b.name, path: b.path, parent: b.parent, matrix: b.matrix.slice() }));
}
function restOf(doc, name) { const b = modelBones(doc).find(x => lc(x.name) === lc(name)); return b ? b.matrix : null; }

// ---------- sequences (.mdl text) ----------
function seqList(doc) {
  const m = mdlOf(doc);
  if (!m) return [];
  return m.sequences.map(s => ({ s, rel: seqRel(doc, s) }));
}
function seqUsing(doc, rel) { return seqList(doc).filter(x => x.rel && lc(x.rel) === lc(rel)); }
function seqFind(doc, name, bone) {
  const hits = seqList(doc).filter(x => lc(x.s.name) === lc(name) && (bone === undefined || (bone === null ? x.s.bone === null : x.s.bone !== null && (lc(x.s.bone) === lc(bone) || lc(x.s.bone.split('/').pop()) === lc(bone)))));
  if (!hits.length) fail(`There is no sequence "${name}" in this model.`);
  return hits[0];
}
const gohDoc = doc => !!(doc && doc.exe) && require('../../games').exeOf(doc.exe) === 'goh';
function fieldsArg(fields, goh) {
  const out = {};
  for (const [k0, v] of Object.entries(fields || {})) {
    const k = lc(k0);
    // Gates of Hell (GHFMT-18): additive is a plain flag; events holds a frame list, kept as written and edited in the .mdl text
    if (SEQ_GOH.has(k)) {
      if (!goh) fail(`"${k0}" is a Gates of Hell sequence key; this game stops loading the model on it.`);
      if (k === 'additive') { out[k] = v ? true : null; continue; }
      fail('The events of a sequence are a list of frames and names; change them in the .mdl text (they are kept as written).');
    }
    if (!SEQ_OK.has(k)) fail(`"${k0}" is not a sequence key this game reads (file, speed, smooth, resume, store, autostart, movement, pinback, rotate, duration, dynamicspeed).`);
    if (SEQ_FLAGS.has(k)) { out[k] = v ? true : null; continue; }
    if (v === null || v === false || v === '') { out[k] = null; continue; }
    if (k === 'speed') { const n = Number(v); if (!Number.isFinite(n) || n === 0) fail('The speed must be a number other than 0.'); out[k] = n; }
    else if (k === 'smooth') { const n = Number(v); if (!(n >= 0 && n <= 1)) fail('Smooth must be between 0 and 1 (the game clamps it there).'); out[k] = n; }
    else if (k === 'pinback') { const n = v === true ? true : Number(v); if (n !== true && !Number.isInteger(n)) fail('Pinback is a whole number or on.'); out[k] = n; }
    else if (k === 'file') { if (!/\.anm$/i.test(String(v))) fail('The sequence file must be a .anm.'); out[k] = String(v); }
    else if (k === 'name') { if (!String(v).trim()) fail('A sequence needs a name.'); out[k] = String(v); }
    else if (k === 'duration') {
      const a = Array.isArray(v) ? v : String(v).split(/\s+/);
      if (a.length !== 2 || !['frames', 'percent'].includes(lc(a[0])) || !(Number(a[1]) !== 0 && Number.isFinite(Number(a[1])))) fail('Duration is "frames N" or "percent N", N not 0.');
      out[k] = { raw: lc(a[0]) + ' ' + M.fmtNum(Number(a[1])) };
    } else if (k === 'rotate') {
      const a = Array.isArray(v) ? v : String(v).split(/\s+/);
      if (a.length !== 5 || !a.slice(1).every(x => Number.isFinite(Number(x)))) fail('Rotate is a bone name, an axis (3 numbers) and an angle in degrees.');
      out[k] = { raw: '"' + String(a[0]).replace(/"/g, '') + '" ' + a.slice(1).map(x => M.fmtNum(Number(x))).join(' ') };
    } else if (k === 'dynamicspeed') {
      if (!Array.isArray(v) || !v.every(r => Array.isArray(r) && r.length === 3 && r.every(x => Number.isFinite(Number(x))))) fail('Dynamic speed is a list of [from, to, speed].');
      out[k] = { raw: v.map(r => '{' + r.map(x => M.fmtNum(Number(x))).join(' ') + '}').join(' ') };
    }
  }
  return out;
}
function seqText(name, fields) {
  const parts = ['{sequence "' + String(name).replace(/"/g, '') + '"'];
  for (const [k, v] of Object.entries(fields)) {
    if (k === 'name' || v === null) continue;
    if (v === true) parts.push('{' + k + '}');
    else if (typeof v === 'number') parts.push('{' + k + ' ' + M.fmtNum(v) + '}');
    else if (v && v.raw !== undefined) parts.push('{' + k + ' ' + v.raw + '}');
    else parts.push('{' + k + ' "' + String(v).replace(/"/g, '') + '"}');
  }
  return parts.join(' ') + '}';
}
// add {sequence ..} to the skeleton's {animation} block (or bone's); returns new .mdl bytes
function mdlAddSeq(doc, name, fields, bone) {
  const f = mdlFile(doc); if (!f) fail('This document has no .mdl to hold a sequence.');
  const m = M.parse(f.bytes);
  if (!m.tree) fail('The .mdl cannot be read: ' + m.error);
  if (!m.skeleton) fail('The .mdl has no {Skeleton} block.');
  const nm = String(name || '').trim();
  if (!nm) fail('A sequence needs a name.');
  if (/["\x00-\x1f]/.test(nm)) fail('The sequence name has characters a .mdl cannot hold.');
  let owner;
  if (bone === undefined || bone === null || bone === '') owner = m.skeleton.node;
  else { const b = M.findBone(m, bone); if (!b) fail(`There is no bone "${bone}" in the model.`); owner = b.node; }
  const ownerPath = owner === m.skeleton.node ? null : M.findBone(m, bone).path;
  if (m.sequences.some(s => lc(s.name) === lc(nm) && s.bone === ownerPath)) fail(`There is already a sequence "${nm}" there.`);
  const isBlk = x => x && (x.type === 'block' || x.type === 'list');
  const kwOf = x => (x.items[0] && x.items[0].type === 'atom' ? x.items[0].text.toLowerCase() : '');
  const anim = owner.items.filter(x => isBlk(x) && kwOf(x) === 'animation').pop();
  const txt = seqText(nm, fields);
  if (anim) sw.insertChild(anim, anim.items.length, txt);
  else sw.insertChild(owner, owner.items.length, '{animation ' + txt + '}');
  return sw.serialize(m.tree);
}
function mdlDelSeqs(bytes, list) {   // list: [{name, bone}] -> bytes
  const m = M.parse(bytes);
  const nodes = [];
  for (const x of list) { const s = m.sequences.find(q => lc(q.name) === lc(x.name) && q.bone === x.bone); if (s) nodes.push(s.node); }
  for (const n of nodes) sw.removeNode(n);
  return nodes.length ? sw.serialize(m.tree) : bytes;
}
function mdlSetSeqFile(bytes, list, fileTxt) {   // point sequences at a new file name
  if (!list.length) return bytes;
  const m = M.parse(bytes);
  return M.edit(m, list.map(x => ({ op: 'setSequence', sequence: x.name, bone: x.bone === null ? null : x.bone, fields: { file: fileTxt } })));
}

// ---------- clip (copy / paste) ----------
function clipOf(o, from, to, bones) {
  const tr = tracksOf(o), vis = visState(o);
  const pick = bones && bones.length ? bones.map(b => boneArg(o, b)) : o.bones.map((_, i) => i);
  return { kind: 'anm-clip/1', frames: to - from + 1, bones: pick.map(b => ({ name: o.bones[b], m: tr[b].slice(from, to + 1).map(x => (x ? Array.from(x) : null)), vis: vis[b].slice(from, to + 1) })) };
}

// ---------- ops ----------
const ops = {};
const op = (name, apply) => { ops[name] = { apply }; };

op('anm.new', (doc, a) => {
  const rel = anmRelArg(doc, a.rel);
  if (hasFile(doc, rel)) fail(`The model already has a file "${rel}".`);
  const frames = int(a.frames === undefined ? 1 : a.frames, 'frame count', 1, 65535);
  const version = a.version === undefined ? 0x60000 : Number(a.version);
  if (!VERSIONS.includes(version)) fail('The file version must be one of ' + VERSIONS.map(v => '0x' + v.toString(16)).join(', ') + '.');
  const mb = modelBones(doc);
  let names = a.bones === undefined || a.bones === 'model' ? mb.map(b => b.name) : Array.isArray(a.bones) ? a.bones.map(String) : fail('Bones are "model" or a list of names.');
  const seen = new Set(); names = names.filter(n => { const k = lc(n); if (seen.has(k)) return false; seen.add(k); return true; });
  if (names.length > 255) fail('The game allows at most 255 bones in one animation.');
  let o;
  if (names.length) o = res(ops0.newAnimation(names, frames, names.map(n => restOf(doc, n) || IDM()), version));
  else {
    const kind = version >= 0x60000 ? 'FRM2' : 'FRMN';
    o = fresh({ version, frames, bones: [], chunks: [{ tag: 'EANM' }, { tag: 'FRMS' }, { tag: 'BMAP' }, { tag: kind, offset: null, size: null, index: 0, recs: [] }], frame: [], problems: [], error: null });
  }
  const files = { [rel]: A.write(o) };
  if (a.sequence) { const mf = mdlFile(doc); files[mf.rel] = mdlAddSeq(doc, a.sequence === true ? path.posix.basename(rel, '.anm') : a.sequence, { file: fileText(doc, rel) }); }
  return { files, info: { rel, frames, bones: names.length } };
});

op('anm.attach', (doc, a) => {
  const rel = anmRelArg(doc, a.rel), have = hasFile(doc, rel), files = {};
  let bytes = null;
  if (a.data !== undefined && a.data !== null) {
    bytes = Buffer.isBuffer(a.data) ? a.data : Buffer.from(String(a.data), 'base64');
    if (bytes.length < 4 || bytes.toString('latin1', 0, 4) !== 'EANM') fail('That file is not an animation (.anm starts with EANM).');
    if (have && !doc.files.get(have).bytes.equals(bytes)) fail(`The model already has "${rel}" open with other content.`);
    if (!have) files[rel] = bytes;
  } else if (!have) {
    bytes = typeof doc.fetch === 'function' ? doc.fetch(rel) : null;   // the core reads the mod over the game
    if (!bytes) fail(`There is no file "${rel}" in the mod folder or the game.`);
    if (bytes.length < 4 || bytes.toString('latin1', 0, 4) !== 'EANM') fail('That file is not an animation (.anm starts with EANM).');
    files[rel] = bytes;
  }
  if (a.sequence) {
    const mf = mdlFile(doc);
    files[mf.rel] = mdlAddSeq(doc, a.sequence === true ? path.posix.basename(rel, '.anm') : a.sequence, { file: fileText(doc, rel) });
  }
  const o = A.parse(bytes || doc.files.get(have).bytes);
  return { files, info: { rel: have || rel, frames: o.frames, bones: o.bones.length, readable: !o.error, problems: o.problems.slice(0, 20) } };
});

op('anm.rename', (doc, a) => {
  const f = fileOf(doc, a.rel), to = anmRelArg(doc, a.to);
  if (lc(to) === lc(f.rel)) return { files: {}, info: { rel: f.rel } };
  if (hasFile(doc, to)) fail(`The model already has a file "${to}".`);
  const files = { [f.rel]: null, [to]: Buffer.from(f.bytes) };
  const users = seqUsing(doc, f.rel).map(x => ({ name: x.s.name, bone: x.s.bone }));
  if (users.length) { const mf = mdlFile(doc); files[mf.rel] = mdlSetSeqFile(mf.bytes, users, fileText(doc, to)); }
  return { files, info: { rel: to, from: f.rel, sequences: users.map(u => u.name) } };
});

op('anm.delete', (doc, a) => {
  const f = fileOf(doc, a.rel), files = { [f.rel]: null };
  const users = seqUsing(doc, f.rel).map(x => ({ name: x.s.name, bone: x.s.bone }));
  if (users.length && a.sequences) { const mf = mdlFile(doc); files[mf.rel] = mdlDelSeqs(mf.bytes, users); }
  return { files, info: { rel: f.rel, sequences: users.map(u => u.name), sequencesKept: !a.sequences && users.length > 0 } };
});

op('anm.duplicate', (doc, a) => {
  const f = fileOf(doc, a.rel), to = anmRelArg(doc, a.to);
  if (hasFile(doc, to)) fail(`The model already has a file "${to}".`);
  const files = { [to]: Buffer.from(f.bytes) };
  if (a.sequence) { const mf = mdlFile(doc); files[mf.rel] = mdlAddSeq(doc, a.sequence === true ? path.posix.basename(to, '.anm') : a.sequence, { file: fileText(doc, to) }); }
  return { files, info: { rel: to, from: f.rel } };
});

// local matrix of anm bone b at frame f; world of the model bone (anm values over rest)
function poseOf(doc, o, f) {
  const mb = modelBones(doc), tr = o ? tracksOf(o) : [], loc = new Map();
  for (const b of mb) loc.set(b.path, b.matrix);
  const anmIx = new Map();
  if (o) o.bones.forEach((n, i) => { if (!anmIx.has(lc(n))) anmIx.set(lc(n), i); });
  const used = new Set();
  for (const b of mb) { const i = anmIx.get(lc(b.name)); if (i !== undefined && !used.has(i) && tr[i][f]) { loc.set(b.path, Array.from(tr[i][f])); used.add(i); } }
  const world = new Map();
  for (const b of mb) world.set(b.path, b.parent === null ? loc.get(b.path).slice() : M.mul(loc.get(b.path), world.get(b.parent)));
  return { mb, loc, world, anmIx, tr };
}

op('anm.key.set', (doc, a) => {
  let { f, o } = readAnm(doc, a.rel);
  const frame = frameArg(o, a.frame);
  let b = o.bones.findIndex(n => lc(n) === lc(a.bone));
  if (b < 0 && typeof a.bone === 'number') b = boneArg(o, a.bone);
  let added = false;
  if (b < 0) {
    const rest = restOf(doc, a.bone);
    if (!rest) fail(`There is no bone "${a.bone}" in this animation or in the model.`);
    o = res(ops0.addBone(o, { name: modelBones(doc).find(x => lc(x.name) === lc(a.bone)).name, matrix: rest }));
    b = o.bones.length - 1; added = true;
  }
  const cur = A.matrixAt(o, b, frame) || restOf(doc, o.bones[b]) || IDM();
  const space = a.space || 'local';
  if (space !== 'local' && space !== 'world') fail('Space is local or world.');
  let m;
  const P = poseOf(doc, o, frame), mbone = P.mb.find(x => lc(x.name) === lc(o.bones[b]));
  const parentW = mbone && mbone.parent !== null ? P.world.get(mbone.parent) : null;
  const curW = space === 'world' ? (parentW ? M.mul(Array.from(cur), parentW) : Array.from(cur)) : Array.from(cur);
  if (a.matrix !== undefined && a.matrix !== null) m = matArg(a.matrix);
  else {
    if (a.pos === undefined && a.rot === undefined) fail('Give a position, a rotation or a full matrix.');
    const R = a.rot !== undefined && a.rot !== null ? fromEuler(vec3(a.rot, 'rotation')) : curW.slice(0, 9);
    const T = a.pos !== undefined && a.pos !== null ? vec3(a.pos, 'position') : curW.slice(9, 12);
    m = R.concat(T);
  }
  if (space === 'world' && parentW) { const inv = M.invert(parentW); if (!inv) fail('The parent bone\'s matrix cannot be inverted at this frame.'); m = M.mul(m, inv); }
  if (Math.abs(det3(m)) < 1e-6) fail('That rotation has no size (its axes are flat); the game cannot use it.');
  if (a.only) {   // this frame only (SOEdit: every frame stored)
    const tr = tracksOf(o).map(() => null), t = A.boneTrack(o, b).map(x => (x ? Array.from(x) : null));
    if (t.every(x => !x)) for (let g = 0; g < o.frames; g++) t[g] = Array.from(cur);
    t[frame] = m; tr[b] = t;
    o = setDense(o, tr, new Set([frame]));
  } else {
    const wasEmpty = A.boneTrack(o, b).every(x => !x);
    o = A.setMatrix(o, frame, b, Float32Array.from(m));
    if (wasEmpty) { const c0 = o.chunks.find(isFrame); if (c0.index !== frame) o = A.setMatrix(o, c0.index, b, Float32Array.from(m)); }
    o = fresh(o);
  }
  if (a.forward) o = res(ops0.copyForward(o, { bone: b, at: frame, count: a.forward === true ? undefined : int(a.forward, 'count', 1, o.frames - 1 - frame) }));
  return result(doc, f, o, { bone: o.bones[b], frame, added });
});

op('anm.key.delete', (doc, a) => {
  const { f, o } = readAnm(doc, a.rel);
  const frame = frameArg(o, a.frame), b = boneArg(o, a.bone);
  const d = delKey(o, b, frame);
  return result(doc, f, d.o, d.heldFrom === undefined ? { bone: o.bones[b], frame } : { bone: o.bones[b], frame, heldFrom: d.heldFrom });
});
op('anm.key.move', (doc, a) => {   // drag a key on the timeline: the bone's key at `from` moves to `to` (one undo step)
  const { f, o } = readAnm(doc, a.rel);
  const from = frameArg(o, a.from, 'frame'), to = frameArg(o, a.to, 'target frame'), b = boneArg(o, a.bone);
  if (from === to) return result(doc, f, o, {});
  const m = A.matrixAt(o, b, from);
  let r;
  try { r = delKey(o, b, from).o; } catch (e) { if (!/only key/.test(e.message)) throw e; r = o; }
  r = fresh(A.setMatrix(r, to, b, m));
  return result(doc, f, r, { bone: o.bones[b], from, to });
});
function delKey(o, b, frame) {
  const c = chunkAt(o, frame);
  const keyed = c && c.recs.some(r => r.bone === b && r.matrix);
  if (!keyed) fail(`Bone ${o.bones[b]} has no key at frame ${frame}.`);
  const fc = o.chunks.filter(isFrame), isFirst = fc[0] === c || fc.filter(x => x.index === fc[0].index).includes(c);
  let r = fresh(o);
  const strip = (cc, bone) => { cc.recs = cc.recs.filter(x => { if (x.bone !== bone || !x.matrix) return true; if ((x.visible === null || x.visible === undefined) && !x.mesh) return false; x.matrix = null; return true; }); };
  if (isFirst) {
    const later = fc.filter(x => x.index > frame && x.recs.some(q => q.bone === b && q.matrix));
    if (!later.length) fail(`That is the only key of bone ${o.bones[b]}. Remove the bone from the animation instead.`);
    const nm = later[0].recs.filter(q => q.bone === b && q.matrix).pop().matrix;
    for (const cc of r.chunks) if (isFrame(cc) && cc.index === frame) strip(cc, b);
    recFor(r.chunks.find(isFrame), b, true).matrix = Float32Array.from(nm);
    return { o: fresh(r), heldFrom: later[0].index };
  }
  for (const cc of r.chunks) if (isFrame(cc) && cc.index === frame) strip(cc, b);
  r = fresh(r);
  // an emptied chunk goes when that leaves every other bone where it was
  const empty = r.chunks.filter(cc => isFrame(cc) && cc.index === frame && !cc.recs.length);
  if (empty.length) {
    const q = fresh(r); q.chunks = q.chunks.filter(cc => !(isFrame(cc) && cc.index === frame && !cc.recs.length));
    const q2 = fresh(q), t1 = tracksOf(r), t2 = tracksOf(q2);
    if (t1.every((t, i) => t.every((m, g) => sameM(m, t2[i][g])))) r = q2;
  }
  return { o: r };
}

op('anm.key.forward', (doc, a) => {
  const { f, o } = readAnm(doc, a.rel);
  const b = boneArg(o, a.bone), at = frameArg(o, a.at);
  const r = res(ops0.copyForward(o, { bone: b, at, count: a.count === undefined || a.count === null ? undefined : a.count }));
  return result(doc, f, r, { bone: o.bones[b], at });
});

op('anm.paste', (doc, a) => {
  let { f, o } = readAnm(doc, a.rel);
  const clip = a.clip;
  if (!clip || clip.kind !== 'anm-clip/1' || !Array.isArray(clip.bones) || !(clip.frames >= 1)) fail('Nothing to paste. Copy keys, a pose or frames first.');
  const at = frameArg(o, a.at, 'frame');
  if (at + clip.frames > o.frames) {
    if (!a.grow) fail(`The pasted ${clip.frames} frames run past the end (frame ${o.frames - 1}). Make the animation longer or paste earlier.`);
    o = res(ops0.insertFrame(o, { at: o.frames - 1, count: at + clip.frames - o.frames }));
  }
  const only = a.bones && a.bones.length ? new Set(a.bones.map(lc)) : null;
  const skipped = [];
  for (const cb of clip.bones) {
    if (only && !only.has(lc(cb.name))) continue;
    if (!o.bones.some(n => lc(n) === lc(cb.name))) {
      const rest = restOf(doc, cb.name);
      if (!rest && !cb.m.some(x => x)) { skipped.push(cb.name); continue; }
      o = res(ops0.addBone(o, { name: cb.name, matrix: rest || cb.m.find(x => x) }));
    }
  }
  const tr = o.bones.map(() => null), D = new Set();
  for (const cb of clip.bones) {
    if (only && !only.has(lc(cb.name))) continue;
    const b = o.bones.findIndex(n => lc(n) === lc(cb.name)); if (b < 0) continue;
    const t = A.boneTrack(o, b).map(x => (x ? Array.from(x) : null));
    cb.m.forEach((m, k) => { if (m) { t[at + k] = matArg(m, 'pasted matrix'); D.add(at + k); } });
    tr[b] = t;
  }
  o = setDense(o, tr, D);
  for (const cb of clip.bones) {
    if (only && !only.has(lc(cb.name)) || !Array.isArray(cb.vis)) continue;
    const b = o.bones.findIndex(n => lc(n) === lc(cb.name)); if (b < 0) continue;
    const want = visState(o)[b].slice(); cb.vis.forEach((v, k) => { if (v !== null && v !== undefined) want[at + k] = v; });
    o = setVis(o, b, want);
  }
  return result(doc, f, o, { at, frames: clip.frames, skipped });
});

op('anm.vis.set', (doc, a) => {
  const { f, o } = readAnm(doc, a.rel);
  const b = boneArg(o, a.bone), [from, to] = rangeArg(o, a);
  if (typeof a.visible !== 'boolean') fail('Choose shown or hidden.');
  return result(doc, f, res(ops0.setVisibility(o, { bone: b, from, to, visible: a.visible })), { bone: o.bones[b], from, to });
});

op('anm.frames.insert', (doc, a) => {
  const { f, o } = readAnm(doc, a.rel);
  const at = frameArg(o, a.at), count = int(a.count === undefined ? 1 : a.count, 'count', 1, 65535 - o.frames);
  return result(doc, f, res(ops0.insertFrame(o, { at, count })), { at, count });
});
op('anm.frames.delete', (doc, a) => {
  const { f, o } = readAnm(doc, a.rel);
  const [from, to] = rangeArg(o, a);
  if (to - from + 1 >= o.frames) fail('An animation keeps at least one frame.');
  return result(doc, f, res(ops0.deleteFrames(o, { from, to })), { from, to });
});
op('anm.frames.duplicate', (doc, a) => {
  const { f, o } = readAnm(doc, a.rel);
  const [from, to] = rangeArg(o, a);
  return result(doc, f, res(ops0.duplicateRange(o, { from, to })), { from, to });
});
op('anm.frames.move', (doc, a) => {
  const { f, o } = readAnm(doc, a.rel);
  const [from, to] = rangeArg(o, a), at = int(a.at, 'target frame', 0, o.frames - (to - from + 1));
  return result(doc, f, res(ops0.moveRange(o, { from, to, at })), { from, to, at });
});
op('anm.frames.length', (doc, a) => {
  const { f, o } = readAnm(doc, a.rel);
  const n = int(a.frames, 'frame count', 1, 65535);
  let r = o;
  if (n > o.frames) r = res(ops0.insertFrame(o, { at: o.frames - 1, count: n - o.frames }));
  else if (n < o.frames) r = res(ops0.deleteFrames(o, { from: n, to: o.frames - 1 }));
  return result(doc, f, r, { was: o.frames });
});
op('anm.dropFirst', (doc, a) => {   // ANM-04 done once, as an undoable change (SOEdit dropped another frame on every save)
  const { f, o } = readAnm(doc, a.rel);
  return result(doc, f, res(ops0.dropFirstFrame(o)), {});
});
op('anm.reverse', (doc, a) => {
  const { f, o } = readAnm(doc, a.rel);
  const [from, to] = rangeArg(o, a, true);
  return result(doc, f, res(ops0.reverse(o, { from, to })), { from, to });
});
op('anm.loop', (doc, a) => {
  const { f, o } = readAnm(doc, a.rel);
  const mode = a.mode || 'end';
  if (mode === 'append') { const r = fresh(A.insertFrame(o, o.frames, 0)); return result(doc, f, setVisLike(o, r, 0, r.frames - 1), { mode }); }
  if (mode !== 'end') fail('Loop is "end" (last frame = first) or "append" (a copy of the first frame added at the end).');
  if (o.frames < 2) fail('A loop needs at least 2 frames.');
  const last = o.frames - 1, old = tracksOf(o), tr = old.map(t => { const n = t.slice(); n[last] = t[0]; return n; });
  return result(doc, f, setVisLike(o, setDense(o, tr, new Set([last])), 0, last), { mode });
});
function setVisLike(o0, o, src, dst) {   // bone visibility at dst = o0's at src
  const v0 = visState(o0);
  o0.bones.forEach((n, b) => { const want = visState(o)[b].slice(); want[dst] = v0[b][src]; o = setVis(o, b, want); });
  return o;
}
op('anm.interpolate', (doc, a) => {   // ANM-20 done with rotation slerp (SOEdit lerped the 12 numbers, which shrinks a turning bone)
  const { f, o } = readAnm(doc, a.rel);
  const s = frameArg(o, a.from, 'first frame'), e = frameArg(o, a.to, 'last frame');
  if (!(s < e)) fail('Pick two different frames, the first before the last.');
  const ease = EASE[a.ease || 'linear'] || fail('Ease is linear, in, out or inout.');
  const tr = tracksOf(o);
  let bones;
  if (a.bone === undefined || a.bone === null || a.bone === '') bones = tr.map((t, b) => (t[s] && t[e] ? b : -1)).filter(b => b >= 0);
  else { const b = boneArg(o, a.bone); if (!tr[b][s] || !tr[b][e]) fail(`Bone ${o.bones[b]} has no pose at frame ${s} or ${e}.`); bones = [b]; }
  if (e === s + 1 || !bones.length) return result(doc, f, o, { bones: 0 });
  const nt = tr.map(() => null), D = new Set();
  for (const b of bones) {
    const P = A.fromMatrix(tr[b][s]), Q = A.fromMatrix(tr[b][e]), t2 = tr[b].map(x => (x ? Array.from(x) : null));
    for (let g = s + 1; g < e; g++) {
      const t = ease((g - s) / (e - s));
      t2[g] = Array.from(A.toMatrix(A.slerp(P.q, Q.q, t), [0, 1, 2].map(k => P.p[k] + (Q.p[k] - P.p[k]) * t), P.mirrored)); D.add(g);
    }
    nt[b] = t2;
  }
  return result(doc, f, setDense(o, nt, D), { from: s, to: e, bones: bones.length });
});
op('anm.bake', (doc, a) => {   // a key on every frame for every animated bone (what SOEdit stores)
  const { f, o } = readAnm(doc, a.rel);
  const [from, to] = rangeArg(o, a, true), D = new Set();
  for (let g = from; g <= to; g++) D.add(g);
  return result(doc, f, setDense(o, tracksOf(o).map(t => t.map(x => (x ? Array.from(x) : null))), D, true), { from, to });
});
op('anm.pose.mirror', (doc, a) => {   // left and right swapped by bone name pairs, reflected across the X-Z plane (+Y left)
  const { f, o } = readAnm(doc, a.rel);
  const frame = frameArg(o, a.frame), to = a.to === undefined || a.to === null ? frame : frameArg(o, a.to, 'target frame');
  const tr = tracksOf(o), pairs = mirrorPairs(o.bones), nt = o.bones.map(() => null);
  o.bones.forEach((n, b) => {
    const p = pairs[n], src = p ? tr[o.bones.indexOf(p)][frame] : tr[b][frame];
    if (!src) return;
    const t = tr[b].map(x => (x ? Array.from(x) : null)); t[to] = mirrorM(src); nt[b] = t;
  });
  return result(doc, f, setDense(o, nt, new Set([to])), { frame, to, pairs: Object.keys(pairs).length / 2 });
});
op('anm.track.shift', (doc, a) => {
  const { f, o } = readAnm(doc, a.rel);
  const by = int(a.by, 'shift', -(o.frames - 1), o.frames - 1), [from, to] = rangeArg(o, a, true);
  const bones = a.bone === undefined || a.bone === null || a.bone === '' ? o.bones.map((_, i) => i) : [boneArg(o, a.bone)];
  const tr = tracksOf(o), nt = o.bones.map(() => null), D = new Set();
  for (const b of bones) {
    if (!tr[b].some(x => x)) continue;
    const t = tr[b].map(x => (x ? Array.from(x) : null));
    for (let g = from; g <= to; g++) { const src = Math.max(from, Math.min(to, g - by)); t[g] = tr[b][src] ? Array.from(tr[b][src]) : t[g]; D.add(g); }
    nt[b] = t;
  }
  return result(doc, f, setDense(o, nt, D), { by, from, to });
});
op('anm.track.offset', (doc, a) => {
  const { f, o } = readAnm(doc, a.rel);
  const b = boneArg(o, a.bone), [from, to] = rangeArg(o, a, true);
  const d = a.pos === undefined || a.pos === null ? [0, 0, 0] : vec3(a.pos, 'position offset');
  const R = a.rot === undefined || a.rot === null ? null : fromEuler(vec3(a.rot, 'rotation offset'));
  const tr = tracksOf(o);
  if (!tr[b].some(x => x)) fail(`Bone ${o.bones[b]} has no keys to move.`);
  const t = tr[b].map(x => (x ? Array.from(x) : null)), D = new Set();
  for (let g = from; g <= to; g++) {
    if (!t[g]) continue;
    const rot = R ? mul3(R, t[g].slice(0, 9)) : t[g].slice(0, 9);
    t[g] = rot.concat([t[g][9] + d[0], t[g][10] + d[1], t[g][11] + d[2]]); D.add(g);
  }
  const nt = o.bones.map(() => null); nt[b] = t;
  return result(doc, f, setDense(o, nt, D), { bone: o.bones[b], from, to });
});
op('anm.time.scale', (doc, a) => {   // resample to a new frame count (same motion, slower or faster)
  const { f, o } = readAnm(doc, a.rel);
  const n = int(a.frames, 'frame count', 1, 65535);
  if (n === o.frames) return result(doc, f, o, {});
  const tr = tracksOf(o), vis = visState(o), N = o.frames;
  const src = g => (n === 1 || N === 1 ? 0 : g * (N - 1) / (n - 1));
  const sample = (t, u) => {
    const i = Math.floor(u), j = Math.min(N - 1, i + 1), k = u - i;
    if (!t[i]) return null;
    if (k < 1e-9 || !t[j]) return Array.from(t[i]);
    const P = A.fromMatrix(t[i]), Q = A.fromMatrix(t[j]);
    return Array.from(A.toMatrix(A.slerp(P.q, Q.q, k), [0, 1, 2].map(x => P.p[x] + (Q.p[x] - P.p[x]) * k), P.mirrored));
  };
  let r = n > N ? res(ops0.insertFrame(o, { at: N - 1, count: n - N })) : res(ops0.deleteFrames(o, { from: n, to: N - 1 }));
  const nt = tr.map(t => (t.some(x => x) ? Array.from({ length: n }, (_, g) => sample(t, src(g))) : null)), D = new Set();
  for (let g = 0; g < n; g++) D.add(g);
  r = setDense(r, nt, D, true);
  o.bones.forEach((_, b) => { r = setVis(r, b, Array.from({ length: n }, (_, g) => vis[b][Math.round(src(g))])); });
  return result(doc, f, r, { was: N });
});

op('anm.bone.add', (doc, a) => {   // ANM-31 done with a check: a name the model does not have is refused unless a matrix is given
  const { f, o } = readAnm(doc, a.rel);
  const mb = modelBones(doc).find(x => lc(x.name) === lc(a.bone));
  if (!mb && (a.matrix === undefined || a.matrix === null)) fail(`There is no bone "${a.bone}" in the model.`);
  if (o.bones.some(n => lc(n) === lc(a.bone))) fail(`Bone ${a.bone} is already in this animation.`);
  const m = a.matrix !== undefined && a.matrix !== null ? matArg(a.matrix) : mb.matrix;
  return result(doc, f, res(ops0.addBone(o, { name: mb ? mb.name : String(a.bone), matrix: m })), { bone: mb ? mb.name : String(a.bone) });
});
op('anm.bone.remove', (doc, a) => {   // ANM-32 done: any bone, the first one too
  const { f, o } = readAnm(doc, a.rel);
  const b = boneArg(o, a.bone);
  return result(doc, f, res(ops0.removeBone(o, { bone: b })), { bone: o.bones[b] });
});
op('anm.bone.rename', (doc, a) => {
  const { f, o } = readAnm(doc, a.rel);
  const b = boneArg(o, a.bone);
  return result(doc, f, res(ops0.renameBone(o, { bone: b, name: a.name })), { bone: a.name, was: o.bones[b] });
});
op('anm.bone.clone', (doc, a) => {
  const { f, o } = readAnm(doc, a.rel);
  const b = boneArg(o, a.bone);
  const r = res(ops0.cloneBone(o, { bone: b, name: a.name || undefined }));
  return result(doc, f, r, { bone: r.bones[r.bones.length - 1] });
});
op('anm.bone.export', (doc, a) => {   // one-bone .anm, same version as the source (SOEdit wrote 0x40000)
  const { o } = readAnm(doc, a.rel);
  const b = boneArg(o, a.bone), to = anmRelArg(doc, a.to);
  if (hasFile(doc, to)) fail(`The model already has a file "${to}".`);
  let r = o;
  for (let i = o.bones.length - 1; i >= 0; i--) if (i !== b) r = res(ops0.removeBone(r, { bone: i }));
  return { files: { [to]: A.write(r) }, info: { rel: to, bone: o.bones[b] } };
});
op('anm.bone.import', (doc, a) => {   // ANM-13 done: any version, each bone named into its own slot
  const { f, o } = readAnm(doc, a.rel);
  let src;
  if (a.data !== undefined && a.data !== null) src = A.parse(Buffer.isBuffer(a.data) ? a.data : Buffer.from(String(a.data), 'base64'));
  else src = readAnm(doc, a.from).o;
  if (src.error) fail(`The other animation has data the editor cannot read (${src.error}).`);
  const pick = a.bones && a.bones.length ? a.bones.map(x => boneArg(src, x)) : src.bones.map((_, i) => i);
  let r = o; const names = [];
  for (const b of pick) { const t = res(ops0.exportBone(src, { bone: b })); r = res(ops0.importBone(r, t, {})); names.push(r.bones[r.bones.length - 1]); }
  return result(doc, f, r, { imported: names });
});
op('anm.bone.reset', (doc, a) => {
  const { f, o } = readAnm(doc, a.rel);
  const b = boneArg(o, a.bone), value = a.value || 'rest';
  let m;
  if (value === 'rest') m = restOf(doc, o.bones[b]) || IDM();
  else if (value === 'identity') m = IDM();
  else if (value === 'first') { m = A.matrixAt(o, b, 0); if (!m) fail(`Bone ${o.bones[b]} has no pose at frame 0.`); m = Array.from(m); }
  else fail('Reset to rest, identity or first.');
  const has = v => v !== undefined && v !== null && v !== '';
  let opt;
  if (has(a.frame)) { const g = frameArg(o, a.frame); opt = { bone: b, matrix: m, from: g, to: g }; }
  else if (has(a.from) || has(a.to)) { const [from, to] = rangeArg(o, a); opt = { bone: b, matrix: m, from, to }; }
  else opt = { bone: b, matrix: m };
  return result(doc, f, res(ops0.resetBone(o, opt)), { bone: o.bones[b], value });
});

// ---------- tl.* : sequences of the .mdl ----------
op('tl.seq.add', (doc, a) => {
  const mf = mdlFile(doc); if (!mf) fail('This document has no .mdl to hold a sequence.');
  const fields = fieldsArg(Object.assign({}, a.fields || {}, a.file ? { file: a.file } : {}), gohDoc(doc));
  return { files: { [mf.rel]: mdlAddSeq(doc, a.name, fields, a.bone) }, info: { sequence: a.name } };
});
op('tl.seq.set', (doc, a) => {
  const mf = mdlFile(doc); if (!mf) fail('This document has no .mdl.');
  const x = seqFind(doc, a.sequence, a.bone);
  const fields = fieldsArg(a.fields, gohDoc(doc));
  if (fields.name !== undefined && fields.name !== x.s.name && seqList(doc).some(q => q.s !== x.s && q.s.bone === x.s.bone && lc(q.s.name) === lc(fields.name))) fail(`There is already a sequence "${fields.name}" there.`);
  const ch = {};
  for (const [k, v] of Object.entries(fields)) ch[k] = v;
  const b = M.edit(M.parse(mf.bytes), [{ op: 'setSequence', sequence: x.s.name, bone: x.s.bone, fields: ch }]);
  return { files: b.equals(mf.bytes) ? {} : { [mf.rel]: b }, info: { sequence: fields.name || x.s.name } };
});
op('tl.seq.delete', (doc, a) => {
  const mf = mdlFile(doc); if (!mf) fail('This document has no .mdl.');
  const x = seqFind(doc, a.sequence, a.bone);
  return { files: { [mf.rel]: mdlDelSeqs(mf.bytes, [{ name: x.s.name, bone: x.s.bone }]) }, info: { sequence: x.s.name } };
});

// ---------- states ----------
const state = {};
state['anm.list'] = (doc) => {
  const seqs = seqList(doc), out = [], have = new Set();
  for (const [rel, f] of doc.files) {
    if (f.kind !== 'anm' && !/\.anm$/i.test(rel)) continue;
    have.add(lc(rel));
    const o = A.parse(f.bytes), kinds = {};
    for (const c of o.chunks) if (isFrame(c)) kinds[c.tag] = (kinds[c.tag] || 0) + 1;
    out.push({ rel, name: path.posix.basename(rel), frames: o.frames, bones: o.bones.length, version: o.version, versionHex: '0x' + (o.version >>> 0).toString(16),
      keyFrames: o.chunks.filter(isFrame).length, kinds, problems: o.problems.length, readable: !o.error, error: o.error || null, from: f.from, dirty: !!f.dirty,
      sequences: seqs.filter(x => x.rel && lc(x.rel) === lc(rel)).map(x => x.s.name) });
  }
  out.sort((x, y) => (lc(x.rel) < lc(y.rel) ? -1 : 1));
  const missing = seqs.filter(x => x.rel && !have.has(lc(x.rel))).map(x => ({ sequence: x.s.name, rel: x.rel }));
  return { animations: out, missing, modelBones: modelBones(doc).map(b => b.name), fps: FPS };
};
state['anm.get'] = (doc, q) => {
  const { f, o } = readAnm(doc, q && q.rel, false);
  const keys = o.bones.map(() => []), vis = o.bones.map(() => []), mesh = o.bones.map(() => []);
  const chunkFrames = [];
  for (const c of o.chunks) {
    if (!isFrame(c)) continue;
    chunkFrames.push(c.index);
    for (const r of c.recs) {
      if (r.bone < 0 || r.bone >= o.bones.length) continue;
      if (r.matrix && keys[r.bone][keys[r.bone].length - 1] !== c.index) keys[r.bone].push(c.index);
      if (r.visible !== null && r.visible !== undefined) vis[r.bone].push([c.index, r.visible]);
      if (r.mesh) mesh[r.bone].push(c.index);
    }
  }
  const mb = modelBones(doc).map(b => lc(b.name));
  return { rel: f.rel, frames: o.frames, version: o.version, versionHex: '0x' + (o.version >>> 0).toString(16), readable: !o.error, error: o.error || null,
    problems: o.problems.slice(0, 50), keyFrames: chunkFrames,
    bones: o.bones.map((n, i) => ({ name: n, index: i, inModel: mb.includes(lc(n)), keys: keys[i], vis: vis[i], mesh: mesh[i] })),
    sequences: seqUsing(doc, f.rel).map(x => x.s.name), fps: FPS };
};
state['anm.pose'] = (doc, q) => {
  q = q || {};
  let o = null, frame = 0;
  if (q.rel) { o = readAnm(doc, q.rel, false).o; if (o.error) o = null; }
  if (o) frame = Math.max(0, Math.min(o.frames - 1, Math.floor(+q.frame || 0)));
  const P = poseOf(doc, o, frame), vs = o ? visState(o) : [];
  const r6 = m => Array.from(m).map(v => Math.round(v * 1e6) / 1e6);
  const bones = P.mb.map(b => {
    const i = P.anmIx.get(lc(b.name)), l = P.loc.get(b.path);
    return { name: b.name, path: b.path, parent: b.parent, inAnm: i !== undefined, keyed: i !== undefined && !!P.tr[i][frame],
      local: r6(l), world: r6(P.world.get(b.path)), pos: r6(l.slice(9, 12)), rot: toEuler(l).map(v => Math.round(v * 1e4) / 1e4), mirrored: det3(l) < 0,
      visible: i !== undefined ? vs[i][frame] !== false : true };
  });
  const extra = o ? o.bones.filter(n => !P.mb.some(b => lc(b.name) === lc(n))).map(n => { const i = o.bones.indexOf(n), l = P.tr[i][frame]; return { name: n, path: null, inAnm: true, local: l ? r6(l) : null, world: null, visible: vs[i][frame] !== false }; }) : [];
  return { rel: q.rel || null, frame, frames: o ? o.frames : 0, bones, extra };
};
state['anm.clip'] = (doc, q) => {
  const { o } = readAnm(doc, q && q.rel);
  const [from, to] = rangeArg(o, q || {}, true);
  return clipOf(o, from, to, q.bones);
};
state['tl.get'] = (doc, q) => {
  q = q || {};
  const seqs = seqList(doc).map(({ s, rel }) => {
    const k = rel ? hasFile(doc, rel) : null, o = k ? A.parse(doc.files.get(k).bytes) : null, frames = o ? o.frames : null;
    let speed = typeof s.speed === 'number' ? s.speed : 1;
    const d = s.fields.duration;
    if (Array.isArray(d) && frames) { if (lc(d[0]) === 'frames' && +d[1]) speed = frames / +d[1]; else if (lc(d[0]) === 'percent') speed = +d[1] * 0.01; }
    return { name: s.name, bone: s.bone, file: s.file || s.fileDefault || null, rel: k || rel, loaded: !!k, frames, speed, fps: FPS * speed,
      seconds: frames ? frames / (FPS * Math.abs(speed)) : null, smooth: s.smooth, resume: s.resume, store: s.store, autostart: s.autostart,
      movement: s.movement, pinback: s.pinback, rotate: s.rotate, duration: s.fields.duration === undefined ? null : s.fields.duration, unknown: s.unknown.slice() };
  });
  const events = [];
  const rels = q.rel ? [fileOf(doc, q.rel).rel] : [...doc.files.keys()].filter(r => /\.anm$/i.test(r));
  for (const rel of rels) {
    const o = A.parse(doc.files.get(rel).bytes);
    for (const c of o.chunks) if (isFrame(c)) for (const r of c.recs) {
      if (r.bone < 0 || r.bone >= o.bones.length) continue;
      if (r.visible !== null && r.visible !== undefined) events.push({ rel, bone: o.bones[r.bone], frame: c.index, kind: r.visible ? 'show' : 'hide' });
      if (r.mesh) events.push({ rel, bone: o.bones[r.bone], frame: c.index, kind: 'mesh' });
    }
  }
  const ranges = seqs.filter(s => s.frames).map(s => ({ sequence: s.name, rel: s.rel, from: 0, to: s.frames - 1 }));
  return { sequences: seqs, events, ranges, fps: FPS };
};

module.exports = { ops, state, _t: { fromEuler, toEuler, mirrorPairs, mirrorM, setDense, visState, seqText, fileText, seqRel, FPS } };

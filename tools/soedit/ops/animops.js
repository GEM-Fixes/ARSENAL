// soedit/ops/animops: SOEdit's animation operations without a window. Pure functions: an anm object (tools/lib/model/anm.js
// parse result) in, a new anm object out; the input is never changed; no file IO. Bad input returns { error } (no throw).
// Spec: tools/soedit/ops/NOTES.md sections 0-12. CLI: tools/soedit/ops/anim.js.
//
// Model: the lib's engine model, not SOEdit's dense one. A frame's pose = the engine's value (key frames, held values,
// Slerp + linear position between keys); visibility = a state per bone per frame made by events (null = no event yet =
// visible). Every edit goes through anm.setMatrix/insertFrame/deleteFrames/reverse or through rec.matrix/rec.visible
// edits that anm.write folds in; the file version is never changed (SOEdit always saves 0x40000).
// Range edits key every animated bone on the edited frames and on the frame either side, so frames outside the range
// keep their pose. [I] in-between frames next to a new key can move slightly (rotation ~1e-3 over a 30 deg stretch):
// the engine slerp (half angle) is not constant-speed, so a key placed at an interpolated frame re-times its
// neighbours; anm.insertFrame/deleteFrames do the same. Whole reverse drops the keys it had to add when they turn
// redundant again (prune), so reverse twice returns the original bytes when the source has no redundant keys.
//
// Operations (frames 0-based):
//   reverse(o, {from, to})            whole animation (anm.reverse's chunk reorder, re-keyed with native record copies,
//                                     redundant keys pruned) or a frame range; the visibility state is mirrored too
//   fill(o, {bone, from, to})         frames from+1..to-1 of one bone (all animated bones when bone is omitted):
//                                     position linear, rotation anm.slerp (engine variant), visibility start/end at t<0.5
//   insertFrame(o, {at, count})       count copies of frame at, placed after it (SOEdit OnInsertFrame)
//   deleteFrames(o, {from, to})       at least one frame must remain
//   duplicateRange(o, {from, to}) copies of the block right after it
//   moveRange(o, {from, to, at})      block moved so it starts at frame `at` of the result (SOEdit: by one, [ and ])
//   copyForward(o, {bone, at, count}) bone's matrix at frame at copied to the next count frames (default: to the end)
//   dropFirstFrame(o)                 deletes frame 0 once (see departures)
//   cloneBone(o, {bone, name})        track copy; default name <bone>_Clone_<i> as SOEdit
//   exportBone(o, {bone}) -> track    { format:'soedit-anm-track', formatVersion:1, bone, frames, sourceVersion,
//                                       matrices: [12 numbers | null per frame], visible: [true|false|null per frame] }
//   importBone(o, track, {name})      adds the track as a new bone, any source version; name clash -> <name>_<i>;
//                                     frame counts equalised by repeating the last frame of the shorter (SOEdit)
//   renameBone(o, {bone, name})       resetBone(o, {bone, matrix, from, to})  (default: frame 0's matrix, all frames)
//   addBone(o, {name, matrix})        keyed in the first frame chunk with matrix (default identity)
//   removeBone(o, {bone})             any index, 0 included; the last bone cannot go
//   newAnimation(names, frameCount, restMatrices, version = 0x60000)
//   setVisibility(o, {bone, from, to, visible})   state set on from..to; frames after to keep their old state
//   info(o) -> { version, versionHex, frames, bones, keyFrames, chunkKinds, keyed:[{bone,keys}], visibility:[{bone,frame,visible}], problems, readError }
//   changes(a, b) -> [string]         what differs (used by the CLI for `changed`)
//   isError(r) -> true for an { error } result
//
// Departures from SOEdit (NOTES.md parity list: fix, not copy):
//   - dropFirstFrame is a plain op on the object: running it twice drops exactly two frames (SOEdit drops one more on
//     every later save because it edits memory).
//   - removeBone works for index 0 (SOEdit's `if(Finded)` guard skips it).
//   - importBone takes a track from any version (SOEdit: 0x40000 only) and names the right slot; there is no file-level
//     duplicate fix-up because a track carries one bone.
//   - every bone of the result is written whatever frame it first appears in (SOEdit's delta writer drops a bone that
//     is new in a frame); the lib keys every animated bone in the first chunk.
//   - fill interpolates rotation with the engine's slerp (SOEdit lerps all 12 floats, which shrinks the rotation).
//   - renameBone refuses an empty, clashing or non-printable name instead of substituting NewBone<i>; any printable
//     latin1 name is kept (SOEdit strips to [A-Za-z0-9_], 30 chars).
//   - resetBone resets the whole track (or a range) to a given rest matrix or frame 0 (SOEdit: identity, one frame).
//   - the file version is kept (SOEdit always writes 0x40000).
// [I] mesh events (FRM2 0x20 / MESH) stay on their frame number in range reverse/move/fill; whole reverse, insert and
//     delete move them with their frames (lib). [T] engine playback of the fill result and of 0-bone-0 removal.
// Author: Imperator_Aug (ARSENAL, ia-ba288714)
'use strict';
const anm = require('../../lib/model/anm');
const { F_MESH } = anm.FLAGS;

const VERSIONS = [0x30000, 0x40000, 0x50000, 0x60000, 0x60001];
const isFrame = c => !!c && (c.tag === 'FRM2' || c.tag === 'FRMN');
class OpError extends Error {}
const fail = m => { throw new OpError(m); };
const isError = r => !r || typeof r !== 'object' || (!Array.isArray(r.chunks) && typeof r.error === 'string');
const guard = fn => function guarded(...a) { try { return fn(...a); } catch (e) { return { error: e && e.message ? e.message : String(e) }; } };
const identity = () => Float32Array.from([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]);
const fresh = o => anm.parse(anm.write(o));

// ---- validation ----
function need(o) {
  if (!o || !Array.isArray(o.chunks) || !Array.isArray(o.bones)) fail('not an animation object');
  if (o.error) fail(`animation has unreadable data (${o.error}); refusing to edit`);
  if (!(o.frames >= 1)) fail('animation has no frames');
}
function int(v, name, lo, hi) {
  const n = typeof v === 'string' && /^\s*-?\d+\s*$/.test(v) ? Number(v) : v;
  if (!Number.isInteger(n)) fail(`${name} must be an integer (got ${v})`);
  if (n < lo || n > hi) fail(`${name} ${n} out of range ${lo}..${hi}`);
  return n;
}
function boneOf(o, bone) {
  if (bone === undefined || bone === null || bone === '') fail('a bone is required');
  if (typeof bone === 'number') { if (Number.isInteger(bone) && bone >= 0 && bone < o.bones.length) return bone; fail('no bone index ' + bone); }
  const s = String(bone);
  let i = o.bones.indexOf(s);
  if (i >= 0) return i;
  const lo = s.toLowerCase();
  i = o.bones.findIndex(n => n.toLowerCase() === lo);
  if (i >= 0) return i;
  if (/^\d+$/.test(s) && +s < o.bones.length) return +s;
  return fail(`no bone "${s}" (bones: ${o.bones.join(', ')})`);
}
function matrixArg(m, name = 'matrix') {
  if (m === undefined || m === null) return null;
  const a = typeof m === 'string' ? m.split(/[\s,;]+/).filter(Boolean).map(Number) : Array.from(m);
  if (a.length !== 12 || !a.every(Number.isFinite)) fail(`${name} needs 12 finite numbers (X row, Y row, Z row, translation)`);
  return Float32Array.from(a);
}
function nameArg(o, name, self = -1) {
  if (typeof name !== 'string' || !/^[\x21-\x7e\xa0-\xff](?:[\x20-\x7e\xa0-\xff]*[\x21-\x7e\xa0-\xff])?$/.test(name) || name.length > 255)
    fail(`bad bone name ${JSON.stringify(name)} (printable latin1, no leading/trailing space, up to 255 chars)`);
  const lo = name.toLowerCase();
  if (o.bones.some((n, i) => i !== self && n.toLowerCase() === lo)) fail(`bone name "${name}" is already used`);
  return name;
}
function rangeArg(o, opt, defFrom = 0, defTo = o.frames - 1) {
  const pick = (v, d) => (v === undefined || v === null || v === '' ? d : v);
  const f0 = pick(opt.from, defFrom), t0 = pick(opt.to, defTo);
  if (f0 === undefined || t0 === undefined) fail('a frame range is required (from, to)');
  const from = int(f0, 'from', 0, o.frames - 1), to = int(t0, 'to', 0, o.frames - 1);
  if (to < from) fail(`frame range ${from}..${to} is empty`);
  return [from, to];
}
function boneRoom(o, extra) {
  if (o.bones.length + extra > 255) fail('the engine allows at most 255 animated bones');
}

// ---- state ----
const tracks = o => o.bones.map((_, b) => anm.boneTrack(o, b));
function visEvents(o) { // [frame] -> Map(bone -> visible), last event wins
  const ev = Array.from({ length: o.frames }, () => new Map());
  for (const c of o.chunks) if (isFrame(c) && c.index >= 0 && c.index < o.frames)
    for (const r of c.recs) if (r.visible !== null && r.visible !== undefined && r.bone >= 0 && r.bone < o.bones.length) ev[c.index].set(r.bone, r.visible);
  return ev;
}
function visState(o) {
  const ev = visEvents(o);
  return o.bones.map((_, b) => { let cur = null; const a = []; for (let f = 0; f < o.frames; f++) { if (ev[f].has(b)) cur = ev[f].get(b); a.push(cur); } return a; });
}

// ---- chunk / record edits (on a fresh copy; finish with fresh()) ----
const hasChunk = (o, f) => o.chunks.some(c => isFrame(c) && c.index === f);
function lastChunkAt(o, f) { let c = null; for (const x of o.chunks) if (isFrame(x) && x.index === f) c = x; return c; }
function kindFor(o, f) {
  let best = null;
  for (const c of o.chunks) if (isFrame(c) && (!best || Math.abs(c.index - f) < Math.abs(best.index - f))) best = c;
  return best ? best.tag : o.version >= 0x60000 ? 'FRM2' : 'FRMN';
}
const newRec = (kind, bone) => (kind === 'FRM2' ? { bone, flags: 0, pos: null, rot: null, mesh: null, matrix: null, visible: null }
  : { bone, items: [], matrix: null, visible: null, mesh: null });
function recFor(c, b, create) {
  let r = null;
  for (const x of c.recs) if (x.bone === b) r = x;
  if (!r && create) { r = newRec(c.tag, b); c.recs.push(r); }
  return r;
}
function insertChunk(o, f) {
  const c = { tag: kindFor(o, f), offset: null, size: null, index: f, recs: [] };
  let at = o.chunks.length;
  for (let i = 0; i < o.chunks.length; i++) if (isFrame(o.chunks[i]) && o.chunks[i].index > f) { at = i; break; }
  if (at === o.chunks.length) while (at > 0 && o.chunks[at - 1].raw) at--;
  o.chunks.splice(at, 0, c);
  return c;
}
// make a key-frame chunk exist at each frame without changing any pose
function ensureChunks(o, frames) {
  const want = [...new Set(frames)].filter(f => f >= 0 && f < o.frames && !hasChunk(o, f)).sort((a, b) => a - b);
  if (!want.length) return o;
  const tr = tracks(o);
  for (const f of want) {
    const b = tr.findIndex(t => t[f]);
    if (b >= 0) o = anm.setMatrix(o, f, b, tr[b][f]);
    else { o = fresh(o); insertChunk(o, f); o = fresh(o); }
  }
  return o;
}
function setKey(o, f, b, m) { recFor(lastChunkAt(o, f), b, true).matrix = Float32Array.from(m); }

// set visibility events so the state equals want[b][f] (null = no requirement beyond "visible")
function fixVis(o, want) {
  const ev = visEvents(o), sets = [];
  for (let b = 0; b < o.bones.length; b++) {
    let cur = null;
    for (let f = 0; f < o.frames; f++) {
      if (ev[f].has(b)) cur = ev[f].get(b);
      const w = want[b] ? want[b][f] : null, eff = cur === null ? true : cur, ww = w === null || w === undefined ? true : w;
      if (eff !== ww) { sets.push([f, b, ww]); cur = ww; }
    }
  }
  if (!sets.length) return o;
  o = fresh(ensureChunks(o, sets.map(s => s[0])));
  for (const [f, b, v] of sets) recFor(lastChunkAt(o, f), b, true).visible = v;
  return fresh(o);
}

// key every animated bone on the frames of D and their neighbours with newTr; then visibility
function applyDense(o, newTr, D, newVis) {
  const oldTr = tracks(o), oldVis = newVis ? visState(o) : null;
  const same = (x, y) => (!x && !y) || (!!x && !!y && x.every((v, i) => v === y[i]));
  let differs = false;
  for (const f of D) for (let b = 0; b < o.bones.length && !differs; b++)
    if (!same(oldTr[b][f], newTr[b] && newTr[b][f]) || (oldVis && (oldVis[b][f] === false) !== (newVis[b][f] === false))) differs = true;
  if (!differs) return o;
  const K = new Set();
  for (const f of D) for (const g of [f - 1, f, f + 1]) if (g >= 0 && g < o.frames) K.add(g);
  o = fresh(ensureChunks(o, [...K]));
  for (const f of K) for (let b = 0; b < o.bones.length; b++) if (newTr[b] && newTr[b][f]) setKey(o, f, b, newTr[b][f]);
  o = fresh(o);
  return newVis ? fixVis(o, newVis) : o;
}
// whole reverse like anm.reverse (frame chunks in reverse order, events move with their chunks), but a bone a chunk
// must now key is keyed with a native copy of the record that defined its pose (no matrix->quat round trip), so the
// keys stay bit-exact and prune() can remove them again on the way back
function reverseAll(o) {
  const r = fresh(o), nb = r.bones.length, F = anm.FLAGS;
  const fcs = r.chunks.filter(isFrame), slots = [];
  r.chunks.forEach((c, i) => { if (isFrame(c)) slots.push(i); });
  const cur = new Array(nb).fill(null), def = new Map();
  for (const c of fcs) { for (const x of c.recs) if (x.matrix && x.bone >= 0 && x.bone < nb) cur[x.bone] = x; def.set(c, cur.slice()); }
  const copyRec = (x, kind) => {
    const m = Float32Array.from(x.matrix);
    if (kind === 'FRM2' && x.pos && x.rot && (x.flags & F.F_POS) && (x.flags & F.F_ROT))
      return { bone: x.bone, flags: x.flags & (F.F_POS | F.F_ROT | F.F_MIR), pos: Float32Array.from(x.pos), rot: Float32Array.from(x.rot), mesh: null, matrix: m, visible: null };
    if (kind === 'FRMN' && x.items) { const it = { tag: 'MATR', m: Float32Array.from(x.items.filter(i => i.tag === 'MATR').pop().m) }; return { bone: x.bone, items: [it], matrix: it.m, visible: null, mesh: null }; }
    const y = newRec(kind, x.bone); y.matrix = m; return y; // other kind or partial record: the lib converts the matrix
  };
  const rev = fcs.slice().reverse();
  rev.forEach((c, k) => { c.index = r.frames - 1 - c.index; r.chunks[slots[k]] = c; });
  const held = new Array(nb).fill(null);
  const same = (a, b) => !!a && !!b && a.every((v, i) => v === b[i]);
  rev.forEach((c, k) => {
    const keyed = new Set();
    for (const x of c.recs) if (x.matrix && x.bone >= 0 && x.bone < nb) { held[x.bone] = x.matrix; keyed.add(x.bone); }
    const want = def.get(c);
    for (let b = 0; b < nb; b++) {
      if (keyed.has(b) || !want[b]) continue;
      if (k === 0 || !same(held[b], want[b].matrix)) {
        const y = copyRec(want[b], c.tag), ex = recFor(c, b, false);
        if (!ex) c.recs.push(y);
        else if (c.tag === 'FRM2' && y.pos) { ex.flags = (ex.flags & ~(F.F_POS | F.F_ROT | F.F_MIR)) | y.flags; ex.pos = y.pos; ex.rot = y.rot; ex.matrix = y.matrix; }
        else if (c.tag === 'FRMN' && y.items.length) { ex.items.unshift(y.items[0]); ex.matrix = y.matrix; }
        else ex.matrix = y.matrix; // event-only record of this bone: key it in place
        held[b] = y.matrix;
      }
    }
  });
  return fresh(r);
}
// drop keys that repeat the bone's held value bit for bit (outside the first chunk): no pose changes, and the keys a
// reverse had to add go away again, so reverse twice gives the original bytes
// Used only when the source itself has no redundant key (SOEdit/lib-made sparse files); vanilla files that repeat
// keys on purpose (first and last frame keyed alike) are not pruned. probe: return null when nothing would go.
function prune(o, probe) {
  const r = probe ? o : fresh(o), held = new Array(r.bones.length).fill(null);
  let first = true, changed = false;
  for (const c of r.chunks) {
    if (!isFrame(c)) continue;
    const cnt = new Map(); for (const x of c.recs) cnt.set(x.bone, (cnt.get(x.bone) || 0) + 1);
    const keep = [];
    for (const x of c.recs) {
      const b = x.bone, m = x.matrix, ok = b >= 0 && b < r.bones.length;
      if (!first && m && ok && cnt.get(b) === 1 && held[b] && m.every((v, i) => v === held[b][i])) {
        if (probe) return o;
        changed = true;
        if ((x.visible === null || x.visible === undefined) && !x.mesh) continue;
        x.matrix = null; keep.push(x); continue;
      }
      if (m && ok) held[b] = m;
      keep.push(x);
    }
    c.recs = keep;
    first = false;
  }
  if (probe) return null;
  return changed ? fresh(r) : o;
}
// same frame count: frame f of the result = frame src[f] of o
function remap(o, src) {
  const D = new Set(); src.forEach((s, f) => { if (s !== f) D.add(f); });
  if (!D.size) return o;
  const tr = tracks(o), vis = visState(o);
  return applyDense(o, tr.map(t => src.map(s => t[s])), D, vis.map(v => src.map(s => v[s])));
}
// after a frame-count change: visibility of frame f = old state of frame src[f]
function visAfter(o, oldVis, src) { return fixVis(o, oldVis.map(v => src.map(s => v[s]))); }
const seq = (a, b) => { const r = []; for (let i = a; i <= b; i++) r.push(i); return r; };

// ---- operations ----
function reverse(o, opt = {}) {
  need(o);
  const [from, to] = rangeArg(o, opt);
  if (from === to) return o;
  if (from === 0 && to === o.frames - 1) {
    const vis = visState(o);
    const minimal = prune(o, true) === null, rv = reverseAll(o);
    const r = minimal ? prune(rv) : rv;
    return visAfter(r, vis, seq(0, o.frames - 1).map(f => o.frames - 1 - f));
  }
  return remap(o, seq(0, o.frames - 1).map(f => (f >= from && f <= to ? from + to - f : f)));
}

function fill(o, opt = {}) {
  need(o);
  if (opt.from === undefined || opt.to === undefined) fail('fill needs from and to');
  const s = int(opt.from, 'from', 0, o.frames - 1), e = int(opt.to, 'to', 0, o.frames - 1);
  if (!(s < e)) fail(`invalid frame range ${s}..${e} (from < to)`);
  const tr = tracks(o), vis = visState(o);
  let bones;
  if (opt.bone === undefined || opt.bone === null || opt.bone === '') bones = tr.map((t, b) => (t[s] && t[e] ? b : -1)).filter(b => b >= 0);
  else { const b = boneOf(o, opt.bone); if (!tr[b][s] || !tr[b][e]) fail(`bone ${o.bones[b]} has no pose at frame ${s} or ${e}`); bones = [b]; }
  if (e === s + 1 || !bones.length) return o;
  const D = new Set(seq(s + 1, e - 1));
  for (const b of bones) {
    const A = anm.fromMatrix(tr[b][s]), B = anm.fromMatrix(tr[b][e]);
    for (const f of D) {
      const t = (f - s) / (e - s);
      tr[b][f] = anm.toMatrix(anm.slerp(A.q, B.q, t), [0, 1, 2].map(k => A.p[k] + (B.p[k] - A.p[k]) * t), A.mirrored);
      vis[b][f] = t < 0.5 ? vis[b][s] : vis[b][e];
    }
  }
  return applyDense(o, tr, D, vis);
}

function insertFrame(o, opt = {}) {
  need(o);
  const at = int(opt.at === undefined ? o.frames - 1 : opt.at, 'at', 0, o.frames - 1);
  const count = int(opt.count === undefined || opt.count === null ? 1 : opt.count, 'count', 1, 65535 - o.frames);
  const vis = visState(o);
  let r = o;
  for (let k = 0; k < count; k++) r = anm.insertFrame(r, at + 1, at);
  return visAfter(fresh(r), vis, [...seq(0, at), ...new Array(count).fill(at), ...seq(at + 1, o.frames - 1)]);
}

function deleteFrames(o, opt = {}) {
  need(o);
  const [from, to] = rangeArg(o, opt, opt.from === undefined ? undefined : opt.from, opt.to === undefined ? opt.from : opt.to);
  if (from === undefined) fail('deleteFrames needs from');
  if (to - from + 1 >= o.frames) fail('cannot delete every frame (one must remain)');
  const vis = visState(o);
  const r = fresh(anm.deleteFrames(o, from, to));
  return visAfter(r, vis, [...seq(0, from - 1), ...seq(to + 1, o.frames - 1)]);
}

function duplicateRange(o, opt = {}) {
  need(o);
  if (opt.from === undefined) fail('duplicateRange needs from');
  const [from, to] = rangeArg(o, opt, undefined, opt.from);
  const n = to - from + 1;
  if (o.frames + n > 65535) fail('too many frames');
  const vis = visState(o);
  let r = o;
  for (let k = 0; k < n; k++) r = anm.insertFrame(r, to + 1 + k, from + k);
  return visAfter(fresh(r), vis, [...seq(0, to), ...seq(from, to), ...seq(to + 1, o.frames - 1)]);
}

function moveRange(o, opt = {}) {
  need(o);
  if (opt.from === undefined || opt.at === undefined) fail('moveRange needs from and at');
  const [from, to] = rangeArg(o, opt, undefined, opt.from);
  const n = to - from + 1, at = int(opt.at, 'at', 0, o.frames - n);
  const rest = seq(0, o.frames - 1).filter(f => f < from || f > to);
  return remap(o, [...rest.slice(0, at), ...seq(from, to), ...rest.slice(at)]);
}

function copyForward(o, opt = {}) {
  need(o);
  const b = boneOf(o, opt.bone), at = int(opt.at === undefined ? 0 : opt.at, 'at', 0, o.frames - 1);
  const end = opt.count === undefined || opt.count === null ? o.frames - 1 : at + int(opt.count, 'count', 1, o.frames - 1 - at);
  const tr = tracks(o);
  if (!tr[b][at]) fail(`bone ${o.bones[b]} has no pose at frame ${at}`);
  if (end <= at) return o;
  const D = new Set(seq(at + 1, end));
  for (const f of D) tr[b][f] = tr[b][at];
  return applyDense(o, tr, D, null);
}

function dropFirstFrame(o) {
  need(o);
  if (o.frames < 2) fail('dropFirstFrame needs at least 2 frames');
  return deleteFrames(o, { from: 0, to: 0 });
}

function cloneBone(o, opt = {}) {
  need(o);
  const b = boneOf(o, opt.bone);
  boneRoom(o, 1);
  let name = opt.name;
  if (name === undefined || name === null || name === '') {
    const used = new Set(o.bones.map(n => n.toLowerCase()));
    for (let i = 0; i < 100; i++) { name = `${o.bones[b]}_Clone_${i}`; if (!used.has(name.toLowerCase())) break; }
  }
  nameArg(o, name);
  const r = fresh(o), nb = r.bones.length;
  r.bones.push(name);
  for (const c of r.chunks) {
    if (!isFrame(c)) continue;
    const add = [];
    for (const x of c.recs) {
      if (x.bone !== b) continue;
      if (c.tag === 'FRM2') {
        const flags = x.flags & ~F_MESH;
        if (!flags) continue;
        add.push({ bone: nb, flags, pos: x.pos ? Float32Array.from(x.pos) : null, rot: x.rot ? Float32Array.from(x.rot) : null, mesh: null,
          matrix: x.matrix ? Float32Array.from(x.matrix) : null, visible: x.visible });
      } else {
        const items = x.items.filter(it => it.tag !== 'MESH').map(it => (it.m ? { tag: it.tag, m: Float32Array.from(it.m) } : { ...it }));
        if (!items.length) continue;
        const mi = items.filter(it => it.tag === 'MATR').pop();
        add.push({ bone: nb, items, matrix: mi ? mi.m : null, visible: x.visible, mesh: null });
      }
    }
    c.recs.push(...add);
  }
  return fresh(r);
}

function exportBone(o, opt = {}) {
  need(o);
  const b = boneOf(o, opt.bone);
  return { format: 'soedit-anm-track', formatVersion: 1, bone: o.bones[b], frames: o.frames, sourceVersion: o.version,
    matrices: anm.boneTrack(o, b).map(m => (m ? Array.from(m) : null)), visible: visState(o)[b] };
}

function importBone(o, track, opt = {}) {
  need(o);
  if (!track || typeof track !== 'object' || !Array.isArray(track.matrices) || !track.matrices.length) fail('track needs a matrices array (exportBone output)');
  const mats = track.matrices.map((m, i) => (m === null ? null : matrixArg(m, `track matrix ${i}`)));
  const vis = Array.isArray(track.visible) ? track.visible.slice(0, mats.length) : [];
  while (vis.length < mats.length) vis.push(vis.length ? vis[vis.length - 1] : null);
  if (vis.some(v => v !== null && typeof v !== 'boolean')) fail('track visible entries must be true, false or null');
  boneRoom(o, 1);
  // name: requested or the track's; on a clash <name>_<i> (SOEdit), an explicit clashing --name is an error
  let name = opt.name || track.bone || 'Imported';
  if (!opt.name) {
    const used = new Set(o.bones.map(n => n.toLowerCase()));
    if (used.has(name.toLowerCase())) { let i = 0; while (i < 100 && used.has(`${name}_${i}`.toLowerCase())) i++; if (i === 100) fail('no free name for ' + name); name = `${name}_${i}`; }
  }
  nameArg(o, name);
  // equalise frame counts by repeating the last frame of the shorter one
  let r = o;
  if (mats.length > r.frames) { r = insertFrame(r, { at: r.frames - 1, count: mats.length - r.frames }); if (isError(r)) fail(r.error); }
  while (mats.length < r.frames) { mats.push(mats[mats.length - 1]); vis.push(vis[vis.length - 1]); }
  // leading frames without a pose take the first pose (the engine holds the first key before it)
  const first = mats.findIndex(m => m);
  for (let f = 0; f < first; f++) mats[f] = mats[first];
  const oldVis = visState(r);
  r = fresh(r);
  r.bones.push(name);
  r = fresh(r);
  const nb = r.bones.length - 1;
  if (first >= 0) {
    if (!r.chunks.some(isFrame)) r = ensureChunks(r, [0]);
    r = fresh(r);
    for (const c of r.chunks) if (isFrame(c) && c.index >= 0 && c.index < r.frames) recFor(c, nb, true).matrix = Float32Array.from(mats[c.index]);
    r = fresh(r);
    // key the frames the engine would not reproduce until the track matches
    for (let pass = 0; pass <= r.frames; pass++) {
      const got = anm.boneTrack(r, nb), bad = [];
      for (let f = 0; f < r.frames; f++) if (!got[f] || got[f].some((v, k) => Math.abs(v - mats[f][k]) > 1e-5)) bad.push(f);
      if (!bad.length) break;
      r = fresh(ensureChunks(r, bad));
      for (const f of bad) setKey(r, f, nb, mats[f]);
      r = fresh(r);
    }
  }
  return fixVis(r, [...oldVis, vis]);
}

function renameBone(o, opt = {}) {
  need(o);
  const b = boneOf(o, opt.bone), name = nameArg(o, opt.name, b);
  const r = fresh(o);
  r.bones[b] = name;
  return fresh(r);
}

function resetBone(o, opt = {}) {
  need(o);
  const b = boneOf(o, opt.bone), tr = tracks(o);
  const M = matrixArg(opt.matrix) || tr[b][0];
  if (!M) fail(`bone ${o.bones[b]} has no pose; give a rest matrix`);
  if (opt.from !== undefined || opt.to !== undefined) {
    const [from, to] = rangeArg(o, opt);
    const D = new Set(seq(from, to));
    for (const f of D) tr[b][f] = M;
    return applyDense(o, tr, D, null);
  }
  let r = fresh(o.chunks.some(isFrame) ? o : ensureChunks(o, [0]));
  const fc = r.chunks.filter(isFrame);
  for (const c of fc) for (const x of c.recs) if (x.bone === b) x.matrix = null;
  recFor(fc[0], b, true).matrix = Float32Array.from(M);
  r = fresh(r);
  for (const c of r.chunks) if (isFrame(c)) c.recs = c.recs.filter(x => x.bone !== b || x.matrix || x.visible !== null || x.mesh);
  return fresh(r);
}

function addBone(o, opt = {}) {
  need(o);
  const name = nameArg(o, opt.name), M = matrixArg(opt.matrix) || identity();
  boneRoom(o, 1);
  let r = fresh(o.chunks.some(isFrame) ? o : ensureChunks(o, [0]));
  r.bones.push(name);
  recFor(r.chunks.find(isFrame), r.bones.length - 1, true).matrix = M;
  return fresh(r);
}

function removeBone(o, opt = {}) {
  need(o);
  const b = boneOf(o, opt.bone);
  if (o.bones.length < 2) fail('cannot remove the last bone');
  const r = fresh(o);
  for (const c of r.chunks) if (isFrame(c)) {
    c.recs = c.recs.filter(x => x.bone !== b);
    for (const x of c.recs) if (x.bone > b) x.bone--;
  }
  r.bones.splice(b, 1);
  return fresh(r);
}

function newAnimation(boneNames, frameCount, restMatrices, version = 0x60000) {
  if (!Array.isArray(boneNames) || !boneNames.length) fail('newAnimation needs at least one bone name');
  if (!VERSIONS.includes(version)) fail(`version 0x${Number(version).toString(16)} is not one of ${VERSIONS.map(v => '0x' + v.toString(16)).join(', ')}`);
  const frames = int(frameCount, 'frameCount', 1, 65535);
  const o = { version, frames, bones: [], chunks: [{ tag: 'EANM' }, { tag: 'FRMS' }, { tag: 'BMAP' }], frame: [], problems: [], error: null };
  for (const n of boneNames) o.bones.push(nameArg(o, n));
  boneRoom(o, 0);
  const kind = version >= 0x60000 ? 'FRM2' : 'FRMN';
  const c = { tag: kind, offset: null, size: null, index: 0, recs: [] };
  o.bones.forEach((_, b) => { const r = newRec(kind, b); r.matrix = matrixArg(restMatrices && restMatrices[b], `rest matrix ${b}`) || identity(); c.recs.push(r); });
  o.chunks.push(c);
  return fresh(o);
}

function setVisibility(o, opt = {}) {
  need(o);
  const b = boneOf(o, opt.bone), [from, to] = rangeArg(o, opt);
  if (typeof opt.visible !== 'boolean') fail('visible must be true or false');
  const want = visState(o);
  for (let f = from; f <= to; f++) want[b][f] = opt.visible;
  return fixVis(o, want);
}

function info(o) {
  if (!o || !Array.isArray(o.chunks)) fail('not an animation object');
  const fc = o.chunks.filter(isFrame), keyed = o.bones.map(() => 0), vis = [], kinds = {};
  for (const c of fc) {
    kinds[c.tag] = (kinds[c.tag] || 0) + 1;
    const seen = new Set();
    for (const r of c.recs) {
      if (r.bone < 0 || r.bone >= o.bones.length) continue;
      if (r.matrix && !seen.has(r.bone)) { keyed[r.bone]++; seen.add(r.bone); }
      if (r.visible !== null && r.visible !== undefined) vis.push({ bone: o.bones[r.bone], frame: c.index, visible: r.visible });
    }
  }
  return { version: o.version, versionHex: '0x' + (o.version >>> 0).toString(16), frames: o.frames, bones: o.bones.slice(), keyFrames: fc.length,
    chunkKinds: kinds, keyed: o.bones.map((n, i) => ({ bone: n, keys: keyed[i] })), visibility: vis, problems: (o.problems || []).slice(), readError: o.error || null };
}

function changes(a, b) {
  const out = [];
  if (anm.write(a).equals(anm.write(b))) return out;
  if (a.version !== b.version) out.push(`version 0x${a.version.toString(16)} -> 0x${b.version.toString(16)}`);
  const an = a.bones.join('\n'), bn = b.bones.join('\n');
  if (an !== bn) {
    const add = b.bones.filter(n => !a.bones.includes(n)), del = a.bones.filter(n => !b.bones.includes(n));
    if (add.length) out.push('bones added: ' + add.join(', '));
    if (del.length) out.push('bones removed: ' + del.join(', '));
    if (!add.length && !del.length) out.push('bone order changed');
  }
  if (a.frames !== b.frames) out.push(`frames ${a.frames} -> ${b.frames}`);
  if (a.frames === b.frames && an === bn) {
    const ta = tracks(a), tb = tracks(b), va = visState(a), vb = visState(b), fr = [];
    for (let f = 0; f < a.frames; f++) {
      let d = false;
      for (let k = 0; k < a.bones.length && !d; k++) {
        const x = ta[k][f], y = tb[k][f];
        if (!x !== !y || (x && x.some((v, i) => Math.abs(v - y[i]) > 1e-6)) || (va[k][f] === false) !== (vb[k][f] === false)) d = true;
      }
      if (d) fr.push(f);
    }
    for (let i = 0; i < fr.length;) { let j = i; while (j + 1 < fr.length && fr[j + 1] === fr[j] + 1) j++; out.push(i === j ? `frame ${fr[i]}` : `frames ${fr[i]}..${fr[j]}`); i = j + 1; }
    if (!out.length) out.push('key layout (poses unchanged)');
  }
  return out;
}

module.exports = {
  reverse: guard(reverse), fill: guard(fill), insertFrame: guard(insertFrame), deleteFrames: guard(deleteFrames),
  duplicateRange: guard(duplicateRange), moveRange: guard(moveRange), copyForward: guard(copyForward), dropFirstFrame: guard(dropFirstFrame),
  cloneBone: guard(cloneBone), exportBone: guard(exportBone), importBone: guard(importBone), renameBone: guard(renameBone),
  resetBone: guard(resetBone), addBone: guard(addBone), removeBone: guard(removeBone), newAnimation: guard(newAnimation),
  setVisibility: guard(setVisibility), info: guard(info), changes: guard(changes), isError, VERSIONS,
};

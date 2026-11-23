// model/edit/tree: the skeleton part of the built-in model editor (parity rows TREE-01..10, BONE-01..34; contract edit/README.md).
// Ops work on the .mdl text bytes: every byte outside an edited span is kept (comments, order, CRLF, number spelling of untouched
// lines); new numbers through mdl.fmtNum. Multi-step ops parse again between steps, so each step splices fresh spans.
// SOEdit source read for each op (upstream at 823d6de9, https://github.com/ThatFrostyy/SOEdit-PatchByFrostyy): OnBoneAdd/OnBoneInsert, OnBoneDelete
// ReplaceBoneName, ClipboardToCode_block, On_Bone_* copy/paste/cut/mesh/expand, OnBoneAddLod; WriteMdl; .
//
// Ops (args; every op throws a plain-words Error and changes nothing when it cannot run):
//   bone.add        { parent?: path|null, after?: path, name?, mesh?: 'x.ply', type?, position?: [3], matrix?: [12] }
//                   child of `parent` (last), or next sibling of `after`; no skeleton yet: {Skeleton {bone "basis"}} is made.
//                   Default name bone0, bone1 .. (SOEdit OnBoneAdd), or the mesh file name. info: { bone: path }
//   bone.delete     { bone, children?: true (whole branch) | false (children move up, keep their world place),
//                     volumes?: 'delete' (default) | 'parent' (re-bound to the surviving parent, world place kept) | 'keep' }
//   bone.rename     { bone, name, anm?: true }  volumes' {Bone "x"} follow; the animations of the document rename their track
//   bone.move       { bone, parent: path|null, index?: n (among the new parent's bones; default last), keepWorld?: true }
//   bone.up / bone.down { bone }                 one place among its sibling bones
//   bone.duplicate  { bone, branch?: true, volumes?: true }   copy placed as the next sibling, names get _0, _1 .. (ReplaceBoneName)
//   bone.paste      { bone, text, as: 'next'|'nested' }      text = {bone ..} blocks (bone.copy state); clashing names get _N
//   bone.setMatrix  { bone, matrix: [12], space?: 'local'|'world' }
//   bone.place      { bone, position?: [3], euler?: [yaw, pitch, roll] deg, scale?: [3], space?: 'local'|'world' }
//   bone.nudge      { bone, move?: [3] (parent axes), rotate?: [x, y, z] deg about its own axes, scale?: [3] }
//   bone.round      { bone }                     the 9 orientation cells rounded to whole numbers (position untouched)
//   bone.mirror     { bone, axis?: 'y'|'x'|'z' } placement mirrored across the parent's plane normal to `axis`
//   bone.set        { bone, type?, visibility?, params?, limits?, speed?, speed2?, color?, terminator? }  undefined = untouched,
//                   null = removed. type: 'none'|'revolute'|'prizmatic'|'socket'|'planarsocket'|'wild'
//   bone.mesh       { bone, lod?: n, file?: 'x.ply'|null (null removes the view), flags?: { NoCastShadows, NoGetShadows,
//                     NoGroupMesh, DecalTarget, Ground: bool }, layer?: value|null }
//   bone.lod.add    { bone, file }   bone.lod.remove { bone, index }   bone.lod.off { bone, on }
//   bone.seq.add    { bone: path|null (skeleton), name, file?, speed?, smooth?, autostart?, store?, resume? }
//   bone.seq.remove { bone, sequence }   bone.seq.set { bone, sequence, fields: { name, file, speed, smooth, autostart, store,
//                     resume, movement, pinback, rotate, duration } }   bone.seq.events.remove { bone, sequence }
// States:
//   tree.list(doc)               -> { mdl, error, bones: [{ path, name, parent, depth, kind, prefab, children, index, mesh, lods, lodOff,
//                                   volumes, flags, sequences, line }], volumes, obstacles, areas, skeleton }
//   bone.get(doc, { bone })      -> one bone's editable record: local and world matrix, position (units and metres), Euler degrees,
//                                   scale, type, flags, mesh, LOD entries, sequences, volumes, line
//   bone.copy(doc, { bone, branch }) -> { text }   the {bone ..} text the paste op takes (CRLF, no base indent)
// Euler angles: [yaw about Z, pitch about Y, roll about X] in degrees; the matrix is roll, then pitch, then yaw (row vectors,
// mdl.mul order). Scale = the lengths of the three axis rows; a mirrored matrix shows a negative Z scale.
// Author: Imperator_Aug (ARSENAL, ia-abc56ede)
'use strict';
const mdl = require('../mdl');
const sw = require('../../sdlwrite');
const anmLib = require('../anm');

const TYPES = ['revolute', 'prizmatic', 'socket', 'planarsocket', 'wild'];
const VIEW_FLAGS = ['NoCastShadows', 'NoGetShadows', 'NoGroupMesh', 'DecalTarget', 'Ground'];
const SEQ_FIELDS = { name: 'name', file: 'File', speed: 'Speed', smooth: 'Smooth', autostart: 'Autostart', store: 'Store', resume: 'Resume',
  movement: 'Movement', pinback: 'Pinback', rotate: 'Rotate', duration: 'Duration' };
const SEQ_FLAGS = new Set(['autostart', 'store', 'resume', 'movement']);
const D2R = Math.PI / 180;

// ---------- small helpers ----------
const isBlk = n => n && (n.type === 'block' || n.type === 'list');
const kw = n => (n.items[0] && n.items[0].type === 'atom') ? n.items[0].text.toLowerCase() : '';
const blocks = n => n.items.filter(isBlk);
const fail = msg => { throw new Error(msg); };
const lineStart = (src, p) => { while (p > 0 && src[p - 1] !== '\n' && src[p - 1] !== '\r') p--; return p; };
const lineIndent = (src, p) => /^[ \t]*/.exec(src.slice(lineStart(src, p)))[0];
const ownLine = (src, nd) => /^[ \t]*$/.test(src.slice(lineStart(src, nd.start), nd.start));
const eolOf = src => /\r\n/.test(src) ? '\r\n' : /\n/.test(src) ? '\n' : '\r\n';
function unitOf(src) {
  if (/\n\t/.test(src)) return '\t';
  let best = null; const re = /\n( +)\S/g; let x;
  while ((x = re.exec(src))) if (!best || x[1].length < best.length) best = x[1];
  return best || '\t';
}
const q = s => '"' + String(s) + '"';
const push = (t, start, end, text) => t.splices.push({ start, end, text });
function finish(t) {
  const sp = t.splices.slice().sort((a, b) => a.start - b.start || a.end - b.end);
  let pos = 0;
  for (const s of sp) { if (s.start < pos) fail('Two changes overlap in the model text; nothing was changed.'); pos = Math.max(pos, s.end); }
  return sw.serialize(t);
}
function parseOk(bytes) {
  const m = mdl.parse(bytes);
  if (m.error || !m.tree) fail('The model file cannot be read: ' + (m.error || 'empty'));
  return m;
}
function mdlOf(doc) {
  const rel = doc.mdl, f = rel && doc.files && doc.files.get(rel);
  if (!f) fail('This document has no model file (.mdl) open.');
  return { rel, bytes: Buffer.isBuffer(f.bytes) ? f.bytes : Buffer.from(f.bytes) };
}
function boneOf(m, ref, what) {
  if (ref === undefined || ref === null || ref === '') fail('Pick a bone first.');
  const r = String(ref).toLowerCase();
  const b = m.bones.find(x => x.path.toLowerCase() === r) || m.bones.find(x => x.name.toLowerCase() === r);
  if (!b) fail('There is no bone "' + ref + '"' + (what ? ' ' + what : '') + '.');
  return b;
}
const parentOf = (m, b) => b.parent === null ? null : m.bones.find(x => x.path === b.parent);
const boneKids = node => blocks(node).filter(c => kw(c) === 'bone');
const ownerNode = (m, b) => b.parent === null ? m.skeleton.node : parentOf(m, b).node;
const worldOf = (m, b) => mdl.worldMatrix(m, b.path);
const parentWorld = (m, b) => b.parent === null ? mdl.IDENTITY.slice() : mdl.worldMatrix(m, b.parent);
const descendants = (m, b) => m.bones.filter(x => x === b || x.path.startsWith(b.path + '/'));
function invOrFail(mx, what) { const r = mdl.invert(mx); if (!r) fail('The ' + what + ' matrix is flat (it has no inverse), so a world placement cannot be turned into a local one.'); return r; }
function nums(a, n, what) {
  if (!Array.isArray(a) || a.length !== n || !a.every(x => typeof x === 'number' && isFinite(x))) fail(what + ' needs ' + n + ' numbers.');
  return a.slice();
}

function checkName(m, name, except) {
  if (typeof name !== 'string' || !name.trim()) fail('A bone needs a name.');
  if (name !== name.trim()) fail('A bone name cannot start or end with a space.');
  if (/["\\/{}();=]/.test(name)) fail('A bone name cannot hold quotes, slashes, brackets, semicolons or the = sign.');
  if (/[^\x20-\x7e]/.test(name)) fail('A bone name can hold only plain latin letters, digits and signs.');
  if (name.includes('.')) fail('A bone name with a dot makes the game load another model file in its place; pick a name without a dot.');
  const l = name.toLowerCase();
  if (m.bones.some(b => b !== except && b.name.toLowerCase() === l)) fail('There is already a bone named "' + name + '".');
}
function freeName(taken, base, sep) {   // SOEdit: "%s%d" for new bones, "%s_%d" for pasted ones, counting from 0
  const has = n => taken.has(n.toLowerCase());
  if (sep !== null && !has(base)) return base;
  for (let i = 0; ; i++) { const n = base + (sep || '') + i; if (!has(n)) return n; }
}

// re-base the indentation of a block's text: the first line has none; later lines that start with `from` get `to` instead
function reindent(text, from, to, eol) {
  const lines = text.split(/\r\n|\n|\r/);
  return lines.map((l, i) => {
    if (i === 0) return l;
    if (/^[ \t]*$/.test(l)) return '';
    if (l.startsWith(from)) return to + l.slice(from.length);
    return to + l.replace(/^[ \t]*/, '');
  }).join(eol);
}
const nodeText = (src, nd) => src.slice(nd.start, nd.end);
// indent for a new child of `parent` (a bone, the skeleton or the Animation/LODView block)
function kidIndent(src, parent, u) {
  const own = blocks(parent).find(c => ownLine(src, c));
  return own ? lineIndent(src, own.start) : lineIndent(src, parent.start) + u;
}
// insert block text (first line unindented, later lines already at `ind`) into `parent` before items[index] (or at the end)
function insertBlock(t, parent, index, text, ind, eol) {
  const src = t.src, its = parent.items, ref = its[index];
  if (ref && ownLine(src, ref)) { const p = lineStart(src, ref.start); push(t, p, p, ind + text + eol); return; }
  if (ref) { push(t, ref.start, ref.start, text + ' '); return; }
  if (parent.root) {
    if (!src.length) { push(t, 0, 0, text + eol); return; }
    push(t, src.length, src.length, (/[\r\n]$/.test(src) ? '' : eol) + text + eol); return;
  }
  const cs = parent.closeStart, cls = lineStart(src, cs);
  if (/^[ \t]*$/.test(src.slice(cls, cs)) && cls > parent.start) { push(t, cls, cls, ind + text + eol); return; }
  push(t, cs, cs, eol + ind + text + eol + lineIndent(src, parent.start));
}
// lines of a multi-line block: head line, inner lines (already without indent), closer
function blockLines(head, inner, ind, u, eol) {
  if (!inner.length) return head + '}';
  return head + eol + inner.map(l => ind + u + l).join(eol) + eol + ind + '}';
}
function placementLines(mx) {
  if (!mx) return [];
  const R = mx.slice(0, 9), T = mx.slice(9, 12), f = a => a.map(mdl.fmtNum).join('\t');
  const idR = R.every((x, i) => Math.fround(x) === mdl.IDENTITY[i]), zT = T.every(x => x === 0);
  if (idR && zT) return [];
  if (idR) return ['{Position ' + f(T) + '}'];
  return ['{Matrix34', '\t' + f(R.slice(0, 3)), '\t' + f(R.slice(3, 6)), '\t' + f(R.slice(6, 9)), '\t' + f(T), '}'];
}
function boneWord(m) { const b = m.bones[0]; return b ? b.node.items[0].text : 'Bone'; }

// ---------- matrices and Euler angles ----------
function rotEuler(e) {
  const [y, p, r] = e.map(x => x * D2R), cy = Math.cos(y), sy = Math.sin(y), cp = Math.cos(p), sp = Math.sin(p), cr = Math.cos(r), sr = Math.sin(r);
  return [cp * cy, cp * sy, -sp, sr * sp * cy - cr * sy, sr * sp * sy + cr * cy, sr * cp, cr * sp * cy + sr * sy, cr * sp * sy - sr * cy, cr * cp];
}
const clean = x => Math.abs(x) < 1e-9 ? 0 : x;
const cleanDeg = x => { const r = Math.round(x * 1e6) / 1e6; return Object.is(r, -0) ? 0 : r; };
function decompose(mx) {
  const rows = [mx.slice(0, 3), mx.slice(3, 6), mx.slice(6, 9)];
  const len = v => Math.hypot(v[0], v[1], v[2]);
  const s = rows.map(len);
  const det = mx[0] * (mx[4] * mx[8] - mx[5] * mx[7]) - mx[1] * (mx[3] * mx[8] - mx[5] * mx[6]) + mx[2] * (mx[3] * mx[7] - mx[4] * mx[6]);
  if (det < 0) s[2] = -s[2];
  const n = [].concat(...rows.map((r, i) => r.map(x => s[i] ? x / s[i] : 0)));
  const sp = Math.max(-1, Math.min(1, -n[2])), pitch = Math.asin(sp);
  let yaw, roll;
  if (Math.abs(Math.cos(pitch)) > 1e-6) { yaw = Math.atan2(n[1], n[0]); roll = Math.atan2(n[5], n[8]); }
  else { roll = 0; yaw = Math.atan2(-n[3], n[4]); }
  return { euler: [yaw, pitch, roll].map(x => cleanDeg(x / D2R)), scale: s.map(x => cleanDeg(x)), position: mx.slice(9, 12).map(clean), mirrored: det < 0, flat: !det };
}
function compose(position, euler, scale) {
  const R = rotEuler(euler), s = scale || [1, 1, 1];
  return R.map((x, i) => clean(x * s[Math.floor(i / 3)])).concat(position.slice());
}
const toLocal = (m, b, world) => b.parent === null ? world.slice() : mdl.mul(world, invOrFail(parentWorld(m, b), 'parent bone'));

// ---------- document plumbing ----------
function result(rel, bytes, info) {
  const chk = mdl.parse(bytes);
  if (chk.error) fail('The change would leave the model unreadable (' + chk.error + '); nothing was changed.');
  return { files: { [rel]: bytes }, info: info || {} };
}
function setMatrixBytes(bytes, path, mx) { const m = parseOk(bytes); return mdl.edit(m, [{ op: 'setMatrix', bone: path, matrix: mx }]); }

// ---------- ops ----------
function opAdd(doc, a) {
  const { rel, bytes } = mdlOf(doc), m = parseOk(bytes), t = m.tree, src = t.src, eol = eolOf(src), u = unitOf(src);
  const taken = new Set(m.bones.map(b => b.name.toLowerCase()));
  let name = a.name;
  if (name === undefined || name === null || name === '') {
    if (a.mesh) name = freeName(taken, String(a.mesh).replace(/^.*[\\/]/, '').replace(/\.[^.]*$/, '').replace(/[^\x21-\x7e]|["\\/{}();=.]/g, '_') || 'bone', '');
    else name = m.skeleton && m.bones.length ? freeName(taken, 'bone', null) : 'basis';
  }
  checkName(m, name);
  let type = a.type && a.type !== 'none' ? String(a.type).toLowerCase() : null;
  if (type && !TYPES.includes(type)) fail('Unknown joint type "' + a.type + '".');
  let mx = null;
  if (a.matrix) mx = nums(a.matrix, 12, 'A matrix');
  else if (a.position) mx = mdl.IDENTITY.slice(0, 9).concat(nums(a.position, 3, 'A position'));
  const inner = placementLines(mx).map(l => l.replace(/^\t/, u));
  if (a.mesh) inner.push('{VolumeView ' + q(a.mesh) + '}');
  if (!m.skeleton) {
    const ind = '';
    const boneTxt = blockLines('{Bone ' + (type ? type + ' ' : '') + q(name), inner, u, u, eol);
    const text = '{Skeleton' + eol + u + boneTxt + eol + '}';
    const first = t.root.items.findIndex(isBlk);
    insertBlock(t, t.root, first < 0 ? t.root.items.length : first, text, ind, eol);
    return result(rel, finish(t), { bone: name });
  }
  let parent, index, parentPath;
  if (a.after !== undefined && a.after !== null) {
    const sib = boneOf(m, a.after);
    parent = ownerNode(m, sib); index = parent.items.indexOf(sib.node) + 1; parentPath = sib.parent;
  } else if (a.parent !== undefined && a.parent !== null) {
    const pb = boneOf(m, a.parent); parent = pb.node; index = parent.items.length; parentPath = pb.path;
  } else { parent = m.skeleton.node; index = parent.items.length; parentPath = null; }
  const ind = kidIndent(src, parent, u);
  const text = blockLines('{' + boneWord(m) + ' ' + (type ? type + ' ' : '') + q(name), inner, ind, u, eol);
  insertBlock(t, parent, index, text, ind, eol);
  return result(rel, finish(t), { bone: parentPath ? parentPath + '/' + name : name });
}

function opDelete(doc, a) {
  const { rel } = mdlOf(doc); let { bytes } = mdlOf(doc);
  let m = parseOk(bytes);
  const b = boneOf(m, a.bone);
  if (b.parent === null && m.bones.filter(x => x.depth === 0).length === 1) fail('The root bone holds the whole skeleton and cannot be deleted.');
  const branch = a.children !== false;
  const gone = branch ? descendants(m, b) : [b];
  const gonePaths = new Set(gone.map(x => x.path));
  const vmode = a.volumes || 'delete';
  if (!['delete', 'parent', 'keep'].includes(vmode)) fail('Volumes of a deleted bone can be deleted, moved to the parent bone or kept.');
  const vols = m.volumes.filter(v => v.bone && gonePaths.has(v.bone));
  const info = { removed: gone.map(x => x.path), volumes: { deleted: [], moved: [], kept: [] }, sequences: [] };
  for (const x of gone) for (const s of x.sequences) info.sequences.push(s.name);
  // step 1: matrices that must change (children lifted, volumes moved) and volume edits
  const ch = [];
  const surv = parentOf(m, b);
  if (!branch) for (const cp of b.children) { const c = m.bones.find(x => x.path === cp); ch.push({ op: 'setMatrix', bone: c.path, matrix: mdl.mul(c.matrix, b.matrix) }); }
  if (vmode === 'parent') {
    const sw0 = surv ? worldOf(m, surv) : mdl.IDENTITY.slice(), inv = invOrFail(sw0, 'parent bone');
    for (const v of vols) {
      ch.push({ op: 'setVolume', volume: v.id, matrix: mdl.mul(mdl.mul(v.matrix, worldOf(m, m.bones.find(x => x.path === v.bone))), inv) });
      if (v.boneNode) ch.push({ op: 'setKey', volume: v.id, key: 'Bone', value: surv.name });
      info.volumes.moved.push(v.name);
    }
  }
  if (ch.length) { bytes = mdl.edit(m, ch); m = parseOk(bytes); }
  // step 2: text moves
  const t = m.tree, src = t.src, eol = eolOf(src);
  const bb = m.bones.find(x => x.path === b.path);
  if (!branch) {
    const ind = lineIndent(src, bb.node.start), parent = bb.node.parent, at = parent.items.indexOf(bb.node);
    for (const k of boneKids(bb.node)) {
      const txt = reindent(nodeText(src, k), lineIndent(src, k.start), ind, eol);
      if (ownLine(src, bb.node)) { const p = lineStart(src, bb.node.start); push(t, p, p, ind + txt + eol); }
      else insertBlock(t, parent, at, txt, ind, eol);
    }
  }
  sw.removeNode(bb.node);
  if (vmode === 'delete') for (const v of m.volumes.filter(v => v.bone && gonePaths.has(v.bone))) { sw.removeNode(v.node); info.volumes.deleted.push(v.name); }
  if (vmode === 'keep') for (const v of vols) info.volumes.kept.push(v.name);
  return result(rel, finish(t), info);
}

function opRename(doc, a) {
  const { rel, bytes } = mdlOf(doc), m = parseOk(bytes), b = boneOf(m, a.bone);
  if (a.name === b.name) return { files: {}, info: { bone: b.path } };
  checkName(m, a.name, b);
  if (b.file) fail('This bone loads another model file; its name is that file and is changed in the file name, not here.');
  const out = { [rel]: mdl.edit(m, [{ op: 'rename', bone: b.path, name: a.name }]) };
  result(rel, out[rel]);
  const info = { bone: (b.parent ? b.parent + '/' : '') + a.name, volumes: b.volumes.length, anm: [], defMentions: [] };
  if (a.anm !== false) for (const f of doc.files.values()) {
    if (f.kind !== 'anm' || !f.bytes) continue;
    const o = anmLib.parse(f.bytes);
    if (o.error) continue;
    const i = o.bones.findIndex(n => n.toLowerCase() === b.name.toLowerCase());
    if (i < 0) continue;
    if (o.bones.some((n, j) => j !== i && n.toLowerCase() === a.name.toLowerCase())) continue;
    o.bones[i] = a.name;
    out[f.rel] = anmLib.write(o); info.anm.push(f.rel);
  }
  for (const f of doc.files.values()) {
    if (f.kind !== 'def' || !f.bytes) continue;
    const s = f.bytes.toString('latin1'), needle = '"' + b.name.toLowerCase() + '"';
    s.split(/\r\n|\n/).forEach((l, i) => { if (l.toLowerCase().includes(needle)) info.defMentions.push({ rel: f.rel, line: i + 1 }); });
  }
  return { files: out, info };
}

// move bone `b` (path) under parentPath (null = top) at `index` among that parent's other bones
function moveBytes(bytes, path, parentPath, index, keepWorld) {
  let m = parseOk(bytes);
  let b = m.bones.find(x => x.path === path);
  const sameParent = b.parent === parentPath;
  if (!sameParent && keepWorld !== false) {
    const w = worldOf(m, b);
    const pw = parentPath === null ? mdl.IDENTITY.slice() : mdl.worldMatrix(m, parentPath);
    bytes = setMatrixBytes(bytes, b.path, mdl.mul(w, invOrFail(pw, 'new parent bone')));
    m = parseOk(bytes); b = m.bones.find(x => x.path === path);
  }
  const t = m.tree, src = t.src, eol = eolOf(src), u = unitOf(src);
  const pnode = parentPath === null ? m.skeleton.node : m.bones.find(x => x.path === parentPath).node;
  const others = boneKids(pnode).filter(k => k !== b.node);
  const i = index === undefined || index === null || index < 0 || index > others.length ? others.length : index;
  if (sameParent) { const cur = boneKids(pnode).indexOf(b.node); if (cur === i) return null; }
  const ref = others[i];
  let at;
  if (ref) at = pnode.items.indexOf(ref);
  else { const last = others[others.length - 1]; at = last ? pnode.items.indexOf(last) + 1 : pnode.items.length; if (pnode.items[at] === b.node) at++; }
  const sib = blocks(pnode).find(c => c !== b.node && ownLine(src, c));
  const ind = sib ? lineIndent(src, sib.start) : lineIndent(src, pnode.start) + u;
  const txt = reindent(nodeText(src, b.node), lineIndent(src, b.node.start), ind, eol);
  insertBlock(t, pnode, at, txt, ind, eol);
  sw.removeNode(b.node);
  return finish(t);
}
function opMove(doc, a) {
  const { rel, bytes } = mdlOf(doc), m = parseOk(bytes), b = boneOf(m, a.bone);
  let pp = null;
  if (a.parent !== undefined && a.parent !== null && a.parent !== '') {
    const p = boneOf(m, a.parent, 'to move to');
    if (p === b || p.path.startsWith(b.path + '/')) fail('A bone cannot be moved inside itself or one of its own children.');
    pp = p.path;
  }
  if (b.parent === null && pp !== null && m.bones.filter(x => x.depth === 0).length === 1) fail('The root bone holds the whole skeleton and cannot be moved under another bone.');
  const out = moveBytes(bytes, b.path, pp, a.index, a.keepWorld);
  const info = { bone: (pp ? pp + '/' : '') + b.name };
  if (!out) return { files: {}, info: Object.assign(info, { unchanged: true }) };
  return result(rel, out, info);
}
function opStep(dir) {
  return function (doc, a) {
    const { rel, bytes } = mdlOf(doc), m = parseOk(bytes), b = boneOf(m, a.bone);
    const pnode = ownerNode(m, b), kids = boneKids(pnode), i = kids.indexOf(b.node);
    if (dir < 0 && i <= 0) fail('This bone is already the first among its siblings.');
    if (dir > 0 && i >= kids.length - 1) fail('This bone is already the last among its siblings.');
    return result(rel, moveBytes(bytes, b.path, b.parent, i + dir, false), { bone: b.path });
  };
}

// a fragment of bone blocks: rename every bone in it through `rename(oldName) -> newName`, optionally drop child bones
function fragment(text, rename, dropKids) {
  const pre = '{Skeleton\r\n', post = '\r\n}\r\n';
  const fm = mdl.parse(Buffer.from(pre + text + post, 'latin1'));
  if (fm.error) fail('This text is not a bone block: ' + fm.error);
  let bytes = fm.bytes;
  if (dropKids) {
    const top = fm.bones.find(x => x.depth === 0);
    for (const k of boneKids(top.node)) sw.removeNode(k.node || k);
    bytes = finish(fm.tree);
  }
  const m2 = mdl.parse(bytes);
  const ch = [];
  for (const b of m2.bones) { const n = rename(b.name); if (n !== b.name) ch.push({ op: 'rename', bone: b.path, name: n, refs: false }); }
  // rename deepest first so earlier renames do not change the paths of later ones
  ch.sort((x, y) => y.bone.split('/').length - x.bone.split('/').length);
  let cur = bytes;
  for (const c of ch) cur = mdl.edit(mdl.parse(cur), [c]);
  const s = cur.toString('latin1');
  return s.slice(pre.length, s.length - post.length);
}
function opDuplicate(doc, a) {
  const { rel, bytes } = mdlOf(doc), m = parseOk(bytes), b = boneOf(m, a.bone);
  if (b.parent === null && m.bones.filter(x => x.depth === 0).length === 1) fail('The root bone cannot be copied next to itself; a skeleton has one root.');
  const t = m.tree, src = t.src, eol = eolOf(src);
  const taken = new Set(m.bones.map(x => x.name.toLowerCase())), map = {};
  const ren = n => { const nn = n.includes('.') ? n : freeName(taken, n, '_'); taken.add(nn.toLowerCase()); map[n] = nn; return nn; };
  const ind = lineIndent(src, b.node.start);
  const base = reindent(nodeText(src, b.node), ind, ind, '\r\n');
  let txt = fragment(base, ren, a.branch === false);
  txt = reindent(txt, ind, ind, eol);
  const pnode = b.node.parent;
  insertBlock(t, pnode, pnode.items.indexOf(b.node) + 1, txt, ind, eol);
  const info = { bone: (b.parent ? b.parent + '/' : '') + map[b.name], names: map, volumes: [] };
  if (a.volumes !== false) {
    const copied = new Set((a.branch === false ? [b] : descendants(m, b)).map(x => x.path));
    const vtaken = new Set(m.volumes.map(v => v.name.toLowerCase()));
    for (const v of m.volumes) {
      if (!v.bone || !copied.has(v.bone) || !v.boneNode) continue;
      const bn = m.bones.find(x => x.path === v.bone).name;
      const vn = freeName(vtaken, v.name, '_'); vtaken.add(vn.toLowerCase());
      const vm = mdl.parse(Buffer.from(nodeText(src, v.node), 'latin1'));
      let vt = mdl.edit(vm, [{ op: 'rename', volume: vm.volumes[0].id, name: vn }, { op: 'setKey', volume: vm.volumes[0].id, key: 'Bone', value: map[bn] }]).toString('latin1');
      vt = reindent(vt, '', '', eol);
      insertBlock(t, t.root, t.root.items.indexOf(v.node) + 1, vt, lineIndent(src, v.node.start), eol);
      info.volumes.push(vn);
    }
  }
  return result(rel, finish(t), info);
}
function opPaste(doc, a) {
  const { rel, bytes } = mdlOf(doc), m = parseOk(bytes), b = boneOf(m, a.bone);
  const text = typeof a.text === 'string' ? a.text.replace(/^\uFEFF/, '').trim() : '';
  if (!text) fail('There is nothing to paste; copy a bone first.');
  if (/[^\x00-\xff]/.test(text)) fail('The pasted text has letters the model file cannot hold.');
  const fm = mdl.parse(Buffer.from('{Skeleton\r\n' + text + '\r\n}\r\n', 'latin1'));
  if (fm.error) fail('The pasted text is not a bone block: ' + fm.error);
  const tops = fm.skeleton ? blocks(fm.skeleton.node) : [];
  if (!tops.length || tops.some(c => kw(c) !== 'bone') || (fm.skeleton && fm.skeleton.node.items.slice(1).some(x => !isBlk(x))) || fm.root.items.length !== 1) fail('The pasted text must be one or more {bone ..} blocks and nothing else.');
  const as = a.as === 'nested' ? 'nested' : a.as === 'next' || a.as === undefined ? 'next' : fail('Paste goes next to the bone or inside it.');
  if (as === 'next' && b.parent === null && m.bones.filter(x => x.depth === 0).length === 1) fail('A skeleton has one root bone; paste inside it instead.');
  const taken = new Set(m.bones.map(x => x.name.toLowerCase())), map = {};
  const ren = n => { const nn = n.includes('.') ? n : freeName(taken, n, '_'); taken.add(nn.toLowerCase()); map[n] = nn; return nn; };
  for (const x of fm.bones) if (!x.file) { if (/[^\x20-\x7e]|["\\/{}();=]/.test(x.name) || !x.name.trim()) fail('A pasted bone has a name the game cannot use: "' + x.name + '".'); }
  const fsrc = fm.tree.src;
  const t = m.tree, src = t.src, eol = eolOf(src), u = unitOf(src);
  let pnode, at;
  if (as === 'next') { pnode = b.node.parent; at = pnode.items.indexOf(b.node) + 1; }
  else { pnode = b.node; at = pnode.items.length; }
  const ind = as === 'next' ? lineIndent(src, b.node.start) : kidIndent(src, pnode, u);
  const added = [];
  // one fragment per top bone, renamed against the model and the bones pasted before it
  const pieces = tops.map(nd => reindent(nodeText(fsrc, nd), lineIndent(fsrc, nd.start), '', '\r\n'));
  pieces.forEach(p => {
    const txt = reindent(fragment(p, ren, false), '', ind, eol);
    insertBlock(t, pnode, at, txt, ind, eol);
  });
  for (const nd of tops) { const nm = fm.bones.find(x => x.node === nd).name; added.push(((as === 'next' ? b.parent : b.path) ? (as === 'next' ? b.parent : b.path) + '/' : '') + map[nm]); }
  return result(rel, finish(t), { bones: added, names: map });
}

function opSetMatrix(doc, a) {
  const { rel, bytes } = mdlOf(doc), m = parseOk(bytes), b = boneOf(m, a.bone);
  let mx = nums(a.matrix, 12, 'A bone matrix');
  if (a.space === 'world') mx = toLocal(m, b, mx);
  return result(rel, mdl.edit(m, [{ op: 'setMatrix', bone: b.path, matrix: mx }]), { bone: b.path });
}
function opPlace(doc, a) {
  const { rel, bytes } = mdlOf(doc), m = parseOk(bytes), b = boneOf(m, a.bone);
  const world = a.space === 'world', cur = world ? worldOf(m, b) : b.matrix.slice(), d = decompose(cur);
  const pos = a.position ? nums(a.position, 3, 'A position') : cur.slice(9, 12);
  let mx;
  if (a.euler || a.scale) mx = compose(pos, a.euler ? nums(a.euler, 3, 'Angles') : d.euler, a.scale ? nums(a.scale, 3, 'A scale') : d.scale);
  else mx = cur.slice(0, 9).concat(pos);
  if (a.scale && a.scale.some(x => x === 0)) fail('A scale of 0 flattens the bone; use a small number instead.');
  if (world) mx = toLocal(m, b, mx);
  return result(rel, mdl.edit(m, [{ op: 'setMatrix', bone: b.path, matrix: mx }]), { bone: b.path });
}
function opNudge(doc, a) {
  const { rel, bytes } = mdlOf(doc), m = parseOk(bytes), b = boneOf(m, a.bone);
  let mx = b.matrix.slice();
  if (a.scale) { const s = nums(a.scale, 3, 'A scale'); if (s.some(x => x === 0)) fail('A scale of 0 flattens the bone; use a small number instead.'); mx = mx.map((x, i) => i < 9 ? x * s[Math.floor(i / 3)] : x); }
  if (a.rotate) {
    const r = nums(a.rotate, 3, 'A turn'), rx = rotEuler([0, 0, r[0]]), ry = rotEuler([0, r[1], 0]), rz = rotEuler([r[2], 0, 0]);
    const R = mdl.mul(mdl.mul(mdl.mul(rx.concat([0, 0, 0]), ry.concat([0, 0, 0])), rz.concat([0, 0, 0])), mx.slice(0, 9).concat([0, 0, 0]));
    mx = R.slice(0, 9).map(clean).concat(mx.slice(9, 12));
  }
  if (a.move) { const d = nums(a.move, 3, 'A move'); mx[9] += d[0]; mx[10] += d[1]; mx[11] += d[2]; }
  return result(rel, mdl.edit(m, [{ op: 'setMatrix', bone: b.path, matrix: mx }]), { bone: b.path });
}
function opRound(doc, a) {
  const { rel, bytes } = mdlOf(doc), m = parseOk(bytes), b = boneOf(m, a.bone);
  const mx = b.matrix.map((x, i) => i < 9 ? Math.round(x) + 0 : x);
  return result(rel, mdl.edit(m, [{ op: 'setMatrix', bone: b.path, matrix: mx }]), { bone: b.path });
}
function opMirror(doc, a) {
  const { rel, bytes } = mdlOf(doc), m = parseOk(bytes), b = boneOf(m, a.bone);
  const ax = { x: 0, y: 1, z: 2 }[a.axis || 'y'];
  if (ax === undefined) fail('Mirror across x, y or z.');
  const S = [1, 1, 1]; S[ax] = -1;
  // M' = S M S: row i times S[i], column j times S[j]
  const mx = b.matrix.map((x, i) => i < 9 ? x * S[Math.floor(i / 3)] * S[i % 3] : x * S[i - 9]).map(x => Object.is(x, -0) ? 0 : x);
  return result(rel, mdl.edit(m, [{ op: 'setMatrix', bone: b.path, matrix: mx }]), { bone: b.path });
}

function colorRaw(c) {
  if (typeof c === 'number' && isFinite(c) && c >= 0) return '0x' + Math.floor(c).toString(16);
  const s = String(c).trim();
  let x = /^#([0-9a-f]{6})$/i.exec(s); if (x) return '0x' + parseInt(x[1], 16).toString(16);
  x = /^0x([0-9a-f]{1,8})$/i.exec(s); if (x) return '0x' + x[1].toLowerCase();
  fail('A colour is written as #rrggbb.');
}
function opSet(doc, a) {
  const { rel } = mdlOf(doc); let { bytes } = mdlOf(doc);
  let m = parseOk(bytes), b = boneOf(m, a.bone);
  const known = new Set(['bone', 'type', 'visibility', 'params', 'limits', 'speed', 'speed2', 'color', 'terminator']);
  for (const k of Object.keys(a)) if (!known.has(k)) fail('Unknown bone field "' + k + '".');
  const info = { bone: b.path, removed: [] };
  let type = b.type ? b.type.toLowerCase() : null;
  if (a.type !== undefined) {
    const nt = a.type === null || a.type === 'none' || a.type === '' ? null : String(a.type).toLowerCase();
    if (nt && !TYPES.includes(nt)) fail('Unknown joint type "' + a.type + '".');
    if (nt !== type) {
      if (b.file) fail('This bone loads another model file; its joint type comes from that file.');
      const t = m.tree, hdr = b.node.items.find(x => x.type === 'atom' && TYPES.includes(x.text.toLowerCase()) && b.node.items.indexOf(x) > 0 && !isBlk(x));
      if (hdr && nt) push(t, hdr.start, hdr.end, nt);
      else if (hdr) { let s = hdr.start; while (s > 0 && (t.src[s - 1] === ' ' || t.src[s - 1] === '\t')) s--; push(t, s, hdr.end, ''); }
      else { const k0 = b.node.items[0]; push(t, k0.end, k0.end, ' ' + nt); }
      bytes = finish(t); m = parseOk(bytes); b = m.bones.find(x => x.path === b.path); type = nt;
    }
  }
  const ch = [];
  const bp = b.path;
  if (a.visibility !== undefined) {
    if (a.visibility !== null && !(Number.isInteger(a.visibility) && a.visibility >= 0)) fail('Visibility is a whole number, or left out.');
    ch.push({ op: 'setKey', bone: bp, key: 'Visibility', value: a.visibility });
  }
  if (a.params !== undefined) {
    if (a.params === null || a.params === '') ch.push({ op: 'setKey', bone: bp, key: 'Parameters', value: null });
    else { const p = String(a.params).replace(/^"/, ''); if (/["\r\n]/.test(p)) fail('Parameters cannot hold quotes or line breaks.'); ch.push({ op: 'setKey', bone: bp, key: 'Parameters', value: p }); }
  }
  const needJoint = what => { if (!type) fail(what + ' works only on a joint (revolute, prizmatic, socket ..); a plain bone with it stops the game loading the model.'); };
  if (a.limits !== undefined) {
    if (a.limits === null) ch.push({ op: 'setKey', bone: bp, key: 'Limits', value: null });
    else { needJoint('Limits'); if (!Array.isArray(a.limits) || a.limits.length < 1 || a.limits.length > 2 || !a.limits.every(x => typeof x === 'number' && isFinite(x))) fail('Limits are one or two numbers in degrees.'); ch.push({ op: 'setKey', bone: bp, key: 'Limits', value: a.limits.length === 1 ? a.limits[0] : a.limits }); }
  }
  for (const k of ['speed', 'speed2']) if (a[k] !== undefined) {
    const K = k === 'speed' ? 'Speed' : 'Speed2';
    if (a[k] === null) ch.push({ op: 'setKey', bone: bp, key: K, value: null });
    else { needJoint(K); if (typeof a[k] !== 'number' || !isFinite(a[k])) fail(K + ' is a number.'); if (a[k] === 0) fail('A speed of 0 stops the game loading the model ("Zero speed in ik-bone").'); ch.push({ op: 'setKey', bone: bp, key: K, value: a[k] }); }
  }
  if (!type && a.type !== undefined) for (const [k, K] of [['limits', 'Limits'], ['speed', 'Speed'], ['speed2', 'Speed2']]) {
    if (a[k] === undefined && b[k === 'limits' ? 'limits' : k] !== null) { ch.push({ op: 'setKey', bone: bp, key: K, value: null }); info.removed.push(K); }
  }
  if (a.color !== undefined) ch.push({ op: 'setKey', bone: bp, key: 'Color', value: a.color === null || a.color === '' ? null : { raw: colorRaw(a.color) } });
  if (a.terminator !== undefined) ch.push({ op: a.terminator ? 'addFlag' : 'removeFlag', bone: bp, flag: 'Terminator' });
  if (ch.length) bytes = mdl.edit(m, ch);
  return result(rel, bytes, info);
}

// the view a mesh op works on: the bone's plain view, or LOD entry `lod`
function viewNode(b, lod) {
  if (lod !== undefined && lod !== null) {
    const L = b.views.find(v => v.kind === 'LODView');
    if (!L || !L.lods[lod]) fail('This bone has no level of detail number ' + lod + '.');
    return { node: L.lods[lod].node, lodNode: L.node };
  }
  const v = b.views.find(x => x.kind !== 'LODView');
  return v ? { node: v.node } : null;
}
function opMesh(doc, a) {
  const { rel, bytes } = mdlOf(doc), m = parseOk(bytes), b = boneOf(m, a.bone);
  const t = m.tree, src = t.src, eol = eolOf(src), u = unitOf(src);
  const v = viewNode(b, a.lod);
  if (a.file === null) {
    if (!v) fail('This bone has no mesh.');
    if (v.lodNode && blocks(v.lodNode).filter(x => kw(x) !== 'off').length === 1) sw.removeNode(v.lodNode);
    else sw.removeNode(v.node);
    return result(rel, finish(t), { bone: b.path, removed: true });
  }
  if (a.file !== undefined && (typeof a.file !== 'string' || !a.file.trim() || /["\r\n]/.test(a.file))) fail('Pick a mesh file (.ply).');
  if (!v) {
    if (a.file === undefined) fail('This bone has no mesh; pick a mesh file first.');
    const extra = [];
    for (const f of VIEW_FLAGS) if (a.flags && a.flags[f]) extra.push('{' + f + '}');
    if (a.layer !== undefined && a.layer !== null) extra.push('{Layer ' + a.layer + '}');
    const txt = '{VolumeView ' + q(a.file) + (extra.length ? ' ' + extra.join(' ') : '') + '}';
    const kids = b.node.items.findIndex(x => isBlk(x) && (kw(x) === 'bone'));
    insertBlock(t, b.node, kids < 0 ? b.node.items.length : kids, txt, kidIndent(src, b.node, u), eol);
    return result(rel, finish(t), { bone: b.path });
  }
  const vn = v.node;
  if (a.file !== undefined) {
    const s = vn.items.find((x, i) => i > 0 && x.type === 'string');
    if (s) { if (s.text !== q(a.file)) push(t, s.start, s.end, q(a.file)); }
    else push(t, vn.items[0].end, vn.items[0].end, ' ' + q(a.file));
  }
  const addIn = txt => push(t, vn.closeStart, vn.closeStart, ' ' + txt);
  if (a.flags) for (const [f, on] of Object.entries(a.flags)) {
    const F = VIEW_FLAGS.find(x => x.toLowerCase() === f.toLowerCase());
    if (!F) fail('Unknown mesh setting "' + f + '".');
    const has = blocks(vn).filter(x => kw(x) === F.toLowerCase());
    if (on && !has.length) addIn('{' + F + '}');
    if (!on) for (const h of has) sw.removeNode(h);
  }
  if (a.layer !== undefined) {
    const has = blocks(vn).filter(x => kw(x) === 'layer');
    for (const h of has) sw.removeNode(h);
    if (a.layer !== null && a.layer !== '') {
      if (!/^[A-Za-z0-9_-]+$/.test(String(a.layer))) fail('A layer is a number or a single word.');
      addIn('{Layer ' + a.layer + '}');
    }
  }
  return result(rel, finish(t), { bone: b.path });
}
function opLodAdd(doc, a) {
  const { rel, bytes } = mdlOf(doc), m = parseOk(bytes), b = boneOf(m, a.bone);
  if (typeof a.file !== 'string' || !a.file.trim() || /["\r\n]/.test(a.file)) fail('Pick a mesh file (.ply) for the new level of detail.');
  const t = m.tree, src = t.src, eol = eolOf(src), u = unitOf(src);
  const L = b.views.find(v => v.kind === 'LODView'), entry = '{VolumeView ' + q(a.file) + '}';
  if (L) {
    const off = L.node.items.findIndex(x => isBlk(x) && kw(x) === 'off');
    insertBlock(t, L.node, off < 0 ? L.node.items.length : off, entry, kidIndent(src, L.node, u), eol);
    return result(rel, finish(t), { bone: b.path, index: L.lods.length });
  }
  const v = b.views.find(x => x.kind !== 'LODView');
  if (v) {
    const own = ownLine(src, v.node), ind = own ? lineIndent(src, v.node.start) : '';
    const old = nodeText(src, v.node);
    const txt = own ? '{LODView' + eol + ind + u + old + eol + ind + u + entry + eol + ind + '}' : '{LODView ' + old + ' ' + entry + '}';
    push(t, v.node.start, v.node.end, txt);
    return result(rel, finish(t), { bone: b.path, index: 1 });
  }
  const ind = kidIndent(src, b.node, u), kids = b.node.items.findIndex(x => isBlk(x) && kw(x) === 'bone');
  insertBlock(t, b.node, kids < 0 ? b.node.items.length : kids, '{LODView' + eol + ind + u + entry + eol + ind + '}', ind, eol);
  return result(rel, finish(t), { bone: b.path, index: 0 });
}
function opLodRemove(doc, a) {
  const { rel, bytes } = mdlOf(doc), m = parseOk(bytes), b = boneOf(m, a.bone);
  const L = b.views.find(v => v.kind === 'LODView');
  if (!L || !L.lods[a.index]) fail('This bone has no level of detail number ' + a.index + '.');
  const t = m.tree;
  if (L.lods.length === 1) sw.removeNode(L.node); else sw.removeNode(L.lods[a.index].node);
  return result(rel, finish(t), { bone: b.path });
}
function opLodOff(doc, a) {
  const { rel, bytes } = mdlOf(doc), m = parseOk(bytes), b = boneOf(m, a.bone);
  const L = b.views.find(v => v.kind === 'LODView');
  if (!L) fail('This bone has no levels of detail.');
  const t = m.tree, src = t.src, has = blocks(L.node).filter(x => kw(x) === 'off');
  if (a.on && !has.length) insertBlock(t, L.node, L.node.items.length, '{OFF}', kidIndent(src, L.node, unitOf(src)), eolOf(src));
  if (!a.on) for (const h of has) sw.removeNode(h);
  return result(rel, finish(t), { bone: b.path });
}

// sequences: owner = bone (path) or the skeleton (bone null)
function seqOwner(m, bone) {
  if (bone === null || bone === undefined || bone === '') { if (!m.skeleton) fail('This model has no skeleton.'); return { node: m.skeleton.node, path: null, seqs: m.skeleton.sequences }; }
  const b = boneOf(m, bone); return { node: b.node, path: b.path, seqs: b.sequences };
}
function seqOf(o, name) {
  const s = o.seqs.find(x => (x.name || '').toLowerCase() === String(name).toLowerCase());
  if (!s) fail('There is no sequence "' + name + '" here.');
  return s;
}
function seqFieldText(k, v) {
  const K = SEQ_FIELDS[k];
  if (SEQ_FLAGS.has(k)) return v ? '{' + K + '}' : '';
  if (v === null || v === undefined || v === '') return '';
  if (k === 'file') { if (/["\r\n]/.test(v)) fail('A file name cannot hold quotes.'); return '{File ' + q(v) + '}'; }
  if (typeof v !== 'number' || !isFinite(v)) fail(K + ' is a number.');
  return '{' + K + ' ' + mdl.fmtNum(v) + '}';
}
function opSeqAdd(doc, a) {
  const { rel, bytes } = mdlOf(doc), m = parseOk(bytes), o = seqOwner(m, a.bone);
  const name = a.name;
  if (typeof name !== 'string' || !name.trim() || /["\\{}\r\n]/.test(name) || /[^\x20-\x7e]/.test(name)) fail('A sequence needs a plain name.');
  if (o.seqs.some(s => (s.name || '').toLowerCase() === name.toLowerCase())) fail('There is already a sequence named "' + name + '" here.');
  const parts = ['{Sequence ' + q(name)];
  for (const k of ['file', 'speed', 'smooth', 'resume', 'autostart', 'store']) { const x = seqFieldText(k, a[k]); if (x) parts.push(x); }
  const seqTxt = parts.join(' ') + '}';
  const t = m.tree, src = t.src, eol = eolOf(src), u = unitOf(src);
  const an = blocks(o.node).find(x => kw(x) === 'animation');
  if (an) insertBlock(t, an, an.items.length, seqTxt, kidIndent(src, an, u), eol);
  else {
    const ind = kidIndent(src, o.node, u);
    const kids = o.path === null ? -1 : o.node.items.findIndex(x => isBlk(x) && kw(x) === 'bone');
    insertBlock(t, o.node, kids < 0 ? o.node.items.length : kids, '{Animation' + eol + ind + u + seqTxt + eol + ind + '}', ind, eol);
  }
  return result(rel, finish(t), { bone: o.path, sequence: name });
}
function opSeqRemove(doc, a) {
  const { rel, bytes } = mdlOf(doc), m = parseOk(bytes), o = seqOwner(m, a.bone), s = seqOf(o, a.sequence), t = m.tree;
  const an = s.node.parent;
  if (blocks(an).length === 1 && kw(an) === 'animation') sw.removeNode(an); else sw.removeNode(s.node);
  return result(rel, finish(t), { bone: o.path });
}
function opSeqSet(doc, a) {
  const { rel, bytes } = mdlOf(doc), m = parseOk(bytes), o = seqOwner(m, a.bone), s = seqOf(o, a.sequence);
  const fields = {};
  for (const [k, v] of Object.entries(a.fields || {})) {
    if (!SEQ_FIELDS[k]) fail('Unknown sequence field "' + k + '".');
    if (k === 'name') {
      if (typeof v !== 'string' || !v.trim() || /["\\{}\r\n]/.test(v) || /[^\x20-\x7e]/.test(v)) fail('A sequence needs a plain name.');
      if (o.seqs.some(x => x !== s && (x.name || '').toLowerCase() === v.toLowerCase())) fail('There is already a sequence named "' + v + '" here.');
      fields.name = v; continue;
    }
    if (SEQ_FLAGS.has(k)) { fields[SEQ_FIELDS[k]] = v ? true : null; continue; }
    if (v === null || v === '') { fields[SEQ_FIELDS[k]] = null; continue; }
    if (k === 'file') { if (typeof v !== 'string' || /["\r\n]/.test(v)) fail('A file name cannot hold quotes.'); fields.File = v; continue; }
    if (k === 'pinback' && v === true) { fields.Pinback = true; continue; }
    if (typeof v !== 'number' || !isFinite(v)) fail(SEQ_FIELDS[k] + ' is a number.');
    fields[SEQ_FIELDS[k]] = v;
  }
  const bytes2 = mdl.edit(m, [{ op: 'setSequence', sequence: s.name, bone: o.path, fields }]);
  return result(rel, bytes2, { bone: o.path, sequence: fields.name || s.name });
}
function opSeqEventsRemove(doc, a) {
  const { rel, bytes } = mdlOf(doc), m = parseOk(bytes), o = seqOwner(m, a.bone), s = seqOf(o, a.sequence), t = m.tree;
  const ev = blocks(s.node).filter(x => kw(x) === 'events');
  if (!ev.length) fail('This sequence has no events.');
  for (const e of ev) sw.removeNode(e);
  return result(rel, finish(t), { bone: o.path });
}

// ---------- states ----------
function colorOut(c) {
  if (c === null || c === undefined || c === true) return null;
  const s = String(c), x = /^0x([0-9a-f]+)$/i.exec(s);
  if (x) return '#' + (parseInt(x[1], 16) & 0xffffff).toString(16).padStart(6, '0');
  if (typeof c === 'number') return '#' + (c & 0xffffff).toString(16).padStart(6, '0');
  return null;
}
function viewOut(src, v) {
  if (!v) return null;
  const fl = {}; let layer = null;
  for (const c of blocks(v.node)) { const k = kw(c); const F = VIEW_FLAGS.find(x => x.toLowerCase() === k); if (F) fl[F] = true; else if (k === 'layer') layer = c.items[1] ? c.items[1].text : null; }
  return { kind: v.kind, file: v.file, flags: fl, layer, line: mdl.lineOf(src, v.node.start) };
}
function treeList(doc) {
  const { rel, bytes } = mdlOf(doc), m = mdl.parse(bytes);
  const out = { mdl: rel, error: m.error, bones: [], volumes: [], obstacles: [], areas: [], skeleton: null };
  if (!m.tree) return out;
  const src = m.tree.src;
  if (m.skeleton) out.skeleton = { line: mdl.lineOf(src, m.skeleton.node.start), sequences: m.skeleton.sequences.map(s => s.name), extension: m.skeleton.extension };
  for (const b of m.bones) {
    const v = b.views.find(x => x.kind !== 'LODView'), L = b.views.find(x => x.kind === 'LODView');
    const par = parentOf(m, b), sibs = par ? par.children : m.bones.filter(x => x.depth === 0).map(x => x.path);
    out.bones.push({ path: b.path, name: b.name, parent: b.parent, depth: b.depth, kind: b.type ? b.type.toLowerCase() : 'bone', prefab: b.file,
      children: b.children.slice(), index: sibs.indexOf(b.path), siblings: sibs.length, mesh: v ? v.file : (L && L.lods[0] ? L.lods[0].file : null), meshKind: v ? v.kind : null,
      lods: L ? L.lods.length : 0, lodOff: L ? L.off : false, volumes: b.volumes.slice(), flags: b.flags.slice(), terminator: b.flags.some(f => f.toLowerCase() === 'terminator'),
      sequences: b.sequences.length, line: mdl.lineOf(src, b.node.start) });
  }
  for (const v of m.volumes) out.volumes.push({ id: v.id, name: v.name, bone: v.bone, kind: v.kind, orphan: v.orphan, line: mdl.lineOf(src, v.node.start) });
  for (const o of m.obstacles) out.obstacles.push({ name: o.name, kind: o.kind, line: mdl.lineOf(src, o.node.start) });
  for (const o of m.areas) out.areas.push({ name: o.name, kind: o.kind, line: mdl.lineOf(src, o.node.start) });
  return out;
}
function boneGet(doc, qy) {
  const { bytes } = mdlOf(doc), m = parseOk(bytes), b = boneOf(m, qy && qy.bone), src = m.tree.src;
  const world = worldOf(m, b), dl = decompose(b.matrix), dw = decompose(world);
  const par = parentOf(m, b), sibs = par ? par.children : m.bones.filter(x => x.depth === 0).map(x => x.path);
  const L = b.views.find(x => x.kind === 'LODView');
  return {
    path: b.path, name: b.name, parent: b.parent, children: b.children.slice(), prefab: b.file, type: b.type ? b.type.toLowerCase() : 'none',
    line: mdl.lineOf(src, b.node.start), index: sibs.indexOf(b.path), siblings: sibs.length,
    local: b.matrix.slice(), world, form: b.form.slice(), exact: b.exact,
    position: dl.position, positionM: dl.position.map(x => x / 20), euler: dl.euler, scale: dl.scale, mirrored: dl.mirrored,
    worldPosition: dw.position, worldPositionM: dw.position.map(x => x / 20), worldEuler: dw.euler, worldScale: dw.scale,
    visibility: typeof b.visibility === 'number' ? b.visibility : null, params: b.params, paramMap: b.paramMap,
    limits: b.limits, speed: typeof b.speed === 'number' ? b.speed : null, speed2: typeof b.speed2 === 'number' ? b.speed2 : null,
    color: colorOut(b.color), colorRaw: b.color === null ? null : String(b.color),
    terminator: b.flags.some(f => f.toLowerCase() === 'terminator'), flags: b.flags.slice(),
    mesh: viewOut(src, b.views.find(x => x.kind !== 'LODView')),
    lod: L ? { entries: L.lods.map(l => viewOut(src, { kind: l.kind, file: l.file, node: l.node })), off: L.off } : null,
    sequences: b.sequences.map(s => ({ name: s.name, file: s.file, fileDefault: s.fileDefault || null, speed: s.speed, smooth: s.smooth, autostart: s.autostart, store: s.store,
      resume: s.resume, movement: s.movement, pinback: s.pinback, rotate: s.rotate, duration: s.duration, events: 'events' in s.fields, unknown: s.unknown.filter(k => k.toLowerCase() !== 'events') })),
    volumes: b.volumes.slice(), unknown: b.unknown.slice(),
  };
}
function boneCopy(doc, qy) {
  const { bytes } = mdlOf(doc), m = parseOk(bytes), b = boneOf(m, qy && qy.bone), src = m.tree.src;
  const ind = lineIndent(src, b.node.start);
  let text = reindent(nodeText(src, b.node), ind, '', '\r\n');
  if (qy.branch === false) text = fragment(text, n => n, true);
  return { text, bone: b.path, branch: qy.branch !== false };
}
function skeletonSeqs(doc) {
  const { bytes } = mdlOf(doc), m = parseOk(bytes);
  return { sequences: m.skeleton ? m.skeleton.sequences.map(s => ({ name: s.name, file: s.file, fileDefault: s.fileDefault || null, speed: s.speed, smooth: s.smooth, autostart: s.autostart,
    store: s.store, resume: s.resume, events: 'events' in s.fields })) : [] };
}

module.exports = {
  ops: {
    'bone.add': { apply: opAdd },
    'bone.delete': { apply: opDelete },
    'bone.rename': { apply: opRename },
    'bone.move': { apply: opMove },
    'bone.up': { apply: opStep(-1) },
    'bone.down': { apply: opStep(1) },
    'bone.duplicate': { apply: opDuplicate },
    'bone.paste': { apply: opPaste },
    'bone.setMatrix': { apply: opSetMatrix },
    'bone.place': { apply: opPlace },
    'bone.nudge': { apply: opNudge },
    'bone.round': { apply: opRound },
    'bone.mirror': { apply: opMirror },
    'bone.set': { apply: opSet },
    'bone.mesh': { apply: opMesh },
    'bone.lod.add': { apply: opLodAdd },
    'bone.lod.remove': { apply: opLodRemove },
    'bone.lod.off': { apply: opLodOff },
    'bone.seq.add': { apply: opSeqAdd },
    'bone.seq.remove': { apply: opSeqRemove },
    'bone.seq.set': { apply: opSeqSet },
    'bone.seq.events.remove': { apply: opSeqEventsRemove },
  },
  state: {
    'tree.list': treeList,
    'tree.sequences': skeletonSeqs,
    'bone.get': boneGet,
    'bone.copy': boneCopy,
  },
  _t: { decompose, compose, rotEuler, reindent, unitOf, freeName },
};

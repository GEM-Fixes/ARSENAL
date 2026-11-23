// model/mdl: .mdl reader + in-place editor (SDL text; every byte outside an edited span is kept).
// Layout (engine readers, AS2/as64):
//   top level = entity keywords:
//     {Skeleton ..} (skeleton = root bone: {bone ..} {animation ..} {extension "x.ext"} ...)
//     {Volume "n" {Box x y z}|{Cylinder r h}|{Sphere r}|{Polyhedron "f.vol"} {Bone "b"} {Position}{Orientation}{Matrix34}
//       {Tags}{Component}{Density}{Material}{Thickness ..}}
//     {Obstacle "n" {Obb2 {Center x y}{Extent x y}{Axis x y}}|{Circle2 {Radius}{Center}}|{Polygon2 {Radius}{Vertex x y}..} {Rotate} {Tags ..}},
//     {Area "n" ..same shapes..}, {Extender "name" ..} and any other top-level block (kept in `blocks`).
//   bone = {bone [revolute|prizmatic|socket|planarsocket|wild] "name"|"prefab.mdl" ..} ( ReadBone)
//     keys ( ReadKeyword): Bone View SpriteView VolumeView ParticleView DecalView LODView{View..OFF ControlBone}
//     Name Matrix34 Position Orientation Visibility Parameters Terminator Animation State Color; parametric bones add Limits Speed Speed2
// animation = {sequence "n" {file}{speed}{smooth}{resume}{store}{autostart}{movement}{pinback}{rotate}
//     {duration}{dynamicspeed}} + {uv}{texture}{blend}{smooth}.
// Matrices: number[12], row-major as stored: [x.x x.y x.z  y.x y.y y.z  z.x z.y z.z  t.x t.y t.z] (rows = axes, last = translation).
//   A local matrix starts as identity and the placement keywords apply IN DOCUMENT ORDER, each overwriting its part
// {Position x y z} sets t only; {Orientation 9} sets the 3 axis rows only
//   ReadOrientation = ReadMatrixRows<3>); {Matrix34 12} sets all 12. Block form {Matrix34 {pos x y z}{xform ..}{nxform ..}{qnion ..}}
//   resets to identity first; only `pos` is decoded here, rotation parts mark `exact: false` [I].
//   Volumes use the same three keywords on their own matrix.
//   Row vectors: point' = point * M. world = local * parentWorld, i.e. local "followed by" parent
//   ( ComposeWorld: out = local; out *= parent; operator*= "this transform followed by m").
//   Parametric bones (revolute..) at rest are taken as AdjustLocal = identity [I]. Volume world = volume local * bone world.
//   A {Polyhedron} volume's engine matrix also adds the .vol mean vertex: not applied here (needs the .vol).
// Units: engine units (20 per metre). Angles as stored (limits in degrees).
//
// Exports:
//   parse(buf) -> model, never throws: { bytes, tree (sdlwrite tree), root (sdlwrite root node), error: string|null,
//     skeleton: { node, extension, sequences, animation, unknown, unknownNodes } | null,
//     bones: [{ name, path, parent (path|null), depth, type (header word|null), file (prefab "x.mdl"|null), node, nameNode,
//       matrix: number[12], exact, form: ['Position'|'Orientation'|'Matrix34'|'Matrix34{}', ..] (document order),
//       views: [{ kind, file, node, lods: [{kind,file}]|null, off }], flags: ['Terminator', ..] (no-arg blocks),
//       limits: number[]|null, speed, speed2, visibility, color, params: string|null, paramMap: {k: v}, sequences: [seq],
//       animation: [{ kind: 'uv'|'texture'|'blend'|'smooth', name, node }], volumes: [ids], keys: [lowercase keywords in order],
//       unknown: [keyword], unknownNodes: [node], layer: null (no layer keyword in AS2 bones) }],
//     volumes: [{ id: '<bone path>/<name>', name, nameNode, bone (path|null), boneName (as written), orphan, kind, shapes (count),
//       size: [x,y,z]|null, radius, length, file, matrix, exact, form, tags, component, density, material,
//       thickness: { all, sides: {front..} }|null, keys, unknown, unknownNodes, node }],
//     sequences: [seq] (all, skeleton level first), seq = { name, bone (path|null), file, speed, smooth, autostart, store, resume,
//       movement, pinback, rotate, duration, dynamicspeed, fields: {lowerkey: value}, unknown, node, nameNode },
//     obstacles: [{ name, kind, shape: { kind, center, extent, axis, radius, vertices }, flags, tags, unknown, node }], areas: [same],
//     blocks: [{ keyword, label, node }] (Extender and every other top-level block), unknown: [top-level stray words] }
//   edit(model, changes) -> Buffer. Throws on an unknown target or overlapping edits. changes (applied to a fresh parse of model.bytes):
//     { op:'setMatrix', bone, matrix, force? }          bone = path or name (first in tree order, as FindBone)
//     { op:'setVolume', volume, size?, radius?, length?, file?, kind?, matrix?, force? }   volume = id or name
//     { op:'setKey', bone|volume, key, value }           value: number|string|array|true (no-arg)|null/false (remove)|{raw}
//     { op:'rename', bone|volume, name, refs? }          bone rename also rewrites {Bone "old"} of its volumes unless refs === false
//     { op:'addVolume', bone, name, kind, size|radius,length|file, matrix?, keys?: {k: v} }
//     { op:'deleteVolume', volume }
//     { op:'addFlag'|'removeFlag', bone, flag }          flag = no-arg keyword, e.g. 'Terminator'
//     { op:'setSequence', sequence, bone?, fields: {k: v} }  bone omitted = first sequence with that name; fields as setKey values, `name` renames
//     numbers are written only where the value changed (force: rewrite every number); format = %g 6 digits widened until float32-exact.
//   worldMatrix(model, bone) -> number[12] | null;  volumeWorld(model, volumeId) -> number[12] | null
//   mul(a, b) (a followed by b), invert(m) -> m|null, transformPoint(m, [x,y,z]), IDENTITY, fmtNum(x), findBone, findVolume
//   rollers(model, kind) -> [{ name, bone, joint }] the road wheels a track chassis drives, per game (kind 'as2' | 'goh', a game id or
//     vfs exe also taken; default as2): AS2 one bone `roller` + `roller_joint` (MOV-20); GoH the
//     numbered `roller_01`, `roller_02` .. (%02d from 01, the list stops at the first missing number), each with `roller_NN_joint`
//     (GHFMT-20 [V]); a plain `roller` bone is not driven on GoH (the engine looks only for roller_NN, GHFMT-20), so it gives []. bone/joint = the bone entries (null when absent). Vanilla GoH vehicles: 94 roller_NN in 215 sampled [I].
// Gates of Hell: .mdl files are the same SDL text; 3,000 vanilla GoH .mdl parsed and edit(m, []) byte-identical, 2026-11-14 [I].
// Author: Imperator_Aug (ARSENAL, ia-a94aea8c)
'use strict';
const sw = require('../sdlwrite');

const IDENTITY = Object.freeze([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]);
const BONE_TYPES = new Set(['revolute', 'prizmatic', 'socket', 'planarsocket', 'wild']);
const VIEW_KINDS = { view: 'View', spriteview: 'SpriteView', volumeview: 'VolumeView', particleview: 'ParticleView', decalview: 'DecalView' };
const SHAPES = { box: 'box', cylinder: 'cylinder', sphere: 'sphere', polyhedron: 'polyhedron' };
const SEQ_KEYS = new Set(['name', 'file', 'movement', 'pinback', 'resume', 'store', 'speed', 'rotate', 'smooth', 'duration', 'autostart', 'dynamicspeed']);
const BONE_KEYS = new Set(['bone', 'view', 'spriteview', 'volumeview', 'particleview', 'decalview', 'lodview', 'name', 'matrix34', 'position',
  'orientation', 'visibility', 'parameters', 'terminator', 'animation', 'state', 'color', 'limits', 'speed', 'speed2']);
const VOL_KEYS = new Set(['box', 'cylinder', 'sphere', 'polyhedron', 'bone', 'position', 'orientation', 'matrix34', 'tags', 'component',
  'density', 'material', 'thickness']);
const SIDES = ['front', 'rear', 'left', 'right', 'top', 'bottom'];
const NUM_RE = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;
const ESC = { n: '\n', t: '\t', '"': '"', '\\': '\\' };

// ---- token helpers
const isBlk = n => n && (n.type === 'block' || n.type === 'list');
const kw = n => (n.items[0] && n.items[0].type === 'atom') ? n.items[0].text.toLowerCase() : '';
const kwRaw = n => (n.items[0] && n.items[0].type === 'atom') ? n.items[0].text : '';
const blocks = n => n.items.filter(isBlk);
const args = n => n.items.slice(1).filter(x => !isBlk(x));
function unquote(text) {
  let s = text.slice(1); if (s.endsWith('"') && s.length) s = s.slice(0, -1);
  return s.replace(/\\(.)/g, (m, e) => ESC[e] ?? e);
}
function tokVal(x) {
  if (x.type === 'string') return unquote(x.text);
  if (NUM_RE.test(x.text)) return parseFloat(x.text);
  return x.text;
}
const num = x => (x && x.type === 'atom' && NUM_RE.test(x.text)) ? parseFloat(x.text) : NaN;
function value(n) { const a = args(n).map(tokVal); return a.length === 0 ? true : a.length === 1 ? a[0] : a; }
const firstStr = n => { const s = n.items.slice(1).find(x => x.type === 'string'); return s ? unquote(s.text) : null; };

// ---- 3x4 matrix math (row vectors, row-major number[12])
function mul(a, b) {
  const r = new Array(12);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  for (let j = 0; j < 3; j++) r[9 + j] = a[9] * b[j] + a[10] * b[3 + j] + a[11] * b[6 + j] + b[9 + j];
  return r;
}
function invert(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (!det || !isFinite(det)) return null;
  const s = 1 / det;
  const R = [A * s, -(b * i - c * h) * s, (b * f - c * e) * s, B * s, (a * i - c * g) * s, -(a * f - c * d) * s, C * s, -(a * h - b * g) * s, (a * e - b * d) * s];
  const t = [m[9], m[10], m[11]];
  return R.concat([0, 1, 2].map(j => -(t[0] * R[j] + t[1] * R[3 + j] + t[2] * R[6 + j])));
}
const transformPoint = (m, p) => [0, 1, 2].map(j => p[0] * m[j] + p[1] * m[3 + j] + p[2] * m[6 + j] + m[9 + j]);

// ---- number format: %g style, 6 significant digits widened to float32-exact, MSVC 3-digit exponent (as the exporter writes)
function fmtNum(x) {
  if (!isFinite(x)) return String(x);
  if (Object.is(x, -0)) x = 0;
  if (Number.isInteger(x) && Math.abs(x) < 1e15) return String(x);
  const f = Math.fround(x);
  let s = '';
  for (let p = 6; p <= 9; p++) {       // C %g: exponent form when exp < -4 or exp >= precision
    const e = parseInt(x.toExponential(p - 1).split('e')[1], 10);
    s = (e < -4 || e >= p) ? x.toExponential(p - 1) : x.toFixed(Math.max(0, p - 1 - e));
    if (Math.fround(parseFloat(s)) === f) break;
  }
  const m = /^(-?)([\d.]+)(?:e([-+])(\d+))?$/.exec(s);
  if (!m) return s;
  let mant = m[2]; if (mant.includes('.')) mant = mant.replace(/0+$/, '').replace(/\.$/, '');
  if (m[3] === undefined) return m[1] + mant;
  return m[1] + mant + 'e' + m[3] + m[4].padStart(3, '0');
}
const sameNum = (text, v) => NUM_RE.test(text) && Math.fround(parseFloat(text)) === Math.fround(v);

// ---- placement: Position / Orientation / Matrix34 (row or block form), document order
function readPlacement(node) {
  let m = IDENTITY.slice(), exact = true; const form = [];
  let rot = null, tr = null;   // sources: { node, toks: [9|3 tokens] } | { node, block: true }
  for (const c of blocks(node)) {
    const k = kw(c);
    if (k === 'position') {
      const a = args(c); form.push('Position');
      for (let j = 0; j < 3; j++) if (!isNaN(num(a[j]))) m[9 + j] = num(a[j]);
      tr = { node: c, toks: a.slice(0, 3) };
    } else if (k === 'orientation') {
      const a = args(c); form.push('Orientation');
      for (let j = 0; j < 9; j++) if (!isNaN(num(a[j]))) m[j] = num(a[j]);
      rot = { node: c, toks: a.slice(0, 9) };
    } else if (k === 'matrix34') {
      const subs = blocks(c);
      if (subs.length) {
        form.push('Matrix34{}'); m = IDENTITY.slice(); rot = { node: c, block: true }; tr = { node: c, block: true };
        for (const s of subs) {
          const p = kw(s), a = args(s);
          if (p === 'pos') { for (let j = 0; j < 3; j++) if (!isNaN(num(a[j]))) m[9 + j] = num(a[j]); tr = { node: c, toks: a.slice(0, 3), sub: s }; }
          else exact = false;
        }
      } else {
        const a = args(c); form.push('Matrix34');
        for (let j = 0; j < 12; j++) if (!isNaN(num(a[j]))) m[j] = num(a[j]);
        rot = { node: c, toks: a.slice(0, 9) }; tr = { node: c, toks: a.slice(9, 12) };
      }
    }
  }
  return { matrix: m, exact, form, src: { rot, tr } };
}

function readShape(n) {   // obstacle/area 2D shape
  const sh = { kind: kwRaw(n), center: null, extent: null, axis: null, radius: null, vertices: [], unknown: [] };
  for (const c of blocks(n)) {
    const k = kw(c), v = value(c);
    if (k === 'center' || k === 'extent' || k === 'axis') sh[k] = Array.isArray(v) ? v : [v];
    else if (k === 'radius') sh.radius = v;
    else if (k === 'vertex') sh.vertices.push(Array.isArray(v) ? v : [v]);
    else sh.unknown.push(kwRaw(c));
  }
  return sh;
}

function readSequence(n, bonePath) {
  const nameTok = n.items.slice(1).find(x => x.type === 'string');
  const s = { name: nameTok ? unquote(nameTok.text) : null, bone: bonePath, file: null, speed: null, smooth: null, autostart: false, store: false,
    resume: false, movement: false, pinback: null, rotate: null, duration: null, dynamicspeed: null, fields: {}, unknown: [], node: n, nameNode: nameTok || null };
  for (const c of blocks(n)) {
    const k = kw(c);
    const v = k === 'dynamicspeed' ? blocks(c).map(value) : value(c);
    s.fields[k] = v;
    if (k === 'name') { s.name = v; s.nameNode = args(c)[0] || s.nameNode; }
    else if (k === 'file' || k === 'speed' || k === 'smooth' || k === 'rotate' || k === 'duration' || k === 'dynamicspeed') s[k] = v;
    else if (k === 'autostart' || k === 'store' || k === 'resume' || k === 'movement') s[k] = true;
    else if (k === 'pinback') s.pinback = v === true ? 1 : v;
    if (!SEQ_KEYS.has(k)) s.unknown.push(kwRaw(c));
  }
  if (s.file === null && s.name !== null) s.fileDefault = s.name + '.anm';
  return s;
}

function readAnimation(n, bonePath, seqs, anim) {
  for (const c of blocks(n)) {
    const k = kw(c);
    if (k === 'sequence') seqs.push(readSequence(c, bonePath));
    else anim.push({ kind: k, name: firstStr(c), node: c });
  }
}

function lineOf(src, off) { let l = 1; for (let i = 0; i < off && i < src.length; i++) if (src.charCodeAt(i) === 10) l++; return l; }

function parse(buf) {
  if (!Buffer.isBuffer(buf)) buf = Buffer.from(buf);
  const model = { bytes: buf, tree: null, root: null, error: null, skeleton: null, bones: [], volumes: [], sequences: [], obstacles: [], areas: [], blocks: [], unknown: [] };
  let t;
  try { t = sw.parse(buf); } catch (e) { model.error = e.message; return model; }
  model.tree = t; model.root = t.root;
  const src = t.src;
  // structural problems (the engine stops on them): first one is the error
  (function chk(nd) {
    for (const c of nd.items) {
      if (model.error) return;
      if (c.type === 'stray') { model.error = `stray "${c.text}" at line ${lineOf(src, c.start)}`; return; }
      if (isBlk(c)) { if (!c.closed) { model.error = `block "${kwRaw(c) || '?'}" not closed (line ${lineOf(src, c.start)})`; return; } chk(c); }
    }
  })(t.root);

  const walkBone = (n, parent, depth) => {
    const hdr = [];
    for (const x of n.items.slice(1)) { if (isBlk(x)) break; hdr.push(x); }
    const nameTok = hdr.find(x => x.type === 'string') || null;
    let name = nameTok ? unquote(nameTok.text) : '';
    const typeTok = hdr.find(x => x.type === 'atom' && BONE_TYPES.has(x.text.toLowerCase()));
    const b = { name, path: '', parent: parent ? parent.path : null, depth, type: typeTok ? typeTok.text : null, file: null, node: n, nameNode: nameTok,
      matrix: null, exact: true, form: [], views: [], flags: [], limits: null, speed: null, speed2: null, visibility: null, color: null,
      params: null, paramMap: {}, sequences: [], animation: [], volumes: [], keys: [], unknown: [], unknownNodes: [], layer: null, children: [] };
    for (const x of hdr) if (x !== nameTok && x !== typeTok) { b.unknown.push(x.text); b.unknownNodes.push(x); }
    for (const x of n.items.slice(1 + hdr.length)) if (!isBlk(x)) { b.unknown.push(x.text); b.unknownNodes.push(x); }
    const nameBlk = blocks(n).filter(c => kw(c) === 'name').pop();
    if (nameBlk) { const s = args(nameBlk).find(x => x.type === 'string'); if (s) { name = unquote(s.text); b.nameNode = s; } }
    if (name.includes('.')) b.file = name;    // prefab: bone loaded from that file
    b.name = name; b.path = parent ? parent.path + '/' + name : name;
    const pl = readPlacement(n); b.matrix = pl.matrix; b.exact = pl.exact; b.form = pl.form; b._src = pl.src;
    model.bones.push(b);
    for (const c of blocks(n)) {
      const k = kw(c); b.keys.push(k);
      if (k === 'bone') { const ch = walkBone(c, b, depth + 1); b.children.push(ch.path); }
      else if (VIEW_KINDS[k]) b.views.push({ kind: VIEW_KINDS[k], file: firstStr(c), node: c, lods: null, off: false });
      else if (k === 'lodview') {
        const v = { kind: 'LODView', file: null, node: c, lods: [], off: false };
        for (const l of blocks(c)) { const lk = kw(l); if (VIEW_KINDS[lk]) v.lods.push({ kind: VIEW_KINDS[lk], file: firstStr(l), node: l }); else if (lk === 'off') v.off = true; else v.lods.push({ kind: kwRaw(l), file: firstStr(l), node: l }); }
        v.file = v.lods[0] ? v.lods[0].file : null; b.views.push(v);
      } else if (k === 'parameters') {
        b.params = firstStr(c) ?? '';
        for (const kv of b.params.split(';')) { if (!kv.trim()) continue; const e = kv.indexOf('='); if (e < 0) b.paramMap[kv.trim()] = true; else b.paramMap[kv.slice(0, e).trim()] = kv.slice(e + 1).trim(); }
      } else if (k === 'limits') b.limits = args(c).map(tokVal);
      else if (k === 'speed' || k === 'speed2' || k === 'visibility') b[k] = value(c);
      else if (k === 'color') b.color = args(c).length ? value(c) : true;
      else if (k === 'animation') readAnimation(c, b.path, b.sequences, b.animation);
      if (args(c).length === 0 && !blocks(c).length && k !== 'animation') b.flags.push(kwRaw(c));
      if (!BONE_KEYS.has(k)) { b.unknown.push(kwRaw(c)); b.unknownNodes.push(c); }
    }
    return b;
  };

  for (const top of t.root.items) {
    if (!isBlk(top)) { model.unknown.push(top.text); continue; }
    const k = kw(top);
    if (k === 'skeleton') {
      const sk = { node: top, extension: null, sequences: [], animation: [], keys: [], unknown: [], unknownNodes: [] };
      if (!model.skeleton) model.skeleton = sk; else (model.skeletons = model.skeletons || [model.skeleton]).push(sk);
      for (const c of blocks(top)) {
        const ck = kw(c); sk.keys.push(ck);
        if (ck === 'bone') walkBone(c, null, 0);
        else if (ck === 'animation') readAnimation(c, null, sk.sequences, sk.animation);
        else if (ck === 'extension') sk.extension = firstStr(c);
        else { sk.unknown.push(kwRaw(c)); sk.unknownNodes.push(c); }
      }
      model.sequences.push(...sk.sequences);
    } else if (k === 'volume') {
      const nameTok = top.items.slice(1).find(x => x.type === 'string') || null;
      const v = { id: '', name: nameTok ? unquote(nameTok.text) : '', nameNode: nameTok, bone: null, boneName: null, boneNode: null, orphan: false,
        kind: null, shapes: 0, shapeNode: null, size: null, radius: null, length: null, file: null, matrix: null, exact: true, form: [],
        tags: null, component: null, density: null, material: null, thickness: null, keys: [], unknown: [], unknownNodes: [], node: top };
      const pl = readPlacement(top); v.matrix = pl.matrix; v.exact = pl.exact; v.form = pl.form; v._src = pl.src;
      for (const c of blocks(top)) {
        const ck = kw(c); v.keys.push(ck);
        if (SHAPES[ck]) {
          v.shapes++; v.kind = ck; v.shapeNode = c; v.size = v.radius = v.length = v.file = null;
          const a = args(c);
          if (ck === 'box') v.size = a.slice(0, 3).map(num);
          else if (ck === 'cylinder') { v.radius = num(a[0]); v.length = num(a[1]); }
          else if (ck === 'sphere') v.radius = num(a[0]);
          else v.file = a[0] ? tokVal(a[0]) : null;
        } else if (ck === 'bone') { v.boneName = firstStr(c) ?? (args(c)[0] ? args(c)[0].text : null); v.boneNode = c; }
        else if (ck === 'tags') v.tags = args(c).map(tokVal);
        else if (ck === 'component' || ck === 'material') v[ck] = firstStr(c) ?? value(c);
        else if (ck === 'density') v.density = value(c);
        else if (ck === 'thickness') {
          const th = { all: null, sides: {} }; const a = args(c).filter(x => !isNaN(num(x)));
          if (a.length) { th.all = num(a[0]); for (const s of SIDES) th.sides[s] = th.all; }
          for (const s of blocks(c)) th.sides[kw(s)] = num(args(s)[0]);
          v.thickness = th;
        }
        if (!VOL_KEYS.has(ck)) { v.unknown.push(kwRaw(c)); v.unknownNodes.push(c); }
      }
      for (const x of top.items.slice(1)) if (!isBlk(x) && x !== nameTok) { v.unknown.push(x.text); v.unknownNodes.push(x); }
      model.volumes.push(v);
    } else if (k === 'obstacle' || k === 'area') {
      const o = { name: firstStr(top), kind: null, shape: null, flags: [], tags: null, keys: [], unknown: [], unknownNodes: [], node: top };
      for (const c of blocks(top)) {
        const ck = kw(c); o.keys.push(ck);
        if (ck === 'obb2' || ck === 'circle2' || ck === 'polygon2') { o.shape = readShape(c); o.kind = o.shape.kind; }
        else if (ck === 'tags') o.tags = args(c).map(tokVal);
        else if (!args(c).length && !blocks(c).length) o.flags.push(kwRaw(c));
        else { o.unknown.push(kwRaw(c)); o.unknownNodes.push(c); }
      }
      (k === 'obstacle' ? model.obstacles : model.areas).push(o);
    } else model.blocks.push({ keyword: kwRaw(top) || null, label: firstStr(top), node: top });
  }
  for (const b of model.bones) model.sequences.push(...b.sequences);
  // volume -> bone (first in tree order, as FindBone ), identity '<bone path>/<name>'
  for (const v of model.volumes) {
    const b = v.boneName !== null ? findBone(model, v.boneName, true) : null;
    v.bone = b ? b.path : null; v.orphan = !b;
    v.id = (b ? b.path : (v.boneName ?? '')) + '/' + v.name;
    if (b) b.volumes.push(v.id);
  }
  return model;
}

// ---- lookup
function findBone(model, ref, byNameOnly) {
  if (ref && typeof ref === 'object') ref = ref.path;
  const r = String(ref).toLowerCase();
  if (!byNameOnly) { const p = model.bones.find(b => b.path.toLowerCase() === r); if (p) return p; }
  return model.bones.find(b => b.name.toLowerCase() === r) || null;
}
function findVolume(model, ref) {
  if (ref && typeof ref === 'object') ref = ref.id;
  const r = String(ref).toLowerCase();
  return model.volumes.find(v => v.id.toLowerCase() === r) || model.volumes.find(v => v.name.toLowerCase() === r) || null;
}
function worldMatrix(model, ref) {
  let b = findBone(model, ref); if (!b) return null;
  let m = b.matrix.slice();
  while (b.parent !== null) { b = model.bones.find(x => x.path === b.parent); m = mul(m, b.matrix); }
  return m;
}
function volumeWorld(model, ref) {
  const v = findVolume(model, ref); if (!v) return null;
  return v.bone ? mul(v.matrix, worldMatrix(model, v.bone)) : v.matrix.slice();
}

// ---- edit helpers
function splice(t, start, end, text) { t.splices.push({ start, end, text }); }
function repTok(t, tok, text) { if (tok.text !== text) splice(t, tok.start, tok.end, text); }
function quote(s) {
  s = String(s);
  if (/[^\x00-\xff]/.test(s)) throw new Error('mdl: name/string has characters outside latin1/cp1251 bytes: ' + s);
  return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}
function valText(v) {
  if (v && typeof v === 'object' && !Array.isArray(v) && 'raw' in v) return String(v.raw);
  if (v && typeof v === 'object' && !Array.isArray(v) && 'word' in v) return String(v.word);
  if (Array.isArray(v)) return v.map(valText).join(' ');
  if (typeof v === 'number') return fmtNum(v);
  return quote(v);
}
function lineIndent(src, p) { let s = p; while (s > 0 && src[s - 1] !== '\n' && src[s - 1] !== '\r') s--; return /^[ \t]*/.exec(src.slice(s))[0]; }
const ownLine = (src, nd) => { let s = nd.start; while (s > 0 && (src[s - 1] === ' ' || src[s - 1] === '\t')) s--; return s === 0 || src[s - 1] === '\n' || src[s - 1] === '\r'; };
const unitOf = src => /\n\t/.test(src) ? '\t' : '  ';
// insert {kw rows..} into parent before items[index] (index = items.length: append). rows: arrays of value texts
function insertKid(t, parent, index, kwText, rows) {
  const src = t.src, its = parent.items, ref = its[index] || its[index - 1];
  const multi = rows.length > 1 && ref && ownLine(src, ref) && ref !== its[0];
  let text;
  if (multi) {
    const ind = lineIndent(src, ref.start), u = unitOf(src);
    text = '{' + kwText + '\n' + rows.map(r => ind + u + r.join('\t')).join('\n') + '\n' + ind + '}';
  } else text = '{' + kwText + (rows.length ? ' ' + rows.map(r => r.join(' ')).join(' ') : '') + '}';
  sw.insertChild(parent, index, text);
}
const firstKidIndex = (n, names) => { const i = n.items.findIndex(x => isBlk(x) && names.includes(kw(x))); return i < 0 ? n.items.length : i; };
const BEFORE = ['bone', 'view', 'spriteview', 'volumeview', 'particleview', 'decalview', 'lodview', 'animation'];

// write a matrix back in the form the file used (rotation to its last source, translation to its last source)
function writePlacement(t, owner, src, m, force, beforeNames) {
  const isId = IDENTITY.slice(0, 9).every((x, i) => Math.fround(m[i]) === x);
  const tZero = m[9] === 0 && m[10] === 0 && m[11] === 0;
  const put = (toks, vals) => { toks.forEach((tok, j) => { if (force || !sameNum(tok.text, vals[j])) repTok(t, tok, fmtNum(vals[j])); }); };
  const R = m.slice(0, 9), T = m.slice(9, 12);
  const rot = src.rot, tr = src.tr;
  if (rot && rot.block) {       // block form Matrix34 {pos}{xform}: rewrite it as 12 numbers when the rotation is not decoded or changes
    const node = rot.node, ind = ownLine(t.src, node) ? lineIndent(t.src, node.start) : null, u = unitOf(t.src);
    const rows = [R.slice(0, 3), R.slice(3, 6), R.slice(6, 9), T].map(r => r.map(fmtNum));
    const txt = ind === null ? '{' + kwRaw(node) + ' ' + rows.map(r => r.join(' ')).join(' ') + '}'
      : '{' + kwRaw(node) + '\n' + rows.map(r => ind + u + r.join('\t')).join('\n') + '\n' + ind + '}';
    splice(t, node.start, node.end, txt); return;
  }
  const idx = () => firstKidIndex(owner, beforeNames);
  if (rot && rot.toks.length === 9) put(rot.toks, R);
  else if (rot) throw new Error('mdl: malformed ' + kwRaw(rot.node) + ' (needs 9/12 numbers)');
  if (tr && tr.toks.length === 3) put(tr.toks, T);
  else if (tr) throw new Error('mdl: malformed ' + kwRaw(tr.node) + ' (needs 3/12 numbers)');
  if (!rot && !isId) {
    if (!tr) { insertKid(t, owner, idx(), 'Matrix34', [R.slice(0, 3), R.slice(3, 6), R.slice(6, 9), T].map(r => r.map(fmtNum))); return; }
    insertKid(t, owner, owner.items.indexOf(tr.node), 'Orientation', [R.slice(0, 3), R.slice(3, 6), R.slice(6, 9)].map(r => r.map(fmtNum)));
  }
  if (!tr && !tZero) insertKid(t, owner, rot ? owner.items.indexOf(rot.node) + 1 : idx(), 'Position', [T.map(fmtNum)]);
}

// set/add/remove {key args} inside block `owner`
function setKey(t, owner, key, v, beforeNames) {
  const lk = key.toLowerCase();
  const hits = blocks(owner).filter(c => kw(c) === lk);
  const cur = hits[hits.length - 1];
  if (v === null || v === false || v === undefined) { for (const h of hits) sw.removeNode(h); return; }
  if (!cur) { insertKid(t, owner, beforeNames ? firstKidIndex(owner, beforeNames) : owner.items.length, key, v === true ? [] : [[valText(v)]]); return; }
  if (blocks(cur).length) throw new Error(`mdl: {${key}} has sub-blocks: not a simple key`);
  const a = args(cur);
  if (v === true) { if (a.length) splice(t, cur.items[0].end, a[a.length - 1].end, ''); return; }
  const vals = Array.isArray(v) ? v : [v];
  // same arg count: per token (keeps spacing); else replace the whole arg run
  if (a.length === vals.length) {
    a.forEach((tok, j) => {
      const x = vals[j];
      if (typeof x === 'number') { if (!sameNum(tok.text, x)) repTok(t, tok, fmtNum(x)); }
      else if (typeof x === 'string' && tok.type === 'string') { if (unquote(tok.text) !== x) repTok(t, tok, quote(x)); }
      else repTok(t, tok, valText(x));
    });
  } else if (a.length) splice(t, a[0].start, a[a.length - 1].end, valText(vals));
  else splice(t, cur.items[0].end, cur.items[0].end, ' ' + valText(vals));
}

function shapeText(c) {
  const k = String(c.kind || '').toLowerCase();
  if (k === 'box') return '{Box ' + c.size.map(fmtNum).join(' ') + '}';
  if (k === 'cylinder') return '{Cylinder ' + fmtNum(c.radius) + ' ' + fmtNum(c.length) + '}';
  if (k === 'sphere') return '{Sphere ' + fmtNum(c.radius) + '}';
  if (k === 'polyhedron') return '{Polyhedron ' + quote(c.file) + '}';
  throw new Error('mdl: volume kind must be box|cylinder|sphere|polyhedron, got ' + c.kind);
}

function need(x, what) { if (!x) throw new Error('mdl: not found: ' + what); return x; }

function edit(model, changes) {
  if (!changes || !changes.length) return Buffer.from(model.bytes);
  const m = parse(model.bytes);
  if (!m.tree) throw new Error('mdl: cannot edit: ' + m.error);
  const t = m.tree, src = t.src;
  for (const c of changes) {
    switch (c.op) {
      case 'setMatrix': {
        const b = need(findBone(m, c.bone), 'bone ' + c.bone);
        writePlacement(t, b.node, b._src, c.matrix, c.force, BEFORE); break;
      }
      case 'setVolume': {
        const v = need(findVolume(m, c.volume), 'volume ' + c.volume);
        const kind = c.kind ? String(c.kind).toLowerCase() : v.kind;
        if (kind !== v.kind || !v.shapeNode) {
          const txt = shapeText({ kind, size: c.size ?? v.size, radius: c.radius ?? v.radius, length: c.length ?? v.length, file: c.file ?? v.file });
          if (v.shapeNode) splice(t, v.shapeNode.start, v.shapeNode.end, txt);
          else sw.insertChild(v.node, firstKidIndex(v.node, ['bone', 'position', 'orientation', 'matrix34']), txt);
        } else {
          const a = args(v.shapeNode), setN = (tok, x) => { if (x === undefined || x === null) return; if (!tok) throw new Error('mdl: malformed shape in ' + v.id); if (c.force || !sameNum(tok.text, x)) repTok(t, tok, fmtNum(x)); };
          if (kind === 'box' && c.size) c.size.forEach((x, j) => setN(a[j], x));
          if ((kind === 'cylinder' || kind === 'sphere') && c.radius !== undefined) setN(a[0], c.radius);
          if (kind === 'cylinder' && c.length !== undefined) setN(a[1], c.length);
          if (kind === 'polyhedron' && c.file !== undefined) { if (!a[0]) throw new Error('mdl: malformed shape in ' + v.id); if (tokVal(a[0]) !== c.file) repTok(t, a[0], quote(c.file)); }
        }
        if (c.matrix) writePlacement(t, v.node, v._src, c.matrix, c.force, []);
        break;
      }
      case 'setKey': {
        if (c.bone !== undefined) { const b = need(findBone(m, c.bone), 'bone ' + c.bone); setKey(t, b.node, c.key, c.value, BEFORE); }
        else { const v = need(findVolume(m, c.volume), 'volume ' + c.volume); setKey(t, v.node, c.key, c.value, null); }
        break;
      }
      case 'rename': {
        if (c.bone !== undefined) {
          const b = need(findBone(m, c.bone), 'bone ' + c.bone);
          if (!b.nameNode) throw new Error('mdl: bone has no name token: ' + b.path);
          repTok(t, b.nameNode, quote(c.name));
          if (c.refs !== false) for (const v of m.volumes) if (v.bone === b.path && v.boneNode) { const s = args(v.boneNode)[0]; if (s) repTok(t, s, quote(c.name)); }
        } else {
          const v = need(findVolume(m, c.volume), 'volume ' + c.volume);
          if (!v.nameNode) throw new Error('mdl: volume has no name token: ' + v.id);
          repTok(t, v.nameNode, quote(c.name));
        }
        break;
      }
      case 'addVolume': {
        const b = need(findBone(m, c.bone), 'bone ' + c.bone), eol = /\r\n/.test(src) || !/\n/.test(src) ? '\r\n' : '\n', u = unitOf(src);
        const lines = ['{Volume ' + quote(c.name), u + shapeText(c), u + '{Bone ' + quote(b.name) + '}'];
        if (c.keys) for (const [k, x] of Object.entries(c.keys)) lines.push(u + '{' + k + (x === true ? '' : ' ' + valText(x)) + '}');
        if (c.matrix) {
          const R = c.matrix.slice(0, 9), T = c.matrix.slice(9, 12);
          if (R.every((x, i) => Math.fround(x) === IDENTITY[i])) lines.push(u + '{Position ' + T.map(fmtNum).join('\t') + '}');
          else { lines.push(u + '{Matrix34'); for (const r of [R.slice(0, 3), R.slice(3, 6), R.slice(6, 9), T]) lines.push(u + u + r.map(fmtNum).join('\t')); lines.push(u + '}'); }
        }
        lines.push('}');
        const its = t.root.items; let at = -1;
        its.forEach((x, i) => { if (isBlk(x) && kw(x) === 'volume') at = i; });
        sw.insertChild(t.root, at < 0 ? its.length : at + 1, lines.join(eol));
        break;
      }
      case 'deleteVolume': { const v = need(findVolume(m, c.volume), 'volume ' + c.volume); sw.removeNode(v.node); break; }
      case 'addFlag': case 'removeFlag': {
        const b = need(findBone(m, c.bone), 'bone ' + c.bone), f = String(c.flag);
        const has = blocks(b.node).filter(x => kw(x) === f.toLowerCase() && !args(x).length && !blocks(x).length);
        if (c.op === 'addFlag') { if (!has.length) insertKid(t, b.node, firstKidIndex(b.node, BEFORE), f, []); }
        else for (const h of has) sw.removeNode(h);
        break;
      }
      case 'setSequence': {
        const nm = String(c.sequence).toLowerCase();
        const cand = m.sequences.filter(s => (s.name || '').toLowerCase() === nm && (c.bone === undefined || (c.bone === null ? s.bone === null : s.bone !== null && (s.bone.toLowerCase() === String(c.bone).toLowerCase() || findBone(m, c.bone)?.path === s.bone))));
        const s = need(cand[0], 'sequence ' + c.sequence);
        for (const [k, x] of Object.entries(c.fields || {})) {
          if (k === 'name' && blocks(s.node).every(b => kw(b) !== 'name')) { if (!s.nameNode) throw new Error('mdl: sequence has no name token'); repTok(t, s.nameNode, quote(x)); continue; }
          setKey(t, s.node, k, x, null);
        }
        break;
      }
      default: throw new Error('mdl: unknown edit op ' + c.op);
    }
  }
  const sp = t.splices.slice().sort((a, b) => a.start - b.start || a.end - b.end);
  let pos = 0;
  for (const s of sp) { if (s.start < pos) throw new Error('mdl: overlapping edits at byte ' + s.start); pos = Math.max(pos, s.end); }
  return sw.serialize(t);
}

function rollers(model, kind) {
  let k = String(kind || 'as2').toLowerCase();
  if (k !== 'as2' && k !== 'goh') { const g = require('../games').get(k); k = g ? g.kind : 'as2'; }
  const byName = n => (model.bones || []).find(b => b.name.toLowerCase() === n) || null;
  if (k !== 'goh') { const b = byName('roller'); return b ? [{ name: 'roller', bone: b, joint: byName('roller_joint') }] : []; }
  const out = [];
  for (let i = 1; i < 100; i++) {
    const n = 'roller_' + String(i).padStart(2, '0'), b = byName(n);
    if (!b) break;
    out.push({ name: n, bone: b, joint: byName(n + '_joint') });
  }
  return out;
}

module.exports = { parse, edit, worldMatrix, volumeWorld, mul, invert, transformPoint, IDENTITY, fmtNum, findBone, findVolume, lineOf, rollers };

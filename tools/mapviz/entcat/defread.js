// entcat defread: one entity def read the way the engine merges it, through tools/lib/sdlx.js strict expansion only.
//   readDef(io, key) -> desc   (throws Error with .code ENTCAT_DEF_PARSE | ENTCAT_MDL_MISSING | ENTCAT_VOLUME_BAD)
//   io = { read(key) -> Buffer|null, has(key) -> bool }   (a scenecache L: L.read, L.vfs().files.has)
// desc = { key, kind, mdl, exts:[{name, key, missing}], volumes:[{name, able:{..}, disabled, tags, thickness, shape, src}],
//   obstacles:[{name, kind, center, extent, axis, radius, vertices, origin, destination, rotate}], obstacleIds:{zone: id},
//   props:[..], tags:[..], structure:[{place, def}]|null, placer:{places:[{name, attach}]}|null, boarder:bool,
//   compound:bool, decal:{sprite, scale, scaleXY:[x,y], preScale:[x,y], scaleChannel, useDirection}|null, notes:[{code, msg}] }
// Merge rules (engine, [V] read in the source):
//   {Extension "x"}: the extension file's blocks are read inline at that point.
//   {Volume "n" ..}: found or made by name, then Read applies {able} (bitset: optional leading `clear`, then {name [n]},
//     n absent or != 0 sets, 0 clears) and {disabled}; other keys go to the desc (,
// ). `{volume defaultmaterial ".."}` is not a volume.
//   {Obstacle "n" {Obb2|Circle2|Polygon2|Box2|Capsule2 ..} [{Rotate}]}: each one is a new zone (push_back).
//   {obstacleID "id" ["zone"]}: the id of the zone named "zone" (default ''), last one wins (:430-450). GoH mdl obstacle
//     blocks may hold a nested {obstacleID "id"}: read as the id of that obstacle's zone (PORT-74) [I].
//   {props ..} add to the tag set; {tag "a b"} adds tags; {CompoundObstacles}: one fit per volume.
//   (mod "x" ..) content counts when x is "mp" (multiplayer maps) [I].
// Author: Imperator_Aug (ARSENAL, ia-30e270e2)
'use strict';
const sdlx = require('../../lib/sdlx');

const ABLES = ['visible', 'bullet', 'throwing', 'overlap', 'obstacle', 'contact', 'contact_ground', 'blast', 'select', 'hole',
  'holed', 'touch', 'float', 'window', 'nolook', 'nowounddecal'];
const ABLE_DEFAULT = ['visible', 'bullet', 'throwing', 'obstacle', 'contact', 'contact_ground', 'blast', 'select'];
const SHAPES = new Set(['obb2', 'circle2', 'polygon2', 'box2', 'capsule2']);
const MODES = new Set(['mp']);

const lc = s => String(s == null ? '' : s).toLowerCase();
const nameOf = b => { const f = b.items[0]; return f && f.k === 'IDENT' ? f.text : f && f.k === 'STRING' ? f.value : null; };
const isNum = t => t && (t.k === 'INTEGER' || t.k === 'FLOAT');
const argsOf = b => b.items.slice(1).filter(t => t.k !== 'BLOCK' && t.k !== 'MOD');
const nums = b => argsOf(b).filter(isNum).map(t => Number(t.value));
const strs = b => argsOf(b).filter(t => t.k === 'STRING').map(t => t.value);
const str0 = b => { const a = argsOf(b)[0]; return a && a.k === 'STRING' ? a.value : null; };
function kids(b) {
  const out = [];
  (function walk(items) {
    for (const it of items) {
      if (it.k === 'BLOCK') { if (!it.disabled) out.push(it); }
      else if (it.k === 'MOD') { const on = MODES.has(lc(it.name)); if (it.not ? !on : on) walk(it.items); }
    }
  })(b.items);
  return out;
}
const fail = (code, msg) => { const e = new Error(msg); e.code = code; return e; };

function parse(io, key, buf) {
  const errs = [];
  const open = r => {
    if (r.kind !== 'virtual') return null;
    const b = io.read(r.key);
    return b ? { buf: b, file: r.key, key: r.key } : null;
  };
  let res;
  try { res = sdlx.read(buf, { file: key, key, open, onError: (f, l, c, m) => errs.push({ file: f, line: l, code: c, msg: m }), preInclude: [] }); }
  catch (e) { throw fail('ENTCAT_DEF_PARSE', key + ': ' + e.message); }
  if (!res || !res.root) throw fail('ENTCAT_DEF_PARSE', key + ': no SDL tree');
  return { root: res.root, errs };
}
const FATAL_SDL = new Set(['BLOCK_UNCLOSED', 'BLOCK_END_STRAY', 'STR_EOF', 'MOD_UNCLOSED', 'DEFINE_UNCLOSED', 'BOM_UTF16']);

// extension name -> vfs key: as tools/entityindex resolveModel (relative to the def, then rooted at resource/)
function resolveExt(io, fromKey, name) {
  const ix = require('../../entityindex/index');
  try { const k = ix.resolveModel(io.has, fromKey, name); if (k && io.has(k)) return k; } catch (e) { /* fall through */ }
  const r = sdlx.resolveInclude(name, fromKey);
  return r.kind === 'virtual' && io.has(r.key) ? r.key : null;
}

function readAble(b, able) {
  const items = b.items.slice(1);
  let i = 0;
  if (items[0] && items[0].k === 'IDENT' && lc(items[0].text) === 'clear') { for (const n of ABLES) able[n] = false; i = 1; }
  for (const it of items.slice(i)) {
    if (it.k === 'IDENT') { const n = lc(it.text); if (ABLES.includes(n)) able[n] = true; continue; }
    if (it.k !== 'BLOCK') continue;
    const n = lc(nameOf(it));
    if (!ABLES.includes(n)) continue;
    const a = argsOf(it)[0];
    if (a && !isNum(a)) throw fail('ENTCAT_VOLUME_BAD', 'able ' + n + ' has a value that is not a number');
    able[n] = !a || Number(a.value) !== 0;
  }
}

const SHAPE_ARGS = { box: 3, cylinder: 2, sphere: 1 };
function readVolume(desc, b, src) {
  const nm = str0(b);
  const first = argsOf(b)[0];
  if (first && first.k === 'IDENT' && lc(first.text) === 'defaultmaterial') return;
  if (nm === null || nm === '') throw fail('ENTCAT_VOLUME_BAD', 'a Volume record without a name string (line ' + b.line + ')');
  const n = lc(nm);
  let v = desc.volumes.find(x => x.name === n);
  if (!v) {
    v = { name: n, able: {}, disabled: false, tags: [], thickness: null, shape: null, src };
    for (const a of ABLES) v.able[a] = ABLE_DEFAULT.includes(a);
    desc.volumes.push(v);
  }
  for (const c of kids(b)) {
    const k = lc(nameOf(c));
    if (k === 'able') readAble(c, v.able);
    else if (k === 'disabled') v.disabled = true;
    else if (k === 'tags') v.tags.push(...strs(c).map(lc));
    else if (k === 'thickness') { const t = nums(c); if (t.length) v.thickness = t[0]; }
    else if (SHAPE_ARGS[k]) {
      const a = nums(c);
      if (a.length < SHAPE_ARGS[k] || a.some(x => !Number.isFinite(x))) throw fail('ENTCAT_VOLUME_BAD', 'volume ' + n + ': {' + k + '} needs ' + SHAPE_ARGS[k] + ' numbers, has ' + a.length);
      v.shape = k;
    } else if (k === 'polyhedron') v.shape = 'polyhedron';
  }
}

function readShape(c) {
  const s = { kind: lc(nameOf(c)), center: null, extent: null, axis: null, radius: null, vertices: [], origin: null, destination: null };
  for (const x of kids(c)) {
    const k = lc(nameOf(x)), a = nums(x);
    if (k === 'center' || k === 'extent' || k === 'axis' || k === 'origin' || k === 'destination') s[k] = a.slice(0, 2);
    else if (k === 'radius') s.radius = a.length ? a[0] : null;
    else if (k === 'vertex') s.vertices.push(a.slice(0, 2));
  }
  return s;
}
function readObstacle(desc, b) {
  const o = { name: lc(str0(b) || ''), kind: null, rotate: false, shape: null, line: b.line };
  for (const c of kids(b)) {
    const k = lc(nameOf(c));
    if (SHAPES.has(k)) { o.shape = readShape(c); o.kind = o.shape.kind; }
    else if (k === 'rotate') o.rotate = true;
    else if (k === 'obstacleid') { const s = strs(c); if (s.length) desc.obstacleIds[lc(s[1] || o.name)] = lc(s[0]); }
  }
  desc.obstacles.push(o);
}

// {Sprite "x" {Scale n} ..}: the blocks after the name are sprite animation channels
// ReadSprite). PreScaleX, PreScaleY, Scale, ScaleX and ScaleY are scale channels (enum 5..9
// IsScaleChannel); any one of them makes skip r_stampResolutionScale
// [V]. scaleChannel records that; a channel with no plain number counts but keeps the value 1 [I].
const SCALE_CHANNELS = new Set(['prescalex', 'prescaley', 'scale', 'scalex', 'scaley']);
function readDecal(desc, b) {
  const d = { sprite: null, scale: 1, scaleXY: [1, 1], preScale: [1, 1], scaleChannel: false, useDirection: false };
  for (const c of kids(b)) {
    if (lc(nameOf(c)) === 'usedirection') d.useDirection = true;
    if (lc(nameOf(c)) !== 'sprite') continue;
    d.sprite = str0(c);
    for (const x of kids(c)) {
      const k = lc(nameOf(x)), a = nums(x);
      if (SCALE_CHANNELS.has(k)) d.scaleChannel = true;
      if (!a.length) continue;
      if (k === 'scale') d.scale = a[0];
      else if (k === 'scalex') d.scaleXY[0] = a[0];
      else if (k === 'scaley') d.scaleXY[1] = a[0];
      else if (k === 'prescalex') d.preScale[0] = a[0];
      else if (k === 'prescaley') d.preScale[1] = a[0];
    }
  }
  desc.decal = d;
}

const SFX_KEY = /^resource\/entity\/sfx\//;
// the blocks of one entity record (def or extension), in document order
function walk(io, desc, block, fromKey, depth) {
  for (const c of kids(block)) {
    const k = lc(nameOf(c));
    if (k === 'extension') {
      const nm = str0(c);
      if (!nm) continue;
      const ek = resolveExt(io, fromKey, nm);
      const isMdl = /\.mdl$/i.test(nm);
      desc.exts.push({ name: nm, key: ek, missing: !ek });
      if (!ek) {
        // a sound emitter def (resource/entity/sfx/..., GoH sfx/legacy/fire_loop {Extension "sound.mdl"}) has no body to
        // measure: a missing model is a note there, not a failed def [I]
        if (isMdl && !SFX_KEY.test(desc.key)) throw fail('ENTCAT_MDL_MISSING', 'Extension "' + nm + '" names a model that is not in the game or the stack');
        desc.notes.push({ code: 'ENTCAT_EXT_MISSING', msg: 'Extension "' + nm + '" not found' });
        continue;
      }
      if (isMdl && !desc.mdl) desc.mdl = ek;
      if (depth > 8) continue;
      const buf = io.read(ek);
      const { root, errs } = parse(io, ek, buf);
      const bad = errs.find(e => FATAL_SDL.has(e.code));
      if (bad) throw fail('ENTCAT_DEF_PARSE', ek + ':' + bad.line + ' ' + bad.code + ' ' + bad.msg);
      walk(io, desc, root, ek, depth + 1);
    } else if (k === 'volume') readVolume(desc, c, depth ? 'ext' : 'def');
    else if (k === 'obstacle') readObstacle(desc, c);
    else if (k === 'obstacleid') { const s = strs(c); if (s.length) desc.obstacleIds[lc(s[1] || '')] = lc(s[0]); }
    else if (k === 'props') desc.props.push(...strs(c).map(lc));
    else if (k === 'tag') { for (const s of strs(c)) desc.tags.push(...lc(s).split(' ').filter(Boolean)); }
    else if (k === 'compoundobstacles') desc.compound = true;
    else if (k === 'boarder') desc.boarder = true;
    else if (k === 'placer') {
      desc.placer = desc.placer || { places: [] };
      for (const p of kids(c)) {
        if (lc(nameOf(p)) !== 'place') continue;
        const at = kids(p).find(x => lc(nameOf(x)) === 'attach');
        desc.placer.places.push({ name: str0(p), attach: at ? lc(str0(at) || (argsOf(at)[0] && argsOf(at)[0].text) || '') : null });
      }
    } else if (k === 'extender') {
      const en = lc(str0(c) || (argsOf(c)[0] && argsOf(c)[0].text));
      if (en === 'structure') {
        desc.structure = desc.structure || [];
        for (const p of kids(c)) if (lc(nameOf(p)) === 'place') { const s = strs(p); if (s.length >= 2) desc.structure.push({ place: lc(s[0]), def: lc(s[1]) }); }
      }
      desc.extenders.push(en);
    } else if (k === 'decalview') readDecal(desc, c);
    else if (k === 'game_entity' || k === 'entity' || k === '' && depth === 0) walk(io, desc, c, fromKey, depth);
  }
}

function readDef(io, key) {
  const buf = io.read(key);
  if (!buf) throw fail('ENTCAT_DEF_MISSING', key + ' cannot be read');
  const { root, errs } = parse(io, key, buf);
  const bad = errs.find(e => FATAL_SDL.has(e.code));
  if (bad) throw fail('ENTCAT_DEF_PARSE', key + ':' + bad.line + ' ' + bad.code + ' ' + bad.msg);
  const top = kids(root)[0];
  if (!top) throw fail('ENTCAT_DEF_PARSE', key + ': no entity block');
  const desc = { key, kind: lc(nameOf(top)) || null, mdl: null, exts: [], volumes: [], obstacles: [], obstacleIds: {}, props: [], tags: [],
    structure: null, placer: null, boarder: false, compound: false, decal: null, extenders: [], notes: [] };
  for (const e of errs) if (e.code === 'INCLUDE_MISSING') desc.notes.push({ code: 'ENTCAT_INCLUDE_MISSING', msg: e.msg });
  walk(io, desc, top, key, 0);
  desc.props = [...new Set(desc.props)];
  desc.tags = [...new Set(desc.tags)];
  return desc;
}

module.exports = { readDef, ABLES, ABLE_DEFAULT, kids, nameOf, argsOf, strs, nums, str0, parse, lc };

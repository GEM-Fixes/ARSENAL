// recipe "a model": what it is for, copy a model of the game (its whole file set as soedit stage reads it: .mdl, every .ply .vol .anm
// it names, the .mtl and, when asked, the textures) or bring the files of a model (the core's multi file upload, a folder too), the
// broken and destroyed views (<name>_x, <name>_xx with the def renamed), then every model variable one by one: bones (name, type,
// place, turn, matrix, parameters, visibility, limits, speed), meshes (view, flags, lower detail levels, material, skin), volumes
// (add, thickness, props, obstacles, areas), animations (tracks, model and bone sequences, sequence options, crush) and the unit def
// (extension, lodclass, volume and bone entries). Hand-offs: the scrolling track texture and the skeleton extension (Notepad++ or
// SOEdit, the edited file comes back), the mesh shape (Blender GEM2, the .ply files come back).
// Writing: the core's copy list (plan first, restore point, only inside the picked mod); the model edits are one call to the own
// route r/model/edit (dry in plan: tools/lib/model/edit/core ops, saved at Write after the copies); the def entries are gen set
// rows on the def (copiesFirst: in plan gen sees the planned def copy in its overlay; at Write the copy lands before gen runs).
// The Check step (recipe.check) records the copy for SOEdit (Models stage keeps files already in the mod) and runs the Models check.
// Branch target: a unit task gets {mdl, folder, file} back. Contract: ../README.md. Author: Imperator_Aug (ARSENAL, ia-5d2e81c4)
// Author: Imperator_Aug (ARSENAL, ia-13aea814)
'use strict';
const fs = require('fs'), path = require('path');
const TOOLS = path.resolve(__dirname, '..', '..', '..', '..');
const D = () => require('../lib/draft');
const bad = (m, s) => Object.assign(new Error(m), { status: s || 400 });
const fwd = p => String(p || '').replace(/\\/g, '/');
const dirOf = k => k.slice(0, k.lastIndexOf('/'));
const baseOf = k => k.slice(k.lastIndexOf('/') + 1);
const gameOf = ctx => { try { return (ctx.game && ctx.game()) || null; } catch (e) { return null; } };
// game parity: the task's game (README "The game of a task"): x (c.game, opt.game, draft.game), else ctx.task.id, else ctx.gameId
// (a string in values and check, a function on a route ctx), else as64. MoW:AS2 shares the AS64 install, and a reader that names no
// exe sees the AS64 set (as64/core), so another game's reader is {dir, exe}; AS64 keeps the folder alone (as before)
const GM = require(path.join(TOOLS, 'lib', 'games'));
function gidOf(ctx, x) {
  let v = x;
  if (!v && ctx && ctx.task && ctx.task.id) v = ctx.task.id;
  if (!v && ctx) { try { v = typeof ctx.gameId === 'function' ? ctx.gameId() : ctx.gameId; } catch (e) { v = null; } }
  return GM.idOf(v) || 'as64';
}
// the game a reader takes: the AS2 install (ctx.game(), or a compile's c.gameDir) as a folder for AS64, else {dir, exe}; Gates of Hell
// (2026-11-23): the GoH install with exe goh (model.goh.js)
const MG = () => require('./model.goh');
function viewOf(ctx, x) {
  if (gidOf(ctx, x) === 'goh') return MG().view(ctx);
  const dir = (ctx && typeof ctx.gameDir === 'string' && ctx.gameDir) || gameOf(ctx || {}), id = gidOf(ctx, x);
  return !dir ? null : id === 'as64' ? dir : { dir, exe: GM.exeOf(id) };
}
const dirOfG = g => (!g ? null : typeof g === 'string' ? g : g.dir || null);
const exeOfG = g => (g && typeof g === 'object' && g.exe ? g.exe : undefined);
// another ext route called in process reads the task's game from its ctx
const rctxOf = ctx => (ctx && typeof ctx.routeCtx === 'function' ? ctx.routeCtx() : ctx);
const WHERE_RE = '^resource/entity(/[A-Za-z0-9_.#+-]+)+$';
const NAME_RE = '^[a-z0-9][a-z0-9_.-]{0,60}$';
const PURPOSE = { vehicle: 'resource/entity/-vehicle', soldier: 'resource/entity/humanskin', gun: 'resource/entity/inventory', item: 'resource/entity/inventory', building: 'resource/entity/construction', other: 'resource/entity/new_entity' };
// what an upload may hold: the core sniffs model/texture/text; '.ext' kinds match by extension (README Changes 32)
const KINDS = ['model', 'texture', '.mdl', '.ply', '.vol', '.anm', '.mtl', '.def', '.ext'];
const BRING_RE = /\.(mdl|ply|vol|anm|mtl|dds|tga|png|def|ext)$/;
const FILE_RE = /^[a-z0-9_.#+-]+$/;
const EDIT = 'POST /api/x/task/r/model/edit';
const EDIT_OPS = ['bone.rename', 'bone.set', 'bone.place', 'bone.setMatrix', 'bone.mesh', 'bone.lod.add', 'bone.lod.off', 'vol.add', 'vol.setThickness', 'vol.setProps', 'obst.add', 'mat.set', 'ply.skin', 'anm.bone.rename', 'tl.seq.add', 'tl.seq.set'];

// the game's files (soedit stage's reader), one per game folder for 10 minutes
const SRC = new Map();
// game: a folder (AS64, as before) or {dir, exe}; the cache key carries the exe, so the games never share a reader
function source(game) {
  const dir = dirOfG(game), exe = exeOfG(game);
  if (!dir) return null;
  const k = dir + '|' + (exe || '');
  const hit = SRC.get(k);
  if (hit && Date.now() - hit.at < 600000) return hit.src;
  const o = { game: dir }; if (exe) o.exe = exe;
  const src = require(path.join(TOOLS, 'soedit', 'stage')).openSource(o);
  SRC.set(k, { at: Date.now(), src });
  while (SRC.size > 4) SRC.delete(SRC.keys().next().value);
  return src;
}
// a game file as a key copy brings it (task/lib/compile readCopy: view/ref readKey with the route ctx and the mod); null when not read
// (c is the compile ctx: c.task = the task's game, c.gameDir its install; the route ctx is made from them as task/lib/game routeCtx does)
function defAsCopied(c, mod, key) {
  try {
    if (!mod || !fs.existsSync(mod) || !c || !c.task) return null;
    const rc = require('../lib/game').routeCtx({ game: () => (c.task.kind === 'goh' ? null : c.gameDir || null) }, c.task);
    return require('../../view/ref').readKey(rc, mod, key);
  } catch (e) { return null; }
}
function gameBytes(game, key) { try { const g = source(game); const r = g && g.get(key); return (r && r.buf) || null; } catch (e) { return null; } }
// a model's file set: {mdl, files: [{key, kind}], unresolved}
function fileSet(game, mdlKey) {
  const src = source(game);
  if (!src) return null;
  const c = require(path.join(TOOLS, 'soedit', 'stage')).collect(src, String(mdlKey).toLowerCase(), { textures: 'stage' });
  if (c.error) return { error: c.error };
  return { mdl: String(mdlKey).toLowerCase(), files: [...c.files.entries()].map(([key, i]) => ({ key, kind: i.kind })), unresolved: c.unresolved.length };
}
// the broken (_x) and destroyed (_xx) views next to a model folder: <parent>/x/<name>_x/
function wrecks(game, folder) {
  const src = source(game), out = [];
  if (!src) return out;
  const parent = dirOf(folder), name = baseOf(folder);
  for (const s of ['_x', '_xx']) {
    const dir = parent + '/x/' + name + s, mdl = dir + '/' + name + s + '.mdl';
    if (!src.has(mdl)) continue;
    const set = fileSet(game, mdl);
    if (!set || set.error) continue;
    const def = dir + '/' + name + s + '.def';
    out.push({ suffix: s, dir, mdl, def: src.has(def) ? def : null, files: set.files.filter(f => f.key.startsWith(dir + '/')).map(f => f.key) });
  }
  return out;
}
// names a model text holds (ply, vol, anm files and sequence names)
function namesIn(text) { const s = new Set(); String(text).replace(/"([^"]+)"/g, (m, n) => { s.add(n.toLowerCase()); s.add(n.toLowerCase().replace(/\.anm$/, '')); return m; }); return s; }
// a staged file into the draft's own staging (the core resolves a copy's staged name from its own draft, at any depth)
function stage(c, name, buf) { fs.mkdirSync(c.staging, { recursive: true }); fs.writeFileSync(path.join(c.staging, name), buf); return name; }
// uploaded names (sub-paths kept by the core): a picked folder's own name is dropped, the rest stays under the model folder
function bringNames(staged) {
  const ns = staged.map(s => fwd(s));
  const first = ns.length && ns.every(n => n.includes('/')) ? ns[0].split('/')[0] : null;
  const strip = first && ns.every(n => n.split('/')[0] === first);
  return ns.map(n => ({ staged: n, rel: (strip ? n.slice(first.length + 1) : n).toLowerCase() }));
}

// ---------- the answers as model edits: one line, one op
const TYPES = ['revolute', 'prizmatic', 'socket', 'planarsocket', 'wild', 'none'];
const FLAGS = { ground: 'Ground', decaltarget: 'DecalTarget', nocastshadows: 'NoCastShadows', nogetshadows: 'NoGetShadows', nogroupmesh: 'NoGroupMesh' };
const SIDES = ['front', 'top', 'left', 'right', 'rear', 'bottom'];
// sequence options as vanilla models use them (anim.seq_options is [I], not tested in game): a read-only scan of the 9588 .mdl/.ext
// of the game (3982 sequences): speed 2413 (0.05 to 10), resume 360, movement 59, smooth 30 (0 to 0.8), pinback 13 (2, or alone),
// autostart 11, store 5; rotate 4 (bone and axis, left out); duration, dynamicspeed, blend and pose never appear
const SEQ_SEEN = { speed: { range: [0.05, 10] }, smooth: { range: [0, 0.8] }, pinback: { flag: true, range: [2, 2], only: [2] }, resume: { flag: true }, movement: { flag: true }, autostart: { flag: true }, store: { flag: true } };
function linesOf(c, id) {
  const v = c.value(id);
  return [].concat(v == null ? [] : v).reduce((a, x) => a.concat(String(x == null ? '' : x).split(/\r?\n/)), []).map(s => s.trim()).filter(s => s && !s.startsWith(';'));
}
function lineErr(q, line, why) { return bad('model, ' + q + ': "' + line + '" ' + why); }
function pairOf(q, line) { const i = line.indexOf('='); if (i < 1) throw lineErr(q, line, 'needs the form left = right.'); return [line.slice(0, i).trim(), line.slice(i + 1).trim()]; }
function nums(q, line, s, n, m) {
  const a = String(s).trim().split(/[\s,]+/).filter(Boolean).map(Number);
  if (a.length < n || a.length > (m || n) || !a.every(Number.isFinite)) throw lineErr(q, line, 'needs ' + (m && m !== n ? n + ' to ' + m : n) + ' number(s).');
  return a;
}
function boneSlash(left) { const i = left.indexOf('/'); return i < 0 ? [null, left.trim()] : [left.slice(0, i).trim(), left.slice(i + 1).trim()]; }
function opsOf(c) {
  const L = id => linesOf(c, id), ops = [], last = [];
  const add = (op, args, q, line, late) => (late ? last : ops).push({ op, args, line: q + ': ' + line });
  for (const ln of L('bone_type')) { const [b, t] = pairOf('bone_type', ln); if (!TYPES.includes(t.toLowerCase())) throw lineErr('bone_type', ln, 'names no joint type (' + TYPES.join(', ') + ').'); add('bone.set', { bone: b, type: t.toLowerCase() === 'none' ? null : t.toLowerCase() }, 'bone_type', ln); }
  for (const ln of L('bone_position')) { const [b, v] = pairOf('bone_position', ln); add('bone.place', { bone: b, position: nums('bone_position', ln, v, 3) }, 'bone_position', ln); }
  for (const ln of L('bone_turn')) { const [b, v] = pairOf('bone_turn', ln); add('bone.place', { bone: b, euler: nums('bone_turn', ln, v, 3) }, 'bone_turn', ln); }
  for (const ln of L('bone_matrix')) { const [b, v] = pairOf('bone_matrix', ln); add('bone.setMatrix', { bone: b, matrix: nums('bone_matrix', ln, v, 12) }, 'bone_matrix', ln); }
  for (const ln of L('bone_params')) { const [b, v] = pairOf('bone_params', ln); add('bone.set', { bone: b, params: /^none$/i.test(v) ? null : v.replace(/^"|"$/g, '') }, 'bone_params', ln); }
  for (const ln of L('bone_visibility')) { const [b, v] = pairOf('bone_visibility', ln); const n = Number(v); if (!/^none$/i.test(v) && n !== 0) throw lineErr('bone_visibility', ln, 'takes 0 or none: vanilla models use only 0, other numbers are not tested in game.'); add('bone.set', { bone: b, visibility: /^none$/i.test(v) ? null : n }, 'bone_visibility', ln); }
  for (const ln of L('bone_limits')) { const [b, v] = pairOf('bone_limits', ln); add('bone.set', { bone: b, limits: /^none$/i.test(v) ? null : nums('bone_limits', ln, v, 1, 2) }, 'bone_limits', ln); }
  for (const ln of L('bone_speed')) { const [b, v] = pairOf('bone_speed', ln); const n = Number(v); if (!/^none$/i.test(v) && (!Number.isFinite(n) || n === 0)) throw lineErr('bone_speed', ln, 'needs a number other than 0 (0 stops the game loading the model).'); add('bone.set', { bone: b, speed: /^none$/i.test(v) ? null : n }, 'bone_speed', ln); }
  for (const ln of L('mesh_view')) { const [b, v] = pairOf('mesh_view', ln); if (!/^none$/i.test(v) && !/^[a-z0-9_.#+-]+\.ply$/i.test(v)) throw lineErr('mesh_view', ln, 'needs a .ply file name or none.'); add('bone.mesh', { bone: b, file: /^none$/i.test(v) ? null : v.toLowerCase() }, 'mesh_view', ln); }
  for (const ln of L('mesh_flags')) {
    const [b, v] = pairOf('mesh_flags', ln), w = v.split(/\s+/).filter(Boolean), flags = {}; let layer;
    for (let i = 0; i < w.length; i++) {
      const x = w[i].toLowerCase(), off = x.startsWith('-'), k = off ? x.slice(1) : x;
      if (k === 'layer') { layer = off ? null : w[++i]; if (!off && (layer == null || !/^[A-Za-z0-9_-]+$/.test(layer))) throw lineErr('mesh_flags', ln, 'needs a number or one word after layer.'); continue; }
      if (!FLAGS[k]) throw lineErr('mesh_flags', ln, 'names no mesh setting (' + Object.keys(FLAGS).join(', ') + ', layer N).');
      flags[FLAGS[k]] = !off;
    }
    add('bone.mesh', Object.assign({ bone: b }, Object.keys(flags).length ? { flags } : {}, layer !== undefined ? { layer } : {}), 'mesh_flags', ln);
  }
  for (const ln of L('mesh_lod')) { const [b, v] = pairOf('mesh_lod', ln); if (/^(off|on)$/i.test(v)) add('bone.lod.off', { bone: b, on: /^off$/i.test(v) }, 'mesh_lod', ln); else if (/^[a-z0-9_.#+-]+\.ply$/i.test(v)) add('bone.lod.add', { bone: b, file: v.toLowerCase() }, 'mesh_lod', ln); else throw lineErr('mesh_lod', ln, 'needs a .ply file name, off or on.'); }
  for (const ln of L('mesh_material')) { const [f, v] = pairOf('mesh_material', ln); if (!/\.ply$/i.test(f) || !/^[a-z0-9_.#+-]+$/i.test(v)) throw lineErr('mesh_material', ln, 'needs file.ply = material name.'); add('mat.set', { rel: f.toLowerCase(), part: 'all', name: v.toLowerCase(), create: true }, 'mesh_material', ln); }
  for (const ln of L('mesh_skin')) {
    const [f, v] = pairOf('mesh_skin', ln);
    if (!/\.ply$/i.test(f)) throw lineErr('mesh_skin', ln, 'needs a .ply file on the left.');
    if (/^clamp$/i.test(v)) { add('ply.skin', { rel: f.toLowerCase(), clamp: true }, 'mesh_skin', ln); continue; }
    const m = /^(\S+)\s*>\s*(\S+)$/.exec(v); if (!m) throw lineErr('mesh_skin', ln, 'needs old bone > new bone, or clamp.');
    add('ply.skin', { rel: f.toLowerCase(), rename: { from: m[1], to: m[2] } }, 'mesh_skin', ln);
  }
  for (const ln of L('vol_add')) {
    const [l, v] = pairOf('vol_add', ln), [b0, n0] = boneSlash(l), b = b0 || n0, name = b0 ? n0 : undefined, w = v.split(/\s+/), k = (w[0] || '').toLowerCase();
    const a = { bone: b, kind: k }; if (name) a.name = name;
    if (k === 'box') a.size = nums('vol_add', ln, w.slice(1).join(' '), 3);
    else if (k === 'sphere') a.radius = nums('vol_add', ln, w.slice(1).join(' '), 1)[0];
    else if (k === 'cylinder') { const x = nums('vol_add', ln, w.slice(1).join(' '), 2); a.radius = x[0]; a.length = x[1]; }
    else if (k === 'polyhedron' && /\.vol$/i.test(w[1] || '')) a.file = w[1].toLowerCase();
    else throw lineErr('vol_add', ln, 'needs box x y z, sphere r, cylinder r length or polyhedron file.vol.');
    add('vol.add', a, 'vol_add', ln);
  }
  // GoH: no model thickness, the lines go into the def (compile, model.goh.js volSets)
  for (const ln of (gidOf(c, c.game) === 'goh' ? [] : L('vol_thick'))) {
    const [vol, v] = pairOf('vol_thick', ln), w = v.split(/\s+/).filter(Boolean);
    if (w.length === 1) { add('vol.setThickness', { volume: vol, all: nums('vol_thick', ln, w[0], 1)[0] }, 'vol_thick', ln); continue; }
    const sides = {}; let all;
    for (let i = 0; i < w.length; i += 2) { const s = w[i].toLowerCase(), n = Number(w[i + 1]); if (!Number.isFinite(n) || n < 0) throw lineErr('vol_thick', ln, 'needs a number, 0 or more, after ' + w[i] + '.'); if (s === 'all') all = n; else if (SIDES.includes(s)) sides[s] = n; else throw lineErr('vol_thick', ln, 'names no side (' + SIDES.join(', ') + ').'); }
    add('vol.setThickness', Object.assign({ volume: vol, sides }, all !== undefined ? { all } : {}), 'vol_thick', ln);
  }
  for (const ln of L('vol_props')) {
    const [vol, v] = pairOf('vol_props', ln), w = v.split(/\s+/).filter(Boolean), a = { volume: vol };
    for (let i = 0; i < w.length; i++) {
      const k = w[i].toLowerCase();
      if (k === 'tags') { const t = []; while (i + 1 < w.length && !['component', 'density', 'material', 'tags'].includes(w[i + 1].toLowerCase())) t.push(w[++i]); a.tags = t; }
      else if (k === 'component' || k === 'material') { const x = w[++i]; if (!x) throw lineErr('vol_props', ln, 'needs a word after ' + k + '.'); a[k] = /^none$/i.test(x) ? null : x; }
      else if (k === 'density') { const n = Number(w[++i]); if (!(n > 0)) throw lineErr('vol_props', ln, 'needs a number above 0 after density.'); a.density = n; }
      else throw lineErr('vol_props', ln, 'names no volume setting (component, tags, density, material).');
    }
    add('vol.setProps', a, 'vol_props', ln);
  }
  const shapeOf = (q, ln, s) => {
    const w = s.split(/\s+/).filter(Boolean), k = (w[0] || '').toLowerCase(), rot = w[w.length - 1] && w[w.length - 1].toLowerCase() === 'rotate', n = (rot ? w.slice(1, -1) : w.slice(1)).join(' ');
    let a;
    if (k === 'obb2') { const x = nums(q, ln, n, 4, 6); a = { kind: 'Obb2', center: x.slice(0, 2), extent: x.slice(2, 4), axis: x.length === 6 ? x.slice(4, 6) : [1, 0] }; }
    else if (k === 'circle2') { const x = nums(q, ln, n, 3); a = { kind: 'Circle2', center: x.slice(0, 2), radius: x[2] }; }
    else if (k === 'polygon2') { const x = nums(q, ln, n, 6, 64); if (x.length % 2) throw lineErr(q, ln, 'needs pairs of numbers.'); a = { kind: 'Polygon2', vertices: [] }; for (let i = 0; i < x.length; i += 2) a.vertices.push([x[i], x[i + 1]]); }
    else throw lineErr(q, ln, 'needs obb2 cx cy ex ey, circle2 cx cy r or polygon2 x y x y x y.');
    if (rot) a.rotate = true;
    return a;
  };
  for (const ln of L('obstacle')) { const i = ln.indexOf('='), name = i > 0 ? ln.slice(0, i).trim() : undefined; add('obst.add', Object.assign({ type: 'obstacle' }, name ? { name } : {}, shapeOf('obstacle', ln, i > 0 ? ln.slice(i + 1) : ln)), 'obstacle', ln); }
  for (const ln of L('area')) { const [n, v] = pairOf('area', ln); if (!/^(interior|cut)$/i.test(n)) throw lineErr('area', ln, 'names no area (interior or cut).'); add('obst.add', Object.assign({ type: 'area', name: n.toLowerCase() }, shapeOf('area', ln, v)), 'area', ln); }
  const anmName = (q, ln, f) => { if (!/^[a-z0-9_.#+-]+\.anm$/i.test(f)) throw lineErr(q, ln, 'needs a .anm file name.'); return f.toLowerCase(); };
  for (const ln of L('seq_model')) { const [n, f] = pairOf('seq_model', ln); add('tl.seq.add', { name: n, file: anmName('seq_model', ln, f) }, 'seq_model', ln); }
  for (const ln of L('seq_bone')) { const [l, f] = pairOf('seq_bone', ln), [b, n] = boneSlash(l); if (!b || !n) throw lineErr('seq_bone', ln, 'needs bone / name = file.anm.'); add('tl.seq.add', { name: n, file: anmName('seq_bone', ln, f), bone: b }, 'seq_bone', ln); }
  const crush = String(c.value('crush') || '').trim();
  if (crush) add('tl.seq.add', { name: 'crush', file: anmName('crush', crush, crush) }, 'crush', crush);
  for (const ln of L('seq_options')) {
    const [l, v] = pairOf('seq_options', ln), [b, n] = boneSlash(l), w = v.split(/\s+/).filter(Boolean), fields = {};
    for (let i = 0; i < w.length; i++) {
      const k0 = w[i].toLowerCase(), off = k0.startsWith('-'), k = off ? k0.slice(1) : k0, vals = [];
      while (i + 1 < w.length && /^-?[\d.]+$/.test(w[i + 1])) vals.push(Number(w[++i]));
      const seen = SEQ_SEEN[k];
      if (!seen) throw lineErr('seq_options', ln, 'names an option no vanilla model uses (' + Object.keys(SEQ_SEEN).join(', ') + ').');
      if (off) { if (vals.length) throw lineErr('seq_options', ln, 'removes ' + k + ' and takes no number.'); fields[k] = null; continue; }
      if (vals.length > 1) throw lineErr('seq_options', ln, 'takes one number after ' + k + '.');
      if (!vals.length) { if (!seen.flag) throw lineErr('seq_options', ln, 'needs a number after ' + k + '.'); fields[k] = true; continue; }
      if (!seen.range || vals[0] < seen.range[0] || vals[0] > seen.range[1] || (seen.only && !seen.only.includes(vals[0]))) throw lineErr('seq_options', ln, 'gives ' + k + ' a value no vanilla model uses (' + (seen.only ? seen.only.join(', ') : seen.range ? seen.range.join(' to ') : 'no number') + ').');
      fields[k] = vals[0];
    }
    add('tl.seq.set', Object.assign({ sequence: n, fields }, b ? { bone: b } : {}), 'seq_options', ln);
  }
  for (const ln of L('anim_track')) { const [f, v] = pairOf('anim_track', ln), m = /^(\S+)\s*>\s*(\S+)$/.exec(v); if (!m) throw lineErr('anim_track', ln, 'needs old bone > new bone.'); add('anm.bone.rename', { rel: anmName('anim_track', ln, f), bone: m[1], name: m[2] }, 'anim_track', ln); }
  for (const ln of L('bone_name')) { const [o, n] = pairOf('bone_name', ln); if (!/^[A-Za-z0-9_.#+-]+$/.test(n)) throw lineErr('bone_name', ln, 'needs a plain new name (letters, digits, _ . # + -).'); add('bone.rename', { bone: o, name: n, anm: true }, 'bone_name', ln, true); }
  return ops.concat(last);
}

// ---------- the unit def: patch-entity splices on a staged copy
// the n-th {kw ...} under the root block (same-name siblings, case-insensitive) whose first value is "key"
function keyedIndex(text, kw, key) {
  let d = 0, n = -1, hit = -1; const K = kw.toLowerCase(), Q = String(key).toLowerCase();
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') { const j = text.indexOf('"', i + 1); i = j < 0 ? text.length : j; continue; }
    if (ch === ';') { const j = text.indexOf('\n', i); i = j < 0 ? text.length : j; continue; }
    if (ch === '}') { d--; continue; }
    if (ch !== '{') continue;
    d++;
    if (d !== 2) continue;
    const m = /^\{\s*([A-Za-z_]\w*)\s*(?:"([^"]*)")?/.exec(text.slice(i, i + 240));
    if (m && m[1].toLowerCase() === K) { n++; if (hit < 0 && m[2] != null && m[2].toLowerCase() === Q) hit = n; }
  }
  return { hit, count: n + 1 };
}
// the def entries as gen set rows on file:<def> (gen applies them in order on one buffer, all or nothing). The planned copy of the def
// is in the gen plan's overlay (copiesFirst, README Changes 40), so the rows plan against the def the copy brings. The index of a
// keyed entry ({volume "body1"}) is read from the def the copy brings; a missing one is appended first (op append) and is then the last.
function defRows(buf, edits, defKey) {
  const rootM = /\{\s*([A-Za-z_]\w*)/.exec(buf.toString('latin1'));
  if (!rootM) throw bad('model, unit file: the def has no root block.');
  const root = rootM[1], text = buf.toString('latin1'), rows = [], made = new Map(), entity = 'file:' + defKey;
  for (const e of edits) {
    if (!e.kw) { rows.push({ entity, path: root + '/' + e.key, value: e.value, op: 'add' }); continue; }
    const id = e.kw + '\n' + e.name.toLowerCase();
    let at = made.get(id);
    if (at === undefined) {
      const ix = keyedIndex(text, e.kw, e.name);
      if (ix.hit >= 0) at = ix.hit;
      else { at = ix.count + [...made.keys()].filter(k => k.startsWith(e.kw + '\n') && made.get(k) >= ix.count).length; rows.push({ entity, path: root + '/' + e.kw, value: '"' + e.name + '"', op: 'append' }); }
      made.set(id, at);
    }
    rows.push({ entity, path: root + '/' + e.kw + '[' + at + ']/' + e.key, value: e.value, op: 'add' });
  }
  return rows;
}
function defEditsOf(c) {
  const out = [], ext = String(c.value('def_ext') || '').trim(), lod = String(c.value('def_lodclass') || '').trim();
  if (ext) { if (!/^[a-z0-9_.#+/-]+\.mdl$/i.test(ext)) throw bad('model, def_ext: "' + ext + '" is not a .mdl file name.'); out.push({ key: 'extension', value: '"' + ext + '"', line: 'extension ' + ext }); }
  if (lod) { if (!/^[A-Za-z0-9_]+$/.test(lod)) throw bad('model, def_lodclass: "' + lod + '" is one plain word.'); out.push({ key: 'lodclass', value: '"' + lod + '"', line: 'lodclass ' + lod }); }
  for (const [q, kw] of [['def_volume', 'volume'], ['def_bone', 'bone']]) for (const ln of linesOf(c, q)) {
    const [l, v] = pairOf(q, ln), w = l.split(/\s+/).filter(Boolean);
    if (w.length !== 2 || !/^[A-Za-z0-9_.#+-]+$/.test(w[0]) || !/^[A-Za-z_]\w*$/.test(w[1]) || !v || /[\r\n]/.test(v)) throw lineErr(q, ln, 'needs: name key = value (like body1 thickness = 60).');
    out.push({ kw, name: w[0], key: w[1], value: v, line: ln });
  }
  return out;
}

// ---------- lookups and routes
async function mdlLookup(ctx, words, opt) {
  // the task's game view (lib/game.js view: no as64/core for MoW:AS2); AS64, or no task in the ctx: files/lib vfsFor as before
  const mod = (opt && opt.mod) || ctx.mod || '', TG = (() => { try { return require('../lib/game'); } catch (e) { return null; } })();
  const id = gidOf(ctx, opt && opt.game), tg = id !== 'as64' && TG ? (ctx.task && ctx.task.id === id ? ctx.task : TG.of(ctx, id)) : null;
  const vf = tg ? await TG.viewAsync(ctx, tg, mod) : require('../../files/lib').vfsFor(ctx, mod);
  if (!vf.v) return [];
  const ws = String(words || '').toLowerCase().split(/[\s,]+/).filter(Boolean), out = [];
  for (const [key, rec] of vf.v.files) {
    if (!key.endsWith('.mdl') || !key.startsWith('resource/entity/')) continue;
    if (ws.length && !ws.every(w => key.includes(w))) continue;
    out.push({ id: key, name: baseOf(dirOf(key)), where: rec.layer || '', ref: { key }, sub: key });
    if (out.length > 3000) break;
  }
  out.sort((a, b) => a.id.length - b.id.length || (a.id < b.id ? -1 : 1));
  return out;
}
// a model folder the game already has (any file in <where>/<name>/): a make there would replace that game model in the mod
function gameHasFolder(game, folder) {
  try { const s = source(game); return !!(s && (s.keysIn(String(folder).toLowerCase().replace(/\/*$/, '/')) || []).length); } catch (e) { return false; }
}
function freeName(game, where, base) {
  const stem = String(base).replace(/_new\d*$/, '') + '_new';
  for (let i = 1; i < 100; i++) { const n = i === 1 ? stem : stem + i; if (!gameHasFolder(game, where + '/' + n)) return n; }
  return stem + Date.now().toString(36);
}
// lookup "modelname": the exact name is taken when the game has that model folder (the core's unique check, the own name on change)
function nameLookup(ctx, words, opt) {
  const n = String(words || '').trim().toLowerCase(), where = fwd((opt && opt.in) || '').replace(/\/+$/, '').toLowerCase();
  if (!n || !new RegExp(WHERE_RE).test(where)) return { results: [], exact: false };
  const hit = gameHasFolder(viewOf(ctx, opt && opt.game), where + '/' + n);
  return { results: hit ? [{ id: n, name: n, where: 'game', ref: { key: where + '/' + n }, sub: where + '/' + n }] : [], exact: hit };
}
// the names a model holds, for the list questions: bones (type, mesh), volumes, meshes (.ply), sequences (bone / name), animations (.anm)
function namesOf(buf) {
  const m = require(path.join(TOOLS, 'lib', 'model', 'mdl')).parse(buf), uniq = a => [...new Set(a.filter(Boolean))];
  const meshes = [], anms = [];
  for (const b of m.bones || []) for (const v of b.views || []) { meshes.push(v.file); for (const l of v.lods || []) meshes.push(l.file); }
  const seqs = (m.sequences || []).map(s => { if (s.file) anms.push(s.file); const bn = s.bone ? s.bone.split('/').pop() : null; return bn ? bn + ' / ' + s.name : s.name; });
  return {
    error: m.error || null,
    bones: (m.bones || []).map(b => ({ name: b.name, type: b.type ? b.type.toLowerCase() : '', mesh: ((b.views || [])[0] || {}).file || '' })).filter(b => b.name),
    volumes: uniq((m.volumes || []).map(v => v.name)), meshes: uniq(meshes.map(x => baseOf(fwd(String(x)).toLowerCase())).filter(x => /\.ply$/.test(x))),
    sequences: uniq(seqs), anms: uniq(anms.map(x => baseOf(fwd(String(x)).toLowerCase())).map(x => (/\.anm$/.test(x) ? x : x + '.anm'))),
  };
}
async function namesRoute(u, b, ctx) {
  const id = qp(u, 'draft'), d = D().load(ctx, id), none = { from: null, bones: [], volumes: [], meshes: [], sequences: [], anms: [] };
  let buf = null, from = null;
  try { const p = await placeOf(d, ctx); if (p.mdl && d.mod) { buf = fs.readFileSync(path.join(d.mod, ...p.mdl.split('/'))); from = 'mod'; } } catch (e) { buf = null; }
  if (!buf) {
    for (const q of ['upload', 'program']) {
      const a = (d.answers || {})[q], n = a && a.src === 'file' ? [].concat(a.staged || []).find(x => /\.mdl$/i.test(x)) : null;
      if (!n) continue;
      try { buf = fs.readFileSync(D().stagedPath(ctx, id, n)); from = 'brought'; break; } catch (e) { buf = null; }
    }
  }
  const key = d.base && ((d.base.ref && d.base.ref.key) || d.base.id);
  if (!buf && key && /\.mdl$/i.test(String(key))) { buf = gameBytes(viewOf(ctx, d.game), String(key).toLowerCase()); if (buf) from = 'game'; }
  if (!buf) return none;
  return Object.assign({ from }, namesOf(buf));
}
const qp = (u, k) => (u && u.searchParams ? u.searchParams.get(k) || '' : '');
const KEY_RE = /^resource\/entity\/[a-z0-9_.#+\/-]+\.mdl$/;
function modelsRoute(name) { const r = require('../../models/server').routes[name]; if (!r) throw bad('No route ' + name, 404); return r; }
// a file the ops name by its plain name (body.ply) is the document file of that name, the one in the model folder first
function relsIn(doc, a) {
  if (!a || typeof a.rel !== 'string' || a.rel.includes('/')) return a;
  const want = a.rel.toLowerCase(), hits = [...doc.files.keys()].filter(k => baseOf(k.toLowerCase()) === want);
  const own = hits.find(k => dirOf(k.toLowerCase()) === dirOf(String(doc.mdl).toLowerCase()));
  return Object.assign({}, a, { rel: own || hits[0] || a.rel });
}
async function editRoute(u, b, ctx) {
  b = b || {};
  const mod = String(b.mod || '');
  if (!path.isAbsolute(mod)) throw bad('Pick your mod first: a model is changed only in the mod you picked.');
  const mdl = String(b.mdl || '').toLowerCase();
  if (!KEY_RE.test(mdl) || mdl.split('/').includes('..')) throw bad('Name the model as written (resource/entity/.../x.mdl).');
  const ops = Array.isArray(b.ops) ? b.ops : [];
  for (const o of ops) if (!o || !EDIT_OPS.includes(o.op) || (o.args != null && typeof o.args !== 'object')) throw bad('Not a model edit this task makes: ' + JSON.stringify(o).slice(0, 80));
  if (!ops.length) return { ok: true, files: [], notes: [] };
  // Gates of Hell: the GoH install is the game the core reads (exe goh below), not the page's AS2 folder
  const goh = gidOf(ctx) === 'goh', dry = b.write !== true || b.dry === true, target = dirOf(mdl), game = goh ? dirOfG(viewOf(ctx)) : gameOf(ctx);
  if (goh && !game) throw bad('Set the Gates of Hell folder first (the Game folder button at the top): the model edits read the game\'s model.');
  // where the model is read from: the mod (after the copies), the draft's staged upload (plan of a bring), the game (plan of a copy)
  let open, how = 'mod', map = r => r;
  if (fs.existsSync(path.join(mod, ...mdl.split('/')))) open = { mdl };
  else if (b.draft && b.staged) {
    const p = D().stagedPath(ctx, String(b.draft), String(b.staged)), root = path.dirname(p);
    if (!fs.existsSync(p)) throw bad('model edits: the brought model is gone: ' + b.staged + '. Bring it again.', 404);
    open = { mdl: p }; how = 'staged';
    map = r => (r.startsWith('resource/') && fs.existsSync(path.join(root, ...r.slice(9).split('/'))) ? target + '/' + r.slice(9).toLowerCase() : r);
  } else if (b.from && KEY_RE.test(String(b.from).toLowerCase())) {
    const from = String(b.from).toLowerCase(), fd = dirOf(from);
    open = { mdl: from }; how = 'game';
    map = r => (r.toLowerCase().startsWith(fd + '/') ? target + r.slice(fd.length).toLowerCase() : r);
  } else return { ok: true, files: [], notes: ['model edits: the model is not there yet; the edits run at Write, after the copies'] };
  if (how !== 'mod' && !dry) throw bad('model edits: ' + mdl + ' is not in the mod; the copies must come first.', 409);
  const core = require(path.join(TOOLS, 'lib', 'model', 'edit', 'core'));
  let doc;
  // exe: the game of the route (MoW:AS2 reads no as64/core); AS64 passes none, as before
  const exe = exeOfG(viewOf(ctx));
  try { doc = core.open(Object.assign({ mod, game }, exe ? { exe } : {}, open)); } catch (e) { throw bad('model edits: ' + String(e.message || e)); }
  try {
    for (const o of ops) {
      try { doc.apply(o.op, relsIn(doc, Object.assign({}, o.args || {}))); } catch (e) { throw bad('model edits, ' + (o.line || o.op) + ': ' + String(e.message || e)); }
    }
    // Gates of Hell: every file guarded and given a restore point (lib/modwrite) before the core writes it
    const restore = goh && !dry ? MG().guardSave(doc, mod, game) : null;
    const s = doc.save({ dry });
    const files = s.writes.map(w => map(w.rel)), notes = (s.notes || []).slice();
    if (how !== 'mod') notes.push('model edits: checked on the ' + (how === 'staged' ? 'brought' : 'game') + ' model; written at Write after the copies');
    const lost = ((s.check && s.check.findings) || []).slice(0, 10).map(f => 'model edits: ' + f.file + (f.line ? ':' + f.line : '') + ' ' + f.code + ' ' + f.msg);
    const out = { ok: !s.refused.length, files, notes: notes.concat(lost), written: !!s.written, ops: ops.length };
    if (s.refused.length) out.error = 'model edits refused: ' + s.refused.map(r => (r.rel ? r.rel + ': ' : '') + r.reason).join('; ');
    if (restore) { out.restore = restore; out.undo = require(path.join(TOOLS, 'lib', 'modwrite')).restoreRoot(mod); }
    return out;
  } finally { core.close(doc.id); }
}
const routes = {
  // the file set of a game model (what Copy would write), read only
  'GET /api/x/task/r/model/set': async (u, b, ctx) => {
    const key = qp(u, 'key');
    if (!/\.mdl$/i.test(key)) throw bad('Name a .mdl file.');
    const s = fileSet(viewOf(ctx), key);
    if (!s) throw bad('No game folder found. Set the game folder first (the Game folder button at the top).');
    if (s.error) throw bad(s.error, 404);
    return Object.assign(s, { wrecks: wrecks(viewOf(ctx), dirOf(s.mdl)).map(w => ({ suffix: w.suffix, mdl: w.mdl, files: w.files.length })) });
  },
  // the model edits of one task: tools/lib/model/edit/core ops on the model, dry in plan (the core passes dry), saved at Write
  [EDIT]: editRoute,
  // Gates of Hell: the volume thickness lines written into the unit file's {volume} blocks (model.goh.js)
  'POST /api/x/task/r/model/gohvol': (u, b, ctx) => MG().volRoute(u, b, ctx),
  // the names in the task's model (the mod's written copy, else the brought .mdl, else the game model it copies), read only
  'GET /api/x/task/r/model/names': namesRoute,
};

// the model folder and file a draft writes (answers over the guessed values)
async function placeOf(draft, ctx) {
  let vals = {}; try { vals = (await module.exports.values(ctx, draft.base, { draft })) || {}; } catch (e) { vals = {}; }
  const a = draft.answers || {}, val = id => (a[id] && a[id].src === 'value' ? a[id].value : vals[id]);
  let where = fwd(val('where') || '').replace(/\/+$/, '').toLowerCase();
  if ((!a.where || a.where.src === 'keep') && !draft.base && PURPOSE[val('purpose')]) where = PURPOSE[val('purpose')];
  const name = String(val('name') || '').toLowerCase(), target = where + '/' + name;
  let mdl = null;
  try { const own = fs.readdirSync(path.join(draft.mod, ...target.split('/'))).filter(n => /\.mdl$/i.test(n)).map(n => n.toLowerCase()); const want = vals._set ? baseOf(vals._set.mdl) : name + '.mdl'; mdl = own.includes(want) ? want : own[0] || null; } catch (e) { mdl = null; }
  return { target, mdl: mdl ? target + '/' + mdl : null };
}

// picker.check at upload (README Changes 50): a brought file the game could not use is refused at once, in the page's language, not at
// Write: a type the question does not take, a name the game cannot read, a .mdl that does not parse or has no {Skeleton} (all 9499
// vanilla .mdl parse with one, read-only scan)
const fileCheck = (re, words) => f => {
  const n = String((f && f.name) || '').toLowerCase();
  if (!re.test(n)) return { key: 'task.model.e.type', params: { n, w: words }, why: 'The file ' + n + ' is not a file this question takes (' + words + ').' };
  if (!FILE_RE.test(n)) return { key: 'task.model.e.name', params: { n }, why: 'The file ' + n + ' has a name the game cannot read: small English letters, digits, _ . # + and - only.' };
  if (/\.mdl$/.test(n)) {
    let m = null; try { m = require(path.join(TOOLS, 'lib', 'model', 'mdl')).parse(Buffer.from(f.bytes || [])); } catch (e) { m = { error: String(e.message || e) }; }
    if (m.error || !m.skeleton) { const w = m.error || 'no {Skeleton} block'; return { key: 'task.model.e.mdl', params: { n, w }, why: 'The model file ' + n + ' cannot be read: ' + w + '.' }; }
  }
  return null;
};
const BRING_W = 'mdl, ply, vol, anm, mtl, def, ext, dds, tga, png';
const L = (id, kind, extra) => Object.assign({ id, kind, ask: 'task.model.q.' + id, help: 'task.model.h.' + id }, extra || {});
// a list of lines with the copied model's names beside it (own kind mlist, model.client.js): names = which names, add = what follows a
// clicked name on the new line
const LIST = (id, covers, re, limit, names, add) => L(id, 'mlist', Object.assign({ covers, limits: Object.assign({ re }, limit ? { limit } : {}) }, names ? { names, add: add || ' = ' } : {}));
const W = '[A-Za-z0-9_.#+-]+', N = '-?[0-9.]+', SP = '\\s*=\\s*';
module.exports = {
  id: 'model',
  verbs: ['make', 'change'],
  // Gates of Hell (2026-11-23): the same steps read through the GoH install (model.goh.js: viewOf gives {dir: GoH, exe goh} to the
  // soedit stage reader and the edit core; the edit route guards and keeps restore points with lib/modwrite); the model volume
  // thickness goes into the def's {volume} blocks there (GoH armour lives in the def: model.goh.js volSets, route gohvol). Everything on
  // GoH is [T]
  games: ['as64', 'mowas2', 'goh'],
  needs: ['mod'],
  order: 170,
  title: { make: 'task.model.t', change: 'task.model.tc' },
  test: 'task.model.test',
  census: 'model',
  base: { lookup: 'mdl' },
  groups: [
    { id: 'what', title: 'task.model.g.what', essential: true, q: [
      L('source', 'choice', { covers: ['bone.file'], limits: { values: ['copy', 'bring', 'outside'], limit: 'FMT-21' } }),
      L('purpose', 'choice', { limits: { values: Object.keys(PURPOSE) }, when: { source: ['bring', 'outside'] } }),
      L('where', 'text', { limits: { re: WHERE_RE } }),
      L('name', 'id', { limits: { re: NAME_RE, limit: 'STR-14' }, unique: { lookup: 'modelname', in: 'where' } }),
    ] },
    { id: 'files', title: 'task.model.g.files', essential: true, q: [
      L('upload', 'file', { multi: true, covers: ['mesh.ply', 'vol.vol_file'], picker: { sources: ['file'], kinds: KINDS, check: fileCheck(BRING_RE, BRING_W) }, limits: { limit: 'FMT-01' }, when: { source: 'bring' } }),
      L('program', 'handoff', { multi: true, covers: ['mesh.ply.vertices'], picker: { sources: ['ext', 'file'], kinds: KINDS, check: fileCheck(BRING_RE, BRING_W), ext: ['blender-gem2', 'soedit', '3dsmax-gem'] }, limits: { limit: 'FMT-10' }, when: { source: 'outside' } }),
    ] },
    { id: 'parts', title: 'task.model.g.parts', essential: false, q: [
      L('textures', 'yesno', { limits: { limit: 'FMT-03' }, when: { source: 'copy' } }),
      L('anims', 'yesno', { covers: ['anim.file'], limits: { limit: 'FMT-08' }, when: { source: 'copy' } }),
      L('wreck', 'yesno', { covers: ['wreck.broken', 'wreck.destroyed'], limits: { limit: 'STR-31' } }),
      L('crush', 'text', { optional: true, covers: ['wreck.crush'], limits: { re: '^(' + W + '\\.anm)?$' } }),
    ] },
    { id: 'bones', title: 'task.model.g.bones', essential: false, q: [
      LIST('bone_name', ['bone.name'], '^' + W + SP + W + '$', 'STR-14', 'bones'),
      LIST('bone_type', ['bone.type'], '^' + W + SP + '(revolute|prizmatic|socket|planarsocket|wild|none)$', null, 'bones'),
      LIST('bone_position', ['bone.position'], '^' + W + SP + N + '[\\s,]+' + N + '[\\s,]+' + N + '$', null, 'bones'),
      LIST('bone_turn', ['bone.orientation'], '^' + W + SP + N + '[\\s,]+' + N + '[\\s,]+' + N + '$', null, 'bones'),
      LIST('bone_visibility', ['bone.visibility'], '^' + W + SP + '(0|none)$', null, 'bones'),
      LIST('bone_limits', ['bone.limits'], '^' + W + SP + '(' + N + '([\\s,]+' + N + ')?|none)$', null, 'bones'),
      LIST('bone_speed', ['bone.speed'], '^' + W + SP + '(' + N + '|none)$', null, 'bones'),
      L('bone_uv', 'handoff', { covers: ['bone.uv_anim'], picker: { sources: ['keep', 'ext', 'file'], kinds: ['.mdl'], check: fileCheck(/\.mdl$/, 'mdl'), ext: ['notepadpp', 'soedit'] } }),
      L('bone_ext', 'handoff', { covers: ['bone.extension'], multi: true, picker: { sources: ['keep', 'ext', 'file'], kinds: ['.mdl', '.ext'], check: fileCheck(/\.(mdl|ext)$/, 'mdl, ext'), ext: ['notepadpp', 'soedit'] } }),
    ] },
    { id: 'expert', title: 'task.model.g.expert', essential: false, q: [
      LIST('bone_matrix', ['bone.matrix34'], '^' + W + SP + '(' + N + '[\\s,]+){11}' + N + '$', null, 'bones'),
      LIST('bone_params', ['bone.parameters'], '^' + W + SP + '[^"\\r\\n]+$', null, 'bones'),
    ] },
    { id: 'mesh', title: 'task.model.g.mesh', essential: false, q: [
      LIST('mesh_view', ['mesh.volumeview'], '^' + W + SP + '(' + W + '\\.ply|none)$', null, 'bones'),
      LIST('mesh_flags', ['mesh.flags'], '^' + W + SP + '.+$', null, 'bones'),
      LIST('mesh_lod', ['lod.view'], '^' + W + SP + '(' + W + '\\.ply|off|on)$', 'FMT-21', 'bones'),
      LIST('mesh_material', ['mesh.ply.material'], '^' + W + '\\.ply' + SP + W + '$', 'FMT-03', 'meshes'),
      LIST('mesh_skin', ['mesh.ply.skin'], '^' + W + '\\.ply' + SP + '(' + W + '\\s*>\\s*' + W + '|clamp)$', 'FMT-10', 'meshes'),
      L('edit', 'handoff', { multi: true, covers: ['mesh.ply.vertices'], picker: { sources: ['keep', 'ext', 'file'], kinds: ['.ply', '.anm', '.vol'], check: fileCheck(/\.(ply|anm|vol)$/, 'ply, anm, vol'), ext: ['blender-gem2', '3dsmax-gem', 'mow-ply-tweaker'] }, limits: { limit: 'FMT-01' } }),
    ] },
    { id: 'volumes', title: 'task.model.g.volumes', essential: false, q: [
      LIST('vol_add', ['vol.volume'], '^' + W + '(\\s*/\\s*' + W + ')?' + SP + '(box|sphere|cylinder|polyhedron)\\s.+$', null, 'bones', ' / '),
      LIST('vol_thick', ['vol.props'], '^' + W + SP + '.+$', null, 'volumes'),
      LIST('vol_props', ['vol.props'], '^' + W + SP + '.+$', null, 'volumes'),
      LIST('obstacle', ['vol.obstacle'], '^(' + W + SP + ')?(obb2|circle2|polygon2)\\s.+$'),
      LIST('area', ['vol.area'], '^(interior|cut)' + SP + '(obb2|circle2|polygon2)\\s.+$'),
    ] },
    { id: 'anims', title: 'task.model.g.anims', essential: false, q: [
      LIST('anim_track', ['anim.tracks'], '^' + W + '\\.anm' + SP + W + '\\s*>\\s*' + W + '$', 'FMT-09', 'anms'),
      LIST('seq_model', ['anim.skeleton_seq'], '^' + W + SP + W + '\\.anm$', null, 'sequences'),
      LIST('seq_bone', ['anim.bone_seq'], '^' + W + '\\s*/\\s*' + W + SP + W + '\\.anm$', null, 'bones', ' / '),
      LIST('seq_options', ['anim.seq_options'], '^(' + W + '\\s*/\\s*)?' + W + SP + '(-?(resume|movement|autostart|store|pinback)|speed [0-9.]+|smooth [0-9.]+|pinback 2)(\\s+(-?(resume|movement|autostart|store|pinback)|speed [0-9.]+|smooth [0-9.]+|pinback 2))*$', null, 'sequences'),
    ] },
    { id: 'def', title: 'task.model.g.def', essential: false, q: [
      L('def_copy', 'yesno', { when: { source: 'copy' } }),
      L('def_ext', 'text', { optional: true, covers: ['def.extension'], limits: { re: '^(' + W + '\\.mdl)?$' } }),
      L('def_lodclass', 'text', { optional: true, covers: ['def.lodclass'], limits: { re: '^[A-Za-z0-9_]*$', limit: 'VIS-20' } }),
      LIST('def_volume', ['def.volume'], '^' + W + '\\s+[A-Za-z_]\\w*' + SP + '.+$', null, 'volumes', ' '),
      LIST('def_bone', ['def.bone_modifier'], '^' + W + '\\s+[A-Za-z_]\\w*' + SP + '.+$', null, 'bones', ' '),
    ] },
  ],
  kept: [
    ['def.zclipvisibility', 'meaning not proven [I]: no vanilla def uses it; the def question (def_volume style, gen set or patch-entity) could write it once a test shows what it does'],
    ['bone.speed2', 'meaning not proven [I]: the Models tool step exists (bone.set speed2); kept until a test shows what the second speed drives'],
    ['bone.terminator', 'meaning not proven [I]: the Models tool step exists (bone.set terminator); kept until a test shows what it stops'],
    ['bone.color', 'meaning not proven [I]: the Models tool step exists (bone.set color); kept until a test shows where the game shows it'],
    ['wreck.limit', 'meaning not proven [I]: gen set could write set/entitymanager.set group "broken" {limit 5}, but that it is the wreck count on the map is not traced'],
    ['lod.class', 'no tool step: the distance classes in set/level_of_detail*.set are blocks with string names and macro distances (scale d(300)) that gen set cannot address, and no outside program edits them (VIS-20)'],
  ],
  checklist: ['task.model.c.shows', 'task.model.c.parts', 'task.model.c.wreck', 'task.model.c.log'],
  lookups: { mdl: async (ctx, words, opt) => mdlLookup(ctx, words, opt), modelname: async (ctx, words, opt) => nameLookup(ctx, words, opt) },
  values: async (ctx, base, opt) => {
    const game = viewOf(ctx, opt && opt.game), verb = (opt && (opt.verb || (opt.draft && opt.draft.verb))) || 'make';
    const out = { purpose: 'vehicle', source: 'bring', where: PURPOSE.vehicle, name: '', textures: false, anims: true, wreck: false, def_copy: false };
    const key = base && ((base.ref && base.ref.key) || base.id);
    if (!key || !/\.mdl$/i.test(String(key))) return out;
    const k = String(key).toLowerCase(), folder = dirOf(k);
    // make: a free name (the copy's name plus _new, a folder no game model uses), so leaving it overrides nothing; change: the model's own
    out.source = 'copy'; out.where = dirOf(folder); out.name = verb === 'change' ? baseOf(folder) : freeName(game, dirOf(folder), baseOf(folder));
    out.purpose = /\/-?vehicle\//.test(k) ? 'vehicle' : /\/humanskin\//.test(k) ? 'soldier' : /\/inventory\//.test(k) ? 'item' : /\/construction\//.test(k) ? 'building' : 'other';
    const s = fileSet(game, k);
    if (s && !s.error) { out._set = s; const w = wrecks(game, folder); out._wreck = w; out.wreck = w.length > 0; }
    const def = folder + '/' + baseOf(folder) + '.def';
    try { const g = source(game); if (g && g.has(def)) { out._def = def; out.def_copy = true; } } catch (e) { /* no game */ }
    return out;
  },
  compile: async (draft, c) => {
    const mod = c.mod;
    if (!mod || !path.isAbsolute(mod)) throw bad('Pick your mod first: a model is written only into the mod you picked.');
    if (gidOf(c, c.game) === 'goh') MG().refuse(c, linesOf);
    const how = String(c.value('source') || 'bring'), make = c.verb === 'make';
    let where = fwd(c.value('where') || '').replace(/\/+$/, '').toLowerCase();
    if (c.kept('where') && !c.base && PURPOSE[c.value('purpose')]) where = PURPOSE[c.value('purpose')];
    const name = String(c.value('name') || '').toLowerCase();
    if (!new RegExp(WHERE_RE).test(where) || where.split('/').includes('..')) throw bad('The folder must sit under resource/entity, like resource/entity/-vehicle/tank_medium.');
    if (!new RegExp(NAME_RE).test(name)) throw bad('Give the model a folder name: small English letters, digits, _ . or - only.');
    const target = where + '/' + name, copies = new Map(), notes = [];
    // a game file the mod already has is not copied again: a second Write (after an outside program changed the model in the mod)
    // must not put the game's file back over that work; brought files (staged) always go in
    const have = new Set();
    const put = cp => { if (cp.key != null && fs.existsSync(path.join(mod, ...String(cp.to).split('/')))) { have.add(cp.to); return; } copies.set(cp.to, cp); };
    let mdl = null, baseDir = null;
    // files a question brought back (staged names, sub-paths kept): into the model folder
    const bring = (qid, onlyRe) => {
      const a = c.answer(qid); if (!a || a.src !== 'file') return [];
      const got = [];
      for (const f of bringNames([].concat(a.staged || []))) {
        if (!BRING_RE.test(f.rel) || (onlyRe && !onlyRe.test(f.rel))) throw bad('The file ' + f.rel + ' is not a model file (mdl, ply, vol, anm, mtl, def, ext or a texture: dds, tga, png).');
        if (!f.rel.split('/').every(p => FILE_RE.test(p))) throw bad('The file ' + f.rel + ' has a name the game cannot read: small English letters, digits, _ . # + and - only.');
        put({ staged: f.staged, to: target + '/' + f.rel }); got.push(f);
      }
      return got;
    };
    if (how === 'copy') {
      const set = c.values._set;
      if (!set) throw bad(c.gameDir ? 'Pick the model to copy first (the What to copy step).' : 'No game folder found. Set the game folder first (the Game folder button at the top).');
      baseDir = dirOf(set.mdl);
      const rename = baseDir !== target;
      if (make && !rename) throw bad('A new model needs its own folder: change the folder name, or pick "change" to change this model in your mod.');
      if (make && gameHasFolder(viewOf(c, c.game), target)) throw bad('The game already has a model folder ' + target + ': a new model there would replace that game model in your mod. Pick a free name (like ' + freeName(viewOf(c, c.game), where, name) + '), or start the task with "change" to change that model.');
      const tex = c.value('textures') === true, anm = c.value('anims') !== false;
      let outside = 0, skipped = 0;
      for (const f of set.files) {
        if (!f.key.startsWith(baseDir + '/')) { outside++; continue; }                    // shared files stay where the game has them
        if (f.kind === 'texture' && !tex && !rename) { skipped++; continue; }            // a new folder needs every file its names point at
        if (f.kind === 'anm' && !anm && !rename) { skipped++; continue; }
        put({ key: f.key, to: target + f.key.slice(baseDir.length) });
      }
      mdl = target + set.mdl.slice(baseDir.length);
      if (rename && (!tex || !anm)) notes.push('model: a new folder needs its textures and animations, so they are copied too');
      if (outside) notes.push('model: ' + outside + ' shared file(s) outside the model folder stay in the game and are read from there');
      if (skipped) notes.push('model: ' + skipped + ' texture or animation file(s) not copied; the game still reads them');
      if (set.unresolved) notes.push('model: ' + set.unresolved + ' name(s) in the model point at no file (the Models page lists them)');
    } else {
      const got = how === 'bring' ? bring('upload') : bring('program');
      if (how === 'outside' && !got.length) notes.push('model: it is made in an outside program first; come back with its files ("I am done: here is my file")');
      const texts = [];
      for (const f of got) if (/\.mdl$/.test(f.rel) && !mdl) { mdl = target + '/' + f.rel; try { texts.push(fs.readFileSync(c.stagedPath(f.staged), 'latin1')); } catch (e) { /* gone: the plan says so */ } }
      const own = path.join(mod, ...target.split('/'));
      if (!mdl) { try { for (const n of fs.readdirSync(own)) if (/\.mdl$/i.test(n)) { mdl = target + '/' + n.toLowerCase(); texts.push(fs.readFileSync(path.join(own, n), 'latin1')); } } catch (e) { /* none */ } }
      if (got.length && !mdl) notes.push('model: no .mdl among the files; the game needs one that names the meshes (bring it, or make it in SOEdit)');
      if (texts.length) {
        const named = new Set(); for (const t of texts) for (const x of namesIn(t)) named.add(x);
        for (const f of got) {
          const n = baseOf(f.rel), m = /\.(ply|vol|anm)$/.exec(n);
          if (!m || named.has(n) || named.has(n.replace(/\.anm$/, ''))) continue;
          const what = m[1] === 'anm' ? 'animation (add a sequence: Animations, model or bone sequences)' : /_lod\d+\.ply$/.test(n) ? 'lower detail mesh (add it: Meshes, lower detail levels)' : m[1] === 'vol' ? 'volume (add it: Volumes, add a volume, polyhedron)' : 'mesh (show it on a bone: Meshes, which mesh a bone shows)';
          notes.push('model: ' + n + ' is not named in the model: an unregistered ' + what);
        }
      }
    }
    // hand-offs that bring a file back: the edited .mdl (scrolling texture, skeleton extension), the .ext, the reshaped meshes
    for (const f of bring('bone_uv', /\.mdl$/).concat(bring('bone_ext', /\.(mdl|ext)$/))) if (/\.mdl$/.test(f.rel) && mdl && baseOf(f.rel) !== baseOf(mdl)) notes.push('model: the returned ' + f.rel + ' is not the model file ' + baseOf(mdl) + '; it is written beside it');
    bring('edit', /\.(ply|anm|vol)$/);
    for (const q of ['bone_uv', 'bone_ext', 'edit']) { const a = c.answer(q); if (a && a.src === 'ext') notes.push('model, ' + q + ': the outside program saves into the mod itself; Check reads the result'); }
    // the broken and destroyed views
    if (c.value('wreck') === true) {
      const ws = c.values._wreck || [];
      if (!ws.length) notes.push('model: the copied model has no broken or destroyed view (_x, _xx) in the game (STR-14)');
      const baseName = c.values._set ? baseOf(dirOf(c.values._set.mdl)) : name, same = baseName === name && (!c.values._set || dirOf(dirOf(c.values._set.mdl)) === where);
      const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      for (const w of ws) {
        const newDir = where + '/x/' + name + w.suffix;
        for (const k of w.files) {
          const rel = k.slice(w.dir.length + 1);
          if (same && ((/\.(dds|tga|png)$/.test(k) && c.value('textures') !== true) || (/\.anm$/.test(k) && c.value('anims') === false))) continue;
          put({ key: k, to: newDir + '/' + rel.replace(new RegExp('^' + reEsc(baseName + w.suffix) + '\\.mdl$'), name + w.suffix + '.mdl') });
        }
        if (!w.def) continue;
        const to = newDir + '/' + name + w.suffix + '.def';
        if (same) { put({ key: w.def, to }); continue; }
        const buf = gameBytes(viewOf(c, c.game), w.def);
        if (!buf) { notes.push('model: the def of ' + w.dir + ' could not be read; copy that view on the Units page'); continue; }
        const text = Buffer.from(buf.toString('latin1').replace(new RegExp('\\b' + reEsc(baseName) + '(_x+)\\b', 'gi'), (m0, sx) => name + sx), 'latin1');
        put({ staged: stage(c, 'm-def-' + name + w.suffix + '.def', text), to });
      }
    }
    // the unit def: the copy (renamed into the new folder) and its entries
    const defTo = target + '/' + name + '.def', edits = defEditsOf(c);
    const copyDef = how === 'copy' && c.value('def_copy') === true;
    let gen = null;
    if (copyDef || edits.length) {
      // the def the entries go into: the brought one, the mod's own, the copied game def (copied to defTo), else the game def at defTo
      let buf = null, from = '';
      const brought = copies.get(defTo);
      if (brought && brought.staged != null) { try { buf = fs.readFileSync(c.stagedPath(brought.staged)); from = 'the brought def'; } catch (e) { buf = null; } }
      if (!buf) { try { buf = fs.readFileSync(path.join(mod, ...defTo.split('/'))); from = 'the def in your mod'; } catch (e) { buf = null; } }
      // the key copy is read at Write by task/lib/compile readCopy (view/ref readKey: the game as played, the profile's mods on), so the
      // entry indexes are read from those same bytes: the plain game source can hold another def (a mod in the profile that changes it
      // has more volumes), and a new volume's rows then landed in another volume
      if (!buf && copyDef && c.values._def) { buf = defAsCopied(c, mod, c.values._def) || gameBytes(viewOf(c, c.game), c.values._def); from = c.values._def; if (buf) put({ key: c.values._def, to: defTo }); }
      if (!buf) { buf = gameBytes(viewOf(c, c.game), defTo); from = defTo; }
      if (!buf) throw bad('model: no unit file (' + defTo + ') to change: copy the model with its def, or bring the .def with the files.');
      const ext0 = /\{\s*extension\s+"([^"]+)"/i.exec(buf.toString('latin1'));
      if (mdl && !edits.some(e => e.key === 'extension') && baseOf(mdl) !== name + '.mdl' && (!ext0 || ext0[1].toLowerCase() !== baseOf(mdl))) {
        edits.unshift({ key: 'extension', value: '"' + baseOf(mdl) + '"', line: 'extension ' + baseOf(mdl) });
        notes.push('model: the def names ' + baseOf(mdl) + ' ({extension}): without it the game looks for ' + name + '.mdl [I]');
      }
      if (edits.length) gen = { ops: [{ op: 'set', rows: defRows(buf, edits, defTo) }] };
      notes.push('model: the unit file ' + defTo + ' from ' + from + (edits.length ? ', ' + edits.length + ' entr' + (edits.length === 1 ? 'y' : 'ies') + ' set by gen set' : ''));
    }
    // the model edits: one call to the own route, dry in plan, run at Write after the copies
    const ops = opsOf(c), calls = [];
    // Gates of Hell: the volume thickness lines go into the def's {volume} blocks (own route, after the copies and the def rows)
    const thick = gidOf(c, c.game) === 'goh' ? linesOf(c, 'vol_thick') : [];
    if (thick.length) {
      const set = MG().volSets(thick, lineErr), cp = copies.get(defTo);
      const there = !!cp || fs.existsSync(path.join(mod, ...defTo.split('/'))) || !!gameBytes(viewOf(c, c.game), defTo);
      if (!there) throw bad('model, vol_thick: a Gates of Hell model volume has no thickness of its own; the game reads armour from the {volume} blocks of the unit file, and this model has none yet (' + defTo + '). Copy the model with its def, or bring the .def with the files.');
      if (cp && cp.staged != null && !fs.existsSync(path.join(mod, ...defTo.split('/')))) throw bad('model, vol_thick: the thickness goes into the {volume} blocks of the def you bring, and that def is not in your mod yet. Write the brought files first, then give the thickness lines.');
      const body = { def: defTo, change: { set } };
      if (cp && cp.key) body.from = cp.key;
      calls.push({ route: MG().VOL_ROUTE, body, dryFlag: 'write' });
      notes.push('model: ' + set.length + ' armour number(s) go into the {volume} blocks of ' + defTo + ' (Gates of Hell reads armour there, not from the model). Check them in game [T].');
    }
    if (ops.length) {
      if (!mdl) notes.push('model: ' + ops.length + ' model edit(s) wait for the model file (no .mdl yet)');
      else {
        const src = copies.get(mdl), body = { mdl, ops };
        if (src && src.staged != null) { body.draft = c.draftId; body.staged = src.staged; }
        else if (src && src.key) body.from = src.key;
        else if (c.values._set) body.from = c.values._set.mdl;
        calls.push({ route: EDIT, body, dryFlag: 'dry' });
      }
    }
    if (have.size) notes.push('model: ' + have.size + ' file(s) already in your mod are kept as they are, not copied again from the game (an outside program may have changed them)');
    if (!copies.size && !calls.length && !gen) notes.push('model: nothing to write yet');
    const file = mdl ? baseOf(mdl) : null;
    // copiesFirst: the def rows edit the def the copies bring (at Write the copy lands first; in plan gen sees it in its overlay)
    return Object.assign({ copies: [...copies.values()], calls, notes, result: { mdl, folder: target, file } }, gen ? { gen, copiesFirst: true } : {});
  },
  // Check step: record the written copy for SOEdit (Models stage keeps files already in the mod) and run the Models check
  check: async (draft, ctx) => {
    const mod = draft.mod;
    if (!mod || !fs.existsSync(mod)) return [{ title: 'model', lines: ['The mod folder is not there.'], level: 'error' }];
    const p = await placeOf(draft, ctx);
    if (!p.mdl) return [{ title: 'model', lines: ['No model file in ' + p.target + ' yet: write the task first.'], level: 'warn' }];
    // Gates of Hell: the Models stage and check read the GoH install (models/game.js takes a GoH folder as body.game)
    const abs = path.join(mod, ...p.mdl.split('/')), game = (gidOf(ctx, draft.game) === 'goh' ? dirOfG(viewOf(ctx, 'goh')) : gameOf(ctx)) || undefined, cards = [];
    try {
      const st = await modelsRoute('POST /api/x/models/stage')(null, { mod, target: abs, game }, rctxOf(ctx));
      cards.push({ title: 'SOEdit stage', lines: [st.ok ? 'Recorded for SOEdit: ' + (st.counts.copied || 0) + ' copied, ' + (st.counts.kept || 0) + ' kept as they are in the mod.' : 'Stage failed: ' + st.message], level: st.ok ? 'ok' : 'warn' });
    } catch (e) { cards.push({ title: 'SOEdit stage', lines: [String(e.message || e)], level: 'warn' }); }
    try {
      const ck = await modelsRoute('POST /api/x/models/check')(null, { mod, mdl: p.mdl, game }, rctxOf(ctx));
      const f = ck.findings || [];
      cards.push({ title: 'Models check', lines: f.length ? f.slice(0, 50).map(x => x.file + (x.line ? ':' + x.line : '') + ' ' + x.code + ' ' + x.msg) : ['No loss and no problem in ' + p.mdl + ' and its files.'], level: f.some(x => /error/i.test(x.severity) || /^ERR_|LOSS/.test(x.code)) ? 'error' : f.length ? 'warn' : 'ok' });
    } catch (e) { cards.push({ title: 'Models check', lines: [String(e.message || e)], level: 'error' }); }
    return cards;
  },
  routes,
  _t: { viewOf, gameBytes, fileCheck, fileSet, wrecks, namesIn, mdlLookup, nameLookup, freeName, gameHasFolder, namesOf, namesRoute, PURPOSE, opsOf, keyedIndex, defRows, defEditsOf, SEQ_SEEN, bringNames, placeOf, EDIT_OPS },
};

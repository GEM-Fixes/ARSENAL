// units ext: the line-up of a multiplayer buy. Every model of the buy as ONE scene/1 scene (tools/lib/model/scene.js toJSON):
// vehicles in the back row, soldiers in front, each soldier as many times as its count, standing at rest with the body mesh
// bent to the bones (tools/lib/model/skin.js) and with what the engine puts on it: the weapon in hands, the head and body
// armour, the items shown on the back. Reads only: writes nothing anywhere.
//   const { lineup } = require('./lineup');
//   await lineup({ game, gid, mod, models, max }) -> { scene, figures, notes }
//     game   game install folder;  gid 'as64' | 'mowas2' | 'goh';  mod  mod folder or null (a layer over the game)
//     models [{ kind: 'vehicle'|'soldier', target, id, name, n }]   target = a tools/soedit/target.js target (entity name,
//            breed:<path under set/breed>); vehicles first
//     max    most figures placed (default 40); the rest are named in notes
//     scene  scene/1 JSON, bones [] and volumes []. Every mesh also has `target` (the target whose files its textures are found
//            with: POST /api/x/models/viewer/texture { mod, target, rel, mesh: mesh.file, variant: mesh.variant }), `figure` (index
//            into figures) and, when the model shows one, `variant` (its texture variant: models[].variant, '-' = none, else the
//            {texmod} line of its def). models[].skin = another skin entity for that soldier's body.
//            A soldier's meshes (body, weapon, helmet ...) are baked: positions are in the soldier's own space, already skinned
//            and attached, wound as a mesh drawn through a model's (mirroring) bone world, and mesh.world is only the place
//            in the row. A vehicle's meshes keep their local
//            positions and mesh.world = the bone's world followed by the place. scene.bounds covers the whole row.
//     figures [{ index, kind, id, name, target, x, y (middle of the figure on the ground), ox, oy (where its origin stands),
//            box: { min, max }, of (count of that model), gear: [names shown on it], clip, pose, frame, frames }]
//            clip = the animation file name (no .anm) of the pose, pose = the engine's pose name, frame = the frame shown.
//     notes  [plain sentences] for what could not be shown
//   drop()   forget the models kept between calls (they are kept 60 s, at most 64, by game + mod + target)
// Row: everything faces +X (20 units = 1 m). Soldiers stand in rows of 12 along Y in front (first row at the greatest X),
// vehicles behind them, each row centred on Y = 0; gaps come from the bounds.
//
// Engine facts (source path:line; [V] read in the source or the data, [I] inferred):
//   skin [V] CopySkin + SetSkin: the breed's {skin} entity gives its views to the
//          bones of the same names of human.mdl (entity/humanskin/human/human.mdl); clips play on human.mdl. So a body mesh
//          is bound on the skin's own .mdl at rest and drawn with the worlds of human.mdl's bones (skin.js header).
//   pose [V] FillStandPoses: a standing soldier that is not alert holds, by weapon
//          mode: nothing -> pose_stand_empty_1; rifle and smg -> one of pose_stand_gun_aside, _aside_1, _aside_2,
//          pose_stand_look_around_gun_1, pose_stand_fire_rifle_down / pose_stand_fire_gun_down; machine gun and flamethrower
//          -> pose_stand_gun_aside_2, pose_stand_look_around_gun_1, pose_stand_fire_mgun_down; pistol -> pose_stand_empty_1,
//          pose_stand_fire_pistol_down; bazooka -> pose_stand_bazooka (:36). The engine cycles through them (poseCounter);
//          [I] the first of each list that the data has is shown here. A pose is a {blend "name" {pose "clip" begin|end}}
//          line of the human clip list (human.mdl {extension}, properties/animation/human/human_anm.ext): one frame of that
//          clip, the first (begin) or the last (end) [V modweb humans/anim]. [I] the weapon mode comes from the stuff's tags
//          (pistol, mgun, smg, rifle, bazooka, flamethrower) through its {from "pattern x"} chain.
//   breed [V] : {inventory {item "tags" ..} .. {in_hands N}}: N = index into the items;
// that item is taken in hands (UseItem). {armors {head "x"} {body "x"}}
// An item's words name a stuff by its tags (stuffIndex below).
//   weapon [V] : a weapon-tagged item in the right hand is loaded into the
//          first weapon place; ShowItem: its entity (stuff {entity "x"}) is put on the
//          place's {LinkBone} (properties/human.ext {Weaponry {place "hand_right" {LinkBone "right_hand"}}}) with no bone of
//          its own; : with no link bone the entity takes the
//          bone's world with the Y axis negated (the model is mirrored in Y), with one it takes
//          inverse(link bone world in the model) followed by the place bone's world.
//   other [V] : an item in hands that is no weapon rides bone gear_side_right
//          (gear_hand_small with tag smallitemin1hand) by its own bone "handle".
//   armour [V] : the item's model is attached to the holder's {bone}
//          SetWorld(scaling(1,-1,1)) (properties/human.ext {extender "inventory" {armor "head" {bone "head"}} {armor "body"
//          {bone "IK_UpDown"}}}).
//   back [V] LinkItem: an item in the box whose stuff has {inventory {link_bone
//          "b"}} and a model rides bone b of the owner, by the stuff's {handle_bone} when it has one (vanilla rifles:
//          rifle.pattern {link_bone "gun_back"}).
//   [V] AttachItemModel (the engine's own unit preview) attaches the same way.
//   Gates of Hell [I]: the same blocks and files are read (set/breed, set/stuff, entity/humanskin
//          properties/human.ext, the human clip list); what is not there is said in notes.
// Author: Imperator_Aug (ARSENAL, ia-17f4936a)
'use strict';
const path = require('path');
const TG = require('../../../soedit/target'), S = require('../../../soedit/stage');
const mdlLib = require('../../../lib/model/mdl'), plyLib = require('../../../lib/model/ply'), sceneLib = require('../../../lib/model/scene');
const anmLib = require('../../../lib/model/anm'), skinLib = require('../../../lib/model/skin');
const names = require('../../../lib/names'), games = require('../../../lib/games');

const ID = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], FLIP_Y = [1, 0, 0, 0, -1, 0, 0, 0, 1, 0, 0, 0];
const MAX = 40, PER_ROW = 12, KEEP_MS = 60000, KEEP_N = 64;
const GAP_MAN = 6, MIN_MAN = 16, ROW_MAN = 30, GAP_VEH = 20, ROW_VEH = 40, VEH_ROW_WIDTH = 900;
const kDir = k => k.slice(0, k.lastIndexOf('/') + 1);
const refKey = (s, dir) => path.posix.normalize(names.resolve(s, dir).key);
const mul = (a, b) => mdlLib.mul(Array.from(a), Array.from(b));
const low = s => String(s).toLowerCase();
const strip = s => s.replace(/;[^\n]*/g, '');
const text = buf => strip(buf.toString('latin1'));

// the poses a standing soldier at rest holds, by weapon mode, then the last resorts
const POSES = {
  none: ['pose_stand_empty_1'],
  rifle: ['pose_stand_gun_aside', 'pose_stand_look_around_gun_1', 'pose_stand_fire_rifle_down', 'pose_stand_gun_down'],
  smg: ['pose_stand_gun_aside', 'pose_stand_look_around_gun_1', 'pose_stand_fire_gun_down', 'pose_stand_gun_down'],
  mgun: ['pose_stand_gun_aside_2', 'pose_stand_look_around_gun_1', 'pose_stand_fire_mgun_down', 'pose_stand_gun_down'],
  pistol: ['pose_stand_empty_1', 'pose_stand_fire_pistol_down'],
  bazooka: ['pose_stand_bazooka', 'pose_stand_gun_down'],
};
const LAST = ['pose_stand_empty_1', 'stand_idle_empty_1', 'idle_stand_1'];
function modeOf(tags) {
  const has = t => tags.includes(t);
  if (has('pistol')) return 'pistol';
  if (has('mgun') || has('flamethrower') || has('flame')) return 'mgun';
  if (has('smg')) return 'smg';
  if (has('bazooka') || has('rocketlauncher') || has('panzerfaust')) return 'bazooka';
  if (has('rifle') || has('weapon')) return 'rifle';
  return 'none';
}

// ---------- small text readers (comments dropped) ----------
// the body of the first {name ...} block: text between its braces, or null
function block(s, name, from) {
  const re = new RegExp('\\{\\s*' + name + '\\b', 'ig');
  re.lastIndex = from || 0;
  const m = re.exec(s);
  if (!m) return null;
  let depth = 0, q = false;
  for (let i = m.index; i < s.length; i++) {
    const c = s[i];
    if (c === '"') q = !q;
    else if (!q && c === '{') depth++;
    else if (!q && c === '}' && --depth === 0) return { body: s.slice(m.index + m[0].length, i), end: i + 1 };
  }
  return null;
}
const VAL = '(?:"([^"]*)"|([^\\s{}"()]+))';
const val = (s, name) => { const m = new RegExp('\\{\\s*' + name + '\\s+' + VAL, 'i').exec(s || ''); return m ? (m[1] != null ? m[1] : m[2]) : null; };
function breedOf(buf) {
  const s = text(buf), out = { items: [], inHands: -1, armors: [] };
  const inv = block(s, 'inventory');
  if (inv) {
    const re = new RegExp('\\{\\s*item\\s+' + VAL, 'ig');
    let m;
    while ((m = re.exec(inv.body))) out.items.push(m[1] != null ? m[1] : m[2]);
    const h = /\{\s*in_hands\s+(-?\d+)/i.exec(inv.body);
    if (h) out.inHands = Number(h[1]);
  }
  const ar = block(s, 'armors');
  if (ar) {
    const re = new RegExp('\\{\\s*(\\w+)\\s+' + VAL + '\\s*\\}', 'ig');
    let m;
    while ((m = re.exec(ar.body))) out.armors.push({ slot: low(m[1]), item: m[2] != null ? m[2] : m[3] });
  }
  return out;
}

// ---------- one call's view of the game ----------
function open(o) {
  const exe = o.gid && o.gid !== games.DEFAULT ? games.exeOf(o.gid) : undefined;
  const modDirs = o.mod ? [o.mod] : [];
  const src = o.src || S.openSource(Object.assign({ game: o.game, mods: [], modDirs, noInfer: true }, exe ? { exe } : {}));
  const c = { o, exe, modDirs, src, own: !o.src, models: new Map(), poses: new Map(), stuffs: new Map(), human: undefined, stuffIx: null, holders: undefined };
  return c;
}
const raw = (c, key) => { try { const g = c.src.get(key); return g ? g.buf : null; } catch (e) { return null; } };
// a soldier file as the game reads it: includes and macro calls written out (a mod that builds its soldiers from shared macros)
const flatBreed = (c, key) => { const b = raw(c, key); return b ? require('../../../lib/breedflat').flat(b, key, k => raw(c, k)).text : Buffer.alloc(0); };

// a model by target: { scene (rest), key, breed, human, entity, swapped } | { error }
// mv: a mesh variant (Gates of Hell: "<mesh>#<variant>.ply" beside a mesh is drawn in its place, GHFMT-10 [I]);
// swapped = how many meshes of the model have such a file
function model(c, target, mv) {
  const k = low(target) + (mv ? '\n#' + mv : '');
  if (c.models.has(k)) return c.models.get(k);
  let out;
  try {
    const r = TG.resolve(Object.assign({ target, game: c.o.game, modDirs: c.modDirs, src: c.src }, c.exe ? { exe: c.exe } : {}));
    if (r.error) out = { error: r.error };
    else if (!r.mdlKey || !c.src.has(r.mdlKey)) out = { error: 'no model file' };
    else out = Object.assign(sceneAt(c, r.mdlKey, mv), { key: r.mdlKey, breed: r.breed, human: !!r.human, entity: r.entity, def: r.def || null });
  } catch (e) { out = { error: String((e && e.message) || e).split('\n')[0] }; }
  c.models.set(k, out);
  return out;
}
function sceneAt(c, key, mv) {
  const dir = kDir(key), m = mdlLib.parse(raw(c, key));
  let swapped = 0;
  const get = name => {
    const k = refKey(name, dir), v = mv && /\.ply$/i.test(k) ? raw(c, k.replace(/\.ply$/i, '#' + mv + '.ply')) : null;
    if (v) swapped++;
    return v || raw(c, k);
  };
  return { scene: sceneLib.build(m, { get }), mdl: m, swapped };
}
// a bone is drawn when it and every bone above it are visible at rest
function shown(scene, i) {
  for (let b = scene.bones[i]; b; b = scene.bones[b.parent]) if (!b.visible) return false;
  return true;
}
const byName = scene => { const m = new Map(); for (const b of scene.bones) if (!m.has(low(b.name))) m.set(low(b.name), b.world); return m; };

// human.mdl, its clip list and the poses of that list
function human(c) {
  if (c.human !== undefined) return c.human;
  c.human = null;
  const buf = raw(c, TG.HUMAN_MDL);
  if (!buf) return null;
  const h = Object.assign(sceneAt(c, TG.HUMAN_MDL), { blends: new Map(), clips: new Map() });
  const ext = TG.extensionOf(buf), ek = ext ? refKey(ext, kDir(TG.HUMAN_MDL)) : null, eb = ek ? raw(c, ek) : null;
  if (eb) {
    // (include "file") lines pull in more of the list, relative to the including file (GoH keeps its poses that way)
    const dir = kDir(ek), seen = new Set([ek]);
    const whole = (t, d, depth) => t.replace(/\(\s*include\s+"([^"]+)"\s*\)/ig, (x, f) => {
      const k = refKey(f, d), b = depth < 6 && !seen.has(k) ? raw(c, k) : null;
      seen.add(k);
      return b ? whole(text(b), kDir(k), depth + 1) : '';
    });
    const s = whole(text(eb), dir, 0);
    let m;
    const rb = /\{\s*blend\s+"([^"]+)"\s*\{\s*pose\s+"([^"]+)"\s*(begin|end)?/ig;
    while ((m = rb.exec(s))) if (!h.blends.has(low(m[1]))) h.blends.set(low(m[1]), { clip: m[2], end: low(m[3] || '') === 'end' });
    const rs = /\{\s*sequence\s+"([^"]+)"/ig;
    while ((m = rs.exec(s))) if (!h.clips.has(low(m[1]))) h.clips.set(low(m[1]), dir + names.normalize(m[1]) + '.anm');
    h.clipDir = dir;
  }
  c.human = h;
  return h;
}
// the first pose of the mode's list the data has: { pose, clip, frame, frames, worlds: Map(lower bone name -> world) }
function poseFor(c, mode) {
  if (c.poses.has(mode)) return c.poses.get(mode);
  const h = human(c);
  let out = null;
  if (h) {
    for (const name of (POSES[mode] || POSES.none).concat(LAST)) {
      const b = h.blends.get(low(name));
      const clip = b ? b.clip : name;
      const key = h.clips.get(low(clip)) || (h.clipDir ? h.clipDir + names.normalize(clip) + '.anm' : null);
      const buf = key ? raw(c, key) : null;
      if (!buf) continue;
      const a = anmLib.parse(buf);
      if (!a.frames) continue;
      const frame = b && b.end ? a.frames - 1 : 0;
      out = { pose: b ? name : null, clip, frame, frames: a.frames, worlds: byName(sceneLib.pose(h.scene, a, frame)) };
      break;
    }
    if (!out) out = { pose: null, clip: null, frame: 0, frames: 0, worlds: byName(h.scene) };
  }
  c.poses.set(mode, out);
  return out;
}

// ---------- stuff (set/stuff) ----------
// [V] , 82-95: every file under set/stuff is a stuff whose first tags are the words of its file
// name ("bazooka.weapon" -> bazooka weapon, "rifle.pattern" -> rifle pattern); {from "pattern rifle"} names the file whose
// tags hold those words; FindStuff: an item's words name the first stuff that has them all and is no pattern.
function stuffIndex(c) {
  if (c.stuffIx) return c.stuffIx;
  const files = [];
  for (const k of c.src.allKeys()) {
    if (!k.startsWith('resource/set/stuff/')) continue;
    const base = k.slice(k.lastIndexOf('/') + 1);
    if (!base || base.startsWith('.') || /\.(fsm|presets|inc)$/.test(base)) continue;
    const tags = base.split('.').filter(Boolean);
    files.push({ key: k, tags, pattern: tags.includes('pattern') });
  }
  files.sort((x, y) => (x.key < y.key ? -1 : x.key > y.key ? 1 : 0));
  return (c.stuffIx = { files, read: new Map(), all: null });
}
// what a stuff file says, its {from "pattern x"} patterns filling what it leaves out
function readStuff(c, file, depth) {
  const ix = stuffIndex(c);
  if (ix.read.has(file.key)) return ix.read.get(file.key);
  const s = text(raw(c, file.key) || Buffer.alloc(0));
  const d = { key: file.key, name: file.tags[0], entity: val(s, 'entity'), tags: file.tags.slice(), said: [], link: null, handle: null, noview: false };
  const re = /\{\s*tags?\s+"([^"]*)"/ig;
  let m;
  while ((m = re.exec(s))) d.said.push(...low(m[1]).split(/\s+/).filter(Boolean));
  const inv = block(s, 'inventory');
  if (inv) { d.link = val(inv.body, 'link_bone'); d.handle = val(inv.body, 'handle_bone'); d.noview = /\{\s*noview\b/i.test(inv.body); }
  const from = /\bfrom\s+"([^"]+)"/i.exec(s);
  if (from && (depth || 0) < 8) {
    const words = low(from[1]).split(/\s+/).filter(Boolean);
    const pf = ix.files.find(x => x.key !== file.key && words.every(w => x.tags.includes(w)));
    if (pf) {
      const p = readStuff(c, pf, (depth || 0) + 1);
      d.entity = d.entity || p.entity; d.link = d.link || p.link; d.handle = d.handle || p.handle; d.noview = d.noview || p.noview;
      d.said.push(...p.said);   // [I] the tags a pattern states are inherited, the words of its file name are not
    }
  }
  for (const t of d.said) if (!d.tags.includes(t)) d.tags.push(t);
  ix.read.set(file.key, d);
  return d;
}
// the stuff an item's words name: the first file (path order) whose name has them all, else the first stuff whose tags
// (file name, {tag} blocks, patterns) have them all. Ammunition is not looked up the slow way: it is never shown.
function stuffOf(c, item) {
  const k = low(item);
  if (c.stuffs.has(k)) return c.stuffs.get(k);
  const words = k.split(/\s+/).filter(Boolean), ix = stuffIndex(c);
  let out = null;
  if (words.length) {
    const f = ix.files.find(x => !x.pattern && words.every(w => x.tags.includes(w)));
    if (f) out = readStuff(c, f, 0);
    else if (!words.includes('ammo')) {
      if (!ix.all) ix.all = ix.files.filter(x => !x.pattern).map(x => readStuff(c, x, 0));
      out = ix.all.find(d => words.every(w => d.tags.includes(w))) || null;
    }
  }
  c.stuffs.set(k, out);
  return out;
}
// the bones the human entity puts things on (properties/human.ext), with the vanilla names when the file does not say
function holders(c) {
  if (c.holders !== undefined) return c.holders;
  const h = { hand: 'right_hand', armor: { head: 'head', body: 'ik_updown' } };
  const buf = raw(c, 'resource/properties/human.ext');
  if (buf) {
    const s = text(buf), w = block(s, 'Weaponry');
    const lb = w && val(w.body, 'LinkBone');
    if (lb) h.hand = lb;
    const re = /\{\s*armor\s+"([^"]+)"/ig;
    let m;
    while ((m = re.exec(s))) { const b = block(s, 'armor', m.index); const bone = b && val(b.body, 'bone'); if (bone) h.armor[low(m[1])] = bone; }
  }
  return (c.holders = h);
}

// ---------- one figure's model, built once per target ----------
// -> { kind, meshes: [{ file, target, world, mirrored, skinned, parts, baked }], box: {min,max}|null, gear, notes, clip, pose, frame, frames } | { error }
function box() { return { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }; }
function grow(b, o) { if (o) for (let i = 0; i < 3; i++) { b.min[i] = Math.min(b.min[i], o.min[i]); b.max[i] = Math.max(b.max[i], o.max[i]); } }
const boxOk = b => (b.min[0] === Infinity ? null : b);
function jsonMeshes(list) {
  const fake = { bounds: null, missing: [], bones: [], volumes: [], meshes: list.map(m => ({ boneIndex: -1, file: m.file, world: m.world, mirrored: !!m.mirrored, skinned: !!m.skinned, ply: m.ply })) };
  const j = sceneLib.toJSON(fake).meshes;
  return j.map((m, i) => Object.assign(m, { target: list[i].target, baked: !!list[i].baked }, list[i].variant ? { variant: list[i].variant } : {})).filter(m => m.parts.length);
}
function plyBox(p, world) { const b = p && plyLib.bounds(p); return b ? sceneLib.aabb(world, Array.from(b.slice(0, 3)), Array.from(b.slice(3, 6))) : null; }

// the texture variant a model shows: the one asked ('-' = none), else the {texmod "x"} line of its own def (look.js: the engine
// reads it with the def, [V]). The picture route shows "<texture>#<variant>" where the file exists
function variantOf(c, m, asked) {
  if (asked) return asked === '-' ? '' : low(asked);
  const b = m && m.def ? raw(c, m.def) : null, x = b ? /^[ \t]*\{\s*texmod\s+"([^"]+)"/im.exec(b.toString('latin1')) : null;
  return x ? low(x[1]) : '';
}
// Gates of Hell: the model again with the meshes of its variant, when it has any (else the same model)
function withMeshes(c, target, m, variant) {
  if (c.o.gid !== 'goh' || !variant || m.error) return m;
  const v = model(c, target, variant);
  return v.error || !v.swapped ? m : v;
}
function vehicleProto(c, target, asked) {
  const m0 = model(c, target);
  if (m0.error) return { error: m0.error };
  const list = [], b = box(), variant = variantOf(c, m0, asked), m = withMeshes(c, target, m0, variant);
  for (const me of m.scene.meshes) {
    if (!me.ply || !shown(m.scene, me.boneIndex)) continue;
    list.push({ file: me.file, target, world: me.world, mirrored: me.mirrored, skinned: me.skinned, ply: me.ply, variant });
    grow(b, plyBox(me.ply, me.world));
  }
  if (!list.length) return { error: 'no mesh' };
  return { kind: 'vehicle', variant, swapped: m === m0 ? 0 : m.swapped, meshes: jsonMeshes(list), box: boxOk(b), gear: [], notes: [], clip: null, pose: null, frame: 0, frames: 0, missing: m.scene.missing.slice() };
}

// a mesh moved to world space, ready to draw with an identity world: wound counter-clockwise against its normals like every
// other mesh in world space. [V on vanilla data] a .ply is wound clockwise and a model's bone worlds mirror (determinant -1),
// so the winding is swapped only when the whole move does not mirror; a ply marked mirrored (MROR) is the other way round.
function bake(p, det, mirrored) {
  if (p.vertices) p.vertices.raw = null;
  return (det > 0) !== !!mirrored ? skinLib.flipWinding(p) : p;
}
// an item's model on a bone of the posed soldier: baked meshes added to `list`; true when something was added
function attach(c, list, b, entity, place, handle, variant) {
  const im = model(c, entity);
  if (im.error || !place) return false;
  let via = FLIP_Y;
  if (handle) {
    const hb = im.scene.bones.find(x => low(x.name) === low(handle));
    const inv = hb && mdlLib.invert(Array.from(hb.world));
    if (inv) via = inv;
  }
  const tail = mul(via, place);
  let any = false;
  for (const me of im.scene.meshes) {
    if (!me.ply || !shown(im.scene, me.boneIndex)) continue;
    const M = mul(me.world, tail), p = bake(plyLib.transform(me.ply, M, { keepWinding: true }), skinLib.det(M), me.mirrored);
    list.push({ file: me.file, target: entity, world: ID, mirrored: false, skinned: false, ply: p, baked: true, variant: variant || '' });
    grow(b, plyBox(p, ID));
    any = true;
  }
  return any;
}

// skin: another skin entity than the one the soldier file names (the Equipment card's look part); asked: a texture variant
function soldierProto(c, target, label, skin, asked) {
  const m0 = model(c, target);
  if (m0.error) return { error: m0.error };
  const sk = skin ? model(c, skin) : null;
  if (sk && sk.error) return { error: sk.error };
  // the body is the skin's model; the soldier file (equipment) stays the soldier's own
  const m1 = sk ? Object.assign({}, sk, { breed: m0.breed, human: true }) : m0, bodyOf = sk ? skin : target;
  const notes = [], gear = [], list = [], b = box(), variant = variantOf(c, m1, asked);
  const mv = withMeshes(c, bodyOf, m1, variant), m = mv === m1 ? m1 : Object.assign({}, mv, { breed: m1.breed, human: m1.human });
  const breed = m.breed ? breedOf(flatBreed(c, m.breed)) : { items: [], inHands: -1, armors: [] };
  // what is in hands, and the pose that goes with it
  const inHand = breed.inHands >= 0 && breed.inHands < breed.items.length ? breed.items[breed.inHands] : null;
  const handStuff = inHand ? stuffOf(c, inHand) : null;
  const weapon = !!(handStuff && handStuff.tags.includes('weapon'));
  const mode = handStuff ? (weapon ? modeOf(handStuff.tags) : 'none') : 'none';
  const ps = m.human ? poseFor(c, mode) : null;
  const rest = byName(m.scene);
  const now = name => (ps && ps.worlds.get(low(name))) || rest.get(low(name)) || null;
  if (m.human && !ps) notes.push('The shared human model is missing, so ' + label + ' is shown as modelled, not standing at rest.');
  else if (m.human && !ps.clip) notes.push('No standing animation was found, so ' + label + ' is shown as modelled.');
  // the body: every mesh of the skin on the bone of the same name of the posed human model
  const lost = [];
  for (const me of m.scene.meshes) {
    if (!me.ply || !shown(m.scene, me.boneIndex)) continue;
    const bone = m.scene.bones[me.boneIndex], baseNow = now(bone.name) || me.world;
    let p;
    if (skinLib.isSkinned(me.ply)) {
      p = skinLib.apply(me.ply, { baseRest: me.world, rest: n => rest.get(low(n)) || null, baseNow, now });
      for (const n of p.skinned.missing) if (!lost.includes(n)) lost.push(n);
    } else p = plyLib.transform(me.ply, baseNow, { keepWinding: true });
    p = bake(p, skinLib.det(baseNow), me.mirrored);
    list.push({ file: me.file, target: bodyOf, world: ID, mirrored: false, skinned: me.skinned, ply: p, baked: true, variant });
    grow(b, plyBox(p, ID));
  }
  if (!list.length) return { error: 'no mesh' };
  if (lost.length) notes.push('Part of the body of ' + label + ' could not be bent to the skeleton, so it may look stiff.');
  // equipment
  const H = holders(c), seen = new Set();
  // an armour item takes the wearer's texture variant ( [V]); other items keep their own
  const put = (item, st, placeName, handle, expected, worn) => {
    const nm = st ? st.name : item;
    if (seen.has(nm + '|' + low(placeName))) return;
    seen.add(nm + '|' + low(placeName));
    const ok = !!(st && st.entity) && attach(c, list, b, st.entity, now(placeName), handle, worn ? variant : '');
    if (ok) gear.push(nm);
    else if (expected) notes.push('The ' + expected + ' of ' + label + ' (' + nm + ') has no model to show.');
  };
  if (handStuff) {
    if (weapon) put(inHand, handStuff, H.hand, null, 'weapon');
    else put(inHand, handStuff, handStuff.tags.includes('smallitemin1hand') ? 'gear_hand_small' : 'gear_side_right', 'handle', null);
  } else if (inHand) notes.push('The weapon of ' + label + ' (' + inHand + ') was not found in the game files.');
  for (const a of breed.armors) {
    const st = stuffOf(c, a.item), bone = H.armor[a.slot];
    if (!bone) continue;
    put(a.item, st, bone, null, a.slot === 'head' ? 'helmet' : 'body armour', true);
  }
  breed.items.forEach((item, i) => {
    if (i === breed.inHands) return;
    const st = stuffOf(c, item);
    if (!st || !st.link || !st.entity || st.noview) return;
    put(item, st, st.link, st.handle, st.tags.includes('weapon') ? 'weapon' : 'backpack');
  });
  if (m.breed && !breed.items.length && !breed.armors.length) notes.push('No equipment list was found for ' + label + ', so it is shown without weapon or helmet.');
  return { kind: 'soldier', variant, swapped: m === m1 ? 0 : m.swapped, meshes: jsonMeshes(list), box: boxOk(b), gear, notes, clip: ps ? ps.clip : null, pose: ps ? ps.pose : null,
    frame: ps ? ps.frame : 0, frames: ps ? ps.frames : 0, missing: m.scene.missing.slice() };
}

// ---------- kept between calls ----------
const KEPT = new Map();   // key -> { at, proto }
function drop() { KEPT.clear(); }
function proto(c, mo, label) {
  const key = [c.o.gid || '', c.o.game || '', c.o.mod || '', mo.kind, low(mo.target), low(mo.skin || ''), low(mo.variant || '')].join('\n'), nowMs = Date.now();
  const k = KEPT.get(key);
  if (k && nowMs - k.at < KEEP_MS) return k.proto;
  let p;
  try { p = mo.kind === 'vehicle' ? vehicleProto(c, mo.target, mo.variant) : soldierProto(c, mo.target, label, mo.skin, mo.variant); } catch (e) { p = { error: String((e && e.message) || e).split('\n')[0] }; }
  KEPT.delete(key);
  KEPT.set(key, { at: nowMs, proto: p });
  while (KEPT.size > KEEP_N) KEPT.delete(KEPT.keys().next().value);
  return p;
}

// ---------- the row ----------
// rows of slots along Y, each row centred on 0; returns the X the next row block starts at (going back, -X)
function placeRow(row, frontX, gap, minW) {
  const depth = Math.max(...row.map(f => f.p.box.max[0] - f.p.box.min[0]));
  const ws = row.map(f => Math.max(minW, f.p.box.max[1] - f.p.box.min[1]) + gap);
  let y = -ws.reduce((a, x) => a + x, 0) / 2;
  row.forEach((f, i) => {
    const bx = f.p.box, cy = y + ws[i] / 2;
    f.oy = cy - (bx.min[1] + bx.max[1]) / 2;
    f.ox = frontX - bx.max[0];
    y += ws[i];
  });
  return frontX - depth;
}

async function lineup(o) {
  o = o || {};
  const notes = [], figures = [], meshes = [];
  const note = s => { if (s && !notes.includes(s)) notes.push(s); };
  const max = Math.max(1, Math.floor(Number(o.max) || MAX));
  const models = (o.models || []).filter(m => m && m.target);
  const empty = () => ({ scene: { format: 'scene/1', units: 20, bounds: null, missing: [], bones: [], meshes: [], volumes: [] }, figures: [], notes });
  if (!models.length) { note('There is nothing to show in this buy.'); return empty(); }
  if (!o.game) { note('The game folder is not set, so the units cannot be shown.'); return empty(); }
  let c;
  try { c = open(o); } catch (e) { note('The game files could not be read, so the units cannot be shown.'); return empty(); }
  const men = [], vehs = [], cut = [], missing = [];
  try {
    let placed = 0;
    for (const mo of models) {
      const kind = mo.kind === 'vehicle' ? 'vehicle' : 'soldier', label = String(mo.name || mo.id || mo.target);
      const n = Math.max(1, Math.floor(Number(mo.n) || 1));
      const take = Math.min(n, max - placed);
      if (take < n) cut.push((n - take) + ' x ' + label);
      if (take <= 0) continue;
      const p = proto(c, { kind, target: String(mo.target), skin: mo.skin ? String(mo.skin) : '', variant: mo.variant ? String(mo.variant) : '' }, label);
      if (!p || p.error || !p.box) { note('The model of ' + label + ' was not found in the game files, so it is not shown.'); continue; }
      for (const s of p.notes) note(s);
      for (const f of p.missing || []) if (!missing.includes(f)) missing.push(f);
      for (let i = 0; i < take; i++) (kind === 'vehicle' ? vehs : men).push({ kind, mo, label, p, of: n });
      placed += take;
    }
  } finally { if (c.own) { try { c.src.close(); } catch (e) { /* closed */ } } }
  // [I] GoH: a soldier's winter look swaps meshes too (<mesh>#winter.ply, GHFMT-10) and follows the map's season; the scene shows the
  // meshes and textures the model files name, and those of a variant that is asked for (models[].variant) or set in the def
  if (o.gid === 'goh' && men.some(f => !f.p.variant)) note('In Gates of Hell the soldiers are shown in their summer look. The winter look of a map swaps parts of the model too and is not shown here.');
  if (cut.length) note('Only the first ' + max + ' figures are shown. Not shown: ' + cut.join(', ') + '.');
  // soldiers in front, rows of PER_ROW going back; vehicles behind them
  let x = 0;
  for (let i = 0; i < men.length; i += PER_ROW) x = placeRow(men.slice(i, i + PER_ROW), x, GAP_MAN, MIN_MAN) - ROW_MAN;
  if (men.length && vehs.length) x -= ROW_VEH - ROW_MAN;
  for (let i = 0; i < vehs.length;) {
    let w = 0, j = i;
    while (j < vehs.length && (j === i || w + (vehs[j].p.box.max[1] - vehs[j].p.box.min[1]) + GAP_VEH <= VEH_ROW_WIDTH)) { w += vehs[j].p.box.max[1] - vehs[j].p.box.min[1] + GAP_VEH; j++; }
    x = placeRow(vehs.slice(i, j), x, GAP_VEH, 0) - ROW_VEH;
    i = j;
  }
  const all = box();
  for (const f of vehs.concat(men)) {
    const index = figures.length, at = [1, 0, 0, 0, 1, 0, 0, 0, 1, f.ox, f.oy, 0], bx = f.p.box;
    const fb = { min: [bx.min[0] + f.ox, bx.min[1] + f.oy, bx.min[2]], max: [bx.max[0] + f.ox, bx.max[1] + f.oy, bx.max[2]] };
    grow(all, fb);
    figures.push({ index, kind: f.kind, id: f.mo.id == null ? null : f.mo.id, name: f.label, target: String(f.mo.target), x: (fb.min[0] + fb.max[0]) / 2, y: (fb.min[1] + fb.max[1]) / 2,
      ox: f.ox, oy: f.oy, box: fb, of: f.of, variant: f.p.variant || '', swapped: f.p.swapped || 0, gear: f.p.gear.slice(), clip: f.p.clip, pose: f.p.pose, frame: f.p.frame, frames: f.p.frames });
    for (const m of f.p.meshes) {
      meshes.push({ bone: -1, file: m.file, world: m.baked ? at : mul(m.world, at), mirrored: m.mirrored, skinned: m.skinned, parts: m.parts, target: m.target, figure: index, variant: m.variant || undefined });
    }
  }
  return { scene: { format: 'scene/1', units: 20, bounds: boxOk(all), missing, bones: [], meshes, volumes: [] }, figures, notes };
}

module.exports = { lineup, drop, _t: { breedOf, block, modeOf, POSES, placeRow } };

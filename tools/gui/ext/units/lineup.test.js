// units line-up test: the skinning maths (lib/model/skin.js) on a synthetic skinned ply, then lineup() on a tiny loose game
// dir (human.mdl + clip list with an (include), a skin with a skinned body, a breed with rifle, cap, pack and ammo, the
// item models, a vehicle, a mod folder with one more breed), then the real installs when their folders exist (skip line
// otherwise).
// usage: node lineup.test.js <scratch dir>     last line: PASS units lineup (N)
// Author: Imperator_Aug (ARSENAL, ia-9f8517f6)
'use strict';
const fs = require('fs'), path = require('path'), assert = require('assert');
const scratch = path.resolve(process.argv[2] || require('path').join(require('os').tmpdir(), 'units-lineup-test'));
const mdl = require('../../../lib/model/mdl'), plyLib = require('../../../lib/model/ply'), sceneLib = require('../../../lib/model/scene');
const skin = require('../../../lib/model/skin'), games = require('../../../lib/games');
const { lineup, drop, _t } = require('./lineup');

let n = 0;
const ok = msg => { n++; console.log('ok ' + n + ' ' + msg); };
const near = (a, b, msg, eps) => { assert.strictEqual(a.length, b.length, msg + ' (length)'); for (let i = 0; i < a.length; i++) assert.ok(Math.abs(a[i] - b[i]) <= (eps || 1e-4), msg + ' [' + i + '] ' + a[i] + ' vs ' + b[i]); };

// ---------- bytes ----------
const B = (...a) => Buffer.concat(a.map(x => (Buffer.isBuffer(x) ? x : Buffer.from(x, 'latin1'))));
const i32 = (...a) => Buffer.concat(a.map(v => { const b = Buffer.alloc(4); b.writeInt32LE(v); return b; }));
const u32 = v => { const b = Buffer.alloc(4); b.writeUInt32LE(v >>> 0); return b; };
const u16 = (...a) => Buffer.concat(a.map(v => { const b = Buffer.alloc(2); b.writeUInt16LE(v); return b; }));
const f32 = (...a) => Buffer.concat(a.map(v => { const b = Buffer.alloc(4); b.writeFloatLE(v); return b; }));
const s8 = x => B(Buffer.from([x.length]), x);
const put = (root, key, data) => {
  const f = path.join(root, key); fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, Buffer.isBuffer(data) ? data : Buffer.from(data.replace(/\r?\n/g, '\r\n'), 'latin1'));
};
// a plain mesh: 4 corners, 2 triangles; position, normal, one uv
const plain = pts => B('EPLY', 'BNDS', f32(0, 0, 0, 1, 1, 1), 'MESH', u32(0x112), i32(0, 2), u32(0x004), s8('a.dds'),
  'VERT', i32(4), u16(32, 7), ...pts.map(p => f32(p[0], p[1], p[2], 0, 0, 1, 0, 0)), 'INDX', i32(6), u16(0, 1, 2, 0, 2, 3));
// a skinned mesh (flags 0x10): position, one weight, four bone index bytes, normal, uv. SKIN body, arm: slot 0 = the bone
// that carries the mesh, slot 1 = body, slot 2 = arm.
const SK = [
  { p: [0, 0, 0], w: 1, ix: [1, 0] },      // all on body
  { p: [5, 0, 10], w: 1, ix: [2, 0] },     // all on arm
  { p: [5, 5, 10], w: 0.5, ix: [2, 1] },   // half arm, half body
  { p: [0, 5, 0], w: 1, ix: [0, 0] },      // on the carrying bone
];
const skinned = () => B('EPLY', 'BNDS', f32(0, 0, 0, 5, 5, 10), 'SKIN', i32(2), s8('body'), s8('arm'), 'MESH', u32(0x112), i32(0, 2), u32(0x014), s8('a.dds'),
  'VERT', i32(4), u16(40, 7), ...SK.map(v => B(f32(v.p[0], v.p[1], v.p[2], v.w), Buffer.from([v.ix[0], v.ix[1], 0, 0]), f32(0, 0, 1, 0, 0))), 'INDX', i32(6), u16(0, 1, 2, 0, 2, 3));

const tr = (x, y, z) => [1, 0, 0, 0, 1, 0, 0, 0, 1, x, y, z];
const TURN = [0, 0, -1, 0, 1, 0, 1, 0, 0];   // the arm turned a quarter about Y: its X axis points down

(async () => {
  // ---------- (1) skinning maths ----------
  const sp = plyLib.parse(skinned());
  assert.ok(!sp.error, sp.error); assert.ok(skin.isSkinned(sp), 'skinned ply seen as skinned');
  assert.ok(!skin.isSkinned(plyLib.parse(plain([[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]]))), 'plain ply is not');
  for (const base of [tr(0, 0, 10), [0, 1, 0, -1, 0, 0, 0, 0, 1, 3, -4, 10], [1, 0, 0, 0, -1, 0, 0, 0, 1, 0, 0, 10]]) {
    const restOf = { body: mdl.mul(tr(1, 2, 3), base), arm: mdl.mul(tr(0, 0, 10), base) }, rest = name => restOf[name] || null;
    const a = skin.apply(sp, { baseRest: base, rest, baseNow: base, now: rest });
    const b = plyLib.transform(sp, base, { keepWinding: true });
    near(Array.from(a.vertices.position), Array.from(b.vertices.position), 'rest pose positions');
    near(Array.from(a.vertices.normal), Array.from(b.vertices.normal), 'rest pose normals');
    assert.deepStrictEqual(Array.from(a.indices), Array.from(sp.indices), 'indices untouched');
    assert.deepStrictEqual(a.skinned.missing, [], 'no bone missing');
  }
  ok('skinning in the rest pose equals the unskinned mesh moved by its bone (plain, turned and mirrored bone)');

  {
    const base = tr(0, 0, 10), bodyW = tr(0, 0, 10), armRest = tr(0, 0, 20), armNow = TURN.concat([0, 0, 20]);
    const rest = name => ({ body: bodyW, arm: armRest })[name] || null, now = name => ({ body: bodyW, arm: armNow })[name] || null;
    const a = skin.apply(sp, { baseRest: base, rest, baseNow: base, now });
    near(Array.from(a.vertices.position), [0, 0, 10, 0, 0, 15, 2.5, 5, 17.5, 0, 5, 10], 'posed positions');
    assert.strictEqual(sp.vertices.position[4], 0, 'input untouched');
    const pal = skin.palette(sp, { baseRest: base, rest, baseNow: base, now });
    near(pal[1], mdl.mul(mdl.mul(base, mdl.invert(armRest)), armNow), 'palette = mesh bone at rest * inverse(bone at rest) * bone now');
    const lostArm = skin.apply(sp, { baseRest: base, rest: nm => (nm === 'body' ? bodyW : null), baseNow: base, now });
    assert.deepStrictEqual(lostArm.skinned.missing, ['arm'], 'missing bone named');
    near(Array.from(lostArm.vertices.position), Array.from(plyLib.transform(sp, base, { keepWinding: true }).vertices.position), 'missing bone: vertices stay with the mesh bone');
    const fl = skin.flipWinding(sp);
    assert.deepStrictEqual(Array.from(fl.indices), [0, 2, 1, 0, 3, 2], 'winding swapped'); assert.deepStrictEqual(Array.from(sp.indices), [0, 1, 2, 0, 2, 3]);
    assert.ok(skin.det(TURN.concat([0, 0, 0])) > 0 && skin.det([1, 0, 0, 0, -1, 0, 0, 0, 1, 0, 0, 0]) < 0, 'determinant sign');
  }
  ok('posed: a vertex follows its bone, a half-weighted one sits half way, a missing bone is named and leaves the vertex with the mesh');

  // ---------- (2) small readers ----------
  const br = _t.breedOf(Buffer.from('{breed\r\n\t{skin "sold"} ; note {item "no"}\r\n\t{inventory\r\n\t\t{item "mosin"}\r\n\t\t{item "rifle ammo" 30}\r\n\t\t{in_hands 0}\r\n\t}\r\n\t{armors\r\n\t\t{head "cap"}\r\n\t}\r\n}\r\n'));
  assert.deepStrictEqual(br, { items: ['mosin', 'rifle ammo'], inHands: 0, armors: [{ slot: 'head', item: 'cap' }] });
  assert.strictEqual(_t.modeOf(['mosin', 'weapon', 'rifle']), 'rifle'); assert.strictEqual(_t.modeOf(['mg42', 'weapon', 'mgun']), 'mgun');
  assert.strictEqual(_t.modeOf(['tt', 'weapon', 'pistol']), 'pistol'); assert.strictEqual(_t.modeOf(['map']), 'none');
  ok('breed reader (items, in_hands, armors, comments dropped) and weapon kind -> pose list');

  // ---------- (3) lineup on a synthetic game ----------
  require('../../../lib/testscratch').guard(scratch);   // never wipe a shared root, the repo, a game or a mod
  fs.rmSync(scratch, { recursive: true, force: true });
  const G = path.join(scratch, 'game'), M = path.join(scratch, 'mymod');
  fs.mkdirSync(path.join(G, 'mods'), { recursive: true }); fs.mkdirSync(path.join(M, 'resource'), { recursive: true });
  const skel = view => ['{Skeleton', '\t{extension "/properties/animation/human/human_anm.ext"}', '\t{bone "body"', '\t\t{Position 0\t0\t10}',
    '\t\t{bone "skin"' + (view ? '\n\t\t\t{VolumeView "' + view + '"}' : ''), '\t\t}',
    '\t\t{bone "arm"', '\t\t\t{Position 0\t0\t10}', '\t\t\t{bone "right_hand"', '\t\t\t\t{Position 5\t0\t0}', '\t\t\t}', '\t\t}',
    '\t\t{bone "head"', '\t\t\t{Position 0\t0\t20}', '\t\t}', '\t\t{bone "gun_back"', '\t\t\t{Position -3\t0\t5}', '\t\t}', '\t}', '}', ''].join('\n');
  const HS = 'resource/entity/humanskin/';
  put(G, HS + 'human/human.mdl', skel(null)); put(G, HS + 'human/human.def', '{game_entity\n\t{Extension "human.mdl"}\n}\n');
  put(G, HS + 'rus/sold/sold.mdl', skel('sold.ply')); put(G, HS + 'rus/sold/sold.def', '{game_entity\n\t{Extension "sold.mdl"}\n}\n');
  put(G, HS + 'rus/sold/sold.ply', skinned());
  const A = 'resource/properties/animation/human/';
  put(G, A + 'human_anm.ext', ';SDL\n{animation\n\t(include "poses.inc")\n\t{sequence "stand_gun"}\n\t{sequence "stand_idle_empty_1"}\n}\n');
  put(G, A + 'poses.inc', '{blend "pose_stand_gun_aside" {pose "stand_gun" begin}}\n{blend "pose_stand_empty_1" {pose "stand_idle_empty_1" end}}\n');
  const armAt = B('BONE', i32(0), 'MATR', f32(...TURN, 0, 0, 10));
  put(G, A + 'stand_gun.anm', B('EANM', i32(0x30000), 'FRMS', i32(2), 'BMAP', i32(1), i32(3), 'arm', 'FRMN', i32(0), armAt, 'FRMN', i32(1), armAt));
  put(G, A + 'stand_idle_empty_1.anm', B('EANM', i32(0x30000), 'FRMS', i32(3), 'BMAP', i32(1), i32(3), 'arm', 'FRMN', i32(0), 'BONE', i32(0), 'MATR', f32(1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 10)));
  put(G, 'resource/properties/human.ext', '{human\n\t{armor "head"\n\t\t{bone "head"}\n\t}\n\t{Weaponry\n\t\t{place "hand_right"\n\t\t\t{LinkBone "right_hand"}\n\t\t}\n\t}\n}\n');
  const item = (name, pts) => {
    const d = 'resource/entity/inventory/' + name + '/';
    put(G, d + name + '.def', '{game_entity\n\t{Extension "' + name + '.mdl"}\n}\n');
    put(G, d + name + '.mdl', '{Skeleton\n\t{bone "' + name + '"\n\t\t{VolumeView "' + name + '.ply"}\n\t}\n}\n');
    put(G, d + name + '.ply', plain(pts));
  };
  item('mosin', [[1, 2, 3], [2, 2, 3], [2, 3, 3], [1, 3, 3]]); item('cap', [[1, 2, 3], [2, 2, 3], [2, 3, 3], [1, 3, 3]]); item('pack', [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]]);
  const ST = 'resource/set/stuff/';
  put(G, ST + 'rifle/rifle.pattern', '{"rifle"\n\t{tags "weapon rifle"}\n\t{damage 30}\n}\n');
  put(G, ST + 'rifle/mosin', '{from "pattern rifle"\n\t{entity "mosin"}\n}\n');
  put(G, ST + 'rifle/ghost', '{from "pattern rifle"\n\t{entity "ghost_gun"}\n}\n');
  put(G, ST + 'head/cap', '{"cap"\n\t{entity "cap"}\n}\n');
  put(G, ST + 'pack', '{"pack"\n\t{entity "pack"}\n\t{inventory\n\t\t{link_bone "gun_back"}\n\t}\n}\n');
  const breed = (items, hands, armors) => '{breed\n\t{skin "sold"}\n\t{inventory\n' + items.map(i => '\t\t{item "' + i + '"}\n').join('') + (hands == null ? '' : '\t\t{in_hands ' + hands + '}\n') + '\t}\n' +
    (armors ? '\t{armors\n\t\t{head "' + armors + '"}\n\t}\n' : '') + '}\n';
  const BR = 'resource/set/breed/mp/rus/';
  put(G, BR + 'rifle.set', breed(['mosin', 'pack', 'rifle ammo'], 0, 'cap'));
  put(G, BR + 'ghost.set', breed(['ghost'], 0, null));
  put(G, BR + 'empty.set', breed(['pack'], null, null));
  put(G, BR + 'noskin.set', '{breed\n\t{skin "nobody"}\n}\n');
  put(M, BR + 'modman.set', breed(['mosin'], 0, null));
  const V = 'resource/entity/-vehicle/tank/tk/';
  put(G, V + 'tk.def', '{game_entity\n\t{Extension "tk.mdl"}\n}\n');
  put(G, V + 'tk.mdl', '{Skeleton\n\t{bone "body"\n\t\t{Position 0\t0\t10}\n\t\t{VolumeView "body.ply"}\n\t\t{bone "gone"\n\t\t\t{VolumeView "gone.ply"}\n\t\t}\n\t}\n}\n');
  put(G, V + 'body.ply', plain([[-40, -20, 0], [40, -20, 0], [40, 20, 0], [-40, 20, 30]]));
  // for the variant cases below: a winter mesh of the body and of the tank, a second def of the skin with its own variant
  put(G, HS + 'rus/sold/sold#winter.ply', skinned()); put(G, V + 'body#winter.ply', plain([[-40, -20, 0], [40, -20, 0], [40, 20, 0], [-40, 20, 60]]));
  put(G, HS + 'rus/sold/sold2.def', '{game_entity\n\t{Extension "sold.mdl"}\n\t{texmod "camo"}\n}\n');

  const S = (target, nn, name) => ({ kind: 'soldier', target, id: target, name: name || target.split('/').pop(), n: nn });
  const call = (models, more) => { drop(); return lineup(Object.assign({ game: G, gid: 'as64', mod: null, models }, more || {})); };
  const posOf = m => { const out = []; for (const p of m.parts) { const a = sceneLib.unb64(p.positions, Float32Array), w = m.world; for (let k = 0; k < a.length; k += 3) out.push([a[k] * w[0] + a[k + 1] * w[3] + a[k + 2] * w[6] + w[9], a[k] * w[1] + a[k + 1] * w[4] + a[k + 2] * w[7] + w[10], a[k] * w[2] + a[k + 1] * w[5] + a[k + 2] * w[8] + w[11]]); } return out; };
  const has = (list, p, msg) => assert.ok(list.some(q => Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]) + Math.abs(q[2] - p[2]) < 1e-3), msg + ': ' + JSON.stringify(p) + ' not in ' + JSON.stringify(list));

  let r = await call([S('breed:mp/rus/rifle', 1, 'Rifleman')]);
  assert.strictEqual(r.scene.format, 'scene/1'); assert.strictEqual(r.scene.units, 20);
  assert.strictEqual(r.figures.length, 1); assert.deepStrictEqual(r.notes, [], 'no notes: ' + r.notes.join(' | '));
  let f = r.figures[0];
  assert.deepStrictEqual([f.index, f.kind, f.id, f.name, f.target, f.of], [0, 'soldier', 'breed:mp/rus/rifle', 'Rifleman', 'breed:mp/rus/rifle', 1]);
  assert.deepStrictEqual(f.gear, ['mosin', 'cap', 'pack'], 'gear: weapon, headgear, pack; the ammunition is not gear');
  assert.deepStrictEqual([f.pose, f.clip, f.frame, f.frames], ['pose_stand_gun_aside', 'stand_gun', 0, 2], 'pose found through the (include) of the clip list');
  const at = [f.ox, f.oy, 0], off = p => [p[0] + at[0], p[1] + at[1], p[2] + at[2]];
  const byFile = name => r.scene.meshes.filter(m => /([^/\\]+)$/.exec(m.file)[1] === name);
  assert.strictEqual(r.scene.meshes.length, 4);
  for (const m of r.scene.meshes) { assert.strictEqual(m.figure, 0); assert.ok(m.target, 'mesh target'); assert.strictEqual(m.bone, -1); }
  const body = byFile('sold.ply')[0], bp = posOf(body);
  assert.ok(body.skinned, 'body marked skinned'); assert.strictEqual(body.target, 'breed:mp/rus/rifle');
  for (const p of [[0, 0, 10], [0, 0, 15], [2.5, 5, 17.5], [0, 5, 10]]) has(bp, off(p), 'body vertex bent to the posed arm');
  assert.strictEqual(byFile('mosin.ply')[0].target, 'mosin', 'item mesh carries the item entity as target');
  has(posOf(byFile('mosin.ply')[0]), off([3, -2, 14]), 'rifle in the posed right hand (Y mirrored, then the hand bone)');
  has(posOf(byFile('cap.ply')[0]), off([1, -2, 33]), 'cap on the head bone (Y mirrored)');
  has(posOf(byFile('pack.ply')[0]), off([-3, 0, 15]), 'pack on its link bone');
  const all = [].concat(...r.scene.meshes.map(posOf));
  for (let k = 0; k < 3; k++) {
    near([Math.min(...all.map(p => p[k]))], [r.scene.bounds.min[k]], 'scene bounds min', 1e-3); near([Math.max(...all.map(p => p[k]))], [r.scene.bounds.max[k]], 'scene bounds max', 1e-3);
    near([f.box.min[k], f.box.max[k]], [r.scene.bounds.min[k], r.scene.bounds.max[k]], 'figure box = scene bounds for one figure', 1e-3);
  }
  near([f.x, f.y], [(f.box.min[0] + f.box.max[0]) / 2, (f.box.min[1] + f.box.max[1]) / 2], 'x, y = middle of the figure');
  ok('one soldier: skinned body in the standing pose, rifle in hand, cap, pack, pose and clip named, bounds cover it');

  r = await call([S('breed:mp/rus/empty', 1, 'Carrier')]);
  f = r.figures[0];
  assert.deepStrictEqual([f.pose, f.clip, f.frame, f.frames], ['pose_stand_empty_1', 'stand_idle_empty_1', 2, 3], 'empty hands: the empty pose, its last frame');
  for (const p of [[0, 0, 10], [5, 0, 20], [5, 5, 20], [0, 5, 10]]) has(posOf(r.scene.meshes[0]), [p[0] + f.ox, p[1] + f.oy, p[2]], 'rest pose body');
  assert.deepStrictEqual(f.gear, ['pack']);
  ok('empty hands: the empty-hands pose, body as modelled, pack still on');

  r = await call([S('breed:mp/rus/ghost', 1, 'Ghost'), S('breed:mp/rus/noskin', 2, 'Nobody'), S('breed:mp/rus/modman', 1, 'Mod man'), { kind: 'vehicle', target: 'no_such_tank', id: 'x', name: 'Lost tank', n: 1 }]);
  assert.strictEqual(r.figures.length, 1); assert.deepStrictEqual(r.figures[0].gear, []);
  assert.ok(r.notes.some(s => /weapon of Ghost/.test(s) && /no model/.test(s)), 'weapon without a model noted: ' + r.notes.join(' | '));
  for (const nm of ['Nobody', 'Mod man', 'Lost tank']) assert.ok(r.notes.some(s => s.includes(nm) && /not found/.test(s)), nm + ' noted as missing');
  assert.ok(!r.notes.some(s => /ammo/i.test(s)), 'no note about ammunition');
  for (const s of r.notes) assert.ok(/^[A-Z].*\.$/.test(s) && !/\b(mdl|ply|breed|undefined|null|NaN)\b/.test(s), 'plain sentence: ' + s);
  r = await call([S('breed:mp/rus/modman', 1, 'Mod man')], { mod: M });
  assert.strictEqual(r.figures.length, 1, 'a breed of the mod folder is found with the mod'); assert.deepStrictEqual(r.figures[0].gear, ['mosin']);
  ok('notes: weapon without a model, missing models by name, none for ammunition; the mod folder is read');

  const T = { kind: 'vehicle', target: 'tk', id: 'tk', name: 'Tank', n: 2 };
  r = await call([T, S('breed:mp/rus/rifle', 14, 'Rifleman'), S('breed:mp/rus/empty', 1, 'Carrier')]);
  assert.strictEqual(r.figures.length, 17); assert.deepStrictEqual(r.figures.map(x => x.kind).join(''), 'vehicle'.repeat(2) + 'soldier'.repeat(15));
  r.figures.forEach((x, i) => assert.strictEqual(x.index, i));
  assert.deepStrictEqual(r.figures.map(x => x.of), [2, 2].concat(new Array(14).fill(14), [1]));
  const men = r.figures.filter(x => x.kind === 'soldier'), vs = r.figures.filter(x => x.kind === 'vehicle');
  const row1 = men.slice(0, 12), row2 = men.slice(12);
  for (const x of row1) near([x.box.max[0]], [0], 'front row stands at the front line');
  assert.ok(row2.every(x => x.box.max[0] < Math.min(...row1.map(y => y.box.min[0]))), 'the row wraps after 12: the rest stand behind');
  assert.ok(vs.every(x => x.box.max[0] < Math.min(...men.map(y => y.box.min[0]))), 'vehicles stand behind the soldiers');
  const noOverlap = row => row.slice().sort((a, b) => a.box.min[1] - b.box.min[1]).every((x, i, a) => !i || x.box.min[1] >= a[i - 1].box.max[1] - 1e-6);
  assert.ok(noOverlap(row1) && noOverlap(row2) && noOverlap(vs), 'no two figures of a row overlap');
  for (const row of [row1, row2, vs]) near([Math.min(...row.map(x => x.y)) + Math.max(...row.map(x => x.y))], [0], 'row centred', 1e-3);
  for (const x of r.figures) for (let k = 0; k < 3; k++) assert.ok(x.box.min[k] >= r.scene.bounds.min[k] - 1e-6 && x.box.max[k] <= r.scene.bounds.max[k] + 1e-6, 'bounds cover every figure');
  const tm = r.scene.meshes.filter(m => m.figure === 0);
  assert.strictEqual(tm.length, 1, 'vehicle: one mesh, the missing one left out'); assert.strictEqual(tm[0].target, 'tk');
  assert.ok(r.scene.missing.some(x => /gone\.ply/.test(x)), 'missing file listed');
  const tb = r.figures[0].box, tp = posOf(tm[0]);
  near([Math.min(...tp.map(p => p[0])), Math.max(...tp.map(p => p[0])), Math.max(...tp.map(p => p[2]))], [tb.min[0], tb.max[0], 40], 'vehicle mesh sits in its figure box', 1e-3);
  assert.deepStrictEqual(new Set(r.scene.meshes.map(m => m.figure)).size, 17, 'every figure has meshes');
  ok('row: vehicles first and behind, soldiers in rows of 12, rows centred, nothing overlaps, bounds cover all, index and count per figure');

  r = await call([T, S('breed:mp/rus/rifle', 14, 'Rifleman'), S('breed:mp/rus/empty', 1, 'Carrier')], { max: 5 });
  assert.strictEqual(r.figures.length, 5);
  assert.ok(r.notes.some(s => /Only the first 5 figures/.test(s) && /11 x Rifleman/.test(s) && /1 x Carrier/.test(s)), 'cut figures named: ' + r.notes.join(' | '));
  r = await lineup({ game: G, gid: 'as64', mod: null, models: [] });
  assert.strictEqual(r.figures.length, 0); assert.strictEqual(r.scene.bounds, null); assert.strictEqual(r.notes.length, 1);

  // the texture variant of a model (models[].variant; the Models page's pose route and the Units skin block ask it): every mesh
  // of the figure carries it for the picture route; Gates of Hell also draws "<mesh>#<variant>.ply" in place of the mesh
  {
    const one = (gid, mo) => { drop(); return lineup({ game: G, gid, mod: null, max: 1, models: [mo] }); };
    const files = x => x.scene.meshes.map(m => /([^/\\]+)$/.exec(m.file)[1]).sort().join(' '), vars = x => [...new Set(x.scene.meshes.map(m => m.variant || ''))].join(' ');
    let a = await one('as64', Object.assign(S('breed:mp/rus/empty', 1, 'Carrier'), { variant: 'winter' }));
    assert.deepStrictEqual([a.figures[0].variant, a.figures[0].swapped, files(a)], ['winter', 0, 'pack.ply sold.ply'], 'as64: the variant is textures only');
    assert.ok(a.scene.meshes.find(m => /sold\.ply$/.test(m.file)).variant === 'winter', 'the body mesh carries the variant');
    a = await one('goh', Object.assign(S('breed:mp/rus/empty', 1, 'Carrier'), { variant: 'winter' }));
    assert.deepStrictEqual([a.figures[0].variant, a.figures[0].swapped, files(a)], ['winter', 1, 'pack.ply sold.ply'], 'goh: the variant mesh is read in place of the mesh; the mesh keeps the name the model gives it (the picture route knows that name)');
    assert.ok(!a.notes.some(s => /summer look/.test(s)), 'no summer note for a figure shown with a variant: ' + a.notes.join(' | '));
    a = await one('goh', S('breed:mp/rus/empty', 1, 'Carrier'));
    assert.deepStrictEqual([a.figures[0].variant, a.figures[0].swapped, files(a)], ['', 0, 'pack.ply sold.ply']);
    assert.ok(a.notes.some(s => /summer look/.test(s)), 'summer note when no variant is shown');
    a = await one('goh', { kind: 'vehicle', target: 'tk', id: 'tk', name: 'Tank', n: 1, variant: 'winter' });
    assert.deepStrictEqual([a.figures[0].variant, a.figures[0].swapped, files(a), Math.round(a.figures[0].box.max[2])], ['winter', 1, 'body.ply', 70], 'the shape of the variant mesh is the one drawn');
    a = await one('goh', { kind: 'vehicle', target: 'tk', id: 'tk', name: 'Tank', n: 1, variant: 'desert' });
    assert.deepStrictEqual([a.figures[0].variant, a.figures[0].swapped, files(a)], ['desert', 0, 'body.ply'], 'a variant without mesh files keeps the meshes');
    assert.strictEqual(Math.round(a.figures[0].box.max[2]), 40);
    // a skin by its entity name stands on the human skeleton; its def's own {texmod} is the variant, '-' takes it off
    a = await one('as64', { kind: 'soldier', target: 'sold2', id: 'sold2', name: 'sold2', n: 1 });
    assert.strictEqual(a.figures.length, 1, a.notes.join(' | '));
    assert.deepStrictEqual([a.figures[0].variant, vars(a)], ['camo', 'camo']);
    a = await one('as64', { kind: 'soldier', target: 'sold2', id: 'sold2', name: 'sold2', n: 1, variant: '-' });
    assert.ok(a.figures.length === 1 && (!a.figures[0].variant || a.figures[0].variant === '-') && !a.scene.meshes.some(m => m.variant === 'camo'), JSON.stringify([a.figures[0].variant, vars(a)]));
    ok('variant: carried by every mesh for the picture; Gates of Hell draws the variant meshes of a soldier and a vehicle (swapped), not the other games; a skin def\'s own variant, taken off with "-"');
  }
  r = await lineup({ game: path.join(scratch, 'nowhere'), gid: 'as64', mod: null, models: [T] });
  assert.strictEqual(r.figures.length, 0); assert.ok(r.notes.length >= 1, 'a game folder that is not there gives a note, not a throw');
  ok('max: the rest is named in a note; empty list and missing game folder answer with a note');

  // kept between calls: a second call gives the same scene without reading the models again
  drop();
  const one = await lineup({ game: G, gid: 'as64', mod: null, models: [S('breed:mp/rus/rifle', 3, 'Rifleman')] });
  fs.rmSync(path.join(G, HS + 'rus/sold/sold.ply'));
  const two = await lineup({ game: G, gid: 'as64', mod: null, models: [S('breed:mp/rus/rifle', 3, 'Rifleman')] });
  assert.deepStrictEqual(JSON.stringify(two.scene), JSON.stringify(one.scene), 'second call served from the kept models');
  drop();
  const three = await lineup({ game: G, gid: 'as64', mod: null, models: [S('breed:mp/rus/rifle', 3, 'Rifleman')] });
  assert.notStrictEqual(JSON.stringify(three.scene), JSON.stringify(one.scene), 'drop() forgets them');
  put(G, HS + 'rus/sold/sold.ply', skinned());
  ok('built models are kept between calls and dropped by drop()');

  // ---------- (4) real installs ----------
  const real = async (gid, models, check) => {
    let dir = '';
    try { dir = games.install(gid).dir || ''; } catch (e) { dir = ''; }
    if (!dir || !fs.existsSync(path.join(dir, 'resource'))) { console.log('skip real ' + gid + ': no install folder found'); return; }
    drop();
    const t0 = Date.now(), res = await lineup({ game: dir, gid, mod: null, models }), ms = Date.now() - t0;
    if (!res.figures.length) { console.log('skip real ' + gid + ': the sample units are not in this install (' + res.notes.join(' ') + ')'); return; }
    for (const m of res.scene.meshes) { assert.ok(m.target && m.figure >= 0 && m.figure < res.figures.length); for (const p of m.parts) assert.ok(sceneLib.unb64(p.positions, Float32Array).every(Number.isFinite), 'finite positions'); }
    for (const x of res.figures) for (let k = 0; k < 3; k++) assert.ok(x.box.min[k] >= res.scene.bounds.min[k] - 1e-3 && x.box.max[k] <= res.scene.bounds.max[k] + 1e-3);
    check(res);
    const s = res.figures.find(x => x.kind === 'soldier');
    ok('real ' + gid + ': ' + res.figures.length + ' figures in ' + ms + ' ms' + (s ? ', soldier gear ' + s.gear.join(' + ') + ', clip ' + s.clip + ' frame ' + s.frame + '/' + s.frames : ''));
  };
  const soldierOk = res => {
    const s = res.figures.find(x => x.kind === 'soldier');
    assert.ok(s, 'a soldier'); assert.ok(s.gear.length >= 1, 'the soldier carries something'); assert.ok(s.clip && s.pose, 'standing pose named');
    const h = s.box.max[2] - s.box.min[2];
    assert.ok(h > 25 && h < 50, 'a standing man is about 1.3 to 2.5 m tall, got ' + (h / 20).toFixed(2) + ' m');
    assert.ok(res.scene.meshes.some(m => m.figure === s.index && m.skinned), 'skinned body');
  };
  await real('as64', [{ kind: 'vehicle', target: 'pz4h', id: 'pz4h', name: 'Pz IV H', n: 1 }, S('breed:mp/rus/rifle', 12, 'Rifleman')], res => {
    assert.strictEqual(res.figures.length, 13); assert.strictEqual(res.figures[0].kind, 'vehicle'); soldierOk(res);
  });
  await real('goh', [S('breed:mp/ger/early/feldg_mg', 2, 'Machine gunner'), S('breed:mp/ger/early/antitank_1', 1, 'Anti-tank rifleman')], res => {
    assert.strictEqual(res.figures.length, 3); soldierOk(res);
  });

  console.log('PASS units lineup (' + n + ')');
})().catch(e => { console.error(e); process.exit(1); });

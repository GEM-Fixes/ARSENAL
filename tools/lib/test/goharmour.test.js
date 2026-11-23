// lib/goharmour.js unit test on an in-memory source (no game, no disk): read, table, plan, frontOf, scaled.
// usage: node goharmour.test.js     last line: PASS goharmour (N)
// Author: Imperator_Aug (ARSENAL, ia-goharm02)
'use strict';
const assert = require('assert');
const GA = require('../goharmour');
let n = 0; const ok = m => { n++; console.log('ok ' + n + ' ' + m); };
const crlf = s => Buffer.from(s.replace(/\r?\n/g, '\r\n'), 'latin1');
const V = 'resource/entity/vehicle/';
function src(files) {
  const m = new Map(Object.entries(files).map(([k, v]) => [k, crlf(v)]));
  return { read: k => m.get(k) || null, keys: re => [...m.keys()].filter(k => re.test(k)).sort(), inMod: () => false, m };
}
const S = src({
  [V + 'a/a.def']: '{game_entity\n\t(include "a.ext")\n\t{Chassis ("mobility_tank" speed(36) reverse(8))}\n\t(include "/entity/vehicle/common/c.inc")\n}\n',
  [V + 'a/a.ext']: '{volume "body"\n\t{thickness 40 {front 90}}\n}\n("tracks" repair(30) thickness(20))\n("gun_shield" args "shield1" 15 x)\n{volume "noside" {thickness}}\n',
  [V + 'common/c.inc']: '(include "/entity/vehicle/common/d.ext")\n',
  [V + 'common/d.ext']: '{volume "deep" {thickness 5}}\n',
  [V + 'b/b.def']: '{game_entity (include "/entity/vehicle/common/c.inc")}\n',
  [V + 'boat/boat.def']: '{game_entity {Locomotion {MaxSpeed 22}} {volume "hull" {thickness 6}}}\n',
});

// read + table
const R = GA.read(S, V + 'a/a.def');
const p = nm => R.parts.find(x => x.name === nm);
assert.deepStrictEqual([p('body').kind, p('body').sides.front, p('body').sides.rear], ['volume', 90, 40]);
assert.deepStrictEqual([p('(tracks)').kind, p('(tracks)').base], ['group', 20]);
assert.deepStrictEqual([p('shield1').kind, p('shield1').macro, p('shield1').base], ['macro', 'gun_shield', 15]);
assert.ok(p('deep') && p('deep').shared, 'two includes down, shared with b.def');
assert.strictEqual(R.speed.value, 36);
const T = GA.table(R);
assert.strictEqual(T.summary.hull.front, 90); assert.strictEqual(T.speed.kmh, 36); assert.strictEqual(T.rows.length, R.parts.length);
assert.strictEqual(GA.frontOf(R), 90);
assert.strictEqual(GA.read(S, V + 'boat/boat.def').speed.value, 22);
ok('read: volume, group thickness(N), arg macro, two-level include, mobility speed, boat MaxSpeed; table and frontOf');

// scaled
const sc = GA._t.scaled;
assert.deepStrictEqual([sc(0, 2), sc(10, 1.25), sc(3, 1.5), sc(0.05, 0.5), sc(6, 0.01)], [0, 13, 4.5, 0.1, 1]);
ok('scaled: 0 stays 0, whole mm from 5 up (at least 1), one decimal below (at least 0.1)');

// plan: a side that is not written yet is added; bytes elsewhere kept
let P = GA.plan(S, R, { set: [{ part: 'body', side: 'left', mm: 55 }] });
assert.ok(P.ok, P.reason);
let out = P.files.get(V + 'a/a.ext').toString('latin1');
assert.strictEqual(out, S.m.get(V + 'a/a.ext').toString('latin1').replace('{front 90}}', '{front 90} {left 55}}'));
ok('plan set: a missing side block is added before the closing brace, nothing else changes');

// plan: one side of a group or macro is refused
P = GA.plan(S, R, { set: [{ part: '(tracks)', side: 'front', mm: 30 }] });
assert.ok(!P.ok && /one number for every side/.test(P.reason));
P = GA.plan(S, R, { set: [{ part: 'shield1', side: 'all', mm: 25 }] });
assert.ok(P.ok && P.files.get(V + 'a/a.ext').toString('latin1').includes('"shield1" 25 x'));
ok('plan set: a macro or group takes every side only');

// plan: two-level shared refused, with the shared files named; opt.shared writes it in place
P = GA.plan(S, R, { set: [{ part: 'deep', side: 'all', mm: 7 }] });
assert.ok(!P.ok && /every unit that reads it/.test(P.reason) && P.shared.files.includes(V + 'common/d.ext'), JSON.stringify(P.reason));
P = GA.plan(S, R, { set: [{ part: 'deep', side: 'all', mm: 7 }] }, { shared: true });
assert.ok(P.ok && P.files.get(V + 'common/d.ext').toString('latin1').includes('{thickness 7}'));
ok('plan: a file shared two levels down is refused for one unit, changed for all with shared');

// plan: speed and speedScale
P = GA.plan(S, R, { speed: 44 });
assert.ok(P.ok && P.files.get(V + 'a/a.def').toString('latin1').includes('speed(44) reverse(8)'));
P = GA.plan(S, R, { speedScale: 0.5 });
assert.ok(P.ok && P.files.get(V + 'a/a.def').toString('latin1').includes('speed(18)'));
const crs = b => (b.toString('latin1').match(/\r\n/g) || []).length;
assert.strictEqual(crs(P.files.get(V + 'a/a.def')), crs(S.m.get(V + 'a/a.def')));
ok('plan speed: speed(N) set or scaled; CRLF count kept');

// plan: a shared file named by two of the unit's own files (the def and its .ext): both includes point at the copy
{
  const S2 = src({
    [V + 'u/u.def']: '{game_entity\n\t(include "u.ext")\n\t(include "/entity/vehicle/common/sk.ext")\n}\n',
    [V + 'u/u.ext']: '{volume "body" {thickness 20}}\n(include "/entity/vehicle/common/sk.ext")\n',
    [V + 'common/sk.ext']: '{volume "skirt" {thickness 8}}\n',
    [V + 'w/w.def']: '{game_entity (include "/entity/vehicle/common/sk.ext")}\n',
  });
  const R2 = GA.read(S2, V + 'u/u.def');
  const P2 = GA.plan(S2, R2, { set: [{ part: 'skirt', side: 'all', mm: 12 }] });
  assert.ok(P2.ok, P2.reason);
  const d = P2.files.get(V + 'u/u.def').toString('latin1'), x = P2.files.get(V + 'u/u.ext').toString('latin1');
  assert.ok(/\(include "u_sk\.ext"\)\r\n/.test(d) && /\(include "u_sk\.ext"\)\r\n/.test(x) && !/common\/sk/.test(d + x), d + x);
  assert.ok(P2.files.get(V + 'u/u_sk.ext').toString('latin1').includes('{thickness 12}') && !P2.files.has(V + 'common/sk.ext'));
  ok('plan: a shared file included by the def and by its .ext: every include of the unit points at its own copy, CRLF kept');
}

// the GoH forms of repair time, armour class, volume keys, hull material and a kept side (synthetic files in the vanilla forms)
{
  const S3 = src({
    'resource/properties/armor.ext': '(define "general_durability"\n\t{perks}\n)\n(define "basic_armor"\n\t{armor}\n)\n(define "tank_light_tier1"\n\t("general_durability" body(200))\n\t("basic_armor" args 15)\n)\n(define "tank_heavy_tier1"\n\t("general_durability" body(450))\n\t("basic_armor" args 30)\n)\n(define "armor_light_cannon"\n\t("cannon_durability" body(150))\n)\n',
    'resource/properties/tank.ext': '(include "vehicle.ext")\n',
    'resource/properties/vehicle.ext': '{props "steel" "vehicle"}\n',
    [V + 't/t.def']: '{game_entity\n\t(include "/properties/tank.ext")\n\t{props "heavy" "Shield"}\n\t(include "t.ext")\n}\n',
    [V + 't/t.ext']: '\t("tank_heavy_tier1")\n\t("tracks" repair(40) thickness(30))\n\t("component" volume("hull1") component("hull1") repair(10))\n\t{volume "body1"\n\t\t{thickness 30\n\t\t\t{front 80}\n\t\t}\n\t\t{CastSteel 0.8063}\n\t\t{able {holed}}\n\t}\n\t{volume "turret1"\n\t\t{thickness 40}\n\t\t{Quality "large_flaw"}\n\t\t{able {holed} {visible 0}}\n\t}\n',
    [V + 'w/w.def']: '{game_entity\n\t(include "/properties/vehicle.ext")\n\t{props "wheeled" "wood" "-steel"}\n\t{volume "body1" {thickness 3}}\n}\n',
  });
  const R3 = GA.read(S3, V + 't/t.def'), vx = nm => R3.volx.find(v => v.name === nm);
  assert.deepStrictEqual(R3.repairs.map(r => r.name + '=' + r.value), ['tracks=40', 'hull1=10']);
  assert.deepStrictEqual([R3.preset.name, R3.preset.family, R3.preset.options], ['tank_heavy_tier1', 'general_durability', ['tank_light_tier1', 'tank_heavy_tier1']]);
  assert.deepStrictEqual([R3.material.value, GA.read(S3, V + 'w/w.def').material.value], ['steel', 'wood']);
  assert.deepStrictEqual([GA.volLines(vx('body1')), GA.volLines(vx('turret1'))], [['caststeel 0.8063', 'able.holed 1'], ['quality large_flaw', 'able.holed 1', 'able.visible 0']]);
  ok('read: repair(N) of a group and of a component line, the armour class and its family, hull material through /properties/ includes, volume keys');
  let P3 = GA.plan(S3, R3, { repair: [{ part: 'tracks', s: 55 }], preset: 'tank_light_tier1' });
  let e3 = P3.files.get(V + 't/t.ext').toString('latin1');
  assert.ok(P3.ok && e3.includes('("tank_light_tier1")\r\n') && e3.includes('repair(55) thickness(30)') && e3.includes('repair(10))'), e3);
  assert.ok(!GA.plan(S3, R3, { preset: 'armor_light_cannon' }).ok && !GA.plan(S3, R3, { repair: [{ part: 'tracks', s: 0 }] }).ok && !GA.plan(S3, R3, { repair: [{ part: 'nope', s: 5 }] }).ok);
  ok('plan: repair(N) set, the armour class swapped inside its family; another family, 0 s and an unknown part refused');
  P3 = GA.plan(S3, R3, { volx: [{ part: 'body1', key: 'caststeel', value: '0.7' }, { part: 'body1', key: 'highhardness', value: 'yes' }, { part: 'body1', key: 'able.holed', value: 'none' },
    { part: 'turret1', key: 'quality', value: 'none' }, { part: 'turret1', key: 'able.visible', value: '1' }, { part: 'turret1', key: 'material', value: 'wood' }] });
  e3 = P3.files.get(V + 't/t.ext').toString('latin1');
  assert.ok(P3.ok && e3.includes('\t\t{CastSteel 0.7}\r\n\t\t{HighHardness}\r\n\t}') && !/body1[^]*able \{holed\}[^]*turret1/.test(e3), e3);
  assert.ok(e3.includes('\t\t{thickness 40}\r\n\t\t{able {holed} {visible}}\r\n\t\t{material "wood"}\r\n\t}') && !e3.includes('Quality'), e3);
  assert.ok(require('../sdlwrite').parse(P3.files.get(V + 't/t.ext')) && (e3.match(/\r\n/g) || []).length === (e3.match(/\n/g) || []).length);
  assert.ok(!GA.plan(S3, R3, { volx: [{ part: 'body1', key: 'caststeel', value: '0' }] }).ok && !GA.plan(S3, R3, { volx: [{ part: 'body1', key: 'quality', value: 'no_flaw' }] }).ok);
  ok('plan volume keys: a value changed, a flag block added on its own line, a key and a flag taken out (whole line), CRLF kept; 0 cast steel and an unseen quality refused');
  P3 = GA.plan(S3, R3, { material: 'wood' });
  assert.ok(P3.ok && P3.files.get(V + 't/t.def').toString('latin1').includes('{props "heavy" "Shield" "wood" "-steel"}'));
  const Rw = GA.read(S3, V + 'w/w.def'), Pw = GA.plan(S3, Rw, { material: 'steel' });
  assert.ok(Pw.ok && Pw.files.get(V + 'w/w.def').toString('latin1').includes('{props "wheeled"}'), Pw.reason);
  ok('plan material: wood adds "wood" "-steel" to the def\'s own props; steel takes them out again (the inherited steel back)');
  // a side kept at the old base while the base changes: one run, the side gets a block of its own
  P3 = GA.plan(S3, R3, { set: [{ part: 'body1', side: 'base', mm: 45 }, { part: 'body1', side: 'rear', mm: 30 }, { part: 'body1', side: 'top', mm: 30 }] });
  e3 = P3.files.get(V + 't/t.ext').toString('latin1');
  assert.ok(P3.ok && e3.includes('{thickness 45\r\n\t\t\t{front 80}\r\n\t\t\t{rear 30}\r\n\t\t\t{top 30}\r\n\t\t}'), e3);
  ok('plan: a new base and two sides kept at the old base in one run, each kept side on its own line');
}

// lib/modwrite (the shared write side): restore root, restore points, the file guard (scratch: a fresh subfolder of ARSENAL_TMP)
{
  const fs = require('fs'), path = require('path'), os = require('os');
  const MW = require('../modwrite');
  const W = fs.mkdtempSync(path.join(process.env.ARSENAL_TMP && path.isAbsolute(process.env.ARSENAL_TMP) ? process.env.ARSENAL_TMP : os.tmpdir(), 'modwrite-'));
  try {
    const mod = path.join(W, 'mymod'), f = path.join(mod, 'resource', 'a.txt');
    fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, Buffer.from('a\r\nb\r\n', 'latin1'));
    assert.strictEqual(MW.restoreRoot(mod), path.join(W, 'mymod.arsenal-undo'));
    const ids = MW.restorePoints(mod, ['resource/a.txt', 'resource/new.txt'], 'test');
    const pts = ids.map(id => JSON.parse(fs.readFileSync(path.join(W, 'mymod.arsenal-undo', id, 'restore-point.json'), 'utf8')));
    assert.ok(pts[0].existed && pts[0].hash && !pts[1].existed && fs.readFileSync(path.join(W, 'mymod.arsenal-undo', ids[0], 'files', 'resource', 'a.txt')).equals(Buffer.from('a\r\nb\r\n', 'latin1')));
    ok('modwrite: a mod outside any game keeps its restore points beside it (Files page form), old bytes kept, a new file noted');
    // a mod in a game's mods folder (made-up GoH: binaries/x64/call_to_arms.exe): the points stay inside the mod
    const gh = path.join(W, 'gamex'), gm = path.join(gh, 'mods', 'm1');
    fs.mkdirSync(path.join(gh, 'binaries', 'x64'), { recursive: true }); fs.writeFileSync(path.join(gh, 'binaries', 'x64', 'call_to_arms.exe'), 'MZ');
    fs.mkdirSync(path.join(gm, 'resource'), { recursive: true }); fs.writeFileSync(path.join(gm, '.arsenal-made'), '{}');
    assert.strictEqual(MW.restoreRoot(gm), path.join(gm, '.arsenal', 'undo'));
    const gi = MW.restorePoints(gm, ['resource/x.txt'], 'test', { game: gh });
    assert.ok(gi.length === 1 && fs.existsSync(path.join(gm, '.arsenal', 'undo', gi[0], 'restore-point.json')) && !fs.existsSync(path.join(gh, 'mods', 'm1.arsenal-undo')));
    ok('modwrite: a mod in <game>/mods keeps its restore points in <mod>/.arsenal/undo, no new folder in the game\'s mods folder');
    // the guard: outside the mod as written, and a link inside the mod that leads out of it
    assert.ok(/outside the mod/.test(MW.fileWhy(mod, path.join(W, 'other', 'x.txt'))));
    assert.ok(/outside the mod/.test(MW.fileWhy(mod, path.join(mod, '..', 'mymod2', 'x.txt'))));
    const out = path.join(W, 'elsewhere'); fs.mkdirSync(out);
    let linked = true; try { fs.symlinkSync(out, path.join(mod, 'resource', 'lnk'), 'junction'); } catch (e) { linked = false; }
    if (linked) {
      assert.ok(/leads out of the mod/.test(MW.fileWhy(mod, path.join(mod, 'resource', 'lnk', 'y.txt'))));
      assert.throws(() => MW.writeFiles(mod, [['resource/lnk/y.txt', Buffer.from('x')]]), e => e.code === 'MOD_WRITE_OUTSIDE');
      assert.ok(!fs.existsSync(path.join(out, 'y.txt')), 'nothing written through the link');
    }
    assert.strictEqual(MW.fileWhy(mod, path.join(mod, 'resource', 'sub', 'z.txt')), '');
    MW.writeFiles(mod, new Map([['resource/sub/z.txt', Buffer.from('z\r\n', 'latin1')]]));
    assert.ok(fs.readFileSync(path.join(mod, 'resource', 'sub', 'z.txt')).equals(Buffer.from('z\r\n', 'latin1')));
    ok('modwrite: a file outside the mod refused' + (linked ? ', a junction in the mod that leads out refused and nothing written through it' : ' (no junction made here)') + '; a file inside written, bytes kept');
  } finally { if (fs.existsSync(path.join(W, 'mymod', 'resource', 'lnk'))) fs.unlinkSync(path.join(W, 'mymod', 'resource', 'lnk')); fs.rmSync(W, { recursive: true, force: true }); }
}
console.log('PASS goharmour (' + n + ')');

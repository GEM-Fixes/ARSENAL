// Models page, Armor part under Gates of Hell (sub/armorgoh.js through the armor/table and armor/edit routes of armor.server.js), on a
// made-up GoH folder (binaries/x64/call_to_arms.exe only) and a mod that holds the unit:
//   (1) table: per-part thickness from the def and its .ext, the hull summary, the top speed
//   (2) edit dry: a plan, nothing written; a single side of a macro part is refused with one plain line
//   (3) edit: set one side, scale every part, the speed; bytes outside the numbers and CRLF kept; restore points next to the mod
//   (4) a file shared with another unit's folder is copied next to this unit and the include repointed; the shared file is untouched
//   (5) guns, shells, shot, effects and map answer by GoH's own rules (tools/armorsim/goh.js, note 'T'); a bad angle and side refused;
//       nothit keeps the plain GoH line; AS64 table/edit are not sent to armorgoh
//   (6) table rows carry the model's volume ids (sceneIds) for the 3D view's thickness colours
// usage: node armorgoh.test.js <scratch dir>     last line: PASS models armorgoh (N)
// Author: Imperator_Aug (ARSENAL, ia-goharm02)
'use strict';
const fs = require('fs'), path = require('path'), assert = require('assert');
const scratch = path.resolve(process.argv[2] || path.join(require('os').tmpdir(), 'models-armorgoh-test'));
const root = path.join(scratch, 'armorgoh-test');
fs.rmSync(root, { recursive: true, force: true }); fs.mkdirSync(root, { recursive: true });
process.env.ARSENAL_CACHE = path.join(root, 'cache');
delete process.env.ARSENAL_ADVANCED;
let n = 0; const ok = m => { n++; console.log('ok ' + n + ' ' + m); };
const G = require('../game');
const A = require('./armor.server');

const gh = path.join(root, 'goh'), mod = path.join(root, 'mymod');
const put = (base, rel, s) => { const p = path.join(base, ...rel.split('/')); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, Buffer.from(s.replace(/\r?\n/g, '\r\n'), 'latin1')); };
put(gh, 'binaries/x64/call_to_arms.exe', 'MZ fake');
fs.mkdirSync(path.join(gh, 'resource'), { recursive: true });
const V = 'resource/entity/vehicle/';
put(mod, V + 'tankg/tankg.def', '{game_entity\n\t; a comment \xe9\n\t(include "tankg.ext")\n\t{Chassis\n\t\t("mobility_tank" speed(40) reverse(10))\n\t}\n\t(include "/entity/vehicle/common/hull.ext")\n}\n');
put(mod, V + 'tankg/tankg.ext', '{volume "body1"\n\t{thickness 30 {front 80} {top 20}}\n}\n{volume "turret1"\n\t{thickness 45 {front 60}}\n}\n("shield" args "mantlet" 50)\n');
put(mod, V + 'common/hull.ext', '{volume "skirt"\n\t{thickness 8}\n}\n');
put(mod, V + 'other/other.def', '{game_entity\n\t(include "/entity/vehicle/common/hull.ext")\n}\n');
const goh = { gameId: () => 'goh', curDir: () => gh, gohDir: () => gh };
const R = k => A.routes['POST /api/x/models/armor/' + k];
const rd = rel => fs.readFileSync(path.join(mod, ...rel.split('/')));
const undo = path.join(root, 'mymod.arsenal-undo');

(async () => {
  // (1)
  const t = await R('table')('/x', { mod, target: 'tankg' }, goh);
  assert.strictEqual(t.game, 'goh');
  const row = nm => t.rows.find(r => r.name === nm);
  assert.deepStrictEqual(row('body1').sides.map(s => s.mm), [80, 20, 30, 30, 30, 30]);
  assert.deepStrictEqual(row('mantlet').sides.map(s => s.mm), [50, 50, 50, 50, 50, 50]);
  assert.ok(row('skirt'), 'the rooted include is read');
  assert.strictEqual(t.summary.hull.front, 80); assert.strictEqual(t.summary.turret.front, 60);
  assert.strictEqual(t.speed.kmh, 40);
  ok('table: parts from the def, its .ext and a rooted include; hull 80 front, turret 60, speed 40');

  // (2)
  const before = rd(V + 'tankg/tankg.ext');
  const d = await R('edit')('/x', { mod, target: 'tankg', volume: 'body1', side: 'left', mm: 35, dry: true }, goh);
  assert.ok(d.ok && d.dry && d.changes.length === 1, JSON.stringify(d));
  assert.ok(before.equals(rd(V + 'tankg/tankg.ext')) && !fs.existsSync(undo), 'dry writes nothing');
  const m = await R('edit')('/x', { mod, target: 'tankg', volume: 'mantlet', side: 'front', mm: 70, dry: true }, goh);
  assert.ok(!m.ok && m.refused && /one number for every side/.test(m.reason), JSON.stringify(m));
  await assert.rejects(() => R('edit')('/x', { mod, target: 'tankg' }, goh), e => e.status === 400);
  ok('edit dry: a plan and nothing written; one side of a macro part refused; an empty change refused');

  // (3)
  const w = await R('edit')('/x', { mod, target: 'tankg', volume: 'body1', side: 'left', mm: 35 }, goh);
  assert.ok(w.ok && w.restore.length === 1, JSON.stringify(w));
  const e1 = rd(V + 'tankg/tankg.ext').toString('latin1');
  assert.ok(e1.includes('{thickness 30 {front 80} {top 20} {left 35}}'), e1);
  assert.strictEqual(e1.replace(/\r\n/g, '').includes('\n'), false, 'CRLF kept');
  // (4) skirt lives in common/hull.ext, read by other.def too
  const sharedBefore = rd(V + 'common/hull.ext');
  const k = await R('edit')('/x', { mod, target: 'tankg', volume: 'skirt', side: 'all', mm: 12 }, goh);
  assert.ok(k.ok, JSON.stringify(k));
  assert.ok(sharedBefore.equals(rd(V + 'common/hull.ext')), 'the shared file is untouched');
  const d3 = rd(V + 'tankg/tankg.def').toString('latin1');
  const inc = /\(include "([^"]*hull[^"]*)"\)/.exec(d3);
  assert.ok(inc && !/common/.test(inc[1]), d3);
  assert.ok(rd(V + 'tankg/' + inc[1]).toString('latin1').includes('{thickness 12}'));
  ok('shared file: copied next to the unit as ' + inc[1] + ', include repointed, the shared one unchanged');

  const s = await R('edit')('/x', { mod, target: 'tankg', scale: 1.5, speed: 50 }, goh);
  assert.ok(s.ok, JSON.stringify(s));
  const e2 = rd(V + 'tankg/tankg.ext').toString('latin1'), d2 = rd(V + 'tankg/tankg.def').toString('latin1');
  assert.ok(e2.includes('{thickness 45 {front 120} {top 30} {left 53}}') && e2.includes('"mantlet" 75'), e2);
  assert.ok(d2.includes('speed(50)') && d2.includes('; a comment \xe9'), d2);
  const pts = fs.readdirSync(undo).map(id => JSON.parse(fs.readFileSync(path.join(undo, id, 'restore-point.json'), 'utf8')));
  assert.ok(pts.length >= 6 && pts.every(p => !p.existed || p.hash) && pts.filter(p => !p.existed).length === 1, JSON.stringify(pts));
  assert.ok(rd(V + 'tankg/tankg_hull.ext').toString('latin1').includes('{thickness 18}'), 'the unit copy of the shared file is scaled too');
  ok('edit: every part x1.5 (its own copy of hull.ext too) and the speed written into the mod; comment bytes and CRLF kept; a restore point per file');

  // (5) the simulator by GoH's own rules: a gun and its shell in the mod; body1 top is 30 mm after the x1.5 scale above
  put(mod, 'resource/set/stuff/gun/kw75', '{weapon_bullet\n\t{calibre 75}\n\t{filling "bullet75"}\n\t{projectileDamageTable {10 120} {1000 80}}\n\t{OvermatchCalibre {0 1 0} {60 2 0.5}}\n\t{MinimumDamageModifier 5}\n}\n');
  put(mod, 'resource/set/stuff/shell/bullet75.ap.ammo', '{bullet\n\t{tag "ammo shell ap"}\n}\n');
  const gl = await R('guns')('/x', { mod, limit: 5000 }, goh);
  assert.ok(gl.guns.some(g => g.name === 'kw75'), JSON.stringify(gl));
  const sl = await R('shells')('/x', { mod, weapon: 'kw75' }, goh);
  assert.deepStrictEqual(sl.shells.map(s => [s.ammo, s.kind, s.overmatch]), [['bullet75.ap.ammo', 'ap', 'calibre']]);
  assert.strictEqual(sl.note, 'T');
  const sb = { mod, target: 'tankg', weapon: 'kw75', ammo: 'bullet75.ap.ammo', range: 10, volume: 'body1', side: 'top', angle: 0 };
  const sh = await R('shot')('/x', sb, goh);
  assert.ok(sh.plate.result === 'penetrate' && sh.plate.nominal === 30 && sh.plate.effective === 30 && sh.note === 'T' && sh.leftOut.length === 6, JSON.stringify(sh));
  // the mission's armour scale and the difficulty side go through the body: 30 mm x 2 = 60; a bad side is refused
  const sk = await R('shot')('/x', Object.assign({}, sb, { armorScale: 2, group: 'enemy' }), goh);
  assert.ok(sk.plate.nominal === 60 && sk.rules && sk.rules.armorScale === 2 && sk.rules.group === 'enemy', JSON.stringify(sk.rules) + ' ' + sk.plate.nominal);
  await assert.rejects(() => R('shot')('/x', Object.assign({}, sb, { group: 'martian' }), goh), e => e.status === 400);
  const fx = await R('effects')('/x', sb, goh);
  assert.ok(fx.effects && fx.effects.part === null, JSON.stringify(fx.effects));
  const mp = await R('map')('/x', { mod, target: 'tankg', weapon: 'kw75', ammo: 'bullet75.ap.ammo', range: 10, angle: 30 }, goh);
  assert.ok(mp.rows.some(x => x.volume === 'body1' && x.sides.length === 6) && mp.angle === 30 && mp.note === 'T', JSON.stringify(mp).slice(0, 400));
  // a 3D body (no volume, a direction) goes to goh.shot3 / map3: here the unit has no model, so a plain noModel refusal in the 3D form
  const s3 = await R('shot')('/x', { mod, target: 'tankg', weapon: 'kw75', ammo: 'bullet75.ap.ammo', range: 10, az: 30, el: 0 }, goh);
  assert.ok(s3.mode === '3d' && s3.note === 'T' && (s3.plates || s3.code === 'noModel'), JSON.stringify(s3).slice(0, 300));
  const m3 = await R('map')('/x', { mod, target: 'tankg', weapon: 'kw75', ammo: 'bullet75.ap.ammo', range: 10, view: 'front', grid: '8x6' }, goh);
  assert.ok(m3.mode === '3d' && (m3.cells || m3.code === 'noModel'), JSON.stringify(m3).slice(0, 300));
  await assert.rejects(() => R('map')('/x', { mod, target: 'tankg', weapon: 'kw75', ammo: 'bullet75.ap.ammo', range: 10, view: 'front', grid: '9999x2' }, goh), e => e.status === 400);
  await assert.rejects(() => R('shot')('/x', Object.assign({}, sb, { angle: 95 }), goh), e => e.status === 400);
  await assert.rejects(() => R('effects')('/x', Object.assign({}, sb, { side: 'under' }), goh), e => e.status === 400);
  await assert.rejects(() => R('shells')('/x', { mod, weapon: 'nogun' }, goh), e => e.status === 400);
  await assert.rejects(() => R('nothit')('/x', { mod, target: 'tankg' }, goh), e => e.message === G.NA_GOH_ARMOUR);
  let gone = false; const ag = require.cache[require.resolve('./armorgoh')], t0 = ag.exports.table; ag.exports.table = () => { gone = true; return {}; };
  try { await R('table')('/x', { mod, target: 'tankg' }, { gameId: () => 'as64' }); } catch (e) { /* the AS64 path needs the simulator */ }
  ag.exports.table = t0;
  assert.strictEqual(gone, false, 'AS64 does not reach armorgoh');
  ok('GoH simulator: guns, shells, shot, effects and map by GoH rules (note T); bad angle and side refused; nothit plain line; AS64 stays on its path');

  // (6) table rows carry the model's volume ids (sceneIds) so the 3D view colours the right volumes; a unit without a model has none
  put(mod, V + 'tankm/tankm.def', '{game_entity\n\t{Extension "tankm.mdl"}\n\t{volume "hull" {thickness 40}}\n\t{volume "gun" {thickness 20}}\n}\n');
  put(mod, V + 'tankm/tankm.mdl', '{Skeleton\n\t{bone "basis"\n\t\t{bone "tower"}\n\t}\n}\n{Volume "hull"\n\t{Box 40 20 10}\n\t{Bone "basis"}\n}\n{Volume "gun"\n\t{Box 4 4 4}\n\t{Bone "tower"}\n}\n');
  const tm = await R('table')('/x', { mod, target: 'tankm' }, goh);
  const sid = nm => (tm.rows.find(r => r.name === nm) || {}).sceneIds;
  assert.ok(Array.isArray(sid('hull')) && sid('hull').length === 1 && /hull$/.test(sid('hull')[0]) && /tower\/gun$/.test((sid('gun') || [])[0] || ''), JSON.stringify(tm.rows));
  assert.ok(t.rows.every(r => r.sceneIds === undefined), 'no model: no sceneIds');
  ok('table: each volume row carries its scene ids (3D view colours); no model, none');
  console.log('PASS models armorgoh (' + n + ')');
})().catch(e => { console.error(e); process.exit(1); });

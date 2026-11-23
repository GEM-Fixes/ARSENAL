// Models page, Armor part under Gates of Hell (required by armor.server.js; not a sub-tab of its own). GoH keeps armour per hit
// volume of the unit's def and the files it includes. The AS2 simulator (armorsim.js) does not run here: guns, shells, shot, map and
// effects answer by GoH's own rules (below, tools/armorsim/goh.js); nothit keeps the plain line of ../game.js:
//   POST /api/x/models/armor/table { mod, target }  -> tools/lib/goharmour table: { unit, key, rows[{name, id, kind, sides[6], sceneIds?}], summary, speed, game:'goh' }
//     (id = the part name; sceneIds = the model's volume ids of that name, for the 3D view's colours)
//   POST /api/x/models/armor/edit  { mod, target, volume, side, mm, shared, dry } | { mod, target, scale, dry } | { .., speed, dry }
//     -> { ok, refused, reason, shared: {volumes} | null, changes[{key, line, before, after, created}], notes, dry, mod, restore[ids], undo }
//     dry = the plan, nothing written; written: a copy of each changed file in the mod (the game's file when the mod has none), bytes,
//     CRLF and comments kept; a file shared with other units is copied next to this unit unless `shared`. Before writing, every file
//     that is replaced gets a restore point in the Files page form (lib/modwrite restoreRoot: <mod>.arsenal-undo, or <mod>/.arsenal/undo for a mod
//     in the game's mods folder), so Files > Restore puts it back.
// Author: Imperator_Aug (ARSENAL, ia-4ad0bdce)
'use strict';
const path = require('path');
const GA = require('../../../../lib/goharmour');
const G = require('../game');

const bad = msg => { throw Object.assign(new Error(msg), { status: 400 }); };
// one source per game folder + mod: the game view is shared (lib/gameview), the mod's loose files are listed again each request
function srcOf(ctx, b, mod) {
  const game = G.gameDir(ctx, b);
  if (!game) bad('No Gates of Hell folder found. Set the GoH folder on the Start page first.');
  return GA.sourceOf(game, mod || null);
}
function defOf(src, target) {
  const s = String(target).replace(/\\/g, '/');
  if (/\.def$/i.test(s) && s.includes('/')) { const k = s.toLowerCase().replace(/^\/+/, ''); const key = k.startsWith('resource/') ? k : 'resource/' + k; if (src.read(key)) return key; }
  const d = src.defOf(s.split('/').pop().replace(/\.(def|mdl)$/i, ''));
  if (!d) bad('No unit file named ' + s + '.def was found in Gates of Hell or the mod. Pick a vehicle or gun.');
  return d;
}
function table(ctx, b, h) {
  const mod = h.modMay(ctx, b), src = srcOf(ctx, b, mod), R = GA.read(src, defOf(src, h.unitOf(b.target)));
  if (!R.parts.length && !R.speed) bad('No armour numbers were found in ' + R.def.replace(/^resource\//, '') + ' or the files it includes (its armour comes from the game\'s shared files).');
  return Object.assign(sceneRows(GA.table(R), ctx, b, mod, src, R.def), { code: 0, cached: false });
}
// the rows are named by part; the 3D view knows the model's volume ids: each volume row gets sceneIds [ids] so the view's thickness
// colours land on the right volumes (armor.client.js colours()). No model / no scene: rows unchanged, the view stays plain.
function sceneRows(T, ctx, b, mod, src, def) {
  let ids = null;
  try {
    const game = G.gameDir(ctx, b), buf = src.read(def), mdl = buf && SIM().modelOfDef(def, buf.toString('latin1'));
    if (game && mdl) ids = SIM().sceneIds({ game, folder: mod || undefined }, mdl);
  } catch (e) { ids = null; }
  if (!ids) return T;
  for (const r of T.rows || []) { const l = ids[String(r.name || '').toLowerCase()]; if (l && l.length) r.sceneIds = l.slice(); }
  return T;
}
function edit(ctx, b, h) {
  const mod = h.modNeed(ctx, b), src = srcOf(ctx, b, mod), R = GA.read(src, defOf(src, h.unitOf(b.target))), ch = {};
  if (b.scale != null && b.scale !== '') ch.scale = h.num('scale', b.scale, 0.05, 10);
  if (b.speed != null && b.speed !== '') ch.speed = h.num('speed', b.speed, 1, 1000);
  if (b.volume != null && b.volume !== '') {
    const side = String(b.side == null ? 'all' : b.side).trim().toLowerCase();
    if (side !== 'all' && !GA.SIDES.includes(side)) bad('The side must be one of: ' + GA.SIDES.join(', ') + ', all.');
    ch.set = [{ part: h.word('volume', b.volume), side, mm: h.num('mm', b.mm, 0, 1000) }];
  }
  if (!Object.keys(ch).length) bad('Say what to change: a part and its millimetres, a scale for every part, or a top speed.');
  const P = GA.plan(src, R, ch, { shared: !!b.shared });
  const res = { ok: P.ok, refused: !P.ok, reason: P.reason || null, volume: b.volume || null, side: b.side || null, shared: P.shared ? { volumes: P.shared.files.map(k => k.replace(/^resource\//, '')) } : null,
    changes: P.changes, notes: P.notes, dry: !!b.dry, mod, game: 'goh' };
  if (!P.ok || b.dry || P.nothing) return res;
  if (ctx.job) ctx.job.writes = true;
  const keys = [...P.files.keys()];
  for (const k of keys) G.modGuard(ctx, b, path.join(mod, ...k.split('/')));
  const gopt = { game: G.gameDir(ctx, b) || undefined };
  res.restore = GA.restorePoints(mod, keys, 'models armour (GoH)', gopt);
  res.written = GA.writeFiles(mod, P.files, gopt);   // each file checked again: inside the mod, also with links followed (lib/modwrite)
  res.undo = require('../../../../lib/modwrite').restoreRoot(mod);
  (ctx.modtree || require('../../../../lib/modtree')).touch(mod);
  return res;
}
// ---------- the simulator by GoH's own rules (tools/armorsim/goh.js; untested notes, not tested in game: note 'T') ----------
//   POST /api/x/models/armor/guns    { mod, q, limit }  -> { guns: [{ name, group }], total, all }   (the GoH stuff folders)
//   POST /api/x/models/armor/shells  { mod, weapon }    -> { weapon, shells: [{ ammo, kind, calibre, penetration [[m, mm]], aimRange,
//        overmatch 'calibre'|'fixed'|'slope'|'damping'|null, minimumDamageModifier }], game, note }
//   POST /api/x/models/armor/shot    { mod, target, weapon, ammo, range, volume, side, angle } -> { plate { nominal, effective, result,
//        margin, factors }, verdict, penetration, leftOut[codes], note 'T' } | { refused, code, reason } (a rule the notes leave open)
//   POST /api/x/models/armor/effects same body -> the shot + effects { part, from, hp, hpBroken, modifier, loss, after, state,
//        shotsToBreak, shotsToDestroy } (part HP of vehicle_health_damage_pierce)
//   POST /api/x/models/armor/map     { mod, target, weapon, ammo, range, angle } -> { rows [{ volume, part, sides [{ side, nominal,
//        effective, result, margin, hp }] }], share, notInModel }
// Picked by part: the part, its side and the angle from the plate's normal are given (0 = square on).
// 3D (the AS64 bodies, same fields and checks as armor.server.js shotArgs / mapArgs; GoH catching up with the AS64 tab):
//   shot / effects { mod, target, weapon, ammo, range, az, el, aim | aimVolume | origin + dir, ground } (no volume) -> goh.shot3:
//     the AS64 /shot form { ray, plates, decisive, verdict, outcome, groundPoint, shell } + plate, effects, ricochet, refused, note 'T'
//   map { mod, target, weapon, ammo, range, view, grid } (no angle) -> goh.map3: the AS64 /map form { grid, cells, volumes, share, .. }
// Every body may carry difficulty (a set/difficulty level), group (player|ally|enemy|neutral) and armorScale (a mission's): the
// answer's rules { armorScale, difficulty, group, armor, vehicleHealth, levels }; a 3D shot adds burst, blast and bounces
const SIM = () => require('../../../../armorsim/goh');
const AS64_VIEWS = ['front', 'rear', 'left', 'right', 'top'];
function vec3(h, k, v, unit) {
  const a = Array.isArray(v) ? v : String(v == null ? '' : v).split(',');
  if (a.length !== 3) bad('"' + k + '" needs three numbers x,y,z.');
  const o = a.map(x => h.num(k, typeof x === 'string' ? x.trim() : x, -1e6, 1e6));
  if (unit && Math.hypot(o[0], o[1], o[2]) < 1e-9) bad('"' + k + '" cannot be zero.');
  return o;
}
const has = v => v != null && v !== '';
// GoH's rule inputs of every simulator body: the difficulty level and side group (set/difficulty), a mission's armour scale
const DGROUPS = ['player', 'ally', 'enemy', 'neutral'];
function rules(b, h, o) {
  if (has(b.armorScale)) o.armorScale = h.num('armorScale', b.armorScale, 0.05, 20);
  if (has(b.difficulty)) o.difficulty = h.word('difficulty', b.difficulty);
  if (has(b.group)) { const g = String(b.group).trim().toLowerCase(); if (!DGROUPS.includes(g)) bad('The side group must be one of: ' + DGROUPS.join(', ') + '.'); o.group = g; }
  return o;
}
const is3d = b => !has(b.volume) && (has(b.az) || has(b.el) || has(b.aim) || has(b.aimVolume) || has(b.origin) || has(b.dir));
function body3(b, h) {
  const o = { target: h.unitOf(b.target), weapon: h.word('weapon', b.weapon), ammo: has(b.ammo) ? h.word('ammo', b.ammo) : null, range: h.num('range', b.range, 0, 5000) };
  if (has(b.origin) || has(b.dir)) {
    if (!has(b.origin) || !has(b.dir)) bad('A shot by origin needs both the start point and the direction.');
    o.origin = vec3(h, 'origin', b.origin); o.dir = vec3(h, 'dir', b.dir, true);
  } else {
    o.az = h.num('az', has(b.az) ? b.az : 0, -360, 360); o.el = h.num('el', has(b.el) ? b.el : 0, -90, 90);
    if (has(b.aim)) o.aim = vec3(h, 'aim', b.aim);
    else if (has(b.aimVolume)) o.aimVolume = h.word('aimVolume', b.aimVolume);
  }
  if (has(b.ground)) o.ground = h.num('ground', b.ground, -10000, 10000);
  return rules(b, h, o);
}
function mapBody3(b, h) {
  const o = { target: h.unitOf(b.target), weapon: h.word('weapon', b.weapon), ammo: has(b.ammo) ? h.word('ammo', b.ammo) : null, range: h.num('range', b.range, 0, 5000) };
  const s = String(has(b.view) ? b.view : 'front').trim().toLowerCase();
  if (AS64_VIEWS.includes(s)) o.view = s;
  else {
    const m = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(s.replace(/\s+/g, ''));
    if (!m) bad('The view must be front, rear, left, right, top or az,el in degrees.');
    o.view = h.num('az', m[1], -360, 360) + ',' + h.num('el', m[2], -90, 90);
  }
  if (has(b.grid)) {
    let w, g;
    if (typeof b.grid === 'object') { w = b.grid.w; g = b.grid.h; } else { const m = /^\s*(\d+)\s*x\s*(\d+)\s*$/i.exec(String(b.grid)); if (!m) bad('The grid must be written as WxH, for example 64x48.'); w = m[1]; g = m[2]; }
    w = h.num('grid width', w, 4, 160); g = h.num('grid height', g, 4, 120);
    if (!Number.isInteger(w) || !Number.isInteger(g)) bad('The grid must be whole numbers.');
    o.grid = w + 'x' + g;
  }
  return rules(b, h, o);
}
const GSIDES = ['front', 'top', 'left', 'right', 'rear', 'bottom'];
function simOpts(ctx, b, h) {
  const game = G.gameDir(ctx, b);
  if (!game) bad('No Gates of Hell folder found. Set the GoH folder on the Start page first.');
  const mod = h.modMay(ctx, b);
  return { game, folder: mod || undefined };
}
function guns(ctx, b, h) { simOpts(ctx, b, h); return h.guns(ctx, b); }
function shells(ctx, b, h) {
  const o = simOpts(ctx, b, h), weapon = h.word('weapon', b.weapon).toLowerCase();
  if (!h.stuffKeys(SIM().open(o)).some(g => g.name === weapon)) bad('No gun named "' + weapon + '" was found. Pick one from the search list.');
  return SIM().shells(weapon, o);
}
function simBody(b, h, withPart) {
  const o = { target: h.unitOf(b.target), weapon: h.word('weapon', b.weapon), ammo: b.ammo == null || b.ammo === '' ? null : h.word('ammo', b.ammo),
    range: h.num('range', b.range, 0, 5000), angle: h.num('angle', b.angle == null || b.angle === '' ? 0 : b.angle, 0, 90) };
  if (withPart) {
    o.volume = h.word('volume', b.volume);
    o.side = String(b.side == null || b.side === '' ? 'front' : b.side).trim().toLowerCase();
    if (!GSIDES.includes(o.side)) bad('The side must be one of: ' + GSIDES.join(', ') + '.');
  }
  return rules(b, h, o);
}
// code 0 for a run that answered; a refusal keeps its reason code (the page shows models.armor.goh.r.<code>)
const answer = j => { if (j && j.error) bad(j.error); return Object.assign(j, { code: j.refused ? j.code : 0, cached: false }); };
const shot = (ctx, b, h) => answer(is3d(b) ? SIM().shot3(simOpts(ctx, b, h), body3(b, h)) : SIM().shot(simOpts(ctx, b, h), simBody(b, h, true)));
const effects = (ctx, b, h) => answer(is3d(b) ? SIM().shot3(simOpts(ctx, b, h), body3(b, h)) : SIM().effects(simOpts(ctx, b, h), simBody(b, h, true)));
const map = (ctx, b, h) => answer(!has(b.angle) && (has(b.view) || has(b.grid)) ? SIM().map3(simOpts(ctx, b, h), mapBody3(b, h)) : SIM().map(simOpts(ctx, b, h), simBody(b, h, false)));
module.exports = { table, edit, guns, shells, shot, effects, map };

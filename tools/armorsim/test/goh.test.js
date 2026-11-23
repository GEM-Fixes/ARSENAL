// armorsim goh.js test: GoH's own armour rules (gohweb damage notes, [T] not run in game) on hand-worked numbers, then shells /
// shot / map / effects on a synthetic GoH folder (a fake call_to_arms.exe + a mod folder; scratch under $ARSENAL_TMP or the OS temp).
//   formulas: look (ends held, linear), tget (the lookup that misses past the last point, the table as read), overmatch calibre /
//   fixed / slope / damping and the game's default when no table hits, flaw, cast steel, hardness (no table: 1), NaN compare
//   data: armordata reads OvermatchCalibre / MinimumDamageModifier only with opts.goh (AS2 reads never get them)
//   routes' work: a plate square on and at 60 degrees, high-hardness + cast + flaw plate, part HP (named perk, tag clash, no perks),
//   a volume missing from the model left off the map, a gun with no overmatch table (default), calibre 0 (flamethrower)
//   gohwave: the area thickness wins over the part's own, difficulty levels (base level, groups) and the mission armour scale on T
//   and part HP, the blast (gohblast.js) at a point and at a stopped HE shell's burst point, the bounce's flight followed
//   gohsim03: the 3D walk through every face (energy left after a plate, exit faces, same-part skip), the bounce chance of a stopped
//   shell, the HEAT jet's reach, the armour-area pierce gate (2D and 3D), the scene ids by volume name for the table colours
// Author: Imperator_Aug (ARSENAL, ia-gohsim01)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const GS = require('../goh'), AD = require('../armordata');

let fails = 0, n = 0;
const near = (a, b, e = 0.01) => Math.abs(a - b) <= e;
function eq(name, got, want, e) {
  n++;
  const ok = typeof want === 'number' ? typeof got === 'number' && near(got, want, e) : JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { fails++; console.log('FAIL goh ' + name + ': got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)); }
}

// ---------- formulas ----------
const T3 = [[0, 1, 0], [30, 1.5, 0.2], [60, 2, 0.5]];
eq('look below first', GS.look(T3, -5, 1), 1);
eq('look past last', GS.look(T3, 80, 2), 0.5);
eq('look linear', GS.look(T3, 45, 1), 1.75);
eq('overmatch calibre', GS.overmatch({ goh: { overmatchCalibre: T3 } }, 50, 75, 60, 2).factor, Math.max(1, 2 * Math.pow(50 / 75, 0.5)), 1e-9);
eq('overmatch calibre floor 1', GS.overmatch({ goh: { overmatchCalibre: [[0, 0.5, 1]] } }, 10, 75, 0, 1).factor, 1);
eq('overmatch fixed', GS.overmatch({ goh: { overmatchFixed: [[0, 1.2], [90, 3]] } }, 50, 75, 45, Math.SQRT2).factor, 2.1, 1e-9);
eq('overmatch slope', GS.overmatch({ goh: { overmatchSlope: [[0, 0.8]] } }, 50, 75, 60, 2).factor, 1.6, 1e-9);
eq('overmatch damping', GS.overmatch({ goh: {}, overmatchDamping: [[0, 1], [90, 1]] }, 50, 75, 60, 2).factor, (2 - 1) * (50 / 75) + 1, 1e-9);
eq('overmatch damping clamp 0.2', GS.overmatch({ goh: {}, overmatchDamping: [[0, 0.01]] }, 50, 75, 60, 2).factor, 1.2, 1e-9);
eq('calibre first of all tables', GS.overmatch({ goh: { overmatchCalibre: [[0, 3, 0]], overmatchFixed: [[0, 9]] } }, 50, 75, 0, 1).kind, 'calibre');
// no table hits: the damping rule with scale 1 (the game reset)
eq('no table: default', (m => [m.refused, m.kind, m.s])(GS.overmatch({ goh: {} }, 50, 75, 60, 2)), [undefined, 'default', 1]);
eq('no table: default factor', GS.overmatch({ goh: {} }, 50, 75, 60, 2).factor, (2 - 1) * (50 / 75) + 1, 1e-9);
// a table as read (not sorted): below its first point raised to it; past every point a miss, so the next table
eq('unsorted: raised to first', (m => [m.kind, m.factor])(GS.overmatch({ goh: { overmatchFixed: [[30, 1.4], [0, 2]] } }, 50, 75, 10, 1)), ['fixed', 1.4]);
eq('unsorted: past all = miss', GS.overmatch({ goh: { overmatchFixed: [[30, 1.4], [0, 2]] } }, 50, 75, 40, 1).kind, 'default');
eq('fixed past last: damping', GS.overmatch({ goh: { overmatchFixed: [[0, 1.2], [30, 2]] }, overmatchDamping: [[0, 0.9]] }, 50, 75, 45, 2).kind, 'damping');
eq('fixed hit 0: damping rule, scale 1', (m => [m.kind, m.from, m.s])(GS.overmatch({ goh: { overmatchFixed: [[0, 0]] }, overmatchDamping: [[0, 0.3]] }, 50, 75, 45, 2)), ['default', 'fixed', 1]);
eq('tget one point', GS.tget([[50, 7]], 0, 1), 7);
eq('tget past last', GS.tget([[0, 1], [30, 2]], 31, 1), null);
eq('tget inside', GS.tget([[0, 1], [30, 2]], 15, 1), 1.5);
eq('engine min NaN', [GS.eMin(1, NaN), GS.eMax(1, NaN), Number.isNaN(GS.eClamp(NaN, 0.2, 1))], [1, 1, true]);
eq('hardness no table = 1', GS.hardness(0, 50, 75), 1);
eq('calibre 0 factors 1', [GS.flaw('small_flaw', 10, 50, 0), GS.cast(0.9, 50, 0), GS.hardness(400, 50, 0)], [1, 1, 1]);
eq('calibre 0 damping = slope', GS.overmatch({ goh: {} }, 50, 0, 60, 2).factor, 2);
eq('flaw small', GS.flaw('small_flaw', 10, 50, 75), 0.871 - 0.004 + 0.111 * 50 / 75, 1e-9);
eq('flaw large', GS.flaw('LARGE_FLAW', 30, 50, 75), 0.741 - 0.069 + 0.235 * 50 / 75, 1e-9);
eq('flaw capped at 1', GS.flaw('small_flaw', 0, 150, 75), 1);
eq('flaw none', GS.flaw(null, 30, 50, 75), 1);
eq('cast steel', GS.cast(0.9, 50, 75), 0.9 + 0.001238 * 50 - 0.0002628 * 75 + 0.02706 * 50 / 75, 1e-9);
eq('cast steel off below 0', GS.cast(-1, 50, 75), 1);
const HARD = (bhn, T, C) => Math.min(1, 9.7707 * Math.pow(C, 0.06111) * Math.pow(T / C, 0.2821) * Math.pow(bhn, -0.4363));
eq('hardness', GS.hardness(412.5, 50, 75), HARD(412.5, 50, 75), 1e-9);
eq('every reason has text', GS.LEFT_OUT.length === 6 &&Object.values(GS.REASONS).every(s => typeof s === 'string' && s.length > 20), true);

// ---------- a synthetic GoH folder ----------
const scratch = process.env.ARSENAL_TMP || os.tmpdir();
fs.mkdirSync(scratch, { recursive: true });
const fx = fs.mkdtempSync(path.join(scratch, 'armorsim-goh-'));
const game = path.join(fx, 'goh'), mod = path.join(fx, 'mod');
const W = (base, rel, text) => { const f = path.join(base, ...rel.split('/')); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text.replace(/\r?\n/g, '\r\n'), 'latin1'); };
W(game, 'binaries/x64/call_to_arms.exe', 'MZ fake');
fs.mkdirSync(path.join(game, 'resource'), { recursive: true });
W(mod, 'resource/set/stuff/gun/kw75', `{weapon_bullet
\t{calibre 75}
\t{filling "bullet75"}
\t{projectileDamageTable {10 120} {1000 80}}
\t{OvermatchCalibre {0 1 0} {60 2 0.5}}
\t{MinimumDamageModifier 5}
}
`);
W(mod, 'resource/set/stuff/gun/kwend', `{weapon_bullet
	{calibre 75}
	{filling "bullet75"}
	{projectileDamageTable {10 120} {500 0}}
}
`);
W(mod, 'resource/set/stuff/gun/kwbare', `{weapon_bullet
\t{calibre 75}
\t{filling "bullet75"}
\t{projectileDamageTable {10 120} {1000 80}}
}
`);
W(mod, 'resource/set/stuff/shell/bullet75.ap.ammo', `{bullet
\t{tag "ammo shell ap"}
}
`);
W(mod, 'resource/set/damage.set', `{damage
\t{energy_per_blastwave 4.0}
\t{brinell_hardness_multiplier {40 450} {80 300}}
}
`);
// difficulty levels: normal (any armour 1.5, ally part health 2), hardx based on normal (enemy armour 2)
W(mod, 'resource/set/difficulty/normal.dl', `{difficulty
\t{any {armor 1.5}}
\t{ally {vehicle_health 2}}
}
`);
W(mod, 'resource/set/difficulty/hardx.dl', `{difficulty "normal"
\t{enemy {armor 2}}
}
`);
W(mod, 'resource/set/stuff/gun/kwhe', `{weapon_bullet
	{calibre 75}
	{filling "he75"}
	{projectileDamageTable {10 120} {1000 80}}
	{OvermatchCalibre {0 1 0} {60 2 0.5}}
}
`);
W(mod, 'resource/set/stuff/shell/he75.he.ammo', `{bullet
\t{tag "ammo shell he"}
\t{damage blastwave {energy 10} {area 0.5 2}}
}
`);
W(mod, 'resource/set/component.set', `{components
\t{category "radio_cat" {health {hp 40} {hp_broken 10}}}
}
`);
W(mod, 'resource/entity/vehicle/tk/tk.def', `{game_entity
\t{Extension "tk.mdl"}
\t{component "engine" {tags "engine motor"}}
\t{component "radio" {tags "radio comms"}}
\t{volume "body1"
\t\t{thickness 30 {front 60}}
\t\t{component "engine"}
\t}
\t{volume "turret1"
\t\t{thickness 50}
\t\t{HighHardness}
\t\t{CastSteel 0.9}
\t\t{Quality "small_flaw"}
\t}
\t{volume "hatch"
\t\t{thickness 20}
\t\t{component "radio"}
\t}
\t{volume "ghost"
\t\t{thickness 10}
\t}
\t{perks
\t\t{component "engine" {health {hp 100} {hp_broken 50}} {armor_damage_modifier 0.5}}
\t\t{component tag "radio" {category "radio_cat"}}
\t\t{component tag "comms" {health {hp 10}}}
\t}
}
`);
W(mod, 'resource/entity/vehicle/tk/tk.mdl', `{Skeleton
\t{bone "basis"}
}
{Volume "body1"
\t{Box 1 2 3}
\t{Bone "basis"}
}
{Volume "turret1"
\t{Box 1 1 1}
\t{Bone "basis"}
}
{Volume "hatch"
\t{Box 1 1 1}
\t{Bone "basis"}
}
`);
W(mod, 'resource/entity/vehicle/tk2/tk2.def', `{game_entity
\t{volume "body1"
\t\t{thickness 40}
\t\t{component "engine"}
\t}
}
`);
// gohsim03 fixtures (written before the first open: the source lists the folder once)
W(mod, 'resource/set/material.set', `{materials
\t{"steel"
\t\t{ricochet {chance {0 1} {90 0.5}}}
\t\t{steelEquivalent 1}
\t}
}
`);
W(mod, 'resource/set/stuff/gun/kwheat', `{weapon_bullet
	{calibre 75}
	{filling "heat75"}
	{projectileDamageTable {10 120} {1000 80}}
	{OvermatchCalibre {0 1 0} {60 2 0.5}}
}
`);
W(mod, 'resource/set/stuff/shell/heat75.heat.ammo', `{bullet
\t{tag "ammo shell heat"}
\t{cumulative 0.5}
}
`);
W(mod, 'resource/entity/vehicle/tk3/tk3.def', `{game_entity
\t{Extension "tk3.mdl"}
\t{props "steel"}
\t{component "engine" {tags "engine"}}
\t{armor {setting "mesh" {volumes "net"} {disable_damage_acc 1}}}
\t{volume "skirt" {thickness 10}}
\t{volume "body" {thickness 30} {component "engine"}}
\t{volume "wall" {thickness 200}}
\t{volume "net" {thickness 5}}
\t{perks
\t\t{blastwave_modifier 4}
\t\t{component "engine" {health {hp 100} {hp_broken 50}} {armor_damage_modifier 0.5}}
\t}
}
`);
W(mod, 'resource/entity/vehicle/tk3/tk3.mdl', `{Skeleton
\t{bone "basis"}
}
{Volume "skirt"
\t{Box 4 60 40}
\t{Bone "basis"}
\t{Position 60 0 20}
}
{Volume "body"
\t{Box 100 60 40}
\t{Bone "basis"}
\t{Position 0 0 20}
}
{Volume "wall"
\t{Box 4 60 40}
\t{Bone "basis"}
\t{Position -60 0 20}
}
{Volume "net"
\t{Box 4 10 10}
\t{Bone "basis"}
\t{Position 80 50 20}
}
`);
const o = { game, folder: mod };

// armordata: the GoH keys only with opts.goh
const S = GS.shell({ weapon: 'kw75', ammo: 'bullet75.ap.ammo' }, o);
eq('shell read', S && [S.weapon, S.ammo, S.calibre, S.gkind], ['kw75', 'bullet75.ap.ammo', 75, 'ap']);
eq('goh keys read', S && S.goh, { overmatchCalibre: [[0, 1, 0], [60, 2, 0.5]], overmatchFixed: [], overmatchSlope: [], minimumDamageModifier: 5 });
const plain = AD.shell({ weapon: 'kw75', ammo: 'bullet75.ap.ammo' }, { game, mods: [], folder: mod, exe: 'goh' });
eq('no goh keys without opts.goh', plain && plain.goh, undefined);
const L = GS.shells('kw75', o);
eq('shells list', L.shells.map(s => [s.ammo, s.kind, s.overmatch, s.minimumDamageModifier]), [['bullet75.ap.ammo', 'ap', 'calibre', 5]]);
eq('shells note', [L.game, L.note], ['goh', 'T']);

// the unit
const V = GS.vehicle(GS.open(o), 'tk');
eq('volumes', V.volumes.map(v => [v.name, v.sides.front, v.sides.top]), [['body1', 60, 30], ['turret1', 50, 50], ['hatch', 20, 20], ['ghost', 10, 10]]);
eq('turret flags', (({ highHardness, castSteel, quality }) => [highHardness, castSteel, quality])(V.volumes[1]), [true, 0.9, 'small_flaw']);
eq('in model', V.volumes.map(v => v.inModel), [true, true, true, false]);
eq('brinell from damage.set', V.sets.brinell, [[40, 450], [80, 300]]);

// a plate square on: P 120 against 60 mm, every factor 1; HP (120-60) x 0.5 + 5 = 35 of 100 (+50 broken)
const B = { target: 'tk', weapon: 'kw75', ammo: 'bullet75.ap.ammo', range: 10, volume: 'body1', side: 'front', angle: 0 };
let r = GS.effects(o, B);
eq('flat verdict', [r.plate.result, r.plate.effective, r.plate.margin, r.penetration], ['penetrate', 60, 60, 120]);
eq('flat note', [r.game, r.note, r.leftOut.length], ['goh', 'T', 6]);
eq('flat rules (no multiplayer level here: 1)', r.rules && [r.rules.difficulty, r.rules.group, r.rules.armor, r.rules.vehicleHealth, r.rules.armorScale, r.rules.levels], [null, 'ally', 1, 1, 1, ['hardx', 'normal']]);
let rd;
// difficulty normal, ally: T x 1.5 (60 -> 90), part hp x 2 (100 -> 200, broken 50 -> 100); loss (120 - 90) x 0.5 + 5 = 20
rd = GS.effects(o, Object.assign({}, B, { difficulty: 'normal' }));
eq('difficulty armour and health', [rd.plate.nominal, rd.plate.effective, rd.effects.hp, rd.effects.hpBroken, rd.effects.loss, rd.rules.armor, rd.rules.vehicleHealth], [90, 90, 200, 100, 20, 1.5, 2]);
// hardx is based on normal: the enemy group gets armour 2, its part health stays 1
rd = GS.effects(o, Object.assign({}, B, { difficulty: 'hardx', group: 'enemy' }));
eq('difficulty base level + group', [rd.plate.nominal, rd.effects.hp, rd.rules.difficulty, rd.rules.group], [120, 100, 'hardx', 'enemy']);
eq('difficulty levels read', (D => [D.levels.hardx.base, D.levels.hardx.groups.player.armor, D.levels.hardx.groups.enemy.armor, D.levels.normal.groups.ally.vehicle_health])(GS.difficulties(GS.open(o))), ['normal', 1.5, 2, 2]);
// a mission's armour scale 0.5: 60 -> 30
// the shell's table ends: 0 mm at a range where the muzzle value is over 0 is said (pastTable), never at a range the table still covers
{ const E = Object.assign({}, B, { weapon: 'kwend' }), far = GS.shot(o, Object.assign({}, E, { range: 800 })), near = GS.shot(o, E);
  eq('past the table said only where the table gives 0', [near.pastTable, near.penetration, far.pastTable, far.penetration], [undefined, 120, true, 0]); }
rd = GS.shot(o, Object.assign({}, B, { armorScale: 0.5 }));
eq('armour scale', [rd.plate.nominal, rd.rules.armorScale], [30, 0.5]);
eq('unknown level: default', GS.shot(o, Object.assign({}, B, { difficulty: 'nope' })).rules.asked, 'nope');
eq('flat hp', [r.effects.part, r.effects.from, r.effects.loss, r.effects.after.hp, r.effects.state, r.effects.shotsToBreak, r.effects.shotsToDestroy], ['engine', 'named', 35, 65, 'working', 3, 5]);
// 60 degrees: damageScale 2, overmatch 2 x (60/75)^0.5
r = GS.shot(o, Object.assign({}, B, { angle: 60 }));
const om60 = 2 * Math.sqrt(60 / 75);
eq('60 deg effective', r.plate.effective, Math.round(om60 * 60 * 100) / 100);
eq('60 deg overmatch', [r.plate.factors.overmatch.kind, r.plate.result], ['calibre', 'penetrate']);
eq('shot has no hp', r.effects, undefined);
// turret: high hardness (BHN 412.5 at 50 mm), cast 0.9, small flaw; no part behind
r = GS.effects(o, Object.assign({}, B, { volume: 'turret1' }));
const tEff = 50 * (0.871 + 0.111 * 50 / 75) * (0.9 + 0.001238 * 50 - 0.0002628 * 75 + 0.02706 * 50 / 75) * HARD(412.5, 50, 75);
eq('turret effective', r.plate.effective, Math.round(tEff * 100) / 100);
eq('turret no part', [r.effects.part, r.effects.loss], [null, 0]);
// hatch: radio carries tags radio + comms, both have a tagged perk -> refused (order not in the notes)
r = GS.effects(o, Object.assign({}, B, { volume: 'hatch' }));
eq('perk order refused', [r.plate.result, r.effects.refused, r.effects.code], ['penetrate', true, 'perkOrder']);
// no perks block at all
r = GS.effects(o, Object.assign({}, B, { target: 'tk2' }));
eq('no perks refused', r.effects.code, 'noPerks');
// a gun with no overmatch table: the game's default (damping rule, scale 1): square on, factor 1
r = GS.shot(o, Object.assign({}, B, { weapon: 'kwbare', ammo: 'bullet75.ap.ammo' }));
eq('no overmatch default', [r.refused, r.plate.factors.overmatch.kind, r.plate.effective, r.note], [undefined, 'default', 60, 'T']);
// high hardness without a damage.set table: factor 1 (BHN 0)
eq('no hardness table: 1', (p => [p.refused, p.factors.hardness, p.factors.bhn])(GS.plate(S, 10, V.volumes[1], 'front', 0, { sets: { brinell: null } })), [undefined, 1, 0]);
// unknown part: a plain error line
eq('unknown part', /not an armoured part/.test(GS.shot(o, Object.assign({}, B, { volume: 'nope' })).error || ''), true);

// the map: ghost is not in the model, so it is not a row
const M = GS.map(o, { target: 'tk', weapon: 'kw75', ammo: 'bullet75.ap.ammo', range: 10, angle: 0 });
eq('map rows', M.rows.map(x => x.volume), ['body1', 'turret1', 'hatch']);
eq('map not in model', M.notInModel, ['ghost']);
eq('map body1 front', (c => [c.side, c.nominal, c.result, c.hp.part, c.hp.loss])(M.rows[0].sides[0]), ['front', 60, 'penetrate', 'engine', 35]);
eq('map hatch hp refused', M.rows[2].sides[0].hp, { refused: true, code: 'perkOrder' });
eq('map share', M.share, 1);

// ---------- thickness: own, area, own + other area, ray cast, none (GetThickness, GHDMG-17) ----------
const AR = (t, flags) => ({ name: 'hull', thickness: t, flags: flags || {} });
eq('thick own', GS.thickness({ front: 40 }, null, 'front'), { T: 40, rule: 'own' });
eq('thick own = area', GS.thickness({ front: 40 }, AR({ front: 40, side: 20, rear: 10, top: 5 }), 'front'), { T: 40, rule: 'area', area: 'hull', own: 40 });
eq('thick area', GS.thickness(null, AR({ front: 40, side: 20, rear: 10, top: 5 }), 'left'), { T: 20, rule: 'area', area: 'hull' });
eq('thick area top', GS.thickness({}, AR({ front: 40, side: 20, rear: 10, top: 5 }), 'bottom').T, 5);
// the area's non-zero value wins over the part's own (GetThickness); a 0 area side keeps the own one
eq('thick area wins over own', (t => [t.refused, t.T, t.rule, t.own])(GS.thickness({ front: 30 }, AR({ front: 40 }), 'front')), [undefined, 40, 'area', 30]);
eq('thick area 0: own', GS.thickness({ front: 30, left: 25 }, AR({ front: 0, side: 0 }), 'left'), { T: 25, rule: 'own' });
eq('thick scale x armour', GS.thickness({ front: 30 }, null, 'front', null, 1.5), { T: 45, rule: 'own' });
eq('thick ray cast', GS.thickness(null, AR(null, { rayCastThickness: true }), 'front', { pathLengthUnits: 2, steelEquivalent: 0.35 }).T, 2 / 20 * 1000 * 0.35, 1e-9);
eq('thick ray cast ignores own', GS.thickness({ front: 99 }, AR(null, { rayCastThickness: true }), 'front', { pathLengthUnits: 2, steelEquivalent: 1 }).T, 100, 1e-9);
eq('thick ray cast, no ray', GS.thickness(null, AR(null, { rayCastThickness: true }), 'front').code, 'rayCast');
eq('thick none', GS.thickness(null, null, 'front'), { T: 0, rule: 'none' });
eq('3d reasons kept', GS.LEFT_OUT_3D, ['drop', 'script']);
eq('reasons left', ['rayCast', 'noModel', 'noShell', 'perkOrder', 'noPerks'].every(k => typeof GS.REASONS[k] === 'string' && GS.REASONS[k].length > 20)
  && ['flame', 'areaOrder', 'noOvermatch', 'unsorted', 'noHardness', 'noCalibre'].every(k => !(k in GS.REASONS)), true);

// calibre 0 (a flamethrower under stuff/flame, or any gun without Calibre): judged as the game's float math does, T_eff = ds x T
const fl = GS.plate({ weaponKey: 'set/stuff/flame/fl1', calibre: 0, source: {}, penetration: [[10, 5]] }, 10, V.volumes[0], 'front', 60, { sets: V.sets, T: 60 });
eq('flame judged', [fl.refused, fl.flame, fl.noCalibre, fl.effective, fl.result, fl.factors.overmatch.kind], [undefined, true, true, 120, 'no_penetration', 'default']);
const nc = GS.plate({ weaponKey: 'set/stuff/gun/x', calibre: 0, source: {}, penetration: [[10, 500]] }, 10, V.volumes[0], 'front', 0, { sets: V.sets, T: 60, P: 500 });
eq('no calibre judged', [nc.refused, nc.flame, nc.noCalibre, nc.effective, nc.result], [undefined, undefined, true, 60, 'penetrate']);

// ---------- 3D: tk.mdl (boxes on bone basis), shot from a direction and a map ----------
const s3 = GS.shot3(o, { target: 'tk', weapon: 'kw75', ammo: 'bullet75.ap.ammo', range: 10, az: 0, el: 0, aimVolume: 'turret1' });
if (s3.refused && s3.code === 'noModel') console.log('  (3D fixture model did not load: ' + (s3.detail || 'no detail') + ')');
eq('3d shot form', [s3.game, s3.note, s3.mode, Array.isArray(s3.plates), s3.leftOut.includes('geometry')], ['goh', 'T', '3d', true, false]);
eq('3d shot judged', !!s3.plate && s3.decisive >= 0 && ['penetrate', 'no_penetration', 'ricochet'].includes(s3.verdict), true);
eq('3d decisive plate is entry', !!s3.plates[s3.decisive] && s3.plates[s3.decisive].enter, true);
if (s3.plate) eq('3d plate rule own', s3.plate.rule, 'own');
const sMiss = GS.shot3(o, { target: 'tk', weapon: 'kw75', ammo: 'bullet75.ap.ammo', range: 10, origin: [100, 100, 100], dir: [1, 0, 0] });
eq('3d miss', [sMiss.verdict, sMiss.plates.length], ['no_hit', 0]);
const m3 = GS.map3(o, { target: 'tk', weapon: 'kw75', ammo: 'bullet75.ap.ammo', range: 10, view: 'front', grid: '16x12' });
eq('3d map form', [m3.mode, m3.cells && m3.cells.length, m3.hitCells > 0], ['3d', 16 * 12, true]);
eq('3d map cells', m3.cells.filter(Boolean).every(c => 'PRNJO?'.includes(c.r) && 'PRNJO?'.includes(c.o)), true);
eq('3d no model refused', GS.shot3(o, { target: 'tk2', weapon: 'kw75', ammo: 'bullet75.ap.ammo', range: 10, az: 0 }).code, 'noModel');

// ---------- gohsim03: the whole walk (plates after the first), bounce, HEAT reach, area gate, scene ids ----------
// world (x along the ray from +x): skirt x 58..62 (10 mm, no part), body x -50..50 (30 mm, part engine), wall x -62..-58 (200 mm);
// net x 78..82, y 45..55 (5 mm, area "mesh" disable_damage_acc). props "steel": ricochet chance {0 1} {90 0.5} (grazing degrees)
const B3 = { target: 'tk3', weapon: 'kw75', ammo: 'bullet75.ap.ammo', range: 10, origin: [200, 0, 20], dir: [-1, 0, 0] };
const w3 = GS.shot3(o, B3);
if (w3.refused) console.log('  (walk fixture refused: ' + w3.code + ' ' + (w3.detail || '') + ')');
const res3 = (w3.plates || []).map(p => [lastOf(p.volume), p.enter, p.result]);
function lastOf(id) { return String(id).split('/').pop(); }
// skirt in (120 vs 10: e = 1 - 10/120), skirt out (110 vs 10, no energy lost on exit), body in (110 vs 30), body out skipped (same part),
// wall in (77.27 vs 200: stopped, square on = grazing 90: bounce chance 0.5)
eq('walk faces', res3, [['skirt', true, 'penetrate'], ['skirt', false, 'penetrate'], ['body', true, 'penetrate'], ['body', false, 'skipped'], ['wall', true, 'ricochet']]);
eq('walk energy left', (w3.plates || []).map(p => p.penLeft), [120, 110, 110, null, 77.3]);
eq('walk after body', w3.plates && w3.plates[2].after, 77.3);
eq('walk body hp at its energy', w3.plates && w3.plates[2].hp, { part: 'engine', loss: 45, state: 'working' });
eq('walk verdict / outcome', [w3.decisive, w3.verdict, w3.outcome, w3.wholeWay, w3.stoppedAt, w3.chance], [0, 'penetrate', 'ricochet', 'penetrate', 4, null]);
eq('walk later list', (w3.later || []).map(p => [p.volume, p.result, p.after]), [['skirt', 'penetrate', 110], ['body', 'penetrate', 77.3], ['body', 'skipped', null], ['wall', 'ricochet', 77.3]]);
eq('walk wall bounce', w3.plates && w3.plates[4].bounce, { known: true, possible: true, chance: 0.5, grazing: 90, material: 'steel', why: null });
// a gun with DisableRicochet would burst there; a fg shell too (no bounce) - bounceOf by itself
eq('bounce gun off', GS.bounceOf({ disableRicochet: true, noRicochet: true }, { ricochet: { chance: [[0, 1]] } }, 'steel', 0).why, 'gun');
eq('bounce fg', GS.bounceOf({ noRicochet: true }, { ricochet: { chance: [[0, 1]] } }, 'steel', 0).possible, false);
eq('bounce no material', GS.bounceOf({}, null, null, 30).known, false);
eq('bounce grazing 60 from normal 30', GS.bounceOf({}, { ricochet: { chance: [[0, 1], [90, 0]] } }, 'steel', 30).chance, 0.333, 0.001);
// HEAT: the jet reaches 0.5 m past the first hit (skirt in at 6.9 m): skirt out at 7.1 m hit, body in at 7.5 m beyond
const h3 = GS.shot3(o, Object.assign({}, B3, { weapon: 'kwheat', ammo: 'heat75.heat.ammo' }));
eq('heat reach', [(h3.plates || []).map(p => p.result), h3.outcome, h3.cumulative], [['penetrate', 'penetrate', 'beyond_jet'], 'beyond_jet', 0.5]);
// the area gate: net passes on thickness (120 >= 5) but its area has disable_damage_acc: not pierced, so the shell stops (and may bounce)
const n3 = GS.shot3(o, Object.assign({}, B3, { origin: [200, 50, 20] }));
eq('gate 3d', n3.plates && [n3.plates[0].result, n3.plates[0].gate, n3.verdict, n3.plate && n3.plate.gate], ['ricochet', 'noDamageAcc', 'ricochet', 'noDamageAcc']);
const n2 = GS.shot(o, { target: 'tk3', weapon: 'kw75', ammo: 'bullet75.ap.ammo', range: 10, volume: 'net', side: 'front', angle: 0 });
eq('gate 2d', [n2.plate && n2.plate.result, n2.plate && n2.plate.gate, n2.ricochet && n2.ricochet.chance], ['no_penetration', 'noDamageAcc', 0.5]);
eq('gateOf calibre', GS.gateOf(100, 50, { threshold: { calibre: 80, pierce: {} }, flags: {} }, { calibre: 75 }), 'calibre');
eq('gateOf default threshold', GS.gateOf(40, 50, { threshold: { pierce: {} }, flags: {} }, { calibre: 75 }), null);
eq('gateOf value', GS.gateOf(60, 50, { threshold: { pierce: { value: 70 } }, flags: {} }, { calibre: 75 }), 'threshold');
// the 2D by-part answer on a plain plate now has a known bounce answer for a stopped shell
const st2 = GS.shot(o, { target: 'tk3', weapon: 'kw75', ammo: 'bullet75.ap.ammo', range: 10, volume: 'wall', side: 'front', angle: 0 });
eq('2d stopped bounce', [st2.verdict, st2.ricochet && st2.ricochet.known, st2.ricochet && st2.ricochet.chance], ['no_penetration', true, 0.5]);
// map: whole-way code and first-plate code
const mm3 = GS.map3(o, { target: 'tk3', weapon: 'kw75', ammo: 'bullet75.ap.ammo', range: 10, view: 'front', grid: '8x6' });
eq('map3 codes', !mm3.refused && mm3.cells.filter(Boolean).every(c => 'PRNJO?'.includes(c.r) && 'PRNJO?'.includes(c.o)), true);
// (e) scene ids by name for the table colours
const mdl3 = GS.modelOfDef('resource/entity/vehicle/tk3/tk3.def', '{game_entity\n\t{Extension "tk3.mdl"}\n}');
eq('model of def', mdl3, 'resource/entity/vehicle/tk3/tk3.mdl');
const ids = GS.sceneIds(o, mdl3);
eq('scene ids', ids && Object.keys(ids).sort(), ['body', 'net', 'skirt', 'wall']);
eq('scene id is a scene path', ids && ids.body.length === 1 && /body$/.test(ids.body[0]), true);
eq('scene ids none', [GS.sceneIds(o, null), GS.modelOfDef('x/y.def', '{game_entity}')], [null, null]);

// ---------- gohwave: the blast (gohblast.js), the burst point, the bounce's flight ----------
// (order by time: the skirt keeps the hit point of the first ray that gave it energy 10, the one towards the net, 6.6 units off,
// as the game keeps a target's hit only on more energy; the body's is 5 units off)
// a blast of 10 (inner 0.5 m = 10 units, outer 2 m) at x 55 between skirt (x 58) and body (x 50): both inside the inner radius, E 10;
// energy_per_blastwave 4 (fixture damage.set): E5 40; skirt T 10 -> threshold 6.67, body T 30 -> 20, both pierced; body is part
// engine: (40 - 20) x blastwave_modifier 4 = 80 of 100; wall and net out of reach
const bl = GS.blast3(o, { target: 'tk3', weapon: 'kw75', ammo: 'bullet75.ap.ammo', range: 10, point: [55, 0, 20], energy: 10, inner: 0.5, outer: 2 });
const bh = bl.blast && bl.blast[0];
eq('blast form', bh && [bh.epb, bh.modifier, bh.reached], [4, 4, 2]);
eq('blast hits', bh && bh.hits.map(h => [h.volume, h.part, h.energy, h.e5, h.thickness, h.threshold, h.pierced]),
  [['body', 'engine', 10, 40, 30, 20, true], ['skirt', null, 10, 40, 10, 6.67, true]]);
eq('blast part hp', bh && bh.hits[0].hp, { part: 'engine', loss: 80, state: 'working', hp: 100, after: { hp: 20, hpBroken: 50 } });
// between body (x -50) and wall (x -58): wall 3 units off, body 5
const bl2 = GS.blast3(o, { target: 'tk3', weapon: 'kw75', ammo: 'bullet75.ap.ammo', range: 10, point: [-55, 0, 20], energy: 10, inner: 0.5, outer: 2 });
eq('blast between body and wall', bl2.blast[0].hits.map(h => [h.volume, h.energy, h.pierced]), [['wall', 10, false], ['body', 10, true]]);
eq('blast point outside reach', GS.blast3(o, { target: 'tk3', weapon: 'kw75', ammo: 'bullet75.ap.ammo', range: 10, point: [300, 0, 20], energy: 10, inner: 0.5, outer: 2 }).blast[0].reached, 0);
// an HE shell along the walk: it stops at the wall (200 mm) square on: a bounce there is head on (cone, not followed); burst 0.3
// units before the face (x -57.7): wall E 10 held (threshold 133.3), body (7.7 units) pierced, engine (40 - 20) x 4 = 80
const he = GS.shot3(o, Object.assign({}, B3, { weapon: 'kwhe', ammo: 'he75.he.ammo' }));
eq('he walk ends at wall', [he.outcome, he.burst && he.burst.at, he.burst && he.burst.point, he.burst && he.burst.ifNoBounce], ['ricochet', 'wall', [-57.7, 0, 20], true]);
eq('he blast', he.blast && he.blast[0].hits.map(h => [h.volume, h.energy, h.pierced, h.hp ? h.hp.loss : null]), [['wall', 10, false, null], ['body', 10, true, 80]]);
eq('he head-on bounce: cone', he.bounces && he.bounces.map(l => [l.from, l.cone, l.chance]), [['wall', true, 0.5]]);
eq('ap no blast', [w3.blast, !!w3.burst], [[], true]);
// a bounce at 45 degrees off the wall's face (from between body and wall): steel 0.75 at 45; identity deflection = a mirror; speed
// ((0.7 - 0.9) cos 45 + 0.9) x 1.2 = 0.9103, no energy table: energy x speed; it flies back into the body's rear face (45 deg)
const bo = GS.shot3(o, Object.assign({}, B3, { origin: [-54, 4, 20], dir: [-1, -1, 0] }));
const lg = bo.bounces && bo.bounces[0];
eq('bounce leg', lg && [bo.outcome, lg.from, lg.chance, lg.grazing, lg.deflection, lg.speed, lg.energy, lg.dir], ['ricochet', 'wall', 0.75, 45, 45, 0.9103, 0.9103, [0.707107, -0.707107, 0]]);
eq('bounce leg plates', lg && lg.plates.map(p => [p.volume, p.enter, p.result]), [['body', true, 'penetrate'], ['body', false, 'skipped']]);
eq('bounce leg end', lg && [lg.outcome, lg.burst], ['passed_all', undefined]);
// bounceRay by itself: a deflection table (45 -> 15 deg), an energy table (0.3 at 45) and a damage clip 20 on P 100: 0.3 -> 0.2
const br = GS.bounceRay({ ricochetEnergyDamping: [[90, 0.1], [0, 0.5]], ricochetDamageClip: 20 }, { ricochet: { angle: [[0, 0], [90, 30]], velocityDumping: 1 } },
  { point: [0, 0, 0], normal: [0, 0, 1] }, [1, 0, -1], 1, 100);
eq('bounceRay tables', [br.grazing, br.deflection, br.damping, Math.round(br.e * 1e4) / 1e4, br.clipped, br.dir.map(n => Math.round(n * 1e4) / 1e4)],
  [45, 15, 0.3, 0.2, true, [Math.round(Math.cos(Math.PI / 12) * 1e4) / 1e4, 0, Math.round(Math.sin(Math.PI / 12) * 1e4) / 1e4]]);
eq('bounceRay head on: cone', GS.bounceRay({}, null, { point: [0, 0, 0], normal: [0, 0, 1] }, [0.2, 0, -1], 1, 100).cone, true);
eq('bounce twice: none', GS.bounceOf({}, { ricochet: { chance: [[0, 1]] } }, 'steel', 30, 2).why, 'twice');

fs.rmSync(fx, { recursive: true, force: true });
console.log(fails ? 'FAIL goh.test (' + fails + ' of ' + n + ')' : 'PASS goh.test (' + n + ')');
process.exit(fails ? 1 : 0);

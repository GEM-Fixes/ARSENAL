// firecheck test: invented defs and an invented weapon db, no game, no files
// Author: Imperator_Aug (ARSENAL, ia-9c567759)
const assert = require('assert');
const fc = require('../firecheck.js');
const db = {
  patterns: new Map([['bullet', '{weapon_bullet {foresight "Foresight3"}}'], ['gun', '{from "pattern bullet" {foresight "Foresight1"}}'], ['mgun', '{from "pattern bullet"}']]),
  weapons: new Map([
    ['cannon', { cls: 'gun', text: '{from "pattern gun" {filling "bullet75"}}' }],
    ['mgx', { cls: 'mgun', text: '{from "pattern mgun"}' }],
    ['mgx_x2', { cls: 'mgun', text: '{from "mgx"}' }],
  ]),
};
const def = (places, extra) => `{game_entity ${extra || ''} {extender "inventory" {box {item "ammo bullet75 ap" 5}}} {Weaponry ${places}}}`;
const B = (...n) => new Set(n);
const run = (places, bones, extra, dist) => fc.analyze({ text: def(places, extra), mdlBones: bones, db, dist });
let n = 0; const ok = (c, m) => { assert(c, m); n++; };

// census: chain through pattern and through a plain {from}
ok(fc.foresightOf(db.weapons.get('cannon'), db) === 'foresight1', 'gun default is foresight1');
ok(fc.foresightOf(db.weapons.get('mgx'), db) === 'foresight3', 'mg default is foresight3');
ok(fc.foresightOf(db.weapons.get('mgx_x2'), db) === 'foresight3', 'plain {from "mgx"} chain');
const c = fc.census(db);
ok(c.gun.by.foresight1 === 1 && c.mgun.by.foresight3 === 2, 'census table counts');

// gun with its default bone present: fires
let r = run('{place "gun" {weapon "cannon" filled}}', B('turret', 'foresight1'));
ok(!r.silent && !r.flags.length, 'gun + foresight1 present is clean');
// gun whose bone is missing and place names none: silent
r = run('{place "gun" {weapon "cannon" filled}}', B('turret', 'foresight14'));
ok(r.silent && r.flags[0].code === 'FC_AIM_BONE', 'gun, no foresight1: AIM_BONE');
// same with the place naming a bone the mdl has: clean
r = run('{place "gun" {foresight "foresight14"} {weapon "cannon" filled}}', B('foresight14'));
ok(!r.silent, 'explicit foresight present is clean');
// explicit bone absent: silent
r = run('{place "gun" {foresight "foresight9"} {weapon "cannon" filled}}', B('foresight1'));
ok(r.silent && r.flags[0].code === 'FC_AIM_BONE', 'explicit foresight absent');
// MG swapped onto a gun place (mdl has foresight1 only): MG_SWAP
r = run('{place "mgun" {weapon "mgx" filled}}', B('foresight1'));
ok(r.silent && r.flags[0].code === 'FC_MG_SWAP', 'MG default Foresight3 absent, foresight1 present');
r = run('{place "mgun" {foresight "foresight1"} {weapon "mgx" filled}}', B('foresight1'));
ok(!r.silent, 'MG with explicit foresight1 is clean');
// one bad MG place next to a good gun place: unit still fires, warning
r = run('{place "gun" {weapon "cannon" filled}} {place "mgun" {weapon "mgx" filled}}', B('foresight1'));
ok(!r.silent && r.warnings.some(w => w.code === 'FC_PLACE_AIM'), 'partial failure is a warning');
// MG-only unit, 3 of 4 places bad: silent
r = run('{place "a" {foresight "foresight4"} {weapon "mgx" filled}} {place "b" {weapon "mgx" filled}} {place "c" {weapon "mgx" filled}} {place "d" {weapon "mgx" filled}}', B('foresight1', 'foresight4'));
ok(r.silent, 'MG-only, most places bad');
// unknown weapon: not checked, not silent
r = run('{place "gun" {weapon "nosuch" filled}}', B('foresight1'));
ok(!r.silent && r.warnings.some(w => w.code === 'FC_WEAPON_UNKNOWN'), 'unknown weapon warns');
// no Weaponry block
r = fc.analyze({ text: '{game_entity}', mdlBones: B(), db });
ok(!r.silent && r.warnings[0].code === 'FC_NO_WEAPONRY', 'no weaponry');
// no mdl read: nothing can be said about bones
r = run('{place "gun" {weapon "cannon" filled}}', null);
ok(!r.silent, 'mdl unknown: not flagged');
// wheeled + no turret bone: Q34 warning
r = run('{place "gun" {weapon "cannon" filled}}', B('foresight1'), '{props "vehicle" "wheeled"}');
ok(r.warnings.some(w => w.code === 'FC_WHEELED_CASEMATE'), 'wheeled casemate warns');
r = run('{place "gun" {weapon "cannon" filled}}', B('foresight1', 'turret'), '{props "vehicle" "wheeled"}');
ok(!r.warnings.some(w => w.code === 'FC_WHEELED_CASEMATE'), 'wheeled with turret does not');
// comments and braces inside strings do not confuse the block reader
r = fc.analyze({ text: '{x\n ; {Weaponry {place "p" {weapon "mgx" filled}}}\n {Weaponry {place "gun" {foresight "foresight1"} {weapon "cannon" filled}}}}', mdlBones: B('foresight1'), db });
ok(!r.silent, 'comment stripped');
// range warning (direct {range} only)
r = fc.analyze({ text: '{x {Weaponry {place "gun" {range 10 120} {weapon "cannon" filled}}}}', mdlBones: B('foresight1'), db, dist: 300 });
ok(r.warnings.some(w => w.code === 'FC_RANGE'), 'range < dist warns');
// bones reader
ok(fc.mdlBonesOf('{Skeleton {bone "Basis" {bone revolute "Turret"}}}').has('turret'), 'typed bone read');

// ---- games (--exe): GoH AimBone, GoH ammo names, the vfs view per game (made-up fixtures) ----
const goh = (places, bones, extra) => fc.analyze({ text: def(places, extra), mdlBones: bones, db, kind: 'goh' });
// GoH: AimBone names a bone the mdl has: clean; names none: warning only (not a flag)
r = goh('{place "gun" {AimBone "gun_aim"} {weapon "cannon" filled}}', B('foresight1', 'gun_aim'));
ok(!r.silent && !r.warnings.some(w => /^FC_AIMBONE/.test(w.code)) && r.info.places[0].aimBone === 'gun_aim', 'goh: AimBone present is read and clean');
r = goh('{place "gun" {AimBone "gun_aim"} {weapon "cannon" filled}}', B('foresight1'));
ok(!r.silent && r.warnings.some(w => w.code === 'FC_AIMBONE_MISSING'), 'goh: AimBone missing warns');
// GoH: no foresight bone is still silent (GHLOG-03: without a shooterBone answers 0), AimBone does not save it
r = goh('{place "gun" {AimBone "gun_aim"} {weapon "cannon" filled}}', B('gun_aim'));
ok(r.silent && r.flags[0].code === 'FC_AIM_BONE', 'goh: no foresight is silent even with AimBone');
// AS2 game: AimBone is a GoH key, warning only
const aimDef = def('{place "gun" {AimBone "gun_aim"} {weapon "cannon" filled}}');
r = fc.analyze({ text: aimDef, mdlBones: B('foresight1', 'gun_aim'), db, kind: 'as2' });
ok(!r.silent && r.warnings.some(w => w.code === 'FC_AIMBONE_AS2'), 'as2 named: AimBone warns as a GoH key');
r = run('{place "gun" {AimBone "gun_aim"} {weapon "cannon" filled}}', B('foresight1', 'gun_aim'));
ok(!r.silent && !r.warnings.some(w => w.code === 'FC_AIMBONE_AS2'), 'no game named: no FC_AIMBONE_AS2 (output as before)');
// GoH ammo item names bullet<nation>_<cal>: a he-only gun warns on GoH
const gohDef = '{game_entity {extender "inventory" {box {item "ammo bulleteng_75 fg" 5}}} {Weaponry {place "gun" {weapon "75mm_x" filled}}}}';
const db2 = { patterns: db.patterns, weapons: new Map([['75mm_x', { cls: 'gun', text: '{from "pattern gun"}' }]]) };
r = fc.analyze({ text: gohDef, mdlBones: B('foresight1'), db: db2, kind: 'goh' });
ok(r.warnings.some(w => w.code === 'FC_NO_AP'), 'goh: bulleteng_75 fg counts as gun ammo');
r = fc.analyze({ text: gohDef, mdlBones: B('foresight1'), db: db2 });
ok(!r.warnings.some(w => w.code === 'FC_NO_AP'), 'as2 rules unchanged: bulleteng_ is not read');
// vfs view: as64 adds as64/core, mowas_2 does not (a made-up install folder in a temp dir)
const fs = require('fs'), os = require('os'), path = require('path');
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-'));
try {
  const put = (rel, s) => { const p = path.join(T, ...rel.split('/')); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };
  put('resource/set/stuff/gun/basegun.weapon', '{from "pattern gun"}');
  put('resource/set/stuff/gun.pattern', '{foresight "Foresight1"}');
  put('as64/core/resource/set/stuff/gun/coregun.weapon', '{from "pattern gun"}');
  const a = fc.loadGameWeapons(T, 'as64'), m = fc.loadGameWeapons(T, 'mowas_2');
  ok(a.weapons.has('basegun') && a.weapons.has('coregun') && a.patterns.has('gun'), 'as64 view holds as64/core weapons');
  ok(m.weapons.has('basegun') && !m.weapons.has('coregun'), 'mowas_2 view has no as64/core');
  ok(fc.foresightOf(m.weapons.get('basegun'), m) === 'foresight1', 'pattern read through the vfs');
  // unknown --exe: usage exit 2
  const err = console.error; console.error = () => {};
  try { ok(fc.main(['--census', '--game', T, '--exe', 'nosuch']) === 2, 'unknown --exe is a usage error'); } finally { console.error = err; }
} finally { fs.rmSync(T, { recursive: true, force: true }); }
console.log('firecheck: all ok (' + n + ' checks)');

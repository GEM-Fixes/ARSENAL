// rzsys tests: made-up donor + vanilla folders (loose files), one seeded case per rule. No real mod data.
// Author: Imperator_Aug (ARSENAL, ia-77c7fe0a)
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto'), os = require('os');
const { run, format } = require('../rzsys.js');
// per-run temp work dir (TEST_WORK when the runner gives one): nothing is written under test/, concurrent runs do not share fixtures
const W = fs.mkdtempSync(path.join(process.env.TEST_WORK || os.tmpdir(), 'rzsys-'));
process.on('exit', () => { try { fs.rmSync(W, { recursive: true, force: true }); } catch (e) { /* temp */ } });
const D = path.join(W, 'donor'), V = path.join(W, 'van');
let fails = 0, n = 0;
const ok = (c, m) => { n++; if (!c) { fails++; console.log('FAIL ' + m); } };
const put = (root, k, s) => { const f = path.join(root, k); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, Buffer.from(s, 'latin1')); };
const hashDir = d => { const h = crypto.createHash('sha1'); (function w(p) { for (const e of fs.readdirSync(p, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : 1)) { const f = path.join(p, e.name); if (e.isDirectory()) w(f); else { h.update(f); h.update(fs.readFileSync(f)); } } })(d); return h.digest('hex'); };

// ---- donor (made up) ----
put(D, 'set/interaction_entity/tank.inc', '{"light tank"\n}\n{"medium tank"\n}\n{"armored_car"\n}\n');
put(D, 'set/interaction_entity/car.inc', '{"car"\n}\n');
put(D, 'set/interaction_entity/cannon.inc', '{"cannon"\n}\n');
put(D, 'set/interaction_entity/human.inc', '{"human"\n}\n');
put(D, 'set/interaction_entity/muzzle.inc', '{"muzzle_ok"\n}\n');
put(D, 'set/interaction_entity/tank/tank_light.inc', ';x\n');
put(D, 'set/interaction_entity/tank/tank_medium.inc', ';x\n');
put(D, 'set/interaction_entity/tank/tank_armoredcar.inc', ';x\n');
put(D, 'set/interaction_entity/tank/safeties/penetration_safety.inc', ';x\n');
put(D, 'set/stuff/gun/.presets', '(define "damage_170"\n)\n');
put(D, 'properties/human.ext', ';x\n');
for (const g of ['30mm_a', '30mm_b', '30mm_c'])
  put(D, 'set/stuff/gun/' + g, '{from "pattern gun"\n{range 200 200}\n{rechargeTime 4}\n("damage_170" a(20) b(20) c(20) d(20) e(20) range(200))\n}\n');
put(D, 'set/stuff/gun/100mm_z', '{from "pattern gun"\n("damage_215" a(5) b(5) c(5) d(5) e(5) range(200))\n}\n');
put(D, 'set/stuff/shell/bullet30.zz.ammo', '{from "pattern ap"\n{tag "big" "shell_medium" "pierce"}\n}\n');
put(D, 'set/stuff/shell/bullet30.q.fg.ammo', '{from "pattern fg"\n{tag "size_small"}\n}\n');
put(D, 'entity/-vehicle/cannon/c1/c1.def', '{entity\n{props "vehicle" "cannon" "big_weapons"}\n{weapon "75mm_x" filled}\n}\n');
put(D, 'entity/-vehicle/tank_medium/covered/covered.def', '{entity\n}\n');

// ---- vanilla (made up) ----
for (const g of ['30mm_a', '30mm_b', '30mm_c'])
  put(V, 'set/stuff/gun/' + g, '{from "pattern gun"\n{range 100 100}\n{rechargeTime 2}\n("damage" a(10) b(10) c(10) d(10) e(10))\n}\n');
put(V, 'set/stuff/gun/30mm_base', '{from "pattern gun"\n{range 80 80}\n{rechargeTime 3}\n("speed" s(500))\n("damage" a(10) b(8) c(6) d(4) e(2))\n{parameters "apcr"\n("damage" a(12) b(10) c(8) d(6) e(4))\n}\n("accuracy_curve_1")\n}\n');
put(V, 'set/stuff/gun/30mm_new', '{from "30mm_base"\n{fireSound "x"}\n}\n');
put(V, 'set/stuff/gun/nocal', '{from "pattern gun"\n("damage" a(1) b(1) c(1) d(1) e(1))\n}\n');
put(V, 'set/stuff/gun/75mm_x', '{from "pattern gun"\n{range 50 50}\n}\n');
put(V, 'set/stuff/shell/bullet30.ap.ammo', '{from "pattern ap"\n{tag "big" "pierce"}\n{entity "s"}\n}\n');
put(V, 'set/stuff/shell/bullet30.fg.ammo', '{from "pattern fg"\n{tag "size_small"}\n}\n');
put(V, 'set/stuff/shell/bullet30.he.ammo', '{from "pattern he"\n{tag "size_small"}\n}\n');
put(V, 'set/stuff/shell/bullet30.t.ammo', '{from "pattern ap"\n{tag "big" "shell_small"}\n}\n');
put(V, 'set/stuff/shell/bullet30.m.ammo', '{from "pattern ap"\n{tag "big" "shell_medium"}\n}\n');
put(V, 'set/stuff/shell/bullet30.k.ammo', '{from "pattern fg"\n{tag "big" "shell_big"}\n}\n');
put(V, 'entity/-vehicle/tank_light/tx1/tx1.def', '{game_entity\n(include "/properties/tank.ext")\n{props "turret_rotator" "muzzle_ok" "muzzle_gone"}\n; kommentar \xe0\xe1\xe2 (cp1251 bytes)\n("armor_light" turret(30) body(20 20 20 20))\n{Weaponry {place "gun" {weapon "30mm_new" filling "ammo bullet30 ap" 1} {weapon "30mm_a" filled}}}\n{item "ammo bullet30 fg" 5}\n}\n');
put(V, 'entity/-vehicle/tank_medium/tx2/tx2.def', '{game_entity\n(include "/properties/tank_unarmed.ext")\n{props "medium" "muzzle_ok"}\n{Weaponry {place "gun" {weapon "nocal"}}}\n}\n');
put(V, 'entity/-vehicle/tank_medium/tx3/tx3.def', '{game_entity\n(include "/properties/tank.ext")\n{props "turret_rotator"}\n}\n');
put(V, 'entity/-vehicle/btr/ac1/ac1.def', '{game_entity\n(include "/properties/armoredcar.ext")\n{props "vehicle"}\n{weapon "30mm_a" filled}\n}\n');
put(V, 'entity/-vehicle/car/cr1/cr1.def', '{game_entity\n(include "/properties/car.ext")\n{props "car"}\n}\n');
put(V, 'entity/-vehicle/cannon/cn1/cn1.def', '{game_entity\n(include "/properties/cannon.ext")\n{props "vehicle" "cannon"}\n{weapon "75mm_x" filled}\n}\n');
put(V, 'entity/humanskin/hm/hm.def', '{game_entity\n(include "/properties/human.ext")\n}\n');
put(V, 'entity/-vehicle/tank_medium/covered/covered.def', '{game_entity\n}\n');
put(V, 'entity/-vehicle/tank_medium/tx4/tx4.def', '{game_entity\n(include "/properties/tank.ext")\n{props "medium"}\n{item "ammo bullet30 he" 1}\n{item "ammo bullet30 ap" 1}\n{item "ammo bullet30 t" 1}\n{item "ammo bullet30 zz" 1}\n{item "ammo bullet30 m" 1}\n{item "ammo bullet30 k" 1}\n}\n');

// R9 fixtures: a donor selector with no tank class, one with, a unit with no gun row
put(D, 'set/stuff/gun/30mm_n', '{from "pattern gun"\n{filling "bullet30 q" 5}\n("damage_170" a(1) b(1) c(1) d(1) e(1) range(200))\n}\n');
put(D, 'set/target/tb.inc', '{selector\n{type "tb"}\n{group {select {class human}} {select {class cannon}}}\n}\n');
put(D, 'set/target/tc.inc', '{selector\n{type "tc"}\n{group {select {class light_tank}}}\n}\n');
put(D, 'set/target/tank.inc', '{selector\n{type "tank"}\n}\n');
put(V, 'entity/-vehicle/tank_medium/tx9/tx9.def', '{game_entity\n(include "/properties/tank.ext")\n{props "medium"}\n{targetSelector "tb"}\n{item "bullet30 q fg" 9}\n{weapon "30mm_n" filled}\n}\n');
put(V, 'entity/-vehicle/tank_medium/tx10/tx10.def', '{game_entity\n(include "/properties/tank.ext")\n{props "medium"}\n{targetSelector "tc"}\n{item "bullet30 q fg" 9}\n{weapon "30mm_n" filled}\n}\n');
put(V, 'entity/-vehicle/tank_medium/tx11/tx11.def', '{game_entity\n(include "/properties/tank.ext")\n{props "medium"}\n{targetSelector "tb"}\n{weapon "mg" filled}\n}\n');

const dh = hashDir(D), vh = hashDir(V);
const go = (unit, extra) => run(Object.assign({ unit, robz: D, vanilla: V, out: path.join(W, 'out_' + unit) }, extra || {}));
const rd = (u, k) => fs.readFileSync(path.join(W, 'out_' + u, k)).toString('latin1');

// R1 class: no class prop -> added from folder; block checked
let R = go('tx1');
ok(/R1 \[I\] no class prop; added "light"/.test(R.lines.join('\n')), 'R1 adds class from folder');
ok(/\{props "light" "turret_rotator"/.test(rd('tx1', 'entity/-vehicle/tank_light/tx1/tx1.def')), 'R1 def props rewritten');
// R1 present class + block exists
R = go('tx2');
ok(R.lines.some(l => /R1 \[V\] class prop "medium" present/.test(l)), 'R1 class present');
ok(R.lines.some(l => /block "medium tank"/.test(l)), 'R1 block found');
// R1 missing class and no class folder -> gap
const t3 = go('tx3');
ok(t3.gaps.some(g => /^R1: tank_medium|^R1: no light/.test(g) || /R1: no light\/medium\/heavy/.test(g)) || t3.lines.some(l => /added "medium"/.test(l)), 'R1 class from folder for tx3');
// R1b muzzle present / missing
R = go('tx1');
ok(R.lines.some(l => /R1b \[V\] muzzle prop muzzle_ok/.test(l)), 'R1b muzzle found');
ok(R.gaps.some(g => /muzzle prop muzzle_gone/.test(g)), 'R1b muzzle missing is a gap');
// R2 donor row exists, derived row for the other
ok(R.lines.some(l => /R2 \[V\] gun 30mm_a: donor table row exists/.test(l)), 'R2 donor row not rewritten');
ok(!fs.existsSync(path.join(W, 'out_tx1', 'set/stuff/gun/30mm_a')), 'R2 donor-row gun not emitted');
const gun = rd('tx1', 'set/stuff/gun/30mm_base');
ok(/\{range 160 160\}/.test(gun), 'R2 range x2');
ok(/\{rechargeTime 6\}/.test(gun), 'R2 recharge x2');
ok(/\("damage_170" a\(20\) b\(16\) c\(12\) d\(8\) e\(4\) range\(160\)\)/.test(gun), 'R2 damage macro by calibre + x2 bands + range');
ok(/\("damage_170" a\(24\) b\(20\) c\(16\) d\(12\) e\(8\) range\(160\)\)/.test(gun), 'R2 parameters block converted');
// R2 calibre-less name -> macro not chosen
R = go('tx2');
ok(R.gaps.some(g => /gun nocal: no calibre/.test(g)), 'R2 no calibre is a gap');
// R2 accuracy macro the donor lacks
R = go('tx1');
ok(R.gaps.some(g => /accuracy_curve_1/.test(g)), 'R2 undefined accuracy macro listed');
// R3 speed note
ok(R.lines.some(l => /speed macro kept/.test(l)), 'R3 speed note');
// R4 ammo tier: ap@30 has donor row shell_medium
ok(/"shell_medium"/.test(rd('tx1', 'set/stuff/shell/bullet30.ap.ammo')), 'R4 tier tag added');
ok(R.lines.some(l => /R4 \[I\] shell "bullet30 ap": tier \(none\) -> shell_medium/.test(l)), 'R4 line');
// R4 pattern with no tier in donor rows -> gap, no file
ok(R.gaps.some(g => /shell "bullet30 fg".*no donor row/.test(g)), 'R4 fg gap');
ok(!fs.existsSync(path.join(W, 'out_tx1', 'set/stuff/shell/bullet30.fg.ammo')), 'R4 no file for gap');
// R4: pattern with no donor rows at all, existing tier kept, donor row exists
const t4 = go('tx4');
ok(t4.gaps.some(g => /shell "bullet30 he".*no donor row/.test(g)), 'R4 no pattern rows -> gap');
ok(t4.lines.some(l => /shell "bullet30 t": tier shell_small -> shell_medium/.test(l)), 'R4 differing tier replaced');
ok(/\{tag "big" "shell_medium"\}/.test(rd('tx4', 'set/stuff/shell/bullet30.t.ammo')), 'R4 other tags kept, tier swapped');
ok(t4.lines.some(l => /shell "bullet30 m": tier shell_medium already matches/.test(l)), 'R4 matching tier left');
ok(t4.lines.some(l => /shell "bullet30 k": carries shell_big; donor rows for this pattern give no tier, left/.test(l)), 'R4 donor gives no tier, vanilla tier kept');
ok(t4.lines.some(l => /shell "bullet30 zz": donor ammo row exists/.test(l)), 'R4 donor row exists');
// R1 cannon: weapons prop by calibre (75mm donor cannon has big_weapons)
R = go('cn1');
ok(/"big_weapons"/.test(rd('cn1', 'entity/-vehicle/cannon/cn1/cn1.def')), 'R1 cannon big_weapons from donor calibre table');
// armoured car, car
R = go('ac1');
ok(R.lines.some(l => /block "armored_car"/.test(l)), 'R1 armored_car block');
R = go('cr1');
ok(R.lines.some(l => /block "car"/.test(l)), 'R1 car block');
// R9 a gun on a donor selector with no tank class moves to "tank"; a selector that names one, and a unit with no gun row, stay
R = go('tx9');
ok(/\{targetSelector "tank"\}/.test(rd('tx9', 'entity/-vehicle/tank_medium/tx9/tx9.def')), 'R9 selector -> tank');
ok(R.lines.some(l => /^R9 \[V\] targetSelector "tb"/.test(l)), 'R9 line');
R = go('tx10');
ok(/\{targetSelector "tc"\}/.test(rd('tx10', 'entity/-vehicle/tank_medium/tx10/tx10.def')) && !R.lines.some(l => /^R9/.test(l)), 'R9 selector with a tank class left');
R = go('tx11');
ok(/\{targetSelector "tb"\}/.test(rd('tx11', 'entity/-vehicle/tank_medium/tx11/tx11.def')) && !R.lines.some(l => /^R9/.test(l)), 'R9 no gun row left');
// R5 deps list + copy
R = go('tx2', { deps: true });
ok(R.deps.includes('set/interaction_entity/tank/tank_medium.inc'), 'R5 dependency listed');
ok(fs.existsSync(path.join(W, 'out_tx2', 'set/interaction_entity/tank/tank_medium.inc')), 'R5 --deps copies');
ok(R.lines.some(l => /^R5 \[V\]/.test(l)), 'R5 line');
// R6 infantry
R = go('hm');
ok(R.lines.some(l => /^R6 \[I\] infantry/.test(l)), 'R6 infantry');
// R7 report text holds GAPS
R = go('tx1');
ok(/GAPS/.test(format(R)) && /WROTE/.test(format(R)), 'R7 report has GAPS and WROTE');
ok(R.lines.some(l => /^R7/.test(l)), 'R7 line');
// output encoding: cp1251 bytes kept, CRLF
const raw = fs.readFileSync(path.join(W, 'out_tx1', 'entity/-vehicle/tank_light/tx1/tx1.def'));
ok(raw.includes(Buffer.from([0xe0, 0xe1, 0xe2])), 'bytes cp1251 kept');
ok(!/[^\r]\n/.test(raw.toString('latin1')), 'CRLF only');
// covered unit
R = go('covered');
ok(R.covered, 'covered unit is skipped');
// ported unit from a loose file
const pf = path.join(W, 'ported.def'); fs.writeFileSync(pf, '{game_entity\n(include "/properties/car.ext")\n{props "car"}\n}\n');
R = run({ unit: pf, robz: D, vanilla: V, out: path.join(W, 'out_ported') });
ok(R.lines.some(l => /block "car"/.test(l)) && R.written.some(w => /ported/.test(w)), 'ported unit works');
// --out inside donor refused
let threw = false; try { run({ unit: 'tx1', robz: D, vanilla: V, out: path.join(D, 'sub') }); } catch (e) { threw = /refusing/.test(e.message); }
ok(threw, 'refuses --out inside donor');
threw = false; try { run({ unit: 'tx1', robz: D, vanilla: V, out: V }); } catch (e) { threw = /refusing/.test(e.message); }
ok(threw, 'refuses --out = vanilla');
// donors untouched
ok(hashDir(D) === dh && hashDir(V) === vh, 'donor and vanilla folders unchanged');
// unknown unit
threw = false; try { go('nope'); } catch (e) { threw = /not found/.test(e.message); }
ok(threw, 'unknown unit is an error');

console.log(fails ? `rzsys test: ${fails} FAILED of ${n}` : `rzsys test: ${n} checks passed`);
process.exit(fails ? 1 : 0);

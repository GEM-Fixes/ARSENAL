// FXE-2 tests, invented fixtures only: a build that exits 0 never leaves what stops the game at load.
//  1 a def {bone "x" {speed ..}} block whose bone the output mdl lacks is removed, one info line names it (no WARN_XLATE_FIT_LEFT bone-block on exit 0)
//  2 the same block with {limits} on a main-gun bone: aliased when the mdl has a typed lookalike, else the build is refused by name (ERR_DONOR_BONE)
//  3 a main weapon place whose {LinkBone} the mdl lacks: the bone is aliased (never left)
//  4 a {weapon} no Stuff file carries (SetItem crash): refused by name (ERR_DONOR_WEAPON)
//  5 a weapon swap that changes the weapon class: refused by name (ERR_DONOR_WEAPON_CLASS)
// run via run.sh.
// Author: Imperator_Aug (ARSENAL, ia-67dafa8c)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const root = path.join(__dirname, 'fixture', 'fxe2');
fs.rmSync(root, { recursive: true, force: true });
let fail = 0;
const put = (rel, data) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, data.replace(/\r?\n/g, '\r\n'), 'latin1'); };
const t = (name, good, extra) => { console.log((good ? 'ok   ' : 'FAIL ') + 'fxe2: ' + name + (good || !extra ? '' : '  ' + String(extra).slice(0, 700))); if (!good) fail++; };
const rd = p => { try { return fs.readFileSync(path.join(root, p), 'latin1'); } catch { return null; } };

const bone = (n, x, y) => `    {bone "${n}"\n      {Matrix34\n        1 0 0\n        0 1 0\n        0 0 1\n        ${x} ${y} 0\n      }\n    }\n`;
const mdlOf = extra => '{Skeleton\n  {bone "basis"\n' + bone('emit1', 3, 37) + bone('emit2', 3, -37) + bone('gun', 0, 5) + (extra || '') + '  }\n}\n';
const typed = n => `    {bone revolute "${n}"\n      {Matrix34\n        1 0 0\n        0 1 0\n        0 0 1\n        0 0 0\n      }\n    }\n`;
// rep reps: r1 plain mdl; r2 plain mdl; r3 mdl with a typed lookalike gun_rot2; r4 mdl with no "gun_mount"
for (const r of ['r1', 'r2', 'r3', 'r4', 'r5']) put(`goh/resource/entity/${r}/${r}.def`, `{game_entity\n  {Extension "${r}.mdl"}\n}\n`);
put('goh/resource/entity/r1/r1.mdl', mdlOf()); put('goh/resource/entity/r2/r2.mdl', mdlOf());
put('goh/resource/entity/r3/r3.mdl', mdlOf(typed('gun_rot2'))); put('goh/resource/entity/r4/r4.mdl', mdlOf()); put('goh/resource/entity/r5/r5.mdl', mdlOf());
// r5: the rep's own weapon is a mgun-class 20mm; its GoH stuff sits in set/stuff/mgun
put('goh/resource/entity/r5/r5.def', '{game_entity\n  {Extension "r5.mdl"}\n  {Weaponry\n    {place "gun"\n      {weapon "20mm_rw"}\n    }\n  }\n}\n');
put('goh/resource/set/stuff/mgun/20mm_rw.weapon', '{weapon_bullet}\n');

const seat = '  {placer\n    {place "driver" {group "crew"}}\n  }\n  {boarder\n    {door "emit1"}\n    {door "emit2"}\n    {link "emit1" "driver" {anm "driver"}}\n    {link "emit2" "driver" {anm "driver"}}\n  }\n';
const dnr = (name, body) => { put(`as2/resource/entity/${name}/${name}.def`, `{game_entity\n  {Extension "${name}.mdl"}\n  {PatherID "tank"}\n${seat}${body}}\n`); put(`as2/resource/entity/${name}/${name}.mdl`, '{model "x"}\n'); };
dnr('d1', '  {bone "turret"\n    {speed 0.015}\n  }\n  {bone "gun_rot"\n    {speed 0.007}\n  }\n');
dnr('d2', '  {bone "gun_rot"\n    {limits -5 20}\n  }\n');
dnr('d3', '  {bone "gun_rot"\n    {limits -5 20}\n  }\n');
dnr('d4', '  {Weaponry\n    {place "gun"\n      {LinkBone "gun_mount"}\n      {weapon "w01" filled}\n    }\n  }\n');
dnr('d5', '  {Weaponry\n    {place "gun"\n      {weapon "nosuchgun" filled}\n    }\n  }\n');
dnr('d6', '  {Weaponry\n    {place "gun"\n      {weapon "76mm_dw" filled}\n    }\n  }\n');
// 20 stuff files so the BG-2 weapon-name check runs (it skips a fixture with fewer)
for (let i = 1; i <= 24; i++) put(`as2/resource/set/stuff/gun/w${String(i).padStart(2, '0')}.weapon`, '{weapon_bullet}\n');
put('as2/resource/set/stuff/gun/76mm_dw.weapon', '{weapon_bullet}\n');
put('as2/resource/set/stuff/mgun/20mm_vmg.weapon', '{weapon_bullet}\n');

const tool = path.join(__dirname, '..', 'goh2as2.js');
const run = (rep, donor, o, more) => cp.spawnSync(process.execPath, [tool, '--goh', path.join(root, 'goh'), '--game', path.join(root, 'as2'), '--exe', 'mowas_2', '--no-keylint', '--no-rc', '--entity', rep, '--donor', donor, '--rep-key', '--out', path.join(root, o), ...(more || [])], { encoding: 'utf8' });
const all = r => r.stdout + r.stderr;

const r1 = run('r1', 'd1', 'o1'), d1 = rd('o1/resource/entity/r1/r1.def') || '';
t('1 build exits 0', r1.status === 0, all(r1));
t('1 the gun_rot block is removed from the def', !/\{bone "gun_rot"/i.test(d1), d1);
t('1 the turret block (its bone is in no mdl either) is removed too', !/\{bone "turret"/i.test(d1), d1);
t('1 one info line names gun_rot', /XLATE_FIT_APPLIED[^\n]*bone-block[^\n]*gun_rot/i.test(all(r1)), all(r1));
t('1 no WARN_XLATE_FIT_LEFT bone-block on the exit-0 build', !/WARN_XLATE_FIT_LEFT[^\n]*bone-block/.test(all(r1)), all(r1));

const r2 = run('r2', 'd2', 'o2');
t('2 {limits} on a missing main-gun bone, no typed lookalike: refused', r2.status === 1, all(r2));
t('2 the refusal is ERR_DONOR_BONE and names gun_rot', /ERR_DONOR_BONE[^\n]*gun_rot/.test(all(r2)), all(r2));
const r2a = run('r2', 'd2', 'o2a', ['--allow-missing']);
t('2 --allow-missing: exit 0 but the block is still not left in the def', r2a.status === 0 && !/\{bone "gun_rot"/i.test(rd('o2a/resource/entity/r2/r2.def') || ''), all(r2a));

const r3 = run('r3', 'd3', 'o3'), m3 = rd('o3/resource/entity/r3/r3.mdl') || '', d3 = rd('o3/resource/entity/r3/r3.def') || '';
t('2 a typed lookalike (gun_rot2) in the mdl: gun_rot is aliased as a typed bone', r3.status === 0 && /\{bone revolute "gun_rot"/.test(m3), all(r3) + m3);
t('2 the {limits} block is kept, the alias is named by a SEAT_MAP line', /\{bone "gun_rot"/.test(d3) && /SEAT_MAP[^\n]*gun_rot/.test(all(r3)), all(r3));

const r4 = run('r4', 'd4', 'o4'), m4 = rd('o4/resource/entity/r4/r4.mdl') || '';
t('3 main weapon place LinkBone gun_mount: aliased in the mdl, exit 0', r4.status === 0 && /\{bone "gun_mount"/.test(m4), all(r4) + m4);

const r5 = run('r1', 'd5', 'o5');
t('4 a weapon no Stuff carries is refused', r5.status === 1, all(r5));
t('4 ERR_DONOR_WEAPON names nosuchgun and the SetItem crash', /ERR_DONOR_WEAPON[^\n]*nosuchgun[^\n]*SetItem/.test(all(r5)), all(r5));

const r6 = run('r5', 'd6', 'o6', ['--match-weapon', '--no-wpn-table']);
t('5 a swap into another weapon class (gun -> mgun) is refused', r6.status === 1, all(r6));
t('5 ERR_DONOR_WEAPON_CLASS names 76mm_dw and both classes', /ERR_DONOR_WEAPON_CLASS[^\n]*76mm_dw[^\n]*gun[^\n]*mgun/.test(all(r6)), all(r6));

// 6/7 a weapon name an ammo file also carries (30mm_vg.weapon + 30mm_vg.fg.ammo, like mortar150): a bare {weapon "30mm_vg"} is found as the AMMO (log 150mm_type_97)
put('as2/resource/set/stuff/gun/30mm_vg.weapon', '{weapon_bullet}\n'); put('as2/resource/set/stuff/ammo/30mm_vg.fg.ammo', '{ammo}\n');
dnr('d7', '  {Weaponry\n    {place "gun"\n      {weapon "30mm_vg" filled}\n    }\n  }\n');
const r7 = run('r1', 'd7', 'o7');
t('6 a bare weapon name that an ammo file also carries is refused (ERR_DONOR_WEAPON names it)', r7.status === 1 && /ERR_DONOR_WEAPON[^\n]*30mm_vg/.test(all(r7)), all(r7));
put('goh/resource/entity/r6/r6.def', '{game_entity\n  {Extension "r6.mdl"}\n  {Weaponry\n    {place "gun"\n      {weapon "30mm_rw"}\n    }\n  }\n}\n'); put('goh/resource/entity/r6/r6.mdl', mdlOf());
put('goh/resource/set/stuff/gun/30mm_rw.weapon', '{weapon_bullet}\n');
const r8 = run('r6', 'd6', 'o8', ['--match-weapon', '--no-wpn-table']), d8 = rd('o8/resource/entity/r6/r6.def') || '';
t('7 a swap onto such a name is written "weapon 30mm_vg" and builds', r8.status === 0 && /\{weapon "weapon 30mm_vg"/.test(d8), all(r8) + d8);
if (fail) process.exit(1);

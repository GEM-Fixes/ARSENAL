// BUILD-6 tests, invented fixtures only: the causes behind the units VOL-2 could not build.
//  1 {speed2} on a bone the mdl has plain: dropped like {speed} (ERR_DEF_READER otherwise); on a typed bone it stays
//  2 {limits} on a main-gun bone the mdl lacks: with a typed bone above the muzzle the block goes and the mdl's own limits stand;
//    with a typed bone elsewhere, or only a typed root, the build is refused and the refusal says why
//  3 a swap from "weapon x" onto an extensionless vanilla entry is written bare (a "weapon " prefix needs a .weapon file)
//  4 a swap out of class reactive is refused by name; a calibre-less MG carrier swapped for a cannon (rule 1a) still builds
// run via run.sh.
// Author: Imperator_Aug (ARSENAL, ia-1874eea5)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const root = path.join(__dirname, 'fixture', 'build6');
fs.rmSync(root, { recursive: true, force: true });
let fail = 0;
const put = (rel, data) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, data.replace(/\r?\n/g, '\r\n'), 'latin1'); };
const t = (name, good, extra) => { console.log((good ? 'ok   ' : 'FAIL ') + 'build6: ' + name + (good || !extra ? '' : '  ' + String(extra).slice(0, 700))); if (!good) fail++; };
const rd = p => { try { return fs.readFileSync(path.join(root, p), 'latin1'); } catch { return null; } };

const M = '{Matrix34\n 1 0 0\n 0 1 0\n 0 0 1\n 0 0 0\n}\n';
const bone = (n, kids, type) => `{bone ${type ? type + ' ' : ''}"${n}"\n${M}${kids || ''}}\n`;
const muzzle = bone('gun', bone('foresight1'));
const mdlOf = (body, rootType) => '{Skeleton\n' + bone('basis', bone('emit1') + bone('emit2') + body, rootType) + '}\n';
const rep = (name, body, rootType, weapon) => {
  put(`goh/resource/entity/${name}/${name}.def`, `{game_entity\n  {Extension "${name}.mdl"}\n${weapon ? `  {Weaponry\n    {place "gun"\n      {weapon "${weapon}"}\n    }\n  }\n` : ''}}\n`);
  put(`goh/resource/entity/${name}/${name}.mdl`, mdlOf(body, rootType));
};
const seat = '  {placer\n    {place "driver" {group "crew"}}\n  }\n  {boarder\n    {door "emit1"}\n    {door "emit2"}\n    {link "emit1" "driver" {anm "driver"}}\n    {link "emit2" "driver" {anm "driver"}}\n  }\n';
const dnr = (name, body) => { put(`as2/resource/entity/${name}/${name}.def`, `{game_entity\n  {Extension "${name}.mdl"}\n  {PatherID "tank"}\n${seat}${body}}\n`); put(`as2/resource/entity/${name}/${name}.mdl`, '{model "x"}\n'); };
const wpn = w => `  {Weaponry\n    {place "gun"\n      {weapon "${w}" filled}\n    }\n  }\n`;

// 20 stuff files so the BG-2 weapon-name check runs (it skips a fixture with fewer)
for (let i = 1; i <= 24; i++) put(`as2/resource/set/stuff/gun/w${String(i).padStart(2, '0')}.weapon`, '{weapon_bullet}\n');
put('as2/resource/set/stuff/gun/76mm_dw.weapon', '{weapon_bullet}\n');
put('as2/resource/set/stuff/gun/203mm_vg', '{weapon_bullet}\n');   // extensionless, like vanilla gun/203mm_gun
put('as2/resource/set/stuff/gun/30mm_vg.weapon', '{weapon_bullet}\n');
put('as2/resource/set/stuff/reactive/rk_big.weapon', '{weapon_bullet}\n');
put('as2/resource/set/stuff/mgun/mgx.weapon', '{weapon_bullet}\n');
put('goh/resource/set/stuff/gun/203mm_rw.weapon', '{weapon_bullet}\n');
put('goh/resource/set/stuff/gun/30mm_rw.weapon', '{weapon_bullet}\n');

const tool = path.join(__dirname, '..', 'goh2as2.js');
const run = (r, donor, o, more) => cp.spawnSync(process.execPath, [tool, '--goh', path.join(root, 'goh'), '--game', path.join(root, 'as2'), '--exe', 'mowas_2', '--no-keylint', '--no-rc', '--entity', r, '--donor', donor, '--rep-key', '--out', path.join(root, o), ...(more || [])], { encoding: 'utf8' });
const all = r => r.stdout + r.stderr;
const defOf = (o, r) => rd(`${o}/resource/entity/${r}/${r}.def`) || '';

// 1 speed2
rep('p1', muzzle); dnr('d1', '  {bone "gun"\n    {speed2 3}\n  }\n');
const a1 = run('p1', 'd1', 'o1'), d1 = defOf('o1', 'p1');
t('1 {speed2} on a plain mdl bone: builds', a1.status === 0, all(a1));
t('1 {speed2} is out of the def', !/\{\s*speed2\b/i.test(d1), d1);
t('1 no ERR_DEF_READER', !/ERR_DEF_READER/.test(all(a1)), all(a1));
rep('p2', bone('gun_t', muzzle, 'revolute')); dnr('d2', '  {bone "gun_t"\n    {speed2 3}\n  }\n');
const a2 = run('p2', 'd2', 'o2');
t('1 {speed2} on a typed mdl bone stays', a2.status === 0 && /\{\s*speed2 3\s*\}/i.test(defOf('o2', 'p2')), all(a2) + defOf('o2', 'p2'));

// 2 a typed bone above the muzzle (a name no lookalike rule can reach)
dnr('d3', '  {bone "gun_rot"\n    {limits -30 40}\n  }\n');
rep('p3', bone('swing', bone('lift', muzzle, 'revolute'), 'revolute'));
const a3 = run('p3', 'd3', 'o3'), m3 = rd('o3/resource/entity/p3/p3.mdl') || '';
t('2 typed chain above the muzzle: builds', a3.status === 0, all(a3));
t('2 the block is removed', !/\{bone "gun_rot"/i.test(defOf('o3', 'p3')), defOf('o3', 'p3'));
t('2 no bone is added to the mdl', !/"gun_rot"/.test(m3), m3);
t('2 the info line names the chain, innermost first', /XLATE_FIT_APPLIED[^\n]*gun_rot[^\n]*lift, swing/.test(all(a3)), all(a3));
rep('p4', muzzle + bone('hatch', '', 'revolute'));
const a4 = run('p4', 'd3', 'o4');
t('2 a typed bone off the chain does not count: refused', a4.status === 1 && /ERR_DONOR_BONE[^\n]*gun_rot[^\n]*no typed bone above the muzzle/.test(all(a4)), all(a4));
rep('p5', muzzle, 'revolute');
const a5 = run('p5', 'd3', 'o5');
t('2 only the root typed: refused, it cannot elevate', a5.status === 1 && /ERR_DONOR_BONE[^\n]*gun_rot/.test(all(a5)), all(a5));

// 3 the "weapon " prefix on an extensionless target
rep('p6', muzzle, null, '203mm_rw'); dnr('d6', wpn('weapon 76mm_dw'));
const a6 = run('p6', 'd6', 'o6', ['--match-weapon', '--no-wpn-table']), d6 = defOf('o6', 'p6');
t('3 extensionless target: written bare, builds', a6.status === 0 && /\{weapon "203mm_vg"/.test(d6), all(a6) + d6);
t('3 no ERR_DONOR_WEAPON', !/ERR_DONOR_WEAPON/.test(all(a6)), all(a6));

// 4 reactive holds its class; the MG carrier rule stays
dnr('d7', wpn('weapon rk_big'));
const a7 = run('p6', 'd7', 'o7', ['--match-weapon', '--no-wpn-table']);
t('4 a rocket launcher donor swapped for a gun: refused by class', a7.status === 1 && /ERR_DONOR_WEAPON_CLASS[^\n]*rk_big[^\n]*reactive[^\n]*gun/.test(all(a7)), all(a7));
rep('p8', muzzle, null, '30mm_rw'); dnr('d8', wpn('mgx'));
const a8 = run('p8', 'd8', 'o8', ['--match-weapon', '--no-wpn-table']);
t('4 a calibre-less MG carrier swapped for a cannon (rule 1a) still builds', a8.status === 0 && /\{weapon "30mm_vg"/.test(defOf('o8', 'p8')), all(a8) + defOf('o8', 'p8'));
if (fail) process.exit(1);

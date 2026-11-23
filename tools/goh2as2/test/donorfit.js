// T-DONORFIT tests, invented fixtures only (G-DONORSPAWN: donor def places mgun/mgun1/mgun2 on a rep mdl with other bone names).
//  1 SEED: a weapon place with no {LinkBone} whose name the rep mdl lacks -> mapped by role ({type}) to an mdl bone, {LinkBone} written, baked gap entry
//  2 SEED: a place no rule maps (unknown {type}, no name-suffix rule) -> hand gap + ERR_DONOR_BONE_MISSING, exit 1; with --allow-missing: WARN, exit 0
//  3 a shield volume the mdl lacks is dropped from the def (dropped gap), a body volume is not touched
//  4 a place whose name the mdl has, and a place with a {LinkBone}, are left alone
// run via run.sh.
// Author: Imperator_Aug (ARSENAL, ia-f6337092)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const root = path.join(__dirname, 'fixture', 'dfit');
fs.rmSync(root, { recursive: true, force: true });
let fail = 0;
const put = (rel, data) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, data.replace(/\r?\n/g, '\r\n'), 'latin1'); };
const t = (name, good, extra) => { console.log((good ? 'ok   ' : 'FAIL ') + 'donorfit: ' + name + (good || !extra ? '' : '  ' + String(extra).slice(0, 900))); if (!good) fail++; };
const rd = p => { try { return fs.readFileSync(path.join(root, p), 'latin1'); } catch { return null; } };

const M = '{Matrix34\n 1 0 0\n 0 1 0\n 0 0 1\n 0 0 0\n}\n';
const bone = (n, kids) => `{bone "${n}"\n${M}${kids || ''}}\n`;
const mdlOf = body => '{Skeleton\n' + bone('basis', bone('emit1') + bone('emit2') + body) + '}\n' + '{volume "body1"\n{thickness 10}\n}\n';
// rep: a mdl with a gun and a hull mg bone, no "mgun"
put('goh/resource/entity/p1/p1.def', '{game_entity\n  {Extension "p1.mdl"}\n}\n');
put('goh/resource/entity/p1/p1.mdl', mdlOf(bone('gun', bone('foresight1')) + bone('mgun_h')));
const seat = '  {placer\n    {place "driver" {group "crew"}}\n  }\n  {boarder\n    {door "emit1"}\n    {door "emit2"}\n    {link "emit1" "driver" {anm "driver"}}\n    {link "emit2" "driver" {anm "driver"}}\n  }\n';
const dnr = (name, body) => { put(`as2/resource/entity/${name}/${name}.def`, `{game_entity\n  {Extension "${name}.mdl"}\n  {PatherID "tank"}\n  {props "steel"}\n${seat}${body}}\n`); put(`as2/resource/entity/${name}/${name}.mdl`, '{model "x"}\n'); };
for (let i = 1; i <= 24; i++) put(`as2/resource/set/stuff/gun/w${String(i).padStart(2, '0')}.weapon`, '{weapon_bullet}\n');
const wp = (name, type, extra) => `    {place "${name}"\n      {type "${type}"}\n      {gunner "driver"}\n${extra || ''}    }\n`;
const weaponry = places => `  {Weaponry\n${places}  }\n`;

const tool = path.join(__dirname, '..', 'goh2as2.js');
const run = (donor, o, more) => cp.spawnSync(process.execPath, [tool, '--goh', path.join(root, 'goh'), '--game', path.join(root, 'as2'), '--exe', 'mowas_2', '--no-keylint', '--no-rc', '--entity', 'p1', '--donor', donor, '--rep-key', '--out', path.join(root, o), ...(more || [])], { encoding: 'utf8' });
const all = r => r.stdout + r.stderr;
const defOf = o => rd(`${o}/resource/entity/p1/p1.def`) || '';
const gapsOf = o => { try { return JSON.parse(rd(`${o}/gaps/p1.gaps.json`)).gaps; } catch { return []; } };

// 1 mapped by role
dnr('d1', weaponry(wp('gun', 'cannon') + wp('mgun1', 'mgun_hull')));
const a1 = run('d1', 'o1'), d1 = defOf('o1');
t('1 place "mgun1" (type mgun_hull) gets {LinkBone "mgun_h"}: builds, exit 0', a1.status === 0 && /\{place "mgun1"\s*\{LinkBone "mgun_h"\}/i.test(d1), all(a1) + d1);
t('1 the place keeps its name', /\{place "mgun1"/.test(d1) && !/\{place "mgun_h"/.test(d1), d1);
t('1 a baked gap entry names the place and the bone', gapsOf('o1').some(g => g.kind === 'baked' && g.code === 'XLATE_FIT_PLACE_LINKBONE' && /mgun1/.test(g.key) && /mgun_h/.test(g.reason)), JSON.stringify(gapsOf('o1').map(g => g.code)));
t('1 no ERR_DONOR_BONE_MISSING, no WARN_XLATE_FIT_LEFT', !/ERR_DONOR_BONE_MISSING|WARN_XLATE_FIT_LEFT/.test(all(a1)), all(a1));

// 2 unmapped: unknown type; and a typed role whose bones the mdl lacks (coax: the mdl has no mgun_c)
dnr('d2', weaponry(wp('gun', 'cannon') + wp('xgun', 'flamer')));
const a2 = run('d2', 'o2');
t('2 unmapped place: exit 1, ERR_DONOR_BONE_MISSING names it', a2.status === 1 && /ERR_DONOR_BONE_MISSING[^\n]*"xgun"/.test(all(a2)), all(a2));
t('2 a hand gap entry is written', gapsOf('o2').some(g => g.kind === 'hand' && g.code === 'ERR_DONOR_BONE_MISSING' && /xgun/.test(g.key)), JSON.stringify(gapsOf('o2').map(g => g.code)));
dnr('d3', weaponry(wp('gun', 'cannon') + wp('mgun2', 'mgun_coaxial')));
const a3 = run('d3', 'o3');
t('2 role known but the mdl has no coax bone: exit 1', a3.status === 1 && /ERR_DONOR_BONE_MISSING[^\n]*"mgun2"/.test(all(a3)), all(a3));
const a4 = run('d3', 'o4', ['--allow-missing']);
t('2 --allow-missing: WARN_DONOR_BONE_MISSING, exit 0', a4.status === 0 && /WARN_DONOR_BONE_MISSING[^\n]*"mgun2"/.test(all(a4)) && !/ERR_DONOR_BONE_MISSING/.test(all(a4)), all(a4));

// 3 shield volume
dnr('d5', '  {volume "body1"\n    {tags "body"}\n  }\n  {volume "shieldl61"\n    {tags "shield"}\n    {component "shieldl6"}\n  }\n' + weaponry(wp('gun', 'cannon')));
const a5 = run('d5', 'o5'), d5 = defOf('o5');
t('3 shield volume the mdl lacks is dropped, body1 stays', a5.status === 0 && !/volume "shieldl61"/.test(d5) && /volume "body1"/.test(d5), all(a5) + d5);
t('3 a dropped gap entry names it', gapsOf('o5').some(g => g.kind === 'dropped' && g.code === 'XLATE_FIT_VOLUME_DROPPED' && /shieldl61/.test(g.key)), JSON.stringify(gapsOf('o5').map(g => g.code)));

// 4 left alone: a place the mdl has a bone for, a place with its own {LinkBone}
dnr('d6', weaponry(wp('gun', 'cannon') + wp('mgun_h', 'mgun_hull') + wp('mgun7', 'mgun_hull', '      {LinkBone "mgun_h"}\n')));
const a6 = run('d6', 'o6'), d6 = defOf('o6');
t('4 untouched: no edit, no gap, exit 0', a6.status === 0 && !/XLATE_FIT_PLACE_LINKBONE/.test(JSON.stringify(gapsOf('o6'))) && (d6.match(/LinkBone/gi) || []).length === 1, all(a6) + d6);

// 5 SEED (T-CHAINFIX, G-CHAIN2 g1): a vanilla extended crew macro on a GoH-made mdl (door bones carry {parameters "group=..."}) -> renamed to crew_N_human by the fit pass,
//   also the crew_5_human_extended2 form; a non-GoH mdl (p1, no group parameters) keeps the call
const gb = n => `{bone "${n}"\n${M}{parameters "group=crew;"}\n}\n`;
put('goh/resource/entity/p2/p2.def', '{game_entity\n  {Extension "p2.mdl"}\n}\n');
put('goh/resource/entity/p2/p2.mdl', '{Skeleton\n' + bone('basis', gb('emit0') + gb('emit1') + gb('emit2') + bone('gun', bone('foresight1'))) + '}\n{volume "body1"\n{thickness 10}\n}\n');
const runE = (donor, o, ent) => cp.spawnSync(process.execPath, [tool, '--goh', path.join(root, 'goh'), '--game', path.join(root, 'as2'), '--exe', 'mowas_2', '--no-keylint', '--no-rc', '--entity', ent, '--donor', donor, '--rep-key', '--allow-missing', '--out', path.join(root, o)], { encoding: 'utf8' });
for (const [d, mac, n] of [['d7', 'crew_4_human_extended', 4], ['d8', 'crew_5_human_extended2', 5]]) {
  dnr(d, `  ("${mac}")\n` + weaponry(wp('gun', 'cannon')));
  const a = runE(d, 'o' + d, 'p2'), df = rd(`o${d}/resource/entity/p2/p2.def`) || '';
  t(`5 ${mac} on a GoH mdl -> ("crew_${n}_human"), no WARN_XLATE_FIT_LEFT DF_CREW_EXT`, new RegExp(`\\("crew_${n}_human"\\)`).test(df) && !/human_extended/.test(df) && !/WARN_XLATE_FIT_LEFT[^\n]*DF_CREW_EXT/.test(all(a)), all(a) + df);
  const gp = (() => { try { return JSON.parse(rd(`o${d}/gaps/p2.gaps.json`)).gaps; } catch { return []; } })();
  t(`5 ${mac}: a baked XLATE_FIT_CREW_EXT gap entry`, gp.some(g => g.kind === 'baked' && g.code === 'XLATE_FIT_CREW_EXT'), JSON.stringify(gp.map(g => g.code)));
}
dnr('d9', '  ("crew_4_human_extended")\n' + weaponry(wp('gun', 'cannon')));
const a9 = runE('d9', 'od9', 'p1'), d9 = rd('od9/resource/entity/p1/p1.def') || '';
t('5 non-GoH mdl: crew_4_human_extended kept', /\("crew_4_human_extended"\)/.test(d9) && !/XLATE_FIT_CREW_EXT/.test(JSON.stringify(gapsOf('od9'))), all(a9) + d9);
if (fail) process.exit(1);

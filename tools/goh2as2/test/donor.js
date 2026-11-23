// goh2as2 --donor tests (PORT-129/131, FMT-05) on an invented GoH rep and invented "vanilla" defs. nothing here is game data. run via run.sh.
// Author: Imperator_Aug (ARSENAL, ia-cdaadf0b)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const root = path.join(__dirname, 'fixture', 'donor');
fs.rmSync(root, { recursive: true, force: true });
const put = (rel, data) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, typeof data === 'string' ? data.replace(/\r?\n/g, '\r\n') : data, typeof data === 'string' ? 'latin1' : undefined); };
const plyOf = n => Buffer.concat([Buffer.from('EPLY'), Buffer.from('MESH'), Buffer.from([0x12, 1, 0, 0]), Buffer.alloc(8), Buffer.from([0x04, 4, 0, 0]), Buffer.from([n.length]), Buffer.from(n)]);
// GoH rep: mdl folder entity/rp (basis plain, turret + gun_rot revolute), a def and ext that must stay out, a nested mtl, a loose texture, an unreferenced file
put('goh/resource/entity/rp/rep.def', '{game_entity\n  {Extension "rep.mdl"}\n  {bone "basis"\n    {speed 0.5}\n  }\n}\n');
put('goh/resource/entity/rp/rep.ext', '{entity "rep"}\n');
put('goh/resource/entity/rp/other.def', '{game_entity "other"}\n');
put('goh/resource/entity/rp/rep.mdl', '{model "rep"\n  {bone "basis"\n    {bone revolute "turret"\n      {bone revolute "gun_rot"\n        {limits -5 85}\n      }\n    }\n  }\n  {Volume "v1"\n    {Bone "turret"}\n    {polyhedron "rep.vol"}\n  }\n  {file "rep.ply"}\n  {sequence "run"}\n}\n');
put('goh/resource/entity/rp/rep.ply', plyOf('mat/deep.mtl'));
put('goh/resource/entity/rp/mat/deep.mtl', '{material\n  {diffuse "$/rp/skin"}\n}\n');
put('goh/resource/entity/rp/run.anm', 'ANM\0');
put('goh/resource/entity/rp/rep.vol', 'VOL\0');
put('goh/resource/entity/rp/loose.dds', 'DDS ');
put('goh/resource/texture/common/rp/skin.dds', 'DDS ');
// "vanilla" (cp1251 byte 0xC0 in a comment must survive): relative Extension, and an absolute one in another folder
put('as2/resource/entity/van/van.def', Buffer.concat([Buffer.from('{game_entity\r\n  ; '), Buffer.from([0xC0]), Buffer.from('\r\n  {extension "crew.ext"}\r\n  {props "x"}\r\n  {Extension "van.mdl"}\r\n  {bone "basis"\r\n    {limits}\r\n    {speed 0.007}\r\n  }\r\n  {bone "turret"\r\n    {limits -27 27}\r\n    {speed 0.006}\r\n  }\r\n  {bone "gun_rot"\r\n    {speed 0.006}\r\n  }\r\n}\r\n')]));
put('as2/resource/entity/vab/vab.def', '{game_entity\n  {Extension "/entity/vab/dir/vab.mdl"}\n}\n');
put('as2/resource/entity/vab/dir/vab.mdl', '{model "vab"}\n');
// a towed gun donor (PatherID cannon, under -vehicle/cannon): PORT-133, the rep mdl's plain basis must come out revolute
put('as2/resource/entity/-vehicle/cannon/vgn/vgn.def', '{game_entity\n  {PatherID "cannon.small"}\n  {Extension "vgn.mdl"}\n}\n');
put('as2/resource/entity/-vehicle/cannon/vgn/vgn.mdl', '{model "vgn"\n  {bone revolute "basis"\n    {bone revolute "gun_rot"\n      {limits -15 65}\n    }\n  }\n}\n');
// FXC-1 fixtures (invented): rep "rq" whose mdl names /properties/dmgc.ext (GoH only) and whose plies name gone.mtl (donor has one) and nowhere.mtl (nobody has one)
put('goh/resource/entity/rq/rq.def', '{game_entity\n  {Extension "rq.mdl"}\n}\n');
put('goh/resource/entity/rq/rq.mdl', '{model "rq"\n  {Extension "/properties/dmgc.ext"}\n  {bone "basis"}\n  {file "rq.ply"}\n  {file "rq2.ply"}\n}\n');
put('goh/resource/entity/rq/rq.ply', plyOf('gone.mtl'));
put('goh/resource/entity/rq/rq2.ply', plyOf('nowhere.mtl'));
put('goh/resource/properties/dmgc.ext', '{damage_components "x"}\n');
put('as2/resource/entity/vcr/vcr.def', '{game_entity\n  {extension "crew.ext"}\n  {include "extra.inc"}\n  {Extension "vcr.mdl"}\n}\n');
put('as2/resource/entity/vcr/vcr.mdl', '{model "vcr"}\n');
put('as2/resource/entity/vcr/crew.ext', '{crew_item "emit0"}\n{include "extra.inc"}\n');
put('as2/resource/entity/vcr/extra.inc', '{extra "x"}\n');
put('as2/resource/entity/vcr/gone.mtl', '{material\n  {diffuse "$/vcr/donorskin"}\n}\n');

const tool = path.join(__dirname, '..', 'goh2as2.js'), dfit = path.join(__dirname, '..', '..', 'donorfit', 'donorfit.js');
const run = (args) => cp.spawnSync(process.execPath, [tool, '--goh', path.join(root, 'goh'), '--game', path.join(root, 'as2'), '--exe', 'mowas_2', '--no-keylint', '--no-rc', ...args], { encoding: 'utf8' });
let fail = 0;
const t = (name, good, extra) => { console.log((good ? 'ok   ' : 'FAIL ') + 'donor: ' + name + (good || !extra ? '' : '  ' + extra)); if (!good) fail++; };
const ex = p => fs.existsSync(path.join(root, p));
const rd = p => { try { return fs.readFileSync(path.join(root, p)); } catch { return null; } };

const outA = path.join(root, 'outA');
const rA = run(['--entity', 'rep', '--donor', 'van', '--out', outA]);
t('exit 0', rA.status === 0, rA.stdout + rA.stderr);
const vdef = rd('outA/resource/entity/van/van.def'), vs = vdef ? vdef.toString('latin1') : '';
t('vanilla def written at its own key, last Extension .mdl replaced', /\{Extension "rep\.mdl"\}/.test(vs) && !/van\.mdl/.test(vs), vs);
t('other lines kept (crew.ext extension, props, revolute bones)', /\{extension "crew\.ext"\}/.test(vs) && /\{props "x"\}/.test(vs) && /\{limits -27 27\}/.test(vs) && /\{bone "gun_rot"\s*\{speed 0\.006\}/.test(vs), vs);
t('plain bone "basis" block stripped (rep mdl basis is plain)', !/"basis"/.test(vs), vs);
t('cp1251 byte and CRLF kept', !!vdef && vdef.includes(0xC0) && !/[^\r]\n/.test(vs));
t('WARN_PORT_PLAIN_BONE x2 (limits, speed)', (rA.stdout.match(/WARN_PORT_PLAIN_BONE/g) || []).length === 2, rA.stdout);
for (const f of ['rep.mdl', 'rep.ply', 'rep.vol', 'run.anm', 'loose.dds', 'mat/deep.mtl']) t(`mdl folder file ${f} lands in the Extension's folder`, ex('outA/resource/entity/van/' + f));
t('texture stays at its own key', ex('outA/resource/texture/common/rp/skin.dds'));
t('no .def/.ext copied, rep folder not written', !ex('outA/resource/entity/van/rep.def') && !ex('outA/resource/entity/van/rep.ext') && !ex('outA/resource/entity/van/other.def') && !ex('outA/resource/entity/rp'));
t('mod.info written', ex('outA/mod.info'));
// absolute Extension in another folder: files go to exactly that folder, the new value keeps the path
const rB = run(['--entity', 'rep', '--donor', 'vab', '--out', path.join(root, 'outB')]);
const bdef = (rd('outB/resource/entity/vab/vab.def') || '').toString('latin1');
t('absolute Extension: value keeps its path', rB.status === 0 && /\{Extension "\/entity\/vab\/dir\/rep\.mdl"\}/.test(bdef), rB.stdout + rB.stderr + bdef);
t('absolute Extension: files in the named folder, none beside the def', ex('outB/resource/entity/vab/dir/rep.mdl') && ex('outB/resource/entity/vab/dir/mat/deep.mtl') && !ex('outB/resource/entity/vab/rep.mdl'));
// unknown stem: non-zero, nothing written
const rU = run(['--entity', 'rep', '--donor', 'nosuch', '--out', path.join(root, 'outU')]);
t('unknown stem: exit non-zero, nothing written', rU.status !== 0 && !ex('outU'), 'status ' + rU.status);
// the output passes donorfit's plain-bone and folder checks
const rF = cp.spawnSync(process.execPath, [dfit, path.join(outA, 'resource/entity/van/van.def'), '--game', path.join(root, 'as2'), '--exe', 'mowas_2', '--json'], { encoding: 'utf8' });
let jf = null; try { jf = JSON.parse(rF.stdout); } catch { /* shown below */ }
t('donorfit on the donor: no miss (no DF_PLAIN_BONE, no DF_FOLDER)', !!jf && rF.status === 0 && jf.misses.length === 0, rF.stdout + rF.stderr);
// PORT-133: gun donor -> rep mdl basis plain becomes revolute with {speed 0.01}, warned once; a non-gun donor keeps the plain basis and says nothing
const rG = run(['--entity', 'rep', '--donor', 'vgn', '--out', path.join(root, 'outG')]);
const gmdl = (rd('outG/resource/entity/-vehicle/cannon/vgn/rep.mdl') || '').toString('latin1');
t('gun donor: exit 0', rG.status === 0, rG.stdout + rG.stderr);
t('gun donor: basis rewritten revolute with {speed 0.01}, rest of the tree kept', /\{bone revolute "basis" \{speed 0\.01\}/.test(gmdl) && /\{bone revolute "turret"/.test(gmdl) && /\{bone revolute "gun_rot"/.test(gmdl), gmdl);
t('gun donor: WARN_PORT_GUN_BASIS once', (rG.stdout.match(/WARN_PORT_GUN_BASIS/g) || []).length === 1, rG.stdout);
t('gun donor: LIM-1 rep gun_rot -5 85 -> donor -15 65, one WARN_PORT_GUN_LIMITS', /\{limits -15 65\}/.test(gmdl) && !/-5 85/.test(gmdl) && (rG.stdout.match(/WARN_PORT_GUN_LIMITS/g) || []).length === 1, gmdl + rG.stdout);
const amdl = (rd('outA/resource/entity/van/rep.mdl') || '').toString('latin1');
t('non-gun donor: rep gun limits kept', /\{limits -5 85\}/.test(amdl) && !/WARN_PORT_GUN_LIMITS/.test(rA.stdout), amdl);
t('non-gun donor: basis stays plain, no gun-basis warning', /\{bone "basis"/.test(amdl) && !/revolute "basis"/.test(amdl) && !/WARN_PORT_GUN_BASIS/.test(rA.stdout), amdl);
const rGF = cp.spawnSync(process.execPath, [dfit, path.join(root, 'outG/resource/entity/-vehicle/cannon/vgn/vgn.def'), '--game', path.join(root, 'as2'), '--exe', 'mowas_2', '--json'], { encoding: 'utf8' });
let jg = null; try { jg = JSON.parse(rGF.stdout); } catch { /* shown below */ }
t('gun donor output: donorfit has no DF_GUN_BASIS', !!jg && !jg.warnings.some(w => w.code === 'DF_GUN_BASIS') && jg.misses.length === 0, rGF.stdout + rGF.stderr);
// the unfixed copy of the same gun (what a plain Extension swap gives) is what donorfit warns about
const plainDir = path.join(root, 'outGplain'); fs.mkdirSync(plainDir, { recursive: true });
fs.writeFileSync(path.join(plainDir, 'vgn.def'), rd('outG/resource/entity/-vehicle/cannon/vgn/vgn.def'));
fs.writeFileSync(path.join(plainDir, 'rep.mdl'), gmdl.replace(/\{bone revolute "basis" \{speed 0\.01\}/, '{bone "basis"'));
const rGP = cp.spawnSync(process.execPath, [dfit, path.join(plainDir, 'vgn.def'), '--game', path.join(root, 'as2'), '--exe', 'mowas_2', '--json'], { encoding: 'utf8' });
let jgp = null; try { jgp = JSON.parse(rGP.stdout); } catch { /* shown below */ }
t('same gun with the plain basis: donorfit DF_GUN_BASIS', !!jgp && jgp.warnings.some(w => w.code === 'DF_GUN_BASIS'), rGP.stdout + rGP.stderr);
// ---- FXC-1 gap 1+6: --rep-key. Control without the flag writes the donor key (the defect), with it only <rep>.def under entity/rq
const rC = run(['--entity', 'rq', '--donor', 'vcr', '--allow-missing', '--out', path.join(root, 'outC')]);
t('FXC-1 control (no flag): donor key written, no rep-named def', rC.status === 0 && ex('outC/resource/entity/vcr/vcr.def') && !ex('outC/resource/entity/rq/rq.def'), rC.stdout + rC.stderr);
const outR = path.join(root, 'outR'), rR = run(['--entity', 'rq', '--donor', 'vcr', '--rep-key', '--allow-missing', '--out', outR]);   // XLATE-5: this fixture has deliberate holes (dmgc.ext, nowhere.mtl); --allow-missing keeps the old exit 0
const rdef = (rd('outR/resource/entity/rq/rq.def') || '').toString('latin1');
t('rep-key: exit 0', rR.status === 0, rR.stdout + rR.stderr);
t('rep-key: <rep>.def in the rep folder with a relative Extension that resolves there', /\{Extension "rq\.mdl"\}/.test(rdef) && ex('outR/resource/entity/rq/rq.mdl'), rdef);
t('rep-key: the vanilla donor key and folder are not written', !ex('outR/resource/entity/vcr'), rR.stdout);
t('rep-key gap 6: donor crew.ext copied beside the rep def (relative ref kept)', ex('outR/resource/entity/rq/crew.ext') && /\{extension "crew\.ext"\}/.test(rdef), rdef);
t('rep-key: other relative include made absolute to the donor folder, and it exists in the donor vfs', /\{include "\/entity\/vcr\/extra\.inc"\}/.test(rdef) && ex('as2/resource/entity/vcr/extra.inc'), rdef);
t('rep-key: crew.ext own include fixed too', /\{include "\/entity\/vcr\/extra\.inc"\}/.test((rd('outR/resource/entity/rq/crew.ext') || '').toString('latin1')));
t('rep-key: mod.info written', ex('outR/mod.info'));
// ---- FXC-1 gap 4: --pull-props
t('pull-props control: GoH properties ext not pulled without the flag', rR.status === 0 && !ex('outR/resource/properties/dmgc.ext'));
const outP = path.join(root, 'outP'), rP = run(['--entity', 'rq', '--donor', 'vcr', '--rep-key', '--pull-props', '--allow-missing', '--out', outP]);
t('pull-props: the ext an mdl Extension names is in the output', rP.status === 0 && ex('outP/resource/properties/dmgc.ext'), rP.stdout + rP.stderr);
// ---- FXC-1 gap 7: --mtl-fallback
t('mtl-fallback control: without the flag both mtls stay missing (warning only)', !ex('outR/resource/entity/rq/gone.mtl') && !ex('outR/resource/entity/rq/nowhere.mtl') && (rR.stdout.match(/WARN_PORT_MISSING_REF/g) || []).length === 2, rR.stdout);
const outM = path.join(root, 'outM'), rM = run(['--entity', 'rq', '--donor', 'vcr', '--rep-key', '--mtl-fallback', '--allow-missing', '--out', outM]);
t('mtl-fallback: donor same-name mtl copied where the ply names it', rM.status === 0 && /donorskin/.test((rd('outM/resource/entity/rq/gone.mtl') || '').toString('latin1')), rM.stdout + rM.stderr);
t('mtl-fallback: nobody has it -> stub written', /\{material/.test((rd('outM/resource/entity/rq/nowhere.mtl') || '').toString('latin1')));
t('mtl-fallback: warned for both, no MISSING_REF left', (rM.stdout.match(/WARN_PORT_MTL_FALLBACK/g) || []).length === 2 && !/WARN_PORT_MISSING_REF/.test(rM.stdout), rM.stdout);
t('FXC-4 gap 6: mtl-fallback files count as present in the closure check (no CLOSURE_MISSING for them); without the flag they are still reported', !/CLOSURE_MISSING (gone|nowhere)\.mtl/.test(rM.stdout) && /CLOSURE_MISSING gone\.mtl/.test(rR.stdout) && /CLOSURE_MISSING nowhere\.mtl/.test(rR.stdout), rM.stdout + '\n--- control\n' + rR.stdout);
t('--rep-key without --donor: refused', run(['--entity', 'rq', '--rep-key', '--out', path.join(root, 'outZ')]).status === 2);
// ---- FXC-3 fixtures (invented). gap 5: donor vw has a 152 mm gun + heavy armour; vanilla guns 152/120/105; reps: rw 120 mm light, rn 37 mm, rh 152 mm heavy
const dmdl = n => `{model "${n}"\n  {bone "basis"\n    {bone "gun"}\n    {bone "a"}\n    {bone "b"}\n  }\n}\n`;   // T-DONORFIT: a "gun" bone, the weapon place of these defs sits on it (a place with no bone is DF_BONE_MISSING)
put('as2/resource/entity/vw/vw.def', '{game_entity\n  ("armor_heavy" turret(150))\n  {volume "body"\n    {thickness 150}\n  }\n  {Extension "vw.mdl"}\n  {Weaponry\n    {place "gun"\n      {weapon "weapon 152mm_zz" filling "ammo x" 1}\n    }\n  }\n}\n');
put('as2/resource/entity/vw/vw.mdl', dmdl('vw'));
for (const g of ['152mm_zz', '120mm_yy', '105mm_xx']) put('as2/resource/set/stuff/gun/' + g, '{from "pattern gun"}\n');
for (const [r, cal, arm, th] of [['rw', '120mm_qq', 'light', 20], ['rn', '37mm_nn', 'light', 20], ['rh', '152mm_hh', 'heavy', 140]]) {
  put(`goh/resource/entity/${r}/${r}.def`, `{game_entity\n  ("armor_${arm}" turret(40))\n  {volume "body"\n    {thickness ${th}}\n  }\n  {Extension "${r}.mdl"}\n  {Weaponry\n    {place "gun"\n      {weapon "weapon ${cal}" filling "ammo x" 1}\n    }\n  }\n}\n`);
  put(`goh/resource/entity/${r}/${r}.mdl`, dmdl(r));
  put(`goh/resource/set/stuff/gun/${cal}`, '{from "pattern gun"}\n');
}
const wtxt = (o2, r) => (rd(`${o2}/resource/entity/${r}/${r}.def`) || '').toString('latin1');
const rW0 = run(['--entity', 'rw', '--donor', 'vw', '--rep-key', '--out', path.join(root, 'outW0')]);
t('FXC-3 gap 5 control (no flag): donor weapon kept, no calibre/armour warning', rW0.status === 0 && /"weapon 152mm_zz"/.test(wtxt('outW0', 'rw')) && !/WARN_PORT_(WEAPON_SWAPPED|CALIBRE|ARMOUR)/.test(rW0.stdout), rW0.stdout + rW0.stderr);
const rW1 = run(['--entity', 'rw', '--donor', 'vw', '--rep-key', '--match-weapon', '--out', path.join(root, 'outW1')]);
t('gap 5: 120 mm rep -> nearest vanilla gun 120mm_yy swapped in, warned', rW1.status === 0 && /\{weapon "120mm_yy"/.test(wtxt('outW1', 'rw')) /* BUILD-6: 120mm_yy has no .weapon file, so the "weapon " prefix would not resolve */ && !/152mm_zz/.test(wtxt('outW1', 'rw')) && /WARN_PORT_WEAPON_SWAPPED/.test(rW1.stdout), rW1.stdout + rW1.stderr + wtxt('outW1', 'rw'));
t('gap 5: heavy donor armour vs light rep -> WARN_PORT_ARMOUR', /WARN_PORT_ARMOUR/.test(rW1.stdout), rW1.stdout);
const rN1 = run(['--entity', 'rn', '--donor', 'vw', '--rep-key', '--match-weapon', '--out', path.join(root, 'outN1')]);
t('gap 5: 37 mm rep, nothing near -> WARN_PORT_CALIBRE, donor weapon kept', rN1.status === 0 && /WARN_PORT_CALIBRE/.test(rN1.stdout) && /"weapon 152mm_zz"/.test(wtxt('outN1', 'rn')) && !/WARN_PORT_WEAPON_SWAPPED/.test(rN1.stdout), rN1.stdout + rN1.stderr);
const rH1 = run(['--entity', 'rh', '--donor', 'vw', '--rep-key', '--match-weapon', '--out', path.join(root, 'outH1')]);
t('gap 5: same calibre and class rep -> no swap, no calibre/armour warning', rH1.status === 0 && !/WARN_PORT_(WEAPON_SWAPPED|CALIBRE|ARMOUR)/.test(rH1.stdout) && /"weapon 152mm_zz"/.test(wtxt('outH1', 'rh')), rH1.stdout + rH1.stderr);
t('--match-weapon without --donor: refused', run(['--entity', 'rw', '--match-weapon', '--out', path.join(root, 'outZ2')]).status === 2);
// ---- FXC-3 gap 9: stubs with no Extension follow their include (one wrapped in game_entity already, one bare)
put('as2/resource/entity/-vehicle/cannon/mt/stub.def', '{game_entity\n  (include "mt.inc")\n}\n');
put('as2/resource/entity/-vehicle/cannon/mt/bare.def', '(include "mt.inc")\n');
put('as2/resource/entity/-vehicle/cannon/mt/mt.inc', '(include "/properties/cannon.ext")\n{patherId "cannon.carried"}\n(include "sub.inc")\n{Extension "mt.mdl"}\n');
put('as2/resource/entity/-vehicle/cannon/mt/sub.inc', '{extra "y"}\n');
put('as2/resource/entity/-vehicle/cannon/mt/mt.mdl', dmdl('mt'));
const rS = run(['--entity', 'rw', '--donor', 'stub', '--rep-key', '--out', path.join(root, 'outS')]), stx = wtxt('outS', 'rw');
t('gap 9: stub with no Extension builds; include inlined, Extension -> rep mdl, still one game_entity', rS.status === 0 && /^\{game_entity/.test(stx) && /\{patherId "cannon\.carried"\}/.test(stx) && /\{Extension "rw\.mdl"\}/.test(stx) && !/mt\.mdl/.test(stx) && (stx.match(/game_entity/g) || []).length === 1, rS.stdout + rS.stderr + stx);
t('gap 9: the include\'s own relative include made absolute (still resolves from the rep folder)', /\(include "\/entity\/-vehicle\/cannon\/mt\/sub\.inc"\)/.test(stx), stx);
t('gap 9: stub treated as a gun donor (PatherID cannon)', rS.status === 0 && /WARN_PORT_GUN_BASIS/.test(rS.stdout), rS.stdout);
const rBr = run(['--entity', 'rw', '--donor', 'bare', '--rep-key', '--out', path.join(root, 'outBr')]), btx = wtxt('outBr', 'rw');
t('gap 9: bare include stub is wrapped in game_entity', rBr.status === 0 && /^\{game_entity/.test(btx) && /\}\s*$/.test(btx) && /\{Extension "rw\.mdl"\}/.test(btx), rBr.stdout + rBr.stderr + btx);
// ---- FXC-3 gap 8: a grenade item with no GoH stuff entry
put('goh/resource/entity/inventory/gren-x/gren-x.def', '{actor\n  {extension "g.mdl"}\n  {extender "stuff"\n    {item "grenade gr_x"}\n  }\n}\n');
put('goh/resource/entity/inventory/gren-x/g.mdl', '{model "g"}\n');
put('as2/resource/set/stuff/grenade/02 grenade_at/tpl.grenade', '{from "pattern grenade_at"\n\t{inventory {size 2 1}}\n\t{entity "grenade_tpl"}\n}\n');
const rGr0 = run(['--entity', 'gren-x', '--out', path.join(root, 'outGr0')]);
t('FXC-3 gap 8 control (no flag): INF_NO_STUFF, no grenade entry', rGr0.status === 0 && /WARN_PORT_INF_NO_STUFF/.test(rGr0.stdout) && !ex('outGr0/resource/set/stuff/grenade/02 grenade_at/gr_x.grenade'), rGr0.stdout + rGr0.stderr);
const rGr1 = run(['--entity', 'gren-x', '--grenade-stuff', '--out', path.join(root, 'outGr1')]), gtx = (rd('outGr1/resource/set/stuff/grenade/02 grenade_at/gr_x.grenade') || '').toString('latin1');
t('gap 8: grenade stuff entry written from the vanilla pattern, no INF_NO_STUFF', rGr1.status === 0 && /\{from "pattern grenade_at"/.test(gtx) && /\{inventory \{size 2 1\}\}/.test(gtx) && /\{entity "gren-x"\}/.test(gtx) && !/WARN_PORT_INF_NO_STUFF/.test(rGr1.stdout), rGr1.stdout + rGr1.stderr + gtx);
t('gap 8: a breed carrying the grenade', /\{item "grenade gr_x" 3\}/.test((rd('outGr1/resource/set/breed/mp/goh/w_grenade_gr_x.set') || '').toString('latin1')));
// ---- FXC-4 fixtures (invented), REAL def form `{weapon "<bare name>" filling "ammo <base> <type>" 1}` (the FXC-3 ones used the "weapon " key prefix and so only matched the old pattern)
// gap 2: donor vr = 200 mm gun + armor_medium macro, ammo bullet200; vanilla guns 90mm_bb (ammo ap/fg exist) and 95mm_cc (no ammo files); reps: rr 90 mm (weapon reached through rr.ext), rc 95 mm
put('as2/resource/entity/vr/vr.def', '{game_entity\n  ("armor_medium" turret(152) body(152))\n  {Extension "vr.mdl"}\n  {item "ammo bullet200 ap" 20}\n  {item "ammo bullet200 fg" 9}\n  {item "ammo bullet200 sm" 3}\n  {Weaponry\n    {place "gun"\n      {weapon "200mm_aa" filling "ammo bullet200 ap" 1}\n    }\n  }\n}\n');
put('as2/resource/entity/vr/vr.mdl', dmdl('vr'));
put('as2/resource/set/stuff/gun/200mm_aa', '{from "pattern gun"\n\t{filling "bullet200"}\n}\n');
put('as2/resource/set/stuff/gun/90mm_bb', '{from "pattern gun"\n\t{filling "bullet90"}\n}\n');
put('as2/resource/set/stuff/gun/95mm_cc', '{from "pattern gun"\n\t{filling "bullet95"}\n}\n');
for (const a of ['bullet200.ap', 'bullet200.fg', 'bullet90.ap', 'bullet90.fg']) put(`as2/resource/set/stuff/shell/${a}.ammo`, '{ammo}\n');
put('goh/resource/entity/rr/rr.def', '{game_entity\n  (include "rr.ext")\n  {Extension "rr.mdl"}\n}\n');
put('goh/resource/entity/rr/rr.ext', '{volume "body"\n  {thickness 25\n    {front 75}\n  }\n}\n{Weaponry\n  {place "gun"\n    {weapon "90mm_rr" filling "ammo bullet90 ap" 1}\n  }\n}\n');
put('goh/resource/entity/rr/rr.mdl', dmdl('rr'));
put('goh/resource/set/stuff/gun/90mm_rr', '{from "pattern gun"}\n');
put('goh/resource/entity/rc/rc.def', '{game_entity\n  {Extension "rc.mdl"}\n  {Weaponry\n    {place "gun"\n      {weapon "95mm_rc" filling "ammo bullet95 ap" 1}\n    }\n  }\n}\n');
put('goh/resource/entity/rc/rc.mdl', dmdl('rc'));
put('goh/resource/set/stuff/gun/95mm_rc', '{from "pattern gun"}\n');
const rR1 = run(['--entity', 'rr', '--donor', 'vr', '--rep-key', '--match-weapon', '--out', path.join(root, 'outR1')]), rrt = wtxt('outR1', 'rr');
t('FXC-4 gap 2: real-form {weapon "200mm_aa"} swapped for vanilla 90mm_bb (rep weapon found through its .ext)', rR1.status === 0 && /\{weapon "90mm_bb" filling/.test(rrt) && !/200mm_aa/.test(rrt) && /WARN_PORT_WEAPON_SWAPPED/.test(rR1.stdout), rR1.stdout + rR1.stderr + rrt);
t('FXC-4 gap 2: ammo moves with the gun (filling + ap/fg item lines bullet200 -> bullet90); type sm has no bullet90 ammo: stays, warned', /filling "ammo bullet90 ap"/.test(rrt) && /\{item "ammo bullet90 ap" 20\}/.test(rrt) && /\{item "ammo bullet90 fg" 9\}/.test(rrt) && /\{item "ammo bullet200 sm" 3\}/.test(rrt) && /WARN_PORT_AMMO_NOT_MOVED[^\r\n]*type sm/.test(rR1.stdout), rrt + rR1.stdout);
const rC1 = run(['--entity', 'rc', '--donor', 'vr', '--rep-key', '--match-weapon', '--out', path.join(root, 'outC1')]), rct = wtxt('outC1', 'rc');
t('FXC-4 gap 2: vanilla gun has no ammo of the types in use -> weapon swapped, ammo left, WARN_PORT_AMMO_NOT_MOVED', rC1.status === 0 && /\{weapon "95mm_cc"/.test(rct) && /bullet200/.test(rct) && /WARN_PORT_AMMO_NOT_MOVED/.test(rC1.stdout), rC1.stdout + rC1.stderr + rct);
const rW2 = run(['--entity', 'rr', '--donor', 'vr', '--rep-key', '--out', path.join(root, 'outR0')]);
t('FXC-4 gap 2 control (no flag): real-form weapon and ammo untouched', rW2.status === 0 && /\{weapon "200mm_aa" filling "ammo bullet200 ap"/.test(wtxt('outR0', 'rr')) && !/WARN_PORT_(WEAPON_SWAPPED|AMMO_NOT_MOVED|CALIBRE)/.test(rW2.stdout), rW2.stdout);
// gap 4: rr's own {front 75} (def + ext) against the donor's armor_medium turret(152): same class rank, donor has no {thickness}, so only the new rule sees it
t('FXC-4 gap 4: donor macro armour 152 vs rep front 75 -> WARN_PORT_ARMOUR (same class rank)', /WARN_PORT_ARMOUR/.test(rR1.stdout), rR1.stdout);
t('FXC-4 gap 4: rep with no armour values -> no armour warning', !/WARN_PORT_ARMOUR/.test(rC1.stdout), rC1.stdout);
// mortars: donor vm holds `{weapon "weapon werfer42"}` (no calibre in the name); vanilla has werfer42, mortar81 and a gun 80mm_gg. rm81 (81 mm mortar) -> mortar81, never the gun; rm60 (60 mm) -> no mortar near: CALIBRE, werfer42 kept
put('as2/resource/entity/vm/vm.def', '{game_entity\n  {Extension "vm.mdl"}\n  {item "ammo mortar fg" 120}\n  {Weaponry\n    {place "gun"\n      {weapon "weapon werfer42" filling "ammo mortar" 1}\n    }\n  }\n}\n');
put('as2/resource/entity/vm/vm.mdl', dmdl('vm'));
put('as2/resource/set/stuff/reactive/werfer42.weapon', '{weapon_bullet\n\t{filling "ammo mortar fg" 1}\n}\n');
put('as2/resource/set/stuff/reactive/mortar81.weapon', '{weapon_bullet\n\t{filling "ammo mortar81 fg" 1}\n}\n');
put('as2/resource/set/stuff/ammo/mortar.fg.ammo', '{ammo}\n');
put('as2/resource/set/stuff/ammo/mortar81.fg.ammo', '{ammo}\n');
put('as2/resource/set/stuff/gun/80mm_gg', '{from "pattern gun"\n\t{filling "bullet80"}\n}\n');
for (const [r, cal] of [['rm81', 81], ['rm60', 60]]) {
  put(`goh/resource/entity/${r}/${r}.def`, `{game_entity\n  {Extension "${r}.mdl"}\n  {item "ammo mortar${cal} he" 15}\n  {Weaponry\n    {place "gun"\n      {weapon "weapon ${cal}mm_mort" filling "ammo mortar${cal} he" 1}\n    }\n  }\n}\n`);
  put(`goh/resource/entity/${r}/${r}.mdl`, dmdl(r));
  put(`goh/resource/set/stuff/gun/${cal}mm_mort`, '{from "pattern gun"}\n');
}
const rM81 = run(['--entity', 'rm81', '--donor', 'vm', '--rep-key', '--match-weapon', '--out', path.join(root, 'outM81')]), m81 = wtxt('outM81', 'rm81');
t('FXC-4 gap 2 mortar: 81 mm mortar rep -> vanilla mortar81 (not werfer42, not the 80 mm gun)', rM81.status === 0 && /\{weapon "weapon mortar81" filling/.test(m81) && !/werfer42|80mm_gg/.test(m81) && /WARN_PORT_WEAPON_SWAPPED/.test(rM81.stdout), rM81.stdout + rM81.stderr + m81);
const rM60 = run(['--entity', 'rm60', '--donor', 'vm', '--rep-key', '--match-weapon', '--out', path.join(root, 'outM60')]);
t('FXC-4 gap 2 mortar + FXD-3 rule 3: 60 mm mortar rep, no mortar near -> local werfer42-copy stuff entry named after the rep weapon, def points at it, WARN_PORT_MORTAR_LOCAL, no gun swapped in', rM60.status === 0 && /WARN_PORT_MORTAR_LOCAL/.test(rM60.stdout) && !/WARN_PORT_CALIBRE/.test(rM60.stdout) && /\{weapon "weapon 60mm_mort" filling/.test(wtxt('outM60', 'rm60')) && /ammo mortar fg/.test((rd('outM60/resource/set/stuff/reactive/60mm_mort.weapon') || '').toString('latin1')) && !/80mm_gg/.test(wtxt('outM60', 'rm60')), rM60.stdout + rM60.stderr);
// ---- FIX-PORT tools-other:50: a 150 mm werfer rep (15cm_43m: 150mm_nebelwerfer) that would take mortar150 takes gun-class 150mm_sfh18, hand-fit line + foresight; a real 150 mm mortar rep keeps mortar150
put('as2/resource/set/stuff/reactive/mortar150.weapon', '{weapon_bullet\n\t{filling "ammo mortar150 fg" 1}\n}\n');
put('as2/resource/set/stuff/ammo/mortar150.fg.ammo', '{ammo}\n');
put('as2/resource/set/stuff/gun/150mm_sfh18', '{from "pattern gun"\n\t{filling "bullet150" 6}\n}\n');
put('as2/resource/set/stuff/shell/bullet150.fg.ammo', '{ammo}\n');
for (const [r, wn] of [['rw150', '150mm_nebelwerfer'], ['rmo150', '150mm_mortar']]) {
  put(`goh/resource/entity/${r}/${r}.def`, `{game_entity\n  {Extension "${r}.mdl"}\n  {Weaponry\n    {place "gun"\n      {weapon "${wn}" filling "ammo 150mm_rocket he" 1}\n    }\n  }\n}\n`);
  put(`goh/resource/entity/${r}/${r}.mdl`, dmdl(r));
  put(`goh/resource/set/stuff/reactive/${wn}`, '{from "pattern gun"}\n');
}
const rW150 = run(['--entity', 'rw150', '--donor', 'vm', '--rep-key', '--match-weapon', '--no-wpn-table', '--out', path.join(root, 'outW150')]), w150 = wtxt('outW150', 'rw150');
t('FIX-PORT tools-other:50: 150 mm werfer rep -> 150mm_sfh18 hand-fit line, foresight added, item typed, WARN_PORT_MORTAR150_SFH18', rW150.status === 0 && /\{foresight "foresight"\}\r?\n\s*\{weapon "150mm_sfh18" filling "bullet150 fg" 6\}/.test(w150) && !/mortar150/.test(w150) && /\{item "(ammo )?bullet150 fg" 120\}/.test(w150) && /WARN_PORT_MORTAR150_SFH18/.test(rW150.stdout), rW150.stdout + rW150.stderr + w150);
const rMo150 = run(['--entity', 'rmo150', '--donor', 'vm', '--rep-key', '--match-weapon', '--no-wpn-table', '--out', path.join(root, 'outMo150')]), mo150 = wtxt('outMo150', 'rmo150');
t('FIX-PORT tools-other:50 control: a 150 mm rep named as a mortar keeps mortar150, no sfh18', rMo150.status === 0 && /mortar150/.test(mo150) && !/sfh18|foresight/.test(mo150) && !/WARN_PORT_MORTAR150_SFH18/.test(rMo150.stdout), rMo150.stdout + rMo150.stderr + mo150);
// ---- FXD-1 rule 1: {limits} arity by the rep mdl's bone type. rep rl: mgun2 + turret revolute, sock socket, plain "hull". donor vl carries (invented) one-value limits on revolute mgun2 (the m2a1 case), a legal pair, a socket cone, a bad two-value socket, a bare limits
put('goh/resource/entity/rl/rl.def', '{game_entity\n  {Extension "rl.mdl"}\n}\n');
put('goh/resource/entity/rl/rl.mdl', '{model "rl"\n  {bone "basis"\n    {bone revolute "turret"\n      {bone revolute "mgun2"}\n      {bone socket "sock"}\n      {bone socket "sock2"}\n      {bone revolute "bare"}\n    }\n  }\n}\n');
put('as2/resource/entity/vl/vl.def', '{game_entity\n  {Extension "vl.mdl"}\n  {bone "mgun"\n    {limits 15}\n  }\n  {bone "turret"\n    {limits -27 27}\n    {speed 0.01}\n  }\n  {bone "mgun2"\n    {limits 15}\n    {speed2 80}\n  }\n  {bone "sock"\n    {limits 15}\n  }\n  {bone "sock2"\n    {limits 10 20}\n  }\n  {bone "bare"\n    {limits}\n  }\n}\n');
put('as2/resource/entity/vl/vl.mdl', dmdl('vl'));
const outL = path.join(root, 'outL'), rL = run(['--entity', 'rl', '--donor', 'vl', '--rep-key', '--out', outL]), ltx = wtxt('outL', 'rl');
t('FXD-1 rule 1: one value on a revolute bone removed (speed2 kept), warned WARN_PORT_LIMITS_ARITY', rL.status === 0 && !/\{limits 15\}\s*\{speed2/.test(ltx) && /\{bone "mgun2"\s*\{speed2 80\}/.test(ltx) && /WARN_PORT_LIMITS_ARITY[^\r\n]*mgun2/.test(rL.stdout), rL.stdout + rL.stderr + ltx);
t('FXD-1 rule 1: legal forms stay (revolute pair, socket one value, bare limits); two values on a socket removed', /\{limits -27 27\}/.test(ltx) && /\{bone "sock"\s*\{limits 15\}/.test(ltx) && /\{bone "bare"\s*\{limits\}/.test(ltx) && !/10 20/.test(ltx) && !/\{bone "mgun"/.test(ltx) && (rL.stdout.match(/WARN_PORT_LIMITS_ARITY/g) || []).length === 3 && !/ERR_DEF_READER/.test(rL.stdout), rL.stdout + ltx);
// ---- FXD-1 rule 2: the parse check on every def written. unit: checkDef codes; build: a donor def the tool cannot repair (speed 0, unclosed block) fails with ERR_DEF_READER and a non-zero exit
const { checkDef } = require('../defcheck'), tys = new Map([['r', 'revolute'], ['s', 'socket'], ['p', '']]);
const cd = x => checkDef(x, tys).map(f => f.msg).join(' | ');
t('FXD-1 rule 2 unit: revolute lone value, socket pair, plain-bone speed2, zero speed, unclosed block, stray }, open string all reported', /Number expected/.test(cd('{bone "r" {limits 15}}')) && /Block terminator/.test(cd('{bone "s" {limits 1 2}}')) && /plain/.test(cd('{bone "p" {speed2 5}}')) && /Zero speed/.test(cd('{bone "r" {speed 0}}')) && /unclosed/.test(cd('{a {b}')) && /stray/.test(cd('{a}}')) && /unterminated/.test(cd('{a "x}')), cd('{bone "r" {limits 15}}'));
t('FXD-1 rule 2 unit: legal def gives nothing (pair, cone, bare, speed, unknown bone, bare limits on plain)', cd('{bone "r" {limits -1 1} {speed 0.1}}{bone "s" {limits 5}}{bone "r" {limits}}{bone "zz" {limits 3 4}}') === '' && /absent from the mdl/.test(cd('{bone "zz" {limits 3}}')), cd('{bone "r" {limits -1 1} {speed 0.1}}{bone "s" {limits 5}}{bone "r" {limits}}{bone "zz" {limits 3 4}}'));
put('as2/resource/entity/vz/vz.def', '{game_entity\n  {Extension "vz.mdl"}\n  {bone "turret"\n    {speed 0}\n  }\n  {Weaponry\n}\n');
put('as2/resource/entity/vz/vz.mdl', dmdl('vz'));
const rZ = run(['--entity', 'rl', '--donor', 'vz', '--rep-key', '--out', path.join(root, 'outZ3')]);
t('FXD-1 rule 2 build: unreadable def -> ERR_DEF_READER with line, exit non-zero', rZ.status !== 0 && /ERR_DEF_READER[^\r\n]*Zero speed/.test(rZ.stdout) && /ERR_DEF_READER[^\r\n]*Block terminator/.test(rZ.stdout), 'status ' + rZ.status + '\n' + rZ.stdout + rZ.stderr);
{   // BUILD-GATE job 3: the exit-1 reason is the last output line (a 3-line tail shows it); a stray ")" (SDL-16 [V], dropped silently by the reader) is a warning, not a stop (case blitz3_6eng, lancia)
  const last = rZ.stdout.split(/\r?\n/).filter(Boolean).pop() || '';
  t('BUILD-GATE: exit non-zero prints a last line "exit 1: N ERR_DEF_READER, first: <def>:<line> <msg>"', /^exit 1: \d+ ERR_DEF_READER, first: \S+:\d+ /.test(last), 'last: ' + last);
  put('as2/resource/entity/vp/vp.def', '{game_entity\n  {Extension "vp.mdl"}\n  {Weaponry\n  )\n  }\n}\n');
  put('as2/resource/entity/vp/vp.mdl', dmdl('vp'));
  const rP = run(['--entity', 'rl', '--donor', 'vp', '--rep-key', '--out', path.join(root, 'outP3')]);
  t('BUILD-GATE: a stray ")" in a donor def is WARN_PAREN_STRAY, exit 0, no ERR_DEF_READER', rP.status === 0 && /WARN_PAREN_STRAY/.test(rP.stdout) && !/ERR_DEF_READER/.test(rP.stdout) && !/^exit 1:/m.test(rP.stdout), 'status ' + rP.status + '\n' + rP.stdout + rP.stderr);
}
// ---- FXD-1 rule 3: filling type follows the rep. donor vq is HE-loaded (fg), vanilla bullet90 has ap; rep ra loads ap, rh2 loads he
put('as2/resource/entity/vq/vq.def', '{game_entity\n  {Extension "vq.mdl"}\n  {extender "inventory"\n    {box\n      {item "ammo bullet90 fg" 30}\n    }\n  }\n  {Weaponry\n    {place "gun"\n      {weapon "90mm_bb" filling "ammo bullet90 fg" 1}\n    }\n  }\n}\n');
put('as2/resource/entity/vq/vq.mdl', dmdl('vq'));
for (const [r, ty] of [['ra', 'ap'], ['rh2', 'he']]) {
  put(`goh/resource/entity/${r}/${r}.def`, `{game_entity\n  {Extension "${r}.mdl"}\n  {Weaponry\n    {place "gun"\n      {weapon "90mm_rr" filling "ammo bullet90 ${ty}" 1}\n    }\n  }\n}\n`);
  put(`goh/resource/entity/${r}/${r}.mdl`, dmdl(r));
}
const rA3 = run(['--entity', 'ra', '--donor', 'vq', '--rep-key', '--match-weapon', '--out', path.join(root, 'outA3')]), a3 = wtxt('outA3', 'ra');
t('FXD-1 rule 3: AP-loaded rep on an HE-loaded donor -> filling ap, ap item line added, WARN_PORT_FILLING_AP', rA3.status === 0 && /filling "ammo bullet90 ap"/.test(a3) && /\{item "ammo bullet90 ap" 20\}/.test(a3) && /\{item "ammo bullet90 fg" 30\}/.test(a3) && /WARN_PORT_FILLING_AP/.test(rA3.stdout), rA3.stdout + rA3.stderr + a3);
const rH3 = run(['--entity', 'rh2', '--donor', 'vq', '--rep-key', '--match-weapon', '--out', path.join(root, 'outH3')]), h3 = wtxt('outH3', 'rh2');
t('FXD-1 rule 3 control: HE-loaded rep keeps fg, warned WARN_PORT_FILLING_HE only', rH3.status === 0 && /filling "ammo bullet90 fg"/.test(h3) && !/bullet90 ap/.test(h3) && /WARN_PORT_FILLING_HE/.test(rH3.stdout) && !/WARN_PORT_FILLING_AP/.test(rH3.stdout), rH3.stdout + rH3.stderr + h3);
{ // ---- SILENT-1F: AA donor (pz38t on m19). AP rep -> no zenite left, item line without "ammo " too, muzzle_minimum. A rep that loads zenite keeps all of it
  put('as2/resource/entity/vz2/vz2.def', '{game_entity\n  {Extension "vz2.mdl"}\n  {props "medium" "flak" "muzzle_zenite"}\n  {extender "inventory"\n    {box\n      {item "bullet90 zenite" 320}\n    }\n  }\n  {Weaponry\n    {place "gun"\n      {weapon "90mm_bb" filling "ammo bullet90 zenite" 14}\n    }\n  }\n}\n');
  put('as2/resource/entity/vz2/vz2.mdl', dmdl('vz2'));
  put('goh/resource/entity/rz/rz.def', '{game_entity\n  {Extension "rz.mdl"}\n  {Weaponry\n    {place "gun"\n      {weapon "90mm_rr" filling "ammo bullet90 zenite" 1}\n    }\n  }\n}\n');
  put('goh/resource/entity/rz/rz.mdl', dmdl('rz'));
  const rZa = run(['--entity', 'ra', '--donor', 'vz2', '--rep-key', '--match-weapon', '--out', path.join(root, 'outZa')]), za = wtxt('outZa', 'ra');
  t('SILENT-1F: AP rep on an AA donor -> no zenite line, filling and item ap, muzzle_minimum, warned', rZa.status === 0 && !/zenite/i.test(za) && /filling "ammo bullet90 ap"/.test(za) && /\{item "bullet90 ap" 320\}/.test(za) && /"muzzle_minimum"/.test(za) && /"flak"/.test(za) && /WARN_PORT_FILLING_AP/.test(rZa.stdout), rZa.stdout + rZa.stderr + za);
  const rZz = run(['--entity', 'rz', '--donor', 'vz2', '--rep-key', '--match-weapon', '--out', path.join(root, 'outZz')]), zz = wtxt('outZz', 'rz');
  t('SILENT-1F control: AA rep on an AA donor keeps zenite and muzzle_zenite', rZz.status === 0 && /filling "ammo bullet90 zenite"/.test(zz) && /"muzzle_zenite"/.test(zz), rZz.stdout + rZz.stderr + zz);
}
// ---- FXD-3 rule 1: donor weapon names with no calibre (vk: two MG places "mgx" + ammo item) and a weapon only in an include (vi). vanilla: gun 57mm_oo (bullet57), 76mm_ii, mgun mgx. reps: rk57 57 mm gun, rmg14 14 mm MG, rmgq MG-only (no calibre)
put('as2/resource/entity/vk/vk.def', '{game_entity\n  {Extension "vk.mdl"}\n  {item "ammo mgx" 100}\n  {Weaponry\n    {place "a"\n      {weapon "mgx" filled}\n    }\n    {place "b"\n      {weapon "mgx" filled}\n    }\n  }\n}\n');
put('as2/resource/entity/vk/vk.mdl', dmdl('vk'));
put('as2/resource/set/stuff/mgun/mgx', '{from "pattern mgun"\n\t{filling "ammo mgx"}\n}\n');
put('as2/resource/set/stuff/gun/57mm_oo', '{from "pattern gun"\n\t{filling "bullet57"}\n}\n');
put('as2/resource/set/stuff/gun/76mm_ii', '{from "pattern gun"\n\t{filling "bullet76"}\n}\n');
put('as2/resource/entity/vi/vi.def', '{game_entity\n  {Extension "vi.mdl"}\n  (include "wpn.inc")\n}\n');
put('as2/resource/entity/vi/vi.mdl', dmdl('vi'));
put('as2/resource/entity/vi/wpn.inc', '{Weaponry\n  {place "gun"\n    {weapon "76mm_ii" filled}\n  }\n}\n');
for (const [r, nm, cl] of [['rk57', '57mm_rk', 'gun'], ['rmg14', '14mm_mg', 'mgun'], ['rmgq', 'mgq', 'mgun']]) {
  put(`goh/resource/entity/${r}/${r}.def`, `{game_entity\n  {Extension "${r}.mdl"}\n  {Weaponry\n    {place "gun"\n      {weapon "${nm}" filled}\n    }\n  }\n}\n`);
  put(`goh/resource/entity/${r}/${r}.mdl`, dmdl(r));
  put(`goh/resource/set/stuff/${cl}/${nm}`, `{from "pattern ${cl}"}\n`);
}
const rK = run(['--entity', 'rk57', '--donor', 'vk', '--rep-key', '--match-weapon', '--out', path.join(root, 'outK')]), ktx = wtxt('outK', 'rk57');
t('FXD-3 rule 1a: donor MG with no calibre in its name, 57 mm rep -> first place gets the vanilla 57 mm gun, the second keeps the MG', rK.status === 0 && /\{weapon "57mm_oo" filled\}/.test(ktx) && (ktx.match(/\{weapon "mgx" filled\}/g) || []).length === 1 && /WARN_PORT_WEAPON_SWAPPED/.test(rK.stdout), rK.stdout + rK.stderr + ktx);
t('FXD-3 rule 1a: the new gun gets its round (item added after the MG ammo line, MG ammo kept)', /\{item "ammo mgx" 100\}/.test(ktx) && /\{item "ammo bullet57" 30\}/.test(ktx), ktx);
const rK0 = run(['--entity', 'rmg14', '--donor', 'vk', '--rep-key', '--match-weapon', '--out', path.join(root, 'outK0')]), k0 = wtxt('outK0', 'rmg14');
t('FXD-3 rule 1a control: MG rep (14 mm, same class) on an MG donor -> nothing swapped, no calibre warning', rK0.status === 0 && (k0.match(/\{weapon "mgx" filled\}/g) || []).length === 2 && !/WARN_PORT_(WEAPON_SWAPPED|CALIBRE|CANNON_ON_MG)/.test(rK0.stdout), rK0.stdout + rK0.stderr + k0);
const rI = run(['--entity', 'rk57', '--donor', 'vi', '--rep-key', '--match-weapon', '--out', path.join(root, 'outI')]), itx = wtxt('outI', 'rk57');
t('FXD-3 rule 1b: weapon only in an include -> include inlined, weapon swapped to 57 mm, both warned', rI.status === 0 && !/wpn\.inc/.test(itx) && /\{weapon "57mm_oo" filled\}/.test(itx) && !/76mm_ii/.test(itx) && /WARN_PORT_WEAPON_INLINED/.test(rI.stdout) && /WARN_PORT_WEAPON_SWAPPED/.test(rI.stdout), rI.stdout + rI.stderr + itx);
const rI0 = run(['--entity', 'rk57', '--donor', 'vi', '--rep-key', '--out', path.join(root, 'outI0')]);
t('FXD-3 rule 1b control (no --match-weapon): include left alone', rI0.status === 0 && /wpn\.inc/.test(wtxt('outI0', 'rk57')) && !/WARN_PORT_WEAPON_INLINED/.test(rI0.stdout), rI0.stdout);
// rule 1c: cannon (57mm_oo in vd) left on an MG-only rep
put('as2/resource/entity/vd/vd.def', '{game_entity\n  {Extension "vd.mdl"}\n  {Weaponry\n    {place "gun"\n      {weapon "57mm_oo" filled}\n    }\n  }\n}\n');
put('as2/resource/entity/vd/vd.mdl', dmdl('vd'));
const rCm = run(['--entity', 'rmgq', '--donor', 'vd', '--rep-key', '--match-weapon', '--out', path.join(root, 'outCm')]);
t('FXD-3 rule 1c: cannon kept on an MG-only rep -> WARN_PORT_CANNON_ON_MG (calibre check fails)', rCm.status === 0 && /WARN_PORT_CANNON_ON_MG[^\r\n]*CALIBRE CHECK FAILS|CALIBRE CHECK FAILS[^\r\n]*57mm_oo/.test(rCm.stdout) && /WARN_PORT_CANNON_ON_MG/.test(rCm.stdout), rCm.stdout + rCm.stderr);
const rCg = run(['--entity', 'rk57', '--donor', 'vd', '--rep-key', '--match-weapon', '--out', path.join(root, 'outCg')]);
t('FXD-3 rule 1c control: a cannon rep with the cannon donor -> no warning', rCg.status === 0 && !/WARN_PORT_CANNON_ON_MG/.test(rCg.stdout), rCg.stdout);
// ---- FXD-3 rule 2: .ebm Frame textures. rep rb folder: sup.ebm (frames sz2 [GoH has it] + gone [nobody]), lost.ebm (gone only), van.ebm (a texture only vanilla has). vs donor is plain.
put('as2/resource/entity/vs/vs.def', '{game_entity\n  {Extension "vs.mdl"}\n}\n');
put('as2/resource/entity/vs/vs.mdl', dmdl('vs'));
put('as2/resource/texture/common/service/van.dds', 'DDS ');
put('goh/resource/entity/rb/rb.def', '{game_entity\n  {Extension "rb.mdl"}\n}\n');
put('goh/resource/entity/rb/rb.mdl', dmdl('rb'));
put('goh/resource/entity/rb/sup.ebm', '{bitmap\n\t{Axis  1024 1024 }\n\t{Frame "$/service/sz2.dds"}\n\t{Frame "$/service/gone.dds"}\n}\n');
put('goh/resource/entity/rb/lost.ebm', '{bitmap\n\t{Frame "$/service/gone.dds"}\n}\n');
put('goh/resource/entity/rb/van.ebm', '{bitmap\n\t{Frame "$/service/van.dds"}\n}\n');
put('goh/resource/texture/common/service/sz2.dds', 'DDS ');
const rE = run(['--entity', 'rb', '--donor', 'vs', '--rep-key', '--out', path.join(root, 'outE')]), supx = (rd('outE/resource/entity/rb/sup.ebm') || '').toString('latin1');
t('FXD-3 rule 2: a frame texture GoH has is pulled into the output', rE.status === 0 && ex('outE/resource/texture/common/service/sz2.dds'), rE.stdout + rE.stderr);
t('FXD-3 rule 2: a frame nobody has is removed from the ebm (other frame kept), warned', /sz2\.dds/.test(supx) && !/gone\.dds/.test(supx) && /WARN_PORT_EBM_FRAME_DROPPED/.test(rE.stdout), supx + rE.stdout);
t('FXD-3 rule 2: an ebm whose every frame is missing is not written, warned WARN_PORT_EBM_DROPPED', !ex('outE/resource/entity/rb/lost.ebm') && /WARN_PORT_EBM_DROPPED/.test(rE.stdout), rE.stdout);
t('FXD-3 rule 2: a frame only vanilla AS2 has is left alone (ebm written whole, no dds copied)', ex('outE/resource/entity/rb/van.ebm') && !ex('outE/resource/texture/common/service/van.dds'), rE.stdout);
console.log(fail ? `${fail} FAILED (donor)` : 'donor: all ok');
process.exit(fail ? 1 : 0);

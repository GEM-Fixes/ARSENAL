// GOH2-FX tests, invented fixtures only (seeded defects marked):
//  1 fx closure: {sprite "$/x"} -> texture/fx/x, "{##+ sprite", "/texture/.." rooted; .ebm frames, nested frame .ebm, {reference}; ';' frame lines ignored;
//    a sprite vanilla AS2 has is left to AS2; seeded: a sprite in neither -> WARN_PORT_FX_TEX_MISSING, a frame in neither -> WARN_PORT_EBM_FRAME_DROPPED
//  2 TEXKEY_RENAMED keeps a trailing _N last (attack_00 -> attack_goh_00) and a pulled .ebm names the renamed frame
//  3 --mod <AS2>/mods/<name> is allowed; <AS2>/resource and a mods link (junction) into GoH are refused
//  4 pot2lng: .pot msgctxt row -> .lng slot, UTF-8 kept; seeded: unknown ctx exits 2
//  5 wav2story: GoH wav -> sound/<key>.wav; seeded: a non-WAVE file exits 2
//  6 anmswap: one anm under each listed name, bytes equal; a name vanilla lacks is warned
// run via run.sh.
// Author: Imperator_Aug (ARSENAL, ia-801a4f97)
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const root = path.join(__dirname, 'fixture', 'gohfx');
fs.rmSync(root, { recursive: true, force: true });
let fail = 0;
const t = (name, good, extra) => { console.log((good ? 'ok   ' : 'FAIL ') + 'gohfx: ' + name + (good || extra === undefined ? '' : '  ' + String(extra).slice(0, 600))); if (!good) fail++; };
const put = (rel, data) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, typeof data === 'string' ? Buffer.from(data.replace(/\r?\n/g, '\r\n'), 'latin1') : data); };
const ex = rel => fs.existsSync(path.join(root, rel));
const rd = rel => { try { return fs.readFileSync(path.join(root, rel), 'latin1'); } catch { return null; } };
const tool = path.join(__dirname, '..', 'goh2as2.js');
const run = args => cp.spawnSync(process.execPath, [tool, ...args], { encoding: 'utf8' });
const GOH = path.join(root, 'goh'), AS2 = path.join(root, 'as2');
const tga = s => Buffer.concat([Buffer.alloc(18), Buffer.from(s)]);

// ---- GoH tree
put('goh/resource/entity/fx/weapon/fx1.def', `{game_entity
  {sprite "$/explosion/e1"}
  {particles {##+ sprite "$/smoke/s1"}}
  {sprite "/texture/fx/flash/sw"}
  {sprite "$/flash/van"}
  {sprite "$/gone/nothere"}
}
`);
put('goh/resource/texture/fx/explosion/e1.ebm', `{bitmap
\t;{Frame  "e1/f_00.tga" 5 }
\t{Frame  "e1/f_01.tga" 5 }
\t{Frame  "e1/f_02.tga" 5 }
\t{Frame  "nest.ebm" 5 }
\t{Frame  "e1/f_99.tga" 5 }
}
`);
put('goh/resource/texture/fx/explosion/e1/f_01.tga', tga('goh f01'));
put('goh/resource/texture/fx/explosion/e1/f_02.tga', tga('goh f02'));
put('goh/resource/texture/fx/explosion/nest.ebm', '{bitmap\n\t{Frame "n/a_01.tga" 5}\n}\n');
put('goh/resource/texture/fx/explosion/n/a_01.tga', tga('nested'));
put('goh/resource/texture/fx/smoke/s1.ebm', '{reference "s1r"}\n');
put('goh/resource/texture/fx/smoke/s1r.dds', Buffer.from('DDS ' + 'x'.repeat(130)));
put('goh/resource/texture/fx/flash/sw.tga', tga('shock'));
put('goh/resource/texture/fx/flash/van.tga', tga('goh van'));
put('goh/resource/interface/scene/panel_control/attack_00.tga', tga('goh attack'));
put('goh/resource/sound/mission/x/00.wav', Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVEfmt '), Buffer.alloc(8)]));
put('goh/resource/sound/mission/x/notwav.wav', Buffer.from('OggS not a wave file'));
put('goh/resource/properties/animation/human/surrender.anm', Buffer.from('ANIMgohsurrender'));
put('goh/resource/localizations/default/interface/text/hints.pot', Buffer.from('msgid ""\nmsgstr ""\n\nmsgctxt "hints/win"\nmsgid "<f(roboto_mono)s(18)>Your team "\n"is winning! Über"\nmsgstr ""\n', 'utf8'));
// ---- vanilla AS2 tree
put('as2/resource/texture/fx/flash/van.tga', tga('as2 van'));
put('as2/resource/texture/fx/explosion/e1/f_01.tga', tga('as2 f01 other bytes'));
put('as2/resource/interface/scene/panel_control/attack_00.tga', tga('as2 attack'));
put('as2/resource/properties/animation/human/stand_idle.anm', Buffer.from('ANIMvanilla'));
fs.mkdirSync(path.join(AS2, 'mods'), { recursive: true });

// 1+2 fx closure into a mod under <AS2>/mods (3a)
const M = 'as2/mods/fx_t', MR = M + '/resource/';
let r = run(['--goh', GOH, '--game', AS2, '--entity', 'entity/fx/weapon/fx1.def', '--mod', path.join(root, M), '--no-keylint', '--no-rc']);
const out = (r.stdout || '') + (r.stderr || '');
t('3 --mod <AS2>/mods/<name> accepted', r.status === 0 && ex(M + '/mod.info'), out);
t('1 $/ sprite ebm pulled', ex(MR + 'texture/fx/explosion/e1.ebm'));
t('1 its frame pulled', ex(MR + 'texture/fx/explosion/e1/f_02.tga'));
t('1 nested frame .ebm and its frame pulled', ex(MR + 'texture/fx/explosion/nest.ebm') && ex(MR + 'texture/fx/explosion/n/a_01.tga'));
t('1 {##+ sprite} and {reference} followed', ex(MR + 'texture/fx/smoke/s1.ebm') && ex(MR + 'texture/fx/smoke/s1r.dds'));
t('1 rooted /texture/ sprite pulled', ex(MR + 'texture/fx/flash/sw.tga'));
t('1 sprite vanilla AS2 has is left to AS2', !ex(MR + 'texture/fx/flash/van.tga') && /1 left to vanilla AS2/.test(out), out);
t('1 seeded: sprite in neither game warned', /WARN_PORT_FX_TEX_MISSING/.test(out) && /gone\/nothere/.test(out), out);
t('1 seeded: frame in neither game dropped by name', /WARN_PORT_EBM_FRAME_DROPPED/.test(out) && /f_99/.test(out) && !/f_99/.test(rd(MR + 'texture/fx/explosion/e1.ebm') || 'f_99'), out);
t('1 commented frame is no reference (no warning, line kept)', !/f_00\.tga.*(DROPPED|MISSING)|(DROPPED|MISSING).*f_00\.tga/.test(out) && /;\{Frame {2}"e1\/f_00\.tga"/.test(rd(MR + 'texture/fx/explosion/e1.ebm') || ''), rd(MR + 'texture/fx/explosion/e1.ebm'));
t('2 clashing frame renamed with _N last', ex(MR + 'texture/fx/explosion/e1/f_goh_01.tga') && !ex(MR + 'texture/fx/explosion/e1/f_01.tga') && !ex(MR + 'texture/fx/explosion/e1/f_01_goh.tga'));
t('2 pulled .ebm names the renamed frame', /"e1\/f_goh_01\.tga"/.test(rd(MR + 'texture/fx/explosion/e1.ebm') || ''), rd(MR + 'texture/fx/explosion/e1.ebm'));
// 2 button set: attack_00 -> attack_goh_00
put('keys.txt', 'interface/scene/panel_control/attack_00.tga\n');
r = run(['--goh', GOH, '--game', AS2, '--keys', path.join(root, 'keys.txt'), '--out', path.join(root, 'kout'), '--no-keylint', '--no-rc']);
t('2 button tga renamed attack_goh_00', ex('kout/resource/interface/scene/panel_control/attack_goh_00.tga') && /TEXKEY_RENAMED/.test(r.stdout), r.stdout + r.stderr);
// 3 refusals
r = run(['--goh', GOH, '--game', AS2, '--entity', 'entity/fx/weapon/fx1.def', '--out', path.join(AS2, 'resource', 'x'), '--no-keylint', '--no-rc']);
t('3 seeded: --out in AS2 resource refused', r.status === 2 && !ex('as2/resource/x'), r.stderr);
let jn = false; try { fs.symlinkSync(path.join(GOH, 'resource'), path.join(AS2, 'mods', 'linked'), 'junction'); jn = true; } catch { /* no junctions here */ }
if (jn) {
  r = run(['--goh', GOH, '--game', AS2, '--entity', 'entity/fx/weapon/fx1.def', '--mod', path.join(AS2, 'mods', 'linked', 'sub'), '--no-keylint', '--no-rc']);
  t('3 seeded: mods link into GoH refused', r.status === 2 && !ex('goh/resource/sub'), r.stderr);
  fs.unlinkSync(path.join(AS2, 'mods', 'linked'));
} else console.log('skip gohfx: 3 junction (cannot make one here)');

// 4 pot2lng
fs.mkdirSync(path.join(root, 'mod4'), { recursive: true });
r = run(['pot2lng', '--goh', GOH, '--pot', 'localizations/default/interface/text/hints.pot', '--ctx', 'hints/win', path.join(root, 'mod4'), '--file', '#gohfx.lng', '--key', 'hints/slowdown/fast', '--game', AS2]);
const lf = (() => { const f = []; const w = d => { for (const x of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, x.name); if (x.isDirectory()) w(p); else if (/\.lng$/.test(x.name)) f.push(p); } }; w(path.join(root, 'mod4')); return f; })();
const lng = lf.length ? fs.readFileSync(lf[0], 'utf8') : '';
t('4 pot row in the .lng slot, UTF-8', r.status === 0 && /"fast"\s+"<f\(roboto_mono\)s\(18\)>Your team is winning! Über"/.test(lng), r.stdout + r.stderr + lng);
r = run(['pot2lng', '--goh', GOH, '--pot', 'localizations/default/interface/text/hints.pot', '--ctx', 'hints/none', path.join(root, 'mod4'), '--file', '#gohfx.lng', '--key', 'hints/x', '--game', AS2]);
t('4 seeded: unknown msgctxt exits 2', r.status === 2 && /X_NO_ROW/.test(r.stderr), r.stderr);

// 5 wav2story
fs.mkdirSync(path.join(root, 'mod5'), { recursive: true });
r = run(['wav2story', '--goh', GOH, '--wav', 'sound/mission/x/00.wav', path.join(root, 'mod5'), '--key', 'mission/multi/edrun_test/story']);
t('5 wav at the story key', r.status === 0 && rd('mod5/resource/sound/mission/multi/edrun_test/story.wav') === rd('goh/resource/sound/mission/x/00.wav'), r.stdout + r.stderr);
r = run(['wav2story', '--goh', GOH, '--wav', 'sound/mission/x/notwav.wav', path.join(root, 'mod5'), '--key', 'mission/multi/edrun_test/bad']);
t('5 seeded: non-WAVE refused', r.status === 2 && /X_NOT_WAV/.test(r.stderr) && !ex('mod5/resource/sound/mission/multi/edrun_test/bad.wav'), r.stderr);

// 6 anmswap
fs.mkdirSync(path.join(root, 'mod6'), { recursive: true });
put('names.txt', 'properties/animation/human/stand_idle.anm\n# comment\nresource/properties/animation/human/not_vanilla.anm\n');
r = run(['anmswap', '--goh', GOH, '--anm', 'properties/animation/human/surrender.anm', '--names', path.join(root, 'names.txt'), path.join(root, 'mod6'), '--game', AS2]);
t('6 anm under both names, bytes equal', r.status === 0 && rd('mod6/resource/properties/animation/human/stand_idle.anm') === 'ANIMgohsurrender' && rd('mod6/resource/properties/animation/human/not_vanilla.anm') === 'ANIMgohsurrender', r.stdout + r.stderr);
t('6 seeded: name vanilla lacks warned', /WARN_X_NAME_NOT_VANILLA properties\/animation\/human\/not_vanilla\.anm/.test(r.stdout) && !/WARN_X_NAME_NOT_VANILLA properties\/animation\/human\/stand_idle/.test(r.stdout), r.stdout);

console.log(fail ? `gohfx: ${fail} FAIL` : 'gohfx: pass');
process.exit(fail ? 1 : 0);

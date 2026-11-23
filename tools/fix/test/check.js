// fix test: runs fix.js on the seeded fixture and asserts (see truth.md). prints ASSERT lines on failure.
// Author: Imperator_Aug (ARSENAL, ia-185f2c82)
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const T = __dirname, FX = path.join(process.env.TEST_WORK || T, 'fx'), G = path.join(FX, 'game'), FIX = path.join(T, '..', 'fix.js');
const C = require('../../modmove/lib/common');
let bad = 0;
const ok = (c, m) => { if (!c) { bad++; console.log('ASSERT ' + m); } };
const run = (args) => { const r = cp.spawnSync(process.execPath, [FIX, ...args, '--game', G, '--cache', path.join(FX, 'rc.json')], { encoding: 'utf8' }); return (r.stdout || '') + (r.stderr || ''); };
const rd = f => fs.readFileSync(path.join(FX, f));
const files = d => fs.existsSync(path.join(FX, d)) ? C.walk(path.join(FX, d)).sort() : [];
const mods = path.join(G, 'mods');

const h1 = C.treeHash(path.join(mods, 'm1')), h2 = C.treeHash(path.join(mods, 'm2'));

// plan writes nothing
let o = run([path.join(mods, 'm1'), 'plan', '--out', path.join(FX, 'out-plan')]);
ok(!fs.existsSync(path.join(FX, 'out-plan')), 'plan wrote the out folder');
ok(/CHANGED: 2 file/.test(o) && /\(plan: nothing written\)/.test(o), 'plan did not list 2 changes: ' + o.split('\n').find(l => /^CHANGED/.test(l)));

// m1 loose: lng merge + 1-candidate repoint, 2-candidate refused
o = run([path.join(mods, 'm1'), 'apply', '--out', path.join(FX, 'out-m1')]);
ok(/READ 7 mod files \+ 0 paks/.test(o), 'm1 READ line: ' + o.split('\n').find(l => /^READ/.test(l)));
ok(files('out-m1').join() === 'localization/desc.lng,mod.info,resource/entity/m1/m1a.mtl', 'm1 out files: ' + files('out-m1'));
ok(/FIX_REPOINT_AMBIGUOUS .*tex_dup.*2 candidates/.test(o), 'm1 2-candidate repoint not refused');
ok(/VERDICT: partial, untested/.test(o), 'm1 verdict');
const l1 = rd('out-m1/localization/desc.lng');
ok(l1[0] === 0xEF && l1[1] === 0xBB && l1[2] === 0xBF, 'BOM of the mod file lost');
const t1 = l1.toString('utf8');
ok(t1.includes('Окей') && t1.includes('"own" "Own"'), 'mod keys changed');
ok(t1.includes('"two" "Two \\"q\\""') && t1.includes('"rifle1" "Rifle"'), 'vanilla keys not merged (escapes?)');
ok(!/[^\r]\n/.test(t1), 'line endings not CRLF');
const mt = rd('out-m1/resource/entity/m1/m1a.mtl').toString('latin1').split('\r\n');
ok(mt[1] === '\t{diffuse "/entity/other/tex_unique"}' && mt[2] === '\t{bump "tex_dup"}', 'mtl edit: ' + JSON.stringify(mt));
ok(/\{Require "m1"\}/.test(rd('out-m1/mod.info').toString('latin1')) && /MinGameVersion "3.262.1"/.test(rd('out-m1/mod.info').toString('latin1')), 'mod.info Require/Min');
ok(C.treeHash(path.join(mods, 'm1')) === h1, 'source m1 changed');

// m2 packed (resource.pak + localization.pak)
o = run([path.join(mods, 'm2'), 'apply', '--out', path.join(FX, 'out-m2')]);
ok(/READ 7 mod files \+ 2 paks/.test(o), 'm2 READ line (packed read): ' + o.split('\n').find(l => /^READ/.test(l)));
ok(files('out-m2').join() === 'localization/desc.lng,mod.info,resource/entity/m2/m2a.mtl,resource/set/stuff/rifle2', 'm2 out files: ' + files('out-m2'));
ok(/"tex1" -> "\/entity\/ok\/tex1"/.test(o) && /"shot_unique" -> "weapon\/shot\/snd\/shot_unique"/.test(o), 'm2 repoints');
ok(/VERDICT: static clean, untested/.test(o), 'm2 verdict');
ok(rd('out-m2/localization/desc.lng').toString().includes('"two" "Two'), 'm2 packed lng merge');
ok(C.treeHash(path.join(mods, 'm2')) === h2, 'source m2 changed');

// m3: nothing to fix
o = run([path.join(mods, 'm3'), 'apply', '--out', path.join(FX, 'out-m3')]);
ok(/CHANGED: 0 file/.test(o) && !fs.existsSync(path.join(FX, 'out-m3')), 'm3 should change nothing and create nothing');

// gate: --set that adds a code is refused, a clean one passes
const def = 'resource/entity/m1/m1a.def';
o = run([path.join(mods, 'm1'), 'apply', '--out', path.join(FX, 'out-set'), '--only', 'set', '--set', `${def}:game_entity/Extension="gone.mdl"`]);
ok(/FIX_GATE_REVERTED/.test(o) && /CHANGED: 0 file/.test(o), 'gate did not revert an edit adding REF_MODEL_MISSING: ' + o.split('\n').filter(l => /GATE|CHANGED/.test(l)).join(' | '));
ok(!fs.existsSync(path.join(FX, 'out-set')), 'reverted-only run left a folder');
o = run([path.join(mods, 'm1'), 'apply', '--out', path.join(FX, 'out-set'), '--only', 'set', '--set', `${def}:game_entity/Chassis/Locomotion/TurnTime#1=6`]);
ok(/CHANGED: 1 file/.test(o) && /set .*m1a\.def/.test(o), 'good --set rejected: ' + o);
const d2 = rd('out-set/' + def).toString('latin1'), d1 = rd('game/mods/m1/' + def).toString('latin1');
ok(d1.replace('{TurnTime 5}', '{TurnTime 6}') === d2, 'set edit is not byte-exact');
// set on a vanilla file (copied whole from its layer)
o = run([path.join(mods, 'm1'), 'apply', '--out', path.join(FX, 'out-set2'), '--only', 'set', '--set', 'resource/entity/ok/ok.def:game_entity/Chassis/Locomotion/TurnTime#1=7']);
ok(/CHANGED: 1 file/.test(o) && fs.existsSync(path.join(FX, 'out-set2/resource/entity/ok/ok.def')), 'set on vanilla file: ' + o);
// --set on a file the repoint fixer also edits composes on the repointed bytes: one file, both edits, no FIX_EDIT_CONFLICT
o = run([path.join(mods, 'm1'), 'apply', '--out', path.join(FX, 'out-set3'), '--only', 'repoint,set', '--set', 'resource/entity/m1/m1a.mtl:material/bump="/entity/ok/tex1"']);
const m3t = fs.existsSync(path.join(FX, 'out-set3/resource/entity/m1/m1a.mtl')) ? rd('out-set3/resource/entity/m1/m1a.mtl').toString('latin1') : '';
ok(!/FIX_EDIT_CONFLICT/.test(o) && m3t.includes('{diffuse "/entity/other/tex_unique"}') && m3t.includes('{bump "/entity/ok/tex1"}'), 'set + repoint on one file did not compose: ' + o.split('\n').filter(l => /CONFLICT|REVERT|CHANGED/.test(l)).join(' | '));

// out refusals
for (const [out, name] of [[path.join(mods, 'm1', 'sub'), 'inside the mod'], [path.join(mods, 'm1'), 'equal to the mod'], [path.join(G, 'resource', 'p'), 'inside vanilla data'], [G, 'the game dir'], [path.dirname(G), 'ancestor of the game'], [path.join(G, 'localization')]]) {
  o = run([path.join(mods, 'm1'), 'apply', '--out', out]);
  ok(/FIX_OUT_REFUSED/.test(o) && /CHANGED: 0 file/.test(o), `--out ${name || out} not refused`);
}
// writeguard (I-5, I-12): another game's resource/ and a GoH dir, both found by content though --game is G; out = a file
fs.mkdirSync(path.join(FX, 'gameB', 'resource'), { recursive: true }); fs.writeFileSync(path.join(FX, 'gameB', 'as64.exe'), '');
fs.mkdirSync(path.join(FX, 'gohB', 'binaries', 'x64'), { recursive: true }); fs.writeFileSync(path.join(FX, 'gohB', 'binaries', 'x64', 'call_to_arms.exe'), '');
fs.writeFileSync(path.join(FX, 'afile.txt'), 'x');
for (const [out, re] of [[path.join(FX, 'gameB', 'resource', 'p'), /game folder/], [path.join(FX, 'gohB', 'resource', 'p'), /Gates of Hell/], [path.join(FX, 'afile.txt'), /is a file, not a folder/]]) {
  o = run([path.join(mods, 'm1'), 'apply', '--out', out]);
  ok(/FIX_OUT_REFUSED/.test(o) && re.test(o) && !/ENOTDIR|at .*\.js:\d+/.test(o) && !fs.existsSync(path.join(FX, 'gohB', 'resource')) && !fs.existsSync(path.join(FX, 'gameB', 'resource', 'p')), `--out ${out} not refused plainly: ` + o.slice(0, 300));
}
{ const r = cp.spawnSync(process.execPath, [FIX, path.join(mods, 'm1'), 'plan', '--game', path.join(FX, 'afile.txt')], { encoding: 'utf8' }); ok(/is a file, not a folder/.test(r.stdout + r.stderr) && !/ENOTDIR/.test(r.stdout + r.stderr), 'game = a file: ' + (r.stdout + r.stderr).slice(0, 300)); }
fs.mkdirSync(path.join(FX, 'notours'), { recursive: true }); fs.writeFileSync(path.join(FX, 'notours', 'x.txt'), 'x');
o = run([path.join(mods, 'm1'), 'apply', '--out', path.join(FX, 'notours')]);
ok(/FIX_OUT_REFUSED/.test(o) && fs.readdirSync(path.join(FX, 'notours')).join() === 'x.txt', 'non-empty foreign --out not refused/kept');
// re-apply over our own patch folder is allowed
o = run([path.join(mods, 'm1'), 'apply', '--out', path.join(FX, 'out-m1')]);
ok(/CHANGED: 2 file/.test(o), 're-apply over own patch folder');
// mod not mounted
o = run([path.join(FX, 'notours'), 'plan', '--out', path.join(FX, 'o9')]);
ok(/FIX_NOT_MOUNTED|usage|no mod.info/.test(o), 'unmounted mod not reported');

// m4: crash-class fixers. default run (no quarantine): include 1-candidate fixed, 0/2 refused; macro 1 defined fixed, 0/2 refused; stub .mtl copied, lonely refused
const h4 = C.treeHash(path.join(mods, 'm4'));
o = run([path.join(mods, 'm4'), 'apply', '--out', path.join(FX, 'out-m4')]);
const o0 = o;
ok(!/\.(inc|mtl).*FIX_GATE_REVERTED|FIX_GATE_REVERTED/.test(o), 'm4: gate reverted something: ' + (o.split('\n').filter(l => /REVERTED/.test(l))[0] || ''));
const inc = fs.existsSync(path.join(FX, 'out-m4/resource/entity/m4/inc_ok.def')) ? rd('out-m4/resource/entity/m4/inc_ok.def').toString('latin1') : '';
ok(inc.includes('(include "/set/lib/helper.inc")'), 'include not repointed: ' + JSON.stringify(inc));
ok(/FIX_INCLUDE_AMBIGUOUS .*2 candidates/.test(o) && /FIX_INCLUDE_NO_CANDIDATE .*nowhere/.test(o), 'include refusals missing');
const mac = fs.existsSync(path.join(FX, 'out-m4/resource/entity/m4/mac_ok.def')) ? rd('out-m4/resource/entity/m4/mac_ok.def').toString('latin1') : '';
ok(mac.startsWith('(include "/set/lib/mac.inc")'), 'macro include not added: ' + JSON.stringify(mac));
// same-line prefix: line count and the targeted line ("mymac" on line 2) stay where the findings point
const macSrc = rd('game/mods/m4/resource/entity/m4/mac_ok.def').toString('latin1').split('\r\n'), macOut = mac.split('\r\n');
ok(macOut.length === macSrc.length && macOut[1] === macSrc[1] && macOut[0].endsWith(macSrc[0]), 'macro fix moved line numbers: ' + JSON.stringify(macOut));
ok(/FIX_MACRO_AMBIGUOUS .*dupmac.*2 places/.test(o) && /FIX_MACRO_NO_DEFINITION .*nomac/.test(o), 'macro refusals missing');
ok(files('out-m4').includes('resource/entity/m4/gap.mtl') || fs.existsSync(path.join(FX, 'out-m4/resource/entity/m4/gap.mtl')), 'stub mtl not written');
ok(/VISUAL RISK/.test(o) && /FIX_STUBMTL_NO_SOURCE .*lonely|FIX_STUBMTL_NO_SOURCE/.test(o), 'stubmtl flag/refusal');
ok(!/FIX_QUARANTINED/.test(o) && !/\{Delete /.test(rd('out-m4/mod.info').toString('latin1')), 'quarantine ran by default');
ok(C.treeHash(path.join(mods, 'm4')) === h4, 'source m4 changed');
// quarantine, explicit: what is still crash-class (mac_none: macro with no definition; inc_amb/inc_none/mac_amb refused above) is deleted, with referrers
o = run([path.join(mods, 'm4'), 'apply', '--out', path.join(FX, 'out-m4q'), '--only', 'include,macro,quarantine']);
const mi4 = fs.existsSync(path.join(FX, 'out-m4q/mod.info')) ? rd('out-m4q/mod.info').toString('latin1') : '';
for (const n of ['mac_none', 'mac_amb', 'inc_amb', 'inc_none']) ok(mi4.includes(`{Delete "resource/entity/m4/${n}.def"}`), 'quarantine missing ' + n + ': ' + mi4);
ok(!/Delete "resource\/entity\/m4\/(inc_ok|mac_ok)/.test(mi4), 'quarantine removed a fixed entity');
// map referrer: deleted and listed with file:line and kind
ok(/entity mac_none removed/.test(o) && /resource\/map\/m4\/ref\.mis:2 \(map\)/.test(o), 'map referrer not listed');
// substring lookalikes of inc_none are not references: deleted with "0 reference(s)"
ok(/entity inc_none removed[^\n]*0 reference/.test(o), 'lookalike counted as a reference (inc_none): ' + (o.split('\n').find(l => /entity inc_none/.test(l)) || ''));
ok(/entity inc_amb removed[^\n]*0 reference/.test(o), 'unreferenced inc_amb not deleted plain');
// .mi reference found and refused (unknown kind); armor referrer refused (fatal kind); both kept
ok(/QUARANTINE_REFUSED mi_ref: resource\/set\/m4\.mi:2 \(other\)[^\n]*would turn a load fault into a fatal one/.test(o), 'mi referrer not found/refused: ' + (o.split('\n').find(l => /mi_ref/.test(l)) || ''));
ok(/QUARANTINE_REFUSED arm_ref: resource\/set\/stuff\/armor_vest:\d \(armor\)[^\n]*fatal one/.test(o), 'armor referrer not refused');
ok(!/Delete "resource\/entity\/m4\/(mi_ref|arm_ref)/.test(mi4), 'refused entity was deleted');
ok(/QUARANTINE: 4 removed, 3 referenced, 2 refused/.test(o), 'quarantine counts: ' + (o.split('\n').find(l => /^QUARANTINE:/.test(l)) || ''));
ok(/verdict after removing 4 entities; this does not show the mod's own content loads/.test(o), 'verdict note missing');
// stub only for referenced meshes: gap (referenced) has one, orphan (not) has none
ok(fs.existsSync(path.join(FX, 'out-m4/resource/entity/m4/gap.mtl')) && !fs.existsSync(path.join(FX, 'out-m4/resource/entity/m4/orphan.mtl')), 'stub for unreferenced orphan.ply (or none for gap)');
ok(/FIX_STUBMTL_UNREFERENCED/.test(o0), 'unreferenced mesh not reported');
// external mod (outside <game>/mods) through the staged game dir
fs.rmSync(path.join(FX, 'ext'), { recursive: true, force: true });
fs.cpSync(path.join(mods, 'm4'), path.join(FX, 'ext', 'm4x'), { recursive: true });
// the staged dir goes to a temp folder of this run only: suites running beside this one stage their own in the shared temp folder
const TMPX = path.join(FX, 'tmpx'); fs.mkdirSync(TMPX, { recursive: true });
{ const r = cp.spawnSync(process.execPath, [FIX, path.join(FX, 'ext', 'm4x'), 'plan', '--out', path.join(FX, 'o-ext'), '--game', G, '--cache', path.join(FX, 'rc.json')], { encoding: 'utf8', env: Object.assign({}, process.env, { TEMP: TMPX, TMP: TMPX, TMPDIR: TMPX }) }); o = (r.stdout || '') + (r.stderr || ''); }
ok(!/FIX_NOT_MOUNTED/.test(o) && /CHANGED: [3-9] file/.test(o) && /staged game dir/.test(o), 'external mod not fixed: ' + o.split('\n').filter(l => /^(CHANGED|NOTE|FIX_|.*FIX_NOT)/.test(l)).join(' | '));
ok(!fs.readdirSync(TMPX).some(n => /^fixgame-/.test(n)), 'staged dir left behind');

// m5: text fixers (enc, spell, syntax, asread), environment preset repoint, two fixers merged on one file
const h5 = C.treeHash(path.join(mods, 'm5'));
o = run([path.join(mods, 'm5'), 'apply', '--out', path.join(FX, 'out-m5')]);
const r5 = f => rd('out-m5/resource/' + f).toString('utf8');
ok(/CHANGED: 9 file/.test(o) && !/FIX_GATE_REVERTED/.test(o), 'm5 changes: ' + o.split('\n').filter(l => /^CHANGED|GATE_REVERTED/.test(l)).join(' | '));
ok(/SOURCE: untouched/.test(o) && C.treeHash(path.join(mods, 'm5')) === h5, 'm5 source changed');
ok(r5('entity/m5/txt.def').includes('{note "Привет мир"}') && r5('entity/m5/txt.def').includes('{note2 "Танк"} ; ') && rd('out-m5/resource/entity/m5/txt.def').includes(Buffer.from('; \xea\xee\xec\xec\xe5\xed\xf2', 'latin1')), 'enc: strings not UTF-8 or the cp1251 comment bytes changed');
ok(/FIX_ENC_AMBIGUOUS .*mixes Latin and Cyrillic/.test(o) && !fs.existsSync(path.join(FX, 'out-m5/resource/entity/m5/amb.def')), 'enc: cp1252 text not refused');
ok(r5('entity/m5/case.def').includes('("armor")') && !/FIX_MACRO_NO_DEFINITION/.test(o), 'spell: macro call not respelled (or macro refusal left)');
ok(r5('set/multiplayer/games/m5game.set').includes('{maxTeamSlots 4}'), 'spell: team key not respelled');
ok(/FIX_SPELL_INHERITED MIS_TEAMKEY_UNREAD/.test(o) && !fs.existsSync(path.join(FX, 'out-m5/resource/set/multiplayer/games/combat.set')), 'spell: line copied from the base game not refused');
ok(r5('entity/m5/bare.mtl').includes('{diffuse "tex1"}') && r5('entity/m5/tags.def').includes('{tags "a b c"}'), 'syntax: diffuse or tags not rewritten');
ok(r5('set/stuff/gun/m5.pattern').includes('{projectileDamageThreshold 1}') && r5('map/multi/m5map/map.info').includes('{maxPlayers 4}'), 'asread: threshold or maxPlayers not set');
ok(r5('map/m5/m.mi').includes('{Environment "day/clear"}') && r5('map/m5/m.mi').includes('{name "old/fog"}'), 'env preset: 1 candidate not repointed (or 2 candidates edited)');
ok(/FIX_REPOINT_AMBIGUOUS ENV_PRESET_MISSING "old\/fog".*same on 2 lines/.test(o) && /FIX_REPOINT_NO_CANDIDATE ENV_PRESET_MISSING "gone\/none"/.test(o), 'env preset: refusals missing or not grouped');
ok(r5('set/stuff/m5two').includes('{projectileDamageThreshold 1}') && r5('set/stuff/m5two').includes('"weapon/shot/snd/shot_unique"') && !/FIX_EDIT_CONFLICT/.test(o), 'two fixers on one file not merged');
ok(!files('out-m5').some(f => !/^(mod\.info|resource\/)/.test(f)) && files('out-m5').every(f => f === 'mod.info' || !rd('out-m5/' + f).toString('latin1').replace(/\r\n/g, '').includes('\n')), 'm5 output not CRLF');
// --target classic leaves cp1251 strings; --only asread touches nothing else
o = run([path.join(mods, 'm5'), 'plan', '--target', 'classic']);
ok(/enc: skipped for --target classic/.test(o) && !/FIX_ENC_/.test(o) && /CHANGED: 8 file/.test(o), 'classic target still resaves strings');
o = run([path.join(mods, 'm5'), 'plan', '--only', 'asread']);
ok(/CHANGED: 3 file/.test(o) && !/FIX_(SPELL|SYNTAX|ENC|REPOINT)/.test(o), '--only asread: ' + o.split('\n').find(l => /^CHANGED/.test(l)));

console.log(bad ? `${bad} assertion(s) failed` : 'all assertions held');

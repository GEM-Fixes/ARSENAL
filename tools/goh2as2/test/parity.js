// game parity test (MoW:AS2 target,: goh2as2 --exe, stuffport --exe, target.js. Invented fixtures only. run via run.sh.
//  1 target.js: exe words, default from the install (as64.exe -> as64, none -> mowas2), mod.info lines equal tools/newmod RANGE
//  2 --exe goh is refused at the start: exit 2, one plain line naming GoH, nothing written
//  3 stuff view: a gun only as64/core and as64+ carry is kept for as64 (no --exe, as before) and missing for --exe mowas_2 (no as64 layers)
//  4 --mod mod.info: 3.301 with no --exe; 3.262.0..3.262.1 with --exe mowas_2 (and with mowas2); with no --exe and no as64.exe in --game too
//  5 stuffport --exe mowas_2: the AS2 define view has no as64+ (a define only as64+ has is EXPANDed, as64 keeps it); --exe goh refused
//  6 no install path written in a port tool: unitname finds GoH through lib/gamedir (none -> exit 2, plain line; env GOH_GAME -> used),
//    texcheck with no --game and no AS2 install found reads no vanilla keys and does not throw; its CLI says so on stderr (a vanilla name then shows as MISSING_TEXTURE)
// Author: Imperator_Aug (ARSENAL, ia-3b7e9c41)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const tool = path.join(__dirname, '..', 'goh2as2.js'), T = require('../target');
let fail = 0;
const t = (name, good, extra) => { console.log((good ? 'ok   ' : 'FAIL ') + 'parity: ' + name + (good || extra === undefined ? '' : '  ' + String(extra).slice(0, 700))); if (!good) fail++; };
const env = { ...process.env, AS2_NO_STEAM: '1', AS2_GAME: '' };
const W = fs.mkdtempSync(path.join(os.tmpdir(), 'tparity-'));
const w = (rel, s) => { const p = path.join(W, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s.replace(/\r?\n/g, '\r\n'), 'latin1'); };
try {
  // ---- 1 target.js
  const RANGE = { mowas2: { min: '3.262.0', max: '3.262.1' }, as64: { min: '3.301' } };   // = tools/newmod/newmod.js RANGE (checked below by text)
  const nm = fs.readFileSync(path.join(__dirname, '..', '..', 'newmod', 'newmod.js'), 'utf8');
  t('1 newmod RANGE text unchanged (mowas2 3.262.0..3.262.1, as64 3.301)', nm.includes("mowas2: { min: '3.262.0', max: '3.262.1' }, as64: { min: '3.301' }"));
  t('1 modInfoLines as64', JSON.stringify(T.modInfoLines('as64')) === JSON.stringify([` {MinGameVersion "${RANGE.as64.min}"}`]));
  t('1 modInfoLines mowas2', JSON.stringify(T.modInfoLines('mowas2', '\t')) === JSON.stringify([`\t{MinGameVersion "${RANGE.mowas2.min}"}`, `\t{MaxGameVersion "${RANGE.mowas2.max}"}`]));
  w('as2/as64.exe', ''); w('mw/mowas_2.exe', '');
  t('1 targetOf: exe word wins', T.targetOf('mowas_2', path.join(W, 'as2')) === 'mowas2' && T.targetOf('as64', path.join(W, 'mw')) === 'as64');
  t('1 targetOf: from the install', T.targetOf(undefined, path.join(W, 'as2')) === 'as64' && T.targetOf(undefined, path.join(W, 'mw')) === 'mowas2' && T.targetOf(undefined, null) === 'as64');
  t('1 stuffMods', JSON.stringify(T.stuffMods('as64')) === '["as64+"]' && JSON.stringify(T.stuffMods('mowas2')) === '[]');
  t('1 exeFlag', T.exeFlag(undefined).length === 0 && T.exeFlag('mowas_2').join(' ') === '--exe mowas_2');
  // ---- fixture: GoH unit naming a gun the AS2 side has only in as64/core and one only in as64+ (as64/plus)
  w('as2/resource/set/stuff/gun/gun.pattern', '{weapon_bullet}\n');
  w('as2/resource/entity/dummy/dummy.def', '{game_entity}\n');
  w('as2/as64/core/resource/set/stuff/gun/coregun', '{from "pattern gun"}\n');
  w('as2/as64/plus/resource/set/stuff/gun/plusgun', '{from "pattern gun"}\n');
  w('as2/as64/plus/mod.info', '{Mod\n {Name "as64+"}\n {MinGameVersion "3.301"}\n}\n');
  w('goh/resource/entity/u1/u1.def', '{game_entity\n  {Extension "u1.mdl"}\n  {Weaponry\n    {place "a" {weapon "coregun"}}\n    {place "b" {weapon "plusgun"}}\n  }\n}\n');
  w('goh/resource/entity/u1/u1.mdl', '{model "x"}\n');
  const run = (extra, game = 'as2') => {
    const out = path.join(W, 'o' + Math.random().toString(36).slice(2, 7));
    const r = cp.spawnSync(process.execPath, [tool, '--goh', path.join(W, 'goh'), '--game', path.join(W, game), '--entity', 'u1', '--out', out, '--no-keylint', '--no-rc', '-q', ...extra], { encoding: 'utf8', env });
    return { r, out, text: (r.stdout || '') + (r.stderr || ''), rd: p => { try { return fs.readFileSync(path.join(out, p), 'latin1'); } catch { return null; } } };
  };
  // ---- 2 --exe goh refused
  const g = run(['--exe', 'goh']);
  t('2 --exe goh: exit 2', g.r.status === 2, g.text);
  t('2 --exe goh: one plain line', /^goh2as2: not available for GoH: .*GoH is the source.*\(.+\)\s*$/.test(g.r.stderr) && g.r.stderr.trim().split(/\r?\n/).length === 1, g.r.stderr);
  t('2 --exe goh: nothing written', !fs.existsSync(g.out));
  const bad = run(['--exe', 'nope']);
  t('2 --exe nope: exit 2', bad.r.status === 2 && /--exe must be one of/.test(bad.r.stderr), bad.text);
  // ---- 3 stuff view per target
  const a = run([]), m = run(['--exe', 'mowas_2']);
  t('3 as64 run exit 0', a.r.status === 0, a.text);
  t('3 as64: coregun and plusgun found (no STUFF_MISSING)', !/WARN_PORT_STUFF_MISSING/.test(a.text), a.text);
  t('3 mowas_2 run exit 0', m.r.status === 0, m.text);
  t('3 mowas_2: coregun missing (no as64/core)', /WARN_PORT_STUFF_MISSING[^\n]*coregun/.test(m.text), m.text);
  t('3 mowas_2: plusgun missing (no as64+)', /WARN_PORT_STUFF_MISSING[^\n]*plusgun/.test(m.text), m.text);
  // ---- 3b keylint pass with --exe: keylint takes the common --exe (lib/cli) and runs (a finding count, not "failed to run")
  const kOut = path.join(W, 'k1'), k = cp.spawnSync(process.execPath, [tool, '--goh', path.join(W, 'goh'), '--game', path.join(W, 'as2'), '--entity', 'u1', '--out', kOut, '--no-rc', '--exe', 'mowas_2'], { encoding: 'utf8', env });
  t('3b keylint --exe mowas_2 ran', /keylint on .*: \d+ findings \(informational\)/.test(k.stdout || ''), (k.stdout || '') + (k.stderr || ''));
  // ---- 4 mod.info per target
  const mod = (extra, game) => { const out = path.join(W, 'm' + Math.random().toString(36).slice(2, 7)); const r = cp.spawnSync(process.execPath, [tool, '--goh', path.join(W, 'goh'), '--game', path.join(W, game || 'as2'), '--entity', 'u1', '--mod', out, '--no-keylint', '--no-rc', '--no-names', '-q', ...extra], { encoding: 'utf8', env }); let mi = null; try { mi = fs.readFileSync(path.join(out, 'mod.info'), 'utf8'); } catch { mi = null; } return { r, mi }; };
  const name = mi => (/\{Name "([^"]+)"\}/.exec(mi || '') || [])[1];
  const m0 = mod([]), m1 = mod(['--exe', 'mowas_2']), m2 = mod(['--exe', 'mowas2']), m3 = mod([], 'mw');
  t('4 no --exe: MinGameVersion 3.301, no Max (as before)', m0.mi === `{Mod\r\n {Name "${name(m0.mi)}"}\r\n {MinGameVersion "3.301"}\r\n}\r\n`, m0.mi);
  t('4 --exe mowas_2: 3.262.0..3.262.1', m1.mi === `{Mod\r\n {Name "${name(m1.mi)}"}\r\n {MinGameVersion "3.262.0"}\r\n {MaxGameVersion "3.262.1"}\r\n}\r\n`, m1.mi);
  t('4 --exe mowas2 (GUI word) = mowas_2', m2.mi && m2.mi.includes('{MaxGameVersion "3.262.1"}'), m2.mi);
  t('4 no --exe, install without as64.exe: the mowas_2 range', m3.mi && m3.mi.includes('{MinGameVersion "3.262.0"}'), m3.mi);
  // ---- 5 stuffport --exe
  w('as2/resource/set/stuff/gun/.presets', '(define "base_def" {mass 1})\n');
  w('as2/as64/plus/resource/set/stuff/gun/.presets', '(define "base_def" {mass 1})\n(define "plus_def" {mass 2})\n');
  w('goh/resource/set/stuff/gun/.presets', '(define "plus_def" {mass 2})\n');
  w('goh/resource/set/stuff/gun/g88', '{from "pattern gun"\n  ("plus_def")\n}\n');
  fs.mkdirSync(path.join(W, 'spmod'), { recursive: true });
  const sp = extra => cp.spawnSync(process.execPath, [tool, 'stuffport', '--goh', path.join(W, 'goh'), '--game', path.join(W, 'as2'), '--file', 'set/stuff/gun/g88', '--scale-damage', 'none', '--dry-run', path.join(W, 'spmod'), ...extra], { encoding: 'utf8', env });
  const s0 = sp([]), s1 = sp(['--exe', 'mowas_2']), s2 = sp(['--exe', 'goh']);
  const so = r => (r.stdout || '') + (r.stderr || '');
  t('5 stuffport as64: plus_def KEEP (as64+ in the view)', s0.status === 0 && /SP_KEEP \("plus_def"\)/.test(so(s0)), so(s0));
  t('5 stuffport --exe mowas_2: plus_def EXPAND (no as64+)', s1.status === 0 && /SP_EXPAND \("plus_def"\)/.test(so(s1)), so(s1));
  t('5 stuffport --exe goh: exit 2, plain line', s2.status === 2 && /not available for GoH/.test(s2.stderr || ''), so(s2));
  const s3 = cp.spawnSync(process.execPath, [tool, 'stuffport', '--goh', path.join(W, 'goh'), '--game', path.join(W, 'as2'), '--file', 'set/stuff/gun/g88', '--dry-run', path.join(W, 'no_such_mod'), '--exe', 'goh'], { encoding: 'utf8', env });
  t('5 stuffport --exe goh, missing mod folder: the refusal comes first (not X_NOT_FOUND)', s3.status === 2 && /not available for GoH/.test(s3.stderr || '') && !/X_NOT_FOUND/.test(so(s3)), so(s3));
  // ---- 6 installs through lib/gamedir, never a written path
  const drive = /['"][A-Za-z]:[\\/]/;
  for (const dir of ['goh2as2', 'gohsample', 'unitmod']) for (const n of fs.readdirSync(path.join(__dirname, '..', '..', dir))) if (/\.js$/.test(n)) {
    t('6 no drive path literal in ' + dir + '/' + n, !drive.test(fs.readFileSync(path.join(__dirname, '..', '..', dir, n), 'utf8')));
  }
  w('unm/resource/entity/u/tank1.def', '{game_entity}\n'); w('ghi/localizations/.keep', '');
  const un = (extra, e) => cp.spawnSync(process.execPath, [path.join(__dirname, '..', 'unitname.js'), path.join(W, 'unm'), '--dry-run', '-q', ...extra], { encoding: 'utf8', cwd: W, env: { ...env, GOH_GAME: '', ...e } });
  const u0 = un([], {}), u1 = un([], { GOH_GAME: path.join(W, 'ghi') }), u2 = un(['--goh', path.join(W, 'ghi')], {});
  t('6 unitname, no --goh and no GoH install found: exit 2, plain line', u0.status === 2 && /no GoH install found/.test(u0.stderr || ''), so(u0));
  t('6 unitname, env GOH_GAME is the default install', u1.status === 0 && /GoH \.pot read 0/.test(u1.stdout || ''), so(u1));
  t('6 unitname --goh as before', u2.status === 0 && so(u2) === so(u1), so(u2));
  const tc = cp.spawnSync(process.execPath, ['-e', 'const r = require(process.argv[1]).check(process.argv[2]); console.log("mtls " + r.mtls)', path.join(__dirname, '..', 'texcheck.js'), path.join(W, 'unm')], { encoding: 'utf8', cwd: W, env });
  t('6 texcheck, no --game and no AS2 install found: no throw', tc.status === 0 && /mtls 0/.test(tc.stdout || ''), so(tc));
  w('tm/resource/entity/tank/a.mtl', '{material "bump"\n {diffuse "$/animation/isu"}\n}\n'); w('as2v/resource/texture/common/animation/isu.dds', '');
  const tcl = g => cp.spawnSync(process.execPath, [path.join(__dirname, '..', 'texcheck.js'), path.join(W, 'tm'), ...g], { encoding: 'utf8', cwd: W, env });
  const tn = tcl([]), tg = tcl(['--game', path.join(W, 'as2v')]);
  t('6 texcheck CLI, no install found: one plain stderr line that vanilla was not read', tn.status === 1 && /no AS2 install found .*vanilla textures not read/.test(tn.stderr || '') && /MISSING_TEXTURE diffuse/.test(tn.stdout || ''), so(tn));
  t('6 texcheck CLI --game: vanilla read, no such line', tg.status === 0 && !/no AS2 install found/.test(tg.stderr || ''), so(tg));
} finally { fs.rmSync(W, { recursive: true, force: true }); }
console.log(fail ? `FAIL parity: ${fail}` : 'PASS parity');
process.exit(fail ? 1 : 0);

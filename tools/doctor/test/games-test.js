// doctor game parity (lib/games): --exe mowas_2 on the shared AS2 install, GoH install (detected or --exe goh / --goh), registry games
// filter (GAME_SKIP), --exe forwarded to the linters, envcheck and --release per game. made-up fixtures under a temp dir; nothing else written.
// DOCTOR_TEST_ARGS=1 makes doctor write <out>/<tool>.args (the argument list each tool got).
// Author: Imperator_Aug (ARSENAL, ia-1d8936ee)
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const DOC = path.join(__dirname, '..', 'doctor.js');
const W = fs.mkdtempSync(path.join(process.env.TEST_WORK || os.tmpdir(), 'doc-games-'));
let fail = 0;
const ok = (c, m, extra) => { if (!c) { fail++; console.log('FAIL: ' + m + (extra ? '\n' + extra : '')); } };
const wr = (p, s) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };
const mi = (min, max, extra) => '{Mod\r\n\t{Name "x"}\r\n' + (min ? `\t{MinGameVersion "${min}"}\r\n` : '') + (max ? `\t{MaxGameVersion "${max}"}\r\n` : '') + (extra || '') + '}\r\n';
const env = { ...process.env, DOCTOR_TEST_ARGS: '1', AS2_GAME: path.join(W, 'nogame'), AS2_NO_STEAM: '1', GOH_GAME: path.join(W, 'nogoh') };
const run = (args, e, pre) => { const r = cp.spawnSync(process.execPath, [...(pre || []).flatMap(p => ['-r', p]), DOC, ...args], { encoding: 'utf8', env: { ...env, ...(e || {}) } }); return { rc: r.status, o: r.stdout || '', e: r.stderr || '' }; };
const args = (out, t) => { try { return JSON.parse(fs.readFileSync(path.join(out, t + '.args'), 'utf8')); } catch { return null; } };

// ---- shared AS2 install: as64.exe + mowas_2.exe + as64/plus (built-in as64+) + as64/core
const A = path.join(W, 'as2');
wr(path.join(A, 'as64.exe'), ''); wr(path.join(A, 'mowas_2.exe'), ''); fs.mkdirSync(path.join(A, 'resource'), { recursive: true });
wr(path.join(A, 'as64', 'plus', 'mod.info'), mi('3.301')); fs.mkdirSync(path.join(A, 'as64', 'core'), { recursive: true });
wr(path.join(A, 'mods', 'd', 'mod.info'), mi('3.301')); wr(path.join(A, 'mods', 'd', 'resource', 'entity', 'x.def'), '{game_entity\r\n}\r\n');
wr(path.join(A, 'mods', 'e', 'mod.info'), mi('3.262', '3.262', '\t{Require "as64+"}\r\n')); fs.mkdirSync(path.join(A, 'mods', 'e', 'resource'), { recursive: true });
wr(path.join(A, 'mods', 'f', 'mod.info'), mi('3.262', '3.262')); wr(path.join(A, 'mods', 'f', 'resource', 'set', 'a.set'), '{set}\r\n');

// AS64 as before: no --exe = as64 (as64.exe in the folder), modern mod mounts with as64+ first, no exe word in the header
let O = path.join(W, 'o1'), r = run([path.join(A, 'mods', 'd'), '--only', 'vfs,modinfo', '--out', O]);
ok(/mounted: as64\+, d\)/.test(r.o) && !/exe /.test(r.o.split('\n')[0]), 'as64 default: as64+ first, header as before', r.o + r.e);
ok(!/NOT_MOUNTED/.test(r.o), 'as64 default: modern mod (Min only) is not dropped', r.o);
ok(args(O, 'vfs') && !args(O, 'vfs').includes('--exe'), 'as64 default: no --exe passed on', JSON.stringify(args(O, 'vfs')));
// MoW:AS2 on the same install: --exe mowas_2 (and the id mowas2): no as64+, Min-only mod dropped (PORT-48), --exe mowas_2 forwarded
for (const x of ['mowas_2', 'mowas2']) {
  O = path.join(W, 'o2' + x); r = run([path.join(A, 'mods', 'd'), '--exe', x, '--only', 'vfs,modinfo,sdllint', '--out', O]);
  ok(/^# doctor: d .*exe mowas_2; mounted: \)/m.test(r.o), `--exe ${x}: header names mowas_2, no as64+ mounted, the dropped d not listed as mounted`, r.o + r.e);
  ok(/NOT_MOUNTED "d": no MaxGameVersion/.test(r.o), `--exe ${x}: modern Min-only mod dropped on mowas_2`, r.o);
  for (const t of ['vfs', 'modinfo', 'sdllint']) { const a = args(O, t); ok(a && a.join(' ').includes('--exe mowas_2'), `--exe ${x}: ${t} got --exe mowas_2`, JSON.stringify(a)); }
}
// every tool run under mowas_2 either got --exe mowas_2 or is named in the EXE_NOT_PASSED note (none read as AS64 silently)
O = path.join(W, 'o3'); r = run([path.join(A, 'mods', 'f'), '--exe', 'mowas_2', '--out', O]);
{
  const note = (r.o.match(/^EXE_NOT_PASSED (.*?):/m) || [])[1] || '', named = note.split(', ').filter(Boolean);
  const ran = fs.readdirSync(O).filter(f => f.endsWith('.args')).map(f => f.slice(0, -5));
  ok(ran.length >= 8, 'mowas_2 full run: tools ran', r.o + r.e);
  for (const t of ran) ok(args(O, t).join(' ').includes('--exe mowas_2') || named.includes(t), `mowas_2: ${t} neither got --exe nor is named in EXE_NOT_PASSED`, r.o);
  ok(!/^GAME_SKIP/m.test(r.o), 'mowas_2: no linter left out (registry games hold mowas2 for all)', r.o);
}
// Require "as64+" under mowas_2: not met (AS64's built-in mod), DEP_MISSING; under as64 it is met
r = run([path.join(A, 'mods', 'e'), '--exe', 'mowas_2', '--only', 'vfs', '--out', path.join(W, 'o4')]);
ok(/DEP_MISSING e requires "as64\+": the built-in mod of AS64 only/.test(r.o), 'mowas_2: Require as64+ is DEP_MISSING', r.o);
// under as64 the Require is met, but e is Classic (Min 3.262) with as64+ in the list: the vfs drops it (MOD_MODE), so
// doctor says NOT_MOUNTED, keeps e out of --mods and refcheck reads it with --folder (no ERROR exit 3)
O = path.join(W, 'o4a'); r = run([path.join(A, 'mods', 'e'), '--only', 'vfs,refcheck,mpsync', '--out', O]);
ok(!/DEP_MISSING/.test(r.o) && /mounted: as64\+\)/.test(r.o), 'as64: Require as64+ is met, e not listed as mounted', r.o);
ok(/^NOT_MOUNTED "e": it is made for Classic mode and the mod list has as64\+ .*MOD_MODE, eMod\.cpp:470\); its files are still checked as a folder, mpsync skipped/m.test(r.o), 'as64: Classic mod with as64+ = NOT_MOUNTED MOD_MODE, mpsync named', r.o);
ok(args(O, 'refcheck') && args(O, 'refcheck').includes('--folder') && !/ERROR/.test(r.o), 'as64 MOD_MODE: refcheck --folder, no ERROR', r.o + JSON.stringify(args(O, 'refcheck')));
ok(!args(O, 'mpsync'), 'as64 MOD_MODE: mpsync not run', JSON.stringify(args(O, 'mpsync')));
ok(/^vfs .*MOD_MODE/m.test(r.o), 'as64 MOD_MODE: vfs reports the same drop', r.o);
// a modern mod on an as64 install with no as64/plus/mod.info: as64+ is not in the list, the vfs drops it (MOD_MODE)
{
  const A2 = path.join(W, 'as2np');
  wr(path.join(A2, 'as64.exe'), ''); fs.mkdirSync(path.join(A2, 'resource'), { recursive: true });
  wr(path.join(A2, 'mods', 'd', 'mod.info'), mi('3.301')); wr(path.join(A2, 'mods', 'd', 'resource', 'entity', 'x.def'), '{game_entity\r\n}\r\n');
  O = path.join(W, 'o4b'); r = run([path.join(A2, 'mods', 'd'), '--only', 'vfs,refcheck', '--out', O]);
  ok(/^NOT_MOUNTED "d": it is made for Enhanced mode and the mod list lacks as64\+ \(no as64\/plus\/mod\.info in the game\)/m.test(r.o), 'as64 no as64/plus: modern mod NOT_MOUNTED MOD_MODE', r.o + r.e);
  ok(args(O, 'refcheck') && args(O, 'refcheck').includes('--folder') && !/ERROR/.test(r.o), 'as64 no as64/plus: refcheck --folder, no ERROR', r.o + JSON.stringify(args(O, 'refcheck')));
}
// --cache-dir D: refcheck keeps its entity index cache in D (check gives a temp one for an overlay), not the shared cache folder
O = path.join(W, 'oc'); r = run([path.join(A, 'mods', 'f'), '--only', 'refcheck', '--cache-dir', path.join(W, 'cd'), '--out', O]);
ok(args(O, 'refcheck') && args(O, 'refcheck').join(' ').includes('--cache ' + path.join(W, 'cd', 'refcheck.json')) && fs.existsSync(path.join(W, 'cd', 'refcheck.json')) && !/ERROR/.test(r.o), '--cache-dir: refcheck cache in the given folder', r.o + r.e + JSON.stringify(args(O, 'refcheck')));
O = path.join(W, 'oc2'); r = run([path.join(A, 'mods', 'f'), '--only', 'refcheck', '--out', O]);
ok(args(O, 'refcheck') && !args(O, 'refcheck').includes('--cache'), 'no --cache-dir: refcheck args as before', JSON.stringify(args(O, 'refcheck')));
// envcheck: as64+ in an options mods list counts as installed for as64 only
r = run([path.join(A, 'mods', 'f'), '--only', 'envcheck', '--mods-list', 'as64+,f', '--out', path.join(W, 'o5')]);
ok(!/DOC_MOD_NOT_INSTALLED/.test(r.o), 'envcheck as64: as64+ installed', r.o);
r = run([path.join(A, 'mods', 'f'), '--exe', 'mowas_2', '--only', 'envcheck', '--mods-list', 'as64+,f', '--out', path.join(W, 'o5')]);
ok(/DOC_MOD_NOT_INSTALLED/.test(r.o), 'envcheck mowas_2: as64+ not installed', r.o);
// bad --exe: one line, exit 2
r = run([path.join(A, 'mods', 'f'), '--exe', 'mow3']);
ok(r.rc === 2 && /--exe must be as64, mowas_2, mowas2 or goh/.test(r.e), 'bad --exe: exit 2 with one line', r.o + r.e);
r = run([path.join(A, 'mods', 'f'), '--exe', 'as64', '--goh', A]);
ok(r.rc === 2 && /--goh is the GoH install/.test(r.e), '--goh with --exe as64: exit 2', r.o + r.e);

// ---- GoH install: binaries/x64/call_to_arms.exe, mods/<m>, one-bound mod.info (PORT-46), localizations/ (GHLOC-01)
const H = path.join(W, 'goh');
wr(path.join(H, 'binaries', 'x64', 'call_to_arms.exe'), ''); fs.mkdirSync(path.join(H, 'resource'), { recursive: true });
wr(path.join(H, 'mods', 'g', 'mod.info'), '{mod\r\n\t{name "g"}\r\n\t{minGameVersion "1.050"}\r\n}\r\n');
wr(path.join(H, 'mods', 'g', 'resource', 'set', 'a.set'), '{set}\r\n');
wr(path.join(H, 'mods', 'g', 'localizations', 'default', 'interface', 'text', 'g.pot'), 'msgctxt "g_k"\r\nmsgid "G"\r\nmsgstr ""\r\n');
wr(path.join(H, 'mods', 'h', 'mod.info'), '{mod\r\n\t{name "h"}\r\n}\r\n'); fs.mkdirSync(path.join(H, 'mods', 'h', 'resource'), { recursive: true });
// detected from the folder (no --exe): goh; one bound mounts; every linter runs (registry has no games limit: uilint GoH tables,
// binhdr GoH cell 5), each gets --exe goh
O = path.join(W, 'g1'); r = run([path.join(H, 'mods', 'g'), '--only', 'modinfo,sdllint,uilint,binhdr,vfs', '--out', O]);
ok(/^# doctor: g .*exe goh; mounted: g\)/m.test(r.o), 'goh detected: header exe goh, mounted g', r.o + r.e);
ok(!/NOT_MOUNTED/.test(r.o), 'goh: Min-only mod mounts (one bound is enough, PORT-46)', r.o);
ok(!/^GAME_SKIP/m.test(r.o), 'goh: no GAME_SKIP (no registry games limit)', r.o);
for (const t of ['uilint', 'binhdr']) ok(args(O, t) && args(O, t).join(' ').includes('--exe goh'), `goh: ${t} runs with --exe goh`, r.o + JSON.stringify(args(O, t)));
ok(args(O, 'sdllint') && args(O, 'sdllint').join(' ').includes('--game ' + H) && args(O, 'sdllint').join(' ').includes('--exe goh'), 'goh: sdllint reads the GoH install with --exe goh', JSON.stringify(args(O, 'sdllint')));
ok(args(O, 'modinfo') && args(O, 'modinfo').join(' ').includes('--game ' + H) && !/VER_MISSING/.test(r.o), 'goh: modinfo gets the GoH install (one-bound mod.info is no VER_MISSING)', r.o + JSON.stringify(args(O, 'modinfo')));
ok(!/EXE_NOT_PASSED/.test(r.o), 'goh: no EXE_NOT_PASSED note', r.o);
// the GAME_SKIP path stays for a future registry games limit: the hook gives uilint games as64, mowas2 only
O = path.join(W, 'g1s'); r = run([path.join(H, 'mods', 'g'), '--only', 'sdllint,uilint', '--out', O], null, [path.join(__dirname, 'gameskip-hook.js')]);
ok(/^GAME_SKIP uilint: not available for GoH: its rules are written for AS64, MoW:AS2 only \(lib\/registry games\)$/m.test(r.o) && !args(O, 'uilint') && args(O, 'sdllint'), 'goh: GAME_SKIP line for a registry games limit', r.o + r.e);
// no bound at all: GoH loads it (each bound optional, GHVFS-26 [V], lib/vfs.js GoH gate)
r = run([path.join(H, 'mods', 'h'), '--only', 'modinfo', '--out', path.join(W, 'g2')]);
ok(!/NOT_MOUNTED/.test(r.o), 'goh: no bound = mounts, no NOT_MOUNTED', r.o);
// tag develop lifts the version gate (GHVFS-02 [V]): a range that misses the exe still mounts
wr(path.join(H, 'mods', 'dv', 'mod.info'), '{mod\r\n\t{name "dv"}\r\n\t{tags "develop"}\r\n\t{minGameVersion "1.500"}\r\n\t{maxGameVersion "1.510"}\r\n}\r\n');
wr(path.join(H, 'mods', 'dv', 'resource', 'set', 'a.set'), '{set}\r\n');
O = path.join(W, 'g2d'); r = run([path.join(H, 'mods', 'dv'), '--only', 'refcheck', '--out', O]);
ok(!/NOT_MOUNTED/.test(r.o) && args(O, 'refcheck') && !args(O, 'refcheck').includes('--folder') && args(O, 'refcheck').join(' ').includes('--mods dv'), 'goh: tag develop out of range mounts', r.o + JSON.stringify(args(O, 'refcheck')));
// version range (same gate as lib/vfs.js): Min above the exe version (fixture exe has no PE version = 1.067) = dropped; the mod leaves
// every --mods and the header, binhdr/refcheck/expcheck read --folder (no EXP_SKIP note: expcheck's folder layer works inside <GoH>/mods); "any"/"any" is open and mounts
wr(path.join(H, 'mods', 'hi', 'mod.info'), '{mod\r\n\t{name "hi"}\r\n\t{minGameVersion "1.500"}\r\n\t{maxGameVersion "1.510"}\r\n}\r\n');
wr(path.join(H, 'mods', 'hi', 'resource', 'set', 'a.set'), '{set}\r\n');
O = path.join(W, 'g2r'); r = run([path.join(H, 'mods', 'hi'), '--only', 'sdllint,refcheck,expcheck,vfs', '--out', O]);
ok(/^NOT_MOUNTED "hi": GoH 1\.067 is below its MinGameVersion 1\.500/m.test(r.o), 'goh range: Min above the exe = NOT_MOUNTED', r.o + r.e);
ok(/^# doctor: hi .*mounted: \)/m.test(r.o), 'goh range: header does not list the dropped mod', r.o);
ok(args(O, 'refcheck') && args(O, 'refcheck').includes('--folder') && !args(O, 'refcheck').includes('--mods'), 'goh range: refcheck reads --folder', JSON.stringify(args(O, 'refcheck')));
ok(args(O, 'sdllint') && !args(O, 'sdllint').includes('--mods'), 'goh range: sdllint gets no --mods hi', JSON.stringify(args(O, 'sdllint')));
ok(args(O, 'expcheck') && args(O, 'expcheck')[0] === '--folder' && !args(O, 'expcheck').includes('--mods') && !/EXP_SKIP/.test(r.o), 'goh range: expcheck reads the dropped mod with --folder', r.o + JSON.stringify(args(O, 'expcheck')));
ok(args(O, 'vfs') && args(O, 'vfs').join(' ').includes('--mods hi'), 'goh range: vfs still gets the full list (reports MOD_VERSION)', JSON.stringify(args(O, 'vfs')));
wr(path.join(H, 'mods', 'ha', 'mod.info'), '{mod\r\n\t{name "ha"}\r\n\t{minGameVersion "any"}\r\n\t{maxGameVersion "any"}\r\n}\r\n');
r = run([path.join(H, 'mods', 'ha'), '--only', 'vfs', '--out', path.join(W, 'g2a')]);
ok(!/NOT_MOUNTED/.test(r.o) && /mounted: ha\)/.test(r.o), 'goh: "any"/"any" mounts', r.o);
// the same "any"/"any" form on the AS2 install is dropped (no numeric bound, PORT-48); a legacy range that misses 3.262.1 is dropped too
wr(path.join(A, 'mods', 'ya', 'mod.info'), mi('any', 'any')); wr(path.join(A, 'mods', 'yr', 'mod.info'), mi('3.270', '3.290'));
r = run([path.join(A, 'mods', 'ya'), '--only', 'vfs', '--out', path.join(W, 'o6')]);
ok(/^NOT_MOUNTED "ya": no MinGameVersion/m.test(r.o), 'as64: "any"/"any" dropped', r.o);
r = run([path.join(A, 'mods', 'yr'), '--exe', 'mowas_2', '--only', 'vfs', '--out', path.join(W, 'o7')]);
ok(/^NOT_MOUNTED "yr": the game version 3\.262\.1 is below its MinGameVersion 3\.270/m.test(r.o), 'mowas_2: range above 3.262.1 dropped', r.o);
r = run([path.join(A, 'mods', 'f'), '--exe', 'mowas_2', '--only', 'vfs', '--out', path.join(W, 'o8')]);
ok(!/NOT_MOUNTED/.test(r.o), 'mowas_2: 3.262..3.262 mounts', r.o);
// --release --exe mowas2: modinfo judges mod.info for MoW:AS2 (Min-only d has no Max: findings)
r = run([path.join(A, 'mods', 'd'), '--release', '--exe', 'mowas2']);
ok(/^# doctor --release: d \(MoW:AS2\)/m.test(r.o) && /REL_MODINFO_FINDINGS/.test(r.o), 'release mowas2: modinfo with --exe mowas_2', r.o + r.e);
r = run([path.join(A, 'mods', 'd'), '--release']);
ok(!/REL_MODINFO_FINDINGS/.test(r.o), 'release as64 default: Min-only modern mod is fine (as before)', r.o);
// a GoH mod outside <GoH>/mods: --exe goh --goh H (and --goh alone) lints against that install; with GOH_GAME the install is found
const Out = path.join(W, 'outside', 'g'); fs.cpSync(path.join(H, 'mods', 'g'), Out, { recursive: true });
for (const a of [['--exe', 'goh', '--goh', H], ['--goh', H], ['--exe', 'goh']]) {
  O = path.join(W, 'g3' + a.length); r = run([Out, ...a, '--only', 'sdllint,uilint', '--out', O], { GOH_GAME: H });
  ok(args(O, 'sdllint') && args(O, 'sdllint').join(' ').includes('--game ' + H), `outside mods ${a.join(' ')}: GoH install used`, r.o + r.e + JSON.stringify(args(O, 'sdllint')));
  ok(args(O, 'uilint') && args(O, 'uilint').join(' ').includes('--exe goh') && !/GAME_SKIP/.test(r.o), `outside mods ${a.join(' ')}: uilint runs with --exe goh`, r.o + JSON.stringify(args(O, 'uilint')));
}
// --release: localizations/ is mounted for GoH (not stray); for an AS2 mod (or a folder in no game) it is outside resource/ and localization/
r = run([path.join(H, 'mods', 'g'), '--release']);
ok(/^# doctor --release: g \(GoH\)/m.test(r.o) && !/localizations\/.*WARN_REL_STRAY_FILE/.test(r.o), 'release goh: localizations/ mounted', r.o + r.e);
ok(!/REL_MODINFO_FINDINGS/.test(r.o), 'release goh: modinfo read with GoH rules (Min-only mod.info is fine)', r.o);
const Rf = path.join(W, 'rel', 'g'); fs.cpSync(path.join(H, 'mods', 'g'), Rf, { recursive: true });
r = run([Rf, '--release']);
ok(/localizations\/default\/interface\/text\/g\.pot: WARN_REL_STRAY_FILE/.test(r.o), 'release no game: localizations/ is stray (as before)', r.o);
r = run([Rf, '--release', '--exe', 'goh']);
ok(!/WARN_REL_STRAY_FILE/.test(r.o), 'release --exe goh: localizations/ mounted', r.o);
// GoH <lang>.pak beside the same loose file: duplicate found
{
  const z = require('../../lib/zipwrite'); fs.writeFileSync(path.join(Rf, 'localizations', 'default.pak'), z.zip([['default/interface/text/g.pot', Buffer.from('msgctxt "x"\r\n')]]));
  r = run([Rf, '--release', '--exe', 'goh']);
  ok(/localizations\/default\/interface\/text\/g\.pot: WARN_REL_PAK_LOOSE_DUP also in localizations\/default\.pak/.test(r.o), 'release goh: <lang>.pak vs loose duplicate', r.o);
}
// envcheck GoH: map paks in resource/map/*.pak keyed at their folder, maps a level deeper; map mod/ rows tagged [I] for GoH
{
  const z = require('../../lib/zipwrite');
  wr(path.join(H, 'resource', 'map', 'multi.pak'), z.zip([['multi/0_front/m1/map', Buffer.from('x')]]));
  wr(path.join(H, 'mods', 'g', 'resource', 'map', 'multi', '0_front', 'm1', 'map'), 'y');
  wr(path.join(H, 'mods', 'g', 'resource', 'map', 'multi', '0_front', 'm1', 'mod', 'set', 'a.set'), '{set}\r\n');
  r = run([path.join(H, 'mods', 'g'), '--only', 'envcheck', '--out', path.join(W, 'g5')]);
  let t = ''; try { t = fs.readFileSync(path.join(W, 'g5', 'envcheck.txt'), 'utf8'); } catch { /* checked below */ }
  ok(/resource\/map\/multi\/0_front\/m1\/map: DOC_MAP_LOOSE_SHADOWS_PAK loose map file shadows pak copy in multi\.pak/.test(t), 'envcheck goh: loose map vs resource/map/multi.pak', r.o + t);
  ok(/DOC_MAPMOD_SHADOWS .*\[I GoH: as64 rule VFS-33 assumed/.test(t), 'envcheck goh: map mod/ row tagged [I]', t);
  // a GoH install with root paks only (resource/dlc1.pak holds map/multi/..., no resource/map/ folder): no crash, root pak keys unprefixed
  const H2 = path.join(W, 'goh2');
  wr(path.join(H2, 'binaries', 'x64', 'call_to_arms.exe'), '');
  wr(path.join(H2, 'resource', 'dlc1.pak'), z.zip([['map/multi/a/map', Buffer.from('x')]]));
  wr(path.join(H2, 'mods', 'm', 'mod.info'), '{mod\r\n\t{name "m"}\r\n\t{minGameVersion "1.050"}\r\n}\r\n');
  wr(path.join(H2, 'mods', 'm', 'resource', 'map', 'multi', 'a', 'map'), 'y');
  r = run([path.join(H2, 'mods', 'm'), '--only', 'envcheck', '--out', path.join(W, 'g6')]);
  t = ''; try { t = fs.readFileSync(path.join(W, 'g6', 'envcheck.txt'), 'utf8'); } catch { /* checked below */ }
  ok(r.rc === 0 && /resource\/map\/multi\/a\/map: DOC_MAP_LOOSE_SHADOWS_PAK loose map file shadows pak copy in dlc1\.pak/.test(t), 'envcheck goh: root pak (no resource/map/) read, no crash', r.o + r.e + t);
}
fs.rmSync(W, { recursive: true, force: true });
console.log(fail ? `games-test: ${fail} FAIL` : 'games-test: PASS');
process.exitCode = fail ? 1 : 0;

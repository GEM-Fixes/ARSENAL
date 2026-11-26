#!/usr/bin/env node
// games-test (game parity): check hands the target game to doctor. mowas2 = doctor --exe mowas_2 on the shared AS2 install (a Min-only
// modern mod is dropped there, not on as64); goh = a mod in <GoH>/mods is checked in place against the GoH install (target goh, doctor
// --exe goh: every linter runs, no GAME_SKIP), a GoH mod elsewhere gets an overlay of the GoH install, mod.info bounds below 2 pick goh;
// bad --target / --exe stop with one line. made-up fixtures under os.tmpdir(); no install is read (AS2_GAME/GOH_GAME point at fixtures).
// Author: Imperator_Aug (ARSENAL, ia-8a5f73ab)
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const CHK = path.join(__dirname, '..', 'check.js');
let bad = 0;
const ok = (c, m, x) => { if (!c) { bad++; console.log('FAIL: ' + m + (x ? '\n' + x : '')); } };
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'check-games-'));
const wr = (p, s) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };
const A = path.join(T, 'as2'), H = path.join(T, 'goh');
const env = { AS2_GAME: A, AS2_NO_STEAM: '1', GOH_GAME: H, ARSENAL_CACHE: path.join(T, 'cache') };
const WT = require('../../lib/test/wait');   // children: backstop 5 min, killed: once more with twice the limit (never a hang)
const run = args => { const r = WT.spawnSync(process.execPath, [CHK, ...args], { encoding: 'utf8', maxBuffer: 1 << 26, env: { ...process.env, ...env } }); return { rc: r.status, o: r.stdout || '', e: r.stderr || '' }; };
const json = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return {}; } };
try {
  // shared AS2 install: as64.exe + mowas_2.exe + as64/plus; mod d = modern (Min 3.301, no Max)
  wr(path.join(A, 'as64.exe'), ''); wr(path.join(A, 'mowas_2.exe'), ''); fs.mkdirSync(path.join(A, 'resource'), { recursive: true });
  wr(path.join(A, 'as64', 'plus', 'mod.info'), '{Mod\r\n\t{Name "as64+"}\r\n\t{MinGameVersion "3.301"}\r\n}\r\n');
  wr(path.join(A, 'mods', 'd', 'mod.info'), '{Mod\r\n\t{Name "d"}\r\n\t{MinGameVersion "3.301"}\r\n}\r\n');
  wr(path.join(A, 'mods', 'd', 'resource', 'set', 'a.set'), '{set}\r\n');
  const j1 = path.join(T, 'm.json'), m = run([path.join(A, 'mods', 'd'), '--game', A, '--exe', 'mowas2', '--only', 'modinfo', '--json', j1]);
  const R1 = json(j1);
  ok(R1.target === 'mowas2', 'mowas2: target', m.o + m.e);
  ok((R1.notes || []).some(n => /^NOT_MOUNTED "d": no MaxGameVersion/.test(n)), 'mowas2: doctor did not lint as mowas_2 (Min-only modern mod must be dropped)', m.o + m.e);
  const j2 = path.join(T, 'a.json'), a = run([path.join(A, 'mods', 'd'), '--game', A, '--exe', 'as64', '--only', 'modinfo', '--json', j2]);
  ok(!(json(j2).notes || []).some(n => /NOT_MOUNTED/.test(n)) && /DOCTOR: mounted as64\+, d;/.test(a.o), 'as64: doctor as before (as64+ first, not dropped)', a.o + a.e);
  // stackchecks (preflight) build the stack for the target: k.def as game_entity in as64/core, as actor in the mod. as64 stack: one stem on
  // two classes; mowas_2 stack (no as64/core): nothing
  wr(path.join(A, 'as64', 'core', 'resource', 'entity', 'pw', 'k1', 'k.def'), '{game_entity\r\n}\r\n');
  wr(path.join(A, 'mods', 's', 'mod.info'), '{Mod\r\n\t{Name "s"}\r\n\t{MinGameVersion "3.0"}\r\n\t{MaxGameVersion "9.0"}\r\n}\r\n');
  wr(path.join(A, 'mods', 's', 'resource', 'entity', 'pw', 'k2', 'k.def'), '{actor\r\n}\r\n');
  const SC = require('../stackchecks'), has = rs => rs.some(x => x.code === 'PREFLIGHT_STEM_TWO_CLASSES');
  ok(has(SC.run({ game: A, modId: 's' })), 'stackchecks as64 (default): as64/core def not in the stack');
  ok(!has(SC.run({ game: A, modId: 's', exe: 'mowas_2' })), 'stackchecks mowas_2: as64/core mounted for MoW:AS2');
  fs.rmSync(path.join(A, 'as64', 'core', 'resource'), { recursive: true, force: true });
  // GoH install with a mod in its mods/: no flags at all -> target goh, in place, doctor on the GoH install
  wr(path.join(H, 'binaries', 'x64', 'call_to_arms.exe'), ''); fs.mkdirSync(path.join(H, 'resource'), { recursive: true });
  wr(path.join(H, 'mods', 'g', 'mod.info'), '{mod\r\n\t{name "g"}\r\n\t{minGameVersion "1.050"}\r\n}\r\n');
  wr(path.join(H, 'mods', 'g', 'resource', 'set', 'a.set'), '{set}\r\n');
  const j3 = path.join(T, 'g.json'), g = run([path.join(H, 'mods', 'g'), '--exe', 'goh', '--only', 'modinfo,uilint,binhdr', '--json', j3]);
  const R3 = json(j3);
  ok(/^MODE in-place: mod sits under .*goh\/mods/m.test(g.o), 'goh in <GoH>/mods: in place', g.o + g.e);
  ok(R3.target === 'goh', 'goh: target', g.o);
  // every linter runs on GoH now (lib/registry has no games limit: uilint GoH tables, binhdr GoH cell 5): no GAME_SKIP note, doctor exe goh
  ok(!(R3.notes || []).some(n => /^GAME_SKIP/.test(n)), 'goh: GAME_SKIP note for uilint/binhdr (registry has no games limit)', g.o + g.e);
  ok(/DOCTOR: mounted g;/.test(g.o), 'goh: doctor mounted the mod in the GoH install', g.o);
  ok(!/VER_MISSING/.test(g.o), 'goh: modinfo judged the Min-only mod.info by AS2 rules (VER_MISSING)', g.o);
  ok(/^VERDICT goh: /m.test(g.o), 'goh: wouldload verdict', g.o);
  // no --exe, no --target: a mod in <GoH>/mods picks goh by itself
  const j4 = path.join(T, 'g2.json'); run([path.join(H, 'mods', 'g'), '--only', 'modinfo', '--json', j4]);
  ok(json(j4).target === 'goh', 'goh: default target in <GoH>/mods', JSON.stringify(json(j4).target));
  // a GoH mod outside any mods/ (Min 1.05, Max 1.2): target goh by mod.info, overlay of the GoH install (not the AS2 one)
  const o = path.join(T, 'work', 'gx'); wr(path.join(o, 'mod.info'), '{mod\r\n\t{name "gx"}\r\n\t{minGameVersion "1.050"}\r\n\t{maxGameVersion "1.200"}\r\n}\r\n');
  wr(path.join(o, 'resource', 'set', 'a.set'), '{set}\r\n');
  const wlc = () => { try { return fs.readdirSync(path.join(T, 'cache', 'wouldload')).length; } catch { return 0; } };
  const n0 = wlc(), j5 = path.join(T, 'o.json'), ov = run([o, '--goh', H, '--only', 'modinfo,uilint', '--json', j5]);
  // an overlay is a new game folder each run: its refcheck cache stays in the overlay's temp folder, never in the shared cache folder
  ok(wlc() === n0, 'outside: overlay run wrote a wouldload cache into the shared cache folder', String(n0) + ' -> ' + wlc());
  // --fast on a GoH mod outside <GoH>/mods: wouldload reads the folder against the GoH install itself (no overlay rebuild, p-rec1)
  const jf = path.join(T, 'of.json'), fr = run([o, '--goh', H, '--fast', '--json', jf]);
  ok((json(jf).notes || []).some(n => /^FAST_DIRECT wouldload read the mod folder .*work\/gx against the GoH install .*\/goh /.test(n)) && /^VERDICT goh: /m.test(fr.o) && json(jf).target === 'goh', 'outside --fast goh: wouldload direct on the GoH install', fr.o + fr.e);
  ok(/^READ goh: .*NOT mounted: folder is not under .*goh\/mods/m.test(fr.o), 'outside --fast goh: wouldload read the source folder, not the overlay copy', fr.o);
  ok(json(j5).target === 'goh', 'outside: mod.info bounds below 2 = goh', ov.o + ov.e);
  ok(/^MODE outside-mods: overlay game dir built from base .*\/goh /m.test(ov.o), 'outside: overlay not built on the GoH install', ov.o + ov.e);
  ok(/DOCTOR: mounted gx;/.test(ov.o) && !(json(j5).notes || []).some(n => /^GAME_SKIP/.test(n)), 'outside: doctor not on the GoH overlay', ov.o);
  ok(fs.readdirSync(path.join(H, 'mods')).join(',') === 'g', 'outside: GoH mods/ written', fs.readdirSync(path.join(H, 'mods')).join(','));
  // same GoH mod given --target as64: overlay on the AS2 install, doctor as AS64 (no GAME_SKIP)
  const j6 = path.join(T, 'o6.json'), x = run([o, '--target', 'as64', '--only', 'modinfo,uilint', '--json', j6]);
  ok(json(j6).target === 'as64' && /built from base .*\/as2 /.test(x.o) && !(json(j6).notes || []).some(n => /GAME_SKIP/.test(n)), '--target as64: AS2 overlay, no GoH filter', x.o + x.e);
  // "any"/"any" (GoH open form, PORT-46) outside any mods/: target goh, not as64
  const oa = path.join(T, 'work', 'ga'); wr(path.join(oa, 'mod.info'), '{mod\r\n\t{name "ga"}\r\n\t{minGameVersion "any"}\r\n\t{maxGameVersion "any"}\r\n}\r\n');
  wr(path.join(oa, 'resource', 'set', 'a.set'), '{set}\r\n');
  const j7 = path.join(T, 'o7.json'), ya = run([oa, '--only', 'modinfo', '--json', j7]);
  ok(json(j7).target === 'goh' && /built from base .*\/goh /.test(ya.o), '"any"/"any": target goh on the GoH overlay', ya.o + ya.e);
  // newmod --target goh writes Min = Max = the exe version (1.067 for an exe with no PE version, as modinfo and lib/vfs read it): check picks
  // goh from those bounds, doctor mounts it (no NOT_MOUNTED), modinfo raises no version finding and wouldload's gate lets it load
  const nm = path.join(T, 'work', 'ngoh');
  const nr = WT.spawnSync(process.execPath, [path.join(__dirname, '..', '..', 'newmod', 'newmod.js'), nm, '--name', 'Ngoh', '--target', 'goh', '--game', H, '--game-version', '1.067', '-q'], { encoding: 'utf8', env: { ...process.env, ...env } });
  const ninfo = (() => { try { return fs.readFileSync(path.join(nm, 'mod.info'), 'latin1'); } catch { return ''; } })();
  ok(/MinGameVersion "1\.067"/.test(ninfo) && /MaxGameVersion "1\.067"/.test(ninfo), 'newmod goh: mod.info bounds 1.067/1.067', ninfo + (nr.stderr || ''));
  const j9 = path.join(T, 'n9.json'), nc = run([nm, '--only', 'modinfo', '--json', j9]), R9 = json(j9);
  ok(R9.target === 'goh' && /built from base .*\/goh /.test(nc.o), 'newmod goh: target goh on the GoH overlay', nc.o + nc.e);
  ok(!(R9.notes || []).some(n => /NOT_MOUNTED/.test(n)) && /DOCTOR: mounted ngoh;/.test(nc.o), 'newmod goh: doctor dropped the 1.067 mod', nc.o);
  ok(!(R9.findings || []).some(f => /VER|VERSION/.test(f.code || '')), 'newmod goh: modinfo version finding on 1.067/1.067', JSON.stringify(R9.findings));
  // wouldload's gate: never REFUSED for goh (the fixture exe has no PE version: UNKNOWN, not compared; the real 1.0.6.7 exe: LOADS_STATIC)
  ok(/^VERDICT goh: (LOADS_STATIC|UNKNOWN: GoH exe version unknown)/m.test(nc.o), 'newmod goh: wouldload gate disagrees with modinfo', nc.o);
  ok(/^mod\.info: Min "1\.067" Max "1\.067" \(GoH range\)/m.test(nc.o), 'newmod goh: mod.info line uses the as64 mode word', nc.o);
  // --goh alone does not move an AS2 mod out of place: <AS2>/mods/d with --goh H is still checked in place
  const ip = run([path.join(A, 'mods', 'd'), '--goh', H, '--only', 'modinfo', '--json', path.join(T, 'o8.json')]);
  ok(/^MODE in-place: mod sits under .*as2\/mods/m.test(ip.o), '--goh alone: AS2 mod in place', ip.o + ip.e);
  // doctor killed by the timer: the error says so (CHECK_TOOL_TIMEOUT_MS test hook), the DOCTOR line does not claim "no game"
  // (wouldload is stopped too and says so). The timer is 10 ms: no node child starts and finishes in that time, so the doctor is always
  // still running when it fires. The old 0.3 s raced: the doctor of this two-file fixture often finished inside 0.3 s on a fast machine.
  const to = WT.spawnSync(process.execPath, [CHK, path.join(A, 'mods', 'd')], { encoding: 'utf8', maxBuffer: 1 << 26, env: { ...process.env, ...env, CHECK_TOOL_TIMEOUT_MS: '10' } });
  ok(/doctor was stopped after 0\.01 s \(timeout\)/.test(to.stdout) && /DOCTOR: stopped after 0\.01 s \(timeout\)/.test(to.stdout) && !/no game: folder tools only/.test(to.stdout), 'timeout: named', to.stdout + to.stderr);
  // bad words stop with one line
  const b1 = run([o, '--target', 'mow3']); ok(b1.rc === 2 && /^Unknown --target mow3/.test(b1.e), 'bad --target', b1.e);
  const b2 = run([o, '--exe', 'as64,foo']); ok(b2.rc === 2 && /^Unknown --exe foo/.test(b2.e), 'bad --exe', b2.e);
} finally { fs.rmSync(T, { recursive: true, force: true }); }
console.log(bad ? `games-test: ${bad} FAIL` : 'games-test: PASS');
process.exitCode = bad ? 1 : 0;

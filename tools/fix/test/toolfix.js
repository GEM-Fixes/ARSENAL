// TOOLFIX seeded defects 2,3,4,7). everything in a temp dir under os.tmpdir; tracked fixtures are not touched.
//   2 mod outside mods/ with vanilla .lng in a top-level localization.pak: staged base must read it (lng fix found, not "lng: 0 ... static clean")
//   3 a junction-installed required mod and a junctioned top-level game dir are seen (no "required mod is not installed")
//   4 exit codes: refused / not mounted = 2, a normal run = 0, --help = 0
//   7 apply rerun that changes nothing keeps the previous patch (KEPT), no .fixtmp sibling left
// Author: Imperator_Aug (ARSENAL, ia-2cda9805)
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const zw = require('../../lib/zipwrite');
const FIX = path.join(__dirname, '..', 'fix.js');
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'toolfix-fix-'));
let bad = 0;
const ok = (c, m) => { if (!c) { bad++; console.log('ASSERT ' + m); } };
const run = (args, game) => { const r = cp.spawnSync(process.execPath, [FIX, ...args, ...(game ? ['--game', game, '--cache', path.join(T, 'rc.json')] : [])], { encoding: 'utf8' }); return { rc: r.status, o: (r.stdout || '') + (r.stderr || '') }; };
const links = [];
const junction = (t, l) => { fs.symlinkSync(t, l, 'junction'); links.push(l); };
try {
  cp.execFileSync(process.execPath, [path.join(__dirname, 'mkfixture.js'), path.join(T, 'fx')]);
  const G = path.join(T, 'fx', 'game');
  // vanilla localization/ -> top-level localization.pak (as in the real install)
  const L = path.join(G, 'localization');
  zw.writeZip(path.join(G, 'localization.pak'), fs.readdirSync(L).map(n => [n, fs.readFileSync(path.join(L, n)), true]));
  fs.rmSync(L, { recursive: true });
  // resource/ moved out and junctioned back (top-level game dir as a junction)
  fs.renameSync(path.join(G, 'resource'), path.join(T, 'res'));
  junction(path.join(T, 'res'), path.join(G, 'resource'));

  // ---- 2: inside vs outside mods/ must read the same base and find the same lng merge
  const inR = run([path.join(G, 'mods', 'm1'), 'plan', '--out', path.join(T, 'p-in')], G);
  fs.cpSync(path.join(G, 'mods', 'm1'), path.join(T, 'outside', 'm1'), { recursive: true });
  const outR = run([path.join(T, 'outside', 'm1'), 'plan', '--out', path.join(T, 'p-out')], G);
  const base = s => (/base (\d+) files/.exec(s) || [])[1];
  ok(/lng: 1 mod \.lng replace a base file/.test(inR.o), '2 in-mods lng line: ' + inR.o.split('\n').find(l => /^lng:/.test(l)));
  ok(/lng: 1 mod \.lng replace a base file/.test(outR.o), '2 outside lng line (staged localization.pak empty?): ' + outR.o.split('\n').find(l => /^lng:/.test(l)));
  ok(base(inR.o) && base(inR.o) === base(outR.o), `2 base files in ${base(inR.o)} vs outside ${base(outR.o)}`);
  ok(outR.rc === 0 && inR.rc === 0, `2 rc in ${inR.rc} outside ${outR.rc}`);

  // ---- 3: Require on a mod installed as a junction in mods/
  const dep = path.join(T, 'depsrc', 'dep');
  fs.mkdirSync(path.join(dep, 'resource'), { recursive: true });
  fs.writeFileSync(path.join(dep, 'mod.info'), '{Mod\r\n\t{Name "dep"}\r\n\t{MinGameVersion "3.262.1"}\r\n\t{MaxGameVersion "3.262.1"}\r\n}\r\n');
  junction(dep, path.join(G, 'mods', 'dep'));
  const m5 = path.join(T, 'outside', 'm5');
  fs.cpSync(path.join(G, 'mods', 'm3'), m5, { recursive: true });
  fs.writeFileSync(path.join(m5, 'mod.info'), '{Mod\r\n\t{Name "m5"}\r\n\t{MinGameVersion "3.262.1"}\r\n\t{MaxGameVersion "3.262.1"}\r\n\t{Require "dep"}\r\n}\r\n');
  const r3 = run([m5, 'plan', '--out', path.join(T, 'p5')], G);
  ok(!/FIX_NOT_MOUNTED|is not installed/.test(r3.o) && /deps dep/.test(r3.o), '3 junction dep not seen: ' + r3.o.split('\n').filter(l => /NOT_MOUNTED|READ/.test(l)).join(' | '));

  // ---- 4: exit codes
  const r4a = run([path.join(G, 'mods', 'm1'), 'plan', '--out', path.join(G, 'mods', 'm1', 'sub')], G);
  ok(r4a.rc === 2 && /FIX_OUT_REFUSED/.test(r4a.o), '4 refused rc ' + r4a.rc);
  const m6 = path.join(T, 'outside', 'm6');
  fs.cpSync(m5, m6, { recursive: true });
  fs.writeFileSync(path.join(m6, 'mod.info'), '{Mod\r\n\t{Name "m6"}\r\n\t{MinGameVersion "3.301"}\r\n\t{Require "nosuchmod"}\r\n}\r\n');
  const r4b = run([m6, 'plan', '--out', path.join(T, 'p6')], G);
  ok(r4b.rc === 2 && /FIX_NOT_MOUNTED/.test(r4b.o), '4 not mounted rc ' + r4b.rc);
  ok(!/static clean/.test(r4b.o), '4 not mounted said static clean');
  // ---- 8 GX broke B3: a bad mod.info gets the modinfo fixer; the other fixers still plan; the refcheck line is plain
  const m8 = path.join(T, 'outside', 'm8'), mi = t => fs.writeFileSync(path.join(m8, 'mod.info'), '{Mod\r\n\t{Name "m8"}\r\n' + t + '}\r\n');
  fs.cpSync(m5, m8, { recursive: true });
  mi('\t{MinGameVersion "3.100"}\r\n');
  const r8 = run([m8, 'plan'], G);
  ok(r8.rc === 0 && /modinfo mod\.info\.fixed: MinGameVersion "3\.100" does not fit the as64 game: set to 3\.301/.test(r8.o), '8 modinfo not planned as64: ' + r8.o.split('\n').filter(l => /modinfo|FIX_/.test(l)).join(' | '));
  ok(/FIX_REFCHECK_FAILED path fixes \(repoint\) skipped: .*other fixers still ran/.test(r8.o), '8 plain refcheck line missing');
  ok(/lng: \d+ mod \.lng/.test(r8.o) && /stubmtl:/.test(r8.o), '8 other fixers did not plan');
  ok(/set to 3\.262\.0; MaxGameVersion was missing: set to 3\.262\.1/.test(run([m8, 'plan', '--target', 'classic'], G).o), '8 classic form');
  const p8 = path.join(T, 'p8');
  run([m8, 'apply', '--out', p8], G);
  const fx8 = fs.existsSync(path.join(p8, 'mod.info.fixed')) && fs.readFileSync(path.join(p8, 'mod.info.fixed'), 'latin1');
  ok(fx8 === '{Mod\r\n\t{Name "m8"}\r\n\t{MinGameVersion "3.301"}\r\n}\r\n', '8 mod.info.fixed bytes: ' + JSON.stringify(fx8));
  ok(/MinGameVersion "3\.301"/.test(fs.readFileSync(path.join(p8, 'mod.info'), 'latin1')), '8 patch mod.info range');
  ok(/MinGameVersion "3\.100"/.test(fs.readFileSync(path.join(m8, 'mod.info'), 'latin1')), '8 source mod.info touched');
  mi('\t{MinGameVersion "3.301"}\r\n\t{MaxGameVersion "3.301"}\r\n');
  ok(/MaxGameVersion "3\.301" removed/.test(run([m8, 'plan'], G).o), '8 Max not removed');
  mi('');
  ok(/MinGameVersion was missing: set to 3\.301/.test(run([m8, 'plan'], G).o), '8 missing Min');
  mi('\t{MinGameVersion "3.262.0"}\r\n\t{MaxGameVersion "3.262.1"}\r\n');
  ok(/modinfo: mod\.info version range already fits/.test(run([m8, 'plan'], G).o), '8 good classic range touched');
  mi('\t{MinGameVersion "3.100"}\r\n\t{Require "nosuchmod"}\r\n');   // unmounted: modinfo fixer still runs, a line says why the rest did not
  const r8u = run([m8, 'plan'], G);
  ok(/only the mod\.info fixer ran/.test(r8u.o) && /modinfo mod\.info\.fixed/.test(r8u.o), '8 unmounted: ' + r8u.o.split('\n').filter(l => /NOTE|modinfo|FIX_/.test(l)).join(' | '));
  ok(run(['--help']).rc === 0, '4 --help rc');

  // ---- 7: apply, then a rerun that changes nothing keeps the patch
  const pk = path.join(T, 'pk');
  const r7a = run([path.join(G, 'mods', 'm1'), 'apply', '--out', pk], G);
  ok(fs.existsSync(path.join(pk, 'mod.info')), '7 first apply wrote no patch: ' + r7a.o.split('\n').find(l => /^CHANGED/.test(l)));
  const before = fs.readdirSync(pk).sort().join();
  const r7b = run([path.join(G, 'mods', 'm1'), 'apply', '--out', pk, '--only', 'set'], G);
  ok(/KEPT: /.test(r7b.o), '7 no KEPT line');
  ok(fs.existsSync(pk) && fs.readdirSync(pk).sort().join() === before, '7 previous patch deleted by a no-change rerun');
  ok(!fs.readdirSync(T).some(n => /\.fixtmp-/.test(n)), '7 .fixtmp sibling left');
  // rerun that changes something replaces the patch in place
  const r7c = run([path.join(G, 'mods', 'm1'), 'apply', '--out', pk], G);
  ok(r7c.rc === 0 && fs.existsSync(path.join(pk, 'mod.info')) && !/KEPT/.test(r7c.o), '7 rerun with changes did not replace the patch');
} finally {
  for (const l of links.reverse()) { try { fs.rmdirSync(l); } catch { /* gone */ } }
  fs.rmSync(T, { recursive: true, force: true });
}
console.log(bad ? `${bad} TOOLFIX assertion(s) failed` : 'toolfix assertions held');
process.exitCode = bad ? 1 : 0;

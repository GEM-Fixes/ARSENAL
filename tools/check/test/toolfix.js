// TOOLFIX seeded defects for check 3, 4). everything in a temp dir under os.tmpdir; tracked fixtures untouched.
//   3 a junction-installed required mod in mods/ and a junctioned top-level game dir are seen from an outside mod (overlay)
//   4 exit codes: LOADS_STATIC 0, REFUSED 1, usage 2, --help 0
// Author: Imperator_Aug (ARSENAL, ia-19549c66)
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const CHK = path.join(__dirname, '..', 'check.js');
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'toolfix-check-'));
let bad = 0;
const ok = (c, m) => { if (!c) { bad++; console.log('ASSERT ' + m); } };
const run = args => { const r = cp.spawnSync(process.execPath, [CHK, ...args], { encoding: 'utf8', maxBuffer: 1 << 26 }); return { rc: r.status, o: (r.stdout || '') + (r.stderr || '') }; };
const links = [];
const junction = (t, l) => { fs.symlinkSync(t, l, 'junction'); links.push(l); };
const info = (n, extra = '') => `{Mod\r\n\t{Name "${n}"}\r\n\t{MinGameVersion "3.262.1"}\r\n\t{MaxGameVersion "3.262.1"}\r\n${extra}}\r\n`;
try {
  cp.execFileSync(process.execPath, [path.join(__dirname, '..', '..', 'fix', 'test', 'mkfixture.js'), path.join(T, 'fx')]);
  const G = path.join(T, 'fx', 'game');
  fs.renameSync(path.join(G, 'resource'), path.join(T, 'res'));
  junction(path.join(T, 'res'), path.join(G, 'resource'));
  const dep = path.join(T, 'depsrc', 'dep');
  fs.mkdirSync(path.join(dep, 'resource'), { recursive: true });
  fs.writeFileSync(path.join(dep, 'mod.info'), info('dep'));
  junction(dep, path.join(G, 'mods', 'dep'));
  const m5 = path.join(T, 'outside', 'm5');
  fs.cpSync(path.join(G, 'mods', 'm1'), m5, { recursive: true });
  fs.writeFileSync(path.join(m5, 'mod.info'), info('m5', '\t{Require "dep"}\r\n'));
  const r3 = run([m5, '--game', G, '--exe', 'mowas2']);
  ok(/^MODE outside-mods/m.test(r3.o), '3 no overlay MODE line');
  ok(!/nosuch|not installed|REQUIRE_MISSING|Require.*missing/i.test(r3.o), '3 junction dep reported missing: ' + r3.o.split('\n').filter(l => /dep/.test(l)).join(' | '));
  ok(/^VERDICT mowas2: LOADS_STATIC/m.test(r3.o), '3/4 verdict: ' + (r3.o.match(/^VERDICT.*$/m) || [''])[0]);
  ok(r3.rc === 0, '4 LOADS_STATIC rc ' + r3.rc);
  ok(/READ mowas2: 8 mod files/.test(r3.o), '3 read line: ' + (r3.o.match(/^READ.*$/m) || [''])[0]);
  // refused: legacy mod.info without MaxGameVersion
  const m6 = path.join(T, 'outside', 'm6');
  fs.cpSync(path.join(G, 'mods', 'm1'), m6, { recursive: true });
  fs.writeFileSync(path.join(m6, 'mod.info'), '{Mod\r\n\t{Name "m6"}\r\n\t{MinGameVersion "3.262.1"}\r\n}\r\n');
  const r4 = run([m6, '--game', G, '--exe', 'mowas2']);
  ok(/^VERDICT mowas2: REFUSED/m.test(r4.o), '4 refused verdict: ' + (r4.o.match(/^VERDICT.*$/m) || [''])[0]);
  ok(r4.rc === 1, '4 REFUSED rc ' + r4.rc);
  // T-DOORFIX: exit follows the mod's own target, other builds are info. the fixture game has only mowas_2.exe, so as64 verdicts here are UNKNOWN
  // (the real as64 LOADS_STATIC + mowas2 REFUSED run is tools/dist/test/door.js)
  const m8 = path.join(T, 'outside', 'm8');
  fs.cpSync(path.join(G, 'mods', 'm1'), m8, { recursive: true });
  fs.writeFileSync(path.join(m8, 'mod.info'), info('m8'));
  const r8 = run([m8, '--game', G, '--exe', 'as64,mowas2']);
  ok(/^VERDICT mowas2: LOADS_STATIC/m.test(r8.o) && /^VERDICT as64: UNKNOWN/m.test(r8.o), '8 verdicts: ' + (r8.o.match(/^VERDICT.*$/gm) || []).join(' | '));
  ok(r8.rc === 0, '8 Max 3.262 mod targets mowas2: LOADS_STATIC rc 0 though as64 UNKNOWN, rc ' + r8.rc);
  ok(/^NOTE: exit code follows the target build mowas2; as64 UNKNOWN/m.test(r8.o), '8 info note');
  ok(run([m8, '--game', G, '--exe', 'as64,mowas2', '--target', 'as64']).rc === 2, '8 --target as64 follows as64 UNKNOWN rc 2');
  const m7 = path.join(T, 'outside', 'm7');
  fs.cpSync(path.join(G, 'mods', 'm1'), m7, { recursive: true });
  fs.writeFileSync(path.join(m7, 'mod.info'), '{Mod\r\n\t{Name "m7"}\r\n\t{MinGameVersion "3.301"}\r\n}\r\n');
  ok(run([m7, '--game', G, '--exe', 'as64,mowas2', '--target', 'mowas2']).rc === 1, '7 --target mowas2 on a 3.301 mod: REFUSED rc 1');
  ok(run([path.join(T, 'nope')]).rc === 2, '4 usage rc');
  ok(run(['--help']).rc === 0, '4 --help rc');
} finally {
  for (const l of links.reverse()) { try { fs.rmdirSync(l); } catch { /* gone */ } }
  fs.rmSync(T, { recursive: true, force: true });
}
console.log(bad ? `${bad} TOOLFIX assertion(s) failed` : 'toolfix assertions held');
process.exitCode = bad ? 1 : 0;

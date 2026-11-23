// --exe: the game's own vfs view (game parity). Made-up fixture in a temp folder:
//   G = an AS2 install with as64.exe + mowas_2.exe; as64/core is a source of its own under AS64 only
//   H = a GoH install (binaries/x64/call_to_arms.exe): --clean into the install is refused with the writeguard line
// Author: Imperator_Aug (ARSENAL, ia-83e8cc61)
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const tool = path.join(__dirname, '..', 'conflicts.js');
const W = fs.mkdtempSync(path.join(os.tmpdir(), 'conflicts-exe-'));
const put = (rel, s) => { const f = path.join(W, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s, 'latin1'); };
let bad = 0;
const ok = (c, m, out) => { if (c) console.log('OK ' + m); else { bad++; console.log('FAIL ' + m + '\n' + out); } };
const run = (...a) => { const r = cp.spawnSync(process.execPath, [tool, ...a], { encoding: 'utf8' }); return { code: r.status, out: (r.stdout || '') + (r.stderr || '') }; };
const info = n => '{mod\r\n {Name "' + n + '"}\r\n {MinGameVersion "3.0"}\r\n {MaxGameVersion "3.300"}\r\n}\r\n';
try {
  put('G/as64.exe', 'MZ'); put('G/mowas_2.exe', 'MZ');
  put('G/resource/set/a.def', '{e\r\n {hp 1}\r\n}\r\n');
  put('G/as64/core/resource/set/a.def', '{e\r\n {hp 2}\r\n}\r\n');
  put('G/mods/ma/mod.info', info('ma')); put('G/mods/ma/resource/set/a.def', '{e\r\n {hp 3}\r\n}\r\n');
  const G = path.join(W, 'G');
  let r = run('--game', G, '--mods', 'ma');
  ok(/vanilla=1 \| as64\/core=2 \| ma=3/.test(r.out), 'no --exe: as before, as64/core is a source', r.out);
  r = run('--game', G, '--mods', 'ma', '--exe', 'mowas_2');
  ok(/vanilla=1 \| ma=3/.test(r.out) && !/as64\/core/.test(r.out), '--exe mowas_2: no as64/core source', r.out);
  r = run('--game', G, '--mods', 'ma', '--exe', 'mowas2');
  ok(/vanilla=1 \| ma=3/.test(r.out), '--exe mowas2 (GUI id) = mowas_2', r.out);
  put('G/mods/mb/mod.info', '{mod\r\n {Name "mb"}\r\n {MinGameVersion "3.301"}\r\n}\r\n'); put('G/mods/mb/resource/set/a.def', '{e\r\n {hp 4}\r\n}\r\n');
  r = run('--game', G, '--mods', 'ma,mb', '--exe', 'mowas_2');
  ok(/VFS_MOD_VERSION/.test(r.out) && /vanilla=1 \| ma=3/.test(r.out) && !/mb=4/.test(r.out), '--exe mowas_2: a mod MoW:AS2 skips (Min 3.301) is left out, VFS_MOD_VERSION shown', r.out);
  r = run('--game', G, '--mods', 'ma', '--exe', 'x');
  ok(r.code === 2 && /--exe must be one of/.test(r.out), 'bad --exe: exit 2', r.out);

  // the AS64 gate: under AS64 a mod whose range does not fit is not skipped quietly, the game stops (VFS-48/54/59, ENG-26):
  // it is named as refused and left out of the compare
  put('G/mods/old/mod.info', '{mod\r\n {Name "old"}\r\n {MinGameVersion "3.0"}\r\n {MaxGameVersion "3.100"}\r\n}\r\n'); put('G/mods/old/resource/set/a.def', '{e\r\n {hp 9}\r\n}\r\n');
  put('G/mods/bare/mod.info', '{mod\r\n {Name "bare"}\r\n}\r\n'); put('G/mods/bare/resource/set/a.def', '{e\r\n {hp 8}\r\n}\r\n');
  r = run('--game', G, '--mods', 'ma,old,bare', '--fmt', 'json');
  let aj = null; try { aj = JSON.parse(r.out); } catch (e) { aj = null; }
  ok(aj && aj.order.join() === 'ma' && aj.items.filter(x => x.code === 'CONFLICT_MOD_NOT_LOADED' && x.d.why === 'MOD_VERSION').map(x => x.d.mod).sort().join() === 'bare,old' && !aj.items.some(x => x.d && x.d.values && x.d.values.some(v => v.src === 'old' || v.src === 'bare')), 'AS64: a mod out of range and a mod with no range are named as not loaded (why MOD_VERSION), not compared', r.out.slice(0, 900));
  r = run('--game', G, '--mods', 'ma,old,bare', '--no-version-check', '--fmt', 'json');
  try { aj = JSON.parse(r.out); } catch (e) { aj = null; }
  ok(aj && aj.order.length === 3 && !aj.items.some(x => x.code === 'CONFLICT_MOD_NOT_LOADED'), '--no-version-check: all three compared', r.out.slice(0, 900));
  put('H/binaries/x64/call_to_arms.exe', 'MZ');
  put('H/resource/set/a.def', '{e\r\n {hp 1}\r\n}\r\n');
  put('H/mods/ga/mod.info', '{mod\r\n {name "ga"}\r\n {minGameVersion "1.0"}\r\n}\r\n'); put('H/mods/ga/resource/set/a.def', '{e\r\n {hp 7}\r\n}\r\n');
  const H = path.join(W, 'H');
  r = run('--game', H, '--mods', 'ga', '--exe', 'goh');
  ok(/vanilla=1 \| ga=7/.test(r.out), '--exe goh: GoH vfs read, mod ga mounted', r.out);
  r = run('--game', H, '--mods', 'ga', '--exe', 'goh', '--clean', 'ga', '--out', path.join(H, 'resource', 'clean'));
  ok(r.code === 2 && !fs.existsSync(path.join(H, 'resource', 'clean')) && /Gates of Hell|GoH|install/i.test(r.out), '--exe goh --clean into the GoH game files: writeguard refusal, nothing written', r.out);
  r = run('--game', H, '--mods', 'ga', '--exe', 'goh', '--itm', '--clean', 'ga', '--out', path.join(W, 'cleanout'));
  ok(r.code === 0 && fs.existsSync(path.join(W, 'cleanout', 'resource', 'set', 'a.def')), '--exe goh --clean outside the install: written', r.out);
  // GoH load order: mods of an equal Require count are applied in mod.info Priority order, the higher later (GHVFS-25, GHVFS-36):
  // the order is declared, so no MOD_ORDER_UNDECLARED; without Priority (both 1) the list order stands and the pair is flagged
  const ginfo = (n, pr) => '{mod\r\n {name "' + n + '"}\r\n' + (pr === undefined ? '' : ' {priority ' + pr + '}\r\n') + '}\r\n';
  put('H/mods/gp/mod.info', ginfo('gp', 5)); put('H/mods/gp/resource/set/a.def', '{e\r\n {hp 5}\r\n}\r\n');
  put('H/mods/gq/mod.info', ginfo('gq', 2)); put('H/mods/gq/resource/set/a.def', '{e\r\n {hp 2}\r\n}\r\n');
  let gj = null;
  r = run('--game', H, '--mods', 'gp,gq', '--exe', 'goh', '--fmt', 'json');
  try { gj = JSON.parse(r.out); } catch (e) { gj = null; }
  ok(gj && gj.order.join() === 'gq,gp' && !gj.items.some(x => x.code === 'MOD_ORDER_UNDECLARED') && gj.items.some(x => x.code === 'WARN_CONFLICT_MOD_MOD' && x.d.winner === 'gp'), 'GoH: Priority 5 loads after Priority 2 whatever the list order, the order is not "undeclared"', r.out.slice(0, 900));
  put('H/mods/gp/mod.info', ginfo('gp')); put('H/mods/gq/mod.info', ginfo('gq'));
  r = run('--game', H, '--mods', 'gp,gq', '--exe', 'goh', '--fmt', 'json');
  try { gj = JSON.parse(r.out); } catch (e) { gj = null; }
  ok(gj && gj.order.join() === 'gp,gq' && gj.items.some(x => x.code === 'WARN_CONFLICT_MOD_MOD' && x.d.winner === 'gq') && !gj.items.some(x => x.code === 'MOD_ORDER_UNDECLARED'), 'GoH: equal Priority keeps the list order; the game sorts the mods itself, so no MOD_ORDER_UNDECLARED line there', r.out.slice(0, 900));
  // GoH .pot: one msgctxt in two differently named files of two mods -> CONFLICT_LNG_KEY_CROSS on the file read later (name order)
  const pot = (k, t) => 'msgctxt "' + k + '"\r\nmsgid "' + t + '"\r\nmsgstr ""\r\n\r\n';
  put('H/mods/gp/localizations/default/interface/text/zz_gp.pot', pot('tank_x', 'Tank of gp') + pot('same_x', 'One text'));
  put('H/mods/gq/localizations/default/interface/text/aa_gq.pot', pot('tank_x', 'Tank of gq') + pot('same_x', 'One text'));
  r = run('--game', H, '--mods', 'gp,gq', '--exe', 'goh', '--fmt', 'json');
  try { gj = JSON.parse(r.out); } catch (e) { gj = null; }
  const cx = gj ? gj.items.filter(x => x.code === 'CONFLICT_LNG_KEY_CROSS') : [];
  ok(cx.length === 1 && cx[0].d.key === 'tank_x' && /zz_gp\.pot$/.test(cx[0].file), 'GoH .pot: one key in two differently named files of two mods is a clash; the same text in both is quiet', r.out.slice(0, 1200));
} finally { fs.rmSync(W, { recursive: true, force: true }); }
process.exit(bad ? 1 : 0);

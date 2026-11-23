// --exe: the game's own vfs view (game parity). Made-up fixture in a temp folder:
//   G = an AS2 install with as64.exe + mowas_2.exe; as64/core changes a.def, so AS64 and MoW:AS2 have different baselines
//   H = a GoH install (binaries/x64/call_to_arms.exe); its mod gm sits OUTSIDE the install (ARSENAL writes GoH mods there)
// Author: Imperator_Aug (ARSENAL, ia-9a9086a7)
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const tool = path.join(__dirname, '..', 'overdiff.js');
const W = fs.mkdtempSync(path.join(os.tmpdir(), 'overdiff-exe-'));
const put = (rel, s) => { const f = path.join(W, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s, 'latin1'); };
let bad = 0;
const ok = (c, m, out) => { if (c) console.log('OK ' + m); else { bad++; console.log('FAIL ' + m + '\n' + out); } };
const run = (...a) => { const r = cp.spawnSync(process.execPath, [tool, ...a], { encoding: 'utf8' }); return { code: r.status, out: (r.stdout || '') + (r.stderr || '') }; };
try {
  put('G/as64.exe', 'MZ'); put('G/mowas_2.exe', 'MZ');
  put('G/resource/set/a.def', '{e\r\n {hp 1}\r\n}\r\n');
  put('G/as64/core/resource/set/a.def', '{e\r\n {hp 2}\r\n}\r\n');
  put('G/mods/m/mod.info', '{mod\r\n {Name "m"}\r\n {MinGameVersion "3.0"}\r\n {MaxGameVersion "3.300"}\r\n}\r\n');
  put('G/mods/m/resource/set/a.def', '{e\r\n {hp 3}\r\n}\r\n');
  let r = run(path.join(W, 'G/mods/m'));
  ok(/hp: 2 -> 3/.test(r.out), 'no --exe: as before, baseline as64/core (hp 2 -> 3)', r.out);
  r = run(path.join(W, 'G/mods/m'), '--exe', 'as64');
  ok(/hp: 2 -> 3/.test(r.out), '--exe as64: baseline as64/core', r.out);
  r = run(path.join(W, 'G/mods/m'), '--exe', 'mowas_2');
  ok(/hp: 1 -> 3/.test(r.out) && !/as64\/core/.test(r.out), '--exe mowas_2: no as64/core, baseline the base game (hp 1 -> 3)', r.out);
  r = run(path.join(W, 'G/mods/m'), '--exe', 'mowas2');
  ok(/hp: 1 -> 3/.test(r.out), '--exe mowas2 (GUI id) = mowas_2', r.out);
  put('G/mods/n/mod.info', '{mod\r\n {Name "n"}\r\n {MinGameVersion "3.301"}\r\n}\r\n');
  put('G/mods/n/resource/set/a.def', '{e\r\n {hp 9}\r\n}\r\n');
  r = run(path.join(W, 'G/mods/n'), '--exe', 'mowas_2');
  ok(/VFS_MOD_VERSION/.test(r.out) && /OVR_UNREADABLE/.test(r.out) && !/hp: 1 -> 9/.test(r.out), '--exe mowas_2: a mod MoW:AS2 skips (Min 3.301) is not mounted, VFS_MOD_VERSION shown', r.out);
  r = run(path.join(W, 'G/mods/m'), '--exe', 'nosuch');
  ok(r.code === 2 && /--exe must be one of/.test(r.out), 'bad --exe: exit 2, one line', r.out);

  put('H/binaries/x64/call_to_arms.exe', 'MZ');
  put('H/resource/set/a.def', '{e\r\n {hp 1}\r\n {armor 4}\r\n}\r\n');
  put('out/gm/mod.info', '{mod\r\n {name "gm"}\r\n {minGameVersion "1.0"}\r\n}\r\n');
  put('out/gm/resource/set/a.def', '{e\r\n {hp 5}\r\n}\r\n');
  r = run(path.join(W, 'out/gm'), '--game', path.join(W, 'H'), '--exe', 'goh');
  ok(/hp: 1 -> 5/.test(r.out) && /OVR_FULL_SHADOW/.test(r.out) === false && /OVR_KEY_REMOVED/.test(r.out) && /1 files/.test(r.out), '--exe goh: mod folder outside the GoH install mounted by path and diffed', r.out);
  r = run(path.join(W, 'out/gm'), '--game', path.join(W, 'H'));
  ok(/OVR_UNREADABLE/.test(r.out), 'no --exe on a GoH folder outside <GoH>/mods: as before (not mounted)', r.out);
  // a GoH mod kept in an outside folder named 'mods' (the usual layout, writeguard forbids <GoH>/mods): the GoH install is still the base
  put('out2/mods/gm/mod.info', '{mod\r\n {name "gm"}\r\n {minGameVersion "1.0"}\r\n}\r\n');
  put('out2/mods/gm/resource/set/a.def', '{e\r\n {hp 5}\r\n}\r\n');
  { const e = cp.spawnSync(process.execPath, [tool, path.join(W, 'out2/mods/gm'), '--exe', 'goh'], { encoding: 'utf8', env: Object.assign({}, process.env, { GOH_GAME: path.join(W, 'H') }) });
    const out = (e.stdout || '') + (e.stderr || '');
    ok(/hp: 1 -> 5/.test(out) && /1 files/.test(out), '--exe goh, no --game, mod under an outside mods folder: GoH install is the base', out); }
} finally { fs.rmSync(W, { recursive: true, force: true }); }
process.exit(bad ? 1 : 0);

// --exe: the game's own vfs view (game parity). Made-up fixture in a temp folder:
//   G = an AS2 install with as64.exe + mowas_2.exe; as64/core changes set/a.def, so the effective file differs per game
//   H = a GoH install: the mod folder must sit outside it (writeguard); outside, the override is written and overdiff runs with --exe goh
// Author: Imperator_Aug (ARSENAL, ia-ed82808a)
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const tool = path.join(__dirname, '..', 'patch-entity.js');
const W = fs.mkdtempSync(path.join(os.tmpdir(), 'patch-entity-exe-'));
const put = (rel, s) => { const f = path.join(W, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s, 'latin1'); };
let bad = 0;
const ok = (c, m, out) => { if (c) console.log('OK ' + m); else { bad++; console.log('FAIL ' + m + '\n' + out); } };
const run = (...a) => { const r = cp.spawnSync(process.execPath, [tool, ...a], { encoding: 'utf8' }); return { code: r.status, out: (r.stdout || '') + (r.stderr || '') }; };
try {
  put('G/as64.exe', 'MZ'); put('G/mowas_2.exe', 'MZ');
  put('G/resource/set/a.def', '{e\r\n {hp 1}\r\n}\r\n');
  put('G/as64/core/resource/set/a.def', '{e\r\n {hp 2}\r\n}\r\n');
  const G = path.join(W, 'G'), M = path.join(W, 'mods2', 'p');
  fs.mkdirSync(M, { recursive: true });
  let r = run(M, '--game', G, '--file', 'resource/set/a.def', '--set', 'e/hp=9', '--dry-run');
  ok(/-2:  \{hp 2\}/.test(r.out) && /\+2:  \{hp 9\}/.test(r.out),'no --exe: effective file from as64/core (hp 2), as before', r.out);
  r = run(M, '--game', G, '--exe', 'mowas_2', '--file', 'resource/set/a.def', '--set', 'e/hp=9', '--dry-run');
  ok(/-2:  \{hp 1\}/.test(r.out) && /\+2:  \{hp 9\}/.test(r.out), '--exe mowas_2: effective file is the base game one (hp 1)', r.out);
  r = run(M, '--game', G, '--exe', 'zz', '--file', 'resource/set/a.def', '--set', 'e/hp=9');
  ok(r.code === 2 && /--exe must be one of/.test(r.out), 'bad --exe: exit 2', r.out);

  put('H/binaries/x64/call_to_arms.exe', 'MZ');
  put('H/resource/set/a.def', '{e\r\n {hp 1}\r\n}\r\n');
  const H = path.join(W, 'H');
  const inside = path.join(H, 'mods', 'gm'); fs.mkdirSync(inside, { recursive: true });
  r = run(inside, '--game', H, '--exe', 'goh', '--file', 'resource/set/a.def', '--set', 'e/hp=4');
  ok(r.code === 2 && r.out.trim().split(/\r?\n/).length === 1 && /Gates of Hell/.test(r.out) && !fs.existsSync(path.join(inside, 'resource')), '--exe goh, mod folder inside the GoH install: writeguard refusal, nothing written', r.out);
  const out = path.join(W, 'gohmods', 'gm'); fs.mkdirSync(out, { recursive: true });
  put('gohmods/gm/mod.info', '{mod\r\n {name "gm"}\r\n {minGameVersion "1.0"}\r\n}\r\n');
  r = run(out, '--game', H, '--exe', 'goh', '--file', 'resource/set/a.def', '--set', 'e/hp=4');
  const w = path.join(out, 'resource', 'set', 'a.def');
  ok(r.code === 0 && fs.existsSync(w) && /\{hp 4\}/.test(fs.readFileSync(w, 'latin1')) && /overdiff> .*hp: 1 -> 4/.test(r.out), '--exe goh, mod folder outside: written; overdiff --exe goh shows hp 1 -> 4', r.out);
} finally { fs.rmSync(W, { recursive: true, force: true }); }
process.exit(bad ? 1 : 0);

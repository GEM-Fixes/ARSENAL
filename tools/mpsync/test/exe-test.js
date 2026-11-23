// --exe: the game's own vfs view (game parity). Made-up fixture in a temp folder:
//   G = an AS2 install with as64.exe + mowas_2.exe; as64/core changes set/a.set, so the AS64 and MoW:AS2 fingerprints differ there
//   G/mods/en = an Enhanced (3.301) mod: AS64 retries it beside as64+, MoW:AS2 never does (no as64+)
//   H = a GoH install: export carries exe goh; GoH's own resource_syncer.reg masks are used (*.anm content-CRC)
// Author: Imperator_Aug (ARSENAL, ia-a78afe82)
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const tool = path.join(__dirname, '..', 'mpsync.js');
const W = fs.mkdtempSync(path.join(os.tmpdir(), 'mpsync-exe-'));
const put = (rel, s) => { const f = path.join(W, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s, 'latin1'); };
let bad = 0;
const ok = (c, m, out) => { if (c) console.log('OK ' + m); else { bad++; console.log('FAIL ' + m + '\n' + out); } };
const run = (...a) => { const r = cp.spawnSync(process.execPath, [tool, ...a], { encoding: 'utf8' }); return { code: r.status, out: (r.stdout || '') + (r.stderr || '') }; };
const j = f => JSON.parse(fs.readFileSync(path.join(W, f), 'utf8'));
try {
  put('G/as64.exe', 'MZ'); put('G/mowas_2.exe', 'MZ');
  put('G/resource/set/a.set', '{a 1}\r\n');
  put('G/as64/core/resource/set/a.set', '{a 22}\r\n');
  put('G/as64/plus/mod.info', '{mod\r\n {Name "as64+"}\r\n {MinGameVersion "3.301"}\r\n}\r\n');
  put('G/mods/en/mod.info', '{mod\r\n {Name "en"}\r\n {MinGameVersion "3.301"}\r\n}\r\n');
  put('G/mods/en/resource/set/q.set', '{q 1}\r\n');
  const G = path.join(W, 'G');
  let r = run('--game', G, '--export', path.join(W, 'a.json'));
  ok(r.code === 0 && j('a.json').exe === undefined, 'no --exe: AS64 export as before (no exe field)', r.out);
  r = run('--game', G, '--exe', 'mowas_2', '--export', path.join(W, 'm.json'));
  ok(r.code === 0 && j('m.json').exe === 'mowas_2', '--exe mowas_2: export names its game', r.out);
  ok(j('a.json').files['/set/a.set'][1] !== j('m.json').files['/set/a.set'][1], 'AS64 sees as64/core a.set, MoW:AS2 the base one', '');
  r = run('--game', G, '--exe', 'as64', '--export', path.join(W, 'a2.json'));
  ok(r.code === 0 && j('a2.json').exe === 'as64', '--exe as64: export names its game', r.out);
  r = run('--compare', path.join(W, 'a2.json'), path.join(W, 'm.json'));
  ok(/MPSYNC_EXE_DIFF/.test(r.out) && /\/set\/a\.set: MPSYNC_DETECTED/.test(r.out), 'compare of two named games: MPSYNC_EXE_DIFF + the differing file', r.out);
  r = run('--compare', path.join(W, 'a.json'), path.join(W, 'm.json'));
  ok(!/MPSYNC_EXE_DIFF/.test(r.out) && /\/set\/a\.set: MPSYNC_DETECTED/.test(r.out), 'an export with no exe is of unknown game: no MPSYNC_EXE_DIFF', r.out);
  // a MoW:AS2-only folder (no as64.exe), no --exe: no exe field, the same bytes as before
  put('M/mowas_2.exe', 'MZ'); put('M/resource/set/a.set', '{a 1}\r\n');
  r = run('--game', path.join(W, 'M'), '--export', path.join(W, 'mo.json'));
  ok(r.code === 0 && j('mo.json').exe === undefined, 'no --exe on a MoW:AS2-only folder: no exe field (as before)', r.out);
  r = run('--mod', path.join(G, 'mods', 'en'));
  ok(/mod "en": 1 files content-CRC/.test(r.out), 'no --exe: Enhanced mod retried beside as64+ (as before)', r.out);
  r = run('--mod', path.join(G, 'mods', 'en'), '--exe', 'mowas2');
  ok(r.code === 0 && /^mpsync: SKIPPED, mod "en" not mounted/.test(r.out) && !/as64\+/.test(r.out.replace(/MOD_MODE[^;]*/g, '')), '--exe mowas2: no as64+ retry, one SKIPPED line', r.out);
  r = run('--game', G, '--exe', 'bad', '--export', path.join(W, 'x.json'));
  ok(r.code === 2, 'bad --exe: exit 2', r.out);

  put('H/binaries/x64/call_to_arms.exe', 'MZ');
  put('H/resource/set/registry/resource_syncer.reg', '{resourceSyncer\r\n\t{excludeMasks\t"*.txt"}\r\n\t{crcFileMasks\t"*.set;*.anm"}\r\n}\r\n');
  put('H/resource/entity/u/a.anm', 'anim');
  r = run('--game', path.join(W, 'H'), '--exe', 'goh', '--export', path.join(W, 'g.json'));
  const g = r.code === 0 ? j('g.json') : {};
  ok(g.exe === 'goh' && g.files && g.files['/entity/u/a.anm'] && g.files['/entity/u/a.anm'][0] === 'S', '--exe goh: export exe goh; GoH reg masks (*.anm content-CRC)', r.out);
  // --mod --exe goh: a mod folder outside the GoH install (in an outside 'mods' folder too) is mounted by path
  put('out/mods/gm/mod.info', '{mod\r\n {name "gm"}\r\n {minGameVersion "1.0"}\r\n}\r\n');
  put('out/mods/gm/resource/set/b.set', '{b 1}\r\n'); put('out/mods/gm/resource/entity/u/b.anm', 'anim2');
  r = run('--mod', path.join(W, 'out/mods/gm'), '--game', path.join(W, 'H'), '--exe', 'goh');
  ok(r.code === 0 && /mod "gm": 2 files content-CRC/.test(r.out), '--mod --exe goh: outside mod folder mounted by path', r.out);
  { const e = cp.spawnSync(process.execPath, [tool, '--mod', path.join(W, 'out/mods/gm'), '--exe', 'goh'], { encoding: 'utf8', env: Object.assign({}, process.env, { GOH_GAME: path.join(W, 'H') }) });
    const out = (e.stdout || '') + (e.stderr || '');
    ok(e.status === 0 && /mod "gm": 2 files content-CRC/.test(out), '--mod --exe goh, no --game: outside mods parent is not the game, GoH install used', out); }
} finally { fs.rmSync(W, { recursive: true, force: true }); }
process.exit(bad ? 1 : 0);

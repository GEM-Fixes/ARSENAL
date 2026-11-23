// refcheck --exe case (game parity): made-up installs and the seeded fixture, nothing written beside the test.
//   1. AS2-style install with as64.exe and an as64/core def with a missing model: no --exe and --exe as64 report it, --exe mowas_2 / mowas2
//      do not (no as64/core in the MoW:AS2 view); each exe keeps its own entityindex cache (<cache>.mowas_2.json).
//   2. the seeded fixture (mkfixture.js, folder only) under --exe goh: the truth minus GOH_KEY (GoH reads OvermatchCalibre, GHDMG-27) and
//      SPEED_BEFORE_LOCO (GoH skips {Speed}, GHMOV-44); a GoH extender (waypoint) is known under goh and unknown under as64.
//   3. bad --exe exits 2.
//   usage: node exe.js <workdir>   (run.sh gives its temp dir; mkfixture.js must have written <workdir>/fx and truth.txt)
// Author: Imperator_Aug (ARSENAL, ia-6f522ec6)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const W = process.argv[2];
if (!W || !fs.existsSync(path.join(W, 'fx'))) { console.log('FAIL: exe.js needs the work dir with fx/ (run mkfixture.js first)'); process.exit(1); }
const put = (root, k, lines) => { const p = path.join(root, k); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, Array.isArray(lines) ? lines.join('\r\n') + '\r\n' : lines, 'latin1'); };
const A = path.join(W, 'as2game'), F = path.join(W, 'fxgoh');
for (const d of [A, F]) fs.rmSync(d, { recursive: true, force: true });
put(A, 'as64.exe', 'MZ');
put(A, 'resource/entity/base/base.def', ['{game_entity', '}']);
put(A, 'as64/core/resource/entity/core/core.def', ['{game_entity', '\t{Extension "nomodel.mdl"}', '}']);
let bad = 0;
const fail = m => { console.log('FAIL: ' + m); bad++; };
// every run gets a temp cache root (ARSENAL_CACHE): a mod run never seeds from, nor writes to, the user's own entityindex caches
const run = args => cp.spawnSync(process.execPath, [path.join(__dirname, '..', 'refcheck.js'), ...args, '-q'], { encoding: 'utf8', env: { ...process.env, ARSENAL_CACHE: path.join(W, 'tc0') } });
const codes = r => (r.stdout.match(/^[^:\s]+:\d+: [A-Z_0-9]+/gm) || []).map(s => s.replace(/: /, ' ')).sort();
const cache = path.join(W, 'as2.cache.json');

// 1. as64 / mowas_2 views of the shared install
const want1 = 'resource/entity/core/core.def:2 REF_MODEL_MISSING';
const d = run([A, '--cache', cache]);
if (!codes(d).includes(want1)) fail('no --exe (as64.exe present) must check as64/core: ' + d.stdout + d.stderr);
const a = run([A, '--cache', cache, '--exe', 'as64']);
if (codes(a).join() !== codes(d).join()) fail('--exe as64 must equal no --exe: ' + a.stdout);
for (const x of ['mowas_2', 'mowas2']) {
  const m = run([A, '--cache', cache, '--exe', x]);
  if (m.status !== 0 || codes(m).includes(want1)) fail(`--exe ${x} must not see as64/core: ` + m.stdout + m.stderr);
}
if (!fs.existsSync(path.join(W, 'as2.cache.mowas_2.json')) || !fs.existsSync(cache)) fail('one entityindex cache per exe');

// 2. the seeded fixture under goh: truth minus the rules GoH does not share
fs.cpSync(path.join(W, 'fx'), F, { recursive: true });
put(F, 'resource/entity/gx/gx.def', ['{game_entity', '\t{extender "waypoint"}', '\t{extender "nosuch2"}', '\t{extender "fortification"}', '}']);
const truth = fs.readFileSync(path.join(W, 'truth.txt'), 'utf8').split(/\r?\n/).filter(Boolean);
// WARN_SOUND_PRIORITY_HIGH: as64's top 40 is no GoH bound; REF_FILLING_CYCLE: info under GoH (vanilla GoH loads such a loop)
// the rules that fired on vanilla GoH (DISABLED_ON REF_ANIM_MISSING REF_SOUND_MISSING ENV_PRESET_MISSING REF_TEXTURE_MISSING) run under goh:
// their vanilla sites are in known-vanilla-goh.txt (2c), so the fixture's own seeds of them are still found
const GOH_ON = ['DISABLED_ON', 'REF_ANIM_MISSING', 'REF_SOUND_MISSING', 'ENV_PRESET_MISSING', 'REF_TEXTURE_MISSING'];
const drop = new RegExp('\\s(GOH_KEY|SPEED_BEFORE_LOCO|WARN_SOUND_PRIORITY_HIGH|REF_FILLING_CYCLE)$');
const g = run(['-', '--folder', F, '--cache', path.join(W, 'goh.cache.json'), '--exe', 'goh']);
const wantG = truth.filter(l => !drop.test(l)).concat('resource/entity/gx/gx.def:3 EXTENDER_UNKNOWN').sort();
if (codes(g).join('\n') !== wantG.join('\n')) fail('fixture --exe goh:\n got ' + codes(g).join('\n ') + '\n want ' + wantG.join('\n '));
if (!truth.some(l => drop.test(l))) fail('fixture lost its GOH_KEY / SPEED_BEFORE_LOCO seeds');
const s = run(['-', '--folder', F, '--cache', path.join(W, 'goh.cache.json'), '--exe', 'as64']);
const wantA = truth.concat('resource/entity/gx/gx.def:2 EXTENDER_UNKNOWN', 'resource/entity/gx/gx.def:3 EXTENDER_UNKNOWN', 'resource/entity/gx/gx.def:4 EXTENDER_UNKNOWN').sort();
// info lines show without -q: the GoH filling cycle is one of them
const gInfo = cp.spawnSync(process.execPath, [path.join(__dirname, '..', 'refcheck.js'), '-', '--folder', F, '--cache', path.join(W, 'goh.cache.json'), '--exe', 'goh'], { encoding: 'utf8' }).stdout;
for (const c of GOH_ON) if (!codes(g).some(l => l.endsWith(' ' + c))) fail('fixture seed of ' + c + ' must be found under goh');
if (/GOH_NOT_CHECKED/.test(gInfo)) fail('GoH skip list must be gone');
if (!/^info: resource\/set\/stuff\/cyc\/\S+ REF_FILLING_CYCLE .*GoH: vanilla has such a loop/m.test(gInfo)) fail('GoH filling cycle must be an info line: ' + gInfo.split('\n').filter(l => /FILLING/.test(l)).join(' | '));
if (codes(s).join('\n') !== wantA.join('\n')) fail('fixture --exe as64:\n got ' + codes(s).join('\n ') + '\n want ' + wantA.join('\n '));

// 2b. a GoH install named with no --exe: detected (call_to_arms.exe), GoH rules, its own cache file <cache>.goh.json
const H = path.join(W, 'gohgame'); fs.rmSync(H, { recursive: true, force: true });
put(H, 'binaries/x64/call_to_arms.exe', 'MZ');
put(H, 'resource/entity/gx/gx.def', ['{game_entity', '\t{extender "waypoint"}', '\t{extender "nosuch3"}', '}']);
const hc = path.join(W, 'gohi.cache.json'), h = run([H, '--cache', hc]);
if (codes(h).join() !== 'resource/entity/gx/gx.def:3 EXTENDER_UNKNOWN') fail('GoH install, no --exe: ' + h.stdout + h.stderr);
if (!fs.existsSync(path.join(W, 'gohi.cache.goh.json')) || fs.existsSync(hc)) fail('GoH install, no --exe: cache must be <cache>.goh.json');

// 2c. GoH lookups and the known vanilla GoH faults, in a made-up GoH install: a known vanilla site (file + code + the name it names,
//     known-vanilla-goh.txt) is info; another dead name in the same file is a finding; a fireSound folder that only holds folders is no
//     sound (GoH counts a folder's own .wav files); a preset named by its bare file name is missing (GoH: the whole path under set/environment)
{
  const K = path.join(W, 'gohk'); fs.rmSync(K, { recursive: true, force: true });
  put(K, 'binaries/x64/call_to_arms.exe', 'MZ');
  put(K, 'resource/entity/-vehicle/usa/airborne/c47_d/c47_d.def', ['{game_entity', '\t{boarder', '\t\t{forward {begin "board_c47"} {end "x"}}', '\t\t{forward {begin "board_mine"} {end "x"}}', '\t}', '}']);
  put(K, 'resource/set/stuff/mgun/gk', ['{"gk"', '\t{fireSound "sm/only_folders/"}', '\t{fireSound "sm/has_wav/"}', '\t{reloadSound "sm/has_wav/"}', '}']);
  put(K, 'resource/sound/weapon/shot/sm/only_folders/sub/a.wav', 'RIFF');
  put(K, 'resource/sound/weapon/shot/sm/has_wav/a.wav', 'RIFF');
  put(K, 'resource/entity/-vehicle/usa/airborne/c47_d/x.anm', 'x');   // the end pose exists
  put(K, 'resource/sound/weapon/reload/sm/has_wav/a.wav', 'RIFF');
  put(K, 'resource/set/environment/goh/multi/m1/var1.set', ['{environment', '}']);
  put(K, 'resource/map/multi/m1/a.mi', ['{mission', '\t{environment "goh/multi/m1/var1"}', '\t{environment "var1"}', '}']);
  const kArgs = [K, '--exe', 'goh', '--no-rc', '--cache', path.join(W, 'gohk.cache.json')];
  const r = run(kArgs), all = r.stdout + r.stderr;
  const rInfo = cp.spawnSync(process.execPath, [path.join(__dirname, '..', 'refcheck.js'), ...kArgs], { encoding: 'utf8', env: { ...process.env, ARSENAL_CACHE: path.join(W, 'tc0') } }).stdout;
  if (codes(r).some(l => /c47_d\.def:3 /.test(l)) || !/c47_d\.def:3: REF_ANIM_MISSING .*known vanilla defect/.test(rInfo)) fail('known vanilla GoH site must be info: ' + all + rInfo);
  if (!codes(r).includes('resource/entity/-vehicle/usa/airborne/c47_d/c47_d.def:4 REF_ANIM_MISSING')) fail('another dead name in a known file must be found: ' + all);
  const snd = codes(r).filter(l => /REF_SOUND_MISSING/.test(l));
  if (snd.join() !== 'resource/set/stuff/mgun/gk:2 REF_SOUND_MISSING') fail('GoH sound folder rule: ' + snd.join(' ') + ' | ' + all);
  const env = codes(r).filter(l => /ENV_PRESET_MISSING/.test(l));
  if (env.join() !== 'resource/map/multi/m1/a.mi:3 ENV_PRESET_MISSING') fail('GoH preset path rule: ' + env.join(' ') + ' | ' + all);
}

// 2d. a mod run with no cache yet starts from the vanilla cache of its exe (ARSENAL_CACHE: a temp cache root, never the user's):
//     same findings as a cold run; the mod's file that shadows a vanilla def wins (its vanilla finding is gone), its new def is checked
put(H, 'mods/good/mod.info', ['{mod', '\t{name "good"}', '\t{minGameVersion "any"}', '\t{maxGameVersion "any"}', '}']);
put(H, 'mods/good/resource/entity/gx/gx.def', ['{game_entity', '\t{extender "waypoint"}', '}']);
put(H, 'mods/good/resource/entity/gx/gnew.def', ['{game_entity', '\t{extender "nosuch4"}', '}']);
put(H, 'resource/entity/gx/gkeep.def', ['{game_entity', '\t{extender "waypoint"}', '}']);   // vanilla, not shadowed: the seed's record is reused
// REFCHECK_TIME: the index stats on stderr (parsed / reused), which show whether the run started from a seed
const envAt = d => ({ ...process.env, ARSENAL_CACHE: path.join(W, d), REFCHECK_TIME: '1' });
const reusedOf = r => { const m = /reused (\d+)/.exec(r.stderr || ''); return m ? +m[1] : -1; };
const runE = (args, d) => cp.spawnSync(process.execPath, [path.join(__dirname, '..', 'refcheck.js'), ...args, '-q'], { encoding: 'utf8', env: envAt(d) });
const v0 = runE([H, '--exe', 'goh', '--no-rc'], 'tc1');
const tcd = path.join(W, 'tc1', 'entityindex');   // lib/toolcache names it vanilla.goh.<hash>.json
if (!fs.existsSync(tcd) || !fs.readdirSync(tcd).some(f => /^vanilla\.goh\./.test(f))) fail('vanilla GoH run must write vanilla.goh.json under ARSENAL_CACHE: ' + v0.stderr);
const mArgs = [H, '--mods', 'good', '--exe', 'goh', '--no-rc'];
const seeded = runE([...mArgs, '--cache', path.join(W, 'seed.json')], 'tc1'), cold = runE([...mArgs, '--cache', path.join(W, 'cold.json')], 'tc2');
if (!fs.existsSync(path.join(W, 'seed.goh.json'))) fail('seeded mod cache not written');
// the seed really came from the vanilla cache of H (vanilla.goh.f<hash>.json, H is not the installed game): records reused, none cold
if (!(reusedOf(seeded) > 0)) fail('seeded mod run must reuse vanilla records: ' + seeded.stderr);
if (reusedOf(cold) !== 0) fail('cold mod run must reuse nothing: ' + cold.stderr);
const wantM = 'resource/entity/gx/gnew.def:2 EXTENDER_UNKNOWN';
if (codes(cold).join() !== wantM) fail('cold GoH mod run: ' + codes(cold).join(' ') + ' ' + cold.stderr);
if (codes(seeded).join() !== codes(cold).join() || seeded.status !== cold.status) fail('seeded mod run must equal the cold one: ' + codes(seeded).join(' ') + ' | ' + codes(cold).join(' '));

// 2e. a GoH mod in <game>/mods that the game skips for its version range: exit 3 and the version hint, not the --folder-outside hint;
//     a mod that is not there keeps the --folder hint
put(H, 'mods/vrange/mod.info', ['{mod', '\t{name "vrange"}', '\t{minGameVersion "9.000"}', '\t{maxGameVersion "9.900"}', '}']);
put(H, 'mods/vrange/resource/entity/gx/v.def', ['{game_entity', '}']);
// a seed is made for the vr run: the same tc1 vanilla cache of H that seeded 2d, and no vr cache yet
if (!fs.readdirSync(tcd).some(f => /^vanilla\.goh\.f[0-9a-f]{8}\.json$/.test(f)) || fs.existsSync(path.join(W, 'vr.cache.goh.json'))) fail('2e needs the seed source of H and no vr cache before the run');
const vr = runE([H, '--mods', 'vrange', '--scope', 'mod', '--exe', 'goh', '--no-rc', '--cache', path.join(W, 'vr.cache.json')], 'tc1');
if (vr.status !== 3 || !/MOD_VERSION/.test(vr.stderr) || !/version range/.test(vr.stderr) || /outside <game>\/mods/.test(vr.stderr)) fail('GoH mod skipped for its version range: exit 3 + version hint: ' + vr.status + ' ' + vr.stderr);
// the vanilla cache of tc1 seeded vr.cache.goh.json: a refused mount removes it again
if (fs.existsSync(path.join(W, 'vr.cache.goh.json'))) fail('a seeded cache must be removed when the mods did not mount');
const nm = runE([H, '--mods', 'nosuchmod', '--exe', 'goh', '--no-rc', '--cache', path.join(W, 'vr.cache.json')], 'tc1');
if (nm.status !== 3 || !/outside <game>\/mods/.test(nm.stderr)) fail('missing mod keeps the --folder hint: ' + nm.status + ' ' + nm.stderr);

// 3. bad --exe
const b = run(['-', '--folder', F, '--exe', 'nope']);
if (b.status !== 2 || !/--exe nope/.test(b.stderr)) fail('bad --exe must exit 2: ' + b.status + ' ' + b.stderr);
console.log(bad ? `${bad} failed` : 'exe ok');
process.exit(bad ? 1 : 0);

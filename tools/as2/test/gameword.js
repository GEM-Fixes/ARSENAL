// game parity: the front door's game word (--target as64|mowas2|goh, --exe as a game word or exe file, game --kind, the mod.info range),
// on made-up folders in a temp dir: an AS2 install with as64.exe and mowas_2.exe, a GoH install, a modern, a classic and a GoH-range mod.
// Nothing is started: run commands are --dry, or refused before any step. maps children are echoed (AS2_DOOR_ECHO=1), not run.
// prints "ok <case>" / "FAIL <case>: ..." and PASS|FAIL; exit 1 on a failure
// Author: Imperator_Aug (ARSENAL, ia-6b0f2d6e)
const fs = require('fs'), os = require('os'), path = require('path'), { spawnSync } = require('child_process');
const AS2 = path.join(__dirname, '..', 'as2.js');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'as2-gw-'));
const w = (p, t) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, t); };
const A = path.join(root, 'as2game'), H = path.join(root, 'gohgame'), HOME = path.join(root, 'home');
w(path.join(A, 'as64.exe'), ''); w(path.join(A, 'mowas_2.exe'), ''); fs.mkdirSync(path.join(A, 'mods'), { recursive: true });
w(path.join(H, 'binaries', 'x64', 'call_to_arms.exe'), '');
const mi = (dir, body) => w(path.join(root, dir, 'mod.info'), '{Mod\r\n\t{Name "' + dir + '"}\r\n' + body + '}\r\n');
mi('modern', '\t{MinGameVersion "3.301"}\r\n');
mi('classic', '\t{MinGameVersion "3.262.0"}\r\n\t{MaxGameVersion "3.262.1"}\r\n');
mi('gohmod', '\t{MinGameVersion "1.067.0"}\r\n\t{MaxGameVersion "1.067.0"}\r\n');
mi('plain', '');
const ENV = { ...process.env, AS2_NO_STEAM: '1', AS2_HOME: HOME }; delete ENV.AS2_GAME; delete ENV.GOH_GAME;
const sh = (args, env = {}) => {
  const r = spawnSync(process.execPath, [AS2, ...args], { cwd: root, encoding: 'utf8', env: { ...ENV, ...env } });
  return { rc: r.status, out: (r.stdout || '') + (r.stderr || ''), err: r.stderr || '' };
};
let fail = 0;
const t = (name, cond, r) => { if (cond) console.log('ok   ' + name); else { fail++; console.log('FAIL ' + name + (r ? ': rc=' + r.rc + '\n' + r.out : '')); } };
const fwd = s => s.replace(/\\/g, '/');

// game --kind / --target
let r = sh(['game', '--kind', 'goh', '--game', H]); t('game --kind goh --game H', r.rc === 0 && r.out.trim() === H + '  (arg)', r);
r = sh(['game', '--target', 'goh'], { GOH_GAME: H }); t('game --target goh from GOH_GAME', r.rc === 0 && r.out.trim() === H + '  (goh)', r);
r = sh(['game', '--kind', 'goh']); t('game --kind goh, none found', r.rc === 2 && /no Gates of Hell folder found/.test(r.err), r);
r = sh(['game', '--kind', 'as2', '--game', A]); t('game --kind as2 = as before', r.rc === 0 && r.out.trim() === A + '  (arg)', r);
r = sh(['game', '--target', 'mowas_2', '--game', A]); t('game --target mowas_2 = the AS2 install', r.rc === 0 && r.out.trim() === A + '  (arg)', r);
r = sh(['game', '--kind', 'x']); t('game --kind bad', r.rc === 2 && /--kind x: as2 or goh/.test(r.err), r);
r = sh(['game', '--kind', 'as2', '--target', 'goh']); t('game kind and target disagree', r.rc === 2, r);

// new --target
r = sh(['new', 'nm2', '--target', 'mowas2']);
const t2 = fs.existsSync(path.join(root, 'nm2', 'mod.info')) ? fs.readFileSync(path.join(root, 'nm2', 'mod.info'), 'utf8') : '';
t('new --target mowas2: 3.262 range', r.rc === 0 && /MinGameVersion "3\.262\.0"/.test(t2) && /MaxGameVersion "3\.262\.1"/.test(t2) && /MoW:AS2 mod/.test(r.out), r);
r = sh(['new', 'nm3', '--target', 'mowas_2', '--dry-run']); t('new --target mowas_2 (vfs exe word) accepted', r.rc === 0 && /MoW:AS2 mod/.test(r.out) && !fs.existsSync(path.join(root, 'nm3')), r);
r = sh(['new', 'gm1', '--target', 'goh', '--game-version', '1.067.0']);
const t3 = fs.existsSync(path.join(root, 'gm1', 'mod.info')) ? fs.readFileSync(path.join(root, 'gm1', 'mod.info'), 'utf8') : '';
t('new --target goh --game-version: Min = Max = the GoH version', r.rc === 0 && /MinGameVersion "1\.067\.0"/.test(t3) && /MaxGameVersion "1\.067\.0"/.test(t3), r);
r = sh(['new', 'my-mod', '--target', 'goh', '--game-version', '1.067.0']); t('new goh: "-" refused (GHVFS-27)', r.rc === 2 && /GHVFS-27/.test(r.err) && /my_mod/.test(r.err) && !fs.existsSync(path.join(root, 'my-mod')), r);
r = sh(['new', 'my-mod', '--dry-run']); t('new as64: "-" still allowed', r.rc === 0, r);
r = sh(['new', 'gm2', '--target', 'goh']); t('new goh: no GoH install, no version = plain line', r.rc === 2 && /no Gates of Hell folder found/.test(r.err) && !fs.existsSync(path.join(root, 'gm2')), r);
r = sh(['new', 'gm3', '--target', 'goh', '--dry-run'], { GOH_GAME: H, AS2_DOOR_ECHO: '1' }); t('new goh: --game = the GoH install found', r.rc === 0 && r.out.includes('--target goh --dry-run --game ' + (/\s/.test(H) ? '"' + H + '"' : H)), r);
r = sh(['new', 'gm4', '--target', 'goh', '--game', H, '--dry-run'], { AS2_DOOR_ECHO: '1' }); t('new goh: --game given is kept', r.rc === 0 && (r.out.match(/--game/g) || []).length === 1, r);
r = sh(['new', path.join(H, 'resource', 'x'), '--target', 'goh', '--game', H]); t('new goh: a folder in the GoH game files refused (writeguard)', r.rc === 2 && !fs.existsSync(path.join(H, 'resource', 'x')), r);

// play / e2e / dev-loop / probe
r = sh(['play', 'plain', '--game', A, '--logdir', 'L', '--target', 'mowas2', '--dry']);
const pm = fwd(r.out);
t('play --target mowas2 --dry: mowas_2.exe, note, base, --options', r.rc === 0 && pm.includes('--exe ' + fwd(path.join(A, 'mowas_2.exe'))) && /TST-19/.test(pm) && pm.includes('1v1_reloading_point.mowas2.json') && !pm.includes('.mowas_2.json') && /--options/.test(pm), r);
// wave 3: the base name is bootcheck's own (base/<map>.<game id>.json) and the plan says how to record it with --exe <game>
t('play mowas2 --dry: how to record the base (bootcheck base --exe mowas2)', pm.includes('bootcheck.js base <game.log> --exe mowas2 --to-clock -o tools/bootcheck/base/1v1_reloading_point.mowas2.json'), r);
// wave 3: the default log folder comes from userdir.logDirFor (the AS2 user dir under AS2_HOME for MoW:AS2, as for AS64)
w(path.join(HOME, 'Documents', 'my games', 'men of war - assault squad 2', 'profiles', 'p1', 'options.set'), '{mods\r\n}\r\n');
r = sh(['play', 'plain', '--game', A, '--target', 'mowas2', '--dry']);
const lp = fwd(path.join(HOME, 'Documents', 'my games', 'men of war - assault squad 2'));
t('play mowas2 --dry: log folder and options.set of the AS2 user dir (logDirFor, profilesFor)', r.rc === 0 && fwd(r.out).includes('--logdir ' + (/\s/.test(lp) ? '"' + lp + '/log"' : lp + '/log')) && fwd(r.out).includes('/profiles/p1/options.set'), r);
fs.rmSync(path.join(HOME, 'Documents'), { recursive: true, force: true });
t('play mowas2 --dry: nothing installed', !fs.existsSync(path.join(A, 'mods', 'plain')));
r = sh(['play', 'plain', '--game', A, '--target', 'mowas2']); t('play mowas2 real run refused (TST-19)', r.rc === 2 && /not available for MoW:AS2/.test(r.err) && /TST-19/.test(r.err) && !/\$ node/.test(r.out) && !fs.existsSync(path.join(A, 'mods', 'plain')), r);
r = sh(['play', 'plain', '--game', A, '--exe', path.join(A, 'mowas_2.exe')]); t('play --exe mowas_2.exe (GUI form) real run refused', r.rc === 2 && /TST-19/.test(r.err), r);
r = sh(['play', 'classic', '--game', A, '--logdir', 'L', '--dry']); t('play: mod.info 3.262 range picks mowas_2.exe', r.rc === 0 && fwd(r.out).includes('--exe ' + fwd(path.join(A, 'mowas_2.exe'))) && /from the mod.info range/.test(r.out), r);
r = sh(['play', 'classic', '--game', A, '--logdir', 'L', '--target', 'as64', '--dry']); t('play classic --target as64 wins over the range', r.rc === 0 && fwd(r.out).includes('--exe ' + fwd(path.join(A, 'as64.exe'))) && !/TST-19/.test(r.out), r);
r = sh(['play', 'modern', '--game', A, '--logdir', 'L', '--dry']); t('play as64 default unchanged: as64.exe, as64+, no --options', r.rc === 0 && fwd(r.out).includes('--exe ' + fwd(path.join(A, 'as64.exe'))) && /--set as64\+,modern/.test(r.out) && !/--options/.test(r.out) && !/mowas_2/.test(r.out), r);
r = sh(['play', 'modern', '--game', A, '--logdir', 'L', '--target', 'mowas2', '--dry']); t('play modern on mowas2: no as64+', r.rc === 0 && /--set modern --write/.test(r.out), r);
r = sh(['play', 'plain', '--game', A, '--target', 'goh', '--dry']); t('play goh refused', r.rc === 2 && /not available for GoH/.test(r.err) && /goh-drive/.test(r.err), r);
r = sh(['play', 'gohmod', '--game', A, '--dry']); t('play: a GoH mod.info range refused', r.rc === 2 && /not available for GoH/.test(r.err), r);
r = sh(['play', 'plain', '--game', A, '--target', 'as64', '--exe', 'mowas_2.exe', '--dry']); t('play --target and --exe disagree', r.rc === 2, r);
r = sh(['e2e', 'plain', '--map', 'm1', '--game', A, '--logdir', 'L', '--exe', 'mowas2', '--dry']); t('e2e --exe mowas2 --dry', r.rc === 0 && fwd(r.out).includes('--exe ' + fwd(path.join(A, 'mowas_2.exe'))) && /TST-19/.test(r.out), r);
r = sh(['e2e', 'plain', '--map', 'm1', '--game', A, '--exe', 'mowas2']); t('e2e mowas2 real refused', r.rc === 2 && /TST-19/.test(r.err), r);
r = sh(['dev-loop', 'plain', '--map', 'm1', '--game', A, '--target', 'mowas2', '--logdir', 'L', '--dry']); t('dev-loop mowas2 --dry: one note', r.rc === 0 && (r.out.match(/TST-19/g) || []).length === 1 && /mowas_2\.exe/.test(r.out), r);
for (const c of [['e2e', 'plain', '--map', 'm1'], ['dev-loop', 'plain', '--map', 'm1'], ['probe']]) {
  r = sh([...c, '--game', A, '--target', 'goh', '--dry']); t(c[0] + ' goh refused', r.rc === 2 && /not available for GoH/.test(r.err) && !/\$ node/.test(r.out), r);
  // probe installs no mod: its own reason (checker finding); the rest keep the install-and-start reason
  t(c[0] + ' goh reason fits', c[0] === 'probe' ? /probe starts the game exe/.test(r.err) && !/installs the mod/.test(r.err) : /installs the mod/.test(r.err), r);
}
// an --exe file of no game name (custom.exe) stays the exe, as before the game word (checker finding)
w(path.join(A, 'custom.exe'), '');
for (const c of [['play', 'modern'], ['e2e', 'modern', '--map', 'm1']]) {
  r = sh([...c, '--game', A, '--logdir', 'L', '--exe', path.join(A, 'custom.exe'), '--dry']);
  t(c[0] + ' --exe custom.exe kept', r.rc === 0 && fwd(r.out).includes('--exe ' + fwd(path.join(A, 'custom.exe'))) && !fwd(r.out).includes('as64.exe'), r);
}
// MoW:AS2 chains: the data tools get --exe mowas_2, no numbered instance; AS64 chains get no --exe on them
const mowSteps = s => ['modinfo', 'build', 'modswitch', 'logtriage', 'bootcheck'].filter(n => s.split('\n').some(l => l.startsWith('$ node tools/' + n + '/') && / --exe mowas_2( |$)/.test(l)));
r = sh(['play', 'modern', '--game', A, '--logdir', 'L', '--target', 'mowas2', '--dry']);
t('play mowas2 --dry: --exe mowas_2 on modinfo, modswitch, bootcheck; no --inst', r.rc === 0 && mowSteps(r.out).join() === 'modinfo,modswitch,bootcheck' && !/--inst/.test(r.out) && /main user folder/.test(r.out), r);
r = sh(['e2e', 'modern', '--map', 'm1', '--game', A, '--logdir', 'L', '--target', 'mowas2', '--dry']);
t('e2e mowas2 --dry: --exe mowas_2 on modinfo, build, modswitch, logtriage', r.rc === 0 && mowSteps(r.out).join() === 'modinfo,build,modswitch,logtriage', r);
r = sh(['dev-loop', 'modern', '--map', 'm1', '--game', A, '--logdir', 'L', '--target', 'mowas2', '--dry']);
t('dev-loop mowas2 --dry: --exe mowas_2 on every data step', r.rc === 0 && mowSteps(r.out).join() === 'modinfo,build,modswitch,logtriage', r);
r = sh(['play', 'modern', '--game', A, '--logdir', 'L', '--target', 'mowas2', '--inst', '2', '--dry']); t('play mowas2 --inst 2 refused (TST-19)', r.rc === 2 && /no -instance/.test(r.err) && !/\$ node/.test(r.out), r);
r = sh(['play', 'modern', '--game', A, '--logdir', 'L', '--dry']); t('play as64 --dry: no --exe on the data tools', r.rc === 0 && mowSteps(r.out).length === 0 && !/--exe (as64|mowas_2)( |$)/m.test(r.out), r);
r = sh(['probe', '--game', A, '--exe', 'mowas_2', '--dry']); t('probe reads --exe (game word)', r.rc === 0 && fwd(r.out).includes('testrun.js --exe ' + fwd(path.join(A, 'mowas_2.exe')) + ' --probe'), r);
r = sh(['probe', '--game', A, '--dry']); t('probe default unchanged: as64.exe', r.rc === 0 && fwd(r.out).includes('--exe ' + fwd(path.join(A, 'as64.exe')) + ' --probe') && !/TST-19/.test(r.out), r);
r = sh(['probe', '--game', A, '--exe', 'mowas_2']); t('probe mowas2 real refused', r.rc === 2 && /TST-19/.test(r.err), r);

// install / uninstall
r = sh(['install', 'plain', '--game', A, '--target', 'goh']); t('install goh refused (writeguard)', r.rc === 2 && /not available for GoH/.test(r.err) && /writeguard/.test(r.err), r);
r = sh(['uninstall', 'plain', '--game', A, '--target', 'goh', '--yes']); t('uninstall goh refused', r.rc === 2 && /not available for GoH/.test(r.err), r);
r = sh(['install', 'plain', '--game', A, '--target', 'mowas2']); t('install mowas2 = the shared mods folder', r.rc === 0 && fs.existsSync(path.join(A, 'mods', 'plain', '.as2-installed')), r);
r = sh(['uninstall', 'plain', '--game', A, '--target', 'mowas2', '--yes']); t('uninstall mowas2', r.rc === 0 && !fs.existsSync(path.join(A, 'mods', 'plain')), r);
r = sh(['install', 'plain', '--game', A, '--target', 'nosuch']); t('install bad target', r.rc === 2 && /unknown game/.test(r.err), r);
r = sh(['install', 'plain', '--game', A, '--exe', 'goh', '--dry']); t('install --exe goh refused', r.rc === 2 && /not available for GoH/.test(r.err) && !/ -> /.test(r.out), r);
r = sh(['install', 'plain', '--game', A, '--exe', 'nosuch', '--dry']); t('install --exe nosuch: unknown game', r.rc === 2 && /unknown game/.test(r.err), r);
r = sh(['uninstall', 'plain', '--game', A, '--exe', 'goh', '--yes']); t('uninstall --exe goh refused', r.rc === 2 && /not available for GoH/.test(r.err), r);
r = sh(['game', '--exe', 'goh', '--game', H]); t('game --exe goh = the GoH install', r.rc === 0 && r.out.trim() === H + '  (arg)', r);
r = sh(['game', '--exe', 'nosuch', '--game', A]); t('game --exe nosuch: unknown game', r.rc === 2 && /unknown game/.test(r.err), r);
r = sh(['game', '--kind', 'as2', '--exe', 'goh']); t('game --kind and --exe disagree', r.rc === 2 && /--exe goh is not of --kind as2/.test(r.err), r);

// maps: the child arguments (echoed)
const E = { AS2_DOOR_ECHO: '1' }, q = s => (/[\s"]/.test(s) ? '"' + s + '"' : s);
const M = [
  [['maps', 'list', '--game', A], 'mission-clone --list --game ' + q(A)],
  [['maps', 'list', '--game', A, '--target', 'mowas2'], 'mission-clone --list --exe mowas_2 --game ' + q(A)],
  [['maps', 'view', 'x.net'], 'mapview x.net'],
  [['maps', 'view', '--map', 'multi/a', '--game', A, '--exe', 'mowas_2'], 'mapview --exe mowas_2 --map multi/a --game ' + q(A)],
  [['maps', 'clone', '--map', 'm', '--game', A], 'map-clone --target as64 --map m --game ' + q(A)],
  [['maps', 'clone', '--map', 'm', '--game', A, '--target', 'mowas2'], 'map-clone --target mowas2 --map m --game ' + q(A)],
  [['maps', 'clone', '--map', 'm', '--exe', 'mowas_2', '--game', A], 'map-clone --target mowas2 --map m --game ' + q(A)],
  [['maps', 'mode', '--map', 'm', '--game', A], 'mission-clone --map m --game ' + q(A)],
  [['maps', 'mode', '--map', 'm', '--game', A, '--target', 'as64'], 'mission-clone --target as64 --map m --game ' + q(A)],
  [['maps', 'mode', '--map', 'm', '--game', A, '--target', 'mowas2'], 'mission-clone --target mowas2 --exe mowas_2 --map m --game ' + q(A)],
  // a hand-given --game-version reaches map-clone unchanged (map-clone sets the mod.info range from it)
  [['maps', 'clone', '--map', 'm', '--game', A, '--target', 'mowas2', '--game-version', '3.262.0,3.262.1'], 'map-clone --target mowas2 --map m --game ' + q(A) + ' --game-version 3.262.0,3.262.1'],
  [['maps', 'mode', '--map', 'm', '--game', H, '--target', 'goh'], 'mission-clone --target goh --exe goh --map m --game ' + q(H)],
];
for (const [a, want] of M) { r = sh(a, E); t(a.join(' ').replace(root, '<tmp>'), r.rc === 0 && r.out.trim() === '$ ARSENAL ' + want, r); }
r = sh(['maps', 'clone', '--map', 'm', '--target', 'goh'], { ...E, GOH_GAME: H }); t('maps clone goh: the GoH install found', r.rc === 0 && r.out.trim() === '$ ARSENAL map-clone --game ' + q(H) + ' --target goh --map m', r);
r = sh(['maps', 'list', '--target', 'goh'], { ...E, GOH_GAME: H }); t('maps list goh', r.rc === 0 && r.out.trim() === '$ ARSENAL mission-clone --list --game ' + q(H) + ' --exe goh', r);
r = sh(['maps', 'list', '--target', 'goh'], E); t('maps list goh, none found', r.rc === 2 && /no Gates of Hell folder found/.test(r.err), r);
r = sh(['maps', 'list', '--target', 'mowas2', '--exe', 'goh', '--game', A], E); t('maps --target and --exe disagree', r.rc === 2, r);
r = sh(['maps', 'list', '--target'], E); t('maps --target without value', r.rc === 2, r);

fs.rmSync(root, { recursive: true, force: true });
console.log(fail ? 'FAIL (' + fail + ')' : 'PASS');
process.exitCode = fail ? 1 : 0;

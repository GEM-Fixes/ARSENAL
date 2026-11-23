// game parity (2026-11-14): edrun, pack, mindist and runlist under MoW:AS2 and GoH. No game, no editor: dry runs, a made-up AS2-style install
//   (as64.exe + an as64/core layer), stubbed index for pack. usage: node parity-test.js   (temp dir of its own, nothing written beside the test)
// Author: Imperator_Aug (ARSENAL, ia-ee65f4d7)
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process'), A = require('assert');
const W = fs.mkdtempSync(path.join(os.tmpdir(), 'edrun-parity-'));
const ED = path.join(__dirname, '..', 'edrun.js'), PAIRS = path.join(__dirname, 'old-pairs.json');
let bad = 0;
const t = (c, m) => { if (!c) { console.log('FAIL parity: ' + m); bad++; } };
const run = (file, args) => cp.spawnSync(process.execPath, [file, ...args], { encoding: 'latin1', cwd: path.join(__dirname, '..') });

// 1 the game of an exe name
const md = require('../mindist.js');
const G = { 'as64_ed.exe': 'as64', 'AS64_ED.EXE': 'as64', 'as64.exe': 'as64', 'mowas_2_ed.exe': 'mowas2', 'mowas_2.exe': 'mowas2', 'x/y/Mowas_2_ed.exe': 'mowas2',
  'call_to_arms_ed.exe': 'goh', 'binaries/x64/call_to_arms.exe': 'goh', as64: 'as64', mowas_2: 'mowas2', mowas2: 'mowas2', goh: 'goh', 'other.exe': 'as64', zz: null };
for (const [k, v] of Object.entries(G)) t(md.gameOfExe(k) === v, `gameOfExe(${k}) = ${md.gameOfExe(k)}, want ${v}`);
t(md.gameOfExe(undefined) === 'as64' && md.gameOfExe(true) === 'as64', 'no exe = as64');
t(md.vfsExeOf('as64') === undefined && md.vfsExeOf('mowas2') === 'mowas_2', 'vfs exe: none for as64, mowas_2 for mowas2');

// 2 start line and mod.info
const e = require('../edrun.js');
t(JSON.stringify(e.startArgs('as64', 'multi/edrun_test', 3, {})) === JSON.stringify(['-game', 'multi/edrun_test:combat', '-instance', '3', '-nosound', '-control', '-console']), 'as64 start line as before');
t(JSON.stringify(e.startArgs('as64', 'multi/x', 2, { sound: true, noPipe: true })) === JSON.stringify(['-game', 'multi/x:combat', '-instance', '2']), 'as64 --sound --no-pipe');
t(JSON.stringify(e.startArgs('mowas2', 'multi/edrun_test', 3, {})) === JSON.stringify(['-game', 'multi/edrun_test:combat']), 'mowas2 start line: -game only (TST-19)');
t(e.modInfoOf('as64', 'edrun_test') === '{Mod\n {Name "edrun_test"}\n {MinGameVersion "3.301"}\n}\n', 'as64 mod.info as before');
t(/MinGameVersion "3\.262\.0"[^]*MaxGameVersion "3\.262\.1"/.test(e.modInfoOf('mowas2', 'edrun_test')), 'mowas2 mod.info 3.262 range');
t(e.ED_EXE.mowas2 === 'mowas_2_ed.exe', 'mowas2 editor exe');

// 3 CLI: as64 dry unchanged by --exe as64_ed.exe; mowas2 dry: no as64+, start line, mod.info; refusals
const norm = s => s.replace(/EDRUN \S+ /g, 'EDRUN RUNID ').split(W).join('W');
const dry = (o, x) => run(ED, ['--pairs', PAIRS, '--dry', '--no-check', '--inst', '2', '--out', path.join(W, o), ...x]);
const d0 = dry('a0', []), d1 = dry('a1', ['--exe', 'as64_ed.exe']);
t(d0.status === 0 && d1.status === 0, 'as64 dry exit 0');
t(norm(d0.stdout + d0.stderr).replace(/a0/g, 'aX') === norm(d1.stdout + d1.stderr).replace(/a1/g, 'aX'), 'as64 dry text same with and without --exe as64_ed.exe');
t(!/start \(/.test(d0.stdout), 'as64 dry prints no start line (as before)');
const mi0 = fs.readFileSync(path.join(W, 'a0', 'combat0.mi'), 'latin1');
const m = dry('m', ['--exe', 'mowas_2_ed.exe']);
t(m.status === 0, 'mowas2 dry exit 0: ' + m.stderr);
t(!/NOTE: --mods lacks as64\+/.test(m.stdout), 'mowas2: no as64+ prepended');
t(/start \(mowas2\): mowas_2_ed\.exe -game multi\/edrun_test:combat  /.test(m.stdout) && !/-instance|-control|-console|-nosound/.test((/start \(mowas2\).*/.exec(m.stdout) || [''])[0]), 'mowas2 start line printed, -game only: ' + m.stdout);
t(/mod\.info \(mowas2\): .*3\.262\.0.*3\.262\.1/.test(m.stdout), 'mowas2 mod.info printed');
t(norm(fs.readFileSync(path.join(W, 'm', 'combat0.mi'), 'latin1')).replace(/EDRUN \S+/g, '') === norm(mi0).replace(/EDRUN \S+/g, ''), 'mission text is the same form for mowas2 (same data forms)');
const g = dry('g', ['--exe', 'call_to_arms_ed.exe']);
t(g.status === 2 && /^edrun: not available for GoH: .*page_scene_editor.*\(modweb\/testing\/in-play-nopipe\.md:9\)/m.test(g.stderr), 'goh refused with its row: ' + g.stderr);
t(!fs.existsSync(path.join(W, 'g', 'combat0.mi')), 'goh: nothing written');
const gw = dry('g2', ['--exe', 'goh']);
t(gw.status === 2 && /not available for GoH/.test(gw.stderr), 'goh word refused');
const p = dry('p', ['--exe', 'mowas_2_ed.exe', '--pipe', 'dbg_blast 1']);
t(p.status === 2 && /^edrun: not available for MoW:AS2: --pipe needs the control pipe.*\(TST-19\)/m.test(p.stderr), 'mowas2 --pipe refused: ' + p.stderr);
const live = run(ED, ['--pairs', PAIRS, '--inst', '2', '--exe', 'mowas_2_ed.exe', '--game', path.join(W, 'nogame'), '--out', path.join(W, 'live')]);
t(live.status === 2 && /^edrun: not available for MoW:AS2: a run needs its own instance profile.*\(TST-19\)/m.test(live.stderr), 'mowas2 run without --dry refused: ' + live.stderr);
t(!fs.existsSync(path.join(W, 'nogame')), 'refused run touched no game folder');
const bx = dry('b', ['--exe', 'nosuch']);
t(bx.status === 2 && /not a game exe/.test(bx.stderr), 'unknown exe word: usage, exit 2');
const bn = dry('bn', ['--exe', 'my_build.exe']);
t(bn.status === 0 && norm(bn.stdout + bn.stderr).replace(/bn/g, 'aX') === norm(d0.stdout + d0.stderr).replace(/a0/g, 'aX'), 'a renamed *.exe runs as as64, as before: ' + bn.stdout + bn.stderr);
// a refusal prints its one line only (no --inst notice before it); as64 keeps the notice
for (const x of [['--exe', 'call_to_arms_ed.exe', '--dry'], ['--exe', 'mowas_2_ed.exe', '--dry', '--pipe', 'x'], ['--exe', 'mowas_2_ed.exe', '--game', path.join(W, 'nogame')]]) {
  const r1 = run(ED, ['--pairs', PAIRS, '--no-check', '--out', path.join(W, 'one'), ...x]);
  t(r1.status === 2 && r1.stderr.trim().split(/\r?\n/).length === 1 && /^edrun: not available for /.test(r1.stderr), 'one line refusal (' + x.join(' ') + '): ' + r1.stderr);
}
const n1 = run(ED, ['--pairs', PAIRS, '--no-check', '--dry', '--out', path.join(W, 'n1')]);
t(n1.status === 0 && /--inst not given, using instance 1/.test(n1.stderr), 'as64 keeps the --inst notice');

// 4 the index reads the game's own vfs view: made-up install, as64/core holds core_ent (the as64 view sees it, mowas_2 does not)
const GD = path.join(W, 'game');
const put = (k, s) => { const f = path.join(GD, k); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
put('as64.exe', 'MZ');
put('resource/entity/base_ent.def', '{Extension "base_ent.mdl"}\r\n');
put('as64/core/resource/entity/core_ent.def', '{Extension "core_ent.mdl"}\r\n');
const pf = require('../preflight.js');
const rA = pf.makeRangeReader(GD, [], {}), rM = pf.makeRangeReader(GD, [], { exe: 'mowas_2' });
t(rA.existsOf('core_ent') === true && rA.existsOf('base_ent') === true, 'as64 reader sees the core entity');
t(rM.existsOf('core_ent') === false && rM.existsOf('base_ent') === true, 'mowas_2 reader does not see the as64/core entity');
const b1 = md.getBuilt(GD, [], undefined), b2 = md.getBuilt(GD, [], 'mowas_2');
t(b1 !== b2 && b1.idx.byName('core_ent').length === 1 && b2.idx.byName('core_ent').length === 0, 'getBuilt keeps one index per exe');
// the edrun CLI hands the vfs exe to its preflight reader (rcache.reader(.., VEXE)): mowas2 --check holds a core_ent shooter, a base_ent shooter goes through
fs.writeFileSync(path.join(W, 'cp.json'), JSON.stringify([{ name: 'core', class: 'vehicle', shooter: 'core_ent', crew: ['base_ent'], foe: 'base_ent', foeCrew: ['base_ent'] },
  { name: 'base', class: 'vehicle', shooter: 'base_ent', crew: ['base_ent'], foe: 'base_ent', foeCrew: ['base_ent'] }]));
const ck = run(ED, ['--pairs', path.join(W, 'cp.json'), '--dry', '--check', '--game', GD, '--inst', '2', '--exe', 'mowas_2_ed.exe', '--out', path.join(W, 'ck')]);
t(ck.status === 0 && /preflight HELD core: NOUNIT .*shooter core_ent/.test(ck.stdout) && !/HELD base/.test(ck.stdout) && !/index not built/.test(ck.stdout), 'mowas2 --check reads the mowas_2 view: ' + ck.stdout + ck.stderr);

// 5 mindist cli: goh refused, mowas2 read through an injected reader, unknown exe exit 2
let line = null, code = null;
const rc = md.cli(['--game', GD, '--exe', 'goh', 'x'], { refuse: { log: s => { line = s; }, exit: c => { code = c; } } });
t(rc === 2 && code === 2 && /^mindist: not available for GoH: .*\(modweb\/testing\/in-play-nopipe\.md:9\)$/.test(line), 'mindist goh refused: ' + line);
t(md.cli(['--game', GD, '--exe', 'zz', 'x']) === 2, 'mindist unknown exe exit 2');
const seen = [];
const old = console.log; console.log = s => seen.push(s);
const r5 = md.cli(['--game', GD, '--exe', 'mowas_2', 'core_ent'], { read: d => (seen.push('read ' + d), { unknown: 'stub' }) });
console.log = old;
t(r5 === 0 && seen.includes('read core_ent') && seen.some(s => /core_ent: core_ent on t34_0: unknown: stub/.test(s)), 'mindist mowas2 runs, --exe not taken for a def: ' + seen.join('|'));
const mc = run(path.join(__dirname, '..', 'mindist.js'), ['--game', GD, '--exe', 'mowas2', 'core_ent', 'base_ent']);
t(mc.status === 0 && /core_ent: core_ent on t34_0: unknown: def not in the index/.test(mc.stdout) && /base_ent: base_ent on t34_0: unknown: def lists no weapon/.test(mc.stdout), 'mindist cli mowas2 on the made-up install: ' + mc.stdout + mc.stderr);
const ma = run(path.join(__dirname, '..', 'mindist.js'), ['--game', GD, '--mods', '', 'core_ent']);
t(ma.status === 0 && /core_ent: core_ent on t34_0: unknown: def lists no weapon/.test(ma.stdout), 'mindist cli as64 sees the core entity: ' + ma.stdout + ma.stderr);

// 6 pack: goh refused; loadCards hands exe to the index (stubbed index and card reader)
const PK = path.join(__dirname, '..', 'pack.js');
fs.writeFileSync(path.join(W, 'reps.txt'), 't34_0(rus)\n');
const pg = run(PK, ['--game', GD, '--reps', path.join(W, 'reps.txt'), '--dry', '--exe', 'goh']);
t(pg.status === 2 && /^pack: not available for GoH: .*\(modweb\/testing\/in-play-nopipe\.md:9\)/m.test(pg.stderr), 'pack goh refused: ' + pg.stderr);
const ixp = require.resolve('../../entityindex/index.js'), ugp = require.resolve('../../unitgroups/unitgroups.js');
const builds = [];
const keep = { ix: require.cache[ixp], ug: require.cache[ugp] };
require.cache[ixp] = { id: ixp, filename: ixp, loaded: true, exports: { build: o => { builds.push(o); return { src: {}, idx: { byName: () => [] } }; } } };
require.cache[ugp] = { id: ugp, filename: ugp, loaded: true, exports: { readCards: () => [] } };
const pk = require('../pack.js');
pk.loadCards(GD, [], 'mowas_2'); pk.loadCards(GD, ['as64+'], undefined);
t(builds[0].exe === 'mowas_2' && !('exe' in builds[1]), 'pack index: exe mowas_2 passed, none for as64: ' + JSON.stringify(builds));
if (keep.ix) require.cache[ixp] = keep.ix; else delete require.cache[ixp];
if (keep.ug) require.cache[ugp] = keep.ug; else delete require.cache[ugp];

// 7 runlist: a list naming --exe mowas_2_ed.exe dry-checks through edrun (--dry-only), a GoH line stops the run
const fw = s => s.split(path.sep).join('/');
const list = (exe, f) => fs.writeFileSync(f, ['## S1', '```', `node tools/edrun/edrun.js --inst <I> --exe ${exe} --pairs ${fw(PAIRS)} --no-check --out ${fw(path.join(W, 'rl', exe))}`, '```'].join('\n'));
list('mowas_2_ed.exe', path.join(W, 'rlm.md')); list('call_to_arms_ed.exe', path.join(W, 'rlg.md'));
const RL = path.join(__dirname, '..', 'runlist.js');
const rlm = run(RL, ['--list', path.join(W, 'rlm.md'), '--dry-only', '--inst', '2', '--out', path.join(W, 'rlo')]);
t(rlm.status === 0 && /dry check \d+ s, held 0/.test(rlm.stdout), 'runlist mowas2 dry-only passes: ' + rlm.stdout + rlm.stderr);
const rlg = run(RL, ['--list', path.join(W, 'rlg.md'), '--dry-only', '--inst', '2', '--out', path.join(W, 'rlo2')]);
t(rlg.status === 1 && /HELD .*dry exit 2 edrun: not available for GoH/.test(rlg.stdout), 'runlist goh line held with the plain line: ' + rlg.stdout);

fs.rmSync(W, { recursive: true, force: true });
if (bad) { console.log(bad + ' failed'); process.exit(1); }
console.log('PASS parity');

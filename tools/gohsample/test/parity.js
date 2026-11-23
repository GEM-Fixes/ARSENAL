// gohsample game parity test (MoW:AS2 target, on the synthetic fixture test/fx (mkfixture.js first). No game touched.
//  plan --exe mowas_2 records meta.exe; build takes it from the plan (mod.info 3.262.0..3.262.1, mod and mod_b); predict reads the mowas_2
//  wouldload result and writes target mowas2; sweep --no-plan writes RUN.md with mowas_2.exe, no as64+, no testrun line (TST-19); boot writes
//  the mowas2 range and names mowas_2.exe; no --exe stays as64 (meta has no exe, mod.info 3.301); --exe goh: exit 2 with the plain line.
// Author: Imperator_Aug (ARSENAL, ia-a96c2df6)
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const FX = path.join(__dirname, 'fx'), GOH = path.join(FX, 'goh'), AS2 = path.join(FX, 'as2'), OUT = path.join(FX, 'outp');
const CLI = path.join(__dirname, '..', 'gohsample.js');
let fails = 0;
const ok = (c, name, extra) => { if (!c) { fails++; console.log('FAIL parity ' + name + (extra ? '\n' + String(extra).slice(0, 800) : '')); } };
const run = args => { const r = cp.spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', windowsHide: true, maxBuffer: 1 << 26 }); return { code: r.status, out: r.stdout || '', err: r.stderr || '' }; };
const J = f => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''));
const R = f => fs.readFileSync(f, 'utf8');
process.env.AS64_LIMITS = path.join(__dirname, 'limits');
const base = ['--goh', GOH, '--as2', AS2];
fs.rmSync(OUT, { recursive: true, force: true });

// --exe goh: refused at the start
let r = run(['plan', ...base, '--out', path.join(OUT, 'g'), '--exe', 'goh']);
ok(r.code === 2 && /^gohsample: not available for GoH: .+\(.+\)\s*$/.test(r.err) && !fs.existsSync(path.join(OUT, 'g')), '--exe goh exit 2 + plain line, nothing written', r.code + ' ' + r.err);
r = run(['plan', ...base, '--out', path.join(OUT, 'g'), '--exe', 'nope']);
ok(r.code === 2, '--exe nope exit 2', r.code + ' ' + r.err);

// as64 default: no meta.exe
const a = path.join(OUT, 'a');
r = run(['plan', ...base, '--out', a, '--seed', '7']);
ok(r.code === 0 && J(path.join(a, 'sample.json')).meta.exe === undefined, 'no --exe: plan meta has no exe (as before)', r.out + r.err);

// mowas_2 run
const m = path.join(OUT, 'm');
r = run(['plan', ...base, '--out', m, '--seed', '7', '--exe', 'mowas2']);
ok(r.code === 0 && J(path.join(m, 'sample.json')).meta.exe === 'mowas_2', 'plan --exe mowas2 records meta.exe mowas_2', r.out + r.err);
r = run(['build', ...base, '--plan', path.join(m, 'sample.json'), '--out', m]);
ok(r.code === 0, 'build exit 0', r.out + r.err);
const mi = R(path.join(m, 'mod', 'mod.info'));
ok(/\{MinGameVersion "3\.262\.0"\}\r\n \{MaxGameVersion "3\.262\.1"\}/.test(mi) && !/3\.301/.test(mi), 'build (exe from the plan): mod.info 3.262.0..3.262.1', mi);
ok(fs.existsSync(path.join(m, 'mod_b', 'mod.info')) && /MaxGameVersion "3\.262\.1"/.test(R(path.join(m, 'mod_b', 'mod.info'))), 'mod_b mod.info has the mowas2 range');
const B = J(path.join(m, 'build.json'));
ok(B.counts.converted >= 4, 'goh2as2 --exe mowas_2 converted the sample', JSON.stringify(B.counts));
// predict from canned wouldload json keyed by the mowas_2 run
fs.writeFileSync(path.join(m, 'wl.json'), JSON.stringify({ exes: { as64: { tested: true, crash: [{ entity: 'tree_a', code: 'INCLUDE_MISSING', file: 'resource/entity/flora/tree_a/tree_a.def', line: 1, msg: 'as64 only' }], silent: [] }, mowas_2: { tested: true, crash: [{ entity: 'tank_a', code: 'INCLUDE_MISSING', file: 'resource/entity/-vehicle/ger/tank_a/tank_a.def', line: 2, msg: 'x', reach: 'REACHABLE' }], silent: [] } } }));
fs.writeFileSync(path.join(m, 'wlb.json'), JSON.stringify({ exes: { mowas_2: { tested: true, readProblems: [], toolFailed: [], silent: [], crash: [] } } }));
r = run(['predict', ...base, '--plan', path.join(m, 'sample.json'), '--out', m, '--wl-json', path.join(m, 'wl.json'), '--wl-json-b', path.join(m, 'wlb.json'), '--linters', 'none']);
const P = J(path.join(m, 'predictions.json')), pe = n => P.entities.find(e => e.entity === n) || {};
ok(r.code === 0 && P.target === 'mowas2', 'predict target mowas2', r.out + r.err + ' ' + P.target);
ok(pe('tank_a').predicted === 'CRASH' && pe('tree_a').predicted === 'LOAD', 'predict reads the mowas_2 wouldload result, not the as64 one', JSON.stringify([pe('tank_a').predicted, pe('tree_a').predicted]));
// sweep --no-plan: RUN.md for mowas_2
r = run(['sweep', '--plan', path.join(m, 'sample.json'), '--out', m, '--game', AS2, '--no-plan']);
const md = R(path.join(m, 'RUN.md'));
ok(r.code === 0 && /^# gohsample RUN \(mowas2 preload sweep\)/.test(md), 'RUN.md title mowas2', r.out + r.err + md.slice(0, 200));
ok(!/as64\+/.test(md) && !/as64\.exe/.test(md), 'RUN.md: no as64+ and no as64.exe', md);
ok(!/node tools\/testrun/.test(md) && /mowas_2\.exe has no -control and no -instance \(limits TST-19\)/.test(md), 'RUN.md: no testrun line, the TST-19 line instead', md);
ok(/main user log/.test(md) && !/instance 1 only/.test(md), 'RUN.md: main log, no instance cleanup', md);
// boot: range and exe name
const bo = path.join(OUT, 'mb'); fs.mkdirSync(bo, { recursive: true });
for (const f of ['build.json', 'sample.json']) fs.copyFileSync(path.join(m, f), path.join(bo, f));
fs.cpSync(path.join(m, 'mod_b'), path.join(bo, 'mod_b'), { recursive: true });
r = run(['boot', '--out', bo]);
const bmi = R(path.join(bo, 'boot_active', 'mod.info'));
ok(r.code === 0 && /MinGameVersion "3\.262\.0"\}\r\n \{MaxGameVersion "3\.262\.1"/.test(bmi), 'boot_active mod.info mowas2 range', r.out + r.err + bmi);
ok(/boot mowas_2\.exe with mods 'gohsample_b'/.test(r.out), 'boot line: mowas_2.exe, no as64+', r.out);
// as64 build from the as64 plan: mod.info as before
r = run(['build', ...base, '--plan', path.join(a, 'sample.json'), '--out', a]);
ok(r.code === 0 && R(path.join(a, 'mod', 'mod.info')).includes(' {MinGameVersion "3.301"}\r\n}') && !/MaxGameVersion/.test(R(path.join(a, 'mod', 'mod.info'))), 'as64 build: mod.info 3.301 as before', r.out + r.err);
r = run(['sweep', '--plan', path.join(a, 'sample.json'), '--out', a, '--game', AS2, '--no-plan']);
const mda = R(path.join(a, 'RUN.md'));
ok(/^# gohsample RUN \(as64 preload sweep\)/.test(mda) && /node tools\/testrun\/testrun\.js --exe .*as64\.exe" --map multi\/1v1_road:combat --mods 'as64\+,gohsample,gohsample_sweep'/.test(mda), 'as64 RUN.md as before', mda.slice(0, 1500));
// default target follows the install as goh2as2 does: as64.exe -> as64 (not named), none -> mowas_2 (named, children get --exe)
{
  const C = require('../common'), mw = path.join(OUT, 'mwinst');
  fs.mkdirSync(path.join(mw, 'resource'), { recursive: true }); fs.writeFileSync(path.join(mw, 'mowas_2.exe'), '');
  const t0 = C.target({ as2: AS2 }), t1 = C.target({ as2: mw }), t2 = C.target({}, { meta: { as2: mw } }), t3 = C.target({ as2: mw, exe: 'as64' });
  ok(t0.id === 'as64' && !t0.named && t0.flag.length === 0, 'default with as64.exe: as64, not named (as before)', JSON.stringify(t0));
  ok(t1.id === 'mowas2' && t1.named && t1.flag.join(' ') === '--exe mowas_2', 'default without as64.exe: mowas2, --exe mowas_2 passed on', JSON.stringify(t1));
  ok(t2.id === 'mowas2', 'default from plan meta.as2 without as64.exe: mowas2', JSON.stringify(t2));
  ok(t3.id === 'as64', 'named --exe as64 wins over the install', JSON.stringify(t3));
}
{ // header names the default as the code makes it (plan meta.exe, else the install: as64.exe -> as64, none -> mowas_2)
  const hd = fs.readFileSync(CLI, 'utf8').split(/\r?\n/).slice(0, 20).join('\n');
  ok(/No --exe: the plan's meta\.exe, else the install/.test(hd) && /no as64\.exe -> mowas_2/.test(hd) && !/No --exe: as64 as before\./.test(hd), 'header: the no --exe default');
}
fs.rmSync(OUT, { recursive: true, force: true });
console.log(fails ? `FAIL parity: ${fails}` : 'parity checks passed');
process.exit(fails ? 1 : 0);

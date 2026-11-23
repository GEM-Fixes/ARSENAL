// gohsample test: on the synthetic fixture (test/fx). No game is touched or launched.
// Author: Imperator_Aug (ARSENAL, ia-70ace351)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const FX = path.join(__dirname, 'fx'), GOH = path.join(FX, 'goh'), AS2 = path.join(FX, 'as2'), OUT = path.join(FX, 'out');
const CLI = path.join(__dirname, '..', 'gohsample.js');
let fails = 0;
const ok = (c, name, extra) => { if (!c) { fails++; console.log('FAIL ' + name + (extra ? '\n' + extra : '')); } };
const run = args => { const r = cp.spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', windowsHide: true, maxBuffer: 1 << 26 }); return { code: r.status, out: r.stdout || '', err: r.stderr || '' }; };
const J = f => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''));
const W = (f, o) => fs.writeFileSync(f, typeof o === 'string' ? o : JSON.stringify(o));
process.env.AS64_LIMITS = path.join(__dirname, 'limits');   // own 3-row fixture: a release copy has no repo limits/
const base = ['--goh', GOH, '--as2', AS2];

// ---- plan: coverage, determinism
const o1 = path.join(OUT, 'p1'), o2 = path.join(OUT, 'p2');
let r = run(['plan', ...base, '--out', o1, '--seed', '7']);
ok(r.code === 0, 'plan exit 0', r.out + r.err);
r = run(['plan', ...base, '--out', o2, '--seed', '7']);
ok(r.code === 0, 'plan 2 exit 0', r.out + r.err);
const s1 = J(path.join(o1, 'sample.json')), s2 = J(path.join(o2, 'sample.json'));
const names = s1.entities.map(e => e.entity).sort();
ok(JSON.stringify(s1.entities) === JSON.stringify(s2.entities), 'plan deterministic (same seed, same entities)');
ok(names.join() === 'btr_a,fx_a,rifle_a,tank_a,tree_a', 'sample is the 5 listable entities', names.join());
const kinds = new Set(s1.entities.map(e => e.kind));
for (const k of ['vehicle/tank', 'vehicle/btr', 'inventory/weapon/small_arms', 'flora', 'fx']) ok(kinds.has(k), 'kind covered: ' + k);
const codes = new Set(s1.entities.flatMap(e => e.codes));
for (const c of ['WARN_PORT_VOLUME_KEY', 'WARN_PORT_VOLUME_FLAG', 'WARN_PORT_DROP_EVENTS', 'WARN_PORT_SHARED_PROPS']) ok(codes.has(c), 'code covered: ' + c);
const unc = fs.readFileSync(path.join(o1, 'uncovered.txt'), 'utf8');
ok(/special names/.test(unc), 'uncovered.txt names the unlistable special name');
ok(/CODE WARN_PORT_ARITH_EVAL/.test(unc), 'uncovered.txt lists a code no entity carries');
const pbk = (s1.partB && s1.partB.files) || [];
ok(pbk.some(f => f.key === 'set/stuff/gun/g1.ammo' && f.codes.includes('WARN_PORT_DROP_AMMO_KEY') && f.loadKind === 'BOOT_STUFF'), 'part B picked the ammo file that carries DROP_AMMO_KEY', JSON.stringify(pbk));
ok(pbk.every(f => f.cite && f.loadKind), 'part B files carry a load kind and a cite');
ok(/NO_TRIGGER CODE WARN_PORT_ARITH_EVAL/.test(unc) && !/UNSAMPLED CODE WARN_PORT_DROP_AMMO_KEY/.test(unc), 'uncovered.txt splits NO_TRIGGER from UNSAMPLED');
{ const o3 = path.join(OUT, 'p3'), r3 = run(['plan', ...base, '--out', o3, '--seed', '7', '--limits', path.join(FX, 'nolimits')]);
  ok(r3.code === 0 && !/WARN_PORT_ARITH_EVAL/.test(fs.readFileSync(path.join(o3, 'uncovered.txt'), 'utf8')), '--limits overrides AS64_LIMITS (empty dir: no row-only codes)', r3.out + r3.err); }
ok(s1.meta.excluded.as2_name_collision === 1 && s1.meta.excluded.special_name === 1, 'exclusions counted', JSON.stringify(s1.meta.excluded));

// ---- plan --out inside a game dir is refused
const bad = path.join(GOH, 'out_here');
r = run(['plan', ...base, '--out', bad]);
ok(r.code === 2 && /inside a game install/.test(r.err), 'plan --out under GoH dir exits 2', r.code + ' ' + r.err);
ok(!fs.existsSync(bad), 'refused plan wrote nothing');
r = run(['build', ...base, '--plan', path.join(o1, 'sample.json'), '--out', path.join(AS2, 'o')]);
ok(r.code === 2, 'build --out under AS2 dir exits 2', r.code + ' ' + r.err);

// ---- build with an extra nonexistent entity -> refusal recorded
const withGhost = Object.assign({}, s1, { entities: s1.entities.concat([{ entity: 'ghost_unit', key: 'entity/ghost/ghost_unit.def', kind: 'misc', sub: 'ghost', codes: [], why: 'test' }]) });
const bdir = path.join(OUT, 'b');
fs.mkdirSync(bdir, { recursive: true });
W(path.join(bdir, 'sample.json'), withGhost);
r = run(['build', ...base, '--plan', path.join(bdir, 'sample.json'), '--out', bdir]);
ok(r.code === 0, 'build exit 0', r.out + r.err);
const B = J(path.join(bdir, 'build.json'));
const rec = n => B.entities.find(e => e.entity === n) || {};
ok(rec('ghost_unit').status === 'refused' && rec('ghost_unit').reason, 'build refusal recorded with a reason', JSON.stringify(rec('ghost_unit')));
ok(B.counts.refused === 1 && B.counts.converted === 5, 'build counts 5 converted 1 refused', JSON.stringify(B.counts));
ok(rec('tank_a').status === 'converted' && rec('tank_a').files.some(f => /tank_a\.def$/.test(f)), 'tank_a converted with its def');
ok(rec('tank_a').findings.WARN_PORT_VOLUME_KEY >= 1 && rec('btr_a').findings.WARN_PORT_DROP_EVENTS >= 1, 'port findings recorded per entity');
ok(Object.keys(rec('rifle_a').info).concat(Object.keys(rec('rifle_a').findings)).includes('PORT_PROPS_COPIED'), 'rifle_a records the copied /properties include (absent from fake AS2)');
ok(fs.readFileSync(path.join(bdir, 'names.txt'), 'utf8').split(/\r?\n/).filter(Boolean).sort().join() === 'btr_a,fx_a,rifle_a,tank_a,tree_a', 'names.txt lists built entities only');
ok(fs.existsSync(path.join(bdir, 'mod', 'mod.info')), 'mod.info written');

// ---- predict from a canned wouldload json: ORPHAN counts as CRASH
const wl = { exes: { as64: { tested: true, verdict: 'WOULD_LOAD', readProblems: [], toolFailed: [], silent: [],
  crash: [
    { entity: 'tank_a', code: 'INCLUDE_MISSING', cls: 'SPAWN', file: 'resource/entity/-vehicle/ger/tank_a/tank_a.def', line: 2, msg: 'x', reach: 'ORPHAN' },
    { entity: 'btr_a', code: 'MACRO_UNDEFINED', cls: 'SPAWN', file: 'resource/entity/-vehicle/ger/btr/btr_a/btr_a.def', line: 2, msg: 'x', reach: 'REACHABLE' },
  ] } } };
W(path.join(bdir, 'wl.json'), wl);
ok(B.partB && B.partB.counts.converted >= 1 && fs.existsSync(path.join(bdir, 'mod_b', 'resource', 'set/stuff/gun/g1.ammo')), 'part B built into mod_b', JSON.stringify(B.partB && B.partB.counts));
ok(!fs.existsSync(path.join(bdir, 'mod', 'resource', 'set')), 'part B files never in mod');
ok(fs.existsSync(path.join(bdir, 'mod_b', 'mod.info')), 'mod_b has mod.info');
const HARD1 = Object.keys(require('../../wouldload/classes').HARD)[0];
W(path.join(bdir, 'wlb.json'), { exes: { as64: { tested: true, readProblems: [], toolFailed: [], silent: [{ file: 'x/resource/set/stuff/gun/g1.ammo', line: 2, code: HARD1, msg: 'x' }], crash: [] } } });
r = run(['predict', ...base, '--plan', path.join(bdir, 'sample.json'), '--out', bdir, '--wl-json', path.join(bdir, 'wl.json'), '--wl-json-b', path.join(bdir, 'wlb.json'), '--linters', 'none']);
ok(r.code === 0, 'predict exit 0', r.out + r.err);
const PBf = (J(path.join(bdir, 'predictions.json')).partB || { files: [] }).files;
const g1 = PBf.find(f => f.file === 'set/stuff/gun/g1.ammo') || {};
ok(g1.class === 'LOAD' && /set.stuff/.test(g1.loadCite || ''), 'part B stuff file is class LOAD with the boot note', JSON.stringify(g1));
ok(g1.predicted === 'CRASH' && g1.crashCodes.includes(HARD1), 'hard-code finding on a part B file = CRASH', JSON.stringify(g1));
ok((PBf.find(f => f.file === 'set/stuff/gun/g2.weapon') || { predicted: 'LOAD' }).predicted === 'LOAD', 'part B file without a finding = LOAD');
const P = J(path.join(bdir, 'predictions.json'));
const pe = n => P.entities.find(e => e.entity === n) || {};
ok(pe('tank_a').predicted === 'CRASH' && pe('tank_a').reach === 'ORPHAN' && pe('tank_a').crash[0].countedByWouldload === false, 'ORPHAN entry counts as CRASH, reach kept', JSON.stringify(pe('tank_a')));
ok(pe('btr_a').predicted === 'CRASH' && pe('btr_a').reach === 'REACHABLE', 'REACHABLE entry is CRASH');
ok(pe('tree_a').predicted === 'LOAD' && pe('rifle_a').predicted === 'LOAD', 'no entry = LOAD');
ok(pe('ghost_unit').predicted === 'NOT_BUILT', 'refused entity is NOT_BUILT');
ok(P.counts.CRASH === 2 && P.counts.NOT_BUILT === 1, 'prediction counts', JSON.stringify(P.counts));
// wouldload without a tested result: UNKNOWN, not LOAD
W(path.join(bdir, 'wl0.json'), { exes: { as64: { tested: false, crash: [], silent: [] } } });
const bdir2 = path.join(OUT, 'b2'); fs.mkdirSync(bdir2, { recursive: true });
for (const f of ['sample.json', 'build.json']) fs.copyFileSync(path.join(bdir, f), path.join(bdir2, f));
r = run(['predict', ...base, '--plan', path.join(bdir2, 'sample.json'), '--out', bdir2, '--wl-json', path.join(bdir, 'wl0.json'), '--linters', 'none']);
ok(J(path.join(bdir2, 'predictions.json')).entities.find(e => e.entity === 'tree_a').predicted === 'UNKNOWN', 'untested wouldload gives UNKNOWN');

// ---- compare: TP (tank_a), FP (btr_a), FN (rifle_a), TN (tree_a); fx_a MISSING; ghost not counted
const check = (dir, label) => {
  const c = J(path.join(dir, 'calibration.json'));
  const n = c.counts;
  ok(n.TP === 1 && n.FP === 1 && n.FN === 1 && n.TN === 1, label + ': TP FP FN TN = 1 1 1 1', JSON.stringify(n));
  ok(n.MISSING === 1, label + ': MISSING counted apart', JSON.stringify(n));
  ok(c.misses.length === 1 && c.misses[0].entity === 'rifle_a', label + ': miss is rifle_a with an error line', JSON.stringify(c.misses));
  ok(c.falseAlarms.length === 1 && c.falseAlarms[0].entity === 'btr_a', label + ': false alarm is btr_a');
  ok(c.perCode.INCLUDE_MISSING && c.perCode.INCLUDE_MISSING.hitRate === 100 && c.perCode.MACRO_UNDEFINED.hitRate === 0, label + ': per-code hit rate', JSON.stringify(c.perCode));
  ok(c.newRuleCandidates.some(x => x.code === 'PORT_PROPS_COPIED'), label + ': new rule candidate from the missed crash');
  ok(fs.existsSync(path.join(dir, 'calibration.md')), label + ': calibration.md written');
};
const cj = path.join(OUT, 'cj'); fs.mkdirSync(cj, { recursive: true });
W(path.join(cj, 'res.json'), { entities: [
  { name: 'tank_a', status: 'FAILED', how: 'crash', why: 'crash in its window; boom' },
  { name: 'btr_a', status: 'NO_ERROR', why: '' },
  { name: 'rifle_a', status: 'FAILED', how: 'crash', why: 'crash in its window; Exception: bad ref' },
  { name: 'tree_a', status: 'NO_ERROR', why: '' },
  { name: 'fx_a', status: 'FAILED', how: 'cant_preload', why: "Can't preload fx_a" },
] });
r = run(['compare', '--predictions', path.join(bdir, 'predictions.json'), '--read', path.join(cj, 'res.json'), '--out', cj]);
ok(r.code === 0, 'compare json exit 0', r.out + r.err);
check(cj, 'json');
const ct = path.join(OUT, 'ct'); fs.mkdirSync(ct, { recursive: true });
W(path.join(ct, 'read.txt'), ['FAILED tank_a: crash in its window; boom', 'NO_ERROR btr_a: ok', 'FAILED rifle_a: crash in its window; Exception: bad ref', 'NO_ERROR tree_a: ok', "FAILED fx_a: Can't preload fx_a", ''].join('\r\n'));
r = run(['compare', '--predictions', path.join(bdir, 'predictions.json'), '--read', path.join(ct, 'read.txt'), '--out', ct]);
ok(r.code === 0, 'compare text exit 0', r.out + r.err);
check(ct, 'text');

// ---- boot bisect: pure transition finds every crasher (including two), the CLI writes the active mod
const { advance } = require('../boot');
const bisect = (all, bad) => { let st = { step: 1, all, untested: [], suspect: [], testing: all.slice(), clean: [], crashers: [], history: [], done: false }, n = 0; while (!st.done && n++ < 50) st = advance(st, st.testing.some(k => bad.includes(k)) ? 'crash' : 'clean'); return { st, n }; };
for (const [all, bad] of [[['a', 'b', 'c', 'd', 'e', 'f', 'g'], ['e']], [['a', 'b', 'c', 'd', 'e', 'f', 'g'], ['b', 'f']], [['a', 'b', 'c'], []], [['a'], ['a']]]) {
  const { st, n } = bisect(all, bad);
  ok(st.done && st.crashers.slice().sort().join() === bad.join() && st.clean.slice().sort().join() === all.filter(k => !bad.includes(k)).join(), 'boot bisect finds crashers ' + JSON.stringify(bad), JSON.stringify(st) + ' steps ' + n);
}
const bo = path.join(OUT, 'boot'); fs.mkdirSync(bo, { recursive: true });
fs.copyFileSync(path.join(bdir, 'build.json'), path.join(bo, 'build.json'));
fs.cpSync(path.join(bdir, 'mod_b'), path.join(bo, 'mod_b'), { recursive: true });
r = run(['boot', '--out', bo]);
ok(r.code === 0 && fs.existsSync(path.join(bo, 'boot_active', 'resource', 'set/stuff/gun/g1.ammo')), 'boot init writes boot_active', r.out + r.err);
r = run(['boot', '--out', bo, '--result', 'crash']);
ok(r.code === 0 && J(path.join(bo, 'boot-state.json')).step === 2, 'boot --result advances', r.out + r.err);

// ---- compare part B from a boot-state: g1 crashed (TP), the rest clean
const cb = path.join(OUT, 'cb'); fs.mkdirSync(cb, { recursive: true });
const allB = PBf.filter(f => /^BOOT_/.test(f.loadKind)).map(f => f.file);
W(path.join(cb, 'boot-state.json'), { crashers: ['set/stuff/gun/g1.ammo'], clean: allB.filter(k => k !== 'set/stuff/gun/g1.ammo') });
r = run(['compare', '--predictions', path.join(bdir, 'predictions.json'), '--read', path.join(cj, 'res.json'), '--boot-state', path.join(cb, 'boot-state.json'), '--out', cb]);
const cB = J(path.join(cb, 'calibration.json')).partB;
ok(cB && cB.counts.TP === 1 && cB.counts.FP === 0 && cB.counts.TN >= 1, 'compare part B TP/TN from boot-state', JSON.stringify(cB && cB.counts));
ok(/Part B/.test(fs.readFileSync(path.join(cb, 'calibration.md'), 'utf8')), 'calibration.md has a part B section');

console.log(fails ? `${fails} failures` : 'all checks passed');
process.exit(fails ? 1 : 0);

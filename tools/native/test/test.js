// Author: Imperator_Aug (ARSENAL, ia-fa44a2cc)
'use strict';
// SEED test for native.js: a fixture ported def with 2 planted missing keys, 1 extra key and 1 out-of-range value gives exactly those 4 findings.
// NAT-CLS seeds (second fixture): profile subcommand, folder class for non-vehicle defs, odd vs extra, a text-only mod, per-unit defs.
// Fixture game dir, xlate table and mod are written to the OS temp dir and removed again. No game.
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const N = require('../native.js'), S = require('../../score/score.js');
let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('FAIL ' + m); } else console.log('ok   ' + m); };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m + (JSON.stringify(a) === JSON.stringify(b) ? '' : ' got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b)));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'native-test-'));
const w = (f, t) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t.replace(/\n/g, '\r\n')); };
const def = (speed, extra) => `{entity
 {mass 20000}
 {chassis {locomotion {maxspeed ${speed}} {turntime 5}} {fuelbag {volume 300}}}
 {props "vehicle" "tank"}
 {boarder {seat 1}}
${extra}}
`;
try {
  const G = path.join(tmp, 'game');
  for (const s of ['pa', 'pb', 'pc', 'pd']) w(path.join(G, 'resource', 'entity', '-vehicle', 'tank_medium', s, s + '.def'), def(30 + s.length, ' {collider "c"}\n {targetclass "tank"}\n'));
  const table = { classes: { tank_medium: { units: { goh: 0, as2: 4 }, keys: {}, curated: { speed: { as2: { n: 5, min: 20, max: 60 } }, mass: { as2: { n: 5, min: 10000, max: 40000 } } } } } };
  const T = path.join(tmp, 'table.json'); fs.writeFileSync(T, JSON.stringify(table));
  const M = path.join(tmp, 'mod');
  w(path.join(M, 'resource', 'entity', 'seed1', 'seed1.def'), def(400, ' {zzextra 1}\n'));   // 2 missing (collider, targetclass), 1 extra, speed 400 out of 20..60
  w(path.join(M, 'resource', 'entity', 'good1', 'good1.def'), def(40, ' {collider "c"}\n {targetclass "tank"}\n'));
  const o = { input: M, game: G, table: T, class: 'tank_medium' };
  const a = N.run(o), b = N.run(o);
  eq(a.units.map(u => u.unit), ['good1', 'seed1'], 'both units read, sorted');
  const s = a.units[1], g = a.units[0];
  eq(s.missing, ['entity/collider', 'entity/targetclass'], 'seed: the 2 planted missing keys');
  eq(s.extra, ['entity/zzextra'], 'seed: the 1 extra key');
  eq(s.values.map(v => v.key + '=' + v.value), ['speed=400'], 'seed: the 1 out-of-range value');
  eq(s.findings, 4, 'seed: exactly 4 findings');
  eq(g.findings, 0, 'the clean twin has 0 findings');
  eq(s.peers, 4, 'four peers read');
  ok(s.gaps && s.gaps.present === false && /skipped/.test(s.gaps.note), 'no gaps file: said so, skipped');
  ok(JSON.stringify(a) === JSON.stringify(b), 'same input, same bytes (two runs)');
  ok(!/\d{4}-\d\d-\d\d/.test(JSON.stringify(a)) && !JSON.stringify(a).includes(tmp.replace(/\\/g, '\\\\')), 'no dates, no absolute paths');
  // class inferred from the key sets, no --class
  const c = N.run({ input: M, game: G, table: T });
  eq(c.units.map(u => u.class + ':' + String(u.classBy).split(' ')[0]), ['tank_medium:keys', 'tank_medium:keys'], 'auto class from key overlap');
  // gaps present: hand + unexplained count as findings
  w(path.join(M, 'gaps', 'seed1.gaps.json'), JSON.stringify({ form: 'gaps/1', counts: { dropped: 3, baked: 1, donor: 0, hand: 2, unexplained: 1 }, byCode: {} }));
  const d = N.run(o).units[1];
  eq([d.gaps.present, d.gaps.hand, d.gaps.unexplained, d.findings], [true, 2, 1, 7], 'gaps file read: hand 2 + unexplained 1 add 3 findings');
  fs.rmSync(path.join(M, 'gaps'), { recursive: true });
  // CLI: file output equals the library result byte for byte
  const out = path.join(tmp, 'o.json');
  const r = cp.spawnSync(process.execPath, [path.join(__dirname, '..', 'native.js'), path.join(M, 'resource', 'entity', 'seed1', 'seed1.def'), '--game', G, '--table', T, '--class', 'tank_medium', '-o', out], { encoding: 'utf8' });
  eq(r.status, 0, 'CLI exits 0');
  eq(JSON.parse(fs.readFileSync(out, 'utf8')).units[0].findings, 4, 'CLI on one def: 4 findings');
  // T-PORTINC: -o into a folder that does not exist yet is made
  const out2 = path.join(tmp, 'newdir', 'deeper', 'o2.json');
  const r2 = cp.spawnSync(process.execPath, [path.join(__dirname, '..', 'native.js'), path.join(M, 'resource', 'entity', 'seed1', 'seed1.def'), '--game', G, '--table', T, '--class', 'tank_medium', '-o', out2], { encoding: 'utf8' });
  eq(r2.status, 0, 'CLI -o into absent folder exits 0');
  ok(fs.existsSync(out2), '-o made the missing folder and wrote the file');
  // NAT-KEEP: a keep row with an as64 reader line excuses an extra key (kept, no finding); a stat-only keep row does not; --no-rules = old output
  const RD = path.join(tmp, 'rules'), RS = path.join(tmp, 'rules-stat');
  w(path.join(RD, 'a.json'), JSON.stringify({ form: 'nativerules/1', rules: [{ id: 'k-01', key: 'entity/zz*', class: '*', act: 'keep', why: 't', src: '', tag: 'V' },
    { id: 'k-02', key: 'entity/collider', class: '*', act: 'drop', why: 't', src: '', tag: 'V' }] }));
  w(path.join(RS, 'a.json'), JSON.stringify({ form: 'nativerules/1', rules: [{ id: 's-01', key: 'entity/zzextra', class: '*', act: 'keep', why: 't', src: 'vanilla 2 of 60 tank_medium; modweb/keys/chassis.md:21', tag: 'I' }] }));
  const k1 = N.run({ ...o, rules: RD }), ks = k1.units[1];
  eq([ks.extra, ks.kept, ks.findings, ks.missing.length], [[], [{ key: 'entity/zzextra', rule: 'k-01', src: '' }], 3, 2], 'keep row with reader proof: zzextra kept, no finding (4 -> 3); drop row ignored');
  eq([k1.totals.kept, k1.totals.extra, k1.rules], [1, 0, { proven: 1, statOnly: 0 }], 'keep: totals.kept 1, extra 0, rules counted');
  ok(JSON.stringify(k1) === JSON.stringify(N.run({ ...o, rules: RD })), 'keep: same input, same bytes');
  const k2 = N.run({ ...o, rules: RS }).units[1];
  eq([k2.extra, k2.kept, k2.findings], [['entity/zzextra'], [], 4], 'stat-only keep row: zzextra stays an extra finding');
  const k3 = N.run({ ...o, rules: RD, noRules: true });
  eq([k3.units[1].extra, k3.units[1].kept, k3.units[1].findings, k3.rules], [['entity/zzextra'], [], 4, 'off'], '--no-rules: old output (extra, 4 findings)');
  const r5 = cp.spawnSync(process.execPath, [path.join(__dirname, '..', 'native.js'), path.join(M, 'resource', 'entity', 'seed1', 'seed1.def'), '--game', G, '--table', T, '--class', 'tank_medium', '--rules', RD], { encoding: 'utf8' });
  eq([r5.status, JSON.parse(r5.stdout).units[0].findings, /kept 1 by reader-proven/.test(r5.stderr)], [0, 3, true], 'CLI --rules: 3 findings, kept 1 in the summary line');
  const r6 = cp.spawnSync(process.execPath, [path.join(__dirname, '..', 'native.js'), path.join(M, 'resource', 'entity', 'seed1', 'seed1.def'), '--game', G, '--table', T, '--class', 'tank_medium', '--rules', RD, '--no-rules'], { encoding: 'utf8' });
  eq([r6.status, JSON.parse(r6.stdout).units[0].findings], [0, 4], 'CLI --no-rules: 4 findings');
  // score row N reads the native dir
  const nd = path.join(tmp, 'native'); fs.mkdirSync(nd);
  fs.writeFileSync(path.join(nd, 'a.json'), JSON.stringify(a));
  eq(S.scoreN(nd).text.slice(0, 49), '1 of 2 distinct units native (0 findings); 4 find', 'score N: 1 of 2 units native');
  ok(/^not measured/.test(S.scoreN(path.join(tmp, 'nodir')).text), 'score N: no dir is not measured');

  // ---- NAT-CLS seeds: a second fixture game with two vehicle classes and an inventory folder; a text-only mod (no ply, no texture, no binary)
  const G2 = path.join(tmp, 'game2'), M2 = path.join(tmp, 'mod2'), R = (...p) => path.join(G2, 'resource', 'entity', ...p);
  [['m1', 30, ' {collider "c"}\n {texmod 1}\n'], ['m2', 40, ' {collider "c"}\n'], ['m3', 50, ' {collider "c"}\n']].forEach(([s, v, x]) => w(R('-vehicle', 'tank_medium', s, s + '.def'), def(v, x)));
  ['h1', 'h2', 'h3'].forEach((s, i) => w(R('-vehicle', 'tank_heavy', s, s + '.def'), def(20 + i, ' {nogroupmesh}\n')));
  ['a1', 'a2', 'a3'].forEach((s, i) => w(R('inventory', '-ammo', s, s + '.def'), `{entity\n {mass ${i + 1}}\n {props "ammo"}\n${i ? '' : ' {rimx 2}\n'}}\n`));
  const MR = (...p) => path.join(M2, 'resource', 'entity', ...p);
  // u1: includes its own text .ext (defs), names a ply that is not there (text only), nogroupmesh is tank_heavy's (odd), zzgoh no vanilla def has (extra)
  w(MR('-vehicle', 'ger', 'tank_medium', 'u1', 'u1.def'), '{entity\n (include "u1.ext")\n {mass 20000}\n {chassis {locomotion {maxspeed 45} {turntime 5}} {fuelbag {volume 300}}}\n {props "vehicle" "tank"}\n {boarder {seat 1}}\n {collider "u1.ply"}\n {nogroupmesh}\n}\n');
  w(MR('-vehicle', 'ger', 'tank_medium', 'u1', 'u1.ext'), '{zzgoh 1}\n');
  w(MR('inventory', '-ammo', '-shells', 'eng', 's1', 's1.def'), '{entity\n {mass 2}\n {props "ammo"}\n {rimx 1}\n {zzammo 1}\n}\n');
  w(MR('inventory', '-tools', 't1', 't1.def'), '{entity\n {mass 2}\n}\n');
  const files = fs.readdirSync(M2, { recursive: true }).map(f => f.replace(/\\/g, '/')).filter(f => /\.\w+$/.test(f));
  ok(files.length === 4 && files.every(f => /\.(def|ext)$/.test(f)), 'text-only mod: 4 text files, no binary');
  const o2 = { input: M2, game: G2, table: T }, x = N.run(o2), y = N.run(o2), U = n => x.units.find(u => u.unit === n);
  ok(JSON.stringify(x) === JSON.stringify(y), 'NAT-CLS run: same input, same bytes');
  // 4. text only: the vehicle unit is checked, not skipped, with no ply and no texture present
  eq([U('u1').skipped, U('u1').class, U('u1').classBy, U('u1').peers], [undefined, 'tank_medium', 'path', 3], 'text-only: u1 read and classed by path');
  // 3. odd vs extra
  eq(U('u1').extra, ['entity/zzgoh'], 'u1: extra = the key no vanilla def has');
  eq(U('u1').odd, ['entity/nogroupmesh'], 'u1: odd = the key vanilla uses in another class (tank_heavy)');
  eq(U('u1').findings, 1, 'u1: odd is not a finding (1 = the extra)');
  // 5. defs: the def and its own include, mod-relative, sorted
  eq(U('u1').defs, ['resource/entity/-vehicle/ger/tank_medium/u1/u1.def', 'resource/entity/-vehicle/ger/tank_medium/u1/u1.ext'], 'u1: defs = def + included ext');
  // 2. a def outside -vehicle takes its nearest vanilla peer folder; no peer folder = skipped, counted apart
  eq([U('s1').class, U('s1').classBy, U('s1').peers, U('s1').extra, U('s1').odd], ['inventory/-ammo', 'folder +2', 3, ['entity/zzammo'], []], 's1: class inventory/-ammo from the folder 2 up; rimx in 1 of 3 peers is not extra');
  eq([U('t1').skipKind, x.totals.noClass, x.totals.skipped, x.totals.odd], ['noClass', 1, 1, 1], 't1: no vanilla peer folder, skipped as noClass; totals count it apart');
  eq(U('s1').defs, ['resource/entity/inventory/-ammo/-shells/eng/s1/s1.def'], 's1: defs');
  const b2 = require('../../pairdiff/pairdiff.js').collect(G2), pl = N.peerList(b2); b2.close();
  eq(N.folderClass('entity/inventory/-tools/t1/t1.def', pl), null, 'folderClass: entity/ itself is never a class');
  eq(N.folderClass('entity/inventory/-ammo/x1/x1.def', pl), { cls: 'inventory/-ammo', up: 0 }, 'folderClass: own folder first');
  // 1. profile
  const p = N.profile({ class: 'tank_medium', game: G2 }), p2 = N.profile({ class: 'tank_medium', game: G2 });
  ok(JSON.stringify(p) === JSON.stringify(p2), 'profile: same input, same bytes');
  eq([p.form, p.class, p.peers], ['native-profile/1', 'tank_medium', 3], 'profile: form, class, peers');
  eq(p.keys['entity/chassis/locomotion/maxspeed'], { n: 3, of: 3, values: [30, 40, 50], median: 40 }, 'profile: maxspeed values and median');
  eq(p.keys['entity/texmod'], { n: 1, of: 3, values: [1], median: 1 }, 'profile: texmod in 1 of 3');
  eq(p.keys['entity/props'], { n: 3, of: 3, values: [], median: null }, 'profile: no number = values [] and median null');
  eq(Object.keys(p.keys), Object.keys(p.keys).slice().sort(), 'profile: keys sorted');
  const pa = N.profile({ class: 'inventory/-ammo', game: G2 });
  eq([pa.peers, pa.keys['entity/mass'].values, pa.keys['entity/mass'].median, pa.keys['entity/rimx'].n], [3, [1, 2, 3], 2, 1], 'profile: an inventory folder class');
  const out3 = path.join(tmp, 'prof', 'p.json');
  const r3 = cp.spawnSync(process.execPath, [path.join(__dirname, '..', 'native.js'), 'profile', '--class', 'tank_medium', '--game', G2, '-o', out3], { encoding: 'utf8' });
  eq([r3.status, JSON.parse(fs.readFileSync(out3, 'utf8')).form], [0, 'native-profile/1'], 'profile CLI writes native-profile/1');
  ok(!fs.readFileSync(out3, 'utf8').includes(tmp.replace(/\\/g, '\\\\')) && !/\d{4}-\d\d-\d\d/.test(fs.readFileSync(out3, 'utf8')), 'profile: no absolute paths, no dates');
  const r4 = cp.spawnSync(process.execPath, [path.join(__dirname, '..', 'native.js'), 'profile', '--class', 'nope', '--game', G2], { encoding: 'utf8' });
  ok(r4.status === 1 && /no vanilla peers for class nope/.test(r4.stderr), 'profile: an unknown class fails with the class list');
  // native/1 stays readable by score: odd does not count
  const nd2 = path.join(tmp, 'native2'); fs.mkdirSync(nd2); fs.writeFileSync(path.join(nd2, 'x.json'), JSON.stringify(x));
  eq(S.scoreN(nd2).findings, x.totals.findings, 'score N reads the NAT-CLS record; findings match');
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
console.log(fail ? 'FAIL ' + fail : 'all ok');
process.exit(fail ? 1 : 0);

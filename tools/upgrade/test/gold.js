// T-UPG GOLD: an old mowas2 mod -> as64. --plan text, the --done text and mod.info equal golden files; hardlink counts fixed; source hashed before/after; two runs equal
// a missing golden file is written from this run and the test FAILS ("created"): read it, then rerun
// Author: Imperator_Aug (ARSENAL, ia-2a909037)
const fs = require('fs'), path = require('path'), cp = require('child_process'), crypto = require('crypto');
const FX = require('./fx');
const w = process.argv[2], gd = path.join(__dirname, 'gold'); let bad = 0;
const ok = (c, m) => { if (!c) { console.log('FAIL: ' + m); bad++; } };
const UP = path.join(__dirname, '..', 'upgrade.js'), none = path.join(w, 'none');
const mod = path.join(w, 'oldmod'); fs.mkdirSync(w, { recursive: true });
FX.build(mod);
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const hashTree = (d, skip) => walk(d).map(f => path.relative(d, f).split(path.sep).join('/')).filter(r => !(skip && skip.test(r))).sort()
  .map(r => r + ' ' + crypto.createHash('sha256').update(fs.readFileSync(path.join(d, r))).digest('hex')).join('\n');
function run(args) {
  const r = cp.spawnSync(process.execPath, [UP, mod, '--as2', none, '--goh', none, ...args], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
}
// stable text: no machine paths, no timing, LF
const norm = (t, out) => { let s = t.replace(/\r\n/g, '\n'); if (out) s = s.split(out).join('<OUT>'); return s.replace(/\d+ s\n/g, 'N s\n').replace(/\d+\.\d MB/g, 'X MB'); };
function gold(name, got) {
  const f = path.join(gd, name);
  if (!fs.existsSync(f)) { fs.mkdirSync(gd, { recursive: true }); fs.writeFileSync(f, got); ok(false, `golden ${name} created from this run, read it and rerun`); return; }
  const want = fs.readFileSync(f).toString('latin1').replace(/\r\n/g, '\n');
  ok(want === got.replace(/\r\n/g, '\n'), `${name} differs from golden:\n--- got\n${got}`);
}
const srcBefore = hashTree(mod);

// 1. plan text + written mod.info
const plan = run(['--to', 'as64', '--plan']);
ok(plan.code === 0, 'plan exit ' + plan.code + ' ' + plan.err);
gold('plan.txt', norm(plan.out));
const o1 = path.join(w, 'out1'), o2 = path.join(w, 'out2'), o3 = path.join(w, 'out3');
const r1 = run(['--to', 'as64', '--mode', 'enhanced', '--out', o1, '--json', path.join(w, 'r1.json')]);
ok(r1.code === 3, 'write exit (3 = partial, dll left out) ' + r1.code + ' ' + r1.err);
gold('done.txt', norm(r1.out, o1));
const mi = fs.readFileSync(path.join(o1, 'mod.info'));
gold('mod.info', mi.toString('latin1'));
ok(/MinGameVersion "3\.301/.test(mi) && !/MaxGameVersion/.test(mi), 'as64 range: Min 3.301, no Max: ' + JSON.stringify(mi.toString()));
ok(!/FileId/.test(mi), 'FileId dropped');
ok(mi.toString('latin1').split('\n').every(l => !l.length || l.endsWith('\r')), 'mod.info CRLF');
ok(fs.readFileSync(path.join(o1, 'resource/text/en.lng')).equals(fs.readFileSync(path.join(mod, 'resource/text/en.lng'))), 'lng unchanged byte for byte on mowas2 -> as64');
ok(fs.readFileSync(path.join(o1, 'resource/set/stuff/gun.set')).equals(fs.readFileSync(path.join(mod, 'resource/set/stuff/gun.set'))), 'set file unchanged (warn row only)');
ok(!fs.existsSync(path.join(o1, 'resource/bin/loose.dll')), 'loose dll left out');

// 2. hardlinks: fixed counts, source never changes
const j1 = JSON.parse(fs.readFileSync(path.join(w, 'r1.json'), 'utf8'));
ok(j1.result.pakLinked === 2, 'linked paks = 2, got ' + j1.result.pakLinked);
ok(j1.result.pakRebuilt === 1 && j1.result.pakCopied === 2, `rebuilt 1 / copied-or-linked 2, got ${j1.result.pakRebuilt}/${j1.result.pakCopied}`);
const nl = f => fs.statSync(path.join(o1, f)).nlink;
ok(nl('resource/u1.pak') === 2 && nl('resource/u2.pak') === 2, 'u1/u2 are hardlinks (nlink 2)');
ok(nl('resource/c.pak') === 1 && nl('mod.info') === 1, 'rebuilt pak and mod.info are not links');
ok(fs.readFileSync(path.join(o1, 'resource/u1.pak')).equals(fs.readFileSync(path.join(mod, 'resource/u1.pak'))), 'linked pak same bytes');
ok(srcBefore === hashTree(mod), 'source changed after the linked write');
const r3 = run(['--to', 'as64', '--mode', 'enhanced', '--out', o3, '--no-link', '--json', path.join(w, 'r3.json')]);
const j3 = JSON.parse(fs.readFileSync(path.join(w, 'r3.json'), 'utf8'));
ok(j3.result.pakLinked === 0 && fs.statSync(path.join(o3, 'resource/u1.pak')).nlink === 1, '--no-link links nothing');
ok(hashTree(o3, /^UPGRADE\.md$/) === hashTree(o1, /^UPGRADE\.md$/), '--no-link output bytes equal the linked output');
ok(srcBefore === hashTree(mod), 'source changed after the --no-link write');
// editing the output pak by replacing it must leave the source alone (hashed again)
fs.rmSync(path.join(o1, 'resource/u1.pak')); fs.writeFileSync(path.join(o1, 'resource/u1.pak'), 'x');
ok(srcBefore === hashTree(mod), 'source changed after replacing a linked output file');

// 3. second run into a fresh folder: same output
const r2 = run(['--to', 'as64', '--mode', 'enhanced', '--out', o2]);
ok(norm(r2.out, o2) === norm(r1.out, o1), 'second run text differs');
fs.writeFileSync(path.join(o1, 'resource/u1.pak'), fs.readFileSync(path.join(mod, 'resource/u1.pak')));   // restore the file replaced above before comparing
ok(hashTree(o2, /^UPGRADE\.md$/) === hashTree(o1, /^UPGRADE\.md$/), 'second run files differ');
ok(norm(fs.readFileSync(path.join(o2, 'UPGRADE.md'), 'utf8'), o2) === norm(r1.out, o1), 'UPGRADE.md of run 2 equals the printed text of run 1');
const p2 = run(['--to', 'as64', '--plan']);
ok(norm(p2.out) === norm(plan.out), 'second plan differs');
ok(srcBefore === hashTree(mod), 'source changed at the end');
process.exit(bad ? 1 : 0);

// gold: the three copy-paste samples (tools/gen/samples/{rename-unit,change-price,clone-unit}.yaml) run on the stand-in game in <W>/gold
// (mkfixture.js). `gen --plan --json` (canonical: paths + timings removed) and `gen` output must be byte-equal to test/gold/<sample>/.
//   node gold.js <fixture dir>          compare, prints "OK name" / "FAIL name: why", exit 1 on a FAIL
//   node gold.js <fixture dir> --update  rewrite test/gold/ from the current output (review the git diff)
// Author: Imperator_Aug (ARSENAL, ia-61dcab21)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const W = path.resolve(process.argv[2] || path.join(__dirname, 'work')), UPDATE = process.argv.includes('--update') || (fs.existsSync(path.join(__dirname, 'gold-update.txt')) && fs.readFileSync(path.join(__dirname, 'gold-update.txt'), 'utf8').trim() === '1');
const GEN = path.join(__dirname, '..', 'gen.js'), SAMPLES = path.join(__dirname, '..', 'samples'), GOLD = path.join(__dirname, 'gold'), G = path.join(W, 'gold');
let bad = 0;
const ok = (name, c, why) => { console.log(c ? 'OK ' + name : 'FAIL ' + name + ': ' + (why || '')); if (!c) bad++; };
const names = ['rename-unit', 'change-price', 'clone-unit'];
const walk = (d, rel = '') => !fs.existsSync(d) ? [] : fs.readdirSync(d, { withFileTypes: true }).filter(e => e.name !== '.arsenal-made').flatMap(e => e.isDirectory() ? walk(path.join(d, e.name), rel + e.name + '/') : [rel + e.name]).sort();
// every spelling of a machine path -> a marker
const scrub = (s, pairs) => { for (const [p, m] of pairs) for (const v of new Set([p, p.replace(/\\/g, '/'), p.replace(/\//g, '\\'), JSON.stringify(p).slice(1, -1), JSON.stringify(p.replace(/\//g, '\\')).slice(1, -1)])) s = s.split(v).join(m); return s; };
const run = args => cp.spawnSync(process.execPath, [GEN, ...args], { encoding: 'utf8', maxBuffer: 1 << 26 });
for (const n of names) {
  const spec = path.join(SAMPLES, n + '.yaml'), out = path.join(W, 'gold-out-' + n), rep = path.join(W, 'gold-rep-' + n);
  const base = ['--target', 'mowas2', '--game', G, '--no-gate', '--no-stat'];
  const pairs = [[out, '<out>'], [G, '<game>'], [W, '<work>']];
  // --plan: nothing written, canonical JSON equals plan.json
  const p = run([spec, ...base, '--out', out, '--report', rep, '--plan', '--json']);
  let j = null; try { j = JSON.parse(p.stdout); } catch (e) { /* below */ }
  ok(n + ' plan exit 0, nothing written', p.status === 0 && j && j.plan && !fs.existsSync(out) && !fs.existsSync(rep), (p.stdout + p.stderr).slice(0, 300));
  if (j) { delete j.ms; delete j.out; j.ops.list.forEach(o => delete o.ms); }
  const plan = scrub(JSON.stringify(j, null, 1) + '\n', pairs);
  const pf = path.join(GOLD, n, 'plan.json');
  if (UPDATE) { fs.mkdirSync(path.dirname(pf), { recursive: true }); fs.writeFileSync(pf, plan); }
  ok(n + ' plan output byte-equal to gold', fs.existsSync(pf) && fs.readFileSync(pf, 'utf8').replace(/\r\n/g, '\n') === plan /* a CRLF checkout (autocrlf) of plan.json reads as LF */, 'diff against ' + pf);
  // real run: the out tree byte-equal to gold/<n>/out
  const r = run([spec, ...base, '--out', out, '--report', rep]);
  ok(n + ' gen exit 0, 0 findings', r.status === 0 && /^0 findings$/m.test(r.stdout + r.stderr), (r.stdout + r.stderr).slice(0, 400));
  const want = path.join(GOLD, n, 'out'), got = walk(out);
  if (UPDATE) { fs.rmSync(want, { recursive: true, force: true }); for (const f of got) { fs.mkdirSync(path.dirname(path.join(want, f)), { recursive: true }); fs.copyFileSync(path.join(out, f), path.join(want, f)); } }
  const exp = walk(want);
  ok(n + ' same file list', JSON.stringify(got) === JSON.stringify(exp), 'got ' + got.join(' ') + ' | gold ' + exp.join(' '));
  const diff = exp.filter(f => !fs.existsSync(path.join(out, f)) || Buffer.compare(fs.readFileSync(path.join(out, f)), fs.readFileSync(path.join(want, f))) !== 0);
  ok(n + ' ' + exp.length + ' file(s) byte-equal to gold', exp.length > 0 && !diff.length, 'differ: ' + diff.join(' '));
}
// --sample: default is rename-unit, a name picks the others, "all" = the every-op sample, unknown refused
const samp = a => cp.spawnSync(process.execPath, [GEN, '--sample', ...a], { encoding: 'utf8' });
ok('--sample prints rename-unit.yaml', samp([]).stdout === fs.readFileSync(path.join(SAMPLES, 'rename-unit.yaml'), 'utf8') && samp([]).status === 0);
for (const n of names) ok('--sample ' + n, samp([n]).stdout === fs.readFileSync(path.join(SAMPLES, n + '.yaml'), 'utf8'));
ok('--sample all = sample.yaml', samp(['all']).stdout === fs.readFileSync(path.join(SAMPLES, 'sample.yaml'), 'utf8'));
ok('--sample nosuch refused', samp(['nosuch']).status === 2);
// each sample starts with 3 comment lines (what, the two values, the command) then the spec
for (const n of names) { const L = fs.readFileSync(path.join(SAMPLES, n + '.yaml'), 'utf8').split(/\r?\n/); ok(n + ' 3 comment lines then name:', L.slice(0, 3).every(l => l.startsWith('# ')) && L[3].startsWith('name:'), L.slice(0, 4).join(' | ')); }
console.log(bad ? bad + ' FAILED' : 'all ok');
process.exit(bad ? 1 : 0);

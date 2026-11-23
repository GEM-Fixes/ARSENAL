// T-PORTGAP GOLD: the same fixture ports run twice, into two folders under two different parents and from two different working
// directories: every output file (resource tree, mod.info, GOH-ORIGIN.tsv, names .lng, gaps/*.gaps.json) must be byte-equal and the file
// lists equal. Both outputs end in the same folder name, because mod.info names the --out folder on purpose. Seeded twin: a run with
// fewer inputs must differ (proves the compare sees a real change). Needs test/fixture from mkfixture.js (+ donor.js for the donor run).
// Author: Imperator_Aug (ARSENAL, ia-05334a01)
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const d = __dirname, F = path.join(d, 'fixture'), tool = path.join(d, '..', 'goh2as2.js');
let fail = 0;
const t = (name, good, extra) => { console.log((good ? 'ok   ' : 'FAIL ') + 'gold: ' + name + (good || !extra ? '' : '  ' + String(extra).slice(0, 600))); if (!good) fail++; };
const env = { ...process.env, AS2_NO_STEAM: '1', AS2_GAME: '' };
const W = fs.mkdtempSync(path.join(os.tmpdir(), 'gold-'));
const RUNS = [   // [name, args (no --out/--mod)], one output folder each
  ['tank', ['--goh', path.join(F, 'goh'), '--entity', 'tank', '--keys', path.join(F, 'keys.txt'), '--mod']],
  ['pcopy', ['--goh', path.join(F, 'goh'), '--entity', 'pcopy', '--game', path.join(F, 'as2'), '--mod']],
  ['digitref', ['--goh', path.join(F, 'goh'), '--entity', 'digitref', '--no-game', '--out']],
  ['bsunit', ['--goh', path.join(F, 'goh2'), '--base', path.join(F, 'base'), '--entity', 'bsunit', '--no-game', '--mod']],
];
if (fs.existsSync(path.join(F, 'donor', 'as2'))) RUNS.push(['donor', ['--goh', path.join(F, 'donor', 'goh'), '--game', path.join(F, 'donor', 'as2'), '--exe', 'mowas_2', '--entity', 'rep', '--donor', 'van', '--rep-key', '--no-ask', '--mod']]);
else t('donor fixture present (run donor.js first)', false);
const port = (side, name, args, extra = []) => {
  const cwd = path.join(W, side, 'cwd'); fs.mkdirSync(cwd, { recursive: true });
  const out = path.join(W, side, name, 'out');
  const r = cp.spawnSync(process.execPath, [tool, ...args, out, '--no-keylint', '--no-rc', '-q', ...extra], { encoding: 'utf8', env, cwd });
  return { out, r };
};
const tree = dir => {   // rel path -> Buffer
  const m = new Map();
  (function w(p, rel) { for (const e of fs.readdirSync(p, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : 1)) { const q = path.join(p, e.name), r = rel ? rel + '/' + e.name : e.name; if (e.isDirectory()) w(q, r); else m.set(r, fs.readFileSync(q)); } })(dir, '');
  return m;
};
const diff = (a, b) => {
  const bad = [];
  for (const k of new Set([...a.keys(), ...b.keys()])) if (!a.has(k) || !b.has(k)) bad.push((a.has(k) ? 'only A ' : 'only B ') + k); else if (!a.get(k).equals(b.get(k))) bad.push('bytes differ ' + k);
  return bad;
};
try {
  for (const [name, args] of RUNS) {
    const A = port('a', name, args), B = port('b', name, args);
    t(`${name}: both runs exit ${A.r.status}`, A.r.status === B.r.status && A.r.status !== null, A.r.stderr + B.r.stderr);
    const ta = tree(A.out), tb = tree(B.out), bad = diff(ta, tb);
    t(`${name}: ${ta.size} file(s), byte-equal across two folders and two cwds`, ta.size > 0 && !bad.length, bad.join('; '));
    t(`${name}: a gaps/*.gaps.json is among them`, [...ta.keys()].some(k => /^gaps\/[^/]+\.gaps\.json$/.test(k)), [...ta.keys()].join(' '));
    const txt = [...ta].filter(([k]) => !/\.(dds|ply|anm|vol|pak)$/.test(k)).map(([, b]) => b.toString('latin1')).join('\n');
    t(`${name}: no temp/out path or date text in any text file`, !txt.includes(W) && !txt.toLowerCase().includes(W.replace(/\\/g, '/').toLowerCase()) && !/\b20\d\d-\d\d-\d\dT\d\d:/.test(txt));
  }
  // seeded twin: a change in input must show (the compare is not blind)
  port('a', 'tw', RUNS[0][1]);
  const C = port('c', 'tw', ['--goh', path.join(F, 'goh'), '--entity', 'tank', '--mod']);
  t('seeded: a run with fewer inputs (no --keys) differs from the full one', diff(tree(path.join(W, 'a', 'tw', 'out')), tree(C.out)).length > 0);
} finally { fs.rmSync(W, { recursive: true, force: true }); }
console.log(fail ? 'gold: FAIL' : 'gold: all ok');
process.exit(fail ? 1 : 0);

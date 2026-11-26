// T-PORTGAP gap list tests. SEED: an invented unit with planted GoH keys that have no AS2 reader; each must show in its
// <out>/gaps/<unit>.gaps.json with a reason. Seeded twin: AS2-valid keys next to them must be kept and must not be listed.
// DIFF: for every fixture unit, (input key paths - output key paths - baked paths) must equal the listed paths (dropped + donor +
// unexplained), file by file, and nothing may be unexplained. The donor run is checked loosely (listed paths cover what went).
// Needs test/fixture from mkfixture.js (+ donor.js for the donor run). run via run.sh.
// Author: Imperator_Aug (ARSENAL, ia-4c8f5088)
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const G = require('../goh2as2.js');
const d = __dirname, F = path.join(d, 'fixture'), tool = path.join(d, '..', 'goh2as2.js');
let fail = 0;
const t = (name, good, extra) => { console.log((good ? 'ok   ' : 'FAIL ') + 'portgap: ' + name + (good || extra === undefined ? '' : '  ' + String(extra).slice(0, 600))); if (!good) fail++; };
const env = { ...process.env, AS2_NO_STEAM: '1', AS2_GAME: '' };
const W = fs.mkdtempSync(path.join(os.tmpdir(), 'portgap-'));
const crlf = s => s.replace(/\r?\n/g, '\r\n');
const port = (name, args) => {
  const out = path.join(W, 'o', name);
  const r = require('../../lib/test/wait').spawnSync(process.execPath, [tool, ...args, '--out', out, '--no-keylint', '--no-rc', '-q'], { encoding: 'utf8', env }, 'portgap');   // backstop 5 min, killed: once more
  return { out, r };
};
const gapsOf = out => { const g = path.join(out, 'gaps'); return fs.existsSync(g) ? fs.readdirSync(g).sort().map(f => JSON.parse(fs.readFileSync(path.join(g, f), 'utf8'))) : []; };
const mset = a => { const m = new Map(); for (const x of a) m.set(x, (m.get(x) || 0) + 1); return m; };
const minus = (a, b) => { const m = new Map(a); for (const [k, n] of b) if (m.has(k)) { const r = m.get(k) - n; if (r > 0) m.set(k, r); else m.delete(k); } return m; };
const show = m => [...m].map(([k, n]) => n > 1 ? k + 'x' + n : k).join(', ');

// DIFF over one run: idxs = input indexes (mod tree first, then --base); returns problems
function diffRun(out, idxs, loose) {
  const bad = []; let files = 0, units = 0;
  for (const j of gapsOf(out)) {
    units++;
    if (j.counts.unexplained) bad.push(`${j.unit}: ${j.counts.unexplained} unexplained`);
    for (const f of j.files) {
      const e = idxs.map(x => x.map.get(f)).find(Boolean); if (!e) continue;
      let inP; try { const b = G.readEnt(e); if (/^(EPLY|DDS |ANM\0|VOL\0|PK)/.test(b.subarray(0, 4).toString('latin1'))) continue; inP = G.keyPaths(G.decodeText(b).src); } catch { continue; }
      const of = path.join(out, 'resource', (j.moved || {})[f] || f);
      let outP = []; if (fs.existsSync(of)) { try { outP = G.keyPaths(fs.readFileSync(of).toString('latin1')); } catch { bad.push(`${j.unit}: ${f} output does not parse`); continue; } }
      const mine = j.gaps.filter(g => g.file === f);
      const baked = mset(mine.filter(g => g.kind === 'baked').flatMap(g => g.paths));
      const listed = mset(mine.filter(g => /^(dropped|donor|unexplained)$/.test(g.kind)).flatMap(g => g.paths));
      const gone = minus(minus(mset(inP), mset(outP)), baked);
      const miss = minus(gone, listed), extra = minus(listed, gone);
      files++;
      if (miss.size) bad.push(`${j.unit}: ${f} gone but not listed: ${show(miss)}`);
      if (!loose && extra.size) bad.push(`${j.unit}: ${f} listed but still there: ${show(extra)}`);
    }
  }
  return { bad, files, units };
}

try {
  // ---- SEED: invented unit, loose files
  const S = path.join(W, 'seed'), w = (rel, s) => { const p = path.join(S, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };
  w('goh/resource/entity/sd/seed.def', crlf(`{game_entity "seed"
  {perks {component {health {hp 100}}}}
  {armor_damage_modifier 2}
  {armor {setting {thickness 7}}}
  {mdl "seed.mdl"}
  {mat "seed.mtl"}
}
`));
  w('goh/resource/entity/sd/seed.ext', crlf(`{entity "seed"
  {volume "v1" {thickness {top 5}} {caststeel 1} {able {hole}}}
}
`));
  w('goh/resource/entity/sd/seed.mdl', crlf(`{model "seed"
  {sequence "run" {file "seed.anm"} {events {#1 {sound "x"}}}}
}
`));
  w('goh/resource/entity/sd/seed.anm', 'ANM\0');
  w('goh/resource/entity/sd/seed.mtl', crlf(`{material bump
  {diffuse "x"}
  {lightmap "l"}
}
`));
  w('goh/resource/properties/sd.inc', crlf('{props "x"}\n{TPC_ZClip 1}\n'));
  w('goh/resource/set/stuff/sd.weapon', crlf('{from "x"\n  {overmatchslope 1}\n  {firingtimeout 2}\n}\n'));
  w('goh/resource/set/stuff/sd.ammo', crlf('{bullet "b"\n  {possibledamageradius 3}\n}\n'));
  w('goh/resource/entity/fx/sd.def', crlf('{fx\n  {+ spriteview point\n    {spinx 1}\n  }\n}\n'));
  w('goh/resource/entity/sd.html', '<html></html>');
  w('keys.txt', 'properties/sd.inc\nset/stuff/sd.weapon\nset/stuff/sd.ammo\nentity/fx/sd.def\nentity/sd.html\n');
  const R = port('seed', ['--goh', path.join(S, 'goh'), '--entity', 'seed', '--keys', path.join(S, 'keys.txt'), '--no-game']);
  t('seed run exits 0', R.r.status === 0, R.r.stderr);
  const js = gapsOf(R.out), all = js.flatMap(j => j.gaps);
  t('seed: two unit files (seed, keys)', js.map(j => j.unit).join(',') === 'keys,seed', js.map(j => j.unit).join(','));
  const PLANT = [   // [file, key path, kind]
    ['entity/sd/seed.def', 'game_entity/perks/component/health/hp', 'dropped'],
    ['entity/sd/seed.def', 'game_entity/armor_damage_modifier', 'dropped'],
    ['entity/sd/seed.ext', 'entity/volume/caststeel', 'dropped'],
    ['entity/sd/seed.mdl', 'model/sequence/events', 'dropped'],
    ['entity/sd/seed.mtl', 'material/lightmap', 'dropped'],
    ['properties/sd.inc', 'tpc_zclip', 'dropped'],
    ['set/stuff/sd.weapon', 'from/overmatchslope', 'dropped'],
    ['set/stuff/sd.weapon', 'from/firingtimeout', 'dropped'],
    ['set/stuff/sd.ammo', 'bullet/possibledamageradius', 'dropped'],
    ['entity/fx/sd.def', 'fx/+/spinx', 'dropped'],
  ];
  for (const [f, k, kind] of PLANT) {
    const g = all.find(g => g.file === f && g.paths.includes(k));
    t(`seed: ${f} ${k} listed ${kind} with a reason`, g && g.kind === kind && g.reason && g.code, g ? JSON.stringify(g) : 'not listed');
  }
  const html = all.find(g => g.file === 'entity/sd.html');
  t('seed: unwritten file entity/sd.html listed as a whole-file drop', html && html.kind === 'dropped' && html.key === '*' && html.reason, JSON.stringify(html));
  const TWIN = [['entity/sd/seed.def', 'game_entity/armor/setting/thickness'], ['entity/sd/seed.ext', 'entity/volume/thickness/top'], ['entity/sd/seed.mdl', 'model/sequence/file'], ['entity/sd/seed.mtl', 'material/diffuse']];
  for (const [f, k] of TWIN) {
    const kept = G.keyPaths(fs.readFileSync(path.join(R.out, 'resource', f)).toString('latin1')).includes(k);
    t(`seeded twin: AS2-valid ${f} ${k} kept and not listed`, kept && !all.some(g => g.file === f && g.paths.includes(k)), kept ? 'listed' : 'not kept');
  }
  const sd = diffRun(R.out, [G.buildIndex(path.join(S, 'goh'))]);
  t(`diff seed: ${sd.files} text file(s) in ${sd.units} unit(s): input - output - baked = listed`, sd.files >= 8 && !sd.bad.length, sd.bad.join('\n'));
  // seeded defect for the diff check itself: drop one gap entry -> the diff must notice
  const gj = path.join(R.out, 'gaps', 'seed.gaps.json'), j0 = JSON.parse(fs.readFileSync(gj, 'utf8'));
  fs.writeFileSync(gj, JSON.stringify({ ...j0, gaps: j0.gaps.filter(g => g.code !== 'WARN_PORT_MTL_KEYS') }));
  const sd2 = diffRun(R.out, [G.buildIndex(path.join(S, 'goh'))]);
  t('seeded defect: a removed gap entry shows as "gone but not listed"', sd2.bad.some(b => /seed\.mtl gone but not listed: material\/lightmap/.test(b)), sd2.bad.join('\n'));

  // ---- DIFF on every fixture run
  const idx = p => G.buildIndex(path.join(F, p));
  const RUNS = [
    ['tank+keys', ['--goh', path.join(F, 'goh'), '--entity', 'tank', '--keys', path.join(F, 'keys.txt'), '--no-game'], [idx('goh')]],
    ['pcopy', ['--goh', path.join(F, 'goh'), '--entity', 'pcopy', '--game', path.join(F, 'as2')], [idx('goh')]],
    ['digitref', ['--goh', path.join(F, 'goh'), '--entity', 'digitref', '--no-game'], [idx('goh')]],
    ['bsunit', ['--goh', path.join(F, 'goh2'), '--base', path.join(F, 'base'), '--entity', 'bsunit', '--no-game'], [idx('goh2'), idx('base')]],
  ];
  if (fs.existsSync(path.join(F, 'donor', 'as2'))) RUNS.push(['donor', ['--goh', path.join(F, 'donor', 'goh'), '--game', path.join(F, 'donor', 'as2'), '--exe', 'mowas_2', '--entity', 'rep', '--donor', 'van', '--rep-key', '--no-ask'], [idx('donor/goh')], true]);
  else t('donor fixture present (run donor.js first)', false);
  for (const [name, args, idxs, loose] of RUNS) {
    const P = port(name, args);
    const r = diffRun(P.out, idxs, loose);
    t(`diff ${name}: exit ${P.r.status}, ${r.files} text file(s) in ${r.units} unit(s): input - output - baked ${loose ? 'within' : '='} listed, 0 unexplained`, P.r.status !== null && r.units > 0 && r.files > 0 && !r.bad.length, (r.bad.join('\n') || '') + P.r.stderr);
  }
} finally { fs.rmSync(W, { recursive: true, force: true }); }
console.log(fail ? `portgap FAIL ${fail}` : 'portgap PASS');
process.exit(fail ? 1 : 0);

// runs binhdr on the fixture; findings must equal truth.md exactly (file: CODE, with xN multiplicity)
// Author: Imperator_Aug (ARSENAL, ia-f483eb3c)
const fs = require('fs'), path = require('path'), assert = require('assert'), { execFileSync } = require('child_process');
const game = path.join(process.env.TEST_WORK || __dirname, 'fixture', 'game'), cli = path.join(__dirname, '..', 'binhdr.js');
const truth = {};
for (const l of fs.readFileSync(path.join(__dirname, 'truth.md'), 'utf8').split(/\r?\n/)) {
  const mm = /^(resource\/\S+): (\S+)(?: x(\d+))?/.exec(l);
  if (mm) truth[mm[1] + ': ' + mm[2]] = Number(mm[3] || 1);
}
const out = execFileSync('node', [cli, game, '--mods', 'm1', '--strict'], { encoding: 'utf8' }).split(/\r?\n/);
const got = {};
for (const l of out) {
  const mm = /^(resource\/\S+?)(?::\d+)?: (\S+) /.exec(l);
  if (mm) got[mm[1] + ': ' + mm[2]] = (got[mm[1] + ': ' + mm[2]] || 0) + 1;
}
const diff = [...new Set([...Object.keys(got), ...Object.keys(truth)])].filter(k => got[k] !== truth[k]).map(k => `${k}: got ${got[k] || 0} want ${truth[k] || 0}`);
assert.equal(diff.length, 0, 'mismatch: ' + diff.join(' | '));
assert.ok(out.includes(`${Object.values(truth).reduce((a, b) => a + b, 0)} findings`), 'count line');
// without --strict tolerated codes in mod files are info too
const lax = execFileSync('node', [cli, game, '--mods', 'm1'], { encoding: 'utf8' });
assert.ok(/^info: resource\/\S+: (DEF_VOLUME_NO_SHAPE|DDS_FORMAT|TEX_EXT_SHADOW|PLY_MTL_MISSING|WARN_)/m.test(lax), 'mod tolerated → info');
// FMT-03 severity: reached = counted finding, unreached = info only (without --strict)
assert.ok(/^resource\/ent\/reach\/reach_missing\.ply: PLY_MTL_MISSING/m.test(lax), 'reached missing mtl is an ERROR');
assert.ok(/^info: resource\/a\/ply_mtl_missing\.ply: PLY_MTL_MISSING/m.test(lax), 'unreached missing mtl is info');
assert.ok(!/^resource\/a\/ply_mtl_missing\.ply: PLY_MTL_MISSING/m.test(lax), 'unreached missing mtl not counted');
assert.ok(+lax.match(/(\d+) findings/)[1] < Object.values(truth).reduce((a, b) => a + b, 0), 'fewer findings without --strict');
// vanilla layer: tolerated codes become info
const van = execFileSync('node', [cli, game], { encoding: 'utf8' });
assert.ok(/info: resource\/vanilla\/tolerated\.dds: DDS_FORMAT/.test(van), 'base-layer DDS_FORMAT is info');
assert.ok(/info: resource\/vanilla\/tolerated2\.dds: TEX_EXT_SHADOW/.test(van), 'base-layer shadow is info');
assert.ok(/\n0 findings/.test('\n' + van), 'vanilla fixture 0 findings');
// --paks: same files packed into 2 paks (nested dir), no vfs; non-tolerated truth findings must all reappear
const os = require('os'), { zip } = require('../../lib/zipwrite');
const mres = path.join(game, 'mods', 'm1', 'resource'), pd = fs.mkdtempSync(path.join(os.tmpdir(), 'binhdr-paks-'));
try {
  const all = [];
  (function walk(d, rel) { for (const f of fs.readdirSync(d, { withFileTypes: true })) f.isDirectory() ? walk(path.join(d, f.name), rel + f.name + '/') : all.push(['resource/' + rel + f.name, fs.readFileSync(path.join(d, f.name))]); })(mres, '');
  fs.mkdirSync(path.join(pd, 'sub'));
  fs.writeFileSync(path.join(pd, 'a.pak'), zip(all.filter((x, i) => i % 2 === 0)));
  fs.writeFileSync(path.join(pd, 'sub', 'b.pak'), zip(all.filter((x, i) => i % 2 === 1)));
  const SOFTC = /^(DEF_VOLUME_NO_SHAPE|MDL_VOLUME_BONE|DDS_FORMAT|DDS_VOLUME|TEX_EXT_SHADOW|WARN_EBM_MIPMAP|WARN_SOUND_MP3|PLY_MTL_MISSING|WARN_ANM_BONE_MISSING)$/;
  const pk = execFileSync('node', [cli, '--paks', pd], { encoding: 'utf8' });
  const gotP = {};
  for (const l of pk.split(/\r?\n/)) { const mm = /^(resource\/\S+?)(?::\d+)?: (\S+) /.exec(l); if (mm) gotP[mm[1] + ': ' + mm[2]] = 1; }
  const miss = Object.keys(truth).filter(k => !SOFTC.test(k.split(': ')[1]) && !/: NET_(SIZE|CELL)$/.test(k) && !gotP[k]);
  assert.equal(miss.length, 0, '--paks missing: ' + miss.join(' | '));
  assert.ok(/info: resource\/\S+: DDS_FORMAT/.test(pk), '--paks tolerated → info');
  const cnt = s => +s.match(/(\d+) findings/)[1];
  const s1 = execFileSync('node', [cli, '--paks', pd, '--sample', '1'], { encoding: 'utf8' });
  assert.ok(cnt(s1) > 0 && cnt(s1) < cnt(pk), '--sample 1 checks fewer files');
  assert.equal(s1, execFileSync('node', [cli, '--paks', pd, '--sample', '1'], { encoding: 'utf8' }), '--sample deterministic');
  const sv = execFileSync('node', [cli, game, '--mods', 'm1', '--strict', '--sample', '1'], { encoding: 'utf8' });
  assert.ok(cnt(sv) > 0 && cnt(sv) < Object.values(truth).reduce((a, b) => a + b, 0), '--sample in vfs mode');
} finally { fs.rmSync(pd, { recursive: true, force: true }); }

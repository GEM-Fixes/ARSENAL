// header cache (hdrcache.js): a run with the cache (cold, then warm) prints what --no-hdr-cache / ARSENAL_HDR_CACHE=0 prints,
// on the fixture (mod, vanilla, --all, --folder, --paks, a mod holding a pak, json), and again after each edit of a scratch copy:
// same-size .dds rewrite, a .mdl a .def reads, an .anm a .mdl reads, a deleted .mtl a .ply names, a new shadowing .tga, the
// reach set (.def deleted, .mdl edited), a rebuilt pak; the warm run replays (STATS), a file written just now is not stored
// Author: Imperator_Aug (ARSENAL, ia-8d17a8c2)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert'), cp = require('child_process');
const cli = path.join(__dirname, '..', 'binhdr.js'), { zip } = require('../../lib/zipwrite');
const src = path.join(process.env.TEST_WORK || __dirname, 'fixture', 'game');
const W = fs.mkdtempSync(path.join(process.env.TEST_WORK || os.tmpdir(), 'binhdr-cache-')), game = path.join(W, 'game'), cache = path.join(W, 'cache');
fs.cpSync(src, game, { recursive: true });
const mres = path.join(game, 'mods', 'm1', 'resource');
let clock = Date.now() - 3600e3;
const age = p => { const t = new Date(clock += 1000); fs.utimesSync(p, t, t); };   // every file older than the racy window, each edit a new time
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else age(p); } })(game);
const allFiles = () => { const out = []; (function walk(d, rel) { for (const f of fs.readdirSync(d, { withFileTypes: true })) f.isDirectory() ? walk(path.join(d, f.name), rel + f.name + '/') : out.push(['resource/' + rel + f.name, fs.readFileSync(path.join(d, f.name))]); })(mres, ''); return out; };
const mkM2 = () => {   // mod m2: the m1 files in one pak
  const d = path.join(game, 'mods', 'm2', 'resource');
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(game, 'mods', 'm2', 'mod.info'), fs.readFileSync(path.join(game, 'mods', 'm1', 'mod.info')));
  fs.writeFileSync(path.join(d, 'all.pak'), zip(allFiles().map(([n, b]) => [n.slice('resource/'.length), b])));
  age(path.join(d, 'all.pak')); age(path.join(game, 'mods', 'm2', 'mod.info'));
};
const pd = path.join(W, 'paks'), mkPaks = () => { fs.mkdirSync(pd, { recursive: true }); fs.writeFileSync(path.join(pd, 'a.pak'), zip(allFiles())); age(path.join(pd, 'a.pak')); };
mkM2(); mkPaks();
const run = (a, env = {}) => { const r = cp.spawnSync(process.execPath, [cli, ...a, '--no-rc'], { encoding: 'utf8', env: { ...process.env, ARSENAL_CACHE: cache, ...env } }); assert.ok(r.status === 0 || r.status === 1, r.stderr); return r.stdout; };
const stats = (a, env) => { const m = /header cache: (\d+) replayed, (\d+) read, (\d+) stored/.exec(run([...a, '--time'], env)); assert.ok(m, 'STATS line'); return { hit: +m[1], read: +m[2], stored: +m[3] }; };
const SETS = [[game, '--mods', 'm1', '--strict'], [game, '--mods', 'm1'], [game], [game, '--mods', 'm1', '--all'], ['-', '--folder', path.join(game, 'mods', 'm1')],
  ['--paks', pd], [game, '--mods', 'm2', '--strict'], [game, '--mods', 'm1', '--format', 'json']];
// every set: off == cold == warm == --no-hdr-cache
const same = (tag, full) => {
  const outs = SETS.map(a => run(a, { ARSENAL_HDR_CACHE: '0' }));
  SETS.forEach((a, i) => {
    assert.equal(run(a), outs[i], `${tag}: cache run 1 = off (${a.join(' ')})`);
    assert.equal(run(a), outs[i], `${tag}: cache run 2 = off (${a.join(' ')})`);
    if (full) assert.equal(run([...a, '--no-hdr-cache']), outs[i], `${tag}: --no-hdr-cache = off`);
  });
  return outs[0];
};
try {
  const base = same('fixture', true);
  const s = stats(SETS[0]);
  assert.ok(s.hit > 40 && s.read === 0, 'warm run replays every file: ' + JSON.stringify(s));
  const c0 = stats(SETS[0], { ARSENAL_CACHE: path.join(W, 'cold') });
  assert.ok(c0.hit === 0 && c0.read > 40 && c0.stored > 40, 'cold run: every file read and stored: ' + JSON.stringify(c0));
  assert.ok(/header cache: off/.test(run([...SETS[0], '--time'], { ARSENAL_HDR_CACHE: '0' })), 'off: STATS says off');
  const edit = (rel, fn) => { const p = path.join(mres, rel); fn(p); if (fs.existsSync(p)) age(p); mkM2(); mkPaks(); };
  const steps = [
    ['same-size .dds rewrite', () => edit('tex/good.dds', p => fs.writeFileSync(p, fs.readFileSync(path.join(mres, 'tex', 'dds_format.dds')))), /good\.dds: DDS_FORMAT/],
    ['.mdl read by a .def', () => edit('ent/vol/vol.mdl', p => fs.writeFileSync(p, fs.readFileSync(p, 'latin1').replace('Volume "ok"', 'Volume "ko"'), 'latin1')), /vol\.def:\d+: DEF_VOLUME_NO_SHAPE \{Volume "ok"\}/],
    ['.anm read by a .mdl', () => edit('ent/seq/none.anm', p => fs.writeFileSync(p, fs.readFileSync(path.join(mres, 'ent', 'seq', 'walk.anm')))), null],
    ['deleted .mtl named by a .ply', () => edit('a/good.mtl', p => fs.rmSync(p)), /a\/good\.ply: PLY_MTL_MISSING/],
    ['new shadowing .tga', () => edit('tex/good32.tga', p => fs.writeFileSync(p, fs.readFileSync(path.join(mres, 'tex', 'shadow.tga')))), /good32\.dds: TEX_EXT_SHADOW/],
    ['reach .mdl edited', () => edit('ent/reach/reach.mdl', p => fs.writeFileSync(p, fs.readFileSync(p, 'latin1').replace('reach_missing.ply', 'reach_elsewhere.ply'), 'latin1')), /reach_missing\.ply: PLY_MTL_MISSING .*no enabled/],
    ['reach .def deleted', () => { edit('ent/reach/reach.mdl', p => fs.writeFileSync(p, fs.readFileSync(p, 'latin1').replace('reach_elsewhere.ply', 'reach_missing.ply'), 'latin1')); edit('ent/reach/reach.def', p => fs.rmSync(p)); }, null],
  ];
  let prev = base;
  for (const [tag, fn, want] of steps) {
    fn();
    const now = same(tag);
    assert.notEqual(now, prev, `${tag}: the edit changes the report (else the step proves nothing)`);
    if (want) assert.ok(want.test(now), `${tag}: ${want}`);
    const st = stats(SETS[0]);
    assert.ok(st.read === 0 && st.hit > 40, `${tag}: replayed after the edit run: ${JSON.stringify(st)}`);
    prev = now;
  }
  // a new game dir with the mod linked in (tools/check's overlay, a new temp dir per run): the same files, replayed
  const ov = path.join(W, 'ov');
  fs.mkdirSync(path.join(ov, 'mods'), { recursive: true });
  fs.symlinkSync(path.join(game, 'mods', 'm1'), path.join(ov, 'mods', 'm1'), 'junction');
  fs.symlinkSync(path.join(game, 'resource'), path.join(ov, 'resource'), 'junction');
  const oa = [ov, '--mods', 'm1', '--strict'];
  assert.equal(run(oa), run(oa, { ARSENAL_HDR_CACHE: '0' }), 'linked game dir: same report');
  const so = stats(oa);
  assert.ok(so.read === 0 && so.hit > 40, 'linked game dir: replayed from the real paths: ' + JSON.stringify(so));
  // racy: a file written just now is read again next time (a 2 s mtime file system could hide a second edit)
  fs.writeFileSync(path.join(mres, 'tex', 'good.dds'), fs.readFileSync(path.join(mres, 'tex', 'good32.dds')));
  const o1 = run(SETS[0], { ARSENAL_HDR_CACHE: '0' });
  assert.equal(run(SETS[0]), o1, 'racy file: same report');
  const r = stats(SETS[0]);
  assert.ok(r.read === 1, 'racy file not stored, read again: ' + JSON.stringify(r));
  // a damaged cache file is ignored
  for (const f of fs.readdirSync(path.join(cache, 'binhdr'))) fs.writeFileSync(path.join(cache, 'binhdr', f), '{not json');
  assert.equal(run(SETS[0]), o1, 'damaged cache: same report');
  console.log('cache PASS');
} finally { fs.rmSync(W, { recursive: true, force: true }); }

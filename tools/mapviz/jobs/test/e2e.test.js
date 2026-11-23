// jobs end-to-end test: `mapviz jobs run maps`, `jobs run doc` and `jobs run topo` on the fixture install (fxmake.js)
// through the real entry, a second run answered from the cache, and the cache command. Parts not built yet are skipped
// with a line that says so; then the test checks the not-built answer (exit 4) instead. A real MoW:AS2 install found
// through tools/lib/gamedir.js resolve() runs too: maps, doc and topo of multi/1v1_road, then topo again from the cache
// (read only; the cache goes to this test's scratch dir). Skipped with one line when absent or MAPVIZ_NO_GAME=1.
// Seeded defects: an unknown job name, a corrupt manifest in the cache (the entry is made again), a map key with '..'.
// usage: node tools/mapviz/jobs/test/e2e.test.js [scratch dir]
// Author: Imperator_Aug (ARSENAL, ia-7b9ad829)
'use strict';
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const h = require('./harness')('jobs-e2e');
const mv = require('../../mapviz');
const fxmake = require('../../test/fxmake');
const tiles = require('../tiles');
const { W, ok, eq } = h;

const MVJS = path.resolve(__dirname, '..', '..', 'mapviz.js');
const ENV = Object.assign({}, process.env, { ARSENAL_CACHE: process.env.ARSENAL_CACHE });
const run = (args, ms) => {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [MVJS].concat(args), { encoding: 'utf8', windowsHide: true, timeout: ms || 600000, env: ENV });
  r.ms = Date.now() - t0;
  try { r.json = JSON.parse(r.stdout.trim().split('\n').pop()); } catch (e) { r.json = null; }
  return r;
};
const built = part => mv.partState(mv.findPart(part)) === 'built';
// the MoW:AS2 install found through lib/gamedir resolve() (README 9.4), or null; read only, never written
function realAs2() {
  try {
    const r = require('../../../lib/gamedir').resolve({});
    return r && r.dir && fs.existsSync(path.join(r.dir, 'resource', 'map.pak')) ? r.dir : null;
  } catch (e) { return null; }
}

(async () => {
  const fx = fxmake.make(path.join(W, 'fx'), { form: 'as2' });
  const common = ['--target', fx.target, '--game', fx.gameDir].concat(...fx.modDirs.map(d => ['--mod-dir', d]));
  const withMap = common.concat(['--map', fx.map]);

  // ---- always: the command surface ----
  {
    const l = run(['jobs', 'list-what', '--json'], 30000);
    ok(l.status === 0 && l.json && ['maps', 'doc', 'topo', 'c0'].every(k => JSON.stringify(l.json).includes('"' + k + '"')), 'jobs list-what --json lists the job table');
    const u = run(['jobs', 'run', 'nosuch'].concat(common), 30000);
    ok(u.status === 2, 'seeded defect: jobs run of an unknown job -> exit 2 (' + u.status + ' ' + u.stderr.trim() + ')');
    const d = run(['jobs', 'run', 'doc'].concat(common, ['--map', 'multi/../x']), 30000);
    ok(d.status === 2, 'seeded defect: a map key with .. -> exit 2 (' + d.status + ')');
    const c = run(['jobs', 'cache', '--json'], 30000);
    ok(c.status === 0 && c.json && c.json.v === 1 && c.json.root === path.join(process.env.ARSENAL_CACHE, 'mapviz'), 'jobs cache --json answers stats under ARSENAL_CACHE');
  }

  // ---- maps and doc (mapkit) ----
  if (built('mapkit')) {
    const a = run(['jobs', 'run', 'maps'].concat(common, ['--json']));
    ok(a.status === 0 && a.json && a.json.cached === false && fs.existsSync(path.join(a.json.dir, 'maps.json')), 'jobs run maps on the fixture: maps.json made (' + a.status + ' ' + a.stderr.trim() + ')');
    h.note('jobs run maps (fixture, cold): ' + a.ms + ' ms');
    if (a.json) {
      const maps = JSON.parse(fs.readFileSync(path.join(a.json.dir, 'maps.json'), 'utf8'));
      ok(JSON.stringify(maps).includes(fx.map), 'maps.json names the fixture map ' + fx.map);
      const b = run(['jobs', 'run', 'maps'].concat(common, ['--json']));
      ok(b.status === 0 && b.json && b.json.cached === true && b.json.key === a.json.key, 'a second run is answered from the cache, same key');
      h.note('jobs run maps (fixture, cached): ' + b.ms + ' ms');
      // seeded defect: a corrupt manifest -> the entry is not fresh and is made again
      fs.writeFileSync(path.join(a.json.dir, 'manifest.json'), '{"v":1,');
      const c = run(['jobs', 'run', 'maps'].concat(common, ['--json']));
      ok(c.status === 0 && c.json && c.json.cached === false && JSON.parse(fs.readFileSync(path.join(c.json.dir, 'manifest.json'), 'utf8')).complete === true, 'seeded defect: a corrupt manifest -> made again (' + c.status + ')');
    }
    const d = run(['jobs', 'run', 'doc'].concat(withMap, ['--json']));
    ok(d.status === 0 && d.json && fs.existsSync(path.join(d.json.dir, 'mapdoc.json')), 'jobs run doc on the fixture: mapdoc.json made (' + d.status + ' ' + d.stderr.trim() + ')');
    h.note('jobs run doc (fixture, cold): ' + d.ms + ' ms');
    const n = run(['jobs', 'run', 'doc'].concat(common, ['--map', 'multi/no_such_map', '--json']));
    ok(n.status === 3, 'jobs run doc of a map that is not there -> exit 3 (' + n.status + ')');
  } else {
    h.skip('jobs run maps and jobs run doc on the fixture: lib/mapkit is not built (no cli.js); checked the not-built answer instead');
    const a = run(['jobs', 'run', 'maps'].concat(common, ['--json']), 60000);
    ok(a.status === 4 && /mapkit/.test(a.stderr), 'jobs run maps without mapkit -> exit 4 MV_NOT_BUILT (' + a.status + ' ' + a.stderr.trim() + ')');
    const d = run(['jobs', 'run', 'doc'].concat(withMap, ['--json']), 60000);
    ok(d.status === 4, 'jobs run doc without mapkit -> exit 4 (' + d.status + ')');
  }

  // ---- topo (raster, needs grids from mapkit, then the tiles step) ----
  if (built('mapkit') && built('raster') && tiles.rasterCutTile()) {
    const t = run(['jobs', 'run', 'topo'].concat(withMap, ['--json']));
    ok(t.status === 0 && t.json && fs.existsSync(path.join(t.json.dir, 'pic.topo.mvg')) && fs.existsSync(path.join(t.json.dir, 'tiles', 'topo', '0', '0_0.png')), 'jobs run topo on the fixture: pic.topo.mvg and tiles/topo (' + t.status + ' ' + t.stderr.trim().slice(0, 300) + ')');
    h.note('jobs run topo (fixture, cold, with grids and tiles): ' + t.ms + ' ms');
    if (t.json) {
      const m = JSON.parse(fs.readFileSync(path.join(t.json.dir, 'manifest.json'), 'utf8'));
      ok(m.deps && m.deps.length >= 1, 'the topo manifest names its grids dependency');
      const again = run(['jobs', 'run', 'topo'].concat(withMap, ['--json']));
      ok(again.status === 0 && again.json && again.json.cached === true, 'topo again: from the cache');
    }
  } else {
    h.skip('jobs run topo on the fixture: ' + (!built('mapkit') ? 'lib/mapkit is not built (grids)' : !built('raster') ? 'lib/raster is not built' : 'raster has no cutTile') + '; checked the not-built answer instead');
    const t = run(['jobs', 'run', 'topo'].concat(withMap, ['--json']), 60000);
    ok(t.status === 4, 'jobs run topo with a part missing -> exit 4 (' + t.status + ' ' + t.stderr.trim() + ')');
  }

  // ---- a real MoW:AS2 install, read only (README 9.4: found through lib/gamedir resolve(), MAPVIZ_NO_GAME=1 skips) ----
  const G = process.env.MAPVIZ_NO_GAME === '1' ? null : realAs2();
  if (process.env.MAPVIZ_NO_GAME === '1') h.skip('a real install: MAPVIZ_NO_GAME=1');
  else if (!G) h.skip('a real install: no MoW:AS2 install found');
  else if (!built('mapkit')) h.skip('a real install: lib/mapkit is not built');
  else {
    const real = ['--target', 'mowas2', '--game', G], RMAP = 'multi/1v1_road';
    const r = run(['jobs', 'run', 'maps'].concat(real, ['--json']));
    ok(r.status === 0 && r.json && fs.existsSync(path.join(r.json.dir, 'maps.json')), 'jobs run maps on the real install (' + r.status + ' ' + r.stderr.trim().slice(0, 300) + ')');
    h.note('jobs run maps (real install, cold): ' + r.ms + ' ms');
    const has = r.json && JSON.stringify(JSON.parse(fs.readFileSync(path.join(r.json.dir, 'maps.json'), 'utf8'))).includes('"' + RMAP + '"');
    if (!has) h.skip('a real install: ' + RMAP + ' is not in maps.json; doc and topo not run');
    else {
      const d = run(['jobs', 'run', 'doc'].concat(real, ['--map', RMAP, '--json']));
      ok(d.status === 0 && d.json && fs.existsSync(path.join(d.json.dir, 'mapdoc.json')), 'jobs run doc on the real ' + RMAP + ' (' + d.status + ' ' + d.stderr.trim().slice(0, 300) + ')');
      h.note('jobs run doc (real ' + RMAP + ', cold): ' + d.ms + ' ms');
      if (built('raster') && tiles.rasterCutTile()) {
        const t = run(['jobs', 'run', 'topo'].concat(real, ['--map', RMAP, '--json']));
        ok(t.status === 0 && t.json && t.json.cached === false && fs.existsSync(path.join(t.json.dir, 'pic.topo.mvg')) && fs.existsSync(path.join(t.json.dir, 'tiles', 'topo', '0', '0_0.png')), 'jobs run topo on the real ' + RMAP + ': pic.topo.mvg and tiles/topo (' + t.status + ' ' + t.stderr.trim().slice(0, 300) + ')');
        h.note('jobs run topo (real ' + RMAP + ', cold, with grids and tiles): ' + t.ms + ' ms');
        const again = run(['jobs', 'run', 'topo'].concat(real, ['--map', RMAP, '--json']));
        ok(again.status === 0 && again.json && again.json.cached === true && t.json && again.json.key === t.json.key, 'topo on the real ' + RMAP + ' again: from the cache, same key (' + again.status + ')');
        h.note('jobs run topo (real ' + RMAP + ', cached): ' + again.ms + ' ms');
      } else h.skip('jobs run topo on the real install: lib/raster is not built or has no cutTile');
    }
  }
  let locks = [];
  try { locks = fs.readdirSync(path.join(process.env.ARSENAL_CACHE, 'mapviz', 'locks')); } catch (e) { /* no locks folder: none taken */ }
  eq(locks, [], 'no lock left behind');
  h.end();
})().catch(e => { console.log('FAIL mapviz jobs-e2e: ' + (e && e.stack || e)); process.exit(1); });

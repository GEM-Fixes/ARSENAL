// paint staff real-install test (MV-PNT1 part b): the Staff map of one real multiplayer map per installed game
// (MoW:AS2 and AS64 multi/1v1_road, GoH multi/1v1_balzerweg), in process through the shared paint picture() (gather,
// draw, masks, sidecar), the path previews and export take. Checks
// sane numbers: size, alpha, height range, contours, water from the water masks, roads, buildings, tree stamps, the
// off-ground share; prints the stats and the time, and writes a PNG to look at (north up: the PNG is flipped so its top
// row is the max world y). Skipped per game when the install is absent; MAPVIZ_NO_GAME=1 skips everything.
// Without a scratch dir the test makes one under the temp folder and deletes it on PASS; MAPVIZ_STAFF_KEEP=1 keeps it.
//   MAPVIZ_STAFF_SIZE=<px> (default 1024)
// usage: node tools/mapviz/paint/staff/test/real.test.js [scratch dir]
// Author: Imperator_Aug (ARSENAL, ia-a8394eb6)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');

const MV = path.resolve(__dirname, '../../..');
const SIZE = Number(process.env.MAPVIZ_STAFF_SIZE) || 1024;
let pass = 0, fail = 0;
function ok(c, what) { if (c) pass++; else { fail++; console.log('FAIL mapviz paint/staff real: ' + what); } }

function installs() {
  if (process.env.MAPVIZ_NO_GAME === '1') return {};
  const gd = require(path.resolve(MV, '../lib/gamedir'));
  const out = {};
  let as2 = null;
  try { const r = gd.resolve({}); as2 = r && r.dir && fs.existsSync(path.join(r.dir, 'resource', 'map.pak')) ? r.dir : null; } catch (e) { as2 = null; }
  let goh = null;
  try { const g = gd.goh(); goh = g && fs.existsSync(path.join(g, 'resource', 'map', 'multi.pak')) ? g : null; } catch (e) { goh = null; }
  if (as2) { out.mowas2 = as2; out.as64 = as2; }
  if (goh) out.goh = goh;
  return out;
}

const MAPS = { mowas2: 'multi/1v1_road', as64: 'multi/1v1_road', goh: 'multi/1v1_balzerweg' };
const have = installs();
const targets = Object.keys(MAPS).filter(t => have[t]);
if (!targets.length) {
  console.log('skip: ' + (process.env.MAPVIZ_NO_GAME === '1' ? 'MAPVIZ_NO_GAME=1' : 'no MoW:AS2 / AS64 / GoH install found'));
  console.log('PASS mapviz paint/staff real (0, skipped)');
  process.exit(0);
}
for (const t of Object.keys(MAPS)) if (!have[t]) console.log('skip ' + t + ': no install');

const OWN = !process.argv[2] && process.env.MAPVIZ_STAFF_KEEP !== '1';
const WD = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'mapviz-paint-staff-real-')));
fs.mkdirSync(WD, { recursive: true });
{
  const c = process.env.ARSENAL_CACHE;
  process.env.ARSENAL_CACHE = c && path.resolve(c).startsWith(WD + path.sep) ? c : path.join(WD, 'cache');
}

const st = require('../index');
const P = require(path.join(MV, 'paint', 'index.js'));
const png = require(path.join(MV, 'lib/raster/png'));

function northUp(g) {
  const rgba = new Uint8ClampedArray(g.w * g.h * 4), row = g.w * 4;
  for (let j = 0; j < g.h; j++) rgba.set(g.data.subarray(j * row, (j + 1) * row), (g.h - 1 - j) * row);
  return { w: g.w, h: g.h, rgba };
}

(async () => {
  for (const t of targets) {
    const key = MAPS[t];
    const t0 = Date.now();
    let grid, stats, gaps, notes, sidecar;
    try {
      const r = await P.picture({ style: 'staff', target: t, game: have[t], map: key, size: SIZE, in: [], marks: 'none' });
      grid = r.grid; sidecar = r.sidecar; stats = sidecar.stats; gaps = sidecar.gaps; notes = sidecar.notes;
    } catch (e) { ok(false, t + ' ' + key + ': ' + (e.code || '') + ' ' + (e.stack || e.message)); continue; }
    const s = (Date.now() - t0) / 1000;
    const n = grid.w * grid.h;
    ok(Math.max(grid.w, grid.h) === SIZE && grid.etype === 'rgba8', t + ' ' + key + ': picture ' + grid.w + 'x' + grid.h);
    { let a = true; for (let k = 3; k < grid.data.length; k += 4) if (grid.data[k] !== 255) { a = false; break; } ok(a, t + ': alpha 255 everywhere'); }
    ok(stats && stats.heightMax > stats.heightMin, t + ': height range ' + (stats && stats.heightMin) + '..' + (stats && stats.heightMax) + ' u');
    ok(stats.contourLines > 10 && stats.interval > 0, t + ': contours ' + stats.contourLines + ' at ' + stats.interval + ' m');
    ok(stats.waterFrom === 'water' && !gaps.includes('PAINT_NO_WATER_MASKS'), t + ': water from the water masks (gaps ' + JSON.stringify(gaps) + ')');
    const roads = stats.roadPx.road + stats.roadPx.country + stats.roadPx.decal;
    ok(roads > n * 0.002 && roads < n * 0.5, t + ': road pixels ' + roads + ' of ' + n + ' ' + JSON.stringify(stats.roadPx));
    ok(stats.buildings > 0 || stats.walls > 0, t + ': buildings ' + stats.buildings + ', walls ' + stats.walls);
    ok(stats.treeStamps > 0 && stats.woodPx > 0, t + ': tree stamps ' + stats.treeStamps + ', wood ' + stats.woodPx + ' px');
    ok(stats.offGroundPx < n * 0.5 && stats.noHeightPx === 0, t + ': off-ground ' + stats.offGroundPx + ' px, no-height ' + stats.noHeightPx);
    ok(sidecar.style === 'staff' && sidecar.styleVersion === st.VERSION && sidecar.target === t, t + ': sidecar style, styleVersion, target');
    const file = path.join(WD, t + '-staff.png');
    fs.writeFileSync(file, png.encode(northUp(grid)));
    console.log(t + ' ' + key + ' staff ' + grid.w + 'x' + grid.h + ': ' + s.toFixed(1) + ' s, gaps ' + JSON.stringify(gaps) +
      ', notes ' + JSON.stringify((notes || []).map(x => x.code)) + '\n  stats ' + JSON.stringify(stats) + '\n  look: ' + file);
  }
  if (fail) { console.log(fail + ' failed, ' + pass + ' passed (pictures kept in ' + WD + ')'); process.exit(1); }
  if (OWN) { try { fs.rmSync(WD, { recursive: true, force: true }); } catch (e) { /* temp */ } console.log('scratch folder deleted (MAPVIZ_STAFF_KEEP=1 keeps it)'); }
  console.log('PASS mapviz paint/staff real (' + pass + ')');
})().catch(e => { console.log('FAIL mapviz paint/staff real: ' + (e && e.stack || e)); process.exit(1); });

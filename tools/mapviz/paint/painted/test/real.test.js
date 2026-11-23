// paint/painted real-install test (MV-PNT2 part b): the Painted relief style on one real multiplayer map of each game
// (MoW:AS2 and AS64 multi/1v1_road, GoH multi/1v1_balzerweg), in process, from the shared paint gather (draft 4.1: grids,
// shade, water masks and entcat objects made in process). Pictures are not pinned; the checks are sizes, alpha, gaps and
// sane counts. Skipped per game when the install is absent; MAPVIZ_NO_GAME=1 skips everything (no folder is made).
// Installs are read through vfs only. Without a scratch dir the test makes one under the temp folder and deletes it on
// PASS; MAPVIZ_PAINT_KEEP=1 keeps it with a PNG per game to look at. A scratch dir given on the command line is kept.
//   MAPVIZ_PAINT_SIZE=<px> (default 1024)
// usage: node tools/mapviz/paint/painted/test/real.test.js [scratch dir]
// Author: Imperator_Aug (ARSENAL, ia-8c854365)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), { spawnSync } = require('child_process');

const MV = path.join(__dirname, '../../..');
const SIZE = Number(process.env.MAPVIZ_PAINT_SIZE) || 1024;
let pass = 0, fail = 0;
function ok(c, what) { if (c) pass++; else { fail++; console.log('FAIL mapviz paint/painted real: ' + what); } }

function installs() {
  if (process.env.MAPVIZ_NO_GAME === '1') return {};
  const gd = require(path.join(MV, '../lib/gamedir'));
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
  console.log('PASS mapviz paint/painted real (0, skipped)');
  process.exit(0);
}
for (const t of Object.keys(MAPS)) if (!have[t]) console.log('skip ' + t + ': no install');

const OWN = !process.argv[2] && process.env.MAPVIZ_PAINT_KEEP !== '1';
const W = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'mapviz-painted-real-')));
fs.mkdirSync(W, { recursive: true });
{
  const c = process.env.ARSENAL_CACHE;
  process.env.ARSENAL_CACHE = c && path.resolve(c).startsWith(W + path.sep) ? c : path.join(W, 'cache');
}

const P = require('../index');
const PAINT = require('../../index');

async function main() {
  const res = {};
  for (const t of targets) {
    const key = MAPS[t];
    const t0 = Date.now();
    let inp;
    try { inp = await PAINT.gather({ style: 'painted', target: t, game: have[t], map: key, size: SIZE, seed: 1, in: [] }); }
    catch (e) { ok(false, t + ' ' + key + ': shared gather failed: ' + (e && (e.code || '') + ' ' + e.message)); continue; }
    const tg = (Date.now() - t0) / 1000;
    const F = inp.frame;
    const long = Math.max(F.W, F.H);
    const opts = { thumb: long <= 512, minStroke: long <= 512 ? 2 : 1, maxSymbols: long <= 512 ? 5 : null, contours: long > 512, seed: 1, tick: () => {}, pool: 0, workDir: null };
    const t1 = Date.now();
    let r;
    try { r = await P.draw(inp, opts); } catch (e) { ok(false, t + ' ' + key + ': draw threw ' + (e && (e.code || '') + ' ' + e.message)); continue; }
    const td = (Date.now() - t1) / 1000;
    const g = r.grid, s = r.stats, N = g.w * g.h;
    res[t] = r;
    console.log(t + ' ' + key + ' ' + g.w + 'x' + g.h + ' mode ' + inp.mode + ': gather ' +tg.toFixed(1) + ' s, draw ' + td.toFixed(1) + ' s; gaps ' + JSON.stringify(r.gaps) +
      ', notes ' + JSON.stringify(r.notes.map(n => n.code)) + ', stats ' + JSON.stringify(s));
    ok(long === SIZE && g.w === F.W && g.h === F.H && g.etype === 'rgba8' && g.name === 'pic.painted', t + ': picture ' + g.w + 'x' + g.h + ' on the frame, long side ' + SIZE);
    let a255 = true, sum = 0;
    const cols = new Set();
    for (let k = 0; k < N * 4; k += 4) {
      if (g.data[k + 3] !== 255) a255 = false;
      sum += g.data[k] + g.data[k + 1] + g.data[k + 2];
      if (k % 64 === 0) cols.add((g.data[k] << 16) | (g.data[k + 1] << 8) | g.data[k + 2]);
    }
    const mean = sum / (3 * N);
    ok(a255, t + ': alpha 255 everywhere');
    ok(mean > 50 && mean < 230, t + ': mean level ' + mean.toFixed(1) + ' (not black, not white)');
    ok(cols.size > 30, t + ': ' + cols.size + ' distinct colours in a sample (the relief and land cover show)');
    ok(s.kuwaharaR === P.radiusFor(long) && s.sectors === 8 && s.levels === 6, t + ': radius ' + s.kuwaharaR + ', 8 sectors, 6 levels');
    ok(s.offGroundPx < 0.5 * N, t + ': off-ground pixels ' + s.offGroundPx + ' under half the picture');
    ok(s.roadPx > 0, t + ': roads drawn (' + s.roadPx + ' px)');
    ok(!r.gaps.includes('PAINT_NO_OBJECTS') ? s.buildings > 0 || s.woodPx > 0 : true, t + ': objects present give buildings or wood (' + s.buildings + ' buildings, ' + s.woodPx + ' wood px)');
    ok(r.gaps.every(c => /^PAINT_/.test(c)) && r.approx === r.gaps.includes('PAINT_NO_WATER_MASKS'), t + ': gaps are PAINT_* codes, approx follows PAINT_NO_WATER_MASKS');
    if (!OWN) {
      const gf = require(path.join(MV, 'lib/raster/gridfile'));
      const mvg = path.join(W, t + '-painted.mvg'), png = path.join(W, t + '-painted.png');
      gf.write(mvg, g);
      const p = spawnSync(process.execPath, [path.join(MV, 'mapviz.js'), 'raster', 'png', mvg, '--out', png], { encoding: 'utf8' });
      ok(p.status === 0 && fs.existsSync(png), t + ': raster png exit ' + p.status);
      console.log('  look: ' + png);
    }
  }
  if (res.mowas2 && res.as64) {
    ok(Buffer.compare(Buffer.from(res.mowas2.grid.data), Buffer.from(res.as64.grid.data)) === 0, 'mowas2 and as64 on the same install and map give the same picture');
  }
}

main().catch(e => ok(false, 'threw: ' + (e && e.stack || e))).then(() => {
  if (fail) { console.log(fail + ' failed, ' + pass + ' passed (scratch kept in ' + W + ')'); process.exit(1); }
  if (OWN) { try { fs.rmSync(W, { recursive: true, force: true }); } catch (e) { /* temp */ } }
  console.log('PASS mapviz paint/painted real (' + pass + ')');
});

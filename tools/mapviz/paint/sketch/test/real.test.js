// sketch real-install test (MV-PNT3): the Field sketch on one real multiplayer map of each game (MoW:AS2 and AS64
// multi/1v1_road, GoH multi/1v1_balzerweg), full pass and thumbnail. Through the shared paint picture() when it is there
// (gather + draw + mask hatches + sidecar), else through the test's own input builder (fxinput.js) and the style alone.
// Checks exits, sizes, alpha, sane stats (hachures, roads, trees or forest, buildings, water as the map has it) and the
// same picture for as64 and mowas2 on the same install. Writes PNGs (north up) to look at; prints times.
// Skipped per game when the install is absent; MAPVIZ_NO_GAME=1 skips everything. Installs are read through mapkit (vfs).
// Without a scratch dir the test makes one under the temp folder and deletes it on PASS; MAPVIZ_SKETCH_KEEP=1 keeps it.
//   MAPVIZ_SKETCH_SIZE=<px> (default 1024)
// usage: node tools/mapviz/paint/sketch/test/real.test.js [scratch dir]
// Author: Imperator_Aug (ARSENAL, ia-daeab142)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');

const SIZE = Number(process.env.MAPVIZ_SKETCH_SIZE) || 1024;
let pass = 0, fail = 0;
function ok(c, what) { if (c) pass++; else { fail++; console.log('FAIL mapviz sketch real: ' + what); } }

function installs() {
  if (process.env.MAPVIZ_NO_GAME === '1') return {};
  const gd = require('../../../../lib/gamedir');
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
  console.log('PASS mapviz sketch real (0, skipped)');
  process.exit(0);
}
for (const t of Object.keys(MAPS)) if (!have[t]) console.log('skip ' + t + ': no install');

const OWN = !process.argv[2] && process.env.MAPVIZ_SKETCH_KEEP !== '1';
const W = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'mapviz-sketch-real-')));
fs.mkdirSync(W, { recursive: true });
{
  const c = process.env.ARSENAL_CACHE;
  process.env.ARSENAL_CACHE = c && path.resolve(c).startsWith(W + path.sep) ? c : path.join(W, 'cache');
}

const ROOT = path.resolve(__dirname, '../../..');
const SK = require('..');
const FX = require('./fxinput');
const png = require(path.join(ROOT, 'lib/raster/png'));
let shared = null;
try { const m = require(path.join(ROOT, 'paint')); if (typeof m.picture === 'function') shared = m; } catch (e) { console.log('note: shared paint index does not load (' + e.message + '); the style runs alone'); }
if (!shared) console.log('note: shared paint picture() not there; input from fxinput.js, style alone');

const sha1 = g => crypto.createHash('sha1').update(Buffer.from(g.data.buffer, g.data.byteOffset, g.data.byteLength)).digest('hex');
function flip(g) {
  const o = new Uint8ClampedArray(g.data.length), r = g.w * 4;
  for (let j = 0; j < g.h; j++) o.set(g.data.subarray(j * r, (j + 1) * r), (g.h - 1 - j) * r);
  return { w: g.w, h: g.h, rgba: o };
}

async function one(t, size) {
  const key = MAPS[t];
  const K = require(path.join(ROOT, 'lib/mapkit'));
  const src = K.source({ target: t, game: have[t] });
  const doc = K.doc(src, key, {});
  const mode = doc.modes && doc.modes.length ? doc.modes[0].id : null;
  const t0 = Date.now();
  let grid, stats, gaps, how;
  if (shared) {
    const r = await shared.picture({ style: 'sketch', target: t, game: have[t], map: key, mode, size, in: [], marks: 'none' });
    grid = r.grid; stats = r.sidecar.stats || {}; gaps = r.sidecar.gaps || []; how = 'picture()';
    ok(r.sidecar.style === 'sketch' && r.sidecar.styleVersion === SK.VERSION && r.sidecar.target === t, t + ' ' + size + ' sidecar style, version, target');
  } else {
    const inp = FX.build({ src, doc, mode, size });
    const r = SK.draw(inp, FX.optsFor(inp));
    grid = r.grid; stats = r.stats; gaps = r.gaps; how = 'style alone';
  }
  const s = (Date.now() - t0) / 1000;
  ok(Math.max(grid.w, grid.h) === size && grid.etype === 'rgba8', t + ' ' + key + ' ' + size + ': ' + grid.w + 'x' + grid.h);
  let a = true;
  for (let k = 3; k < grid.data.length; k += 4) if (grid.data[k] !== 255) { a = false; break; }
  ok(a, t + ' ' + size + ': alpha 255 everywhere');
  // a thumbnail draws hachures only from slope class 3 up: a flat map may have none
  ok(stats.thumb ? Number.isInteger(stats.hachures) : stats.hachures > 50, t + ' ' + size + ': hachures ' + stats.hachures);
  ok(stats.roadPx > 0, t + ' ' + size + ': road smudge ' + stats.roadPx + ' px');
  ok(stats.trees + stats.forestStamps > 0 && stats.treeStamps > 0, t + ' ' + size + ': trees ' + stats.trees + ', stamps ' + stats.treeStamps + ', forest ' + stats.forestStamps);
  ok(stats.buildings > 0, t + ' ' + size + ': buildings ' + stats.buildings);
  ok(stats.thumb === (size <= 512), t + ' ' + size + ': thumb ' + stats.thumb);
  if (stats.thumb) ok(stats.treeStamps <= stats.trees, t + ' thumb: stamps per cluster (' + stats.treeStamps + ' of ' + stats.trees + ' trees)');
  else ok(stats.treeStamps === stats.trees, t + ' full: one stamp per tree (' + stats.treeStamps + ' of ' + stats.trees + ')');
  ok(!gaps.includes('PAINT_NO_OBJECTS') && !gaps.includes('PAINT_NO_LANDFORM'), t + ' ' + size + ': gaps ' + JSON.stringify(gaps));
  // GoH: the airborne class (depthM -0.75) must not make all water drown; shallow band-1 water stays no-prone [V data,
  // surveys/water.md:95; in game: fix row]
  if (t === 'goh' && stats.water && stats.water.swim > 0) {
    ok(stats.water.noProne > 0 && stats.water.drown < stats.water.swim, t + ' ' + size + ': water no-prone, swim, drown apart: ' + JSON.stringify(stats.water));
  }
  const file = path.join(W, t + '-sketch-' + size + '.png');
  fs.writeFileSync(file, png.encode(flip(grid)));
  console.log(t + ' ' + key + ' sketch ' + grid.w + 'x' + grid.h + ' (' + how + ', mode ' + mode + '): ' + s.toFixed(1) + ' s, gaps ' + JSON.stringify(gaps) +
    ', stats ' + JSON.stringify({ hachures: stats.hachures, step: stats.hachureStep, trees: stats.trees, stamps: stats.treeStamps, forest: stats.forestStamps,
      buildings: stats.buildings, roadPx: stats.roadPx, water: stats.water, crests: stats.crests, crestM: stats.crestM }));
  console.log('  look: ' + file);
  return sha1(grid);
}

(async () => {
  const h = {};
  for (const t of targets) {
    try {
      h[t] = await one(t, SIZE);
      await one(t, 512);
    } catch (e) { ok(false, t + ': ' + (e && (e.code ? e.code + ' ' : '') + (e.stack || e.message || e))); }
  }
  if (h.as64 && h.mowas2) ok(h.as64 === h.mowas2, 'as64 and mowas2 on one install give the same picture');
})().catch(e => ok(false, 'run: ' + (e && e.stack || e))).then(() => {
  if (fail) { console.log(fail + ' failed, ' + pass + ' passed (pictures kept in ' + W + ')'); console.log('FAIL mapviz sketch real: ' + fail + ' checks'); process.exit(1); }
  if (OWN) { try { fs.rmSync(W, { recursive: true, force: true }); } catch (e) { /* temp */ } console.log('scratch folder deleted (MAPVIZ_SKETCH_KEEP=1 keeps it)'); }
  console.log('PASS mapviz sketch real (' + pass + ')');
});

// paint real-install test (MV-PNT1): per installed game, `mapviz paint draw --style staff` and `paint marks` on one real
// multiplayer map (MoW:AS2 and AS64 multi/1v1_road, GoH multi/1v1_balzerweg), then `raster png` of the picture. The
// checks are exits, sizes, the sidecar fields, the masks counts and the marks drawn; pictures are not pinned (game data
// may change). Prints times and the PNG paths (look at them: north up, roads, water, flags where the minimap has them).
// Skipped per game when the install is absent; MAPVIZ_NO_GAME=1 skips everything (no folder is made). Installs are read
// only. Without a scratch dir the test makes one under the temp folder and deletes it on PASS; MAPVIZ_PAINT_KEEP=1 keeps
// it. A scratch dir given on the command line is always kept.
//   MAPVIZ_PAINT_SIZE=<px> (default 512)   MAPVIZ_PAINT_STYLE=<id> (default staff)
// usage: node tools/mapviz/paint/test/real.test.js [scratch dir]
// Author: Imperator_Aug (ARSENAL, ia-19109daf)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), { spawnSync } = require('child_process');

const MVJS = path.resolve(__dirname, '../../mapviz.js');
const SIZE = Number(process.env.MAPVIZ_PAINT_SIZE) || 512;
const STYLE = process.env.MAPVIZ_PAINT_STYLE || 'staff';
let pass = 0, fail = 0;
function ok(c, what) { if (c) pass++; else { fail++; console.log('FAIL mapviz paint: ' + what); } }

function installs() {
  if (process.env.MAPVIZ_NO_GAME === '1') return {};
  const gd = require('../../../lib/gamedir');
  const out = {};
  let as2 = null;
  try { const r = gd.resolve({}); as2 = r && r.dir && fs.existsSync(path.join(r.dir, 'resource', 'map.pak')) ? r.dir : null; } catch (e) { as2 = null; }
  let goh = null;
  try { const g = gd.goh(); goh = g && fs.existsSync(path.join(g, 'resource', 'map', 'multi.pak')) ? g : null; } catch (e) { goh = null; }
  if (as2) { out.mowas2 = as2; out.as64 = as2; }
  if (goh) out.goh = goh;
  return out;
}

function cli(args) {
  const t = Date.now();
  const r = spawnSync(process.execPath, [MVJS].concat(args), { encoding: 'utf8', env: Object.assign({}, process.env), timeout: 900000 });
  return { code: r.status, out: r.stdout || '', err: (r.stderr || '').trim(), s: (Date.now() - t) / 1000 };
}
const json = s => { try { return JSON.parse(s); } catch (e) { return null; } };

const MAPS = { mowas2: 'multi/1v1_road', as64: 'multi/1v1_road', goh: 'multi/1v1_balzerweg' };

const have = installs();
const targets = Object.keys(MAPS).filter(t => have[t]);
if (!targets.length) {
  console.log('skip: ' + (process.env.MAPVIZ_NO_GAME === '1' ? 'MAPVIZ_NO_GAME=1' : 'no MoW:AS2 / AS64 / GoH install found'));
  console.log('PASS mapviz paint real (0, skipped)');
  process.exit(0);
}
for (const t of Object.keys(MAPS)) if (!have[t]) console.log('skip ' + t + ': no install');

const OWN = !process.argv[2] && process.env.MAPVIZ_PAINT_KEEP !== '1';
const W = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'mapviz-paint-real-')));
fs.mkdirSync(W, { recursive: true });
{
  const c = process.env.ARSENAL_CACHE;
  process.env.ARSENAL_CACHE = c && path.resolve(c).startsWith(W + path.sep) ? c : path.join(W, 'cache');
}

for (const t of targets) {
  const map = MAPS[t];
  const base = ['--target', t, '--game', have[t], '--map', map];
  const out = path.join(W, t);
  // the doc gives the modes; take the first one with flags (battle_zones on all three)
  const r = cli(['paint', 'draw', '--style', STYLE].concat(base, ['--size', String(SIZE), '--marks', 'full', '--out', out, '--json']));
  const j = json(r.out);
  ok((r.code === 0 || r.code === 1) && j, t + ' paint draw ' + STYLE + ' exit ' + r.code + ' ' + r.err.slice(0, 300));
  if (!j) continue;
  console.log(t + ' ' + map + ' ' + STYLE + ': ' + j.w + ' x ' + j.h + ', ' + r.s.toFixed(1) + ' s, gaps ' + (j.gaps.join(' ') || 'none'));
  ok(Math.max(j.w, j.h) === SIZE, t + ' long side = size');
  const sc = json(fs.readFileSync(path.join(out, 'pic.' + STYLE + '.json'), 'utf8'));
  ok(sc && sc.style === STYLE && sc.target === t && sc.rowOrder === 'minY-first' && sc.paint === 1 && Number.isInteger(sc.styleVersion), t + ' sidecar fields');
  ok(sc && sc.counts.outsidePather >= 0 && sc.counts.outsidePather < sc.w * sc.h, t + ' outsidePather ' + (sc && sc.counts.outsidePather));
  ok(sc && sc.inputs && sc.inputs.height, t + ' height gathered (' + (sc && JSON.stringify(sc.inputs)) + ')');
  ok(sc && sc.marks && sc.marks.drawn.north === 1, t + ' marks drawn ' + (sc && JSON.stringify(sc.marks && sc.marks.drawn)));
  const g = require('../../lib/raster/gridfile').read(path.join(out, 'pic.' + STYLE + '.mvg'));
  let opaque = 0;
  for (let k = 3; k < g.data.length; k += 4) if (g.data[k] === 255) opaque++;
  ok(opaque === g.w * g.h, t + ' picture opaque');
  const png = path.join(out, 'pic.' + STYLE + '.png');
  const p = cli(['raster', 'png', path.join(out, 'pic.' + STYLE + '.mvg'), '--out', png]);
  ok(p.code === 0 && fs.existsSync(png), t + ' raster png exit ' + p.code + ' ' + p.err.slice(0, 200));
  console.log('  ' + png);
  // marks alone, battle_zones
  const om = path.join(W, t + '-marks');
  const m = cli(['paint', 'marks'].concat(base, ['--mode', 'battle_zones', '--size', String(SIZE), '--out', om, '--json']));
  const jm = json(m.out);
  ok(m.code === 0 && jm && jm.drawn.flags > 0 && jm.drawn.spawns > 0, t + ' paint marks battle_zones: ' + (jm ? JSON.stringify(jm.drawn) : m.err.slice(0, 300)));
  if (jm) console.log('  marks ' + JSON.stringify(jm.drawn) + ', ' + m.s.toFixed(1) + ' s');
}

if (fail) { console.log('FAIL mapviz paint real: ' + fail + ' failed, ' + pass + ' passed (scratch kept: ' + W + ')'); process.exit(1); }
if (OWN) fs.rmSync(W, { recursive: true, force: true });
console.log('PASS mapviz paint real (' + pass + ')');

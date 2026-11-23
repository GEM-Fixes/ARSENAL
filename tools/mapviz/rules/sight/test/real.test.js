// sight real-install test (MV-SIG): per installed game, in process, on one multiplayer map (MoW:AS2 and AS64
// multi/1v1_road, GoH multi/1v1_balzerweg): the vision profile from the stack, the sight grid and fire grids from entcat
// placeSolids, a viewshed at the map centre and a pair. Numbers are not pinned (data may change); the checks are frames,
// ranges, counts and code sets. AS64 and MoW:AS2 read the same install and must give the same bytes.
// Skipped per game when the install is absent; MAPVIZ_NO_GAME=1 skips everything (no folder is made). Installs are read
// through vfs only. Without a scratch dir the test makes one under the temp folder and deletes it at the end.
// usage: node tools/mapviz/rules/sight/test/real.test.js [scratch dir]     Last line: PASS mapviz sight real (N).
// Author: Imperator_Aug (ARSENAL, ia-b94f91b2)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');

let pass = 0, fail = 0;
function ok(c, what) { if (c) pass++; else { fail++; console.log('FAIL mapviz sight real: ' + what); } }

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
  console.log('PASS mapviz sight real (0, skipped)');
  process.exit(0);
}
for (const t of Object.keys(MAPS)) if (!have[t]) console.log('skip ' + t + ': no install');

const OWN = !process.argv[2];
const W = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'mapviz-sight-real-')));
fs.mkdirSync(W, { recursive: true });
if (!process.env.ARSENAL_CACHE) process.env.ARSENAL_CACHE = path.join(W, 'cache');

const K = require('../../../lib/mapkit');
const E = require('../../../entcat');
const S = require('..');
const CLI = require('../cli');
const sha = g => crypto.createHash('sha1').update(Buffer.from(g.data.buffer, g.data.byteOffset, g.data.byteLength)).digest('hex');
const hashes = {};

for (const t of targets) {
  const t0 = Date.now();
  const key = MAPS[t], game = S.gameOf(t);
  const src = K.source({ target: t, game: have[t] });
  const doc = K.doc(src, key, {});
  const grids = K.grids(src, key, {});
  const L = E.loaderFor(src);
  const d = E.docForMode(doc, null);
  const links = E.linksFor(src, key, d, {});
  const placed = E.placeSolids(d, E.forDoc(src, d, { loader: L, links }), L, grids, { links });
  const prof = S.profile(src);
  ok(prof.source === 'stack' && prof.game === game, t + ': profile from the stack');
  ok(game === 'as2' ? prof.viewers.inf.radiusM === 52.5 && S.rangeM(prof, 'tank', 'tank') === 135 && prof.viewers.binocular.reachM === 180
    : prof.viewers.inf.radiusM === 100 && prof.viewers.binocular.reachM === 200, t + ': ranges ' + prof.viewers.inf.radiusM + ' m');
  const r = S.grid(doc, grids, placed, { target: t });
  const C = S.CELL[game];
  ok(r.grid.w === Math.ceil(doc.net.w * doc.net.cell / C) && r.grid.h === Math.ceil(doc.net.h * doc.net.cell / C), t + ': sight frame ' + r.grid.w + ' x ' + r.grid.h);
  const m = r.grid.meta;
  ok(m.hMaxU - m.hMinU >= 300 && near(m.stepU, (m.hMaxU - m.hMinU) / 256), t + ': levels ' + m.hMinU + '..' + m.hMaxU);
  ok(r.counts.objects > 100 && r.counts.entered > 50 && r.counts.hard > 100 && r.counts.soft > 100, t + ': counts ' + JSON.stringify(r.counts));
  ok(r.counts.skipped === 0, t + ': no placed def skipped (entcat VERSION 2: GoH fire_loop is service), skipped ' + r.counts.skipped);
  ok(game === 'as2' ? r.counts.thin >= 0 : r.counts.thin === 0, t + ': thin stamps ' + r.counts.thin);
  const fg = S.fireGrid(doc, grids, placed, {});
  let fcells = 0;
  for (let k = 0; k < fg.top.data.length; k++) if (fg.top.data[k] !== -32768) { fcells++; if (fg.top.data[k] < fg.bottom.data[k]) { ok(false, t + ': fire top under bottom'); break; } }
  ok(fcells > 100 && fg.top.w === doc.net.w, t + ': fire cells ' + fcells);
  const at = S.snap(r.grid, 0, 0);
  const v = S.viewshed(r, fg, { x: at[0], y: at[1] }, { pose: 'stand', viewer: 'inf', vprof: prof, placed });
  const cnt = [0, 0, 0, 0];
  for (const c of v.view.data) cnt[c]++;
  ok(cnt[1] > 1000 && cnt[0] > 0 && cnt[0] + cnt[1] + cnt[2] + cnt[3] === v.view.data.length, t + ': view counts ' + cnt.join(','));
  const fc = [0, 0, 0, 0, 0];
  for (const c of v.fire.data) fc[c]++;
  ok(fc[1] > 100 && fc.reduce((a, b) => a + b) === v.fire.data.length, t + ': fire counts ' + fc.join(','));
  const seen = v.rings.filter(x => x.kind === 'seen');
  ok(seen.length > 0 && seen.length <= 500 && seen.every(x => x.p >= 0 && x.p <= 1), t + ': seen items ' + seen.length);
  // own cells suspended: an object is not hidden by itself (as built 2026-11-14: mowas2 95 of 192, goh 150 of 500;
  // without the suspend goh had 87 of 500)
  const seenSome = seen.filter(x => x.p > 0).length;
  ok(seenSome * 5 > seen.length, t + ': seen items with p > 0: ' + seenSome + ' of ' + seen.length);
  ok(v.view.meta.offGround >= 0 && r.counts.offGround === r.grid.meta.offGround, t + ': offGround ' + r.counts.offGround);
  const p = CLI.pair(r, fg, grids, prof, [at[0], at[1]], [at[0] + 200, at[1]], {});
  ok(typeof p.see === 'boolean' && p.distM === 10 && (p.visibleHeightM === null || p.visibleHeightM > -1), t + ': pair ' + JSON.stringify(p));
  hashes[t] = [r.grid, r.ground, r.field, fg.top, fg.bottom, v.view, v.vis, v.fire].map(sha).join(',');
  console.log(t + ' ' + key + ': ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s; frame ' + r.grid.w + ' x ' + r.grid.h + ', counts ' + JSON.stringify(r.counts) +
    '; view at ' + at.join(',') + ' seen/hidden/partly ' + cnt[1] + '/' + cnt[2] + '/' + cnt[3] + '; seen items ' + seen.length + ' (p > 0: ' + seenSome + ')');
  if (typeof E.release === 'function') E.release(L);
}
function near(a, b) { return Math.abs(a - b) < 1e-6; }
if (hashes.mowas2 && hashes.as64) ok(hashes.mowas2 === hashes.as64, 'as64 = mowas2 byte for byte on 1v1_road');

if (OWN) fs.rmSync(W, { recursive: true, force: true });
if (fail) { console.log('FAIL mapviz sight real: ' + fail + ' failed'); process.exit(1); }
console.log('PASS mapviz sight real (' + pass + ')');

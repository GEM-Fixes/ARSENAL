// render pack + l3 real-install test (MV-R2, builder R2b): per installed game, the scene pack and pic.l3 of one real
// multiplayer map (MoW:AS2 and AS64 multi/1v1_road, GoH multi/1v1_balzerweg), in process, on a flat synthetic pic.l2
// (synthobj.js; l3.z ground from the map's height grid) at 1024 px. Numbers are not pinned (game data may change); the
// checks are sane counts: instances, failed defs, textures read, object pixels, kinds, the pack round trip, and the GoH
// lightmaps. Prints times and counts. Skipped per game when the install is absent; MAPVIZ_NO_GAME=1 skips everything.
// Without a scratch dir the test makes one under the temp folder and deletes it on PASS.
//   MAPVIZ_RENDER_SIZE=<px> (default 1024)
// usage: node tools/mapviz/render/test/l3real.test.js [scratch dir]
// Author: Imperator_Aug (ARSENAL, ia-03f3abe2)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');

const SIZE = Number(process.env.MAPVIZ_RENDER_SIZE) || 1024;
let pass = 0, fail = 0;
function ok(c, what) { if (c) pass++; else { fail++; console.log('FAIL mapviz render l3real: ' + what); } }

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

const MAPS = { mowas2: 'multi/1v1_road', as64: 'multi/1v1_road', goh: 'multi/1v1_balzerweg' };
const have = installs();
const targets = Object.keys(MAPS).filter(t => have[t]);
if (!targets.length) {
  console.log('skip: ' + (process.env.MAPVIZ_NO_GAME === '1' ? 'MAPVIZ_NO_GAME=1' : 'no MoW:AS2 / AS64 / GoH install found'));
  console.log('PASS mapviz render l3real (0, skipped)');
  process.exit(0);
}
for (const t of Object.keys(MAPS)) if (!have[t]) console.log('skip ' + t + ': no install');

const OWN = !process.argv[2];
const W = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'mapviz-l3real-')));
fs.mkdirSync(W, { recursive: true });
{
  const c = process.env.ARSENAL_CACHE;
  process.env.ARSENAL_CACHE = c && path.resolve(c).startsWith(W + path.sep) ? c : path.join(W, 'cache');
}

async function main() {
  const mk = require('../../lib/mapkit'), P = require('../pack'), L3 = require('../l3'), S = require('./synthobj');
  for (const t of targets) {
    const key = MAPS[t];
    let t0 = Date.now();
    const src = mk.source({ target: t, game: have[t] });
    const doc = mk.doc(src, key, {});
    const grids = mk.grids(src, key, {});
    const tDoc = Date.now() - t0; t0 = Date.now();
    const pr = P.pack(src, doc, { grids });
    const j = pr.json, c = j.counts, tPack = Date.now() - t0;
    console.log(t + ' ' + key + ': doc ' + tDoc + ' ms, pack ' + tPack + ' ms, ' + JSON.stringify(c) + ', textures ' + j.textures.length + ', materials ' + j.materials.length +
      ', bin ' + j.bin.bytes + ' bytes, gaps ' + j.gaps.join(' '));
    ok(c.instances > 100 && c.drawn > 100 && c.verts > 1000 && c.tris > 1000, t + ': pack holds objects ' + JSON.stringify(c));
    ok(c.failed <= Math.max(2, c.defs * 0.1), t + ': failed defs ' + c.failed + ' of ' + c.defs);
    ok(c.skipped.decal > 0, t + ': decal defs are left to l2');
    ok(j.textures.length > 10 && j.textures.every(x => x.size && x.size[0] > 0), t + ': textures with sizes');
    const tm = j.textures.filter(x => x.from === 'texmod' || x.from === 'common').length;
    if (t !== 'goh') ok(tm > 0, t + ': some TexMod variants found (' + tm + ')');
    else console.log('goh texmod/common textures ' + tm);
    const lm = j.materials.filter(m => m.lm !== null).length;
    if (t === 'goh') ok(lm > 0, 'goh: materials with a lightmap ' + lm); else ok(lm === 0, t + ': no lightmap slot');
    const dir = path.join(W, t + '-pack');
    P.write(dir, pr);
    const back = P.readPack(dir);
    ok(back.inst.count === c.instances && back.from === 'in', t + ': pack round trip');
    t0 = Date.now();
    const base = S.flatBase(doc, SIZE, { height: grids.height });
    const r = await L3.l3(src, doc, { size: SIZE, base, pack: back });
    const sc = r.sidecar;
    console.log(t + ' l3: ' + (Date.now() - t0) + ' ms, ' + JSON.stringify(r.stats) + ', objects ' + JSON.stringify(sc.objects) + ', gaps ' + sc.gaps.join(' '));
    ok(Math.max(sc.w, sc.h) === SIZE && sc.target === t && sc.pack.from === 'in' && sc.brightness === (t === 'goh' ? 'unverified' : 'fitted'), t + ': sidecar');
    ok(sc.textures.read > 10 && sc.textures.missing <= sc.textures.read * 0.1, t + ': textures decoded ' + JSON.stringify(sc.textures));
    const kinds = new Array(7).fill(0);
    for (let k = 0; k < r.aux.n.data.length; k += 4) kinds[r.aux.n.data[k + 3]]++;
    const px = r.grid.w * r.grid.h, obj = kinds[4] + kinds[5];
    console.log(t + ' kinds ' + kinds.join(' '));
    ok(obj > px * 0.005 && obj < px * 0.8, t + ': object pixels ' + obj + ' of ' + px);
    let above = 0, below = 0;
    for (let k = 0; k < px; k++) {
      const kd = r.aux.n.data[k * 4 + 3];
      if (kd < 4) continue;
      if (r.aux.z.data[k] >= base.aux.z.data[k] - 2) above++; else below++;
    }
    ok(below === 0 && above === obj, t + ': object z is not below the ground - 2 (' + below + ' below)');
  }
}

main().then(() => {
  if (OWN && !fail) { try { fs.rmSync(W, { recursive: true, force: true }); } catch (e) { /* temp */ } }
  if (fail) { console.log('FAIL mapviz render l3real: ' + fail + ' of ' + (pass + fail) + ' checks'); process.exit(1); }
  console.log('PASS mapviz render l3real (' + pass + ')');
}, e => { console.log('FAIL mapviz render l3real: ' + (e && e.stack || e)); process.exit(1); });

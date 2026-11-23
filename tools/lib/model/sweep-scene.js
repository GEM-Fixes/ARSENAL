// sweep-scene: build the scene (tools/lib/model/scene.js) of vanilla models read in place (loose + paks) and check it.
//   node tools/lib/model/sweep-scene.js <gameDir> [--sample N] [--kind vehicle|all] [--json] [--exe as64|mowas_2|mowas2|goh]
//   (--exe: the game's file view, sweepargs.js; goh with no <gameDir> = the GoH install)
// per model: mdl parses; every volume's bone exists; each polyhedron volume's world AABB overlaps the world AABB of the
// mesh(es) on the same bone (overlap / miss / no mesh on that bone counted: a high miss rate = wrong placement rule);
// the mesh-only world bounds agree with tools/unitbox mdlBox (L W H in metres) within 1 cm or 1 percent.
// --kind vehicle (default) = .mdl keys under /vehicle/ or /-vehicle/ (vanilla: resource/entity/-vehicle); all = every .mdl.
// Prints `<total> models, <ok> ok, <bad> with problems`, the counts and the first 10 problems. Exit 1 on any problem.
// Author: Imperator_Aug (ARSENAL, ia-569c30b2)
'use strict';
const path = require('path');
const vfs = require('../vfs'), names = require('../names'), mdl = require('./mdl'), scene = require('./scene');

function main(argv) {
  const X = require('./sweepargs').cli(argv.slice(2)), a = X.args, opt = { sample: 0, kind: 'vehicle', game: null, json: false };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--sample') opt.sample = +a[++i];
    else if (a[i] === '--kind') opt.kind = a[++i];
    else if (a[i] === '--json') opt.json = true;
    else if (!opt.game) opt.game = a[i];
  }
  opt.game = require('./sweepargs').gameFor(opt.game, X.exe, () => require('../gamedir').resolve().dir);
  if (!opt.game) { console.error('usage: node tools/lib/model/sweep-scene.js <gameDir> [--sample N] [--kind vehicle|all]'); process.exit(2); }
  const t0 = Date.now();
  const v = vfs.build(require('./sweepargs').vfsOpts({ gameDir: opt.game, mods: [] }, X.exe));
  let unitbox = null;
  try { unitbox = require('../../unitbox/unitbox'); } catch (e) { unitbox = null; }
  const read = k => { const r = v.files.get(k); if (!r || r.deleted) return null; try { return vfs.readRec(r); } catch (e) { return null; } };
  const side = { read, has: k => v.files.has(k) };
  let keys = [...v.files.keys()].filter(k => k.endsWith('.mdl') && (opt.kind === 'all' || k.includes('/' + opt.kind + '/') || k.includes('/-' + opt.kind + '/'))).sort();
  if (opt.sample > 0 && opt.sample < keys.length) { const step = keys.length / opt.sample, l = []; for (let i = 0; i < opt.sample; i++) l.push(keys[Math.floor(i * step)]); keys = l; }

  const st = { total: 0, ok: 0, bad: 0, volumes: 0, orphan: 0, poly: 0, overlap: 0, miss: 0, noMesh: 0, noVol: 0, meshes: 0, meshMissing: 0,
    boxSame: 0, boxDiff: 0, boxGap: 0, boxNone: 0 };
  const problems = [];
  const overlaps = (p, q) => [0, 1, 2].every(c => p.min[c] <= q.max[c] + 1e-3 && q.min[c] <= p.max[c] + 1e-3);
  for (const key of keys) {
    st.total++;
    const buf = read(key);
    const bad = [];
    if (!buf) { st.bad++; problems.push(key + ': unreadable'); continue; }
    const m = mdl.parse(buf);
    if (m.error) bad.push('mdl: ' + m.error);
    const dir = key.slice(0, key.lastIndexOf('/') + 1);
    const files = { get: n => read(path.posix.normalize(names.resolve(n, dir).key)) };
    let sc;
    try { sc = scene.build(m, files); } catch (e) { st.bad++; problems.push(key + ': build threw ' + (e.stack || e.message).split('\n').slice(0, 2).join(' ')); continue; }
    st.meshes += sc.meshes.length; st.meshMissing += sc.meshes.filter(x => !x.ply).length;
    for (const vo of sc.volumes) {
      st.volumes++;
      if (vo.boneIndex < 0) { st.orphan++; bad.push('volume ' + vo.id + ' bone missing'); continue; }
      if (vo.kind !== 'polyhedron') continue;
      st.poly++;
      if (!vo.worldBounds) { st.noVol++; continue; }
      const ms = sc.meshes.filter(x => x.boneIndex === vo.boneIndex && x.localBounds);
      if (!ms.length) { st.noMesh++; continue; }
      const hit = ms.some(x => overlaps(vo.worldBounds, scene.aabb(x.world, x.localBounds.slice(0, 3), x.localBounds.slice(3, 6))));
      if (hit) st.overlap++; else { st.miss++; bad.push('polyhedron ' + vo.id + ' misses its bone mesh'); }
    }
    if (unitbox && sc.meshBounds) {
      const ub = unitbox.mdlBox(side, key);
      if (!ub.box) st.boxNone++;
      else {
        const mine = [0, 1, 2].map(c => (sc.meshBounds.max[c] - sc.meshBounds.min[c]) / 20);
        const same = mine.every((x, c) => Math.abs(x - ub.box[c]) <= Math.max(0.01, 0.01 * ub.box[c]));
        // unitbox reads only {View} inside {LODView}; the engine also takes {VolumeView} there
        if (same) st.boxSame++; else if (/\{\s*LODView\s*\{\s*VolumeView/i.test(buf.toString('latin1'))) st.boxGap++; else { st.boxDiff++; bad.push('size ' + mine.map(x => x.toFixed(3)).join('x') + ' m vs unitbox ' + ub.box.join('x')); }
      }
    }
    if (bad.length) { st.bad++; problems.push(key + ': ' + bad.slice(0, 3).join('; ') + (bad.length > 3 ? ' (+' + (bad.length - 3) + ')' : '')); } else st.ok++;
  }
  vfs.closeRecs && vfs.closeRecs();
  const rate = st.overlap + st.miss ? (100 * st.overlap / (st.overlap + st.miss)).toFixed(1) : '-';
  if (opt.json) console.log(JSON.stringify({ st, rate, problems: problems.slice(0, 50) }, null, 1));
  console.log(`${st.total} models, ${st.ok} ok, ${st.bad} with problems (${Date.now() - t0} ms)`);
  console.log(`volumes ${st.volumes} (orphan bone ${st.orphan}); polyhedron ${st.poly}: overlap ${st.overlap}, miss ${st.miss}, no mesh on bone ${st.noMesh}, vol missing ${st.noVol}; overlap rate ${rate}%`);
  console.log(`meshes ${st.meshes} (ply missing ${st.meshMissing}); unitbox ${unitbox ? `same ${st.boxSame}, differ ${st.boxDiff}, differ where unitbox skips LODView{VolumeView} ${st.boxGap}, no box ${st.boxNone}` : 'not loadable'}`);
  for (const p of problems.slice(0, 10)) console.log('  ' + p);
  return st.bad ? 1 : 0;
}

if (require.main === module) process.exit(main(process.argv));
module.exports = { main };

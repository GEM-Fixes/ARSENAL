// lib/model/scenecache.js tests (mapviz contract tools/mapviz/README.md 1.4, 9.4): a fake install built here under os.tmpdir()
// (loose defs, mdl, ply, vol, an include, a pak, a mod folder) and, when installed, the real AS64 / MoW:AS2 and GoH data:
// L.load = sceneload.load deep compare on 30 entities per game, no re-read on a second load, winner def across the stack,
// timing of 200 loads through L against 20 plain sceneload calls, SCENECACHE_TARGET, a def naming a missing mdl.
// Run inside tools/lib/test/test.js or alone: node tools/lib/test/model-scenecache.test.js (last line PASS).
// Env: MAPVIZ_NO_GAME=1 skips the installed games; SCENECACHE_SAMPLE=n changes the 30 (SCENECACHE_TIMING=n the 200).
// Author: Imperator_Aug (ARSENAL, ia-4b4df6aa)
'use strict';
module.exports = (t, assert) => {
  const fs = require('fs'), path = require('path'), os = require('os');
  const sc = require('../model/scenecache'), sl = require('../model/sceneload'), vfsLib = require('../vfs');
  const vol = require('../model/vol'), zipwrite = require('../zipwrite');

  const T = s => Buffer.from(s, 'latin1');
  const crlf = s => T(s.replace(/\r?\n/g, '\r\n'));
  const i32 = (...a) => Buffer.concat(a.map(n => { const b = Buffer.alloc(4); b.writeInt32LE(n); return b; }));
  const u32 = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; };
  const u16 = (...a) => Buffer.concat(a.map(n => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; }));
  const f32 = (...a) => Buffer.concat(a.map(n => { const b = Buffer.alloc(4); b.writeFloatLE(n); return b; }));
  const s8 = x => { const b = T(x); return Buffer.concat([Buffer.from([b.length]), b]); };
  // one quad mesh, fvf 0x112 (position, normal, uv0), the form of tools/lib/test/model-scene.test.js
  const v112 = (x, y, z, u, v) => f32(x, y, z, 0, 0, 1, u, v);
  const plyBuf = Buffer.concat([T('EPLY'), T('BNDS'), f32(-6, -6, 0, 6, 6, 160), T('MESH'), u32(0x112), i32(0, 2), u32(0x004), s8('fx/bark.dds'),
    T('VERT'), i32(4), u16(32, 7), v112(-6, 0, 0, 0, 0), v112(6, 0, 0, 1, 0), v112(6, 0, 160, 1, 1), v112(-6, 0, 160, 0, 1),
    T('INDX'), i32(6), u16(0, 1, 2, 0, 2, 3)]);
  const volBuf = vol.write(vol.fromBox([12, 12, 160]));

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scenecache-test-'));
  const game = path.join(dir, 'as2'), modDir = path.join(dir, 'mods', 'fxmod');
  const W = (root, rel, buf) => { const f = path.join(root, ...rel.split('/')); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, buf); };
  W(game, 'mowas_2.exe', T('MZ'));
  W(game, 'resource/properties/fxbush.inc', crlf('{props "normal_light"}\n'));
  // tree: def with an include (real form: flora/bush/ash_tree_bush1), mdl with a mesh and a polyhedron volume
  W(game, 'resource/entity/fx/fx_tree/fx_tree.def', crlf('{\n\t(include "/properties/fxbush.inc")\n\t{Extension "fx_tree.mdl"}\n\t{NoGroupMesh 1}\n}\n'));
  W(game, 'resource/entity/fx/fx_tree/fx_tree.mdl', crlf('{Skeleton\n\t{bone "trunk"\n\t\t{VolumeView "trunk.ply"}\n\t}\n}\n' +
    '{Volume "trunk"\n\t{Polyhedron "trunk.vol"}\n\t{Bone "trunk"}\n\t{Position 0\t0\t80}\n}\n'));
  W(game, 'resource/entity/fx/fx_tree/trunk.ply', plyBuf);
  W(game, 'resource/entity/fx/fx_tree/trunk.vol', volBuf);
  // wall: box volume only
  const wallMdl = size => crlf(`{Skeleton\n\t{bone "wall"\n\t}\n}\n{Volume "wall"\n\t{Box ${size} 6 24}\n\t{Bone "wall"}\n\t{Position 0\t0\t12}\n}\n`);
  W(game, 'resource/entity/fx/fx_wall/fx_wall.def', crlf('{\n\t{Extension "fx_wall.mdl"}\n}\n'));
  W(game, 'resource/entity/fx/fx_wall/fx_wall.mdl', wallMdl(80));
  // seeded defects: a def naming a missing mdl; an mdl naming a missing .vol
  W(game, 'resource/entity/fx/fx_broken/fx_broken.def', crlf('{\n\t{Extension "fx_missing.mdl"}\n}\n'));
  W(game, 'resource/entity/fx/fx_hole/fx_hole.def', crlf('{\n\t{Extension "fx_hole.mdl"}\n}\n'));
  W(game, 'resource/entity/fx/fx_hole/fx_hole.mdl', crlf('{Skeleton\n\t{bone "b"\n\t}\n}\n{Volume "v"\n\t{Polyhedron "gone.vol"}\n\t{Bone "b"}\n}\n'));
  // one name, two folders of one layer: path order (a before b)
  W(game, 'resource/entity/b/fx_dup/fx_dup.def', crlf('{\n\t{Extension "fx_dup.mdl"}\n}\n'));
  W(game, 'resource/entity/b/fx_dup/fx_dup.mdl', wallMdl(30));
  W(game, 'resource/entity/a/fx_dup/fx_dup.def', crlf('{\n\t{Extension "fx_dup.mdl"}\n}\n'));
  W(game, 'resource/entity/a/fx_dup/fx_dup.mdl', wallMdl(20));
  // a pak keyed at its folder (resource/entity/)
  W(game, 'resource/entity/fxpak.pak', zipwrite.zip([['fx/fx_rock/fx_rock.def', crlf('{\n\t{Extension "fx_rock.mdl"}\n}\n')], ['fx/fx_rock/fx_rock.mdl', wallMdl(40)]]));
  // mod folder: shadows fx_wall.def at the same key (new mdl), and adds a second fx_tree.def at a path that sorts before the
  // base one (aa < fx): path order alone would pick the mod's, layer rank picks base (mounted first)
  W(modDir, 'resource/entity/fx/fx_wall/fx_wall.def', crlf('{\n\t{Extension "fx_wall2.mdl"}\n}\n'));
  W(modDir, 'resource/entity/fx/fx_wall/fx_wall2.mdl', wallMdl(100));
  W(modDir, 'resource/entity/aa/fx_tree/fx_tree.def', crlf('{\n\t{Extension "fx_wall2.mdl"}\n}\n'));
  // two mod folders: md1's 1.pat (layer 'md1 patch 1') mounts before md2, so its fx_px wins although md2's path sorts first
  const md1 = path.join(dir, 'mods', 'md1'), md2 = path.join(dir, 'mods', 'md2');
  W(md1, 'resource/entity/fx/fx_md1/fx_md1.def', crlf('{\n\t{Extension "fx_md1.mdl"}\n}\n'));
  W(md1, 'resource/entity/fx/fx_md1/fx_md1.mdl', wallMdl(10));
  W(md1, '1.pat', zipwrite.zip([['md1.patch', crlf('{Patch\n\t{id 1}\n}\n')], ['entity/bb/fx_px/fx_px.def', crlf('{\n\t{Extension "fx_px.mdl"}\n}\n')],
    ['entity/bb/fx_px/fx_px.mdl', wallMdl(11)]]));
  W(md2, 'resource/entity/ab/fx_px/fx_px.def', crlf('{\n\t{Extension "fx_px.mdl"}\n}\n'));
  W(md2, 'resource/entity/ab/fx_px/fx_px.mdl', wallMdl(12));

  const strip = r => { const x = Object.assign({}, r); delete x.files; return x; };
  const fileNames = r => r && r.scene ? [...new Set([...r.scene.meshes.map(m => m.file), ...r.scene.volumes.map(v => v.file).filter(Boolean)])] : [];
  function sameLoad(a, b, what) {   // deep compare of two sceneload results (files: by what they answer)
    assert.deepStrictEqual(strip(a), strip(b), what);
    for (const f of fileNames(b)) {
      assert.equal(a.files.key(f), b.files.key(f), what + ' key ' + f);
      assert.deepStrictEqual(a.files.origin(f), b.files.origin(f), what + ' origin ' + f);
      const x = a.files.get(f), y = b.files.get(f);
      assert.ok(x === y || (x && y && x.equals(y)), what + ' bytes ' + f);
    }
  }

  t('scenecache: target is required (SCENECACHE_TARGET)', () => {
    const code = fn => { try { fn(); return 'none'; } catch (e) { return e.code; } };
    assert.equal(code(() => sc.open({ game })), 'SCENECACHE_TARGET');
    assert.equal(code(() => sc.open({ target: 'mowas_2', game })), 'SCENECACHE_TARGET');   // an exe id is not a target
    assert.equal(code(() => sc.open({ target: 'AS64', game })), 'SCENECACHE_TARGET');
    const v = vfsLib.build({ gameDir: game, exe: 'goh' });
    assert.equal(code(() => sc.open({ target: 'mowas2', game, vfs: v })), 'SCENECACHE_TARGET');   // vfs built for another exe
    assert.equal(code(() => sc.open({ target: 'mowas2', game })), 'none');
    assert.equal(sc.open({ target: 'as64', game }).exe, 'as64');
    assert.equal(sc.open({ target: 'goh', game }).exe, 'goh');
  });

  t('scenecache: fake install, L.load = sceneload.load (entity, vfs key, disk path, pak)', () => {
    const L = sc.open({ target: 'mowas2', game });
    assert.equal(L.vfs().exe, 'mowas_2');
    for (const m of ['fx_tree', 'fx_wall', 'fx_rock', 'fx_hole', 'resource/entity/fx/fx_tree/fx_tree.mdl', 'entity/fx/fx_wall/fx_wall.mdl',
      path.join(game, 'resource', 'entity', 'fx', 'fx_tree', 'fx_tree.mdl'), 'no_such_thing', 'fx/none.mdl']) {
      const b = sl.load(m, { game });
      sameLoad(L.load(m), b, m);
      if (b.files) b.files.close();
    }
    const tree = L.load('fx_tree');
    assert.equal(tree.error, null);
    assert.equal(tree.entity, 'resource/entity/fx/fx_tree/fx_tree.def');
    assert.equal(tree.scene.meshes.length, 1); assert.ok(tree.scene.meshes[0].ply);
    assert.equal(tree.scene.volumes[0].kind, 'polyhedron');
    assert.equal(tree.origin.source, 'game');
    assert.equal(L.load('fx_rock').origin.source, 'pak');
  });

  t('scenecache: a second load of a model does not read again', () => {
    const L = sc.open({ target: 'mowas2', game });
    const a = L.load('fx_tree'), s1 = L.stats();
    assert.ok(s1.reads >= 4, 'def, include, mdl, ply, vol read: ' + s1.reads);
    const b = L.load('fx_tree'), s2 = L.stats();
    assert.equal(b, a); assert.equal(s2.reads, s1.reads); assert.equal(s2.hits, 1); assert.equal(s2.loads, 1);
    L.load('fx_wall');
    assert.ok(L.stats().reads > s2.reads);
    L.invalidate();
    assert.deepEqual(L.reads(), []);
    const c = L.load('fx_tree');
    assert.notEqual(c, a); assert.ok(L.stats().reads > s2.reads + 1);
    sameLoad(c, a, 'after invalidate');
  });

  t('scenecache: L.entity winner across the stack (mod dir shadows, first mounted wins, path order)', () => {
    const L0 = sc.open({ target: 'mowas2', game });
    assert.deepEqual(L0.entity('FX_Wall'), { name: 'fx_wall', key: 'resource/entity/fx/fx_wall/fx_wall.def', mdl: 'resource/entity/fx/fx_wall/fx_wall.mdl', layer: 'base' });
    assert.equal(L0.entity('fx_dup').key, 'resource/entity/a/fx_dup/fx_dup.def');
    assert.equal(L0.entity('fx_dup').mdl, 'resource/entity/a/fx_dup/fx_dup.mdl');
    assert.equal(L0.entity('fx_rock').key, 'resource/entity/fx/fx_rock/fx_rock.def');
    assert.equal(L0.entity('fx_broken').mdl, null);
    assert.equal(L0.entity('no_such_thing'), null);
    const L = sc.open({ target: 'mowas2', game, modDirs: [modDir] });
    const w = L.entity('fx_wall');
    assert.equal(w.key, 'resource/entity/fx/fx_wall/fx_wall.def');
    assert.equal(w.mdl, 'resource/entity/fx/fx_wall/fx_wall2.mdl');
    assert.notEqual(w.layer, 'base');
    const r = L.load('fx_wall');
    assert.equal(r.error, null); assert.equal(r.key, w.mdl); assert.equal(r.origin.where, 'mod');
    assert.equal(r.scene.volumes[0].size[0], 100);
    // another fx_tree.def in the mod folder at a path that sorts first (aa < fx): the base def mounted first wins (rank, not path)
    assert.ok('resource/entity/aa/fx_tree/fx_tree.def' < 'resource/entity/fx/fx_tree/fx_tree.def');
    assert.ok(L.vfs().files.has('resource/entity/aa/fx_tree/fx_tree.def'));
    assert.equal(L.entity('fx_tree').key, 'resource/entity/fx/fx_tree/fx_tree.def');
    assert.equal(L.entity('fx_tree').layer, 'base');
    // a mod folder's N.pat layer ranks with its folder: md1 patch 1 before md2
    const L2 = sc.open({ target: 'mowas2', game, modDirs: [md1, md2] });
    const layers = [...new Set([...L2.vfs().files.values()].map(x => x.layer))];
    assert.ok(layers.includes('md1 patch 1') && layers.includes('md2'), 'layers ' + layers.join(','));
    const px = L2.entity('fx_px');
    assert.equal(px.layer, 'md1 patch 1');
    assert.equal(px.key, 'resource/entity/bb/fx_px/fx_px.def');
    assert.equal(px.mdl, 'resource/entity/bb/fx_px/fx_px.mdl');
    assert.equal(L2.entity('fx_md1').layer, 'md1');
    assert.equal(L2.load('fx_px').scene.volumes[0].size[0], 11);
    L2.invalidate();
  });

  t('scenecache: a named mod that does not mount is refused (MOD_NOT_MOUNTED), not answered from vanilla', () => {
    let e = null;
    try { sc.open({ target: 'mowas2', game, mods: ['nosuch'] }); } catch (x) { e = x; }
    assert.ok(e, 'open with mods [nosuch] must throw');
    assert.equal(e.code, 'MOD_NOT_MOUNTED');
    assert.match(e.message, /nosuch/);
    assert.deepEqual(e.unmounted.map(u => u.name), ['nosuch']);
    assert.ok(e.unmounted[0].why.some(w => /^MOD_UNKNOWN /.test(w)), 'vfs.dropped reason: ' + e.unmounted[0].why.join('; '));
    // a given vfs is the caller's: not checked again
    const v = vfsLib.build({ gameDir: game, exe: 'mowas_2' });
    assert.equal(sc.open({ target: 'mowas2', game, vfs: v }).load('fx_wall').error, null);
  });

  t('sceneload: o.source of the README 1.4 shape only {read, has, keys}', () => {
    const L = sc.open({ target: 'mowas2', game });
    const bare = { read: k => L.source.read(k), has: k => L.source.has(k), keys: p => L.source.keys(p) };
    let r;
    assert.doesNotThrow(() => { r = sl.load('fx_wall', { source: bare }); });
    assert.equal(r.error, 'An entity name needs a game folder or a source that resolves entity names.');
    r = sl.load('fx_wall', { source: bare, game });   // the game's own index names the def, files come from the source
    assert.equal(r.error, null); assert.equal(r.key, 'resource/entity/fx/fx_wall/fx_wall.mdl'); assert.equal(r.origin, null);
    r = sl.load('resource/entity/fx/fx_wall/fx_wall.mdl', { source: bare });
    assert.equal(r.error, null); assert.equal(r.scene.volumes[0].size[0], 80);
  });

  t('scenecache: seeded defects are reported, not thrown (as sceneload)', () => {
    const L = sc.open({ target: 'mowas2', game });
    const a = L.load('fx_broken'), b = sl.load('fx_broken', { game });
    assert.equal(a.error, 'Entity "fx_broken" (resource/entity/fx/fx_broken/fx_broken.def) has no .mdl model.');
    assert.deepStrictEqual(a, b);
    const h = L.load('fx_hole');
    assert.deepEqual(h.scene.missing, ['gone.vol']);
    assert.match(L.load('no_such_thing').error, /No entity named "no_such_thing"/);
    assert.match(L.load('fx/none.mdl').error, /is not in the mod folder, the mods or the game/);
    // a corrupt pak: vfs reports it, the loader still answers for the loose files
    const bad = path.join(dir, 'badpak');
    W(bad, 'mowas_2.exe', T('MZ'));
    W(bad, 'resource/entity/fx/fx_wall/fx_wall.def', crlf('{\n\t{Extension "fx_wall.mdl"}\n}\n'));
    W(bad, 'resource/entity/fx/fx_wall/fx_wall.mdl', wallMdl(80));
    W(bad, 'resource/entity/junk.pak', T('PK\u0003\u0004 not a zip at all'));
    const Lb = sc.open({ target: 'mowas2', game: bad });
    assert.ok(Lb.vfs().problems.some(p => p.code === 'PAK_BAD'));
    assert.equal(Lb.load('fx_wall').error, null);
  });

  t('scenecache: L.read, L.reads (README 8.3 inputs), a given vfs is reused', () => {
    const v = vfsLib.build({ gameDir: game, exe: 'mowas_2' });
    const L = sc.open({ target: 'mowas2', game, vfs: v });
    assert.equal(L.vfs(), v);
    assert.ok(L.read('resource/entity/fx/fx_wall/fx_wall.def').equals(fs.readFileSync(path.join(game, 'resource/entity/fx/fx_wall/fx_wall.def'))));
    assert.ok(L.read('Resource\\Entity\\fx\\fx_wall\\fx_wall.mdl'));
    assert.equal(L.read('resource/entity/fx/nothing.def'), null);
    L.load('fx_rock'); L.load('fx_rock');
    const rs = L.reads();
    const paks = rs.filter(x => x.kind === 'pak');
    assert.equal(paks.length, 1, 'a pak counts once');
    assert.equal(path.resolve(paks[0].file), path.resolve(game, 'resource/entity/fxpak.pak'));
    assert.equal(paks[0].key, undefined);
    assert.equal(paks[0].size, fs.statSync(paks[0].file).size);
    const loose = rs.filter(x => x.kind === 'loose');
    assert.deepEqual(loose.map(x => x.key).sort(), ['resource/entity/fx/fx_wall/fx_wall.def', 'resource/entity/fx/fx_wall/fx_wall.mdl']);
    for (const x of rs) { assert.ok(path.isAbsolute(x.file)); assert.equal(typeof x.mtimeMs, 'number'); }
    L.invalidate();
    assert.equal(L.vfs(), v, 'a given vfs stays after invalidate');
  });

  t('scenecache: sceneload without o.source is unchanged (stage.openSource origins)', () => {
    const b = sl.load('fx_wall', { game, modDir });
    // sceneload's own path: entity from the base index, files with the mod folder laid over: the mod's def is not seen by
    // its entity index, so it still loads fx_wall.mdl (its behaviour today)
    assert.equal(b.key, 'resource/entity/fx/fx_wall/fx_wall.mdl');
    b.files.close();
  });

  // ---- installed games
  const gd = require('../gamedir');
  const N = Math.max(1, +process.env.SCENECACHE_SAMPLE || 30), NT = Math.max(1, +process.env.SCENECACHE_TIMING || 200);
  const installs = [];
  if (process.env.MAPVIZ_NO_GAME !== '1') {
    let a = null; try { a = gd.resolve().dir; } catch (e) { a = null; }
    if (a && fs.existsSync(path.join(a, 'resource', 'map.pak'))) installs.push({ target: 'as64', game: a }, { target: 'mowas2', game: a });
    else console.log('skip scenecache real loads: no MoW:AS2 install');
    let g = null; try { g = gd.goh(); } catch (e) { g = null; }
    if (g && fs.existsSync(path.join(g, 'resource', 'map', 'multi.pak'))) installs.push({ target: 'goh', game: g });
    else console.log('skip scenecache real loads: no GoH install');
  } else console.log('skip scenecache real loads: MAPVIZ_NO_GAME=1');

  // entity names with one def only (dup names are where the engine winner and sceneload's first-by-path pick may differ),
  // with a .mdl, spread over the sorted list
  function sample(L, n, spread) {
    const cnt = new Map();
    for (const k of L.source.keys('resource/entity/')) if (k.endsWith('.def')) { const b = k.slice(k.lastIndexOf('/') + 1, -4); cnt.set(b, (cnt.get(b) || 0) + 1); }
    const single = [...cnt].filter(x => x[1] === 1).map(x => x[0]).sort();
    const out = [], step = Math.max(1, Math.floor(single.length / (n * spread)));
    for (let i = 0; i < single.length && out.length < n; i += step) { const e = L.entity(single[i]); if (e && e.mdl) out.push(single[i]); }
    return out;
  }
  const ms = t0 => Number(process.hrtime.bigint() - t0) / 1e6;
  const results = {};
  for (const I of installs.filter(x => x.target !== 'mowas2')) {
    t(`scenecache: ${I.target} real install, ${N} entities: L.load = sceneload.load`, () => {
      const L = sc.open({ target: I.target, game: I.game });
      const names = sample(L, N, 3);
      assert.equal(names.length, N, 'sample size');
      let plain = 0, first = 0, nPlain = 0, problems = 0;
      for (const n of names) {
        const t0 = process.hrtime.bigint();
        const b = sl.load(n, { game: I.game });
        const d = ms(t0);
        if (nPlain < 20) { plain += d; if (!nPlain) first = d; nPlain++; }
        const a = L.load(n);
        if (a.error) problems++;
        sameLoad(a, b, I.target + ' ' + n);
        if (b.files) b.files.close();
      }
      const s1 = L.stats();
      for (const n of names) L.load(n);
      assert.equal(L.stats().reads, s1.reads, 'second loads read nothing');
      results[I.target] = { names, plain, first, nPlain, problems, L };
    });
    t(`scenecache: ${I.target} real install, ${NT} loads through L (timing)`, () => {
      const Ls = sc.open({ target: I.target, game: I.game });
      const names = sample(Ls, NT, 2);
      Ls.invalidate();
      const rss0 = process.memoryUsage().rss, t0 = process.hrtime.bigint();
      const L = sc.open({ target: I.target, game: I.game });
      let errs = 0;
      for (const n of names) if (L.load(n).error) errs++;
      const d = ms(t0), rss = Math.round((process.memoryUsage().rss - rss0) / 1048576);
      const r = results[I.target];
      console.log(`scenecache timing ${I.target}: L ${names.length} loads ${Math.round(d)} ms (${(d / names.length).toFixed(1)} ms each, open + vfs + entity index included, ${errs} with an error, rss +${rss} MB)` +
        (r ? `; plain sceneload ${r.nPlain} loads ${Math.round(r.plain)} ms (${(r.plain / r.nPlain).toFixed(0)} ms each, first ${Math.round(r.first)} ms)` : ''));
      assert.equal(names.length, NT, 'timing sample size');
      L.invalidate();
    });
  }
  const mow = installs.find(x => x.target === 'mowas2');
  if (mow) {
    t(`scenecache: mowas2 on the same install: no as64/core layer; equal to as64 where as64/core gives no file`, () => {
      const r = results.as64;
      const Lm = sc.open({ target: 'mowas2', game: mow.game });
      assert.equal(Lm.vfs().exe, 'mowas_2');
      assert.ok(![...Lm.vfs().files.values()].some(x => x.layer === 'as64/core'));
      const La = r ? r.L : sc.open({ target: 'as64', game: mow.game });
      const names = r ? r.names : sample(La, N, 3);
      let same = 0;
      for (const n of names) {
        const a = La.load(n), m = Lm.load(n);
        const origins = a.scene ? [a.origin, ...fileNames(a).map(f => a.files.origin(f))] : [a.origin];
        if (m.origin) assert.notEqual(m.origin.layer, 'as64/core');
        if (origins.some(o => o && o.layer === 'as64/core')) continue;
        sameLoad(m, a, 'mowas2 ' + n); same++;
      }
      console.log(`scenecache mowas2: ${same} of ${names.length} sampled models equal to the as64 load (the rest read an as64/core file)`);
      Lm.invalidate(); La.invalidate();
    });
  }
  vfsLib.closeRecs();
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* a handle still open: the temp dir stays */ }
};
if (require.main === module) {
  const assert = require('assert'); let n = 0, bad = 0;
  module.exports((name, fn) => { try { fn(); n++; } catch (e) { bad++; console.log('FAIL ' + name + ': ' + e.message); } }, assert);
  console.log(bad ? `FAIL ${bad} failed, ${n} passed` : `${n} passed\nPASS`);
  process.exitCode = bad ? 1 : 0;
}

// render l3 test (MV-R2, builder R2b): objects drawn over a synthetic pic.l2 (the frozen l2 format from synthobj.js),
// fixture map, both forms, size 600 (freeze render.md 6). Known answers: object colours (factor 2 x 1.08 x 0.5611),
// kinds and z; pixels with no object keep the base bytes; sidecar fields; the same bytes for any band split, through the
// pool, and the pinned sha1 (README 9.2); a base pixel with alpha 0 stays as it is; TexMod colour; GoH lightmap; alpha
// test, foliage kind, blend; seeded defects: a base of another frame is not used (drawn again, or RENDER_NOT_BUILT
// while l2.js is absent), a bad kernel task throws.
// usage: node tools/mapviz/render/test/l3.test.js [scratch dir]
// Author: Imperator_Aug (ARSENAL, ia-01e8e43a)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');

const OWN = !process.argv[2];
const W = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'mapviz-l3-')));
fs.mkdirSync(W, { recursive: true });
{
  const c = process.env.ARSENAL_CACHE;
  process.env.ARSENAL_CACHE = c && path.resolve(c).startsWith(W + path.sep) ? c : path.join(W, 'cache');
}
let pass = 0, fail = 0;
function ok(c, what) { if (c) pass++; else { fail++; console.log('FAIL mapviz render l3: ' + what); } }
const S = require('./synthobj'), L3 = require('../l3'), P = require('../pack');
const sha1 = d => crypto.createHash('sha1').update(Buffer.from(d.buffer, d.byteOffset, d.byteLength)).digest('hex');
const close = (a, b, t) => a && b && a.length >= b.length && b.every((v, i) => Math.abs(a[i] - v) <= (t === undefined ? 2 : t));
// pic.l3 sha1 of the as2 fixture at 600 px on the flat base: README 9.2 golden
const GOLDEN = '03ccdbd8ce5290ff7eb99e80562b2f898a890639';

async function main() {
  for (const form of ['as2', 'goh']) {
    const f = S.fixture(path.join(W, 'fx-' + form), form);
    const base = S.flatBase(f.doc, 600, { height: f.grids.height });
    const r = await L3.l3(f.src, f.doc, { size: 600, base, made: 't' });
    const c = (x, y) => S.rgbaAt(r.grid, x, y), n = (x, y) => S.rgbaAt(r.aux.n, x, y), z = (x, y) => S.valAt(r.aux.z, x, y);
    ok(r.grid.w === 600 && r.grid.h === 440 && r.grid.name === 'pic.l3' && r.aux.n.name === 'l3.n' && r.aux.z.name === 'l3.z' && r.aux.z.nodata === -32768, form + ': grids');
    ok(close(c(-450, -300), [182, 109, 85, 255]) && n(-450, -300)[3] === 4 && Math.abs(z(-450, -300) - 120) < 0.01, form + ': fx_house top ' + c(-450, -300) + ' z ' + z(-450, -300));
    ok(close(n(-450, -300), [128, 128, 255], 1), form + ': fx_house top normal up ' + n(-450, -300));
    ok(close(c(-400, 300), [116, 87, 58, 255]) && Math.abs(z(-400, 300) - 160) < 0.01 && n(-400, 300)[3] === 4, form + ': fx_tree top ' + c(-400, 300));
    ok(close(c(100, -130), [182, 182, 170, 255]) && Math.abs(z(100, -130) - 24) < 0.01, form + ': fx_wall ' + c(100, -130));
    const b = (x, y) => S.rgbaAt(base.grid, x, y);
    ok(JSON.stringify(c(130, -100)) === JSON.stringify(b(130, -100)) && JSON.stringify(n(130, -100)) === JSON.stringify(S.rgbaAt(base.aux.n, 130, -100)) && z(130, -100) === S.valAt(base.aux.z, 130, -100),
      form + ': (130, -100) keeps the base bytes, n and z');
    ok(close(c(150, 300), [85, 133, 61, 255]) && Math.abs(z(150, 300) - 24) < 0.01, form + ': fx_bush ' + c(150, 300));
    ok(JSON.stringify(c(0, 0)) === JSON.stringify(b(0, 0)), form + ': (0, 0) = base bytes');
    const sc = r.sidecar;
    ok(sc.layer === 'pic.l3' && sc.rung === 'l3' && sc.env === 'clean_daylight' && sc.rowOrder === 'minY-first' && sc.size === 600 && sc.w === 600 && sc.h === 440, form + ': sidecar head');
    ok(sc.base.layer === 'pic.l2' && sc.base.from === 'given' && sc.pack.from === 'built' && /^[0-9a-f]{40}$/.test(sc.pack.sha1) && sc.pack.instances === 7, form + ': sidecar base, pack ' + JSON.stringify([sc.base, sc.pack]));
    ok(sc.objects.drawn === 7 && JSON.stringify(sc.objects.skipped) === '{"decal":1}' && sc.objects.failed === 0 && sc.units === false, form + ': sidecar objects ' + JSON.stringify(sc.objects));
    ok(sc.textures.read === 4 && sc.textures.missing === 0 && JSON.stringify(sc.aux) === '["l3.n","l3.z"]' && sc.gain === 1.08 && sc.ground === 'net', form + ': sidecar textures, aux, gain, ground');
    ok(sc.brightness === (form === 'goh' ? 'unverified' : 'fitted') && sc.approx === (form === 'goh') && sc.detail === null && sc.keep === null, form + ': brightness, approx, detail');
    ok(r.aux.n.meta.frame === 'world' && r.aux.n.meta.kinds.length === 7 && r.aux.z.meta.unit === 'u', form + ': aux meta');
    if (form === 'as2') {
      const h = sha1(r.grid.data);
      if (GOLDEN.length === 40) ok(h === GOLDEN, 'as2: pic.l3 sha1 ' + h + ' = golden'); else console.log('golden as2 ' + h);
      const rb = await L3.l3(f.src, f.doc, { size: 600, base, made: 't', band: 37 });
      ok(sha1(rb.grid.data) === h && sha1(rb.aux.n.data) === sha1(r.aux.n.data) && sha1(rb.aux.z.data) === sha1(r.aux.z.data), 'as2: the same bytes for a 37-row band split');
      const pr = P.pack(f.src, f.doc, { made: 't' });
      const rp = await L3.l3(f.src, f.doc, { size: 600, base, made: 't', pack: pr, pool: 2 });
      ok(sha1(rp.grid.data) === h && rp.sidecar.pack.from === 'given' && rp.stats.pool > 0, 'as2: the same bytes through the pool, pack given');
      const ru = await L3.l3(f.src, f.doc, { size: 600, base, made: 't', pack: pr, units: true });
      ok(ru.sidecar.units === true && sha1(ru.grid.data) === h, 'as2: --units (no units on the fixture) draws the same');
      // base alpha 0 around the first tree: the base bytes stay
      const b0 = S.flatBase(f.doc, 600, { height: f.grids.height, alpha0: (x, y) => Math.hypot(x + 400, y - 300) < 20 });
      const r0 = await L3.l3(f.src, f.doc, { size: 600, base: b0, made: 't', pack: pr });
      ok(JSON.stringify(S.rgbaAt(r0.grid, -400, 300)) === '[0,0,0,0]' && S.rgbaAt(r0.aux.n, -400, 300)[3] === 0 && S.valAt(r0.aux.z, -400, 300) === -32768, 'as2: base alpha 0 keeps alpha 0 (no object drawn)');
      // a base of another frame is not used
      const bx = S.flatBase(f.doc, 600, { height: f.grids.height, cellShift: 1 });
      const hasL2 = fs.existsSync(path.join(__dirname, '..', 'l2.js'));
      let e = null, rx = null;
      try { rx = await L3.l3(f.src, f.doc, { size: 600, base: bx, made: 't', pack: pr }); } catch (er) { e = er; }
      // with l2.js the base is drawn again in process; the fixture has no map.ply, so that l2 run stops on RENDER_PLY_MISSING
      if (hasL2) ok((rx && rx.sidecar.base.from === 'drawn' && rx.grid.w === 600) || (e && e.detail && e.detail.code === 'RENDER_PLY_MISSING'),
        'as2: a base of another frame is drawn again ' + (e && e.message));
      else ok(e && e.code === 'MV_NOT_BUILT' && e.detail && e.detail.code === 'RENDER_NOT_BUILT' && e.detail.rung === 'l2', 'as2: a base of another frame with no l2.js -> RENDER_NOT_BUILT ' + (e && e.message));
      // a bad kernel task
      let ke = null;
      try { require('../l3tile').run({ args: { W: 0 } }, { readGrid() {}, writeGrid() {} }); } catch (er) { ke = er; }
      ok(ke && ke.code === 'RENDER_TASK', 'as2: l3tile refuses a task with no frame');
    }
  }
  // TexMod colour
  {
    const f = S.fixture(path.join(W, 'fx-texmod'), 'as2', (fxd, put) => put('resource/entity/fx/fx_house#aut.dds', S.dds32(8, 8, [200, 50, 50, 255])));
    for (const e of f.doc.entities) if (e.uid === 0x1005) e.texmod = 'aut';
    const seen = new Set();
    const progress = { check() {}, stage(s) { seen.add(s); }, step() {}, set() {} };
    const r = await L3.l3(f.src, f.doc, { size: 600, base: S.flatBase(f.doc, 600, { height: f.grids.height }), made: 't', progress });
    ok(close(S.rgbaAt(r.grid, -450, -300), [242, 61, 61, 255]), 'texmod: fx_house draws #aut (200, 50, 50) x 1.2121 ' + S.rgbaAt(r.grid, -450, -300));
    const words = ['read', 'defs', 'build', 'draw', 'write'];
    ok(seen.size > 0 && [...seen].every(s => words.includes(s)), 'stage words of pack and l3 are only ' + words + ': ' + [...seen]);
  }
  // sidecar notes are [{code, text}] (render.md 3.2): an undecodable object texture and a pack note (TexMod missing)
  {
    const f = S.fixture(path.join(W, 'fx-notes'), 'as2', (fxd, put) => put('resource/entity/fx/fx_wall.dds', Buffer.from('not a texture')));
    for (const e of f.doc.entities) if (e.uid === 0x1005) e.texmod = 'zzz';
    const r = await L3.l3(f.src, f.doc, { size: 600, base: S.flatBase(f.doc, 600, { height: f.grids.height }), made: 't' });
    const ns = r.sidecar.notes || [];
    ok(ns.length > 0 && ns.every(n => n && typeof n === 'object' && /^RENDER_[A-Z0-9_]+$/.test(n.code) && typeof n.text === 'string' && n.text.length > 0),
      'notes: every sidecar note is {code, text} ' + JSON.stringify(ns.slice(0, 3)));
    ok(ns.some(n => n.code === 'RENDER_OBJ_TEXTURE' && /fx_wall/.test(n.text)) && r.sidecar.gaps.includes('RENDER_OBJ_TEXTURE'), 'notes: RENDER_OBJ_TEXTURE names fx_wall');
    ok(ns.some(n => n.code === 'RENDER_TEXMOD_MISSING' && !/^RENDER_TEXMOD_MISSING:/.test(n.text)), 'notes: the pack note keeps its code apart from its text');
  }
  // GoH lightmap x 2: lightmap texel 64 -> x 0.502
  {
    const f = S.fixture(path.join(W, 'fx-lm'), 'goh', (fxd, put) => {
      put('resource/entity/fx/fx_tree.mtl', '{material simple\r\n\t{diffuse "fx_tree"}\r\n\t{lightmap "fx_lm"}\r\n\t{blend none}\r\n}\r\n');
      put('resource/entity/fx/fx_lm.dds', S.dds32(4, 4, [64, 64, 64, 255]));
    });
    const r = await L3.l3(f.src, f.doc, { size: 600, base: S.flatBase(f.doc, 600, { height: f.grids.height }), made: 't' });
    ok(close(S.rgbaAt(r.grid, -400, 300), [58, 44, 29, 255]), 'goh: lightmap 64 x 2 / 255 on fx_tree ' + S.rgbaAt(r.grid, -400, 300));
  }
  // alpha test, foliage, blend
  {
    const f = S.fixture(path.join(W, 'fx-alpha'), 'as2', (fxd, put) => {
      put('resource/entity/fx/fx_bush.mtl', '{material simple\r\n\t{diffuse "fx_bush"}\r\n\t{blend test}\r\n}\r\n');
      put('resource/entity/fx/fx_tree.mtl', '{material simple\r\n\t{diffuse "fx_tree"}\r\n\t{blend test}\r\n\t{alpharef 100}\r\n}\r\n');
      put('resource/entity/fx/fx_tree.dds', S.dds32(8, 8, [96, 72, 48, 99]));
      put('resource/entity/fx/fx_wall.mtl', '{material simple\r\n\t{diffuse "fx_wall"}\r\n\t{blend blend}\r\n}\r\n');
      put('resource/entity/fx/fx_wall.dds', S.dds32(8, 8, [150, 150, 140, 128]));
    });
    const base = S.flatBase(f.doc, 600, { height: f.grids.height });
    const r = await L3.l3(f.src, f.doc, { size: 600, base, made: 't' });
    ok(S.rgbaAt(r.aux.n, 150, 300)[3] === 5 && close(S.rgbaAt(r.grid, 150, 300), [85, 133, 61, 255]), 'alpha test on a bush: kind 5 foliage ' + S.rgbaAt(r.aux.n, 150, 300));
    ok(JSON.stringify(S.rgbaAt(r.grid, -400, 300)) === JSON.stringify(S.rgbaAt(base.grid, -400, 300)), 'texel alpha 99 < alpharef 100 discards the tree');
    const wv = S.rgbaAt(r.grid, 100, -130);
    ok(close(wv, [155, 155, 149, 255], 2) && S.rgbaAt(r.aux.n, 100, -130)[3] === 1 && S.valAt(r.aux.z, 100, -130) === 0, 'blend wall over the base, no z write ' + wv);
  }
}

// l3tile on its own: blended squares over a black 8 x 8 px frame (sx 1, ss 2). Two triangles share the diagonal (sample
// centres lie on it), and two squares share the seam x = 4.25 (sample centres lie on it). Top-left rule: each such
// sample is drawn once, so the picture is a uniform 128 (255 x 128/255 over black), with no doubled line and no gap.
function kernelBlend(quads) {
  const K = require('../l3tile');
  const pos = [], nrm = [], uv = [], idx = [], parts = [];
  for (const [x0, y0, x1, y1] of quads) {
    const v = pos.length / 3;
    pos.push(x0, y0, 1, x1, y0, 1, x1, y1, 1, x0, y1, 1);
    for (let q = 0; q < 4; q++) { nrm.push(0, 0, 1); uv.push(0, 0); }
    idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
  }
  parts.push({ mat: 0, iOff: 0, iCount: idx.length });
  const g = (w, h, etype, data) => ({ w, h, etype, data });
  const grids = new Map([
    ['base', g(8, 8, 'rgba8', new Uint8ClampedArray(256).map((x, i) => (i % 4 === 3 ? 255 : 0)))],
    ['bn', g(8, 8, 'rgba8', new Uint8ClampedArray(256))], ['bz', g(8, 8, 'f32', new Float32Array(64))],
    ['pos', g(3, pos.length / 3, 'f32', new Float32Array(pos))], ['nrm', g(3, pos.length / 3, 'f32', new Float32Array(nrm))],
    ['uv0', g(2, pos.length / 3, 'f32', new Float32Array(uv))], ['uv1', g(2, pos.length / 3, 'f32', new Float32Array(uv))],
    ['idx', g(3, idx.length / 3, 'u32', new Uint32Array(idx))],
    ['inst', g(12, 1, 'f32', new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]))], ['insti', g(2, 1, 'u32', new Uint32Array([0, 0]))],
  ]);
  const io = { readGrid: f => grids.get(f), writeGrid: (f, gr) => grids.set(f, gr) };
  K.run({ args: { W: 8, H: 8, y0: 0, y1: 8, x0: 0, yb: 0, sx: 1, sy: 1, ss: 2, gain: 1, sun: [0, 0, 0], amb: [1, 1, 1], L: [0, 0, 1],
    base: 'base', bn: 'bn', bz: 'bz', pos: 'pos', nrm: 'nrm', uv0: 'uv0', uv1: 'uv1', idx: 'idx', inst: 'inst', insti: 'insti', texs: [],
    mats: [{ tex: -1, lm: -1, blend: 'blend', alpharef: 128, a2c: false, color: [255, 255, 255, 128], noLight: true }],
    geoms: [{ vOff: 0, vCount: pos.length / 3, iOff: 0, iCount: idx.length, parts, box: [0, 0, 1, 8, 8, 1] }], outName: 'o' } }, io);
  const d = grids.get('o-c.mvg').data, reds = new Set();
  for (let p = 0; p < 64; p++) reds.add(d[p * 4]);
  return [...reds];
}
{
  const a = kernelBlend([[0, 0, 8, 8]]);
  ok(a.length === 1 && a[0] === 128, 'l3tile: a blended square with a shared diagonal is a uniform 128, got ' + a);
  const b = kernelBlend([[0, 0, 4.25, 8], [4.25, 0, 8, 8]]);
  ok(b.length === 1 && b[0] === 128, 'l3tile: two blended squares with a shared seam on sample centres are a uniform 128, got ' + b);
  const K = require('../l3tile');
  ok(K.edge(0, 0, 4, 4, 1, 3) === -K.edge(4, 4, 0, 0, 1, 3) && K.topLeft(0, 0, 4, 4) !== K.topLeft(4, 4, 0, 0), 'l3tile: edge values are exact negatives and one side owns the edge');
}
// decodeTex: bmp and png decode like tga (one size rule); jpg has no reader and says so
{
  const png = require('../../lib/raster/png').encode({ w: 2, h: 2, rgba: new Uint8ClampedArray([10, 20, 30, 255, 10, 20, 30, 255, 10, 20, 30, 255, 10, 20, 30, 255]) });
  const bmp = Buffer.alloc(54 + 16);   // 2 x 2, 24 bit, bottom-up, rows padded to 8 bytes
  bmp.write('BM', 0, 'latin1'); bmp.writeUInt32LE(bmp.length, 2); bmp.writeUInt32LE(54, 10); bmp.writeUInt32LE(40, 14);
  bmp.writeInt32LE(2, 18); bmp.writeInt32LE(2, 22); bmp.writeUInt16LE(1, 26); bmp.writeUInt16LE(24, 28); bmp.writeUInt32LE(16, 34);
  for (const r of [0, 8]) for (const p of [0, 3]) { bmp[54 + r + p] = 30; bmp[54 + r + p + 1] = 20; bmp[54 + r + p + 2] = 10; }
  const files = { 'a.png': png, 'a.bmp': bmp, 'a.jpg': Buffer.from([0xff, 0xd8, 0xff, 0xd9]) };
  const io = { read: k => files[k] || null };
  const dp = L3.decodeTex(io, 'a.png', 0, 1), db = L3.decodeTex(io, 'a.bmp', 0, 1), dj = L3.decodeTex(io, 'a.jpg', 0, 1);
  ok(!dp.error && dp.w === 2 && dp.h === 2 && dp.data[0] === 10 && dp.data[2] === 30 && dp.data[3] === 255, 'decodeTex: png ' + JSON.stringify(dp.error || [dp.w, dp.data && dp.data[0]]));
  ok(!db.error && db.w === 2 && db.h === 2 && db.data[0] === 10 && db.data[1] === 20 && db.data[2] === 30, 'decodeTex: bmp ' + JSON.stringify(db.error || [db.w, db.data && Array.from(db.data.slice(0, 4))]));
  ok(dj.error && /jpg/.test(dj.error), 'decodeTex: jpg is not decoded ' + JSON.stringify(dj));
}
// uvuOf: the lightmap density comes from uv1 (the set the kernel samples it with), not from a tiling uv0
{
  const pk = { pos: new Float32Array([0, 0, 0, 10, 0, 0, 0, 10, 0]), uv0: new Float32Array([0, 0, 8, 0, 0, 8]), uv1: new Float32Array([0, 0, 1, 0, 0, 1]), idx: new Uint32Array([0, 1, 2]) };
  const g = { vOff: 0, iOff: 0 }, p = { iOff: 0, iCount: 3 };
  const d0 = L3.uvuOf(pk, g, p, pk.uv0), d1 = L3.uvuOf(pk, g, p, pk.uv1);
  ok(Math.abs(d0 - 0.8) < 1e-6 && Math.abs(d1 - 0.1) < 1e-6, 'uvuOf: uv0 0.8 and uv1 0.1 per unit, got ' + d0 + ' ' + d1);
}

main().then(() => {
  if (OWN && !fail) { try { fs.rmSync(W, { recursive: true, force: true }); } catch (e) { /* temp */ } }
  if (fail) { console.log('FAIL mapviz render l3: ' + fail + ' of ' + (pass + fail) + ' checks'); process.exit(1); }
  console.log('PASS mapviz render l3 (' + pass + ')');
}, e => { console.log('FAIL mapviz render l3: ' + (e && e.stack || e)); process.exit(1); });

// render L4 test (MV-R3): light and shadow over a synthetic pic.l3 (+ l3.n, l3.z) on the fixture map, both forms, with a
// synthetic scene pack written in the frozen pack.bin layout (render.md freeze draft 3.3). Known answers of draft 6 (the
// fx_wall shadow under the light {dir [1,0,-1], sun 0.6, amb 0.2}, --light clean = pic.l3 outside shadows, --light mode
// and --grass on with the fixture's files absent), an alpha-tested caster, units, service defs and the small-caster cull,
// planted environment presets (MoW:AS2 multi_01, GoH var1, GoH black), planted map.grs v1 and v2 with a grass.set, seeded
// defects (pack.bin one byte short, a bad light word, a bad shadow size, a base of another frame, map.grs cut short), band
// and pool invariance and a golden sha1. Then a real-install part: for each installed game (as64, mowas2, goh) one real
// multiplayer map, l1 drawn as the ground with l3.n and l3.z from the height grid (the l3 and pack of R2b when built,
// else an empty pack), l4 with --light mode and --grass on; checks sane numbers. MAPVIZ_NO_GAME=1 skips the real part.
// usage: node tools/mapviz/render/test/l4.test.js [scratch dir] [--update-golden]
// Author: Imperator_Aug (ARSENAL, ia-6f0cbc03)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');

const OWN = !process.argv[2] || process.argv[2].startsWith('--');
const W = path.resolve(OWN ? fs.mkdtempSync(path.join(os.tmpdir(), 'mapviz-l4-')) : process.argv[2]);
fs.mkdirSync(W, { recursive: true });
{
  const c = process.env.ARSENAL_CACHE;
  process.env.ARSENAL_CACHE = c && path.resolve(c).startsWith(W + path.sep) ? c : path.join(W, 'cache');
}
const UPDATE = process.argv.includes('--update-golden');

let pass = 0, fail = 0;
function ok(c, what) { if (c) pass++; else { fail++; console.log('FAIL mapviz render l4: ' + what); } }
const sha1 = b => crypto.createHash('sha1').update(b).digest('hex');

const MVDIR = path.resolve(__dirname, '../..');
const mv = require(path.join(MVDIR, 'mapviz.js'));
const mk = require(path.join(MVDIR, 'lib/mapkit'));
const fx = require(path.join(MVDIR, 'test/fxmake'));
const F = require('../frame');
const L1 = require('../l1');
const E = require('../env');
const L4 = require('../l4');
const K = require('../l4tile');
const S = require('./synth');

// golden sha1 of the AS2-form picture under the given light {dir [1,0,-1], sun 0.6, amb 0.2} (data block)
const GOLDEN = { as2: 'c526cc84a6402ae2887571bbc2ba971579deec3d', goh: 'bf56432e569cf23de0665f408492b525eb09e4e6' };

async function rejects(p) { try { await p; return null; } catch (e) { return e; } }
function cli(args) {
  const r = require('child_process').spawnSync(process.execPath, [path.join(MVDIR, 'mapviz.js')].concat(args), { encoding: 'utf8', env: Object.assign({}, process.env), timeout: 300000 });
  return { code: r.status, out: r.stdout || '', err: r.stderr || '' };
}
const jsonOf = s => { try { return JSON.parse(s); } catch (e) { return null; } };
const px =(g, i, j) => Array.from(g.data.subarray((j * g.w + i) * 4, (j * g.w + i) * 4 + 4));
function pixAt(g, x, y) {
  const cy = (g.meta && g.meta.cellY) || g.cell;
  return px(g, Math.floor((x - g.ox) / g.cell), Math.floor((y - g.oy) / cy));
}
const near = (a, b, t) => a.length === b.length && a.every((v, k) => Math.abs(v - b[k]) <= t);

// ------------------------------------------------------------------ a src with planted files over the fixture's
function wrap(src, extra) {
  const X = new Map(Object.entries(extra || {}));
  return {
    target: src.target, exe: src.exe, stackHash: src.stackHash, game: src.game, mods: src.mods, modDirs: src.modDirs,
    has: k => X.has(k) || src.has(k),
    read: k => (X.has(k) ? X.get(k) : src.read(k)),
    keys: p => [...new Set(src.keys(p).concat([...X.keys()].filter(k => k.startsWith(p || ''))))].sort(),
    reads: () => (src.reads ? src.reads() : []),
  };
}

// ------------------------------------------------------------------ synthetic scene pack (draft 3.3 layout)
function boxMesh(x0, y0, z0, x1, y1, z1) {
  const pos = [], uv = [];
  for (let c = 0; c < 8; c++) { pos.push([c & 1 ? x1 : x0, c & 2 ? y1 : y0, c & 4 ? z1 : z0]); uv.push([0, 0]); }
  const f = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]];
  const idx = [];
  for (const [a, b, c, d] of f) idx.push(a, b, c, a, c, d);
  return { pos, uv, idx, box: [x0, y0, z0, x1, y1, z1] };
}
// two meshes in one (b's vertex indices moved past a's)
function joinMesh(a, b) {
  const n = a.pos.length, bx = [0, 1, 2].map(c => Math.min(a.box[c], b.box[c])).concat([3, 4, 5].map(c => Math.max(a.box[c], b.box[c])));
  return { pos: a.pos.concat(b.pos), uv: a.uv.concat(b.uv), idx: a.idx.concat(b.idx.map(v => v + n)), box: bx };
}
function quadMesh(x0, y0, x1, y1, z) {
  return { pos: [[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]], uv: [[0, 0], [1, 0], [1, 1], [0, 1]], idx: [0, 1, 2, 0, 2, 3], box: [x0, y0, z, x1, y1, z] };
}
// T(x, y, z) Rz(yaw deg) S(s), row-major 3 x 4
function mat(x, y, z, yaw, s) {
  const a = (yaw || 0) * Math.PI / 180, c = Math.cos(a), n = Math.sin(a), k = s || 1;
  const r = v => (Math.abs(v) < 1e-12 ? 0 : v);
  return [r(c * k), r(-n * k), 0, x, r(n * k), r(c * k), 0, y, 0, 0, k, z];
}
// defs: [{def, category, state, geoms:[{mesh, mat}], inst:[{uid, flags, m}]}]; materials, textures as draft 3.3
function makePack(o) {
  const geoms = [], defs = [], insts = [];
  const P = [], UV = [], I = [];
  for (const d of o.defs) {
    const ids = [];
    for (const g of d.geoms) {
      const id = geoms.length, vOff = P.length, iOff = I.length;
      g.mesh.pos.forEach(p => P.push(p)); g.mesh.uv.forEach(u => UV.push(u)); g.mesh.idx.forEach(v => I.push(v));
      // part iOff relative to the geom's iOff (pack.js geometry()); g.parts = [{mat, iOff, iCount}] for a multi-part mesh
      geoms.push({ id, def: d.def, variant: null, vOff, vCount: g.mesh.pos.length, iOff, iCount: g.mesh.idx.length,
        parts: g.parts || [{ mat: g.mat, iOff: 0, iCount: g.mesh.idx.length }], box: g.mesh.box, skinned: !!g.skinned });
      ids.push(id);
    }
    for (const it of d.inst || []) insts.push({ geom: ids[it.g || 0], uid: it.uid, flags: it.flags || 0, m: it.m });
    defs.push({ def: d.def, category: d.category || 'object', state: d.state, code: null, geoms: ids, instances: (d.inst || []).length });
  }
  insts.sort((a, b) => a.uid - b.uid);
  const parts = [];
  let off = 8;
  const sect = {};
  const add = (name, buf, count) => { const pad = (8 - (off % 8)) % 8; if (pad) { parts.push(Buffer.alloc(pad)); off += pad; } sect[name] = { off, count }; parts.push(buf); off += buf.length; };
  const f32 = (arr, n) => { const b = Buffer.alloc(arr.length * n * 4); arr.forEach((v, i) => { for (let c = 0; c < n; c++) b.writeFloatLE(v[c], (i * n + c) * 4); }); return b; };
  add('pos', f32(P, 3), P.length);
  add('nrm', f32(P.map(() => [0, 0, 1]), 3), P.length);
  add('uv0', f32(UV, 2), UV.length);
  add('uv1', f32(UV.map(() => [0, 0]), 2), UV.length);
  { const b = Buffer.alloc(I.length * 4); I.forEach((v, i) => b.writeUInt32LE(v, i * 4)); add('idx', b, I.length); }
  { const b = Buffer.alloc(insts.length * 64); insts.forEach((t, i) => { const q = i * 64; b.writeUInt32LE(t.geom, q); b.writeUInt32LE(t.uid, q + 4); b.writeUInt32LE(t.flags, q + 8); t.m.forEach((v, k) => b.writeFloatLE(v, q + 16 + k * 4)); }); add('inst', b, insts.length); }
  const head = Buffer.alloc(8); head.write('MVPK', 0, 'latin1'); head.writeUInt32LE(1, 4);
  const bin = Buffer.concat([head].concat(parts));
  const json = { v: 1, kind: 'scenepack', target: o.target || 'mowas2', stackHash: 'synthetic', mapHashes: {}, map: 'multi/mv_fixture', mode: null, box: [-600, -440, 600, 440],
    units: 'included', textures: o.textures || [], materials: o.materials || [], geoms, defs,
    counts: { defs: defs.length, geoms: geoms.length, verts: P.length, tris: I.length / 3, instances: insts.length, drawn: 0, skipped: {}, failed: 0 },
    gaps: [], notes: [], bin: { file: 'pack.bin', bytes: bin.length, sha1: sha1(bin), sections: sect }, made: 'x' };
  return { json, bin };
}

const ALPHA_KEY = 'resource/texture/test/mv_alpha.dds';
const alphaDds = S.dds32(8, 8, (i) => [90, 120, 60, i < 4 ? 0 : 255]);
function fixturePack(target) {
  return makePack({
    target,
    textures: [{ id: 0, key: ALPHA_KEY, variant: null, from: 'default', size: [8, 8] }],
    materials: [{ id: 0, tex: null, lm: null, blend: 'none', alpharef: 128, a2c: false, color: [255, 255, 255, 255], scale: 2, noLight: false },
      { id: 1, tex: 0, lm: null, blend: 'test', alpharef: 128, a2c: true, color: [255, 255, 255, 255], scale: 2, noLight: false },
      { id: 2, tex: null, lm: null, blend: 'blend', alpharef: 0, a2c: false, color: [255, 255, 255, 128], scale: 2, noLight: false }],
    defs: [
      // fx_wall 4 x 0.3 x 1.2 m = 80 x 6 x 24 u, yaw 90 at (100, -100): world x 97..103, y -140..-60
      { def: 'fx_wall', category: 'wall', state: 'drawn', geoms: [{ mesh: boxMesh(-40, -3, 0, 40, 3, 24), mat: 0 }], inst: [{ uid: 0x1004, m: mat(100, -100, 0, 90, 1) }] },
      // an alpha-tested plane at z 40 over x 200..240, y 100..140; texture alpha 0 for u < 0.5
      { def: 'mv_leaf', category: 'tree', state: 'drawn', geoms: [{ mesh: quadMesh(-20, -20, 20, 20, 40), mat: 1 }], inst: [{ uid: 0x2001, m: mat(220, 120, 0, 0, 1) }] },
      // a blend material plane at z 40 over x 200..240, y -60..-20: casts nothing
      { def: 'mv_glass', category: 'object', state: 'drawn', geoms: [{ mesh: quadMesh(-20, -20, 20, 20, 40), mat: 2 }], inst: [{ uid: 0x2002, m: mat(220, -40, 0, 0, 1) }] },
      // a unit box at (-50, 100): casts only when pic.l3.json units is true
      { def: 'mv_unit', category: 'placed_unit', state: 'unit', geoms: [{ mesh: boxMesh(-5, -5, 0, 5, 5, 20), mat: 0 }], inst: [{ uid: 0x2003, flags: 1, m: mat(-50, 100, 0, 0, 1) }] },
      // a service box at (50, 100): never casts
      { def: 'mv_service', category: 'service', state: 'service', geoms: [{ mesh: boxMesh(-5, -5, 0, 5, 5, 20), mat: 0 }], inst: [{ uid: 0x2004, m: mat(50, 100, 0, 0, 1) }] },
      // a tiny box at (0, -300): culled (under one texel in both axes of the shadow map)
      { def: 'mv_tiny', category: 'object', state: 'drawn', geoms: [{ mesh: boxMesh(-0.05, -0.05, 0, 0.05, 0.05, 0.1), mat: 0 }], inst: [{ uid: 0x2005, m: mat(0, -300, 0, 0, 1) }] },
    ],
  });
}

// ------------------------------------------------------------------ synthetic l3 base on the plan frame
// flat grey (128) everywhere, normal up, kind 1 at the ground height; the fx_wall top kind 4 at z 24
function makeBase(doc, grids, size, o) {
  o = o || {};
  const pl = F.plan(doc, { size });
  const Wd = pl.size[0], Hd = pl.size[1];
  const pic = new Uint8ClampedArray(Wd * Hd * 4), n = new Uint8ClampedArray(Wd * Hd * 4), z = new Float32Array(Wd * Hd);
  for (let j = 0; j < Hd; j++) for (let i = 0; i < Wd; i++) {
    const x = pl.box[0] + (i + 0.5) * pl.cell, y = pl.box[1] + (j + 0.5) * pl.cellY, k = j * Wd + i;
    pic[k * 4] = 128; pic[k * 4 + 1] = 128; pic[k * 4 + 2] = 128; pic[k * 4 + 3] = 255;
    n[k * 4] = 128; n[k * 4 + 1] = 128; n[k * 4 + 2] = 255;
    let kind = o.kind || 1, zz = mk.heightAt(grids.height, x, y);
    if (o.normal) { n[k * 4] = o.normal[0]; n[k * 4 + 1] = o.normal[1]; n[k * 4 + 2] = o.normal[2]; }
    // the fixture ridge's slopes (60 u over 100 u each side of x -200): the exact slope normal
    if (o.ridge && x > -300 && x < -100 && Math.abs(x + 200) > 0.5) {
      const sx = x < -200 ? -0.6 : 0.6, h = Math.hypot(sx, 1);
      n[k * 4] = Math.round((sx / h + 1) * 127.5); n[k * 4 + 1] = 128; n[k * 4 + 2] = Math.round((1 / h + 1) * 127.5);
    }
    if (!o.noWall && x >= 97 && x <= 103 && y >= -140 && y <= -60) { kind = 4; zz = 24; }
    if (o.hole && x < -560) { kind = 0; zz = -32768; pic[k * 4 + 3] = 0; }
    n[k * 4 + 3] = kind; z[k] = zz === null ? 0 : zz;
  }
  const g = (name, etype, data, extra) => Object.assign({ name, w: Wd, h: Hd, cell: pl.cell, ox: pl.box[0], oy: pl.box[1], etype, sample: 'cell', scale: 1, offset: 0,
    nodata: null, meta: pl.cellY !== pl.cell ? { cellY: pl.cellY } : {}, data }, extra || {});
  return {
    grid: g('pic.l3', 'rgba8', pic),
    aux: { n: g('l3.n', 'rgba8', n, { meta: { frame: 'world', kinds: ['none', 'ground', 'decal', 'water', 'object', 'foliage', 'unit'] } }), z: g('l3.z', 'f32', z, { nodata: -32768, meta: { unit: 'u' } }) },
    sidecar: { v: 1, layer: 'pic.l3', rung: 'l3', units: !!o.units, gaps: [], mapHashes: { 'map.ply': 'x' }, made: 'base', detail: 'map', keep: 0, detailTextures: [], detailChanged: false },
  };
}

// expected relit value of a flat-up pixel of byte v (independent of l4tile: the draft formula)
const LW0 = E.worldSun(E.CLEAN);
const NUP = (() => { const a = 128 / 127.5 - 1, b = 255 / 127.5 - 1, h = Math.hypot(a, a, b); return [a / h, a / h, b / h]; })();
const f0 = (() => { const nl = Math.max(0, NUP[0] * LW0[0] + NUP[1] * LW0[1] + NUP[2] * LW0[2]); return 0.601 * nl + 0.179; })();
function expectFlat(v, light, S) {
  const Ls = E.worldSun(light);
  const nl = Math.max(0, NUP[0] * Ls[0] + NUP[1] * Ls[1] + NUP[2] * Ls[2]);
  return [0, 1, 2].map(c => v / 255 * (light.sun[c] * nl * S + light.amb[c]) / Math.max(f0, 0.179));
}
const GIVEN = { dir: [1, 0, -1], sun: 0.6, amb: 0.2 };
const DOWN = { dir: [0, 0, -1], sun: 0.6, amb: 0.2 };
const b255 = a => a.map(v => Math.max(0, Math.min(255, Math.round(v * 255))));

// multi_01 as shipped (MoW:AS2 gamelogic, read 2026-11-14) and the GoH var1 colour block (01_finland_summer var1)
const AS2_PRESET = '{environment\r\n\t{light\r\n\t\t{direction 0.719 0.281 -0.636}\r\n\t\t{ambient 0xff2d2d37}\r\n\t\t{diffuse 0xffaf9678}\r\n\t\t{specular 0xff646464}\r\n' +
  '\t\t{color_correction\r\n\t\t\t{saturation 0.8}\r\n\t\t\t{tone 0xff000032}\r\n\t\t\t{tone_strength 0.1}\r\n\t\t\t{color_shading\r\n\t\t\t\t{shade_tone 0xff4b4b4b}\r\n\t\t\t}\r\n\t\t}\r\n\t}\r\n' +
  '\t{haze\r\n\t\t{enable}\r\n\t\t{color 0xfff5ffff}\r\n\t}\r\n}\r\n';
const GOH_PRESET = '{environment\r\n\t{light\r\n\t\t{direction 0.724 -0.015 -0.689}\r\n\t\t{ambient 0xff404040}\r\n\t\t{diffuse 0xff6a6a6a}\r\n\t\t{specularPower 5}\r\n' +
  '\t\t{color_correction\r\n\t\t\t{gamma 0.98}\r\n\t\t\t{brightness 1.4}\r\n\t\t\t{contrast 1.05}\r\n\t\t\t{saturation 1.05}\r\n\t\t\t{tone 0xff001047}\r\n\t\t\t{tone_strength 0.05}\r\n' +
  '\t\t\t{color_shading\r\n\t\t\t\t{enable}\r\n\t\t\t\t{shade_tone 0xff431300}\r\n\t\t\t\t{intensity 0.05}\r\n\t\t\t}\r\n\t\t}\r\n\t\t{rim_light\r\n\t\t\t{color 0xffffffff}\r\n\t\t\t{strength 0}\r\n\t\t}\r\n\t}\r\n}\r\n';
const BLACK_PRESET = '{environment\r\n\t{light\r\n\t\t{direction -0.78 0 -0.62}\r\n\t\t{ambient 0xff000000}\r\n\t\t{diffuse 0xff000000}\r\n\t\t{color_correction\r\n\t\t\t{gamma 0}\r\n\t\t\t{brightness 0}\r\n\t\t}\r\n\t}\r\n}\r\n';
// independent shader formula (color_tune.hlsl) for the checks
function shaderTune(c, t) {
  const sat = v => Math.max(0, Math.min(1, v));
  let r = c.map(v => Math.pow(sat((v - 0.5) * t.contrast + 0.5) * t.brightness, 1 / t.gamma));
  r = r.map((v, k) => sat(v + t.tone[k] * t.toneStrength));
  const lum = 0.2125 * r[0] + 0.7154 * r[1] + 0.0721 * r[2];
  r = r.map(v => lum + (v - lum) * t.saturation);
  if (t.shadeIntensity) { const l = 0.21 * r[0] + 0.72 * r[1] + 0.07 * r[2]; r = r.map((v, k) => v + (l * t.shadeTone[k] - v) * t.shadeIntensity); }
  return r;
}

// grass: map.grs v1 / v2 over x -600..-500, y 200..300 (grass cells 20 u, rect left -30, top 10, right -25, bottom 15),
// all patches active pattern 0 'mv_grass'; grass.set names model mv_grassmodel, its texture colour (100, 200, 50)
function grsBuf(ver) {
  const parts = [Buffer.from('GRAS', 'latin1')];
  if (ver === 2) { const b = Buffer.alloc(16); b.write('VER-', 0, 'latin1'); b.writeUInt32LE(2, 4); b.write('SEED', 8, 'latin1'); b.writeUInt32LE(1234, 12); parts.push(b); }
  const name = Buffer.from('mv_grass', 'latin1');
  const pm = Buffer.alloc(8); pm.write('PMAP', 0, 'latin1'); pm.writeInt32LE(1, 4); parts.push(pm, Buffer.from([name.length]), name);
  const r = Buffer.alloc(20); r.writeInt32LE(-30, 0); r.writeInt32LE(10, 4); r.writeInt32LE(-25, 8); r.writeInt32LE(15, 12); r.writeFloatLE(20, 16); parts.push(r);
  const n = 25, per = ver === 2 ? 5 : 4, p = Buffer.alloc(n * per);
  for (let k = 0; k < n; k++) { if (per === 4) p.writeUInt32LE(0x08000000, k * 4); else { p.writeUInt16LE(0, k * 5); p[k * 5 + 4] = 8; } }
  parts.push(p);
  return Buffer.concat(parts);
}
const GRASS_FILES = {
  'resource/set/grass.set': Buffer.from('{grass\r\n\t{"mv_grass"\r\n\t\t{models\r\n\t\t\t{"mv_grassmodel"}\r\n\t\t}\r\n\t\t{density 1}\r\n\t}\r\n}\r\n', 'latin1'),
  'resource/entity/flora/mv_grassmodel/mv_grassmodel.def': Buffer.from('{game_entity\r\n\t{Extension "mv_grassmodel.mdl"}\r\n}\r\n', 'latin1'),
  'resource/entity/flora/mv_grassmodel/01-material.mtl': Buffer.from('{material simple\r\n\t{diffuse "$/flora/mv_grasstex"}\r\n\t{blend test}\r\n}\r\n', 'latin1'),
  'resource/texture/common/flora/mv_grasstex.dds': S.dds32(4, 4, [100, 200, 50, 255]),
};

async function testForm(form) {
  const fxd = fx.make(path.join(W, 'fx-' + form), { form });
  const src0 = mk.source({ target: fxd.target, game: fxd.gameDir, mods: [], modDirs: fxd.modDirs });
  const src = wrap(src0, { [ALPHA_KEY]: alphaDds });
  const doc = mk.doc(src0, fxd.map, { entities: false });
  const grids = mk.grids(src0, fxd.map, {});
  const size = 600;
  const pl = F.plan(doc, { size });
  ok(pl.size[0] === 600 && pl.size[1] === 440 && Math.abs(pl.cell - 2) < 1e-9, form + ': plan 600 x 440, cell 2 u');
  const base = makeBase(doc, grids, size);
  const pk = fixturePack(fxd.target);
  const run = o => L4.l4(src, doc, Object.assign({ size, base, pack: pk, grids, made: 'x' }, o));

  // given light: the fx_wall shadow (draft 6)
  const rg = await run({ light: GIVEN });
  const g = rg.grid;
  const L = E.lightOf(GIVEN);
  const sh = b255(expectFlat(128, L, 0)), li = b255(expectFlat(128, L, 1));
  ok(near(pixAt(g, 115, -100).slice(0, 3), sh, 2), form + ' given light: (115, -100) in the fx_wall shadow = p3 x 0.2 / f0 ' + sh + ', got ' + pixAt(g, 115, -100));
  ok(near(pixAt(g, 140, -100).slice(0, 3), li, 2), form + ' given light: (140, -100) lit = p3 x (0.6 x 0.7071 + 0.2) / f0 ' + li + ', got ' + pixAt(g, 140, -100));
  ok(near(pixAt(g, 100, -100).slice(0, 3), li, 2), form + ' given light: the wall top (100, -100) is lit');
  ok(near(pixAt(g, 125, -100).slice(0, 3), sh, 2) && near(pixAt(g, 131, -100).slice(0, 3), li, 2), form + ' given light: the shadow ends at x 127 (125 dark, 131 lit)');
  ok(near(pixAt(g, 115, -150).slice(0, 3), li, 2), form + ' given light: past the wall end (115, -150) lit');
  ok(rg.sidecar.shadow.casters === 3 && rg.sidecar.shadow.culled === 1, form + ' casters 3 (wall, leaf, glass; unit dropped: units false; service dropped), culled 1: ' + JSON.stringify(rg.sidecar.shadow));
  ok(rg.sidecar.rung === 'l4' && rg.sidecar.layer === 'pic.l4' && rg.sidecar.base.layer === 'pic.l3' && rg.sidecar.base.from === 'given' && rg.sidecar.light.source === 'given',
    form + ' sidecar rung, layer, base, light source');
  ok(rg.sidecar.shadow.filter === 'pcf4' && Math.abs(rg.sidecar.shadow.biasU - 2 * rg.sidecar.shadow.texelU) < 1e-9 && rg.sidecar.shadow.size === 2048, form + ' shadow block');
  ok(rg.sidecar.brightness === 'unverified' && rg.sidecar.approx === (form === 'goh'), form + ' a given light is not the fitted brightness; approx only on goh: ' + rg.sidecar.approx);
  ok(rg.sidecar.detail === 'map' && rg.sidecar.keep === 0 && rg.sidecar.units === false && rg.sidecar.grass.on === false, form + ' sidecar copies detail fields and units');
  ok(rg.sidecar.mapHashes['map.ply'] === 'x', form + ' mapHashes keep the base ones');
  const hash = sha1(Buffer.from(g.data.buffer, g.data.byteOffset, g.data.byteLength));
  if (UPDATE) console.log('golden ' + form + ': ' + hash);
  else ok(hash === GOLDEN[form === 'goh' ? 'goh' : 'as2'], form + ' golden sha1 of the given-light picture: ' + hash);
  const rg2 = await run({ light: GIVEN, band: 37 });
  ok(sha1(Buffer.from(rg2.grid.data.buffer)) === hash, form + ' same bytes for another band split');

  // clean light: = pic.l3 outside shadows
  const rc = await run({});
  let same = 0, dark = 0, other = 0;
  for (let k = 0; k < rc.grid.data.length; k += 4) {
    const d = Math.abs(rc.grid.data[k] - 128);
    if (d <= 1) same++; else if (rc.grid.data[k] < 128) dark++; else other++;
  }
  ok(other === 0 && dark > 0 && dark <= rc.stats.shadowed, form + ' clean light: every pixel = pic.l3 +-1 or darker where shadowed (' + same + ' same, ' + dark + ' shadowed, ' + other + ' other)');
  ok(near(pixAt(rc.grid, 0, 0), [128, 128, 128, 255], 0) && near(pixAt(rc.grid, 115, -100).slice(0, 3), b255(expectFlat(128, E.clean(), 0)), 2), form + ' clean: (0,0) = base, (115,-100) in the wall shadow');
  ok(rc.sidecar.light.name === 'clean_daylight' && rc.sidecar.env === 'clean_daylight' && rc.sidecar.brightness === (form === 'goh' ? 'unverified' : 'fitted'), form + ' clean sidecar env and brightness');

  // straight-down sun: alpha test, blend, units, service, cull
  const rd = await run({ light: DOWN });
  const dsh = b255(expectFlat(128, E.lightOf(DOWN), 0)), dli = b255(expectFlat(128, E.lightOf(DOWN), 1));
  ok(near(pixAt(rd.grid, 205, 120).slice(0, 3), dli, 2) && near(pixAt(rd.grid, 235, 120).slice(0, 3), dsh, 2),
    form + ' alpha test: under texel alpha 0 lit ' + pixAt(rd.grid, 205, 120) + ', under alpha 255 shadow ' + pixAt(rd.grid, 235, 120));
  ok(near(pixAt(rd.grid, 220, -40).slice(0, 3), dli, 2), form + ' a blend material casts nothing');
  ok(near(pixAt(rd.grid, -50, 100).slice(0, 3), dli, 2), form + ' a unit casts nothing when pic.l3.json units is false');
  ok(near(pixAt(rd.grid, 50, 100).slice(0, 3), dli, 2), form + ' a service def casts nothing');
  ok(near(pixAt(rd.grid, 0, -300).slice(0, 3), dli, 2), form + ' the culled tiny caster casts nothing');
  const ru = await L4.l4(src, doc, { size, base: makeBase(doc, grids, size, { units: true }), pack: pk, grids, made: 'x', light: DOWN });
  ok(near(pixAt(ru.grid, -50, 100).slice(0, 3), dsh, 2) && ru.sidecar.units === true && ru.sidecar.shadow.casters === 4 && ru.sidecar.shadow.culled === 1,
    form + ' units true: the unit casts (casters ' + ru.sidecar.shadow.casters + ', culled ' + ru.sidecar.shadow.culled + ')');

  // a hole (kind 0, alpha 0) is copied
  const rh = await L4.l4(src, doc, { size, base: makeBase(doc, grids, size, { hole: true }), pack: pk, grids, made: 'x', light: GIVEN });
  ok(pixAt(rh.grid, -590, 0)[3] === 0 && rh.stats.copied > 0, form + ' kind 0 pixels copied (alpha 0 stays)');

  // --light mode on the fixture: env absent -> RENDER_ENV_MISSING, picture = clean
  const rm = await run({ light: 'mode' });
  ok(rm.sidecar.gaps.includes('RENDER_ENV_MISSING') && sha1(Buffer.from(rm.grid.data.buffer)) === sha1(Buffer.from(rc.grid.data.buffer)), form + ' --light mode, preset absent: RENDER_ENV_MISSING, picture = clean');
  ok(rm.sidecar.approx === true, form + ' a gap makes the picture approx');

  // planted presets
  const envName = (doc.modes.find(m => m.env) || {}).env;
  ok(envName === (form === 'goh' ? 'goh/multi/mv_fixture/var1' : 'multi/multi_01'), form + ' fixture env name ' + envName);
  const envKey = 'resource/set/environment/' + envName + '.set';
  const text = form === 'goh' ? GOH_PRESET : AS2_PRESET;
  const srcE = wrap(src, { [envKey]: Buffer.from(text, 'latin1') });
  const re = await L4.l4(srcE, doc, { size, base, pack: pk, grids, made: 'x', light: 'mode' });
  const lt = re.sidecar.light;
  ok(lt.source === 'mode' && !re.sidecar.gaps.length && re.sidecar.mapHashes[envKey], form + ' planted preset read: ' + JSON.stringify(re.sidecar.gaps));
  if (form === 'goh') {
    ok(near(lt.dir, [0.724, -0.015, -0.689], 1e-9) && near(lt.sun, [0x6a / 255, 0x6a / 255, 0x6a / 255], 1e-9) && near(lt.amb, [0x40 / 255, 0x40 / 255, 0x40 / 255], 1e-9), 'goh preset light block');
    ok(lt.tune && lt.tune.gamma === 0.98 && lt.tune.brightness === 1.4 && lt.tune.contrast === 1.05 && lt.tune.saturation === 1.05 && lt.tune.toneStrength === 0.05 &&
      near(lt.tune.tone, [0, 0x10 / 255, 0x47 / 255], 1e-9) && lt.tune.shadeIntensity === 0.05 && near(lt.tune.shadeTone, [0x43 / 255, 0x13 / 255, 0], 1e-9), 'goh preset tune: ' + JSON.stringify(lt.tune));
  } else {
    ok(near(lt.dir, [0.719, 0.281, -0.636], 1e-9) && near(lt.sun, [0xaf / 255, 0x96 / 255, 0x78 / 255], 1e-9) && near(lt.amb, [0x2d / 255, 0x2d / 255, 0x37 / 255], 1e-9), 'as2 preset light block');
    ok(lt.tune && lt.tune.saturation === 1 && lt.tune.gamma === 1 && near(lt.tune.tone, [1, 1, 1], 0) && lt.tune.toneStrength === 0.1 && lt.tune.shadeIntensity === 0,
      'as2 tune as the engine sets it (saturation 1, white tone x 0.1, no shade without enable): ' + JSON.stringify(lt.tune));
  }
  const want = b255(shaderTune(expectFlat(128, lt, 1), lt.tune));
  ok(near(pixAt(re.grid, 0, 0).slice(0, 3), want, 2), form + ' --light mode lit flat pixel = tune(relit) ' + want + ', got ' + pixAt(re.grid, 0, 0));
  ok(re.sidecar.brightness === 'unverified', form + ' --light mode brightness unverified');
  const srcB = wrap(src, { [envKey]: Buffer.from(BLACK_PRESET, 'latin1') });
  const rb = await L4.l4(srcB, doc, { size, base, pack: pk, grids, made: 'x', light: 'mode' });
  ok(rb.sidecar.gaps.includes('RENDER_ENV_PLACEHOLDER') && rb.sidecar.light.name === 'clean_daylight' && sha1(Buffer.from(rb.grid.data.buffer)) === sha1(Buffer.from(rc.grid.data.buffer)),
    form + ' a black preset: RENDER_ENV_PLACEHOLDER, clean daylight');
  const srcBad = wrap(src, { [envKey]: Buffer.from('{environment {light {ambient 0xff101010}}}', 'latin1') });
  const rbad = await L4.l4(srcBad, doc, { size, base, pack: pk, grids, made: 'x', light: 'mode' });
  ok(rbad.sidecar.gaps.includes('RENDER_ENV_MISSING'), form + ' planted preset with no direction: RENDER_ENV_MISSING');

  // grass
  const rgm = await run({ grass: true });
  ok(rgm.sidecar.gaps.includes('RENDER_GRASS_MISSING') && sha1(Buffer.from(rgm.grid.data.buffer)) === sha1(Buffer.from(rc.grid.data.buffer)) && rgm.sidecar.grass.on === true,
    form + ' --grass on, map.grs absent: RENDER_GRASS_MISSING, picture = grass off');
  const grsKey = 'resource/map/' + doc.key + '/map.grs';
  const srcG = wrap(src, Object.assign({ [grsKey]: grsBuf(form === 'goh' ? 2 : 1) }, GRASS_FILES));
  const rgr = await L4.l4(srcG, doc, { size, base, pack: pk, grids, made: 'x', grass: true });
  const gw = 0.35, tgt = [100, 200, 50].map(c => c / 255 * 2 * L1.GAIN * f0 * 255);
  const gwant = tgt.map(t => Math.round(128 + (t - 128) * gw));
  ok(near(pixAt(rgr.grid, -550, 250).slice(0, 3), gwant, 2), form + ' grass v' + (form === 'goh' ? 2 : 1) + ' tint at (-550, 250) ' + gwant + ', got ' + pixAt(rgr.grid, -550, 250));
  ok(near(pixAt(rgr.grid, -450, 250), [128, 128, 128, 255], 0), form + ' no grass past the footprint');
  ok(rgr.sidecar.grass.patches === 25 && rgr.sidecar.grass.active === 25 && rgr.sidecar.grass.file === 'map.grs' && !rgr.sidecar.gaps.length, form + ' grass sidecar ' + JSON.stringify(rgr.sidecar.grass));
  const cut = grsBuf(form === 'goh' ? 2 : 1).subarray(0, 60);
  const rgb = await L4.l4(wrap(src, Object.assign({ [grsKey]: cut }, GRASS_FILES)), doc, { size, base, pack: pk, grids, made: 'x', grass: true });
  ok(rgb.sidecar.gaps.includes('RENDER_GRASS_BAD'), form + ' map.grs cut short: RENDER_GRASS_BAD');

  // seeded defects
  const short = { json: pk.json, bin: pk.bin.subarray(0, pk.bin.length - 1) };
  let e = await rejects(L4.l4(src, doc, { size, base, pack: short, grids, made: 'x' }));
  ok(e instanceof mv.MvError && e.code === 'MV_FAULT' && e.exit === 2 && e.detail && e.detail.code === 'RENDER_PACK_BAD', form + ' pack.bin one byte short: RENDER_PACK_BAD exit 2');
  const flip = Buffer.from(pk.bin); flip[20] ^= 1;
  e = await rejects(L4.l4(src, doc, { size, base, pack: { json: pk.json, bin: flip }, grids, made: 'x' }));
  ok(e && e.detail && e.detail.code === 'RENDER_PACK_BAD', form + ' pack.bin one bit flipped: RENDER_PACK_BAD (sha1)');
  e = await rejects(L4.l4(src, doc, { size, base, pack: pk, grids, light: 'dusk' }));
  ok(e instanceof mv.MvError && e.code === 'MV_USAGE' && e.detail.code === 'RENDER_LIGHT', form + ' --light dusk: MV_USAGE');
  e = await rejects(L4.l4(src, doc, { size, base, pack: pk, grids, shadowSize: 100 }));
  ok(e instanceof mv.MvError && e.code === 'MV_USAGE' && e.detail.code === 'RENDER_SHADOW_SIZE', form + ' shadow size 100: MV_USAGE');
  // a base of another frame is not used: l3 is drawn again in process (a stub l3 module stands in for render/l3 here)
  {
    const l3p = require.resolve('../l3'), keep = require.cache[l3p];
    let called = 0;
    require.cache[l3p] = { id: l3p, filename: l3p, loaded: true, exports: { l3: async () => { called++; return makeBase(doc, grids, size); } } };
    try {
      const ro = await L4.l4(src, doc, { size, base: makeBase(doc, grids, 300), pack: pk, grids, made: 'x', light: GIVEN });
      ok(called === 1 && ro.sidecar.base.from === 'drawn' && (ro.sidecar.notes || []).some(t => /drawn again/.test(t)) && sha1(Buffer.from(ro.grid.data.buffer)) === hash,
        form + ' a base of another frame is not used: l3 drawn again (stub called ' + called + ', base.from ' + ro.sidecar.base.from + ')');
      require.cache[l3p].exports.l3 = async () => makeBase(doc, grids, 300);
      e = await rejects(L4.l4(src, doc, { size, base: makeBase(doc, grids, 300), pack: pk, grids, made: 'x' }));
      ok(e instanceof mv.MvError && e.code === 'MV_FAULT' && e.detail.code === 'RENDER_KERNEL', form + ' l3 giving a picture off the plan frame: RENDER_KERNEL');
    } finally { if (keep) require.cache[l3p] = keep; else delete require.cache[l3p]; }
  }
  // pack from a folder and from the frozen file names
  const pdir = path.join(W, 'pack-' + form);
  fs.mkdirSync(pdir, { recursive: true });
  fs.writeFileSync(path.join(pdir, 'pack.json'), JSON.stringify(pk.json));
  fs.writeFileSync(path.join(pdir, 'pack.bin'), pk.bin);
  const rf = await L4.l4(src, doc, { size, base, pack: pdir, grids, made: 'x', light: GIVEN });
  ok(sha1(Buffer.from(rf.grid.data.buffer)) === hash, form + ' pack read from a folder = the same picture');
  // the object pack.js readPack returns (what cli.js packIn and the jobs route hand l4)
  const PJ = require('../pack');
  const rr = await L4.l4(src, doc, { size, base, pack: PJ.readPack(pdir), grids, made: 'x', light: GIVEN });
  ok(sha1(Buffer.from(rr.grid.data.buffer)) === hash, form + ' pack given as pack.js readPack(dir) = the same picture');
  const rr2 = await L4.l4(src, doc, { size, base, pack: PJ.readPack({ json: pk.json, bin: pk.bin }), grids, made: 'x', light: GIVEN });
  ok(sha1(Buffer.from(rr2.grid.data.buffer)) === hash, form + ' pack given as pack.js readPack({json, bin}) = the same picture');
  e = await rejects(L4.l4(src, doc, { size, base, pack: Object.assign({}, PJ.readPack(pdir), { inst: { count: 3 } }), grids, made: 'x' }));
  ok(e instanceof mv.MvError && e.code === 'MV_FAULT' && e.detail.code === 'RENDER_PACK_BAD', form + ' a read pack with broken inst columns: RENDER_PACK_BAD, not a plain error');
  // the CLI route the jobs runner takes (recon -> l4 need): `render l4 --in D` with pack.json + pack.bin and pic.l3 in D
  // gives the in-process bytes; a pack.bin cut short is RENDER_PACK_BAD exit 2 (the recon fault was a plain TypeError)
  {
    const gf = require(path.join(MVDIR, 'lib/raster/gridfile'));
    gf.write(path.join(pdir, 'pic.l3.mvg'), base.grid);
    fs.writeFileSync(path.join(pdir, 'pic.l3.json'), JSON.stringify(base.sidecar));
    gf.write(path.join(pdir, 'l3.n.mvg'), base.aux.n);
    gf.write(path.join(pdir, 'l3.z.mvg'), base.aux.z);
    const common = ['--target', fxd.target, '--game', fxd.gameDir, '--mod-dir', fxd.modDirs[0], '--map', fxd.map, '--size', String(size)];
    const out = path.join(W, 'cli-l4-' + form);
    let c = cli(['render', 'l4'].concat(common, ['--in', pdir, '--out', out, '--json']));
    let j = jsonOf(c.out);
    ok((c.code === 0 || c.code === 1) && j && j.w === 600 && fs.existsSync(path.join(out, 'pic.l4.mvg')), form + ' cli l4 --in (pack.json + pack.bin, pic.l3): exit ' + c.code + ' ' + c.err.trim().slice(-300));
    if (j && fs.existsSync(path.join(out, 'pic.l4.mvg'))) {
      const docE = mk.doc(src0, fxd.map, { entities: true });
      const rc = await L4.l4(src0, docE, { size, base: Object.assign({ from: 'in' }, base), pack: PJ.readPack(pdir), made: 'x' });
      const gc = gf.read(path.join(out, 'pic.l4.mvg'));
      const sc = JSON.parse(fs.readFileSync(path.join(out, 'pic.l4.json'), 'utf8'));
      ok(sha1(Buffer.from(gc.data.buffer, gc.data.byteOffset, gc.data.byteLength)) === sha1(Buffer.from(rc.grid.data.buffer, rc.grid.data.byteOffset, rc.grid.data.byteLength)) &&
        sc.base.from === 'in' && sc.light.source === 'clean', form + ' cli l4 --in = in process with the readPack form, byte for byte; base from in, clean light');
    }
    const bdir = path.join(W, 'pack-short-' + form);
    fs.mkdirSync(bdir, { recursive: true });
    fs.writeFileSync(path.join(bdir, 'pack.json'), JSON.stringify(pk.json));
    fs.writeFileSync(path.join(bdir, 'pack.bin'), pk.bin.subarray(0, pk.bin.length - 1));
    c = cli(['render', 'l4'].concat(common, ['--in', bdir, '--out', path.join(W, 'cli-l4b-' + form), '--json']));
    j = jsonOf(c.out);
    ok(c.code === 2 && j && j.error && j.error.detail && j.error.detail.code === 'RENDER_PACK_BAD', form + ' seeded: cli l4 --in with pack.bin one byte short: exit 2 RENDER_PACK_BAD, got ' + c.code + ' ' + c.out.slice(0, 200));
  }

  // a two-part geom that is not the first geom: both parts cast (part iOff relative to the geom)
  const mp = makePack({ target: fxd.target, materials: [{ id: 0, tex: null, lm: null, blend: 'none', alpharef: 128, a2c: false, color: [255, 255, 255, 255], scale: 2, noLight: false }],
    defs: [{ def: 'mv_one', state: 'drawn', geoms: [{ mesh: boxMesh(-5, -5, 0, 5, 5, 20), mat: 0 }], inst: [{ uid: 0x3001, m: mat(-450, 350, 0, 0, 1) }] },
      { def: 'mv_two', state: 'drawn', geoms: [{ mesh: joinMesh(boxMesh(-5, -5, 0, 5, 5, 20), boxMesh(195, -5, 0, 205, 5, 20)), parts: [{ mat: 0, iOff: 0, iCount: 36 }, { mat: 0, iOff: 36, iCount: 36 }] }],
        inst: [{ uid: 0x3002, m: mat(0, 350, 0, 0, 1) }] }] });
  for (const [nm, pack] of [['{json, bin}', mp], ['readPack', PJ.readPack({ json: mp.json, bin: mp.bin })]]) {
    const r2 = await L4.l4(src, doc, { size, base, pack, grids, made: 'x', light: DOWN });
    ok(near(pixAt(r2.grid, -450, 350).slice(0, 3), dsh, 2) && near(pixAt(r2.grid, 0, 350).slice(0, 3), dsh, 2) && near(pixAt(r2.grid, 200, 350).slice(0, 3), dsh, 2) &&
      near(pixAt(r2.grid, 100, 350).slice(0, 3), dli, 2) && r2.stats.casterTris === 12 + 24,
      form + ' two-part geom (' + nm + '): geom 0, part A and part B each cast once: ' + [pixAt(r2.grid, 0, 350), pixAt(r2.grid, 200, 350), r2.stats.casterTris].join(' '));
  }

  // grazing ground: the ridge's east slope (31 deg, below the clean sun's 41.5 deg in x-z) is lit, only the ground casting
  const rr3 = await L4.l4(src, doc, { size, base: makeBase(doc, grids, size, { ridge: true, noWall: true }), pack: EMPTY_PACK, grids, made: 'x' });
  {
    let bad = 0, tot = 0, minv = 255;
    for (let j = 0; j < rr3.grid.h; j++) for (let i = 0; i < rr3.grid.w; i++) {
      const x = rr3.grid.ox + (i + 0.5) * rr3.grid.cell, y = rr3.grid.oy + (j + 0.5) * ((rr3.grid.meta && rr3.grid.meta.cellY) || rr3.grid.cell);
      if (x < -190 || x > -110 || Math.abs(y) > 300) continue;
      const v = rr3.grid.data[(j * rr3.grid.w + i) * 4]; tot++;
      if (Math.abs(v - 128) > 1) bad++; if (v < minv) minv = v;
    }
    ok(tot > 1000 && bad === 0, form + ' clean light: the ridge east slope (x -190..-110) is lit, no acne: ' + bad + ' of ' + tot + ' off, min ' + minv);
  }
  // an empty shadow map: nothing counts as shadowed
  const rr4 = await L4.l4(src, doc, { size, base, pack: EMPTY_PACK, grids: {}, made: 'x', light: GIVEN });
  ok(rr4.stats.shadowed === 0 && rr4.stats.lit > 0, form + ' empty shadow map: shadowed 0 (got ' + rr4.stats.shadowed + ')');
  // foliage leaning away from the clean sun: clean light gives p3 back (translucency divided out at the bake light)
  {
    const Ls = E.worldSun(E.clean()), v = [-Ls[0], -Ls[1], 0.3], h = Math.hypot(...v);
    const nb = v.map(c => Math.round((c / h + 1) * 127.5));
    const rf5 = await L4.l4(src, doc, { size, base: makeBase(doc, grids, size, { kind: 5, normal: nb, noWall: true }), pack: EMPTY_PACK, grids: {}, made: 'x' });
    let off = 0;
    for (let k = 0; k < rf5.grid.data.length; k += 4) if (Math.abs(rf5.grid.data[k] - 128) > 1) off++;
    ok(off === 0, form + ' clean light on foliage leaning away from the sun = pic.l3 +-1 (' + off + ' off, first ' + pixAt(rf5.grid, 0, 0) + ')');
    const rf6 = await L4.l4(src, doc, { size, base: makeBase(doc, grids, size, { kind: 5, normal: nb, noWall: true }), pack: EMPTY_PACK, grids: {}, made: 'x', light: DOWN });
    ok(pixAt(rf6.grid, 0, 0)[0] !== 128, form + ' foliage under another light still changes (translucency kept): ' + pixAt(rf6.grid, 0, 0));
  }
  return { src, doc, grids, base, pk, hash };
}

async function testPool(t) {
  const r = await L4.l4(t.src, t.doc, { size: 600, base: t.base, pack: t.pk, grids: t.grids, made: 'x', light: GIVEN, pool: 2, band: 128, workDir: W });
  ok(sha1(Buffer.from(r.grid.data.buffer)) === t.hash && r.stats.pool, 'pool of 2 children (mapviz work render/l4tile) = in-process bytes');
}

function testUnits() {
  // tune identity, the as2 white-tone rule, light objects, the sun vector
  const c = K.tune(0.25, 0.5, 0.75, null);
  ok(c[0] === 0.25 && c[1] === 0.5 && c[2] === 0.75, 'tune null = identity');
  const t2 = { gamma: 1, brightness: 1, contrast: 1, saturation: 1, tone: [1, 1, 1], toneStrength: 0.1, shadeIntensity: 0 };
  ok(near(K.tune(0.5, 0.5, 0.5, t2), [0.6, 0.6, 0.6], 1e-12), 'as2 tune: + 0.1 white');
  const sh = { gamma: 1, brightness: 1, contrast: 1, saturation: 1, tone: [0, 0, 0], toneStrength: 0, shadeTone: [1, 0, 0], shadeIntensity: 1 };
  ok(near(K.tune(0.5, 0.5, 0.5, sh), [0.5, 0, 0], 1e-12), 'colour shade replaces with lum x shade tone');
  ok(near(E.worldSun({ dir: [1, 0, -1] }), [-Math.SQRT1_2, 0, Math.SQRT1_2], 1e-12) && near(E.worldSun({ dir: [0, 1, -1] }), [0, Math.SQRT1_2, Math.SQRT1_2], 1e-12),
    'world sun = normalize(-dir x, +dir y, -dir z)');
  ok(near(E.worldSun({ dir: [1, 0, 0] }), [0, 0, 1], 0), 'a sun on the horizon shines straight down');
  ok(E.lightOf({ dir: [1, 0], sun: 1, amb: 0 }) === null && E.lightOf({ dir: [0, 0, 0], sun: 1, amb: 0 }) === null && E.lightOf(GIVEN).sun.length === 3, 'lightOf refuses a bad light');
  // 0.5611 for an exact up normal; the byte normal (128, 128, 255) leans a hair: 0.5601
  ok(Math.abs(0.601 * E.worldSun(E.CLEAN)[2] + 0.179 - 0.5611) < 0.0005,'f0 at an exact flat cell 0.5611');
  ok(Math.abs(f0 - 0.5601) < 0.0005, 'f0 of the byte normal 0.5601: ' + f0.toFixed(4));
  ok(L4.parseGrs(Buffer.from('GRAX')).error && L4.parseGrs(grsBuf(1)).active === 25 && L4.parseGrs(grsBuf(2)).ver === 2, 'map.grs parse: tag, v1, v2');
}

// ------------------------------------------------------------------ real installs
function installs() {
  if (process.env.MAPVIZ_NO_GAME === '1') return {};
  const gd = require(path.join(MVDIR, '../lib/gamedir'));
  const out = {};
  try { const r = gd.resolve({}); if (r && r.dir && fs.existsSync(path.join(r.dir, 'resource', 'map.pak'))) { out.mowas2 = r.dir; out.as64 = r.dir; } } catch (e) { /* none */ }
  try { const g = gd.goh(); if (g && fs.existsSync(path.join(g, 'resource', 'map', 'multi.pak'))) out.goh = g; } catch (e) { /* none */ }
  return out;
}
const REAL = { mowas2: 'multi/1v1_road', as64: 'multi/1v1_road', goh: 'multi/1v1_balzerweg' };
const RSIZE = Number(process.env.MAPVIZ_RENDER_SIZE) || 1024;
// l3.n and l3.z from the height grid (kind 1 where the l1 picture has ground)
function groundBase(l1r, grids) {
  const g = l1r.grid, Wd = g.w, Hd = g.h, cy = (g.meta && g.meta.cellY) || g.cell, h = grids.height;
  const n = new Uint8ClampedArray(Wd * Hd * 4), z = new Float32Array(Wd * Hd);
  const d = Math.max(h.cell, g.cell);
  for (let j = 0; j < Hd; j++) for (let i = 0; i < Wd; i++) {
    const x = g.ox + (i + 0.5) * g.cell, y = g.oy + (j + 0.5) * cy, k = j * Wd + i;
    const zc = mk.heightAt(h, x, y);
    if (zc === null || g.data[k * 4 + 3] === 0) { z[k] = -32768; continue; }
    const hx = (mk.heightAt(h, x + d, y) ?? zc) - (mk.heightAt(h, x - d, y) ?? zc), hy = (mk.heightAt(h, x, y + d) ?? zc) - (mk.heightAt(h, x, y - d) ?? zc);
    let nx = -hx / (2 * d), ny = -hy / (2 * d), nz = 1; const nn = Math.hypot(nx, ny, nz); nx /= nn; ny /= nn; nz /= nn;
    n[k * 4] = Math.round((nx + 1) * 127.5); n[k * 4 + 1] = Math.round((ny + 1) * 127.5); n[k * 4 + 2] = Math.round((nz + 1) * 127.5); n[k * 4 + 3] = 1;
    z[k] = zc;
  }
  const mkg = (name, etype, data, extra) => Object.assign({ name, w: Wd, h: Hd, cell: g.cell, ox: g.ox, oy: g.oy, etype, sample: 'cell', scale: 1, offset: 0, nodata: null,
    meta: Object.assign({}, g.meta && g.meta.cellY ? { cellY: g.meta.cellY } : {}) , data }, extra || {});
  return { grid: Object.assign({}, g, { name: 'pic.l3' }), aux: { n: mkg('l3.n', 'rgba8', n), z: mkg('l3.z', 'f32', z, { nodata: -32768 }) },
    sidecar: Object.assign({}, l1r.sidecar, { layer: 'pic.l3', rung: 'l3', units: false }) };
}
const EMPTY_PACK = (() => { const p = makePack({ defs: [] }); return p; })();

async function testReal() {
  const have = installs();
  const ts = Object.keys(REAL).filter(t => have[t]);
  if (!ts.length) { console.log('skip real: ' + (process.env.MAPVIZ_NO_GAME === '1' ? 'MAPVIZ_NO_GAME=1' : 'no MoW:AS2 / AS64 / GoH install found')); return; }
  for (const t of Object.keys(REAL)) if (!have[t]) console.log('skip ' + t + ': no install');
  const l3built = fs.existsSync(path.join(__dirname, '..', 'l3.js')) && fs.existsSync(path.join(__dirname, '..', 'pack.js'));
  if (!l3built) console.log('skip real l3 and pack: l3.js or pack.js not built yet; l4 runs on the l1 ground with an empty pack');
  for (const t of ts) {
    const key = REAL[t];
    let src, doc, grids;
    try { src = mk.source({ target: t, game: have[t] }); doc = mk.doc(src, key, { entities: l3built }); grids = mk.grids(src, key, {}); } catch (e) { ok(false, t + ' ' + key + ': read ' + (e.code || e.message)); continue; }
    const tm = Date.now();
    let base = null, pack = EMPTY_PACK;
    if (l3built) {
      try {
        const P = require('../pack'), L3 = require('../l3');
        const pr = await P.pack(src, doc, { made: 'x' });
        pack = { json: pr.json, bin: pr.bin };
        base = await L3.l3(src, doc, { size: RSIZE, pack: pr.pack || pack, grids, made: 'x' });
      } catch (e) { console.log('note ' + t + ': l3 or pack failed (' + (e.code || '') + ' ' + String(e.message).slice(0, 200) + '); the l1 ground is used'); base = null; pack = EMPTY_PACK; }
    }
    if (!base) base = groundBase(await L1.l1(src, doc, { size: RSIZE, made: 'x' }), grids);
    const tb = Date.now();
    const r = await L4.l4(src, doc, { size: RSIZE, base, pack, grids, made: 'x', light: 'mode', grass: true });
    const s = r.sidecar, g = r.grid;
    let sum = 0, n = 0, opaque = 0;
    for (let k = 0; k < g.data.length; k += 4) if (g.data[k + 3] === 255) { sum += 0.299 * g.data[k] + 0.587 * g.data[k + 1] + 0.114 * g.data[k + 2]; n++; opaque++; }
    const mean = n ? sum / n : 0;
    const frac = r.stats.shadowed / Math.max(1, r.stats.shadowed + r.stats.lit);
    console.log(t + ' ' + key + ' l4 ' + g.w + 'x' + g.h + ': light ' + s.light.name + ' (' + s.light.source + '), gaps ' + JSON.stringify(s.gaps) + ', mean lum ' + mean.toFixed(1) +
      ', shadowed ' + (100 * frac).toFixed(2) + ' %, casters ' + s.shadow.casters + ' culled ' + s.shadow.culled + ', texel ' + s.shadow.texelU.toFixed(2) + ' u, grass ' +
      JSON.stringify(Object.assign({}, r.stats.grass)) + ', base ' + ((tb - tm) / 1000).toFixed(1) + ' s, l4 ' + (r.stats.ms / 1000).toFixed(1) + ' s (shadow ' + (r.stats.msShadow / 1000).toFixed(1) + ' s)');
    ok(Math.max(g.w, g.h) === RSIZE && s.rung === 'l4' && s.target === t, t + ' l4 frame and sidecar');
    ok(mean > 15 && mean < 240 && opaque > 0.9 * g.w * g.h, t + ' l4 mean luminance sane ' + mean.toFixed(1));
    ok(frac >= 0 && frac < 0.6, t + ' shadowed share under 60 %: ' + (100 * frac).toFixed(2));
    ok(r.stats.groundTris > 1000, t + ' ground casters from the height grid: ' + r.stats.groundTris);
    if (t === 'goh') ok(s.light.source === 'mode' || s.gaps.includes('RENDER_ENV_PLACEHOLDER') || s.gaps.includes('RENDER_ENV_MISSING'), 'goh light from the mode preset or a named gap');
    else ok(s.light.source === 'mode' && near(s.light.dir, [0.719, 0.281, -0.636], 1e-6) && s.light.tune && s.light.tune.toneStrength === 0.1, t + ' light from multi_01: ' + JSON.stringify(s.light.dir));
    ok(s.grass.on && (s.grass.active > 0 || s.gaps.includes('RENDER_GRASS_MISSING')), t + ' grass read: ' + JSON.stringify(s.grass));
    if (s.grass.active > 0) ok(r.stats.grass.colours > 0 && r.stats.grass.pixels > 0, t + ' grass colours found and pixels tinted: ' + r.stats.grass.colours + ' / ' + r.stats.grass.pixels);
  }
  // GoH black presets: the placeholder rule on the real file
  if (have.goh) {
    const src = mk.source({ target: 'goh', game: have.goh });
    const r = E.envLight(src, { modes: [{ id: 'x', env: 'goh/black' }] }, 'x');
    ok(r.gaps.includes('RENDER_ENV_PLACEHOLDER') && r.light.name === 'clean_daylight', 'goh goh/black -> RENDER_ENV_PLACEHOLDER');
  }
}

(async () => {
  testUnits();
  const a = await testForm('as2');
  await testForm('goh');
  await testPool(a);
  await testReal();
})().catch(e => ok(false, 'threw: ' + (e && e.stack || e))).then(() => {
  if (fail) { console.log(fail + ' failed, ' + pass + ' passed (scratch ' + W + ')'); process.exit(1); }
  if (OWN) { try { fs.rmSync(W, { recursive: true, force: true }); } catch (e) { /* temp */ } }
  console.log('PASS mapviz render l4 (' + pass + ')');
});

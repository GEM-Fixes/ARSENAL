// render l3 (MV-R2, builder R2b): the objects of a map drawn from straight above over pic.l2 (freeze render.md 2.1, 3.1,
// 3.2, 4.3; design 7 L3). Same code for as64, mowas2 and goh (the pack carries the GoH lightmaps; brightness 'unverified'
// on goh until G8).
//   l3(src, doc, o) -> Promise<{grid ('pic.l3'), sidecar, aux:{n ('l3.n'), z ('l3.z')}, stats}>
//     o = {size (2048), mode?, base? (an l2 result {grid, sidecar?, aux:{n, z}, from?}), pack? (readPack result or a
//          pack() result), units? (false), grids? ({height}), pool? (n | pool), band? (rows, 256), progress?,
//          cancelFlag?, made?}
//     base: used when its frame (w, h, box, cell, cellY) is the plan's; else l2 is drawn again in process (never
//     resampled; note), or MV_NOT_BUILT (detail.code RENDER_NOT_BUILT, rung 'l2') when l2.js is absent.
//     pack: o.pack, else pack() in process (from 'built').
//   KERNEL = 'render/l3tile'
//   textureLevel(size, levels, uvu, footU) -> mip level drawn for an object texture (l1 lodFor, tiling 1, the finer level)
// Kinds of l3.n alpha: 0 none, 1 ground, 2 decal, 3 water (from l2.n), 4 object, 5 foliage, 6 unit.
// Author: Imperator_Aug (ARSENAL, ia-fe42dbcb)
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
const F = require('./frame');

const KERNEL = 'render/l3tile';
const NODATA = -32768;
const KINDS = ['none', 'ground', 'decal', 'water', 'object', 'foliage', 'unit'];
const MAX_TEX = 2048;   // largest decoded object texture side [I]

function mv() { return require('../mapviz'); }
const sha1 = b => crypto.createHash('sha1').update(b).digest('hex');

function textureLevel(size, levels, uvu, footU) {
  return require('./l1').lodFor(size, levels, 1, uvu, footU).a;
}

function sameFrame(g, pl) {
  if (!g || !pl) return false;
  const cy = g.meta && g.meta.cellY > 0 ? g.meta.cellY : g.cell;
  const e = 1e-9 * Math.max(1, Math.abs(pl.cell));
  return g.w === pl.size[0] && g.h === pl.size[1] && Math.abs(g.ox - pl.box[0]) <= e * 10 && Math.abs(g.oy - pl.box[1]) <= e * 10 &&
    Math.abs(g.cell - pl.cell) <= e && Math.abs(cy - pl.cellY) <= e;
}
function baseUsable(b, pl) {
  return !!(b && b.grid && b.grid.etype === 'rgba8' && sameFrame(b.grid, pl) && b.aux && b.aux.n && b.aux.z &&
    b.aux.n.etype === 'rgba8' && b.aux.z.etype === 'f32' && b.aux.n.w === b.grid.w && b.aux.n.h === b.grid.h && b.aux.z.w === b.grid.w && b.aux.z.h === b.grid.h);
}

// texel density of one geom part: uv units per world unit (sqrt of the area ratio over its triangles, 3D areas) of one
// uv set (U: pk.uv0 for the diffuse texture, pk.uv1 for the GoH lightmap, which the kernel samples with uv1)
function uvuOf(pk, g, part, U) {
  const P = pk.pos, I = pk.idx;
  U = U || pk.uv0;
  let wa = 0, ua = 0;
  for (let t = 0; t < part.iCount; t += 3) {
    const q = g.iOff + part.iOff + t;
    const a = g.vOff + I[q], b = g.vOff + I[q + 1], c = g.vOff + I[q + 2];
    const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
    const vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
    wa += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
    ua += Math.abs((U[b * 2] - U[a * 2]) * (U[c * 2 + 1] - U[a * 2 + 1]) - (U[c * 2] - U[a * 2]) * (U[b * 2 + 1] - U[a * 2 + 1]));
  }
  return wa > 0 ? Math.sqrt(ua / wa) : 0;
}

// decode one object texture at its level -> {w, h, data} | {error}. dds, tga, bmp and png are decoded; jpg has no reader in
// tools (node only), so pack.js lists a jpg texture as not readable and both report RENDER_OBJ_TEXTURE [I].
function decodeTex(io, key, uvu, footU) {
  const buf = io.read(key);
  if (!buf) return { error: 'missing' };
  const ext = key.slice(key.lastIndexOf('.') + 1);
  try {
    if (ext === 'dds') {
      const dds = require('../../lib/model/dds');
      const info = dds.parse(buf);
      if (info.error) return { error: info.error };
      const L1 = require('./l1');
      const have = L1.fileLevels(info, buf.length), full = L1.chainLevels(info.width, info.height);
      const lv = uvu > 0 ? textureLevel(Math.max(info.width, info.height), full, uvu, footU) : 0;
      const want = Math.max(1, Math.max(info.width, info.height) >> lv);
      const d = dds.decode(buf, { mip: Math.min(lv, Math.max(0, have - 1)) });
      if (d.error) return { error: d.error };
      let rgba = d.rgba, w = d.width, h = d.height;
      const cap = Math.min(want, MAX_TEX);
      if (Math.max(w, h) > cap) { const s = dds.downscale(rgba, w, h, cap); rgba = s.rgba; w = s.width; h = s.height; }
      return { w, h, data: new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.length), level: lv };
    }
    if (ext === 'tga' || ext === 'bmp' || ext === 'png') {
      // tga and bmp through tools/lib (tga, picture.decode), png through the mapviz png reader; then one size rule
      let d;
      if (ext === 'tga') d = require('../../lib/model/tga').decode(buf);
      else if (ext === 'bmp') d = require('../../lib/model/picture').decode('bmp', buf);
      else { const p = require('../lib/raster/png').decode(buf); d = { width: p.w, height: p.h, rgba: p.rgba }; }
      if (d.error || !d.rgba) return { error: d.error || 'unreadable' };
      let rgba = d.rgba, w = d.width, h = d.height;
      const lv = uvu > 0 ? textureLevel(Math.max(w, h), require('./l1').chainLevels(w, h), uvu, footU) : 0;
      const cap = Math.min(Math.max(1, Math.max(w, h) >> lv), MAX_TEX);
      if (Math.max(w, h) > cap) { const s = require('../../lib/model/dds').downscale(rgba, w, h, cap); rgba = s.rgba; w = s.width; h = s.height; }
      return { w, h, data: new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.length), level: lv };
    }
    return { error: ext + ' object textures are not decoded' };
  } catch (e) { return { error: String(e && e.message || e) }; }
}

function memIo(grids, prog) {
  return {
    readGrid: f => { const g = grids.get(f); if (!g) throw new Error('render/l3: no grid ' + f); return g; },
    writeGrid: (f, g) => { grids.set(f, g); },
    progress: prog || { check() {}, stage() {}, step() {}, set() {} },
  };
}
const fgrid = (name, w, h, data, etype, nodata) => ({ name, w, h, cell: 1, ox: 0, oy: 0, etype, sample: 'cell', scale: 1, offset: 0, nodata: nodata == null ? null : nodata, meta: {}, data });

async function l3(src, doc, o) {
  o = o || {};
  const M = mv();
  if (!src || typeof src.read !== 'function') throw new M.MvError('MV_USAGE', 'render l3 needs a mapkit source', { code: 'RENDER_SRC' });
  if (!doc || !doc.key) throw new M.MvError('MV_USAGE', 'render l3 needs the mapdoc of the map', { code: 'RENDER_DOC' });
  const prog = o.progress || null;
  const t0 = Date.now();
  const size = F.checkSize(o.size === undefined ? 2048 : o.size);
  const pl = F.plan(doc, { size });
  const W = pl.size[0], H = pl.size[1];
  const L1 = require('./l1');
  const target = L1.targetOf(src);
  const goh = target === 'goh';
  const notes = [];
  // base (pic.l2 + l2.n + l2.z)
  let base = o.base, baseFrom;
  if (base && baseUsable(base, pl)) baseFrom = base.from === 'in' ? 'in' : 'given';
  else {
    if (base) notes.push({ code: 'RENDER_BASE_REDRAWN', text: 'the given pic.l2 is not on the plan frame (' + W + ' x ' + H + ' px, cell ' + pl.cell + '): drawn again, not resampled' });
    const l2m = M.opt(() => require('./l2'), './l2', __filename);
    if (!l2m) throw new M.MvError('MV_NOT_BUILT', 'render l2 is not built yet (l3 needs pic.l2)', { code: 'RENDER_NOT_BUILT', rung: 'l2' });
    base = await l2m.l2(src, doc, { size, mode: o.mode, grids: o.grids, pool: o.pool, progress: prog, cancelFlag: o.cancelFlag, made: o.made });
    baseFrom = 'drawn';
  }
  const bsc = base.sidecar || {};
  // scene pack
  let pk = o.pack, packFrom;
  if (pk && pk.pack && pk.json) pk = pk.pack;
  if (pk && pk.inst && pk.pos) packFrom = pk.from === 'in' ? 'in' : 'given';
  else {
    if (prog) prog.stage('build', 1);   // stage words: only read, defs, build, draw, write (render.md 2.3)
    pk = require('./pack').pack(src, doc, { mode: o.mode, grids: o.grids, progress: prog, cancelFlag: o.cancelFlag, made: o.made }).pack;
    packFrom = 'built';
  }
  if (prog) prog.check();
  const units = !!o.units;
  const gaps = new Set((bsc.gaps || []).concat(pk.gaps || []));
  // which instances are drawn
  const geoms = pk.geoms || [], defs = pk.defs || [];
  const defRow = new Map(defs.map(d => [d.def, d]));
  const keep = [];
  for (let i = 0; i < pk.inst.count; i++) {
    const g = geoms[pk.inst.geom[i]];
    if (!g) continue;
    const fl = pk.inst.flags[i];
    const d = defRow.get(g.def);
    const st = d ? d.state : 'drawn';
    if (st !== 'drawn' && st !== 'unit' && st !== 'skinned') continue;
    if (!units && ((fl & 3) || st === 'unit' || st === 'skinned')) continue;
    const cls = (fl & 1) || st === 'unit' || st === 'skinned' || (fl & 2) ? 2 : d && (d.category === 'tree' || d.category === 'bush') ? 1 : 0;
    keep.push({ i, cls });
  }
  // objects line: drawn instances, skipped by state (units / skinned skipped unless --units)
  const skipped = {};
  for (const d of defs) {
    if (d.state === 'drawn') continue;
    if (units && (d.state === 'unit' || d.state === 'skinned')) continue;
    skipped[d.state] = (skipped[d.state] || 0) + (d.instances || 0);
  }
  const failedDefs = defs.filter(d => d.state === 'failed').length;
  // textures: one decode per pack texture at the finest level its parts need
  const footU = Math.min(pl.cell, pl.cellY) / L1.SS;
  const usedG = new Set(keep.map(k => pk.inst.geom[k.i]));
  const uvuTex = new Map();
  for (const gi of usedG) {
    const g = geoms[gi];
    for (const p of g.parts) {
      const m = pk.materials[p.mat];
      if (!m) continue;
      if (m.tex !== null && m.tex !== undefined) uvuTex.set(m.tex, Math.max(uvuTex.get(m.tex) || 0, uvuOf(pk, g, p, pk.uv0)));
      if (goh && m.lm !== null && m.lm !== undefined) uvuTex.set(m.lm, Math.max(uvuTex.get(m.lm) || 0, uvuOf(pk, g, p, pk.uv1)));
    }
  }
  const ec = require('../entcat');
  const L = ec.loaderFor(src);
  const io = require('./texmod').ioOf(L);
  const grids = new Map();
  const texIndex = new Map();
  const texList = [];
  let texRead = 0, texMissing = 0;
  const mapHashes = Object.assign({}, bsc.mapHashes || {}, pk.mapHashes || {});
  if (prog) prog.stage('read', uvuTex.size);
  for (const [t, u] of [...uvuTex].sort((a, b) => a[0] - b[0])) {
    if (prog) prog.check();
    const te = pk.textures[t];
    const d = te ? decodeTex(io, te.key, u, footU) : { error: 'no texture ' + t };
    if (d.error) {
      texMissing++;
      gaps.add('RENDER_OBJ_TEXTURE');
      if (notes.length < 50) notes.push({ code: 'RENDER_OBJ_TEXTURE', text: 'object texture ' + (te ? te.key : t) + ' cannot be decoded (' + d.error + '); drawn flat' });
    } else {
      texRead++;
      const f = 'tex-' + t + '.mvg';
      grids.set(f, fgrid('tex', d.w, d.h, d.data, 'rgba8'));
      texIndex.set(t, texList.length);
      texList.push(f);
      if (!mapHashes[te.key]) { const b = io.read(te.key); if (b) mapHashes[te.key] = sha1(b); }
    }
    if (prog) prog.step(1);
  }
  // kernel inputs
  const mats = (pk.materials || []).map(m => ({ tex: texIndex.has(m.tex) ? texIndex.get(m.tex) : -1, lm: goh && texIndex.has(m.lm) ? texIndex.get(m.lm) : -1,
    blend: m.blend, alpharef: m.alpharef, a2c: !!m.a2c, color: m.color, noLight: !!m.noLight }));
  const nInst = keep.length;
  const instF = new Float32Array(nInst * 12), instI = new Uint32Array(nInst * 2);
  keep.forEach((k, q) => {
    for (let j = 0; j < 12; j++) instF[q * 12 + j] = pk.inst.m[k.i * 12 + j];
    instI[q * 2] = pk.inst.geom[k.i]; instI[q * 2 + 1] = k.cls;
  });
  const nv = pk.pos.length / 3, ni = pk.idx.length / 3;
  grids.set('base.mvg', base.grid);
  grids.set('bn.mvg', base.aux.n);
  grids.set('bz.mvg', base.aux.z);
  const args = {
    W, H, x0: pl.box[0], yb: pl.box[1], sx: pl.cell, sy: pl.cellY, ss: L1.SS, gain: L1.GAIN, sun: L1.LIGHT.sun, amb: L1.LIGHT.amb,
    L: (() => { const d = L1.LIGHT.dir, l = Math.hypot(d[0], d[1], d[2]); return [-d[0] / l, d[1] / l, -d[2] / l]; })(),
    base: 'base.mvg', bn: 'bn.mvg', bz: 'bz.mvg', texs: texList, mats,
    geoms: geoms.map(g => ({ vOff: g.vOff, vCount: g.vCount, iOff: g.iOff, iCount: g.iCount, parts: g.parts, box: g.box })),
  };
  if (nInst && nv && ni) {
    grids.set('pos.mvg', fgrid('pos', 3, nv, new Float32Array(pk.pos), 'f32'));
    grids.set('nrm.mvg', fgrid('nrm', 3, nv, new Float32Array(pk.nrm), 'f32'));
    grids.set('uv0.mvg', fgrid('uv0', 2, nv, new Float32Array(pk.uv0), 'f32'));
    grids.set('uv1.mvg', fgrid('uv1', 2, nv, new Float32Array(pk.uv1), 'f32'));
    grids.set('idx.mvg', fgrid('idx', 3, ni, new Uint32Array(pk.idx), 'u32'));
    grids.set('inst.mvg', fgrid('inst', 12, nInst, instF, 'f32'));
    grids.set('insti.mvg', fgrid('insti', 2, nInst, instI, 'u32'));
    Object.assign(args, { pos: 'pos.mvg', nrm: 'nrm.mvg', uv0: 'uv0.mvg', uv1: 'uv1.mvg', idx: 'idx.mvg', inst: 'inst.mvg', insti: 'insti.mvg' });
  }
  // draw
  const data = new Uint8ClampedArray(W * H * 4), ndata = new Uint8ClampedArray(W * H * 4), zdata = new Float32Array(W * H);
  let objPx = 0, bands = 0, poolN = 0;
  if (!args.inst) {
    // nothing to draw: the base as it is
    data.set(base.grid.data); ndata.set(base.aux.n.data); zdata.set(base.aux.z.data);
  } else {
    const bandRows = o.band > 0 ? Math.floor(o.band) : 256;
    const list = [];
    for (let y = 0; y < H; y += bandRows) list.push([y, Math.min(H, y + bandRows)]);
    bands = list.length;
    if (prog) prog.stage('draw', list.length);
    let pool = null, ownPool = false;
    if (o.pool && typeof o.pool === 'object' && typeof o.pool.run === 'function') pool = o.pool;
    else if (Number(o.pool) > 0) { pool = require('../jobs/pool').create({ n: Number(o.pool), cancelFlag: o.cancelFlag }); ownPool = true; }
    const results = new Map();
    if (!pool) {
      const k = require('./l3tile'), mio = memIo(grids, prog);
      for (const [y0, y1] of list) {
        const name = 'band-' + y0;
        k.run({ v: 1, kernel: KERNEL, inputs: [], args: Object.assign({}, args, { y0, y1, outName: name }), out: '' }, mio);
        results.set(y0, ['-c.mvg', '-n.mvg', '-z.mvg'].map(s => { const g = grids.get(name + s); grids.delete(name + s); return g; }));
        if (prog) prog.step(1);
      }
    } else {
      poolN = pool.n || 1;
      const dir = fs.mkdtempSync(path.join(o.workDir || os.tmpdir(), 'mapviz-l3-'));
      const gf = require('../lib/raster/gridfile');
      try {
        for (const [f, g] of grids) gf.write(path.join(dir, f), g);
        const inputs = [...grids.keys()];
        const runs = list.map(([y0, y1]) => {
          const name = 'band-' + y0;
          return pool.run(KERNEL, { inputs, args: Object.assign({}, args, { y0, y1, outName: name }), out: dir }).then(r => {
            if (prog) { try { prog.step(1); } catch (e) { /* cancel seen below */ } }
            return { y0, name, r };
          });
        });
        const done = await Promise.all(runs);
        for (const d of done) {
          if (d.r.code === 5) throw new M.MvError('MV_CANCELLED', 'render l3 cancelled');
          if (d.r.code !== 0) throw new M.MvError('MV_FAULT', 'render l3 kernel failed (exit ' + d.r.code + '): ' + String(d.r.stderr || '').trim().slice(-400), { code: 'RENDER_KERNEL' });
          results.set(d.y0, ['-c.mvg', '-n.mvg', '-z.mvg'].map(s => gf.read(path.join(dir, d.name + s))));
        }
      } finally {
        if (ownPool) await pool.close();
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* temp */ }
      }
    }
    for (const [y0] of list) {
      const [c, n, z] = results.get(y0);
      data.set(c.data, y0 * W * 4); ndata.set(n.data, y0 * W * 4); zdata.set(z.data, y0 * W);
      objPx += (c.meta && c.meta.objPx) || 0;
    }
  }
  const meta = { rung: 'l3', env: L1.LIGHT.name, gain: L1.GAIN };
  if (pl.cellY !== pl.cell) meta.cellY = pl.cellY;
  const gridOf = (name, etype, d, nodata, m) => ({ name, w: W, h: H, cell: pl.cell, ox: pl.box[0], oy: pl.box[1], etype, sample: 'cell', scale: 1, offset: 0,
    nodata, meta: Object.assign({}, m, pl.cellY !== pl.cell ? { cellY: pl.cellY } : {}), data: d });
  const grid = gridOf('pic.l3', 'rgba8', data, null, meta);
  const nGrid = gridOf('l3.n', 'rgba8', ndata, null, { frame: 'world', kinds: KINDS.slice() });
  const zGrid = gridOf('l3.z', 'f32', zdata, NODATA, { unit: 'u' });
  const gl = [...gaps].sort();
  const pick = k => (bsc[k] === undefined ? null : bsc[k]);
  const sidecar = {
    v: 1, layer: 'pic.l3', w: W, h: H, box: pl.box.slice(), cell: pl.cell, rowOrder: 'minY-first', target,
    stackHash: (doc.stack && doc.stack.hash) || src.stackHash || pk.stackHash || null, mapHashes, rung: 'l3', env: L1.LIGHT.name, gaps: gl,
    approx: goh || gl.some(g => g !== 'RENDER_UNCOVERED'), brightness: goh ? 'unverified' : 'fitted', made: o.made || new Date().toISOString(),
    size, detail: pick('detail'), keep: pick('keep'), detailTextures: pick('detailTextures'), detailChanged: pick('detailChanged'),
    base: { layer: 'pic.l2', from: baseFrom, made: bsc.made || null }, ground: bsc.ground || null,
    pack: { from: packFrom, sha1: pk.bin ? pk.bin.sha1 : null, instances: pk.inst.count },
    objects: { drawn: keep.length, skipped, failed: failedDefs }, units, textures: { read: texRead, missing: texMissing },
    aux: ['l3.n', 'l3.z'], gain: L1.GAIN,
  };
  if (pl.cellY !== pl.cell) sidecar.cellY = pl.cellY;
  // notes are [{code, text}] (render.md 3.2, the page keeps only notes with a code)
  const allNotes = notes.concat((pk.notes || []).map(n => (n && typeof n === 'object'
    ? { code: typeof n.code === 'string' ? n.code : 'RENDER_PACK', text: String(n.text == null ? '' : n.text) }
    : { code: 'RENDER_PACK', text: String(n) })));
  if (allNotes.length) sidecar.notes = allNotes.slice(0, 50);
  const stats = { instances: keep.length, objectPixels: objPx, textures: texRead, texturesMissing: texMissing, bands, pool: poolN,
    ms: Date.now() - t0 };
  return { grid, sidecar, aux: { n: nGrid, z: zGrid }, stats };
}

module.exports = { l3, KERNEL, KINDS, NODATA, textureLevel, decodeTex, sameFrame, uvuOf };

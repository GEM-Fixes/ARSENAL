// render l2 (MV-R2, R2a): decals and water planes over pic.l1 (README 1.9; render.md 2.1, 3, 4.1, 4.2; design 7 L2a, L2b).
//   l2(src, doc, o) -> Promise<{grid ('pic.l2' rgba8), sidecar, aux:{n ('l2.n' rgba8), z ('l2.z' f32)}, stats}>
//     o = {size (2048), mode?, base? ({grid, sidecar, from?}), catalog? (entcat.json form), grids? ({height}), planes?,
//          pool?, progress?, cancelFlag?, made?, ply? (false: ground from the height grid)}
//   Base: o.base on the plan frame of plan(doc, {size}) is used as is (from: base.from, else 'given'); a base of another
//   frame (w, h, box or cell differ) is not used and l1 is drawn again in process with the map detail rule (from 'drawn'),
//   as when no base is given [ruling render.md 2.1]. o.pool goes to that l1.
//   Samples: 2 x 2 per pixel (SS, as l1). Each sample: ground z and normal (groundn: map.ply when read, else the height
//   grid), the decal layer (decal.js, premultiplied over), then the water plane with the highest z over the sample when
//   the ground is below it (waterplane.js optics on the straight colour; alpha kept). Pixel colour = the box mean of its
//   four samples in premultiplied form; a pixel no sample changed keeps the base bytes exactly (README 9.2). Pixels with
//   base alpha 0 are never drawn (kind 0). Pixel kind, z and normal: the sample with the highest z (ties: the higher kind).
//   Same on as64, mowas2 and goh; the GoH ocean differs (waterplane.js). Gaps: RENDER_DECAL_SIZE, RENDER_DECAL_TEXTURE,
//   RENDER_WATER_PLANE, RENDER_WATER_APPROX plus the base's gaps.
// Author: Imperator_Aug (ARSENAL, ia-2f1f26b6)
'use strict';
const fs = require('fs');
const F = require('./frame');

const SS = 2;
const BAND = 128;   // sample rows per band (64 pixel rows)
const KINDS = ['none', 'ground', 'decal', 'water', 'object', 'foliage', 'unit'];
const NODATA = -32768;

function mv() { return require('../mapviz'); }
function L1() { return require('./l1'); }

function sameFrame(g, pl) {
  if (!g || g.etype !== 'rgba8' || !g.data) return false;
  const cy = g.meta && g.meta.cellY > 0 ? g.meta.cellY : g.cell;
  const eq = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));
  return g.w === pl.size[0] && g.h === pl.size[1] && eq(g.ox, pl.box[0]) && eq(g.oy, pl.box[1]) && eq(g.cell, pl.cell) && eq(cy, pl.cellY)
    && g.data.length === g.w * g.h * 4;
}

function cancelled(o) {
  if (o.cancelFlag && typeof o.cancelFlag === 'string' && fs.existsSync(o.cancelFlag)) throw new (mv().MvError)('MV_CANCELLED', 'render l2 cancelled');
}

async function l2(src, doc, o) {
  o = o || {};
  const M = mv();
  if (!src || typeof src.read !== 'function') throw new M.MvError('MV_USAGE', 'render l2 needs a mapkit source', { code: 'RENDER_SRC' });
  if (!doc || !doc.key) throw new M.MvError('MV_USAGE', 'render l2 needs the mapdoc of the map', { code: 'RENDER_DOC' });
  if (o.mode && !(doc.modes || []).some(m => m && m.id === o.mode)) throw new M.MvError('MV_NOT_FOUND', 'mode ' + o.mode + ' is not a mode of ' + doc.key, { code: 'RENDER_MODE' });
  const t0 = Date.now();
  const prog = o.progress || null;
  const size = F.checkSize(o.size == null ? 2048 : o.size);
  const pl = F.plan(doc, { size });
  const target = L1().targetOf(src);
  const goh = target === 'goh';
  const notes = [], gaps = new Set();
  // ---- base (pic.l1)
  let base = null, from = null;
  if (o.base && o.base.grid) {
    if (sameFrame(o.base.grid, pl)) { base = o.base; from = o.base.from === 'in' ? 'in' : o.base.from === 'drawn' ? 'drawn' : 'given'; }
    else notes.push('the given pic.l1 is on another frame (' + o.base.grid.w + ' x ' + o.base.grid.h + '): not used, l1 drawn again');
  }
  if (!base) {
    const r = await L1().l1(src, doc, { size, detail: 'map', pool: o.pool, progress: prog, cancelFlag: o.cancelFlag, made: o.made });
    base = { grid: r.grid, sidecar: r.sidecar };
    from = 'drawn';
  }
  cancelled(o);
  if (prog) prog.stage('read', 3);
  const bs = base.sidecar || {};
  for (const g of bs.gaps || []) gaps.add(g);
  const W = pl.size[0], H = pl.size[1];
  const bd = base.grid.data;
  // ---- ground
  let grids = o.grids && o.grids.height ? o.grids : null;
  if (!grids) grids = require('../lib/mapkit').grids(src, doc.key, { mode: o.mode });
  const G = require('./groundn').ground(src, doc, pl, { grids, ss: SS, mode: o.mode, ply: o.ply === false || from === 'given' ? false : undefined });
  for (const n of G.notes) notes.push(n);
  if (prog) prog.step(1);
  // ---- catalog, decals, water
  const E = require('../entcat');
  let catalog = o.catalog && o.catalog.entries ? o.catalog : null;
  if (!catalog) catalog = E.forDoc(src, E.docForMode(doc, o.mode || null), {});
  const DC = require('./decal'), WP = require('./waterplane');
  const dl = DC.list(doc, catalog, o.mode);
  const tx = DC.textures(src, dl.rows);
  for (const n of tx.notes) notes.push(n);
  if (dl.noSize.length) {
    gaps.add('RENDER_DECAL_SIZE');
    notes.push(dl.noSize.length + ' decals have no size (entcat ENTCAT_DECAL_SIZE): ' + [...new Set(dl.noSize.map(d => d.def))].slice(0, 8).join(', '));
  }
  const rows = [];
  let noTexture = 0;
  for (const r of dl.rows) {
    if (r.sprite && tx.byMtl.get(r.sprite.mtl)) rows.push(r);
    else noTexture++;
  }
  if (noTexture) gaps.add('RENDER_DECAL_TEXTURE');
  if (prog) prog.step(1);
  const wp = WP.planes(src, doc, catalog, { mode: o.mode, given: o.planes, target });
  for (const g of wp.gaps) gaps.add(g);
  for (const n of wp.notes) notes.push(n);
  if (prog) prog.step(1);
  // ---- draw
  const out = new Uint8ClampedArray(bd);
  const NB = new Uint8ClampedArray(W * H * 4), ZB = new Float32Array(W * H).fill(NODATA);
  const SW = G.SW, SH = G.SH, sx = pl.cell / SS, sy = pl.cellY / SS, x0 = pl.box[0], y0 = pl.box[1];
  const foot = Math.max(pl.cell, pl.cellY) / SS;
  const nb = Math.ceil(SH / BAND);
  if (prog) prog.stage('draw', nb);
  const touched = new Array(rows.length).fill(0);
  const enc = v => Math.round((v + 1) * 127.5);
  let waterPx = 0, decalPx = 0, changedPx = 0;
  const kind = new Uint8Array(SS * SS), zs = new Float32Array(SS * SS), ns = new Float32Array(SS * SS * 3), g = [0, 0, 0];
  for (let b = 0; b < nb; b++) {
    cancelled(o);
    const sj0 = b * BAND, sj1 = Math.min(SH, sj0 + BAND);
    const { z, n } = G.band(sj0, sj1);
    // no drawing where the base is transparent
    for (let sj = sj0; sj < sj1; sj++) {
      const j = sj >> 1;
      for (let si = 0; si < SW; si++) if (bd[(j * W + (si >> 1)) * 4 + 3] === 0) z[(sj - sj0) * SW + si] = NaN;
    }
    const D = new Float32Array((sj1 - sj0) * SW * 4);
    const t = DC.draw(rows, tx.byMtl, { sj0, sj1, SW, x0, y0, sx, sy, foot, z, n, D });
    for (let i = 0; i < t.length; i++) touched[i] += t[i];
    const wi = wp.planes.length ? WP.cover(wp.planes, { sj0, sj1, SW, x0, y0, sx, sy }) : null;
    for (let j = sj0 >> 1; j < (sj1 + 1) >> 1; j++) {
      for (let i = 0; i < W; i++) {
        const q = (j * W + i) * 4;
        const ba = bd[q + 3];
        if (ba === 0) continue;
        const ab = ba / 255, br = bd[q] / 255, bgc = bd[q + 1] / 255, bb = bd[q + 2] / 255;
        let pr = 0, pg = 0, pb = 0, pa = 0, changed = false, anyW = false, anyD = false;
        let s = 0;
        for (let dj = 0; dj < SS; dj++) {
          for (let di = 0; di < SS; di++, s++) {
            const sj = j * SS + dj, si = i * SS + di;
            const k = (sj - sj0) * SW + si;
            let r = br * ab, gg = bgc * ab, bl = bb * ab, a = ab;
            kind[s] = 0; zs[s] = -Infinity;
            if (sj < sj0 || sj >= sj1 || !(z[k] === z[k])) { pr += r; pg += gg; pb += bl; pa += a; continue; }
            kind[s] = 1; zs[s] = z[k];
            ns[s * 3] = n[k * 3]; ns[s * 3 + 1] = n[k * 3 + 1]; ns[s * 3 + 2] = n[k * 3 + 2];
            const A = D[k * 4 + 3];
            if (A > 0) {
              const o1 = 1 - A;
              r = D[k * 4] + r * o1; gg = D[k * 4 + 1] + gg * o1; bl = D[k * 4 + 2] + bl * o1; a = A + a * o1;
              kind[s] = 2; changed = true; anyD = true;
            }
            const p = wi ? wi[k] : -1;
            if (p >= 0 && z[k] < wp.planes[p].z) {
              const P = wp.planes[p];
              g[0] = r / a; g[1] = gg / a; g[2] = bl / a;
              P.w.apply(g, P.z - z[k]);
              r = g[0] * a; gg = g[1] * a; bl = g[2] * a;
              kind[s] = 3; zs[s] = P.z; ns[s * 3] = 0; ns[s * 3 + 1] = 0; ns[s * 3 + 2] = 1;
              changed = true; anyW = true;
            }
            pr += r; pg += gg; pb += bl; pa += a;
          }
        }
        // kind, z and normal of the pixel: the highest sample
        let best = -1;
        for (let u = 0; u < SS * SS; u++) {
          if (!kind[u]) continue;
          if (best < 0 || zs[u] > zs[best] || (zs[u] === zs[best] && kind[u] > kind[best])) best = u;
        }
        if (best >= 0) {
          NB[q] = enc(ns[best * 3]); NB[q + 1] = enc(ns[best * 3 + 1]); NB[q + 2] = enc(ns[best * 3 + 2]); NB[q + 3] = kind[best];
          ZB[j * W + i] = zs[best];
        }
        if (!changed) continue;
        changedPx++;
        if (anyW) waterPx++;
        if (anyD) decalPx++;
        const m = SS * SS, A = pa / m;
        const a8 = Math.round(A * 255);
        out[q + 3] = a8;
        if (a8 === 0) { out[q] = out[q + 1] = out[q + 2] = 0; continue; }
        out[q] = Math.min(255, Math.round(pr / m / A * 255));
        out[q + 1] = Math.min(255, Math.round(pg / m / A * 255));
        out[q + 2] = Math.min(255, Math.round(pb / m / A * 255));
      }
    }
    if (prog) prog.step(1);
  }
  let drawn = 0, offGround = 0;
  for (let i = 0; i < rows.length; i++) { if (touched[i]) drawn++; else offGround++; }
  if (offGround) notes.push(offGround + ' decals cover no ground pixel of the picture (off the map, on transparent ground or fully transparent)');
  // ---- products
  const L = L1();
  const meta = { rung: 'l2', env: L.LIGHT.name, gain: L.GAIN };
  const cellY = pl.cellY !== pl.cell ? pl.cellY : null;
  if (cellY !== null) meta.cellY = cellY;
  const frameOf = (name, etype, data, m, nodata) => ({ name, w: W, h: H, cell: pl.cell, ox: pl.box[0], oy: pl.box[1], etype, sample: 'cell', scale: 1, offset: 0,
    nodata, meta: Object.assign(cellY !== null ? { cellY } : {}, m), data });
  const grid = frameOf('pic.l2', 'rgba8', out, meta, null);
  const nGrid = frameOf('l2.n', 'rgba8', NB, { frame: 'world', kinds: KINDS.slice() }, null);
  const zGrid = frameOf('l2.z', 'f32', ZB, { unit: 'u' }, NODATA);
  const gl = [...gaps].sort();
  const mapHashes = Object.assign({}, bs.mapHashes || {});
  if (G.hash) mapHashes['map.ply'] = G.hash;
  Object.assign(mapHashes, tx.files, wp.files);
  const allNotes = (bs.notes || []).concat(notes);
  const sidecar = {
    v: 1, layer: 'pic.l2', w: W, h: H, box: pl.box.slice(), cell: pl.cell, rowOrder: 'minY-first', target,
    stackHash: (doc.stack && doc.stack.hash) || src.stackHash || null, mapHashes, rung: 'l2', env: L.LIGHT.name, gaps: gl,
    approx: goh || gl.some(c => c !== 'RENDER_UNCOVERED'), brightness: goh ? 'unverified' : 'fitted', made: o.made || new Date().toISOString(),
    size,
    detail: bs.detail === undefined ? null : bs.detail, keep: bs.keep === undefined ? null : bs.keep,
    detailTextures: bs.detailTextures === undefined ? null : bs.detailTextures, detailChanged: bs.detailChanged === undefined ? null : bs.detailChanged,
    base: { layer: 'pic.l1', from, made: bs.made || null },
    ground: G.from,
    decals: { placed: dl.rows.length + dl.noSize.length, drawn, noSize: dl.noSize.length, noTexture, offGround },
    water: { planes: wp.planes.length, entityPlanes: wp.entityPlanes, ocean: wp.ocean, pixels: waterPx },
    aux: ['l2.n', 'l2.z'],
    gain: L.GAIN,
  };
  if (cellY !== null) sidecar.cellY = cellY;
  if (allNotes.length) sidecar.notes = allNotes.slice(0, 50);
  const stats = { w: W, h: H, from, ground: G.from, decals: dl.rows.length, decalsDrawn: drawn, decalPixels: decalPx, waterPlanes: wp.planes.length,
    waterPixels: waterPx, changed: changedPx, ms: Date.now() - t0 };
  return { grid, sidecar, aux: { n: nGrid, z: zGrid }, stats };
}

module.exports = { l2, KINDS, NODATA, SS, sameFrame };

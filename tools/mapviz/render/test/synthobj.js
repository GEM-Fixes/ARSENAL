// render l3 test helper (MV-R2, builder R2b): a synthetic l2 result in the frozen format (freeze render.md 3.1) and the
// fixture map opened through mapkit, so pack and l3 are tested without l2.js.
//   fixture(dir, form, edit?) -> {fxd, src, doc, grids}   tools/mapviz/test/fxmake.js map made in dir ('as2' | 'goh');
//     edit(fxd, put(rel, data)) runs before the source opens (extra or changed files under the game folder)
//   dds32(w, h, [r,g,b,a]) -> Buffer   one-level A8R8G8B8 DDS (render/test/synth.js)
//   flatBase(doc, size, o?) -> {grid ('pic.l2'), sidecar, aux:{n ('l2.n'), z ('l2.z')}, from:'given'}
//     o = {rgba (default [128,128,128,255]), height (grid: l2.z = heightAt at the pixel centre, else 0), alpha0: fn(x, y)
//     -> true where the base is transparent (pic.l1 alpha 0), cellShift (px added to w: a base of another frame)}
//     l2.n = (128, 128, 255, kind 1 ground) on every pixel, kind 0 and z nodata where alpha0
//   at(grid, x, y) -> index of the pixel holding world (x, y) (row 0 = min y)
//   rgbaAt(grid, x, y) -> [r, g, b, a];  valAt(grid, x, y) -> number (one-channel grid)
// Author: Imperator_Aug (ARSENAL, ia-07038fec)
'use strict';
const path = require('path');
const MV = path.resolve(__dirname, '../..');

function fixture(dir, form, edit) {
  const fx = require(path.join(MV, 'test/fxmake'));
  const mk = require(path.join(MV, 'lib/mapkit'));
  const fxd = fx.make(dir, { form });
  if (edit) edit(fxd, (rel, buf) => {   // put(rel under the game folder, Buffer | text)
    const fs = require('fs'), f = path.join(fxd.gameDir, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, buf);
  });
  const src = mk.source({ target: fxd.target, game: fxd.gameDir, mods: fxd.mods || [], modDirs: fxd.modDirs });
  const doc = mk.doc(src, fxd.map, {});
  const grids = mk.grids(src, fxd.map, {});
  return { fxd, src, doc, grids };
}

function flatBase(doc, size, o) {
  o = o || {};
  const F = require(path.join(MV, 'render/frame'));
  const pl = F.plan(doc, { size });
  const W = pl.size[0] + (o.cellShift || 0), H = pl.size[1];
  const cell = (pl.box[2] - pl.box[0]) / W;
  const col = o.rgba || [128, 128, 128, 255];
  const hAt = o.height ? require(path.join(MV, 'lib/mapkit')).heightAt : null;
  const c = new Uint8ClampedArray(W * H * 4), n = new Uint8ClampedArray(W * H * 4), z = new Float32Array(W * H);
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const k = j * W + i, x = pl.box[0] + (i + 0.5) * cell, y = pl.box[1] + (j + 0.5) * pl.cellY;
      if (o.alpha0 && o.alpha0(x, y)) { z[k] = -32768; continue; }
      c[k * 4] = col[0]; c[k * 4 + 1] = col[1]; c[k * 4 + 2] = col[2]; c[k * 4 + 3] = col[3];
      n[k * 4] = 128; n[k * 4 + 1] = 128; n[k * 4 + 2] = 255; n[k * 4 + 3] = 1;
      const h = hAt ? hAt(o.height, x, y) : 0;
      z[k] = h === null || !Number.isFinite(h) ? 0 : h;
    }
  }
  const meta = pl.cellY !== cell ? { cellY: pl.cellY } : {};
  const g = (name, etype, data, nodata, m) => ({ name, w: W, h: H, cell, ox: pl.box[0], oy: pl.box[1], etype, sample: 'cell', scale: 1, offset: 0,
    nodata, meta: Object.assign({}, m, meta), data });
  return {
    grid: g('pic.l2', 'rgba8', c, null, { rung: 'l2' }),
    sidecar: { v: 1, layer: 'pic.l2', w: W, h: H, box: pl.box.slice(), cell, rowOrder: 'minY-first', rung: 'l2', gaps: [], mapHashes: {}, ground: 'net', made: 'synthobj' },
    aux: { n: g('l2.n', 'rgba8', n, null, { frame: 'world' }), z: g('l2.z', 'f32', z, -32768, { unit: 'u' }) },
    from: 'given',
  };
}

function at(g, x, y) {
  const cy = g.meta && g.meta.cellY > 0 ? g.meta.cellY : g.cell;
  const i = Math.floor((x - g.ox) / g.cell), j = Math.floor((y - g.oy) / cy);
  if (i < 0 || j < 0 || i >= g.w || j >= g.h) return -1;
  return j * g.w + i;
}
function rgbaAt(g, x, y) { const k = at(g, x, y); return k < 0 ? null : Array.from(g.data.slice(k * 4, k * 4 + 4)); }
function valAt(g, x, y) { const k = at(g, x, y); return k < 0 ? null : g.data[k]; }

const dds32 = (w, h, col) => require('./synth').dds32(w, h, col);

module.exports = { fixture, flatBase, at, rgbaAt, valAt, dds32 };

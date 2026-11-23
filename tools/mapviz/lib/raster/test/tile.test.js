// raster tile and picture test: tileLevels and cutTile on odd sizes (1x1, 257x300, 1454x1010: tile counts, north-west
// anchor, alpha 0 padding east and south, every tile against an independent pyramid of premultiplied 2x2 means), the
// alpha rule, resample (box, nearest, premultiplied rgba, extent), minFilter, tint, topo (sidecar, size, golden under the
// tolerance rule), render, make.
// usage: node tools/mapviz/lib/raster/test/tile.test.js [scratch dir]
//        MAPVIZ_GOLDEN_WRITE=1 writes test/tile-topo.golden.mvg instead of comparing
// Author: Imperator_Aug (ARSENAL, ia-e693a38e)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');

const W = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'mapviz-raster-tile-')));
fs.mkdirSync(W, { recursive: true });
process.env.ARSENAL_CACHE = process.env.ARSENAL_CACHE || path.join(W, 'cache');

const R = require('../index');
const GF = require('../gridfile');
const FX = require('../../../test/fxmake');

let pass = 0, fail = 0;
function ok(c, what) { if (c) pass++; else { fail++; console.log('FAIL mapviz raster-tile: ' + what); } }
function throwsCode(fn, code, what) {
  try { fn(); ok(false, what + ': no error (want ' + code + ')'); }
  catch (e) { ok(e && e.code === code, what + ': code ' + (e && e.code) + ', want ' + code + ' (' + (e && e.message) + ')'); }
}
const WRITE = process.env.MAPVIZ_GOLDEN_WRITE === '1';
function tolerance(a, b, what) {
  if (a.length !== b.length) { ok(false, what + ': lengths ' + a.length + ' and ' + b.length); return; }
  let one = 0, more = 0;
  for (let k = 0; k < a.length; k++) { const d = Math.abs(a[k] - b[k]); if (d > 1) more++; else if (d === 1) one++; }
  ok(more === 0 && one <= a.length * 0.001, what + ': ' + more + ' samples off by more than 1, ' + one + ' off by 1 of ' + a.length);
}
// an integer hash picture: colour from the position, alpha 0, 1, 128 or 255
function hashPic(w, h) {
  const g = R.make({ name: 'pic', w, h, cell: 10, ox: 0, oy: 0, etype: 'rgba8' });
  for (let k = 0; k < w * h; k++) {
    let x = Math.imul(k + 1, 0x9e3779b1); x ^= x >>> 15; x = Math.imul(x, 0x85ebca6b); x ^= x >>> 13;
    g.data[k * 4] = x & 255; g.data[k * 4 + 1] = (x >>> 8) & 255; g.data[k * 4 + 2] = (x >>> 16) & 255; g.data[k * 4 + 3] = [0, 1, 128, 255, 255, 255][(x >>> 24) % 6];
  }
  return g;
}
// the pyramid written out plainly (README 5.2 and 9.2), level arrays straight alpha, row 0 = min world y
function pyramid(pic) {
  const L = [{ w: pic.w, h: pic.h, d: pic.data }];
  const pm = (c, a) => Math.floor((c * a + 127) / 255);
  while (L[L.length - 1].w > 256 || L[L.length - 1].h > 256) {
    const B = L[L.length - 1], w = Math.ceil(B.w / 2), h = Math.ceil(B.h / 2), d = new Uint8Array(w * h * 4);
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
      const s = [0, 0, 0, 0]; let n = 0;
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
        const x = 2 * c + dx, y = 2 * r + dy;
        if (x >= B.w || y >= B.h) continue;
        const p = (y * B.w + x) * 4, a = B.d[p + 3];
        s[0] += pm(B.d[p], a); s[1] += pm(B.d[p + 1], a); s[2] += pm(B.d[p + 2], a); s[3] += a; n++;
      }
      const A = Math.floor((s[3] + (n >> 1)) / n), q = (r * w + c) * 4;
      for (let t = 0; t < 3; t++) { const P = Math.floor((s[t] + (n >> 1)) / n); d[q + t] = A ? Math.min(255, Math.floor((P * 255 + (A >> 1)) / A)) : 0; }
      d[q + 3] = A;
    }
    L.push({ w, h, d });
  }
  return L;
}
function checkTiles(pic, wantLevels, what) {
  const T = R.tileLevels(pic.w, pic.h);
  ok(JSON.stringify(T.levels.map(l => [l.w, l.h, l.nx, l.ny])) === JSON.stringify(wantLevels), what + ': levels ' + JSON.stringify(T.levels.map(l => [l.w, l.h, l.nx, l.ny])));
  ok(T.zmax === wantLevels.length - 1, what + ': zmax ' + T.zmax);
  const P = pyramid(pic);
  let bad = 0, pad = 0, tiles = 0;
  for (const lv of T.levels) {
    const Lz = P[lv.z];
    for (let ty = 0; ty < lv.ny; ty++) for (let tx = 0; tx < lv.nx; tx++) {
      const t = R.cutTile(pic, lv.z, tx, ty); tiles++;
      if (t.w !== 256 || t.h !== 256 || t.rgba.length !== 256 * 256 * 4) bad++;
      for (let py = 0; py < 256; py++) for (let px = 0; px < 256; px++) {
        const c = tx * 256 + px, r = Lz.h - 1 - (ty * 256 + py), q = (py * 256 + px) * 4;
        if (c >= Lz.w || r < 0) { if (t.rgba[q] | t.rgba[q + 1] | t.rgba[q + 2] | t.rgba[q + 3]) pad++; continue; }
        const s = (r * Lz.w + c) * 4;
        if (t.rgba[q] !== Lz.d[s] || t.rgba[q + 1] !== Lz.d[s + 1] || t.rgba[q + 2] !== Lz.d[s + 2] || t.rgba[q + 3] !== Lz.d[s + 3]) bad++;
      }
    }
  }
  ok(bad === 0, what + ': every tile pixel = the plain pyramid, north on top (' + bad + ' differ over ' + tiles + ' tiles)');
  ok(pad === 0, what + ': padding is all zero (alpha 0) east and south (' + pad + ' not)');
  return T;
}

// ---- 1. tiles on odd sizes ----
{
  const one = hashPic(1, 1); one.data.set([10, 20, 30, 255]);
  checkTiles(one, [[1, 1, 1, 1]], '1x1');
  const t = R.cutTile(one, 0, 0, 0);
  ok(t.rgba[0] === 10 && t.rgba[3] === 255 && t.rgba[7] === 0, '1x1: the pixel at the north-west corner, the rest alpha 0');
  const p2 = hashPic(257, 300);
  checkTiles(p2, [[257, 300, 2, 2], [129, 150, 1, 1]], '257x300');
  // the north-west anchor by hand: tile (0, 0) pixel (0, 0) = picture column 0, top row (max world y)
  const t00 = R.cutTile(p2, 0, 0, 0), top = (299 * 257) * 4;
  ok(t00.rgba[0] === p2.data[top] && t00.rgba[3] === p2.data[top + 3], '257x300: tile 0.0 pixel 0,0 = column 0 of the top picture row');
  const t10 = R.cutTile(p2, 0, 1, 0);
  ok(t10.rgba[4 * 1 + 3] === 0 && t10.rgba[0] === p2.data[(299 * 257 + 256) * 4], '257x300: tile 1.0 holds column 256, then padding east');
  const t01 = R.cutTile(p2, 0, 0, 1);
  ok(t01.rgba[(43 * 256) * 4] === p2.data[0] && t01.rgba[(44 * 256) * 4 + 3] === 0, '257x300: tile 0.1 ends with picture row 0 at tile row 43, then padding south');
  const big = hashPic(1454, 1010);
  checkTiles(big, [[1454, 1010, 6, 4], [727, 505, 3, 2], [364, 253, 2, 1], [182, 127, 1, 1]], '1454x1010');
  throwsCode(() => R.cutTile(big, 4, 0, 0), 'RASTER_ARG', 'a level past zmax');
  throwsCode(() => R.cutTile(big, 0, 6, 0), 'RASTER_ARG', 'a tile past the level');
  throwsCode(() => R.cutTile(R.make({ name: 'h', w: 2, h: 2, cell: 1, etype: 'u8' }), 0, 0, 0), 'RASTER_ETYPE', 'cutTile on a u8 grid');
  ok(R.cutTile({ w: 1, h: 1, rgba: new Uint8ClampedArray([1, 2, 3, 4]) }, 0, 0, 0).rgba[3] === 4, 'cutTile takes {w, h, rgba} too');
}

// ---- 2. the alpha rule and a 2x2 mean by hand ----
{
  ok(R.premul(255, 128) === 128 && R.premul(200, 0) === 0 && R.premul(100, 255) === 100 && R.premul(1, 128) === 1, 'premul (x a + 127) / 255');
  ok(R.unpremul(128, 128) === 255 && R.unpremul(0, 0) === 0 && R.unpremul(64, 128) === 128, 'unpremul');
  // red opaque + transparent white (and 2 missing: h 1) -> red at alpha 128; the odd east column 256 alone -> itself
  const p = R.make({ name: 'pic', w: 257, h: 1, cell: 1, etype: 'rgba8' });
  p.data.set([255, 0, 0, 255], 254 * 4); p.data.set([255, 255, 255, 0], 255 * 4); p.data.set([10, 20, 30, 40], 256 * 4);
  const L = R.tileLevels(257, 1);
  ok(L.zmax === 1, '257x1: zmax 1');
  const t = R.cutTile(p, 1, 0, 0), q = 127 * 4;
  ok(t.rgba[q] === 255 && t.rgba[q + 1] === 0 && t.rgba[q + 2] === 0 && t.rgba[q + 3] === 128, 'a transparent white pixel does not tint the mean: (' + Array.from(t.rgba.subarray(q, q + 4)) + ')');
  ok(Array.from(t.rgba.subarray(q + 4, q + 8)).join() === R.unpremul(R.premul(10, 40), 40) + ',' + R.unpremul(R.premul(20, 40), 40) + ',' + R.unpremul(R.premul(30, 40), 40) + ',40',
    'the odd east column is the mean of its one existing pixel (' + Array.from(t.rgba.subarray(q + 4, q + 8)) + ')');
}

// ---- 3. resample, minFilter, tint, make ----
{
  const g = R.make({ name: 'v', w: 4, h: 2, cell: 10, ox: 0, oy: 0, etype: 'i16' });
  g.data.set([0, 2, 4, 6, 8, 10, 12, 14]);
  const b = R.resample(g, 2, 1, 'box');
  ok(b.w === 2 && b.h === 1 && b.cell === 20 && b.meta.cellY === undefined && Array.from(b.data).join() === '5,9', 'box 4x2 -> 2x1: means 5 and 9');
  const n = R.resample(g, 2, 1, 'nearest');
  ok(Array.from(n.data).join() === '10,14', 'nearest 4x2 -> 2x1: the cell under each centre');
  const an = R.resample(g, 2, 2, 'box');
  ok(an.cell === 20 && an.meta.cellY === 10 && an.w * an.cell === 40, 'uneven axes keep the extent and set meta.cellY');
  const lat = R.make({ name: 'h', w: 5, h: 5, cell: 10, ox: 100, oy: 100, etype: 'f32', sample: 'lattice' });
  const lr = R.resample(lat, 10, 10, 'nearest');
  ok(lr.ox - lr.cell / 2 === 95 && lr.cell === 5, 'a lattice grid keeps its outer edge (ox - cell / 2) when resampled');
  const pic = R.make({ name: 'pic', w: 2, h: 1, cell: 10, etype: 'rgba8' });
  pic.data.set([255, 0, 0, 0, 0, 0, 255, 255]);
  const pb = R.resample(pic, 1, 1, 'box');
  ok(pb.data[0] === 0 && pb.data[2] === 255 && pb.data[3] === 128, 'rgba box is premultiplied: transparent red leaves blue at alpha 128 (' + Array.from(pb.data) + ')');
  throwsCode(() => R.resample(g, 2, 1, 'cubic'), 'RASTER_ARG', 'resample mode cubic');
  const nd = R.make({ name: 'v', w: 2, h: 1, cell: 10, etype: 'i16', nodata: -1 }); nd.data.set([-1, 8]);
  ok(R.resample(nd, 1, 1, 'box').data[0] === 8, 'box skips nodata');
  const m = R.make({ name: 'm', w: 5, h: 5, cell: 10, etype: 'u8', nodata: 255 });
  for (let k = 0; k < 25; k++) m.data[k] = 50 + k;
  m.data[12] = 3; m.data[0] = 255;
  const mf = R.minFilter(m, 1), at = (i, j) => mf.data[j * 5 + i];
  ok(at(1, 1) === 3 && at(3, 3) === 3 && at(4, 4) === 68 && at(0, 0) === 51, 'minFilter r 1: 3x3 minimum, nodata ignored (' + [at(1, 1), at(4, 4), at(0, 0)] + ')');
  ok(Array.from(R.minFilter(m, 0).data).join() === Array.from(m.data).join(), 'minFilter r 0 is a copy');
  throwsCode(() => R.minFilter(m, -1), 'RASTER_ARG', 'minFilter r -1');
  const pal = R.palette(), st = pal.height.stops;
  const h = R.make({ name: 'height', w: 3, h: 2, cell: 10, etype: 'f32', sample: 'lattice', nodata: -9999 });
  h.data.set([0, 0, 100, 0, 0, 100]);
  const t = R.tint(h, pal.height);
  const first = R.color(st[0].color), last = R.color(st[st.length - 1].color);
  ok(t.etype === 'rgba8' && t.sample === 'cell' && t.w === 3 && t.meta.min === 0 && t.meta.max === 100, 'tint: rgba8 cell picture, meta min/max of the cell centres');
  ok(Array.from(t.data.subarray(0, 4)).join() === first.join() && Array.from(t.data.subarray(8, 12)).join() === last.join(), 'tint: lowest centre = first stop, highest = last stop');
  h.data[2] = -9999; h.data[5] = -9999; h.data[1] = -9999; h.data[4] = -9999;
  const tn = R.tint(h, pal.height);
  ok(tn.data[2 * 4 + 3] === 0, 'tint: a cell with only nodata corners is transparent');
  throwsCode(() => R.tint(h, []), 'RASTER_ARG', 'tint without stops');
  throwsCode(() => R.make({ name: 'x', w: 1, h: 1, cell: 1, etype: 'u9' }), 'RASTER_ETYPE', 'make with etype u9');
  throwsCode(() => R.make({ name: 'x', w: 1, h: 1, cell: 1, etype: 'u8', sample: 'point' }), 'RASTER_SAMPLE', 'make with sample point');
}

// ---- 4. topo and render ----
{
  const F = FX.SPEC.forms.as2;
  const h = R.make({ name: 'height', w: F.w, h: F.h, cell: F.cell, ox: -FX.SPEC.offX, oy: -FX.SPEC.offY, etype: 'i16', sample: 'lattice', meta: { upm: 20 } });
  for (let j = 0; j < F.h; j++) for (let i = 0; i < F.w; i++) h.data[j * F.w + i] = FX.cellRecord('as2', i, j).h;
  const r = R.topo(h, { made: '2026-01-01T00:00:00.000Z' }), s = r.sidecar;
  ok(r.grid.name === 'pic.topo' && r.grid.etype === 'rgba8' && r.grid.sample === 'cell' && r.grid.w === F.w && r.grid.h === F.h, 'pic.topo: rgba8, cell sample, 1 px per cell');
  const keys = ['v', 'layer', 'w', 'h', 'box', 'cell', 'rowOrder', 'target', 'stackHash', 'mapHashes', 'rung', 'env', 'gaps', 'approx', 'brightness', 'made'];
  ok(keys.every(k => k in s), 'sidecar has ' + keys.join(', '));
  ok(s.v === 1 && s.layer === 'pic.topo' && s.rowOrder === 'minY-first' && s.made === '2026-01-01T00:00:00.000Z' && JSON.stringify(s.box) === JSON.stringify([-640, -480, 640, 480]), 'sidecar values (box ' + JSON.stringify(s.box) + ')');
  const sized = R.topo(h, { size: 64, made: s.made });
  ok(sized.grid.w === 64 && sized.grid.h === 48 && JSON.stringify(sized.sidecar.box) === JSON.stringify(s.box) && sized.sidecar.w === 64, 'size 64: 64 x 48, the same box');
  throwsCode(() => R.topo(h, { size: 8 }), 'RASTER_ARG', 'topo size 8');
  // shade lit west flank lighter than the dark east flank at the same height
  const px = (x, y) => { const i = Math.floor((x + 640) / 10), j = Math.floor((y + 480) / 10), q = (j * F.w + i) * 4; return r.grid.data[q] + r.grid.data[q + 1] + r.grid.data[q + 2]; };
  ok(px(-255, 0) > px(-155, 0), 'topo: the lit west flank is lighter than the east flank');
  // flat ground keeps the tint; the shading is plain to see; a floor keeps every pixel off black
  const tn = R.tint(h, R.palette().height), q0 = ((460 + 480) / 10 * F.w + (620 + 640) / 10) * 4;
  ok([0, 1, 2, 3].every(c => r.grid.data[q0 + c] === tn.data[q0 + c]), 'topo: flat ground far from the relief = the height tint');
  ok(px(-255, 0) > px(-155, 0) + 120, 'topo: the flanks differ plainly (' + px(-255, 0) + ' / ' + px(-155, 0) + ', sum of r g b)');
  let floor = 1;
  for (let k = 0; k < F.w * F.h; k++) {
    const a = r.grid.data[k * 4] + r.grid.data[k * 4 + 1] + r.grid.data[k * 4 + 2], b = tn.data[k * 4] + tn.data[k * 4 + 1] + tn.data[k * 4 + 2];
    if (b > 0 && a / b < floor) floor = a / b;
  }
  ok(floor >= 0.25, 'topo: no pixel darker than a quarter of its tint (lowest ' + floor.toFixed(2) + ')');
  // a cone lit from the north-west: the north-west side lighter than the south-east side, the north side unlike the south
  {
    const n = 61, c = 30, cone = R.make({ name: 'height', w: n, h: n, cell: 10, ox: 0, oy: 0, etype: 'i16', sample: 'lattice', meta: { upm: 20 } });
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) cone.data[j * n + i] = Math.round(Math.max(0, 80 - Math.hypot(i - c, j - c) * 4));
    const t = R.topo(cone, { made: 'x' }).grid, L = (i, j) => t.data[(j * n + i) * 4] + t.data[(j * n + i) * 4 + 1] + t.data[(j * n + i) * 4 + 2];
    ok(L(c - 10, c + 10) > L(c + 10, c - 10) + 60, 'topo cone: the north-west side lighter than the south-east side (' + L(c - 10, c + 10) + ' / ' + L(c + 10, c - 10) + ')');
    ok(L(c, c + 12) > L(c, c - 12) + 30, 'topo cone: the north side lighter than the south side (' + L(c, c + 12) + ' / ' + L(c, c - 12) + ')');
    const wrong = R.hillshade(R.make({ name: 'height', w: n - 1, h: n, cell: 10, etype: 'i16', sample: 'lattice' }));
    throwsCode(() => R.topo(cone, { shade: wrong }), 'RASTER_ARG', 'topo with a shade grid of another size');
  }
  const gf = path.join(__dirname, 'tile-topo.golden.mvg');
  if (WRITE) GF.write(gf, sized.grid);
  else if (fs.existsSync(gf)) tolerance(sized.grid.data, GF.read(gf).data, 'fixture topo at 64 px against its golden');
  else ok(false, 'golden tile-topo.golden.mvg is present');
  ok(Buffer.compare(Buffer.from(R.topo(h, { made: s.made }).grid.data), Buffer.from(r.grid.data)) === 0, 'topo: the same bytes on a second run');
  const sl = R.render(R.slopeClass(h));
  ok(sl.etype === 'rgba8' && sl.w === F.w && sl.data[3] === 0, 'render slopecls: an rgba8 picture, class 0 transparent (palette #00000000)');
  const cls = R.palette().slope.classes.map(R.color), k = 48 * F.w + 39;
  ok(Array.from(sl.data.subarray(k * 4, k * 4 + 4)).join() === cls[5].join(), 'render slopecls: class 5 cell in the class 5 colour');
  const sh = R.render(R.hillshade(h));
  ok(sh.data[0] === sh.data[1] && sh.data[0] === R.hillshade(h).data[0], 'render shade: grey = the shade value');
  ok(R.render(r.grid) === r.grid, 'render rgba8: as is');
  const rg = R.render(R.regions(R.make({ name: 'm', w: 2, h: 1, cell: 1, etype: 'u8' })).grid);
  ok(rg.data[3] === 0, 'render regions: id 0 transparent');
}

if (fail) { console.log('FAIL mapviz raster-tile: ' + fail + ' of ' + (pass + fail) + ' checks failed'); process.exit(1); }
console.log('PASS mapviz raster-tile (' + pass + ')');
// a temp folder this run made (no folder given) goes when every check passed; a failed run keeps it to look at
if (!process.argv[2]) { try { fs.rmSync(W, { recursive: true, force: true }); } catch (e) { /* the OS clears its temp folder */ } }

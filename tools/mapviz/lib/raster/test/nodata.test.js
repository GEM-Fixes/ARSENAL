// raster nodata test (R16): a height grid with a nodata rim (the outer ring, as past the ground mesh) and a nodata block
// inside, through every raster function that reads heights or grids made from them: slopeClass (nodata class 0, a cell
// next to nodata classed from its real neighbours only), hillshade (nodata flat, no point lit from -32768), tint and topo
// (a pixel whose own lattice point is nodata is transparent, the range ignores nodata, the shade mean skips nodata
// corners), contours (no line enters a cell with a nodata corner, nothing on flat ground), landform (flat ground stays
// flat), regions and distance (a nodata mask cell is out / zero), minFilter, resample, costField, render. Planted: the same
// grid with nodata turned off (-32768 read as a height) must fail the checks, so each check can see the defect. Section 9:
// the same for a u16 grid (map.net version 0, nodata 65535) through slopeClass, hillshade, tint, topo and contours.
// usage: node tools/mapviz/lib/raster/test/nodata.test.js [scratch dir]
// Author: Imperator_Aug (ARSENAL, ia-9e0c9579)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');

const W = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'mapviz-raster-nodata-')));
fs.mkdirSync(W, { recursive: true });
process.env.ARSENAL_CACHE = process.env.ARSENAL_CACHE || path.join(W, 'cache');

const R = require('../index');

let pass = 0, fail = 0;
function ok(c, what) { if (c) pass++; else { fail++; console.log('FAIL mapviz raster-nodata: ' + what); } }

const ND = -32768, GW = 40, GH = 30, CELL = 10;
// rim = the outer ring; block = i 14..18, j 10..14
const isRim = (i, j) => i === 0 || j === 0 || i === GW - 1 || j === GH - 1;
const isBlock = (i, j) => i >= 14 && i <= 18 && j >= 10 && j <= 14;
const isOff = (i, j) => isRim(i, j) || isBlock(i, j);
// i16 lattice heights fn(i, j) (u); nodata marks the rim and the block; o.plain = the same values with no nodata field
// (the planted defect: -32768 read as a height)
function hgrid(fn, o) {
  o = o || {};
  const g = R.make({ name: 'height', w: GW, h: GH, cell: CELL, ox: -200, oy: -150, etype: 'i16', sample: 'lattice',
    nodata: o.plain || o.none ? null : ND, meta: { unit: 'u', upm: 20 } });
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) g.data[j * GW + i] = !o.none && isOff(i, j) ? ND : fn(i, j);
  return g;
}
const plane = (i, j) => -3 * i + 2 * j + 200;     // grade (-0.3, 0.2) per u: 19.8 deg, slope class 3, faces away from the light
const PMIN = 200 - 3 * (GW - 1), PMAX = 200 + 2 * (GH - 1);
const flat = () => 100;
const P = hgrid(plane), PD = hgrid(plane, { plain: true }), P0 = hgrid(plane, { none: true });
const F = hgrid(flat), FD = hgrid(flat, { plain: true });
let offCount = 0;
for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) if (isOff(i, j)) offCount++;

// ---- 1. slopeClass ----
{
  const ref = R.slopeClass(P0).data[15 * GW + 25];
  ok(ref === 3, 'slopeClass: the plane is class 3 inside (' + ref + ')');
  const s = R.slopeClass(P).data;
  let offBad = 0, validBad = 0, nextTo = 0;
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
    const k = j * GW + i;
    if (isOff(i, j)) { if (s[k] !== 0) offBad++; continue; }
    if (s[k] !== ref) validBad++;
    if (isOff(i + 1, j) || isOff(i - 1, j) || isOff(i, j + 1) || isOff(i, j - 1)) nextTo++;
  }
  ok(offBad === 0, 'slopeClass: every nodata point is class 0 (' + offBad + ' not)');
  ok(validBad === 0 && nextTo > 50, 'slopeClass: every real point, ' + nextTo + ' of them next to nodata, is the plane class 3 from its real neighbours (' + validBad + ' not)');
  // planted: -32768 read as a height makes the cells next to it steep
  const sd = R.slopeClass(PD).data;
  let steep = 0;
  for (let k = 0; k < sd.length; k++) if (sd[k] >= 10) steep++;
  ok(steep > 50, 'slopeClass planted: -32768 as a height gives ' + steep + ' steep cells (the check sees it)');
}

// ---- 2. hillshade ----
{
  const sf = R.hillshade(F, { z: 2 }).data;
  let notFlat = 0;
  for (let k = 0; k < sf.length; k++) if (sf[k] !== 128) notFlat++;
  ok(notFlat === 0, 'hillshade: flat ground with a nodata rim and block is 128 everywhere (' + notFlat + ' not)');
  const sfd = R.hillshade(FD, { z: 2 }).data;
  let lit = 0;
  for (let k = 0; k < sfd.length; k++) if (sfd[k] !== 128) lit++;
  ok(lit > 50, 'hillshade planted: -32768 as a height lights ' + lit + ' points');
  // the plane: every real point shades as the same plane with no nodata (the heights past a nodata edge are extrapolated,
  // as past the map edge), within 1 level; nodata points are flat 128
  const s0 = R.hillshade(P0, { z: 2 }).data, sp = R.hillshade(P, { z: 2 }).data;
  let out = 0, offBad = 0, worst = 0;
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
    const k = j * GW + i;
    if (isOff(i, j)) { if (sp[k] !== 128) offBad++; continue; }
    const d = Math.abs(sp[k] - s0[k]);
    if (d > worst) worst = d;
    if (d > 1) out++;
  }
  ok(s0[15 * GW + 30] < 100, 'hillshade: the test plane is not flat-lit (' + s0[15 * GW + 30] + ')');
  ok(offBad === 0, 'hillshade: nodata points of the plane are flat 128');
  ok(out === 0, 'hillshade: the plane shades as without nodata up to the nodata edge (' + out + ' points off by more than 1, worst ' + worst + ')');
  // the same with the automatic z and a finer cell (a wider blur and block): still the plane
  const P5 = Object.assign({}, P, { cell: 5 }), P50 = Object.assign({}, P0, { cell: 5 });
  const h5 = R.hillshade(P5), h50 = R.hillshade(P50), a5 = h5.data, b5 = h50.data;
  ok(h5.meta.reliefDeg === h50.meta.reliefDeg && h5.meta.z === h50.meta.z,
    'hillshade: auto z sees the real slope next to nodata (' + h5.meta.reliefDeg + ' / ' + h50.meta.reliefDeg + ' deg, z ' + h5.meta.z + ')');
  let off5 = 0;
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) if (!isOff(i, j) && Math.abs(a5[j * GW + i] - b5[j * GW + i]) > 1) off5++;
  ok(off5 === 0, 'hillshade: cell 5, auto z: the plane shades as without nodata (' + off5 + ' off)');
}

// ---- 3. tint, render ----
const stops = R.palette().height;
{
  const t = R.tint(P, stops);
  let a0 = 0, aBad = 0;
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
    const a = t.data[(j * GW + i) * 4 + 3];
    if (isOff(i, j)) { if (a === 0) a0++; else aBad++; } else if (a !== 255) aBad++;
  }
  ok(a0 === offCount && aBad === 0, 'tint: alpha 0 exactly where the own lattice point is nodata (' + a0 + ' of ' + offCount + ', ' + aBad + ' wrong)');
  ok(t.meta.min >= PMIN && t.meta.max <= PMAX, 'tint: range from the real heights only (' + t.meta.min + '..' + t.meta.max + ')');
  const td = R.tint(PD, stops);
  ok(td.meta.min < -30000, 'tint planted: -32768 as a height pulls the range to ' + td.meta.min);
  const rp = R.render(P);
  ok(rp.data[3] === 0 && rp.data[(15 * GW + 25) * 4 + 3] === 255, 'render (raster png): a lattice height grid is tinted with nodata transparent');
}

// ---- 4. topo: alpha, range, the shade mean skips nodata corners ----
{
  const tp = R.topo(P, { made: 'x' });
  const t = R.tint(P, stops);
  let diff = 0;
  for (let k = 0; k < GW * GH; k++) if ((tp.grid.data[k * 4 + 3] === 0) !== (t.data[k * 4 + 3] === 0)) diff++;
  ok(diff === 0, 'topo: transparent where the tint is (' + diff + ' differ)');
  ok(tp.grid.meta.min >= PMIN, 'topo: meta.min from the real heights (' + tp.grid.meta.min + ')');
  // a given shade: flat 128 on real points, 0 (black) on nodata points: a real pixel next to nodata keeps its tint
  const sh = R.make({ name: 'shade', w: GW, h: GH, cell: CELL, ox: -200, oy: -150, etype: 'u8', sample: 'lattice', meta: { alt: 45, flat: 128 } });
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) sh.data[j * GW + i] = isOff(i, j) ? 0 : 128;
  const ts = R.topo(P, { shade: sh, made: 'x' });
  const k = 12 * GW + 13;                // corners (13,12) real, (14,12) (14,13) block, (13,13) real
  const same = [0, 1, 2, 3].every(q => ts.grid.data[k * 4 + q] === t.data[k * 4 + q]);
  ok(same, 'topo: a pixel beside the block is not darkened by the nodata corners (' + Array.from(ts.grid.data.slice(k * 4, k * 4 + 4)) + ' vs tint ' + Array.from(t.data.slice(k * 4, k * 4 + 4)) + ')');
  // planted: the same shade on a grid that does not mark nodata darkens it
  const P2 = hgrid(plane);
  P2.nodata = null;
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) if (isOff(i, j)) P2.data[j * GW + i] = plane(i, j);
  const tn = R.topo(P2, { shade: sh, made: 'x' });
  ok(tn.grid.data[k * 4] < t.data[k * 4] || tn.grid.data[k * 4 + 1] < t.data[k * 4 + 1], 'topo planted: without the mask the nodata corners darken the pixel');
}

// ---- 5. contours ----
{
  const valid = (i, j) => i >= 0 && j >= 0 && i < GW && j < GH && !isOff(i, j);
  // every point lies on a lattice edge whose two ends hold a height
  const bad = res => {
    let n = 0;
    for (const l of res.lines) for (const [x, y] of l.pts) {
      const fx = (x + 200) / CELL, fy = (y + 150) / CELL, rx = Math.round(fx), ry = Math.round(fy);
      let good;
      if (Math.abs(fx - rx) < 0.02 && Math.abs(fy - ry) < 0.02) good = valid(rx, ry);
      else if (Math.abs(fx - rx) < 0.02) good = valid(rx, Math.floor(fy)) && valid(rx, Math.floor(fy) + 1);
      else if (Math.abs(fy - ry) < 0.02) good = valid(Math.floor(fx), ry) && valid(Math.floor(fx) + 1, ry);
      else good = false;                    // simplify keeps traced points only; one off an edge is a defect too
      if (!good) n++;
    }
    return n;
  };
  const c = R.contours(P, { simplify: 0 });
  const c0 = R.contours(P0, { simplify: 0 });
  ok(c.lines.length > 0 && bad(c) === 0, 'contours: ' + c.lines.length + ' lines, no point enters a cell with a nodata corner (' + bad(c) + ')');
  ok(c.lines.length > c0.lines.length, 'contours: the block splits the lines (' + c.lines.length + ' > ' + c0.lines.length + ')');
  ok(c.lines.every(l => l.level * 20 > PMIN && l.level * 20 <= PMAX), 'contours: every level within the real heights');
  ok(R.contours(F).lines.length === 0, 'contours: flat ground with nodata has no line');
  const cd = R.contours(FD);
  ok(cd.lines.length > 0, 'contours planted: -32768 as a height draws ' + cd.lines.length + ' lines round the nodata');
}

// ---- 6. landform ----
{
  const lf = R.landform(F, 2);
  let notFlat = 0;
  for (let k = 0; k < lf.data.length; k++) if (lf.data[k] !== R.LANDFORM.FLAT) notFlat++;
  ok(notFlat === 0, 'landform: flat ground with a nodata rim and block stays flat (' + notFlat + ' cells not)');
  const ld = R.landform(FD, 2);
  let marked = 0;
  for (let k = 0; k < ld.data.length; k++) if (ld.data[k] !== R.LANDFORM.FLAT) marked++;
  ok(marked > 20, 'landform planted: -32768 as a height marks ' + marked + ' cells');
}

// ---- 7. regions, distance on a mask with nodata ----
{
  const m = R.make({ name: 'mask', w: GW, h: GH, cell: CELL, ox: 0, oy: 0, etype: 'u8', sample: 'cell', nodata: 255 });
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) m.data[j * GW + i] = isOff(i, j) ? 255 : 1;
  const r = R.regions(m);
  let lab = 0;
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) if (isOff(i, j) && r.grid.data[j * GW + i]) lab++;
  ok(r.list.length === 1 && lab === 0, 'regions: one region round the block, no nodata cell in it (' + r.list.length + ', ' + lab + ')');
  ok(r.list[0] && r.list[0].area === (GW * GH - offCount) * CELL * CELL / 400, 'regions: area counts the real cells only');
  const d = R.distance(m).data;
  ok(d[0] === 0 && d[12 * GW + 14] === 0 && d[12 * GW + 13] === CELL && d[12 * GW + 12] === 2 * CELL, 'distance: nodata cells are 0, the next ones 1 and 2 cells off');
}

// ---- 8. minFilter, resample, costField ----
{
  const mf = R.minFilter(P, 1);
  let low = 0, nd = 0;
  for (let k = 0; k < mf.data.length; k++) { if (mf.data[k] === mf.nodata) nd++; else if (mf.data[k] < PMIN) low++; }
  ok(low === 0, 'minFilter: no real minimum below the real heights (' + low + ')');
  ok(nd < offCount, 'minFilter: only points with no real neighbour stay nodata (' + nd + ')');
  const rs = R.resample(P, 20, 15, 'box');
  let rlow = 0;
  for (let k = 0; k < rs.data.length; k++) if (rs.data[k] !== rs.nodata && rs.data[k] < PMIN) rlow++;
  ok(rlow === 0, 'resample box: nodata does not pull a mean down (' + rlow + ')');
  const rsd = R.resample(PD, 20, 15, 'box');
  let dlow = 0;
  for (let k = 0; k < rsd.data.length; k++) if (rsd.data[k] < PMIN) dlow++;
  ok(dlow > 0, 'resample planted: -32768 as a height pulls ' + dlow + ' means down');
  const cost = R.make({ name: 'cost.t', w: GW, h: GH, cell: CELL, ox: 0, oy: 0, etype: 'f32', sample: 'cell', nodata: -1 });
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) cost.data[j * GW + i] = isOff(i, j) ? -1 : 1;
  const cf = R.costField(cost, [{ i: 5, j: 5 }]);
  let reached = 0;
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) if (isOff(i, j) && cf.dist.data[j * GW + i] !== -1) reached++;
  ok(reached === 0 && cf.dist.data[15 * GW + 30] > 0, 'costField: no nodata cell is reached, the far side is (round the block)');
}

// ---- 9. u16 heights (map.net version 0): nodata 65535, real heights offset positive ----
// the same rim and block as above on a u16 lattice grid as mapkit makes it for a version 0 map.net (scale 1, offset 0, the
// raw value is the height in u, so real heights sit well above 0) with nodata 65535: tint, topo, hillshade, slopeClass
// and contours must treat 65535 as no height exactly as -32768 on i16. Planted: the same grid with no nodata field reads
// 65535 as a 3277 m peak.
{
  const ND16 = 65535, OFF = 1000;
  const hgridU = (fn, o) => {
    o = o || {};
    const g = R.make({ name: 'height', w: GW, h: GH, cell: CELL, ox: -200, oy: -150, etype: 'u16', sample: 'lattice',
      nodata: o.plain || o.none ? null : ND16, meta: { unit: 'u', upm: 20 } });
    for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) g.data[j * GW + i] = !o.none && isOff(i, j) ? ND16 : fn(i, j) + OFF;
    return g;
  };
  const U = hgridU(plane), UD = hgridU(plane, { plain: true }), U0 = hgridU(plane, { none: true });
  const UF = hgridU(flat), UFD = hgridU(flat, { plain: true });
  ok(U.data instanceof Uint16Array && U.data[0] === ND16 && U.data[15 * GW + 25] === plane(25, 15) + OFF, 'u16: the grid holds 65535 on the rim and the offset heights inside');
  // slopeClass
  const ref = R.slopeClass(U0).data[15 * GW + 25];
  ok(ref === 3, 'u16 slopeClass: the plane is class 3 inside (' + ref + ')');
  const s = R.slopeClass(U).data;
  let offBad = 0, validBad = 0;
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
    const k = j * GW + i;
    if (isOff(i, j)) { if (s[k] !== 0) offBad++; } else if (s[k] !== ref) validBad++;
  }
  ok(offBad === 0 && validBad === 0, 'u16 slopeClass: nodata class 0, every real point the plane class 3 (' + offBad + ', ' + validBad + ' not)');
  let steep = 0;
  const sd = R.slopeClass(UD).data;
  for (let k = 0; k < sd.length; k++) if (sd[k] >= 10) steep++;
  ok(steep > 50, 'u16 slopeClass planted: 65535 as a height gives ' + steep + ' steep cells');
  // hillshade
  const sf = R.hillshade(UF, { z: 2 }).data;
  let notFlat = 0;
  for (let k = 0; k < sf.length; k++) if (sf[k] !== 128) notFlat++;
  ok(notFlat === 0, 'u16 hillshade: flat ground with a nodata rim and block is 128 everywhere (' + notFlat + ' not)');
  const sfd = R.hillshade(UFD, { z: 2 }).data;
  let lit = 0;
  for (let k = 0; k < sfd.length; k++) if (sfd[k] !== 128) lit++;
  ok(lit > 50, 'u16 hillshade planted: 65535 as a height lights ' + lit + ' points');
  const s0 = R.hillshade(U0, { z: 2 }).data, sp = R.hillshade(U, { z: 2 }).data;
  let out = 0, hOff = 0;
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
    const k = j * GW + i;
    if (isOff(i, j)) { if (sp[k] !== 128) hOff++; } else if (Math.abs(sp[k] - s0[k]) > 1) out++;
  }
  ok(hOff === 0 && out === 0, 'u16 hillshade: nodata flat 128, the plane shades as without nodata (' + hOff + ', ' + out + ' off)');
  const h5 = R.hillshade(Object.assign({}, U, { cell: 5 })), h50 = R.hillshade(Object.assign({}, U0, { cell: 5 }));
  ok(h5.meta.reliefDeg === h50.meta.reliefDeg && h5.meta.z === h50.meta.z, 'u16 hillshade: auto z sees the real slope (' + h5.meta.reliefDeg + ' / ' + h50.meta.reliefDeg + ')');
  // tint
  const t = R.tint(U, stops);
  let a0 = 0, aBad = 0;
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
    const a = t.data[(j * GW + i) * 4 + 3];
    if (isOff(i, j)) { if (a === 0) a0++; else aBad++; } else if (a !== 255) aBad++;
  }
  ok(a0 === offCount && aBad === 0, 'u16 tint: alpha 0 exactly where the own lattice point is nodata (' + a0 + ' of ' + offCount + ', ' + aBad + ' wrong)');
  ok(t.meta.min >= PMIN + OFF && t.meta.max <= PMAX + OFF, 'u16 tint: range from the real heights only (' + t.meta.min + '..' + t.meta.max + ')');
  const td = R.tint(UD, stops);
  ok(td.meta.max > 60000, 'u16 tint planted: 65535 as a height pulls the range to ' + td.meta.max);
  // topo
  const tp = R.topo(U, { made: 'x' });
  let diff = 0;
  for (let k = 0; k < GW * GH; k++) if ((tp.grid.data[k * 4 + 3] === 0) !== (t.data[k * 4 + 3] === 0)) diff++;
  ok(diff === 0, 'u16 topo: transparent where the tint is (' + diff + ' differ)');
  ok(tp.grid.meta.min >= PMIN + OFF && tp.grid.meta.max <= PMAX + OFF, 'u16 topo: range from the real heights (' + tp.grid.meta.min + '..' + tp.grid.meta.max + ')');
  const tpd = R.topo(UD, { made: 'x' });
  ok(tpd.grid.meta.max > 60000 && tpd.grid.data[3] === 255, 'u16 topo planted: 65535 as a height is drawn and pulls the range to ' + tpd.grid.meta.max);
  const sh = R.make({ name: 'shade', w: GW, h: GH, cell: CELL, ox: -200, oy: -150, etype: 'u8', sample: 'lattice', meta: { alt: 45, flat: 128 } });
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) sh.data[j * GW + i] = isOff(i, j) ? 0 : 128;
  const ts = R.topo(U, { shade: sh, made: 'x' });
  const kb = 12 * GW + 13;
  ok([0, 1, 2, 3].every(q => ts.grid.data[kb * 4 + q] === t.data[kb * 4 + q]), 'u16 topo: a pixel beside the block is not darkened by the nodata corners');
  // contours
  const valid = (i, j) => i >= 0 && j >= 0 && i < GW && j < GH && !isOff(i, j);
  const bad = res => {
    let n = 0;
    for (const l of res.lines) for (const [x, y] of l.pts) {
      const fx = (x + 200) / CELL, fy = (y + 150) / CELL, rx = Math.round(fx), ry = Math.round(fy);
      let good;
      if (Math.abs(fx - rx) < 0.02 && Math.abs(fy - ry) < 0.02) good = valid(rx, ry);
      else if (Math.abs(fx - rx) < 0.02) good = valid(rx, Math.floor(fy)) && valid(rx, Math.floor(fy) + 1);
      else if (Math.abs(fy - ry) < 0.02) good = valid(Math.floor(fx), ry) && valid(Math.floor(fx) + 1, ry);
      else good = false;
      if (!good) n++;
    }
    return n;
  };
  const c = R.contours(U, { simplify: 0 }), c0 = R.contours(U0, { simplify: 0 });
  ok(c.lines.length > 0 && bad(c) === 0, 'u16 contours: ' + c.lines.length + ' lines, no point enters a cell with a nodata corner (' + bad(c) + ')');
  ok(c.lines.length > c0.lines.length, 'u16 contours: the block splits the lines (' + c.lines.length + ' > ' + c0.lines.length + ')');
  ok(c.lines.every(l => l.level * 20 > PMIN + OFF && l.level * 20 <= PMAX + OFF), 'u16 contours: every level within the real heights');
  ok(R.contours(UF).lines.length === 0, 'u16 contours: flat ground with nodata has no line');
  const cd = R.contours(UFD);
  ok(cd.lines.length > 0, 'u16 contours planted: 65535 as a height draws ' + cd.lines.length + ' lines round the nodata');
}

if (fail) { console.log('FAIL mapviz raster-nodata: ' + fail + ' failed, ' + pass + ' passed'); process.exit(1); }
console.log('PASS mapviz raster-nodata (' + pass + ')');
if (!process.argv[2]) { try { fs.rmSync(W, { recursive: true, force: true }); } catch (e) { /* the OS clears its temp folder */ } }

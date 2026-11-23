// paint staff (MV-PNT1 part b): the Staff map style, ink and wash on cream paper 9; survey art.md
// section 5 A; contract: tools/mapviz/README.md 1.12 "paint", section 4.3 style module).
//   ID 'staff', VERSION 1, NEEDS ['height'], WANTS [shade, gtype, material, water.band, water.drown, objects]
//   draw(input, opts) -> {grid, gaps, notes, stats, approx}
// Layers, bottom to top: paper -> hypsometric tint (6 bands of styles.staff.tint over the height range) -> wood wash with a
// darker edge -> relief from four directions (the shade layer, raster hillshade: multiply toward relief.dark below flat,
// toward relief.light above) -> contours (index every fifth, numerals with a halo; not on a thumbnail) -> water = the
// three masks of design 5.1 (no prone, swim, drown; fill, band hatch, shore line; water that only looks wet is land) ->
// roads (casing and fill; country road with a dashed casing; decals) -> walls -> buildings (offset shadow, fill, outline)
// -> tree stamps (not on a thumbnail) -> paper grain over the whole sheet.
// No game branch: AS64, MoW:AS2 and GoH draw by the same rules from the shared layers (paint draft 0); the shared input
// helpers carry every game difference (GoH ground type 10 forest in woodMask, roads by material name). Mask hatches
// (outside pather, no ground) and marks are drawn by the shared files after this style.
// Light at load: the drawing code (draw.js) and the shared helpers are required inside draw().
// Author: Imperator_Aug (ARSENAL, ia-9f241035)
'use strict';

const ID = 'staff';
const VERSION = 1;
const NEEDS = ['height'];
const WANTS = ['shade', 'gtype', 'material', 'water.band', 'water.drown', 'objects'];

function draw(input, opts) {
  return require('./draw').draw(input, opts);
}

module.exports = { ID, VERSION, NEEDS, WANTS, draw };

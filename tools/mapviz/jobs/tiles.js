// jobs/tiles: the tile store (tools/mapviz/README.md section 5.2). Sync.
//   cut(picFile, outDir, o) -> {zmax, count}   o = {z?: 'all' | n, progress?, cutTile?}. Reads an rgba8 picture grid
//     (pic.<base>.mvg) and writes outDir/<z>/<x>_<y>.png for every tile of the asked levels. outDir is the tile set's own
//     folder (the runner gives <entry>/tiles/<base>). No tile maths here (README 1.5, 5.2): the levels and tile counts
//     come from raster tileLevels and every tile's pixels from raster cutTile (lib/raster/index.js); this file loops over
//     what tileLevels answers and writes the PNGs. o.cutTile and o.tileLevels replace them (tests; both or neither).
//     Throws MvError MV_NOT_BUILT when raster has no cutTile or tileLevels yet, MV_NOT_FOUND when the picture is absent,
//     MV_USAGE for a bad --z or a picture that is not rgba8, MV_FAULT when cutTile answers something that is not a
//     256 x 256 picture or tileLevels answers no level list.
//   batch(dir, z, list) -> [{t, png: base64} | {t, missing: true}]   list = ['x.y', ...] or 'x.y,x.y' (at most 16, in the
//     order asked); dir = the tile set's folder. The GET tiles route wraps it in the section 5.2 envelope.
// Author: Imperator_Aug (ARSENAL, ia-d9a4e239)
'use strict';
const fs = require('fs'), path = require('path');
const mv = require('../mapviz');
const gridfile = require('../lib/raster/gridfile');
const png = require('../lib/raster/png');

const TILE = 256, MAX_BATCH = 16;

function raster() { return mv.opt(() => require('../lib/raster'), '../lib/raster', __filename); }
function rasterCutTile() {
  const r = raster();
  return r && typeof r.cutTile === 'function' ? r.cutTile : null;
}
function rasterTileLevels() {
  const r = raster();
  return r && typeof r.tileLevels === 'function' ? r.tileLevels : null;
}

function cut(picFile, outDir, o) {
  o = o || {};
  if (!picFile || !fs.existsSync(picFile)) throw new mv.MvError('MV_NOT_FOUND', 'no picture ' + picFile);
  let g;
  try { g = gridfile.read(picFile); } catch (e) { throw new mv.MvError('MV_USAGE', 'picture ' + path.basename(picFile) + ' is not a grid file: ' + e.message, { code: e.code }); }
  if (g.etype !== 'rgba8') throw new mv.MvError('MV_USAGE', 'tiles need an rgba8 picture; ' + path.basename(picFile) + ' is ' + g.etype);
  const cutTile = o.cutTile || rasterCutTile();
  const tileLevels = o.tileLevels || rasterTileLevels();
  if (!cutTile || !tileLevels) throw new mv.MvError('MV_NOT_BUILT', 'raster ' + (!cutTile ? 'cutTile' : 'tileLevels') + ' is not built yet (MV-RAS, wave A)', { id: 'MV-RAS', wave: 'A' });
  const L = tileLevels(g.w, g.h);
  if (!L || !Number.isInteger(L.zmax) || !Array.isArray(L.levels) || L.levels.length !== L.zmax + 1)
    throw new mv.MvError('MV_FAULT', 'raster tileLevels gave no level list for ' + g.w + ' x ' + g.h);
  let zs = L.levels;
  if (o.z !== undefined && o.z !== null && o.z !== 'all') {
    const z = Number(o.z);
    if (!Number.isInteger(z) || z < 0 || z > L.zmax) throw new mv.MvError('MV_USAGE', '--z must be all or a level from 0 to ' + L.zmax + ', got ' + o.z);
    zs = [L.levels[z]];
  }
  const total = zs.reduce((s, l) => s + l.nx * l.ny, 0);
  const p = o.progress || null;
  if (p) p.stage('tiles', total);
  let count = 0;
  for (const l of zs) {
    const d = path.join(outDir, String(l.z));
    fs.mkdirSync(d, { recursive: true });
    for (let ty = 0; ty < l.ny; ty++) for (let tx = 0; tx < l.nx; tx++) {
      const t = cutTile(g, l.z, tx, ty);
      if (!t || t.w !== TILE || t.h !== TILE || !t.rgba || t.rgba.length !== TILE * TILE * 4)
        throw new mv.MvError('MV_FAULT', 'cutTile gave no 256 x 256 picture for tile ' + l.z + '/' + tx + '_' + ty);
      fs.writeFileSync(path.join(d, tx + '_' + ty + '.png'), png.encode(t));
      count++;
      if (p) p.step();
    }
  }
  return { zmax: L.zmax, count };
}

function batch(dir, z, list) {
  if (typeof list === 'string') list = list.split(',').filter(Boolean);
  if (!Array.isArray(list)) throw new mv.MvError('MV_USAGE', 'tiles: t must be a list such as 0.0,1.0');
  if (list.length > MAX_BATCH) throw new mv.MvError('MV_USAGE', 'tiles: at most ' + MAX_BATCH + ' tiles per answer, asked ' + list.length);
  const zn = Number(z);
  if (!Number.isInteger(zn) || zn < 0 || zn > 30) throw new mv.MvError('MV_USAGE', 'tiles: z must be a level from 0, got ' + z);
  for (const t of list) if (typeof t !== 'string' || !/^\d{1,6}\.\d{1,6}$/.test(t)) throw new mv.MvError('MV_USAGE', 'tiles: ' + t + ' is not x.y');
  return list.map(t => {
    const [x, y] = t.split('.');
    try { return { t, png: fs.readFileSync(path.join(dir, String(zn), Number(x) + '_' + Number(y) + '.png')).toString('base64') }; }
    catch (e) { return { t, missing: true }; }
  });
}

module.exports = { TILE, MAX_BATCH, cut, batch, rasterCutTile, rasterTileLevels };

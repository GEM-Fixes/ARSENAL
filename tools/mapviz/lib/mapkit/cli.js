// mapkit cli (MV-KIT): `node tools/mapviz/mapviz.js mapkit <command> [flags]` (tools/mapviz/README.md section 1.1).
//   list  --target T [--game G] [--mods a,b] [--mod-dir D] [--out D] [--json]
//   doc   common + --map K [--mode M] [--out D | --json]
//   grids common + --map K --out D [--mode M]
//   cell  common + --map K --at x,y [--mode M] [--json]
// Light at load: nothing is read and nothing heavy is required until run.
// Author: Imperator_Aug (ARSENAL, ia-4aa946ba)
'use strict';
const path = require('path');

const VERSION = 2;   // = index.js VERSION
const SPEC = { at: 'str' };
const COMMON = '--target T [--game G] [--mods a,b] [--mod-dir D]';

function mv() { return require('../../mapviz'); }
const json = x => JSON.stringify(x) + '\n';
const out = s => process.stdout.write(s);

function srcOf(o) {
  const M = mv();
  if (!o.target) throw new M.MvError('MV_USAGE', '--target as64|mowas2|goh is needed');
  return require('./source').source({ target: o.target, game: o.game, mods: o.mods, modDirs: o.modDirs });
}
function needMap(o) {
  if (!o.map) throw new (mv().MvError)('MV_USAGE', '--map <map key> is needed');
  return o.map;
}
function writeJson(dir, name, x) { return mv().writeAtomic(path.join(dir, name), json(x)); }
function writeReads(dir, src) { return writeJson(dir, 'reads.json', { v: 1, inputs: src.reads() }); }

function cmdList(o) {
  const src = srcOf(o);
  const maps = require('./source').list(src);
  const body = { v: 1, target: src.target, game: src.game, stack: { mods: src.mods.slice(), hash: src.stackHash }, maps };
  if (o.out) {
    const dir = mv().checkOut(o.out, { gameDir: src.game, target: o.target });
    writeJson(dir, 'maps.json', body);
    writeReads(dir, src);
  }
  if (o.json) out(json(body));
  else if (!o.out || !o.q) out(maps.map(m => m.key + '\t' + m.source + '\t' + m.modes.join(',')).join('\n') + (maps.length ? '\n' : ''));
  return 0;
}

function cmdDoc(o) {
  const key = needMap(o), src = srcOf(o);
  const d = require('./mapdoc').doc(src, key, { mode: o.mode });
  if (o.out) {
    const dir = mv().checkOut(o.out, { gameDir: src.game, target: o.target });
    writeJson(dir, 'mapdoc.json', d);
    writeReads(dir, src);
    if (o.json) out(json({ v: 1, map: key, files: ['mapdoc.json', 'reads.json'], notes: d.notes }));
    return 0;
  }
  if (o.json) { out(json(d)); return 0; }
  const lines = [
    'map ' + d.key + ' (' + d.game + ') cell ' + d.cell + ' w ' + d.net.w + ' h ' + d.net.h + ' offX ' + d.net.offX + ' offY ' + d.net.offY + ' version ' + d.net.version,
    'world ' + d.boxes.world.join(' ') + '  water ' + d.water.level + ' (' + d.water.source + ')',
  ];
  for (const m of d.modes) lines.push('mode ' + m.id + ': ' + m.spawns.length + ' spawns, ' + m.flags.length + ' flags, ' + m.points.length + ' points' + (m.water === null ? '' : ', water ' + m.water));
  lines.push(d.entities.length + ' entities, ' + d.covers.length + ' covers, pictures ' + Object.keys(d.pictures).filter(k => d.pictures[k]).join(',') + (Object.values(d.pictures).some(Boolean) ? '' : 'none'));
  for (const n of d.notes) lines.push('note ' + n.code + ': ' + n.text);
  out(lines.join('\n') + '\n');
  return 0;
}

function cmdGrids(o) {
  const M = mv();
  const key = needMap(o);
  if (!o.out) throw new M.MvError('MV_USAGE', '--out <folder> is needed for grids');
  const src = srcOf(o);
  const dir = M.checkOut(o.out, { gameDir: src.game, target: o.target });
  const g = require('./grids').grids(src, key, { mode: o.mode });
  const gf = require('../raster/gridfile');
  const files = [];
  for (const grid of [g.height, g.gtype, g.gtypeStored, g.material]) {
    const name = grid.name + '.mvg';
    gf.write(path.join(dir, name), grid);
    files.push(name);
  }
  const body = { v: 1, map: key, mode: o.mode || null, w: g.W, files, notes: g.notes };
  writeJson(dir, 'grids.json', body);
  writeReads(dir, src);
  if (o.json) out(json(Object.assign({}, body, { patches: g.patches })));
  else if (!o.q) out('grids of ' + key + (o.mode ? ' (' + o.mode + ')' : '') + ': ' + files.join(' ') + '; W ' + g.W + '; patches ' + g.patches.applied + ' laid, ' + g.patches.skipped + ' skipped\n');
  return 0;
}

function cmdCell(o) {
  const M = mv();
  const key = needMap(o);
  const at = o.extra.at;
  const m = at === undefined ? null : /^\s*(-?[\d.]+(?:e[-+]?\d+)?)\s*,\s*(-?[\d.]+(?:e[-+]?\d+)?)\s*$/i.exec(String(at));
  if (!m || !Number.isFinite(Number(m[1])) || !Number.isFinite(Number(m[2]))) throw new M.MvError('MV_USAGE', '--at x,y is needed (world units), got ' + at);
  const x = Number(m[1]), y = Number(m[2]);
  const src = srcOf(o);
  const D = require('./mapdoc'), K = require('./index');
  const { net } = D.loadNet(src, key);
  const n = { w: net.width, h: net.height, offX: net.offX, offY: net.offY, cell: net.cell };
  const c = K.worldToCell(n, x, y);
  if (!c) throw new M.MvError('MV_NOT_FOUND', 'point ' + x + ',' + y + ' is outside the grid of ' + key, { map: key, at: [x, y] });
  const g = require('./grids').grids(src, key, { mode: o.mode });
  const k = c.j * n.w + c.i;
  const raw = g.height.data[k], h = g.height.nodata !== null && raw === g.height.nodata ? null : raw;   // null: past the ground mesh
  const r = { v: 1, i: c.i, j: c.j, h, hM: h === null ? null : h / 20, type: g.gtype.data[k], typeStored: g.gtypeStored.data[k], material: g.material.data[k] };
  if (o.json) out(json(r));
  else out('cell ' + r.i + ',' + r.j + ' h ' + r.hM + ' type ' + r.type + ' material ' + r.material + ' stored ' + r.typeStored + '\n');
  return 0;
}

const RUN = { list: cmdList, doc: cmdDoc, grids: cmdGrids, cell: cmdCell };

module.exports = {
  part: 'mapkit',
  version: VERSION,
  summary: 'map list, mapdoc and base grids',
  commands: {
    list: { args: '--target T [--game G] [--mods a,b] [--mod-dir D] [--out D] [--json]', summary: 'maps of a game and stack' },
    doc: { args: COMMON + ' --map K [--mode M] [--out D | --json]', summary: 'mapdoc/1 of one map' },
    grids: { args: COMMON + ' --map K --out D [--mode M]', summary: 'height, gtype, gtype.stored and material grids' },
    cell: { args: COMMON + ' --map K --at x,y [--mode M] [--json]', summary: 'height, type and material of the cell under a point' },
  },
  run(argv) {
    const M = mv();
    const cmd = argv[0];
    if (!RUN[cmd]) throw new M.MvError('MV_USAGE', 'no mapkit command ' + cmd);
    const o = M.parseArgs(argv.slice(1), SPEC);
    if (o.pos.length) throw new M.MvError('MV_USAGE', 'unexpected argument ' + o.pos[0]);
    return RUN[cmd](o);
  },
};

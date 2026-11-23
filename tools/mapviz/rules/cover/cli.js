// cover cli (MV-COV): `node tools/mapviz/mapviz.js cover <command> [flags]` (rules.md 4.4 of waves C and D).
//   map      common + --map K [--mode M] [--in D]... --out D [--json]
//            writes cover.edges.json, cover.points.json, cover.band.mvg, cover.lip.mvg, cover.conceal.mvg, reads.json.
//            --in folders: mapdoc.json (mapkit doc), height.mvg + gtype.mvg (mapkit grids), water.band.mvg (water masks),
//            entcat.json + objects.json (entcat map) are taken from there when present, else read from the game.
//            Exit 0; 1 when defs failed in the catalogue (their objects are skipped and listed); 3 map or mode not found.
//   profile  common [--json]   the per-game cover numbers
// --progress of map: stages 'read' (4000: doc, grids, water band, catalogue and solids), 'edges', 'probes', 'lip',
//   'conceal' (1000 each, fed by each call's o.tick), 'write' (6 steps).
// Light at load: nothing heavy is required until run.
// Author: Imperator_Aug (ARSENAL, ia-1c6dca19)
'use strict';
const path = require('path');
const fs = require('fs');

const VERSION = 1;   // = index.js VERSION
const SPEC = {};
const COMMON = '--target T [--game G] [--mods a,b] [--mod-dir D]';

function mv() { return require('../../mapviz'); }
const json = x => JSON.stringify(x) + '\n';
const out = s => process.stdout.write(s);
const err = s => { if (s) process.stderr.write(s); };

function srcOf(o) {
  const M = mv();
  if (!o.target) throw new M.MvError('MV_USAGE', '--target as64|mowas2|goh is needed');
  return require('../../lib/mapkit').source({ target: o.target, game: o.game, mods: o.mods, modDirs: o.modDirs });
}

const UNIT = 1000;
function sub(P, base) {
  return P ? { tick: (d, t) => P.set(base + Math.round(UNIT * (t > 0 ? Math.min(1, Math.max(0, d / t)) : 1))) } : {};
}
function readJson(M, file, what) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) {
    throw new M.MvError('MV_USAGE', 'cover: ' + path.basename(file) + ' in --in is not JSON (' + what + ')', { code: 'COVER_IN' });
  }
}

// read stage: doc, grids, water band, catalogue + objects + solids
function readIn(o, src, key, P) {
  const M = mv(), K = require('../../lib/mapkit'), gf = require('../../lib/raster/gridfile');
  const E = require('../../entcat');
  const dirs = o.in || [];
  const notes = [];
  const extraReads = [];
  // the doc
  const docFile = M.findIn(dirs, 'mapdoc.json');
  let doc;
  if (docFile) {
    doc = readJson(M, docFile, 'mapdoc');
    if (doc.key && doc.key !== key) throw new M.MvError('MV_USAGE', 'cover: mapdoc.json in --in is of map ' + doc.key + ', not ' + key, { code: 'COVER_IN' });
    extraReads.push({ kind: 'loose', file: docFile });
  } else doc = K.doc(src, key, { mode: o.mode });
  if (o.mode && doc.modes && !doc.modes.some(m => m.id === o.mode)) throw new M.MvError('MV_NOT_FOUND', 'map ' + key + ' has no mode ' + o.mode, { map: key, mode: o.mode });
  P.set(UNIT);
  // the grids
  const gfile = M.findIn(dirs, 'gtype.mvg');
  let grids;
  if (gfile) {
    const dir = path.dirname(gfile);
    const rd = name => { const f = path.join(dir, name); if (!fs.existsSync(f)) return null; try { return gf.read(f); } catch (e) { throw new M.MvError('MV_USAGE', 'cover: ' + name + ' in --in cannot be read: ' + e.message, { code: 'COVER_GRID' }); } };
    grids = { height: rd('height.mvg'), gtype: rd('gtype.mvg') };
    if (!grids.height) throw new M.MvError('MV_USAGE', 'cover: --in has gtype.mvg but no height.mvg', { code: 'COVER_GRID' });
  } else grids = K.grids(src, key, Object.assign({ mode: o.mode }, sub(P, UNIT)));
  P.set(2 * UNIT);
  // the water band
  const bfile = M.findIn(dirs, 'water.band.mvg');
  if (bfile) grids.band = gf.read(bfile);
  else {
    try {
      const Wt = require('../water');
      const mk = Wt.masks(doc, grids, Wt.profile(src), o.mode, sub(P, 2 * UNIT));
      grids.band = mk.band;
    } catch (e) {
      notes.push({ code: 'COVER_NO_WATER', msg: 'water bands not read (' + (e.code || e.message) + '): only the ground types refuse places' });
    }
  }
  P.set(3 * UNIT);
  // the catalogue, the objects and the solids
  const sub0 = E.docForMode(doc, o.mode);
  const catFile = M.findIn(dirs, 'entcat.json'), objFile = M.findIn(dirs, 'objects.json');
  let cat, objects, L = null;
  const links = E.linksFor(src, key, sub0, { mode: o.mode });   // null: the doc carries its links
  if (catFile && objFile) {
    cat = readJson(M, catFile, 'entcat');
    const ob = readJson(M, objFile, 'objects');
    if (!cat || typeof cat.entries !== 'object' || !ob || !Array.isArray(ob.items)) throw new M.MvError('MV_USAGE', 'cover: entcat.json or objects.json in --in has the wrong shape', { code: 'COVER_IN' });
    objects = ob.items;
    extraReads.push({ kind: 'loose', file: catFile }, { kind: 'loose', file: objFile });
  } else {
    L = E.loaderFor(src);
    cat = E.forDoc(src, sub0, { loader: L, links });
    objects = E.place(sub0, cat, links);
  }
  let placed = null;
  try {
    if (typeof E.placeSolids === 'function') {
      if (!L) L = E.loaderFor(src);
      placed = E.placeSolids(sub0, cat, L, grids, { links });
      // a def that failed in the catalogue is listed once under skipped, not once per object
      const failedDefs = new Set(((cat && cat.failed) || []).map(f => f.def));
      for (const n of placed.notes || []) if (n.code !== 'ENTCAT_DEF_MISSING' && !failedDefs.has(n.def)) notes.push({ code: n.code, msg: (n.uid === null ? '' : n.uid + ' ' + n.def + ': ') + n.msg });
    }
  } catch (e) {
    placed = null;
    notes.push({ code: 'COVER_NO_SOLIDS', msg: 'entcat placeSolids failed (' + (e.code || e.message) + '): footprints stand in' });
  }
  P.set(4 * UNIT);
  return { doc, grids, cat, objects, placed, L, notes, extraReads };
}

function cmdMap(o) {
  const M = mv();
  const key = o.map;
  if (!key) throw new M.MvError('MV_USAGE', '--map <map key> is needed');
  if (!o.out) throw new M.MvError('MV_USAGE', '--out <folder> is needed for cover map');
  const P = M.progress(o);
  P.stage('read', 4 * UNIT);
  const src = srcOf(o);
  P.set(0);
  const dir = M.checkOut(o.out, { gameDir: src.game, target: o.target });
  const C = require('./index'), gf = require('../../lib/raster/gridfile');
  const prof = C.profile(o.target);
  const r = readIn(o, src, key, P);
  const notes = r.notes.slice();
  P.stage('edges', UNIT);
  const edges = C.edges(r.doc, r.cat, r.objects, { mode: o.mode });
  P.set(UNIT);
  P.stage('probes', UNIT);
  const walls = C.points(r.doc, r.grids, r.cat, r.objects, r.placed, Object.assign({ profile: prof }, sub(P, 0)));
  for (const n of walls.notes) if (!notes.some(x => x.code === n.code)) notes.push(n);
  P.set(UNIT);
  P.stage('lip', UNIT);
  const lp = C.lip(r.grids, Object.assign({ profile: prof, objects: r.objects, near: walls }, sub(P, 0)));
  P.set(UNIT);
  P.stage('conceal', UNIT);
  const cc = C.conceal(r.doc, r.grids, r.placed, Object.assign({ profile: prof, objects: r.objects, catalog: r.cat, near: walls.concat(lp.points) }, sub(P, 0)));
  P.set(UNIT);
  const all = require('./edges').sortItems(walls.concat(lp.points, cc.points));
  const band = C.bandGrid(all, r.grids);
  const ec = edges.counts;
  if (ec.nocover) notes.push({ code: 'COVER_NOCOVER', msg: ec.nocover + ' objects carry tag nocover and give no cover' });
  P.stage('write', 6);
  const files = [];
  const vec = (name, items) => { M.writeAtomic(path.join(dir, name + '.json'), json({ v: 1, kind: 'vector', name, items })); files.push(name + '.json'); P.step(); };
  vec('cover.edges', edges);
  vec('cover.points', all);
  for (const g of [band, lp.lip, cc.conceal]) { gf.write(path.join(dir, g.name + '.mvg'), g); files.push(g.name + '.mvg'); P.step(); }
  if (r.L) src.addInputs(require('../../entcat').readsOf(r.L));
  if (r.extraReads.length) src.addInputs(r.extraReads);
  M.writeAtomic(path.join(dir, 'reads.json'), json({ v: 1, inputs: src.reads() }));
  files.push('reads.json');
  P.step();
  const failed = (r.cat && r.cat.failed) || [];
  const byType = {};
  for (const p of all) byType[p.type] = (byType[p.type] || 0) + 1;
  const sum = { v: 1, map: key, mode: o.mode || null, game: prof.game, files,
    counts: { edges: ec.edges, rings: ec.rings, sectors: ec.sectors, points: all.length, byType, band: band.meta.counts,
      lip: { cells: lp.counts.cells, points: lp.counts.points, used: lp.lip.meta.used }, conceal: cc.conceal.meta.counts,
      zones: walls.counts.zones, probes: walls.counts.probes, solids: walls.counts.solids, source: walls.counts.source },
    skipped: failed.map(f => ({ def: f.def, code: f.code })), notes };
  if (o.json) out(json(sum));
  else if (!o.q) {
    out('cover of ' + key + (o.mode ? ' (' + o.mode + ')' : '') + ' [' + prof.game + ']: ' + ec.edges + ' edges, ' + ec.rings + ' rings, ' + ec.sectors +
      ' sectors; ' + all.length + ' points (' + Object.keys(byType).map(t => t + ':' + byType[t]).join(' ') + '); lip ' + lp.counts.cells + ' cells' +
      (prof.lipForProne ? '' : ' (not used for prone)') + '\n');
    for (const n of notes) out('note ' + n.code + ': ' + n.msg + '\n');
    err(failed.map(f => 'skipped ' + f.def + ' ' + f.code + '\n').join(''));
  }
  return failed.length ? 1 : 0;
}

function cmdProfile(o) {
  const M = mv();
  if (!o.target) throw new M.MvError('MV_USAGE', '--target as64|mowas2|goh is needed');
  const C = require('./index');
  const prof = C.profile(o.target);
  if (o.json) { out(json(Object.assign({ v: 1, target: o.target }, prof))); return 0; }
  out(Object.keys(prof).map(k => k + '\t' + JSON.stringify(prof[k])).join('\n') + '\n');
  return 0;
}

const RUN = { map: cmdMap, profile: cmdProfile };

module.exports = {
  part: 'cover',
  version: VERSION,
  summary: 'cover edges, engine cover points, terrain lip and concealment',
  commands: {
    map: { args: COMMON + ' --map K [--mode M] [--in D] --out D [--json]', summary: 'cover.edges, cover.points, cover.band, cover.lip, cover.conceal' },
    profile: { args: COMMON + ' [--json]', summary: 'the per-game cover numbers' },
  },
  run(argv) {
    const M = mv();
    const cmd = argv[0];
    if (!RUN[cmd]) throw new M.MvError('MV_USAGE', 'no cover command ' + cmd);
    const o = M.parseArgs(argv.slice(1), SPEC);
    if (o.pos.length) throw new M.MvError('MV_USAGE', 'unexpected argument ' + o.pos[0]);
    return RUN[cmd](o);
  },
};

// water cli (MV-WAT): `node tools/mapviz/mapviz.js water <command> [flags]` (tools/mapviz/README.md section 1.8).
//   masks   common + --map K [--mode M] [--in D]... --out D [--json]
//           writes water.band.mvg, water.drown.mvg, water.depth.mvg, water.labels.json, water.checks.json, reads.json.
//           --in folders: mapdoc.json (mapkit doc --out) and height.mvg, gtype.mvg, gtype.stored.mvg, material.mvg,
//           grids.json (mapkit grids --out) are taken from there when present, else read from the game.
//   profile common [--json]   the drown depth of each vehicle class and where it came from (stack or vanilla)
// --progress of masks: stage 'read' (3000: doc, grids, profile; mapkit grids gets the tick when it reads the game),
//   'masks' (3000: masks, labels, checks, each fed by its own o.tick(done, total)), 'write' (4: a step after each grid file, one for the rest).
// Light at load: nothing heavy is required until run.
// Author: Imperator_Aug (ARSENAL, ia-e814fa85)
'use strict';
const path = require('path');
const fs = require('fs');

const VERSION = 2;   // = index.js VERSION
const SPEC = {};
const COMMON = '--target T [--game G] [--mods a,b] [--mod-dir D]';

function mv() { return require('../../mapviz'); }
const json = x => JSON.stringify(x) + '\n';
const out = s => process.stdout.write(s);

function srcOf(o) {
  const M = mv();
  if (!o.target) throw new M.MvError('MV_USAGE', '--target as64|mowas2|goh is needed');
  return require('../../lib/mapkit').source({ target: o.target, game: o.game, mods: o.mods, modDirs: o.modDirs });
}

// UNIT: progress units of one phase; sub(P, base): options whose tick(done, total) maps a call's own progress onto
// P.set in base..base+UNIT of the stage (a call that does not know o.tick just ignores it)
const UNIT = 1000;
function sub(P, base) {
  return P ? { tick: (d, t) => P.set(base + Math.round(UNIT * (t > 0 ? Math.min(1, Math.max(0, d / t)) : 1))) } : {};
}

// P: the progress reporter of stage 'read' (3 x UNIT: the doc, the grids, the profile)
function readIn(o, src, key, P) {
  const M = mv(), K = require('../../lib/mapkit'), gf = require('../../lib/raster/gridfile');
  let ph = 0;
  const step = () => { ph++; if (P) P.set(ph * UNIT); };
  const dirs = o.in || [];
  const docFile = M.findIn(dirs, 'mapdoc.json');
  let doc = null;
  if (docFile) {
    try { doc = JSON.parse(fs.readFileSync(docFile, 'utf8')); } catch (e) { throw new M.MvError('MV_USAGE', 'water: ' + path.basename(docFile) + ' in --in is not JSON'); }
    if (doc.key && doc.key !== key) throw new M.MvError('MV_USAGE', 'water: mapdoc.json in --in is of map ' + doc.key + ', not ' + key);
  } else doc = K.doc(src, key, { mode: o.mode });
  step();
  const gfile = M.findIn(dirs, 'gtype.mvg');
  let grids;
  if (gfile) {
    const dir = path.dirname(gfile);
    const rd = name => { const f = path.join(dir, name); return fs.existsSync(f) ? gf.read(f) : null; };
    let meta = null;
    try { meta = JSON.parse(fs.readFileSync(path.join(dir, 'grids.json'), 'utf8')); } catch (e) { meta = null; }
    grids = { height: rd('height.mvg'), gtype: rd('gtype.mvg'), gtypeStored: rd('gtype.stored.mvg'), material: rd('material.mvg'),
      W: meta && typeof meta.w === 'number' ? meta.w : undefined, notes: (meta && meta.notes) || [] };
    if (!grids.height) throw new M.MvError('MV_USAGE', 'water: --in has gtype.mvg but no height.mvg', { code: 'WATER_GRID' });
  } else grids = K.grids(src, key, Object.assign({ mode: o.mode }, sub(P, ph * UNIT)));
  step();
  return { doc, grids, fromIn: { doc: !!docFile, grids: !!gfile } };
}

function cmdMasks(o) {
  const M = mv();
  const key = o.map;
  if (!key) throw new M.MvError('MV_USAGE', '--map <map key> is needed');
  if (!o.out) throw new M.MvError('MV_USAGE', '--out <folder> is needed for water masks');
  // the reporter first: the source (a game index, ~1 s on GoH) is heard as the start of stage 'read'
  const P = M.progress(o);
  P.stage('read', 3 * UNIT);
  const src = srcOf(o);
  P.set(0);
  const dir = M.checkOut(o.out, { gameDir: src.game, target: o.target });
  const Wt = require('./index'), gf = require('../../lib/raster/gridfile');
  const { doc, grids } = readIn(o, src, key, P);
  const prof = Wt.profile(src);
  P.set(3 * UNIT);
  // stage 'masks': masks, labels, checks, one UNIT each, each fed by its own o.tick(done, total)
  P.stage('masks', 3 * UNIT);
  const mk = Wt.masks(doc, grids, prof, o.mode, sub(P, 0));
  P.set(UNIT);
  const labels = Wt.labels(doc, mk, prof, sub(P, UNIT));
  P.set(2 * UNIT);
  const checks = Wt.checks(doc, grids, mk, undefined, sub(P, 2 * UNIT));
  P.set(3 * UNIT);
  P.stage('write', 4);
  const files = [];
  for (const g of [mk.band, mk.drown, mk.depth]) { gf.write(path.join(dir, g.name + '.mvg'), g); files.push(g.name + '.mvg'); P.step(); }
  const vec = (name, items) => M.writeAtomic(path.join(dir, name + '.json'), json({ v: 1, kind: 'vector', name, items }));
  vec('water.labels', labels); files.push('water.labels.json');
  vec('water.checks', checks); files.push('water.checks.json');
  const notes = prof.notes.slice();
  const oc = doc.water && doc.water.ocean;
  if (oc && oc.active && typeof oc.zlevel === 'number' && Math.abs(oc.zlevel - mk.W) > 1e-6) {
    notes.push({ code: 'WATER_OCEAN_DRAW_ONLY', text: 'the ocean surface (zlevel ' + oc.zlevel + ') is drawn only; the rules use W ' + mk.W, at: null });
  }
  M.writeAtomic(path.join(dir, 'reads.json'), json({ v: 1, inputs: src.reads() }));
  files.push('reads.json');
  P.step();
  const sum = { v: 1, map: key, mode: o.mode || null, W: mk.W, files, counts: mk.counts, labels: labels.length,
    checks: checks.reduce((a, c) => { a[c.code] = (a[c.code] || 0) + 1; return a; }, {}), bits: mk.drown.meta.bits, notes };
  if (o.json) out(json(sum));
  else if (!o.q) {
    out('water of ' + key + (o.mode ? ' (' + o.mode + ')' : '') + ': W ' + mk.W + ', no prone ' + mk.counts.noProne + ' cells, swim ' + mk.counts.swim +
      ', a class drowns ' + mk.counts.drownAny + (mk.counts.offGround ? ', water past the ground mesh (no value) ' + mk.counts.offGround : '') +
      '; ' + labels.length + ' labels, ' + checks.length + ' checks\n');
    for (const n of notes) out('note ' + n.code + ': ' + n.text + '\n');
  }
  return 0;
}

function cmdProfile(o) {
  const src = srcOf(o);
  const prof = require('./index').profile(src);
  if (o.json) { out(json(prof)); return 0; }
  const lines = ['water profile of ' + src.target + ' (stack ' + (src.mods.length ? src.mods.join(',') : 'vanilla') + ')'];
  for (const c of prof.classes) {
    lines.push(c.id + '\t' + (c.depthM === null ? 'never' : c.depthM + ' m') + '\t' + c.source + (c.file ? '\t' + c.file + ':' + c.line : c.cite ? '\t' + c.cite : ''));
  }
  lines.push('no prone on types ' + prof.rules.noProne.join(',') + '; swim on ' + prof.rules.swim.join(',') + '; a prone order on type 3: ' + prof.rules.proneOnShallow);
  for (const n of prof.notes) lines.push('note ' + n.code + ': ' + n.text);
  out(lines.join('\n') + '\n');
  return 0;
}

const RUN = { masks: cmdMasks, profile: cmdProfile };

module.exports = {
  part: 'water',
  version: VERSION,
  summary: 'engine-true water bands, drown masks, labels and water checks',
  commands: {
    masks: { args: COMMON + ' --map K [--mode M] [--in D] --out D [--json]', summary: 'water.band, water.drown, water.depth, labels and checks' },
    profile: { args: COMMON + ' [--json]', summary: 'drown depth of each vehicle class and its source' },
  },
  run(argv) {
    const M = mv();
    const cmd = argv[0];
    if (!RUN[cmd]) throw new M.MvError('MV_USAGE', 'no water command ' + cmd);
    const o = M.parseArgs(argv.slice(1), SPEC);
    if (o.pos.length) throw new M.MvError('MV_USAGE', 'unexpected argument ' + o.pos[0]);
    return RUN[cmd](o);
  },
};

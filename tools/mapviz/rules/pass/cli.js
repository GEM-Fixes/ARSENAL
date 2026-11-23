// pass cli (MV-WAT): `node tools/mapviz/mapviz.js pass <command> [flags]` (tools/mapviz/README.md section 1.8).
//   terrain  common + --map K --kind k [--mode M] [--in D]... --out D [--json]
//            writes pass.<kind>.mvg, cost.<kind>.mvg, reads.json. --in folders: gtype.mvg (+ height.mvg, grids.json) of
//            mapkit grids and slopecls.mvg of raster terrain are taken from there when present, else made from the game.
//            height.mvg beside gtype.mvg is read also when slopecls.mvg is given: its nodata (R16) marks pass nodata.
//   profiles common [--json]   every pather profile of the stack and the profile of each unit kind (by its unit's PatherID)
// --progress of terrain: stage 'read' (3000: profiles, kind, grids; mapkit grids gets the tick when it reads the game),
//   'mask' (1000, fed by mask's o.tick(done, total)), 'write' (3: a step after each grid file, one for the rest).
// Exit 0 ok, 2 usage, 3 not found (map, mode, or a PatherID that pather.set does not hold).
// Wave C (MV-PAS), the same on as64, mowas2 and goh:
//   obstacles common + --map K --kind k [--mode M] [--in D]... --out D [--json]
//            obst.<kind>, move.<kind>, mcost.<kind>, reads.json. --in: mapdoc.json, gtype.mvg (+ height.mvg),
//            slopecls.mvg, pass.<kind>.mvg + cost.<kind>.mvg, entcat.json + objects.json; each absent one is computed
//            here through its owner (mapkit, pass terrain, entcat). Exit 1 when objects were skipped (listed).
//   travel   common + --map K --kind k [--mode M] [--phase n] [--in D]... --out D [--json]
//            travel.a.<kind>, travel.b.<kind>, travel.json, reads.json. --in: mapdoc.json, move.<kind>.mvg +
//            mcost.<kind>.mvg (else obstacles here), gtype.mvg (else mapkit grids here: K needs the ground type).
//            Exit 3 PASS_NO_SPAWN when a side has no spawn in the resolved phase (late R3: no --phase = the lowest phase
//            of the mode over spawns, flags and clips; one phase for both sides), or all its spawns lie outside the map
//            frame (some outside: note PASS_SPAWN_OUTSIDE). travel.json phase = the resolved phase.
//   routes   common + --map K --kind k [--mode M] [--phase n] [--seed n] [--in D]... --out D [--json]
//            routes.json, route.a.<kind>, route.b.<kind>, reads.json. --in as travel + travel.a/b.<kind>.mvg (else
//            travel here). Exit 1 when some pair has no route (listed).
//   mode absent: the first mode with spawns of both sides (speed.js modeOf)
// Author: Imperator_Aug (ARSENAL, ia-2069a70b)
'use strict';
const path = require('path');
const fs = require('fs');

const VERSION = 3;   // = index.js VERSION
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

function gridsOf(o, src, key, P, base) {
  const M = mv(), gf = require('../../lib/raster/gridfile');
  const dirs = o.in || [];
  const gfile = M.findIn(dirs, 'gtype.mvg'), sfile = M.findIn(dirs, 'slopecls.mvg');
  let gtype, height = null, W;
  if (gfile) {
    gtype = gf.read(gfile);
    try { const j = JSON.parse(fs.readFileSync(path.join(path.dirname(gfile), 'grids.json'), 'utf8')); W = j.w; } catch (e) { W = undefined; }
    // height.mvg also when slopecls.mvg is there: its nodata marks the cells past the ground mesh (R16)
    const hf = path.join(path.dirname(gfile), 'height.mvg');
    if (fs.existsSync(hf)) height = gf.read(hf);
  } else {
    const g = require('../../lib/mapkit').grids(src, key, Object.assign({ mode: o.mode }, sub(P, base || 0)));
    gtype = g.gtype; height = g.height; W = g.W;
  }
  if (o.mode && gfile) {
    // the re-type depends on W: grids from --in must be of the mode's W
    const K = require('../../lib/mapkit');
    const doc = K.doc(src, key, { mode: o.mode });
    const want = require('../water').wOf(doc, o.mode);      // MV_NOT_FOUND when the map has no such mode
    if (typeof W === 'number' && Math.abs(W - want) > 1e-6) throw new M.MvError('MV_USAGE', 'pass: the grids in --in were re-typed with W ' + W + ', mode ' + o.mode + ' has W ' + want, { code: 'PASS_W_MISMATCH' });
  }
  const slopecls = sfile ? gf.read(sfile) : null;
  if (!slopecls && !height) throw new M.MvError('MV_USAGE', 'pass: --in has gtype.mvg but neither slopecls.mvg nor height.mvg', { code: 'PASS_GRID' });
  return { gtype, height, slopecls, W };
}

function cmdTerrain(o) {
  const M = mv();
  const key = o.map;
  if (!key) throw new M.MvError('MV_USAGE', '--map <map key> is needed');
  if (!o.out) throw new M.MvError('MV_USAGE', '--out <folder> is needed for pass terrain');
  // the reporter first: the source (a game index, ~1 s on GoH) is heard as the start of stage 'read'
  const P = M.progress(o);
  P.stage('read', 3 * UNIT);
  const src = srcOf(o);
  P.set(0);
  const dir = M.checkOut(o.out, { gameDir: src.game, target: o.target });
  const Ps = require('./index'), gf = require('../../lib/raster/gridfile');
  const list = Ps.profiles(src);
  P.set(UNIT);
  const prof = Ps.kindProfile(list, o.kind, src);
  P.set(2 * UNIT);
  const grids = gridsOf(o, src, key, P, 2 * UNIT);
  P.set(3 * UNIT);
  P.stage('mask', UNIT);
  const r = Ps.mask(grids, prof, sub(P, 0));
  P.set(UNIT);
  P.stage('write', 3);
  const files = [];
  for (const g of [r.pass, r.cost]) { gf.write(path.join(dir, g.name + '.mvg'), g); files.push(g.name + '.mvg'); P.step(); }
  M.writeAtomic(path.join(dir, 'reads.json'), json({ v: 1, inputs: src.reads() }));
  files.push('reads.json');
  P.step();
  const sum = { v: 1, map: key, mode: o.mode || null, kind: o.kind, patherId: prof.patherId, unit: prof.unit, blockDeg: prof.blockDeg,
    costFromDeg: prof.costFromDeg, files, counts: r.counts, notes: list.notes };
  if (o.json) out(json(sum));
  else if (!o.q) {
    out('pass of ' + key + ' for ' + o.kind + ' (profile ' + prof.patherId + ' from ' + (prof.unit.at || prof.unit.source) + '): open ' + r.counts.open +
      ', slow ' + r.counts.slow + ', blocked by slope ' + r.counts.blockedSlope + ', blocked by ground ' + r.counts.blockedGround + '\n');
    for (const n of list.notes) out('note ' + n.code + ': ' + n.text + '\n');
  }
  return 0;
}

function cmdProfiles(o) {
  const M = mv();
  const src = srcOf(o);
  const Ps = require('./index');
  const list = Ps.profiles(src);
  const kinds = {};
  for (const k of M.KINDS) {
    try { const p = Ps.kindProfile(list, k, src); kinds[k] = { patherId: p.patherId, unit: p.unit }; } catch (e) {
      if (!(e instanceof M.MvError) || e.code !== 'MV_NOT_FOUND') throw e;
      kinds[k] = { patherId: null, error: e.message };
    }
  }
  const body = { v: 1, target: src.target, profiles: list.slice(), kinds, notes: list.notes };
  if (o.json) { out(json(body)); return 0; }
  const tname = require('../../lib/mapkit/tables').TYPE_NAMES;
  const lines = ['pather profiles of ' + src.target + ' (' + (list[0] && list[0].source) + '): ' + list.length];
  for (const p of list) {
    const g = Object.keys(p.ground).filter(t => p.ground[t].k !== null)
      .map(t => (tname[t] || t) + ' ' + p.ground[t].k + (p.ground[t].accepted ? '' : ' (AI no)')).join(', ');
    lines.push(p.index + '\t' + p.patherId + '\tblock ' + (p.blockDeg === null ? 'none' : p.blockDeg + ' deg') + ', cost from ' +
      (p.costFromDeg === null ? 'none' : p.costFromDeg + ' deg') + ', radius ' + p.radiusM + ' m; ' + g);
  }
  for (const k of M.KINDS) lines.push('kind ' + k + ': ' + (kinds[k].patherId || 'none') + (kinds[k].unit ? ' (' + kinds[k].unit.def + (kinds[k].unit.at ? ' at ' + kinds[k].unit.at : ', ' + kinds[k].unit.source) + ')' : ' - ' + kinds[k].error));
  for (const n of list.notes) lines.push('note ' + n.code + ': ' + n.text);
  out(lines.join('\n') + '\n');
  return 0;
}

// ------------------------------------------------------------------ wave C: obstacles, travel, routes
function needMapOut(o, what) {
  const M = mv();
  if (!o.map) throw new M.MvError('MV_USAGE', '--map <map key> is needed');
  if (!o.out) throw new M.MvError('MV_USAGE', '--out <folder> is needed for pass ' + what);
  if (o.phase !== undefined && !(Number.isInteger(o.phase) && o.phase >= 0 && o.phase <= 99)) {
    throw new M.MvError('MV_USAGE', '--phase must be an integer 0..99, got ' + o.phase);
  }
}

function loadDoc(o, src) {
  const M = mv();
  const f = M.findIn(o.in || [], 'mapdoc.json');
  let doc = null;
  if (f) {
    try { doc = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { throw new M.MvError('MV_USAGE', 'pass: mapdoc.json in --in is not JSON', { code: 'PASS_DOC' }); }
    if (doc && doc.key && doc.key !== o.map) throw new M.MvError('MV_USAGE', 'pass: mapdoc.json in --in is of map ' + doc.key + ', not ' + o.map, { code: 'PASS_DOC' });
  } else doc = require('../../lib/mapkit').doc(src, o.map, { mode: o.mode });
  if (o.mode && !(doc.modes || []).some(m => m.id === o.mode)) throw new M.MvError('MV_NOT_FOUND', 'map ' + o.map + ' has no mode ' + o.mode, { map: o.map, mode: o.mode });
  return doc;
}

function readGrid(file, M, name) {
  try { return require('../../lib/raster/gridfile').read(file); } catch (e) {
    throw new M.MvError('MV_USAGE', 'pass: ' + name + ' in --in cannot be read: ' + e.message, { code: 'PASS_GRID', grid: name });
  }
}

// the objects and catalog of the map (+ mode): entcat.json and objects.json from --in, else made here as entcat map does
function objectsOf(o, src, doc, P) {
  const M = mv();
  const cf = M.findIn(o.in || [], 'entcat.json'), of = cf ? path.join(path.dirname(cf), 'objects.json') : null;
  if (cf && fs.existsSync(of)) {
    try {
      const cat = JSON.parse(fs.readFileSync(cf, 'utf8')), ob = JSON.parse(fs.readFileSync(of, 'utf8'));
      if (!cat || typeof cat.entries !== 'object' || !ob || !Array.isArray(ob.items)) throw new Error('not the entcat shape');
      return { catalog: cat, objects: ob.items, L: null };
    } catch (e) { throw new M.MvError('MV_USAGE', 'pass: entcat.json or objects.json in --in is not usable: ' + e.message, { code: 'PASS_OBJECTS' }); }
  }
  const E = require('../../entcat');
  const ents = (doc.entities || []).filter(e => e.src === 'map' || (o.mode && e.src === 'mi' && e.mode === o.mode));
  const subDoc = Object.assign({}, doc, { entities: ents });
  const L = E.loaderFor(src);
  const links = E.linksFor(src, o.map, subDoc, { mode: o.mode });
  const catalog = E.forDoc(src, subDoc, { loader: L, links, progress: P ? { stage() {}, step() {}, set() {}, check() { P.check(); } } : undefined });
  const objects = E.place(subDoc, catalog, links);
  return { catalog, objects, L };
}

// obstacles from the inputs (P: stage reporter or null). Returns {r, prof, list, L}
function runObstacles(o, src, doc, P) {
  const M = mv(), Ps = require('./index');
  const list = Ps.profiles(src);
  const prof = Ps.kindProfile(list, o.kind, src);
  if (P) P.stage('read', 3 * UNIT);
  const grids = gridsOf(o, src, o.map, P, 0);
  if (P) P.set(UNIT);
  const pf = M.findIn(o.in || [], 'pass.' + o.kind + '.mvg');
  if (pf) {
    const cf = path.join(path.dirname(pf), 'cost.' + o.kind + '.mvg');
    if (fs.existsSync(cf)) { grids.pass = readGrid(pf, M, 'pass.' + o.kind); grids.cost = readGrid(cf, M, 'cost.' + o.kind); }
  }
  if (P) P.set(2 * UNIT);
  const ob = objectsOf(o, src, doc, P);
  if (P) { P.set(3 * UNIT); P.stage('obstacles', UNIT); }
  const box = Ps.activeBox(doc, o.mode || null, null, null);
  const table = require('./obst').crushTable(src);
  const r = Ps.obstacles(grids, ob.objects, ob.catalog, prof, Object.assign({ box, table, target: o.target }, sub(P, 0)));
  return { r, prof, list, L: ob.L, grids };
}

function writeReads(dir, src, L) {
  const M = mv();
  if (L) src.addInputs(require('../../entcat').readsOf(L));
  M.writeAtomic(path.join(dir, 'reads.json'), json({ v: 1, inputs: src.reads() }));
}

function cmdObstacles(o) {
  const M = mv();
  needMapOut(o, 'obstacles');
  const P = M.progress(o);
  P.stage('read', 3 * UNIT);
  const src = srcOf(o);
  const dir = M.checkOut(o.out, { gameDir: src.game, target: o.target });
  const gf = require('../../lib/raster/gridfile');
  const doc = loadDoc(o, src);
  const { r, prof, list, L } = runObstacles(o, src, doc, P);
  P.stage('write', 4);
  const files = [];
  for (const g of [r.obst, r.move, r.mcost]) { gf.write(path.join(dir, g.name + '.mvg'), g); files.push(g.name + '.mvg'); P.step(); }
  writeReads(dir, src, L);
  files.push('reads.json');
  P.step();
  const notes = (list.notes || []).concat(r.notes);
  const sum = { v: 1, map: o.map, mode: o.mode || null, kind: o.kind, patherId: prof.patherId, radiusM: prof.radiusM, box: r.move.meta.box,
    files, counts: r.counts, skipped: r.skipped, notes };
  if (o.json) out(json(sum));
  else if (!o.q) {
    out('obstacles of ' + o.map + ' for ' + o.kind + ' (profile ' + prof.patherId + ', radius ' + prof.radiusM + ' m): ' + r.counts.obstacles + ' obstacle objects, ' +
      r.counts.crossable + ' crossable, ' + r.counts.blocking + ' blocking; cells blocked by object ' + r.counts.move.blockedObject + ', crossable ' +
      r.counts.move.crossObject + ', outside the pather box ' + r.counts.move.outsidePather + '\n');
    for (const s of r.skipped) out('skipped ' + s.uid + ' ' + s.def + ' ' + s.code + ': ' + s.msg + '\n');
    for (const n of notes) out('note ' + n.code + ': ' + n.text + '\n');
  }
  return r.skipped.length ? M.EXIT.FINDINGS : 0;
}

// move, mcost (from --in or obstacles here) and gtype (from --in or mapkit grids here) of the kind
function moveOf(o, src, doc, P) {
  const M = mv(), Ps = require('./index');
  const mf = M.findIn(o.in || [], 'move.' + o.kind + '.mvg');
  let move = null, mcost = null, prof = null, list = null, L = null, gtype = null;
  if (mf) {
    move = readGrid(mf, M, 'move.' + o.kind);
    const cf = path.join(path.dirname(mf), 'mcost.' + o.kind + '.mvg');
    if (fs.existsSync(cf)) mcost = readGrid(cf, M, 'mcost.' + o.kind);
    list = Ps.profiles(src);
    prof = Ps.kindProfile(list, o.kind, src);
  } else {
    const x = runObstacles(o, src, doc, P);
    move = x.r.move; mcost = x.r.mcost; prof = x.prof; list = x.list; L = x.L; gtype = x.grids.gtype;
  }
  if (!gtype) {
    const gfile = M.findIn(o.in || [], 'gtype.mvg');
    gtype = gfile ? readGrid(gfile, M, 'gtype') : require('../../lib/mapkit').grids(src, o.map, Object.assign({ mode: o.mode }, sub(P, 0))).gtype;
  }
  return { mv: { move, mcost, gtype }, prof, list, L };
}

function noSpawn(side, o, doc, phase, outside) {
  const M = mv();
  const ph = phase === undefined ? o.phase : phase;
  return new M.MvError('MV_NOT_FOUND', 'side ' + side + ' has no spawn in mode ' + (require('./speed').modeOf(doc, o.mode || null) || { id: 'none' }).id +
    (ph !== undefined && ph !== null ? ' phase ' + ph : '') + (outside && outside.length ? ' inside the map frame (outside: ' + outside.join(', ') + ')' : ''),
    { code: 'PASS_NO_SPAWN', side, phase: ph === undefined ? null : ph, outside: outside || [] });
}

// one resolved phase (late R3) for both sides, the flags and the clips; exit 3 PASS_NO_SPAWN when a side has no spawn in
// it, or every spawn of the side lies outside the travel frame
function runTravel(o, src, doc, P, m) {
  const Ps = require('./index');
  const spd = Ps.speed(src, o.kind, m.prof);
  const phase = Ps.resolvePhase(doc, o.mode || null, o.phase === undefined ? null : o.phase);
  const F = Ps.fold(m.mv, m.prof, spd, { target: o.target });
  const res = {}, sides = {}, counts = {};
  for (const side of ['a', 'b']) if (!Ps.spawnsOf(doc, o.mode || null, side, phase).length) throw noSpawn(side, o, doc, phase);
  for (const side of ['a', 'b']) {
    const sp = Ps.spawnsOf(doc, o.mode || null, side, phase);
    const box = Ps.activeBox(doc, o.mode || null, side, phase);
    if (P) P.stage('travel', UNIT);
    const r = Ps.travel(m.mv, m.prof, spd, sp, Object.assign({ name: 'travel.' + side + '.' + o.kind, box, fold: F, phase }, sub(P, 0)));
    if (!r.used.length) throw noSpawn(side, o, doc, phase, r.outside);
    res[side] = r.t;
    sides[side] = { spawns: r.used, box, phase, outside: r.outside };
    counts[side] = r.counts;
  }
  return { res, sides, counts, spd, F, phase, mode: require('./speed').modeOf(doc, o.mode || null) };
}

function cmdTravel(o) {
  const M = mv();
  needMapOut(o, 'travel');
  const P = M.progress(o);
  P.stage('read', 3 * UNIT);
  const src = srcOf(o);
  const dir = M.checkOut(o.out, { gameDir: src.game, target: o.target });
  const gf = require('../../lib/raster/gridfile');
  const doc = loadDoc(o, src);
  const m = moveOf(o, src, doc, P);
  const t = runTravel(o, src, doc, P, m);
  P.stage('write', 4);
  const files = [];
  for (const side of ['a', 'b']) { const g = t.res[side]; gf.write(path.join(dir, g.name + '.mvg'), g); files.push(g.name + '.mvg'); P.step(); }
  const notes = (m.list.notes || []).slice();
  if (t.spd.source === 'fallback') notes.push({ code: 'PASS_SPEED_FALLBACK', text: 'no run speed in ' + t.spd.def + ': ' + t.spd.kmh + ' km/h (fallback)', at: null });
  for (const side of ['a', 'b']) {
    if (t.sides[side].outside.length) notes.push({ code: 'PASS_SPAWN_OUTSIDE', text: 'side ' + side + ': spawn(s) outside the map frame, not used: ' + t.sides[side].outside.join(', '), at: null });
  }
  const fr = t.F.fr;
  const body = { v: 1, kind: 'travel', unit: o.kind, patherId: m.prof.patherId, frame: { cell: fr.cell, ox: fr.ox, oy: fr.oy, w: fr.w, h: fr.h },
    phase: t.phase, speed: { runMs: t.spd.runMs, source: t.spd.source, def: t.spd.def, at: t.spd.at },
    sides: t.sides, counts: t.counts, mode: t.mode ? t.mode.id : null, notes };
  M.writeAtomic(path.join(dir, 'travel.json'), json(body));
  files.push('travel.json');
  P.step();
  writeReads(dir, src, m.L);
  files.push('reads.json');
  P.step();
  if (o.json) out(json(Object.assign({ map: o.map, files }, body)));
  else if (!o.q) {
    out('travel of ' + o.map + ' for ' + o.kind + ' (' + (t.mode ? t.mode.id : 'no mode') + ', ' + Math.round(t.spd.kmh * 100) / 100 + ' km/h ' + t.spd.source + '): side a ' +
      t.counts.a.reached + ' cells reached from ' + t.sides.a.spawns.join(', ') + '; side b ' + t.counts.b.reached + ' from ' + t.sides.b.spawns.join(', ') + '\n');
    for (const n of notes) out('note ' + n.code + ': ' + n.text + '\n');
  }
  return 0;
}

function cmdRoutes(o) {
  const M = mv(), Ps = require('./index');
  needMapOut(o, 'routes');
  const P = M.progress(o);
  P.stage('read', 3 * UNIT);
  const src = srcOf(o);
  const dir = M.checkOut(o.out, { gameDir: src.game, target: o.target });
  const gf = require('../../lib/raster/gridfile');
  const doc = loadDoc(o, src);
  const m = moveOf(o, src, doc, P);
  const spd = Ps.speed(src, o.kind, m.prof);
  // one resolved phase (late R3, ruling R-f); a travel pair from --in made for another phase is not reused
  const phase = Ps.resolvePhase(doc, o.mode || null, o.phase === undefined ? null : o.phase);
  const T = {};
  const fa = M.findIn(o.in || [], 'travel.a.' + o.kind + '.mvg'), fb = fa ? path.join(path.dirname(fa), 'travel.b.' + o.kind + '.mvg') : null;
  if (fa && fs.existsSync(fb)) { T.a = readGrid(fa, M, 'travel.a.' + o.kind); T.b = readGrid(fb, M, 'travel.b.' + o.kind); }
  const phOf = g => (g && g.meta && g.meta.phase !== undefined ? g.meta.phase : null);
  if (!T.a || phOf(T.a) !== phase || phOf(T.b) !== phase) { const t = runTravel(o, src, doc, P, m); T.a = t.res.a; T.b = t.res.b; }
  for (const side of ['a', 'b']) if (!Ps.spawnsOf(doc, o.mode || null, side, phase).length) throw noSpawn(side, o, doc, phase);
  P.stage('routes', UNIT);
  const r = Ps.routes(doc, m.mv, T.a, T.b, Object.assign({ mode: o.mode || null, phase, unit: o.kind, seed: o.seed, k: 8,
    prof: m.prof, speed: spd, target: o.target }, sub(P, 0)));
  P.stage('write', 4);
  const files = [];
  M.writeAtomic(path.join(dir, 'routes.json'), json({ v: 1, kind: 'vector', name: 'routes', phase: r.phase, items: r.items }));
  files.push('routes.json');
  P.step();
  for (const side of ['a', 'b']) { const g = r.density[side]; gf.write(path.join(dir, g.name + '.mvg'), g); files.push(g.name + '.mvg'); P.step(); }
  writeReads(dir, src, m.L);
  files.push('reads.json');
  P.step();
  const notes = (m.list.notes || []).slice();
  if (spd.source === 'fallback') notes.push({ code: 'PASS_SPEED_FALLBACK', text: 'no run speed in ' + spd.def + ': ' + spd.kmh + ' km/h (fallback)', at: null });
  if (r.noRoute.length) notes.push({ code: 'PASS_NO_ROUTE', text: r.noRoute.length + ' spawn and target pair(s) have no route', at: null });
  const sum = { v: 1, map: o.map, mode: o.mode || null, kind: o.kind, phase: r.phase, seed: o.seed, files, routes: r.items.length, pairs: r.pairs, noRoute: r.noRoute, notes };
  if (o.json) out(json(sum));
  else if (!o.q) {
    out('routes of ' + o.map + ' for ' + o.kind + ': ' + r.items.length + ' routes, ' + r.noRoute.length + ' pairs without a route\n');
    for (const x of r.noRoute) out('no route: side ' + x.side + ' ' + x.from + ' to ' + x.to + '\n');
    for (const n of notes) out('note ' + n.code + ': ' + n.text + '\n');
  }
  return r.noRoute.length ? M.EXIT.FINDINGS : 0;
}

const RUN = { terrain: cmdTerrain, profiles: cmdProfiles, obstacles: cmdObstacles, travel: cmdTravel, routes: cmdRoutes };

module.exports = {
  part: 'pass',
  version: VERSION,
  summary: 'terrain passability and cost of a unit kind from pather.set; object obstacles, travel time and routes',
  commands: {
    terrain: { args: COMMON + ' --map K --kind k [--mode M] [--in D] --out D [--json]', summary: 'pass.<kind> and cost.<kind> grids' },
    profiles: { args: COMMON + ' [--json]', summary: 'pather profiles of the stack and the profile of each kind' },
    obstacles: { args: COMMON + ' --map K --kind k [--mode M] [--in D] --out D [--json]', summary: 'obst.<kind>, move.<kind> and mcost.<kind> grids' },
    travel: { args: COMMON + ' --map K --kind k [--mode M] [--phase n] [--in D] --out D [--json]', summary: 'travel.a.<kind>, travel.b.<kind> and travel.json' },
    routes: { args: COMMON + ' --map K --kind k [--mode M] [--phase n] [--seed n] [--in D] --out D [--json]', summary: 'routes.json, route.a.<kind> and route.b.<kind>' },
  },
  run(argv) {
    const M = mv();
    const cmd = argv[0];
    if (!RUN[cmd]) throw new M.MvError('MV_USAGE', 'no pass command ' + cmd);
    const o = M.parseArgs(argv.slice(1), SPEC);
    if (o.pos.length) throw new M.MvError('MV_USAGE', 'unexpected argument ' + o.pos[0]);
    return RUN[cmd](o);
  },
};

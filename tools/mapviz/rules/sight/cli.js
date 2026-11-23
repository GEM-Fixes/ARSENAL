// sight cli (MV-SIG): `node tools/mapviz/mapviz.js sight <command> [flags]` (freeze rules.md 3.4, late R1, R2).
//   grid    common + --map K [--mode M] [--in D]... --out D [--json]
//           writes sight.grid.mvg, sight.ground.mvg, sight.field.mvg, sight.fire.top.mvg, sight.fire.bottom.mvg,
//           sight.json, reads.json. Exit 1 when objects were skipped (listed in sight.json notes).
//   view    common + --map K --at x,y [--pose stand|kneel|prone] [--kind k] [--mode M] [--in D]... --out D [--json]
//           writes sight.view.mvg, sight.vis.mvg, sight.fire.mvg, sight.rings.json, reads.json. --at is snapped to the
//           sight cell's south-west corner (meta.at). A bad --at or --pose exits 2.
//   pair    common + --map K --from x,y[,zM] --to x,y[,zM] [--pose p] [--kind k] [--mode M] [--in D]... --json
//           stdout {see, visibleHeightM, fire:{clear, block, at}, distM}; zM = metres over the ground (default the pose eye)
//   profile common [--json]   the vision profile (vprof)
// --in folders: mapdoc.json, height.mvg + gtype.mvg (+ grids.json), entcat.json (catalog), sight.grid.mvg,
// sight.ground.mvg, sight.field.mvg, sight.fire.top.mvg, sight.fire.bottom.mvg are taken from there when present,
// else computed in process. Objects come from entcat placeSolids (the catalog of entcat.json when given).
// Light at load: nothing heavy is required until run.
// Author: Imperator_Aug (ARSENAL, ia-07462207)
'use strict';
const path = require('path');
const fs = require('fs');

const VERSION = 1;   // = index.js VERSION
const SPEC = { at: 'str', pose: 'str', from: 'str', to: 'str' };
const COMMON = '--target T [--game G] [--mods a,b] [--mod-dir D]';
const UPM = 20;

function mv() { return require('../../mapviz'); }
const json = x => JSON.stringify(x) + '\n';
const out = s => process.stdout.write(s);

function srcOf(o) {
  const M = mv();
  if (!o.target) throw new M.MvError('MV_USAGE', '--target as64|mowas2|goh is needed');
  return require('../../lib/mapkit').source({ target: o.target, game: o.game, mods: o.mods, modDirs: o.modDirs });
}

function readJson(M, f, what) {
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { throw new M.MvError('MV_USAGE', 'sight: ' + what + ' in --in is not JSON'); }
}

function readIn(o, src, key) {
  const M = mv(), K = require('../../lib/mapkit'), gf = require('../../lib/raster/gridfile');
  const dirs = o.in || [];
  const docFile = M.findIn(dirs, 'mapdoc.json');
  let doc;
  if (docFile) {
    doc = readJson(M, docFile, 'mapdoc.json');
    if (doc.key && doc.key !== key) throw new M.MvError('MV_USAGE', 'sight: mapdoc.json in --in is of map ' + doc.key + ', not ' + key);
  } else doc = K.doc(src, key, { mode: o.mode });
  const hfile = M.findIn(dirs, 'height.mvg');
  let grids;
  if (hfile) {
    const dir = path.dirname(hfile);
    const rd = n => { const f = path.join(dir, n); return fs.existsSync(f) ? gf.read(f) : null; };
    let meta = null;
    try { meta = JSON.parse(fs.readFileSync(path.join(dir, 'grids.json'), 'utf8')); } catch (e) { meta = null; }
    grids = { height: rd('height.mvg'), gtype: rd('gtype.mvg'), W: meta && typeof meta.w === 'number' ? meta.w : undefined };
  } else grids = K.grids(src, key, { mode: o.mode });
  return { doc, grids };
}

// placeSolids of the map's objects for the mode; null when entcat has no placeSolids
function solidsOf(o, src, key, doc, grids) {
  const M = mv();
  const E = require('../../entcat');
  if (typeof E.placeSolids !== 'function') return null;
  const L = E.loaderFor(src);
  const d = typeof E.docForMode === 'function' ? E.docForMode(doc, o.mode) : doc;
  const links = E.linksFor(src, key, d, { mode: o.mode });
  const cf = M.findIn(o.in || [], 'entcat.json');
  let cat = null;
  if (cf) {
    cat = readJson(M, cf, 'entcat.json');
    if (!cat || typeof cat.entries !== 'object') cat = null;
  }
  if (!cat) cat = E.forDoc(src, d, { loader: L, links });
  return E.placeSolids(d, cat, L, grids, { links });
}

function sightIn(o, doc, grids, placedFn) {
  const M = mv(), gf = require('../../lib/raster/gridfile'), S = require('./index');
  const dirs = o.in || [];
  const f = n => M.findIn(dirs, n);
  let sg = null, fg = null;
  if (f('sight.grid.mvg') && f('sight.ground.mvg') && f('sight.field.mvg')) {
    sg = { grid: gf.read(f('sight.grid.mvg')), ground: gf.read(f('sight.ground.mvg')), field: gf.read(f('sight.field.mvg')) };
  }
  if (f('sight.fire.top.mvg') && f('sight.fire.bottom.mvg')) {
    const F = require('./fire');
    fg = { top: gf.read(f('sight.fire.top.mvg')), bottom: gf.read(f('sight.fire.bottom.mvg')), height: grids.height, gtype: grids.gtype || null, W: F.wOf(doc, o.mode, grids) };
  }
  let placed;
  const get = () => (placed === undefined ? (placed = placedFn()) : placed);
  if (!sg) sg = S.grid(doc, grids, get(), { target: o.target });
  if (!fg) fg = S.fireGrid(doc, grids, get(), { mode: o.mode });
  return { sg, fg, placed: get };
}

function point(M, s, flag, three) {
  const p = String(s || '').split(',').map(v => v.trim());
  const n = p.map(Number);
  if (!(p.length === 2 || (three && p.length === 3)) || !n.every(Number.isFinite)) {
    throw new M.MvError('MV_USAGE', flag + ' needs x,y' + (three ? '[,zM]' : '') + ' in world u, got ' + s);
  }
  return n;
}
function poseOf(M, o) {
  const p = o.extra.pose === undefined ? 'stand' : o.extra.pose;
  if (!['stand', 'kneel', 'prone'].includes(p)) throw new M.MvError('MV_USAGE', '--pose must be stand, kneel or prone, got ' + p);
  return p;
}

function cmdGrid(o) {
  const M = mv();
  const key = o.map;
  if (!key) throw new M.MvError('MV_USAGE', '--map <map key> is needed');
  if (!o.out) throw new M.MvError('MV_USAGE', '--out <folder> is needed for sight grid');
  const P = M.progress(o);
  P.stage('read', 3);
  const src = srcOf(o);
  const dir = M.checkOut(o.out, { gameDir: src.game, target: o.target });
  const S = require('./index'), gf = require('../../lib/raster/gridfile');
  const { doc, grids } = readIn(o, src, key);
  P.step();
  const placed = solidsOf(o, src, key, doc, grids);
  P.step();
  const prof = S.profile(src);
  P.step();
  P.stage('grid', 2000);
  const r = S.grid(doc, grids, placed, { target: o.target, tick: (d, t) => P.set(Math.round(1000 * (t > 0 ? Math.min(1, d / t) : 1))) });
  P.set(1000);
  const fg = S.fireGrid(doc, grids, placed, { mode: o.mode, tick: (d, t) => P.set(1000 + Math.round(1000 * (t > 0 ? Math.min(1, d / t) : 1))) });
  P.set(2000);
  P.stage('write', 7);
  const files = [];
  for (const g of [r.grid, r.ground, r.field, fg.top, fg.bottom]) { gf.write(path.join(dir, g.name + '.mvg'), g); files.push(g.name + '.mvg'); P.step(); }
  const notes = prof.notes.map(n => ({ code: n.code, msg: n.msg })).concat(r.notes.map(n => ({ code: n.code, msg: n.msg })));
  const L = r.grid.meta;
  const body = { v: 1, kind: 'sight', target: o.target, game: S.gameOf(o.target), cellU: L.cellU, hMinU: L.hMinU, hMaxU: L.hMaxU, stepU: L.stepU,
    profile: prof, counts: r.counts, notes };
  M.writeAtomic(path.join(dir, 'sight.json'), json(body)); files.push('sight.json'); P.step();
  M.writeAtomic(path.join(dir, 'reads.json'), json({ v: 1, inputs: src.reads() })); files.push('reads.json'); P.step();
  if (o.json) out(json({ v: 1, map: key, mode: o.mode || null, files, counts: r.counts, notes }));
  else if (!o.q) {
    out('sight grid of ' + key + (o.mode ? ' (' + o.mode + ')' : '') + ': ' + r.grid.w + ' x ' + r.grid.h + ' cells of ' + L.cellU + ' u, levels ' +
      L.hMinU + '..' + L.hMaxU + ' u; objects ' + r.counts.objects + ', entered ' + r.counts.entered + ', thin ' + r.counts.thin +
      ', hard cells ' + r.counts.hard + ', soft ' + r.counts.soft + ', skipped ' + r.counts.skipped + '\n');
    for (const n of notes) out('note ' + n.code + ': ' + n.msg + '\n');
  }
  return r.counts.skipped > 0 ? 1 : 0;
}

function cmdView(o) {
  const M = mv();
  const key = o.map;
  if (!key) throw new M.MvError('MV_USAGE', '--map <map key> is needed');
  if (!o.out) throw new M.MvError('MV_USAGE', '--out <folder> is needed for sight view');
  if (o.extra.at === undefined) throw new M.MvError('MV_USAGE', '--at x,y is needed for sight view');
  const at = point(M, o.extra.at, '--at', false);
  const pose = poseOf(M, o);
  const P = M.progress(o);
  P.stage('read', 3);
  const src = srcOf(o);
  const dir = M.checkOut(o.out, { gameDir: src.game, target: o.target });
  const S = require('./index'), gf = require('../../lib/raster/gridfile');
  const { doc, grids } = readIn(o, src, key);
  P.step();
  const prof = S.profile(src);
  const I = sightIn(o, doc, grids, () => solidsOf(o, src, key, doc, grids));
  P.step();
  const g = I.sg.grid;
  const snapped = S.snap(g, at[0], at[1]);
  const x1 = g.ox + g.w * g.cell, y1 = g.oy + g.h * g.cell;
  if (!(snapped[0] >= g.ox && snapped[0] < x1 && snapped[1] >= g.oy && snapped[1] < y1)) throw new M.MvError('MV_USAGE', '--at ' + o.extra.at + ' is outside the map');
  P.step();
  P.stage('view', 1);
  const placed = I.placed();
  const v = S.viewshed(I.sg, I.fg, { x: snapped[0], y: snapped[1] }, { pose, viewer: o.kind, vprof: prof, exactM: 60, placed: Array.isArray(placed) ? placed : undefined });
  P.step();
  P.stage('write', 5);
  const files = [];
  for (const gr of [v.view, v.vis, v.fire].filter(Boolean)) { gf.write(path.join(dir, gr.name + '.mvg'), gr); files.push(gr.name + '.mvg'); P.step(); }
  M.writeAtomic(path.join(dir, 'sight.rings.json'), json({ v: 1, kind: 'vector', name: 'sight.rings', items: v.rings })); files.push('sight.rings.json'); P.step();
  M.writeAtomic(path.join(dir, 'reads.json'), json({ v: 1, inputs: src.reads() })); files.push('reads.json'); P.step();
  const cnt = [0, 0, 0, 0];
  for (const c of v.view.data) cnt[c]++;
  if (o.json) out(json({ v: 1, map: key, at: v.view.meta.at, pose, viewer: o.kind, rangeM: v.view.meta.rangeM, files, cells: { out: cnt[0], seen: cnt[1], hidden: cnt[2], partly: cnt[3] } }));
  else if (!o.q) out('sight view of ' + key + ' at ' + v.view.meta.at.join(',') + ' (' + o.kind + ', ' + pose + ', range ' + v.view.meta.rangeM + ' m): seen ' + cnt[1] + ', partly ' + cnt[3] + ', hidden ' + cnt[2] + ' cells\n');
  return 0;
}

function cmdPair(o) {
  const M = mv();
  const key = o.map;
  if (!key) throw new M.MvError('MV_USAGE', '--map <map key> is needed');
  if (o.extra.from === undefined || o.extra.to === undefined) throw new M.MvError('MV_USAGE', '--from x,y[,zM] and --to x,y[,zM] are needed for sight pair');
  const fa = point(M, o.extra.from, '--from', true), fb = point(M, o.extra.to, '--to', true);
  const pose = poseOf(M, o);
  const src = srcOf(o);
  const S = require('./index');
  const { doc, grids } = readIn(o, src, key);
  const prof = S.profile(src);
  const I = sightIn(o, doc, grids, () => solidsOf(o, src, key, doc, grids));
  const g = I.sg.grid, x1 = g.ox + g.w * g.cell, y1 = g.oy + g.h * g.cell;
  for (const [p, flag] of [[fa, '--from'], [fb, '--to']]) {
    if (!(p[0] >= g.ox && p[0] < x1 && p[1] >= g.oy && p[1] < y1)) throw new M.MvError('MV_USAGE', flag + ' ' + o.extra[flag.slice(2)] + ' is outside the map');
  }
  const r = pair(I.sg, I.fg, grids, prof, fa, fb, { pose, kind: o.kind });
  out(json(r));
  return 0;
}

// pair(sg, fg, grids, vprof, [x, y, zM?], [x, y, zM?], {pose, kind}) -> {see, visibleHeightM, fire, distM}
function pair(sg, fg, grids, prof, fa, fb, o) {
  const S = require('./index'), V = require('./view'), G = require('./grid');
  const pose = (o && o.pose) || 'stand', kind = (o && o.kind) || 'inf';
  const z = (p) => {
    const g = G.groundAt(grids.height, p[0], p[1]);
    return (g === null ? 0 : g) + (p.length > 2 ? p[2] : V.POSE[pose].eyeM) * UPM;
  };
  const a = { x: fa[0], y: fa[1], z: z(fa) }, b = { x: fb[0], y: fb[1], z: z(fb) };
  const vw = prof.viewers[kind];
  const ro = { rangeU: S.rangeM(prof, kind, 'inf', { pose }) * UPM, uncoverU: (vw.uncoverM || 0) * UPM, vFovDeg: vw.vFovDeg };
  const see = S.canSee(sg, a, b, ro);
  const vh = S.visibleHeight(sg, a, b, ro);
  // GetVisibleHeight subtracts the grid's own ground height of the target cell [V]
  const R = require('./ray'), SM = R.meta(sg), cb = R.cellOf(SM, b.x, b.y);
  const gb = cb ? SM.ground.data[cb.j * SM.w + cb.i] * SM.step + SM.hMin : null;
  const visibleHeightM = vh === null || vh === Infinity || gb === null ? null : Math.round((vh - gb) / UPM * 100) / 100;
  // aim range = the sight range in version 1 (rules.md 3.3 [I])
  const f = S.fireLine(fg, a, b, { rangeU: ro.rangeU });
  return { see, visibleHeightM, fire: { clear: f.clear, block: f.block, at: f.at }, distM: Math.round(Math.hypot(b.x - a.x, b.y - a.y) / UPM * 100) / 100 };
}

function cmdProfile(o) {
  const src = srcOf(o);
  const prof = require('./index').profile(src);
  if (o.json) { out(json(prof)); return 0; }
  const V = require('./vision');
  const lines = ['vision profile of ' + src.target + ' (' + prof.source + ', game ' + prof.game + ')'];
  for (const k of ['inf', 'mg', 'at', 'tank', 'officer']) {
    const v = prof.viewers[k];
    lines.push(k + '\t' + v.preset + '\tradius ' + v.radiusM + ' m, uncover ' + v.uncoverM + ' m, h_fov ' + v.hFovDeg + ', v_fov ' + v.vFovDeg +
      '; vs inf ' + V.rangeM(prof, k, 'inf') + ' m, vs tank ' + V.rangeM(prof, k, 'tank') + ' m\t' + v.at);
  }
  lines.push('binocular\treach ' + prof.viewers.binocular.reachM + ' m, disc ' + prof.viewers.binocular.discM + ' m\t' + prof.viewers.binocular.at);
  lines.push('flag\tradius ' + prof.viewers.flag.radiusM + ' m, uncover ' + prof.viewers.flag.uncoverM + ' m\t' + prof.viewers.flag.at);
  for (const n of prof.notes) lines.push('note ' + n.code + ': ' + n.msg);
  out(lines.join('\n') + '\n');
  return 0;
}

const RUN = { grid: cmdGrid, view: cmdView, pair: cmdPair, profile: cmdProfile };

module.exports = {
  part: 'sight',
  version: VERSION,
  summary: 'engine sight grid, line of sight, fire lines and the viewshed of a spot',
  commands: {
    grid: { args: COMMON + ' --map K [--mode M] [--in D] --out D [--json]', summary: 'sight.grid, sight.ground, sight.field, sight.fire.top, sight.fire.bottom, sight.json' },
    view: { args: COMMON + ' --map K --at x,y [--pose stand|kneel|prone] [--kind k] [--mode M] [--in D] --out D [--json]', summary: 'sight.view, sight.vis, sight.fire and sight.rings.json of a spot' },
    pair: { args: COMMON + ' --map K --from x,y[,zM] --to x,y[,zM] [--pose p] [--kind k] [--mode M] [--in D] --json', summary: 'line of sight and fire line between two points' },
    profile: { args: COMMON + ' [--json]', summary: 'the vision profile: ranges, uncover, fields of view and their sources' },
  },
  pair,
  run(argv) {
    const M = mv();
    const cmd = argv[0];
    if (!RUN[cmd]) throw new M.MvError('MV_USAGE', 'no sight command ' + cmd);
    const o = M.parseArgs(argv.slice(1), SPEC);
    if (o.pos.length) throw new M.MvError('MV_USAGE', 'unexpected argument ' + o.pos[0]);
    return RUN[cmd](o);
  },
};

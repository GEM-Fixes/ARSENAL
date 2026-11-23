// raster cli (MV-RAS): `node tools/mapviz/mapviz.js raster <command> [flags]` (tools/mapviz/README.md section 1.2).
//   terrain --in D --out D [--json]        reads height.mvg; writes slopecls.mvg, shade.mvg, landform.r10.mvg,
//                                          landform.r50.mvg, reads.json
//   topo --in D --out D [--size px]        reads height.mvg (and shade.mvg when an --in folder has it); writes
//                                          pic.topo.mvg, pic.topo.json (sidecar), contours.json (vector), reads.json.
//                                          pic.topo = height tint x shade only: contours are never baked in. Sidecar
//                                          target, stackHash, mapHashes from the --in folders (mapOf), never a game
// Progress (README 7): one stage per command, 1000 units per library call; the long calls report inside (o.tick).
//   info <file.mvg> [--json]               header + min, max, mean of the valid values
//   png <file.mvg> --out <file.png>        the grid as a PNG (row 0 = min world y, no flip; README 4.2)
// Works only on grids: never reads a game. Exit 0; 2 bad flag or a bad grid (error detail.code RASTER_*, GRIDFILE_*);
// 3 an input file absent; 5 cancelled; 6 --out refused.
// Author: Imperator_Aug (ARSENAL, ia-f4b2d72f)
'use strict';
const fs = require('fs'), path = require('path');

const VERSION = 3;   // = index.js VERSION
const LANDFORM_RADII = [10, 50];            // README 12

function mv() { return require('../../mapviz'); }

// library errors with a stable code -> MV_USAGE (a bad grid), absent files -> MV_NOT_FOUND
function wrap(fn) {
  const M = mv();
  try { return fn(); } catch (e) {
    if (e instanceof M.MvError) throw e;
    if (e && e.code === 'ENOENT') throw new M.MvError('MV_NOT_FOUND', 'file not found: ' + (e.path || e.message), { code: 'ENOENT' });
    if (e && typeof e.code === 'string' && /^(RASTER|GRIDFILE|PNG)_/.test(e.code)) throw new M.MvError('MV_USAGE', e.message, { code: e.code });
    throw e;
  }
}

function needInput(o, name) {
  const M = mv();
  if (!o.in.length) throw new M.MvError('MV_USAGE', '--in <folder> is needed (where ' + name + ' is)');
  const f = M.findIn(o.in, name);
  if (!f) throw new M.MvError('MV_NOT_FOUND', 'no ' + name + ' in ' + o.in.join(', '), { name });
  return f;
}

function readGrid(file) { return wrap(() => require('./gridfile').read(file)); }

function writeReads(out) {
  mv().writeAtomic(path.join(out, 'reads.json'), JSON.stringify({ v: 1, inputs: [] }) + '\n');   // grids only: no game input
}

// sub(p, base, span): an options object whose tick puts a library call's (done, total) at base .. base + span of the
// current stage (p.set: written at most 4 times a second, and it checks the cancel flag, README 7)
function sub(p, base, span) {
  return { tick: (d, t) => p.set(base + Math.round(span * (t > 0 ? Math.min(1, d / t) : 1))) };
}
const UNIT = 1000;   // progress units per library call in a stage

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return null; }
}

// whose map the picture is (README 4.4 sidecar): target, stackHash and mapHashes from the --in folders, never from a game.
// target: mapdoc.json game, else the grids entry's manifest.json target (the job runner writes it), else --target.
// stackHash: mapdoc.json stack.hash, else mapkit's stackHash of the manifest's mods and mod folders, else of --mods and
// --mod-dir when --target is given. mapHashes: the mapHashes of mapdoc.json and grids.json when they carry them, plus
// height.mvg = sha1 of the height grid file the picture is made from (the only map input raster reads).
function mapOf(o, heightFile) {
  const M = mv(), crypto = require('crypto');
  const dir = path.dirname(heightFile);
  const docFile = M.findIn(o.in, 'mapdoc.json');
  const man = readJson(path.join(dir, 'manifest.json'));
  const gj = readJson(path.join(dir, 'grids.json'));
  let doc = docFile ? readJson(docFile) : null;
  const key = (gj && gj.map) || o.map || null;
  if (doc && key && doc.key && doc.key !== key) doc = null;              // a doc of another map says nothing here
  let hashOf = null;
  try { hashOf = require('../mapkit/source').stackHash; } catch (e) { hashOf = null; }
  const target = (doc && typeof doc.game === 'string' && doc.game) || (man && typeof man.target === 'string' && man.target) || o.target || null;
  let stackHash = (doc && doc.stack && typeof doc.stack.hash === 'string' && doc.stack.hash) || null;
  if (!stackHash && hashOf && man && typeof man.target === 'string' && Array.isArray(man.mods)) stackHash = hashOf(man.mods, Array.isArray(man.modDirs) ? man.modDirs : []);
  if (!stackHash && hashOf && o.target) stackHash = hashOf(o.mods || [], o.modDirs || []);
  const mapHashes = {};
  for (const x of [doc, gj]) {
    const h = x && x.mapHashes;
    if (h && typeof h === 'object') for (const k of Object.keys(h)) if (typeof h[k] === 'string') mapHashes[k] = h[k];
  }
  mapHashes['height.mvg'] = crypto.createHash('sha1').update(fs.readFileSync(heightFile)).digest('hex');
  return { target, stackHash: stackHash || null, mapHashes };
}

function say(o, obj, text) {
  if (o.json) process.stdout.write(JSON.stringify(obj) + '\n');
  else process.stdout.write(text + '\n');
}

function terrain(o) {
  const M = mv(), R = require('./index'), GF = require('./gridfile');
  const out = M.checkOut(o.out, o);
  const src = needInput(o, 'height.mvg');
  const p = M.progress(o);
  p.stage('read', 1);
  const height = readGrid(src);
  // one stage, UNIT per layer; slopeClass and hillshade report inside (several seconds on the largest maps)
  const jobs = [
    ['slopecls', t => R.slopeClass(height, t)],
    ['shade', t => R.hillshade(height, t)],
  ].concat(LANDFORM_RADII.map(r => ['landform.r' + r, () => R.landform(height, r)]));
  p.stage('terrain', jobs.length * UNIT);
  const files = [];
  jobs.forEach(([name, fn], i) => {
    const g = wrap(() => fn(sub(p, i * UNIT, UNIT)));
    GF.write(path.join(out, name + '.mvg'), g);
    files.push(name + '.mvg');
    p.set((i + 1) * UNIT);
  });
  writeReads(out);
  say(o, { v: 1, out, files }, files.join('\n'));
  return M.EXIT.OK;
}

function topo(o) {
  const M = mv(), R = require('./index'), GF = require('./gridfile'), KC = require('./kcontour');
  const out = M.checkOut(o.out, o);
  const src = needInput(o, 'height.mvg');
  const p = M.progress(o);
  p.stage('read', 1);
  const height = readGrid(src);
  let shade = null;
  const sf = M.findIn(o.in, 'shade.mvg');
  if (sf) {
    const s = readGrid(sf);
    if (s.w === height.w && s.h === height.h && s.etype === 'u8') shade = s;
  }
  // one stage, UNIT per call: the shade (when --in has none), the picture, the contours
  p.stage('picture', 3 * UNIT);
  if (!shade) shade = wrap(() => R.hillshade(height, sub(p, 0, UNIT)));
  p.set(UNIT);
  const who = mapOf(o, src);
  const t = wrap(() => R.topo(height, Object.assign({ shade, size: o.size }, who, sub(p, UNIT, UNIT))));
  GF.write(path.join(out, 'pic.topo.mvg'), t.grid);
  M.writeAtomic(path.join(out, 'pic.topo.json'), JSON.stringify(t.sidecar, null, 1) + '\n');
  p.set(2 * UNIT);
  const c = wrap(() => R.contours(height, sub(p, 2 * UNIT, UNIT)));
  M.writeAtomic(path.join(out, 'contours.json'), JSON.stringify(KC.vector(c)) + '\n');
  p.set(3 * UNIT);
  writeReads(out);
  const files = ['pic.topo.mvg', 'pic.topo.json', 'contours.json'];
  say(o, { v: 1, out, files, w: t.grid.w, h: t.grid.h, interval: c.interval, lines: c.lines.length, labels: c.labels.length },
    files.join('\n'));
  return M.EXIT.OK;
}

function stats(g) {
  const n = g.w * g.h;
  if (g.etype === 'rgba8') {
    const ch = [0, 1, 2, 3].map(q => {
      let lo = 255, hi = 0, s = 0;
      for (let k = 0; k < n; k++) { const v = g.data[k * 4 + q]; if (v < lo) lo = v; if (v > hi) hi = v; s += v; }
      return n ? { min: lo, max: hi, mean: s / n } : { min: null, max: null, mean: null };
    });
    return { count: n, channels: { r: ch[0], g: ch[1], b: ch[2], a: ch[3] } };
  }
  const sc = g.scale == null ? 1 : g.scale, of = g.offset == null ? 0 : g.offset;
  let lo = Infinity, hi = -Infinity, s = 0, c = 0, nan = 0;
  for (let k = 0; k < n; k++) {
    const raw = g.data[k];
    if (raw !== raw) { nan++; continue; }
    if (g.nodata != null && raw === g.nodata) continue;
    const v = raw * sc + of;
    if (v < lo) lo = v; if (v > hi) hi = v; s += v; c++;
  }
  // nodataCount, not nodata: the header's nodata value is printed beside these and must not be overwritten
  return c ? { count: c, nodataCount: n - c - nan, nan, min: lo, max: hi, mean: s / c } : { count: 0, nodataCount: n - nan, nan, min: null, max: null, mean: null };
}

function info(o) {
  const M = mv(), GF = require('./gridfile');
  const file = o.pos[1];
  if (!file) throw new M.MvError('MV_USAGE', 'give a grid file: raster info <file.mvg>');
  if (!fs.existsSync(file)) throw new M.MvError('MV_NOT_FOUND', 'file not found: ' + file);
  const g = wrap(() => GF.read(file));
  const st = stats(g);
  const head = { name: g.name, w: g.w, h: g.h, cell: g.cell, ox: g.ox, oy: g.oy, etype: g.etype, sample: g.sample, scale: g.scale,
    offset: g.offset, nodata: g.nodata, meta: g.meta };
  if (o.json) { process.stdout.write(JSON.stringify(Object.assign({ v: 1, file: path.basename(file) }, head, st)) + '\n'); return M.EXIT.OK; }
  const rows = Object.keys(head).map(k => k + '\t' + (typeof head[k] === 'object' && head[k] !== null ? JSON.stringify(head[k]) : head[k]));
  for (const k of Object.keys(st)) rows.push(k + '\t' + (typeof st[k] === 'object' && st[k] !== null ? JSON.stringify(st[k]) : st[k]));
  process.stdout.write(rows.join('\n') + '\n');
  return M.EXIT.OK;
}

function pngCmd(o) {
  const M = mv(), GF = require('./gridfile'), R = require('./index');
  const file = o.pos[1];
  if (!file) throw new M.MvError('MV_USAGE', 'give a grid file: raster png <file.mvg> --out <file.png>');
  if (!o.out) throw new M.MvError('MV_USAGE', '--out <file.png> is needed');
  if (!/\.png$/i.test(o.out)) throw new M.MvError('MV_USAGE', '--out must name a .png file, got ' + o.out);
  if (!fs.existsSync(file)) throw new M.MvError('MV_NOT_FOUND', 'file not found: ' + file);
  const dir = M.checkOut(path.dirname(path.resolve(o.out)), o);
  const g = wrap(() => GF.read(file));
  const pic = wrap(() => R.render(g));
  const buf = wrap(() => R.png.encode(pic));
  const dest = path.join(dir, path.basename(o.out));
  M.writeAtomic(dest, buf);
  say(o, { v: 1, file: dest, w: pic.w, h: pic.h, bytes: buf.length }, dest);
  return M.EXIT.OK;
}

const RUN = { terrain, topo, info, png: pngCmd };

module.exports = {
  part: 'raster',
  version: VERSION,
  summary: 'grid functions: slope class, relief, contours, landform, regions, cost fields, tiles',
  commands: {
    terrain: { args: '--in D --out D [--json]', summary: 'slope class, shade and landform grids from height.mvg' },
    topo: { args: '--in D --out D [--size px] [--json]', summary: 'topographic picture (tint x shade) and contours.json' },
    info: { args: '<file.mvg> [--json]', summary: 'grid header and min, max, mean' },
    png: { args: '<file.mvg> --out <file.png>', summary: 'a grid as a PNG picture' },
  },
  run(argv) {
    const M = mv();
    const o = M.parseArgs(argv);
    const cmd = o.pos[0];
    if (!RUN[cmd]) throw new M.MvError('MV_USAGE', 'no command ' + cmd + ' in raster');
    return RUN[cmd](o);
  },
};

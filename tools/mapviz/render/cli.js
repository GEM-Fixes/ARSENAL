// render cli (MV-R1, MV-R2, MV-R3): `node tools/mapviz/mapviz.js render <command> [flags]` (tools/mapviz/README.md 1.9, 1.11,
// 2, 6.2; render.md 2.3).
//   l0 --map K [--mode m] [--size px] [common] [--in D] --out D [--json]
//        writes pic.l0.mvg, pic.l0.json, reads.json. No --size: one pixel per cell (R8 frame). --in: shade.mvg is taken from
//        there when it matches the grids (the runner's 'terrain' product), else made here.
//   l1 --map K [--mode m] [--size px] [--pool n] [--detail map|gpu] [common] --out D [--json]
//        writes pic.l1.mvg, pic.l1.json, reads.json. Default size 2048. --pool n: n child processes run the kernel
//        render/l1tile (0, the default, runs it in this process). --detail: the map-scale detail rule (map, the default)
//        or the GPU rule alone (gpu) = l1 o.detail; any other word exits 2 (MV_USAGE).
//   c0 --map K [--mode m] [--size px] [common] [--in D] --out D [--json]
//        writes c0.json, reads.json. pic.l1.mvg from an --in folder, else drawn here (size 2048 unless --size).
//        GoH: no picture is read or drawn (used false, why RENDER_C0_GOH, exit 1; pic null in c0.json).
//   l2 --map K [--mode m] [--size px] [--in D] --out D [--json]   (--pool accepted and ignored, render.md 2.3)
//        writes pic.l2.mvg, pic.l2.json, l2.n.mvg, l2.z.mvg, reads.json. --in: pic.l1.mvg + pic.l1.json (the base, used when
//        its frame is the plan frame), entcat.json (the catalog), height.mvg (the height grid); missing ones are made here.
//   pack --map K [--mode m] [--in D] --out D [--json]          pack.json, pack.bin, reads.json (R2b's pack.js)
//   l3 --map K [--mode m] [--size px] [--pool n] [--units] [--in D] --out D [--json]   (R2b's l3.js)
//        writes pic.l3.mvg, pic.l3.json, l3.n.mvg, l3.z.mvg, reads.json; --in: pic.l2 + aux, pack.json + pack.bin, height.mvg
//   l4 --map K [--mode m] [--size px] [--pool n] [--light clean|mode] [--grass on|off] [--shadow-size px] [--in D] --out D
//        [--json]   (R3's l4.js) writes pic.l4.mvg, pic.l4.json, reads.json; --in: pic.l3 + aux, pack.json + pack.bin, height.mvg
// --units only on l3; --light, --grass, --shadow-size only on l4; --detail only on l1; a bad word, or a shadow size outside
// 512..8192, exits 2 (MV_USAGE). A rung whose module is not built yet (l3, pack, l4) exits 4 (MV_NOT_BUILT, detail.code
// RENDER_NOT_BUILT); a module that throws on load is a fault (exit 2).
// Exit 0; 1 picture made with gaps (pack: some defs failed) or the minimap left out of the fit (c0 used false); 2 bad flag,
// a bad map.ply or a bad pack; 3 map, mode or map.ply not found; 4 not built; 5 cancelled; 6 --out refused. Never writes
// BC1 or a preview.
// Light at load: nothing heavy is required until run.
// Author: Imperator_Aug (ARSENAL, ia-368b8848)
'use strict';
const path = require('path');

const VERSION = 5;   // = index.js VERSION
const SPEC = { pool: 'num', detail: 'str', units: 'bool', light: 'str', grass: 'str', 'shadow-size': 'num' };
const DETAILS = ['map', 'gpu'];
const LIGHTS = ['clean', 'mode'];
const GRASS = ['on', 'off'];
const COMMON = '--target T [--game G] [--mods a,b] [--mod-dir D]';

function mv() { return require('../mapviz'); }
const json = x => JSON.stringify(x) + '\n';
// optional modules of the other builders (literal requires: the exe embeds them)
const opt3 = () => mv().opt(() => require('./l3'), './l3', __filename);
const optP = () => mv().opt(() => require('./pack'), './pack', __filename);
const opt4 = () => mv().opt(() => require('./l4'), './l4', __filename);
function need(mod, rung) {
  if (mod) return mod;
  throw new (mv().MvError)('MV_NOT_BUILT', 'render ' + rung + ' is not built yet', { code: 'RENDER_NOT_BUILT', rung });
}

function setup(o, entities) {
  const M = mv();
  if (!o.target) throw new M.MvError('MV_USAGE', '--target as64|mowas2|goh is needed');
  if (!o.map) throw new M.MvError('MV_USAGE', '--map <map key> is needed');
  if (!o.out) throw new M.MvError('MV_USAGE', '--out <folder> is needed');
  if (o.size !== undefined) require('./frame').checkSize(o.size);
  const mk = require('../lib/mapkit');
  const src = mk.source({ target: o.target, game: o.game, mods: o.mods, modDirs: o.modDirs });
  const out = M.checkOut(o.out, { gameDir: src.game, target: o.target });
  const doc = mk.doc(src, o.map, { mode: o.mode, entities: !!entities });
  if (o.mode && !(doc.modes || []).some(m => m.id === o.mode)) throw new M.MvError('MV_NOT_FOUND', 'map ' + o.map + ' has no mode ' + o.mode, { map: o.map, mode: o.mode });
  return { M, mk, src, out, doc, prog: M.progress(o) };
}

function writePic(M, out, rung, r, src) {
  const gf = require('../lib/raster/gridfile');
  gf.write(path.join(out, 'pic.' + rung + '.mvg'), r.grid);
  M.writeAtomic(path.join(out, 'pic.' + rung + '.json'), JSON.stringify(r.sidecar, null, 1) + '\n');
  const files = ['pic.' + rung + '.mvg', 'pic.' + rung + '.json'];
  if (r.aux) {
    for (const k of ['n', 'z']) {
      if (!r.aux[k]) continue;
      const f = rung + '.' + k + '.mvg';
      gf.write(path.join(out, f), r.aux[k]);
      files.push(f);
    }
  }
  M.writeAtomic(path.join(out, 'reads.json'), json({ v: 1, inputs: src.reads() }));
  files.push('reads.json');
  return files;
}

function report(o, body, text) {
  if (o.json) process.stdout.write(json(body));
  else if (!o.q) process.stdout.write(text + '\n');
}

function poolOf(M, o) {
  const pool = o.extra.pool === undefined ? 0 : o.extra.pool;
  if (!(Number.isInteger(pool) && pool >= 0 && pool <= 64)) throw new M.MvError('MV_USAGE', '--pool must be an integer 0..64');
  return pool;
}

function readGrid(f) { return require('../lib/raster/gridfile').read(f); }
function readJson(f) { return JSON.parse(require('fs').readFileSync(f, 'utf8')); }
// height.mvg from --in: {height} for the rung's o.grids (else the rung reads the grids itself)
function gridsIn(M, o) {
  const f = M.findIn(o.in, 'height.mvg');
  return f ? { height: readGrid(f) } : undefined;
}
// a picture rung from --in: {grid, sidecar, aux?, from:'in'} or undefined when a file is missing
function rungIn(M, o, rung, withAux) {
  const p = M.findIn(o.in, 'pic.' + rung + '.mvg'), s = M.findIn(o.in, 'pic.' + rung + '.json');
  if (!p || !s) return undefined;
  const base = { grid: readGrid(p), sidecar: readJson(s), from: 'in' };
  if (withAux) {
    const n = M.findIn(o.in, rung + '.n.mvg'), z = M.findIn(o.in, rung + '.z.mvg');
    if (!n || !z) return undefined;
    base.aux = { n: readGrid(n), z: readGrid(z) };
  }
  return base;
}
// pack.json + pack.bin from --in through readPack (R2b), else undefined
function packIn(M, o) {
  const j = M.findIn(o.in, 'pack.json');
  if (!j) return undefined;
  const dir = path.dirname(j);
  if (!require('fs').existsSync(path.join(dir, 'pack.bin'))) return undefined;
  return need(optP(), 'pack').readPack(dir);
}

function cmdL0(o) {
  const { M, mk, src, out, doc, prog } = setup(o);
  prog.stage('grids', 2);
  const g = mk.grids(src, o.map, { mode: o.mode });
  prog.step(1);
  let shade = null;
  const sf = M.findIn(o.in, 'shade.mvg');
  if (sf) {
    const s = readGrid(sf);
    if (s.w === g.height.w && s.h === g.height.h && s.etype === 'u8') shade = s;
  }
  const r = require('./l0').l0(doc, Object.assign({}, g, { shade }), { size: o.size, mode: o.mode, src, target: o.target });
  prog.step(1);
  const files = writePic(M, out, 'l0', r, src);
  const code = r.sidecar.gaps.length ? 1 : 0;
  report(o, { v: 1, map: o.map, out, files, w: r.grid.w, h: r.grid.h, gaps: r.sidecar.gaps }, files.join('\n') + (code ? '\ngaps ' + r.sidecar.gaps.join(' ') : ''));
  return code;
}

async function cmdL1(o) {
  const { M, src, out, doc, prog } = setup(o);
  const pool = poolOf(M, o);
  const detail = o.extra.detail === undefined ? 'map' : o.extra.detail;
  const r = await require('./l1').l1(src, doc, { size: o.size, mode: o.mode, pool, detail, progress: prog, cancelFlag: o.cancelFlag });
  const files = writePic(M, out, 'l1', r, src);
  const code = r.sidecar.gaps.length ? 1 : 0;
  report(o, { v: 1, map: o.map, out, files, w: r.grid.w, h: r.grid.h, gaps: r.sidecar.gaps, stats: r.stats },
    files.join('\n') + (code ? '\ngaps ' + r.sidecar.gaps.join(' ') : ''));
  return code;
}

async function cmdC0(o) {
  const { M, mk, src, out, doc, prog } = setup(o);
  // GoH minimaps are never a reference (c0 gives used false, RENDER_C0_GOH): no picture is read or drawn for them
  const goh = src.target === 'goh';
  let pic = null;
  const pf = goh ? null : M.findIn(o.in, 'pic.l1.mvg');
  if (pf) pic = readGrid(pf);
  else if (!goh) pic = (await require('./l1').l1(src, doc, { size: o.size, mode: o.mode, progress: prog, cancelFlag: o.cancelFlag })).grid;
  prog.stage('c0', 1);
  const grids = goh ? null : mk.grids(src, o.map, { mode: o.mode });
  const r = require('./c0').c0(src, doc, pic, { grids, mode: o.mode });
  const body = Object.assign({ v: 1, map: o.map, target: o.target, mode: o.mode || null, pic: pic ? { w: pic.w, h: pic.h, from: pf ? 'in' : 'drawn' } : null }, r,
    { made: new Date().toISOString() });
  M.writeAtomic(path.join(out, 'c0.json'), JSON.stringify(body, null, 1) + '\n');
  M.writeAtomic(path.join(out, 'reads.json'), json({ v: 1, inputs: src.reads() }));
  report(o, body, 'dx ' + r.dx + ' dy ' + r.dy + ' gain ' + r.gain + ' ssim ' + r.ssim + ' used ' + r.used + (r.why ? ' (' + r.why + ')' : ''));
  return r.used ? 0 : 1;
}

function picReport(o, out, files, r) {
  const gaps = r.sidecar.gaps || [];
  const code = gaps.length ? 1 : 0;
  report(o, { v: 1, map: o.map, out, files, w: r.grid.w, h: r.grid.h, gaps, stats: r.stats || null },
    files.join('\n') + (code ? '\ngaps ' + gaps.join(' ') : ''));
  return code;
}

async function cmdL2(o) {
  // --pool is not an l2 flag (render.md 2.3): accepted and ignored, as on l0 and c0; an l1 drawn here runs in process
  const { M, src, out, doc, prog } = setup(o, true);
  const base = rungIn(M, o, 'l1', false);
  const cf = M.findIn(o.in, 'entcat.json');
  const catalog = cf ? readJson(cf) : undefined;
  const r = await require('./l2').l2(src, doc, { size: o.size, mode: o.mode, base, catalog, grids: gridsIn(M, o), progress: prog, cancelFlag: o.cancelFlag });
  return picReport(o, out, writePic(M, out, 'l2', r, src), r);
}

async function cmdPack(o) {
  const P = need(optP(), 'pack');
  const { M, src, out, doc, prog } = setup(o, true);
  const cf = M.findIn(o.in, 'entcat.json');
  const r = await P.pack(src, doc, { mode: o.mode, catalog: cf ? readJson(cf) : undefined, progress: prog, cancelFlag: o.cancelFlag });
  const files = ['pack.json', 'pack.bin', 'reads.json'];
  if (typeof P.write === 'function') P.write(out, r);
  else {
    M.writeAtomic(path.join(out, 'pack.bin'), r.bin);
    M.writeAtomic(path.join(out, 'pack.json'), JSON.stringify(r.json, null, 1) + '\n');
  }
  M.writeAtomic(path.join(out, 'reads.json'), json({ v: 1, inputs: src.reads() }));
  const j = r.json || {};
  const failed = (j.counts && j.counts.failed) || ((j.defs || []).filter(d => d && d.state === 'failed').length);
  report(o, { v: 1, map: o.map, out, files, counts: j.counts || null, gaps: j.gaps || [] },
    files.join('\n') + (failed ? '\nfailed defs ' + failed : ''));
  return failed ? 1 : 0;
}

async function cmdL3(o) {
  const L3 = need(opt3(), 'l3');
  const { M, src, out, doc, prog } = setup(o, true);
  const pool = poolOf(M, o);
  const r = await L3.l3(src, doc, { size: o.size, mode: o.mode, base: rungIn(M, o, 'l2', true), pack: packIn(M, o), units: !!o.extra.units,
    grids: gridsIn(M, o), pool, progress: prog, cancelFlag: o.cancelFlag });
  return picReport(o, out, writePic(M, out, 'l3', r, src), r);
}

async function cmdL4(o) {
  const L4 = need(opt4(), 'l4');
  const { M, src, out, doc, prog } = setup(o, true);
  const pool = poolOf(M, o);
  const r = await L4.l4(src, doc, { size: o.size, mode: o.mode, base: rungIn(M, o, 'l3', true), pack: packIn(M, o), grids: gridsIn(M, o),
    light: o.extra.light === undefined ? 'clean' : o.extra.light, grass: o.extra.grass === 'on',
    shadowSize: o.extra.shadowSize === undefined ? 2048 : o.extra.shadowSize, pool, progress: prog, cancelFlag: o.cancelFlag });
  return picReport(o, out, writePic(M, out, 'l4', r, src), r);
}

const RUN = { l0: cmdL0, l1: cmdL1, c0: cmdC0, l2: cmdL2, pack: cmdPack, l3: cmdL3, l4: cmdL4 };

// flags that belong to one command only, and their word lists
function checkFlags(M, cmd, x) {
  const only = (flag, key, cmds) => {
    if (x[key] !== undefined && !cmds.includes(cmd)) throw new M.MvError('MV_USAGE', 'flag --' + flag + ' is an ' + cmds.join(', ') + ' flag');
  };
  only('detail', 'detail', ['l1']);
  only('units', 'units', ['l3']);
  only('light', 'light', ['l4']);
  only('grass', 'grass', ['l4']);
  only('shadow-size', 'shadowSize', ['l4']);
  if (x.detail !== undefined && !DETAILS.includes(x.detail)) throw new M.MvError('MV_USAGE', '--detail must be map or gpu, got ' + x.detail);
  if (x.light !== undefined && !LIGHTS.includes(x.light)) throw new M.MvError('MV_USAGE', '--light must be clean or mode, got ' + x.light);
  if (x.grass !== undefined && !GRASS.includes(x.grass)) throw new M.MvError('MV_USAGE', '--grass must be on or off, got ' + x.grass);
  if (x.shadowSize !== undefined && !(Number.isInteger(x.shadowSize) && x.shadowSize >= 512 && x.shadowSize <= 8192)) {
    throw new M.MvError('MV_USAGE', '--shadow-size must be an integer 512..8192 px, got ' + x.shadowSize);
  }
}

module.exports = {
  part: 'render',
  version: VERSION,
  summary: 'the picture of a map from its files: L0 schematic, L1 ground, C0 minimap registration, L2 decals and water, scene pack, L3 objects, L4 light and shadow',
  commands: {
    l0: { args: COMMON + ' --map K [--mode m] [--size px] [--in D] --out D [--json]', summary: 'schematic picture (ground types x relief)' },
    l1: { args: COMMON + ' --map K [--mode m] [--size px] [--pool n] [--detail map|gpu] --out D [--json]', summary: 'ground picture from map.ply, materials and textures' },
    c0: { args: COMMON + ' --map K [--mode m] [--size px] [--in D] --out D [--json]', summary: 'minimap registration numbers (AS2, AS64)' },
    l2: { args: COMMON + ' --map K [--mode m] [--size px] [--in D] --out D [--json] [-q] [--progress F] [--cancel-flag F]', summary: 'ground picture with road and ground decals and water planes' },
    pack: { args: COMMON + ' --map K [--mode m] [--in D] --out D [--json]', summary: 'scene pack: the object meshes and instances of a map' },
    l3: { args: COMMON + ' --map K [--mode m] [--size px] [--pool n] [--units] [--in D] --out D [--json]', summary: 'picture with the objects drawn from above' },
    l4: { args: COMMON + ' --map K [--mode m] [--size px] [--pool n] [--light clean|mode] [--grass on|off] [--shadow-size px] [--in D] --out D [--json]', summary: 'picture with sun light and shadows' },
  },
  run(argv) {
    const M = mv();
    const cmd = argv[0];
    if (!RUN[cmd]) throw new M.MvError('MV_USAGE', 'no render command ' + cmd);
    const o = M.parseArgs(argv.slice(1), SPEC);
    if (o.pos.length) throw new M.MvError('MV_USAGE', 'unexpected argument ' + o.pos[0]);
    checkFlags(M, cmd, o.extra);
    return RUN[cmd](o);
  },
};

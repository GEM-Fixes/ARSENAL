// paint cli (MV-PNT1): `node tools/mapviz/mapviz.js paint <command> [flags]` (paint contract 2).
//   styles [--json]                       the style table: id, state, version (nothing written)
//   draw --style S --map K [--mode m] [--size px] [--seed n] [--base auto|l4|l3|l2|l1|edshot|minimap|l0]
//        [--marks none|flags|full] [--with k,..] [--pool n] COMMON [--in D] --out D [--json]
//        writes pic.<S>.mvg, pic.<S>.json, reads.json. --base only with recon; --pool only with painted.
//   marks --map K [--mode m] [--marks flags|full] [--with k,..] [--style S] [--size px] [--seed n] COMMON [--in D] --out D
//        writes marks.json (vector), pic.marks.mvg (the marks alone on a transparent frame), pic.marks.json, reads.json
// Exit 0; 1 picture with gaps; 2 bad flag or value, a style that broke; 3 map, mode, height or recon base absent;
// 4 style not built; 5 cancelled; 6 --out refused. Light at load.
// Author: Imperator_Aug (ARSENAL, ia-f8c37ab0)
'use strict';
const path = require('path');

const VERSION = 1;   // = index.js VERSION
const SPEC = { style: 'str', base: 'str', marks: 'str', with: 'str', pool: 'num' };
const COMMON = '--target T [--game G] [--mods a,b] [--mod-dir D]';

function mv() { return require('../mapviz'); }
const json = x => JSON.stringify(x) + '\n';

function report(o, body, text) {
  if (o.json) process.stdout.write(json(body));
  else if (!o.q) process.stdout.write(text + '\n');
}

function cmdStyles(o) {
  const list = require('./styles').list();
  report(o, { v: 1, styles: list }, list.map(s => s.id + '\t' + s.state + '\t' + (s.version === null ? '-' : s.version)).join('\n'));
  return 0;
}

function common(o, M) {
  if (!o.target) throw new M.MvError('MV_USAGE', '--target as64|mowas2|goh is needed');
  if (!o.map) throw new M.MvError('MV_USAGE', '--map <map key> is needed');
  if (!o.out) throw new M.MvError('MV_USAGE', '--out <folder> is needed');
  if (o.size !== undefined) require('../render/frame').checkSize(o.size);
  if (!Number.isInteger(o.seed)) throw new M.MvError('MV_USAGE', '--seed must be an integer');
}

function source(o) {
  return require('../lib/mapkit').source({ target: o.target, game: o.game, mods: o.mods, modDirs: o.modDirs });
}

async function cmdDraw(o) {
  const M = mv(), P = require('./index');
  const style = o.extra.style;
  if (!style) throw new M.MvError('MV_USAGE', '--style ' + P.STYLES.join('|') + ' is needed');
  P.styles.load(style);   // unknown (2), not built (4), broken (2) before any game read
  common(o, M);
  if (o.extra.base !== undefined) {
    if (style !== 'recon') throw new M.MvError('MV_USAGE', '--base is a recon flag');
    if (!P.BASE_WORDS.includes(o.extra.base)) throw new M.MvError('MV_USAGE', '--base must be one of ' + P.BASE_WORDS.join(', ') + ', got ' + o.extra.base);
    if (o.extra.base === 'minimap' && o.target === 'goh') throw new M.MvError('MV_USAGE', 'GoH minimaps are sketches, never a recon base', { code: 'PAINT_BASE_GOH_MINIMAP' });
  }
  if (o.extra.pool !== undefined) {
    if (style !== 'painted') throw new M.MvError('MV_USAGE', '--pool is a painted flag');
    if (!(Number.isInteger(o.extra.pool) && o.extra.pool >= 0 && o.extra.pool <= 64)) throw new M.MvError('MV_USAGE', '--pool must be an integer 0..64');
  }
  const mk = P.checkMarks({ marks: o.extra.marks, with: o.extra.with });
  const prog = M.progress(o);
  prog.stage('read', 1000);
  const src = source(o);
  const out = M.checkOut(o.out, { gameDir: src.game, target: o.target });
  const tick = (d, t) => prog.set(Math.min(d, t), t);
  // a pool needs task files: a scratch folder under the temp dir, removed after (never inside --out)
  const fs = require('fs'), os = require('os');
  const workDir = o.extra.pool > 0 ? fs.mkdtempSync(path.join(os.tmpdir(), 'mapviz-paint-')) : null;
  let r;
  try {
    r = await P.picture({
      style, target: o.target, game: o.game, mods: o.mods, modDirs: o.modDirs, map: o.map, mode: o.mode, size: o.size === undefined ? 2048 : o.size,
      seed: o.seed, base: o.extra.base, in: o.in, src, marks: mk.set, with: mk.with, pool: o.extra.pool || 0, kind: o.kind, tick, workDir,
      // tick is prog.set, which checks --cancel-flag on every call; the flag and progress also reach the l1 recon base
      cancelFlag: o.cancelFlag, progress: prog, stage: (name, n) => prog.stage(name, n),
    });
  } finally {
    if (workDir) { try { fs.rmSync(workDir, { recursive: true, force: true }); } catch (e) { /* temp folder: the OS clears it */ } }
  }
  prog.stage('write', 3);
  const name = 'pic.' + style;
  const files = P.record.write(out, name, r.grid, r.sidecar);
  prog.step();
  files.push(P.record.reads(out, src));
  prog.step(2);
  const sc = r.sidecar;
  const code = sc.gaps.length ? 1 : 0;
  report(o, { v: 1, map: o.map, style, out, files, w: sc.w, h: sc.h, thumb: sc.thumb, base: sc.base, gaps: sc.gaps, notes: sc.notes },
    files.join('\n') + (code ? '\ngaps ' + sc.gaps.join(' ') : ''));
  return code;
}

async function cmdMarks(o) {
  const M = mv(), P = require('./index');
  const style = o.extra.style || 'staff';
  if (!P.STYLES.includes(style)) throw new M.MvError('MV_USAGE', 'no paint style ' + style, { code: 'PAINT_STYLE_UNKNOWN', style });
  common(o, M);
  if (o.extra.base !== undefined) throw new M.MvError('MV_USAGE', '--base is a draw flag');
  if (o.extra.pool !== undefined) throw new M.MvError('MV_USAGE', '--pool is a draw flag');
  const set = o.extra.marks === undefined ? 'flags' : o.extra.marks;
  if (set === 'none') throw new M.MvError('MV_USAGE', '--marks for paint marks must be flags or full, got none', { code: 'PAINT_MARKS_SET' });
  const mk = P.checkMarks({ marks: set, with: o.extra.with });
  const prog = M.progress(o);
  prog.stage('read', 3);
  const src = source(o);
  const out = M.checkOut(o.out, { gameDir: src.game, target: o.target });
  // the doc: mapdoc.json from --in for this map, else mapkit
  let doc = null;
  const f = M.findIn(o.in, 'mapdoc.json');
  if (f) { try { const d = JSON.parse(require('fs').readFileSync(f, 'utf8')); if (d && d.key === o.map && (!d.game || d.game === o.target)) doc = d; } catch (e) { doc = null; } }
  if (!doc) doc = require('../lib/mapkit').doc(src, o.map, { mode: o.mode, entities: false });
  if (o.mode && !(doc.modes || []).some(m => m.id === o.mode)) throw new M.MvError('MV_NOT_FOUND', 'map ' + o.map + ' has no mode ' + o.mode, { map: o.map, mode: o.mode });
  prog.step();
  const frame = P.frameFor(doc, { size: o.size === undefined ? 2048 : o.size });
  const vectors = {}, layers = {};
  if (mk.kinds.includes('water')) {
    const wf = M.findIn(o.in, 'water.labels.json');
    if (wf) {
      try { vectors['water.labels'] = JSON.parse(require('fs').readFileSync(wf, 'utf8')).items || []; } catch (e) { /* none */ }
      const df = M.findIn(o.in, 'water.drown.mvg');
      if (df) { try { layers['water.drown'] = require('../lib/raster/gridfile').read(df); } catch (e) { /* the by-name rule of input.js */ } }
    }
    else {
      try {
        const Wt = require('../rules/water');
        const g = require('../lib/mapkit').grids(src, o.map, { mode: o.mode });
        const prof = Wt.profile(src);
        const wm = Wt.masks(doc, g, prof, o.mode);
        vectors['water.labels'] = Wt.labels(doc, wm, prof);
        layers['water.drown'] = wm.drown;   // its meta depthM tells marks which drown classes count
      } catch (e) { if (e instanceof M.MvError && e.code === 'MV_CANCELLED') throw e; }
    }
  }
  prog.step();
  const palette = JSON.parse(require('fs').readFileSync(path.join(__dirname, '..', 'palette.json'), 'utf8'));
  const inp = { v: 1, style, target: o.target, map: o.map, mode: o.mode || null, doc, frame, layers, vectors, palette, seed: o.seed };
  const items = P.marks.read(inp, { in: o.in, kinds: mk.kinds, kind: o.kind });
  prog.stage('draw', 1);
  const grid = P.canvas.create(frame);
  const tr = P.thumbRules(frame);
  const d = P.marks.draw(grid, frame, items, Object.assign({ hand: P.marks.HANDS[style], palette, kinds: mk.kinds, seed: o.seed }, tr));
  grid.name = 'pic.marks';
  grid.meta = Object.assign({}, grid.meta, { hand: P.marks.HANDS[style], set: mk.set, kinds: mk.kinds });
  prog.stage('write', 3);
  const vec = { v: 1, kind: 'vector', name: 'marks', items: P.marks.toFile(items) };
  M.writeAtomic(path.join(out, 'marks.json'), JSON.stringify(vec) + '\n');
  const res = { gaps: [], notes: [], stats: {}, approx: false, counts: { outsidePather: 0, noData: 0 },
    marks: { set: mk.set, kinds: mk.kinds, drawn: d.drawn, dropped: d.dropped, scaleBar: d.scaleBar } };
  const sc = P.record.sidecar(inp, res, { layer: 'pic.marks', styleVersion: null, inputs: {}, mapHashes: P.mapHashesOf(src, o.map) });
  const files = ['marks.json'].concat(P.record.write(out, 'pic.marks', grid, sc));
  files.push(P.record.reads(out, src));
  prog.step(3);
  report(o, { v: 1, map: o.map, out, files, w: frame.W, h: frame.H, drawn: d.drawn, dropped: d.dropped, scaleBar: d.scaleBar },
    files.join('\n') + '\ndrawn ' + Object.keys(d.drawn).map(k => k + ' ' + d.drawn[k]).join(', '));
  return 0;
}

const RUN = { styles: cmdStyles, draw: cmdDraw, marks: cmdMarks };

module.exports = {
  part: 'paint',
  version: VERSION,
  summary: 'map pictures in four styles (staff map, painted relief, recon photo, field sketch) and the marks',
  commands: {
    styles: { args: '[--json]', summary: 'the styles and whether each is built' },
    draw: { args: '--style S --map K [--mode m] [--size px] [--seed n] [--base auto|l4|l3|l2|l1|edshot|minimap|l0] [--marks none|flags|full] [--with k,..] [--pool n] ' + COMMON + ' [--in D] --out D [--json]', summary: 'a picture of a map in one style' },
    marks: { args: '--map K [--mode m] [--marks flags|full] [--with k,..] [--style S] [--size px] [--seed n] ' + COMMON + ' [--in D] --out D [--json]', summary: 'the marks alone (flags, spawns, water, scale bar) on a clear picture' },
  },
  run(argv) {
    const M = mv();
    const cmd = argv[0];
    if (!RUN[cmd]) throw new M.MvError('MV_USAGE', 'no paint command ' + cmd);
    const o = M.parseArgs(argv.slice(1), SPEC);
    if (o.pos.length) throw new M.MvError('MV_USAGE', 'unexpected argument ' + o.pos[0]);
    return RUN[cmd](o);
  },
};

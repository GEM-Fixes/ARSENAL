// paint recon real-install test (MV-PNT2 part a): per installed game, `mapviz render l1` of one real multiplayer map
// (MoW:AS2 and AS64 multi/1v1_road, GoH multi/1v1_balzerweg), then the Recon photo over it in process; on MoW:AS2 and
// AS64 also over the shipped minimap (laid over the world box, file row 0 = min world y, paint.md 4.5), which GoH never
// uses (its minimap is a drawing: design 9). Checks are sane numbers, not pinned pictures: grey, alpha 255, a level
// spread, a mean, a spread of the output, the vignette darkening the corners, the gaps per rung. When the shared paint
// cli is there it also runs `paint draw --style recon --in <l1 folder>` and checks base.from l1; when input.js is there
// it checks baseOrder per game. Prints times and PNG paths to look at (north up, a grey photo, darker corners).
// Skipped per game when the install is absent; MAPVIZ_NO_GAME=1 skips everything (no folder is made). Installs are read
// through the shared libs only. The scratch folder is deleted on PASS unless MAPVIZ_RECON_KEEP=1 or a dir is given.
//   MAPVIZ_RECON_SIZE=<px> (default 768: over 512, so the full pass, not the thumbnail pass)
// usage: node tools/mapviz/paint/recon/test/real.test.js [scratch dir]
// Author: Imperator_Aug (ARSENAL, ia-d19670cf)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), { spawnSync } = require('child_process');

const PAINT = path.resolve(__dirname, '../..');
const MV = path.resolve(PAINT, '..');
const MVJS = path.join(MV, 'mapviz.js');
const SIZE = Number(process.env.MAPVIZ_RECON_SIZE) || 768;
let pass = 0, fail = 0;
function ok(c, what) { if (c) pass++; else { fail++; console.log('FAIL mapviz paint recon real: ' + what); } }

function installs() {
  if (process.env.MAPVIZ_NO_GAME === '1') return {};
  const gd = require('../../../../lib/gamedir');
  const out = {};
  let as2 = null;
  try { const r = gd.resolve({}); as2 = r && r.dir && fs.existsSync(path.join(r.dir, 'resource', 'map.pak')) ? r.dir : null; } catch (e) { as2 = null; }
  let goh = null;
  try { const g = gd.goh(); goh = g && fs.existsSync(path.join(g, 'resource', 'map', 'multi.pak')) ? g : null; } catch (e) { goh = null; }
  if (as2) { out.mowas2 = as2; out.as64 = as2; }
  if (goh) out.goh = goh;
  return out;
}
const MAPS = { mowas2: 'multi/1v1_road', as64: 'multi/1v1_road', goh: 'multi/1v1_balzerweg' };
const have = installs();
const targets = Object.keys(MAPS).filter(t => have[t]);
if (!targets.length) {
  console.log('skip: ' + (process.env.MAPVIZ_NO_GAME === '1' ? 'MAPVIZ_NO_GAME=1' : 'no MoW:AS2 / AS64 / GoH install found'));
  console.log('PASS mapviz paint recon real (0, skipped)');
  process.exit(0);
}
for (const t of Object.keys(MAPS)) if (!have[t]) console.log('skip ' + t + ': no install');

const OWN = !process.argv[2] && process.env.MAPVIZ_RECON_KEEP !== '1';
const W = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'mapviz-recon-real-')));
fs.mkdirSync(W, { recursive: true });
{
  const c = process.env.ARSENAL_CACHE;
  process.env.ARSENAL_CACHE = c && path.resolve(c).startsWith(W + path.sep) ? c : path.join(W, 'cache');
}

const R = require('../index');
const palette = require(path.join(MV, 'palette.json'));
const gridfile = require(path.join(MV, 'lib', 'raster', 'gridfile'));
const F = require(path.join(MV, 'render', 'frame'));

function cli(args) {
  const t = Date.now();
  const r = spawnSync(process.execPath, [MVJS].concat(args), { encoding: 'utf8', env: Object.assign({}, process.env), timeout: 600000 });
  return { code: r.status, out: r.stdout || '', err: (r.stderr || '').trim(), s: (Date.now() - t) / 1000 };
}
function frameOfPic(pic) {
  const cy = (pic.meta && pic.meta.cellY) || pic.cell;
  const fr = { box: [pic.ox, pic.oy, pic.ox + pic.w * pic.cell, pic.oy + pic.h * cy], W: pic.w, H: pic.h, sx: pic.cell, sy: cy, x0: pic.ox, y0: pic.oy, long: Math.max(pic.w, pic.h) };
  fr.stretch = [fr.sx / fr.sy];
  return fr;
}
function inputOf(t, key, frame, base) {
  return { v: 1, style: 'recon', target: t, map: key, mode: null, doc: null, W: null, frame, layers: {}, vectors: {}, base,
    palette, pal: palette.styles.recon, seed: 1 };
}
const OPTS = fr => ({ thumb: fr.long <= 512, minStroke: fr.long <= 512 ? 2 : 1, maxSymbols: fr.long <= 512 ? 5 : null, contours: fr.long > 512,
  seed: 1, tick: () => {}, pool: 0, workDir: null });
function lumStats(g) {
  let s = 0, s2 = 0, grey = true;
  const n = g.w * g.h;
  for (let k = 0; k < g.data.length; k += 4) {
    const v = g.data[k]; s += v; s2 += v * v;
    if (v !== g.data[k + 1] || v !== g.data[k + 2] || g.data[k + 3] !== 255) grey = false;
  }
  const m = s / n;
  return { mean: m, std: Math.sqrt(Math.max(0, s2 / n - m * m)), grey };
}
// one recon picture over a base: sane numbers, the vignette against a draw with no vignette, a PNG to look at
function check(label, input, wantGaps) {
  const fr = input.frame;
  const t0 = Date.now();
  const r = R.draw(input, OPTS(fr));
  const s = (Date.now() - t0) / 1000;
  const st = lumStats(r.grid);
  ok(r.grid.w === fr.W && r.grid.h === fr.H && st.grey, label + ': grey rgba8 ' + fr.W + ' x ' + fr.H + ', alpha 255');
  ok(r.stats.stretched && r.stats.levels[1] - r.stats.levels[0] >= 16, label + ': base levels ' + r.stats.levels + ' stretched');
  ok(st.mean > 30 && st.mean < 225 && st.std > 8, label + ': mean ' + st.mean.toFixed(1) + ' in 30..225, std ' + st.std.toFixed(1) + ' > 8');
  ok(JSON.stringify(r.gaps) === JSON.stringify(wantGaps), label + ': gaps ' + JSON.stringify(r.gaps) + ', want ' + JSON.stringify(wantGaps));
  const nv = R.draw(Object.assign({}, input, { pal: Object.assign({}, input.pal, { vignette: 0 }) }), OPTS(fr));
  const corners = [[0, 0], [fr.W - 1, 0], [0, fr.H - 1], [fr.W - 1, fr.H - 1]].map(([i, j]) => (j * fr.W + i) * 4);
  ok(corners.every(k => r.grid.data[k] <= nv.grid.data[k]) && corners.some(k => r.grid.data[k] < nv.grid.data[k] || nv.grid.data[k] === 0),
    label + ': vignette darkens the four corners');
  const mvg = path.join(W, label.replace(/[^a-z0-9]+/gi, '-') + '.mvg');
  gridfile.write(mvg, r.grid);
  const png = mvg.replace(/\.mvg$/, '.png');
  const p = cli(['raster', 'png', mvg, '--out', png]);
  ok(p.code === 0 && fs.existsSync(png), label + ': raster png exit ' + p.code + ' ' + p.err.slice(-200));
  console.log(label + ': ' + fr.W + 'x' + fr.H + ' draw ' + s.toFixed(2) + ' s, levels ' + r.stats.levels + ', mean ' + st.mean.toFixed(1) +
    ', std ' + st.std.toFixed(1) + ', gaps ' + JSON.stringify(r.gaps) + '\n  look: ' + png);
  return r;
}

for (const t of targets) {
  const key = MAPS[t];
  const base = ['--target', t, '--game', have[t], '--map', key];
  const l1dir = path.join(W, t + '-l1');
  const c = cli(['render', 'l1'].concat(base, ['--size', String(SIZE), '--out', l1dir, '--json']));
  const mvg = path.join(l1dir, 'pic.l1.mvg');
  ok((c.code === 0 || c.code === 1) && fs.existsSync(mvg), t + ' ' + key + ' render l1: exit ' + c.code + ' ' + c.err.slice(-300));
  if (!fs.existsSync(mvg)) continue;
  console.log(t + ' ' + key + ' render l1 ' + c.s.toFixed(1) + ' s');
  const pic = gridfile.read(mvg);
  const sc = JSON.parse(fs.readFileSync(path.join(l1dir, 'pic.l1.json'), 'utf8'));
  const fr = frameOfPic(pic);
  ok(Math.max(fr.W, fr.H) === SIZE, t + ' l1 long side ' + SIZE);
  check(t + ' recon over l1', inputOf(t, key, fr, { from: 'l1', grid: pic, approx: !!sc.approx, sidecar: sc }), sc.approx ? ['PAINT_BASE_APPROX'] : []);

  // the shipped minimap: a recon base on MoW:AS2 and AS64 only
  let src = null, doc = null;
  try { const mk = require(path.join(MV, 'lib', 'mapkit')); src = mk.source({ target: t, game: have[t] }); doc = mk.doc(src, key, { entities: false }); } catch (e) { console.log('skip ' + t + ' minimap: ' + (e.code || e.message)); }
  const mm = doc && doc.pictures && doc.pictures.minimap;
  if (t === 'goh') {
    console.log('goh ' + key + ': shipped minimap ' + (mm ? mm.file : 'none') + ' is never a recon base (a drawing, design 9)');
  } else if (mm && mm.file && /\.dds$/i.test(mm.file)) {
    const k = 'resource/map/' + doc.key + '/' + String(mm.file).toLowerCase();
    const buf = src.has(k) ? src.read(k) : null;
    const d = buf ? require(path.join(MV, '..', 'lib', 'model', 'dds')).decode(buf, { mip: 0 }) : null;
    ok(d && !d.error && d.rgba, t + ' minimap ' + mm.file + ' decodes');
    if (d && d.rgba) {
      const bw = doc.boxes.world;
      const mg = { name: 'minimap', w: d.width, h: d.height, cell: (bw[2] - bw[0]) / d.width, ox: bw[0], oy: bw[1], etype: 'rgba8', sample: 'cell',
        scale: 1, offset: 0, nodata: null, meta: { cellY: (bw[3] - bw[1]) / d.height }, data: Uint8ClampedArray.from(d.rgba) };
      const onFrame = F.resampleTo(mg, fr, 'pic.minimap');
      check(t + ' recon over minimap', inputOf(t, key, fr, { from: 'minimap', grid: onFrame, approx: true, sidecar: null }), ['PAINT_BASE_MINIMAP']);
    }
  } else console.log('skip ' + t + ' minimap: ' + key + ' has no dds minimap');

  // shared paint pieces, when there
  if (fs.existsSync(path.join(PAINT, 'input.js'))) {
    try {
      const order = require(path.join(PAINT, 'input')).baseOrder(t);
      ok(t === 'goh' ? order.indexOf('minimap') < 0 : order.indexOf('minimap') === 5, t + ' baseOrder ' + JSON.stringify(order));
    } catch (e) { ok(false, t + ' input.baseOrder: ' + e.message); }
  } else console.log('skip ' + t + ' baseOrder: tools/mapviz/paint/input.js not there yet');
  if (fs.existsSync(path.join(PAINT, 'cli.js')) && fs.existsSync(path.join(PAINT, 'index.js'))) {
    const out = path.join(W, t + '-pd');
    const d = cli(['paint', 'draw', '--style', 'recon'].concat(base, ['--size', String(SIZE), '--in', l1dir, '--out', out, '--json']));
    const psc = fs.existsSync(path.join(out, 'pic.recon.json')) ? JSON.parse(fs.readFileSync(path.join(out, 'pic.recon.json'), 'utf8')) : null;
    ok((d.code === 0 || d.code === 1) && psc && psc.base && psc.base.from === 'l1' && psc.style === 'recon',
      t + ' paint draw --style recon --in l1: base l1 (exit ' + d.code + ' ' + d.err.slice(-200) + ')');
  } else console.log('skip ' + t + ' paint draw: tools/mapviz/paint/cli.js not there yet');
}

// a GoH map whose l1 leaves an empty (alpha 0) strip in the frame: the level stretch must come from the ground pixels
// only, so lo > 0 (a fixer check: before it, levels were [0, 255] and the picture came out near white)
const EMPTY = { goh: 'multi/0_frontlines/2v2_bastogne' };
for (const t of Object.keys(EMPTY).filter(t => have[t])) {
  const key = EMPTY[t], l1dir = path.join(W, t + '-empty-l1');
  const c = cli(['render', 'l1', '--target', t, '--game', have[t], '--map', key, '--size', String(SIZE), '--out', l1dir, '--json']);
  const mvg = path.join(l1dir, 'pic.l1.mvg');
  ok((c.code === 0 || c.code === 1) && fs.existsSync(mvg), t + ' ' + key + ' render l1: exit ' + c.code + ' ' + c.err.slice(-300));
  if (!fs.existsSync(mvg)) continue;
  const pic = gridfile.read(mvg), sc = JSON.parse(fs.readFileSync(path.join(l1dir, 'pic.l1.json'), 'utf8'));
  const r = check(t + ' recon over l1 with empty pixels', inputOf(t, key, frameOfPic(pic), { from: 'l1', grid: pic, approx: !!sc.approx, sidecar: sc }), sc.approx ? ['PAINT_BASE_APPROX'] : []);
  ok(r.stats.empty > 0 && r.stats.levels[0] > 0, t + ' ' + key + ': ' + r.stats.empty + ' empty pixels, levels ' + r.stats.levels + ' (lo > 0)');
}

if (fail) { console.log(fail + ' failed, ' + pass + ' passed (pictures kept in ' + W + ')'); process.exit(1); }
if (OWN) { try { fs.rmSync(W, { recursive: true, force: true }); } catch (e) { /* temp */ } console.log('scratch folder deleted (MAPVIZ_RECON_KEEP=1 keeps it)'); }
console.log('PASS mapviz paint recon real (' + pass + ')');

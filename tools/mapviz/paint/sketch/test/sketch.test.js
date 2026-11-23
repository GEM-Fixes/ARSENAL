// sketch test (MV-PNT3): the Field sketch style (paint contract 4.3, 4.4, 8; design 9). Synthetic input of contract 8.1:
// stats, water counts against an independent count, thumbnail rules, absent wants (gaps and notes), the same bytes for
// as64, mowas2 and goh, determinism, progress and cancel, planted bad inputs. Fixture map in both forms (README 10):
// frame, tree stamps full / thumbnail, crests, buildings, goldens at 512 and 1500 px. The CLI run through mapviz.js when
// the shared paint CLI is there.
// Needs the shared paint files (canvas, paper, input, test/synth). Goldens: sha1 of the picture data at 512 and 1500 px,
// both fixture forms; MAPVIZ_GOLDEN=write rewrites sketch.golden.json (after a change of the style or the shared files).
// usage: node tools/mapviz/paint/sketch/test/sketch.test.js [scratch dir]
// Author: Imperator_Aug (ARSENAL, ia-e40bbaa6)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto'), { spawnSync } = require('child_process');

const OWN = !process.argv[2];
const W = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'mapviz-sketch-')));
fs.mkdirSync(W, { recursive: true });
{
  const c = process.env.ARSENAL_CACHE;
  process.env.ARSENAL_CACHE = c && path.resolve(c).startsWith(W + path.sep) ? c : path.join(W, 'cache');
}

let pass = 0, fail = 0;
function ok(c, what) { if (c) pass++; else { fail++; console.log('FAIL mapviz sketch: ' + what); } }
function eq(a, b, what) { ok(JSON.stringify(a) === JSON.stringify(b), what + ': got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b)); }
function throwsCode(fn, code, sub, what) {
  try { fn(); ok(false, what + ': did not throw'); } catch (e) {
    ok(e && e.code === code && (!sub || (e.detail && e.detail.code === sub)), what + ': threw ' + (e && e.code) + ' ' + (e && e.detail && e.detail.code) + ' ' + (e && e.message));
  }
}
const sha1 = g => crypto.createHash('sha1').update(Buffer.from(g.data.buffer, g.data.byteOffset, g.data.byteLength)).digest('hex');

const ROOT = path.resolve(__dirname, '../../..');
const PAINT = path.join(ROOT, 'paint');
const lib = require('../lib');
const SK = require('..');

// ---------------------------------------------------------------- shared files or stand-ins
const NEED = {
  canvas: ['create', 'toPx', 'color', 'blend', 'fillPoly', 'strokePath', 'hatchMask'],
  paper: ['hash', 'noise', 'fbm', 'grain'],
  input: ['sample', 'waterMask', 'roadMask', 'woodMask', 'treePoints', 'buildings'],
};
// the stand-ins written while the shared files were missing are deleted (contract 1); a shared file that is absent or
// lacks a function the style calls ends the test here with one clear line
const used = {};
function need(name, file, fns) {
  let m = null, why = '';
  try { m = require(file); } catch (e) { why = e.message; }
  const miss = m ? fns.filter(f => typeof m[f] !== 'function') : fns;
  if (miss.length) {
    console.log('FAIL mapviz sketch: shared paint ' + name + ' is not usable (' + (why || 'missing ' + miss.join(', ')) + ')');
    process.exit(1);
  }
  used[name] = 'shared';
  return m;
}
for (const name of Object.keys(NEED)) need(name, path.join(PAINT, name), NEED[name]);
const S = need('synth', path.join(PAINT, 'test', 'synth'), ['synth', 'synthOpts']);
const LIBS = ['canvas', 'paper', 'input'].map(k => k + ':' + used[k]).join(',');
const FX = require('./fxinput');

// ---------------------------------------------------------------- module shape
eq([SK.ID, SK.VERSION, SK.NEEDS], ['sketch', 1, ['height']], 'module ID, VERSION, NEEDS');
eq(SK.WANTS.slice().sort(), ['gtype', 'landform.r50', 'material', 'objects', 'slopecls', 'water.band', 'water.drown'], 'WANTS = contract 4.4 row');
{
  const src = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
  ok(!/Math\.random|Date\.now|new Date|readFileSync|require\(['"]fs['"]\)/.test(src), 'index.js reads no clock, file or Math.random');
  for (const f of fs.readdirSync(path.join(__dirname, '..')).filter(f => f.endsWith('.js'))) {
    const s = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    ok(!/Math\.random|Date\.now|new Date\(|\btarget\b\s*===|['"](as64|mowas2|goh)['"]/.test(s), f + ': no clock, no Math.random, no branch on the game');
  }
}

// ---------------------------------------------------------------- synthetic input
const draw = (inp, o) => SK.draw(inp, Object.assign(S.synthOpts(inp), o || {}));
{
  const inp = S.synth({ style: 'sketch', size: 128 });
  eq([inp.frame.W, inp.frame.H, inp.frame.sx, inp.frame.sy], [128, 96, 5, 5], 'synth frame 128');
  const r = draw(inp);
  eq([r.grid.name, r.grid.etype, r.grid.w, r.grid.h], ['pic.sketch', 'rgba8', 128, 96], 'grid name, etype, size');
  let a255 = true;
  for (let k = 3; k < r.grid.data.length; k += 4) if (r.grid.data[k] !== 255) { a255 = false; break; }
  ok(a255, 'alpha 255 everywhere (paper covers the frame)');
  eq([r.gaps, r.approx, r.notes], [[], false, []], 'synth with every want: no gap, no note');
  eq([r.stats.thumb, r.stats.hachureFrom, r.stats.trees, r.stats.treeStamps, r.stats.buildings, r.stats.crests], [true, 3, 3, 1, 1, 1],
    'synth 128 (thumb): hachures from class 3, 3 trees in 1 stamp, 1 building, 1 crest');
  ok(r.stats.hachures > 0 && r.stats.roadPx > 0, 'hachures and road smudge drawn: ' + r.stats.hachures + ', ' + r.stats.roadPx);
  // water counts against an independent count: a pixel takes its cell's code (south-west lattice point distance d)
  const f = inp.frame, want = { noProne: 0, swim: 0, drown: 0 };
  for (let j = 0; j < f.H; j++) for (let i = 0; i < f.W; i++) {
    const ci = Math.floor((f.x0 + (i + 0.5) * f.sx + 320) / 10), cj = Math.floor((f.y0 + (j + 0.5) * f.sy + 240) / 10);
    if (ci === 63 && cj >= 44) continue;   // off ground
    const d = Math.hypot(-320 + 10 * ci - 160, -240 + 10 * cj + 100);
    if (d < 30) { want.swim++; if (d < 20) want.drown++; } else if (d < 40) want.noProne++;
  }
  eq(r.stats.water, want, 'synth water pixel counts (no prone, swim, drown)');
  const r2 = draw(S.synth({ style: 'sketch', size: 128 }));
  eq(sha1(r2.grid), sha1(r.grid), 'same input, same bytes');
  const big = draw(S.synth({ style: 'sketch', size: 600 }));
  eq([big.stats.thumb, big.stats.hachureFrom, big.stats.treeStamps, big.stats.crests], [false, 1, 3, 1], 'synth 600: full pass, hachures from class 1, one stamp per tree');
  ok(big.stats.hachures > r.stats.hachures, 'more hachures in the full pass');
  ok(big.stats.crestM >= 10 && big.stats.crestM <= 24, 'crest length 10..24 m: ' + big.stats.crestM);
  // the same bytes for every game (the style never branches on the target)
  const as64 = draw(S.synth({ style: 'sketch', size: 128, target: 'as64' })), goh = draw(S.synth({ style: 'sketch', size: 128, target: 'goh' }));
  ok(sha1(as64.grid) === sha1(r.grid) && sha1(goh.grid) === sha1(r.grid), 'as64, mowas2 and goh give the same picture');
  // seed moves the strokes
  ok(sha1(draw(S.synth({ style: 'sketch', size: 128 }), { seed: 2 }).grid) !== sha1(r.grid), 'seed 2 gives other strokes');
  // absent wants
  const drop = d => draw(S.synth({ style: 'sketch', size: 128, drop: d }));
  const nO = drop(['objects']);
  eq([nO.gaps, nO.stats.treeStamps, nO.stats.buildings], [['PAINT_NO_OBJECTS'], 0, 0], 'no objects: gap, no stamps, no buildings');
  const nL = drop(['landform.r50']);
  eq([nL.gaps, nL.stats.crests], [['PAINT_NO_LANDFORM'], 0], 'no landform: gap, no crests');
  const nW = drop(['water.band', 'water.drown']);
  eq([nW.gaps, nW.approx], [['PAINT_NO_WATER_MASKS'], true], 'no water masks: gap, approx');
  ok(nW.stats.water.drown > 0, 'water from ground types 3..5 still drawn: ' + JSON.stringify(nW.stats.water));
  const nM = drop(['material']);
  eq([nM.gaps, nM.notes.map(n => n.code)], [[], ['PAINT_NO_MATERIAL']], 'no material: note only');
  ok(nM.stats.roadPx > 0, 'no material: roads from ground type 7 and decals');
  const nS = drop(['slopecls']);
  eq([nS.notes.map(n => n.code), sha1(nS.grid)], [['PAINT_INPUT_MADE'], sha1(r.grid)], 'no slopecls: made from height, same picture');
  // GoH forest ground (type 10) with no tree entity gets forest stamps
  const fo = S.synth({ style: 'sketch', size: 600, target: 'goh', drop: ['objects'] });
  const gt = fo.layers.gtype;
  for (let j = 4; j < 44; j++) for (let i = 2; i < 40; i++) gt.data[j * gt.w + i] = 10;   // x -300..80, y -200..200
  const rf = draw(fo);
  ok(rf.stats.forestStamps > 0 && rf.stats.treeStamps === 0, 'ground type 10 forest: ' + rf.stats.forestStamps + ' forest stamps, no tree stamps');
  // progress and cancel
  const seen = [];
  draw(S.synth({ style: 'sketch', size: 128 }), { tick: (d, t) => seen.push([d, t]) });
  ok(seen.length > 3 && seen.every((x, k) => x[1] === 1000 && (k === 0 || x[0] >= seen[k - 1][0])) && JSON.stringify(seen[seen.length - 1]) === '[1000,1000]',
    'tick: total 1000, done never falls, ends (1000, 1000) (' + seen.length + ' calls)');
  let calls = 0;
  try {
    draw(S.synth({ style: 'sketch', size: 128 }), { tick: () => { if (++calls === 3) { const e = new Error('cancelled'); e.code = 'MV_CANCELLED'; throw e; } } });
    ok(false, 'cancel: draw went on');
  } catch (e) { ok(e.code === 'MV_CANCELLED', 'a throwing tick ends the draw: ' + e.code); }
  // GoH water (checker finding): the GoH 'airborne' class (depthM -0.75, surveys/water.md:95 [V]) sets a drown bit on
  // every water cell; it must not turn shallow no-prone water into drown water
  {
    const base = draw(S.synth({ style: 'sketch', size: 128, target: 'goh' }));
    const gi = S.synth({ style: 'sketch', size: 128, target: 'goh' });
    const wd = gi.layers['water.drown'], wb = gi.layers['water.band'];
    const data = new Uint32Array(wd.data);
    for (let k = 0; k < data.length; k++) if (wb.data[k] === 1 || wb.data[k] === 2) data[k] = (data[k] | 2) >>> 0;
    gi.layers['water.drown'] = Object.assign({}, wd, { data, meta: Object.assign({}, wd.meta, { bits: ['tank_medium', 'airborne'], depthM: [1.2, -0.75] }) });
    const r = draw(gi);
    ok(r.stats.water.noProne > 0, 'goh airborne drown bit on every water cell: no-prone water kept (' + JSON.stringify(r.stats.water) + ')');
    eq(r.stats.water, base.stats.water, 'goh airborne bit: same water counts as without it');
  }
  // the sketch's own grain in strips gives the bytes of paper.grain (checker finding: grain took no tick)
  {
    const P = require(path.join(PAINT, 'paper')), C = require(path.join(PAINT, 'canvas'));
    const fr = { W: 300, H: 170, sx: 3.3, sy: 3.1, x0: -411, y0: 77 };
    const g1 = C.create(fr, C.color('#D9D9D6')), g2 = C.create(fr, C.color('#D9D9D6'));
    P.grain(g1, fr, 0.04, { scale: 24, seed: 5 });
    SK._grainTicked(P, g2, fr, 0.04, { scale: 24, seed: 5 }, () => {});
    eq(sha1(g2), sha1(g1), 'sketch grain = paper.grain bytes');
  }
  // tick gaps on a big picture (contract 4.3: a tick at least every ~100 ms of work). The machine may be busy, so the
  // limit is relative: no gap over max(250 ms, 15 % of the draw)
  {
    const inp = S.synth({ style: 'sketch', size: 2048 });
    const t0 = Date.now(); let last = t0, worst = 0, at = 0, n = 0;
    SK.draw(inp, Object.assign(S.synthOpts(inp), { tick: (d) => { const t = Date.now(); if (t - last > worst) { worst = t - last; at = d; } last = t; n++; } }));
    const total = Date.now() - t0, lim = Math.max(250, 0.15 * total);
    ok(worst <= lim, 'synth 2048: longest gap between ticks ' + worst + ' ms (before done ' + at + '), limit ' + Math.round(lim) + ' ms of ' + total + ' ms, ' + n + ' ticks');
  }
  // crest lines tick and can be cancelled; the tick does not change the lines
  {
    const CR = require('../crest');
    const w = 1400, h = 1400, d = new Uint8Array(w * h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const v = Math.sin(i / 37) * Math.cos(j / 53) + 0.5 * Math.sin((i + j) / 19);
      if (v > 0.9) d[j * w + i] = 1;
    }
    const lf = { w, h, cell: 20, ox: 0, oy: 0, data: d, etype: 'u8', sample: 'cell' };
    const t0 = Date.now(); let last = t0, worst = 0, n = 0, mono = true, prev = -1;
    const withTick = CR.lines(lf, { tick: f => { const t = Date.now(); worst = Math.max(worst, t - last); last = t; n++; if (!(f >= prev - 1e-12 && f <= 1)) mono = false; prev = f; } });
    const total = Date.now() - t0;
    const plain = CR.lines(lf);
    ok(n > 3 && mono, 'crest lines tick ' + n + ' times, frac 0..1 never falls');
    ok(worst <= Math.max(250, 0.15 * total), 'crest lines: longest gap ' + worst + ' ms of ' + total + ' ms');
    eq(JSON.stringify(withTick) === JSON.stringify(plain), true, 'crest lines the same with and without tick (' + plain.length + ' lines)');
    let k = 0;
    try { CR.lines(lf, { tick: () => { if (++k === 2) { const e = new Error('cancelled'); e.code = 'MV_CANCELLED'; throw e; } } }); ok(false, 'crest cancel: went on'); }
    catch (e) { ok(e.code === 'MV_CANCELLED', 'a throwing tick ends crest lines: ' + e.code); }
  }

}

// ---------------------------------------------------------------- planted bad inputs
{
  const base = () => S.synth({ style: 'sketch', size: 128 });
  const rgba = base();
  const h = rgba.layers.height;
  rgba.layers.height = Object.assign({}, h, { etype: 'rgba8', data: new Uint8ClampedArray(h.w * h.h * 4) });
  throwsCode(() => draw(rgba), 'MV_FAULT', 'PAINT_DRAW_BAD', 'planted: height of etype rgba8');
  const noH = base(); delete noH.layers.height;
  throwsCode(() => draw(noH), 'MV_NOT_FOUND', 'PAINT_NO_HEIGHT', 'planted: height absent');
  const fr = base(); fr.frame = Object.assign({}, fr.frame, { W: 12.5 });
  throwsCode(() => draw(fr), 'MV_FAULT', 'PAINT_DRAW_BAD', 'planted: frame width not an integer');
  const short = base(); short.layers.slopecls = Object.assign({}, short.layers.slopecls, { data: new Uint8Array(5) });
  throwsCode(() => draw(short), 'MV_FAULT', 'PAINT_DRAW_BAD', 'planted: slopecls with too few values');
  const pal = base(); pal.pal = pal.palette.styles.staff;
  throwsCode(() => draw(pal), 'MV_FAULT', 'PAINT_DRAW_BAD', 'planted: the staff palette entry');
  const lat = base(); lat.layers.height = Object.assign({}, lat.layers.height, { sample: 'cell' });
  throwsCode(() => draw(lat), 'MV_FAULT', 'PAINT_DRAW_BAD', 'planted: height sampled per cell');
}

// ---------------------------------------------------------------- fixture map, both forms
const golden = path.join(__dirname, 'sketch.golden.json');
const G = fs.existsSync(golden) ? JSON.parse(fs.readFileSync(golden, 'utf8')) : null;
const writeG = process.env.MAPVIZ_GOLDEN === 'write';
const got = { libs: LIBS, note: 'sha1 of the data block of pic.sketch on the fixture map, mode battle_zones, seed 1', as2: {}, goh: {} };
{
  const fx = require(path.join(ROOT, 'test/fxmake'));
  const K = require(path.join(ROOT, 'lib/mapkit'));
  for (const form of ['as2', 'goh']) {
    const f = fx.make(path.join(W, 'fx-' + form), { form });
    const src = K.source({ target: f.target, game: f.gameDir });
    const doc = K.doc(src, f.map, {});
    const grids = K.grids(src, f.map, {});
    const mode = 'battle_zones';
    const i256 = FX.build({ src, doc, grids, mode, size: 256 });
    eq([i256.frame.W, i256.frame.H, i256.frame.sx, Math.round(i256.frame.sy * 1e6) / 1e6], [256, 188, 4.6875, 4.680851], form + ' fixture frame 256');
    const r256 = SK.draw(i256, FX.optsFor(i256));
    ok(r256.grid.w === 256 && r256.grid.h === 188 && r256.grid.ox === -600 && r256.grid.oy === -440, form + ' 256 picture on the frame');
    for (const size of [512, 1500]) {
      const inp = FX.build({ src, doc, grids, mode, size });
      const r = SK.draw(inp, FX.optsFor(inp));
      const st = r.stats;
      eq(r.gaps, [], form + ' ' + size + ': no gap');
      eq(st.treeStamps, size === 512 ? 1 : 3, form + ' ' + size + ': tree stamps (3 trees in one 10 m cluster)');
      eq([st.trees, st.buildings, st.forestStamps], [3, 1, 0], form + ' ' + size + ': trees, buildings, forest stamps');
      eq(st.crests, 1, form + ' ' + size + ': one crest (ridge x = -200) [I]');
      ok(st.crestM >= 30 && st.crestM <= 48, form + ' ' + size + ': crest length 30..48 m: ' + st.crestM);
      ok(st.water.drown > 0 && st.water.swim >= st.water.drown && st.water.noProne > 0, form + ' ' + size + ': pond hatched: ' + JSON.stringify(st.water));
      ok(st.roadPx > 0 && st.hachures > 0, form + ' ' + size + ': roads ' + st.roadPx + ', hachures ' + st.hachures);
      got[form][size] = sha1(r.grid);
      if (form === 'as2' && size === 512) {
        // the same picture when the input names as64 (one install form serves both)
        const as64 = SK.draw(Object.assign({}, inp, { target: 'as64' }), FX.optsFor(inp));
        eq(sha1(as64.grid), got.as2[512], 'fixture as64 = mowas2 bytes');
      }
    }
    // pond centre pixel (192, 51) at 256 is drowning water: hatch colour reached the picture there
    const p = (51 * 256 + 192) * 4, pc = r256.grid.data;
    const paperC = [0xD9, 0xD9, 0xD6];
    ok(Math.abs(pc[p] - paperC[0]) + Math.abs(pc[p + 1] - paperC[1]) + Math.abs(pc[p + 2] - paperC[2]) > 6, form + ' pond centre (192, 51) is not bare paper');
  }
  if (writeG) { fs.writeFileSync(golden, JSON.stringify(got, null, 1) + '\n'); console.log('golden written: ' + LIBS); }
  else if (!G) console.log('skip golden: sketch.golden.json absent (MAPVIZ_GOLDEN=write sets it)');
  else if (G.libs !== LIBS) console.log('skip golden: written with ' + G.libs + ', running with ' + LIBS + ' (MAPVIZ_GOLDEN=write sets it again)');
  else for (const form of ['as2', 'goh']) for (const size of ['512', '1500']) eq(got[form][size], G[form][size], 'golden ' + form + ' ' + size);
  ok(got.as2[512] !== got.goh[512], 'the goh form (cell 5) is its own picture');
}

// ---------------------------------------------------------------- the CLI, when the shared paint CLI is there
{
  const MV = path.join(ROOT, 'mapviz.js');
  if (!fs.existsSync(path.join(PAINT, 'cli.js'))) console.log('skip cli: paint/cli.js not there yet');
  else {
    const fx = require(path.join(ROOT, 'test/fxmake'));
    const f = fx.make(path.join(W, 'fx-cli'), { form: 'as2' });
    const out = path.join(W, 'cli-out');
    const r = spawnSync(process.execPath, [MV, 'paint', 'draw', '--style', 'sketch', '--target', f.target, '--game', f.gameDir, '--map', f.map,
      '--mode', 'battle_zones', '--size', '256', '--out', out, '--json'], { encoding: 'utf8', env: process.env, timeout: 300000 });
    // skip only when the paint command or the style is not built (exit 4 with that reason); exit 2 is a rejected run
    const err = (r.stderr || '') + (r.stdout || '');
    if (r.status === 4 && /PAINT_STYLE_NOT_BUILT|unknown (command|subcommand)|not built/i.test(err)) console.log('skip cli: paint draw not built: ' + err.trim().slice(-200));
    else {
      ok(r.status === 0 || r.status === 1, 'cli paint draw --style sketch: exit ' + r.status + ' ' + (r.stderr || '').trim().slice(-300));
      const sc = path.join(out, 'pic.sketch.json');
      const j = fs.existsSync(sc) ? JSON.parse(fs.readFileSync(sc, 'utf8')) : null;
      ok(j && j.style === 'sketch' && j.styleVersion === 1 && j.w === 256 && j.h === 188, 'cli sidecar: style sketch, version 1, 256 x 188');
      ok(fs.existsSync(path.join(out, 'pic.sketch.mvg')), 'cli wrote pic.sketch.mvg');
    }
  }
}

(async () => {
// through the shared draw: one PAINT_NO_MATERIAL note with the sketch's own wording (the shared draw drops its own note
// of a code the style already gave)
{
  let PI = null;
  try { PI = require(path.join(PAINT, 'index')); } catch (e) { PI = null; }
  if (!PI || typeof PI.draw !== 'function') console.log('skip shared draw notes: paint/index.js draw not there');
  else {
    const inp = S.synth({ style: 'sketch', size: 128, drop: ['material'] });
    const r = await PI.draw(inp, S.synthOpts(inp));
    const nm = r.notes.filter(x => x.code === 'PAINT_NO_MATERIAL');
    ok(nm.length === 1 && /ground type 7/.test(nm[0].text), 'shared draw keeps exactly one PAINT_NO_MATERIAL note, the sketch wording: ' + nm.map(x => x.text).join(' | '));
  }
}
console.log('libs ' + LIBS + ', synth ' + used.synth);
if (fail) { console.log(fail + ' failed, ' + pass + ' passed (scratch ' + W + ')'); console.log('FAIL mapviz sketch: ' + fail + ' checks'); process.exit(1); }
if (OWN) { try { fs.rmSync(W, { recursive: true, force: true }); } catch (e) { /* temp */ } }
console.log('PASS mapviz sketch (' + pass + ')');
})().catch(e => { console.log('FAIL mapviz sketch: ' + (e && e.stack || e)); process.exit(1); });

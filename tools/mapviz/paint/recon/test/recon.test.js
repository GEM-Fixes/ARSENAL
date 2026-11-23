// paint recon test (MV-PNT2 part a): the Recon photo style. Known answers of the tone helpers, the style on the synthetic
// input of paint.md 8.1 (flat base: centre and corner levels; gaps per base rung; thumb; determinism), planted bad inputs
// (no base, base of the wrong etype or size, unknown rung, bad palette, bad frame, a cancelling tick), byte goldens
// (README 9.2), and the fixture map of both forms (README 10): render l0 at 256 px as the base, then recon over it, and
// `paint draw --style recon` when the shared cli is there (paint.md 8.2 rows).
// Uses the shared paint files (canvas, paper, test/synth). MAPVIZ_GOLDEN=set rewrites the goldens.
// usage: node tools/mapviz/paint/recon/test/recon.test.js [scratch dir]
// Author: Imperator_Aug (ARSENAL, ia-ae267620)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto'), { spawnSync } = require('child_process');

const OWN = !process.argv[2];
const W = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'mapviz-recon-')));
fs.mkdirSync(W, { recursive: true });
process.env.ARSENAL_CACHE = path.join(W, 'cache');

const PAINT = path.resolve(__dirname, '../..');
const MV = path.resolve(PAINT, '..');
const MVJS = path.join(MV, 'mapviz.js');
const GOLDEN = path.join(__dirname, 'recon.golden.json');
const SET = process.env.MAPVIZ_GOLDEN === 'set';

let pass = 0, fail = 0;
function ok(c, what) { if (c) pass++; else { fail++; console.log('FAIL mapviz paint recon: ' + what); } }
function throwsCode(fn, code, sub, what) {
  try { fn(); ok(false, what + ': did not throw'); } catch (e) {
    ok(e && e.code === code && (!sub || (e.detail && e.detail.code === sub)), what + ': ' + (e && e.code) + ' ' + (e && e.detail && e.detail.code) + ' ' + (e && e.message));
  }
}
const sha1 = d => crypto.createHash('sha1').update(Buffer.from(d.buffer, d.byteOffset, d.byteLength)).digest('hex');

const SYNTH = require('../../test/synth');
const paperSource = 'shared';
// base of paint.md 8.1 on any frame: r = (2 i) & 255, g = (2 j) & 255, b = 128, a = 255
function synthBase(fr) {
  const g = require('../../canvas').create(fr, [0, 0, 0, 255]);
  g.name = 'pic.l1';
  for (let j = 0; j < fr.H; j++) for (let i = 0; i < fr.W; i++) { const k = (j * fr.W + i) * 4; g.data[k] = (2 * i) & 255; g.data[k + 1] = (2 * j) & 255; g.data[k + 2] = 128; }
  return g;
}

const R = require('../index');
const T = R.tone;
const palette = require(path.join(MV, 'palette.json'));

// ---------------------------------------------------------------- module shape
ok(R.ID === 'recon' && R.VERSION === 1 && Array.isArray(R.NEEDS) && R.NEEDS.length === 0 && Array.isArray(R.WANTS) && typeof R.draw === 'function',
  'module shape ID recon, VERSION 1, NEEDS [], draw');
ok(JSON.stringify(R.FROM) === JSON.stringify(['l4', 'l3', 'l2', 'l1', 'edshot', 'minimap', 'l0']), 'FROM = the base order words of paint.md 4.5');

// ---------------------------------------------------------------- tone helpers, known answers
ok(T.luma(255, 255, 255) === 255 && T.luma(0, 0, 0) === 0 && T.luma(0, 0, 128) === 15 && T.luma(255, 0, 0) === 77, 'luma 255, 0, 15, 77');
{
  const id = T.curveLut([[0, 0], [1, 1]]);
  ok(id.every((v, k) => v === k), 'identity curve table = identity');
  const c = T.curveLut(palette.styles.recon.curve);
  let mono = true; for (let k = 1; k < 256; k++) if (c[k] < c[k - 1]) mono = false;
  ok(c[0] === 0 && c[255] === 255 && c[128] === 128 && c[64] === 46 && mono, 'palette curve table: 0, 46 at 64, 128 at 128, 255, monotone (got ' + [c[0], c[64], c[128], c[255]] + ')');
}
{
  const r = T.rampLut(palette.styles.recon.ramp);
  ok(r[0] === 30 && r[1] === 30 && r[255 * 3] === 230 && r[128 * 3] === 130 && r[128 * 3 + 2] === 130, 'palette ramp: 30, 130 at 128, 230');
}
{
  const F = T.vignetteRow(3, 3, 1, 0.3), C = T.vignetteRow(3, 3, 0, 0.3);
  ok(F[1] === 255 && C[0] === 240 && C[2] === 240, 'vignette 3 x 3: centre 255, corner 240 (got ' + F[1] + ', ' + C[0] + ')');
}
{
  const flat = new Uint8Array(100).fill(100), lf = T.levels(flat, 0.005);
  ok(!lf.stretched && lf.lo === 0 && lf.hi === 255, 'levels of a flat picture: not stretched');
  const ramp = new Uint8Array(1024); for (let k = 0; k < 1024; k++) ramp[k] = k >> 2;
  const lr = T.levels(ramp, 0.005);
  ok(lr.stretched && lr.lo === 1 && lr.hi === 254, 'levels of 0..255 x 4 at 0.5 %: 1, 254 (got ' + lr.lo + ', ' + lr.hi + ')');
  const dot = new Uint8Array(9); dot[4] = 160;
  const b = T.blur3(dot, 3, 3);
  ok(b[4] === 40 && b[0] === 10 && b[1] === 20, 'blur3 of one 160 dot: 40 centre, 20 edge, 10 corner');
}

// ---------------------------------------------------------------- synth input
function flatInput(o) {
  const inp = SYNTH.synth({ style: 'recon', target: o.target || 'mowas2', size: o.size || 128 });
  const g = inp.base.grid;
  for (let k = 0; k < g.data.length; k += 4) { g.data[k] = g.data[k + 1] = g.data[k + 2] = o.v === undefined ? 128 : o.v; g.data[k + 3] = 255; }
  if (o.pal) inp.pal = Object.assign({}, inp.pal, o.pal);
  return inp;
}
function px(grid, i, j) { const k = (j * grid.w + i) * 4; return Array.from(grid.data.slice(k, k + 4)); }
function isGrey(grid) { for (let k = 0; k < grid.data.length; k += 4) if (grid.data[k] !== grid.data[k + 1] || grid.data[k] !== grid.data[k + 2] || grid.data[k + 3] !== 255) return false; return true; }

const inp = SYNTH.synth({ style: 'recon', size: 128 });
ok(inp.frame.W === 128 && inp.frame.H === 96 && inp.frame.sx === 5 && inp.frame.sy === 5, 'synth frame 128 x 96, 5 u');
const opts = SYNTH.synthOpts(inp);
ok(opts.thumb === true, 'synth at 128 px is a thumbnail (long <= 512)');
{
  const r = R.draw(inp, Object.assign({}, opts, { thumb: false }));
  ok(r.grid.name === 'pic.recon' && r.grid.etype === 'rgba8' && r.grid.w === 128 && r.grid.h === 96 && r.grid.data.length === 128 * 96 * 4, 'grid pic.recon rgba8 128 x 96');
  ok(r.grid.cell === 5 && r.grid.ox === -320 && r.grid.oy === -240, 'grid on the frame: cell 5, origin -320, -240');
  ok(isGrey(r.grid), 'picture is grey and alpha 255 everywhere');
  ok(Array.isArray(r.gaps) && r.gaps.length === 0 && r.approx === false && Array.isArray(r.notes), 'base l1, approx false: no gaps, approx false');
  ok(r.stats.from === 'l1' && r.stats.blur === true && r.stats.stretched === true && r.stats.transparent === 0 && r.stats.grain === palette.styles.recon.grain, 'stats: from l1, blur, stretched, grain ' + r.stats.grain);
  const r2 = R.draw(SYNTH.synth({ style: 'recon', size: 128 }), Object.assign({}, opts, { thumb: false }));
  ok(sha1(r.grid.data) === sha1(r2.grid.data), 'same input and opts: same bytes');
  const r3 = R.draw(SYNTH.synth({ style: 'recon', size: 128 }), Object.assign({}, opts, { thumb: false, seed: 7 }));
  ok(sha1(r.grid.data) !== sha1(r3.grid.data) && r3.grid.meta.seed === 7, 'another seed: other grain');
  ok(r.grid.meta.style === 'recon' && r.grid.meta.styleVersion === 1 && r.grid.meta.seed === 1 && r.grid.meta.cellY === undefined, 'grid meta {style, styleVersion, seed}, no cellY on a square frame');
}
{ // flat grey, grain 0: centre 130 (curve keeps 128, ramp 30..230), corner 92 (vignette 0.3)
  const r = R.draw(flatInput({ pal: { grain: 0 } }), Object.assign({}, opts, { thumb: false }));
  ok(!r.stats.stretched && px(r.grid, 64, 48)[0] === 130 && px(r.grid, 0, 0)[0] === 92 && px(r.grid, 127, 95)[0] === 92,
    'flat 128 base, no grain: centre 130, corners 92, unstretched (got ' + px(r.grid, 64, 48)[0] + ', ' + px(r.grid, 0, 0)[0] + ')');
  const v0 = R.draw(flatInput({ pal: { grain: 0, vignette: 0 } }), Object.assign({}, opts, { thumb: false }));
  ok(v0.grid.data.every((v, k) => (k & 3) === 3 ? v === 255 : v === 130), 'flat 128 base, no grain, no vignette: every pixel 130');
}
{ // transparency: one pixel alpha 0 counts and prints dark
  const i0 = flatInput({ pal: { grain: 0, vignette: 0 } });
  i0.base.grid.data[(10 * 128 + 10) * 4 + 3] = 0;
  const r = R.draw(i0, Object.assign({}, opts, { thumb: true }));
  ok(r.stats.transparent === 1 && px(r.grid, 10, 10)[3] === 255 && px(r.grid, 10, 10)[0] === 30, 'one transparent base pixel: counted, printed as the ramp foot (30), alpha 255');
}
{ // gaps per rung
  const g = (from, approx) => { const i = SYNTH.synth({ style: 'recon', size: 64 }); i.base = { from, grid: SYNTH.synth({ style: 'recon', size: 64 }).base.grid, approx, sidecar: null }; const r = R.draw(i, SYNTH.synthOpts(i)); return r.gaps.join() + '|' + r.approx; };
  ok(g('l0', true) === 'PAINT_BASE_SCHEMATIC,PAINT_BASE_APPROX|true', 'l0 base: PAINT_BASE_SCHEMATIC (+ APPROX when the l0 sidecar says approx), approx true: ' + g('l0', true));
  ok(g('l0', false) === 'PAINT_BASE_SCHEMATIC|true', 'l0 base not approx: PAINT_BASE_SCHEMATIC, approx true');
  ok(g('minimap', true) === 'PAINT_BASE_MINIMAP|true', 'minimap base: PAINT_BASE_MINIMAP only, approx true');
  ok(g('l1', true) === 'PAINT_BASE_APPROX|true', 'approx l1 base: PAINT_BASE_APPROX');
  ok(g('l4', false) === '|false' && g('edshot', false) === '|false', 'l4 and edshot not approx: no gap');
}
{ // thumb: no blur, half grain, 2 % clip
  const r = R.draw(inp, opts);
  ok(r.stats.thumb === true && r.stats.blur === false && r.stats.grain === palette.styles.recon.grain / 2, 'thumb: no blur, half grain');
}
{ // every game gives the same bytes (no game branch in the style)
  const h = t => sha1(R.draw(SYNTH.synth({ style: 'recon', target: t, size: 128 }), opts).grid.data);
  ok(h('as64') === h('mowas2') && h('goh') === h('mowas2'), 'as64, mowas2 and goh synth inputs give the same picture');
}
{ // tick: called with (total, total) last; a cancelling tick stops the draw
  const seen = [];
  R.draw(inp, Object.assign({}, opts, { tick: (d, t) => seen.push([d, t]) }));
  const last = seen[seen.length - 1];
  ok(seen.length >= 2 && last[0] === last[1] && seen.every(s => s[0] <= s[1]), 'tick called, ends at (total, total)');
  const MvError = require(MVJS).MvError;
  throwsCode(() => R.draw(inp, Object.assign({}, opts, { tick: () => { throw new MvError('MV_CANCELLED', 'cancel'); } })), 'MV_CANCELLED', null, 'cancelling tick');
  // cadence (paint.md 4.3: tick at least every ~100 ms): every stage ticks at least once per 32 rows, grain included
  const big = SYNTH.synth({ style: 'recon', size: 640 }), bo = Object.assign({}, SYNTH.synthOpts(big), { thumb: false });
  const H = big.frame.H, seenB = [];
  R.draw(big, Object.assign({}, bo, { tick: (d, t) => seenB.push([d, t]) }));
  let maxGap = 0; for (let k = 0; k < seenB.length; k++) maxGap = Math.max(maxGap, seenB[k][0] - (k ? seenB[k - 1][0] : 0));
  const lastB = seenB[seenB.length - 1];
  ok(lastB[1] === 3 * H + 1 && lastB[0] === lastB[1] && maxGap <= 32 && seenB.some(s => s[0] > 2 * H && s[0] <= 3 * H),
    'tick budget 3 H + 1 with grain, at most 32 rows between ticks, ticks inside the grain rows (total ' + lastB[1] + ', H ' + H + ', max gap ' + maxGap + ')');
  const seen0 = [];
  const b0 = SYNTH.synth({ style: 'recon', size: 640 }); b0.pal = Object.assign({}, b0.pal, { grain: 0 });
  R.draw(b0, Object.assign({}, bo, { tick: (d, t) => seen0.push([d, t]) }));
  ok(seen0[seen0.length - 1][1] === 2 * H + 1, 'tick budget 2 H + 1 with no grain');
  // cancel inside the grain stage, and on its last row band
  const cancelAt = test => () => R.draw(SYNTH.synth({ style: 'recon', size: 640 }), Object.assign({}, bo, { tick: (d, t) => { if (test(d, t)) throw new MvError('MV_CANCELLED', 'cancel'); } }));
  throwsCode(cancelAt(d => d > 2 * H && d < 3 * H + 1), 'MV_CANCELLED', null, 'cancel during the grain rows');
  throwsCode(cancelAt(d => d > 3 * H - 32 && d < 3 * H + 1), 'MV_CANCELLED', null, 'cancel on the last grain row band');
}
{ // no-ground pixels (base alpha 0) are left out of the level histogram
  const T0 = (() => { const L = new Uint8Array(1000), m = new Uint8Array(1000); for (let k = 0; k < 1000; k++) { L[k] = k < 50 ? 0 : 100 + (k % 100); m[k] = k < 50 ? 0 : 1; } return { L, m }; })();
  const lAll = T.levels(T0.L, 0.005), lMask = T.levels(T0.L, 0.005, T0.m), lNone = T.levels(T0.L, 0.005, new Uint8Array(1000));
  ok(lAll.lo === 0 && lMask.lo === 100 && lMask.hi === 199 && lNone.lo === 0, 'levels with a ground mask: 100..199, without 0.. (got ' + [lMask.lo, lMask.hi, lAll.lo] + ')');
  const grad = strip => {
    const i = SYNTH.synth({ style: 'recon', size: 640 }), g = i.base.grid, Wd = g.w, Hd = g.h, sh = Math.ceil(0.05 * Hd);
    for (let j = 0; j < Hd; j++) for (let x = 0; x < Wd; x++) {
      const k = (j * Wd + x) * 4, v = 40 + ((x * 160 / Wd) | 0);
      g.data[k] = g.data[k + 1] = g.data[k + 2] = v; g.data[k + 3] = strip && j < sh ? 0 : 255;
    }
    i.pal = Object.assign({}, i.pal, { grain: 0 });
    return { i, n: strip ? sh * Wd : 0 };
  };
  const A = grad(false), B = grad(true);
  const ra = R.draw(A.i, Object.assign({}, opts, { thumb: true })), rb = R.draw(B.i, Object.assign({}, opts, { thumb: true }));
  ok(rb.stats.empty === B.n && rb.stats.levels.join() === ra.stats.levels.join() && ra.stats.levels[0] > 0,
    'gradient + 5 % alpha-0 strip: same levels as the gradient alone (' + rb.stats.levels + ' vs ' + ra.stats.levels + ', empty ' + rb.stats.empty + ')');
  const rf = R.draw(grad(true).i, Object.assign({}, opts, { thumb: false }));
  ok(rf.stats.levels[0] > 0 && rf.stats.stretched, 'full pass over the strip: lo > 0 (' + rf.stats.levels + ')');
}
{ // stretched frame: cellY on the grid meta
  const i = SYNTH.synth({ style: 'recon', size: 128 });
  const fr = Object.assign({}, i.frame, { W: 100, H: 100, sx: 6.4, sy: 4.8, long: 100 });
  i.frame = fr;
  i.base = { from: 'l1', grid: synthBase(fr), approx: false, sidecar: null };
  const r = R.draw(i, opts);
  ok(r.grid.w === 100 && r.grid.h === 100 && r.grid.meta.cellY === 4.8, 'stretched 100 x 100 frame: meta cellY 4.8');
}

// ---------------------------------------------------------------- planted bad inputs
{
  const bad = mut => { const i = SYNTH.synth({ style: 'recon', size: 64 }); mut(i); return () => R.draw(i, SYNTH.synthOpts(i)); };
  throwsCode(bad(i => { i.base = null; }), 'MV_NOT_FOUND', 'PAINT_NO_BASE', 'no base');
  throwsCode(bad(i => { i.base.grid = Object.assign({}, i.base.grid, { etype: 'i16', data: new Int16Array(i.base.grid.w * i.base.grid.h) }); }), 'MV_FAULT', 'PAINT_DRAW_BAD', 'base of etype i16');
  throwsCode(bad(i => { i.base.grid = Object.assign({}, i.base.grid, { w: i.base.grid.w - 1 }); }), 'MV_FAULT', 'PAINT_DRAW_BAD', 'base one pixel narrower than the frame');
  throwsCode(bad(i => { i.base.from = 'photo'; }), 'MV_FAULT', 'PAINT_DRAW_BAD', 'unknown base rung');
  throwsCode(bad(i => { i.pal = Object.assign({}, i.pal, { curve: [[0, 0]] }); }), 'MV_FAULT', 'PAINT_DRAW_BAD', 'curve of one point');
  throwsCode(bad(i => { i.pal = Object.assign({}, i.pal, { curve: [[0, 0], [0.5, 0.2], [0.4, 0.9], [1, 1]] }); }), 'MV_FAULT', 'PAINT_DRAW_BAD', 'curve x falling');
  throwsCode(bad(i => { i.pal = Object.assign({}, i.pal, { ramp: [{ at: 0, color: 'grey' }, { at: 1, color: '#FFFFFF' }] }); }), 'MV_FAULT', 'PAINT_DRAW_BAD', 'ramp colour not #RRGGBB');
  throwsCode(bad(i => { i.pal = Object.assign({}, i.pal, { grain: 3 }); }), 'MV_FAULT', 'PAINT_DRAW_BAD', 'grain 3');
  throwsCode(bad(i => { i.frame = Object.assign({}, i.frame, { W: 0 }); }), 'MV_FAULT', 'PAINT_DRAW_BAD', 'frame W 0');
}

// ---------------------------------------------------------------- goldens (README 9.2)
const gold = fs.existsSync(GOLDEN) ? JSON.parse(fs.readFileSync(GOLDEN, 'utf8')) : { v: 1 };
function golden(key, data, source) {
  const h = sha1(data);
  if (SET) { gold[key] = source ? { source, sha1: h } : { sha1: h }; console.log('golden set ' + key + ' ' + h); pass++; return; }
  const g = gold[key];
  if (!g) { ok(false, 'golden ' + key + ' missing (run with MAPVIZ_GOLDEN=set): ' + h); return; }
  if (source && g.source !== source) { console.log('golden ' + key + ': stored for paper ' + g.source + ', running with ' + source + ' (' + h + '); not compared, reset with MAPVIZ_GOLDEN=set'); return; }
  ok(g.sha1 === h, 'golden ' + key + ': ' + h + ' != ' + g.sha1);
}
function synthAt(size, palOver) {
  const i = SYNTH.synth({ style: 'recon', size });
  if (palOver) i.pal = Object.assign({}, i.pal, palOver);
  return i;
}
{
  const t128 = R.draw(synthAt(128, { grain: 0 }), Object.assign({}, opts, { thumb: false }));
  golden('tone.synth128', t128.grid.data);
  const i256 = synthAt(256, { grain: 0 });
  const t256 = R.draw(i256, SYNTH.synthOpts(i256));
  golden('tone.synth256.thumb', t256.grid.data);
  const f256 = R.draw(synthAt(256), SYNTH.synthOpts(synthAt(256)));
  golden('full.synth256.thumb', f256.grid.data, paperSource);
  const f640 = R.draw(synthAt(640), SYNTH.synthOpts(synthAt(640)));
  ok(f640.stats.thumb === false && f640.stats.blur === true, 'synth at 640 px: full pass');
  ok(f640.stats.grainScale === 8 && f256.stats.grainScale === 8 && t128.stats.grainScale === 15, 'grain lattice: 8 u at 1 and 2.5 u pixels, 3 px (15 u) at 5 u pixels');
  golden('full.synth640', f640.grid.data, paperSource);
}

// ---------------------------------------------------------------- fixture map (README 10), both forms
function cli(args) {
  const r = spawnSync(process.execPath, [MVJS].concat(args), { encoding: 'utf8', env: Object.assign({}, process.env), timeout: 300000 });
  return { code: r.status, out: r.stdout || '', err: (r.stderr || '').trim() };
}
const fx = require(path.join(MV, 'test', 'fxmake'));
const gridfile = require(path.join(MV, 'lib', 'raster', 'gridfile'));
const fxHash = {};
for (const form of ['as2', 'goh']) {
  const f = fx.make(path.join(W, 'fx-' + form), { form });
  const common = ['--target', f.target, '--game', f.gameDir, '--mod-dir', f.modDirs[0], '--map', f.map];
  const out = path.join(W, 'l0-' + form);
  const c = cli(['render', 'l0'].concat(common, ['--size', '256', '--mode', 'battle_zones', '--out', out]));
  const mvg = path.join(out, 'pic.l0.mvg');
  ok((c.code === 0 || c.code === 1) && fs.existsSync(mvg), 'fixture ' + form + ': render l0 at 256 px (exit ' + c.code + ' ' + c.err.slice(-200) + ')');
  if (!fs.existsSync(mvg)) continue;
  const pic = gridfile.read(mvg);
  const sc = JSON.parse(fs.readFileSync(path.join(out, 'pic.l0.json'), 'utf8'));
  const cy = (pic.meta && pic.meta.cellY) || pic.cell;
  const frame = { box: [pic.ox, pic.oy, pic.ox + pic.w * pic.cell, pic.oy + pic.h * cy], W: pic.w, H: pic.h, sx: pic.cell, sy: cy, x0: pic.ox, y0: pic.oy, long: Math.max(pic.w, pic.h) };
  frame.stretch = [frame.sx / frame.sy];
  ok(frame.W === 256 && frame.H === 188 && frame.sx === 4.6875 && Math.abs(frame.sy - 880 / 188) < 1e-9 && frame.x0 === -600 && frame.y0 === -440,
    'fixture ' + form + ' frame 256 x 188, sx 4.6875, sy 4.680851 (got ' + frame.W + ' x ' + frame.H + ', ' + frame.sx + ', ' + frame.sy + ')');
  const input = { v: 1, style: 'recon', target: f.target, map: f.map, mode: 'battle_zones', doc: null, W: null, frame, layers: {}, vectors: {},
    base: { from: 'l0', grid: pic, approx: !!sc.approx, sidecar: sc }, palette, pal: palette.styles.recon, seed: 1 };
  const o = { thumb: true, minStroke: 2, maxSymbols: 5, contours: false, seed: 1, tick: () => {}, pool: 0, workDir: null };
  const r = R.draw(input, o);
  ok(r.gaps[0] === 'PAINT_BASE_SCHEMATIC' && r.approx === true && isGrey(r.grid) && r.grid.w === 256 && r.grid.h === 188,
    'fixture ' + form + ' recon over l0: PAINT_BASE_SCHEMATIC, approx, grey 256 x 188 (gaps ' + r.gaps + ')');
  ok(r.stats.stretched && r.stats.levels[1] - r.stats.levels[0] >= 16 && r.stats.meanOut > 30 && r.stats.meanOut < 225,
    'fixture ' + form + ' levels ' + r.stats.levels + ', mean ' + r.stats.meanOut);
  ok(Math.abs(r.grid.meta.cellY - 880 / 188) < 1e-9, 'fixture ' + form + ' grid meta cellY = sy');
  fxHash[form] = { base: sha1(pic.data), recon: sha1(r.grid.data) };

  // shared cli rows of paint.md 8.2, when the shared cli is there
  if (!fs.existsSync(path.join(PAINT, 'cli.js')) || !fs.existsSync(path.join(PAINT, 'index.js'))) { console.log('skip fixture ' + form + ' paint draw: tools/mapviz/paint/cli.js not there yet'); continue; }
  const pd = path.join(W, 'pd-' + form);
  const d = cli(['paint', 'draw', '--style', 'recon'].concat(common, ['--mode', 'battle_zones', '--size', '256', '--out', pd, '--json']));
  const psc = fs.existsSync(path.join(pd, 'pic.recon.json')) ? JSON.parse(fs.readFileSync(path.join(pd, 'pic.recon.json'), 'utf8')) : null;
  ok(d.code === 1 && psc && psc.base && psc.base.from === 'l0' && psc.gaps.indexOf('PAINT_BASE_SCHEMATIC') >= 0,
    'fixture ' + form + ' paint draw --style recon, no --in: exit 1, base l0, PAINT_BASE_SCHEMATIC (exit ' + d.code + ' ' + d.err.slice(-200) + ')');
  if (form === 'goh') {
    const m = cli(['paint', 'draw', '--style', 'recon', '--base', 'minimap'].concat(common, ['--size', '256', '--out', path.join(W, 'pd-goh-mm'), '--json']));
    ok(m.code === 2 && /PAINT_BASE_GOH_MINIMAP/.test(m.err + m.out), 'fixture goh --base minimap: exit 2 PAINT_BASE_GOH_MINIMAP (exit ' + m.code + ')');
  }
}
if (fxHash.as2 && fxHash.goh) {
  ok((fxHash.as2.base === fxHash.goh.base) === (fxHash.as2.recon === fxHash.goh.recon), 'fixture forms: recon bytes equal exactly when the l0 bases are equal (base equal ' + (fxHash.as2.base === fxHash.goh.base) + ')');
}

if (SET) { fs.writeFileSync(GOLDEN, JSON.stringify(gold, null, 1) + '\n'); console.log('goldens written: ' + path.basename(GOLDEN)); }
if (fail) { console.log(fail + ' failed, ' + pass + ' passed (scratch ' + W + ')'); console.log('FAIL mapviz paint recon: ' + fail + ' checks'); process.exit(1); }
if (OWN) { try { fs.rmSync(W, { recursive: true, force: true }); } catch (e) { /* temp */ } }
console.log('PASS mapviz paint recon (' + pass + ')');

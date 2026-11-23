// paint/painted test (MV-PNT2 part b): the Painted relief style on the synthetic input (paint contract draft 8.1) and on
// the fixture map in both forms (MoW:AS2 / AS64 form and GoH form, README 10), the Kuwahara kernel in process, through a
// test pool and through a real jobs pool, the absent-want rules, and planted bad inputs.
// Uses the shared paint files (canvas.js, paper.js, input.js, test/synth.js, index.js gather and the paint cli).
// Goldens (painted.golden.json, README 9.2 byte hash): synth at 128 and the fixture (MoW:AS2 form) at 256; a missing
// golden file is written by the run (delete it to set new goldens after a deliberate change, with a VERSION bump).
//   MAPVIZ_NO_POOL=1 skips the real pool run (two child processes).
// usage: node tools/mapviz/paint/painted/test/painted.test.js [scratch dir]
// Author: Imperator_Aug (ARSENAL, ia-58789444)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');

const OWN = !process.argv[2];
const SCR = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'mapviz-painted-')));
fs.mkdirSync(SCR, { recursive: true });
{
  const c = process.env.ARSENAL_CACHE;
  process.env.ARSENAL_CACHE = c && path.resolve(c).startsWith(SCR + path.sep) ? c : path.join(SCR, 'cache');
}

let pass = 0, fail = 0;
function ok(c, what) { if (c) pass++; else { fail++; console.log('FAIL mapviz paint/painted: ' + what); } }
async function throwsCode(fn, code, what) {
  try { await fn(); ok(false, what + ': no throw'); } catch (e) { ok(e && e.code === code, what + ': ' + code + ', got ' + (e && (e.code || e.message))); }
}
const sha1 = b => crypto.createHash('sha1').update(Buffer.from(b.buffer, b.byteOffset, b.byteLength)).digest('hex');

const MV = path.join(__dirname, '../../..');
const S = require('../../test/synth');

// light at load: requiring the style loads no other module
const before = new Set(Object.keys(require.cache));
const P = require('../index');
const added = Object.keys(require.cache).filter(k => !before.has(k));
ok(added.length === 1 && /index\.js$/.test(added[0]), 'index.js is light at load (loaded ' + added.map(k => path.basename(k)).join(', ') + ')');
const K = require('../kuwahara');

async function main() {
  // ---- module shape (draft 4.3)
  ok(P.ID === 'painted' && Number.isInteger(P.VERSION) && P.VERSION === 1, 'ID painted, VERSION 1');
  ok(JSON.stringify(P.NEEDS) === '["height"]', 'NEEDS height');
  ok(JSON.stringify(P.WANTS) === '["shade","material","gtype","water.band","water.drown","objects"]', 'WANTS as draft 4.4');
  ok(typeof P.draw === 'function' && P.KERNEL === 'paint/painted/kuwahara', 'draw and kernel name');
  ok(!/require\(\s*['"]\.{1,2}\//.test(fs.readFileSync(path.join(__dirname, '../kuwahara.js'), 'utf8')), 'kuwahara.js holds no relative require (README 1.5)');

  // ---- radius and posterise (draft 10.8)
  ok([[2048, 8], [1024, 4], [512, 2], [128, 2], [4096, 16], [3000, 12]].every(([l, r]) => P.radiusFor(l) === r), 'radius = max(2, round(8 long / 2048))');
  ok(P.posterize(0, 6) === 0 && P.posterize(255, 6) === 255 && P.posterize(128, 6) === 153 && P.posterize(20, 6) === 0 && P.posterize(30, 6) === 51, 'posterise 6 levels');
  ok(P.radiusFor(16639) === 64 && P.radiusFor(20000) === 64, 'radius capped at the kernel limit 64');
  {
    // luminance posterise keeps the hue: no channel clamps, channel ratios hold (relief.light #FFF8E8: L 248 -> 255)
    const LUT = new Uint8Array(256); for (let v = 0; v < 256; v++) LUT[v] = P.posterize(v, 6);
    const d = new Uint8ClampedArray(4);
    let worst = 0, over = 0;
    for (const c of [[255, 248, 232], [250, 200, 40], [40, 250, 250], [255, 0, 0], [200, 180, 120], [10, 20, 30], [129, 129, 129]]) {
      P.lumStep(d, 0, c[0], c[1], c[2], LUT);
      const mx = Math.max(...c);
      const L = (77 * c[0] + 150 * c[1] + 29 * c[2] + 128) >> 8;
      const f = Math.min(LUT[L] / L, 255 / mx);
      if (c.some(v => v * LUT[L] / L > 255.5)) over++;
      for (let k = 0; k < 3; k++) worst = Math.max(worst, Math.abs(d[k] - c[k] * f));
      ok(d[3] === 255 && [0, 1, 2].every(k => c[k] * f <= 255.5), 'lumStep ' + c + ' -> ' + Array.from(d.slice(0, 3)) + ': no channel past 255 before the clamp');
    }
    ok(over >= 2 && worst <= 0.5, 'lumStep: bright colours that would clamp keep their channel ratios (' + over + ' would clamp, worst rounding ' + worst.toFixed(2) + ')');
    P.lumStep(d, 0, 255, 248, 232, LUT);
    ok(Math.abs(d[0] / d[2] - 255 / 232) < 0.01, 'relief.light #FFF8E8 keeps r : b (' + Array.from(d.slice(0, 3)) + ')');
  }

  // ---- kernel: sectors and filter
  for (const r of [2, 8]) {
    const sec = K.sectors(r, 8);
    let disc = 0;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r) disc++;
    const seen = new Map();
    for (const l of sec) for (const [dx, dy] of l.slice(1)) seen.set(dx + ',' + dy, (seen.get(dx + ',' + dy) || 0) + 1);
    const border = (k) => { const [dx, dy] = k.split(',').map(Number); return dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy); };
    const once = [...seen].every(([k, c]) => c === (border(k) ? 2 : 1));
    ok(sec.length === 8 && seen.size + 1 === disc && once && sec.every(l => l[0][0] === 0 && l[0][1] === 0) && sec.every(l => l.length === sec[0].length),
      'r ' + r + ': 8 equal sectors cover the disc, border offsets in two (' + sec.map(l => l.length).join(',') + ', disc ' + disc + ')');
  }
  {
    const W = 16, H = 8, src = new Uint8ClampedArray(W * H * 4);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) src.set(i < 8 ? [0, 0, 0, 255] : [200, 100, 50, 255], (j * W + i) * 4);
    const out = K.filter(src, W, H, 2, 8, 0, H);
    const px = (i, j) => Array.from(out.slice((j * W + i) * 4, (j * W + i) * 4 + 4)).join(',');
    ok(px(7, 4) === '0,0,0,255' && px(8, 4) === '200,100,50,255' && px(0, 0) === '0,0,0,255' && px(15, 7) === '200,100,50,255', 'Kuwahara keeps a step edge sharp (' + px(7, 4) + ' | ' + px(8, 4) + ')');
    const part = K.filter(src, W, H, 2, 8, 3, 6);
    ok(Buffer.compare(Buffer.from(part), Buffer.from(out.slice(3 * W * 4, 6 * W * 4))) === 0, 'a band of rows = the same rows of the whole picture');
    let t = 0; K.filter(src, W, H, 2, 8, 0, H, n => { t = n; });
    ok(t === H, 'filter ticks once per row');
    // planted: wrong size, bad radius, bad rows
    let e1 = null; try { K.filter(src.slice(4), W, H, 2, 8, 0, H); } catch (e) { e1 = e; }
    ok(e1 && /not W x H/.test(e1.message), 'planted: a picture of the wrong size is refused');
    let e2 = null; try { K.filter(src, W, H, 0, 8, 0, H); } catch (e) { e2 = e; }
    ok(e2 && /radius/.test(e2.message), 'planted: radius 0 is refused');
    let e3 = null; try { K.filter(src, W, H, 2, 8, 4, 99); } catch (e) { e3 = e; }
    ok(e3 && /rows/.test(e3.message), 'planted: rows past the picture are refused');
    // kernel run(task, io) with an in-memory io
    const mem = new Map([['pre.mvg', { name: 'p', w: W, h: H, cell: 5, ox: 0, oy: 0, etype: 'rgba8', sample: 'cell', scale: 1, offset: 0, nodata: null, meta: {}, data: src }]]);
    const io = { readGrid: f => mem.get(f), writeGrid: (f, g) => mem.set(f, g), progress: { check() {} } };
    const code = K.run({ v: 1, kernel: P.KERNEL, inputs: ['pre.mvg'], args: { W, H, r: 2, n: 8, j0: 2, j1: 5, input: 'pre.mvg', outName: 'b.mvg' }, out: '' }, io);
    const b = mem.get('b.mvg');
    ok(code === 0 && b && b.h === 3 && b.oy === 10 && Buffer.compare(Buffer.from(b.data), Buffer.from(out.slice(2 * W * 4, 5 * W * 4))) === 0, 'kernel run writes rows 2..4 with oy moved');
    let e4 = null; try { K.run({ args: { W: 99, H, r: 2, n: 8, j0: 0, j1: 1, input: 'pre.mvg', outName: 'c.mvg' } }, io); } catch (e) { e4 = e; }
    ok(e4 && /not an rgba8 picture/.test(e4.message), 'planted: a task whose W does not match the picture is refused');
  }

  // ---- synth at 128
  const inp = S.synth({ style: 'painted', target: 'mowas2', size: 128 });
  ok(inp.frame.W === 128 && inp.frame.H === 96 && inp.frame.sx === 5 && inp.frame.sy === 5, 'synth frame 128 x 96, 5 u');
  const opts = S.synthOpts(inp);
  const ticks = [];
  opts.tick = (d, t) => ticks.push([d, t]);
  const r1 = await P.draw(inp, opts);
  const g = r1.grid;
  ok(g && g.name === 'pic.painted' && g.etype === 'rgba8' && g.w === 128 && g.h === 96 && g.data.length === 128 * 96 * 4 && g.cell === 5 && g.ox === -320 && g.oy === -240, 'grid on the frame, named pic.painted');
  let a255 = true; for (let k = 3; k < g.data.length; k += 4) if (g.data[k] !== 255) { a255 = false; break; }
  ok(a255, 'alpha 255 everywhere');
  ok(JSON.stringify(r1.gaps) === '[]' && r1.approx === false && r1.notes.length === 0, 'all wants present: no gap, no note (' + JSON.stringify(r1.gaps) + JSON.stringify(r1.notes) + ')');
  const st = r1.stats;
  ok(st.kuwaharaR === 2 && st.sectors === 8 && st.levels === 6 && st.grain === 0.06, 'stats: radius 2, 8 sectors, 6 levels, grain 0.06');
  ok(st.offGroundPx === 16, 'offGroundPx 16 (columns 126..127, rows 88..95), got ' + st.offGroundPx);
  ok(st.buildings === 1 && st.buildingPx >= 700 && st.buildingPx <= 800, 'one building of 32 x 24 px (' + st.buildingPx + ')');
  ok(st.waterPx > 100 && st.roadPx > 200 && st.woodPx > 30 && st.outlinePx === 0, 'water ' + st.waterPx + ', road ' + st.roadPx + ', wood ' + st.woodPx + ' px; no outline on a thumbnail');
  ok(ticks.length >= 3 && ticks.every((x, i) => i === 0 || x[0] >= ticks[i - 1][0]) && ticks[ticks.length - 1][0] === ticks[ticks.length - 1][1], 'tick never falls and ends at (total, total)');
  {
    // tick density (draft 4.3, at least every ~100 ms): every stage ticks per block of 16 rows, the Kuwahara every row
    const H0 = inp.frame.H, T = 3 * H0;
    const inStage = (lo, hi) => ticks.filter(x => x[0] > lo && x[0] <= hi && x[1] === T).length;
    const blocks = Math.floor(H0 / 16);
    ok(inStage(0, H0) >= 3 * blocks, 'prepare ticks per 16 rows in each of its 3 loops (' + inStage(0, H0) + ' >= ' + 3 * blocks + ')');
    ok(inStage(H0, 2 * H0) >= H0, 'Kuwahara ticks every row (' + inStage(H0, 2 * H0) + ')');
    ok(inStage(2 * H0, T - 1) >= blocks, 'finish ticks per 16 rows (' + inStage(2 * H0, T - 1) + ')');
    // the largest step between two ticks, in rows of work: 16 rows of one loop at most
    let gap = 0; for (let i = 1; i < ticks.length; i++) gap = Math.max(gap, ticks[i][0] - ticks[i - 1][0]);
    ok(gap <= Math.ceil(H0 / 2), 'no tick step larger than half a stage (' + gap + ')');
  }
  {
    // a cancel in the middle of prepare (the relief loop) is seen there, not after it
    const ci = S.synth({ style: 'painted', size: 128 }), co = S.synthOpts(ci);
    const M = require(path.join(MV, 'mapviz'));
    let last = 0;
    co.tick = (d) => { last = d; if (d >= Math.floor(ci.frame.H / 2)) throw new M.MvError('MV_CANCELLED', 'cancel'); };
    await throwsCode(() => P.draw(ci, co), 'MV_CANCELLED', 'cancel inside prepare');
    ok(last < ci.frame.H, 'cancel inside prepare is seen before the Kuwahara (tick at ' + last + ')');
  }
  // planted palette numbers (ruling R-d: a bad input from code is MV_FAULT PAINT_DRAW_BAD)
  for (const [key, v] of [['kuwahara', 40], ['kuwahara', 1], ['kuwahara', 2.5], ['posterize', 300], ['posterize', 1], ['posterize', 'six']]) {
    const bp = S.synth({ style: 'painted', size: 128 }); bp.pal = JSON.parse(JSON.stringify(bp.pal)); bp.pal[key] = v;
    let err = null; try { await P.draw(bp, S.synthOpts(bp)); } catch (e) { err = e; }
    ok(err && err.code === 'MV_FAULT' && err.detail && err.detail.code === 'PAINT_DRAW_BAD' && err.detail.key === 'styles.painted.' + key,
      'planted: palette ' + key + ' ' + JSON.stringify(v) + ' gives MV_FAULT PAINT_DRAW_BAD (got ' + (err && (err.code + ' ' + JSON.stringify(err.detail) + ' ' + err.message)) + ')');
  }
  // the shared helpers tick inside (input.js o.tick): a cancel during the masks is seen before prepare's first loop ends
  {
    const ci = S.synth({ style: 'painted', size: 512 }), co = S.synthOpts(ci);
    const M = require(path.join(MV, 'mapviz'));
    let n = 0, seen = 0;
    co.tick = (d) => { n++; if (d === 0 && n > 6) { seen = n; throw new M.MvError('MV_CANCELLED', 'cancel'); } };
    await throwsCode(() => P.draw(ci, co), 'MV_CANCELLED', 'cancel inside a shared helper');
    ok(seen > 6, 'helper ticks reach the style tick at done 0 (more than the 6 calls between helpers): ' + seen);
  }
  const px = (gr, i, j) => Array.from(gr.data.slice((j * gr.w + i) * 4, (j * gr.w + i) * 4 + 3));
  const hx = s => { const n = parseInt(s.slice(1, 7), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const near = (a, b, d) => a.every((v, k) => Math.abs(v - b[k]) <= d);
  const pal = inp.pal.landCover;
  const water = px(g, 96, 28), house = px(g, 24, 18), wood = px(g, 14, 78);
  ok(water[2] > water[0] + 30, 'drown pixel (96, 28) is blue (' + water + ')');
  ok(near(house, hx(pal.building), 40), 'building centre (24, 18) near landCover.building (' + house + ')');
  ok(wood[1] > wood[0] && wood[1] > wood[2], 'wood pixel (14, 78) is green (' + wood + ')');

  // determinism, seed, games
  const r2 = await P.draw(S.synth({ style: 'painted', target: 'mowas2', size: 128 }), S.synthOpts(inp));
  ok(sha1(r2.grid.data) === sha1(g.data), 'same input, same bytes');
  const o3 = S.synthOpts(inp); o3.seed = 2;
  const r3 = await P.draw(inp, o3);
  ok(sha1(r3.grid.data) !== sha1(g.data), 'another seed changes the grain');
  for (const t of ['as64', 'goh']) {
    const rt = await P.draw(S.synth({ style: 'painted', target: t, size: 128 }), S.synthOpts(inp));
    ok(sha1(rt.grid.data) === sha1(g.data) && JSON.stringify(rt.stats) === JSON.stringify(st), t + ' gives the same picture as mowas2 (no game branch in the style)');
  }

  // absent wants (draft 4.4)
  const drop = async (names) => { const i = S.synth({ style: 'painted', size: 128, drop: names }); return P.draw(i, S.synthOpts(i)); };
  const dw = await drop(['water.band']);
  ok(dw.gaps.includes('PAINT_NO_WATER_MASKS') && dw.approx === true && dw.stats.waterPx > 0, 'no water.band: water from gtype, gap PAINT_NO_WATER_MASKS, approx');
  const dob = await drop(['objects']);
  ok(dob.gaps.includes('PAINT_NO_OBJECTS') && dob.stats.buildings === 0 && dob.stats.buildingPx === 0, 'no objects: gap PAINT_NO_OBJECTS, no buildings');
  const dm = await drop(['material']);
  ok(dm.notes.some(n => n.code === 'PAINT_NO_MATERIAL') && dm.gaps.length === 0, 'no material: note PAINT_NO_MATERIAL, no gap');
  ok(dm.stats.roadPx > 0, 'no material: roads still come from gtype 7 and decals (' + dm.stats.roadPx + ')');
  const ds = await drop(['shade']);
  ok(ds.notes.some(n => n.code === 'PAINT_INPUT_MADE'), 'no shade: made in the style, note PAINT_INPUT_MADE');
  const dg = await drop(['gtype', 'water.band', 'water.drown', 'material']);
  ok(dg.grid.w === 128 && dg.gaps.includes('PAINT_NO_WATER_MASKS') && dg.stats.waterPx === 0, 'no gtype, no water masks, no material: a picture with no water');

  // planted bad inputs
  {
    const bad = S.synth({ style: 'painted', size: 128 });
    const h = bad.layers.height;
    bad.layers.height = Object.assign({}, h, { etype: 'rgba8', data: new Uint8ClampedArray(h.w * h.h * 4) });
    await throwsCode(() => P.draw(bad, S.synthOpts(bad)), 'MV_FAULT', 'planted: height of etype rgba8');
    const nh = S.synth({ style: 'painted', size: 128 }); delete nh.layers.height;
    await throwsCode(() => P.draw(nh, S.synthOpts(nh)), 'MV_NOT_FOUND', 'planted: no height');
    const nf = S.synth({ style: 'painted', size: 128 }); nf.frame = Object.assign({}, nf.frame, { W: 0 });
    await throwsCode(() => P.draw(nf, S.synthOpts(nf)), 'MV_FAULT', 'planted: frame W 0');
    const np = S.synth({ style: 'painted', size: 128 }); np.pal = JSON.parse(JSON.stringify(np.pal)); np.pal.landCover.other = 'brown';
    await throwsCode(() => P.draw(np, S.synthOpts(np)), 'MV_FAULT', 'planted: palette colour not #RRGGBB');
    const nc = S.synth({ style: 'painted', size: 128 }), oc = S.synthOpts(nc);
    oc.tick = () => { const M = require(path.join(MV, 'mapviz')); throw new M.MvError('MV_CANCELLED', 'cancel'); };
    await throwsCode(() => P.draw(nc, oc), 'MV_CANCELLED', 'a tick that throws MV_CANCELLED ends the draw');
  }

  // sizes: thumbnail 512 vs 1024, pool path (test pool, then a real jobs pool)
  const i512 = S.synth({ style: 'painted', size: 512 });
  const o512 = S.synthOpts(i512);
  ok(o512.thumb === true, 'size 512 is a thumbnail');
  const t512 = await P.draw(i512, o512);
  ok(t512.stats.kuwaharaR === 2 && t512.stats.outlinePx === 0 && t512.grid.h === 384, 'thumbnail 512: radius 2, no outline');
  const i1k = S.synth({ style: 'painted', size: 1024 });
  const t1k = await P.draw(i1k, S.synthOpts(i1k));
  ok(t1k.stats.kuwaharaR === 4 && t1k.stats.outlinePx > 0, '1024: radius 4, building outline drawn (' + t1k.stats.outlinePx + ' px)');
  {
    const gf = require(path.join(MV, 'lib/raster/gridfile'));
    let runs = 0;
    const fake = {
      run(kernel, task) {
        runs++;
        const io = { readGrid: f => gf.read(path.join(task.out, f)), writeGrid: (f, gr) => gf.write(path.join(task.out, f), gr), progress: { check() {} } };
        return Promise.resolve({ code: require(path.join(MV, kernel)).run(Object.assign({ v: 1, kernel }, task), io) });
      },
      close() { return Promise.resolve(); },
    };
    const op = Object.assign(S.synthOpts(i512), { pool: 2, workDir: SCR, poolObject: fake });
    const tp = await P.draw(i512, op);
    ok(runs === 2 && sha1(tp.grid.data) === sha1(t512.grid.data) && tp.stats.pool === 2, 'test pool: 2 bands, same bytes as in process');
    ok(fs.readdirSync(SCR).every(n => !/^mapviz-painted-/.test(n)), 'pool work folder removed');
    const failing = { run: () => Promise.resolve({ code: 2, stderr: 'boom' }), close: () => Promise.resolve() };
    await throwsCode(() => P.draw(i512, Object.assign(S.synthOpts(i512), { pool: 2, workDir: SCR, poolObject: failing })), 'MV_FAULT', 'planted: a kernel that fails gives MV_FAULT');
    const cancelled = { run: () => Promise.resolve({ code: 5 }), close: () => Promise.resolve() };
    await throwsCode(() => P.draw(i512, Object.assign(S.synthOpts(i512), { pool: 2, workDir: SCR, poolObject: cancelled })), 'MV_CANCELLED', 'a cancelled band gives MV_CANCELLED');
    // slow pool: bands take 600 ms each; ticks come while they run (every ~100 ms) and after each band
    {
      const slow = { run: (k, t) => new Promise(res => setTimeout(() => res(fake.run(k, t)), 600)), close: () => Promise.resolve() };
      const st0 = [];
      const os0 = Object.assign(S.synthOpts(i512), { pool: 2, workDir: SCR, poolObject: slow });
      os0.tick = (d, t) => st0.push([Date.now(), d, t]);
      const ts = await P.draw(i512, os0);
      const H5 = i512.frame.H;
      const during = st0.filter(x => x[1] >= H5 && x[1] < 2 * H5);
      let gapMs = 0; for (let i = 1; i < during.length; i++) gapMs = Math.max(gapMs, during[i][0] - during[i - 1][0]);
      ok(sha1(ts.grid.data) === sha1(t512.grid.data) && during.length >= 4 && gapMs < 400, 'slow pool: ' + during.length + ' ticks while bands run, largest gap ' + gapMs + ' ms (< 400)');
      ok(st0.some(x => x[1] === H5 + 256), 'slow pool: a tick when the first band ends (done 256 rows)');
    }
    // cancel while bands hang: the draw ends at the next beat, not when the bands end
    {
      const M = require(path.join(MV, 'mapviz'));
      let hung = 0;
      const hang = { run: () => { hung++; return new Promise(() => {}); }, close: () => Promise.resolve() };
      const oh = Object.assign(S.synthOpts(i512), { pool: 2, workDir: SCR, poolObject: hang });
      let t0 = 0;
      oh.tick = (d) => { if (d >= i512.frame.H) { if (!t0) t0 = Date.now(); else if (Date.now() - t0 > 250) throw new M.MvError('MV_CANCELLED', 'cancel'); } };
      const tc = Date.now();
      await throwsCode(() => P.draw(i512, oh), 'MV_CANCELLED', 'cancel while pool bands hang');
      ok(hung === 2 && Date.now() - tc < 5000 && fs.readdirSync(SCR).every(n => !/^mapviz-painted-/.test(n)), 'cancel while bands hang: ends in ' + (Date.now() - tc) + ' ms, work folder removed');
    }
    if (process.env.MAPVIZ_NO_POOL === '1') console.log('skip real pool: MAPVIZ_NO_POOL=1');
    else {
      const t0 = Date.now();
      const tr = await P.draw(i512, Object.assign(S.synthOpts(i512), { pool: 2, workDir: SCR }));
      ok(sha1(tr.grid.data) === sha1(t512.grid.data), 'real jobs pool (2 children): same bytes as in process (' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)');
    }
  }

  // ---- fixture, both forms (README 10); mode battle_zones (the GoH form has no combat.mi)
  const fx = require(path.join(MV, 'test/fxmake'));
  const PAINT = require('../../index');
  const fxr = {}, fxi = {};
  for (const form of ['as2', 'goh']) {
    const info = fx.make(path.join(SCR, 'fx-' + form), { form });
    fxi[form] = info;
    let fi;
    try { fi = await PAINT.gather({ style: 'painted', target: info.target, game: info.gameDir, mods: info.mods, modDirs: info.modDirs, map: info.map, mode: 'battle_zones', size: 256, seed: 1, in: [] }); }
    catch (e) { ok(false, 'fixture ' + form + ': shared gather failed: ' + (e && (e.code || '') + ' ' + e.message)); continue; }
    ok(fi.frame.W === 256 && fi.frame.H === 188, 'fixture ' + form + ' frame 256 x 188');
    const fo = Object.assign({ thumb: true, minStroke: 2, maxSymbols: 5, contours: false, seed: 1, tick: () => {}, pool: 0, workDir: null });
    const fr = await P.draw(fi, fo);
    fxr[form] = fr;
    const s = fr.stats;
    console.log('fixture ' + form + ': gaps ' + JSON.stringify(fr.gaps) + ', stats ' + JSON.stringify(s));
    ok(fr.grid.w === 256 && fr.grid.h === 188 && s.offGroundPx === 0, 'fixture ' + form + ': 256 x 188, no off-ground pixel (no map.ply)');
    ok(s.buildings === 1 && s.buildingPx > 0, 'fixture ' + form + ': one building (fx_house)');
    ok(s.roadPx > 0 && s.woodPx > 0 && s.waterPx > 0, 'fixture ' + form + ': road, wood and water drawn');
    ok(!fr.gaps.includes('PAINT_NO_OBJECTS'), 'fixture ' + form + ': objects present');
    const pond = px(fr.grid, 192, 51);
    ok(pond[2] > pond[0], 'fixture ' + form + ': pond centre (192, 51) is blue (' + pond + ')');
  }
  if (fxr.as2 && fxr.goh) {
    const a = fxr.as2.stats, b = fxr.goh.stats;
    ok(['buildings', 'roadPx', 'woodPx', 'offGroundPx', 'kuwaharaR'].every(k => a[k] === b[k]) && JSON.stringify(fxr.as2.gaps) === JSON.stringify(fxr.goh.gaps),
      'fixture: MoW:AS2 form and GoH form give the same counts and gaps');
    // GoH cells are 5 u, so the pond shore is cut finer: water pixels within 2 % [I]
    ok(Math.abs(a.waterPx - b.waterPx) <= 0.02 * a.waterPx, 'fixture: water pixels of the two forms within 2 % (' + a.waterPx + ' / ' + b.waterPx + ')');
  }

  // ---- through the paint cli (shared): `paint draw --style painted` on the fixture, both forms; same picture as in process
  for (const form of ['as2', 'goh']) {
    const info = fxi[form];
    if (!info || !fxr[form]) continue;
    const out = path.join(SCR, 'cli-' + form);
    const r = require('child_process').spawnSync(process.execPath, [path.join(MV, 'mapviz.js'), 'paint', 'draw', '--style', 'painted', '--target', info.target,
      '--game', info.gameDir, '--map', info.map, '--mode', 'battle_zones', '--size', '256', '--out', out, '--json'].concat(info.modDirs.length ? ['--mod-dir', info.modDirs.join(',')] : []),
    { encoding: 'utf8', env: Object.assign({}, process.env), timeout: 300000 });
    const f = path.join(out, 'pic.painted.mvg'), sc = path.join(out, 'pic.painted.json');
    ok((r.status === 0 || r.status === 1) && fs.existsSync(f) && fs.existsSync(sc), 'cli ' + form + ': paint draw --style painted exits 0 or 1 with pic.painted.mvg and .json (exit ' + r.status + ' ' + String(r.stderr || '').trim().slice(-300) + ')');
    if (!fs.existsSync(sc)) continue;
    const side = JSON.parse(fs.readFileSync(sc, 'utf8'));
    ok(side.style === 'painted' && side.styleVersion === P.VERSION && side.target === info.target && side.stats && side.stats.kuwaharaR === 2,
      'cli ' + form + ': sidecar style painted, styleVersion ' + side.styleVersion + ', target ' + side.target);
    ok(side.counts && side.counts.outsidePather === 3488 && side.counts.noData === 0, 'cli ' + form + ': counts outsidePather 3488, noData 0 (draft 8.2): ' + JSON.stringify(side.counts));
  }

  // ---- goldens (README 9.2)
  const GF = path.join(__dirname, 'painted.golden.json');
  {
    const now = { synth128: sha1(g.data), fixture256: fxr.as2 ? sha1(fxr.as2.grid.data) : null };
    if (!fs.existsSync(GF)) { fs.writeFileSync(GF, JSON.stringify(now, null, 1) + '\n'); console.log('golden set: ' + JSON.stringify(now)); pass++; }
    else {
      const gold = JSON.parse(fs.readFileSync(GF, 'utf8'));
      ok(gold.synth128 === now.synth128, 'golden synth 128: ' + now.synth128 + ' vs ' + gold.synth128);
      ok(!gold.fixture256 || gold.fixture256 === now.fixture256, 'golden fixture 256: ' + now.fixture256 + ' vs ' + gold.fixture256);
    }
  }
}

main().catch(e => ok(false, 'threw: ' + (e && e.stack || e))).then(() => {
  if (OWN && !fail) { try { fs.rmSync(SCR, { recursive: true, force: true }); } catch (e) { /* temp */ } }
  if (fail) { console.log(fail + ' failed, ' + pass + ' passed'); process.exit(1); }
  console.log('PASS mapviz paint/painted (' + pass + ')');
});

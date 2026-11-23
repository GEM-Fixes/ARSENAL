// paint canvas + paper test (MV-PNT1): the rasteriser by hand-counted answers (integer blend rule, aligned fills, row
// order, hatches anchored at world (0, 0)), the stroke digit font and symbols, paper noise anchored in world space, and a
// golden byte hash of one test picture (README 9.2). Seeded defects: a glyph outside the font, an unknown symbol, a bad
// colour.
// usage: node tools/mapviz/paint/test/canvas.test.js [scratch dir] [--update-golden]
// Author: Imperator_Aug (ARSENAL, ia-dc48b69f)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');

const W0 = path.resolve(process.argv[2] && !/^--/.test(process.argv[2]) ? process.argv[2] : fs.mkdtempSync(path.join(os.tmpdir(), 'mapviz-paint-canvas-')));
fs.mkdirSync(W0, { recursive: true });
{
  const c = process.env.ARSENAL_CACHE;
  process.env.ARSENAL_CACHE = c && path.resolve(c).startsWith(W0 + path.sep) ? c : path.join(W0, 'cache');
}
const UPDATE = process.argv.includes('--update-golden');
let pass = 0, fail = 0;
function ok(c, what) { if (c) pass++; else { fail++; console.log('FAIL mapviz paint: ' + what); } }
const sha1 = b => crypto.createHash('sha1').update(Buffer.from(b.buffer, b.byteOffset, b.byteLength)).digest('hex');

const C = require('../canvas');
const Pp = require('../paper');
const mv = require('../../mapviz');
const throwsCode = (fn, code, det) => { try { fn(); return false; } catch (e) { return e instanceof mv.MvError && e.code === code && (!det || (e.detail && e.detail.code === det)); } };
const px = (g, i, j) => Array.from(g.data.subarray((j * g.w + i) * 4, (j * g.w + i) * 4 + 4));

const FR = { box: [0, 0, 100, 80], W: 20, H: 16, sx: 5, sy: 5, x0: 0, y0: 0, long: 20, stretch: 1 };

// create, toPx, toWorld
{
  const g = C.create(FR, '#102030');
  ok(g.w === 20 && g.h === 16 && g.etype === 'rgba8' && g.cell === 5 && g.ox === 0 && g.oy === 0 && g.data.length === 20 * 16 * 4, 'create: rgba8 on the frame');
  ok(px(g, 3, 4).join() === '16,32,48,255', 'create: filled colour, alpha 255');
  ok(C.create(FR).data.every(v => v === 0), 'create: transparent by default');
  ok(C.toPx(FR, 0, 80).join() === '0,0' && C.toPx(FR, 100, 0).join() === '20,16', 'toPx: north-west corner is (0, 0)');
  const w = C.toWorld(FR, 7.5, 3.25);
  ok(Math.abs(w[0] - 37.5) < 1e-9 && Math.abs(w[1] - 63.75) < 1e-9, 'toWorld inverts toPx');
  const st = C.create(Object.assign({}, FR, { sy: 4 }));
  ok(st.meta.cellY === 4, 'create: cellY on a stretched frame');
}

// blend: integer rule (x * a + 127) / 255 and the 16-subsample cover
{
  const g = C.create(FR, [200, 100, 0, 255]);
  C.blend(g, 0, 0, [0, 0, 255, 128], 16);
  // screen (0, 0) is grid row H - 1
  const p = px(g, 0, 15);
  ok(p.join() === [((0 * 128 + 200 * 127 + 127) / 255) | 0, ((0 * 128 + 100 * 127 + 127) / 255) | 0, ((255 * 128 + 0 + 127) / 255) | 0, 255].join(), 'blend: integer source-over ' + p);
  const h = C.create(FR, [0, 0, 0, 255]);
  C.blend(h, 1, 0, [255, 255, 255, 255], 8);
  ok(px(h, 1, 15)[0] === ((255 * 128 + 0 + 127) / 255 | 0), 'blend: cover 8 of 16 = alpha 128');
  const t = C.create(FR);
  C.blend(t, 2, 2, [255, 0, 0, 128], 16);
  C.blend(t, 2, 2, [0, 0, 255, 128], 16);
  const q = px(t, 2, 13);
  ok(q[3] === 128 + ((128 * 127 + 127) / 255 | 0) && q[2] > q[0] && q[0] > 0, 'blend over transparent keeps straight alpha ' + q);
}

// fillPoly: an aligned rectangle covers whole pixels exactly; half pixels get half cover
{
  const g = C.create(FR, [0, 0, 0, 255]);
  C.fillPoly(g, [[2, 3], [6, 3], [6, 5], [2, 5]], [255, 255, 255, 255]);
  let n = 0;
  for (let k = 0; k < g.data.length; k += 4) if (g.data[k] === 255) n++;
  ok(n === 8, 'fillPoly: a 4 x 2 px aligned rectangle fills 8 pixels, got ' + n);
  ok(px(g, 2, 16 - 1 - 3)[0] === 255 && px(g, 5, 16 - 1 - 4)[0] === 255 && px(g, 6, 12)[0] === 0, 'fillPoly: screen rows map to grid row H - 1 - py');
  const h = C.create(FR, [0, 0, 0, 255]);
  C.fillPoly(h, [[2, 3], [2.5, 3], [2.5, 4], [2, 4]], [255, 255, 255, 255]);
  ok(px(h, 2, 12)[0] === 128, 'fillPoly: half a pixel = 8 subsamples = 128, got ' + px(h, 2, 12)[0]);
  const e = C.create(FR, [0, 0, 0, 255]);
  C.fillPoly(e, [[1, 1], [9, 1], [9, 9], [1, 9], [1, 1], [3, 3], [7, 3], [7, 7], [3, 7], [3, 3]], [255, 255, 255, 255]);
  ok(px(e, 5, 10)[0] === 0 && px(e, 1, 14)[0] === 255, 'fillPoly: even-odd leaves the hole');
}

// strokePath: a horizontal line 2 px wide on a pixel boundary covers two whole rows; butt ends stop at the points
{
  const g = C.create(FR, [0, 0, 0, 255]);
  C.strokePath(g, [[4, 8], [10, 8]], 2, [255, 255, 255, 255]);
  let n = 0;
  for (let k = 0; k < g.data.length; k += 4) if (g.data[k] === 255) n++;
  ok(n === 12, 'strokePath: 6 x 2 px with butt ends = 12 pixels, got ' + n);
  const r = C.create(FR, [0, 0, 0, 255]);
  C.strokePath(r, [[4, 8], [10, 8]], 2, [255, 255, 255, 255], { cap: 'round' });
  ok(px(r, 3, 7)[0] > 0 && px(r, 10, 7)[0] > 0, 'strokePath: round caps reach past the end points');
  const d = C.create(FR, [0, 0, 0, 255]);
  C.strokePath(d, [[0, 8], [20, 8]], 2, [255, 255, 255, 255], { dash: [4, 4] });
  ok(px(d, 1, 7)[0] === 255 && px(d, 5, 7)[0] === 0 && px(d, 9, 7)[0] === 255, 'strokePath: dash 4 on, 4 off');
  const o = C.create(FR, [0, 0, 0, 255]);
  C.strokePath(o, [[2, 2], [8, 2], [8, 8]], 2, [255, 255, 255, 128]);
  ok(px(o, 7, 14)[0] === px(o, 4, 14)[0], 'strokePath: a corner is blended once (no darker joint)');
}

// circles
{
  const g = C.create({ box: [0, 0, 200, 200], W: 40, H: 40, sx: 5, sy: 5, x0: 0, y0: 0, long: 40, stretch: 1 }, [0, 0, 0, 255]);
  C.fillCircle(g, 20, 20, 10, [255, 255, 255, 255]);
  let s = 0;
  for (let k = 0; k < g.data.length; k += 4) s += g.data[k];
  const area = s / 255;
  ok(Math.abs(area - Math.PI * 100) < 4, 'fillCircle: area pi r^2 within 4 px, got ' + area.toFixed(1));
  const h = C.create({ box: [0, 0, 200, 200], W: 40, H: 40, sx: 5, sy: 5, x0: 0, y0: 0, long: 40, stretch: 1 }, [0, 0, 0, 255]);
  C.strokeCircle(h, 20, 20, 10, 2, [255, 255, 255, 255]);
  ok(px(h, 20, 39 - 20)[0] === 0 && px(h, 30, 39 - 20)[0] > 0, 'strokeCircle: ring only');
}

// hatches: anchored at world (0, 0): the same world spot hatches the same in two frames that overlap
{
  const hatch = { color: '#FFFFFF', angle: 45, gap: 6, width: 1 };
  const A = { box: [0, 0, 100, 100], W: 20, H: 20, sx: 5, sy: 5, x0: 0, y0: 0, long: 20, stretch: 1 };
  const B = { box: [50, 50, 150, 150], W: 20, H: 20, sx: 5, sy: 5, x0: 50, y0: 50, long: 20, stretch: 1 };
  const ga = C.create(A, [0, 0, 0, 255]), gb = C.create(B, [0, 0, 0, 255]);
  const na = C.hatchMask(ga, () => true, hatch), nb = C.hatchMask(gb, new Uint8Array(400).fill(1), hatch);
  ok(na === 400 && nb === 400, 'hatchMask: counts the masked pixels');
  let same = 0, diff = 0;
  for (let j = 0; j < 10; j++) for (let i = 0; i < 10; i++) { if (px(ga, 10 + i, 10 + j).join() === px(gb, i, j).join()) same++; else diff++; }
  ok(diff === 0, 'hatchMask: neighbouring pictures join (same world, same pixels), differences ' + diff);
  let lit = 0;
  for (let k = 0; k < ga.data.length; k += 4) if (ga.data[k] > 0) lit++;
  ok(lit > 40 && lit < 300, 'hatchMask: lines, not a fill (' + lit + ' px lit)');
  const f = C.create(A, [0, 0, 0, 255]);
  C.hatchMask(f, (i, j) => i < 5, hatch, { fill: '#FF000080' });
  ok(px(f, 2, 2)[0] >= 128 && px(f, 10, 2)[0] === 0, 'hatchMask: fill washed under the lines, only in the mask');
  const p = C.create(A, [0, 0, 0, 255]);
  C.hatchPoly(p, [[0, 0], [10, 0], [10, 10], [0, 10]], hatch, { fill: '#00FF00FF' });
  ok(px(p, 2, 17)[1] === 255 && px(p, 15, 2)[1] === 0, 'hatchPoly: fill inside the polygon only');
}

// digits and symbols
{
  const g = C.create({ box: [0, 0, 400, 200], W: 80, H: 40, sx: 5, sy: 5, x0: 0, y0: 0, long: 80, stretch: 1 }, [255, 255, 255, 255]);
  const r = C.digits(g, '12.5m', 4, 20, { size: 11, rgba: [0, 0, 0, 255], halo: [255, 255, 0, 255] });
  ok(r.h === 11 && r.w > 20 && r.w < 50, 'digits: size ' + r.w.toFixed(1) + ' x ' + r.h);
  let ink = 0;
  for (let k = 0; k < g.data.length; k += 4) if (g.data[k] < 100) ink++;
  ok(ink > 20, 'digits: ink drawn (' + ink + ' px)');
  ok(throwsCode(() => C.digits(g, '12a', 4, 20, {}), 'MV_FAULT', 'PAINT_GLYPH'), 'seeded defect: a letter in digits is PAINT_GLYPH');
  // the decimal point is a solid dot of radius max(1, size / 8) that grows with size and survives its halo
  const dotInk = (size, halo) => {
    const F = { box: [0, 0, 400, 400], W: 80, H: 80, sx: 5, sy: 5, x0: 0, y0: 0, long: 80, stretch: 1 };
    const G = C.create(F, [200, 200, 200, 255]);
    C.digits(G, '.', 10, 40, { size, rgba: [0, 0, 0, 255], halo });
    let n = 0; for (let k = 0; k < G.data.length; k += 4) if (G.data[k] < 100) n++;
    return n;
  };
  const d10 = dotInk(10, [255, 255, 255, 255]), d40 = dotInk(40, null);
  ok(d10 >= 4 && d40 >= 16 && d40 > 4 * d10 / 2, 'digits: the point is a solid dot that scales with size (' + d10 + ' px at 10 with halo, ' + d40 + ' at 40)');
  for (const s of ['flag', 'spawn', 'drown', 'swim', 'noProne', 'north', 'strong.reverse', 'strong.dead', 'strong.whatever']) {
    let threw = false;
    try { C.symbol(g, s, 40, 20, { size: 12, rgba: '#0072B2', line: '#000000', shape: 'outlined', dir: [0, -1] }); } catch (e) { threw = true; }
    ok(!threw, 'symbol ' + s + ' draws');
  }
  ok(throwsCode(() => C.symbol(g, 'castle', 4, 4, {}), 'MV_FAULT', 'PAINT_GLYPH'), 'seeded defect: an unknown symbol is PAINT_GLYPH');
  ok(throwsCode(() => C.color('red'), 'MV_FAULT'), 'seeded defect: a colour name is refused');
  ok(C.color('#0072B2').join() === '0,114,178,255' && C.color('#00000033')[3] === 51, 'color: #RRGGBB and #RRGGBBAA');
  ok(C.mix([0, 0, 0, 255], [255, 255, 255, 255], 0.5).join() === '128,128,128,255' && C.mul([100, 100, 100, 7], 1.5).join() === '150,150,150,7', 'mix and mul round to integers');
}

// wobble: deterministic, moves points by at most amp, seeded by world position
{
  const pts = [[0, 0], [40, 0]];
  const a = C.wobble(pts, { amp: 1.5, wave: 24, seed: 3, frame: FR }), b = C.wobble(pts, { amp: 1.5, wave: 24, seed: 3, frame: FR });
  ok(JSON.stringify(a) === JSON.stringify(b) && a.length > 2, 'wobble: same input, same points (' + a.length + ')');
  ok(a.every((p, q) => Math.abs(p[1]) <= 1.5 + 1e-9), 'wobble: offset within amp');
  const c = C.wobble(pts, { amp: 1.5, wave: 24, seed: 4, frame: FR });
  ok(JSON.stringify(a) !== JSON.stringify(c), 'wobble: another seed, another line');
}

// paper: hash integer, noise in 0..1, the grain is anchored in world space (two sizes, same world point, same value)
{
  ok(Pp.hash(1, 2, 3) === Pp.hash(1, 2, 3) && Pp.hash(1, 2, 3) !== Pp.hash(2, 1, 3) && Number.isInteger(Pp.hash(5, 6, 7)) && Pp.hash(5, 6, 7) >= 0, 'hash: integer, order matters');
  let lo = 1, hi = 0;
  for (let q = 0; q < 500; q++) { const v = Pp.noise(q * 3.7, q * 1.3, 40, 1); lo = Math.min(lo, v); hi = Math.max(hi, v); }
  ok(lo >= 0 && hi <= 1 && hi - lo > 0.3, 'noise in 0..1 and varies');
  const big = { box: [0, 0, 640, 480], W: 128, H: 96, sx: 5, sy: 5, x0: 0, y0: 0, long: 128, stretch: 1 };
  const small = { box: [0, 0, 640, 480], W: 32, H: 24, sx: 20, sy: 20, x0: 0, y0: 0, long: 32, stretch: 1 };
  ok(Pp.fbm(130, 50, { seed: 2 }) === Pp.fbm(130, 50, { seed: 2 }), 'fbm: same point, same value');
  const pb = Pp.paper(big, '#808080', { grain: 0.2, seed: 2 }), ps = Pp.paper(small, '#808080', { grain: 0.2, seed: 2 });
  ok(pb.data.every((v, k) => (k & 3) !== 3 || v === 255), 'paper: alpha 255 everywhere');
  // big pixel (i, j) centre (5 i + 2.5, 5 j + 2.5); small pixel centre (20 i + 10, 20 j + 10): no shared centres, so
  // compare the model at the same world point instead of pixels: paper colour = round(128 x (1 + 0.2 (2 fbm - 1)))
  const expect = (x, y) => Math.round(128 * (1 + 0.2 * (2 * Pp.fbm(x, y, { scale: 40, seed: 2 }) - 1)));
  ok(px(pb, 3, 7)[0] === expect(17.5, 37.5) && px(ps, 3, 7)[0] === expect(70, 150), 'paper: value from the world position of the pixel centre');
  const gr = C.create(big, [100, 100, 100, 255]);
  Pp.grain(gr, big, 0.1, { seed: 1 });
  let varied = new Set();
  for (let k = 0; k < gr.data.length; k += 4) varied.add(gr.data[k]);
  ok(varied.size > 3 && gr.data[3] === 255, 'grain: multiplies in place (' + varied.size + ' levels)');
}

// golden: one composed test picture, byte hash of the data block (integer stages)
{
  const fr = { box: [-160, -120, 160, 120], W: 64, H: 48, sx: 5, sy: 5, x0: -160, y0: -120, long: 64, stretch: 1 };
  const g = Pp.paper(fr, '#F3EEDF', { grain: 0.04, seed: 1 });
  C.fillPoly(g, [[5, 5], [30, 8], [20, 30]], '#C8B8A6');
  C.strokePath(g, C.wobble([[2, 40], [60, 20]], { amp: 1, seed: 1, frame: fr }), 1.5, '#2B2B2B');
  C.hatchMask(g, (i, j) => i > 40 && j < 20, { color: '#3C8DA3', angle: 45, gap: 8, width: 1 }, { fill: '#BFE6EF99' });
  C.digits(g, '3.5m', 30, 40, { size: 11, rgba: '#000000', halo: '#FFFFFFCC' });
  C.symbol(g, 'flag', 50, 30, { size: 12, rgba: '#0072B2', line: '#004B75' });
  const h = sha1(g.data);
  const gf = path.join(__dirname, 'canvas.golden.json');
  if (UPDATE || !fs.existsSync(gf)) { fs.writeFileSync(gf, JSON.stringify({ sha1: h }, null, 1) + '\n'); console.log('golden written: ' + h); }
  const want = JSON.parse(fs.readFileSync(gf, 'utf8')).sha1;
  ok(h === want, 'golden canvas picture ' + h + ' vs ' + want);
}

if (!process.argv[2]) fs.rmSync(W0, { recursive: true, force: true });
if (fail) { console.log('FAIL mapviz paint canvas: ' + fail + ' failed, ' + pass + ' passed'); process.exit(1); }
console.log('PASS mapviz paint canvas (' + pass + ')');

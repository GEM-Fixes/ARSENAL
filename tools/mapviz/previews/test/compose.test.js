// previews compose test (MV-PRV): targets per game, stretch numbers, safe area, band and crop boxes, inset, backdrop, the
// integer resample (golden byte hash, README 9.2) and seeded defects. Known answers: previews.md 14 (fixture, both forms).
// usage: node tools/mapviz/previews/test/compose.test.js [scratch dir] [--update-golden]
// Author: Imperator_Aug (ARSENAL, ia-f30e8930)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');

const W = path.resolve(process.argv[2] && !/^--/.test(process.argv[2]) ? process.argv[2] : fs.mkdtempSync(path.join(os.tmpdir(), 'mapviz-prv-compose-')));
fs.mkdirSync(W, { recursive: true });
{
  const c = process.env.ARSENAL_CACHE;
  process.env.ARSENAL_CACHE = c && path.resolve(c).startsWith(W + path.sep) ? c : path.join(W, 'cache');
}
const UPDATE = process.argv.includes('--update-golden');
let pass = 0, fail = 0;
function ok(c, what) { if (c) pass++; else { fail++; console.log('FAIL mapviz previews: ' + what); } }
const sha1 = b => crypto.createHash('sha1').update(Buffer.from(b.buffer ? Buffer.from(b.buffer, b.byteOffset, b.byteLength) : b)).digest('hex');
const near = (a, b, e) => Math.abs(a - b) <= (e || 1e-9);

const T = require('../targets'), CP = require('../compose'), RS = require('../resample'), SA = require('../safearea'), I = require('../index');
const fx = require('../../test/fxmake');
const mk = require('../../lib/mapkit');

// ------------------------------------------------------------------ targets (previews.md 2, 14)
function testTargets() {
  const as = T.targets('mowas2', 'multi/mv_fixture'), g = T.targets('goh', 'multi/mv_fixture'), gs = T.targets('goh', 'single/c/m1');
  const by = (rows, id) => rows.find(r => r.id === id);
  ok(by(as, 'preview').size.join() === '1920,1080' && by(as, 'preview').mips === 11 && by(as, 'preview').bytes === 1383240, 'as2 preview 1920x1080, 11 mips, 1383240 B');
  ok(by(as, 'small').size.join() === '400,300' && by(as, 'small').mips === 9 && by(as, 'small').bytes === 80552, 'as2 small 400x300, 9 mips, 80552 B');
  ok(by(as, 'header').bytes === 164000 && by(as, 'header').mips === 10 && by(as, 'header').tag === 'T', 'as2 header 164000 B, tag T');
  ok(by(as, 'header_interface').state === 'none' && by(as, 'header_interface').why === 'PRV_SP_GOH_ONLY', 'as2 header_interface none');
  ok(by(g, 'preview').size.join() === '2560,1440' && by(g, 'preview').mips === 12 && by(g, 'preview').bytes === 2458088, 'goh preview 2560x1440, 12 mips, 2458088 B');
  ok(by(g, 'small').state === 'none' && by(g, 'small').why === 'PRV_NO_FILE_IN_GAME', 'goh small none PRV_NO_FILE_IN_GAME');
  ok(by(g, 'header_interface').state === 'none' && by(gs, 'header_interface').state === 'write' && by(gs, 'header_interface').size.join() === '1024,600' && by(gs, 'header_interface').format === 'PNG', 'goh header_interface only on SP, 1024x600 PNG');
  ok(JSON.stringify(T.TARGETS.as64) === JSON.stringify(T.TARGETS.mowas2), 'as64 targets = mowas2 targets');
  ok(Object.isFrozen(T.TARGETS) && Object.isFrozen(T.TARGETS.goh.mp[0]), 'TARGETS frozen');
  const doc = { boxes: { world: [-600, -440, 600, 440] }, pictures: { minimap: null } };
  ok(T.minimapSize('mowas2', doc).join() === '1024,752', 'as2 fixture minimap 1024x752');
  ok(T.minimapSize('as64', doc).join() === '1024,752', 'as64 fixture minimap 1024x752');
  ok(T.minimapSize('goh', doc).join() === '1500,1100', 'goh fixture minimap 1500x1100');
  ok(T.dxt1Bytes(1024, 752) === 513688 && T.mipCount(1024, 752) === 11, 'as2 minimap 11 mips, 513688 B');
  ok(T.dxt1Bytes(1500, 1100) === 1102176 && T.mipCount(1500, 1100) === 11, 'goh minimap 11 mips, 1102176 B');
  ok(T.minimapSize('mowas2', { boxes: doc.boxes, pictures: { minimap: { size: [512, 512] } } }).join() === '512,376', 'as2 minimap takes the stack minimap long side');
  ok(T.minimapSize('goh', doc, 2048).join() === '2048,1500', '--minimap-size overrides L');
  ok(T.minimapSize('goh', { boxes: { world: [0, 0, 100, 1000] } }).join() === '152,1500', 'tall map: long side on y');
  let threw = false; try { T.targets('aow', 'multi/x'); } catch (e) { threw = true; }
  ok(threw, 'seeded: unknown game refused');
}

// ------------------------------------------------------------------ stretch, safe area (previews.md 4, 5, 14)
function testStretch() {
  const B = [-600, -440, 600, 440];
  const p = CP.stretch(B, [1920, 1080]), s = CP.stretch(B, [400, 300]), h = CP.stretch(B, [960, 256]);
  ok(p.ratio === 1.3037 && !p.scaleBar && p.sx === 32 && p.sy === 24.5455, 'preview ratio 1.3037, sx 32, sy 24.5455: ' + JSON.stringify(p));
  ok(s.ratio === 0.9778 && s.scaleBar, 'small ratio 0.9778, scale bar on');
  ok(h.ratio === 2.75 && !h.scaleBar, 'header ratio 2.75');
  ok(CP.stretch(B, [2560, 1440]).ratio === 1.3037, 'goh preview ratio 1.3037');
}

function fixtureDocs() {
  const out = {};
  for (const form of ['as2', 'goh']) {
    const f = fx.make(path.join(W, 'fx-' + form), { form });
    const src = mk.source({ target: f.target, game: f.gameDir, mods: [], modDirs: [] });
    out[form] = { f, src, doc: mk.doc(src, f.map, {}), bz: mk.doc(src, f.map, { mode: 'battle_zones' }) };
  }
  return out;
}

function testSafeAndBoxes(D) {
  for (const form of ['as2', 'goh']) {
    const { bz, doc } = D[form];
    const target = form === 'as2' ? 'mowas2' : 'goh', size = form === 'as2' ? [1920, 1080] : [2560, 1440];
    const B = bz.boxes.world;
    ok(B.join() === '-600,-440,600,440', form + ' world box B');
    const pts = CP.points(bz, 'battle_zones');
    const w = SA.safeArea(target, 'mp', size, B, pts);
    const get = (code, name) => w.find(x => x.code === code && x.name === name);
    const a1 = get('PRV_SAFE_SIDE', 'a1'), b1 = get('PRV_SAFE_SIDE', 'b1'), f2 = get('PRV_SAFE_TOP', 'f2');
    ok(w.length === 3 && a1 && b1 && f2, form + ' battle_zones preview warnings: a1, b1 side, f2 top: ' + JSON.stringify(w.map(x => x.code + ' ' + x.name)));
    if (a1 && b1 && f2) {
      const want = form === 'as2' ? [154, 1756, 172] : [205, 2341, 229];
      ok(a1.px[0] === want[0] && b1.px[0] === want[1] && f2.px[1] === want[2], form + ' warning px ' + [a1.px[0], b1.px[0], f2.px[1]] + ' = ' + want);
      ok(a1.what === 'spawn' && f2.what === 'flag' && f2.at.join() === '-200,300', form + ' warning rows carry what and at');
    }
    // frontline sp1 (-450, 20): exactly 12.5% -> strict, no warning
    const fl = SA.safeArea(target, 'mp', size, B, [{ what: 'spawn', name: 'sp1', x: -450, y: 20 }]);
    ok(fl.length === 0, form + ' sp1 at 12.5%: no PRV_SAFE_SIDE (strict)');
    ok(SA.safeArea(target, 'mp', [400, 300], B, pts, { id: 'small' }).length === 0, form + ' small: no warnings');
    // band
    const band = CP.bandFrame(bz, 'battle_zones', B);
    ok(near(band.centre[0], -3.1, 1e-6) && near(band.centre[1], -1.65, 1e-6), form + ' band centre (-3.1, -1.65): ' + band.centre);
    ok(near(band.frame[0], -600) && near(band.frame[1], -161.65, 1e-6) && near(band.frame[2], 600) && near(band.frame[3], 158.35, 1e-6), form + ' band box ' + band.frame);
    ok(band.out.slice().sort().join() === 'f2,f3', form + ' PRV_BAND_OUT f2, f3: ' + band.out);
    // crop action box before margin
    const A = CP.actionBox(bz, 'battle_zones');
    const wantA = form === 'as2' ? [-503.7, -240, 500, 460] : [-503.7, -240, 500, 400];
    ok(A.every((v, i) => near(v, wantA[i], 1e-6)), form + ' crop A = ' + wantA + ', got ' + A);
    const fr = CP.cropFrame(A, B, size);
    ok(near((fr[2] - fr[0]) / (fr[3] - fr[1]), size[0] / size[1], 1e-9), form + ' crop frame at the frame aspect');
    const Ab = [Math.max(A[0], B[0]), Math.max(A[1], B[1]), Math.min(A[2], B[2]), Math.min(A[3], B[3])];
    ok(fr[0] <= Ab[0] && fr[2] >= Ab[2] && fr[1] <= Ab[1] && fr[3] >= Ab[3] && fr[1] >= B[1] - 1e-9 && fr[3] <= B[3] + 1e-9, form + ' crop frame holds A within B and is shifted inside B on y: ' + fr);
    const half = CP.cropFrame(A, B, size, { leftHalf: true });
    ok(half[0] <= A[0] && half[0] + (half[2] - half[0]) / 2 >= A[2], form + ' goh SP crop: A in the left half');
    // every mode, no --mode: the frontline spawn joins the points
    ok(CP.points(doc, null).some(p => p.what === 'spawn' && p.x === -450 && p.y === 20), form + ' no mode: points of every mode (frontline sp1)');
  }
  // goh SP desk rule
  const desk = SA.safeArea('goh', 'sp', [2560, 1440], [-600, -440, 600, 440], [{ what: 'flag', name: 'r', x: 100, y: 0 }, { what: 'flag', name: 'l', x: -100, y: 0 }]);
  ok(desk.length === 1 && desk[0].code === 'PRV_GOH_DESK' && desk[0].name === 'r', 'goh SP: right half -> PRV_GOH_DESK');
  const bot = SA.safeArea('as64', 'sp', [1920, 1080], [-600, -440, 600, 440], [{ what: 'flag', name: 'low', x: 0, y: -400 }]);
  ok(bot.length === 1 && bot[0].code === 'PRV_SAFE_BOTTOM', 'as64 SP: bottom 16% -> PRV_SAFE_BOTTOM');
  // inset corners
  const ins = CP.insetRect([1920, 1080], [-600, -440, 600, 440], []);
  ok(ins.corner === 'bottom-right' && ins.box[2] === 302 && ins.box[3] === 221, 'inset bottom-right, 28% of 1080 = 302 long: ' + JSON.stringify(ins));
  const ins2 = CP.insetRect([1920, 1080], [-600, -440, 600, 440], [[ins.box[0] + 5, ins.box[1] + 5]]);
  ok(ins2.corner === 'bottom-left', 'a mark in the bottom-right corner -> bottom-left');
  const bd = CP.backdropRect([960, 256], [-600, -440, 600, 440]);
  ok(bd[3] === 256 && bd[2] === 349 && bd[0] === 305, 'backdrop rect: B at its own aspect, centred: ' + bd);
}

// ------------------------------------------------------------------ resample (integer, golden)
function synth(w, h, box) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const p = (j * w + i) * 4;
    data[p] = (i * 37 + j * 11) & 255; data[p + 1] = (i * 5 + j * 53) & 255; data[p + 2] = (i ^ j) * 7 & 255; data[p + 3] = (i + j) % 9 === 0 ? 0 : 255;
  }
  return { w, h, data, box };
}
function testResample() {
  const G = {};
  // identity: same frame, same size -> premultiplied input
  const s = synth(16, 12, [0, 0, 160, 120]);
  const id = RS.resample(s, [0, 0, 160, 120], 16, 12);
  let same = true;
  for (let p = 0; p < id.length; p += 4) {
    const a = s.data[p + 3];
    if (id[p + 3] !== a || id[p] !== Math.floor((s.data[p] * a + 127) / 255)) { same = false; break; }
  }
  ok(same, 'resample identity = premultiplied input');
  // flat colour stays flat both ways
  const flat = { w: 8, h: 8, data: new Uint8ClampedArray(256).fill(200), box: [0, 0, 80, 80] };
  const up = RS.resample(flat, [0, 0, 80, 80], 37, 23), dn = RS.resample(flat, [0, 0, 80, 80], 3, 5);
  const pm = Math.floor((200 * 200 + 127) / 255);
  const flatOk = a => { for (let p = 0; p < a.length; p += 4) if (a[p] !== pm || a[p + 1] !== pm || a[p + 2] !== pm || a[p + 3] !== 200) return false; return true; };
  ok(flatOk(up) && flatOk(dn), 'flat colour stays flat up and down (premultiplied ' + pm + ', alpha 200), edges included');
  // outside the picture: transparent
  const out = RS.resample(flat, [-80, 0, 0, 80], 4, 4);
  ok(out.every(v => v === 0), 'outside the picture -> transparent black');
  // clip: crop frame past B
  const cl = RS.resample(flat, [-40, 0, 40, 80], 8, 8, { clip: [0, 0, 80, 80] });
  ok(cl[3] === 0 && cl[(0 * 8 + 7) * 4 + 3] === 200, 'clip: left half outside B black');
  // seeded: a wrong frame (y box upside down) must not pass as a picture
  let wf = false; try { RS.resample(flat, [0, 80, 80, 0], 4, 4); } catch (e) { wf = true; }
  ok(wf, 'seeded: frame box with y1 < y0 refused');
  G.up = sha1(RS.resample(s, [10, 5, 150, 110], 333, 211));
  G.down = sha1(RS.resample(synth(512, 384, [0, 0, 1200, 880]), [0, 0, 1200, 880], 100, 75));
  G.mixed = sha1(RS.resample(synth(64, 300, [-600, -440, 600, 440]), [-600, -440, 600, 440], 960, 256));
  G.blur = sha1(CP.boxBlur(RS.opaque(RS.resample(s, [0, 0, 160, 120], 64, 48)), 64, 48, 2));
  G.flip = sha1(RS.flipRows(RS.resample(s, [0, 0, 160, 120], 16, 12), 16, 12));
  const enc = require('../../../lib/model/ddsenc').encode(RS.opaque(RS.resample(s, [0, 0, 160, 120], 64, 48)), 64, 48, { mips: true });
  G.dds = sha1(enc);
  const gf = path.join(__dirname, 'resample.golden.json');
  ok(UPDATE || fs.existsSync(gf), 'golden file resample.golden.json present');
  if (UPDATE) { fs.writeFileSync(gf, JSON.stringify(G, null, 1) + '\n'); console.log('golden written: ' + path.basename(gf)); }
  const want = JSON.parse(fs.readFileSync(gf, 'utf8'));
  for (const k of Object.keys(G)) ok(want[k] === G[k], 'golden ' + k + ': ' + G[k] + ' = ' + want[k]);
  // determinism: twice the same bytes
  ok(sha1(RS.resample(s, [10, 5, 150, 110], 333, 211)) === G.up, 'same input, same bytes');
  // seeded defects
  let t = 0;
  try { RS.resample({ w: 4, h: 4, data: new Uint8ClampedArray(64) }, [0, 0, 1, 1], 4, 4); } catch (e) { t++; }
  try { RS.resample(flat, [0, 0, 80, 80], 0, 4); } catch (e) { t++; }
  try { RS.resample(flat, [0, 0, 0, 80], 4, 4); } catch (e) { t++; }
  ok(t === 3, 'seeded: no box, zero size, empty frame refused (' + t + ' of 3)');
}

// ------------------------------------------------------------------ compose on the fixture (no marks: paint is another part)
async function testCompose(D) {
  for (const form of ['as2', 'goh']) {
    const { src, bz } = D[form];
    const sources = CP.Sources(src, bz, { mode: 'battle_zones' });
    const target = src.target;
    const rows = T.targets(target, bz.key, bz);
    const pv = rows.find(r => r.id === 'preview'), mm = rows.find(r => r.id === 'minimap');
    const mkRow = (r, compose, extra) => Object.assign({}, r, { compose, marks: 'none', strong: false, danger: false, title: false,
      source: { name: 'l0', resolved: 'pic.l0', from: 'draw', state: 'ok' } }, extra || {});
    const o = { sources, paint: null, mode: 'battle_zones', seed: 1 };
    const a = await CP.compose(src, bz, mkRow(pv, 'stretch'), o);
    ok(a.w === pv.size[0] && a.h === pv.size[1] && a.rgba.length === a.w * a.h * 4, form + ' preview composed at ' + a.w + 'x' + a.h);
    let opaque = true; for (let p = 3; p < a.rgba.length; p += 4) if (a.rgba[p] !== 255) { opaque = false; break; }
    ok(opaque, form + ' preview opaque');
    // north up: the pond (300, -200) is below the road (y 190..220): its deep blue sits in the bottom half of the picture
    const at = (img, w, x, y) => { const p = (y * w + x) * 4; return [img[p], img[p + 1], img[p + 2]]; };
    const B = bz.boxes.world, px = x => Math.floor((x - B[0]) / (B[2] - B[0]) * a.w), rowTop = y => Math.floor((B[3] - y) / (B[3] - B[1]) * a.h);
    const pond = at(a.rgba, a.w, px(300), rowTop(-200)), mirror = at(a.rgba, a.w, px(300), rowTop(200));
    ok(pond[2] > pond[0] + 30 && !(mirror[2] > mirror[0] + 30), form + ' preview north up: pond blue at its row from the top ' + pond + ' / ' + mirror);
    const m = await CP.compose(src, bz, mkRow(mm, 'stretch'), o);
    const mp = at(m.rgba, m.w, Math.floor((300 - B[0]) / (B[2] - B[0]) * m.w), Math.floor((-200 - B[1]) / (B[3] - B[1]) * m.h));
    ok(m.w === mm.size[0] && mp[2] > mp[0] + 30, form + ' minimap row 0 = min world y (no flip): pond ' + mp);
    // crop: frame and inset from the plan geometry
    const fr = CP.cropFrame(CP.actionBox(bz, 'battle_zones'), B, pv.size);
    const ins = CP.insetRect(pv.size, B, []);
    const c = await CP.compose(src, bz, mkRow(pv, 'crop', { frame: fr, inset: { box: ins.box } }), o);
    const [ix, iy] = ins.box;
    ok(at(c.rgba, c.w, ix - 3, iy - 3).join() === '0,0,0' && at(c.rgba, c.w, ix - 2, iy - 2).join() === '255,255,255', form + ' crop inset: 1 px black edge, 2 px white frame');
    // backdrop: halved brightness outside the centred rect
    const bd = await CP.compose(src, bz, mkRow(pv, 'backdrop'), o);
    const r = CP.backdropRect(pv.size, B);
    ok(r[0] > 0 && Math.max(...at(bd.rgba, bd.w, 1, 1)) <= 128, form + ' backdrop: the band beside B at half brightness');
    // title with no font -> PRV_TITLE_GLYPHS, no text
    const t = await CP.compose(src, bz, mkRow(pv, 'stretch', { title: true }), Object.assign({}, o, { title: 'Test', font: null }));
    ok(t.notes.includes('PRV_TITLE_GLYPHS') && sha1(t.rgba) === sha1(a.rgba), form + ' title without the font: note, picture unchanged');
    // marks asked with no paint -> note
    const nm = await CP.compose(src, bz, mkRow(pv, 'stretch', { marks: 'flags' }), o);
    ok(nm.notes.includes('PRV_MARKS_NOT_BUILT'), form + ' marks without paint: PRV_MARKS_NOT_BUILT');
    // marks with the real paint part on a picture that is not a style: strong.inf.json and routes.json in --in are drawn
    // (late P2); before the fix both were never read and the bytes stayed the same
    let P = null; try { P = require('../../paint'); } catch (e) { P = null; }
    ok(P && P.marks && typeof P.marks.read === 'function', form + ' paint part with marks.read is built');
    if (P && P.marks && typeof P.marks.read === 'function') {
      const inDir = path.join(W, 'in-' + form), emptyIn = path.join(W, 'in0-' + form);
      fs.mkdirSync(inDir, { recursive: true }); fs.mkdirSync(emptyIn, { recursive: true });
      fs.writeFileSync(path.join(inDir, 'strong.inf.json'), JSON.stringify({ v: 1, candidates: [{ side: 'a', label: 'score', x: -100, y: -100, top: true }, { side: 'b', label: 'score', x: 150, y: 120, top: true }] }));
      fs.writeFileSync(path.join(inDir, 'routes.json'), JSON.stringify({ v: 1, items: [{ side: 'a', pts: [[-500, -300], [0, 0], [400, 300]] }] }));
      const po = Object.assign({}, o, { paint: P });
      const s0 = await CP.compose(src, bz, mkRow(pv, 'stretch', { marks: 'flags', strong: true }), Object.assign({}, po, { in: [emptyIn] }));
      const s1 = await CP.compose(src, bz, mkRow(pv, 'stretch', { marks: 'flags', strong: true }), Object.assign({}, po, { in: [inDir] }));
      ok(!s1.notes.includes('PRV_MARKS_NOT_BUILT') && sha1(s0.rgba) !== sha1(a.rgba), form + ' flags drawn with paint (bytes differ from no marks)');
      ok(sha1(s0.rgba) !== sha1(s1.rgba), form + ' strong=1 with strong.inf.json in --in changes the bytes');
      const f0 = await CP.compose(src, bz, mkRow(pv, 'stretch', { marks: 'full' }), Object.assign({}, po, { in: [emptyIn] }));
      fs.unlinkSync(path.join(inDir, 'strong.inf.json'));
      const f1 = await CP.compose(src, bz, mkRow(pv, 'stretch', { marks: 'full' }), Object.assign({}, po, { in: [inDir] }));
      ok(sha1(f0.rgba) !== sha1(f1.rgba), form + ' marks full with routes.json in --in changes the bytes');
      // strong with marks none still draws strong; the backdrop base and the inset never get marks
      const n0 = await CP.compose(src, bz, mkRow(pv, 'stretch', { marks: 'none', strong: true }), Object.assign({}, po, { in: [emptyIn] }));
      ok(sha1(n0.rgba) === sha1(a.rgba), form + ' marks none, strong on, no strong file: picture as with no marks');
    }
  }
  // SP maps: no flags, no spawns -> the camera box, else the pather box, else none (all three games, design 10)
  {
    const B = [-1000, -1000, 1000, 1000];
    const sp = (boxes) => ({ boxes: Object.assign({ world: B }, boxes), modes: [{ id: '0', flags: [], spawns: [] }] });
    const c = CP.actionOf(sp({ camera: [-200, -300, 200, 300], pather: [-900, -900, 900, 900] }), '0');
    ok(c.from === 'camera' && c.box.join() === '-200,-300,200,300', 'SP action box = camera box: ' + JSON.stringify(c));
    const p = CP.actionOf(sp({ camera: null, pather: [-900, -900, 1200, 900] }), '0');
    ok(p.from === 'pather' && p.box.join() === '-900,-900,1000,900', 'SP action box = pather box cut to the world box: ' + JSON.stringify(p));
    const n = CP.actionOf(sp({ camera: null, pather: null }), '0');
    ok(n.box === null && n.from === null, 'SP with no box: none');
    const fr = CP.cropFrame(c.box, B, [2560, 1440], { leftHalf: true });
    ok(fr[2] - fr[0] < B[2] - B[0] && fr[0] <= c.box[0] && fr[0] + (fr[2] - fr[0]) / 2 >= c.box[2], 'goh SP crop on the camera box: smaller than B, A in the left half: ' + fr);
  }
  // drawTitle with a tiny synthetic font: 'A' glyph 3x3 alpha in page 0
  const page = { w: 4, h: 4, rgba: new Uint8Array(64) };
  for (let i = 0; i < 9; i++) page.rgba[((Math.floor(i / 3)) * 4 + (i % 3)) * 4 + 3] = 255;
  const font = { chars: new Map([[65, [65, 0, 0, 3, 3, 0, 0, 4, 0, 8]]]), pages: [page], lineHeight: 4, base: 3 };
  const img = new Uint8ClampedArray(40 * 20 * 4);
  ok(CP.drawTitle(img, 40, 20, 'AA', font) && img.some(v => v === 255), 'title drawn with a synthetic font');
  ok(!CP.drawTitle(new Uint8ClampedArray(1600 * 4), 40, 40, 'AB', font), 'seeded: a glyph the font lacks -> no text');
}

(async () => {
  testTargets();
  testStretch();
  testResample();
  const D = fixtureDocs();
  testSafeAndBoxes(D);
  await testCompose(D);
})().catch(e => ok(false, 'threw: ' + (e && e.stack || e))).then(() => {
  if (fail) { console.log(fail + ' failed, ' + pass + ' passed'); process.exit(1); }
  if (!process.argv[2] || /^--/.test(process.argv[2])) try { fs.rmSync(W, { recursive: true, force: true }); } catch (e) { /* temp */ }
  console.log('PASS mapviz previews compose (' + pass + ')');
});

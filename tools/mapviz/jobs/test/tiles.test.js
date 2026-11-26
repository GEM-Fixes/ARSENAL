// jobs tiles test: levels and tile counts, tiles.cut with a stand-in cutTile and with the real raster cutTile when it
// exists (the test says which ran), tiles.batch (order, missing tiles, the 16 limit), the `jobs tiles` command, and the
// single-exe manifest check (`node tools/dist/sea.js --manifest-only` lists every non-test mapviz file).
// Seeded defects: a picture that is not rgba8, a stand-in that answers a wrong-size tile, a 17-tile batch, a tile name
// that is not x.y, a missing picture.
// usage: node tools/mapviz/jobs/test/tiles.test.js [scratch dir]
// Author: Imperator_Aug (ARSENAL, ia-ade6f466)
'use strict';
const fs = require('fs'), path = require('path'), { spawnSync } = require('../../../lib/test/wait');   // wait.js spawnSync: limit at least 5 min, killed by it -> WAIT and one rerun with twice the limit
const h = require('./harness')('jobs-tiles');
const tiles = require('../tiles');
const cli = require('../cli');
const gridfile = require('../../lib/raster/gridfile');
const png = require('../../lib/raster/png');
const { W, ok, eq, throwsCode } = h;

const MV = path.resolve(__dirname, '..', '..');
const TOOLS = path.resolve(MV, '..');
const MVJS = path.join(MV, 'mapviz.js');

function pic(file, w, hh, etype) {
  const n = etype === 'rgba8' ? 4 : 1;
  const d = etype === 'rgba8' ? new Uint8ClampedArray(w * hh * 4) : new Float32Array(w * hh);
  if (etype === 'rgba8') for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; d[i] = x & 255; d[i + 1] = y & 255; d[i + 2] = (x >> 8) * 40 + (y >> 8) * 80; d[i + 3] = 255; }
  gridfile.write(file, { name: path.basename(file, '.mvg'), w, h: hh, cell: 10, ox: 0, oy: 0, etype, sample: 'cell', scale: 1, offset: 0, nodata: null, meta: {}, data: d });
  return n;
}
// stand-in pair (the test's own copy of the README 5.2 level rule; tiles.js has none): every pixel of tile z/x_y holds (z, x, y, 255)
const stand = (g, z, tx, ty) => { const rgba = new Uint8ClampedArray(256 * 256 * 4); for (let i = 0; i < rgba.length; i += 4) { rgba[i] = z; rgba[i + 1] = tx; rgba[i + 2] = ty; rgba[i + 3] = 255; } return { w: 256, h: 256, rgba }; };
const standLevels = (w, hh) => { const lv = []; for (let z = 0; ; z++) { const wz = Math.ceil(w / Math.pow(2, z)), hz = Math.ceil(hh / Math.pow(2, z)); lv.push({ z, w: wz, h: hz, nx: Math.ceil(wz / 256), ny: Math.ceil(hz / 256) }); if (wz <= 256 && hz <= 256) return { zmax: z, levels: lv }; } };
const S = { cutTile: stand, tileLevels: standLevels };
const px = (file, x, y) => { const p = png.decode(fs.readFileSync(file)); const i = (y * p.w + x) * 4; return [p.rgba[i], p.rgba[i + 1], p.rgba[i + 2], p.rgba[i + 3]]; };

(async () => {
  // ---- levels: tiles.js has no level maths of its own; raster tileLevels answers them ----
  {
    ok(tiles.levels === undefined, 'tiles.js exports no levels() (raster tileLevels is the only level rule)');
    const TL = tiles.rasterTileLevels();
    if (TL) {
      const L = TL(600, 300);
      eq([L.zmax, L.levels.map(l => l.nx + 'x' + l.ny + '@' + l.w + 'x' + l.h)], [2, ['3x2@600x300', '2x1@300x150', '1x1@150x75']], 'raster tileLevels(600, 300): zmax 2, tiles 3x2, 2x1, 1x1');
      eq(TL(1000, 3000), standLevels(1000, 3000), 'the stand-in levels match raster tileLevels');
    } else h.skip('raster tileLevels: lib/raster/index.js has no tileLevels (the stand-in pair ran)');
  }

  // ---- cut with a stand-in ----
  const P = path.join(W, 'pic.t.mvg');
  pic(P, 600, 300, 'rgba8');
  {
    const out = path.join(W, 'tiles', 't');
    const steps = [];
    const prog = { stage: (s, n) => steps.push(s + ':' + n), step: () => steps.push('+') };
    const r = tiles.cut(P, out, Object.assign({}, S, { progress: prog }));
    eq([r.zmax, r.count], [2, 9], 'stand-in cut: 6 + 2 + 1 tiles');
    ok(fs.existsSync(path.join(out, '0', '2_1.png')) && fs.existsSync(path.join(out, '1', '1_0.png')) && fs.existsSync(path.join(out, '2', '0_0.png')), 'tiles written as <z>/<x>_<y>.png');
    eq(px(path.join(out, '0', '2_1.png'), 7, 7), [0, 2, 1, 255], 'each PNG holds what cutTile answered');
    eq([steps[0], steps.filter(s => s === '+').length], ['tiles:9', 9], 'progress: one stage, a step per tile');
    const z1 = path.join(W, 'tiles', 'z1');
    eq(tiles.cut(P, z1, Object.assign({}, S, { z: 1 })).count, 2, '--z 1 cuts one level');
    ok(!fs.existsSync(path.join(z1, '0')) && fs.existsSync(path.join(z1, '1', '1_0.png')), 'only that level is written');
    eq(tiles.cut(P, path.join(W, 'tiles', 'all'), Object.assign({}, S, { z: 'all' })).count, 9, '--z all');
    const one = path.join(W, 'tiles', 'one');
    eq(tiles.cut(P, one, Object.assign({}, S, { tileLevels: () => ({ zmax: 0, levels: [{ z: 0, w: 600, h: 300, nx: 1, ny: 1 }] }) })).count, 1, 'the level list comes from tileLevels: a one-tile answer cuts one tile');
    throwsCode(() => tiles.cut(P, out, Object.assign({}, S, { z: 3 })), 'MV_USAGE', '--z past zmax');
    throwsCode(() => tiles.cut(P, out, Object.assign({}, S, { z: 'x' })), 'MV_USAGE', '--z not a number');
    throwsCode(() => tiles.cut(P, out, Object.assign({}, S, { cutTile: () => ({ w: 128, h: 128, rgba: new Uint8ClampedArray(128 * 128 * 4) }) })), 'MV_FAULT', 'seeded defect: cutTile answers a 128 x 128 tile');
    throwsCode(() => tiles.cut(P, out, Object.assign({}, S, { tileLevels: () => ({ zmax: 1, levels: [] }) })), 'MV_FAULT', 'seeded defect: tileLevels answers no level list');
    throwsCode(() => tiles.cut(path.join(W, 'none.mvg'), out, S), 'MV_NOT_FOUND', 'seeded defect: a missing picture');
    const F = path.join(W, 'pic.h.mvg');
    pic(F, 50, 50, 'f32');
    throwsCode(() => tiles.cut(F, out, S), 'MV_USAGE', 'seeded defect: a picture that is not rgba8');
    const J = path.join(W, 'pic.junk.mvg');
    fs.writeFileSync(J, 'not a grid');
    throwsCode(() => tiles.cut(J, out, S), 'MV_USAGE', 'seeded defect: a picture file that is not a grid file');
  }

  // ---- cut with the real raster cutTile ----
  const real = tiles.rasterCutTile();
  if (real) {
    const out = path.join(W, 'tiles', 'real');
    const t0 = Date.now();
    const r = tiles.cut(P, out, {});
    h.note('real cutTile: ' + r.count + ' tiles of a 600 x 300 picture in ' + (Date.now() - t0) + ' ms');
    eq([r.zmax, r.count], [2, 9], 'raster cutTile ran: 9 tiles');
    // tile 0.0 at z 0: top-left pixel = picture row h - 1 (north on top), column 0
    eq(px(path.join(out, '0', '0_0.png'), 0, 0), [0, 299 & 255, 80, 255], 'tile 0.0 row 0 is the picture top row (y = h - 1)');
    // tile 2.1 covers columns 512..599 and level rows 43..0 (300 - 256 = 44 rows), so picture x 599, y 0 is tile pixel 87, 43
    eq(px(path.join(out, '0', '2_1.png'), 87, 43), [599 & 255, 0, 80, 255], 'tile 2.1 holds the picture corner x 599, y 0');
    const e = px(path.join(out, '0', '2_1.png'), 200, 0);
    eq(e[3], 0, 'outside the picture the tile is clear');
  } else {
    h.skip('tiles.cut with the real raster cutTile: lib/raster/index.js has no cutTile (the stand-in ran)');
  }

  // ---- batch ----
  {
    const d = path.join(W, 'tiles', 't');
    const b = tiles.batch(d, 0, ['1.0', '9.9', '0.1']);
    eq(b.map(x => x.t + (x.missing ? ':missing' : ':png')), ['1.0:png', '9.9:missing', '0.1:png'], 'batch keeps the asked order and marks missing tiles');
    ok(Buffer.from(b[0].png, 'base64').equals(fs.readFileSync(path.join(d, '0', '1_0.png'))), 'png is the tile file as base64');
    eq(tiles.batch(d, '2', '0.0').length, 1, 'list as a string, z as a string');
    eq(tiles.batch(d, 1, '0.0,1.0').map(x => !!x.png), [true, true], 'comma list');
    eq(tiles.batch(path.join(W, 'nowhere'), 0, ['0.0']), [{ t: '0.0', missing: true }], 'a tile set that does not exist answers missing');
    const many = Array.from({ length: 17 }, (_, i) => i + '.0');
    throwsCode(() => tiles.batch(d, 0, many), 'MV_USAGE', 'seeded defect: 17 tiles in one batch');
    eq(tiles.batch(d, 0, many.slice(0, 16)).length, 16, '16 tiles is allowed');
    throwsCode(() => tiles.batch(d, 0, ['a.b']), 'MV_USAGE', 'seeded defect: a tile name that is not x.y');
    throwsCode(() => tiles.batch(d, 0, ['../0.0']), 'MV_USAGE', 'a tile name with a path is refused');
    throwsCode(() => tiles.batch(d, -1, ['0.0']), 'MV_USAGE', 'a negative z');
    throwsCode(() => tiles.batch(d, 0, 5), 'MV_USAGE', 'a list that is not a list');
  }

  // ---- the jobs tiles command ----
  {
    const out = path.join(W, 'cmd', 'tiles', 't');
    if (real) {
      const r = spawnSync(process.execPath, [MVJS, 'jobs', 'tiles', '--in', P, '--out', out, '-q'], { encoding: 'utf8', windowsHide: true, timeout: 60000 });
      ok(r.status === 0 && fs.existsSync(path.join(out, '2', '0_0.png')), 'mapviz jobs tiles --in pic --out dir: exit 0, tiles written (' + r.status + ' ' + r.stderr.trim() + ')');
    } else {
      h.skip('mapviz jobs tiles end to end: raster cutTile not built');
      const r = spawnSync(process.execPath, [MVJS, 'jobs', 'tiles', '--in', P, '--out', out, '-q'], { encoding: 'utf8', windowsHide: true, timeout: 60000 });
      ok(r.status === 4, 'without raster cutTile: exit 4 MV_NOT_BUILT (' + r.status + ')');
    }
    const m = spawnSync(process.execPath, [MVJS, 'jobs', 'tiles', '--in', path.join(W, 'none.mvg'), '--out', out, '-q'], { encoding: 'utf8', windowsHide: true, timeout: 60000 });
    ok(m.status === 3, 'jobs tiles with a missing --in file: exit 3 (' + m.status + ' ' + m.stderr.trim() + ')');
    throwsCode(() => cli.run(['tiles', '--out', out]), 'MV_USAGE', 'jobs tiles without --in');
  }

  // ---- the single-exe manifest ----
  {
    const md = path.join(W, 'sea');
    const r = spawnSync(process.execPath, [path.join(TOOLS, 'dist', 'sea.js'), '--manifest-only', '--out', md], { encoding: 'utf8', windowsHide: true, timeout: 120000 });
    if (r.status !== 0) ok(false, 'sea.js --manifest-only ran (' + r.status + ' ' + r.stderr.trim() + ')');
    else {
      const keys = new Set(JSON.parse(fs.readFileSync(path.join(md, 'manifest.json'), 'utf8')));
      // the exe's own rules, read from sea.js (folders it skips, files it leaves out), not copied
      const sea = require(path.join(TOOLS, 'dist', 'sea.js'));
      ok(sea.SKIP instanceof Set && sea.SKIPFILE instanceof RegExp, 'sea.js exports SKIP and SKIPFILE');
      const want = [], cannot = [], skipped = [];
      (function walk(dir, rel) {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          if (e.isDirectory()) {
            if (e.name === 'test') continue;                                  // a part's own test/ folder (README 9.1)
            if (sea.SKIP.has(e.name)) { skipped.push('mapviz/' + rel + e.name + '/'); continue; }
            walk(path.join(dir, e.name), rel + e.name + '/');
            continue;
          }
          if (sea.SKIPFILE.test(e.name)) continue;                             // REPORT.json, package.json: not tool code
          if (/\.(js|json|txt|yaml|md|set)$/.test(e.name)) want.push('mapviz/' + rel + e.name);
          else if (e.name !== '.gitkeep') cannot.push('mapviz/' + rel + e.name);
        }
      })(MV, '');
      const missing = want.filter(k => !keys.has(k));
      ok(want.length > 0 && missing.length === 0, 'the exe manifest lists every non-test mapviz file (' + want.length + ' files' + (missing.length ? '; missing ' + missing.join(' ') : '') + ')');
      for (const f of ['mapviz/jobs/index.js', 'mapviz/jobs/cache.js', 'mapviz/jobs/pool.js', 'mapviz/jobs/tiles.js', 'mapviz/jobs/table.js', 'mapviz/jobs/cli.js', 'mapviz/jobs/kprobe.js'])
        ok(keys.has(f), 'manifest has ' + f);
      ok(![...keys].some(k => /^mapviz\/(.*\/)?test\//.test(k) || /^mapviz\/(.*\/)?REPORT[^/]*\.json$/.test(k)), 'no mapviz test file or REPORT in the manifest');
      ok(cannot.length === 0, 'every non-test mapviz file has a kind the exe embeds (js, json, txt, yaml, md, set; README 9.1)' + (cannot.length ? ': not ' + cannot.join(' ') : ''));
      ok(skipped.length === 0, 'no mapviz folder has a name the exe build skips, other than test (README 9.1)' + (skipped.length ? ': ' + skipped.join(' ') : ''));
      h.note('manifest: ' + want.length + ' mapviz files listed');
    }
  }
  h.end();
})().catch(e => { console.log('FAIL mapviz jobs-tiles: ' + (e && e.stack || e)); process.exit(1); });

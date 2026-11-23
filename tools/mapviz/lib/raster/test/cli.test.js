// raster cli test: the four commands through tools/mapviz/mapviz.js (terrain, topo, info, png) on a grids folder this
// test makes from the fixture, same bytes on a second run, the seeded defects (a missing input: exit 3; a wrong sample
// kind and NaN heights: exit 2 with RASTER_SAMPLE / RASTER_NAN; bad flags: exit 2), cli version = index VERSION, and two
// optional checks: mapkit grids of the fixture install (skipped while mapkit is absent or not ready) and real installs
// (skipped when absent or MAPVIZ_NO_GAME=1).
// usage: node tools/mapviz/lib/raster/test/cli.test.js [scratch dir]
// Author: Imperator_Aug (ARSENAL, ia-e41a6b5e)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto'), cp = require('child_process');

const W = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'mapviz-raster-cli-')));
fs.mkdirSync(W, { recursive: true });
process.env.ARSENAL_CACHE = process.env.ARSENAL_CACHE || path.join(W, 'cache');

const R = require('../index');
const CLI = require('../cli');
const GF = require('../gridfile');
const PNG = require('../png');
const FX = require('../../../test/fxmake');
const MAPVIZ = path.resolve(__dirname, '..', '..', '..', 'mapviz.js');

let pass = 0, fail = 0;
function ok(c, what) { if (c) pass++; else { fail++; console.log('FAIL mapviz raster-cli: ' + what); } }
const sha1 = b => crypto.createHash('sha1').update(b).digest('hex');
function mv(args) {
  const r = cp.spawnSync(process.execPath, [MAPVIZ].concat(args), { encoding: 'utf8', env: Object.assign({}, process.env), timeout: 120000 });
  return { code: r.status, out: r.stdout || '', err: r.stderr || '' };
}
function fixture(form) {
  const F = FX.SPEC.forms[form];
  const g = R.make({ name: 'height', w: F.w, h: F.h, cell: F.cell, ox: -FX.SPEC.offX, oy: -FX.SPEC.offY, etype: 'i16', sample: 'lattice', meta: { unit: 'u', upm: 20 } });
  for (let j = 0; j < F.h; j++) for (let i = 0; i < F.w; i++) g.data[j * F.w + i] = FX.cellRecord(form, i, j).h;
  return g;
}
const exists = (d, names) => names.filter(n => !fs.existsSync(path.join(d, n)));

// ---- 1. the part table entry ----
{
  ok(CLI.part === 'raster' && CLI.version === R.VERSION, 'cli part raster, version = index VERSION (' + CLI.version + ')');
  ok(['terrain', 'topo', 'info', 'png'].every(c => CLI.commands[c] && CLI.commands[c].args && CLI.commands[c].summary), 'cli commands terrain, topo, info, png with args and summary');
  const p = mv(['parts', '--json']);
  const row = p.code === 0 ? JSON.parse(p.out).parts.find(r => r.part === 'raster') : null;
  ok(row && row.id === 'MV-RAS' && row.state === 'built', 'mapviz parts: raster MV-RAS built (' + (row && row.state) + ')');
}

// ---- 2. terrain and topo on a grids folder ----
const grids = path.join(W, 'grids'), out = path.join(W, 'out'), out2 = path.join(W, 'out2');
fs.mkdirSync(grids, { recursive: true });
const height = fixture('as2');
GF.write(path.join(grids, 'height.mvg'), height);
{
  let r = mv(['raster', 'terrain', '--in', grids, '--out', out, '--json']);
  ok(r.code === 0, 'terrain exit 0 (' + r.code + ' ' + r.err.trim() + ')');
  const names = ['slopecls.mvg', 'shade.mvg', 'landform.r10.mvg', 'landform.r50.mvg', 'reads.json'];
  ok(!exists(out, names).length, 'terrain writes ' + names.join(', ') + ' (missing ' + exists(out, names) + ')');
  let j = null; try { j = JSON.parse(r.out); } catch (e) { j = null; }
  ok(j && j.v === 1 && j.files.length === 4, 'terrain --json answer {v:1, out, files}');
  const s = GF.read(path.join(out, 'slopecls.mvg'));
  ok(sha1(Buffer.from(s.data)) === sha1(Buffer.from(R.slopeClass(height).data)) && s.data[48 * 128 + 39] === 5, 'slopecls.mvg = the library (cell 39,48 class 5)');
  const reads = JSON.parse(fs.readFileSync(path.join(out, 'reads.json'), 'utf8'));
  ok(reads.v === 1 && Array.isArray(reads.inputs), 'reads.json {v:1, inputs}');
  const first = names.slice(0, 4).map(n => sha1(fs.readFileSync(path.join(out, n))));
  r = mv(['raster', 'terrain', '--in', grids, '--out', out2]);
  ok(r.code === 0 && names.slice(0, 4).every((n, k) => sha1(fs.readFileSync(path.join(out2, n))) === first[k]), 'terrain: the same bytes on a second run');

  r = mv(['raster', 'topo', '--in', grids, '--out', out, '--size', '64', '--json']);
  ok(r.code === 0, 'topo exit 0 (' + r.code + ' ' + r.err.trim() + ')');
  const tn = ['pic.topo.mvg', 'pic.topo.json', 'contours.json', 'reads.json'];
  ok(!exists(out, tn).length, 'topo writes ' + tn.join(', '));
  const side = JSON.parse(fs.readFileSync(path.join(out, 'pic.topo.json'), 'utf8')), pic = GF.read(path.join(out, 'pic.topo.mvg'));
  ok(side.layer === 'pic.topo' && side.w === 64 && side.h === 48 && pic.w === 64 && pic.etype === 'rgba8' && side.rowOrder === 'minY-first', 'pic.topo 64 x 48 rgba8 with its sidecar');
  const vec = JSON.parse(fs.readFileSync(path.join(out, 'contours.json'), 'utf8'));
  ok(vec.v === 1 && vec.kind === 'vector' && vec.name === 'contours' && vec.items.some(t => t.kind === 'contour'), 'contours.json is a vector product');
  // the topo picture does not change when contours change: it is tint x shade only
  const lib = R.topo(height, { size: 64, shade: GF.read(path.join(out, 'shade.mvg')) });
  ok(Buffer.compare(Buffer.from(lib.grid.data), Buffer.from(pic.data)) === 0, 'pic.topo = tint x shade of the library (no contours baked in)');
  r = mv(['raster', 'topo', '--in', grids, '--out', out2]);
  ok(r.code === 0 && GF.read(path.join(out2, 'pic.topo.mvg')).w === 128, 'topo without --size: 1 px per cell (128)');
  // a bare grids folder: no target, no stack, the height file's hash only
  const hsha = sha1(fs.readFileSync(path.join(grids, 'height.mvg')));
  ok(side.target === null && side.stackHash === null && side.mapHashes && side.mapHashes['height.mvg'] === hsha, 'pic.topo sidecar of a bare folder: target null, stackHash null, mapHashes height.mvg');
}

// ---- 2b. the pic.topo sidecar from the doc and grids entries (README 4.4); progress lines of topo ----
{
  const ent = path.join(W, 'gridsEntry'), docDir = path.join(W, 'docEntry'), o8 = path.join(W, 'o8'), prog = path.join(W, 'topo.progress');
  fs.mkdirSync(ent, { recursive: true }); fs.mkdirSync(docDir, { recursive: true });
  GF.write(path.join(ent, 'height.mvg'), height);
  fs.writeFileSync(path.join(ent, 'grids.json'), JSON.stringify({ v: 1, map: 'multi/fx', mode: null, w: 0, files: ['height.mvg'], notes: [], mapHashes: { map: 'a'.repeat(40) } }));
  fs.writeFileSync(path.join(ent, 'manifest.json'), JSON.stringify({ v: 1, part: 'mapkit', target: 'mowas2', mods: ['m1'], modDirs: [] }));
  fs.writeFileSync(path.join(docDir, 'mapdoc.json'), JSON.stringify({ v: 1, game: 'goh', key: 'multi/fx', stack: { mods: ['m2'], hash: 'b'.repeat(40) } }));
  let r = mv(['raster', 'topo', '--in', docDir, '--in', ent, '--out', o8, '--progress', prog]);
  const side = r.code === 0 ? JSON.parse(fs.readFileSync(path.join(o8, 'pic.topo.json'), 'utf8')) : {};
  const mh = side.mapHashes || {};
  ok(r.code === 0 && side.target === 'goh' && side.stackHash === 'b'.repeat(40), 'pic.topo sidecar: target and stackHash of the map doc (' + side.target + ', ' + side.stackHash + ')');
  ok(mh.map === 'a'.repeat(40) && mh['height.mvg'] === sha1(fs.readFileSync(path.join(ent, 'height.mvg'))), 'pic.topo sidecar: mapHashes of grids.json plus height.mvg');
  const lines = fs.existsSync(prog) ? fs.readFileSync(prog, 'utf8').trim().split('\n').map(l => JSON.parse(l)) : [];
  const pic = lines.filter(l => l.stage === 'picture');
  ok(pic.length >= 1 && pic.every(l => l.total === 3000 && l.done >= 0 && l.done <= l.total), 'topo --progress: stage picture over 3000 (' + pic.length + ' lines)');
  // a doc of another map is not used: the grids entry manifest gives target and stack
  fs.writeFileSync(path.join(docDir, 'mapdoc.json'), JSON.stringify({ v: 1, game: 'goh', key: 'multi/other', stack: { mods: [], hash: 'c'.repeat(40) } }));
  const o9 = path.join(W, 'o9');
  r = mv(['raster', 'topo', '--in', docDir, '--in', ent, '--out', o9]);
  const s2 = r.code === 0 ? JSON.parse(fs.readFileSync(path.join(o9, 'pic.topo.json'), 'utf8')) : {};
  let want = null;
  try { want = require('../../mapkit/source').stackHash(['m1'], []); } catch (e) { want = null; }
  ok(r.code === 0 && s2.target === 'mowas2' && s2.stackHash === want, 'pic.topo sidecar: a doc of another map is skipped; the manifest gives target and stackHash (' + s2.target + ')');
}

// ---- 3. info and png ----
{
  let r = mv(['raster', 'info', path.join(grids, 'height.mvg'), '--json']);
  let j = null; try { j = JSON.parse(r.out); } catch (e) { j = null; }
  ok(r.code === 0 && j && j.w === 128 && j.h === 96 && j.etype === 'i16' && j.sample === 'lattice' && j.min === -200 && j.max === 60, 'info --json: header and min -200, max 60');
  r = mv(['raster', 'info', path.join(out, 'pic.topo.mvg')]);
  ok(r.code === 0 && /etype\trgba8/.test(r.out) && /channels/.test(r.out), 'info text on an rgba8 grid');
  // the header nodata stays the value read, the count of nodata cells is a separate field
  ok(j && j.nodata === null && j.nodataCount === 0, 'info --json on a grid with no nodata: nodata null, nodataCount 0 (' + (j && j.nodata) + ')');
  const wd = R.make({ name: 'water.depth', w: 4, h: 3, cell: 10, ox: 0, oy: 0, etype: 'i16', sample: 'cell', nodata: -32768, meta: { unit: 'u', upm: 20 } });
  for (let k = 0; k < 12; k++) wd.data[k] = k * 10;
  wd.data[1] = wd.data[7] = -32768;
  const wf = path.join(W, 'wd.mvg');
  GF.write(wf, wd);
  r = mv(['raster', 'info', wf, '--json']);
  j = null; try { j = JSON.parse(r.out); } catch (e) { j = null; }
  ok(r.code === 0 && j && j.nodata === -32768 && j.nodataCount === 2 && j.count === 10 && j.min === 0 && j.max === 110,
    'info --json with nodata -32768 and 2 nodata cells: nodata -32768, nodataCount 2, count 10 (' + r.out.trim() + ')');
  r = mv(['raster', 'info', wf]);
  ok(r.code === 0 && (r.out.match(/^nodata\t/gm) || []).length === 1 && /^nodata\t-32768$/m.test(r.out) && /^nodataCount\t2$/m.test(r.out),
    'info text: one nodata row (-32768) and nodataCount 2');
  const pf = path.join(W, 'png', 'slope.png');
  fs.mkdirSync(path.dirname(pf), { recursive: true });
  r = mv(['raster', 'png', path.join(out, 'slopecls.mvg'), '--out', pf]);
  ok(r.code === 0 && fs.existsSync(pf), 'png writes the file (' + r.code + ' ' + r.err.trim() + ')');
  const hd = fs.existsSync(pf) ? PNG.header(fs.readFileSync(pf)) : null;
  ok(hd && hd.w === 128 && hd.h === 96, 'png header 128 x 96');
  const dec = fs.existsSync(pf) ? PNG.decode(fs.readFileSync(pf)) : null;
  const want = R.render(R.slopeClass(height));
  ok(dec && Buffer.compare(Buffer.from(dec.rgba || dec.data), Buffer.from(want.data)) === 0, 'png pixels = render(slopecls), row 0 = min world y');
  r = mv(['raster', 'png', path.join(grids, 'height.mvg'), '--out', path.join(W, 'png', 'h.png')]);
  ok(r.code === 0, 'png of a height grid (tinted)');
}

// ---- 4. seeded defects ----
{
  const empty = path.join(W, 'empty');
  fs.mkdirSync(empty, { recursive: true });
  let r = mv(['raster', 'terrain', '--in', empty, '--out', path.join(W, 'o3')]);
  ok(r.code === 3, 'terrain with no height.mvg: exit 3 (' + r.code + ')');
  r = mv(['raster', 'topo', '--in', empty, '--out', path.join(W, 'o3'), '--json']);
  ok(r.code === 3 && /MV_NOT_FOUND/.test(r.out + r.err), 'topo with no height.mvg: exit 3, MV_NOT_FOUND');
  r = mv(['raster', 'info', path.join(W, 'none.mvg')]);
  ok(r.code === 3, 'info on an absent file: exit 3');
  r = mv(['raster', 'png', path.join(W, 'none.mvg'), '--out', path.join(W, 'x.png')]);
  ok(r.code === 3, 'png of an absent file: exit 3');
  const bad = path.join(W, 'bad-sample');
  fs.mkdirSync(bad, { recursive: true });
  GF.write(path.join(bad, 'height.mvg'), Object.assign({}, height, { sample: 'cell' }));
  r = mv(['raster', 'terrain', '--in', bad, '--out', path.join(W, 'o4'), '--json']);
  ok(r.code === 2 && /RASTER_SAMPLE/.test(r.out + r.err), 'a cell-sampled height: exit 2, RASTER_SAMPLE (' + r.code + ')');
  const nanDir = path.join(W, 'bad-nan');
  fs.mkdirSync(nanDir, { recursive: true });
  const nh = R.make({ name: 'height', w: 8, h: 8, cell: 10, ox: 0, oy: 0, etype: 'f32', sample: 'lattice' });
  nh.data[9] = NaN;
  GF.write(path.join(nanDir, 'height.mvg'), nh);
  r = mv(['raster', 'topo', '--in', nanDir, '--out', path.join(W, 'o5'), '--json']);
  ok(r.code === 2 && /RASTER_NAN/.test(r.out + r.err), 'NaN heights: exit 2, RASTER_NAN (' + r.code + ')');
  ok(mv(['raster', 'terrain', '--out', path.join(W, 'o6')]).code === 2, 'terrain without --in: exit 2');
  ok(mv(['raster', 'terrain', '--in', grids]).code === 2, 'terrain without --out: exit 2');
  ok(mv(['raster', 'png', path.join(grids, 'height.mvg')]).code === 2, 'png without --out: exit 2');
  ok(mv(['raster', 'png', path.join(grids, 'height.mvg'), '--out', path.join(W, 'x.jpg')]).code === 2, 'png --out not a .png: exit 2');
  ok(mv(['raster', 'nope']).code === 2, 'an unknown command: exit 2');
  ok(mv(['raster', 'topo', '--in', grids, '--out', path.join(W, 'o7'), '--size', '8']).code === 2, 'topo --size 8: exit 2');
  const junk = path.join(W, 'junk');
  fs.mkdirSync(junk, { recursive: true });
  fs.writeFileSync(path.join(junk, 'height.mvg'), 'not a grid');
  r = mv(['raster', 'terrain', '--in', junk, '--out', path.join(W, 'o8'), '--json']);
  ok(r.code === 2 && /GRIDFILE_/.test(r.out + r.err), 'a file that is not a grid: exit 2, GRIDFILE_* (' + r.code + ')');
}

// ---- 5. optional: mapkit grids of the fixture install (wave A part MV-KIT) ----
{
  let mk = null, why = '';
  try { mk = require('../../mapkit/index'); } catch (e) { why = 'mapkit index absent (' + (e.code || e.message) + ')'; }
  if (mk && (typeof mk.source !== 'function' || typeof mk.grids !== 'function')) { why = 'mapkit has no source/grids yet'; mk = null; }
  if (!mk) console.log('skip mapkit cross-check: ' + why);
  else {
    let g = null;
    try {
      const inst = FX.make(path.join(W, 'fxgame'), { form: 'as2' });
      const src = mk.source({ target: inst.target, game: inst.gameDir, mods: [], modDirs: [] });
      g = mk.grids(src, inst.map, {}).height;
    } catch (e) { console.log('skip mapkit cross-check: mapkit grids failed (' + (e.code || '') + ' ' + e.message + ')'); }
    if (g) {
      const s = R.slopeClass(g);
      ok(s.data[48 * g.w + 39] === 5 && s.data[48 * g.w + 64] === 0, 'mapkit height of the fixture: slopecls (39,48) 5, (64,48) 0');
      ok(g.sample === 'lattice' && g.w === 128 && g.h === 96, 'mapkit height is a 128 x 96 lattice');
    }
  }
}

// ---- 6. optional: real installs (read through gamedir + vfs + mapnet only) ----
if (process.env.MAPVIZ_NO_GAME === '1') console.log('skip real installs: MAPVIZ_NO_GAME=1');
else {
  const LIB = path.resolve(__dirname, '..', '..', '..', '..', 'lib');
  const gd = require(path.join(LIB, 'gamedir')), vfs = require(path.join(LIB, 'vfs')), mapnet = require(path.join(LIB, 'mapnet'));
  const games = [];
  try { const r = gd.resolve({}); if (r && r.dir) games.push({ name: 'mowas2', dir: r.dir, exe: 'mowas_2', key: 'resource/map/multi/1v1_road/map.net' }); } catch (e) { /* absent */ }
  try { const d = gd.goh({}); if (d) games.push({ name: 'goh', dir: d, exe: 'goh', key: null }); } catch (e) { /* absent */ }
  if (!games.length) console.log('skip real installs: none found');
  for (const G of games) {
    let m = null, key = G.key;
    try {
      const v = vfs.build({ gameDir: G.dir, exe: G.exe, mods: [] });
      if (!key || !v.files.get(key)) key = [...v.files.keys()].filter(k => /^resource\/map\/multi\/[^/]+\/map\.net$/.test(k)).sort()[0];
      m = key ? mapnet.parse(vfs.readRec(v.files.get(key))) : null;
    } catch (e) { console.log('skip real ' + G.name + ': ' + e.message); }
    if (!m) { console.log('skip real ' + G.name + ': no multi map.net'); continue; }
    const n = 200, i0 = Math.max(0, (m.width >> 1) - 100), j0 = Math.max(0, (m.height >> 1) - 100), w = Math.min(n, m.width - i0), h = Math.min(n, m.height - j0);
    const g = R.make({ name: 'height', w, h, cell: m.cell, ox: i0 * m.cell - m.offX, oy: j0 * m.cell - m.offY, etype: 'i16', sample: 'lattice', meta: { unit: 'u', upm: 20 } });
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) g.data[j * w + i] = mapnet.cellAt(m, i0 + i, j0 + j).height;
    const s = R.slopeClass(g), hAt = (i, j) => g.data[j * w + i];
    let d = 0;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (s.data[j * w + i] !== FX.slopeClass(hAt, w, h, g.cell, i, j)) d++;
    ok(d === 0, 'real ' + G.name + ' ' + key.split('/')[3] + ' (' + w + ' x ' + h + ' window): slopecls = the fxmake port in every cell (' + d + ' differ)');
    const c = R.contours(g), t = R.topo(g, { made: 'x' });
    ok([0.5, 1, 2, 5].indexOf(c.interval) >= 0 && t.grid.w === w, 'real ' + G.name + ': contours (interval ' + c.interval + ', ' + c.lines.length + ' lines) and topo run');
  }
}

if (fail) { console.log('FAIL mapviz raster-cli: ' + fail + ' of ' + (pass + fail) + ' checks failed'); process.exit(1); }
console.log('PASS mapviz raster-cli (' + pass + ')');
// a temp folder this run made (no folder given) goes when every check passed; a failed run keeps it to look at
if (!process.argv[2]) { try { fs.rmSync(W, { recursive: true, force: true }); } catch (e) { /* the OS clears its temp folder */ } }

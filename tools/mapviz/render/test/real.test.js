// render real-install test (MV-R1, MV-R2 l2): per installed game, `mapviz render l0` and `render l1` on one real multiplayer map
// (MoW:AS2 and AS64 multi/1v1_road, GoH multi/1v1_balzerweg), each turned into a PNG with `mapviz raster png`, then
// `render c0` on MoW:AS2 1v1_road with its numbers printed. Prints the times, the texture count and the PNG paths (look
// at them: north up, no seams, roads where the minimap has them). Pictures and numbers are not pinned (texture data
// and the raster shade may change); the checks are exits, sizes, coverage and sidecar fields. Then GoH multi/1v1_riverbank
// l1 in process with both detail rules: the regular 341.33 u weave (folded luminance) must drop with the map rule.
// l2 (R2a): `render l2 --in` the l1 folder on each map (GoH: the ocean cut by map.omask), and MoW:AS2 multi/1v1_winter_harbor
// for its water entity planes; checks are exits, sidecar counts, kinds and that ground pixels keep the l1 bytes.
// Skipped per game when the install is absent; MAPVIZ_NO_GAME=1 skips everything (no folder is made). Installs are read
// through vfs only. Without a scratch dir the test makes one under the temp folder and deletes it on PASS (about 6 MB of
// pictures); MAPVIZ_RENDER_KEEP=1 keeps it to look at. A scratch dir given on the command line is always kept.
//   MAPVIZ_RENDER_SIZE=<px> (default 1024)
// usage: node tools/mapviz/render/test/real.test.js [scratch dir]
// Author: Imperator_Aug (ARSENAL, ia-7f1b8f67)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), { spawnSync } = require('child_process');

const MVJS = path.resolve(__dirname, '../../mapviz.js');
const SIZE = Number(process.env.MAPVIZ_RENDER_SIZE) || 1024;
let pass = 0, fail = 0;
function ok(c, what) { if (c) pass++; else { fail++; console.log('FAIL mapviz render: ' + what); } }

function installs() {
  if (process.env.MAPVIZ_NO_GAME === '1') return {};
  const gd = require('../../../lib/gamedir');
  const out = {};
  let as2 = null;
  try { const r = gd.resolve({}); as2 = r && r.dir && fs.existsSync(path.join(r.dir, 'resource', 'map.pak')) ? r.dir : null; } catch (e) { as2 = null; }
  let goh = null;
  try { const g = gd.goh(); goh = g && fs.existsSync(path.join(g, 'resource', 'map', 'multi.pak')) ? g : null; } catch (e) { goh = null; }
  if (as2) { out.mowas2 = as2; out.as64 = as2; }
  if (goh) out.goh = goh;
  return out;
}

function cli(args) {
  const t = Date.now();
  const r = spawnSync(process.execPath, [MVJS].concat(args), { encoding: 'utf8', env: Object.assign({}, process.env), timeout: 600000 });
  return { code: r.status, out: r.stdout || '', err: (r.stderr || '').trim(), s: (Date.now() - t) / 1000 };
}
const json = s => { try { return JSON.parse(s); } catch (e) { return null; } };

const MAPS = { mowas2: 'multi/1v1_road', as64: 'multi/1v1_road', goh: 'multi/1v1_balzerweg' };

const have = installs();
const targets = Object.keys(MAPS).filter(t => have[t]);
if (!targets.length) {
  console.log('skip: ' + (process.env.MAPVIZ_NO_GAME === '1' ? 'MAPVIZ_NO_GAME=1' : 'no MoW:AS2 / AS64 / GoH install found'));
  console.log('PASS mapviz render real (0, skipped)');
  process.exit(0);
}
for (const t of Object.keys(MAPS)) if (!have[t]) console.log('skip ' + t + ': no install');

const OWN = !process.argv[2] && process.env.MAPVIZ_RENDER_KEEP !== '1';
const W = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'mapviz-render-real-')));
fs.mkdirSync(W, { recursive: true });
{
  const c = process.env.ARSENAL_CACHE;
  process.env.ARSENAL_CACHE = c && path.resolve(c).startsWith(W + path.sep) ? c : path.join(W, 'cache');
}

for (const t of targets) {
  const key = MAPS[t];
  const base = ['--target', t, '--game', have[t], '--map', key];
  for (const rung of ['l0', 'l1']) {
    const out = path.join(W, t + '-' + rung);
    const r = cli(['render', rung].concat(base, ['--size', String(SIZE), '--out', out, '--json']));
    const sc = json(fs.existsSync(path.join(out, 'pic.' + rung + '.json')) ? fs.readFileSync(path.join(out, 'pic.' + rung + '.json'), 'utf8') : 'null');
    ok((r.code === 0 || r.code === 1) && sc, t + ' ' + key + ' ' + rung + ': exit 0 or 1, got ' + r.code + ' ' + r.err.slice(-300));
    if (!sc) continue;
    ok(Math.max(sc.w, sc.h) === SIZE && sc.rung === rung && sc.target === t && sc.rowOrder === 'minY-first', t + ' ' + rung + ' sidecar: ' + sc.w + 'x' + sc.h);
    if (rung === 'l1') {
      ok(!sc.gaps.includes('RENDER_UNCOVERED'), t + ' l1: every pixel inside the mesh is covered');
      ok(t === 'goh' ? sc.brightness === 'unverified' : sc.brightness === 'fitted', t + ' l1 brightness ' + sc.brightness);
      const body = json(r.out) || {};
      const st = body.stats || {};
      ok(sc.detail === 'map' && sc.keep === st.keep && JSON.stringify(sc.detailTextures) === JSON.stringify(st.detailTextures) && sc.detailChanged === st.detailChanged &&
        sc.detailChanged === sc.detailTextures.length > 0 && sc.detailTextures.every(x => x.k < 1 && !/^[a-z]:|^[\\/]{2}/i.test(x.name)),
        t + ' l1 sidecar detail fields = cli --json stats (keep ' + sc.keep + ', ' + (sc.detailTextures || []).length + ' textures changed)');
      console.log(t + ' ' + key + ' l1 ' + sc.w + 'x' + sc.h + ': ' + r.s.toFixed(1) + ' s (process, no pool), textures ' +
        JSON.stringify(body.stats ? { parts: body.stats.parts, triangles: body.stats.triangles, textures: body.stats.textures, read: body.stats.texturesRead } : null) +
        ', gaps ' + JSON.stringify(sc.gaps));
    } else console.log(t + ' ' + key + ' l0 ' + sc.w + 'x' + sc.h + ': ' + r.s.toFixed(1) + ' s, gaps ' + JSON.stringify(sc.gaps));
    const png = path.join(W, t + '-' + rung + '.png');
    const p = cli(['raster', 'png', path.join(out, 'pic.' + rung + '.mvg'), '--out', png]);
    ok(p.code === 0 && fs.existsSync(png), t + ' ' + rung + ' raster png: exit ' + p.code + ' ' + p.err.slice(-200));
    console.log('  look: ' + png);
  }
}

// l2 (MV-R2, R2a): decals and water over the l1 just drawn (--in, base from 'in'); sane numbers, and pixels of kind 1
// (ground: no decal, no water) keep the pic.l1 bytes exactly (README 9.2)
const gridfile = require('../../lib/raster/gridfile');
function l2Checks(t, key, out, inDir, r, want) {
  const sc = json(fs.existsSync(path.join(out, 'pic.l2.json')) ? fs.readFileSync(path.join(out, 'pic.l2.json'), 'utf8') : 'null');
  ok((r.code === 0 || r.code === 1) && sc, t + ' ' + key + ' l2: exit 0 or 1, got ' + r.code + ' ' + r.err.slice(-300));
  if (!sc) return;
  ok(sc.rung === 'l2' && sc.target === t && sc.base && sc.base.from === want.from && sc.ground === 'ply' && sc.aux.join() === 'l2.n,l2.z' &&
    ['l2.n.mvg', 'l2.z.mvg'].every(f => fs.existsSync(path.join(out, f))), t + ' l2 sidecar: base from ' + (sc.base && sc.base.from) + ', ground ' + sc.ground);
  const d = sc.decals || {}, w = sc.water || {};
  ok(d.placed > 0 && d.drawn > 0 && d.drawn + d.noSize + d.noTexture + d.offGround === d.placed, t + ' l2 decals: ' + JSON.stringify(d));
  if (want.entityPlanes) ok(w.entityPlanes >= want.entityPlanes && w.pixels > 0, t + ' l2 water entity planes: ' + JSON.stringify(w));
  // 1v1_balzerweg: active lake at -23; its map.omask has flag 0 (inverted): the 5 type-1 cells are cut, all dry ground,
  // so the picture is the uncut one [I]; omask true = the mask is used
  if (want.ocean) ok(w.ocean && w.ocean.zlevel === -23 && w.ocean.omask === true && w.pixels > 0 && sc.gaps.includes('RENDER_WATER_APPROX'), t + ' l2 GoH ocean: ' + JSON.stringify(w));
  ok(t === 'goh' ? sc.brightness === 'unverified' && sc.approx === true : sc.brightness === 'fitted', t + ' l2 brightness ' + sc.brightness);
  const p2 = gridfile.read(path.join(out, 'pic.l2.mvg')), p1 = gridfile.read(path.join(inDir, 'pic.l1.mvg'));
  const n = gridfile.read(path.join(out, 'l2.n.mvg')), z = gridfile.read(path.join(out, 'l2.z.mvg'));
  const kinds = [0, 0, 0, 0, 0, 0, 0];
  let same = 0, ground = 0, zBad = 0, a0 = 0;
  for (let i = 0; i < p2.w * p2.h; i++) {
    const k = n.data[i * 4 + 3];
    kinds[k]++;
    if (k > 0 && !(Number.isFinite(z.data[i]) && z.data[i] > -32768 && Math.abs(z.data[i]) < 1e5)) zBad++;
    if (p1.data[i * 4 + 3] === 0) { a0++; if (p2.data[i * 4 + 3] !== 0 || k !== 0) zBad++; }
    if (k === 1) { ground++; if (p2.data[i * 4] === p1.data[i * 4] && p2.data[i * 4 + 1] === p1.data[i * 4 + 1] && p2.data[i * 4 + 2] === p1.data[i * 4 + 2] && p2.data[i * 4 + 3] === p1.data[i * 4 + 3]) same++; }
  }
  const tot = p2.w * p2.h;
  ok(p2.w === p1.w && p2.h === p1.h && kinds[1] > tot * 0.3 && kinds[2] > 0 && kinds[4] + kinds[5] + kinds[6] === 0, t + ' l2 kinds ' + JSON.stringify(kinds));
  ok(zBad === 0, t + ' l2: z finite where kind > 0, nothing drawn where pic.l1 is transparent (' + zBad + ' bad, ' + a0 + ' transparent)');
  ok(same >= ground * 0.98, t + ' l2: ground pixels keep the pic.l1 bytes (' + same + ' of ' + ground + ')');
  console.log(t + ' ' + key + ' l2 ' + sc.w + 'x' + sc.h + ': ' + r.s.toFixed(1) + ' s, decals ' + JSON.stringify(d) + ', water ' + JSON.stringify(w) + ', gaps ' + JSON.stringify(sc.gaps));
  const png = path.join(W, t + '-' + key.replace(/\W+/g, '_') + '-l2.png');
  const p = cli(['raster', 'png', path.join(out, 'pic.l2.mvg'), '--out', png]);
  ok(p.code === 0, t + ' l2 raster png: exit ' + p.code);
  console.log('  look: ' + png);
}
for (const t of targets) {
  const key = MAPS[t], inDir = path.join(W, t + '-l1');
  if (!fs.existsSync(path.join(inDir, 'pic.l1.mvg'))) continue;
  const out = path.join(W, t + '-l2');
  const r = cli(['render', 'l2', '--target', t, '--game', have[t], '--map', key, '--size', String(SIZE), '--in', inDir, '--out', out, '--json']);
  l2Checks(t, key, out, inDir, r, { from: 'in', ocean: t === 'goh' });
}
// AS2 water entities (landscape/water planes at W): multi/1v1_winter_harbor holds 3
if (have.mowas2) {
  const key = 'multi/1v1_winter_harbor', inDir = path.join(W, 'mowas2-wh-l1'), out = path.join(W, 'mowas2-wh-l2');
  const b = ['--target', 'mowas2', '--game', have.mowas2, '--map', key, '--size', String(SIZE)];
  const r1 = cli(['render', 'l1'].concat(b, ['--out', inDir, '--json']));
  ok(r1.code === 0 || r1.code === 1, 'mowas2 ' + key + ' l1: exit ' + r1.code);
  const r = cli(['render', 'l2'].concat(b, ['--in', inDir, '--out', out, '--json']));
  l2Checks('mowas2', key, out, inDir, r, { from: 'in', entityPlanes: 3 });
}

if (have.mowas2) {
  const out = path.join(W, 'mowas2-c0');
  const r = cli(['render', 'c0', '--target', 'mowas2', '--game', have.mowas2, '--map', MAPS.mowas2, '--in', path.join(W, 'mowas2-l1'), '--out', out, '--json']);
  const c = json(r.out);
  ok((r.code === 0 || r.code === 1) && c && typeof c.used === 'boolean' && fs.existsSync(path.join(out, 'c0.json')), 'mowas2 c0: exit 0 or 1 with c0.json, got ' + r.code + ' ' + r.err.slice(-300));
  if (c) {
    ok(Number.isFinite(c.gain) && c.gain > 0.5 && c.gain < 2, 'mowas2 c0 gain in 0.5..2: ' + c.gain);
    ok(c.used === (r.code === 0), 'mowas2 c0: exit 0 exactly when used');
    const cm = c.classMeans || {};
    console.log('mowas2 ' + MAPS.mowas2 + ' c0: used ' + c.used + (c.why ? ' (' + c.why + ')' : '') + ', dx ' + c.dx + ' dy ' + c.dy +
      ', gain ' + c.gain + ', ssim ' + c.ssim + ', ' + r.s.toFixed(1) + ' s');
    for (const k of Object.keys(cm)) console.log('  type ' + k + ': n ' + cm[k].n + ' minimap ' + JSON.stringify(cm[k].minimap) + ' pic ' + JSON.stringify(cm[k].pic));
  }
}

// GoH map-scale detail rule (l1.js DETAIL, render VERSION 3): on multi/1v1_riverbank the soil_snowy blotches repeat every
// 341.33 u (tiling 2.5, uv0 = x / 853.33). Luminance folded by that period (16 x 16 phase bins, std of the bin means) is
// the regular weave: about 11.7 with detail gpu at 1024 px, about 3.0 with the map rule (measured 2026-11). Checked in
// process, both rules; the 60 u vertex lattice is printed for comparison.
function fold(g, P) {
  const B = 16, s = new Float64Array(B * B), n = new Float64Array(B * B), cy = (g.meta && g.meta.cellY) || g.cell;
  let tot = 0, cnt = 0;
  for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) {
    const k = (j * g.w + i) * 4; if (g.data[k + 3] < 255) continue;
    const L = 0.299 * g.data[k] + 0.587 * g.data[k + 1] + 0.114 * g.data[k + 2];
    const x = g.ox + (i + 0.5) * g.cell, y = g.oy + (j + 0.5) * cy;
    const q = Math.floor(((y % P) + P) % P / P * B) * B + Math.floor(((x % P) + P) % P / P * B);
    s[q] += L; n[q]++; tot += L; cnt++;
  }
  const m = tot / cnt; let v = 0;
  for (let q = 0; q < B * B; q++) if (n[q]) v += (s[q] / n[q] - m) ** 2;
  return Math.sqrt(v / (B * B));
}
async function gohWeave() {
  if (!have.goh) return;
  const mk = require('../../lib/mapkit'), L1 = require('../l1');
  const key = 'multi/1v1_riverbank';
  let src = null, doc = null;
  try { src = mk.source({ target: 'goh', game: have.goh }); doc = mk.doc(src, key, { entities: false }); } catch (e) { console.log('skip goh weave: ' + (e.code || e.message)); return; }
  const r = {};
  for (const d of ['map', 'gpu']) {
    const t = Date.now();
    const o = await L1.l1(src, doc, { size: SIZE, made: 'x', detail: d });
    r[d] = { f: fold(o.grid, 341.333), l: fold(o.grid, 60), keep: o.stats.keep, changed: o.sidecar.detailChanged, texs: o.sidecar.detailTextures, s: (Date.now() - t) / 1000 };
  }
  console.log('goh ' + key + ' weave (folded std at 341.33 u / 60 u): map ' + r.map.f.toFixed(2) + ' / ' + r.map.l.toFixed(2) + ' keep ' + r.map.keep +
    ' (' + r.map.s.toFixed(1) + ' s), gpu ' + r.gpu.f.toFixed(2) + ' / ' + r.gpu.l.toFixed(2) + ' (' + r.gpu.s.toFixed(1) + ' s)');
  // keep 0 is asserted on its own: a SIZE whose pixel is finer than DETAIL.coarse (keep > 0) must fail here, not pass
  ok(r.map.keep === 0, 'goh ' + key + ' l1 at ' + SIZE + ' px: picture keep 0 (got ' + r.map.keep + ')');
  ok(r.map.keep === 0 && r.map.f < 5 && r.gpu.f > 8, 'goh ' + key + ' l1: the map rule takes out the 341.33 u weave (' + r.map.f.toFixed(2) + ' < 5, gpu ' + r.gpu.f.toFixed(2) + ' > 8)');
  ok(r.map.changed && r.map.texs.length > 0 && !r.gpu.changed && r.gpu.texs.length === 0,
    'goh ' + key + ' l1 sidecar: detailChanged with the map rule (' + r.map.texs.map(t => t.name + ' ' + t.k).join(', ') + '), not with gpu');
}

gohWeave().catch(e => ok(false, 'goh weave: ' + (e && e.stack || e))).then(() => {
if (fail) { console.log(fail + ' failed, ' + pass + ' passed (pictures kept in ' + W + ')'); process.exit(1); }
if (OWN) { try { fs.rmSync(W, { recursive: true, force: true }); } catch (e) { /* temp */ } console.log('scratch folder deleted (MAPVIZ_RENDER_KEEP=1 keeps it)'); }
console.log('PASS mapviz render real (' + pass + ')');
});

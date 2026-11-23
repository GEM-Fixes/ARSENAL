// cover real-install test (MV-COV): `mapviz cover map` on one real multiplayer map of each game (MoW:AS2 and AS64
// multi/1v1_road, GoH multi/1v1_balzerweg). Checks exits (0, or 1 with skipped defs listed), the five products, sane
// counts (edges, every wall type present, bands, lip used per game, concealment) and AS64 = MoW:AS2 byte for byte (1:1).
// Numbers are printed, not pinned. Skipped per game when the install is absent; MAPVIZ_NO_GAME=1 skips everything.
// About 2 minutes per map. Without a scratch dir the test makes one under the temp folder and deletes it at the end.
// usage: node tools/mapviz/rules/cover/test/real.test.js [scratch dir]
// Author: Imperator_Aug (ARSENAL, ia-db8f7470)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), { spawnSync } = require('child_process');

const MVJS = path.resolve(__dirname, '../../../mapviz.js');
let pass = 0, fail = 0;
function ok(c, what) { if (c) pass++; else { fail++; console.log('FAIL mapviz cover: ' + what); } }

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
function cli(args) {
  const t = Date.now();
  const r = spawnSync(process.execPath, [MVJS].concat(args), { encoding: 'utf8', env: Object.assign({}, process.env), timeout: 900000 });
  return { code: r.status, out: r.stdout || '', err: (r.stderr || '').trim(), s: (Date.now() - t) / 1000 };
}
const json = s => { try { return JSON.parse(s); } catch (e) { return null; } };

const MAPS = { mowas2: 'multi/1v1_road', as64: 'multi/1v1_road', goh: 'multi/1v1_balzerweg' };
const have = installs();
const targets = Object.keys(MAPS).filter(t => have[t]);
if (!targets.length) {
  console.log('skip: ' + (process.env.MAPVIZ_NO_GAME === '1' ? 'MAPVIZ_NO_GAME=1' : 'no MoW:AS2 / AS64 / GoH install found'));
  console.log('PASS mapviz cover real (0, skipped)');
  process.exit(0);
}
for (const t of Object.keys(MAPS)) if (!have[t]) console.log('skip ' + t + ': no install');

const OWN = !process.argv[2];
const W = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'mapviz-cover-real-')));
fs.mkdirSync(W, { recursive: true });
{
  const c = process.env.ARSENAL_CACHE;
  process.env.ARSENAL_CACHE = c && path.resolve(c).startsWith(W + path.sep) ? c : path.join(W, 'cache');
}

const PRODUCTS = ['cover.edges.json', 'cover.points.json', 'cover.band.mvg', 'cover.lip.mvg', 'cover.conceal.mvg'];
for (const t of targets) {
  const out = path.join(W, t);
  const r = cli(['cover', 'map', '--target', t, '--map', MAPS[t], '--out', out, '--json']);
  const b = json(r.out);
  ok((r.code === 0 || (r.code === 1 && b && b.skipped.length)) && b, t + ' ' + MAPS[t] + ': exit ' + r.code + ' ' + r.err.slice(0, 300));
  if (!b) continue;
  // entcat VERSION 2 catalogues every placed def of these maps (GoH fire_loop is service / sfx): no def is skipped, exit 0
  ok(r.code === 0 && b.skipped.length === 0, t + ': no skipped def, exit 0 (skipped ' + JSON.stringify(b.skipped).slice(0, 200) + ')');
  const c = b.counts;
  console.log(t + ' ' + MAPS[t] + ' (' + r.s.toFixed(1) + ' s): edges ' + c.edges + ', rings ' + c.rings + ', points ' + c.points + ' ' + JSON.stringify(c.byType) +
    ', band ' + JSON.stringify(c.band) + ', lip ' + JSON.stringify(c.lip) + ', conceal ' + JSON.stringify(c.conceal) + ', zones ' + c.zones + ', skipped ' + b.skipped.length);
  ok(PRODUCTS.every(f => fs.existsSync(path.join(out, f))), t + ': five products written');
  ok(c.source === 'solids' && c.solids > 100 && c.zones > 50, t + ': entcat solids used (' + c.solids + ' solids, ' + c.zones + ' zones)');
  ok(c.edges > 100 && c.points > 1000, t + ': edges and points in a sane range');
  ok([1, 2, 3, 4, 5, 6].every(k => c.byType[k] > 0), t + ': look, snipe, squat_lie and hide covers all present');
  ok(c.band.stand > 0 && c.band.kneel > 0, t + ': cover.band has stand and kneel cells (counts by band id)');
  ok(c.lip.used === (t !== 'goh') && c.lip.cells > 0, t + ': cover.lip has cells; used ' + c.lip.used);
  ok(t === 'goh' ? !c.byType[12] && c.lip.points === 0 : c.byType[12] > 0, t + ': terrain_lie points ' + (t === 'goh' ? 'absent on goh (GHAI-32)' : 'present'));
  ok(c.conceal.stand + c.conceal.squat + c.conceal.lie > 0 && (c.byType[9] || 0) + (c.byType[10] || 0) + (c.byType[11] || 0) > 0, t + ': concealment cells and bush points');
  const pts = json(fs.readFileSync(path.join(out, 'cover.points.json'), 'utf8'));
  ok(pts && pts.items.every(p => p.kind === 'coverPoint' && p.type >= 1 && p.type <= 12 && Number.isFinite(p.x) && Number.isFinite(p.y)), t + ': every point well formed');
  ok(pts && pts.items.every(p => p.type === 12 ? p.uid === null : !(p.type >= 9 && p.uid === null)), t + ': uid null for terrain_lie, a uid on bush points');
  const ed = json(fs.readFileSync(path.join(out, 'cover.edges.json'), 'utf8'));
  const nv = ed ? ed.items.filter(e => e.vaultable === true).length : -1;
  console.log(t + ': vaultable edges and rings ' + nv);
  ok(ed && ed.items.every(e => e.kind === 'coverSector' || typeof e.vaultable === 'boolean') && (t === 'goh' ? nv > 0 : nv === 0),
    t + ': vaultable marked on goh only (' + nv + ')');
}
if (have.mowas2 && have.as64) {
  ok(PRODUCTS.every(f => { try { return fs.readFileSync(path.join(W, 'as64', f)).equals(fs.readFileSync(path.join(W, 'mowas2', f))); } catch (e) { return false; } }),
    'as64 = mowas2 byte for byte on ' + MAPS.as64 + ' (1:1)');
}
if (OWN && !fail) { try { fs.rmSync(W, { recursive: true, force: true }); } catch (e) { /* busy */ } }
if (fail) process.exit(1);
console.log('PASS mapviz cover real (' + pass + ')');

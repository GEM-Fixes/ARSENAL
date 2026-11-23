// pass real-install test (MV-PAS, wave C): per installed game (as64 and mowas2 multi/1v1_road, goh multi/1v1_balzerweg
// at 10 u and multi/1v1_workshop at 5 u) the chain `mapkit grids` -> `pass obstacles` -> `pass travel` -> `pass routes`
// for kind inf through mapviz.js with --in, then (not on the 5 u map) `pass obstacles` + `pass travel` for kind tank.
// Crossing must come from obstacles.reg for most objects; the 5 u map checks the 2 x 2 fold onto the 10 u travel frame. Numbers are not pinned (data changes); the checks are exits,
// counts, the run speed read from the unit def, spawn cells at 0 s, no reached cell that the folded move code blocks,
// no tank on deep water, and routes no faster than the straight line at full speed. Prints counts and times.
// Skipped per game when the install is absent; MAPVIZ_NO_GAME=1 skips everything (no folder is made). Installs are read
// through vfs only. Without a scratch dir the test makes one under the temp folder and deletes it on PASS.
// usage: node tools/mapviz/rules/pass/test/real.test.js [scratch dir]
// Author: Imperator_Aug (ARSENAL, ia-8a654626)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), { spawnSync } = require('child_process');

const MVJS = path.resolve(__dirname, '../../../mapviz.js');
let pass = 0, fail = 0;
function ok(c, what) { if (c) pass++; else { fail++; console.log('FAIL mapviz pass real: ' + what); } }

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

// map, the inf run speed of the vanilla unit def (km/h) [V data: AS2 human.ext Run Normal 15, GoH human.ext Normal 13]
// goh5: a 5 u GoH map (most GoH multi maps), folded 2 x 2 onto the 10 u travel frame; inf chain only (run time)
const MAPS = { mowas2: { target: 'mowas2', map: 'multi/1v1_road', infKmh: 15 }, as64: { target: 'as64', map: 'multi/1v1_road', infKmh: 15 },
  goh: { target: 'goh', map: 'multi/1v1_balzerweg', infKmh: 13 }, goh5: { target: 'goh', map: 'multi/1v1_workshop', infKmh: 13, infOnly: true, netCell: 5 } };

const have = installs();
const targets = Object.keys(MAPS).filter(k => have[MAPS[k].target]);
if (!targets.length) {
  console.log('skip: ' + (process.env.MAPVIZ_NO_GAME === '1' ? 'MAPVIZ_NO_GAME=1' : 'no MoW:AS2 / AS64 / GoH install found'));
  console.log('PASS mapviz pass real (0, skipped)');
  process.exit(0);
}
for (const k of Object.keys(MAPS)) if (!have[MAPS[k].target]) console.log('skip ' + k + ': no ' + MAPS[k].target + ' install');

const OWN = !process.argv[2];
const W = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'mapviz-pass-real-')));
fs.mkdirSync(W, { recursive: true });
{
  const c = process.env.ARSENAL_CACHE;
  process.env.ARSENAL_CACHE = c && path.resolve(c).startsWith(W + path.sep) ? c : path.join(W, 'cache');
}
const gf = require('../../../lib/raster/gridfile');
const TV = require('../travel');
const Ps = require('..');

for (const key of targets) {
  const M = MAPS[key], t = key;
  const common = ['--target', M.target, '--map', M.map];
  const dg = path.join(W, t + '-grids'), dob = path.join(W, t + '-ob'), dtr = path.join(W, t + '-tr'), dro = path.join(W, t + '-ro');
  const g = cli(['mapkit', 'grids'].concat(common, ['--out', dg, '-q']));
  ok(g.code === 0, t + ': mapkit grids exit 0 (' + g.err + ')');
  if (g.code !== 0) continue;
  const ob = cli(['pass', 'obstacles'].concat(common, ['--kind', 'inf', '--in', dg, '--out', dob, '--json']));
  const so = json(ob.out);
  ok((ob.code === 0 || ob.code === 1) && so && so.counts.obstacles > 50 && so.counts.move.blockedObject > 0, t + ': obstacles inf exit ' + ob.code + ', ' + (so && so.counts.obstacles) + ' obstacle objects (' + ob.err + ')');
  // entcat VERSION 2 catalogues every placed def (GoH fire_loop is service / sfx): obstacles has no failed def, exit 0
  ok(ob.code === 0, t + ': obstacles inf exit 0, no def without a catalogue entry (exit ' + ob.code + ')');
  // crossing is read from obstacles.reg by the human column for most objects, on every game
  ok(so && so.counts.byReg > so.counts.byFallback && !so.notes.some(n => n.code === 'PASS_NO_REG'), t + ': obstacles inf: crossing from obstacles.reg (' + (so && so.counts.byReg) + ' by reg, ' + (so && so.counts.byFallback) + ' fallback)');
  const tr = cli(['pass', 'travel'].concat(common, ['--kind', 'inf', '--in', dg, '--in', dob, '--out', dtr, '--json']));
  const st = json(tr.out);
  ok(tr.code === 0 && st && st.sides.a.spawns.length > 0 && st.sides.b.spawns.length > 0, t + ': travel inf exit ' + tr.code + ' (' + tr.err + ')');
  if (!st) continue;
  ok(st.speed.source === 'def' && Math.abs(st.speed.runMs * 3.6 - M.infKmh) < 1e-6, t + ': inf run speed from the unit def ' + st.speed.runMs * 3.6 + ' km/h (' + st.speed.at + ')');
  const move = gf.read(path.join(dob, 'move.inf.mvg')), gtype = gf.read(path.join(dg, 'gtype.mvg'));
  const prof = Ps.kindProfile(Ps.profiles({ target: M.target, has: () => false, read: () => null }), 'inf', { target: M.target, has: () => false });
  const F = TV.fold({ move, gtype }, prof, { runMs: st.speed.runMs });
  if (M.netCell) {
    // the 5 u fold: move at 5 u, travel frame 10 u, w = ceil(w / 2), f 2
    ok(move.cell === M.netCell && F.fr.cell === 10 && F.fr.f === 2 && F.fr.w === Math.ceil(move.w / 2) && F.fr.h === Math.ceil(move.h / 2) &&
      st.frame.cell === 10 && st.frame.w === F.fr.w && st.frame.h === F.fr.h,
      t + ': 5 u fold, move ' + move.w + 'x' + move.h + ' at ' + move.cell + ' u, travel ' + st.frame.w + 'x' + st.frame.h + ' at ' + st.frame.cell + ' u');
  }
  let badReach = 0, maxT = 0;
  const reached = {};
  for (const side of ['a', 'b']) {
    const tg = gf.read(path.join(dtr, 'travel.' + side + '.inf.mvg'));
    let n = 0;
    for (let k = 0; k < tg.data.length; k++) {
      const v = tg.data[k];
      if (v < 0) continue;
      n++;
      if (v > maxT) maxT = v;
      if (v > 0 && !TV.PASSABLE[F.code[k]]) badReach++;
    }
    reached[side] = n;
    ok(tg.w === F.fr.w && tg.h === F.fr.h && tg.cell === Math.max(10, move.cell), t + ': travel.' + side + ' on the travel frame');
  }
  ok(reached.a > 10000 && reached.b > 10000, t + ': each side reaches over 10000 cells (' + reached.a + ', ' + reached.b + ')');
  ok(badReach === 0, t + ': no reached cell is blocked in the folded move (' + badReach + ')');
  ok(maxT > 10 && maxT < 3600, t + ': longest travel time ' + Math.round(maxT) + ' s');
  const ro = cli(['pass', 'routes'].concat(common, ['--kind', 'inf', '--in', dg, '--in', dob, '--in', dtr, '--out', dro, '--json']));
  const sr = json(ro.out);
  const rj = json(fs.existsSync(path.join(dro, 'routes.json')) ? fs.readFileSync(path.join(dro, 'routes.json'), 'utf8') : '');
  ok((ro.code === 0 || ro.code === 1) && sr && rj && rj.items.length > 0, t + ': routes exit ' + ro.code + ', ' + (rj && rj.items.length) + ' routes (' + ro.err + ')');
  if (rj) {
    let tooFast = 0;
    for (const it of rj.items) {
      const a = it.pts[0], b = it.pts[it.pts.length - 1];
      const dM = Math.hypot(b[0] - a[0], b[1] - a[1]) / 20;
      if (it.seconds < dM / st.speed.runMs - 0.6 || it.lengthM < dM - 1) tooFast++;
    }
    ok(tooFast === 0, t + ': no route is shorter or faster than the straight line at full speed (' + tooFast + ')');
  }
  if (M.infOnly) {
    console.log('real ' + t + ' ' + M.map + ' (' + (st.mode || 'no mode') + '): obstacles ' + (so && so.counts.obstacles) + ', reached a ' + reached.a + ' b ' + reached.b +
      ', longest ' + Math.round(maxT) + ' s, routes ' + (rj && rj.items.length) + '; times grids ' + g.s + ' s, obstacles ' + ob.s + ' s, travel ' + tr.s + ' s, routes ' + ro.s + ' s');
    continue;
  }
  // tank: obstacles + travel; no reached cell on water or deep water (type 4, 5)
  const dobT = path.join(W, t + '-obT'), dtrT = path.join(W, t + '-trT');
  const obT = cli(['pass', 'obstacles'].concat(common, ['--kind', 'tank', '--in', dg, '--out', dobT, '--json']));
  const trT = cli(['pass', 'travel'].concat(common, ['--kind', 'tank', '--in', dg, '--in', dobT, '--out', dtrT, '--json']));
  const stT = json(trT.out);
  ok((obT.code === 0 || obT.code === 1) && trT.code === 0 && stT && stT.speed.source === 'def', t + ': tank obstacles exit ' + obT.code + ', travel exit ' + trT.code + ' (' + trT.err + ')');
  if (stT) {
    const tg = gf.read(path.join(dtrT, 'travel.a.tank.mvg'));
    const f = Math.round(tg.cell / gtype.cell);
    let wet = 0;
    for (let J = 0; J < tg.h; J++) for (let I = 0; I < tg.w; I++) {
      if (!(tg.data[J * tg.w + I] > 0)) continue;
      for (let dj = 0; dj < f; dj++) for (let di = 0; di < f; di++) {
        const i = I * f + di, j = J * f + dj;
        if (i < gtype.w && j < gtype.h && (gtype.data[j * gtype.w + i] === 4 || gtype.data[j * gtype.w + i] === 5)) wet++;
      }
    }
    ok(wet === 0, t + ': the tank reaches no water or deep water cell (' + wet + ')');
  }
  console.log('real ' + t + ' ' + M.map + ' (' + (st.mode || 'no mode') + '): obstacles ' + (so && so.counts.obstacles) + ' (' + (so && so.counts.crossable) + ' crossable for inf), ' +
    'reached a ' + reached.a + ' b ' + reached.b + ', longest ' + Math.round(maxT) + ' s, routes ' + (rj && rj.items.length) + '; times grids ' + g.s + ' s, obstacles ' + ob.s +
    ' s, travel ' + tr.s + ' s, routes ' + ro.s + ' s, tank ' + obT.s + ' + ' + trT.s + ' s');
}

if (fail) { console.log('FAIL mapviz pass real: ' + fail + ' failed, ' + pass + ' passed'); process.exit(1); }
console.log('PASS mapviz pass real (' + pass + ')');
if (OWN) { try { fs.rmSync(W, { recursive: true, force: true }); } catch (e) { /* the OS clears its temp folder */ } }

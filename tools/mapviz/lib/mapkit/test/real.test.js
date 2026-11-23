// mapkit real-install test (MV-KIT): README 3.3 answers on MoW:AS2, the GoH list (cold time) and its fixed type table, and a
// sweep of doc over the maps of each installed game (mowas2, goh, as64) with no throw allowed. Prints the count of maps,
// the count per note code, the slowest map and the total time per game. No single-player map may get MAPKIT_MODE_UNKNOWN
// (ruling R4); MAPKIT_PARSE_ERROR notes are counted by the sdlx code of their first error. Height edges past the ground
// mesh (nodata lines) on mowas2 multi/1v1_road and goh multi/1v1_riverbank; doc link/seats rows on 1v1_road.
//   default: doc on every MoW:AS2 / AS64 map and on every 6th GoH map (GoH doc inflates each map.net: about 0.55 s a map)
//   MAPVIZ_SWEEP=1: doc and grids on every map of every game (several minutes), plus doc + grids on the largest map
// Skipped per game when the install is absent; MAPVIZ_NO_GAME=1 skips everything. Installs are read through vfs only.
// usage: node tools/mapviz/lib/mapkit/test/real.test.js [scratch dir]
// Author: Imperator_Aug (ARSENAL, ia-c8781b4d)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');

const W = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'mapviz-mapkit-real-')));
fs.mkdirSync(W, { recursive: true });
process.env.ARSENAL_CACHE = process.env.ARSENAL_CACHE || path.join(W, 'cache');

const K = require('..');
let pass = 0, fail = 0;
function ok(c, what) { if (c) pass++; else { fail++; console.log('FAIL mapviz mapkit: ' + what); } }
function eq(a, b, what) { ok(JSON.stringify(a) === JSON.stringify(b), what + ': got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b)); }
const FULL = process.env.MAPVIZ_SWEEP === '1';
// lines of a height grid from each edge that are all nodata: {S, N, W, E} (row 0 = S)
function edges(H) {
  const nd = H.nodata, w = H.w, h = H.h, v = (i, j) => H.data[j * w + i] === nd;
  const all = (n, f) => { for (let q = 0; q < n; q++) if (!f(q)) return false; return true; };
  const run = f => { let k = 0; while (k < 64 && f(k)) k++; return k; };
  if (nd === null) return { S: 0, N: 0, W: 0, E: 0 };
  return { S: run(k => all(w, i => v(i, k))), N: run(k => all(w, i => v(i, h - 1 - k))), W: run(k => all(h, j => v(k, j))), E: run(k => all(h, j => v(w - 1 - k, j))) };
}

function installs() {
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

function sweep(target, game) {
  let t = Date.now();
  const src = K.source({ target, game });
  const rows = K.list(src);
  const listMs = Date.now() - t;
  const stride = FULL || target !== 'goh' ? 1 : 6;
  const codes = {}, throws = [], spUnknown = [], parseCodes = {}, unknownModes = new Set();
  let n = 0, total = 0, slow = { key: null, ms: 0 }, big = { key: null, cells: 0 }, gridMs = 0, patches = { applied: 0, skipped: 0 };
  rows.forEach((r, ix) => {
    if (ix % stride !== 0 && ix !== rows.length - 1) return;
    n++;
    const t0 = Date.now();
    try {
      const d = K.doc(src, r.key);
      for (const x of d.notes) {
        codes[x.code] = (codes[x.code] || 0) + 1;
        if (x.code === 'MAPKIT_MODE_UNKNOWN' && /^single\//.test(r.key)) spUnknown.push(r.key);   // ruling R4
        if (x.code === 'MAPKIT_MODE_UNKNOWN') unknownModes.add(r.key + ':' + String(/^mode (.*) is not/.exec(x.text) ? /^mode (.*) is not/.exec(x.text)[1] : '?'));
        if (x.code === 'MAPKIT_PARSE_ERROR') { const m = / line \d+ ([A-Z0-9_]+)/.exec(x.text); parseCodes[m ? m[1] : '?'] = (parseCodes[m ? m[1] : '?'] || 0) + 1; }
      }
      if (d.net.w * d.net.h > big.cells) big = { key: r.key, cells: d.net.w * d.net.h };
      if (Object.keys(d.pictures).length !== 5) throws.push(r.key + ': pictures keys ' + Object.keys(d.pictures).join(','));
    } catch (e) { throws.push(r.key + ' doc: ' + (e.code || '') + ' ' + e.message); }
    const ms = Date.now() - t0;
    total += ms;
    if (ms > slow.ms) slow = { key: r.key, ms };
    if (FULL) {
      const t1 = Date.now();
      try {
        const g = K.grids(src, r.key);
        patches.applied += g.patches.applied; patches.skipped += g.patches.skipped;
        for (const x of g.notes) codes['grids ' + x.code] = (codes['grids ' + x.code] || 0) + 1;
      } catch (e) { throws.push(r.key + ' grids: ' + (e.code || '') + ' ' + e.message); }
      gridMs += Date.now() - t1;
    }
  });
  for (const x of throws.slice(0, 20)) console.log('  throw ' + x);
  ok(throws.length === 0, target + ' sweep: ' + throws.length + ' maps threw');
  ok(spUnknown.length === 0, target + ' sweep: single-player maps with MAPKIT_MODE_UNKNOWN: ' + spUnknown.slice(0, 5).join(', '));
  const res = { target, maps: rows.length, swept: n, listMs, codes, parseCodes, unknownModes: [...unknownModes].sort(), slowest: slow, totalMs: total, gridsMs: FULL ? gridMs : null, patches: FULL ? patches : null, largest: big };
  if (FULL && big.key) {
    const t2 = Date.now();
    const d = K.doc(src, big.key);
    const g = K.grids(src, big.key);
    res.largestMs = Date.now() - t2;
    ok(g.height.w === d.net.w && g.height.h === d.net.h, target + ' largest map grids frame');
  }
  console.log('real ' + JSON.stringify(res));
  return { src, rows, res };
}

if (process.env.MAPVIZ_NO_GAME === '1') {
  console.log('skip real installs: MAPVIZ_NO_GAME=1');
} else {
  const I = installs();
  // ---- README 3.3 on MoW:AS2
  if (!I.mowas2) console.log('skip mowas2: no mowas2 install');
  else {
    const src = K.source({ target: 'mowas2', game: I.mowas2 });
    const d = K.doc(src, 'multi/1v1_road');
    eq([d.net.cell, d.net.w, d.net.h, Math.round(d.net.offX * 1e4) / 1e4, Math.round(d.net.offY * 1e4) / 1e4], [10, 727, 505, 3849.5276, 2289.5276], '1v1_road net');
    eq([d.water.level, d.water.source], [0, 'none'], '1v1_road water none');
    const bz = d.modes.find(m => m.id === 'battle_zones');
    const f1 = bz && bz.flags.find(f => f.name === 'f1');
    ok(!!f1, '1v1_road battle_zones flag f1');
    if (f1) {
      eq([f1.def, f1.x, f1.y], ['flag_point_1', -183.5, 304.88], '1v1_road f1 def and position');
      eq(f1.zone, { kind: 'circle', rA: 240, rB: 240 }, '1v1_road f1 zone (xform scale 0.75 ignored)');
      const c = K.worldToCell(d.net, f1.x, f1.y);
      eq([c.i, c.j], [366, 259], '1v1_road f1 cell');
      const g = K.grids(src, 'multi/1v1_road');
      const k = c.j * g.gtype.w + c.i;
      eq([g.height.data[k], g.gtype.data[k]], [0, 7], '1v1_road f1 height 0, type 7 road');
    }
    const a1 = bz && bz.spawns.find(s => s.name === 'a1');
    ok(!!a1, '1v1_road spawn a1');
    if (a1) {
      eq([a1.x, a1.y, a1.yaw], [2501.09, 1228.63, 177.45], '1v1_road a1 position and yaw');
      const c = K.worldToCell(d.net, a1.x, a1.y);
      eq([c.i, c.j], [635, 351], '1v1_road a1 cell');
    }
    // height edges: the ground mesh starts 0.95 cell in on the south and west, so row 0 and column 0 are nodata (REPORT.json)
    {
      const ticks = [];
      const g = K.grids(src, 'multi/1v1_road', { tick: (x, t) => ticks.push(x) });
      const E = edges(g.height);
      eq([g.ground.reason, g.height.nodata, g.height.meta.offGround, E.S, E.W, E.N, E.E], [null, -32768, 1285, 1, 1, 0, 0], '1v1_road: nodata lines from the S, W, N, E edges');
      ok(ticks.length > 5 && ticks[ticks.length - 1] === 1000, '1v1_road grids ticks ' + ticks.length);
      // structure links on doc rows: windmill parts 0x85, 0x86 on root 0x876; root 0x1403 with all 8 seats {Unlinked}
      const row = u => d.entities.find(e => e.uid === u && e.src === 'map');
      eq([row(0x85).link, row(0x86).link], [{ root: 0x876, place: 'wind_mill2_corner2' }, { root: 0x876, place: 'wind_mill2_top_corner2' }], '1v1_road: windmill parts linked to 0x876');
      const st = row(0x1403).seats || {};
      ok(Object.keys(st).length === 8 && Object.values(st).every(s => s.unlinked === true && s.entity === null), '1v1_road: root 0x1403 has 8 seats, all {Unlinked} ' + JSON.stringify(st));
    }
    const ww = K.doc(src, 'multi/8v8_winter_walk', { entities: false });
    eq([ww.water.level, ww.water.source], [-58, 'map'], '8v8_winter_walk water');
    eq(ww.entities, [], 'entities: false leaves them out');
    const rows = K.list(src);
    ok(rows.some(r => /^single\//.test(r.key)) && rows.some(r => /^multi\/a_frontlines\//.test(r.key)), 'mowas2 list holds single-player and frontline maps');
    ok(rows.every(r => r.source === 'pak' || r.source === 'loose'), 'mowas2 list sources');
  }
  // ---- GoH: list cold, the fixed type table, a frontline map key
  if (!I.goh) console.log('skip goh: no goh install');
  else {
    const t = Date.now();
    const src = K.source({ target: 'goh', game: I.goh });
    const rows = K.list(src);
    const cold = Date.now() - t;
    console.log('real goh list cold ' + cold + ' ms, ' + rows.length + ' maps');
    ok(rows.length > 100 && rows.some(r => /^single\//.test(r.key)), 'goh list holds multi and single-player maps');
    const bal = rows.find(r => r.key === 'multi/1v1_balzerweg') || rows.find(r => /^multi\//.test(r.key));
    const d = K.doc(src, bal.key);
    const FIXED = { ground: 1, no_pass: 2, shallow_water: 3, water: 4, deep_water: 5, swamp: 6, road: 7, no_pass_human: 8, snow: 9, forest: 10, slope: 11 };
    ok(d.net.types.every(x => FIXED[x.name] === x.id && x.engine === x.id), 'goh ' + bal.key + ' types by the fixed table');
    ok([5, 10].includes(d.cell), 'goh cell 5 or 10');
    eq(Object.keys(d.pictures), ['minimap', 'preview', 'preview_small', 'header', 'header_interface'], 'goh five picture stems');
    // height edges: the ground mesh of 1v1_riverbank stops short of the north row and the last 7 columns (all 0 in map.net)
    if (rows.some(r => r.key === 'multi/1v1_riverbank')) {
      const g = K.grids(src, 'multi/1v1_riverbank');
      const E = edges(g.height);
      eq([g.height.meta.offGround, E.S, E.N, E.E, E.W], [27982, 1, 1, 7, 0], 'goh 1v1_riverbank: nodata lines from the S, N, E, W edges');
    }
  }
  // ---- sweeps
  const lists = {};
  for (const target of ['mowas2', 'as64', 'goh']) {
    if (!I[target]) { console.log('skip ' + target + ' sweep: no ' + target + ' install'); continue; }
    if (target === 'as64' && !FULL && lists.mowas2) {
      // AS64 reads the same install with its own exe id: swept in full only when its map list differs
      const src = K.source({ target: 'as64', game: I.as64 });
      const rows = K.list(src);
      const same = JSON.stringify(rows.map(r => [r.key, r.modes, r.files])) === JSON.stringify(lists.mowas2.map(r => [r.key, r.modes, r.files]));
      console.log('real as64: ' + rows.length + ' maps, ' + (same ? 'the same list as mowas2 (sweep with MAPVIZ_SWEEP=1)' : 'a list that differs from mowas2'));
      if (same) { ok(true, 'as64 list'); continue; }
    }
    lists[target] = sweep(target, I[target]).rows;
  }
}

if (fail) { console.log(fail + ' failed'); process.exit(1); }
console.log('PASS mapviz mapkit (' + pass + ')');

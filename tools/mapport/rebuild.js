#!/usr/bin/env node
// mapport/rebuild: rebuild a cell-5 GoH map as a cell-10 as64 map, piece by piece (MAPR-1, sheet Q20). Reads GoH, writes only --out.
//   node tools/mapport/rebuild.js <GoH resource root> --out <dir> --maps multi/1v1_ladoga,multi/2v2_industry [--json file] [-q]
//   node tools/mapport/rebuild.js --self-test
// Pieces and what happens to each (limits PORT-70, PORT-72;:
//   map.net   cell 5 -> cell 10: every 2nd cell kept on both axes (TL of each 2x2 block for height, so the vertex world positions stay the
//             same: heights are corner values); type/material = most common of the 2x2 block, ties to TL.
//             Names the as64 build has no entry for (GoH type `snow`, ...) are merged into `ground` (an unknown name becomes 0 = undef with a warning,
//              FindGroundType). World size, offsets, Clips, entity positions: unchanged.
//             snow -> ground loses little [V data, NG-MAPS 2026-11-08]: GoH set/pather.set gives snow the ground K on every tracked profile
//             (s = g, e.g. t34 0.600/0.600), wheeled 0.500 vs 0.550, humanprofile 1 vs 1 (one human profile 0.75 vs 1); outliers nkl 1.0 vs 0.55,
//             cannon.carry.ski 1.0 vs 0.8. as64's own pather.set has every "snow" line commented out, so ground is what as64 units use anyway.
//   map       mapport.filterMap (keys that stop an as64 load) , nothing else touched
//   map.grs   mapport.convertGrs (5-byte -> u32 records); grass grid is 20 units in both games
//   map.ply kept byte for byte: BPLY terrain render mesh, not tied to the heightmap cell (BigMesh grid has its own cvar). [T] loads
//   .materials, .mi, .info, minimap/preview/header: copied as they are
//   map.omask GoH only: no reader in the as64 source (0 hits in game/ gem/). Header decoded and size checked, then not written.
// Output: <out>/<name>/map/<multi|single/...>/<name>/..., manifest.json beside, spots.json (camera spots)
// Author: Imperator_Aug (ARSENAL, ia-11532c8c)
'use strict';
const fs = require('fs'), path = require('path');
const pakset = require('../lib/pakset'), mapnet = require('../lib/mapnet'), plylib = require('../lib/ply');
const mapport = require('./mapport');

// names as64 knows. types: built-ins. materials: built-ins + set/interaction_terrain/terrains.set (vanilla AS2, read)
const AS64_TYPES = new Set(['undef', 'ground', 'no_pass', 'shallow_water', 'water', 'deep_water', 'swamp', 'road', 'no_pass_human']);
const AS64_MATS = new Set(['undef', 'ground', 'air', 'underwater', 'shallow_water', 'water', 'deep_water', 'bridge', 'bridge_wood', 'road', 'country_road',
  'rock', 'ice', 'swamp', 'sand', 'puddle', 'mud', 'snow', 'grass']);

const cstr = n => { const b = Buffer.from(n, 'latin1'); if (b.length >= 255) throw new Error('name too long'); return Buffer.concat([Buffer.from([b.length]), b]); };

// -> { buf, info }. src must be a cell 5, version 2 map.net
function decimateNet(src) {
  const m = mapnet.parse(src);
  if (m.problems.length) throw new Error('net: ' + m.problems.map(p => p.code).join(','));
  if (m.version !== 2 || m.cell !== 5) throw new Error('net: need cell 5 version 2, got cell ' + m.cell + ' v' + m.version);
  const idOf = (list, ok) => {   // old index -> new index; unknown names merge into ground
    const keep = list.map(e => ({ ...e, ok: ok.has(e.name) }));
    let g = keep.find(e => e.name === 'ground' && e.ok);
    const tbl = keep.filter(e => e.ok).map(e => ({ index: e.index, name: e.name }));
    if (!g && keep.some(e => !e.ok)) { const used = new Set(keep.map(e => e.index)); let i = 1; while (used.has(i)) i++; g = { index: i, name: 'ground' }; tbl.push(g); }
    const map = new Uint8Array(256), merged = {};
    for (const e of keep) { map[e.index] = e.ok ? e.index : g.index; if (!e.ok) merged[e.name] = g.index; }
    return { tbl, map, merged };
  };
  const T = idOf(m.types, AS64_TYPES), M = idOf(m.materials, AS64_MATS);
  const w = m.width, h = m.height, nw = Math.ceil(w / 2), nh = Math.ceil(h / 2), c = m.cells;
  const out = Buffer.alloc(nw * nh * 4), tmp = [];
  const at = (x, y) => (Math.min(y, h - 1) * w + Math.min(x, w - 1)) * 4;
  // PORTREV2 (rev-port #8): a 1-cell wall/cliff/river line puts only 1 cell in a 2x2 block, so a plain majority dropped it and units walked
  // through. Barrier types win if any cell has them: no_pass > no_pass_human > deep_water > water [I, priority order; in-game path check T]
  const PRI = { no_pass: 4, no_pass_human: 3, deep_water: 2, water: 1 }, priOf = new Uint8Array(256);
  for (const e of T.tbl) priOf[e.index] = PRI[e.name] || 0;
  const barrierKept = {};   // type name -> blocks where the barrier beat the majority
  let o = 0;
  for (let j = 0; j < nh; j++) for (let i = 0; i < nw; i++, o += 4) {
    const tl = at(2 * i, 2 * j);
    out.writeInt16LE(c.readInt16LE(tl), o);
    // most common (type,material) pair of the 2x2 block after merging, ties to TL; among the highest-priority barrier type's pairs when one is present
    const pairs = [[tl], [at(2 * i + 1, 2 * j)], [at(2 * i, 2 * j + 1)], [at(2 * i + 1, 2 * j + 1)]].map(([p]) => (T.map[c[p + 2]] << 8) | M.map[c[p + 3]]);
    const top = Math.max(...pairs.map(p => priOf[p >> 8]));
    const pick = ps => { let b = ps[0], bn = 0; for (const p of ps) { const n = ps.filter(q => q === p).length; if (n > bn) { bn = n; b = p; } } return b; };
    const maj = pick(pairs), best = top ? pick(pairs.filter(p => priOf[p >> 8] === top)) : maj;
    if (best >> 8 !== maj >> 8) { const n = T.tbl.find(e => e.index === best >> 8).name; barrierKept[n] = (barrierKept[n] || 0) + 1; }
    out[o + 2] = best >> 8; out[o + 3] = best & 255;
  }
  const hdr = Buffer.alloc(14);
  hdr[0] = 10; hdr[1] = 2; hdr.writeInt16LE(nw, 2); hdr.writeInt16LE(nh, 4); hdr.writeFloatLE(m.offX, 6); hdr.writeFloatLE(m.offY, 10);
  const tab = (tag, t) => Buffer.concat([Buffer.from(tag, 'latin1'), Buffer.from([t.length]), ...t.map(e => Buffer.concat([Buffer.from([e.index]), cstr(e.name)]))]);
  const buf = Buffer.concat([hdr, tab('MAP0', T.tbl), tab('MAP1', M.tbl), Buffer.from('GRID', 'latin1'), out]);
  return { buf, info: { from: [w, h], to: [nw, nh], typesMerged: T.merged, materialsMerged: M.merged, barrierKept, bytesIn: src.length, bytesOut: buf.length } };
}

// .omask: u32 0, u8 1, f32 x, f32 y, u32 w, u32 h, then w*h cells of 10 bytes (decoded on 1v1_ladoga: 190x407, 773321 = 21 + 10*190*407)
function omaskInfo(b) {
  if (b.length < 21) return { ok: false, why: 'short' };
  const w = b.readUInt32LE(13), h = b.readUInt32LE(17), want = 21 + 10 * w * h;
  return { ok: b.length === want, bytes: b.length, ver: b[4], origin: [b.readFloatLE(5), b.readFloatLE(9)], w, h, perCell: 10, why: b.length === want ? null : 'size ' + b.length + ' vs ' + want };
}

// camera spots from the cell-10 net: centre, highest, lowest, a road cell nearest the centre, densest object cluster (Entity positions in `map`)
function spots(net10, mapText, dec) {
  const m = mapnet.parse(net10), W = m.width, H = m.height, cell = 10;
  const wx = i => i * cell - m.offX, wy = j => j * cell - m.offY;
  const cellAt = (i, j) => mapnet.cellAt(m, i, j);
  let hi = null, lo = null, road = null, rd = 1e18;
  const ci = W >> 1, cj = H >> 1;
  for (let j = 0; j < H; j += 2) for (let i = 0; i < W; i += 2) {
    if (i < 30 || j < 30 || i >= W - 30 || j >= H - 30) continue; // not the 300 m border strip
    const c = cellAt(i, j); if (c.height <= -1000) continue;
    if (!hi || c.height > hi.h) hi = { i, j, h: c.height };
    if (!lo || c.height < lo.h) lo = { i, j, h: c.height };
    if (c.type === 7) { const d = (i - ci) ** 2 + (j - cj) ** 2; if (d < rd) { rd = d; road = { i, j, h: c.height }; } }
  }
  // entity cluster: 100 m bins
  const bins = new Map(); const re = /\{Entity\s+"[^"]+"\s+\S+\s*\r?\n?\s*\{Position\s+(-?[\d.]+)\s+(-?[\d.]+)/g; let e;
  while ((e = re.exec(mapText))) { const k = Math.floor(e[1] / 100) + ',' + Math.floor(e[2] / 100); bins.set(k, (bins.get(k) || 0) + 1); }
  let bk = null; for (const [k, n] of bins) if (!bk || n > bk.n) bk = { k, n };
  const out = [];
  const add = (name, x, y, h, why, lookX, lookY) => {
    const dx = lookX - x, dy = lookY - y, az = Math.round((Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360);
    out.push({ name, x: +x.toFixed(1), y: +y.toFixed(1), ground: h, camZ: h + 40, headingDeg: az, why });
  };
  const cx = wx(ci), cy = wy(cj);
  add('centre', cx, cy, cellAt(ci, cj).height, 'map centre, looking +x (heading 0)', cx + 100, cy);
  if (hi) add('highest', wx(hi.i), wy(hi.j), hi.h, 'highest sampled point, looking at the centre', cx, cy);
  if (lo) add('lowest', wx(lo.i), wy(lo.j), lo.h, 'lowest sampled point (water on some maps), looking at the centre', cx, cy);
  if (road) add('road', wx(road.i), wy(road.j), road.h, 'road cell nearest the centre (material and type seam), looking +y', wx(road.i), wy(road.j) + 100);
  else add('quarter', wx(W >> 2), wy(H >> 2), cellAt(W >> 2, H >> 2).height, 'no road cell: south-west quarter point', cx, cy);
  if (bk) { const [bx, by] = bk.k.split(',').map(Number), x = bx * 100 + 50, y = by * 100 + 50, i = Math.round((x + m.offX) / cell), j = Math.round((y + m.offY) / cell);
    add('objects', x - 60, y - 60, cellAt(Math.max(0, Math.min(W - 1, i)), Math.max(0, Math.min(H - 1, j))).height, 'densest 100 m bin of Entity positions (' + bk.n + ' in it), looking at it', x, y); }
  return out;
}

function rebuildOne(set, name, outRoot) {
  const pre = 'map/' + name + '/', files = set.entries.filter(e => e.key.startsWith(pre) && !e.key.slice(pre.length).includes('/'));
  const get = f => { const e = files.find(x => x.key === pre + f); return e ? pakset.read(e) : null; };
  const man = { name, files: {}, dropped: {}, checks: [], bytesOut: 0 };
  const leaf = name.split('/').pop(), dir = path.join(outRoot, leaf, pre.slice(0, -1));
  fs.mkdirSync(dir, { recursive: true });
  const put = (f, b) => { fs.writeFileSync(path.join(dir, f), b); man.files[f] = b.length; man.bytesOut += b.length; };
  const chk = (ok, what) => man.checks.push((ok ? 'PASS ' : 'FAIL ') + what);
  const netIn = get('map.net'); if (!netIn) throw new Error(name + ': no map.net');
  const d = decimateNet(netIn); man.net = d.info; put('map.net', d.buf);
  const m10 = mapnet.parse(d.buf), m5 = mapnet.parse(netIn);
  const bk = Object.entries(d.info.barrierKept);
  if (bk.length) man.checks.push('INFO MAPR_BARRIER_KEPT (rev-port #8) 2x2 blocks where a barrier beat the majority: ' + bk.map(([k, v]) => k + ' ' + v).join(', ') + ' [I; check paths at walls in game T]');
  chk(m10.problems.length === 0 && m10.cell === 10, 'cell-10 net re-parses clean, cell ' + m10.cell + ' ' + m10.width + 'x' + m10.height);
  chk(m10.width * 10 >= m5.width * 5 && m10.width * 10 <= m5.width * 5 + 10, 'world width kept: ' + m10.width * 10 + ' vs ' + m5.width * 5);
  let bad = 0, n = 0;
  for (let j = 0; j < m10.height; j += 7) for (let i = 0; i < m10.width; i += 7) { n++; const a = mapnet.cellAt(m10, i, j), b = mapnet.cellAt(m5, 2 * i, 2 * j); if (!b ? false : a.height !== b.height) bad++; }
  chk(bad === 0, 'height at every 7th new cell equals source cell (2i,2j): ' + n + ' checked, ' + bad + ' differ');
  const st = mapnet.stats(m10);
  const tNames = new Set(m10.types.map(t => t.name)), badT = [...st.typeUse.keys()].filter(k => !m10.types.some(t => t.index === k));
  chk(badT.length === 0 && m10.types.every(t => AS64_TYPES.has(t.name)) && m10.materials.every(t => AS64_MATS.has(t.name)), 'every type/material name is one as64 knows; cells with an unlisted type id: ' + badT.length);
  man.heightRange = [st.minH, st.maxH];
  const mapIn = get('map').toString('latin1'), r = mapport.filterMap(mapIn);
  man.dropped = r.dropped; put('map', Buffer.from(r.text, 'latin1'));
  chk(mapport.filterMap(r.text).text === r.text, 'filterMap is stable on its own output');
  const grs = get('map.grs');
  if (grs) { const g = mapport.convertGrs(grs); man.grass = { form: g.form, cells: g.cells }; if (g.buf) { put('map.grs', g.buf); chk(mapport.convertGrs(g.buf).form === 'as2', 'grass re-reads as as64 form'); } else if (g.form === 'as2') put('map.grs', grs); else chk(false, 'grass ' + g.why); }
  else man.grass = null;
  const ply = get('map.ply'); put('map.ply', ply);
  const p = plylib.parse(ply); man.ply = { magic: p.magic, parts: p.parts.length, error: p.error, inline: p.inline };
  chk(p.magic === 'BPLY' && !p.error && !p.inline, 'map.ply BPLY, ' + p.parts.length + ' submeshes, tool walks it clean (tool only, not the game)');
  for (const f of files.map(x => x.key.slice(pre.length))) {
    if (man.files[f] !== undefined) continue;
    const b = get(f);
    if (f === 'map.omask') { man.omask = omaskInfo(b); chk(man.omask.ok, 'omask header ' + man.omask.w + 'x' + man.omask.h + ' x10 B matches file size, NOT written'); continue; }
    put(f, b);
  }
  man.omaskMentions = Object.keys(man.files).filter(f => /\.(mi|info|set)$|^map$/.test(f) && fs.readFileSync(path.join(dir, f)).toString('latin1').toLowerCase().includes('omask'));
  chk(man.omaskMentions.length === 0, 'no written text file mentions omask');
  man.spots = spots(d.buf, r.text, d.info);
  fs.writeFileSync(path.join(outRoot, leaf, 'spots.json'), JSON.stringify(man.spots, null, 1));
  fs.writeFileSync(path.join(outRoot, leaf, 'manifest.json'), JSON.stringify(man, null, 1));
  return man;
}

function main() {
  const a = process.argv.slice(2), o = { maps: [] };
  for (let i = 0; i < a.length; i++) { if (a[i] === '--out') o.out = a[++i]; else if (a[i] === '--maps') o.maps = a[++i].split(','); else if (a[i] === '--json') o.json = a[++i]; else if (a[i] === '-q') o.q = true; else if (a[i] === '--self-test') o.test = true; else o.root = a[i]; }
  if (o.test) return selfTest();
  if (!o.root || !o.out || !o.maps.length) { console.log('usage: rebuild <GoH resource root> --out <dir> --maps multi/x,multi/y [--json f] [-q]'); process.exitCode = 2; return; }
  const set = pakset.open(o.root, {}), all = [];
  for (const m of o.maps) {
    const man = rebuildOne(set, m.startsWith('map/') ? m.slice(4) : m, o.out); all.push(man);
    if (!o.q) { console.log(m + ': ' + man.bytesOut + ' B written, net ' + man.net.from.join('x') + ' -> ' + man.net.to.join('x')); for (const c of man.checks) console.log('  ' + c); }
    if (man.checks.some(c => c.startsWith('FAIL'))) process.exitCode = 1;
  }
  set.close();
  if (o.json) fs.writeFileSync(o.json, JSON.stringify(all, null, 1));
  console.log('total written ' + all.reduce((s, m) => s + m.bytesOut, 0) + ' B');
}

function selfTest() {
  // 5x5 cell-5 net with a hole in names: type 9 `snow` must merge into ground, heights at even cells survive
  const w = 5, h = 5, hd = Buffer.alloc(14); hd[0] = 5; hd[1] = 2; hd.writeInt16LE(w, 2); hd.writeInt16LE(h, 4); hd.writeFloatLE(100, 6); hd.writeFloatLE(50, 10);
  const tab = (tag, t) => Buffer.concat([Buffer.from(tag), Buffer.from([t.length]), ...t.map(([i, n]) => Buffer.concat([Buffer.from([i]), cstr(n)]))]);
  const cells = Buffer.alloc(w * h * 4);
  for (let k = 0; k < w * h; k++) { cells.writeInt16LE(k * 3 - 20, k * 4); cells[k * 4 + 2] = k % 2 ? 9 : 1; cells[k * 4 + 3] = k % 2 ? 19 : 1; }
  const src = Buffer.concat([hd, tab('MAP0', [[1, 'ground'], [9, 'snow']]), tab('MAP1', [[1, 'ground'], [19, 'snowy']]), Buffer.from('GRID'), cells]);
  const d = decimateNet(src), m = mapnet.parse(d.buf);
  const fail = [];
  if (m.problems.length || m.cell !== 10 || m.width !== 3 || m.height !== 3) fail.push('shape ' + m.cell + ' ' + m.width + 'x' + m.height + ' ' + JSON.stringify(m.problems));
  if (mapnet.cellAt(m, 1, 1).height !== 12 * 3 - 20) fail.push('height ' + mapnet.cellAt(m, 1, 1).height); // new (1,1) = old (2,2) = k 12
  if (!m.types.every(t => AS64_TYPES.has(t.name)) || !m.materials.every(t => AS64_MATS.has(t.name))) fail.push('names');
  if (m.offX !== 100 || m.offY !== 50) fail.push('offset');
  // PORTREV2 #8: 6x6 ground net, 1-cell no_pass column at x=3 and a 1-cell anti-diagonal water line; both must stay unbroken at cell 10
  {
    const W = 6, hd2 = Buffer.alloc(14); hd2[0] = 5; hd2[1] = 2; hd2.writeInt16LE(W, 2); hd2.writeInt16LE(W, 4);
    const cl = Buffer.alloc(W * W * 4);
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) { const k = (y * W + x) * 4; cl[k + 2] = x === 3 ? 2 : (x + y === 2 ? 4 : 1); cl[k + 3] = 1; }
    const s2 = Buffer.concat([hd2, tab('MAP0', [[1, 'ground'], [2, 'no_pass'], [4, 'water']]), tab('MAP1', [[1, 'ground']]), Buffer.from('GRID'), cl]);
    const d2 = decimateNet(s2), m2 = mapnet.parse(d2.buf), ty = (x, y) => m2.types.find(t => t.index === mapnet.cellAt(m2, x, y).type).name;
    for (let y = 0; y < 3; y++) if (ty(1, y) !== 'no_pass') fail.push('thin wall gap at 1,' + y + ': ' + ty(1, y));
    if (ty(0, 1) !== 'water' || ty(1, 0) !== 'no_pass' || ty(0, 0) !== 'water') fail.push('diagonal water lost: ' + [ty(0, 0), ty(0, 1)].join(' '));
    if (ty(2, 2) !== 'ground') fail.push('ground block changed: ' + ty(2, 2));
    if (d2.info.barrierKept.no_pass !== 2 || d2.info.barrierKept.water !== 2) fail.push('barrierKept ' + JSON.stringify(d2.info.barrierKept));
    // seeded defect: the old plain-majority pick loses the wall in every block
    const maj = ps => { let b = ps[0], bn = 0; for (const p of ps) { const n = ps.filter(q => q === p).length; if (n > bn) { bn = n; b = p; } } return b; };
    if (maj([1, 2, 1, 2].map(t => t << 8)) >> 8 !== 1) fail.push('seeded defect: plain majority should drop the wall block');
  }
  const om = Buffer.alloc(21 + 20); om[4] = 1; om.writeUInt32LE(2, 13); om.writeUInt32LE(1, 17);
  if (!omaskInfo(om).ok || omaskInfo(om.subarray(0, 30)).ok) fail.push('omask');
  console.log(fail.length ? 'FAIL ' + fail.join('; ') : 'PASS rebuild self-test');
  if (fail.length) process.exitCode = 1;
}
module.exports = { decimateNet, omaskInfo, spots, rebuildOne };
if (require.main === module) main();

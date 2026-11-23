// mappick: edrun --map <name>. Pick a spot for each pair on a VANILLA multiplayer map (map.pak and the dlc paks of G/resource).
//   load(G, name) -> { name, pak, net, x0, y0, clip:[x0,y0,x1,y1], ents:[[x,y],..] }   throws Error with a "refused" reason
//   place(map, pairs, o) -> pairs with x,y set where the pair had none (copy; explicit x/y kept as the user gave them)
// How: world x = map `world` clip min + cell*cellSize (map.net offX/offY are the negated clip min [V: 1v1_reloading_point, world -4431.1 = -offX]).
//   A spot is the centre (x,y) of a pair's box: shooter at y-dist/2, foe at y+dist/2, crew and men within +-130 of x (+|sx|), 60 past both ends.
//   Valid when, over the whole box: every sampled cell (every cell size) is type ground or road and has ground (height > -1000);
//   height step to the next cell <= 3; box height range <= 8; the straight shooter-to-foe line has no terrain more than 1.5 above the
//   chord of its two end heights (line of sight); no map `Entity` (tree, fence, house..) within 60 of the centre line or 130 of a pair end;
//   box inside the pather clip with a 20 margin; box clear of every earlier pick by 60. Candidates: a 40-unit grid, nearest the clip centre first.
//   No spot for a pair: Error "map refuses". Thresholds are guesses [I]; whether the game then lets the units fire/see is [T].
// Author: Imperator_Aug (ARSENAL, ia-a776e4cd)
const fs = require('fs'), path = require('path');
const pak = require('../lib/pak'), pakset = require('../lib/pakset'), mapnet = require('../lib/mapnet');
// MB-R9 (harness-edrun:94): a fire pair with no dist runs at edrun's DIST (vehicle 300, gun 300), not point blank 120/100: the box was checked over 120 and the
// game line ran 300, so the outer 180 units (hills, houses) went unchecked. Keep in step with edrun.js DIST / DIST_OLD
const DIST_FIRE = { vehicle: 300, gun: 300, infantry: 30 }, DIST_OLD = { vehicle: 400, gun: 400, infantry: 80 };
// FIX-EDRUN item 6 (harness-edrun:138,140): cells at or under the map's water level (+WATER_MARGIN) are water; WALK = cell types a spot may use, SNOW_WALK when no ground spot is left [I]
const SNOW_SHARE = 0.25, WATER_MARGIN = 5, WALK = ['ground', 'road'], SNOW_WALK = ['ground', 'road', 'snow'];
const HALF_W = 130, END = 60, STEP = 40, MARGIN = 20, GAP = 60, MAXSTEP = 3, MAXRANGE = 8, BUMP = 1.5, CLEAR_LINE = 60, CLEAR_END = 130;

// name may be "group/map" (e.g. a_frontlines/2v2_moskow). mods: names tried first, the last named first (the game's later mod wins),
// as loose files G/mods/<m>/resource/map/multi/<name>/, then <m>/resource/*.pak, then <m>/resource/map/**.pak (GoH: keys multi/<name>/..); then the paks.
function load(G, name, mods = []) {
  if (!/^[A-Za-z0-9_]+(\/[A-Za-z0-9_]+)?$/.test(name)) throw new Error('map refuses: bad map name ' + name);
  const dir = path.join(G, 'resource');
  let files = [];
  try { files = fs.readdirSync(dir).filter(f => /^map.*\.pak$/i.test(f)); } catch { /* no resource dir */ }
  const want = 'map/multi/' + name + '/', seen = [];
  const srcs = [], sets = [];
  try {
  for (const m of [...mods].reverse()) {
    if (!/^[A-Za-z0-9_.+-]+$/.test(m)) continue;
    const md = path.join(G, 'mods', m, 'resource', want);
    if (fs.existsSync(path.join(md, 'map.net'))) srcs.push({ label: 'mod ' + m, get: n => { try { return fs.readFileSync(path.join(md, n)); } catch { return null; } }, list: () => [] });
    // EDRUN-3: a mod that ships the map in its own resource/*.pak (the game mounts it the same way)
    let mp = []; try { mp = fs.readdirSync(path.join(G, 'mods', m, 'resource')).filter(f => /\.pak$/i.test(f)).sort(); } catch { /* no resource dir */ }
    for (const f of mp) {
      let ents; try { ents = pak.list(path.join(G, 'mods', m, 'resource', f)); } catch { continue; }
      if (!ents.some(x => x.name.toLowerCase() === want.toLowerCase() + 'map.net')) continue;
      srcs.push({ label: `mod ${m} ${f}`, get: n => { const e = ents.find(x => x.name.toLowerCase() === want.toLowerCase() + n); return e ? pak.read(ents, e) : null; }, list: () => [] });
    }
    // GoH layout: paks under <mod>/resource/map/ (gohfull resource/map/multi.pak holds multi/<name>/..): pakset keys are rooted at resource/map, so 'map/' + key
    const ps = pakset.open(path.join(G, 'mods', m, 'resource', 'map'), {});
    if (ps.entries.length) {
      sets.push(ps);
      const byKey = new Map(ps.entries.map(e => ['map/' + e.key, e]));
      for (const k of byKey.keys()) { const r = /^map\/multi\/([^/]+(?:\/[^/]+)?)\/map\.net$/.exec(k); if (r) seen.push(r[1]); }
      if (byKey.has(want.toLowerCase() + 'map.net')) {
        const e0 = byKey.get(want.toLowerCase() + 'map.net');
        srcs.push({ label: `mod ${m} ${path.relative(path.join(G, 'mods', m, 'resource'), e0.pak).replace(/\\/g, '/')}`, get: n => { const e = byKey.get(want.toLowerCase() + n); return e ? pakset.read(e) : null; }, list: () => [] });
      }
    } else ps.close();
  }
  for (const f of files.sort()) {
    const ents = pak.list(path.join(dir, f));
    srcs.push({ label: f, get: n => { const e = ents.find(x => x.name.toLowerCase() === want.toLowerCase() + n); return e ? pak.read(ents, e) : null; }, list: () => ents });
  }
  for (const s of srcs) {
    const f = s.label;
    for (const e of s.list()) { const m = /^map\/multi\/([^/]+(?:\/[^/]+)?)\/map\.net$/i.exec(e.name); if (m) seen.push(m[1]); }
    const net = s.get('map.net'), mp = s.get('map');
    if (!net) continue;
    if (!mp) throw new Error('map refuses: ' + name + ' has no map file');
    const m = mapnet.parse(net);    if (m.problems.length) throw new Error('map refuses: map.net ' + m.problems.map(p => p.code).join(','));
    const text = mp.toString('latin1');
    const wc = /\{world\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\}/.exec(text), pc = /\{pather\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\}/.exec(text);
    const x0 = wc ? +wc[1] : -m.offX, y0 = wc ? +wc[2] : -m.offY;
    const clip = pc ? pc.slice(1, 5).map(Number) : [x0, y0, x0 + m.width * m.cell, y0 + m.height * m.cell];
    const objs = [];
    for (const r of text.matchAll(/\{Entity\s+"[^"]*"\s+0x[0-9a-fA-F]+\s*\{Position\s+(-?[\d.]+)\s+(-?[\d.]+)/g)) objs.push([+r[1], +r[2]]);
    const mapObj = { name, pak: f, net: m, x0, y0, clip, ents: objs, water: waterOf(text) };
    // a snow map (snow >= SNOW_SHARE of ground+road+snow cells: winter_walk 36%): snow is walkable from the start, else its centre is skipped for far ground rows
    const sh = snowShare(m);
    if (sh >= SNOW_SHARE) { mapObj.walk = SNOW_WALK; mapObj.snowShare = sh; }
    return mapObj;
  }
  const where = [...files, ...sets.map(s => [...new Set(s.entries.map(e => path.basename(e.pak)))].join(','))].join(',');
  throw new Error(`map refuses: no multi map "${name}" in ${where || 'resource/map*.pak'}` + (seen.length ? ` (try ${[...new Set(seen)].slice(0, 6).join(', ')} ..)` : ''));
  } finally { for (const s of sets) s.close(); }
}

// the map's water surface height: an active {Ocean .. {zlevel N}} block, else the clip's {water N}; null = none read
// [V: 4v4_winter_walk (b9m_t) map: Ocean ww_environment_mode river, zlevel -58; Clips {water -58}; map.net shallow_water cells -72..-59]
function waterOf(text) {
  const oc = /\{Ocean\b([\s\S]{0,2000}?)\n\t\}/.exec(text);
  if (oc && /\{active\}/.test(oc[1])) { const z = /\{zlevel\s+(-?[\d.]+)\}/.exec(oc[1]); if (z) return +z[1]; }
  const w = /\{water\s+(-?[\d.]+)\}/.exec(text);
  return w ? +w[1] : null;
}
function snowShare(m) {
  const n = {};
  for (let y = 0; y < m.height; y += 4) for (let x = 0; x < m.width; x += 4) { const t = mapnet.typeName(m, mapnet.cellAt(m, x, y).type); n[t] = (n[t] || 0) + 1; }
  const all = (n.ground || 0) + (n.road || 0) + (n.snow || 0);
  return all ? +((n.snow || 0) / all).toFixed(3) : 0;
}
function heightAt(map, x, y) {
  const m = map.net, cx = Math.round((x - map.x0) / m.cell), cy = Math.round((y - map.y0) / m.cell);
  if (cx < 0 || cy < 0 || cx >= m.width || cy >= m.height) return null;
  const c = mapnet.cellAt(m, cx, cy), tn = mapnet.typeName(m, c.type);
  if (c.height <= mapnet.NO_GROUND || !(map.walk || WALK).includes(tn)) return null;
  if (typeof map.water === 'number' && c.height <= map.water + WATER_MARGIN) return null;   // under or at the water surface
  return c.height;
}

// the box of a pair centred (cx,cy): null if fine, else a short reason
function badSpot(map, p, cx, cy, extra) {
  const dist = p.dist || ((p.move || !p.foe) ? DIST_OLD : DIST_FIRE)[p.class], half = dist / 2;
  const hw = HALF_W + Math.abs(p.sx || 0) + extra.x + (p.rear ? dist : 0), ya = cy - half - END - extra.y, yb = cy + half + END + extra.y, xa = cx - hw, xb = cx + hw;
  const [c0, d0, c1, d1] = map.clip;
  if (xa < c0 + MARGIN || xb > c1 - MARGIN || ya < d0 + MARGIN || yb > d1 - MARGIN) return 'outside the pather clip';
  const cell = map.net.cell;
  let lo = 1e9, hi = -1e9;
  for (let y = ya; y <= yb; y += cell) for (let x = xa; x <= xb; x += cell) {
    const h = heightAt(map, x, y);
    if (h === null) return 'water, no-pass or no ground at ' + Math.round(x) + ',' + Math.round(y);
    const hx = heightAt(map, x + cell, y), hy = heightAt(map, x, y + cell);
    if ((hx !== null && Math.abs(hx - h) > MAXSTEP) || (hy !== null && Math.abs(hy - h) > MAXSTEP)) return 'steep';
    lo = Math.min(lo, h); hi = Math.max(hi, h);
  }
  if (hi - lo > MAXRANGE) return 'uneven';
  const hs = heightAt(map, cx, cy - half), hf = heightAt(map, cx, cy + half);
  for (let y = cy - half; y <= cy + half; y += cell) {
    const t = (y - (cy - half)) / dist, h = heightAt(map, cx, y);
    if (h > hs + (hf - hs) * t + BUMP) return 'terrain blocks the line';
  }
  for (const [ex, ey] of map.ents) {
    if (Math.abs(ex - cx) < CLEAR_LINE && ey > cy - half - END && ey < cy + half + END) return 'object on the line';
    for (const ey2 of [cy - half, cy + half]) if (Math.abs(ex - cx) < CLEAR_END && Math.abs(ey - ey2) < CLEAR_END) return 'object at a pair end';
  }
  return null;
}

function place(map, pairs, o = {}) {
  const [c0, d0, c1, d1] = map.clip, mx = (c0 + c1) / 2, my = (d0 + d1) / 2, cands = [];
  for (let y = d0; y <= d1; y += STEP) for (let x = c0; x <= c1; x += STEP) cands.push([x, y, (x - mx) ** 2 + (y - my) ** 2]);
  cands.sort((a, b) => a[2] - b[2]);
  const taken = [], out = [];
  for (const p of pairs) {
    if (p.x !== undefined && p.y !== undefined) { out.push(p); continue; }
    // a move pair's goal: grow the box by its offset (an absolute {x,y} goal is the user's to place)
    const mv = p.move || {}, extra = { x: Math.abs(mv.dx || 0), y: Math.abs(mv.dy || 0) };
    // same defaults as edrun's distOf (EDRUN-2: point blank for a fire pair, the old ones for move / no-foe pairs); a rear pair stretches the box along x by dist
    const dist = p.dist || ((p.move || !p.foe) ? DIST_OLD : DIST_FIRE)[p.class], hw = HALF_W + Math.abs(p.sx || 0) + extra.x + (p.rear ? dist : 0), hh = dist / 2 + END + extra.y;
    let hit = null, why = {};
    for (const [x, y] of cands) {
      if (taken.some(t => Math.abs(t[0] - x) < t[2] + hw + GAP && Math.abs(t[1] - y) < t[3] + hh + GAP)) continue;
      const r = badSpot(map, p, x, y, extra);
      if (r === null) { hit = [x, y]; break; }
      why[r.replace(/ at .*/, '')] = (why[r.replace(/ at .*/, '')] || 0) + 1;
    }
    // FIX-EDRUN item 6 (harness-edrun:140): winter_walk's centre is type snow: with no ground/road spot left, try again with snow
    if (!hit && !map.walk) {
      const snowMap = { ...map, walk: SNOW_WALK };
      for (const [x, y] of cands) {
        if (taken.some(t => Math.abs(t[0] - x) < t[2] + hw + GAP && Math.abs(t[1] - y) < t[3] + hh + GAP)) continue;
        if (badSpot(snowMap, p, x, y, extra) === null) { hit = [x, y]; if (o.log) o.log(`  ${p.name}: no ground/road spot, snow accepted`); break; }
      }
      if (hit) { hit = hit.map(Math.round); taken.push([hit[0], hit[1], hw, hh]); out.push({ ...p, x: hit[0], y: hit[1], spotOn: 'snow' }); continue; }
    }
    if (!hit) throw new Error(`map refuses: no clear flat spot for pair ${p.name} (${p.class}, dist ${dist}) on ${map.name}; rejected: ${JSON.stringify(why)}`);
    hit = hit.map(Math.round);
    taken.push([hit[0], hit[1], hw, hh]);
    out.push({ ...p, x: hit[0], y: hit[1] });
    if (o.log) o.log(`  ${p.name}: ${hit[0]},${hit[1]}`);
  }
  return out;
}

// MB-R9 (harness-edrun:94): line of sight on the map for preflight, any direction, the real unit points (after autoDist, sx, rear):
// ground heights sampled every cell from s to f; terrain more than BUMP over the chord of the two end heights blocks (same rule as badSpot);
// a map Entity within CLEAR_LINE of the inner line (not within CLEAR_END of either end: the pair's own spot) is named as a warning, not a hold
// (85-90% of GoH map entities don't spawn without their defs, b9-maps.md). -> { block: reason|null, unknown: reason|null, samples, rise, ents }
function lineCheck(map, s, f) {
  const len = Math.hypot(f.x - s.x, f.y - s.y), cell = map.net.cell, n = Math.max(1, Math.ceil(len / cell));
  const hs = heightAt(map, s.x, s.y), hf = heightAt(map, f.x, f.y);
  if (hs === null || hf === null) return { block: null, unknown: 'no ground height at the ' + (hs === null ? 'shooter' : 'foe') + ' point', samples: 0, rise: null, ents: 0 };
  let rise = -1e9, at = null, gaps = 0;
  for (let k = 1; k < n; k++) {
    const t = k / n, x = s.x + (f.x - s.x) * t, y = s.y + (f.y - s.y) * t, h = heightAt(map, x, y);
    if (h === null) { gaps++; continue; }
    const r = h - (hs + (hf - hs) * t);
    if (r > rise) { rise = r; at = [Math.round(x), Math.round(y)]; }
  }
  const dseg = (px, py) => { const vx = f.x - s.x, vy = f.y - s.y, l2 = vx * vx + vy * vy || 1, u = Math.max(0, Math.min(1, ((px - s.x) * vx + (py - s.y) * vy) / l2)); return Math.hypot(px - s.x - u * vx, py - s.y - u * vy); };
  let ents = 0;
  for (const [ex, ey] of map.ents) if (dseg(ex, ey) < CLEAR_LINE && Math.hypot(ex - s.x, ey - s.y) > CLEAR_END && Math.hypot(ex - f.x, ey - f.y) > CLEAR_END) ents++;
  rise = rise === -1e9 ? null : +rise.toFixed(1);
  const block = rise !== null && rise > BUMP ? `terrain ${rise} over the ground chord at ${at.join(',')} (bump ${BUMP})` : null;
  return { block, unknown: gaps ? gaps + ' of ' + (n - 1) + ' samples water/no-pass/no ground' : null, samples: n - 1, rise, ents };
}

module.exports = { load, place, heightAt, badSpot, lineCheck, waterOf, snowShare, SNOW_SHARE, DIST_FIRE, WATER_MARGIN, WALK, SNOW_WALK };

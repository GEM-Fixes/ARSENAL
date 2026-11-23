// pass obst (MV-PAS, wave C): object footprints on the move frame (map.net frame, cell layers) and the move and mcost
// layers of one unit kind (tools/mapviz/README.md 4.4 and the wave C rules draft section 5; design 5.2).
//   obstacles(grids, objects, catalog, prof, o?) -> {obst, move, mcost, counts, notes, skipped}
//     grids {gtype, height?, slopecls?, pass?, cost?}: pass and cost of the kind (pass terrain) are used when given, else
//     made here with mask(); objects = entcat place() rows; catalog = {entries, failed}; prof = kindProfile();
//     o {box:[x0,y0,x1,y1]|null, tick(done, total), table (crushTable(src); default catalog.crush, else null), target}
//   crushTable(src) -> the obstacles.reg table of the stack (entcat crush.table) | null
//   isObstacle(entry), crossOf(entry, prof, table) -> {cross, cost, unknown, why}, rasterize(...)  (tests)
// Codes: obst 0 none, 1 crossable object, 2 object blocks (footprint), 3 margin (footprint grown by the profile radius).
//   move: pass codes 0..4, 5 blocked by object (obst 2 or 3), 6 crossable object (obst 1), 7 outside the pather box.
//   Order of a move cell (ruling): 0 nodata, 7 outside the box, 4 ground, 3 slope, 5 object, 6 crossable, 1 or 2.
//   mcost = cost.<kind> + the object cost (the crossing column of obstacles.reg) on code 6; -1 on 0, 3, 4, 5, 7 [I].
// Footprint raster (ruling): a cell takes a code when the polygon overlaps it with some area (not a touch); the margin
// is every cell nearer than the profile radius to the footprint; core 2 before margin 3 before crossable 1.
// An object is an obstacle when its def has an authored or fitted footprint, or a volume with able obstacle (bushes and
// crowns have a projected volume box with no obstacle volume: not an obstacle) [I: design 4 footprint order].
// Crossable per kind (amends draft ruling 9, fixer 2026-11-14): the obstacles.reg cost of the entry's obstacleId for the
// kind's own pather profile name (human, cannon.carried, cannon.small, tank, GoH per-unit names such as t34), the same
// on every game: >= 0 crosses at that cost, -1 blocks [V data obstacles.reg of AS2 and GoH; modweb movement/obstacles.md].
// GoH flag_vaultable: crossable for inf at the human cost (GHMOV-13). Fallback when the id or the column is absent (note
// PASS_CRUSH_UNKNOWN): inf and mg block; at = crushBy.car; tank = crushBy.tank|tankLight|armored by profile [I].
// Author: Imperator_Aug (ARSENAL, ia-f3afb873)
'use strict';

const CODES = Object.freeze({ NONE: 0, CROSS: 1, BLOCK: 2, MARGIN: 3 });
const MOVE = Object.freeze({ NODATA: 0, OPEN: 1, SLOW: 2, BLOCKED_SLOPE: 3, BLOCKED_GROUND: 4, BLOCKED_OBJECT: 5, CROSS_OBJECT: 6, OUTSIDE: 7 });
const MOVE_IDS = ['nodata', 'open', 'slow', 'blockedSlope', 'blockedGround', 'blockedObject', 'crossObject', 'outsidePather'];
const OBST_IDS = ['none', 'cross', 'block', 'margin'];
const UPM = 20;
const f32 = Math.fround;

function mvLib() { return require('../../mapviz'); }
function fail(code, msg, detail) { const M = mvLib(); return new M.MvError(code, msg, detail); }

function isObstacle(en) {
  if (!en || !en.footprint) return false;
  const fp = en.footprint;
  if (fp.kind === 'decal') return false;
  if (fp.source === 'authored' || fp.source === 'fit') return true;
  return (en.volumes || []).some(v => v && v.able && v.able.obstacle);
}

// crushTable(src) -> entcat crush table of the stack ({ids: {id: {flags, cost: {pather: n}}}}) | null
function crushTable(src) {
  if (!src || typeof src.read !== 'function') return null;
  try { return require('../../entcat/crush').table({ read: k => src.read(k), has: k => (typeof src.has === 'function' ? src.has(k) : !!src.read(k)) }); } catch (e) { return null; }
}

// regCost(en, prof, table) -> obstacles.reg cost of the entry's obstacleId for the profile's pather name | undefined
function regCost(en, prof, table) {
  if (!table || !table.ids || !en || !en.obstacleId || !prof || !prof.patherId) return undefined;
  const rec = table.ids[String(en.obstacleId).toLowerCase()];
  if (!rec || !rec.cost) return undefined;
  const v = rec.cost[String(prof.patherId).toLowerCase()];
  return v === null || v === undefined || !Number.isFinite(Number(v)) ? undefined : Number(v);
}

// the crushBy column of a kind's profile (fallback rule when obstacles.reg has no cost); null: the kind never crushes
function crushColumn(prof) {
  const kind = prof && prof.unit ? prof.unit.kind : null;
  if (kind === 'at') return 'car';
  if (kind === 'tank') {
    const id = String(prof.patherId || '').toLowerCase();
    return id === 'tank.light' ? 'tankLight' : id === 'armored' ? 'armored' : 'tank';
  }
  return null;
}

// crossOf(entry, prof, table?) -> {cross: bool, cost: number (object cost when cross), unknown: bool, why}
//   1. obstacles.reg cost of the entry's obstacleId for the profile's pather name (every kind, every game): >= 0 crosses
//      at that cost ('reg'), -1 blocks ('blocks') [V data obstacles.reg; modweb movement/obstacles.md]
//   2. GoH flag_vaultable for inf: crosses ('vault') at the human cost when that is >= 0, else 0 [V GHMOV-13]
//   3. no id, id not in the table, or no column for the pather: the fallback rule (unknown true when the object has an
//      obstacleId, or the fallback column is null): inf and mg block, at crushBy.car, tank crushBy.tank|tankLight|armored
function crossOf(en, prof, table) {
  const kind = prof && prof.unit ? prof.unit.kind : null;
  const v = regCost(en, prof, table);
  if (kind === 'inf' && en && en.vaultable === true) return { cross: true, cost: v !== undefined && v >= 0 ? v : 0, unknown: false, why: 'vault' };
  if (v !== undefined) return v >= 0 ? { cross: true, cost: v, unknown: false, why: 'reg' } : { cross: false, cost: 0, unknown: false, why: 'blocks' };
  const hasId = !!(en && en.obstacleId);
  const col = crushColumn(prof);
  if (!col) return { cross: false, cost: 0, unknown: hasId && !!table, why: 'never' };
  const c = en && en.crushBy ? en.crushBy[col] : null;
  if (c === null || c === undefined || !Number.isFinite(Number(c))) return { cross: false, cost: 0, unknown: true, why: 'unknown' };
  return Number(c) >= 0 ? { cross: true, cost: Number(c), unknown: hasId && !!table, why: 'crush' } : { cross: false, cost: 0, unknown: hasId && !!table, why: 'blocks' };
}

// ---------------------------------------------------------------- geometry
function polyArea(p) {
  let a = 0;
  for (let i = 0, n = p.length; i < n; i++) { const q = p[i], r = p[(i + 1) % n]; a += q[0] * r[1] - r[0] * q[1]; }
  return a / 2;
}
// Sutherland-Hodgman against an axis box (convex clip window; the subject may be concave, its area stays right)
function clipBox(poly, x0, y0, x1, y1) {
  let out = poly;
  const edges = [[0, x0, 1], [0, x1, -1], [1, y0, 1], [1, y1, -1]];
  for (const [ax, v, s] of edges) {
    const inp = out;
    out = [];
    const n = inp.length;
    if (!n) break;
    for (let i = 0; i < n; i++) {
      const P = inp[i], Q = inp[(i + 1) % n];
      const pin = (P[ax] - v) * s >= 0, qin = (Q[ax] - v) * s >= 0;
      if (pin) out.push(P);
      if (pin !== qin) {
        const t = (v - P[ax]) / (Q[ax] - P[ax]);
        out.push([P[0] + t * (Q[0] - P[0]), P[1] + t * (Q[1] - P[1])]);
      }
    }
  }
  return out;
}
function inPoly(p, x, y) {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const a = p[i], b = p[j];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}
function ptSeg(px, py, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
  let t = L > 0 ? ((px - a[0]) * dx + (py - a[1]) * dy) / L : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const x = a[0] + t * dx - px, y = a[1] + t * dy - py;
  return Math.sqrt(x * x + y * y);
}
function ptBox(px, py, x0, y0, x1, y1) {
  const dx = px < x0 ? x0 - px : px > x1 ? px - x1 : 0, dy = py < y0 ? y0 - py : py > y1 ? py - y1 : 0;
  return Math.sqrt(dx * dx + dy * dy);
}
// distance from a polygon outline to an axis box (0 when they meet); exact when the outline does not cross the box
function polyBoxDist(p, x0, y0, x1, y1) {
  let d = Infinity;
  const C = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  for (let i = 0, n = p.length; i < n; i++) {
    const a = p[i], b = p[(i + 1) % n];
    d = Math.min(d, ptBox(a[0], a[1], x0, y0, x1, y1));
    for (const c of C) d = Math.min(d, ptSeg(c[0], c[1], a, b));
    if (d === 0) return 0;
  }
  return d;
}

// rasterize(code, cost, g, pts, r, crossCode, objCost): writes one footprint into the obst codes (Uint8Array) and the
// object cost (Float32Array) of frame g {w, h, cell, ox, oy}; returns the cells it set
function rasterize(code, cost, g, pts, r, cross, objCost) {
  if (!pts || pts.length < 3) return 0;
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  for (const q of pts) { if (q[0] < bx0) bx0 = q[0]; if (q[0] > bx1) bx1 = q[0]; if (q[1] < by0) by0 = q[1]; if (q[1] > by1) by1 = q[1]; }
  const grow = cross ? 0 : r;
  const i0 = Math.max(0, Math.floor((bx0 - grow - g.ox) / g.cell)), i1 = Math.min(g.w - 1, Math.floor((bx1 + grow - g.ox) / g.cell));
  const j0 = Math.max(0, Math.floor((by0 - grow - g.oy) / g.cell)), j1 = Math.min(g.h - 1, Math.floor((by1 + grow - g.oy) / g.cell));
  const eps = 1e-6 * g.cell * g.cell;
  let set = 0;
  for (let j = j0; j <= j1; j++) {
    const y0 = g.oy + j * g.cell, y1 = y0 + g.cell;
    for (let i = i0; i <= i1; i++) {
      const k = j * g.w + i, cur = code[k];
      if (cur === CODES.BLOCK) continue;
      const x0 = g.ox + i * g.cell, x1 = x0 + g.cell;
      let core = false;
      if (!(x1 <= bx0 || x0 >= bx1 || y1 <= by0 || y0 >= by1)) {
        core = inPoly(pts, (x0 + x1) / 2, (y0 + y1) / 2) || Math.abs(polyArea(clipBox(pts, x0, y0, x1, y1))) > eps;
      }
      if (core) {
        if (cross) {
          if (cur === CODES.NONE || cur === CODES.CROSS) { code[k] = CODES.CROSS; if (objCost > cost[k]) cost[k] = objCost; set++; }
        } else { code[k] = CODES.BLOCK; set++; }
        continue;
      }
      if (!cross && grow > 0 && cur !== CODES.MARGIN && polyBoxDist(pts, x0, y0, x1, y1) < grow - 1e-9) { code[k] = CODES.MARGIN; set++; }
    }
  }
  return set;
}

// ---------------------------------------------------------------- obstacles
function obstacles(grids, objects, catalog, prof, o) {
  o = o || {};
  const tick = typeof o.tick === 'function' ? o.tick : null;
  if (!grids || !grids.gtype) throw fail('MV_USAGE', 'pass obstacles: no gtype grid', { code: 'PASS_GRID' });
  if (!prof || !prof.ground) throw fail('MV_USAGE', 'pass obstacles: no profile', { code: 'PASS_PROFILE' });
  if (!Array.isArray(objects)) throw fail('MV_USAGE', 'pass obstacles: objects must be a list of entcat place() rows', { code: 'PASS_OBJECTS' });
  const Ps = require('./index');
  let pass = grids.pass, cost = grids.cost;
  if (!pass || !cost) { const m = Ps.mask(grids, prof); pass = m.pass; cost = m.cost; }
  const g = grids.gtype;
  for (const [nm, x] of [['pass', pass], ['cost', cost]]) {
    if (x.w !== g.w || x.h !== g.h || x.cell !== g.cell || x.ox !== g.ox || x.oy !== g.oy || x.data.length !== g.w * g.h) {
      throw fail('MV_USAGE', 'pass obstacles: grid ' + nm + ' is not on the frame of gtype', { code: 'PASS_GRID', grid: nm });
    }
  }
  const n = g.w * g.h;
  const code = new Uint8Array(n), ocost = new Float32Array(n);
  const entries = (catalog && catalog.entries) || {};
  const failed = new Map(((catalog && catalog.failed) || []).map(f => [String(f.def).toLowerCase(), f]));
  const r = (Number(prof.radiusM) || 0) * UPM;
  const notes = [], skipped = [];
  const table = o.table !== undefined ? o.table : (catalog && catalog.crush) || null;
  const counts = { objects: objects.length, obstacles: 0, crossable: 0, blocking: 0, skipped: 0, noFootprint: 0, crushUnknown: 0, byReg: 0, byFallback: 0 };
  const fr = { w: g.w, h: g.h, cell: g.cell, ox: g.ox, oy: g.oy };
  const total = objects.length;
  let last = Date.now();
  for (let q = 0; q < total; q++) {
    const ob = objects[q];
    if (tick && Date.now() - last >= 100) { last = Date.now(); tick(q, total + 1); }
    const def = String(ob && ob.def || '').toLowerCase();
    const en = entries[def];
    if (!en) {
      counts.skipped++;
      const f = failed.get(def);
      skipped.push({ uid: ob ? ob.uid : null, def, code: f ? f.code : 'ENTCAT_NO_ENTRY', msg: f ? f.msg : 'no catalog entry' });
      continue;
    }
    if (!isObstacle(en)) continue;
    counts.obstacles++;
    const pts = ob.fp && Array.isArray(ob.fp.pts) && ob.fp.pts.length >= 3 ? ob.fp.pts : null;
    if (!pts) { counts.noFootprint++; continue; }
    const c = crossOf(en, prof, table);
    if (c.unknown) counts.crushUnknown++;
    if (regCost(en, prof, table) !== undefined) counts.byReg++; else counts.byFallback++;
    if (c.cross) counts.crossable++; else counts.blocking++;
    rasterize(code, ocost, fr, pts, r, c.cross, c.cost);
  }
  if (counts.noFootprint) notes.push({ code: 'PASS_OBJECT_NO_FP', text: counts.noFootprint + ' obstacle object(s) have no footprint polygon; not drawn', at: null });
  if (!table && counts.obstacles) notes.push({ code: 'PASS_NO_REG', text: 'no obstacles.reg table: crossing follows the fallback rule (inf and mg block, at car column, tank by profile) [I]', at: null });
  if (counts.crushUnknown) notes.push({ code: 'PASS_CRUSH_UNKNOWN', text: counts.crushUnknown + ' object(s) have no obstacles.reg cost for pather ' + prof.patherId + '; the fallback rule applies (' + (crushColumn(prof) || 'never crosses') + ') [I]', at: null });
  // move and mcost
  const box = Array.isArray(o.box) && o.box.length === 4 ? o.box.map(Number) : null;
  const move = new Uint8Array(n), mcost = new Float32Array(n);
  const oc = { none: 0, cross: 0, block: 0, margin: 0 };
  const mc = { nodata: 0, open: 0, slow: 0, blockedSlope: 0, blockedGround: 0, blockedObject: 0, crossObject: 0, outsidePather: 0 };
  const pd = pass.data, cd = cost.data;
  for (let j = 0; j < g.h; j++) {
    const cy = g.oy + (j + 0.5) * g.cell;
    for (let i = 0; i < g.w; i++) {
      const k = j * g.w + i, p = pd[k], ob = code[k];
      oc[OBST_IDS[ob]]++;
      const cx = g.ox + (i + 0.5) * g.cell;
      let m;
      if (p === MOVE.NODATA || p > 4) m = MOVE.NODATA;
      else if (box && (cx < box[0] || cx > box[2] || cy < box[1] || cy > box[3])) m = MOVE.OUTSIDE;
      else if (p === MOVE.BLOCKED_GROUND || p === MOVE.BLOCKED_SLOPE) m = p;
      else if (ob === CODES.BLOCK || ob === CODES.MARGIN) m = MOVE.BLOCKED_OBJECT;
      else if (ob === CODES.CROSS) m = MOVE.CROSS_OBJECT;
      else m = p;
      move[k] = m;
      mc[MOVE_IDS[m]]++;
      mcost[k] = m === MOVE.OPEN || m === MOVE.SLOW ? cd[k] : m === MOVE.CROSS_OBJECT ? f32(cd[k] + ocost[k]) : -1;
    }
  }
  if (tick) tick(total + 1, total + 1);
  const kind = (prof.unit && prof.unit.kind) || prof.patherId;
  // GHMOV-23 [I]: the GoH base chassis IsPassable refuses ground types 3, 4, 5 (water) while pather.set may accept them
  // (GoH shallow_water for tanks, K 0.35). Codes stay as pather.set gives them until a game run settles it [T].
  if (o.target === 'goh' && (kind === 'tank' || kind === 'at')) {
    const T = require('../../lib/mapkit/tables');
    const wat = new Uint8Array(256);
    for (const nm of ['shallow_water', 'water', 'deep_water']) { const id = T.typeId('goh', nm); if (id !== null && id !== undefined) wat[id] = 1; }
    let wet = 0;
    const gd = g.data;
    for (let k = 0; k < n; k++) if (wat[gd[k]] && (move[k] === MOVE.OPEN || move[k] === MOVE.SLOW || move[k] === MOVE.CROSS_OBJECT)) wet++;
    counts.chassisWater = wet;
    if (wet) notes.push({ code: 'PASS_GOH_CHASSIS_WATER', text: wet + ' water cell(s) (types 3, 4, 5) are passable for ' + kind + ' by pather.set; the GoH base chassis IsPassable refuses them (GHMOV-23) [I], not settled in game [T]', at: null });
  }
  const frame = { w: g.w, h: g.h, cell: g.cell, ox: g.ox, oy: g.oy, sample: 'cell', scale: 1, offset: 0 };
  return {
    obst: Object.assign({ name: 'obst.' + kind }, frame, { etype: 'u8', nodata: null,
      meta: { codes: OBST_IDS.slice(), radiusM: Number(prof.radiusM) || 0, patherId: prof.patherId, counts: oc }, data: code }),
    move: Object.assign({ name: 'move.' + kind }, frame, { etype: 'u8', nodata: MOVE.NODATA,
      meta: { codes: MOVE_IDS.slice(), box: box, counts: mc }, data: move }),
    mcost: Object.assign({ name: 'mcost.' + kind }, frame, { etype: 'f32', nodata: -1, meta: {}, data: mcost }),
    counts: Object.assign(counts, { obst: oc, move: mc }),
    notes,
    skipped,
  };
}

module.exports = { CODES, MOVE, MOVE_IDS, OBST_IDS, obstacles, isObstacle, crossOf, regCost, crushTable, crushColumn, rasterize, clipBox, polyBoxDist };

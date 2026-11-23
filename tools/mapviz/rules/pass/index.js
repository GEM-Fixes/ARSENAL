// pass (MV-WAT, wave B): the terrain passability of each pather profile: where a unit kind may move on bare ground, and
// at what cost, from the cell's ground type and slope class only. Contract: tools/mapviz/README.md sections 1.8, 4.4;
// behaviour: 5.2. All sync. Wave C adds obstacles, travel and routes beside these exports.
//   VERSION
//   profiles(src) -> [{patherId, index, blockDeg, costFromDeg, ground:{<type id>:{k, accepted, cost, name}}, heights[15],
//        radiusM, priority, flags:{network, human, linearPath, crusher, skipImpregnable}, source:'stack'|'vanilla', at}]
//        from the stack's resource/set/pather.set only;
//        a stack without the file gives the vanilla table of the game (source 'vanilla'). .notes on the array.
//   kindProfile(profiles, kind, src) -> profile + {unit:{kind, def, patherId, source:'def'|'vanilla', at}}
//        the PatherID of the kind's unit def (the last one after includes, as actor reads it); never by kind name
//   mask(grids, prof, o?) -> {pass u8 'pass.<kind>', cost f32 'cost.<kind>', counts}
//        o.tick(done, total): optional progress hook; done <= total, rising, last call (total, total), at most ~100 ms of
//        work between calls (raster.slopeClass gets it when the slope classes are made here); a throw aborts the mask
//        grids = {gtype (re-typed, cell), slopecls (cell) | height (lattice)}; codes CODES. A cell whose own lattice point
//        (README 4.2) is height nodata (R16: past the ground mesh) is pass 0 nodata, cost -1 (counts.nodata and
//        counts.offGround; pass meta.offGround when not 0) [I: fix row MAPVIZ_PAS_OFFGROUND]; the height grid is read for
//        that also when slopecls is given (without it nothing is marked). Slope classes treat nodata heights as no
//        normals (raster.slopeClass), so a cell next to one is classed from its real neighbours only.
//   parsePather(buf, {target, file?, src?}) -> {profiles, notes}   (tests; mapkit sdl.parse, src resolves includes);  CODES, HEIGHT_CLASSES, KIND_UNITS, VANILLA
// Engine rules [V]:
//   Terrain row = name, K, [accepted]: level = clamp(K, 0, 1), cost = level < 1e-5 ? -1 : 1/level - 1;
//     GoH 1/sqrt(level) - 1 (GHMOV-05); accepted = ReadBool: a number != 0, absent = true
//   defaults: every type costs 0 and is accepted, type 0 costs -1 (blocked), heights 0, radius 30 u
//   a name the game's ground table does not hold resolves to type 0 (FindGroundType) and overwrites its cost
//   cell cost: ground cost < 0 blocks; heights[slope class] < 0 blocks; else groundCost + 1 + heightCost
// the ground test comes first
//   accepted 0 makes a type impassable to AI free-mode moves only: it is never a cost here
//   slope class c covers [6c, 6c + 6) degrees (raster.slopeClass)
// Author: Imperator_Aug (ARSENAL, ia-b32b08c5)
'use strict';

const VERSION = 3;             // 2: height nodata (R16) is pass nodata; 3: obstacles, travel, routes (wave C; terrain bytes unchanged)
const PATHER_SET = 'resource/set/pather.set';
const HEIGHT_CLASSES = 15;
const CLASS_DEG = 6;
const CODES = Object.freeze({ NODATA: 0, OPEN: 1, SLOW: 2, BLOCKED_SLOPE: 3, BLOCKED_GROUND: 4 });
const CODE_IDS = ['nodata', 'open', 'slow', 'blockedSlope', 'blockedGround'];
const COST_NODATA = -1;
const f32 = Math.fround;

// README 12: the first vanilla unit def of each kind (inf rifleman, mg team, at gun, medium tank); the profile comes from
// its PatherID [V data: properties/*.ext]
const KIND_UNITS = Object.freeze({
  as2: { inf: 'resource/entity/humanskin/human/human.def', mg: 'resource/entity/-vehicle/cannon/maxim/maxim.def',
    at: 'resource/entity/-vehicle/cannon/pak40/pak40.def', tank: 'resource/entity/-vehicle/tank_medium/m4a3_75/m4a3_75.def' },
  goh: { inf: 'resource/entity/humanskin/human/human.def', mg: 'resource/entity/-vehicle/ussr/cannon/maxim/maxim.def',
    at: 'resource/entity/-vehicle/germany/cannon/75mm_pak40/75mm_pak40.def',
    tank: 'resource/entity/-vehicle/ussr/tank_medium/t3476_42/t3476_42.def' },
});
// the PatherID those defs give in vanilla [V data], used when the stack has no such def (the fixture)
const KIND_VANILLA = Object.freeze({
  as2: { inf: 'human', mg: 'cannon.carried', at: 'cannon.small', tank: 'tank' },
  goh: { inf: 'human', mg: 'cannon.carried', at: 'cannon.small', tank: 't34' },
});

function mvLib() { return require('../../mapviz'); }
function fail(code, msg, detail) { const M = mvLib(); return new M.MvError(code, msg, detail); }
function gameOf(target) { return target === 'goh' ? 'goh' : 'as2'; }
function tables() { return require('../../lib/mapkit/tables'); }

// ------------------------------------------------------------------ pather.set
const MODS_ON = new Set(['mp']);         // (mod "mp" ...) counts: maps are read as multiplayer maps [I]
function flat(items, out) {
  for (const x of items || []) {
    if (x.k === 'MOD') { if (MODS_ON.has(String(x.name)) !== !!x.not) flat(x.items, out); }
    else if (!(x.k === 'BLOCK' && x.disabled)) out.push(x);
  }
  return out;
}
const kidsOf = b => flat(b && b.items, []);
const isNum = x => x && (x.k === 'INTEGER' || x.k === 'FLOAT') && Number.isFinite(x.value);
const kw = x => x && x.k === 'IDENT' ? x.text.toLowerCase() : null;

function groundCost(level, goh) {
  if (level < 1e-5) return -1;
  return goh ? f32(f32(1 / f32(Math.sqrt(level))) - 1) : f32(f32(1 / level) - 1);
}
function newProfile(name, at) {
  const ground = {};
  for (let t = 0; t < 16; t++) ground[t] = { k: null, accepted: true, cost: t === 0 ? -1 : 0, name: null };
  return { patherId: name, index: 0, blockDeg: null, costFromDeg: null, ground, heights: new Array(HEIGHT_CLASSES).fill(0),
    radiusM: 1.5, priority: 0, flags: { network: false, human: false, linearPath: false, crusher: false, skipImpregnable: false },
    source: 'stack', at };
}
function finish(p) {
  const bi = p.heights.findIndex(v => v < 0), ci = p.heights.findIndex(v => v > 0);
  p.blockDeg = bi < 0 ? null : bi * CLASS_DEG;
  p.costFromDeg = ci < 0 || (bi >= 0 && ci > bi) ? null : ci * CLASS_DEG;
  return p;
}

const NO_SRC = Object.freeze({ has: () => false, read: () => null });
function sdl() { return require('../../lib/mapkit/sdl'); }

// parsePather(buf, {target, file, src}) -> {profiles, notes}   src (a mapkit source) resolves includes; none: no includes
function parsePather(buf, o) {
  const target = o.target, goh = target === 'goh';
  const file = o.file || PATHER_SET;
  const notes = [];
  const note = (code, text, at) => notes.push({ code, text, at: at || null });
  const r = sdl().parse(o.src || NO_SRC, file, buf);
  for (const e of r.errors) note('PASS_PARSE', e.file + ':' + e.line + ' ' + e.code + ' ' + e.msg);
  const profiles = [];
  const top = kidsOf(r.root).find(x => x.k === 'BLOCK');
  if (!top) { note('PASS_NO_PATHERS', file + ' has no {Pathers} block'); return { profiles, notes }; }
  for (const b of kidsOf(top)) {
    if (b.k !== 'BLOCK') continue;
    const it = kidsOf(b);
    const where = (x) => (x.file || file) + ':' + x.line;
    if (kw(it[0]) !== 'profile' || !it[1] || it[1].k !== 'STRING') {
      note('PASS_ROW_BAD', 'a block that is not {Profile "name" ...} at ' + where(b) + ' is skipped');
      continue;
    }
    const p = newProfile(String(it[1].value), where(b));
    p.index = profiles.length;
    for (const sub of it.slice(2)) {
      if (sub.k !== 'BLOCK') { note('PASS_ROW_BAD', 'profile ' + p.patherId + ': stray item at ' + where(sub)); continue; }
      const s = kidsOf(sub), key = kw(s[0]), args = s.slice(1);
      if (key === 'network') p.flags.network = true;
      else if (key === 'human') p.flags.human = true;
      else if (key === 'linearpath') p.flags.linearPath = true;
      else if (key === 'battlecrusher') p.flags.crusher = true;
      else if (key === 'skipimpregnable') p.flags.skipImpregnable = true;
      else if (key === 'priority') {
        if (isNum(args[0])) p.priority = Math.trunc(args[0].value);
        else note('PASS_ROW_BAD', 'profile ' + p.patherId + ': {Priority} without a number at ' + where(sub));
      } else if (key === 'radius') {
        if (isNum(args[0])) p.radiusM = args[0].value;
        else note('PASS_ROW_BAD', 'profile ' + p.patherId + ': {Radius} without a number at ' + where(sub));
      } else if (key === 'height') {
        // the engine reads the 15 floats in position order: a non-number item keeps its place
        // reads 0 [I], so later
        // classes never shift
        const badPos = [];
        for (let c = 0; c < HEIGHT_CLASSES; c++) {
          const a = args[c];
          if (isNum(a)) p.heights[c] = a.value;
          else { p.heights[c] = 0; badPos.push(c); }
        }
        if (badPos.length || args.length !== HEIGHT_CLASSES) {
          const nonNum = badPos.filter(c => c < args.length);
          note('PASS_HEIGHT_BAD', 'profile ' + p.patherId + ': {Height} wants ' + HEIGHT_CLASSES + ' numbers, has ' + args.length + ' items at ' + where(sub) +
            (nonNum.length ? '; not a number at position ' + nonNum.join(', ') : '') + (args.length < HEIGHT_CLASSES ? '; missing classes from ' + args.length : '') +
            (args.length > HEIGHT_CLASSES ? '; items after ' + HEIGHT_CLASSES + ' are ignored' : '') + '; those classes read 0 [I]');
        }
      } else if (key === 'terrain') {
        for (let i = 0; i < args.length;) {
          const n = args[i];
          if (!n || n.k !== 'STRING') { note('PASS_ROW_BAD', 'profile ' + p.patherId + ': a Terrain row that does not start with a name at ' + where(n) + ' is skipped [I]'); i++; continue; }
          const kv = args[i + 1];
          if (!isNum(kv)) { note('PASS_ROW_BAD', 'profile ' + p.patherId + ': Terrain "' + n.value + '" has no number at ' + where(n) + '; the row is skipped [I]'); i++; continue; }
          let accepted = true, used = 2;
          if (isNum(args[i + 2])) { accepted = Math.trunc(args[i + 2].value) !== 0; used = 3; }
          i += used;
          let t = String(n.value).toLowerCase() === 'undef' ? 0 : tables().typeId(target, n.value);
          if (t === null) {
            note('PASS_TERRAIN_UNKNOWN', 'profile ' + p.patherId + ': ground type "' + n.value + '" is not in the game table at ' + where(n) + '; it resolves to type 0 (FindGroundType)');
            t = 0;
          }
          const k = kv.value, level = k >= 0 ? (k < 1 ? k : 1) : 0;
          p.ground[t] = { k, accepted, cost: groundCost(level, goh), name: String(n.value) };
        }
      } else note('PASS_ROW_BAD', 'profile ' + p.patherId + ': unknown block {' + (s[0] && (s[0].text || s[0].value)) + '} at ' + where(sub));
    }
    profiles.push(finish(p));
  }
  return { profiles, notes };
}

// ------------------------------------------------------------------ vanilla fallback (stack without pather.set)
// [V data] the vanilla resource/set/pather.set of each game, read with parsePather: the profiles the four kinds use (and
// GoH's first profile "nothing", the id-0 default). Order = file order of the profiles kept, so index differs from the game.
const B = -1, X = 900;
const VANILLA = Object.freeze({
  as2: [
    { patherId: 'human', radiusM: 0.3, priority: 1, flags: { network: true, human: true },
      terrain: [['ground', 1], ['no_pass', 0], ['shallow_water', 0.7], ['water', 0.4, 0], ['deep_water', 0.4, 0], ['swamp', 0.25]],
      heights: [0, 0, 0, 0, 0, 0, 0, B, B, B, B, B, B, B, B] },
    { patherId: 'tank', radiusM: 2.25, priority: 5, flags: { crusher: true },
      terrain: [['ground', 0.75], ['no_pass', 0], ['shallow_water', 0.5], ['water', 0], ['deep_water', 0], ['swamp', 0.5], ['road', 1.25]],
      heights: [0, 0, 1, 2, 3, B, B, B, B, B, B, B, B, B, B] },
    { patherId: 'cannon.small', radiusM: 1.5, priority: 2, flags: {},
      terrain: [['ground', 0.75], ['no_pass', 0], ['shallow_water', 0.33], ['water', 0], ['deep_water', 0], ['swamp', 0.33], ['road', 1.25]],
      heights: [0, 1, 1, 2, B, B, B, B, B, B, B, B, B, B, B] },
    { patherId: 'cannon.carried', radiusM: 1, priority: 2, flags: {},
      terrain: [['ground', 0.75], ['no_pass', 0], ['shallow_water', 0.33], ['water', 0], ['deep_water', 0], ['swamp', 0.33], ['road', 1]],
      heights: [0, 0, 0, 0, 0, 1, 2, B, B, B, B, B, B, B, B] },
  ],
  goh: [
    { patherId: 'nothing', radiusM: 0, priority: 0, flags: {},
      terrain: [['ground', 1], ['no_pass', 1], ['shallow_water', 1], ['water', 1], ['deep_water', 1], ['forest', 1], ['slope', 1]],
      heights: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    { patherId: 'human', radiusM: 0.3, priority: 1, flags: { network: true, human: true },
      terrain: [['ground', 1], ['no_pass', 1], ['shallow_water', 0.6], ['water', 0.4], ['deep_water', 0.4], ['swamp', 0.65], ['no_pass_human', 0],
        ['snow', 1], ['forest', 0.75], ['slope', 0.5]],
      heights: [0, 0, 0, 0, 0, 0, 0, 0, 0, B, B, B, B, B, B] },
    { patherId: 't34', radiusM: 2.25, priority: 5, flags: { crusher: true },
      terrain: [['ground', 0.6], ['no_pass', 0], ['shallow_water', 0.35], ['water', 0], ['deep_water', 0], ['swamp', 0.35], ['road', 1], ['snow', 0.6],
        ['forest', 0.1], ['slope', 0.3]],
      heights: [0, 0, 0, 1, 2, 3, 4, 5, 6, X, X, X, X, X, X] },
    { patherId: 'cannon.carried', radiusM: 0.7, priority: 2, flags: {},
      terrain: [['ground', 0.8], ['no_pass', 0], ['shallow_water', 0.6], ['water', 0], ['deep_water', 0], ['swamp', 0.6], ['road', 0.85], ['snow', 0.8],
        ['forest', 0.75], ['slope', 0.33]],
      heights: [0, 0, 0, 0, 0, 1, 2, X, X, X, X, X, X, X, X] },
    { patherId: 'cannon.small', radiusM: 1.1, priority: 2, flags: {},
      terrain: [['ground', 0.8], ['no_pass', 0], ['shallow_water', 0.5], ['water', 0], ['deep_water', 0], ['swamp', 0.5], ['road', 0.85], ['snow', 0.75],
        ['forest', 0.1], ['slope', 0.33]],
      heights: [0, 0, 0, 0, 0, 1, 2, X, X, X, X, X, X, X, X] },
  ],
});

function vanillaProfiles(target) {
  const g = gameOf(target), goh = g === 'goh';
  const rows = VANILLA[g];
  return rows.map((v, i) => {
    const p = newProfile(v.patherId, 'vanilla ' + g + ' pather.set');
    p.index = i;
    p.radiusM = v.radiusM; p.priority = v.priority;
    Object.assign(p.flags, v.flags);
    for (const [name, k, acc] of v.terrain) {
      const t = tables().typeId(target, name);
      const level = k >= 0 ? (k < 1 ? k : 1) : 0;
      p.ground[t === null ? 0 : t] = { k, accepted: acc === undefined ? true : acc !== 0, cost: groundCost(level, goh), name };
    }
    p.heights = v.heights.slice();
    p.source = 'vanilla';
    return finish(p);
  });
}

function profiles(src) {
  const target = src && src.target;
  if (!target) throw fail('MV_USAGE', 'pass profiles need a source with a target');
  let out;
  if (src.has(PATHER_SET)) {
    const r = parsePather(src.read(PATHER_SET), { target, file: PATHER_SET, src });
    out = r.profiles;
    out.notes = r.notes;
    if (!out.length) throw fail('MV_NOT_FOUND', PATHER_SET + ' of the stack has no profile', { code: 'PASS_NO_PROFILE' });
  } else {
    out = vanillaProfiles(target);
    out.notes = [{ code: 'PASS_VANILLA', text: 'the stack has no ' + PATHER_SET + ': the vanilla profiles of ' + gameOf(target) + ' are used', at: null }];
  }
  return out;
}

// ------------------------------------------------------------------ unit def -> PatherID
function defPatherId(src, key) {
  const r = sdl().parse(src, key);
  let hit = null;
  (function walk(b) {
    const it = kidsOf(b);
    for (let i = 0; i < it.length; i++) {
      const x = it[i];
      if (x.k === 'BLOCK') { walk(x); continue; }
      if (kw(x) === 'patherid') {
        const v = it[i + 1];
        if (v && (v.k === 'STRING' || v.k === 'IDENT')) hit = { id: String(v.k === 'STRING' ? v.value : v.text), at: (x.file || key) + ':' + x.line };
      }
    }
  })(r.root);
  return hit;
}

function kindProfile(list, kind, src) {
  const M = mvLib();
  if (!M.KINDS.includes(kind)) throw fail('MV_USAGE', '--kind must be ' + M.KINDS.join(', ') + ', got ' + kind);
  if (!Array.isArray(list) || !list.length) throw fail('MV_USAGE', 'pass: no profiles');
  const g = gameOf(src && src.target);
  const def = KIND_UNITS[g][kind];
  let unit;
  if (src && src.has(def)) {
    const h = defPatherId(src, def);
    unit = h ? { kind, def, patherId: h.id, source: 'def', at: h.at }
      : { kind, def, patherId: list[0].patherId, source: 'def', at: null, note: 'no PatherID: the first profile (id 0)' };
  } else {
    unit = { kind, def, patherId: KIND_VANILLA[g][kind], source: 'vanilla', at: null, note: 'the stack has no ' + def + ': its vanilla PatherID' };
  }
  const p = list.find(x => x.patherId === unit.patherId);
  if (!p) throw fail('MV_NOT_FOUND', 'the unit of kind ' + kind + ' (' + def + ') has PatherID "' + unit.patherId + '", which pather.set does not hold',
    { code: 'PASS_NO_PROFILE', kind, patherId: unit.patherId });
  return Object.assign({}, p, { unit });
}

// ------------------------------------------------------------------ mask
function checkGrid(g, name, etypes, sample) {
  const bad = why => fail('MV_USAGE', 'pass: grid ' + name + ' ' + why, { code: 'PASS_GRID', grid: name });
  if (!g || typeof g !== 'object' || !g.data) throw bad('is absent');
  if (!etypes.includes(g.etype)) throw bad('has etype ' + g.etype + ', not ' + etypes.join(' or '));
  if (g.sample !== sample) throw bad('has sample ' + g.sample + ', not ' + sample);
  if (!(Number.isInteger(g.w) && Number.isInteger(g.h) && g.w > 0 && g.h > 0) || g.data.length !== g.w * g.h) throw bad('size and data differ');
}

// progress of mask: phases of UNIT each (the slope classes when made here, the cell loop); the CLI maps it onto its stage
const UNIT = 1000, TICK_MS = 100;
function prog(f, phases) {
  const T = phases * UNIT;
  let last = Date.now();
  const emit = d => { last = Date.now(); f(Math.min(T, Math.max(0, Math.round(d))), T); };
  return {
    at(i) { emit(i * UNIT); },
    sub(i) { return { tick: (d, t) => emit(i * UNIT + UNIT * (t > 0 ? Math.min(1, d / t) : 1)) }; },
    row(i, j, n) { if (Date.now() - last >= TICK_MS) emit(i * UNIT + UNIT * j / n); },
    end() { emit(T); },
  };
}

function mask(grids, prof, o) {
  const tick = o && typeof o.tick === 'function' ? o.tick : null;
  if (!grids) throw fail('MV_USAGE', 'pass: no grids', { code: 'PASS_GRID' });
  if (!prof || !prof.ground || !Array.isArray(prof.heights)) throw fail('MV_USAGE', 'pass: no profile', { code: 'PASS_PROFILE' });
  checkGrid(grids.gtype, 'gtype', ['u8'], 'cell');
  let sc = grids.slopecls;
  const pg = tick ? prog(tick, sc ? 1 : 2) : null;
  let ph = 0;
  // the height grid, when given, also marks the cells past the ground mesh (R16: its nodata at the cell's own lattice
  // point, README 4.2): pass 0 nodata, cost -1
  const hg = grids.height || null;
  if (hg) {
    checkGrid(hg, 'height', ['i16', 'u16', 'f32'], 'lattice');
    const g0 = grids.gtype;
    if (hg.w !== g0.w || hg.h !== g0.h || hg.cell !== g0.cell || hg.ox !== g0.ox || hg.oy !== g0.oy) {
      throw fail('MV_USAGE', 'pass: grid height is not on the frame of gtype', { code: 'PASS_GRID', grid: 'height' });
    }
  }
  const hnd = hg && hg.nodata !== null && hg.nodata !== undefined && Number.isFinite(Number(hg.nodata)) ? Number(hg.nodata) : null;
  const hd = hg ? hg.data : null;
  if (!sc) {
    if (!hg) checkGrid(hg, 'height', ['i16', 'u16', 'f32'], 'lattice');
    if (pg) pg.at(0);
    sc = require('../../lib/raster').slopeClass(grids.height, pg ? pg.sub(0) : undefined);
    ph = 1;
  }
  if (pg) pg.at(ph);
  checkGrid(sc, 'slopecls', ['u8'], 'cell');
  const g = grids.gtype;
  if (sc.w !== g.w || sc.h !== g.h || sc.cell !== g.cell || sc.ox !== g.ox || sc.oy !== g.oy) {
    throw fail('MV_USAGE', 'pass: grid slopecls is not on the frame of gtype', { code: 'PASS_GRID', grid: 'slopecls' });
  }
  const n = g.w * g.h, t = g.data, s = sc.data;
  const gc = new Float32Array(16);
  for (let k = 0; k < 16; k++) gc[k] = prof.ground[k] ? prof.ground[k].cost : (k === 0 ? -1 : 0);
  const hc = Float32Array.from(prof.heights);
  const pass = new Uint8Array(n), cost = new Float32Array(n);
  const counts = { open: 0, slow: 0, blockedSlope: 0, blockedGround: 0, nodata: 0, offGround: 0 };
  const W = g.w, H = g.h;
  for (let k = 0; k < n; k++) {
    if (pg && k % W === 0) pg.row(ph, k / W, H);
    const ty = t[k];
    if (hnd !== null && hd[k] === hnd) { pass[k] = CODES.NODATA; cost[k] = COST_NODATA; counts.nodata++; counts.offGround++; continue; }
    if (ty > 15) { pass[k] = CODES.NODATA; cost[k] = COST_NODATA; counts.nodata++; continue; }
    const c0 = gc[ty];
    if (c0 < 0) { pass[k] = CODES.BLOCKED_GROUND; cost[k] = COST_NODATA; counts.blockedGround++; continue; }
    const cl = s[k] > 14 ? 14 : s[k];
    const h = hc[cl];
    if (h < 0) { pass[k] = CODES.BLOCKED_SLOPE; cost[k] = COST_NODATA; counts.blockedSlope++; continue; }
    const v = f32(f32(c0 + 1) + h);
    cost[k] = v;
    if (v > 1) { pass[k] = CODES.SLOW; counts.slow++; } else { pass[k] = CODES.OPEN; counts.open++; }
  }
  if (pg) pg.end();
  const kind = (prof.unit && prof.unit.kind) || prof.patherId;
  const frame = { w: g.w, h: g.h, cell: g.cell, ox: g.ox, oy: g.oy, sample: 'cell', scale: 1, offset: 0 };
  const meta = { patherId: prof.patherId, kind: prof.unit ? prof.unit.kind : null, blockDeg: prof.blockDeg, costFromDeg: prof.costFromDeg };
  return {
    pass: Object.assign({ name: 'pass.' + kind }, frame, { etype: 'u8', nodata: CODES.NODATA,
      meta: Object.assign({ codes: CODE_IDS.slice() }, meta, counts.offGround ? { offGround: counts.offGround } : {}), data: pass }),
    cost: Object.assign({ name: 'cost.' + kind }, frame, { etype: 'f32', nodata: COST_NODATA, meta: Object.assign({}, meta), data: cost }),
    counts,
  };
}

// ------------------------------------------------------------------ wave C (MV-PAS): obstacles, travel, routes
// Same code on as64, mowas2 and goh; the GoH differences come from the data (pather.set, unit defs, obstacles.reg
// flag_vaultable and the cost per pather profile) and the travel frame fold of a 5 u map (obst.js, speed.js, travel.js,
// routes.js headers).
//   SPEED_FALLBACK, speed(src, kind, prof), activeBox(doc, mode, side, phase), spawnsOf(doc, mode, side, phase)
//   obstacles(grids, objects, catalog, prof, o?) -> {obst, move, mcost, counts, notes, skipped}
//   travel(mv, prof, speed, sources, o?) -> {t, counts}      mv = {move, mcost, gtype}
//   routes(doc, mv, tA, tB, o) -> {items, density:{a, b}, noRoute}   o.prof and o.speed time the steps
const OB = require('./obst'), SP = require('./speed'), TV = require('./travel'), RT = require('./routes');

module.exports = { VERSION, CODES, CODE_IDS, HEIGHT_CLASSES, CLASS_DEG, PATHER_SET, KIND_UNITS, KIND_VANILLA, VANILLA,
  profiles, kindProfile, mask, parsePather, groundCost, defPatherId,
  SPEED_FALLBACK: SP.SPEED_FALLBACK, speed: SP.speed, activeBox: SP.activeBox, spawnsOf: SP.spawnsOf, flagsOf: SP.flagsOf, modeOf: SP.modeOf,
  resolvePhase: SP.resolvePhase,
  MOVE: OB.MOVE, MOVE_IDS: OB.MOVE_IDS, OBST_CODES: OB.CODES, obstacles: OB.obstacles, crushTable: OB.crushTable,
  travel: TV.travel, travelFrame: TV.travelFrame, fold: TV.fold, routes: RT.routes };

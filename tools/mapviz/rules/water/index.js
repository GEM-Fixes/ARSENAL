// water (MV-WAT, wave B): the engine-true water bands of a map: no prone, infantry swim, and which vehicle classes drown,
// with one label per connected region and the four water checks. Contract: tools/mapviz/README.md sections 1.8, 3.2, 4.4,
// 5.3, 5.4; behaviour: 5.1 and 2 (the load re-type). All sync; works on mapkit grids and mapdoc.
//   VERSION
//   profile(src) -> {game, classes:[{id, depthM, source:'stack'|'vanilla', cls, file, line, chain?}], rules, notes, files}
//        src = a mapkit source (target, has, read). D(k) comes from the winning interaction files of the stack: the
//        'check_water_level' handler of the class (resource/set/interaction_entity/entity.set and its includes): the
//        smallest non-negated `water_level <m>` (the if and every `else water_level`) whose branch sets {able "sinking" 1};
//        a handler without the word overload inherits, so the lower handlers it reaches count too (chain, WATER_INHERIT).
//        A class the files do not give keeps the vanilla value (source 'vanilla'). A drowning class of the stack that maps
//        to no vanilla class is added with its interaction file stem as id (stem_<class> when one file holds several);
//        boats (marine file) never drown (README 1.8).
//   masks(doc, grids, prof, mode?, o?) -> {band, drown, depth, W, mode, counts:{noProne, swim, drownAny, dryWater, offGround}}
//        grids = mapkit grids (height lattice, gtype cell after the re-type with the same W); W = the W of the mode.
//   labels(doc, masks, prof, o?) -> [waterLabel item]   (README 5.3; one per connected region per band; 4 m2 merge rule)
//        drown = the classes with depthM > 0 that sink in the region; drownAlways = those with depthM <= 0 (sink on any
//        wet cell: GoH airborne), [] on as64 and mowas2
//   checks(doc, grids, masks, which?, o?) -> [check item]   (codes CHECKS; which = array of codes, default all;
//        BLOCKED_NOT_DEADLY items carry cls, the drown class)
//   o.tick(done, total): optional progress hook of masks, labels and checks; done <= total, rising, last call
//        (total, total); at most ~100 ms of work between calls, the raster calls inside pass it through (the CLI
//        maps it onto progress set; a throw from it, the cancel, aborts the call)
//   wOf(doc, mode) -> W in u;  interaction(src) -> parsed handler table (tests);  CLASSES, CHECKS, BAND, DEPTH_NODATA
// Engine rules [V]:
//   the unit's ground type is the cell's type, read dry when the cell height is above W (GetGroundType,
//     ); the cell's type is the load re-type of mapkit
//   NO_PRONE = e in 3..5: the AI refuses pose 1 on water (any change on 4/5); a player's
//     prone order on 3 becomes swimming (AS2); GoH stands up instead (GHMOV-34)
//   SWIM = e in 4..5; type 4 means a load depth over 14 u (0.7 m)
//   DROWN(k) = e in 3..5 and W - z > D(k) x 20 (condition water_level); z = the cell
//     height here, the unit's origin in the game [I]
//   a cell whose height point is nodata (R16: past the ground mesh, map.ply covers no face there) holds no unit: band
//     none, no drown bit, depth nodata, counted in counts.offGround (water-typed ones) and water.band meta.offGround (when
//     not 0); labels and every check skip it [I; fix row MAPVIZ_WAT_OFFGROUND]
// Never: "height below W" alone for water (only the re-typed type), the GoH ocean zlevel as W (draw only, design 0).
// Author: Imperator_Aug (ARSENAL, ia-1f11ccff)
'use strict';
const path = require('path');

const VERSION = 2;             // 2: height nodata (R16) is no water
const UPM = 20;
const BAND = Object.freeze({ NONE: 0, NO_PRONE: 1, SWIM: 2 });
const BAND_IDS = ['none', 'noProne', 'swim'];
const DEPTH_NODATA = -32768;
const MERGE_M2 = 4;            // design 5.1: a band part under 4 m2 joins the deeper band's label
const MAX_BITS = 32;
const CHECKS = ['BLOCKED_NOT_DEADLY', 'WET_LOOK_DRY_PLAY', 'SWAMP', 'PAINTED_ABOVE_LEVEL'];
const ENTITY_SET = 'resource/set/interaction_entity/entity.set';
const WATER_MATERIALS = ['shallow_water', 'water', 'deep_water'];
const f32 = Math.fround;

// Vanilla classes (README 1.8). tags = the props of a vanilla unit of the class (its def with every props line of its
// includes, '-x' removals applied) [V data, def named in unit]; the engine gives an entity every interaction block whose
// tag set its props (+ 'generic') hold, in file order, and calls the last one that has the event
// ( + , ). depthM / cite = the
// vanilla value and where it is [V data].
const V2 = ['steel', 'vehicle', 'obstacle_ignore_height'];
const AS2 = [
  { id: 'car', depthM: 1.2, tags: V2.concat(['car', 'wheeled', 'emit_on_sink', 'turn_over']), unit: 'car/willysmb/willysmb.def', cite: 'interaction_entity/vehicle.inc:540' },
  { id: 'truck', depthM: 1.2, tags: V2.concat(['car', 'wheeled', 'emit_on_sink', 'tractor', 'truck']), unit: 'car/blitz3_6/blitz3_6.def', cite: 'interaction_entity/vehicle.inc:540' },
  { id: 'moto', depthM: 1.2, tags: V2.concat(['moto', 'wheeled', 'emit_on_sink', 'explosion_throw_crew', 'turn_over']), unit: 'car/moto/m72.def', cite: 'interaction_entity/vehicle.inc:540' },
  { id: 'armored_car', depthM: 1.2, tags: V2.concat(['emit_on_sink', 'armored_car', 'tractor', 'tank', 'zenite', 'turret', 'wheeled', 'with_gun']), unit: 'btr/sdkfz222/sdkfz222.def', cite: 'interaction_entity/vehicle.inc:540' },
  { id: 'tank_light', depthM: 1.2, tags: V2.concat(['tank', 'turret', 'emit_on_sink', 'with_gun', 'light', 'turret_rotator']), unit: 'tank_light/pz2f/pz2f.def', cite: 'interaction_entity/vehicle.inc:540' },
  { id: 'gun_unlinked', depthM: 1.2, tags: V2.concat(['with_gun', 'trailer', 'emit_on_sink', 'cannon', 'wheeled']), unit: 'cannon/pak40/pak40.def', cite: 'interaction_entity/cannon.inc:202-208 (only when not linked)' },
  { id: 'tank_medium', depthM: 1.6, tags: V2.concat(['tank', 'turret', 'emit_on_sink', 'with_gun', 'medium', 'turret_rotator']), unit: 'tank_medium/m4a3_75/m4a3_75.def', cite: 'interaction_entity/tank.inc:622-625' },
  { id: 'tank_heavy', depthM: 1.8, tags: V2.concat(['tank', 'turret', 'emit_on_sink', 'with_gun', 'heavy', 'turret_rotator']), unit: 'tank_heavy/is2/is2.def', cite: 'interaction_entity/tank.inc:657-660' },
  { id: 'amphibious', depthM: null, tags: V2.concat(['tank', 'turret', 'emit_on_sink', 'with_gun', 'light', 'amphibia']), unit: 'tank_light/lvt4/lvt4.def', cite: 'interaction_entity/vehicle.inc:676 (empty override)' },
];
// GoH: the same ids (README 1.8 "GoH adds") with the GoH values; the unlinked cannon is cannon.inc:408-418 (1.3 m), the
// handler gun_goh_a names too [V data]
const VG = ['steel', 'vehicle', 'obstacle_ignore_height', 'emit_on_sink'];
const GOH = [
  { id: 'car', depthM: 1.2, tags: VG.concat(['car', 'engine', 'wheeled', 'turn_over', 'explosion_throw_crew', 'tractor', 'tractor_light']), unit: 'usa/car/willys_mb/willys_mb.def', cite: 'interaction_entity/vehicle/vehicle-main.inc:1401' },
  { id: 'truck', depthM: 1.2, tags: VG.concat(['car', 'engine', 'wheeled', 'turn_over', 'multi_board', 'truck', 'tractor', 'tractor_heavy']), unit: 'germany/car/blitz3_6/blitz3_6.def', cite: 'interaction_entity/vehicle/vehicle-main.inc:1401' },
  { id: 'moto', depthM: 1.2, tags: VG.concat(['moto', 'engine', 'wheeled', 'explosion_throw_crew', 'turn_over', 'no_recrew_logic']), unit: 'ussr/car/m72/m72.def', cite: 'interaction_entity/vehicle/vehicle-main.inc:1401' },
  { id: 'armored_car', depthM: 1.2, tags: VG.concat(['armored_car', 'engine', 'tank', 'turret', 'wheeled', 'with_gun']), unit: 'germany/btr/sdkfz222a/sdkfz222a.def', cite: 'interaction_entity/vehicle/vehicle-main.inc:1401' },
  { id: 'tank_light', depthM: 1.2, tags: VG.concat(['tank', 'hatch', 'engine', 'with_gun', 'turret', 'light']), unit: 'germany/tank_light/panzer2f/panzer2f.def', cite: 'interaction_entity/vehicle/vehicle-main.inc:1401' },
  { id: 'gun_unlinked', depthM: 1.3, tags: VG.concat(['with_gun', 'cannon', 'wheeled', 'trailer', 'trailer_medium']), unit: 'germany/cannon/75mm_pak40/75mm_pak40.def', cite: 'interaction_entity/cannon.inc:408-418 (only when not linked)' },
  { id: 'tank_medium', depthM: 1.6, tags: VG.concat(['tank', 'hatch', 'engine', 'with_gun', 'turret', 'medium', 'diesel']), unit: 'ussr/tank_medium/t3476_42/t3476_42.def', cite: 'interaction_entity/tank/tank-main.inc:1626' },
  { id: 'tank_heavy', depthM: 1.8, tags: VG.concat(['tank', 'hatch', 'engine', 'with_gun', 'turret', 'heavy', 'diesel']), unit: 'ussr/tank_heavy/is2_44/is2_44.def', cite: 'interaction_entity/tank/tank-main.inc:1748' },
  { id: 'amphibious', depthM: null, tags: VG.concat(['tank', 'hatch', 'engine', 'with_gun', 'turret', 'light', 'amphibia']), unit: 'usa/tank_light/lvt4/lvt4.def', cite: 'interaction_entity/vehicle/vehicle-main.inc:1696 (empty override)' },
  { id: 'gun_goh_a', depthM: 1.3, tags: VG.concat(['mg_stan', 'cannon', 'cannon_small', 'no_exp_blast', 'wheeled']), unit: 'ussr/cannon/maxim/maxim.def', cite: 'interaction_entity/cannon.inc:410' },
  { id: 'gun_goh_b', depthM: 1.0, tags: VG.concat(['mg_stan', 'carried', 'cannon', 'cannon_small', 'no_exp_blast', 'broneschitok']), unit: 'ussr/cannon/broneschitok_1/broneschitok_1.def', cite: 'interaction_entity/cannon.inc:1313' },
];
const CLASSES = Object.freeze({ as2: AS2, goh: GOH });
const BOAT_STEMS = ['marine'];

function mvLib() { return require('../../mapviz'); }
function fail(code, msg, detail) {
  const M = mvLib();
  return new M.MvError(code, msg, detail);
}

// ------------------------------------------------------------------ interaction files
// (mod "name" ...) content counts when the mod is on: a multiplayer game sets "mp" only (design 0: maps are read as
// multiplayer maps) [I]; (mod not "name" ...) when it is off
const MODS_ON = new Set(['mp']);
const modOn = x => MODS_ON.has(String(x.name)) !== !!x.not;
function flat(items, out) {
  for (const x of items || []) {
    if (x.k === 'MOD') { if (modOn(x)) flat(x.items, out); }
    else if (!(x.k === 'BLOCK' && x.disabled)) out.push(x);
  }
  return out;
}
const kidsOf = b => flat(b && b.items, []);
const isNum = x => x && (x.k === 'INTEGER' || x.k === 'FLOAT') && Number.isFinite(x.value);
function isSinkSet(b) {        // {able "sinking" 1}
  const it = kidsOf(b);
  return it.length >= 3 && it[0].k === 'IDENT' && it[0].text.toLowerCase() === 'able' && it[1].k === 'STRING' &&
    String(it[1].value).toLowerCase() === 'sinking' && isNum(it[2]) && it[2].value !== 0;
}
function sinksIn(nodes) {
  for (const x of nodes) {
    if (x.k !== 'BLOCK') continue;
    if (isSinkSet(x) || sinksIn(kidsOf(x))) return true;
  }
  return false;
}
function isSinkReset(b) {      // {able "sinking" 0}
  const it = kidsOf(b);
  return it.length >= 3 && it[0].k === 'IDENT' && it[0].text.toLowerCase() === 'able' && it[1].k === 'STRING' &&
    String(it[1].value).toLowerCase() === 'sinking' && isNum(it[2]) && it[2].value === 0;
}
function resetsIn(nodes) {
  for (const x of nodes) {
    if (x.k !== 'BLOCK') continue;
    if (isSinkReset(x) || resetsIn(kidsOf(x))) return true;
  }
  return false;
}
// the drowning `water_level <m>` conditions of a handler: every non-negated one whose branch (the items after the number up
// to the next else) sets {able "sinking" 1}, the if branch and each `else water_level <m>` branch alike:
// reads `else <cond>` as a new branch with its own condition. The class drowns
// the smallest of them [I: an earlier branch that holds but does not sink would shadow a later one; vanilla has none].
// -> {depthM, line, file, all:[{depthM, line, file}]} | null; a water_level without a number goes to onBad
function drownCondition(handler, onBad) {
  const all = [];
  function walk(b) {
    const it = kidsOf(b);
    for (let i = 0; i < it.length; i++) {
      const x = it[i];
      if (x.k === 'BLOCK') { walk(x); continue; }
      if (!(x.k === 'IDENT' && x.text.toLowerCase() === 'water_level')) continue;
      const prev = it[i - 1];
      const negated = prev && prev.k === 'IDENT' && prev.text.toLowerCase() === 'not';
      const n = it[i + 1];
      if (!isNum(n)) { onBad(x); continue; }
      if (negated) continue;
      const branch = [];
      for (let j = i + 2; j < it.length; j++) {
        if (it[j].k === 'IDENT' && it[j].text.toLowerCase() === 'else') break;
        branch.push(it[j]);
      }
      if (sinksIn(branch)) all.push({ depthM: n.value, line: n.line, file: n.file });
    }
  }
  walk(handler);
  if (!all.length) return null;
  let best = all[0];
  for (const c of all) if (c.depthM < best.depthM) best = c;
  return { depthM: best.depthM, line: best.line, file: best.file, all };
}
// interaction(src) -> {present, classes:[{name, tags, file, line, handler}], errors, notes}   (classes in file order)
//   tags = the block's words (: tags.Set(ReadString, ' ')); name = the words as written
//   handler = null (none) | {line, file, overload, inherit, resets, drown:{depthM, line, file, all} | null, bad:[line]}
//   inherit: is true unless the mode word is 'overload';
//   resets: the handler sets {able "sinking" 0} somewhere
function interaction(src) {
  const out = { present: false, classes: [], errors: [], notes: [], files: [] };
  if (!src || typeof src.has !== 'function' || !src.has(ENTITY_SET)) return out;
  out.present = true;
  const files = new Set([ENTITY_SET]);
  // mapkit sdl.parse resolves the includes through src.read; the wrapper records which files were read
  const rec = { has: k => src.has(k), read: k => { files.add(k); return src.read(k); } };
  const r = require('../../lib/mapkit/sdl').parse(rec, ENTITY_SET);
  for (const e of r.errors) out.errors.push(e);
  out.files = [...files].sort();
  const root = kidsOf(r.root).find(x => x.k === 'BLOCK');
  if (!root) return out;
  for (const c of kidsOf(root)) {
    if (c.k !== 'BLOCK') continue;
    const it = kidsOf(c);
    if (!it.length || it[0].k !== 'STRING') continue;
    const words = String(it[0].value).trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) continue;
    let handler = null;
    for (const h of it) {
      if (h.k !== 'BLOCK') continue;
      const hi = kidsOf(h);
      if (hi.length < 2 || hi[0].k !== 'IDENT' || hi[0].text.toLowerCase() !== 'on' || hi[1].k !== 'STRING' ||
        String(hi[1].value).toLowerCase() !== 'check_water_level') continue;
      if (handler) continue;    // the engine logs "event already defined" and finds the first [I]
      const bad = [];
      const drown = drownCondition(h, x => bad.push({ file: x.file || c.file, line: x.line }));
      const word = w => hi.slice(2, 4).some(x => x.k === 'IDENT' && x.text.toLowerCase() === w);
      const overload = word('overload');
      handler = { file: h.file || c.file, line: h.line, overload, inherit: !overload, resets: resetsIn(kidsOf(h)), drown, bad };
    }
    out.classes.push({ name: words.join(' '), tags: words, file: c.file, line: c.line, handler });
  }
  return out;
}

// the reactions an entity with props `tags` runs: the last block in file order whose tags it holds (+ 'generic') and that
// has a check_water_level handler, then, while that handler inherits, the next lower such block (,
// the lower level runs first, the upper one after it).
// -> {handler, cls, chain:[cls top first]} | null
function chainAt(classes, i, have) {
  const chain = [];
  for (let j = i; j >= 0; j--) {
    const c = classes[j];
    if (!(c.handler && c.tags.every(t => have.has(t)))) continue;
    chain.push(c);
    if (!c.handler.inherit) break;
  }
  return chain;
}
function resolveTags(classes, tags) {
  const have = new Set(tags.map(t => String(t).toLowerCase()).concat(['generic']));
  for (let i = classes.length - 1; i >= 0; i--) {
    const c = classes[i];
    if (c.handler && c.tags.every(t => have.has(t))) return { handler: c.handler, cls: c, chain: chainAt(classes, i, have) };
  }
  return null;
}
// the drowning depth a chain gives: run from the lowest handler up; a handler that sets {able "sinking" 0} somewhere
// decides alone (it runs last and clears what the lower ones set when its own condition fails), one that only sinks adds
// its depth to the lower ones (the smallest wins) [I: "sinking" stays set once a lower handler set it].
// -> {depthM | null, at:{file, line} | null, bad: true when a handler of the chain has no readable water_level}
function chainDepth(chain) {
  let depthM = null, at = null, bad = false;
  for (let j = chain.length - 1; j >= 0; j--) {
    const h = chain[j].handler;
    if (h.bad.length && !h.drown) bad = true;
    const own = h.drown ? h.drown.depthM : null;
    const ownAt = h.drown ? { file: h.drown.file || h.file, line: h.drown.line } : { file: h.file, line: h.line };
    if (j === chain.length - 1 || h.resets) { depthM = own; at = ownAt; continue; }
    if (own !== null && (depthM === null || own < depthM)) { depthM = own; at = ownAt; }
  }
  return { depthM, at, bad };
}
const stemOf = f => path.posix.basename(String(f || '').replace(/\\/g, '/')).replace(/\.[^.]*$/, '').toLowerCase();
const safeId = s => String(s).toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'class';

function gameOf(target) { return target === 'goh' ? 'goh' : 'as2'; }

function profile(src) {
  const target = src && src.target;
  if (!target) throw fail('MV_USAGE', 'water profile needs a source with a target');
  const table = CLASSES[gameOf(target)];
  const I = interaction(src);
  const notes = [];
  if (!I.present) notes.push({ code: 'WATER_NO_INTERACTION', text: 'the stack has no ' + ENTITY_SET + ': every class keeps its vanilla value', at: null });
  for (const e of I.errors) notes.push({ code: 'WATER_PARSE', text: e.file + ':' + e.line + ' ' + e.code + ' ' + e.msg, at: null });
  const badSeen = new Set();
  for (const c of I.classes) {
    if (!c.handler) continue;
    for (const b of c.handler.bad) {
      const k = b.file + ':' + b.line;
      if (badSeen.has(k)) continue;
      badSeen.add(k);
      notes.push({ code: 'WATER_LEVEL_NO_NUMBER', text: 'a water_level condition without a number at ' + k + ' (class ' + c.name + ')', at: null, file: b.file, line: b.line });
    }
  }
  const used = new Set();
  const classes = [];
  const inheritSeen = new Set();
  // notes of a chain: WATER_INHERIT names every handler line that ran; WATER_ELSE_IF when else branches gave a smaller depth
  const chainNotes = (label, hit, r) => {
    if (hit.chain.length > 1) {
      const k = hit.chain.map(c => c.handler.file + ':' + c.handler.line).join(' > ');
      if (!inheritSeen.has(label + k)) {
        inheritSeen.add(label + k);
        notes.push({ code: 'WATER_INHERIT', text: 'class ' + label + ': the handler at ' + hit.chain[0].handler.file + ':' + hit.chain[0].handler.line +
          ' inherits (no overload word): the lower handlers run first (' + k + '); drowns at ' + (r.depthM === null ? 'never' : r.depthM + ' m') + ' [I]', at: null });
      }
    }
    for (const c of hit.chain) {
      const d = c.handler.drown;
      if (d && d.all.length > 1) notes.push({ code: 'WATER_ELSE_IF', text: 'class ' + label + ': the handler at ' + c.handler.file + ':' + c.handler.line +
        ' sinks in ' + d.all.length + ' branches (' + d.all.map(x => x.depthM + ' m at line ' + x.line).join(', ') + '); the smallest, ' + d.depthM + ' m, is used [I]', at: null });
    }
  };
  for (const v of table) {
    const hit = I.present ? resolveTags(I.classes, v.tags) : null;
    if (hit) for (const c of hit.chain) used.add(c);
    const r = hit ? chainDepth(hit.chain) : null;
    if (hit && !r.bad) {
      chainNotes(v.id, hit, r);
      // depthM null: a handler with no drowning condition (an empty overload), the class never drowns
      const row = { id: v.id, depthM: r.depthM, source: 'stack', cls: hit.cls.name, file: r.at.file, line: r.at.line };
      if (hit.chain.length > 1) row.chain = hit.chain.map(c => c.handler.file + ':' + c.handler.line);
      classes.push(row);
    } else {
      if (hit) notes.push({ code: 'WATER_CLASS_VANILLA', text: 'class ' + v.id + ': the handler at ' + hit.handler.file + ':' + hit.handler.line + ' (or one it inherits) has no readable water_level; the vanilla value is used', at: null });
      classes.push({ id: v.id, depthM: v.depthM, source: 'vanilla', cls: null, file: null, line: null, cite: v.cite });
    }
  }
  // drowning classes of the stack that no vanilla class reaches; their inherit chain is walked with the block's own tags
  // (the blocks below whose tags it holds) [I: a unit of the class may hold more props and so more blocks]
  const extra = [];
  for (let i = 0; i < I.classes.length; i++) {
    const c = I.classes[i];
    if (!c.handler || used.has(c)) continue;
    const have = new Set(c.tags.concat(['generic']));
    const chain = chainAt(I.classes, i, have);
    const r = chainDepth(chain);
    if (r.bad || r.depthM === null) continue;
    extra.push({ c, hit: { handler: c.handler, cls: c, chain }, r });
  }
  const perStem = new Map();
  for (const { c } of extra) { const s = stemOf(c.file); perStem.set(s, (perStem.get(s) || 0) + 1); }
  const ids = new Set(classes.map(c => c.id));
  for (const { c, hit, r } of extra) {
    const stem = stemOf(c.file);
    if (BOAT_STEMS.includes(stem)) {
      notes.push({ code: 'WATER_BOAT_SKIPPED', text: 'class ' + c.name + ' (' + c.file + ':' + c.line + ') is a boat class: boats never drown (README 1.8)', at: null });
      continue;
    }
    let id = safeId(perStem.get(stem) > 1 ? stem + '_' + c.name : stem);
    while (ids.has(id)) id += '_x';
    ids.add(id);
    chainNotes(id, hit, r);
    const row = { id, depthM: r.depthM, source: 'stack', cls: c.name, file: r.at.file, line: r.at.line };
    if (hit.chain.length > 1) row.chain = hit.chain.map(x => x.handler.file + ':' + x.handler.line);
    classes.push(row);
  }
  const goh = target === 'goh';
  return {
    v: 1, game: target, classes, notes, files: I.files,
    rules: {
      noProne: [3, 4, 5], swim: [4, 5], drown: [3, 4, 5],
      proneOnShallow: goh ? 'stand' : 'swim',          // AS2: a prone order on 3 swims; GoH stands (GHMOV-34)
      sinkingResets: goh,                              // GoH sets sinking 0 when shallower (cannon.inc:415) [V data]
    },
  };
}

// ------------------------------------------------------------------ masks
function wOf(doc, mode) {
  if (!doc || !doc.water) throw fail('MV_USAGE', 'water: mapdoc has no water block');
  const level = Number(doc.water.level) || 0;
  if (mode === undefined || mode === null || mode === '') return level;
  const m = (doc.modes || []).find(x => x.id === mode);
  if (!m) throw fail('MV_NOT_FOUND', 'map ' + doc.key + ' has no mode ' + mode, { map: doc.key, mode });
  return m.water === null || m.water === undefined ? level : Number(m.water);
}

function checkGrid(g, name, etypes, sample) {
  const bad = why => fail('MV_USAGE', 'water: grid ' + name + ' ' + why, { code: 'WATER_GRID', grid: name });
  if (!g || typeof g !== 'object' || !g.data) throw bad('is absent');
  if (!etypes.includes(g.etype)) throw bad('has etype ' + g.etype + ', not ' + etypes.join(' or '));
  if (g.sample !== sample) throw bad('has sample ' + g.sample + ', not ' + sample);
  if (!(Number.isInteger(g.w) && Number.isInteger(g.h) && g.w > 0 && g.h > 0) || g.data.length !== g.w * g.h) throw bad('size and data differ');
  if (!(g.cell > 0)) throw bad('has no cell size');
}
function sameFrame(a, b, name) {
  if (a.w !== b.w || a.h !== b.h || a.cell !== b.cell || a.ox !== b.ox || a.oy !== b.oy) {
    throw fail('MV_USAGE', 'water: grid ' + name + ' is not on the frame of gtype', { code: 'WATER_GRID', grid: name });
  }
}
const isWater = t => t >= 3 && t <= 5;
// the raw nodata value of the height grid (R16: a lattice point past the ground mesh), null when it marks none
const heightNodata = g => (g && g.nodata !== null && g.nodata !== undefined && Number.isFinite(Number(g.nodata)) ? Number(g.nodata) : null);

function drownBits(prof) {
  const all = ((prof && prof.classes) || []).filter(c => c.depthM !== null && c.depthM !== undefined && Number.isFinite(Number(c.depthM)));
  return all.slice(0, MAX_BITS);
}

// prog(o, phases): the optional progress hook o.tick(done, total) of masks, labels and checks, total = phases x UNIT:
// called at the start of each phase (next), inside the long raster calls (sub() = their options, which pass the tick
// through), every TICK_MS of row work (row) and at the end (README 7: the CLI binds it to its progress reporter, which
// may throw MV_CANCELLED and so end the call)
const UNIT = 1000, TICK_MS = 100;
function prog(o, phases) {
  const f = o && typeof o.tick === 'function' ? o.tick : null;
  const T = Math.max(1, phases) * UNIT;
  let i = -1, last = Date.now();
  const emit = d => { last = Date.now(); f(Math.min(T, Math.max(0, Math.round(d))), T); };
  return {
    next() { i++; if (f) emit(i * UNIT); },
    sub() { const b = i * UNIT; return f ? { tick: (d, t) => emit(b + UNIT * (t > 0 ? Math.min(1, d / t) : 1)) } : undefined; },
    row(j, n) { if (f && Date.now() - last >= TICK_MS) emit(i * UNIT + UNIT * j / n); },
    end() { if (f) emit(T); },
  };
}

function masks(doc, grids, prof, mode, o) {
  const W = wOf(doc, mode);
  if (!grids) throw fail('MV_USAGE', 'water: no grids', { code: 'WATER_GRID' });
  checkGrid(grids.gtype, 'gtype', ['u8'], 'cell');
  checkGrid(grids.height, 'height', ['i16', 'u16'], 'lattice');
  sameFrame(grids.gtype, grids.height, 'height');
  if (typeof grids.W === 'number' && Math.abs(grids.W - W) > 1e-6) {
    throw fail('MV_USAGE', 'water: the grids were re-typed with W ' + grids.W + ', the mode has W ' + W, { code: 'WATER_W_MISMATCH', gridsW: grids.W, W });
  }
  const g = grids.gtype, w = g.w, h = g.h, n = w * h;
  const ht = grids.height.data, hs = grids.height.scale === undefined ? 1 : grids.height.scale, ho = grids.height.offset || 0;
  const hnd = heightNodata(grids.height);
  const t = g.data;
  const bits = drownBits(prof);
  const lim = bits.map(c => f32(UPM * f32(Number(c.depthM))));
  const band = new Uint8Array(n), drown = new Uint32Array(n), depth = new Int16Array(n);
  const Wf = f32(W);
  // offGround: water-typed cells whose height point is nodata (R16: past the ground mesh, no unit stands there): band
  // none, no drown bit, depth nodata; counted here so every water-typed cell is accounted for
  const counts = { noProne: 0, swim: 0, drownAny: 0, dryWater: 0, offGround: 0 };
  const pg = prog(o, 1);
  pg.next();
  for (let k = 0; k < n; k++) {
    if (k % w === 0) pg.row(k / w, h);
    const ty = t[k];
    depth[k] = DEPTH_NODATA;
    if (!isWater(ty)) continue;
    if (hnd !== null && ht[k] === hnd) { counts.offGround++; continue; }
    const z = ht[k] * hs + ho;
    // water.depth: W - h on every water-typed cell (README 4.4), negative where the cell lies above W
    const r = Math.round(W - z);
    depth[k] = r > 32767 ? 32767 : r < -32767 ? -32767 : r;
    if (z > W) { counts.dryWater++; continue; }         // GetGroundType: a water cell above W reads dry
    band[k] = ty === 3 ? BAND.NO_PRONE : BAND.SWIM;
    counts.noProne++;
    if (ty !== 3) counts.swim++;
    const d = f32(Wf - f32(z));
    let m = 0;
    for (let b = 0; b < lim.length; b++) if (d > lim[b]) m |= (1 << b);
    drown[k] = m >>> 0;
    if (m) counts.drownAny++;
  }
  pg.end();
  const frame = { w, h, cell: g.cell, ox: g.ox, oy: g.oy, sample: 'cell', scale: 1, offset: 0 };
  const base = { W, mode: mode || null };
  // sources[k]: where the depth of class bits[k] came from ('stack' or 'vanilla'), so the page can mark vanilla values
  return {
    band: Object.assign({ name: 'water.band' }, frame, { etype: 'u8', nodata: null,
      meta: Object.assign({ codes: BAND_IDS.slice() }, base, counts.offGround ? { offGround: counts.offGround } : {}), data: band }),
    drown: Object.assign({ name: 'water.drown' }, frame, { etype: 'u32', nodata: null,
      meta: Object.assign({ bits: bits.map(c => c.id), depthM: bits.map(c => Number(c.depthM)), sources: bits.map(c => c.source || null) }, base), data: drown }),
    depth: Object.assign({ name: 'water.depth' }, frame, { etype: 'i16', nodata: DEPTH_NODATA, meta: Object.assign({ unit: 'u', upm: UPM }, base), data: depth }),
    W, mode: mode || null, counts,
  };
}

// ------------------------------------------------------------------ labels
function raster() { return require('../../lib/raster'); }
function maskGrid(frame, data, name) {
  return { name, w: frame.w, h: frame.h, cell: frame.cell, ox: frame.ox, oy: frame.oy, etype: 'u8', sample: 'cell', scale: 1, offset: 0,
    nodata: null, meta: { upm: UPM }, data };
}
const r2 = x => Math.round(x * 100) / 100;

function labels(doc, mk, prof, o) {
  if (!mk || !mk.band || !mk.depth || !mk.drown) throw fail('MV_USAGE', 'water labels need the masks', { code: 'WATER_GRID' });
  const R = raster();
  // progress phases: the band masks, regions of each band, the per-region sums, the distance, the anchors
  const pg = prog(o, 6);
  const B = mk.band, w = B.w, h = B.h, n = w * h, cell = B.cell;
  const bandD = B.data, dep = mk.depth.data, dr = mk.drown.data;
  const bitsIds = (mk.drown.meta && mk.drown.meta.bits) || [];
  const m2 = cell * cell / (UPM * UPM);
  const cx = k => B.ox + ((k % w) + 0.5) * cell, cy = k => B.oy + (Math.floor(k / w) + 0.5) * cell;
  const any = new Uint8Array(n), deep = new Uint8Array(n), own1 = new Uint8Array(n);
  pg.next();
  for (let k = 0; k < n; k++) { const b = bandD[k]; if (b >= 1) any[k] = 1; if (b >= 2) deep[k] = 1; if (b === 1) own1[k] = 1; }
  pg.next();
  const R1 = R.regions(maskGrid(B, any, 'b1'), pg.sub());
  pg.next();
  const R2 = R.regions(maskGrid(B, deep, 'b2'), pg.sub());
  pg.next();
  const g1 = R1.grid.data, g2 = R2.grid.data;
  const n1 = R1.list.length, n2 = R2.list.length;
  // per band-1 region: own part stats
  const own = { cnt: new Float64Array(n1 + 1), si: new Float64Array(n1 + 1), sj: new Float64Array(n1 + 1),
    dmin: new Float64Array(n1 + 1).fill(Infinity), dmax: new Float64Array(n1 + 1).fill(-Infinity), drown: new Uint32Array(n1 + 1) };
  const two = { dmin: new Float64Array(n2 + 1).fill(Infinity), dmax: new Float64Array(n2 + 1).fill(-Infinity), drown: new Uint32Array(n2 + 1),
    cnt: new Float64Array(n2 + 1), parent: new Uint32Array(n2 + 1) };
  for (let k = 0; k < n; k++) {
    if (k % w === 0) pg.row(k / w, h);
    const r = g1[k];
    if (!r) continue;
    const d = dep[k] === DEPTH_NODATA ? null : dep[k];
    if (own1[k]) {
      const i = k % w, j = (k - i) / w;
      own.cnt[r]++; own.si[r] += i; own.sj[r] += j;
      if (d !== null) { if (d < own.dmin[r]) own.dmin[r] = d; if (d > own.dmax[r]) own.dmax[r] = d; }
      own.drown[r] |= dr[k];
    } else {
      const q = g2[k];
      two.cnt[q]++;
      two.parent[q] = r;
      if (d !== null) { if (d < two.dmin[q]) two.dmin[q] = d; if (d > two.dmax[q]) two.dmax[q] = d; }
      two.drown[q] |= dr[k];
    }
  }
  // anchors of the band-1 own parts: the own cell farthest from the own part's edge, ties nearest the own centroid
  pg.next();
  const dist = R.distance(maskGrid(B, own1, 'own1'), Object.assign({ edge: true }, pg.sub())).data;
  pg.next();
  const best = new Int32Array(n1 + 1).fill(-1), bd = new Float64Array(n1 + 1).fill(-1), bc = new Float64Array(n1 + 1);
  for (let k = 0; k < n; k++) {
    if (k % w === 0) pg.row(k / w, h);
    if (!own1[k]) continue;
    const r = g1[k], i = k % w, j = (k - i) / w;
    const mi = own.si[r] / own.cnt[r], mj = own.sj[r] / own.cnt[r];
    const dc = (i - mi) * (i - mi) + (j - mj) * (j - mj);
    const dv = dist[k];
    if (dv > bd[r] || (dv === bd[r] && dc < bc[r])) { bd[r] = dv; bc[r] = dc; best[r] = k; }
  }
  // drown lists the classes with a drowning depth above 0 m (a ground vehicle or gun sinks there); a class whose depth is
  // 0 m or less sinks on every wet cell (GoH airborne, -0.75 m from an else water_level branch [I]) and goes to
  // drownAlways instead, so it does not mark every label of the map as drowning (the paint rule: paint/input.js
  // countsAsDrown). Same rule on every game; on as64 and mowas2 no class is at or below 0 m, so drownAlways is [].
  const bitsDepth = (mk.drown.meta && mk.drown.meta.depthM) || [];
  const ground = b => !(b < bitsDepth.length) || Number(bitsDepth[b]) > 0;
  const names = (m, gr) => { const out = []; for (let b = 0; b < bitsIds.length; b++) if (((m >>> b) & 1) && ground(b) === gr) out.push(bitsIds[b]); return out; };
  const items2 = new Map();
  for (const reg of R2.list) {
    items2.set(reg.id, { kind: 'waterLabel', band: 2, region: reg.id, x: reg.ax, y: reg.ay, area: two.cnt[reg.id] * m2,
      depthMin: r2(two.dmin[reg.id] / UPM), depthMax: r2(two.dmax[reg.id] / UPM), drown: names(two.drown[reg.id], true),
      drownAlways: names(two.drown[reg.id], false), merged: [] });
  }
  // the deeper region a band-1 region merges into: the largest band-2 region inside it (ties: the lowest id)
  const deepest = new Int32Array(n1 + 1);
  for (const reg of R2.list) {
    const p = two.parent[reg.id];
    if (!p) continue;
    const cur = deepest[p];
    if (!cur || two.cnt[reg.id] > two.cnt[cur]) deepest[p] = reg.id;
  }
  const items1 = [];
  for (const reg of R1.list) {
    const r = reg.id, area = own.cnt[r] * m2;
    // no own band-1 cells (type 4 next to dry ground, a lone swim cell): nothing to label or merge
    if (!own.cnt[r]) continue;
    if (area < MERGE_M2 && deepest[r]) {
      const t = items2.get(deepest[r]);
      if (!t.merged.includes(1)) t.merged.push(1);
      t.area += area;
      t.depthMin = Math.min(t.depthMin, r2(own.dmin[r] / UPM));
      t.depthMax = Math.max(t.depthMax, r2(own.dmax[r] / UPM));
      const m = new Set(t.drown.concat(names(own.drown[r], true)));
      t.drown = bitsIds.filter(id => m.has(id));
      const ma = new Set(t.drownAlways.concat(names(own.drown[r], false)));
      t.drownAlways = bitsIds.filter(id => ma.has(id));
      continue;
    }
    const k = best[r];
    items1.push({ kind: 'waterLabel', band: 1, region: r, x: cx(k), y: cy(k), area,
      depthMin: r2(own.dmin[r] / UPM), depthMax: r2(own.dmax[r] / UPM), drown: names(own.drown[r], true),
      drownAlways: names(own.drown[r], false), merged: [] });
  }
  pg.end();
  return items1.concat([...items2.values()]);
}

// ------------------------------------------------------------------ checks
// BLOCKED_NOT_DEADLY is per mover (design 5.1): one item per (drown class, connected region) of swim cells (types 4, 5
// within W) where that class does not drown; the item names the class in `cls`. "Blocked" = the pather K of types 4, 5 is
// 0 for every vanilla land profile [I: PATHER.SET of both games; a mod profile with K > 0 there is not looked at].
// Classes with the same depth share one region pass.
function checks(doc, grids, mk, which, o) {
  const want = which === undefined || which === null || which === 'all' ? CHECKS : [].concat(which);
  for (const c of want) if (!CHECKS.includes(c)) throw fail('MV_USAGE', 'water: no check named ' + c, { code: 'WATER_CHECK' });
  const R = raster();
  const B = mk.band, w = B.w, h = B.h, n = w * h, cell = B.cell;
  const W = typeof mk.W === 'number' ? mk.W : (B.meta && typeof B.meta.W === 'number' ? B.meta.W : wOf(doc, null));
  const t = grids.gtype.data, ht = grids.height.data, hs = grids.height.scale === undefined ? 1 : grids.height.scale, ho = grids.height.offset || 0;
  const hnd = heightNodata(grids.height);
  const st = grids.gtypeStored ? grids.gtypeStored.data : null;
  const mat = grids.material ? grids.material.data : null;
  const names = (grids.material && grids.material.meta && grids.material.meta.names) || {};
  const wetMat = new Uint8Array(256);
  for (const id of Object.keys(names)) if (WATER_MATERIALS.includes(String(names[id]).toLowerCase())) wetMat[Number(id) & 255] = 1;
  const bitIds = (mk.drown.meta && mk.drown.meta.bits) || [];
  const bitDepth = (mk.drown.meta && mk.drown.meta.depthM) || [];
  // the passes: one per code, BLOCKED_NOT_DEADLY one per distinct class depth (bit mask of the classes sharing it)
  const passes = [];
  for (const code of want) {
    if (code === 'PAINTED_ABOVE_LEVEL' && !st) continue;
    if (code === 'WET_LOOK_DRY_PLAY' && !mat) continue;
    if (code !== 'BLOCKED_NOT_DEADLY') { passes.push({ code, mask: 0, cls: [null] }); continue; }
    const groups = new Map();
    for (let b = 0; b < bitIds.length && b < MAX_BITS; b++) {
      const key = String(bitDepth[b]);
      if (!groups.has(key)) groups.set(key, { code, mask: (1 << b) >>> 0, cls: [] });
      groups.get(key).cls.push(bitIds[b]);
    }
    for (const g of groups.values()) passes.push(g);
  }
  const out = [];
  // progress phases: per pass the scan and the regions
  const pg = prog(o, 2 * passes.length);
  for (const ps of passes) {
    const code = ps.code;
    pg.next();
    const m = new Uint8Array(n);
    let hits = 0;
    for (let k = 0; k < n; k++) {
      if (k % w === 0) pg.row(k / w, h);
      if (hnd !== null && ht[k] === hnd) continue;                  // past the ground mesh (R16): no unit stands there
      const e = B.data[k] ? t[k] : (isWater(t[k]) ? 0 : t[k]);       // effective type: water above W reads dry
      let on = 0;
      if (code === 'BLOCKED_NOT_DEADLY') on = (e === 4 || e === 5) && (mk.drown.data[k] & ps.mask) === 0;
      else if (code === 'WET_LOOK_DRY_PLAY') on = wetMat[mat[k]] && !isWater(e) && (ht[k] * hs + ho) < W;
      else if (code === 'SWAMP') on = t[k] === 6;
      else if (code === 'PAINTED_ABOVE_LEVEL') on = isWater(st[k]) && !isWater(e);
      if (on) { m[k] = 1; hits++; }
    }
    pg.next();
    if (!hits) continue;
    const reg = R.regions(maskGrid(B, m, code), pg.sub());
    const gid = reg.grid.data, L = reg.list.length;
    const bx = new Int32Array(L + 1).fill(w), by = new Int32Array(L + 1).fill(h), ex = new Int32Array(L + 1).fill(-1), ey = new Int32Array(L + 1).fill(-1);
    const cnt = new Float64Array(L + 1);
    for (let k = 0; k < n; k++) {
      const id = gid[k];
      if (!id) continue;
      const i = k % w, j = (k - i) / w;
      cnt[id]++;
      if (i < bx[id]) bx[id] = i; if (i > ex[id]) ex[id] = i; if (j < by[id]) by[id] = j; if (j > ey[id]) ey[id] = j;
    }
    for (const cls of ps.cls) {
      for (const r of reg.list) {
        const item = { kind: 'check', code, x: r.ax, y: r.ay, region: r.id, cells: cnt[r.id], area: cnt[r.id] * cell * cell / (UPM * UPM),
          box: [B.ox + bx[r.id] * cell, B.oy + by[r.id] * cell, B.ox + (ex[r.id] + 1) * cell, B.oy + (ey[r.id] + 1) * cell] };
        if (cls !== null) item.cls = cls;
        out.push(item);
      }
    }
  }
  pg.end();
  // stable order: the codes in CHECKS order as asked, BLOCKED_NOT_DEADLY by class bit then region
  if (bitIds.length) {
    const bi = new Map(bitIds.map((id, i) => [id, i]));
    const ci = new Map(want.map((c, i) => [c, i]));
    out.sort((a, b) => (ci.get(a.code) - ci.get(b.code)) || ((a.cls ? bi.get(a.cls) : 0) - (b.cls ? bi.get(b.cls) : 0)) || (a.region - b.region));
  }
  return out;
}

module.exports = { VERSION, CLASSES, CHECKS, BAND, BAND_IDS, DEPTH_NODATA, MERGE_M2, ENTITY_SET, UPM,
  profile, masks, labels, checks, wOf, interaction, drownBits, drownCondition };

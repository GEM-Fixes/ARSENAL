// entcat category: what an object is, from its def folder, props, obstacle ID, structure and size (design 4; seed:
// tools/mapscen/mapscen.js classOf). First rule that fires wins; the rule id goes into entry.categoryRule.
//   categorize({key, name, desc, size:{w, d, h}|null, has(key)}) -> {category, rule}
// All rules are [I] (folder and prop conventions read from vanilla MoW:AS2 and GoH data, not from the game).
// Author: Imperator_Aug (ARSENAL, ia-ec95e3cb)
'use strict';

const CATEGORIES = ['building', 'building_part', 'wall', 'fence', 'emplacement', 'tree', 'bush', 'rock', 'wreck', 'bridge',
  'water_surface', 'ground_decal', 'road_decal', 'crater', 'service', 'placed_unit', 'other'];

const seg = (p, re) => p.split('/').some(s => re.test(s));
const ROAD_NAME = /(^|_)(road|roads|path|asphalt|rail|railway|street|highway|crossroad)(_|\d|$)|^country_road|^road|^path_|^asphalt/;
// texture patches kept in road or rail stamp folders: ground decals, not road surface (GoH _summer/road/grass_pathways_large,
// landscape/path_patch, road/dirt_smudge; both games' rail/cable_for_mish*, strand_cable_cond*) [I]; checked before ROAD_NAME
const PATCH_NAME = /(^|_)(patch|pathways|smudge|splatter|cable)(_|\d|$)/;
// overhead line wires (GoH electrical_posts/cabled_post*/cp*_wire*, MoW:AS2 railway/elevator*/cable_*): long thin parts that
// are no building; category other, rule line-wire. Fence and obstacle wires keep their own rules [I]
const WIRE_NAME = /(^|_)(wire|cable)s?(_?\d+[a-z]?)?(_x)?$/;
const isLineWire = (p, name) => /^construction\//.test(p) && !seg(p, /fence|obstacle|barb/) && WIRE_NAME.test(name);

// a def in <dir>/<part>/<part>.def whose <dir> also holds <dir name>.def is a part of that building (shed_euro_102a /
// shed102_corner1); vanilla keeps building parts that way in both games [I]
function isPartPath(key, has) {
  const s = key.split('/');
  if (s.length < 4) return false;
  const parent = s.slice(0, -2).join('/'), pname = s[s.length - 3];
  return !!(has && has(parent + '/' + pname + '.def'));
}

function categorize(o) {
  const key = String(o.key || '').toLowerCase(), name = String(o.name || '').toLowerCase();
  const p = key.replace(/^resource\/entity\//, '');
  const d = o.desc || { props: [], tags: [], structure: null, obstacleIds: {}, decal: null, mdl: null };
  const props = new Set(d.props || []), oid = (d.obstacleIds || {})[''] || null;
  const R = (category, rule) => ({ category, rule });
  const has = re => [...props].some(x => re.test(x));

  if (/^-vehicle\//.test(p) || /^vehicle\//.test(p)) return seg(p, /^x$/) || /_x$/.test(name) ? R('wreck', 'vehicle-x') : R('placed_unit', 'vehicle');
  if (/^(service|-service)\//.test(p)) return R('service', 'service');
  // sound emitters (GoH sfx/*.def, {Extension "sound.mdl"}): nothing physical on the map [I]
  if (/^sfx\//.test(p)) return R('service', 'sfx');
  if (/^landscape\/water/.test(p) || seg(p, /^water(_surface)?$/) && !d.mdl) return R('water_surface', 'water');
  if (/^landscape\/stamp/.test(p) || (d.decal && !d.mdl)) {
    if (PATCH_NAME.test(name)) return R('ground_decal', 'stamp-patch');
    if (seg(p, /^(road|roads|rail|railway)$/) || ROAD_NAME.test(name)) return R('road_decal', 'stamp-road');
    return R('ground_decal', 'stamp');
  }
  if (/^landscape\/cut_entity\//.test(p)) {
    if (props.has('crater') || seg(p, /shellhole|crater/) || /crater|shellhole|funnel/.test(name)) return R('crater', 'cut-crater');
    if (seg(p, /trench|dugout|foxhole/)) return R('emplacement', 'cut-trench');
    return R('other', 'cut-entity');
  }
  if (props.has('crater')) return R('crater', 'prop-crater');
  if (/^landscape\/rock/.test(p) || seg(p, /^(rock|rocks|stones?)$/)) return R('rock', 'rock');
  if (/^flora\/bush/.test(p) || props.has('bush')) return R('bush', 'bush');
  if (/^flora\//.test(p) || props.has('tree')) return R('tree', 'tree');
  if (seg(p, /wrecked_vehicles|model_trash|^wreck/)) return R('wreck', 'wreck');
  if (seg(p, /^bridges?$|^bridge_/) || /^bridge/.test(name)) return R('bridge', 'bridge');
  if (has(/^sand_?bags?/) || has(/sandbag/) || seg(p, /^fortifications?$|^trench/) || oid === 'sandbag') return R('emplacement', 'fortification');
  if (isLineWire(p, name)) return R('other', 'line-wire');
  if (isPartPath(key, o.has)) return R('building_part', 'part-folder');
  if (d.structure && d.structure.length) return R('building', 'structure');
  if (seg(p, /^fences?$/) || props.has('fence')) {
    if (props.has('wall') || props.has('concrete') || props.has('stone') || props.has('brick') || /wall/.test(name)) return R('wall', 'fence-wall');
    return R('fence', 'fence');
  }
  if (props.has('wall') || /(^|_)wall/.test(name)) return R('wall', 'wall');
  if (oid === 'building' || seg(p, /^buildings?$|^houses?$/)) return R('building', 'building');
  const s = o.size;
  if ((props.has('construction') || oid === 'construction') && s && s.w >= 80 && s.d >= 80 && s.h >= 60) return R('building', 'construction-size');
  return R('other', 'other');
}

module.exports = { categorize, CATEGORIES, isPartPath, PATCH_NAME, WIRE_NAME };

// ide kit pieces, group ter-1: ground-effect pieces 1 to 20 of (kind ia-terrain:
// set/interaction_terrain/effects/*.inc). Contract: tools/ide/README.md "tools/ide/kit" and the round-2 brief.
// Code checked against vanilla resource/gamelogic.pak set/interaction_terrain/ (read with tools/lib/pak.js).
// Scopes: top = file top level (an .inc is read inside {effects}), in:* = inside a named effect block,
// in:on = inside {on hit} / {on detonate}, in:if = an else branch of the {if stuff ...} chain.
// Author: Imperator_Aug (ARSENAL, ia-eb2ee6a8)
'use strict';
const BASE = { kinds: ['ia-terrain'], needs: [], lim: [], short: false, adv: false, wrap: false, task: null, since: '2026-11' };
const p = o => Object.assign({}, BASE, { f: {} }, o, o.tag === 'T' ? { adv: true } : {});

module.exports = { group: 'ter-1', pieces: [
  p({ id: 'b.ter.underwater', no: 1, sec: 'ter.water', size: 'medium', tag: 'V', role: 'block', scope: ['top'],
    code: '{"underwater"\n\t{on detonate\n\t\t("water_detonate")\n\t\t{if stuff "shell"\n\t\t\t{spawn "shellhole_big_ground"}\n\t\t}\n\t}\n}',
    src: 'set/interaction_terrain/effects/water.inc:121-129' }),

  p({ id: 'b.ter.air', no: 2, sec: 'ter.air', size: 'medium', tag: 'V', role: 'block', scope: ['top'],
    code: '{"air"\n\t{on detonate\n\t\t{if stuff "molotov_coctail"\n\t\t\t{spawn "ex_molot"}\n\t\telse stuff "dynamite"\n\t\t\t{spawn "ex_bomb_big"}\n\t\telse stuff "grenade"\n\t\t\t{spawn "ex_air_big"}\n\t\telse stuff "big shell fg bomb"\n\t\t\t{spawn "ex_bomb_big"}\n\t\telse stuff "size_maximum"\n\t\t\t{spawn "ex_air_big2"}\n\t\t}\n\t}\n}',
    src: 'set/interaction_terrain/effects/air.inc:2-16' }),

  // reuse in a later include rests on the shared-reader rule, which sdl/reader:15 marks [T] for sibling files
  p({ id: 'b.ter.reuse_water', no: 3, sec: 'ter.water', size: 'small', tag: 'T', role: 'pattern', scope: ['top'],
    code: '{"@effect@"\n\t{on hit ("water_hits")}\n\t{on detonate ("water_detonate")}\n}',
    f: { effect: { k: 'terrain', def: 'my_water' } },
    src: 'set/interaction_terrain/effects/water.inc:116-119' }),

  p({ id: 'b.ter.whole_define', no: 4, sec: 'ter.start-here', size: 'medium', tag: 'V', role: 'pattern', scope: ['top'],
    code: '(define "@macro@"\n\t{on hit ("water_hits")}\n\t{on detonate ("water_detonate")\n\t\t("water_bullets")\n\t\t{if stuff "shell"\n\t\t\t{spawn "shellhole_big_ground"}\n\t\t}\n\t}\n)\n{"@effect@"\n\t("@macro_2@")\n}',
    f: { macro: { k: 'macro', def: 'my_swamp_terrain' }, effect: { k: 'terrain', def: 'my_swamp' },
      macro_2: { k: 'macro', def: 'my_swamp_terrain' } },
    src: 'set/interaction_terrain/effects/water.inc:238-251' }),

  p({ id: 'b.ter.two_macros', no: 5, sec: 'ter.water', size: 'small', tag: 'V', role: 'pattern', scope: ['in:*'],
    code: '{on detonate\n\t("shallow_water_detonate")\n\t("water_bullets")\n}',
    src: 'set/interaction_terrain/effects/water.inc:111-114' }),

  p({ id: 'b.ter.water_bullets', no: 6, sec: 'ter.water', size: 'medium', tag: 'V', role: 'block', scope: ['top'],
    code: '(define "@macro@"\n\t{if stuff "zenite"\n\t\t{spawn "ex_bul_big_w"}\n\telse stuff "bullet"\n\t\t{spawn "ex_bul_sm_w"}\n\telse stuff "big shell extra"\n\t\t{spawn "ex_water_extra_big"}\n\telse stuff "big shell ap"\n\t\t{spawn "ex_water_big"}\n\telse stuff "big shell fg"\n\t\t{spawn "ex_water_big"}\n\telse stuff "shell ap"\n\t\t{spawn "ex_water_sm"}\n\telse stuff "big mortar"\n\t\t{spawn "ex_water_extra_big"}\n\telse stuff "mortar"\n\t\t{spawn "ex_water_big"}\n\t}\n)',
    f: { macro: { k: 'macro', def: 'my_water_bullets' } },
    src: 'set/interaction_terrain/effects/water.inc:3-21' }),

  p({ id: 'b.ter.water_hits', no: 7, sec: 'ter.water', size: 'medium', tag: 'V', role: 'block', scope: ['top'],
    code: '(define "@macro@"\n\t{if min_mass 50\n\t\t{spawn "spherewater_big"}\n\telse min_mass 0.5\n\t\t{spawn "spherewater_small"}\n\telse effector "human"\n\t\t{spawn "spherewater_big"}\n\telse effector "steel"\n\t\t{spawn "spherewater_small"}\n\t}\n)',
    f: { macro: { k: 'macro', def: 'my_water_hits' } },
    src: 'set/interaction_terrain/effects/water.inc:43-58' }),

  p({ id: 'b.ter.tree_skip', no: 8, sec: 'ter.hits', size: 'medium', tag: 'V', role: 'pattern', scope: ['in:*'],
    code: '{on hit\n\t{if min_mass 100\n\t\t{if effector "tree"\n\t\t\t{spawn "tree_crush"}\n\t\telse\n\t\t\t{spawn "spheredust_small"}\n\t\t}\n\telse min_mass 10\n\t\t{if not effector "tree"\n\t\t\t{spawn "spheredust_small_short"}\n\t\t}\n\t}\n}',
    src: 'set/interaction_terrain/effects/grass.inc:3-16' }),

  p({ id: 'b.ter.shell_ladder', no: 9, sec: 'ter.craters', size: 'large', tag: 'V', role: 'pattern', scope: ['in:if'],
    code: 'else stuff "shell size_minimum fg"\n\t{spawn "ex_fg_minimum"}\n\t{spawn "grenade_shellhole" terrain_texmod}\nelse stuff "shell size_minimum"\n\t{spawn "ex_ap_minimum"}\n\t{spawn "shellhole_small"}\nelse stuff "shell size_small fg"\n\t{spawn "ex_fg_small"}\n\t{spawn "crater_norm" terrain_texmod}\nelse stuff "shell size_small"\n\t{spawn "ex_ap_small"}\n\t{spawn "shellhole_small"}\nelse stuff "shell size_medium fg"\n\t{spawn "ex_fg_medium"}\n\t{spawn "crater_norm" terrain_texmod}\nelse stuff "shell size_medium"\n\t{spawn "ex_ap_medium"}\n\t{spawn "shellhole_medium"}\nelse stuff "shell size_big fg"\n\t{spawn "ex_fg_big"}\n\t{spawn "crater_norm" terrain_texmod}\nelse stuff "shell size_big"\n\t{spawn "ex_ap_medium"}\n\t{spawn "shellhole_medium"}\nelse stuff "shell size_maximum"\n\t{spawn "ex_fg_maximum"}\n\t{spawn "crater_big" terrain_texmod}',
    src: 'set/interaction_terrain/effects/ground.inc:43-69' }),

  p({ id: 'b.ter.bomb_offset', no: 10, sec: 'ter.craters', size: 'small', tag: 'V', role: 'pattern', scope: ['in:if'],
    code: 'else stuff "big shell extra"\n\t{spawn "ex_bomb_big" offset 0 0 @height@}\n\t{spawn "crater_norm" terrain_texmod}',
    f: { height: { k: 'units', def: 20 } },
    src: 'set/interaction_terrain/effects/ground.inc:72-74' }),

  p({ id: 'b.ter.no_crater', no: 11, sec: 'ter.craters', size: 'small', tag: 'V', role: 'pattern', scope: ['in:if'],
    code: 'else stuff "big shell fg bomb no_crater small"\n\t{spawn "shockwave"}\n\t{spawn "ex_anti_big"}\n\t{spawn "shellhole4d3"}\nelse stuff "big shell fg bomb no_crater"\n\t{spawn "ex_bomb_big"}\n\t{spawn "shellhole4d2"}',
    src: 'set/interaction_terrain/effects/ground.inc:78-84' }),

  p({ id: 'b.ter.mines', no: 12, sec: 'ter.explosions', size: 'medium', tag: 'V', role: 'pattern', scope: ['in:if'],
    code: 'else stuff "mine antipersonnel"\n\t{spawn "ex_grenade_big"}\n\t{spawn "shellhole_medium"}\nelse stuff "mine antitank"\n\t{spawn "ex_arm_big"}\n\t{spawn "shellhole_big"}\nelse stuff "mine clockwork"\n\t{spawn "ex_anti_big"}\n\t{spawn "shellhole_big"}\nelse stuff "dynamite_clockwork"\n\t{spawn "ex_bomb_big"}\n\t{spawn "shellhole_big"}\nelse stuff "tnt_bag"\n\t{spawn "ex_bomb_big"}\n\t{spawn "shellhole_big"}',
    src: 'set/interaction_terrain/effects/ground.inc:88-102' }),

  p({ id: 'b.ter.flare', no: 13, sec: 'ter.explosions', size: 'small', tag: 'V', role: 'pattern', scope: ['in:if'],
    code: 'else stuff "flaerammo"\n\t{spawn "artillery_explosion_flaer"}',
    src: 'set/interaction_terrain/effects/ground.inc:103-104' }),

  p({ id: 'b.ter.road_craters', no: 14, sec: 'ter.craters', size: 'small', tag: 'V', role: 'pattern', scope: ['in:if'],
    code: 'else stuff "dynamite"\n\t{spawn "ex_bomb_big"}\n\t{spawn "shellhole_big_road"}\nelse stuff "big shell fg bomb"\n\t{spawn "ex_bomb_big"}\n\t{spawn "crater_norm_road" terrain_texmod}',
    src: 'set/interaction_terrain/effects/road.inc:14-16, 72-74' }),

  // vanilla order kept: "grenade big" before "grenade", "big mortar" before "mortar", "big shell fg" before "shell fg"
  // (a shorter tag list also matches the bigger ammo, so the first matching branch wins)
  p({ id: 'b.ter.wood_bridge', no: 15, sec: 'ter.special-grounds', size: 'medium', tag: 'V', role: 'block', scope: ['top'],
    code: '{"@effect@"\n\t{on hit\n\t\t{spawn "spheredust_small_short"}\n\t}\n\t{on detonate\n\t\t{if stuff "molotov_coctail"\n\t\t\t{spawn "ex_molot"}\n\t\t\t{spawn "fire_molot_ground"}\n\t\telse stuff "grenade big"\n\t\t\t{spawn "ex_grenade_big"}\n\t\telse stuff "grenade"\n\t\t\t{spawn "ex_grenade_sm"}\n\t\telse stuff "bullet"\n\t\t\t{spawn "wood_hit_bul"}\n\t\telse stuff "big mortar"\n\t\t\t{spawn "ex_mort_big_wood"}\n\t\telse stuff "mortar"\n\t\t\t{spawn "ex_bomb_big_wood"}\n\t\telse stuff "big shell fg"\n\t\t\t{spawn "shockwave"}\n\t\t\t{spawn "ex_anti_big_wood"}\n\t\telse stuff "shell fg"\n\t\t\t{spawn "shockwave"}\n\t\t\t{spawn "ex_anti_big_wood"}\n\t\telse stuff "shell ap"\n\t\t\t{spawn "ex_mort_sm_wood"}\n\t\telse stuff "mine antitank"\n\t\t\t{spawn "ex_mort_big_wood"}\n\t\telse stuff "dynamite"\n\t\t\t{spawn "ex_bomb_big_wood"}\n\t\t}\n\t}\n}',
    f: { effect: { k: 'terrain', def: 'bridge_wood' } },
    src: 'set/interaction_terrain/effects/bridge.inc:79-130' }),

  p({ id: 'b.ter.snow', no: 16, sec: 'ter.special-grounds', size: 'medium', tag: 'V', role: 'pattern', scope: ['in:if'],
    code: 'else stuff "grenade"\n\t{spawn "ex_grenade_sm_snow"}\n\t{spawn "grenade_shellhole" terrain_texmod}\nelse stuff "bullet"\n\t{spawn "ex_bul_big_snow"}\nelse stuff "big shell fg bomb no_crater"\n\t{spawn "ex_bomb_big_snow"}\n\t{spawn "shellhole6_win2"}\nelse stuff "shell ap"\n\t{spawn "ex_arm_sm"}\n\t{spawn "snow_hit_big"}',
    src: 'set/interaction_terrain/effects/snow.inc:27-36, 76-78, 97-99' }),

  // the cited lines open the {if} chain; closed here so the piece stands alone, the cursor goes where the other branches follow
  p({ id: 'b.ter.wet_no_fire', no: 17, sec: 'ter.special-grounds', size: 'small', tag: 'V', role: 'pattern', scope: ['in:on'],
    code: '{if stuff "molotov_coctail"\n\t{spawn "ex_molot"}\n@^@\n}',
    src: 'set/interaction_terrain/effects/mud.inc:11-12' }),

  p({ id: 'b.ter.skin_crater', no: 18, sec: 'ter.craters', size: 'line', tag: 'I', role: 'act', scope: ['in:if', 'in:on'],
    code: '{spawn "@crater@#@skin@"}',
    f: { crater: { k: 'entity', def: 'grenade_shellhole' }, skin: { k: 'text', def: 'ground' } },
    src: 'set/interaction_terrain/effects/rock.inc:24, 27' }),

  p({ id: 'b.ter.debug', no: 19, sec: 'ter.test', size: 'line', tag: 'I', role: 'act', scope: ['in:on', 'in:if'], lim: ['INT-19'],
    code: '{con "@text@"}',
    f: { text: { k: 'text', def: 'hit on my ground' } },
    src: 'set/interaction_terrain/effects/water.inc:122' }),

  p({ id: 'b.ter.bombs_over_water', no: 20, sec: 'ter.water', size: 'small', tag: 'V', role: 'pattern', scope: ['in:if'],
    code: 'else stuff "big shell ap"\n\t{spawn "ex_watersh_big"}\nelse stuff "mortar"\n\t{spawn "ex_watersh_big"}',
    src: 'set/interaction_terrain/effects/water.inc:30-31, 38-39' }),
] };

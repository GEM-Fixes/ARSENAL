// ide kit pieces, group ent-b-1: entity file pieces 197 to 219 of (variants, includes, macros
// map-only lines, tag and seat removal, helper volumes, physics off, armour settings). Kit kind entity-def
// (entity/**/*.def, .inc, .ext); the macro and armour pieces also fit a properties/*.ext (props).
// Contract: tools/ide/README.md "tools/ide/kit"; source list Code checked against the
// vanilla lines named in src (MoW:AS2 install, e2.pak, e1.pak and gamelogic.pak read through tools/lib/pak.js).
// Author: Imperator_Aug (ARSENAL, ia-60fb9d43)
'use strict';
// BODY = places that take entity keys: the root block of a .def ({game_entity, {actor, {human), a shared .inc/.ext
// top level (the file the def includes), a macro body and a (mod ...) body.
const ROOT = ['top', 'in:game_entity', 'in:actor', 'in:human'];
const BODY = ROOT.concat(['in:define', 'in:mod']);
const P = (o) => Object.assign({ needs: [], short: false, adv: false, wrap: false, task: null, since: '2026-11' }, o);

module.exports = { group: 'ent-b-1', pieces: [
  // 197: written out from mortar.inc (props, armour macro, body volume, mass, model); the folder .def wraps it
  P({ id: 'ent.b.share.inc', no: 197, sec: 'ent.any.variants', kinds: ['entity-def'], scope: ['empty'], whole: true,
    role: 'data',
    code: '; shared body of one unit: each .def of this folder is only {game_entity (include "this_file.inc")}\n' +
      '(include "/properties/@base@.ext")\n' +
      '{props "vehicle" "@kind@" "@tag@"}\n' +
      '("@armor@")\n' +
      '\n' +
      '{volume "body"\n' +
      '\t{tags "body"}\n' +
      '\t{component "body"}\n' +
      '\t{thickness @mm@}\n' +
      '}\n' +
      '\n' +
      '{mass @mass@}\n' +
      '{Extension "@model@.mdl"}\n' +
      '@^@',
    f: {
      base: { k: 'choice', def: 'cannon', choices: ['cannon', 'tank', 'car', 'armoredcar', 'marine', 'airborne', 'railway'] },
      kind: { k: 'tag', def: 'cannon' },
      tag: { k: 'tag', def: 'cannon_small' },
      armor: { k: 'macro', def: 'armor_mortar' },
      mm: { k: 'number', def: 15, min: 0 },
      mass: { k: 'number', def: 150, min: 1 },
      model: { k: 'path', def: 'sgrw42' } },
    tag: 'V', lim: ['SDL-58'], src: 'e2:-vehicle/cannon/mortars/mortar.inc:1-83', size: 'medium' }),

  P({ id: 'ent.b.share.override', no: 198, sec: 'ent.any.variants', kinds: ['entity-def'], scope: ['empty'], whole: true,
    role: 'data',
    code: '{game_entity\n' +
      '\t(include "@shared@.inc")\n' +
      '\t{props "@extra_tag@"}\n' +
      '\t{extender "inventory"\n' +
      '\t\t{Box\n' +
      '\t\t\t{item "@mg@" filled {user "mgun"}}\n' +
      '\t\t}\n' +
      '\t}\n' +
      '\t{texmod "@variant@"}\n' +
      '\t@^@\n' +
      '}\n',
    f: {
      shared: { k: 'path', def: 'moto' },
      extra_tag: { k: 'tag', def: 'r12' },
      mg: { k: 'entity', def: 'mg42' },
      variant: { k: 'text', def: 'ger' } },
    tag: 'V', lim: ['HUM-25'], src: 'e2:-vehicle/car/moto/r12_ger2.def:1-10', size: 'small' }),

  P({ id: 'ent.b.copy.army', no: 199, sec: 'ent.any.variants', kinds: ['entity-def'], scope: ['empty'], whole: true,
    role: 'data',
    code: '; copy the whole original .def here unchanged, then change only what differs\n' +
      '{game_entity\n' +
      '\t(include "/properties/@base@.ext")\n' +
      '\t{Extension "@model@.mdl"}\n' +
      '\t@^@\n' +
      '}\n',
    f: {
      base: { k: 'choice', def: 'cannon', choices: ['cannon', 'tank', 'car', 'armoredcar', 'marine', 'airborne', 'railway'] },
      model: { k: 'path', def: 'Pak40' } },
    tag: 'V', lim: ['KEY-27'], src: 'e2:-vehicle/cannon/pak40/pak40_ger2.def (same bytes as pak40.def)', size: 'small' }),

  P({ id: 'ent.b.extfile', no: 200, sec: 'ent.any.includes', kinds: ['entity-def'], scope: ROOT, role: 'data',
    code: '{extension "@file@.ext"}',
    f: { file: { k: 'path', def: 'crew' } },
    tag: 'V', lim: [], src: 'e2:-vehicle/btr/sdkfz251_1/sdkfz251_1.def:5', size: 'line' }),

  P({ id: 'ent.b.include.prop', no: 201, sec: 'ent.any.includes', kinds: ['entity-def'], scope: ROOT, role: 'grammar',
    code: '(include "/properties/@base@.ext")',
    f: { base: { k: 'choice', def: 'tank', choices: ['tank', 'cannon', 'car', 'armoredcar', 'marine', 'airborne', 'railway',
      'stuff_small', 'stuff', 'barrel', 'car_crew', 'cannon_mgun', 'tank_unarmed'] } },
    tag: 'V', lim: [], src: 'e2:-vehicle/cannon/pak40/pak40.def:2', size: 'line' }),

  P({ id: 'ent.b.macro.local', no: 202, sec: 'ent.any.macros', kinds: ['entity-def'], scope: ROOT, role: 'pattern',
    code: '(define "crew_human"\n' +
      '\t{placer\n' +
      '\t\t{place "%place" {group "crew"} {linkbone "%place"} {turnoff {sensor} {shadow}}}\n' +
      '\t}\n' +
      '\t{boarder\n' +
      '\t\t{door "%door1"}\n' +
      '\t\t{link "%door1" "%place" {anm "%place"} {forward putoff} {reverse puton}}\n' +
      '\t}\n' +
      ')\n' +
      '("crew_human" place(@seat@) door1(@door@))\n' +
      '@^@',
    f: {
      seat: { k: 'text', def: 'commander' },
      door: { k: 'text', def: 'emit1' } },
    tag: 'V', lim: ['SDL-17', 'SDL-21'], src: 'e2:-vehicle/tank_light/marder_3h/marder_3h.def:57-67,80', size: 'medium' }),

  // 203 fixed: the vanilla form (armor_mantlet, armor_engine) puts %t into an armour setting, not into a volume
  P({ id: 'ent.b.macro.define', no: 203, sec: 'ent.any.macros', kinds: ['entity-def', 'props'], scope: ROOT, role: 'pattern',
    code: '(define "@name@"\n' +
      '\t{armor\n' +
      '\t\t{setting "@area@"\n' +
      '\t\t\t{thickness %t}\n' +
      '\t\t\t{volumes "@prefix@*"}\n' +
      '\t\t}\n' +
      '\t}\n' +
      ')\n' +
      '("@name_2@" t(@mm@))\n' +
      '@^@',
    f: {
      name: { k: 'macro', def: 'my_armor_engine' },
      area: { k: 'text', def: 'engine' },
      prefix: { k: 'text', def: 'engine' },
      name_2: { k: 'macro', def: 'my_armor_engine' },
      mm: { k: 'number', def: 12, min: 0 } },
    tag: 'V', lim: ['SDL-19', 'SDL-20'], src: 'gamelogic:properties/tank_unarmed.ext:196-203', size: 'small' }),

  P({ id: 'ent.b.macro.args', no: 204, sec: 'ent.any.macros', kinds: ['entity-def', 'props'], scope: ROOT, role: 'pattern',
    code: '(define "@name@"\n' +
      '\t{component %0\n' +
      '\t\t{RepairTime @seconds@}\n' +
      '\t}\n' +
      ')\n' +
      '("@name_2@" args "@part@")\n' +
      '@^@',
    f: {
      name: { k: 'macro', def: 'my_repair' },
      seconds: { k: 'seconds', def: 10, min: 0 },
      name_2: { k: 'macro', def: 'my_repair' },
      part: { k: 'text', def: 'wheelright1' } },
    tag: 'V', lim: ['SDL-19'], src: 'gamelogic:properties/vehicle.ext:49-60', size: 'small' }),

  P({ id: 'ent.b.math', no: 205, sec: 'ent.any.macros', kinds: ['entity-def', 'props'], scope: ['in:component'], role: 'grammar',
    code: '{RepairTime (* %@param@ @times@)}',
    f: {
      param: { k: 'text', def: 'repair' },
      times: { k: 'number', def: 100 } },
    tag: 'V', lim: [], src: 'gamelogic:properties/tank_unarmed.ext:148', size: 'line' }),

  P({ id: 'ent.b.mod.game', no: 206, sec: 'ent.any.multiplayer-only', kinds: ['entity-def'], scope: ROOT, role: 'block',
    code: '(mod "game:@map@"\n' +
      '\t{props "@tag@"}\n' +
      '\t{component "body"\n' +
      '\t\t{Able {break_by_pierce 0}}\n' +
      '\t}\n' +
      '\t{volume "@volume@" {thickness @mm@}}\n' +
      '\t@^@\n' +
      ')',
    f: {
      map: { k: 'text', def: 'escort' },
      tag: { k: 'tag', def: 'escort_truck' },
      volume: { k: 'text', def: 'wheelright1' },
      mm: { k: 'number', def: 4, min: 0 } },
    tag: 'V', lim: ['SDL-24', 'SDL-65'], src: 'e2:-vehicle/car/blitz3_6m/blitz3_6m.def:59-68', size: 'medium' }),

  P({ id: 'ent.b.props.remove', no: 207, sec: 'ent.any.tags', kinds: ['entity-def'], scope: BODY, role: 'data',
    code: '{props "-@tag@"}',
    f: { tag: { k: 'tag', def: 'turret' } },
    tag: 'V', lim: [], src: 'e2:-vehicle/tank_light/marder_3h/marder_3h.def:4', size: 'line' }),

  P({ id: 'ent.b.able.remove', no: 208, sec: 'ent.any.tags', kinds: ['entity-def'], scope: BODY, role: 'data',
    code: '{able "-@ability@"}',
    f: { ability: { k: 'able', def: 'emit_passangers_on_enemy' } },
    tag: 'V', lim: [], src: 'gamelogic:properties/marine.ext:6', size: 'line' }),

  P({ id: 'ent.b.place.remove', no: 209, sec: 'ent.vehicle.crew-and-seats', kinds: ['entity-def'], scope: BODY, role: 'data',
    code: '{placer\n' +
      '\t{place "@seat@" remove}\n' +
      '}',
    f: { seat: { k: 'text', def: 'commander' } },
    tag: 'V', lim: [], src: 'e2:-vehicle/cannon/maxim/maxim.def:49-54', size: 'small' }),

  P({ id: 'ent.b.crew.none', no: 210, sec: 'ent.vehicle.crew-and-seats', kinds: ['entity-def'], scope: BODY, role: 'data',
    code: '{placer\n' +
      '\t{crew 0}\n' +
      '\t{place "@seat@" remove}\n' +
      '}',
    f: { seat: { k: 'text', def: 'driver' } },
    tag: 'V', lim: ['HUM-33'], src: 'e2:-vehicle/tank_light/sdkfz303/sdkfz303.def:18-21', size: 'small' }),

  P({ id: 'ent.b.vol.hide', no: 211, sec: 'ent.any.volumes', kinds: ['entity-def'], scope: BODY, role: 'block',
    code: '{volume "@volume@"\n' +
      '\t{tags "no_target"}\n' +
      '\t{able {Visible 0} {Obstacle 0} {Contact 0}}\n' +
      '}',
    f: { volume: { k: 'text', def: 'gun' } },
    tag: 'V', lim: [], src: 'gamelogic:properties/tank_unarmed.ext:122-126', size: 'small' }),

  P({ id: 'ent.b.vol.noblast', no: 212, sec: 'ent.any.volumes', kinds: ['entity-def'], scope: BODY, role: 'block',
    code: '{Volume "@volume@"\n' +
      '\t{tags "body"}\n' +
      '\t{able {obstacle 0} {blast 0}}\n' +
      '\t{thickness @mm@}\n' +
      '}',
    f: {
      volume: { k: 'text', def: 'body' },
      mm: { k: 'number', def: 1, min: 0 } },
    tag: 'V', lim: ['KEY-03', 'DMG-15'], src: 'e2:-vehicle/cannon/maxim/maxim.def:65-70', size: 'small' }),

  P({ id: 'ent.b.sim.off', no: 213, sec: 'ent.any.physics', kinds: ['entity-def'], scope: BODY, role: 'data',
    code: '{simulation {able 0}}',
    f: {},
    tag: 'V', lim: [], src: 'e2:-vehicle/cannon/pz_turret/pz_turret.def:5', size: 'line' }),

  P({ id: 'ent.b.mp.ik', no: 214, sec: 'ent.gun.multiplayer-only', kinds: ['entity-def'], scope: ['in:extender'], role: 'data',
    code: '(mod "mp" {rotate_ik_Limit 0})',
    f: {},
    tag: 'V', lim: ['SDL-24'], src: 'e2:-vehicle/cannon/pak40/pak40.def:63', size: 'line' }),

  P({ id: 'ent.b.armor.volsides', no: 215, sec: 'ent.any.armour', kinds: ['entity-def'], scope: BODY, role: 'block',
    code: '{volume "@volume@"\n' +
      '\t{thickness @all@\n' +
      '\t\t{front @front@}\n' +
      '\t\t{rear @rear@}\n' +
      '\t\t{top @top@}\n' +
      '\t}\n' +
      '}',
    f: {
      volume: { k: 'text', def: 'turret' },
      all: { k: 'number', def: 45, min: 0 },
      front: { k: 'number', def: 52, min: 0 },
      rear: { k: 'number', def: 20, min: 0 },
      top: { k: 'number', def: 20, min: 0 } },
    tag: 'V', lim: ['KEY-16', 'DMG-06', 'DMG-05'], src: 'e2:-vehicle/cannon/pz_turret/pz_turret.def:7-13', size: 'small' }),

  P({ id: 'ent.b.armor.area', no: 216, sec: 'ent.any.armour', kinds: ['entity-def', 'props'], scope: BODY, role: 'block',
    code: '{armor\n' +
      '\t{setting "@area@"\n' +
      '\t\t{thickness @front@ @side@ @rear@ @top@}\n' +
      '\t\t{volumes "@prefix@*"}\n' +
      '\t}\n' +
      '}',
    f: {
      area: { k: 'text', def: 'engine' },
      front: { k: 'number', def: 20, min: 0 },
      side: { k: 'number', def: 15, min: 0 },
      rear: { k: 'number', def: 10, min: 0 },
      top: { k: 'number', def: 10, min: 0 },
      prefix: { k: 'text', def: 'engine' } },
    tag: 'V', lim: ['DMG-23', 'DMG-24', 'KEY-16'], src: 'gamelogic:properties/tank_unarmed.ext:196-203', size: 'medium' }),

  P({ id: 'ent.b.armor.threshold', no: 217, sec: 'ent.any.armour', kinds: ['entity-def', 'props'], scope: ['in:armor'], role: 'block',
    code: '{setting "@area@"\n' +
      '\t{threshold {pierce {calibre @calibre@}}}\n' +
      '\t{volumes "@prefix@*"}\n' +
      '}',
    f: {
      area: { k: 'text', def: 'body' },
      calibre: { k: 'number', def: 5, min: 0 },
      prefix: { k: 'text', def: 'body' } },
    tag: 'V', lim: [], src: 'gamelogic:properties/construction_generic.inc:19-32', size: 'small' }),

  P({ id: 'ent.b.armor.raycast', no: 218, sec: 'ent.any.armour', kinds: ['entity-def', 'props'], scope: ['in:armor'], role: 'block',
    code: '{setting "@area@"\n' +
      '\t{ray_cast_thickness}\n' +
      '\t{volumes "@prefix@*"}\n' +
      '}',
    f: {
      area: { k: 'text', def: 'body' },
      prefix: { k: 'text', def: 'body' } },
    tag: 'V', lim: [], src: 'gamelogic:properties/construction_generic.inc:19-32', size: 'small' }),

  P({ id: 'ent.b.armor.nowear', no: 219, sec: 'ent.any.armour', kinds: ['entity-def', 'props'], scope: BODY, role: 'block',
    code: '{armor\n' +
      '\t{setting "@area@"\n' +
      '\t\t{disable_damage_acc}\n' +
      '\t}\n' +
      '}',
    f: { area: { k: 'text', def: 'body' } },
    tag: 'V', lim: [], src: 'gamelogic:properties/construction_generic.inc:192-201', size: 'small' }),
] };

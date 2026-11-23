// ide kit pieces, group ent-c-2: entity .def idea pieces 261 to 278 of (crew, weapons
// explosives, movement, transport; contract: tools/ide/README.md "tools/ide/kit"). Converted from
// C rows ent.c.20 to ent.c.37, each code checked against the vanilla lines it cites
// (e1.pak, e2.pak, c1.pak, gamelogic.pak properties/...) or the engine reader (game/entity/...).
// Scopes: 'empty' = whole new file, 'in:game_entity' / 'in:actor' = inside the def root,
// 'in:weaponry' = inside {Weaponry, 'in:chassis' = inside {Chassis.
// Author: Imperator_Aug (ARSENAL, ia-202649c9)
'use strict';
const one = (o) => Object.assign({ kinds: ['entity-def'], needs: [], short: false, adv: false, wrap: false, task: null,
  since: '2026-11', f: {}, lim: [] }, o);
const IN = ['in:game_entity'];
const ROOT = ['in:game_entity', 'in:actor'];
module.exports = { group: 'ent-c-2', pieces: [
  // fixed: the list had ("seat_inside") before the macro, but the macro calls it itself (car_crew.ext:80-81);
  // the passenger board animation follows as in the vanilla truck
  one({ id: 'ent.c.20', no: 261, sec: 'ent.ideas.crew', size: 'small', tag: 'I', role: 'pattern', scope: IN,
    code: '("passenger_10_human_invisible")\n' +
      '{boarder\n' +
      '\t{anm "passenger"\n' +
      '\t\t{forward\t{begin\t"board_body"} {end "seat_passenger"}}\n' +
      '\t\t{reverse\t{end\t"emit_body" 1}}\n' +
      '\t}\n' +
      '}\n',
    src: 'e2:-vehicle/car/bedford/bedford.def:22-29' }),

  one({ id: 'ent.c.21', no: 262, sec: 'ent.ideas.more', size: 'small', tag: 'T', adv: true, role: 'recipe', scope: IN,
    code: '{Placer\n' +
      '\t{place "vehicle"\n' +
      '\t\t{Linkbone "@bone@"}\n' +
      '\t\t{handlebone "basis"}\n' +
      '\t\t{attach}\n' +
      '\t}\n' +
      '}\n',
    f: { bone: { k: 'bone', def: 'attach_vehicle' } },
    src: 'e2:-vehicle/train/platform/platform.def:7-13' }),

  // fixed: gunner and charger added (bm13.def:44-45); without them no seat works the launcher
  one({ id: 'ent.c.22', no: 263, sec: 'ent.ideas.weapons', size: 'small', tag: 'I', role: 'recipe', scope: IN,
    code: '{Weaponry\n' +
      '\t{place "gun"\n' +
      '\t\t{weapon "@weapon@" filled}\n' +
      '\t\t{Barrels @n@}\n' +
      '\t\t{charger "@crew@"}\n' +
      '\t\t{gunner "@crew_2@"}\n' +
      '\t\t{StationaryFiring}\n' +
      '\t}\n' +
      '}\n',
    f: { weapon: { k: 'text', def: 'weapon katusha' },
      n: { k: 'number', def: '16', min: 1, int: true },
      crew: { k: 'place', def: 'driver' },
      crew_2: { k: 'place', def: 'driver' } },
    src: 'e2:-vehicle/car/bm13/bm13.def:40-48' }),

  one({ id: 'ent.c.23', no: 264, sec: 'ent.ideas.weapons', size: 'small', tag: 'I', role: 'recipe', scope: ['in:weaponry'],
    code: '{place "flamer1"\n' +
      '\t{type "secondary_flamer"}\n' +
      '\t{weapon "flame_thrower_tank" filled}\n' +
      '\t{foresight "@foresight@"}\n' +
      '\t{basic}\n' +
      '}\n',
    f: { foresight: { k: 'bone', def: 'foresight5' } },
    lim: ['HUM-25'],
    src: 'e2:-vehicle/tank_medium/m4a3_zippo/m4a3_zippo.def:106-111' }),

  // the abm line of the vanilla second gun added (grant_m3.def:111)
  one({ id: 'ent.c.24', no: 265, sec: 'ent.ideas.weapons', size: 'medium', tag: 'I', role: 'recipe', scope: ['in:weaponry'],
    code: '{place "gun2"\n' +
      '\t{type "secondary_main"}\n' +
      '\t{weapon "@gun@" filling "@shell@" 1}\n' +
      '\t{foresight "@foresight@"}\n' +
      '\t{gunner "commander"}\n' +
      '\t{charger "commander"}\n' +
      '\t("abm_medium")\n' +
      '\t{basic}\n' +
      '}\n',
    f: { gun: { k: 'text', def: '37mm_m5' },
      shell: { k: 'text', def: 'bullet37 ap' },
      foresight: { k: 'bone', def: 'foresight2' } },
    src: 'e2:-vehicle/tank_medium/grant_m3/grant_m3.def:105-113' }),

  one({ id: 'ent.c.25', no: 266, sec: 'ent.ideas.weapons', size: 'medium', tag: 'V', role: 'recipe', scope: IN,
    code: '("gunner_visible")\n' +
      '{Weaponry\n' +
      '\t{place "mgun"\n' +
      '\t\t{type "mgun_aa"}\n' +
      '\t\t{weapon "@mg@" filled}\n' +
      '\t\t{gunner "gunner2"}\n' +
      '\t\t{charger "gunner2"}\n' +
      '\t\t{LinkBone "mgun_rot"}\n' +
      '\t\t{LinkAnimation "off"}\n' +
      '\t\t("abm_mgun_heavy")\n' +
      '\t}\n' +
      '}\n',
    f: { mg: { k: 'text', def: 'dshk' } },
    src: 'e2:-vehicle/tank_heavy/is2/is2.def:82,107-115' }),

  // value names checked: vanilla missions write {Impregnability full|harmless|disabled} on entities
  // (map.pak map/single/01_usa-skirmish/00b_usa-hurtgen/0.mi); never seen in a .def, so it stays T
  one({ id: 'ent.c.26', no: 267, sec: 'ent.ideas.more', size: 'line', tag: 'T', adv: true, role: 'recipe', scope: ROOT,
    code: '{impregnability @level@}\n',
    f: { level: { k: 'choice', def: 'full', choices: ['full', 'harmless', 'disabled'] } },
    src: '' }),

  one({ id: 'ent.c.27', no: 268, sec: 'ent.ideas.more', size: 'small', tag: 'I', role: 'recipe', scope: IN,
    code: '{props "vehicle" "car" "truck" "wheeled" "fuel_tank" "vision_vehicle_medium"}\n' +
      '("armor_fuel" args @k@)\n',
    f: { k: { k: 'number', def: '1.0' } },
    src: 'e2:-vehicle/car/gmc_fuel/gmc_fuel.def:5' }),

  one({ id: 'ent.c.28', no: 269, sec: 'ent.ideas.more', size: 'medium', tag: 'I', role: 'recipe', scope: IN,
    code: '{volume "inventory"\n' +
      '\t{tags "explosive"}\n' +
      '\t{thickness 0.1}\n' +
      '}\n' +
      '{extender "inventory"\n' +
      '\t{box\n' +
      '\t\t{item "@shell@ fg" @count@}\n' +
      '\t}\n' +
      '}\n',
    f: { shell: { k: 'text', def: 'ammo bullet75' },
      count: { k: 'number', def: '40', min: 1, int: true } },
    lim: ['DMG-18'],
    src: 'gamelogic:properties/tank_unarmed.ext:127-130' }),

  one({ id: 'ent.c.29', no: 270, sec: 'ent.ideas.more', size: 'small', tag: 'V', role: 'recipe', scope: IN,
    code: '{volume "sticky"\n' +
      '\t{tags "grenade_fg_target"}\n' +
      '\t{able clear {contact} {touch}}\n' +
      '\t{component "sticky_body"}\n' +
      '}\n' +
      '{component "sticky_body"}\n',
    src: 'e2:-vehicle/btr/m3/m3.def:10-15' }),

  one({ id: 'ent.c.30', no: 271, sec: 'ent.ideas.more', size: 'small', tag: 'I', role: 'recipe',
    whole: true, scope: ['empty'],
    code: '{game_entity\n' +
      '\t(include "sound.inc")\n' +
      '\t{extender "speaker"\n' +
      '\t\t{soundName "@sound@"}\n' +
      '\t\t{cycleTime @every@ @spread@}\n' +
      '\t\t{recoveryTime @rest@ @rest_spread@}\n' +
      '\t}\n' +
      '}\n',
    f: { sound: { k: 'sound', def: 'radio.ss_song' },
      every: { k: 'seconds', def: '45', min: 0 },
      spread: { k: 'seconds', def: '15', min: 0 },
      rest: { k: 'seconds', def: '20', min: 0 },
      rest_spread: { k: 'seconds', def: '5', min: 0 } },
    lim: ['GPL-15'],
    src: 'e1:service/sound/animal_cow.def:1-10' }),

  one({ id: 'ent.c.31', no: 272, sec: 'ent.ideas.more', size: 'medium', tag: 'T', adv: true, role: 'recipe', scope: ROOT,
    code: '{extender "vision_mode"\n' +
      '\t{timer_object\n' +
      '\t\t{tag "@mode@"}\n' +
      '\t\t{active_time @time@}\n' +
      '\t\t{cooldown @cooldown@}\n' +
      '\t\t{type "@type@"}\n' +
      '\t}\n' +
      '}\n',
    f: { mode: { k: 'choice', def: 'night', choices: ['night', 'thermal', 'drone'] },
      time: { k: 'number', def: '30', min: 0, int: true },
      cooldown: { k: 'number', def: '60', min: 0, int: true },
      type: { k: 'choice', def: 'recharge', choices: ['recharge', 'switch', 'consume'] } },
    lim: ['VIS-24', 'KEY-26'],
    src: '' }),

  one({ id: 'ent.c.32', no: 273, sec: 'ent.ideas.crew', size: 'small', tag: 'V', role: 'recipe', scope: IN,
    code: '{placer\n' +
      '\t{place "driver1" remove}\n' +
      '\t{place "driver2" remove}\n' +
      '}\n',
    src: 'e2:-vehicle/cannon/maxim/maxim.def:49-54' }),

  one({ id: 'ent.c.33', no: 274, sec: 'ent.ideas.more', size: 'small', tag: 'I', role: 'recipe', scope: IN,
    code: '{patherId "cannon.carried"}\n' +
      '{Chassis "human_carrier"\n' +
      '\t{carrierPlace "@seat@" "@seat_2@"}\n' +
      '\t{carrierBone "@handle@" "@handle_2@"}\n' +
      '\t("loco_carrier")\n' +
      '}\n',
    f: { seat: { k: 'place', def: 'driver1' },
      seat_2: { k: 'place', def: 'driver2' },
      handle: { k: 'bone', def: 'handle1' },
      handle_2: { k: 'bone', def: 'handle2' } },
    src: 'e2:-vehicle/cannon/mortars/mortar.inc:59-63' }),

  one({ id: 'ent.c.34', no: 275, sec: 'ent.ideas.movement', size: 'line', tag: 'T', adv: true, role: 'recipe',
    scope: ['in:chassis'],
    code: '{Driver "@group@"}\n',
    f: { group: { k: 'text', def: 'driver' } },
    src: '' }),

  one({ id: 'ent.c.35', no: 276, sec: 'ent.ideas.movement', size: 'line', tag: 'T', adv: true, role: 'recipe',
    scope: ['in:chassis'],
    code: '{DisableBackward}\n',
    lim: ['MOV-16'],
    src: '' }),

  // fixed: the hole volume tagged "attach" with the place name added (606_c1.def:42-45, tree_attach.def:5-9);
  // lowered V to I: {stealth} is only on a tree, the bare {boarder} only on a building part
  one({ id: 'ent.c.36', no: 277, sec: 'ent.ideas.more', size: 'small', tag: 'I', role: 'recipe', scope: IN,
    code: '{boarder}\n' +
      '{placer\n' +
      '\t{place "@n@" {attach squat_lie} {linkbone "@bone@"} {stealth}}\n' +
      '}\n' +
      '{Volume "@hole@"\n' +
      '\t{Tags "attach" "@n_2@"}\n' +
      '\t{able clear {hole}{touch 1}}\n' +
      '}\n',
    f: { n: { k: 'place', def: '1' },
      n_2: { k: 'place', def: '1' },
      bone: { k: 'bone', def: 'attach1' },
      hole: { k: 'text', def: 'hole1' } },
    src: 'e1:flora/tree/tree_attach/tree_attach.def:16' }),

  // written from platform.def in full (four wheels as vanilla)
  one({ id: 'ent.c.37', no: 278, sec: 'ent.ideas.more', size: 'medium', tag: 'V', role: 'data',
    whole: true, scope: ['empty'],
    code: '{actor\n' +
      '\t(include "/properties/railway.ext")\n' +
      '\t{mass @mass@}\n' +
      '\t{props "platform" "train_part" "no_minimap_view"}\n' +
      '\t{Extension "@model@.mdl"}\n' +
      '\t{Placer\n' +
      '\t\t{place "vehicle"\n' +
      '\t\t\t{Linkbone "attach_vehicle"}\n' +
      '\t\t\t{handlebone "basis"}\n' +
      '\t\t\t{attach}\n' +
      '\t\t}\n' +
      '\t}\n' +
      '\t("wheel" args "wheelright1")\n' +
      '\t("wheel" args "wheelleft1")\n' +
      '\t("wheel" args "wheelright2")\n' +
      '\t("wheel" args "wheelleft2")\n' +
      '\t{Volume "body"\n' +
      '\t\t{thickness 10}\n' +
      '\t}\n' +
      '\t{component "body"}\n' +
      '}\n',
    f: { mass: { k: 'number', def: '10000', min: 1 },
      model: { k: 'text', def: 'my_flatcar' } },
    src: 'e2:-vehicle/train/platform/platform.def:1-24' })
] };

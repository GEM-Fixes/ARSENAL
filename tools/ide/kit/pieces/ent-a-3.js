// ide kit pieces, group ent-a-3: entity file pieces 177-196 of (buildings, props, crates
// mines, aircraft, boats, trains, sound hooks, look, selection, targeting). Contract: tools/ide/README.md "tools/ide/kit".
// Source list: Every code was checked against the cited vanilla lines (as64 install paks).
// Author: Imperator_Aug (ARSENAL, ia-bcf1d4b6)
const IN = ['in:game_entity', 'in:actor'];
const L = (...a) => a.join('\n');
const P = (o) => Object.assign({ kinds: ['entity-def'], needs: [], lim: [], short: false, adv: false, wrap: false,
  task: null, since: '2026-11', tag: 'V' }, o);
const POSES = ['squat_lie', 'snipe_cover', 'hide_squat', 'hide_stand', 'open_lie'];

module.exports = { group: 'ent-a-3', pieces: [
  P({ id: 'ent.a.bld.fireplace', no: 177, sec: 'ent.building.fire-places', size: 'small', role: 'block', scope: IN,
    code: L('{boarder}', '{placer', '\t{place "@place@" {attach @pose@} {linkbone "@bone@"}}', '}',
      '{Volume "@volume@"', '\t{Tags "attach" "@place_2@"}', '\t{able clear {hole}{touch 1}}', '}'),
    f: { place: { k: 'text', def: '1' }, pose: { k: 'choice', def: 'squat_lie', choices: POSES },
      bone: { k: 'bone', def: 'attach1' }, volume: { k: 'text', def: 'hole1' }, place_2: { k: 'text', def: '1' } },
    src: 'c1:construction/africa/village/crete_606/606_c1/606_c1.def:7-10' }),

  P({ id: 'ent.a.bld.armor', no: 178, sec: 'ent.building.armour', size: 'line', role: 'data', scope: IN,
    code: '("@material@" args @k@)',
    // the args number is passed but the vanilla macros of construction_generic.inc:49-146 read no %0
    f: { material: { k: 'choice', def: 'armor_heavy', choices: ['armor_light', 'armor_medium', 'armor_heavy',
      'armor_house_wood', 'armor_house_wood_heavy', 'armor_house_concrete', 'armor_house_concrete_light'] },
      k: { k: 'number', def: 0.8 } },
    lim: ['STR-13'], src: 'c1:construction/africa/village/crete_606/606_c1/606_c1.def:5' }),

  P({ id: 'ent.a.prop.file', no: 179, sec: 'ent.object.whole-file', size: 'medium', role: 'data', scope: ['empty'], whole: true,
    code: L('{game_entity', '\t(include "/properties/construction.inc")',
      '\t{props "small" "concrete" "construction" "parts" "disable_area" "no_destroyed_stamp"}',
      '\t{Extension "@model@.mdl"}', '\t{Volume "@volume@"', '\t\t{thickness @mm@}', '\t\t{tags "body"}', '\t}',
      '\t{ObstacleId "construction"}', '\t{lodclass "decor_medium"}', '}'),
    f: { model: { k: 'path', def: 'my_prop' }, volume: { k: 'text', def: 'body' }, mm: { k: 'number', def: 15, min: 0 } },
    src: 'c1:construction/barricade_hlam/bath/bath.def:1-27' }),

  P({ id: 'ent.a.prop.barrel', no: 180, sec: 'ent.object.whole-file', size: 'small', role: 'data', scope: ['empty'], whole: true,
    code: L('{', '\t(include "/properties/barrel.ext")', '\t{extension "@model@.mdl"}', '}'),
    f: { model: { k: 'path', def: 'my_barrel' } },
    src: 'c1:construction/entourage/barrels/barrel/barrel.def:1-4' }),

  P({ id: 'ent.a.crate.box', no: 181, sec: 'ent.object.crates', size: 'medium', role: 'data', scope: ['empty'], whole: true,
    code: L('{game_entity', '\t(include "/properties/stuff.ext")',
      '\t{props "-steel" "wood" "fence" "construction" "inventory_box" "spread_items"}',
      '\t{collider "stuff.construction"}', '\t{extender "inventory"', '\t\t{box', '\t\t\t{size 8 6}', '\t\t\t{weight 600}',
      '\t\t\t{item "@item@" @count@}', '\t\t}', '\t}', '\t{Volume "body"', '\t\t{thickness 1}', '\t\t{able {touch}}', '\t}',
      '\t{Volume "select"', '\t}', '\t{extender "stuff"', '\t\t{item "box"}', '\t}', '\t{Extension "@model@.mdl"}', '}'),
    f: { item: { k: 'text', def: 'dynamite' }, count: { k: 'number', def: 1, min: 1, int: true },
      model: { k: 'path', def: 'my_box' } },
    src: 'e1:inventory/box1/box1.def:1-21' }),

  P({ id: 'ent.a.crate.supply', no: 182, sec: 'ent.object.supply', size: 'small', role: 'data', scope: IN,
    code: L('(include "/properties/resupply_generic.inc")', '("@preset@")'),
    f: { preset: { k: 'choice', def: 'para_ammo', choices: ['para_ammo', 'truck_ammo', 'truck_ammo_art'] } },
    src: 'e1:service/para_ammo/para_ammo.def:20-21' }),

  P({ id: 'ent.a.item.dropped', no: 183, sec: 'ent.object.items', size: 'small', role: 'data', scope: ['empty'], whole: true,
    code: L('{game_entity', '\t(include "/properties/stuff_small.ext")', '\t{Extension "@model@.mdl"}',
      '\t{extender "stuff"', '\t\t{item "@item@"}', '\t}', '\t{nogroupmesh 1}', '}'),
    f: { model: { k: 'path', def: 'my_rifle' }, item: { k: 'text', def: 'bren' } },
    src: 'e1:inventory/-weapon/BREN/BREN.def:1-8' }),

  P({ id: 'ent.a.mine.at', no: 184, sec: 'ent.object.mine', size: 'medium', role: 'data', scope: ['empty'], whole: true,
    code: L('{actor', '\t(include "/properties/stuff_mine.ext")', '\t{Extension "@model@.mdl"}', '\t{extender "stuff"',
      '\t\t{item "@item@"}', '\t}', '\t{extender "mine"', '\t\t{time @arm_time@}', '\t}', '\t{collider "mine.at"}',
      '\t{Obstacle "body"', '\t\t{Circle2', '\t\t\t{Radius @radius@}', '\t\t}', '\t}', '\t{Volume "body"', '\t\t{density 0}', '\t}', '}'),
    f: { model: { k: 'path', def: 'my_mine' }, item: { k: 'text', def: 'mine antitank' },
      arm_time: { k: 'seconds', def: 5.0, min: 0 }, radius: { k: 'number', def: 7.5, min: 0 } },
    lim: ['KEY-29'], src: 'e1:inventory/mine_antitank/mine_antitank.def:1-19' }),

  P({ id: 'ent.a.air.parts', no: 185, sec: 'ent.aircraft.parts', size: 'small', role: 'data', scope: IN,
    code: L('("part" args "@part1@")', '("part" args "@part2@")', '("part" args "@part3@")', '("part" args "@part4@")'),
    f: { part1: { k: 'text', def: 'elevator1' }, part2: { k: 'text', def: 'rudder' },
      part3: { k: 'text', def: 'aileron1' }, part4: { k: 'text', def: 'propeller' } },
    src: 'e2:-vehicle/airborne/bf109g/bf109g.def:19-28' }),

  P({ id: 'ent.a.air.chassis', no: 186, sec: 'ent.aircraft.movement', size: 'medium', role: 'block', scope: IN,
    code: L('{Chassis "airborne"', '\t{Locomotion ("locomotion")', '\t\t{Maxspeed @max_speed@}', '\t\t{turnRadius @radius@}',
      '\t}', '\t{maxSideSlope 70}', '\t{speed', '\t\t{Slow @slow@}', '\t\t{Normal @normal@}', '\t\t{Fast @fast@}', '\t}', '}'),
    f: { max_speed: { k: 'number', def: 95, min: 0 }, radius: { k: 'number', def: 50, min: 0 },
      slow: { k: 'number', def: 15, min: 0 }, normal: { k: 'number', def: 65, min: 0 }, fast: { k: 'number', def: 90, min: 0 } },
    src: 'e2:-vehicle/airborne/bf109g/bf109g.def:36-47' }),

  P({ id: 'ent.a.boat.float', no: 187, sec: 'ent.boat.volumes', size: 'small', role: 'block', scope: IN,
    code: L('{Volume "@volume@"', '\t{tags "float"}', '\t{Able clear {float}}', '}',
      '{Volume "@volume_2@"', '\t{tags "float"}', '\t{Able clear {float}}', '}'),
    f: { volume: { k: 'text', def: 'ballast1' }, volume_2: { k: 'text', def: 'ballast2' } },
    src: 'e2:-vehicle/marine/lcvp/lcvp.def:12-19' }),

  P({ id: 'ent.a.boat.ramp', no: 188, sec: 'ent.boat.behaviour', size: 'line', role: 'data', scope: IN,
    code: '{props "vehicle" "marine" "emit_on_sink" "open_with_land" "explosion_throw_crew" "car"}',
    f: {},
    src: 'e2:-vehicle/marine/lcvp/lcvp.def:5' }),

  P({ id: 'ent.a.train.flatcar', no: 189, sec: 'ent.train.whole-file', size: 'medium', role: 'data', scope: ['empty'], whole: true,
    code: L('{actor', '\t(include "/properties/railway.ext")', '\t{mass @mass@}', '\t{props "platform" "train_part" "no_minimap_view"}',
      '\t{Extension "@model@.mdl"}', '\t{Placer', '\t\t{place "vehicle"', '\t\t\t{Linkbone "attach_vehicle"}',
      '\t\t\t{handlebone "basis"}', '\t\t\t{attach}', '\t\t}', '\t}',
      '\t("wheel" args "wheelright1")', '\t("wheel" args "wheelleft1")', '\t("wheel" args "wheelright2")', '\t("wheel" args "wheelleft2")',
      '\t{Volume "body"', '\t\t{thickness 10}', '\t}', '\t{component "body"}', '}'),
    f: { mass: { k: 'number', def: 10000, min: 1 }, model: { k: 'path', def: 'my_platform' } },
    src: 'e2:-vehicle/train/platform/platform.def:1-24' }),

  P({ id: 'ent.a.snd.speaker', no: 190, sec: 'ent.sound-and-effects', size: 'small', role: 'data', scope: ['empty'], whole: true,
    code: L('{game_entity', '\t(include "sound.inc")', '\t{extender "speaker"', '\t\t{soundName "@sound@"}',
      '\t\t{cycleTime @every@ @spread@}', '\t\t{recoveryTime @rest@ @rest_spread@}',
      '\t\t{signalDepend "shot explosion movement"}', '\t}', '}'),
    f: { sound: { k: 'sound', def: 'world/animal/cow' }, every: { k: 'seconds', def: 45, min: 0 },
      spread: { k: 'seconds', def: 15, min: 0 }, rest: { k: 'seconds', def: 20, min: 0 }, rest_spread: { k: 'seconds', def: 5, min: 0 } },
    lim: ['GPL-15'], src: 'e1:service/sound/animal_cow.def:1-10' }),

  P({ id: 'ent.a.fx.sound', no: 191, sec: 'ent.sound-and-effects', size: 'line', role: 'data', scope: ['in:fx'],
    code: '{sound "@sound@"}',
    f: { sound: { k: 'sound', def: 'detonation/tank_die' } },
    lim: ['GPL-15'], src: 'e1:fx/detonation/tank_die.def:2' }),

  P({ id: 'ent.a.look.texmod', no: 192, sec: 'ent.any.look', size: 'line', role: 'data', scope: IN,
    code: '{texmod "@variant@"}',
    f: { variant: { k: 'text', def: 'd' } },
    src: 'e2:-vehicle/car/willysmb/willysmb_eng.def:90' }),

  P({ id: 'ent.a.ui.selection', no: 193, sec: 'ent.any.selection', size: 'line', role: 'data', scope: IN,
    code: '(include "/properties/selection/@kind@.inc" scale(@scale@))',
    f: { kind: { k: 'choice', def: 'vehicle', choices: ['vehicle', 'cannon', 'airborne'] }, scale: { k: 'number', def: 1.2, min: 0 } },
    src: 'e2:-vehicle/tank_medium/t34_0/t34_0.def:3' }),

  P({ id: 'ent.a.ui.longsel', no: 194, sec: 'ent.any.selection', size: 'line', role: 'data', scope: IN,
    code: '(include "/properties/selection/vehicle_elongate.inc" scalex(@long@) scaley(@wide@))',
    f: { long: { k: 'number', def: 1.8, min: 0 }, wide: { k: 'number', def: 1.0, min: 0 } },
    src: 'gamelogic:properties/selection/vehicle_elongate.inc:1-5' }),

  P({ id: 'ent.a.ui.number', no: 195, sec: 'ent.any.selection', size: 'small', role: 'block', scope: IN,
    code: L('{extender "enumerator"', '\t{digit_folder "@army@"}', '}'),
    f: { army: { k: 'choice', def: 'ger', choices: ['ger', 'ger2', 'usa'] } },
    src: 'e2:-vehicle/tank_light/marder_3h/marder_3h.def:6-8' }),

  P({ id: 'ent.a.ai.target', no: 196, sec: 'ent.any.targeting', size: 'small', role: 'data', scope: IN,
    code: L('{targetClass "@class@" "@ammo_tags@"}', '{targetSelector "@selector@"}'),
    f: { class: { k: 'choice', def: 'tank', choices: ['tank', 'light_tank', 'armoredcar', 'car', 'cannon', 'human', 'airborne'] },
      ammo_tags: { k: 'text', def: 'ap fg bullet' },
      selector: { k: 'choice', def: 'tank', choices: ['tank', 'tank_bullet', 'cannon_shell', 'cannon_bullet', 'cannon_rocket',
        'human', 'human_ap', 'human_bullet', 'human_fg', 'moto', 'searchlight'] } },
    lim: ['KEY-20'], src: 'gamelogic:properties/tank.ext:25-26' }),
] };

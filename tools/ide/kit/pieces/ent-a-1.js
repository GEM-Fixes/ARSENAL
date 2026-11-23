// ide kit pieces, group ent-a-1: entity .def pieces 135 to 155 of (tank, car, halftrack;
// contract: tools/ide/README.md "tools/ide/kit"). Converted A.1 to A.3, each code
// checked against the vanilla lines it cites (e2.pak -vehicle/..., gamelogic.pak properties/...).
// Scopes: 'empty' = whole new file, 'in:game_entity' = inside the {game_entity root, 'in:weaponry' = inside {Weaponry.
// Author: Imperator_Aug (ARSENAL, ia-d54c9508)
'use strict';
const one = (o) => Object.assign({ kinds: ['entity-def'], needs: [], short: false, adv: false, wrap: false, task: null,
  since: '2026-11', f: {}, lim: [] }, o);
const IN = ['in:game_entity'];
module.exports = { group: 'ent-a-1', pieces: [
  one({ id: 'ent.a.tank.top', no: 135, sec: 'ent.vehicle.tank', size: 'small', tag: 'V', role: 'data',
    whole: true, scope: ['empty'],
    code: '{game_entity\n' +
      '\t(include "/properties/tank.ext")\n' +
      '\t(include "/properties/selection/vehicle.inc" scale(@scale@))\n' +
      '\t{props "@weight_class@" "turret_rotator" "vision_vehicle_high" "muzzle_medium"}\n' +
      '\t{extender "enumerator"}\n' +
      '\t{Extension "@model@.mdl"}\n' +
      '\t@^@\n' +
      '}\n',
    f: { scale: { k: 'number', def: '1.2' },
      weight_class: { k: 'choice', def: 'medium', choices: ['light', 'medium', 'heavy'] },
      model: { k: 'text', def: 'my_tank' } },
    src: 'e2:-vehicle/tank_medium/t34_0/t34_0.def:1-6' }),

  one({ id: 'ent.a.tank.armor', no: 136, sec: 'ent.vehicle.tank', size: 'small', tag: 'V', role: 'data', scope: IN,
    code: '("@class@" turret(@tf@ @ts@ @tr@ @tt@) body(@bf@ @bs@ @br@ @bt@))\n' +
      '("armor_engine" t(@ef@ @es@ @er@ @et@))\n' +
      '("armor_mantlet" t(@mantlet@))\n',
    f: { class: { k: 'choice', def: 'armor_medium', choices: ['armor_light', 'armor_medium', 'armor_heavy'] },
      tf: { k: 'number', def: '52' }, ts: { k: 'number', def: '52' }, tr: { k: 'number', def: '52' }, tt: { k: 'number', def: '20' },
      bf: { k: 'number', def: '45' }, bs: { k: 'number', def: '45' }, br: { k: 'number', def: '45' }, bt: { k: 'number', def: '22' },
      ef: { k: 'number', def: '45' }, es: { k: 'number', def: '45' }, er: { k: 'number', def: '45' }, et: { k: 'number', def: '22' },
      mantlet: { k: 'number', def: '40' } },
    lim: ['DMG-06', 'KEY-16', 'DMG-24'],
    src: 'e2:-vehicle/tank_medium/t34_0/t34_0.def:40-42' }),

  one({ id: 'ent.a.tank.volumes', no: 137, sec: 'ent.vehicle.tank', size: 'medium', tag: 'V', role: 'block', scope: IN,
    code: '{volume "@body@"\n' +
      '\t{component "body"}\n' +
      '\t{tags "body"}\n' +
      '}\n' +
      '{volume "@turret@"\n' +
      '\t{component "turret"}\n' +
      '\t{tags "turret"}\n' +
      '}\n' +
      '{Volume "Gun"\n' +
      '\t{thickness @gun_mm@}\n' +
      '}\n',
    f: { body: { k: 'text', def: 'body1' }, turret: { k: 'text', def: 'turret1' }, gun_mm: { k: 'number', def: '30' } },
    lim: ['STR-01', 'STR-03'],
    src: 'e2:-vehicle/tank_medium/t34_0/t34_0.def:8-38' }),

  one({ id: 'ent.a.tank.crew4ext', no: 138, sec: 'ent.vehicle.tank', size: 'medium', tag: 'V', role: 'block', scope: IN,
    code: '("crew_4_human_extended")\n' +
      '{boarder\n' +
      '\t{anm "driver"\n' +
      '\t\t{forward {begin "board_t34_driver"} {end "seat_gunner_stand"} {base "open_driver"}}\n' +
      '\t\t{reverse {end "emit_t34_hold"} {base "close_driver"}}\n' +
      '\t}\n' +
      '\t{anm "left"\n' +
      '\t\t{forward {begin "board_Is-2"} {end "seat_m7_mgunner"}}\n' +
      '\t\t{reverse {end "emit_tank_1_hold"}}\n' +
      '\t}\n' +
      '\t{anm "right"\n' +
      '\t\t{forward {begin "board_Is-2"} {end "seat_m7_mgunner"}}\n' +
      '\t\t{reverse {end "emit_tank_1_hold"}}\n' +
      '\t}\n' +
      '}\n',
    lim: ['HUM-34'],
    src: 'e2:-vehicle/tank_medium/t34_0/t34_0.def:44-57' }),

  one({ id: 'ent.a.tank.riders', no: 139, sec: 'ent.vehicle.tank', size: 'medium', tag: 'V', role: 'block', scope: IN,
    code: '{boarder\n' +
      '\t{anm "armor"\n' +
      '\t\t{forward {begin "board_HighArmor"} {end "pose_seat_armor_1"}}\n' +
      '\t\t{reverse {end "emit_tank_2"}}\n' +
      '\t}\n' +
      '}\n' +
      '("seat_human" place(seat1) bone(seat01) door(emit3) animation(armor))\n' +
      '("seat_human" place(seat2) bone(seat02) door(emit4) animation(armor))\n' +
      '("seat_human" place(seat3) bone(seat03) door(emit5) animation(armor))\n' +
      '("seat_human" place(seat4) bone(seat04) door(emit6) animation(armor))\n',
    src: 'e2:-vehicle/tank_medium/t34_0/t34_0.def:58-66,72-75' }),

  one({ id: 'ent.a.tank.hullmg', no: 140, sec: 'ent.vehicle.weapons', size: 'small', tag: 'V', role: 'block', scope: ['in:weaponry'],
    code: '{place "@place@"\n' +
      '\t{type "mgun_hull"}\n' +
      '\t{weapon "@mg@" filled}\n' +
      '\t{foresight "@foresight@"}\n' +
      '\t{gunner "driver"}\n' +
      '\t{charger "driver"}\n' +
      '\t("abm_mgun")\n' +
      '}\n',
    f: { place: { k: 'text', def: 'mgun1' }, mg: { k: 'entity', def: 'dt' }, foresight: { k: 'bone', def: 'foresight4' } },
    lim: ['SDL-59'],
    src: 'e2:-vehicle/tank_medium/t34_0/t34_0.def:99-106' }),

  one({ id: 'ent.a.tank.chassis', no: 141, sec: 'ent.vehicle.movement', size: 'medium', tag: 'V', role: 'block', scope: IN,
    code: '{Chassis\n' +
      '\t("tank_trace" fx("tracks_mid") step(0.52) len(1.3))\n' +
      '\t{Locomotion ("locomotion")\n' +
      '\t\t{MaxSpeed @max_speed@}\n' +
      '\t\t{maxSpeedAtMaxTurn @turn_speed@}\n' +
      '\t}\n' +
      '\t{FuelBag\n' +
      '\t\t{volume @fuel@}\n' +
      '\t\t{rate @rate@}\n' +
      '\t\t{remain @fuel_2@}\n' +
      '\t\t{fuel "fuel"}\n' +
      '\t}\n' +
      '\t{speed\n' +
      '\t\t{Normal @normal@}\n' +
      '\t\t{Slow @slow@}\n' +
      '\t}\n' +
      '}\n',
    f: { max_speed: { k: 'number', def: '34' }, turn_speed: { k: 'number', def: '14' },
      fuel: { k: 'number', def: '540' }, rate: { k: 'number', def: '110' }, fuel_2: { k: 'number', def: '540' },
      normal: { k: 'number', def: '10' }, slow: { k: 'number', def: '16' } },
    lim: ['KEY-15', 'MOV-04', 'MOV-05', 'MOV-06', 'MOV-07'],
    src: 'e2:-vehicle/tank_medium/t34_0/t34_0.def:110-135' }),

  one({ id: 'ent.a.tank.mgrot', no: 142, sec: 'ent.vehicle.weapons', size: 'small', tag: 'V', role: 'block', scope: IN,
    code: '{bone "@bone@"\n' +
      '\t{limits @left@ @right@}\n' +
      '}\n',
    f: { bone: { k: 'bone', def: 'mgun_rot' }, left: { k: 'number', def: '-12' }, right: { k: 'number', def: '12' } },
    lim: ['KEY-06'],
    src: 'e2:-vehicle/tank_medium/t34_0/t34_0.def:142-144' }),

  one({ id: 'ent.a.tank.wreck_x', no: 143, sec: 'ent.vehicle.wreck', size: 'small', tag: 'V', role: 'data',
    whole: true, scope: ['empty'],
    code: '{game_entity\n' +
      '\t{Extension "@model@_x.mdl"}\n' +
      '}\n',
    f: { model: { k: 'text', def: 'my_tank' } },
    lim: ['STR-14', 'STR-31'],
    src: 'e2:-vehicle/tank_medium/x/t34_0_x/t34_0_x.def:1-3' }),

  one({ id: 'ent.a.tank.wreck_xx', no: 144, sec: 'ent.vehicle.wreck', size: 'medium', tag: 'V', role: 'data',
    whole: true, scope: ['empty'],
    code: '{game_entity\n' +
      '\t{Extension "@model@_xx.mdl"}\n' +
      '\t{Volume "body1"\n' +
      '\t}\n' +
      '\t{Volume "turret1"\n' +
      '\t}\n' +
      '\t{Volume "trackleft"\n' +
      '\t}\n' +
      '\t{Volume "trackright"\n' +
      '\t}\n' +
      '\t@^@\n' +
      '}\n',
    f: { model: { k: 'text', def: 'my_tank' } },
    lim: ['STR-14', 'STR-31'],
    src: 'e2:-vehicle/tank_medium/x/t34_0_xx/t34_0_xx.def:1-33' }),

  one({ id: 'ent.a.car.top', no: 145, sec: 'ent.vehicle.car', size: 'small', tag: 'V', role: 'data',
    whole: true, scope: ['empty'],
    code: '{game_entity\n' +
      '\t(include "/properties/car.ext")\n' +
      '\t(include "/properties/selection/vehicle.inc" scale(@scale@))\n' +
      '\t{props "vehicle" "car" "wheeled" "turn_over" "vision_vehicle_high" "-tractor"}\n' +
      '\t{PatherId "vehicle.small"}\n' +
      '\t("armor_light" args @k@)\n' +
      '\t{extender "enumerator"}\n' +
      '\t{Extension "@model@.mdl"}\n' +
      '\t@^@\n' +
      '}\n',
    f: { scale: { k: 'number', def: '1.1' }, k: { k: 'number', def: '1.0' }, model: { k: 'text', def: 'my_car' } },
    src: 'e2:-vehicle/car/willysmb/willysmb.def:1-8' }),

  one({ id: 'ent.a.car.wheels', no: 146, sec: 'ent.vehicle.volumes-and-parts', size: 'small', tag: 'V', role: 'data', scope: IN,
    code: '("wheel" args "wheelright1")\n' +
      '("wheel" args "wheelleft1")\n' +
      '("wheel" args "wheelright2")\n' +
      '("wheel" args "wheelleft2")\n',
    lim: ['MOV-20'],
    src: 'e2:-vehicle/car/willysmb/willysmb.def:16-19' }),

  one({ id: 'ent.a.car.crew', no: 147, sec: 'ent.vehicle.car', size: 'medium', tag: 'V', role: 'block', scope: IN,
    code: '("crew_2_human")\n' +
      '("crew_human" place(gunner) bone(gunner) door(emit3) animation(gunner))\n' +
      '{placer\n' +
      '\t{place "driver" {group "driver"} {visor "driver"}}\n' +
      '\t{place "commander" {group "driver"} {visor "main"}}\n' +
      '\t{place "gunner" {group "gunner"} {visor "main"} {turnoff {targetable 0}}}\n' +
      '}\n' +
      '("board_animation" place(driver) board_begin(board_willis_driver) board_end(seat_Willis_driver) base(doorleft))\n' +
      '("board_animation" place(commander) board_begin(board_willis) board_end(seat_Willis_passenger) base(doorright))\n' +
      '{boarder\n' +
      '\t{anm "gunner"\n' +
      '\t\t{forward {begin "board_LowTank_stand"} {end "seat_gunner_stand"}}\n' +
      '\t\t{reverse {end "emit_tank_1_hold" 1}}\n' +
      '\t}\n' +
      '}\n',
    src: 'e2:-vehicle/car/willysmb/willysmb.def:21-36' }),

  one({ id: 'ent.a.car.mgmount', no: 148, sec: 'ent.vehicle.weapons', size: 'medium', tag: 'V', role: 'block', scope: IN,
    code: '{extender "inventory"\n' +
      '\t{weapon "mgun"\n' +
      '\t\t{mask "weapon mgun"}\n' +
      '\t}\n' +
      '\t{Box\n' +
      '\t\t{size 5 6}\n' +
      '\t\t{item "ammo mgun" @rounds@}\n' +
      '\t\t{item "@mg@" filled {user "mgun"}}\n' +
      '\t}\n' +
      '}\n' +
      '{Weaponry\n' +
      '\t{place "mgun"\n' +
      '\t\t{type "mgun_main"}\n' +
      '\t\t{charger "gunner"}\n' +
      '\t\t{LinkBone "mgun"}\n' +
      '\t\t{LinkAnimation "off"}\n' +
      '\t\t("abm_mgun")\n' +
      '\t}\n' +
      '}\n',
    f: { rounds: { k: 'number', def: '1200', int: true }, mg: { k: 'entity', def: 'browning_m19' } },
    lim: ['HUM-23', 'HUM-25'],
    src: 'e2:-vehicle/car/willysmb/willysmb.def:49-67' }),

  one({ id: 'ent.a.car.chassis', no: 149, sec: 'ent.vehicle.movement', size: 'medium', tag: 'V', role: 'block', scope: IN,
    code: '{mass @mass@}\n' +
      '{Chassis\n' +
      '\t{Locomotion ("locomotion")\n' +
      '\t\t{Maxspeed @max_speed@}\n' +
      '\t\t{maxSpeedAtMaxTurn @turn_speed@}\n' +
      '\t}\n' +
      '\t{FuelBag\n' +
      '\t\t{volume @fuel@}\n' +
      '\t\t{rate @rate@}\n' +
      '\t\t{remain @fuel_2@}\n' +
      '\t\t{fuel "fuel"}\n' +
      '\t}\n' +
      '\t{speed\n' +
      '\t\t{Normal @normal@}\n' +
      '\t\t{Slow @slow@}\n' +
      '\t}\n' +
      '\t("car_trace" fx("tracewheel01a") step(0.08) wheell("wlf") wheelr("wrf") bonel("FXtraceL1") boner("FXtraceR1"))\n' +
      '\t("car_trace" fx("tracewheel01a") step(0.08) wheell("wlr") wheelr("wrr") bonel("FXtraceL2") boner("FXtraceR2"))\n' +
      '}\n',
    f: { mass: { k: 'number', def: '1250' }, max_speed: { k: 'number', def: '45' }, turn_speed: { k: 'number', def: '15' },
      fuel: { k: 'number', def: '60' }, rate: { k: 'number', def: '10' }, fuel_2: { k: 'number', def: '60' },
      normal: { k: 'number', def: '12' }, slow: { k: 'number', def: '25' } },
    lim: ['MOV-19', 'MOV-34'],
    src: 'e2:-vehicle/car/willysmb/willysmb.def:69-87' }),

  one({ id: 'ent.a.car.passengers10', no: 150, sec: 'ent.vehicle.car', size: 'small', tag: 'V', role: 'data', scope: IN,
    code: '("passenger_10_human")\n',
    src: 'e2:-vehicle/car/zis5/zis5.def:22' }),

  one({ id: 'ent.a.car.seatinside', no: 151, sec: 'ent.vehicle.car', size: 'line', tag: 'V', role: 'data', scope: IN,
    code: '("seat_inside")\n',
    src: 'e2:-vehicle/car/gmc/gmc.def:25' }),

  one({ id: 'ent.a.car.glass', no: 152, sec: 'ent.vehicle.volumes-and-parts', size: 'line', tag: 'I', role: 'data', scope: IN,
    code: '("glass_volume" args "@volume@")\n',
    f: { volume: { k: 'text', def: 'glass1' } },
    src: 'gamelogic:properties/car.ext:89-94' }),

  one({ id: 'ent.a.btr.top', no: 153, sec: 'ent.vehicle.halftrack', size: 'small', tag: 'V', role: 'data',
    whole: true, scope: ['empty'],
    code: '{game_entity\n' +
      '\t(include "/properties/armoredcar.ext")\n' +
      '\t(include "/properties/selection/vehicle.inc" scale(@scale@))\n' +
      '\t{Extension "@model@.mdl"}\n' +
      '\t{extension "crew.ext"}\n' +
      '\t{props "vehicle" "armored_car" "tank" "turret" "wheeled" "explosion_throw_crew" "vision_vehicle_medium"}\n' +
      '\t{extender "enumerator"\n' +
      '\t\t{digit_folder "@army@"}\n' +
      '\t}\n' +
      '\t@^@\n' +
      '}\n',
    f: { scale: { k: 'number', def: '1.0' }, model: { k: 'text', def: 'my_halftrack' }, army: { k: 'text', def: 'ger' } },
    src: 'e2:-vehicle/btr/sdkfz251_1/sdkfz251_1.def:1-10' }),

  one({ id: 'ent.a.btr.crewext', no: 154, sec: 'ent.vehicle.halftrack', size: 'medium', tag: 'V', role: 'data',
    whole: true, scope: ['empty'],
    code: ';SDL\n' +
      '{boarder\n' +
      '\t{anm "passengers"\n' +
      '\t\t{forward {begin "board_SdKfz251-1"} {end "seat_passenger"}}\n' +
      '\t\t{reverse {end "emit_tank_1"}}\n' +
      '\t}\n' +
      '\t{anm "driver"\n' +
      '\t\t{forward {begin "board_SdKfz251-1"} {end "seat_driver_car"}}\n' +
      '\t\t{reverse {end "emit_body" 1}}\n' +
      '\t}\n' +
      '\t{anm "gunner"\n' +
      '\t\t{forward {begin "board_SdKfz251-1"} {end "seat_gunner_stand"}}\n' +
      '\t\t{reverse {end "emit_body" 1}}\n' +
      '\t}\n' +
      '}\n' +
      '(define "crew_human"\n' +
      '\t{placer\n' +
      '\t\t{place "%place" {group "%group"} {linkbone "%bone"} {turnoff {sensor} {shadow}}}\n' +
      '\t}\n' +
      '\t{boarder\n' +
      '\t\t{door "%door"}\n' +
      '\t\t{link "%door" "%place" {anm "%animation"} {forward putoff} {reverse puton}}\n' +
      '\t}\n' +
      ')\n' +
      '{placer\n' +
      '\t{place "driver" {visor "driver"}}\n' +
      '\t{place "gunner" {visor "main"}}\n' +
      '}\n' +
      '("crew_human" place(driver) door(emit1) bone(driver) animation(driver) group(crew))\n' +
      '("crew_human" place(gunner) door(emit2) bone(gunner) animation(gunner) group(crew))\n' +
      '("crew_human" place(seat1) door(emit3) bone(seat01) animation(passengers) group(passengers))\n' +
      '("crew_human" place(seat2) door(emit4) bone(seat02) animation(passengers) group(passengers))\n' +
      '@^@\n',
    src: 'e2:-vehicle/btr/sdkfz251_1/crew.ext:1-40' }),

  one({ id: 'ent.a.btr.halftrack', no: 155, sec: 'ent.vehicle.movement', size: 'medium', tag: 'V', role: 'block', scope: IN,
    code: '("wheel" args "wheelright1")\n' +
      '("wheel" args "wheelleft1")\n' +
      '("tracks")\n' +
      '{Chassis\n' +
      '\t{Locomotion ("locomotion")\n' +
      '\t\t{MaxSpeed @max_speed@}\n' +
      '\t\t{maxSpeedAtMaxTurn @turn_speed@}\n' +
      '\t}\n' +
      '\t{FuelBag\n' +
      '\t\t{volume @fuel@}\n' +
      '\t\t{rate @rate@}\n' +
      '\t\t{remain @fuel_2@}\n' +
      '\t\t{fuel "fuel"}\n' +
      '\t}\n' +
      '\t{speed\n' +
      '\t\t{Normal @normal@}\n' +
      '\t\t{Slow @slow@}\n' +
      '\t}\n' +
      '\t; left track must be first\n' +
      '\t("tank_trace" fx("tracks_mid") step(0.5) len(0.86) boneleft("FXtraceL2") boneright("FXtraceR2"))\n' +
      '\t("car_trace" fx("tracewheel02") step(0.09) wheell("wlf") wheelr("wrf") bonel("FXtraceL1") boner("FXtraceR1"))\n' +
      '}\n',
    f: { max_speed: { k: 'number', def: '33' }, turn_speed: { k: 'number', def: '16' },
      fuel: { k: 'number', def: '160' }, rate: { k: 'number', def: '40' }, fuel_2: { k: 'number', def: '160' },
      normal: { k: 'number', def: '12' }, slow: { k: 'number', def: '20' } },
    src: 'e2:-vehicle/btr/sdkfz251_1/sdkfz251_1.def:114-140' }),
] };

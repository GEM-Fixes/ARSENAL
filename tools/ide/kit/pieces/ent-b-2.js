// ide kit pieces, group ent-b-2: entity file pieces 220-241 of (armour presets, seats and crew
// sights, extra weapons, parts, cargo boxes, skirts, amphibious chassis). Kit kind entity-def (.def and the shared .ext/.inc).
// Converted (round 2, brief kit2); every code line checked against the cited vanilla lines.
// Scope: 'in:game_entity' + 'top' = the root block of a .def or the top level of a shared .ext/.inc.
// Author: Imperator_Aug (ARSENAL, ia-0cbed320)
const T = ['in:game_entity', 'top'];
const base = { needs: [], short: false, wrap: false, task: null, since: '2026-11' };
const P = o => Object.assign({ adv: o.tag === 'T' }, base, o, { kinds: ['entity-def'] });
module.exports = { group: 'ent-b-2', pieces: [
  P({ id: 'ent.b.armor.preset', no: 220, sec: 'ent.building.armour', size: 'line', tag: 'V', role: 'data', scope: T,
    code: '("armor_@material@")',
    f: { material: { k: 'choice', def: 'sandbag',
      choices: ['hedgehog', 'fabric', 'stack', 'glass', 'sandbag', 'sandbag_woodbeam', 'post', 'wires', 'fence_wood'] } },
    lim: [], src: 'gamelogic:properties/construction_generic.inc:149' }),

  // fixed: the macro reads %armor (body thickness), vanilla calls it with armor(...) (e2:-vehicle/tank_light/ho-ni/ho-ni1.def:8)
  P({ id: 'ent.b.armor.spa', no: 221, sec: 'ent.vehicle.armour', size: 'line', tag: 'I', role: 'data', scope: T,
    code: '("armor_spa_light" armor(@armor@))',
    f: { armor: { k: 'text', def: '25 25 7 8' } },
    lim: [], src: 'gamelogic:properties/tank_unarmed.ext:336' }),

  P({ id: 'ent.b.armor.cannon', no: 222, sec: 'ent.gun.armour', size: 'line', tag: 'V', role: 'data', scope: T,
    code: '("armor_cannon" tur(@turret@) t_thr(@thr@) t_dur(@dur@) s(@shield@) b(@body@) w(@wheel@))',
    f: { turret: { k: 'number', def: 7, min: 0 }, thr: { k: 'number', def: 6, min: 0 }, dur: { k: 'number', def: 15, min: 0 },
      shield: { k: 'number', def: 4, min: 0 }, body: { k: 'number', def: 10, min: 0 }, wheel: { k: 'number', def: 14, min: 0 } },
    lim: [], src: 'gamelogic:properties/cannon_armor.ext:13' }),

  P({ id: 'ent.b.seat.armor', no: 223, sec: 'ent.vehicle.crew-and-seats', size: 'line', tag: 'V', role: 'data', scope: T,
    code: '("seat_human" place(@place@) bone(@bone@) door(@door@) animation(@anm@))',
    f: { place: { k: 'place', def: 'seat1' }, bone: { k: 'bone', def: 'seat01' }, door: { k: 'bone', def: 'emit3' },
      anm: { k: 'text', def: 'armor' } },
    lim: [], src: 'e2:-vehicle/tank_medium/t34_0/t34_0.def:72' }),

  P({ id: 'ent.b.seat.many', no: 224, sec: 'ent.vehicle.crew-and-seats', size: 'line', tag: 'I', role: 'data', scope: T,
    code: '("seat_@n@_human")',
    f: { n: { k: 'choice', def: '4', choices: ['2', '3', '4', '6', '9'] } },
    lim: [], src: 'gamelogic:properties/tank_crew.ext:98' }),

  P({ id: 'ent.b.seat.hidden', no: 225, sec: 'ent.vehicle.crew-and-seats', size: 'line', tag: 'I', role: 'data', scope: T,
    code: '("passenger_10_human_invisible")',
    f: {},
    lim: [], src: 'gamelogic:properties/car_crew.ext:80' }),

  P({ id: 'ent.b.crew.visible', no: 226, sec: 'ent.vehicle.crew-and-seats', size: 'line', tag: 'V', role: 'data', scope: T,
    code: '("crew_human_visible" place(@place@) door1(@door1@) door2(@door2@) visor(@visor@))',
    f: { place: { k: 'place', def: 'gunner2' }, door1: { k: 'bone', def: 'emit1' }, door2: { k: 'bone', def: 'emit2' },
      visor: { k: 'text', def: 'main' } },
    lim: [], src: 'e2:-vehicle/tank_heavy/black_prince/black_prince.def:67' }),

  P({ id: 'ent.b.crew.aagunner', no: 227, sec: 'ent.vehicle.weapons', size: 'medium', tag: 'V', role: 'block', scope: T,
    code: '("gunner_visible")\n{Weaponry\n\t{place "mgun"\n\t\t{type "mgun_aa"}\n\t\t{weapon "@mg@" filled}\n\t\t{gunner "gunner2"}\n' +
      '\t\t{charger "gunner2"}\n\t\t{LinkBone "mgun_rot"}\n\t\t{LinkAnimation "off"}\n\t\t("abm_mgun_heavy")\n\t}\n}',
    f: { mg: { k: 'text', def: 'dshk' } },
    lim: ['SDL-59'], src: 'e2:-vehicle/tank_heavy/is2/is2.def:82' }),

  P({ id: 'ent.b.crew.stealth', no: 228, sec: 'ent.object.fire-places', size: 'line', tag: 'V', role: 'data', scope: ['in:placer'],
    code: '{place "@n@" {attach squat_lie} {linkbone "@bone@"} {stealth}}',
    f: { n: { k: 'place', def: '1' }, bone: { k: 'bone', def: '1' } },
    lim: [], src: 'e1:flora/tree/tree_attach/tree_attach.def:16' }),

  P({ id: 'ent.b.visor', no: 229, sec: 'ent.any.vision', size: 'small', tag: 'V', role: 'block', scope: T,
    code: '{sensor\n\t{visor "@visor@"\n\t\t{vision "@vision@"}\n\t\t{bone "@bone@"}\n\t}\n}',
    f: { visor: { k: 'text', def: 'main' }, vision: { k: 'text', def: 'tank_main-l' }, bone: { k: 'bone', def: 'visor1' } },
    lim: ['VIS-25'], src: 'gamelogic:properties/tank_unarmed.ext:86' }),

  P({ id: 'ent.b.visor.seat', no: 230, sec: 'ent.any.vision', size: 'small', tag: 'V', role: 'block', scope: T,
    code: '{placer\n\t{place "@role@" {visor "@visor@"}}\n}',
    f: { role: { k: 'place', def: 'commander' }, visor: { k: 'text', def: 'main' } },
    lim: [], src: 'e2:-vehicle/car/willysmb/willysmb.def:23' }),

  P({ id: 'ent.b.wpn.second', no: 231, sec: 'ent.vehicle.weapons', size: 'medium', tag: 'V', role: 'block', scope: ['in:weaponry'],
    code: '{place "@place@"\n\t{type "secondary_main"}\n\t{weapon "@gun@" filling "@shell@" 1}\n\t{foresight "@foresight@"}\n' +
      '\t{gunner "commander"}\n\t{charger "commander"}\n\t("abm_medium")\n\t{basic}\n}',
    f: { place: { k: 'text', def: 'gun2' }, gun: { k: 'text', def: '37mm_m5' }, shell: { k: 'text', def: 'bullet37 ap' },
      foresight: { k: 'bone', def: 'foresight2' } },
    lim: ['SDL-59'], src: 'e2:-vehicle/tank_medium/grant_m3/grant_m3.def:105' }),

  P({ id: 'ent.b.wpn.flamer', no: 232, sec: 'ent.vehicle.weapons', size: 'small', tag: 'V', role: 'block', scope: ['in:weaponry'],
    code: '{place "@place@"\n\t{type "secondary_flamer"}\n\t{weapon "flame_thrower_tank" filled}\n\t{foresight "@foresight@"}\n\t{basic}\n}',
    f: { place: { k: 'text', def: 'flamer1' }, foresight: { k: 'bone', def: 'foresight5' } },
    lim: [], src: 'e2:-vehicle/tank_medium/m4a3_zippo/m4a3_zippo.def:106' }),

  P({ id: 'ent.b.wpn.aircannon', no: 233, sec: 'ent.aircraft.weapons', size: 'small', tag: 'V', role: 'block', scope: ['in:weaponry'],
    code: '{place "zenite"\n\t{weapon "@gun@" filled}\n\t{barrels @n@}\n\t{charger "driver"}\n\t{gunner "driver"}\n}',
    f: { gun: { k: 'text', def: '20mm_mg151' }, n: { k: 'number', def: 3, min: 1, int: true } },
    lim: [], src: 'e2:-vehicle/airborne/bf109g/bf109g.def:57' }),

  P({ id: 'ent.b.wpn.charge', no: 234, sec: 'ent.vehicle.weapons', size: 'small', tag: 'V', role: 'block', scope: ['in:weaponry'],
    code: '{place "charge"\n\t{weapon "weapon goliath" filling "ammo goliath" 1}\n\t{gunner "driver"}\n\t{charger "driver"}\n}',
    f: {},
    lim: [], src: 'e2:-vehicle/tank_light/sdkfz303/sdkfz303.def:30' }),

  P({ id: 'ent.b.comp.part', no: 235, sec: 'ent.any.volumes-and-parts', size: 'small', tag: 'V', role: 'block', scope: T,
    code: '{volume "@part@"\n\t{able {nowounddecal}}\n\t{thickness @mm@}\n\t{component "@part_2@"}\n}\n' +
      '{component "@part_3@"\n\t{RepairTime @seconds@}\n}',
    f: { part: { k: 'text', def: 'shield_front' }, part_2: { k: 'text', def: 'shield_front' },
      part_3: { k: 'text', def: 'shield_front' }, mm: { k: 'number', def: 1, min: 0 }, seconds: { k: 'seconds', def: 10, min: 0 } },
    lim: [], src: 'e2:-vehicle/car/gmc/gmc.def:50' }),

  // fixed: repair_kit cell 0 0 overlapped the list's other items; vanilla has it at 4 8 (gmc_eng.def:77)
  P({ id: 'ent.b.box.cells', no: 236, sec: 'ent.any.inventory', size: 'medium', tag: 'V', role: 'block', scope: T,
    code: '{extender "inventory"\n\t{box\n\t\t{size @w@ @h@}\n\t\t{clear}\n\t\t{item "hedgehog_kit" 1 {cell 0 0}}\n' +
      '\t\t{item "sandbag_kit" 10 {cell 2 0}}\n\t\t{item "barrel" 2 filling "fuel" 500 {cell 0 7}}\n' +
      '\t\t{item "antitank" "mine" 20 {cell 0 5}}\n\t\t{item "repair_kit" {cell 4 8}}@^@\n\t}\n}',
    f: { w: { k: 'number', def: 6, min: 1, max: 127, int: true }, h: { k: 'number', def: 10, min: 1, max: 127, int: true } },
    lim: ['HUM-21', 'HUM-23'], src: 'e2:-vehicle/car/gmc_eng/gmc_eng.def:58' }),

  P({ id: 'ent.b.box.clear', no: 237, sec: 'ent.any.inventory', size: 'small', tag: 'V', role: 'block', scope: T,
    code: '{extender "inventory"\n\t{box\n\t\t{clear}@^@\n\t}\n}',
    f: {},
    lim: [], src: 'e1:service/para_ammo/para_ammo.def:8' }),

  P({ id: 'ent.b.vol.explosive', no: 238, sec: 'ent.vehicle.volumes-and-parts', size: 'small', tag: 'V', role: 'block', scope: T,
    code: '{volume "inventory"\n\t{tags "explosive"}\n\t{thickness 0.1}\n}',
    f: {},
    lim: ['DMG-18'], src: 'gamelogic:properties/tank_unarmed.ext:127' }),

  P({ id: 'ent.b.shield.skirts', no: 239, sec: 'ent.vehicle.armour', size: 'medium', tag: 'V', role: 'block', scope: T,
    code: '{volume "@vol@"\n\t{tags "shield"}\n\t{component "@comp@"}\n}\n("shield" args @mm@)\n{extender "shield"\n\t{on}\n}\n' +
      '{component "@comp_2@" {tags "shield"}}',
    f: { vol: { k: 'text', def: 'shieldl1' }, comp: { k: 'text', def: 'shieldl1' }, comp_2: { k: 'text', def: 'shieldl1' },
      mm: { k: 'number', def: 10, min: 0 } },
    lim: [], src: 'e2:-vehicle/tank_medium/pz4h/pz4h.def:20' }),

  P({ id: 'ent.b.chassis.amphib', no: 240, sec: 'ent.vehicle.movement', size: 'medium', tag: 'V', role: 'block', scope: T,
    code: '{PatherID "amphibia"}\n{chassis "water"\n\t("chassis_defaults")\n\t{ignorePatherBounds}\n\t{waterline @line@}\n' +
      '\t{switch\n\t\t{terrain "water" "deep_water"}\n\t}\n}',
    f: { line: { k: 'number', def: 1.4, min: 0 } },
    lim: ['MOV-34'], src: 'e2:-vehicle/tank_light/lvt4/lvt4.def:7' }),

  P({ id: 'ent.b.chassis.leave', no: 241, sec: 'ent.vehicle.movement', size: 'small', tag: 'V', role: 'block', scope: ['in:chassis'],
    code: '{switch\n\t{exitFromWater}\n\t{terrain not "water" "deep_water"}\n}',
    f: {},
    lim: [], src: 'e2:-vehicle/tank_light/lvt4/lvt4.def:130' }),
] };

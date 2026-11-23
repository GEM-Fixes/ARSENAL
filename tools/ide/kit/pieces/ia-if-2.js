// Code Pieces, group ia-if-2: checks of an entity block (its parts and seats, how it moves, weather and ground, both, either, otherwise).
// Part kit (tools/ide/README.md "tools/ide/kit"); rows of text in ../lang/ia-if-2.js.
// Author: Imperator_Aug (ARSENAL, ia-f2746268)
'use strict';

// Every piece here is one check ({if ...}) that goes inside an event, another check, a delay or a container such as
// for_each_link (the game's own files put checks straight into a delay, cannon.inc:47-48).
const COND = ['handler', 'branch', 'timer', 'container'];
// events whose value is the impact or hit (words.json ctxOfEvent holds value), plus a custom name a call can carry
const VALUE_EVENTS = ['bullet_hit', 'pierce', 'blast_hit', 'blast', 'break_armor', 'break_armor_again', 'contact', 'ground_hit', 'fire', 'blow',
  'move', 'turn', 'custom'];
function c(o) {
  const p = {
    id: o.id, sec: o.sec, kinds: ['ia-entity'], scope: o.scope || COND, role: 'cond',
    code: o.code, f: o.f || {}, needs: o.needs || [],
    tag: o.tag, lim: o.lim || [], src: o.src, short: false,
    adv: o.tag === 'T', wrap: false, task: null, since: '2026-11'
  };
  if (o.events) p.events = o.events;
  return p;
}

module.exports = { group: 'ia-if-2', pieces: [
  // Its parts and seats
  c({ id: 'b.if.work', sec: 'ia.if.parts',
    code: '{if work\n\t@^@\n}',
    tag: 'V', src: 'set/interaction_entity/airborne.inc:516' }),
  c({ id: 'b.if.work_part', sec: 'ia.if.parts',
    code: '{if work "@part@"\n\t@^@\n}',
    f: { part: { k: 'tag', def: 'gun' } },
    tag: 'V', src: 'set/interaction_entity/vehicle.inc:566' }),
  c({ id: 'b.if.work_count', sec: 'ia.if.parts',
    code: '{if work "@part@" @count@\n\t@^@\n}',
    f: { part: { k: 'tag', def: 'wheel' }, count: { k: 'number', def: '1', min: 1, int: true } },
    tag: 'I', src: 'set/interaction_entity/car.inc:322' }),
  c({ id: 'b.if.broken', sec: 'ia.if.parts',
    code: '{if broken\n\t@^@\n}',
    tag: 'I', src: 'set/interaction_entity/airborne.inc:519' }),
  c({ id: 'b.if.broken_count', sec: 'ia.if.parts',
    code: '{if broken "@part@" @count@\n\t@^@\n}',
    f: { part: { k: 'tag', def: 'wheel' }, count: { k: 'number', def: '2', min: 1, int: true } },
    tag: 'V', src: 'set/interaction_entity/car.inc:324' }),
  c({ id: 'b.if.destroyed', sec: 'ia.if.parts',
    code: '{if destroyed\n\t@^@\n}',
    tag: 'I', src: 'set/interaction_entity/airborne.inc:530' }),
  c({ id: 'b.if.linked', sec: 'ia.if.parts',
    code: '{if linked\n\t@^@\n}',
    tag: 'V', src: 'set/interaction_entity/human.inc:346' }),
  c({ id: 'b.if.linked_to', sec: 'ia.if.parts',
    code: '{if linked "@host@"\n\t@^@\n}',
    f: { host: { k: 'tag', def: 'car' } },
    tag: 'V', src: 'set/interaction_entity/human.inc:347' }),
  c({ id: 'b.if.place', sec: 'ia.if.parts',
    code: '{if place "@role@"\n\t@^@\n}',
    f: { role: { k: 'tag', def: 'driver' } },
    tag: 'V', src: 'set/interaction_entity/human.inc:352' }),
  c({ id: 'b.if.crew_in_place', sec: 'ia.if.parts',
    code: '{if crew_in_place "@role@"\n\t@^@\n}',
    f: { role: { k: 'tag', def: 'gunner2' } },
    tag: 'V', src: 'set/interaction_entity/tank/general_scripts_defines.inc:77' }),
  c({ id: 'b.if.bone', sec: 'ia.if.parts',
    code: '{if bone "@bone@" @shown@\n\t@^@\n}',
    f: { bone: { k: 'bone', def: 'fx_glass1' }, shown: { k: 'choice', def: 'visible', choices: ['visible', ''] } },
    tag: 'V', src: 'set/interaction_entity/construction/windows.inc:3' }),
  c({ id: 'b.if.tex_mod', sec: 'ia.if.parts',
    code: '{if tex_mod "@variant@"\n\t@^@\n}',
    f: { variant: { k: 'tag', def: '1' } },
    tag: 'V', src: 'set/interaction_entity/dummy.inc:316' }),
  c({ id: 'b.if.tex_mod_any', sec: 'ia.if.parts',
    code: '{if tex_mod "@variant1@" "@variant2@"\n\t@^@\n}',
    f: { variant1: { k: 'tag', def: 'win' }, variant2: { k: 'tag', def: 'win1' } },
    tag: 'V', src: 'set/interaction_entity/flora.inc:132' }),

  // How it moves
  c({ id: 'b.if.velocity', sec: 'ia.if.move',
    code: '{if velocity @speed@\n\t@^@\n}',
    f: { speed: { k: 'number', def: '4', min: 0 } },
    tag: 'V', src: 'set/interaction_entity/fauna.inc:113' }),
  c({ id: 'b.if.min_speed', sec: 'ia.if.move', events: VALUE_EVENTS,
    code: '{if min_speed @speed@\n\t@^@\n}',
    f: { speed: { k: 'number', def: '5', min: 0 } },
    tag: 'V', src: 'set/interaction_entity/airborne.inc:314' }),
  c({ id: 'b.if.altitude', sec: 'ia.if.move',
    code: '{if altitude @meters@\n\t@^@\n}',
    f: { meters: { k: 'number', def: '3', min: 0 } },
    tag: 'V', src: 'set/interaction_entity/human.inc:713' }),
  c({ id: 'b.if.not_air', sec: 'ia.if.move',
    code: '{if not air\n\t@^@\n}',
    tag: 'V', src: 'set/interaction_entity/dummy.inc:241' }),
  c({ id: 'b.if.not_under_water', sec: 'ia.if.move',
    code: '{if not under_water\n\t@^@\n}',
    tag: 'V', src: 'set/interaction_entity/generic.inc:3' }),
  c({ id: 'b.if.water_level', sec: 'ia.if.move',
    code: '{if water_level @depth@\n\t@^@\n}',
    f: { depth: { k: 'number', def: '1.2' } },
    tag: 'V', src: 'set/interaction_entity/cannon.inc:204' }),
  c({ id: 'b.if.chassis', sec: 'ia.if.move',
    code: '{if chassis "@kind@"\n\t@^@\n}',
    f: { kind: { k: 'tag', def: 'airborne' } },
    tag: 'V', src: 'set/interaction_entity/airborne.inc:105' }),

  // Weather, time and ground
  c({ id: 'b.if.dark', sec: 'ia.if.world',
    code: '{if not sunlight\n\t@^@\n}',
    tag: 'V', src: 'set/interaction_entity/vehicle.inc:152' }),
  c({ id: 'b.if.not_rain', sec: 'ia.if.world',
    code: '{if not rain\n\t@^@\n}',
    tag: 'V', src: 'set/interaction_entity/car.inc:5' }),
  c({ id: 'b.if.fogged', sec: 'ia.if.world',
    code: '{if fogged\n\t@^@\n}',
    tag: 'V', src: 'set/interaction_entity/flora.inc:193' }),
  c({ id: 'b.if.difficulty', sec: 'ia.if.world',
    code: '{if difficulty "@level@"\n\t@^@\n}',
    f: { level: { k: 'tag', def: 'easy' } },
    tag: 'V', src: 'set/interaction_entity/human.inc:79' }),
  c({ id: 'b.if.terrain_fx', sec: 'ia.if.world',
    code: '{if terrain_fx "@ground@"\n\t@^@\n}',
    f: { ground: { k: 'terrain', def: 'road' } },
    tag: 'V', src: 'set/interaction_entity/human.inc:684' }),
  c({ id: 'b.if.flora_regenerate', sec: 'ia.if.world',
    code: '{if flora_regenerate\n\t@^@\n}',
    tag: 'V', src: 'set/interaction_entity/flora.inc:147' }),

  // Both, either, otherwise
  c({ id: 'b.if.not', sec: 'ia.if.logic',
    code: '{if not @check@\n\t@^@\n}',
    f: { check: { k: 'code', def: 'dead' } },
    tag: 'V', lim: ['INT-06'], src: 'set/interaction_entity/airborne.inc:24' }),
  c({ id: 'b.if.else', sec: 'ia.if.logic',
    code: '{if @check@\n\t@^@\nelse\n}',
    f: { check: { k: 'code', def: 'operatable' } },
    tag: 'V', src: 'set/interaction_entity/vehicle.inc:153-157' }),
  c({ id: 'b.if.else_check', sec: 'ia.if.logic',
    code: '{if @check1@\n\t@^@\nelse @check2@\n}',
    // defaults that need no hit details, so the piece fits every reaction (vanilla form: volume "engine" / else volume "body")
    f: { check1: { k: 'code', def: 'not sunlight' }, check2: { k: 'code', def: 'fogged' } },
    tag: 'V', lim: ['INT-06'], src: 'set/interaction_entity/airborne.inc:95-98' }),
  c({ id: 'b.if.else_not', sec: 'ia.if.logic',
    code: '{if @check1@\n\t@^@\nelse not @check2@\n}',
    f: { check1: { k: 'code', def: '"snow"' }, check2: { k: 'code', def: '"bare"' } },
    tag: 'V', src: 'set/interaction_entity/flora.inc:211-216' }),
  c({ id: 'b.if.inline', sec: 'ia.if.logic',
    code: '{if @check1@ @action1@\nelse @check2@ @action2@\nelse @action3@\n\t@^@\n}',
    f: {
      check1: { k: 'code', def: 'hit_side front' }, action1: { k: 'code', def: '{kill_flags front}' },
      check2: { k: 'code', def: 'hit_side back' }, action2: { k: 'code', def: '{kill_flags back}' },
      action3: { k: 'code', def: '{kill_flags front back}' }
    },
    tag: 'V', src: 'set/interaction_entity/human.inc:149-151' }),
  c({ id: 'b.if.both', sec: 'ia.if.logic',
    code: '{if @check1@\n\t{if @check2@\n\t\t@^@\n\t}\n}',
    // defaults that need no hit details (vanilla form: effector "vehicle" then min_speed 2)
    f: { check1: { k: 'code', def: 'operatable' }, check2: { k: 'code', def: 'not sunlight' } },
    tag: 'V', lim: ['INT-06'], src: 'set/interaction_entity/construction/special.inc:339-340' }),
  c({ id: 'b.if.either', sec: 'ia.if.logic',
    code: '{if @check1@\n\t{call "@name@"}\nelse @check2@\n\t{call "@name2@"}\n\t@^@\n}',
    f: {
      // defaults that need no hit details (vanilla form: component "body" / else component "engine")
      check1: { k: 'code', def: 'fogged' }, check2: { k: 'code', def: 'rain' },
      name: { k: 'event', def: 'fall' }, name2: { k: 'event', def: 'fall' }
    },
    needs: [{ handler: 'fall' }],
    tag: 'V', lim: ['INT-06'], src: 'set/interaction_entity/airborne.inc:106-110' })
] };

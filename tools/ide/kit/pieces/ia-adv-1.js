// Code Pieces, group ia-adv-1: Advanced sections "Rare events" (ia.adv.ev), "Rare and untried checks" (ia.adv.if),
// "Rare setup" (ia.adv.setup) and "Untried idea" (ia.adv.idea).
// Format: tools/ide/README.md "tools/ide/kit"; source: the catalog records of this group.
// Rows of text in ../lang/ia-adv-1.js. Every piece here is Advanced (adv:true).
// Author: Imperator_Aug (ARSENAL, ia-2a41fed3)
'use strict';

const base = { kinds: ['ia-entity'], f: {}, needs: [], lim: [], src: '', short: false, adv: true, wrap: false, task: null, since: '2026-11' };
const P = o => Object.assign({}, base, o);
// One reaction inside a named block.
const ev = o => P(Object.assign({ sec: 'ia.adv.ev', scope: ['block'], role: 'event', lim: ['INT-02'] }, o));
// One check inside an event, another check, a delay or a container (the game's own files put checks straight into a delay).
const cond = o => P(Object.assign({ sec: 'ia.adv.if', scope: ['handler', 'branch', 'timer', 'container'], role: 'cond' }, o));

// Names the game sends by itself as quoted events.
const ENGINE_NAMES = ['throw_off_end', 'throw_off_end_die', 'falldown', 'start_ammo_out', 'stop_ammo_out', 'start_ammo_refill',
  'start_veterancy', 'stop_veterancy', 'start_personage', 'stop_personage', 'start_personage_acute', 'start_blinded',
  'stop_blinded', 'activate', 'warm', 'linker_simulation', 'burn_crew_mp'];
// Pathfinding ground types (the only names terrain_pp knows).
const GROUND_TYPES = ['ground', 'road', 'swamp', 'shallow_water', 'water', 'deep_water', 'no_pass', 'no_pass_human'];
// Hit events (brief: "a hit event") plus ground_hit, where the game's own file uses volume_bone_level.
const HIT_EVENTS = ['bullet_hit', 'pierce', 'blast_hit', 'blast', 'break_armor', 'break_armor_again', 'ground_hit'];

module.exports = { group: 'ia-adv-1', pieces: [
  // Rare events
  ev({ id: 'b.event.engine_named',
    code: '{on "@name@"\n\t@^@\n}', event: '"@name@"',
    f: { name: { k: 'choice', def: 'start_ammo_out', choices: ENGINE_NAMES } },
    tag: 'I', src: 'set/interaction_entity/human.inc:745' }),
  ev({ id: 'b.event.slice_load',
    code: '{on "slice_load"\n\t@^@\n}', event: '"slice_load"',
    tag: 'V', src: 'set/interaction_entity/car.inc:219' }),
  ev({ id: 'b.event.takeoff_load',
    code: '{on "takeoff_load"\n\t@^@\n}', event: '"takeoff_load"',
    tag: 'V', src: 'set/interaction_entity/airborne.inc:29' }),
  ev({ id: 'b.event.pour_over',
    code: '{on "pour_over"\n\t@^@\n}', event: '"pour_over"',
    tag: 'V', src: 'set/interaction_entity/dummy.inc:453' }),
  ev({ id: 'b.event.plant',
    code: '{on "plant"\n\t@^@\n}', event: '"plant"',
    tag: 'V', src: 'set/interaction_entity/flora.inc:159' }),
  ev({ id: 'b.event.diving',
    code: '{on "diving"\n\t@^@\n}', event: '"diving"',
    tag: 'V', src: 'set/interaction_entity/human.inc:649' }),

  // Rare and untried checks
  cond({ id: 'b.if.simulating',
    code: '{if simulating\n\t@^@\n}',
    tag: 'V', src: 'set/interaction_entity/cannon.inc:116' }),
  cond({ id: 'b.if.terrain_pp',
    code: '{if terrain_pp "@prop@"\n\t@^@\n}',
    f: { prop: { k: 'choice', def: 'swamp', choices: GROUND_TYPES } },
    tag: 'T', src: 'set/interaction_entity/human.inc:638' }),
  cond({ id: 'b.if.direction', events: ['move', 'turn'],
    code: '{if @way@\n\t@^@\n}',
    f: { way: { k: 'choice', def: 'move_forward', choices: ['move_forward', 'move_backward', 'turn_left', 'turn_right'] } },
    lim: ['INT-22'], tag: 'T' }),
  cond({ id: 'b.if.always',
    code: '{if @value@\n\t@^@\n}',
    f: { value: { k: 'choice', def: 'false', choices: ['true', 'false'] } },
    tag: 'T' }),
  cond({ id: 'b.if.actor_state',
    code: '{if user_squad\n\t@^@\n}',
    tag: 'T' }),
  cond({ id: 'n.if.inactive',
    code: '{if inactive\n\t@^@\n}',
    tag: 'T' }),
  cond({ id: 'b.if.has_place',
    code: '{if has_place "@role@"\n\t@^@\n}',
    f: { role: { k: 'tag', def: 'commander' } },
    tag: 'T' }),
  cond({ id: 'b.if.volume_bone_level', events: HIT_EVENTS,
    code: '{if volume_bone_level @level@\n\t@^@\n}',
    f: { level: { k: 'number', def: '3', min: 0, int: true } },
    tag: 'V', src: 'set/interaction_entity/airborne.inc:323' }),

  // Rare setup
  P({ id: 'n.start.prop_register', sec: 'ia.adv.setup', scope: ['top'], role: 'block',
    code: '{"@name@"}',
    f: { name: { k: 'tag', def: 'my_unit' } },
    tag: 'V', src: 'set/interaction_entity/dummy.inc:736-741' }),
  P({ id: 'n.combo.engine_handlers', sec: 'ia.adv.setup', scope: ['block'], role: 'pattern',
    code: '{on operatable on}\n{on operatable off}',
    lim: ['INT-02'], tag: 'V', src: 'set/interaction_entity/cannon.inc:528-529' }),

  // Untried idea
  P({ id: 'n.idea.survivor', sec: 'ia.adv.idea', scope: ['top'], role: 'recipe',
    code: '{"@tags@"\n\t{on "_explosion"\n\t\t{if rand @chance@\n\t\t\t{delay 2\n\t\t\t\t{spawn_human "@breed@"\n\t\t\t\t}\n\t\t\t}\n\t\t}\n\t}\n}',
    f: {
      tags: { k: 'tags', def: 'my_unit' },
      chance: { k: 'chance', def: '0.3' },
      breed: { k: 'path', def: 'mp/ger/rifle' } },
    lim: ['NET-02'], tag: 'T', src: 'set/interaction_entity/car.inc:193' }),
] };

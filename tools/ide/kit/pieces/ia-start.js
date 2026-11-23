// Code Pieces, group ia-start: sections "Start here" (ia.start) and "Change the game's own reactions" (ia.change).
// Format: tools/ide/README.md "tools/ide/kit"; source: the catalog records of this group.
// Author: Imperator_Aug (ARSENAL, ia-9befe2ea)
'use strict';

// The 32 include lines of the game's own entity.set, in order (set/interaction_entity/entity.set:2-33).
const VANILLA_INCLUDES = [
  'generic.inc', 'dummy.inc', 'explosive.inc', 'grenade.inc', 'flora.inc', 'fauna.inc', 'human.inc', 'vehicle.inc',
  'car.inc', 'moto.inc', 'tank.inc', 'cannon.inc', 'airborne.inc', 'marine.inc', 'railway.inc', 'dogs.inc',
  'skirmish.inc', 'multiplayer.inc', 'muzzle.inc', 'construction/post.inc', 'construction/fence.inc',
  'construction/target.inc', 'construction/shed.inc', 'construction/dummy.inc', 'construction/generic.inc',
  'construction/windows.inc', 'construction/parts.inc', 'construction/staged.inc', 'construction/special.inc',
  'construction/building.inc', 'construction/burning.inc', 'construction/bridge.inc'
].map(function (n) { return '(include "' + n + '")'; }).join('\n\t');

const ENTITY = ['ia-entity'];
const base = { kinds: ENTITY, needs: [], lim: [], short: false, adv: false, wrap: false, task: null, since: '2026-11' };
const P = o => Object.assign({}, base, o);

module.exports = { group: 'ia-start', pieces: [
  P({ id: 'b.start.entity_set', sec: 'ia.start', scope: ['top'], role: 'block',
    code: '{entities\n\t@vanilla_includes@\n\t(include "@modfile@")\n}',
    f: { vanilla_includes: { k: 'list', def: VANILLA_INCLUDES }, modfile: { k: 'path', def: 'mymod.inc' } },
    tag: 'V', src: 'set/interaction_entity/entity.set:1-34' }),

  P({ id: 'b.start.mod_file', sec: 'ia.start', scope: ['top'], role: 'block',
    code: '{"@tags@"\n\t{on spawn\n\t\t@^@\n\t}\n}',
    f: { tags: { k: 'tags', def: 'my_unit' } },
    tag: 'V', src: 'set/interaction_entity/airborne.inc:1-4' }),

  P({ id: 'b.start.block', sec: 'ia.start', scope: ['top'], role: 'block',
    code: '{"@tags@"\n\t@^@\n}',
    f: { tags: { k: 'tags', def: 'my_unit' } },
    lim: ['INT-01'], tag: 'V', src: 'set/interaction_entity/vehicle.inc:549' }),

  P({ id: 'b.start.inflammation', sec: 'ia.start', scope: ['block'], role: 'data',
    code: '{inflammation_time @seconds@}',
    f: { seconds: { k: 'seconds', def: '10', min: 0 } },
    lim: ['DMG-17'], tag: 'V', src: 'set/interaction_entity/human.inc:2' }),

  P({ id: 'b.start.overload', sec: 'ia.change', scope: ['block'], role: 'event',
    code: '{on "@name@" overload\n\t@^@\n}',
    f: { name: { k: 'event', def: 'update_moveable' } }, event: '"@name@"',
    tag: 'V', src: 'set/interaction_entity/airborne.inc:58' }),

  P({ id: 'b.start.inherited', sec: 'ia.change', scope: ['handler', 'branch'], role: 'act',
    code: '{inherited}', f: {},
    tag: 'V', src: 'set/interaction_entity/airborne.inc:60' }),

  P({ id: 'b.start.switch_off', sec: 'ia.change', scope: ['block'], role: 'event',
    code: '{on "@name@" overload\n\t@^@\n}',
    f: { name: { k: 'event', def: 'tear_wheel' } }, event: '"@name@"',
    tag: 'V', src: 'set/interaction_entity/cannon.inc:209' }),

  P({ id: 'b.combo.filter_inherited', sec: 'ia.change', scope: ['block'], role: 'event',
    code: '{on "@name@" overload\n\t{if volume "@part@"\n\t\t{call "@handler@"}\n\t\t@^@\n\telse\n\t\t{inherited}\n\t}\n}',
    f: { name: { k: 'event', def: 'pierce' }, part: { k: 'tag', def: 'engine' }, handler: { k: 'event', def: 'break_part' } },
    event: '"@name@"', needs: [{ handler: 'break_part' }],
    tag: 'V', src: 'set/interaction_entity/airborne.inc:535-545' }),

  P({ id: 'b.start.skip_block', sec: 'ia.change', scope: ['top'], role: 'block',
    code: '{## "@tags@"\n\t@^@\n}',
    f: { tags: { k: 'tags', def: 'my_unit' } },
    tag: 'I', src: 'set/interaction_entity/dummy.inc:278' }),

  P({ id: 'b.start.define', sec: 'ia.change', scope: ['handler', 'branch', 'timer', 'container'], role: 'grammar',
    code: '(define "flash"\n\t{view start %0}\n\t{delay %1\n\t\t{view pause %0}\n\t}\n)\n("flash" args "@view@" @seconds@)',
    f: { view: { k: 'view', def: 'flash1' }, seconds: { k: 'seconds', def: '0.2', min: 0 } },
    tag: 'V', src: 'set/interaction_entity/railway.inc:199-213' }),

  P({ id: 'b.start.define_named', sec: 'ia.change', scope: ['block'], role: 'grammar',
    code: '(define "hook_event"\n\t{on %event\n\t\t{call "@handler@"}\n\t}\n)\n("hook_event" event(@event_words@))',
    f: { handler: { k: 'event', def: 'update_lights' }, event_words: { k: 'code', def: 'operatable on' } },
    needs: [{ handler: 'update_lights' }], lim: ['INT-02'],
    tag: 'V', src: 'set/interaction_entity/tank/general_scripts_defines.inc:92-98' }),

  P({ id: 'b.event.custom_overload', sec: 'ia.change', scope: ['block'], role: 'event',
    code: '{on "@name@" overload\n\t@^@\n}',
    f: { name: { k: 'event', def: 'pierce' } }, event: '"@name@"',
    tag: 'V', src: 'set/interaction_entity/airborne.inc:535' })
] };

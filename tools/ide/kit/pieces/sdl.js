// ide kit pieces, group sdl: the five pieces for any data file (section sdl.any; contract: tools/ide/README.md "tools/ide/kit").
// Converted from the catalog, records a.sdl.* and n.sdl.define) by "P3 kit-content".
// notKinds = kit kinds the catalog leaves the piece out of, although kinds holds 'sdl' (here: the interaction kinds)
// Author: Imperator_Aug (ARSENAL, ia-38a457d0)
const NOT_IA = ['ia-entity', 'ia-terrain', 'ia-terrain-map'];
module.exports = { group: 'sdl', pieces: [
  { id: 'a.sdl.comment',
    sec: 'sdl.any',
    kinds: ['sdl'],
    scope: ['top', 'block', 'handler', 'branch', 'timer', 'container'],
    role: 'grammar',
    code: '; @note@',
    f: { note: { k: 'comment', def: 'my change: faster reload' } },
    needs: [],
    tag: 'V',
    lim: ['SDL-02'],
    src: 'set/multiplayer/units/vehicles_rus.set:1',
    short: false,
    adv: false, wrap: false, task: null,
    since: '2026-11' },

  { id: 'a.sdl.include',
    sec: 'sdl.any',
    kinds: ['sdl'],
    scope: ['top', 'block'],
    role: 'grammar',
    code: '(include "@path@")',
    // a placeholder for the modder's own file (as in b.start.entity_set): a real vehicle file such as /properties/tank.ext
    // would bring vehicle keys into an interaction block, where the game stops on an unexpected token
    f: { path: { k: 'path', def: 'mymod.inc' } },
    needs: [],
    tag: 'V',
    lim: ['SDL-17'],
    src: 'set/interaction_entity/entity.set:2',
    short: false,
    adv: false, wrap: false, task: null,
    since: '2026-11' },

  { id: 'a.sdl.macro',
    sec: 'sdl.any',
    kinds: ['sdl'],
    // not for interaction files: no "speed" helper exists there (define not found, fatal); the ia pieces
    // b.start.define and b.start.define_named show the helper call in a reaction or a block
    notKinds: NOT_IA,
    scope: ['top', 'block', 'handler', 'branch', 'timer', 'container'],
    role: 'grammar',
    code: '("@macro@" @param@(@value@))',
    f: {
      macro: { k: 'macro', def: 'speed' },
      param: { k: 'input', def: 's' },
      value: { k: 'text', def: '679' }
    },
    needs: [],
    tag: 'V',
    lim: ['SDL-18', 'SDL-19', 'SDL-21'],
    src: 'set/stuff/gun/76mm_f34:8',
    short: false,
    adv: false, wrap: false, task: null,
    since: '2026-11' },

  { id: 'n.sdl.define',
    sec: 'sdl.any',
    kinds: ['sdl'],
    // not for interaction files: the call writes a data line ({speed ...}), an unexpected token there; the ia pieces
    // b.start.define and b.start.define_named are the interaction form
    notKinds: NOT_IA,
    // at the caret, so the define lands right above its call (the game's own files define inside blocks too)
    scope: ['top', 'block'],
    role: 'grammar',
    // v1 has no mirrored fields: the call line repeats the helper and input names as fields of their own (call, arg).
    code: '(define "@macro@"\n\t{@key@ (* @factor@ %@input@)}\n)\n("@call@" @arg@(@value@))',
    f: {
      macro: { k: 'macro', def: 'my_speed' },
      key: { k: 'text', def: 'speed' },
      factor: { k: 'number', def: '0.5' },
      input: { k: 'input', def: 's' },
      call: { k: 'macro', def: 'my_speed' },
      arg: { k: 'input', def: 's' },
      value: { k: 'number', def: '679' }
    },
    needs: [],
    tag: 'V',
    lim: ['SDL-17', 'SDL-18', 'SDL-21'],
    src: 'set/stuff/gun/.presets:4-6',
    short: false,
    adv: false, wrap: false, task: null,
    since: '2026-11' },

  { id: 'a.sdl.mponly',
    sec: 'sdl.any',
    kinds: ['sdl'],
    scope: ['top', 'block'],
    role: 'data',
    code: '(mod @which@\n\t@lines@\n)',
    f: {
      which: { k: 'choice', def: 'not "mp"', choices: ['"mp"', 'not "mp"', '"coop"'] },
      // a note as the default: kept as it is, the block is empty and loads in any file and scope ({texmod "2"}
      // from the cited stuff file is an unexpected token inside an interaction block)
      lines: { k: 'code', def: '; your lines here' }
    },
    needs: [],
    tag: 'V',
    lim: ['SDL-24', 'SDL-25', 'SDL-65'],
    src: 'set/stuff/reactive/arl_il2:8',
    short: false,
    adv: false, wrap: false, task: null,
    since: '2026-11' }
] };

// Code Pieces, group mi-lang-1: the trigger block, statement flow and condition terms of the mission language (.mi)
// (numbers 364 to 398; list section 2.1 and 2.2).
// Format: tools/ide/README.md "tools/ide/kit"; contract: Every code was checked against the
// cited vanilla mission lines (short names as in next-mission-language.md: hurtgen, bocage, overlord, bastogne, dison,
// road, argentan) and against the game in game/helper (,
// eTerm_*.cpp). Nesting: triggers sit in {triggers}, a trigger's keys in its quoted block
// terms in {terms}, statements in {actions} or a quoted statement ("if", "while", "loop", "case", "default").
// Author: Imperator_Aug (ARSENAL, ia-ee966ce6)
'use strict';

// code is written with two-space indents below and turned into tabs here (String.raw keeps the backslashes)
const T = s => s.replace(/^\n/, '').replace(/\n$/, '').replace(/^((?: {2})+)/gm, m => '\t'.repeat(m.length / 2));
const base = { needs: [], lim: [], short: false, adv: false, wrap: false, task: null, since: '2026-11', kinds: ['mi'] };
const P = o => Object.assign({}, base, o);

const IN_TERMS = ['in:terms'];
const IN_STMT = ['in:actions', 'in:*'];
const NUM = { k: 'number', def: 1, min: 1, max: 99, int: true };
const TERM_KINDS = ['arrival', 'camera', 'cmp_i', 'crew', 'difficulty', 'entities', 'event', 'inventory', 'linked', 'mined',
  'mission_option', 'mod', 'near', 'rand', 'see_actors', 'see_enemy', 'side', 'signal', 'task', 'trigger', 'waypoint_canmove'];
const OPS = ['==', '!=', '<<', '<<=', '>', '>='];

module.exports = { group: 'mi-lang-1', pieces: [
  P({ id: 'mi.trigger', no: 364, sec: 'mi.when.trigger', size: 'small', tag: 'V', role: 'block', scope: ['in:triggers'],
    lim: ['MIS-48'], src: 'hurtgen:13085',
    code: T(String.raw`
{"@name@"
  {condition
    {terms
      {"1.event"
        {id "@event@"}
      }
    }
  }
  {actions
    {"delay"
      {time 1}
    }
    @^@
  }
}
`),
    f: { name: { k: 'text', def: 'my_trigger' }, event: { k: 'text', def: 'my_event' } } }),

  P({ id: 'mi.trg.start', no: 365, sec: 'mi.when.trigger', size: 'small', tag: 'V', role: 'block', scope: ['in:triggers'],
    src: 'src: ; hurtgen:13085',
    code: T(String.raw`
{"@name@"
  {condition
  }
  {actions
    {"delay"
      {time 0.2}
    }
    @^@
  }
}
`),
    f: { name: { k: 'text', def: 'start' } } }),

  P({ id: 'mi.trg.disabled', no: 366, sec: 'mi.when.trigger', size: 'line', tag: 'V', role: 'data', scope: ['in:*'],
    src: 'src: ; hurtgen:14864', code: '{disabled}', f: {} }),

  P({ id: 'mi.trg.autoreset', no: 367, sec: 'mi.when.trigger', size: 'line', tag: 'I', role: 'data', scope: ['in:*'],
    src: 'src: ,104', code: '{autoreset}', f: {} }),

  P({ id: 'mi.trg.on', no: 368, sec: 'mi.adv', size: 'line', tag: 'I', role: 'data', scope: ['in:*'], adv: true,
    src: 'src: ', code: '{on}', f: {} }),

  P({ id: 'mi.trg.offmark', no: 369, sec: 'mi.adv', size: 'line', tag: 'V', role: 'grammar',
    scope: ['in:triggers', 'in:actions', 'in:terms', 'in:*'], adv: true, lim: ['MIS-01'], src: 'hurtgen:13799',
    code: T(String.raw`
{## "event"
  {event "@event@"}
  {mode reset}
  {delay 0}
}
`),
    f: { event: { k: 'text', def: 'menu_4' } } }),

  P({ id: 'mi.cond.all', no: 370, sec: 'mi.when.trigger', size: 'small', tag: 'V', role: 'cond', scope: ['in:*'],
    src: 'hurtgen:12769',
    code: T(String.raw`
{condition
  {terms
    {"1.event"
      {id "@event@"}
    }
    {"2.event"
      {id "@event_2@"}
    }
    @^@
  }
}
`),
    f: { event: { k: 'text', def: 'my_event_a' }, event_2: { k: 'text', def: 'my_event_b' } } }),

  P({ id: 'mi.cond.any', no: 371, sec: 'mi.when.trigger', size: 'small', tag: 'V', role: 'cond', scope: ['in:*'],
    src: 'hurtgen:13888-13895; src: ,277-282',
    code: T(String.raw`
{condition
  {type 1}
  {terms
    {"1.event"
      {id "@event@"}
    }
    {"2.event"
      {id "@event_2@"}
    }
    @^@
  }
}
`),
    f: { event: { k: 'text', def: 'menu_1' }, event_2: { k: 'text', def: 'menu_2' } } }),

  P({ id: 'mi.cond.expr', no: 372, sec: 'mi.when.trigger', size: 'small', tag: 'V', role: 'cond', scope: ['in:*'],
    lim: ['MIS-29', 'MIS-88'], src: 'hurtgen:13347',
    code: T(String.raw`
{condition
  {expression "@expr@"}
  {terms
    {"1.event"
      {id "@event@"}
    }
    {"2.event"
      {id "@event_2@"}
    }
    @^@
  }
}
`),
    f: { expr: { k: 'text', def: '1 & !2' }, event: { k: 'text', def: 'my_event_a' }, event_2: { k: 'text', def: 'my_event_b' } } }),

  P({ id: 'mi.cond.term', no: 373, sec: 'mi.if.terms', size: 'line', tag: 'V', role: 'grammar', scope: IN_TERMS,
    lim: ['MIS-35', 'MIS-27'], src: 'MIS-35; hurtgen:12771',
    code: T(String.raw`
{"@n@.@kind@"
  @^@
}
`),
    f: { n: Object.assign({}, NUM, { def: 3 }), kind: { k: 'choice', def: 'event', choices: TERM_KINDS } } }),

  P({ id: 'mi.st.delay', no: 374, sec: 'mi.do.flow', size: 'small', tag: 'V', role: 'act', scope: IN_STMT,
    src: 'hurtgen:13096; src: ,549',
    code: T(String.raw`
{"delay"
  {time @time@}
}
`),
    f: { time: { k: 'seconds', def: 2, min: 0 } } }),

  P({ id: 'mi.st.if', no: 375, sec: 'mi.do.flow', size: 'small', tag: 'V', role: 'act', scope: IN_STMT,
    src: 'hurtgen:12777',
    code: T(String.raw`
{"if"
  {condition
    {type difficulty}
    {level @level@}
  }
  {"delay"
    {time 2}
  }
  @^@
}
`),
    f: { level: { k: 'choice', def: 'heroic', choices: ['easy', 'normal', 'hard', 'heroic'] } } }),

  P({ id: 'mi.st.switch', no: 376, sec: 'mi.do.flow', size: 'medium', tag: 'V', role: 'act', scope: IN_STMT,
    lim: ['MIS-34'], src: 'road:178-; argentan:406',
    code: T(String.raw`
{"switch"
  {"case"
    {condition
      {type rand}
      {value @chance@}
    }
    {"delay"
      {time 0.1}
    }
    @^@
  }
  {"case"
    {condition
      {type rand}
      {value @chance_2@}
    }
    {"delay"
      {time 0.1}
    }
  }
  {"default"
    {"delay"
      {time 0.1}
    }
  }
}
`),
    f: { chance: { k: 'chance', def: 0.1, min: 0, max: 1 }, chance_2: { k: 'chance', def: 0.1, min: 0, max: 1 } } }),

  P({ id: 'mi.st.case', no: 377, sec: 'mi.do.flow', size: 'small', tag: 'V', role: 'act', scope: ['in:*'],
    src: 'road:179',
    code: T(String.raw`
{"case"
  {condition
    {type cmp_i}
    {var "@var@"}
    {op "@op@"}
    {value @value@}
  }
  {"delay"
    {time 0.1}
  }
  @^@
}
`),
    f: { var: { k: 'text', def: 'menu:1$' }, op: { k: 'choice', def: '==', choices: OPS }, value: { k: 'number', def: 1 } } }),

  P({ id: 'mi.st.default', no: 378, sec: 'mi.do.flow', size: 'small', tag: 'V', role: 'act', scope: ['in:*'],
    src: 'argentan:406',
    code: T(String.raw`
{"default"
  {"delay"
    {time 0.1}
  }
  @^@
}
`),
    f: {} }),

  P({ id: 'mi.st.loop', no: 379, sec: 'mi.do.flow', size: 'small', tag: 'V', role: 'act', scope: IN_STMT,
    src: 'bocage:22567; src: ',
    code: T(String.raw`
{"loop" @count@
  {"delay"
    {time @time@}
  }
  @^@
}
`),
    f: { count: { k: 'number', def: 5, min: 1, int: true }, time: { k: 'seconds', def: 0.5, min: 0 } } }),

  P({ id: 'mi.st.while', no: 380, sec: 'mi.do.flow', size: 'small', tag: 'V', role: 'act', scope: IN_STMT,
    src: 'overlord:19686',
    code: T(String.raw`
{"while"
  {condition
    {type entities}
    {selector
      {tag @tag@}
      {type human}
      {state "not dead"}
    }
    {count
      {op ">"}
      {value 0}
    }
  }
  {"delay"
    {time @time@}
  }
  @^@
}
`),
    f: { tag: { k: 'tag', def: 'my_unit' }, time: { k: 'seconds', def: 0.2, min: 0 } } }),

  P({ id: 'mi.st.select', no: 381, sec: 'mi.adv', size: 'small', tag: 'T', role: 'act', scope: IN_STMT, adv: true,
    src: 'src: ; ,204',
    code: T(String.raw`
{"select"
  {tag @tag@}
}
{"actor_state"
  {selector
    {source current}
  }
  {move_mode hold}
}
@^@
`),
    f: { tag: { k: 'tag', def: 'my_unit' } } }),

  P({ id: 'mi.st.cond', no: 382, sec: 'mi.if.terms', size: 'small', tag: 'V', role: 'grammar', scope: ['in:*'],
    src: 'road:180; hurtgen:12777',
    code: T(String.raw`
{condition
  {type @kind@}
  @^@
}
`),
    f: { kind: { k: 'choice', def: 'rand', choices: TERM_KINDS } } }),

  P({ id: 'mi.t.event', no: 383, sec: 'mi.if.terms', size: 'small', tag: 'V', role: 'cond', scope: IN_TERMS,
    lim: ['MIS-85'], src: 'hurtgen:12771',
    code: T(String.raw`
{"@n@.event"
  {id "@event@"}
}
@^@
`),
    f: { n: NUM, event: { k: 'text', def: 'start' } } }),

  P({ id: 'mi.t.entities', no: 384, sec: 'mi.if.terms', size: 'medium', tag: 'V', role: 'cond', scope: IN_TERMS,
    lim: ['MIS-42', 'MIS-43', 'MIS-53'], src: 'hurtgen:15303; src: ',
    code: T(String.raw`
{"@n@.entities"
  {selector
    {tag @tag@}
    {zone "@zone@"}
    {type @type@}
    {state "@state@"}
  }
  {count
    {op "@op@"}
    {value @value@}
  }
}
@^@
`),
    f: { n: NUM, tag: { k: 'tag', def: 'player' }, zone: { k: 'text', def: 'flag_a02' },
      type: { k: 'choice', def: 'human', choices: ['human', 'auto', 'tank', 'vehicle'] },
      state: { k: 'choice', def: 'not dead', choices: ['dead', 'not dead', 'operatable', 'not operatable', 'moveable', 'not moveable', 'inhabited', 'not inhabited'] },
      op: { k: 'choice', def: '>', choices: OPS }, value: { k: 'number', def: 0, min: 0, int: true } } }),

  P({ id: 'mi.t.cmp_i', no: 385, sec: 'mi.if.terms', size: 'small', tag: 'V', role: 'cond', scope: IN_TERMS,
    lim: ['MIS-85'], src: 'hurtgen:13430',
    code: T(String.raw`
{"@n@.cmp_i"
  {var "@var@"}
  {op "@op@"}
  {value @value@}
}
@^@
`),
    f: { n: NUM, var: { k: 'text', def: 'player_score$' }, op: { k: 'choice', def: '==', choices: OPS }, value: { k: 'number', def: 5 } } }),

  P({ id: 'mi.t.task', no: 386, sec: 'mi.if.terms', size: 'small', tag: 'V', role: 'cond', scope: IN_TERMS,
    src: 'hurtgen:13350; src: ',
    code: T(String.raw`
{"@n@.task"
  {name "@task@"}
  {state @state@}
}
@^@
`),
    f: { n: NUM, task: { k: 'text', def: 'take_crossroads' }, state: { k: 'choice', def: 'shown', choices: ['completed', 'failed', 'shown'] } } }),

  P({ id: 'mi.t.see_actors', no: 387, sec: 'mi.if.terms', size: 'medium', tag: 'V', role: 'cond', scope: IN_TERMS,
    src: 'hurtgen:18462; src: ,266-274',
    code: T(String.raw`
{"@n@.see_actors"
  {selector
    {tag @tag@}
  }
  {enemy
    {tag @enemy@}
  }
  {distance
    {mode @mode@}
    {meters @meters@}
  }
  {detection @detection@}
  {tag
    {"tag pair"}
    {"for selector" @tag_a@}
    {"for enemy" @tag_b@}
  }
}
@^@
`),
    f: { n: NUM, tag: { k: 'tag', def: 'ecrew' }, enemy: { k: 'tag', def: 'player' },
      mode: { k: 'choice', def: 'near_than', choices: ['near_than', 'far_than'] },
      meters: { k: 'number', def: 35, min: 0 },
      detection: { k: 'choice', def: 'visible', choices: ['recognized', 'visible', 'located'] },
      tag_a: { k: 'tag', def: 'a' }, tag_b: { k: 'tag', def: 'b' } } }),

  P({ id: 'mi.t.difficulty', no: 388, sec: 'mi.if.terms', size: 'small', tag: 'V', role: 'cond', scope: IN_TERMS,
    src: 'hurtgen:23773',
    code: T(String.raw`
{"@n@.difficulty"
  {level @level@}
}
@^@
`),
    f: { n: NUM, level: { k: 'choice', def: 'easy', choices: ['easy', 'normal', 'hard', 'heroic'] } } }),

  P({ id: 'mi.t.trigger', no: 389, sec: 'mi.if.terms', size: 'small', tag: 'V', role: 'cond', scope: IN_TERMS,
    src: 'hurtgen:17829; src: ',
    code: T(String.raw`
{"@n@.trigger"
  {name "@trigger@"}
}
@^@
`),
    f: { n: NUM, trigger: { k: 'text', def: 'my_trigger' } } }),

  P({ id: 'mi.t.near', no: 390, sec: 'mi.if.terms', size: 'medium', tag: 'V', role: 'cond', scope: IN_TERMS,
    lim: ['MIS-36'], src: 'hurtgen:22758; src: ',
    code: T(String.raw`
{"@n@.near"
  {units
    {tag @tag@}
  }
  {near_to
    {tag @near_to@}
  }
  {distance @distance@}
}
@^@
`),
    f: { n: Object.assign({}, NUM, { def: 2 }), tag: { k: 'tag', def: 'player' }, near_to: { k: 'tag', def: 'flag_a02_ai' },
      distance: { k: 'number', def: 40, min: 0 } } }),

  P({ id: 'mi.t.see_enemy', no: 391, sec: 'mi.if.terms', size: 'small', tag: 'V', role: 'cond', scope: IN_TERMS,
    src: 'bastogne:17929',
    code: T(String.raw`
{"@n@.see_enemy"
  {selector
    {tag @tag@}
    {type human}
    {state "not dead"}
  }
}
@^@
`),
    f: { n: NUM, tag: { k: 'tag', def: 'sniper_01' } } }),

  P({ id: 'mi.t.inventory', no: 392, sec: 'mi.if.terms', size: 'small', tag: 'V', role: 'cond', scope: IN_TERMS,
    src: 'dison:16610; src: ,140-147',
    code: T(String.raw`
{"@n@.inventory"
  {selector
    {tag @tag@}
  }
  {item "@item@" "ammo"}
  {compare @compare@}
  {amount @amount@}
}
@^@
`),
    f: { n: NUM, tag: { k: 'tag', def: 'player_tankace' }, item: { k: 'text', def: 'mgun' },
      compare: { k: 'choice', def: 'less', choices: ['less', 'equal', 'greater'] }, amount: { k: 'number', def: 5, min: 0, int: true } } }),

  P({ id: 'mi.t.mission_option', no: 393, sec: 'mi.if.terms', size: 'small', tag: 'V', role: 'cond', scope: IN_TERMS,
    src: 'dison:16753',
    code: T(String.raw`
{"@n@.mission_option"
  {name "@option@"}
}
@^@
`),
    f: { n: NUM, option: { k: 'text', def: 'mission_option1' } } }),

  P({ id: 'mi.t.signal', no: 394, sec: 'mi.if.terms', size: 'small', tag: 'V', role: 'cond', scope: IN_TERMS,
    src: 'hurtgen:26278; src: ',
    code: T(String.raw`
{"@n@.signal"
  {zone "@zone@"}
  {signals "@signals@"}
}
@^@
`),
    f: { n: NUM, zone: { k: 'text', def: 'discovered' }, signals: { k: 'text', def: 'shot hit injure explosion' } } }),

  P({ id: 'mi.t.rand', no: 395, sec: 'mi.if.terms', size: 'line', tag: 'V', role: 'cond', scope: ['in:*'],
    src: 'road:180',
    code: T(String.raw`
{condition
  {type rand}
  {value @chance@}
}
`),
    f: { chance: { k: 'chance', def: 0.35, min: 0, max: 1 } } }),

  P({ id: 'mi.t.mod', no: 396, sec: 'mi.if.terms', size: 'small', tag: 'I', role: 'cond', scope: IN_TERMS,
    lim: ['MIS-23'], src: 'src: ',
    code: T(String.raw`
{"@n@.mod"
  {name "@mod@"}
}
@^@
`),
    f: { n: NUM, mod: { k: 'text', def: 'my_mod' } } }),

  P({ id: 'mi.t.side', no: 397, sec: 'mi.if.terms', size: 'small', tag: 'I', role: 'cond', scope: IN_TERMS,
    src: 'src: ',
    code: T(String.raw`
{"@n@.side"
  {side @side@}
}
@^@
`),
    f: { n: NUM, side: { k: 'text', def: 'usa' } } }),

  P({ id: 'mi.t.crew', no: 398, sec: 'mi.if.terms', size: 'small', tag: 'T', role: 'cond', scope: IN_TERMS, adv: true,
    src: 'src: ',
    code: T(String.raw`
{"@n@.crew"
  {vehicle_selector
    {tag @vehicle@}
  }
  {units
    {tag @crew@}
  }
  {at_least_one}
}
@^@
`),
    f: { n: NUM, vehicle: { k: 'tag', def: 'my_tank' }, crew: { k: 'tag', def: 'my_crew' } } }),
] };

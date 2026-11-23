// Code Pieces, group mi-pat-1: common patterns for mission files (.mi), numbers 508 to 535
// (start, timing, repeat, guards, counters, stages, logic, chains, helpers, zones). Original list with the engine rules
// every piece follows: part B. Format: tools/ide/README.md "tools/ide/kit";
// contract: Scopes: a trigger goes in:triggers ({Helpers {triggers {"name" ...}}}), a
// command in:actions or inside a quoted statement (in:*: "loop", "while", "case", "thread"), a condition block inside
// a trigger (in:*), a term in:terms. Each piece's code was checked against the vanilla lines its src cites.
// Author: Imperator_Aug (ARSENAL, ia-ee6b961b)
'use strict';

// code is written with two-space indents below and turned into tabs here (String.raw keeps the backslashes)
const T = s => s.replace(/^\n/, '').replace(/\n$/, '').replace(/^((?: {2})+)/gm, m => '\t'.repeat(m.length / 2));
const base = { needs: [], lim: [], short: false, adv: false, wrap: false, task: null, since: '2026-11', role: 'pattern', kinds: ['mi'] };
const P = o => Object.assign({}, base, o);
const TRIG = ['in:triggers'];
const ACT = ['in:actions', 'in:*'];
const COND = ['in:*'];
const TERM = ['in:terms'];
const SETOPS = ['=', '+', '-', '*', '/'];
const CMPOPS = ['==', '!=', '<<', '<<=', '>', '>='];

module.exports = { group: 'mi-pat-1', pieces: [
  P({ id: 'mi.pat.run_once_at_mission_start', no: 508, sec: 'mi.pat.start', size: 'small', tag: 'V', mp: 'yes',
    scope: TRIG, src: 'map.pak winter_hills combat.mi:77',
    code: T(String.raw`
{"@name@"
  {condition
  }
  {actions
    {"delay"
      {time @wait@}
    }
    {"con"
      {text "@text@"}
    }@^@
  }
}
`),
    f: { name: { k: 'text', def: 'my_start_once' }, wait: { k: 'seconds', def: 0.1, min: 0 },
      text: { k: 'text', def: 'my mission started' } } }),

  P({ id: 'mi.pat.run_once_on_the_start_event', no: 509, sec: 'mi.pat.start', size: 'small', tag: 'V', mp: 'unknown',
    scope: TRIG, src: 'map.pak hurtgen 0.mi:12768',
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
      {time @wait@}
    }
    {"con"
      {text "@text@"}
    }@^@
  }
}
`),
    f: { name: { k: 'text', def: 'my_on_start' }, event: { k: 'event', def: 'start' }, wait: { k: 'seconds', def: 2, min: 0 },
      text: { k: 'text', def: 'start event seen' } } }),

  P({ id: 'mi.pat.raise_my_own_event', no: 510, sec: 'mi.pat.start', size: 'small', tag: 'V', mp: 'yes',
    scope: ACT, src: 'tutorial skirmish_script(tutorial).mi:15871',
    code: T(String.raw`
{"event"
  {event "@event@"}
  {mode @mode@}
  {delay @wait@}
}
`),
    f: { event: { k: 'event', def: 'my_event' }, mode: { k: 'choice', def: 'set', choices: ['set', 'reset', 'toggle'] },
      wait: { k: 'seconds', def: 0, min: 0 } } }),

  P({ id: 'mi.pat.wait_then_act', no: 511, sec: 'mi.pat.timing', size: 'small', tag: 'V', mp: 'yes',
    scope: ACT, src: 'overlord 0.mi:15899',
    code: T(String.raw`
{"delay"
  {time @wait@}
}
{"con"
  {text "@text@"}
}@^@
`),
    f: { wait: { k: 'seconds', def: 30, min: 0 }, text: { k: 'text', def: '30 seconds later' } } }),

  P({ id: 'mi.pat.wait_without_holding_the_trigger_del', no: 512, sec: 'mi.pat.timing', size: 'medium', tag: 'I', mp: 'yes',
    scope: TRIG, src: '',
    code: T(String.raw`
{"@arm@"
  {condition
  }
  {actions
    {"event"
      {event "@event@"}
      {mode set}
      {delay @wait@}
    }
  }
}
{"@act@"
  {condition
    {terms
      {"1.event"
        {id "@event_2@"}
      }
    }
  }
  {actions
    {"con"
      {text "@text@"}
    }@^@
  }
}
`),
    f: { arm: { k: 'text', def: 'my_arm' }, event: { k: 'event', def: 'my_later' }, wait: { k: 'seconds', def: 45, min: 0 },
      act: { k: 'text', def: 'my_later_act' }, event_2: { k: 'event', def: 'my_later' }, text: { k: 'text', def: '45 s passed' } } }),

  P({ id: 'mi.pat.random_wait', no: 513, sec: 'mi.pat.timing', size: 'small', tag: 'I', mp: 'yes', lim: ['NET-02'],
    scope: ACT, src: '',
    code: T(String.raw`
{"delay"
  {time @centre@ @spread@}
}
`),
    f: { centre: { k: 'seconds', def: 60, min: 0 }, spread: { k: 'seconds', def: 20, min: 0 } } }),

  P({ id: 'mi.pat.repeat_every_n_seconds_while_a_condi', no: 514, sec: 'mi.pat.repeat', size: 'medium', tag: 'V', mp: 'yes',
    scope: TRIG, src: 'overlord 0.mi:15879',
    code: T(String.raw`
{"@name@"
  {condition
    {terms
      {"1.entities"
        {selector
          {tag @tag@}
          {zone "@zone@"}
        }
        {count
          {op "=="}
          {value 1}
        }
      }
    }
  }
  {actions
    {"reinforcement"
      {operation score_add}
      {score @score@}
    }@^@
    {"delay"
      {time @period@}
    }
    {"trigger"
      {name "@name_2@"}
    }
  }
}
`),
    f: { name: { k: 'text', def: 'my_every_10s' }, tag: { k: 'tag', def: 'captured' }, zone: { k: 'text', def: 'my_zone' },
      score: { k: 'number', def: 1, int: true }, period: { k: 'seconds', def: 10, min: 0 }, name_2: { k: 'text', def: 'my_every_10s' } } }),

  P({ id: 'mi.pat.repeat_forever', no: 515, sec: 'mi.pat.repeat', size: 'small', tag: 'I', mp: 'yes',
    scope: TRIG, src: 'overlord 0.mi:15879 (re-arm form)',
    code: T(String.raw`
{"@name@"
  {condition
  }
  {actions
    {"con"
      {text "@text@"}
    }@^@
    {"delay"
      {time @period@}
    }
    {"trigger"
      {name "@name_2@"}
    }
  }
}
`),
    f: { name: { k: 'text', def: 'my_heartbeat' }, text: { k: 'text', def: 'tick' }, period: { k: 'seconds', def: 60, min: 0 },
      name_2: { k: 'text', def: 'my_heartbeat' } } }),

  P({ id: 'mi.pat.repeat_n_times', no: 516, sec: 'mi.pat.repeat', size: 'small', tag: 'V', mp: 'yes',
    scope: ACT, src: 'elalamein 0.mi:22204',
    code: T(String.raw`
{"loop" @count@
  {"delay"
    {time @wait@}
  }
  {"con"
    {text "@text@"}
  }@^@
}
`),
    f: { count: { k: 'number', def: 5, min: 1, int: true }, wait: { k: 'seconds', def: 0.1, min: 0 },
      text: { k: 'text', def: 'one of five' } } }),

  P({ id: 'mi.pat.repeat_until_a_condition_is_false', no: 517, sec: 'mi.pat.repeat', size: 'medium', tag: 'V', mp: 'yes',
    scope: ACT, src: 'dison 0.mi:16489',
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
      {op "@op@"}
      {value @value@}
    }
  }
  {"delay"
    {time @wait@}
  }
  {"con"
    {text "@text@"}
  }@^@
}
`),
    f: { tag: { k: 'tag', def: 'my_squad' }, op: { k: 'choice', def: '<<', choices: CMPOPS },
      value: { k: 'number', def: 6, min: 0, int: true }, wait: { k: 'seconds', def: 5, min: 0 },
      text: { k: 'text', def: 'squad still below 6' } } }),

  P({ id: 'mi.pat.one_time_guard_with_a_done_event', no: 518, sec: 'mi.pat.more', size: 'medium', tag: 'V', mp: 'yes',
    scope: TRIG, src: 'hurtgen 0.mi:20901',
    code: T(String.raw`
{"@name@"
  {condition
    {expression "1 & !2"}
    {terms
      {"1.event"
        {id "@go@"}
      }
      {"2.event"
        {id "@done@"}
      }
    }
  }
  {actions
    {"event"
      {event "@done_2@"}
      {mode set}
      {delay 0}
    }
    {"con"
      {text "@text@"}
    }@^@
  }
}
`),
    f: { name: { k: 'text', def: 'my_once' }, go: { k: 'event', def: 'my_go' }, done: { k: 'event', def: 'my_done' },
      done_2: { k: 'event', def: 'my_done' }, text: { k: 'text', def: 'runs only once' } } }),

  P({ id: 'mi.pat.fire_every_time_a_condition_turns_tr', no: 519, sec: 'mi.pat.more', size: 'small', tag: 'I', mp: 'yes',
    scope: TRIG, src: ',102-104',
    code: T(String.raw`
{"@name@"
  {autoreset}
  {condition
    {terms
      {"1.entities"
        {selector
          {zone "@zone@"}
          {tag @tag@}
          {type human}
          {state "not dead"}
        }
      }
    }
  }
  {actions
    {"sound"
      {name "@sound@"}
    }@^@
  }
}
`),
    f: { name: { k: 'text', def: 'my_each_entry' }, zone: { k: 'text', def: 'my_zone' }, tag: { k: 'tag', def: 'my_player_units' },
      sound: { k: 'sound', def: 'mission/task_new' } } }),

  P({ id: 'mi.pat.counter_that_fires_at_n', no: 520, sec: 'mi.pat.more', size: 'medium', tag: 'V', mp: 'yes',
    scope: TRIG, src: 'tutorial skirmish_script(tutorial).mi:4273',
    code: T(String.raw`
{"@add@"
  {condition
    {terms
      {"1.event"
        {id "@hit@"}
      }
    }
  }
  {actions
    {"event"
      {event "@hit_2@"}
      {mode reset}
      {delay 0}
    }
    {"set_i"
      {var "@var@$"}
      {op "+"}
      {value 1}
    }
    {"trigger"
      {name "@add_2@"}
    }
  }
}
{"@reached@"
  {condition
    {terms
      {"1.cmp_i"
        {var "@var_2@$"}
        {op "@op@"}
        {value @target@}
      }
    }
  }
  {actions
    {"con"
      {text "@text@"}
    }@^@
  }
}
`),
    f: { add: { k: 'text', def: 'my_count_add' }, hit: { k: 'event', def: 'my_hit' }, hit_2: { k: 'event', def: 'my_hit' },
      var: { k: 'text', def: 'my_count' }, add_2: { k: 'text', def: 'my_count_add' }, reached: { k: 'text', def: 'my_count_reached' },
      var_2: { k: 'text', def: 'my_count' }, op: { k: 'choice', def: '>=', choices: CMPOPS },
      target: { k: 'number', def: 5, int: true }, text: { k: 'text', def: 'count reached 5' } } }),

  P({ id: 'mi.pat.compare_a_count_with_a_variable', no: 521, sec: 'mi.pat.more', size: 'small', tag: 'V', mp: 'yes',
    scope: TERM, src: 'dison 0.mi:16500',
    code: T(String.raw`
{"@n@.entities"
  {selector
    {tag @tag@}
    {type human}
    {state "not dead"}
  }
  {count
    {op "@op@"}
    {value "@var@$"}
  }
}
`),
    f: { n: { k: 'number', def: 1, min: 1, int: true }, tag: { k: 'tag', def: 'my_squad' },
      op: { k: 'choice', def: '<<', choices: CMPOPS }, var: { k: 'text', def: 'my_wanted' } } }),

  P({ id: 'mi.pat.stage_variable_drives_the_stages', no: 522, sec: 'mi.pat.more', size: 'medium', tag: 'I', mp: 'yes',
    scope: TRIG, src: 'tutorial skirmish_script(tutorial).mi:5594 (cmp_i), :4273 (set_i)',
    code: T(String.raw`
{"@name@"
  {condition
    {terms
      {"1.cmp_i"
        {var "@var@$"}
        {op "=="}
        {value @stage@}
      }
    }
  }
  {actions
    {"con"
      {text "@text@"}
    }@^@
    {"set_i"
      {var "@var_2@$"}
      {op "="}
      {value @next@}
    }
  }
}
`),
    f: { name: { k: 'text', def: 'my_stage_1' }, var: { k: 'text', def: 'my_stage' }, stage: { k: 'number', def: 1, int: true },
      text: { k: 'text', def: 'stage 1' }, var_2: { k: 'text', def: 'my_stage' }, next: { k: 'number', def: 2, int: true } } }),

  P({ id: 'mi.pat.stages_chained_by_events', no: 523, sec: 'mi.pat.more', size: 'medium', tag: 'V', mp: 'yes',
    scope: TRIG, src: 'vanilla ids part1..partN (106 event terms)',
    code: T(String.raw`
{"@name@"
  {condition
    {terms
      {"1.event"
        {id "@prev@"}
      }
    }
  }
  {actions
    {"con"
      {text "@text@"}
    }@^@
    {"event"
      {event "@done@"}
      {mode set}
      {delay @wait@}
    }
  }
}
`),
    f: { name: { k: 'text', def: 'my_part2' }, prev: { k: 'event', def: 'my_part1_done' }, text: { k: 'text', def: 'part 2 begins' },
      done: { k: 'event', def: 'my_part2_done' }, wait: { k: 'seconds', def: 120, min: 0 } } }),

  P({ id: 'mi.pat.all_of_several_conditions', no: 524, sec: 'mi.pat.logic', size: 'small', tag: 'V', mp: 'yes',
    scope: COND, src: '',
    code: T(String.raw`
{condition
  {terms
    {"1.event"
      {id "@a@"}
    }
    {"2.event"
      {id "@b@"}
    }@^@
  }
}
`),
    f: { a: { k: 'event', def: 'my_a' }, b: { k: 'event', def: 'my_b' } } }),

  P({ id: 'mi.pat.any_of_several_conditions', no: 525, sec: 'mi.pat.logic', size: 'small', tag: 'V', mp: 'yes',
    scope: COND, src: 'hurtgen 0.mi:13889',
    code: T(String.raw`
{condition
  {type 1}
  {terms
    {"1.event"
      {id "@a@"}
    }
    {"2.event"
      {id "@b@"}
    }@^@
  }
}
`),
    f: { a: { k: 'event', def: 'my_a' }, b: { k: 'event', def: 'my_b' } } }),

  P({ id: 'mi.pat.custom_logic_with_not_and_brackets', no: 526, sec: 'mi.pat.logic', size: 'small', tag: 'V', mp: 'yes',
    lim: ['MIS-29', 'MIS-88'], scope: COND, src: 'overlord 0.mi:17518',
    code: T(String.raw`
{condition
  {expression "@expr@"}
  {terms
    {"1.event"
      {id "@a@"}
    }
    {"2.event"
      {id "@b@"}
    }
    {"3.event"
      {id "@c@"}
    }@^@
  }
}
`),
    f: { expr: { k: 'text', def: '(1 & 2) | 3' }, a: { k: 'event', def: 'my_a' }, b: { k: 'event', def: 'my_b' },
      c: { k: 'event', def: 'my_override' } } }),

  P({ id: 'mi.pat.switch_another_trigger_off_re_arm_it', no: 527, sec: 'mi.pat.more', size: 'small', tag: 'V', mp: 'yes',
    scope: ACT, src: 'hurtgen 0.mi:20896',
    code: T(String.raw`
{"trigger"
  {name "@trigger@"}
}
`),
    f: { trigger: { k: 'text', def: 'my_other_trigger' } } }),

  P({ id: 'mi.pat.only_while_another_trigger_is_on', no: 528, sec: 'mi.pat.more', size: 'small', tag: 'V', mp: 'yes',
    scope: TERM, src: 'sevastopol 0.mi:19339',
    code: T(String.raw`
{"@n@.trigger"
  {name "@trigger@"}
}
`),
    f: { n: { k: 'number', def: 1, min: 1, int: true }, trigger: { k: 'text', def: 'my_other_trigger' } } }),

  P({ id: 'mi.pat.helper_called_from_several_triggers', no: 529, sec: 'mi.pat.more', size: 'medium', tag: 'I', mp: 'yes',
    scope: TRIG, src: '',
    code: T(String.raw`
{"@helper@"
  {condition
    {terms
      {"1.event"
        {mode off}
      }
    }
  }
  {actions
    {"con"
      {text "@text@"}
    }@^@
  }
}
{"@caller@"
  {condition
    {terms
      {"1.event"
        {id "@event@"}
      }
    }
  }
  {actions
    {"trigger"
      {name "@helper_2@"}
    }
    {"trigger"
      {name "@helper_3@"}
      {on}
    }
  }
}
`),
    f: { helper: { k: 'text', def: 'my_helper' }, text: { k: 'text', def: 'helper ran' }, caller: { k: 'text', def: 'my_caller' },
      event: { k: 'event', def: 'my_call' }, helper_2: { k: 'text', def: 'my_helper' }, helper_3: { k: 'text', def: 'my_helper' } } }),

  P({ id: 'mi.pat.helper_on_a_request_event', no: 530, sec: 'mi.pat.more', size: 'medium', tag: 'V', mp: 'yes',
    scope: TRIG, src: 'hurtgen 0.mi:12890',
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
    {"event"
      {event "@event_2@"}
      {mode reset}
      {delay 0}
    }
    {"con"
      {text "@text@"}
    }@^@
    {"trigger"
      {name "@name_2@"}
    }
  }
}
`),
    f: { name: { k: 'text', def: 'my_request_handler' }, event: { k: 'event', def: 'my_request' },
      event_2: { k: 'event', def: 'my_request' }, text: { k: 'text', def: 'request handled' },
      name_2: { k: 'text', def: 'my_request_handler' } } }),

  P({ id: 'mi.pat.timed_sequence', no: 531, sec: 'mi.pat.timing', size: 'medium', tag: 'V', mp: 'yes',
    scope: ACT, src: 'hurtgen 0.mi:17520',
    code: T(String.raw`
{"sound"
  {name "@sound@"}
}
{"delay"
  {time @wait@}
}
{"event"
  {event "@step2@"}
  {mode set}
  {delay 0}
}
{"delay"
  {time @wait_2@}
}
{"event"
  {event "@step3@"}
  {mode set}
  {delay 0}
}@^@
`),
    f: { sound: { k: 'sound', def: 'mission/task_new' }, wait: { k: 'seconds', def: 5, min: 0 }, step2: { k: 'event', def: 'my_step2' },
      wait_2: { k: 'seconds', def: 10, min: 0 }, step3: { k: 'event', def: 'my_step3' } } }),

  P({ id: 'mi.pat.run_a_branch_in_parallel', no: 532, sec: 'mi.pat.timing', size: 'small', tag: 'T', adv: true, mp: 'unknown',
    scope: ACT, src: '',
    code: T(String.raw`
{"thread"
  {"delay"
    {time @wait@}
  }
  {"con"
    {text "@text@"}
  }@^@
}
`),
    f: { wait: { k: 'seconds', def: 20, min: 0 }, text: { k: 'text', def: 'side branch' } } }),

  P({ id: 'mi.pat.units_enter_a_zone', no: 533, sec: 'mi.pat.zones', size: 'small', tag: 'V', mp: 'yes',
    scope: TERM, src: 'hurtgen 0.mi:16158',
    code: T(String.raw`
{"@n@.entities"
  {selector
    {tag @tag@}
    {zone "@zone@"}
    {type human}
    {state "not dead"}
  }
}
`),
    f: { n: { k: 'number', def: 1, min: 1, int: true }, tag: { k: 'tag', def: 'my_tag' }, zone: { k: 'text', def: 'my_zone' } } }),

  P({ id: 'mi.pat.zone_is_empty_left_or_cleared', no: 534, sec: 'mi.pat.zones', size: 'small', tag: 'V', mp: 'yes',
    scope: TERM, src: 'hurtgen 0.mi:16146',
    code: T(String.raw`
{"@n@.entities"
  {selector
    {zone "@zone@"}
    {player "@player@"}
    {type human}
    {state "not dead"}
  }
  {count
    {op "=="}
    {value 0}
  }
}
`),
    f: { n: { k: 'number', def: 1, min: 1, int: true }, zone: { k: 'text', def: 'my_zone' },
      player: { k: 'number', def: 1, min: 0, int: true } } }),

  P({ id: 'mi.pat.unit_near_another_unit_metres', no: 535, sec: 'mi.pat.zones', size: 'small', tag: 'V', mp: 'yes',
    lim: ['MIS-36'], scope: TERM, src: 'elalamein 0.mi:22795',
    code: T(String.raw`
{"@n@.near"
  {units
    {tag @tag@}
    {type human}
    {state "not dead"}
  }
  {near_to
    {tag @target@}
  }
  {distance @metres@}
}
`),
    f: { n: { k: 'number', def: 1, min: 1, int: true }, tag: { k: 'tag', def: 'my_player_units' },
      target: { k: 'tag', def: 'my_target' }, metres: { k: 'number', def: 60, min: 0 } } }),
] };

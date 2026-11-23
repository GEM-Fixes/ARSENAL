// Code Pieces, group mi-pat-2: common patterns for mission files (.mi), numbers 536 to 562
// (list B29 to B55 of: unit checks, orders, spawning, player hand-over
// reinforcement waves, objectives, win and lose, countdown, dialogue, a short cutscene.
// Format: tools/ide/README.md "tools/ide/kit"; contract: Every piece was checked against the
// vanilla lines it cites (map.pak, read through tools/lib/pak.js). Nesting as in the game's missions:
// a trigger goes in `{triggers`, a term in `{terms`, commands in `{actions` or in a statement block (`{"loop" n`, `{"case"`).
// Names a pattern needs declared elsewhere in the same file (events, zones, waypoints, tasks) are named in its `.n` row.
// Author: Imperator_Aug (ARSENAL, ia-c4e6cc98)
'use strict';

// code is written with two-space indents below and turned into tabs here
const T = s => s.replace(/^\n/, '').replace(/\n$/, '').replace(/^((?: {2})+)/gm, m => '\t'.repeat(m.length / 2));
const base = { kinds: ['mi'], needs: [], lim: [], short: false, adv: false, wrap: false, task: null, since: '2026-11' };
const P = o => Object.assign({}, base, o);
const TERM = { scope: ['in:terms'], role: 'cond' };
const CMDS = { scope: ['in:actions', 'in:*'], role: 'pattern' };
const TRIG = { scope: ['in:triggers'], role: 'pattern' };
const no = { k: 'number', def: 1, min: 1, max: 99, int: true };

module.exports = { group: 'mi-pat-2', pieces: [
  P(Object.assign({ id: 'mi.pat.group_is_dead', no: 536, sec: 'mi.pat.units', size: 'small', tag: 'V', mp: 'yes',
    code: T(`
{"@no@.entities"
  {selector
    {tag @group@}
    {type human}
    {state "not dead"}
  }
  {count
    {op "=="}
    {value 0}
  }
}@^@
`),
    f: { no, group: { k: 'tag', def: 'my_group' } },
    lim: ['MIS-42', 'MIS-57', 'MIS-43'], src: 'hurtgen:15303' }, TERM)),

  P(Object.assign({ id: 'mi.pat.group_below_n_men', no: 537, sec: 'mi.pat.units', size: 'small', tag: 'V', mp: 'yes',
    code: T(`
{"@no@.entities"
  {selector
    {tag @group@}
    {type human}
    {state "not dead"}
  }
  {count
    {op "<<"}
    {value @men@}
  }
}@^@
`),
    f: { no, group: { k: 'tag', def: 'my_group' }, men: { k: 'number', def: 4, min: 1, int: true } },
    src: 'hurtgen:15303' }, TERM)),

  P(Object.assign({ id: 'mi.pat.vehicle_out_of_action', no: 538, sec: 'mi.pat.units', size: 'small', tag: 'V', mp: 'yes',
    code: T(`
{"@no@.entities"
  {selector
    {tag @tank@}
    {type vehicle}
    {state "not moveable"}
  }
}@^@
`),
    f: { no, tank: { k: 'tag', def: 'my_tank' } },
    lim: ['MIS-42', 'MIS-54', 'MIS-43'], src: 'hurtgen:24179-24183' }, TERM)),

  P(Object.assign({ id: 'mi.pat.tag_a_group_then_order_it', no: 539, sec: 'mi.pat.more', size: 'medium', tag: 'V', mp: 'yes',
    code: T(`
{"entity_state"
  {selector
    {tag @pool@}
    {zone "@zone@"}
    {type human}
    {state "not dead"}
  }
  {tag_add @wave@}
}
{"actor_to_waypoint"
  {selector
    {tag @wave_2@}
    {type human}
  }
  {drop orders}
  {waypoint "@wp@"}
}@^@
`),
    f: { pool: { k: 'tag', def: 'my_pool' }, zone: { k: 'text', def: 'my_zone' }, wave: { k: 'tag', def: 'my_wave' },
      wave_2: { k: 'tag', def: 'my_wave' }, wp: { k: 'text', def: 'my_wp' } },
    lim: ['MIS-52'], src: 'bocage:12016' }, CMDS)),

  P(Object.assign({ id: 'mi.pat.make_a_squad_and_send_it', no: 540, sec: 'mi.pat.more', size: 'small', tag: 'V', mp: 'yes',
    code: T(`
{"squad_create"
  {selector
    {tag @units@}
    {player "@player@"}
  }
  {name @squad@}
}
{"squad_to_waypoint"
  {squad @squad_2@}
  {waypoint "@wp@"}
}@^@
`),
    f: { units: { k: 'tag', def: 'my_tanks' }, player: { k: 'number', def: 1, min: 0, max: 16, int: true },
      squad: { k: 'text', def: 'my_squad' }, squad_2: { k: 'text', def: 'my_squad' }, wp: { k: 'text', def: 'my_wp' } },
    src: 'elalamein:10197' }, CMDS)),

  P(Object.assign({ id: 'mi.pat.reveal_a_hidden_reserve', no: 541, sec: 'mi.pat.units', size: 'small', tag: 'V', mp: 'yes',
    code: T(`
{"entity_state"
  {selector
    {tag @reserve@}
  }
  {tag_remove hidden}
  {inactive off}
}@^@
`),
    f: { reserve: { k: 'tag', def: 'my_reserve' } },
    src: 'overlord:15870-15876' }, CMDS)),

  P(Object.assign({ id: 'mi.pat.hide_units_again_park_them', no: 542, sec: 'mi.pat.units', size: 'small', tag: 'V', mp: 'yes',
    code: T(`
{"entity_state"
  {selector
    {tag @group@}
  }
  {tag_add hidden}
  {inactive on}
}@^@
`),
    f: { group: { k: 'tag', def: 'my_group' } },
    src: 'hurtgen:16143' }, CMDS)),

  P(Object.assign({ id: 'mi.pat.copy_units_from_a_pool_to_a_waypoint', no: 543, sec: 'mi.pat.spawning', size: 'medium', tag: 'V', mp: 'yes',
    code: T(`
{"waypoint"
  {who
    {type actor}
    {actors
      {amount @amount@}
      {tag @pool@}
    }
  }
  {action
    {type start}
    {waypoint "@wp@"}
    {clone}
    {approach "@approach@"}
  }
}@^@
`),
    f: { amount: { k: 'number', def: 1, min: 1, int: true }, pool: { k: 'tag', def: 'my_pool' }, wp: { k: 'text', def: 'my_wp' },
      approach: { k: 'choice', def: 'safe teleport & rotate', choices: ['safe teleport & rotate', 'teleport & rotate', 'safe teleport', 'teleport', 'force'] } },
    src: 'elalamein:22204' }, CMDS)),

  P(Object.assign({ id: 'mi.pat.spawn_one_entity_at_a_waypoint', no: 544, sec: 'mi.pat.spawning', size: 'small', tag: 'V', mp: 'unknown',
    code: T(`
{"spawn"
  {entity "@entity@"}
  {waypoint "@wp@"}
}@^@
`),
    f: { entity: { k: 'entity', def: 'skirmish_bonus_pointer' }, wp: { k: 'text', def: 'my_wp' } },
    lim: ['MIS-51', 'MIS-87'], src: 'tutorial:5419' }, CMDS)),

  P(Object.assign({ id: 'mi.pat.crew_an_empty_placed_vehicle', no: 545, sec: 'mi.pat.spawning', size: 'small', tag: 'V', mp: 'yes',
    code: T(`
{"board"
  {selector
    {amount 1}
    {tag @crew@}
    {type human}
    {state "not dead"}
  }
  {vehicle
    {tag @vehicle@}
    {state "not inhabited"}
  }
}@^@
`),
    f: { crew: { k: 'tag', def: 'my_crew' }, vehicle: { k: 'tag', def: 'my_gun' } },
    lim: ['MIS-39'], src: 'tutorial:14963' }, CMDS)),

  P(Object.assign({ id: 'mi.pat.hand_units_to_the_player', no: 546, sec: 'mi.pat.more', size: 'medium', tag: 'V', mp: 'unknown',
    code: T(`
{"autoassign"
  {selector
    {tag @units@}
    {zone "@zone@"}
  }
}
{"actor_state"
  {selector
    {tag @units_2@}
    {type human}
  }
  {control user}
  {move_mode hold}
  {weapon_prepare on}
}@^@
`),
    f: { units: { k: 'tag', def: 'my_player_start' }, zone: { k: 'text', def: 'my_gamezone' }, units_2: { k: 'tag', def: 'my_player_start' } },
    lim: ['MIS-40'], src: 'hurtgen:12860' }, CMDS)),

  P(Object.assign({ id: 'mi.pat.change_who_owns_units', no: 547, sec: 'mi.pat.more', size: 'small', tag: 'V', mp: 'unknown',
    code: T(`
{"player"
  {selector
    {tag @group@}
    {type human}
  }
  {operation set}
  {player "@player@"}
}@^@
`),
    f: { group: { k: 'tag', def: 'my_group' }, player: { k: 'number', def: 3, min: 0, max: 16, int: true } },
    lim: ['MIS-38'], src: 'elalamein:9945' }, CMDS)),

  P(Object.assign({ id: 'mi.pat.reinforcement_wave_by_timer', no: 548, sec: 'mi.pat.reinforcements', size: 'medium', tag: 'I', mp: 'yes',
    code: T(`
{"@trigger@"
  {condition
    {terms
      {"1.event"
        {id "@event@"}
      }
    }
  }
  {actions
    {"delay"
      {time @every@}
    }
    {"loop" @count@
      {"waypoint"
        {who
          {type actor}
          {actors
            {amount 1}
            {tag @pool@}
          }
        }
        {action
          {type start}
          {waypoint "@wp@"}
          {clone}
          {approach "safe teleport & rotate"}
        }
      }
    }
    {"trigger"
      {name "@trigger_2@"}
    }
  }
}@^@
`),
    f: { trigger: { k: 'text', def: 'my_wave_timer' }, event: { k: 'event', def: 'my_battle_on' },
      every: { k: 'seconds', def: 180, min: 1 }, count: { k: 'number', def: 4, min: 1, int: true },
      pool: { k: 'tag', def: 'my_pool' }, wp: { k: 'text', def: 'my_spawn_wp' }, trigger_2: { k: 'text', def: 'my_wave_timer' } },
    src: 'elalamein:22204' }, TRIG)),

  P(Object.assign({ id: 'mi.pat.reinforcement_wave_when_the_player_e', no: 549, sec: 'mi.pat.reinforcements', size: 'medium', tag: 'I', mp: 'yes',
    code: T(`
{"@trigger@"
  {condition
    {terms
      {"1.entities"
        {selector
          {zone "@zone@"}
          {tag @player_units@}
          {type human}
          {state "not dead"}
        }
      }
    }
  }
  {actions
    {"entity_state"
      {selector
        {tag @reserve@}
      }
      {tag_remove hidden}
      {inactive off}
    }
    {"actor_to_waypoint"
      {selector
        {tag @reserve_2@}
        {type human}
      }
      {drop orders}
      {waypoint "@wp@"}
    }
  }
}@^@
`),
    f: { trigger: { k: 'text', def: 'my_wave_zone' }, zone: { k: 'text', def: 'my_trip_zone' },
      player_units: { k: 'tag', def: 'my_player_units' }, reserve: { k: 'tag', def: 'my_reserve' },
      reserve_2: { k: 'tag', def: 'my_reserve' }, wp: { k: 'text', def: 'my_attack_wp' } },
    lim: ['MIS-52'], src: 'overlord:15855-15876' }, TRIG)),

  P(Object.assign({ id: 'mi.pat.reinforcement_wave_on_losses', no: 550, sec: 'mi.pat.reinforcements', size: 'medium', tag: 'I', mp: 'yes',
    code: T(`
{"@trigger@"
  {condition
    {terms
      {"1.entities"
        {selector
          {tag @defenders@}
          {type human}
          {state "not dead"}
        }
        {count
          {op "<<"}
          {value @men@}
        }
      }
    }
  }
  {actions
    {"entity_state"
      {selector
        {tag @reserve@}
      }
      {tag_remove hidden}
      {inactive off}
    }
  }
}@^@
`),
    f: { trigger: { k: 'text', def: 'my_wave_losses' }, defenders: { k: 'tag', def: 'my_defenders' },
      men: { k: 'number', def: 5, min: 1, int: true }, reserve: { k: 'tag', def: 'my_reserve' } },
    lim: ['MIS-57'], src: 'hurtgen:15303' }, TRIG)),

  P(Object.assign({ id: 'mi.pat.show_a_reinforcement_card_add_points', no: 551, sec: 'mi.pat.reinforcements', size: 'small', tag: 'V', mp: 'no',
    code: T(`
{"reinforcement"
  {operation show}
  {name "@card@"}
}
{"reinforcement"
  {operation score_add}
  {score @score@}
}@^@
`),
    f: { card: { k: 'text', def: 'menu:1_0' }, score: { k: 'number', def: 200, int: true } },
    src: 'overlord:28986-28988' }, CMDS)),

  P(Object.assign({ id: 'mi.pat.show_an_objective', no: 552, sec: 'mi.pat.objectives', size: 'small', tag: 'V', mp: 'unknown',
    code: T(`
{"task"
  {name "@task@"}
}
{"sound"
  {name "@sound@"}
}@^@
`),
    f: { task: { k: 'text', def: 'my_task' }, sound: { k: 'sound', def: 'mission/task_new' } },
    lim: ['MIS-30'], src: 'tutorial:3385-3388' }, CMDS)),

  P(Object.assign({ id: 'mi.pat.complete_an_objective', no: 553, sec: 'mi.pat.objectives', size: 'small', tag: 'V', mp: 'unknown',
    code: T(`
{"task"
  {name "@task@"}
  {state complete}
}
{"sound"
  {name "@sound@"}
}@^@
`),
    f: { task: { k: 'text', def: 'my_task' }, sound: { k: 'sound', def: 'mission/task_fulfilled' } },
    src: 'hurtgen:20917-20922' }, CMDS)),

  P(Object.assign({ id: 'mi.pat.fail_an_objective', no: 554, sec: 'mi.pat.objectives', size: 'small', tag: 'V', mp: 'unknown',
    code: T(`
{"task"
  {name "@task@"}
  {state fail}
}
{"sound"
  {name "@sound@"}
}@^@
`),
    f: { task: { k: 'text', def: 'my_task' }, sound: { k: 'sound', def: 'mission/task_failed' } },
    src: 'hurtgen:20965-20970' }, CMDS)),

  P(Object.assign({ id: 'mi.pat.next_objective_after_one_is_done', no: 555, sec: 'mi.pat.objectives', size: 'medium', tag: 'V', mp: 'unknown',
    code: T(`
{"@trigger@"
  {condition
    {terms
      {"1.task"
        {name "@task@"}
      }
    }
  }
  {actions
    {"delay"
      {time @wait@}
    }
    {"task"
      {name "@next@"}
    }
    {"sound"
      {name "mission/task_new"}
    }
  }
}@^@
`),
    f: { trigger: { k: 'text', def: 'my_next_task' }, task: { k: 'text', def: 'my_task' },
      wait: { k: 'seconds', def: 3, min: 0 }, next: { k: 'text', def: 'my_task2' } },
    src: 'hurtgen:20945' }, TRIG)),

  P(Object.assign({ id: 'mi.pat.objective_progress_readout', no: 556, sec: 'mi.pat.objectives', size: 'small', tag: 'V', mp: 'unknown',
    code: T(`
{"objective_progress"
  {set @set@}
  {add @add@}
  {title "$/@text@"}
}@^@
`),
    f: { set: { k: 'number', def: 0 }, add: { k: 'number', def: 0 }, text: { k: 'text', def: 'my_progress_text' } },
    src: 'tutorial:5605' }, CMDS)),

  P(Object.assign({ id: 'mi.pat.win', no: 557, sec: 'mi.pat.win-and-lose', size: 'small', tag: 'V', mp: 'unknown',
    code: T(`
{"gameover"
  {result win}
  {message ""}
}@^@
`),
    f: {},
    src: '' }, CMDS)),

  P(Object.assign({ id: 'mi.pat.lose_when_the_player_has_no_men_left', no: 558, sec: 'mi.pat.win-and-lose', size: 'medium', tag: 'V', mp: 'unknown',
    code: T(`
{"@trigger@"
  {condition
    {terms
      {"1.entities"
        {selector
          {tag @player_units@}
          {type human}
          {state "not dead"}
        }
        {count
          {op "=="}
          {value 0}
        }
      }
    }
  }
  {actions
    {"music"
      {start "/music/skirmish_lost.mp3"}
      {stop_all}
      {volume game}
    }
    {"delay"
      {time @wait@}
    }
    {"gameover"
      {result loose}
      {message ""}
    }
  }
}@^@
`),
    f: { trigger: { k: 'text', def: 'my_lose_all_dead' }, player_units: { k: 'tag', def: 'my_player_units' },
      wait: { k: 'seconds', def: 3, min: 0 } },
    lim: ['MIS-38', 'MIS-57'], src: 'tutorial:2617-2626' }, TRIG)),

  P(Object.assign({ id: 'mi.pat.countdown_shown_to_the_player', no: 559, sec: 'mi.pat.win-and-lose', size: 'medium', tag: 'V', mp: 'unknown',
    code: T(`
{"timer"
  {time @time@}
  {title "$/@text@"}
}
{"event"
  {event "@event@"}
  {mode set}
  {delay @time_2@}
}@^@
`),
    f: { time: { k: 'seconds', def: 120, min: 1 }, text: { k: 'text', def: 'my_timer_text' },
      event: { k: 'event', def: 'my_time_up' }, time_2: { k: 'seconds', def: 120, min: 1 } },
    src: 'elalamein:6589' }, CMDS)),

  P(Object.assign({ id: 'mi.pat.hide_the_countdown', no: 560, sec: 'mi.pat.win-and-lose', size: 'small', tag: 'V', mp: 'unknown',
    code: T(`
{"timer"
  {hide}
  {title "$/@text@"}
}@^@
`),
    f: { text: { k: 'text', def: 'my_timer_text' } },
    src: 'hurtgen:20932-20934' }, CMDS)),

  P(Object.assign({ id: 'mi.pat.dialogue_line_by_a_unit', no: 561, sec: 'mi.pat.more', size: 'medium', tag: 'V', mp: 'unknown',
    code: T(`
{"talk"
  {selector
    {tag @speaker_a@}
  }
  {text "$/@line_1@"}
}
{"delay"
  {time @wait@}
}
{"talk"
  {selector
    {tag @speaker_b@}
  }
  {text "$/@line_2@"}
}@^@
`),
    f: { speaker_a: { k: 'tag', def: 'my_speaker_a' }, line_1: { k: 'text', def: 'my_line_1' },
      wait: { k: 'seconds', def: 4, min: 0 }, speaker_b: { k: 'tag', def: 'my_speaker_b' }, line_2: { k: 'text', def: 'my_line_2' } },
    src: 'tutorial:3961-3965' }, CMDS)),

  P(Object.assign({ id: 'mi.pat.short_cutscene_camera_path_no_cancel', no: 562, sec: 'mi.pat.cutscenes', size: 'medium', tag: 'V', mp: 'no',
    code: T(`
{"fade"
  {time @fade@}
  {color 0xff000000}
}
{"scenario"
  {message
    {text ""}
  }
  {camera
    {name "@camera@"}
    {disable_cancel}
    {smooth_begin 0}
    {smooth_end 0}
  }
  {event_on_next "@event@"}
}@^@
`),
    f: { fade: { k: 'seconds', def: 2, min: 0 }, camera: { k: 'text', def: 'my_cam' }, event: { k: 'event', def: 'my_cut_done' } },
    lim: ['MIS-41'], src: 'tutorial:15258-15272' }, CMDS)),
] };

// Code Pieces, group mi-idea-1: ideas to try in mission files (.mi), numbers 590 to 612
// (list: part C, C01 to C23). Each idea is built from parts the stock missions
// use; the code was checked against the cited lines of the stock missions (map.pak, map_dlc_1.pak) and the engine
// source under game/helper. Format: tools/ide/README.md "tools/ide/kit"; contract:
// Triggers drop into {triggers ...} of Helpers; single commands and statements drop into {actions ...} or a
// "case" / "if" / "while" body.
// Author: Imperator_Aug (ARSENAL, ia-77b0d2ff)
'use strict';

// code is written with two-space indents below and turned into tabs here (String.raw keeps the backslashes)
const T = s => s.replace(/^\n/, '').replace(/\n$/, '').replace(/^((?: {2})+)/gm, m => '\t'.repeat(m.length / 2));
const base = { kinds: ['mi'], role: 'recipe', needs: [], lim: [], short: false, adv: false, wrap: false, task: null, since: '2026-11' };
const P = o => Object.assign({}, base, o, o.tag === 'T' ? { adv: true } : {});
const TRIG = ['in:triggers'];
const CMD = ['in:actions', 'in:*'];
const tx = def => ({ k: 'text', def });
const tg = def => ({ k: 'tag', def });
const ev = def => ({ k: 'event', def });
const num = (def, o) => Object.assign({ k: 'number', def }, o || {});
const sec = def => ({ k: 'seconds', def, min: 0 });
const ch = def => ({ k: 'chance', def, min: 0, max: 1 });

module.exports = { group: 'mi-idea-1', pieces: [
  // 590 C01
  P({ id: 'mi.idea.dynamic_difficulty_from_the_player_s', no: 590, sec: 'mi.ideas.more', scope: TRIG, size: 'medium', tag: 'I', mp: 'yes',
    lim: ['MIS-43', 'MIS-57'], src: 'map/single/01_usa-skirmish/00b_usa-hurtgen/0.mi:23746',
    code: T(String.raw`
{"@name@"
  {condition
    {terms
      {"1.entities"
        {selector
          {tag @player_tag@}
          {type human}
          {state dead}
        }
        {count
          {op ">"}
          {value @losses@}
        }
      }
    }
  }
  {actions
    {"delete"
      {selector
        {amount @amount@
        }
        {tag @reserve_tag@}
      }
    }
    {"con"
      {text "@message@"}
    }
  }
}
`),
    f: { name: tx('my_player_bleeding'), player_tag: tg('my_player_units'), losses: num(10, { min: 0, int: true }),
      amount: num(3, { min: 1, int: true }), reserve_tag: tg('my_enemy_reserve'), message: tx('difficulty eased') } }),

  // 591 C02
  P({ id: 'mi.idea.front_line_that_moves_with_captured', no: 591, sec: 'mi.ideas.more', scope: TRIG, size: 'medium', tag: 'V', mp: 'yes',
    src: 'map/single/01_usa-skirmish/01_usa-overlord/0.mi:15855',
    code: T(String.raw`
{"@name@"
  {condition
    {terms
      {"1.entities"
        {selector
          {tag captured}
          {zone "@flag_zone@"}
        }
        {count
          {op "=="}
          {value 1}
        }
      }
    }
  }
  {actions
    {"entity_state"
      {selector
        {tag @new_line@}
      }
      {tag_remove hidden}
      {inactive off}
    }
    {"entity_state"
      {selector
        {tag @old_line@}
      }
      {tag_add hidden}
      {inactive on}
    }
  }
}
`),
    f: { name: tx('my_front_moves_b'), flag_zone: tx('my_flag_a'), new_line: tg('my_line_b'), old_line: tg('my_line_a') } }),

  // 592 C03
  P({ id: 'mi.idea.random_patrol_route_each_start', no: 592, sec: 'mi.ideas.more', scope: TRIG, size: 'medium', tag: 'I', mp: 'yes',
    lim: ['MIS-34'], src: 'map/multi/1v1_winter_hills/combat.mi:77',
    code: T(String.raw`
{"@name@"
  {condition
  }
  {actions
    {"switch"
      {"case"
        {condition
          {type rand}
          {value @chance@}
        }
        {"actor_to_waypoint"
          {selector
            {tag @patrol@}
            {type human}
          }
          {waypoint "@route_a@"}
        }
      }
      {"default"
        {"actor_to_waypoint"
          {selector
            {tag @patrol_2@}
            {type human}
          }
          {waypoint "@route_b@"}
        }
      }
    }
  }
}
`),
    f: { name: tx('my_route_pick'), chance: ch(0.5), patrol: tg('my_patrol'), route_a: tx('my_route_a1'),
      patrol_2: tg('my_patrol'), route_b: tx('my_route_b1') } }),

  // 593 C04
  P({ id: 'mi.idea.supply_convoy_that_must_arrive', no: 593, sec: 'mi.ideas.more', scope: TRIG, size: 'large', tag: 'I', mp: 'unknown',
    lim: ['MIS-43'], src: 'map/single/03_eng-skirmish/01b_eng-elalamein/0.mi:22795',
    code: T(String.raw`
{"@name@"
  {condition
    {terms
      {"1.entities"
        {selector
          {tag @convoy@}
          {zone "@depot@"}
          {type vehicle}
        }
        {count
          {op ">="}
          {value @arrive@}
        }
      }
    }
  }
  {actions
    {"task"
      {name "@task@"}
      {state complete}
    }
  }
}
{"@fail_name@"
  {condition
    {expression "1 & !2"}
    {terms
      {"1.entities"
        {selector
          {tag @convoy_2@}
          {type vehicle}
        }
        {count
          {op "<<"}
          {value @arrive_2@}
        }
      }
      {"2.task"
        {name "@task_2@"}
      }
    }
  }
  {actions
    {"task"
      {name "@task_3@"}
      {state fail}
    }
    {"delay"
      {time 5}
    }
    {"gameover"
      {result loose}
      {message ""}
    }
  }
}
`),
    f: { name: tx('my_convoy_arrived'), convoy: tg('my_convoy'), depot: tx('my_depot'), arrive: num(2, { min: 1, int: true }),
      task: tx('my_convoy_task'), fail_name: tx('my_convoy_lost'), convoy_2: tg('my_convoy'), arrive_2: num(2, { min: 1, int: true }),
      task_2: tx('my_convoy_task'), task_3: tx('my_convoy_task') } }),

  // 594 C05
  P({ id: 'mi.idea.timed_evacuation_who_is_in_the_zone', no: 594, sec: 'mi.ideas.more', scope: TRIG, size: 'medium', tag: 'I', mp: 'unknown',
    src: 'map/single/01_usa-skirmish/00b_usa-hurtgen/0.mi:16143',
    code: T(String.raw`
{"@name@"
  {condition
    {terms
      {"1.event"
        {id "@time_up@"}
      }
    }
  }
  {actions
    {"switch"
      {"case"
        {condition
          {type entities}
          {selector
            {tag @civilians@}
            {zone "@evac_zone@"}
            {type human}
            {state "not dead"}
          }
          {count
            {op ">="}
            {value @saved@}
          }
        }
        {"gameover"
          {result win}
          {message ""}
        }
      }
      {"default"
        {"gameover"
          {result loose}
          {message ""}
        }
      }
    }
  }
}
`),
    f: { name: tx('my_evac_end'), time_up: ev('my_evac_time_up'), civilians: tg('my_civilians'), evac_zone: tx('my_evac_zone'),
      saved: num(5, { min: 1, int: true }) } }),

  // 595 C06
  P({ id: 'mi.idea.stealth_with_alarm_states', no: 595, sec: 'mi.ideas.stealth', scope: TRIG, size: 'large', tag: 'I', mp: 'yes',
    src: 'map/single/04_rus-skirmish/02b_rus-sevastopol/0.mi:18682',
    code: T(String.raw`
{"@name@"
  {condition
    {expression "1 & 2"}
    {terms
      {"1.see_actors"
        {selector
          {tag @guards@}
          {type human}
          {state "not dead"}
        }
        {enemy
          {tag @player_tag@}
          {type human}
          {state "not dead"}
        }
        {detection visible}
      }
      {"2.cmp_i"
        {var "@alarm@$"}
        {op "=="}
        {value 0}
      }
    }
  }
  {actions
    {"set_i"
      {var "@alarm_2@$"}
      {op "="}
      {value 1}
    }
  }
}
{"@shots_name@"
  {condition
    {terms
      {"1.signal"
        {zone "@camp@"}
        {signals "shot hit"}
      }
    }
  }
  {actions
    {"set_i"
      {var "@alarm_3@$"}
      {op "="}
      {value 2}
    }
    {"actor_state"
      {selector
        {tag @guards_2@}
        {type human}
      }
      {fire_mode open}
    }
  }
}
`),
    f: { name: tx('my_alarm_on_sight'), guards: tg('my_guards'), player_tag: tg('my_player_units'), alarm: tx('my_alarm'),
      alarm_2: tx('my_alarm'), shots_name: tx('my_alarm_on_shots'), camp: tx('my_camp'), alarm_3: tx('my_alarm'), guards_2: tg('my_guards') } }),

  // 596 C07
  P({ id: 'mi.idea.guards_search_around_the_alarm', no: 596, sec: 'mi.ideas.stealth', scope: CMD, size: 'small', tag: 'I', mp: 'yes',
    src: 'map/single/04_rus-skirmish/02b_rus-sevastopol/0.mi:21877',
    code: T(String.raw`
{"actor_recon"
  {selector
    {tag @guards@}
    {type human}
    {state "not dead"}
  }
  {drop orders}
  {radius @radius@}
}
`),
    f: { guards: tg('my_guards'), radius: num(150, { min: 1 }) } }),

  // 597 C08
  P({ id: 'mi.idea.prisoners_to_free', no: 597, sec: 'mi.ideas.more', scope: TRIG, size: 'medium', tag: 'I', mp: 'unknown',
    lim: ['MIS-38'], src: 'map/single/03_eng-skirmish/01b_eng-elalamein/0.mi:9945',
    code: T(String.raw`
{"@name@"
  {condition
    {terms
      {"1.near"
        {units
          {tag @player_tag@}
          {type human}
          {state "not dead"}
        }
        {near_to
          {tag @prisoners@}
        }
        {distance @distance@}
      }
    }
  }
  {actions
    {"player"
      {selector
        {tag @prisoners_2@}
        {type human}
      }
      {operation set}
      {player "@side@"}
    }
    {"actor_state"
      {selector
        {tag @prisoners_3@}
        {type human}
      }
      {control user}
    }
  }
}
`),
    f: { name: tx('my_free_prisoners'), player_tag: tg('my_player_units'), prisoners: tg('my_prisoners'), distance: num(5, { min: 1 }),
      prisoners_2: tg('my_prisoners'), side: num(2, { min: 0, int: true }), prisoners_3: tg('my_prisoners') } }),

  // 598 C09
  P({ id: 'mi.idea.civilians_that_flee_from_explosions', no: 598, sec: 'mi.ideas.more', scope: TRIG, size: 'medium', tag: 'I', mp: 'yes',
    src: 'map/single/04_rus-skirmish/02b_rus-sevastopol/0.mi:18682',
    code: T(String.raw`
{"@name@"
  {condition
    {terms
      {"1.signal"
        {zone "@village@"}
        {signals "explosion"}
      }
    }
  }
  {actions
    {"actor_state"
      {selector
        {tag @civilians@}
        {type human}
      }
      {movement
        {speed fast}
      }
    }
    {"actor_to_waypoint"
      {selector
        {tag @civilians_2@}
        {type human}
      }
      {drop orders}
      {waypoint "@exit@"}
    }
  }
}
`),
    f: { name: tx('my_civilians_flee'), village: tx('my_village'), civilians: tg('my_civilians'), civilians_2: tg('my_civilians'),
      exit: tx('my_exit') } }),

  // 599 C10
  P({ id: 'mi.idea.random_event_deck_every_few_minutes', no: 599, sec: 'mi.ideas.more', scope: TRIG, size: 'medium', tag: 'I', mp: 'yes',
    lim: ['MIS-34'], src: 'map/multi/1v1_winter_hills/combat.mi:77',
    code: T(String.raw`
{"@name@"
  {condition
  }
  {actions
    {"delay"
      {time @every@ @spread@}
    }
    {"switch"
      {"case"
        {condition
          {type rand}
          {value @chance_a@}
        }
        {"event"
          {event "@event_a@"}
          {mode set}
        }
      }
      {"case"
        {condition
          {type rand}
          {value @chance_b@}
        }
        {"event"
          {event "@event_b@"}
          {mode set}
        }
      }
      {"default"
        {"event"
          {event "@event_c@"}
          {mode set}
        }
      }
    }
    {"trigger"
      {name "@name_2@"}
    }
  }
}
`),
    f: { name: tx('my_event_deck'), every: sec(240), spread: sec(60), chance_a: ch(0.3), event_a: ev('my_air_raid'),
      chance_b: ch(0.4), event_b: ev('my_enemy_wave'), event_c: ev('my_quiet'), name_2: tx('my_event_deck') } }),

  // 600 C11
  P({ id: 'mi.idea.side_objective_unlocks_reinforcement', no: 600, sec: 'mi.ideas.more', scope: TRIG, size: 'small', tag: 'I', mp: 'no',
    src: '',
    code: T(String.raw`
{"@name@"
  {condition
    {terms
      {"1.task"
        {name "@task@"}
      }
    }
  }
  {actions
    {"reinforcement"
      {operation show}
      {name "@card@"}
    }
  }
}
`),
    f: { name: tx('my_side_reward'), task: tx('my_side_task'), card: tx('my_tank_card') } }),

  // 601 C12
  P({ id: 'mi.idea.defend_then_counterattack', no: 601, sec: 'mi.ideas.more', scope: TRIG, size: 'medium', tag: 'I', mp: 'unknown',
    src: 'map/single/01_usa-skirmish/00b_usa-hurtgen/0.mi:20895',
    code: T(String.raw`
{"@name@"
  {condition
    {terms
      {"1.event"
        {id "@hold_up@"}
      }
      {"2.entities"
        {selector
          {tag @wave@}
          {type human}
          {state "not dead"}
        }
        {count
          {op "<<"}
          {value @left@}
        }
      }
    }
  }
  {actions
    {"task"
      {name "@defend_task@"}
      {state complete}
    }
    {"task"
      {name "@attack_task@"}
    }
    {"event"
      {event "@attack_on@"}
      {mode set}
    }
  }
}
`),
    f: { name: tx('my_counterattack'), hold_up: ev('my_hold_time_up'), wave: tg('my_enemy_wave'), left: num(3, { min: 1, int: true }),
      defend_task: tx('my_defend_task'), attack_task: tx('my_attack_task'), attack_on: ev('my_counterattack_on') } }),

  // 602 C13
  P({ id: 'mi.idea.survivors_carry_over_to_the_next_pha', no: 602, sec: 'mi.ideas.more', scope: CMD, size: 'medium', tag: 'V', mp: 'yes',
    src: 'map_dlc_1: map/single/01_usa-skirmish/06_usa-dison/0.mi:16489',
    code: T(String.raw`
{"while"
  {condition
    {type entities}
    {selector
      {tag @squad@}
      {zone "@play_zone@"}
      {type human}
      {state "not dead"}
    }
    {count
      {op "<<"}
      {value "@survivors@$"}
    }
  }
  {"delay"
    {time 0.1}
  }
  {"waypoint"
    {who
      {type actor}
      {actors
        {source advanced}
        {group
          {select
            {tag
              {tag @squad_2@}
            }
          }
          {include
            {tag
              {tag hidden}
            }
            {prop
              {prop human}
            }
          }
        }
        {amount 1
        }
      }
    }
    {action
      {type start}
      {waypoint "@waypoint@"}
      {clone}
      {approach teleport}
    }
  }
  {"delay"
    {time 0.1}
  }
}
`),
    f: { squad: tg('my_phase2_squad'), play_zone: tx('my_gamezone'), survivors: tx('my_survivors'), squad_2: tg('my_phase2_squad'),
      waypoint: tx('my_phase2_wp') } }),

  // 603 C14
  P({ id: 'mi.idea.enemy_calls_artillery_on_the_last_se', no: 603, sec: 'mi.ideas.more', scope: TRIG, size: 'medium', tag: 'I', mp: 'yes',
    lim: ['MIS-44'], src: 'map/single/03_eng-skirmish/01b_eng-elalamein/0.mi:10025',
    code: T(String.raw`
{"@name@"
  {condition
    {terms
      {"1.see_actors"
        {selector
          {tag @spotter@}
          {type human}
        }
        {enemy
          {tag @player_tag@}
        }
        {detection visible}
        {tag
          {"tag pair"}
          {"for selector" @spotter_pair@}
          {"for enemy" @spotted@}
        }
      }
    }
  }
  {actions
    {"delay"
      {time @wait@}
    }
    {"actor_fire"
      {selector
        {tag @battery@}
        {type vehicle}
        {state inhabited}
      }
      {enemies
        {tag @spotted_2@}
      }
      {interval 0}
      {time 0}
      {burst_mode @burst@}
    }
  }
}
`),
    f: { name: tx('my_spotter_calls'), spotter: tg('my_spotter'), player_tag: tg('my_player_units'), spotter_pair: tg('my_spotter_pair'),
      spotted: tg('my_spotted'), wait: sec(20), battery: tg('my_battery'), spotted_2: tg('my_spotted'),
      burst: { k: 'choice', def: 'long', choices: ['smart', 'once', 'short', 'long'] } } }),

  // 604 C15
  P({ id: 'mi.idea.commander_whose_death_changes_the_sq', no: 604, sec: 'mi.ideas.more', scope: TRIG, size: 'medium', tag: 'I', mp: 'yes',
    lim: ['MIS-68'], src: 'map/single/04_rus-skirmish/02b_rus-sevastopol/0.mi:16747',
    code: T(String.raw`
{"@name@"
  {condition
    {terms
      {"1.entities"
        {selector
          {tag @officer@}
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
    {"actor_state"
      {selector
        {tag @squad@}
        {type human}
      }
      {ai
        {advance_ratio @advance@}
        {retreat_ratio @retreat@}
      }
    }
  }
}
`),
    f: { name: tx('my_officer_down'), officer: tg('my_officer'), squad: tg('my_officer_squad'), advance: num(0.1, { min: 0 }),
      retreat: num(2, { min: 0 }) } }),

  // 605 C16
  P({ id: 'mi.idea.night_falls_during_the_mission', no: 605, sec: 'mi.ideas.atmosphere', scope: CMD, size: 'small', tag: 'T', mp: 'yes',
    src: 'map/multi/1v1_winter_hills/combat.mi:87',
    code: T(String.raw`
{"environment"
  {name "@preset@"}
}
`),
    f: { preset: tx('my_night_environment') } }),

  // 606 C17
  P({ id: 'mi.idea.fog_that_changes_sight_in_parts_of_t', no: 606, sec: 'mi.ideas.atmosphere', scope: CMD, size: 'small', tag: 'T', mp: 'unknown',
    src: '',
    code: T(String.raw`
{"fog_in_zone"
  {zone "@zone@"}
  {enable @enable@}
}
`),
    f: { zone: tx('my_forest'), enable: { k: 'choice', def: 'off', choices: ['on', 'off'] } } }),

  // 607 C18
  P({ id: 'mi.idea.surrender_when_a_group_is_broken', no: 607, sec: 'mi.ideas.more', scope: TRIG, size: 'medium', tag: 'I', mp: 'unknown',
    src: 'map/single/03_eng-skirmish/01b_eng-elalamein/0.mi:9982',
    code: T(String.raw`
{"@name@"
  {condition
    {terms
      {"1.entities"
        {selector
          {tag @garrison@}
          {type human}
          {state "not dead"}
        }
        {count
          {op "<<"}
          {value @left@}
        }
      }
    }
  }
  {actions
    {"inventory"
      {selector
        {tag @garrison_2@}
        {type human}
        {state "not dead"}
      }
      {action drop}
    }
    {"actor_state"
      {selector
        {tag @garrison_3@}
        {type human}
      }
      {fire_mode hold}
      {move_mode hold}
    }
  }
}
`),
    f: { name: tx('my_surrender'), garrison: tg('my_garrison'), left: num(3, { min: 1, int: true }), garrison_2: tg('my_garrison'),
      garrison_3: tg('my_garrison') } }),

  // 608 C19
  P({ id: 'mi.idea.king_of_the_hill_in_a_single_player', no: 608, sec: 'mi.ideas.more', scope: TRIG, size: 'large', tag: 'I', mp: 'unknown',
    src: 'map/single/01_usa-skirmish/01_usa-overlord/0.mi:15879',
    code: T(String.raw`
{"@name@"
  {condition
    {terms
      {"1.entities"
        {selector
          {tag @player_tag@}
          {zone "@hill@"}
          {type human}
          {state "not dead"}
        }
      }
      {"2.entities"
        {selector
          {tag @enemy@}
          {zone "@hill_2@"}
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
    {"set_i"
      {var "@hill_time@$"}
      {op "+"}
      {value 1}
    }
    {"delay"
      {time 1}
    }
    {"trigger"
      {name "@name_2@"}
    }
  }
}
{"@win_name@"
  {condition
    {terms
      {"1.cmp_i"
        {var "@hill_time_2@$"}
        {op ">="}
        {value @hold@}
      }
    }
  }
  {actions
    {"gameover"
      {result win}
      {message ""}
    }
  }
}
`),
    f: { name: tx('my_hill_tick'), player_tag: tg('my_player_units'), hill: tx('my_hill'), enemy: tg('my_enemy'), hill_2: tx('my_hill'),
      hill_time: tx('my_hill_time'), name_2: tx('my_hill_tick'), win_name: tx('my_hill_won'), hill_time_2: tx('my_hill_time'),
      hold: num(300, { min: 1, int: true }) } }),

  // 609 C20
  P({ id: 'mi.idea.capture_a_flag_single_player', no: 609, sec: 'mi.ideas.more', scope: TRIG, size: 'medium', tag: 'V', mp: 'yes',
    src: 'map/single/01_usa-skirmish/00b_usa-hurtgen/0.mi:16143',
    code: T(String.raw`
{"@name@"
  {condition
    {terms
      {"1.entities"
        {selector
          {tag @enemy@}
          {zone "@flag_zone@"}
          {type human}
          {state "not dead"}
        }
        {count
          {op "=="}
          {value 0}
        }
      }
      {"2.entities"
        {selector
          {tag @player_tag@}
          {zone "@flag_zone_2@"}
          {type human}
          {state "not dead"}
        }
      }
    }
  }
  {actions
    {"rt_function"
      {selector
        {tag @flag_ai@}
      }
      {call "AniPlay"
        {name down}
        {speed 1}
      }
    }
    {"delay"
      {time 10}
    }
    {"entity_state"
      {selector
        {tag @flag_ai_2@}
      }
      {tag_add hidden}
      {inactive on}
    }
    {"entity_state"
      {selector
        {tag @flag_player@}
      }
      {tag_remove hidden}
      {inactive off}
    }
    {"rt_function"
      {selector
        {tag @flag_player_2@}
      }
      {call "AniPlay"
        {name up}
        {speed 1}
      }
    }
    {"entity_state"
      {selector
        {tag @flag_player_3@}
      }
      {tag_add captured}
    }
  }
}
`),
    f: { name: tx('my_flag_capture'), enemy: tg('my_enemy'), flag_zone: tx('my_flag'), player_tag: tg('my_player_units'),
      flag_zone_2: tx('my_flag'), flag_ai: tg('my_flag_ai'), flag_ai_2: tg('my_flag_ai'), flag_player: tg('my_flag_player'),
      flag_player_2: tg('my_flag_player'), flag_player_3: tg('my_flag_player') } }),

  // 610 C21
  P({ id: 'mi.idea.wave_survival_with_a_shop', no: 610, sec: 'mi.ideas.more', scope: TRIG, size: 'large', tag: 'I', mp: 'no',
    src: 'map/single/01_usa-skirmish/01_usa-overlord/0.mi:15346',
    code: T(String.raw`
{"@name@"
  {condition
    {terms
      {"1.event"
        {id "@cleared@"}
      }
    }
  }
  {actions
    {"event"
      {event "@cleared_2@"}
      {mode reset}
    }
    {"reinforcement"
      {operation score_add}
      {score @score@}
    }
    {"trigger"
      {name "@name_2@"}
    }
  }
}
`),
    f: { name: tx('my_wave_bounty'), cleared: ev('my_wave_cleared'), cleared_2: ev('my_wave_cleared'), score: num(300, { min: 0 }),
      name_2: tx('my_wave_bounty') } }),

  // 611 C22
  P({ id: 'mi.idea.bounty_for_each_enemy_killed', no: 611, sec: 'mi.ideas.more', scope: TRIG, size: 'medium', tag: 'I', mp: 'no',
    lim: ['MIS-43'], src: 'map_dlc_1: map/single/01_usa-skirmish/06_usa-dison/0.mi:16500',
    code: T(String.raw`
{"@name@"
  {condition
    {terms
      {"1.entities"
        {selector
          {tag @enemy@}
          {type human}
          {state dead}
        }
        {count
          {op ">"}
          {value "@paid@$"}
        }
      }
    }
  }
  {actions
    {"set_i"
      {var "@paid_2@$"}
      {op "+"}
      {value 1}
    }
    {"reinforcement"
      {operation score_add}
      {score @score@}
    }
    {"trigger"
      {name "@name_2@"}
    }
  }
}
`),
    f: { name: tx('my_kill_bounty'), enemy: tg('my_enemy'), paid: tx('my_kills_paid'), paid_2: tx('my_kills_paid'),
      score: num(10, { min: 0 }), name_2: tx('my_kill_bounty') } }),

  // 612 C23
  P({ id: 'mi.idea.supply_drop_where_the_player_points', no: 612, sec: 'mi.ideas.more', scope: TRIG, size: 'medium', tag: 'V', mp: 'no',
    src: 'map/single/01_usa-skirmish/02b_usa-bastogne/0.mi:9883',
    code: T(String.raw`
{"@name@"
  {condition
    {terms
      {"1.event"
        {id "@called@"}
      }
    }
  }
  {actions
    {"delay"
      {time @wait@}
    }
    {"spawn"
      {entity "@entity@"}
      {waypoint "@waypoint@"}
    }
  }
}
`),
    f: { name: tx('my_drop'), called: ev('my_drop_called'), wait: sec(5), entity: { k: 'entity', def: 'my_supply_box' },
      waypoint: tx('my_drop_wp') } }),
] };

// Code Pieces, group mi-idea-2: ideas to try in mission files (.mi), numbers 613 to 635
// (list, rows C24 to C46). Each one is built from parts vanilla missions or the
// the game use; the code was checked against the cited game lines. Format: tools/ide/README.md "tools/ide/kit";
// contract: Scopes: a trigger goes in:triggers, a term in:terms, commands go in:actions
// inside a statement ("if", "case", "default": in:*), as in mission > Helpers > triggers of a vanilla 0.mi.
// Author: Imperator_Aug (ARSENAL, ia-eb2ab08c)
'use strict';

// code is written with two-space indents below and turned into tabs here (String.raw keeps the backslashes)
const T = s => s.replace(/^\n/, '').replace(/\n$/, '').replace(/^((?: {2})+)/gm, m => '\t'.repeat(m.length / 2));
const base = { kinds: ['mi'], role: 'recipe', needs: [], lim: [], short: false, adv: false, wrap: false, task: null, since: '2026-11' };
const P = o => Object.assign({}, base, o);
const TRIG = ['in:triggers'], TERM = ['in:terms'], CMD = ['in:actions', 'in:*'];
const txt = def => ({ k: 'text', def });
const tag = def => ({ k: 'tag', def });

module.exports = { group: 'mi-idea-2', pieces: [
  P({ id: 'mi.idea.player_called_air_strike', no: 613, sec: 'mi.ideas.more', scope: TRIG, size: 'large', tag: 'V', mp: 'no',
    src: 'bastogne:9910', code: T(String.raw`
{"@trigger@"
  {condition
    {terms
      {"1.event"
        {id "@event@"}
      }
    }
  }
  {actions
    {"actor_to_waypoint"
      {selector
        {tag @plane@}
      }
      {waypoint "@waypoint@"}
      {approach "safe teleport & rotate"}
    }
  }
}
`), f: { trigger: txt('my_strike_called'), event: { k: 'event', def: 'my_strike' }, plane: tag('my_plane'), waypoint: txt('my_air_in') } }),

  P({ id: 'mi.idea.hold_the_line_for_n_minutes', no: 614, sec: 'mi.ideas.more', scope: TRIG, size: 'medium', tag: 'I', mp: 'unknown',
    src: 'B52 + B27', code: T(String.raw`
{"@trigger@"
  {condition
    {expression "1 & !2"}
    {terms
      {"1.entities"
        {selector
          {tag @units@}
          {zone "@zone@"}
          {type human}
          {state "not dead"}
        }
        {count
          {op "=="}
          {value 0}
        }
      }
      {"2.event"
        {id "@event@"}
      }
    }
  }
  {actions
    {"gameover"
      {result loose}
      {message ""}
    }
  }
}
`), f: { trigger: txt('my_line_lost'), units: tag('my_player_units'), zone: txt('my_line'), event: { k: 'event', def: 'my_hold_time_up' } } }),

  P({ id: 'mi.idea.escort_a_vip', no: 615, sec: 'mi.ideas.more', scope: TRIG, size: 'medium', tag: 'I', mp: 'unknown',
    src: 'B26, B29, B82', code: T(String.raw`
{"@trigger@"
  {condition
    {terms
      {"1.entities"
        {selector
          {tag @vip@}
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
    {"task"
      {name "@task@"}
      {state fail}
    }
    {"delay"
      {time @wait@}
    }
    {"gameover"
      {result loose}
      {message ""}
    }
  }
}
`), f: { trigger: txt('my_vip_dead'), vip: tag('my_vip'), task: txt('my_vip_task'), wait: { k: 'seconds', def: 3, min: 0 } } }),

  P({ id: 'mi.idea.sniper_gives_himself_away_when_he_fi', no: 616, sec: 'mi.ideas.stealth', scope: TRIG, size: 'small', tag: 'I', mp: 'yes',
    src: 'sevastopol:18682', code: T(String.raw`
{"@trigger@"
  {autoreset}
  {condition
    {terms
      {"1.signal"
        {zone "@zone@"}
        {signals "shot"}
      }
    }
  }
  {actions
    {"entity_state"
      {selector
        {tag @sniper@}
      }
      {discovered on}
    }
  }
}
`), f: { trigger: txt('my_sniper_revealed'), zone: txt('my_sniper_nest'), sniper: tag('my_sniper') } }),

  P({ id: 'mi.idea.warning_when_the_player_walks_into_a', no: 617, sec: 'mi.ideas.more', scope: TERM, size: 'small', tag: 'T', adv: true, mp: 'unknown',
    src: '', code: T(String.raw`
{"1.mined"
  {zone "@zone@"}
  {type @type@}
  {infill @infill@}
}
`), f: { zone: txt('my_field'), type: { k: 'choice', def: 'antipersonnel', choices: ['antipersonnel', 'antitank'] }, infill: { k: 'number', def: 10, min: 0, max: 99 } } }),

  P({ id: 'mi.idea.engineers_lay_mines_then_the_plan_go', no: 618, sec: 'mi.ideas.more', scope: CMD, size: 'small', tag: 'T', adv: true, mp: 'unknown',
    src: '', code: T(String.raw`
{"mine"
  {selector
    {tag @engineers@}
    {type human}
  }
  {zone "@zone@"}
  {event "@event@"}
}
`), f: { engineers: tag('my_engineers'), zone: txt('my_field'), event: { k: 'event', def: 'my_field_mined' } } }),

  P({ id: 'mi.idea.tank_engine_fails_at_a_random_moment', no: 619, sec: 'mi.ideas.more', scope: CMD, size: 'small', tag: 'I', mp: 'yes',
    src: 'elalamein:22327', code: T(String.raw`
{"delay"
  {time @time@ @spread@}
}
{"actor_component"
  {selector
    {tag @tank@}
  }
  {component @component@}
  {state broken}
}
`), f: { time: { k: 'seconds', def: 300, min: 0 }, spread: { k: 'seconds', def: 120, min: 0 }, tank: tag('my_tank'), component: txt('gun') } }),

  P({ id: 'mi.idea.burning_town_random_houses_catch_fir', no: 620, sec: 'mi.ideas.atmosphere', scope: CMD, size: 'small', tag: 'V', mp: 'yes',
    src: 'elalamein:22152', code: T(String.raw`
{"effect"
  {selector
    {amount @amount@}
    {tag @houses@}
  }
  {effect @effect@}
}
`), f: { amount: { k: 'number', def: 1, min: 1, int: true }, houses: tag('my_houses'), effect: { k: 'effect', def: '_burn' } } }),

  P({ id: 'mi.idea.radio_chatter_when_the_player_looks', no: 621, sec: 'mi.ideas.more', scope: TERM, size: 'small', tag: 'T', adv: true, mp: 'no',
    lim: ['NET-02'], src: '', code: T(String.raw`
{"1.camera"
  {zone "@zone@"}
  {appearance @appearance@}
  {time @time@}
}
`), f: { zone: txt('my_bridge'), appearance: { k: 'choice', def: 'visible', choices: ['visible', 'partial', 'invisible', 'none'] }, time: { k: 'seconds', def: 2, min: 0 } } }),

  P({ id: 'mi.idea.truck_brings_reinforcements_and_unlo', no: 622, sec: 'mi.ideas.more', scope: CMD, size: 'small', tag: 'V', mp: 'yes',
    src: 'tutorial-units:12099', code: T(String.raw`
{"actor_to_waypoint"
  {selector
    {tag @truck@}
    {type vehicle}
  }
  {drop orders}
  {waypoint "@waypoint@"}
}
`), f: { truck: tag('my_truck'), waypoint: txt('my_unload') } }),

  P({ id: 'mi.idea.ammo_running_low_call', no: 623, sec: 'mi.ideas.more', scope: TERM, size: 'small', tag: 'I', mp: 'unknown',
    src: 'dison:16610', code: T(String.raw`
{"1.inventory"
  {selector
    {tag @team@}
    {type human}
  }
  {item @item@}
  {compare @compare@}
  {amount @amount@}
}
`), f: { team: tag('my_mg_team'), item: txt('ammo'), compare: { k: 'choice', def: 'less', choices: ['less', 'equal', 'greater'] }, amount: { k: 'number', def: 50, min: 0, int: true } } }),

  P({ id: 'mi.idea.sound_the_alarm_siren_and_music', no: 624, sec: 'mi.ideas.stealth', scope: CMD, size: 'small', tag: 'I', mp: 'yes',
    src: '', code: T(String.raw`
{"sound"
  {name "@sound@"}
  {waypoint "@waypoint@"}
}
`), f: { sound: { k: 'sound', def: 'world/alarm_loud' }, waypoint: txt('my_siren_wp') } }),

  P({ id: 'mi.idea.player_choices_from_mission_options', no: 625, sec: 'mi.ideas.more', scope: CMD, size: 'small', tag: 'I', mp: 'unknown',
    src: 'dison:16753', code: T(String.raw`
{"if"
  {condition
    {type mission_option}
    {name "@option@"}
  }
  {"delete"
    {selector
      {tag @units@}
    }
  }
}
`), f: { option: txt('my_no_tanks'), units: tag('my_enemy_tanks') } }),

  P({ id: 'mi.idea.one_mission_different_armies', no: 626, sec: 'mi.ideas.more', scope: CMD, size: 'small', tag: 'I', mp: 'unknown',
    src: '', code: T(String.raw`
{"if"
  {condition
    {type side}
    {side @army@}
  }
  {"entity_state"
    {selector
      {tag @units@}
    }
    {tag_remove hidden}
    {inactive off}
  }
}
`), f: { army: { k: 'choice', def: 'ger', choices: ['ger', 'usa', 'eng', 'rus', 'jap'] }, units: tag('my_ger_extras') } }),

  P({ id: 'mi.idea.ally_turns_traitor_mid_mission', no: 627, sec: 'mi.ideas.more', scope: CMD, size: 'small', tag: 'I', mp: 'unknown',
    src: 'elalamein:9945', code: T(String.raw`
{"player"
  {selector
    {tag @units@}
    {type human}
  }
  {operation set}
  {player "@player@"}
}
`), f: { units: tag('my_traitors'), player: { k: 'number', def: 1, min: 0, int: true } } }),

  P({ id: 'mi.idea.hostages_safe_until_freed', no: 628, sec: 'mi.ideas.more', scope: CMD, size: 'small', tag: 'V', mp: 'yes',
    src: 'B82 values', code: T(String.raw`
{"entity_state"
  {selector
    {tag @hostages@}
  }
  {impregnability @mode@}
}
`), f: { hostages: tag('my_hostages'), mode: { k: 'choice', def: 'disabled', choices: ['disabled', 'full', 'harmless'] } } }),

  P({ id: 'mi.idea.scout_on_the_hill_reveals_the_valley', no: 629, sec: 'mi.ideas.more', scope: CMD, size: 'small', tag: 'I', mp: 'yes',
    src: 'B26 + B81', code: T(String.raw`
{"entity_state"
  {selector
    {zone "@zone@"}
    {tag @enemy@}
  }
  {discovered on}
}
`), f: { zone: txt('my_valley'), enemy: tag('my_enemy') } }),

  P({ id: 'mi.idea.respawn_a_squad_at_the_last_held_fla', no: 630, sec: 'mi.ideas.more', scope: CMD, size: 'medium', tag: 'I', mp: 'yes',
    src: 'B36 + B15', code: T(String.raw`
{"switch"
  {"case"
    {condition
      {type cmp_i}
      {var "@var@$"}
      {op "=="}
      {value @value@}
    }
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
        {waypoint "@flag_wp@"}
        {clone}
        {approach "safe teleport & rotate"}
      }
    }
  }
  {"default"
    {"waypoint"
      {who
        {type actor}
        {actors
          {amount 1}
          {tag @pool_2@}
        }
      }
      {action
        {type start}
        {waypoint "@base_wp@"}
        {clone}
        {approach "safe teleport & rotate"}
      }
    }
  }
}
`), f: { var: txt('my_last_flag'), value: { k: 'number', def: 2, int: true }, pool: tag('my_pool'), flag_wp: txt('my_flag2_wp'), pool_2: tag('my_pool'), base_wp: txt('my_base_wp') } }),

  P({ id: 'mi.idea.enemy_pressure_follows_the_player', no: 631, sec: 'mi.ideas.more', scope: TRIG, size: 'medium', tag: 'I', mp: 'yes',
    src: 'B26 + B32', code: T(String.raw`
{"@trigger@"
  {condition
    {terms
      {"1.entities"
        {selector
          {tag @units@}
          {zone "@zone@"}
          {type human}
          {state "not dead"}
        }
        {count
          {op ">="}
          {value @count@}
        }
      }
    }
  }
  {actions
    {"actor_to_waypoint"
      {selector
        {tag @reserve@}
        {type human}
      }
      {drop orders}
      {waypoint "@waypoint@"}
    }
  }
}
`), f: { trigger: txt('my_pressure_east'), units: tag('my_player_units'), zone: txt('my_east'), count: { k: 'number', def: 8, min: 1, int: true }, reserve: tag('my_enemy_reserve'), waypoint: txt('my_east_wp') } }),

  P({ id: 'mi.idea.hunt_the_tank_ace_objective_appears', no: 632, sec: 'mi.ideas.more', scope: TERM, size: 'small', tag: 'I', mp: 'unknown',
    src: 'elalamein:10025', code: T(String.raw`
{"1.see_actors"
  {selector
    {tag @units@}
  }
  {enemy
    {tag @ace@}
  }
  {detection visible}
}
`), f: { units: tag('my_player_units'), ace: tag('my_ace') } }),

  P({ id: 'mi.idea.keep_units_between_missions', no: 633, sec: 'mi.ideas.more', scope: CMD, size: 'small', tag: 'T', adv: true, mp: 'no',
    src: '', code: T(String.raw`
{"store_units"
  {selector
    {tag @units@}
  }
  {slot_name "@slot@"}
}
`), f: { units: tag('my_survivors'), slot: txt('my_campaign_slot') } }),

  P({ id: 'mi.idea.ghost_town_that_springs_to_life', no: 634, sec: 'mi.ideas.more', scope: CMD, size: 'medium', tag: 'I', mp: 'yes',
    src: 'B34 + B24', code: T(String.raw`
{"entity_state"
  {selector
    {tag @wave1@}
  }
  {tag_remove hidden}
  {inactive off}
}
{"delay"
  {time @wait@}
}
{"entity_state"
  {selector
    {tag @wave2@}
  }
  {tag_remove hidden}
  {inactive off}
}
`), f: { wave1: tag('my_town_wave1'), wait: { k: 'seconds', def: 8, min: 0 }, wave2: tag('my_town_wave2') } }),

  P({ id: 'mi.idea.player_takes_direct_control_of_one_t', no: 635, sec: 'mi.ideas.more', scope: CMD, size: 'medium', tag: 'V', mp: 'no',
    lim: ['MIS-41'], src: 'dison:26672', code: T(String.raw`
{"third_person_control"
  {selector
    {tag @tank@}
  }
  {lock on}
  {position
    {linkBone @bone@}
    {offest
      {x -75}
      {y 0}
      {z 75}
    }
  }
  {clip
    {viewMin -45}
    {viewMax 15}
  }
  {zoom
    {min 0}
    {max @zoom@}
  }
}
`), f: { tank: tag('my_hero_tank'), bone: { k: 'bone', def: 'basis' }, zoom: { k: 'number', def: 650, min: 0 } } }),
] };

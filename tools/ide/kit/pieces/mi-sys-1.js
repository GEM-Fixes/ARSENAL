// Code Pieces, group mi-sys-1: four large ready systems for mission files (.mi), numbers 636 to 639 of
// (next-mission-patterns.md E01-E04): objective chain, wave defence, stealth alarm
// reinforcement manager. Format: tools/ide/README.md "tools/ide/kit"; contract:
// Each piece is the trigger entries only and drops into {Helpers {triggers ...}} (scope in:triggers); the events,
// vars, zones, tasks, waypoints and cards it names are declared elsewhere in Helpers and listed in the .n text.
// Internal names (events, vars, triggers, tasks, cards) are fixed with a system prefix (chain_, wave_, alarm_,
// reinf_); names that must match the map (tags, zones, waypoints) are fields, one field per copy (name, name_2, ...).
// Every keyword checked against the vanilla single-player missions in map*.pak and game/helper/*.cpp.
// Author: Imperator_Aug (ARSENAL, ia-2ff195bf)
'use strict';

// code is written with two-space indents below and turned into tabs here
const T = s => s.replace(/^\n/, '').replace(/\n$/, '').replace(/^((?: {2})+)/gm, m => '\t'.repeat(m.length / 2));
const base = { kinds: ['mi'], scope: ['in:triggers'], role: 'block', needs: [], lim: [], short: false, adv: false,
  wrap: false, task: null, since: '2026-11', sec: 'mi.sys', size: 'large', tag: 'I', mp: 'no' };
const P = o => Object.assign({}, base, o);
const tag = d => ({ k: 'tag', def: d });
const txt = d => ({ k: 'text', def: d });
const sec = d => ({ k: 'seconds', def: d, min: 0 });
const num = (d, min) => ({ k: 'number', def: d, min: min, int: true });

// 636 E01: take a village, destroy a battery, hold for a time; lose when the player is wiped out
const CHAIN = T(`
{"chain/obj1:show"
  {condition
  }
  {actions
    {"delay"
      {time 3}
    }
    {"task"
      {name "chain_obj1"}
    }
    {"sound"
      {name "mission/task_new"}
    }
    {"set_i"
      {var "chain_stage$"}
      {op "="}
      {value 1}
    }
  }
}
{"chain/obj1:done"
  {condition
    {terms
      {"1.cmp_i"
        {var "chain_stage$"}
        {op "=="}
        {value 1}
      }
      {"2.entities"
        {selector
          {tag @enemy@}
          {zone "@village@"}
          {type human}
          {state "not dead"}
        }
        {count
          {op "=="}
          {value 0}
        }
      }
      {"3.entities"
        {selector
          {tag @player@}
          {zone "@village_2@"}
          {type human}
          {state "not dead"}
        }
      }
    }
  }
  {actions
    {"task"
      {name "chain_obj1"}
      {state complete}
    }
    {"sound"
      {name "mission/task_fulfilled"}
    }
    {"set_i"
      {var "chain_stage$"}
      {op "="}
      {value 2}
    }
  }
}
{"chain/obj2:show"
  {condition
    {terms
      {"1.task"
        {name "chain_obj1"}
      }
    }
  }
  {actions
    {"delay"
      {time 4}
    }
    {"task"
      {name "chain_obj2"}
    }
    {"sound"
      {name "mission/task_new"}
    }
  }
}
{"chain/obj2:done"
  {condition
    {terms
      {"1.cmp_i"
        {var "chain_stage$"}
        {op "=="}
        {value 2}
      }
      {"2.entities"
        {selector
          {tag @battery@}
          {type vehicle}
          {state inhabited}
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
      {name "chain_obj2"}
      {state complete}
    }
    {"sound"
      {name "mission/task_fulfilled"}
    }
    {"set_i"
      {var "chain_stage$"}
      {op "="}
      {value 3}
    }
  }
}
{"chain/obj3:show"
  {condition
    {terms
      {"1.cmp_i"
        {var "chain_stage$"}
        {op "=="}
        {value 3}
      }
    }
  }
  {actions
    {"delay"
      {time 4}
    }
    {"task"
      {name "chain_obj3"}
    }
    {"sound"
      {name "mission/task_new"}
    }
    {"timer"
      {time @hold@}
      {title "$/chain_timer"}
    }
    {"event"
      {event "chain_time_up"}
      {mode set}
      {delay @hold_2@}
    }
  }
}
{"chain/obj3:done"
  {condition
    {expression "1 & !2"}
    {terms
      {"1.event"
        {id "chain_time_up"}
      }
      {"2.event"
        {id "chain_over"}
      }
    }
  }
  {actions
    {"event"
      {event "chain_over"}
      {mode set}
    }
    {"timer"
      {hide}
      {title "$/chain_timer"}
    }
    {"task"
      {name "chain_obj3"}
      {state complete}
    }
    {"sound"
      {name "mission/task_fulfilled"}
    }
    {"delay"
      {time 3}
    }
    {"gameover"
      {result win}
      {message ""}
    }
  }
}
{"chain/lost"
  {condition
    {expression "1 & !2"}
    {terms
      {"1.entities"
        {selector
          {tag @player_2@}
          {type human}
          {state "not dead"}
        }
        {count
          {op "=="}
          {value 0}
        }
      }
      {"2.event"
        {id "chain_over"}
      }
    }
  }
  {actions
    {"event"
      {event "chain_over"}
      {mode set}
    }
    {"task"
      {name "chain_obj1"}
      {state fail}
    }
    {"sound"
      {name "mission/task_failed"}
    }
    {"delay"
      {time 3}
    }
    {"gameover"
      {result loose}
      {message ""}
    }
  }
}
{"chain/debug:jump"
  {disabled}
  {condition
  }
  {actions
    {"set_i"
      {var "chain_stage$"}
      {op "="}
      {value 3}
    }
    {"con"
      {text "DEBUG jumped to stage 3"}
    }
  }
}
`);

// 637 E02: a wave every gap seconds from three hidden pools, win when the last wave is dead
const poolWave = (n, pool, wp) => `      {"loop" @${n}@
        {"delay"
          {time 0.1}
        }
        {"waypoint"
          {who
            {type actor}
            {actors
              {amount 1}
              {tag @${pool}@}
            }
          }
          {action
            {type start}
            {waypoint "@${wp}@"}
            {clone}
            {approach "safe teleport & rotate"}
          }
        }
      }`.replace(/^/gm, '  ');
const WAVES = T(`
{"wave/setup"
  {condition
  }
  {actions
    {"set_i"
      {var "wave_max$"}
      {op "="}
      {value @waves@}
    }
    {"timer"
      {time @warmup@}
      {title "$/wave_timer"}
    }
    {"delay"
      {time @warmup_2@}
    }
    {"event"
      {event "wave_on"}
      {mode set}
    }
  }
}
{"wave/clock"
  {condition
    {expression "1 & !2 & 3"}
    {terms
      {"1.event"
        {id "wave_on"}
      }
      {"2.event"
        {id "wave_over"}
      }
      {"3.cmp_i"
        {var "wave_n$"}
        {op "<<"}
        {value "wave_max$"}
      }
    }
  }
  {actions
    {"set_i"
      {var "wave_n$"}
      {op "+"}
      {value 1}
    }
    {"event"
      {event "wave_go"}
      {mode set}
    }
    {"timer"
      {time @gap@}
      {title "$/wave_timer"}
    }
    {"delay"
      {time @gap_2@}
    }
    {"trigger"
      {name "wave/clock"}
    }
  }
}
{"wave/build"
  {condition
    {terms
      {"1.event"
        {id "wave_go"}
      }
    }
  }
  {actions
    {"event"
      {event "wave_go"}
      {mode reset}
    }
    {"switch"
      {"case"
        {condition
          {type cmp_i}
          {var "wave_n$"}
          {op "<<="}
          {value 2}
        }
${poolWave('inf_count', 'pool_inf', 'spawn_wp')}
      }
      {"case"
        {condition
          {type cmp_i}
          {var "wave_n$"}
          {op "<<="}
          {value 4}
        }
${poolWave('mg_count', 'pool_mg', 'spawn_wp_2')}
      }
      {"default"
${poolWave('tank_count', 'pool_tank', 'spawn_wp_3')}
      }
    }
    {"delay"
      {time 1}
    }
    {"entity_state"
      {selector
        {zone "@spawn_zone@"}
        {player "@enemy_player@"}
      }
      {tag_add wave_units}
    }
    {"actor_to_waypoint"
      {selector
        {tag wave_units}
        {type human}
      }
      {drop orders}
      {waypoint "@base_wp@"}
    }
    {"actor_to_waypoint"
      {selector
        {tag wave_units}
        {type vehicle}
      }
      {drop orders}
      {waypoint "@base_wp_2@"}
    }
    {"if"
      {condition
        {type cmp_i}
        {var "wave_n$"}
        {op ">="}
        {value "wave_max$"}
      }
      {"event"
        {event "wave_last"}
        {mode set}
      }
    }
    {"trigger"
      {name "wave/build"}
    }
  }
}
{"wave/cleared"
  {condition
    {expression "1 & 2 & !3 & 4"}
    {terms
      {"1.event"
        {id "wave_on"}
      }
      {"2.entities"
        {selector
          {tag wave_units}
          {type human}
          {state "not dead"}
        }
        {count
          {op "=="}
          {value 0}
        }
      }
      {"3.event"
        {id "wave_over"}
      }
      {"4.cmp_i"
        {var "wave_n$"}
        {op ">="}
        {value 1}
      }
    }
  }
  {actions
    {"reinforcement"
      {operation score_add}
      {score @bonus@}
    }
    {"sound"
      {name "mission/task_fulfilled"}
    }
    {"delay"
      {time 30}
    }
    {"trigger"
      {name "wave/cleared"}
    }
  }
}
{"wave/base_lost"
  {condition
    {expression "1 & 2 & !3"}
    {terms
      {"1.event"
        {id "wave_on"}
      }
      {"2.entities"
        {selector
          {tag @player@}
          {zone "@base@"}
          {type human}
          {state "not dead"}
        }
        {count
          {op "=="}
          {value 0}
        }
      }
      {"3.event"
        {id "wave_over"}
      }
    }
  }
  {actions
    {"event"
      {event "wave_over"}
      {mode set}
    }
    {"gameover"
      {result loose}
      {message ""}
    }
  }
}
{"wave/survived"
  {condition
    {expression "1 & 2 & !3"}
    {terms
      {"1.event"
        {id "wave_last"}
      }
      {"2.entities"
        {selector
          {tag wave_units}
          {type human}
          {state "not dead"}
        }
        {count
          {op "=="}
          {value 0}
        }
      }
      {"3.event"
        {id "wave_over"}
      }
    }
  }
  {actions
    {"event"
      {event "wave_over"}
      {mode set}
    }
    {"timer"
      {hide}
      {title "$/wave_timer"}
    }
    {"delay"
      {time 3}
    }
    {"gameover"
      {result win}
      {message ""}
    }
  }
}
`);

// 638 E03: guards hold fire, grow suspicious on sight, raise the alarm on shots or long sight, calm down later
const seeTerm = (ind, guards, player, dist) => {
  const i = ' '.repeat(ind);
  return [
    `${i}{selector`, `${i}  {tag @${guards}@}`, `${i}  {type human}`, `${i}  {state "not dead"}`, `${i}}`,
    `${i}{enemy`, `${i}  {tag @${player}@}`, `${i}  {type human}`, `${i}}`,
  ].concat(dist ? [`${i}{distance`, `${i}  {mode near_than}`, `${i}  {meters @${dist}@}`, `${i}}`] : [])
    .concat([`${i}{detection visible}`]).join('\n');
};
const STEALTH = T(`
{"alarm/calm"
  {condition
  }
  {actions
    {"delay"
      {time 0.1}
    }
    {"actor_state"
      {selector
        {tag @guards@}
        {type human}
      }
      {control AI}
      {fire_mode hold}
    }
  }
}
{"alarm/suspicious"
  {condition
    {terms
      {"1.cmp_i"
        {var "alarm_level$"}
        {op "=="}
        {value 0}
      }
      {"2.see_actors"
${seeTerm(8, 'guards_2', 'player', 'sight')}
      }
    }
  }
  {actions
    {"set_i"
      {var "alarm_level$"}
      {op "="}
      {value 1}
    }
    {"actor_recon"
      {selector
        {tag @guards_3@}
        {zone "@camp_inner@"}
        {type human}
        {state "not dead"}
      }
      {drop orders}
      {radius 100}
    }
    {"delay"
      {time @look@}
    }
    {"if"
      {condition
        {type see_actors}
${seeTerm(8, 'guards_4', 'player_2')}
      }
      {"event"
        {event "alarm_raised"}
        {mode set}
      }
    }
    {"event"
      {event "alarm_calm"}
      {mode set}
      {delay @calm_short@}
    }
  }
}
{"alarm/shots"
  {condition
    {terms
      {"1.signal"
        {zone "@camp@"}
        {signals "shot hit explosion"}
      }
    }
  }
  {actions
    {"event"
      {event "alarm_raised"}
      {mode set}
    }
  }
}
{"alarm/alarm"
  {condition
    {expression "1 & !2"}
    {terms
      {"1.event"
        {id "alarm_raised"}
      }
      {"2.event"
        {id "alarm_lock"}
      }
    }
  }
  {actions
    {"event"
      {event "alarm_lock"}
      {mode set}
    }
    {"set_i"
      {var "alarm_level$"}
      {op "="}
      {value 2}
    }
    {"sound"
      {name "@siren@"}
    }
    {"actor_state"
      {selector
        {tag @guards_5@}
        {type human}
      }
      {fire_mode open}
      {ai_move
        {mode enable}
      }
    }
    {"entity_state"
      {selector
        {tag @reserve@}
      }
      {tag_remove hidden}
      {inactive off}
    }
    {"actor_recon"
      {selector
        {tag @reserve_2@}
        {type human}
        {state "not dead"}
      }
      {drop orders}
      {radius 250}
    }
    {"event"
      {event "alarm_calm"}
      {mode set}
      {delay @calm@}
    }
  }
}
{"alarm/calm_down"
  {condition
    {terms
      {"1.event"
        {id "alarm_calm"}
      }
    }
  }
  {actions
    {"event"
      {event "alarm_calm"}
      {mode reset}
    }
    {"switch"
      {"case"
        {condition
          {type see_actors}
${seeTerm(10, 'guards_6', 'player_3')}
        }
        {"event"
          {event "alarm_calm"}
          {mode set}
          {delay 30}
        }
      }
      {"default"
        {"set_i"
          {var "alarm_level$"}
          {op "="}
          {value 0}
        }
        {"event"
          {event "alarm_raised"}
          {mode reset}
        }
        {"event"
          {event "alarm_lock"}
          {mode reset}
        }
        {"actor_state"
          {selector
            {tag @guards_7@}
            {type human}
          }
          {fire_mode hold}
        }
        {"trigger"
          {name "alarm/suspicious"}
        }
        {"trigger"
          {name "alarm/shots"}
        }
        {"trigger"
          {name "alarm/alarm"}
        }
      }
    }
    {"trigger"
      {name "alarm/calm_down"}
    }
  }
}
`);

// 639 E04: start points, income per held flag, infantry and tank cards bring pool clones, a placed bonus
const REINF = T(`
{"reinf/open"
  {condition
  }
  {actions
    {"reinforcement"
      {operation score_add}
      {score @start_score@}
    }
    {"reinforcement"
      {operation show}
      {name "reinf_card_inf"}
    }
    {"reinforcement"
      {operation show}
      {name "reinf_card_tank"}
    }
    {"reinforcement"
      {operation show}
      {name "reinf_card_bonus"}
    }
  }
}
{"reinf/income"
  {condition
    {terms
      {"1.entities"
        {selector
          {tag captured}
          {zone "@flag@"}
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
      {score @income@}
    }
    {"delay"
      {time @every@}
    }
    {"trigger"
      {name "reinf/income"}
    }
  }
}
{"reinf/inf_arrives"
  {condition
    {terms
      {"1.event"
        {id "reinf_buy_inf"}
      }
    }
  }
  {actions
    {"event"
      {event "reinf_buy_inf"}
      {mode reset}
    }
    {"loop" @inf_count@
      {"delay"
        {time 0.1}
      }
      {"waypoint"
        {who
          {type actor}
          {actors
            {amount 1}
            {tag @pool_inf@}
          }
        }
        {action
          {type start}
          {waypoint "@entry_wp@"}
          {clone}
          {approach "safe teleport & rotate"}
        }
      }
    }
    {"sound"
      {name "mission/task_new"}
    }
    {"trigger"
      {name "reinf/inf_arrives"}
    }
  }
}
{"reinf/tank_arrives"
  {condition
    {terms
      {"1.event"
        {id "reinf_buy_tank"}
      }
    }
  }
  {actions
    {"event"
      {event "reinf_buy_tank"}
      {mode reset}
    }
    {"waypoint"
      {who
        {type actor}
        {actors
          {amount 1}
          {tag @pool_tank@}
        }
      }
      {action
        {type start}
        {waypoint "@entry_wp_2@"}
        {clone}
        {approach "safe teleport & rotate"}
      }
    }
    {"trigger"
      {name "reinf/tank_arrives"}
    }
  }
}
{"reinf/bonus"
  {condition
    {terms
      {"1.event"
        {id "reinf_buy_bonus"}
      }
    }
  }
  {actions
    {"event"
      {event "reinf_buy_bonus"}
      {mode reset}
    }
    {"delay"
      {time 0.1}
    }
    {"spawn"
      {entity "@bonus_entity@"}
      {waypoint "@bonus_wp@"}
    }
    {"trigger"
      {name "reinf/bonus"}
    }
  }
}
`);

const HG = 'map/single/01_usa-skirmish/00b_usa-hurtgen/0.mi';

module.exports = { group: 'mi-sys-1', pieces: [
  P({ id: 'mi.sys.three_stage_objective_chain_take_des', no: 636, code: CHAIN,
    f: { enemy: tag('my_village_enemy'), village: txt('my_village'), player: tag('my_player_units'),
      village_2: txt('my_village'), battery: tag('my_gun_battery'), hold: sec('300'), hold_2: sec('300'),
      player_2: tag('my_player_units') },
    src: HG + ':20895-20967' }),

  P({ id: 'mi.sys.wave_defence_mission_core', no: 637, code: WAVES,
    f: { waves: num('5', 1), warmup: sec('60'), warmup_2: sec('60'), gap: sec('120'), gap_2: sec('120'),
      inf_count: num('6', 1), pool_inf: tag('my_pool_inf'), spawn_wp: txt('my_spawn_wp'),
      mg_count: num('8', 1), pool_mg: tag('my_pool_mg'), spawn_wp_2: txt('my_spawn_wp'),
      tank_count: num('2', 1), pool_tank: tag('my_pool_tank'), spawn_wp_3: txt('my_spawn_wp'),
      spawn_zone: txt('my_spawn_zone'), enemy_player: num('1', 0), base_wp: txt('my_base_wp'),
      base_wp_2: txt('my_base_wp'), bonus: num('300', 0), player: tag('my_player_units'), base: txt('my_base') },
    src: 'map/single/03_eng-skirmish/01b_eng-elalamein/0.mi:22204' }),

  P({ id: 'mi.sys.stealth_and_alarm_system', no: 638, code: STEALTH,
    f: { guards: tag('my_guards'), guards_2: tag('my_guards'), player: tag('my_player_units'),
      sight: num('40', 1), guards_3: tag('my_guards'), camp_inner: txt('my_camp_inner'), look: sec('15'),
      guards_4: tag('my_guards'), player_2: tag('my_player_units'), calm_short: sec('60'), camp: txt('my_camp'),
      siren: { k: 'sound', def: 'my_siren_sound' }, guards_5: tag('my_guards'), reserve: tag('my_camp_reserve'),
      reserve_2: tag('my_camp_reserve'), calm: sec('90'), guards_6: tag('my_guards'),
      player_3: tag('my_player_units'), guards_7: tag('my_guards') },
    src: 'map/single/04_rus-skirmish/02b_rus-sevastopol/0.mi:18682' }),

  P({ id: 'mi.sys.reinforcement_manager_income_three_c', no: 639, code: REINF,
    f: { start_score: num('400', 0), flag: txt('my_flag'), income: num('50', 0), every: sec('30'),
      inf_count: num('6', 1), pool_inf: tag('my_pool_inf_p'), entry_wp: txt('my_entry_wp'),
      pool_tank: tag('my_pool_tank_p'), entry_wp_2: txt('my_entry_wp'),
      bonus_entity: { k: 'entity', def: 'my_bonus_entity' }, bonus_wp: txt('my_bonus_wp') },
    src: 'map/single/01_usa-skirmish/01_usa-overlord/0.mi reinforcements; ' }),
] };

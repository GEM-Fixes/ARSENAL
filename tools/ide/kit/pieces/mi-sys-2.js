// Code Pieces, group mi-sys-2: large ready systems for mission files (.mi), numbers 640 to 643 of
// (intro cutscene, convoy escort, king of the hill, a whole small mission).
// Format: tools/ide/README.md "tools/ide/kit"; contract:; source list:
// (E05-E08). Checked against the vanilla missions in map.pak
// (hurtgen, elalamein, tutorial). 640-642 are one block for the inside of {Helpers}: its events, zones, tasks,
// cameras, vars, triggers and waypoints sets; reads each set
// block as it comes, so they can sit next to the sets the file already has. 643 is a whole .mi file.
// Internal names (events, vars, triggers, tasks, waypoints) are literal, as in mi-start-1: they repeat many
// times; unit tags the map must carry are listed in each piece's .n text.
// Author: Imperator_Aug (ARSENAL, ia-a36b734c)
'use strict';

// code is written with two-space indents below and turned into tabs here (String.raw keeps the backslashes)
const T = s => s.replace(/^\n/, '').replace(/^((?: {2})+)/gm, m => '\t'.repeat(m.length / 2));
const base = { kinds: ['mi'], role: 'block', scope: ['in:helpers'], needs: [], short: false, adv: false, wrap: false,
  task: null, since: '2026-11', size: 'large', mp: 'no' };
const P = o => Object.assign({}, base, o);

const INTRO = T(String.raw`
; ---- intro cutscene, then hand over: events
{event "intro_done"}
{event "start"}
; ---- camera path of the intro (3 keys)
{cameras
  {"intro_cam"
    {"key000"
      {position @cam1_pos@}
      {look_at @cam1_look@}
      {fov 65}
    }
    {"key001"
      {time @cam2_time@}
      {position @cam2_pos@}
      {look_at @cam2_look@}
      {fov 65}
    }
    {"key002"
      {time @cam3_time@}
      {position @cam3_pos@}
      {look_at @cam3_look@}
      {fov 60}
    }
  }
}
{triggers
  {"intro/play"
    {condition
    }
    {actions
      {"delay"
        {time 0.01}
      }
      {"fade"
        {time 3}
        {color 0xff000000}
      }
      {"music"
        {start "@intro_music@"}
        {stop_all}
        {volume game}
        {fade 3}
      }
      {"scenario"
        {message
          {text ""}
        }
        {camera
          {name "intro_cam"}
          {disable_cancel}
          {smooth_begin 0}
          {smooth_end 0}
        }
        {event_on_next "intro_done"}
      }
      {"delay"
        {time 1}
      }
      {"talk"
        {selector
          {tag @speaker1@}
        }
        {text "$/@line1@"}
      }
      {"delay"
        {time @gap@}
      }
      {"talk"
        {selector
          {tag @speaker2@}
        }
        {text "$/@line2@"}
      }
      {"delay"
        {time @gap_2@}
      }
      {"talk"
        {selector
          {tag @speaker1_2@}
        }
        {text "$/@line3@"}
      }
    }
  }
  {"intro/hand_over"
    {condition
      {terms
        {"1.event"
          {id "intro_done"}
        }
      }
    }
    {actions
      {"autoassign"
        {selector
          {tag player_start}
          {zone "@gamezone@"}
        }
      }
      {"actor_state"
        {selector
          {tag player_start}
        }
        {control user}
        {move_mode hold}
        {weapon_prepare on}
      }
      {"event"
        {event "start"}
        {mode set}
        {delay 0}
      }
      {"music"
        {start "@game_music@"}
        {stop_all}
        {volume game}
        {fade 5}
        {loop}
      }
      {"delay"
        {time 2}
      }
      {"autosave"}
    }
  }
}`);

const CONVOY = T(String.raw`
; ---- convoy escort: events
{event "convoy_go"}
{event "convoy_leg1"}
{event "convoy_leg2"}
{event "convoy_half"}
{event "convoy_wait"}
{event "convoy_over"}
; ---- the depot the trucks must reach
{zone "circle"
  {position @depot_pos@}
  {Name "convoy_depot"}
  {Radius @depot_radius@}
}
{tasks
  {"convoy_task"
    {desc "$/@task_text@"}
    {primary}
    {state hidden}
  }
}
; ---- the route: each point orders the trucks on to the next one
{waypoints "convoy_route"
  {"convoy_r1"
    {position @r1_pos@}
    {radius 40}
    {commands
      {"event"
        {event "convoy_leg1"}
        {mode set}
        {delay 0}
      }
      {"actor_to_waypoint"
        {waypoint "convoy_r2"}
      }
    }
  }
  {"convoy_r2"
    {position @r2_pos@}
    {radius 40}
    {commands
      {"event"
        {event "convoy_leg2"}
        {mode set}
        {delay 0}
      }
      {"actor_to_waypoint"
        {waypoint "convoy_r3"}
      }
    }
  }
  {"convoy_r3"
    {position @r3_pos@}
    {radius 40}
    {commands
      {"event"
        {event "convoy_half"}
        {mode set}
        {delay 0}
      }
      {"actor_to_waypoint"
        {waypoint "convoy_r4"}
      }
    }
  }
  {"convoy_r4"
    {position @depot_pos_2@}
    {radius 60}
    {commands
      {"actor_state"
        {move_mode hold}
      }
    }
  }
}
{triggers
  {"convoy/go"
    {condition
      {terms
        {"1.event"
          {id "convoy_go"}
        }
      }
    }
    {actions
      {"task"
        {name "convoy_task"}
      }
      {"sound"
        {name "mission/task_new"}
      }
      {"actor_state"
        {selector
          {tag convoy_truck}
          {type vehicle}
        }
        {movement
          {speed slow}
        }
      }
      {"actor_to_waypoint"
        {selector
          {tag convoy_truck}
          {type vehicle}
        }
        {drop orders}
        {waypoint "convoy_r1"}
      }
    }
  }
  {"convoy/ambush"
    {condition
      {terms
        {"1.event"
          {id "convoy_half"}
        }
      }
    }
    {actions
      {"entity_state"
        {selector
          {tag @ambush@}
        }
        {tag_remove hidden}
        {inactive off}
      }
      {"actor_state"
        {selector
          {tag @ambush_2@}
          {type human}
        }
        {fire_mode open}
      }
    }
  }
  {"convoy/arrived"
    {condition
      {expression "1 & !2"}
      {terms
        {"1.entities"
          {selector
            {tag convoy_truck}
            {zone "convoy_depot"}
            {type vehicle}
            {state inhabited}
          }
          {count
            {op ">="}
            {value @need@}
          }
        }
        {"2.event"
          {id "convoy_over"}
        }
      }
    }
    {actions
      {"event"
        {event "convoy_over"}
        {mode set}
        {delay 0}
      }
      {"task"
        {name "convoy_task"}
        {state complete}
      }
      {"sound"
        {name "mission/task_fulfilled"}
      }
    }
  }
  {"convoy/lost"
    {condition
      {expression "1 & 2 & !3"}
      {terms
        {"1.event"
          {id "convoy_go"}
        }
        {"2.entities"
          {selector
            {tag convoy_truck}
            {type vehicle}
            {state inhabited}
          }
          {count
            {op "<<"}
            {value @need_2@}
          }
        }
        {"3.event"
          {id "convoy_over"}
        }
      }
    }
    {actions
      {"event"
        {event "convoy_over"}
        {mode set}
        {delay 0}
      }
      {"task"
        {name "convoy_task"}
        {state fail}
      }
      {"sound"
        {name "mission/task_failed"}
      }
    }
  }
  {"convoy/wait"
    {autoreset}
    {condition
      {expression "1 & !2 & !3"}
      {terms
        {"1.event"
          {id "convoy_go"}
        }
        {"2.near"
          {units
            {tag @escort@}
            {type human}
            {state "not dead"}
          }
          {near_to
            {tag convoy_truck}
          }
          {distance @distance@}
        }
        {"3.event"
          {id "convoy_over"}
        }
      }
    }
    {actions
      {"event"
        {event "convoy_wait"}
        {mode set}
        {delay 0}
      }
      {"actor_state"
        {selector
          {tag convoy_truck}
          {type vehicle}
        }
        {drop orders}
        {move_mode hold}
      }
      {"con"
        {text "CONVOY waits for the escort"}
      }
    }
  }
  {"convoy/go_on"
    {autoreset}
    {condition
      {expression "1 & 2 & 3 & !4"}
      {terms
        {"1.event"
          {id "convoy_wait"}
        }
        {"2.near"
          {units
            {tag @escort_2@}
            {type human}
            {state "not dead"}
          }
          {near_to
            {tag convoy_truck}
          }
          {distance @distance_2@}
        }
        {"3.event"
          {id "convoy_go"}
        }
        {"4.event"
          {id "convoy_over"}
        }
      }
    }
    {actions
      {"event"
        {event "convoy_wait"}
        {mode reset}
        {delay 0}
      }
      {"actor_to_waypoint"
        {selector
          {tag convoy_truck}
          {type vehicle}
        }
        {drop orders}
        {waypoint "convoy_r1"}
      }
      {"if"
        {condition
          {type event}
          {id "convoy_leg1"}
        }
        {"actor_to_waypoint"
          {selector
            {tag convoy_truck}
            {type vehicle}
          }
          {drop orders}
          {waypoint "convoy_r2"}
        }
      }
      {"if"
        {condition
          {type event}
          {id "convoy_leg2"}
        }
        {"actor_to_waypoint"
          {selector
            {tag convoy_truck}
            {type vehicle}
          }
          {drop orders}
          {waypoint "convoy_r3"}
        }
      }
      {"if"
        {condition
          {type event}
          {id "convoy_half"}
        }
        {"actor_to_waypoint"
          {selector
            {tag convoy_truck}
            {type vehicle}
          }
          {drop orders}
          {waypoint "convoy_r4"}
        }
      }
      {"con"
        {text "CONVOY goes on"}
      }
    }
  }
}`);

const HILL = T(String.raw`
; ---- king of the hill: events and the score var
{event "hill_on"}
{event "hill_over"}
{vars
  {"hill_time"}
}
{zone "circle"
  {position @hill_pos@}
  {Name "hill"}
  {Radius @hill_radius@}
}
{tasks
  {"hill_task"
    {desc "$/@task_text@"}
    {primary}
    {state hidden}
  }
}
; ---- where the counter-attack goes
{waypoints "hill"
  {"hill_wp"
    {position @hill_pos_2@}
    {radius 100}
  }
}
{triggers
  {"hill/show"
    {condition
    }
    {actions
      {"delay"
        {time 2}
      }
      {"task"
        {name "hill_task"}
      }
      {"sound"
        {name "mission/task_new"}
      }
      {"objective_progress"
        {set 0}
        {add 0}
        {title "$/@progress_text@"}
      }
      {"event"
        {event "hill_on"}
        {mode set}
        {delay 0}
      }
    }
  }
  {"hill/tick"
    {condition
      {expression "1 & 2 & 3 & !4"}
      {terms
        {"1.event"
          {id "hill_on"}
        }
        {"2.entities"
          {selector
            {tag @player@}
            {zone "hill"}
            {type human}
            {state "not dead"}
          }
        }
        {"3.entities"
          {selector
            {tag hill_enemy}
            {zone "hill"}
            {type human}
            {state "not dead"}
          }
          {count
            {op "=="}
            {value 0}
          }
        }
        {"4.event"
          {id "hill_over"}
        }
      }
    }
    {actions
      {"set_i"
        {var "hill_time$"}
        {op "+"}
        {value 1}
      }
      {"objective_progress"
        {add 1}
        {title "$/@progress_text_2@"}
      }
      {"delay"
        {time 1}
      }
      {"trigger"
        {name "hill/tick"}
      }
    }
  }
  {"hill/counter"
    {condition
      {expression "1 & !2"}
      {terms
        {"1.event"
          {id "hill_on"}
        }
        {"2.event"
          {id "hill_over"}
        }
      }
    }
    {actions
      {"delay"
        {time @spacing@}
      }
      {"entity_state"
        {selector
          {tag hill_reserve}
        }
        {tag_remove hidden}
        {inactive off}
        {tag_add hill_enemy}
      }
      {"actor_to_waypoint"
        {selector
          {tag hill_reserve}
          {type human}
        }
        {drop orders}
        {waypoint "hill_wp"}
      }
      {"actor_to_waypoint"
        {selector
          {tag hill_reserve}
          {type vehicle}
        }
        {drop orders}
        {waypoint "hill_wp"}
      }
      {"trigger"
        {name "hill/counter"}
      }
    }
  }
  {"hill/win"
    {condition
      {expression "1 & !2"}
      {terms
        {"1.cmp_i"
          {var "hill_time$"}
          {op ">="}
          {value @points@}
        }
        {"2.event"
          {id "hill_over"}
        }
      }
    }
    {actions
      {"event"
        {event "hill_over"}
        {mode set}
        {delay 0}
      }
      {"task"
        {name "hill_task"}
        {state complete}
      }
      {"sound"
        {name "mission/task_fulfilled"}
      }
      {"objective_progress"
        {hide}
        {title "$/@progress_text_3@"}
      }
      {"music"
        {start "/music/skirmish_won.mp3"}
        {stop_all}
        {volume game}
      }
      {"delay"
        {time 5}
      }
      {"gameover"
        {result win}
        {message ""}
      }
    }
  }
  {"hill/lose"
    {condition
      {expression "1 & 2 & !3"}
      {terms
        {"1.event"
          {id "hill_on"}
        }
        {"2.entities"
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
        {"3.event"
          {id "hill_over"}
        }
      }
    }
    {actions
      {"event"
        {event "hill_over"}
        {mode set}
        {delay 0}
      }
      {"music"
        {start "/music/skirmish_lost.mp3"}
        {stop_all}
        {volume game}
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
}`);

// 643: a whole small mission, Helpers in hurtgen order (events, zones, tasks, cameras, vars, triggers,
// waypoints; hurtgen 0.mi:12117-33343), the Players block of tools/spmis (mi.file.sp, played to both ends).
// Parts: E05 intro and hand-over, B70 difficulty, E01 stage 1 (take the village), E02 waves as stage 2,
// B68 music, B79 autosaves, B76 con marks, B78 debug jump (disabled), B74 exit point.
const WHOLE_MI = T(String.raw`
{mission
  ; ---- place the units in the mission editor; it writes them above this line. Tags the triggers read:
  ; ---- player_start (player units), village_enemy, pool_inf / pool_mg / pool_tank (hidden wave pools),
  ; ---- hard_only, heroic_extra (optional), officer_talk and radio_talk (the two speakers of the intro)
  {Environment "@environment@"}
  {Helpers
    {event "start"}
    {event "intro_done"}
    {event "obj1_done"}
    {event "obj2_done"}
    {event "waves_on"}
    {event "wave_go"}
    {event "over"}
    {zone "poly"
      {position 0 0 0}
      {Name "gamezone"}
      {Point @corner1@}
      {Point @corner2@}
      {Point @corner3@}
      {Point @corner4@}
    }
    {zone "circle"
      {position @village_pos@}
      {Name "village"}
      {Radius @village_radius@}
    }
    {zone "circle"
      {position @village_pos_2@}
      {Name "base"}
      {Radius @base_radius@}
    }
    {zone "circle"
      {position @spawn_pos@}
      {Name "spawn_zone"}
      {Radius 300}
    }
    {tasks
      {"obj1"
        {desc "$/@obj1_text@"}
        {primary}
        {state hidden}
      }
      {"obj2"
        {desc "$/@obj2_text@"}
        {primary}
        {state hidden}
      }
    }
    {cameras
      {"intro_cam"
        {"key000"
          {position @cam1_pos@}
          {look_at @cam1_look@}
          {fov 65}
        }
        {"key001"
          {time 6}
          {position @cam2_pos@}
          {look_at @cam2_look@}
          {fov 65}
        }
        {"key002"
          {time 6}
          {position @cam3_pos@}
          {look_at @cam3_look@}
          {fov 60}
        }
      }
    }
    {vars
      {"stage"}
      {"wave"}
    }
    {triggers
      {"intro/play"
        {condition
        }
        {actions
          {"delay"
            {time 0.01}
          }
          {"fade"
            {time 3}
            {color 0xff000000}
          }
          {"music"
            {start "/music/skirmish_progress.mp3"}
            {stop_all}
            {volume game}
            {fade 3}
          }
          {"scenario"
            {message
              {text ""}
            }
            {camera
              {name "intro_cam"}
              {disable_cancel}
              {smooth_begin 0}
              {smooth_end 0}
            }
            {event_on_next "intro_done"}
          }
          {"delay"
            {time 1}
          }
          {"talk"
            {selector
              {tag officer_talk}
            }
            {text "$/@line1@"}
          }
          {"delay"
            {time 4}
          }
          {"talk"
            {selector
              {tag radio_talk}
            }
            {text "$/@line2@"}
          }
          {"delay"
            {time 4}
          }
          {"talk"
            {selector
              {tag officer_talk}
            }
            {text "$/@line3@"}
          }
        }
      }
      {"intro/hand_over"
        {condition
          {terms
            {"1.event"
              {id "intro_done"}
            }
          }
        }
        {actions
          {"autoassign"
            {selector
              {tag player_start}
              {zone "gamezone"}
            }
          }
          {"actor_state"
            {selector
              {tag player_start}
            }
            {control user}
            {move_mode hold}
            {weapon_prepare on}
          }
          {"event"
            {event "start"}
            {mode set}
            {delay 0}
          }
          {"music"
            {start "/music/skirmish_background_01.mp3"}
            {stop_all}
            {volume game}
            {fade 5}
            {loop}
          }
          {"con"
            {text "MARK start"}
          }
        }
      }
      {"difficulty"
        {condition
          {terms
            {"1.event"
              {id "start"}
            }
          }
        }
        {actions
          {"if"
            {condition
              {type difficulty}
              {level easy}
            }
            {"delete"
              {selector
                {tag hard_only}
              }
            }
          }
          {"if"
            {condition
              {type difficulty}
              {level heroic}
            }
            {"entity_state"
              {selector
                {tag heroic_extra}
              }
              {tag_remove hidden}
              {inactive off}
            }
          }
        }
      }
      {"stage1/show"
        {condition
          {terms
            {"1.event"
              {id "start"}
            }
          }
        }
        {actions
          {"delay"
            {time 3}
          }
          {"task"
            {name "obj1"}
          }
          {"sound"
            {name "mission/task_new"}
          }
          {"set_i"
            {var "stage$"}
            {op "="}
            {value 1}
          }
          {"con"
            {text "MARK stage 1"}
          }
        }
      }
      {"stage1/done"
        {condition
          {expression "1 & 2 & 3 & !4"}
          {terms
            {"1.cmp_i"
              {var "stage$"}
              {op "=="}
              {value 1}
            }
            {"2.entities"
              {selector
                {tag village_enemy}
                {zone "village"}
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
                {tag player_start}
                {zone "village"}
                {type human}
                {state "not dead"}
              }
            }
            {"4.event"
              {id "over"}
            }
          }
        }
        {actions
          {"task"
            {name "obj1"}
            {state complete}
          }
          {"sound"
            {name "mission/task_fulfilled"}
          }
          {"set_i"
            {var "stage$"}
            {op "="}
            {value 2}
          }
          {"event"
            {event "obj1_done"}
            {mode set}
            {delay 0}
          }
          {"con"
            {text "MARK stage 1 done"}
          }
          {"delay"
            {time 2}
          }
          {"autosave"}
        }
      }
      {"stage2/show"
        {condition
          {expression "1 & !2"}
          {terms
            {"1.event"
              {id "obj1_done"}
            }
            {"2.event"
              {id "over"}
            }
          }
        }
        {actions
          {"delay"
            {time 4}
          }
          {"task"
            {name "obj2"}
          }
          {"sound"
            {name "mission/task_new"}
          }
          {"timer"
            {time @first_wait@}
            {title "$/@timer_text@"}
          }
          {"con"
            {text "MARK stage 2"}
          }
          {"delay"
            {time @first_wait_2@}
          }
          {"event"
            {event "waves_on"}
            {mode set}
            {delay 0}
          }
        }
      }
      {"waves/clock"
        {condition
          {expression "1 & !2 & 3"}
          {terms
            {"1.event"
              {id "waves_on"}
            }
            {"2.event"
              {id "over"}
            }
            {"3.cmp_i"
              {var "wave$"}
              {op "<<"}
              {value @waves@}
            }
          }
        }
        {actions
          {"set_i"
            {var "wave$"}
            {op "+"}
            {value 1}
          }
          {"event"
            {event "wave_go"}
            {mode set}
            {delay 0}
          }
          {"timer"
            {time @spacing@}
            {title "$/@timer_text_2@"}
          }
          {"delay"
            {time @spacing_2@}
          }
          {"trigger"
            {name "waves/clock"}
          }
        }
      }
      {"waves/build"
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
            {delay 0}
          }
          {"if"
            {condition
              {type cmp_i}
              {var "wave$"}
              {op "<<="}
              {value 2}
            }
            {"loop" 6
              {"delay"
                {time 0.1}
              }
              {"waypoint"
                {who
                  {type actor}
                  {actors
                    {amount 1
                    }
                    {tag pool_inf}
                  }
                }
                {action
                  {type start}
                  {waypoint "spawn_wp"}
                  {clone}
                  {approach "safe teleport & rotate"}
                }
              }
            }
          }
          {"if"
            {condition
              {type cmp_i}
              {var "wave$"}
              {op ">="}
              {value 3}
            }
            {"loop" 8
              {"delay"
                {time 0.1}
              }
              {"waypoint"
                {who
                  {type actor}
                  {actors
                    {amount 1
                    }
                    {tag pool_mg}
                  }
                }
                {action
                  {type start}
                  {waypoint "spawn_wp"}
                  {clone}
                  {approach "safe teleport & rotate"}
                }
              }
            }
          }
          {"if"
            {condition
              {type cmp_i}
              {var "wave$"}
              {op ">="}
              {value @waves_2@}
            }
            {"loop" 2
              {"delay"
                {time 0.1}
              }
              {"waypoint"
                {who
                  {type actor}
                  {actors
                    {amount 1
                    }
                    {tag pool_tank}
                  }
                }
                {action
                  {type start}
                  {waypoint "spawn_wp"}
                  {clone}
                  {approach "safe teleport & rotate"}
                }
              }
            }
          }
          {"delay"
            {time 1}
          }
          {"entity_state"
            {selector
              {zone "spawn_zone"}
              {player "1"}
            }
            {tag_add wave_units}
          }
          {"actor_to_waypoint"
            {selector
              {tag wave_units}
              {type human}
            }
            {drop orders}
            {waypoint "base_wp"}
          }
          {"actor_to_waypoint"
            {selector
              {tag wave_units}
              {type vehicle}
            }
            {drop orders}
            {waypoint "base_wp"}
          }
          {"if"
            {condition
              {type cmp_i}
              {var "wave$"}
              {op ">="}
              {value @waves_3@}
            }
            {"event"
              {event "obj2_done"}
              {mode set}
              {delay 0}
            }
          }
          {"con"
            {text "MARK wave sent"}
          }
          {"trigger"
            {name "waves/build"}
          }
        }
      }
      {"waves/survived"
        {condition
          {expression "1 & 2 & !3"}
          {terms
            {"1.event"
              {id "obj2_done"}
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
              {id "over"}
            }
          }
        }
        {actions
          {"event"
            {event "over"}
            {mode set}
            {delay 0}
          }
          {"timer"
            {hide}
            {title "$/@timer_text_3@"}
          }
          {"task"
            {name "obj2"}
            {state complete}
          }
          {"sound"
            {name "mission/task_fulfilled"}
          }
          {"music"
            {start "/music/skirmish_won.mp3"}
            {stop_all}
            {volume game}
          }
          {"con"
            {text "MARK won"}
          }
          {"delay"
            {time 5}
          }
          {"gameover"
            {result win}
            {message ""}
          }
        }
      }
      {"lost/all_dead"
        {condition
          {expression "1 & 2 & !3"}
          {terms
            {"1.event"
              {id "start"}
            }
            {"2.entities"
              {selector
                {tag player_start}
                {type human}
                {state "not dead"}
              }
              {count
                {op "=="}
                {value 0}
              }
            }
            {"3.event"
              {id "over"}
            }
          }
        }
        {actions
LOSE_ACTIONS
        }
      }
      {"lost/base"
        {condition
          {expression "1 & 2 & !3"}
          {terms
            {"1.event"
              {id "waves_on"}
            }
            {"2.entities"
              {selector
                {tag player_start}
                {zone "base"}
                {type human}
                {state "not dead"}
              }
              {count
                {op "=="}
                {value 0}
              }
            }
            {"3.event"
              {id "over"}
            }
          }
        }
        {actions
LOSE_ACTIONS
        }
      }
      {"debug/jump_to_stage2"
        {disabled}
        {condition
        }
        {actions
          {"set_i"
            {var "stage$"}
            {op "="}
            {value 2}
          }
          {"event"
            {event "obj1_done"}
            {mode set}
            {delay 0}
          }
          {"con"
            {text "DEBUG jumped to stage 2"}
          }
        }
      }
    }
    {waypoints "waves"
      {"spawn_wp"
        {position @spawn_pos_2@}
        {radius 60}
      }
      {"base_wp"
        {position @village_pos_3@}
        {radius 120}
      }
      {"exit_wp"
        {position @exit_pos@}
        {radius 60}
        {commands
          {"delete"}
        }
      }
    }
  }
  {Players
    {user 0}
    {alias 0 "player"}
    {alias 1 "enemy"}
    {alias 2 "allied"}
    {alias 3 "neutral"}
    {diplomacy
      1 1 2 0 1 1 1 1
      1 1 1 0 1 1 1 1
      2 1 1 0 1 1 1 1
      0 0 0 1 1 1 1 1
      1 1 1 1 1 1 1 1
      1 1 1 1 1 1 1 1
      1 1 1 1 1 1 1 1
      1 1 1 1 1 1 1 1
    }
  }
  {Fog 1}
  {EntityManager {Enabled}}
}`).split('LOSE_ACTIONS').join(T(String.raw`
          {"event"
            {event "over"}
            {mode set}
            {delay 0}
          }
          {"if"
            {condition
              {type cmp_i}
              {var "stage$"}
              {op "=="}
              {value 1}
            }
            {"task"
              {name "obj1"}
              {state fail}
            }
          }
          {"if"
            {condition
              {type cmp_i}
              {var "stage$"}
              {op "=="}
              {value 2}
            }
            {"task"
              {name "obj2"}
              {state fail}
            }
          }
          {"sound"
            {name "mission/task_failed"}
          }
          {"music"
            {start "/music/skirmish_lost.mp3"}
            {stop_all}
            {volume game}
          }
          {"con"
            {text "MARK lost"}
          }
          {"delay"
            {time 5}
          }
          {"gameover"
            {result loose}
            {message ""}
          }`));

const pos = d => ({ k: 'text', def: d });
const sec = (d, min) => ({ k: 'seconds', def: d, min: min || 0 });
const num = (d, min) => ({ k: 'number', def: d, min: min, int: true });
const tag = d => ({ k: 'tag', def: d });
const txt = d => ({ k: 'text', def: d });

module.exports = { group: 'mi-sys-2', pieces: [
  P({ id: 'mi.sys.intro_cutscene_with_dialogue_then_ha', no: 640, sec: 'mi.sys', tag: 'I',
    code: INTRO,
    f: {
      cam1_pos: pos('-1968 5887 213'), cam1_look: pos('-2201 5715 0'),
      cam2_time: sec('6', 0.1), cam2_pos: pos('-2241 6258 535'), cam2_look: pos('-2245 5733 0'),
      cam3_time: sec('6', 0.1), cam3_pos: pos('-2400 6400 300'), cam3_look: pos('-2245 5733 0'),
      intro_music: { k: 'path', def: '/music/skirmish_progress.mp3' },
      speaker1: tag('officer_talk'), line1: txt('intro_1'), gap: sec('4'),
      speaker2: tag('radio_talk'), line2: txt('intro_2'), gap_2: sec('4'),
      speaker1_2: tag('officer_talk'), line3: txt('intro_3'),
      gamezone: txt('gamezone'),
      game_music: { k: 'path', def: '/music/skirmish_background_01.mp3' }
    },
    lim: ['MIS-41'],
    src: 'map/single/06_bonus/00_tutorial/skirmish_script(tutorial).mi:15251-15275' }),
  P({ id: 'mi.sys.convoy_escort', no: 641, sec: 'mi.sys', tag: 'I',
    code: CONVOY,
    f: {
      depot_pos: pos('4000 0 0'), depot_radius: { k: 'units', def: '150', min: 1 },
      task_text: txt('convoy_task'),
      r1_pos: pos('0 0 0'), r2_pos: pos('1000 0 0'), r3_pos: pos('2000 0 0'), depot_pos_2: pos('4000 0 0'),
      ambush: tag('convoy_ambush'), ambush_2: tag('convoy_ambush'),
      need: num('2', 1), need_2: num('2', 1),
      escort: tag('player'), distance: { k: 'units', def: '60', min: 1 },
      escort_2: tag('player'), distance_2: { k: 'units', def: '60', min: 1 }
    },
    lim: ['MIS-42', 'MIS-43', 'MIS-52'],
    src: 'map/single/03_eng-skirmish/01b_eng-elalamein/0.mi:22795' }),
  P({ id: 'mi.sys.king_of_the_hill_single_player', no: 642, sec: 'mi.sys', tag: 'I',
    code: HILL,
    f: {
      hill_pos: pos('0 0 0'), hill_radius: { k: 'units', def: '200', min: 1 },
      task_text: txt('hill_task'), hill_pos_2: pos('0 0 0'),
      progress_text: txt('hill_progress'), progress_text_2: txt('hill_progress'), progress_text_3: txt('hill_progress'),
      player: tag('player'), player_2: tag('player'),
      spacing: sec('90', 5), points: num('120', 1)
    },
    lim: [],
    src: 'map/single/01_usa-skirmish/00b_usa-hurtgen/0.mi:16143' }),
  P({ id: 'mi.sys.whole_small_mission_core_outline', no: 643, sec: 'mi.sys', tag: 'I',
    whole: true, scope: ['empty'], role: 'data',
    code: WHOLE_MI,
    f: {
      environment: txt('skirmish/usa-omaha'),
      corner1: pos('-3000 -3000'), corner2: pos('-3000 3000'), corner3: pos('3000 3000'), corner4: pos('3000 -3000'),
      village_pos: pos('0 0 0'), village_radius: { k: 'units', def: '300', min: 1 },
      village_pos_2: pos('0 0 0'), base_radius: { k: 'units', def: '250', min: 1 },
      spawn_pos: pos('2000 0 0'),
      obj1_text: txt('obj1'), obj2_text: txt('obj2'),
      cam1_pos: pos('-1968 5887 213'), cam1_look: pos('-2201 5715 0'),
      cam2_pos: pos('-2241 6258 535'), cam2_look: pos('-2245 5733 0'),
      cam3_pos: pos('-2400 6400 300'), cam3_look: pos('-2245 5733 0'),
      line1: txt('intro_1'), line2: txt('intro_2'), line3: txt('intro_3'),
      first_wait: sec('60', 1), first_wait_2: sec('60', 1), timer_text: txt('wave_timer'),
      waves: num('5', 1), spacing: sec('120', 10), timer_text_2: txt('wave_timer'), spacing_2: sec('120', 10),
      waves_2: num('5', 1), waves_3: num('5', 1), timer_text_3: txt('wave_timer'),
      spawn_pos_2: pos('2000 0 0'), village_pos_3: pos('0 0 0'), exit_pos: pos('2500 0 0')
    },
    lim: ['MIS-26', 'MIS-27', 'MIS-34', 'MIS-41', 'MIS-48'],
    src: 'map/single/01_usa-skirmish/00b_usa-hurtgen/0.mi:12117' })
] };

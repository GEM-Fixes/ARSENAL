// Code Pieces, group mi-pat-3: common mission patterns, numbers 563 to 589 of (kind mi:
// the mission .mi file). Contract: tools/ide/README.md "tools/ide/kit" and the round-2 brief; list
// Code checked against the vanilla missions in map.pak / map_dlc_*.pak
// (read with tools/lib/pak.js) and game/helper/*.cpp.
// Nesting of a game mission: {mission {Helpers {zone ...} {cameras ...} {vars ...} {triggers {"name" {condition
// {terms ...}} {actions ...}}} {waypoints "group" {"wp" {commands ...}}}}}. Scopes: a trigger goes in:triggers,
// a command in:actions or in:* (inside "if" / "case" / "default"), a waypoint command also in:commands,
// a Helpers block in:helpers, one waypoint in:waypoints, one term in:terms.
// Author: Imperator_Aug (ARSENAL, ia-ef640165)
'use strict';

// code is written with two-space indents below and turned into tabs here
const T = s => s.replace(/^\n/, '').replace(/\n$/, '').replace(/^((?: {2})+)/gm, m => '\t'.repeat(m.length / 2));
const BASE = { kinds: ['mi'], role: 'pattern', needs: [], lim: [], short: false, adv: false, wrap: false, task: null, since: '2026-11' };
const p = o => Object.assign({}, BASE, { f: {} }, o, o.tag === 'T' ? { adv: true } : {});
const CMD = ['in:actions', 'in:*'];
const WPCMD = ['in:actions', 'in:*', 'in:commands'];

module.exports = { group: 'mi-pat-3', pieces: [
  // 563 overlord:15824 "startview2"; played by a scenario {camera {name "startview2"}} (overlord:17834)
  p({ id: 'mi.pat.camera_path_keys', no: 563, sec: 'mi.pat.cutscenes', size: 'medium', tag: 'V', mp: 'no',
    scope: ['in:helpers'], src: 'overlord 0.mi:15824',
    code: T(`
{cameras
  {"@cam@"
    {"key000"
      {position @pos1@}
      {look_at @look1@}
      {fov @fov1@}
    }
    {"key001"
      {time @time@}
      {position @pos2@}
      {look_at @look2@}
      {fov @fov2@}
    }
  }
}@^@
`),
    f: { cam: { k: 'text', def: 'my_cam' }, pos1: { k: 'text', def: '0 0 300' }, look1: { k: 'text', def: '100 100 0' },
      fov1: { k: 'number', def: 65, min: 10, max: 120 }, time: { k: 'seconds', def: 6.5, min: 0 },
      pos2: { k: 'text', def: '200 200 500' }, look2: { k: 'text', def: '100 100 0' },
      fov2: { k: 'number', def: 65, min: 10, max: 120 } } }),

  // 564 elalamein:6611 {"fade" {on} ...} to black, tutorial:15258 {"fade" ...} without on back from black
  p({ id: 'mi.pat.fade_out_and_in', no: 564, sec: 'mi.pat.cutscenes', size: 'small', tag: 'V', mp: 'unknown',
    scope: CMD, src: 'elalamein 0.mi:6611',
    code: T(`
{"fade"
  {on}
  {time @out@}
  {color @color@}
}
{"delay"
  {time @wait@}
}
{"fade"
  {time @in@}
  {color @color_2@}
}@^@
`),
    f: { out: { k: 'seconds', def: 1, min: 0 }, color: { k: 'text', def: '0xff000000' }, wait: { k: 'seconds', def: 2, min: 0 },
      in: { k: 'seconds', def: 1, min: 0 }, color_2: { k: 'text', def: '0xff000000' } } }),

  // 565 hurtgen:31151 (waypoint "142" transition "143", "143" commands actor_to_waypoint); "wait" in waypoint commands dison:29469
  p({ id: 'mi.pat.patrol_along_waypoints', no: 565, sec: 'mi.pat.behaviour', size: 'medium', tag: 'I', mp: 'yes',
    scope: ['in:helpers'], src: 'hurtgen 0.mi:31151',
    code: T(`
{waypoints "@group@"
  {"@p1@"
    {position @pos1@}
    {radius @radius@}
    {commands
      {"wait"
        {time @wait@}
      }
      {"actor_to_waypoint"
        {waypoint "@p2@"}
      }
    }
  }
  {"@p2_2@"
    {position @pos2@}
    {radius @radius_2@}
    {commands
      {"wait"
        {time @wait_2@}
      }
      {"actor_to_waypoint"
        {waypoint "@p1_2@"}
      }
    }
  }
}@^@
`),
    f: { group: { k: 'text', def: 'my_patrol' }, p1: { k: 'text', def: 'my_p1' }, pos1: { k: 'text', def: '0 0 0' },
      radius: { k: 'units', def: 20, min: 0 }, wait: { k: 'seconds', def: 10, min: 0 }, p2: { k: 'text', def: 'my_p2' },
      p2_2: { k: 'text', def: 'my_p2' }, pos2: { k: 'text', def: '300 0 0' }, radius_2: { k: 'units', def: 20, min: 0 },
      wait_2: { k: 'seconds', def: 10, min: 0 }, p1_2: { k: 'text', def: 'my_p1' } } }),

  // 566 hurtgen:12963-12970 (control AI, fire_mode, ai_move {mode disable} {enable_on injure})
  p({ id: 'mi.pat.ambush_that_wakes_when_hit', no: 566, sec: 'mi.pat.behaviour', size: 'small', tag: 'V', mp: 'yes',
    scope: WPCMD, src: 'hurtgen 0.mi:12969',
    code: T(`
{"actor_state"
  {selector
    {tag @ambush@}
    {type human}
  }
  {control AI}
  {fire_mode hold}
  {ai_move
    {mode disable}
    {enable_on injure}
  }
}@^@
`),
    f: { ambush: { k: 'tag', def: 'my_ambush' } } }),

  // 567 elalamein:10025 "1.see_actors" (distance near_than meters, detection visible); simple selector / enemy bastogne:16428
  p({ id: 'mi.pat.ambush_that_opens_fire_on_sight', no: 567, sec: 'mi.pat.behaviour', size: 'medium', tag: 'I', mp: 'yes',
    scope: ['in:triggers'], src: 'elalamein 0.mi:10025',
    code: T(`
{"@name@"
  {condition
    {terms
      {"1.see_actors"
        {selector
          {tag @ambush@}
          {type human}
        }
        {enemy
          {tag @player@}
          {type human}
        }
        {distance
          {mode near_than}
          {meters @meters@}
        }
        {detection visible}
      }
    }
  }
  {actions
    {"actor_state"
      {selector
        {tag @ambush_2@}
        {type human}
      }
      {fire_mode open}
      {ai_move
        {mode enable}
      }
    }@^@
  }
}
`),
    f: { name: { k: 'text', def: 'my_ambush_sees' }, ambush: { k: 'tag', def: 'my_ambush' }, player: { k: 'tag', def: 'my_player_units' },
      meters: { k: 'number', def: 80, min: 1 }, ambush_2: { k: 'tag', def: 'my_ambush' } } }),

  // 568 B26 + B59; the entities term counts == 0 when no count is given (var compare default op ==)
  // so the count block is needed; {count {op "!="} {value 0}} as in vanilla
  p({ id: 'mi.pat.ambush_that_springs_on_a_zone', no: 568, sec: 'mi.pat.behaviour', size: 'medium', tag: 'I', mp: 'yes',
    scope: ['in:triggers'], src: '',
    code: T(`
{"@name@"
  {condition
    {terms
      {"1.entities"
        {selector
          {zone "@zone@"}
          {tag @player@}
        }
        {count
          {op "!="}
          {value 0}
        }
      }
    }
  }
  {actions
    {"actor_state"
      {selector
        {tag @ambush@}
        {type human}
      }
      {fire_mode open}
      {ai_move
        {mode enable}
      }
    }@^@
  }
}
`),
    f: { name: { k: 'text', def: 'my_ambush_zone' }, zone: { k: 'text', def: 'my_kill_zone' }, player: { k: 'tag', def: 'my_player_units' },
      ambush: { k: 'tag', def: 'my_ambush' } } }),

  // 569 gazala:15349 (count op "<<" value 4), actor_state movement speed (hurtgen:31150), actor_to_waypoint drop orders
  p({ id: 'mi.pat.retreat_when_losses_are_high', no: 569, sec: 'mi.pat.behaviour', size: 'medium', tag: 'I', mp: 'yes',
    scope: ['in:triggers'], src: 'gazala 0.mi:15349',
    code: T(`
{"@name@"
  {condition
    {terms
      {"1.entities"
        {selector
          {tag @group@}
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
    {"actor_state"
      {selector
        {tag @group_2@}
        {type human}
      }
      {movement
        {speed fast}
      }
    }
    {"actor_to_waypoint"
      {selector
        {tag @group_3@}
        {type human}
      }
      {drop orders}
      {waypoint "@wp@"}
    }@^@
  }
}
`),
    f: { name: { k: 'text', def: 'my_retreat' }, group: { k: 'tag', def: 'my_enemy_group' }, left: { k: 'number', def: 4, min: 1, int: true },
      group_2: { k: 'tag', def: 'my_enemy_group' }, group_3: { k: 'tag', def: 'my_enemy_group' }, wp: { k: 'text', def: 'my_fallback_wp' } } }),

  // 570 ; the same form in vanilla normandy:35200 (attack position, waypoint)
  p({ id: 'mi.pat.gun_shells_a_spot', no: 570, sec: 'mi.pat.more', size: 'small', tag: 'I', mp: 'yes',
    scope: CMD, src: '',
    code: T(`
{"actor_fire"
  {selector
    {tag @gun@}
    {type vehicle}
    {state inhabited}
  }
  {attack position}
  {waypoint "@wp@"}
}@^@
`),
    f: { gun: { k: 'tag', def: 'my_battery' }, wp: { k: 'text', def: 'my_target_wp' } } }),

  // 571 bastogne:25671-25718 (waypoint "248" offsetz, transition, effect takeoff_load, air_attack sorted by waypoint "1"),
  // "249" also has offsetz 500; the sending actor_to_waypoint (bastogne:9906) goes in a trigger, so it is in the needs text
  p({ id: 'mi.pat.air_strike_on_the_nearest_enemy_to_a', no: 571, sec: 'mi.pat.more', size: 'large', tag: 'V', mp: 'unknown',
    scope: ['in:helpers'], src: 'bastogne 0.mi:25671',
    code: T(`
{waypoints "@group@"
  {"@wp_in@"
    {position @pos_in@}
    {offsetz @height@}
    {transition "@wp_out@"}
    {commands
      {"effect"
        {effect takeoff_load}
      }
      {"delay"
        {time 3}
      }
      {"air_attack"
        {drop "orders sensor senseless"}
        {enemies
          {source advanced}
          {group
            {select
              {zone
                {zone "@zone@"}
              }
            }
            {include
              {player
                {player "@enemy@"}
              }
            }
            {exclude
              {state
                {state dead}
              }
              {state
                {state inactive}
              }
            }
          }
          {sort
            {type waypoint}
            {wpid "@target@"}
          }
          {amount 1}
        }
        {count @passes@}
        {random_weapon 0}
        {attack_altitude @altitude@}
      }
    }
  }
  {"@wp_out_2@"
    {position @pos_out@}
    {offsetz @height_2@}
    {commands
      {"delete"}
    }
  }
}@^@
`),
    f: { group: { k: 'text', def: 'my_air' }, wp_in: { k: 'text', def: 'my_air_in' }, pos_in: { k: 'text', def: '4286 5360 0' },
      height: { k: 'units', def: 500, min: 0 }, wp_out: { k: 'text', def: 'my_air_out' }, zone: { k: 'text', def: 'my_gamezone' },
      enemy: { k: 'choice', def: '1', choices: ['0', '1', '2', '3', '4', '5', '6', '7', '8'] }, target: { k: 'text', def: 'my_target_wp' },
      passes: { k: 'number', def: 2, min: 1, int: true }, altitude: { k: 'units', def: 20, min: 0 },
      wp_out_2: { k: 'text', def: 'my_air_out' }, pos_out: { k: 'text', def: '4108 5122 0' }, height_2: { k: 'units', def: 500, min: 0 } } }),

  // 572 winter_hills combat.mi:77-120 (switch, case rand, environment)
  p({ id: 'mi.pat.random_weather_or_time_of_day_at_sta', no: 572, sec: 'mi.pat.more', size: 'medium', tag: 'V', mp: 'yes',
    scope: ['in:triggers'], lim: ['MIS-34'], src: 'winter_hills combat.mi:77',
    code: T(`
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
        {"environment"
          {name "@env1@"}
        }
      }
      {"default"
        {"environment"
          {name "@env2@"}
        }
      }
    }@^@
  }
}
`),
    f: { name: { k: 'text', def: 'my_weather' }, chance: { k: 'chance', def: 0.3, min: 0, max: 1 },
      env1: { k: 'text', def: 'multi/multi_10' }, env2: { k: 'text', def: 'multi/multi_09' } } }),

  // 573 tutorial:15682; fields name time apply
  p({ id: 'mi.pat.change_the_environment_mid_mission', no: 573, sec: 'mi.pat.more', size: 'small', tag: 'V', mp: 'yes',
    scope: CMD, src: 'tutorial skirmish_script(tutorial).mi:15682',
    code: T(`
{"environment"
  {name "@env@"}
}@^@
`),
    f: { env: { k: 'text', def: 'skirmish/_01-tutorial2' } } }),

  // 574 hurtgen:17521-17533;
  p({ id: 'mi.pat.music_cue_that_stops_after_a_while', no: 574, sec: 'mi.pat.sound', size: 'medium', tag: 'V', mp: 'yes',
    scope: CMD, src: 'hurtgen 0.mi:17525',
    code: T(`
{"music"
  {start "@file@"}
  {stop_all}
  {volume game}
  {fade @fade_in@}
}
{"delay"
  {time @play@}
}
{"music"
  {stop "@file_2@"}
  {volume game}
  {fade @fade_out@}
}@^@
`),
    f: { file: { k: 'path', def: '/music/skirmish_progress.mp3' }, fade_in: { k: 'seconds', def: 5, min: 0 },
      play: { k: 'seconds', def: 80, min: 0 }, file_2: { k: 'path', def: '/music/skirmish_progress.mp3' },
      fade_out: { k: 'seconds', def: 35, min: 0 } } }),

  // 575 vanilla music start/stop_all/volume/fade/loop (bastogne:10314-10318)
  p({ id: 'mi.pat.background_music_on_a_loop', no: 575, sec: 'mi.pat.sound', size: 'small', tag: 'V', mp: 'yes',
    scope: CMD, src: 'bastogne 0.mi:10318',
    code: T(`
{"music"
  {start "@file@"}
  {stop_all}
  {volume game}
  {fade @fade@}
  {loop}
}@^@
`),
    f: { file: { k: 'path', def: '/music/skirmish_background_01.mp3' }, fade: { k: 'seconds', def: 5, min: 0 } } }),

  // 576 286 uses of mission/task_new; (sound: name, waypoint)
  p({ id: 'mi.pat.sound_cue', no: 576, sec: 'mi.pat.sound', size: 'small', tag: 'V', mp: 'yes',
    scope: CMD, src: '',
    code: T(`
{"sound"
  {name "@sound@"}
}@^@
`),
    f: { sound: { k: 'sound', def: 'mission/task_new' } } }),

  // 577 bastogne:9457 / overlord difficulty trigger: if {type difficulty} {level ...}; tag_remove hidden + inactive off (bastogne:10471)
  p({ id: 'mi.pat.difficulty_branches_at_start', no: 577, sec: 'mi.pat.difficulty', size: 'medium', tag: 'V', mp: 'unknown',
    scope: ['in:triggers'], src: 'bastogne 0.mi:9457',
    code: T(`
{"@name@"
  {condition
  }
  {actions
    {"if"
      {condition
        {type difficulty}
        {level @low@}
      }
      {"delete"
        {selector
          {tag @hard_only@}
        }
      }
    }
    {"if"
      {condition
        {type difficulty}
        {level @high@}
      }
      {"entity_state"
        {selector
          {tag @extra@}
        }
        {tag_remove hidden}
        {inactive off}
      }
    }@^@
  }
}
`),
    f: { name: { k: 'text', def: 'my_difficulty' }, low: { k: 'choice', def: 'easy', choices: ['easy', 'normal', 'hard', 'heroic'] },
      hard_only: { k: 'tag', def: 'my_hard_only' }, high: { k: 'choice', def: 'heroic', choices: ['easy', 'normal', 'hard', 'heroic'] },
      extra: { k: 'tag', def: 'my_extra' } } }),

  // 578 overlord:15972-15977 (delete selector amount + tag)
  p({ id: 'mi.pat.remove_n_of_a_group_by_difficulty', no: 578, sec: 'mi.pat.difficulty', size: 'small', tag: 'V', mp: 'yes',
    scope: CMD, src: 'overlord 0.mi:15974',
    code: T(`
{"delete"
  {selector
    {amount @amount@}
    {tag @group@}
  }
}@^@
`),
    f: { amount: { k: 'number', def: 4, min: 1, int: true }, group: { k: 'tag', def: 'my_guns' } } }),

  // 579 dison:11530-11535 (case {type mission_option} {name "mission_option1"}); if takes the same one-term condition
  p({ id: 'mi.pat.branch_on_a_mission_option', no: 579, sec: 'mi.pat.difficulty', size: 'small', tag: 'V', mp: 'unknown',
    scope: CMD, src: 'dison 0.mi:11533',
    code: T(`
{"if"
  {condition
    {type mission_option}
    {name "@option@"}
  }
  {"con"
    {text "@text@"}
  }@^@
}
`),
    f: { option: { k: 'text', def: 'my_option' }, text: { k: 'text', def: 'option on' } } }),

  // 580 winter_hills combat.mi:77-120 (switch rand, delete); MP command census
  p({ id: 'mi.pat.multiplayer_safe_start_block', no: 580, sec: 'mi.pat.more', size: 'medium', tag: 'V', mp: 'yes',
    scope: ['in:triggers'], lim: ['MIS-41', 'MIS-47', 'MIS-45', 'NET-02'], src: 'winter_hills combat.mi:77',
    code: T(`
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
        {"delete"
          {selector
            {tag @night@}
          }
        }
      }
      {"default"
        {"delete"
          {selector
            {tag @day@}
          }
        }
      }
    }@^@
  }
}
`),
    f: { name: { k: 'text', def: 'my_mp_setup' }, chance: { k: 'chance', def: 0.5, min: 0, max: 1 },
      night: { k: 'tag', def: 'my_night_props' }, day: { k: 'tag', def: 'my_day_props' } } }),

  // 581 overlord:35217 / tutorial:16720 (waypoint "1000" commands {"delete"}); a named group as bastogne:25597
  p({ id: 'mi.pat.exit_point_that_removes_who_arrives', no: 581, sec: 'mi.pat.more', size: 'small', tag: 'V', mp: 'yes',
    scope: ['in:helpers'], src: 'overlord 0.mi:35217',
    code: T(`
{waypoints "@group@"
  {"@wp@"
    {position @pos@}
    {commands
      {"delete"}
    }
  }
}@^@
`),
    f: { group: { k: 'text', def: 'my_exits' }, wp: { k: 'text', def: 'my_exit' }, pos: { k: 'text', def: '0 0 0' } } }),

  // 582 tutorial-units:12099 (waypoint commands {"emit" {waypoint}}); emit modes all passengers crew
  p({ id: 'mi.pat.unload_a_truck_at_a_waypoint', no: 582, sec: 'mi.pat.more', size: 'small', tag: 'V', mp: 'yes',
    scope: ['in:waypoints'], src: 'tutorial-units skirmish_units(tutorial).mi:12099',
    code: T(`
{"@wp@"
  {position @pos@}
  {radius @radius@}
  {commands
    {"emit"
      {waypoint "@after@"}
    }
  }
}@^@
`),
    f: { wp: { k: 'text', def: 'my_unload' }, pos: { k: 'text', def: '0 0 0' }, radius: { k: 'units', def: 50, min: 0 },
      after: { k: 'text', def: 'my_after_unload' } } }),

  // 583 (prints to game.log in action order)
  p({ id: 'mi.pat.print_a_value_or_a_mark_to_the_log', no: 583, sec: 'mi.debug', size: 'small', tag: 'V', mp: 'yes',
    scope: WPCMD, src: '',
    code: T(`
{"con"
  {text "@text@"}
}@^@
`),
    f: { text: { k: 'text', def: 'MARK stage 2 reached' } } }),

  // 584 gazala:27294-27298 ({type event} {mode off}); (mode names work off on; "on" is a
  // provisional name in the source, no vanilla term uses it)
  p({ id: 'mi.pat.force_a_term_true_or_false_while_tes', no: 584, sec: 'mi.debug', size: 'small', tag: 'I', mp: 'yes',
    scope: ['in:terms'], src: 'gazala 0.mi:27297',
    code: T(`
{"@no@.event"
  {id "@event@"}
  {mode @mode@}
}@^@
`),
    f: { no: { k: 'number', def: 1, min: 1, int: true }, event: { k: 'event', def: 'my_go' },
      mode: { k: 'choice', def: 'off', choices: ['off', 'on'] } } }),

  // 585 B15/B16 parts: set_i {var} {op "="} {value}, event {event} {mode set} {delay 0} (vanilla forms)
  p({ id: 'mi.pat.jump_to_a_stage_while_testing', no: 585, sec: 'mi.debug', size: 'small', tag: 'I', mp: 'yes',
    scope: ['in:triggers'], src: 'next-mission-patterns.md B15/B16',
    code: T(`
{"@name@"
  {condition
  }
  {actions
    {"set_i"
      {var "@var@$"}
      {op "="}
      {value @stage@}
    }
    {"event"
      {event "@event@"}
      {mode set}
      {delay 0}
    }@^@
  }
}
`),
    f: { name: { k: 'text', def: 'my_debug_jump' }, var: { k: 'text', def: 'my_stage' }, stage: { k: 'number', def: 3, int: true },
      event: { k: 'event', def: 'my_part2_done' } } }),

  // 586 tutorial:16670 {"autosave"}
  p({ id: 'mi.pat.save_at_a_checkpoint', no: 586, sec: 'mi.pat.more', size: 'small', tag: 'V', mp: 'no',
    scope: CMD, lim: ['NET-07'], src: 'tutorial skirmish_script(tutorial).mi:16670',
    code: '{"autosave"}@^@' }),

  // 587 hurtgen:12198-12202 ({zone "circle" {position} {Name} {Radius}}), directly in Helpers
  p({ id: 'mi.pat.declare_a_zone', no: 587, sec: 'mi.pat.more', size: 'small', tag: 'V', mp: 'yes',
    scope: ['in:helpers'], src: 'hurtgen 0.mi:12198',
    code: T(`
{zone "circle"
  {position @pos@}
  {Name "@zone@"}
  {Radius @radius@}
}@^@
`),
    f: { pos: { k: 'text', def: '0 0 0' }, zone: { k: 'text', def: 'my_zone' }, radius: { k: 'units', def: 200, min: 1 } } }),

  // 588 elalamein:24698 {discovered on}; tutorial:781 {discovered off}
  p({ id: 'mi.pat.reveal_enemies_on_the_map', no: 588, sec: 'mi.pat.units', size: 'small', tag: 'V', mp: 'yes',
    scope: WPCMD, src: 'elalamein 0.mi:24698',
    code: T(`
{"entity_state"
  {selector
    {tag @group@}
  }
  {discovered @mode@}
}@^@
`),
    f: { group: { k: 'tag', def: 'my_enemy_group' }, mode: { k: 'choice', def: 'on', choices: ['on', 'off'] } } }),

  // 589 hurtgen:22861; impregnability full 21, harmless 30, disabled 49 uses in the read missions
  p({ id: 'mi.pat.make_units_invulnerable_or_harmless', no: 589, sec: 'mi.pat.units', size: 'small', tag: 'V', mp: 'yes',
    scope: WPCMD, src: 'hurtgen 0.mi:22861',
    code: T(`
{"entity_state"
  {selector
    {tag @group@}
  }
  {impregnability @mode@}
}@^@
`),
    f: { group: { k: 'tag', def: 'my_vip' }, mode: { k: 'choice', def: 'full', choices: ['full', 'harmless', 'disabled'] } } })
] };

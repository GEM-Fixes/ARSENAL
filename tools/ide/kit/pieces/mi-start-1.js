// Code Pieces, group mi-start-1: whole files to start a mission:
// single-player 0.mi, menu entries (interface.set), mission and campaign texts (.lng), multiplayer mode .mi, map.info,
// ranked lines and a per-mode .info. Format: tools/ide/README.md "tools/ide/kit"; contract:
// The single-player file keeps the form tools/spmis writes and that was played to its win and lose ends
// (tools/spmis/proven.json): win and lose each set an event, a second trigger on that event ends the game.
// Author: Imperator_Aug (ARSENAL, ia-e2340694)
'use strict';

// code is written with two-space indents below and turned into tabs here (String.raw keeps the backslashes)
const T = s => s.replace(/^\n/, '').replace(/^((?: {2})+)/gm, m => '\t'.repeat(m.length / 2));
const base = { needs: [], lim: [], short: false, adv: false, wrap: false, task: null, since: '2026-11' };
const P = o => Object.assign({}, base, o);
const WHOLE = { whole: true, scope: ['empty'], role: 'data' };

const SP_MI = T(String.raw`
{mission
  {Human "@player_unit@" 0xd000
    {Position -2499.41 5752.57}
    {xform zl -76.95}
    {Player 2}
    {MID 1}
  }
  {Human "@player_unit_2@" 0xd001
    {Position -2399.41 5752.57}
    {xform zl -79.13}
    {Player 2}
    {MID 2}
  }
  {Human "@player_unit_3@" 0xd002
    {Position -2299.41 5752.57}
    {xform zl -81.34}
    {Player 2}
    {MID 3}
  }
  {Human "@enemy_unit@" 0xd004
    {Position -2166.5 3237.17}
    {xform zl 91.89}
    {Player 1}
    {MID 5}
  }
  {Human "@enemy_unit_2@" 0xd005
    {Position -2066.5 3237.17}
    {xform zl 94.16}
    {Player 1}
    {MID 6}
  }
  {Entity "skirmish_pointer" 0xd007
    {Position -1916.5 3237.17}
  }
  {Tags "player" "player_start" 0xd000}
  {Tags "player" "player_start" 0xd001}
  {Tags "player" "player_start" 0xd002}
  {Tags "enemy" 0xd004}
  {Tags "enemy" 0xd005}
  {Tags "pointer" "pt_take_crossroads" 0xd007}
  {Brain 0xd000
    {Properties
      {control user}
      {move_mode hold}
    }
  }
  {Brain 0xd001
    {Properties
      {control user}
      {move_mode hold}
    }
  }
  {Brain 0xd002
    {Properties
      {control user}
      {move_mode hold}
    }
  }
  {Brain 0xd004
    {Properties
      {move_mode hold}
    }
  }
  {Brain 0xd005
    {Properties
      {move_mode hold}
    }
  }
  {Environment "@environment@"}
  {Helpers
    {event "start"}
    {event "start_won"}
    {event "start_lost"}
    {zone "circle"
      {position -1916.5 3237.17 0}
      {Name "flag_a02"}
      {Radius @radius@}
    }
    {tasks
      {"take_crossroads"
        {desc "$/take_crossroads"}
        {primary}
        {state hidden}
        {point pt_take_crossroads}
      }
    }
    {cameras
      {"startview"
        {"key000"
          {position -2315.01 6248.25 500}
          {look_at -2249.41 5752.57 0}
          {fov 65}
        }
      }
    }
    {triggers
      {"start"
        {condition}
        {actions
          {"fade"
            {time 5}
            {color 0xff000000}
          }
          {"delay"
            {time 0.01}
          }
          {"scenario"
            {message
              {text "$/start"}
            }
            {camera
              {name "startview"}
              {smooth_begin 0}
              {smooth_end 0}
            }
            {event_on_next "start"}
            {force_auto_complete}
          }
        }
      }
      {"reinforcements:player/start"
        {condition
          {terms
            {"1.event"
              {id "start"}
            }
          }
        }
        {actions
          {"delay"
            {time 2}
          }
          {"autoassign"
            {selector
              {tag player_start}
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
        }
      }
      {"mission:objectives/take_crossroads: show"
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
            {name "take_crossroads"}
          }
          {"sound"
            {name "mission/task_new"}
          }
        }
      }
      {"mission:objectives/take_crossroads: comp"
        {condition
          {expression "1 & 2 & 3"}
          {terms
            {"1.task"
              {name "take_crossroads"}
              {state shown}
            }
            {"2.entities"
              {selector
                {tag player}
                {zone "flag_a02"}
                {type human}
                {state "not dead"}
              }
              {count
                {op ">"}
                {value 0}
              }
            }
            {"3.entities"
              {selector
                {player "1"}
                {zone "flag_a02"}
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
            {name "take_crossroads"}
            {state complete}
          }
          {"sound"
            {name "mission/task_fulfilled"}
          }
        }
      }
      {"mission:win"
        {condition
          {expression "1 & !2"}
          {terms
            {"1.task"
              {name "take_crossroads"}
            }
            {"2.event"
              {id "start_lost"}
            }
          }
        }
        {actions
          {"event"
            {event "start_won"}
            {mode set}
            {delay 0}
          }
        }
      }
      {"mission:won"
        {condition
          {terms
            {"1.event"
              {id "start_won"}
            }
          }
        }
        {actions
          {"delay"
            {time 5}
          }
          {"gameover"
            {result win}
            {message ""}
          }
        }
      }
      {"mission:lose/all_dead"
        {condition
          {expression "1 & 2 & !3"}
          {terms
            {"1.event"
              {id "start"}
            }
            {"2.entities"
              {selector
                {tag player}
                {type human}
                {state "not dead"}
              }
              {count
                {op "=="}
                {value 0}
              }
            }
            {"3.event"
              {id "start_won"}
            }
          }
        }
        {actions
          {"event"
            {event "start_lost"}
            {mode set}
            {delay 0}
          }
        }
      }
      {"mission:lost"
        {condition
          {terms
            {"1.event"
              {id "start_lost"}
            }
          }
        }
        {actions
          {"delay"
            {time 5}
          }
          {"gameover"
            {result loose}
            {message ""}
          }
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
}`);

const MP_MI = T(String.raw`
{mission
  {Entity "map_point" 0xc000
    {Position -2829.61 -861.58}
    {xform zl -1.77}
    {Extender "map_point"
      {name b1}
      {team b}
      {phase 0}
      {order 1}
      {visor SpawnPoint}
    }
    {Player 0}
    {MID 1}
  }
  {Entity "map_point" 0xc007
    {Position 2501.09 1228.63}
    {xform zl 177.45}
    {Extender "map_point"
      {name a1}
      {team a}
      {phase 0}
      {order 1}
      {visor SpawnPoint}
    }
    {Player 0}
    {MID 9}
  }
  {Environment "@environment@"}
  {Helpers
    {reinforcements
      {scoreTotal 0}
      {scoreCurrent 0}
    }
    {triggers
      {"music"
        {condition
        }
        {actions
          {"music"
            {start "@music@"}
            {stop_all}
            {volume game}
            {fade 5}
            {loop}
          }
          {"delay"
            {time @music_time@}
          }
          {"trigger"
            {name "music"}
          }
        }
      }
    }
  }
  {Players
    {count 17}
    {diplomacy
      1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0
      0 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1
      0 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1
      0 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1
      0 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1
      0 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1
      0 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1
      0 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1
      0 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1
      0 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1
      0 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1
      0 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1
      0 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1
      0 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1
      0 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1
      0 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1
      0 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1
    }
  }
  {Fog 1}
  {EntityManager {Enabled}
    {CountScale "x0.5"}
  }
}`);

const MISSION_LNG = T(String.raw`
{tags
  {"name" "@name@"}
  {"name_big" "@name_2@"}
  {"date" "@date@"}
  {"place" "@place@"}
  {"story" "@story@"}
  {"start" "Press \"Continue\" to start the battle!"}
  {"outro_completed" "Mission accomplished!"}
  {"outro_failed" "You have been defeated!"}
  {"take_crossroads" "@goal@"}
}`);

const unit = def => ({ k: 'entity', def: def });
const SIDES = ['usa', 'ger', 'eng', 'rus', 'jap'];

module.exports = { group: 'mi-start-1', pieces: [
  P(Object.assign({ id: 'mi.file.sp', no: 298, sec: 'mi.start.whole-file', kinds: ['mi'], size: 'large', tag: 'V',
    code: SP_MI,
    f: {
      player_unit: unit('mp/usa/rifle'), player_unit_2: unit('mp/usa/rifle'), player_unit_3: unit('mp/usa/rifle'),
      enemy_unit: unit('mp/ger/rifle'), enemy_unit_2: unit('mp/ger/rifle'),
      environment: { k: 'text', def: 'skirmish/usa-omaha' },
      radius: { k: 'units', def: '240', min: 1 }
    },
    lim: ['MAP-24', 'MIS-39'], src: 'tools/spmis/spmis.js:453-619; map/single/01_usa-skirmish/00b_usa-hurtgen/0.mi:2-33486' }, WHOLE)),

  P(Object.assign({ id: 'mi.file.sp.iface', no: 299, sec: 'sdl.files', kinds: ['sdl'], size: 'small', tag: 'V',
    code: '{location\n\t{level @level@}\n\t{level_set @level_set@}\n}',
    f: { level: { k: 'number', def: '0', min: 0, int: true }, level_set: { k: 'number', def: '1', min: 0, int: true } },
    src: 'tools/spmis/spmis.js:653; map/single/01_usa-skirmish/00b_usa-hurtgen/interface.set:1-3' }, WHOLE)),

  P(Object.assign({ id: 'mi.file.camp.iface', no: 300, sec: 'sdl.files', kinds: ['sdl'], size: 'small', tag: 'V',
    code: '{location\n\t{side @side@}\n}',
    f: { side: { k: 'choice', def: 'usa', choices: SIDES } },
    src: 'tools/spmis/spmis.js:654; map/single/01_usa-skirmish/interface.set:1-2' }, WHOLE)),

  P(Object.assign({ id: 'lng.file.mission', no: 301, sec: 'lng.whole-file', kinds: ['lng'], size: 'small', tag: 'V',
    code: MISSION_LNG,
    f: {
      name: { k: 'text', def: 'Take the crossroads' }, name_2: { k: 'text', def: 'Take the crossroads' },
      date: { k: 'text', def: 'June 1944' }, place: { k: 'text', def: 'Normandy' },
      story: { k: 'text', def: 'Take the crossroads.' }, goal: { k: 'text', def: 'Capture the crossroads' }
    },
    src: 'interface/text/mission/single/01_usa-skirmish/00b_usa-hurtgen.lng:1-30' }, WHOLE)),

  P(Object.assign({ id: 'lng.file.campaign', no: 302, sec: 'lng.whole-file', kinds: ['lng'], size: 'small', tag: 'V',
    code: '{tags\n\t{"title" ""}\n\t{"name" "@name@"}\n}',
    f: { name: { k: 'text', def: 'My missions' } },
    src: 'tools/spmis/spmis.js:655; interface/text/mission/single/01_usa-skirmish/campaign.lng:1-4' }, WHOLE)),

  P(Object.assign({ id: 'mi.file.mp', no: 303, sec: 'mi.start.whole-file', kinds: ['mi'], size: 'large', tag: 'V',
    code: MP_MI,
    f: {
      environment: { k: 'text', def: 'multi/multi_01' },
      music: { k: 'path', def: '/music/skirmish_background_02.mp3' },
      music_time: { k: 'seconds', def: '120', min: 1 }
    },
    lim: ['MAP-01', 'MIS-24', 'MIS-65', 'MIS-70'], src: 'map/multi/1v1_road/combat.mi:1-413' }, WHOLE)),

  P(Object.assign({ id: 'info.file', no: 304, sec: 'info.whole-file', kinds: ['mapinfo'], size: 'small', tag: 'V',
    code: ';SDL\n{game\n\t{maxPlayers @players@}\n\t{texMod 2}\n}',
    f: { players: { k: 'number', def: '2', min: 1, max: 16, int: true } },
    lim: ['MAP-02'], src: 'map/multi/1v1_road/map.info:1-5' }, WHOLE)),

  // [T]: this engine tree reads the nested form {ranked {minPlayers}{maxPlayers}} and skips the flat keys (MAP-11)
  P({ id: 'info.ranked', no: 305, sec: 'info.lines', kinds: ['mapinfo'], size: 'small', tag: 'T', adv: true,
    scope: ['in:game'], role: 'data',
    code: '{ranked}\n{rankedMinPlayers @min@}\n{rankedMaxPlayers @max@}',
    f: { min: { k: 'number', def: '2', min: 1, max: 16, int: true }, max: { k: 'number', def: '2', min: 1, max: 16, int: true } },
    lim: ['MAP-11'], src: 'map/multi/1v1_argentan/map.info:5-7' }),

  P(Object.assign({ id: 'info.file.mode', no: 306, sec: 'sdl.files', kinds: ['sdl'], size: 'small', tag: 'V',
    code: ';SDL\n{game\n\t{maxPlayers @players@}\n\t{parameters "@parameters@"}\n}',
    f: {
      players: { k: 'number', def: '6', min: 1, max: 16, int: true },
      parameters: { k: 'text', def: 'flag_capture_time=20;freezeTime=5;flag_release_time=20;flag_capture_factor=0.5' }
    },
    lim: ['MIS-69'], src: 'map/multi/8v8_facility/battle_zones.info:1-5; ' }, WHOLE))
] };

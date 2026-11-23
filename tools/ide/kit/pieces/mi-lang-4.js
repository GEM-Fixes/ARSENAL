// Code Pieces, group mi-lang-4: the last mission commands and the Advanced rows (numbers 469 to 507 of
// list sections 2.4 and 3).
// Format: tools/ide/README.md "tools/ide/kit"; contract:
// Each [V] command keeps the form of the cited stock mission line (read from the game's map paks); each [T] row is
// written from the engine reader it cites (game/helper/*), its keys exactly as the Serialize body names them.
// A command goes inside {actions}, a statement body or a function (both have a quoted head) or a waypoint {commands}.
// Author: Imperator_Aug (ARSENAL, ia-da41908f)
'use strict';

// code is written with two-space indents below and turned into tabs here (String.raw keeps the backslashes)
const T = s => s.replace(/^\n/, '').replace(/\n$/, '').replace(/^((?: {2})+)/gm, m => '\t'.repeat(m.length / 2));
const base = { needs: [], lim: [], short: false, adv: false, wrap: false, task: null, since: '2026-11' };
const P = o => Object.assign({}, base, { kinds: ['mi'], role: 'act', scope: CMD }, o, o.tag === 'T' ? { adv: true } : {});
const CMD = ['in:actions', 'in:*', 'in:commands'];
const HG = 'map:map/single/01_usa-skirmish/00b_usa-hurtgen/0.mi:';
const DISON = 'map:map/single/01_usa-skirmish/06_usa-dison/0.mi:';
const ARG = 'map:map/multi/1v1_argentan/battle_zones.mi:';
const tag = def => ({ k: 'tag', def });
const ONOFF = ['on', 'off'];

const FRONTLINE = T(String.raw`
{mission
  {Entity "map_point" 0x8011
    {Position -227.06 -4801.16}
    {xform zl 89.52}
    {Extender "map_point"
      {name a11}
      {team a}
      {phase 1}
      {order 1}
      {visor SpawnPoint}
    }
    {Player 0}
    {MID 22}
  }
  {Entity "spawn_point" 0x801e
    {Position -298.53 -4799.92}
    {xform zl 93.52}
    {Extender "spawn_point"
      {mapPoint a11}
      {pos 1}
    }
    {Player 0}
    {MID 25}
  }
  {Entity "map_point" 0x8022
    {Position -320.23 1667.01}
    {xform zl -88.93}
    {Extender "map_point"
      {name b11}
      {team b}
      {phase 1}
      {order 1}
      {visor SpawnPoint}
    }
    {Player 0}
    {MID 26}
  }
  {Entity "spawn_point" 0x8021
    {Position -382.47 1661.33}
    {xform zl -84.04}
    {Extender "spawn_point"
      {mapPoint b11}
      {pos 1}
    }
    {Player 0}
    {MID 24}
  }
  {Entity "flag_point_frontlines" 0xe002
    {Position -303.04 1025.58}
    {Extender "map_point"
      {name f22}
      {team b}
      {zoneA 23}
      {zoneB 23}
      {phase 1}
      {order 1}
      {show All}
      {visor SpawnPoint}
      {allow
        {capture "a"}
        {release "a"}
      }
    }
    {Player 0}
    {MID 1}
  }
  {Entity "map_point" 0x8037
    {Position -282.01 -1309.37}
    {xform zl 89.52}
    {Extender "map_point"
      {name a21}
      {team a}
      {phase 2}
      {order 1}
      {visor SpawnPoint}
    }
    {Player 0}
    {MID 47}
  }
  {Entity "spawn_point" 0x8036
    {Position -342.2 -1308.39}
    {xform zl 93.52}
    {Extender "spawn_point"
      {mapPoint a21}
      {pos 1}
    }
    {Player 0}
    {MID 46}
  }
  {Entity "map_point" 0x802a
    {Position -386.89 4504.42}
    {xform zl -91.5}
    {Extender "map_point"
      {name b21}
      {team b}
      {phase 2}
      {order 1}
      {visor SpawnPoint}
    }
    {Player 0}
    {MID 42}
  }
  {Entity "spawn_point" 0x8032
    {Position -449.33 4501.54}
    {xform zl -86.61}
    {Extender "spawn_point"
      {mapPoint b21}
      {pos 1}
    }
    {Player 0}
    {MID 50}
  }
  {Entity "flag_point_frontlines" 0x8004
    {Position -239.36 5387.68}
    {Extender "map_point"
      {name f22}
      {team b}
      {zoneA 23}
      {zoneB 23}
      {phase 2}
      {order 1}
      {show All}
      {visor SpawnPoint}
      {allow
        {capture "a"}
        {release "a"}
      }
    }
    {Player 0}
    {MID 3}
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
            {time 480}
          }
          {"trigger"
            {name "music"}
          }
        }
      }
    }
  }
  {Fog 1}
}
`) + '\n';

module.exports = { group: 'mi-lang-4', pieces: [
  P({ id: 'mi.c.spawn', no: 469, sec: 'mi.do.spawn-and-remove', size: 'small', tag: 'V',
    code: T(`
{"spawn"
  {entity "@entity@"}
  {waypoint "@waypoint@"}
}`),
    f: { entity: { k: 'entity', def: 'paradrop_ammo' }, waypoint: { k: 'text', def: '130' } },
    lim: ['MIS-51', 'MIS-87'], src: HG + '26686-26689' }),

  P({ id: 'mi.c.delete', no: 470, sec: 'mi.do.spawn-and-remove', size: 'small', tag: 'V',
    code: T(`
{"delete"
  {selector
    {tag @tag@}
  }
}`),
    f: { tag: tag('day') }, lim: ['MIS-45'], src: ARG + '187-191' }),

  P({ id: 'mi.c.store_units', no: 471, sec: 'mi.do.spawn-and-remove', size: 'small', tag: 'T',
    code: T(`
{"store_units"
  {selector
    {tag @tag@}
  }
  {slot_name @slot@}
}`),
    f: { tag: tag('player'), slot: { k: 'text', def: 'carry_over' } },
    src: '' }),

  P({ id: 'mi.c.load_units', no: 472, sec: 'mi.do.spawn-and-remove', size: 'small', tag: 'T',
    code: T(`
{"load_units"
  {slot_name @slot@}
}`),
    f: { slot: { k: 'text', def: 'carry_over' } },
    src: '' }),

  P({ id: 'mi.c.entity_manager', no: 473, sec: 'mi.do.spawn-and-remove', size: 'small', tag: 'T',
    code: T(`
{"entity_manager"
  {enabled 1}
  {count @count@}
}`),
    f: { count: { k: 'choice', def: 'x1', choices: ['x0.5', 'x1', 'x2', 'x3', 'x5'] } },
    src: '' }),

  P({ id: 'mi.c.inventory', no: 474, sec: 'mi.do.damage-and-inventory', size: 'small', tag: 'V',
    code: T(`
{"inventory"
  {selector
    {tag @tag@}
  }
  {action @action@}
  {item "@item@"}
  {amount @amount@}
}`),
    f: { tag: tag('allied_broken_tank'), action: { k: 'choice', def: 'add', choices: ['add', 'remove'] },
      item: { k: 'text', def: 'repair_kit' }, amount: { k: 'number', def: '2', min: 1, int: true } },
    src: HG + '26961' }),

  P({ id: 'mi.c.component', no: 475, sec: 'mi.do.damage-and-inventory', size: 'small', tag: 'V',
    code: T(`
{"actor_component"
  {selector
    {tag @tag@}
  }
  {component @component@}
  {state @state@}
}`),
    f: { tag: tag('allied_broken_tank'),
      component: { k: 'choice', def: 'trackleft', choices: ['trackleft', 'trackright', 'gun', 'turret', 'body', 'engine'] },
      state: { k: 'choice', def: 'broken', choices: ['broken', 'work'] } },
    src: HG + '26878-26885' }),

  P({ id: 'mi.c.effect', no: 476, sec: 'mi.do.damage-and-inventory', size: 'small', tag: 'V',
    code: T(`
{"effect"
  {selector
    {tag @tag@}
  }
  {effect @effect@}
}`),
    f: { tag: tag('convoy_destroy_tank'), effect: { k: 'effect', def: '_burn' } },
    src: HG + '26908' }),

  P({ id: 'mi.c.task', no: 477, sec: 'mi.do.objectives-and-score', size: 'small', tag: 'V',
    code: T(`
{"task"
  {name "@name@"}
  {state @state@}
}`),
    f: { name: { k: 'text', def: 'defendbase' }, state: { k: 'choice', def: 'complete', choices: ['complete', 'fail', 'hide'] } },
    src: HG + '19247' }),

  P({ id: 'mi.c.objprog', no: 478, sec: 'mi.do.objectives-and-score', size: 'small', tag: 'V',
    code: T(`
{"objective_progress"
  {set @set@}
  {add @add@}
  {title "@title@"}
}`),
    f: { set: { k: 'number', def: '0', int: true }, add: { k: 'number', def: '0', int: true },
      title: { k: 'text', def: '$/player_money_000' } },
    src: HG + '13441-13445' }),

  P({ id: 'mi.c.timer', no: 479, sec: 'mi.do.objectives-and-score', size: 'small', tag: 'V',
    code: T(`
{"timer"
  {time @time@}
  {title "@title@"}
}`),
    f: { time: { k: 'seconds', def: '180', min: 1 }, title: { k: 'text', def: '$/timerbase' } },
    src: HG + '19256-19259' }),

  P({ id: 'mi.c.reinforcement', no: 480, sec: 'mi.do.objectives-and-score', size: 'small', tag: 'V',
    code: T(`
{"reinforcement"
  {operation @operation@}
  {name "@name@"}
}`),
    f: { operation: { k: 'choice', def: 'show', choices: ['show', 'hide'] }, name: { k: 'text', def: 'player_infantry' } },
    src: HG + '13472' }),

  P({ id: 'mi.c.talk', no: 481, sec: 'mi.do.objectives-and-score', size: 'small', tag: 'V',
    code: T(`
{"talk"
  {selector
    {tag @tag@}
  }
  {text "@text@"}
}`),
    f: { tag: tag('officer_talk'), text: { k: 'text', def: '$/officer_start' } },
    src: HG + '13419-13424' }),

  P({ id: 'mi.c.achievement', no: 482, sec: 'mi.do.objectives-and-score', size: 'small', tag: 'V',
    code: T(`
{"achievement"
  {name @name@}
  {nation @nation@}
}`),
    f: { name: { k: 'text', def: 'skirmish_00b_usa_easy' },
      nation: { k: 'choice', def: 'usa', choices: ['usa', 'ger', 'eng', 'rus', 'jap'] } },
    src: HG + '17379-17382' }),

  P({ id: 'mi.c.gamestatus', no: 483, sec: 'mi.do.objectives-and-score', size: 'small', tag: 'T',
    code: T(`
{"gamestatus"
  {status @status@}
}`),
    f: { status: { k: 'choice', def: '1', choices: ['1', '2', '3', '4', '5'] } },
    src: ',563-567' }),

  P({ id: 'mi.c.mp_event', no: 484, sec: 'mi.do.objectives-and-score', size: 'small', tag: 'T',
    code: T(`
{"mp_event"
  {event @event@}
  {team @team@}
}`),
    f: { event: { k: 'text', def: 'onpoint' }, team: { k: 'choice', def: 'a', choices: ['a', 'b'] } },
    src: '' }),

  P({ id: 'mi.c.event', no: 485, sec: 'mi.do.variables-and-events', size: 'small', tag: 'V',
    code: T(`
{"event"
  {event "@event@"}
  {mode @mode@}
  {delay @delay@}
}`),
    f: { event: { k: 'event', def: 'start_won' }, mode: { k: 'choice', def: 'set', choices: ['set', 'reset'] },
      delay: { k: 'seconds', def: '0', min: 0 } },
    lim: ['MIS-85'], src: HG + '13034-13038' }),

  P({ id: 'mi.c.trigger', no: 486, sec: 'mi.do.variables-and-events', size: 'small', tag: 'V',
    code: T(`
{"trigger"
  {name "@name@"}
}`),
    f: { name: { k: 'text', def: 'music' } },
    src: 'map:map/multi/1v1_road/combat.mi:380-382' }),

  P({ id: 'mi.c.set_i', no: 487, sec: 'mi.do.variables-and-events', size: 'small', tag: 'V',
    code: T(`
{"set_i"
  {var "@var@"}
  {op "@op@"}
  {value @value@}
}`),
    f: { var: { k: 'text', def: 'player_score$' }, op: { k: 'choice', def: '+', choices: ['+', '-', '='] },
      value: { k: 'number', def: '5', int: true } },
    src: HG + '16236' }),

  P({ id: 'mi.c.con', no: 488, sec: 'mi.do.variables-and-events', size: 'small', tag: 'V',
    code: T(`
{"con"
  {text "@text@"}
}`),
    f: { text: { k: 'text', def: 'my trigger ran' } },
    src: 'modweb/mission/mi-forms.md:7,10' }),

  P({ id: 'mi.c.call', no: 489, sec: 'mi.do.variables-and-events', size: 'small', tag: 'T',
    code: T(`
{"call"
  {function "@function@"}
  {context
    {specified 1}
    {selector
      {tag @tag@}
    }
  }
}`),
    f: { function: { k: 'text', def: 'tear_turret' }, tag: tag('player_tank') },
    src: '' }),

  P({ id: 'mi.c.thread', no: 490, sec: 'mi.do.variables-and-events', size: 'small', tag: 'T',
    code: T(`
{"thread"
  {"delay"
    {time @time@}
  }
  {"con"
    {text "@text@"}
  }
  @^@
}`),
    f: { time: { k: 'seconds', def: '5', min: 0 }, text: { k: 'text', def: 'thread ran' } },
    src: '' }),

  P({ id: 'mi.c.scenario', no: 491, sec: 'mi.do.camera-and-screen', size: 'medium', tag: 'V',
    code: T(`
{"scenario"
  {message
    {text "@text@"}
  }
  {camera
    {name "@camera@"}
    {smooth_begin 0}
    {smooth_end 0}
  }
  {event_on_next "@event@"}
  {force_auto_complete}
}`),
    f: { text: { k: 'text', def: '$/start' }, camera: { k: 'text', def: 'startview2' }, event: { k: 'event', def: 'start' } },
    src: HG + '13139-13150' }),

  P({ id: 'mi.c.fade', no: 492, sec: 'mi.do.camera-and-screen', size: 'small', tag: 'V',
    code: T(`
{"fade"
  {time @time@}
  {color @color@}
}`),
    f: { time: { k: 'seconds', def: '3', min: 0 }, color: { k: 'text', def: '0xff000000' } },
    src: HG + '13092-13095' }),

  P({ id: 'mi.c.set_clip', no: 493, sec: 'mi.do.camera-and-screen', size: 'small', tag: 'V',
    code: T(`
{"set_clip"
  {name @name@}
}`),
    f: { name: { k: 'text', def: 'start' } },
    lim: ['MIS-62'], src: HG + '13089-13091' }),

  P({ id: 'mi.c.cam_bone', no: 494, sec: 'mi.do.camera-and-screen', size: 'small', tag: 'V',
    code: T(`
{"camera_follow_bone"
  {entity @entity@}
  {bone @bone@}
  {fov @fov@}
  {offest
    {x @x@}
    {y @y@}
    {z @z@}
  }
  {"y angle" @yangle@}
  {"z angle" @zangle@}
  {apply}
}`),
    f: { entity: { k: 'number', def: '33081', min: 0, int: true }, bone: { k: 'bone', def: 'turret' },
      fov: { k: 'number', def: '0', min: 0 }, x: { k: 'units', def: '-75' }, y: { k: 'units', def: '0' }, z: { k: 'units', def: '75' },
      yangle: { k: 'number', def: '210' }, zangle: { k: 'number', def: '0' } },
    lim: ['MIS-41'], src: DISON + '26838' }),

  P({ id: 'mi.c.autosave', no: 495, sec: 'mi.do.camera-and-screen', size: 'small', tag: 'V',
    code: '{"autosave"}', src: HG + '30036' }),

  P({ id: 'mi.c.game_speed', no: 496, sec: 'mi.do.camera-and-screen', size: 'small', tag: 'T',
    code: T(`
{"game_speed"
  {mode @mode@}
}`),
    f: { mode: { k: 'choice', def: 'fast', choices: ['very_slow', 'slow', 'normal', 'fast', 'very_fast'] } },
    lim: ['MIS-47', 'TST-39'], src: '' }),

  P({ id: 'mi.c.fog_mode', no: 497, sec: 'mi.do.camera-and-screen', size: 'small', tag: 'V',
    code: T(`
{"fog_mode"
  {enable @enable@}
}`),
    f: { enable: { k: 'choice', def: 'off', choices: ONOFF } },
    src: DISON + '24125-24127' }),

  P({ id: 'mi.c.fog_in_zone', no: 498, sec: 'mi.do.camera-and-screen', size: 'small', tag: 'T',
    code: T(`
{"fog_in_zone"
  {zone "@zone@"}
  {enable @enable@}
}`),
    f: { zone: { k: 'text', def: 'gamezone' }, enable: { k: 'choice', def: 'on', choices: ONOFF } },
    src: '' }),

  P({ id: 'mi.c.sound', no: 499, sec: 'mi.do.sound-and-weather', size: 'small', tag: 'V',
    code: T(`
{"sound"
  {name "@name@"}
}`),
    f: { name: { k: 'sound', def: 'mission/skirmish/usa/skirmish_flag_capture/01' } },
    src: HG + '17229-17231' }),

  P({ id: 'mi.c.music', no: 500, sec: 'mi.do.sound-and-weather', size: 'small', tag: 'V',
    code: T(`
{"music"
  {start "@file@"}
  {stop_all}
  {volume game}
  {fade @fade@}
  {loop}
}`),
    f: { file: { k: 'path', def: '/music/skirmish_background_01.mp3' }, fade: { k: 'seconds', def: '5', min: 0 } },
    src: ARG + '435-441' }),

  P({ id: 'mi.c.environment', no: 501, sec: 'mi.do.sound-and-weather', size: 'small', tag: 'V',
    code: T(`
{"environment"
  {name "@name@"}
}`),
    f: { name: { k: 'text', def: 'multi/multi_10' } },
    src: ARG + '184-186' }),

  P({ id: 'mi.c.gameover', no: 502, sec: 'mi.do.end', size: 'small', tag: 'V',
    code: T(`
{"gameover"
  {result @result@}
  {message ""}
}`),
    f: { result: { k: 'choice', def: 'win', choices: ['win', 'loose'] } },
    src: HG + '17441-17443, 13399-13401' }),

  P({ id: 'mi.a.frontline', no: 503, sec: 'mi.adv', size: 'large', tag: 'V', adv: true, role: 'data', whole: true, scope: ['empty'],
    code: FRONTLINE,
    f: { environment: { k: 'text', def: 'multi/multi_01' }, music: { k: 'path', def: '/music/skirmish_background_01.mp3' } },
    lim: ['MAP-21'], src: 'map:map/multi/a_frontlines/1v1_icy_village/frontline.mi:1-128,384-708' }),

  P({ id: 'mi.a.extraspawn', no: 504, sec: 'mi.adv', size: 'small', tag: 'T', scope: ['in:actions', 'in:*'],
    code: T(`
{"extraspawn"
  {selector
    {tag @tag@}
  }
}`),
    f: { tag: tag('extra_unit') },
    src: '' }),

  P({ id: 'mi.a.stmt_mode', no: 505, sec: 'mi.adv', size: 'small', tag: 'V', adv: true, role: 'cond', scope: ['in:*'],
    code: T(`
{condition
  {type event}
  {mode off}
  {id "@id@"}
}`),
    f: { id: { k: 'event', def: 'start_lost' } },
    src: HG + '27277' }),

  P({ id: 'mi.a.zonepos', no: 506, sec: 'mi.adv', size: 'line', tag: 'V', adv: true, role: 'data', scope: ['in:brain'],
    code: '{ZonePosition @x@ @y@}',
    f: { x: { k: 'number', def: '193.484' }, y: { k: 'number', def: '3421.52' } },
    src: HG + '10791-10796' }),

  P({ id: 'mi.a.lookat', no: 507, sec: 'mi.adv', size: 'line', tag: 'V', adv: true, role: 'data', scope: ['in:brain'],
    code: '{LookAt @x@ @y@ @z@}',
    f: { x: { k: 'number', def: '591.987' }, y: { k: 'number', def: '-2224.06' }, z: { k: 'number', def: '175.563' } },
    src: HG + '11681-11686' }),
] };

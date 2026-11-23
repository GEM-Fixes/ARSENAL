// Code Pieces, group mi-lang-3: commands of the mission language (numbers 434 to 468;
// list section 2.4): unit orders, unit state, tags and abilities, squads.
// Format: tools/ide/README.md "tools/ide/kit"; contract:
// Every form was checked against the cited vanilla mission (map.pak, read through tools/lib/pak.js) and the engine
// Serialize of the command (game/helper/*.cpp). A command goes in {actions}, in a statement body ({"case" ..},
// {"default" ..}, {"if" ..}) or in a waypoint's {commands}; inside {commands} the selector is left out (the unit at
// the waypoint runs it). Waypoint-only forms (wait, air_state) drop only into {commands}.
// Author: Imperator_Aug (ARSENAL, ia-4279ceb8)
'use strict';

// code is written with two-space indents below and turned into tabs here (String.raw keeps the backslashes)
const T = s => s.replace(/^\n/, '').replace(/\n$/, '').replace(/^((?: {2})+)/gm, m => '\t'.repeat(m.length / 2));
const base = { kinds: ['mi'], needs: [], lim: [], short: false, adv: false, wrap: false, task: null, since: '2026-11' };
const CMD = ['in:actions', 'in:commands', 'in:*'];
const P = o => Object.assign({ scope: CMD, role: 'act' }, base, o, o.tag === 'T' ? { adv: true } : {});
const tag = def => ({ k: 'tag', def });
const wp = def => ({ k: 'text', def });

const pieces = [
  P({ id: 'mi.c.recon', no: 434, sec: 'mi.do.orders', size: 'small', tag: 'V', src: 'hurtgen:20821',
    code: T(String.raw`
{"actor_recon"
  {selector
    {tag @tag@}
    {type human}
    {state "not dead"}
  }
  {drop orders}
  {waypoint "@waypoint@"}
  {radius @radius@}
}
`),
    f: { tag: tag('enemy_patrol'), waypoint: wp('81'), radius: { k: 'units', def: 250, min: 0 } } }),

  P({ id: 'mi.c.fire', no: 435, sec: 'mi.do.orders', size: 'small', tag: 'V', src: 'hurtgen:21575', lim: ['MIS-44'],
    code: T(String.raw`
{"actor_fire"
  {selector
    {tag @tag@}
  }
  {drop orders}
  {attack enemies}
  {enemies
    {tag @enemy_tag@}
  }
  {interval 0}
  {time 0}
  {burst_mode @burst@}
}
`),
    f: { tag: tag('player_initial_tank'), enemy_tag: tag('enemy'),
      burst: { k: 'choice', def: 'long', choices: ['long', 'short', 'once', 'smart'] } } }),

  P({ id: 'mi.c.action', no: 436, sec: 'mi.do.orders', size: 'small', tag: 'V', src: 'hurtgen:19119',
    code: T(String.raw`
{"action"
  {selector
    {tag @tag@}
  }
  {drop orders}
  {action @action@}
  {target
    {tag @target_tag@}
    {amount 1}
  }
}
`),
    f: { tag: tag('key_fix_tank_fixer'),
      action: { k: 'choice', def: 'move', choices: ['move', 'attack', 'rotate', 'repair', 'pour_out', 'attach', 'detach', 'attack_ground'] },
      target_tag: tag('key_fix_tank_tofix') } }),

  P({ id: 'mi.c.state', no: 437, sec: 'mi.do.orders', size: 'small', tag: 'V', src: 'hurtgen:12873', lim: ['MIS-40'],
    code: T(String.raw`
{"actor_state"
  {selector
    {tag @tag@}
    {type human}
  }
  {control @control@}
  {fire_mode @fire_mode@}
  {move_mode @move_mode@}
  {move_radius @move_radius@}
  {weapon_prepare on}
}
`),
    f: { tag: tag('player_start'), control: { k: 'choice', def: 'AI', choices: ['AI', 'user'] },
      fire_mode: { k: 'choice', def: 'open', choices: ['open', 'return', 'hold'] },
      move_mode: { k: 'choice', def: 'zone', choices: ['hold', 'free', 'zone'] },
      move_radius: { k: 'units', def: 50, min: 0 } } }),

  P({ id: 'mi.c.state.movement', no: 438, sec: 'mi.do.orders', size: 'small', tag: 'V', src: 'src: ',
    code: T(String.raw`
{"actor_state"
  {selector
    {tag @tag@}
  }
  {movement
    {speed @speed@}
    {type @gait@}
  }
}
`),
    f: { tag: tag('enemy'), speed: { k: 'choice', def: 'assault', choices: ['slow', 'walk', 'sneak', 'assault', 'normal', 'fast', 'bow', 'spot'] },
      gait: { k: 'choice', def: 'crawl', choices: ['normal', 'crawl'] } } }),

  P({ id: 'mi.c.state.aimove', no: 439, sec: 'mi.do.orders', size: 'small', tag: 'V', src: 'src: ',
    code: T(String.raw`
{"actor_state"
  {selector
    {tag @tag@}
  }
  {ai_move
    {mode @mode@}
    {enable_on injure}
  }
}
`),
    f: { tag: tag('enemy'), mode: { k: 'choice', def: 'disable', choices: ['disable', 'enable'] } } }),

  P({ id: 'mi.c.state.ai', no: 440, sec: 'mi.do.orders', size: 'small', tag: 'V', src: 'src: ', lim: ['MIS-68'],
    code: T(String.raw`
{"actor_state"
  {selector
    {tag @tag@}
  }
  {ai
    {advance_ratio @advance@}
    {retreat_ratio @retreat@}
  }
}
`),
    f: { tag: tag('enemy'), advance: { k: 'number', def: 1, min: 0 }, retreat: { k: 'number', def: 2, min: 0 } } }),

  P({ id: 'mi.c.state.human', no: 441, sec: 'mi.do.orders', size: 'small', tag: 'V', src: 'src: ',
    code: T(String.raw`
{"actor_state"
  {selector
    {tag @tag@}
    {type human}
  }
  {human
    {health @health@}
  }
}
`),
    f: { tag: tag('player_hero'), health: { k: 'number', def: 300, min: 1, int: true } } }),

  P({ id: 'mi.c.state.extra', no: 442, sec: 'mi.do.orders', size: 'small', tag: 'V', src: 'src: ',
    code: T(String.raw`
{"actor_state"
  {selector
    {tag @tag@}
  }
  {unmasking "@unmasking@"}
}
`),
    f: { tag: tag('player_sniper'), unmasking: { k: 'text', def: 'ger-soldier' } } }),

  P({ id: 'mi.c.wait', no: 443, sec: 'mi.do.orders', size: 'small', tag: 'V', scope: ['in:commands'],
    src: 'map:map/single/01_usa-skirmish/05_usa-avalanche/0.mi:25223',
    code: T(String.raw`
{"wait"
  {time @time@}
}
`),
    f: { time: { k: 'seconds', def: 10, min: 0 } } }),

  P({ id: 'mi.c.board', no: 444, sec: 'mi.do.orders', size: 'small', tag: 'V', src: 'hurtgen:18534', lim: ['MIS-39'],
    code: T(String.raw`
{"board"
  {selector
    {amount 1}
    {tag @crew_tag@}
    {type human}
    {state operatable}
  }
  {vehicle
    {tag @vehicle_tag@}
  }
}
`),
    f: { crew_tag: tag('ecrew'), vehicle_tag: tag('egun_inhabited') } }),

  P({ id: 'mi.c.emit', no: 445, sec: 'mi.do.orders', size: 'small', tag: 'V', src: 'hurtgen:21884',
    code: T(String.raw`
{"emit"
  {selector
    {tag @tag@}
  }
  {drop orders}
  {waypoint "@waypoint@"}
  {emit
    {mode @mode@}
  }
}
`),
    f: { tag: tag('enemy_ht'), waypoint: wp('162'), mode: { k: 'choice', def: 'passengers', choices: ['passengers', 'crew', 'all'] } } }),

  P({ id: 'mi.c.air_attack', no: 446, sec: 'mi.do.orders', size: 'small', tag: 'V', src: 'overlord:23837',
    code: T(String.raw`
{"air_attack"
  {selector
    {tag @tag@}
  }
  {drop orders}
  {enemies
    {tag @target_tag@}
  }
  {clone}
  {attack_altitude @altitude@}
}
`),
    f: { tag: tag('player_bonus'), target_tag: tag('player_bonus_target'), altitude: { k: 'number', def: 20, min: 0 } } }),

  P({ id: 'mi.c.air_state', no: 447, sec: 'mi.do.orders', size: 'small', tag: 'V', scope: ['in:commands'],
    src: 'map:map/single/01_usa-skirmish/07_usa-normandy/0.mi:40429',
    code: T(String.raw`
{"air_state"
  {drop "orders sensor senseless"}
  {altitude @altitude@}
}
`),
    f: { altitude: { k: 'number', def: 80, min: 0 } } }),

  P({ id: 'mi.c.throw_off', no: 448, sec: 'mi.do.orders', size: 'small', tag: 'V', src: 'overlord:19920',
    code: T(String.raw`
{"throw_off"
  {selector
    {tag @tag@}
    {state linked}
  }
  {drop "orders sensor senseless"}
  {up @up@}
  {forward @forward@}
  {turn 0}
  {keep_orientation}
}
`),
    f: { tag: tag('player_hero'), up: { k: 'number', def: 3 }, forward: { k: 'number', def: 1 } } }),

  P({ id: 'mi.c.animation', no: 449, sec: 'mi.do.orders', size: 'small', tag: 'V', src: 'bocage:10369',
    code: T(String.raw`
{"animation"
  {selector
    {tag @tag@}
    {type human}
    {state "not dead"}
  }
  {drop orders}
  {collage @collage@}
  {cicledelay 0}
  {delay 0}
  {flags loop}
}
`),
    f: { tag: tag('enemy_officer'), collage: { k: 'anim', def: 'pose_watch_binocular' } } }),

  P({ id: 'mi.c.animate', no: 450, sec: 'mi.do.orders', size: 'small', tag: 'V', src: 'overlord:23851',
    code: T(String.raw`
{"animate"
  {selector
    {tag @tag@}
  }
  {animation @animation@}
  {speed @speed@}
}
`),
    f: { tag: tag('player_bonus'), animation: { k: 'anim', def: 'wheels' }, speed: { k: 'number', def: 1, min: 0 } } }),

  P({ id: 'mi.c.follow_anim', no: 451, sec: 'mi.do.orders', size: 'small', tag: 'T', src: 'src: ',
    code: T(String.raw`
{"follow_animation"
  {selector
    {tag @tag@}
  }
  {entity @entity@}
  {bone @bone@}
}
`),
    f: { tag: tag('player_hero'), entity: { k: 'number', def: 0, int: true, min: 0 }, bone: { k: 'bone', def: 'basis' } } }),

  P({ id: 'mi.c.manual_lock', no: 452, sec: 'mi.do.orders', size: 'small', tag: 'T', src: 'src: ',
    code: T(String.raw`
{"manual_lock"
  {selector
    {tag @tag@}
  }
  {lock @lock@}
}
`),
    f: { tag: tag('player_tankace'), lock: { k: 'choice', def: 'on', choices: ['on', 'off'] } } }),

  P({ id: 'mi.c.tpc', no: 453, sec: 'mi.do.orders', size: 'small', tag: 'V', src: 'dison:26672',
    code: T(String.raw`
{"third_person_control"
  {selector
    {tag @tag@}
  }
  {lock on}
  {position
    {linkBone basis}
    {offest
      {x @x@}
      {y 0}
      {z @z@}
    }
  }
  {clip
    {viewMin -45}
    {viewMax 15}
  }
  {zoom
    {min 0}
    {max @zoom_max@}
  }
}
`),
    f: { tag: tag('player_tankace'), x: { k: 'number', def: -75 }, z: { k: 'number', def: 75 }, zoom_max: { k: 'number', def: 350, min: 0 } } }),

  P({ id: 'mi.c.mine', no: 454, sec: 'mi.do.orders', size: 'small', tag: 'T', src: 'src: ',
    code: T(String.raw`
{"mine"
  {selector
    {tag @tag@}
    {type human}
    {state "not dead"}
  }
  {zone "@zone@"}
  {event "@event@"}
}
`),
    f: { tag: tag('engineer'), zone: { k: 'text', def: 'mine_zone' }, event: { k: 'event', def: 'zone_mined' } } }),

  P({ id: 'mi.c.mine_state', no: 455, sec: 'mi.do.orders', size: 'small', tag: 'T', src: 'src: ',
    code: T(String.raw`
{"mine_state"
  {selector
    {tag @tag@}
  }
  {action arm}
  {miner "@miner@"}
}
`),
    f: { tag: tag('road_mine'), miner: { k: 'number', def: 1, int: true, min: 0 } } }),

  P({ id: 'mi.c.entity_state', no: 456, sec: 'mi.do.units-and-tags', size: 'small', tag: 'V', src: 'hurtgen:13059',
    code: T(String.raw`
{"entity_state"
  {selector
    {tag @tag@}
  }
  {tag_add @tag_add@}
  {tag_remove @tag_remove@}
  {inactive off}
  {impregnability @impregnability@}
  {discovered on}
}
`),
    f: { tag: tag('reinf1'), tag_add: tag('attack_wave'), tag_remove: tag('hidden'),
      impregnability: { k: 'choice', def: 'disabled', choices: ['disabled', 'harmless', 'full'] } } }),

  P({ id: 'mi.c.ables', no: 457, sec: 'mi.do.units-and-tags', size: 'small', tag: 'V', src: 'hurtgen:18363',
    code: T(String.raw`
{"ables"
  {selector
    {tag @tag@}
  }
  {add @add@}
  {remove @remove@}
}
`),
    f: { tag: tag('enemy_ht'), add: { k: 'able', def: 'emit_passangers_on_enemy' }, remove: { k: 'able', def: 'select' } } }),

  P({ id: 'mi.c.player', no: 458, sec: 'mi.do.units-and-tags', size: 'small', tag: 'V', src: 'hurtgen:26897',
    code: T(String.raw`
{"player"
  {selector
    {tag @tag@}
  }
  {operation set}
  {player "@player@"}
}
`),
    f: { tag: tag('captured_tank'), player: { k: 'number', def: 2, int: true, min: 0 } } }),

  P({ id: 'mi.c.autoassign', no: 459, sec: 'mi.do.units-and-tags', size: 'small', tag: 'V', src: 'hurtgen:12858',
    code: T(String.raw`
{"autoassign"
  {selector
    {tag @tag@}
  }
}
`),
    f: { tag: tag('player_start') } }),

  P({ id: 'mi.c.linker', no: 460, sec: 'mi.do.units-and-tags', size: 'small', tag: 'V', src: 'overlord:19736',
    code: T(String.raw`
{"linker"
  {selector
    {tag @vehicle_tag@}
  }
  {action @action@}
  {entities
    {amount 1}
    {tag @unit_tag@}
    {type human}
    {state "not dead"}
  }
}
`),
    f: { vehicle_tag: tag('default_air'), action: { k: 'choice', def: 'link', choices: ['link', 'unlink'] }, unit_tag: tag('player_hero') } }),

  P({ id: 'mi.c.unlink', no: 461, sec: 'mi.do.units-and-tags', size: 'small', tag: 'V', src: 'dison:22179',
    code: T(String.raw`
{"unlink"
  {selector
    {tag @tag@}
    {type human}
    {state "not dead"}
  }
}
`),
    f: { tag: tag('player_infcrew') } }),

  P({ id: 'mi.c.placement', no: 462, sec: 'mi.do.units-and-tags', size: 'small', tag: 'V', src: 'dison:24903',
    code: T(String.raw`
{"placement"
  {selector
    {tag @tag@}
  }
  {target_waypoint "@waypoint@"}
}
`),
    f: { tag: tag('para_inf_drop'), waypoint: wp('194') } }),

  P({ id: 'mi.c.rt_function', no: 463, sec: 'mi.do.units-and-tags', size: 'small', tag: 'V', src: 'hurtgen:15940',
    code: T(String.raw`
{"rt_function"
  {selector
    {tag @tag@}
  }
  {call "AniPlay"
    {name @name@}
    {speed @speed@}
  }
}
`),
    f: { tag: tag('flag_a02_player'), name: { k: 'choice', def: 'up', choices: ['up', 'down'] }, speed: { k: 'number', def: 1, min: 0 } } }),

  P({ id: 'mi.c.squad_create', no: 464, sec: 'mi.do.squads', size: 'small', tag: 'V', src: 'bocage:10560',
    code: T(String.raw`
{"squad_create"
  {selector
    {tag @tag@}
  }
  {name @squad@}
}
`),
    f: { tag: tag('enemy_tank'), squad: { k: 'text', def: 'e_tank_squad' } } }),

  P({ id: 'mi.c.squad_to_wp', no: 465, sec: 'mi.do.squads', size: 'small', tag: 'V', src: 'bocage:10571',
    code: T(String.raw`
{"squad_to_waypoint"
  {squad @squad@}
  {waypoint "@waypoint@"}
}
`),
    f: { squad: { k: 'text', def: 'e_tank_squad' }, waypoint: wp('90') } }),

  P({ id: 'mi.c.squad_state', no: 466, sec: 'mi.do.squads', size: 'small', tag: 'V', src: 'bastogne:24191',
    code: T(String.raw`
{"squad_state"
  {squad @squad@}
  {guard @guard@}
  {movement
    {type normal}
  }
}
`),
    f: { squad: { k: 'text', def: 'officer_squad' }, guard: { k: 'choice', def: 'on', choices: ['on', 'off'] } } }),

  P({ id: 'mi.c.squad', no: 467, sec: 'mi.do.squads', size: 'small', tag: 'V', src: 'bastogne:24155',
    code: T(String.raw`
{"squad"
  {operation commander_set}
  {name @squad@}
  {selector
    {tag @tag@}
    {type human}
    {state "not dead"}
  }
}
`),
    f: { squad: { k: 'text', def: 'officer_squad' }, tag: tag('enemy_officer') } }),

  P({ id: 'mi.c.squad_dismiss', no: 468, sec: 'mi.do.squads', size: 'small', tag: 'V', src: 'bocage:10578',
    code: T(String.raw`
{"squad_dismiss"
  {squad @squad@}
}
`),
    f: { squad: { k: 'text', def: 'e_tank_squad' } } }),
];

module.exports = { group: 'mi-lang-3', pieces };

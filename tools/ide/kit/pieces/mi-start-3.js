// Code Pieces, group mi-start-3: placement keys of {Entity}/{Human} blocks and the {Helpers} blocks of a mission file
// (numbers 336 to 363; original rows 1.x).
// Format: tools/ide/README.md "tools/ide/kit"; contract: Every form was checked against the
// stock single-player missions (map.pak map/single/**/0.mi), for the engine-only keys, the cited the game.
// Author: Imperator_Aug (ARSENAL, ia-01abdd42)
'use strict';

// code is written with two-space indents below and turned into tabs here (String.raw keeps the backslashes)
const T = s => s.replace(/^\n/, '').replace(/\n$/, '').replace(/^((?: {2})+)/gm, m => '\t'.repeat(m.length / 2));
const base = { needs: [], lim: [], short: false, adv: false, wrap: false, task: null, since: '2026-11', kinds: ['mi'] };
const P = o => Object.assign({}, base, o);
const KEY = { sec: 'mi.start.placement-keys', size: 'line', role: 'data' };
const ENT = ['in:entity', 'in:human'];
const HUM = ['in:human'];
const HLP = ['in:helpers'];
const pos = def => ({ k: 'text', def });

module.exports = { group: 'mi-start-3', pieces: [
  // 336
  P(Object.assign({ id: 'mi.k.color', no: 336, tag: 'V', scope: ENT,
    code: '{Color @color@}',
    f: { color: { k: 'text', def: '0xff94aaaa' } },
    src: 'map/single/01_usa-skirmish/02b_usa-bastogne/0.mi:2226' }, KEY)),
  // 337
  P(Object.assign({ id: 'mi.k.disobst', no: 337, tag: 'V', scope: ENT,
    code: '{DisableObstacles}',
    src: 'map/single/01_usa-skirmish/01_usa-overlord/0.mi:1969' }, KEY)),
  // 338
  P(Object.assign({ id: 'mi.k.chassis', no: 338, tag: 'V', scope: ['in:entity'],
    code: '{Component "@part@" {State broken}}',
    f: { part: { k: 'text', def: 'engine' } },
    src: 'map/single/01_usa-skirmish/01b_usa-bocage/0.mi:1937-1942' }, KEY)),
  // 339
  P(Object.assign({ id: 'mi.k.maskplayer', no: 339, tag: 'V', scope: ENT,
    code: '{MaskPlayer @player@}',
    f: { player: { k: 'number', def: '1', min: 0, max: 15, int: true } },
    src: 'map/single/01_usa-skirmish/07_usa-normandy/0.mi:1968' }, KEY)),
  // 340
  P(Object.assign({ id: 'mi.k.nameid', no: 340, tag: 'V', scope: HUM,
    code: '{NameId @first@ @last@}',
    f: { first: { k: 'number', def: '90', min: 0, int: true }, last: { k: 'number', def: '1', min: 0, int: true } },
    src: 'map/single/01_usa-skirmish/00b_usa-hurtgen/0.mi:353' }, KEY)),
  // 341
  P(Object.assign({ id: 'mi.k.fsm', no: 341, tag: 'V', scope: HUM,
    code: '{FsmState "@pose@"}',
    f: { pose: { k: 'choice', def: 'stand', choices: ['stand', 'snipe', 'squat', 'lie'] } },
    src: 'map/single/01_usa-skirmish/00b_usa-hurtgen/0.mi:11' }, KEY)),
  // 342
  P(Object.assign({ id: 'mi.k.cover', no: 342, tag: 'V', scope: HUM,
    code: '{Cover {sector @spot@ {type "@type@"} {wall @wall@} {row 0}}}',
    f: { spot: pos('203.36 5297.82'), type: { k: 'choice', def: 'squat_lie', choices: ['squat_lie', 'snipe_cover'] },
      wall: pos('213.985 5302.33 204.238 5285.22') },
    src: 'map/single/01_usa-skirmish/00b_usa-hurtgen/0.mi:354-360' }, KEY)),
  // 343
  P(Object.assign({ id: 'mi.k.lastitem', no: 343, tag: 'V', scope: HUM,
    code: '{LastItem "@item@"}\n{LastThrowItem "@throw@"}',
    f: { item: { k: 'text', def: 'mauzer' }, throw: { k: 'text', def: 'm61 grenade' } },
    src: 'map/single/**/0.mi (LastItem 4055, LastThrowItem 221 uses)' }, KEY)),
  // 344
  P({ id: 'mi.h.event', no: 344, sec: 'mi.start.helpers', size: 'line', tag: 'V', scope: HLP, role: 'data',
    code: '{event "@name@"}',
    f: { name: { k: 'event', def: 'start' } },
    lim: ['MIS-85'], src: 'map/single/01_usa-skirmish/00b_usa-hurtgen/0.mi:12118' }),
  // 345
  P({ id: 'mi.h.event.delayed', no: 345, sec: 'mi.adv', size: 'line', tag: 'T', adv: true, scope: HLP, role: 'data',
    code: '{event delayed "@name@" @flag@ @seconds@}',
    f: { name: { k: 'event', def: 'reinforce' }, flag: { k: 'choice', def: '1', choices: ['1', '0'] },
      seconds: { k: 'seconds', def: '30', min: 0 } },
    src: ',96' }),
  // 346
  P({ id: 'mi.h.zone.circle', no: 346, sec: 'mi.start.helpers', size: 'small', tag: 'V', scope: HLP, role: 'block',
    code: T(String.raw`
{zone "circle"
  {position @pos@}
  {Name "@name@"}
  {Radius @radius@}
}
`),
    f: { pos: pos('10.0798 -6.74158 122'), name: { k: 'text', def: 'flag_a02' }, radius: { k: 'units', def: '240', min: 1 } },
    src: 'map/single/01_usa-skirmish/00b_usa-hurtgen/0.mi:12208-12212' }),
  // 347
  P({ id: 'mi.h.zone.poly', no: 347, sec: 'mi.start.helpers', size: 'small', tag: 'V', scope: HLP, role: 'block',
    code: T(String.raw`
{zone "poly"
  {position @pos@}
  {Name "@name@"}
  {Point @p1@}
  {Point @p2@}
  {Point @p3@}
  {Point @p4@}
}
`),
    f: { pos: pos('0.898438 -3223.31 192.99'), name: { k: 'text', def: 'vehicle_move_del' },
      p1: pos('-2146.92 -1496.31'), p2: pos('-2185.4 1483.91'), p3: pos('2157.92 1454.31'), p4: pos('2174.4 -1441.92') },
    src: 'map/single/01_usa-skirmish/00b_usa-hurtgen/0.mi:12270-12277' }),
  // 348
  P({ id: 'mi.waypoints', no: 348, sec: 'mi.start.helpers', size: 'small', tag: 'V', scope: HLP, role: 'block',
    code: T(String.raw`
{waypoints "@group@"
  {"@id@"
    {position @pos@}
  }
  {"@id_2@"
    {position @pos_2@}
  }@^@
}
`),
    f: { group: { k: 'text', def: 'player' }, id: { k: 'text', def: '0' }, pos: pos('-106.177 -2376.4 162.357'),
      id_2: { k: 'text', def: '1' }, pos_2: pos('-116.194 -2431.37 167.518') },
    src: 'map/single/01_usa-skirmish/00b_usa-hurtgen/0.mi:31062-31068' }),
  // 349
  P({ id: 'mi.h.wp.radius', no: 349, sec: 'mi.start.helpers', size: 'line', tag: 'V', scope: ['in:*'], role: 'data',
    code: '{radius @radius@}',
    f: { radius: { k: 'units', def: '150', min: 1 } },
    src: 'map/single/01_usa-skirmish/00b_usa-hurtgen/0.mi:31091' }),
  // 350
  P({ id: 'mi.h.wp.offsetz', no: 350, sec: 'mi.start.helpers', size: 'line', tag: 'V', scope: ['in:*'], role: 'data',
    code: '{offsetz @height@}',
    f: { height: { k: 'units', def: '200' } },
    src: 'map/single/01_usa-skirmish/02b_usa-bastogne/0.mi:25640' }),
  // 351
  P({ id: 'mi.h.wp.transition', no: 351, sec: 'mi.start.helpers', size: 'line', tag: 'V', scope: ['in:*'], role: 'data',
    code: '{transition "@next@"}',
    f: { next: { k: 'text', def: '25' } },
    src: 'map/single/01_usa-skirmish/04_usa-philippines/0.mi:37940' }),
  // 352
  P({ id: 'mi.h.wp.commands', no: 352, sec: 'mi.start.helpers', size: 'small', tag: 'V', scope: ['in:*'], role: 'block',
    code: T(String.raw`
{commands
  {"actor_to_cover"
    {drop orders}
    {covers @cover@}
  }@^@
}
`),
    f: { cover: { k: 'tag', def: 'startcoverleft' } },
    src: 'map/single/01_usa-skirmish/00b_usa-hurtgen/0.mi:31089-31097' }),
  // 353
  P({ id: 'mi.h.wp.engine', no: 353, sec: 'mi.adv', size: 'line', tag: 'T', adv: true, scope: ['in:*'], role: 'data',
    code: '{transition "@next@" {filter {tag "@tag@"}} {weight @weight@}}',
    f: { next: { k: 'text', def: '25' }, tag: { k: 'tag', def: 'tanks' }, weight: { k: 'number', def: '2', min: 0, int: true } },
    src: '' }),
  // 354
  P({ id: 'mi.h.reinf', no: 354, sec: 'mi.start.helpers', size: 'medium', tag: 'V', scope: HLP, role: 'block',
    code: T(String.raw`
{reinforcements
  {scoreTotal @total@}
  {scoreCurrent @current@}
  {"@name@"
    {state hidden}
    {text "$/@text@"}
    {image "@image@"}
    {hint "$/@hint@"}
    {count @count@}
    {score @score@}
    {delay @delay@}
    {eventStart "@event@"}
    {waypoint "@waypoint@"}
  }@^@
}
`),
    f: { total: { k: 'number', def: '2000', min: 0, int: true }, current: { k: 'number', def: '0', min: 0, int: true },
      name: { k: 'text', def: 'player_infantry' }, text: { k: 'text', def: 'reinf_01' },
      image: { k: 'text', def: 'riflemans(usa)' }, hint: { k: 'text', def: 'reinf_01' },
      count: { k: 'number', def: '-1', min: -1, int: true }, score: { k: 'number', def: '150', min: 0, int: true },
      delay: { k: 'seconds', def: '20', min: 0 }, event: { k: 'event', def: 'player_infantry' },
      waypoint: { k: 'text', def: '0' } },
    src: 'map/single/01_usa-skirmish/00b_usa-hurtgen/0.mi:12332-12355' }),
  // 355
  P({ id: 'mi.h.tasks', no: 355, sec: 'mi.start.helpers', size: 'small', tag: 'V', scope: HLP, role: 'block',
    code: T(String.raw`
{tasks
  {"@task@"
    {desc "$/@text@"}
    {primary}
    {state hidden}
    {point @point@}
  }@^@
}
`),
    f: { task: { k: 'text', def: 'defendbase' }, text: { k: 'text', def: 'mission_defendbase' },
      point: { k: 'tag', def: 'defendbase' } },
    src: 'map/single/01_usa-skirmish/00b_usa-hurtgen/0.mi:12278-12284' }),
  // 356
  P({ id: 'mi.h.cameras', no: 356, sec: 'mi.start.helpers', size: 'medium', tag: 'V', scope: HLP, role: 'block',
    code: T(String.raw`
{cameras
  {"@path@"
    {"key000"
      {position @pos@}
      {look_at @look@}
      {fov @fov@}
    }
    {"key001"
      {time @time@}
      {position @pos_2@}
      {look_at @look_2@}
      {fov @fov_2@}
    }@^@
  }
}
`),
    f: { path: { k: 'text', def: 'startview2' },
      pos: pos('-117.084 6284.3 210.658'), look: pos('-1.61496 6007.47 0'), fov: { k: 'number', def: '65', min: 1, max: 170 },
      time: { k: 'seconds', def: '3', min: 0 },
      pos_2: pos('10.4715 6098.45 248.487'), look_2: pos('5.92384 5664.58 0'), fov_2: { k: 'number', def: '65', min: 1, max: 170 } },
    src: 'map/single/01_usa-skirmish/00b_usa-hurtgen/0.mi:12642-12660' }),
  // 357
  P({ id: 'mi.h.cam.engine', no: 357, sec: 'mi.adv', size: 'line', tag: 'T', adv: true, scope: ['in:*'], role: 'data',
    code: '{pause @pause@} {ease_from @ease_from@} {ease_to @ease_to@} {tension @tension@}',
    f: { pause: { k: 'seconds', def: '2', min: 0 }, ease_from: { k: 'number', def: '0.5', min: 0, max: 1 },
      ease_to: { k: 'number', def: '0.5', min: 0, max: 1 }, tension: { k: 'number', def: '1', min: 0 } },
    src: '' }),
  // 358
  P({ id: 'mi.h.vars', no: 358, sec: 'mi.start.helpers', size: 'small', tag: 'V', scope: HLP, role: 'block',
    code: T(String.raw`
{vars
  {"@var@"}
  {"@var_2@"}@^@
}
`),
    f: { var: { k: 'text', def: 'player_score' }, var_2: { k: 'text', def: 'enemy_wave' } },
    src: 'map/single/01_usa-skirmish/00b_usa-hurtgen/0.mi:12760-12766' }),
  // 359
  P({ id: 'mi.h.options', no: 359, sec: 'mi.start.helpers', size: 'small', tag: 'V', scope: HLP, role: 'block',
    code: T(String.raw`
{mission_options
  {"@option@"}
  {"@option_2@"}@^@
}
`),
    f: { option: { k: 'text', def: 'mission_option1' }, option_2: { k: 'text', def: 'mission_option2' } },
    src: 'map/single/01_usa-skirmish/02b_usa-bastogne/0.mi:9441-9446' }),
  // 360
  P({ id: 'mi.h.modifiers', no: 360, sec: 'mi.adv', size: 'small', tag: 'V', adv: true, scope: HLP, role: 'block',
    code: T(String.raw`
{modifiers
  {"file"
    {name "@file@"}
  }
}
`),
    f: { file: { k: 'path', def: 'heroic_ai_range.mod' } },
    src: 'map/single/01_usa-skirmish/01b_usa-bocage/0.mi:26512-26516' }),
  // 361
  P({ id: 'mi.h.functions', no: 361, sec: 'mi.adv', size: 'small', tag: 'V', adv: true, scope: HLP, role: 'block',
    code: T(String.raw`
{functions
  {"@name@"
    {"effect"
      {effect @effect@}
    }@^@
  }
}
`),
    f: { name: { k: 'text', def: 'tear_turret' }, effect: { k: 'effect', def: 'tear_turret' } },
    src: 'map/single/01_usa-skirmish/06_usa-dison/0.mi:9142-9148' }),
  // 362
  P({ id: 'mi.h.triggers', no: 362, sec: 'mi.start.helpers', size: 'small', tag: 'V', scope: HLP, role: 'block',
    code: T(String.raw`
{triggers
  {"@name@"
    {condition}
    {actions
      {"delay" {time @seconds@}}@^@
    }
  }
}
`),
    f: { name: { k: 'text', def: 'start' }, seconds: { k: 'seconds', def: '1', min: 0 } },
    src: '; form map/single/01_usa-skirmish/00b_usa-hurtgen/0.mi (triggers)' }),
  // 363
  P({ id: 'mi.h.edifices', no: 363, sec: 'mi.adv', size: 'small', tag: 'T', adv: true, scope: HLP, role: 'block',
    code: T(String.raw`
{edifice
  {"@name@"
    {entities @ids@}
  }@^@
}
`),
    f: { name: { k: 'text', def: 'house_1' }, ids: { k: 'text', def: '0x703a 0x7057' } },
    src: '; form map/multi/1v1_frozen_river/map (Helpers)' }),
] };

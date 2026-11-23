// Code Pieces, group mi-start-2: top blocks and placement keys of mission files (.mi), numbers 307 to 335 of
// (original list 1.2 to 1.4).
// Format: tools/ide/README.md "tools/ide/kit"; contract:
// Every code block was checked against the cited vanilla lines (resource/map/** in the game paks, read through
// tools/lib/vfs). Short names: hurtgen = map/single/01_usa-skirmish/00b_usa-hurtgen/0.mi,
// road = map/multi/1v1_road/combat.mi, argentan = map/multi/1v1_argentan/battle_zones.mi.
// Author: Imperator_Aug (ARSENAL, ia-35fba267)
'use strict';

// code is written with two-space indents below and turned into tabs here (String.raw keeps the backslashes)
const T = s => s.replace(/^\n/, '').replace(/\n$/, '').replace(/^((?: {2})+)/gm, m => '\t'.repeat(m.length / 2));
const base = { needs: [], lim: [], short: false, adv: false, wrap: false, task: null, since: '2026-11', kinds: ['mi'] };
const P = o => Object.assign({}, base, o);
const MI = ['in:mission'];
const ENT = ['in:entity', 'in:human'];

const num = (def, more) => Object.assign({ k: 'number', def }, more || {});
const txt = def => ({ k: 'text', def });
const ID = def => ({ k: 'text', def });
const SIDE = def => ({ k: 'number', def, min: 0, max: 16, int: true });
const SEATS = ['driver', 'gunner', 'commander', 'charger', 'gunner2', 'seat1', 'seat2', 'seat3', 'seat4', 'seat5', 'seat6', 'attach'];

const DIP17 = ['1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0'].concat(Array(16).fill('0 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1'));

module.exports = { group: 'mi-start-2', pieces: [
  P({ id: 'mi.top.mission', no: 307, sec: 'mi.start.top-blocks', size: 'small', tag: 'V',
    scope: ['top'], role: 'block',
    code: '{mission\n\t@^@\n}',
    f: {}, lim: ['MAP-21'], src: 'hurtgen:1' }),

  P({ id: 'mi.entity', no: 308, sec: 'mi.start.placement', size: 'small', tag: 'V',
    scope: MI, role: 'data',
    code: T(String.raw`
{Entity "@def@" @id@
  {Position @x@ @y@}
  {xform zl @angle@}
  {Player @player@}
  {MID @mid@}
}`),
    f: { def: { k: 'entity', def: 'sdkfz251_1' }, id: ID('0x80d6'), x: num('-775.62'), y: num('6858.02'),
      angle: num('66.92', { min: -360, max: 360 }), player: SIDE('1'), mid: num('66', { min: 0, int: true }) },
    lim: ['MAP-24', 'MAP-25', 'MAP-35', 'MIS-39', 'TST-85'], src: 'argentan:2' }),

  P({ id: 'mi.human', no: 309, sec: 'mi.start.placement', size: 'small', tag: 'V',
    scope: MI, role: 'data',
    code: T(String.raw`
{Human "@breed@" @id@
  {Position @x@ @y@}
  {xform zl @angle@}
  {Player @player@}
  {MID @mid@}
}`),
    f: { breed: { k: 'entity', def: 'mp/usa/rifle' }, id: ID('0xd000'), x: num('-2499.41'), y: num('5752.57'),
      angle: num('-76.95', { min: -360, max: 360 }), player: SIDE('2'), mid: num('1', { min: 0, int: true }) },
    src: 'hurtgen:2' }),

  P({ id: 'mi.spawnpoint', no: 310, sec: 'mi.start.placement', size: 'medium', tag: 'V',
    scope: MI, role: 'data',
    code: T(String.raw`
{Entity "map_point" @id@
  {Position @x@ @y@}
  {xform zl @angle@}
  {Extender "map_point"
    {name @name@}
    {team @team@}
    {phase @phase@}
    {order @order@}
    {visor SpawnPoint}
  }
  {Player 0}
  {MID @mid@}
}`),
    f: { id: ID('0xc000'), x: num('-2829.61'), y: num('-861.58'), angle: num('-1.77', { min: -360, max: 360 }),
      name: txt('b1'), team: { k: 'choice', def: 'b', choices: ['a', 'b'] }, phase: num('0', { min: 0, int: true }),
      order: num('1', { min: 1, int: true }), mid: num('1', { min: 0, int: true }) },
    lim: ['MAP-20'], src: 'road:2-14' }),

  P({ id: 'mi.flagpoint', no: 311, sec: 'mi.start.placement', size: 'medium', tag: 'V',
    scope: MI, role: 'data',
    code: T(String.raw`
{Entity "@def@" @id@
  {Position @x@ @y@}
  {xform scale 0.75}
  {Extender "map_point"
    {name @name@}
    {zoneA @zone_a@}
    {zoneB @zone_b@}
    {phase @phase@}
    {order @order@}
    {show All}
    {visor MapPoint}
  }
  {Player 0}
  {MID @mid@}
}`),
    f: { def: { k: 'choice', def: 'flag_point_1', choices: ['flag_point_1', 'flag_point_2', 'flag_point_3'] }, id: ID('0x802f'),
      x: num('-183.5'), y: num('304.88'), name: txt('f1'), zone_a: num('12', { min: 1 }), zone_b: num('12', { min: 1 }),
      phase: num('0', { min: 0, int: true }), order: num('1', { min: 1, int: true }), mid: num('48', { min: 0, int: true }) },
    lim: ['MAP-20', 'MAP-34'], src: 'map/multi/1v1_road/battle_zones.mi:2-16' }),

  P({ id: 'mi.tag', no: 312, sec: 'mi.start.placement', size: 'line', tag: 'V',
    scope: MI, role: 'data',
    code: '{Tags "@tag@" "@tag2@" @id@}',
    f: { tag: { k: 'tag', def: 'my_tag' }, tag2: { k: 'tag', def: 'my_group' }, id: ID('0xc004') },
    src: 'road:66' }),

  P({ id: 'mi.brain', no: 313, sec: 'mi.start.placement', size: 'small', tag: 'V',
    scope: MI, role: 'data',
    code: T(String.raw`
{Brain @id@
  {Properties
    {control @control@}
    {move_mode @move@}
  }
}`),
    f: { id: ID('0xd000'), control: { k: 'choice', def: 'user', choices: ['user', 'AI'] },
      move: { k: 'choice', def: 'hold', choices: ['hold', 'free', 'zone'] } },
    src: 'map/multi/1v1_winter_harbor/battle_zones.mi:132' }),

  P({ id: 'mi.inventory', no: 314, sec: 'mi.start.placement', size: 'small', tag: 'V',
    scope: MI, role: 'data',
    code: T(String.raw`
{Inventory @id@
  {box
    {clear}
    {item "@item@" {cell @col@ @row@}}
    {item "@hat@" {cell 3 0}{user "head"}}
  }
}`),
    f: { id: ID('0x829e'), item: { k: 'entity', def: 'b33r' }, col: num('0', { min: 0, int: true }), row: num('0', { min: 0, int: true }),
      hat: { k: 'entity', def: 'winterhat' } },
    src: 'hurtgen:5072-5078' }),

  P({ id: 'mi.link', no: 315, sec: 'mi.start.placement', size: 'line', tag: 'V',
    scope: MI, role: 'data',
    code: '{Link @man@ {@vehicle@ "@seat@"}}',
    f: { man: ID('0xc025'), vehicle: ID('0x80d6'), seat: { k: 'choice', def: 'driver', choices: SEATS } },
    lim: ['MIS-39'], src: 'hurtgen:4441' }),

  P({ id: 'mi.env', no: 316, sec: 'mi.start.top-blocks', size: 'line', tag: 'V',
    scope: MI, role: 'data',
    code: '{Environment "@env@"}',
    f: { env: { k: 'text', def: 'multi/multi_01' } },
    src: 'argentan:167' }),

  P({ id: 'mi.helpers', no: 317, sec: 'mi.start.top-blocks', size: 'small', tag: 'I',
    scope: MI, role: 'block',
    code: T(String.raw`
{Helpers
  {event "@event@"}
  {zone "circle"
    {position @x@ @y@ 0}
    {Name "@zone@"}
    {Radius @radius@}
  }
  {vars
    {"@var@"}
  }
  {triggers
    @^@
  }
}`),
    f: { event: { k: 'event', def: 'start' }, x: num('0'), y: num('0'), zone: txt('my_zone'), radius: { k: 'units', def: '240', min: 1 },
      var: txt('my_var') },
    lim: ['MIS-01'], src: 'src: ' }),

  P({ id: 'mi.players.sp', no: 318, sec: 'mi.start.top-blocks', size: 'medium', tag: 'V',
    scope: MI, role: 'data',
    code: T(String.raw`
{Players
  {user @user@}
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
}`),
    f: { user: SIDE('0') },
    lim: ['MAP-14'], src: 'hurtgen:33344-33360' }),

  P({ id: 'mi.players.mp', no: 319, sec: 'mi.start.top-blocks', size: 'medium', tag: 'V',
    scope: MI, role: 'data',
    code: '{Players\n\t{count 17}\n\t{diplomacy\n' + DIP17.map(r => '\t\t' + r).join('\n') + '\n\t}\n}',
    f: {}, lim: ['MAP-14'], src: 'road:386-406' }),

  P({ id: 'mi.fog', no: 320, sec: 'mi.start.top-blocks', size: 'line', tag: 'V',
    scope: MI, role: 'data',
    code: '{Fog @fog@}',
    f: { fog: { k: 'choice', def: '1', choices: ['1', '0'] } },
    src: 'argentan:504' }),

  P({ id: 'mi.entman', no: 321, sec: 'mi.start.top-blocks', size: 'small', tag: 'V',
    scope: MI, role: 'data',
    code: '{EntityManager {Enabled}\n\t{CountScale "@scale@"}\n}',
    f: { scale: txt('x0.5') },
    src: 'road:409-411' }),

  P({ id: 'mi.covers', no: 322, sec: 'mi.adv', size: 'small', tag: 'V', adv: true,
    scope: MI, role: 'data',
    code: T(String.raw`
{Covers
  {Sector
    {Automatic @cover@ @cx@ @cy@}
    {Name "@name@"}
  }
}`),
    f: { cover: ID('0x38e7'), cx: num('0.403515'), cy: num('-13.1903'), name: txt('startcoverleft') },
    src: 'hurtgen:33364' }),

  P({ id: 'mi.k.position', no: 323, sec: 'mi.start.placement-keys', size: 'line', tag: 'V',
    scope: ENT, role: 'data',
    code: '{Position @x@ @y@}',
    f: { x: num('-2147.26'), y: num('207.18') },
    lim: ['MAP-25'], src: 'hurtgen:3' }),

  P({ id: 'mi.k.xform', no: 324, sec: 'mi.start.placement-keys', size: 'line', tag: 'V',
    scope: ENT, role: 'data',
    code: '{xform zl @angle@}',
    f: { angle: num('-91.67', { min: -360, max: 360 }) },
    src: 'hurtgen:4' }),

  P({ id: 'mi.k.player', no: 325, sec: 'mi.start.placement-keys', size: 'line', tag: 'V',
    scope: ENT, role: 'data',
    code: '{Player @player@}',
    f: { player: SIDE('1') },
    lim: ['TST-85'], src: 'hurtgen:7' }),

  P({ id: 'mi.k.mid', no: 326, sec: 'mi.start.placement-keys', size: 'line', tag: 'V',
    scope: ENT, role: 'data',
    code: '{MID @mid@}',
    f: { mid: num('54', { min: 0, int: true }) },
    lim: ['MIS-86'], src: 'hurtgen:8' }),

  P({ id: 'mi.k.extender', no: 327, sec: 'mi.start.placement-keys', size: 'line', tag: 'V',
    scope: ['in:entity'], role: 'data',
    code: '{Extender "speaker"\n\t{SoundName "@sound@"}\n}',
    f: { sound: { k: 'sound', def: 'world/skirmish_environment/open_ground_day1' } },
    src: 'road:60-62' }),

  P({ id: 'mi.k.texmod', no: 328, sec: 'mi.start.placement-keys', size: 'line', tag: 'V',
    scope: ENT, role: 'data',
    code: '{TexMod "@tex@"}',
    f: { tex: { k: 'choice', def: 'win', choices: ['1', '2', '3', 'd', 'win', 'ger', 'usa', 'rus', 'eng', 'jap'] } },
    src: 'hurtgen:274' }),

  P({ id: 'mi.k.impreg', no: 329, sec: 'mi.start.placement-keys', size: 'line', tag: 'V',
    scope: ENT, role: 'data',
    code: '{Impregnability @mode@}',
    f: { mode: { k: 'choice', def: 'full', choices: ['full', 'harmless'] } },
    src: 'hurtgen:6' }),

  P({ id: 'mi.k.fog', no: 330, sec: 'mi.start.placement-keys', size: 'line', tag: 'V',
    scope: ENT, role: 'data',
    code: '{SpawnedInFog}',
    f: {}, src: 'hurtgen:5' }),

  P({ id: 'mi.k.placer', no: 331, sec: 'mi.start.placement-keys', size: 'line', tag: 'V',
    scope: ['in:entity'], role: 'data',
    code: '{Placer\n\t{State "@seat@" {@state@}}\n}',
    f: { seat: { k: 'choice', def: 'seat1', choices: SEATS.concat(['driver1', 'driver2', 'side_pointer']) },
      state: { k: 'choice', def: 'Disable', choices: ['Disable', 'Broken'] } },
    src: 'hurtgen:4426-4431' }),

  P({ id: 'mi.k.area', no: 332, sec: 'mi.start.placement-keys', size: 'line', tag: 'V',
    scope: ['in:entity'], role: 'data',
    code: '{AreaDisable "@area@"}',
    f: { area: { k: 'choice', def: 'close', choices: ['close', 'openl', 'openr'] } },
    src: 'hurtgen:4437' }),

  P({ id: 'mi.k.volume', no: 333, sec: 'mi.start.placement-keys', size: 'line', tag: 'V',
    scope: ['in:entity'], role: 'data',
    code: '{Volume "@volume@"\n\t{able {visible 0}{bullet 0}{obstacle 0}{contact 0}{contact_ground 0}{blast 0}{select 0}{touch 0}}\n}',
    f: { volume: txt('ram') },
    src: 'map/**/*.mi {Volume "ram"} (622 blocks)' }),

  P({ id: 'mi.k.able', no: 334, sec: 'mi.start.placement-keys', size: 'line', tag: 'V',
    scope: ENT, role: 'data',
    code: '{Able "@able@"}',
    f: { able: { k: 'able', def: '-emit_passangers_on_enemy' } },
    src: 'hurtgen:9' }),

  P({ id: 'mi.k.constrain', no: 335, sec: 'mi.start.placement-keys', size: 'line', tag: 'I',
    scope: ['in:entity'], role: 'data',
    code: '{Constrain @mode@}',
    f: { mode: { k: 'choice', def: 'surface', choices: ['surface', 'none', 'water', 'zero'] } },
    src: 'map/**/*.mi {Constrain surface} (115 blocks)' }),
] };

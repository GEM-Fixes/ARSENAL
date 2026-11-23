// Code Pieces, group mi-lang-2: mission language part 2: condition
// terms seen only in the engine, unit selectors (standard and advanced), filter terms, the drop field and the first
// orders. Format: tools/ide/README.md "tools/ide/kit"; contract:
// Checked against the vanilla .mi files (read through tools/lib/vfs) and the game in game/helper.
// Short names: hurtgen = map/single/01_usa-skirmish/00b_usa-hurtgen/0.mi.
// Terms carry their number as a fill-in (@n@): "1.linked" is term 1 of the trigger's {expression}.
// Author: Imperator_Aug (ARSENAL, ia-f99bcb05)
'use strict';

const base = { needs: [], lim: [], short: false, adv: false, wrap: false, task: null, since: '2026-11', kinds: ['mi'] };
const P = o => Object.assign({}, base, o);

// where a piece may drop (the head word of the innermost block around the drop place)
const TERMS = ['in:terms'];
const SEL = ['in:selector', 'in:units', 'in:actors', 'in:entity', 'in:source', 'in:destination', 'in:from_entities'];
const FILT = ['in:include', 'in:exclude'];
const GATH = ['in:select'];
const CMD = ['in:actions', 'in:commands', 'in:*'];

const N = { k: 'number', def: '1', min: 1, max: 99, int: true };
const PLAYER = { k: 'number', def: '1', min: 0, max: 16, int: true };
const STD_STATES = ['dead', 'not dead', 'operatable', 'not operatable', 'moveable', 'not moveable', 'inhabited', 'not inhabited'];
const FILTER_STATES = ['dead', 'not dead', 'operatable', 'not operatable', 'moveable', 'not moveable', 'chassis_work', 'inhabited',
  'not inhabited', 'inactive', 'not inactive', 'linked', 'not linked', 'user_control', 'fallen', 'examined', 'discovered',
  'in_squad', 'commander'];
const PARTS = ['engine', 'gun', 'turret', 'trackleft', 'trackright', 'track*', 'body'];

module.exports = { group: 'mi-lang-2', pieces: [
  // ---- condition terms (engine only, never in vanilla)
  P({ id: 'mi.t.linked', no: 399, sec: 'mi.if.terms', size: 'small', tag: 'T', adv: true, role: 'cond', scope: TERMS,
    code: '{"@n@.linked"\n\t{source\n\t\t{tag @unit@}\n\t}\n\t{destination\n\t\t{tag @host@}\n\t}\n}',
    f: { n: N, unit: { k: 'tag', def: 'crew' }, host: { k: 'tag', def: 'truck' } },
    src: 'src: ' }),

  P({ id: 'mi.t.mined', no: 400, sec: 'mi.if.terms', size: 'small', tag: 'T', adv: true, role: 'cond', scope: TERMS,
    code: '{"@n@.mined"\n\t{player "@player@"}\n\t{type @type@}\n\t{zone "@zone@"}\n\t{infill "@infill@"}\n}',
    f: { n: N, player: PLAYER, type: { k: 'choice', def: 'antitank', choices: ['antitank', 'antipersonnel'] },
      zone: { k: 'text', def: 'minefield' }, infill: { k: 'number', def: '50', min: 0, max: 100 } },
    src: 'src: ' }),

  P({ id: 'mi.t.camera', no: 401, sec: 'mi.if.terms', size: 'small', tag: 'T', adv: true, role: 'cond', scope: TERMS,
    code: '{"@n@.camera"\n\t{zone "@zone@"}\n\t{appearance @appearance@}\n\t{time @time@}\n\t{advanced\n\t\t{precision @precision@}\n\t}\n}',
    f: { n: N, zone: { k: 'text', def: 'gamezone' },
      appearance: { k: 'choice', def: 'visible', choices: ['invisible', 'partial', 'visible'] },
      time: { k: 'seconds', def: '2', min: 0 },
      precision: { k: 'choice', def: 'medium', choices: ['default', 'low', 'medium', 'high'] } },
    src: 'src: ,59-80' }),

  P({ id: 'mi.t.arrival', no: 402, sec: 'mi.if.terms', size: 'small', tag: 'T', adv: true, role: 'cond', scope: TERMS,
    code: '{"@n@.arrival"\n\t{include\n\t\t{tag\n\t\t\t{tag @tag@}\n\t\t}\n\t}\n}',
    f: { n: N, tag: { k: 'tag', def: 'scout' } },
    src: 'src: ' }),

  P({ id: 'mi.t.wp_canmove', no: 403, sec: 'mi.if.terms', size: 'small', tag: 'T', adv: true, role: 'cond', scope: TERMS,
    code: '{"@n@.waypoint_canmove"\n\t{who\n\t\t{type actor}\n\t\t{actors\n\t\t\t{tag @tag@}\n\t\t}\n\t}\n}',
    f: { n: N, tag: { k: 'tag', def: 'patrol' } },
    src: 'src: ; ' }),

  P({ id: 'mi.t.obsolete', no: 404, sec: 'mi.if.terms', size: 'line', tag: 'I', role: 'grammar', scope: ['in:condition'],
    code: '{term @n@ "event" {id "@event@"}}',
    f: { n: N, event: { k: 'event', def: 'final_clip' } },
    src: 'src: ' }),

  // ---- standard selector fields
  P({ id: 'mi.s.tag', no: 405, sec: 'mi.if.pick-units', size: 'line', tag: 'V', role: 'grammar', scope: SEL,
    code: '{tag @tag@}', f: { tag: { k: 'tag', def: 'enemy' } },
    src: 'map: hurtgen:20834; src: ' }),

  P({ id: 'mi.s.zone', no: 406, sec: 'mi.if.pick-units', size: 'line', tag: 'V', role: 'grammar', scope: SEL,
    code: '{zone "@zone@"}', f: { zone: { k: 'text', def: 'gamezone' } },
    src: 'src: ' }),

  P({ id: 'mi.s.type', no: 407, sec: 'mi.if.pick-units', size: 'line', tag: 'V', role: 'grammar', scope: SEL,
    code: '{type @type@}', f: { type: { k: 'choice', def: 'human', choices: ['human', 'auto', 'tank', 'vehicle'] } },
    src: 'src: ,162' }),

  P({ id: 'mi.s.state', no: 408, sec: 'mi.if.pick-units', size: 'line', tag: 'V', role: 'grammar', scope: SEL, lim: ['MIS-42'],
    code: '{state "@state@"}', f: { state: { k: 'choice', def: 'not dead', choices: STD_STATES } },
    src: 'src: ' }),

  P({ id: 'mi.s.player', no: 409, sec: 'mi.if.pick-units', size: 'line', tag: 'V', role: 'grammar', scope: SEL, lim: ['MIS-38'],
    code: '{player "@player@"}', f: { player: PLAYER },
    src: 'src: ' }),

  P({ id: 'mi.s.relation', no: 410, sec: 'mi.if.pick-units', size: 'line', tag: 'V', role: 'grammar', scope: SEL,
    code: '{relation @relation@}', f: { relation: { k: 'text', def: 'ally' } },
    src: 'src: ' }),

  P({ id: 'mi.s.amount', no: 411, sec: 'mi.if.pick-units', size: 'line', tag: 'V', role: 'grammar', scope: SEL,
    code: '{amount @amount@}', f: { amount: { k: 'number', def: '2', min: 1, int: true } },
    src: 'src: ' }),

  P({ id: 'mi.s.mids', no: 412, sec: 'mi.if.pick-units', size: 'line', tag: 'V', role: 'grammar', scope: SEL, lim: ['MIS-86'],
    code: '{mids @mids@}', f: { mids: { k: 'text', def: '20 167' } },
    src: 'src: ' }),

  P({ id: 'mi.s.icbu', no: 413, sec: 'mi.if.pick-units', size: 'line', tag: 'V', role: 'grammar', scope: SEL,
    code: '{ignore_captured_by_user 0}',
    src: 'src: ' }),

  P({ id: 'mi.s.source', no: 414, sec: 'mi.if.pick-units', size: 'line', tag: 'V', role: 'grammar', scope: SEL,
    code: '{source @source@}',
    f: { source: { k: 'choice', def: 'advanced', choices: ['standart', 'advanced', 'waypoint', 'current', 'local'] } },
    src: 'src: ' }),

  // ---- advanced selector
  P({ id: 'mi.s.group', no: 415, sec: 'mi.if.pick-units', size: 'medium', tag: 'V', role: 'grammar', scope: SEL, lim: ['MIS-53'],
    code: '{source advanced}\n{group\n\t{select\n\t\t{tag\n\t\t\t{tag @tag@}\n\t\t}\n\t}\n\t{include\n\t\t{zone\n\t\t\t{zone "@zone@"}\n\t\t}\n\t}\n\t{exclude\n\t\t{state\n\t\t\t{state dead}\n\t\t}\n\t}\n}',
    f: { tag: { k: 'tag', def: 'enemy' }, zone: { k: 'text', def: 'flag_a01_capture' } },
    src: 'map: hurtgen:15412-15439' }),

  P({ id: 'mi.s.sort', no: 416, sec: 'mi.if.pick-units', size: 'small', tag: 'V', role: 'grammar', scope: SEL,
    code: '{sort\n\t{type waypoint}\n\t{wpid "@waypoint@"}\n\t{mode @mode@}\n}',
    f: { waypoint: { k: 'text', def: '23' }, mode: { k: 'choice', def: 'farthest', choices: ['nearest', 'farthest'] } },
    src: 'src: ; vanilla {sort {type waypoint} {wpid "192"} {mode farthest}}' }),

  P({ id: 'mi.s.ex.zone_ex', no: 417, sec: 'mi.if.pick-units', size: 'line', tag: 'I', role: 'grammar', scope: GATH,
    code: '{zone_ex {zone "@zone@"}}\n{squad {name @squad@}}\n{id {id @id@}}\n{inventory_items {from_entities {tag @tag@}}}',
    f: { zone: { k: 'text', def: 'gamezone' }, squad: { k: 'text', def: 'e_tank_squad' },
      id: { k: 'text', def: '0xd000' }, tag: { k: 'tag', def: 'enemy' } },
    src: 'src: ; ' }),

  // ---- filter terms (in {include} or {exclude} of an advanced group)
  P({ id: 'mi.f.state', no: 418, sec: 'mi.if.pick-units', size: 'line', tag: 'V', role: 'grammar', scope: FILT,
    lim: ['MIS-49', 'MIS-55', 'MIS-57'],
    code: '{state {state "@state@"}}', f: { state: { k: 'choice', def: 'inactive', choices: FILTER_STATES } },
    src: 'src: ' }),

  P({ id: 'mi.f.tag', no: 419, sec: 'mi.if.pick-units', size: 'line', tag: 'V', role: 'grammar', scope: FILT,
    code: '{tag {tag @tag@}}', f: { tag: { k: 'tag', def: 'destroyed' } },
    src: 'src: ,528' }),

  P({ id: 'mi.f.prop', no: 420, sec: 'mi.if.pick-units', size: 'line', tag: 'V', role: 'grammar', scope: FILT,
    code: '{prop {prop @prop@}}',
    f: { prop: { k: 'choice', def: 'vehicle', choices: ['human', 'creature', 'car', 'tank', 'vehicle'] } },
    src: 'src: ,327' }),

  P({ id: 'mi.f.player', no: 421, sec: 'mi.if.pick-units', size: 'line', tag: 'V', role: 'grammar', scope: FILT,
    code: '{player {player "@player@"}}', f: { player: PLAYER },
    src: 'src: ' }),

  P({ id: 'mi.f.zone', no: 422, sec: 'mi.if.pick-units', size: 'line', tag: 'V', role: 'grammar', scope: FILT,
    code: '{zone {zone "@zone@"}}', f: { zone: { k: 'text', def: 'gamezone' } },
    src: 'src: ' }),

  P({ id: 'mi.f.cover', no: 423, sec: 'mi.if.pick-units', size: 'line', tag: 'V', role: 'grammar', scope: FILT,
    code: '{cover {name @cover@}}', f: { cover: { k: 'text', def: 'flag_a02' } },
    src: 'src: ,488' }),

  P({ id: 'mi.f.relation', no: 424, sec: 'mi.if.pick-units', size: 'line', tag: 'V', role: 'grammar', scope: FILT,
    code: '{relation {relation @relation@} {player "@player@"}}',
    f: { relation: { k: 'text', def: 'ally' }, player: Object.assign({}, PLAYER, { def: '2' }) },
    src: 'src: ' }),

  P({ id: 'mi.f.broken', no: 425, sec: 'mi.if.pick-units', size: 'line', tag: 'V', role: 'grammar', scope: FILT, lim: ['MIS-56'],
    code: '{broken_components {masks "@part@"}}', f: { part: { k: 'choice', def: 'engine', choices: PARTS } },
    src: 'src: ' }),

  P({ id: 'mi.f.destroyed', no: 426, sec: 'mi.if.pick-units', size: 'line', tag: 'I', role: 'grammar', scope: FILT,
    lim: ['MIS-58', 'MIS-59'],
    code: '{destroyed_components {masks "@part@"}}', f: { part: { k: 'choice', def: 'body', choices: PARTS } },
    src: 'src: ' }),

  P({ id: 'mi.f.with_item', no: 427, sec: 'mi.if.pick-units', size: 'line', tag: 'V', role: 'grammar', scope: FILT,
    code: '{with_item {type amount} {item @item@} {min @min@}}',
    f: { item: { k: 'text', def: '"bullet88" "ap" "ammo"' }, min: { k: 'number', def: '1', min: 1, int: true } },
    src: 'src: ,366-373' }),

  P({ id: 'mi.f.mids', no: 428, sec: 'mi.if.pick-units', size: 'line', tag: 'V', role: 'grammar', scope: FILT,
    code: '{mids {mids @mids@}}', f: { mids: { k: 'text', def: '23' } },
    src: 'src: ' }),

  P({ id: 'mi.f.engine', no: 429, sec: 'mi.if.pick-units', size: 'line', tag: 'I', role: 'grammar', scope: FILT,
    code: '{discovered}\n{entity_stuff {id "@stuff@"}}\n{movement_type {type @move@}}\n{team {team @team@}}',
    f: { stuff: { k: 'text', def: 'repair_kit' },
      move: { k: 'choice', def: 'crawl', choices: ['normal', 'crawl', 'squat', 'swim', 'none'] },
      team: { k: 'text', def: 'a' } },
    src: 'src: ,356' }),

  P({ id: 'mi.s.drop', no: 430, sec: 'mi.if.pick-units', size: 'line', tag: 'V', role: 'grammar', scope: ['in:*'],
    code: '{drop @drop@}',
    f: { drop: { k: 'choice', def: 'orders', choices: ['orders', 'sensor', 'senseless', '"orders senseless"', '"orders sensor senseless"'] } },
    src: 'map: hurtgen:15440' }),

  // ---- first orders
  P({ id: 'mi.c.waypoint', no: 431, sec: 'mi.do.orders', size: 'small', tag: 'V', role: 'act', scope: CMD,
    code: '{"waypoint"\n\t{who\n\t\t{type actor}\n\t\t{actors\n\t\t\t{tag @tag@}\n\t\t}\n\t}\n\t{action\n\t\t{type start}\n\t\t{waypoint "@waypoint@"}\n\t\t{make_squad}\n\t}\n}',
    f: { tag: { k: 'tag', def: 'player_infantry' }, waypoint: { k: 'text', def: '74' } },
    src: 'map: hurtgen:12909; src: ' }),

  P({ id: 'mi.c.to_waypoint', no: 432, sec: 'mi.do.orders', size: 'small', tag: 'V', role: 'act', scope: CMD,
    lim: ['MIS-52', 'MIS-87'],
    code: '{"actor_to_waypoint"\n\t{selector\n\t\t{tag @tag@}\n\t\t{state "not dead"}\n\t}\n\t{drop orders}\n\t{waypoint "@waypoint@"}\n}',
    f: { tag: { k: 'tag', def: 'enemy' }, waypoint: { k: 'text', def: '21' } },
    src: 'map: hurtgen:15410-15441' }),

  P({ id: 'mi.c.to_cover', no: 433, sec: 'mi.do.orders', size: 'small', tag: 'V', role: 'act', scope: CMD,
    code: '{"actor_to_cover"\n\t{selector\n\t\t{tag @tag@}\n\t\t{type human}\n\t\t{state "not dead"}\n\t}\n\t{drop orders}\n\t{mode @mode@}\n\t{covers @covers@}\n}',
    f: { tag: { k: 'tag', def: 'unhold_iq' }, mode: { k: 'choice', def: 'random', choices: ['best', 'random'] },
      covers: { k: 'text', def: 'startcoverleft' } },
    src: 'map: hurtgen:20832; src: ' }),
] };

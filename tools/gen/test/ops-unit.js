// ops-unit: seeded-defect tests of lib/ops-unit.js (iblock macro preset army kit, card list, breed del + decl through a macro call,
// squad block/order/remove, bots fields). Each op: a wrong input is refused with its code and writes nothing; a good input's output
// re-parses (sdlwrite: closed, no strays; sdl.parseLines: no BRACES) with the changed value present, CRLF kept. Own fixture, no game.
// node ops-unit.js <work dir>   prints "OK name" / "FAIL name: why", exit 1 on a FAIL.
// Author: Imperator_Aug (ARSENAL, ia-23187db0)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const W = path.resolve(process.argv[2] || path.join(__dirname, 'work'), 'ops-unit'); fs.rmSync(W, { recursive: true, force: true }); fs.mkdirSync(W, { recursive: true });
const { Ctx } = require('../lib/ctx'), O = require('../lib/ops'), sdlwrite = require('../../lib/sdlwrite'), sdl = require('../../lib/sdl');
let bad = 0;
const ok = (name, c, why) => { console.log(c ? 'OK ' + name : 'FAIL ' + name + ': ' + (why || '')); if (!c) bad++; };

// ---- fixture: loose resource/ of a tiny AS2
const G = path.join(W, 'as2');
const put = (key, text) => { const f = path.join(G, key); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, Buffer.isBuffer(text) ? text : Buffer.from(text.replace(/\r?\n/g, '\r\n'), 'latin1')); };
put('resource/entity/-vehicle/tank_t/tank_t.def', `{game_entity
	("armor_medium" turret(52 52 52 20) body(45 45 45 22))
	("seat_human" place(seat1) bone(seat01))
	("seat_human" place(seat2) bone(seat02))
	("tank_trace" fx("tracks_mid") step(0.52) len(1.3))
	("burn" args 0.3 0.5)
	(include "/properties/selection/vehicle.inc" scale(1.2))
}
`);
put('resource/entity/-vehicle/tank_n/tank_n.def', '{game_entity\n\t{hp 1}\n}\n');
put('resource/properties/vehicle.ext', `(define "tank_trace" {trace fx(%fx) step(%step) len(%len)})
(define "tank_trace2" {trace2 %fx %step})
(define "tank_trace3" {trace3 %fx %width})
(define "seat_human" {seat %place %bone})
(define "burn" {burn %0 %1})
`);
put('resource/set/interaction_entity/tank.inc', `(define "t_sound" {x 1})
{"tank_t tank"
	("t_sound")
	("burn_by_engine" args 0.3)
}
{"tank_o tank"
	("t_sound")
}
`);
put('resource/set/multiplayer/games/presets_all.inc', `(define "standard_all"
	{common
		{unitset {value "all"}}
		{commandPoints "*=%cp"}
		{unitLimits "flamer=3;sniper_only=2"}
		{chargeFactors {value "hero=0.90;*=1.0;"}}
		{budgets
			{vehicle
				{resource {start %start} {finish 100}}
			}
		}
	}
)
`);
put('resource/set/multiplayer/games/frontline.set', '{presets\n\t{"vehicles"\n\t\t{teams\n\t\t\t{a {unitLimits "artillery=2"}}\n\t\t}\n\t}\n}\n');
put('resource/set/multiplayer/games/cooperative.set', '{x 1}\n');
put('resource/set/multiplayer/games/preset_alliances.inc', '{"axis"\n\t{title "mp/alliance/axis"}\n\t{armies "ger"}\n\t{icon "/interface/pages/multi/flag_axis"}\n}\n{"allies"\n\t{title "mp/alliance/allies"}\n\t{armies "rus"}\n}\n');
put('resource/set/multiplayer/armies/rus.set', '{army\n\t{id 2}\n\t{title "mp/army/rus"}\n\t{icon "/interface/pages/multi/flag_rus"}\n\t{appid_base 1}\n}\n');
put('resource/set/multiplayer/armies/ger.set', '{army\n\t{id 0}\n\t{title "mp/army/ger"}\n}\n');
put('resource/interface/pages/multi/flag_rus.tga', Buffer.from([0, 0, 2, 0, 0, 0, 0, 0, 0xff, 0x10]));
put('resource/set/multiplayer/units/common.set', ';SDL\n{units\n\t(include "soldiers.set")\n\t(include "squads.set")\n\t(include "vehicles.set")\n}\n');
put('resource/set/multiplayer/units/vehicles.set', '(define "v" {tags "%t %s"})\n\t(include "vehicles_ger.set")\n\t(include "vehicles_rus.set")\n');
put('resource/set/multiplayer/units/vehicles_ger.set', '{"tank_g" ("v" t(medium) s(ger)) {cost 300}}\n');
put('resource/set/multiplayer/units/vehicles_rus.set', '{"tank_t"            ("v" t(medium) s(rus) cp(15)) {level 1} {cost 350} {fore 1.0}}\n');
put('resource/set/multiplayer/units/soldiers.set', `(define "rifle"
    {tags   "rifle %side infantry man"}
    {cp     2.5}
    {score  0.50}
    {basic}
    {breed}
    {cw 1.0}
)
{"mp/rus/rifle" ("rifle" side(rus))}
{"mp/rus/squadleader" ("rifle" side(rus))}
`);
put('resource/set/multiplayer/units/squads.set', `(define "squad_with2types"
	{"%name(%side)" {charge %c} {content "mp/%side/%c1 mp/%side/%c2"} {tags "frontline_cp infantry %side %t"} {group "%g"} {button "%b"} {level %level} {cost %cost} {fore %f}}
)
("squad_with2types" side(rus) name(riflemans) c(30) g(squad_1) c1(squadleader:1) c2(rifle:5) b(squad1) t(all inf_only) level(1) cost(60) f(-1.0))
("squad_with2types" side(rus) name(guards) c(30) g(squad_1) c1(squadleader:1) c2(rifle:5) b(squad1) t(all inf_only) level(1) cost(80) f(-1.0))
`);
const breed = `{breed
	{perks
		{"health" "150%"
		}
		{"speed" 0.9
		}
	}
	{inventory
		{item "mosin" filled}
		{item "ammo rifle" 100}
		{item "grenade f1" 1}
		{item "sandbag_kit" 1}
		{in_hands 0}
	}
}
`;
for (const b of ['rifle', 'squadleader', 'mg', 'at', 'sniper']) put(`resource/set/breed/mp/rus/${b}.set`, breed);
// every item line form the engine reads: a count with a spread, named ammunition loaded, filled with rounds
put('resource/set/breed/mp/rus/para.set', `{breed
	{inventory
		{item "sten" filling "ammo smg" 32} ; loaded
		{item "ammo smg" 160}
		{item "grenade f1" 1.25 0.5}
		{item "grenade no69" 0.5 0.5}
		{item "ppsh41" 1 filled 35}
		{item "sandbag_kit"}
		{in_hands 0}
	}
}
`);
for (const s of ['rifle/mosin', 'smg/ppsh41', 'smg/sten', 'ammo/rifle.ammo', 'ammo/smg.ammo', 'grenade/01 grenade_ap/f1.grenade', 'grenade/no69.grenade', 'engineer/sandbag_kit']) put('resource/set/stuff/' + s, '{from "x"}\n');
put('resource/script/multiplayer/bot.data.lua', 'Purchases = {\n\t{priority = 1.0, min_income = 3.0, class = UnitClass.Infantry, unit = "riflemans(rus)"},\n\t{priority = 1.0, class = UnitClass.Tank, unit = "tank_t(rus)"}\n}\n');

// ---- helpers
const ctxOf = plan => new Ctx({ target: 'as64', game: G, out: path.join(W, 'out'), plan: !!plan });
const run = (fn, spec, plan) => { const c = ctxOf(plan); O[fn](c, spec); return c; };
const errs = c => Object.entries(c.rep.counts).filter(([k]) => !/^WARN_/.test(k)).reduce((a, [, n]) => a + n, 0);
const parsesClean = buf => {
  let t; try { t = sdlwrite.parse(buf); } catch (e) { return 'sdlwrite: ' + e.message; }
  let why = '';
  (function walk(n) { for (const k of n.items || []) { if (k.type === 'stray') why = 'stray ' + k.text + ' at ' + k.start; if (k.items && !k.closed) why = 'unclosed at ' + k.start; walk(k); } })(t.root);
  if (why) return why;
  const e = []; sdl.parseLines(buf.toString('latin1').split(/\r?\n/), (l, code, msg) => { if (code === 'BRACES') e.push(l + ' ' + msg); });
  if (e.length) return 'sdl: ' + e.join('; ');
  if (/[^\r]\n/.test(buf.toString('latin1')) || /^\n/.test(buf.toString('latin1'))) return 'bare LF';
  return '';
};
// a refusal: the code fired, nothing staged for writing
const refused = (name, fn, spec, code) => { const c = run(fn, spec); ok(name + ' -> ' + code, (c.rep.counts[code] || 0) >= 1 && c.dirty.size === 0, JSON.stringify(c.rep.counts) + ' dirty ' + [...c.dirty.keys()].join(' ')); };
// a good run: no error, each key re-parses, test(text of key) holds
const good = (name, fn, spec, checks, plan) => {
  const c = run(fn, spec, plan);
  ok(name + ': no error', errs(c) === 0, JSON.stringify(c.rep.counts));
  for (const [key, test] of Object.entries(checks)) {
    const b = c.read(key);
    if (!b) { ok(name + ': ' + key + ' written', false, 'not in the overlay'); continue; }
    const p = parsesClean(b); ok(name + ': ' + key.split('/').pop() + ' re-parses', !p, p);
    const s = b.toString('latin1'); ok(name + ': ' + key.split('/').pop() + ' has the change', test(s), s.slice(0, 600));
  }
  return c;
};
const K = { tank: 'resource/entity/-vehicle/tank_t/tank_t.def', inc: 'resource/set/interaction_entity/tank.inc', pre: 'resource/set/multiplayer/games/presets_all.inc', fl: 'resource/set/multiplayer/games/frontline.set', ally: 'resource/set/multiplayer/games/preset_alliances.inc', veh: 'resource/set/multiplayer/units/vehicles.set', sol: 'resource/set/multiplayer/units/soldiers.set', sq: 'resource/set/multiplayer/units/squads.set', bot: 'resource/script/multiplayer/bot.data.lua', rifle: 'resource/set/breed/mp/rus/rifle.set', para: 'resource/set/breed/mp/rus/para.set' };

// ---- iblock
refused('iblock like without a block', 'opIblock', { entity: 'tank_n', like: 'tank_x' }, 'GEN_IBLOCK_LIKE_MISSING');
refused('iblock entity has one', 'opIblock', { entity: 'tank_t', like: 'tank_o' }, 'GEN_IBLOCK_EXISTS');
refused('iblock same ids', 'opIblock', { entity: 'tank_t', like: 'tank_t' }, 'GEN_IBLOCK_ARGS');
refused('iblock unknown entity', 'opIblock', { entity: 'no_such', like: 'tank_t' }, 'GEN_SET_ENTITY_UNKNOWN');
good('iblock', 'opIblock', { entity: 'tank_n', like: 'tank_t' }, { [K.inc]: s => /\{"tank_t tank"[\s\S]*?\}\r\n\{"tank_n tank"\r\n\t\("t_sound"\)\r\n\t\("burn_by_engine" args 0\.3\)\r\n\}\r\n\{"tank_o tank"/.test(s) });

// ---- macro
refused('macro no such call', 'opMacro', { entity: 'tank_t', macro: 'nope', arg: 'x', value: 1 }, 'GEN_MACRO_NO_CALL');
refused('macro two calls, no match', 'opMacro', { entity: 'tank_t', macro: 'seat_human', arg: 'bone', value: 'b9' }, 'GEN_MACRO_AMBIGUOUS');
refused('macro missing named arg', 'opMacro', { entity: 'tank_t', macro: 'tank_trace', arg: 'width', value: 2 }, 'GEN_MACRO_ARG_MISSING');
refused('macro args count', 'opMacro', { entity: 'tank_t', macro: 'burn', arg: 'args', value: '0.1' }, 'GEN_MACRO_ARGC');
refused('macro rename undefined', 'opMacro', { entity: 'tank_t', macro: 'tank_trace', rename: 'tank_trace9' }, 'GEN_MACRO_UNDEFINED');
refused('macro rename param not given', 'opMacro', { entity: 'tank_t', macro: 'tank_trace', rename: 'tank_trace3' }, 'GEN_MACRO_PARAM_MISSING');
refused('macro no value', 'opMacro', { entity: 'tank_t', macro: 'tank_trace' }, 'GEN_MACRO_ARGS');
good('macro named', 'opMacro', { entity: 'tank_t', macro: 'tank_trace', arg: 'step', value: 0.7 }, { [K.tank]: s => s.includes('("tank_trace" fx("tracks_mid") step(0.7) len(1.3))') });
good('macro nested list arg (armor part)', 'opMacro', { entity: 'tank_t', macro: 'armor_medium', arg: 'turret', value: '60 52 52 20' }, { [K.tank]: s => s.includes('turret(60 52 52 20) body(45 45 45 22)') });
good('macro match', 'opMacro', { entity: 'tank_t', macro: 'seat_human', match: 'seat2', arg: 'bone', value: 'seat09' }, { [K.tank]: s => s.includes('place(seat2) bone(seat09)') && s.includes('place(seat1) bone(seat01)') });
good('macro args with _', 'opMacro', { entity: 'tank_t', macro: 'burn', arg: 'args', value: '_ 0.9' }, { [K.tank]: s => s.includes('("burn" args 0.3 0.9)') });
good('macro include arg', 'opMacro', { entity: 'tank_t', macro: 'include', arg: 'scale', value: 1.5 }, { [K.tank]: s => s.includes('vehicle.inc" scale(1.5))') });
good('macro rename', 'opMacro', { entity: 'tank_t', macro: 'tank_trace', rename: 'tank_trace2' }, { [K.tank]: s => s.includes('("tank_trace2" fx("tracks_mid") step(0.52) len(1.3))') });
{ const c = run('opMacro', { entity: 'tank_t', macro: 'tank_trace', arg: 'step', value: 0.7 }); ok('macro: other bytes kept', c.read(K.tank).toString('latin1').replace('step(0.7)', 'step(0.52)') === fs.readFileSync(path.join(G, K.tank), 'latin1')); }

// ---- preset
refused('preset unknown file', 'opPreset', { file: 'nope.inc', name: 'standard_all', set: { unitLimits: 'a=1' } }, 'GEN_PRESET_FILE_UNKNOWN');
refused('preset unknown name', 'opPreset', { file: 'presets_all.inc', name: 'nope', set: { unitLimits: 'a=1' } }, 'GEN_PRESET_NAME_UNKNOWN');
refused('preset unknown key', 'opPreset', { file: 'presets_all.inc', name: 'standard_all', set: { nokey: 1 } }, 'GEN_PRESET_KEY_UNKNOWN'); // GEN-FIX3: a key the format does not have (MIS-01)
refused('preset bad entry', 'opPreset', { file: 'presets_all.inc', name: 'standard_all', set: { unitLimits: 'flamer:2' } }, 'GEN_PRESET_VALUE');
good('preset list merge', 'opPreset', { file: 'presets_all.inc', name: 'standard_all', set: { unitLimits: 'flamer=2;-sniper_only;rifle=4', chargeFactors: 'rifle=0.5', 'budgets/vehicle/resource/start': 500 } },
  { [K.pre]: s => s.includes('{unitLimits "flamer=2;rifle=4"}') && s.includes('{value "hero=0.90;rifle=0.5;*=1.0;"}') && s.includes('{start 500}') && s.includes('{commandPoints "*=%cp"}') });
good('preset block form', 'opPreset', { file: 'frontline.set', name: 'vehicles', set: { 'teams/a/unitLimits': 'artillery=1' } }, { [K.fl]: s => s.includes('{unitLimits "artillery=1"}') });
{ const c = run('opPreset', { file: 'presets_all.inc', name: 'all', set: { unitLimits: 'ghost=1' } }); ok('preset tag no card has -> WARN_GEN_PRESET_TAG_UNUSED', c.rep.counts.WARN_GEN_PRESET_TAG_UNUSED === 1 && errs(c) === 0, JSON.stringify(c.rep.counts)); }

// ---- army
refused('army exists', 'opArmy', { tag: 'rus', like: 'ger' }, 'GEN_ARMY_EXISTS');
refused('army like missing', 'opArmy', { tag: 'fin', like: 'nope' }, 'GEN_ARMY_LIKE_MISSING');
refused('army id stock range', 'opArmy', { tag: 'fin', like: 'rus', id: 3 }, 'GEN_ARMY_ID_RANGE');
refused('army id reserved', 'opArmy', { tag: 'fin', like: 'rus', id: 100 }, 'GEN_ARMY_ID_RANGE');
refused('army bad tag', 'opArmy', { tag: 'Fin-1', like: 'rus' }, 'GEN_ARMY_ARGS');
refused('army unknown alliance', 'opArmy', { tag: 'fin', like: 'rus', alliance: 'nope' }, 'GEN_ARMY_ALLIANCE_UNKNOWN');
{
  const c = good('army', 'opArmy', { tag: 'fin', like: 'rus', title: 'Finland', icon_like: 'rus', alliance: 'axis' }, {
    'resource/set/multiplayer/armies/fin.set': s => s.includes('{id 6}') && s.includes('{title "mp/army/fin"}') && s.includes('flag_fin"') && !s.includes('appid_base'),
    [K.veh]: s => /\(include "vehicles_rus\.set"\)\r\n\t\(include "vehicles_fin\.set"\)/.test(s),
    [K.ally]: s => /\{armies "ger"\}\r\n\t\{armies "fin"\}/.test(s) && !/allies"[\s\S]*fin/.test(s) });
  ok('army: flag copied, text queued', !!c.read('resource/interface/pages/multi/flag_fin.tga') && c.texts.some(t => t.key === 'mp/army/fin' && t.text === 'Finland'));
  const c2 = ctxOf(); c2.write('resource/set/multiplayer/armies/swe.set', '{army\r\n\t{id 6}\r\n}\r\n'); O.opArmy(c2, { tag: 'fin', like: 'rus', id: 6 });
  ok('army id used -> GEN_ARMY_ID_USED', c2.rep.counts.GEN_ARMY_ID_USED === 1 && c2.dirty.size === 1);
}

// ---- kit
refused('kit unknown breed', 'opKit', { breed: 'rus/nope', add: ['mosin'] }, 'GEN_KIT_BREED_UNKNOWN');
refused('kit unknown item', 'opKit', { breed: 'rus/rifle', add: ['laser_gun'] }, 'GEN_KIT_ITEM_UNKNOWN');
refused('kit item there', 'opKit', { breed: 'rus/rifle', add: ['grenade f1'] }, 'GEN_KIT_ITEM_EXISTS');
good('kit count in place', 'opKit', { breed: 'rus/rifle', add: [{ item: 'grenade f1', count: 3 }] }, { [K.rifle]: s => s.includes('{item "grenade f1" 3}') && (s.match(/grenade f1/g) || []).length === 1 && s.includes('{in_hands 0}') });
refused('kit del absent', 'opKit', { breed: 'rus/rifle', del: ['ppsh41'] }, 'GEN_KIT_ITEM_ABSENT');
refused('kit hands gone', 'opKit', { breed: 'rus/rifle', del: ['mosin'] }, 'GEN_KIT_HANDS_GONE');
good('kit filled + count (the engine reads both)', 'opKit', { breed: 'rus/rifle', add: [{ item: 'ppsh41', filled: true, count: 2 }] }, { [K.rifle]: s => s.includes('{item "ppsh41" 2 filled}') });
refused('kit filled + filling', 'opKit', { breed: 'rus/rifle', add: [{ item: 'ppsh41', filled: true, filling: 'ammo rifle', rounds: 5 }] }, 'GEN_KIT_ARGS');
refused('kit filling without rounds', 'opKit', { breed: 'rus/rifle', add: [{ item: 'ppsh41', filling: 'ammo rifle' }] }, 'GEN_KIT_ARGS');
refused('kit filling unknown', 'opKit', { breed: 'rus/rifle', add: [{ item: 'ppsh41', filling: 'ammo laser', rounds: 5 }] }, 'GEN_KIT_ITEM_UNKNOWN');
refused('kit fraction count without a spread', 'opKit', { breed: 'rus/rifle', add: [{ item: 'grenade f1', count: 1.5 }] }, 'GEN_KIT_ARGS');
refused('kit hands on an absent item', 'opKit', { breed: 'rus/rifle', in_hands: 'ppsh41' }, 'GEN_KIT_HANDS_ABSENT');
// a count + spread line and a filling line: the named part changes, the rest of the line and its comment stay
good('kit spread line: count set, spread kept', 'opKit', { breed: 'rus/para', add: [{ item: 'grenade no69', count: 2 }] },
  { [K.para]: s => s.includes('{item "grenade no69" 2 0.5}') && s.includes('{item "grenade f1" 1.25 0.5}') && s.includes('{in_hands 0}') });
good('kit spread line: spread set, count kept', 'opKit', { breed: 'rus/para', add: [{ item: 'grenade f1', spread: 1 }] }, { [K.para]: s => s.includes('{item "grenade f1" 1.25 1}') });
good('kit spread line: spread off needs a whole count', 'opKit', { breed: 'rus/para', add: [{ item: 'grenade f1', count: 2, spread: 0 }] }, { [K.para]: s => s.includes('{item "grenade f1" 2}') });
refused('kit spread off leaves a fraction', 'opKit', { breed: 'rus/para', add: [{ item: 'grenade f1', spread: 0 }] }, 'GEN_KIT_ARGS');
good('kit spread line into the hands, line kept', 'opKit', { breed: 'rus/para', add: [{ item: 'grenade no69', in_hands: true }] },
  { [K.para]: s => s.includes('{item "grenade no69" 0.5 0.5}') && s.includes('{in_hands 3}') && s.includes('{item "sten" filling "ammo smg" 32} ; loaded') });
good('kit filling line: rounds set, ammunition kept', 'opKit', { breed: 'rus/para', add: [{ item: 'sten', rounds: 20 }] }, { [K.para]: s => s.includes('{item "sten" filling "ammo smg" 20} ; loaded') });
good('kit filling line: a count beside it', 'opKit', { breed: 'rus/para', add: [{ item: 'sten', count: 2 }] }, { [K.para]: s => s.includes('{item "sten" 2 filling "ammo smg" 32} ; loaded') });
good('kit filling line: to the weapon\'s own', 'opKit', { breed: 'rus/para', add: [{ item: 'sten', filled: true }] }, { [K.para]: s => s.includes('{item "sten" filled} ; loaded') });
good('kit filling line: emptied', 'opKit', { breed: 'rus/para', add: [{ item: 'sten', filled: false }] }, { [K.para]: s => s.includes('{item "sten"} ; loaded') });
good('kit filled N line: rounds kept when the count changes', 'opKit', { breed: 'rus/para', add: [{ item: 'ppsh41', count: 2 }] }, { [K.para]: s => s.includes('{item "ppsh41" 2 filled 35}') });
good('kit bare line: filling put on', 'opKit', { breed: 'rus/para', add: [{ item: 'sandbag_kit', count: 3, spread: 1.5 }] }, { [K.para]: s => s.includes('{item "sandbag_kit" 3 1.5}') });
good('kit new line with every part', 'opKit', { breed: 'rus/rifle', add: [{ item: 'sten', count: 1, spread: 0.5, filling: 'ammo smg', rounds: 32 }] }, { [K.rifle]: s => /\{item "sten" 1 0\.5 filling "ammo smg" 32\}\s*\{in_hands 0\}/.test(s) });
// the held line: taken out of the hands, handed to another line, index right after lines go
good('kit nothing in the hands', 'opKit', { breed: 'rus/para', in_hands: false }, { [K.para]: s => !s.includes('in_hands') && s.includes('{item "sandbag_kit"}') });
good('kit held weapon removed, hands to the next', 'opKit', { breed: 'rus/para', del: ['sten', 'ammo smg'], in_hands: 'ppsh41' },
  { [K.para]: s => !s.includes('"sten"') && s.includes('{in_hands 2}') && /f1[^\n]*\n[^\n]*no69[^\n]*\n[^\n]*ppsh41/.test(s) });
good('kit held weapon removed, nothing left to hold', 'opKit', { breed: 'rus/para', del: ['sten'], in_hands: false }, { [K.para]: s => !s.includes('"sten"') && !s.includes('in_hands') });
good('kit hands to a new line', 'opKit', { breed: 'rus/para', add: ['mosin'], in_hands: 'mosin' }, { [K.para]: s => /\{item "mosin" 1\}\s*\{in_hands 6\}/.test(s) });
good('kit', 'opKit', { breed: 'rus/rifle', add: [{ item: 'ppsh41', filled: true, in_hands: true }, { item: 'grenade f1', count: 2 }], del: ['mosin', 'grenade f1'] },
  { [K.rifle]: s => !s.includes('"mosin"') && s.includes('{item "ppsh41" filled}') && s.includes('{item "grenade f1" 2}') && /\{item "ppsh41" filled\}[\s\S]*\{in_hands 2\}/.test(s) });
good('kit keeps in_hands on its item', 'opKit', { breed: 'rifle', army: 'rus', del: ['ammo rifle'] }, { [K.rifle]: s => s.includes('{in_hands 0}') && !s.includes('ammo rifle') });
{ const c = run('opKit', { breed: 'rus/rifle', del: ['sandbag_kit'] }); const s = c.read(K.rifle).toString('latin1'); ok('kit: in_hands moves with its item when one before it goes', s.includes('{in_hands 0}')); }

// ---- breed: decl through a macro call (reproduced first: GEN_FIELD_UNKNOWN before the fix), del
{
  const c = good('breed decl via macro', 'opBreed', { name: 'rifle_x', army: 'rus', like: 'rifle', decl: { cp: 3 } }, {
    [K.sol]: s => /\{"mp\/rus\/rifle_x"\r\n\t\{tags\s+"rifle rus infantry man"\}\r\n\t\{cp\s+3\}/.test(s) && s.includes('{"mp/rus/rifle" ("rifle" side(rus))}') && s.includes('{"mp/rus/squadleader" ("rifle" side(rus))}') });
  ok('breed decl via macro: no GEN_FIELD_UNKNOWN', !c.rep.counts.GEN_FIELD_UNKNOWN);
}
refused('breed decl field the macro lacks', 'opBreed', { name: 'rifle_y', army: 'rus', like: 'rifle', decl: { nofield: 3 } }, 'GEN_FIELD_UNKNOWN');
refused('breed del absent perk', 'opBreed', { name: 'rifle_y', army: 'rus', like: 'rifle', del: { perks: ['nope'] } }, 'GEN_BREED_DEL_ABSENT');
refused('breed del absent item', 'opBreed', { name: 'rifle_y', army: 'rus', like: 'rifle', del: ['nope'] }, 'GEN_KIT_ITEM_ABSENT');
good('breed del', 'opBreed', { name: 'rifle_z', army: 'rus', like: 'rifle', del: { items: ['sandbag_kit'], perks: ['speed'] } },
  { 'resource/set/breed/mp/rus/rifle_z.set': s => !s.includes('sandbag_kit') && !s.includes('"speed"') && s.includes('"health"') });

// ---- card list
refused('card list common', 'opCard', { unit: 'tank_t', army: 'rus', list: 'common', fields: { cost: 1 } }, 'GEN_CARD_LIST_ARGS');
refused('card list no fields', 'opCard', { unit: 'tank_t', army: 'rus', list: 'cooperative' }, 'GEN_CARD_LIST_ARGS');
refused('card list unknown card', 'opCard', { unit: 'nope', army: 'rus', list: 'cooperative', fields: { cost: 1 } }, 'GEN_CARD_UNKNOWN');
{
  const c = good('card list', 'opCard', { unit: 'tank_t', army: 'rus', list: 'cooperative', fields: { cost: 200 } }, {
    'resource/set/multiplayer/units/cooperative.set': s => s.includes('(include "vehicles.set")') && /\{"tank_t"[^\r\n]*\{cost 200\}/.test(s) && /\{cost 200\}[^\r\n]*\r\n\}/.test(s) });
  ok('card list: the army list is untouched', !c.dirty.has('resource/set/multiplayer/units/vehicles_rus.set'));
}

// ---- squad
refused('squad order unknown', 'opSquad', { name: 'sq_o', army: 'rus', like: 'riflemans', members: ['rifle:3', 'squadleader:1'], order: 'nope' }, 'GEN_SQUAD_ORDER_UNKNOWN');
refused('squad remove unknown', 'opSquad', { name: 'nope', army: 'rus', remove: true }, 'GEN_SQUAD_REMOVE_UNKNOWN');
refused('squad content with braces', 'opSquad', { name: 'sq_c', army: 'rus', like: 'riflemans', content: '{x}' }, 'GEN_SQUAD_CONTENT_BAD');
refused('squad bots bad class', 'opSquad', { name: 'sq_b', army: 'rus', like: 'riflemans', members: ['rifle:3', 'squadleader:1'], bots: { class: 'Zeppelin' } }, 'GEN_BOTS_CLASS_UNKNOWN');
good('squad >4 types', 'opSquad', { name: 'sq_big', army: 'rus', like: 'riflemans', members: ['squadleader:1', 'rifle:2', 'mg:1', 'at:1', 'sniper:1'], fields: { cost: 150 }, not_for_sale: true },
  { [K.sq]: s => s.includes('{"sq_big(rus)" {charge 30} {content "mp/rus/squadleader:1 mp/rus/rifle:2 mp/rus/mg:1 mp/rus/at:1 mp/rus/sniper:1"}') && s.includes('{cost 150}') && /\{"sq_big\(rus\)"[^\r\n]*\{fore -1\.0\} \{not_for_sale\}\}\r\n/.test(s) });
good('squad raw content', 'opSquad', { name: 'sq_raw', army: 'rus', like: 'riflemans', content: 'm3 ( mp/rus/rifle:6 mp/rus/squadleader:2 )' }, { [K.sq]: s => s.includes('{content "m3 ( mp/rus/rifle:6 mp/rus/squadleader:2 )"}') });
good('squad order first', 'opSquad', { name: 'sq_first', army: 'rus', like: 'guards', members: ['squadleader:1', 'rifle:4'], order: 'first' },
  { [K.sq]: s => { const ls = s.split('\r\n'); const i = ls.findIndex(l => l.includes('name(sq_first)')), j = ls.findIndex(l => l.includes('name(riflemans)')); return i >= 0 && i < j; } });
good('squad remove', 'opSquad', { name: 'guards', army: 'rus', remove: true }, { [K.sq]: s => /name\(guards\)[^\r\n]*\r\n\{"guards\(rus\)" \{remove\}\}/.test(s) });
good('squad bots fields', 'opSquad', { name: 'sq_bot', army: 'rus', like: 'riflemans', members: ['squadleader:1', 'rifle:4'], order: 'last', bots: { priority: 2, class: 'ATInfantry', min_team: 2 } }, {});
{ const c = run('opSquad', { name: 'sq_bot', army: 'rus', like: 'riflemans', members: ['squadleader:1', 'rifle:4'], order: 'last', bots: { priority: 2, class: 'ATInfantry', min_team: 2 } });
  const s = c.read(K.bot).toString('latin1'); ok('squad bots fields: entry copied with the given class/min_team/priority', /\{priority = 2, min_income = 3\.0, min_team = 2, class = UnitClass\.ATInfantry, unit = "sq_bot\(rus\)"\}/.test(s) && s.includes('class = UnitClass.Infantry, unit = "riflemans(rus)"'), s); }
{ const c = run('opSquad', { name: 'riflemans', army: 'rus', like: 'guards', members: ['squadleader:1', 'rifle:4'], order: 'last' }); ok('squad order on an existing name: refused, not moved', c.rep.counts.GEN_SQUAD_EXISTS === 1 && c.dirty.size === 0, JSON.stringify(c.rep.counts)); }

// ---- vehkit: a vehicle's own box lines and what sits in its weapon slots (opVehKit; the Units page calls it)
put('resource/entity/-vehicle/tank_k/tank_k.def', `{game_entity
	{extender "inventory"
		{weapon "mgun"
			{mask "weapon mgun"}
		}
		{box
			{item "ammo rifle" 500}
			{item "mosin" filled {user "mgun"}}
			{item "sandbag_kit" 2}
		}
	}
}
`);
{
  const KV = 'resource/entity/-vehicle/tank_k/tank_k.def';
  refused('vehkit no args', 'opVehKit', { entity: 'tank_k' }, 'GEN_VEHKIT_ARGS');
  refused('vehkit unknown item', 'opVehKit', { entity: 'tank_k', add: [{ item: 'zeppelin', count: 1 }] }, 'GEN_VEHKIT_ITEM_UNKNOWN');
  refused('vehkit del absent', 'opVehKit', { entity: 'tank_k', del: ['ppsh41'] }, 'GEN_VEHKIT_ITEM_ABSENT');
  refused('vehkit bad count', 'opVehKit', { entity: 'tank_k', add: [{ item: 'ppsh41', count: 0 }] }, 'GEN_VEHKIT_ARGS');
  refused('vehkit filled and filling', 'opVehKit', { entity: 'tank_k', add: [{ item: 'ppsh41', filled: true, filling: 'ammo smg' }] }, 'GEN_VEHKIT_ARGS');
  refused('vehkit bad slot name', 'opVehKit', { entity: 'tank_k', mount: { 'm gun': 'ppsh41' } }, 'GEN_VEHKIT_ARGS');
  refused('vehkit mount unknown', 'opVehKit', { entity: 'tank_k', mount: { mgun: 'zeppelin' } }, 'GEN_VEHKIT_ITEM_UNKNOWN');
  refused('vehkit empty an empty slot', 'opVehKit', { entity: 'tank_k', mount: { mgun9: false } }, 'GEN_VEHKIT_SLOT_EMPTY');
  refused('vehkit mount a line of many', 'opVehKit', { entity: 'tank_k', mount: { mgun: 'sandbag_kit' } }, 'GEN_VEHKIT_MOUNT_COUNT');
  refused('vehkit no such vehicle', 'opVehKit', { entity: 'tank_zz', del: ['mosin'] }, Object.keys(run('opVehKit', { entity: 'tank_zz', del: ['mosin'] }).rep.counts).find(k => !/^WARN_/.test(k)) || 'GEN_?');
  good('vehkit count + new line + del', 'opVehKit', { entity: 'tank_k', add: [{ item: 'ammo rifle', count: 300 }, { item: 'ppsh41', count: 2 }], del: ['sandbag_kit'] },
    { [KV]: t => t.includes('{item "ammo rifle" 300}') && t.includes('{item "ppsh41" 2}') && !t.includes('sandbag_kit') && t.includes('{item "mosin" filled {user "mgun"}}') });
  good('vehkit put another weapon in the slot', 'opVehKit', { entity: 'tank_k', mount: { mgun: 'ppsh41' } },
    { [KV]: t => /\{item "mosin" filled\s*\}/.test(t) && t.includes('{item "ppsh41" filled {user "mgun"}}') });
  good('vehkit take the weapon out', 'opVehKit', { entity: 'tank_k', mount: { mgun: false } }, { [KV]: t => !t.includes('{user') && /\{item "mosin" filled\s*\}/.test(t) });
  { const c = run('opVehKit', { entity: 'tank_k', mount: { mgun: 'mosin' } }); ok('vehkit same weapon: nothing written', c.dirty.size === 0 && errs(c) === 0, JSON.stringify(c.rep.counts)); }
}

// ---- skin: the entity a soldier wears (opWear); texmod: the texture variant a def shows (opTexmod); the Units page calls both
put('resource/set/breed/mp/rus/skin1.set', '{breed\n\t{skin "rus_inf"} ; the look\n\t{inventory\n\t\t{item "mosin" filled}\n\t}\n}\n');
put('resource/set/breed/mp/rus/skin0.set', '{breed\n\t{inventory\n\t\t{item "mosin" filled}\n\t}\n}\n');
put('resource/set/breed/mp/rus/skin_inc.set', '{breed\n\t(include "base.inc")\n\t{inventory\n\t\t{item "mosin" filled}\n\t}\n}\n');
put('resource/set/breed/mp/rus/skin2.set', '{breed\n\t{skin "rus_inf"}\n\t{skin "rus_off"}\n}\n');
put('resource/entity/humanskin/rus_inf/rus_inf.def', '{entity\n\t{extension "rus_inf.mdl"}\n}\n');
put('resource/entity/humanskin/rus_off/rus_off.def', '{entity\n\t{extension "rus_off.mdl"}\n\t{texmod "camo"}\n}\n');
put('resource/entity/humanskin/rus_bare/rus_bare.def', '{entity\n\t(include "/entity/humanskin/skin.inc")\n}\n');
put('resource/entity/-vehicle/tank_v/tank_v.def', '{game_entity\n\t{extension "tank_v.mdl"}\n\t{extender "inventory"\n\t\t{box}\n\t}\n}\n');
put('resource/entity/-vehicle/tank_x/tank_x.def', '{game_entity\n\t{extension "tank_x.mdl"}\n\t{texmod\n\t\t{"body" "w"}\n\t}\n}\n');
{
  const B = n => `resource/set/breed/mp/rus/${n}.set`, SK = n => `resource/entity/humanskin/${n}.def`;
  refused('skin no skin', 'opWear', { breed: 'rus/skin1' }, 'GEN_WEAR_ARGS');
  refused('skin bad breed', 'opWear', { breed: 'a/b/c/d', skin: 'rus_off' }, 'GEN_WEAR_ARGS');
  refused('skin unknown breed', 'opWear', { breed: 'rus/nobody', skin: 'rus_off' }, 'GEN_WEAR_BREED_UNKNOWN');
  refused('skin unknown skin', 'opWear', { breed: 'rus/skin1', skin: 'rus_zeppelin' }, 'GEN_WEAR_UNKNOWN');
  refused('skin from another file', 'opWear', { breed: 'rus/skin_inc', skin: 'rus_off' }, 'GEN_WEAR_INHERITED');
  refused('skin two lines', 'opWear', { breed: 'rus/skin2', skin: 'rus_off' }, 'GEN_WEAR_MANY');
  good('skin set', 'opWear', { breed: 'rus/skin1', skin: 'RUS_OFF' }, { [B('skin1')]: t => t.includes('{skin "rus_off"} ; the look') && !t.includes('rus_inf') && t.includes('{item "mosin" filled}') });
  good('skin with army apart', 'opWear', { breed: 'skin1', army: 'rus', skin: 'rus_off' }, { [B('skin1')]: t => t.includes('{skin "rus_off"}') });
  good('skin on a breed with no line', 'opWear', { breed: 'rus/skin0', skin: 'rus_off' }, { [B('skin0')]: t => /^\{breed\s+\{skin "rus_off"\}\s+\{inventory/.test(t) });
  { const c = run('opWear', { breed: 'rus/skin1', skin: 'rus_inf' }); ok('skin same: nothing written', c.dirty.size === 0 && !c.rep.counts.GEN_WEAR_ARGS, JSON.stringify(c.rep.counts)); }

  refused('texmod no variant', 'opTexmod', { entity: 'rus_inf' }, 'GEN_TEXMOD_ARGS');
  refused('texmod bad variant', 'opTexmod', { entity: 'rus_inf', variant: 'a b' }, 'GEN_TEXMOD_ARGS');
  refused('texmod off where none', 'opTexmod', { entity: 'rus_inf', variant: false }, 'GEN_TEXMOD_ABSENT');
  refused('texmod no model line', 'opTexmod', { entity: 'rus_bare', variant: 'camo' }, 'GEN_TEXMOD_NO_EXTENSION');
  refused('texmod per texture form', 'opTexmod', { entity: 'tank_x', variant: 'w' }, 'GEN_TEXMOD_FORM');
  refused('texmod new name taken', 'opTexmod', { entity: 'rus_inf', variant: 'camo', as: 'rus_off' }, 'GEN_TEXMOD_EXISTS');
  refused('texmod copy of a def with no model line', 'opTexmod', { entity: 'rus_bare', variant: 'camo', as: 'rus_bare_camo' }, 'GEN_TEXMOD_NO_EXTENSION');
  good('texmod add after the model line', 'opTexmod', { entity: 'rus_inf', variant: 'Camo' }, { [SK('rus_inf/rus_inf')]: t => /\{extension "rus_inf\.mdl"\}\s+\{texmod "camo"\}\s+\}/.test(t) });
  good('texmod change', 'opTexmod', { entity: 'rus_off', variant: '1' }, { [SK('rus_off/rus_off')]: t => t.includes('{texmod "1"}') && !t.includes('camo') });
  good('texmod off', 'opTexmod', { entity: 'rus_off', variant: false }, { [SK('rus_off/rus_off')]: t => !t.includes('texmod') && t.includes('{extension "rus_off.mdl"}') });
  good('texmod on a vehicle def', 'opTexmod', { entity: 'tank_v', variant: 'winter' }, { 'resource/entity/-vehicle/tank_v/tank_v.def': t => /\{extension "tank_v\.mdl"\}\s+\{texmod "winter"\}\s+\{extender/.test(t) });
  { const c = good('texmod as a new def', 'opTexmod', { entity: 'rus_inf', variant: 'camo', as: 'rus_inf_camo' }, { [SK('rus_inf/rus_inf_camo')]: t => /\{extension "rus_inf\.mdl"\}\s+\{texmod "camo"\}/.test(t) });
    ok('texmod as: the old def is not staged', !c.dirty.has(SK('rus_inf/rus_inf')) && c.dirty.size === 1, [...c.dirty.keys()].join(' ')); }
  { const c = good('texmod as a plain copy', 'opTexmod', { entity: 'rus_off', variant: false, as: 'rus_off_plain' }, { [SK('rus_off/rus_off_plain')]: t => !t.includes('texmod') && t.includes('{extension "rus_off.mdl"}') });
    ok('texmod plain copy: one file', c.dirty.size === 1, [...c.dirty.keys()].join(' ')); }
  { const c = run('opTexmod', { entity: 'rus_off', variant: 'camo' }); ok('texmod same: nothing written', c.dirty.size === 0 && !c.rep.counts.GEN_TEXMOD_ARGS, JSON.stringify(c.rep.counts)); }
  { const c = ctxOf(); O.opTexmod(c, { entity: 'rus_inf', variant: 'camo', as: 'rus_inf_camo' }); O.opWear(c, { breed: 'rus/skin1', skin: 'rus_inf_camo' });
    ok('new def then skin to it, one run', errs(c) === 0 && c.dirty.size === 2 && c.read(B('skin1')).toString('latin1').includes('{skin "rus_inf_camo"}'), JSON.stringify(c.rep.counts)); }
}

// ---- --plan through the CLI: every changed line is shown, nothing written
{
  const spec = path.join(W, 'plan.json'), out = path.join(W, 'plan_out');
  fs.writeFileSync(spec, JSON.stringify({ name: 'p', ops: [{ op: 'macro', entity: 'tank_t', macro: 'tank_trace', arg: 'step', value: 0.7 }, { op: 'iblock', entity: 'tank_n', like: 'tank_t' }] }));
  const r = cp.spawnSync(process.execPath, [path.join(__dirname, '..', 'gen.js'), spec, '--target', 'as64', '--game', G, '--plan', '--out', out, '--no-stat', '--no-gate'], { encoding: 'utf8' });
  const t = (r.stdout || '') + (r.stderr || '');
  ok('--plan shows the changed lines', /GEN_PLAN_WRITE .*tank_t\.def \+\d+: .*step\(0\.7\)/.test(t) && /GEN_PLAN_WRITE .*tank\.inc \+\d+: \{"tank_n tank"/.test(t), t.slice(0, 800));
  ok('--plan writes nothing', !fs.existsSync(path.join(out, 'resource')), out);
}

console.log(bad ? bad + ' FAILED' : 'all ok');
process.exit(bad ? 1 : 0);

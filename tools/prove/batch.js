// prove batch: many units through one match, one slot at a time, and N matches side by side.
// Author: Imperator_Aug (ARSENAL, ia-628a9920)
// no selector picks a unit by card, so slots run in turn on one side: buy, test, delete, next. a side's selector means "this slot's unit".
// clock: side 3 buys a sentinel, its sighting starts clk0; each clk waits SLOT, deletes the slot's units, turns the next clk on.
// the bots buy on their own wall clock with a lag, so a buy always lands after the delete. a card that never comes loses only its slot.
// a team with no units loses and the game ends for everyone (TST-26, MIS-45). the slot delete empties the test side, so a third bot on its team, the keeper, holds one unit the delete never selects
const crlf = s => s.replace(/\r?\n/g, '\r\n');
const LAG = 8;
const DEPTH = { spawn: 25, move: 75, fire: 150 };
// the generated tiny map: spawn points 70 m apart, goal 25 m out. no long walks, so slots are seconds
const TINY = { lag: 5, depth: { spawn: 12, move: 20, fire: 30 } };
// a crewed truck proves a gun: killed it reports not moveable, a live one never does. an empty vehicle is no target, the AI ignores it
const FOES = { vehicle: { card: 'gmc', kind: 'vehicle' }, human: { card: 'riflemans2(usa)', kind: 'human' } };
// damage-in turns the test round: a vanilla shooter fires at the unit under test, so the unit needs no gun, only to take harm
// kind "gun": a gun crew. its men are watched as humans, but the order goes to the gun (the engine refuses a boarded man). prove.js passes u.kind through as text, so the flag lives in the kind
function typeOf(u) { return u.kind === 'gun' ? 'human' : u.kind; }
function foeOf(u, o) { return o.enemy ? { card: o.enemy, kind: o.ekind } : o.damageIn ? { card: 't34_0', kind: 'vehicle' } : FOES[typeOf(u)] || FOES.vehicle; }
// the kill state per target kind, from in-game runs: human {state dead}, crewed vehicle {state "not moveable"}
// men walk and shoot slower than a gun kills a truck: 150 s ran out on them, 240 s killed
// on the tiny map 30 s also ran out on men: 45 s is the ladder's budget [I], batch 2 measures it
function slotOf(u, o) { return o.depth === 'fire' && typeOf(u) === 'human' && !o.fixedSlot ? Math.max(o.slot, o.tiny ? 45 : 240) : o.slot; }
const lagOf = o => o.lag || LAG;
// "not inactive" does not keep the sentinel out of a selector, so the foe trigger arms only once the slot's foe is bought
const armOf = o => lagOf(o) + 3;
function totalTime(units, o) { return units.reduce((a, u) => a + slotOf(u, o), 0); }
function killState(kind) { return kind === 'human' ? 'dead' : '"not moveable"'; }

// "card" or "card:human"; the card itself can hold no colon
function parseUnits(s, kind) {
  return String(s).split(',').map(x => x.trim()).filter(Boolean).map(x => {
    const i = x.lastIndexOf(':');
    return i > 0 ? { card: x.slice(0, i), kind: x.slice(i + 1) } : { card: x, kind };
  });
}
function chunk(list, n) {
  const out = Array.from({ length: Math.min(n, list.length) }, () => []);
  list.forEach((u, i) => out[i % out.length].push(u));
  return out;
}
const never = '{"1.entities" {selector {tag pv_never}} {count {op ">"} {value 0}}}';
function triggers(units, o) {
  const mark = t => `{"con" {text "PROVE ${t}"}}`;
  const rows = [
    `{"pv_route" {condition} {actions ${mark('route')}}}`,
  ];
  units.forEach((u, k) => {
    const me = `{player "${o.side}"} {type ${typeOf(u)}}${u.kind === 'vehicle' ? ' {state inhabited}' : ''}`;
    // a gun crew is ordered through its gun: the engine refuses actor_to_waypoint on a boarded man
    const ord = u.kind === 'gun' ? `{player "${o.side}"} {type vehicle}` : me;
    const clk = `pv_clk${k}`, nxt = `pv_clk${k + 1}`, live = `{"1.trigger" {name "pv_go${k}"}} {"2.trigger" {name "${nxt}"}}`;
    const here = (extra, actions, name) => `{"pv_s${k}_${name}" {condition {expression "1 & !2 & 3${extra ? ' & !4' : ''}"} {terms ${live} {"3.entities" {selector ${me}} {count {op ">"} {value 0}}}${extra ? ' ' + extra : ''}}} {actions ${actions}}}`;
    const start = k === 0
      ? `{terms {"1.entities" {selector {player "${o.eside}"}} {count {op ">"} {value 0}}}}`
      : `{terms ${never}}`;
    const clear = k === 0 ? '' : `{"delete" {selector {player "${o.side}"}}} {"delete" {selector {player "${o.eside}"} {state "not inactive"}}}`;
    rows.push(`{"${clk}" {condition ${start}} {actions ${clear} ${k === 0 ? `{"actor_state" {selector {player "${o.eside}"} {type human}} {fire_mode hold}} {"entity_state" {selector {player "${o.eside}"}} {inactive on} {impregnable on}}` : ''} ${mark(`s${k} open`)} {"delay" {time 1}} {"trigger" {name "pv_go${k}"} {on}} {"delay" {time ${armOf(o) - 1}}} {"trigger" {name "pv_arm${k}"} {on}} {"delay" {time ${slotOf(u, o) - armOf(o)}}} {"trigger" {name "${nxt}"} {on}}}}`);
    rows.push(`{"pv_go${k}" {condition {terms ${never}}} {actions ${mark(`s${k} go`)}}}`);
    // a delete lands after this frame's triggers, so the slot's triggers open 1 s behind the clock or they match last slot's units
    rows.push(`{"pv_arm${k}" {condition {terms ${never}}} {actions ${mark(`s${k} armed`)}}}`);
    const nearPos = `{"3.near" {units ${me}} {near_to {tag pv_t}} {distance ${o.near}}}`;
    let on = `${mark(`s${k} seen`)}`;
    const inward = o.depth === 'fire' && o.damageIn;
    if (inward) on += ` {"actor_state" {selector ${me}} {fire_mode hold}}`;
    else if (o.depth !== 'spawn') on += ` {"delay" {time 2}} {"actor_to_waypoint" {selector ${ord}} {waypoint "900"}} ${mark(`s${k} ordered`)}`;
    rows.push(here('', on, 'seen'));
    if (o.depth !== 'spawn' && !inward) {
      rows.push(`{"pv_s${k}_far" {condition {expression "1 & !2 & 3 & !4"} {terms ${live} {"3.entities" {selector ${me}} {count {op ">"} {value 0}}} ${nearPos.replace('"3.near"', '"4.near"')}}} {actions ${mark(`s${k} far`)}}}`);
      const fire = o.depth === 'fire' ? ` {"actor_state" {selector ${me}} {fire_mode open}}` : '';
      rows.push(`{"pv_s${k}_moved" {condition {expression "1 & !2 & 3"} {terms ${live} ${nearPos}}} {actions ${mark(`s${k} moved`)}${fire}}}`);
    }
    if (o.depth === 'fire') {
      const tf = foeOf(u, o), foe = `{player "${o.eside}"} {type ${tf.kind}} {state "not inactive"}`, dead = `{player "${o.eside}"} {type ${tf.kind}}`;
      const foeDo = inward ? `{"actor_state" {selector ${foe}} {fire_mode open}} {"actor_fire" {selector ${foe}} {attack enemies} {enemies ${me}} {time ${slotOf(u, o)}}}` : `{"actor_state" {selector ${foe}} {fire_mode hold}} {"actor_to_waypoint" {selector ${foe}} {waypoint "901"}}`;
      rows.push(`{"pv_s${k}_foe" {condition {expression "1 & !2 & 3 & 4"} {terms ${live} {"3.entities" {selector ${foe}} {count {op ">"} {value 0}}} {"4.trigger" {name "pv_arm${k}"}}}} {actions ${mark(`s${k} foe`)} ${foeDo}}}`);
      // open fire alone left men idle: the order goes out once the unit is at the goal and its foe is on the map
      if (!inward) rows.push(`{"pv_s${k}_fire" {condition {expression "1 & !2 & 3 & 4"} {terms ${live} {"3.trigger" {name "pv_s${k}_moved"}} {"4.trigger" {name "pv_s${k}_foe"}}}} {actions {"actor_fire" {selector ${me}} {attack enemies} {enemies ${foe}} {time ${slotOf(u, o)}}} ${mark(`s${k} fire_ordered`)}}}`);
      const victim = inward ? `{player "${o.side}"} {type ${typeOf(u)}} {state ${killState(typeOf(u))}}` : `${dead} {state ${killState(tf.kind)}}`;
      rows.push(`{"pv_s${k}_kill" {condition {expression "1 & !2 & 3"} {terms ${live} {"3.entities" {selector ${victim}} {count {op ">"} {value 0}}}}} {actions ${mark(`s${k} kill`)}}}`);
    }
  });
  if (o.keep) rows.push(`{"pv_keep" {condition {terms {"1.entities" {selector {player "${o.keep}"}} {count {op ">"} {value 0}}}}} {actions {"actor_state" {selector {player "${o.keep}"} {type human}} {fire_mode hold}} {"entity_state" {selector {player "${o.keep}"}} {inactive on} {impregnable on}} ${mark('keeper')}}}`);
  // the sentinel is alone on team a: a slot's gun that kills it ends the match (TST-26). spawn and move need no target, so it also goes inactive; fire keeps it a legal target but unkillable
  if (o.keep) rows.push(`{"pv_sent" {condition {terms {"1.entities" {selector {player "${o.eside}"} {type human}} {count {op ">"} {value 0}}}}} {actions {"actor_state" {selector {player "${o.eside}"} {type human}} {fire_mode hold}} {"entity_state" {selector {player "${o.eside}"} {type human}} ${o.depth === 'fire' ? '' : '{inactive on} '}{impregnable on}} ${mark('sentinel safe')}}}`);
  const last = units.length;
  rows.push(`{"pv_clk${last}" {condition {terms ${never}}} {actions {"delete" {selector {player "${o.side}"}}} ${mark('done')}}}`);
  return rows.map(r => '\t\t\t' + r).join('\n');
}
// both bots run one script. side keys the card list. a card that won't sell costs its slot, the clock doesn't wait
function bot(units, o) {
  const cards = units.map(u => `"${u.card}"`).join(', ');
  const foes = o.depth === 'fire' ? units.map(u => `"${foeOf(u, o).card}"`).join(', ') : '';
  const at = []; units.reduce((a, u) => { at.push(a); return a + slotOf(u, o); }, 0);
  return `-- prove batch: buy one card per slot, no AI
local at = {${at.join(', ')}}
local me = BotApi.Instance.playerId
local list = me == ${o.side} and {${cards}} or (me == ${o.eside} and {${foes}} or {})
print("PROVE bot side=" .. tostring(me) .. " team=" .. tostring(BotApi.Instance.team) .. " army=" .. tostring(BotApi.Instance.army))
local sentinel = me == ${o.eside} and "${o.sentinel}" or nil
local keeper = me == ${o.keep || -1} and "${o.keeper || ''}" or nil
local t0, k = nil, 1
local function Tick()
	if keeper then
		if BotApi.Commands:Spawn(keeper, 5) then print("PROVE bot keeper " .. keeper); keeper = nil end
		return
	end
	if me ~= ${o.side} and me ~= ${o.eside} then return end
	if sentinel then
		if BotApi.Commands:Spawn(sentinel, 5) then print("PROVE bot sentinel " .. sentinel); sentinel = nil; t0 = os.time() end
		return
	end
	if not t0 then
		if list[1] and BotApi.Commands:Spawn(list[1], 5) then print("PROVE bot bought s0 " .. list[1]); t0 = os.time(); k = 2 end
		return
	end
	if k == 1 then
		if list[1] and os.time() - t0 >= ${lagOf(o)} and BotApi.Commands:Spawn(list[1], 5) then print("PROVE bot bought s0 " .. list[1]); k = 2 end
		return
	end
	if not list[k] then return end
	if os.time() - t0 >= at[k] + ${lagOf(o)} then
		if BotApi.Commands:Spawn(list[k], 5) then print("PROVE bot bought s" .. (k - 1) .. " " .. list[k]); k = k + 1 end
	end
end
BotApi.Events:Subscribe(BotApi.Events.Quant, Tick)
`;
}
// the kill feed has no line breaks of its own: <killer player> {shooter} <victim player> <victim>. a placed map entity reports as `enemy`, a bought unit as `AI Player: <level>`
// a foe alone can't prove a kill: t4's marker came from a placed GAZ-67B. so a slot's kill needs a feed line in that slot's stretch of log from a bought unit [I: foes hold fire, so it is the slot's unit]
// the credit goes to the last feed line before the marker: an earlier line in the slot may be another kill
// F11: every bot shows as `AI Player: <level>`, so the keeper squad or the sentinel can take the credit too. names (optional) = { want: display names of the slot's
// entity and crew, not: keeper/sentinel names }. a shooter in `not` never counts; with `want` set the shooter must be in it. no want = any bought unit counts [I]
function shooterOf(text, names) {
  const at = text.search(/PROVE s\d+ kill/), rows = [...(at < 0 ? '' : text.slice(0, at)).matchAll(/(AI Player: \w+|\S+) \{([^{}\r\n]+)\} /g)], m = rows[rows.length - 1];
  if (!m || !m[1].startsWith('AI Player')) return { name: '', ok: false, why: 'kill not by a bought unit' };
  const n = m[2], eq = list => (list || []).some(x => String(x).toLowerCase() === n.toLowerCase());
  if (names && eq(names.not)) return { name: n, ok: false, why: 'kill credited to ' + n + ' (keeper or sentinel)' };
  if (names && names.want && names.want.length && !eq(names.want)) return { name: n, ok: false, why: 'kill credited to ' + n + ', not this card' };
  return { name: n, ok: true, named: !!(names && names.want && names.want.length) };
}
function shooterIn(text, names) { const s = shooterOf(text, names); return s.ok ? s.name : ''; }
// "card=Name|Name2;card2=Name3" -> { card: [names] }
function parseNames(s) {
  const out = {};
  for (const part of String(s || '').split(';').map(x => x.trim()).filter(Boolean)) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).split('|').map(x => x.trim()).filter(Boolean);
  }
  return out;
}
function slotText(log, k) {
  const a = log.indexOf(`PROVE s${k} open`);
  if (a < 0) return '';
  const b = log.indexOf(`PROVE s${k + 1} open`, a);
  return log.slice(a, b < 0 ? log.length : b);
}
// a slot passes on markers only. crash = the open slot is the suspect, later slots never ran
function score(log, units, o) {
  const has = (k, m) => new RegExp(`PROVE s${k} ${m}\\b`).test(log);
  const ex = /\*{5,} Exception \*{5,}/.test(log);
  let open = -1;
  for (const m of log.matchAll(/PROVE s(\d+) open/g)) open = Math.max(open, +m[1]);
  const done = /PROVE done\b/.test(log);
  // triggers run on after the game ended, so the slot where it stopped is what counts
  const stopAt = log.indexOf('GameThreadStop'), lastOpen = stopAt < 0 ? Infinity : [...log.slice(0, stopAt).matchAll(/PROVE s(\d+) open/g)].reduce((a, m) => Math.max(a, +m[1]), -1);
  const rows = units.map((u, k) => {
    const seen = has(k, 'seen'), bought = new RegExp(`PROVE bot bought s${k}\\b`).test(log);
    const r = { slot: k, card: u.card, kind: u.kind, bought, seen, ran: k <= open };
    const walks = o.depth !== 'spawn' && !o.damageIn;
    let refused = false;
    if (walks) {
      r.far = has(k, 'far'); r.moved = has(k, 'moved');
      // the ordered marker is written whether or not the engine took the order; a refusal warning in the slot's log text voids it
      refused = /ActorToWaypoint for linked actor/.test(slotText(log, k));
      r.ordered = has(k, 'ordered') && !refused;
    }
    let credit = null;
    if (o.depth === 'fire') {
      r.foe = has(k, 'foe'); r.kill = has(k, 'kill');
      credit = shooterOf(slotText(log, k), o.names || o.notShooters ? { want: (o.names || {})[u.card], not: o.notShooters } : null);
      r.shooter = credit.ok ? credit.name : '';
      if (credit.name && !credit.ok) r.creditTo = credit.name;
      if (credit.ok) r.named = credit.named;
    }
    r.pass = seen && (!walks || (r.far && r.moved && !refused)) && (o.depth !== 'fire' || (r.kill && !!r.shooter));
    r.why = r.pass ? '' : !r.ran ? 'not reached' : k > lastOpen ? 'game over before this slot' : !bought ? 'bot could not buy' : !seen ? 'bought, never on map' : walks && refused ? 'order refused: boarded crew' : walks && !r.moved ? 'did not reach goal' : o.depth === 'fire' && !r.foe ? 'no enemy to shoot' : r.kill ? credit.why : o.damageIn ? 'took no kill' : 'no kill';
    return r;
  });
  const died = !done;
  const suspect = (ex || died) && open >= 0 && open < units.length ? units[open].card : '';
  return { rows, exception: ex, done, open, suspect, route: /PROVE route\b/.test(log), pass: rows.every(r => r.pass) && !ex && done };
}
// a roster line for an entity with no card, same shape as a stock vehicle card
function testCard(name, army) { return `{"${name}" ("vs" c(60) t(all) s(${army}) n(2) g(b1) sc(4.00) b(v1) cw(0) cp(0)) {level 1} {cost 10} {fore 1.0}}`; }
// the test preset: 50000 money, no cooldowns, no limits. a bot buys anything its army has
function gameSet(stock) {
  return stock.replace(/\{armySelectionMode\s+alliance\}/, '{armySelectionMode team}').replace('(include "presets.inc")', '(include "presets_test.inc")');
}
module.exports = { typeOf, slotOf, totalTime, FOES, foeOf, killState, shooterIn, shooterOf, parseNames, slotText, parseUnits, chunk, triggers, bot, score, gameSet, crlf, DEPTH, LAG, TINY, lagOf, armOf, testCard };

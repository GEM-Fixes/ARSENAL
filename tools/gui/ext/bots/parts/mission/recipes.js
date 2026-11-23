// Recipe templates of the "Map scripts for AI" mission part: the text each recipe adds to a map's <mode>.mi. One trigger per line, in the
// one-line form of the in-game proof "Exact trigger text", m6), names and numbers swapped only.
// Which form comes from where (report =:
//   find     side detection, report btp_t1_3 condition + its first action: {condition {expression "1 & 2"} {terms {"1.entities" <human
//            selector in the team's start zone> {count {op ">"} {value 0}}} {"2.cmp_i" {var "v$"} {op "=="} {value 0}}}} {actions {"set_i"
//            {var "v$"} {op "="} {value n}}}, one per side 1..16 [V 4 games]; the side number moves between matches (report "Side numbers move")
//   onSide   report btp_t2_3 condition {condition {expression "1"} {terms {"1.cmp_i" {var "v$"} {op "=="} {value n}}}} [V]
//   move     report btp_t1_3 {"actor_to_waypoint" {selector {source advanced} {group {select {zone {zone "z"}}} {include {player {player "n"}}}
//            {exclude {state {state dead}}}}} {drop orders} {waypoint "w"}} [V 2 games + control]
//   board    report btp_t2_3 {"board" {selector .. {exclude {state {state dead}} {state {state linked}}}} {amount k}} {vehicle {tag t}}} [V 2]
//            on a placed {Entity "e" 0xNNNN {Position x y} {Player 0}} + {Tags "t" 0xNNNN} (report "Placed") [V]
//   spawn    report btp_t3 {condition} {actions {"delay" ..} {"spawn" {entity "e"} {waypoint "w"}} {"set_i" {var "s$"} {op "="} {value 1}}} and
//            btp_t3_3 {"player" {selector {zone "z"} {type vehicle}} {player "n"}} keyed on side + s$ [V 3 games]
//   helpers  {zone "circle" {position x y z} {Name "n"} {Radius r}}, {waypoints "g" {"w" {position x y z} {radius r}}}, {vars {"a"} {"b"}}
// (report "Helpers", gen.js); var names end in $ where cmp_i/set_i read them [V m3]
//   repeat   no repeating trigger is in the report: a repeat is the same order again after a {"delay"}, written out (report forms only)
//   hold     {"actor_state" <human selector> {move_mode hold} {fire_mode open}} / {move_mode free}: stock 00b_usa-hurtgen/0.mi and 06_usa-dison
//            [V file], humans only (MIS-40: no brain = crash); NOT run in a bot match (report "Not proven": actor_state move_mode hold)
//   crew     report T3c [V 2 games]: a placed {Human "<breed>" 0xNNNN {Position x y} {Player 0}} + {Tags}, made inactive at the start
//            (the report placed one fixed US rifleman; the page places the vehicle's own crew: crewPick below, one tagged group per crew kind)
//            ({"entity_state" {selector {tag t}} {inactive on}}, report btp_tpl), copied with {"waypoint" {who {type actor} {actors {tag t}}}
//            {action {type start} {waypoint "w"} {clone} {make_squad} {approach "safe teleport & rotate"}}} and given to the side with
//            {"player" {selector {zone "z"} {type human}} {player "n"}} (btp_t3_3). Getting in: {"board" {selector {zone "z"} {type human}}
// {vehicle {zone "z"} {type vehicle}}}: board's vehicle is a full selector [V];
//            this chain as a whole is NOT run in a game [T]
//   arty     {"spawn" {entity "artillery_explosion"} {waypoint "w"}}: stock 06_usa-dison/0.mi [V file], spawn form as above
// Still not proven (report "Not proven, still [T]"): orders to bot vehicles; whether the bot later orders script-spawned units; why part of
// an ordered group ignores the bot's 180 s re-order; hold. The page says so in words on those recipes.
// Author: Imperator_Aug (ARSENAL, ia-6df32585)
'use strict';

const SIDES = 16;   // report: "One trigger per side 1..16"
const num = x => { const s = (Math.round(Number(x) * 100) / 100).toString(); return /e/i.test(s) ? '0' : s; };

// ---- the report's pieces, one line each
const sel = {
  human: (z, n) => '{selector {source advanced} {group {select {zone {zone "' + z + '"}}} {include {player {player "' + n + '"}} {prop {prop human}}} {exclude {state {state dead}}}}}',
  all: (z, n) => '{selector {source advanced} {group {select {zone {zone "' + z + '"}}} {include {player {player "' + n + '"}}} {exclude {state {state dead}}}}}',
  board: (z, n, k) => '{selector {source advanced} {group {select {zone {zone "' + z + '"}}} {include {player {player "' + n + '"}} {prop {prop human}}} {exclude {state {state dead}} {state {state linked}}}} {amount ' + k + '}}',
  type: (z, type) => '{selector {zone "' + z + '"} {type ' + type + '}}',
};
const ent = (i, s) => '{"' + i + '.entities" ' + s + ' {count {op ">"} {value 0}}}';
const cmp = (i, v, x) => '{"' + i + '.cmp_i" {var "' + v + '$"} {op "=="} {value ' + x + '}}';
const setI = (v, x) => '{"set_i" {var "' + v + '$"} {op "="} {value ' + x + '}}';
const delay = s => '{"delay" {time ' + num(s) + '}}';
const move = (z, n, w) => '{"actor_to_waypoint" ' + sel.all(z, n) + ' {drop orders} {waypoint "' + w + '"}}';
const board = (z, n, k, tag) => '{"board" ' + sel.board(z, n, k) + ' {vehicle {tag ' + tag + '}}}';
const toSide = (z, type, n) => '{"player" ' + sel.type(z, type) + ' {player "' + n + '"}}';
const spawn = (e, w) => '{"spawn" {entity "' + e + '"} {waypoint "' + w + '"}}';
const hold = (z, n) => '{"actor_state" ' + sel.human(z, n) + ' {move_mode hold} {fire_mode open}}';
const clone = (tag, w) => '{"waypoint" {who {type actor} {actors {tag ' + tag + '}}} {action {type start} {waypoint "' + w + '"} {clone} {make_squad} {approach "safe teleport & rotate"}}}';
const inactive = tag => '{"entity_state" {selector {tag ' + tag + '}} {inactive on}}';
const boardZ = z => '{"board" ' + sel.type(z, 'human') + ' {vehicle {zone "' + z + '"} {type vehicle}}}';
const free = (z, n) => '{"actor_state" ' + sel.human(z, n) + ' {move_mode free}}';
const cond0 = '{condition}';
const cond1 = t => '{condition {expression "1"} {terms ' + t + '}}';
const cond2 = (a, b) => '{condition {expression "1 & 2"} {terms ' + a + ' ' + b + '}}';
const trig = (name, cond, acts) => '{"' + name + '" ' + cond + ' {actions ' + acts.join(' ') + '}}';
const zoneDef = z => '{zone "circle" {position ' + num(z.x) + ' ' + num(z.y) + ' ' + num(z.z || 0) + '} {Name "' + z.name + '"} {Radius ' + num(z.r) + '}}';
const waypointsDef = (g, wps) => '{waypoints "' + g + '" ' + wps.map(w => '{"' + w.name + '" {position ' + num(w.x) + ' ' + num(w.y) + ' ' + num(w.z || 0) + '} {radius ' + num(w.r) + '}}').join(' ') + '}';
const varsDef = names => '{vars ' + names.map(v => '{"' + v + '"}').join(' ') + '}';
const entityDef = (e, uid, x, y) => '{Entity "' + e + '" ' + uid + ' {Position ' + num(x) + ' ' + num(y) + '} {Player 0}}';
const humanDef = (b, uid, x, y) => '{Human "' + b + '" ' + uid + ' {Position ' + num(x) + ' ' + num(y) + '} {Player 0}}';
const tagsDef = (tag, uid) => '{Tags "' + tag + '" ' + uid + '}';

// side detection for every team of the addition: o.teams = [{t, v (var), start (zone)}]
const find = o => [].concat(...o.teams.map(T => sides(n => trig('arsenal:' + o.id + ':find' + T.t + n, cond2(ent(1, sel.human(T.start, n)), cmp(2, T.v, 0)), [setI(T.v, n)]))));
const sides = f => Array.from({ length: SIDES }, (_, i) => f(i + 1));
const perSide = (o, f) => [].concat(...o.teams.map(T => sides(n => f(T, n, 'arsenal:' + o.id + ':' + T.t + n))));

// ---- the recipes. build(o) -> trigger lines; o carries resolved names (mi.js build):
//   a: {id, teams, all, to, minute, again:[s..]}        b: {id, teams, zone, segs:[s..]}
//   c: {id, teams(1), minute, at, drop, units:[{unit,n}], spawned, then}; with a crew: + crew {tag, slots:[{unit, w, z}]} (one waypoint and
//      one zone per vehicle, so each gets its own men)   d: {id, minute, at, shells}   e: {id, teams(1), all, minute, amount, tag}
const RECIPES = {
  a: {
    key: 'send', move: true, bot: true,
    src: 'report btp_t1_3: side detection + actor_to_waypoint with the advanced selector, {drop orders} [V 2 games + control]',
    build(o) {
      return find(o).concat(perSide(o, (T, n, name) => trig(name, cond1(cmp(1, T.v, n)),
        [delay(o.minute * 60), move(o.all, n, o.to)].concat(...o.again.map(s => [delay(s), move(o.all, n, o.to)])))));
    },
  },
  b: {
    key: 'hold', move: true, bot: true,
    src: 'report btp_t1_3: side detection and the human selector [V]; actor_state move_mode hold/free: stock 00b_usa-hurtgen/0.mi, 06_usa-dison/0.mi [V file], not run in a bot match',
    build(o) {
      return find(o).concat(perSide(o, (T, n, name) => {
        const acts = [hold(o.zone, n)];
        o.segs.forEach((s, i) => { acts.push(delay(s)); acts.push(i < o.segs.length - 1 ? hold(o.zone, n) : free(o.zone, n)); });
        return trig(name, cond2(ent(1, sel.human(o.zone, n)), cmp(2, T.v, n)), acts);
      }));
    },
  },
  c: {
    key: 'reinf', move: false, bot: false,
    src: 'report btp_t3 + btp_t3_3: spawn, set_i, then player on {type vehicle} keyed on the detected side [V 3 games]; crew: report T3c clone of an inactive placed man + player [V], board by zone [V, chain not run]; move: report btp_t1_3 [V]',
    build(o) {
      const sp = [delay(o.minute * 60)];
      if (o.crew) for (const s of o.crew.slots) sp.push(spawn(s.unit, s.w));
      else for (const u of o.units) for (let i = 0; i < u.n; i++) sp.push(spawn(u.unit, o.at));
      sp.push(setI(o.spawned, 1));
      const head = o.crew ? [trig('arsenal:' + o.id + ':crew', cond0, o.crew.groups.map(g => inactive(g.tag)))] : [];
      return find(o).concat(head, [trig('arsenal:' + o.id, cond0, sp)], perSide(o, (T, n, name) => {
        let acts = [delay(3)];
        if (!o.crew) acts.push(toSide(o.drop, 'vehicle', n));
        else {
          const S = o.crew.slots;
          acts = acts.concat(S.map(s => toSide(s.z, 'vehicle', n)), S.map(s => clone(s.tag, s.w)), [delay(3)], S.map(s => toSide(s.z, 'human', n)), [delay(2)], S.map(s => boardZ(s.z)));
        }
        return trig(name, cond2(cmp(1, T.v, n), cmp(2, o.spawned, 1)), acts.concat(o.then ? [delay(o.crew ? 5 : 2), move(o.drop, n, o.then)] : []));
      }));
    },
  },
  d: {
    key: 'arty', move: false, bot: false,
    src: 'spawn artillery_explosion at a waypoint, 0.5 s apart: stock 06_usa-dison/0.mi [V file]; spawn form: report btp_t3 [V]',
    build(o) {
      const acts = [delay(o.minute * 60)];
      for (let i = 0; i < o.shells; i++) { if (i) acts.push(delay(0.5)); acts.push(spawn('artillery_explosion', o.at)); }
      return [trig('arsenal:' + o.id, cond0, acts)];
    },
  },
  e: {
    key: 'board', move: false, bot: true,
    src: 'report btp_t2_3: board with {amount k} into a placed {Player 0} vehicle found by its tag; the vehicle takes the boarders\' side [V 2 games]',
    build(o) {
      return find(o).concat(perSide(o, (T, n, name) => trig(name, cond1(cmp(1, T.v, n)), [delay(o.minute * 60), board(o.all, n, o.amount, o.tag)])));
    },
  },
};

// ---- the crew of a vehicle, from its own army. Stock MP buy cards (set/multiplayer/units/vehicles.set [V as64 + MoW:AS2 files]): macro "v"
// = {content "* ( mp/%s/tankman:%n1 mp/%s/tankman2:%n2)"}, "vs" = {content "* ( mp/%s/vehicle_supporter:%n )"}, %s = the card's s(<army>);
// a card with its own {content ".. ( <breed>:n .. )"} names the crew outright (mission/mp-units `content`). soldiers.set has tankman,
// vehicle_supporter, rifle, rifle2 for eng ger ger2 jap rus usa [V].
// crewOfCard(norm line, army of its file) -> {army, breed ('' = not named)}
function crewOfCard(norm, fileArmy) {
  const s = String(norm || ''), side = ((/\bs\(\s*([A-Za-z0-9_]+)\s*\)/.exec(s) || /\bside\(\s*([A-Za-z0-9_]+)\s*\)/.exec(s) || [])[1] || fileArmy || '').toLowerCase();
  const mac = /\(\s*"([A-Za-z0-9_]+)"/.exec(s), ct = /\{\s*content\s+"([^"]*)"/i.exec(s);
  let breed = '';
  if (ct) { const m = /\(\s*([^\s:()]+)/.exec(ct[1]); if (m) breed = m[1].replace(/%side|%s/g, side); }
  else if (mac && mac[1] === 'v') breed = side ? 'mp/' + side + '/tankman' : '';
  else if (mac && mac[1] === 'vs') breed = side ? 'mp/' + side + '/vehicle_supporter' : '';
  return { army: side, breed: /%/.test(breed) ? '' : breed };
}
// crewPick(unit, lines [{norm, army} | norm], armies (of the buy lists it is in), known (Set of breed names of the unit sets, may be empty))
// -> {breed, army, from: 'card' | 'infantry'} | null. The card's crew first; else the army's basic infantry (rifle, rifle2, else its first
// mp/<army>/ breed); null when no army is known
function crewPick(unit, lines, armies, known) {
  const has = b => !!b && (!known || !known.size || known.has(b));
  let army = '';
  for (const l of lines || []) {
    const c = crewOfCard(l && typeof l === 'object' ? l.norm : l, (l && typeof l === 'object' && l.army) || String((armies || [])[0] || '').toLowerCase());   // a card with no side: the army of its buy list
    if (!army && c.army) army = c.army;
    if (c.breed && has(c.breed)) return { breed: c.breed, army: c.army || (armies || [])[0] || '', from: 'card' };
  }
  army = army || String((armies || [])[0] || '').toLowerCase();
  if (!army || !known || !known.size) return null;
  for (const b of ['mp/' + army + '/rifle', 'mp/' + army + '/rifle2']) if (known.has(b)) return { breed: b, army, from: 'infantry' };
  const any = [...known].filter(b => b.toLowerCase().indexOf('mp/' + army + '/') === 0).sort()[0];
  return any ? { breed: any, army, from: 'infantry' } : null;
}
module.exports = { RECIPES, SIDES, crewOfCard, crewPick, zoneDef, waypointsDef, varsDef, entityDef, humanDef, tagsDef, num, sel, forms: { ent, cmp, setI, delay, move, board, boardZ, toSide, spawn, clone, inactive, hold, free, trig, cond0, cond1, cond2 } };

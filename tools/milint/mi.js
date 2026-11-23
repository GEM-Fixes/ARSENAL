// milint/mi: .mi trigger/script linter (MIS-01, MIS-11, MAP-13 family). called by milint.js mapFile() for every .mi.
//   lintMi({ k, top, add, hint, maxPlayers })   top = lite {mission} block; add/hint(key,line,code,msg)
// vocabulary (commands, terms, statements, field keys) = micommands.json (gen-micommands.js, src path:line per entry).
// codes (no prefix = verified in src, WARN_ = engine reaction unverified):
//   MI_CMD_UNKNOWN        action child that is no command/statement          (CreateStatement: "Unknown thread statement")
//   MI_TERM_UNKNOWN       condition term that is no term                      (CreateTerm: "Unknown condition term")
//   MI_TRIGGER_KEY trigger child other than disabled on autoreset condition actions (skipped silently)
//   MI_COND_EXPR condition expression: bad char or term number that no term has (RESULT_ERROR)
//   MI_KEY_CASE           command/term field written with wrong case          (MIS-11, strcmp)
//   WARN_MI_KEY_UNKNOWN   command/term field no helper reader knows           (MIS-01, vocabulary = every DDA field in game/helper)
//   WARN_MI_ENTITY_DUP    two entities share an id (or two share a MID)
//   WARN_MI_LINK_REF      {Link a {b ..}} with an id that no entity of the mission has
//   WARN_MI_MID_REF       selector {mids ..} value no {MID} defines
//   WARN_MI_ZONE_REF / WARN_MI_EVENT_REF / WARN_MI_TRIGGER_REF / WARN_MI_WAYPOINT_REF / WARN_MI_TASK_REF / WARN_MI_VAR_REF
//                         name used by a trigger that Helpers does not define
//   MI_CAMERA_FOLLOW_MP   camera_follow_bone in a multiplayer mission crashes (MIS-41)
//   WARN_MI_ACTOR_STATE_ALL actor_state on a player-only selector can hit an entity with no brain (MIS-40)
//   MI_TERM_BARE          bare string inside {terms}: each term must be its own {"n.kind" ..} block (MIS-35)
//   MI_ACTIONS_EMPTY      trigger with an empty {actions} block: fatal at map load (MIS-48)
//   MI_GAME_SPEED_MP      game_speed in a multiplayer mission: no effect (MIS-47)
//   MI_SELECTOR_COMPONENT_STD destroyed_/broken_components straight in a standard selector: dropped (MIS-53)
//   MI_DEAD_VEHICLE       {state dead} with a vehicle prop: vehicles never read dead (MIS-42)
//   WARN_MI_NEAR_DISTANCE near term distance > 200: metres, not units (MIS-36)
//   WARN_MI_POSE_AT_START actor/squad_state {movement} in a no-condition trigger before any delay: lost (TST-123)
//   WARN_MI_PLAYER_ON_STATIC {Player n} on a flora/landscape/construction (not entourage) def (TST-85)
//   (info only) WARN_MI_SPAWN_COUNT: spawn points per team below maxPlayers/2; engine never compares, shipped maps do it
// Author: Imperator_Aug (ARSENAL, ia-4cb461c1)
const fs = require('fs'), path = require('path');
// game 'goh' (o.game): vocabulary = micommands.json + the delta micommands-goh.json (new commands, terms, fields; `gone` command fields),
//   plus GoH-only rules: WARN_MI_ZONEID_REF map point {zone {zoneId "x"}} names no Helpers zone {Name "x"} (GHMAP-03: the zone polygon is
//   the capture area), WARN_MI_KEY_GONE a command field GoH dropped (autoassign nearest, third_person_control default), and the GoH
//   expression lexer (term words and `and ` / `or ` accepted, modweb mission/goh-condition-terms-vars).
const VOC = {};
const vocab = (game) => {
  const g = game === 'goh' ? 'goh' : 'as2';
  if (VOC[g]) return VOC[g];
  const j = JSON.parse(fs.readFileSync(path.join(__dirname, 'micommands.json'), 'utf8'));
  let gone = {};
  if (g === 'goh') {
    const d = JSON.parse(fs.readFileSync(path.join(__dirname, 'micommands-goh.json'), 'utf8'));
    for (const s of ['commands', 'terms', 'fields']) j[s] = { ...j[s], ...d[s] };
    gone = d.gone || {};
  }
  const low = o => new Map(Object.keys(o).map(n => [n.toLowerCase(), n]));
  VOC[g] = { commands: low(j.commands), terms: low(j.terms), statements: low(j.statements), fields: new Set(Object.keys(j.fields)),
    fieldsLow: low(j.fields), triggerKeys: new Set(['disabled', 'on', 'autoreset', 'condition', 'actions']), gone };
  return VOC[g];
};
const lc = s => (s == null ? '' : String(s)).toLowerCase();
const BLOCKS = new Set(['if', 'while', 'loop', 'switch', 'case', 'default', 'select', 'thread']);   // statements whose children are statements
const COND_KEYS = new Set(['terms', 'expression', 'type', 'term']);
// keys that are structure, not engine fields: selector contents (filter terms), old-format inline terms
const val0 = n => (n.vals.length ? String(n.vals[0].value) : null);

function lintMi(o) {
  const { k, top, add, hint } = o, goh = o.game === 'goh', V = vocab(o.game);
  const none = { ids: new Set(), mids: new Set() }, mp = () => (o.mapIds ? o.mapIds() : none);
  const kid = (n, name) => n.kids.find(c => lc(c.name) === lc(name));
  const helpers = top.kids.find(c => lc(c.name) === 'helpers');

  // ---- entity ids / MIDs
  const ids = new Map(), mids = new Map();
  for (const e of top.kids) {
    if (e.vals.length >= 2 && (e.vals[1].k === 'INTEGER') && typeof e.name === 'string' && lc(e.name) !== 'link' && lc(e.name) !== 'tags' && (e.kids.length || lc(e.name) === 'entity')) {   // MSN-2: `{Entity "x" 0xid }` with no body still defines the id
      const id = Number(e.vals[1].value);
      if (ids.has(id)) add(k, e.line, 'WARN_MI_ENTITY_DUP', `entity id 0x${id.toString(16)} also used at line ${ids.get(id)}`); else ids.set(id, e.line);
      const m = kid(e, 'MID');
      if (m && m.vals.length) {
        const v = Number(m.vals[0].value);
        if (mids.has(v)) add(k, m.line, 'WARN_MI_ENTITY_DUP', `MID ${v} also used at line ${mids.get(v)}`); else mids.set(v, m.line);
      }
    }
  }
  if (o.defCat) for (const e of top.kids) {   // TST-85: Player is an actor keyword; static defs do not read it
    const pl = kid(e, 'Player');
    if (!pl || !e.vals.length || e.vals[0].k !== 'STRING') continue;
    const cat = o.defCat(String(e.vals[0].value));
    if (cat) add(k, pl.line, 'WARN_MI_PLAYER_ON_STATIC', `{Player} on "${e.vals[0].value}", a ${cat} def (static, not an actor): unexpected token and a load crash; delete the {Player} block`);
  }
  for (const e of top.kids) {
    if (lc(e.name) !== 'link' || !e.vals.length) continue;
    const refs = [Number(e.vals[0].value), ...e.kids.map(c => c.vals.length ? Number(c.vals[0].value) : (c.name !== null && /^(0x[0-9a-f]+|\d+)$/i.test(c.name) ? Number(c.name) : NaN))];
    for (const r of refs) if (!isNaN(r) && !ids.has(r) && !(mp().ids.has(r))) { add(k, e.line, 'WARN_MI_LINK_REF', `Link refers to entity 0x${r.toString(16)}: not defined in this mission`); break; }
  }

  // ---- Helpers definitions
  const def = { event: new Set(), zone: new Set(), trigger: new Set(), waypoint: new Set(), task: new Set(), var: new Set() };
  if (helpers) {
    for (const h of helpers.kids) {
      const n = lc(h.name);
      if (n === 'event' && h.vals.length) def.event.add(val0(h));
      else if (n === 'event') { /* nameless */ }
      else if (n === 'zone' || n === 'zones') { for (const z of n === 'zone' ? [h] : h.kids) { const nm = kid(z, 'Name'); if (nm && nm.vals.length) def.zone.add(val0(nm)); } }
      else if (n === 'triggers') for (const t of h.kids) { if (t.name !== null) def.trigger.add(t.name); }
      else if (n === 'waypoints') for (const w of h.kids) { if (w.name !== null) def.waypoint.add(w.name); }
      else if (n === 'tasks') for (const t of h.kids) { if (t.name !== null) def.task.add(t.name); }
      else if (n === 'vars') for (const t of h.kids) { if (t.name !== null) def.var.add(t.name); }
    }
  }
  const hasHelpers = !!helpers;
  if (goh && hasHelpers) for (const e of top.kids) {   // GHMAP-03: zoneId names the Helpers polygon zone that is the capture area
    for (const x of e.kids) {
      if (lc(x.name) !== 'extender' || lc(val0(x)) !== 'map_point') continue;
      const z = kid(x, 'zone'), zi = z && kid(z, 'zoneId'), name = zi && val0(zi);
      if (name && !def.zone.has(name)) add(k, zi.line, 'WARN_MI_ZONEID_REF', `map point zoneId "${name}": no Helpers zone {Name "${name}"} in this mission; the point has no capture polygon (GHMAP-03); add {zone "poly" {Name "${name}"} {Point ..}} or clear zoneId`);
    }
  }

  // ---- triggers
  const trg = helpers && helpers.kids.filter(c => lc(c.name) === 'triggers');
  const builtinVar = (code, name) => goh && code === 'WARN_MI_VAR_REF' && /@|^(players|game):/i.test(name);   // GoH built-in vars @players:count|composition, @game:frontlinesphase
  // GoH: a name used inside a shared include (n.file is the .inc, not this mission) is not checked: vanilla GoH shares one script include
  // between maps that each define only their own lanes (3v3_script.inc), and the mission still loads. Names the mission itself uses are checked.
  const fromInc = n => goh && n && n.file && lc(n.file) !== lc(k);
  const ref = (code, what, set, name, line, n) => { if (fromInc(n)) return; if (name !== null && !builtinVar(code, name) &&!(code === 'WARN_MI_TRIGGER_REF' && name.includes(':')) && hasHelpers && !set.has(name)) add(k, line, code, `${what} "${name}" is not defined in this mission or its map file's Helpers`); };
  if (trg) for (const tb of trg) for (const t of tb.kids) {
    for (const c of t.kids) {
      const n = c.name;
      if (!V.triggerKeys.has(n)) {
        if (V.triggerKeys.has(lc(n)) || [...V.triggerKeys].some(x => lc(n) === x)) add(k, c.line, 'MI_KEY_CASE', `trigger key '${n}' is case-sensitive: skipped silently (use ${[...V.triggerKeys].find(x => x === lc(n))})`);
        else add(k, c.line, 'MI_TRIGGER_KEY', `trigger "${t.name}" key '${n}' is not read (disabled on autoreset condition actions): skipped silently`);
      }
    }
    for (const c of t.kids) {
      if (c.name === 'condition') condition(c, true);
      else if (c.name === 'actions') statements(c);
    }
    const acts = t.kids.find(c => c.name === 'actions');
    if (acts && !acts.kids.length && !acts.vals.length) add(k, acts.line, 'MI_ACTIONS_EMPTY', `trigger "${t.name}" has an empty {actions} block: fatal at map load; give it at least one command (a {"mark" ..} print will do) or delete the trigger`);
    poseAtStart(t, acts);
  }
  // TST-123: a trigger with no condition terms arms on the first tick; a pose sent then is lost
  function poseAtStart(t, acts) {
    if (!acts || t.kids.some(c => c.name === 'disabled')) return;
    const cond = t.kids.find(c => c.name === 'condition'), terms = cond && kid(cond, 'terms');
    if (terms && terms.kids.length) return;
    for (const s of acts.kids) {
      const n = lc(s.name);
      if (n === 'delay') return;                // anything after a delay runs later
      if ((n === 'actor_state' || n === 'squad_state') && kid(s, 'movement')) {
        add(k, kid(s, 'movement').line, 'WARN_MI_POSE_AT_START', `trigger "${t.name}" has no condition: this ${n} {movement} runs on the first tick and the pose is lost; put a {delay {time 2}} before it, or send it again later`);
        return;
      }
    }
  }

  function condition(c, isTrigger) {
    const terms = kid(c, 'terms'), numbers = new Set();
    if (isTrigger) for (const x of c.kids) if (!COND_KEYS.has(x.name)) add(k, x.line, 'MI_TRIGGER_KEY', `condition key '${x.name}' is not read (terms expression type): skipped silently`);
    if (terms && terms.vals.some(v => v.k === 'STRING' || v.k === 'IDENT')) add(k, terms.line, 'MI_TERM_BARE', `{terms} holds bare ${terms.vals.filter(v => v.k === 'STRING' || v.k === 'IDENT').map(v => v.text).join(' ')}: fatal "Block terminator expected!" at map load; wrap each term in its own block, {"2.near" {..}}`);
    if (terms) {
      let auto = 1;
      for (const t of terms.kids) {
        const nm = String(t.name), m = /^(\d+)\.(.+)$/.exec(nm);
        const type = m ? m[2] : nm;
        if (m) numbers.add(Number(m[1])); else { while (numbers.has(auto)) auto++; numbers.add(auto); }
        if (!V.terms.has(lc(type))) add(k, t.line, 'MI_TERM_UNKNOWN', `condition term "${type}" is not a term type: engine logs "Unknown condition term"`);
        else termFields(t, lc(type));
      }
    }
    const ex = kid(c, 'expression');
    if (ex && ex.vals.length && ex.vals[0].k === 'STRING') {
      const text = String(ex.vals[0].value);
      const bad = goh ? text.replace(/\b(and|or)\s/gi, ' ').replace(/(\d+)[A-Za-z0-9.]*/g, '$1').match(/[^\d ()!&|]/) : text.match(/[^\d ()!&|]/);   // GoH: term word = leading digits, and/or words
      if (bad) add(k, ex.line, 'MI_COND_EXPR', `condition expression "${text}" has character '${bad[0]}': only term numbers ( ) ! & | and spaces lex`);
      else for (const m of text.matchAll(/\d+/g)) if (!numbers.has(Number(m[0]))) { add(k, ex.line, 'MI_COND_EXPR', `condition expression uses term ${m[0]}: no term has that number (evaluates to error)`); break; }
    }
  }
  function termFields(t, type) {
    for (const f of t.kids) keyCheck(f, `term ${type}`);
    if (type === 'event') { const id = kid(t, 'id'); if (id) ref('WARN_MI_EVENT_REF', 'event', def.event, val0(id), id.line, id); }
    else if (type === 'trigger') { const n = kid(t, 'name'); if (n) ref('WARN_MI_TRIGGER_REF', 'trigger', def.trigger, val0(n), n.line, n); }
    else if (type === 'task') { const n = kid(t, 'name'); if (n) ref('WARN_MI_TASK_REF', 'task', def.task, val0(n), n.line, n); }
    else if (type === 'cmp_i') { const n = kid(t, 'var'); if (n) ref('WARN_MI_VAR_REF', 'var', def.var, (val0(n) || '').replace(/\$$/, ''), n.line, n); }
    else if (type === 'near') { const d = kid(t, 'distance'), x = d ? Number(val0(d)) : NaN; if (x > 200) add(k, d.line, 'WARN_MI_NEAR_DISTANCE', `near distance ${x} is in metres (x20 = ${x * 20} units): a value in units fires far too early; divide by 20 (${x / 20})`); }
    deepRefs(t);
  }
  function keyCheck(f, what) {
    const n = f.name;
    if (n === null || V.fields.has(n) || V.commands.has(lc(n)) || V.terms.has(lc(n)) || V.statements.has(lc(n))) return;
    const fix = V.fieldsLow.get(lc(n));
    if (fix) add(k, f.line, 'MI_KEY_CASE', `${what}: key '${n}' is case-sensitive; the reader knows '${fix}': skipped silently`);
    else add(k, f.line, 'WARN_MI_KEY_UNKNOWN', `${what}: key '${n}' is no field any helper reader knows (typo? skipped silently)`);
  }
  // refs buried in selectors etc: zone names, mids, waypoint ids
  function deepRefs(n) {
    for (const c of n.kids) {
      const nm = lc(c.name);
      if ((nm === 'destroyed_components' || nm === 'broken_components') && lc(n.name) === 'selector' && lc(val0(kid(n, 'source') || { vals: [] })) !== 'advanced')
        add(k, c.line, 'MI_SELECTOR_COMPONENT_STD', `${nm} in a standard selector is dropped silently (count = plain tag count, true at once); use {source advanced} {group {select ..} {include {${nm} {masks ".."}}}}`);
      if (nm === 'include' || nm === 'selector') deadVehicle(c);
      if (nm === 'zone' && !c.kids.length && c.vals.length === 1) ref('WARN_MI_ZONE_REF', 'zone', def.zone, val0(c), c.line, c);
      else if (nm === 'mids') for (const v of c.vals) { const x = Number(v.value); if (!isNaN(x) && !fromInc(c) && hasHelpers && !mids.has(x) && !mp().mids.has(x)) add(k, c.line, 'WARN_MI_MID_REF', `selector mids ${x}: no entity has {MID ${x}}`); }
      else if ((nm === 'waypoint' || nm === 'transition') && !c.kids.length && c.vals.length === 1) ref('WARN_MI_WAYPOINT_REF', 'waypoint', def.waypoint, val0(c), c.line, c);
      deepRefs(c);
    }
  }
  // MIS-42: a killed vehicle reads not moveable / not operatable / empty, never dead
  function deadVehicle(n) {
    const v = nm => { const x = kid(n, nm); if (!x) return null; if (x.vals.length) return lc(x.vals[0].value); const y = kid(x, nm); return y && y.vals.length ? lc(y.vals[0].value) : null; };
    const pr = v('prop'), st = kid(n, 'state');
    if (!pr || !/^(vehicle|tank|car|cannon|gun|armored)/.test(pr) || v('state') !== 'dead') return;
    add(k, st.line, 'MI_DEAD_VEHICLE', `{state dead} on prop ${pr}: a killed vehicle reads not moveable, then empty, never dead, so this never matches; select {state {state "not moveable"}} instead`);
  }
  function statements(block, nested) {
    for (const s of block.kids) {
      const name = s.name === null ? '' : String(s.name), n = lc(name);
      if (s.name === null) continue;
      if (n === 'condition' || n === 'selector') { if (n === 'condition') condition(s, false); deepRefs(s); continue; }
      if (BLOCKS.has(n) || n === 'delay' && s.kids.some(c => V.commands.has(lc(c.name)))) {
        if ((n === 'case' || n === 'default') && lc(block.name) !== 'switch') add(k, s.line, 'MI_CMD_UNKNOWN', `'${name}' outside a switch statement`);
        statements(s, true);
        continue;
      }
      if (nested && V.fields.has(name)) continue;      // statement field (time, count, ..)
      if (!V.commands.has(n) && !V.statements.has(n)) {
        add(k, s.line, 'MI_CMD_UNKNOWN', `action "${name}" is no command or statement: engine logs "Unknown thread statement"`);
        continue;
      }
      if (V.statements.has(n)) { statements(s, true); continue; }     // delay etc: handled as keys below
      for (const f of s.kids) keyCheck(f, `command ${n}`);
      if (V.gone[n]) for (const f of s.kids) if (V.gone[n].includes(lc(f.name))) add(k, f.line, 'WARN_MI_KEY_GONE', `command ${n}: GoH dropped the field '${f.name}' (as64 has it; modweb mission/goh-script-command-fields): not read`);
      command(s, n);
      deepRefs(s);
    }
  }
  function command(s, n) {
    const g = nm => { const c = kid(s, nm); return c && val0(c); };
    const vname = nm => { const v = g(nm); return v == null ? null : v.replace(/\$$/, ''); };
    const line = nm => (kid(s, nm) || s).line, at = nm => kid(s, nm) || s;
    if (n === 'event') ref('WARN_MI_EVENT_REF', 'event', def.event, g('event'), line('event'), at('event'));
    else if (n === 'trigger') ref('WARN_MI_TRIGGER_REF', 'trigger', def.trigger, g('name'), line('name'), at('name'));
    else if (n === 'task') ref('WARN_MI_TASK_REF', 'task', def.task, g('name'), line('name'), at('name'));
    else if (n === 'set_i') ref('WARN_MI_VAR_REF', 'var', def.var, vname('var'), line('var'), at('var'));
    else if (n === 'camera_follow_bone' && /(^|[\/])multi[\/]/.test(k)) add(k, s.line, 'MI_CAMERA_FOLLOW_MP', 'camera_follow_bone in a multiplayer mission: g_followCamera is null, access violation when the trigger runs (MIS-41)');
    else if (n === 'game_speed' && /(^|[\/])multi[\/]/.test(k)) add(k, s.line, 'MI_GAME_SPEED_MP', 'game_speed in a multiplayer mission has no effect: the server step sets the speed; drop it (shorten slots or use a smaller map to save time)');
    else if (n === 'actor_state') {
      const sel = kid(s, 'selector');
      if (sel && sel.kids.length === 1 && lc(sel.kids[0].name) === 'player') add(k, sel.line, 'WARN_MI_ACTOR_STATE_ALL', 'actor_state selects every entity of a player: one with no brain is an access violation; add {type human} (MIS-40)');
    }
  }

  // ---- spawn points vs maxPlayers
  if (o.maxPlayers) {
    const teams = { a: new Set(), b: new Set() }, seen = { a: 0, b: 0 };
    for (const e of top.kids) {
      const x = kid(e, 'Extender');
      if (!x || lc(val0(x)) !== 'map_point') continue;
      const vis = kid(x, 'visor'), team = kid(x, 'team');
      if (!vis || lc(val0(vis)) !== 'spawnpoint' || !team) continue;
      const t = lc(val0(team));
      if (t !== 'a' && t !== 'b') continue;
      seen[t]++;
      const nm = kid(x, 'name'); teams[t].add(nm ? val0(nm) : String(e.line));
    }
    const need = Math.ceil(o.maxPlayers / 2);
    for (const t of ['a', 'b']) if (seen[t] && seen[t] < need) hint(k, top.line, 'WARN_MI_SPAWN_COUNT', `team ${t.toUpperCase()} has ${seen[t]} spawn point(s) for maxPlayers ${o.maxPlayers} (${need} per team)`);
    if (!seen.a && !seen.b) { /* SP or no points: nothing to say */ }
  }
}
module.exports = { lintMi, vocab };

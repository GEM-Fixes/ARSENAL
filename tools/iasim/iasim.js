// iasim: runs a unit's interaction scripts (set/interaction_entity/entity.set and its includes) against a simulated entity state.
// Rules:{machine,conditions,act-flow,act-entity,act-actor,flags}.md and tools/armorsim/RULES.md rules 24 to 35.
//
//   load(src, { modes }) -> lib { blocks: [{ tags, on: Map key -> { body, overload, file, line } }], files }
//       src = a tools/lib/sdlset source (mod over game; armorsim/origin.overlay adds the open document)
//   entity(lib, { tags, name }) -> ent { levels: [block], inflammation: { value s, file, line } | null }   levels = blocks whose tags
//       are all among the def's tags (or `generic`, or the name); inflammation = `inflammation_time` of the last level that sets it
//   newWorld(ent, state, opts) -> W     state = armorsim/after.newState(ctx) (parts, wounds, volOff), extended here with tags, flags,
//       ables, crew, weapons, chassis, burning, blasts, torn, reports, timers. opts { rng, armor, explosiveAmount, env, shooterTags }
//   fire(W, event, cmd)                 runs the handlers of the event now (level order: inherit / overload / {inherited})
//   drain(W, untilSeconds)              runs the timers in time order ({delay}, {delay_ex}, {delay_effect})
//   facts(W) -> [fact]                  what is true of the entity now, in plain keys (part:engine broken, crew:driver dead, ...)
//   W.unknown: Map name -> { kind 'action' | 'condition', file, line, n }   words with no rule here: not followed, never guessed
// Causes:
//   trigger(W, kind, info, fn)          runs fn(t) with a new current trigger t = { id, kind 'shell'|'blast'|'part'|'script'|'jet'|'fire', event, part,
//       volume, parent (the trigger current when it was opened), at, by, fact, first }; first = { event, file, line } of the first
//       handler run under it. fire() outside any trigger opens one from cmd (break/repair with a part: 'part'; bullet: 'shell';
//       blast_hit/blast: 'blast'; else 'script'). A script part change (components/component) opens a child 'part' trigger.
//       A named handler started by `call` or `delay_effect` opens a child 'script' trigger (event = its name, by = the call site);
//       `delay` / `delay_ex` bodies keep the trigger (and handler) current when they were scheduled.
//   W.triggers [t]   W.happened [{ at, what, fact, cause, by }] (fact = the facts() key it makes true, cause = trigger id,
//       by = { event, file, line } of the handler run)   W.tagLog [{ tag, op 'add'|'remove', at, cause, by }] every real change
//   opts.onBlast(W, { energy, radius: { inner, outer }, point, by, action }) is called by `blastwave` / `explode_inventory` inside a
//       child 'blast' trigger; energy = charge (c4), radius and point in engine units (20 per metre), point in model space.
// Randomness: `rand p` and ranged delays draw from opts.rng (seeded, armorsim/effects.js runs many samples).
// Author: Imperator_Aug (ARSENAL, ia-527d245a)
'use strict';
require('../lib/help')(__filename); // --help / -h: header usage, exit 0 (module only: no other command line)
const sdlx = require('../lib/sdlx');
const after = require('../armorsim/after');
const ROOT = 'resource/set/interaction_entity/entity.set';
const lc = s => String(s == null ? '' : s).toLowerCase();
const words = s => lc(s).split(/\s+/).filter(Boolean);
const isNum = t => t && (t.k === 'INTEGER' || t.k === 'FLOAT');
const tk = t => !t ? null : t.k === 'IDENT' ? lc(t.text) : t.k === 'STRING' ? lc(t.value) : isNum(t) ? String(t.value) : null;

// items of a block with (mod ..) groups laid flat; disabled blocks ({#x ..}, DMG-16) dropped
function flat(b) {
  const out = [];
  (function f(list) { for (const it of list) { if (it.k === 'MOD') f(it.items); else if (!(it.k === 'BLOCK' && it.disabled)) out.push(it); } })(b.items || []);
  return out;
}
const head = b => { const it = flat(b); return it.length && it[0].k !== 'BLOCK' ? it[0] : null; };
const args = b => flat(b).slice(1).filter(t => t.k !== 'BLOCK');
const blocks = b => flat(b).filter(t => t.k === 'BLOCK');

// ---------- loading ----------
const MODES = new Set(['inherit', 'overload']);
function load(src, o = {}) {
  const buf = src.get(ROOT);
  if (!buf) return { blocks: [], files: [], error: 'no ' + ROOT };
  const t = sdlx.read(buf, { file: ROOT, key: ROOT, open: (r, from) => src.open(r, from), onError: () => {}, preInclude: src.preInclude ? src.preInclude(ROOT) : [] });
  const out = [], files = new Set();
  (function find(b) {
    for (const k of blocks(b)) {
      const h = head(k);
      if (!h || h.k !== 'STRING') { find(k); continue; }
      const blk = { tags: words(h.value), on: new Map(), file: k.file, line: k.line, inflammation: null };
      for (const c of blocks(k)) {
        const ch = head(c); if (!ch || ch.k !== 'IDENT') continue;
        const n = lc(ch.text);
        if (n === 'inflammation_time') { const a = args(c).find(isNum); if (a) { blk.inflammation = a.value; blk.inflammationAt = { file: c.file, line: c.line }; } continue; }
        if (n !== 'on') continue;
        const a = args(c).map(tk).filter(x => x !== null);
        let mode = 'inherit';
        if (a.length && MODES.has(a[a.length - 1])) mode = a.pop();
        const key = a.join(' ');
        if (c.file) files.add(c.file);
        blk.on.set(key, { body: c, overload: mode === 'overload', file: c.file, line: c.line });
      }
      out.push(blk);
    }
  })(t.root);
  return { blocks: out, files: [...files] };
}
// FindEntityInfo: every block tag among the definition's tags, or `generic`, or the entity's own name
function entity(lib, e) {
  const have = new Set((e.tags || []).map(lc)); have.add('generic'); if (e.name) have.add(lc(e.name));
  const levels = lib.blocks.filter(b => b.tags.length && b.tags.every(t => have.has(t)));
  // inflammation_time (seconds in the scripts): the last matching block that sets it [I: the higher level wins, as for handlers]
  const fl = levels.filter(b => b.inflammation != null).pop();
  return { name: e.name || null, tags: [...have], levels, inflammation: fl ? Object.assign({ value: fl.inflammation }, fl.inflammationAt || { file: fl.file, line: fl.line }) : null };
}

// ---------- world ----------
function newWorld(ent, state, o = {}) {
  state.tags = state.tags || new Set(ent.tags.filter(t => t !== 'generic'));
  state.flags = state.flags || new Set();
  state.ables = state.ables || new Map();
  state.crew = state.crew || { dead: new Set(), allDead: false, out: false, off: new Set() };
  state.weapons = state.weapons || new Map();
  state.ik = state.ik || new Map();
  for (const k of ['burning', 'fires', 'blasts', 'torn', 'reports']) state[k] = state[k] || [];
  if (state.chassis === undefined) state.chassis = true;
  if (state.explosiveAmount === undefined) state.explosiveAmount = o.explosiveAmount == null ? null : Number(o.explosiveAmount);
  return { ent, state, rng: o.rng || Math.random, armor: o.armor || null, env: o.env || {}, shooterTags: new Set((o.shooterTags || []).map(lc)),
    time: 0, timers: [], seq: 0, unknown: new Map(), trace: o.trace ? [] : null, depth: 0, ctx: o.ctx || null, inputsUsed: new Set(), happened: [],
    triggers: [], tagLog: [], cur: null, by: null, onBlast: typeof o.onBlast === 'function' ? o.onBlast : null };
}
const r2 = x => Math.round(x * 100) / 100;
const curId = W => (W.cur ? W.cur.id : null);
// fact = the facts() key this makes true (defaults to the text itself)
const note = (W, what, fact) => { W.happened.push({ at: r2(W.time), what, fact: fact === undefined ? what : fact, cause: curId(W), by: W.by }); };
function trigger(W, kind, info, fn) {
  const i = info || {};
  // the blast trigger opened by blastwave is taken over by the first blast trigger opened under it (blast.apply's own): one group
  if (W.cur && W.cur.adopt && W.cur.kind === kind) {
    const c = W.cur; c.adopt = false;
    if (!c.volume && i.volume) c.volume = i.volume;
    if (!c.part && i.part) c.part = i.part;
    return fn ? fn(c) : undefined;
  }
  const t = { id: W.triggers.length + 1, kind, event: i.event ? lc(i.event) : null, part: i.part || null, volume: i.volume || null,
    parent: i.parent !== undefined ? i.parent : curId(W), at: r2(W.time), by: i.by !== undefined ? i.by : W.by, fact: i.fact || null, first: null };
  W.triggers.push(t);
  const cur = W.cur, by = W.by;
  W.cur = t;
  try { return fn ? fn(t) : undefined; } finally { W.cur = cur; W.by = by; }
}
const hasHandler = (W, ev) => W.ent.levels.some(L => L.on.has(lc(ev)));
// where a named handler was started from: the call / delay_effect action, inside the handler being run
const site = (W, node) => ({ event: W.by ? W.by.event : null, file: node.file || (W.by && W.by.file) || null, line: node.line || (W.by && W.by.line) || null });
function triggerKind(key, cmd) {
  if ((key === 'break' || key === 'repair') && cmd && cmd.part) return 'part';
  if (cmd && cmd.bullet) return 'shell';
  if (key === 'blast_hit' || key === 'blast') return 'blast';
  return 'script';
}
const STATE_WORD = ['working', 'broken', 'destroyed'];
// the part's state change behind a break / repair event: belongs to the group that made it (the parent of the part's own trigger)
function notePart(W, cmd) {
  const p = W.state.parts.get(lc(cmd.part)); if (!p) return;
  const c = W.cur, own = c && c.kind === 'part' && lc(c.part) === lc(p.name) && c.parent != null;
  const what = 'part:' + p.name + ' ' + STATE_WORD[p.damage], fact = p.damage ? what : null;
  if (c && c.kind === 'part' && lc(c.part) === lc(p.name)) c.fact = fact;   // destroyed overrides broken (one change)
  W.happened.push({ at: r2(W.time), what, fact, cause: own ? c.parent : curId(W), by: own ? c.by : W.by });
}
function unknown(W, kind, name, node) {
  const k = kind + ' ' + name, e = W.unknown.get(k) || { kind, name, file: node && node.file, line: node && node.line, n: 0 };
  e.n++; W.unknown.set(k, e);
}

// CallReaction (machine.md): the highest level that defines the event; inherit runs the lower levels first, overload only itself
function fire(W, event, cmd) {
  const key = lc(event);
  if (!W.cur) return trigger(W, triggerKind(key, cmd), { event: key, part: cmd && cmd.part, volume: cmd && cmd.volume }, () => fire(W, event, cmd));
  if ((key === 'break' || key === 'repair') && cmd && cmd.part) notePart(W, cmd);
  const L = W.ent.levels, idx = [];
  for (let i = 0; i < L.length; i++) if (L[i].on.has(key)) idx.push(i);
  if (!idx.length) return false;
  if (W.depth > 60) { unknown(W, 'action', 'call nesting over 60 (stopped)', null); return false; }
  const runAt = n => {
    if (n < 0) return;
    const h = L[idx[n]].on.get(key);
    if (!h.overload) runAt(n - 1);
    if (W.trace) W.trace.push({ at: W.time, event: key, file: h.file, line: h.line });
    const by = { event: key, file: h.file, line: h.line }, prev = W.by;
    if (W.cur && !W.cur.first) { W.cur.first = by; W.cur.adopt = false; }
    W.by = by;
    W.depth++;
    try { exec(W, blocks(h.body), Object.assign({}, cmd, { event: key }), () => runAt(n - 1)); } finally { W.depth--; W.by = prev; }
  };
  runAt(idx.length - 1);
  return true;
}
// a timer runs under the trigger and handler that scheduled it
function drain(W, until = 120) {
  let guard = 0;
  while (W.timers.length && guard++ < 5000) {
    W.timers.sort((a, b) => a.at - b.at || a.seq - b.seq);
    if (W.timers[0].at > until) break;
    const t = W.timers.shift();
    W.time = t.at;
    const cur = W.cur, by = W.by;
    W.cur = t.cause || null; W.by = t.by || null;
    try {
      if (!t.event) exec(W, t.body, t.cmd, null);
      else if (hasHandler(W, t.event)) trigger(W, 'script', { event: t.event, by: t.site || W.by }, () => fire(W, t.event, t.cmd));
    } finally { W.cur = cur; W.by = by; }
  }
}
// `center [spread]` = center +- spread, uniform
function range(W, a, i) {
  const c = isNum(a[i]) ? a[i].value : 0, s = isNum(a[i + 1]) ? a[i + 1].value : 0;
  return { v: s ? c - s + 2 * s * W.rng() : c, used: s || isNum(a[i + 1]) ? 2 : isNum(a[i]) ? 1 : 0 };
}
const fresh = () => ({ bullet: false, source: null, volume: null, part: null, value: undefined, sender: null, position: null, shot: null });
function kept(cmd) { return Object.assign({}, cmd, { bullet: false, shot: null, instigator: false }); }   // delay_ex: instigator, bone, bullet dropped

// ---------- conditions ----------
const SIDE = { front: 0, top: 1, left: 2, right: 3, back: 4, bottom: 5 };
const ENV = new Set(['water_level', 'under_water', 'in_water', 'rain', 'sunlight', 'velocity', 'effector_velocity', 'contact_velocity', 'min_speed', 'min_mass', 'user_control',
  'user_squad', 'simulating', 'terrain_fx', 'terrain_pp', 'air', 'altitude', 'difficulty', 'fogged', 'crush', 'can_crush', 'move_forward', 'move_backward', 'turn_left', 'turn_right',
  'personage', 'boarding', 'swimming', 'lying', 'mined', 'mine_effector', 'fallen', 'inactive', 'linked', 'contact_airborne_first', 'contact_airborne_second']);
function cmdPart(W, cmd) {
  if (cmd.argPart) return W.state.parts.get(lc(cmd.part)) || null;
  if (cmd.volume && W.ctx) return after.partOf(W.ctx, W.state, cmd.volume);
  return cmd.part ? W.state.parts.get(lc(cmd.part)) || null : null;
}
function volTags(W, name) { const v = W.ctx && after.armorVol(W.ctx, name); return v ? v.tags.map(lc) : name ? [lc(name)] : []; }
function partState(W, cmd, want, a) {
  const tags = a[0] && a[0].k === 'STRING' ? words(a[0].value) : [], count = isNum(a[1]) ? a[1].value : 0;
  if (!tags.length) { const p = cmdPart(W, cmd); return !p || p.damage === want; }
  const m = [...W.state.parts.values()].filter(p => tags.every(t => p.tags.includes(t)));
  if (count) return m.filter(p => p.damage === want).length >= count;
  return m.every(p => p.damage === want);
}
function cond(W, name, tok, a, cmd, node) {
  const S = W.state;
  if (tok.k === 'STRING') return S.flags.has(lc(tok.value));
  const s0 = a[0] && a[0].k === 'STRING' ? a[0].value : a[0] && a[0].k === 'IDENT' ? a[0].text : '';
  const n0 = isNum(a[0]) ? a[0].value : 0;
  switch (name) {
    case 'true': return true;
    case 'false': return false;
    case 'rand': return n0 > W.rng();
    case 'tagged': return S.tags.has(lc(s0));
    case 'stuff': return !!cmd.source && words(s0).every(t => cmd.source.tags.has(t));
    case 'volume': return !!cmd.volume && volTags(W, cmd.volume).includes(lc(s0));
    case 'min_energy': return cmd.value !== undefined && cmd.value > n0;
    case 'effector': W.inputsUsed.add('shooter tags'); return cmd.instigator !== false && words(s0).every(t => W.shooterTags.has(t));
    case 'work': return partState(W, cmd, 0, a);
    case 'broken': return partState(W, cmd, 1, a);
    case 'destroyed': return partState(W, cmd, 2, a);
    case 'component': { const p = cmdPart(W, cmd); return !!p && p.tags.includes(lc(s0)); }
    case 'name': return !!cmd.sender && words(s0).includes(lc(cmd.sender));
    case 'able': return S.ables.has(lc(s0)) ? S.ables.get(lc(s0)) : false;
    case 'hit_side': {
      const side = SIDE[lc(s0)];
      if (cmd.bullet) return cmd.value !== undefined && Math.abs(side - cmd.value) <= 1e-5;
      if (!cmd.position || cmd.localX === undefined) return false;
      return side === 0 ? cmd.localX > 0 : side === 4 ? cmd.localX <= 0 : false;
    }
    case 'explosive_amount':
      W.inputsUsed.add('explosive amount');
      return S.explosiveAmount !== null && S.explosiveAmount > n0;
    case 'operatable': return !S.deleted && !S.crew.allDead && !S.crew.out;
    case 'crew_in_place': case 'has_place': case 'place': return !S.crew.allDead && !S.crew.out && !S.crew.dead.has(lc(s0));
    case 'burned': return S.burning.length > 0;
    case 'impregnable': return false;
    case 'material': { const v = W.ctx && after.armorVol(W.ctx, cmd.volume); return !!v && lc(v.material || W.ctx.armor.defaultMaterial) === lc(s0); }
    case 'dead': return false;
    case 'volume_armored': { const v = W.ctx && after.armorVol(W.ctx, cmd.volume); return !!v && v.effectiveSides.some(x => x > 0); }
    default:
      if (ENV.has(name)) { W.inputsUsed.add(name); return W.env[name] === true; }
      unknown(W, 'condition', name, node);
      return false;
  }
}
// {if [not] COND args {..} else [not] COND2 {..} else {..}}: first true branch wins
function runIf(W, node, cmd, inherited) {
  const it = flat(node).slice(1);
  let i = 0;
  while (i < it.length) {
    let neg = false, ctok = null; const a = [];
    if (it[i].k !== 'BLOCK' && tk(it[i]) === 'not' && it[i].k === 'IDENT') { neg = true; i++; }
    if (i < it.length && it[i].k !== 'BLOCK') { ctok = it[i++]; while (i < it.length && it[i].k !== 'BLOCK' && !(it[i].k === 'IDENT' && lc(it[i].text) === 'else')) a.push(it[i++]); }
    const body = [];
    while (i < it.length && it[i].k === 'BLOCK') body.push(it[i++]);
    let yes = true;
    if (ctok) { yes = cond(W, ctok.k === 'IDENT' ? lc(ctok.text) : '', ctok, a, cmd, node); if (neg) yes = !yes; }
    if (yes) { exec(W, body, cmd, inherited); return; }
    if (i < it.length && it[i].k === 'IDENT' && lc(it[i].text) === 'else') i++; else break;
  }
}

// ---------- actions ----------
const QUIET = new Set(['link_sound', 'stop_sound', 'play_sound', 'start_sound', 'view', 'add_view', 'ani_play', 'ani_wind', 'ani_stop', 'bone', 'stat_notify', 'log', 'con',
  'set_skeleton', 'set_heater', 'player', 'reset_manual_control', 'drop_orders', 'attack_save', 'attack_load', 'kick_entity_manager', 'link_grenade_to_nearest_human', 'impulse',
  'inflammation_time', 'tex_mod', 'tex_morph', 'scale', 'update_shadow', 'depend_on_wind', 'use_local_light', 'mtl_enable_skin', 'use_blend_tex', 'update_visibility_patch',
  'kill_flags', 'talk', 'signal', 'rtfunc', 'break_window_in_hole', 'smoke']);
const NESTED_OTHER = new Set(['spawn', 'with_effector', 'with_linked_entity', 'for_each_link', 'take_off', 'spawn_human']);   // nested actions run on another entity
const bool = t => !t ? true : isNum(t) ? t.value !== 0 : !/^(0|false|no|off)$/i.test(tk(t) || '');
const STATE = { break: 1, destroy: 2, repair: 0 };
// a script's part change: the break / repair handlers it fires form a child group (body destroyed -> shields destroyed);
// the change itself is noted in the current group (notePart)
function partSet(W, p, want, cmd) {
  if (want === 1 && p.damage) return;                                        // ,904: break skips a damaged part
  if (p.damage === want) return;
  trigger(W, 'part', { event: want === 0 ? 'repair' : 'break', part: p.name, fact: want ? 'part:' + p.name + ' ' + STATE_WORD[want] : null },
    () => after.setDamage(W.state, p, want, cmd, (ev, c) => fire(W, ev, c)));
}
function tagChange(W, t, op) {
  const S = W.state;
  if (op === 'add') { if (S.tags.has(t)) return; S.tags.add(t); note(W, 'tag:' + t); }
  else { if (!S.tags.has(t)) return; S.tags.delete(t); }
  W.tagLog.push({ tag: t, op, at: r2(W.time), cause: curId(W), by: W.by });
}
// a blast made by an action: opts.onBlast inside a child 'blast' trigger (iasim applies nothing to armour itself)
function blastOut(W, action, b) {
  W.state.blasts.push({ at: W.time, action, energy: b.energy, radius: b.radius, point: b.point });
  const by = W.by ? Object.assign({}, W.by) : null;
  trigger(W, 'blast', { event: action, by }, t => { t.adopt = true; try { if (W.onBlast) W.onBlast(W, { energy: b.energy, radius: b.radius, point: b.point, by, action }); } finally { t.adopt = false; } });
}
const UNITS = 20;                                                            // g_unitsPerMeter
const xf = (m, v) => [0, 1, 2].map(i => v[0] * m[i] + v[1] * m[3 + i] + v[2] * m[6 + i] + m[9 + i]);   // row vector * [3x3 | t]
// action_blastwave: c4 = charge, r0 / r1 metres -> units (r1 raised to r0), at the entity origin
// (model space 0,0,0) + offset, or the command's position with `position`; `bone` puts the offset in the bone's frame
function blastwaveOf(W, a, cmd) {
  let charge = 0, r0 = 0, r1 = 0, bone = null, off = [0, 0, 0], usePos = false;
  for (let i = 0; i < a.length; i++) {
    const w = tk(a[i]);
    if (w === 'c4' && isNum(a[i + 1])) charge = a[++i].value;
    else if (w === 'r0' && isNum(a[i + 1])) r0 = a[++i].value * UNITS;
    else if (w === 'r1' && isNum(a[i + 1])) r1 = a[++i].value * UNITS;
    else if (w === 'bone' && a[i + 1] && a[i + 1].k === 'STRING') bone = a[++i].value;
    else if (w === 'offset') { off = [1, 2, 3].map(k => isNum(a[i + k]) ? a[i + k].value : 0); i += 3; }
    else if (w === 'position') usePos = true;
  }
  if (r0 > r1) r1 = r0;
  let point = usePos && cmd.position ? cmd.position.slice() : [0, 0, 0];
  point = point.map((x, i) => x + off[i]);
  if (bone && W.ctx && W.ctx.scene && W.ctx.scene.bones) {
    const b = W.ctx.scene.bones.find(x => lc(x.name) === lc(bone));
    if (b && b.world) point = xf(b.world, off);
  }
  return { energy: charge, radius: { inner: r0, outer: r1 }, point: point.map(r2) };
}
// action_explode inventory: share 0.4..0.9 of the carried charge; nothing at 0.1 or less; the first
// entry {amount "entity" radius} with amount >= the charge gives radius (r - r_prev) * entry / charge + r_prev, inner half of it.
// The engine uses that radius as units though the entry is read as metres (no g_unitsPerMeter there).
function explodeInventoryOf(W, node) {
  const S = W.state;
  W.inputsUsed.add('explosive amount');
  if (S.explosiveAmount === null || S.explosiveAmount === undefined) return null;
  const share = 0.4 + 0.5 * W.rng(), amount = S.explosiveAmount * share;
  const entries = blocks(node).map(b => flat(b).filter(t => t.k !== 'BLOCK')).map(t => ({ amount: isNum(t[0]) ? t[0].value : 0, radius: isNum(t[2]) ? t[2].value : 0 }));
  if (!(amount > 0.1) || !entries.length) return null;
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].amount < amount) continue;
    const prev = i ? entries[i - 1].radius : 0, r = (entries[i].radius - prev) * (entries[i].amount / amount) + prev;
    return { energy: r2(amount), radius: { inner: r * 0.5, outer: r }, point: [0, 0, 0] };
  }
  return null;
}
function exec(W, list, cmd, inherited) {
  for (const node of list) {
    const h = head(node); if (!h || h.k !== 'IDENT') continue;
    const name = lc(h.text), a = args(node), S = W.state;
    const s0 = a[0] && a[0].k === 'STRING' ? a[0].value : null;
    switch (name) {
      case 'if': runIf(W, node, cmd, inherited); break;
      case 'call': {
        const ev = a[0] ? tk(a[0]) : null; if (!ev) break;
        const ran = hasHandler(W, ev) && trigger(W, 'script', { event: ev, by: site(W, node) }, () => fire(W, ev, cmd));
        if (!ran && W.trace) W.trace.push({ at: W.time, event: ev, missing: true });
        break;
      }
      case 'inherited': if (inherited) inherited(); break;
      case 'set': if (s0 !== null) { if (bool(a[1])) S.flags.add(lc(s0)); else S.flags.delete(lc(s0)); } break;
      case 'tags': { const op = tk(a[0]); if (op === 'add' || op === 'remove') for (const t of words(a[1] && a[1].k === 'STRING' ? a[1].value : '')) tagChange(W, t, op); break; }
      case 'able': for (let i = 0; i < a.length; i++) if (a[i].k === 'STRING' || a[i].k === 'IDENT') { const on = isNum(a[i + 1]) ? a[i + 1].value !== 0 : true; S.ables.set(tk(a[i]), on); if (tk(a[i]) === 'select' && !on) note(W, 'cannot be selected'); } break;
      case 'delay': case 'delay_ex': {
        const r = range(W, a, 0), nm = a.slice(r.used).find(t => t.k === 'STRING');
        const key = nm ? 'n:' + lc(nm.value) : 'd:' + node.file + ':' + node.line;
        W.timers = W.timers.filter(t => t.key !== key);                       // a re-run restarts, never stacks
        W.timers.push({ at: W.time + Math.max(r.v, 0), seq: W.seq++, key, body: blocks(node), cmd: name === 'delay' ? fresh() : kept(cmd), cause: W.cur, by: W.by });
        break;
      }
      case 'delay_effect': {
        const r = range(W, a, 0), nm = a.slice(r.used).find(t => t.k === 'STRING');
        if (!nm) break;
        const key = 'n:' + lc(nm.value);
        W.timers = W.timers.filter(t => t.key !== key);
        W.timers.push({ at: W.time + Math.max(r.v, 0), seq: W.seq++, key, event: lc(nm.value), cmd: fresh(), cause: W.cur, by: W.by, site: site(W, node) });
        break;
      }
      case 'kill_delay': if (s0 !== null) W.timers = W.timers.filter(t => t.key !== 'n:' + lc(s0)); break;
      case 'components': {
        const tags = s0 !== null ? words(s0) : [], op = STATE[tk(a[s0 !== null ? 1 : 0])];
        if (op === undefined) break;
        for (const p of [...S.parts.values()]) if (tags.every(t => p.tags.includes(t))) partSet(W, p, op, cmd);
        break;
      }
      case 'component': { const op = STATE[tk(a[0])], p = cmdPart(W, cmd); if (op !== undefined && p) partSet(W, p, op, cmd); break; }
      case 'kill_crew':                                                       // a fact already true is not noted again
        if (s0) { if (!S.crew.dead.has(lc(s0))) note(W, 'crew:' + lc(s0) + ' dead'); S.crew.dead.add(lc(s0)); }
        else { if (!S.crew.allDead) note(W, 'crew:all dead'); S.crew.allDead = true; }
        break;
      case 'crew_emit': if (!S.crew.out) { S.crew.out = true; note(W, 'crew leaves'); } break;
      case 'crew_throw_off': case 'throw_off': S.crew.out = true; note(W, 'crew thrown off', 'crew leaves'); break;
      case 'crew_enable': { const on = bool(a[2]); if (!on) S.crew.off.add(tk(a[1])); else S.crew.off.delete(tk(a[1])); break; }
      case 'weapon_work': if (s0 !== null) { const on = bool(a[1]); if (S.weapons.get(lc(s0)) !== on && !(on && !S.weapons.has(lc(s0)))) note(W, 'weapon:' + lc(s0) + (on ? ' works again' : ' off')); S.weapons.set(lc(s0), on); } break;
      case 'chassis_work': { const on = bool(a[0]); if (S.chassis !== on) note(W, on ? 'can move again' : 'cannot move'); S.chassis = on; break; }
      case 'ik_enable': if (s0 !== null) { const on = bool(a[1]); if (S.ik.get(lc(s0)) !== on && !(on && !S.ik.has(lc(s0)))) note(W, 'aim:' + lc(s0) + (on ? ' moves again' : ' frozen')); S.ik.set(lc(s0), on); } break;
      case 'movement_limit': S.movementLimit = tk(a[0]); note(W, 'movement limit ' + S.movementLimit); break;
      case 'stunned': { const on = bool(a[0]); if (!!S.stunned !== on) note(W, on ? 'crew stunned' : 'crew no longer stunned'); S.stunned = on; break; }
      case 'explosive': S.explosive = bool(a[0]); break;
      case 'burn': {
        const w = a.map(tk);
        if (w.includes('stop') || w.includes('stop_retry')) { if (S.burning.length) note(W, 'fire out', null); S.burning = []; break; }
        if (w.includes('fake')) break;
        const vi = w.indexOf('volume'), vol = vi >= 0 && a[vi + 1] && a[vi + 1].k === 'STRING' ? a[vi + 1].value : (cmd.volume || null);
        S.burning.push({ at: W.time, volume: vol }); note(W, 'burns' + (vol ? ' at ' + vol : ''), 'burns');
        break;
      }
      case 'fire': S.fires.push({ at: W.time }); note(W, 'fire area'); break;
      case 'blastwave': {
        const b = blastwaveOf(W, a, cmd);
        note(W, 'explodes (c4 ' + b.energy + ')', 'explodes');
        blastOut(W, 'blastwave', b);
        break;
      }
      case 'explode_inventory': {
        const b = explodeInventoryOf(W, node);
        if (!b) { if (S.explosiveAmount === null) { S.blasts.push({ at: W.time, action: name, inventory: true }); note(W, 'ammunition explodes (amount not given)', 'explodes'); } break; }
        note(W, 'ammunition explodes (charge ' + b.energy + ')', 'explodes');
        blastOut(W, 'explode_inventory', b);
        break;
      }
      case 'tear': if (s0 !== null) { S.torn.push(lc(s0)); note(W, 'torn off: ' + lc(s0)); } break;
      case 'volumes': case 'volume': {
        const w = a.map(tk), i0 = name === 'volumes' && s0 !== null ? 1 : 0, on = w[i0] === 'enable', names = w.slice(i0 + 1);
        if (w[i0] !== 'enable' && w[i0] !== 'disable') break;
        const targets = [];
        if (name === 'volume') { if (cmd.volume) targets.push(lc(cmd.volume)); }
        else if (W.ctx) for (const v of Object.values(W.ctx.armor.volumes)) if (words(s0 || '').every(t => v.tags.map(lc).includes(t))) targets.push(lc(v.name));
        for (const t of targets) { const set = S.volOff.get(t) || new Set(); for (const n of names) { for (const x of n === 'all' ? ['bullet', 'blast', 'select', 'contact', 'visible'] : [n]) { if (on) set.delete(x); else set.add(x); } } S.volOff.set(t, set); }
        break;
      }
      case 'bullet_detonate': if (cmd.shot) cmd.shot.detonate = true; break;
      case 'damage_report': { const txt = a[1] && a[1].k === 'STRING' ? a[1].value : ''; S.reports.push({ at: W.time, part: s0, text: txt }); note(W, 'report: ' + txt.replace(/<[^>]*>/g, '')); break; }
      case 'delete': case 'hide': S.deleted = true; note(W, 'removed from the map'); break;
      case 'die': S.dead = true; note(W, 'dies'); break;
      case 'clear_inventory': S.explosiveAmount = 0; note(W, 'inventory emptied'); break;
      case 'unlink_trailer': note(W, 'trailer unhooked'); break;
      case 'stuff_detonate': note(W, 'detonates'); break;
      default:
        if (QUIET.has(name)) break;
        if (NESTED_OTHER.has(name)) break;                                    // effects on another entity (the spawned one, the shooter)
        unknown(W, 'action', name, node);
    }
  }
}

// ---------- what is true now ----------
function facts(W) {
  const S = W.state, out = [];
  for (const p of S.parts.values()) if (p.damage) out.push('part:' + p.name + (p.damage === 2 ? ' destroyed' : ' broken'));
  if (S.crew.allDead) out.push('crew:all dead'); else for (const r of S.crew.dead) out.push('crew:' + r + ' dead');
  if (S.crew.out) out.push('crew leaves');
  if (!S.chassis) out.push('cannot move');
  for (const [k, v] of S.weapons) if (!v) out.push('weapon:' + k + ' off');
  for (const [k, v] of S.ik) if (!v) out.push('aim:' + k + ' frozen');
  if (S.stunned) out.push('crew stunned');
  if (S.burning.length) out.push('burns');
  if (S.fires.length) out.push('fire area');
  if (S.blasts.length) out.push('explodes');
  for (const t of S.torn) out.push('torn off: ' + t);
  if (S.deleted) out.push('removed from the map');
  for (const t of ['destroyed', 'exploded', 'burned', 'crushed']) if (S.tags.has(t) && !W.ent.tags.includes(t)) out.push('tag:' + t);
  if (S.ables.get('select') === false) out.push('cannot be selected');
  return out;
}

module.exports = { load, entity, newWorld, fire, drain, facts, trigger, ROOT };

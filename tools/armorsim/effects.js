// armorsim/effects: one shot, all the way: armour (pen.js), the engine's events behind it (after.js) and the unit's interaction
// scripts run on those events (tools/iasim). Scripts roll dice (`rand`, ranged delays), so the shot is run `samples` times with a
// seeded generator; a fact that holds in every run is certain, the rest are chances.
//
//   effects(ctx, shell, rangeM, ray, o) -> {
//     samples, seed, until,
//     engine: { plates, events, end, penetration, notes }        the first run (the armour part has no dice; scripts can end the shell)
//     ends: [{ result, volume, chance }]                         where the shell ended, over all runs
//     facts: [{ fact, chance, at: { first, median }, group }]    state at `until` seconds, most likely first; at = seconds after the hit
//                                                                when that exact fact was first noted in a run; group = groups[].id
//     groups: [{ id, cause: { kind, event, part, volume, fact, file, line, from, by }, parent, chance, at: { first, median },
//                facts: [{ fact, chance, at }], tags }]
//         cause.file/line = the first handler run for it; cause.by = where it was started (a script part change, blast, or the
//         call / delay_effect site of a named handler: kind 'script', event = the handler's name), or null.
//         group fact chance = share of ALL runs in which the fact was first noted under this cause (never above the group's);
//         facts[i].group = the group it is most often noted in, facts[i].groups = every group it is noted in
//         everything one trigger set off (iasim.trigger: an engine event of the shot, a blast, a script part change that fires
//         break / repair). Key over runs = kind + event + part/volume + fact + file:line of the first handler (+ the blast's
//         caller); parent = the group current when it was opened (most common over runs). Facts true before the shot (o.state)
//         sit in a group of cause.kind 'before'. Per run, a trigger with no fact, tag change or blast of its own is left out and
//         its children move up to its parent; the key is the path of trigger keys to the root, so a group is never likelier
//         than its parent.
//     causes: [{ id, cause (as groups[].cause), parent, chance, at, facts: [{ fact, chance, at }], tags, via: [{ parent, chance }],
//                steps: [{ event, file, line, from, mod }], groups: [group ids] }]   the same tree made short (causesOf below):
//         helper script steps folded into the cause that started them (listed in steps), one cause however it was reached
//         (via = every parent it was reached under, most likely first; chances exact over runs); facts[i].cause / .causes
//     origin fields: from = 'unsaved'|'mod'|'other mod'|'vanilla'|'unknown', mod = the mod's name for 'mod' / 'other mod' (origin.js)
//     tags: [{ tag, op 'add'|'remove', chance, at: { first, median }, by: { event, file, line, from } | null, group }]   every real change
//     blasts: [{ source 'shell'|'script', by, at, point, energy, radius: { inner, outer }, radiusM, chance, group,
//                hits: [{ volume, part, result, chance, chanceIfBlast }] }]   chanceIfBlast = share of the runs with this blast
//         energy = charge (c4), radius in engine units (20 per metre; radiusM the same in metres), point in model units, at = median s
//         script blasts come from iasim's onBlast (blastwave, explode_inventory), the shell's from after.run's `blast`; blast.js
//         (when present) applies them to the unit through the same hooks. chance = share of all runs.
//     jets: [{ damage, distance, at, chance, group, cause, ends: [{ result, volume, chance }],
//              hits: [{ volume, part, events: [engine events at that volume], chance, chanceIfJet }] }]
//         the filling's `{Damage cumulative}` (after.run `jet`, RULES 44): a new bullet from the burst point; its engine events
//         open triggers under one cause of kind 'jet' (event 'jet') per run, so what it pierces groups under the jet
//     fires: [{ radius, heating, time, inflammation, inflammationAt, distance, chance, reaches, ignites, igniteAt: { first, median },
//               group, cause, volumes: [{ volume, chance }], notes }]
//         the filling's `{Damage fire}` (after.run `fire`, blast.fireOn, RULES 45): chance = runs where it burst, reaches / ignites =
//         runs where it reached / set the unit on fire; a fire that ignites is a cause of kind 'fire' (event 'burn', at = igniteAt).
//         inflammation = the unit's `inflammation_time` (s, iasim entity: last script block that sets it; o.inflammationTime overrides)
//         jets[i] also: index (k-th cumulative of the filling), start { volume, by } (where the shell burst, the event whose
//         script detonated it), key; one 'jet' cause per key (cause.jet = key, cause.volume = start volume). fires[i] the same
//         (index, start, key; cause.fire = key). Every from object also has layer + rel (origin.fields: the exact file read).
//         jets[i].point [x,y,z] = where the jet starts (the burst point after.run traces it from: model units, the frame of
//         engine.end.point / blasts[].point), jets[i].dir [x,y,z] = the unit vector it flies along (the shell's flight);
//         fires[i].point [x,y,z] = the fire's centre (its sphere's centre, same frame) or null when its place is not known.
//         A jet / fire seen in several runs keeps the point (and dir) of the first run that had it.
//     sources: { def, model, weapon, ammo (stamped stuff files), shell (shell.source stamped deep) }
//     ammoNotLoaded: { asked, weapon, loads: [names] } | null (armordata shell); engine.crewNotes: [{ key: 'shot' | 'blast' }]
//     cause kinds: 'shell' (engine event of the shot) | 'jet' | 'fire' | 'blast' | 'part' | 'script' | 'before'; blasts/jets/fires
//         carry group (groups[].id) and cause (causes[].id). engine.crewNote = RULES 43 (after.run).
//     whole: [{ key, chance }]                                   the tank as a whole (keys below)
//     scripts: { blocks: [tags], files: [{ file, from }], handlers: [{ event, file, line, from }] }   what ran in the first run
//     notFollowed: [{ kind, name, file, line, n }]               script words with no rule: skipped, never guessed
//     inputs: [names]                                            things the scripts asked that the shot does not say (given by o.env, o.explosiveAmount, o.shooterTags)
//     next: state                                                the first run's entity state, to carry into the next shot (wounds, broken parts)
//   }
//   o = { samples 400, seed 1, until 120, state (from a previous `next`), explosiveAmount, env, shooterTags, lib (iasim.load result),
//         inflammationTime (s) }
// whole keys: 'cannot move' (chassis off), 'cannot shoot' (a weapon place off or its aim frozen), 'crew leaves', 'crew dead',
//   'burns', 'explodes', 'out of action' (tag destroyed / exploded, crew all dead or out, or removed from the map).
// Author: Imperator_Aug (ARSENAL, ia-fd83bfba)
'use strict';
const after = require('./after'), origin = require('./origin');
const iasim = require('../iasim/iasim');

function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function cloneState(s) {
  const c = Object.assign({}, s);
  c.parts = new Map([...s.parts].map(([k, p]) => [k, Object.assign({}, p)]));
  c.wounds = s.wounds.map(w => Object.assign({}, w));
  c.volOff = new Map([...s.volOff].map(([k, v]) => [k, new Set(v)]));
  for (const k of ['tags', 'flags']) if (s[k]) c[k] = new Set(s[k]);
  for (const k of ['ables', 'weapons', 'ik']) if (s[k]) c[k] = new Map(s[k]);
  if (s.crew) c.crew = { dead: new Set(s.crew.dead), allDead: s.crew.allDead, out: s.crew.out, off: new Set(s.crew.off) };
  for (const k of ['burning', 'fires', 'blasts', 'torn', 'reports']) if (s[k]) c[k] = s[k].slice();
  return c;
}
const LIBS = new WeakMap();
function libOf(ctx, o) {
  if (o.lib) return o.lib;
  if (!LIBS.has(ctx.src)) LIBS.set(ctx.src, iasim.load(ctx.src, {}));
  return LIBS.get(ctx.src);
}
function whole(facts) {
  const has = re => facts.some(f => re.test(f)), out = [];
  if (has(/^cannot move$/)) out.push('cannot move');
  if (has(/^(weapon:.* off|aim:.* frozen)$/)) out.push('cannot shoot');
  if (has(/^crew (leaves|thrown off)$/)) out.push('crew leaves');
  if (has(/^crew:all dead$/)) out.push('crew dead');
  if (has(/^(burns|fire area)$/)) out.push('burns');
  if (has(/^explodes$/)) out.push('explodes');
  if (has(/^(tag:(destroyed|exploded)|crew:all dead|crew leaves|crew thrown off|removed from the map)$/)) out.push('out of action');
  return out;
}
const median = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };
const r3 = x => Math.round(x * 1000) / 1000, r2 = x => Math.round(x * 100) / 100;

// blast.js is written alongside (batch 2); effects works without it (blasts listed, not applied)
let BLAST;
function blastMod() {
  if (BLAST === undefined) { try { BLAST = require('./blast'); } catch (e) { BLAST = null; } }
  return BLAST && typeof BLAST.apply === 'function' ? BLAST : null;
}
const lcs = s => String(s == null ? '' : s).toLowerCase();
const at2 = t => (t.length ? { first: r2(Math.min(...t)), median: r2(median(t)) } : null);
const top = m => { let best = null, n = -1; for (const [k, c] of m) if (c > n) { best = k; n = c; } return best; };
const bump = (m, k, by = 1) => m.set(k, (m.get(k) || 0) + by);
const BEFORE = 'before', UPM = 20;                                          // g_unitsPerMeter
// group key of a trigger: kind + event + part/volume + fact + first handler (+ the blast's caller)
function trigKey(t) {
  const loc = t.first || t.by, at = loc && loc.file ? loc.file + ':' + loc.line : '';
  const by = t.kind === 'blast' && t.by && t.by.file ? t.by.file + ':' + t.by.line : '';
  const which = t.jet || t.fireOf || '';                                     // one cause per jet / fire of the filling (after.js fillId)
  return [t.kind, t.event || '', lcs(t.part || t.volume || ''), t.fact || '', at, by].join('|') + (which ? '|' + which : '');
}

// causes: the groups tree made short. own = Map group id -> own cause key (trigKey: kind + event + part/volume + fact +
// file:line of the first handler, + the caller for a blast; the path is left out). runs = [{ g: [[groupId, at]], f: [[groupId,
// fact, at]] }], one per run. 1 fold: a 'script' group with a parent, no tag, no part/blast child and two facts or fewer is a
// helper step: its facts go to the nearest kept ancestor, it is listed in that cause's steps. 2 merge: kept groups with the same
// own key are one cause; chances (cause, fact, via) are counted over runs, so they are exact. 3 drop part causes with nothing in
// them and nothing reached through them. 4 parent = the most likely via that makes no loop; order by time, then chance.
function causesOf(groups, own, runs, N) {
  const byId = new Map(groups.map(g => [g.id, g])), kidsOf = new Map();
  for (const g of groups) if (g.parent != null) { if (!kidsOf.has(g.parent)) kidsOf.set(g.parent, []); kidsOf.get(g.parent).push(g); }
  const helper = g => g.cause.kind === 'script' && g.parent != null && byId.has(g.parent) && !g.tags.length && g.facts.length <= 2 &&
    !(kidsOf.get(g.id) || []).some(c => c.cause.kind === 'part' || c.cause.kind === 'blast');
  const H = new Map(groups.map(g => [g.id, helper(g)]));
  const keptOf = id => { let g = byId.get(id); while (g && H.get(g.id)) g = byId.get(g.parent); return g ? g.id : null; };
  const ck = id => { const k = keptOf(id); return k == null ? null : own.get(k); };
  const C = new Map();
  for (const g of groups) {
    const k = ck(g.id);
    let c = C.get(k);
    if (!c) C.set(k, c = { key: k, rep: null, groups: [], steps: new Map(), tags: new Set(), n: 0, ats: [], facts: new Map(), via: new Map() });
    c.groups.push(g.id);
    if (H.get(g.id)) { const s = g.cause, sk = [s.event, s.file, s.line].join('|'); if (!c.steps.has(sk)) c.steps.set(sk, { event: s.event, file: s.file, line: s.line, from: s.from, mod: s.mod || null, layer: s.layer || null, rel: s.rel || null }); }
    else { if (!c.rep || g.chance > c.rep.chance) c.rep = g; for (const t of g.tags) c.tags.add(t); }
  }
  for (const r of runs) {
    const hit = new Map(), via = new Map(), fs = new Map();
    for (const [gid, at] of r.g) {
      const g = byId.get(gid);
      if (!g || H.get(gid)) continue;
      const k = own.get(gid), p = g.parent == null ? null : ck(g.parent);
      if (!hit.has(k) || at < hit.get(k)) hit.set(k, at);
      if (p !== k) { if (!via.has(k)) via.set(k, new Set()); via.get(k).add(p); }
    }
    for (const [gid, f, at] of r.f) { const k = ck(gid); if (k == null) continue; if (!fs.has(k)) fs.set(k, new Map()); const m = fs.get(k); if (!m.has(f) || (at !== null && at < m.get(f))) m.set(f, at); }
    for (const [k, at] of hit) { const c = C.get(k); c.n++; c.ats.push(at); }
    for (const [k, ps] of via) for (const p of ps) bump(C.get(k).via, p);
    for (const [k, m] of fs) for (const [f, at] of m) { const c = C.get(k); let e = c.facts.get(f); if (!e) c.facts.set(f, e = { n: 0, ats: [] }); e.n++; if (at !== null) e.ats.push(at); }
  }
  // 3: drop empty part causes (no fact, no tag, nothing reached through them), again until none is left
  for (let again = true; again;) {
    again = false;
    const used = new Set();
    for (const c of C.values()) for (const p of c.via.keys()) used.add(p);
    for (const [k, c] of C) if (c.rep.cause.kind === 'part' && !c.facts.size && !c.tags.size && !used.has(k)) { C.delete(k); again = true; }
  }
  // 4: parent = the most likely via whose chain does not lead back to the cause
  const par = new Map();
  const loops = (k, p) => { for (let q = p, i = 0; q != null && i <= C.size; q = par.get(q), i++) if (q === k) return true; return false; };
  const viaList = c => [...c.via].filter(([p]) => p === null || C.has(p)).sort((a, b) => b[1] - a[1] || (a[0] === null ? -1 : b[0] === null ? 1 : C.get(b[0]).n - C.get(a[0]).n));
  for (const c of [...C.values()].sort((a, b) => b.n - a.n || (a.key < b.key ? -1 : 1))) {
    const v = viaList(c).find(([p]) => !loops(c.key, p));
    par.set(c.key, v ? v[0] : null);
  }
  const kids = new Map(), roots = [];
  for (const c of C.values()) { const p = par.get(c.key); if (p == null) roots.push(c); else { if (!kids.has(p)) kids.set(p, []); kids.get(p).push(c); } }
  const tOf = c => (c.rep.cause.kind === BEFORE ? -1 : median(c.ats));
  const order = (a, b) => (tOf(a) - tOf(b)) || (b.n - a.n) || (a.key < b.key ? -1 : 1);
  const ids = new Map(), out = [];
  (function walk(list) { for (const c of list.sort(order)) { ids.set(c.key, out.length + 1); out.push(c); walk(kids.get(c.key) || []); } })(roots);
  return out.map(c => ({
    id: ids.get(c.key), cause: Object.assign({}, c.rep.cause), parent: par.get(c.key) == null ? null : ids.get(par.get(c.key)),
    chance: r3(c.n / N), at: c.rep.cause.kind === BEFORE ? null : at2(c.ats),
    facts: [...c.facts].map(([fact, e]) => ({ fact, chance: r3(e.n / N), at: at2(e.ats) })).sort((x, y) => y.chance - x.chance || x.fact.localeCompare(y.fact)),
    tags: [...c.tags],
    via: viaList(c).map(([p, n]) => ({ parent: p == null ? null : ids.get(p), chance: r3(n / N) })),
    steps: [...c.steps.values()],
    groups: c.groups.slice().sort((a, b) => a - b),
  }));
}

// sources.weapon / sources.ammo: the gun's and the shell's stuff files stamped (from, mod, layer, rel); sources.shell = every
// { file, line } of shell.source (armordata) stamped the same way. A JSON shell has none: nulls.
function shellSources(src, shell) {
  const one = k => (k ? origin.stamp(src, { file: k }) : null);
  return { weapon: one(shell && shell.weaponKey), ammo: one(shell && shell.ammoKey), shell: shell && shell.source ? origin.stampDeep(src, shell.source) : null };
}

function effects(ctx, shell, rangeM, ray, o = {}) {
  const N = Math.max(1, Math.min(20000, Math.floor(o.samples || 400))), seed = o.seed == null ? 1 : o.seed, until = o.until || 120;
  const lib = libOf(ctx, o), ent = iasim.entity(lib, { tags: ctx.armor.tags || [], name: ctx.armor.entity });
  const start = o.state || after.newState(ctx);
  const rng = mulberry(seed);
  const count = new Map(), times = new Map(), wcount = new Map(), ends = new Map(), unknown = new Map(), inputs = new Set();
  const G = new Map(), factGroup = new Map(), T = new Map(), B = new Map(), J = new Map(), F = new Map(), blastNotes = new Set(), runs = [];
  let first = null;
  for (let i = 0; i < N; i++) {
    const st = cloneState(start), runBlasts = [];
    let W = null;
    const runJet = new Map();                                                 // jet key (after.js fillId) -> its trigger in this run
    const hooks = {
      fire: (ev, cmd) => {
        // the HEAT jet (after.js flies it as a new bullet and marks it cmd.source.jet, RULES 44): its engine triggers, opened at the
        // top, go under the 'jet' trigger of that jet (one per jet key: filling index, numbers, start volume, detonating event),
        // so what each jet pierces groups under its own jet
        if (cmd && cmd.source && cmd.source.jet && W.cur && W.cur.kind === 'shell') {
          const jk = cmd.source.jetKey || 'jet';
          let jt = runJet.get(jk);
          if (!jt) {
            const st0 = /^jet\|/.test(jk) ? jk.split('|') : null;
            jt = iasim.trigger(W, 'jet', { event: 'jet', volume: st0 ? st0[3] || null : null, parent: W.cur.parent, by: null }, t => t);
            jt.jet = jk; runJet.set(jk, jt);
          }
          if (W.cur.parent === jt.parent && W.cur.id !== jt.id) W.cur.parent = jt.id;
        }
        return iasim.fire(W, ev, cmd);
      },
      // a trigger may name its own time (blast.fireOn: the fire catches after igniteAt s); a fire trigger carries which fire it is
      trigger: (kind, info, fn) => iasim.trigger(W, kind, info, t => { if (info && typeof info.at === 'number' && t) t.at = r2(info.at); if (info && info.fire && t) t.fireOf = info.fire; return fn(t); }),
      harmful: o.harmful,
      rng,                                                                    // after.run rolls the ricochet (a failed roll bursts)
      inflammationTime: o.inflammationTime != null ? o.inflammationTime : ent.inflammation ? ent.inflammation.value : undefined,   // RULES 45, seconds
    };
    // iasim hands the radius in engine units; blast.apply takes metres
    const onBlast = (w, b) => {
      const rec = { source: 'script', by: b.by || null, at: r2(w.time), point: b.point || null, energy: b.energy, radius: b.radius, hits: [], cause: w.cur ? w.cur.id : null };
      runBlasts.push(rec);
      const M = blastMod();
      if (!M) { blastNotes.add('blasts are listed, not applied to the unit (tools/armorsim/blast.js not loaded)'); return; }
      try {
        const rm = b.radius ? { inner: b.radius.inner / UPM, outer: b.radius.outer / UPM } : null;
        const r = M.apply(ctx, st, { point: rec.point, energy: rec.energy, radius: rm, inner: rm && rm.inner, source: 'script', by: rec.by }, hooks);
        rec.hits = (r && r.hits) || [];
      } catch (e) { blastNotes.add('a script blast could not be applied: ' + e.message); }
    };
    W = iasim.newWorld(ent, st, { rng, ctx, armor: ctx.armor, explosiveAmount: o.explosiveAmount, env: o.env, shooterTags: o.shooterTags, trace: i === 0, onBlast });
    const before = new Set(iasim.facts(W));
    const eng = after.run(ctx, shell, rangeM, ray, st, hooks);
    if (eng.blast) {                                                          // the shell's own filling: after.run -> blast.apply (radius in metres)
      const shellTrig = W.triggers.filter(t => t.kind === 'blast' && t.parent == null && !t.by);
      [eng.blast].concat(eng.blast.also || []).forEach((b, k) => {
        const outer = typeof b.radius === 'number' ? b.radius : b.radius && b.radius.outer, inner = typeof b.inner === 'number' ? b.inner : b.radius && b.radius.inner || 0;
        runBlasts.push({ source: 'shell', by: null, at: r2(b.at || 0), point: b.point || eng.end.burst || eng.end.point || null, energy: b.energy,
          radius: outer === undefined ? null : { inner: r2(inner * UPM), outer: r2(outer * UPM) }, hits: b.hits || [], cause: shellTrig[k] ? shellTrig[k].id : null });
      });
    }
    // the filling's jet and fire (after.run `jet` / `fire`): one record per run, its trigger = the run's 'jet' / the 'fire' trigger
    const fireT = W.triggers.filter(t => t.kind === 'fire');
    const runJets = (eng.jet || []).map(j => { const t = runJet.get(j.key || 'jet'); return { j, cause: t ? t.id : null }; });
    let fi = 0;
    const fireTrig = f => { if (f.key) { const t = fireT.find(x => x.fireOf === f.key); return t || null; } return fireT[fi++] || null; };
    const runFires = (eng.fire || []).map(f => { const t = f.igniteAt != null ? fireTrig(f) : null; return { f, cause: t ? t.id : null }; });
    iasim.drain(W, until);
    const now = iasim.facts(W);
    // this run's causes, grouped after all runs (a cause key that holds something in any run stays in every run)
    const byId = new Map(W.triggers.map(t => [t.id, { id: t.id, parent: t.parent, at: t.at, key: trigKey(t), t }]));
    const rootT = W.triggers.find(x => x.parent == null), rootId = rootT ? rootT.id : null;
    const valid = id => (id != null && byId.has(id) ? id : rootId);
    const content = new Set(), facts1 = [];
    let anyBefore = false;
    for (const f of new Set(now)) {
      count.set(f, (count.get(f) || 0) + 1);
      if (before.has(f)) { anyBefore = true; facts1.push({ f, id: null, at: null }); continue; }
      const h = W.happened.find(x => x.fact === f) || null, id = valid(h && h.cause);
      if (h) { if (!times.has(f)) times.set(f, []); times.get(f).push(h.at); }
      facts1.push({ f, id, at: h ? h.at : null });
      if (id == null) anyBefore = true; else content.add(id);
    }
    const tags1 = [], blasts1 = [];
    for (const x of W.tagLog) { const id = valid(x.cause); if (id != null) content.add(id); }
    for (const b of runBlasts.concat(runJets, runFires)) if (b.cause != null && byId.has(b.cause)) content.add(b.cause);
    const rec = { byId, valid, content, facts1, anyBefore, tags1, blasts1, gat: new Map(), ff: [], jets1: [], fires1: [] };   // gat/ff: this run's groups and facts (for causes)
    for (const { j, cause } of runJets) {
      const k = j.key || j.damage + '|' + j.distance;
      let e = J.get(k);
      if (!e) J.set(k, e = { damage: j.damage, distance: j.distance, index: j.index == null ? null : j.index, start: j.start || null, key: j.key || null,
        point: Array.isArray(j.point) ? j.point.slice() : null, dir: Array.isArray(j.dir) ? j.dir.slice() : null, n: 0, ends: new Map(), hits: new Map(), groups: new Map(), ats: [] });
      e.n++; e.ats.push(0);
      bump(e.ends, (j.end && j.end.result || '') + '|' + (j.end && j.end.volume || ''));
      const byVol = new Map();
      for (const ev of j.events || []) { if (!ev.volume) continue; const vk = ev.volume + '|' + (ev.part || ''); if (!byVol.has(vk)) byVol.set(vk, []); if (!byVol.get(vk).includes(ev.event)) byVol.get(vk).push(ev.event); }
      for (const [vk, evs] of byVol) bump(e.hits, vk + '|' + evs.join(','));
      if (cause != null && byId.has(cause)) rec.jets1.push([e, cause]);
    }
    for (const { f, cause } of runFires) {
      const k = f.key || [f.radius, f.heating, f.time].join('|');
      let e = F.get(k);
      if (!e) F.set(k, e = { f, n: 0, reach: 0, ignite: 0, igniteAts: [], volumes: new Map(), groups: new Map(), notes: new Set() });
      e.n++; if (f.reaches) e.reach++;
      if (f.igniteAt != null) { e.ignite++; e.igniteAts.push(f.igniteAt); for (const v of new Set(f.volumes || [])) bump(e.volumes, v); }
      for (const x of f.notes || []) if (e.notes.size < 6) e.notes.add(x);
      if (cause != null && byId.has(cause)) rec.fires1.push([e, cause]);
    }
    runs.push(rec);
    const seenT = new Set();
    for (const x of W.tagLog) {
      const k = x.tag + '|' + x.op;
      if (seenT.has(k)) continue;
      seenT.add(k);
      let e = T.get(k);
      if (!e) { e = { tag: x.tag, op: x.op, n: 0, ats: [], bys: new Map(), byObj: new Map(), groups: new Map() }; T.set(k, e); }
      e.n++; e.ats.push(x.at);
      const bk = x.by ? x.by.file + ':' + x.by.line + '|' + x.by.event : '';
      bump(e.bys, bk); if (x.by) e.byObj.set(bk, x.by);
      tags1.push([e, x.cause]);
    }
    const seenB = new Set();
    for (const b of runBlasts) {
      const rad = b.radius && typeof b.radius === 'object' ? [b.radius.inner, b.radius.outer].join('-') : b.radius;
      const k = [b.source, b.by ? b.by.file + ':' + b.by.line : '', b.energy, rad, (b.point || []).join(',')].join('|');
      let e = B.get(k);
      if (!e) { e = { b, n: 0, ats: [], hits: new Map(), groups: new Map() }; B.set(k, e); }
      if (b.cause != null && byId.has(b.cause)) blasts1.push([e, b.cause]);
      if (seenB.has(k)) continue;
      seenB.add(k); e.n++; e.ats.push(b.at);
      const hs = new Set();
      for (const h of b.hits) { const hk = [h.volume || '', h.part || '', h.result || ''].join('|'); if (!hs.has(hk)) { hs.add(hk); bump(e.hits, hk); } }
    }
    for (const k of whole(now)) wcount.set(k, (wcount.get(k) || 0) + 1);
    const ek = eng.end.result + '|' + (eng.end.volume || '');
    ends.set(ek, (ends.get(ek) || 0) + 1);
    for (const [k, u] of W.unknown) { const e = unknown.get(k) || Object.assign({}, u, { n: 0 }); e.n = Math.max(e.n, u.n); unknown.set(k, e); }
    for (const x of W.inputsUsed) inputs.add(x);
    if (i === 0) first = { eng, W, st };
  }
  // groups. A trigger stays when its cause key held a fact (first noted there), a tag change or a listed blast in some run
  // and something sits in or under it in this run; the others hand their children to their parent (chains of empty helper
  // calls do not show, a chain that is empty in one run is still shown the same way). Group key = the path of kept
  // trigger keys up to the root, so a group's runs always hold its parent group (a child is never likelier than its parent).
  const contentKeys = new Set();
  for (const r of runs) for (const id of r.content) contentKeys.add(r.byId.get(id).key);
  for (const r of runs) {
    const { byId, valid } = r, sub = new Set();                              // triggers with something in or under them this run
    for (const id of r.content) for (let p = id; p != null && byId.has(p) && !sub.has(p); p = byId.get(p).parent) sub.add(p);
    const keep = id => sub.has(id) && contentKeys.has(byId.get(id).key);
    const keptUp = id => { let p = byId.get(id).parent; while (p != null && byId.has(p) && !keep(p)) p = byId.get(p).parent; return p != null && byId.has(p) ? p : null; };
    const pk = new Map();
    const pathKey = id => {
      if (id == null) return BEFORE;
      if (!pk.has(id)) { const p = keptUp(id); pk.set(id, byId.get(id).key + (p != null ? ' < ' + pathKey(p) : '')); }
      return pk.get(id);
    };
    const seenG = new Set();
    for (const x of byId.values()) {
      if (!keep(x.id)) continue;
      const k = pathKey(x.id), p = keptUp(x.id);
      let g = G.get(k);
      if (!g) { g = { key: k, t: x.t, n: 0, ats: [], seqs: [], parent: p != null ? pathKey(p) : null, facts: new Map(), tags: new Set() }; G.set(k, g); }
      if (seenG.has(k)) continue;
      seenG.add(k); g.n++; g.ats.push(x.at); g.seqs.push(x.id); r.gat.set(k, x.at);
    }
    for (const { f, id, at } of r.facts1) {
      const gk = pathKey(id);
      r.ff.push([gk, f, at]);
      if (!factGroup.has(f)) factGroup.set(f, new Map());
      const fg = factGroup.get(f), e = fg.get(gk) || { n: 0, ats: [] };
      e.n++; if (at !== null) e.ats.push(at);
      fg.set(gk, e);
    }
    if (r.anyBefore) {
      let g = G.get(BEFORE);
      if (!g) { g = { key: BEFORE, t: { kind: 'before', event: null, part: null, volume: null, fact: null, at: 0 }, n: 0, ats: [], seqs: [], parent: null, facts: new Map(), tags: new Set() }; G.set(BEFORE, g); }
      g.n++; g.ats.push(0); g.seqs.push(0); r.gat.set(BEFORE, 0);
    }
    for (const [e, cause] of r.tags1) { const v = valid(cause); bump(e.groups, v == null ? null : pathKey(v)); }
    for (const [e, cause] of r.blasts1.concat(r.jets1, r.fires1)) bump(e.groups, pathKey(cause));
  }
  // origin fields of a file: { from, mod, layer, rel } (origin.fields; layer + rel = the exact file read, for the page's Open)
  const oCache = new Map(), orig = file => { if (!oCache.has(file)) oCache.set(file, origin.fields(ctx.src, file)); return oCache.get(file); };
  const byOut = by => (by && by.file ? Object.assign({ event: by.event || null, file: by.file, line: by.line }, orig(by.file)) : null);
  // groups: choose each fact's and tag's group, keep groups with content (or under which there is content), order as a tree
  // a fact may come from different causes in different runs: it sits in every group it was first noted under in some run
  const nOf = m => new Map([...m].map(([k, e]) => [k, e.n]));
  const facts = [...count].map(([fact, n]) => { const t = times.get(fact) || []; return { fact, chance: r3(n / N), at: at2(t), groupKey: top(nOf(factGroup.get(fact))) }; })
    .sort((a, b) => b.chance - a.chance || a.fact.localeCompare(b.fact));
  for (const f of facts) for (const [gk, e] of factGroup.get(f.fact)) { const g = G.get(gk); if (g) g.facts.set(f.fact, e); }
  const tags = [...T.values()].map(e => ({ tag: e.tag, op: e.op, chance: r3(e.n / N), at: at2(e.ats), by: byOut(e.byObj.get(top(e.bys))) || null, groupKey: top(e.groups) }))
    .sort((a, b) => b.chance - a.chance || a.tag.localeCompare(b.tag) || a.op.localeCompare(b.op));
  for (const t of tags) { const g = G.get(t.groupKey); if (g && t.op === 'add') g.tags.add(t.tag); }
  // empty triggers were pruned per run (above): every group holds something, its parent is part of its own key
  const parentOf = new Map([...G.values()].map(g => [g.key, g.parent && G.has(g.parent) ? g.parent : null]));
  const keep = new Set(G.keys());
  const kids = new Map(), roots = [];
  const order = (a, b) => (median(G.get(a).ats) - median(G.get(b).ats)) || (median(G.get(a).seqs) - median(G.get(b).seqs)) || (G.get(b).n - G.get(a).n) || (a < b ? -1 : 1);
  for (const k of keep) { const p = parentOf.get(k); if (p) { if (!kids.has(p)) kids.set(p, []); kids.get(p).push(k); } else roots.push(k); }
  const ids = new Map(), groups = [];
  (function walk(list) {
    for (const k of list.sort(order)) {
      const g = G.get(k), t = g.t, loc = t.first || t.by || null;
      ids.set(k, groups.length + 1);
      const lf = loc && loc.file ? orig(loc.file) : orig(null);
      groups.push({ id: groups.length + 1, cause: Object.assign({ kind: t.kind, event: t.event || null, part: t.part || null, volume: t.volume || null, fact: t.fact || null,
        file: loc && loc.file || null, line: loc && loc.line || null, from: lf.from, mod: lf.mod, layer: lf.layer, rel: lf.rel, by: byOut(t.by) }, t.jet ? { jet: t.jet } : {}, t.fireOf ? { fire: t.fireOf } : {}),
      parent: null, chance: r3(g.n / N), at: k === BEFORE ? null : at2(g.ats),
      facts: [...g.facts].map(([fact, e]) => ({ fact, chance: r3(e.n / N), at: at2(e.ats) })).sort((x, y) => y.chance - x.chance || x.fact.localeCompare(y.fact)),
      tags: [...g.tags], _key: k });
      walk(kids.get(k) || []);
    }
  })(roots);
  const own = new Map();                                                      // group id -> own cause key (the path left out)
  for (const g of groups) { const p = parentOf.get(g._key); g.parent = p ? ids.get(p) || null : null; own.set(g.id, trigKey(G.get(g._key).t)); delete g._key; }
  for (const f of facts) {
    f.group = ids.get(f.groupKey) || null; delete f.groupKey;
    f.groups = [...factGroup.get(f.fact)].sort((x, y) => y[1].n - x[1].n).map(([gk]) => ids.get(gk)).filter(Boolean);
  }
  const causes = causesOf(groups, own, runs.map(r => ({ g: [...r.gat].map(([k, at]) => [ids.get(k), at]).filter(x => x[0]), f: r.ff.map(([k, f, at]) => [ids.get(k), f, at]).filter(x => x[0]) })), N);
  const fc = new Map();
  for (const c of causes) for (const x of c.facts) { if (!fc.has(x.fact)) fc.set(x.fact, []); fc.get(x.fact).push([c.id, x.chance]); }
  for (const f of facts) { const l = (fc.get(f.fact) || []).sort((a, b) => b[1] - a[1]); f.cause = l.length ? l[0][0] : null; f.causes = l.map(x => x[0]); }
  for (const t of tags) { t.group = ids.get(t.groupKey) || null; delete t.groupKey; }
  const blasts = [...B.values()].map(e => ({ source: e.b.source, by: byOut(e.b.by), at: e.ats.length ? r2(median(e.ats)) : null, point: e.b.point, energy: e.b.energy,
    radius: e.b.radius, radiusM: e.b.radius ? { inner: r2(e.b.radius.inner / UPM), outer: r2(e.b.radius.outer / UPM) } : null, chance: r3(e.n / N), group: ids.get(top(e.groups)) || null,
    hits: [...e.hits].map(([k, n]) => { const [volume, part, result] = k.split('|'); return { volume: volume || null, part: part || null, result: result || null, chance: r3(n / N), chanceIfBlast: r3(n / e.n) }; })
      .sort((a, b) => b.chance - a.chance) }))
    .sort((a, b) => b.chance - a.chance || (a.at || 0) - (b.at || 0));
  const causeOfGroup = new Map();
  for (const c of causes) for (const gid of c.groups) causeOfGroup.set(gid, c.id);
  const causeOf = gid => (gid != null && causeOfGroup.has(gid) ? causeOfGroup.get(gid) : null);
  for (const b of blasts) b.cause = causeOf(b.group);
  const jets = [...J.values()].map(e => {
    const group = ids.get(top(e.groups)) || null;
    return { damage: e.damage, distance: e.distance, at: 0, chance: r3(e.n / N), group, cause: causeOf(group), index: e.index, start: e.start, key: e.key, point: e.point, dir: e.dir,
      ends: [...e.ends].map(([k, n]) => ({ result: k.split('|')[0] || null, volume: k.split('|')[1] || null, chance: r3(n / N) })).sort((a, b) => b.chance - a.chance),
      hits: [...e.hits].map(([k, n]) => { const [volume, part, evs] = k.split('|'); return { volume, part: part || null, events: evs ? evs.split(',') : [], chance: r3(n / N), chanceIfJet: r3(n / e.n) }; })
        .sort((a, b) => b.chance - a.chance) };
  }).sort((a, b) => b.chance - a.chance);
  const infl = ent.inflammation, inflammationAt = infl && infl.file ? Object.assign({ file: infl.file, line: infl.line }, orig(infl.file)) : null;
  const fires = [...F.values()].map(e => {
    const group = ids.get(top(e.groups)) || null;
    return { radius: e.f.radius, heating: e.f.heating, time: e.f.time, inflammation: e.f.inflammation, inflammationAt, distance: e.f.distance,
      chance: r3(e.n / N), reaches: r3(e.reach / N), ignites: r3(e.ignite / N), igniteAt: at2(e.igniteAts), group, cause: causeOf(group),
      volumes: [...e.volumes].map(([volume, n]) => ({ volume, chance: r3(n / N) })).sort((a, b) => b.chance - a.chance), notes: [...e.notes],
      index: e.f.index == null ? null : e.f.index, start: e.f.start || null, key: e.f.key || null, point: Array.isArray(e.f.point) ? e.f.point.slice() : null };
  }).sort((a, b) => b.chance - a.chance);
  if (blastNotes.size && first) first.eng.notes = (first.eng.notes || []).concat([...blastNotes]);
  const handlers = [], seen = new Set(), files = new Map();
  for (const t of first.W.trace || []) {
    if (t.missing || !t.file) continue;
    const O = orig(t.file);
    files.set(t.file, O);
    const k = t.event + '@' + t.file + ':' + t.line;
    if (!seen.has(k)) { seen.add(k); handlers.push(Object.assign({ event: t.event, file: t.file, line: t.line }, O)); }
  }
  // engine.crewNotes: stable keys for the crew notes (RULES 43): 'shot' always (after.run), 'blast' when a blast ran in some run
  if (first && first.eng) first.eng.crewNotes = [{ key: 'shot' }].concat(B.size ? [{ key: 'blast' }] : []);
  return {
    samples: N, seed, until,
    engine: first.eng,
    ends: [...ends].map(([k, n]) => ({ result: k.split('|')[0], volume: k.split('|')[1] || null, chance: r3(n / N) })).sort((a, b) => b.chance - a.chance),
    facts, groups, causes, tags, blasts, jets, fires,
    whole: ['cannot move', 'cannot shoot', 'crew leaves', 'crew dead', 'burns', 'explodes', 'out of action'].map(key => ({ key, chance: r3((wcount.get(key) || 0) / N) })),
    scripts: { blocks: ent.levels.map(b => b.tags.join(' ')), files: [...files].map(([file, o]) => Object.assign({ file }, o)), handlers },
    notFollowed: [...unknown.values()].sort((a, b) => b.n - a.n),
    inputs: [...inputs].sort(),
    sources: Object.assign({ def: origin.stamp(ctx.src, { file: ctx.armor.key }), model: ctx.model ? origin.stamp(ctx.src, { file: ctx.model }) : null }, shellSources(ctx.src, shell)),
    ammoNotLoaded: (shell && shell.ammoNotLoaded) || null,
    next: first.st,
  };
}

module.exports = { effects, causesOf, cloneState, whole, mulberry };

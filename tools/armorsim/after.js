// armorsim/after: the engine stage behind the armour verdict (RULES.md rules 24 to 35). One shot against the loaded unit gives
// the ordered events the engine raises and the entity state after each: wounds, broken parts, shell energy, where the shell ended.
// It runs no interaction script itself: every event is handed to hooks.fire (tools/iasim plugs in there), and a script may
// change the state between two engine steps (break a part, turn a volume's `bullet` able off, set bullet_detonate).
//
//   newState(ctx) -> state { parts: Map name -> { name, tags, repairTime, damage 0|1|2 }, wounds: [{ volume, part, point, damage }],
//                           volOff: Map volume name -> Set of ables turned off, shots: 0 }
//   partOf(ctx, state, volumeName) -> part | null          rule 30: {component "x"} of the volume, else the volume's name
//   setDamage(state, part, damage, cmd, fire)              rule 31: none -> destroyed passes through broken; fires break / repair
//   integrityAt(ctx, state, hit) -> 0..1                   rule 29: the most damaged wound of the same part inside the material's radius
//   run(ctx, shell, rangeM, ray, state, hooks) -> { events: [{ event, volume, part, side, value, sender, note }], plates, end:
//        { result, volume, point, energyLeft, burst }, penetration, notes, blast }
//        hooks.fire(event, cmd) (optional). cmd = { event, volume, part, value, sender, bullet: true, source: { tags }, position, side,
//        shot: { detonate: false } }; a script sets cmd.shot.detonate (bullet_detonate).
//        hooks.trigger(kind, info, fn) (optional, iasim.trigger): each engine event group (bullet_hit, pierce, break_armor, the
//        part change) and each blast runs inside one, so the scripts' results group by cause. hooks.rng() (optional) rolls
//        the ricochet: without it a ricochet end applies no blast (noted).
//        blast = the shell's own filling bursting (RULES 37): blast.apply's result (blast.js) or null; its events are also
//        appended to `events`. end.burst = the burst point (0.3 units before the face).
//        jet = [{ damage, distance, ...run result of the jet }] | null: each `{Damage cumulative}` of the filling flies a new
//        bullet from the burst point along the shot (RULES 44); its events are appended with jet: true, and every cmd it hands
//        to hooks.fire has source.jet = true (the main shell: false) and source.jetKey; each jet also has index, key, start
//        { volume, by } (fillId below; fires the same through blast.fireOn), point = the origin it is traced from (end.burst,
//        model units like end.point) and dir = the unit vector it is traced along (ray.dir normalized, the shell's flight).
//        end.detonatedBy = event whose script detonated it.
//        fire = [blast.fireOn result] | null: each `{Damage fire}` of the filling (RULES 45); events appended with fire: true.
//        crewNote = RULES 43 (no engine crew damage; text). ray.maxM (optional) = max distance in metres (the jet's reach).
//        ray.ground (optional number, RULES 49) = z of a flat ground plane in model units: a downward ray stops there (later hits
//        are not reached); a shell that met no volume, or flew through all of them, ends { result: 'ground', volume: null,
//        point: the ground point } and bursts there (end.burst = the point for fg / no_ricochet / DisableRicochet, else 0.3 units
//        above it); a jet carries ray.ground on. A spent shell / HEAT past its reach keeps its result.
// Not here: ricochet flight (the chance is given), spread.
// Author: Imperator_Aug (ARSENAL, ia-ccccf12e)
'use strict';
const pen = require('./pen');
const lc = s => String(s == null ? '' : s).toLowerCase();
const r2 = x => Math.round(x * 100) / 100;
const volName = id => String(id || '').split('/').pop();
// RULES 43: the engine hurts no crew member through the vehicle; only the vehicle's scripts (kill_crew, crew_emit...) or a hit on
// a seated human's own volumes (his own scripts) do. Neither is a crew result of this unit.
const CREW_NOTE = 'crew: the engine itself hurts no crew member when the vehicle is hit; crew results come only from the vehicle scripts (kill_crew, crew_emit, crew_throw_off). A soldier on a seat with a bone keeps his own volumes, so the same shell or blast can reach him as a separate unit (his own scripts take health); a seat without a bone is inactive and out of reach. Not followed here.';

function armorVol(ctx, name) {
  const V = ctx.armor.volumes, n = lc(name);
  for (const k of Object.keys(V)) if (lc(k) === n) return V[k];
  return null;
}
function newState(ctx) {
  const parts = new Map();
  for (const p of ctx.armor.parts || []) parts.set(lc(p.name), { name: p.name, tags: p.tags.map(lc), repairTime: p.repairTime || 0, damage: 0 });
  return { parts, wounds: [], volOff: new Map(), shots: 0 };
}
function partOf(ctx, state, name) {
  const v = armorVol(ctx, name), want = lc((v && v.component) || name);
  if (state.parts.has(want)) return state.parts.get(want);
  for (const p of state.parts.values()) if (p.tags.includes(want)) return p;
  return null;
}
//  / ChangeDamage
function setDamage(state, part, damage, cmd, fire) {
  const change = d => {
    part.damage = d;
    if (d === 0) state.wounds = state.wounds.filter(w => lc(w.volume) !== lc(part.name));   // repair removes the wounds of volumes named as the part
    if (fire) fire(d === 0 ? 'repair' : 'break', Object.assign({}, cmd, { event: d === 0 ? 'repair' : 'break', part: part.name, argPart: true }));
  };
  const prev = part.damage;
  if (damage === prev) return false;
  if (damage === 2 && prev === 0) change(1);
  if (damage !== part.damage) change(damage);
  return true;
}
function materialOf(ctx, name) {
  const v = armorVol(ctx, name), m = lc((v && v.material) || ctx.armor.defaultMaterial);
  return (ctx.materials && ctx.materials[m]) || null;
}
function areaOf(ctx, name) { const v = armorVol(ctx, name); return v && v.area ? ctx.armor.areas.find(a => a.name === v.area) || null : null; }
const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
function findWound(ctx, state, name, point) {
  const area = areaOf(ctx, name), whole = !!(area && area.flags && area.flags.wholeWound);
  if (whole) return state.wounds.find(w => lc(w.volume) === lc(name)) || null;
  const part = partOf(ctx, state, name), mat = materialOf(ctx, name), rad = mat ? mat.damageRadius : 1;
  let best = null;
  for (const w of state.wounds) {
    if (part && w.part !== part.name) continue;
    if (point && w.point && dist2(point, w.point) <= rad * rad && (!best || w.damage > best.damage)) best = w;
  }
  return best;
}
function integrityAt(ctx, state, hit) { const w = findWound(ctx, state, volName(hit.volumeId), hit.point); return 1 - (w ? w.damage : 0); }
//  (:153-166): only materials with wound sprites keep wounds
function addWound(ctx, state, name, point, damage) {
  const mat = materialOf(ctx, name);
  if (mat && !mat.wounds) return false;
  let w = findWound(ctx, state, name, point);
  if (!w) { const p = partOf(ctx, state, name); w = { volume: name, part: p ? p.name : null, point: point || null, damage: 0 }; state.wounds.push(w); }
  w.damage = Math.min(Math.max(w.damage + damage, 0), 1);
  return true;
}

function run(ctx, shell, rangeM, ray, state, hooks = {}) {
  const sim = require('./sim');
  const fire = hooks.fire || (() => {});
  const trig = hooks.trigger ? (kind, info, fn) => hooks.trigger(kind, info, fn) : (kind, info, fn) => fn();
  const events = [], notes = [], plates = [];
  // ray.maxM: the bullet's max distance (the cumulative jet, SetMaxDistance ): hits past it are not reached
  // ray.ground (RULES 49): a downward ray meets the ground; hits past it are not reached (the jet only within its max distance)
  let gh = sim.groundHit(ray);
  if (gh && ray.maxM >= 0 && gh.distanceM > ray.maxM) gh = null;
  const all = sim.hitsOf(ctx, ray).filter(h => (!(ray.maxM >= 0) || h.distanceM <= ray.maxM) && (!gh || h.distanceM <= gh.distanceM));
  const penAt = pen.penetrationAt(shell, rangeM);
  const end = { result: 'no_hit', volume: null, point: null, energyLeft: 1 };
  state.shots++;
  const src0 = () => ({ tags: new Set((shell.tags || []).map(lc)), weapon: shell.weapon || null, ammo: shell.ammo || null, jet: !!shell.jet, jetKey: shell.jetOf ? shell.jetOf.key : null });
  if (!all.length && gh) {
    onGround(end, gh, notes, 'the shell hits the ground ' + r2(gh.distanceM) + ' m along the ray before any volume');
    const more = {};
    const blast = shell.jet ? null : burst(ctx, shell, ray, state, hooks, end, src0(), notes, events, more);
    return { events, plates, end, penetration: r2(penAt), notes, blast, jet: more.jet || null, fire: more.fire || null, crewNote: CREW_NOTE };
  }
  if (!all.length) return { events, plates, end, penetration: penAt, notes: ['the ray misses every volume'], blast: null, jet: null, fire: null, crewNote: CREW_NOTE };
  // jet: true = this bullet is a filling's cumulative jet (burst() below); hooks see it as cmd.source.jet
  const src = src0();
  const shot = { detonate: false };
  const emit = (event, h, extra) => {
    const name = volName(h.volumeId), p = partOf(ctx, state, name);
    const cmd = Object.assign({ event, volume: name, part: p ? p.name : null, bullet: true, source: src, position: h.point, side: h.side, shot, value: h.side, sender: null }, extra || {});
    events.push({ event, volume: name, part: cmd.part, side: pen.SIDES[h.side], value: r2(cmd.value), sender: cmd.sender || undefined });
    fire(event, cmd);
    return cmd;
  };
  let scale = 1, firstHitM = null, first = true;
  for (let i = 0; i < all.length; i++) {
    const h = Object.assign({}, all[i]), name = volName(h.volumeId);
    const off = state.volOff.get(lc(name));
    if (off && off.has('bullet')) continue;                                   // a script turned the volume's bullet able off
    if (shell.cumulative > 0) {                                               // rule 26
      if (firstHitM === null) firstHitM = h.distanceM;
      else if (h.distanceM > firstHitM + shell.cumulative) { end.result = 'beyond_jet'; end.volume = name; end.point = h.point; break; }
    }
    if (first) {                                                              // rule 25
      first = false;
      const p0 = partOf(ctx, state, name);
      trig('shell', { event: 'bullet_hit', volume: name, part: p0 ? p0.name : null }, () => emit('bullet_hit', h));
      if (shot.detonate) { end.result = 'detonate'; end.volume = name; end.point = h.point; end.detonatedBy = 'bullet_hit'; notes.push('a bullet_hit script detonated the shell'); break; }
    }
    h.integrity = integrityAt(ctx, state, h);
    pen.fillFromArmor(h, { armor: ctx.armor, materials: ctx.materials || undefined });
    const v = pen.plate({ energy: penAt * scale, energyScale: scale, shell, harmful: hooks.harmful, firstStep: h.distanceM === 0 }, h, { armor: ctx.armor, materials: ctx.materials || undefined });
    plates.push({ volume: name, side: pen.SIDES[v.side], enter: v.enter, nominal: r2(v.nominal), effective: r2(v.effective), pen: r2(v.penetration), result: v.result, integrity: r2(h.integrity), armorDamage: r2(v.armorDamage), broken: v.broken, chance: v.chance });
    const detTh = shell.detonationThickness == null ? 1e38 : shell.detonationThickness;
    const stopped = v.absorbed >= detTh;
    if (v.result === 'missed') { end.result = 'spent'; end.volume = name; end.point = h.point; break; }
    if (v.wound && stopped) addWound(ctx, state, name, h.point, v.armorDamage);   // rule 27
    if (v.wound && !stopped) {                                                    // rule 28
      if (v.pierceEvent) { const pp = partOf(ctx, state, name); trig('shell', { event: 'pierce', volume: name, part: pp ? pp.name : null }, () => emit('pierce', h)); }
      addWound(ctx, state, name, h.point, v.armorDamage);
      scale = v.energyScale;
      if (v.broken) {
        const p = partOf(ctx, state, name), ev = p && p.damage ? 'break_armor_again' : 'break_armor';
        let det = false;
        trig('shell', { event: ev, volume: name, part: p ? p.name : null }, () => {
          emit(ev, h, { value: v.absorbed, sender: 'pierce' });
          if (shot.detonate) { det = true; return; }
          const p2 = partOf(ctx, state, name);
          if (p2 && p2.damage === 0) {
            events.push({ event: 'part broken', volume: name, part: p2.name });
            trig('part', { event: 'break', part: p2.name, volume: name }, () =>
              setDamage(state, p2, 1, { volume: name, bullet: true, source: src, position: h.point, side: h.side, shot, value: v.absorbed, sender: 'pierce' }, fire));
          }
        });
        if (det) { end.result = 'detonate'; end.volume = name; end.point = h.point; end.detonatedBy = ev; notes.push('a break_armor script detonated the shell'); break; }
      }
    }
    if (v.result !== 'penetrate') {
      end.result = v.result; end.volume = name; end.point = h.point;
      if (v.result === 'ricochet') { end.chance = v.chance; notes.push('ricochet chance ' + r2(v.chance) + ', else the shell bursts on the plate; the flight after a ricochet is not followed'); }
      break;
    }
    end.result = 'passed'; end.volume = name; end.point = h.point;
  }
  // flown through every volume before the ground (or every one skipped): it ends on the ground, unless a HEAT shell's reach
  // (rule 26, set at its first volume) is over before the ground (: the bullet is dropped, no burst)
  if (gh && (end.result === 'passed' || end.result === 'no_hit')) {
    if (shell.cumulative > 0 && firstHitM !== null && gh.distanceM > firstHitM + shell.cumulative) notes.push('the ground (' + r2(gh.distanceM) + ' m along the ray) is past the HEAT reach (' + r2(firstHitM + shell.cumulative) + ' m): the shell is gone before it, no burst');
    else onGround(end, gh, notes, 'after ' + (end.volume ? 'the last volume (' + end.volume + ')' : 'the ray') + ' the shell hits the ground ' + r2(gh.distanceM) + ' m along the ray');
  }
  end.energyLeft = r2(scale);
  const more = {};
  const blast = shell.jet ? null : burst(ctx, shell, ray, state, hooks, end, src, notes, events, more);
  return { events, plates, end, penetration: r2(penAt), notes, blast, jet: more.jet || null, fire: more.fire || null, crewNote: CREW_NOTE };
}
// RULES 37: the shell bursts on the game and on a failed ricochet roll, at 0.3 units before
// the face (BULLET_SURFACE_OFFSET). A shell that passed (or is spent, or past the HEAT reach) flies on: no burst
// this unit (lastHit; HIT_MISSED).
// The filling is spawned in its list order: blastwave (blast.apply), cumulative = a new bullet, the
// jet (RULES 44: run again from the burst point, `cumulative_charge` as its stuff), fire (blast.fireOn, RULES 45); flash only
// blinds humans not seated (RULES 46). Returns the first blast (or null); jets and fires go to out.jet / out.fire.
// identity of one jet / fire of the filling: the k-th of its kind in the list, its numbers, where the shell burst (start volume) and
// the event whose script detonated it (end.detonatedBy, null = the engine). key = all of it: the same jet over runs has one key,
// two jets of one burst (or one filling bursting at two volumes) have two.
function fillId(kind, index, nums, end) {
  const start = { volume: end.volume || null, by: end.detonatedBy || null };
  return { index, key: [kind, index, nums.join(','), start.volume || '', start.by || ''].join('|'), start };
}
const jetId = (index, D, dist, end) => fillId('jet', index, [D, dist], end);
// RULES 49: the shell ends on the ground (no volume): end.result 'ground', volume null, point = where the ray meets the ground
function onGround(end, gh, notes, why) {
  end.result = 'ground'; end.volume = null; end.point = gh.point.slice();
  notes.push(why);
}
function burst(ctx, shell, ray, state, hooks, end, src, notes, events, out) {
  const blast = require('./blast');
  let bursts = end.result === 'detonate' || end.result === 'no_penetration' || end.result === 'ground';
  if (end.result === 'ricochet') {
    if (typeof hooks.rng === 'function') bursts = !(end.chance >= hooks.rng());          // chance < Random(1) -> Detonate (:568)
    else notes.push('if it does not bounce (chance ' + r2(1 - (end.chance || 0)) + ') the shell bursts on the plate: that blast is not applied without a dice');
  }
  if (!bursts || !end.point) return null;
  const onEarth = end.result === 'ground', where = end.volume || 'the ground';
  // RULES 49: on the ground a shell with ammo tag fg / no_ricochet or a DisableRicochet gun detonates at the ground point
  // any other shell first rolls a ricochet off the ground's material, 0.3 units up along the ground normal
  // (:743-751), and bursts there when it does not bounce (:560-571). The ground type is not known here: taken as no bounce [I].
  if (onEarth && !shell.noRicochet) notes.push('the engine first rolls a ricochet off the ground type\'s material (not known here): if it bounces the shell flies on and does not burst here; taken as no bounce');
  const fill = blast.ofShell(shell), list = ((shell && shell.damage) || []).filter(x => /^(blastwave|cumulative|fire)$/.test(lc(x.type)));
  if (!list.length) { notes.push('the shell bursts at ' + where + ': its filling has no blastwave, jet or fire'); return null; }
  const d = ray.dir, l = Math.hypot(d[0], d[1], d[2]) || 1, dir = d.map(x => x / l);
  end.burst = !onEarth ? end.point.map((x, i) => x - dir[i] * 0.3) : shell.noRicochet ? end.point.slice() : [end.point[0], end.point[1], end.point[2] + 0.3];
  let first = null, bi = 0, ci = 0, fi = 0;
  for (const x of list) {
    const t = lc(x.type);
    if (t === 'blastwave') {
      const f = fill.all[bi++];
      const r = blast.apply(ctx, state, { point: end.burst, energy: f.energy, radius: f.radius, inner: f.inner, source: 'shell', by: null, src }, hooks);
      for (const e of r.events) events.push(Object.assign({}, e, { blast: true }));
      if (!first) first = r; else (first.also = first.also || []).push(r);
    } else if (t === 'cumulative') {
      const D = +x.damage || 0, dist = +x.distance || 0;
      // launcher params aimRange = distance, projectileDamage = damage; flat over the reach [I]
      const jetShell = { weapon: shell.ammo || null, ammo: 'cumulative_charge', tags: ['cumulative_charge'], calibre: 0, table: [[0, D]],
        damage: [], cumulative: 0, detonationThickness: 1e38, applyProjectile: false, jet: true, jetOf: jetId(ci++, D, dist, end) };
      const jr = run(ctx, jetShell, 0, Object.assign({ origin: end.burst, dir, maxM: dist }, typeof ray.ground === 'number' ? { ground: ray.ground } : {}), state, Object.assign({}, hooks, { rng: hooks.rng }));
      for (const e of jr.events) events.push(Object.assign({}, e, { jet: true }));
      (out.jet = out.jet || []).push(Object.assign({ damage: D, distance: dist }, jr, jetShell.jetOf, { point: end.burst.slice(), dir: dir.slice() }));
      notes.push('the cumulative jet (' + D + ' mm, ' + dist + ' m) ends ' + jr.end.result + (jr.end.volume ? ' at ' + jr.end.volume : ''));
    } else {
      const fr = blast.fireOn(ctx, state, Object.assign({ point: end.burst, radius: x.radius, heating: x.heating, time: x.time, src }, fillId('fire', fi++, [x.radius, x.heating, x.time], end)), hooks);
      for (const e of fr.events) events.push(Object.assign({}, e, { fire: true }));
      (out.fire = out.fire || []).push(fr);
    }
  }
  if (first) notes.push('the shell bursts at ' + where + ' (c4 ' + fill.energy + ', ' + fill.inner + ' to ' + fill.radius + ' m): ' + first.hits.length + ' volumes hit by the blast');
  else notes.push('the shell bursts at ' + where + ': its filling has no blastwave');
  return first;
}

module.exports = { newState, partOf, setDamage, integrityAt, addWound, findWound, run, armorVol, volName };

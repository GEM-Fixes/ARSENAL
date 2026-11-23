// armorsim/blast: a blast wave on the loaded unit, the way the engine applies one (RULES.md rules 36 to 42,
//  Start / Update / HitTarget, the game). Used by after.js for the
// shell's own filling and by effects/iasim for a script `blastwave` (through opts.onBlast).
//
//   ofShell(shell) -> { energy, radius, inner, all: [{ energy, radius, inner }] } | null
//       the ammo's `{Damage blastwave {energy c4} {area r0 r1}}` (armordata shell().damage); radius = r1, inner = r0, metres.
//       `Damage Add` gives more than one: `all` lists every one, the first is on top. null = no blastwave in the filling.
//   apply(ctx, state, { point, energy, radius, inner, source, by, src }, hooks) ->
//       { source, by, point, energy, radius, inner, hits: [{ volume, part, result, armorDamage, energy, delay, side,
//         thickness, threshold }], skipped: [{ volume, why }], events: [{ event, volume, part, value, sender }], notes }
//       point  [x,y,z] in model units (20 per metre, the frame of ctx.shapes); null = the unit's origin
//       energy the charge (c4) as data writes it; radius the outer radius r1 in metres; inner r0 in metres (default 0).
//              radius may also be [r0, r1] or { inner, outer } (metres).
//       source 'shell' | 'script'; by = the handler that called blastwave ({ event, file, line, from }) or null; src = the
//              cmd.source handed to the scripts (default { tags: empty })
//       hit.result: 'pierced' = the area broke (break_armor), 'damaged' = a wound but the area held, 'held' = no effect.
//       hit.energy = the blast's energy at that volume (charge units, the value of the blast event); hit.delay = seconds
//       after the burst the front reaches it (g_damageSpeed 15 m/s).
//       hooks.fire(event, cmd) runs the handlers; hooks.trigger(kind, info, fn) (optional) opens a cause group;
//       hooks.harmful false = a friendly blast (rule 34: no wound, no break).
//       crewNote: RULES 43 (text): the engine hurts no crew through the vehicle.
//   fireOn(...): a `{Damage fire}` of the filling on the unit (RULES 45), see below. The jet (`{Damage cumulative}`) is in after.js.
// Not here: other entities (seated crew on bones included), ground relief between blast and volume (the flat `ray.ground` of
// RULES 49 never lies between a burst on or above it and a volume point above it, so nothing to block), a human's cover factor;
// flash has no effect on a vehicle or seated crew (RULES 46).
// Author: Imperator_Aug (ARSENAL, ia-b02f3ca6)
'use strict';
const trace = require('../lib/model/trace');
const pen = require('./pen');
const after = require('./after');

const UPM = 20;                    // units per metre (g_unitsPerMeter)
const FRONT_SPEED = 15;            // g_damageSpeed, m/s
const ENERGY_PER_BLAST = 5;        // g_energyperblastwave
const MIN_LEN2 = 1e-10;            // VEC_MIN_LENGTH_SQUARED: shorter = straight up (Normalize Vec.h:304)
const lc = s => String(s == null ? '' : s).toLowerCase();
const r2 = x => Math.round(x * 100) / 100;
const r3 = x => Math.round(x * 1000) / 1000;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const along = (o, d, t) => [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t];
const v3 = p => Array.isArray(p) ? p.slice(0, 3).map(Number) : p && typeof p === 'object' ? [+p.x || 0, +p.y || 0, +p.z || 0] : null;

// ---------- the filling ----------
function ofShell(shell) {
  const list = ((shell && shell.damage) || []).filter(d => lc(d.type) === 'blastwave').map(d => {
    const a = d.area || [];
    return { energy: +d.energy || 0, radius: a.length > 1 ? +a[1] : 0, inner: a.length ? +a[0] : 0 };
  });
  if (!list.length) return null;
  return Object.assign({}, list[0], { all: list });
}
function radii(b) {
  const R = b.radius;
  if (Array.isArray(R)) return { inner: +R[0] || 0, outer: +R[1] || 0 };
  if (R && typeof R === 'object') return { inner: +(R.inner != null ? R.inner : R.r0) || 0, outer: +(R.outer != null ? R.outer : R.r1) || 0 };
  return { inner: +(b.inner != null ? b.inner : b.r0) || 0, outer: +(R != null ? R : b.r1) || 0 };
}

// ---------- geometry ( GetNearest, volume) ----------
function localOf(shape, p) { const inv = trace.invert(shape.matrix); return inv ? trace.transformPoint(inv, p) : null; }
function closestOnTri(p, a, b, c) {   // Ericson, Real-Time Collision Detection 5.1.5
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a);
  const d1 = dot(ab, ap), d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return a;
  const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return along(a, ab, d1 / (d1 - d3));
  const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return along(a, ac, d2 / (d2 - d6));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) return along(b, sub(c, b), (d4 - d3) / ((d4 - d3) + (d5 - d6)));
  const den = 1 / (va + vb + vc);
  return along(along(a, ab, vb * den), ac, vc * den);
}
// -> { point (world), inside } inside: the engine aims at the blast point itself
function nearest(shape, p) {
  const L = localOf(shape, p);
  if (!L) return { point: p, inside: false };
  const kind = shape.kind || (shape.triangles ? 'polyhedron' : shape.size ? 'box' : shape.length !== undefined ? 'cylinder' : 'sphere');
  let q = L, inside = false;
  if (kind === 'box') {                                                       //
    const h = shape.size.map(x => x / 2);
    q = L.map((x, i) => Math.min(Math.max(x, -h[i]), h[i]));
    inside = L.every((x, i) => Math.abs(x) < h[i]);
  } else if (kind === 'sphere') {                                             //
    const d = Math.max(Math.hypot(L[0], L[1], L[2]), 1e-4);
    inside = shape.radius > d;
    q = L.map(x => x * shape.radius / d);
  } else if (kind === 'cylinder') {                                           //
    const hh = shape.length / 2, rad = Math.hypot(L[0], L[1]), sg = L[2] >= 0 ? 1 : -1;
    const inH = L[2] >= -hh && L[2] <= hh, inR = shape.radius > rad;
    const rim = rad >= 1e-5 ? [L[0] * shape.radius / rad, L[1] * shape.radius / rad] : [shape.radius, 0];
    if (!inH && inR) q = [L[0], L[1], hh * sg];
    else if (!inH) q = [rim[0], rim[1], hh * sg];
    else if (inR) inside = true;
    else q = [rim[0], rim[1], L[2]];
  } else {                                                                    //
    const t = shape.triangles || [];
    let best = Infinity;
    for (let i = 0; i + 8 < t.length; i += 9) {
      const c = closestOnTri(L, [t[i], t[i + 1], t[i + 2]], [t[i + 3], t[i + 4], t[i + 5]], [t[i + 6], t[i + 7], t[i + 8]]);
      const d = dot(sub(c, L), sub(c, L));
      if (d < best) { best = d; q = c; }
    }
    const r = trace.rayShape({ origin: p, dir: [0, 0, 1] }, shape);
    inside = !!(r && r.inside);
  }
  return { point: inside ? p.slice() : trace.transformPoint(shape.matrix, q), inside };
}
// the length ray_cast_thickness areas use for a blast (GetThickness(true)): smallest half box size, else the
// cube root of the shape's volume (polyhedron volume summed from its faces [I])
function approxLength(shape) {
  if (!shape) return undefined;
  if (shape.size) return Math.min(...shape.size) / 2;
  let vol = 0;
  if (shape.triangles) {
    const t = shape.triangles;
    for (let i = 0; i + 8 < t.length; i += 9) {
      const a = [t[i], t[i + 1], t[i + 2]], b = [t[i + 3], t[i + 4], t[i + 5]], c = [t[i + 6], t[i + 7], t[i + 8]];
      vol += dot(a, [b[1] * c[2] - b[2] * c[1], b[2] * c[0] - b[0] * c[2], b[0] * c[1] - b[1] * c[0]]) / 6;
    }
    vol = Math.abs(vol);
  } else if (shape.length !== undefined) vol = Math.PI * shape.radius * shape.radius * shape.length;
  else if (shape.radius !== undefined) vol = 4 / 3 * Math.PI * shape.radius ** 3;
  return Math.cbrt(vol);
}

// ---------- which volumes a blast can reach (ABLE_BLAST, rule 23 for the `blast` able) ----------
function blastAbles(ctx) {
  if (ctx._blastAbles) return ctx._blastAbles;
  const out = new Map();
  const sdlx = require('../lib/sdlx');
  const nm = x => { const f = x.items[0]; return f && f.k === 'IDENT' ? lc(f.text) : f && f.k === 'STRING' ? lc(f.value) : ''; };
  for (const key of [ctx.armor && ctx.armor.model, ctx.armor && ctx.armor.key]) {
    const b = key && ctx.src && ctx.src.get(key);
    if (!b) continue;
    let root;
    try { root = sdlx.read(b, { file: key, key, open: (r, from) => ctx.src.open(r, from), onError: () => {}, preInclude: ctx.src.preInclude(key) }).root; } catch (e) { continue; }
    (function walk(blk) {
      for (const c of blk.items || []) {
        if (c.k === 'MOD') { walk(c); continue; }
        if (c.k !== 'BLOCK') continue;
        const s1 = c.items[1];
        if (nm(c) === 'volume' && s1 && s1.k === 'STRING') {
          const v = out.get(lc(s1.value)) || { blast: true, why: null };
          for (const k of c.items) {
            if (k.k !== 'BLOCK') continue;
            if (nm(k) === 'disabled') { v.blast = false; v.why = '{disabled} at ' + key + ':' + k.line; }
            if (nm(k) !== 'able') continue;
            if (k.items[1] && k.items[1].k === 'IDENT' && lc(k.items[1].text) === 'clear') { v.blast = false; v.why = '{able clear} at ' + key + ':' + k.line; }
            for (const a of k.items) if (a.k === 'BLOCK' && nm(a) === 'blast') {
              const val = a.items[1], on = !val || (val.k === 'IDENT' ? !/^(0|false|no|off)$/i.test(val.text) : Number(val.value) !== 0);
              v.blast = on; v.why = on ? null : '{able {blast 0}} at ' + key + ':' + a.line;
            }
          }
          out.set(lc(s1.value), v);
        } else walk(c);
      }
    })(root);
  }
  for (const v of Object.values((ctx.armor && ctx.armor.volumes) || {})) {
    if (lc((v.tags || [v.name])[0]) === 'ram') out.set(lc(v.name), { blast: false, why: 'ram volume: ables cleared at spawn' });
  }
  ctx._blastAbles = out;
  return out;
}
function targetsOf(ctx, state) {
  const ab = blastAbles(ctx), list = [], off = [];
  const vols = (ctx.scene && ctx.scene.volumes) || [];
  vols.forEach(sv => {
    if (!sv.shape) return;
    const name = sv.name || after.volName(sv.id), a = ab.get(lc(name)), so = state.volOff && state.volOff.get(lc(name));
    if (a && !a.blast) { off.push({ volume: name, why: a.why }); return; }
    if (so && so.has('blast')) { off.push({ volume: name, why: 'blast able turned off by a script' }); return; }
    list.push({ id: sv.id, name, shape: Object.assign({ id: sv.id }, sv.shape) });
  });
  return { list, off };
}

// ---------- the blast against one volume (the game, GetDurability) ----------
function plateOf(ctx, state, tg, side, point, E, harmful) {
  const vol = after.armorVol(ctx, tg.name);
  const area = vol && vol.area ? (ctx.armor.areas || []).find(a => a.name === vol.area) || null : null;
  const mName = lc((vol && vol.material) || ctx.armor.defaultMaterial), mat = (ctx.materials && ctx.materials[mName]) || null;
  const T = pen.nominalThickness({ own: vol ? vol.sides : 0, area, side,
    rayCast: { pathLengthUnits: approxLength(tg.shape), steelEquivalent: mat && mat.steelEquivalent } });
  const e5 = ENERGY_PER_BLAST * E;
  const out = { thickness: T, threshold: null, pierced: false, broken: false, armorDamage: 0, kept: e5 };
  if (harmful === false) return out;                                         //
  const tb = (area && area.threshold && area.threshold.blast) || {};
  const thr = tb.value ? tb.value : tb.koef ? Math.max(tb.koef, 1e-5) * T : T * (2 / 3);   // blast penetration is never set: 2/3 T
  out.threshold = thr;
  if (e5 >= thr && !(area && area.flags && area.flags.disableDamageAcc)) {
    out.pierced = true;
    const db = (area && area.durability && area.durability.blast) || {};
    const base = mat && mat.durabilityBlast !== undefined ? mat.durabilityBlast : 0;
    const dur = db.value ? db.value : db.koef ? db.koef * T : base ? T * base : T;
    const damage = e5 / Math.max(dur, 0.001);
    const integrity = after.integrityAt(ctx, state, { volumeId: tg.name, point });
    if (damage >= integrity) {
      if (damage > 1e-5) out.kept = Math.min(Math.max(integrity / damage, 0), 1) * e5;
      out.broken = true;
    }
    out.armorDamage = damage;
  }
  return out;
}

// ---------- one blast ----------
function apply(ctx, state, b = {}, hooks = {}) {
  const fire = hooks.fire || (() => {});
  const trig = hooks.trigger ? (kind, info, fn) => hooks.trigger(kind, info, fn) : (kind, info, fn) => fn();
  const notes = [], events = [], hits = [], skipped = [];
  const E0 = +b.energy || 0, R = radii(b), r0 = R.inner * UPM, r1 = R.outer * UPM;
  let P = v3(b.point);
  if (!P) { P = [0, 0, 0]; notes.push('blast placed at the unit\'s origin'); }
  const res = { source: b.source || 'shell', by: b.by || null, point: P.map(r2), energy: E0, radius: R.outer, inner: R.inner, hits, skipped, events, notes,
    crewNote: 'crew: a blast hurts no crew member through the vehicle (RULES 43); a soldier on a seat with a bone is a unit of his own the same blast can reach, a seat without a bone is out of reach. Not followed here.' };
  const power = d => d > r1 ? 0 : d < r0 ? E0 : (d - r1) * E0 / (r0 - r1);
  const { list: T, off } = targetsOf(ctx, state);
  for (const o of off) skipped.push(o);
  T.forEach(t => { const n = nearest(t.shape, P); t.aim = n.point; t.inside = n.inside; t.E = 0; t.side = -1; t.hitPoint = null; t.dir = [0, 0, 1]; });
  // every target's ray through all targets, nearest first, energy left after the ones before
  for (let i = T.length - 1; i >= 0; i--) {
    let dir = sub(T[i].aim, P);
    const len2 = dot(dir, dir);
    dir = len2 > MIN_LEN2 ? dir.map(x => x / Math.sqrt(len2)) : [0, 0, 1];
    const ray = { origin: P, dir }, on = [];
    for (let j = T.length - 1; j >= 0; j--) {
      const r = trace.rayShape(ray, T[j].shape);
      if (r) on.push({ d: r.inside ? r.tOut : r.tIn, side: r.inside ? r.sideOut : r.sideIn, t: T[j] });
      else if (j === i && len2 > MIN_LEN2) on.push({ d: Math.sqrt(len2), side: -1, t: T[j] });   // grazing the own aim point [I]
    }
    on.sort((a, c) => a.d - c.d);
    let absorbed = 0;
    for (const h of on) {
      const E = power(h.d) - absorbed;
      if (!(E > 0)) break;
      const t = h.t;
      if (E > t.E) { t.E = E; t.dir = dir; t.hitPoint = along(P, dir, h.d); t.side = h.side; }
      absorbed += plateOf(ctx, state, t, t.side, t.aim, E, hooks.harmful).kept / ENERGY_PER_BLAST;
    }
  }
  const reached = T.filter(t => t.E > 0).map((t, k) => Object.assign(t, { dist: Math.sqrt(dot(sub(t.hitPoint, P), sub(t.hitPoint, P))), k }));
  reached.sort((a, c) => a.dist - c.dist || a.k - c.k);                     // (ties: volume order [I])
  if (!reached.length) notes.push('the blast reaches no volume of the unit (radius ' + R.outer + ' m)');
  const src = b.src || { tags: new Set() };
  const emit = (event, cmd, extra) => {
    const c = Object.assign({}, cmd, { event }, extra || {});
    events.push({ event, volume: c.volume, part: c.part, value: r2(c.value), sender: c.sender || undefined });
    fire(event, c);
    return c;
  };
  trig('blast', { event: 'blast', volume: null, part: null, source: res.source, by: res.by, energy: E0, point: res.point }, () => {
    const parts = new Set();
    let first = true;
    for (const t of reached) {                                                // HitTarget
      const so = state.volOff && state.volOff.get(lc(t.name));
      if (so && so.has('blast')) { skipped.push({ volume: t.name, why: 'blast able turned off before the front arrived' }); continue; }
      const p = after.partOf(ctx, state, t.name);
      if (p) {
        if (parts.has(p)) { skipped.push({ volume: t.name, why: 'part ' + p.name + ' already hit by this blast' }); continue; }
        parts.add(p);
      }
      const cmd = { volume: t.name, part: p ? p.name : null, blast: true, bullet: false, source: src, position: t.hitPoint, direction: t.dir,
        normal: t.dir.map(x => -x), side: t.side, value: t.E, sender: null, shot: { detonate: false } };
      if (first) { first = false; emit('blast_hit', cmd); }
      emit('blast', cmd);
      const v = plateOf(ctx, state, t, t.side, t.hitPoint, t.E, hooks.harmful);
      const hit = { volume: t.name, part: p ? p.name : null, result: v.broken ? 'pierced' : v.pierced ? 'damaged' : 'held', armorDamage: r3(v.armorDamage),
        energy: r2(t.E), delay: r3(t.dist / UPM / FRONT_SPEED), side: pen.SIDES[t.side < 0 ? 0 : t.side], thickness: r2(v.thickness), threshold: v.threshold === null ? null : r2(v.threshold) };
      hits.push(hit);
      if (!v.pierced) continue;
      if (v.armorDamage > 0) after.addWound(ctx, state, t.name, t.hitPoint, v.armorDamage);
      if (!v.broken) continue;
      const pb = after.partOf(ctx, state, t.name);
      const ev = pb && pb.damage ? 'break_armor_again' : 'break_armor';
      trig('blast', { event: ev, volume: t.name, part: pb ? pb.name : null }, () => {
        const c = emit(ev, cmd, { value: v.kept, sender: 'blast' });         //
        const p2 = after.partOf(ctx, state, t.name);
        if (p2 && p2.damage === 0) {
          events.push({ event: 'part broken', volume: t.name, part: p2.name });
          trig('part', { event: 'break', part: p2.name, volume: t.name }, () => after.setDamage(state, p2, 1, Object.assign({}, c, { event: undefined }), fire));
        }
      });
    }
  });
  return res;
}

// ---------- a fire of the filling (RULES 45) ----------
// The unit takes heat when its bounds (zone box [I]: here the box around its volumes) come within the radius of the fire's
// centre; each step adds step x heating / inflammation_time (ally 0.2 x, impregnable or already burning: none); above 1 the
// unit is set on fire: the named reaction `burn`, then `burn_volume` for every volume the fire's sphere meets.
//   fireOn(ctx, state, { point, radius, heating, time, src, inflammation, ally }, hooks) ->
//     { radius, heating, time, inflammation, reaches, distance, igniteAt: s | null, volumes: [names], events, notes, point }
//     point = the fire's centre (its sphere's centre = the given point, model units) or null when no point was given
//     radius metres, time seconds; inflammation = the unit's inflammation_time (seconds; also hooks.inflammationTime or
//     state.inflammationTime); unknown -> ignition not judged (noted). state.burning (iasim) non-empty = already burning.
function aabbOf(shape) {
  const M = shape.matrix, pts = [];
  if (shape.size) { const h = shape.size.map(x => x / 2); for (const a of [-1, 1]) for (const b of [-1, 1]) for (const c of [-1, 1]) pts.push([a * h[0], b * h[1], c * h[2]]); }
  else if (shape.triangles) { const t = shape.triangles; for (let i = 0; i + 2 < t.length; i += 3) pts.push([t[i], t[i + 1], t[i + 2]]); }
  else { const r = Math.max(shape.radius || 0, (shape.length || 0) / 2); for (const a of [-1, 1]) for (const b of [-1, 1]) for (const c of [-1, 1]) pts.push([a * r, b * r, c * r]); }
  const w = pts.map(p => (M ? trace.transformPoint(M, p) : p));
  return [0, 1, 2].map(i => [Math.min(...w.map(p => p[i])), Math.max(...w.map(p => p[i]))]);
}
function fireOn(ctx, state, f = {}, hooks = {}) {
  const fire = hooks.fire || (() => {});
  const trig = hooks.trigger ? (kind, info, fn) => hooks.trigger(kind, info, fn) : (kind, info, fn) => fn();
  const P = v3(f.point) || [0, 0, 0], notes = [], events = [];
  const radius = f.radius == null ? null : +f.radius, heating = f.heating == null ? null : +f.heating, time = f.time == null ? null : +f.time;
  const inflam = [f.inflammation, hooks.inflammationTime, state.inflammationTime].find(x => x != null && +x > 0);
  const res = { radius, heating, time, inflammation: inflam == null ? null : +inflam, reaches: false, distance: null, igniteAt: null, volumes: [], events, notes,
    point: v3(f.point) ? P.slice() : null };
  if (f.key) Object.assign(res, { index: f.index, key: f.key, start: f.start || null });   // after.js fillId: which fire of the filling
  if (radius == null || heating == null || time == null) { notes.push('fire filling: radius, heating or time not read from the data, not applied'); return res; }
  const vols = ((ctx.scene && ctx.scene.volumes) || []).filter(v => v.shape);
  if (!vols.length) { notes.push('the unit has no volume'); return res; }
  const bx = [[Infinity, -Infinity], [Infinity, -Infinity], [Infinity, -Infinity]];
  for (const v of vols) aabbOf(v.shape).forEach((r, i) => { bx[i][0] = Math.min(bx[i][0], r[0]); bx[i][1] = Math.max(bx[i][1], r[1]); });
  const dist = Math.hypot(...P.map((x, i) => Math.max(bx[i][0] - x, 0, x - bx[i][1])));
  res.distance = r2(dist / UPM);
  res.reaches = dist <= radius * UPM;
  if (!res.reaches) { notes.push('the fire (' + radius + ' m) does not reach the unit (' + res.distance + ' m)'); return res; }
  if (state.burning && state.burning.length) { notes.push('already burning: the fire adds no heat'); return res; }
  if (res.inflammation == null) { notes.push('fire reaches the unit; its inflammation_time is not known, so whether it catches fire is not judged'); return res; }
  const h = heating * (f.ally ? 0.2 : 1);
  const need = h > 0 ? res.inflammation / h : Infinity;                       // seconds of heat to pass 1 [I] step = quant length
  if (!(need < time)) { notes.push('the fire heats the unit for ' + time + ' s: ' + r2(h * time / res.inflammation) + ' of the heat it needs, no fire'); return res; }
  res.igniteAt = r3(need);
  const inSphere = vols.filter(v => { const n = nearest(v.shape, P); const q = n.point; return n.inside || Math.hypot(q[0] - P[0], q[1] - P[1], q[2] - P[2]) <= radius * UPM; });
  res.volumes = inSphere.map(v => v.name || after.volName(v.id));
  const src = f.src || { tags: new Set() };
  trig('fire', { event: 'burn', volume: null, part: null, at: res.igniteAt, fire: f.key || null }, () => {
    const cmd = { volume: null, part: null, bullet: false, blast: false, source: src, position: P, value: 0, sender: null, shot: { detonate: false }, at: res.igniteAt };
    events.push({ event: 'burn', volume: null, part: null, at: res.igniteAt });
    fire('burn', Object.assign({}, cmd, { event: 'burn' }));
    for (const name of res.volumes) {
      const p = after.partOf(ctx, state, name);
      events.push({ event: 'burn_volume', volume: name, part: p ? p.name : null, at: res.igniteAt });
      fire('burn_volume', Object.assign({}, cmd, { event: 'burn_volume', volume: name, part: p ? p.name : null }));
    }
  });
  notes.push('the fire sets the unit on fire after ' + res.igniteAt + ' s (' + res.volumes.length + ' volumes in its sphere)');
  return res;
}

module.exports = { apply, ofShell, fireOn, nearest, approxLength, blastAbles, UPM, FRONT_SPEED, ENERGY_PER_BLAST };

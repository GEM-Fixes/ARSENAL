// armorsim/sim: the simulator core behind armorsim.js: one unit loaded once (armour from armordata.js, collision shapes
// from tools/lib/model/sceneload + scene.js), rays traced with trace.js, plates judged with pen.js.
//
// Volume join (the one place it is done): armordata keys volumes by the name in the .def / .mdl `volume` blocks;
// scene.js ids are '<bone path>/<volume name>'. They join on the volume NAME, case-insensitive (the engine reads
// descriptors case-insensitively: armordata keys by lower case, pen.js fillFromArmor matches the last id segment in lower
// case, area patterns match the tag with resource name wildcards, RULES.md rule 9 "case [I]").
//
// Geometry: 20 units per metre. Shooter direction from (azimuth, elevation) in the vehicle frame = the root bone's world
// axes (forward X, left Y, up Z; vanilla roots mirror Y): azimuth 0 = in front, 90 = on the vehicle's left, el up.
//
// Exports
//   open(unit, { game, mods, folder, src }) -> ctx { unit, armor, scene, shapes, vols, byId, join, materials, opts } | { error }
//   join(armor, scene) -> { vols: [{ id, name, kind, bone, armor: armorVolume|null }], noArmor: [ids], notInModel: [names],
//       noShape: [ids] }
//   shellFrom({ weapon, ammo, shell }, opts) -> pen Shell | { error }   (shell = armordata spec string or a JSON object text)
//   rayFrom(ctx, az, el, aim?) -> { origin, dir }      aimVolume(ctx, idOrName) -> [x,y,z] | null    centre(ctx) -> [x,y,z]
//   shoot(ctx, shell, rangeM, ray) -> { plates: [...], verdict, chance, outcome, decisive, penetration, notes }
//       verdict = result of the first ENTRY face with nominal > 0 (the first armour the shell meets: a pass = the vehicle
//       is penetrated there); outcome = pen.resolveShot's whole-ray outcome (exit faces and later plates included).
//       ammoNotLoaded = shell.ammoNotLoaded (armordata): { asked, weapon, loads: [names] } when the asked ammo is a real ammo
//       the weapon does not load (the shot still runs), else null.
//       ray.ground (optional number, z of a flat ground plane in model units; RULES 49): a ray going down stops there. Nothing met
//       before it: verdict = outcome = 'ground', plates []; met and flown through: verdict as above, outcome 'ground'. Either way
//       groundPoint = [x,y,z] (rounded 0.1). Without ray.ground: as before.
//   groundHit(ray) -> { t, distanceM, point } | null   where a downward ray meets ray.ground
//   map(ctx, shell, rangeM, view, { w, h }) -> { view, grid, cells, volumes, legend, share }
//   table(ctx) -> { rows: [...], summary: { hull, turret }, join }
//   VIEWS, parseView(s), CODES (verdict -> letter)
// Author: Imperator_Aug (ARSENAL, ia-46f63141)
'use strict';
const ad = require('./armordata'), pen = require('./pen');
const trace = require('../lib/model/trace'), sceneload = require('../lib/model/sceneload');

const SIDES = pen.SIDES;
const lc = s => String(s == null ? '' : s).toLowerCase();
const r1 = x => Math.round(x * 10) / 10;
const DEG = Math.PI / 180;
const CODES = Object.freeze({ penetrate: 'P', ricochet: 'R', no_penetration: 'N', detonate: 'D', missed: 'M', beyond_jet: 'J', no_armor: 'O', ground: 'G' });
const LEGEND = Object.freeze({ P: 'penetrate', R: 'ricochet (fails, may bounce)', N: 'no penetration', D: 'detonates in the plate (fuze)', M: 'missed (spent shell)', J: 'beyond HEAT jet reach', O: 'only 0 mm volumes on the ray (passes, nothing armoured)' });
const MAIN = /^(body|hull|turret)/i;   // hull and turret volumes by the usual names [I]
const VIEWS = Object.freeze({ front: [0, 0], rear: [180, 0], back: [180, 0], left: [90, 0], right: [270, 0], top: [0, 90] });

function parseView(s) {
  const k = lc(s);
  if (VIEWS[k]) return { name: k === 'back' ? 'rear' : k, az: VIEWS[k][0], el: VIEWS[k][1] };
  const m = /^\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*$/.exec(String(s || ''));
  return m ? { name: m[1] + ',' + m[2], az: +m[1], el: +m[2] } : null;
}

// ---------- which volumes a bullet can hit (RULES.md rule 23) ----------
// volume ables default {visible bullet throwing obstacle contact contact_ground blast select};
// a def/mdl volume block's {able [clear] {name 0|1} ..} edits that set and {disabled} turns every able off
// (IsAble ); the bullet traces only IsAble(ABLE_BULLET) volumes
// the volume whose first tag is "ram" gets its ables cleared at spawn (,
// g_ramVolume ). Shield extenders (first tag "shield", ) are not read: taken as on [I].
const sdlx = require('../lib/sdlx');
function ableBlocks(src, key, out) {
  const b = key && src.get(key);
  if (!b) return;
  let root;
  try { root = sdlx.read(b, { file: key, key, open: (r, from) => src.open(r, from), onError: () => {}, preInclude: src.preInclude(key) }).root; } catch (e) { return; }
  const nm = x => { const f = x.items[0]; return f && f.k === 'IDENT' ? lc(f.text) : f && f.k === 'STRING' ? lc(f.value) : ''; };
  (function walk(blk) {
    for (const c of blk.items || []) {
      if (c.k === 'MOD') { walk(c); continue; }
      if (c.k !== 'BLOCK') continue;
      const s1 = c.items[1];
      if (nm(c) === 'volume' && s1 && s1.k === 'STRING') {
        const v = out.get(lc(s1.value)) || { bullet: true, why: null };
        for (const k of c.items) {
          if (k.k !== 'BLOCK') continue;
          if (nm(k) === 'disabled') { v.bullet = false; v.why = '{disabled} at ' + key + ':' + k.line; }
          if (nm(k) !== 'able') continue;
          if (k.items[1] && k.items[1].k === 'IDENT' && lc(k.items[1].text) === 'clear') { v.bullet = false; v.why = '{able clear} at ' + key + ':' + k.line; }
          for (const a of k.items) if (a.k === 'BLOCK' && nm(a) === 'bullet') {
            const val = a.items[1], on = !val || (val.k === 'IDENT' ? !/^(0|false|no|off)$/i.test(val.text) : Number(val.value) !== 0);
            v.bullet = on; v.why = on ? null : '{able {bullet 0}} at ' + key + ':' + a.line;
          }
        }
        out.set(lc(s1.value), v);
      } else walk(c);
    }
  })(root);
}
function bulletAbles(armor, opts) {
  const out = new Map();
  try { const src = ad.openSource(opts); ableBlocks(src, armor.model, out); ableBlocks(src, armor.key, out); } catch (e) { /* no able info: defaults */ }
  for (const v of Object.values(armor.volumes)) {
    if (lc((v.tags || [v.name])[0]) === 'ram') out.set(lc(v.name), { bullet: false, why: 'ram volume: ables cleared at spawn' });
  }
  return out;
}

// ---------- loading ----------
function join(armor, scene, ables) {
  const byName = new Map();
  for (const v of Object.values(armor.volumes)) byName.set(lc(v.name), v);
  const seen = new Set(), vols = [], noArmor = [], noShape = [], notHit = [];
  for (const sv of scene.volumes) {
    const a = byName.get(lc(sv.name)) || null;
    if (a) seen.add(lc(a.name));
    if (!sv.shape) { noShape.push(sv.id); continue; }
    const ab = ables && ables.get(lc(sv.name));
    if (ab && !ab.bullet) { notHit.push({ id: sv.id, name: sv.name, why: ab.why }); continue; }
    vols.push({ id: sv.id, name: sv.name, kind: sv.kind, bone: sv.bone, armor: a, world: sv.world });
    if (!a || (!a.area && a.effectiveSides.every(x => !x))) noArmor.push(sv.id);
  }
  const notInModel = Object.values(armor.volumes).filter(v => !seen.has(lc(v.name))).map(v => v.name);
  return { vols, noArmor, notInModel, noShape, notHit };
}

function open(unit, o = {}) {
  if (o.exe && require('../lib/games').exeOf(o.exe) === 'goh') return { error: require('../lib/games').notFor('armorsim', 'goh', 'the armour simulator is for MoW:AS2 and the 64-bit build only', 'owner decision 2026-11-10, plan/decisions.md SOEdit') };
  const opts = Object.assign({ game: o.game, mods: o.mods || [], folder: o.folder || undefined }, o.exe ? { exe: require('../lib/games').exeOf(o.exe) || o.exe } : {});
  if (o.src) opts.src = o.src;
  let armor;
  try { armor = ad.vehicleArmor(unit, opts); } catch (e) { return { error: 'reading the armour of ' + unit + ' failed: ' + e.message }; }
  if (!armor) return { error: 'No vehicle def named "' + unit + '" in ' + (opts.folder ? 'the mod folder, ' : '') + 'the game' + (opts.mods.length ? ' or the mods' : '') + '.' };
  let L;
  if (o.scene) L = { scene: o.scene, key: armor.model };   // the open document's scene (openDoc): current bytes, current pose
  else {
    const lo = Object.assign({ game: o.game, mods: opts.mods, modDir: opts.folder }, opts.exe ? { exe: opts.exe } : {});
    L = armor.model ? sceneload.load(armor.model, lo) : null;
    if (!L || L.error && !L.scene) L = sceneload.load(armor.entity || unit, lo);
    if (!L || !L.scene) return { error: 'No model for ' + unit + ': ' + ((L && L.error) || 'the def names none') };
    try { L.files.close(); } catch (e) { /* already closed */ }
  }
  const scene = L.scene, j = join(armor, scene, bulletAbles(armor, opts));
  let materials = null;
  try { materials = ad.materials(opts); } catch (e) { materials = null; }
  return { unit, armor, scene, model: L.key, shapes: j.vols.map(v => sceneShape(scene, v.id)), vols: j.vols, byId: new Map(j.vols.map((v, i) => [v.id, i])), join: j, materials, opts, src: ad.openSource(opts) };
}
// The model that is open in the editor: its files are read from the document (unsaved edits included), the rest from the mod, then
// the game (origin.js). o = { unit, game, mods, folder, anm, frame }: the pose is the document's scene at that animation frame.
function openDoc(doc, o = {}) {
  if (!o.unit) return { error: 'Name the unit (its def) the open model belongs to.' };
  // the game: o.exe, else the document's; goh stops here with the plain line, before any source is opened
  const G = require('../lib/games'), x = o.exe || doc.exe, exe = x ? G.exeOf(x) || x : undefined;
  if (exe === 'goh') return { error: G.notFor('armorsim', 'goh', 'the armour simulator is for MoW:AS2 and the 64-bit build only', 'owner decision 2026-11-10, plan/decisions.md SOEdit') };
  if (exe) o = Object.assign({}, o, { exe });
  const base = ad.openSource(Object.assign({ game: o.game, mods: o.mods || [], folder: o.folder || doc.mod || undefined }, exe ? { exe } : {}));
  let scene;
  try { scene = doc.scene({ anm: o.anm || null, frame: o.frame, raw: true }); } catch (e) { return { error: 'The open model could not be laid out: ' + e.message }; }
  if (!scene || !(scene.volumes || []).some(v => v.shape)) return { error: 'The open model has no volume with a shape to shoot at.' };
  return open(o.unit, Object.assign({}, o, { src: require('./origin').overlay(base, doc), scene }));
}
function sceneShape(scene, id) { return scene.volumes.find(v => v.id === id).shape; }

function shellFrom(a, opts) {
  try {
    if (a.shell && /^\s*\{/.test(a.shell)) { const s = JSON.parse(a.shell); s.weapon = s.weapon || '(json)'; return s; }
    const s = a.weapon ? ad.shell({ weapon: a.weapon, ammo: a.ammo }, opts) : ad.shell(a.shell, Object.assign({}, opts, a.ammo ? { ammo: a.ammo } : {}));
    if (!s) return { error: 'No shell for ' + (a.weapon ? a.weapon + ' / ' + (a.ammo || '(any ammo)') : a.shell) + '.' };
    // an asked ammo that resolves to nothing is an error, never the weapon's default fired silently (a.allowFallback keeps it, flagged)
    if (s.ammoFallback && !a.allowFallback) {
      const F = s.ammoFallback;
      return { error: 'No ammo "' + F.asked + '" for ' + (s.weapon || a.weapon) + ': ' + F.why + '.' + (F.loads && F.loads.length ? ' The weapon loads: ' + F.loads.join(', ') + '.' : ''), ammoFallback: F };
    }
    return s;
  } catch (e) { return { error: 'reading the shell failed: ' + e.message }; }
}

// ---------- geometry ----------
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const v3 = p => Array.isArray(p) ? p : p && typeof p === 'object' ? [p.x, p.y, p.z] : null;
function bounds(ctx) {
  const b = ctx.scene.volumeBounds || ctx.scene.bounds;
  if (b && v3(b.min)) return { min: v3(b.min), max: v3(b.max) };
  return { min: [-20, -20, -20], max: [20, 20, 20] };
}
function centre(ctx) { const b = bounds(ctx); return [0, 1, 2].map(i => (b.min[i] + b.max[i]) / 2); }
function reach(ctx) { const b = bounds(ctx); return Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]) + 200; }
// vehicle frame = the root bone's world axes (vanilla basis mirrors Y: {Orientation 1 0 0 0 -1 0 0 0 1}, so the vehicle's
// left is world -Y there); azimuth/elevation are taken in that frame
function frame(ctx) {
  if (ctx && ctx._frame) return ctx._frame;
  const w = ctx && ctx.scene && ctx.scene.bones && ctx.scene.bones[0] && ctx.scene.bones[0].world;
  const f = w ? { X: norm(w.slice(0, 3)), Y: norm(w.slice(3, 6)), Z: norm(w.slice(6, 9)) } : { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] };
  if (ctx) ctx._frame = f;
  return f;
}
function toShooter(az, el, ctx) {
  const F = frame(ctx), a = Math.cos(el * DEG) * Math.cos(az * DEG), b = Math.cos(el * DEG) * Math.sin(az * DEG), c = Math.sin(el * DEG);
  return [0, 1, 2].map(i => a * F.X[i] + b * F.Y[i] + c * F.Z[i]);
}
function rayFrom(ctx, az, el, aim) {
  const t = toShooter(az, el, ctx), a = aim || centre(ctx);
  return { origin: add(a, t, reach(ctx)), dir: [-t[0], -t[1], -t[2]] };
}
function aimVolume(ctx, q) {
  const k = lc(q);
  const v = ctx.vols.find(x => lc(x.id) === k) || ctx.vols.find(x => lc(x.name) === k);
  if (!v) return null;
  const s = sceneShape(ctx.scene, v.id), m = s.matrix;
  if (s.kind === 'polyhedron' && s.triangles && s.triangles.length) {   // centre of the local vertices, to world
    const tr = s.triangles, mn = [1e30, 1e30, 1e30], mx = [-1e30, -1e30, -1e30];
    for (let i = 0; i < tr.length; i += 3) for (let c = 0; c < 3; c++) { mn[c] = Math.min(mn[c], tr[i + c]); mx[c] = Math.max(mx[c], tr[i + c]); }
    return trace.transformPoint(m, [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2]);
  }
  return [m[9], m[10], m[11]];
}

// ---------- one shot ----------
// RULES 49: ray.ground = the ground height (z of a flat plane in model units). A ray going down meets it at
// { t (units along the unit dir), distanceM, point }; null when ground is not a number, the ray is level or going up, or it
// starts below the ground. Volume hits past that distance are not reached ( sorts the terrain hit with the
// volume hits and stops at it).
function groundHit(ray) {
  const g = ray && ray.ground;
  if (typeof g !== 'number' || !Number.isFinite(g)) return null;
  const d = norm(ray.dir), o = ray.origin;
  if (!(d[2] < -1e-9) || o[2] < g - 1e-6) return null;
  const t = Math.max(0, (o[2] - g) / -d[2]);
  return { t, distanceM: t / 20, point: [o[0] + d[0] * t, o[1] + d[1] * t, g] };
}
function hitsOf(ctx, ray) {
  const dir = norm(ray.dir), r = { origin: ray.origin, dir };
  const ev = trace.traceEvents(r, ctx.shapes);
  if (!ev.length) return [];
  const len = new Map();
  for (const h of trace.traceAll(r, ctx.shapes)) len.set(h.id, h.length);
  return ev.map(e => ({ volumeId: e.id, side: e.side < 0 ? 0 : e.side, angleDeg: trace.angleOfIncidence(dir, e.normal), enter: !!e.enter,
    distanceM: e.t / 20, pathLengthUnits: len.get(e.id), point: e.point }));
}
function shoot(ctx, shell, rangeM, ray) {
  const gh = groundHit(ray), notes = [];
  const hits = gh ? hitsOf(ctx, ray).filter(h => h.distanceM <= gh.distanceM) : hitsOf(ctx, ray);
  if (gh) {
    const gp = gh.point.map(r1);
    if (!hits.length) return { plates: [], verdict: 'ground', chance: null, r: CODES.ground, o: CODES.ground, wholeWay: 'ground', last: -1, lastVolume: null, outcome: 'ground', decisive: -1,
      groundPoint: gp, penetration: r1(pen.penetrationAt(shell, rangeM)), notes: ['the shell hits the ground ' + r1(gh.distanceM) + ' m along the ray before any volume'], verdicts: [], ammoNotLoaded: (shell && shell.ammoNotLoaded) || null };
    const r = shootHits(ctx, shell, rangeM, hits, notes);
    // the shell flew through everything before the ground (no stop, no HEAT reach over): it ends on the ground
    if (r.outcome === 'passed_all') { r.outcome = 'ground'; r.groundPoint = gp; notes.push('after the last volume the shell hits the ground ' + r1(gh.distanceM) + ' m along the ray'); }
    return r;
  }
  return shootHits(ctx, shell, rangeM, hits, notes);
}
function shootHits(ctx, shell, rangeM, hits, notes) {
  if (!hits.length) return { plates: [], verdict: 'no_hit', chance: null, outcome: 'no_hit', decisive: -1, penetration: pen.penetrationAt(shell, rangeM), notes: ['the ray misses every volume'], ammoNotLoaded: (shell && shell.ammoNotLoaded) || null };
  const res = pen.resolveShot(shell, rangeM, hits, { armor: ctx.armor, materials: ctx.materials || undefined });
  const plates = res.verdicts.map((v, i) => ({ volume: v.volumeId, side: SIDES[v.side] || v.sideName, enter: v.enter, nominal: r1(v.nominal || 0),
    angle: r1(v.angleDeg || 0), effective: r1(v.effective || 0), penLeft: r1(v.penetration || 0), result: v.result,
    chance: v.result === 'ricochet' ? Math.round((v.chance || 0) * 1000) / 1000 : undefined, distanceM: r1(hits[i].distanceM), note: v.note || undefined }));
  let d = res.verdicts.findIndex(v => v.enter && v.nominal > 0);
  if (d < 0) { d = res.stoppedAt !== null ? res.stoppedAt : 0; notes.push(res.stoppedAt !== null ? 'stopped before any armoured face' : 'no armoured entry face on the ray (all 0 mm)'); }
  const noArmor = d >= 0 && res.stoppedAt === null && !(res.verdicts[d].enter && res.verdicts[d].nominal > 0);
  const dv = res.verdicts[d];
  const verdict = noArmor ? 'no_armor' : res.stoppedAt !== null && res.stoppedAt < d ? res.verdicts[res.stoppedAt].result : dv.result;
  const chance = verdict === 'ricochet' ? Math.round((dv.chance || 0) * 1000) / 1000 : null;
  for (const p of plates) { const n = p.volume.split('/').pop(); if (ctx.join.noArmor.includes(p.volume)) p.flag = 'no armour value'; else if (!ctx.armor.volumes[n] && !Object.keys(ctx.armor.volumes).some(k => lc(k) === lc(n))) p.flag = 'not in def'; }
  // whole way in: every plate up to and including the last hull/turret entry face (else the last armoured entry face)
  const main = h => h.enter && MAIN.test(h.volumeId.split('/').pop());
  let L = -1;
  for (let i = 0; i < hits.length; i++) if (main(hits[i])) L = i;
  if (L < 0) for (let i = 0; i < hits.length; i++) if (hits[i].enter && !ctx.join.noArmor.includes(hits[i].volumeId)) L = i;
  let wholeWay, last;
  if (verdict === 'no_armor' || L < 0) { wholeWay = verdict; last = res.stoppedAt !== null ? res.stoppedAt : hits.length - 1; }
  else if (res.stoppedAt === null || res.stoppedAt > L) { wholeWay = 'penetrate'; last = L; }
  else { wholeWay = res.verdicts[res.stoppedAt].result; last = res.stoppedAt; }
  return { plates, verdict, chance, r: CODES[verdict] || '?', o: CODES[wholeWay] || '?', wholeWay, last, lastVolume: hits[last] ? hits[last].volumeId : null,
    outcome: res.outcome, decisive: d, penetration: r1(res.penetration), notes, verdicts: res.verdicts, ammoNotLoaded: (shell && shell.ammoNotLoaded) || null };
}

// ---------- map ----------
function basis(az, el, ctx) {
  const t = toShooter(az, el, ctx), d = [-t[0], -t[1], -t[2]];
  const F = frame(ctx), up0 = Math.abs(dot(d, F.Z)) > 0.99 ? F.X : F.Z;
  const right = norm(cross(d, up0)), up = norm(cross(right, d));
  return { d, t, right, up };
}
function map(ctx, shell, rangeM, view, size = {}) {
  const w = Math.max(1, size.w | 0 || 64), h = Math.max(1, size.h | 0 || 48);
  const B = basis(view.az, view.el, ctx), b = bounds(ctx), c = centre(ctx);
  let rmin = 1e30, rmax = -1e30, umin = 1e30, umax = -1e30;
  for (let i = 0; i < 8; i++) {
    const p = [i & 1 ? b.max[0] : b.min[0], i & 2 ? b.max[1] : b.min[1], i & 4 ? b.max[2] : b.min[2]];
    const q = add(p, c, -1), r = dot(q, B.right), u = dot(q, B.up);
    rmin = Math.min(rmin, r); rmax = Math.max(rmax, r); umin = Math.min(umin, u); umax = Math.max(umax, u);
  }
  const cell = Math.max((rmax - rmin) / w, (umax - umin) / h) * 1.04 || 1;
  const rc = (rmin + rmax) / 2, uc = (umin + umax) / 2;
  const origin = add(add(c, B.right, rc - cell * w / 2), B.up, uc + cell * h / 2);   // top-left corner of the grid
  const back = reach(ctx), cells = new Array(w * h).fill(null);
  let hitN = 0, penN = 0, firstN = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = add(add(origin, B.right, (x + 0.5) * cell), B.up, -(y + 0.5) * cell);
    const s = shoot(ctx, shell, rangeM, { origin: add(p, B.t, back), dir: B.d });
    if (s.verdict === 'no_hit') continue;
    const v = s.verdicts[s.decisive];
    cells[y * w + x] = { v: ctx.byId.has(v.volumeId) ? ctx.byId.get(v.volumeId) : -1, s: v.side, n: r1(v.nominal || 0), e: r1(v.effective || 0), r: s.r, o: s.o, last: ctx.byId.has(s.lastVolume) ? ctx.byId.get(s.lastVolume) : -1 };
    if (s.verdict !== 'no_armor') { hitN++; if (s.r === 'P') firstN++; if (s.o === 'P') penN++; }
  }
  return { view: view.name, az: view.az, el: view.el, grid: { w, h, origin: origin.map(r1), right: B.right.map(x => Math.round(x * 1e6) / 1e6), up: B.up.map(x => Math.round(x * 1e6) / 1e6), cell: Math.round(cell * 1e4) / 1e4, rows: 'row 0 = top; cell centre = origin + right*(x+0.5)*cell - up*(y+0.5)*cell; rays along -(right x up)' },
    cells, volumes: ctx.vols.map(v => v.id), legend: LEGEND, share: hitN ? penN / hitN : 0, shareFirst: hitN ? firstN / hitN : 0, hitCells: hitN, penetratedCells: penN, firstPlateCells: firstN, notHit: ctx.join.notHit.map(x => x.id) };
}

// ---------- table ----------
function locStr(l) { return l ? l.file + ':' + l.line : null; }
function table(ctx) {
  const A = ctx.armor, rows = [];
  const sceneByName = new Map(ctx.scene.volumes.map(v => [lc(v.name), v]));
  for (const v of Object.values(A.volumes)) {
    const sv = sceneByName.get(lc(v.name));
    const sides = SIDES.map((s, i) => {
      const al = v.source.area[i], ol = v.source.own[i], l = al || ol;
      return { side: s, mm: v.effectiveSides[i], rule: al ? 'area ' + v.area : ol ? 'own' : 'none', at: locStr(l), macro: l && l.site ? locStr(l.site) : null };
    });
    const flags = [];
    if (!v.area && v.effectiveSides.every(x => !x)) flags.push('no armour value');
    if (!sv) flags.push('not in the model');
    else if (!sv.shape) flags.push('no shape (bone or .vol missing)');
    if (v.source.area.some(Boolean)) flags.push('area override');
    if (v.rayCast) flags.push('ray_cast_thickness');
    if (!v.inDef) flags.push('model only');
    const nh = ctx.join.notHit.find(x => lc(x.name) === lc(v.name)); if (nh) flags.push('not hit by shells (' + nh.why + ')');
    rows.push({ name: v.name, id: sv ? sv.id : null, kind: sv ? sv.kind : v.shape, bone: sv ? sv.bone : v.bone, area: v.area, material: v.material || A.defaultMaterial, sides, flags });
  }
  const all = Object.values(A.volumes), shaped = all.filter(v => { const s = sceneByName.get(lc(v.name)); return s && s.shape; });
  const pick = (...res) => { for (const l of [shaped, all]) for (const re of res) { const v = l.find(x => re.test(x.name)); if (v) return v; } return null; };   // volumes in the model first
  const sum = (v, what) => v ? { volume: v.name, front: v.thickness.front, side: v.thickness.left === v.thickness.right ? v.thickness.left : v.thickness.left + '/' + v.thickness.right, rear: v.thickness.rear, top: v.thickness.top } : { volume: null, note: 'no volume named ' + what };
  return { unit: ctx.unit, key: A.key, model: ctx.model, material: A.defaultMaterial, rows, summary: { hull: sum(pick(/^body$/i, /^(body|hull)/i), 'body'), turret: sum(pick(/^turret$/i, /^turret/i), 'turret') }, join: ctx.join && { notHit: ctx.join.notHit, noArmor: ctx.join.noArmor, notInModel: ctx.join.notInModel, noShape: ctx.join.noShape }, problems: A.problems || [] };
}

module.exports = { open, openDoc, hitsOf, groundHit, join, shellFrom, rayFrom, aimVolume, centre, shoot, map, table, parseView, VIEWS, CODES, LEGEND, basis };

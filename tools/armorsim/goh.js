// armorsim/goh: the armour simulator for Gates of Hell, by GoH's own rules as the gohweb notes state them (untested, not run
// game: every answer carries note 'T'). No model geometry: the user names the part (hit volume), the side and the angle from the
// plate's normal; range picks the shell's penetration. Rules (gohweb damage/goh-overmatch-rules, goh-plate-factors-wear,
// goh-part-hp-drain, goh-part-hp-tables, keys/goh-ammo-params; limits GHDMG-25/27/37/38/39/53):
//   P      = ammo GetDamage(range) (projectileDamageTable by m, else projectileDamage x curve, clip) x bullet energy (1: first plate)
//   cos    = max(|cos a|, 0.01); damageScale = min(1/cos, 10); C = weapon calibre; T = the volume's side mm (own thickness block)
//   overmatch (the game): the first table whose lookup hits (tget:
//              the table as read, a miss past its last point) of Calibre max(1, x (T/C)^y) > Fixed max(1, v) > Slope max(1, v ds)
//              > Damping (ds - 1) clamp(T/C s, 0.2, 1) + 1; none hits: the same with s = 1 (kind 'default')
//   flaw (Quality small/medium/large), cast steel (CastSteel cs >= 0), hardness (HighHardness, BHN from set/damage.set, none = 0
//   so the factor is 1), each min(1, ..) with the game's float compare (min: NaN gives 1). Calibre 0 (a flamethrower, any gun
//   without Calibre): T/C infinite, overmatch = ds, the rest 1, as the game's float math does
//   T = mission armour scale x side thickness x difficulty armour factor (GetThickness)
//   T_eff  = overmatch x T x flaw x cast x hardness; passes when P >= T_eff
//   part HP loss (vehicle_health_damage_pierce) = P >= T_eff ? (P - T_eff) x part armor_damage_modifier + ammo MinimumDamageModifier : 0
//     part = the volume's {component}; perk = one named after the part, else the one tagged perk the part carries; record from
//     {category} (set/component.set) then {health}/{armor_damage_modifier}; max hp = max(1, hp); hp first, then hp_broken
// Refused with a code (plain reason in REASONS; the GUI shows it in four languages): a rule the notes do not settle.
//   open(o) -> source   o = { game, folder }        (armordata.openSource, the GoH view, no mods list)
//   shell(spec, o) -> armordata shell + goh {...} + gkind      shells(weapon, o) -> [{ ammo, kind, calibre, penetration, .. }]
//   vehicle(src, target) -> { def, unit, volumes [{ name, sides{}, base, highHardness, castSteel, quality, component, tags }],
//       parts { name: { tags } }, perks { named: {}, tagged: [] }, problems }
//   plate(S, rangeM, vol, side, angleDeg, env) -> verdict | { refused, code, reason }
//   partHp(V, vol, over, minDamage) -> { part, hp, hpBroken, modifier, from, after, state, shotsToBreak, shotsToDestroy } | { refused, .. }
//   shot(o, b) / map(o, b) / effects(o, b)   b = { target, weapon, ammo, range, volume, side, angle }
// Plate thickness T (GHDMG-17/37, block damage/goh-plate-factors-wear):
//   thickness(own, area, side, ray, mul) -> { T, rule 'own'|'area'|'raycast'|'none' } | refusal. The armour area's front/side/rear/top
//   (left/right -> side, top/bottom -> top) when it is not 0, else the volume's own {thickness} side (:120-137: the area wins); a
//   Ray_cast_thickness area: path length through the volume x 1/20 m x 1000 x material steelEquivalent (3D shot only, own ignored);
//   x mul (armour scale x difficulty armour). wholeWound / ray-cast area: damageScale 1 (goh-part-hp-drain).
// Difficulty: set/difficulty/<level>.dl, a leading "base" string copies that level
//   {any ..} / {ally|enemy|neutral|player ..} blocks of {armor x} {vehicle_health x} (default 1). armor scales T of a non-human
//   target (penetration), vehicle_health a part's max hp and hp_broken (the game ) [I both].
//   Default level 'multiplayer', group 'ally' [I]. Mission armour scale (/276): 1 unless a mission sets it.
// Blast (gohblast.js) at the burst point of a stopped shell (3D); a bounce followed when it leaves the plate (3D, judge legs).
// 3D shot at the unit's model (the AS64 geometry: tools/lib/model sceneload + trace, sim.js rayFrom / hitsOf / groundHit / parseView):
//   shot3(o, b) b = { target, weapon, ammo, range, az, el, aim | aimVolume | origin + dir, ground } -> the AS64 /shot form
//     { ray, plates [{ volume, side, enter, nominal, angle, effective, penLeft, result, rule, part, samePart }], decisive, verdict, outcome,
//       groundPoint, shell } + the GoH answer of the first armoured plate { plate, effects, ricochet, refused, code, reason }
//     The walk of + the game (GoH ,, read 2026-11-23;
//     gohweb the game: the game@997 / Update@556 "changed vs AS2 base" for the falloff, guided missile and soldier-jet lines only;
//     q -g: "pair as64 0x979b10 = GoH 0x833de0 by graph", the game not in the pair lists):
//       every face in order, entry and exit; a face of the same part as the last part face is skipped (Move, samePart);
//       the first hit sets the HEAT reach (cumulative m past it: later faces 'beyond_jet', the game = as64);
//       energy E = P x e (e = energy, 1 at the start); E < 1e-5: 'missed' (flies on); thickness as below; exit face of a
//       ray-cast area passes (:1081); T_eff by GoH's factors; passed = E >= T_eff; pierced = area calibre gate, E >= threshold,
//       no disable_damage_acc (GoH sets pierced only here, as64 also
//       on passed: GHDMG plate-factors-wear "apply"); pierced and min(E, T_eff) >= detonationThickness: fuze, stopped; pierced on an
//       entry face: e -= min(E, T_eff) / E, clamped 0..1 (:1113, = as64, pen.js plate) [I: same line in both programs];
//       pierced and passed: flies on ('penetrate'); else stopped: a bounce unless the shell is fg / no_ricochet or the gun has
//       DisableRicochet (:1120 = as64), then rolls the material's ricochet chance at the grazing angle
//       none past g_maximumRicochets 2 or without a material (= as64, pen.ricochetChance) [I: same lines in both programs].
//       A stopped face with a bounce chance > 0 reads 'ricochet' (+ chance), else 'no_penetration'. Each passed part face drains
//       its part by (E - T_eff) x modifier + MinimumDamageModifier (the pierce call runs before e drops, <).
//     The first face with T > 0 is the decisive one (plate / effects / ricochet of the answer); outcome = where the walk ended.
//   map3(o, b) b = { .., view 'front'|'rear'|'left'|'right'|'top'|'az,el', grid 'WxH' } -> the AS64 /map form { grid, cells
//     [{ v, s, n, e, r, o }], volumes, share, hitCells, .. } judged on the first armoured plate of each cell's ray (o = r)
// Author: Imperator_Aug (ARSENAL, ia-77b71356)
'use strict';
const AD = require('./armordata'), pen = require('./pen');

const SIDES = ['front', 'top', 'left', 'right', 'rear', 'bottom'];
const lc = s => String(s == null ? '' : s).toLowerCase();
const r2 = n => Math.round(n * 100) / 100;
const r4 = n => Math.round(n * 10000) / 10000;
// rules the GoH answers leave out (each a code; the GUI names them in four languages)
// (gohsim03: 'ricochet', 'spaced', 'jet' answered now, 'area' became 'area2' with the area gate; 'onePlate' = by-part pick only)
// (gohwave: scale, difficulty, area2 answered; blast and bounce answered in 3D; noOvermatch / unsorted / noHardness / flame /
// noCalibre / areaOrder answered by the game's defaults, no longer refusals)
const LEFT_OUT = ['onePlate', 'bounce', 'blast', 'drop', 'geometry', 'script'];
const REASONS = {
  noShell: 'The gun or shell was not found in the Gates of Hell data or the mod.',
  noThickness: 'This part has no thickness of its own; the armour-area thickness GoH would use instead is not read here.',
  perkOrder: 'Several tagged perks fit this part and GoH picks by an internal order the notes do not give.',
  noPerks: 'This unit\'s part health could not be read (no perks block found).',
  rayCast: 'This part\'s armour area takes its thickness along the shot through the volume (Ray_cast_thickness): pick the hit point in the 3D view.',
  noModel: 'No model with volumes was found for this unit, so there is nothing to shoot at in 3D.',
};
// left out of a 3D answer: the hit point, side and angle come from the model there
const LEFT_OUT_3D = LEFT_OUT.filter(c => c !== 'geometry' && c !== 'onePlate' && c !== 'bounce' && c !== 'blast');
// the game's Min / Max / Clamp: Min(1, NaN) = 1 as its float compare gives (Math.min would give NaN)
const eMin = (a, b) => (b < a ? b : a), eMax = (a, b) => (a < b ? b : a);
const eClamp = (v, lo, hi) => { const r = v < lo ? lo : v; return hi < r ? hi : r; };
const refuse = code => ({ refused: true, code, reason: REASONS[code] });

// exe 'goh': the GoH view of the install (the same source the Models routes open for guns, so one cache)
function open(o) { return AD.openSource({ game: o.game, mods: [], folder: o.folder || undefined, exe: 'goh' }); }

// a display kind from the ammo's tags (GoH names: apcbche, hvap, heatc, sm, wp ...)
function gkind(tags) {
  const has = re => (tags || []).some(t => re.test(t));
  if (has(/^(apcr|hvap|apds)\d*$/)) return 'apcr';
  if (has(/^heat[a-z]?\d*$/) || has(/^cumulative$/)) return 'heat';
  if (has(/^(sm|wp|smoke)\d*$/)) return 'smoke';
  if (has(/^(ap[a-z]{0,5}|sap)\d*$/)) return 'ap';
  if (has(/^(he|fg)\d*$/)) return 'he';
  return 'other';
}
function shell(spec, o) {
  const S = AD.shell(spec, { game: o.game, mods: [], folder: o.folder || undefined, exe: 'goh', src: o.src || open(o), goh: true });
  if (S) S.gkind = gkind(S.tags);
  return S;
}
function shells(weapon, o) {
  const first = shell({ weapon }, o);
  if (!first) return { weapon, shells: [] };
  const names = first.candidates && first.candidates.length ? first.candidates : first.ammo ? [first.ammo] : [];
  const out = [];
  for (const ammo of names.slice(0, 30)) {
    let s = null;
    try { s = shell({ weapon, ammo }, o); } catch (e) { s = null; }
    if (!s) continue;
    out.push({ ammo: s.ammo || ammo, kind: s.gkind, calibre: s.calibre, penetration: s.penetration || [], aimRange: s.aimRange, maxRange: s.maxRange < 1e30 ? s.maxRange : null,
      cumulative: s.cumulative || 0, overmatch: overmatchKind(s), minimumDamageModifier: r2((s.goh && s.goh.minimumDamageModifier) || 0), params: s.params });
  }
  return { weapon: first.weapon || weapon, shells: out, game: 'goh', note: 'T' };
}

// ---------- tables ----------
// the lookup that can miss (table function / keyed table Get(x, &y), ,): the table as read (Calibre /
// Fixed / Slope are not sorted), one point = that point, x below the first point raised to it, then the first point at or past x
// interpolated from the one before; past the last point a miss (null), so the game tries the next table
function tget(t, x, col) {
  if (!t || !t.length) return null;
  if (t.length === 1) return t[0][col];
  if (x < t[0][0]) x = t[0][0];
  let prev = t[0];
  for (const p of t) {
    if (p[0] >= x) return p === prev ? p[col] : (x - prev[0]) / (p[0] - prev[0]) * (p[col] - prev[col]) + prev[col];
    prev = p;
  }
  return null;
}
// the lookup that holds its ends (Get(x), a sorted table): at / before the first point = first value, at / past the last = last
function look(t, x, col) {
  if (!t || !t.length) return null;
  if (x <= t[0][0]) return t[0][col];
  const L = t[t.length - 1];
  if (x >= L[0]) return L[col];
  for (let i = 0; i + 1 < t.length; i++) {
    const a = t[i], b = t[i + 1];
    if (a[0] <= x && x <= b[0]) return b[0] === a[0] ? b[col] : a[col] + (b[col] - a[col]) * (x - a[0]) / (b[0] - a[0]);
  }
  return L[col];
}
function overmatchKind(S) {
  const g = S.goh || {};
  if ((g.overmatchCalibre || []).length) return 'calibre';
  if ((g.overmatchFixed || []).length) return 'fixed';
  if ((g.overmatchSlope || []).length) return 'slope';
  if ((S.overmatchDamping || []).length) return 'damping';
  return 'default';
}
// the game: the calibre table first (a hit sets fixed 0, slope 0
// scale 1), else fixed, else slope, else damping (scale); all miss: fixed 0, slope 0, scale 1. Angles: the tables are read in
// degrees and kept in radians, the same lookup here in degrees.
function overmatch(S, T, C, angleDeg, damageScale) {
  const g = S.goh || {};
  let cal = null, fixed = 0, slope = 0, scale = 1, from = 'default';
  const cx = tget(g.overmatchCalibre, angleDeg, 1);
  if (cx != null) { cal = [cx, tget(g.overmatchCalibre, angleDeg, 2)]; from = 'calibre'; }
  else {
    const f = tget(g.overmatchFixed, angleDeg, 1);
    if (f != null) { fixed = f; from = 'fixed'; }
    else {
      const sl = tget(g.overmatchSlope, angleDeg, 1);
      if (sl != null) { slope = sl; from = 'slope'; }
      else { const d = tget(S.overmatchDamping, angleDeg, 1); if (d != null) { scale = d; from = 'damping'; } }
    }
  }
  if (cal && (cal[0] !== 0 || cal[1] !== 0)) return { kind: 'calibre', x: r4(cal[0]), y: r4(cal[1]), factor: eMax(1, Math.pow(T / C, cal[1]) * cal[0]) };
  if (fixed !== 0) return { kind: 'fixed', v: r4(fixed), factor: eMax(1, fixed) };
  if (slope !== 0) return { kind: 'slope', v: r4(slope), factor: eMax(1, slope * damageScale) };
  // a table that hit with 0 (or none hit): the damping rule with the scale it left
  return { kind: from === 'damping' ? 'damping' : 'default', s: r4(scale), from, factor: (damageScale - 1) * eClamp(T / C * scale, 0.2, 1) + 1 };
}
//  flaw, cast steel, hardness (Min(1, ..) as the game compares: a NaN gives 1)
function flaw(q, a, T, C) {
  const w = lc(q);
  const f = w === 'small_flaw' ? 0.871 - 0.0004 * a + 0.111 * T / C : w === 'medium_flaw' ? 0.744 - 0.0008 * a + 0.222 * T / C : w === 'large_flaw' ? 0.741 - 0.0023 * a + 0.235 * T / C : 1;
  return eMin(1, f);
}
const cast = (cs, T, C) => (cs == null || cs < 0 ? 1 : eMin(1, cs + 0.001238 * T - 0.0002628 * C + 0.02706 * T / C));
// bhn 0 (no hardness table: the game empty table gives 0): 0^-0.4363 infinite, so 1
const hardness = (bhn, T, C) => eMin(1, 9.7707 * Math.pow(C, 0.06111) * Math.pow(T / C, 0.2821) * Math.pow(bhn, -0.4363));

// ---------- the game's set files ----------
function setTables(src) {
  if (src._gohSets) return src._gohSets;
  // energy_per_blastwave: 5 unless damage.set gives it
  const out = { brinell: null, categories: {}, epb: 5 };
  const dmg = AD.parse(src, 'resource/set/damage.set');
  if (dmg) for (const b of dmg.items.filter(i => i.k === 'BLOCK')) for (const c of AD.kids(b, new Set())) {
    const n = lc(AD.nameOf(c));
    if (n === 'brinell_hardness_multiplier') out.brinell = AD.kids(c, new Set()).map(r => r.items.filter(i => i.k === 'INTEGER' || i.k === 'FLOAT').map(i => i.value)).filter(p => p.length >= 2).map(p => [p[0], p[1]]);
    else if (n === 'energy_per_blastwave' && AD.nums(c).length) out.epb = AD.nums(c)[0];
  }
  const comp = AD.parse(src, 'resource/set/component.set');
  if (comp) for (const b of comp.items.filter(i => i.k === 'BLOCK')) for (const c of AD.kids(b, new Set())) {
    if (lc(AD.nameOf(c)) !== 'category' || AD.str0(c) == null) continue;
    const r = { hp: 0, hpBroken: 0, modifier: 1 };
    readHealth(c, r);
    out.categories[lc(AD.str0(c))] = r;
  }
  return (src._gohSets = out);
}
// the difficulty levels: { names, levels { name: { base, groups { player|ally|enemy|neutral: { armor, vehicle_health } } } } }
// (the game / Read / the game, ; values start at 1). The map directory's own
// levels (LoadDifficultyDirectory of the mission's map) are not read here [T].
const DGROUPS = ['player', 'ally', 'enemy', 'neutral'];
function difficulties(src) {
  if (src._gohDiff) return src._gohDiff;
  const none = new Set(), levels = {}, dir = 'resource/set/difficulty/';
  const names = AD.keys(src).filter(k => k.startsWith(dir) && /^[^/]+\.dl$/i.test(k.slice(dir.length))).map(k => lc(k.slice(dir.length, -3)));
  const load = name => {
    const n = lc(name).replace(/\.dl$/, '');
    if (levels[n]) return levels[n];
    const L = levels[n] = { base: null, groups: {} };   // set first: a base loop stops here [I]
    for (const g of DGROUPS) L.groups[g] = { armor: 1, vehicle_health: 1 };
    let root = null;
    try { root = AD.parse(src, dir + n + '.dl'); } catch (e) { root = null; }
    const blk = root && root.items.find(i => i.k === 'BLOCK');
    if (!blk) { L.missing = true; return L; }
    const s1 = blk.items[1];
    if (s1 && s1.k === 'STRING') {
      const b = load(s1.value);
      L.base = lc(s1.value);
      for (const g of DGROUPS) L.groups[g] = Object.assign({}, b.groups[g]);
    }
    for (const gb of AD.kids(blk, none)) {
      const gn = lc(AD.nameOf(gb)), to = gn === 'any' ? DGROUPS : DGROUPS.includes(gn) ? [gn] : [];
      for (const f of AD.kids(gb, none)) {
        const pn = lc(AD.nameOf(f)), v = AD.nums(f)[0];
        if ((pn === 'armor' || pn === 'vehicle_health') && v != null) for (const g of to) L.groups[g][pn] = v;
      }
    }
    return L;
  };
  for (const n of names) load(n);
  return (src._gohDiff = { names: names.sort(), levels });
}
// the factors of one shot: b.armorScale (a mission's, default 1), b.difficulty (level, default multiplayer), b.group (default ally)
function rulesOf(src, b) {
  const D = difficulties(src), want = lc(b && b.difficulty), group = DGROUPS.includes(lc(b && b.group)) ? lc(b.group) : 'ally';
  const level = want && D.levels[want] ? want : D.levels.multiplayer ? 'multiplayer' : null;
  const f = level ? D.levels[level].groups[group] : { armor: 1, vehicle_health: 1 };
  const sc = Number(b && b.armorScale), armorScale = Number.isFinite(sc) && sc > 0 ? sc : 1;
  return { armorScale, difficulty: level, asked: want && want !== level ? want : undefined, group, armor: f.armor, vehicleHealth: f.vehicle_health, levels: D.names,
    mul: armorScale * f.armor };
}
function readHealth(blk, r) {
  for (const k of AD.kids(blk, new Set())) {
    const n = lc(AD.nameOf(k));
    if (n === 'hp') r.hp = AD.nums(k)[0] || 0;
    else if (n === 'hp_broken') r.hpBroken = AD.nums(k)[0] || 0;
    else if (n === 'armor_damage_modifier') r.modifier = AD.nums(k)[0];
    else if (n === 'health') readHealth(k, r);
  }
}

// ---------- the unit: its def with includes and macros expanded ----------
function vehicle(src, target) {
  const f = AD.findDef(src, target);
  if (!f) return null;
  const root = AD.parse(src, f.key);
  const ent = root && root.items.find(i => i.k === 'BLOCK');
  if (!ent) return null;
  const vols = new Map(), parts = {}, perks = { named: {}, tagged: [], found: false, blastwaveModifier: 1 }, problems = [];
  const sets = setTables(src);
  const none = new Set();
  const perkRec = (blk, base) => {
    const r = Object.assign({ hp: 0, hpBroken: 0, modifier: 1 }, base || {});
    for (const k of AD.kids(blk, none)) {
      const n = lc(AD.nameOf(k));
      if (n === 'category') { const c = sets.categories[lc(AD.str0(k))]; if (c) Object.assign(r, c, { category: lc(AD.str0(k)) }); else problems.push('Invalid component category: ' + AD.str0(k)); }
      else if (n === 'health') readHealth(k, r);
      else if (n === 'armor_damage_modifier') r.modifier = AD.nums(k)[0];
    }
    return r;
  };
  for (const c of AD.kids(ent, none)) {
    const n = lc(AD.nameOf(c));
    if (n === 'volume' && c.items[1] && c.items[1].k === 'STRING') {
      const name = c.items[1].value, k = lc(name);
      let v = vols.get(k);
      if (!v) { v = { name, sides: null, base: null, highHardness: false, castSteel: null, quality: null, component: null, tags: [] }; vols.set(k, v); }
      for (const x of AD.kids(c, none)) {
        const xn = lc(AD.nameOf(x));
        if (xn === 'thickness') {
          const b = AD.nums(x)[0];
          v.base = b == null ? 0 : b;                                  // a later {thickness} resets every side [I]
          v.sides = {}; for (const s of SIDES) v.sides[s] = v.base;
          for (const s of AD.kids(x, none)) { const sn = lc(AD.nameOf(s)); if (SIDES.includes(sn) && AD.nums(s).length) v.sides[sn] = AD.nums(s)[0]; }
        } else if (xn === 'highhardness') v.highHardness = true;
        else if (xn === 'caststeel') { const cs = AD.nums(x)[0]; if (cs != null) { v.castSteel = cs; if (cs <= 0) problems.push('Cast steel value can\'t be below 0! (' + name + ')'); } }
        else if (xn === 'quality') v.quality = AD.str0(x) || (x.items[1] && x.items[1].text) || null;
        else if (xn === 'component') v.component = AD.str0(x);
        else if (xn === 'tags') for (const s of AD.strs(x)) for (const w of lc(s).split(/\s+/).filter(Boolean)) if (!v.tags.includes(w)) v.tags.push(w);
      }
    } else if (n === 'component' && AD.str0(c) != null) {
      const pn = lc(AD.str0(c)), p = parts[pn] || (parts[pn] = { name: AD.str0(c), tags: [pn] });
      for (const k of AD.kids(c, none)) if (lc(AD.nameOf(k)) === 'tags') for (const s of AD.strs(k)) for (const w of lc(s).split(/\s+/).filter(Boolean)) if (!p.tags.includes(w)) p.tags.push(w);
    } else if (n === 'perks') {
      perks.found = true;
      for (const k of AD.kids(c, none)) {
        // {perks {blastwave_modifier x}}: the blast's part damage factor (default 1)
        if (lc(AD.nameOf(k)) === 'blastwave_modifier') { const bw = AD.nums(k)[0]; if (bw != null) perks.blastwaveModifier = bw; continue; }
        if (lc(AD.nameOf(k)) !== 'component') continue;
        const a1 = k.items[1], isTag = a1 && a1.k === 'IDENT' && lc(a1.text) === 'tag';
        const nm = lc(isTag ? (k.items[2] && k.items[2].value) : AD.str0(k));
        if (!nm) continue;
        if (isTag) { const had = perks.tagged.find(t => t.tag === nm); const r = perkRec(k, had && had.rec); if (had) had.rec = r; else perks.tagged.push({ tag: nm, rec: r }); }
        else perks.named[nm] = perkRec(k, perks.named[nm]);
      }
    }
  }
  // the model's volumes: a def volume the .mdl does not have is never hit (left off the map, marked in the list)
  const ext = AD.kids(ent, none).find(c => lc(AD.nameOf(c)) === 'extension' && AD.str0(c));
  const mdl = ext ? AD.resolveRel(f.key, AD.str0(ext)) : null, inModel = new Map();
  let model = null;
  try { if (mdl && AD.modelVolumes(src, mdl, inModel, [])) model = mdl; } catch (e) { model = null; }
  const volumes = [...vols.values()].filter(v => v.sides);
  for (const v of volumes) v.inModel = model ? inModel.has(lc(v.name)) : null;
  return { def: f.key, unit: f.key.split('/').pop().replace(/\.def$/, ''), model, volumes, all: vols, parts, perks, problems, sets };
}
const findVol = (V, name) => V.volumes.find(v => lc(v.name) === lc(name)) || null;

// a weapon under stuff/flame (GoH flamethrowers carry no Calibre: the only guns without one in vanilla GoH, survey 2026-11-23)
const isFlame = S => /(^|\/)flame\//.test(lc(S && S.weaponKey));
// calibre from the "bulletNN" filling tag (armordata, the AS2 FINISH rule): not confirmed for GoH [I]; vanilla GoH never needs it
const calibreFrom = S => { const s = (S && S.source) || {}; return s.calibre && s.filling && s.calibre.file === s.filling.file && s.calibre.line === s.filling.line ? 'filling' : 'weapon'; };

// ---------- plate thickness (GetThickness) ----------
function areaSide(area, side) {
  const t = area && area.thickness;
  if (!t) return 0;
  return side === 'front' ? t.front : side === 'left' || side === 'right' ? t.side : side === 'rear' ? t.rear : t.top;
}
function thickness(own, area, side, ray, mul) {
  const k = mul == null ? 1 : mul, hasOwn = !!(own && own[side] != null);
  if (area && area.flags && area.flags.rayCastThickness) {
    if (!ray || ray.pathLengthUnits == null) return refuse('rayCast');
    const se = ray.steelEquivalent == null ? 1 : ray.steelEquivalent;
    return { T: ray.pathLengthUnits / 20 * 1000 * se * k, rule: 'raycast', area: area.name, steelEquivalent: se };
  }
  const av = areaSide(area, side) || 0;
  if (av !== 0) return Object.assign({ T: av * k, rule: 'area', area: area.name }, hasOwn ? { own: own[side] } : {});
  return hasOwn ? { T: own[side] * k, rule: 'own' } : { T: 0, rule: 'none' };
}
const flatOf = area => !!(area && area.flags && (area.flags.wholeWound || area.flags.rayCastThickness));
// the armour (areas, materials, every volume's tags / material / area) as armordata reads it for GoH; null when it cannot
function armorOf(src, V, o) {
  try { return AD.vehicleArmor(V.unit, { game: o.game, mods: [], folder: o.folder || undefined, exe: 'goh', src }); } catch (e) { return null; }
}
function areaFor(A, name) {
  if (!A) return null;
  const v = A.volumes[name] || Object.values(A.volumes).find(x => lc(x.name) === lc(name));
  return v && v.area ? A.areas.find(a => a.name === v.area) || null : null;
}

// ---------- one plate ----------
function plate(S, rangeM, vol, side, angleDeg, env) {
  const P = env && env.P != null ? env.P : pen.penetrationAt(S, rangeM), C = +S.calibre || 0;   // env.P: the energy left (3D walk)
  const T = env && env.T != null ? env.T : vol.sides ? vol.sides[side] : null;   // env.T: thickness() (own / area / ray cast)
  if (T == null) return refuse('noThickness');
  const cos = Math.max(Math.abs(Math.cos(angleDeg * Math.PI / 180)), 0.01), a = Math.acos(cos) * 180 / Math.PI;
  // wholeWound / Ray_cast_thickness area: slope scale 1 (block damage/goh-part-hp-drain, GHDMG-25) [I] for the flaw angle
  const damageScale = env && env.flat ? 1 : Math.min(1 / cos, 10);
  const base = { volume: vol.name, side, angle: angleDeg, nominal: r2(T), penetration: r2(P), calibre: C };
  if (calibreFrom(S) === 'filling') base.calibreFrom = 'filling';
  // no calibre (calibre 0): the game divides by it all the same (flamethrowers: their fire comes from the gun's own reaction)
  if (!(C > 0)) { base.noCalibre = true; if (isFlame(S)) base.flame = true; }
  if (!(T > 0)) return Object.assign(base, { effective: 0, result: P > 1e-5 ? 'penetrate' : 'no_penetration', margin: r2(P), factors: null, zero: true });
  const om = overmatch(S, T, C, a, damageScale);
  let hard = 1, bhn = null;
  if (vol.highHardness) {
    const bt = env && env.sets && env.sets.brinell;
    bhn = bt && bt.length ? look(bt, T, 1) : 0;
    hard = hardness(bhn, T, C);
  }
  const fl = flaw(vol.quality, a, T, C), cs = cast(vol.castSteel, T, C);
  const eff = om.factor * T * fl * cs * hard;
  return Object.assign(base, { effective: r2(eff), result: P >= eff ? 'penetrate' : 'no_penetration', margin: r2(P - eff), damageScale: r4(damageScale),
    factors: { overmatch: Object.assign({}, om, { factor: r4(om.factor) }), flaw: r4(fl), quality: vol.quality || null, castSteel: r4(cs), cs: vol.castSteel, hardness: r4(hard), highHardness: vol.highHardness, bhn } });
}

// the game pierce gate: null = pierced, else why not. The threshold is
// (value, else koef x T_eff, else T_eff / ProjectileDamageThreshold, else T_eff / 1.5) = pen.threshold [I: same
// formula in both programs; a ray-cast area's threshold uses the volume's least extent there, here the shot's own T].
function gateOf(E, eff, area, S) {
  const cal = (area && area.threshold && area.threshold.calibre) || 0;
  if (cal && !((+S.calibre || 0) >= cal)) return 'calibre';
  if (area && area.flags && area.flags.disableDamageAcc) return 'noDamageAcc';
  return E >= pen.threshold(eff, area, S) ? null : 'threshold';
}
// a stopped shell: bounce or burst (the game + of GoH; the same lines as as64, pen.ricochetChance)
//   -> { known, possible, chance, grazing, material, why: 'gun'|'shell'|'table'|'noMaterial'|null }
function bounceOf(S, mat, matName, angleDeg, ricochets) {
  const grazing = r1(90 - Math.acos(Math.min(1, Math.abs(Math.cos((angleDeg || 0) * Math.PI / 180)))) * 180 / Math.PI);
  if (S.disableRicochet) return { known: true, possible: false, chance: 0, grazing, material: matName || null, why: 'gun' };
  if (S.noRicochet) return { known: true, possible: false, chance: 0, grazing, material: matName || null, why: 'shell' };
  if (!mat) return { known: false, possible: null, chance: null, grazing, material: matName || null, why: 'noMaterial' };
  if ((ricochets || 0) >= 2) return { known: true, possible: false, chance: 0, grazing, material: matName || null, why: 'twice' };   // g_maximumRicochets
  const p = pen.ricochetChance(mat, angleDeg, 0, { disableRicochet: false });
  return { known: true, possible: p > 0, chance: Math.round((p || 0) * 1000) / 1000, grazing, material: matName || null, why: p > 0 ? null : 'table' };
}
// the flight after a bounce ( the game): h = the stop face { point, normal }, d = the
// shell's direction, e = its energy share there, P = its damage at the range. -> { cone } (cos > 0.8: a random cone, not followed)
// | { origin, dir, grazing, deflection, speed, damping, e, clipped }. The shell leaves deflection degrees off the surface along it
// (rotation of -v by pi - angle - deflection about -v x n, n taken against the flight [I sign]); speed ((0.7 - 0.9) cos + 0.9) x the
// material's velocity damping (1.2); energy x the ammo's RicochetEnergyDamping at the angle, else x speed; RicochetDamageClip caps
// the damage; the new shell starts 0.3 units before the hit (BULLET_SURFACE_OFFSET). No drop (left out).
const v3n = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const vdot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function bounceRay(S, mat, h, dir, e, P) {
  const d = v3n(dir);
  let n = v3n(h.normal || [0, 0, 1]);
  if (vdot(d, n) > 0) n = n.map(x => -x);
  const cos = eClamp(Math.abs(vdot(d, n)), 0, 1), grazing = 90 - Math.acos(cos) * 180 / Math.PI;
  if (cos > 0.8) return { cone: true, grazing: r1(grazing) };
  const R = (mat && mat.ricochet) || {};
  const defl = R.angle && R.angle.length ? R.angle : [[0, 0], [90, 90]];
  const dv = tget(defl, grazing, 1), deflection = dv == null ? 0 : dv;
  const speed = ((0.7 - 0.9) * cos + 0.9) * (R.velocityDumping == null ? 1.2 : R.velocityDumping);
  const ed = S.ricochetEnergyDamping && S.ricochetEnergyDamping.length ? S.ricochetEnergyDamping.slice().sort((a, b) => a[0] - b[0]) : null;
  const damping = ed ? look(ed, grazing, 1) : speed;
  let e2 = damping * e, clipped = false;
  const clip = +S.ricochetDamageClip || 0;
  if (clip !== 0) { const dmg = P * e2; if (dmg > clip) { e2 = clip / dmg * e2; clipped = true; } }
  const t = v3n([d[0] - vdot(d, n) * n[0], d[1] - vdot(d, n) * n[1], d[2] - vdot(d, n) * n[2]]), rd = deflection * Math.PI / 180;
  const out = v3n([0, 1, 2].map(i => Math.cos(rd) * t[i] + Math.sin(rd) * n[i]));
  const origin = [0, 1, 2].map(i => h.point[i] - 0.3 * d[i]);
  return { origin, dir: out, grazing: r1(grazing), deflection: r1(deflection), speed: r4(speed), damping: r4(damping), e: e2, clipped };
}
function matsOf(x, o) {
  if (x.mats) return x.mats;
  try { x.mats = AD.materials({ game: o.game, mods: [], folder: o.folder || undefined, exe: 'goh', src: x.src }) || {}; } catch (e) { x.mats = {}; }
  return x.mats;
}
// the material a volume is made of: its own, else the unit's default (armordata), with its record from the material set
function matOf(x, o, name) {
  const k = lc(name), av = x.A && (x.A.volumes[name] || Object.values(x.A.volumes).find(v => lc(v.name) === k));
  const nm = (av && av.material) || (x.A && x.A.defaultMaterial) || null;
  return { name: nm, rec: nm ? matsOf(x, o)[lc(nm)] || null : null };
}

// ---------- the part behind the plate (vehicle_health_damage_pierce) ----------
// the part's health record: { rec, from } | refusal
function partRec(V, part) {
  if (!V.perks.found) return refuse('noPerks');
  let rec = V.perks.named[part], from = 'named';
  if (!rec) {
    const tags = (V.parts[part] && V.parts[part].tags) || [part];
    const fit = V.perks.tagged.filter(t => tags.includes(t.tag));
    if (fit.length > 1) return Object.assign(refuse('perkOrder'), { part, tags: fit.map(t => t.tag) });
    if (fit.length) { rec = fit[0].rec; from = 'tag ' + fit[0].tag; }
  }
  if (!rec) { rec = { hp: 0, hpBroken: 0, modifier: 1 }; from = 'none'; }
  return { rec, from };
}
// vh = the difficulty's vehicle_health factor on max hp and hp_broken (the game) [I both]; o.loss: a loss given (the blast's)
function partHp(V, vol, over, minDamage, vh, o) {
  const part = vol.component ? lc(vol.component) : null;
  if (!part) return { part: null, loss: 0, state: 'none' };   // no part: the HP action has nothing to drain
  const pr = partRec(V, part);
  if (pr.refused) return pr;
  const { rec, from } = pr, k = vh == null ? 1 : vh;
  const loss = o && o.loss != null ? o.loss : over == null ? 0 : over * rec.modifier + (minDamage || 0);
  const hp = Math.max(1, rec.hp) * k, hb = rec.hpBroken * k;
  const shots = (pool) => (loss > 1e-5 ? Math.ceil(pool / loss - 1e-9) : null);
  let left = hp - loss, brokeLeft = hb;
  if (left < 0) { brokeLeft = Math.max(0, hb + left); left = 0; }
  const state = loss <= 0 ? 'working' : left < 1e-5 ? (hb > 0 && brokeLeft < 1e-5 ? 'destroyed' : 'broken') : 'working';
  return { part, from, category: rec.category || null, hp, hpBroken: hb, modifier: rec.modifier, loss: r2(loss), after: { hp: r2(left), hpBroken: r2(brokeLeft) }, state,
    shotsToBreak: shots(hp), shotsToDestroy: hb > 0 ? shots(hp + hb) : null };
}
// over = P - T_eff when the shell passed, else null (P < T: no HP loss); the minimum damage is the ammo's MinimumDamageModifier
const overOf = v => (v.result === 'penetrate' ? Math.max(0, v.penetration - v.effective) : null);
const minOf = S => (S.goh && S.goh.minimumDamageModifier) || 0;

// ---------- routes' work ----------
function setup(o, b) {
  const src = open(o);
  const V = vehicle(src, b.target);
  if (!V) return { error: 'No unit file named ' + b.target + '.def was found in Gates of Hell or the mod. Pick a vehicle or gun.' };
  const S = shell(b.ammo ? { weapon: b.weapon, ammo: b.ammo } : { weapon: b.weapon }, Object.assign({}, o, { src }));
  if (!S || !S.weaponKey) return Object.assign({ V }, refuse('noShell'));
  return { src, V, S, A: armorOf(src, V, o), k: rulesOf(src, b) };
}
const head = (V, S, b, k) => ({ game: 'goh', note: 'T', leftOut: LEFT_OUT, unit: V.unit, key: V.def, weapon: S.weapon, ammo: S.ammo, kind: S.gkind, calibre: S.calibre, rangeM: +b.range,
  penetration: r2(pen.penetrationAt(S, +b.range)), minimumDamageModifier: r2((S.goh && S.goh.minimumDamageModifier) || 0), problems: V.problems,
  disableRicochet: !!S.disableRicochet, pastTable: (!(pen.penetrationAt(S, +b.range) > 1e-5) && pen.penetrationAt(S, 0) > 1e-5) || undefined, calibreFrom: calibreFrom(S), noCalibre: !(+S.calibre > 0) || undefined, flame: isFlame(S) || undefined,
  rules: k ? { armorScale: k.armorScale, difficulty: k.difficulty, asked: k.asked, group: k.group, armor: k.armor, vehicleHealth: k.vehicleHealth, levels: k.levels } : undefined });
// one plate of a part picked by name: its thickness (the area's, else its own), then GoH's rules
function partPlate(x, vol, side, angle, rangeM, ray) {
  const area = areaFor(x.A, vol.name), th = thickness(vol.sides, area, side, ray, x.k ? x.k.mul : 1);
  if (th.refused) return th;
  const v = plate(x.S, rangeM, vol, side, angle, { sets: x.V.sets, T: th.T, flat: flatOf(area) });
  if (!v.refused) { v.rule = th.rule; if (th.area) v.area = th.area; }
  return v;
}
// a plate the shell passes but does not pierce stops it (gateOf); v.gate names why
function gate2d(x, vol, v) {
  if (v.refused || v.result !== 'penetrate') return v;
  const g = gateOf(v.penetration, v.effective, areaFor(x.A, vol.name), x.S);
  if (g) { v.result = 'no_penetration'; v.gate = g; }
  return v;
}
function shot(o, b, withHp) {
  const x = setup(o, b);
  if (x.error) return x;
  if (x.refused) return Object.assign({ game: 'goh', note: 'T', leftOut: LEFT_OUT }, x, { V: undefined, A: undefined });
  const { V, S } = x, vol = findVol(V, b.volume);
  if (!vol) return { error: '"' + b.volume + '" is not an armoured part of this unit. Its parts: ' + (V.volumes.map(v => v.name).join(', ') || 'none') + '.' };
  const side = lc(b.side || 'front');
  const out = head(V, S, b, x.k), v = partPlate(x, vol, side, +b.angle || 0, +b.range, null);
  if (v.refused) return Object.assign(out, { refused: true, code: v.code, reason: v.reason, volume: vol.name, side });
  gate2d(x, vol, v);
  out.plate = v; out.verdict = v.result;
  if (v.result !== 'penetrate') { const m = matOf(x, o, vol.name); out.ricochet = bounceOf(S, m.rec, m.name, v.angle); }
  if (withHp) {
    const h = partHp(V, vol, overOf(v), minOf(S), x.k.vehicleHealth);
    out.effects = h.refused ? { refused: true, code: h.code, reason: h.reason } : h;
  }
  return out;
}
function map(o, b) {
  const x = setup(o, b);
  if (x.error) return x;
  if (x.refused) return Object.assign({ game: 'goh', note: 'T', leftOut: LEFT_OUT }, x, { V: undefined, A: undefined });
  const { V, S } = x, out = head(V, S, b, x.k), angle = +b.angle || 0;
  out.angle = angle;
  out.model = V.model;
  out.notInModel = V.model ? V.volumes.filter(v => !v.inModel).map(v => v.name) : [];
  out.rows = V.volumes.filter(v => v.inModel !== false).map(vol => ({ volume: vol.name, part: vol.component || null, sides: SIDES.map(sd => {
    const v = gate2d(x, vol, partPlate(x, vol, sd, angle, +b.range, null));
    if (v.refused) return { side: sd, refused: true, code: v.code };
    const c = { side: sd, nominal: v.nominal, effective: v.effective, result: v.result, margin: v.margin };
    if (v.gate) c.gate = v.gate;
    if (v.result === 'penetrate') { const h = partHp(V, vol, overOf(v), minOf(S), x.k.vehicleHealth); c.hp = h.refused ? { refused: true, code: h.code } : { part: h.part, loss: h.loss, state: h.state }; }
    return c;
  }) }));
  let n = 0, p = 0;
  for (const r of out.rows) for (const c of r.sides) if (!c.refused && c.nominal > 0) { n++; if (c.result === 'penetrate') p++; }
  out.share = n ? r2(p / n) : 0;
  return out;
}
const effects = (o, b) => shot(o, b, true);

// ---------- 3D: the unit's model ----------
const SIM = () => require('./sim');
const r1 = n => Math.round(n * 10) / 10;
const lastSeg = id => String(id || '').split('/').pop();
// the model's scene, kept 30 s per game + mod + model (a 3D map shoots thousands of rays at one load; an edit of the model shows
// after that time) [the Models page's own viewer loads its copy itself]
const SCENES = new Map();
function scene(o, model) {
  const k = [o.game, o.folder || '', model].join('|'), c = SCENES.get(k);
  if (c && Date.now() - c.at < 30000) return c.L;
  let L;
  try { L = require('../lib/model/sceneload').load(model, { game: o.game, mods: [], modDir: o.folder || undefined, exe: 'goh' }); } catch (e) { L = { error: e.message }; }
  try { if (L && L.files) L.files.close(); } catch (e) { /* closed */ }
  if (L && L.scene) { SCENES.set(k, { at: Date.now(), L }); while (SCENES.size > 4) SCENES.delete(SCENES.keys().next().value); }
  return L;
}
// volumes a bullet never meets: {disabled}, {able clear}, {able {bullet 0}} in the .mdl or the def (volume ables; GoH keeps them
// and adds blockcamera, GHKEY-31/33), and the volume whose first tag is "ram" (cleared at spawn as in AS64, sim.js rule 23) [I]
function ables(src, keys, A) {
  const out = new Map(), none = new Set();
  for (const key of keys) {
    let root = null;
    try { root = key && AD.parse(src, key); } catch (e) { root = null; }
    if (!root) continue;
    (function walk(blk) {
      for (const c of AD.kids(blk, none)) {
        if (lc(AD.nameOf(c)) === 'volume' && c.items[1] && c.items[1].k === 'STRING') {
          const v = out.get(lc(c.items[1].value)) || { bullet: true, why: null };
          for (const k of AD.kids(c, none)) {
            const n = lc(AD.nameOf(k));
            if (n === 'disabled') { v.bullet = false; v.why = 'disabled'; }
            if (n !== 'able') continue;
            if (k.items[1] && k.items[1].k === 'IDENT' && lc(k.items[1].text) === 'clear') { v.bullet = false; v.why = 'able clear'; }
            for (const a of AD.kids(k, none)) if (lc(AD.nameOf(a)) === 'bullet') {
              const x = a.items[1], on = !x || (x.k === 'IDENT' ? !/^(0|false|no|off)$/i.test(x.text) : Number(x.value) !== 0);
              v.bullet = on; v.why = on ? null : 'able bullet 0';
            }
          }
          out.set(lc(c.items[1].value), v);
        } else walk(c);
      }
    })(root);
  }
  if (A) for (const v of Object.values(A.volumes)) if (lc((v.tags || [v.name])[0]) === 'ram') out.set(lc(v.name), { bullet: false, why: 'ram' });
  return out;
}
function model3(o, b) {
  const x = setup(o, b);
  if (x.error || x.refused) return x;
  const model = x.V.model || (x.A && x.A.model);
  if (!model) return Object.assign(x, refuse('noModel'));
  const L = scene(o, model);
  if (!L || !L.scene) return Object.assign(x, refuse('noModel'), { detail: L && L.error });
  const ab = ables(x.src, [model, x.V.def], x.A), vols = [], shapes = [], notHit = [], all = [];
  for (const sv of L.scene.volumes || []) {
    if (!sv.shape) continue;
    all.push({ id: sv.id, name: sv.name || lastSeg(sv.id), shape: Object.assign({ id: sv.id }, sv.shape) });   // the blast's own able check
    const a = ab.get(lc(sv.name));
    if (a && !a.bullet) { notHit.push({ id: sv.id, name: sv.name, why: a.why }); continue; }
    vols.push({ id: sv.id, name: sv.name }); shapes.push(sv.shape);
  }
  if (!vols.length) return Object.assign(x, refuse('noModel'));
  let mats = null;
  try { mats = AD.materials({ game: o.game, mods: [], folder: o.folder || undefined, exe: 'goh', src: x.src }); } catch (e) { mats = null; }
  x.ctx = { scene: L.scene, vols, shapes, byId: new Map(vols.map((v, i) => [v.id, i])), notHit, all };
  x.mats = mats || {};
  x.model = model;
  return x;
}
// the model's volume ids (the 3D view's ids) by lower-case volume name, for the thickness table's colours (its rows are named by
// part, the view knows scene ids). model = the .mdl key (the table route reads it off the def: no shared source is opened here, so
// files the mod gets later are still seen by the simulator) -> { name: [ids] } | null (no model, the scene did not load)
function sceneIds(o, model) {
  if (!model) return null;
  const L = scene(o, model);
  if (!L || !L.scene) return null;
  const out = {};
  for (const sv of L.scene.volumes || []) { const k = lc(sv.name || lastSeg(sv.id)); if (sv.id) (out[k] = out[k] || []).push(sv.id); }
  return out;
}
// the .mdl of a def from its text: its {Extension "x.mdl"}, relative to the def's folder (null when none)
function modelOfDef(defKey, text) {
  const m = /\{\s*Extension\s+"([^"]+\.mdl)"/i.exec(String(text || ''));
  return m ? AD.resolveRel(defKey, m[1]) : null;
}
// what GoH knows of a model volume: the def's own record (thickness, HighHardness, CastSteel, Quality, component), else armordata's
function volOf(x, name) {
  const k = lc(name), own = x.V.all.get(k);
  const av = x.A && (x.A.volumes[name] || Object.values(x.A.volumes).find(v => lc(v.name) === k));
  const v = own ? Object.assign({}, own) : { name, sides: null, base: null, highHardness: false, castSteel: null, quality: null, component: null, tags: [] };
  if (!v.component && av && av.component) v.component = av.component;
  v.material = (av && av.material) || (x.A && x.A.defaultMaterial) || null;
  return v;
}
// the ray of a body: origin + dir, else from az / el (degrees, the vehicle frame) at aim or aimVolume or the unit's middle
function ray3(x, b) {
  let ray;
  if (b.origin && b.dir) ray = { origin: b.origin.slice(0, 3), dir: b.dir.slice(0, 3) };
  else {
    let aim = null;
    if (b.aim) aim = b.aim.slice(0, 3);
    else if (b.aimVolume) { aim = SIM().aimVolume(x.ctx, b.aimVolume); if (!aim) return { error: '"' + b.aimVolume + '" is not a volume of this model that shells hit.' }; }
    ray = SIM().rayFrom(x.ctx, +b.az || 0, +b.el || 0, aim);
  }
  if (typeof b.ground === 'number' && Number.isFinite(b.ground)) ray.ground = b.ground;
  return ray;
}
// one ray: GoH's walk (header "3D shot"): every face in order, the first with T > 0 decisive, the shell followed to where it ends
const MAIN = /^(body|hull|turret)/i;   // hull and turret volumes by the usual names, as sim.js (the whole-way cell code) [I]
// the faces on a ray (sim.js hitsOf + the face normal and whether the ray starts inside the volume)
function hits3(ctx, ray) {
  const trace = require('../lib/model/trace'), d = v3n(ray.dir), r = { origin: ray.origin, dir: d };
  const ev = trace.traceEvents(r, ctx.shapes);
  if (!ev.length) return [];
  const len = new Map();
  for (const h of trace.traceAll(r, ctx.shapes)) len.set(h.id, h.length);
  return ev.map(e => ({ volumeId: e.id, side: e.side < 0 ? 0 : e.side, angleDeg: trace.angleOfIncidence(d, e.normal), enter: !!e.enter, inside: !!e.inside,
    normal: e.normal, distanceM: e.t / 20, pathLengthUnits: len.get(e.id), point: e.point }));
}
// leg = { e, ricochets }: a bounced shell (ricochets > 0) starts with energy share e and skips the volumes it starts inside (FLAG_INSIDE
// ); its HEAT reach and last part start afresh (a new bullet)
function judge(x, rangeM, ray, o, leg) {
  const gh = SIM().groundHit(ray), rc = (leg && leg.ricochets) || 0;
  let hits = hits3(x.ctx, ray);
  if (rc > 0) hits = hits.filter(h => !h.inside);
  if (gh) hits = hits.filter(h => h.distanceM <= gh.distanceM);
  const S = x.S, P = pen.penetrationAt(S, rangeM), plates = [], reach = +S.cumulative || 0, mul = x.k ? x.k.mul : 1;
  const detTh = S.detonationThickness == null ? 1e38 : S.detonationThickness;
  let e = leg && leg.e != null ? leg.e : 1, lastPart = null, first = null, decisive = -1, refusal = null, v0 = null, vol0 = null, stop = -1, end = null;
  for (let i = 0; i < hits.length; i++) {
    const h = hits[i], name = lastSeg(h.volumeId), side = SIDES[h.side] || 'front', vol = volOf(x, name), area = areaFor(x.A, name);
    const pk = vol.component ? lc(vol.component) : null;
    const p = { volume: h.volumeId, side, enter: !!h.enter, angle: r1(h.angleDeg), distanceM: r1(h.distanceM), nominal: null, rule: null,
      part: vol.component || null, effective: null, penLeft: null, result: null };
    plates.push(p);
    if (pk && pk === lastPart) { p.result = 'skipped'; p.samePart = true; continue; }   // a part once in a row
    if (pk) lastPart = pk;
    if (first === null) first = h.distanceM;                                              // the game: reach from the first hit
    else if (reach > 0 && h.distanceM > first + reach + 1e-9) { p.result = 'beyond_jet'; stop = i; end = 'beyond_jet'; break; }
    const E = P * e;
    p.penLeft = r1(E);
    if (E < 1e-5) { p.result = 'missed'; continue; }                                      // spent shell: no hit, flies
    const m = matOf(x, o, name);
    const th = thickness(vol.sides, area, side, { pathLengthUnits: h.pathLengthUnits, steelEquivalent: m.rec ? m.rec.steelEquivalent : undefined }, mul);
    if (th.refused) { p.result = 'refused'; p.code = th.code; refusal = th; stop = i; end = 'refused'; if (decisive < 0) decisive = i; break; }
    p.nominal = r1(th.T); p.rule = th.rule;
    if (!p.enter && area && area.flags && area.flags.rayCastThickness) { p.result = 'penetrate'; p.exitRayCast = true; continue; }   //
    const v = plate(S, rangeM, vol, side, h.angleDeg, { sets: x.V.sets, T: th.T, flat: flatOf(area), P: E });
    if (v.refused) { p.result = 'refused'; p.code = v.code; refusal = v; stop = i; end = 'refused'; if (decisive < 0) decisive = i; break; }
    v.rule = th.rule; if (th.area) v.area = th.area;
    const eff = v.effective, passed = E >= eff, remaining = Math.min(E, eff);
    const g = gateOf(E, eff, area, S);
    p.effective = r1(eff);
    let flies = false;
    if (!g) {
      if (remaining >= detTh) p.fuze = true;                                              // fuze in the plate: stopped
      else {
        if (p.enter && passed && pk) {                                                     // the pierce call runs at E (:1106 <)
          const hp = partHp(x.V, vol, Math.max(0, E - eff), minOf(S), x.k ? x.k.vehicleHealth : 1);
          p.hp = hp.refused ? { refused: true, code: hp.code } : { part: hp.part, loss: hp.loss, state: hp.state };
        }
        if (p.enter) e = Math.min(1, Math.max(0, e - remaining / E));                    //
        flies = passed;
      }
    } else if (passed) p.gate = g;
    p.after = r1(P * e);
    if (th.T > 0 && decisive < 0) { decisive = i; v0 = v; vol0 = vol; }
    if (flies) { p.result = 'penetrate'; if (v === v0) v0.result = 'penetrate'; continue; }
    const bo = bounceOf(S, m.rec, m.name, h.angleDeg, rc);
    p.bounce = bo;
    p.result = bo.possible ? 'ricochet' : 'no_penetration';
    if (bo.possible) p.chance = bo.chance;
    if (v === v0) { v0.result = 'no_penetration'; if (p.gate) v0.gate = p.gate; if (p.fuze) v0.fuze = true; v0.bounce = bo; }
    stop = i; end = p.result; break;
  }
  if (decisive < 0 && stop >= 0 && end !== 'beyond_jet') decisive = stop;               // stopped by a 0 mm face (area gate)
  let verdict;
  if (!hits.length) verdict = gh ? 'ground' : 'no_hit';
  else if (decisive < 0) verdict = end === 'beyond_jet' ? 'beyond_jet' : 'no_armor';
  else verdict = plates[decisive].result;
  let outcome = end || 'passed_all';
  if (outcome === 'passed_all' && gh) outcome = 'ground';
  // whole way in (the map's o code): up to the last hull / turret entry face, else the last entry face
  let L = -1;
  for (let i = 0; i < hits.length; i++) if (hits[i].enter && MAIN.test(lastSeg(hits[i].volumeId))) L = i;
  if (L < 0) for (let i = 0; i < hits.length; i++) if (hits[i].enter) L = i;
  const wholeWay = verdict === 'no_armor' || verdict === 'no_hit' || verdict === 'ground' || L < 0 ? verdict : stop < 0 || stop > L ? 'penetrate' : plates[stop].result;
  return { hits, plates, decisive, verdict, outcome, wholeWay, stop, refusal, v0, vol0, P, e, gh, dir: v3n(ray.dir), ricochets: rc };
}
// where a leg's shell bursts (Detonate): a stopped face (no bounce roll won, a fuze) or the ground, 0.3 units before the hit
// (the game) [I ground]; null when it flies on or a rule stopped the walk
function burstOf(j) {
  const back = p => [0, 1, 2].map(i => p[i] - 0.3 * j.dir[i]);
  if (j.stop >= 0) { const p = j.plates[j.stop]; return p.result === 'no_penetration' || p.result === 'ricochet' ? { point: back(j.hits[j.stop].point), at: lastSeg(p.volume), fuze: !!p.fuze } : null; }
  if (j.gh && j.outcome === 'ground') return { point: back(j.gh.point), at: null, ground: true };
  return null;
}
// the blasts of the ammo (its blastwave damage effects, armordata S.damage) at a point: gohblast.js, by GoH's rules
function blastsAt(x, point, ground) {
  const waves = (x.S.damage || []).filter(d => d && d.type === 'blastwave' && +d.energy > 0);
  if (!waves.length) return [];
  const GB = require('./gohblast');
  const targets = GB.targetsOf(x);
  return waves.map(w => GB.run(x, targets, point, { energy: +w.energy, inner: +(w.area && w.area[0]) || 0, outer: +(w.area && w.area[1]) || 0 }, ground));
}
// the plates of a leg as rows (the faces after the first armoured one, or all of a bounce leg)
const rowsOf = plates => plates.map(p => ({ volume: lastSeg(p.volume), side: p.side, enter: p.enter, result: p.result, nominal: p.nominal,
  effective: p.effective, penLeft: p.penLeft, after: p.after == null ? null : p.after, chance: p.chance == null ? null : p.chance, gate: p.gate || null, fuze: !!p.fuze,
  samePart: !!p.samePart, hp: p.hp || null }));
// after a stop that may bounce: the bounce's flight, leg after leg (at most g_maximumRicochets 2), each with its burst's blast
function follow(x, rangeM, ray, o, j, legs, chance) {
  const st = j.stop >= 0 ? j.plates[j.stop] : null;
  if (!st || st.result !== 'ricochet' || legs.length >= 2) return;
  const h = j.hits[j.stop], m = matOf(x, o, lastSeg(h.volumeId)), b = bounceRay(x.S, m.rec, h, j.dir, j.e, j.P);
  const all = chance * (st.chance || 0), leg = { from: lastSeg(st.volume), side: st.side, chance: r4(st.chance || 0), chanceAll: r4(all), grazing: b.grazing };
  legs.push(leg);
  if (b.cone) { leg.cone = true; return; }
  Object.assign(leg, { deflection: b.deflection, speed: b.speed, damping: b.damping, energy: r4(b.e), clipped: b.clipped || undefined,
    origin: b.origin.map(r1), dir: b.dir.map(n => Math.round(n * 1e6) / 1e6) });
  const j2 = judge(x, rangeM, { origin: b.origin, dir: b.dir, ground: ray.ground }, o, { e: b.e, ricochets: j.ricochets + 1 });
  Object.assign(leg, { plates: rowsOf(j2.plates), outcome: j2.outcome, stoppedAt: j2.stop >= 0 ? j2.stop : null, left: r1(j2.P * j2.e) });
  if (j2.refusal) leg.refused = { code: j2.refusal.code, reason: j2.refusal.reason };
  if (j2.gh && j2.outcome === 'ground') leg.groundPoint = j2.gh.point.map(r1);
  const bu = burstOf(j2);
  if (bu) { leg.burst = { point: bu.point.map(r1), at: bu.at, ground: !!bu.ground }; leg.blast = blastsAt(x, bu.point, ray.ground); }
  follow(x, rangeM, ray, o, j2, legs, all);
}
function shot3(o, b) {
  const x = model3(o, b);
  if (x.error) return x;
  if (x.refused) return Object.assign({ game: 'goh', note: 'T', leftOut: LEFT_OUT_3D, mode: '3d', refused: true, code: x.code, reason: x.reason, detail: x.detail || undefined });
  const ray = ray3(x, b);
  if (ray.error) return ray;
  const rangeM = +b.range, j = judge(x, rangeM, ray, o), out = head(x.V, x.S, b, x.k);
  const dv = j.decisive >= 0 ? j.plates[j.decisive] : null;
  Object.assign(out, { mode: '3d', leftOut: LEFT_OUT_3D, model: x.model, ray: { origin: ray.origin.map(r1), dir: ray.dir.map(n => Math.round(n * 1e6) / 1e6) },
    plates: j.plates, decisive: j.decisive, verdict: j.verdict, outcome: j.outcome, wholeWay: j.wholeWay, stoppedAt: j.stop >= 0 ? j.stop : null,
    chance: dv && dv.result === 'ricochet' ? dv.chance : null, left: r1(j.P * j.e), cumulative: +x.S.cumulative || 0,
    shell: { weapon: x.S.weapon, ammo: x.S.ammo, penetration: r1(j.P), calibre: x.S.calibre },
    notHit: x.ctx.notHit.map(v => v.name), notes: [] });
  if (j.gh && (j.verdict === 'ground' || j.outcome === 'ground')) out.groundPoint = j.gh.point.map(r1);
  if (j.verdict === 'no_hit') out.notes.push('the ray misses every volume shells hit');
  if (j.verdict === 'no_armor') out.notes.push('only 0 mm faces on the ray: it passes, nothing armoured');
  if (j.outcome === 'beyond_jet') out.notes.push('the HEAT jet reaches ' + out.cumulative + ' m past the first hit; the faces beyond it are not hit');
  if (j.refusal) {
    const rp = j.plates[j.stop];
    if (j.stop <= j.decisive) Object.assign(out, { refused: true, code: j.refusal.code, reason: j.refusal.reason, volume: lastSeg(rp.volume), side: rp.side });
    else out.laterRefused = { code: j.refusal.code, reason: j.refusal.reason, volume: lastSeg(rp.volume), side: rp.side };
  }
  if (j.v0) {
    out.plate = j.v0;
    if (j.v0.result !== 'penetrate') out.ricochet = j.v0.bounce || bounceOf(x.S, null, null, j.v0.angle);
    const h = partHp(x.V, j.vol0, overOf(j.v0), minOf(x.S), x.k.vehicleHealth);
    out.effects = h.refused ? { refused: true, code: h.code, reason: h.reason } : h;
  }
  // the faces after the first armoured one, each judged with the shell left after it
  out.later = j.decisive >= 0 ? rowsOf(j.plates.slice(j.decisive + 1)) : [];
  // where the shell bursts and what its blast does (on a possible bounce: when the bounce roll fails), then the bounce's flight
  const bu = burstOf(j);
  if (bu) {
    out.burst = { point: bu.point.map(r1), at: bu.at, ground: !!bu.ground, fuze: bu.fuze || undefined, ifNoBounce: out.outcome === 'ricochet' || undefined };
    out.blast = blastsAt(x, bu.point, ray.ground);
  }
  const legs = [];
  follow(x, rangeM, ray, o, j, legs, 1);
  if (legs.length) out.bounces = legs;
  return out;
}
// a blast at a point of the unit's model (b = shot body + point [x, y, z] in model units, inner / outer m, energy), or with no
// energy the ammo's own blastwaves -> { blast: [run results] } (gohblast.js)
function blast3(o, b) {
  const x = model3(o, b);
  if (x.error) return x;
  if (x.refused) return { game: 'goh', note: 'T', mode: '3d', refused: true, code: x.code, reason: x.reason };
  const point = (b.point || [0, 0, 0]).slice(0, 3).map(Number), out = head(x.V, x.S, b, x.k);
  out.mode = '3d'; out.leftOut = LEFT_OUT_3D; out.point = point;
  if (+b.energy > 0) { const GB = require('./gohblast'); out.blast = [GB.run(x, GB.targetsOf(x), point, { energy: +b.energy, inner: +b.inner || 0, outer: +b.outer || 0 }, b.ground)]; }
  else out.blast = blastsAt(x, point, b.ground);
  return out;
}
// the map: one ray per grid cell from the view, as sim.js map (same grid and fields), judged on the first armoured plate
function map3(o, b) {
  const x = model3(o, b);
  if (x.error) return x;
  if (x.refused) return { game: 'goh', note: 'T', leftOut: LEFT_OUT_3D, mode: '3d', refused: true, code: x.code, reason: x.reason };
  const view = SIM().parseView(b.view || 'front');
  if (!view) return { error: 'The view must be front, rear, left, right, top or az,el in degrees.' };
  const g = /^(\d+)x(\d+)$/.exec(String(b.grid || '64x48')), w = g ? +g[1] : 64, hh = g ? +g[2] : 48;
  const t0 = Date.now(), ctx = x.ctx, B = SIM().basis(view.az, view.el, ctx);
  const bb = ctx.scene.volumeBounds || ctx.scene.bounds, v3 = p => (Array.isArray(p) ? p : [p.x, p.y, p.z]);
  const bmin = bb ? v3(bb.min) : [-20, -20, -20], bmax = bb ? v3(bb.max) : [20, 20, 20];
  const c = [0, 1, 2].map(i => (bmin[i] + bmax[i]) / 2), dot = (a, q) => a[0] * q[0] + a[1] * q[1] + a[2] * q[2];
  const add = (a, q, k) => [a[0] + q[0] * k, a[1] + q[1] * k, a[2] + q[2] * k];
  let rmin = 1e30, rmax = -1e30, umin = 1e30, umax = -1e30;
  for (let i = 0; i < 8; i++) {
    const p = [i & 1 ? bmax[0] : bmin[0], i & 2 ? bmax[1] : bmin[1], i & 4 ? bmax[2] : bmin[2]], q = add(p, c, -1);
    rmin = Math.min(rmin, dot(q, B.right)); rmax = Math.max(rmax, dot(q, B.right)); umin = Math.min(umin, dot(q, B.up)); umax = Math.max(umax, dot(q, B.up));
  }
  const cell = Math.max((rmax - rmin) / w, (umax - umin) / hh) * 1.04 || 1, rc = (rmin + rmax) / 2, uc = (umin + umax) / 2;
  const origin = add(add(c, B.right, rc - cell * w / 2), B.up, uc + cell * hh / 2);
  const back = Math.hypot(bmax[0] - bmin[0], bmax[1] - bmin[1], bmax[2] - bmin[2]) + 200, cells = new Array(w * hh).fill(null);
  const CODE = { penetrate: 'P', ricochet: 'R', no_penetration: 'N', beyond_jet: 'J', no_armor: 'O', ground: 'G' };   // sim.js CODES
  let hitN = 0, penN = 0, firstN = 0;
  for (let y = 0; y < hh; y++) for (let xx = 0; xx < w; xx++) {
    const p = add(add(origin, B.right, (xx + 0.5) * cell), B.up, -(y + 0.5) * cell);
    const j = judge(x, +b.range, { origin: add(p, B.t, back), dir: B.d }, o);
    if (j.verdict === 'no_hit') continue;
    const d = j.decisive >= 0 ? j.decisive : j.plates.length - 1, pl = j.plates[d], hit = j.hits[d];
    const r = CODE[j.verdict] || '?', oc = CODE[j.wholeWay] || '?', last = j.stop >= 0 ? j.hits[j.stop] : null;
    cells[y * w + xx] = { v: ctx.byId.has(hit.volumeId) ? ctx.byId.get(hit.volumeId) : -1, s: SIDES.indexOf(pl.side), n: pl.nominal == null ? 0 : pl.nominal, e: pl.effective == null ? 0 : pl.effective, r, o: oc,
      last: last && ctx.byId.has(last.volumeId) ? ctx.byId.get(last.volumeId) : -1 };
    if ('PRN'.includes(r)) { hitN++; if (r === 'P') firstN++; if (oc === 'P') penN++; }
  }
  const out = head(x.V, x.S, b, x.k);
  return Object.assign(out, { mode: '3d', leftOut: LEFT_OUT_3D, view: view.name, az: view.az, el: view.el,
    grid: { w, h: hh, origin: origin.map(r1), right: B.right.map(n => Math.round(n * 1e6) / 1e6), up: B.up.map(n => Math.round(n * 1e6) / 1e6), cell: Math.round(cell * 1e4) / 1e4 },
    cells, volumes: ctx.vols.map(v => v.id), share: hitN ? penN / hitN : 0, shareFirst: hitN ? firstN / hitN : 0, hitCells: hitN, penetratedCells: penN, firstPlateCells: firstN, notHit: ctx.notHit.map(v => v.id), ms: Date.now() - t0 });
}

module.exports = { sceneIds, modelOfDef, gateOf, bounceOf, bounceRay, open, shell, shells, vehicle, plate, partHp, partRec, shot, map, effects, shot3, map3, blast3, thickness, ables, gkind, look, tget,
  overmatch, flaw, cast, hardness, setTables, difficulties, rulesOf, areaFor, volOf, matOf, lastSeg, eMin, eMax, eClamp, LEFT_OUT, LEFT_OUT_3D, REASONS, SIDES };

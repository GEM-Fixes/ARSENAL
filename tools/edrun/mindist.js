// edrun mindist (MINDIST-1): the smallest foe distance at which a shooter's gun can point at the foe. no game, reads only.
//   A gun hangs on a bone chain. The pitch bone (a revolute bone with {limits lo hi} whose axis is horizontal) turns the aim bone (the place's
//   foresight, else the weapon's: ) about the pivot. At the deepest depression the aim bone's ray leaves the
//   foresight at height Fz, and meets the foe's aim height after (Fz - hAim)/tan(D) more. So with the shooter facing +x, centre to centre:
//     min = max( reach + foe half length + margin ,  Fx + (Fz - hAim) / tan D )          [I]
//   reach = foresight x at zero pitch; Fx, Fz = foresight at the deepest pitch; D = deepest depression in deg.
//   units: engine units = 1/20 m, the same as mdl positions and mission coords (g_unitsPerMeter = 20,.
//   no pitch limits on the chain (fixed gun, or pitch not limited) -> {unknown}, never a refusal.
//   left to a game [T]: the sign of a limit (a positive angle turns right-hand about the bone's own z, in the bone's frame; pz6bh then raises at +15, depresses at -7, as the brief says), the foe aim height
//   (turret bone height, else half the highest bone), macros inside {place} (not expanded in the tree, so a foresight set by macro is missed).
// Author: Imperator_Aug (ARSENAL, ia-938b7cc0)
const MARGIN = 10;        // units past reach + foe half length [I]
const FOE_AIM_INF = 14;   // units: aim height on an infantry foe, no model read [I]
const DEG = Math.PI / 180;

const lc = s => String(s || '').toLowerCase();
const num = t => t && (t.k === 'INTEGER' || t.k === 'FLOAT') ? t.value : null;

// ---- mdl -> bones. ix = entityindex module (kidsOf, nameOf, argsOf, str0)
const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
// row-vector convention (world = local x parent): R = R_local . R_parent, t = t_local . R_parent + t_parent; R is 9 numbers, rows = the bone's x y z axes
const mulR = (a, b) => { const o = []; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o.push(a[3 * i] * b[j] + a[3 * i + 1] * b[3 + j] + a[3 * i + 2] * b[6 + j]); return o; };
const mulV = (v, R) => [v[0] * R[0] + v[1] * R[3] + v[2] * R[6], v[0] * R[1] + v[1] * R[4] + v[2] * R[7], v[0] * R[2] + v[1] * R[5] + v[2] * R[8]];

function parseBones(ix, tree) {
  const bones = new Map(), order = [];
  const walk = (b, parent) => {
    for (const c of ix.kids(b)) {
      if (c.disabled) continue;
      const n = lc(ix.nameOf(c));
      if (n !== 'bone') { if (!parent) walk(c, null); continue; }
      const a = ix.argsOf(c), name = (a.find(t => t.k === 'STRING') || {}).value;
      const type = lc((a.find(t => t.k === 'IDENT') || {}).text) || 'fixed';
      let R = I3, t = [0, 0, 0], lim = null, view = false;
      for (const k of ix.kids(c)) {
        const kn = lc(ix.nameOf(k)), v = ix.argsOf(k).map(num).filter(x => x !== null);
        if (kn === 'position' && v.length >= 3) t = v.slice(0, 3);
        else if (kn === 'orientation' && v.length >= 9) R = v.slice(0, 9);
        else if (kn === 'matrix34' && v.length >= 12) { R = v.slice(0, 9); t = v.slice(9, 12); }
        else if (kn === 'limits' && v.length >= 2) lim = [v[0], v[1]];
        else if (kn === 'volumeview' || kn === 'lodview') view = true;
      }
      const W = parent ? { R: mulR(R, parent.W.R), t: (p => [p[0] + parent.W.t[0], p[1] + parent.W.t[1], p[2] + parent.W.t[2]])(mulV(t, parent.W.R)) } : { R, t };
      const bone = { name, key: lc(name), type, parent, lim, W, view, kids: [] };
      if (parent) parent.kids.push(bone);
      order.push(bone);
      if (!bones.has(bone.key)) bones.set(bone.key, bone);
      walk(c, bone);
    }
  };
  for (const top of ix.kids(tree)) { if (lc(ix.nameOf(top)) === 'skeleton') walk(top, null); else walk(top, null); }
  return { bones, order };
}
// VOL-FX: a def {bone "x" {limits lo hi}} block overrides the mdl bone's limits (sdkfz7_2: def gun_rot -10 45, mdl -5 42; the mdl-only read gave D 1 deg and a 919 min) [I]
function defLimitsOf(ix, tree) {
  const out = new Map();
  (function walk(b) { for (const c of ix.kids(b)) { if (c.disabled) continue; if (lc(ix.nameOf(c)) === 'bone') { const nm = (ix.argsOf(c).find(t => t.k === 'STRING') || {}).value; const l = ix.kids(c).find(k => lc(ix.nameOf(k)) === 'limits'); const v = l ? ix.argsOf(l).map(num).filter(x => x !== null) : []; if (nm && v.length >= 2 && !out.has(lc(nm))) out.set(lc(nm), [v[0], v[1]]); } walk(c); } })(tree);
  return out;
}
// FindBone: first match in a pre-order walk below (and including) `from`
function findBone(m, from, key) {
  if (!from) return m.bones.get(lc(key)) || null;
  const k = lc(key), st = [from];
  while (st.length) { const b = st.pop(); if (b.key === k) return b; for (let i = b.kids.length - 1; i >= 0; i--) st.push(b.kids[i]); }
  return null;
}

// ---- def -> weapon, place (link bone, foresight)
function placeOf(ix, tree, weapon) {
  let found = null;
  (function walk(b, inW) {
    for (const c of ix.kids(b)) {
      if (found) return;
      if (c.disabled) continue;
      const n = lc(ix.nameOf(c));
      if (n === 'place' && inW) {
        const ws = ix.kids(c).filter(k => lc(ix.nameOf(k)) === 'weapon');
        if (ws.some(w => lc(ix.str0(w)) === lc(weapon))) {
          const g = nm => { const k = ix.kids(c).find(x => lc(ix.nameOf(x)) === nm && !x.disabled); return k ? ix.str0(k) : null; };
          found = { place: ix.str0(c), link: g('linkbone'), foresight: g('foresight') };
          return;
        }
      } else walk(c, inW || n === 'weaponry');
    }
  })(tree, false);
  return found;
}
function stuffForesight(ix, tree) {
  let f = null;
  (function walk(b, d) { for (const c of ix.kids(b)) { if (c.disabled) continue; if (lc(ix.nameOf(c)) === 'foresight' && ix.str0(c)) f = ix.str0(c); else if (d < 4) walk(c, d + 1); } })(tree, 0);
  return f;
}

// ---- geometry
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
// v (a world vector) turned by th rad about the bone's own z axis, right-hand in the bone's frame. done in the frame (not about the world axis)
// because a model root that mirrors Y (basis {Orientation 1 0 0 0 -1 0 0 0 1}) flips the sense in the world [I]
function rot(v, R, th) {
  const r0 = R.slice(0, 3), r1 = R.slice(3, 6), r2 = R.slice(6, 9), l = [dot(v, r0), dot(v, r1), dot(v, r2)];
  const c = Math.cos(th), s = Math.sin(th), x = l[0] * c - l[1] * s, y = l[0] * s + l[1] * c;
  return [0, 1, 2].map(i => x * r0[i] + y * r1[i] + l[2] * r2[i]);
}
const axisOf = b => { const z = [b.W.R[6], b.W.R[7], b.W.R[8]], l = Math.hypot(...z) || 1; return z.map(x => x / l); };

// the aim chain of a shooter model -> {pitch, yaw, aim, link} | {unknown}
function chainOf(m, placeInfo, stuffFore, defLim) {
  const link = placeInfo && placeInfo.link ? findBone(m, null, placeInfo.link) : null;
  const fname = (placeInfo && placeInfo.foresight) || stuffFore || 'foresight1';
  let aim = link ? findBone(m, link, fname) : null;
  if (!aim) aim = findBone(m, null, fname);
  if (!aim) return { unknown: `aim bone ${fname} not in the model` };
  let pitch = null, yaw = null;
  for (let b = aim; b; b = b.parent) {
    if (b.type !== 'revolute') continue;
    const ax = axisOf(b);
    if (Math.abs(ax[2]) < 0.5) { const dl = defLim && defLim.get(b.key); if (!pitch && (dl || b.lim)) pitch = dl ? Object.assign(Object.create(b), { lim: dl, mdlLim: b.lim, limFrom: 'def' }) : b; }   // pitch needs limits; a yaw turret usually has none (all-round)
    else if (!yaw) yaw = b;
  }
  return { aim, link, pitch, yaw, fname };
}

// foe: {half, aim} from its model bones (null -> infantry or unknown: aim FOE_AIM_INF, half 0)
function foeOf(fm) {
  if (!fm) return { half: 0, aim: FOE_AIM_INF, via: 'infantry or model unread' };
  let half = 0, top = 0, turret = null;
  for (const b of fm.order) {
    if (b.view && !/^(wheel|track|fx)/.test(b.key)) half = Math.max(half, Math.abs(b.W.t[0]));
    if (/^(wheel|track|fx|emit|seat|cover|visor|enum)/.test(b.key)) { if (/^(wheel|track)/.test(b.key)) half = Math.max(half, Math.abs(b.W.t[0])); continue; }
    top = Math.max(top, b.W.t[2]);
    if (b.key === 'turret' && !turret) turret = b;
  }
  const aim = turret ? turret.W.t[2] : top / 2;
  return { half: +half.toFixed(1), aim: +aim.toFixed(1), via: turret ? 'turret bone height' : 'half the highest bone' };
}

// shooter model m, place info, foe -> {min, reach, ground, D, ...} | {unknown}
function minDist(m, placeInfo, stuffFore, foe, margin = MARGIN, defLim = null) {
  const ch = chainOf(m, placeInfo, stuffFore, defLim);
  if (ch.unknown) return ch;
  const { aim, pitch, yaw } = ch;
  const F0 = aim.W.t, d0 = [aim.W.R[0], aim.W.R[1], aim.W.R[2]];
  // the gun is turned onto the foe, dead ahead of the hull: by the turret about its yaw axis when it traverses all round, else by the hull about the model origin.
  // a rear-facing gun at zero pose (halftrack flak) then reaches forward by its offset along its heading, not by its x [I]
  const yawFree = yaw && (!yaw.lim || yaw.lim[1] - yaw.lim[0] >= 350);
  const yawAt = yaw && yawFree ? yaw.W.t : [0, 0, 0];
  const heading = d => { const l = Math.hypot(d[0], d[1]) || 1; return [d[0] / l, d[1] / l]; };
  const fwd = (F, d) => { const h = heading(d); return yawAt[0] + (F[0] - yawAt[0]) * h[0] + (F[1] - yawAt[1]) * h[1]; };
  const out = { aimBone: aim.name, link: ch.link ? ch.link.name : null, reach: +fwd(F0, d0).toFixed(1), foe };
  if (yaw && yaw.lim && !(yaw.lim[0] <= 0 && yaw.lim[1] >= 0)) out.warn = `traverse ${yaw.lim[0]}..${yaw.lim[1]} excludes straight ahead: the hull must turn`;
  if (!pitch) return { unknown: `no pitch bone with {limits} above ${aim.name} (fixed gun or free pitch)`, ...out };
  const c = pitch.W.t, ax = pitch.W.R;
  // deepest depression: the limit that turns the aim bone's x axis lowest
  const at = th => { const r = rot([F0[0] - c[0], F0[1] - c[1], F0[2] - c[2]], ax, th * DEG), d = rot(d0, ax, th * DEG); const F = [c[0] + r[0], c[1] + r[1], c[2] + r[2]]; return { F, fx: fwd(F, d), elev: Math.asin(Math.max(-1, Math.min(1, d[2]))) / DEG }; };
  const lo = at(pitch.lim[0]), hi = at(pitch.lim[1]), deep = lo.elev <= hi.elev ? lo : hi;
  const D = -deep.elev;
  Object.assign(out, { pitchBone: pitch.name, limits: pitch.lim, limFrom: pitch.limFrom || 'mdl', pivot: [+c[0].toFixed(1), +c[2].toFixed(1)], D: +D.toFixed(1), fore: deep.F.map(x => +x.toFixed(1)), maxElev: +Math.max(lo.elev, hi.elev).toFixed(1) });
  const base = out.reach + foe.half + margin;
  if (D < 0.5) {   // cannot look down
    if (deep.F[2] <= foe.aim) return { ...out, min: +base.toFixed(1), ground: null, note: 'cannot depress, but the muzzle is already below the foe aim height' };
    return { unknown: `cannot depress (deepest ${out.D} deg): the muzzle stays above the foe; a lob or a ballistic arc sets the range, not read here`, ...out };
  }
  const ground = deep.fx + Math.max(0, deep.F[2] - foe.aim) / Math.tan(D * DEG);
  out.ground = +ground.toFixed(1);
  out.pivotFormula = +(c[0] + Math.max(0, c[2] - foe.aim) / Math.tan(D * DEG)).toFixed(1);   // the brief's first formula, for comparison
  out.min = +Math.max(base, ground).toFixed(1);
  out.by = base >= ground ? 'reach' : 'depression';
  return out;
}

// ---- game parity (2026-11-14): the game of an --exe value, shared by edrun, pack and mindist.
//   an exe file name or path: as64*.exe -> as64, mowas_2*.exe -> mowas2 (MoW:AS2), call_to_arms*.exe -> goh; or a tools/lib/games.js word
//   (as64, mowas_2, mowas2, goh). nothing given -> as64 (as before). any other *.exe name (a renamed build) -> as64, as before the batch. unknown word -> null
function gameOfExe(exe) {
  if (exe === undefined || exe === null || exe === true || exe === '') return 'as64';
  const b = String(exe).replace(/\\/g, '/').split('/').pop().toLowerCase();
  if (/^call_to_arms/.test(b)) return 'goh';
  if (/^mowas_2/.test(b)) return 'mowas2';
  if (/^as64/.test(b)) return 'as64';
  return require('../lib/games').idOf(b) || (/\.exe$/.test(b) ? 'as64' : null);
}
// the vfs exe for the entity index: undefined for as64 (the index and its cache exactly as before), else games.js exe (mowas_2)
const vfsExeOf = game => (game && game !== 'as64' ? require('../lib/games').exeOf(game) || undefined : undefined);
// GoH: edrun cannot run there, so its helpers (pack, mindist) refuse with the same row
const GOH_WHY = ['the GoH editor (call_to_arms_ed.exe -game) never starts the mission, it stops at page_scene_editor, so no edrun pair can run', 'modweb/testing/in-play-nopipe.md:9'];

// ---- index-backed reader. build once per game+mods(+exe) and share with preflight's range reader
const builtCache = new Map();
function getBuilt(game, mods, exe) {
  const k = game + '|' + (mods || []).join(',') + (exe ? '|' + exe : '');
  if (!builtCache.has(k)) builtCache.set(k, require('../entityindex/index.js').build(exe ? { gameDir: game, mods, exe } : { gameDir: game, mods }));
  return builtCache.get(k);
}
// -> minOf(shooterDef, foeDef) = {min, ...} | {unknown}. opt.exe: the vfs exe of the index (none = as before)
function makeMinReader(game, mods, opt = {}) {
  const ix = require('../entityindex/index.js');
  const get = opt.getBuilt || (() => getBuilt(game, mods, opt.exe));
  const mdl = {}, defs = {};
  const model = (built, def) => {
    const r = built.idx.byName(def);
    if (!r || !r.length) return null;
    // the index keeps the first {Extension}, which an included crew.ext can take: use the last .mdl one [I: a later Extension wins]
    const mdls = r[0].refs.filter(f => f[0] === 'model' && /\.mdl$/i.test(f[1]));
    const key = mdls.length && ix.resolveModel(k => built.keys.has(k), r[0].key, mdls[mdls.length - 1][1]);
    if (!key) return null;
    if (!(key in mdl)) { let p = null; try { p = ix.parseKey(built.src, key); } catch (e) { p = null; } mdl[key] = p && p.tree ? parseBones(ix, p.tree) : null; }
    return mdl[key];
  };
  // o.staticFoe (EDRUN-3): the foe is a building or prop: its model height is not the aim height, the wall is (foeOf(null): infantry height, half 0)
  return (shooter, foeDef, margin, o = {}) => {
    const built = get();
    const r = built.idx.byName(shooter);
    if (!r || !r.length) return { unknown: 'def not in the index' };
    const w = (r[0].refs || []).find(f => f[0] === 'weapon');
    if (!w) return { unknown: 'def lists no weapon' };
    const m = model(built, shooter);
    if (!m) return { unknown: 'model not found or unreadable' };
    let tree = null;
    if (!(r[0].key in defs)) { try { const p = ix.parseKey(built.src, r[0].key); defs[r[0].key] = p && p.tree; } catch (e) { defs[r[0].key] = null; } }
    tree = defs[r[0].key];
    const pl = tree ? placeOf(ix, tree, w[1]) : null;
    let sf = null;
    const st = Object.values(built.idx.stuff).find(s => /^resource\/set\/stuff\/gun\//.test(s.key) && lc(s.name) === lc(w[1]));
    if (st) { try { const p = ix.parseKey(built.src, st.key); sf = p && p.tree && stuffForesight(ix, p.tree); } catch (e) { sf = null; } }
    const fm = foeDef && !o.staticFoe && !String(foeDef).includes('/') ? model(built, foeDef) : null;
    // FIX-EDRUN item 2: a static foe is aimed at half its wall height on the near face (o.foeAim), not at an infantry man's height
    const foe = o.staticFoe ? { half: 0, aim: o.foeAim !== undefined ? o.foeAim : FOE_AIM_INF, via: o.foeAim !== undefined ? 'static near face, half wall height' : 'static, infantry aim' } : foeOf(fm);
    const out = minDist(m, pl, sf, foe, margin, tree ? defLimitsOf(ix, tree) : null);
    out.weapon = w[1]; out.place = pl ? pl.place : null; out.placeFound = !!pl;
    return out;
  };
}

// ---- cli: node tools/edrun/mindist.js --game G [--exe as64|mowas_2|mowas2|<exe file>] [--mods as64+,x] [--foe t34_0] [--margin N] defName... | --pairs pairs.json
//   prints the smallest usable distance (engine units, and metres) per shooter, or per pair of a pairs file with the pair's dist beside it
//   --exe: the game whose data is read (game parity): none or as64 = as before (mods default as64+); mowas_2 / mowas2 / mowas_2_ed.exe = MoW:AS2's
//   vfs view (no as64/core), mods default none; goh refused (exit 2, edrun cannot run on GoH:
function cli(argv, o = {}) {
  const opt = (n, d) => { const i = argv.indexOf(n); return i < 0 ? d : argv[i + 1]; };
  const GAME = gameOfExe(opt('--exe'));
  if (!GAME) { console.error('mindist: unknown --exe ' + opt('--exe') + ' (as64, mowas_2, mowas2, goh or an exe file name)'); return 2; }
  if (GAME === 'goh') { require('../lib/games').refuse('mindist', 'goh', ...GOH_WHY, o.refuse); return 2; }
  const game = opt('--game'), mods = (opt('--mods', GAME === 'as64' ? 'as64+' : '') || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!game) { console.error('usage: mindist.js --game G [--exe as64|mowas_2] [--mods a,b] [--foe def] [--margin N] shooterDef... | --pairs file.json'); return 2; }
  const exe = vfsExeOf(GAME), margin = +opt('--margin', MARGIN), read = o.read || makeMinReader(game, mods, exe ? { exe } : {});
  const rows = [];
  const pf = opt('--pairs');
  if (pf) for (const p of JSON.parse(require('fs').readFileSync(pf, 'utf8'))) rows.push({ name: p.name, shooter: p.shooter, foe: p.foe, dist: p.dist, infantry: p.class === 'infantry' });
  else for (const d of argv.filter((a, i) => !a.startsWith('--') && !['--game', '--mods', '--foe', '--margin', '--pairs', '--exe'].includes(argv[i - 1]))) rows.push({ name: d, shooter: d, foe: opt('--foe', 't34_0') });
  for (const r of rows) {
    const m = r.infantry ? { unknown: 'infantry weapon not read' } : read(r.shooter, r.foe, margin);
    const tail = m.unknown ? `unknown: ${m.unknown}` : `min ${m.min} (${(m.min / 20).toFixed(1)} m) by ${m.by} | reach ${m.reach} ground ${m.ground} D ${m.D} deg limits ${m.limits} (${m.limFrom}) aim ${m.aimBone} pitch ${m.pitchBone} | foe half ${m.foe.half} aim ${m.foe.aim}`;
    console.log(`${r.name}: ${r.shooter} on ${r.foe || '-'}${r.dist !== undefined ? ' dist ' + r.dist + (m.min && r.dist < m.min ? ' TOOCLOSE' : '') : ''}: ${tail}`);
  }
  return 0;
}
if (require.main === module) process.exit(cli(process.argv.slice(2)));

module.exports = { MARGIN, cli, gameOfExe, vfsExeOf, GOH_WHY, parseBones, defLimitsOf, findBone, placeOf, stuffForesight, chainOf, foeOf, minDist, makeMinReader, getBuilt, rot };

// Models page, Armor part section 6): thickness table, penetration map, one shot, edit one number in place.
// Routes (POST, body JSON):
//   /api/x/models/armor/table  { mod, target }                                   -> armorsim table --json  (+ raw, cached)
//   /api/x/models/armor/shot   { mod, target, weapon, ammo, range, az, el, aim, aimVolume, origin, dir, ground } -> armorsim shot --json
//       ground (optional, -10000..10000) = the ground height in model units (--ground, armorsim RULES 49): a downward shot ends there;
//       verdict/outcome 'ground' + groundPoint [x,y,z]
//   /api/x/models/armor/effects { shot fields (ground too), samples, seed, until, explosive, doc?, carry?, reset?, anm?, frame? } -> armorsim effects --json; with doc: in process on the open document
//   /api/x/models/armor/map    { mod, target, weapon, ammo, range, view, grid }  -> armorsim map --json  (+ raw, cached)
//   /api/x/models/armor/edit   { mod, target, volume, side, mm, shared, dry }    -> armorsim edit --out <mod> --folder <mod> --json
//   /api/x/models/armor/guns   { mod, q }       -> { guns: [{ name, group }], total }  in process, tools/armorsim/armordata.js source
//   /api/x/models/armor/shells { mod, weapon }  -> { weapon, shells: [{ ammo, kind, calibre, penetration [[m, mm]], aimRange }] }
//   /api/x/models/armor/nothit { mod, target, doc?, anm?, frame? } -> { notHit: [{ id, name, why }] } volumes shells never hit (shot picks)
// Every value is its own argv entry (no shell). Checks run before the tool: numbers finite and in range, names without a leading
// "-" or control characters, side from the fixed list; edit needs the mod folder. table and map results are kept in memory by their
// inputs + the mtime of the unit's def copied into the mod (learned from table/edit output); an edit drops that unit's entries.
// Real JSON (2026-11-10, pz4h): table = { unit, key, model, material, rows[{ name, id|null, kind, bone, area, material,
// sides[{ side, mm, rule 'own'|'area X'|'none', at 'file:line'|null, macro }], flags[] }], summary{hull,turret}, join, problems }.
// Game (../game.js): under MoW:AS2 every armorsim run gets --exe mowas_2 after --game (so the table and map cache keys differ too) and
// the in-process reads (guns, shells, effects and nothit on the open document) pass exe 'mowas_2' (no as64/core); under AS64 the
// argument lists and calls stay exactly as before. Under Gates of Hell the AS2 simulator never runs (GoH penetration rules differ,
// GHDMG-37/40/42/13): table, edit, guns, shells, shot, map and effects go to sub/armorgoh.js (GoH's own rules, tools/armorsim/goh.js,
// note 'T': read from notes and data, not tested in game; GoH shot/effects take volume + side + angle, map takes angle); nothit keeps
// the plain line of ../game.js.
// Author: Imperator_Aug (ARSENAL, ia-e5a4d0e3)
'use strict';
const fs = require('fs'), path = require('path');
const ENTRY = 'armorsim/armorsim.js';
const SIDES = ['front', 'top', 'left', 'right', 'rear', 'bottom', 'all'];
const VIEWS = ['front', 'rear', 'left', 'right', 'top'];
// weapon folders under resource/set/stuff (the rest are ammo, grenades, bodies, kit)
const GUN_DIRS = ['gun', 'mgun', 'bazooka', 'reactive', 'rifle', 'rifle/ptr', 'rifle/sniper', 'pistol', 'smg', 'flame'];

const bad = msg => { throw Object.assign(new Error(msg), { status: 400 }); };
const U = () => require('../../units/server').lib;
const AD = () => require('../../../../armorsim/armordata');
const G = require('../game');
const exeX = (ctx, b) => { const e = G.exeOpt(ctx, b); return e ? { exe: e } : {}; };   // nothing added under AS64
const gameOpt = (ctx, b) => G.gameDir(ctx, b);   // the open game's own install (GoH: the GoH folder)
function modMay(ctx, b) { const m = U().modOf(b, gameOpt(ctx, b), false); return m ? path.resolve(m) : null; }
function modNeed(ctx, b) { return G.modGuard(ctx, b, path.resolve(U().modOf(b, gameOpt(ctx, b), true))); }
const outOf = r => String((r.stdout || '') + (r.stderr ? (r.stdout ? '\n' : '') + r.stderr : '')).trim();
function toolFailed(r) {
  const t = outOf(r);
  if (/Cannot find module[^\n]*armorsim/i.test(t)) return 'The armour simulator (tools/armorsim/armorsim.js) is not part of this copy of ARSENAL.';
  if (r.timedOut) return 'The armour simulator took too long and was stopped.';
  return t.split('\n').slice(-6).join('\n') || ('exit code ' + r.code);
}
function jsonOut(r) {
  const s = String(r.stdout || '').trim();
  try { return JSON.parse(s); } catch (e) { /* try lines */ }
  for (const l of s.split(/\r?\n/).reverse()) if (/^\s*\{/.test(l)) { try { return JSON.parse(l); } catch (e) { /* next */ } }
  return null;
}

// ---------- checks ----------
function word(k, v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) bad('Fill in "' + k + '".');
  if (s[0] === '-') bad('"' + k + '" cannot start with "-".');
  if (/[\x00-\x1f\x7f]/.test(s)) bad('"' + k + '" cannot hold control characters.');
  if (s.length > 300) bad('"' + k + '" is too long.');
  return s;
}
function num(k, v, lo, hi) {
  const n = typeof v === 'number' ? v : (typeof v === 'string' && /^\s*-?\d+(\.\d+)?\s*$/.test(v) ? Number(v) : NaN);
  if (!Number.isFinite(n)) bad('"' + k + '" must be a number.');
  if (n < lo || n > hi) bad('"' + k + '" must be from ' + lo + ' to ' + hi + '.');
  return n;
}
// the unit armorsim reads: an entity name, or a .def game key as written; a .mdl / .def path or pak entry gives its file name
// (tools/soedit/target.js unitName). armorsim finds a def by name over the game and the --folder mod.
function unitOf(v) {
  const s = word('unit', v), T = require('../../../../soedit/target'), p = T.parse(s);
  if (p.error || p.form === 'name') return s;
  if (p.form === 'key' && p.ext === '.def') return p.value;
  const u = T.unitName(s);
  if (!u) bad('The armour table needs a unit: pick a vehicle or other unit, not a breed.');
  return u;
}
const fmt = n => String(Math.round(n * 1000) / 1000);
function vec(k, v, unit) {
  const a = Array.isArray(v) ? v : String(v == null ? '' : v).split(',');
  if (a.length !== 3) bad('"' + k + '" needs three numbers x,y,z.');
  const o = a.map(x => num(k, typeof x === 'string' ? x.trim() : x, -1e6, 1e6));
  if (unit && Math.hypot(o[0], o[1], o[2]) < 1e-9) bad('"' + k + '" cannot be zero.');
  return o.map(fmt).join(',');
}
function gridOf(g) {
  if (g == null || g === '') return null;
  let w, h;
  if (typeof g === 'object') { w = g.w; h = g.h; } else { const m = /^\s*(\d+)\s*x\s*(\d+)\s*$/i.exec(String(g)); if (!m) bad('The grid must be written as WxH, for example 64x48.'); w = m[1]; h = m[2]; }
  w = num('grid width', w, 4, 160); h = num('grid height', h, 4, 120);
  if (!Number.isInteger(w) || !Number.isInteger(h)) bad('The grid must be whole numbers.');
  return w + 'x' + h;
}
function viewOf(v) {
  const s = String(v == null ? 'front' : v).trim().toLowerCase();
  if (VIEWS.includes(s)) return s;
  const m = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(s.replace(/\s+/g, ''));
  if (!m) bad('The view must be front, rear, left, right, top or az,el in degrees.');
  return fmt(num('az', m[1], -360, 360)) + ',' + fmt(num('el', m[2], -90, 90));
}
// who shoots: --weapon W [--ammo A]
function shooter(b) {
  const out = ['--weapon', word('weapon', b.weapon)];
  if (b.ammo != null && b.ammo !== '') out.push('--ammo', word('ammo', b.ammo));
  return out;
}
function tail(ctx, b, mod) {
  const g = gameOpt(ctx, b), out = [];
  if (g) out.push('--game', g);
  out.push(...G.exeArgs(ctx, b));
  if (mod) out.push('--folder', mod);
  out.push('--json');
  return out;
}

// ---------- argv builders (exposed for the test) ----------
function tableArgs(ctx, b, mod) { return ['table', unitOf(b.target)].concat(tail(ctx, b, mod)); }
function shotArgs(ctx, b, mod) {
  const a = ['shot', unitOf(b.target)].concat(shooter(b), ['--range', fmt(num('range', b.range, 0, 5000))]);
  const hasO = b.origin != null && b.origin !== '', hasD = b.dir != null && b.dir !== '';
  if (hasO || hasD) {
    if (!hasO || !hasD) bad('A shot by origin needs both the start point and the direction.');
    a.push('--origin', vec('origin', b.origin), '--dir', vec('dir', b.dir, true));
  } else {
    a.push('--from', fmt(num('az', b.az == null ? 0 : b.az, -360, 360)) + ',' + fmt(num('el', b.el == null ? 0 : b.el, -90, 90)));
    if (b.aim != null && b.aim !== '') a.push('--aim', vec('aim', b.aim));
    else if (b.aimVolume != null && b.aimVolume !== '') a.push('--aim-volume', word('aimVolume', b.aimVolume));
  }
  const gz = groundOf(b);
  if (gz !== null) a.push('--ground', fmt(gz));
  return a.concat(tail(ctx, b, mod));
}
// `ground`: the ground height in model units (z of a flat plane, armorsim RULES 49); a downward shot ends and bursts there. null = none
const groundOf = b => b.ground == null || b.ground === '' ? null : num('ground', b.ground, -10000, 10000);
function mapArgs(ctx, b, mod) {
  const a = ['map', unitOf(b.target)].concat(shooter(b), ['--range', fmt(num('range', b.range, 0, 5000)), '--view', viewOf(b.view)]);
  const g = gridOf(b.grid);
  if (g) a.push('--grid', g);
  return a.concat(tail(ctx, b, mod));
}
function editArgs(ctx, b, mod) {
  const side = String(b.side == null ? '' : b.side).trim().toLowerCase();
  if (!SIDES.includes(side)) bad('The side must be one of: ' + SIDES.join(', ') + '.');
  const a = ['edit', unitOf(b.target), '--volume', word('volume', b.volume), '--side', side, '--mm', fmt(num('mm', b.mm, 0, 1000)), '--out', mod];
  const g = gameOpt(ctx, b);
  if (g) a.push('--game', g);
  a.push(...G.exeArgs(ctx, b));
  a.push('--folder', mod);
  if (b.shared) a.push('--shared');
  if (b.dry) a.push('--dry');
  a.push('--json');
  return a;
}

// ---------- cache: table/map by inputs + mtime of the unit's def in the mod ----------
// CACHE (gui README, contract 1). In memory: the last 60 answers (CACHE), as before. Behind it the shared store, so a table or a
// map (armorsim: up to 300 s) is not worked out again after a restart: section 'models.armor', parts {args} (the tool's whole
// argument list: unit, shell, range, view, grid, game folder, game, mod folder), stamps {game (lib/gameview), def (size and time
// of the unit's own file in the mod, '0' when the mod has none), rev (counts this page's armour edits of the unit)}. Which file
// of the mod is the unit's, and rev, are kept per mod + unit in section 'models.armor.def' (no stamps: it only names the file).
// As before, a change to another file the unit reads (a shared property file, the shell) is not seen [I].
const CACHE = new Map(), DEFKEY = new Map(), REV = new Map(), CACHE_MAX = 60;
const AVER = 1, ASECTION = 'models.armor', KSECTION = 'models.armor.def';
const storeOf = ctx => { try { return U().storeOf(ctx); } catch (e) { return null; } };
// the unit's file in the mod and its edit count: memory first, else what the store kept
function unitInfo(ctx, mod, target) {
  const uk = unitKey(mod, target);
  if (mod && !REV.has(uk)) {
    const S = storeOf(ctx), h = S && S.get(KSECTION, AVER, { unit: uk }, {}), v = (h && h.value) || {};
    REV.set(uk, Number(v.rev) || 0);
    if (v.key && !DEFKEY.has(uk)) DEFKEY.set(uk, String(v.key));
  }
  return { uk, key: DEFKEY.get(uk) || null, rev: REV.get(uk) || 0 };
}
function unitKeep(ctx, mod, target, key, bump) {
  if (!mod) return;
  const i = unitInfo(ctx, mod, target), rev = i.rev + (bump ? 1 : 0);
  if (key) DEFKEY.set(i.uk, String(key));
  if (!bump && (!key || String(key) === i.key)) return;
  REV.set(i.uk, rev);
  const S = storeOf(ctx); if (S) S.put(KSECTION, AVER, { unit: i.uk }, {}, { key: DEFKEY.get(i.uk) || null, rev });
}
function storeStamps(ctx, b, mod) {
  const i = unitInfo(ctx, mod, b.target); let def = '0';
  if (mod && i.key) { try { const st = fs.statSync(path.join(mod, i.key)); def = st.size + ':' + st.mtimeMs; } catch (e) { def = '0'; } }
  const gv = ctx.gameview || require('../../../../lib/gameview'), g = gameOpt(ctx, b);
  return { game: g ? gv.stamp({ gameDir: g, gid: G.idOf(ctx, b) }) : '', def, rev: String(i.rev) };
}
const unitKey = (mod, target) => JSON.stringify([mod || '', String(target || '').toLowerCase()]);
function defStamp(mod, target) {
  const k = DEFKEY.get(unitKey(mod, target));
  if (!mod || !k) return 0;
  try { return fs.statSync(path.join(mod, k)).mtimeMs; } catch (e) { return 0; }
}
function cacheGet(key, mod, target) {
  const e = CACHE.get(key);
  if (!e) return null;
  if (e.stamp !== defStamp(mod, target)) { CACHE.delete(key); return null; }
  return Object.assign({}, e.res, { cached: true });
}
function cachePut(key, mod, target, res) {
  if (CACHE.size >= CACHE_MAX) CACHE.delete(CACHE.keys().next().value);
  CACHE.set(key, { stamp: defStamp(mod, target), res, uk: unitKey(mod, target) });
}
function cacheDrop(mod, target) {
  const uk = unitKey(mod, target);
  for (const [k, e] of CACHE) if (e.uk === uk) CACHE.delete(k);
}

async function runJson(ctx, args, ms) {
  const r = await ctx.runTool('armorsim', ENTRY, args, { timeoutMs: ms || 120000 });
  // JOBS: stopped from the footer. Thrown, so that no caller caches or reads the killed tool's output (the dispatcher answers 499)
  if (r.cancelled) throw Object.assign(new Error('Stopped.'), { status: 499, cancelled: true });
  const j = jsonOut(r);
  if (!j || r.code === 2) bad(toolFailed(r));
  if (j && typeof j === 'object' && !Array.isArray(j)) { j.raw = outOf(r); j.code = r.code; }
  return j;
}
async function cached(ctx, b, build, ms) {
  const mod = modMay(ctx, b), args = build(ctx, b, mod);
  const key = JSON.stringify(args);
  unitInfo(ctx, mod, b.target);   // after a restart: the unit's file in the mod, from the store
  const hit = cacheGet(key, mod, b.target);
  if (hit) return hit;
  const S = storeOf(ctx), kept = S && S.get(ASECTION, AVER, { args }, storeStamps(ctx, b, mod));
  if (kept && kept.value && typeof kept.value === 'object') { cachePut(key, mod, b.target, kept.value); return Object.assign({}, kept.value, { cached: true }); }
  const j = await runJson(ctx, args, ms);
  if (j.key && mod) unitKeep(ctx, mod, b.target, j.key, false);
  if (j.code === 0 || j.code == null) { cachePut(key, mod, b.target, j); if (S) S.put(ASECTION, AVER, { args }, storeStamps(ctx, b, mod), j); }
  return Object.assign({}, j, { cached: false });
}
const table = (ctx, b) => cached(ctx, b, tableArgs, 120000);
const map = (ctx, b) => cached(ctx, b, mapArgs, 300000);
async function shot(ctx, b) { const mod = modMay(ctx, b); return slopeInfo(await runJson(ctx, shotArgs(ctx, b, mod), 120000)); }
// slopeInfo(answer): each plate gets slope { geo, share, how } so the page can say why "mm on the slope" is below plain geometry.
// The game's rule: effective = ((slope - 1) * f + 1) * mm, slope = 1/cos (cos floored 0.01, slope capped 10), f = the plate's
// thickness against the shell's calibre times the shell's overmatch value at that angle, kept within 0.2..1. f is worked back here
// from the numbers the answer already holds (nominal, angle, effective). how: 'flat' (square-on), 'full' (f = 1), 'part' (f < 1),
// 'none' (no slope added: thickness measured along the path, or a blast). geo = mm / cos, one decimal.
function slopeInfo(j) {
  if (!j || !Array.isArray(j.plates)) return j;
  for (const p of j.plates) {
    const n = +p.nominal || 0, e = +p.effective || 0, cos = Math.max(Math.abs(Math.cos((+p.angle || 0) * Math.PI / 180)), 0.01);
    if (!(n > 0)) continue;
    const S = Math.min(1 / cos, 10), geo = Math.round(n / cos * 10) / 10;
    if (S < 1.02) { p.slope = { geo, share: 1, how: 'flat' }; continue; }
    const f = (e / n - 1) / (S - 1);
    if (f < 0.1) { p.slope = { geo, share: 0, how: 'none' }; continue; }   // the game never counts less than 0.2 of the slope: none was added
    const share = Math.min(1, Math.round(f * 100) / 100);
    p.slope = { geo, share, how: share >= 0.99 ? 'full' : 'part' };
  }
  return j;
}
async function edit(ctx, b) {
  const mod = modNeed(ctx, b), args = editArgs(ctx, b, mod);
  if (!b.dry && ctx.job) ctx.job.writes = true;   // JOBS: the unit's armour file in the mod is rewritten
  let j;
  try { j = await runJson(ctx, args, 120000); }
  catch (e) { if (e && e.cancelled && !b.dry) { cacheDrop(mod, b.target); unitKeep(ctx, mod, b.target, null, true); (ctx.modtree || require('../../../../lib/modtree')).touch(mod); } throw e; }   // stopped midway: the file may be changed already
  const ch = Array.isArray(j.changes) ? j.changes : [];
  if (ch[0] && ch[0].key) DEFKEY.set(unitKey(mod, b.target), String(ch[0].key));
  // written: the answers kept for this unit go (memory now, the store by the unit's edit count) and the mod is walked again
  if (!b.dry) { cacheDrop(mod, b.target); unitKeep(ctx, mod, b.target, ch[0] && ch[0].key, true); (ctx.modtree || require('../../../../lib/modtree')).touch(mod); }
  j.dry = !!b.dry; j.mod = mod;
  return j;
}

// ---------- the shot followed behind the armour (armorsim effects: engine events + the unit's interaction scripts) ----------
// Without `doc` the files on disk are read (mod over game) through the tool. With `doc` (an open model document id) the shot runs in
// process on the document's current bytes and pose (unsaved edits included); `carry` keeps the entity state of the shot before
// (wounds, broken parts) for this document, `reset` drops it.
const CARRY = new Map();   // doc id -> state of the last shot
function effectsArgs(ctx, b, mod) {
  const a = shotArgs(ctx, b, mod); a[0] = 'effects';
  const j = a.indexOf('--json'), extra = ['--samples', fmt(num('samples', b.samples == null ? 400 : b.samples, 1, 5000))];
  if (b.seed != null && b.seed !== '') extra.push('--seed', fmt(num('seed', b.seed, 0, 1e9)));
  if (b.until != null && b.until !== '') extra.push('--until', fmt(num('until', b.until, 1, 600)));
  if (b.explosive != null && b.explosive !== '') extra.push('--explosive', fmt(num('explosive', b.explosive, 0, 1e6)));
  a.splice(j < 0 ? a.length : j, 0, ...extra);
  return a;
}
async function effects(ctx, b) {
  // vanilla: the same shot on the game's own files, without the mod and without the open document (before and after)
  if (b.vanilla) return Object.assign(await runJson(ctx, effectsArgs(ctx, b, null), 180000), { vanilla: true });
  const mod = modMay(ctx, b);
  if (!b.doc) return runJson(ctx, effectsArgs(ctx, b, mod), 180000);
  const core = require('../../../../lib/model/edit/core'), sim = require('../../../../armorsim/sim'), FX = require('../../../../armorsim/effects');
  const d = core.get(b.doc);
  if (!d) bad('That model is no longer open here. Pick it again.');
  const id = String(b.doc);
  if (b.reset) CARRY.delete(id);
  const c = sim.openDoc(d, Object.assign({ unit: unitOf(b.target), game: gameOpt(ctx, b), mods: [], folder: mod || undefined, anm: b.anm || null, frame: b.frame }, exeX(ctx, b)));
  if (c.error) bad(c.error);
  const sh = shooter(b), S = sim.shellFrom({ weapon: sh[sh.indexOf('--weapon') + 1], ammo: sh.indexOf('--ammo') >= 0 ? sh[sh.indexOf('--ammo') + 1] : undefined }, c.opts);
  if (S.error) bad(S.error);
  const range = num('range', b.range, 0, 5000);
  let ray;
  if (b.origin != null && b.origin !== '' && b.dir != null && b.dir !== '') ray = { origin: vec('origin', b.origin).split(',').map(Number), dir: vec('dir', b.dir, true).split(',').map(Number) };
  else {
    let aim = null;
    if (b.aim != null && b.aim !== '') aim = vec('aim', b.aim).split(',').map(Number);
    else if (b.aimVolume != null && b.aimVolume !== '') { aim = sim.aimVolume(c, word('aimVolume', b.aimVolume)); if (!aim) bad('The model has no volume named ' + b.aimVolume + '.'); }
    ray = sim.rayFrom(c, num('az', b.az == null ? 0 : b.az, -360, 360), num('el', b.el == null ? 0 : b.el, -90, 90), aim);
  }
  const gz = groundOf(b);
  if (gz !== null) ray.ground = gz;
  const R = FX.effects(c, S, range, ray, { samples: num('samples', b.samples == null ? 400 : b.samples, 1, 5000), seed: b.seed == null || b.seed === '' ? 1 : num('seed', b.seed, 0, 1e9),
    until: b.until == null || b.until === '' ? undefined : num('until', b.until, 1, 600),
    explosiveAmount: b.explosive == null || b.explosive === '' ? undefined : num('explosive', b.explosive, 0, 1e6), state: b.carry && CARRY.has(id) ? CARRY.get(id) : undefined });
  if (b.carry) CARRY.set(id, R.next);
  const out = Object.assign({ unit: c.unit, rangeM: range, rev: d.rev, carried: !!(b.carry), ray }, R);
  delete out.next;
  return out;
}
// ---------- the volumes shells never hit (left out of the trace: ram volumes, bullet ability off), for a click meant as a shot ----------
// With `doc`: the open document as the effects route reads it (sim.openDoc join.notHit), kept per document and revision; without it:
// the cached thickness table's join.notHit (files on disk). -> { notHit: [{ id, name, why }], rev? }
const NOTHIT = new Map();   // doc id -> { key, notHit }
async function notHit(ctx, b) {
  if (!b.doc) { const j = await table(ctx, b); return { notHit: (j.join && j.join.notHit) || [] }; }
  const core = require('../../../../lib/model/edit/core'), sim = require('../../../../armorsim/sim');
  const d = core.get(b.doc);
  if (!d) bad('That model is no longer open here. Pick it again.');
  const mod = modMay(ctx, b), id = String(b.doc), unit = unitOf(b.target), key = [unit, mod || '', d.rev, b.anm || '', b.frame == null ? '' : b.frame].concat(G.exeOpt(ctx, b) || []).join('|');
  const had = NOTHIT.get(id);
  if (had && had.key === key) return { notHit: had.notHit, rev: d.rev };
  const c = sim.openDoc(d, Object.assign({ unit, game: gameOpt(ctx, b), mods: [], folder: mod || undefined, anm: b.anm || null, frame: b.frame }, exeX(ctx, b)));
  if (c.error) bad(c.error);
  const nh = ((c.join && c.join.notHit) || []).map(x => ({ id: x.id, name: x.name, why: x.why }));
  if (NOTHIT.size > 50) NOTHIT.clear();
  NOTHIT.set(id, { key, notHit: nh });
  return { notHit: nh, rev: d.rev };
}
// ---------- who shoots: guns and their shells, through the simulator's own reader ----------
function stuffKeys(src) {
  if (src._armorTabKeys) return src._armorTabKeys;
  const s = new Set(src.local ? src.local.keys() : []);
  if (src.v && src.v.files) for (const k of src.v.files.keys()) s.add(k);
  try { for (const k of AD().keys(src)) s.add(k); } catch (e) { /* older reader: the two sets above */ }   // guns that exist only inside a mod's pak
  const list = [];
  for (const k of s) {
    if (!k.startsWith('resource/set/stuff/')) continue;
    const rel = k.slice('resource/set/stuff/'.length), i = rel.lastIndexOf('/');
    const dir = i < 0 ? '' : rel.slice(0, i), base = rel.slice(i + 1);
    if (!base || base.startsWith('.') || !GUN_DIRS.includes(dir)) continue;
    const tags = base.split('.');
    if (tags.includes('pattern') || /\.(ammo|grenade|mine)$/.test(base)) continue;
    list.push({ name: base, group: dir });
  }
  list.sort((a, b) => GUN_DIRS.indexOf(a.group) - GUN_DIRS.indexOf(b.group) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return (src._armorTabKeys = list);
}
function srcOpts(ctx, b) {
  const game = gameOpt(ctx, b);
  if (!game) bad('No game folder found. Set the Men of War: Assault Squad 2 folder on the Start page first.');
  const mod = modMay(ctx, b), o = Object.assign({ game, mods: [] }, exeX(ctx, b));   // the chosen mod only, as the tool runs (no mods list = the game's active mods, another set of files)
  if (mod) o.folder = mod;
  return o;
}
async function guns(ctx, b) {
  const o = srcOpts(ctx, b), all = stuffKeys(AD().openSource(o));
  const q = String(b.q == null ? '' : b.q).trim().toLowerCase().slice(0, 80);
  const words = q.split(/\s+/).filter(Boolean);
  let hit = all.filter(g => words.every(w => g.name.includes(w)));
  if (q) hit.sort((a, c) => (a.name.startsWith(words[0]) ? 0 : 1) - (c.name.startsWith(words[0]) ? 0 : 1));
  const limit = Math.min(Math.max(Number(b.limit) || 40, 1), 5000);   // the pages ask once for the whole list (searchKit index) and filter it themselves
  return { guns: hit.slice(0, limit), total: hit.length, all: all.length };
}
async function shells(ctx, b) {
  const o = srcOpts(ctx, b), weapon = word('weapon', b.weapon).toLowerCase();
  if (!stuffKeys(AD().openSource(o)).some(g => g.name === weapon)) bad('No gun named "' + weapon + '" was found. Pick one from the search list.');
  const A = AD(), first = A.shell(weapon, o);
  if (!first) return { weapon, shells: [] };
  const names = first.candidates && first.candidates.length ? first.candidates : first.ammo ? [first.ammo] : [];
  const out = [];
  for (const ammo of names.slice(0, 30)) {
    let s = null;
    try { s = A.shell({ weapon, ammo }, o); } catch (e) { s = null; }
    if (!s) continue;
    out.push({ ammo: s.ammo || ammo, kind: s.kind, calibre: s.calibre, penetration: s.penetration || [], aimRange: s.aimRange, maxRange: s.maxRange < 1e30 ? s.maxRange : null, cumulative: s.cumulative || 0 });
  }
  return { weapon: first.weapon || weapon, shells: out };
}

const wrap = fn => async (url, body, ctx) => { G.noGohArmour(ctx, body || {}); return fn(ctx, body || {}); };
// under Gates of Hell these answer from sub/armorgoh.js (GoH's own rules); nothit keeps the line above
const GOH_H = { modMay, modNeed, unitOf, word, num, stuffKeys, guns };
const wrapGoh = (fn, name) => async (url, body, ctx) => G.isGoh(ctx, body || {}) ? require('./armorgoh')[name](ctx, body || {}, GOH_H) : fn(ctx, body || {});
module.exports = {
  slopeInfo,
  routes: {
    'POST /api/x/models/armor/table': wrapGoh(table, 'table'),
    'POST /api/x/models/armor/shot': wrapGoh(shot, 'shot'),
    'POST /api/x/models/armor/map': wrapGoh(map, 'map'),
    'POST /api/x/models/armor/effects': wrapGoh(effects, 'effects'),
    'POST /api/x/models/armor/edit': wrapGoh(edit, 'edit'),
    'POST /api/x/models/armor/guns': wrapGoh(guns, 'guns'),
    'POST /api/x/models/armor/shells': wrapGoh(shells, 'shells'),
    'POST /api/x/models/armor/nothit': wrap(notHit),
  },
  _t: { SIDES, VIEWS, GUN_DIRS, effectsArgs, CARRY, NOTHIT,tableArgs, shotArgs, mapArgs, editArgs, gridOf, viewOf, CACHE, DEFKEY, REV, cacheDrop, stuffKeys },
};

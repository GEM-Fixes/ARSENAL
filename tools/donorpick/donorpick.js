// Author: Imperator_Aug (ARSENAL, ia-6f52f90e)
'use strict';
// donorpick (DONOR-1): picks the vanilla AS2 donor stem for a GoH unit, so goh2as2 --donor needs no hand choice.
//   node donorpick.js --goh <GoH mod dir> [--base <GoH dir>] --game <AS2 dir> --entity <name> [--json] [--exe as64|mowas_2|mowas2]
//   --exe: the AS2 game whose vanilla units form the donor pool (lib/vfs exe): as64 (as64/core mounted) or mowas_2 (MoW:AS2, no as64/core).
//     none = the vfs default (as64 when as64.exe is in --game), as before. With --exe and no --game, the AS2 install comes from lib/games install.
//     --exe goh is refused (exit 2, one line): GoH is the source of the port (--goh), never the donor pool. MoW:AS2 donors are [I]:
//     no ported unit was loaded in mowas_2.exe.
//   node donorpick.js --goh .. --base .. --game .. --prove            agreement with known-donors.json (the 36 reps), per-rep table
//   node donorpick.js --goh .. --base .. --game .. --sample 56 --seed 65 --out <file.json> [--even] [--json] (--even: equal per class, a small class takes all and the rest is shared) stratified random draw of mod delta units, held out from known-donors.json and*.md, car-*.md
// Rule: same class (tank, light, gun, mortar), same mover (tracked/wheeled), nearest main-gun calibre, nearest armour, nearest crew count.
// A unit with no class in that list, or no vanilla candidate in class and calibre reach, is reported as UNPLACED (donor null), never guessed.
// Reads only: GoH paks/folders through lib/pakset, vanilla defs through lib/vfs. Writes only --out.
require('../lib/help')(__filename); // --help / -h: header usage, exit 0 (HELPFIX2)
const fs = require('fs'), path = require('path');

const KNOWN = path.join(__dirname, 'known-donors.json');
const VCLASS = { tank_light: 'tank', tank_medium: 'tank', tank_heavy: 'tank', btr: 'light', car: 'light', cannon: 'gun', mortar: 'mortar' };

// ---- text features (pure; also used by the test) ---------------------------------------------------------------
const MG_RE = /(^|[_\s-])(mg|mgun|hmg|lmg|smg)|browning|dshk|maxim|bren|vickers|lewis|madsen|besa|hotchkiss|breda|degtyarev|sgm|zb\d|type\d+_?mg|dt_|coax|flamethrower/i;
const HMG_RE = /browning_m2|m2hb|dshk|hmg|12[._]7|13[._]2|heavy/i;

function calOf(name, rest) {
  const s = (name + ' ' + (rest || '')).toLowerCase();
  let m = /(\d+(?:[.,]\d+)?)\s*mm/.exec(name.toLowerCase()); if (m) return { c: parseFloat(m[1].replace(',', '.')), mg: false };
  m = /(\d+(?:[.,]\d+)?)\s*cm(?![a-z])/.exec(name.toLowerCase()); if (m) return { c: parseFloat(m[1].replace(',', '.')) * 10, mg: false };
  m = /bullet[a-z]*_?(\d{2,3})(?:x|\b|\s|_)/.exec(s) || /mortar_?(\d{2,3})/.exec(s); if (m && +m[1] >= 20) return { c: +m[1], mg: false };
  if (MG_RE.test(name)) return { c: HMG_RE.test(name) ? 12.7 : 7.9, mg: true };
  return { c: 0, mg: false };
}

// text of the def plus relative .ext/.inc includes, depth 2; read(rel) -> string|null
function withIncludes(text, dir, read, depth = 2) {
  let out = text;
  if (depth <= 0) return out;
  const seen = new Set();
  for (const m of text.matchAll(/\(\s*include\s+"([^"\r\n]+\.(?:ext|inc))"/gi)) {
    if (m[1].startsWith('/') || seen.has(m[1])) continue; seen.add(m[1]);
    const key = norm(dir + '/' + m[1]); let t = null; try { t = read(key); } catch { t = null; }
    if (t) out += '\n' + withIncludes(t, key.slice(0, key.lastIndexOf('/')), read, depth - 1);
  }
  return out;
}
function norm(p) { const o = []; for (const s of p.split('/')) { if (s === '..') o.pop(); else if (s !== '.' && s !== '') o.push(s); } return o.join('/'); }

function macroBody(t, at) { // text of the (...) group opening at index `at`
  let d = 0; for (let i = at; i < t.length && i < at + 600; i++) { if (t[i] === '(') d++; else if (t[i] === ')') { d--; if (d === 0) return t.slice(at, i + 1); } }
  return t.slice(at, at + 200);
}

function features(text) {
  const t = text.replace(/;[^\r\n]*/g, '');
  const f = { weapons: [], cal: 0, mgcal: 0, weapon: null, armour: 0, crew: 0, mover: '?', muzzle: 0, mortar: false, hasMdl: /\{\s*extension\s+"[^"]*\.mdl"/i.test(t) };
  for (const m of t.matchAll(/\{\s*weapon\s+"(?:weapon\s+)?([^"]+)"([^}]*)\}/gi)) {
    const c = calOf(m[1], m[2]); f.weapons.push({ name: m[1], ...c });
  }
  // small-arms box: "ammo 13x99h", "ammo 8x59". A weapon whose name says no calibre, in a def carrying that box, is that machine gun (VOL-4F)
  let boxCal = 0; for (const m of t.matchAll(/"ammo\s+(\d+(?:[.,]\d+)?)x\d/gi)) { const v = parseFloat(m[1].replace(',', '.')); if (v < 20) boxCal = Math.max(boxCal, v); }
  if (boxCal) for (const w of f.weapons) if (!w.c && !w.mg) { w.c = boxCal; w.mg = true; }
  const main = f.weapons.filter(w => !w.mg && w.c >= 20).sort((a, b) => b.c - a.c)[0];
  const mgs = f.weapons.filter(w => w.mg).sort((a, b) => b.c - a.c)[0];
  if (main) { f.cal = main.c; f.weapon = main.name; }
  if (mgs) f.mgcal = mgs.c;
  if (!main) { // calibre from the ammo the def carries, then the muzzle prop
    let best = 0; for (const m of t.matchAll(/"ammo\s+bullet[a-z]*_?(\d{2,3})/gi)) best = Math.max(best, +m[1]);
    if (best >= 20) { f.cal = best; f.weapon = f.weapon || (mgs ? mgs.name : null); f.calFrom = 'ammo'; }
    else { const mz = [...t.matchAll(/"muzzle_(\d+)mm(?:_(\d+)mm)?/gi)].map(m => Math.max(+m[1], +(m[2] || 0)))[0]; if (mz >= 20) { f.cal = mz; f.calFrom = 'muzzle'; } }
  }
  const mz = /"muzzle_(\d+)mm(?:_(\d+)mm)?/i.exec(t); if (mz) f.muzzle = Math.max(+mz[1], +(mz[2] || 0));
  f.mortar = /\bmortar\b|brandt|granatwerfer|minenwerfer|sgrw|\bgw\d|mortier|mortaio|\bml3\b/i.test(f.weapons.map(w => w.name).join(' ') + ' ' + (/\{\s*props\s+([^}]*)\}/i.exec(t) || ['', ''])[1]);
  // armour: {thickness N} and the numbers inside ("armor_*" ...) macros
  let a = 0;
  for (const m of t.matchAll(/\{\s*thickness\s+(\d+(?:\.\d+)?)/gi)) a = Math.max(a, +m[1]);
  for (const m of t.matchAll(/\(\s*"armor_[a-z_0-9]*"/gi)) for (const n of macroBody(t, m.index).matchAll(/\d+(?:\.\d+)?/g)) { const v = +n[0]; if (v < 400) a = Math.max(a, v); }
  f.armour = a;
  // crew: macro with a number (crew_4_human, ..._cannon_4) counts that many, other crew_* macros one each
  let crew = 0;
  for (const m of t.matchAll(/\(\s*"(crew[a-z_0-9]*)"/gi)) { const n = /crew_(\d)_|_(\d)$/.exec(m[1]); crew += n ? +(n[1] || n[2]) : 1; }
  f.crew = crew;
  const tr = /tank_trace/i.test(t), cr = /car_trace/i.test(t) || /\bwheel(?:right|left|l|r)?\d?"/i.test(t);
  f.mover = tr && cr ? 'H' : tr ? 'T' : cr ? 'W' : '?';
  return f;
}

// a weapon is named but nothing says its calibre (a launcher id): the unit's own name may. No weapon named, or no calibre in the name either: nothing is read and pick refuses
function stemCal(f, stem) {
  if (f.cal || f.mgcal || f.muzzle || !f.weapons.length) return f;
  const s = calOf(stem);
  if (s.mg) f.mgcal = s.c;
  else if (s.c >= 20) { f.cal = s.c; f.weapon = f.weapon || f.weapons[0].name; f.calFrom = 'stem'; }
  return f;
}

function classOfKey(key, f) { // GoH key (lowercase, no resource/) -> class
  const segs = key.split('/');
  if (segs.includes('humanskin') || segs[0] === 'inventory' || segs[1] === 'inventory' || segs.includes('inventory')) return 'infantry';
  const vi = segs.indexOf('-vehicle'); if (vi < 0) return null;
  let cls = null; for (const s of segs.slice(vi + 1, -1)) if (VCLASS[s]) cls = VCLASS[s];
  if (cls === 'gun' && f && f.mortar) cls = 'mortar';
  return cls;
}

// ---- scoring ------------------------------------------------------------------------------------------------------
// barrel length tag: AS2 writes "75mm_kwk40(L48)", GoH writes "75mm_kwk40_l48" (GT-06). wlen reads it, wnorm drops it
const wlen = n => { const m = /(?:\(\s*l\s*(\d+)\s*\)|[_\s-]l(\d+))\s*$/i.exec(n); return m ? +(m[1] || m[2]) : 0; };
const wnorm = n => n.toLowerCase().replace(/\(.*?\)/g, '').replace(/[_\s-]l\d+\s*$/, '').replace(/^(\d+mm_)(?:us|uk|ger|rus|jap|fr|it)-/, '$1').replace(/[^a-z0-9]/g, '');
// unit name family: GoH "panzer4h" and AS2 "pz4h" are the same tank (GT-06). Only exact equality after this counts
const snorm = s => String(s || '').toLowerCase().replace(/^(?:us|uk|ger|rus|jap|fr|it)-/, '').replace(/pz\.?kpfw\.?|panzer/g, 'pz').replace(/[^a-z0-9]/g, '');
// vanilla mortar defs share one weapon (werfer42), so their calibre is not in the data: nominal calibres by name [I, real-world]
const MORTAR_CAL = { m1mortar: 81, ml3: 81, sgrw42: 81, sgrw42_ger2: 81, bm37: 82, type94: 90 };
const lr = (a, b, k) => Math.abs(Math.log((a + k) / (b + k)));
function score(rep, c, cstem) {
  const parts = {}; let s = 0;
  if (rep.cls === 'tank' || rep.cls === 'light') {
    if (rep.mover !== '?' && c.mover !== '?' && rep.mover !== c.mover) { parts.mover = (rep.mover === 'H' || c.mover === 'H') ? 1.2 : 3; }
  }
  if (rep.cal > 0 && c.cal > 0) parts.cal = 4 * lr(rep.cal, c.cal, 0);
  else if (rep.cal > 0 || c.cal > 0) parts.cal = rep.cls === 'mortar' ? 0.8 : 3.5;
  else if (rep.mgcal && c.mgcal) parts.cal = 1.5 * lr(rep.mgcal, c.mgcal, 0);
  const soft = rep.cls === 'gun' || rep.cls === 'mortar';   // gun crew counts sit in macros the def does not spell out; mortar armour is a body stub
  if (rep.cls !== 'mortar') parts.armour = 1.5 * lr(rep.armour, c.armour, 10);
  parts.crew = (soft ? 0.05 : 0.25) * Math.abs(rep.crew - c.crew);
  // same weapon name (prefix us-/uk-, "(L48)" and case dropped) = the AS2 game has that very gun: a tie-break toward it
  // a barrel length on both sides that differs (L43 vs L48) is a different gun: half the tie-break
  if (rep.weapon && c.weapon && wnorm(rep.weapon) === wnorm(c.weapon)) { const a = wlen(rep.weapon), b = wlen(c.weapon); parts.sameWeapon = a && b && a !== b ? -0.5 : -1; }
  // the AS2 game has the very same vehicle (same name family): it is the donor whatever the armour reading says
  // same family, other variant letter (panzer4j -> pz4h, kv1s -> kv1): a smaller pull
  if (rep.stem && cstem) {
    const a = snorm(rep.stem), b = snorm(cstem), fa = a.replace(/(\d)[a-z]$/, '$1'), fb = b.replace(/(\d)[a-z]$/, '$1');
    if (a === b) parts.sameName = -1.5; else if (fa === fb && fa.length >= 3) parts.sameName = -0.75;
  }
  for (const v of Object.values(parts)) s += v;
  return { s, parts };
}

// pool: [{stem, key, cls, f}] ; rep: features + cls. -> ranked
function pick(rep, pool) {
  if ((rep.cls === 'gun' || rep.cls === 'tank') && !rep.cal && !rep.mgcal && !rep.muzzle) return { unplaced: 'no weapon read from the def or its relative includes (rocket, named only by a launcher id, or the gun sits behind a /properties include)' };
  const cand = pool.filter(p => p.cls === rep.cls);
  if (!cand.length) return { unplaced: 'no vanilla candidate in class ' + rep.cls };
  const ranked = cand.map(p => ({ p, ...score(rep, p.f, p.stem) })).sort((a, b) => a.s - b.s || (a.p.stem < b.p.stem ? -1 : 1));
  const top = ranked[0], second = ranked.find(r => r.p.stem !== top.p.stem);
  const calKnown = rep.cal > 0;
  const calErr = calKnown && top.p.f.cal > 0 ? Math.abs(Math.log(rep.cal / top.p.f.cal)) : null;
  if (calKnown && rep.cls !== 'mortar' && calErr !== null && calErr > Math.log(2)) return { unplaced: `nearest calibre ${top.p.f.cal} mm (${top.p.stem}) is over 2x from the rep's ${rep.cal} mm`, top, ranked };
  const gap = second ? second.s - top.s : 9;
  let conf = 'low';
  const crewOk = rep.cls === 'gun' || rep.cls === 'mortar' || Math.abs(rep.crew - top.p.f.crew) <= 1, armOk = rep.cls === 'mortar' || lr(rep.armour, top.p.f.armour, 10) < 0.5;
  if (top.s < 1.5 && (calErr === null ? !calKnown : calErr < 0.12) && gap >= 0.2 && crewOk && armOk) conf = 'high';
  else if (top.s < 3 && (calErr === null || calErr < 0.3)) conf = 'medium';
  if (rep.cls === 'mortar' && rep.cal === 0) conf = 'low';
  const why = [`${rep.cls}`, rep.cal ? `${rep.weapon || 'gun'} ${rep.cal}mm vs ${top.p.f.cal || 'none'}` : 'no main gun (' + (rep.mgcal ? 'mg ' + rep.mgcal : 'unarmed') + ')', `armour ${rep.armour} vs ${top.p.f.armour}`, `mover ${rep.mover}/${top.p.f.mover}`, `crew ${rep.crew}/${top.p.f.crew}`, `score ${top.s.toFixed(2)}${second ? ' next ' + second.p.stem + ' ' + second.s.toFixed(2) : ''}`].join('; ');
  return { donor: top.p.stem, conf, reason: why, score: top.s, top, ranked };
}

// ---- data access -------------------------------------------------------------------------------------------------
function buildIndex(goh) {
  const pakset = require('../lib/pakset');
  const root = fs.existsSync(path.join(goh, 'resource')) ? path.join(goh, 'resource') : goh;
  const ps = pakset.open(root, null), map = new Map();
  for (const e of ps.entries) map.set(e.key.toLowerCase(), { ent: e });
  for (const f of fs.readdirSync(root, { recursive: true })) {
    const p = path.join(root, f); let st; try { st = fs.statSync(p); } catch { continue; }
    if (!st.isFile() || /\.pak$/i.test(p)) continue;
    map.set(f.replace(/\\/g, '/').toLowerCase(), { path: p });
  }
  return { map, read: e => e.path ? fs.readFileSync(e.path) : pakset.read(e.ent) };
}
const decode = b => { let x = b; if (x[0] === 0xEF && x[1] === 0xBB && x[2] === 0xBF) x = x.subarray(3); return new TextDecoder('utf-8').decode(x); };

function gohSource(goh, bases) {
  const idxs = [buildIndex(goh), ...(bases || []).map(buildIndex)];
  const has = k => idxs.some(i => i.map.has(k));
  const read = k => { for (const i of idxs) { const e = i.map.get(k); if (e) return decode(i.read(e)); } return null; };
  return { idxs, has, read, own: idxs[0] };
}
function repFromKey(src, key) {
  const t0 = src.read(key); if (t0 == null) return null;
  const dir = key.slice(0, key.lastIndexOf('/'));
  const text = withIncludes(t0, dir, src.read);
  const stem = key.slice(key.lastIndexOf('/') + 1).replace(/\.def$/, '');
  const f = stemCal(features(text), stem);
  const cls = classOfKey(key, f);
  return { key, stem, cls, ...f };
}
function findKeys(src, name) {
  const q = name.toLowerCase().replace(/\\/g, '/').replace(/^resource\//, '');
  for (const i of src.idxs) { const hits = [...i.map.keys()].filter(k => k === q || (k.endsWith('.def') && (k.endsWith('/' + q + '.def') || k.endsWith('/' + q)))); if (hits.length) return hits.sort(); }
  return [];
}

// exe: the vfs exe of the donor game ('as64' | 'mowas_2'); undefined = the vfs default (as before)
function vanillaPool(game, exe) {
  const vfs = require('../lib/vfs');
  const vf = vfs.build({ gameDir: game, mods: [], ...(exe ? { exe } : {}) });
  const read = k => vf.files.has(k) ? vfs.readRec(vf.files.get(k)).toString('latin1') : null;
  const pool = [];
  for (const k of vf.files.keys()) {
    const m = /^resource\/entity\/-vehicle\/(tank_light|tank_medium|tank_heavy|btr|car|cannon)\/(.*\/)?([^/]+)\.def$/.exec(k);
    if (!m) continue;
    const dir = k.slice(0, k.lastIndexOf('/'));
    const raw = read(k); if (!raw || !/game_entity/i.test(raw)) continue;
    const text = withIncludes(raw, dir, read);
    const f = features(text); if (!f.hasMdl) continue;
    if (/\/x\//.test(k)) continue;   // cannon/x/*: the _x/_xx variants of the base defs
    let cls = VCLASS[m[1]]; if (cls === 'gun' && (f.mortar || /\/mortars\//.test(k))) cls = 'mortar';
    if (cls === 'mortar' && MORTAR_CAL[m[3].toLowerCase()]) { f.cal = MORTAR_CAL[m[3].toLowerCase()]; f.calFrom = 'table'; }
    pool.push({ stem: m[3].toLowerCase(), key: k, cls, f });
  }
  return pool;
}

function describe(rep, res) {
  const o = { entity: rep.stem, class: rep.cls, weapon: rep.weapon, calibre_mm: rep.cal || null, mg_mm: rep.mgcal || null, armour: rep.armour, crew: rep.crew, mover: rep.mover };
  if (rep.cls === 'infantry') return { ...o, donor: null, confidence: 'high', reason: 'infantry or item: no donor, plain goh2as2 route' };
  if (!rep.cls) return { ...o, donor: null, confidence: 'unplaced', reason: 'UNPLACED: no class from the path (not tank, light car/btr, gun, mortar, infantry)' };
  if (res.unplaced) return { ...o, donor: null, confidence: 'unplaced', reason: 'UNPLACED: ' + res.unplaced };
  return { ...o, donor: res.donor, confidence: res.conf, reason: res.reason };
}

// ---- sampling ------------------------------------------------------------------------------------------------------
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function allocate(counts, n) { // largest remainder
  const tot = Object.values(counts).reduce((a, b) => a + b, 0), q = {}, out = {}; let used = 0;
  for (const [k, c] of Object.entries(counts)) { q[k] = c * n / tot; out[k] = Math.floor(q[k]); used += out[k]; }
  for (const k of Object.keys(counts).sort((a, b) => (q[b] - Math.floor(q[b])) - (q[a] - Math.floor(q[a])) || (a < b ? -1 : 1))) { if (used >= n) break; if (out[k] < counts[k]) { out[k]++; used++; } }
  return out;
}
function allocateEven(counts, n) { // equal share per class; a class with fewer units takes all, the rest is shared over the others (leftover: alphabetical)
  const out = {}; let left = Math.min(n, Object.values(counts).reduce((a, b) => a + b, 0)), open = Object.keys(counts).sort();
  for (const k of open) out[k] = 0;
  while (left > 0 && open.length) {
    const share = Math.floor(left / open.length);
    const small = open.filter(k => counts[k] - out[k] <= share);
    if (small.length) { for (const k of small) { left -= counts[k] - out[k]; out[k] = counts[k]; } open = open.filter(k => !small.includes(k)); continue; }
    for (const k of open) { out[k] += share; left -= share; }
    for (const k of open) { if (left <= 0) break; out[k]++; left--; }
  }
  return out;
}
function draw(units, n, seed, even) { // units: [{stem, cls}] -> chosen, stratified by cls (even: equal per class)
  const by = {}; for (const u of units) (by[u.cls] = by[u.cls] || []).push(u);
  const counts = {}; for (const k of Object.keys(by)) counts[k] = by[k].length;
  const al = even ? allocateEven(counts, n) : allocate(counts, n), r = rng(seed), out = [];
  for (const k of Object.keys(by).sort()) {
    const a = by[k].slice().sort((x, y) => x.stem < y.stem ? -1 : 1);
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    out.push(...a.slice(0, al[k]));
  }
  return { chosen: out, counts, alloc: al };
}
function reportTokens(dirRoot) {
  const set = new Set(); const rd = path.join(dirRoot, 'plan', 'reports');
  if (!fs.existsSync(rd)) return set;
  for (const f of fs.readdirSync(rd)) if (/^(b8-.*|car-.*)\.md$/.test(f)) for (const m of fs.readFileSync(path.join(rd, f), 'utf8').toLowerCase().matchAll(/[a-z0-9][a-z0-9_.\-#]*[a-z0-9]|[a-z0-9]/g)) set.add(m[0]);
  return set;
}

// ---- CLI -----------------------------------------------------------------------------------------------------------
function parseArgs(argv) {
  const o = { bases: [] }; const v = i => { if (i + 1 >= argv.length) { console.error('missing value after ' + argv[i]); process.exit(2); } return argv[i + 1]; };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === '--goh') o.goh = v(i++); else if (x === '--base') o.bases.push(v(i++)); else if (x === '--game') o.game = v(i++); else if (x === '--entity') (o.entities = o.entities || []).push(v(i++));
    else if (x === '--json') o.json = true; else if (x === '--prove') o.prove = true; else if (x === '--even') o.even = true; else if (x === '--sample') o.sample = parseInt(v(i++), 10); else if (x === '--seed') o.seed = parseInt(v(i++), 10);
    else if (x === '--out') o.out = v(i++); else if (x === '--root') o.root = v(i++);
    else if (x === '--exe') { const g = games.get(v(i++)); if (!g) { console.error('--exe must be one of as64|mowas_2|mowas2|goh'); process.exit(2); } o.exe = g.exe; }
    else { console.error('unknown argument ' + x); process.exit(2); }
  }
  return o;
}
const games = require('../lib/games');
// the donor pool is vanilla AS2: GoH is the port's source, never its donor
const GOH_WHY = 'the donor pool is vanilla AS2 units (AS64 or MoW:AS2); GoH is the source of the port (--goh), not a donor game';
const GOH_ROW = 'plan/reports/donor-1.md';

function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.exe === 'goh') { games.refuse('donorpick', 'goh', GOH_WHY, GOH_ROW); return; }
  if (o.exe && !o.game) o.game = games.install(o.exe).dir || undefined;
  if (!o.goh || !o.game || (!o.entities && !o.prove && !o.sample)) { console.error('usage: donorpick --goh <GoH mod dir> [--base <GoH dir>] --game <AS2 dir> (--entity <name> | --prove | --sample N --seed S --out file.json) [--json] [--exe as64|mowas_2]'); process.exit(2); }
  if (o.sample && (!o.out || !Number.isInteger(o.seed))) { console.error('--sample needs --seed and --out'); process.exit(2); }
  const src = gohSource(o.goh, o.bases), pool = o.prove || o.entities || o.sample ? vanillaPool(o.game, o.exe) : [];
  const known = JSON.parse(fs.readFileSync(KNOWN, 'utf8'));
  const run = name => {
    const keys = findKeys(src, name); if (!keys.length) return { entity: name, class: null, donor: null, confidence: 'unplaced', reason: 'UNPLACED: no GoH def matches ' + name };
    const rep = repFromKey(src, keys[0]); const res = rep.cls && rep.cls !== 'infantry' ? pick(rep, pool) : {};
    const d = describe(rep, res); if (keys.length > 1) d.reason += `; ${keys.length} defs match, used ${keys[0]}`; d.key = keys[0]; return d;
  };
  if (o.entities) {
    const outs = o.entities.map(run);
    if (o.json) console.log(JSON.stringify(outs.length === 1 ? outs[0] : outs, null, 1));
    else for (const d of outs) console.log(`${d.entity}: class ${d.class}; weapon ${d.weapon || '-'} ${d.calibre_mm || '-'} mm; crew ${d.crew}; donor ${d.donor || '(none)'}; ${d.confidence}; ${d.reason}`);
    return;
  }
  if (o.prove) {
    let agree = 0, n = 0; const rows = [];
    for (const [rep, k] of Object.entries(known)) {
      if (rep.startsWith('_')) continue;
      const d = run(rep), want = k.donor === null ? [] : [k.donor, ...(k.alt || [])];
      const ok = want.length ? want.includes(d.donor) : d.class === 'infantry';
      n++; if (ok) agree++;
      rows.push({ rep, want: want.join('|') || '(none)', got: d.donor || '(none)', class: d.class, ok, confidence: d.confidence, weapon: d.weapon, cal: d.calibre_mm, reason: d.reason });
    }
    if (o.json) console.log(JSON.stringify({ agree, n, rows }, null, 1));
    else { for (const r of rows) console.log(`${r.ok ? 'ok  ' : 'MISS'} ${r.rep}: want ${r.want}, got ${r.got} [${r.confidence}] ${r.ok ? '' : r.reason}`); console.log(`agreement ${agree} of ${n}`); }
    return;
  }
  // --sample: delta units = defs in the mod folder itself (not --base)
  const root = o.root || path.join(__dirname, '..', '..');
  const held = reportTokens(root); for (const r of Object.keys(known)) held.add(r.toLowerCase());
  const units = [], skipped = { held: 0, noClass: 0, stub: 0, infantry: 0 };
  for (const k of src.own.map.keys()) {
    if (!k.endsWith('.def') || !/^entity\/(-vehicle|humanskin)\//.test(k)) continue;
    const stem = k.slice(k.lastIndexOf('/') + 1, -4);
    const raw = src.read(k); if (!raw || !/game_entity/i.test(raw)) continue;
    if (!/\(\s*include\s/i.test(raw) || /\/x\//.test(k)) { skipped.stub++; continue; }   // stub variants (_x/_xx: a second mdl path and a volume or two), not units
    const rep = repFromKey(src, k); if (!rep || !rep.cls) { skipped.noClass++; continue; }
    if (rep.cls === 'infantry') { skipped.infantry++; continue; }   // skins need no donor, so they are not VOL-1 donor work
    if (!rep.hasMdl) continue;
    if (held.has(stem.toLowerCase())) { skipped.held++; continue; }
    units.push({ stem, cls: rep.cls, key: k });
  }
  const { chosen, counts, alloc } = draw(units, o.sample, o.seed, o.even);
  const rows = chosen.map(u => { const d = run(u.key); return { rep: u.stem, class: d.class, donor: d.donor, crew: d.crew, confidence: d.confidence }; });
  fs.writeFileSync(o.out, JSON.stringify(rows, null, 1) + '\n');
  const info = { pool: counts, drawn: alloc, skipped, wrote: rows.length };
  if (o.json) console.log(JSON.stringify(info)); else console.log(`sample: pool ${JSON.stringify(counts)} drawn ${JSON.stringify(alloc)} held-out/skipped ${JSON.stringify(skipped)}; wrote ${rows.length} rows to ${o.out}`);
}

module.exports = { features, stemCal, calOf, withIncludes, classOfKey, score, pick, wnorm, wlen, snorm, draw, allocate, allocateEven, rng, describe, vanillaPool, gohSource, repFromKey, findKeys, parseArgs };
if (require.main === module) main();

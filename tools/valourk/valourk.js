#!/usr/bin/env node
// Author: Imperator_Aug (ARSENAL, ia-b15679de)
'use strict';
// VALOUR-K: no-game grade. For each stem in both GoH Valour and AS2 Valour: the values goh2as2 would write (translate.js, asking off)
// against the AS2 Valour unit's own. A difference flags a unit for review, not a fault (PORT-95): Valour is a reference, not a port. Every number is [I]/[T]: no game ran.
//   node tools/valourk/valourk.js [--sample N] [--out DIR] [--goh-mod D --goh D --as2-mod D --as2 D] [--table F] [--only substr]
//   pairs: vehicle .def whose stem = folder name, unique on both sides; AS2 side read through <mod>/N.pat overlays (pairdiff.collect), includes fall back to the game dir.
//   donor = a synthetic def holding the keys translate writes (4-slot armour macro), so the written value is read back from res.wrote; the AS2 unit's own value comes from the same xlate.extract reader.
//   compared: armour (per face, aggregate the rule picks), speed, turn_time, start_time, mass, fuel, crew count, gun/turret limits (bones in both), gun penetration (main-gun slot paired by place name, else first calibre-named weapon).
require('../lib/help')(__filename); // --help / -h: header usage, exit 0 (HELPFIX2)
const fs = require('fs'), path = require('path');
const TR = require('../goh2as2/translate.js');
const XL = require('../xlate/xlate.js');

const TOL = 0.25;
const TIGHT = k => /^armor_|^speed$|^pen_/.test(k) || /^armor/.test(k);   // sheet Q53
const within = (pred, as2) => as2 === 0 || as2 == null ? pred === as2 : Math.abs(pred / as2 - 1) <= TOL;
const limOk = (a, b) => a.length === b.length && a.every((x, i) => Math.abs(x - b[i]) <= Math.max(1, TOL * Math.max(Math.abs(x), Math.abs(b[i]))));

const SYN = `{game_entity "x"\r\n\t{mass 1}\r\n\t{Locomotion {MaxSpeed 1} {TurnTime 1} {StartTime 1}}\r\n\t{fuelbag {volume 1}}\r\n\t("armor_medium" turret(1 1 1 1) body(1 1 1 1))\r\n}\r\n`;

function limitsOf(src) {
  const out = new Map();
  for (const m of src.matchAll(/\{\s*bone\s+"([^"\r\n]+)"/ig)) {
    const e = TR.blockEnd(src, m.index); if (e < 0) continue;
    const l = /\{\s*limits((?:\s+-?[\d.]+)*)\s*\}/i.exec(src.slice(m.index, e));
    if (l) out.set(m[1].toLowerCase(), (l[1].match(/-?\d+(?:\.\d+)?/g) || []).map(Number));
  }
  return out;
}
const WRE = /\{\s*weapon\s+"([^"\r\n]+)"|"(weapon\s+[^"\r\n]+)"/gi;
const calOf = n => { const m = /(\d+)\s*mm/i.exec(n) || /mortar(\d+)/i.exec(n); return m ? parseInt(m[1], 10) : 0; };
const gunName = src => { for (const m of src.matchAll(WRE)) { const n = (m[1] || m[2]).trim().replace(/^weapon\s+/i, '').toLowerCase(); if (calOf(n)) return n; } return null; };
// weapons with the {place} slot that holds them (nearest place before the weapon line)
const PRE = /\{\s*place\s+"?([^\s"}]+)/gi;
const slotsOf = src => {
  const pl = [...src.matchAll(PRE)].map(m => ({ i: m.index, n: m[1].toLowerCase() })), out = [];
  for (const m of src.matchAll(WRE)) { let p = null; for (const x of pl) if (x.i < m.index) p = x.n; else break; out.push({ name: (m[1] || m[2]).trim().replace(/^weapon\s+/i, '').toLowerCase(), place: p }); }
  return out;
};
const MAINSLOT = p => !!p && !/mg|coax|aa|smoke|pistol/.test(p) && /gun|main|cannon|turret|weapon/.test(p);
// main-gun pair (VALOUR-K): the weapon in the GoH main slot against the weapon in the AS2 slot of the same name, else the AS2 main slot;
// a side with no main slot falls back to the first calibre-named weapon. Returns { goh, as2, slot } names (or null), slot = shared place name.
function gunPair(gohAll, as2All) {
  const g = slotsOf(gohAll), a = slotsOf(as2All);
  const gm = g.find(w => MAINSLOT(w.place)) || null;
  const am = (gm && a.find(w => w.place === gm.place)) || a.find(w => MAINSLOT(w.place)) || null;
  return { goh: gm ? gm.name : gunName(gohAll), as2: am ? am.name : gunName(as2All), slot: gm && am && gm.place === am.place ? gm.place : null };
}

// P: { stem, gohKey, as2Key, grec, arec, gohAll, as2All, gpen:{dir,pen_a..}|null, apen }  T: table (loaded). Returns { cls, rows, asked, skipped }
function compareUnit(P, T) {
  const gcls = TR.classOfKey(P.gohKey), acls = P.as2Key.split('/')[2];
  const info = [], res = TR.translate({
    text: SYN, repAll: P.gohAll, repKey: P.gohKey, donorKey: `resource/entity/-vehicle/${acls}/${P.stem}/${P.stem}.def`, vf: { files: new Map() }, vfsLib: null, types: null, unit: P.stem,
    opt: { ask: 'off', dropLimits: false }, extract: () => P.grec, add: () => {}, info: (c, m) => info.push(c + ' ' + m),
  });
  // armour truth: armourRead (XLATE-3 reader: the part's own area/volumes, keys armor_<part>_<face>) over xlate's k (old _max/_med keys, used if translate fell back to the old rule)
  const rows = [], cls = res.cls || null, ak = Object.assign({}, P.arec.k, P.as2Armour || {});
  if (!cls) return { cls: acls, rows, asked: [], skipped: ['class'], gcls, acls };
  for (const w of res.wrote) {
    if (ak[w.key] === undefined) continue;   // the AS2 unit has no such number (own macro / none): nothing to compare
    if (!/^(armor_|speed$|turn_time$|start_time$|mass$|fuel$)/.test(w.key)) continue;
    rows.push({ key: w.key, goh: w.goh, pred: +w.value, as2: ak[w.key], ok: within(+w.value, ak[w.key]), note: w.note });
  }
  // crew
  const rc = TR.crewCount(P.gohAll), dc = TR.crewCount(P.as2All);
  if (rc && dc) rows.push({ key: 'crew', goh: rc, pred: rc, as2: dc, ok: within(rc, dc) });
  // gun and turret limits: bones named in both
  const gl = limitsOf(P.gohAll), al = limitsOf(P.as2All);
  for (const [nm, g] of gl) {
    if (!/turret|gun|mgun|mount/i.test(nm) || !al.has(nm)) continue;
    const a = al.get(nm); rows.push({ key: 'limits ' + nm, goh: g.join(' '), pred: g.join(' '), as2: a.join(' '), ok: limOk(g, a) });
  }
  // penetration: the translated value of the GoH gun against the AS2 gun
  if (P.gpen && P.apen) {
    const F = T.factors['w:' + P.gpen.dir];
    for (const key of ['pen_a', 'pen_c', 'pen_e']) {
      if (!F || !F[key] || P.gpen[key] === undefined || P.apen[key] === undefined) continue;
      const pr = TR.predict(F[key], P.gpen[key]);
      rows.push({ key, goh: P.gpen[key], pred: +(+pr).toFixed(1), as2: P.apen[key], ok: within(pr, P.apen[key]), note: `gun ${P.gpen.name} vs ${P.apen.name}` + (P.apen.slot ? ` (slot ${P.apen.slot})` : ' (no shared slot)') });
    }
  }
  return { cls, gcls, acls, rows, asked: res.asked, skipped: res.skipped, armour: res.armour ? res.armour.rule : null };
}

// ---- summary: per class share within 25%, keys ranked by flags, prompt count
function summarize(units) {
  const byCls = {}, keys = {}, prompts = { units: 0, by_class: {}, by_key: {} };
  for (const u of units) {
    const c = byCls[u.cls] || (byCls[u.cls] = { units: 0, rows: 0, ok: 0, tight_rows: 0, tight_ok: 0, flagged_units: 0, prompt_units: 0 });
    c.units++;
    let fl = false;
    for (const r of u.rows) {
      c.rows++; if (r.ok) c.ok++; else fl = true;
      if (TIGHT(r.key)) { c.tight_rows++; if (r.ok) c.tight_ok++; }
      const kk = r.key.replace(/^limits .*/, 'limits'), k = keys[kk] || (keys[kk] = { n: 0, flag: 0, byCls: {} });
      k.n++; if (!r.ok) { k.flag++; k.byCls[u.cls] = (k.byCls[u.cls] || 0) + 1; }
    }
    if (fl) c.flagged_units++;
    if (u.asked.length) {
      c.prompt_units++; prompts.units++; prompts.by_class[u.cls] = (prompts.by_class[u.cls] || 0) + 1;
      for (const a of new Set(u.asked.map(x => x.split(':')[1].replace(/ (engine|scale)$/, '')))) prompts.by_key[a] = (prompts.by_key[a] || 0) + 1;
    }
  }
  for (const c of Object.values(byCls)) { c.share_within25 = c.rows ? +(c.ok / c.rows).toFixed(3) : null; c.tight_share_within25 = c.tight_rows ? +(c.tight_ok / c.tight_rows).toFixed(3) : null; }
  const ranked = Object.entries(keys).map(([key, v]) => ({ key, n: v.n, flagged: v.flag, flag_rate: +(v.flag / v.n).toFixed(3), tight: TIGHT(key) })).sort((a, b) => b.flagged - a.flagged || b.flag_rate - a.flag_rate);
  return { by_class: byCls, keys_ranked: ranked, prompts };
}

// ---- reading the two mods
const decode = b => b[0] === 0xFF && b[1] === 0xFE ? b.toString('utf16le') : b.toString('latin1');
function sideText(side, readEnt) {
  const get = k => { const e = side.map.get(k) || (side.base && side.base.map.get(k)); return e ? decode(readEnt(e)) : null; };
  const gather = (src, dir, depth = 0, seen = new Set()) => {
    let all = src; if (depth >= 3) return all;
    for (const m of src.matchAll(/(?:include|extension)\s+"([^"\r\n]+)"/gi)) {
      const t = m[1].replace(/\\/g, '/'); if (/^\/?properties\//i.test(t) || t.startsWith('$/')) continue;
      const ik = (t.startsWith('/') ? t.slice(1) : path.posix.normalize(dir + '/' + t)).toLowerCase();
      if (seen.has(ik)) continue; seen.add(ik);
      let s2 = null; try { s2 = get(ik); } catch { /* unreadable include */ }
      if (s2) all += '\n' + gather(s2, ik.slice(0, ik.lastIndexOf('/')), depth + 1, seen);
    }
    return all;
  };
  return { get, text: key => { const s = get(key); return s === null ? null : gather(s, key.slice(0, key.lastIndexOf('/'))); } };
}
function pairs(G, A) {
  const mk = (side, game) => {
    const m = new Map();
    for (const k of side.map.keys()) {
      if (!k.startsWith('entity/-vehicle/') || !k.endsWith('.def')) continue;
      const p = k.split('/'), stem = p[p.length - 1].slice(0, -4);
      if (p[p.length - 2] !== stem || p.length < (game === 'goh' ? 6 : 5)) continue;
      (m.get(stem) || m.set(stem, []).get(stem)).push(k);
    }
    return m;
  };
  const g = mk(G, 'goh'), a = mk(A, 'as2'), out = []; let ambiguous = 0;
  for (const [stem, gl] of g) { const al = a.get(stem); if (!al) continue; if (gl.length === 1 && al.length === 1) out.push({ stem, gohKey: gl[0], as2Key: al[0] }); else ambiguous++; }
  out.sort((x, y) => x.as2Key < y.as2Key ? -1 : 1);
  return { pairs: out, ambiguous, goh_stems: g.size, as2_stems: a.size };
}
function weaponFacts(side, readEnt, name) {
  if (!name) return null;
  const re = new RegExp('^set/stuff/([^/]+)/' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\.weapon)?$');
  let hit = null; for (const k of side.map.keys()) { const m = re.exec(k); if (m) { hit = { key: k, dir: m[1] }; break; } }
  if (!hit) return null;
  const game = side === side.__goh ? 'goh' : 'as2';
  const r = XL.extract(side, game, { key: hit.key, stem: name, cls: 'w:' + hit.dir, scope: 'weapon' }, 'valour');
  return r ? Object.assign({ dir: hit.dir, name }, r.k) : null;
}

function main() {
  const av = process.argv.slice(2), o = {
    gohMod: null, goh: null, as2Mod: null, as2: null,
    out: path.join(__dirname, '..', '..', '..', 'run', 'valourk'), sample: 0, only: null,
  };
  for (let i = 0; i < av.length; i++) { const a = av[i]; if (a === '--sample') o.sample = +av[++i]; else if (a === '--out') o.out = av[++i]; else if (a === '--goh-mod') o.gohMod = av[++i]; else if (a === '--goh') o.goh = av[++i]; else if (a === '--as2-mod') o.as2Mod = av[++i]; else if (a === '--as2') o.as2 = av[++i]; else if (a === '--table') o.table = av[++i]; else if (a === '--only') o.only = av[++i]; }
  // defaults: the installs through lib/games (gamedir); the two Valour workshop items in each install's own Steam library
  const games = require('../lib/games'), ws = (dir, app, id) => dir ? path.join(dir, '..', '..', 'workshop', 'content', app, id) : null;
  o.goh = o.goh || games.install('goh').dir; o.as2 = o.as2 || games.install('as64').dir;
  o.gohMod = o.gohMod || ws(o.goh, '400750', '2537987794'); o.as2Mod = o.as2Mod || ws(o.as2, '244450', '455424236');
  for (const [k, n] of [['goh', '--goh'], ['as2', '--as2'], ['gohMod', '--goh-mod'], ['as2Mod', '--as2-mod']]) if (!o[k] || !fs.existsSync(o[k])) { console.error(`valourk: ${n} not found (give it)`); process.exit(2); }
  const pd = require('../pairdiff/pairdiff.js'), pakset = require('../lib/pakset');
  const readEnt = e => e.path ? fs.readFileSync(e.path) : pakset.read(e);
  const T = TR.loadTable(o.table);
  const G = pd.collect(o.gohMod); G.base = pd.collect(o.goh); G.__goh = G;
  const A = pd.collect(o.as2Mod); A.base = pd.collect(o.as2);
  const gt = sideText(G, readEnt), at = sideText(A, readEnt);
  // armourRead wants a vfs-like pair: files.get(key) -> entry, readRec(entry) -> bytes (AS2 mod overlays first, then the game dir)
  const avf = { files: { get: k => { const kk = k.replace(/^resource\//, '').toLowerCase(); return A.map.get(kk) || A.base.map.get(kk); } } }, avfLib = { readRec: readEnt };
  let { pairs: list, ambiguous, goh_stems, as2_stems } = pairs(G, A);
  const total = list.length;
  if (o.only) list = list.filter(p => p.as2Key.includes(o.only));
  if (o.sample) { const n = Math.min(o.sample, list.length); list = Array.from({ length: n }, (_, i) => list[Math.floor(i * list.length / n)]); }
  const units = []; let bad = 0;
  for (const p of list) {
    try {
      const grec = XL.extract(G, 'goh', { key: p.gohKey, stem: p.stem, cls: TR.classOfKey(p.gohKey), scope: 'vehicle' }, 'valour');
      const arec = XL.extract(A, 'as2', { key: p.as2Key, stem: p.stem, cls: p.as2Key.split('/')[2], scope: 'vehicle' }, 'valour');
      if (!grec || !arec) { bad++; continue; }
      const gohAll = gt.text(p.gohKey), as2All = at.text(p.as2Key);
      const gp = gunPair(gohAll, as2All), gpen = weaponFacts(G, readEnt, gp.goh), apen = weaponFacts(A, readEnt, gp.as2);
      if (apen) apen.slot = gp.slot;
      let as2Armour = {}; try { as2Armour = TR.armourRead(decode(readEnt(A.map.get(p.as2Key))), p.as2Key, avf, avfLib); } catch { /* armour left to xlate's k */ }
      const r = compareUnit({ stem: p.stem, gohKey: p.gohKey, as2Key: p.as2Key, grec, arec, gohAll, as2All, gpen, apen, as2Armour }, T);
      units.push(Object.assign({ stem: p.stem }, r));
    } catch (e) { bad++; if (process.env.VK_DEBUG) console.error(p.stem, e.stack); }
  }
  const sum = summarize(units);
  sum.meta = { pairs_total: total, pairs_run: list.length, compared_units: units.length, unreadable: bad, ambiguous_stems: ambiguous, goh_stems, as2_stems, tolerance: TOL, asking: 'off', sample: o.sample || null, note: 'differences flag review, not fault (PORT-95); all [I]' };
  fs.mkdirSync(o.out, { recursive: true });
  const tag = o.sample ? 'sample' : 'all';
  fs.writeFileSync(path.join(o.out, `rows-${tag}.jsonl`), units.flatMap(u => u.rows.map(r => JSON.stringify(Object.assign({ stem: u.stem, cls: u.cls }, r)))).join('\n') + '\n');
  fs.writeFileSync(path.join(o.out, `units-${tag}.jsonl`), units.map(u => JSON.stringify({ stem: u.stem, cls: u.cls, gcls: u.gcls, acls: u.acls, nrows: u.rows.length, flagged: u.rows.filter(r => !r.ok).map(r => r.key), asked: u.asked, armour_rule: u.armour, skipped: u.skipped })).join('\n') + '\n');
  fs.writeFileSync(path.join(o.out, `summary-${tag}.json`), JSON.stringify(sum, null, 1));
  console.log(`valourk: ${total} pairs (${ambiguous} stems ambiguous), ran ${list.length}, compared ${units.length}, unreadable ${bad}`);
  for (const [c, v] of Object.entries(sum.by_class).sort()) console.log(`N ${c}: units ${v.units}, within25 ${v.share_within25} of ${v.rows} values, tight ${v.tight_share_within25} of ${v.tight_rows}, flagged units ${v.flagged_units}, prompt units ${v.prompt_units}`);
  console.log('flag ranking: ' + sum.keys_ranked.slice(0, 14).map(k => `${k.key} ${k.flagged}/${k.n}`).join(', '));
  console.log(`prompts with asking off: ${sum.prompts.units} units`);
  G.close(); A.close(); G.base.close(); A.base.close();
}
if (require.main === module) main();
module.exports = { compareUnit, summarize, limitsOf, gunName, gunPair, slotsOf, within, pairs, sideText, SYN };

#!/usr/bin/env node
// rzsys: apply the "joins a donor-mod rule set" list to a vanilla unit the donor mod does not cover (or a ported unit).
// No donor data lives here: tables, ratios and shared files are read from --robz at run time. Donor + vanilla folders are read-only.
//   node tools/rzsys/rzsys.js --unit <def path | vanilla unit name> --robz <mod folder> --vanilla <resource> --out <folder> [--report] [--deps]
// Output (text cp1251 latin1-passthrough + CRLF): <out>/<unit key>.def, derived gun rows <out>/set/stuff/gun/*, tier-tagged ammo <out>/set/stuff/shell/*.ammo.
// Everything it guesses is tagged [I]; things it cannot give are listed under GAPS, never filled silently.
// Author: Imperator_Aug (ARSENAL, ia-6e598d86)
'use strict';
require('../lib/help')(__filename); // --help / -h: header usage, exit 0 (HELPFIX2)
const fs = require('fs'), path = require('path');
const pakset = require('../lib/pakset');

// ---------- stores: .pak files (pakset) plus loose files (tests, unpacked mods) ----------
function openStore(root) {
  const map = new Map();
  let p = null;
  try { p = pakset.open(root, {}); } catch (e) { p = null; }
  if (p) for (const e of p.entries) map.set(e.key, () => pakset.read(e));
  (function walk(dir, rel) {
    let ds; try { ds = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    for (const d of ds) {
      const f = path.join(dir, d.name), k = (rel ? rel + '/' : '') + d.name.toLowerCase();
      if (d.isDirectory()) walk(f, k);
      else if (!/\.pak$/i.test(d.name)) map.set(k, () => fs.readFileSync(f));
    }
  })(root, '');
  return {
    root, map,
    has: k => map.has(k),
    raw: k => (map.has(k) ? map.get(k)() : null),
    text: k => (map.has(k) ? map.get(k)().toString('latin1') : null),
    keys: () => [...map.keys()],
  };
}

const median = a => { const r = a.filter(v => isFinite(v)).sort((x, y) => x - y); return r.length ? r[r.length >> 1] : null; };
const mode = a => { const c = new Map(); for (const v of a) c.set(v, (c.get(v) || 0) + 1); let b = null, n = 0; for (const [k, v] of c) if (v > n) { b = k; n = v; } return b; };
const crlf = s => s.replace(/\r?\n/g, '\r\n');
const lc = s => s.toLowerCase();

// ---------- parsing helpers ----------
const RX_DMG = /\(\s*"(damage2?|damage(?:_\d+)?)"\s*a\((\d+)\)\s*b\((\d+)\)\s*c\((\d+)\)\s*d\((\d+)\)\s*e\((\d+)\)(?:\s*range\((\d+)\))?\s*\)/;
function topOf(s) { return s.split(/\{parameters/)[0]; }
function gunParams(s) {
  const top = topOf(s), o = {};
  let m;
  if ((m = top.match(RX_DMG))) { o.macro = m[1]; o.dmg = m.slice(2, 7).map(Number); }
  if ((m = top.match(/\{range\s+(\d+)\s+(\d+)/))) o.range = +m[1];
  if ((m = top.match(/\{rechargeTime\s+([\d.]+)/))) o.rt = +m[1];
  if ((m = top.match(/\{from\s+"([^"]+)"/))) o.from = m[1];
  return o;
}
const calOf = n => { const m = /^(\d+)mm/.exec(n) || /^bullet(\d+)/.exec(n); return m ? +m[1] : null; };

// ---------- tables learned from the donor at run time ----------
function learn(rz, van) {
  const T = { dmgRatio: [], rangeRatio: null, rtRatio: null, macroByCal: new Map(), tierByCalPat: new Map(), weaponsByCal: new Map(), n: {} };
  const gk = rz.keys().filter(k => /^set\/stuff\/gun\/[^./]+$/.test(k));
  const bands = [[], [], [], [], []], rr = [], tr = [], macros = new Map();
  for (const k of gk) {
    const b = gunParams(rz.text(k));
    const n = k.split('/').pop(), cal = calOf(n);
    if (b.macro && cal != null) { if (!macros.has(cal)) macros.set(cal, []); macros.get(cal).push(b.macro); }
    if (!van.has(k)) continue;
    const a = gunParams(van.text(k));
    if (a.dmg && b.dmg) for (let i = 0; i < 5; i++) if (a.dmg[i]) bands[i].push(b.dmg[i] / a.dmg[i]);
    if (a.range && b.range) rr.push(b.range / a.range);
    if (a.rt && b.rt) tr.push(b.rt / a.rt);
  }
  T.dmgRatio = bands.map(median);
  T.rangeRatio = median(rr); T.rtRatio = median(tr);
  for (const [cal, l] of macros) T.macroByCal.set(cal, mode(l.filter(x => /^damage_\d+$/.test(x))) || mode(l));
  T.n = { guns: gk.length, dmg: bands[0].length, range: rr.length, rt: tr.length };
  // ammo tier tags by (calibre, pattern)
  const tiers = new Map();
  for (const k of rz.keys().filter(k => /^set\/stuff\/shell\/bullet[^/]+\.ammo$/.test(k))) {
    const s = rz.text(k), pat = (/\{from\s+"pattern\s+([^"]+)"/.exec(s) || [])[1], cal = calOf(k.split('/').pop());
    if (!pat || cal == null) continue;
    const tg = (/\{tag\s+([^}]*)\}/.exec(s) || [, ''])[1].match(/"([^"]+)"/g) || [];
    const tier = tg.map(x => x.slice(1, -1)).filter(x => /^(shell_|heat_|highvel_|cumulative_)/.test(x)).sort().join(' ');
    const kk = pat + '|' + cal;
    if (!tiers.has(kk)) tiers.set(kk, []);
    tiers.get(kk).push(tier);
  }
  for (const [kk, l] of tiers) T.tierByCalPat.set(kk, mode(l));
  // cannon weapon-size props by calibre, from donor cannon unit defs
  const wp = new Map();
  for (const k of rz.keys().filter(k => /^entity\/-vehicle\/cannon\/[^/]+\/[^/]+\.def$/.test(k))) {
    const s = rz.text(k), p = /\{props\s+([^}]*)\}/.exec(s);
    if (!p) continue;
    const w = /"(small_weapons|medium_weapons|big_weapons)"/.exec(p[1]);
    const g = /\{weapon\s+"(\d+)mm/.exec(s);
    if (w && g) { const c = +g[1]; if (!wp.has(c)) wp.set(c, []); wp.get(c).push(w[1]); }
  }
  for (const [c, l] of wp) T.weaponsByCal.set(c, mode(l));
  return T;
}
function nearest(map, cal) {
  let best = null, bd = 1e9;
  for (const k of map.keys()) { const d = Math.abs(k - cal); if (d < bd || (d === bd && k > best)) { best = k; bd = d; } }
  return best == null ? null : { cal: best, v: map.get(best), exact: best === cal };
}

// ---------- main ----------
function resolveUnit(unit, van) {
  if (fs.existsSync(unit) && fs.statSync(unit).isFile()) {
    const name = path.basename(unit).replace(/\.def$/i, '').toLowerCase();
    return { name, key: null, text: fs.readFileSync(unit).toString('latin1'), ported: true };
  }
  const n = lc(unit).replace(/\.def$/, '');
  const hit = van.keys().filter(k => k.endsWith('.def') && (k === n + '.def' || k.endsWith('/' + n + '/' + n + '.def')));
  if (hit.length !== 1) throw new Error(hit.length ? 'ambiguous unit ' + unit + ': ' + hit.join(', ') : 'unit not found in vanilla: ' + unit);
  return { name: n, key: hit[0], text: van.text(hit[0]), ported: false };
}

function inside(child, parent) {
  const a = path.resolve(child).toLowerCase() + path.sep, b = path.resolve(parent).toLowerCase() + path.sep;
  return a.startsWith(b);
}

function writeText(out, key, text, written) {
  const f = path.join(out, key);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, Buffer.from(crlf(text), 'latin1'));
  written.push(key);
}

function run(o) {
  const R = { lines: [], gaps: [], written: [], rules: {}, covered: false };
  const say = (rule, tag, msg) => { R.lines.push(`${rule} [${tag}] ${msg}`); (R.rules[rule] = R.rules[rule] || []).push(tag); };
  const gap = m => R.gaps.push(m);
  if (!o.out) throw new Error('--out is required');
  for (const d of [o.robz, o.vanilla]) if (inside(o.out, d) || inside(d, o.out)) throw new Error('refusing --out inside/around donor folder ' + d);
  const rz = openStore(o.robz), van = openStore(o.vanilla);
  const u = resolveUnit(o.unit, van);
  R.unit = u.name;
  if (u.key && rz.has(u.key)) { R.covered = true; R.lines.push(`unit ${u.name}: the donor already has ${u.key}; nothing to apply`); return R; }
  const T = learn(rz, van);
  R.tables = { dmgRatio: T.dmgRatio, rangeRatio: T.rangeRatio, rtRatio: T.rtRatio, n: T.n };
  let def = u.text;
  const outKey = u.key || ('entity/-vehicle/ported/' + u.name + '/' + u.name + '.def');

  // R1: class / dispatch
  const incs = [...def.matchAll(/\(include\s+"\/?properties\/([^"]+)"/g)].map(m => m[1]);
  const propsM = /\{props\s+([^}]*)\}/.exec(def);
  const props = propsM ? (propsM[1].match(/"([^"]+)"/g) || []).map(x => x.slice(1, -1)) : [];
  const has = n => incs.some(i => i.replace(/\.ext$/, '') === n);
  const kind = has('human') ? 'human' : has('armoredcar') ? 'armoredcar' : (has('tank') || has('tank_unarmed')) ? 'tank' : has('car') || has('car1') ? 'car' : has('cannon') ? 'cannon' : 'other';
  const deps = new Set();
  const modBlock = (file, name) => { const t = rz.text('set/interaction_entity/' + file); deps.add('set/interaction_entity/' + file); return !!t && t.includes('{"' + name + '"'); };
  let newProps = props.slice();
  if (kind === 'human') {
    say('R6', 'I', 'infantry: includes human.ext, nothing per-unit to apply; the donor human.ext/human.inc carry the system');
    deps.add('properties/human.ext'); deps.add('set/interaction_entity/human.inc');
  } else if (kind === 'tank') {
    const cls = ['light', 'medium', 'heavy'].filter(c => props.includes(c));
    let c = cls[0];
    if (!c) {
      const fm = /tank_(light|medium|heavy)\//.exec(u.key || '');
      if (fm) { c = fm[1]; newProps.unshift(c); say('R1', 'I', `no class prop; added "${c}" from folder name (armour/mass not compared)`); }
      else gap('R1: no light/medium/heavy prop and no class folder; pick the class by armour/weight');
    } else {
      say('R1', 'V', `class prop "${c}" present in the def`);
      say('R1', 'I', `donor block "${c} tank" is picked by props ${c}+tank (tank_unarmed.ext sets "tank"); engine matching of a two-word block name is inferred, not read`);
    }
    if (c) {
      if (modBlock('tank.inc', c + ' tank')) say('R1', 'V', `donor tank.inc has block "${c} tank" (sets ${c}_tank flag, includes tank/tank_${c}.inc)`);
      else gap(`R1: donor tank.inc has no block "${c} tank"`);
      deps.add(`set/interaction_entity/tank/tank_${c}.inc`);
    }
    for (const f of ['penetration_safety', 'damage_counter', 'combat_capable_check', 'blast_safety', 'contact_safety']) deps.add(`set/interaction_entity/tank/safeties/${f}.inc`);
  } else if (kind === 'armoredcar') {
    if (modBlock('tank.inc', 'armored_car')) say('R1', 'V', 'donor tank.inc has block "armored_car" (armoredcar.ext sets the prop)'); else gap('R1: donor tank.inc has no armored_car block');
    deps.add('set/interaction_entity/tank/tank_armoredcar.inc');
  } else if (kind === 'car') {
    if (modBlock('car.inc', 'car')) say('R1', 'V', 'donor car.inc has block "car" (car.ext sets the prop); no class dispatch'); else gap('R1: donor car.inc has no car block');
  } else if (kind === 'cannon') {
    if (modBlock('cannon.inc', 'cannon')) say('R1', 'V', 'donor cannon.inc has block "cannon"'); else gap('R1: donor cannon.inc has no cannon block');
    const sz = ['small_weapons', 'medium_weapons', 'big_weapons'].filter(p => props.includes(p));
    if (!sz.length) {
      const w = /\{weapon\s+"(\d+)mm/.exec(def), cal = w ? +w[1] : null;
      const nn = cal != null ? nearest(T.weaponsByCal, cal) : null;
      if (nn) { newProps.push(nn.v); say('R1', 'I', `cannon: added "${nn.v}" from donor cannons of ${nn.cal}mm${nn.exact ? '' : ' (nearest calibre to ' + cal + 'mm)'}; sets the blast threshold in cannon.inc`); }
      else gap('R1: cannon has no *_weapons prop and no calibre to choose one from');
    } else say('R1', 'V', `cannon already has ${sz[0]}`);
  } else gap('R1: unit kind not recognised (no human/tank/armoredcar/car/cannon ext include); nothing class-specific applied');
  deps.add('set/stuff/gun/.presets');
  // muzzle
  for (const p of props.filter(x => /^muzzle_/.test(x))) {
    const mt = rz.text('set/interaction_entity/muzzle.inc');
    if (mt && mt.includes('{"' + p + '"')) say('R1b', 'V', `muzzle prop ${p} exists in donor muzzle.inc (effects and sound only; no damage lines)`);
    else gap(`R1b: muzzle prop ${p} has no block in donor muzzle.inc (cosmetic; unit fires with no muzzle fx)`);
    deps.add('set/interaction_entity/muzzle.inc');
  }
  if (newProps.join('|') !== props.join('|') && propsM) {
    const q = newProps.map(x => '"' + x + '"').join(' ');
    def = def.replace(propsM[0], '{props ' + q + '}');
  }

  // R2/R3: guns
  const weapons = [...new Set([...def.matchAll(/\{weapon\s+"([^"]+)"/g)].map(m => lc(m[1])))];
  const seenGun = new Set();
  for (const w of weapons) {
    const k0 = 'set/stuff/gun/' + w;
    if (!van.has(k0) && !rz.has(k0)) { if (van.has('set/stuff/mgun/' + w) || van.has('set/stuff/rifle/' + w) || van.has('set/stuff/smg/' + w) || van.has('set/stuff/pistol/' + w) || van.has('set/stuff/rifle/ptr/' + w)) say('R2', 'I', `weapon ${w}: small-arm table (not gun table); left as vanilla`); else gap(`R2: weapon ${w} not found in vanilla gun/mgun/rifle/smg/pistol tables`); continue; }
    // walk the chain; stop at a node the donor covers
    const chain = []; let k = k0, guard = 0;
    while (k && guard++ < 8) {
      if (rz.has(k)) { chain.push({ k, donor: true }); break; }
      if (!van.has(k)) break;
      const t = van.text(k); chain.push({ k, donor: false, t });
      const f = gunParams(t).from;
      k = f && van.has('set/stuff/gun/' + lc(f)) || (f && rz.has('set/stuff/gun/' + lc(f))) ? 'set/stuff/gun/' + lc(f) : null;
    }
    const donorNode = chain.find(c => c.donor);
    if (chain[0].donor) { say('R2', 'V', `gun ${w}: donor table row exists (${chain[0].k}); mounted donor wins, nothing derived`); continue; }
    const mine = chain.filter(c => !c.donor);
    // effective vanilla range for the damage range() arg
    const eff = {}; for (const c of [...mine].reverse()) Object.assign(eff, gunParams(c.t));
    const cal = calOf(w);
    const mm = cal != null ? nearest(T.macroByCal, cal) : null;
    for (const c of mine) {
      if (seenGun.has(c.k)) continue; seenGun.add(c.k);
      let t = c.t, notes = [];
      const rng = eff.range != null ? Math.round(eff.range * (T.rangeRatio || 1)) : 200;
      if (eff.range == null) notes.push('no {range} in vanilla chain, damage range(200) assumed');
      if (!mm) gap(`R2: gun ${w}: no calibre in name, damage macro not chosen; damage lines left as vanilla`);
      t = t.replace(new RegExp(RX_DMG.source, 'g'), (m0, mac, a, b, c2, d, e) => {
        if (!mm) return m0;
        const v = [a, b, c2, d, e].map((x, i) => Math.round(+x * (T.dmgRatio[i] || 1)));
        return `("${mm.v}" a(${v[0]}) b(${v[1]}) c(${v[2]}) d(${v[3]}) e(${v[4]}) range(${rng}))`;
      });
      t = t.replace(/\{range\s+(\d+)\s+(\d+)\s*\}/, (m0, a, b) => `{range ${Math.round(a * T.rangeRatio)} ${Math.round(b * T.rangeRatio)}}`);
      t = t.replace(/\{rechargeTime\s+([\d.]+)\s*\}/, (m0, a) => `{rechargeTime ${+(a * T.rtRatio).toFixed(2)}}`);
      if (/accuracy_curve_1|accuracy_grazinghowitzer2/.test(t)) gap(`R2: ${c.k} uses an accuracy macro the donor presets do not define (accuracy_curve_1 / accuracy_grazinghowitzer2); left, unresolved under donor presets [I]`);
      if (/\("speed"\s*s\(/.test(t)) notes.push('speed macro kept; donor "speed" is x1.0 (vanilla x0.5), effective shell speed about x2');
      writeText(o.out, c.k, t, R.written);
      say('R2', 'I', `gun ${w}: no donor row; wrote ${c.k}: damage ${mm ? mm.v + (mm.exact ? '' : ' (nearest ' + mm.cal + 'mm)') : 'unchanged'} bands x${T.dmgRatio.map(x => (x || 1).toFixed(2)).join('/')}, range x${(T.rangeRatio || 1).toFixed(2)}, recharge x${(T.rtRatio || 1).toFixed(2)}${notes.length ? '; ' + notes.join('; ') : ''}`);
    }
    gap(`R2: gun ${w}: per-gun numbers are scaled by donor medians (spread 0.35-2.4 per gun); real values need per-gun data`);
  }
  if (!weapons.length && kind !== 'human') say('R2', 'I', 'no {weapon} lines in the def');

  // R9: a vanilla selector can mean something else in the donor. robz's tank_bullet names human, cannon and car past close range, no tank class:
  // zsu37 on it stayed silent at a light tank and an armoured car and killed a cannon in the same order. A unit with a gun goes on the donor's "tank" selector, as its small-gun peers are.
  const sel = /(\{targetSelector\s+")([^"]+)("\s*\})/i.exec(def);
  if (sel && sel[2].toLowerCase() !== 'tank' && weapons.some(w => rz.has('set/stuff/gun/' + w) || van.has('set/stuff/gun/' + w))) {
    const st = rz.text('set/target/' + sel[2].toLowerCase() + '.inc');
    if (st && /\{class\s/i.test(st) && !/\{class\s+"?[a-z_]*tank/i.test(st)) {
      if (rz.has('set/target/tank.inc')) { def = def.replace(sel[0], sel[1] + 'tank' + sel[3]); say('R9', 'V', `targetSelector "${sel[2]}": the donor's names no tank class; now "tank"`); }
      else gap(`R9: targetSelector "${sel[2]}" names no tank class and the donor has no tank selector`);
    }
  }

  // R4: ammo tier tags
  const shells = [...new Set([...def.matchAll(/"(?:ammo\s+)?(bullet\d+[^"]*)"/g)].map(m => lc(m[1].trim())))];
  for (const s of shells) {
    const k = 'set/stuff/shell/' + s.replace(/\s+/g, '.') + '.ammo';
    if (rz.has(k)) { say('R4', 'V', `shell "${s}": donor ammo row exists`); continue; }
    if (!van.has(k)) { gap(`R4: shell "${s}" has no vanilla .ammo file (${k}); is it a gun filling prefix?`); continue; }
    const t = van.text(k);
    const isTier = x => /^(shell_|heat_|highvel_|cumulative_)/.test(x);
    const tagLine = t.match(/\{tag\s+([^}]*)\}/);
    const have = tagLine ? (tagLine[1].match(/"([^"]+)"/g) || []).map(x => x.slice(1, -1)) : [];
    const haveTier = have.filter(isTier).sort().join(' ');
    const pat = (/\{from\s+"pattern\s+([^"]+)"/.exec(t) || [])[1], cal = calOf(s);
    // nearest calibre within the same pattern
    const same = new Map(); for (const [kk, v] of T.tierByCalPat) { const [p, c] = kk.split('|'); if (p === pat) same.set(+c, v); }
    const nn = cal != null && pat ? nearest(same, cal) : null;
    if (!nn || !nn.v) {
      if (haveTier) { say('R4', 'I', `shell "${s}": carries ${haveTier}; donor rows for this pattern give no tier, left`); continue; }
      gap(`R4: shell "${s}" (pattern ${pat}, ${cal}mm): no donor row${nn && !nn.v ? ' with a tier (donor rows for this pattern carry none)' : ''}; no tier tag added`); continue;
    }
    if (haveTier === nn.v) { say('R4', 'I', `shell "${s}": tier ${haveTier} already matches donor ${pat} rows at ${nn.cal}mm`); continue; }
    if (!tagLine) { gap(`R4: shell "${s}": no {tag} line to extend`); continue; }
    const tags = nn.v.split(' ');
    const keep = have.filter(x => !isTier(x));
    const out = t.replace(tagLine[0], `{tag ${keep.concat(tags).map(x => '"' + x + '"').join(' ')}}`);
    writeText(o.out, k, out, R.written);
    say('R4', 'I', `shell "${s}": tier ${haveTier || '(none)'} -> ${nn.v} from donor ${pat} rows at ${nn.cal}mm${nn.exact ? '' : ' (nearest calibre)'}`);
  }

  // R5: dependencies
  const present = [...deps].filter(d => rz.has(d));
  const absent = [...deps].filter(d => !rz.has(d));
  say('R5', 'V', `shared files this unit needs from the donor: ${present.length} present${absent.length ? ', ' + absent.length + ' absent' : ''}; mount the donor under the output, or pass --deps to copy them`);
  for (const a of absent) gap('R5: dependency not in donor: ' + a);
  if (o.deps) for (const d of present) { const f = path.join(o.out, d); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, rz.raw(d)); R.written.push(d); }
  R.deps = present;

  // per-unit data the rules can't give (section 6): read from the unit, listed
  const armour = [...def.matchAll(/\("(armor_[a-z_]+)"[^)]*\)/g)].map(m => m[1]);
  gap(`S6: armour kept as the unit has it (${armour.join(', ') || 'no armor_* macro'}); thickness is per-unit data`);
  gap('S6: bone speeds, locomotion, sights, crew seats, ammo counts kept as vanilla; the donor retunes these per unit');
  writeText(o.out, outKey, def, R.written);
  say('R7', 'V', 'report written; guns/shells without a donor row are the GAPS lines');
  return R;
}

function format(R) {
  const L = [`# rzsys ${R.unit}`, ''];
  L.push(...R.lines);
  if (R.tables) L.push('', `tables (from donor common files): damage band ratios ${R.tables.dmgRatio.map(x => x && x.toFixed(2)).join('/')} (n=${R.tables.n.dmg}), range x${R.tables.rangeRatio && R.tables.rangeRatio.toFixed(2)} (n=${R.tables.n.range}), recharge x${R.tables.rtRatio && R.tables.rtRatio.toFixed(2)} (n=${R.tables.n.rt})`);
  if (R.gaps.length) { L.push('', 'GAPS'); L.push(...R.gaps.map(g => '- ' + g)); }
  if (R.written.length) { L.push('', 'WROTE'); L.push(...R.written.map(w => '- ' + w)); }
  return L.join('\n');
}

function main(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--report') a.report = true; else if (t === '--deps') a.deps = true;
    else if (/^--(unit|robz|vanilla|out)$/.test(t)) a[t.slice(2)] = argv[++i];
    else { console.error('unknown arg ' + t); return 2; }
  }
  if (!a.unit || !a.robz || !a.vanilla || !a.out) { console.error('usage: node tools/rzsys/rzsys.js --unit <def|name> --robz <mod folder> --vanilla <resource> --out <folder> [--report] [--deps]'); return 2; }
  let R;
  try { R = run(a); } catch (e) { console.error('rzsys: ' + e.message); return 1; }
  console.log(a.report ? format(R) : `rzsys ${R.unit}: ${R.covered ? 'covered by donor' : R.written.length + ' files, ' + R.gaps.length + ' gaps'}`);
  return 0;
}

module.exports = { run, format, openStore };
if (require.main === module) process.exit(main(process.argv.slice(2)));

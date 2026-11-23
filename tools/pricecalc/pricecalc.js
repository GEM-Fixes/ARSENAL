#!/usr/bin/env node
// pricecalc: price calculator for soldier breeds (MP score, CP, CW) and squad cards, from a price model file (price_model.inc).
// usage: node tools/pricecalc/pricecalc.js <cmd> <modDir> [--game dir] [--model f] [--sheet-mp f --sheet-cp f] [--rules f] [--json] [-o f] [--undo tag] [-q]
//   seed   <mod> -o f          build price_model.inc text from the sheet TSVs + every item the mod's breeds carry. Never overwrites an
//                              existing -o file without --force. --merge: -o (or the mod's model) gets only newly found items, as undetermined
//   calc   <mod>               per breed row: class tier level vet start, effective skill, price parts, calc / mod / sheet mp cp cw;
//                              per squad card: rule, add-on, member sum, calc / current cost. TSV (default) or --json (shape below)
//          --review tiers      instead: the item tier review table (group, item, breeds, count, sides, tier, best guess [I], reason)
//          --review grenades   instead: computed throwable tiers (item, stuff, energy, cumulative, fire, range, fuse, score, tier)
//   review <mod>              same as calc --review tiers
//   fit    <mod>               how many breeds / cards the model reproduces (exact / within 2% / off), biggest gaps, findings
//   plan   <mod>               what apply would write (files, comment lines added / rewritten)
//   apply  <mod> [--set-prices] write `;{price ...}` comment lines above each soldiers.set breed row and each priced card (and the model
//                              file when absent). Hero cards (button hero / paid in SP...) never get a computed-MP line: with the
//                              model's {point_value} `;{price {rule hero} {paid "sp"} {cost N} {point_value P} {mp_worth M}}`, without
//                              one no line (a stale one is removed); --set-prices never rewrites their cost. Undo copies in <mod>/.arsenal-undo/<tag>/ (tag = --undo, default pricecalc-<date>-<time>).
//                              --set-prices (OFF by default): also rewrite the row's level_N reference (reuse a level with the same
//                              cp/score/cw, else a new level_N define) and the card cost(N) (integer)
//   undo   <mod> --undo tag    restore the files of that apply byte for byte (and delete files it created)
//   check  <mod> [--undo tag]  the expanded SDL data of every file the apply touched equals the undo copy (comments only), a second
//                              apply changes nothing, and nothing includes price_model.inc
//   --game dir (or env AS2_GAME): vanilla breeds the mod does not ship are read from the game. Without it: mod files only.
//   --model f: model file (default <mod>/resource/set/multiplayer/units/price_model.inc; absent -> in-memory seed from the sheets)
//   --rules f: the mod's seed rules (picks of one mod: owner item tiers, name patterns, sheet spellings, add-on vehicles, ...).
//     Grammar in rules.js; RobZ: tools/pricecalc/rules/robz.rules.inc. Without it: generic rules (stuff folder -> group) only.
//   --sheet-mp/--sheet-cp: the owner's sheet as cell TSVs (`<cell>\t<value>`). Needed by seed; calc/fit then also show sheet mp/cp.
// codes (fit, findings): UNGROUPED_ITEM (item in no group: priced 0)  TIER_UNDETERMINED (item in a tier "undetermined")
//   NO_PRICE_ROW (card member breed without a soldiers.set row)  NO_BREED_FILE (price row whose breed file does not exist)
//   SHEET_DEFECT (#N/A, MP pasted into CP, stray table value, mojibake)  PAIR_UNDEFINED (breed_vet table/start pair with no table)
//   CARD_RULE_AMBIGUOUS (several vehicles, a vehicle matching several add-ons, a sequence card with no {icon} or no matching
//   {sequence} family)  MODEL_ERROR (model file does not read)
//   NO_PRICE_ROWS (no units/soldiers.set in the mod or the game)  LAYOUT_UNKNOWN (soldiers.set blocks but no "mp/<side>/<breed>" row,
//   or no card file / no {content} card: file + line of the first unknown block)  rules file (stderr, never fatal): RULES_UNKNOWN RULES_EMPTY RULES_REGEX
// no sheet: seed fits each weapon tier's MP / CP tables from the mod's own price rows [I] (median per effective skill level,
//   missing levels interpolated, ends flat); the tier label says how many rows and which levels were measured.
// apply / plan only write files inside the mod folder (rows or cards read from loose game files are listed as "not written").
// library (GUI, tools/gui/ext/balance/prices.js): require('./pricecalc').lib = {open, model, result, plan, apply, undo, check, seed,
//   saveModel, names, latestUndo}; never sets prices. names(s) = in-game card / breed names (libNames below). In-place model text edits: edit.js (applyOps set / move, outline).
// rules: breeds "special" ({special} block: fixed mp/cp/cw) | "sole" (a {sole 1} group item, e.g. radio: that tier only) | "weapon";
//   cards "hand" | "single" | "squad" | "sequence" (buy k of a file+side+icon sequence: members MP x factor x percent_k / 100) [I]
//   info (not counted): CARD_PHANTOM_MEMBER (content names a macro-parameter leftover like "302" or "%n2": skipped)
//   CARD_HAND_PRICED (vehicle/gun card: priced by hand)  DUP_PRICE_ROW (breed priced twice; the last row wins)
//   check: CHECK_DATA_CHANGED CHECK_NOT_IDEMPOTENT CHECK_MODEL_INCLUDED CHECK_NO_UNDO
// --json shape (calc; stable, version 1):
//   { tool:"pricecalc", version:1, mod, model:{file|null, seeded:bool}, vet:[{rank, weapon_skill, health, stamina, ...}] (index 1..5),
//     breeds:[{side, breed, file, line, level, rule:"special"|"sole"|"weapon"|null, special|null, cls, tier, item, skill, skillPerk, vetStart, vetRank, skillEff,
//              parts:{weapon, addon, kit, extras}, calc:{mp, cp, cw}, mod:{mp, cp, cw}, sheet:{mp, cp}|null, fit:"exact"|"near"|"off"|"n/a",
//              fixedCp|null, unpriced:[item], undetermined:[item], items:[{item, group, tier, count, role, mp, level?, price?, throwTier?}]}],
//     cards:[{file, line, name, side, macro, rule:"squad"|"single"|"sequence"|"hand", add|null, addPrice, members, list:[{who, count}], vehicles, mult, factor, calc|null, cost|null,
//             sheet|null, fit, missing:[side/breed], ambiguous|null,
//             seq:{key, icon, step, size, family, percent, base, avgCalc, avgCost, obsPercent (mod cost / buy-1 cost x 100),
//                  pattern:"match"|"differs"|null (mod cost = buy-1 cost x percent_k / percent_1, +-1)}|null}],
//     findings:[{file, line, code, msg, severity}], counts:{CODE:n},
//     added 2026-11 (only new fields): cards[].button (lower case | null), cards[].tags [words], cards[].fore (number | null),
//       cards[].unit = what cost() is paid with: the button's budget in set/multiplayer/games ("mp" = budget vehicle, "sp" = budget hero,
//       else the budget's own name; no presets: button hero = sp, the rest mp), cards[].hero (button hero, or paid with anything but mp),
//       cards[].pointValue (MP per 1 unit: 1 for mp, the model's {point_value} for sp/dp, null = not set), cards[].costMp (cost x pointValue, null = not set),
//       pointValue {sp, dp} | null (the model's {point_value} block), economy {budgets:[{name, res, buttons, start, tag}]} }
//   fit is "exact" when calc equals the mod (mp and cp for breeds, cost for cards), "near" within 2%, else "off". A card paid with
//   another resource than mp (hero button) has fit "n/a": its cost is in that resource, never compared with the MP calc.
// Author: Imperator_Aug (ARSENAL, ia-e5260912)
require('../lib/help')(__filename);
const fs = require('fs'), path = require('path');
const { createReport } = require('../lib/report');
const sdlx = require('../lib/sdlx');
const writeguard = require('../lib/writeguard');
const RL = require('./rules');
const M = require('./mod'), S = require('./sheet'), MD = require('./model'), CL = require('./calc'), C = require('./classify'), G = require('./grenade');

const MODEL_KEY = M.UNITS + 'price_model.inc';

function parseArgs(argv) {
  const o = { cmd: argv[0], mod: null, json: false, quiet: false, force: false, merge: false, setPrices: false };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i], nx = () => argv[++i];
    if (a === '--game') o.game = nx(); else if (a === '--model') o.model = nx(); else if (a === '--sheet-mp') o.sheetMp = nx(); else if (a === '--sheet-cp') o.sheetCp = nx();
    else if (a === '--json') o.json = true; else if (a === '-o') o.out = nx(); else if (a === '--undo') o.undo = nx(); else if (a === '-q') o.quiet = true;
    else if (a === '--force') o.force = true; else if (a === '--merge') o.merge = true; else if (a === '--set-prices') o.setPrices = true;
    else if (a === '--review') o.review = nx(); else if (a === '--rules') o.rules = nx();
    else if (!o.mod) o.mod = a; else throw new Error('unexpected argument ' + a);
  }
  if (!o.game && process.env.AS2_GAME) o.game = process.env.AS2_GAME;
  return o;
}

// ---- gather everything the commands need, once ----
function gather(o) {
  const modDir = path.resolve(o.mod);
  if (!fs.existsSync(modDir)) throw new Error('mod folder not found: ' + modDir);
  const src = M.createModSource({ modDir, gameDir: o.game });
  // gather only reads (nothing is written before it returns): every file is read once for its time (lib/sdlset memo: a breed
  // file includes the same macro and property files as the next one; 7,257 reads for 1,349 files on a big mod). Switched off
  // before gather returns, so a read after a later write (apply, saveModel, the stuff reader) asks the disk as before.
  src.memo(true);
  try { return gather1(o, modDir, src); } finally { src.memo(false); }
}
function gather1(o, modDir, src) {
  const rel = k => { const a = src.local.get(k); return a ? path.relative(modDir, a).split(path.sep).join('/') : k; };
  const pr = M.readPriceRows(src);
  const prYears = M.readPriceRows(src, 'years_soldiers.set');   // 1941-43 year-mode rows: looked up, never written
  const vet = M.readVetEffects(src);
  const idx = M.stuffIndex(src);
  const resCache = new Map();
  const res = n => { if (!resCache.has(n)) resCache.set(n, M.resolveItem(idx, n)); return resCache.get(n); };
  const cards = M.readCards(src);
  const breeds = new Map();
  const getBreed = (side, breed) => { const k = side + '/' + breed; if (!breeds.has(k)) breeds.set(k, M.readBreed(src, side, breed)); return breeds.get(k); };
  const rows = pr ? pr.rows : [];
  for (const r of rows) getBreed(r.side, r.breed);
  for (const c of cards) for (const m of c.members) getBreed(m.side, m.breed);
  // items carried (inventory + armour slots), with where they are used
  const items = new Map();
  const note = (name, from, side, breedKey, count, file, line) => {
    let e = items.get(name);
    if (!e) { e = { res: from.startsWith('armor') ? null : res(name), from, breeds: new Set(), sides: new Set(), count: 0, file, line }; items.set(name, e); }
    e.breeds.add(breedKey); e.sides.add(side); e.count += count;
  };
  for (const [k, b] of breeds) {
    if (!b) continue;
    const side = k.split('/')[0];
    for (const it of b.items) if (!it.loaded) note(it.name, 'inventory', side, k, it.count, rel(b.key), it.line);
    for (const [slot, nm] of Object.entries(b.armor)) if (nm) note(String(nm).toLowerCase(), 'armor_' + slot, side, k, 1, rel(b.key), b.line);
  }
  const stuff = G.createStuffReader(src, res);
  const rules = loadRules(o);
  let eco; try { eco = M.readEconomy(src); } catch (e) { eco = { budgets: [], factors: null, factorSets: [] }; }
  return { o, modDir, src, rel, pr, prYears, vet, idx, res, cards, breeds, getBreed, items, stuff, rules, eco };
}

// --rules f: the mod's seed rules (rules.js grammar); none = generic rules only. Rules errors go to stderr (never fatal)
function loadRules(o) {
  if (!o.rules) return null;
  const f = path.resolve(o.rules);
  if (!fs.existsSync(f)) throw new Error('rules file not found: ' + f);
  const r = RL.readRules(fs.readFileSync(f), f);
  for (const e of r.errs) process.stderr.write(`pricecalc: ${path.basename(f)}:${e.line}: ${e.code} ${e.msg}
`);
  return r;
}
function loadSheets(o) {
  if (!o.sheetMp && !o.sheetCp) return null;
  return S.readSheets(o.sheetMp || null, o.sheetCp || null);
}
function seedText(d, sheet) {
  const sources = [];
  if (d.o.sheetMp) sources.push(path.basename(d.o.sheetMp));
  if (d.o.sheetCp) sources.push(path.basename(d.o.sheetCp));
  const seed = MD.buildSeed({ sheet, items: d.items, sources, priceRows: d.pr ? d.pr.rows : [], cards: d.cards, breeds: d.breeds, rules: d.rules,
    launcherAp: n => { const r = d.res(n); return r ? d.stuff.launcherAp(r.key) : null; } });
  if (!sheet) fitTables(d, seed);
  return { text: MD.writeModel(seed), seed };
}
// no sheet: fill each weapon tier's MP / CP tables from the mod's own price rows [I]. Prices the seed (tables 0) once, then per
// (group, tier, effective skill level) takes the median of the rows' score minus the non-weapon parts, and of their cp. Levels with no
// row are interpolated linearly (ends: nearest measured level); the tier label says how many rows and which levels were measured.
function fitTables(d, seed) {
  const m = MD.readModel(Buffer.from(MD.writeModel(seed), 'latin1'), '(seed)');
  m.lookup = makeLookup(d, m); m.throwTier = makeThrowTier(d, m);
  const r = compute(d, m, null);
  const bins = new Map();
  let used = 0;
  for (const b of r.breeds) {
    if ((b.rule !== 'weapon' && b.rule !== 'sole') || !b.cls || !b.parts || b.fixedCp) continue;
    const g = seed.weapon.get(b.cls); if (!g) continue;
    let t = g.tiers.find(x => x.id === b.tier); if (t && t.as) t = g.tiers.find(x => x.id === t.as) || t;
    if (!t || !t.mp) continue;
    const lv = b.rule === 'sole' ? 0 : b.skillEff;
    if (lv === null || lv === undefined || typeof b.mod.mp !== 'number') continue;
    const p = b.parts, other = (p.addon || 0) + (p.kit || 0) + (p.extras || 0) + (p.throwable || 0);
    if (!bins.has(t)) bins.set(t, { rows: 0, lv: new Map() });
    const e = bins.get(t); e.rows++; used++;
    if (!e.lv.has(lv)) e.lv.set(lv, { mp: [], cp: [] });
    e.lv.get(lv).mp.push(b.mod.mp - other);
    if (typeof b.mod.cp === 'number' && b.mod.cp >= 0) e.lv.get(lv).cp.push(b.mod.cp - (p.throwableCp || 0));
  }
  const med = xs => { if (!xs.length) return null; const s = xs.slice().sort((a, b) => a - b), k = s.length >> 1; return CL.roundTo(s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2, 0.01); };
  const fill = arr => {
    const known = arr.map((v, i) => v === null ? null : i).filter(i => i !== null);
    if (!known.length) return { arr: arr.map(() => 0), interp: [] };
    const out = arr.slice(), interp = [];
    for (let i = 0; i < out.length; i++) {
      if (out[i] !== null) continue;
      const lo = known.filter(k => k < i).pop(), hi = known.find(k => k > i);
      out[i] = lo === undefined ? arr[hi] : hi === undefined ? arr[lo] : CL.roundTo(arr[lo] + (arr[hi] - arr[lo]) * (i - lo) / (hi - lo), 0.01);
      interp.push(i + 1);
    }
    return { arr: out, interp };
  };
  for (const g of seed.weapon.values()) for (const t of g.tiers) {
    if (!t.mp) continue;
    const e = bins.get(t);
    if (!e) { t.label = (t.label ? t.label + '; ' : '') + '[I] no price row prices this tier: 0'; continue; }
    if (e.lv.has(0)) {   // sole group: priced at level 1, flat
      const v = e.lv.get(0);
      t.mp = new Array(10).fill(med(v.mp)); t.cp = new Array(10).fill(med(v.cp));
      t.label = `[I] fitted from ${e.rows} mod price rows (median; flat: a {sole} group is priced at level 1)`;
      continue;
    }
    const mp = [], cp = [], meas = [];
    for (let l = 1; l <= 10; l++) { const v = e.lv.get(l); mp.push(v ? med(v.mp) : null); cp.push(v && v.cp.length ? med(v.cp) : null); if (v) meas.push(l + ':' + v.mp.length); }
    const fm = fill(mp), fc = fill(cp);
    t.mp = fm.arr; t.cp = fc.arr;
    t.label = `[I] fitted from ${e.rows} mod price rows: median per effective skill level (level:rows ${meas.join(' ')})${fm.interp.length ? '; levels ' + fm.interp.join(' ') + ' interpolated' : ''}`;
  }
  seed.sourceNote = `no sheet: tables fitted from the mod's price rows [I] (${used} of ${r.breeds.length} rows used)`;
  seed.fitted = { used, rows: r.breeds.length };
}
function loadModel(d, sheet) {
  let file = d.o.model ? path.resolve(d.o.model) : d.src.local.get(MODEL_KEY);
  if (file && fs.existsSync(file)) {
    const m = MD.readModel(fs.readFileSync(file), file);
    m.rel = d.o.model ? path.basename(file) : MODEL_KEY;
    m.seeded = false; m.text = fs.readFileSync(file, 'latin1');
    return m;
  }
  const s = seedText(d, sheet);
  const m = MD.readModel(Buffer.from(s.text, 'latin1'), '(seed)');
  m.rel = '(in-memory seed)'; m.seeded = true; m.text = s.text;
  return m;
}

// item -> model entry: exact name, {alias}, else any model item resolving to the same stuff file (spellings tolerated)
function makeLookup(d, model) {
  let byStuff = null;
  return n => {
    const e = model.item.get(n) || (model.alias.has(n) ? model.item.get(model.alias.get(n)) : null);
    if (e) return e;
    if (!byStuff) { byStuff = new Map(); for (const [k, v] of model.item) { const r = d.res(k); if (r && !byStuff.has(r.key)) byStuff.set(r.key, v); } }
    const r = d.res(n);
    return r ? byStuff.get(r.key) || null : null;
  };
}
// computed throwable tier of an item (model {throwable_score}); null when the stuff file has no throw data
function makeThrowTier(d, model) {
  const cache = new Map();
  return n => {
    if (!model.throwScore) return null;
    if (cache.has(n)) return cache.get(n);
    const r = d.res(n), info = r ? d.stuff.throwable(r.key) : null;
    const mi = model.lookup(n), ts = mi ? model.throwScore.by.get(mi.group) : null;
    const s = info && ts ? Object.assign({ info, mode: ts.mode || 'general' }, G.scoreThrowable(info, ts)) : null;
    cache.set(n, s);
    return s;
  };
}

const fitOf = (a, b) => {
  if (a === null || a === undefined || b === null || b === undefined) return 'n/a';
  if (Math.abs(a - b) < 1e-6) return 'exact';
  return Math.abs(a - b) <= 0.02 * Math.max(Math.abs(b), 1e-9) ? 'near' : 'off';
};
const worst = (...f) => f.includes('n/a') ? 'n/a' : f.includes('off') ? 'off' : f.includes('near') ? 'near' : 'exact';

// ---- price everything + findings ----
function compute(d, model, sheet) {
  const rep = createReport();
  const vetRanks = d.vet.ranks;
  const breedOut = [], priced = new Map();
  const rows = d.pr ? d.pr.rows : [];
  // layout: price rows {"mp/<side>/<breed>" ("level" side(x))} in units/soldiers.set; cards = blocks with {content}
  if (!d.pr) rep.add(M.UNITS + 'soldiers.set', 0, 'NO_PRICE_ROWS', `no ${M.UNITS}soldiers.set in the mod${d.o.game ? ' or the game' : ' (no --game given)'}: no breed has a price row`);
  else if (!rows.length) { const u = d.pr.unknown[0]; rep.add(d.rel(d.pr.key), u ? u.line : 1, 'LAYOUT_UNKNOWN', `soldiers.set has ${d.pr.unknown.length} block(s) but no {"mp/<side>/<breed>" ("level" side(x))} row${u ? ' (first: "' + u.name + '")' : ''}: price rows not read`); }
  const lay = d.cards.layout;
  if (lay && !d.cards.length) {
    if (!lay.files.length) rep.add(M.UNITS, 0, 'LAYOUT_UNKNOWN', `no card file found (units/<dir>/*.set, or a units/*.set file a top-level units file includes)`);
    else if (lay.blocks) { const u = lay.unknown[0]; rep.add(u ? d.rel(u.key) : d.rel(lay.files[0]), u ? u.line : 1, 'LAYOUT_UNKNOWN', `${lay.files.length} card file(s), ${lay.blocks} named block(s), none with {content "..."}: cards not read${u ? ' (first: "' + u.name + '")' : ''}`); }
  }
  const lastRow = new Map();
  for (const r of rows) { const k = r.side + '/' + r.breed; if (lastRow.has(k)) rep.info(d.rel(d.pr.key), r.line, 'DUP_PRICE_ROW', `${k} has a price row at line ${lastRow.get(k).line} too; the last row wins [I]`); lastRow.set(k, r); }
  const pairSeen = new Set();
  const priceOf = (side, breed) => {
    const k = side + '/' + breed;
    if (priced.has(k)) return priced.get(k);
    const b = d.getBreed(side, breed);
    const sp = model.special.get(k);
    const p = sp ? CL.priceSpecial(model, sp, b) : b && !b.broken ? CL.priceBreed(model, b, { vet: vetRanks, res: d.res, breedName: breed, throwTier: model.throwTier }) : null;
    priced.set(k, p);
    if (b && b.vet.undefinedPair && !pairSeen.has(k)) { pairSeen.add(k); rep.add(d.rel(b.key), 0, 'PAIR_UNDEFINED', `breed_vet table/start pair has no table: ${b.vet.undefinedPair}`); }
    return p;
  };
  for (const r of rows) {
    const k = r.side + '/' + r.breed;
    const b = d.getBreed(r.side, r.breed);
    if (!b) { rep.add(d.rel(d.pr.key), r.line, 'NO_BREED_FILE', `price row for ${k}: no file set/breed/mp/${k}.set in the mod${d.o.game ? ' or the game' : ' (no --game given)'}`); }
    const p = b || model.special.has(k) ? priceOf(r.side, r.breed) : null;
    const sh = sheet ? sheet.breeds.get(k) : null;
    const e = { side: r.side, breed: r.breed, file: d.rel(d.pr.key), line: r.line, level: r.level, rule: p ? p.rule : null, special: p && p.special || null, cls: p && p.cls, tier: p && p.tier, item: p && p.item,
      skill: p && p.skill, skillPerk: p && p.skillPerk || null, vetStart: p ? p.vetStart : null, vetRank: p ? p.vetRank : null, skillEff: p && p.skillEff,
      parts: p ? p.parts : null, calc: p ? { mp: p.mp, cp: p.cp, cw: p.cw } : null, mod: { mp: r.score, cp: r.cp, cw: r.cw },
      sheet: sh ? { mp: sh.mp, cp: sh.cp } : null, fixedCp: p && p.fixedCp || null, unpriced: p ? p.unpriced : [], undetermined: p ? p.undetermined : [], items: p && p.lines || [] };
    e.fit = p ? worst(fitOf(p.mp, r.score), fitOf(p.cp, r.cp)) : 'n/a';
    breedOut.push(e);
  }
  // cards
  const cardOut = [], noRow = new Set(), yearRow = new Set((d.prYears ? d.prYears.rows : []).map(r => r.side + '/' + r.breed));
  const panelBy = new Map();
  if (sheet) for (const p of sheet.panels) panelBy.set(String(p.name).toLowerCase(), p);
  // sequences [I]: cards of one file + side + {icon} that use a *seq* macro, in file order = buy 1, 2, ...
  const seqOf = new Map(), seqGroups = new Map();
  for (const c of d.cards) {
    if (!c.sequence || c.icon === null || c.icon === undefined) continue;
    const k = c.key + '|' + c.side + '|' + c.icon + '|' + (c.group || '');
    if (!seqGroups.has(k)) seqGroups.set(k, []);
    seqGroups.get(k).push(c);
  }
  for (const [k, list] of seqGroups) { list.sort((a, b) => a.line - b.line); list.forEach((c, i) => seqOf.set(c, { step: i + 1, size: list.length, key: k })); }
  for (const c of d.cards) {
    if (c.phantom && c.phantom.length) rep.info(d.rel(c.key), c.line, 'CARD_PHANTOM_MEMBER', `${c.name}: member ${c.phantom.map(m => m.side + '/' + m.breed).join(' ')} is a macro-parameter leftover (no such breed), not priced [I]`);
    const hand = CL.priceCard(model, c, () => ({ mp: 0 }), seqOf.get(c) || null).rule === 'hand';
    if (!hand) for (const m of c.members) {
      const k = m.side + '/' + m.breed;
      if (!lastRow.has(k) && !yearRow.has(k) && !noRow.has(k)) { noRow.add(k); rep.add(d.rel(c.key), c.line, 'NO_PRICE_ROW', `card ${c.name}: member ${k} has no row in soldiers.set or years_soldiers.set (the game prices it 0 / default) [I]`); }
    }
    const pc = CL.priceCard(model, c, (s, b) => {
      const p = priceOf(s, b); if (!p) return null;
      const bb = d.getBreed(s, b); const lvl = bb && p.skill;
      return { mp: p.cardMp !== undefined && p.cardMp !== null ? p.cardMp : p.mp, cls: p.cls, level: lvl };
    }, seqOf.get(c) || null);
    if (pc.rule === 'hand') { rep.info(d.rel(c.key), c.line, 'CARD_HAND_PRICED', `${c.name}: vehicle/gun card (${c.vehicles.join(' ') || 'no members'}), priced by hand`); }
    else if (pc.ambiguous) rep.add(d.rel(c.key), c.line, 'CARD_RULE_AMBIGUOUS', `${c.name}: ${pc.ambiguous}`);
    const nm = String(c.name).replace(/\([^)]*\)$/, '').toLowerCase();
    const sp = panelBy.get(nm);
    // the resource the card is paid with (its button's budget): a cost in another resource is never compared with the MP calc
    const unit = M.resOf(c, d.eco), hero = c.button === 'hero' || unit !== 'mp', pv = model.pointValue && unit !== 'mp' ? model.pointValue[unit] : null;
    const costMp = c.cost === null ? null : unit === 'mp' ? c.cost : typeof pv === 'number' ? CL.roundTo(c.cost * pv, 0.01) : null;
    cardOut.push({ file: d.rel(c.key), line: c.line, name: c.name, side: c.side, macro: c.macro, rule: pc.rule, add: pc.add, addPrice: pc.addPrice || 0, members: pc.members, mult: pc.mult, factor: pc.factor,
      list: c.members.map(m => ({ who: m.side + '/' + m.breed, count: m.count })), vehicles: c.vehicles,
      calc: pc.cost, cost: c.cost, sheet: sp && sp.calc !== null ? sp.calc : null, fit: pc.rule === 'hand' || unit !== 'mp' ? 'n/a' : fitOf(pc.cost, c.cost),
      button: c.button, tags: c.tags, fore: c.fore, unit, hero, pointValue: unit === 'mp' ? 1 : typeof pv === 'number' ? pv : null, costMp, missing: pc.missing, ambiguous: pc.ambiguous || null, oneLine: c.oneLine, raw: c.raw, abs: c.abs,
      seq: seqOf.has(c) ? { key: seqOf.get(c).key, icon: c.icon, step: pc.step || seqOf.get(c).step, size: seqOf.get(c).size, family: pc.family, percent: pc.percent, base: pc.base, avgCalc: null, avgCost: null } : null });
  }
  // per sequence: average calc and average actual cost over its buys
  const bySeq = new Map();
  for (const c of cardOut) if (c.seq) { if (!bySeq.has(c.seq.key)) bySeq.set(c.seq.key, []); bySeq.get(c.seq.key).push(c); }
  const avg = xs => xs.some(x => x === null || x === undefined) || !xs.length ? null : CL.roundTo(xs.reduce((s, x) => s + x, 0) / xs.length, 0.01);
  for (const list of bySeq.values()) {
    const ac = avg(list.map(c => c.calc)), am = avg(list.map(c => c.cost)), first = list[0].cost;
    for (const c of list) {
      c.seq.avgCalc = ac; c.seq.avgCost = am;
      // the mod's own step pattern: this buy's cost as a percent of buy 1, and whether it follows the model percent (+-1 MP)
      c.seq.obsPercent = first && c.cost !== null ? CL.roundTo(c.cost / first * 100, 0.1) : null;
      c.seq.pattern = c.rule !== 'sequence' || !first || c.cost === null || c.seq.percent === null ? null
        : Math.abs(c.cost - Math.round(first * c.seq.percent / (list[0].seq.percent || 100))) <= 1 ? 'match' : 'differs';
    }
  }
  // items: ungrouped / undetermined
  for (const [name, e] of [...d.items].sort((a, b) => a[0] < b[0] ? -1 : 1)) {
    const mi = model.lookup(name);
    if (!mi) rep.add(e.file, e.line, 'UNGROUPED_ITEM', `"${name}" (${e.breeds.size} breeds, ${Math.round(e.count * 100) / 100} carried${e.res ? ', stuff ' + e.res.path : ''}) is in no price group: priced 0`);
    else if (mi.tier === 'undetermined') rep.add(model.rel, mi.line, 'TIER_UNDETERMINED', `"${name}" (${mi.group}, ${e.breeds.size} breeds) has no tier yet`);
  }
  for (const x of model.dupItems) rep.add(model.rel, x.line, 'MODEL_ERROR', `item "${x.name}" listed twice (first at line ${x.first.line}); the first wins`);
  for (const x of model.errs) rep.add(model.rel, x.line, 'MODEL_ERROR', `${x.code} ${x.msg}`);
  if (sheet) for (const x of sheet.defects) rep.add(x.file, x.line, 'SHEET_DEFECT', x.msg);
  return { rep, breeds: breedOut, cards: cardOut };
}

const ecoJson = d => ({ budgets: ((d.eco && d.eco.budgets) || []).map(b => ({ name: b.name, res: b.res, buttons: b.buttons, start: b.start, tag: b.tag || '' })) });
function vetJson(d) {
  return d.vet.ranks.map((r, i) => r ? Object.assign({ rank: i }, r) : null).filter(Boolean);
}

function outText(o, text) {
  if (o.out) fs.writeFileSync(o.out, text);
  else process.stdout.write(text);
}
const n2 = v => v === null || v === undefined ? '' : String(Math.round(v * 10000) / 10000);

function calcCmd(d, model, sheet) {
  const r = compute(d, model, sheet);
  if (d.o.json) {
    const j = { tool: 'pricecalc', version: 1, mod: d.modDir, model: { file: model.seeded ? null : model.file, seeded: model.seeded }, vet: vetJson(d),
      breeds: r.breeds, cards: r.cards.map(c => { const x = Object.assign({}, c); delete x.raw; delete x.abs; delete x.oneLine; return x; }),
      findings: r.rep.toJSON({ tool: 'pricecalc' }).findings, counts: r.rep.counts, pointValue: model.pointValue, economy: ecoJson(d) };
    outText(d.o, JSON.stringify(j, null, 1) + '\n');
    return 0;
  }
  const L = [];
  L.push(['kind', 'side', 'name', 'line', 'level', 'rule', 'class', 'tier', 'item', 'skill', 'vet_start', 'skill_eff', 'weapon', 'addon', 'kit', 'extras', 'calc_mp', 'calc_cp', 'calc_cw', 'mod_mp', 'mod_cp', 'mod_cw', 'sheet_mp', 'sheet_cp', 'fit'].join('\t'));
  for (const b of r.breeds) L.push(['breed', b.side, b.breed, b.line, b.level, b.rule || '', b.cls || '', b.tier || '', b.item || '', n2(b.skill), n2(b.vetStart), n2(b.skillEff),
    ...(b.parts ? [b.parts.weapon, b.parts.addon, b.parts.kit, b.parts.extras].map(n2) : ['', '', '', '']), ...(b.calc ? [b.calc.mp, b.calc.cp, b.calc.cw].map(n2) : ['', '', '']),
    n2(b.mod.mp), n2(b.mod.cp), n2(b.mod.cw), b.sheet ? n2(b.sheet.mp) : '', b.sheet ? n2(b.sheet.cp) : '', b.fit].join('\t'));
  L.push('');
  L.push(['kind', 'file', 'line', 'name', 'rule', 'add', 'members', 'mult', 'factor', 'seq_icon', 'seq_step', 'seq_size', 'seq_family', 'seq_percent', 'seq_base', 'seq_avg_calc', 'seq_avg_cost', 'seq_mod_pct_of_buy1', 'seq_pattern',
    'calc_cost', 'cost', 'sheet_cost', 'fit', 'note'].join('\t'));
  for (const c of r.cards) L.push(['card', c.file, c.line, c.name, c.rule, c.add || '', n2(c.members), n2(c.mult), n2(c.factor),
    ...(c.seq ? [c.seq.icon, c.seq.step, c.seq.size, c.seq.family || '', n2(c.seq.percent), n2(c.seq.base), n2(c.seq.avgCalc), n2(c.seq.avgCost), n2(c.seq.obsPercent), c.seq.pattern || ''] : ['', '', '', '', '', '', '', '', '', '']),
    n2(c.calc), n2(c.cost), n2(c.sheet), c.fit,
    c.missing.length ? 'missing ' + c.missing.join(' ') : c.ambiguous || ''].join('\t'));
  outText(d.o, L.join('\n') + '\n');
  return 0;
}

function reviewCmd(d, model, sheet) {
  if (d.o.review === 'grenades') {
    // computed throwable tiers: item, stuff file, filler (blastwave energy kg / cumulative damage / fire radius), range, fuse, score, tier
    const G2 = [['item', 'group', 'stuff', 'energy_kg', 'energy_parts', 'cumulative', 'fire_radius', 'range', 'fuse_s', 'ranking', 'score', 'tier', 'breeds'].join('\t')];
    for (const [name, e] of [...d.items].sort((a, b) => a[0] < b[0] ? -1 : 1)) {
      const mi = model.lookup(name);
      if (!mi || !model.throwScore || !model.throwScore.groups.includes(mi.group)) continue;
      const t = model.throwTier(name), i = t && t.info;
      G2.push([name, mi.group, e.res ? e.res.path : 'unresolved', i ? i.energy : '', i ? i.energyParts.join('+') : '', i ? i.pen : '', i ? i.fire : '', i && i.range !== null ? i.range : '',
        i ? i.fuse : '', t ? t.mode : '', t ? t.score : '', t ? t.tier : '', e.breeds.size].join('\t'));
    }
    outText(d.o, G2.join('\n') + '\n');
    return 0;
  }
  const L = [['group', 'kind', 'item', 'breeds', 'count', 'sides', 'tier', 'best_guess', 'reason'].join('\t')];
  const det = new Map();
  for (const [n, e] of model.item) if (e.kind === 'weapon' && e.tier !== 'undetermined') det.set(n, { group: e.group, tier: e.tier });
  const rows = [];
  for (const [name, e] of d.items) {
    const mi = model.lookup(name);
    const c = C.classify(name, e.res, sheet ? sheet.classes : [], e.from, d.rules || undefined);
    let guess = c ? c.guess : null;
    if (c && c.kind === 'weapon' && (!guess || c.tier === 'undetermined')) guess = C.guessWeaponTier(name, mi ? mi.group : c.group, det);
    const tt = mi && model.throwScore && model.throwScore.groups.includes(mi.group) ? model.throwTier(name) : null;
    if (tt) guess = `computed tier ${tt.tier} (score ${tt.score})`;
    rows.push([mi ? mi.group : (c ? c.group + ' (not in model)' : '(ungrouped)'), mi ? mi.kind : c ? c.kind : '', name, e.breeds.size, Math.round(e.count * 100) / 100,
      [...e.sides].sort().join(' '), mi ? (mi.tier || 'flat') : '', guess ? guess + ' [I]' : '', c ? c.reason : '[I] no rule matched']);
  }
  rows.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[2] < b[2] ? -1 : 1));
  for (const r of rows) L.push(r.join('\t'));
  outText(d.o, L.join('\n') + '\n');
  return 0;
}

function fitCmd(d, model, sheet) {
  const r = compute(d, model, sheet);
  const cnt = xs => { const c = { exact: 0, near: 0, off: 0, 'n/a': 0 }; for (const x of xs) c[x.fit]++; return c; };
  const bc = cnt(r.breeds), cc = cnt(r.cards.filter(c => c.rule !== 'hand' && c.unit === 'mp'));
  const hand = r.cards.filter(c => c.rule === 'hand' && c.unit === 'mp').length, other = r.cards.filter(c => c.unit !== 'mp');
  const L = [];
  L.push(`model: ${model.rel}${model.seeded ? ' (no model file: seeded in memory' + (sheet ? ' from the sheets' : ', no sheet: tables fitted from the mod\'s price rows [I]') + ')' : ''}`);
  L.push(`veterancy weapon_skill by rank: ${d.vet.ranks.map((x, i) => x ? i + '=' + (x.weapon_skill ?? 0) : null).filter(Boolean).join(' ')}${d.vet.missing ? ' (set/ability/veterancy.set not found)' : ''}`);
  L.push(`breeds: ${r.breeds.length} rows: exact ${bc.exact}, within 2% ${bc.near}, off ${bc.off}, not priced ${bc['n/a']}`);
  L.push(`cards: ${r.cards.length - hand - other.length} priced: exact ${cc.exact}, within 2% ${cc.near}, off ${cc.off}, not priced ${cc['n/a']}; hand-priced ${hand}` +
    (other.length ? `; paid with another resource (hero button, not compared) ${other.length}: ${[...new Set(other.map(c => c.unit))].join(' ')}` : ''));
  const byRule = (xs, rule) => { const s = xs.filter(x => x.rule === rule); const c = cnt(s); return `${s.length} (exact ${c.exact}, within 2% ${c.near}, off ${c.off}, not priced ${c['n/a']})`; };
  L.push(`  special (fixed-price) rows: ${byRule(r.breeds, 'special')} from ${model.specials.length} {special} blocks; sole (radio) rows: ${byRule(r.breeds, 'sole')}; weapon-table rows: ${byRule(r.breeds, 'weapon')}`);
  const seqC = r.cards.filter(c => c.seq), sqP = seqC.filter(c => c.rule === 'sequence');
  const sqc = cnt(sqP), groups = new Set(seqC.map(c => c.seq.key));
  L.push(`  sequences [I]: ${groups.size} (file + side + icon), ${seqC.length} cards (${seqC.length - sqP.length} hand-priced); priced steps: exact ${sqc.exact}, within 2% ${sqc.near}, off ${sqc.off}, not priced ${sqc['n/a']}; ` +
    `step pattern (cost vs buy 1 x percent, +-1): match ${sqP.filter(c => c.seq.pattern === 'match').length}, differs ${sqP.filter(c => c.seq.pattern === 'differs').length}`);
  const gapB = r.breeds.filter(b => b.calc && b.calc.mp !== null && b.mod.mp !== null).map(b => ({ b, g: Math.abs(b.calc.mp - b.mod.mp) })).sort((a, b) => b.g - a.g).slice(0, 10);
  L.push('biggest breed gaps (mp calc vs mod):');
  for (const { b } of gapB) L.push(`  ${b.side}/${b.breed}: calc ${n2(b.calc.mp)} / ${n2(b.calc.cp)} vs mod ${n2(b.mod.mp)} / ${n2(b.mod.cp)} (${b.cls || 'no weapon'} ${b.tier || ''} skill ${b.skillEff})`);
  const gapC = r.cards.filter(c => c.calc !== null && c.cost !== null && c.unit === 'mp').map(c => ({ c, g: Math.abs(c.calc - c.cost) })).sort((a, b) => b.g - a.g).slice(0, 10);
  L.push('biggest card gaps (cost calc vs mod):');
  for (const { c } of gapC) L.push(`  ${c.file}:${c.line} ${c.name}: calc ${n2(c.calc)} vs ${n2(c.cost)} (${c.rule}${c.add ? ' + ' + c.add : ''})`);
  process.stdout.write(L.join('\n') + '\n');
  r.rep.print({ format: d.o.json ? 'json' : 'text', output: d.o.out || null, meta: { tool: 'pricecalc' }, showInfo: !d.o.quiet });
  return 0;
}

// ---- comment lines / set-prices / undo ----
const PRICE_RE = /^\s*;\{price[\s}]/;
const sdlNum = v => v === null || v === undefined ? '-1' : String(Math.round(v * 10000) / 10000);
const sq = s => '"' + String(s === null || s === undefined ? '' : s).replace(/"/g, "'") + '"';
function breedComment(b) {
  if (!b.calc) return null;
  const p = b.parts;
  if (b.rule === 'special') return `;{price {rule special} {special ${sq(b.special)}} {mp ${sdlNum(b.calc.mp)}} {cp ${sdlNum(b.calc.cp)}} {cw ${sdlNum(b.calc.cw)}}}`;
  if (b.rule === 'sole') return `;{price {rule sole} {class ${sq(b.cls)}} {tier ${sq(b.tier)}} {item ${sq(b.item)}} {mp ${sdlNum(b.calc.mp)}} {cp ${sdlNum(b.calc.cp)}} {cw ${sdlNum(b.calc.cw)}}}`;
  return `;{price {class ${sq(b.cls || 'none')}} {tier ${sq(b.tier || 'none')}} {item ${sq(b.item || '')}} {skill ${sdlNum(b.skill)}} {vet_start ${sdlNum(b.vetStart)}} {skill_eff ${sdlNum(b.skillEff)}}` +
    ` {weapon ${sdlNum(p.weapon)}} {addon ${sdlNum(p.addon)}} {kit ${sdlNum(p.kit)}} {extras ${sdlNum(p.extras)}}${p.throwable || p.throwableCp ? ` {throwable_mp ${sdlNum(p.throwable)}} {throwable_cp ${sdlNum(p.throwableCp)}}` : ""} {mp ${sdlNum(b.calc.mp)}} {cp ${sdlNum(b.calc.cp)}} {cw ${sdlNum(b.calc.cw)}}}`;
}
// hero card (button hero, or paid with anything but MP; same test as the Balance GUI, prices.client.js isHero): never a computed-MP
// line. With the model's {point_value} for its resource: its own cost in that resource and the MP worth (cost x point value), as the
// GUI shows it; without one: HERO_NONE = no line (a stale price line above the card is removed)
const HERO_NONE = Symbol('hero card: no price line');
const isHeroCard = c => !!c.hero || (c.unit != null && c.unit !== 'mp');
function cardComment(c) {
  if (isHeroCard(c)) {
    if (c.cost === null || c.cost === undefined || c.costMp === null || c.costMp === undefined || typeof c.pointValue !== 'number') return HERO_NONE;
    return `;{price {rule hero} {paid ${sq(c.unit || 'sp')}} {cost ${sdlNum(c.cost)}} {point_value ${sdlNum(c.pointValue)}} {mp_worth ${sdlNum(c.costMp)}}}`;
  }
  if (c.rule === 'hand' || c.calc === null) return null;
  if (c.rule === 'sequence' && c.seq) return `;{price {rule sequence}${c.add ? ' {add ' + sq(c.add) + '}' : ''} {members ${sdlNum(c.members)}}${c.factor !== 1 ? ' {factor ' + sdlNum(c.factor) + '}' : ''}` +
    ` {step ${c.seq.step}} {of ${c.seq.size}} {percent ${sdlNum(c.seq.percent === null ? 100 : c.seq.percent)}} {base ${sdlNum(c.seq.base)}} {cost ${sdlNum(c.calc)}} {avg ${sdlNum(c.seq.avgCalc)}}}`;
  return `;{price {rule ${c.rule}}${c.add ? ' {add ' + sq(c.add) + '}' : ''} {members ${sdlNum(c.members)}}${c.mult !== 1 ? ' {mult ' + sdlNum(c.mult) + '}' : ''}${c.factor !== 1 ? ' {factor ' + sdlNum(c.factor) + '}' : ''} {cost ${sdlNum(c.calc)}}}`;
}

// edits for one file: comments Map(line -> text), replace Map(line -> new line), insertBefore Map(line -> [lines])
function applyEdits(text, ed) {
  const parts = text.split('\n');
  const eol = /\r\n/.test(text) ? '\r' : '';
  const out = [];
  let added = 0, rewritten = 0, removed = 0;
  for (let i = 0; i < parts.length; i++) {
    // every element but the last is followed by '\n' in the join; inserted lines carry '\r' in a CRLF file
    const ln = i + 1, cr = parts[i].endsWith('\r') ? '\r' : '';
    if (ed.insertBefore && ed.insertBefore.has(ln)) {
      // place before the price comment that sits right above the row (keeps comment + row together)
      const at = out.length && PRICE_RE.test(out[out.length - 1]) ? out.length - 1 : out.length;
      out.splice(at, 0, ...ed.insertBefore.get(ln).map(x => x + eol)); added += ed.insertBefore.get(ln).length;
    }
    let body = parts[i];
    if (ed.replace && ed.replace.has(ln)) { const r = ed.replace.get(ln); if (r + cr !== body) { body = r + cr; rewritten++; } }
    if (ed.drop && ed.drop.has(ln) && out.length && PRICE_RE.test(out[out.length - 1])) { out.pop(); removed++; }
    if (ed.comments && ed.comments.has(ln)) {
      const ind = /^[ \t]*/.exec(body)[0];
      const want = ind + ed.comments.get(ln) + eol;
      if (out.length && PRICE_RE.test(out[out.length - 1])) { if (out[out.length - 1] !== want) { out[out.length - 1] = want; rewritten++; } }
      else { out.push(want); added++; }
    }
    out.push(body);
  }
  return { text: out.join('\n'), added, rewritten, removed };
}

function levelDefine(name, cp, score, cw, eol) {
  return [`(define "${name}"`, `\t{tags   "${name} %side soldier"}`, `\t{cp     ${sdlNum(cp)}}`, `\t{score  ${sdlNum(score)}}`, '\t{basic}', '\t{breed}', `\t{cw ${sdlNum(cw)}}`, ')'];
}

function buildPlan(d, model, sheet) {
  const r = compute(d, model, sheet);
  // only files inside the mod folder: rows or cards read from the game (loose game files) are never written
  const inMod = abs => { const x = path.relative(d.modDir, abs || ''); return !!abs && !!x && !x.startsWith('..') && !path.isAbsolute(x); };
  const outside = new Set();
  const files = new Map();   // abs -> {rel, ed}
  const fileOf = (abs, rel) => { if (!files.has(abs)) files.set(abs, { abs, rel, ed: { comments: new Map(), replace: new Map(), insertBefore: new Map(), drop: new Set() } }); return files.get(abs); };
  const pr = d.pr;
  const soldiersAbs = pr && pr.abs;
  if (soldiersAbs && !inMod(soldiersAbs)) outside.add(d.rel(pr.key));
  if (soldiersAbs && inMod(soldiersAbs)) {
    const f = fileOf(soldiersAbs, d.rel(pr.key));
    const levels = pr.levels;
    let maxN = 0; for (const k of levels.keys()) { const m = /^level_(\d+)$/.exec(k); if (m) maxN = Math.max(maxN, +m[1]); }
    const newLevels = new Map();   // "cp|score|cw" -> name
    const lines = fs.readFileSync(soldiersAbs, 'latin1').split(/\r?\n/);
    for (const b of r.breeds) {
      const c = breedComment(b);
      if (c) f.ed.comments.set(b.line, c);
      if (!d.o.setPrices || !b.calc || b.calc.mp === null || b.calc.cp === null) continue;
      const same = (lv) => lv && Math.abs(lv.cp - b.calc.cp) < 1e-6 && Math.abs(lv.score - b.calc.mp) < 1e-6 && Math.abs((lv.cw ?? lv.cp) - b.calc.cw) < 1e-6;
      if (b.level && same(levels.get(b.level))) continue;
      let target = null;
      for (const [nm, lv] of levels) if (same(lv) && lv.line < b.line) { target = nm; break; }
      const key = [b.calc.cp, b.calc.mp, b.calc.cw].join('|');
      if (!target && newLevels.has(key)) target = newLevels.get(key).name;
      if (!target) {
        const name = 'level_' + (++maxN);
        const before = b.line > pr.lastDefineEnd ? pr.lastDefineEnd + 1 : b.line;
        newLevels.set(key, { name, line: before });
        const arr = f.ed.insertBefore.get(before) || [];
        arr.push(...levelDefine(name, b.calc.cp, b.calc.mp, b.calc.cw), '');
        f.ed.insertBefore.set(before, arr);
        target = name;
      }
      const raw = lines[b.line - 1];
      f.ed.replace.set(b.line, raw.replace(/\(\s*"level_[^"]*"/, `("${target}"`));
    }
  }
  for (const c of r.cards) {
    if (!c.abs || !c.oneLine) continue;
    const cm = cardComment(c);
    if (!cm) continue;
    if (!inMod(c.abs)) { outside.add(c.file); continue; }
    const f = fileOf(c.abs, c.file);
    if (cm === HERO_NONE) { f.ed.drop.add(c.line); continue; }
    f.ed.comments.set(c.line, cm);
    // a hero card's cost(N) is in its own resource (SP...): --set-prices never writes the MP calc there
    if (d.o.setPrices && !isHeroCard(c) && c.calc !== null && /\bcost\(\s*-?[0-9.]+\s*\)/.test(c.raw)) f.ed.replace.set(c.line, c.raw.replace(/\bcost\(\s*-?[0-9.]+\s*\)/, `cost(${Math.round(c.calc)})`));
  }
  const out = [];
  for (const f of files.values()) {
    const before = fs.readFileSync(f.abs, 'latin1');
    const res = applyEdits(before, f.ed);
    if (res.text !== before) out.push({ abs: f.abs, rel: f.rel, before, after: res.text, added: res.added, rewritten: res.rewritten, removed: res.removed });
  }
  const modelAbs = path.join(d.modDir, ...MODEL_KEY.split('/'));
  let createModel = null;
  if (!d.o.model && !fs.existsSync(modelAbs)) createModel = { abs: modelAbs, rel: MODEL_KEY, text: model.text };
  return { files: out, createModel, rep: r.rep, outside: [...outside] };
}

// a new undo tag that no earlier write used (two writes in one second get -2, -3, ...)
function freshTag(modDir, base) { let tag = base, i = 1; while (fs.existsSync(path.join(modDir, '.arsenal-undo', tag))) tag = base + '-' + (++i); return tag; }
const stamp = () => { const t = new Date(), p = n => String(n).padStart(2, '0'); return `${t.getFullYear()}${p(t.getMonth() + 1)}${p(t.getDate())}-${p(t.getHours())}${p(t.getMinutes())}${p(t.getSeconds())}`; };
function writeKeep(abs, buf) {
  if (!fs.existsSync(abs)) { fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, buf); return; }
  const fd = fs.openSync(abs, 'r+');
  try { fs.ftruncateSync(fd, 0); fs.writeSync(fd, buf, 0, buf.length, 0); } finally { fs.closeSync(fd); }
}
function guard(d, target) {
  const why = writeguard.refuseWrite(target, { game: d.o.game, purpose: 'pricecalc apply' });
  if (why) throw new Error(why);
}

function planCmd(d, model, sheet) {
  const p = buildPlan(d, model, sheet);
  const L = [];
  for (const f of p.files) L.push(`${f.rel}: +${f.added} comment line(s), ${f.rewritten} rewritten${f.removed ? `, ${f.removed} removed (hero card, no point value)` : ''}`);
  if (p.outside.length) L.push(`not written (game files, not in the mod): ${p.outside.join(' ')}`);
  if (p.createModel) L.push(`${p.createModel.rel}: new file (price model, included by nothing)`);
  L.push(`${p.files.length + (p.createModel ? 1 : 0)} file(s) would change${d.o.setPrices ? ' (--set-prices: level_N references and cost(N) too)' : ' (comments only)'}`);
  process.stdout.write(L.join('\n') + '\n');
  return 0;
}

function applyCmd(d, model, sheet) {
  const r = doApply(d, model, sheet, d.o.undo);
  if (!r.tag) { process.stdout.write('nothing to change\n'); return 0; }
  process.stdout.write(`${r.changed.length} file(s) changed${r.created.length ? ', model file created' : ''}; undo: --undo ${r.tag}\n`);
  return 0;
}
// writes the plan; returns {tag|null, changed:[rel], created:[rel]}
function doApply(d, model, sheet, undoTag) {
  const p = buildPlan(d, model, sheet);
  if (!p.files.length && !p.createModel) return { tag: null, changed: [], created: [] };
  const tag = undoTag || freshTag(d.modDir, 'pricecalc-' + stamp());
  const udir = path.join(d.modDir, '.arsenal-undo', tag);
  guard(d, d.modDir);
  const manPath = path.join(udir, 'manifest.json');
  const man = fs.existsSync(manPath) ? JSON.parse(fs.readFileSync(manPath, 'utf8')) : { tool: 'pricecalc', tag, changed: [], created: [], setPrices: false };
  man.setPrices = man.setPrices || !!d.o.setPrices;
  delete man.undone;
  for (const f of p.files) {
    const copy = path.join(udir, 'files', ...f.rel.split('/'));
    if (!fs.existsSync(copy)) { fs.mkdirSync(path.dirname(copy), { recursive: true }); fs.copyFileSync(f.abs, copy); }   // an older copy is the original
    if (!man.changed.includes(f.rel)) man.changed.push(f.rel);
  }
  if (p.createModel && !man.created.includes(p.createModel.rel)) man.created.push(p.createModel.rel);
  fs.mkdirSync(udir, { recursive: true });
  fs.writeFileSync(manPath, JSON.stringify(man, null, 1));
  for (const f of p.files) writeKeep(f.abs, Buffer.from(f.after, 'latin1'));
  if (p.createModel) writeKeep(p.createModel.abs, Buffer.from(p.createModel.text, 'latin1'));
  return { tag, changed: p.files.map(f => f.rel), created: p.createModel ? [p.createModel.rel] : [] };
}

function latestUndo(modDir) {
  const base = path.join(modDir, '.arsenal-undo');
  if (!fs.existsSync(base)) return null;
  // newest pricecalc write not undone yet (manifest time; tag name breaks a tie). Other tools' undo folders are skipped
  const man = t => { try { return JSON.parse(fs.readFileSync(path.join(base, t, 'manifest.json'), 'utf8')); } catch (e) { return null; } };
  const tags = fs.readdirSync(base).filter(t => (m => m && m.tool === 'pricecalc' && !m.undone)(man(t)))
    .map(t => ({ t, at: fs.statSync(path.join(base, t, 'manifest.json')).mtimeMs })).sort((a, b) => a.at - b.at || (a.t < b.t ? -1 : 1));
  return tags.length ? tags[tags.length - 1].t : null;
}

function undoCmd(o) {
  const r = doUndo(o);
  process.stdout.write(`restored ${r.changed.length} file(s), removed ${r.created.length} created file(s) (undo ${r.tag})\n`);
  return 0;
}
function doUndo(o) {
  const modDir = path.resolve(o.mod);
  const tag = o.undo || latestUndo(modDir);
  if (!tag) throw new Error('no pricecalc undo found (give --undo tag)');
  const udir = path.join(modDir, '.arsenal-undo', tag), man = JSON.parse(fs.readFileSync(path.join(udir, 'manifest.json'), 'utf8'));
  const why = writeguard.refuseWrite(modDir, { game: o.game, purpose: 'pricecalc undo' }); if (why) throw new Error(why);
  for (const rel of man.changed) writeKeep(path.join(modDir, ...rel.split('/')), fs.readFileSync(path.join(udir, 'files', ...rel.split('/'))));
  for (const rel of man.created) { const a = path.join(modDir, ...rel.split('/')); if (fs.existsSync(a)) fs.unlinkSync(a); }
  // an undone apply is marked, so "undo last" moves on to the one before it
  man.undone = new Date().toISOString();
  fs.writeFileSync(path.join(udir, 'manifest.json'), JSON.stringify(man, null, 1));
  return { tag, changed: man.changed, created: man.created };
}

// expanded tree without positions (comments and line numbers do not matter to the engine)
function shape(n) {
  if (n.k === 'BLOCK') return ['B', n.tag, n.items.map(shape)];
  if (n.k === 'MOD') return ['M', n.name, !!n.not, n.items.map(shape)];
  return [n.k, n.k === 'STRING' ? n.value : n.text];
}
function expandShape(d, key, buf) {
  const errs = [];
  const r = sdlx.read(buf, { file: key, key, open: d.src.open, onError: (f, l, c) => errs.push(c) });
  return JSON.stringify(shape(r.root)) + '|' + errs.length;
}

function checkCmd(d, model, sheet) {
  const rep = checkRep(d, model, sheet, d.o.undo);
  rep.print({ format: d.o.json ? 'json' : 'text', meta: { tool: 'pricecalc' }, showInfo: !d.o.quiet });
  return rep.count ? 1 : 0;
}
function checkRep(d, model, sheet, undoTag) {
  const rep = createReport();
  const tag = undoTag || latestUndo(d.modDir);
  if (!tag) rep.add('.arsenal-undo', 0, 'CHECK_NO_UNDO', 'no pricecalc apply found to check against (give --undo tag)');
  else {
    const udir = path.join(d.modDir, '.arsenal-undo', tag), man = JSON.parse(fs.readFileSync(path.join(udir, 'manifest.json'), 'utf8'));
    for (const rel of man.changed) {
      const key = rel.toLowerCase().startsWith('resource/') ? rel.toLowerCase() : 'resource/' + rel.toLowerCase();
      const orig = fs.readFileSync(path.join(udir, 'files', ...rel.split('/'))), cur = fs.readFileSync(path.join(d.modDir, ...rel.split('/')));
      const same = expandShape(d, key, orig) === expandShape(d, key, cur);
      const lo = orig.toString('latin1').split('\n'), lc = cur.toString('latin1').split('\n');
      const commentsAdded = lc.filter(l => PRICE_RE.test(l)).length - lo.filter(l => PRICE_RE.test(l)).length;
      if (!same && !man.setPrices) rep.add(rel, 0, 'CHECK_DATA_CHANGED', `expanded SDL data differs from the undo copy (${tag}): more than comments changed`);
      else if (lc.length - lo.length !== commentsAdded && !man.setPrices) rep.add(rel, 0, 'CHECK_DATA_CHANGED', `line count grew by ${lc.length - lo.length}, price comments by ${commentsAdded}`);
      else rep.info(rel, 0, 'CHECK_OK', same ? `data identical to the undo copy, +${commentsAdded} price comment line(s)` : 'data changed (--set-prices apply)');
    }
    const p = buildPlan(d, model, sheet);
    for (const f of p.files) rep.add(f.rel, 0, 'CHECK_NOT_IDEMPOTENT', `a second apply would change this file (+${f.added}, ${f.rewritten} rewritten)`);
  }
  for (const [k, a] of d.src.local) {
    if (!/\.(set|inc|def|ext|mi|info)$/.test(k) || k === MODEL_KEY) continue;
    const t = fs.readFileSync(a, 'latin1');
    if (/price_model/i.test(t)) t.split(/\r?\n/).forEach((l, i) => { if (/^\s*[^;]*\(\s*include\s+"[^"]*price_model/i.test(l)) rep.add(d.rel(k), i + 1, 'CHECK_MODEL_INCLUDED', 'price_model.inc is included: the retail exe would read it'); });
  }
  return rep;
}

function seedCmd(d, sheet) {
  const target = d.o.out ? path.resolve(d.o.out) : null;
  if (d.o.merge) {
    const file = target || d.src.local.get(MODEL_KEY);
    if (!file || !fs.existsSync(file)) throw new Error('seed --merge needs an existing model (-o file or the mod\'s price_model.inc)');
    const text = fs.readFileSync(file, 'latin1');
    const m = MD.readModel(Buffer.from(text, 'latin1'), file);
    const adds = [];
    for (const [name, e] of d.items) {
      m.lookup = m.lookup || makeLookup(d, m);
      if (m.lookup(name)) continue;
      const c = C.classify(name, e.res, sheet ? sheet.classes : [], e.from, d.rules || undefined);
      if (!c) continue;
      const g = c.kind === 'weapon' ? m.weapon.get(c.group) : m.equip.get(c.group);
      if (c.kind === 'weapon' && !c.guess) c.guess = C.guessWeaponTier(name, c.group, new Map([...m.item].filter(([, e]) => e.kind === 'weapon' && e.tier !== 'undetermined')));
      adds.push({ name, kind: c.kind, group: c.group, reason: c.reason, guess: c.guess, flat: g ? g.flat : false });
    }
    if (!adds.length) { process.stdout.write('seed --merge: no new items\n'); return 0; }
    if (!target) guard(d, file);
    writeKeep(file, Buffer.from(MD.mergeText(text, adds), 'latin1'));
    process.stdout.write(`seed --merge: ${adds.length} new item(s) added to ${file}\n`);
    return 0;
  }
  const s = seedText(d, sheet);
  if (!target) { process.stdout.write(s.text); return 0; }
  if (fs.existsSync(target) && !d.o.force) throw new Error(`${target} exists: seed never overwrites a model (hand edits); use --merge, or --force to replace it`);
  writeKeep(target, Buffer.from(s.text, 'latin1'));
  const und = [...s.seed.weapon.values()].reduce((n, g) => n + g.tiers.filter(t => t.id === 'undetermined').reduce((a, t) => a + t.items.length, 0), 0)
    + [...s.seed.equip.values()].reduce((n, g) => n + g.tiers.filter(t => t.id === 'undetermined').reduce((a, t) => a + t.items.length, 0), 0);
  const ung = s.seed.placed.filter(p => !p.c).length;
  const eq = [...s.seed.equip.values()];
  process.stdout.write(`seed: ${target}: ${d.items.size} items, ${und} undetermined, ${ung} ungrouped; groups: ${s.seed.weapon.size} weapon (tiered), ${eq.filter(g => !g.flat).length} tiered + ${eq.filter(g => g.flat).length} flat equipment\n`);
  return 0;
}

// ---- library API (GUI: tools/gui/ext/balance). Never sets prices: comment lines and the model file only ----
// open({mod, game, rules, sheetMp, sheetCp}) -> session; result(s, modelText|null) -> JSON like calc --json + fit counts + outline
const libOpts = o => ({ cmd: 'lib', mod: o.mod, game: o.game || undefined, rules: o.rules || undefined, sheetMp: o.sheetMp || undefined, sheetCp: o.sheetCp || undefined,
  json: true, quiet: true, force: false, merge: false, setPrices: false });
function libOpen(o) {
  const lo = libOpts(o);
  const sheet = loadSheets(lo);
  const d = gather(lo);
  return { o: lo, d, sheet };
}
function libModel(s, text) {
  let m;
  if (typeof text === 'string') {
    m = MD.readModel(Buffer.from(text, 'latin1'), '(edited)');
    const file = s.d.src.local.get(MODEL_KEY);
    m.rel = MODEL_KEY; m.seeded = !file; m.text = text; m.edited = true;
  } else m = loadModel(s.d, s.sheet);
  m.lookup = makeLookup(s.d, m); m.throwTier = makeThrowTier(s.d, m);
  return m;
}
const fitCounts = r => {
  const cnt = xs => { const c = { exact: 0, near: 0, off: 0, 'n/a': 0 }; for (const x of xs) c[x.fit]++; return c; };
  return { breeds: cnt(r.breeds), cards: cnt(r.cards.filter(c => c.rule !== 'hand' && c.unit === 'mp')), hand: r.cards.filter(c => c.rule === 'hand' && c.unit === 'mp').length,
    hero: r.cards.filter(c => c.unit !== 'mp').length };
};
function libResult(s, model) {
  const r = compute(s.d, model, s.sheet);
  const d = s.d, file = d.src.local.get(MODEL_KEY);
  return {
    mod: d.modDir, model: { rel: model.rel, file: file || null, seeded: !!model.seeded, edited: !!model.edited, text: model.text },
    rules: d.rules ? { file: d.o.rules, errs: d.rules.errs } : null, sheet: !!s.sheet,
    rows: d.pr ? d.pr.rows.length : 0, rowsFile: d.pr ? d.rel(d.pr.key) : null, rowsInMod: !!(d.pr && d.src.local.has(d.pr.key)),
    cardFiles: d.cards.layout ? d.cards.layout.files.length : null, localFiles: d.src.local.size,
    breeds: r.breeds, cards: r.cards.map(c => { const x = Object.assign({}, c); delete x.raw; delete x.abs; delete x.oneLine; return x; }),
    findings: r.rep.toJSON({ tool: 'pricecalc' }).findings, counts: r.rep.counts, fit: fitCounts(r), pointValue: model.pointValue, economy: ecoJson(d)
  };
}
// in-game names (read once per session, only when asked): card title = desc/entity/<card name>, else desc/squad/<card name>
// ( order, as tools/cardrename; the registry units/<name>/desc step is not read [I]); breed = desc/human/mp/<side>/<breed> [I].
// The mod's localization/ over the game's interface/text (cardrename readTexts: includes expanded, later duplicate wins). An AS2 mod
// ships one text language (its localization/ folder), so there is no language to pick. Colour tags <c(..)> and the like are dropped.
// -> { cards: {name: text}, breeds: {"side/breed": text}, keys: n }   (names with no text are left out: the caller keeps the internal name)
function libNames(s) {
  if (s.names) return s.names;
  const keys = require('../cardrename/cardrename').readTexts(s.d.src);
  const txt = k => { const a = keys.get(String(k).toLowerCase()); const t = a && a.length ? a[a.length - 1].txt : null; const c = t ? t.replace(/<[^<>]*>/g, '').replace(/\s+/g, ' ').trim() : ''; return c || null; };
  const cards = {}, breeds = {};
  for (const c of s.d.cards) { const t = txt('desc/entity/' + c.name) || txt('desc/squad/' + c.name); if (t) cards[c.name] = t; }
  for (const k of s.d.breeds.keys()) { const t = txt('desc/human/mp/' + k); if (t) breeds[k] = t; }
  s.names = { cards, breeds, keys: keys.size };
  return s.names;
}
function libPlan(s, model) {
  const p = buildPlan(s.d, model, s.sheet);
  return { files: p.files.map(f => ({ rel: f.rel, added: f.added, rewritten: f.rewritten, preview: diffPreview(f.before, f.after, 40) })), createModel: p.createModel ? p.createModel.rel : null, outside: p.outside };
}
// first changed lines of a file (new lines only), for a preview
function diffPreview(before, after, max) {
  const a = before.split('\n'), b = after.split('\n'), out = [];
  let i = 0, j = 0;
  while (j < b.length && out.length < max) {
    if (i < a.length && a[i] === b[j]) { i++; j++; continue; }
    out.push({ line: j + 1, text: b[j].replace(/\r$/, '') }); j++;
  }
  return out;
}
const libApply = (s, model, tag) => doApply(s.d, model, s.sheet, tag);
const libUndo = (o, tag) => doUndo({ mod: o.mod, game: o.game, undo: tag || undefined });
function libCheck(s, model, tag) { const rep = checkRep(s.d, model, s.sheet, tag); return { findings: rep.toJSON({ tool: 'pricecalc' }).findings, count: rep.count }; }
function libSeed(s) {
  const r = seedText(s.d, s.sheet);
  return { text: r.text, items: s.d.items.size, fitted: r.seed.fitted || null, source: r.seed.sourceNote || null };
}
// save the model file (only price_model.inc), undo copy under <mod>/.arsenal-undo/<tag>/ (same manifest as apply)
function libSaveModel(s, text, tag) {
  const d = s.d, abs = path.join(d.modDir, ...MODEL_KEY.split('/'));
  guard(d, d.modDir);
  const m = MD.readModel(Buffer.from(text, 'latin1'), '(save)');
  if (m.errs.length) throw new Error('model does not read: ' + m.errs[0].code + ' ' + m.errs[0].msg);
  tag = tag || freshTag(d.modDir, 'pricecalc-model-' + stamp());
  const udir = path.join(d.modDir, '.arsenal-undo', tag), manPath = path.join(udir, 'manifest.json');
  const man = fs.existsSync(manPath) ? JSON.parse(fs.readFileSync(manPath, 'utf8')) : { tool: 'pricecalc', tag, changed: [], created: [], setPrices: false, model: true };
  delete man.undone;
  const existed = fs.existsSync(abs);
  if (existed) {
    const copy = path.join(udir, 'files', ...MODEL_KEY.split('/'));
    if (!fs.existsSync(copy)) { fs.mkdirSync(path.dirname(copy), { recursive: true }); fs.copyFileSync(abs, copy); }
    if (!man.changed.includes(MODEL_KEY) && !man.created.includes(MODEL_KEY)) man.changed.push(MODEL_KEY);
  } else if (!man.created.includes(MODEL_KEY)) man.created.push(MODEL_KEY);
  fs.mkdirSync(udir, { recursive: true });
  fs.writeFileSync(manPath, JSON.stringify(man, null, 1));
  writeKeep(abs, Buffer.from(text, 'latin1'));
  return { tag, rel: MODEL_KEY, created: !existed };
}
const lib = { open: libOpen, model: libModel, result: libResult, plan: libPlan, apply: libApply, undo: libUndo, check: libCheck, seed: libSeed, saveModel: libSaveModel,
  names: libNames, latestUndo, MODEL_KEY };

function main(argv) {
  const o = parseArgs(argv);
  if (!o.cmd || !o.mod) { process.stderr.write('usage: pricecalc.js <seed|calc|review|fit|plan|apply|undo|check> <modDir> [options] (--help)\n'); return 2; }
  if (o.cmd === 'undo') return undoCmd(o);
  const sheet = loadSheets(o);
  const d = gather(o);
  if (o.cmd === 'seed') return seedCmd(d, sheet);
  const model = loadModel(d, sheet);
  model.lookup = makeLookup(d, model); model.throwTier = makeThrowTier(d, model);
  switch (o.cmd) {
    case 'calc': return o.review ? reviewCmd(d, model, sheet) : calcCmd(d, model, sheet);
    case 'review': return reviewCmd(d, model, sheet);
    case 'fit': return fitCmd(d, model, sheet);
    case 'plan': return planCmd(d, model, sheet);
    case 'apply': return applyCmd(d, model, sheet);
    case 'check': return checkCmd(d, model, sheet);
    default: process.stderr.write('unknown command ' + o.cmd + '\n'); return 2;
  }
}

if (require.main === module) {
  try { process.exitCode = main(process.argv.slice(2)); }
  catch (e) { process.stderr.write('pricecalc: ' + e.message + '\n'); process.exitCode = 2; }
}
module.exports = { main, applyEdits, breedComment, cardComment, shape, lib };

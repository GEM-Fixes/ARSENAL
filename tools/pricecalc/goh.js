// pricecalc/goh: the price calculator for Gates of Hell (reads; check / plan / apply change only the cost(N) number of the mod's own breed rows, below). GoH has no soldiers.set price rows and no AS2 squad cards: each
// soldier is a breed card {"mp/<side>/<period>/<breed>" ("inf_<class>" side() period() cost(N))} in units/<period>/inf_<army>.set
// (its MP price is that cost), and a squad's buy price is own cost + sum count x member cost x squad_cost_factor, rounded up to
// round_multiple (GHGPL-10 [V], the same rule as statsheet/units.js gohCard). The game ships the designers' own price chart as comments
// (units/prices.txt, the head of each inf_<army>.set: "tier2 price per weapon + a step per tier, MG steps larger") but no numbers
// the exe reads, so the model here is FITTED on the game's (or mod's) own breed rows [I]:
//   breed fair price = W[main weapon] + T[tier class (+ "/mg" when the main weapon is in stuff/mgun)] + V[veterancy level] + sum A[extra kit folder]
//   special classes (no "tier" in the define name: signaller, tankman, medic, officer, sniper ..) = the median price of their class
//   W, T, V, A by backfitting with medians (robust to one odd row); T["tier2"] = 0 and V[lowest] = 0 anchor the sum.
//   Left out (no GoH data a reader can use): skill perks, grenades, armour, CP and CW (fixed per class define, not a price).
// saved model: the mod's resource/set/multiplayer/units/price_model.inc ({goh_price_model ...}, below) replaces the fit when present:
//   result, check, plan and write measure on it (try passes a model to result; save, seed and undo write it through lib/modwrite).
// cards: fair card price = the same GHGPL-10 sum with each member breed at its fair price (vehicles in the content keep their own
//   cost: the model prices men only); rule "squad" (members only), "vehicle" (a vehicle plus crew), "hand" (squad_cost_factor 0, or no
//   breed member: the price is the card's own number).
// API: open({game, mod}) -> s;  result(s) -> {goh:true, breeds[], cards[], model{weapons,tiers,vets,extras,specials}, fit, quality, ...}
//      names(s) -> {cards:{name:text}, breeds:{"side/period/breed":text}}.  fitModel(rows) is pure (tests).
// Author: Imperator_Aug (ARSENAL, ia-193e956c)
const fs = require('fs'), path = require('path');

const lc = s => String(s == null ? '' : s).toLowerCase();
const UNITS = 'resource/set/multiplayer/units/';
const WEAPON_DIRS = ['bazooka', 'flame', 'mgun', 'rifle', 'smg', 'pistol'];   // main weapon: a special weapon beats the item in hands, the rifle beats the sidearm
const EXTRA_DIRS = ['faust', 'bazooka', 'flame', 'explosive', 'mortar', 'special'];
const FAUST = /^(panzerfaust|faustpatrone)/i, AMMO = /(\.|\s)ammo(\s|$)/i;
const val = t => !t ? null : t.k === 'STRING' ? t.value : t.k === 'INTEGER' || t.k === 'FLOAT' ? t.value : t.text;
const nameOf = b => b && b.items && b.items.length ? val(b.items[0]) : null;
function flat(items) {
  const out = [];
  for (const it of items || []) { if (it.k === 'MOD') { if (lc(it.name) === 'mp' ? !it.not : !!it.not) out.push(...flat(it.items)); } else out.push(it); }
  return out;
}
const blocks = b => flat(b.items).filter(i => i.k === 'BLOCK');
const kid = (b, n) => blocks(b).find(x => lc(nameOf(x)) === n) || null;
const args = b => b ? flat(b.items).slice(1).filter(i => i.k !== 'BLOCK') : [];
const numKid = (b, n) => { const k = kid(b, n); if (!k) return null; const t = args(k).find(x => x.k === 'INTEGER' || x.k === 'FLOAT'); return t ? t.value : null; };
const strKid = (b, n) => { const k = kid(b, n); return k ? args(k).map(val).join(' ') : ''; };
const median = xs => { if (!xs.length) return null; const a = xs.slice().sort((x, y) => x - y), m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
const r2 = v => v == null ? null : Math.round(v * 100) / 100;

function source(o) {
  const sdlset = require('../lib/sdlset');
  return sdlset.createSource({ gameDir: o.game || undefined, exe: 'goh', folder: o.mod });
}
const allKeys = s => { const ks = new Set(); if (s.v && s.v.files) for (const k of s.v.files.keys()) ks.add(k); for (const k of s.local.keys()) ks.add(k); return [...ks]; };
const textOf = (s, key) => { const b = s.get(key); return b ? b.toString('latin1') : null; };

// every card of every roster root (units/only_roster_<period>.set), macros expanded; later duplicate wins (findings DUP)
function readCards(s, keys, rep) {
  // one root per period (only_roster_<period>.set); a mod or game without them: common.set (all periods in one list)
  let roots = keys.filter(k => /^resource\/set\/multiplayer\/units\/only_roster_[^/]+\.set$/i.test(k)).sort();
  if (!roots.length) roots = keys.filter(k => /^resource\/set\/multiplayer\/units\/common\.set$/i.test(k));
  const cards = [];
  for (const key of roots) {
    const r0 = /only_roster_([^/]+)\.set$/i.exec(key), period = r0 ? r0[1].toLowerCase() : null;
    const r = s.read({ key, file: key, get: () => s.get(key) }, (f, l, c, m) => { if (/MACRO_UNDEFINED|INCLUDE_MISSING/.test(c)) rep.push({ file: f, line: l, code: 'READ_' + c, msg: m, severity: 'warning' }); });
    if (!r || !r.root) continue;
    const walk = b => { for (const x of blocks(b)) { const n = nameOf(x); if (lc(n) === 'units' && x.items[0].k === 'IDENT') walk(x); else if (x.items[0] && x.items[0].k === 'STRING') {
      const pf = /\/units\/([^/]+)\/[^/]+$/i.exec(String(x.items[0].file || '').replace(/\\/g, '/'));
      cards.push({ b: x, root: period || (pf ? pf[1].toLowerCase() : 'all') });
    } } };
    walk(r.root);
  }
  return { roots, cards };
}
// the define name and the comment on the card's own source line (the expanded tree has no macro names)
function lineInfo(s, file, line, memo) {
  if (!file || !line) return { cls: null, note: '' };
  let L = memo.get(file); if (L === undefined) { const t = textOf(s, file); L = t ? t.split(/\r?\n/) : null; memo.set(file, L); }
  const t = L && L[line - 1] || '';
  const m = /\(\s*"([^"]+)"/.exec(t), c = /;\s*(?:\/\/\s*)?(.*)$/.exec(t.replace(/"[^"]*"/g, '""'));
  return { cls: m ? lc(m[1]) : null, note: c ? c[1].trim() : '' };
}
// stuff index: item name (spaces as dots, lower case) -> stuff folder
function stuffIndex(keys) {
  const m = new Map();
  for (const k of keys) { const x = /^resource\/set\/stuff\/([^/]+)\/(?:.*\/)?([^/]+)$/i.exec(k); if (!x) continue; for (const n of [lc(x[2]), lc(x[2]).replace(/\.weapon$/, '')]) if (!m.has(n)) m.set(n, lc(x[1])); }
  return m;
}
const folderOf = (idx, item) => idx.get(lc(item).replace(/\s+/g, '.')) || idx.get(lc(item)) || null;
// one breed file: items in order, the item in hands, the veterancy level
function readBreed(s, id, idx) {
  const key = 'resource/set/breed/' + lc(id) + '.set', raw = textOf(s, key);
  if (raw == null) return null;
  const items = []; let hands = null;
  try {
    const r = s.read({ key, file: key, get: () => s.get(key) }, () => {});
    const br = r && blocks(r.root).find(b => lc(nameOf(b)) === 'breed');
    const inv = br && kid(br, 'inventory');
    if (inv) for (const it of blocks(inv)) { const n = lc(nameOf(it)); if (n === 'item') { const nm = val(args(it)[0]); if (nm) items.push(String(nm)); } else if (n === 'in_hands') hands = numKid(inv, 'in_hands'); }
  } catch (e) { /* raw fallback below */ }
  if (!items.length) { const re = /\{\s*item\s+"([^"]+)"/g; let x; while ((x = re.exec(raw))) items.push(x[1]); const h = /\{\s*in_hands\s+(\d+)/.exec(raw); if (h) hands = +h[1]; }
  const vet = /veterancy_lvl_(\d+)/i.exec(raw);
  const kit = items.filter(n => !AMMO.test(n)).map(n => { const f = folderOf(idx, n); return { item: n, folder: f === 'bazooka' && FAUST.test(n) ? 'faust' : f }; });
  const inHand = hands != null && items[hands] ? kit.find(k => k.item === items[hands]) : null;
  let main = null;
  for (const d of WEAPON_DIRS) { main = inHand && inHand.folder === d ? inHand : kit.find(k => k.folder === d); if (main) break; }
  const extras = [...new Set(kit.filter(k => k !== main && EXTRA_DIRS.includes(k.folder)).map(k => k.folder))];
  return { key, items: kit, main: main ? lc(main.item) : null, mainFolder: main ? main.folder : null, vet: vet ? +vet[1] : 0, extras };
}

// ---- the fit (pure): rows [{cost, special, cls, weapon, tierKey, vet, extras[]}] -> model + fair on each row ----
function fitModel(rows, passes) {
  const W = new Map(), T = new Map(), V = new Map(), A = new Map(), SP = new Map();
  const reg = rows.filter(r => !r.special && r.cost != null), sp = rows.filter(r => r.special && r.cost != null);
  for (const r of sp) { if (!SP.has(r.cls)) SP.set(r.cls, []); SP.get(r.cls).push(r.cost); }
  const spec = new Map([...SP].map(([k, v]) => [k, { price: median(v), rows: v.length }]));
  const g = (m, k) => m.get(k) || 0, aSum = (r, skip) => r.extras.reduce((s, f) => s + (f === skip ? 0 : g(A, f)), 0);
  const by = (f) => { const m = new Map(); for (const r of reg) for (const k of [].concat(f(r))) { if (k == null) continue; if (!m.has(k)) m.set(k, []); m.get(k).push(r); } return m; };
  const byW = by(r => r.weapon), byT = by(r => r.tierKey), byV = by(r => r.vet), byA = by(r => r.extras);
  // start: each weapon at its tier 2, lowest veterancy price (the designers' chart is "tier2 prices"), else all its rows
  const v0min = reg.length ? Math.min(...reg.map(r => r.vet)) : 0;
  for (const [k, rs] of byW) { const t2 = rs.filter(r => /^tier2/.test(r.tierKey) && r.vet === v0min && !r.extras.length); W.set(k, median((t2.length ? t2 : rs).map(r => r.cost))); }
  for (let p = 0; p < (passes || 12); p++) {
    for (const [k, rs] of byT) T.set(k, median(rs.map(r => r.cost - g(W, r.weapon) - g(V, r.vet) - aSum(r))));
    const t0 = T.has('tier2') ? T.get('tier2') : 0; if (t0) { for (const k of T.keys()) T.set(k, T.get(k) - t0); for (const k of W.keys()) W.set(k, W.get(k) + t0); }
    for (const [k, rs] of byV) V.set(k, median(rs.map(r => r.cost - g(W, r.weapon) - g(T, r.tierKey) - aSum(r))));
    const v0 = V.size ? V.get(Math.min(...V.keys())) : 0; if (v0) { for (const k of V.keys()) V.set(k, V.get(k) - v0); for (const k of W.keys()) W.set(k, W.get(k) + v0); }
    for (const [k, rs] of byA) A.set(k, median(rs.map(r => r.cost - g(W, r.weapon) - g(T, r.tierKey) - g(V, r.vet) - aSum(r, k))));
    for (const [k, rs] of byW) W.set(k, median(rs.map(r => r.cost - g(T, r.tierKey) - g(V, r.vet) - aSum(r))));
  }
  for (const r of rows) {
    if (r.special) { const s0 = spec.get(r.cls); r.fair = s0 ? s0.price : null; r.parts = null; continue; }
    const parts = { weapon: g(W, r.weapon), tier: g(T, r.tierKey), vet: g(V, r.vet), extras: aSum(r) };
    r.parts = parts; r.fair = parts.weapon + parts.tier + parts.vet + parts.extras;
  }
  const tab = (m, by0) => [...m].map(([k, v]) => ({ key: k, price: r2(v), rows: (by0.get(k) || []).length })).sort((a, b) => String(a.key).localeCompare(String(b.key), 'en', { numeric: true }));
  return { weapons: tab(W, byW), tiers: tab(T, byT), vets: tab(V, byV), extras: tab(A, byA), specials: [...spec].map(([k, v]) => ({ key: k, price: r2(v.price), rows: v.rows })).sort((a, b) => a.key.localeCompare(b.key)) };
}
const fitOf = (a, b) => a == null || b == null ? 'n/a' : Math.abs(a - b) < 1e-6 ? 'exact' : Math.abs(a - b) <= 0.02 * Math.max(Math.abs(b), 1e-9) ? 'near' : 'off';
// fit quality: counts, median and mean absolute error, share within 10 %, R squared of fair on game price
function quality(xs) {
  const ok = xs.filter(x => x.fair != null && x.game != null);
  const err = ok.map(x => Math.abs(x.fair - x.game)), mean = ok.reduce((s, x) => s + x.game, 0) / (ok.length || 1);
  const ssr = ok.reduce((s, x) => s + (x.fair - x.game) ** 2, 0), sst = ok.reduce((s, x) => s + (x.game - mean) ** 2, 0);
  return { n: ok.length, medAbs: r2(median(err)), meanAbs: r2(err.reduce((s, e) => s + e, 0) / (ok.length || 1)),
    within10: ok.length ? Math.round(ok.filter(x => Math.abs(x.fair - x.game) <= 0.1 * Math.max(x.game, 1)).length / ok.length * 100) : null,
    r2: sst > 0 ? Math.round((1 - ssr / sst) * 1000) / 1000 : null };
}

function open(o) {
  if (!o || !o.mod) throw new Error('pricecalc goh: a mod folder (or an empty scratch folder) is needed');
  const s = source(o), keys = allKeys(s), rep = [];
  const { roots, cards } = readCards(s, keys, rep);
  if (!roots.length) rep.push({ file: UNITS, line: 0, code: 'NO_PRICE_ROWS', msg: 'no units/only_roster_<period>.set or units/common.set in the mod or the game', severity: 'error' });
  const S = { o, s, keys, rep, roots, cards, idx: stuffIndex(keys), modDir: path.resolve(o.mod), saved: null };
  // the mod's saved model (MODEL_KEY, a loose file of the mod): the prices are measured on it instead of the fit
  const w = s.winner(MODEL_KEY);
  if (w === 'local' || w === 'pak') {
    const text = s.get(MODEL_KEY).toString('latin1'), m = readModel(text);
    for (const e of m.errs) rep.push({ file: MODEL_KEY, line: e.line, code: 'MODEL_LINE', msg: e.msg, severity: 'warning' });
    S.saved = { text, model: m.model, file: s.loosePath(MODEL_KEY) };
  }
  return S;
}

// result(S, over): over = a model ({weapons, tiers, vets, extras, specials}) to price with (the page's try); none: the mod's saved model
// when it has one, else the fit. gohModel = the model the prices came from; fitted = the fit, always (seed writes it)
function result(S, over) {
  const { s, cards, idx } = S, memo = new Map(), rep = S.rep.slice();
  // breed rows: per roster root, the last card of an id wins
  const own = new Map(), breedRows = new Map(), unitCards = [];
  for (const c of cards) {
    const b = c.b, id = String(nameOf(b)), k = c.root + '|' + lc(id);
    const cost = numKid(b, 'cost'), file = b.items[0].file, line = b.items[0].line;
    own.set(k, cost == null ? 0 : cost);
    if (kid(b, 'breed')) {
      if (breedRows.has(k)) rep.push({ file, line, code: 'DUP_PRICE_ROW', msg: id + ' priced twice in ' + c.root + '; the last row wins', severity: 'info' });
      breedRows.set(k, { c, id, cost, file, line });
    } else unitCards.push({ c, id, cost, file, line });
  }
  const rows = [], bcache = new Map();
  for (const [k, x] of breedRows) {
    const m = /^mp\/([^/]+)\/([^/]+)\/(.+)$/i.exec(x.id), li = lineInfo(s, x.file, x.line, memo);
    const side = m ? lc(m[1]) : '', period = m ? lc(m[2]) : x.c.root, breed = m ? lc(m[2] + '/' + m[3]) : lc(x.id);
    let bf = bcache.get(lc(x.id)); if (bf === undefined) { bf = readBreed(s, x.id, idx); bcache.set(lc(x.id), bf); }
    const cls = li.cls || 'unknown', t = /tier\s*_?(\d)/.exec(cls), special = !t;
    const mg = !!bf && bf.mainFolder === 'mgun';
    const r = { side, period, breed, id: x.id, root: x.c.root, file: x.file, line: x.line, cls, note: li.note, tier: t ? 'tier' + t[1] + (/lite/.test(cls) ? '_lite' : '') : null,
      special, weapon: bf ? bf.main : null, folder: bf ? bf.mainFolder : null, vet: bf ? bf.vet : 0, extras: bf ? bf.extras : [], cost: x.cost,
      cp: numKid(x.c.b, 'cp'), cw: numKid(x.c.b, 'cw'), noFile: !bf };
    r.tierKey = special ? null : r.tier + (mg ? '/mg' : '');
    if (!bf) rep.push({ file: x.file, line: x.line, code: 'NO_BREED_FILE', msg: 'no set/breed/' + lc(x.id) + '.set: weapon unknown, priced by its tier only', severity: 'warning' });
    else if (!special && !bf.main) rep.push({ file: x.file, line: x.line, code: 'NO_MAIN_WEAPON', msg: x.id + ' carries no rifle, smg, mgun, pistol, flame or bazooka item', severity: 'info' });
    rows.push(r);
  }
  const fitted = fitModel(rows), useM = over || (S.saved && S.saved.model) || null;
  let model = fitted;
  if (useM) {   // the given or saved model: every row priced on it, the tables show its terms (rows = how many rows of the mod use each)
    const M = termMaps(useM);
    for (const r of rows) {
      if (r.special) { r.fair = M.S.has(String(r.cls)) ? M.S.get(String(r.cls)) : null; r.parts = null; continue; }
      const g = (m, k) => m.has(String(k)) ? m.get(String(k)) : 0, ex = r.extras.reduce((sm, e) => sm + g(M.A, e), 0);
      r.parts = { weapon: g(M.W, r.weapon), tier: g(M.T, r.tierKey), vet: g(M.V, r.vet), extras: ex };
      r.fair = M.W.has(String(r.weapon)) ? r.parts.weapon + r.parts.tier + r.parts.vet + ex : null;
    }
    const cnt = (g, f) => (useM[g] || []).map(x => ({ key: x.key, price: x.price, rows: rows.filter(r => f(r, String(x.key))).length }));
    model = { weapons: cnt('weapons', (r, k) => !r.special && String(r.weapon) === k), tiers: cnt('tiers', (r, k) => !r.special && String(r.tierKey) === k), vets: cnt('vets', (r, k) => !r.special && String(r.vet) === k),
      extras: cnt('extras', (r, k) => !r.special && r.extras.map(String).includes(k)), specials: cnt('specials', (r, k) => r.special && String(r.cls) === k) };
  }
  const fair = new Map(rows.map(r => [r.root + '|' + lc(r.id), r.fair]));
  // a part of a card: its row in the card's own root first, else the last row of that id in any root (common.set lists)
  const anyRoot = m => { const a = new Map(); for (const [k, v] of m) a.set(k.slice(k.indexOf('|') + 1), v); return a; }, ownAny = anyRoot(own), fairAny = anyRoot(fair);
  const look = (m, a, root, id) => m.has(root + '|' + lc(id)) ? m.get(root + '|' + lc(id)) : a.get(lc(id));
  const breeds = rows.map(r => ({ side: r.side, period: r.period, breed: r.breed, id: r.id, file: r.file, line: r.line, level: r.cls, rule: r.special ? 'special' : 'weapon', cls: r.cls, tier: r.tierKey,
    item: r.weapon, folder: r.folder, vetStart: r.vet, extras: r.extras, note: r.note, parts: r.parts ? { weapon: r2(r.parts.weapon), addon: 0, kit: r2(r.parts.extras), extras: r2(r.parts.tier + r.parts.vet), tier: r2(r.parts.tier), vet: r2(r.parts.vet) } : null,
    calc: { mp: r2(r.fair), cp: null, cw: null }, mod: { mp: r.cost, cp: r.cp, cw: r.cw }, fit: fitOf(r2(r.fair), r.cost), unpriced: r.weapon || r.special ? [] : ['(no weapon)'], undetermined: [] }));
  // cards: GHGPL-10 with game and with fair member prices
  const out = [];
  for (const x of unitCards) {
    const b = x.c.b, root = x.c.root, content = strKid(b, 'content'), scf = numKid(b, 'squad_cost_factor') || 0, rm = numKid(b, 'round_multiple') || 0;
    const parts = [];
    for (const w of content.replace(/[()]/g, ' ').split(/\s+/).filter(Boolean)) { const q = /^([^:]+)(?::(\d+))?$/.exec(w); if (q && q[1] !== '*') parts.push({ id: q[1], n: q[2] ? +q[2] : 1 }); }
    const men = parts.filter(p => /^mp\//i.test(p.id)), veh = parts.filter(p => !/^mp\//i.test(p.id));
    const button = lc(strKid(b, 'button')) || null, tags = lc(strKid(b, 'tags')).split(/\s+/).filter(Boolean);
    if (x.cost == null && !parts.length) continue;
    const price = memberCost => { let c = (x.cost || 0) + parts.reduce((sm, p) => sm + p.n * memberCost(p) * scf, 0); if (rm > 0) { const f = c % rm; if (f > 1e-9) c += rm - f; } return Math.round(c * 1000) / 1000; };
    const gameCost = id => look(own, ownAny, root, id) || 0, fairOf = id => look(fair, fairAny, root, id);
    const game = x.cost == null && !(scf && parts.some(p => gameCost(p.id))) ? null : price(p => gameCost(p.id));
    const missing = men.filter(p => fairOf(p.id) === undefined).map(p => p.id);
    const rule = !scf || !men.length ? 'hand' : veh.length ? 'vehicle' : 'squad';
    const calc = rule === 'hand' ? null : price(p => /^mp\//i.test(p.id) && fairOf(p.id) != null ? fairOf(p.id) : gameCost(p.id));
    const side = (/(?:^|\s)mp\/([^/\s]+)\//i.exec(content) || /\(([^)]+)\)\s*$/.exec(x.id) || [])[1] || tags.find(t => /^(ger|rus|usa|eng|fin|ita|jap|fra|pol|hun|rom)$/.test(t)) || null;
    const unit = /doctrine/.test(button || '') || /^doctrine_/i.test(x.id) ? 'dp' : 'mp';
    out.push({ file: x.file, line: x.line, name: x.id, side: side ? lc(side) : null, period: root, macro: null, rule, add: veh.length ? veh.map(v => v.id).join(' ') : null, addPrice: r2(veh.reduce((sm, v) => sm + v.n * gameCost(v.id) * scf, 0)),
      members: r2(men.reduce((sm, p) => sm + p.n * (fairOf(p.id) || 0), 0)), list: men.map(p => ({ who: lc(p.id).replace(/^mp\//, ''), count: p.n })), vehicles: veh.map(v => v.id), mult: scf, factor: scf,
      ownCost: x.cost, roundMultiple: rm || null, calc: calc == null ? null : r2(calc), cost: game, sheet: null, fit: rule === 'hand' || unit !== 'mp' ? 'n/a' : fitOf(calc, game), missing, ambiguous: null, seq: null,
      button, tags, fore: null, unit, hero: unit !== 'mp', pointValue: unit === 'mp' ? 1 : null, costMp: unit === 'mp' ? game : null });
  }
  const cnt = xs => { const c = { exact: 0, near: 0, off: 0, 'n/a': 0 }; for (const x of xs) c[x.fit]++; return c; };
  const counts = {}; for (const f of rep) counts[f.code] = (counts[f.code] || 0) + 1;
  const qb = quality(rows.filter(r => !r.special).map(r => ({ fair: r.fair, game: r.cost }))), qs = quality(rows.filter(r => r.special).map(r => ({ fair: r.fair, game: r.cost })));
  // cards: squads (men only) apart from vehicles with crew, whose own vehicle cost (taken as it is) would flatter the fit
  const qc = r => quality(out.filter(c => c.rule === r && c.unit === 'mp').map(c => ({ fair: c.calc, game: c.cost })));
  return {
    goh: true, mod: S.modDir, model: { rel: MODEL_KEY, file: S.saved ? S.saved.file : null, seeded: !S.saved, edited: !!over, text: S.saved ? S.saved.text : modelText(fitted) }, rules: null, sheet: false,
    rows: rows.length, rowsFile: 'resource/set/multiplayer/units/<period>/inf_<army>.set', rowsInMod: rows.some(r => S.s.local.has(r.file)), cardFiles: S.roots.length,
    breeds, cards: out, findings: rep, counts,
    fit: { breeds: cnt(breeds), cards: cnt(out.filter(c => c.rule !== 'hand' && c.unit === 'mp')), hand: out.filter(c => c.rule === 'hand' && c.unit === 'mp').length, hero: out.filter(c => c.unit !== 'mp').length },
    quality: { breeds: qb, specials: qs, squads: qc('squad'), vehicles: qc('vehicle') }, gohModel: model, fitted, modelFrom: over ? 'try' : S.saved ? 'saved' : 'fit',
    leftOut: ['perks', 'grenades', 'armour', 'cp', 'cw'], pointValue: null, economy: { budgets: [] }
  };
}

// in-game names: the .pot / .lng texts (default language) of the game and the mod; card = desc/squad|entity/<id>, breed = desc/human/<id> [I]
function names(S) {
  if (S.names) return S.names;
  const lngpot = require('../upgrade/lib/lngpot'), s = S.s, map = new Map();
  const want = S.keys.filter(k => /(^|\/)(interface\/text|localizations?)\/.+\.(pot|lng)$/i.test(k) && !/\/mission\//i.test(k) && !/(^|\/)localizations\/(?!default\/)[^/]+\//i.test(k));
  want.sort((a, b) => (/\.pot$/i.test(a) ? 0 : 1) - (/\.pot$/i.test(b) ? 0 : 1) || (s.local.has(a) ? 1 : 0) - (s.local.has(b) ? 1 : 0) || (a < b ? -1 : 1));
  for (const k of want) {
    try {
      const b = s.get(k); if (!b) continue;
      const kv = /\.pot$/i.test(k) ? lngpot.potKeys(b.toString('utf8').replace(/^﻿/, '')) : lngpot.lngKeys(b, k.replace(/^.*?interface\/text\//i, ''));
      for (const [key, t] of kv) if (/^desc\/(entity|squad|human)\//i.test(key) && String(t).trim()) map.set(lc(key), String(t).replace(/<[^>]*>/g, '').replace(/\\n/g, ' ').trim());
    } catch (e) { /* unreadable text file: left out */ }
  }
  const r = result(S), cards = {}, breeds = {};
  for (const c of r.cards) { const t = map.get('desc/squad/' + lc(c.name)) || map.get('desc/squad/' + lc(c.name.replace(/\([^)]*\)\s*$/, ''))) || map.get('desc/entity/' + lc(c.name)) || (c.vehicles[0] && map.get('desc/entity/' + lc(c.vehicles[0]))); if (t) cards[c.name] = t; }
  for (const b of r.breeds) { const t = map.get('desc/human/' + lc(b.id)); if (t) breeds[b.side + '/' + b.breed] = t; }
  S.names = { cards, breeds, keys: map.size };
  return S.names;
}

// ---- the saved model: resource/set/multiplayer/units/price_model.inc in the mod, the folder and name the AS2 / AS64 model file uses.
// Plain SDL text, included by nothing, so the game never reads it [I: GoH loads units/*.set through the roster includes only].
// {goh_price_model {weapon "k98" 8} {tier "tier3/mg" 10} {vet "3" 2} {kit "faust" 0} {special "inf_medic" 30}}, CRLF.
const MODEL_KEY = UNITS + 'price_model.inc';
const GROUPS = [['weapon', 'weapons'], ['tier', 'tiers'], ['vet', 'vets'], ['kit', 'extras'], ['special', 'specials']];
const WORD = new Map(GROUPS), GROUP = new Map(GROUPS.map(([w, g]) => [g, w]));
const qkey = k => '"' + String(k).replace(/["{}\r\n]/g, '') + '"';
function modelText(gm) {
  const L = ['; price_model.inc: the Gates of Hell price model of the ARSENAL price calculator. INCLUDED BY NOTHING: the game does not read it.',
    '; a breed row: fair price = weapon + tier + vet + each kit; a class with no tier in its define name: the special price of that class.', '{goh_price_model'];
  for (const [w, g] of GROUPS) for (const x of (gm && gm[g]) || []) if (x.price != null && isFinite(x.price)) L.push('\t{' + w + ' ' + qkey(x.key) + ' ' + r2(x.price) + '}');
  L.push('}');
  return L.join('\r\n') + '\r\n';
}
const TERM_RE = /^\s*\{\s*(weapon|tier|vet|kit|special)\s+"([^"]*)"\s+(-?\d+(?:\.\d+)?)\s*\}\s*(?:;.*)?$/i;
// -> {model, errs:[{line, msg}]}; a line it does not read is an error (the rest is read)
function readModel(text) {
  const model = { weapons: [], tiers: [], vets: [], extras: [], specials: [] }, errs = [];
  let root = false, closed = false;
  String(text).split(/\r?\n/).forEach((l, i) => {
    const t = l.replace(/^\s*;.*$/, '').trim(); if (!t) return;
    if (!root) { if (/^\{\s*goh_price_model\s*$/i.test(t)) root = true; else errs.push({ line: i + 1, msg: 'the model starts with {goh_price_model' }); return; }
    if (closed) { errs.push({ line: i + 1, msg: 'text after the closing }' }); return; }
    if (/^\}\s*(;.*)?$/.test(t)) { closed = true; return; }
    const m = TERM_RE.exec(l);
    if (!m) { errs.push({ line: i + 1, msg: 'not a {weapon|tier|vet|kit|special "name" number} line: ' + t.slice(0, 60) }); return; }
    const g = model[WORD.get(m[1].toLowerCase())], k = m[2];
    const o = g.find(x => String(x.key) === k);
    if (o) { o.price = Number(m[3]); errs.push({ line: i + 1, msg: m[1] + ' "' + k + '" given twice; the last one is used' }); } else g.push({ key: k, price: Number(m[3]) });
  });
  if (!root) errs.push({ line: 0, msg: 'no {goh_price_model block' }); else if (!closed) errs.push({ line: 0, msg: 'the {goh_price_model block is not closed' });
  return { model, errs };
}
// in-place edits of the model text: ops [{op:'term', group:'weapons'|..., key, price}] (price null or '' = the line goes); other lines,
// comments and the line ends stay. -> {text, done, errs[]}
function editModel(text, ops) {
  const eol = /\r\n/.test(text) ? '\r\n' : '\n', L = String(text).split(/\r?\n/), errs = []; let done = 0;
  for (const op of ops || []) {
    const w = GROUP.get(op && op.group);
    if (!op || op.op !== 'term' || !w) { errs.push('unknown edit: ' + JSON.stringify(op).slice(0, 80)); continue; }
    const k = String(op.key == null ? '' : op.key), drop = op.price == null || op.price === '', v = Number(op.price);
    if (!k || /["{}]/.test(k)) { errs.push('a name with no quote or brace is needed'); continue; }
    if (!drop && !isFinite(v)) { errs.push(w + ' "' + k + '": the price is not a number'); continue; }
    const at = L.findIndex(l => { const m = TERM_RE.exec(l); return m && m[1].toLowerCase() === w && m[2] === k; });
    if (at >= 0) { if (drop) L.splice(at, 1); else { const m = /(-?\d+(?:\.\d+)?)(\s*\}\s*(?:;.*)?)$/.exec(L[at]); L[at] = L[at].slice(0, m.index) + r2(v) + m[2]; } done++; continue; }
    if (drop) { done++; continue; }
    let end = -1; for (let i = L.length - 1; i >= 0; i--) if (/^\s*\}\s*(;.*)?$/.test(L[i])) { end = i; break; }
    if (end < 0) { errs.push('the model has no closing }'); continue; }
    L.splice(end, 0, '\t{' + w + ' ' + qkey(k) + ' ' + r2(v) + '}'); done++;
  }
  return { text: L.join(eol), done, errs };
}
// GoH writes keep their restore points in one group (the id of the first point), so Undo can take the whole last write back
function markGroup(MW, mod, ids, extra) {
  const root = MW.restoreRoot(mod);
  for (const id of ids) { const f = path.join(root, id, 'restore-point.json'); try { const j = JSON.parse(fs.readFileSync(f, 'utf8')); Object.assign(j, { group: ids[0] }, extra || {}); fs.writeFileSync(f, JSON.stringify(j, null, 1)); } catch (e) { /* a point that cannot be marked stays a plain point of the Files page */ } }
}
// write the model text (only MODEL_KEY): read check, guard, restore point, the file. -> {rel, tag, points, undo}
function saveModel(S, text) {
  const m = readModel(text);
  if (m.errs.length) throw new Error('the model does not read: line ' + m.errs[0].line + ': ' + m.errs[0].msg);
  const MW = require('../lib/modwrite'), gopt = S.o.game ? { game: S.o.game } : {};
  MW.guardFile(S.modDir, path.join(S.modDir, ...MODEL_KEY.split('/')), gopt);
  const points = MW.restorePoints(S.modDir, [MODEL_KEY], 'pricecalc-goh-model', gopt);
  markGroup(MW, S.modDir, points);
  MW.writeFiles(S.modDir, [[MODEL_KEY, Buffer.from(String(text).replace(/\r?\n/g, '\r\n'), 'latin1')]], gopt);
  return { rel: MODEL_KEY, tag: points.join(' '), points, undo: MW.restoreRoot(S.modDir) };
}
// Undo: the newest GoH price write of this tool (a price write or a model save) not taken back yet, from its restore points. The files as
// they are now get restore points first (action pricecalc-goh-undo), so the Files page can take the undo back too.
// the price calculator's restore points of a mod not yet taken back, and the newest of them (null when none)
function openPoints(modDir) {
  const root = require('../lib/modwrite').restoreRoot(modDir);
  let pts = [];
  try { pts = fs.readdirSync(root).map(id => { try { return JSON.parse(fs.readFileSync(path.join(root, id, 'restore-point.json'), 'utf8')); } catch (e) { return null; } }); } catch (e) { pts = []; }
  pts = pts.filter(p => p && /^pricecalc-goh(-model)?$/.test(p.action) && !p.undone && p.group);
  return { root, pts, last: pts.length ? pts.reduce((a, p) => (p.time > a.time || (p.time === a.time && p.id > a.id)) ? p : a) : null };
}
// the group Undo would take back next (its tag), or null
function lastUndo(modDir) { try { const o = openPoints(modDir); return o.last ? o.last.group : null; } catch (e) { return null; } }
function undoLast(S) {
  const MW = require('../lib/modwrite'), gopt = S.o.game ? { game: S.o.game } : {}, { root, pts, last } = openPoints(S.modDir);
  if (!last) throw new Error('Nothing to undo: no price calculator write found in this mod.');
  const group = pts.filter(p => p.group === last.group);
  const rels = group.map(p => p.rel);
  for (const r of rels) MW.guardFile(S.modDir, path.join(S.modDir, ...r.split('/')), gopt);
  const before = MW.restorePoints(S.modDir, rels, 'pricecalc-goh-undo', gopt);
  const changed = [], removed = [];
  for (const p of group) {
    const f = path.join(S.modDir, ...p.rel.split('/'));
    if (p.existed) { MW.writeFiles(S.modDir, [[p.rel, fs.readFileSync(path.join(root, p.id, 'files', ...p.rel.split('/')))]], gopt); changed.push(p.rel); }
    else if (fs.existsSync(f)) { fs.unlinkSync(f); removed.push(p.rel); }
  }
  markGroup(MW, S.modDir, group.map(p => p.id).sort((a, b) => a === last.group ? -1 : b === last.group ? 1 : 0), { undone: new Date().toISOString() });
  return { tag: last.group, changed, created: removed, points: before, undo: root };
}

// ---- check, plan, write: the mod's own breed rows against the model fitted on the GAME alone (the game's prices are the measure) ----
// or, when the mod has a saved model (MODEL_KEY), against that model.
// gameFit({game, empty}) -> {model, prices{id: game cost}, quality}: the game read through an empty folder (o.empty), nothing written.
// A row is far off when |mod - fair| > tol x fair (tol 0.2 unless given) [I: the bound is a choice, not a game rule].
// The write changes only the price number of a far-off row in a loose .set file of the mod (bytes, CRLF and the rest of the file kept;
// the number keeps its decimals, e.g. 8.0), after a restore point (lib/modwrite, Files page form, one group per write for Undo). The
// price is found as: cost(N) on the row's line; else the one cost(N) or {cost N} of the row's block over several lines; else the
// define the row calls, when a loose file of the mod defines it with one number price and no other row uses it. opt.copyGame (an
// explicit opt-in): a far-off row the mod takes from the game gets its game file copied into the mod first, then changed. Refused per
// row, with the reason: the row in a pak, the price set twice, a define in the game or shared by other rows, the number not the
// price read. [T] none of it is tried in game.
const TOL = 0.2;
function gameFit(o) {
  const S = open({ mod: o.empty, game: o.game }), r = result(S), prices = {};
  for (const b of r.breeds) prices[lc(b.id)] = b.mod.mp;
  return { model: r.gohModel, prices, quality: r.quality.breeds };
}
function termMaps(gm) { const m = t => new Map((t || []).map(x => [String(x.key), x.price])); return { W: m(gm.weapons), T: m(gm.tiers), V: m(gm.vets), A: m(gm.extras), S: m(gm.specials) }; }
// a breed row (result().breeds) priced with the game's terms; a term the game has no price for: not priced (missing says which)
function fairWith(M, b) {
  if (b.rule === 'special') return M.S.has(String(b.cls)) ? { fair: M.S.get(String(b.cls)), missing: [] } : { fair: null, missing: ['class ' + b.cls] };
  const miss = [];
  if (!b.item || !M.W.has(String(b.item))) miss.push('weapon ' + (b.item || '(none)'));
  if (!b.tier || !M.T.has(String(b.tier))) miss.push('tier ' + (b.tier || '(none)'));
  if (!M.V.has(String(b.vetStart))) miss.push('veterancy ' + b.vetStart);
  for (const e of b.extras || []) if (!M.A.has(String(e))) miss.push('kit ' + e);
  if (miss.length) return { fair: null, missing: miss };
  return { fair: M.W.get(String(b.item)) + M.T.get(String(b.tier)) + M.V.get(String(b.vetStart)) + (b.extras || []).reduce((s, e) => s + M.A.get(String(e)), 0), missing: [] };
}
const tolOf = t => { const v = Number(t); return isFinite(v) && v >= 0.02 && v <= 1 ? v : TOL; };
// the rows measured: those the mod serves (a loose file or a pak of the mod), one per file line; with opt.copyGame also the rows the
// mod takes from the game (where 'vfs': the write copies the game file into the mod first). The measure: the mod's saved model when
// it has one, else the model fitted on the game alone.
function measureOf(S, gf) { return S.saved ? { model: S.saved.model, by: 'the saved model of the mod' } : { model: gf.model, by: 'the model fitted on the game' }; }
function review(S, R, gf, tol, copyGame) {
  const ms = measureOf(S, gf), M = termMaps(ms.model), seen = new Set(), rows = [];
  for (const b of R.breeds) {
    const w = S.s.winner(b.file); if (w !== 'local' && w !== 'pak' && !(copyGame && w === 'vfs')) continue;
    const k = b.file + ':' + b.line; if (seen.has(k)) continue; seen.add(k);
    const f = fairWith(M, b), fair = f.fair == null ? null : r2(f.fair), mod = b.mod.mp, game = gf.prices[lc(b.id)];
    const off = fair != null && mod != null && Math.abs(mod - fair) > tol * Math.max(fair, 1) && Math.round(fair) !== mod;   // a row already at the rounded model price is never off
    rows.push({ id: b.id, side: b.side, breed: b.breed, file: b.file, line: b.line, cls: b.cls, where: w, mod, fair, game: game == null ? null : game, missing: f.missing, off,
      pct: fair != null && mod != null ? Math.round((mod - fair) / Math.max(fair, 1) * 100) : null });
  }
  return rows;
}
// rows the mod takes from the game that are far from the measure (offered with the copy opt-in; not counted as the mod's)
const fromGame = (S, R, gf, tol) => review(S, R, gf, tol, true).filter(x => x.where === 'vfs' && x.off);
function check(S, R, gf, opt) {
  const tol = tolOf(opt && opt.tol), rows = review(S, R, gf, tol), findings = [], by = measureOf(S, gf).by;
  for (const x of rows) {
    if (x.off) findings.push({ file: x.file, line: x.line, code: 'GOH_PRICE_FAR', severity: 'warning',
      msg: x.id + ': ' + x.mod + ' MP, ' + by + ' says ' + x.fair + (x.game != null ? ' (the game sells it for ' + x.game + ')' : ' (not in the game)') + ', ' + (x.pct > 0 ? '+' : '') + x.pct + '%' });
    else if (x.fair == null) findings.push({ file: x.file, line: x.line, code: 'GOH_NOT_PRICED', severity: 'info', msg: x.id + ': not checked, ' + by + ' has no price for ' + x.missing.join(', ') });
  }
  const far = rows.filter(x => x.off).length, fg = S.saved ? fromGame(S, R, gf, tol).length : 0;
  findings.push({ file: UNITS, line: 0, code: rows.length ? 'GOH_CHECKED' : 'GOH_NO_MOD_ROWS', severity: 'info',
    msg: rows.length ? rows.length + ' breed price row(s) of the mod checked, ' + far + ' more than ' + Math.round(tol * 100) + '% from ' + by : 'the mod has no breed price rows of its own (units/<period>/inf_<army>.set): nothing to check' });
  if (fg) findings.push({ file: UNITS, line: 0, code: 'GOH_GAME_ROWS_FAR', severity: 'info', msg: fg + ' row(s) the mod takes from the game are more than ' + Math.round(tol * 100) + '% from ' + by + '; the write can copy their game files into the mod first (opt-in)' });
  return { goh: true, tol, findings, count: far, rows, fromGame: fg, by };
}
const COST_RE = /\bcost\s*\(\s*(-?\d+(?:\.\d+)?)\s*\)/g;
const BLOCK_RE = /\{\s*cost\s+(-?\d+(?:\.\d+)?)\s*\}/gi;
// one row's new line, or the reason it is not changed (the row on one line, its price a cost(N) there)
function spliceLine(L, x, nv) {
  if (!lc(L).includes('"' + lc(x.id) + '"')) return { why: 'its line does not name the row (the file changed since it was read?)' };
  const code = L.replace(/"[^"]*"/g, m => ' '.repeat(m.length)).replace(/;[\s\S]*$/, '');
  const opens = (code.match(/[{(]/g) || []).length, closes = (code.match(/[})]/g) || []).length;
  if (opens !== closes) return { why: 'the row runs over more than one line; change it by hand' };
  const ms = [...code.matchAll(COST_RE)];
  if (ms.length !== 1) return { why: ms.length ? 'its line sets cost(N) ' + ms.length + ' times; change it by hand' : 'its price is not a cost(N) on its own line (set by a define or a {cost} block); change it by hand' };
  const m = ms[0], num = m[1];
  if (Math.abs(parseFloat(num) - x.mod) > 1e-9) return { why: 'the cost(' + num + ') on its line is not the price read (' + x.mod + '); change it by hand' };
  const dec = (/\.(\d+)$/.exec(num) || [null, ''])[1].length, txt = nv.toFixed(dec);
  const at = m.index + m[0].indexOf(num, m[0].indexOf('('));
  return { line: L.slice(0, at) + txt + L.slice(at + num.length), text: txt };
}
// the lines of a block that opens on line i0 (0-based) at column c0 and closes where its brackets balance: strings and ; comments
// are passed over. -> {end (0-based line), code: [masked line text]} or null (not closed)
function spanOf(lines, i0, c0) {
  const code = [];
  let d = 0;
  for (let i = i0; i < lines.length && i < i0 + 400; i++) {
    let t = lines[i].replace(/\r$/, '').replace(/"[^"]*"/g, m => ' '.repeat(m.length)).replace(/;[\s\S]*$/, '');
    if (i === i0) t = ' '.repeat(c0) + t.slice(c0);
    code.push(t);
    for (const ch of t) { if (ch === '{' || ch === '(') d++; else if (ch === '}' || ch === ')') { d--; if (d === 0) return { end: i, code }; } }
  }
  return null;
}
// the price literals of a span: cost(N) or {cost N} -> [{i (line index), at (column of the number), num}]
function costsIn(code, i0) {
  const out = [];
  code.forEach((t, k) => { for (const re of [COST_RE, BLOCK_RE]) for (const m of t.matchAll(re)) out.push({ i: i0 + k, at: m.index + m[0].lastIndexOf(m[1]), num: m[1] }); });
  return out;
}
const setNum = (L, c, nv) => { const dec = (/\.(\d+)$/.exec(c.num) || [null, ''])[1].length, txt = nv.toFixed(dec); return L.slice(0, c.at) + txt + L.slice(c.at + c.num.length); };
// a row whose price is not on its own line: the row's block over several lines ({cost N} or cost(N) once in it), else the define its
// macro call names, when that define (in a loose file of the mod) sets the price once and no other row of the mod uses it.
// -> {edits:[{file (vfs key), i, line}], via} | {why}
function spliceRow(S, getLines, x, nv) {
  const lines = getLines(x.file), i0 = x.line - 1, L = lines && lines[i0];
  if (L == null) return { why: 'the file has no line ' + x.line };
  const c0 = lc(L).indexOf('"' + lc(x.id) + '"');
  if (c0 < 0) return { why: 'its line does not name the row (the file changed since it was read?)' };
  const open = L.lastIndexOf('{', c0);
  const sp = spanOf(lines, i0, open < 0 ? c0 : open);
  if (!sp) return { why: 'the row is not closed where it was read; change it by hand' };
  const cs = costsIn(sp.code, i0);
  if (cs.length > 1) return { why: 'the row sets its price ' + cs.length + ' times; change it by hand' };
  if (cs.length === 1) {
    if (Math.abs(parseFloat(cs[0].num) - x.mod) > 1e-9) return { why: 'the price ' + cs[0].num + ' in the row is not the price read (' + x.mod + '); change it by hand' };
    return { edits: [{ file: x.file, i: cs[0].i, line: setNum(lines[cs[0].i], cs[0], nv) }], via: sp.end > i0 ? 'row over ' + (sp.end - i0 + 1) + ' lines' : 'row' };
  }
  // the define the row calls: ("name" ...) in the row
  const call = /\(\s*"([^"]+)"/.exec([lines[i0].slice(c0 + x.id.length + 2)].concat(lines.slice(i0 + 1, sp.end + 1)).join('\n'));
  if (!call) return { why: 'no price in the row and no define call in it; change it by hand' };
  const name = call[1], dre = new RegExp('\\(\\s*define\\s+"' + call[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"', 'i');
  let def = null, uses = 0;
  for (const k of S.keys) {
    if (!/^resource\/set\/multiplayer\/units\/.*\.(set|inc)$/i.test(k)) continue;
    const ls = getLines(k); if (!ls) continue;
    ls.forEach((l, i) => { if (dre.test(l)) { if (!def) def = { file: k, i }; } else if (l.toLowerCase().includes('("' + lc(name) + '"')) uses++; });
  }
  if (!def) return { why: 'its price comes from the define "' + name + '", which no units file sets; change it by hand' };
  const w = S.s.winner(def.file);
  if (w !== 'local') return { why: 'its price is set in the define "' + name + '" in ' + def.file + (w === 'pak' ? ' (a .pak of the mod)' : ' (a game file)') + '; change it by hand' };
  if (uses !== 1) return { why: 'its price is set in the define "' + name + '", which ' + uses + ' rows use; changing it changes all of them, change it by hand' };
  const dl = getLines(def.file), dsp = spanOf(dl, def.i, dl[def.i].search(/\(\s*define/i));
  if (!dsp) return { why: 'the define "' + name + '" is not closed; change it by hand' };
  const dc = costsIn(dsp.code, def.i);
  if (dc.length !== 1) return { why: 'the define "' + name + '" sets ' + (dc.length ? 'the price ' + dc.length + ' times' : 'no number price (it passes the price on)') + '; change it by hand' };
  if (Math.abs(parseFloat(dc[0].num) - x.mod) > 1e-9) return { why: 'the price ' + dc[0].num + ' in the define "' + name + '" is not the price read (' + x.mod + '); change it by hand' };
  return { edits: [{ file: def.file, i: dc[0].i, line: setNum(dl[dc[0].i], dc[0], nv) }], via: 'define "' + name + '" (' + def.file + ':' + (def.i + 1) + ')' };
}
// -> {rows (changed), refused, files: Map rel -> {abs, rel, before, after, lines[], at[], copied}, fromGame}
// opt.copyGame: rows the mod takes from the game are changed too; their game file is copied into the mod first (whole, the bytes as
// the game has them: a mod file at a game path replaces the game file there, GHVFS)
function planEdits(S, R, gf, opt) {
  const tol = tolOf(opt && opt.tol), copy = !!(opt && opt.copyGame), rows = review(S, R, gf, tol, copy).filter(x => x.off), refused = [], done = [], files = new Map();
  const relOf = key => { const w = S.s.winner(key); if (w === 'local') { const abs = S.s.loosePath(key); return { abs, rel: path.relative(S.modDir, abs).split(path.sep).join('/'), w }; } return { abs: path.join(S.modDir, ...key.split('/')), rel: key, w }; };
  const fileOf = key => {
    const r = relOf(key); let f = files.get(r.rel);
    if (!f) { const before = r.w === 'local' ? fs.readFileSync(r.abs) : S.s.get(key); f = { abs: r.abs, rel: r.rel, key, before, lines: before.toString('latin1').split('\n'), at: [], copied: r.w === 'vfs' }; files.set(r.rel, f); }
    return f;
  };
  const getLines = key => { const w = S.s.winner(key); if (!w) return null; if (w === 'pak') { const b = S.s.get(key); return b ? b.toString('latin1').split('\n') : null; } return fileOf(key).lines; };
  for (const x of rows) {
    const nv = Math.round(x.fair);
    if (!(nv > 0)) { refused.push({ id: x.id, file: x.file, line: x.line, why: 'the model price is not above zero' }); continue; }
    if (x.where === 'pak') { refused.push({ id: x.id, file: x.file, line: x.line, why: 'the row sits in a .pak of the mod; unpack it to a loose file to change it here' }); continue; }
    const r = relOf(x.file);
    if (!r.rel || r.rel.startsWith('..') || path.isAbsolute(r.rel)) { refused.push({ id: x.id, file: x.file, line: x.line, why: 'the file is not inside the mod folder' }); continue; }
    const f = fileOf(x.file), L = f.lines[x.line - 1];
    if (L == null) { refused.push({ id: x.id, file: x.file, line: x.line, why: 'the file has no line ' + x.line }); continue; }
    let sp = spliceLine(L, x, nv), ed;
    if (!sp.why) ed = { edits: [{ file: x.file, i: x.line - 1, line: sp.line }], via: 'line' };
    else if (/more than one line|not a cost\(N\) on its own line/.test(sp.why)) ed = spliceRow(S, getLines, x, nv);
    else ed = { why: sp.why };
    if (ed.why) { refused.push({ id: x.id, file: x.file, line: x.line, why: ed.why }); continue; }
    for (const e of ed.edits) { const g = fileOf(e.file); g.lines[e.i] = e.line; g.at.push(e.i + 1); }
    done.push({ id: x.id, file: x.file, rel: r.rel, line: x.line, old: x.mod, new: nv, fair: x.fair, game: x.game, pct: x.pct, via: ed.via, copied: f.copied, at: ed.edits.map(e => e.file + ':' + (e.i + 1)) });
  }
  for (const [rel, f] of [...files]) { if (!f.at.length) { files.delete(rel); continue; } f.after = Buffer.from(f.lines.join('\n'), 'latin1'); }
  return { tol, rows: done, refused, files, fromGame: copy ? 0 : fromGame(S, R, gf, tol).length };
}
function plan(S, R, gf, opt) {
  const p = planEdits(S, R, gf, opt);
  return { goh: true, tol: p.tol, rows: p.rows, refused: p.refused, createModel: null, outside: [], fromGame: p.fromGame, by: measureOf(S, gf).by,
    copied: [...p.files.values()].filter(f => f.copied).map(f => f.rel),
    files: [...p.files.values()].map(f => ({ rel: f.rel, added: 0, rewritten: f.at.length, copied: f.copied, preview: f.at.map(n => ({ line: n, text: f.lines[n - 1].replace(/\r$/, '') })) })) };
}
// write the plan: every target guarded first (inside the mod, lib/writeguard), a restore point of each file, then the files
function apply(S, R, gf, opt) {
  const MW = require('../lib/modwrite'), gopt = S.o.game ? { game: S.o.game } : {};
  const p = planEdits(S, R, gf, opt), list = [...p.files.values()];
  if (!list.length) return { nothing: true, changed: [], created: [], refused: p.refused, edits: p };
  for (const f of list) MW.guardFile(S.modDir, path.join(S.modDir, ...f.rel.split('/')), gopt);
  const points = MW.restorePoints(S.modDir, list.map(f => f.rel), 'pricecalc-goh', gopt);   // a copied game file: existed false (undo removes it)
  markGroup(MW, S.modDir, points);
  const changed = MW.writeFiles(S.modDir, list.map(f => [f.rel, f.after]), gopt);
  return { tag: points.join(' '), points, undo: MW.restoreRoot(S.modDir), changed, created: list.filter(f => f.copied).map(f => f.rel), rows: p.rows, refused: p.refused, edits: p };
}
// after a write, on a fresh read: only the price numbers changed (every other byte as before), the new price is the one read, a second
// plan changes nothing in the written files
function verify(S2, R2, gf, edits, opt) {
  const findings = [], by = new Map(R2.breeds.map(b => [b.file + ':' + b.line, b]));
  for (const f of edits.files.values()) {
    const cur = fs.readFileSync(path.join(S2.modDir, ...f.rel.split('/'))).toString('latin1').split('\n'), old = f.before.toString('latin1').split('\n');
    const strip = l => l.replace(COST_RE, 'cost()').replace(BLOCK_RE, '{cost}');
    const bad = cur.length !== old.length ? 'line count ' + old.length + ' -> ' + cur.length : (() => { for (let i = 0; i < old.length; i++) if (cur[i] !== old[i] && (!f.at.includes(i + 1) || strip(cur[i]) !== strip(old[i]))) return 'line ' + (i + 1) + ' changed beyond its price'; return ''; })();
    if (bad) findings.push({ file: f.rel, line: 0, code: 'CHECK_DATA_CHANGED', severity: 'error', msg: bad });
    else findings.push({ file: f.rel, line: 0, code: 'CHECK_OK', severity: 'info', msg: f.at.length + ' price(s) changed, every other byte as before' });
  }
  for (const x of edits.rows) {
    const b = by.get(x.file + ':' + x.line);
    if (!b || b.mod.mp !== x.new) findings.push({ file: x.file, line: x.line, code: 'CHECK_PRICE_NOT_READ', severity: 'error', msg: x.id + ': ' + x.new + ' written, ' + (b ? b.mod.mp : 'nothing') + ' read back' });
  }
  const again = planEdits(S2, R2, gf, opt);
  for (const f of again.files.values()) if (edits.files.has(f.rel)) findings.push({ file: f.rel, line: 0, code: 'CHECK_NOT_IDEMPOTENT', severity: 'error', msg: 'a second write would change this file again (' + f.at.length + ' row(s))' });
  return { findings, count: findings.filter(x => x.severity !== 'info').length };
}

module.exports = { lastUndo, open, result, names, fitModel, quality, readBreed, stuffIndex, lineInfo, gameFit, fairWith, termMaps, check, plan, apply, verify, spliceLine, spliceRow, TOL,
  MODEL_KEY, modelText, readModel, editModel, saveModel, undoLast };

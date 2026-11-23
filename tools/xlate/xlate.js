#!/usr/bin/env node
// xlate: GoH -> mowas2 translation table, built from data (XLATE-1).
//   node tools/xlate/xlate.js --goh <dir> --as2 <dir> [--goh-mod <dir>] [--as2-mod <dir>] [--out table.json] [--per N] [--hold F] [--seed S] [--raw raw.json] [--game <src dir with game/>]
//   dir = game dir (resource paks + loose); --*-mod = workshop dir (resource + N.pat overlays); includes missing in a mod resolve in the game dir.
// Reads only; stores percentiles, never assets. Pipeline: units -> extract -> records -> build(records, opt) -> table.
//   record { game:'goh'|'as2', src:'vanilla'|'valour', cls, stem, key, flat:{path:[last number, block count]}, k:{curated key: number} }
//   table  { meta, notes, limits, classes:{cls:{units, keys, curated}}, factors:{cls:{key:{...}}}, holdout:{cls:{key:{...}}}, rows:[{key, cat, reason, ...}] }
// Predictors per curated key and class, chosen on the training pairs only:
//   copy   value as is | factor  value x median(as2/goh over training pairs) | const  the class's median AS2 value (native values barely move)
// The held-back third (by stem, before anything is fitted) only scores the chosen predictor.
// Author: Imperator_Aug (ARSENAL, ia-ceda3fa6)
require('../lib/help')(__filename); // --help / -h: header usage, exit 0 (HELPFIX2)
const fs = require('fs'), path = require('path');

const pct = (arr, p) => { const s = [...arr].sort((a, b) => a - b); if (!s.length) return null; const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return +(s[lo] + (s[hi] - s[lo]) * (i - lo)).toPrecision(5); };
const summ = a => a.length ? { n: a.length, p5: pct(a, .05), p25: pct(a, .25), p50: pct(a, .5), p75: pct(a, .75), p95: pct(a, .95), min: pct(a, 0), max: pct(a, 1) } : null;
const median = a => pct(a, .5);
function rng(seed) { let s = (seed >>> 0) || 1; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; }

// ---------------- curated keys ----------------
// tight = armour, speed, penetration (sheet Q53). path = flat path per game; fn = computed from the tree.
const FACES = ['front', 'side', 'rear', 'top'];
const CURATED = {};
for (const part of ['body', 'turret']) for (const f of FACES) for (const agg of ['max', 'med'])
  CURATED[`armor_${part}_${f}_${agg}`] = { tight: true, unit: 'mm', scope: 'vehicle', fn: 'armor' };
Object.assign(CURATED, {
  mass:           { tight: false, unit: 'kg',   scope: 'vehicle', path: { goh: 'entity/mass', as2: 'entity/mass' } },
  speed:          { tight: true,  unit: 'km/h', scope: 'vehicle', path: { goh: 'entity/chassis/locomotion/maxspeed', as2: 'entity/chassis/locomotion/maxspeed' } },
  turn_time:      { tight: false, unit: 's',    scope: 'vehicle', path: { goh: 'entity/chassis/locomotion/turntime', as2: 'entity/chassis/locomotion/turntime' } },
  start_time:     { tight: false, unit: 's',    scope: 'vehicle', path: { goh: 'entity/chassis/locomotion/starttime', as2: 'entity/chassis/locomotion/starttime' } },
  fuel:           { tight: false, unit: 'l',    scope: 'vehicle', path: { goh: 'entity/chassis/fuelbag/volume', as2: 'entity/chassis/fuelbag/volume' } },
  threshold_pierce_koef: { tight: false, unit: 'x thickness', scope: 'vehicle', path: { goh: 'entity/armor/setting/threshold/pierce/koef', as2: 'entity/armor/setting/threshold/pierce/koef' } },
  threshold_blast_koef:  { tight: false, unit: 'x thickness', scope: 'vehicle', path: { goh: 'entity/armor/setting/threshold/blast/koef', as2: 'entity/armor/setting/threshold/blast/koef' } },
  threshold_pierce_value: { tight: false, unit: 'mm', scope: 'vehicle', path: { goh: 'entity/armor/setting/threshold/pierce/koef', as2: 'entity/armor/setting/threshold/pierce/value' } },
  threshold_blast_value:  { tight: false, unit: '',   scope: 'vehicle', path: { goh: 'entity/armor/setting/threshold/blast/koef', as2: 'entity/armor/setting/threshold/blast/value' } },
  part_health:    { tight: false, unit: 'hp->durability', scope: 'vehicle', path: { goh: 'entity/perks/component/health/hp', as2: 'entity/armor/setting/durability/pierce/value' } },
  pen_a:          { tight: true,  unit: 'mm',   scope: 'weapon', fn: 'weapon' },
  pen_c:          { tight: true,  unit: 'mm',   scope: 'weapon', fn: 'weapon' },
  pen_e:          { tight: true,  unit: 'mm',   scope: 'weapon', fn: 'weapon' },
  recharge:       { tight: false, unit: 's',    scope: 'weapon', fn: 'weapon' },
  range:          { tight: false, unit: 'm',    scope: 'weapon', fn: 'weapon' },
  damage:         { tight: false, unit: '',     scope: 'weapon', fn: 'weapon' },
});

// engine side of the same keys, read from game/ [V]. No numeric clamp is applied at read time for the movement keys.
const LIMITS = {
  speed: { reader: '', form: 'km/h float, no clamp at read [V]; ordered moves use 0.45/0.67/0.92 of it (:550-552) [V]' },
  turn_time: { reader: '', form: 'seconds for a full turn, no clamp at read [V]' },
  start_time: { reader: '', form: 'seconds, no clamp at read [V]' },
  armor_thickness: { reader: '', form: '1, 2 or 4 numbers (all sides / front+rest / front side rear top); 3 numbers is the known misread [V]' },
  threshold: { reader: '', form: 'value; else koef x thickness; else thickness / penetration; else 2/3 thickness [V]' },
  part_health: { reader: ' (GetDurability), :201-216 (GetDamage)', form: 'per armour AREA, not per mesh part: durability/{pierce,blast} value (absolute); else koef x thickness; else material factor x thickness. A hit adds (energy-threshold)*thickness/(thickness-threshold)/durability to that area\'s wound fraction [V]' },
  pen: { reader: 'set/stuff projectiledamagetable pairs (distance m, mm)', form: 'engine bounds not read; knots 20/100/170/215/250 m in AS2 presets [V modweb armor-pen]' },
};

// ---------------- reading ----------------
function loadSide(dir, base) {
  const pd = require('../pairdiff/pairdiff.js');
  const s = pd.collect(dir);
  if (base) s.base = pd.collect(base);
  return s;
}
const readEnt = e => e.path ? fs.readFileSync(e.path) : require('../lib/pakset').read(e);

// vehicle unit = .def whose stem equals its folder name. GoH roots in <nation>/<class>/, AS2 in <class>/
function vehicleUnits(side, game) {
  const out = [];
  for (const k of side.map.keys()) {
    if (!k.startsWith('entity/-vehicle/') || !k.endsWith('.def')) continue;
    const p = k.split('/'), stem = p[p.length - 1].slice(0, -4);
    if (p[p.length - 2] !== stem) continue;
    const cls = game === 'goh' ? p[3] : p[2];
    if (!cls || p.length < (game === 'goh' ? 6 : 5)) continue;
    out.push({ key: k, stem, cls, scope: 'vehicle' });
  }
  return out.sort((a, b) => a.key < b.key ? -1 : 1);
}
const WEAPON_DIRS = new Set(['gun', 'mgun', 'smg', 'rifle', 'pistol', 'special', 'reactive', 'flame', 'bazooka', 'mortar', 'head', 'melee']);
function weaponUnits(side) {
  const out = [];
  for (const k of side.map.keys()) {
    const p = k.split('/');
    if (p[0] !== 'set' || p[1] !== 'stuff' || p.length !== 4 || !WEAPON_DIRS.has(p[2])) continue;
    const b = p[3];
    if (b.includes('.') && !b.endsWith('.weapon')) continue;
    out.push({ key: k, stem: b.replace(/\.weapon$/, ''), cls: 'w:' + p[2], scope: 'weapon' });
  }
  return out.sort((a, b) => a.key < b.key ? -1 : 1);
}

function parseTree(side, key, game) {
  const sdlx = require('../lib/sdlx'), CK = require('../portdiff/checks'), { fixHashTags } = require('../goh2as2/goh2as2');
  const fix = b => game === 'goh' && b.includes('{##') ? Buffer.from(CK.stripDisabledBlocks(fixHashTags(b.toString('latin1'))), 'latin1') : b;
  const open = r => {
    if (r.kind !== 'virtual') return null;
    const k = r.key.replace(/^resource\//, '');
    const e = side.map.get(k) || (side.base && side.base.map.get(k));
    return e ? { buf: fix(readEnt(e)), file: r.key, key: r.key } : null;
  };
  const b = fix(readEnt(side.map.get(key)));
  if (b.includes(0) && !(b[0] === 0xFF || b[0] === 0xFE)) return null;
  const fk = 'resource/' + key;
  // a stuff file gets its directory's .presets included first (the loader does this; the damage/penetration macros live there)
  const pre = [];
  if (key.startsWith('set/stuff/') && !key.endsWith('.presets')) {
    const pk = key.slice(0, key.lastIndexOf('/') + 1) + '.presets';
    if (side.map.has(pk) || (side.base && side.base.map.has(pk))) pre.push('resource/' + pk);
  }
  return sdlx.read(b, { file: fk, key: fk, open, onError: () => {}, preInclude: pre }).root;
}

// every block path -> [first numeric arg, count of blocks at that path]; the root block folds to `entity`
function flatten(root) {
  const M = require('../keylint/model'), out = {};
  const walk = (b, p, isRoot, d) => {
    if (d > 8) return;
    for (const c of M.parts(b, isRoot).kids) {
      const cp = M.parts(c, false);
      if (!cp.key || (cp.keyTok && cp.keyTok.k === 'IDENT' && cp.keyTok.text[0] === '%')) continue;
      const id = (p ? p + '/' : '') + String(cp.key).toLowerCase().replace(/^game_entity$/, 'entity');
      const t = cp.toks.find(x => typeof x.value === 'number');
      const e = out[id] || (out[id] = [null, 0]);
      e[1]++;
      if (t) e[0] = t.value;   // last wins: the reader assigns in order, so a macro default is overridden by the unit's own line
      walk(c, id, false, d + 1);
    }
  };
  walk(root, '', true, 0);
  return out;
}

// armour: body/turret face thickness, one function for both games so values compare like with like.
//  per-volume `{thickness T {front F}{rear}{top}{bottom}{left}{right}}` (GoH .ext, AS2 def); an AS2 `armor/setting` area (thickness F S R T,
//  `volumes` patterns) replaces the volume's values for the volumes it matches. Per face: max over the part's volumes, and median.
function armorFaces(root, game) {
  const { armorOf } = require('../statsheet/statsheet.js'), ix = require('../entityindex/index');
  const top = ix.kids(root).find(b => /^(game_)?entity$/i.test(ix.nameOf(b) || '')) || root;
  const { volumes, areas } = armorOf(top);
  const wild = (pat, s) => new RegExp('^' + String(pat).toLowerCase().replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$').test(String(s).toLowerCase());
  const acc = { body: { front: [], side: [], rear: [], top: [] }, turret: { front: [], side: [], rear: [], top: [] } };
  // XLATE-4: area first (as translate.armourRead and armour/rule.js). The old reader classed engine*/mantlet/cupola volumes as body/turret and let the engine area replace the hull.
  // AS2: the part's OWN area (name or pattern body*|hull* / turret*) gives the faces; none -> the part's own volumes (body*|hull*, turret*; GoH also by tag body|hull / turret).
  const RE = { body: /^(body|hull)/i, turret: /^turret/i }, TAG = { body: /body|hull/i, turret: /turret/i };
  for (const part of ['body', 'turret']) {
    const a = game === 'as2' ? areas.find(x => x.t && (RE[part].test(x.name) || x.pats.some(p => RE[part].test(p)))) : null;
    if (a) { for (const f of FACES) if (a.t[f] > 0) acc[part][f].push(a.t[f]); continue; }
    for (const v of volumes) {
      if (!(RE[part].test(v.name) || (game !== 'as2' && TAG[part].test(v.tag || '') && !/^(engine|mantlet|cupola)/i.test(v.name)))) continue;
      const t = { front: v.sides.front, side: Math.max(v.sides.left, v.sides.right), rear: v.sides.rear, top: v.sides.top };
      for (const f of FACES) if (t[f] > 0) acc[part][f].push(t[f]);
    }
  }
  const out = {};
  for (const part of ['body', 'turret']) for (const f of FACES) {
    const l = acc[part][f]; if (!l.length) continue;
    out[`armor_${part}_${f}_max`] = Math.max(...l);
    out[`armor_${part}_${f}_med`] = median(l);
  }
  return out;
}

// weapon: penetration (mm) at 100 and 250 m from the projectiledamagetable of the first block that has one, recharge, range, damage
function weaponFacts(root) {
  const ix = require('../entityindex/index'), lc = s => String(s).toLowerCase();
  const ks = ix.kids(root), top = ks.find(b => lc(ix.nameOf(b) || '') === 'from') || ks[ks.length - 1]; if (!top) return {};
  const kid = (b, n) => ix.kids(b).find(c => lc(ix.nameOf(c) || '') === n);
  const num = b => { const a = b && ix.argsOf(b).find(t => typeof t.value === 'number'); return a ? a.value : null; };
  const out = {}, t = kid(top, 'projectiledamagetable');
  if (t) {
    // each pair is a child block `{distance mm}`: both numbers are items of the block (the first is not a name)
    const pts = ix.kids(t).map(c => c.items.filter(x => x.k !== 'BLOCK' && x.k !== 'MOD' && typeof x.value === 'number').map(x => x.value))
      .filter(a => a.length >= 2 && a[0] >= 0).sort((a, b) => a[0] - b[0]);
    // knot distances move with the gun's range macro (10/50/75/100/125 m for range_short), so compare by knot index: a, c, e = points 1, 3, 5
    if (pts.length >= 5) { out.pen_a = pts[0][1]; out.pen_c = pts[2][1]; out.pen_e = pts[4][1]; }
  }
  const rc = num(kid(top, 'rechargetime')); if (rc !== null) out.recharge = rc;
  const rg = num(kid(top, 'range')); if (rg !== null) out.range = rg;
  const pd = num(kid(top, 'projectiledamage')); if (pd !== null) out.damage = pd;
  return out;
}

function extract(side, game, u, src) {
  const root = parseTree(side, u.key, game);
  if (!root) return null;
  const flat = flatten(root), k = {};
  if (u.scope === 'vehicle') {
    for (const [name, c] of Object.entries(CURATED)) if (c.scope === 'vehicle' && c.path) { const e = flat[c.path[game]]; if (e && e[0] !== null) k[name] = e[0]; }
    try { Object.assign(k, armorFaces(root, game)); } catch (e) { /* armour left out for this unit */ }
  } else {
    try { Object.assign(k, weaponFacts(root)); } catch (e) { /* none */ }
    // GoH writes penetration as macro calls `("penetration_x" shell(ap) range(R) a() b() c() d() e())`, knots 30/100/155/205/250 m;
    // the expanded form is not the AS2 table, so read the call itself: b = pen at 100 m, e = pen at 250 m (first AP-type shell, else first call)
    if (game === 'goh' && k.pen_a === undefined) {
      const txt = readEnt(side.map.get(u.key)).toString('latin1'), calls = [];
      const re = /\(\s*"penetration_\w+"\s+shell\((\w+)\)\s+range\(([\d.]+)\)\s+a\(([\d.]+)\)\s+b\(([\d.]+)\)\s+c\(([\d.]+)\)\s+d\(([\d.]+)\)\s+e\(([\d.]+)\)/gi;
      for (let m; (m = re.exec(txt));) calls.push({ shell: m[1].toLowerCase(), a: +m[3], c: +m[5], e: +m[7], range: +m[2] });
      const c = calls.find(x => /^ap(?!cr|cbc)/.test(x.shell) || x.shell === 'ap') || calls[0];
      if (c) { k.pen_a = c.a; k.pen_c = c.c; k.pen_e = c.e; }
    }
  }
  return { game, src, cls: u.cls, stem: u.stem, key: u.key, flat, k };
}

// ---------------- evenly spread sample, shared stems first ----------------
function pickSample(list, per, shared) {
  const byCls = new Map();
  for (const u of list) (byCls.get(u.cls) || byCls.set(u.cls, []).get(u.cls)).push(u);
  const out = [];
  for (const [, l] of byCls) {
    const sh = l.filter(u => shared.has(u.cls + '|' + u.stem)), rest = l.filter(u => !shared.has(u.cls + '|' + u.stem));
    const take = [...sh], room = Math.max(0, per - take.length), n = Math.min(room, rest.length);
    for (let i = 0; i < n; i++) take.push(rest[Math.floor(i * rest.length / n)]);
    out.push(...take);
  }
  return out;
}

// ---------------- reader scan: optional side file ----------------
let scanReaders = () => ({ kw: new Map(), lit: new Map() }); try { scanReaders = require('./readers').scanReaders; } catch (e) { /* not in this copy */ }

// ---------------- table ----------------
let RULES = [];
try { RULES = require('./rules.json'); } catch (e) { RULES = []; }
const ruleFor = (p, rules) => { for (const r of rules || RULES) if (new RegExp(r.re, 'i').test(p)) return r; return null; };

const keyOfRec = r => r.src + '|' + r.cls + '|' + r.stem;
const MIN_PAIRS = 3, MIN_ROW_PAIRS = 5;
const relErr = (pred, truth) => Math.abs(pred / truth - 1);
const errSum = (e, tight) => ({ n: e.length, tight, median_err: +median(e).toPrecision(3), p75_err: +pct(e, .75).toPrecision(3), p90_err: +pct(e, .9).toPrecision(3), within10: e.filter(x => x <= .1).length, within25: e.filter(x => x <= .25).length });

function build(records, opt) {
  opt = opt || {};
  const hold = opt.hold === undefined ? 1 / 3 : opt.hold, seed = opt.seed || 1, rand = rng(seed);
  const classes = {};
  const cls = c => classes[c] || (classes[c] = { units: { goh: 0, as2: 0 }, keys: {}, curated: {} });
  // pair by (src, class, stem). The split is by class+stem, before any fitting.
  const by = new Map();
  for (const r of records) { const kk = keyOfRec(r), m = by.get(kk) || by.set(kk, {}).get(kk); m[r.game] = r; }
  const pairs = [...by.values()].filter(m => m.goh && m.as2);
  const stems = [...new Set(pairs.map(m => m.goh.cls + '|' + m.goh.stem))].sort();
  const test = new Set();
  for (const s of stems) if (rand() < hold) test.add(s);
  const testRec = r => test.has(r.cls + '|' + r.stem);
  const isTest = m => testRec(m.goh);

  for (const r of records) {
    const C = cls(r.cls); C.units[r.game]++;
    for (const [p, [v]] of Object.entries(r.flat)) {
      const K = C.keys[p] || (C.keys[p] = { goh: { u: 0, v: [] }, as2: { u: 0, v: [] } });
      K[r.game].u++; if (v !== null) K[r.game].v.push(v);
    }
    for (const [n, v] of Object.entries(r.k)) { const K = C.curated[n] || (C.curated[n] = { goh: [], as2: [], as2train: [] }); K[r.game].push(v); if (r.game === 'as2' && !testRec(r)) K.as2train.push(v); }
  }
  const out = { classes: {}, factors: {}, holdout: {}, generic: {}, pooled: {} };
  const poolErr = [];
  for (const [c, C] of Object.entries(classes)) {
    const oc = out.classes[c] = { units: C.units, curated: {}, keys: {} };
    for (const [p, K] of Object.entries(C.keys)) oc.keys[p] = { goh: { units: K.goh.u, ...(summ(K.goh.v) || {}) }, as2: { units: K.as2.u, ...(summ(K.as2.v) || {}) } };
    for (const [n, K] of Object.entries(C.curated)) oc.curated[n] = { goh: summ(K.goh), as2: summ(K.as2) };
    const F = out.factors[c] = {}, H = out.holdout[c] = {}, cp = pairs.filter(m => m.goh.cls === c);
    for (const name of Object.keys(CURATED)) {
      const P = cp.filter(m => m.goh.k[name] > 0 && m.as2.k[name] > 0).map(m => ({ a: m.goh.k[name], b: m.as2.k[name], t: isTest(m) }));
      const tr = P.filter(x => !x.t), te = P.filter(x => x.t), A2 = (C.curated[name] && C.curated[name].as2train) || [];
      if (tr.length < MIN_PAIRS) {
        // no pairs to fit a ratio: the class's native AS2 values still give a const predictor
        F[name] = A2.length >= MIN_PAIRS ? { n: tr.length, mode: 'const', value: median(A2), as2_p5: pct(A2, .05), as2_p95: pct(A2, .95), note: 'few pairs; class native median' } : { n: tr.length, mode: 'none', note: 'too few paired units' };
        continue;
      }
      const f = median(tr.map(x => x.b / x.a)), cst = A2.length ? median(A2) : null;
      const cand = { copy: x => x.a, factor: x => x.a * f };
      if (cst !== null) cand.const = () => cst;
      const trainErr = {};
      for (const [m, fn] of Object.entries(cand)) trainErr[m] = median(tr.map(x => relErr(fn(x), x.b)));
      const mode = Object.keys(trainErr).sort((x, y) => trainErr[x] - trainErr[y] || (x === 'copy' ? -1 : 1))[0];
      F[name] = { n: tr.length, mode, factor: +f.toPrecision(4), value: cst, spread_p25: pct(tr.map(x => x.b / x.a), .25), spread_p75: pct(tr.map(x => x.b / x.a), .75), exact: tr.filter(x => x.a === x.b).length, as2_p5: A2.length ? pct(A2, .05) : null, as2_p95: A2.length ? pct(A2, .95) : null, train_err: Object.fromEntries(Object.entries(trainErr).map(([k, v]) => [k, +v.toPrecision(3)])) };
      if (te.length) {
        const mk = fn => te.map(x => relErr(fn(x), x.b));
        const errs = mk(cand[mode]); poolErr.push({ c, name, errs });
        H[name] = { mode, ...errSum(errs, CURATED[name].tight), by_mode: Object.fromEntries(Object.entries(cand).map(([m, fn]) => [m, +median(mk(fn)).toPrecision(3)])) };
      }
    }
    // armour: pick max or median aggregation per face on training error
    for (const part of ['body', 'turret']) for (const f of FACES) {
      const a = F[`armor_${part}_${f}_max`], b = F[`armor_${part}_${f}_med`];
      const ea = a && a.train_err ? a.train_err[a.mode] : Infinity, eb = b && b.train_err ? b.train_err[b.mode] : Infinity;
      if (a) a.chosen = ea <= eb; if (b) b.chosen = eb < ea;
    }
    // every other path: ratio over all pairs of the class where both games hold a number (training pairs only)
    const G = out.generic[c] = {};
    const acc = {};
    for (const m of cp) { if (isTest(m)) continue; for (const [p, [v]] of Object.entries(m.goh.flat)) { const w = m.as2.flat[p]; if (v === null || !w || w[0] === null) continue; const e = acc[p] || (acc[p] = { r: [], same: 0 }); if (v === w[0]) e.same++; if (v > 0 && w[0] > 0) e.r.push(w[0] / v); } }
    for (const [p, e] of Object.entries(acc)) if (e.r.length >= MIN_ROW_PAIRS || e.same >= MIN_ROW_PAIRS) G[p] = { n: e.r.length, same: e.same, median: e.r.length ? +median(e.r).toPrecision(4) : null, p25: pct(e.r, .25), p75: pct(e.r, .75) };
  }

  // pooled held-back error per key group over all classes. Armour: the aggregation (max or median) chosen on training pairs, faces pooled as one group.
  const grp = n => /^armor_(body|turret)_(front|side|rear|top)_/.test(n) ? 'armor_' + n.split('_')[1] + '_' + n.split('_')[2] : n.replace(/_(koef|value)$/, '');
  const pools = {};
  for (const { c, name, errs } of poolErr) {
    if (/^armor_/.test(name) && !(out.factors[c][name] && out.factors[c][name].chosen)) continue;
    (pools[grp(name)] || (pools[grp(name)] = { tight: CURATED[name].tight, errs: [] })).errs.push(...errs);
  }
  for (const [g, p] of Object.entries(pools)) out.pooled[g] = errSum(p.errs, p.tight);
  { const a = poolErr.filter(x => /^armor_/.test(x.name) && out.factors[x.c][x.name].chosen).flatMap(x => x.errs); if (a.length) out.pooled.armor_all = errSum(a, true); }

  // rows: one per key path in the sample, aggregated over classes
  const readers = opt.readers || { kw: new Map() };
  const agg = new Map();
  for (const [c, C] of Object.entries(classes)) for (const [p, K] of Object.entries(C.keys)) {
    const a = agg.get(p) || agg.set(p, { goh: 0, as2: 0, classes: new Set() }).get(p);
    a.goh += K.goh.u; a.as2 += K.as2.u; a.classes.add(c);
  }
  const curatedPaths = new Map();
  for (const [n, c] of Object.entries(CURATED)) if (c.path) for (const g of ['goh', 'as2']) curatedPaths.set(c.path[g], n);
  const rows = [];
  for (const [p, a] of [...agg].sort((x, y) => x[0] < y[0] ? -1 : 1)) {
    const seg = p.split('/').pop(), rd = readers.kw.get(seg) || null, rule = ruleFor(p, opt.rules);
    const row = { key: p, goh_units: a.goh, as2_units: a.as2, classes: a.classes.size, reader: rd };
    if (curatedPaths.has(p)) { row.cat = 'translated'; row.reason = `curated key ${curatedPaths.get(p)}: predictor per class in factors`; }
    else if (rule) { row.cat = rule.cat; row.reason = rule.reason; }
    else if (a.goh && !a.as2) { row.cat = rd ? 'carried' : 'dropped'; row.reason = rd ? 'GoH only key; the key name is registered in game/ (reader above) [I whether the meaning matches]' : 'GoH only key; no reader of that name in game/ [I]'; }
    else if (!a.goh && a.as2) { row.cat = 'native'; row.reason = 'AS2 only: donor structure supplies it'; }
    else { row.cat = 'carried'; row.reason = 'same key in both games; value per generic ratio table'; }
    rows.push(row);
  }
  out.rows = rows;
  out.meta = { pairs: pairs.length, stems: stems.length, heldOut: test.size, hold, seed, minPairs: MIN_PAIRS, records: records.length };
  out.limits = LIMITS;
  return out;
}

function main() {
  const av = process.argv.slice(2), o = { per: 80, out: path.join(__dirname, 'table.json'), seed: 1, hold: 1 / 3, gameSrc: path.join(__dirname, '..', '..', 'game') };
  for (let i = 0; i < av.length; i++) {
    const a = av[i];
    if (a === '--goh') o.goh = av[++i]; else if (a === '--as2') o.as2 = av[++i]; else if (a === '--goh-mod') o.gohMod = av[++i]; else if (a === '--as2-mod') o.as2Mod = av[++i];
    else if (a === '--out') o.out = av[++i]; else if (a === '--per') o.per = +av[++i]; else if (a === '--seed') o.seed = +av[++i]; else if (a === '--hold') o.hold = +av[++i]; else if (a === '--raw') o.raw = av[++i]; else if (a === '--game') o.gameSrc = av[++i];
    else if (a === '--from-raw') o.fromRaw = av[++i];
  }
  let records;
  if (o.fromRaw) records = JSON.parse(fs.readFileSync(o.fromRaw, 'utf8'));
  else {
    if (!o.goh || !o.as2) { console.error('usage: xlate.js --goh <dir> --as2 <dir> [--goh-mod <dir> --as2-mod <dir>] [--out f] [--per N] [--hold f] [--seed n] [--raw f] [--from-raw f]'); process.exit(2); }
    const sets = [['vanilla', o.goh, null, o.as2, null]];
    if (o.gohMod && o.as2Mod) sets.push(['valour', o.gohMod, o.goh, o.as2Mod, o.as2]);
    records = [];
    for (const [src, gd, gb, ad, ab] of sets) {
      const G = loadSide(gd, gb), A = loadSide(ad, ab);
      const ug = [...vehicleUnits(G, 'goh'), ...weaponUnits(G)], ua = [...vehicleUnits(A, 'as2'), ...weaponUnits(A)];
      const sg = new Set(ug.map(u => u.cls + '|' + u.stem)), sa = new Set(ua.map(u => u.cls + '|' + u.stem));
      const shared = new Set([...sg].filter(x => sa.has(x)));
      for (const [side, game, all] of [[G, 'goh', ug], [A, 'as2', ua]]) {
        const list = pickSample(all, o.per, shared);
        let bad = 0;
        for (const u of list) { try { const r = extract(side, game, u, src); if (r) records.push(r); else bad++; } catch (e) { bad++; } }
        console.error(`${src} ${game}: ${list.length} sampled of ${all.length}, unreadable ${bad}, shared ${shared.size}`);
      }
      G.close(); A.close();
    }
  }
  if (o.raw) fs.writeFileSync(o.raw, JSON.stringify(records));
  const readers = fs.existsSync(o.gameSrc) ? scanReaders(o.gameSrc) : { kw: new Map() };
  const table = build(records, { ...o, readers });
  table.meta.readers = readers.kw.size;
  fs.writeFileSync(o.out, JSON.stringify(table, null, 1));
  console.log(`xlate: ${records.length} records, ${table.meta.pairs} pairs, ${Object.keys(table.classes).length} classes, ${table.rows.length} key rows, ${readers.kw.size} reader keywords -> ${o.out}`);
}
if (require.main === module) main();
module.exports = { build, pct, summ, flatten, weaponFacts, pickSample, ruleFor, scanReaders, CURATED, LIMITS, rng, extract };

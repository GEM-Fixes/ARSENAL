// pricecalc/model: the price model file (resource/set/multiplayer/units/price_model.inc: plain SDL, included by nothing).
//   buildSeed({sheet, items, priceRows, sources}) -> seed object (sheet tables + every carried item put in a group, [I] guesses)
//   writeModel(seed) -> text (CRLF)       readModel(buf, file) -> model (see shape at readModel)
//   mergeText(text, model, adds[{name, group, kind, tier, reason}]) -> text   (seed --merge: only new items, as undetermined)
// Author: Imperator_Aug (ARSENAL, ia-6afe03f9)
const sdlx = require('../lib/sdlx');
const C = require('./classify');
const RL = require('./rules');

const fmt = v => v === null || v === undefined || Number.isNaN(v) ? '-1' : String(Math.round(v * 10000) / 10000);
// {point_value} kinds: sp = budget "hero" (special points), dp = a budget "dp" (doctrine points)
const POINT_KINDS = ['sp', 'dp'];
const q = s => '"' + String(s).replace(/"/g, "'") + '"';

const HEADER = [
  '; price_model.inc: price model of the pricecalc tool (tools/pricecalc). INCLUDED BY NOTHING: no game exe reads it.',
  ';   The retail 32-bit exe only reads the plain numbers the tool writes (level_N defines in soldiers.set, cost(N) on the cards).',
  ';   This file is the tool\'s only model (and input for a later as64 engine function). Edit it by hand; `seed` never overwrites',
  ';   it without --force, and `seed --merge` only adds newly found items (as undetermined). Values -1 = not in the sheet.',
  ';',
  '; Blocks (all inside {price_model ...}):',
  ';   {source ...}            where the numbers came from (sheet files), for the record',
  ';   {point_value [{sp N}] [{dp M}]}   optional: how many MP one point of another buy resource is worth. sp = the points of the',
  ';                           game modes\' {budgets {hero ...}} (the hero button; AS2 calls them special points), dp = a budget named',
  ';                           "dp" (doctrine points; no AS2 mode has one unless a mod adds it). Absent block or kind = not set: cards',
  ';                           paid with that resource show their cost in it and no MP equivalent. Never changes a price.',
  ';   {rounding {mp S} {cp S} {cost S}}   results are rounded to a multiple of S (cost 1 = whole MP points, as cost(N) needs)',
  ';   {veterancy {apply_skill_bonus 0|1} {max_skill N} {stat_bonus 0|1}}',
  ';                           effective skill = breed weapon skill + "weapon_skill" of the START rank (set/ability/veterancy.set, read',
  ';                           from the mod, never hard-coded). Start rank = highest rank whose score is <= 0 in the breed\'s veterancy',
  ';                           table (breed_vet start(N)). stat_bonus 1: the start rank\'s health/stamina bonus is added before {stat} weights.',
  ';   {main_priority "class" ...}   which weapon group decides a soldier\'s class when he carries several (first found wins)',
  ';   {skill_from_item 1}     the skill perk follows the main weapon\'s stuff folder (smg/rifle/mgun/pistol/bazooka/ptr) over the class {skill}',
  ';   {weapon_group "id" {label} {skill "perk"} [{addon 1}] {tier "id" {label} {mp m1..m10} {cp c1..c10} {items ...}} ...}',
  ';                           MP (score) and CP by effective skill level 1..10. {addon 1}: priced on top of the main weapon (panzerfaust).',
  ';                           {sole 1}: a breed carrying an item of this group is priced ONLY by that item\'s tier (mp and cp of',
  ';                           level 1; no skill table, no other kit, no veterancy, no stats). Owner rule: radiomen = their call-in item.',
  ';   {special "id" {label} {mp M} {cp C} {cw W} [{card_mp N}] {breeds "side/breed" ...}}   fixed-price breeds (officers): own',
  ';                           stats, not priced from the weapon tables. Seeded from the mod\'s rows with a negative CP (level_0_v2 /',
  ';                           level_1_v2). {card_mp N}: the MP one such breed adds to a card sum (default M).',
  ';                           tier "undetermined" {as "medium"}: items whose tier the sheet does not give; priced as the named tier',
  ';                           until the owner moves them (finding TIER_UNDETERMINED). One item per line, `; comment` allowed.',
  ';                           {tier "high" ... {when_carried "launcher" "ammo" ...}}: that launcher is priced in this tier when the',
  ';                           breed also carries one of the ammo names (owner rule: rifle-grenade launchers by their load)',
  ';   {throwable_score {groups ...} [{mode "armor"}] {energy} {penetration} {fire_radius} {range} {fuse} {cuts ...}}   computed hand-grenade tier',
  ';   {throwable_price {mp_per_tier P} {cp_per_tier Q}}   per throwable carried: MP += P x tier x expected count, CP += Q x tier x count',
  ';   {alias "model name" "spelling" ...}   other spellings of one item (same stuff file); unknown spellings that resolve to',
  ';                           the same stuff file as a model item are matched too',
  ';   {group "id" {label} {price P} {items ...}}                          flat equipment group: P MP per item carried',
  ';   {group "id" {label} {tier "low" {price P} {items ...}} ... {tier "undetermined" {price 0} {items ...}}}',
  ';                           tiered equipment group: quality steps inside one function (e.g. frag grenade: egg / stick / heavy)',
  ';                           kit MP = sum over carried items of price x expected count ({item "x" centre spread} counts',
  ';                           round(centre + uniform(-spread, spread)), never below 0)',
  ';   {stat "name" {weight W} {base B} [{map "value" n ...}]}   extras MP = sum of W x (final stat - B); 0 = not priced',
  ';                           stats: health stamina speed (perk factors, 2 = 200%), sight (vision preset via map), stealth (1 if the perk),',
  ';                           avoidance, rocket (rocketlauncher skill), tankgun, at_rifle (skill levels)',
  ';   {fixed_cp "label" {match "regex"} {single X} {not_single Y}}   support breeds with a fixed CP (sheet singles table);',
  ';                           first match on the breed name wins; a breed name ending _single takes {single}',
  ';   {weapon_group ... {cw_as "group" "tier"}}   CW of this group = the CP curve of that tier at the same level (mod: snipers = smg medium)',
  ';   {cw_factor F}           cw = cp x F (the mod keeps cw = cp except deliberate overrides)',
  ';   {squad ...}             card rules:',
  ';     {addon "id" {price P} {match "regex" ...}}   transport add-on: a card whose only vehicle matches pays P on top of its members',
  ';     {single "id" {classes "c" ...} [{min_level N}] {mult M}}   one soldier, no vehicle: member MP x M; first matching rule wins',
  ';     {sequence "id" [{sides "s" ...}] [{cards "regex"}] {percent p1 p2 ...}}   sequence family: a sequence = the cards of one',
  ';                           file with the same side and {icon N} that use a *seq* macro, in file order (buy 1, 2, ...) [I]. Buy k',
  ';                           costs (its members\' MP x factor) x p_k / 100; past the list the last p repeats. First family whose',
  ';                           sides and card-name regex match wins. (Old form {sequence v1 v2 ...} = one family for every card.)',
  ';     {modifier {side "s"} {card "name"} {factor F}}   per-card factor from the sheet panels (Other Modifier column)',
  ';   cost = round((sum of member MP x count + add-on) x mult x factor, rounding cost). Vehicle and gun cards: hand-priced.',
  ';   [I] in an item comment = put there by a guess (name / stuff folder / fuzzy sheet match): check it.',
];

function buildSeed(o) {
  const sheet = o.sheet || { classes: [], addons: {}, singles: {}, fixedCp: [], panels: [], sequence: null, shovel: null };
  const R = o.rules || RL.generic();
  const seed = { weapon: new Map(), equip: new Map(), sheet, sources: o.sources || [], rules: R };
  for (const [id, w] of R.weaponGroups) {
    const sc = sheet.classes.find(c => c.id === id);
    const g = { id, label: sc ? sc.label : w.label, skill: w.skill, addon: !!w.addon, tiers: [] };
    if (w.cwAs && w.cwAs.length === 2) g.cwAs = w.cwAs.map(String);   // rules {cw_as}: CW read from another group's CP curve
    if (w.sole) g.sole = true;   // rules {sole 1}: a breed carrying it is priced solely on that item
    const ci = R.callIn && R.callIn.group === id ? R.callIn : null;
    if (sc && ci && sc.tiers.length === 2) {
      // rules {call_in}: the sheet class has two rows: row 1 = call-in calibres, row 2 = their MP. One tier per calibre, flat over skill.
      // CP: the singles-table row named by {cp_from} [I] (the RobZ sheet's CP Radio rows repeat the MP numbers: SHEET_DEFECT)
      const cpl = String(ci.cpFrom || '').toLowerCase();
      const rf = (sheet.fixedCp || []).find(f => String(f.label).toLowerCase() === cpl);
      const rcp = rf ? (rf.single !== null && rf.single !== undefined ? rf.single : rf.notSingle) : null;
      sc.tiers[0].mp.forEach((cal, i) => { if (cal === null) return; const v = sc.tiers[1].mp[i]; g.tiers.push({ id: String(cal), label: `call-in ${cal} [I] sheet ${sc.label} row 1 = calibre, row 2 = MP; cp = sheet singles ${ci.cpFrom || '(none)'}`, mp: new Array(10).fill(v), cp: new Array(10).fill(rcp), items: [] }); });
    } else if (sc) for (const t of sc.tiers) g.tiers.push({ id: t.id, label: t.label, mp: t.mp, cp: t.cp, items: [] });
    if (w.flat) { g.tiers = [{ id: w.flat.tier, label: w.flat.label, mp: new Array(10).fill(0), cp: new Array(10).fill(0), items: [] }]; seed.weapon.set(id, g); continue; }
    if (!g.tiers.length) g.tiers.push({ id: 'medium', label: 'not in the sheet', mp: new Array(10).fill(0), cp: new Array(10).fill(0), items: [] });
    for (const x of R.extraTiers.filter(x => x.group === id && !g.tiers.some(t => t.id === x.tier))) {
      const src = g.tiers.find(t => t.id === String(x.copy)) || g.tiers[0];
      g.tiers.push({ id: x.tier, label: x.label, mp: src.mp.slice(), cp: src.cp.slice(), items: [] });
    }
    // rules {when_carried}: the launcher's tier follows the ammo the breed carries
    for (const t of g.tiers) for (const x of R.whenCarried.filter(x => x.group === id && x.tier === t.id)) {
      let wc = null;
      if (x.ap) { const a = o.launcherAp && o.launcherAp(x.launcher); if (a && a.ammo) wc = { ammo: a.ammo + ' ' + a.param, note: x.note || `highest penetration in stuff ${x.launcher} projectileDamageTable: ${a.all.join(' ')}` }; }
      else if (x.ammo) wc = { ammo: String(x.ammo).toLowerCase(), note: x.note || 'rules {when_carried}' };
      if (wc) (t.when = t.when || []).push(Object.assign({ launcher: x.launcher }, wc));
    }
    const uas = ci && ci.undeterminedAs !== null && ci.undeterminedAs !== undefined ? String(ci.undeterminedAs) : null;
    g.tiers.push({ id: 'undetermined', as: g.tiers.find(t => t.id === 'medium') ? 'medium' : uas && g.tiers.find(t => t.id === uas) ? uas : g.tiers[0].id, items: [] });
    seed.weapon.set(id, g);
  }
  for (const [id, label, tiers] of C.EQUIP.concat(R.equipGroups)) {
    const g = { id, label, flat: !tiers, price: id === 'shovel' && sheet.shovel !== null && sheet.shovel !== undefined ? sheet.shovel : 0, tiers: [], items: [] };
    if (id === 'shovel' && sheet.shovel) g.priceNote = '[I] sheet "Shovel" ' + sheet.shovel;
    if (tiers) { for (const t of tiers) g.tiers.push({ id: t, price: 0, items: [] }); g.tiers.push({ id: 'undetermined', price: 0, items: [] }); }
    seed.equip.set(id, g);
  }
  const determined = new Map();
  const placed = [];
  // one model entry per stuff file: other spellings become {alias "canonical" "other" ...}
  const byKey = new Map();
  seed.alias = new Map();
  for (const [name, info] of [...o.items].sort((a, b) => a[0] < b[0] ? -1 : 1)) {
    if (info.res && info.from === 'inventory') {
      const canon = byKey.get(info.res.key);
      if (canon) { if (!seed.alias.has(canon)) seed.alias.set(canon, []); seed.alias.get(canon).push(name); continue; }
      byKey.set(info.res.key, name);
    }
    const c = C.classify(name, info.res, sheet.classes, info.from, R);
    if (!c) { placed.push({ name, info, c: null }); continue; }
    placed.push({ name, info, c });
    if (c.kind === 'weapon' && c.tier !== 'undetermined') determined.set(name, c);
  }
  for (const p of placed) {
    const c = p.c;
    if (!c) continue;
    if (c.kind === 'weapon') {
      if (c.tier === 'undetermined') c.guess = C.guessWeaponTier(p.name, c.group, determined);
      const g = seed.weapon.get(c.group);
      if (!g) { p.c = null; continue; }   // a rules group the rules file does not declare: left unplaced (review lists it)
      let t =g.tiers.find(x => x.id === c.tier);
      if (!t) t = g.tiers.find(x => x.id === 'undetermined') || g.tiers[0];
      t.items.push({ name: p.name, note: c.reason + (c.tier === 'undetermined' ? '; guess ' + c.guess : '') });
    } else {
      let g = seed.equip.get(c.group);
      if (!g) { g = { id: c.group, label: c.group.replace(/^ammo_/, 'ammunition: ').replace(/_/g, ' '), flat: true, price: 0, tiers: [], items: [] }; seed.equip.set(c.group, g); }
      if (g.flat) g.items.push({ name: p.name, note: c.reason });
      else g.tiers.find(x => x.id === 'undetermined').items.push({ name: p.name, note: c.reason + '; guess ' + c.guess });
    }
  }
  seed.placed = placed;
  // fixed-price breeds (owner: officers have their own stats): mod rows with a negative CP, grouped by (score, cp, cw)
  seed.special = [];
  const sp = new Map();
  for (const r of o.priceRows || []) {
    if (typeof r.cp !== 'number' || r.cp >= 0) continue;
    const k = [r.score, r.cp, r.cw].join('|');
    if (!sp.has(k)) sp.set(k, { mp: r.score, cp: r.cp, cw: r.cw, levels: new Set(), breeds: [] });
    const e = sp.get(k); e.levels.add(r.level); if (!e.breeds.includes(r.side + '/' + r.breed)) e.breeds.push(r.side + '/' + r.breed);
  }
  const ids = new Set();
  for (const e of [...sp.values()].sort((a, b) => a.mp - b.mp || a.cw - b.cw)) {
    const off = e.breeds.every(b => /officer/i.test(b));
    let id = (off ? 'officer_' : 'fixed_') + fmt(e.mp);
    if (ids.has(id)) id += '_cw' + fmt(e.cw);
    ids.add(id);
    // {card_mp}: member MP inside card sums. 0 when every card made only of these breeds costs 0 in the mod (officer cards are free) [I]
    const own = (o.cards || []).filter(c => c.members.length && c.members.every(m => e.breeds.includes(m.side + '/' + m.breed)));
    const cardMp = own.length && own.every(c => c.cost === 0) ? 0 : null;
    seed.special.push(Object.assign(e, { id, cardMp, cardNote: cardMp === 0 ? `[I] all ${own.length} cards made only of these breeds cost 0 in the mod` : null,
      label: (off ? 'officer' : 'fixed price') + ' [I] mod rows ' + [...e.levels].join(' ') }));
  }
  // owner rule: breeds carrying a dummy weapon are priced by unit function: one {special} per (function, mp, cp, cw) from the mod rows
  const inSpecial = new Set(seed.special.flatMap(e => e.breeds));
  const dummyItems = new Set(placed.filter(p => p.c && p.c.group === C.DUMMY_GROUP).map(p => p.name));
  for (const [canon, al] of seed.alias) if (dummyItems.has(canon)) al.forEach(a => dummyItems.add(a));
  const fn = new Map();
  for (const r of o.priceRows || []) {
    const k = r.side + '/' + r.breed, b = o.breeds && o.breeds.get(k);
    if (!b || inSpecial.has(k)) continue;
    const it = b.items.find(i => dummyItems.has(i.name));
    if (!it) continue;
    const stem = (o.items.get(it.name) && o.items.get(it.name).res ? o.items.get(it.name).res.path.split('/').pop().split('.')[0] : it.name);
    const func = R.dummies.get(stem) || stem.replace(/[^a-z0-9]+/g, '_');
    const key = [func, r.score, r.cp, r.cw].join('|');
    if (!fn.has(key)) fn.set(key, { func, item: it.name, mp: r.score, cp: r.cp, cw: r.cw, levels: new Set(), breeds: [] });
    const e = fn.get(key); e.levels.add(r.level); if (!e.breeds.includes(k)) e.breeds.push(k);
  }
  for (const e of [...fn.values()].sort((a, b) => a.func < b.func ? -1 : a.func > b.func ? 1 : a.mp - b.mp)) {
    let id = e.func + '_' + fmt(e.mp);
    while (ids.has(id)) id += '_';
    ids.add(id);
    seed.special.push(Object.assign(e, { id, cardMp: null, label: `${e.func} (dummy weapon "${e.item}") [I] mod rows ${[...e.levels].join(' ')}` }));
  }
  return seed;
}

function writeModel(seed) {
  const R = seed.rules || RL.generic();
  const L = HEADER.slice();
  const s = seed.sheet;
  L.push('{price_model');
  L.push('\t{version 1}');
  L.push('\t{source ' + (seed.sources.length ? seed.sources.map(q).join(' ') : q(seed.sourceNote || 'no sheet: tables are 0')) + '}');
  L.push('\t{rounding {mp 0.01} {cp 0.01} {cost 1}}');
  L.push('\t{veterancy {apply_skill_bonus 1} {max_skill 10} {stat_bonus 1}}');
  L.push('\t{main_priority ' + R.mainPriority.filter(id => seed.weapon.has(id)).map(q).join(' ') + '}');
  L.push('\t{skill_from_item 1}');
  L.push('\t{cw_factor 1}');
  const pv = seed.pointValue || {}, pvk = POINT_KINDS.filter(k => typeof pv[k] === 'number');
  if (pvk.length) L.push('\t{point_value ' + pvk.map(k => `{${k} ${fmt(pv[k])}}`).join(' ') + '}');
  else L.push('\t; {point_value {sp N} {dp M}}\t; MP worth of one special / doctrine point: not set (the owner sets it in the Model view)');
  L.push('');
  L.push('\t; ---- weapon groups (sheet MP / CP tables; Items column -> tiers) ----');
  for (const g of seed.weapon.values()) {
    L.push(`\t{weapon_group ${q(g.id)} {label ${q(g.label)}} {skill ${q(g.skill)}}${g.addon ? ' {addon 1}' : ''}${g.sole ? ' {sole 1}' : ''}${g.cwAs ? ` {cw_as ${g.cwAs.map(q).join(' ')}}` : ''}`);
    for (const t of g.tiers) {
      if (t.id === 'undetermined') L.push(`\t\t{tier "undetermined" {as ${q(t.as)}}`);
      else L.push(`\t\t{tier ${q(t.id)} {label ${q(t.label)}}`), L.push('\t\t\t{mp ' + t.mp.map(fmt).join(' ') + '}'), L.push('\t\t\t{cp ' + t.cp.map(fmt).join(' ') + '}');
      for (const w of t.when || []) L.push(`\t\t\t{when_carried ${q(w.launcher)} ${q(w.ammo)}}\t; ${w.note}`);
      pushItems(L, t.items, '\t\t\t');
      L.push('\t\t}');
    }
    L.push('\t}');
  }
  L.push('');
  L.push('\t; ---- equipment groups (one function each; tiers = quality steps; price in MP per item) ----');
  for (const g of seed.equip.values()) {
    if (g.flat) {
      L.push(`\t{group ${q(g.id)} {label ${q(g.label)}} {price ${fmt(g.price)}}${g.priceNote ? '\t; ' + g.priceNote : ''}`);
      pushItems(L, g.items, '\t\t');
    } else {
      L.push(`\t{group ${q(g.id)} {label ${q(g.label)}}`);
      for (const t of g.tiers) { L.push(`\t\t{tier ${q(t.id)} {price ${fmt(t.price)}}`); pushItems(L, t.items, '\t\t\t'); L.push('\t\t}'); }
    }
    L.push('\t}');
  }
  L.push('');
  L.push('\t; ---- stat weights (0 = the sheet prices nothing for it) ----');
  for (const [st, base] of [['health', 1], ['stamina', 1], ['speed', 0.9], ['sight', 0], ['stealth', 0], ['avoidance', 0], ['rocket', 1], ['tankgun', 0], ['at_rifle', 0]]) {
    L.push(`\t{stat ${q(st)} {weight 0} {base ${base}}${st === 'sight' ? ' {map "mp_soldier" 0 "mp_officer" 1 "mp_sniper" 2}' : ''}}`);
  }
  L.push('');
  L.push('\t; ---- fixed-price breeds (own stats, not the weapon tables) [I] seeded from the mod\'s negative-CP rows ----');
  for (const e of seed.special || []) {
    L.push(`\t{special ${q(e.id)} {label ${q(e.label)}} {mp ${fmt(e.mp)}} {cp ${fmt(e.cp)}} {cw ${fmt(e.cw)}}${e.cardMp !== null && e.cardMp !== undefined ? ` {card_mp ${fmt(e.cardMp)}}\t; ${e.cardNote}` : ''}`);
    L.push('\t\t{breeds');
    for (const b of e.breeds) L.push('\t\t\t' + q(b));
    L.push('\t\t}');
    L.push('\t}');
  }
  L.push('');
  L.push(R.generic ? '\t; ---- hand grenades / throwables: tier computed from the stuff file [I] generic weights and cut points (no rules file): tune them ----'
    : '\t; ---- hand grenades / throwables: tier computed from the stuff file (owner rule) [I] weights and cut points proposed, owner tunes ----');
  L.push('\t;   score = energy x (sum of {damage [add] blastwave {energy}} kg) + penetration x ({damage cumulative {damage}})');
  L.push('\t;         + fire_radius x ({damage fire {radius}}) + range x ({throw {range}}) + fuse x ({special {PrepareTime}} with {mode detonate}; impact = 0)');
  L.push('\t;   tier = 1 + number of cut points <= score.  MP += mp_per_tier x tier x expected count, CP += cp_per_tier x tier x count (CW follows CP)');
  for (const ts of R.throwScores || [RL.GENERIC_THROW]) {
    if (ts.mode === 'armor') {
      L.push('\t; anti-tank grenades and charges (owner rule): ranked by the armour they defeat, score = max(energy x strongest single blast layer, penetration x cumulative damage)');
      L.push(`\t;   energy 5 = the engine multiplies blast energy by 5 against armour (g_energyperblastwave). cuts ${(ts.cuts || []).map(fmt).join(' ')} [I]: tier 1 light armour, 2 light tanks, 3 medium tanks, 4 heavy tanks`);
    }
    L.push(`\t{throwable_score {groups ${ts.groups.map(q).join(' ')}}${ts.mode ? ' {mode ' + q(ts.mode) + '}' : ''}` +
      ['energy', 'penetration', 'fire_radius', 'range', 'fuse'].filter(f => ts[f] !== null && ts[f] !== undefined).map(f => ` {${f} ${fmt(ts[f])}}`).join('') + ` {cuts ${(ts.cuts || []).map(fmt).join(' ')}}}`);
  }
  const tp = R.throwPrice || { mp: 0, cp: 0, note: 'no rules: throwables add nothing until set' };
  L.push(`\t{throwable_price {mp_per_tier ${fmt(tp.mp)}} {cp_per_tier ${fmt(tp.cp)}}}${tp.note ? '\t; ' + tp.note : ''}`);
  L.push('');
  L.push('\t; ---- spellings of one item (same stuff file): {alias "model name" "other spelling" ...} ----');
  for (const [canon, al] of seed.alias || []) L.push(`\t{alias ${q(canon)} ${al.map(q).join(' ')}}`);
  L.push('');
  L.push('\t; ---- fixed CP of support breeds (sheet singles / not singles) [I] name patterns ----');
  const fc = (s.fixedCp || []).slice().sort((a, b) => b.label.length - a.label.length);
  for (const f of fc) L.push(`\t{fixed_cp ${q(f.label)} {match ${q(R.fixedCpMatch.get(f.label.toLowerCase()) || f.label.toLowerCase().replace(/\s+/g, '_'))}} {single ${fmt(f.single)}} {not_single ${fmt(f.notSingle)}}}`);
  L.push('');
  L.push('\t{squad');
  for (const [lab, a] of Object.entries(s.addons || {})) {
    const l = lab.toLowerCase(), r = R.addons.find(x => x.label.test(l)), id = r ? r.id : l.replace(/[^a-z0-9]+/g, '_');
    L.push(`\t\t{addon ${q(id)} {price ${fmt(a.value)}} {match ${(r && r.match.length ? r.match : [id]).map(q).join(' ')}}}\t; sheet "${lab}" [I] vehicle name patterns`);
  }
  if (!Object.keys(s.addons || {}).length) L.push('\t\t{addon "truck" {price 0} {match "truck"}}');
  const sg = s.singles || {}, sv = k => { const e = Object.entries(sg).find(([l]) => new RegExp(k, 'i').test(l)); return e ? e[1].value : null; };
  for (const x of R.singles || [{ id: 'regular', classes: ['*'], sheet: 'Regular' }])
    L.push(`\t\t{single ${q(x.id)} {classes ${x.classes.map(q).join(' ')}}${x.minLevel !== null && x.minLevel !== undefined ? ' {min_level ' + fmt(x.minLevel) + '}' : ''} {mult ${fmt((x.sheet ? sv(x.sheet) : null) ?? 1)}}}${x.note ? '\t; ' + x.note : ''}`);
  if (s.sequence) L.push(`\t\t{sequence "infantry" {percent ${s.sequence.values.map(fmt).join(' ')}}}\t; [I] sheet "${s.sequence.label}" ${s.sequence.raw}, applied to every sequence card until split per family`);
  else L.push('\t\t{sequence "infantry" {percent 100}}\t; no sheet: every buy at full price');
  for (const p of s.panels || []) if (p.modifier !== null && p.modifier !== undefined && !p.single) {
    const side = R.nations.get(String(p.nation || '').toLowerCase().trim()) || String(p.nation || '').toLowerCase();
    L.push(`\t\t{modifier {side ${q(side)}} {card ${q(p.name)}} {factor ${fmt(p.modifier)}}}`);
  }
  L.push('\t}');
  L.push('}');
  return L.join('\r\n') + '\r\n';
}
function pushItems(L, items, ind) {
  L.push(ind + '{items');
  for (const it of items) L.push(ind + '\t' + q(it.name) + (it.note ? '\t; ' + it.note.replace(/[\r\n]+/g, ' ') : ''));
  L.push(ind + '}');
}

// ---- reading ----
const val = t => !t ? null : t.k === 'STRING' ? t.value : t.k === 'INTEGER' || t.k === 'FLOAT' ? t.value : t.text;
const blocksOf = n => n.items.filter(i => i.k === 'BLOCK');
const nm = b => b.items.length ? val(b.items[0]) : null;
const kidv = (b, k) => { const c = blocksOf(b).find(x => nm(x) === k); return c ? c.items.slice(1).map(val) : null; };
const kid1 = (b, k) => { const v = kidv(b, k); return v && v.length ? v[0] : null; };

// model = { file, weapon Map id->{id,label,skill,addon,tiers[{id,label,mp,cp,as,items[{name,line}]}],line}, equip Map id->{id,label,flat,price,tiers[],items[],line},
//   item Map name->{group,tier,kind,line}, mainPriority[], skillFromItem, rounding{mp,cp,cost}, vet{applySkillBonus,maxSkill,statBonus}, cwFactor,
//   pointValue {sp: n|null, dp: n|null} | null (no {point_value} block: not set),
//   stats[{name,weight,base,map}], fixedCp[{label,re,single,notSingle}], squad{addons[{id,price,res[]}], singles[{id,classes,minLevel,mult}], sequence, modifiers[]}, errs[] }
function readModel(buf, file) {
  const errs = [];
  const r = sdlx.read(buf, { file, key: 'resource/set/multiplayer/units/price_model.inc', open: () => null, onError: (f, l, c, m) => errs.push({ line: l, code: c, msg: m }) });
  const root = blocksOf(r.root).find(b => nm(b) === 'price_model');
  const m = { file, weapon: new Map(), equip: new Map(), item: new Map(), mainPriority: [], skillFromItem: true, rounding: { mp: 0.01, cp: 0.01, cost: 1 },
    vet: { applySkillBonus: true, maxSkill: 10, statBonus: true }, cwFactor: 1, stats: [], fixedCp: [], special: new Map(), specials: [], alias: new Map(), throwScore: null, throwPrice: null,
    squad: { addons: [], singles: [], sequences: [], modifiers: [] }, errs, dupItems: [], pointValue: null };
  if (!root) { errs.push({ line: 1, code: 'MODEL_EMPTY', msg: 'no {price_model ...} block' }); return m; }
  const addItems = (blk, group, tier, kind) => {
    const it = blocksOf(blk).find(x => nm(x) === 'items');
    const out = [];
    if (it) for (const t of it.items.slice(1)) {
      const n = String(val(t)).toLowerCase();
      if (m.item.has(n)) m.dupItems.push({ name: n, line: t.line, first: m.item.get(n) });
      else m.item.set(n, { group, tier, kind, line: t.line });
      out.push({ name: n, line: t.line });
    }
    return out;
  };
  for (const b of blocksOf(root)) {
    const k = nm(b);
    if (k === 'rounding') { for (const f of ['mp', 'cp', 'cost']) { const v = kid1(b, f); if (typeof v === 'number') m.rounding[f] = v; } }
    else if (k === 'veterancy') { const a = kid1(b, 'apply_skill_bonus'), x = kid1(b, 'max_skill'), s = kid1(b, 'stat_bonus'); if (a !== null) m.vet.applySkillBonus = !!a; if (x !== null) m.vet.maxSkill = x; if (s !== null) m.vet.statBonus = !!s; }
    else if (k === 'main_priority') m.mainPriority = b.items.slice(1).map(val);
    else if (k === 'skill_from_item') m.skillFromItem = !!val(b.items[1]);
    else if (k === 'cw_factor') m.cwFactor = val(b.items[1]);
    else if (k === 'point_value') {
      m.pointValue = m.pointValue || { sp: null, dp: null };
      for (const f of POINT_KINDS) { const v = kid1(b, f); if (typeof v === 'number' && isFinite(v)) m.pointValue[f] = v; else if (v !== null) errs.push({ line: b.line, code: 'MODEL_POINT_VALUE', msg: `{point_value {${f} ..}} is not a number` }); }
    }
    else if (k === 'weapon_group') {
      const id = val(b.items[1]);
      const g = { id, label: kid1(b, 'label'), skill: kid1(b, 'skill') || 'rifle', addon: !!kid1(b, 'addon'), sole: !!kid1(b, 'sole'), cwAs: kidv(b, 'cw_as') || null, tiers: [], line: b.line };
      for (const t of blocksOf(b).filter(x => nm(x) === 'tier')) {
        const tid = val(t.items[1]);
        for (const w of blocksOf(t).filter(x => nm(x) === 'when_carried')) {
          const v = w.items.slice(1).map(x => String(val(x)).toLowerCase());
          if (v.length >= 2) (g.when = g.when || []).push({ tier: tid, launcher: v[0], ammo: v.slice(1).map(a => a.replace(/^ammo\s+/, '')) });
        }
        g.tiers.push({ id: tid, label: kid1(t, 'label'), mp: (kidv(t, 'mp') || []).map(x => x === -1 ? null : x), cp: (kidv(t, 'cp') || []).map(x => x === -1 ? null : x), as: kid1(t, 'as'), items: addItems(t, id, tid, 'weapon'), line: t.line });
      }
      m.weapon.set(id, g);
    } else if (k === 'group') {
      const id = val(b.items[1]);
      const tiers = blocksOf(b).filter(x => nm(x) === 'tier');
      const g = { id, label: kid1(b, 'label'), flat: !tiers.length, price: kid1(b, 'price') || 0, tiers: [], items: [], line: b.line };
      if (g.flat) g.items = addItems(b, id, null, 'equip');
      for (const t of tiers) { const tid = val(t.items[1]); g.tiers.push({ id: tid, price: kid1(t, 'price') || 0, items: addItems(t, id, tid, 'equip'), line: t.line }); }
      m.equip.set(id, g);
    } else if (k === 'stat') {
      const mp = kidv(b, 'map'), map = {};
      if (mp) for (let i = 0; i + 1 < mp.length; i += 2) map[mp[i]] = mp[i + 1];
      m.stats.push({ name: val(b.items[1]), weight: kid1(b, 'weight') || 0, base: kid1(b, 'base') || 0, map: mp ? map : null });
    } else if (k === 'alias') {
      const v = b.items.slice(1).map(x => String(val(x)).toLowerCase());
      for (const a of v.slice(1)) m.alias.set(a, v[0]);
    } else if (k === 'throwable_score') {
      const ts = { groups: kidv(b, 'groups') || [], cuts: kidv(b, 'cuts') || [], mode: kid1(b, 'mode') || null };
      for (const f of ['energy', 'penetration', 'fire_radius', 'range', 'fuse']) ts[f] = kid1(b, f) || 0;
      // several blocks allowed: each ranks its own groups (model.throwScore.groups = all of them, .by = group -> block)
      if (!m.throwScore) m.throwScore = { groups: [], by: new Map() };
      for (const g of ts.groups) { if (!m.throwScore.groups.includes(g)) m.throwScore.groups.push(g); m.throwScore.by.set(g, ts); }
    } else if (k === 'throwable_price') {
      m.throwPrice = { mpPerTier: kid1(b, 'mp_per_tier') || 0, cpPerTier: kid1(b, 'cp_per_tier') || 0 };
    } else if (k === 'special') {
      const s = { id: val(b.items[1]), label: kid1(b, 'label'), mp: kid1(b, 'mp'), cp: kid1(b, 'cp'), cw: kid1(b, 'cw'), cardMp: kid1(b, 'card_mp'), breeds: [], line: b.line };
      const bl = blocksOf(b).find(x => nm(x) === 'breeds');
      if (bl) for (const t of bl.items.slice(1)) {
        const n = String(val(t)).toLowerCase().replace(/^mp\//, '');
        if (m.special.has(n)) m.errs.push({ line: t.line, code: 'MODEL_DUP_SPECIAL', msg: `breed ${n} in two special blocks; the first wins` });
        else m.special.set(n, s);
        s.breeds.push(n);
      }
      m.specials.push(s);
    } else if (k === 'fixed_cp') {
      let re = null; try { re = new RegExp(kid1(b, 'match') || '^$', 'i'); } catch (e) { errs.push({ line: b.line, code: 'MODEL_REGEX', msg: e.message }); }
      m.fixedCp.push({ label: val(b.items[1]), re, single: kid1(b, 'single'), notSingle: kid1(b, 'not_single') });
    } else if (k === 'squad') {
      for (const s of blocksOf(b)) {
        const sk = nm(s);
        if (sk === 'addon') m.squad.addons.push({ id: val(s.items[1]), price: kid1(s, 'price') || 0, res: (kidv(s, 'match') || []).map(x => { try { return new RegExp(x, 'i'); } catch (e) { return null; } }).filter(Boolean) });
        else if (sk === 'single') m.squad.singles.push({ id: val(s.items[1]), classes: kidv(s, 'classes') || ['*'], minLevel: kid1(s, 'min_level'), mult: kid1(s, 'mult') || 1 });
        else if (sk === 'sequence') {
          const first = s.items[1];
          if (first && first.k === 'STRING') {
            let re = null; const cr = kid1(s, 'cards');
            if (cr) try { re = new RegExp(cr, 'i'); } catch (e) { errs.push({ line: s.line, code: 'MODEL_REGEX', msg: e.message }); }
            m.squad.sequences.push({ id: first.value, sides: kidv(s, 'sides'), re, percent: (kidv(s, 'percent') || [100]).filter(x => typeof x === 'number'), line: s.line });
          } else m.squad.sequences.push({ id: 'sequence', sides: null, re: null, percent: s.items.slice(1).map(val).filter(x => typeof x === 'number'), line: s.line });
        }
        else if (sk === 'modifier') m.squad.modifiers.push({ side: kid1(s, 'side'), card: String(kid1(s, 'card') || '').toLowerCase(), factor: kid1(s, 'factor') || 1 });
      }
    }
  }
  if (!m.mainPriority.length) m.mainPriority = RL.generic().mainPriority;
  return m;
}

// seed --merge: insert new items into the existing text (hand edits kept). Tiered groups get them in "undetermined".
function mergeText(text, adds) {
  const eol = /\r\n/.test(text) ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  const r = sdlx.read(Buffer.from(text, 'latin1'), { file: 'model', key: 'm', open: () => null, onError: () => {} });
  const root = blocksOf(r.root).find(b => nm(b) === 'price_model');
  if (!root) throw new Error('model has no {price_model} block');
  const ins = [];   // {before: line index (0-based), text[]}
  const byGroup = new Map();
  for (const a of adds) { const k = a.kind + ':' + a.group; if (!byGroup.has(k)) byGroup.set(k, []); byGroup.get(k).push(a); }
  const itemLine = (a, ind) => ind + q(a.name) + '\t; ' + (a.reason || '[I]') + (a.guess ? '; guess ' + a.guess : '') + ' (added by seed --merge)';
  for (const [k, list] of byGroup) {
    const [kind, gid] = k.split(/:(.*)/);
    const g = blocksOf(root).find(b => nm(b) === (kind === 'weapon' ? 'weapon_group' : 'group') && val(b.items[1]) === gid);
    if (!g) {
      const t = kind === 'weapon'
        ? [`\t{weapon_group ${q(gid)} {label ${q(gid)}} {skill "rifle"}`, '\t\t{tier "undetermined" {as "medium"}', '\t\t\t{items', ...list.map(a => itemLine(a, '\t\t\t\t')), '\t\t\t}', '\t\t}', '\t}']
        : [`\t{group ${q(gid)} {label ${q(gid.replace(/_/g, ' '))}} {price 0}`, '\t\t{items', ...list.map(a => itemLine(a, '\t\t\t')), '\t\t}', '\t}'];
      ins.push({ before: root.endLine - 1, text: t });
      continue;
    }
    const tiers = blocksOf(g).filter(x => nm(x) === 'tier');
    let host = g;
    if (tiers.length) {
      host = tiers.find(t => val(t.items[1]) === 'undetermined');
      if (!host) { ins.push({ before: g.endLine - 1, text: [kind === 'weapon' ? '\t\t{tier "undetermined" {as "medium"}' : '\t\t{tier "undetermined" {price 0}', '\t\t\t{items', ...list.map(a => itemLine(a, '\t\t\t\t')), '\t\t\t}', '\t\t}'] }); continue; }
    }
    const it = blocksOf(host).find(x => nm(x) === 'items');
    const ind = tiers.length ? '\t\t\t\t' : '\t\t\t';
    if (!it) { ins.push({ before: host.endLine - 1, text: [ind.slice(1) + '{items', ...list.map(a => itemLine(a, ind)), ind.slice(1) + '}'] }); continue; }
    if (it.line === it.endLine) {   // {items "a" "b"} on one line: put the new names before its last '}'
      const i = it.line - 1, p = lines[i].replace(/;.*$/, '').lastIndexOf('}');
      lines[i] = lines[i].slice(0, p) + ' ' + list.map(a => q(a.name)).join(' ') + lines[i].slice(p);
      continue;
    }
    ins.push({ before: it.endLine - 1, text: list.map(a => itemLine(a, ind)) });
  }
  ins.sort((a, b) => b.before - a.before);
  for (const x of ins) lines.splice(x.before, 0, ...x.text);
  return lines.join(eol);
}

module.exports = { buildSeed, writeModel, readModel, mergeText, HEADER, POINT_KINDS };

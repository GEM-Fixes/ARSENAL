// pricecalc/calc: prices breeds and cards from a model (model.readModel) and the mod's final data (mod.js).
//   priceBreed(model, breed, ctx) -> { cls, tier, item, skill, vetStart, vetRank, skillEff, parts{weapon,addon,kit,extras}, mp, cp, cw, unpriced[], undetermined[] }
//     rule "sole" ({sole 1} group item: that tier only) | "weapon";  priceSpecial(model, special, breed) -> same shape, rule "special"
//   priceCard(model, card, mpOf(side,breed)->{mp,cls,level}|null, seq{step,size}|null) -> { rule, add, members, mult, factor, cost, missing[],
//     step, size, percent, family, base (sequence: base = members MP x factor, cost = base x percent / 100) }
// Author: Imperator_Aug (ARSENAL, ia-c5d7b7c3)

const roundTo = (v, s) => v === null || v === undefined || Number.isNaN(v) ? null : s > 0 ? Math.round(Math.round(v / s) * s * 1e6) / 1e6 : v;
const CAT_SKILL = { smg: 'smg', rifle: 'rifle', mgun: 'mgun', pistol: 'pistol', bazooka: 'rocketlauncher' };

// value at level n (1..10); a missing cell takes the nearest defined level (sheet tables with gaps)
function at(arr, n) {
  if (!arr || !arr.length) return null;
  if (arr[n - 1] !== null && arr[n - 1] !== undefined) return arr[n - 1];
  for (let d = 1; d < 10; d++) {
    for (const k of [n - 1 - d, n - 1 + d]) if (k >= 0 && k < arr.length && arr[k] !== null && arr[k] !== undefined) return arr[k];
  }
  return null;
}
function tierOf(model, g, tid) {
  let t = g.tiers.find(x => x.id === tid);
  if (t && t.id === 'undetermined' && t.as) t = g.tiers.find(x => x.id === t.as) || t;
  return t;
}

// ctx: { vet: ranks[] from readVetEffects, res(name) -> resolveItem result }
function priceBreed(model, b, ctx) {
  const out = { cls: null, tier: null, item: null, skill: null, vetStart: 1, vetRank: b.vet.rank, skillEff: null, parts: { weapon: 0, addon: 0, kit: 0, extras: 0, throwable: 0, throwableCp: 0 },
    mp: null, cp: null, cw: null, unpriced: [], undetermined: [], notes: [] };
  out.vetStart = b.vet.rank || 1;
  const rankFx = (ctx.vet && ctx.vet[b.vet.rank]) || {};
  const bonus = model.vet.applySkillBonus && b.vet.rank ? (rankFx.weapon_skill || 0) : 0;
  // weapons: pick main by priority
  const carried = [];
  const look = model.lookup || (n => model.item.get(n) || (model.alias && model.alias.has(n) ? model.item.get(model.alias.get(n)) : null));
  const has = new Set(b.items.map(i => i.name.replace(/^ammo\s+/, '')));
  // {when_carried}: the launcher's tier follows the ammo the breed carries
  const tierFor = (g, name, tid) => { const w = (g.when || []).find(x => x.launcher === name && x.ammo.some(a => has.has(a))); return w ? w.tier : tid; };
  for (const it of b.items) {
    const e0 = look(it.name);
    const e = e0 && e0.kind === 'weapon' && model.weapon.get(e0.group) ? Object.assign({}, e0, { tier: tierFor(model.weapon.get(e0.group), it.name, e0.tier) }) : e0;
    if (!e) { if (it.count > 0 && !it.loaded) out.unpriced.push(it.name); continue; }
    if (e.tier === 'undetermined') out.undetermined.push(it.name);
    carried.push({ it, e });
  }
  for (const [slot, nm] of Object.entries(b.armor || {})) {
    if (!nm) continue;
    const e = look(String(nm).toLowerCase());
    if (!e) { out.unpriced.push(String(nm).toLowerCase()); continue; }
    if (e.tier === 'undetermined') out.undetermined.push(String(nm).toLowerCase());
    carried.push({ it: { name: String(nm).toLowerCase(), count: 1, armor: slot }, e });
  }
  const weapons = carried.filter(c => c.e.kind === 'weapon' && model.weapon.get(c.e.group));
  let main = null;
  for (const cls of model.mainPriority) { main = weapons.find(w => w.e.group === cls && !model.weapon.get(cls).addon); if (main) break; }
  if (!main) main = weapons.find(w => !model.weapon.get(w.e.group).addon) || null;
  const skillOf = (g, name) => {
    let perk = g.skill;
    if (model.skillFromItem && ctx.res) {
      const r = ctx.res(name);
      if (r) { if (r.path.startsWith('rifle/ptr/')) perk = 'at_rifle'; else if (CAT_SKILL[r.cat]) perk = CAT_SKILL[r.cat]; }
    }
    const lv = b.perks[perk];
    return { perk, level: typeof lv === 'number' ? lv : 1 };
  };
  const eff = lv => Math.max(1, Math.min(model.vet.maxSkill || 10, lv + bonus));
  // {sole 1} group (radio): the breed is priced only by that item's tier, level 1; nothing else counts
  const sole = weapons.find(w => model.weapon.get(w.e.group).sole);
  if (sole) {
    const g = model.weapon.get(sole.e.group), t = tierOf(model, g, sole.e.tier);
    out.rule = 'sole'; out.cls = g.id; out.tier = sole.e.tier; out.item = sole.it.name;
    out.parts.weapon = t ? at(t.mp, 1) || 0 : 0;
    out.mp = roundTo(out.parts.weapon, model.rounding.mp);
    out.cp = roundTo(t ? at(t.cp, 1) : null, model.rounding.cp);
    out.cw = out.cp === null ? null : roundTo(out.cp * (model.cwFactor || 1), model.rounding.cp);
    out.unpriced = []; out.undetermined = sole.e.tier === 'undetermined' ? [sole.it.name] : [];
    return out;
  }
  out.rule = 'weapon';
  if (main) {
    const g = model.weapon.get(main.e.group), t = tierOf(model, g, main.e.tier);
    const sk = skillOf(g, main.it.name);
    out.cls = g.id; out.tier = main.e.tier; out.item = main.it.name; out.skill = sk.level; out.skillPerk = sk.perk; out.skillEff = eff(sk.level);
    out.parts.weapon = t ? at(t.mp, out.skillEff) || 0 : 0;
    out.cpCurve = t ? at(t.cp, out.skillEff) : null;
    // {cw_as "group" "tier"}: CW read from another group's CP curve at the same level (the mod: snipers weigh as an smg man)
    if (g.cwAs && g.cwAs.length === 2 && model.weapon.get(g.cwAs[0])) { const ct = tierOf(model, model.weapon.get(g.cwAs[0]), g.cwAs[1]); out.cwCurve = ct ? at(ct.cp, out.skillEff) : null; }
  } else {
    // no weapon: skill = highest weapon perk, class none
    const lv = Math.max(1, ...['pistol', 'smg', 'mgun', 'rifle'].map(p => typeof b.perks[p] === 'number' ? b.perks[p] : 1));
    out.skill = lv; out.skillEff = eff(lv);
  }
  // per-item breakdown (GUI): what each carried item adds
  const lines = out.lines = [];
  const line = (c, role, mp, extra) => lines.push(Object.assign({ item: c.it.name, group: c.e.group, tier: c.e.tier || null, count: c.it.count, role, mp: roundTo(mp, 0.0001) }, extra || {}));
  if (main) line(main, 'main', out.parts.weapon, { level: out.skillEff });
  const seenAddon = new Set();
  for (const w of weapons) {
    const g = model.weapon.get(w.e.group);
    if (w === main) continue;
    if (!g.addon || seenAddon.has(g.id)) { line(w, g.addon ? 'addon (counted once)' : 'not main weapon', 0); continue; }
    seenAddon.add(g.id);
    const t = tierOf(model, g, w.e.tier), sk = skillOf(g, w.it.name);
    // owner rule 2026-11-19: an add-on is charged by the realized chance of carrying it ({item "x" 0 1 filled} = 0.25), never more than once
    const chance = Math.min(1, Math.max(0, w.it.count)), full = t ? at(t.mp, eff(sk.level)) || 0 : 0, v = full * chance;
    out.parts.addon += v;
    line(w, chance < 1 ? 'addon x chance ' + roundTo(chance, 0.0001) : 'addon', v, { level: eff(sk.level), full, chance });
  }
  for (const c of carried) {
    if (c.e.kind !== 'equip') continue;
    const g = model.equip.get(c.e.group);
    if (!g) { line(c, 'group missing', 0); continue; }
    const price = g.flat ? g.price : ((g.tiers.find(t => t.id === c.e.tier) || {}).price || 0);
    out.parts.kit += price * c.it.count;
    line(c, 'kit', price * c.it.count, { price });
    // computed throwable tier: per_tier x tier x expected count
    if (model.throwScore && model.throwPrice && model.throwScore.groups.includes(g.id) && ctx.throwTier) {
      const tt = ctx.throwTier(c.it.name);
      if (tt && tt.tier) { out.parts.throwable = (out.parts.throwable || 0) + model.throwPrice.mpPerTier * tt.tier * c.it.count; out.parts.throwableCp = (out.parts.throwableCp || 0) + model.throwPrice.cpPerTier * tt.tier * c.it.count; (out.throwables = out.throwables || []).push(c.it.name + ':' + tt.tier);
        lines[lines.length - 1].throwTier = tt.tier; lines[lines.length - 1].mp = roundTo(lines[lines.length - 1].mp + model.throwPrice.mpPerTier * tt.tier * c.it.count, 0.0001); }
    }
  }
  if (out.parts.throwable === undefined) out.parts.throwable = 0;
  // stats
  const sv = name => {
    switch (name) {
      case 'health': return (typeof b.perks.health === 'number' ? b.perks.health : 1) * (1 + (model.vet.statBonus && b.vet.rank ? rankFx.health || 0 : 0));
      case 'stamina': return (typeof b.perks.stamina === 'number' ? b.perks.stamina : 1) * (1 + (model.vet.statBonus && b.vet.rank ? rankFx.stamina || 0 : 0));
      case 'speed': return typeof b.perks.speed === 'number' ? b.perks.speed : 1;
      case 'sight': return b.perks.vision;
      case 'stealth': return b.perks.stealth ? 1 : 0;
      case 'avoidance': return typeof b.perks.avoidance === 'number' ? b.perks.avoidance : 0;
      case 'rocket': return typeof b.perks.rocketlauncher === 'number' ? b.perks.rocketlauncher : 0;
      default: return typeof b.perks[name] === 'number' ? b.perks[name] : 0;
    }
  };
  for (const s of model.stats) {
    if (!s.weight) continue;
    let v = sv(s.name);
    if (s.map) v = s.map[v] !== undefined ? s.map[v] : 0;
    if (typeof v !== 'number') v = 0;
    out.parts.extras += s.weight * (v - s.base);
  }
  const p = out.parts;
  const thMp = p.throwable || 0, thCp = p.throwableCp || 0;
  out.mp = roundTo(p.weapon + p.addon + p.kit + p.extras + thMp, model.rounding.mp);
  const breedName = ctx.breedName || '';
  const fx = model.fixedCp.find(f => f.re && f.re.test(breedName));
  if (fx) { out.cp = /_single$/i.test(breedName) ? fx.single : fx.notSingle; out.fixedCp = fx.label; }
  else out.cp = out.cpCurve !== undefined && out.cpCurve !== null ? out.cpCurve : null;
  if (out.cp !== null && thCp) out.cp += thCp;
  out.cp = roundTo(out.cp, model.rounding.cp);
  const cwBase = !fx && typeof out.cwCurve === 'number' ? out.cwCurve + (thCp || 0) : out.cp;
  out.cw = cwBase === null ? null : roundTo(cwBase * (model.cwFactor || 1), model.rounding.cp);
  for (const k of Object.keys(p)) p[k] = roundTo(p[k], 0.0001);
  return out;
}

// {special} breed: fixed mp / cp / cw from the model block (officers)
function priceSpecial(model, s, b) {
  return { rule: 'special', special: s.id, cls: 'special', tier: s.id, item: null, skill: null, skillPerk: null, vetStart: b ? b.vet.rank || 1 : null, vetRank: b ? b.vet.rank : null,
    skillEff: null, parts: { weapon: 0, addon: 0, kit: 0, extras: 0, throwable: 0, throwableCp: 0 }, mp: roundTo(s.mp, model.rounding.mp), cp: roundTo(s.cp, model.rounding.cp),
    cw: s.cw === null || s.cw === undefined ? null : roundTo(s.cw, model.rounding.cp), cardMp: s.cardMp === undefined ? null : s.cardMp, unpriced: [], undetermined: [], notes: [] };
}

// sequence family for a card: first whose sides / card-name regex match
function seqFamily(model, card) {
  const nm = String(card.name).replace(/\([^)]*\)$/, '');
  return model.squad.sequences.find(f => (!f.sides || !f.sides.length || f.sides.includes(card.side)) && (!f.re || f.re.test(nm))) || null;
}

// seq (sequence cards only): { step (1-based buy number), size } from the caller's grouping, or null when the card has no {icon}
function priceCard(model, card, mpOf, seq) {
  const out = { rule: null, add: null, addPrice: 0, members: 0, mult: 1, factor: 1, cost: null, missing: [], ambiguous: null, step: null, size: null, percent: null, family: null, base: null };
  const vehicles = card.vehicles.filter(v => v !== '*' || true);
  // a vehicle on a non-squad macro (unit_*: tanks, guns, crews, trucks with crews) = a vehicle card: hand-priced (owner)
  if (vehicles.includes('*') || !card.members.length || (vehicles.length && !/^squad/i.test(card.macro || ''))) { out.rule = 'hand'; return out; }
  if (vehicles.length) {
    const hits = vehicles.map(v => model.squad.addons.filter(a => a.res.some(re => re.test(v))));
    if (hits.some(h => !h.length)) { out.rule = 'hand'; return out; }
    if (vehicles.length > 1 || hits[0].length > 1) out.ambiguous = vehicles.length > 1 ? `${vehicles.length} vehicles (${vehicles.join(', ')})` : `vehicle ${vehicles[0]} matches add-ons ${hits[0].map(a => a.id).join(', ')}`;
    out.add = hits.map(h => h[0].id).join('+'); out.addPrice = hits.reduce((s, h) => s + h[0].price, 0);
  }
  let total = 0, n = 0, one = null;
  for (const m of card.members) {
    const p = mpOf(m.side, m.breed);
    n += m.count;
    if (!p || p.mp === null) { out.missing.push(m.side + '/' + m.breed); continue; }
    total += p.mp * m.count; one = p;
  }
  out.members = roundTo(total, 0.0001);
  if (card.sequence) {
    out.rule = 'sequence';
    const fam = seq ? seqFamily(model, card) : null;
    if (!seq) out.ambiguous = out.ambiguous || 'sequence macro but no {icon}: buy order unknown, priced as the sum of its members';
    else if (!fam) out.ambiguous = out.ambiguous || 'no {sequence} family in the model matches this card';
    const nm0 = String(card.name).replace(/\([^)]*\)$/, '').toLowerCase();
    const mod0 = model.squad.modifiers.find(x => x.card === nm0 && (!x.side || x.side === card.side));
    if (mod0) out.factor = mod0.factor;
    if (seq) { out.step = seq.step; out.size = seq.size; }
    if (fam && fam.percent.length) { out.family = fam.id; out.percent = fam.percent[Math.min(seq.step, fam.percent.length) - 1]; }
    if (out.missing.length) return out;
    out.base = roundTo((total + out.addPrice) * out.factor, 0.0001);
    out.cost = roundTo(out.base * (out.percent === null ? 100 : out.percent) / 100, model.rounding.cost);
    return out;
  }
  if (n === 1 && !vehicles.length && !card.sequence && one) {
    out.rule = 'single';
    const r = model.squad.singles.find(s => (s.classes.includes('*') || s.classes.includes(one.cls)) && (!s.minLevel || (one.level || 0) >= s.minLevel));
    if (r) { out.mult = r.mult; out.singleRule = r.id; }
  } else out.rule = card.sequence ? 'sequence' : 'squad';
  const nm = String(card.name).replace(/\([^)]*\)$/, '').toLowerCase();
  const mod = model.squad.modifiers.find(x => x.card === nm && (!x.side || x.side === card.side));
  if (mod) out.factor = mod.factor;
  if (out.missing.length) return out;
  out.cost = roundTo((total + out.addPrice) * out.mult * out.factor, model.rounding.cost);
  return out;
}

module.exports = { priceBreed, priceSpecial, priceCard, seqFamily, roundTo, at };

// pricecalc/classify: puts one inventory/armour item into a price group for `seed` (guesses, all [I]).
//   classify(name, res, sheetClasses, from, rules) -> { kind:'weapon'|'equip', group, tier ('undetermined' when the sheet does not say),
//      guess, reason } | null (UNGROUPED)
//   res = mod.resolveItem() result (stuff path decides the function); sheet Items column decides weapon tiers.
//   Code holds only what is true for any AS2 mod (stuff folder -> weapon group, grenade folders, armour slots); every pick of one mod
//   (owner tiers, dummy weapons, name patterns, sheet spellings) comes from the rules file (rules.js, `seed --rules`).
//   EQUIP = the equipment groups seed writes (one function each, any AS2 mod).
// Author: Imperator_Aug (ARSENAL, ia-d1b3d14e)
const RL = require('./rules');

const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

const EQUIP = [
  ['frag_grenade', 'hand frag grenade'], ['at_grenade', 'anti-tank hand grenade'], ['bundle_charge', 'bundle / satchel charge'],
  ['smoke_grenade', 'smoke grenade'], ['incendiary', 'incendiary (molotov, flame grenade)'],
  ['ap_mine', 'anti-personnel mine'], ['at_mine', 'anti-tank mine'], ['demolition_charge', 'demolition charge (dynamite, ladung)'], ['cumulative_charge', 'shaped charge'],
  ['rifle_grenade_frag', 'rifle grenade, frag'], ['rifle_grenade_at', 'rifle grenade, anti-tank (AP)'], ['rifle_grenade_wp', 'rifle grenade, white phosphorus'], ['rifle_grenade_smoke', 'rifle grenade, smoke'],
  ['ammo_ptr', 'AT rifle ammunition'], ['ammo_small_arms', 'small-arms ammunition (magazines, clips, belts)'],
  ['call_in', 'flare gun / call-in item'], ['call_in_ammo', 'flare / call-in ammunition'],
  ['bandage', 'bandage'], ['medkit', 'medkit'], ['morphine', 'morphine'],
  ['binocular', 'binocular'], ['shovel', 'shovel / spade'], ['sandbag_kit', 'sandbag kit'], ['barbwire_kit', 'barbed wire kit'], ['hedgehog_kit', 'tank hedgehog kit'],
  ['mine_detector', 'mine detector'], ['repair_kit', 'repair kit'], ['wirecutters', 'wire cutters'], ['camouflage', 'camouflage (plant, tree)'],
  ['backpack', 'backpack, roll, barrel case (carried kit)'], ['melee', 'knife / melee item'], ['ammo_box', 'ammo box'], ['fuel', 'fuel can'], ['flame_fuel', 'flamethrower fuel tank'],
  ['helmet', 'helmet (armour, head)'], ['cap', 'field cap (head, no armour)'], ['vest', 'body armour / vest / pouches (armour, body)'],
];
const THROWABLE_GROUPS = ['frag_grenade', 'at_grenade', 'bundle_charge', 'smoke_grenade', 'incendiary'];
const EQUIP_IDS = new Set(EQUIP.map(e => e[0]));
const DUMMY_GROUP = 'dummy_weapon';
const rulesOf = r => r || RL.generic();

// sheet Items tokens: "mp40/28/41" -> mp40 mp28 mp41; a token the rules alias maps to item-name prefixes, else matches itself
function sheetTokens(sheetClasses, rules) {
  const R = rulesOf(rules), toks = [];
  for (const c of sheetClasses || []) for (const t of c.tiers) for (const raw of t.items || []) {
    const parts = raw.split('/');
    const first = parts[0].trim(), pre = /^([a-z ]*?)\d+$/i.exec(first.replace(/\s+/g, ''));
    const names = [first].concat(parts.slice(1).map(p => pre && /^\d+$/.test(p.trim()) ? pre[1] + p.trim() : p.trim()));
    for (const nm of names) {
      const n = norm(nm);
      if (!n) continue;
      const stems = R.sheetAlias.has(n) ? R.sheetAlias.get(n) : [n];
      for (const s of stems) toks.push({ cls: c.id, tier: t.id, token: nm, stem: s });
    }
  }
  return toks;
}

// stuff folder -> weapon group (holds for any AS2 mod); the rules' name patterns pick a group inside one folder first
function weaponClassByDir(stem, p, cat, R) {
  if (p.startsWith('rifle/sniper/')) return { cls: 'snipers', forced: true };
  if (p.startsWith('rifle/ptr/')) return { cls: 'at_rifles', forced: true };
  for (const r of R.classByName) if (r.stuff === cat && r.re.test(stem)) return { cls: r.group, forced: r.forced, why: r.why || undefined, tier: r.tier, tierWhy: r.tierWhy };
  if (cat === 'bazooka') return { cls: 'at' };
  if (cat === 'flame') return { cls: 'flame', forced: true };
  if (cat === 'reactive') return { cls: 'light_mortar', forced: true };
  if (cat === 'pistol') return { cls: 'pistol', forced: true };
  if (cat === 'smg') return { cls: 'smg' };
  if (cat === 'mgun') return { cls: 'mg' };
  if (cat === 'rifle') return { cls: 'rifles' };
  return null;
}

function equip(stem, p, cat, words, R) {
  const st = stem;
  for (const r of R.equipName) if (r.stuff === cat && r.re.test(st)) return r.group;
  if (cat === 'grenade') {
    if (/^00 /.test(p.split('/')[1] || '') || /smoke/.test(st)) return 'smoke_grenade';
    if (/x5$|x3$|satchel/.test(st)) return 'bundle_charge';
    if (/molotov|flam/.test(st)) return 'incendiary';
    if (/^02 /.test(p.split('/')[1] || '')) return 'at_grenade';
    return 'frag_grenade';
  }
  if (cat === 'explosive') return /s_mine|antipersonnel/.test(p) ? 'ap_mine' : /antitank/.test(p) ? 'at_mine' : 'demolition_charge';
  if (cat === 'ammo' || cat === 'reactive' || cat === 'bazooka') {
    if (/flare|flaer/.test(st)) return 'call_in_ammo';
    if (/grenade/.test(st) && cat === 'ammo') {
      const w = words.slice(1).join(' ');
      if (/\bfg\b/.test(w)) return 'rifle_grenade_frag';
      if (/\bwp\b/.test(w)) return 'rifle_grenade_wp';
      if (/\bsm\b/.test(w)) return 'rifle_grenade_smoke';
      return /\bap\d*\b|_at$/.test(w + ' ' + st) ? 'rifle_grenade_at' : 'rifle_grenade_frag';
    }
    if (cat === 'bazooka') return 'ammo_' + st.replace(/[^a-z0-9]+/g, '_');
    if (cat === 'reactive') { const m = /mortar(\d+)/.exec(p); return m ? 'ammo_mortar' + m[1] : /5cm_grenade/.test(st) ? 'ammo_mortar50' : 'ammo_' + st; }
    if (st === 'ptr') return 'ammo_ptr';
    return 'ammo_small_arms';
  }
  if (cat === 'med') return ['bandage', 'medkit', 'morphine'].includes(st) ? st : 'bandage';
  if (cat === 'special') {
    if (/binocular/.test(st)) return 'binocular';
    if (/spade|shovel/.test(st)) return 'shovel';
    if (/sandbag/.test(st)) return 'sandbag_kit';
    if (/barbwire/.test(st)) return 'barbwire_kit';
    if (/hedgehog/.test(st)) return 'hedgehog_kit';
    if (/mine_detector/.test(st)) return 'mine_detector';
    if (/repair_kit/.test(st)) return 'repair_kit';
    if (/wirecutter/.test(st)) return 'wirecutters';
    if (/plant|tree/.test(st)) return 'camouflage';
    if (/cumulative_charge/.test(st)) return 'cumulative_charge';
    if (/smoke_off_map/.test(st)) return 'call_in';
    return null;
  }
  if (cat === 'packs' || (cat === 'body' && /backpack|roll|barrel_case|pack/.test(st))) return 'backpack';
  if (cat === 'melee') return 'melee';
  if (cat === 'flame') return 'flame_fuel';
  if (cat === 'capacity') return 'ammo_box';
  if (cat === 'content') return 'fuel';
  if (cat === 'head' || (cat === '-equipment' && /head\//.test(p))) return /helmet/.test(st) ? 'helmet' : 'cap';
  if (cat === 'body') return 'vest';
  return null;
}

// name-only fallback when no stuff file was found
function byName(n) {
  if (/knife|bayonet/.test(n)) return 'melee';
  if (/shovel|spade/.test(n)) return 'shovel';
  if (/ammo_box/.test(n)) return 'ammo_box';
  if (/^ammo /.test(n)) return 'ammo_small_arms';
  if (/helmet/.test(n)) return 'helmet';
  if (/grenade/.test(n)) return 'frag_grenade';
  return null;
}

// rules: rules.readRules() result (mod picks) or null (generic: folder groups only)
function classify(name, res, sheetClasses, from, rules) {
  const R = rulesOf(rules);
  const words = String(name).toLowerCase().split(/\s+/).filter(Boolean);
  if (from === 'armor_head' || from === 'armor_body') {
    const g = from === 'armor_body' ? 'vest' : /helmet/.test(name) ? 'helmet' : 'cap';
    return { kind: 'equip', group: g, tier: null, reason: `[I] armour slot ${from === 'armor_body' ? 'body' : 'head'}` };
  }
  if (!res) {
    const g = byName(name);
    return g ? { kind: 'equip', group: g, tier: null, guess: guessTier(g, name, R), reason: `[I] no stuff file found; group by name` } : null;
  }
  const p = res.path, cat = res.cat, stem = p.slice(p.lastIndexOf('/') + 1).split('.')[0];
  if (R.dummies.has(stem)) return { kind: 'equip', group: DUMMY_GROUP, tier: null, reason: `owner: dummy weapon (${R.dummies.get(stem)}), breeds priced by {special}` };
  const own = R.items.get(stem);
  if (own) return { kind: R.weaponGroups.has(own.group) ? 'weapon' : 'equip', group: own.group, tier: own.tier, guess: own.tier, reason: own.why || `owner rule: ${stem} = ${own.group} ${own.tier}` };
  const isWeaponFile = ['smg', 'rifle', 'mgun', 'flame', 'pistol'].includes(cat) || (cat === 'bazooka' && /\.weapon$/.test(p)) || (cat === 'reactive' && /mortar_/.test(stem) && !/\.ammo$/.test(p));
  // call-in flare guns (rules {call_in}): one tier per calibre in the name; a sheet class of that group gives the prices
  const ci = R.callIn;
  if (ci && cat === ci.stuff && ci.re.test(stem) && !(ci.not && ci.not.test(stem))) {
    const m = ci.calibres.length ? new RegExp('(?:^|_)(' + ci.calibres.join('|') + ')(?:_|$)').exec(stem) : null;
    const sc = (sheetClasses || []).find(c => c.id === ci.group);
    if (m && sc) return { kind: 'weapon', group: ci.group, tier: m[1], guess: m[1], reason: `[I] call-in flare gun, calibre ${m[1]} in the name -> sheet ${sc.label} ${m[1]}` };
    return { kind: 'weapon', group: ci.group, tier: 'undetermined', guess: ci.guess && ci.guess.re.test(stem) ? ci.guess.text : 'none (no calibre in the name)', reason: `[I] call-in flare gun ${p}` };
  }
  if (isWeaponFile && !R.notWeapon.some(r => r.stuff === cat && r.re.test(stem))) {
    const d = weaponClassByDir(stem, p, cat, R) || { cls: 'rifles' };
    if (d.tier !== undefined && d.tier !== null) return { kind: 'weapon', group: d.cls, tier: String(d.tier), guess: String(d.tier), reason: `${d.tierWhy || 'rules: ' + d.cls + ' = ' + d.tier} (stuff ${p})` };
    const wg = R.weaponGroups.get(d.cls);
    if (wg && wg.flat) return { kind: 'weapon', group: d.cls, tier: wg.flat.tier, guess: wg.flat.tier, reason: `${wg.flat.why} (stuff ${p})` };
    const allowed = d.forced ? [d.cls] : (R.sheetMatch.get(cat) || [d.cls]);
    const s = norm(stem), toks = sheetTokens(sheetClasses, R).filter(t => allowed.includes(t.cls) && t.stem.length >= 2 && s.startsWith(t.stem));
    toks.sort((a, b) => b.stem.length - a.stem.length);
    if (toks.length) {
      const t = toks[0];
      let tier = t.tier, why = `sheet ${t.cls} ${t.tier} "${t.token}"`;
      const tn = R.tierByName.find(r => r.group === t.cls && r.re.test(stem));
      if (tn) { tier = tn.tier; why += ', ' + tn.why; }
      return { kind: 'weapon', group: t.cls, tier, guess: tier, reason: `[I] ${why}` };
    }
    const sc = (sheetClasses || []).find(c => c.id === d.cls);
    if (sc && sc.tiers.length === 1) return { kind: 'weapon', group: d.cls, tier: sc.tiers[0].id, guess: sc.tiers[0].id, reason: `[I] stuff ${p}${d.why ? ' (' + d.why + ')' : ''}; the only tier of the sheet class` };
    return { kind: 'weapon', group: d.cls, tier: 'undetermined', guess: null, reason: `[I] stuff ${p}${d.why ? ' (' + d.why + ')' : ''}; ${sheetClasses && sheetClasses.length ? 'not in the sheet Items column' : 'no sheet: tier unknown'}` };
  }
  const g = equip(stem, p, cat, words, R);
  if (!g) { const g2 = byName(name); return g2 ? { kind: 'equip', group: g2, tier: null, guess: guessTier(g2, stem, R), reason: `[I] stuff ${p}; group by name` } : null; }
  return { kind: 'equip', group: g, tier: null, guess: guessTier(g, stem, R), reason: `[I] stuff ${p}` };
}
function guessTier(g, stem, R) {
  const list = R.equipGuess.get(g);
  for (const [re, tier, why] of list || []) if (re.test(stem)) return tier + ' (' + why + ')';
  return list ? 'medium (no rule)' : null;
}

// best guess for an undetermined weapon: a determined item of the same class sharing the name stem, else medium
function guessWeaponTier(item, cls, determined) {
  const s = norm(item).replace(/\d+$/, '');
  let best = null;
  for (const [nm, t] of determined) {
    if (t.group !== cls) continue;
    const o = norm(nm);
    let k = 0; while (k < s.length && k < o.length && s[k] === o[k]) k++;
    if (k >= 4 && (!best || k > best.k)) best = { k, tier: t.tier, nm };
  }
  return best ? `${best.tier} (same family as "${best.nm}")` : 'medium (no family match)';
}

module.exports = { classify, guessWeaponTier, EQUIP, EQUIP_IDS, sheetTokens, norm, THROWABLE_GROUPS, DUMMY_GROUP, weaponClassByDir };

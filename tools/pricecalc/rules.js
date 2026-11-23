// pricecalc/rules: the seed rules file (`seed --rules <file>`): every pick that belongs to ONE mod (item tiers the owner set, dummy
// weapons, name patterns, sheet spellings, add-on vehicles, fixed-CP breed names, owner price rules). Without a rules file the seed
// uses only what holds for any AS2 mod (GENERIC below: stuff folder -> weapon group, grenade folders, armour slots).
//   readRules(buf, file) -> rules (shape at GENERIC)      generic() -> rules with no mod picks      rules.errs[{line, code, msg}]
// Grammar (plain SDL like the model; `;` comments; every block optional; order inside a list = order of the blocks):
//   {price_rules
//     {weapon_group "id" {label "text"} {skill "perk"} [{addon 1}] [{sole 1}] [{cw_as "group" "tier"}]
//        [{flat {tier "flat"} {label "text"} {why "text"}}]}       a weapon group the seed writes (all of them, in this order;
//                                  the folder groups have fixed ids: rifles snipers at_rifles smg mg at flame light_mortar pistol)
//     {main_priority "group" ...}     which group decides a soldier's class (first carried wins); the model gets the same list
//     {class_by_name {stuff "cat"} {match "regex"} {group "g"} [{forced 1}] [{why "text"}] [{tier "t"} {tier_why "text"}]}
//                                  a weapon file of stuff folder <cat> whose name matches goes to <group> (first rule wins);
//                                  forced = only that group's sheet tokens may match; tier = fixed tier (no sheet lookup)
//     {tier_by_name {group "g"} {match "regex"} {tier "t"} {why "text"}}   after a sheet match: a name pattern moves it to tier t
//     {not_weapon {stuff "cat"} {match "regex"}}   a file in a weapon folder that is no weapon (balloon, signal pistol)
//     {call_in {group "radio"} {stuff "pistol"} {match "regex"} [{not "regex"}] {calibres 60 81 ...} [{undetermined_as "81"}]
//        [{guess_match "regex" "text"}] [{cp_from "singles label"}]}   call-in flare guns: one tier per calibre in the name;
//                                  a sheet class <group> with two rows = row 1 calibres, row 2 their MP; CP from the singles table
//     {sheet_match "cat" "class" ...}   which sheet classes an item of stuff folder <cat> may match (default: its own group)
//     {sheet_alias "token" "stem" ...}  a sheet Items token (letters and digits only) -> item name prefixes; no stem = matches nothing
//     {item "stem" {group "g"} {tier "t"} [{why "text"}]}   one item placed by hand (owner picks)
//     {dummy "stem" {function "name"}}   a dummy weapon: breeds carrying it are priced by unit function ({special} blocks)
//     {equip_group "id" {label "text"}}   an extra equipment group (written after the generic ones, before ammunition groups)
//     {equip_name {stuff "cat"} {match "regex"} {group "g"}}   an equipment file of folder <cat> whose name matches goes to <group>
//     {equip_guess "group" {match "regex"} {tier "t"} {why "text"}}   review guess of a quality step inside an equipment group
//     {extra_tier "group" "tier" {copy "tier"} {label "text"}}   a tier the sheet lacks: a copy of another tier's tables
//     {when_carried "group" "tier" "launcher" {ammo "name"} [{note "text"}]}   launcher priced in <tier> when the breed carries <ammo>
//     {when_carried "group" "tier" "launcher" {ammo_ap 1}}   same, ammo = the launcher's strongest ap* load (stuff file)
//     {throwable_score {groups "g" ...} [{mode "armor"}] {energy E} {penetration P} {fire_radius F} {range R} {fuse U} {cuts c ...}}
//                                  copied into the model (several blocks allowed); none = one generic block over every throwable group
//     {throwable_price {mp_per_tier P} {cp_per_tier Q} [{note "text"}]}   copied into the model; none = 0 / 0
//     {fixed_cp_match "sheet label" "regex"}   breed-name pattern of a sheet singles row (default: the label with _ for spaces)
//     {addon "id" {label "regex"} {match "regex" ...}}   sheet add-on column whose label matches -> add-on id + vehicle patterns
//     {single "id" {classes "c" ...} [{min_level N}] {sheet "regex"} [{note "text"}]}   single-buy rules, mult from the sheet
//                                  column matching <sheet> (1 when absent); none = one rule "regular" {classes "*"}
//     {sheet_nation "sheet nation" "side"}   sheet panel nation -> side (default: the nation in lower case)
//   }
// Author: Imperator_Aug (ARSENAL, ia-7dbe52c3)
const sdlx = require('../lib/sdlx');

const val = t => !t ? null : t.k === 'STRING' ? t.value : t.k === 'INTEGER' || t.k === 'FLOAT' ? t.value : t.text;
const blocksOf = n => n.items.filter(i => i.k === 'BLOCK');
const nm = b => b.items.length ? val(b.items[0]) : null;
const kidv = (b, k) => { const c = blocksOf(b).find(x => nm(x) === k); return c ? c.items.slice(1).map(val) : null; };
const kid1 = (b, k) => { const v = kidv(b, k); return v && v.length ? v[0] : null; };

// groups every AS2 mod has: one per stuff folder (stuff categories); ids are fixed (classify.weaponClassByDir)
const GENERIC_GROUPS = [
  ['snipers', 'snipers (stuff rifle/sniper)', 'rifle'], ['flame', 'flamethrowers (stuff flame)', 'rifle'], ['at_rifles', 'AT rifles (stuff rifle/ptr)', 'at_rifle'],
  ['at', 'AT launchers (stuff bazooka)', 'rocketlauncher'], ['mg', 'machine guns (stuff mgun)', 'mgun'], ['light_mortar', 'light mortars (stuff reactive)', 'rifle'],
  ['smg', 'SMG (stuff smg)', 'smg'], ['rifles', 'rifles (stuff rifle)', 'rifle'], ['pistol', 'pistols (stuff pistol)', 'pistol'],
];
const GENERIC_THROW = { groups: ['frag_grenade', 'at_grenade', 'bundle_charge', 'smoke_grenade', 'incendiary'], mode: null, energy: 5, penetration: 0.1, fire_radius: 1, range: 0.2, fuse: -0.5, cuts: [10, 20, 40, 80] };

function generic() {
  const R = { file: null, generic: true, errs: [], weaponGroups: new Map(), mainPriority: [], classByName: [], tierByName: [], notWeapon: [], callIn: null,
    sheetMatch: new Map(), sheetAlias: new Map(), items: new Map(), dummies: new Map(), equipGroups: [], equipName: [], equipGuess: new Map(),
    extraTiers: [], whenCarried: [], throwScores: null, throwPrice: null, fixedCpMatch: new Map(), addons: [], singles: null, nations: new Map() };
  for (const [id, label, skill] of GENERIC_GROUPS) R.weaponGroups.set(id, { id, label, skill, addon: false, sole: false, cwAs: null, flat: null });
  R.mainPriority = GENERIC_GROUPS.map(g => g[0]);
  return R;
}

function readRules(buf, file) {
  const R = generic();
  R.file = file; R.generic = false;
  const errs = R.errs;
  const r = sdlx.read(buf, { file, key: 'resource/set/multiplayer/units/price_rules.inc', open: () => null, onError: (f, l, c, m) => errs.push({ line: l, code: c, msg: m }) });
  const root = blocksOf(r.root).find(b => nm(b) === 'price_rules');
  if (!root) { errs.push({ line: 1, code: 'RULES_EMPTY', msg: 'no {price_rules ...} block' }); return R; }
  const re = (s, line) => { try { return new RegExp(String(s), 'i'); } catch (e) { errs.push({ line, code: 'RULES_REGEX', msg: e.message }); return /(?!)/; } };
  const lc = s => String(s === null || s === undefined ? '' : s).toLowerCase();
  let groupsSet = false;
  for (const b of blocksOf(root)) {
    const k = nm(b), a1 = b.items[1] ? val(b.items[1]) : null;
    if (k === 'weapon_group') {
      if (!groupsSet) { R.weaponGroups = new Map(); groupsSet = true; }
      const f = blocksOf(b).find(x => nm(x) === 'flat');
      R.weaponGroups.set(lc(a1), { id: lc(a1), label: kid1(b, 'label') || lc(a1), skill: kid1(b, 'skill') || 'rifle', addon: !!kid1(b, 'addon'), sole: !!kid1(b, 'sole'),
        cwAs: kidv(b, 'cw_as'), flat: f ? { tier: kid1(f, 'tier') || 'flat', label: kid1(f, 'label') || '', why: kid1(f, 'why') || '' } : null });
    } else if (k === 'main_priority') R.mainPriority = b.items.slice(1).map(x => lc(val(x)));
    else if (k === 'class_by_name') R.classByName.push({ stuff: lc(kid1(b, 'stuff')), re: re(kid1(b, 'match'), b.line), group: lc(kid1(b, 'group')), forced: !!kid1(b, 'forced'), why: kid1(b, 'why'), tier: kid1(b, 'tier'), tierWhy: kid1(b, 'tier_why') });
    else if (k === 'tier_by_name') R.tierByName.push({ group: lc(kid1(b, 'group')), re: re(kid1(b, 'match'), b.line), tier: kid1(b, 'tier'), why: kid1(b, 'why') || '' });
    else if (k === 'not_weapon') R.notWeapon.push({ stuff: lc(kid1(b, 'stuff')), re: re(kid1(b, 'match'), b.line) });
    else if (k === 'call_in') {
      const g = kidv(b, 'guess_match');
      R.callIn = { group: lc(kid1(b, 'group')), stuff: lc(kid1(b, 'stuff') || 'pistol'), re: re(kid1(b, 'match'), b.line), not: kid1(b, 'not') ? re(kid1(b, 'not'), b.line) : null,
        calibres: (kidv(b, 'calibres') || []).map(String), undeterminedAs: kid1(b, 'undetermined_as'), guess: g && g.length >= 2 ? { re: re(g[0], b.line), text: g[1] } : null, cpFrom: kid1(b, 'cp_from') };
    } else if (k === 'sheet_match') R.sheetMatch.set(lc(a1), b.items.slice(2).map(x => lc(val(x))));
    else if (k === 'sheet_alias') R.sheetAlias.set(lc(a1), b.items.slice(2).map(x => lc(val(x))));
    else if (k === 'item') R.items.set(lc(a1), { group: lc(kid1(b, 'group')), tier: kid1(b, 'tier') === null ? null : String(kid1(b, 'tier')), why: kid1(b, 'why') });
    else if (k === 'dummy') R.dummies.set(lc(a1), kid1(b, 'function') || lc(a1));
    else if (k === 'equip_group') R.equipGroups.push([lc(a1), kid1(b, 'label') || lc(a1)]);
    else if (k === 'equip_name') R.equipName.push({ stuff: lc(kid1(b, 'stuff')), re: re(kid1(b, 'match'), b.line), group: lc(kid1(b, 'group')) });
    else if (k === 'equip_guess') { const g = lc(a1); if (!R.equipGuess.has(g)) R.equipGuess.set(g, []); R.equipGuess.get(g).push([re(kid1(b, 'match'), b.line), String(kid1(b, 'tier')), kid1(b, 'why') || '']); }
    else if (k === 'extra_tier') R.extraTiers.push({ group: lc(a1), tier: String(val(b.items[2])), copy: kid1(b, 'copy'), label: kid1(b, 'label') || '' });
    else if (k === 'when_carried') R.whenCarried.push({ group: lc(a1), tier: String(val(b.items[2])), launcher: lc(val(b.items[3])), ammo: kid1(b, 'ammo'), ap: !!kid1(b, 'ammo_ap'), note: kid1(b, 'note') });
    else if (k === 'throwable_score') {
      const ts = { groups: (kidv(b, 'groups') || []).map(lc), mode: kid1(b, 'mode'), cuts: kidv(b, 'cuts') || [] };
      for (const f of ['energy', 'penetration', 'fire_radius', 'range', 'fuse']) ts[f] = kid1(b, f);
      (R.throwScores = R.throwScores || []).push(ts);
    } else if (k === 'throwable_price') R.throwPrice = { mp: kid1(b, 'mp_per_tier') || 0, cp: kid1(b, 'cp_per_tier') || 0, note: kid1(b, 'note') };
    else if (k === 'fixed_cp_match') R.fixedCpMatch.set(lc(a1), String(val(b.items[2])));
    else if (k === 'addon') R.addons.push({ id: String(a1), label: re(kid1(b, 'label') || String(a1), b.line), match: (kidv(b, 'match') || []).map(String) });
    else if (k === 'single') (R.singles = R.singles || []).push({ id: String(a1), classes: (kidv(b, 'classes') || ['*']).map(String), minLevel: kid1(b, 'min_level'), sheet: kid1(b, 'sheet'), note: kid1(b, 'note') });
    else if (k === 'sheet_nation') R.nations.set(lc(a1), String(val(b.items[2])));
    else if (k !== 'version') errs.push({ line: b.line, code: 'RULES_UNKNOWN', msg: `unknown rules block {${k}}` });
  }
  for (const id of R.mainPriority) if (!R.weaponGroups.has(id)) errs.push({ line: root.line, code: 'RULES_UNKNOWN', msg: `main_priority names "${id}", which no {weapon_group} declares` });
  return R;
}

module.exports = { readRules, generic, GENERIC_GROUPS, GENERIC_THROW };

// keylint explicit KEY-* / SDL-30 rules (do not depend on learned types). called once per block by keylint.js.
//   rule ctx: { kind, path, key, tail, cp (parts of the block), pcp (parts of its parent) , pkey, c (block), fs (per-file state Map),
//               emit(anchor, code, msg), info(anchor, code, msg) }
// Author: Imperator_Aug (ARSENAL, ia-3ef59635)
const M = require('./model'), CK = require('./chkkey');
// seg(p, s) = /(^|\/)s$/.test(p) for a plain s (no regex per block). The tail always ends with the key (M.childPath), so a key
// test first (key ends with the last part of s) leaves the tail string alone for every other block
const seg = (p, s) => p === s || p.length > s.length && p.endsWith(s) && p.charCodeAt(p.length - s.length - 1) === 47;

const ENT = new Set(['def', 'ext', 'inc', 'def1', 'mdl']);
const num = t => t && (t.k === 'INTEGER' || t.k === 'FLOAT');
const txt = t => t.k === 'STRING' ? t.value : t.text;
const kidKeys = cp => cp.kids.map(k => M.partsM(k).key);
const DAMAGE_KNOWN = new Set(['blastwave', 'fire', 'flash', 'cumulative']);
const DAMAGE_REJECTED = new Set(['projective', 'health']);
const WHOLE_WEAPON = new Set(['calibre', 'aimtype', 'burst', 'disablericochet', 'zeroingaccuracy']);
const INT_MP = new Set(['charge', 'level', 'order', 'icon']);           //  (SDL-30)
const BUILTIN_EXTENDERS = 'inventory enumerator shield supply_zone talk cannon bone_rotator light vision_mode timer smokescreen detail window edifice chassis_manager vitality burning mine speaker preview railway stuff slicer structure structure_bone grass map_point spawn_point land land_patch land_patch_height'.split(' ');

// engine-read keys / enum words that vanilla data never uses (so the learned vocab lacks them); [V] engine src
const ENGINE_KEYS = {
  'mission/entity/extender:mine': ['time', 'mined', 'defused', 'miner', 'seeners'],   //  (Miner = armed-for side, gih_player)
};
const ENGINE_ENUMS = {
  action: 'none select disable move rotate cover accelerate cancel drop pour_in pour_out fortification board emit enter repair collect examine care injection attach detach reinforce throw_ap_grenade throw_at_grenade throw_sk_grenade aimed_shot bazooka_shot suppression_fire advance attack attack_ground attack_melee heal medic call_ally mine barricade barbwire hedgehog'.split(' '),   // REGISTER_ACTION names
  orientation: 'normal normalxy normalxz normalyz billboard trace'.split(' '),                                                       //
};

function onBlock(x) {
  const { kind, key, tail, cp, c, emit, info } = x;
  const t0 = cp.toks[0];
  const stuff = kind.startsWith('set/stuff');

  // SDL-30: MP unit int32 fields
  if (kind === 'set/multiplayer.set' && INT_MP.has(key) && /(^|\/)units\/\*s$/.test(x.path)) {
    for (const t of cp.toks) if (t.k === 'FLOAT') emit(t, 'INT_FIELD_FLOAT', `${key} is int32: ${t.expr ? 'arithmetic result is a FLOAT token' : 'float literal ' + t.text} -> fatal "Integer expected!" (cp cost score fore cw are float)`);
  }

  // KEY-02 / KEY-13 / KEY-17: damage effects
  if (key === 'damage' && cp.toks.length && cp.toks.every(t => t.k === 'IDENT' || t.k === 'STRING') && (stuff || ENT.has(kind))) {
    const names = cp.toks.map(t => txt(t).toLowerCase());
    const eff = names.find(n => n !== 'add' && n !== 'clear');
    if (eff && DAMAGE_REJECTED.has(eff)) emit(c, 'DAMAGE_UNSUPPORTED', `damage effect "${eff}" is registered but rejected: ERROR "Unsupported damage effect"`);
    else if (eff && !DAMAGE_KNOWN.has(eff)) emit(c, 'DAMAGE_UNKNOWN', `unknown damage effect "${eff}": ERROR "Unknown damage effect type" (blastwave fire flash cumulative)`);
    if (eff === 'blastwave' && !x.goh) {   // GoH reads more keys here (ground_interaction_radius in 148 vanilla blocks)
      for (const k of cp.kids) {
        const kk = M.partsM(k).key;
        if (kk !== 'energy' && kk !== 'area') emit(k, 'DAMAGE_BLASTWAVE_KEY', `"${kk}" inside damage blastwave: only energy and area are read (ERROR unexpected token)`);
      }
    }
    if (!names.includes('add') && /^from\//.test(tail)) info(c, 'DAMAGE_REPLACES', `damage ${eff || ''} without "add" replaces an inherited effect of that type (use "damage add ...")`);
  }

  // stuff-level `damage <number>`: -> reads an effect identifier
  // -> the game dies at data load (cov-mut: `{damage 0.001}` on g43 [V]). Numbers stay fine deeper: `damage cumulative {damage X}`, special weapon fields.
  if (key === 'damage' && stuff && num(t0) && x.path && !x.path.includes('/'))
    emit(c, 'DAMAGE_NUMBER', `{damage ${t0.text}} on a stuff item: damage takes an effect word (blastwave fire flash cumulative, optionally after "add"), a number is fatal at data load; hit damage is projectileDamage / the damage table`);

  // KEY-14 / KEY-03: volume
  if (key === 'hollow' && x.pkey === 'volume') x.dead(c, 'volume "hollow" is registered but not handled (ignored)');
  if (key === 'able' && x.pkey === 'volume' && cp.toks.some(t => t.k === 'IDENT' && t.text.toLowerCase() === 'clear') && !kidKeys(cp).includes('blast'))
    !x.fs.nb && (x.fs.nb = 1) && info(c, 'VOLUME_NO_BLAST', 'volume `able clear` without {blast}: takes no blastwave damage (first in file)');

  // KEY-04: ricochet angle table rows {in out}: out <= in
  if (key.endsWith('angle') && seg(tail, 'ricochet/angle')) {
    for (const r of cp.kids) {
      const rp = M.partsM(r);
      if (num(rp.keyTok) && num(rp.toks[0]) && rp.toks[0].value > rp.keyTok.value)
        emit(r, 'WARN_RICOCHET_CLAMP', `ricochet angle row {${rp.keyTok.text} ${rp.toks[0].text}}: out > in: engine logs WARNING Invalid ricochet angle and clamps out = in`);
    }
  }

  // KEY-06: ik bone speed
  if (key === 'speed' && x.pkey === 'bone' && num(t0) && Math.abs(t0.value) < 0.0002) emit(t0, 'IK_ZERO_SPEED', `bone speed ${t0.text}: stored speed < 1e-5 (S < 0.0002) -> ERROR "Zero speed in ik-bone"`);

  // KEY-07: extender type names -> owned by refcheck (EXTENDER_UNKNOWN, ENG-06); not emitted here

  // KEY-08: colliders.set <= 32 collider ids
  if (key === 'colliderid' && /(^|\/)colliders\//.test(tail)) {
    const ids = x.fs.ids || (x.fs.ids = new Set());
    for (const t of cp.toks) if (t.k === 'STRING') for (const s of t.value.split(/\s+/)) {
      if (!s || s === 'clear' || s[0] === '-') continue;
      if (!ids.has(s) && ids.size === 32) emit(t, 'COLLIDER_IDS_MAX', `collider id "${s}" is the 33rd distinct id: engine supports 32`);
      ids.add(s);
    }
  }

  // KEY-09 weapon parameters "tags": whole-weapon keys
  if (key === 'parameters' && t0 && t0.k === 'STRING' && stuff) {
    for (const k of cp.kids) { const kk = M.partsM(k).key; if (WHOLE_WEAPON.has(kk)) info(k, 'PARAM_WHOLE_WEAPON', `"${kk}" inside parameters "..." applies to the whole weapon, not per ammo`); }
  }

  // KEY-10 calibre: weapon stuff filling a non-bulletNN ammo without calibre
  if (stuff && key === 'filling' && t0 && t0.k === 'STRING' && !/\bbullet\d+\b/i.test(t0.value) && x.pcp && !kidKeys(x.pcp).includes('calibre'))
    !x.fs.nc && (x.fs.nc = 1) && info(c, 'NO_CALIBRE', `filling "${t0.value}" has no bulletNN tag: set {calibre mm} explicitly (overmatch)`);

  // KEY-11 / KEY-12 / KEY-20: dead keys
  if (key.endsWith('damping') && seg(tail, 'ballistics/damping')) x.dead(c, 'ballistics "damping" is loaded but never read');
  if (kind === 'set/ability.set' && key === 'reload') x.warnDead(c, 'ability weapon reload is written under key "aim_range"; there is no "reload" key [T]');
  if (kind.startsWith('set/target') && (key === 'in_ik_range' || cp.toks.some(t => t.k === 'IDENT' && t.text.toLowerCase() === 'in_ik_range'))) x.dead(c, 'target term in_ik_range is always false');

  // KEY-15: Gears
  if (key === 'gears' && cp.toks.length && cp.toks.every(num)) {
    const v = cp.toks.map(t => t.value);
    if (v.length > 5) emit(c, 'GEARS_BAD', `Gears has ${v.length} values: max 5 (error "Gear ratios must have ascending order")`);
    else if (v.some((a, i) => i && a <= v[i - 1])) emit(c, 'GEARS_BAD', `Gears ${cp.toks.map(t => t.text).join(' ')} not strictly ascending: error "Gear ratios must have ascending order"`);
  }

  // KEY-18: AccuracyByMotion by* <= 1
  if ((key === 'bylinearspeed' || key === 'byangularspeed') && x.pkey === 'accuracybymotion' && num(t0) && t0.value > 1)
    emit(t0, 'ACCURACY_BY_MOTION', `${key} ${t0.text} > 1 (must be <= 1)`);

  // KEY-21: breed perk level names must be declared in set/ability
  if (kind === 'set/breed.set' && x.pkey === 'perks' && cp.keyTok && cp.keyTok.k === 'STRING' && t0 && (t0.k === 'STRING' || t0.k === 'IDENT') && x.env.levels) {
    const lv = x.env.levels.get(cp.keyTok.value.toLowerCase());
    if (lv && lv.size && !lv.has(txt(t0).toLowerCase()))
      x.warn(t0, 'PERK_LEVEL', `perk "${cp.keyTok.value}" level "${txt(t0)}" is not declared in set/ability (invalid level param warning, ignored)`);
  }

  // KEY-22: collider / PatherID names
  if (key === 'collider' && t0 && t0.k === 'STRING' && ENT.has(kind) && x.env.colliders && !x.env.colliders.has(t0.value.toLowerCase()))
    emit(t0, 'COLLIDER_UNKNOWN', `collider profile "${t0.value}" not defined in set/colliders.set: WARNING "collider profile not found" + default profile`);
  if (key === 'patherid' && t0 && t0.k === 'STRING' && x.env.pathers && !x.env.pathers.has(t0.value.toLowerCase()))
    x.warn(t0, 'PATHER_UNKNOWN', `PatherID "${t0.value}" not a {Profile} of set/pather.set (or used by vanilla): ERROR "Unit: Wrong pather name" if unknown`);

  // KEY-25: projectileDamageTable: GetDamage (armor penetration) ignores curve / projectileDamage, but both
  // stay live for infantry: health damage pierce uses curve and projectileDamage (:602), and projectileDamage seeds
  // healthDamage. so only a hint, not a dead key.
  if (stuff && cp.kids.length) {
    const ks = kidKeys(cp);
    if (ks.includes('projectiledamagetable'))
      cp.kids.forEach((k, i) => { if (ks[i] === 'curve' || ks[i] === 'projectiledamage') info(k, 'DEAD_KEY', `"${ks[i]}" does not affect armor penetration while projectileDamageTable is present (still used for health damage vs infantry)`); });
  }
  CK.onBlock(x);   // CHK-KEY rows (SDL-61 SDL-43 PORT-88 PORT-92 AI-01 AI-05)
}

module.exports = { onBlock, BUILTIN_EXTENDERS, ENGINE_KEYS, ENGINE_ENUMS };

// ---- AI-19 / GPL-08: engine-derived key sets (strict: plain UNKNOWN_KEY). each schema = parent-path regex -> keys the engine reader accepts.
// brain/sensor/visor are sdlkeyword readers (case-insensitive; an unregistered key reaches -> ERROR "unexpected token" and the
// block is dropped); DDA readers (Properties, breed, set/multiplayer) match names by strcmp against the Serialize() field list and skip the rest silently.
// vanilla spellings the engine lists differently (camelCase) are folded to lower case, so case is not judged here (KEY_CASE does that).
const kw = s => new Set(s.split(' '));
const ENTK = new Set(['def', 'ext', 'inc', 'def1', 'mdl']);
const SCHEMAS = [
  // [kind test, parent path regex, keys, tag, src cite, row, label]
  [k => ENTK.has(k), /(^|\/)brain$/, kw('extension properties const state control orders order returnfire holdfire holdposition holdzone walker idlemovement seencorpse movetask moveposition zoneposition guard stayincover stayhere lookat lookaround'),
    ' +  + ', 'AI-19', 'brain'],
  [k => ENTK.has(k), /(^|\/)brain\/properties$/, kw('control fire_mode move_mode move_radius move_speed ai_move fix_inventory no_advance no_retreat advance_ratio retreat_ratio look_around'),
    ', , ', 'AI-19', 'brain Properties'],
  [k => ENTK.has(k), /(^|\/)brain\/properties\/ai_move$/, kw('mode enable_on'), '', 'AI-19', 'brain ai_move'],
  [k => ENTK.has(k), /(^|\/)sensor$/, kw('extension visor remembertime recognizetime threatzone attackzone informrange operatablerequired subject external unmaskprofile'),
    '', 'AI-19', 'sensor'],
  [k => ENTK.has(k), /(^|\/)sensor\/visor$/, kw('bone vision'), '', 'AI-19', 'sensor visor'],
  [k => k === 'set/breed.set', /^breed$/, kw('behaviour hero skin portrait icon icon_priority tags nationality voice armors perks veterancy inventory'), '', 'GPL-08', 'breed'],
  [k => k === 'set/breed.set', /^breed\/armors$/, kw('head body'), ' (slot names [I]: vanilla head/body)', 'GPL-08', 'breed armors'],
  [k => k === 'set/breed.set', /^breed\/inventory$/, kw('item in_hands'), '', 'GPL-08', 'breed inventory'],
  [k => k === 'set/multiplayer.set', /^units\/\*s$/, kw('score cp cost charge fore group button info icon order breed cw content remove basic not_for_sale level tags'), '', 'GPL-08', 'multiplayer unit'],
  [k => k === 'set/multiplayer.set', /^army$/, kw('title icon id appid_base flag'), ' (flag: vanilla-only)', 'GPL-08', 'multiplayer army'],
  [k => k === 'set/multiplayer.set', /^game$/, kw('class order minplayers maxplayers texmod ranked teamsettings parameters settings presets mission_options teammatch'), ' (teammatch: vanilla-only)', 'GPL-08', 'multiplayer game card'],
  [k => k === 'set/multiplayer.set', /^game\/presets\/\*s$/, kw('advanced ranked gamemode unitmode specmode common teams bots remove apply'), '', 'GPL-08', 'multiplayer preset'],
  // set/blow: hits ERROR_MSG on any other key, so the file fails to load (COV-MIX crash, TOOLFIX-MIX)
  [k => k === 'set/blow.set', /^blow$/, kw('keys tags distance self opponent'), '', 'FATAL', 'blow'],
  [k => k === 'set/blow.set', /^blow\/self$/, kw('animation enable_items disable_items fatigue'), '', 'FATAL', 'blow self'],
  [k => k === 'set/blow.set', /^blow\/opponent$/, kw('orientation movement damage knock_down_time knock_down_chance'), '', 'FATAL', 'blow opponent'],
];
// -> { keys, src, row, label } for the block at path p of file kind, or null
function schemaFor(kind, p) {
  for (const s of SCHEMAS) if (s[0](kind) && s[1].test(p) && !/turnoff/.test(p)) return { keys: s[2], src: s[3], row: s[4], label: s[5] };
  return null;
}
module.exports.schemaFor = schemaFor; module.exports.SCHEMAS = SCHEMAS;

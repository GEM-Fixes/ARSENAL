// mcp robz group, the small digest the tools answer from when the install or the repo notes are not there (tools/mcp/tools/robz.js).
// Source: refmods/robz/*.md of this repo (tags kept: [V] read or measured, [I] inferred, [T] needs a game test) and the mod's own
// Workshop description ([author]). Numbers that the install can give (cards, presets, tiers, macros) are NOT kept here: the tools
// read them from the RobZ folder at call time. Keep rows short; the long form stays in refmods/robz.
// Author: Imperator_Aug (ARSENAL, ia-b3860576)
'use strict';

const NA = 'RobZ Realism is a mod for Men of War: Assault Squad 2 (MoW:AS2 and AS64). Gates of Hell has no port of it: the folder mods/robz_mod and the Workshop item "ROBBIE Z" there are GoH-native retunes with no AS2 lineage (refmods/robz/goh-candidate.md). Use game mowas2 or as64.';

// what RobZ changes against the game, by area. ref = where the long form is.
const AREAS = [
  { id: 'damage', title: 'Tank damage', ref: 'refmods/robz/systems.md 1-2, systems-test.md', rows: [
    'Damage to vehicles runs in interaction scripts (set/interaction_entity/tank.inc + tank/tank_{armoredcar,light,medium,heavy}.inc), far larger than the game\'s: tank.inc 143 KB against 64 KB [V]',
    'A shell carries a tier tag (shell_small .. shell_maximum, *_apcr, *_no_filler, heat_*, highvel_*, cumulative_*); the class script rolls its effects per tier: 25-29 tiers per class file against 12-13 [V]',
    'New effects: crew bail, internal damage, transmission / turret drive / gun breech break, fuel leak, ammo fire, shell shatter [V]',
    'A damage counter adds points per penetration by tier and knocks the vehicle out at 11 points (tags "destroyed" + crew leaves); no body part has to break [V]',
    'A unit joins by its class props (medium + tank ...), the armor_* macros of properties/*.ext and the tier tag of its shells; a shell with no tier tag does nothing to a tank [I]' ] },
  { id: 'guns', title: 'Guns and ranges', ref: 'refmods/robz/systems.md 3-4', rows: [
    'Ranges are longer: about x1.4 on the guns compared (small sample) [V]; the author gives 50-140 for infantry weapons, 140-250 for cannons and tank guns, 240-790 for artillery [author]',
    'Reload is slower, typical x1.4 (0.67 .. 2.34 over 53 guns) [V]; effective shell speed about doubles [V ratio, I mechanism]',
    'Damage tables are per gun, not one factor (median about x1.1, 0.35 .. 2.4) [V]; the damage macro follows the calibre class: damage_100, damage_170, damage_215 [V counts, I rule]',
    'Many per-nation shells (APC, APCBC, APHE, APCR, HEAT, WP) with their own ammo files and inventory names; a vanilla ammo box does not hold them [V]' ] },
  { id: 'infantry', title: 'Infantry', ref: 'refmods/robz/systems.md 5', rows: [
    'properties/human.ext is retuned for every soldier that includes it: health regeneration x0.25, stamina 50 instead of 100, slower movement rows, carry load 0/10/30/75 kg, recognise time 0.01 s, inform range x3 [V]',
    'Hits are resolved per body part and weapon class; small arms can jam; veterancy and weapon levels run 1-10 instead of 1-5 and show in the price [author]',
    'About 900 multiplayer breeds in set/breed/mp/<side>/ (the game has no such set) [V count]' ] },
  { id: 'economy', title: 'Economy and presets', ref: 'the install (mow_robz_system kind preset)', rows: [
    'Every game mode ships its own presets: start and end income, growth time, command points, unit limits, and which year\'s unit set applies [V]',
    'The author recommends no more than 6000 MP for PvP and the years 1944-1945 for the best balance [author]',
    'Prices, rank (level), cooldown (charge), CP and score sit on the buy cards in set/multiplayer/units/<side>/ [V]' ] },
  { id: 'armies', title: 'Armies and roster', ref: 'refmods/robz/potential.md', rows: [
    'Adds the armies axis_minor, ger_ss and rus_guard (set/multiplayer/armies) beside ger, ger2, rus, usa, eng, jap [V]',
    'About 2,080 buy cards in 1.30.10, 455 of them squads built from macros; cards are split by year in the file name and tagged by year [V]',
    'No doctrine choice in play: doctrine card macros are defined in the unit files but nothing calls them [V]; the year of the preset decides what can be bought' ] },
  { id: 'modes', title: 'Game modes and bots', ref: 'refmods/robz/potential.md, findings.md', rows: [
    'Modes: battle_zones, combat, frontline, plus wave presets. combat has {enableBots} commented out, battle_zones has it on [V]',
    'Bots buy from script/multiplayer/bot.data.lua (3,831 purchase entries in 1.30.10) on the game\'s own bot.lua [V]',
    'A multiplayer mod: no missions of its own, and the game\'s skirmish missions can misbehave under it [author]' ] },
  { id: 'content', title: 'Content and layout', ref: 'refmods/robz/potential.md, upgrade-130.md', rows: [
    'Workshop 1.30.10: about 4.4 GB in 7 paks (entity, texture, map, sound, music, interface, gamelogic) + 1.pat + 65 loose .lng [V]',
    'gamelogic.pak holds set/, properties/ and script/; entity.pak and gamelogic.pak need each other and can not be loaded apart [V]',
    'mod.info MinGameVersion and MaxGameVersion 3.262: a legacy mod (native on MoW:AS2, Classic mode on AS64) [V]',
    'Its localization .lng files replace the game\'s files of the same name whole (VFS-27) [V rule]' ] },
];

// known issues. v = versions it was seen on ('1.30' matches 1.30.x; 'all' = every version read), games = where it bites
const ISSUES = [
  { id: 'RZ-MODE', area: 'as64', v: 'all', games: ['as64'], tag: 'V', text: 'mod.info 3.262 .. 3.262 makes RobZ a legacy mod: AS64 lists it in Classic mode only. Enhanced (as64+) refuses it, and a forced load crashed before the fonts loaded. For Enhanced it needs an upgraded copy (mow_mod_upgrade), which is static-clean but not proven in play.', ref: 'refmods/robz/systems-test.md, upgrade-130.md; limits VFS-48, VFS-54' },
  { id: 'RZ-OTHERMODS', area: 'load', v: 'all', games: ['mowas2', 'as64'], tag: 'author', text: 'A crash when the mod is activated usually means another mod is on: switch every other mod off first. The gore mod is built in; running it beside RobZ causes trouble.', ref: 'the mod\'s Workshop description' },
  { id: 'RZ-DUPCOPY', area: 'load', v: 'all', games: ['mowas2', 'as64'], tag: 'V', text: 'With the Workshop item and a folder of the same mod in <game>/mods, the game loads the Workshop copy and logs the local one as an old copy. A sub-mod Require must name the folder the game really loads.', ref: 'refmods/robz/potential.md "Live results"' },
  { id: 'RZ-BOTNAMES', area: 'bots', v: '1.30', games: ['mowas2', 'as64'], tag: 'V', text: '283 of the 609 unit names in bot.data.lua match no buy card (old names with era suffixes). The engine skips an unknown name, so bots never buy those units. A patch that repaired the names showed no gain in play [I].', ref: 'refmods/robz/findings.md, potential.md; limits MIS-46' },
  { id: 'RZ-BOTSOFF', area: 'bots', v: 'all', games: ['mowas2', 'as64'], tag: 'V', text: 'combat.set has {enableBots} commented out: no bots in Combat unless a sub-mod overrides that file. battle_zones allows bots.', ref: 'refmods/robz/potential.md' },
  { id: 'RZ-CRASHUNITS', area: 'crash', v: '1.30', games: ['mowas2', 'as64'], tag: 'V', text: 'Ten entities crash the game the moment a card or a map names them: p40, pz6e_hun, pz6e_hun_vet, fiat35_inf, fiat35_art, fiat35_bomb, m26e4_ace, type92_stan_mohpa, crate8_inf, crate8_art (undefined macro, missing ammo include, weapon with no stuff). No stock roster names them, so only map makers and sub-mods hit this. The 1.31.x maintainer tree repairs the fiat35 and crate8 includes [I, not run].', ref: 'refmods/robz/potential.md "Live results"' },
  { id: 'RZ-SILENT', area: 'damage', v: '1.30', games: ['as64'], tag: 'T', text: 'On the AS64 copy is1, is2, is122, kv1s and su76 did no damage in several test games while kv85, kv1_40 and fury did; part of it was range or aim, and RobZ\'s own is1 model is implicated. They are reported to fire on the 32-bit game. Cause open.', ref: 'refmods/robz/findings.md RZ-4 .. RZ-10' },
  { id: 'RZ-SELECTOR', area: 'damage', v: 'all', games: ['mowas2', 'as64'], tag: 'V', text: 'RobZ\'s target selector tank_bullet has no tank class: a unit on it never fires at tanks or armoured cars. A unit brought in from the game needs {targetSelector "tank"} (or tank_aa, flak, cannon_aa as RobZ\'s own small guns use).', ref: 'refmods/robz/systems-test.md "Targeting"' },
  { id: 'RZ-KNOCKOUT', area: 'damage', v: 'all', games: ['mowas2', 'as64'], tag: 'V', text: 'A knocked-out tank is tagged "destroyed" and emptied; its body part need not break. A mission script or test that waits for a destroyed body misses kills: test for "not inhabited".', ref: 'refmods/robz/systems-test.md "Knockout"' },
  { id: 'RZ-RELOAD', area: 'damage', v: 'all', games: ['mowas2', 'as64'], tag: 'I', text: 'RobZ gun rows name per-nation shells (bullet76 us ...). A vanilla unit or ammo box put under RobZ may fire its first load and then not reload.', ref: 'refmods/robz/systems-test.md "Reload"' },
  { id: 'RZ-PAKSPLIT', area: 'layout', v: '1.30', games: ['mowas2', 'as64'], tag: 'V', text: 'entity.pak and gamelogic.pak can not be loaded apart: sight and armour defines live in gamelogic.pak, fx entities in entity.pak. A cut-down RobZ crashes at load.', ref: 'refmods/robz/findings.md RZ-5' },
  { id: 'RZ-DATA', area: 'data', v: '1.30', games: ['mowas2', 'as64'], tag: 'V', text: 'Static defects the game passes over in silence: 31 sounds with no .wav, 30 wrong item / weapon / ammo names, ground type "snow" unknown to the engine (13 uses), the "horse" movement type missing, 15 stale collision profiles, 16 ricochet rows that can never deflect, 327 duplicate text keys, blast section of tank_armoredcar.inc commented out.', ref: 'refmods/robz/findings.md "Real problems in the mod"' },
  { id: 'RZ-LIMITS', area: 'data', v: 'all', games: ['mowas2', 'as64'], tag: 'V', text: 'Unit limits written as only-one=1,super_persh=1 (comma): the second entry is lost, so the super_persh limit does not apply (1.30.10 and 1.31.0 as shipped). A maintained 1.31.x tree may already use the right separator: mow_robz_system kind preset shows the line.', ref: 'refmods/robz/findings.md; the presets of the install (mow_robz_system kind preset)' },
  { id: 'RZ-TEXT', area: 'text', v: 'all', games: ['as64'], tag: 'I', text: 'RobZ\'s .lng files replace five of the game\'s text files whole; on AS64 a few newer keys of the game then show as raw keys (#dlg_frontend.lng lacks 3 of 1038).', ref: 'refmods/robz/upgrade-130.md; limits VFS-27, LOC-25' },
  { id: 'RZ-UPGRADE', area: 'as64', v: 'all', games: ['as64'], tag: 'I', text: 'Warnings on an upgraded (Enhanced) copy, none seen in play: mission {"switch"} blocks run every case on old builds (360 places), mesh-frame animations blend (356), a Lua error in bot.data.lua leaves the bot idle instead of stopping the game, 3.262 saves may not load, multiplayer needs the same exe on both ends.', ref: 'refmods/robz/upgrade-130.md "WARNs"' },
  { id: 'RZ-131TREE', area: 'versions', v: '1.31', games: ['mowas2', 'as64'], tag: 'T', text: 'The 1.31.x maintainer tree (loose files, shared macro files, renamed squad cards, remapped breeds) has not been run in the game after its restructuring; every step was checked value-identical by macro expansion only.', ref: 'versions.md of skill mow-robz' },
];

// files of RobZ a sub-mod should not copy whole. first match wins.
const NEVER = [
  [/^localization\/.*\.lng$/, 'a .lng replaces the file of the same name whole (VFS-27): every RobZ key not in your copy shows as a raw key. Ship your own keys in a file with a new name'],
  [/^resource\/set\/interaction_entity\//, 'RobZ\'s damage scripts; a copy freezes the whole damage system at the version you copied'],
  [/^resource\/properties\//, 'shared armour, crew and vehicle macros that every unit def reads'],
  [/^resource\/set\/multiplayer\/units\//, 'buy cards and their macros; a copy drops every card RobZ adds or reprices later'],
  [/^resource\/set\/multiplayer\/games\//, 'mode settings and presets (income, command points, unit limits)'],
  [/^resource\/set\/breed\/[^/]+\.inc$|^resource\/set\/breed\/mp\/[^/]+\.inc$/, 'breed, kit and veterancy macros shared by all sides'],
  [/^resource\/set\/stuff\/.*(\.presets|\.pattern)$/, 'gun and shell presets every weapon file reads'],
  [/^resource\/script\/multiplayer\/bot[^/]*\.lua$/, 'the bot purchase data names RobZ cards of one version; names that no longer exist are skipped in silence (MIS-46)'],
  [/^resource\/set\/[^/]+\.(set|inc|accuracy)$/, 'a one-file registry (pather, colliders, material, fx, entity manager): the last copy wins whole'],
];
const neverWhy = key => { for (const [re, why] of NEVER) if (re.test(key)) return why; return null; };

module.exports = { NA, AREAS, ISSUES, NEVER, neverWhy };

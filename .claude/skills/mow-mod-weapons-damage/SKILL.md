---
name: mow-mod-weapons-damage
description: Change guns, ammo, penetration, armour and balance in a mod for Men of War Assault Squad 2 (mowas2), AS64 (as64) or Gates of Hell (goh). Load when the user says "change a gun", "new weapon", "new machine gun", "shell", "ammo", "APCR", "HEAT", "damage", "penetration", "penetration table", "armour thickness", "armour volume", "can this gun kill that tank", "ricochet", "bounce", "blast", "HE", "frag", "grenade", "molotov", "fire", "cook-off", "range", "accuracy", "spread", "rate of fire", "reload", "rifle damage", "gun does not fire", "balance check", "is this price fair", "price calculator".
---

# mow-mod-weapons-damage: router. Read ONE sub-file for the sub-task, not all

Always:
- game word: MCP `game` = `as64|mowas2|goh` · CLI `--exe as64|mowas_2|goh` · gen `--target as64|mowas2|goh`. G = AS2 install (as64 + mowas2 share it), H = GoH install, `<mod>` = the user's mod folder
- installs + vanilla data read-only; write only inside `<mod>`. MCP write tools preview unless `write: true`; gen `--plan` writes nothing
- text CRLF, strings UTF-8, identifiers ASCII; stuff files have no extension, name = tags split on `.`
- weapon, shell and unit names and numbers differ per mod: read them with the tools, never from memory
- simulator and sheet numbers are a prediction [I]; done = a shot seen in game + game.log read (→ skill `mow-mod-test`)
- a row id (DMG-01, KEY-17, GHDMG-27): MCP `mow_limit` (`ids`) · CLI

| sub-task | read | tools |
|---|---|---|
| find a weapon, shell or item; read its numbers; sheets | find-read-weapons.md | `mow_weapon_find`, `mow_unit_stats`, statsheet |
| change one value of an existing gun | change-a-gun.md | `mow_weapon_change`, patch-entity |
| a new gun, MG or rifle from an old one; put it on a unit | new-gun.md | `mow_mod_gen` (gun, weapon, stuffmodel), clone-entity |
| shell kinds (AP, APCR, HE, HEAT), a new shell, per-ammo `parameters` | ammo-shells.md | `mow_mod_gen` (shell), statsheet |
| penetration by range: the table, clamps, calibre, overmatch | penetration-tables.md | `mow_weapon_change`, statsheet, armorsim |
| armour: macro sides, volumes, thickness, threshold, durability | armour-volumes.md | `mow_unit_armor`, `mow_unit_change`, armorsim edit |
| can gun X go through unit Y at range R; what beats a unit | matchup-sim.md | `mow_matchup`, `mow_unit_counter`, armorsim |
| HE: blast layers, radius, frag layer, what blast breaks | blast-he.md | `mow_mod_gen` (shell), keylint, statsheet |
| ricochet: when, chance by angle, materials | ricochet.md | armorsim shot, `mow_lookup` |
| range, aim range, spread, accuracy on the move | range-accuracy.md | `mow_weapon_change`, `mow_mod_gen` (gun) |
| rate of fire, reload, bursts, magazine | rate-of-fire-reload.md | `mow_weapon_change`, `mow_mod_gen` (gun) |
| small arms against soldiers: health damage, curve, cover | infantry-damage.md | `mow_weapon_find`, `mow_weapon_change` |
| grenades, AT grenades, mines, molotov: throw, fuse, blast | grenades-items.md | `mow_mod_gen` (item), `mow_kit_slot` |
| fire, burning, ammo cook-off, vehicle explosion | fire-cookoff.md | `mow_lookup`, `mow_mod_gen` (set) |
| what a hit triggers: `bullet_hit`, `pierce`, `break_armor`, shell class | hit-events.md | `mow_lookup`, check |
| a gun that does not fire or never aims | will-it-fire.md | firecheck, `mow_entity_info` |
| balance pass: odd prices, classes, bulk change | balance-check.md | `mow_balance_check`, `mow_army`, balance |
| infantry price model: is this price fair | price-model.md | `mow_price`, pricecalc |
| prove a change with shots in game | in-game-shot-proof.md | shottable, `mow_game_log` |

Elsewhere:
- unit price, cooldown, kit, vehicle weapon slots, clone a unit → skill `mow-mod-units`
- muzzle flash, shot sound, shell model, tracer art → see skill `mow-mod-models-effects`
- writing the `{on pierce}` / `{on blast}` scripts themselves → see skill `mow-mod-scripts`
- which ammo the AI picks, why soldiers do not shoot → skill `mow-mod-ai-bots`
- lint the whole mod, fix plan → skill `mow-mod-check-fix`; RobZ Realism values → see skill `mow-robz`
- a player asking "why did my shot bounce" → skill `mow-play-coach`

Depth (only when a sub-file is not enough):
- keys/{weapon-keys,weapon-damage,ammo,armor,volume,spreading,weaponry} pricing/* gameplay/* �
- guide via MCP `mow_guide` (`chapter`): 09-weapons-ammo-damage, 17-balance-pricing-gameplay, p04-change-a-gun, p05-change-armour, r06-weapons-and-ammunition, r07-armour-volumes-damage
- GoH: · MCP `mow_lookup` (`query`, `web: "goh"`)

Tell the user: before → after numbers (per range where it matters) and the file that holds them; a match-up as predicted [I] until a shot was seen in game, with the shots tried; balance findings left open.

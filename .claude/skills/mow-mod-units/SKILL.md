---
name: mow-mod-units
description: Find and change units in a mod for Men of War Assault Squad 2 (mowas2), AS64 (as64) or Gates of Hell (goh). Load when the user says "find a unit", "unit stats", "rename a tank", "change the price", "cost", "cooldown", "rank", "head start", "armour of a unit", "add a unit", "clone a unit", "new soldier", "breed", "squad", "crew", "seats", "buy menu", "roster", "card", "what soldiers carry", "equipment", "inventory", "weapon slot", "skin", "uniform", "texture variant", "camo", "speed of a tank", "turn rate", "chassis", "fuel", "perk", "ability", "veterancy", "new army", "faction", "raise all prices".
---

# mow-mod-units: router (read ONE sub-file for the sub-task, not all)

Always:
- game word: MCP `game` = `as64|mowas2|goh` · CLI `--exe as64|mowas_2|goh` · gen `--target as64|mowas2|goh`. not as64 → skill `mow-games` first
- game installs + vanilla data read-only; write only inside `<mod>` the user named (GoH: a folder outside the install, writeguard refuses the rest)
- unit names, prices and lists change with every mod: read them with the tools, never quote from memory
- preview before write: every MCP write tool answers a plan unless `write: true`; gen `--plan` writes nothing
- text CRLF; strings UTF-8, identifiers ASCII (unit ids, tags: `a-z 0-9 _ - ( ) .`); keep vanilla cp1251 comment bytes
- done = bought or spawned in game + game.log read (→ skill `mow-mod-test`). gen verdict "static clean" or "partial" is never "works"

| sub-task | read | tools |
|---|---|---|
| find a unit, read its numbers, files, what a mod changed | find-read.md | `mow_unit_find` `mow_unit_stats` `mow_entity_info` `mow_army` |
| price, cooldown, rank, head start, CP, score | price-cooldown-rank.md | `mow_unit_change` `mow_mod_gen` (card) |
| rename a unit, tooltip text | rename.md | `mow_unit_change` (name) `mow_text_set` |
| new unit from an existing one | clone-a-unit.md | `mow_mod_gen` (clone, roster, iblock) |
| soldier type: breed file, portrait, nationality, armour items | infantry-breed.md | `mow_mod_gen` (breed) `mow_entity_info` |
| perks, weapon skill, veterancy ranks | abilities-veterancy.md | `mow_mod_gen` (breed, set) |
| what a soldier carries, weapon in hands | inventory-kit.md | `mow_kit_slot` `mow_mod_gen` (kit) |
| squads: members, count, order, price | squads.md | `mow_unit_change` (squad) `mow_mod_gen` (squad) |
| buy menu: add, hide, move, group, limit a card | buy-menu-cards.md | `mow_mod_gen` (card, roster, preset) `mow_army` |
| vehicle speed, turning, gears, fuel, pathing profile | vehicle-chassis-movement.md | `mow_mod_gen` (set, macro) `mow_entity_info` |
| crew, seats, passengers, who drives and loads | crew-seats.md | `mow_unit_stats` `mow_mod_gen` (card, set) |
| vehicle ammo box and weapon slots | vehicle-weapon-slots.md | `mow_kit_slot` (slots) `mow_mod_gen` (weapon) |
| skin (uniform), texture variant (camo) | skins-textures.md | `mow_look_set` `mow_mod_gen` (skin) |
| armour of one unit (the short way) | armour.md | `mow_unit_armor` `mow_unit_change` (armour) |
| whole army or class at once | bulk-army-edit.md | `mow_balance_check` `mow_army` |
| a new army (faction) in the lobby | new-army.md | `mow_mod_gen` (army, roster) |

Not here: gun, shell, penetration rules → `mow-mod-weapons-damage` · names and icons in depth → `mow-mod-text-ui` · bots buying the unit → `mow-mod-ai-bots` · models, textures, effects, sound → see skill `mow-mod-models-effects` · interaction scripts → see skill `mow-mod-scripts` · GoH unit into AS2 → `mow-mod-port` · lint and fix → `mow-mod-check-fix`.

Shared for every sub-file:
- gen spec route (no MCP): `node tools/gen/gen.js spec.yaml|json --target as64|mowas2|goh [--plan] [--out dir] [--game G] [--goh H]` · samples `--sample list`, then `--sample <name>` · fields `--schema` · validate `--check-spec spec [--target t] [--json]`
- one key in one file: `node tools/patch-entity/patch-entity.js <mod> --game G [--mods d] (--entity n|--file key) --set p=v|--add p=v|--del p [--exe as64|mowas_2|mowas2|goh] [--dry-run]`
- GUI: Units tab; `gui_pages` finds the page, `gui_call` on `POST /api/x/units/search|stats|change|add|buy|kit|kit/set|kit/slot|look|look/skins|look/set` (write routes need `write: true` in the body). start: `node tools/gui/gui.js [--port N] [--allow-launch] [--open] [--no-open]`
- after any change: `node tools/check/check.js <mod, anywhere> [--exe as64,mowas2,goh]`; what changed against the game: `mow_mod_diff` (`mod`)
- a limits row: `mow_limit` (`ids`) �. GoH rows:
- every mod copy of a def or roster replaces the whole vanilla file (VFS-01, VFS-42): other mods' edits to it vanish; gen says GEN_FILE_FULL_COPY

Tell the user: the unit(s) touched, old value → new value, the files written in `<mod>`; what was and was not seen in game; side effects (full-file copies made and who is shadowed, bot lists that need the new card name).

Depth: keys/armor humans/* movement/* mission/mp-units pricing/economy · guide (MCP `mow_guide` `chapter`): 07-units-vehicles-movement, 08-infantry-and-humans, 17-balance-pricing-gameplay, p02-change-unit-numbers, p03-add-a-unit, r02 to r05 · engine facts for kit and look: headers of tools/gui/ext/units/kit.js and look.js.

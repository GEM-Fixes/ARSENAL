---
name: mow-mod-infantry
description: Change how soldiers behave in a mod for Men of War Assault Squad 2 (mowas2), AS64 (as64) or Gates of Hell (goh): the soldier side, not the buy menu. Load when the user says "soldier", "infantry", "human", "human.ext", "health of a soldier", "stamina", "soldiers tire too fast", "run speed", "crawl", "swim", "morale", "suppression", "pinned", "cover", "soldiers will not take cover", "bleeding", "medic", "heal", "bandage", "knocked out", "soldier is immortal", "inventory size", "backpack", "holder", "helmet", "body armour", "reload", "share ammo", "stance", "prone", "soldier animation", "perk does nothing", "veterancy does nothing", "skeleton soldier", "squad member missing", "hero".
---

# mow-mod-infantry (router): read ONE sub-file for the sub-task

game word: MCP `game` = `as64|mowas2|goh` · CLI `--exe as64|mowas_2|goh` · gen `--target as64|mowas2|goh`. not as64 → skill `mow-games` first.

## Always
- game installs + vanilla data read-only; write only inside the `<mod>` the user named
- one base file defines every soldier (`properties/human.ext`): a mod copy replaces it whole and shadows other mods' edits (VFS-01); say so before copying it
- numbers and names come from the tools for the game and mod at hand, never from memory
- every write tool answers a plan unless `write: true`; gen `--plan` writes nothing
- text CRLF, strings UTF-8, identifiers ASCII
- done = a soldier of the changed kind watched in game + game.log read (→ skill `mow-mod-test`)

## Sub-tasks
| sub-task | read | tools |
|---|---|---|
| what a soldier is made of, which file holds what | soldier-anatomy.md | `mow_entity_info` `mow_unit_stats` `mow_file_which` |
| health, stamina, carried weight, tiring | health-stamina.md | `mow_entity_info` `mow_mod_gen` (set) humlint |
| death, knock-out, bleeding, wounds, medic and bandage | death-wounds-healing.md | `mow_script_find` `mow_lookup` |
| morale, "suppression", cover behaviour | morale-cover.md | `mow_lookup` `mow_limit` |
| perks and veterancy as the engine applies them | abilities-veterancy.md | `mow_unit_stats` `mow_mod_gen` (breed) keylint |
| what a breed does at spawn: skin, kit, armour items | breed-at-spawn.md | `mow_unit_stats` `mow_kit_slot` `mow_look_set` |
| inventory box, holders, item sizes and weight | inventory-holders.md | `mow_kit_slot` `mow_entity_info` |
| reload, ammo match, sharing in a squad | ammo-reload.md | `mow_weapon_find` `mow_entity_info` |
| stances and soldier animations | stances-animation.md | `mow_anim_list` `mow_model_info` humlint |
| walking, running, crawling, swimming speeds | foot-movement.md | `mow_mod_gen` (set) `mow_entity_info` |
| squads from the soldier side: members, leader, shared state | squads-soldier-side.md | `mow_unit_stats` `mow_unit_change` (squad) |
| lint all infantry data of a mod | check-infantry.md | `mow_mod_check` humlint keylint |

## Across (one line each)
- price, card, squad make-up and the buy menu → skill `mow-mod-units` (`infantry-breed.md`, `inventory-kit.md`, `squads.md`, `abilities-veterancy.md`)
- rifle damage, accuracy, grenades → skill `mow-mod-weapons-damage` (`infantry-damage.md`) · seats in vehicles → skill `mow-mod-vehicles` (`crew-places.md`)
- soldier AI targeting → skill `mow-mod-ai-bots` · soldier scripts (`human.inc`) → skill `mow-mod-scripts` · uniforms as models → skill `mow-mod-models-effects`

## Depth
- (entity, vitality, morale, cover-heal, death, abilities, veterancy, weapon-skill, breeds, inventory, ammo, fsm, fsm-run, anim, anim-choice, crew), movement/foot · limits HUM-*, GPL-12, GPL-13
- guide via MCP `mow_guide` (`chapter`): 08-infantry-and-humans, r05-humans
- GoH: (not yet tried in game)
- GUI: Units & Balance tab > `units` page (soldier cards: Equipment, Look); Mods tab > Check & Fix

## Tell the user
which soldiers are touched (one breed, or every soldier through `human.ext`), old value → new value, files written, what was seen in game.

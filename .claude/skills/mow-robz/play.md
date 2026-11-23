# play: how RobZ plays and what to tell a player

Order: `mow_robz_changes` (area) for the short answer with tags -> `mow_robz_unit` / `mow_robz_system` for numbers of the
installed version -> `mow_robz_notes topic` for the long form. General rules of the game (armour, angle, ammo kinds, CP,
cooldown): skill `mow-play-coach`; say what RobZ changes on top.

## What is different from the plain game
| area | in short | ask |
|---|---|---|
| tank damage | a hit adds points by shell tier to a counter; the tank is knocked out when the counter is full, not by one lucky roll. Tier points and classes differ per version | `mow_robz_changes area damage`, `mow_robz_system kind tier` |
| ranges | longer than the plain game: small arms, AT guns and tank guns in three bands [author]; exact reach per gun from the data | `mow_weapon_find` with the RobZ folder, `mow_robz_changes area guns` |
| infantry | squads built from macros, veterancy levels on men and crews [author], jamming and hits by body part [author] | `mow_robz_changes area infantry` |
| economy | income grows over the match; presets set start, end, growth time, CP and unit limits | `mow_robz_system kind preset` |
| armies | extra armies beside the game's own; what can be bought follows the year of the preset | `mow_robz_system kind army`, `mow_robz_unit side <s> year <yy>` |
| doctrines | none in play: doctrine card macros exist but nothing calls them [V] | `mow_robz_system kind doctrine` |
| modes | battle zones, combat, frontline; bots only where the mode file enables them | `mow_robz_system kind preset`, trouble.md |

## Questions and the call that answers them
- "what does X cost / how long is the cooldown / how many CP" -> `mow_robz_unit q <name>`; a card can differ per year set, the tool lists each price
- "what can <army> buy in 1943" -> `mow_robz_unit side <s> year 43 sort cost`
- "cheapest answer to a heavy tank" -> `mow_robz_unit side <s> max_cost <n>`, then `mow_balance_check` / `mow_unit_stats` for gun against armour. Give the facts; the pick stays with the player
- "which preset for a long game with bots" -> `mow_robz_system kind preset`: read `bots`, start, finish, growTime, CP
- "why did my hit do nothing" -> `mow_robz_system kind tier` (points of that shell tier) + `mow_robz_issues area damage`
- "does veterancy matter" -> `mow_robz_changes area infantry`; levels and effects are [author] unless the notes say [V]

## What the author says about playing it [author]
- made for multiplayer and skirmish against bots; the campaign missions of the game are not adapted
- switch every other mod off unless it is made for RobZ; late-war presets are the most complete
- lower income presets play closer to what the mod was tuned for

## Limits of what can be said
- damage rules were read from the scripts [V]; only part was run in game: refmods/robz/systems-test.md says which
- on AS64 some units gave no damage in test games [T]: `mow_robz_issues area damage` before telling a player a gun "should" work
- 1.31.x tree: not played by anyone here [T]; prices and card names may differ from the Workshop version (versions.md)
- Gates of Hell: no RobZ. `mow_robz_*` answer not available; refmods/robz/goh-candidate.md names a look-alike [I]

## CLI
- (notes, limits, one go)
- `node tools/pricecalc/pricecalc.js --help`, `node tools/balance/balance.js --help` (entity-side numbers; cards come from `mow_robz_unit`)

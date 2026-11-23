# mow-mod-weapons-damage: small arms against soldiers (health damage, curve, cover)

when: "rifles kill too slowly", "SMG too strong at range", "one-shot kills", "body armour", "soldiers survive a tank MG", "ported small arms feel weak".
game word: MCP `game` = `as64|mowas2|goh` · CLI `--exe as64|mowas_2|mowas2|goh`. `<mod>` = the user's mod folder.

## Steps
1. read the weapon: MCP `mow_weapon_find` (`q` = exact name, `group` = rifle, smg, mgun, pistol ..., `mod`)
   CLI `node tools/statsheet/statsheet.js [gameDir] [--exe as64|mowas_2|goh] [--folder <mod>] --sheet weapons --fmt md --filter <name>`
2. read the rule rows: MCP `mow_lookup` (`query: "healthDamage"`, `mode: "words"`) · CLI
3. change one weapon: MCP `mow_weapon_change` (`mod`, `weapon`, `what` = `healthDamage`, `projectileDamage` or another value name, `value`, `write`)
4. change a whole class: the value usually sits in the group's pattern or `.presets` (`set/stuff/rifle/.presets` ...): gen op `set` / `macro` through MCP `mow_mod_gen` (`mod`, `ops`, `write`)
   CLI `node tools/patch-entity/patch-entity.js <mod> --game G --file <key> --set p=v [--exe as64|mowas_2|mowas2|goh] [--dry-run]`
5. soldier health side (breed, perks, veterancy) → skill `mow-mod-units`
6. GUI: Units & Balance tab > Balance sheet (column `dmg`), Units page > equipment of a soldier; routes via `gui_routes`

## The rule (shared engine) [V]
- damage per hit = `max(healthDamage x remaining energy - body armour of the hit volume, 0) x hit factor`
- hit factor = `curve(distance / aimRange)` (curve from `set/ballistics.set`), or the aimed-shot factor of the weapon's `special`
- `projectileDamage` with a `curve` gives the armour-side value for small arms and fills `healthDamage` when that is 0; `healthDamageClip` / `projectileDamageClip` cap them
- a `projectileDamageTable` replaces curve + projectileDamage for ARMOUR only; soldiers are still hit through curve + healthDamage (KEY-25)
- aim range therefore moves the fall-off: a longer `range` flattens damage over distance
- cover and prone: difficulty parameters scale damage and hit chance for bullets (a hit can be cancelled); skipped under 5 m
- health damage never kills by itself: it lowers health and fires effect events (`hit`, `light`, `heavy`, `killed`, thrown ...); what happens then is the soldier's interaction script → see skill `mow-mod-scripts`
- soldier max health = breed `Health.max` x difficulty x perk `health` x (1 + veterancy health)
- mods may move small-arms damage out of `healthDamage` into per-volume scripts (head, body); bleeding, jamming are script data [I]: check the mod's `set/interaction_entity/human.inc` before tuning numbers
- blast against soldiers is a separate path (AI-controlled about 200 x E, player-controlled far less: DMG-22)

## Per game
| game | note |
|---|---|
| as64 | as above; single-player difficulty scales health and accuracy, multiplayer test mode is the clean stand |
| mowas2 | same rule; `--exe mowas_2` |
| goh | same key names; GoH small-arms `healthDamage` and speed are on another scale than the AS2 patterns: stuff copied over unscaled kills several times slower in AS2 (lim PORT-199 [I]) → skill `mow-mod-port` |

## Silent fails
- DMG-29 a `curve` name not in `set/ballistics.set` is fatal at load
- KEY-11 `ballistics.set` `damping` is never read
- DMG-01 a `parameters` block for an ammo tag the weapon is never filled with does nothing
- GPL-12 bleeding may apply to player-controlled soldiers only in one script set [I]
- GPL-13 an undefined ability level string gives the TOP level: a soldier suddenly much tougher or deadlier
- HUM-rows on vitality: a bad key in `extender "vitality"` is an "unexpected token" error, not silent
- VFS-01 a mod copy of a pattern or `.presets` file replaces it whole for every weapon of the class

## Verify
- `mow_weapon_find` with `mod` shows the new value
- in game (multiplayer test mode): a squad firing at a standing squad at near, middle and far range; count time to first kill and hits with console `dbg_health 1` [V]; read the log (→ skill `mow-mod-test`)

# mow-mod-weapons-damage: ricochet (when, chance by angle, materials)

when: "shells bounce too often", "no ricochet for this gun", "why did it bounce", "ricochet kills behind the tank", editing `material.set`.
game word: MCP `game` = `as64|mowas2|goh` · CLI `--exe as64|mowas_2|goh`. `<mod>` = the user's mod folder.

## Steps
1. see whether a shot bounces: CLI `node tools/armorsim/armorsim.js shot <unit> --weapon W --ammo "<tags>" --range M --from az,el [--folder <mod>] [--exe as64|mowas_2]` (prints the ricochet chance of a failed hit)
   MCP `mow_matchup` (`gun`, `ammo`, `target`, `range`, `mod`) gives pass or fail per side
2. read the rule rows: MCP `mow_limit` (`ids: "DMG-09 KEY-04"`) · `mow_lookup` (`query: "damage ricochet"`, `mode: "topic"`) · CLI
3. change the gun side: MCP `mow_weapon_change` (`mod`, `weapon`, `what` = `RicochetEnergyDamping`, `RicochetDamageClip` or `DisableRicochet`, `value`, `write`) [T: table values through this tool not tried; use patch-entity when refused]
   CLI `node tools/patch-entity/patch-entity.js <mod> --game G --file <weapon key> --set p=v [--exe as64|mowas_2|mowas2|goh] [--dry-run]`
4. change the material side (`set/material.set`, chance by angle): gen op `set` through MCP `mow_mod_gen` (`mod`, `ops`, `write`); the mod gets a full copy of the file
5. stop a shell kind from bouncing: give the ammo the tag `no_ricochet` (gen op `shell` field `tags`)
6. GUI: Models tab > Armour > shot shows the bounce for as64 / mowas2; routes via `gui_routes`
7. lint: `node tools/keylint/keylint.js <mod> [--game dir]` (WARN_RICOCHET_CLAMP)

## The rule (shared engine) [V]
- there is NO roll before the penetration test. a ricochet is looked at only after a failed penetration (DMG-09)
- angle used = grazing angle = 90 - (angle from the plate normal)
- no ricochet (the shell ends or detonates) when: the gun has `DisableRicochet`; the bullet already bounced 2 times; the material has no chance entry; the angle is above the last point of the material's chance table; the roll fails; the ammo has tag `fg` or `no_ricochet`
- when the area breaks on a hit that does not pass, the shell ends at once: no ricochet
- energy kept = gun `RicochetEnergyDamping` by angle when that table exists, else a speed factor times the material's `velocityDumping`; `ricochetDamageClip` caps the damage of the bounced shell
- the bounced shell is a NEW bullet: it can hit the same or another vehicle and is tested again
- ground hits use the same code with the terrain normal and ground material; HE detonates instead
- material entry in `set/material.set`: `ricochet {chance {angle% ..}} {angle {in out}..} {velocityDumping} {gravityScale}`
- script `{bullet_detonate}` in a `pierce` handler does not end the shell at once: the flag is read at the next `bullet_hit` or right after an area break (DMG-08)

## Per game
| game | note |
|---|---|
| as64 | as above |
| mowas2 | same rule |
| goh | `RicochetEnergyDamping` exists there too; table reading differs (GHKEY-59 block; armorsim does not serve GoH. |

## Silent fails
- KEY-04 a material deflection entry with `out > in` is clamped; the log says `Invalid ricochet angle`, harmless
- DMG-09 raising a chance does nothing for shells that pass, or for `fg` shells
- KEY-09 `DisableRicochet` written inside a `parameters` block applies to the whole weapon, not to that ammo
- VFS-01 a mod copy of `material.set` replaces the whole file: every material must stay in it

## Verify
- armorsim `shot` at a grazing angle before and after
- in game: shots at a steep angle with console `v_bulletPath 1` to see the bounce path [V]; read the log (→ skill `mow-mod-test`)

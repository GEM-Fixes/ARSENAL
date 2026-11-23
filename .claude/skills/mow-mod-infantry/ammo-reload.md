# mow-mod-infantry: reload, ammo match, sharing in a squad

when: "soldier does not reload", "my new rifle takes no ammo", "ammo of weapon A fits weapon B", "squad shares ammo", "reload faster", "he reloads from another gun".
G = game install, `<mod>` = the user's mod folder (full path). MCP `game` = `as64|mowas2|goh`.
Rate of fire and reload time of the gun itself → skill `mow-mod-weapons-damage` (`rate-of-fire-reload.md`).

## Steps
1. the weapon and its filling tags: MCP `mow_weapon_find {q:"<weapon>"}` then Read the file (key `filling`); the ammo item the same way (its tags)
2. what the soldier carries: MCP `mow_unit_stats {id:"<card>", breed:"<army/name>", show:["equipment"], mod:"<mod>"}`
3. will it fire at all: `node tools/firecheck/firecheck.js <def> [--exe as64|mowas_2|goh] [--game G] [--json]`
4. lint: `node tools/humlint/humlint.js <mod folder> [--game dir] [--exe as64|mowas_2|mowas2|goh]` (HUM_WEAPON_NO_TAG, HUM_WEAPON_RELOAD_PERK) · `node tools/refcheck/refcheck.js <gameDir> --mods <mod> --scope mod`
5. GUI: Units & Balance tab > `units` page, Equipment card

## Facts
- a weapon item holds its loaded rounds as a filling (`{stuff, count}`); spent = no filling, or no rounds in the magazine
- matching is by TAG SUBSET: a weapon with `filling "ammo rifle"` accepts any item whose tags contain `ammo rifle`; different filling tags never share ammo
- the search for a refill: own inventory first, then squad mates (humans of the same squad)
  1. another weapon in a box that holds more than one magazine of matching filling (it can feed)
  2. any item whose tags contain the weapon's filling tags
- reload time = the weapon's recharge time x (1 - bonus); the bonus is the veterancy `weapon_reload` effect, or in a vehicle the crew efficiency
- the reload animation per stance is named by the weapon's `states {reload ..}` block (`stand_reload`, `squat_reload`, `lie_reload` ..)
- a weapon's mode (how it is held and fired) comes from its type tag plus the tag `weapon`

## Per game
- as64 / mowas2: as above
- goh: magazine rounds are the item's bullets; flamethrower fuel is the item's filling; ammo switching exists per weapon (GHKEY-71): AS2 ammo counts need porting to item bullets. Not yet tried in game

## Silently fails
- a new ammo item whose tags do not contain the weapon's filling tags: never used, no message
- a tag set that is too wide (`ammo`) lets every weapon take it
- HUM-11 the `weapon_reload` perk does nothing; HUM-16 posture key `reload` does nothing
- HUM-27 no `weapon` tag = an item, not a weapon
- HUM-20 breed `filled N` changes the item's maximum for the whole game
- HUM-32 a pistol runs with the pistol animation only when tagged `shoot_walking`
- a reload animation name the skeleton lacks: the reload happens with no motion

## Verify
- in game fire the weapon empty, watch the reload and the ammo count; empty the soldier's own ammo and see him take from a squad mate; log read (→ skill `mow-mod-test`)

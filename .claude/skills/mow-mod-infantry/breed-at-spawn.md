# mow-mod-infantry: what a breed does at spawn (skin, kit, armour items)

when: "soldier spawns as a skeleton", "he spawns without his helmet / weapon", "item missing from the kit", "wrong weapon in hands", "all soldiers got more ammo after my edit".
G = game install, `<mod>` = the user's mod folder (full path). MCP `game` = `as64|mowas2|goh`.
Making a new breed or editing the kit list → skill `mow-mod-units` (`infantry-breed.md`, `inventory-kit.md`). This file is what the engine does with it.

## Steps
1. what the breed resolves to: MCP `mow_unit_stats {id:"<card or squad>", breed:"<army/name>", show:["equipment","look"], mod:"<mod>"}`
2. kit change with a preview: MCP `mow_kit_slot {mod:"<mod>", breed:"<army/name>", add:[{item:"<item>", count:1, filled:true}], del:["<item>"], in_hands:"<item>"}` (plan; `write: true` writes)
3. skin or texture variant: MCP `mow_look_set {mod:"<mod>", breed:"<army/name>", skin:"<skin name>"}` (plan)
4. is the item real: MCP `mow_weapon_find {q:"<part of name>"}`; the breed file that wins: `mow_file_which {path:"set/breed/<..>", mods:[..]}`
5. lint: `node tools/humlint/humlint.js <mod folder> [--game dir] [--exe as64|mowas_2|mowas2|goh]` (WARN_HUM_BREED_UNKNOWN, HUM_FILLED_N_GLOBAL, HUM_HOLDER_TWO_ITEMS, HUM_WEAPON_NO_TAG, WARN_HUM_USER_AMOUNT)
   CLI kit sample: `node tools/gen/gen.js --sample kit`
6. GUI: Units & Balance tab > `units` page, soldier card: Equipment, Look

## Order of events
1. the card or script names a breed; the breed file is found by name under `set/breed`
2. `skin` picks `/entity/humanskin/<name>`; default `skeleton`
3. `armors {body "<tags>"}{head "<tags>"}`: an item with those tags goes into the armour holders
4. `inventory {..}` items are put into the box one by one, in file order, first place that fits
5. `in_hands` puts one item into the hands; its index counts `item` blocks only
6. `perks` and `veterancy` are attached; nationality gives the name list and default voice

## Per game
- as64 / mowas2: box 6 x 10 cells; breed named `army/name`
- goh: box 8 x 12 [V data]; breed named `army/period/name`; the tools take `card` for the period copy; magazine rounds = the item's bullets (GHKEY-71)

## Silently fails
- HUM-18 unknown breed: warning `Unknown breed "x"`, skin `skeleton`
- HUM-21 an item that does not fit the box is dropped without a message; an `in_hands` index out of range is ignored
- HUM-22 an armour item the holder rejects: `Can't put armor %s to %s`, he spawns without it
- HUM-20 breed `filled N` rewrites the item's `filling.max` for the WHOLE game: every soldier using that item changes
- HUM-25 two items on one weapon place: the second is ignored (`HolderWeapon: set user ... ignored`)
- HUM-27 a weapon needs its type tag AND the tag `weapon`, else it is treated as a plain item (never fired)
- HUM-24 protection belongs to the holder in the entity, not to the vest item
- MIS-67 bot men with `fix_inventory 1` in `human.ext` spawned unarmed [I]
- MIS-75 a squad member breed without `set/breed/mp/<army>/<breed>.set`: the member does not spawn [I]

## Verify
- in game buy the unit, open the inventory: every item there, weapon in hands, helmet and vest on the model; log has no `Unknown breed` / `Can't put armor` (→ skill `mow-mod-test`)

# mow-mod-weapons-damage: a new gun, machine gun or rifle from an existing one

when: "add a new weapon", "a second version of this gun for one tank only", "new MG with a bigger belt". Use this instead of changing a shared weapon when only some units should differ.
game word: MCP `game` = `as64|mowas2|goh` · gen `--target as64|mowas2|goh` · CLI `--exe as64|mowas_2|mowas2|goh`. `<mod>` = the user's mod folder.

## Steps
1. pick the base: MCP `mow_weapon_find` (`q`, `group`); one exact match shows its file and values
2. make it: MCP `mow_mod_gen` (`mod`, `ops`, `write`) with a `gun` op. fields: `name`, `like` (the base), then any of `recharge speed damage pen pen_scale range accuracy caliber display class rof burst spread aim reload health magazine fire_sound reload_sound params`
   a working spec on real names: `node tools/gen/gen.js --sample gun-class` (a new MG from a vanilla one: faster fire, longer bursts, bigger belt)
   CLI `node tools/gen/gen.js spec.yaml|json --target as64|mowas2|goh [--plan] [--out dir] [--game G] [--goh H]`; check a spec: `--check-spec spec [--target t] [--json]`; fields: `--schema`
3. or copy one stuff file by tags: `node tools/clone-entity/clone-entity.js --game dir [--mods a,b] [--exe as64|mowas_2|mowas2|goh] --out <mod folder> --stuff "<base tags>" --tags <new.dot.tags> [--name "Display"] [--set key=value ...] [--dry-run] [-q]`
4. put it on a unit: gen op `weapon` (`entity`, `weapon`, `place`) in the same `ops` list; a soldier's hands or a vehicle weapon slot: MCP `mow_kit_slot` (`mod`, `id` / `breed` / `entity`, `in_hands`, `slots`, `write`) (→ skill `mow-mod-units`)
5. inventory model of a hand weapon: gen op `stuffmodel` (`id`, `like`, `item`, `camera`); sample `node tools/gen/gen.js --sample stuffmodel`
6. name: gen op `text` (`key`, `text`) or MCP `mow_text_set` (`mod`, `key`, `text`, `write`) (→ skill `mow-mod-text-ui`)
7. a shot sound folder of its own: gen ops `sound`, `soundclass` (samples of the same names); art and effects → see skill `mow-mod-models-effects`
8. GUI: Units & Balance tab > Units page (add or change the weapon of a unit); routes via `gui_routes`
9. lint: `node tools/check/check.js <mod> [--exe as64,mowas2,goh]` (refcheck: unknown weapon / ammo names are crash class); will it fire: `node tools/firecheck/firecheck.js <def> [--exe as64|mowas_2|goh] [--game G] [--dist N] [--json]`

## Facts (shared) [V]
- a weapon is a stuff file `set/stuff/<group>/<name>`; `{from "<base>"}` copies the base, the file then overrides keys
- the ammo it takes is set by the unit's `filling "<ammo tags>" n` and matched by tags; calibre is read from the filling tag `bulletNN` (`bullet75` → 75). ammo with another tag form (`cu`, `ptr`) needs an explicit `calibre` or overmatch is wrong (KEY-10)
- the first weapon place of a unit is the basic one; `gunner` / `charger` name the seats that fire and reload: an empty seat = the weapon can not be used

## Per game
| game | note |
|---|---|
| as64 | default |
| mowas2 | same; `--target mowas2` writes the 3.262 range |
| goh | same stuff form; gen with `--target goh` into a folder outside H; aiming there also reads the place key `AimBone` (GHKEY-05); not run in game [T] |

## Silent fails
- KEY-19 a `{from}` clone loses `throw_off_always` of weapon `special` (clone-entity writes it again)
- KEY-17 / DMG-13 `damage X` without `add` in the clone replaces the inherited effect of that kind
- LOG-07 a unit that names a weapon or ammo that does not exist gets `dummy_checker`: loads, crashes on use
- DMG-01 the new gun's `parameters` blocks must match the tags of the ammo it is filled with, exactly
- VFS-01 the unit def changed to carry the gun becomes a full copy in the mod

## Verify
- `mow_weapon_find` (`q` = new name, `mod`) finds it; `mow_unit_stats` (`id`, `mod`) shows it as the unit's gun
- in game: buy the unit, fire, hear the sound, see the tracer; read game.log (→ skill `mow-mod-test`)

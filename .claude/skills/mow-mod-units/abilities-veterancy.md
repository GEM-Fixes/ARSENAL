# mow-mod-units: perks, weapon skill, veterancy

when: "make this soldier a better shot", "more health", "perk", "ability", "veterancy", "ranks", "stars", "elite crew".
game: MCP `game` = `as64|mowas2|goh` · gen `--target as64|mowas2|goh`. `<mod>` = the user's mod folder (full path), G = game install.

## Steps
1. read: MCP `mow_unit_stats` (`id`, `breed: "army/name"`, `mod`); the breed file itself via `mow_file_which` (`path: "set/breed/<..>"`, `mods`) then Read
2. change perks of a breed: MCP `mow_mod_gen` (`mod`, `ops: [{op:"breed", name:"<new>", army:"<tag>", like:"<base>", set:{..}, veterancy:..}]`, `write`) for a new breed; an existing one: op `set` rows, or
   CLI `node tools/patch-entity/patch-entity.js <mod> --game G --file <breed file key> --set p=v --dry-run`
   fields: `node tools/gen/gen.js --schema` (breed-op: `set`, `veterancy`, `decl`, `del`)
3. new level names or rank effects live in `set/ability/*.set` (a mod copy replaces the whole file, VFS-01)
4. lint: `node tools/humlint/humlint.js <mod folder> [--game dir] [--exe as64|mowas_2|mowas2|goh] [-q] [--summary]` and `node tools/keylint/keylint.js <mod folder> [--game dir] [--exe ..]` (WARN_PERK_LEVEL); statsheet reports PERK_LEVEL_UNDEFINED
   GUI: Units tab (soldier card); Mods tab > Check & Fix for the lint

## Rules (shared)
- breed `perks {{"kind" value}..}`; kinds are defined in `set/ability/*.set` as `{"name" [from "kind"] ...}`
- `health health_regeneration stamina stamina_regeneration`: value is a LEVEL NAME string declared in that kind's file (`{level "150%" 1.5}`), not a number
- `speed tank vehicle cannon`: a raw float (`speed` scales the foot table; the others are crew skill factors)
- weapon skills (`rifle smg mgun pistol ..`, any kind `from weapon`), `avoidance`, `melee`: `lvl_N` → accuracy and aim per posture
- `vision`: a name from `set/vision`; `stealth`; `telescope` / `field_glass` / `aimedshot` need the item in hand
- ranks: breed `{veterancy {"lvl_1" T1}{"lvl_2" T2}..}`: name picks the effect row in `set/ability/veterancy.set`, number = score threshold. score rises with kills and heals
- only the highest reached rank applies, effects do not add up; effect values are fractions applied as `x(1+value)`; `weapon_skill` adds to every weapon-skill level index
- in a vehicle the seated soldier's skill uses the `vehicle` posture; reload in vehicles uses crew efficiency [V humans/crew, veterancy]

## Per game
| | as64 | mowas2 | goh |
|---|---|---|---|
| rank clamp | 0..5 | 0..5 | 0..8; ranks 6-8 are cut to 5 if ported (GHHUM-07) |
| weapon ability params | accuracy, aim_range | same | adds `recoil` `zoom_recoil` `sway`: inert on AS2 (HUM-39) |
| Medic, Fortification, Personage, Mechanic | ids only, syntax [T] (HUM-12) | same [T] | real kinds (GHHUM-26) |
| vehicle kill score | by role name | same | shared among crew-group seats (GHHUM-13) |

## Silent fails
- GPL-13 / HUM-13 an undefined level string (`"275%"`) logs `invalid level param` and gives the soldier the TOP level: a silent buff
- HUM-14 / HUM-37 unknown ability base or a kind with no `{level}` blocks: load error `Unknown ability` / `No levels in ability`
- HUM-11 the `weapon_reload` PERK is read by no code [V]; only the veterancy `weapon_reload` works
- HUM-16 / KEY-12 posture key `reload` is inert; the engine stores reload under `aim_range` [T]
- HUM-15 with two weapon skills the first active ability in perk order wins: order matters
- HUM-17 stacked ranks give no extra bonus (humlint HUM_VETERANCY_TIED)
- HUM-02 perks can not reduce stamina drain, only regeneration
- GPL-11 a veterancy macro not defined in the file being read = fatal `define not found` (gen GEN_BREED_VET_UNDEFINED)

## Verify
- `node tools/statsheet/statsheet.js G --folder <mod> --scope mod` shows no PERK_LEVEL_UNDEFINED
- in game: spawn the soldier, compare health bar and shooting with the base; ranks need kills in a match, test mode is fine for perks [T] (→ skill `mow-mod-test`)

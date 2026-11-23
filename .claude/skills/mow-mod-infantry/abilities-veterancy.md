# mow-mod-infantry: perks and veterancy as the engine applies them

when: "my perk does nothing", "veterancy has no effect", "invalid level param", "Unknown ability", "which perk wins", "does rank stack".
G = game install, `<mod>` = the user's mod folder (full path). MCP `game` = `as64|mowas2|goh` · gen `--target as64|mowas2|goh`.
Writing the perk lines of a breed step by step → skill `mow-mod-units` (`abilities-veterancy.md`). This file is why a written perk does or does not act.

## Steps
1. what the soldier has: MCP `mow_unit_stats {id:"<card>", breed:"<army/name>", mod:"<mod>"}`
2. what a kind and level mean: MCP `mow_file_which {path:"set/ability/<kind>.set", mods:[..]}` then Read it (the level names are in it); the rules: `mow_lookup {query:"humans/abilities", mode:"topic"}`
3. set on a new breed: MCP `mow_mod_gen {mod:"<mod>", ops:[{op:"breed", name:"<new>", army:"<tag>", like:"<base>", set:{..}}]}` (plan first; fields `node tools/gen/gen.js --schema`)
4. lint: `node tools/keylint/keylint.js <mod folder> [--game dir] [--exe as64|mowas_2|mowas2|goh]` (WARN_PERK_LEVEL) and `node tools/humlint/humlint.js <mod folder> [--game dir] [--exe ..]` (HUM_ABILITY_BASE, HUM_ABILITY_NO_LEVELS, HUM_VETERANCY_TIED, HUM_WEAPON_RELOAD_PERK, HUM_POSTURE_RELOAD)

## How it applies
- breed `perks {{"kind" value}..}`; kinds are declared in `set/ability/*.set`, optionally `from "base kind"`
- level kinds (`health`, `stamina`, regenerations, weapon skills, `avoidance`, `melee`): the value is a LEVEL NAME that must exist in that kind's file
- float kinds (`speed`, `tank`, `vehicle`, `cannon`): a raw number
- weapon skill: the engine takes the FIRST active ability in perk order that fits the weapon in hand; per posture it gives accuracy and aim values
- veterancy: breed `{veterancy {"lvl_1" T1}..}`; score rises with kills and heals; only the HIGHEST reached rank applies, ranks do not add up; effects are fractions applied as x(1 + value)
- seated in a vehicle the `vehicle` posture and the crew skill kinds apply

## Per game
- as64 / mowas2: ranks 0..5; weapon ability params are accuracy and aim range only
- goh: ranks 0..8 (GHHUM-07); the rank is recomputed from the veterancy perks at every spawn (GHHUM-19); adds `recoil`, `zoom_recoil`, `sway` (inert on AS2, HUM-39); vehicle kill score is shared by crew group (GHHUM-13)

## Silently fails
- GPL-13 / HUM-13 an undefined level name: only a warning `invalid level param`, and the soldier counts as the TOP level: a silent buff (keylint WARN_PERK_LEVEL)
- HUM-14 / HUM-37 an unknown ability base, or a kind with no `{level}` blocks: load error `Unknown ability` / `No levels in ability`
- HUM-11 the `weapon_reload` PERK is read by no code; only the veterancy `weapon_reload` works
- HUM-16 posture key `reload` is inert
- HUM-15 with two weapon skills the perk ORDER decides
- HUM-17 two ranks at the same threshold give no extra bonus
- HUM-02 no perk reduces stamina drain
- HUM-12 Medic, Fortification, Personage, Mechanic on AS2: syntax untested [T]

## Verify
- lint clean; in game compare the changed soldier against the base one at the same range (hits out of 20 shots), or read the vehicle panel for crew skill; for veterancy let him score kills and watch the rank mark (→ skill `mow-mod-test`)

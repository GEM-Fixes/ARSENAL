# mow-mod-vehicles: lint all vehicle data of a mod

when: "check my vehicles", after editing chassis, seats, weapons or armour, after a port, before a test run, "vehicle crashes the game when bought".
G = game install, `<mod>` = the user's mod folder (full path). MCP `game` = `as64|mowas2|goh`. All read-only.

## Steps
1. everything: MCP `mow_mod_check {mod:"<mod>"}` (`only:["movlint","keylint"]` narrows to tool names; defcheck runs on its own, step 4)
   CLI `node tools/check/check.js <mod, anywhere> [--exe as64,mowas2,goh]`
2. movement: `node tools/movlint/movlint.js <mod folder> [--game dir] [--mods a,b] [--exe as64|mowas_2|mowas2|goh] [-q] [--summary]`
3. keys: `node tools/keylint/keylint.js <mod folder> [--game dir] [--exe as64|mowas_2|mowas2|goh]`
4. def against model (bones, volumes): `node tools/defcheck/defcheck.js <mod dir> [--game G] [--exe as64|mowas_2] [--summary]` · MCP `mow_model_check {mod:"<mod>"}`
5. references and order rules: `node tools/refcheck/refcheck.js <gameDir> --mods <mod> --scope mod [--exe ..] [--summary]`
6. will each gun fire: `node tools/firecheck/firecheck.js <def> [--game G] [--exe as64|mowas_2|mowas2|goh] [--json]`
7. numbers out of line for the class: MCP `mow_balance_check {mod:"<mod>", q:"tank"}`
8. known fixes with a preview: MCP `mow_mod_fix {mod:"<mod>"}`
9. GUI: Mods tab > Check & Fix

## Codes → limits row
| code | tool | row | means |
|---|---|---|---|
| MOV_LOCO_KEY | movlint | MOV-01 | unknown Locomotion key: `unexpected token` |
| MOV_PIVOT_MISSING | movlint | MOV-20, MOV-34 | wheel or water chassis without `pivot_front` / `pivot_back` |
| MOV_WHEEL_RADIUS_ZERO, MOV_BONE_RADIUS_ZERO | movlint | MOV-20 | load error |
| GEARS_BAD | keylint | MOV-02, KEY-15 | more than 5 gears or not ascending |
| WARN_PATHER_UNKNOWN | keylint | MOV-13, KEY-22 | unit fails to load |
| COLLIDER_IDS_MAX | keylint | MOV-26, KEY-08 | over 32 collider groups |
| SPEED_BEFORE_LOCO | refcheck | MOV-04 | `{Speed}` reset by a later Locomotion |
| STRAFE_MAX | refcheck | MOV-24 | fatal at load |
- defcheck findings name the def bone or volume the model lacks (FMT-07; rows PORT-138, PORT-146, PORT-147, PORT-153, PORT-166, PORT-171, PORT-186)
- one row explained: MCP `mow_limit {ids:["MOV-04"]}` �

## Order of repair
1. load errors (Locomotion key, pather name, wheel radius, gears, missing include)
2. dead parts (bone or volume the model lacks, empty seat group, no foresight)
3. odd values (speed order, turn time left out, armour side overriding plates)
4. findings vanilla also has (Slow above Normal, no TurnTime on wheeled units): report, do not "fix" unasked

## Per game
- as64 / mowas2: all tools; rules source-verified
- goh: movlint reads the GoH key set (Slow / Normal / Fast and CostFactor inside Locomotion are fine there, GHMOV-44, GHMOV-45); defcheck is not run for goh (PORT-171); firecheck `--exe goh` knows `AimBone`

## Silently fails
- lint can not see behaviour: route choice, crushing, boarding and tipping only show in game
- a shared `.ext` copied into the mod passes lint and still shadows other mods (→ skill `mow-mod-together`)
- a finding in a vanilla file the mod did not copy is not the mod's defect

## Verify
- all tools clean or each finding explained; then each changed vehicle bought, crewed, driven by order and by hand, fired and hit, log read (→ skill `mow-mod-test`)

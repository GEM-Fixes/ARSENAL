# mow-mod-models-effects: collision and armour volumes as shapes

when: "shells pass through the tank", "the turret can not be hit", "add a hit volume", ".vol", "soldiers walk through the model", "volume is in the wrong place".
G = game install, `<mod>` = the user's mod folder (full path). MCP `game` = `as64|mowas2|goh`.
Shape and place only. Thickness, sides, durability numbers → skill `mow-mod-weapons-damage` (`armour-volumes.md`).

## Steps
1. list a model's volumes: MCP `mow_model_info {model:"<name>", mod:"<mod>", show:["volumes"]}` → name, bone, shape, tags
2. see them: GUI Models & Sim tab > `models` page, Collision volumes (and Armour tab: `armor/map`, not GoH)
   armour picture by side, CLI: `node tools/armorsim/armorsim.js map <unit> [--view front|rear|left|right|top] [--game G --mods a,b] [--exe as64|mowas_2]`
3. check: MCP `mow_model_check {mod:"<mod>", checks:["def","export"]}` (def volume names against the .mdl; duplicate names; volume matrix)
4. fit or round a volume to its mesh: `node tools/soedit/soedit.js ops vol fit|round <model.mdl> [--volume id] [--step n]` (prints; `--apply` writes, into a staged copy only)
5. edit by hand: the `{Volume "name" ..}` block in the staged `.mdl` (text, CRLF)

## Facts [V unless tagged]
- `.mdl` `{Volume "name" {Bone "b"} <shape>}`: shapes Box, Cylinder, Sphere, or Polyhedron from a `.vol` file; the def's `{Volume "name" {able ..}{tags ..}{thickness ..}}` adds game meaning to the same name
- a volume moves with its bone: a turret volume must hang on the turret bone
- `able` flags decide what touches it (bullets, blast, contact, select); a volume without `able blast` takes no blast (GPL-01)
- helper volume names the engine and macros look for
- `.vol`: chunks VERT, INDX, SIDE; `INDX` must follow `VERT`; one side id 1..6 per triangle picks the armour side

## Per game
- as64 / mowas2: same volume format and rules
- goh: armorsim CLI refuses goh (exit 2); GUI Models > Armor on the GoH tab reads and edits per-part armour and top speed and shoots one plate at an angle [T]; volume states can be restored by script there (`restore_volume_states`, GHINT-26)

## Silently fails
- FMT-07 a def `{Volume}` whose name the .mdl lacks, or whose bone is absent: dropped, its armour is gone
- FMT-19 two volumes with one name: only one is found [I]
- FMT-06 a `.vol` triangle with side id 0 or above 6: wrong armour side on that triangle [T]
- FMT-20 a polyhedron must be convex and its matrix unmirrored; vanilla ships some that are not, so this is a warning [I]
- FMT-25 the `.vol` magic is never checked; FMT-26 an index past the vertex count is read anyway: keep indices valid
- FMT-27 a `.vol` cut short: `Attempt to read beyond the stream!` or garbage

## Verify
- shoot it: in game, or first on paper with MCP `mow_matchup {attacker:"<unit>", target:"<unit>", range:100}`; the unit can be selected, blocks infantry, takes hits on every side; log clean (→ skill `mow-mod-test`)

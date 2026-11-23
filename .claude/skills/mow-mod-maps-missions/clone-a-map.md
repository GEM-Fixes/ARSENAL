# mow-mod-maps-missions: copy a map under a new name

when: "copy a map", "my own version of 1v1_road", before changing anything on a stock map (never edit the stock map).
G = AS2 install, H = GoH install, `<mod>` = mod folder.

## Steps
1. pick the source: MCP `mow_map_info {q:"road"}` (names + modes)
2. preview: MCP `mow_map_clone {map:"1v1_road", name:"my_road", mod:"<mod>"}`; write: add `write:true` (`no_mission:true` copies the ground without the `.mi` files)
   CLI `node tools/map-clone/map-clone.js [--game G] --map map/multi/<m> --name <new> --out <mod> [--target as64|mowas2|goh | --exe as64|mowas_2|goh] [--no-modinfo] [--no-mission] [--plan]` (`--plan` first)
   in a gen spec: op `map-clone` (`node tools/gen/gen.js --sample list`)
   GUI: Maps tab > `maps` page; the Quick Guided Task row has a map-copy task (guide p17)
3. what it does: copies the folder (loose or packed), rewrites `map/multi/<old>` paths in text files, adds the lobby name text and, when absent, a mod.info. binary files are byte copies
4. lint: `node tools/milint/milint.js <mod> [--game G] [--exe as64|mowas_2|goh] [-q]`, then MCP `mow_mod_check {mod:"<mod>"}`
5. host it (→ skill `mow-mod-test`): as64 `node tools/testrun/testrun.js --map multi/<new>:<mode> --mods <modname> --dry` first

## Per game
- as64: mod.info Enhanced range (MinGameVersion 3.301); mowas2: `--target mowas2` writes range 3.262
- goh: `--target goh` writes the GoH exe range and the name into a `.pot`; map-clone refuses a `map.net` of the other game (GHMAP-06, lim PORT-70). A GoH map into as64 is a port → skill `mow-mod-port`

## Silently fails
- LOC-24 no text for `mission/<dir>/name`: the lobby shows the raw key
- MAP-01 leftover `test.mi` / `0.mi` in the copied folder: a `.mi` whose title has no games `.set` warns and is not offered
- MIS-24 a `--no-mission` copy with no `.mi` added later: the map is skipped, not listed
- MIS-62 a captureflag `.mi` on a map without clips `captureflaga` / `captureflagb` crashes at start
- VFS-29 `/map` must match across players: everyone in the match needs the mod

## Verify
- the new name is in the lobby list, the match starts, units reach the start points; the log has no "skipped" line for the map
- tell the user which files were byte copies and which were rewritten

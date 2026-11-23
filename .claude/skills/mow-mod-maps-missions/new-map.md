# mow-mod-maps-missions: new map from a height image, tiny test map

when: "make a new map", "map from a heightmap", "I need a small flat map to test units". For a changed copy of a stock map read `clone-a-map.md` instead (far less work).
G = AS2 install, `<mod>` = mod folder. No MCP tool builds a map from nothing: CLI only.

## Steps
1. new map from a height image (AS2 games only):
   `node tools/mapgen/mapgen.js --height <pgm|raw> [--layers dir] --name n --out mod [--size WxH] [--target|--exe as64|mowas2]`
   writes `map/multi/<n>/` with `map.net`, `map.info`, terrain layers and a mod.info; then add a mission (`add-a-game-mode.md`: misgen for captureflag)
2. tiny flat test map (two start points a set distance apart):
   `node tools/testmap/testmap.js --out <modDir> [--name pv_tiny] [--size 250] [--gap 70] [--exe as64|mowas_2|goh]`
3. look at the result without the game: `node tools/mapview/mapview.js <map folder> --layer height --legend` · MCP `mow_map_info {map:"<n>", mod:"<mod>", view:true}`
4. lint: `node tools/milint/milint.js <mod> [--game G] [-q]` (net origin, players, `.materials` vs mtl), then MCP `mow_mod_check {mod:"<mod>"}`
5. host it (→ skill `mow-mod-test`); a generated map takes bots on captureflag, not on `:combat` (MIS-71 [V])
- GUI: Maps tab > `mapviz` (Map Viewer) to look; the editor program (`as64_ed.exe` / `mowas_2_ed.exe`) is where terrain is painted by hand:

## Facts · limits MAP, FMT-15
- `map.net` stores width/height as i16 and heights as signed i16: a larger map can not be written (FMT-15)
- every player needs a map point `team(x) order(n)`; `mp_host map N` is capped by `map.info` `maxPlayers` (TST-34)

## Per game
- as64: mod.info Enhanced range; mowas2: mapgen writes `Min 3.262.0 Max 3.262.1`
- goh: mapgen refused (cell 5 against 10, GHMAP-06), misgen refused (GHMAP-03), testmap as its usage line says; make GoH maps in the GoH editor

## Silently fails
- MAP-29 a terrain material with one `{layer}` loads, then crashes at the first crater: exactly 2 layers
- TST-34 a missing map point for a slot: fatal `MapPoint not found` when the match starts
- MIS-24 no `.mi` in the folder: the map is skipped, not listed
- MAP-15 `xform` takes only `zl zw y scale`

## Verify
- the map hosts with the planned player count, units spawn at both ends, one shell crater on each terrain type does not crash, game.log read

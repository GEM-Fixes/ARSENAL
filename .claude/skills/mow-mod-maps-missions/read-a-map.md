# mow-mod-maps-missions: read a map

when: "which maps are there", "what modes has this map", "how many players", "show me the map", before any clone or edit.
G = AS2 install, `<mod>` = mod folder. Nothing here writes.

## Steps
1. list maps with their modes: MCP `mow_map_info {game:"as64"}` (narrow: `q:"farm"`, `mode:"battle_zones"`; a mod on top: `mod:"<mod>"` or `mods:["name"]`)
2. one map: MCP `mow_map_info {map:"2v2_farmstead"}` → players, each mode's flags, start points, bots, warnings; `view:true, width:80` adds a text picture of the ground
3. its missions: MCP `mow_mission_info {map:"2v2_farmstead"}` (per mode: objects, soldiers, flags, triggers, zones, waypoints); `mode:"combat"` adds the most placed objects
4. which modes exist and their rules: MCP `mow_mode_info {}` / `{mode:"captureflag"}`
- CLI list: `node tools/mission-clone/mission-clone.js --game G --map map/multi/<m> --from <mode> --to <mode> --out <mod> --list`
- CLI picture: `node tools/mapview/mapview.js <map.net|folder> | --game G [--exe as64|mowas_2|mowas2|goh] [--mods a,b] --map multi/<group>/<map> [--width N] [--layer type|material|height] [--entities] [--legend] [--svg f]`
- GUI: Maps tab, pages `maps` (list), `mapviz` (Map Viewer, Map pictures, Map previews), `missions` (1. Pick a map, 2. Missions on this map)

## Facts (shared)
- `map/multi/<map>/`: one `<mode>.mi` per game mode, `map.info`, `map.net`, textures. MP map id = `multi/<map>:<mode>`
- a mode needs a card `set/multiplayer/games/<title>.set`; lobby name key = `mission/<dir under /map/>/name` (lim LOC-24)
- `{Entity "<def>" 0x<uid> {Position x y} {xform ..}}`; uid unique over the map and all its `.mi`
- positions are map units, not metres (20 units = 1 m; lim MAP-16)

## Per game
- as64 / mowas2: same forms; mowas2 reads the install without `as64/core`
- goh: height map cell 5 (AS2 10), `map.net` header `05 02` vs `0a 02` (GHMAP-06); terrain layers `.materials` (AS2 `.mtl`); lobby name in a `.pot`; zones carry `zoneId` (GHMAP-03); other mode names (`mow_mode_info {game:"goh"}`)

## Silently fails
- MIS-24 a map with no mode file is skipped: log "skipped - game type undefined"
- MAP-02 `maxPlayers` is rounded up to even and clamped 2..mp_maxPlayers: the number read is not always the number hosted
- TST-36 a tool given an empty mod list reads vanilla: name the mod or its folder

## Verify
- the numbers match the lobby: host the map, count the slots and modes offered (→ skill `mow-mod-test`)

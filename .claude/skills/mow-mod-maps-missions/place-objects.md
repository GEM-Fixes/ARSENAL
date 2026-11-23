# mow-mod-maps-missions: place an object, set players and the map's texture variant

when: "put a house / wreck / gun on the map", "add cover here", "change max players", "winter version of the map".
G = AS2 install, `<mod>` = mod folder. The mod gets its own copy of the map file; the stock map is never written.

## Steps
1. find the entity name: MCP `mow_entity_info {names:["house_brick_1"]}` (source file, model) or the GUI `models` page search
2. find the spot: MCP `mow_map_info {map:"1v1_road", view:true}` (text picture) · GUI `mapviz` Map Viewer shows positions on hover
3. place: MCP `mow_map_place {mod:"<mod>", map:"1v1_road", entity:"house_brick_1", pos:"1200,-340", dir:90, scale:1}` (preview; `write:true` writes)
   CLI `node tools/place-entity/place-entity.js <mod dir> --game dir [--mods a,b] --map <name> --entity <def> --pos x,y[,z] [--dir deg] [--scale f] [--tex t] [--exe as64|mowas_2|mowas2|goh] [--dry-run] [-q]`
   gen op `place`
4. players and the map's texture variant: gen op `mapinfo` (`node tools/gen/gen.js --sample mapinfo`) through MCP `mow_mod_gen {mod, ops:[{op:"mapinfo", ...}]}`
5. see the change: `node tools/misdiff/misdiff.js --game G --mod-dir <mod> --map <name>`; lint: `node tools/milint/milint.js <mod> [--game G] [-q]`
6. look at it in game (→ skill `mow-mod-test`)

## Facts
- `pos` is map units: 20 units = 1 m (MAP-16). z left out = on the ground
- `{Entity "<def>" 0x<uid> {Position x y} {xform ..}}`: the uid must be unique over the map and all its `.mi`; the tool picks a free one
- an object placed in the map file is in every mode; one placed in `<mode>.mi` only in that mode

## Per game
- as64 / mowas2: same; `--exe mowas_2` reads without `as64/core`
- goh: place-entity takes `--exe goh` and writes only outside the install; entity names are GoH names (`mow_entity_info {game:"goh"}`: the first index build is slow)
  GoH scale 20 units = 1 m too [I] (vehicle model sizes + GoH exe constants; in game [T]); the write makes a restore point first (Mod Files page) and reads the map back: entity at the place, rest of the bytes kept

## Silently fails
- MAP-15 `xform` takes only `zl zw y scale`: other keys are not read
- MAP-02 `maxPlayers` rounded up to even, clamped 2..mp_maxPlayers
- TST-34 more players than map points: fatal `MapPoint not found` at match start
- LOG-07 an entity name the game lacks loads as a placeholder and fails on use: check the name first
- MOV obstacle rules: a placed object changes paths; an obstacle name missing from `obstacles.reg` can crash on crush

## Verify
- the object stands where planned, units path around it (order a move through), it can be shot or crushed without a crash; log read

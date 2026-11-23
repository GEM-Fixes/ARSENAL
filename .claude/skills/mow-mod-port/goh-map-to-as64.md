# mow-mod-port: a GoH map into as64

when: "port a Gates of Hell map", "play this GoH map in Assault Squad 2", fatal `Different grid cell sizes!`.
G = AS2 install, H = GoH install, `<out>` = result folder. CLI only (no MCP tool for map ports yet).

## Steps
1. check what the map needs: `node tools/mapport/mapport.js --check <resource root>`
2. dry run: `node tools/mapport/mapport.js <resource root> --out <dir> --dry [--only text] [--keep-cell] [--json file] [-q]`
3. convert: the same line without `--dry`. It resamples the height map from cell 5 to cell 10, rewrites grass, drops keys that stop the load
4. what the map's objects need (entities GoH has and AS2 lacks): `node tools/mapscen/mapscen.js <map>[,<map>..] [--exe as64|mowas_2|mowas2] [--goh dir] [--defs] [--json]`
   each missing entity is either replaced by an AS2 one or ported (→ `goh-unit-to-as2.md`), or removed from the map
5. give it AS2 missions: the GoH `.mi` modes do not exist in AS2 → skill `mow-mod-maps-missions` (`add-a-game-mode.md`: misgen for captureflag, mission-clone)
6. lint: `node tools/milint/milint.js <out> --game G [-q]` · `node tools/binhdr/binhdr.js G --folder <out> --ext net,ply [-q]` · MCP `mow_mod_check {mod:"<out>"}`
7. look: `node tools/mapview/mapview.js <out map folder> --layer height --legend`; then host it (→ skill `mow-mod-test`)

## Facts (PORT-70, MAP, GHMAP)
- GoH height map cell = 5, AS2 engine assumes 10; `map.net` header `05 02` against `0a 02` (GHMAP-06)
- GoH terrain layers file is `.materials`, AS2 `.mtl`; GoH zones carry `zoneId` (GHMAP-03)
- map folders are among the things `mow_mod_upgrade` leaves out as blocked: maps go through mapport

## Per game
- as64: the proven target [T per map]; mowas2: same engine rules, not run [I]
- AS2 map into GoH: no tool here; `map.net` of the other game is refused by map-clone (PORT-70)

## Silently fails / crashes
- PORT-70 unresampled map: fatal `Different grid cell sizes!`
- MAP-29 a terrain material with one `{layer}` loads, then crashes at the first crater: exactly 2 layers
- FMT-12 an obsolete `BPLY` big mesh: `BigMesh structure is obsolete. Resave map.`
- MIS-24 no AS2 mode file: the map is skipped, not listed
- MIS-62 captureflag without clips `captureflaga` / `captureflagb`: crash at start
- LOG-07 an object whose entity AS2 lacks loads as a placeholder: mapscen first
- TST-34 player slots need map points `team(x) order(n)`: GoH point names differ

## Verify
- the map is listed, hosts, units spawn and path across it, a shell crater on each ground type does not crash; log read. Ground looks and grass are by eye

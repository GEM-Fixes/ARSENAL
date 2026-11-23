# mow-mod-maps-missions: give a map another game mode

when: "add battle zones to this map", "make it a capture the flag map", "this map only has combat".
G = AS2 install, `<mod>` = mod folder. A mode on a map = one `<mode>.mi` in the map folder + a mode card `set/multiplayer/games/<mode>.set` in the game or the mod.

## Steps
1. what the map has: MCP `mow_map_info {map:"1v1_road"}`; what modes exist: `mow_mode_info {}`
2. clone a mission to the new mode: MCP `mow_mode_add {map:"1v1_road", from:"combat", to:"battle_zones", mod:"<mod>", flags:5}` (preview; `write:true` writes and lints)
   CLI `node tools/mission-clone/mission-clone.js --game G --map map/multi/<m> --from <mode> --to <mode> --out <mod> [--flags N] [--dry-run] [--list] [--exe as64|mowas_2|mowas2|goh] [--target as64|mowas2|mowas_2|goh]`
   combat <-> battle_zones adds or strips flag points at the spawn lines; → captureflag puts one flag at the spawn midpoint (MIS-60). gen op `mission-clone`
   GUI: Maps tab > `missions` page, add a mode (route `missions/add`, write)
3. captureflag from a small spec, no clone (adds the clips): `node tools/misgen/misgen.js --map <folder> --spec <json> [--out <folder>] [--force] [--exe as64|mowas_2|mowas2|goh] [-q]`; check: `--check <folder>`
4. per-map mode numbers without a card: `<mode>.info` in the map folder sets `parameters` and `maxPlayers` (MIS-69 [V])
5. lint: `node tools/milint/milint.js <mod> [--game G] [-q]`; then host `multi/<map>:<mode>` (→ skill `mow-mod-test`)

## Per game
- as64: all of the above; mowas2: same forms, `--target mowas2`
- goh: mission-clone refuses combat/frontline (exit 2); zones need `zoneId` (GHMAP-03); misgen refused; GUI add a mode is not available on GoH

## Silently fails
- MIS-62 captureflag without clips `captureflaga` / `captureflagb` in `{Clips}`: crash at start
- MIS-63 captureflag has no score limit: the first settled capture wins; time it with `flag_capture_time` in `{parameters}` (stock 300 s)
- MIS-19 classes `armored_warfare`, `combined_arms` are registered with no stock card: they need a new game file + mission
- MIS-65 / MIS-61 bots give no orders on a mode with no flag points; a 1v1 lobby with bots ends in ~17 s
- MIS-11 mission field names are case-SENSITIVE: a wrong-case key is skipped with no message
- MIS-60 a frontline source only gets a copy, not a working conversion

## Verify
- the mode is offered for the map in the lobby; the match starts and can be won the way `mow_mode_info {mode}` says
- flags sit where units can reach them (look in game, or `mow_map_info {map, view:true}`)

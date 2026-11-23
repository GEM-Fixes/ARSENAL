# mow-mod-check-fix: maps, missions, game modes and bot lists (milint)

when: "map does not show in the lobby", "Mission '<path>' ..." errors, wrong player count, a mode card key does nothing, bots do not buy a unit, MAP_ / MIS_ / MI_ findings.

## Steps
1. MCP `mow_mod_check` (`mod`, `only: "milint"`)
   read a map and its modes: MCP `mow_map_info` (`map`, `mod`) · a mission file: MCP `mow_mission_info` (`map`, `mode`, `mod`) · bot lists: MCP `mow_bots_recipe` (`mod`, `action: "check"`)
2. CLI `node tools/milint/milint.js <mod folder> [--game dir] [--exe as64|mowas_2|goh] [--mods a,b] [-q]`
   mode .set against .mi, map.info players, .materials against mtl, `N.pat` .patch ids, Players / Helpers / xform / Clip, unit sets / limits / budget, bot Lua orders and bot.data units / armies, map.net terrain ids, .mi trigger commands against the engine list
3. GUI: Mods tab > Check & Fix; the Maps tab pages show a map's modes and flags
4. fix: MCP `mow_mod_fix` (`only: "botkeys,set"`) · `node tools/fix/fix.js <mod> plan --only botkeys,set`; bots → skill `mow-mod-ai-bots`; a missing mode on a map → skill `mow-mod-maps-missions`

## Codes
| code | meaning | row |
|---|---|---|
| MAP_MODE_UNDEFINED | a `.mi` title with no `set/multiplayer/games/<title>.set` and no mode file lists the map | MAP-01 |
| MAP_PLAYERS, WARN_MI_SPAWN_COUNT | odd or out-of-range player counts; spawn points do not match | MAP-02 |
| MI_KEY_CASE | wrong-case field in a card: skipped | MIS-11 |
| MIS_TEAMKEY_UNREAD | `minTeamPlayers` / `maxTeamPlayers` are not read | MIS-18 |
| MIS_BALANCE_NO_CHARGE | balancing set without `chargeFactors` in the entry | MIS-02 |
| MIS_BOT_UNIT_UNKNOWN | bot.data unit name matches no buy card | MIS-32 |
| WARN_MIS_BOT_ORDER | bot Lua order the live build does not have | - |
| MAP_TERRAIN_UNKNOWN, MAP_NET_ID_RANGE, MAP_WATER_PASSABLE, MAP_NET_FORMAT | map.net terrain problems | - |

## Per game
| as64 | mowas2 | goh |
|---|---|---|
| full rule set; vanilla 0 findings | `--exe mowas_2` | `--exe goh`: GoH forms; map.net cell 5 is valid there (GHMAP-06). GoH buy cards live in `units/<period>/units_<army>.set` [I] |

## Silent fails
- MAP-01 a leftover `0.mi` / `test.mi` beside a valid mode file only makes the engine warn; no mode file listing the map = the map is not offered
- MAP-02 player counts are rounded up to even and clamped: an odd `maxPlayers` can not exist
- MIS-11 card field names are case-sensitive; a wrong-case key is skipped with no message
- MIS-18 the team size keys of the stock template are dead data
- MIS-32 a bot buys by exact card name `name(side)`: a stale name = the bot never buys it, no error
- VFS-42 a mod roster `set/multiplayer/units/<file>.set` replaces the whole file: other cards vanish from the buy menu
- KEY-01 a `.patch` loose in the mod root is not read

## Verify
- re-run milint: 0 errors; `mow_map_info` lists the map with the mode
- in game: the map shows in the lobby under that mode with the right player count; a bot match shows the bot buying the unit (→ skill `mow-mod-test`)
- mission/mi-structure mission/mp-units · guide 12-missions-and-multiplayer-setup, 13-maps, p09, p10, p11, r11-mission-files

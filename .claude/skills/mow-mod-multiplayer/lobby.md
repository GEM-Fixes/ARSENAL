# mow-mod-multiplayer: the lobby (options, dropdowns, teams, slots)

when: "add a lobby option", "lobby dropdown", "change the default fog setting", "teams of three", "free for all", "alliances", "which armies a team may pick", "max players", "slots", "map missing in the lobby", "option does nothing".
G = game install, `<mod>` = the user's mod folder (full path). MCP `game` = `as64|mowas2|goh`.
Lobby texts and pictures → skill `mow-mod-text-ui`. How a player uses the lobby → skill `mow-play-multiplayer`.

## Steps
1. the mode's lobby data: MCP `mow_mode_info {mode:"<mode>", mod:"<mod>"}` (`settings`, `teamSettings`, presets)
2. what a setting means and where it is stored: MCP `mow_settings_info {what:"<word>"}`
3. a map's slots and modes: MCP `mow_mission_triggers {map:"<map>", where:"multi", mod:"<mod>"}`; map card rules → skill `mow-mod-maps-missions`
4. edit `settings {}` / `teamSettings {}` in the mod's copy of `set/multiplayer/games/<mode>.set`
5. lint: MCP `mow_mission_lint {mod:"<mod>"}` · CLI `node tools/milint/milint.js --help`

## Facts
- three lobby dropdowns come from the presets: `gameMode` ("Game settings"), `unitMode` (era or teams), `specMode` (CP choice)
- `settings {}`: `options`, `optionsAdvanced`, `optionsRanked` are the lists of widgets shown; the rest are defaults: `fogOfWar` (`fog_off` / `fog_realistic`), `difficulty`, `floraRespawn`, `friendlyFire`, `gameDuration`, `impregnableTimeout` ..
- `teamSettings {}`: `teamsMode` (teams or deathmatch), `armySelectionMode` (alliance / team / player), `equalizeTeams`, `teams {"a" {title armies minTeamSlots maxTeamSlots aiTeamPlayers hidden}}`, `alliances {"name" {title armies ..}}`
- alliances list armies as repeated `{armies "usa"}` rows or one string `"usa grm"`
- `mission_options`: a lobby group whose choices a mission reads with the `mission_option` term (a mission-defined lobby switch)
- the host's card carries map, mode, preset, unit set and cooldown factors to every machine
- slots per map come from the map's mode file and `maxPlayers`

## Per game
- as64 / mowas2: as above. as64 only: the control pipe sets lobby state for tests (`mp_maps`, `mp_slots`, `mp_slot`, `mp_set`, `mp_army`; → `test-multiplayer.md` in this skill)
- goh: the card also carries doctrine per member and has no cooldown-factor field (GHNET-30); army lists depend on doctrines (GHGPL-09)

## Silently fails
- MIS-01 / GPL-08 unknown keys skipped; stock cards themselves contain keys the reader never uses (`teammatch`, lower-case `minplayers`)
- a widget not named in `options*` is not shown though its default still applies
- MIS-21 `gameDuration` outside the fixed list
- MIS-18 `minTeamPlayers` / `maxTeamPlayers` are never read (stock cooperative ships one): use `minTeamSlots` / `maxTeamSlots` (milint MIS_TEAMKEY_UNREAD)
- MIS-07 an army with `id` below 0 can not be picked (milint MIS_ARMY_ID_NEGATIVE)
- MIS-37 / MIS-66 / NET-24 the team army can be set by the host only in team army mode; in alliance mode the set answers ok and changes nothing: read the slots back
- MIS-61 bots on a 1v1 map: the match ends in seconds because the host owns no unit
- MIS-23 the `{type mod}` term checks installed Workshop mods, not the active mod list
- a new lobby option with no text key shows the raw key

## Verify
- `mow_mission_lint` clean; open the lobby: the option is there with the right default, the team and army choices match; start a match and confirm the rule took effect (fog, friendly fire, length); log read (→ skill `mow-mod-test`)

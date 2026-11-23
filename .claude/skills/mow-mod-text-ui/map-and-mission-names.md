# mow-mod-text-ui: map names in the lobby, mission and mode texts

When: "my map shows a path instead of a name", "rename a map in the lobby", "mission briefing / objective text", "army name in the lobby", "tip texts".
Making or cloning the map itself → skill `mow-mod-maps-missions`.

## Keys; lim LOC-24)
- lobby map name: `mission/<directory>/name`, `directory` = the map folder relative to `/map/`. A multiplayer map `map/multi/<map>` → `mission/multi/<map>/name` (+ `/desc`); a nested map needs every folder: `mission/multi/<sub>/<map>/name` [V] [T in game]
- vanilla keeps MP map names in `mission.lng`; a mod puts its own in a `#` file (title dropped, lim LOC-10): the full key `mission/multi/<map>/name` written out
- single-player: `mission/single/<campaign>/<mission>/...` (names, briefings, objectives, dialogue), vanilla in `mission/single/<campaign>/<mission>.lng` (the subfolder is part of the key); `campaign.lng` for campaign names
- menus and lobby: `mp/...` keys in `#dlg_mp.lng` (an army's lobby name is such a key: the army `title` field names it); loading tips `tip01..` in `#tips.lng`; `loading/..`, `hints/..`
- a key the game already defines in a `#` file (e.g. `mp/army/rus`): gen writes it into a mod copy of that file, since a second definition in the mod's own `#` file may lose (lim LOC-19; the `#` file order is [I])

## Steps
1. find the key in use: MCP `mow_text_find` (`q` = the shown name, or `key: "mission/multi/"`; `mod`)
2. a cloned map gets its lobby name in the same call: MCP `mow_map_clone` (`map`, `name`, `mod`; preview unless `write: true`): copies the map, rewrites paths, adds the name key (as64 / mowas2 `.lng`, goh `.pot`)
   CLI `node tools/gen/gen.js spec.yaml --target as64|mowas2|goh --plan` with op `map-clone` (`map` / `from`, `name`, `as`)
   GUI: Maps page (clone a map); the page flags a wrong name key (MAPCLONE_LOC_KEY)
3. set or change a name by hand: MCP `mow_text_set` (`mod`, `key: "mission/multi/<map>/name"`, `text`; `force: true` to replace)
   CLI `node tools/lng-add/lng-add.js <mod> --file "#x.lng" --key mission/multi/<map>/name --text "t" [--exe as64|mowas_2|goh]`
4. a vanilla text (army name, a vanilla map's name, a tip): MCP `mow_mod_gen` (`mod`, `ops: [{op:"text", key, text}]`); the plan names the vanilla file it copies (info GEN_TEXT_VANILLA_FILE)
5. mission texts of an own mission: keys under `mission/single/<campaign>/<mission>/` in a `.lng` at that sub-path of the mod's text folder, or written out in a `#` file; which keys the mission asks for: MCP `mow_mission_info` (`map`, `mode`)
6. lint: MCP `mow_mod_check` (`mod`, `only: "lnglint,loccover,milint"`)
7. what the lobby will list: MCP `mow_map_info` (`mod`, `q`)

## Per game
| | as64 | mowas2 | goh |
|---|---|---|---|
| map name key | `mission/<dir under /map/>/name` | same | `mow_map_clone` writes the name into a `.pot`; key = `msgctxt` (GHLOC-06) |
| mod text file | `localization/#<mod>.lng` | same | `localizations/default/interface/text/<mod>.pot` |
| missing name | the raw path, no log (LOC-24) | same | raw key + log `Missing text: [key]` (GHLOC-02) |
| a map of the other game family | refused by `mow_map_clone` | refused | refused |
GoH rows: untested, not run in game.

## Silent fails
- LOC-24 a wrong map name key shows the raw path and logs nothing
- LOC-02 any missing mission text shows its key
- LOC-01 a mod `mission.lng` at the vanilla path replaces it whole: every vanilla map loses its name. Use a `#` file
- LOC-19 a renamed vanilla text does not show when only the mod's `#` file carries it
- LOC-06 a briefing is one string per line: use `\n`, never a real line break
- LOC-16 text edits need a restart or re-apply of mods

## Verify
- `mow_text_find` (`key`, `mod`) answers the name from the mod's file
- in game: the lobby map list shows the name (not `mission/...`); for a mission: briefing and first objective read (→ skill `mow-mod-test`)

Depth:, maps (registration) � · guide p09-copy-and-change-a-map, p10-missions-and-modes, 14-localization

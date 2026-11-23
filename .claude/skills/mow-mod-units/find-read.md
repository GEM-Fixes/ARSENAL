# mow-mod-units: find a unit and read its numbers

when: "find a unit", "what does X cost", "stats of X", "which file holds X", "what did the mod change on X". Reads only.
game: MCP `game` = `as64|mowas2|goh` · CLI `--exe as64|mowas_2|goh`. `<mod>` = full path of a mod folder, G = game install.

## Steps
1. find the id: MCP `mow_unit_find` (`q` part of id or shown name, `army`, `kind` vehicle|squad|soldier, `all: true` = also units outside the buy menu, `mod`, `limit`). answers id, name, army, kind, price, "did you mean"
   CLI `node tools/statsheet/statsheet.js [gameDir] [--exe as64|mowas_2|goh] [--mods a,b] [--folder dir] [--scope all|mod] [--units-json]` (card catalogue: price, charge, names)
   GUI: Units tab search box
2. one unit's numbers: MCP `mow_unit_stats` (`id`, `mod`, `show` adds "equipment" and "look", `breed` army/name for one soldier of a group, `card` on GoH). price and resource, rank, cooldown, armour, main gun, squad members, its files, and the game's value when the mod changed it
   CLI `node tools/balance/balance.js [gameDir] [--exe as64|mowas_2|goh | --target as64|mowas2|goh] [--folder mod] [--where "army=ger cls=tank cost>500 res=mp"] [--sort -cost] [--cols a,b]`
   tables: `node tools/statsheet/statsheet.js G --folder <mod> --sheet weapons,ammo,armor,price --fmt md`
3. the raw entity (def source, what it inherits, extenders, refs to model, weapons, ammo, items): MCP `mow_entity_info` (`names` up to 8, `mods` folder names in load order, `mod`)
   CLI `node tools/entityindex/entityindex.js <gameDir|-> [--exe as64|mowas_2|mowas2|goh] [--mods a,b] [--folder dir] [name...]` (winning source, include chain, refs with file:line)
4. a whole army's buy panel: MCP `mow_army` (`army`, `class`, `max_price`, `search`, `mod`; no `army` = list of armies; goh `period`, `doctrine`)
5. plate by plate armour: MCP `mow_unit_armor` (`unit`, `mod`)
6. which copy of a file wins: MCP `mow_file_which` (`path` as the game sees it, `mods` in load order)
7. what the mod changed on it: MCP `mow_mod_diff` (`mod`, `q` or `file`, `keys`) · CLI `node tools/overdiff/overdiff.js <mod folder> [--game dir] [--mods a,b] [--exe as64|mowas_2|mowas2|goh] [-q] [--summary]`

## Where a unit lives (shared)
- entity: `resource/entity/**/<id>.def` (+ includes); soldier: breed file `set/breed/**/<name>` [V humans/breeds]
- buy card: `{"name" ...}` in `set/multiplayer/units/*.set`; card `content` names what spawns: a name that is a breed spawns humans, else an entity; `( )` after a vehicle = crew [V]
- name: text key `desc/entity/<id>`, squads `desc/squad/...`, tooltip `info/entity|squad/<info>` (lim LOC-02)

## Per game
| | as64 | mowas2 | goh |
|---|---|---|---|
| read with | `--exe as64` (as64/core layer on top) | `--exe mowas_2`, no as64/core | `--exe goh` |
| cards | `set/multiplayer/units/*.set` | same | `{"id" (macro .. cost(N) ci(N)) ..}` in `units/<period>/units_<army>.set`; one id has a card per period [I]: pass `card` |
| stats | all | all | no rank, no head start; armour not broken down |
| first call | reads the game, about a minute | same | far longer the first time (index build) |
- vehicles on GoH sit under `entity/-vehicle/<nation>/<class>/`; research tree only there: `node tools/statsheet/statsheet.js --exe goh --sheet research`
- differences list: MCP `mow_game_diff` (`game`, `other`)

## Silent fails
- LOC-02 a missing name key shows the raw key (`desc/squad/...`), no error: a "nameless" unit is a text gap, not a broken unit
- VFS-01 the mod's copy of a file replaces the whole vanilla file: a value "missing" from the mod's stats may be dropped, not changed
- HUM-18 a card or script naming an unknown breed only warns `Unknown breed "x"`; the soldier spawns with skin `skeleton`
- MIS-11 DDA field names in multiplayer data are case-sensitive: a wrong-case key is skipped and the tool then shows the default

## Verify
- the tool's number against the file line it names (stats lists the files); in game: buy panel tooltip and unit card (→ skill `mow-mod-test`)
- tags: stats are read from data [V data]; penetration and armour results are a prediction [I] until shot in game

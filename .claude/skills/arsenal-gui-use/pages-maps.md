# arsenal-gui-use: pages of tab Maps & Missions (`maps`)
Row: I want to -> page ref (`gui_open`, `#go=page:<ref>`) > card -> route (`units/search` = `/api/x/units/search`; `run <cmd>` = `POST /api/run {cmd, input}`) -> CLI (`<t>` = `node tools/<t>/<t>.js`, `as2 <word>` = `node tools/as2/as2.js <word>`). Read the fields with `gui_routes` before a write.
All three game tabs hold the same pages; a part a game cannot run says so on the page. Card names are the English headings (`gui_lang` for ru, uk, zh).

| I want to | where | route | CLI |
|---|---|---|---|
| list the multiplayer maps, see a picture | `maps` > 1. Pick a map | `maps/list`, `maps/picture` | `as2 maps list`, `mapview` |
| copy a map into my mod (name, lobby title, mode, bots) | `maps` > 2. Make my copy | `maps/clone` (`write`), `maps/clone/status` | `map-clone` |
| place one object on a map | `maps` > 3. Put an object on a map | `maps/entities`, `maps/place` (`write`) | `place-entity` |
| check my mod's maps | `maps` > Check my mod's maps | `maps/check` | `milint` |
| look at a map: layers, heights, objects, sight, strong points, checks | `mapviz` (Map Viewer) | `mapviz/maps`, `mapviz/job`, `layer`, `hover`, `places`, `sight/pair`, `strong`, `checks` | `mapviz` |
| make map pictures and lobby previews | `mapviz` > Map pictures, Map previews, Artistic styles | `mapviz/pictures`, `export`, `previews/plan`, `previews/write`, `styles` | `mapviz` |
| see a map's modes, flags, start points | `missions` > 1. Pick a map, 2. Missions on this map | `missions/facts`, `missions/mine` | `misdiff` |
| add a game mode to a map (not GoH) | `missions` > 3. Add a game mode to this map | `missions/add` (`write`) | `mission-clone` |
| see what my mod changed in its missions | `missions` > 4. What my mod changed | `missions/diff` | `misdiff` |
| make a single-player mission | `missions` > Make a single-player mission | `missions/sp/preview`, `sp/write`, `sp/undo`, `sp/remove` | `spmis` |

## Pages and routes (generated)
<!-- gen:pages -->
registry sig f76ba94e969bfbc6ebeed080ddd6cb3679c4399d · 31 pages · 450 routes · 23 commands

### Sub-tabs and pages (same in MoW:AS2, AS64, GoH; GoH adds what is marked)
**Maps & Missions** (tab `maps`, Alt+5)
- Maps (sub `maps`): `maps` Maps
- Map Viewer (sub `viewer`): `mapviz` Map Viewer
- Missions (sub `missions`): `missions` Missions

### Routes by page id
`/api/x/<id>/` + name. G = GET, P = POST. After a name: `+write` (or another word) = previews unless that body field is true; `+dry` = writes unless `dry` is true; `!` = always writes; `^` = starts the game; `#` = refused; `?` = the scan could not tell, read the route with `gui_routes` first.
- `maps`: G list picture clone/status entities · P clone+write place+write check
- `mapviz`: G palette parts maps job jobs doc layer json hover tiles cache places sight/pair card strong checks pictures export previews/targets previews/run styles · P job? cancel? cache/clear? previews/plan previews/write? previews/cancel? previews/deploy-list? previews/check previews/undo+confirm edshot/plan
- `missions`: G facts mine sp/start sp/maps sp/places sp/units sp/mods sp/undo-ok sp/mine · P add+write diff sp/preview sp/write! sp/undo? sp/remove?
<!-- /gen:pages -->

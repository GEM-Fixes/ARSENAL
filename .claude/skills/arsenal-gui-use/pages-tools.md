# arsenal-gui-use: pages of tab Tools & Settings (`tools`)
Row: I want to -> page ref (`gui_open`, `#go=page:<ref>`) > card -> route (`units/search` = `/api/x/units/search`; `run <cmd>` = `POST /api/run {cmd, input}`) -> CLI (`<t>` = `node tools/<t>/<t>.js`, `as2 <word>` = `node tools/as2/as2.js <word>`). Read the fields with `gui_routes` before a write.
All three game tabs hold the same pages; a part a game cannot run says so on the page. Card names are the English headings (`gui_lang` for ru, uk, zh).

| I want to | where | route | CLI |
|---|---|---|---|
| make mod content from a spec file | `make` (Generator) | `run gen` (`plan: true` first), `POST /api/spec` | `as2 gen spec.yaml --target as64 --out <mod>` |
| run any read-only tool, copy a command line | `pro` (Advanced) > All tools, Copy as command | `pro/tools`, `pro/help`, `pro/run`, `pro/cmdline` | the tool itself |
| see what my mod changes, diff two map versions | `pro` > Diff | `pro/overdiff`, `pro/misdiff`, `pro/verdiff` | `overdiff`, `misdiff`, `verdiff` |
| stat sheets of units and weapons | `pro` > Stat sheets | `pro/sheet`, `pro/names` | `statsheet` |
| which mods change the same things, clean copy | `pro` > Conflicts | `pro/conflicts`, `pro/clean` | `conflicts` |
| set the game folder, Advanced, Arrange, language, theme, LAN Remote | `settings` | `GET/POST /api/settings`, `GET /api/game`, `POST /api/launch {on}`, `/api/remote` | none |

## Pages and routes (generated)
<!-- gen:pages -->
registry sig f76ba94e969bfbc6ebeed080ddd6cb3679c4399d · 31 pages · 450 routes · 23 commands

### Sub-tabs and pages (same in MoW:AS2, AS64, GoH; GoH adds what is marked)
**Tools & Settings** (tab `tools`, Alt+9)
- Other Tools (sub `tools`): `make` Generator · `pro` Expert Tools [Advanced]
- Settings (sub `settings`): `settings` Settings

### Routes by page id
`/api/x/<id>/` + name. G = GET, P = POST. After a name: `+write` (or another word) = previews unless that body field is true; `+dry` = writes unless `dry` is true; `!` = always writes; `^` = starts the game; `#` = refused; `?` = the scan could not tell, read the route with `gui_routes` first.
- `pro`: G tools names · P help check run? cmdline? overdiff? misdiff? verdiff? conflicts? clean+write sheet?
- no routes of their own: `make` `settings`
<!-- /gen:pages -->

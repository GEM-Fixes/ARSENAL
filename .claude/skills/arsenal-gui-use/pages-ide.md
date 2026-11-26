# arsenal-gui-use: pages of tab IDE (`ide`)
Row: I want to -> page ref (`gui_open`, `#go=page:<ref>`) > card -> route (`units/search` = `/api/x/units/search`; `run <cmd>` = `POST /api/run {cmd, input}`) -> CLI (`<t>` = `node tools/<t>/<t>.js`, `as2 <word>` = `node tools/as2/as2.js <word>`). Read the fields with `gui_routes` before a write.
All three game tabs hold the same pages; a part a game cannot run says so on the page. Card names are the English headings (`gui_lang` for ru, uk, zh).

| I want to | where | route | CLI |
|---|---|---|---|
| edit mod text with error marks and fixes | `ide` > Editor (file explorer, tabs, Problems) | `ide/tree`, `ide/lint`, `ide/modcheck`; save through `files/save` | `ide` |
| hover help, go to definition, find usages | `ide` > editor, Usages panel | `ide/hover`, `ide/def`, `ide/refs`, `ide/symbols` | `q Name` |
| find a game file, see which file wins | `ide` > Go to file, Which file wins | `ide/vfind`, `ide/vdir`, `ide/copies` | `vfs` |
| read the newest game log with links to file and line | `ide` > Game log panel | `ide/log` | `logtriage` |
| set up Notepad++ | `ide` > Notepad++ | `ide/npp` | `ide` |

## Pages and routes (generated)
<!-- gen:pages -->
registry sig f76ba94e969bfbc6ebeed080ddd6cb3679c4399d · 31 pages · 450 routes · 23 commands

### Sub-tabs and pages (same in MoW:AS2, AS64, GoH; GoH adds what is marked)
**IDE** (tab `ide`, Alt+3)
- IDE (sub `ide`): `ide` Editor

### Routes by page id
`/api/x/<id>/` + name. G = GET, P = POST. After a name: `+write` (or another word) = previews unless that body field is true; `+dry` = writes unless `dry` is true; `!` = always writes; `^` = starts the game; `#` = refused; `?` = the scan could not tell, read the route with `gui_routes` first.
- `ide`: G asset words vdir vfind tree copies log kit npp inbox · P modcheck inc? lint hover def refs symbols extopen? npp? inbox?
<!-- /gen:pages -->

# arsenal-gui-use: pages of tab Models & Sim (`models`)
Row: I want to -> page ref (`gui_open`, `#go=page:<ref>`) > card -> route (`units/search` = `/api/x/units/search`; `run <cmd>` = `POST /api/run {cmd, input}`) -> CLI (`<t>` = `node tools/<t>/<t>.js`, `as2 <word>` = `node tools/as2/as2.js <word>`). Read the fields with `gui_routes` before a write.
All three game tabs hold the same pages; a part a game cannot run says so on the page. Card names are the English headings (`gui_lang` for ru, uk, zh).

| I want to | where | route | CLI |
|---|---|---|---|
| open a unit's model, see its files, bones, volumes, meshes | `models` > Pick a model, Files, Bones, Collision volumes, Meshes and materials | `models/find`, `models/folder`, `models/doc/open`, `doc/state`, `doc/scene`, `viewer/scene` | `soedit` |
| edit the model and save it into my mod | `models` > the sub-tabs, Check before saving, Files | `models/doc/op`, `doc/undo`, `doc/redo`, `file/lint`, `doc/save`, `file/write` | `soedit` |
| edit an animation | `models` > Animation editor, Timeline | `models/anim/info`, `anim/run`, `anim/undo` | none |
| test a shot against armour, see the thickness map | `models` > Armour (not GoH) | `models/armor/table`, `armor/shot`, `armor/map`, `armor/guns`, `armor/shells`, `armor/edit` | `armorsim` |
| see soldier skins | `models` > Soldier skins | `models/look`, `look/skins`, `look/pose` | none |
| work in the SOEdit program | `models` > SOEdit, What SOEdit changed | `models/locate`, `stage`, `open`, `check` | `soedit` |
| put a texture, camo, sound, icon or portrait into my mod | `art` (Look & Sound) | `art/names`, `art/unit`, `art/camo`, `art/camo-write`, `art/sound`, `art/wav-convert`, `art/icons`, `art/icon-png`, `art/copy`, `art/check` | `artport` |

## Pages and routes (generated)
<!-- gen:pages -->
registry sig f76ba94e969bfbc6ebeed080ddd6cb3679c4399d · 31 pages · 450 routes · 23 commands

### Sub-tabs and pages (same in MoW:AS2, AS64, GoH; GoH adds what is marked)
**Models & Sim** (tab `models`, Alt+4)
- Models & Sim (sub `models`): `models` Models · `art` Look & Sound

### Routes by page id
`/api/x/<id>/` + name. G = GET, P = POST. After a name: `+write` (or another word) = previews unless that body field is true; `+dry` = writes unless `dry` is true; `!` = always writes; `^` = starts the game; `#` = refused; `?` = the scan could not tell, read the route with `gui_routes` first.
- `models`: G locate · P start+dry stage+dry open+dry check doc/open? doc/op? doc/undo? doc/redo? doc/state doc/scene? doc/save+dry doc/close? doc/dir? ply/import-read? anim/info anim/run+dry anim/undo! viewer/scene? viewer/texture? file/new? file/write? file/export? file/source? file/autosave? file/lint file/backup? file/whoami armor/table? armor/shot? armor/map? armor/effects? armor/edit+dry armor/guns? armor/shells? armor/nothit? find folder? warm? look? look/skins? look/pose?
- `art`: G names unit camo sound wav icons assets blender · P copy+dry camo-write+dry check wav-convert+dry icon-png+dry
<!-- /gen:pages -->

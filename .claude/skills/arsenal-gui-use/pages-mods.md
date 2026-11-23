# arsenal-gui-use: pages of tab Mods (`mods`)
Row: I want to -> page ref (`gui_open`, `#go=page:<ref>`) > card -> route (`units/search` = `/api/x/units/search`; `run <cmd>` = `POST /api/run {cmd, input}`) -> CLI (`<t>` = `node tools/<t>/<t>.js`, `as2 <word>` = `node tools/as2/as2.js <word>`). Read the fields with `gui_routes` before a write.
All three game tabs hold the same pages; a part a game cannot run says so on the page. Card names are the English headings (`gui_lang` for ru, uk, zh).

| I want to | where | route | CLI |
|---|---|---|---|
| pick the mod to work on, see the installed mods | `mods` > mod list (also the mod pill in the header) | `GET /api/mods`, `/api/mod?dir=`, `/api/installed` | `modinfo` |
| make a new empty mod | `mods` > New blank mod (new) | `run new` | `as2 new <dir> --name ".." [--target ..]` |
| bring an old mod to AS64, or port it to MoW:AS2 or GoH | `upgrade` > Port to another target (upgrade) | `run upgrade` (plan first) | `as2 upgrade <mod> --to as64 --plan` |
| see the mod's files, which copy the game uses, edit raw text, restore | `files` (Advanced) > Files, Editor, Search, Undo | `files/tree`, `files/which`, `files/open`, `files/save`, `files/copy`, `files/search`, `files/undo`, `files/restore` | `vfs` |
| check a mod without starting the game | `check` > Check a mod | `run check`; cards `/api/explain`, `/api/limit`, `/api/peek` | `as2 check <mod> [--exe as64,mowas2,goh]` |
| fix what check found (patch folder, never the source mod) | `check` > guided fix | `run fix` (`mode: plan`, then `apply`) | `as2 fix <mod> plan` |
| explain my last game log, a crash | `logs` > Explain my last game log, Log files the game left | `logs/find`, `logs/explain`, `logs/dump` | `logtriage` |
| see what the game has switched on, why my mod is not in the list | `logs` > What the game has switched on, Why is my mod not in the list? | `logs/enabled`, `logs/modwhy` | `wouldload`, `modinfo` |
| find why a unit is missing or cannot be bought | `logs` > My unit is missing or can't be bought | `logs/units`, `logs/unit` | `refcheck` |

## Pages and routes (generated)
<!-- gen:pages -->
registry sig 58a557fd8c410eb876fa3fccb81441e14bf1b5af · 31 pages · 447 routes · 23 commands

### Sub-tabs and pages (same in MoW:AS2, AS64, GoH; GoH adds what is marked)
**Mods** (tab `mods`, Alt+2)
- Mods (sub `mods`): `mods` Mods · `upgrade` Upgrade or Port · `files` Mod Files [Advanced]
- Check & Fix (sub `check`): `check` Check · `logs` Read Game.log

### Routes by page id
`/api/x/<id>/` + name. G = GET, P = POST. After a name: `+write` (or another word) = previews unless that body field is true; `+dry` = writes unless `dry` is true; `!` = always writes; `^` = starts the game; `#` = refused; `?` = the scan could not tell, read the route with `gui_routes` first.
- `files`: G tree which open undo · P save+write copy+write restore+write warm? search
- `logs`: G units find enabled ticklist · P explain dump? modwhy? unit?
- no routes of their own: `mods` `upgrade` `check`
<!-- /gen:pages -->

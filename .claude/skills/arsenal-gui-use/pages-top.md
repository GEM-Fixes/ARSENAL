# arsenal-gui-use: above the tabs
Row: I want to -> page ref (`gui_open`, `#go=page:<ref>`) > card -> route (`units/search` = `/api/x/units/search`; `run <cmd>` = `POST /api/run {cmd, input}`) -> CLI (`<t>` = `node tools/<t>/<t>.js`, `as2 <word>` = `node tools/as2/as2.js <word>`). Read the fields with `gui_routes` before a write.
All three game tabs hold the same pages; a part a game cannot run says so on the page. Card names are the English headings (`gui_lang` for ru, uk, zh).

| I want to | where | route | CLI |
|---|---|---|---|
| be led through a task step by step (new unit, skin, flag, bots buy, text, fix a mod, release) | Quick Guided Task row > task window | `task/catalogue`, `task/recipe`, `task/plan`, `task/write`, `task/check` | per recipe |
| open a file in the right viewer (sound, picture, video, font, hex) | any file link; opens in Editor or its home page | `view/info`, `view/bytes`, `view/<kind>/...` | none |
| see what is running, stop it | footer job button > job list | `GET /api/jobs`, `POST /api/cancel {id}` | none |
| go back to where I was | footer jump back bar | none (in the page) | none |

## Pages and routes (generated)
<!-- gen:pages -->
registry sig 58a557fd8c410eb876fa3fccb81441e14bf1b5af · 31 pages · 447 routes · 23 commands

### Routes of what sits above the tabs
`/api/x/<id>/` + name. G = GET, P = POST. After a name: `+write` (or another word) = previews unless that body field is true; `+dry` = writes unless `dry` is true; `!` = always writes; `^` = starts the game; `#` = refused; `?` = the scan could not tell, read the route with `gui_routes` first.
- `core`: G / /console /api/jobs /api/ls /api/mods /api/mod /api/peek /api/explain /api/limit /api/text /api/health /api/installed /api/settings /api/commands /api/game /api/live /api/remote /api/cache · P /api/cancel /api/answer /api/launch^ /api/remote# /api/remote/newkey# /api/follow /api/follow/remote# /api/spec! /api/settings! /api/run
- `view`: G bytes info hex hex/find sound/plan sound/pcm sound/name sound/burst picture/info picture/image model/owner map/info video/info video/audio video/frame font/info font/page shader/info misc/list misc/ref · P video/play+dry
- `task`: G catalogue recipe drafts draft lookup values external r/vehicle/crew r/text/missing r/text/lint r/text/extract r/text/table r/text/find r/model/set r/model/names r/x-thing/entities r/x-limits/find · P draft/new? draft/save? draft/delete? draft/child? upload? plan write? check external/open+dry external/back? r/vehicle/gohcard? r/squad/gohcard? r/item/gohgive? r/skin/gametex? r/army/flag+write r/army/text? r/army/gohcards? r/army/gohmake? r/army/gohadopt? r/army/gohbudget? r/map/goh? r/mission/goh? r/bots/buy+write r/bots/gohbuy? r/text/goh? r/model/edit+write r/model/gohvol? r/armour/goh? r/gohunit/dir? r/gohunit/scan r/gohunit/stage? r/fixmod/scan r/fixmod/stage? r/release/check
- `/api/run` commands: game new play^ install uninstall probe^ e2e^ dev-loop^ upgrade check fix gen prove^ translate edrun^ mapshot^ testprofile testprofile-seed soeditlocate soeditstage soeditopen soeditcheck gohport
<!-- /gen:pages -->

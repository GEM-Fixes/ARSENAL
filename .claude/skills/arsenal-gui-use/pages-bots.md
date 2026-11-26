# arsenal-gui-use: pages of tab Game Modes & AI (`bots`)
Row: I want to -> page ref (`gui_open`, `#go=page:<ref>`) > card -> route (`units/search` = `/api/x/units/search`; `run <cmd>` = `POST /api/run {cmd, input}`) -> CLI (`<t>` = `node tools/<t>/<t>.js`, `as2 <word>` = `node tools/as2/as2.js <word>`). Read the fields with `gui_routes` before a write.
All three game tabs hold the same pages; a part a game cannot run says so on the page. Card names are the English headings (`gui_lang` for ru, uk, zh).

| I want to | where | route | CLI |
|---|---|---|---|
| list game modes, allow bots in a mode | `modes` > Modes in the game and in my mod, Allow bots in a mode | `modes/list`, `modes/bots` (`write`) | none |
| see what bots buy, make bots buy a unit | `bots` > Bot shopping list | `bots/buys`, `bots/units`, `bots/buyfirst`, `bots/buycheck/*`, `bots/undo` | `botrecipe` |
| set purchase stages and movement | `bots` > Stages and movement | `bots/stages/read`, `stages/preview`, `stages/write`, `stages/undo` | none |
| change bot difficulty numbers | `bots` > How bots think > Bot difficulty | `bots/table`, `bots/edit`, `bots/reset` | none |
| teach the bot new habits | `bots` > Teach the bot new habits | `bots/recipes/state`, `recipes/preview`, `recipes/write`, `recipes/remove` | `botrecipe` |
| check a mode is ready for bots, try a bot match | `bots` > Match setup | `bots/modeready/list`, `modeready/allow`, `botmatch/plan`, `botmatch/start` (launch), `botmatch/status` | `testrun` |
| turn a persona into bot settings | `doctrine` > Generate, Check | `doctrine/data`, `doctrine/detect`, `doctrine/gen`, `doctrine/check` | `doctrine` |
| change how AI soldiers and crews behave | `unitai` > How soldiers and crews behave | `bots/brain/values`, `brain/edit`, `brain/reset` | none |
| change who shoots at what | `unitai` > Who shoots at what | `bots/targets/state`, `targets/change`, `targets/reset` | none |
| give bots orders on one map | `mapai` > Orders for bots on one map | `bots/mission/facts`, `mission/add`, `mission/remove`, `mission/undo` | none |

## Pages and routes (generated)
<!-- gen:pages -->
registry sig f76ba94e969bfbc6ebeed080ddd6cb3679c4399d · 31 pages · 450 routes · 23 commands

### Sub-tabs and pages (same in MoW:AS2, AS64, GoH; GoH adds what is marked)
**Game Modes & AI** (tab `bots`, Alt+6)
- Game Modes (sub `modes`): `modes` Game Modes
- Bots (sub `bots`): `bots` Bots · `doctrine` Bot Doctrine
- Unit AI (sub `unitai`): `unitai` Unit AI
- Map Scripts for AI (sub `mapai`): `mapai` Map scripts for AI

### Routes by page id
`/api/x/<id>/` + name. G = GET, P = POST. After a name: `+write` (or another word) = previews unless that body field is true; `+dry` = writes unless `dry` is true; `!` = always writes; `^` = starts the game; `#` = refused; `?` = the scan could not tell, read the route with `gui_routes` first.
- `modes`: G list · P bots+write
- `bots`: G buys units table undo buycheck/run buycheck/cards stages/read stages/cards recipes/state recipes/units recipes/log modeready/list modeready/botmodes botmatch/form botmatch/maps botmatch/status brain/values brain/guns targets/state mission/maps mission/facts mission/units · P edit+write reset+write buyfirst+write undo? buycheck/fix+write buycheck/undo? stages/preview stages/write? stages/undo? recipes/preview recipes/write? recipes/remove+write recipes/undo? modeready/allow+write modeready/undo? botmatch/plan botmatch/start? botmatch/stop? brain/edit+write brain/reset+write targets/change+write targets/reset+write mission/add? mission/remove+write mission/undo?
- `doctrine`: G data voice profile detect · P gen+write check
- no routes of their own: `unitai` `mapai`
<!-- /gen:pages -->

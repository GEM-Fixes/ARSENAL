# arsenal-gui-use: pages of tab Test, Share & Play (`share`)
Row: I want to -> page ref (`gui_open`, `#go=page:<ref>`) > card -> route (`units/search` = `/api/x/units/search`; `run <cmd>` = `POST /api/run {cmd, input}`) -> CLI (`<t>` = `node tools/<t>/<t>.js`, `as2 <word>` = `node tools/as2/as2.js <word>`). Read the fields with `gui_routes` before a write.
All three game tabs hold the same pages; a part a game cannot run says so on the page. Card names are the English headings (`gui_lang` for ru, uk, zh).

| I want to | where | route | CLI |
|---|---|---|---|
| see what changed and what to test for it | `testplan` > 1. What changed, 2. Tests in the game | `testplan/plan`, `testplan/status` | `testplan` |
| make test files, tick results, mark as tested | `testplan` > 3 to 5 | `testplan/emit`, `read`, `tick`, `mark`, `checklist` | `testplan` |
| pick unit pairs to test | `test` > Unit pairs | `testplan/pairs/suggest`, `pairs/check`, `pairs/lib`, `pairs/describe` | `testplan` |
| run pairs in the editor build, prove one unit (launch) | `test` > edrun card, prove card (GoH: not run) | `run edrun`, `run prove` | `edrun`, `prove` |
| write mod.info details, credits, preview picture | `share` > About my mod | `share/info`, `share/preview` | `modinfo` |
| check the mod is ready to share | `share` > Ready to share? | `share/gate` | `release-check` |
| package for friends | `share` > Package for friends | `share/outcheck`, `share/package` | `packer` |
| upload to the Workshop | `share` > Workshop | `share/workshop`, `share/uploader` | `workshop` |
| bump the version, react to a game update | `share` > New version, Game updated? | `share/version`, `share/updated` | `modinfo` |
| play together (same files for everyone) | `share` > Play together | `share/card` | `mpsync` |
| use several mods together, make a patch mod | `share` > Mods together | `share/clashes`, `share/clashfix` (`write`, into a new folder) | `conflicts`, `node tools/conflicts/patchmod.js` |
| install a mod into the game, remove it | `play` | `run install` (`dry` first), `run uninstall` | `as2 install <mod>`, `as2 uninstall <name> --yes` |
| start a test match (launch) | `play` | `run play` (`dry` first) | `as2 play <mod> --dry` |
| see or seed the test game copy's mod list | `play` > test profile card | `run testprofile`, `run testprofile-seed` | `modswitch` |

## Pages and routes (generated)
<!-- gen:pages -->
registry sig f76ba94e969bfbc6ebeed080ddd6cb3679c4399d · 31 pages · 450 routes · 23 commands

### Sub-tabs and pages (same in MoW:AS2, AS64, GoH; GoH adds what is marked)
**Test, Share & Play** (tab `share`, Alt+8)
- Test Run (sub `test`): `testplan` Test Plan · `test` Test Run
- Share (sub `share`): `share` Share
- Play (sub `play`): `play` Play

### Routes by page id
`/api/x/<id>/` + name. G = GET, P = POST. After a name: `+write` (or another word) = previews unless that body field is true; `+dry` = writes unless `dry` is true; `!` = always writes; `^` = starts the game; `#` = refused; `?` = the scan could not tell, read the route with `gui_routes` first.
- `testplan`: G status state pairs/lib · P plan emit! read tick! mark! checklist! pairs/suggest pairs/check pairs/lib! pairs/describe
- `share`: G mods info outstart uploader clashprogress · P info+write preview+write gate outcheck package+write workshop+write uploader# version+write card clashes clashshadows? clashmp? clashopen? clashfix+write updated
- no routes of their own: `test` `play`
<!-- /gen:pages -->

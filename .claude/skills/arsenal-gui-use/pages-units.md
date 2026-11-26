# arsenal-gui-use: pages of tab Units & Balance (`units`)
Row: I want to -> page ref (`gui_open`, `#go=page:<ref>`) > card -> route (`units/search` = `/api/x/units/search`; `run <cmd>` = `POST /api/run {cmd, input}`) -> CLI (`<t>` = `node tools/<t>/<t>.js`, `as2 <word>` = `node tools/as2/as2.js <word>`). Read the fields with `gui_routes` before a write.
All three game tabs hold the same pages; a part a game cannot run says so on the page. Card names are the English headings (`gui_lang` for ru, uk, zh).

| I want to | where | route | CLI |
|---|---|---|---|
| find a unit, read its stats | `units/make` > Find a unit | `units/index`, `units/search`, `units/stats`, `units/weapons` | `statsheet --units-json` |
| change price, name, armour, cooldown of a unit | `units/make` > Change a number of the picked unit | `units/change` (`write`) | `gen` (ops), `patch-entity` |
| add a unit as a copy, describe a new unit | `units/make` > Add a unit (copy), Describe a new unit | `units/add`, `units/describe` | `gen` |
| build a squad or vehicle group buy, see it in 3D | `units/make` > Build a buy, 3D view of a buy | `units/buy`, `units/lineup`, `units/models` | `gen` |
| change what a unit carries, weapon slots | `units/make` > Equipment | `units/kit`, `kit/items`, `kit/set`, `kit/slot` | `gen` |
| change a skin or texture variant | `units/make` > Skin and texture variant | `units/look`, `look/skins`, `look/set` | `gen` |
| compare units, change an army's prices by percent, price hints | `units/tune` > Balance, Buy panel checklist | `units/compare`, `units/armyprice`, `units/hints` | `balance` |
| bigger squad, longer rifle range | `units/tune` > Rename or resize, Longer rifle range | `units/recipe` | `gen` |
| see every buy-panel unit at once, bulk change one value | `balance` > sheet, groups, graph, side by side | `balance/table`, `balance/change` (`write`) | `balance` |
| price units from a model | `balance` > Price calculator | `balance/prices/calc`, `prices/try`, `prices/plan`, `prices/apply`, `prices/undo` | `pricecalc` |
| bring a GoH vehicle into AS2 | `goh` (GoH tab) > 1. Pick the GoH unit, 2. Pick the donor, 3. Convert | `goh/units`, `goh/donors`, `goh/convert`, `goh/fit`, `goh/show` | `goh2as2`, `donorpick`, `donorfit`, `portfix` |

## Pages and routes (generated)
<!-- gen:pages -->
registry sig f76ba94e969bfbc6ebeed080ddd6cb3679c4399d · 31 pages · 450 routes · 23 commands

### Sub-tabs and pages (same in MoW:AS2, AS64, GoH; GoH adds what is marked)
**Units & Balance** (tab `units`, Alt+7)
- Units (sub `units`): `units/make` Units · `goh` GoH unit [GoH only]
- Balance (sub `balance`): `balance` Balance · `units/tune` Units

### Routes by page id
`/api/x/<id>/` + name. G = GET, P = POST. After a name: `+write` (or another word) = previews unless that body field is true; `+dry` = writes unless `dry` is true; `!` = always writes; `^` = starts the game; `#` = refused; `?` = the scan could not tell, read the route with `gui_routes` first.
- `units`: G status · P search index weapons stats change+write add+write buy+write models+write lineup+write kit+write kit/items+write kit/set+write kit/slot+write look+write look/skins+write look/set+write describe compare armyprice+write hints+write recipe+write card/kinds+write card/current+write card/styles+write card/scene+write card/weapons+write card/plan+write card/make+write card/load+write card/images+write card/gimp+write card/cutouts+write card/openxcf+write card/fidelity+write goharmor?
- `goh`: G status units donors names show · P convert+confirm fit+apply
- `balance`: P table change+write prices/calc prices/try? prices/save! prices/seed+write prices/plan prices/apply! prices/check prices/undo! prices/names
<!-- /gen:pages -->

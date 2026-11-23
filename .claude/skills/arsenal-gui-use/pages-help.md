# arsenal-gui-use: pages of tab Help & Docs (`help`)
Row: I want to -> page ref (`gui_open`, `#go=page:<ref>`) > card -> route (`units/search` = `/api/x/units/search`; `run <cmd>` = `POST /api/run {cmd, input}`) -> CLI (`<t>` = `node tools/<t>/<t>.js`, `as2 <word>` = `node tools/as2/as2.js <word>`). Read the fields with `gui_routes` before a write.
All three game tabs hold the same pages; a part a game cannot run says so on the page. Card names are the English headings (`gui_lang` for ru, uk, zh).

| I want to | where | route | CLI |
|---|---|---|---|
| learn what a mod is, the 4 steps | `help/first` > What is a mod?, The 4 steps | none | none |
| know what the top bar, pages, warning words, file types mean | `help/around` | none | none |
| look up a word | `help/lookup` > Glossary | `help/glossary` | `q -k words` |
| look up a limit ID (`AREA-NN`, `GHAREA-NN`) | `help/lookup` > Look up a limit ID | `help/limit`, `help/limitids` | `q -l ID` |
| find why my change is not showing | `help/lookup` > My change is not showing | `help/diag` | none |
| get a report text for a bug report | `help/lookup` > Get help > Report text | `help/diag` | none |
| make the slow data ahead of time, see what is ready or stale, clear it | `prep` > Prepare | `prep/state`, `prep/run`, `prep/stop`, `prep/clear`, `prep/check` | none |
| see or install the Claude pack (skills, MCP servers) for this repo | `claude` > Claude | `claude/list`, `claude/status`, `claude/zip`; writes: `claude/install`, `claude/uninstall` | `node tools/mcp/pack/pack.js` |
| read or search the ARSENAL, modding or engine documents | `docs/arsenal`, `docs/modding`, `docs/engine` | `docs/list`, `docs/file`, `docs/search`, `docs/book`, `docs/booksearch`, `docs/pdf` | `q -k words`, `q -t topic` |
| read the maintainers' notes | `docs/project` (Advanced) | same | `q` |
| read historical sources | `docs/history` | `docs/history/groups`, `docs/history/rows`, `docs/history/text`, `docs/history/search`, `docs/history/join` | none |
| find a guide or tool by another modder | `guides` > Search, Questions and answers, Tools by topic | `guides/search`, `guides/show`, `guides/faq`, `guides/tools`, `guides/update/*` | `gemindex` |

## Pages and routes (generated)
<!-- gen:pages -->
registry sig 58a557fd8c410eb876fa3fccb81441e14bf1b5af · 31 pages · 447 routes · 23 commands

### Sub-tabs and pages (same in MoW:AS2, AS64, GoH; GoH adds what is marked)
**Help & Docs** (tab `help`, Alt+1)
- Start Here (sub `start`): `help/first` Start Here · `help/around` Start Here · `help/lookup` Start Here
- Prepare (sub `prep`): `prep` Prepare
- Docs (sub `docs`): `docs/arsenal` Docs · `docs/modding` Docs · `docs/engine` Docs · `docs/project` Docs [Advanced]
- Guides & External Tools (sub `guides`): `guides` Guides & External Tools
- Claude (sub `claude`): `claude` Claude
- Historical Sources (sub `history`): `docs/history` Docs

### Routes by page id
`/api/x/<id>/` + name. G = GET, P = POST. After a name: `+write` (or another word) = previews unless that body field is true; `+dry` = writes unless `dry` is true; `!` = always writes; `^` = starts the game; `#` = refused; `?` = the scan could not tell, read the route with `gui_routes` first.
- `help`: G glossary chapters chapter limit limitids diag
- `prep`: G state · P run? stop? clear? check
- `docs`: G where heads status list file search limit book booksearch whole · P history/titles pdf? history/groups history/rows history/text history/search history/join? history/joinstatus history/joinstop?
- `guides`: G status update/progress gaps · P sources update/plan update/start? update/stop? search show titles faq tools export+dry
- `claude`: G list status · P zip? install+write uninstall+write
<!-- /gen:pages -->

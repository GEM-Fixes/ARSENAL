# mow-play-setup: the ARSENAL window for setup
When: the person uses the ARSENAL GUI (start: `node tools/gui/gui.js`), or wants to see things instead of reading tool output.

## Steps
1. `gui_status {}` (is it running, which game tab, which mod). Not running: the user starts `node tools/gui/gui.js --port 47811`.
2. Link to a page: `gui_open {page: "mods"}`; what a page is for: `gui_pages {word: "bots"}`.

## Page for each setup step
| step | page (tab > page) | ref |
|---|---|---|
| installed mods, pick one | Mods > Mods | `mods` |
| check a mod before installing | Mods > Check & Fix > Check | `check` |
| what the game has switched on, why a mod is not in the list | Mods > Check & Fix > Read Game.log | `logs` |
| modes, bots allowed per mode | Game Modes & AI > Game Modes | `modes` |
| what bots buy, match setup | Game Modes & AI > Bots | `bots` |
| maps, pictures, flags | Maps & Missions > Maps, Map Viewer | `maps`, `mapviz` |
| several mods together | Test, Share & Play > Share > Mods together | `share` |
| same files for friends | Test, Share & Play > Share > Play together | `share` |
| install into the game, start a test match | Test, Share & Play > Play | `play` |
| game folder, language, theme | Tools & Settings > Settings | `settings` |

## Per game
Three game buttons at the top: MoW:AS2, AS64, GoH; every page exists in each. Play runs on AS64 only; on MoW:AS2 and GoH the page says why not. A link does not switch the game button: say "press GoH at the top first".

## What goes wrong
- the window shows another mod than the one the person means: the mod pill in the header is the one all pages use.
- launch buttons greyed: the window was not started with `--allow-launch`; that is the user's switch.

## More
Routes, writes, jobs: skill `arsenal-gui-use`.

## Check
`gui_open` gives a link that opens the named page on this PC.

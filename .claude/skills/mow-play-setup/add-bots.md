# mow-play-setup: add bots
When: "play against the AI", "no bot slot", "bots do nothing".

## Steps
1. Rules and where bots may be added: `mow_bots_info {game: "as64"}`.
2. Does the mode take bots: `mow_mode_info {game: "as64", mode: "battle_zones", mod: "<mod>"}` (bots allowed or not).
3. In the lobby: open a slot's dropdown and pick a bot level (easy to heroic).
4. What a bot of one army buys: `mow_bots_info {game: "as64", army: "rus", mod: "<mod>"}`.

## CLI
`node tools/botrecipe/botrecipe.js --help` (check mode reads a mod's bot data). GUI: Game Modes & AI > Game Modes (bots on / off per mode), Bots > Match setup (`bots/modeready/list`).

## Rules (AS2 + AS64)
- the stock LAN Combat card has no bot slot; a mod card that allows bots gives one. TST-03 [V]
- bots do nothing on a map mode without flags; pick a flag mode (Assault Zones). NET-23 [V once]
- bots only buy and capture; no artillery missions, no retreat. AI-12 [V]
- vanilla bots ignore unlock timers.
- a 1v1 lobby where the host owns no units ends about 17 s in; use a 4-slot map or own a unit. MIS-61 [V once]
- bots run on the host's PC only. MIS-20 [V]

## Per game
- MoW:AS2: same; a bot script error aborts there, AS64 only logs it.
- GoH: bots buy from other files and run from scripts (GHMIS-66); skirmish against AI and Conquest are in its own menus. `mow_bots_info {game: "goh"}` gives the rules only.

## What goes wrong
- no bot entry in the slot dropdown: the mode's card does not allow bots. A mod can switch it on (skill `mow-mod-ai-bots`); the player cannot from the lobby.
- bots buy nothing with a mod: the mod's units are not in the bot's shopping list for that army.
- "harder bots": their level is mostly money; it does not add tactics.

## Check
The bot buys within the first minute and walks to a flag.

# mow-play-multiplayer: bots as team mates or enemies
When: "co-op against the AI with friends", "fill empty slots with bots", "bots do nothing online".

## Steps
1. Does the mode take bots: `mow_mode_info {game: "as64", mode: "battle_zones", mod: "<mod>"}`.
2. Rules and what a bot buys: `mow_bots_info {game: "as64"}` · `mow_bots_info {game: "as64", army: "ger", mod: "<mod>"}`.
3. In the lobby: a slot's dropdown -> a bot level (easy to heroic).
GUI: Game Modes & AI > Game Modes (bots on / off per mode), Bots.

## Rules (AS2, AS64)
- bots run on the host's PC only; the host's speed is theirs. MIS-20 [V]
- bot orders are few: spawn, capture a flag, say a chat line. MIS-08. No artillery missions, no retreat. AI-12 [V]
- a mode without flags leaves bots idle. NET-23
- the stock LAN Combat card has no bot slot. TST-03 [V]
- a bot's level changes its money, not its tactics.
- a 1v1 lobby where the host owns no units ends after about 17 s. MIS-61

## Per game
- MoW:AS2: a bot script error aborts the match there; AS64 logs it and continues.
- GoH: other bot files (GHMIS-66); `mow_bots_info {game: "goh"}` gives rules only.

## What goes wrong
- bots with a mod buy nothing: its units are not in the bot's list (the mod author's job: skill `mow-mod-ai-bots`).
- friends against "heroic" bots lose to numbers, then call it cheating: it is money.
- no bot entry in the dropdown: the mode's card forbids bots.

## Check
Each bot buys in the first minute and moves to a flag.

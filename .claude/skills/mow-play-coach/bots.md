# mow-play-coach: what bots can and cannot do
When: "are bots any good", "why do the bots just rush flags", "do bots use artillery", playing skirmish against AI.

## Steps
1. `mow_bots_info {game: "as64"}` -> what a bot can and cannot do, in which modes it may be added.
2. One army's shopping list: `mow_bots_info {game: "as64", army: "ger", mod: "<mod>"}` (as64, mowas2).
3. Rows: `mow_limit {ids: ["AI-12", "MIS-08"]}` Â.
CLI: `node tools/botrecipe/botrecipe.js --help`. GUI: Game Modes & AI > Bots > Bot shopping list (`bots/buys`).

## Rules (AS2 + AS64)
- bots only buy and capture flags: orders are Spawn, CaptureFlag, SayChat. No artillery missions, no retreat. AI-11 AI-12 MIS-08 [V]
- bots never re-crew a bailed vehicle. AI-13 [V]
- vanilla bots ignore unlock timers; bot money per difficulty comes from the mode's bot table (easy to heroic).
- bots do nothing on a map mode without flags; use a flag mode. NET-23 [V once]
- the stock LAN Combat card has no bot slot; a mod card that allows bots gives one. TST-03 [V]
- bots on a 1v1 lobby where the host owns no units: the match ends in about 17 s. MIS-61 [V once]
- bots run on the host only. MIS-20 [V]

## So, against bots
Hold the flags they walk to; they do not flank on purpose or fall back. Their "difficulty" is mostly money and timing, not tactics.

## Per game
- MoW:AS2: same data; a bot script error aborts on MoW:AS2 and is only logged on AS64.
- GoH: bots buy from other files and run from scripts (GHMIS-66); `mow_bots_info {game: "goh"}` gives the rules only, no shopping list.

## What goes wrong
- a mod's bots described from vanilla: pass `mod`.
- "bots cheat with timers" stated for a mod: only vanilla was read.

## Check
A skirmish on a flag mode; the bot's first buys against `mow_bots_info`.

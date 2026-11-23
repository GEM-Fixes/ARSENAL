# RobZ Realism 1.30.10: what it shows a mod can reach. reference, not engine fact. grown as batches read it

Verified 2026-11-04 from the install, unless tagged:
- 80 files, 4.4 GB: 7 `.pak` hold nearly all of it, 65 `.lng` sit loose (57 under localization/mission/single). A tool that skips paks sees almost nothing.
- `mod.info` Min/Max 3.262 = legacy: Classic mode on as64, native on mowas_2. Enhanced mode won't list it, and a patch for it must be legacy too.
- Load-order companion exists: a separate mod that loads after it to change AI spawn logic, income and artillery presets. Shows a small patch folder can retune a large mod without editing it.
- Findings file counts: 283 AI unit names, 327 duplicate text keys, 30 wrong item names. They survive in a mod this large because nothing reports them in play: the engine skips them silently. So a correction pass is a real product, not a chore.

## Scale (file counts inside the paks)
| pak | files | mostly |
|---|---|---|
| entity | 57,296 | vehicles 26k, inventory 12k, human skins 9k, new entities 7k |
| texture | 24,100 | inventory 9k, common 7k, fx 6k |
| interface | 6,238 | scene 6k |
| sound | 4,325 | vehicle, human, weapon |
| map | 2,966 | multi 2.9k, single 106 |
| gamelogic | 2,854 | stuff 1.4k, breed 900, environment 300 |
| music | 2 | main theme |

Content by type: 21k `.ply`, 16k `.mtl`, 16k `.dds`, 9k `.tga`, 6.7k `.def`, 5.4k `.mdl`, 3.8k `.wav`, 3.5k `.vol`, 2k `.anm`, 1.3k `.set`, 478 `.ammo`, 451 `.mi`.

## Multiplayer roster
- 2,080 cards: 1,625 plain, 455 squads from macros (`squad_with*`, `i_seq_with*`, `how`).
- Squads by side: jap 82, usa 59, ger 57, rus 53, ger_ss 52, axis_minor 46, eng 39, rus_guard 37, ger2 30.
- Vehicle-like cards by side: ger 81, eng 76, ger_ss 76, usa 73, rus 66, ger2 56, axis_minor 55, rus_guard 54, jap 47.
- Adds armies `axis_minor`, `ger_ss`, `rus_guard`. Cards are split by era in the file name (`squads_44`, `vehicles_43-45`) and tagged in `t(...)`.

## How far it reaches
- Reaches data and content: new entities, breeds, stuff, sound, maps, interface scenes, game modes (`battle_zones`, `frontline`, wave presets).
- One script file in the whole mod: `script/multiplayer/bot.data.lua` (351 KB, 3,831 purchase entries), running on the vanilla `bot.lua`. The companion is what replaces bot logic. Room left: bot behaviour by Lua.
- Its `combat.set` has `{enableBots}` commented out, `battle_zones.set` has it on. A patch test on combat has to override that.

## What this means for mods we write
- Patch folder beats edit in place: same reach, nothing to re-merge when the big mod updates.
- Data errors at this scale need tools, nobody finds 283 bad names by eye.
- Nothing here needs a code change, so a large content mod stays soft-code.

## Live results on as64 58826db6 (2026-11-04)
- Workshop 610304528 matches the local folder (pak sizes, file list, gamelogic.pak sha1 f15a86783d9a). The game loads the Workshop copy and logs the local one as an old copy, safe to delete. Don't delete it.
- Engine check of all 609 bot names: 283 dead, same as the static count [V].
- A match loads and runs with every army as the bot's: usa rus ger eng jap ger_ss rus_guard axis_minor ger2 [V]. Control: a bad card in the bot's army crashes at load, so the check bites [V].
- 10 entities crash the game the moment a card names them: p40, pz6e_hun, pz6e_hun_vet, fiat35_inf, fiat35_art, fiat35_bomb, m26e4_ace, type92_stan_mohpa, crate8_inf, crate8_art [V]. Causes: undefined macro, missing `ammo_ita.inc`, weapon with no stuff (null).
- No roster, map or script in the mod names those 10 (word scan of 13,675 files; hits only in `desc.lng` and `tank.inc`) [V]. Plain RobZ players don't reach them. Only a map or card added by someone else would.
- `np_sdkfz251_10`, `pz6e_hungarian`, `type94` were bought with no crash [V]. Of the two `np_sdkfz251_10.def`, the clean `btr` one seems to win [I].
- So a crash patch gives plain RobZ skirmish players nothing. Corrected 2026-11-04: the godny notes (their lines 32-46) list these as RobZ's own bugs, not cards that set added, crashing in the editor or when placed. A map maker or anyone placing those units still hits them. No single-player mission was run, so "players don't reach them" covers skirmish rosters only.
- A/B of the bot name fix, 15 min per game, one pair per army. Patch maps 714 entries with one candidate name; 1137 stay. buys/distinct, unpatched then patched: usa 7/4 v 6/4; ger 6/5 (cut at 482 s, no exception logged) v 9/5; rus 12/11 v 7/5 (cut at 501 s, out of memory). Only usa is a clean pair. No sign of a gain [I]. Rate looks unchanged: ger about 0.75 buys a minute in both arms.
- Why no gain is plausible: a dead name costs the bot nothing. `Spawn` prints not found, returns true, and the next pick follows (bot.lua OnGameQuant) [V]. Not-found lines went to 0 in the patched ger and usa arms, 20 in rus. Fewer lines in the log is all the patch shows.
- Workshop 3756666257 (AI spawn mod) already names 0 of the dead cards in its 389 bot entries [V]. Anyone who wants clean bot lists has that.
- That mod also ships MIT tools with tests (read only, none run, 2026-11-06): `check_unit_roster.py` checks `bot.data.lua` ids against the roster per faction; builders for gun ratings, sectors, aim time, unit meta, artillery roster. Overlaps botrecipe; shows how far a Lua-only bot can be generated from data. T42.
- Result: no patch for plain RobZ from either the crash half or the AI-names half. Unexplained: the ger arm stopped at 482 s with no exception logged, so one early stop has no known cause.

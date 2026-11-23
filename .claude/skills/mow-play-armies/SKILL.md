---
name: mow-play-armies
description: Army guides for a person who plays Men of War Assault Squad 2 (MoW:AS2, mowas2), its 64-bit build AS64 (as64) or Gates of Hell (GoH, goh, Call to Arms - Gates of Hell Ostfront), built from the game's own data by tools. Load when they ask "what does Germany have", "which army should I play", "USA / Soviet / British / Japanese / Finnish army guide", "what tanks can I buy", "best anti-tank gun of X", "what should I buy first", "opening build", "what to buy in the late game", "cheap answer to armour", "which army has the best artillery", "compare two armies", "what changed in this mod's army", "what can I buy for 500", early / mid / late period, doctrine roster. Numbers are always read through mow_army, mow_unit_counter and mow_matchup, never copied. Not for why a shot failed (mow-play-coach) or changing units (mow-mod-units).
---

# mow-play-armies: what each army has and what to buy when (router)
Read ONE sub-file for the question. Every number comes from a tool call made now.

## Always
1. Which game and which mod. Armies: as64 / mowas2 `usa ger rus eng jap ger2`; goh `rus ger fin eng usa`. With a mod pass `mod: "<full path of the mod folder>"`: prices and rosters change.
2. No number from memory or from this skill: `mow_army` for rosters and prices, `mow_unit_counter` for answers, `mow_matchup` for one shot, `mow_unit_stats` for one unit.
3. Say what the tool read (game, mod) with each answer. A tool that cannot serve a game answers `na` with the reason: pass that on.
4. Advice words ("good", "weak") must rest on a tool row shown to the person: price, penetration at a range, armour, cooldown.
5. GoH answers need `period` (early, mid, late); rosters also depend on `doctrine`. GH rules are not yet tried in game.

## Question -> file -> tools
| the person asks | read | tools |
|---|---|---|
| what an army has, by class | `roster-by-class.md` | `mow_army` |
| strengths and gaps of one army | `strengths-and-gaps.md` | `mow_army`, `mow_matchup` |
| which army to pick, two armies compared | `compare-armies.md` | `mow_army`, `mow_unit_counter` |
| what to buy first (opening) | `opening-buys.md` | `mow_army`, `mow_mode_info` |
| what to buy mid and late, saving for armour | `mid-and-late-buys.md` | `mow_army`, `mow_unit_counter` |
| the answer to one enemy unit from my army | `answer-an-enemy-unit.md` | `mow_unit_counter`, `mow_matchup` |
| best value under a price | `budget-picks.md` | `mow_army`, `mow_price` |
| GoH: periods and doctrine rosters | `goh-periods-doctrines.md` | `mow_army`, `mow_unit_counter` |
| an army inside a mod, what the mod changed | `army-in-a-mod.md` | `mow_army`, `mow_mod_diff` |

## Next skill
Why armour or a shell behaves so -> `mow-play-coach`. Lobby and modes -> `mow-play-multiplayer`.

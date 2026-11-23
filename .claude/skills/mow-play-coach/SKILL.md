---
name: mow-play-coach
description: Coach a person who PLAYS Men of War Assault Squad 2 (MoW:AS2, mowas2), its 64-bit build AS64 (as64) or Gates of Hell (GoH, goh, Call to Arms - Gates of Hell Ostfront). Load when they ask "can my X kill their Y", "what should I buy against Z", "what counters a Tiger", "why did my shot bounce", "why no penetration", "where is it weak", "why did HE do nothing", "why did my tank blow up", "why are my men pinned", "why is my tank slow", "how do I repair", "how do I refuel", "what does veterancy do", or how armour, penetration, range, angle, AP / APCR / HE / HEAT ammo, blast, cover, infantry kit, crew, repair, fuel and ammo supply, veterancy, manpower, special points, cooldown, head start, rank, command points or doctrines work. Not for changing data (mow-mod-*), not for crashes (mow-play-trouble), not for whole-army buy guides (mow-play-armies).
---

# mow-play-coach: unit and rule advice for a player (router)
Read ONE sub-file for the question. Rules there carry their row id and tag; read a row before quoting it: `mow_limit {ids: ["DMG-03"]}` Â Â· GoH.

## Always
1. Which game: AS64, MoW:AS2 or GoH. Not AS64 -> load `mow-games` first.
2. Which mods are on, in which order: `mow_game_status {game}`. Stats differ per mod; a vanilla number is wrong under a balance mod. No answer from the user -> answer for vanilla and say so.
3. Numbers come from tools, never from memory or from these files: `mow_matchup`, `mow_unit_armor`, `mow_unit_stats`, `mow_army`, `mow_unit_counter`. Always pass `game` and `mod`.
4. No unit or gun name -> `mow_unit_find {q}` first. Do not guess a file name.
5. Say how sure: [V] checked in game, [I] inferred, [T] needs a test match. GoH rows: "not yet tried in game".
6. Verdict first, in plain words, with the face (front, side, rear, top), the shell and a range band (`how-to-say.md`).

## Sub-task -> file -> tools
| question | read | tools |
|---|---|---|
| can gun X go through vehicle Y, at what range, from where | `can-x-kill-y.md` | `mow_matchup`, `mow_unit_armor`, `mow_unit_stats` |
| why did the shot bounce / not go through / the tank survive | `why-no-penetration.md` | `mow_matchup`, `mow_limit` |
| HE, blast, fire, ammo explosion | `he-blast-fire.md` | `mow_unit_stats`, `mow_limit` |
| what beats unit Z, what to buy against it | `what-counters.md` | `mow_unit_counter`, `mow_army` |
| infantry: morale, cover, veterancy, kit, prone, stamina | `infantry.md` | `mow_unit_stats`, `mow_limit` |
| vehicles: speed, slopes, crew, bailed tanks, MGs | `vehicles-and-crew.md` | `mow_unit_stats`, `mow_limit` |
| repair, fuel, ammo supply, capture | `repair-and-supply.md` | `mow_lookup` |
| manpower, special points, cooldown, head start, rank, limits (AS2, AS64) | `economy.md` | `mow_army`, `mow_mode_info` |
| GoH: doctrines, currencies, waves, command points, Conquest | `goh-economy-doctrine.md` | `mow_army`, `mow_limit` |
| GoH: part hit points, armour factors, cover roll, repair | `goh-damage-repair.md` | `mow_matchup`, `mow_limit` |
| what bots can and cannot do against you | `bots.md` | `mow_bots_info` |
| how to word the answer | `how-to-say.md` | - |

## Game in one line
- AS64 against MoW:AS2: same data and rules (data version 3.262); AS64 changes aiming motion and time on target, has no FPS cap and a shorter multiplayer step. [V]. Numbers from one exe hold on the other; timing feel may not.
- GoH: other formulas and systems; the armour simulator does not serve it (`mow_matchup` answers a flat comparison and says so).

## Not backed by a limits row (player manuals and community notes, [I])
Cover use, posture, crew role swap, AT team tactics, artillery use: (`mow_lookup {query: "gameplay artillery", mode: "topic"}`). Give them as advice, not as engine fact.

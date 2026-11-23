# mow-mod-test: what counts as verified, what to record

when: "is this verified", "can I call it done", before reporting any data change as working, when tagging a fact [V] / [T].

## Verified = all four, seen in ONE run
1. the mod was active: as64 `mod_list applied:true` or the mod named by the pipe; GoH log line `Mod: activate mod <x>` (GHLOG-16); mowas2: the mod in `options.set` and its content visible in the menu
2. the run reached a live match (clock running), not just the menu
3. the changed thing was exercised: the unit bought or spawned AND the changed part used (the gun fired, the armour was hit, the text was on screen, the bot bought it, the mode was won)
4. the log shows no new error line for the changed files, compared with a vanilla base (`node tools/bootcheck/bootcheck.js`; MCP `mow_game_log {}`)

## Not verified (say so, tag [T])
- `mow_mod_check` clean, wouldload `LOADS_STATIC`, gen or upgrade "static clean", portverdict "native"
- armorsim / `mow_matchup` numbers, statsheet rows, price models
- a dry run, a plan, a menu-only boot
- "it loaded once" without using the changed part
- one match of bot behaviour reported as a rule (say "once")

## Record (so the next session need not repeat it)
- date, game and exe build (`mow_game_status {}`), mod version, mod list in order
- map:mode, players, how long, what was done
- result per point 1-4, with the log line; the kept log copy
- what is left to look at by eye, as a short checklist for the user
- in this repo: a fact goes to the webs with its tag (`node tools/notes/notes.js add <area> "- what | where | how to check"`), not into a skill

## Per game
- as64: all four points can be read by tools (pipe, log)
- mowas2: point 1 from `options.set`, points 2-3 by menu routes or the user, point 4 from the log (truncated at start: copy it first)
- goh: points 1 and 4 from the log, 2-3 by routes or the user. Every is not yet tried in game: a GoH fact is [T] until a GoH run shows it

## Traps
- TST-22 a fresh as64 instance has an empty mod list: a pass on vanilla
- TST-32 a stale log scored as the new run: compare the log time
- MIS-46 a `Spawn` that returned true bought nothing: require the spawn line
- LOG-07 a clean load with a placeholder item: the crash comes on use, so use it
- MIS-01 keys skipped silently: a clean log is not proof a key was read; the effect in the match is
- restore the mod list after (`enable-mods.md`): an unrestored list is a change to the user's game

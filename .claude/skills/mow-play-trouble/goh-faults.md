# mow-play-trouble: Gates of Hell faults and codes
When: the game is GoH. All GH rows are not yet tried in game: say so. Read one: `mow_limit {game: "goh", ids: ["GHLOG-10"]}` �.

## Steps
1. `mow_game_status {game: "goh"}`, `mow_game_log {game: "goh"}`, `mow_game_crash {game: "goh"}`.
2. A mod: `mow_mod_info {game: "goh", mod: "<path>"}`, `mow_mod_check {game: "goh", mod: "<path>"}`.
CLI: `node tools/logtriage/logtriage.js --exe goh` · `node tools/modinfo/modinfo.js <mod> --exe goh` · `node tools/wouldload/wouldload.js <modDir> --exe goh`. GUI: GoH button > Mods > Check & Fix.

## Log folder
`<Documents>/My Games/Gates of Hell/log/`, or `%LOCALAPPDATA%/digitalmindsoft/gates of hell/log/` when Documents is in OneDrive or the game runs with `-useLocalDataFolder`. LOG-22 [V] GHVFS-13

## Codes (GHLOG-10)
| code | meaning |
|---|---|
| 0x0bad0003 | data error |
| 0x0bad0004 | out of memory |
| 0x0bad0006 | out of sync |
| 0x0bad0007 | DirectX |

## Faults
| sees | cause | row |
|---|---|---|
| `Resource Error` at start | a mod replaces `/set/registry.reg` or `dlc.reg` | GHVFS-14 |
| "Verify integrity of game files via steam" | a pak entry is unreadable | GHVFS-16 |
| "not up to date" in the mod list, mod dropped on exit | `mod.info` range not holding the GoH version (1.x scale) | PORT-46 [V] |
| an AS2 mod will not load | 3.x ranges are refused; data layout differs | PORT-43 PORT-50 |
| only part of a mod loads | GoH mounts only `resource/`, `N.pat`, `localizations/` | GHVFS-04 |
| log floods, slow reads | pak without real checksums | GHVFS-18 |
| warning about an empty or duplicate mod folder | GoH logs it (the AS2 exes do not) | LOG-21 |
| missing text | a missing key is logged once | GHLOC-02 |
| dropped from a match | no separate sync check job; a leaver's units go to team mates | GHNET-69 GHNET-80 |
| old campaign save behaves oddly | saves below a version are upgraded on load | GHCQ-30 |
| save refuses to load | `.sav` loading checks version, map and mods | GHNET-07 GHNET-04 |

## Against AS2 / AS64
Do not carry an AS2 fix to GoH: other mount list, other version scale, other text files, no Classic / Enhanced modes.

## What goes wrong
- the armour simulator, `as2 install` and live test runs refuse GoH: that is by design, not the fault.
- a GH row quoted as tested: none was run in game.

## Check
`mow_game_log {game: "goh"}` shows `Mod: activate mod <folder>` and no 0x0bad line.

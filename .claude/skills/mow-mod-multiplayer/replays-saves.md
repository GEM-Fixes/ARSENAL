# mow-mod-multiplayer: replays and saves with a mod

when: "replay does not play", "replay goes wrong halfway", "Required mods are unmached", "Invalid version", "old replays after a mod update", "save a multiplayer game", "where are replays", "save breaks after I changed my mod".
G = game install, `<mod>` = the user's mod folder (full path). MCP `game` = `as64|mowas2|goh`.
A player's how-to for watching → skill `mow-play-singleplayer`.

## Steps
1. where the profile and replay folders are: MCP `mow_settings_info {what:"profile"}`
2. the rules: MCP `mow_lookup {query:"net/replay", mode:"topic"}`; saves: `{query:"net/save", mode:"topic"}`
3. rows: MCP `mow_limit {ids:["NET-06","NET-07","NET-11","NET-16"]}`
4. is today's data the data of the replay: compare fingerprints, MCP `mow_mp_sync {action:"compare", a:"<then>.json", b:"<now>.json"}` (only if an export was kept at release → skill `mow-mod-share`)
5. the log after a failed replay: MCP `mow_game_log {}`

## Facts
- every client records each multiplayer match: `<profile>/replays/replayN/replayN.qm` + `.ss`, N cycling 1..5; "Save Replay" copies both under a new name
- `.ss` is the session card as text (version, mods, map, teams, the data hash of that day); `.qm` is the stream of steps and commands
- a replay holds COMMANDS, not states: playing it re-runs the whole match on today's data, from the start, with no seek
- saves: `<profile>/save/<name>/` with `status` (game version, mission origin, mods), `map.scn`, `mission.scn`, `game.scn`; single player only
- loading a save uses the CURRENT defs: entity states are applied onto today's data

## Per game
- as64 / mowas2: as above
- goh: replay and save files have their own layout; not read here. · `-k save` [I]

## Silently fails
- NET-06 a replay on changed data diverges without a message: units do other things, the result differs. keep the mod version of a replay
- NET-16 `.rec` replays abort on a version or mod mismatch: `Invalid version!`, `Required mods are unmached!`
- NET-06 only 5 automatic slots: the sixth match overwrites the first; save a replay that matters
- NET-11 step lengths above 255 ms are cut in the record
- NET-07 no multiplayer save; a single-player save loaded after a def change may drop or alter entities
- a replay of a match that desynced replays one machine's view only

## What this means for a mod release
- name the version in `mod.info` and keep each released build: old replays and saves need the build they were made with
- a balance patch invalidates every earlier replay; say so in the release note (→ skill `mow-mod-share`)

## Verify
- record a short match, save the replay, play it back on unchanged data: same result; change one unit value and play it again to see the divergence the user asked about

# mow-mod-multiplayer: what desyncs and how to read an out-of-sync

when: "out of sync", "desync", "OOS with my mod", "players get kicked mid game", "is this change multiplayer safe", "can a texture mod desync", "client-side mod", "Desync detected on quant", "cheater message".
G = game install, `<mod>` = the user's mod folder (full path). MCP `game` = `as64|mowas2|goh`.

## Steps
1. which files of the mod the lobby compares: MCP `mow_mp_sync {action:"mod", mod:"<mod>"}`
   CLI `node tools/mpsync/mpsync.js --mod <dir> [--game G] [--exe as64|mowas_2|mowas2|goh] [-q]` (S = content compared, Z = size only, X = not compared)
2. two players, same files?: each runs MCP `mow_mp_sync {action:"export", mods:["<mod>"], out:"<file>.json", write:true}`, then `mow_mp_sync {action:"compare", a:"<a>.json", b:"<b>.json"}`
   CLI `node tools/mpsync/mpsync.js --game <G> --mods a,b --export fp.json` · `--compare a.json b.json`
3. after an out-of-sync: MCP `mow_game_log {}` (lines `Desync detected on quant N`, `by client #id`, the SyncTable dump); the host has `log/oos/<date>/`
4. scripts that break sync: MCP `mow_script_lint {mod:"<mod>"}` (→ skill `mow-mod-scripts` `sync-safe-scripts.md`)
5. the rules in full: MCP `mow_lookup {query:"net/rules", mode:"topic"}`; `{query:"net/sync", mode:"topic"}`

## Facts
- lockstep: every machine runs the whole simulation; only commands cross the network. any difference in data or in the order of random draws grows into a different game
- once a second each client hashes its world; the host compares. world hash differs = desynced; world equal but rules hash differs (budgets, CP, limits, cooldown factors) = desynced and marked cheater
- there is no live resync: the game pauses, desynced clients are removed
- the lobby check covers `/entity /fx /properties /set /sound` and maps. content is compared for `.set .inc .ext .def .mdl .mi .reg .info` and `/set/*`; `.ply .vol .mtl .anm .lua .pat` by BYTE SIZE only
- not compared at all: `/script/`, `/interface/`, `/texture/`, `.dds .tga .wav .lng`: texture, sound, text and interface mods are client-side safe
- safe to differ: graphics options, language, key bindings
- not safe: anything the simulation reads: unit data, weapons, volumes, animations with events, interaction scripts, mission files, presets

## Per game
- as64 / mowas2: as above; the two builds can not play together (NET-13)
- goh: no checksum desync check: the host's own client runs each step first and some state is sent by the host (GHNET-69, GHNET-93). a data difference shows as odd behaviour rather than a kick [I]. mpsync for goh is [I]

## Silently fails
- NET-01 a same-size edit of a `.ply .vol .anm .lua` passes the lobby and desyncs in play: change a text file or the mod folder name with it
- NET-02 one extra or missing random draw on one machine shifts every later roll
- NET-14 the `selected` flag is hashed: scripts must not act on local selection
- NET-03 weapon state, inventory and many AI fields are not hashed: a divergence can stay hidden for minutes, so the reported moment is not the cause
- INT-10 / NET-08 script flags set from local state
- NET-09 `mp_allowDesync` only gates joining; it can not keep a diverged game running
- NET-12 scripts must not assume a step length (20 to 65 ms)
- different mod ORDER with the same mods is different data

## Verify
- `mow_mp_sync compare` of two exports says no difference; a full match on two machines (or two as64 instances → `test-multiplayer.md` in this skill) ends without `Desync detected` in either log

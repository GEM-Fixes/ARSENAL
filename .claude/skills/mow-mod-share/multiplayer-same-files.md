# mow-mod-share: do two players have the same files

when: "out of sync with my friend", "different version", "do we have the same mod files", before a multiplayer session with a mod.
G = AS2 install, `<mod>` = mod folder. Each player runs the export on their own PC; only the small fingerprint file travels, and sending it is the user's act.

## Steps
1. what the lobby would and would not catch in this mod: MCP `mow_mp_sync {mod:"<mod>"}` (action mod, the default) → per file class: content CRC / size only / not compared
   CLI `node tools/mpsync/mpsync.js --mod <dir>`
2. fingerprint on each PC: MCP `mow_mp_sync {action:"export", mods:["<modname>"], out:"<folder>/fp_a.json", write:true}`
   CLI `node tools/mpsync/mpsync.js --game G [--mods a,b] [--exe as64|mowas_2|mowas2|goh] --export fp.json`
3. compare: MCP `mow_mp_sync {action:"compare", a:"fp_a.json", b:"fp_b.json"}` · CLI `node tools/mpsync/mpsync.js --compare a.json b.json` → the files that differ and whether the lobby sees them (MPSYNC_EXE_DIFF when the games differ)
4. after a desync in play: MCP `mow_game_crash {}` reads the out-of-sync report (`log/oos/`)
5. GUI: Share tab > `share` page, play together step (`share/clashmp`)

## Facts
- NET-01 the lobby compares `.ply .vol .mtl .anm .lua .pat` by byte size only; `/script /interface /texture` and `.dds .tga .wav .ebm .lng` not at all
- KEY-24 compared by content: `.set .inc .ext .mi .reg .info .def .mdl`
- VFS-29 everything under `/entity /fx /properties /set /sound /map /script/multiplayer` must match across players; interface paks are exempt
- NET-13 different game builds can not play together at all
- NET-04 there is no live resync: a desynced client is removed

## Per game
- as64 and mowas2 share the rules; an as64 player and a MoW:AS2 player can not meet (NET-13)
- goh: same rules inferred, not measured ([I]); GoH handles out-of-sync differently (GHNET-69):

## Silently fails
- a same-size edit of a size-only file passes the lobby and desyncs in play: when shipping such a fix, change a text file too, so the lobby refuses the old copy
- UI-05 action ids are assigned in creation order: a different `interface/action` set between players breaks MP though interface paks are exempt from the CRC
- NET-06 a replay needs the same data and mods: after an update old replays diverge silently
- mod ORDER matters as much as content: same files, other order = other winning files (`mod-list-for-friends.md`)

## Verify
- compare answers "no differences" for both players, the lobby lets both in, and a full match ends without an out-of-sync report

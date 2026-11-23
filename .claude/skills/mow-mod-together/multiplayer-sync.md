# mow-mod-together: multiplayer with a mod stack

when: the stack is to be played online or on LAN, or players get "out of sync" / "different version" with "the same mods".

## Steps
1. rule first: every player needs the same mods, the patch mod too, in the same order, on the same game build
2. which files of a mod the lobby really compares: MCP `mow_mp_sync` (`action: mod` (default), `mod` = full path, `game`): by content, by size only, or not at all
   CLI `node tools/mpsync/mpsync.js --mod <dir> [--game G] [--exe as64|mowas_2|mowas2|goh] [-q]` → classes S (synced, content CRC) · Z (synced, byte size only) · X (not in the lobby tree)
3. fingerprint per player: MCP `mow_mp_sync` (`action: export`, `mods` in load order, `out` = full path of a .json, `write: true`)
   CLI `node tools/mpsync/mpsync.js --game G [--mods a,b,patch] [--exe ..] --export fp.json`. Each player makes one and sends the file
4. compare two: MCP `mow_mp_sync` (`action: compare`, `a`, `b`) · CLI `node tools/mpsync/mpsync.js --compare a.json b.json [-q]`
   codes: MPSYNC_DETECTED (the lobby sees it) · WARN_MPSYNC_SILENT (differs, the lobby does not see it: desync in play) · MPSYNC_ONLY_IN_A / _B · MPSYNC_EXCLUDED_DIFF (info) · MPSYNC_EXE_DIFF (two different games)
5. GUI: Share tab > Share page > Mods together, "playing online" (`gui_call` `POST /api/x/share/clashmp` `{mods, patch?}`: per mod and for the patch which files are compared by length only, and the action-set note)
6. hand the stack over as one thing: pack and mod list → skill `mow-mod-share`

## Facts
- lobby data CRC: `.ply .vol .mtl .anm .lua .pat` are compared by byte size only; `/script /interface /texture` and `.dds .tga .wav .ebm .lng` not at all (NET-01 [V])
- different build CRC or version = can not play together, `txt_exedesync` (NET-13 [V])
- in play there is no live resync: desynced clients are removed, a snapshot goes to `log/oos/` for diagnosis only (NET-04 [V])
- the game log says `Desync detected on quant N` with a SyncTable dump
- a replay needs the same data and mods; mismatch aborts with `Required mods are unmached!` (NET-16 [V])

## Per game
| game | note |
|---|---|
| as64 | Classic and Enhanced players can not share a list; all need the same mode (VFS-48). a subscribed Workshop item loads in place from the Steam folder, a `mods/` copy of it is ignored (VFS-51): one player on the Workshop copy and one on a hand copy can differ |
| mowas2 | `--exe mowas_2`; the Workshop copy under mods/ is recreated clean (VFS-31) |
| goh | same folders, filters and mask rules inferred, not measured [I]; GoH adds `*.anm` to the content masks [V data]; leaver handling differs (GHNET-80) |

## Silent fails
- NET-01 a same-size edit of a size-only file passes the lobby and desyncs in play; when a patch changes a binary, change a text file with it
- a patch mod only one player has: the lobby may pass (texts, textures are not compared), the match desyncs or shows other names
- VFS-15 two independent mods with no Require can load in another order on another PC: same files, other winner. the patch's Require fixes that for the files it holds
- a mod with files in `resource/interface/action` changes the action ids: all players need the same set (UI-05 [T])
- NET-02 scripts that draw from the shared RNG on local state desync whatever the files; see skill mow-mod-scripts

## Verify
- compare of two players' fingerprints: no WARN_MPSYNC_SILENT, no MPSYNC_ONLY_IN_*
- a LAN or two-instance match with the full stack runs several minutes with units of both mods and no `Desync detected` in game.log (→ skill `mow-mod-test`; a player's desync: skill `mow-play-trouble`)

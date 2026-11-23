# mow-play-multiplayer: play with mods
When: "everyone needs the same mods", "how do we make sure", "send my mod list to friends".

## Steps
1. Each player: `mow_game_status {game: "as64"}` -> build, mods, order.
2. Each player exports: `mow_mp_sync {game: "as64", action: "export", mods: ["a", "b"], out: "<full path>/me.json", write: true}` and sends the file.
3. One compares: `mow_mp_sync {game: "as64", action: "compare", a: "<a.json>", b: "<b.json>"}` -> files that differ, and whether the lobby would notice.
4. Same list and order on a friend's PC: `mow_mods_enable {game: "as64", mods: ["a", "b"], dry: true}` (launch kind without `dry`: game closed, user's yes).
5. What the lobby checks in one mod: `mow_mp_sync {game: "as64", action: "mod", mod: "<path>"}`.
CLI: `node tools/mpsync/mpsync.js --game <dir> --mods a,b --exe <game> --export me.json` · `--compare a.json b.json` · list to a friend: `node tools/modswitch/modswitch.js --game <dir> --exe <game> --export f.json`, friend `--import f.json`.
GUI: Test, Share & Play > Share > Play together.

## Rules
- the lobby compares `.ply .vol .mtl .anm .lua .pat` by size only, and `/script`, `/interface`, `/texture`, `.dds .tga .wav .ebm .lng` not at all. NET-01 [V]
- a difference the lobby misses still desyncs in play; there is no resync. NET-04 [V]
- order counts: a later mod replaces whole files of an earlier one. VFS-15 [V]
- Workshop mods update per PC: all restart Steam before the match.
- AS64: a subscribed Workshop item wins over a copy in `mods/` (LOG-17); all Classic or all Enhanced.

## Per game
- MoW:AS2: same rules; a 3.301 mod is off there.
- GoH: no separate sync job (GHNET-69); the same advice holds: equal mods, equal order.

## What goes wrong
- one player hand-edited a file "just for looks": text and textures are not compared but scripts and data desync.
- same mod name, other version.
- comparing only names, not contents.

## Check
`mow_mp_sync` compare lists no difference; a full match without a drop.

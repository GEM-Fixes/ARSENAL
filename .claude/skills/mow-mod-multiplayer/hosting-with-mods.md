# mow-mod-multiplayer: host and join with mods

when: "host a game with my mod", "friend can not join", "version mismatch", "everyone needs the same mod", "does the client need the mod", "mod order for multiplayer", "server with mods", "rejoin", "host left".
G = game install, `<mod>` = the user's mod folder (full path). MCP `game` = `as64|mowas2|goh`.
A player's how-to (ports, LAN, Internet) → skill `mow-play-multiplayer`. Shipping the mod → skill `mow-mod-share`.

## Steps
1. does the mod touch synced data at all: MCP `mow_mp_sync {action:"mod", mod:"<mod>"}` (only S and Z files matter to other players)
2. a fingerprint to send to every player: MCP `mow_mp_sync {action:"export", mods:["<mod a>","<mod b>"], out:"<file>.json", write:true}`; each compares: `{action:"compare", a:"<host>.json", b:"<mine>.json"}`
   CLI `node tools/mpsync/mpsync.js --game <G> --mods a,b --export fp.json` · `--compare a.json b.json [-q]`
3. same mods in the same order on every machine: MCP `mow_mods_enable {mods:["<a>","<b>"], dry:true}` shows the order that would be written; without `dry` it writes the profile (as64 / mowas2: game closed)
4. version window of the mod: `mod.info` `MinGameVersion` / `MaxGameVersion` (→ skill `mow-mod-share` `mod-info-for-release.md`)
5. host, then read the log after the match: MCP `mow_game_log {}`

## Facts
- the host's session card carries the mod list, map, mode, preset, unit set and cooldown factors; a joiner is checked against the data hash of game files and of maps
- the hash is built from the MERGED file view: game + active mods in order. same mods, other order = other hash
- the build is part of the hash: other game version or other exe = no join (`txt_exedesync`)
- a mod that changes a synced file is marked as affecting sync (`*` in the mod list); one that changes only textures, sounds, texts or interface is not, and may differ between players
- bots run on the HOST as extra clients; bot Lua (`/script/`) is not compared, only the host's copy runs
- the host relays and times every command: the slowest machine sets the pace

## Per game
- as64: `-instance N` runs a second copy on one PC with its own profile and port (TST-22); as64 and mowas2 players can not meet (NET-13)
- mowas2: Workshop items must be the same version on every machine; no control commands (TST-28)
- goh: mods are picked in the lobby flow and items download from the Workshop; the card differs (GHNET-30); no checksum kick in play (GHNET-69)

## Silently fails
- NET-05 no host migration: the host quits, the match ends for all; a leaver's units go to the host
- NET-15 nobody new can join a running match (a returning member may, on as64)
- NET-01 size-only files: an edited model or animation of equal size joins fine and desyncs later
- a mod active on one side that touches only unsynced files is invisible to the lobby: fine, unless it also changes `/set/`
- TST-22 a fresh instance profile has an empty mod list: mods are listed but not mounted until enabled there
- NET-21 joining a local instance by `127.0.0.1` never lists the session: use the adapter address
- two mods that both replace a presets or units file: the later one wins whole (→ skill `mow-mod-together`)

## Verify
- `mow_mp_sync compare` clean for every player; a joined match played to the end; neither log has `Desync detected` or a version line (→ skill `mow-mod-test`)

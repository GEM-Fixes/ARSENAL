# mow-mod-port: an AS2 mod into Gates of Hell

when: "convert my Assault Squad 2 mod to Gates of Hell", "AS2 unit in GoH", "my AS2 weapon loads in GoH but does not fire".
G = AS2 install, H = GoH install, `<out>` = result folder outside both installs. Every converter code here is WARN_ [T]: nothing of this has a long record in a running GoH.

## Steps
1. what must change: `node tools/modmove/modmove.js static <mod> --from as64 --to goh` (or `--from mowas2`)
2. plan: MCP `mow_port_plan {game:"goh", mod:"<mod>", from:"as64"}`
3. converted copy: MCP `mow_mod_upgrade {game:"goh", mod:"<mod>", out:"<out>", from:"as64"}` (preview; `write:true` writes and checks again)
   CLI `node tools/upgrade/upgrade.js <modDir> --to goh [--from g[@sha]] (--plan [--out dir] | --out dir) [--goh-version V] [--as2 G] [--goh H]`
   does: mod.info for GoH, encoding (cp1251 → UTF-8), include renames, `.lng` → `.pot`, as2togoh on entities; block rows list what it leaves out (DLL, `map.net` folders)
4. the converter alone: `node tools/as2togoh/as2togoh.js <modDir> --out <dir> [--dry] [--goh <GoH root>] [--donor <name>] [-q] [--json f]` (weapon include, foresight bones, head sets, vehicle def from a GoH donor of the same class folder)
5. check for GoH: MCP `mow_mod_check {game:"goh", mod:"<out>"}` · CLI `node tools/check/check.js <out> --exe goh --goh H`
6. run in GoH: by the user, or recorded menu routes (MCP `mow_game_routes {game:"goh"}`, `mow_game_drive`; → skill `mow-mod-test`, `start-mowas2-goh.md`)

## Facts
- GoH reads text from `localizations/` `.pot`; mod.info range must hold the GoH exe version (Min=Max 1.067 at the time of the row), with Tags
- GoH has systems AS2 lacks (doctrines on cards, research, conquest): an AS2 card converts to a plain card

## Per game
- source mowas2 or as64: same converter; as64-only keys (`as64/core`) are named in the plan
- goh: only upgrade / as2togoh write GoH forms; goh2as2, portfix, portlint, portasset, portverdict, donorpick, donorfit, mapscen refuse `--exe goh`

## Silently fails
- PORT-37 an AS2 weapon in GoH loads and will not fire until the include and the foresight bone are the GoH ones
- PORT-46 GoH refuses a mod whose range does not hold the exe version ("not up to date", can not be activated); the template range 1.500-1.510 is refused
- GHVFS-14 a mod replacing `/set/registry.reg` or `/set/registry/dlc.reg` stops GoH at start with `Resource Error`
- GHMAP-06 an AS2 `map.net` (cell 10) is not a GoH map: maps are left out
- GHHUM-07 GoH veterancy has 8 ranks; AS2 data stops at 5

## Verify
- GoH log line `Mod: activate mod <x>` (GHLOG-16), the unit is in the buy menu, spawns, moves, fires; log read with `mow_game_log {game:"goh"}`. Until then every result is static

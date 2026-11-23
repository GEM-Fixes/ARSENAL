---
name: mow-mod-port
description: Port units, maps or whole mods between Gates of Hell (goh) and Men of War Assault Squad 2 (mowas2) or AS64 (as64), either way. Load when the user says "port a GoH unit to AS2", "tank from Gates of Hell into Assault Squad", "convert my AS2 mod to Gates of Hell", "GoH to AS2", "AS2 to GoH", "Call to Arms model in Men of War", "ported unit crashes", "ported unit does not move or fire", "ported tank has no crew", "pink or checkered textures after porting", "port a map", "port icons", "which donor unit", "move my mod to another game", "old mod on the 64-bit build", "port many units at once".
---

# mow-mod-port: GoH to AS2 and back (router)

game word: MCP `game` = `as64|mowas2|goh` (the TARGET for `mow_port_plan` / `mow_mod_upgrade`) · CLI `--exe as64|mowas_2|mowas2` on the AS2 side (most port tools refuse `goh` as a target, exit 2). G = AS2 install, H = GoH install, `<out>` = the mod folder the user named for the result.
Unsure which game a mod is for → skill `mow-games` first. All GoH to as64 history:

## Always
- both installs read-only; the source mod is never written. output goes only into `<out>` (every port tool refuses `--out` inside an install)
- output text CRLF, strings UTF-8, identifiers ASCII (AS2 side, lim PORT-15); GoH side UTF-8
- assets of another game copied into a mod are for local use: the packer's GoH guard keeps them out of a release. tell the user, do not work around it
- every port verdict is static: a ported unit is done only after it spawned, moved, fired and took a hit in game and game.log was read (→ skill `mow-mod-test`)
- read ONE sub-file for the task; each stands alone

## Sub-tasks
| sub-task | file | tools |
|---|---|---|
| one GoH unit into AS2 / as64: plan and convert | `goh-unit-to-as2.md` | `mow_port_plan`, goh2as2 |
| build it on a vanilla donor unit | `donor-route.md` | donorpick, donorfit, goh2as2 `--donor` |
| repair, lint and judge the ported tree | `repair-and-lint.md` | portfix, portlint, portasset, portverdict |
| ported unit crashes, does not move or fire | `ported-unit-crashes.md` | `mow_game_log`, portfix, defcheck |
| many units, icons and portraits | `many-units-and-art.md` | unitmod, artport, unitname |
| GoH map into as64 | `goh-map-to-as64.md` | mapport, mapscen |
| AS2 mod into GoH | `as2-mod-to-goh.md` | `mow_mod_upgrade`, as2togoh |
| MoW:AS2 mod onto AS64 (or back) | `move-between-builds.md` | `mow_port_plan`, `mow_mod_upgrade` |

## Across
- what differs between the games, key by key → skill `mow-games`; `mow_game_diff {game:"as64", other:"goh"}`
- model files, textures, volumes themselves → skill `mow-mod-models-effects`
- the check and fix kit for any mod → skill `mow-mod-check-fix`

## Depth
- key by key: `node tools/q/q.js -g <key|fn>` (does the as64 exe read it) � (what GoH does with it; not yet tried in game)
- guide: p12-unit-from-gates-of-hell, p13-old-mod-to-64-bit ·

## Tell the user
- route taken (converted def or donor, which donor and why), files written in `<out>`
- what was dropped or changed in value, what could not be converted
- static verdict per unit, and separately what was seen in game
- that copied game assets are for local use and are held back from a release pack

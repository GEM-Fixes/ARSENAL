---
name: mow-mod-share
description: Pack and release a mod for Men of War Assault Squad 2 (mowas2), AS64 (as64) or Gates of Hell (goh). Load when the user says "pack my mod", "make a pak", "pak files", "release", "publish", "release checklist", "upload to the Workshop", "Steam Workshop", "workshop uploader", "update my workshop item", "send my mod to a friend", "zip my mod", "play my mod in multiplayer", "out of sync with my friend", "do we have the same files", "mod list for my friends", "same load order", "which game version does my mod need", "mod.info version for release".
---

# mow-mod-share: pack, release check, multiplayer file sync, Workshop (router)

game word: MCP `game` = `as64|mowas2|goh` · CLI `--exe as64|mowas_2|goh`. G = AS2 install, H = GoH install, `<mod>` = the user's mod folder.

## Always
- game installs read-only; paks go to a folder the user names, never inside an install (packer refuses); the loose source stays as it is
- uploading, publishing or sending anything is the user's act: prepare, show what would go out, and stop. no network call from here, no Steam login, no account details
- assets taken from another game (GoH models in an AS2 mod) are held back by the packer's GoH guard: do not work around it, tell the user
- release only what ran: the test run comes before the pack (→ skill `mow-mod-test`), and the packed copy is run once more
- nothing about the user (name, paths, ids) goes into mod.info, readme or pak names unless they ask
- read ONE sub-file for the task; each stands alone

## Sub-tasks
| sub-task | file | tools |
|---|---|---|
| release check before anything goes out | `release-check.md` | `mow_mod_check`, doctor `--release` |
| mod.info range and name for the target game | `mod-info-for-release.md` | `mow_mod_info`, modinfo |
| pack into paks, run the packed copy | `pack.md` | `mow_mod_pack`, packer, build |
| do two players have the same files | `multiplayer-same-files.md` | `mow_mp_sync`, mpsync |
| same mod list and order for friends | `mod-list-for-friends.md` | modswitch export / import |
| Steam Workshop upload | `workshop.md` | workshop |

## Across
- what the lobby compares and what desyncs in play, in depth → skill `mow-mod-multiplayer` (`what-desyncs.md`, `hosting-with-mods.md`)
- several mods at once, patch mod → skill `mow-mod-together`
- through the GUI window: Share tab > `share` page (tell friends, check, package, play together, Workshop step) → skill `arsenal-gui-use`

## Depth
- limits VFS (66 rows), NET · GoH:
- guide: 20-packaging-and-release, p15-pack-and-share, 04-vfs-paks-patches (MCP `mow_guide {chapter:"p15"}`)

## Tell the user
- what is in the release folder: paks by role with sizes, mod.info range, what was left out and why
- release check result, and that the packed copy was (or was not yet) run in game
- for multiplayer: what every player needs (same build, same mods, same order) and which files the lobby will not catch
- the upload itself is theirs to do: where the uploader is and which folder to point it at

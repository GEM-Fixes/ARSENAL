# RobZ 1.30.10 -> as64 upgrade, stage 1 (plan only)

Session UPG-3. Nothing written to the game folder; `mods/robz realism mod 1.30.10` stayed read-only, `mods/robz130_as64` does not exist yet. Scratch: `../run/sessions/w2/UPG-3/` ( is empty, the tool printed its plan to stdout only; x.js = size script).

## Sizes [V measured, outcome I]
- NEW on disk: about 3.33 MB. Loose files copied: 3,323,309 B in 72 files (localization/ 1,324,192; two csv logs 1,955,753; tings to do.txt 33,830; .patch 8,559; small txt 727; mod.info 248 which is rewritten, smaller). Plus UPGRADE.md ~5 KB [I, Valour's was 5,063 B]. NTFS rounds each file up to a cluster.
- HARDLINKED: 4,444,474,318 B (4238.5 MiB) in 8 archives: entity.pak 1,404,388,226; map.pak 1,349,479,220; texture.pak 1,213,136,440; sound.pak 347,219,952; music.pak 82,505,289; interface.pak 46,119,808; gamelogic.pak 1,624,254; 1.pat 1,129. [I] `linkSync` works on same-volume NTFS F: (it did for Valour); if a link fails the writer silently copies and the new size would be 4.14 GiB. Stage 2 output must read "8 hardlinked".
- Source total 4,447,797,627 B.

## What the plan keeps, changes, drops [V, tool output]
- Read: 72 loose files, 8 paks, 97,782 entries, 622 s (long: entity/map/texture are big). Verdict "partial, untested" (plain), "static clean, untested" with `--mode enhanced`.
- KEEPS: all 8 archives byte for byte ("0 rebuilt, 8 copied"), all 72 loose files, pat order.
- CHANGES (2 rows, both mod.info): Min 3.262 -> 3.301; MaxGameVersion 3.262 removed; FileId "610304528" removed so the copy does not claim the Workshop item. Name/Desc unchanged.
- DROPS: nothing ("LEFT OUT OF THE COPY: nothing").
- CAN'T: 1 Lua (`script/multiplayer/bot.data.lua` in gamelogic.pak) not read or converted.
- No text conversion rows exist for mowas2 as64, so no pak content changes; fixer warnings: none.

## Paks read of paks found
- Found: 8 archives (7 `.pak` + `1.pat`). Tool says "7 pak(s) read" in the plain plan, and the READ line says 8 paks with 97,782 entries. [I] the 7 counts `.pak` only and `1.pat` is the 8th; not verified, which one if any is unread is not named by the tool.
- TF-3 modmove temp clash: WARN_MOVE_PAKS_UNREAD does NOT appear in this plan, no EEXIST text in the output. So the clash did not recur here [V from output]. Not tested with a second session running at once.

## Stage 2 command (do not run now)
```
node tools/upgrade/upgrade.js "<game folder>/mods/robz realism mod 1.30.10" --to as64 --mode enhanced --out "<game folder>/mods/robz130_as64" --json ../run/sessions/<id>/robz130-write.json
```
No `--no-link`, `--carry`, `--then-fix`, `--only`, `--drop`. Expect ~10+ min (read pass alone 622 s) [I]. `--out` must be absent/empty (target absent now [I: not listed in mods/ at session start, V]).

## 5 sampled source files, sha256 (compare in BOTH source and target after stage 2) [V]
```
fb209f24fb6d41511bf3328db77ba65a59dcfd9d69baaccd369bcdccc1c371cb  .patch
c5437bab83da6f0f777161ae3dafc3fca58931be4f681c16aa0e865404086832  1.pat
03f507158251b1b732ac9d0ac1d0dc5444d45a7e38385f99531ecc6548776b2e  resource/gamelogic.pak
2fa49f1ce90511ea70045b0a4a21f8b8885dd30a400843a5407ee71c71da3b41  resource/interface.pak
7ac57baf04d26814d604077f46ce393083b711b2020281c0afd41d0eaf3c7012  mod.info   (source only; target differs by design)
```
Also check target mod.info shows Min 3.301, no Max, no FileId.

## WARNs, ranked by what they'd break
Static check codes (NEEDS A LOOK):
1. WARN_MOVE_LOCCOVER_LOC_FILE_REPLACED x5 [I]: localization/ files replace vanilla .lng wholesale; e.g. `#dlg_frontend.lng` drops 3 of 1038 vanilla keys. Shows as raw keys / missing text in UI. Does not crash.
2. WARN_MOVE_KEY_NOT_IN_DEST_EXE x3 [I]: e.g. `set/vision/vision_generic.inc` key `{firing}` (x29) is a string in the mowas2 exe not in as64 exe; strings are not proof of use. May silently change vision behaviour.
Behaviour warnings (from commit log, none run):
3. switch-bug x360 [I]: mission `{"switch"` runs every case + default on builds before 3e19680e (e.g. multi/1v1_bastogne_town battle_zones.mi:397, combat.mi:235; remix 383). Would break exclusive menus and pool picks on those maps. Target build 58826db6, so whether it applies is [T].
4. bot-lua x1 [V]: a Lua error in bot.data.lua no longer aborts, bot goes idle; a broken script passes unseen. Test: skirmish with bots, grep log for "Lua call failed".
5. anm-blend x356 [V]: mesh-frame .anm blended each quant (e.g. btr/csaba39m body_r, doorleft, open); visual only.
6. Notes (16): mode-filter, mp-modset, exe-crc (MP needs the same exe on both ends), save-format (3.262 saves may not load), quant-step, aim-ik-all, others in tool output.
Sibling mods in `mods/` (`robz 1.31.0`, `... godny implementation`, `ai spawn improved for robz 1.30.x`, `610304528`) are not part of this plan; Workshop-place/name clash with `610304528` is [T], the new folder keeps the display name "Robz Realism mod 1.30.10".

## Before count on the source mod
`check.js <src mod> --exe as64` was NOT run: the call needed approval and was not given. Before count = the plan's own static check: WARN_MOVE_LOCCOVER_LOC_FILE_REPLACED 5, WARN_MOVE_KEY_NOT_IN_DEST_EXE 3 (5 -> 5, 3 -> 3 after the dry-run enhanced write) [V]. A full `check` count is still owed.

## Can't be known without the game [T]
- Whether Enhanced mounts the mod and logs `Mod: activate mod`; which same-named folder loads.
- Whether the 3.262-era data (entity.pak, 1.4 GB) loads without errors on build 58826db6; preload sweep and one map load.
- Whether the switch-bug, anm-blend, vision `{firing}` changes alter play; whether old saves load; MP desync with other players.
- Whether links survive a Steam verify of the Workshop item (the 610304528 original) — in-place patching would edit both names [T].
- Which pak, if any, is unread (see above); static findings do not cover it.

## Not checked
No game or editor run. `.patch` content not opened. F: filesystem type assumed NTFS from the Valour run. Entry-level content of paks not inspected beyond the tool's output.

## Stage 2, written 2026-11-06 [V tool output + sha256]
`mods/robz130_as64`: "8 hardlinked" (4238.6 MB not copied). All four samples match the source hashes; source `mod.info` unchanged (7ac57baf...). Min 3.301, no Max, no FileId, no `robzbot.dll`. VERDICT static clean, untested: 3 behaviour warnings, 16 notes. `mod.info` closes with `\t\t}` after the removed line: cosmetic. Boot [T].

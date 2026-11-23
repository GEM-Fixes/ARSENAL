New bytes on disk: about 945 KB (jpg 926,584 + readme 9,473 + mod.info ~0.4 KB + UPGRADE.md ~8 KB) [I]. Hardlinked: 18,347,604 B = 17.5 MiB (3 paks) [V sizes, I outcome].
The folder is NOT 9 paks / 4.3 GB: mods/godnymod has 3 paks, 6 files, 19,284,108 B (18.4 MiB) [V]. Plan time 5 m 47 s wall (98 s read + dry run + checks), so it is not pak copying [V].

# GodnyMod (mods/godnymod) -> as64 upgrade plan, stage 1 (UPG-2)

Nothing was written to the game folder. Scratch: `../run/sessions/w2/UPG-2/`. Pattern: Mod "GodnyMod" by Igetfer, FileId 2946847596, mod.info Min/Max 3.262.1 (legacy) [V].

## 1. Plan: keep, change, drop [V, run]
- Source: 3 loose files (mod.info 447 B, readme.txt 9,473 B, godnymod_main.jpg 926,584 B) and 3 paks with 3,742 entries: localization.pak 75,776 B, resource/modpak.pak 3,270,877 B, resource/entity/entity.pak 15,000,951 B.
- Keeps: all 3 paks byte for byte ("0 rebuilt, 3 copied byte for byte"), readme, jpg.
- Changes: mod.info only. Min 3.262.1 -> 3.301, MaxGameVersion removed, FileId removed ("a copy must not claim the original item").
- Drops: nothing ("LEFT OUT OF THE COPY: nothing"). CAN'T: nothing found. No text-conversion rule exists for mowas2 as64, so no pak entry changes.
- Verdict: plain plan "untested"; with enhanced "static clean, untested".

## 2. Paks read [V]
3 of 3 paks read, 3,742 entries; none unread. The WARN_MOVE_PAKS_UNREAD gap from Valour (modmove temp-extract `EEXIST` clash) did not appear, so the TF-3 fix holds here. Not proof for 115 paks: this is only 3 paks and the Valour clash may need the larger count [I].

## 3. Disk size [V sizes, I link outcome]
| | bytes |
|---|---|
| source total | 19,284,108 |
| hardlinked, 3 paks (if `linkSync` works; F: was NTFS for Valour) | 18,347,604 |
| copied: godnymod_main.jpg | 926,584 |
| copied: readme.txt | 9,473 |
| written: mod.info (447 B minus Max and FileId lines) | ~350 [I] |
| written: UPGRADE.md (plan's was 8,367) | ~8.4 KB [I] |
| new on disk | ~945 KB |
Loose files are copied, not linked (Valour: mod_update.vbs was copied, paks linked). Source and target are both under mods/ on F: [V]. Target mods/godny_as64 does not exist [V: `ls` of mods/godny*].
The two names share one disk copy of each pak: never edit a pak in place in either folder.

## 4. Time (fix-later 172) [V]
Plan run: 5 m 47 s wall for 18 MB, with 98 s on the read line. Valour's 6 minutes was therefore not pak copying; static checking and the dry-run write into a temp folder dominate. The dry run copied the paks into a temp folder and deleted it, so --plan does not use hardlinks [I]. Stage 2 should be fast: Valour wrote 5.4 GB in 42.8 s with hardlinks, and 18 MB is small either way. Hardlinks cover all 3 paks (the only binaries); the 8-pak slowness does not apply.

## 5. Stage 2 command (do not run now)
```
node tools/upgrade/upgrade.js "<game folder>/mods/godnymod" --to as64 --mode enhanced --out "<game folder>/mods/godny_as64" --json ../run/sessions/<id>/godny-write.json
```
No --no-link, --carry, --then-fix, --only, --drop. Stage 2 must show "3 of those hardlinked"; if fewer, find out why.

## 6. Hashes before stage 2 (sha256sum, compare in source AND target) [V]
```
cc695663b029a3d4176d14227e92df52c7c749cb67254acb4576cc41906573a9  resource/entity/entity.pak
a16d401e65e9b8b96e2a321c2081b33846bdc40e6bcf9fd0c1cfc4de64b4d6ee  resource/modpak.pak
63a6fc31d52a8f29387f4f58b8d84b020b3a68166aa16ae557cc250b9d44320e  localization.pak
8c4776cfbaae84f501899932a6c55330bd1384c978265f4b7002c60111342ae9  readme.txt
6c00fa66ad95cb4f526f5e6807681c0ff501bb2a76e737eaa6327d1363aa210c  mod.info   (source only; differs in target by design)
```
(Source paths under mods/godnymod.)

## 7. WARNs, ranked by what they'd break [V detected, behaviour I/T]
1. switch-bug x40 [I], mission `.mi` in modpak.pak (e.g. 01_usa-overlord, 00b_usa-hurtgen, 01b_usa-bocage): on builds before 3e19680e all switch cases and default fire. Breaks mission logic. Target build is 58826db6; whether it contains the fix needs a mission run [T].
2. WARN_MOVE_KEY_NOT_IN_DEST_EXE x3 [I]: e.g. set/vision/generic.inc uses key `still` (x31), present as a string in the mowas2 exe but not in the as64 exe. May silently drop that vision property. Remains 3 -> 3 after the write.
3. WARN_MOVE_LOCCOVER_LOC_FILE_REPLACED x1: resource/localization/desc.lng replaces vanilla desc.lng; 3 of 1380 vanilla keys dropped, shown as raw keys. Text only. After write 1 -> 0 (the plan attributes this to the mod.info change) [I why].
4. anm-blend x8 [V]: crusader track `.anm` frames blended each quant, abrupt keys smear. Visual only.
5. 16 notes (vision-set, aim-ik-all, quant-step, bug-repair, bug-moves, ...): behaviour on the as64 exe differs from mowas_2; matter most for this mod because it reworks hitboxes and damage and extends combat range, so tuned values may play differently [I].

## 8. Check before (read-only, `check --exe as64` on the source) [V]
Took 49 s. 29 findings, verdict LOADS_STATIC (note: 9 crash-severity findings, yet LOADS_STATIC, because wouldload counts only fatal codes on an entity or set root).
- CRASH 9: ARITH_BAD x3, UNREPLACED_PARAM x3 (sdllint); REF_ANIM_MISSING x2, REF_ITEM_UNKNOWN x1 (refcheck).
- SILENT 14: WARN_MI_TASK_REF x5, WARN_INT_RANGE x3, WARN_STR_VOLUME_NO_SHAPE x3, DEAD_KEY 1, REF_STUFF_ENTITY_MISSING 1, WARN_MPSYNC_SIZE_ONLY 1.
- REVIEW 1: WARN_PAREN_STRAY. COSMETIC 5: WARN_EXP_DUP_BONE x4, REF_SOUND_MISSING 1.
- Check mounted the Workshop copy 2946847596 for this id, not mods/godnymod: "engine mounts <workshop dir> for this id, not the folder given". That copy has the same 3 file names (Glob; sizes and hashes not compared) [V names, not content]. After stage 2, godny_as64 has no FileId, so the engine would read it directly; compare the after count to this one.

## 9. Can't be known without the game [T]
- Whether Enhanced loads godny_as64 at all (`Mod: activate mod`) and whether it clashes with the same-named mods/godnymod or Workshop 2946847596 (same display name "GodnyMod").
- Whether the 40 switch cases misfire on 58826db6, and whether `still` was dropped from the vision set.
- Whether the changed hitboxes, damage and range balance behave as on mowas_2 (quant, IK and vision changes).
- Whether the 9 crash-severity static findings crash (they probably already exist on mowas_2) [I].
- Whether F: hardlinks work for this folder (Valour: yes).

## Not checked
No game run. Pak contents were not opened by me; the readme (9,473 B) was not read, so I cannot say what the author claims about as64. UPGRADE.md size for stage 2 is estimated from the plan's. The Workshop copy's hashes were not compared with mods/godnymod. Why the 9-paks / 4.3 GB figure was expected: not known.

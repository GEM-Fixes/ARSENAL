# mow-mod-text-ui: a mod that replaced vanilla text files

When: a mod ships `desc.lng`, `info.lng`, `#dlg_*.lng` or another vanilla-path text file; names of vanilla units vanished; an old mod after a game update shows raw keys; two mods both carry `desc.lng`.

## Why it breaks
- the file index is keyed by virtual path: a mod `.lng` at a vanilla path REPLACES the vanilla file whole, there is no per-key merge (lim LOC-01, VFS-27 [V])
- keys the game added after the mod was made are missing from the mod's copy → raw keys
- because the vanilla file is gone, there is no `Localization key redefinition` line for its keys: the log stays quiet (lim LOC-25)
- with two mods the later one's copy wins the path, all the earlier one's keys in that file are lost
- when a full copy IS right: changing a key that vanilla `desc.lng` defines needs the mod copy, since a `#` file loses to vanilla (lim LOC-19). Then keep the copy complete

## Steps
1. see it: MCP `mow_mod_diff` (`mod`, `q: ".lng"`, `keys: true`): files that replace a whole game file, keys added / changed / removed
   CLI `node tools/overdiff/overdiff.js <mod> [--game G] [--mods a,b] [--exe as64|mowas_2|mowas2|goh] [--summary]` (OVR_FULL_SHADOW)
   CLI `node tools/loccover/loccover.js <mod> --game G` (LOC_FILE_REPLACED names each dropped key) · `node tools/lnglint/lnglint.js <mod> --game G` (WARN_LNG_FILE_SHADOWS_VANILLA, LNG_OVERRIDES_VANILLA)
2. merge the dropped vanilla keys back into a patch folder (the mod is not written)
   MCP `mow_mod_fix` (`mod`, `out` = new patch folder beside the mod, `only: "lng"`; `mods` = other mods in load order; preview unless `write: true`)
   CLI `node tools/fix/fix.js <mod> plan|apply --out <patch mod> --only lng [--game G] [--mods deps] [--target as64|classic|mowas2|goh]` (FIX_LNG_MERGED)
   related fixers: `lngdup` removes the earlier copy of a duplicate key (lim LOC-03); `enc` for cp1251 text
3. check mod + patch together: MCP `mow_mod_check` (`mod`, `with` = the patch folder, `only: "loccover,lnglint"`)
   CLI `node tools/check/check.js <mod> --with <patch>`
4. own mod, cleaner end state: move the mod's NEW keys into `#<mod>.lng` and drop the vanilla-path copies, keeping a copy only for vanilla keys the mod really changes
   AS2 tool that does the split into vanilla and mod parts: `node tools/lngsplit/lngsplit.js plan <mod> --game G` (→ `big-text-mods.md` of this skill)
5. two mods clash on a text file: a patch mod that holds the merged keys, loaded last: MCP `mow_mods_clash`, then `mow_mods_patch` → skill `mow-mod-together`
GUI: Check page (Check & Fix), Mods together on the Share page

## Per game
| | as64 | mowas2 | goh |
|---|---|---|---|
| replace rule | whole file by path | same | same per path; but texts are entries by `msgctxt` in `.pot` / `.po` layers, fix merges `.pot` |
| extra vanilla layer to compare with | `as64/core` texts too (lim LOC-23) | base only (`--exe mowas_2`) | `localizations/<code>.pak` + loose folder |
| duplicate inside one file | later wins | later wins | first stays (GHLOC-08) |

## Silent fails
- LOC-01 / LOC-25 no log line at all for the dropped keys
- LOC-18 an empty scaffolded `desc.lng` wipes every vanilla name
- LOC-04 after a merge, a key present twice changes text silently (lnglint DUP_KEY)
- VFS-27 keys missing from the mod's copy are never filled from vanilla

## Verify
- loccover: LOC_FILE_REPLACED gone (or only files kept on purpose, complete)
- in game: a vanilla unit the mod does not touch still has its name; the mod's units have theirs (→ skill `mow-mod-test`)

Depth: (load), vfs/order � · guide p14-check-fix-read-log

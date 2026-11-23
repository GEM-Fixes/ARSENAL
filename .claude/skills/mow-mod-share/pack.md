# mow-mod-share: pack into paks, run the packed copy

when: "pack my mod", "make a pak", "smaller download", "loose files or paks".
G = AS2 install, `<mod>` = working folder, `<rel>` = the release folder the user named (outside every install).

## Steps
1. plan (writes nothing): MCP `mow_mod_pack {mod:"<mod>"}` → paks by role and the pack checks
   CLI `node tools/packer/packer.js <modDir> [--out dir] --dry [--goh | --exe as64|mowas_2|goh] [-q] [--summary]`
2. write: MCP `mow_mod_pack {mod:"<mod>", out:"<rel>", write:true}` (target under `ARSENAL_WRITE_ROOTS`) · CLI the same line with `--out <rel>` and no `--dry`; a round-trip verify runs after writing
3. whole pipeline with a gate (any ERROR = no pack):
   `node tools/build/build.js <mod folder> [--game G] [--exe as64|mowas_2|mowas2|goh] [--stages lint,ref,loc,mission,pack] [--out pakdir] [--strict] [--print-plan]`
4. run the PACKED copy once (→ skill `mow-mod-test`): loose and packed can differ, a loose file shadows a pak entry
5. GUI: Share tab > `share` page, package step (`share/preview`, `share/package`, write)

## Facts
- a pak is a zip; entry path = the pak's virtual folder + entry name; zip64 past 4 GB whole, one entry under 4 GB (lim VFS-39)
- role paks: gamelogic / entity / map / interface / texture / sound / music, planned from the loose `resource/` tree; junk (`.git` etc) is left out
- the mod root mounts only `resource.pak`, `resource/`, `N.pat`, `localization.pak`, `localization/` (VFS-26)
- loose `resource/` works as well as paks; paks load faster and hide scratch files

## Checks the packer runs
ZIP_NAME_TOO_LONG (VFS-04: entry names over 1023 bytes are cut) · LNG_NOT_UTF8 · WARN_TEXT_BOM · WARN_STR_NOT_UTF8 · WARN_TEXT_NOT_CRLF (SDL-53) · WARN_LOOSE_SHADOWS_PAK · PACK_ENTRY_TOO_BIG

## Per game
- as64 / mowas2: `--exe as64|mowas_2`; same pak layout
- goh: `packer --goh`; text under `localizations/`; the GoH guard runs the other way too (GoH assets stay out of an AS2 release)

## Silently fails
- TST-11 a loose `resource/...` file overrides the pak entry by scan order, not by date: a stale extracted copy beside the paks wins
- KEY-01 a loose `.patch` in the mod root is not read: only inside a mounted `N.pat`
- VFS-07 the mount skips `.git`, an upload does not
- TST-15 git does not hold paks: keep the loose source as the truth, the paks as output
- NET-01 a binary changed at the same size passes the lobby: when shipping a binary fix, change a text file too

## Verify
- the release folder lists paks by role with sizes; the packed copy started, the changed units worked, log read; report what was left out and why

# mow-mod-together: dead weight (copies identical to the game)

when: a mod ships files or keys that are the same as what they override. They change nothing alone, but each such copy still wins its whole file and hides another mod's edits to it. Cleaning them removes clashes without a merge.

## Steps
1. MCP: `mow_mods_clash` (`mods`) lists the real clashes; `mow_mod_diff` (`mod` = full path, `mods` = mods before it) shows per file what the mod really changes; a file with nothing changed is dead weight. The identical-copy report itself is CLI
2. CLI report: `node tools/conflicts/conflicts.js --game G --mods a,b [--exe as64|mowas_2|mowas2|goh] --itm [--file <vfs glob>] [--fmt md|csv|json]`
   ITM_FILE (info) = the mod's file is identical to what it overrides · ITM_KEY (info) = one value identical to the overridden one
3. whose mod is it?
   - the user's own mod: clean it, as a COPY: `node tools/conflicts/conflicts.js --game G --mods a,b --clean <mod> --out <new dir> [--exe ..]` → ITM_CLEANED (info) per removed copy, CLEAN_REPARSE (warn) when a cleaned file does not read back the same: look at those by hand
   - someone else's mod: do not clean it. report the list to the user (for the author), and let a patch mod decide the clashing files → patch-mod.md
4. `--out` is a new folder the user names; never inside a game install (GoH: refused by the write guard)
5. check the cleaned copy: MCP `mow_mod_check` (`mod` = the copy) · CLI `node tools/check/check.js <copy> [--exe as64,mowas2,goh]`; then clashes again with the copy in place of the old mod
6. GUI: Share tab > Share page > Mods together shows whole-file replacements on request (`gui_call` `POST /api/x/share/clashshadows` `{mods}`); Mods tab > Check & Fix for the copy

## Why it matters
- override is by whole file: a full copy of a vanilla table with one changed line still drops every entry another mod added to that table (VFS-01, VFS-41 [V])
- a copy identical to the game wins its file all the same: the earlier mod's version of that file is lost for nothing
- fewer shipped files = fewer clashes, a smaller lobby fingerprint and less to re-merge after a game update

## Per game
| game | note |
|---|---|
| as64 | "identical to the game" is judged against game + as64/core (+ `as64+` for Enhanced mods) |
| mowas2 | `--exe mowas_2`: judged without as64/core, so a file can be dead weight on one build and a real change on the other |
| goh | `--exe goh`; `--clean --out` inside the GoH install is refused with the write guard line |

## Silent fails
- a cleaned mod is a different mod for the lobby: players with the old and the cleaned copy do not match (NET-01) → multiplayer-sync.md
- an "identical" loose file may exist only to beat the mod's own pak (VFS-08, VFS-55): removing it changes which copy is read. conflicts says CONFLICT_PAK_LOOSE_SAME_MOD
- ITM is judged against the mod list given: with another list the same file may be a real change
- CLEAN_REPARSE: the cleaned file reads differently; keep the original file for that one

## Verify
- `--itm` on the copy: no ITM_FILE left; `mow_mod_diff` of the copy shows the same changed keys as before, no fewer
- in game: the cleaned copy behaves as the old mod alone, then with the other mod (→ skill `mow-mod-test`)

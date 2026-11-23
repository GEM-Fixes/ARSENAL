# mow-mod-together: list the clashes of a mod list

when: two or more mods are to be played together, or one "breaks" the other.

## Steps
1. MCP `mow_mods_clash`: `mods` = folder names in `<game>/mods` in load order, `mod_dirs` = full paths of folders elsewhere (loaded last), `file` = path pattern such as `resource/set/**`, `limit`, `game`. Answers counts by kind and the first clashes, who wins (the last) and what is lost
2. CLI `node tools/conflicts/conflicts.js --game G --mods a,b,c [--mod-dir folder]... [--exe as64|mowas_2|mowas2|goh] [--file <vfs glob>] [--fmt md|csv|json] [-q] [--summary]`
   faster: `--mods-only` (only files two of the mods hold; no CONFLICT_KEY_OVERRIDDEN lines for a file one mod holds) · `--listings` (mount from a scan, no stat per file) · `--cache` (keep each file's read by size + time) · `--trust-mtime` [I] · `--progress f`
   more: `--joint` (→ joint-view.md) · `--itm` / `--clean` (→ dead-weight.md) · `--no-version-check` compares a mod the game would refuse
   a big pair runs ~47 s without the speed flags
3. GUI: Share tab > Share page > Mods together. `gui_call` `POST /api/x/share/clashes` body `{mods:[..], patch?}`; progress `GET /api/x/share/clashprogress`; whole-file replacements on request `POST /api/x/share/clashshadows` `{mods}`
4. one file only: MCP `mow_file_which` (`path`, `mods`) → which-file-wins.md
5. sort the result by kind with the user, then open the kind's file:

| what the lines say | kind | file |
|---|---|---|
| CONFLICT_LNG_KEY_LOST / _DIFF / _CROSS | text | text-clashes.md |
| CONFLICT_FILE_SHADOW, CONFLICT_ENTRY_LOST | set tables, defs replaced whole | set-table-clashes.md |
| CONFLICT_MACRO_LOST / _DIFF | macros | macro-clashes.md |
| WARN_CONFLICT_MOD_MOD, CONFLICT_ENTITY_NAME_DUP | same unit or key | same-unit-clashes.md |
| WARN_CONFLICT_OPAQUE_MOD_MOD, CONFLICT_TEX_EXT_SHADOW | binary | binary-clashes.md |
| MOD_ORDER_UNDECLARED, CONFLICT_MOD_NOT_LOADED | order, gate | load-order.md, classic-enhanced-mix.md |
| CONFLICT_FILE_DELETED | delete | deleted-files.md |
| CONFLICT_KEY_OVERRIDDEN (info) | a mod changes vanilla: normal | none |
| CONFLICT_PATCHED (info) | the last mod Requires every clashing mod = a patch mod decided it | none |

Every code in one line each: clash-codes.md.

## Per game
| game | note |
|---|---|
| as64 | keeps the mod version and mode gate: a refused mod is CONFLICT_MOD_NOT_LOADED and not compared (VFS-48, VFS-54, VFS-59) |
| mowas2 | `--exe mowas_2`: no as64/core layer, no `as64+`; the gate keeps mods whose range holds 3.262 |
| goh | `--exe goh` with no `--game` = the GoH install; mods of equal Require count load in mod.info `Priority` order (GHVFS-25 [V]), so MOD_ORDER_UNDECLARED is not made; a skipped mod is info VFS_MOD_VERSION |

## Silent fails
- VFS-01 / VFS-41 the game itself reports none of this: entries, cards, texts just vanish with no log line
- a mod the gate refuses is left out of the comparison: read the NOT_LOADED / VFS_ lines before trusting "no clashes"
- source = vanilla or mod id; a source's file = its LAST record (its paks, loose files, N.pat)

## Verify
- counts by kind make sense against `mow_mod_diff` of each mod (`mod`, `mods` = the mods loaded before it)
- after a patch: run again with the patch last → check-the-stack.md

# mow-mod-together: build the patch mod that keeps both sides

when: the clashes are known (find-clashes) and the user wants both mods to keep their content. The patch mod is a NEW folder, loaded last; the mods are never touched; undo = delete it or take it off the list.

## Steps
1. ask the user for the folder (new or empty, not inside a game's `resource` / `packages`; GoH: outside the install) and a shown name
2. plan: MCP `mow_mods_patch`: `mods` = folder names in `<game>/mods` in load order, `mod_dirs` = full paths of mods elsewhere, `out` = full path of the patch folder, `name`, `game`. No `write` = preview. Answers merged files, what could not be merged, and the values both changed
   CLI `node tools/conflicts/patchmod.js plan --game G --mods a,b[,c] --out <new folder> [--exe as64|mowas_2|mowas2|goh] [--name "Shown name"] [--spec f.json] [--json]` (speed flags as conflicts.js: `--listings`, `--cache`, `--trust-mtime`, `--progress f`)
3. show the plan. Rows: `added` (an entry of the earlier mod put in), `auto` (only one mod changed it: that value taken), `choices` (both changed it: the winner's stays unless picked). Ask the user per choice
4. picks go in a spec file (CLI) : `{ files: [{ key, mode: 'merge'|'take', take: mod, prefer: mod, picks: { '<entry path>': mod } }], texts: [{ key, text }] }`
   - no spec = every file two of the mods ship with different content that can be merged
   - `prefer` = the mod whose value is taken wherever both changed one; `picks` per entry come first
   - `mode: 'take'` = that mod's whole copy (for files that are no text data; only on request)
   - `texts` = one key defined in two differently named `.lng`: goes to `localization/#<patch>_texts.lng` [T]; not on GoH
5. write on the user's yes: MCP `mow_mods_patch` with `write: true` (folder must be under `ARSENAL_WRITE_ROOTS`) · CLI `node tools/conflicts/patchmod.js write ...same arguments`
   write mounts the patch by path afterwards and checks that its files win
6. GUI: Share tab > Share page > Mods together: pick per value, name the folder, Plan, then Write. `gui_call` `POST /api/x/share/clashfix` body `{mods, out, name, files, texts, write}` (no `write` = plan); open the folder `POST /api/x/share/clashopen` `{dir}`

## How a file is merged (text data: .def .set .ext .inc .mdl .. and .lng)
- 3-way by entry, the game's file as the common start; the start is the winner's (last mod's) file, bytes kept
- the result is read again: every entry of the winner and every entry put in must be there and the strict reader must find no new error; a file that fails is left out (PATCHMOD_CANT)
- the patch gets a mod.info with `Require` on every merged mod, so it sorts after them (VFS-15 [V])
- exit 0 ok · 1 something could not be merged or does not win · 2 bad arguments or a refused folder; fewer than two loaded mods = exit 2

## Per game
| game | note |
|---|---|
| as64 | a mod the version or mode gate refuses is not merged (→ classic-enhanced-mix.md); the patch takes the mode of the mods |
| mowas2 | `--exe mowas_2`; range of the patch must hold 3.262 |
| goh | `.pot` merged by `msgctxt` (winner's entries stay, the other mod's missing ones are added), no picks; `texts` not served; range must hold the GoH exe version; not run in game [T] |

## Silent fails
- VFS-01 the engine merges no file type: a merge that is not in ONE file of a later mod does not exist
- PATCHMOD_NOT_WINNING after the write: the patch file is not the one the view reads (order, a pak beating a loose folder: VFS-08)
- entries are compared without macro or include expansion: two entries that expand the same can still be a "choice"
- NET-01 a patch can pass the lobby and desync later: every player needs it → multiplayer-sync.md

## Verify
- plan and write agree; no PATCHMOD_CANT left that the user did not accept
- the stack again with the patch last → check-the-stack.md; then in game → enable-and-test.md

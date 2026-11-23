# mow-mod-together: joint view (what breaks only when loaded together)

when: each mod is clean alone, yet together one crashes, stops reading a file, or loses a unit, texture or sound. Also the GUI way through the whole job.

## Steps
1. MCP `mow_mods_clash` (`mods` in load order, `mod_dirs`) gives the clash list; the joint checks are on the CLI and the GUI
2. CLI `node tools/conflicts/conflicts.js --game G --mods a,b[,c] [--exe as64|mowas_2|mowas2|goh] --joint [--mods-only] [--fmt md|csv|json]`
   - CONFLICT_JOINT_PARSE (warn): a text data file two mods hold, read as the game reads it (the last mod's copy). The strict reader gives an error with all mods loaded that it does not give with that mod alone: an include or a macro of it now comes from another mod's file, or is gone. The line names the mod whose file breaks, the mod that causes it and the include that changed
   - CONFLICT_JOINT_REF (warn, [I] by name): a file of mod A names something that is there with A alone and gone with the others loaded: an entity, texture, sound or include another mod removes (mod.info Delete, patch), or a macro / named entry the copy read by the game no longer holds. Found by name, so a word that only looks like the name is listed too
   - CONFLICT_SHADER_SET (info): the mod ships shader files; the game keeps one compiled shader cache for every mod list (VFS-56)
   - CONFLICT_MISSION_MOD (info): a map of the mod holds its own `mod/` folder; while that mission runs its files lie over the game data and beat every listed mod (VFS-33)
   scope: the clash set only (files two mods hold with other content, files a mod deletes). A game entry one mod drops from a file the other does not ship is that mod's own override: MCP `mow_mod_diff`
3. GUI: Share tab > Share page > Mods together (every game tab). Find it: `gui_pages`; link for the user: `gui_open`. The card: pick the mods in order → clash kinds with counts → guided fix per group → patch mod that keeps both sides → check again
   routes via `gui_call` (see `gui_routes` for fields):
   | route | body | does |
   |---|---|---|
   | `POST /api/x/share/clashes` | `{mods, patch?}` | the clash list; with `patch` = check again with that folder last |
   | `GET /api/x/share/clashprogress` | `run` | step of a long run |
   | `POST /api/x/share/clashshadows` | `{mods}` | files a mod replaces whole (asked by a button) |
   | `POST /api/x/share/clashmp` | `{mods, patch?}` | playing online with these mods: one plain result |
   | `POST /api/x/share/clashfix` | `{mods, out, name, files, texts, write}` | plan, or with `write: true` write the patch mod |
   | `POST /api/x/share/clashopen` | `{dir}` | open the patch folder for the user |
4. fix by kind: lost macro → macro-clashes.md · lost entry → set-table-clashes.md · deleted file → deleted-files.md; then patch-mod.md

## Per game
| game | note |
|---|---|
| as64 | shader cache folder is per build; a refused mod (mode, version) is not in the joint view (VFS-48) |
| mowas2 | same checks, `--exe mowas_2`, no as64/core |
| goh | same page on the GoH tab; `clashmp` gives only the plain rule (no lobby file check is modelled for GoH); `.pot` cross-file keys are not compared |

## Silent fails
- VFS-56 the first mod list to compile a shader key wins it; a later list renders with the old compiled shader, no log line: clear the cache after changing shader mods
- VFS-33 a mission's `mod/` files are moved over the game data for the match: a listed mod's change is not seen in that mission only
- CONFLICT_JOINT_PARSE in game is a parse error at load of that file: crash or the file is skipped, depending on the reader
- a mod with files in `resource/interface/action` changes the action ids: every player needs the same set (UI-05 [T])

## Verify
- `--joint` again with the patch last: no CONFLICT_JOINT_PARSE; each CONFLICT_JOINT_REF left is read by hand (false name hits are possible)
- in game with the full stack: load a match on a map of each mod, buy units of both; game.log read (→ skill `mow-mod-test`). GUI use in general: skill `arsenal-gui-use`

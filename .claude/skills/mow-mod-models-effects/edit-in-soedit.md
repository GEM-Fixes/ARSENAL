# mow-mod-models-effects: edit a model (Models page or SOEdit) and keep the record

when: "open this model in SOEdit", "move a bone", "edit the model", "what did the 3D editor change", "SOEdit lost my comments".
G = game install, `<mod>` = the user's mod folder (full path). MCP `game` = `as64|mowas2|goh`.
The game's own files are only read: a model is first copied ("staged") into `<mod>` at the same paths.

## Steps
1. plan the copy: MCP `mow_model_stage {model:"<entity | game path | disk path | breed:<key>>", mod:"<mod>"}` → the files it would copy; `anims:[..]` picks animations, `textures:"none"|"stage"`
   write: the same with `write: true`
   CLI `node tools/soedit/soedit.js stage <target> --out <mod> [--game G] [--mods a,b] [--anm a,b | --no-anm] [--textures cache|stage|none] [--dry]`
2. edit, either way:
   - GUI: Models & Sim tab > `models` page (Skeleton, Volumes, Meshes and materials, Animation tabs; Save lists the files first). works without SOEdit
   - SOEdit, started for the user: `node tools/soedit/soedit.js locate [--json]` (is it installed), then `node tools/soedit/soedit.js open <staged .mdl | stage record> [--anm f] [--lang en|ru|uk|zh] [--dry]`. Claude does not drive SOEdit; the user edits and saves
3. after the edit: MCP `mow_model_edits {record:"<mod>/.arsenal/soedit/<name>.stage.json"}` → changed, new, missing files and what the save lost
   CLI `node tools/soedit/soedit.js check <stage record | staged .mdl> [--game G]` (exit 1 = something lost or missing)
4. batch edits with no editor: `node tools/soedit/soedit.js ops anim <operation> <file.anm> [--dry]`, `ops ply info|merge|merge-child|demerge|tweak <file>`, `ops vol fit|round <model.mdl> [--volume id] [--step n] [--apply]`
5. then the art checks: MCP `mow_model_check {mod:"<mod>"}`

## Facts → tools/soedit/README.md, guide p06-edit-a-model
- stage copies `.mdl .ply .vol .anm .mtl` to the same paths under `<mod>`; files already there are kept; textures go to a view cache outside the mod by default
- the record `<mod>/.arsenal/soedit/<stem>.stage.json` plus pristine copies in `<stem>.orig/` is what `check` compares against
- stage refuses a game-install target; SOEdit itself is downloaded by `soedit install`, only on the user's yes
- a staged copy replaces the vanilla file for every unit that shares it (shared skeletons, shared `.anm`): stage under a new name for a variant (clone first → skill `mow-mod-units` `clone-a-unit.md`)

## Check codes after a save
FILE_CHANGED · FILE_NEW · FILE_MISSING · MDL_KEYWORD_LOST · MDL_BLOCK_LOST · MDL_COMMENTS_DROPPED · WARN_ANM_VERSION_CHANGED · WARN_PLY_SUBM_TO_MESH, then binhdr and expcheck findings on the changed files

## Per game
- as64 / mowas2: `--exe as64|mowas_2`; one install, `--exe mowas_2` keeps the as64 core files out
- goh: staging and SOEdit work on GoH models; the target must be a folder ARSENAL may write (writeguard); the def check of `mow_model_check` is not run for goh (PORT-171)

## Silently fails
- a save can drop `.mdl` keywords, blocks or comments the editor does not know: read the check before trusting the save (MDL_KEYWORD_LOST, MDL_BLOCK_LOST)
- FMT-05 `{speed}` / `{limits}` only act on revolute, prizmatic and socket bones: on a plain bone nothing moves
- FMT-21 a LOD bone with linked objects, a skinned mesh outside a skinned group: export refuses or the game shows nothing [I]
- FMT-19 a renamed bone that a def, macro or script still names: that part goes dead, no message

## Verify
- `mow_model_edits` shows only the changes meant; in game the unit looks right from all sides, its turret, wheels and doors still move, log clean (→ skill `mow-mod-test`)

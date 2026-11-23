# mow-mod-models-effects: meshes (.ply), Blender export, invisible parts

when: "my exported model crashes", "part of the model is invisible", "Invalid chunk in .PLY", "too many vertices", "Blender to Men of War", "skinned mesh is broken".
G = game install, `<mod>` = the user's mod folder (full path). MCP `game` = `as64|mowas2|goh`.

## Steps
1. check a mod's art: MCP `mow_model_check {mod:"<mod>", checks:["export","binary"]}` (`checks` = def, export, binary)
   CLI binary headers: `node tools/binhdr/binhdr.js <gameDir> [--exe as64|mowas_2|goh] [--mods a,b] [--ext ply,anm] [--strict] [-q] [--summary] [--folder DIR]`
   CLI export rules: `node tools/expcheck/expcheck.js <mod folder> --game dir [--mods a,b] [--exe as64|mowas_2|goh]`
2. one model's meshes and materials: MCP `mow_model_info {model:"<name>", mod:"<mod>", show:["meshes"]}`
3. one .ply: `node tools/soedit/soedit.js ops ply info <file>`; join or split: `ops ply merge|merge-child|demerge|tweak <file>`
4. Blender add-on (GEM2 tools), only on the user's yes: `node tools/blen/install.js --check` then `node tools/blen/install.js [--blender P] [--dry-run]`
5. GUI: Models & Sim tab > `models` page, Meshes and materials ("Bring in a mesh" from .obj or .ply)

## Limits, ply-vertex, dispatch
- FMT-13 magic must be `EPLY` (model mesh) or `BPLY` (map big mesh) [V]
- FMT-01 chunks carry no length: one wrong field breaks the rest, `Invalid chunk in .PLY file!` (fatal) [V]
- FMT-10 index is 16-bit: at most 65535 vertices per mesh; bone map at most 25 entries, the shader takes 24 matrices [V]
- FMT-23 the skin cap is per SUBMESH (25 bones), not per model: split a skinned mesh by body region [T]
- FMT-18 under 256 skin bones per skinned mesh [T]
- FMT-11 vertex stride comes from the file and is not checked against the layout: a wrong stride draws garbage [T]
- FMT-16 an empty material string means an inline layered material block follows [V]
- FMT-03 the `.mtl` must sit beside the .ply (or a `.materials` file in the folder): missing = null material

## expcheck codes
WARN_EXP_SKIN_BONES · WARN_EXP_ANM_BONES · WARN_EXP_DUP_BONE · WARN_EXP_DUP_VOLUME · WARN_EXP_VOL_MATRIX; binhdr codes cite the FMT row

## Per game
- as64 / mowas2: same .ply; a mesh that loads in one loads in the other
- goh: its meshes carry data AS2 does not read and its materials differ; moving a GoH mesh into AS2 is a port, not a copy (→ skill `mow-mod-port`). GoH rows:

## Silently fails
- a mesh linked to a bone the .mdl lacks, or under a LOD the game never picks: nothing drawn, no message (FMT-21 [I])
- VIS-20 LOD distances must strictly increase and flags inherit: an `off` set at one level stays for the further ones
- FMT-12 an old map big mesh: `BigMesh structure is obsolete. Resave map.`
- a mirrored (negative scale) bone flips the mesh's lighting; export with transforms applied

## Verify
- `mow_model_check` clean for the mod; the unit seen in game close and far (every LOD), destroyed state too; no `Invalid chunk` / `Can't create resource object` in game.log (→ skill `mow-mod-test`)

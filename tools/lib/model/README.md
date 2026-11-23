# tools/lib/model: shared model core ( steps 2 and 5)

One module per format, each owned by one session at a time. Written from the engine (`gem/`, `game/`, found through
`node tools/q/q.js`) and ``, not translated from SOEdit's writers (they lose data
section 3). SOEdit's source (https://github.com/ThatFrostyy/SOEdit-PatchByFrostyy) may be read as a second opinion on layouts.

Scope: Men of War: Assault Squad 2, the 64-bit build and Gates of Hell (owner 2026-11-15: SOEdit and the model editor work with
GoH; this replaces "AS2 and 64-bit only" of 2026-11-10 for them; the armour simulator stays AS2 and 64-bit only). The GoH .mdl .ply .vol .anm .mtl files are the same
forms (vanilla GoH samples of 3,000 mdl, 3,000 ply, 2,000 vol, 2,000 anm and 4,358 mtl all read and write back byte-identical,
2026-11-14 [I]; every GoH SUBM declaration scanned). The GoH differences that touch these files are named where they apply:
`ply.js` BUMP_SLOTS / bumpSlot (inline bump slot order, GHFMT-28 [I]; lightmap slot, GHFMT-11; a lookup helper with no caller
yet, the bytes are kept as stored), the .mtl lightmap layer (`edit/ply.js` mtlInfo, MTL_TEX), the float4 wind-params element
(GHFMT-02: read from the declaration's own type), `mdl.js` rollers (numbered `roller_NN` on GoH, GHFMT-20). The model readers
that open the game (`sceneload.js`, `edit/core.js` through `tools/soedit/stage.js` openSource, the `sweep-*.js` scripts) take the
game's vfs exe (`exe` / `--exe`, `sweepargs.js`): AS64 and MoW:AS2 share one install, so exe `mowas_2` keeps the as64/core files
out; exe `goh` reads the GoH install (viewing only; `edit/core.js` open refuses it).

## Rules every module follows

- `parse(buf, opts) -> obj` never throws on bad data: it returns what it read plus `obj.error` (string) and stops.
- `write(obj) -> Buffer`. For an untouched `obj`, `write(parse(buf))` is byte-identical to `buf`. Anything the module
  does not understand is carried as raw bytes (`raw: Buffer` on the chunk or node) and written back unchanged.
- Version and chunk kinds are kept: a version 6 animation is written as version 6, a `SUBM` part as `SUBM`.
- Plain objects and arrays, numbers, strings, Buffers and typed arrays only. No classes with hidden state, no file IO
  inside `parse`/`write` (a thin `readFile`/`writeFile` pair may wrap them; `writeFile` goes through `tools/lib/writeguard.js`).
- Matrices: 12 numbers in the engine's matrix 43 order: three rows for the x, y and z axes, then the translation row
 , as `Float32Array(12)` or `number[12]`; say which in the header. Forward is +X, up
  is +Z. Box sides as in the files: 1 front +X, 2 top +Z, 3 left +Y, 4 right -Y, 5 rear -X, 6 bottom -Z
 . `trace.js` and the `{thickness}` lists count the same sides from 0 (0 front .. 5 bottom)
  the `.vol` SIDE byte is that number + 1 (`trace.sideFromVolByte`).
- Units are the engine's (20 per metre). Angles as stored.
- Names: latin1 bytes kept exactly; expose the decoded string and write back the original bytes.
- Header comment: layout, notes, the exported functions with their shapes, then the author line as
  in every other tools file (`tools/lib/credit.js` rules).
- Node only, no npm dependencies. Build on `tools/lib/bin.js` (Reader), `tools/lib/sdl.js`, `tools/lib/sdlwrite.js`,
  `tools/lib/vfs.js`, `tools/lib/pak.js`. Existing `tools/lib/anm.js` and `tools/lib/ply.js` are header readers used by
  other tools: do not change their behaviour.

## Modules

| File | Exports | State |
|---|---|---|
| `anm.js` | `parse`, `write`; frames as per-bone 3x4 matrices and visibility, mesh tracks carried raw | step 2 |
| `ply.js` | `parse`, `write`; BNDS, SKIN, MESH, SUBM, VERT, INDX and the rest of the chunk list; vertex layout decoded from the format bits | step 2 |
| `vol.js` | `parse`, `write`; `.vol` polyhedron: vertices, faces, sides | step 2 |
| `mdl.js` | `parse(text bytes) -> tree with byte spans`, `edit(tree, changes) -> bytes` through sdlwrite splices; bones, volumes, obstacles, areas, sequences, extender and unknown blocks all kept | step 2 |
| `trace.js` | `rayBox`, `rayCylinder`, `raySphere`, `rayPolyhedron` -> `{ t, side, normal }` or null; box side numbers as the engine numbers them | step 5 |
| `scene.js` | `build(model, files) -> { bones[], meshes[], volumes[] (with the shape `trace.js` takes), bounds }` in world space; `pose(scene, anm, frame)`; `shapes(scene)`; `toJSON(scene)` = the `scene/1` JSON the 3D view draws | done |
| `sceneload.js` | `load(entity name or .mdl, { game, mods, modDir, source })` -> `{ scene, model, files }`: the file reading for `scene.js`, mod folder over the game; the optional `source` is a shared file source (scenecache passes it), without it nothing changes | done |
| `scenecache.js` | `open({ target, game, mods, modDirs, vfs })` -> `L` with `load(model)`, `read(key)`, `entity(name)`, `reads()`, `invalidate()`: one loader per game and mod stack for tools that load thousands of models (mapviz); target as64, mowas2 or goh is required, never guessed | done (mapviz MV-SCN) |
| `dds.js` | `parse(buf)`, `decode(buf, { mip, maxSize })`: DXT1, DXT3, DXT5, BC5 (ATI2, BC5U: r and g, the caller rebuilds z), uncompressed; names the format it cannot read | done |
| `sweepargs.js` | `take(args)`, `gameFor(dir, exe, fallback)`, `vfsOpts(o, exe)`: the `--exe` option of every `sweep-*.js` | done |
| `ddsenc.js` | `encode(rgba, w, h, { mips, best })` -> DXT1 DDS with the full mip chain, `encodeBlock`, `mipChain`; integer maths, same bytes on every machine; sides must be multiples of 4 | done (mapviz MV-BC1); in-game load not checked [T] |

State on 2026-11-10: `anm`, `ply`, `vol`, `mdl`, `trace` done; every vanilla file of each type reads and writes back byte-identical
(3,977 anm, 52,329 ply, 3,422 vol, 9,499 mdl). `scene` built 810 vanilla vehicles; 99.4% of polyhedron volumes overlap the mesh on
their bone. Placement rules, with engine lines, are in the `scene.js` header: a volume's world matrix is its own matrix followed by
its bone's world matrix; box sizes are full sizes centred on the matrix origin; a cylinder's axis is local Z; `.vol` points are used
as stored; an animation matrix replaces the bone's rest matrix.

Tests: `tools/lib/test/model-<name>.test.js`, written like the other `*.test.js` there, synthetic fixtures only (game
data is never copied into the repo). Each format also has `tools/lib/model/sweep-<name>.js <gameDir> [--sample N]`:
reads every vanilla file of the type in place (loose and packed), checks parse then write is byte-identical, prints
`<total> files, <same> identical, <diff> differ, <err> unreadable` and the first 10 failing paths.

## One identity for a volume

`<bone path>/<volume name>`, bone path = bone names from the root joined by `/`. `mdl.js`, `scene.js`, `trace.js`
callers, `tools/soedit/check.js`, the 3D view and the armor simulator all use it.

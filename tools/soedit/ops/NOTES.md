# SOEdit operations: how each batch-able op works

This is a spec, taken from the source, for writing each operation in node. Line numbers refer to the imported base (upstream https://github.com/ThatFrostyy/SOEdit-PatchByFrostyy at 823d6de9). Tags: [V] read in the source; [I] inferred; [T] not determinable from the source and needs a run of the exe or the game.

Every operation that matches SOEdit's output must state whether it copies the upstream bugs listed under **Bug** or fixes them. The parity list (`tools/soedit/parity.md`) treats a bug as "fix", not "copy".

## 0. Shared data model and conventions

### Matrix

`matrix34_t` is `float v[4][3]`.
- Rows 0-2 hold orientation (row i is the image of local axis i).
- Row 3 holds position.
- Points are row vectors: `p' = p·R + T`, so `out[c] = Σ_i p[i]*v[i][c] + v[3][c]`. Source: .
- Directions use the same formula without row 3.
- On disk the matrix is the 12 floats in that order, 48 bytes little-endian.

### ANM in memory (`CAnimBone`)

- Fields: `Header_ID`, `m_FrameCnt`, `m_BoneCnt`, and `m_BoneMap[]` (names).
- `m_Frames[f]` is a linked list of subs, each `{m_Bone, m_Matrix34, m_Visible, chunk_flags}`.
- After load, every bone has a sub on every frame (fill-forward, Process 132-500):
  - Missing position, orientation or visibility is copied from the previous frame.
  - Frame 0 orientation is back-filled from the first later frame that has one, else identity.
- Visibility -1 counts as visible.

### ANM read

Header: `EANM`, then int version, which must be one of 0x30000, 0x40000, 0x50000, 0x60000 or 0x60001.

| Tag | Content |
|---|---|
| `FRMS` | int frame count |
| `BMAP` | int count, then per bone: int len + len bytes (no terminator) |
| `FRMN` | int frame index |
| `BONE` | int bone index |
| `MATR` | 48 bytes |
| `VISI` | int |
| `FRM2` | short frame, byte chunk count; per chunk: byte bone, short flags, [v3 position if flags&1], [quat xyz if flags&2, with `w = -sqrt(abs(1 - x²-y²-z²))`] |

FRM2 flag details:
- 4 = left-handed: sets fix_mx_ori.
- 8 = visible on; 0x10 = visible off.
- 0x20 (mesh) is refused, and so is any flag value above 63.
- Unknown tags are **not skipped**, so the reader desyncs **Bug**.

The quaternion → matrix formula and the effect of fix_mx_ori are and were not re-derived here [T: compare one FRM2 file against SOEdit's MATR output].

### ANM write: , [V]

1. `EANM`, int 0x40000 (always, whatever version was loaded), `FRMS` int m_FrameCnt, `BMAP` int m_BoneCnt, then for each bone: int strlen + name bytes.
2. Frame 0: `FRMN` int 0. Then for b = 0..m_BoneCnt-1 that has a sub on frame 0: `BONE` int b, `MATR` 48 bytes, `VISI` int (visible ? 1 : 0). Bone-index order.
3. For each frame f = 1..count-1, compare with frame f-1:
   - Walk the subs of f in list order. Find the sub of the same bone in f-1; if none, skip the bone (**Bug**: a bone present in f but absent in f-1 is dropped).
   - `mtx` = the 48 bytes differ (memcmp, so -0.0 and 0.0 count as different). `vis` = visible flags differ.
   - If either is true: on the first change in this frame write `FRMN` int f, then `BONE` int bone, then `MATR` if mtx, `VISI` int if vis.
   - A frame with no changes writes nothing. FRMS still counts it.

### `.bak`

`(path)` copies an existing file to `path + ".bak"` before the write. The mdl save calls it three times, which still leaves one generation.

### Undo

Undo stores a ProcessSave snapshot of the animation, taken every 300 ms on timer 0xA120, up to 100 steps. A batch tool needs nothing like it; write to a new file or keep the `.bak`.

## 1. Anim reverse

- **Entry**: anim box Reverse → . The dialog copy is. Both call.
- **Inputs**: none. No-op when frame count ≤ 1.
- **Algorithm** [V]: swap the whole sub lists of frame lo and frame hi, for lo = 0 and hi = n-1 moving inward until lo ≥ hi. Matrices and visibility are not changed. The bone map is unchanged. The current frame is set to 0.
- **Edge cases**: because every frame is complete after load, the new frame 0 is complete too. On save, frame 0 is written in full and the rest as deltas.
- **Written**: nothing until Save (ANM write, §0).

## 2. Lerp "Fill"

- **Entry**: anim box Fill → . is the same algorithm, but its dialog has no lerp edits, so it is dead.
- **Inputs**:
  - Start and end frame, both 1-based, from IDC_LERP_START_FRAME and IDC_LERP_END_FRAME. Their defaults are "1" and "2".
  - A timeline selection pre-fills them, and AnimBoxUPD (3897) clamps them.
  - The bone is the one selected in the model tree (doc) or in the dialog list.
- **Validation**: `1 ≤ s < e ≤ frameCount`, else error box "Invalid frame range". The bone must have a sub on both frames s and e, else error.
- **Algorithm** [V]:
  ```
  for f = s+1 .. e-1   (1-based)
    t = (f - s) / (e - s)               float
    mid = sub of the bone at frame f-1 (0-based); skip if none
    for row 0..3, col 0..2:
      mid.v[row][col] = a + (b - a) * t     (a from frame s, b from frame e)
    mid.visible = t < 0.5 ? start.visible : end.visible
  ```
  This is a linear lerp of all 12 floats. There is no slerp and no re-orthonormalisation, so rotations shrink in between (scale artefact when the angle is large).
- **Edge cases**:
  - Only one bone per click.
  - When e = s+1 nothing changes.
  - Frames s and e are not touched.
- **Written**: on Save; the changed frames become MATR (and VISI) deltas.

## 3. Insert frame

- **Entry**:
  - anim box "Insert frame", the I key, or timeline "Insert after" → `CSOEditDoc` handler, which calls `m_AnimBone->OnInsertFrame(m_Frame)`.
  - The dialog button calls the same function.
  - Holding the button auto-repeats (timer 0xA11F: 180 ms, then 100, 60, 35).
- **Inputs**: indx = current frame (0-based).
- **Algorithm** [V]: build an array of count+1 frames. Frames 0..indx stay as they are; a deep copy of frame indx (every sub with matrix, visibility and flags) goes at indx+1; old indx+1.. shift up by one. Returns indx+1, which becomes the current frame.
- **Edge cases**: inserting after the last frame appends a copy of it. The copy equals its source, so on save it writes no delta (the frame is a hold).
- **Written**: FRMS grows by one on save.

## 4. Delete frame(s)

- **Entry**: anim box "Delete frame" (auto-repeat), Del, Animation > Delete selected, or timeline Delete → → . The dialog button calls `FrameDelete(m_Frame)`.
- **Inputs**: range [a,b] (0-based) from the timeline selection, or a = b = the current frame.
- **Algorithm** [V]: `n = b-a+1`, capped so that at least one frame remains. Call `FrameDelete(a)` n times. `FrameDelete(i)` removes frame i and shifts the rest down; it refuses (returns 0) when only one frame is left. The current frame is clamped to count-1.
- **Edge cases**: deleting frame 0 makes old frame 1 the new full frame 0. That is safe, because every frame is complete in memory.
- **Written**: on save.

## 5. Duplicate / move frame range

**Duplicate**: Animation > Duplicate, Shift+D, timeline → [V]

```
n = b - a + 1
for k = 0..n-1: InsertClonedFrame(src = a+k, dst = b+1+k)
select b+1 .. b+n
```

`InsertClonedFrame(src, dst)` clamps dst to 0..count and inserts a deep copy of frame src (index before the insert) at dst. The source indices stay valid because dst > src.

**Move**: `[` and `]`, Animation > Move earlier/later, or dragging the timeline selection → [V]

- Earlier: `MoveFrame(a-1, b)`. The frame just before the block is moved to just after it, so the block shifts left by one.
- Later: `MoveFrame(b+1, a)`.
- `MoveFrame(from, to)` is a memmove rotate. It is a no-op when an index is out of range or from == to, so the block does not move at either end.
- The selection follows the block [I].

Written on save.

## 6. Copy matrix to following frames

- **Entry**: anim box checkbox "Copy the matrix to the following frames" → `InheritMatrix` flag. It is applied only in the 2D drag edit [V, grep: no other use].
- **Algorithm**:
  1. While dragging the selected bone at frame F > 0 with editing allowed, the new sub matrix M is computed (see §17 for the order).
  2. For every frame i = F+1 .. count-1 that has a sub for that bone: copy M into it (matrix only, visibility untouched).
- **Edge cases**: matrix edits in the dialog and Reset bone do not copy forward.
- **Batch form**: "set bone B's matrix from frame F to the end".

## 7. Save without first frame

- **Entry**: anim box 3-state checkbox IDC_ANMBOX_DROP_FIRST_FRAME ( stores m_DropFirstFrameOnSave); used in `OnAnmSave`.
- **Algorithm** [V]: when the flag is set (the indeterminate state also counts) and the frame count is at least 2, call `FrameDelete(0)` **in memory**, decrement the current frame, and then run the normal save (`.bak` + ProcessSave).
- **Bug**: memory is changed, so each later save drops another frame.
- **Intended spec for the batch op**: write frames 1..n-1 only. The old frame 1 becomes the full frame 0 (it is complete after fill-forward); every later frame is a delta against its predecessor. Leave the source untouched.

## 8. Bone track: clone, export, import, rename

### Clone

 → `(indx)` [V]

1. Asks "Really clone a bone?".
2. Name: for i = 0..99, the first `"<name>_Clone_<i>"` that differs case-insensitively from every name in the map. After 100 tries the last name is used even if it clashes.
3. Append the name to the bone map (new index = old count).
4. For every frame, add a sub: matrix copied from the source bone's sub on that frame, flags POS|ORI|(VIS_ON or VIS_OFF), visible = source ? 1 : 0.
5. Crashes if the source bone has no sub on a frame (cannot happen after fill-forward).

### Export

 [V]

- Builds a CAnimBone with 1 bone (the selected name) and the same frame count. Each frame gets one sub, bone 0, with the source matrix and visibility.
- The default file name is `<anm path>_Exported_<bone>` (the anm path still contains `.anm`), default extension `.anm`.
- Asks before replacing. Written with ProcessSave, so it is a 0x40000 file:
  ```
  EANM 0x40000 FRMS n BMAP 1 [len name]
  FRMN 0 BONE 0 MATR m VISI v
  then deltas
  ```
- No `.bak`.
- The loop is bounded by the dialog's frame count; it should equal the animation's [I].

### Import

 [V]

1. Load the file. Refuse unless `Header_ID == 0x40000` ("Only anm files of version 0.4.0.0"), which means SOEdit exports and SOEdit-saved files only.
2. De-duplicate names inside the imported file. For each later duplicate, try `"<name>_<i>"` for i = 0..99.
   - **Bug** (1502): the new name is copied into `ImportBone->m_BoneMap[pSub m_Bone]` (the doc's selected index) and not into slot i2. That writes past the buffer or into the wrong slot.
3. Rename any imported bone whose name already exists in the target to `"<name>_<i>"` (i = 0..99, the first that is not in the target).
4. Equalise frame counts by calling `OnInsertFrame(last)` on the shorter animation, which repeats its last frame.
5. Append the imported names to the bone map. Shift every imported sub's bone index by the old target bone count. Copy the subs into the matching target frames (matrix, flags, visibility).
6. The current frame becomes 0.

### Rename

`OnEnChangeAdAnmBoneName` [V], live as the user types:
- Keep only `[A-Za-z0-9_]` and truncate to 30 characters.
- If another bone has the same name (case-insensitive), or the name is empty, use `"NewBone<i>"` for the first free i (0..99).
- Replace m_BoneMap[bone]. Written as the BMAP name on save.

## 9. Reset bone

- **Entry**: anim dialog "Reset bone" → .
- **Algorithm** [V]: set the 12 edits to identity (rows (1,0,0) (0,1,0) (0,0,1) (0,0,0)), then commit once through OnCheckerMatrix11. The selected bone's sub at the dialog's current frame becomes identity, position 0 included.
- **Edge cases**: this is not the bind pose. A bone whose rest matrix is not identity collapses to the parent origin.
- **Written**: as a MATR delta on that frame, and on the next frame if it differs.

## 10. Add / remove a bone from the animation

**Add** (Bone menu > Animation > Add bone) → `OnAddBoneToAnm` → `CreateNewBoneInAnm(bone)` (3864) → [V]

1. `m` = the bone's mdl Matrix34, or identity when it has none.
2. For each col 0..2 and row 0..2: `m.v[row][col] *= bone.m_Scales[col]` (unsaved 2D scale). Row 3 is untouched.
3. Append the bone name to BMAP. Creates the frame array when there are no frames.
4. Every frame gets a sub with matrix m, visible = (m_Visibility != 0), flags POS|ORI|VIS. m_Visibility 2 ("default") counts as visible.

There is no duplicate-name check. FindBoneByTreeID is not checked for NULL **Bug**.

**Remove** (Bone menu > Animation > Remove bone) → `OnDelBoneFromAnm` → `(indx)` [V]

- Find the anim bone index by name and call BoneDelete.
- **Bug**: the guard is `if(Finded)` on the index, so bone 0 is never removed.
- BoneDelete unlinks that bone's sub from every frame, compacts BMAP, and decrements every sub index above indx.

The dialog's "Remove bone" (CAnimData) asks to confirm and refuses to remove the last bone.

## 11. Create a new animation

- **Entry**: Animation > Create → `OnAnmNew` [V].
- **Result**: `Header_ID = 0x60001`, frame count 1, frame 0 empty, no bones, name `new_animation.anm`, no path (the first save asks for one).
- **Next steps**: bones are added with §10 Add, frames with §3 Insert.
- **Written**: as 0x40000 (§0). A bone-less animation saves as `EANM 0x40000 FRMS 1 BMAP 0 FRMN 0`.

## 12. Anim data dialog: visibility and per-bone options

- **Bone visible**: checkbox → `OnBnClickedVisi` sets the sub's m_Visible at the dialog frame [V]. Written as VISI on that frame when it differs from the previous one.
- **Frame number, matrix edits, copy/paste matrix values**: these write straight into the sub [V]. Paste fills the 12 values from an internal 12-float buffer.
- **Law, ratio, limits, task, action, axes, min/max, matrix rewrite**: these belong to the auto-animation generator (struct `anm_task`).

The generator state, as defined in the source:

| Field | Values | Notes |
|---|---|---|
| tasks | 3 | |
| start_frame | 1 .. count-1 | |
| stop_frame | > start | |
| action | 0 Moving, 1 Rotation, 2 Show, 3 Hiding | |
| x, y, z | booleans | axes |
| min, max | v3 | |
| law | 0 Linear, 1 Boost, 2 Braking, 3 Oma, 4 Test | |
| koef | float | ratio; the edit is enabled only for law 3 |
| matrix_rewrite | boolean | |

The help texts shown per law (LawUPD):

| Law | Help text |
|---|---|
| 1 | `dX=(X1-X2)/(K1-K2-1)` |
| 2 | `X=A*t*t/2` |
| 3 | `dX(i)=K3/1000*dX(i-1)` |
| 4 | `I=U/R` |
| 5 | "Don't forget to fix this code" |

State of the generator:
- All of its controls are WS_DISABLED.
- The IDC_ANM_AUTO checkbox (1151) that would enable it is not in any dialog in SOEdit.rc.
- No code reads `task_on` or the tasks to produce frames (grep: only CAnimData sets them).

So the generator has **no implemented algorithm** [V]. A replacement must design one, for example linear `X_i = X1 + (X2-X1)*(i-K1)/(K2-K1)`, quadratic ease for Boost and Braking, and geometric `dX_i = K3/1000 * dX_{i-1}` for law 3. Any such design is new, not parity [T].

## 13. PLY merge of two files

- **Entry**: Meshs > Merge PLY files → `OnPlyMergeFiles`.
- **Inputs**: base path, append path, output path (default `<base without ext>_merged.ply`; the save dialog prompts before overwrite). Both files are loaded with CPly; a load failure gives an error.

### Step A: vertex format check

`DetectVertexFormatMismatch` [V]:
- A mismatch is any of these differing: vsize, vflags, num_weights, num_tex_coords, unknown_data_size.
- It shows a per-channel summary (normals, diffuse, specular, bump, weights, UV count, unknown size) and asks to auto-fix. No means cancel.

### Step B: `ReconcileVertexFormat`

Rewrite every append vertex to the base layout, per field. The base decides which fields exist.

| Field | Rule |
|---|---|
| position | copied |
| rhw/w | copied if the append has it, else 0 |
| weights | an array of the base's num_weights, zeroed; copy min(base, append) values |
| bone indices (4 bytes) | copied as is; zero when the append has none, which binds everything to skin bone 0 [I] |
| normal | copied, else (0,0,1) |
| psize | copied, else 0 |
| diffuse | copied, else 0xFFFFFFFF |
| specular | copied, else 0 |
| UVs | copy min(base, append) channels, missing channels are 0 |
| bump (v3 + float) | copied, else 0 |
| unknown trailing bytes | copied only when the sizes are equal, else 0 |

After the rewrite, all of the append's format fields are set equal to the base's.

### Step C: `MergeKeepSeparateTextures(append)`

1. If the base has vertices and any format field differs, fail. If the base is empty, it takes the append's format.
2. **Bones**:
   - Union of the base SKIN list and the append SKIN list. Base order is kept; unseen append names are added in their order, compared case-insensitively.
   - More than 255 → abort.
   - `bone_remap[i]` = merged index of append bone i.
3. **Vertices**: base vertices, then append vertices (deep copy with weights). When there is a remap and the format has bone indices, each of the append's 4 bone bytes `< append bone count` is replaced with `bone_remap[byte]`.
4. **Faces**: base faces, then append faces with each index + base vertex count. `INDXcount = faces*3`. IndexType = 2 (IND4) when either input was IND4 or the merged vertex count is above 65535, else 1 (INDX).
5. **ADJA**: merged only when both inputs have it; append values ≥ 0 get + base face count (short, so it overflows above 32767 faces [I]). Otherwise ADJA is dropped.
6. **SHDW**: byte arrays concatenated only when both have it, else dropped.
7. **Materials**: each append MESH entry is added at the tail with `first + baseFaceCount`, the same count, fvf, flags, specular colour, texture names, and subskin bones remapped through bone_remap. Entries are not deduplicated: "keep separate textures".
8. **Globals**:
   - Bply = OR of both.
   - GlFvf = the base's if non-zero, else the append's.
   - GlFlags |= the append's.
   - SKINNED and MROR = OR; mirror = MROR.
   - BAS2 basis: the base's only.
9. **Bounds**: BNDS = base OR append. Recomputed as the min/max of every merged vertex position.

### Step D: `WriteFile(out)` [V]

Order:

| Chunk | Content |
|---|---|
| header | `BPLY` if Bply, else `EPLY` |
| `BNDS` | 2×v3 |
| `SKIN` | int count, then per bone: byte len + chars |
| `MESH` (per mesh) | int fvf, int first, int count, int flags; DWORD specular if flags&0x200; then 1 string (2 when BPLY and not MATERIAL flag 0x400), each byte len + chars from texname[2] and [3]; if flags&0x800: byte subskin count + bytes |
| `BAS2` | 4×v3 |
| `VERT` | int n, short vsize, short vflags; per vertex: xyz, [rhw], [weights as DWORDs], [4 bone bytes], [normal], [psize], [diffuse], [specular], [UV×n], [bump v3 + float], [unknown bytes] |
| `INDX` or `IND4` | int count, then WORD×3 or int×3 per face |
| `ADJA` | int n, 3 shorts each |
| `SHDW` | int n, bytes |
| `MROR` | tag only, when mirrored |

Details and losses:
- **Bug [T]**: an empty texture name writes the 0 length byte **and** an extra 0 byte (1588).
- Losses: SUBM input becomes MESH; unknown chunks are dropped; chunk order is normalised.
- Afterwards a "Merged file saved" box. The mdl is not changed.

## 14. Merge child mesh into parent

- **Entry**: Bone menu > Merge with parent → `OnBoneMergeToParent` [V].
- **Requirements**: the bone has a parent, has a mesh (m_VolumeViewName), and has no children; otherwise an info box.

**Steps**:

1. Load the child PLY.
2. `ApplyTransform(child.Matrix34)`:
   - positions `p·R + T`; normals and bump `n·R` (no inverse-transpose, no renormalisation, no winding flip for a negative determinant) [V/I].
   - Bounds are recomputed.
   - Only the child's own local matrix is used; unsaved m_Scales and animation are ignored.
3. `RebindBoneName(child.name, parent.name)`:
   - If the parent's name is already in the SKIN list, every vertex bone byte and subskin entry that pointed at the child index now points at the parent index. The child slot is renamed to the parent name, which leaves a duplicate name.
   - Otherwise the child's entry is simply renamed.
4. Base:
   - If the parent has a mesh: load it, then run §13 steps A-C with the parent as base and the transformed child as append.
   - If the parent has no mesh: the base is a second copy of the child PLY with the same transform and rebind (no merge).
5. Output path:
   - Folder: the parent PLY's folder, or the child's when the parent has no mesh.
   - Name: `<parent PLY name>_merged_<child bone name>.ply` (ForbiddenSymbolFixer applied).
   - WriteFile (§13 D). No overwrite prompt, no `.bak`.
6. Point the parent bone's mesh at the new file (AddPly), then delete the child bone (OnBoneDelete), which also drops its volumes and sequences. The info box shows the path.

Not done:
- The mdl is not saved.
- `.anm` files still contain the child track.

## 15. Demerge a mesh into children

- **Entry**: Bone menu > Demerge → `OnBoneDemergePly` [V].
- **Requirement**: the bone has a mesh.
- **Mode prompt**: Yes = by surface, No = by tags, Cancel = all connections (Cancel does **not** cancel). An OK/Cancel confirm follows, showing the part count.

**Groups** (`CollectDemergeGroups`, 2847):

| Mode | Grouping |
|---|---|
| surface | one group per MESH entry: faces first .. first+count-1, empty groups skipped |
| tags | group the MESH entries by texture key: `texname[2]` if set, else `texname[0]`, else `"untagged"`. Groups are numbered in order of first appearance |
| all | connected face islands, where faces sharing a **vertex index** are connected (breadth-first). Vertices split at UV seams make separate islands even when they touch in space |

**Per group i** (1-based) (`BuildDemergedPlyFromFaces`, 2971):
1. Sort the face ids.
2. Copy all format and global fields from the source, including the whole SKIN list (unused bones are kept), BAS2, mirror, IndexType, and **the source bounding box unchanged** (**Bug**: stale BNDS).
3. Vertices: walk the sorted faces and corners; each new source index gets the next new index (first-occurrence order). Faces are remapped.
4. ADJA and SHDW are dropped.
5. MESH entries: runs of consecutive sorted faces with the same source mesh index (face→mesh map, 2827). For each run: first = run start in the new face order, count = run length, and that mesh's fvf, flags, specular, texture names and subskin.
6. Write `<source PLY name>_demerge_<NNN>.ply` (3 digits, from 001) into the source PLY's folder (WriteFile §13 D), without an overwrite prompt.

**Tree changes**:
- For each written part, add a child bone `<bone name>_part_<NNN>` with no matrix (identity), mesh = that file, appended after the existing children.
- The parent's mesh is removed.
- The tree is rebuilt and the first new bone selected.
- The mdl is not saved.

## 16. PLY Tweaker "Process File"

- **Entry**: bone dialog wrench → , using the dialog `PLY_Tweaker`. The OK button is relabelled "Overwrite the file" (28) and asks to confirm (486).
- **Loaded into the dialog**: Bply, basis, bbox, per mesh {fvf, first, count, flags, patch[0] = texname[2], patch[1] = texname[3]}, skin bones, MROR, ADJA, SHDW, counts, the vertex layout flags, and vflags.

**Controls and what they change**:

| Control | Effect |
|---|---|
| Material list | picks a mesh and switches to "M" mode (143-155) |
| Flag checkboxes (15) | each is one MESH_FLAG bit: TWO_SIDED 0x1, USE_ALPHA 0x2, LIGHT 0x4, PLCR 0x8, SKINNED 0x10, SHADOW 0x20, MIRRORED 0x40, BLENDTEX 0x80, BUMP 0x100, SPECULAR 0x200, MATERIAL 0x400, SUBSKIN 0x800, TWOTEX 0x1000, USINGVD 0x2000, LIGHTMAP 0x4000. Twelve have click handlers (86-101); SKINNED, BUMP and SUBSKIN are read but have no handler (disabled in the RC). Any click rebuilds the whole flag word from all 15 boxes (440-484) |
| M radio | the word replaces that mesh's flags |
| V radio | the word replaces **vflags**, the VERT header short. **Bug [I]**: these are mesh-flag bits, not vertex-format bits, and the vertex data is still written from the has_* layout, so header and data can disagree |
| Path 1, path 2 | edit patch[0] and patch[1] (path 2 only for BPLY) |
| ADJA, SHDW, MROR checkboxes | display only; never read back |
| FVF, vertex size, counts, index type, bbox | read only. The FVF is shown as "0x%d" (decimal digits behind a hex prefix) |

**On confirm**, for each mesh in order:
1. flags = the dialog flags.
2. texname[2] = patch[0] and texname[3] = patch[1]; an empty one becomes NULL.

Then:
3. `tPly.vflags` = the dialog vflags.
4. `WriteFile` over **the same path**, with no `.bak` (format and losses as in §13 D).
5. forced_ply_upd triggers a reload.

**Edge cases**:
- Toggling SPECULAR adds or removes the DWORD colour (whatever value was loaded).
- Toggling MATERIAL on a BPLY changes the string count from 2 to 1.
- Toggling SUBSKIN without subskin data writes a count of 0 [I].

## 17. Volume "Fit to bone" and "Round"

### Fit

Box: . Cylinder: [V].

1. Always shows "Auto-detection of geometry dimensions is broken." first (**Bug**: a false error).
2. Find the linked bone by name. A NULL bone is dereferenced, so it crashes when the name is not found (**Bug**).
3. : `size = mesh.bbox.max - mesh.bbox.min`, in **PLY space** (no bone matrix, no LOD), from the loaded BNDS or recomputed bounds.
4. Box: length = size.x, height = size.y, width = size.z.
5. Cylinder: by the axis radio (0 = X, 1 = Y, 2 = Z), length = size[axis] and diameter = the larger of the other two sizes.
6. The volume matrix and centre are **not** changed, so the box stays where it was (offset when the mesh is not centred on its origin).

### Round

Bone: . Volume: [V].
- Each of the 9 orientation cells becomes `(float)round(atof(text))`, which is nearest whole number, half away from zero. Position cells are unchanged.
- Result: a near-axis-aligned rotation snaps to exact 0/±1. A 45° rotation becomes 1 or 0 per cell, which is not orthonormal and gives no warning.
- Applied to the dialog values; committed on OK [I].

### 2D drag transform order

For reference, this is also used by §6. Source: and FixVolumeGeometry 1018 [V].
- The existing matrix is loaded as a GL column-major matrix, then post-multiplied by `Rx(rotX)·Ry(rotY)·Rz(rotZ)·S(scale)` (glRotatef in degrees) and read back.
- In row-vector terms: `V' = S · Rz' · Ry' · Rx' · V`. The local point is scaled first, then rotated about local Z, then Y, then X, then the old transform is applied.
- Translation is applied before that by `PreMoveMatrix` (not traced) [I].

## 18. Add LOD

- **Entry**: Bone menu > Add lod → `OnBoneAddLod` [V].
- **Requirements**: a real bone (not the top item, not a sub/LOD child).

**Algorithm**:
1. File dialog for a `.ply`.
2. parent.m_LODView = true and parent.m_Layer = -1.
3. N = 1 + the number of leading children that are LOD subs (`m_LODView && sub`).
4. New CBone:
   - parent = the bone, sub = N, m_LODView = true.
   - Name = the chosen file name with extension (after the last `\`).
   - **The PLY path is not assigned** to m_VolumeViewName [V]. The bone dialog opens next (OnBoneProp, 4121), and the user is expected to set the mesh there [I].
5. Insert the new bone after the last leading LOD child, or first when there is none.
6. Rebuild the tree, select the new bone, and update the title poly counts.

**Written**: the mdl LOD syntax comes from for `sub` / `m_LODView` bones. Not traced here [T: save a model with 2 LODs and diff].

## Coverage

| Op | Section | Specified |
|---|---|---|
| Reverse | 1 | fully |
| Lerp Fill | 2 | fully |
| Insert frame | 3 | fully |
| Delete frames | 4 | fully |
| Duplicate / move range | 5 | fully |
| Copy matrix forward | 6 | fully (trigger is UI only) |
| Save without first frame | 7 | fully (bug + intended) |
| Clone / export / import / rename track | 8 | fully, including the file format |
| Reset bone | 9 | fully |
| Add / remove bone in anim | 10 | fully |
| New animation | 11 | fully |
| Anim dialog visibility | 12 | fully |
| Anim dialog law / ratio / limits | 12 | partly: no algorithm exists upstream |
| PLY merge | 13 | fully; the empty-string double byte needs a [T] check |
| Merge child into parent | 14 | fully |
| Demerge | 15 | fully |
| PLY Tweaker | 16 | fully; V-mode effect in game [T] |
| Fit / Round | 17 | fully; PreMoveMatrix not traced |
| Add LOD | 18 | partly: the mdl output form was not traced |
| ANM FRM2 decode | §0 | partly: the quaternion → matrix math and fix_mx_ori were not re-derived |

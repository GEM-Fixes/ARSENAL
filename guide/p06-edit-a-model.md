# Edit a model or an animation

A unit's look is made of several files. The model file (`.mdl`, text) lists the bones, the meshes (`.ply`, the shapes that are drawn), the volumes (`.vol`, the shapes shells hit) and the animations (`.anm`). Materials (`.mtl`) tie meshes to textures. Meshes, volumes and animations are binary: change them with an editor, never by hand. The Models page of ARSENAL is that editor. SOEdit, the model and animation editor, can still be used beside it.

## You need

- A mod folder (see [Make a mod and see it in the game](p01-first-mod.md)).
- SOEdit only if you want it: it is not part of the ARSENAL download, and the Models page can download and install it for you.
- For a brand new model: Blender with the GEM2 Engine Tools add-on. The Models page can start a "New model" from a template and bring in a mesh from an `.obj` or `.ply`, but it does not model shapes from scratch.

## The quick way

In the Quick Guided Task row above the tabs, set "I want to" to **make** and choose **a model**, or to **change** and choose **a model of the game or of my mod**, then press Start. The task asks what the model is, which files it has and what comes with it, and can go through its bones one by one. Review lists every file before Write. See [Use the Quick Guided Task](p17-quick-guided-task.md). The steps below use the Models page, which shows the model in 3D while you change it.

## Steps

1. **Pick your mod and the model.** Open the Models page (tab Models & Sim) and press "Pick mod folder". In Unit, type part of a unit name or id and click the unit, or give a "Model file" path and press "Use this file". The page lists the "Files of" that model in groups (model, meshes, volumes, animations, materials, textures), each marked as in your mod, only in the game, or not found, and shows it in a 3D view.

2. **Change it on the page's own tabs.** The page opens every file of the model for editing; the game files are only read.
   - **Skeleton**: add, delete, move, duplicate and rename bones; their limits and speed, meshes and levels of detail.
   - **Volumes**: the hit volumes, their shape, tags, part and material; "Apply thickness" sets the armour per side.
   - **Meshes and materials**: put a mesh on a bone, move, resize or mirror it, join or split meshes, "Bring in a mesh", set textures and make materials.
   - **Animation**: see the next step.
   - **Armor**: the armour table and the shot test (see [Change armour and see the result](p05-change-armour.md)).

   Undo and Redo work for every change (Ctrl+Z, Ctrl+Y).

3. **Save into your mod.** Press Save (Ctrl+S). It first lists the files it will write, what a save would lose and what the file checks found; "Write these files" writes them into your mod at the same paths, so your copies win over the game's. The old copies of files already in your mod are kept in `.arsenal/model-edit/backup` in your mod first. On the Files tab, "Check before saving" runs the checks alone, "Undo all changes" drops everything not yet saved, and "Save as" writes the model under a new name. Every sub-tab is described in [The Models page and SOEdit](16-effects-sound-models.md#7-the-models-page-and-soedit).

4. **Change an animation.** Open the Animation tab and pick the animation; it plays in the 3D view frame by frame. You can set and delete a bone's key at a frame, and change the whole animation with "Insert after", "Delete frames", "Drop the first frame", "Set length", "Stretch", "Reverse" and "Make it loop". "Rename bone" renames a bone's track, and "Take bones from" copies tracks from another animation. The command way:

   ```
   ARSENAL soedit ops anim info mymod/<path>/fire.anm
   ARSENAL soedit ops anim reverse mymod/<path>/fire.anm --dry
   ```

   The command's first change keeps a `.bak` copy of the file.

5. **Or use SOEdit.** Open the fold "External SOEdit (optional)". Everything on the page works without it. Press "Copy into my mod" first. The model, meshes, volumes, animations and materials go to the same paths inside your mod, so your copies win over the game's. Files already there are kept. Textures are not copied; to repaint a unit use the Look & Sound page. The command way:

   ```
   ARSENAL soedit stage t34_0 --out mymod --dry
   ARSENAL soedit stage t34_0 --out mymod
   ```

   Then press "Open in SOEdit". SOEdit starts with your mod's copy. Make your change, save, and close SOEdit. To open one animation with the model, use the "External SOEdit (optional)" fold on the Animation tab. The SOEdit card says "SOEdit found" and where, with "Open SOEdit". When SOEdit is not on your computer, the button reads "Get SOEdit and open it": the confirm box names the download and its size, and the package is checked against its known checksum before it is unpacked. The command way: `ARSENAL soedit locate`, `ARSENAL soedit install`, and `ARSENAL soedit open mymod/.arsenal/soedit/<model>.stage.json` (the stage record that `stage` wrote; a copied `.mdl` path works too).

6. **Check what SOEdit changed.** Back on the Models page, press "Check what changed". It compares your files with the copies taken when you copied them, and lists what changed and anything lost on saving, such as a setting inside a bone or volume, a block of the model file, or an animation saved in another file version. The command way: `ARSENAL soedit check mymod/.arsenal/soedit/<model>.stage.json`. The SOEdit commands are in [The toolchain: `soedit`](19-toolchain.md#soedit-models-in-soedit).

7. **Check the mod and look at it.** Run `ARSENAL check mymod` and the Art check on the Look & Sound page, then look at the unit in the editor or a test match.

## What can go wrong

- **The game crashes while loading the model.** Every mesh needs its [`.mtl`](r08-vision-effects-sound.md#mtl) file, or a `.materials` file in the same folder.
- **A mesh or animation stops the game with a chunk error.** Mesh and animation files have no length fields, so one wrong field breaks the rest of the file. Edit them only on the Models page, in SOEdit or with an exporter.
- **A mesh is too big.** One mesh holds at most 65535 vertices, and one skinned part can use at most 25 bones. Split big models.
- **An animation is refused.** An [animation](r08-vision-effects-sound.md#anm) needs at least one frame and at most 255 bones; a very old file version is refused. A frame number outside the frame count is fatal at load.
- **An animation plays on nothing.** A bone track whose name is not in the model's skeleton is skipped without a message. Keep bone names as they are in the [`.mdl`](r08-vision-effects-sound.md#mdl); "Rename bone" on the Animation tab can match them.
- **A part loses its armour.** A volume named in the unit's `.def` that the model no longer has is dropped silently. Keep volume and bone names.
- **Your new texture does not show.** If a `.tga` or `.png` of the same name sits beside your `.dds` ([textures](r08-vision-effects-sound.md#textures)), the last of `.dds .tga .bmp .jpg .png` wins. DDS files saved as DX10 or with a size not divisible by 4 do not load.
- **A path in the model points nowhere.** Paths in model files are read from the folder of the file that names them, unless they start with `/`, which means `resource/`.
- **Players cannot join each other.** Model files under `entity/` are compared between players. Every player in a match needs the same version of your mod.

More causes: [Troubleshooting: models appear untextured or invisible](21-troubleshooting.md#7-symptom-models-appear-untextured-or-invisible).

## In Gates of Hell
<!-- goh: GHFMT-03 GHFMT-10 GHFMT-15 GHFMT-16 GHFMT-17 GHFMT-19 GHFMT-26 -->

The Gates of Hell notes in this book have not been tested in a running game. Check them in your own game before you depend on them.

- **ARSENAL under the GoH button** has the Models page: it opens a model of a Gates of Hell mod in the built-in editor or in SOEdit and saves into your mod folder. Its Armor part is not available there, and the model tasks of the Quick Guided Task are greyed out. To use the unit in Assault Squad 2, bring it over first with the GoH unit page ([Bring a unit from Gates of Hell](p12-unit-from-gates-of-hell.md)). Under the other games the Models page reads animation files of the kind Gates of Hell uses.
- **Animations.** The `.anm` file is laid out the same, with the same cap of 255 bones. A [`sequence`](r08-vision-effects-sound.md#sequence) whose `file` names a folder takes every `.anm` directly inside it as variants, and each unit picks one. Two new animation kinds exist, `blendspace` and `aimset`. Two animations with the same name in one list are an error.
- **Meshes.** A file `<model>#<variant>.ply` beside the model replaces the mesh while the unit wears the skin variant of that name.
- **Materials.** A mesh with no `.mtl` and no `.materials` entry loads with a dummy texture and a warning in `game.log`; the 64-bit game crashes on it. Missing textures are named in `game.log` too.
- **Textures.** Two-channel BC5 `.dds` files (often normal maps) load in Gates of Hell. Check what the 64-bit game does with such a file before you copy it over.

## More

- Part II: [Effects, sound and models](16-effects-sound-models.md#5-model-files) ([animations](16-effects-sound-models.md#animations-anm), [materials and textures](16-effects-sound-models.md#materials-and-textures)), [Data keys and entities](06-data-keys-entities.md), [The toolchain: Models](19-toolchain.md#models--sim-all-games), [File viewers](19-toolchain.md#file-viewers).
- Part III: [Armour, volumes and damage](r07-armour-volumes-damage.md), [Entity definition](r02-entity-definition.md), [Vision, effects and sound](r08-vision-effects-sound.md), entries [`.mdl`](r08-vision-effects-sound.md#mdl), [`.ply`](r08-vision-effects-sound.md#ply), [`.anm`](r08-vision-effects-sound.md#anm) and [`.mtl`](r08-vision-effects-sound.md#mtl).
- Next job: [Add or change text and translate it](p07-text-and-translation.md).

<!-- Author: Imperator_Aug (ARSENAL) -->

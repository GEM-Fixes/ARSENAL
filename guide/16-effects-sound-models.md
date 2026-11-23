# 16. Effects, Sound and Models

The short way: [Edit a model or an animation](p06-edit-a-model.md) gives the steps for copying a unit's model into your mod, changing it in SOEdit and checking the result. This chapter explains how vision, sound, effects and model files work. Every key named here has its entry in [Reference 8, Vision, effects and sound](r08-vision-effects-sound.md), which also describes the model, mesh, animation, material and texture files.

## What you will learn

- How vision and detection are described in data, and how to avoid their hard errors.
- How sound names work and how a sound folder is configured.
- How environment presets (light, fog, weather) and visual effects (FX) are defined, and what limits apply.
- What the model, mesh, volume and animation files are, and which mistakes crash the game.
- How a model is wired into a unit, and how the Models page edits it (SOEdit is optional).
- How to hear, check and convert sounds, pictures and videos with the window's helpers and viewers and with `ARSENAL sound`.

All of this is soft code except the binary files themselves. Edit in your mod folder; the vanilla data is read-only. Text files here use CRLF line endings, UTF-8 string values and ASCII identifiers; leave old cp1251 bytes inside vanilla comments as they are (see [Chapter 4](04-vfs-paks-patches.md) and [Chapter 14](14-localization.md)).

## 1. Vision and detection

How far and how well a unit sees is data. The files are `set/vision/settings.set` and `set/vision/vision.set`, a wrapper that includes `vision_presets.inc`, `vision_generic.inc` and `vision_main.inc`. A new `.inc` file must be included from `vision.set` or from a file it includes. A vision definition accepts only these keys:

| Key | Meaning |
|---|---|
| `h_fov`, `v_fov` | Horizontal and vertical field of view, in degrees; `h_fov 360` sees all round |
| `uncover` | Distance in metres within which the unit sees without facing the target |
| `radius` | Base sight radius in metres |
| `wide` | The power of the curve with which sight falls off towards the edge of the field of view; greater than 1 and at most 10 |
| `rules` | Tree of conditions with factors |
| `mods` | Flat list of multipliers |

Any other key is a hard "unexpected token" error that stops the game. A `wide` value outside its range logs "Curve power should be in range (1..10]". Do not use the same vision name twice. See [Vision files](r08-vision-effects-sound.md#vision-files).

**Rules versus mods.** The sight range is `radius` times a factor. `rules` is a tree in file order: siblings are alternatives and the first one that holds gives its factor, and its children then refine it. `mods` is a flat list in which **every** entry that holds multiplies the result. The conditions use the properties `still`, `stand`, `squat`, `crawl`, `stealth`, `firing`, `cover` and `visible`, plus custom terms that you define in `settings.set` (based on `firing`, `actor` or `breed` and a tag). A custom term defined twice, or an unknown property in a rule, is a hard error. Because the first sibling wins, the order of siblings matters: a soldier who is both still and squatting gets the factor of whichever of the two comes first.

A unit is given its vision in its definition:

```
{sensor
  {visor "main" {bone "basis"} {vision "tank_main-h"}}
}
```

Soldiers get theirs through breed perks, and the special-vision ability swaps the vision while a soldier aims through binoculars or a scope. The vision-mode extender allows exactly one of night, thermal or drone. See [Sensor and visors](r08-vision-effects-sound.md#sensor-and-visors).

**Night.** At night, sight is multiplied by the night factor (`night_vision` in the environment preset's `light` block; 0.13 when the preset does not set it). The factor is not applied to a target standing in light, such as a lamp, a burning vehicle or a flare, nor while a lightning flash is on screen. Most vanilla presets set `night_vision 1`, so their nights do not shorten sight. See [Night](r08-vision-effects-sound.md#night).

**Hearing** is configured in sound folders with `{signal shot 50}` (see below): units within that radius hear the sound unless their `hearingBias` is larger.

**Detection time.** `set/detect.set` holds tables of seconds, by distance, for how long a target stays revealed after it was spotted or after it leaves view; they are not "time to detect". They do nothing when fog of war is off. Fog of war is a player video option, and a mod can only force it from a mission with the `fog_mode` command (see [Chapter 12](12-missions-and-multiplayer-setup.md)). See [Detection and fog of war](r08-vision-effects-sound.md#detection-and-fog-of-war).

### In Gates of Hell

<!-- goh: GHVIS-104 GHVIS-08 GHVIS-120 GHVIS-121 GHVIS-122 GHVIS-82 -->

- `set/detect.set` has its reveal tables per unit tag; the first tag a unit has that the file names decides. Assault Squad 2 knows only soldiers and everything else.
- The fog of war option is read when a scene starts; changing it during a game takes effect at the next one.
- The sight grid is finer (5 units a cell instead of 7), and a sight test aims at the centres of the target's volumes instead of random points, so the same scene gives the same answer every time.
- The fog opens for your own units and for allies that you can select or that carry the tag `no_select_visor`.
- In thermal view, decals, particles and scenery show only when their material has `EmitsHeat`.

## 2. Sound

Sound names are **paths under `/sound/`**: either a folder or a file. There are no aliases. A weapon's `fireSound` maps to `weapon/shot/...` and `reloadSound` to `weapon/reload/...`. A name that matches nothing logs "unknown sound file" and plays silence.

- Only `.wav` files are played. `.ogg` and `.mp3` files in sound folders are ignored. Use mono, 44100 Hz, 16-bit PCM or IMA ADPCM, as the vanilla files are; sounds placed in the world should be mono.
- When a name is a folder, a random file is picked each time, and every file plays once before any repeats.
- Each folder may contain `folder.set`. Its keys are `Tag`, `Loudness`, `Distance`, `MinDistance`, `MaxDistance`, `Volume`, `Signal` and `SignalPeriod`; any other key is an error. A folder inherits these from its parent folder, with one exception: a sub-folder with its own `folder.set` starts its distances again from the `default` loudness class, so repeat `Loudness` (or `Distance`) there. A folder with no `folder.set` anywhere above it gets tiny built-in distances (silent beyond 5 m) and the general group. The vanilla gun folder has:

```
{sound
	{loudness "shoot loud"}
	{signal shot 50}
	{volume 1.2}
}
```

- `Tag` picks one of four groups, `effects`, `emotions`, `speech` or `environment`; any other tag (such as `main_environment`) falls into a general group. `ARSENAL fxlint` warns about this.
- `sound/sound.set` holds the loudness classes (minimum and maximum distance and a priority) and the share of sound channels each group gets. A new class there can be used at once by any `folder.set`.
- At most three copies of one file play at once, and a copy that would start within 50 ms of another at the same point is dropped.
- The sample rate and the group list cannot be changed by data.

Music is in `music/` and is played by the mission `music` command. See [Sound](r08-vision-effects-sound.md#sound).

Three more rules that cost people time: `sound/sound.set` must have a loudness class named `default`, or the game crashes when it reads the first `folder.set`; a `folder.set` that names a loudness class `sound.set` does not have uses `default`; and an `.ogg`, `.mp3` or `.flac` file renamed to `.wav` stays silent.

**In the window.** The Look & Sound page (tab Models & Sim) has the sound helpers:

- "Sound of this weapon": type a weapon name and press "Find sound". It shows the sound name the weapon's file uses, the folder and the files in the game, and plays them as the game does. Weapons built by macros may not show.
- "Check a wav file": reads a `.wav` and says whether the game can play it.
- "Make this sound playable in game": turns a sound that is already in your mod folder into IMA ADPCM (small, like most game sounds) or 16-bit PCM. Mono or stereo stays as it is. "Write the sound into my mod" writes it where you say.
- "ffmpeg recipe (make a safe wav)": two command lines for the free ffmpeg program, one for a 16-bit mono wav and one for IMA ADPCM.

A `.wav` opened in the window's sound viewer (see [File viewers](19-toolchain.md#file-viewers)) plays as the game would play it: at a distance and direction you choose, with your own volume settings or the game defaults, and with the muffling and fall-off of the game's sound library (close to the game, not exact). "Next as the game picks" plays the files of the folder in the shuffled order the game uses. "Burst test" fires the sound again and again like a machine gun, with the game's limits: at most 3 copies of one file at a time, a copy within 50 ms of another dropped, checked every 50 ms. "Stretch to seconds" shows how a sound fits a set time; the game does this only for reload sounds. "Names that play it" lists every sound name that reaches the file, and the notes say what the game will do with it.

The same play model is a command:

```
ARSENAL sound resolve weapon/shot/gun/85to100_cal/88mm_flak41
ARSENAL sound info <file or name> --distance 100
ARSENAL sound decode <file or name> --out my.wav
ARSENAL sound sweep --mod mods/mymod
```

`resolve` shows the folder, files and settings a sound name reaches (a weapon's `fireSound` gets `weapon/shot/` in front). `info` gives the header, notes, folder settings and how the game plays it; `--bearing`, `--ambient` and `--profile` (your own volumes) change the case. `play` plays it, `decode` writes a plain 16-bit wav (never inside the game folder), and `sweep` reads every wav of the game or your mod and lists the files that will not play.

The quick way: the Quick Guided Task "I want to make" or "change" then "a sound" (or "a voice set") covers the wav files and their conversion, the folder settings, the loudness class and a weapon's fire or reload sound. See [Use the Quick Guided Task](p17-quick-guided-task.md).

### In Gates of Hell

<!-- goh: GHVIS-29 GHVIS-30 GHVIS-31 GHVIS-33 GHVIS-25 GHVIS-27 GHVIS-140 -->

- A sub-folder keeps the distances it inherits from its parent; only the top folder starts from the `default` loudness class. In Assault Squad 2 a sub-folder's own `folder.set` must repeat them (see above).
- A folder's `Volume` also scales sounds that do not come from a place, such as interface sounds and weather loops. In Assault Squad 2 it does not.
- A sound placed in the world from a folder with no minimum distance is stopped, and the log says "An ambient sound ... not marked as ambient, otherwise minDistance and maxDistance are required".
- `/sound/filters/filters.set` defines named filter chains (`bandpass`, `lowpass`, `parameq`) that every sound from a place goes through. An unknown filter type crashes the game.
- The console command `snd_restart` restarts the sound system and loads the sounds again, so you can hear a change without a restart.
- Sounds are probably still `.wav` only (not confirmed).

## 3. Environment presets

An environment preset is one file in `set/environment/` (sub-folders are read too); its name is the file name. A map picks it with its `{Environment ...}` entry, and a mission can switch it with the `environment {name time apply}` command. The allowed blocks are `light`, `wind`, `haze`, `sky`, `weather`, `thunder`, `video_overlay`, `grain`, `dof` and `glow`. A block you leave out keeps its defaults, and an unknown block is an error. See [Environment presets](r08-vision-effects-sound.md#environment-presets).

Practical rules:

- Only one blend between presets runs at a time. A preset name that does not exist does nothing and says nothing.
- There is no day and night clock; the time of day is whatever preset is active.
- `weather` and `thunder` are off unless the block has `{enable}`. Thunder also needs a `sound`, or no strike ever happens. At most 2000 rain or snow drops are drawn.
- Weather affects gameplay only through the interaction conditions `{if rain}` and `{if sunlight}`, which are evaluated when a script runs (see [Chapter 11](11-interaction-scripts.md)). Haze does not reduce what units see. Wind moves only water and particles that follow the wind.

### In Gates of Hell

<!-- goh: GHVIS-117 GHVIS-64 GHVIS-57 GHVIS-74 GHVIS-100 -->

- The `wind` block takes `direction`, `main_strength`, `detail_strength` and `height_amplification`, and wind also sways vegetation. The Assault Squad 2 keys `speed` and `amplitude` are not read, so an Assault Squad 2 preset has no wind there.
- The `grain` block is accepted but does nothing.
- A map can have `Haze` with `boundary` and `altitude` parts, and a preset can set `sky_haziness`. The 64-bit game refuses a map with that `Haze` entry.
- A blend between presets runs at the same pace at any frame rate.

## 4. Effects (FX)

An FX is an ordinary entity `.def` whose root block is `{fx ...}`. Inside it you add views: `SpriteView`, `ParticleView`, `LightView` and `DecalView`. Scripts spawn an effect with `{spawn "fx_name"}`. **There is no `{emit}` action in interaction scripts**; using it is an error ("unknown action"), and `ARSENAL fxlint` reports it. See [Effects (FX)](r08-vision-effects-sound.md#effects-fx).

Limits:

- At most 40000 particles exist at once. Extra ones are silently not created.
- `set/fxmanager.set` defines groups with `countLimit` and `timeLimit`; when a group is full the oldest effect is removed first. Decal-like effects and tracer effects **must** be listed there, or the game logs "must be defined in fxmanager.set" and drops them.
- `set/entitymanager.set` limits how many corpses, wrecks, flying shells and similar objects stay on the map, and how they are removed. Higher limits cost frame time.
- Craters are `land_patch` entities. Surface-specific hit effects are scripts in `set/interaction_terrain/effects/`, one file per ground material.

### Level of detail (LOD)

LOD files are `level_of_detail.set` (the normal camera), `level_of_detail_manual.set` (direct control) and `level_of_detail_zoom.set` (looking through sights). Distances are in map units and must strictly increase from level to level. A flag such as `off` carries over into every later level. An entity picks its LOD class with `{lodclass "name"}`. See [Level of detail and rendering keys](r08-vision-effects-sound.md#level-of-detail-and-rendering-keys).

### Texture variants

A texture `T` may have variants in files named `T#variant.dds`, such as `armor#2a.dds` beside `armor.dds`. An action `{tex_mod "name"}` switches to a variant, and the model's `{TexMods}` block can pick one by option, such as a season.

### Camera

Camera parameters live in `set/registry/camera.reg`. Camera shake stays off unless the console variable `cam_shake` is not zero. The third-person camera values are not in a file you can change.

### In Gates of Hell

<!-- goh: GHVIS-37 GHVIS-126 GHVIS-115 GHVIS-50 GHVIS-42 GHFMT-10 GHVIS-10 GHVIS-89 GHDC-35 -->

- Sprite views take `UseHQ` and `Halo {Scale {Min} {Max}}`. The 64-bit game stops on both with "unexpected token", so remove them from an effect you bring over.
- Lamps use `light_bone`, `break_fx` and `break_bone`, and the extender `weaponlight` gives a weapon a light. Assault Squad 2 lamps use its own numbered scheme.
- There is a fourth LOD file, `level_of_detail_scenario.set`, and the LOD files take `minzoom`, `grassthinnerdepth`, `grassthinnerpower` and `shadowfallofffactor`, with the level flags `noparallax`, `nobump`, `nospecular` and `parallaxstepsk`. The 64-bit game stops on these, so do not copy a Gates of Hell LOD file over.
- A texture variant also finds its frames in the common textures. A skin variant can also swap the mesh: variant `camo` shows `tank#camo.ply` when that file exists. In Assault Squad 2 a `#variant.ply` file is never used.
- The third person camera is set in `/set/tp_control.set` (see [Chapter 15, Gates of Hell: summary](15-interface-and-icons.md#gates-of-hell-summary)). The field of view key is `camera/main/fov`. Camera shake is a player option, and the console command `cam_shake` is gone.

## 5. Model files

A unit's look is made of several files. They are found by their path in the game's virtual file system, so a mod may ship only the files it changes and reuse the rest from the game.

| Extension | What it is | Kind |
|---|---|---|
| `.mdl` | The model: bone tree, meshes, hit volumes, animations | Text |
| `.ply` | A mesh, the shape that is drawn | Binary, starts with `EPLY` (or `BPLY`) |
| `.vol` | A hit volume, the shape shells hit | Binary, starts with `EVLM` |
| `.anm` | An animation | Binary, starts with `EANM` |
| `.mtl` | A material: how a mesh surface is drawn | Text |
| `.ebm`, `.tex` | Texture descriptions | Text |
| `.dds`, `.tga` | Textures | Standard picture formats |
| `.wav` | Sound | Standard |
| `.avi` | Video | See below |

Binary files are little-endian, and the game decides the format by the file extension. Sizes and positions are in model units, 20 to the metre.

### The model file (.mdl)

The `.mdl` is text. It holds one `{Skeleton}` with the bones, and may hold `{Volume}`, `{Obstacle}` and `{Area}` blocks. Each bone shows its mesh with `{VolumeView "x.ply"}` (despite the name, this is the drawn mesh, not a hit volume). A bone in a vanilla tank looks like this:

```
{bone revolute "turret"
	{parameters "ID=turret;"}
	{speed 0.01}
	{Position -2.94537 1.28551 12.6135}
	{VolumeView "turret.ply"}
	{bone revolute "gun_rot"
		{parameters "ID=gun_rot;"}
		{limits -8 22}
		{speed 0.01}
		...
	}
}
```

- Bone types are `revolute` (turns about its own axis), `prizmatic` (slides), `socket` and `planarsocket` (turn about two axes), and `wild`; a bone without a type is fixed. Any other type word is "unexpected token".
- `{speed}` and `{limits low high}` (degrees) are valid **only** on a typed bone. On a plain bone they give "unexpected token", and `{speed 0}` logs "Zero speed in ik-bone".
- `{Position}`, `{Orientation}` and `{Matrix34}` place the bone relative to its parent, applied in the order they are written.
- `{parameters "..."}` holds entries such as `ID=` (the vehicle part the mesh belongs to, used for part highlighting and components) and `WheelRadius=`.
- `{LODView}` lists one view per level of detail, and `{OFF}` hides the bone from that level on.

Keep the standard bone names (`body`, `turret`, `gun_rot`, `gun`, `seat01`, `wheell*`, `trackl`, `fx*` and so on), because the unit's `.def` and the macros it includes look them up. A renamed bone shows up as "Bone X not found" (the setting is ignored) or a fatal "unexpected token". See [.mdl](r08-vision-effects-sound.md#mdl) and [bone (model)](r08-vision-effects-sound.md#bone-model).

**Animations in the model.** An `{animation}` block on the root bone or on any bone declares sequences by name, such as `{sequence "open" {resume}}` or `{sequence "repair" {file "turret_r.anm"} {speed 0.8}}`. A sequence without `{file}` loads `<name>.anm` from the model's folder. Options are `speed`, `resume` (keep the last pose), `store`, `movement`, `pinback`, `smooth`, `autostart`, `duration`, `rotate`, `dynamicspeed` and `blend` with `pose`; any other word is "unexpected token". The `.def` and scripts start sequences by these names. See [sequence](r08-vision-effects-sound.md#sequence).

**Bone changes from the .def.** A `.def` can change bones of its model, for example `{bone "gun_rot" {limits -5 15}}`, but only after its `{Extension}` line, or the game logs "Bone modifiers must be placed after skeleton load".

### Meshes (.ply)

A mesh is a list of chunks: `BNDS` (the bounding box, which must be the real extent), `SKIN` (bone names, for skinned meshes such as soldiers), one `MESH` header per material part, then `VERT` (the vertices) and `INDX` (the triangles). **The chunks have no stored lengths**, so one wrong field makes everything after it unreadable ("Invalid chunk in .PLY file"). Triangles use 16-bit indices, so one mesh holds at most 65535 vertices, and one skinned part can use at most 25 bones. Each part names its material; ship every `.mtl` the mesh names (or a `.materials` file beside it), or the game **crashes** while loading. This holds for a copied mesh too: copy the `.mtl` beside the `.ply`. See [.ply](r08-vision-effects-sound.md#ply).

### Hit volumes (.vol)

A `.vol` holds the chunks `VERT`, `INDX` and `SIDE`. `SIDE` gives each triangle a side number, which picks the armour thickness from the unit's `{thickness}` list: 1 front, 2 top, 3 left, 4 right, 5 rear and 6 bottom. Every triangle needs a side number. Hit volumes defined in the `.mdl` and in the `.def` are merged **by name**; a volume without a shape, or one on a bone that does not exist, is dropped without a message, and its armour is lost. [Reference 7, Armour, volumes and damage](r07-armour-volumes-damage.md) describes the `{Volume}` block and the thickness list.

### Animations (.anm)

An animation starts with `EANM` and a file version, which must be version 3 or later (the game's own files are version 6). It lists its bones (at most 255) and then the frames (at least one). Frames between two key frames are interpolated, and a bone the animation does not key keeps its rest pose. A track for a bone that is not in the skeleton is skipped without a message, so keep bone names exactly as in the `.mdl`. See [.anm](r08-vision-effects-sound.md#anm).

### Materials and textures

A material file names its type and its textures. A vanilla tank material is:

```
{material bump
	{diffuse "t34s"}
	{bump "$/model/t34s_bp"}
	{specular "$/model/t34s_sp"}
	{color "229 229 229 0"}
	{blend none}
}
```

Types are `simple`, `bump`, `layered`, `envmap`, `ocean` and `gui.text`. Texture names carry **no extension**; a bare name is looked up next to the model. See [.mtl](r08-vision-effects-sound.md#mtl) and [textures](r08-vision-effects-sound.md#textures).

For a texture name, a `.tex` or `.ebm` description wins (`.tex` before `.ebm`). Otherwise the game tries `.dds`, `.tga`, `.bmp`, `.jpg` and `.png` in that order and the last one found wins, so a stray `.tga` next to your `.dds` replaces it (unconfirmed for the order between them in play). DDS rules: DXT1 to DXT5 and 32-bit are fine; the DX10 header and volume textures are not supported ("DXT10 textures are not supported"), ATI2 (BC5) gives "Unknown DDS picture format", and a compressed texture needs a width and height divisible by 4. Save new DDS files with mip maps. See [.ebm and .tex](r08-vision-effects-sound.md#ebm-and-tex). The window's picture viewer shows a texture with its channels and mipmaps and says whether the game can load it; its rules are listed in [Chapter 15, Icons from your own PNG](15-interface-and-icons.md#icons-from-your-own-png).

The quick way for a new paint: the Look & Sound page's "Camo helper" writes the `{TexMods}` line for a new option (for example `{"Autumn" "aut"}`) and tells you the variant file to paint, `name#variant.dds`. The Quick Guided Task "a skin or camouflage" does the same and can get you a game texture to paint.

### Video

Video `.avi` files use an Xvid or other MPEG-4 Part 2 picture (H.264 does not play) and an MP3 sound track. The exact conversion settings that work are unconfirmed. See [.avi](r08-vision-effects-sound.md#avi).

The window's video viewer (see [File viewers](19-toolchain.md#file-viewers)) reads an `.avi` the way the game does and says for "Picture in the game" and "Sound in the game" whether each plays, with the reason. The rules it checks:

- The game decodes only MPEG-4 Part 2 pictures (XVID, DIVX, FMP4); H.264 and others show garbage or nothing.
- Stream 0 must be the picture and stream 1 the sound. A file with one stream plays without sound.
- The sound plays only as MP3.
- Frames inside `rec` lists are skipped, and the `idx1` index is not used.
- When video and sound have different lengths, they drift apart.

When the file will not play, the viewer gives an ffmpeg command line that makes one the game plays. "Play in my video player" opens the file in the computer's own player, after asking.

### In Gates of Hell

<!-- goh: GHFMT-03 GHFMT-05 GHFMT-33 GHFMT-07 GHFMT-08 GHFMT-11 GHFMT-12 GHFMT-13 GHFMT-29 GHFMT-15 GHFMT-16 GHFMT-17 GHFMT-18 GHFMT-19 GHFMT-25 GHFMT-26 GHFMT-36 GHFMT-37 GHFMT-01 -->

The file kinds are the same, but Gates of Hell reads more in them and fails more gently. A Gates of Hell model brought to Assault Squad 2 must lose what the 64-bit game does not know; see [Bring a unit from Gates of Hell](p12-unit-from-gates-of-hell.md).

- **Textures.** BC5 (ATI2) DDS files load; Assault Squad 2 logs "Unknown DDS picture format" and shows nothing, so convert them to DXT5 or 32-bit. A texture that exists but cannot be read shows a checker pattern and the log says "Unable to create image from resource ... Using checker"; a missing one logs "Texture not found, using the checker". A picture listed twice in a common texture stops the game ("Duplicate bitmap in common texture"). Under `interface/` and `map/` only `name02` or `name_02` counts as a frame of `name`.
- **Materials.** New `.mtl` keywords: `lightmap`, `No_Outlines` and `Dxt1OpacityFix`, and on bump materials `specular_intensity`, `gloss_scale` and `full_specular`. The 64-bit game stops on them. The same `parallax_scale` draws half as deep in Gates of Hell. `EmitsHeat` is a flag there with no number.
- **A missing material** does not crash: the mesh loads grey and the log says "Material not found ... Using dummy texture." In Assault Squad 2 the same model crashes the game.
- **Animations.** New animation types `blendspace` and `aimset`, sequence options `additive` and `events`, and a sequence `file` that names a folder picks one `.anm` of that folder at random. Two animations with the same name are an error ("Animation with duplicate name"). The 64-bit game knows none of these. Gates of Hell `.anm` files are version 6.1, which the 64-bit game reads with the same layout.
- **Skeleton.** The bone name `##skeleton_views##` is reserved, and bones may have the parameter `Land`, which the 64-bit game does not know.
- **Video** is decoded by a newer Xvid; the format rules are the same.

## 6. Wiring a model into a unit

A vehicle has a chain of references. The unit's `.def` names its model with `{Extension "x.mdl"}`. The `.mdl` names a mesh for each bone, each mesh names its `.mtl`, and the `.mtl` names the textures. Sequences name `.anm` files, and `{Volume}` blocks name `.vol` files. Everything is joined **by name only**. Any referenced file that is missing ends the game with "Resource not found". A path in a model file is read from the folder of the file that names it, unless it starts with `/`.

**Broken and destroyed views.** When a part is broken, the game loads the entity `<id>_x`, and when it is destroyed, `<id>_xx`. Bone names in those models must match the live model.

**Private copies.** When you change a model that other units share, copy it under your own name first: `<unit>.mdl` with volumes `<unit>__<vol>.vol`, and point your unit's `{Extension}` at it. Nothing is then changed by accident for a vanilla unit.

### In Gates of Hell

<!-- goh: GHFMT-20 GHFMT-21 GHFMT-22 GHFMT-23 -->

Some bone and animation names the game looks for differ, so a model moved between the games may load but not move right.

- Track rollers are numbered bones `roller_01`, `roller_02` and so on, each with its own `roller_NN_joint`; the single Assault Squad 2 bone `roller` is not found. An Assault Squad 2 tank in Gates of Hell has running gear that does not follow the ground, and the other way round no roller moves.
- A wheel whose parent bone is named exactly `suspension` rides the terrain.
- Soldiers aim with the bones `ik_lng`, `ik_lat` and `ik_socket` instead of `ik_updown`.
- The empty-hand idle animation is `stand_idle_empty`; Assault Squad 2 uses `stand_idle_empty_1` to `_4`.

## 7. The Models page and SOEdit

Mesh, volume and animation files are binary: change them with an editor, never by hand. The **Models page** (tab Models & Sim) is that editor. It opens every file of a unit's model for editing in the window; the game files are only read, and Save writes the files you changed into your mod at the same paths.

1. Pick your mod folder ("Pick mod folder"), then find the unit by name, or give the path of a `.mdl` and press "Use this file" (or "Browse...").
2. The page lists the "Files of" the model in groups (model, meshes, volumes, animations, materials, textures), each marked as in your mod, only in the game, or not found.
3. Make your changes on the page's own tabs. Undo and Redo work for every change (Ctrl+Z, Ctrl+Y).
4. Press Save (Ctrl+S). It first lists the files it will write, what a save would lose and what the file checks found; "Write these files" writes them. The old copies of files already in your mod are kept in `.arsenal/model-edit/backup` in your mod first.

The page's own tabs:

| Tab | What you do there |
|---|---|
| Model | The 3D view of the model, the file list and the Shot tool. |
| Animation | Play an animation in the 3D view frame by frame; set and delete a bone's key at a frame; insert, delete or stretch frames, reverse, make it loop, add a closing frame; add, rename, copy or remove a bone's track; a timeline to drag keys, copy ranges and fill between two keys with an ease; the model's sequences. |
| Skeleton | "Bones of the model": add, delete, move, duplicate and rename bones (also inside the animations), joint type, place, limits and speed, the bone's mesh, levels of detail and sequences. |
| Volumes | "Collision volumes": add a box, cylinder or sphere, or one made from the bone's mesh; shape, place, tags, component and material; "Apply thickness" sets the armour in mm per side; polyhedron `.vol` files; "Obstacles and areas". |
| Meshes and materials | Put a mesh on a bone or take it off; move, resize, mirror, flip faces, make normals and tangents, join close vertices, levels of detail, skin bones, join or split meshes; "Save as OBJ"; "Bring in a mesh" from an `.obj` or `.ply`; set textures and make materials. |
| Files | Save, "Check before saving", "Undo all changes", "Save as" or "Save a copy" under a new name, the file list, "The model as text" (and "Open in Editor"), Export to a folder or zip, a draft copy every few minutes, Preferences and Keys. The Start card reopens a recent model or makes a "New model" from a template. |
| Armor | "Armour: thickness, map and shot test" and "Behind the armour". |

The **3D view** shows one or four panes, with the model's look, its collision volumes or both, and switches for meshes, volumes and bones. Q, W, E and R pick the select, move, turn and scale handles for the selected bone or volume.

When an animation is opened, the page says its file version: version 6 is the kind the game ships, older kinds (mostly soldier animations) still load, and a very old one is refused.

**SOEdit** is an outside model and animation editor. Everything on the page works without it; the fold "External SOEdit (optional)" on the Model tab is for those who still want it. "Copy into my mod" copies the model, meshes, volumes, animations and materials to the same paths in your mod (files already there are kept; textures go to a view cache, not into your mod). "Open in SOEdit" opens your mod's copy. After you save and close SOEdit, "Check what changed" compares your files with the copies taken before and lists what was lost on saving, such as a setting inside a bone or volume, a whole block of the model file, comments, or an animation saved in another file version. If SOEdit is not on the computer, the card at the foot of the page offers "Get SOEdit and open it", which asks first, downloads the package and checks it. The command way:

```
ARSENAL soedit locate
ARSENAL soedit stage <unit> --out <mod folder> --dry
ARSENAL soedit open <mod folder>/.arsenal/soedit/<model>.stage.json
ARSENAL soedit check <mod folder>/.arsenal/soedit/<model>.stage.json
```

The animation changes of the Animation tab also exist as a command: `ARSENAL soedit ops anim <operation> <file.anm>`, with `--dry` to preview. `ARSENAL soedit ops` alone lists every operation, including ones for meshes (`ply`) and volumes (`vol`).

The **Armor** tab shows the armour thickness of each part of a vehicle and tests a gun and shell against it; see [Chapter 9, section 11](09-weapons-ammo-damage.md#11-seeing-and-testing-armour-in-the-arsenal-window) and [Chapter 17](17-balance-pricing-gameplay.md#the-armour-simulator).

The quick way: the Quick Guided Task "I want to make" or "change" then "a model" copies a game model or brings your files, then changes bones, meshes, volumes, animations and the unit's definition. See [Use the Quick Guided Task](p17-quick-guided-task.md) and [Edit a model or an animation](p06-edit-a-model.md).

See also: [Chapter 19, Models & Sim](19-toolchain.md#models--sim-all-games).

### In Gates of Hell

<!-- goh: GHFMT-15 GHFMT-16 GHFMT-37 -->

Under the GoH button the Models page opens, edits and saves Gates of Hell models as well, with the built-in editor or SOEdit; only its Armor part is switched off there, because Gates of Hell works out armour in another way. It reads a Gates of Hell `.anm` (version 6.1) like any other. A model taken from Gates of Hell must first lose the animation types and bone keys the 64-bit game does not know (section 5); [Bring a unit from Gates of Hell](p12-unit-from-gates-of-hell.md) shows how ARSENAL does that.

## 8. Checking headers and effects

```
ARSENAL binhdr <game folder> --mods mymod
ARSENAL fxlint mods/mymod --game <game folder>
```

`binhdr` reads the header of each `.ply`, `.anm`, `.dds`, `.vol`, `.mdl`, `.ebm` and `.wav`, and checks across files: does each volume the `.def` names exist in the `.mdl`, does each animated bone exist, does a stray `.tga` hide a `.dds`. `fxlint` finds sound tags the game does not know, unknown interaction actions such as `emit`, weather or thunder without `{enable}`, thunder without a sound, and tracers missing from the FX manager list. The Art check on the Look & Sound page checks pictures, meshes, animations and sounds of your mod.

See also: [Chapter 18: Testing and Logs](18-testing-and-logs.md) for the log lines these files cause, and [Check a mod, fix it, read the log](p14-check-fix-read-log.md).

## Gates of Hell: summary

The Gates of Hell notes in this book have not been tested in a running game. Check them in your own game before you depend on them.

| Section | Gates of Hell | In short |
|---|---|---|
| 1. Vision and detection | [differs](#in-gates-of-hell) | Reveal tables per unit tag, finer sight grid, `no_select_visor`, `EmitsHeat` for thermal view |
| 2. Sound | [differs](#in-gates-of-hell-1) | Sub-folders keep distances, folder volume on all sounds, `filters.set`, `snd_restart` |
| 3. Environment presets | [differs](#in-gates-of-hell-2) | New wind keys, `grain` ignored, map haze |
| 4. Effects (FX) | [differs](#in-gates-of-hell-3) | New sprite and lamp keys, more LOD keys, mesh variants, `tp_control.set` |
| 5. Model files | [differs](#in-gates-of-hell-4) | BC5 textures, checker and grey dummy instead of crashes, new material and animation keys |
| 6. Wiring a model into a unit | [differs](#in-gates-of-hell-5) | Numbered rollers, `suspension` bone, new aiming bones |
| 7. The Models page and SOEdit | [differs](#in-gates-of-hell-6) | No model page for Gates of Hell; its `.anm` files read fine |
| 8. Checking headers and effects | not mapped | `binhdr --paks <folder>` also reads Gates of Hell paks |

## Pitfalls

- Unknown keys in a vision definition are fatal.
- Misspelled sound names are silent.
- A stray `.tga` can hide your `.dds`.
- A missing `.mtl` crashes the game at load.
- Removing or renaming a standard bone breaks the `.def`.
- `{speed}` or `{limits}` on a bone without a type is fatal.
- An animation track for a bone the model does not have does nothing.
- A volume whose bone is gone loses its armour without a message.
- FX that are not listed in the FX manager are dropped.
- DX10-format DDS files do not load.
- Model files under `entity/` are compared between players: everyone in a match needs the same version of your mod.

**Next:** [Chapter 17: Balance, Pricing and Gameplay](17-balance-pricing-gameplay.md)

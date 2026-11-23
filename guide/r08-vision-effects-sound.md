# Reference 8: Vision, Effects and Sound

This page lists the keys and files that decide what a unit sees, what the player sees and hears, and how models and animations are put together: vision and sensors, detection and fog of war, sound folders and loudness, environment presets, effect (FX) entities, the effect and corpse limits, level of detail, the camera, and the model, animation, texture and sound file kinds. Each entry gives where the key is written, its type, the values the game accepts, what it does, its limits, a short example and where to read more. The longer explanation is in [Chapter 16](16-effects-sound-models.md).

Units used on this page: distances in data files are in metres unless stated; positions inside model files are in model units (20 units make one metre); angles are in degrees; times are in seconds.

## Vision files

The game loads the named visions from `set/vision/settings.set` and `set/vision/vision.set`. In vanilla, `vision.set` has the signature `visions` and only includes `vision_presets.inc`, `vision_generic.inc` and `vision_main.inc`. A mod may ship its own `settings.set` and `.inc` files without replacing `vision.set`.

### vision
Where: `set/vision/*.inc` (inside the `visions` file), as `{"name" ...}`; or inline inside a `visor`.    Type: block with a name.
Values: the keys `h_fov`, `v_fov`, `uncover`, `radius`, `wide`, `rules`, `mods`.
Does: A named sight profile: how far, how wide and how well a unit sees, and how the target's pose and cover change it.
Limits: Any other key is an "unexpected token" error that stops the file. Two visions with the same name are not safe: give each a new name. An inline vision cannot replace a named one (`Cannot overload predefined vision`).
Example:
```
{"vision_humancrew"
  {radius 40} {uncover 7} {h_fov 70}}
```
See: [visor](#visor), [Chapter 16, section 1](16-effects-sound-models.md#1-vision-and-detection).

### radius
Where: inside a vision.    Type: number, metres.
Values: any positive number. Vanilla infantry 70, crew 40, optics 90.
Does: The longest distance at which the vision can see a target, before rules and mods scale it.
Limits: At night the distance is also multiplied by the environment's `night_vision` (see `night`).
Example: `{radius 70}`
See: [rules](#rules), [mods](#mods).

### uncover
Where: inside a vision.    Type: number, metres.
Values: vanilla infantry 7.
Does: Inside this distance a target is seen whatever its cover or pose.
Limits: none known.
Example: `{uncover 7}`
See: [radius](#radius).

### h_fov
Where: inside a vision.    Type: number, degrees.
Values: 0 to 360; 360 sees all round. Default 0.
Does: Horizontal field of view of the visor.
Limits: A visor whose vision has `h_fov 0` is inactive and sees nothing.
Example: `{h_fov 360}`
See: [v_fov](#v_fov).

### v_fov
Where: inside a vision.    Type: number, degrees.
Values: up to 180.
Does: Vertical field of view of the visor.
Limits: none known.
Example: `{v_fov 180}`
See: [h_fov](#h_fov).

### wide
Where: inside a vision.    Type: number.
Values: greater than 1 and at most 10.
Does: The power of the curve with which sight falls off towards the edge of the field of view.
Limits: A value outside the range logs `Curve power should be in range (1..10]`.
Example: `{wide 2}`
See: [h_fov](#h_fov).

### rules
Where: inside a vision.    Type: tree of blocks.
Values: blocks named by a target property (`still`, `stand`, `squat`, `crawl`, `stealth`, `firing`, `cover`, `visible`, or a custom term from `settings.set`), each with a factor and optional child rules.
Does: Scales the sight distance by the state of the target. Sibling rules are tried in order and the first that matches wins; its children refine the factor. When nothing matches, the factor is 1.0.
Limits: Order matters: a broad rule above a narrow one hides it. `firing` means the target fired within the last second.
Example:
```
{rules
  {human 1
    {firing 1.15}}}
```
See: [mods](#mods), [terms](#terms).

### mods
Where: inside a vision.    Type: flat list of blocks.
Values: the same property names as `rules`, each with a factor.
Does: Every matching entry multiplies the sight distance, unlike `rules` where only the first match counts.
Limits: none known.
Example: `{mods {stand 1}}`
See: [rules](#rules).

### terms
Where: `set/vision/settings.set`.    Type: block.
Values: `{name property "tag"}`, where property is `firing`, `actor` or `breed`.
Does: Defines a custom word that `rules` and `mods` can test, for example a breed or a unit tag.
Limits: A name defined twice logs `custom term "<name>" already defined`; an unknown property logs `incorrect property`.
Example: `{terms {sniper breed "sniper"}}`
See: [rules](#rules).

### ranges
Where: `set/vision/settings.set`.    Type: block.
Values: `{human {<vision>}}`, `{vehicle {<vision>}}`.
Does: Names the visions used to judge the range class of humans and vehicles.
Limits: none known.
Example: `{ranges {human {human}} {vehicle {vehicle_03}}}`
See: [vision](#vision).

## Sensor and visors

### sensor
Where: entity `.def`, top level.    Type: block.
Values: the keys in this section.
Does: The sight and memory of a unit: its visors, how long it remembers a target and how far it shares what it sees.
Limits: none beyond those of its keys.
Example:
```
{sensor
  {visor "main" {vision "flag_point"} {bone "visor"}}
  {operatableRequired 0}}
```
See: [visor](#visor).

### visor
Where: inside `{sensor}`.    Type: block with a name.
Values: `{bone "name"}`, and `{vision "name"}` or an inline vision block.
Does: One eye of the unit, fixed to a bone, with its vision profile. Vehicles have several (driver, commander, gunner).
Limits: An unknown vision name logs `Vision "<name>" not found`.
Example: `{visor "commander" {bone "turret"} {vision "tank_main-m"}}`
See: [vision](#vision).

### RememberTime
Where: inside `{sensor}`.    Type: number, seconds.
Values: default 120.
Does: How long a unit remembers a target it can no longer see. Each unit varies the time between 0.8 and 1.2 times the value.
Limits: none known.
Example: `{RememberTime 60}`
See: [RecognizeTime](#recognizetime).

### RecognizeTime
Where: inside `{sensor}`.    Type: number, seconds.
Values: default 2.
Does: The time needed to recognise a target at the full sight range; nearer targets are recognised faster in proportion.
Limits: none known.
Example: `{RecognizeTime 3}`
See: [RememberTime](#remembertime).

### ThreatZone
Where: inside `{sensor}`.    Type: number, metres.
Values: default 15.
Does: Enemies inside this distance count as a threat to the unit.
Limits: none known.
Example: `{ThreatZone 20}`
See: [AttackZone](#attackzone).

### AttackZone
Where: inside `{sensor}`.    Type: number, metres.
Values: default 5.
Does: Enemies inside this distance count as attacking the unit.
Limits: none known.
Example: `{AttackZone 5}`
See: [ThreatZone](#threatzone).

### InformRange
Where: inside `{sensor}`.    Type: two numbers, metres.
Values: default 0. The first value is for AI units, the second for units the player controls and for the multiplayer AI side.
Does: Friendly units inside this distance learn about what this unit sees.
Limits: none known.
Example: `{InformRange 40 40}`
See: [sensor](#sensor).

### OperatableRequired
Where: inside `{sensor}`.    Type: switch.
Values: default on.
Does: While on, the sensor works only when the unit is operatable (for a vehicle, while it has crew).
Limits: none known.
Example: `{OperatableRequired 0}`
See: [sensor](#sensor).

### UnmaskProfile
Where: inside `{sensor}`.    Type: string.
Values: a profile name from `set/unmasking.set`.
Does: Chooses the rules by which this unit gives itself away (see `unmasking`).
Limits: Thinly described.
Example: `{UnmaskProfile "<profile name>"}`
See: [unmasking](#unmasking).

### Subject, External
Where: inside `{sensor}`, written by saved games.    Type: block.
Values: written by the game.
Does: The targets the unit knows about when the game was saved.
Limits: Do not write them in mod data.
Example: (written only in saves)
See: [RememberTime](#remembertime).

### hearingBias
Where: entity `.def`.    Type: number, metres.
Values: any number.
Does: The unit does not hear sound signals whose radius is smaller than this value.
Limits: none known.
Example: `{hearingBias 4.5}`
See: [Signal](#signal).

### extender vision_mode
Where: `{extender "vision_mode" ...}` in an entity `.def`.    Type: block.
Values: exactly one of `night`, `thermal`, `drone`.
Does: Gives the unit a special camera mode for the player.
Limits: A second mode logs `Only one vision mode per actor is supported right now.`; an unknown mode logs a message that begins `Make sure you added a supported vision mode`.
Example: `{extender "vision_mode" {night}}`
See: [SpecialVision](#specialvision).

### SpecialVision
Where: an ability file in `set/ability/`, written `{"name" from specialvision ...}`.    Type: block.
Values: `{item "name"}`, `{vision "name"}`, `{aimed_vision "name"}`.
Does: Switches the unit to another vision while it holds an item (binoculars), and to `aimed_vision` while aiming.
Limits: none known.
Example:
```
{"field_glass" from specialvision
  {item "field_glass"}
  {vision "soldier_focused"}
  {aimed_vision "field_glass"}}
```
See: [Reference 5](r05-humans.md).

## Detection and fog of war

### detect
Where: `set/detect.set`.    Type: block.
Values: `{"human"|"vehicle" "attack"|"visible" {metres seconds} ...}`. Vanilla human attack: 0 m 3.0 s, 80 m 2.0 s, 82 m 0; human visible: 0 m 3, 40 m 2, 90 m 2, 110 m 1; vehicle attack: 0 m 5, 150 m 3, 170 m 2.5, 190 m 1, 191 m 0; vehicle visible: 0 m 3, 130 m 1.5.
Does: How long a unit stays revealed in the fog of war after it fires (`attack`) or is seen (`visible`), by distance.
Limits: These are reveal times, not times to detect. They do nothing when fog of war is off, and apply only to what the local player sees.
<!-- goh: GHVIS-104 -->
Gates of Hell: the curves are chosen per entity tag (the first tag the unit has decides), not only human or vehicle.
Example: `{"human" "attack" {0 3.0} {80 2.0} {82 0}}`
See: [Fogable](#fogable).

### fog_mode
Where: mission command.    Type: command.
Values: see [Reference 11 (mission files)](r11-mission-files.md).
Does: Fog of war is a video option of the player. A mission can force it on or off only with this command.
Limits: There is no data key that forces fog of war.
<!-- goh: GHVIS-08 GHVIS-120 -->
Gates of Hell: fog of war is still a player option, but changing it in Options takes effect only when the next scene starts. The mission fog mode starts as "default", which means the player's option.
Example: (see [Reference 11](r11-mission-files.md), mission files)
See: [Fogable](#fogable).

### Fogable
Where: entity `.def`.    Type: word.
Values: `auto`, `always`, `never`.
Does: Whether the entity is hidden by the fog of war.
Limits: none known.
Example: `{Fogable never}`
See: [SpawnedInFog](#spawnedinfog).

### SpawnedInFog
Where: entity `.def` or saved game.    Type: switch.
Values: present or absent.
Does: Marks an entity that appeared while hidden in the fog.
Limits: none known.
Example: `{SpawnedInFog}`
See: [Fogable](#fogable).

### unmasking
Where: `set/unmasking.set`.    Type: block.
Values: `{unmasking {profile "name" {rule <term> {time a b} {range a b} {instant r}} ...}}`, with terms `true`, `speed`, `item`, `skin`, `pose`, `examine`, combined with `and`, `or`, `not`.
Does: Rules by which a unit gives its position away, for example by moving fast or carrying a weapon.
Limits: The exact meaning of each field is not described yet; test before relying on it.
Example:
```
{rule {speed 10} {range 7 30} {time 5 10}}
{rule {or {pose "move down"} {pose "repair"}} {instant 3}}
```
See: [UnmaskProfile](#unmaskprofile).

## Night

### night
Where: `{light ...}` block of an environment preset.    Type: switch.
Values: present or absent.
Does: Marks the preset as night. Sight ranges are then multiplied by `night_vision`, unless the target is lit by a light or lightning is shown.
Limits: Without `{night}` the `night_vision` value has no effect.
Example: `{light {night} {night_vision 0.3}}`
See: [night_vision](#night_vision).

### night_vision
Where: `{light ...}` block of an environment preset.    Type: number, factor.
Values: default 0.13. Vanilla: 105 presets use 1, six use 0.3, one uses 0.2.
Does: Multiplies sight ranges at night.
Limits: Works only with `{night}`. A `LightView` near the target (a flare, a burning wreck) counts as lit and cancels it.
<!-- goh: GHVIS-71 -->
Gates of Hell: lights whose view is local (small lamps on a model) no longer count as lighting the target, so they do not cancel the night penalty.
Example: `{night_vision 0.3}`
See: [LightView](#lightview).

## Sound

Sound names in data are paths under the `sound/` folder, without the extension. A name that is a folder plays a random `.wav` from it, taken from a shuffled list so the same file does not repeat at once. There are no aliases. Weapon `fireSound` names live under `weapon/shot/`, `reloadSound` under `weapon/reload/`.

### sound name
Where: any key that takes a sound (`fireSound`, `reloadSound`, FX `{sound}`, scripts).    Type: string.
Values: a folder or file path under `sound/`.
Does: Picks what is played.
Limits: A name that does not exist logs `unknown sound file '<name>'` and plays nothing. At most 3 copies of one file play at once, and a copy starting within 50 ms of the same one is dropped.
Example: `{fireSound "mg42"}`
See: [folder.set](#folderset).

### folder.set
Where: any folder under `sound/`, signature `sound`.    Type: file.
Values: the keys `Tag`, `Loudness`, `Distance`, `MinDistance`, `MaxDistance`, `Volume`, `Signal`, `SignalPeriod`.
Does: Settings for every sound in the folder and its subfolders; a subfolder inherits from its parent unless it has its own.
Limits: An unknown key gives "unexpected token". A subfolder with its own `folder.set` starts again from the `default` loudness: repeat `{Distance}` or `{Loudness}` in it to keep the parent's values. `{Volume}` on a folder of sounds not placed in the world (interface, weather loops) has no effect.
<!-- goh: GHVIS-29 GHVIS-30 GHVIS-31 -->
Gates of Hell: a subfolder keeps the distances it inherits from its parent; only the top folder starts from the `default` loudness. `{Volume}` also scales sounds not placed in the world. A placed sound whose folder has no minimum distance is stopped, and a warning names the folder.
Example:
```
{Tag "effects"} {Loudness "shoot normal"} {Distance 10 400}
```
See: [Tag](#tag), [Loudness](#loudness).

### Tag
Where: `folder.set`.    Type: string.
Values: `effects`, `emotions`, `speech`, `environment`; any other word counts as the "other" group.
Does: Puts the sounds into a volume and channel group (see `percent`).
Limits: Vanilla `main_environment`, used by six folders, falls into the "other" group.
Example: `{Tag "speech"}`
See: [percent](#percent).

### Loudness
Where: `folder.set`.    Type: string.
Values: a name from the `loudness` rows of `sound/sound.set`.
Does: Sets how far and with what priority the sound is heard.
Limits: none known.
Example: `{Loudness "blast big"}`
See: [loudness](#loudness).

### Distance, MinDistance, MaxDistance
Where: `folder.set`.    Type: numbers, metres.
Values: `{Distance min max}` or the two single keys; folder defaults 0 and 100.
Does: Full volume up to the minimum, silence beyond the maximum.
Limits: none known.
Example: `{Distance 10 400}`
See: `snd_rolloff` in [sound console variables](#sound-console-variables).

### Volume
Where: `folder.set`.    Type: number, factor.
Values: default 1.0.
Does: Volume of the folder's sounds.
Limits: none known.
Example: `{Volume 0.8}`
See: [folder.set](#folderset).

### Signal
Where: `folder.set`.    Type: name and number.
Values: a signal name (`movement`, `shot`, `hit`, `injure`, `explosion`, `mandie`, `sound`, `ally_info`) and a radius in metres.
Does: Playing the sound also tells nearby AI units that something happened, so they can react.
Limits: Units with a `hearingBias` larger than the radius ignore it.
Example: `{signal explosion 20}`
See: [SignalPeriod](#signalperiod), [hearingBias](#hearingbias).

### SignalPeriod
Where: `folder.set`.    Type: number, seconds.
Values: any number.
Does: The shortest time between two signals from the same source.
Limits: none known.
Example: `{SignalPeriod 1}`
See: [Signal](#signal).

### percent
Where: `sound/sound.set`.    Type: row `{percent group share [max]}`.
Values: vanilla `effects` 45, `emotions` 15 max 2, `speech` 10 max 1, `environment` 20, `main_environment` 10.
Does: Share of the sound channels each group may use, and optionally the most sounds of that group at once.
Limits: A group with no row gets 20% and a limit of 1000.
Example: `{percent "speech" 10 1}`
See: [Tag](#tag).

### loudness
Where: `sound/sound.set`.    Type: row `{loudness name min max [priority]}`.
Values: 19 rows in vanilla, for example `default` 20 0, `shoot normal` 10 0 priority 20, `blast big` 50 0 priority 40, `canonade` 400 0.
Does: Named distance and priority classes that `Loudness` in `folder.set` refers to.
Limits: A mod `sound.set` replaces the whole file: keep every name your data uses and `default`, or the game stops with `No 'default' loudness in sound.set`.
Example: `{loudness "hit" 15 500 15}`
See: [Loudness](#loudness).

### sound console variables
Where: game console.    Type: console commands.
Values: `snd_disable`, `snd_maxFilePlayedChannels`, `snd_cutoffPart`, `snd_keepTime`, `snd_antiReverbThreshold`, `snd_rolloff`.
Does: Switch sound off and tune channels, cut-off and roll-off while testing.
Limits: none known.
<!-- goh: GHVIS-25 GHVIS-26 GHVIS-95 GHVIS-28 -->
Gates of Hell: `snd_restart` reloads the sounds without restarting the game. `snd_ambientBuffersCount` (default 8) caps the sounds not placed in the world. The media variables are renamed `snd_maxMediaChannels` (default 4) and `snd_mediaDisabled`. `snd_compressorGain`, `snd_compressorMix` and `snd_compressorRatio` do not exist.
Example: `snd_disable 1`
See: [Chapter 18](18-testing-and-logs.md), [Chapter 16, section 2](16-effects-sound-models.md#2-sound).

## Environment presets

An environment preset is one file in `set/environment/` with the signature `environment`. The mission command `environment {name time apply}` blends to it; only one blend runs at a time and there is no game clock that changes it by itself.

### environment preset
Where: `set/environment/<name>`.    Type: file.
Values: the blocks `light`, `wind`, `haze`, `sky`, `weather`, `thunder`, `video_overlay`, `grain`, `dof`, `glow`.
Does: Sets the light, sky, weather and screen effects of a map.
Limits: An unknown block logs `unknown environment parameters "<x>"`. Applying a preset that does not exist logs `Can't apply environment preset "<name>", using defaults` when a map loads it, and does nothing at all when a mission command asks for it.
<!-- goh: GHVIS-75 GHVIS-52 -->
Gates of Hell: presets can also have the blocks `ocean_wave_works` and `render_tweaks`, which this game does not know (it logs `unknown environment parameters`). See [Gates of Hell only](#gates-of-hell-only).
Example: `{light ...} {haze {enable} {start 2000} {end 4200}}`
See: [Reference 11 (mission files)](r11-mission-files.md), [Chapter 16, section 3](16-effects-sound-models.md#3-environment-presets).

### light
Where: environment preset.    Type: block.
Values: `direction` (default -0.78 0 -0.62), `ambient`, `diffuse`, `specular` (colours as `0xAARRGGBB`), `specularPower`, `{night}`, `night_vision` (0.13), `lightsIntensity` (0.2), `{draw_sun_moon}`, `sun_moon_radius`, `color_correction`, `camera_lens_effetcs`.
Does: Sun direction and colours, night, the strength of lamps, colour grading and lens effects.
Limits: `camera_lens_effetcs` must be written with this spelling.
<!-- goh: GHVIS-66 GHVIS-65 GHVIS-67 -->
Gates of Hell: the `specular` colour is not read; one number `specularIntensity` (default 1) scales the specular of materials instead. New groups: `rim_light {color strength}` (the rim light shows only when its strength is above 0), `tone_mapping` (used with the HDR video option), `color_shading` gains an intensity, and `camera_lens_effetcs` gains a mission-wide `vision_mode` (thermal, night or drone). This game does not know these keys: remove them when you bring a preset over.
Example: `{light {direction -0.6 0.2 -0.7} {night_vision 0.3}}`
See: [night](#night), [color_correction](#color_correction).

### color_correction
Where: inside `{light}`.    Type: block.
Values: `gamma`, `brightness`, `contrast`, `saturation`, `tone`, `tone_strength`, `{color_shading {enable} {shade_tone}}`.
Does: Colour grading of the whole picture.
Limits: none known.
Example: `{color_correction {saturation 0.9} {contrast 1.1}}`
See: [light](#light).

### camera_lens_effetcs
Where: inside `{light}`.    Type: block.
Values: `{light_scattering {enable} {intensity} {ray_length} {color_tone}}`, `{lens_dirt {enable} {texture}}`, `{screen_brightening {enable} {intensity}}`.
Does: Sun rays, dirt on the lens and a brightening of the screen.
Limits: Some vanilla presets also write keys inside `light_scattering` that no source describes (listed at the end).
Example: `{camera_lens_effetcs {lens_dirt {enable} {texture "..."}}}`
See: [light](#light).

### wind
Where: environment preset.    Type: block.
Values: `speed x y z`, `amplitude` (default 2).
Does: Wind for water and particles.
Limits: Wind does not move shells or units.
<!-- goh: GHVIS-117 GHVIS-64 -->
Gates of Hell: the wind block has the keys `direction`, `main_strength` (0 to 1), `detail_strength` (0 to 10) and `height_amplification` (0 to 5); `speed` and `amplitude` are not read, so a preset from this game loses its wind there. Wind also sways plants, and blends between presets.
Example: `{wind {speed 2 1 0} {amplitude 2}}`
See: `NoDependOnWind` in [Mover](#mover).

### haze
Where: environment preset.    Type: block.
Values: `enable`, `color` (default b4bed2), `start` (2000), `end` (4200).
Does: Distance fog.
Limits: `end` must be greater than `start`, and `start` at least 0.
<!-- goh: GHVIS-74 -->
Gates of Hell: a map can also have a `Haze` block with boundary haze (on by default) and height haze (`altitude`, off by default), and a preset can set `altitude_strength` and `sky_haziness`. This game rejects a map `Haze` block.
Example: `{haze {enable} {start 1500} {end 3500}}`
See: [light](#light).

### sky
Where: environment preset.    Type: block.
Values: `enable`, `texture`, `globalEnvironment`, `color`, `intensity` (0.5), `azimuth`.
Does: The sky picture and its reflection.
Limits: none known.
Example: `{sky {enable} {intensity 0.5}}`
See: [light](#light).

### weather
Where: environment preset.    Type: block.
Values: `enable`, `density`, `fx`, `"speed x"`, `"speed y"`, `"speed z"`, `"reverse speed probability"`, `sound`, `volume`, `"sound 2"`, `"volume 2"`, `"sound 3"`, `"volume 3"`.
Does: Rain or snow: falling particles and their sounds.
Limits: Off unless `{enable}` is written. At most 2000 drops. Scripts test `{if rain}`, which is false for snow.
Example: `{weather {enable} {density 0.6} {sound "ambient/rain"}}`
See: [thunder](#thunder).

### thunder
Where: environment preset.    Type: block.
Values: `enable`, `interval a b`, `color`, `sound`.
Does: Lightning flashes at random intervals.
Limits: Off unless `{enable}` is written, and no strike happens while `sound` is empty.
Example: `{thunder {enable} {interval 10 30}}`
See: [weather](#weather).

### video_overlay
Where: environment preset.    Type: block.
Values: `on`, `file`, `color`.
Does: Plays a video over the picture.
Limits: none known.
Example: `{video_overlay {on} {file "..."}}`
See: [.avi](#avi).

### grain
Where: environment preset.    Type: block.
Values: `enable`, `colorAmount`, `grainAmount`, `grainParticleSize`, `lumAmount`.
Does: Film grain.
Limits: none known.
<!-- goh: GHVIS-57 -->
Gates of Hell: the block is accepted but nothing in it is read, so preset grain does nothing there.
Example: `{grain {enable} {grainAmount 0.05}}`
See: [light](#light).

### dof
Where: environment preset.    Type: block.
Values: `enable`, `near_scale`, `far_scale`, `near_start`, `near_end`, `far_start`, `far_end`, `{"3rd_Person" {"3rdP_blurscale" f}}`, `blur_strength`.
Does: Depth of field blur.
Limits: none known.
<!-- goh: GHVIS-59 -->
Gates of Hell: `dof` gains a second set of ranges, `Scenario Settings`, used while a mission video or voice plays, and `3rdP_blur_strength` (a whole number of passes) replaces `3rdP_blurscale`, which it no longer reads. Remove `Scenario Settings` when you bring a preset over.
Example: `{dof {enable} {far_start 300} {far_end 900}}`
See: [glow](#glow).

### glow
Where: environment preset.    Type: block.
Values: `enable`, `amount`.
Does: Glow around bright areas.
Limits: none known.
<!-- goh: GHVIS-53 -->
Gates of Hell: `glow` also has `threshold` (default 1.1), which only matters with the HDR video option on.
Example: `{glow {enable} {amount 0.4}}`
See: [dof](#dof).

## Effects (FX)

An effect is an entity `.def` whose root is `{fx ...}`. Data and scripts start one with `{spawn "name"}`. Inside, views draw it: `SpriteView`, `ParticleView`, `LightView` and `DecalView`. A view written as `{#+ ...}` is folded in editors but still read; a view written `{## ...}` is skipped.

### fx
Where: root of an effect `.def`.    Type: block.
Values: views, `{sound "name"}`, and the effect keys below.
Does: Declares an effect entity. `{sound}` plays once when it spawns.
Limits: There is no `{emit}` action; scripts that use it log `unknown action`. At most 40000 particles exist at once; more are silently not made.
Example:
```
{fx {sound "explosion/small"}
  {SpriteView {Sprite "$/flash01"} ...}}
```
See: [spawn in Reference 10](r10-interaction-scripts.md#spawn-1), [Chapter 16, section 4](16-effects-sound-models.md#4-effects-fx).

### SpriteView
Where: inside `{fx}`.    Type: block.
Values: `Sprite` (a texture; `$/` means `texture/fx/`), `Offset`, `AutoVisible`, `Orientation`, `Normal`, `NormalXY`, `NormalXZ`, `NormalYZ`, `Billboard`, `Trace`, `Halo`, `ConstantSize`, `SoftIntersection`, `EmitsHeat`, `UseDirection`, `{ground}`, `{layer ...}`, `{NotifyOwner}`, `{delay s}`, and the channels below.
Does: One flat picture: a flash, a glow, a tracer.
Limits: none known.
<!-- goh: GHVIS-37 GHVIS-38 GHVIS-39 GHVIS-41 -->
Gates of Hell: a sprite view also takes `UseHQ` and `Halo {Scale {Min} {Max}}`, which this game rejects as "unexpected token": remove them when you bring an effect over. Halos fade more sharply by angle, and sprites on a scaled bone are scaled too. A view marked `Fire` no longer shows only at night: add `NightOnly` to keep that.
Example: `{SpriteView {Sprite "$/flash01"} {Billboard} {delay 0.05}}`
See: [sprite channels](#sprite-channels).

### sprite channels
Where: inside `SpriteView`.    Type: blocks.
Values: `Visibility`, `Scale`, `Light`, `Highlight`, each a curve: `{linear {min} {max}}` or `{npower {min} {max} {pow}}`; `{timer {mode play|loop} {duration s [rand]}}`; `{preTurn a b}`.
Does: Change the sprite over its lifetime: fade, grow, brighten.
Limits: none known.
Example: `{Scale {linear {min 0.5} {max 2}}} {timer {mode play} {duration 0.3 0.1}}`
See: [SpriteView](#spriteview).

### LightView
Where: inside `{fx}` or a model bone.    Type: block.
Values: `type point`, `animator`, `attenuation0`, `attenuation1`, `attenuation2`, `radius`, `effectonground`, `offset`, `falloff`, `phi`, `theta`, `priority`, `pulseperiod`, `intensity`, `radiusfalloff`.
Does: A dynamic light.
Limits: A light counts as lighting its surroundings for night sight (see `night_vision`).
<!-- goh: GHVIS-70 GHVIS-71 -->
Gates of Hell: `TimeToLive` (seconds, default 0 means never) makes a light go out by itself; this game does not read it. A local light no longer counts for night sight.
Example: `{LightView {type point} {radius 8} {intensity 1.5}}`
See: [night](#night), [night_vision](#night_vision).

### ParticleView
Where: inside `{fx}`.    Type: block.
Values: `delay`, `Offset`, `AutoPause`, and the blocks `Generator`, `Mover`, `Visualizer`, `EntityGenerator`.
Does: A particle system: smoke, dust, sparks, debris.
Limits: Counts toward the 40000 particle limit.
Example: `{ParticleView {Generator ...} {Mover ...} {Visualizer ...}}`
See: [Generator](#generator).

### Generator
Where: inside `ParticleView`.    Type: block.
Values: `{TotalParticles n [spread]}`, `{TimeToLive s}` (below 0 means unlimited), `ParticlesInBlock`, `{EmissionArea {Radius} {Alpha0} {Alpha1} {Psi} {Theta} {Speed} {DistributionLaw disk|sphere}}`, `{ParticleInit {Speed} {Lifetime}}`, `AxisZ`, `AutoTurn`, `OwnerSpeed`, `Color`.
Does: How many particles are made, where and with what start speed and life.
Limits: none known.
<!-- goh: GHVIS-85 GHVIS-86 -->
Gates of Hell: a generator that restarts can make more than `TotalParticles`, so smoke and fire can come out thicker after a restart. Rarely, an `EmissionArea` angle makes a whole block of particles vanish.
Example: `{Generator {TotalParticles 40 10} {TimeToLive 1.5}}`
See: [Mover](#mover).

### Mover
Where: inside `ParticleView`.    Type: block.
Values: `Gravity`, `Damping`, `Vector`, `Value`, `{Collisions {Terrain} {Objects} {Once} {Reflection}}`, `Restitution`, `NoDependOnWind`.
Does: How the particles move: gravity, drag, wind, bounces.
Limits: none known.
<!-- goh: GHVIS-84 -->
Gates of Hell: particles that follow the wind (no `NoDependOnWind`) drift at a speed set by the wind and the game speed, so the same effect drifts differently in the two games.
Example: `{Mover {Gravity -2} {Damping 0.5} {Collisions {Terrain}}}`
See: [wind](#wind).

### Visualizer
Where: inside `ParticleView`.    Type: block.
Values: stage blocks `Stage`, `Initial`, `Collided`, `Dying`, each with `{Sprite}`, `{Freq}` and `{Flags {KillParticle} {MatchSprites} {Ground}}`; `RandomSprites`.
Does: Which picture a particle shows in each part of its life.
Limits: none known.
Example: `{Visualizer {Stage {Sprite "$/smoke01"}} {RandomSprites}}`
See: [Generator](#generator).

### EntityGenerator
Where: inside `ParticleView`.    Type: block.
Values: `{Entity "name" {Freq}}`.
Does: Makes particles spawn another entity or effect.
Limits: none known.
<!-- goh: GHVIS-88 -->
Gates of Hell: also takes `{Align x|y|z|invx|invy|invz}` to aim the spawned entity, and `{SpinX v [spread]}`, `SpinY`, `SpinZ` to turn it; this game reads only the entity and its frequency.
Example: `{EntityGenerator {Entity "debris_small" {Freq 0.2}}}`
See: [fx](#fx).

### DecalView
Where: inside `{fx}`.    Type: block.
Values: a decal material and size.
Does: Puts a mark on the ground or a surface (a crater, a scorch).
Limits: Ground decals must be listed in `fxmanager.set` (see `fxmanager`).
<!-- goh: GHVIS-81 GHVIS-82 -->
Gates of Hell: a static decal whose sprite is animated logs `<model>: Static decal with non-constant sprite animator` and becomes dynamic. Decals, particles and batched scenery show in the thermal view only when marked `EmitsHeat`.
Example: `{DecalView ...}`
See: [fxmanager](#fxmanager).

### fxmanager
Where: `set/fxmanager.set`.    Type: block.
Values: groups `{name {fx "n"} ... {countLimit n} {timeLimit s}}`. Vanilla: `shellholes` 40, `tracks` 700 for 10 s, `blood` 40, `flashes` 0.05 s.
Does: Caps how many ground marks and tracers of a kind exist and how long they last.
Limits: A ground or tracer effect not listed logs `Entity "<name>" must be defined in fxmanager.set before add`. Vanilla misses `tracewheel06`.
Example: `{shellholes {fx "crater_small"} {countLimit 40}}`
See: [entitymanager](#entitymanager).

### entitymanager
Where: `set/entitymanager.set`.    Type: block.
Values: `Enabled`, `CountScale`, and groups `{group "n" actor|gameentity|stuff|dead {limit} {remove instant|bury|dissolve} {entity} {tag} {DeadVehicles}}`. Vanilla limits: dead 30, broken 5, piece 10, stuff 100, equip 30, shellhole 50.
Does: Removes the oldest corpses, wrecks, dropped items and pieces when a group passes its limit.
Limits: none known.
Example: `{group "dead" dead {limit 30} {remove bury}}`
See: [fxmanager](#fxmanager).

## Level of detail and rendering keys

### level_of_detail.set
Where: `set/level_of_detail.set`, `level_of_detail_manual.set`, `level_of_detail_zoom.set`; signature `levelofdetail`.    Type: file.
Values: `ZoomFactor`, `GrassDistance`, `GrassFadeDepth`, `GrassZoomFactor`, and classes `{name {distance d {NoFog} {NoGetShadow} {NoCastShadow} {off}} ...}`.
Does: At what camera distance each class of model drops shadows, fog or disappears.
Limits: Distances in a class must grow, or the game logs `Distance should be farther than previous one`. A flag stays on in later levels. An empty class logs `Empty LOD class '<name>' in <file>`. Vanilla scales the distances by 0.75 in multiplayer and 0.70 in co-op. Console `r_LODEnable 0` turns it off for testing.
<!-- goh: GHVIS-115 GHVIS-72 GHVIS-50 -->
Gates of Hell: there is also `level_of_detail_scenario.set`, and the files take `minzoom`, `grassthinnerdepth`, `grassthinnerpower` and `shadowfallofffactor` (how far sun shadows reach; 0 means no shadow distance). Levels take the flags `noparallax`, `nobump`, `nospecular` and `parallaxstepsk`. This game stops on these keys: remove them when you bring a level of detail file over.
Example: `{tank {distance 400 {NoCastShadow}} {distance 900 {off}}}`
See: [lodclass](#lodclass), [Chapter 16, Level of detail](16-effects-sound-models.md#level-of-detail-lod).

### lodclass
Where: entity `.def`.    Type: string.
Values: a class name from `level_of_detail.set`.
Does: Chooses the distance rules for this entity.
Limits: none known.
Example: `{lodclass "decor_medium"}`
See: [level_of_detail.set](#level_of_detailset).

### NoCastShadows, NoGetShadows, UseShadow
Where: entity `.def`.    Type: switches.
Values: present or absent.
Does: Turn off the shadow the entity casts or receives, or choose a simple shadow.
Limits: none known.
Example: `{NoCastShadows}`
See: [lodclass](#lodclass).

### RimLight
Where: entity `.def`.    Type: switch.
Values: present or absent.
Does: Draws a rim light on the model.
Limits: none known.
Example: `{RimLight}`
See: [light](#light).

### UseDecal, DecalOrder, DecalTarget, DecalTargetDynamic
Where: entity `.def`.    Type: switches and number.
Values: `DecalOrder` a whole number.
Does: Whether the entity takes decals, in what drawing order, and whether it is a target for decals while moving.
Limits: none known.
Example: `{UseDecal} {DecalOrder 2}`
See: [DecalView](#decalview).

### TexMods, texmod
Where: entity `.def`.    Type: block of string pairs.
Values: `{TexMods {"Option" "variant"}}`; texture files named `T#variant.dds`.
Does: Picks a texture variant (camouflage, markings) for the model.
Limits: none known.
Example: `{TexMods {"camo" "winter"}}`
See: [textures](#textures).

### camera
Where: `set/registry/camera.reg`.    Type: block.
Values: `{perspective {viewAngle 23} {distance 1600} {fov 65}}`, `{parallel {viewAngle 90} {distance 2000} {fov 0} {centered 1}}` in vanilla.
Does: The player's camera angle, distance and field of view.
Limits: Camera shake is off unless the console variable `cam_shake` is not 0. The third person camera is not set in a moddable file.
<!-- goh: GHVIS-89 GHVIS-10 GHVIS-106 -->
Gates of Hell: camera shake is the game option `camera_shakes` and `cam_shake` is gone; shakes are stronger and stop more abruptly. The field of view key is `camera/main/fov`, so a `camera/perspective/fov` setting is ignored there. Cameras also take `zNear`, `zFar` and `depthScale`.
Example: `{camera {perspective {viewAngle 30} {distance 1800} {fov 60}}}`
See: [Chapter 16, Camera](16-effects-sound-models.md#camera).

## Model and animation file kinds

### .mdl
Where: next to the model files of an entity.    Type: SDL text file.
Values: one `{Skeleton ...}` with bones and `{animation {sequence ...}}`, plus `{Volume}`, `{Obstacle}` and `{Area}` blocks.
Does: Builds the model: the bone tree, which mesh each bone shows, its animations and its hit shapes.
Limits: Keys apply in the order they are written. A missing view file logs `Unknown view`.
<!-- goh: GHFMT-17 GHFMT-36 GHFMT-38 -->
Gates of Hell: two animations with the same name stop the load with `Animation with duplicate name`; this game keeps both. The bone name `##skeleton_views##` is reserved. A view that fails to load no longer takes a level of detail slot, so the later levels move down by one.
Example:
```
{Skeleton
  {bone "body" {VolumeView "body.ply"}
    {bone revolute "turret" {VolumeView "turret.ply"}}}}
```
See: [bone (model)](#bone-model), [volume in Reference 7](r07-armour-volumes-damage.md#volume) for `{Volume}`, [Chapter 16, section 5](16-effects-sound-models.md#5-model-files), [Edit a model or an animation](p06-edit-a-model.md).

### bone (model)
Where: inside `{Skeleton}` of a `.mdl`.    Type: block `{bone [type] "name" ...}`.
Values: type `revolute`, `prizmatic`, `socket`, `planarsocket`, `wild`, or none. Keys: `Bone` (child), `View`, `SpriteView`, `VolumeView` (the mesh), `ParticleView`, `DecalView`, `LODView {.. {OFF}}`, `ControlBone`, `Name`, `Matrix34`, `Position`, `Orientation`, `Visibility`, `Parameters`, `Terminator`, `Animation`, `Color`, and for typed bones `limits`, `speed`, `speed2`.
Does: One joint of the model. A typed bone can turn or slide (turrets, guns, wheels, doors).
Limits: Any other type word gives "unexpected token". `{limits lo hi}` and `{speed}` on a bone without a type give "unexpected token". `{speed 0}` logs `Zero speed in ik-bone "<name>"`. `State` is accepted but does nothing.
<!-- goh: GHFMT-37 GHFMT-20 GHFMT-21 GHFMT-22 -->
Gates of Hell: bones take a `Land` parameter, which is "unexpected token" here. Several bone names differ: track rollers are numbered (`roller_01`, `roller_02`, each with `roller_NN_joint`) where this game uses one `roller` and `roller_joint`; a bone named `suspension` above a wheel lets it ride the ground; soldiers aim with `ik_lng`, `ik_lat` and `ik_socket` where this game uses `ik_updown`. On a model brought over, no roller follows the ground (renaming one to `roller` makes only that one follow), and soldiers lose the aim bend. See [Bring a unit from Gates of Hell](p12-unit-from-gates-of-hell.md).
Example: `{bone revolute "gun_rot" {limits -8 20} {speed 15}}`
See: [Parameters](#parameters).

### Parameters
Where: inside a model bone.    Type: string.
Values: entries such as `"ID="`, `"WheelRadius="`, `"Radius="`, `CommonMesh`, `align`.
Does: Extra settings read by other parts of the game, for example the wheel radius used by the chassis.
Limits: none known.
Example: `{Parameters "WheelRadius=6.2"}`
See: [Reference 4](r04-chassis-and-movement.md).

### sequence
Where: inside `{animation}` of the `.mdl`.    Type: block with a name.
Values: `file`, `speed`, `resume`, `store`, `movement`, `pinback`, `smooth`, `autostart`, `duration` (frames or percent), `rotate`, `dynamicspeed`, `blend`/`pose`.
Does: Declares an animation the game and scripts can play by name.
Limits: A sequence without `file` loads `<name>.anm`. `dynamicspeed` ranges must meet exactly, or a near miss leaves a range with zero speed. Avoid `duration frames N`: it can crash the game.
<!-- goh: GHFMT-15 GHFMT-16 GHFMT-18 GHFMT-19 GHFMT-34 GHFMT-35 -->
Gates of Hell: there are two more animation types, `blendspace` and `aimset`, and a sequence takes `additive` and `events`; this game rejects all of them as "unexpected token". A `file` name without `.anm` is first tried as a folder, and every `.anm` in it is a variant picked at random per entity. `duration frames N` makes the sequence never end instead of crashing. `dynamicspeed` ranges only need to meet within 0.00001.
Example: `{sequence "fire" {file "fire.anm"} {speed 1.5}}`
See: [.anm](#anm).

### bone modifiers in a .def
Where: entity `.def`, after `{Extension}`.    Type: blocks.
Values: bone names and the bone keys above.
Does: Change bones of the model from the entity file.
Limits: Without `{Extension}` first, the game logs `Bone modifiers must be placed after skeleton load`. A bone that does not exist logs `Bone <name> not found in <model>`.
Example: `{Extension "tank.mdl"} {bone "gun_rot" {limits -5 15}}`
See: [bone (model)](#bone-model).

### .ply
Where: mesh files named by `VolumeView`.    Type: binary file.
Values: header `EPLY` or `BPLY`; chunks `BNDS`, `SKIN`, `MESH`, `SUBM`, `VERT`, `INDX`, `ADJA`, `SHDW`, `MROR`.
Does: The visible mesh of a bone, with its materials.
Limits: Chunks have no stored lengths, so a damaged file cannot be skipped over; an unknown chunk logs `Invalid chunk in .PLY file!`. About 65535 vertices at most per mesh. A skinned part maps at most 25 bones. A wrong header logs `Can't create resource object`. A missing `.mtl` with no `.materials` file to fall back on crashes the game.
<!-- goh: GHFMT-10 GHFMT-25 GHFMT-26 -->
Gates of Hell: a skin variant can swap the mesh: variant `camo` shows `tank#camo.ply` when that file exists. This game swaps textures only, so such files do nothing here. A part with no material loads, drawn grey with a warning, where this game crashes: ship every `.mtl` with a model you bring over.
Example: (binary; export it with a converter)
See: [.mtl](#mtl).

### .anm
Where: animation files named by `sequence`.    Type: binary file.
Values: header `EANM`, version at least 196608 (hex 30000); chunks `FRMS`, `BMAP`, `FRM2`, `FRMN`.
Does: Bone movements over time.
Limits: An older version logs `Unsupported animation version`. At least one frame is needed (`At least one frame required`). At most 255 bones (`Animated bones count is limited to 255!`). Other errors: `unknown chunk in animation`, `Invalid frame #`. A track for a bone the skeleton lacks is skipped. A file ending in `_lodN` belongs to level of detail N. The bone `placement` carries root motion.
Example: (binary)
See: [sequence](#sequence).

### .mtl
Where: material files named by meshes.    Type: SDL text file.
Values: the type word right after `material`: `simple`, `bump`, `layered`, `envmap`, `ocean`, `gui.text`; keys `diffuse`, `bump`, `specular`, `envmap`, `mask`, `color`, `blend`.
Does: How a mesh surface is drawn.
Limits: Texture names are written without an extension; a bare name is looked up next to the model. Many more keys exist in vanilla files than are described (listed at the end).
<!-- goh: GHFMT-11 GHFMT-12 GHFMT-13 GHFMT-14 GHFMT-27 GHFMT-29 GHFMT-32 -->
Gates of Hell: materials take more keys, among them `lightmap`, `No_Outlines` and `Dxt1OpacityFix`; bump materials take `specular_intensity`, `gloss_scale` and `full_specular`; layered materials take `GlobalNormalmap` and `GlobalDiffusemap`. This game stops on the material and bump keys as "unexpected token", and probably on the layered ones too: remove them when you bring a model over. `parallax_scale` is multiplied by a console value (`r_parallaxGlobalScale`, default 0.5), so the same value probably looks deeper here. `EmitsHeat` takes no number. An unknown material type and a name missing from a `.materials` library are named in the log.
Example: `{material bump {diffuse "t34s"}}`
See: [textures](#textures).

### .materials
Where: next to a `.ply`.    Type: text file.
Values: the material names of the mesh.
Does: The fallback that lists materials when no `.mtl` is found.
Limits: See `.ply`.
Example: (text list)
See: [.ply](#ply).

### textures
Where: texture folders.    Type: `.dds`, `.tga`, `.bmp`, `.jpg`, `.png`, and the SDL files `.ebm` and `.tex`.
Values: the game looks for the name with each extension in that order; the last one found wins, and `.ebm` or `.tex` win over all.
Does: Pictures for meshes, effects and the interface.
Limits: DDS files with the DX10 header are not supported (`DXT10 textures are not supported.`); the ATI2 format logs `Unknown DDS picture format`. A texture name that is not found shows a checker pattern and logs nothing. Under `/interface/` and `/map/`, files whose names start with the picture's name and end in two digits are loaded as its animation frames. For the picture `flag`, the files `flag02`, `flag_02`, `flag_big_02` and `flag1234` are frames; `flagx02` and `flag123` are not. An unrelated picture whose name starts with the same word and ends in two digits therefore loads as an extra frame: rename it.
<!-- goh: GHFMT-03 GHFMT-05 GHFMT-33 GHFMT-07 GHFMT-08 -->
Gates of Hell: BC5 normal maps (`ATI2`, `BC5U`, `BC5S`) load; convert them to DXT5 or A8R8G8B8 when you bring a model over, or they are missing here. A texture that is missing or cannot be read shows the checker and the log names it. Only `flag02` and `flag_02` count as frames of `flag`. A picture listed twice in a common texture stops the game.
Example: `tank_d.dds`
See: [.ebm and .tex](#ebm-and-tex), [Chapter 16, Materials and textures](16-effects-sound-models.md#materials-and-textures).

### .ebm and .tex
Where: texture folders.    Type: SDL text file.
Values: `reference`, `bitmap`, `Axis`, `Filtering`, `Mipmap`, `Cursor`, `NoCompression`, `AlphaChannel`, `TextureAnimation`, `Blend`, `Animation`, `Play`, `Reverse`, `Loop`, `PingPong`, `AsyncStart`, `Frame`.
Does: Describe a texture: its source picture, filtering, and animation frames.
Limits: A file that is not SDL logs `Not SDL file!`; a wrong signature logs `File signature mismatch`.
Example: `{bitmap "flag.dds"} {Mipmap 0}`
See: [textures](#textures).

### .wav
Where: `sound/` folders.    Type: RIFF wave file.
Values: vanilla files are mono, 44.1 kHz, IMA ADPCM or 16-bit PCM.
Does: The only sound format the game plays. The "Look & Sound" page (Models & Sim > Look & Sound) has a "Sound of this weapon" block: "Find sound" shows the folder and files a weapon plays, "Listen" plays them, "Choose file... / Check" tests your own file, "Preview" makes it playable in the game, "Write the sound into my mod" writes it as IMA ADPCM or 16-bit PCM, and "ffmpeg recipe (make a safe wav)" gives the command lines to convert a file.
Limits: `.ogg` files are ignored; `.mp3` is ignored too (unconfirmed). Sounds placed in the world should be mono.
<!-- goh: GHVIS-140 -->
Gates of Hell: probably also plays `.wav` only, so ship mod sounds as `.wav` there too.
Example: `sound/weapon/shot/mg42/01.wav`
See: [sound name](#sound-name), [Chapter 16, section 2](16-effects-sound-models.md#2-sound), [Models & Sim](19-toolchain.md#models--sim-all-games).

### .avi
Where: video folders.    Type: video file.
Values: Xvid (MPEG-4 Part 2) picture with MP3 sound.
Does: Videos and overlays.
Limits: A video in another codec, H.264 among them, does not play; a menu video then falls back to its still picture without an error. The exact conversion settings that work are unconfirmed.
<!-- goh: GHFMT-01 -->
Gates of Hell: videos are decoded by a newer Xvid (1.3.5).
Example: `video/intro.avi`
See: [video_overlay](#video_overlay), [Chapter 16, Video](16-effects-sound-models.md#video).

## Not described yet

These keys appear in vanilla data but no source describes their effect yet:

- light scattering keys in presets: `sample_count`, `sun_radius`, `ray_intensity`, `lum_worldToSun_ratio`, `darken`
- `images.set` keys: `user_ambient`, `ally_ambient`, `enemy_ambient`, `user_diffuse`, `ally_diffuse`, `enemy_diffuse`, `size`, `alpha`, `humans_light`, `vehicles_light`, `shadow`, `cloudsonwater`, `scrollspeed`, `windspeed`
- FX keys: `peak`, `turn`, `scalex`, `scaley`, `greenlight`, `bluelight`, `redlight`, `shiftx`, `shifty`, `shiftz`, `prescalex`, `prescaley`, `preshiftx`, `nightonly`, `storeable`, `constrain`, `power`, `fire`
- `.mtl` keys: `alpharef`, `alphatocoverage`, `tile`, `layer`, `parallax_scale`, `height`, `diffuse1`, `modulate2x`, `amount`, `glow`, `nolight`, `rimlight`, `translucency`, `emitsheat`, `fadeaway`, `zbias`, `period`, `bumpvolume`, `envamount`, `fakereflection`
- speaker keys: `signals`, `signaldepend`, `soundname`
- entity key `zclipvisibility`

## Gates of Hell only

The Gates of Hell notes in this book have not been tested in a running game. Check them in your own game before you depend on them.

<!-- goh: GHVIS-33 GHVIS-138 GHVIS-25 GHVIS-75 GHVIS-52 GHVIS-55 GHVIS-54 GHVIS-122 GHFMT-15 GHFMT-16 GHVIS-37 GHVIS-70 GHVIS-89 -->
These keys and files exist only in Gates of Hell, and this game does not read them. The entries above say which ones stop a file here, so remove those when you bring data over.

### filters.set
Where: `sound/filters/filters.set`.    Type: file.
Values: named chains of `bandpass {center} {width} {strength}`, `lowpass {cutoff} {strength}` and `paramEq {center} {q} {gain} {strength}`. `q` is held between 0 and 1 and `gain` between -18 and 18 dB.
Does: Sound filters laid over every sound placed in the world, for example inside a closed vehicle or when the soldier is wounded (`woundedEffect`).
Limits: An unknown filter type crashes the game. More than 8 filters in a chain probably overrun the game's table.
Example: `{woundedEffect {lowpass {cutoff 500.0}}}`
See: [sound console variables](#sound-console-variables).

### snd_restart
Where: game console.    Type: console command.
Values: none.
Does: Restarts the sound system and reloads the sounds, so a sound edit shows without restarting the game.
Limits: none known.
Example: `snd_restart`
See: [sound console variables](#sound-console-variables).

### ocean_wave_works
Where: environment preset.    Type: block.
Values: `ocean_mode`, and `sea_settings`, `lake_settings`, `river_settings`, each with `global`, `waves`, `ocean_look` and `shore`.
Does: Sets the look of sea, lake and river water; the preset applies the group for the map's kind of water.
Limits: Values are clamped.
Example: `{ocean_wave_works {sea_settings {global {patch_scale 120.096} {wind_dependency 0.85}}}}`
See: [environment preset](#environment-preset).

### render_tweaks
Where: environment preset.    Type: block.
Values: `decal_bias` (default 1).
Does: Pushes decals on the ground away from it to stop them flickering into the ground.
Limits: none known.
Example: `{render_tweaks {decal_bias 0}}`
See: [DecalView](#decalview).

### tone_mapping and tone curves
Where: `{light}` of a preset; curve files `set/curves/tonemapping/*.bzc`.    Type: block and text files.
Values: `max_white_percentile`, `min_mapping_range`, `curve "<file>"`.
Does: Picks the tone curve that maps the bright picture to the screen.
Limits: Works only with the HDR video option on. A change takes effect at the next day or night change.
Example: `{tone_mapping {max_white_percentile 0.999} {min_mapping_range 1} {curve "/set/curves/tonemapping/dark2.bzc"}}`
See: [light](#light).

### video/hdr
Where: player video options.    Type: option.
Values: on or off.
Does: Draws the picture in high dynamic range, with automatic exposure and the tone curve.
Limits: A device without HDR turns the option off. The video presets are also different: there is a `maximum` preset, so a saved preset number 5 means a different preset in the two games.
Example: (set in the video options)
See: [tone_mapping and tone curves](#tone_mapping-and-tone-curves).

### no_select_visor
Where: entity tag.    Type: word.
Values: present or absent.
Does: An allied unit that the player cannot select also opens the fog of war with its sight when it has this tag.
Limits: none known.
Example: (in the entity's tags)
See: [Fogable](#fogable).

### blendspace
Where: inside `{animation}` of the `.mdl`.    Type: block with a name.
Values: `{at v "anim"}` rows and `{resume}`.
Does: Blends the two neighbouring animations by a value the game sets, for example a speed.
Limits: Errors: `Invalid blend value`, `Invalid animation`, `Empty blendspace animation`, `Zero animation speed is invalid!`.
Form: `{blendspace "walk" {at 0 "walk_slow"} {at 1 "walk_fast"}}`. No stock Gates of Hell file uses it.
See: [sequence](#sequence).

### aimset
Where: inside `{animation}` of the `.mdl`.    Type: block with a name.
Values: `h_limits`, `v_limits` (degrees, default -90 to 90), `left_anm`, `center_anm`, `right_anm`, `{center N}`.
Does: Aims by blending a left, centre and right animation.
Limits: Use only the `_anm` forms: plain `left`, `center` or `right` with a string loops forever.
Form: `{aimset "aim" {left_anm "aim_l.anm"} {center_anm "aim_c.anm"} {right_anm "aim_r.anm"}}`. No stock Gates of Hell file uses it.
See: [sequence](#sequence).

### UseHQ and Halo
Where: `SpriteView`; Gates of Hell data also has `UseHQ` in a `DecalView`.    Type: switch and block.
Values: `UseHQ` before `Sprite`; `Halo {Scale {Min} {Max}}`.
Does: `UseHQ` loads the sprite's texture at high quality. `Halo` keeps a halo's size on screen between `Min` and `Max`.
Limits: none known.
Example: `{DecalView reverse_cone {useHq} {Sprite "reverse_cone.ebm"}}`
Form: `{Halo {Scale {Min 0.5} {Max 2}}}`. No stock Gates of Hell file uses it: stock halos hold only other keys, such as `{halo {usedirection}}`.
See: [SpriteView](#spriteview).

### TimeToLive (LightView)
Where: `LightView`.    Type: number, seconds.
Values: default 0, which means the light never goes out by itself.
Does: A light that is switched on goes out by itself when the time is up.
Limits: none known.
Example: `{lightview Light {type point} {radius 100} {timetolive 2}}`
See: [LightView](#lightview).

### camera_shakes
Where: player game options, in the `game` group.    Type: option.
Values: on or off.
Does: Turns the camera shake from blasts on or off; it replaces the console variable `cam_shake`.
Limits: The server never shakes.
Example: (set in the game options)
See: [camera](#camera).

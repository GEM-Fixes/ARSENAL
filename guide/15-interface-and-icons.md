# 15. Interface and Icons

The short way: [Icons and interface](p08-icons-and-interface.md) gives the steps for a new buy-menu icon or portrait, a panel button and a hotkey. This chapter explains how the interface data works. Every key named here has its entry in [Reference 9, Interface and localization](r09-interface-and-localization.md).

## What you will learn

- What you can change in the interface from data, and what is built into the game and cannot be changed.
- How icon file names work, which folders hold the pictures for purchase cards, unit cards and command buttons, and how the Look & Sound page (tab Models & Sim) makes icons from a PNG.
- How to edit the command panel, add actions, and set hotkeys.
- Where fonts, cursors, backgrounds and the minimap colours live.

## 1. What is data and what is built in

The game's screens (lobby, options, the in-game HUD) are **compiled dialogs**. You cannot create a new kind of dialog or rebuild the lobby from data. What data *does* control is:

- pictures (icons, portraits, backgrounds),
- the actions a unit can perform and the buttons that trigger them,
- the layout of the command panel,
- hotkeys,
- fonts and cursors,
- a few HUD settings (selection colours, minimap colours),
- small page scripts for some menu pages,
- and the texts, which come from [Chapter 14: Localization](14-localization.md).

Everything lives under `interface/` (inside `interface.pak` in vanilla, see [Chapter 4](04-vfs-paks-patches.md)) or under `set/`. Work in your own mod folder and never edit the vanilla pak; a file with the same path in your mod replaces the vanilla file completely.

### In Gates of Hell

<!-- goh: GHUI-115 GHUI-13 GHUI-258 GHUI-157 GHUI-159 -->

Much more of the Gates of Hell interface is data. Its screens and HUD are built from XML layout files under `interface/layout/`, with parts shared through `<DialogRef resource="...">`, so a mod can rearrange them.

- A layout loaded into a parent may have several top-level elements; the in-game HUD layout has seven. Assault Squad 2 keeps only the first, so a Gates of Hell HUD layout loses the rest there. Wrap them in one panel when you bring a layout over.
- Dialog type names in a layout are case-sensitive. An unknown name is an error, probably with a crash box (not confirmed).
- The smallest screen size is 1360x768 (Assault Squad 2: 1280x720), so layouts must fit that.
- Menus, message boxes and several game windows use the dark skin, and the menu button pictures live under `/interface/skin/game/` instead of `/interface/pages/main/button/new/`.

## 2. Icons and how they are named

Icon names are written **without an extension**. A base name such as `riflemans(usa)` resolves to a numbered set of frames:

| Suffix | State |
|---|---|
| `_00` | normal |
| `_01` | mouse hover |
| `_02` | pressed |
| `_03` | disabled (on a purchase card: locked) |
| `_04` | checked, for buttons that stay on |

So the picture for a card called `mymod_tank` is a set of files like `mymod_tank_00.tga` to `mymod_tank_03.tga`; most vanilla icons ship four frames. Names are case-insensitive. Under `interface/` and `map/` a frame may also be written without the underscore (`name00`). For one name the game prefers an `.ebm` or `.tex` file and otherwise takes `.dds`, `.tga`, `.bmp`, `.jpg` or `.png`. Panel buttons can have up to sixteen frames (four variants of four states). See [Icon folders and frames](r09-interface-and-localization.md#icon-folders-and-frames).

**The dangerous part:** a missing picture does not produce an error. The game quietly shows a stub image or nothing. A typo in an icon name is therefore invisible unless you look; `ARSENAL uilint` and the Art check on the Look & Sound page catch it.

### Where each kind of picture goes

| Folder under `interface/` | Used for |
|---|---|
| `scene/unit_icon/` | Multiplayer purchase-card pictures and category buttons |
| `scene/unit_icon_small/` | In-game unit cards for vehicles and guns |
| `scene/squad/` | Infantry portraits on cards, side markers and group numbers |
| `scene/portrait/` | Soldier and crew portraits |
| `scene/structure/` | The damage scheme drawn for a vehicle |
| `scene/panel_control/` | Command button pictures |
| `cursor/<name>/` | Mouse cursors (a folder of animated frames each) |
| `font/` | Font definitions |
| `pages/` | Menu pages, backgrounds and page scripts |

### The multiplayer purchase card

The card picture is `unit_icon/<card name>`, where the card name is the first word of the unit's entry in the multiplayer units data (see [Chapter 12](12-missions-and-multiplayer-setup.md)). Squad icons carry the side in brackets, for example `riflemans(usa)_00.tga`; the brackets are part of the file name. Without a picture the card shows `unit_icon/stub`. The card shows the unit name, its cost, an unlock countdown, the rank needed while it is locked, and an "i" button only when an info text exists. The card layout itself is fixed.

The category buttons in the purchase panel (one per `button` tag that has a buyable card) get their picture in this order: `unit_icon/T(A)`, then `unit_icon/T`, then the icon of the first buyable card in that category, then the stub, where `T` is the button tag and `A` the player's army, such as `usa`. Their tooltip is the text key `mp/scene/hint_<T>`.

### In-game unit cards

Infantry use `scene/squad/<portrait name>`, where the portrait name comes from the soldier's breed. Vehicles and guns use `unit_icon_small/<def file name without extension>`, and fall back to `unit_icon_small/icon_stub` if it is missing. The side marker next to the card is `squad/icon_tank(<nation>)`, `icon_cannon(<nation>)` or `icon_vehicle(<nation>)`.

A new vehicle therefore usually needs:

1. `unit_icon/<card name>_00..03.tga` for the purchase card,
2. `unit_icon_small/<def name>_00..03.tga` for the in-game card,
3. optionally artwork in `structure/` for the damage scheme.

### Icons from your own PNG

The Look & Sound page makes these files for you. Under "Icon helper", type the unit name and press "Show icon files": the page lists every frame the buy menu and the unit list look for, the size the game uses, and which of them your mod has. Under "Use my own PNG", choose a `.png` and the kind, press Preview, then "Write into my mod": the picture is converted to `.tga` at the size of the game picture and written at the right path. The kinds are "icon (4 frames)", "squad card (3 frames)", "portrait" and "damage scheme"; a portrait or a damage scheme is one file. The preview lists every file it will write and says when one replaces a file of yours or when the size had to be guessed. "Run Art check" then checks the pictures, meshes, animations and sounds of your mod. There is no command that turns a PNG into icon frames; by hand you save the four `.tga` frames yourself, at the size of the vanilla picture you replace.

The quick way: in the Quick Guided Task row choose "I want to make" or "change" and then "an icon". It covers an icon, a portrait, a squad card or a damage scheme, from your own PNG or from a game icon. See [Use the Quick Guided Task](p17-quick-guided-task.md).

To look at a picture before you ship it, open it in the window's picture viewer (see [File viewers](19-toolchain.md#file-viewers)). It shows the picture with zoom, background and channels, its mipmaps, and whether the game can load it. The notes it gives follow the game's own rules:

- A DDS in the DX10 layout is not loaded ("DXT10 textures are not supported"), and neither is an unknown format.
- A compressed (DXT) picture whose sides are not a multiple of 4 shows as a grey dummy.
- Sides that are not a power of two are fine; about 700 vanilla pictures have them. Pictures larger than 8192 pixels, or with more than 15 mipmaps, are refused.
- A picture with no mipmaps shimmers when it is drawn small.
- A 16-bit TGA looks darker in the game. A TGA stored right to left is shown mirrored, because that flag is ignored. An alpha channel that is all zero counts as no alpha.
- A `.psd` is not loaded.
- When another file of the same name wins over the one you are looking at, the viewer says which file the game loads instead.

See also: the Look & Sound page in [Chapter 19](19-toolchain.md#models--sim-all-games) and [Icons and interface](p08-icons-and-interface.md).

### In Gates of Hell

<!-- goh: GHUI-53 GHUI-54 GHUI-64 GHUI-71 GHLOC-16 -->

- The in-mission buy bar shows a column of unit types. A type's picture is `<type>(<army>)`, then `<type>`, then the picture of its first unit, then the stub. Its tooltip is `mp/scene/unit_spawn/<type>`. The price on a unit button is the whole squad's price, and a right click opens the unit info.
- Soldier portraits have 22 kinds instead of 15. The new pictures are `pistol`, `shotgun`, `assaultrifle`, `autorifle`, `smg2`, `grenadelauncher` and `at_rifle`; a set brought from Gates of Hell needs them.
- New squad icons such as `icon_flaregun`, `icon_engineer` and `icon_helicopter` live under `/interface/scene/squad/`. A missing one writes "Unknown bitmap" to the log instead of failing silently.
- Icons over units follow the option `show_scene_actor_buttons` in the `game` group; the old squad icon options do nothing.
- A unit needs the able `minimap` to appear on the minimap, the player's own units too. In Assault Squad 2 only units the computer controls need it.

## 3. Backgrounds, skins and page scripts

Menu backgrounds and music are set in `interface/pages/interface.set`, one `location` block per screen (`main`, `login`, `single`, `multi`, `multi_ingame`, `options` and `credits`):

```
{location "main"
	{background {picture "my_background"}}
}
```

A background can also be a `video`, and `media` plays a music file. See [Menu backgrounds and music](r09-interface-and-localization.md#menu-backgrounds-and-music) and [Skins](r09-interface-and-localization.md#skins). To change the main menu music without touching this file, replace `music/main_theme.wav` instead.

Skins (the default look of buttons and windows) are chosen in `set/registry/default_skin.reg`; colours are `"r g b"` strings and `text_style` uses the text tags of chapter 14.

Page scripts are small scripts in `interface/pages/script/*.ps`, in the form `{script {"<page>" {on ...}}}`. Only two ship with the game: `generic.ps`, which sends every page back on the Esc key, and `credits.ps`, the credits scroller. Pages such as the lobby and the options screen are compiled and cannot be rebuilt. See [Page scripts](r09-interface-and-localization.md#page-scripts).

### In Gates of Hell

<!-- goh: GHUI-29 GHUI-96 GHUI-157 -->

- A `PerFaction` background or video uses the army's own file only when it exists and otherwise the plain file, so a mod does not need one picture per army.
- Main menu announcements come from `announcements.set`; each is shown once. An announcement with a `selector` loses its banner and text, because that group is never closed when the file is read.
- The skin data must hold the dark skin that the menus use.

## 4. Actions

An **action** is something a unit can be ordered to do, such as repair or smoke. The game has its built-in actions (attack, move, repair, heal, rotate and others), and action files in `interface/action/*.set` configure them. Keywords you will see are `cursor` (a folder under `interface/cursor/`), `button` (a picture under `interface/scene/panel_control/`; without the keyword the button shows the stub), `fx`, `item` (an inventory item the action needs, normally in the hand), `item_in_box` (anywhere in the inventory) and flags such as `RequireSelect` or `ShowCount` (the item count on the button). See [Action files](r09-interface-and-localization.md#action-files).

A file whose name is not a built-in action creates a new custom action named after the file. A custom action has `target`, `instructions` and `instant` blocks; the instructions are the same as in interaction scripts ([chapter 11](11-interaction-scripts.md)). Three cautions:

- Action numbers sent over the network are assigned in creation order, so host and client must load the same set of action files (unconfirmed, but treat it as true).
- An unknown instruction name is logged as "Unknown instruction" and then probably crashes the game (unconfirmed).
- Custom actions cannot be bound to hotkeys and show no key badge on the button.

The button's tooltip comes from the text key `actionbar/<button name>`, with optional `/req`, `/action` and `/usage` lines.

### In Gates of Hell

<!-- goh: GHUI-39 GHUI-40 GHUI-41 GHUI-42 GHUI-43 -->

- Action files take more keywords: `FxEntity` (an entity shown at the target), `IgnoreEntities`, `AbleRotate` (drag to give a facing) and `HideLdragArrow`. Assault Squad 2 knows none of them.
- Any action whose file has `Key` takes the hotkey bound under that name, so custom actions can have hotkeys.
- A custom action can have `delay`: the order is given only after the target has been held that many seconds.
- Fortifications are data: each `{action "name"}` in `interface/action/fortify.set` makes one, with `Entity`, `Spacing`, `AbleEnqueue`, `Rotation`, `ScaleFromSize`, `Cost` and `TerrainRestrictions`. Assault Squad 2 has three fixed fortifications (`barricade`, `barbwire`, `hedgehog`) and spells the queue key `able_enqueue`.
- New action files: `airstrike`, `teleport`, `mine_ap` and `mine_at`.

## 5. The command panel

The command panel is the grid of order buttons at the bottom right. Its layouts are in `set/panel_control/`: `right_main.set` (the normal panel), `right_attack.set` and `right_useitem.set`. A file called `right_special.set` exists but is never loaded, so editing it does nothing. The front row above the panel is a separate row the player arranges, stored in the player's profile.

The main grid has **4 columns and 3 rows, 12 cells**. A layout file is one `{panel_control ...}` block, and each item is a block named after the action or built-in item it shows, as in the vanilla `right_main.set`:

```
{panel_control
	{gc_cp_state_fire
		{position 0 0}
	}
	{gc_cp_state_pose
		{position 2 0}
		{condition "human"}
	}
	{repair
		{position 3 1}
		{condition "vehicle"}
	}
}
```

- `position col row` places the button (column 0 to 3, row 0 to 2). Without it, or with `-1 -1`, the button takes the first free cell, row by row, in file order.
- `condition` limits the button to certain selections. Terms are the unit tags `"vehicle"`, `"tank"`, `"cannon"`, `"tractor"` and `"human"` (some selected unit must have the tag), `"single"` (one unit), `"multiple"` (not exactly one) and `"commander"` (one squad leader), and `"disabled"` (show the button even when the action is unavailable). An unknown term is logged as "Unknown condition term" and ignored. See [Panel condition terms](r09-interface-and-localization.md#panel-condition-terms).
- `priority` (a whole number, 0 by default) decides which item is placed first when two items want the same cell: the lower number goes first.

An action button appears only when the selected units can do that action, unless it has `"disabled"`; while you control a unit directly, action buttons are hidden. If items do not fit, the ones without a fixed cell are hidden, and when two items with the same priority claim the same cell the first one listed wins. A `browse` key you may see in vanilla files is read and never used. An item name must be either an action or one of the built-in item types (the `gc_cp_...` names listed in the reference). A name that is neither produces "Unknown control panel item" in the log and a button that does nothing, and on the minimap panel it crashes the game. See [Command panel layouts](r09-interface-and-localization.md#command-panel-layouts).

### In Gates of Hell

<!-- goh: GHUI-73 GHUI-74 GHUI-75 GHUI-77 GHUI-279 -->

- Six lists are loaded: `front`, `right_main`, `right_attack`, `right_useitem`, `right_special` (which does load here) and the new `right_emplacement`.
- `condition` knows three more unit tags, `helicopter`, `hatch` and `engine`, and `-<tag>` hides an item when a selected unit has that tag. In the HUD layout bars a term may be any unit tag or ability name; an unknown term there just hides the item.
- The action bar of the HUD is a grid of 3 by 3 cells by default (set by its layout), and the front bar holds up to 15 cells.
- New item types: `gc_cp_state_hatch`, `gc_cp_state_reverse`, `gc_cp_lock_ammo`, `gc_cp_state_altitude`, `gc_cp_state_manual_control_mode`, `gc_cp_state_auto_medic` and `gc_cp_browse_emplacement`. Their pictures (`auto_medic`, `vehicle/hatch`, `vehicle/reverse`, `lock_ammo`, `helicopter/altitude`, `control_type`, `cp_emplacement`) go in `scene/panel_control/`. In Assault Squad 2 these names give a dead button.
- The count badge and state label use the text `actionbar/count_white` (Assault Squad 2: `actionbar/count_black`).

## 6. Hotkeys

Default hotkeys live in `interface/profiles/default/keys.set` in your mod. Note the plural "profiles": the singular folder is never read. The format is:

```
{keys
	{"group/action" {value KEY_K}}
	{"group/other_action" {value "SHIFT + KEY_F"}}
}
```

Combined keys are written in quotes. Modifiers are `SHIFT`, `CTRL`, `ALT` and `DOUBLE` (double press). `~SHIFT` means "Shift must not be held". Two optional flags exist: `{noedit}` (the player cannot rebind it) and `{single}` (a key without modifiers, for keys you hold). The part before `/` only groups the entries; the options screen names each entry with the text key `options/keys/<id>`. See [Hotkeys](r09-interface-and-localization.md#hotkeys).

Things that catch people out:

- Unknown key names are **silently ignored**. The middle mouse button is `MOUSE2` or `MOUSE_MIDLE` (spelt that way); the spelling `MOUSE_MIDDLE` does nothing.
- The player's own `profiles/<id>/keys.set` overrides every action it lists. A mod's default does not change a player profile that already exists: the profile keeps its own value and does not get the new entries, so players may need to reset their controls.
- A new key id that the game never uses is saved and shown in the options screen but does nothing. Only the built-in actions can have hotkeys.

### In Gates of Hell

<!-- goh: GHUI-36 GHUI-37 GHUI-39 GHUI-251 -->

Many key ids are renamed, so a `keys.set` copied between the games leaves keys unbound with no error.

- The `common/...` group is gone. Its keys moved to `interface/...` (for example `interface/pause`, `interface/toggle_map`, `interface/stuff_highlight`), and to `actions/toggle_attack`, `control_camera/center_active` and `groups/dismiss_squad`.
- New ids: `control_manual/manual_mode_toggle`, `weapon_reload`, `toggle_crouch`, `toggle_prone`, `sprint`, `vault`, `special_action`, `visionmode`, `order_squad`, `helicopter_up`, `helicopter_down` and `squadmember1` to `squadmember10` (all under `control_manual/`), and `actions/cycle_pose`, `actions/lock_ammo`, `actions/toggle_auto_medic` and `actions/vehicle_toggle_reverse`.
- Each key has a `category`; a rebind conflicts only with keys of the same category.
- An action file with `Key` gets the key bound under that name (section 4).

## 7. Fonts, cursors and HUD files

Fonts are in `interface/font/*.font`:

```
{font_atlas
	{name "main"} {size 10} {height 17} {style 0}
	{binary_data "main_10.fnt"}
}
```

The glyph data is a binary `.fnt` (the AngelCode bitmap font format) plus TGA picture pages named `<name>_<page>.tga`. A font is chosen by name, size and style; when the exact size is missing, the largest smaller size is used. A missing character is drawn as `?`, so the font decides which languages can be shown. The font named `main` at size 10 is **mandatory**: without it the game stops at startup with "No default font [main(10)] found". See [Fonts](r09-interface-and-localization.md#fonts).

To check a font, open its `.fnt` in the window's font viewer (see [File viewers](19-toolchain.md#file-viewers)). Type a line under "Type here" to see it drawn; the viewer lists every character the font lacks, which the game shows as `?`. "Find a glyph" looks one up by character, number or `U+` code. Its notes follow the game's rules:

- The game reads only the version 3 layout of the format and does not check the version number or the "BMF" signature.
- A font with no `?` glyph has nothing to draw for a missing character and may crash the game.
- Character ids above U+FFFF land on other characters, because the game keeps 16 bits. A character listed twice: the first one counts.
- A page picture must exist in `/interface/font/`, or that page draws nothing. A glyph that points to a page the font does not have may crash the game.
- The game loads a `.fnt` only through a `.font` file in `/interface/font/`.

Cursors are in `interface/cursor/<name>/`, named by the action `cursor` keyword and by the weapon keys `cursor` and `crosshair`. HUD options are in `set/interface.set`: selection colours, the inventory cell size, the aim cursor pictures, damage scheme colours and the range read-out of manual aiming. Minimap colours are in `interface/scene/minimap/minimap.set` as `0xAARRGGBB` values (alpha first). See [HUD settings](r09-interface-and-localization.md#hud-settings).

### In Gates of Hell

<!-- goh: GHUI-206 GHUI-192 GHDC-18 GHDC-19 GHUI-65 GHUI-69 -->

- The default font size is 8, and the font `main` at size **8** is the one that must exist (Assault Squad 2: size 10). A font set that works in one game can stop the other at startup; ship both sizes when you share fonts.
- `set/interface.set` has new groups: `human_view`, `squad_view`, `manual_targeting/accuracy_circle` (`show`, `max` 256, `speed`), `zoom_factor/show` and `ammo/grenade`. The group for manual aiming is spelled `manual_targeting`; the Assault Squad 2 spelling `manual_targetting` is not read there, and the reverse is true too.
- The hit marker pictures are in `/interface/cursor/hitmarker/` (eight sprites such as `cursor_hit` and `cursor_head`).
- The minimap zooms in no further than scale 0.5 (Assault Squad 2: 0.1 to 0.7), and HUD layouts place it with the dialog type `gui_minimap`.

## 8. Texts the interface asks for

The interface reads many localization keys, for example `actionbar/<button>` for button hints (with `/req`, `/action` and `/usage` variants), `mp/scene/hint_<tag>` for purchase category hints, `mp/scene/hint_cost2/<budget tag>` for prices, and `options/keys/<id>` for hotkey names. A missing key shows raw text; see chapter 14.

### In Gates of Hell

<!-- goh: GHUI-73 GHLOC-16 GHLOC-18 GHUI-279 -->

Several of these keys are renamed: the count badge uses `actionbar/count_white`, the buy tooltip `mp/scene/hint_available`, `mp/scene/hint_time2` and `mp/scene/hint_requires/<condition>`, a buy bar type `mp/scene/unit_spawn/<type>`, and the pause hint `mp/scene/pause`. The full list of text differences is in [Chapter 14, section 4](14-localization.md#4-key-families).

## 9. Checking

```
ARSENAL uilint mods/mymod [--game <game folder>]
```

checks for missing pictures, unknown action instructions, panel cells that clash or overflow, unknown panel conditions and items, the unloaded `right_special.set`, key tokens that are not recognised, the middle-mouse spelling, keys the game never uses, and a missing `main` font. You can also run it with `--vfs --game <game folder>` to lint the whole mounted data. On the Look & Sound page, "Run Art check" checks file headers, exporter limits, pictures hidden by a file of another type, and wav files.

See also: [Chapter 18: Testing and Logs](18-testing-and-logs.md) and [Check a mod, fix it, read the log](p14-check-fix-read-log.md).

## Gates of Hell: summary

The Gates of Hell notes in this book have not been tested in a running game. Check them in your own game before you depend on them.

| Section | Gates of Hell | In short |
|---|---|---|
| 1. What is data and what is built in | [differs](#in-gates-of-hell) | Screens and HUD are XML layouts; several roots; 1360x768 minimum; dark skin |
| 2. Icons and how they are named | [differs](#in-gates-of-hell-1) | Buy bar types, 22 portrait kinds, new squad icons, `minimap` able on every unit |
| 3. Backgrounds, skins and page scripts | [differs](#in-gates-of-hell-2) | Per-army pictures optional, `announcements.set` |
| 4. Actions | [differs](#in-gates-of-hell-3) | New keywords, `Key`, `delay`, `fortify.set`, new action files |
| 5. The command panel | [differs](#in-gates-of-hell-4) | Six lists, more condition tags, 3 by 3 grid, new item types |
| 6. Hotkeys | [differs](#in-gates-of-hell-5) | Renamed and new key ids, categories |
| 7. Fonts, cursors and HUD files | [differs](#in-gates-of-hell-6) | `main` size 8, new HUD groups, `manual_targeting` spelling |
| 8. Texts the interface asks for | [differs](#in-gates-of-hell-7) | Renamed badge, tooltip and pause keys |
| 9. Checking | not mapped | The checks of this section are written for Assault Squad 2 data |

### Direct control and the third person camera

<!-- goh: GHDC-05 GHDC-06 GHDC-07 GHDC-25 GHDC-35 GHDC-36 GHDC-37 GHDC-40 GHDC-47 GHDC-52 GHDC-57 GHDC-58 GHDC-59 GHDC-01 GHDC-20 GHVIS-10 GHVIS-89 -->

Gates of Hell has two manual modes: direct control (as in Assault Squad 2) and a third person camera behind the unit. The key `control_manual/manual_mode_toggle` switches between them. A session card can limit them with `settings.manualControlMode`: 1 direct control only, 2 third person only, 3 either (the default). The player's choice is the option `manual_mode`.

- The third person camera is set in `/set/tp_control.set`, root `third_person_control`, with the groups `disabled`, `vehicle` and `human`. Each entry is `{"<tags>" inherit <tags> {clip} {level} {maxlevel N} {disabled}}`; a level is one camera step. Assault Squad 2 has no such file.
- Errors in that file stop the game: "Distance can not be greater than that for previous level", "Trying to modify nonexistent level", "Invalid maxlevel", "Third Person Control entry redefinition" and "Unknown keyword".
- A level whose `linkbone` the unit's model lacks refuses control with "Could not find bone <bone> in entity <unit>".
- A weapon can carry its own third person settings, such as scope levels, in `ThirdPersonParams`. Under manual control a gun fires only at a target within range and not below its `MinRange`, unless it has `UnlimitedRangeTPC`. `ManualAccuracyZoom` sets the spread while zoomed. Without `AutoReload` an empty gun only clicks. A soldier fires while walking only with a weapon tagged `shoot_walking_manual`, and never while crawling, swimming or running.
- In third person the range to the target is shown left of the crosshair. Holding the `control_manual/toggle` key longer than a quarter second takes the selected unit over at once.
- Saves keep manual control in a `RestoreManual` block; Assault Squad 2 saves lose it.
- The field of view is the config key `camera/main/fov` (Assault Squad 2: `camera/perspective/fov`). Camera shake is the option `camera_shakes`; the console command `cam_shake` is gone.

## Pitfalls

- A wrong icon name shows no error. Check the card on screen.
- A squad icon name includes the side in brackets.
- A panel item that names nothing real gives a dead button, and on the minimap panel crashes the game.
- `right_special.set` is never loaded.
- Do not write the middle mouse button as `MOUSE_MIDDLE`.
- A mod's `keys.set` does not reach a player profile that already exists.
- Removing the `main` size-10 font stops the game at startup.
- New dialog screens cannot be added from data.

**Next:** [Chapter 16: Effects, Sound and Models](16-effects-sound-models.md)

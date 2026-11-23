# Icons and interface

The pictures of the interface live under `interface/` in the game: buy panel icons in `interface/scene/unit_icon/`, the small icons of the unit list in `interface/scene/unit_icon_small/`, soldier portraits in `interface/scene/portrait/` and squad pictures in `interface/scene/squad/`. A button picture is a set of frames: the same name with `_00` (normal), `_01` (mouse over), `_02` (pressed) and `_03` (locked) at the end. The command panel, actions, keys and fonts are text files.

## You need

- A mod folder (see [Make a mod and see it in the game](p01-first-mod.md)).
- A picture for each icon, as `.png` (ARSENAL converts it) or as `.tga`.
- The unit's card id for a buy panel icon, and its `.def` name for the small icon. For a squad the name carries the army, for example `riflemans(usa)`.

## The quick way

In the Quick Guided Task row above the tabs, set "I want to" to **make** or **change**, choose **an icon** and press Start. The task asks which picture of the unit you want (an icon, a portrait, a squad card or a damage scheme), which name it goes under, and which picture it should show: your own PNG or a game icon. Review lists every file before Write. See [Use the Quick Guided Task](p17-quick-guided-task.md). The steps below do the same on the Look & Sound page (tab Models & Sim).

## Steps

1. **See which files the game wants.** Open the Look & Sound page and pick the job "Change a buy-menu icon". In "Icon helper", type the unit name and press "Show icon files". The table lists each Folder (`unit_icon`, the large one, and `unit_icon_small`), Frame, File, Size, whether the game has it and whether your mod has it.

2. **Make the icons from a PNG.** In "Use my own PNG", choose the kind "icon (4 frames)", choose your `.png` with "Choose file...", press Preview to see the files it will write, then "Write into my mod". The four frames are made at the size the game uses, as `.tga`, at the right paths in your mod. For a portrait choose the kind "portrait": it writes one picture with the portrait name the soldier type uses (the breed's [`portrait`](r05-humans.md#portrait) key). "squad card (3 frames)" writes the three frames of a squad picture in `interface/scene/squad/`, and "damage scheme" writes the one `scheme.tga` of a vehicle under `structure/<vehicle>/`. The preview says when a file replaces one of yours. Where each kind goes is in [Where each kind of picture goes](15-interface-and-icons.md#where-each-kind-of-picture-goes) and [Icons from your own PNG](15-interface-and-icons.md#icons-from-your-own-png).

3. **The command way.** There is no command that converts a picture. Save the frames yourself as `.tga` at `resource/interface/scene/unit_icon/<card id>_00.tga` to `_03.tga` (and the same in `unit_icon_small/` with the `.def` name). For a new unit that should look like an old one on the buy panel, a `gen` spec can copy the old unit's icon files: add `icon_like: <unit>` to its `roster` or `card` step.

4. **Check the pictures.** On the Look & Sound page press "Run Art check". It reads the headers of your pictures and lists pictures hidden by another file of the same name. The command way: `ARSENAL check mymod`. To look at one picture, open it in the window's picture viewer ([File viewers](19-toolchain.md#file-viewers)): it shows zoom, channels and mipmaps and says whether the game can load the file.

5. **Change the command panel, actions or keys.** These are text files: the [command panel](r09-interface-and-localization.md#panel_control) in `set/panel_control/*.set`, button [actions](r09-interface-and-localization.md#action) in `interface/action/*.set`, [key bindings](r09-interface-and-localization.md#keys) in `keys.set`, [fonts](r09-interface-and-localization.md#font_atlas) in `interface/font/`. Open the Editor page, switch the file view to Game, find the file, press "Copy into my mod", change it and press Save. Then run:

   ```
   ARSENAL uilint mymod
   ```

   It finds missing pictures, unknown action instructions and conditions, panel cells that clash or are full, panel items with no action, unknown key names and font problems.

6. **Look at it.** Play a test match or open the editor, place your unit, and look at the buy panel and the unit list.

## What can go wrong

- **The icon is empty and there is no error.** A missing picture shows nothing or a stub picture, never an error. Make all four frames, and check the name: the buy panel uses the card id, the small icon uses the `.def` name, a squad adds its army in brackets.
- **Your picture is ignored.** For one name the game takes the last of `.dds`, `.tga`, `.bmp`, `.jpg`, `.png`, so a stray `.tga` or `.png` beside your `.dds` replaces it. Art check lists such hidden files. A `.dds` saved as DX10, or with a size not divisible by 4, does not load.
- **The file is in the wrong folder.** Your file must sit at the same path as the game file, starting with `resource/`. A wrong folder is simply never read.
- **You cannot move or resize a panel.** The screens, the buy panel, the control bar and the command grid are built into the program. A mod changes pictures, texts, actions, panel items and keys, not the layout.
- **A panel button shows but does nothing.** A panel item whose name matches no action file and no item kind becomes a dummy button. Make `interface/action/<name>.set` or fix the name. An unknown action instruction crashes the game.
- **The command grid hides a button.** The main grid has 12 cells. Items without a position are hidden when it is full, and the second of two items in one cell is hidden. Give each item a `position` or `priority`.
- **A key does nothing.** Unknown key names are ignored without a message; the middle mouse button is `MOUSE2`, not `MOUSE_MIDDLE`. A new action of your own cannot get a hotkey, and a new id in `keys.set` is shown in the options but nothing reads it.
- **Default settings in a mod are never read.** The game reads settings only from the player's own profile.
- **The game stops at start after a font change.** The font `main` at size 10 must exist. A letter the font does not have is drawn as `?`.
- **Players cannot join each other.** Mods that change `interface/action` files must be the same for every player in a match.

## In Gates of Hell
<!-- goh: GHFMT-03 GHFMT-07 GHUI-36 GHUI-37 GHUI-40 GHUI-53 GHUI-54 GHUI-73 GHUI-206 -->

The Gates of Hell notes in this book have not been tested in a running game. Check them in your own game before you depend on them.

- **ARSENAL under the GoH button** has the Look & Sound page, whose Icon helper writes the icon files from your PNG into your mod folder, and the Editor page; the icon task of the Quick Guided Task is greyed out. `uilint` checks Assault Squad 2 interface files only. Paint the pictures yourself and check the mod on the Check page.
- **Frame names.** Under `/interface/` and `/map/` a file is a frame only when its name is the picture's name plus two digits (`flag02`) or plus `_` and two digits (`flag_02`). Assault Squad 2 also takes longer names that end in two digits, so frame sets made for one game can animate wrongly in the other.
- **Pictures.** Soldier portraits have 22 kinds instead of 15, and there are new squad icons in `/interface/scene/squad/`. Two-channel BC5 `.dds` files load.
- **Keys.** The `common/...` key ids moved to `interface/...` and others, so a `keys.set` copied between the games leaves keys unbound with no error. An action file with `Key` takes the hotkey bound under that name, so your own actions can have hotkeys.
- **Command panel.** Six lists are loaded, among them `right_special` and the new `right_emplacement`.
- **Fonts.** The font `main` at size 8 must exist (Assault Squad 2: size 10). Ship both sizes when you share fonts.

The full list is in [Interface and icons](15-interface-and-icons.md#2-icons-and-how-they-are-named) and the Gates of Hell parts of its sections [Actions](15-interface-and-icons.md#4-actions), [The command panel](15-interface-and-icons.md#5-the-command-panel), [Hotkeys](15-interface-and-icons.md#6-hotkeys) and [Fonts, cursors and HUD files](15-interface-and-icons.md#7-fonts-cursors-and-hud-files).

## More

- Part II: [Interface and icons](15-interface-and-icons.md), [Localization](14-localization.md), [The toolchain: Models & Sim](19-toolchain.md#models--sim-all-games).
- Part III: [Interface and localization keys](r09-interface-and-localization.md), entries [Icon folders and frames](r09-interface-and-localization.md#icon-folders-and-frames) and [`panel_control`](r09-interface-and-localization.md#panel_control); [Humans](r05-humans.md), entries [`portrait`](r05-humans.md#portrait) and [`icon`](r05-humans.md#icon); [Mission files and multiplayer setup](r11-mission-files.md#icon).
- Related: [Add a new unit from an existing one](p03-add-a-unit.md), [Add or change text and translate it](p07-text-and-translation.md).

<!-- Author: Imperator_Aug (ARSENAL) -->

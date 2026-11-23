# Reference 1: mod.info and the Mod Folder

This page lists, one entry each, every key of `mod.info`, every item the game reads from a mod folder, the keys of a patch document, and the rules that decide which file wins when several sources hold the same path. Chapter [3](03-mod-folder-and-load-order.md) explains mod folders and load order as a story, and chapter [4](04-vfs-paks-patches.md) explains paks and patches. Come here when you need the exact facts about one key or one rule.

Every entry has the same parts:

- **Where**: the file kind and the block the key is written in.
- **Type**: what kind of value it takes.
- **Values**: what the game accepts, and what happens when the key is absent.
- **Does**: what the key does.
- **Limits**: what silently fails, stops the game or is ignored.
- **Example**: a few lines in the pattern of real data.
- **Gates of Hell**: only where Gates of Hell treats the key differently. Keys only Gates of Hell has are at the end, under [Gates of Hell only](#gates-of-hell-only).
- **See**: where to read more: the Part II section that explains the key, the Part I page that uses it, and related entries.

A few words used below. A **virtual path** is the path of a file inside the game's resource tree, such as `set/stuff/rifle/example_rifle`, whether the file is loose on disk or packed in a zip. The **file index** is the single list of virtual paths the game builds when it starts or applies mods; a file is only found if its path is in that list. A **pak** is an ordinary zip file with the extension `.pak`. **Classic mode** and **Enhanced mode** are the two ways the 64-bit `as64.exe` program runs: Enhanced mode is the one where the built-in package `as64+` is active (entry [as64+](#as64) below).

## mod.info

`mod.info` is a small text file in the data language of chapter [5](05-sdl-language.md). It sits in the root of the mod folder and holds one outer block, `{Mod ...}`. It describes the mod; it does not list the mod's files.

### Mod

Where: `mod.info`, the outer block.    Type: block.
Values: the block name may be written `Mod` or `mod`; key names inside are not case sensitive. A `;` starts a comment.
Does: holds all other keys of the file.
Limits: A folder without a file named exactly `mod.info` at its root is not a mod: the game skips it without a log line, which is what happens when a zip tool adds an extra folder level. Unknown keys inside the block are skipped silently, so a misspelt key does nothing and produces no message. A broken value, such as an unescaped quote inside `Desc`, has stopped the game from starting, even when that mod was not in the active list, because every `mod.info` in the `mods` folder is read at start. Saving the file as UTF-16 breaks it; save it as UTF-8 without a byte-order mark (or plain ASCII) with CRLF line endings.
Example:
```
{Mod
	{Name "My Mod"}
	{MinGameVersion "3.262"}
	{MaxGameVersion "3.262"}
}
```
<!-- goh: GHVFS-29 GHSDL-08 GHVFS-02 GHVFS-36 -->
Gates of Hell: an empty `mod.info` is skipped with `Warning: empty mod.info file found at <path>`, and one that does not parse skips only that mod with `Warning: failed to load mod <path>: <error>`; it does not stop the game. The block also takes [Tags](#tags) and [Priority](#priority).
See: chapter [3, section 2](03-mod-folder-and-load-order.md#2-writing-modinfo); [mod folder](#mod-folder); Part I [Make a mod and see it in the game](p01-first-mod.md); `ARSENAL modinfo` in chapter [19](19-toolchain.md).

### Name

Where: `mod.info`, inside `{Mod}`.    Type: text, one quoted string.
Values: any text. Vanilla-era mods use plain titles; the built-in package uses `"AS64+"`.
Does: the title shown in the in-game mod list. It is also the name of the folder the Workshop installer of the original game creates for subscribers.
Limits: The game never compares `Name` with the folder name, and the active list never uses it: a mod is identified by its folder name. If you publish a mod and later change its `Name`, the folder name on every subscriber's machine of the original game changes and their active lists stop matching. Each known key takes exactly one quoted string and then the closing brace; a quote inside the value must be written `\"`.
Example:
```
	{Name "My Mod"}
```
<!-- goh: GHVFS-24 -->
Gates of Hell: the same key. A subscribed Workshop mod is known there as `mod_<item number>`, and the mod list asks Steam for the title of an item that is not loaded, so changing `Name` does not break subscribers' lists.
See: [mod folder](#mod-folder), [Workshop copy](#workshop-copy); chapter [3, section 2](03-mod-folder-and-load-order.md#2-writing-modinfo); Part I [Make a mod and see it in the game](p01-first-mod.md), [Pack and share](p15-pack-and-share.md).

### Desc

Where: `mod.info`, inside `{Mod}`.    Type: text, one quoted string.
Values: any text. `\n` inside the string becomes a new line. Colour markup of the form `<c(rrggbb)>...</c>` is handled by the interface when the text is shown. Absent: no description.
Does: the description shown for the mod.
Limits: An unescaped quote inside the description has stopped the game from starting. Write a quote as `\"`.
Example:
```
	{Desc "Changes rifle damage.\nVersion 2."}
```
<!-- goh: GHVFS-01 -->
Gates of Hell: `$n` as well as `\n` starts a new line of the description.
See: chapter [3, section 2](03-mod-folder-and-load-order.md#2-writing-modinfo); Part I [Pack and share](p15-pack-and-share.md); [Workshop upload](#workshop-upload).

### MinGameVersion

Where: `mod.info`, inside `{Mod}`.    Type: text, a dotted version string such as `"3.262"`.
Values: digits and dots; other characters are ignored. A value of `3.301` or higher makes the mod a **modern** mod; anything lower makes it a **legacy** mod.
Does: the lowest game version the mod supports, and at the same time the mode label of the mod. A legacy mod loads only in Classic mode (and in the original game); a modern mod loads only in Enhanced mode.
Limits: For a legacy mod, an empty or missing `MinGameVersion` makes the mod unsupported, and it is skipped with a warning. Versions are compared only over the parts both versions have, so `3.262.1` counts as equal to `3.262`. The legacy check uses the game's data version, which has the form `3.262.<patch>`, so a slightly newer program build still accepts mods made for 3.262. A mod of the wrong mode is skipped; in `as64.exe` a mismatched mod in the active list at start has crashed the game with "Unable to determine fallback font" before the menu appeared, because the refusal message is written before the fonts are loaded. Take the mod out of the list, or fix this key, to recover.
Example:
```
	{MinGameVersion "3.262"}   ; legacy mod
	{MinGameVersion "3.301"}   ; modern mod for Enhanced mode
```
<!-- goh: GHVFS-26 GHVFS-02 -->
Gates of Hell: the value is compared with the Gates of Hell program version, which is a 1.x number (such as 1.067), so a `mod.info` written for 3.262 or 3.301 is refused there. The key is optional: a missing `MinGameVersion` means no lower limit. There is no legacy or modern label and no Classic or Enhanced mode. A mod whose [Tags](#tags) hold `develop` loads at any version.
See: [MaxGameVersion](#maxgameversion), [as64+](#as64), chapter [3, section 3](03-mod-folder-and-load-order.md#3-the-version-gate) and [section 4](03-mod-folder-and-load-order.md#4-classic-mode-and-enhanced-mode); Part I [Bring an old mod up to the 64-bit build](p13-old-mod-to-64-bit.md), [Make a mod and see it in the game](p01-first-mod.md).

### MaxGameVersion

Where: `mod.info`, inside `{Mod}`.    Type: text, a dotted version string.
Values: digits and dots. Legacy mods: required. Modern mods: may be left out.
Does: the highest game version a legacy mod supports. The mod is supported when the game version is not below `MinGameVersion` and not above `MaxGameVersion`.
Limits: For a legacy mod, an empty or missing value makes the mod unsupported. For a modern mod the value is ignored completely: the only test is that the plain program version is at least `MinGameVersion`. A `MaxGameVersion` lower than `MinGameVersion` is not reported. The console variable `dev_disableModVersionControl`, when true, lets a legacy mod with an empty range load.
Example:
```
	{MinGameVersion "3.262"}
	{MaxGameVersion "3.262"}   ; accepts every 3.262 patch
```
<!-- goh: GHVFS-26 -->
Gates of Hell: optional for every mod; a missing bound is open, so a mod with only `MinGameVersion` stays active in every later version. Write both bounds to pin a range. `dev_disableModVersionControl` lifts the check there too.
See: [MinGameVersion](#mingameversion), [lastGameVersion](#lastgameversion); chapter [3, section 3](03-mod-folder-and-load-order.md#3-the-version-gate); Part I [Bring an old mod up to the 64-bit build](p13-old-mod-to-64-bit.md).

### Require

Where: `mod.info`, inside `{Mod}`. Repeatable.    Type: text, one quoted string per key.
Values: `"folder"` or `"folder:number"`. Only the folder part is compared. The built-in package can be named as `"as64+"`.
Does: names another mod that must be installed and active. When the list is applied, mods are sorted so that a required mod is mounted before the mod that requires it.
Limits: If the required folder is not in `mods`, or not in the active list, the requiring mod is dropped with a dependency warning. Mode words such as `"as64"` or `"legacy"` are not folders, so the game treats them as missing mods. A circular requirement (A requires B and B requires A) empties the whole active list, with a log line beginning `Dependency test error!`. The order of mods that do not require each other is not guaranteed.
Example:
```
	{Require "basemod"}
	{Require "as64+"}
```
See: [Load order between mods](#load-order-between-mods), [options.set mods](#optionsset-mods); chapter [3, section 6](03-mod-folder-and-load-order.md#6-who-wins-the-load-order); Part I [Bring an old mod up to the 64-bit build](p13-old-mod-to-64-bit.md).

### Delete

Where: `mod.info`, inside `{Mod}`. Repeatable.    Type: text, one quoted path per key.
Values: a path that starts with `resource/`. A path ending in `/` is a prefix and removes every file under it.
Does: removes a file, or every file under a folder, from the file index before this mod's own files are mounted.
Limits: The path must start with `resource/`. A path such as `"set/x"` is turned into a path outside the resource tree and matches nothing, without any message. Because it runs before the mod's own files mount, it cannot remove the mod's own files; use a patch `delete` for that. A deleted file leaves no marker, and anything that later asks for it stops the game with `File not found - resource/<path>`.
Example:
```
	{Delete "resource/set/stuff/junk/old_rifle"}
	{Delete "resource/set/stuff/junk/"}
```
See: [delete (patch)](#delete-patch), chapter [4, section 5](04-vfs-paks-patches.md#5-patches-npat-and-patch) and its part [`mod.info` `Delete` instead of a patch](04-vfs-paks-patches.md#modinfo-delete-instead-of-a-patch).

### FileId

Where: `mod.info`, inside `{Mod}`.    Type: text, a decimal number in quotes.
Values: the Workshop item number. Written by the Workshop uploader; absent in a mod that was never uploaded.
Does: ties the folder to its Workshop item. The uploader finds the folder of an item by this key, and when it updates an item it writes only this key, keeping every other byte of the file.
Limits: Loading ignores the key. A value that is not a number gives no error; the id read is then zero or garbage. For a subscribed item the Workshop's own id wins over this key.
Example:
```
	{FileId "1234567890"}
```
<!-- goh: GHVFS-24 -->
Gates of Hell: read only for local mods. A subscribed item takes its id from the Workshop and is known as `mod_<item number>`.
See: [Workshop upload](#workshop-upload); chapter [20, section 8](20-packaging-and-release.md#8-steam-workshop); Part I [Pack and share](p15-pack-and-share.md).

## The mod folder

### mod folder

Where: `<game folder>/mods/<folder>/`.    Type: folder.
Values: a folder name made of the characters listed under [file names](#file-names); the game lower-cases it.
Does: one mod. The mod's identity is its folder name in lower case, not its `Name`. The game scans only the direct subfolders of `mods` (plus the built-in package and subscribed Workshop items).
Limits: A mod folder outside `<game folder>/mods/` is never seen. Two folders whose names differ only by case count as one name: the second fails to register and never loads, with no log line. Renaming a folder makes it a different mod, so an active-list entry naming the old folder loads nothing. A folder named `as64+` inside `mods` is dropped, because that name belongs to the built-in package.
Example:
```
<game folder>/mods/mymod/mod.info
<game folder>/mods/mymod/resource/set/stuff/rifle/example_rifle
```
<!-- goh: GHVFS-27 GHVFS-28 GHVFS-24 -->
Gates of Hell: a folder whose name holds a space, a byte above 127 or any of `< > + ( ) [ ] { } ! @ # $ % ^ & * - = ; : | ' "` is skipped, with the warning `invalid mod folder name` in game.log only, so `my-mod` and `my mod` never load there; use letters, digits, `_` and `.`. When two mods have the same id, the first scan at start keeps the second one found and logs `Warning! Duplicate mod found [...] using second.`; local folders are scanned before Workshop items, so a local `mods/mod_<item number>` loses to that Workshop item.
See: [options.set mods](#optionsset-mods), [file names](#file-names), chapter [3, section 1](03-mod-folder-and-load-order.md#1-the-shape-of-a-mod-folder); Part I [Make a mod and see it in the game](p01-first-mod.md).

### resource.pak

Where: the mod root.    Type: zip file.
Values: one optional file named `resource.pak`.
Does: the first item mounted for the mod. Its entries are placed under `resource/`, so an entry `set/stuff/rifle/example_rifle` becomes the virtual path `set/stuff/rifle/example_rifle`.
Limits: Because `resource/` is mounted after `resource.pak`, a loose file in `resource/` should replace the same path in `resource.pak`; that follows from the order but has not been seen in play (unconfirmed), so ship each file in one place only. A pak the zip reader cannot open stops the game at mount with `Can't open pak`. See [pak](#pak) for the zip rules.
Example:
```
mods/mymod/resource.pak      entry: set/stuff/rifle/example_rifle
```
<!-- goh: GHVFS-04 -->
Gates of Hell: not mounted, neither in a mod nor in the game folder, and nothing is logged. Put paks inside `resource/` instead, where every `.pak` is mounted in place.
See: [Mount order inside a mod](#mount-order-inside-a-mod); chapter [4, section 2](04-vfs-paks-patches.md#2-paks-are-zip-files), chapter [20, section 3](20-packaging-and-release.md#3-pak-roles-and-names); Part I [Pack and share](p15-pack-and-share.md).

### resource/

Where: the mod root.    Type: folder.
Values: the same layout as the game's resource tree: `set/`, `entity/`, `interface/`, `properties/` and so on.
Does: every file under it is added to the index at its path relative to `resource/`. Paks found inside it are mounted as paks at their own place (see [pak](#pak)).
Limits: Loose files with the extensions `.temp`, `.scc`, `.`, `.`, `.org`, `.`, `.msg` and `.txt` are never indexed (`.ply` and `.mtl` are explicitly allowed), so a loose `.txt` file is invisible while the same file inside a pak is found. A file named `.gitignore` and folders named `.git` or `.svn` are skipped. Files added while the game runs appear only after the next Apply. When a loose folder and a pak in the same folder hold the same path, see [Loose file against pak](#loose-file-against-pak).
Example:
```
mods/mymod/resource/set/stuff/rifle/example_rifle
mods/mymod/resource/gamelogic.pak
```
See: chapter [4, section 3](04-vfs-paks-patches.md#3-loose-files); Part I [Make a mod and see it in the game](p01-first-mod.md).

### N.pat

Where: the mod root, as `1.pat`, `2.pat`, `3.pat` and so on.    Type: zip file.
Values: numbered from 1 without gaps.
Does: a patch. Each `.pat` is mounted like a pak under `resource/`, so it may carry ordinary files, and it must also hold one patch document whose name ends in `.patch` (see [Patch](#patch)). Patches run after the mod's own `resource.pak` and `resource/` folder.
Limits: The game counts `1.pat`, `2.pat`, ... and stops at the first missing number, so a `.pat` after a gap is never mounted, silently. A `.pat` without a `.patch` document stops the game with `Wrong patch N`. The number of `.pat` files is the mod's patch count, which the active list checks (see [options.set mods](#optionsset-mods)). The same `.patch` document placed loose in the mod root is never read.
Example:
```
mods/mymod/1.pat     zip holding: 1.patch
```
See: [Patch](#patch), chapter [4, section 5](04-vfs-paks-patches.md#5-patches-npat-and-patch); Part I [Pack and share](p15-pack-and-share.md).

### localization.pak

Where: the mod root.    Type: zip file.
Values: one optional file named `localization.pak` holding `.lng` text files.
Does: mounted after the patches, with its entries placed under `resource/interface/text/`.
Limits: A `.lng` file replaces the original file of the same name completely. Keys the mod's copy leaves out are not filled in from the original; they show blank or as the key.
Example:
```
mods/mymod/localization.pak   entry: desc.lng
```
<!-- goh: GHVFS-04 -->
Gates of Hell: not mounted. Texts go in [localizations/](#localizations) instead.
See: chapter [14, section 3](14-localization.md#3-how-the-game-chooses-between-files); Part I [Add or change text and translate it](p07-text-and-translation.md).

### localization/

Where: the mod root.    Type: folder.
Values: `.lng` text files, UTF-8.
Does: the last item mounted for the mod, scanned into `resource/interface/text/`.
Limits: Same replacement rule as [localization.pak](#localizationpak): a file replaces the original wholesale. Loose `.txt` files here are skipped like everywhere else.
Example:
```
mods/mymod/localization/desc.lng
```
<!-- goh: GHVFS-04 GHVFS-05 -->
Gates of Hell: not mounted, so `.lng` files here are probably ignored and the game shows the raw keys (not confirmed in a running game). Texts go in [localizations/](#localizations) instead.
See: chapter [14, section 1](14-localization.md#1-where-text-comes-from); Part I [Add or change text and translate it](p07-text-and-translation.md).

### other files in the mod root

Where: the mod root.    Type: any file or folder.
Values: notes, working files of your own tools, screenshots, a `.git` folder, a loose `.patch`.
Does: nothing. The game reads only `mod.info`, `resource.pak`, `resource/`, the numbered `.pat` files, `localization.pak` and `localization/`.
Limits: The Workshop uploader sends the whole folder, so private files and development folders reach every subscriber. Keep them out of a folder you upload.
Example:
```
mods/mymod/notes.md        ignored by the game, uploaded by the Workshop tool
mods/mymod/1.patch         never read; pack it into 1.pat
```
See: [Workshop upload](#workshop-upload); chapter [20, section 5](20-packaging-and-release.md#5-the-pre-release-gate); Part I [Pack and share](p15-pack-and-share.md).

## Patch documents

A patch document is a text file whose name ends in `.patch`, packed inside a numbered `.pat` zip. The game finds it by that ending, whatever the rest of the name is.

### Patch

Where: a `.patch` document inside `N.pat`, the outer block.    Type: block.
Values: children `id`, `delete` and `remap`; other keys are read and ignored.
Does: lists the deletions and renames this patch applies. After the patch is applied, the document itself is removed from the index, so the next `.pat` finds its own.
Limits: A loose `.patch` file in the mod root is never read. Files packed in the same `.pat` are mounted before its lines run, so they survive unless a `delete` names them.
Example:
```
{Patch
	{id 1}
	{delete "set/stuff/junk/old_rifle"}
}
```
See: [N.pat](#npat), chapter [4, section 5](04-vfs-paks-patches.md#5-patches-npat-and-patch) and its [small worked example](04-vfs-paks-patches.md#a-small-worked-example).

### id

Where: `.patch`, inside `{Patch}`.    Type: whole number.
Values: must equal the number of the `.pat` it is packed in.
Does: identifies the patch.
Limits: A different number stops the game with `Wrong patch N version`.
Example:
```
	{id 2}      ; inside 2.pat
```
See: [Patch](#patch).

### delete (patch)

Where: `.patch`, inside `{Patch}`. Repeatable.    Type: text, a quoted path.
Values: a path relative to `resource/`, without a leading `resource/`. Backslashes are accepted. A path ending in `/` removes every file under it.
Does: removes the file from the index.
Limits: It runs after the mod's own pak and folder, so it removes the mod's own copy of that path as well as earlier mods' and the original game's copies. A later mod can add the path again. A path that does not exist is not an error. Nothing marks the deletion: anything that later asks for the file stops the game with `File not found - resource/<path>`.
Example:
```
	{delete "set/stuff/junk/old_rifle"}
	{delete "set/stuff/junk/"}
```
See: [Delete](#delete) (the `mod.info` form), chapter [4, section 5](04-vfs-paks-patches.md#5-patches-npat-and-patch).

### remap

Where: `.patch`, inside `{Patch}`. Repeatable.    Type: two quoted paths.
Values: `"from" "to"`, both relative to `resource/`.
Does: moves a file to a new virtual path: the file is registered under `to` and removed from `from`.
Limits: If `from` does not exist, the game stops with `File is not found - <from>`.
Example:
```
	{remap "set/stuff/gun/a_gun" "set/stuff/gun/b_gun"}
```
See: [Patch](#patch).

## The active list

### options.set mods

Where: the profile file `options.set`, inside `{options}`.    Type: list of quoted strings.
Values: each entry is `"folder:number"`, split at the first colon. The folder part is the lower-case folder name. The number is the patch count the mod had when it was activated.
Does: the list of active mods, in load order. Every Apply goes through it in order: an entry whose folder does not exist is dropped with the log line `Mod '<entry>' was disabled: Not installed.`; an entry whose version range fails is dropped with a warning; an entry whose required mod is missing is dropped with a warning; an entry whose number is larger than the folder's patch count is dropped silently. The rest are sorted by requirements and mounted in order. The game writes the cleaned list back.
Limits: The folder comparison is exact, so an entry with a capital letter never matches. The number is only a gate: the game always mounts all of the mod's patches, even when the entry asks for fewer. After you add a `.pat` to an active mod, activate it again so the number is updated. A subscribed Workshop mod is listed by its normalised title, not by its item number (unconfirmed in play). A legacy mod and a modern mod cannot both load from one list: whichever mode the list is in, the other mod drops out. Let the game or `ARSENAL modswitch` write the list rather than editing it by hand.
Example:
```
{options
	{mods "basemod:0" "mymod:2"}
}
```
<!-- goh: GHVFS-24 GHVFS-31 GHVFS-13 -->
Gates of Hell: a subscribed Workshop mod is listed as `mod_<item number>`. Entries named twice are dropped, and when the game drops any entry it writes the list back without the `:number` parts. The profile folder is under `Documents/My Games/Gates of Hell/`, or under `%LOCALAPPDATA%/Digitalmindsoft/Gates of Hell/` when the game is started with `-useLocalDataFolder` or the Documents folder lies in OneDrive; the log line `IO: Game config directory:` names the one in use.
See: chapter [3, section 5](03-mod-folder-and-load-order.md#5-the-active-list), chapter [18, section 2](18-testing-and-logs.md#2-launching-and-activating-a-mod); Part I [Make a mod and see it in the game](p01-first-mod.md), step 7.

### lastGameVersion

Where: the profile file `settings.set`.    Type: text.
Values: written by the game.
Does: the game version that last used this profile.
Limits: When it differs from the running version, the game empties the active mod list (the log says "Game version update detected"), and you must activate your mods again. The comparison uses the data version 3.262, so `as64.exe` and `mowas_2.exe` share one profile and switching between them keeps the list.
Example: the key is written by the game into `settings.set`; you never edit it. Its counterpart, the mod list, lives in `profiles/<id>/options.set`.
See: [options.set mods](#optionsset-mods).

## Load order and mount rules

### Override rule

Where: every mounted source.    Type: rule.
Values: none.
Does: the file index holds one entry per virtual path. When a later source adds a path that is already there, the earlier entry is thrown away. The later source wins the whole file. There is no merging of file contents and no priority setting.
Limits: A mod that replaces a data file must carry the whole file; every entry the replacement leaves out is gone, including entries another mod added. File dates never decide anything. No log line marks an override.
Example:
```
base game   set/stuff/rifle/example_rifle   (replaced)
mymod       set/stuff/rifle/example_rifle   (used)
```
See: [Load order between mods](#load-order-between-mods), chapter [4, section 1](04-vfs-paks-patches.md#1-one-index-last-one-wins), chapter [4, section 7](04-vfs-paks-patches.md#7-inspecting-the-effective-file-set) for seeing which file won; Part I [Change a unit's numbers](p02-change-unit-numbers.md).

### Mount order inside a mod

Where: every mod folder, and the game folder itself.    Type: rule.
Values: fixed order: `resource.pak`, then `resource/`, then `1.pat`, `2.pat`, ..., then `localization.pak`, then `localization/`.
Does: decides the order in which one mod's own items enter the index. The original game is mounted the same way from the game folder, with all its patches.
Limits: Patches come after the mod's own files, so a patch `delete` removes the mod's own copies too. The `mod.info` `Delete` lines run before all of these. On the 64-bit build `as64.exe`, the folder `as64/core/` is mounted after the original game and before any mod (see [as64/core](#as64core)).
Example:
```
1 resource.pak   2 resource/   3 1.pat, 2.pat   4 localization.pak   5 localization/
```
<!-- goh: GHVFS-04 GHVFS-05 -->
Gates of Hell: the order is `resource/`, then `1.pat`, `2.pat`, ..., then [localizations/](#localizations); there is no `resource.pak`, `localization.pak` or `localization/` step. A game folder without `localizations/` stops with `Failed to mount localization`. After the mods, the default language's `localizations/<code>/` and then the chosen language's are laid over `resource/`, so a file there probably beats the same path in `resource/` of every mod (not confirmed).
See: chapter [4, section 4](04-vfs-paks-patches.md#4-the-mount-order-inside-one-mod), chapter [20, section 2](20-packaging-and-release.md#2-how-the-game-mounts-a-mod).

### Load order between mods

Where: the active list in `options.set`.    Type: rule.
Values: list order, after the requirement sort.
Does: the original game is mounted first, then each active mod in list order. A mod lower in the list (mounted later) wins every path it shares with a mod above it.
Limits: The requirement sort places mods with fewer requirements first and each mod after its requirements; among mods that do not depend on each other, the order is not guaranteed. A circular requirement drops the whole list. The built-in `as64+` package always comes before every player mod.
Example:
```
{mods "damagemod:0" "accuracymod:0"}   ; accuracymod wins shared files
```
<!-- goh: GHVFS-25 GHVFS-36 -->
Gates of Hell: the sort is stable. Mods are ordered by the number of their requirements and then by [Priority](#priority), lower first, so among mods that do not require each other the higher `Priority` wins shared files. A circular requirement empties the list there too.
See: [Require](#require), chapter [3, section 6](03-mod-folder-and-load-order.md#6-who-wins-the-load-order); Part I [Make a mod and see it in the game](p01-first-mod.md).

### Loose file against pak

Where: inside one folder of a mod's or the game's resource tree.    Type: rule.
Values: none.
Does: inside a folder, the game takes files, subfolders and paks in the order the operating system lists them and does not sort them. On a normal Windows disk that is case-insensitive name order, and the later name wins.
Limits: As a result a loose `set/` folder wins over `gamelogic.pak` (it sorts later), while a loose `entity/` folder loses to `entity.pak` (it sorts earlier). This order is not confirmed in play for every folder (unconfirmed). Other file systems may list in a different order. Do not ship the same path both loose and in a pak.
Example:
```
resource/entity/       loses to   resource/entity.pak
resource/gamelogic.pak loses to   resource/set/
```
See: chapter [4, section 3](04-vfs-paks-patches.md#3-loose-files); [pak](#pak).

### pak

Where: any `.pak` file under a mounted folder, `resource.pak`, `localization.pak`, and the `.pat` files.    Type: zip file.
Values: plain zip, entries stored or deflate-compressed. No encryption, no special header. Zip64 archives are read.
Does: each entry becomes a virtual path made of the folder the pak sits in plus the entry name. A mod's `resource/entity.pak` with entry `entity/-vehicle/x/x.def` gives `entity/-vehicle/x/x.def`. The game's own entity paks sit one folder lower, in `resource/entity/`, so their entries start one level lower (`-vehicle/...`).
Limits: An extra top-level folder inside the zip (`mymod/set/...`) adds new paths and replaces nothing. A single entry must stay below 4 GB. Write real CRC values; a wrong CRC can still load as a resource but breaks other readers. If one zip holds a name twice, the later entry wins. Entries ending in `/` are ignored. Entry names longer than 1023 bytes are cut. Small text entries (`.mdl`, `.def`, `.inc`, `.set`, `.reg`, `.info`, `.txt`, `.mi`, `.ext`, `.tpl`) are read into memory when the pak is mounted, so many small text files make Apply slower.
Example:
```
mods/mymod/resource/gamelogic.pak   entry: set/stuff/rifle/example_rifle
mods/mymod/resource/entity.pak      entry: entity/-vehicle/tank_medium/mytank/mytank.def
```
<!-- goh: GHVFS-15 GHVFS-16 GHVFS-18 GHVFS-19 -->
Gates of Hell: every entry without a CRC-32 value logs `no crc for file in package ... performance may be slowed`, so write real CRCs. An entry that cannot be read stops the game with `Failed to read file from pak <name>`; a pak that cannot be opened still stops it. The kinds kept in memory differ (`.reg .def .inc .set .ext .tpl .info .presets .pattern .ammo .fsm .xml`, not `.mdl`, `.mi` or `.txt`), and they are read on first use, not when the pak is mounted.
See: chapter [4, section 2](04-vfs-paks-patches.md#2-paks-are-zip-files) and [section 8](04-vfs-paks-patches.md#8-packing-for-release), chapter [20, section 3](20-packaging-and-release.md#3-pak-roles-and-names); Part I [Pack and share](p15-pack-and-share.md).

### file names

Where: every virtual path and every path written in data.    Type: rule.
Values: letters and digits and the characters `[ ] ( ) { } @ $ % ^ - + . _ ! # &` and space. A name must not start or end with a space.
Does: every name is turned to lower case and every `\` to `/` when it enters the index, so names that differ only by case or slash direction are one name.
Limits: A path longer than 4096 bytes stops the game with `path is too long`. The extension of a name is the text after its last dot; files without an extension are legal and common (most weapon files).
Example:
```
Set\Stuff\Rifle\Example_Rifle   is the same name as   set/stuff/rifle/example_rifle
```
<!-- goh: GHVFS-09 GHVFS-10 GHVFS-27 -->
Gates of Hell: a name is also lower-cased and its `\` turned to `/` as soon as it is read from a data file. A name with non-ASCII letters may be at most 1023 bytes after lower-casing, else `path is too long`. Mod folder names follow a stricter rule (see [mod folder](#mod-folder)).
See: [path forms](#path-forms); chapter [5, section 3](05-sdl-language.md#3-words-strings-and-numbers).

### path forms

Where: any path written inside a data file.    Type: rule.
Values: `/a/b` relative to the resource tree; `//a/b` relative to the game folder, outside the resource tree; `@a/b` relative to the user data folder (`<Documents>/My Games/Men of War - Assault Squad 2/`); `a/b` with no leading slash, relative to the folder of the file being read; each leading `../` goes up one folder.
Does: decides where a written path points.
Limits: An `(include "x.inc")` without a leading `/` is looked for next to the file that holds the include line, so a copied file that keeps a relative include must stay in a folder that mirrors the original.
Example:
```
(include "/properties/tank.ext")    ; from the resource root
(include "grenade_smoke.inc")       ; next to this file
```
<!-- goh: GHVFS-07 GHVFS-13 -->
Gates of Hell: adds `!a/b`, relative to the game folder like `//a/b`; it works only there. `@a/b` points into `Documents/My Games/Gates of Hell/` (or the LocalAppData folder named under [options.set mods](#optionsset-mods)).
See: chapter [5, section 5](05-sdl-language.md#5-includes); [include of a template](r02-entity-definition.md#include-of-a-template) and [Extension](r02-entity-definition.md#extension) on reference page 2; Part I [Add a new unit from an existing one](p03-add-a-unit.md).

### Apply

Where: Options, MODS tab, the Apply button; also every game start.    Type: rule.
Values: none.
Does: a full rebuild of the index: all resource paths are removed, the original game is mounted, then every active mod in order. The log line `Repository: N resources` at the end gives the size of the index.
Limits: Large mods make Apply slow. Files added to a mod folder while the game runs appear only after the next Apply. If the number in `Repository: N resources` does not change after you change a mod, no file was added or removed (one may still have been replaced).
Example:
```
Repository: N resources      ; game.log, end of every Apply
```
<!-- goh: GHVFS-31 GHVFS-30 -->
Gates of Hell: the log shows `Mod: applying mods`, then `Mod: activate mod x` or `Mod: disable mod x` for each change; a mod that is already applied is not applied again. At start the scan logs `Scanning mods in` and `Found N available mods`.
See: [options.set mods](#optionsset-mods); chapter [18, section 2](18-testing-and-logs.md#2-launching-and-activating-a-mod) and [section 5](18-testing-and-logs.md#5-the-structure-of-gamelog); Part I [Check a mod, fix what the check finds, read the game log](p14-check-fix-read-log.md).

### multiplayer sync folders

Where: every mounted or deleted path.    Type: rule.
Values: paths starting with `entity/`, `fx/`, `properties/`, `set/`, `sound/`, `map/single/`, `map/bonus/`, `map/multi/` or `script/multiplayer/`.
Does: a mod that adds, replaces or deletes any path under these folders is flagged as affecting multiplayer, and every player in a match must have the same version of it.
Limits: A mod that touches only `interface/` is not compared. The content check between players covers files of the kinds `.set`, `.inc`, `.ext`, `.mi`, `.reg`, `.info`, `.def` and `.mdl`; `.lng`, `.dds`, `.ebm`, `.wav` and Lua files are not compared and may differ between players.
Example:
```
mods/mymod/resource/set/...         synchronized
mods/mymod/resource/interface/...   not synchronized
```
See: chapter [12, section 10](12-missions-and-multiplayer-setup.md#10-how-multiplayer-stays-in-sync) and its part [The data checksum](12-missions-and-multiplayer-setup.md#the-data-checksum), chapter [20, section 6](20-packaging-and-release.md#6-multiplayer-compatibility), `ARSENAL mpsync` in chapter [19](19-toolchain.md).

## Built-in layers of the 64-bit build

### as64/core

Where: `<game folder>/as64/core/`.    Type: folder with paks and loose files.
Values: shipped with `as64.exe`.
Does: mounted by `as64.exe` after the original game and before every mod, in both modes, with no patches. It carries the 64-bit build's shader and text changes.
Limits: It does not exist for the original `mowas_2.exe`. Any mod can override its files, because mods mount later.
Example:
```
<game folder>/as64/core/resource/...
<game folder>/as64/core/localization/...
```
Gates of Hell: has no such layer.
See: [as64+](#as64); chapter [4, section 4](04-vfs-paks-patches.md#4-the-mount-order-inside-one-mod).

### as64+

Where: `<game folder>/as64/plus/`, with its own `mod.info`.    Type: built-in mod.
Values: always loaded under the name `as64+`. Its `MinGameVersion` is `3.301`.
Does: the Enhanced mode package. When `as64+` is in the active list the game runs in Enhanced mode, where modern mods load and legacy mods do not. It is always placed before every player mod.
Limits: Every player mod overrides its files, and it cannot be moved above them. A folder named `as64+` inside `mods` is dropped. A mod may name it in `Require`. How the in-game menu switches Enhanced mode on is not described (unconfirmed); the mode follows whether `as64+` is in the active list.
Example:
```
{Mod
	{Name "My Enhanced Mod"}
	{MinGameVersion "3.301"}
	{Require "as64+"}
}
```
<!-- goh: GHVFS-27 GHVFS-26 -->
Gates of Hell: has no built-in package and no Classic or Enhanced mode. A folder named `as64+` would not load there anyway, because `+` is not allowed in a mod folder name.
See: [MinGameVersion](#mingameversion), chapter [3, section 4](03-mod-folder-and-load-order.md#4-classic-mode-and-enhanced-mode); Part I [Bring an old mod up to the 64-bit build](p13-old-mod-to-64-bit.md).

## Workshop and other layers

### Workshop copy

Where: Steam's download folder for the game, and `<game folder>/mods/`.    Type: rule.
Values: none.
Does: the original `mowas_2.exe` copies a subscribed item into `mods/<Name>/` (the folder name comes from the item's `Name`), deletes any old copy there first, adds `{FileId}` to the copy's `mod.info`, and writes a stamp file named after the item number in `mods/`. `as64.exe` instead loads a subscribed item in place from the Steam folder.
Limits: On the original game, a local mod with the same `Name` as a subscribed one is overwritten at the next sync, and local edits to the copy are lost when the stamp is out of date. On `as64.exe`, a `mods/` folder that is an old copy of a subscribed item is ignored, with the log line `mods/<name>/ is an old copy of a Workshop item, which is loaded instead`, so a fix made in that copy never loads: rename the folder or unsubscribe. Give your development copy a different folder name from the published item.
Example:
```
mods/<Name>/mod.info     copy made by the original game, with {FileId "..."}
```
<!-- goh: GHVFS-30 GHVFS-24 GHVFS-28 GHVFS-03 GHVFS-35 -->
Gates of Hell: loads a subscribed item in place, as `as64.exe` does, under the id `mod_<item number>`. An item whose path does not contain `workshop/content/` is skipped with `A workshop mod outside of standard location!` (an item in another Steam library probably still loads, because its path keeps that part). A local `mods/mod_<item number>` loses to the Workshop item of that number. Deleting a mod in the options removes a local folder at once; a Workshop item's files stay until Steam removes them. Mods for a multiplayer session come from the Workshop; the game does not download them itself.
See: chapter [3, section 8](03-mod-folder-and-load-order.md#8-workshop-mods), chapter [20, section 8](20-packaging-and-release.md#8-steam-workshop).

### Workshop upload

Where: the Workshop uploader shipped with the game.    Type: tool rule.
Values: a mod folder, a title, a description of at most 8000 bytes, a preview image (JPG, PNG or GIF) under 1 MB, tags, visibility and a change note.
Does: uploads the whole mod folder as a Workshop item and writes the item number into `mod.info` as `{FileId}`. The preview is `preview.jpg`, `preview.png`, `preview.gif` or `preview.jpeg` in the mod folder, or else `mods/previews/<folder>.jpg`.
Limits: Everything in the folder is uploaded, including notes and `.git` folders, even though the game itself ignores them. The uploader reads `mod.info` loosely (first `{mod}` block, keys `name`, `desc`, `FileId`) and changes nothing but `FileId`.
Example:
```
mods/mymod/preview.jpg
```
See: chapter [20, section 8](20-packaging-and-release.md#8-steam-workshop); Part I [Pack and share](p15-pack-and-share.md), step 4.

### map folder

Where: `<game folder>/maps/<name>/`.    Type: folder.
Values: the same items as a mod folder: pak, `resource/`, patches.
Does: mounted at `resource/map/multi/<name>/`, after any files already at that path are removed.
Limits: Files outside that path are not reached this way. Chapter [13](13-maps.md) covers maps.
Example:
```
maps/mymap/   is seen as   map/multi/mymap/
```
<!-- goh: GHVFS-34 -->
Gates of Hell: a `resource.pak` inside the map folder is not mounted; only `resource/`, the patches and the folder itself are.
See: chapter [13, section 2](13-maps.md#2-the-map-folder); Part I [Copy and change a map](p09-copy-and-change-a-map.md).

### map mod overlay

Where: a folder named `mod/` inside a map folder.    Type: folder.
Values: files laid out as under `resource/`.
Does: when that map's mission loads, its files are moved onto the matching paths under `resource/` for the match, and the game data is reset. When the scene closes, the index is rebuilt and the active mods are applied again.
Limits: The overlay beats every active mod for that match.
Example:
```
map/multi/mymap/mod/set/stuff/rifle/example_rifle
```
See: chapter [4, section 6](04-vfs-paks-patches.md#6-map-overlays-and-mission-data); [map folder](#map-folder).

## Switches

### -no_mods

Where: the game's command line.    Type: switch.
Values: none.
Does: starts the game with an empty mod list: no mod is applied and Workshop items are not installed.
Limits: Every `mod.info` in `mods` is still read at start, so a broken one can still stop the game.
Example:
```
as64.exe -no_mods
```
See: chapter [3, section 5](03-mod-folder-and-load-order.md#5-the-active-list); Part I [Check a mod, fix what the check finds, read the game log](p14-check-fix-read-log.md).

## Not described yet

Nothing in this area. Every key of `mod.info` and of a patch document read by the game is described above.

## Gates of Hell only
<!-- goh: GHVFS-01 GHVFS-02 GHVFS-36 GHVFS-25 GHVFS-04 GHVFS-05 GHVFS-07 GHVFS-13 GHVFS-14 GHSDL-08 GHLOC-01 GHLOC-03 GHLOC-05 GHLOC-09 -->

The Gates of Hell notes in this book have not been tested in a running game. Check them in your own game before you depend on them.

These keys, folders and switches belong to the area of this page and exist only in Gates of Hell. `as64.exe` and the original game skip the two `mod.info` keys silently and do not mount the folder. Chapter [3](03-mod-folder-and-load-order.md#gates-of-hell-summary) and chapter [4](04-vfs-paks-patches.md#gates-of-hell-summary) compare the two games, and Part I [Bring a unit from Gates of Hell](p12-unit-from-gates-of-hell.md) covers moving work between them.

### Tags

Where: `mod.info`, inside `{Mod}`.    Type: text, one quoted string of words separated by spaces.
Values: any words. Two have a meaning: `develop` lets the mod load at any game version and leaves the version range out of its title in the mod list; `no_delete` hides the delete button for the mod. Absent: no tags.
Does: labels the mod. The game writes the key back when it saves the file.
Limits: an unquoted word is a read error (`String expected!`); a `mod.info` that fails to read is skipped with a warning. `ARSENAL modinfo <mod folder> --goh` warns about a value that is not one quoted string.
Example:
```
	{Tags "develop no_delete"}
```
See: [MinGameVersion](#mingameversion), [MaxGameVersion](#maxgameversion).

### Priority

Where: `mod.info`, inside `{Mod}`.    Type: whole number.
Values: any whole number. Absent: 1.
Does: orders mods that do not require each other. Mods are sorted by the number of their requirements first and then by `Priority`, lower first; a mod applied later wins shared files, so the higher `Priority` wins.
Limits: it does not override a requirement: a required mod still comes first.
Example:
```
	{Priority 5}
```
See: [Load order between mods](#load-order-between-mods), [Require](#require).

### localizations/

Where: the root of the game folder and of a mod folder.    Type: folder with one subfolder per language code.
Values: `localizations/<code>/`, texts under `localizations/<code>/interface/text/`. The languages offered are the folders that hold a `localization.info`. The codes `default` and `en` take `.pot` and `.lng` files; other languages take `.po`, `.mo` and `.lng`. The game's own default texts ship as `localizations/default.pak`.
Does: mounted after `resource/` and the patches of each layer. When the game loads a language, the default language's folder and then the chosen language's folder are laid over `resource/`, so the chosen language's texts come first and the default ones fill the gaps. A `.lng` file is read here with the same key rule as in `as64.exe`.
Limits: a game folder without `localizations/` stops with `Failed to mount localization`. A mod whose language layout differs from the game's logs `Localization mode used in ... does not match with default mode` and still loads. A `.po` or `.pot` entry without `msgctxt` gives no text.
Example:
```
mods/mymod/localizations/default/interface/text/units.pot
mods/mymod/localizations/<code>/interface/text/units.po
```
See: [localization/](#localization), [Mount order inside a mod](#mount-order-inside-a-mod), chapter [14](14-localization.md#gates-of-hell-summary).

### ! path prefix

Where: any path written inside a data file.    Type: rule.
Values: `!a/b`.
Does: points at `a/b` relative to the game folder, like `//a/b`.
Limits: `as64.exe` and the original game do not know the prefix and read the path another way; do not use it in a mod for them.
Example:
```
!a/b     is the same place as   //a/b   (Gates of Hell only)
```
See: [path forms](#path-forms).

### -useLocalDataFolder

Where: the game's command line.    Type: switch.
Values: none; any letter case.
Does: keeps profiles, saves and game.log in `%LOCALAPPDATA%/Digitalmindsoft/Gates of Hell/` instead of `Documents/My Games/Gates of Hell/`. The game does the same without the switch when the Documents folder lies in OneDrive.
Limits: the folder is chosen once at start; game.log names it in the line `IO: Game config directory:`.
Example:
```
call_to_arms.exe -useLocalDataFolder
```
See: [options.set mods](#optionsset-mods), chapter [18](18-testing-and-logs.md#gates-of-hell-summary).

### -showmodinfo

Where: the game's command line.    Type: switch.
Values: none.
Does: the mod list adds `[STEAM:<item>]` or `[LOCAL]` to each mod, a `*` for mods whose files take part in the multiplayer check, and a row with the mod's path.
Limits: display only.
Example:
```
call_to_arms.exe -showmodinfo
```
See: [Workshop copy](#workshop-copy).

### protected registry files

Where: `set/registry.reg` and `set/registry/dlc.reg` in the resource tree.    Type: rule.
Values: none.
Does: at start the game checks both files against fixed checksums.
Limits: a mod that replaces either file stops the game with `Resource Error`. Other files under `set/registry/` are probably not checked. Leave both files alone in a Gates of Hell mod.
Example:
```
mods/mymod/resource/set/registry.reg     stops Gates of Hell at start
```
See: [Override rule](#override-rule).

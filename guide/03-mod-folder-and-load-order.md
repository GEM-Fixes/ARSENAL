# Chapter 3: The Mod Folder and Load Order

A mod is a folder with a `mod.info` file in it. This chapter explains what goes in that file, how the game decides which mods to load and in what order, the difference between Classic and Enhanced mode, and what happens when two mods contain the same file. Get this chapter right and your mod will load reliably; get it wrong and the game will quietly ignore your work.

The short way to a working mod folder is [Make a mod and see it in the game](p01-first-mod.md); the version lines for sharing are set in [Pack and share](p15-pack-and-share.md). Every key and rule in this chapter has a full entry in [Reference 1: mod.info and the mod folder](r01-mod-info-and-folder.md).

> **Encoding reminder.** The game's text files use CRLF (Windows) line endings. The 64-bit build reads every string value as UTF-8, in data files and `.lng` files alike; the original data is plain ASCII outside `;` comments, and some comments still hold old cp1251 bytes that the game skips. Write UTF-8 without a byte-order mark and leave old comment bytes alone. Many editors silently change the encoding or the line endings when you save. Set your editor to keep both, and check them after every save.

## What you will learn

- How to write a correct `mod.info`.
- How the game decides whether a mod is supported.
- The difference between Classic and Enhanced mode.
- How the active mod list works and why order matters.
- How to find out which of two mods wins a file.
- How to keep multiplayer players in agreement.

## 1. The shape of a mod folder

```
<game folder>/mods/mymod/
    mod.info                  required
    resource/                 loose files, same layout as the game's resource tree
    resource.pak              optional: content packed in a zip
    1.pat, 2.pat ...          optional: patch files (chapter 4)
    localization/             optional: .lng text files
    localization.pak          optional: the same, packed
```

Besides `mod.info`, only these five items are read: `resource.pak`, `resource/`, the numbered `N.pat` files, `localization.pak` and `localization/`. Anything else in the mod folder is ignored by the game, so it is a place for notes, working files and screenshots. If you share the mod through the Workshop, though, everything in the folder is uploaded, so keep private files out. A loose `.patch` file placed in the mod root is never read. Chapter [4](04-vfs-paks-patches.md) explains how to pack it into a `.pat` file.

Two important details:

- **The mod's identity is its folder name, in lowercase.** The `Name` written inside `mod.info` is only a display title. If you rename the folder, the game treats it as a different mod, and any list entry that named the old folder is dropped.
- **A folder without a file named exactly `mod.info` is not a mod.** The game skips it silently; this is what happens when a zip tool adds an extra folder level. Two folders whose names differ only by capitalization count as one name, and the second is rejected. A folder named `as64+` is dropped, because that name belongs to the built-in package.

The game scans only the direct subfolders of `mods`, plus the built-in package and subscribed Workshop items. A mod folder anywhere else is never seen. See the reference entry [mod folder](r01-mod-info-and-folder.md#mod-folder), and for the files that may sit beside `mod.info` the entries [resource.pak](r01-mod-info-and-folder.md#resourcepak), [N.pat](r01-mod-info-and-folder.md#npat) and [other files in the mod root](r01-mod-info-and-folder.md#other-files-in-the-mod-root).

### In Gates of Hell
<!-- goh: GHVFS-04 GHVFS-05 GHVFS-27 -->

A Gates of Hell mod folder is read in three parts besides `mod.info`: the `resource/` folder (with any paks inside it, each mounted where it lies), the numbered `N.pat` files, and the `localizations/` folder with one subfolder per language code (`default` for the base texts). A `resource.pak`, `localization.pak` or `localization/` in the mod root is skipped without a message, so a mod of this game copied over unchanged loses its packed data and its texts. Move the paks into `resource/` and the texts into `localizations/default/interface/text/`. A mod whose language setup does not match the game's logs `Localization mode used in ... does not match with default mode` and still loads.

The folder name is checked too. A name with a space, a letter outside plain ASCII, or any of the signs `< > + ( ) [ ] { } ! @ # $ % ^ & * - = ; : | ' "` is skipped, with `Warning: invalid mod folder name "<name>"!` in `game.log` and nothing on screen. So `my-mod` and `as64+` never load there. Use letters, digits and `_`; the readme of the game's own template mod asks for letters and `_` only.

## 2. Writing `mod.info`

`mod.info` is a file in the data language of chapter [5](05-sdl-language.md), with one outer block `{Mod ...}`. Key names are not case sensitive here, and `;` starts a comment. Here is a complete example for the 64-bit build:

```
{Mod
    {Name "My Mod"}
    {Desc "Tweaks rifle damage.\nVersion 1."}
    {MinGameVersion "3.301"}
    {Require "basemod"}
    {Delete "resource/set/stuff/junk/"}
}
```

| Key | Meaning |
|---|---|
| [`Name`](r01-mod-info-and-folder.md#name) | The title shown in the mod list. On the original game it is also the folder name the Workshop installer creates for subscribers |
| [`Desc`](r01-mod-info-and-folder.md#desc) | The description. `\n` means a new line; a quote inside it must be written `\"` |
| [`MinGameVersion`](r01-mod-info-and-folder.md#mingameversion), [`MaxGameVersion`](r01-mod-info-and-folder.md#maxgameversion) | The range of game versions the mod supports, and at the same time its mode (sections 3 and 4) |
| [`Require`](r01-mod-info-and-folder.md#require) | A mod that must also be installed and active. Repeat the key for several mods. Write `"folder"` or `"folder:number"`; only the folder name is compared |
| [`Delete`](r01-mod-info-and-folder.md#delete) | A file, or a folder prefix ending in `/`, to remove from the file index before this mod's own files are added. Repeatable |
| [`FileId`](r01-mod-info-and-folder.md#fileid) | Written by the Workshop uploader. Leave it alone |

Three features of the file reader are worth knowing.

- **Unknown keys are skipped silently.** A mistyped key does nothing and produces no message. `ARSENAL modinfo` (or the Check page) reports it for you.
- **A broken `mod.info` can stop the game.** The game reads every `mod.info` in the `mods` folder at start, whether the mod is active or not, and even with `-no_mods`. A broken value, such as an unescaped quote inside `Desc`, has stopped the game from starting. Run `ARSENAL modinfo <game folder>/mods` to check all of them at once. Save the file as UTF-8 without a byte-order mark (or plain ASCII) with CRLF line endings; a UTF-16 file breaks it.
- **`Delete` here is different from the `delete` line in a `.patch` file.** The `mod.info` form runs before your files are mounted, so it cannot remove your own files, and its path must start with `resource/`: a path such as `"set/x"` matches nothing, without any message. The patch form runs after your files and can remove anything, your own copies included (chapter [4](04-vfs-paks-patches.md)).

In the ARSENAL window, the Share page's first step ("About my mod") writes the name, description and version lines for you, after showing what will change ([Pack and share](p15-pack-and-share.md)). The Quick Guided Task "I want to make a mod" asks for the title, the description and the mods it needs, and writes `mod.info` from your answers.

### In Gates of Hell
<!-- goh: GHVFS-01 GHVFS-02 GHVFS-24 GHVFS-29 GHVFS-36 -->

Gates of Hell reads the same keys and two more. Its own template writes the key names in lower case (`{mod`, `{name`, `{minGameVersion`).

- `Tags` takes one quoted string of words separated by spaces, such as `{Tags "develop"}`; an unquoted word is an error. The word `develop` lets the mod load on any game version, and `no_delete` hides the delete button in the game's mod list.
- `Priority` takes a whole number (1 when absent) and orders mods that do not require each other (section 6).

AS2 skips both keys without a message, so a mod that relies on them loads in another order here. A broken `mod.info` does not stop Gates of Hell: that mod is skipped with `Warning: failed to load mod <path>: <error>` in `game.log`, and an empty one with `Warning: empty mod.info file found at`. `FileId` is read only for local mods. In the description, `\n` and `$n` both start a new line.

## 3. The version gate

The game compares its own version with the range in your mod. If the game version is outside the range, the mod is skipped with a warning. The rule differs between the two kinds of mod:

- **A legacy mod** (`MinGameVersion` below `3.301`) needs both `MinGameVersion` and `MaxGameVersion`. An empty or missing value makes it unsupported. The game version it is compared with is the data version, of the form `3.262.<patch>`, and the comparison uses only the parts both versions have, so `3.262.1` equals `3.262` and a `MaxGameVersion` of `3.262` accepts every patch of 3.262. A `MaxGameVersion` below the game version, such as `3.100`, is rejected. A `MaxGameVersion` lower than `MinGameVersion` is not reported.
- **A modern mod** (`MinGameVersion` `3.301` or higher) passes when the program's version is at least `MinGameVersion`. `MaxGameVersion` is ignored and may be left out.

Version strings are digits and dots; other characters are ignored. The console variable `dev_disableModVersionControl`, when true, lets a legacy mod with an empty range load; do not ship a mod that depends on it.

### In Gates of Hell
<!-- goh: GHVFS-26 GHNET-22 -->

Gates of Hell compares its own version, of the form `1.xxx`, with the range. Players must run the same version to join each other. Each bound is optional there: a missing `MinGameVersion` or `MaxGameVersion` leaves that side open, and a mod with neither probably loads on any version (not confirmed). The readme of the game's template mod asks for both, so set both. A range written for this game (3.x) is refused, and the log says `was disabled: Unsupported game version`. The tag `develop` (section 2) and the console variable `dev_disableModVersionControl` both lift the check. `ARSENAL modinfo "<mod folder>" --goh --game "<Gates of Hell folder>"` reads the version from your Gates of Hell and says whether the range holds it.

## 4. Classic mode and Enhanced mode

The 64-bit `as64.exe` program has a built-in extension package called `as64+`. When it is in the active list, the game runs in **Enhanced mode**. When it is not, the game runs in **Classic mode**. The mode decides which mods may load:

| | Classic mode | Enhanced mode |
|---|---|---|
| Legacy mod (`MinGameVersion` below `3.301`) | Loads | Skipped |
| Modern mod (`MinGameVersion` `3.301` or higher) | Skipped | Loads |
| Version rule | The data version must lie between Min and Max | The program version must be at least Min; Max is ignored |

In other words, the minimum version in your `mod.info` doubles as a mode label. A mod written for the original game is "legacy". A mod for the 64-bit build sets `MinGameVersion` to `3.301` or higher and is "modern"; that is what `ARSENAL new` writes. The built-in `as64+` package always loads before every player mod, so any player mod can override its files, and you cannot move it above them. A mod may name `as64+` in a `Require` line. Mode words such as `"as64"` or `"legacy"` are not folders, so a `Require` naming them counts as a missing mod.

Practical rules:

- If you target the original game and Enhanced mode alike, ship two variants rather than one. ARSENAL's `upgrade` command and Mods > Mods > Upgrade or Port in the window turn an old mod into an AS64 copy without changing the original (see [Bring an old mod up to the 64-bit build](p13-old-mod-to-64-bit.md)).
- Do not leave a mod of the wrong kind in your active list. A mismatched mod is meant to be skipped, but in `as64.exe` a mismatched mod found in the list at startup has stopped the game with "Unable to determine fallback font" before the menu appeared, because the refusal message is written before the fonts are loaded. If the game refuses to start after you changed modes, take the mod out of the list (`ARSENAL modswitch`, section 5) or fix its `MinGameVersion`.
- How the in-game menu switches Enhanced mode on is not described (unconfirmed). The mode follows whether `as64+` is in the active list.

The reference entries [as64+](r01-mod-info-and-folder.md#as64) and [as64/core](r01-mod-info-and-folder.md#as64core) describe the two built-in layers. When a mode change goes wrong, see chapter [21](21-troubleshooting.md#11-symptom-classic-and-enhanced-mode-problems).

### In Gates of Hell
<!-- goh: GHVFS-26 GHVFS-27 -->

Gates of Hell has no Classic or Enhanced mode and no `as64+` package; its version check alone decides whether a mod loads. A `Require` naming `as64+` probably counts as a missing mod there, and a folder named `as64+` is skipped for its name (section 1).

## 5. The active list

The game keeps the list of active mods in your profile file `options.set`:

```
{options
    {mods "as64+:0" "basemod:0" "mymod:2"}
}
```

Each entry is `folder:number`, split at the first colon. The folder part is the lowercase folder name. **The comparison is exact, so a capital letter in the list never matches.** The `Name` from `mod.info` is never used here.

The number is the count of patch files (`1.pat`, `2.pat`, ...) the mod had when it was activated. It acts only as a gate: the game always mounts all the patches the mod really has, even if the list asks for fewer. If the list asks for more patches than the folder holds, the entry is skipped. After you add a `.pat` to an active mod, activate it again so that the number is updated. The easiest way to avoid trouble is to let the game write the list (Options, then the MODS tab, chapter [1](01-getting-started.md)) or to use `ARSENAL modswitch`, which shows the list, plans a change and writes it only with `--write`. It refuses a list that mixes a legacy mod with `as64+`, or a modern mod without it, and it refuses while the game runs, because the game rewrites `options.set` itself. The Play page sets the list for a test run and puts yours back afterwards.

Every time you press Apply in the MODS tab, and at every game start, the game goes through this sequence for each entry, in list order:

1. If the folder does not exist in `mods`, the entry is dropped with the log line `Mod '<entry>' was disabled: Not installed.`
2. If the version gate or the mode check fails, the entry is dropped with a warning.
3. If a required mod is missing or not in the list, the entry is dropped with a warning.
4. If the list number is larger than the patch count, the entry is dropped silently.
5. The remaining mods are sorted so that required mods come first. A circular requirement (A requires B and B requires A) empties the whole list, with a log message that begins `Dependency test error!`.
6. Each surviving mod is mounted, and the cleaned list is written back to `options.set`.

When the game version changes (for example after an update), the whole list is emptied and you must activate your mods again; the log says "Game version update detected". `as64.exe` and `mowas_2.exe` compare the same data version, so switching between them keeps the list. See the reference entries [options.set mods](r01-mod-info-and-folder.md#optionsset-mods) and [lastGameVersion](r01-mod-info-and-folder.md#lastgameversion).

Each Apply is a complete rebuild: the game removes all data, mounts the original game, then mounts every active mod in order. It takes about half a minute for a small mod and can take several minutes for a large one. A file you add to the mod folder while the game is running appears only after the next Apply. At the end of each Apply, `game.log` prints `Repository: N resources`, the size of the file index.

The command-line option [`-no_mods`](r01-mod-info-and-folder.md#-no_mods) starts the game with no mods at all, which is the quickest way to tell whether a problem comes from a mod. How a test run activates a mod and what the log says then is in chapter [18](18-testing-and-logs.md#2-launching-and-activating-a-mod); the button itself is the reference entry [Apply](r01-mod-info-and-folder.md#apply).

### In Gates of Hell
<!-- goh: GHVFS-24 GHVFS-28 GHVFS-31 -->

Gates of Hell keeps the same `{mods}` list in its profile. A Workshop item is named `mod_<item number>` there, after the item and not after its title, so renaming a published mod does not break anyone's list. The game drops a name that appears twice in the list. When it drops an entry, it writes the list back with plain folder names, without the `:number` part. The log shows each step: `Mod: applying mods`, `Mod: activate mod <name>` and `Mod: disable mod <name>`; at start it also writes `Scanning mods in` and `Found N available mods`. Whether an update of the game empties the list as this game does is not confirmed.

## 6. Who wins: the load order

The rule is simple and has no exceptions:

> **The later registration wins the whole file.**

The game mounts the original data first, then the 64-bit build's own `as64/core` layer, then each active mod in list order. A file in a later mod replaces the same virtual path from an earlier mod or from the original game, completely. There is no merging of contents and there are no priorities. If two mods both change `set/stuff/rifle/example_rifle`, the one lower in the "Activated" list supplies the entire file, and the other mod's change to that file is lost. The requirement sort decides the order only between mods that require each other; among mods that do not, the order is not guaranteed, so give a mod that must come after another a `Require` line naming it.

Order *inside* one mod follows the mount sequence from chapter [4](04-vfs-paks-patches.md): `resource.pak`, then the `resource` folder, then the patches, then the localization pak, then the localization folder. A file never wins because it is newer or bigger; timestamps play no part. See the reference entries [Override rule](r01-mod-info-and-folder.md#override-rule) and [Load order between mods](r01-mod-info-and-folder.md#load-order-between-mods).

What this means for you:

- **Everything you do not ship loads from the original.** A small mod needs only the files it changes.
- **Put mods that change the same files in the order you intend.** There is no marker in the log when one mod overrides another, so conflicts are invisible unless you look for them.
- **Prefer small, targeted files.** The fewer files you replace, the fewer conflicts you cause. A copy of a whole data file also drops every entry another mod added to that file.
- **Ship each path once.** Inside a single folder, when a loose file and a pak both hold the same path, the winner depends on name order in the folder listing (chapter [4](04-vfs-paks-patches.md), section 3). Avoid shipping the same file twice within one mod.

Tools show conflicts without you opening a single file. In the window, "Which mod wins" on the Editor page (tab IDE) lists every copy of the open file and the one the game reads. On the command line:

```
ARSENAL conflicts --game <game folder> --mods mymod,othermod
ARSENAL overdiff <game folder>/mods/mymod --game <game folder>
```

The first lists, key by key, which source wins when several mods change the same file, and warns when two mods change the same file with no `Require` line between them. The second lists, for each file you replace, exactly which values you changed compared with what you replaced. Use the second one before every release: it shows accidental edits.

When a file you changed seems to have no effect, chapter [21](21-troubleshooting.md#3-symptom-listed-activated-but-nothing-changed) walks through the causes.

### In Gates of Hell
<!-- goh: GHVFS-25 GHVFS-36 GHVFS-05 GHLOC-01 -->

The rule "the later registration wins the whole file" holds in Gates of Hell too, but the order between mods is set differently. Mods that require others still come after them. Mods that do not require each other are ordered by their `Priority` key (section 2), lowest first, so the mod with the higher number loads later and wins. Two mods with the same `Priority` keep a fixed order. Each mod has only `resource/`, its patches and `localizations/`; the language folders are laid over `resource/` after the mods are mounted, so a file under `localizations/` probably beats the same path in any mod's `resource/` (not confirmed). ARSENAL's `vfs` and `conflicts` tools take the mods in the order you give them and do not sort by `Priority`, so give them the order the game will use.

## 7. Multiplayer: everyone must match

In multiplayer the game compares the data that affects gameplay between players. A mod that adds, replaces or deletes any path under `entity/`, `fx/`, `properties/`, `set/`, `sound/`, `map/single/`, `map/bonus/`, `map/multi/` or `script/multiplayer/` is marked as affecting multiplayer, and every player in the match must have the same version of it. A mod that changes only `interface/` (pictures and menus) is not compared. The content check covers the file kinds `.set`, `.inc`, `.ext`, `.mi`, `.reg`, `.info`, `.def` and `.mdl`; `.lng`, `.dds`, `.ebm`, `.wav` and Lua files are not compared and may differ between players without any warning. When players cannot join each other, check this first. `ARSENAL mpsync --mod <mod folder>` sorts your mod's files into compared and not compared (chapters [12](12-missions-and-multiplayer-setup.md) and [21](21-troubleshooting.md#10-symptom-multiplayer-desync-and-lobby-mismatch); reference entry [multiplayer sync folders](r01-mod-info-and-folder.md#multiplayer-sync-folders)).

### In Gates of Hell
<!-- goh: GHNET-15 GHNET-22 GHVFS-35 GHSRV-03 GHSRV-04 -->

In Gates of Hell the list of active mods sent to other players is the list of mods that really mounted, each with its own version, and players must run the same game version. The game does not copy downloaded mods over `mods/` when you join a match, so every player gets the session's mods from the Workshop. A host starts a separate server program (`call_to_arms_server.exe`) that loads the host's mod list. The start option `-showmodinfo` shows each mounted mod with `[STEAM:<item>]` or `[LOCAL]` and its folder, and marks with `*` a mod that touches the files players compare. Which folders Gates of Hell compares is not mapped, so `ARSENAL mpsync` does not apply there.

## 8. Workshop mods

The two programs handle subscribed Workshop items differently.

- **The original `mowas_2.exe`** copies a subscribed item into `mods/<Name>/`, where `<Name>` comes from the item's own `Name` key. It deletes any old copy there first, adds `{FileId}` to the copy's `mod.info`, and writes a stamp file named after the item number in `mods/`. A local mod with the same `Name` as a subscribed one is overwritten at the next sync. If you publish a mod and later change its `Name`, the folder name on every subscriber's machine changes, and their active lists break.
- **The 64-bit `as64.exe`** loads a subscribed item in place from Steam's download folder and does not copy it. A folder in `mods/` that is an old copy of a subscribed item is ignored, with a log line saying the Workshop item is loaded instead, so a fix you make in that copy never loads.

Either way: give your development copy a different folder name from the published item, and keep notes and `.git` folders out of a folder you upload. See [Workshop copy](r01-mod-info-and-folder.md#workshop-copy) and [Workshop upload](r01-mod-info-and-folder.md#workshop-upload), chapter [20](20-packaging-and-release.md) for releasing, and [Pack and share](p15-pack-and-share.md) for the steps in the window.

### In Gates of Hell
<!-- goh: GHVFS-24 GHVFS-28 GHVFS-30 GHVFS-03 -->

Gates of Hell loads a subscribed item in place, like `as64.exe`, under the name `mod_<item number>`. The item must sit under Steam's `workshop/content/` folder; elsewhere the log says `A workshop mod outside of standard location!`. Local folders are read first, so a local folder named `mods/mod_<item number>` loses to the Workshop item at start, and the log says `Warning! Duplicate mod found [...] using second.` with both paths. Deleting a mod in the game's mod list removes a local folder; for a Workshop item the files stay until Steam removes them. The game comes with its own upload program, `call_to_arms_workshop.exe` in `binaries/x64/`; ARSENAL's Share page is not shown under the Gates of Hell button.

## 9. A worked example

Suppose you want one mod to make rifles more accurate and another mod, by someone else, to change rifle damage, and both touch the file `set/stuff/rifle/example_rifle`. In the Activated list you put `damagemod` above `accuracymod`. The game mounts the original, then `damagemod`, then `accuracymod`. Because both contain that file, `accuracymod`'s copy is the one used, and it still has the original damage numbers, so the damage change is lost. `ARSENAL conflicts --game <game folder> --mods damagemod,accuracymod` shows exactly this. The fix is to make a third mod, with a copy of the file that includes both changes, placed last and with `Require` lines naming the other two. Alternatively, move one change into a different file if the data layout allows it.

## Gates of Hell: summary

The Gates of Hell notes in this book have not been tested in a running game. Check them in your own game before you depend on them.

Gates of Hell, the related game on the same engine, reads mods in a similar way. This table shows, for each section of this chapter, whether it does something different. For a unit taken from Gates of Hell, see [Make a unit from Gates of Hell](p12-unit-from-gates-of-hell.md).

| Section | Gates of Hell | In a few words |
|---|---|---|
| 1. The mod folder | [differs](#in-gates-of-hell) | Only `resource/`, patches and `localizations/` are read; spaces, non-ASCII letters and most punctuation are refused in folder names |
| 2. mod.info | [differs](#in-gates-of-hell-1) | Extra keys `Tags` and `Priority`; a broken file skips that mod only |
| 3. The version gate | [differs](#in-gates-of-hell-2) | Versions `1.xxx`; a bound may be missing; set both |
| 4. Classic mode and Enhanced mode | [differs](#in-gates-of-hell-3) | No modes and no `as64+` |
| 5. The active list | [differs](#in-gates-of-hell-4) | Workshop items named `mod_<item number>`; duplicates dropped |
| 6. Who wins: the load order | [differs](#in-gates-of-hell-5) | `Priority` orders mods that do not require each other |
| 7. Multiplayer: everyone must match | [differs](#in-gates-of-hell-6) | Mods come from the Workshop; compared folders not mapped |
| 8. Workshop mods | [differs](#in-gates-of-hell-7) | Loaded in place; a local copy with the same name loses |
| 9. A worked example | same as far as mapped | Same rule, but `Priority` can set the order instead of a `Require` line |

## Pitfalls

- **Wrong folder name case in `options.set`.** Hand-edited entries must be lowercase.
- **Renamed folder.** The old list entry loads nothing, and the MODS tab shows "Activated" as empty.
- **Missing version range.** An empty `MinGameVersion` or `MaxGameVersion` makes a legacy mod unsupported; a mod with no version lines at all never loads.
- **Wrong mode.** A modern mod in Classic mode and a legacy mod in Enhanced mode are skipped, and at startup the mismatch can stop `as64.exe` before the menu.
- **A broken `mod.info` anywhere in `mods`.** One malformed `mod.info`, even of an inactive mod, can stop every launch. Run `ARSENAL modinfo <game folder>/mods` to check all of them.
- **A `Delete` path without `resource/`.** It matches nothing and says nothing.
- **A new `.pat` in an active mod.** Activate the mod again so that the list number matches.
- **Encoding.** Saving `mod.info` as UTF-16 breaks it. Keep plain ASCII (or UTF-8 without a byte-order mark) with CRLF line endings, and keep `.lng` files in UTF-8.
- **Several mods active at once while testing.** Activate only the mod under test, because the others can override your files.

## Next

Chapter [4](04-vfs-paks-patches.md) goes inside the mod folder: loose files versus paks, how `.pat` and `.patch` files delete and rename things, and how to pack a mod for release. Words you do not know are in the glossary, [22-glossary.md](22-glossary.md).

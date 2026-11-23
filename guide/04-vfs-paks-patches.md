# Chapter 4: Virtual Files, Paks and Patches

Chapter [2](02-install-layout.md) introduced the virtual path and chapter [3](03-mod-folder-and-load-order.md) showed how mods are ordered. This chapter looks at what happens inside one mod: how loose files and paks are combined, how a zip file becomes part of the game, and how a `.pat` patch can delete or rename files that your mod does not own. It ends with the tools that show you the final result and with packing a mod for release.

The short way to pack a finished mod is [Pack and share](p15-pack-and-share.md). The exact rules for every item below are in [Reference 1: mod.info and the mod folder](r01-mod-info-and-folder.md).

> **Encoding reminder.** The game's text files use CRLF (Windows) line endings. The 64-bit build reads every string value as UTF-8, in data files and `.lng` files alike, and identifiers must be plain ASCII. The original data is ASCII outside `;` comments; some comments still hold old cp1251 bytes, which the game skips, so leave them as they are. Editors can silently change the encoding or the line endings when you save, and zip tools can do it when they "convert text files". Check both after every save and every repack.

## What you will learn

- How the game builds its single file index.
- What a pak is and where its root is.
- The exact order in which a mod's pieces are mounted.
- How `.pat` and `.patch` files delete and rename files.
- How to see which copy of a file the game uses.
- How to pack a mod and check the result.

## 1. One index, last one wins

When the game loads a resource, it consults a single list: the **file index**. Every file the game has mounted, whether loose on disk or inside a zip, is one entry in that list under its virtual path. Adding a file whose path is already in the list throws away the older entry. There is no layering and no priority; the most recent addition wins the whole file. Removing a file deletes its entry, and nothing is left behind to show that it was ever there. See the reference entry [Override rule](r01-mod-info-and-folder.md#override-rule).

Names are normalized when they enter the index. Upper case becomes lower case and a backslash becomes a forward slash. Two zip entries that differ only by case or slash direction are therefore one entry, and the later one wins. A path longer than 4096 bytes stops the game with `path is too long`.

A **directory** in the index is not a real object. It is simply the beginning of a lot of names. This is why a delete that ends with `/` can erase a whole folder in one line: it erases every name that starts with that text.

### In Gates of Hell
<!-- goh: GHVFS-09 GHVFS-10 GHVFS-17 -->

The index works the same way: the last registration wins the whole file. Gates of Hell also normalizes every file name read from a data file, so `"Interface\Foo"` in a `.def` finds `interface/foo`; in this game, write names in lower case with forward slashes to be safe. A name with non-ASCII letters may be at most 1023 bytes there, or the game stops with `path is too long`. The list of entries of each pak is kept between starts and read again whenever the pak's size or time changes, so a pak you repack is picked up at the next start.

## 2. Paks are zip files

A pak is an ordinary zip file with the extension `.pak`. Entries may be stored or compressed (deflate). There is no encryption and no special header. Any zip tool can create one, and ARSENAL's packer builds them for you (section 8). When you pack your own by hand:

- Store the entry names with forward slashes and the full virtual path, for example `set/stuff/rifle/example_rifle` inside a mod's `resource/gamelogic.pak`, or `entity/-vehicle/x` inside a mod's `resource/entity.pak`.
- Do not wrap everything in an extra top-level folder. If the pak contains `mymod/set/...`, the virtual path becomes `mymod/set/...` and nothing is replaced.
- Do not let the zip tool convert line endings or encoding of the text files.
- Write correct CRC values. A wrong CRC may still load in the game, but it breaks other zip readers.
- Zip64 archives work, so large paks are fine, but a single entry must stay below 4 GB.

Where the pak's entries land depends on the pak's own place in the tree. Each entry becomes the folder the pak sits in plus the entry name. A pak in your mod's `resource/` folder puts entry `a/b` at the virtual path `a/b`. The base entity paks live one folder deeper (`resource/entity/`), so their entries are rooted one level lower than a mod's `entity.pak`. For your own mod, the rule is easy: **put your paks directly in `resource/`, and put the full virtual path in every entry.** See the reference entry [pak](r01-mod-info-and-folder.md#pak).

Some details about how paks are read, which explain performance:

- Small text-like entries (`.def`, `.mdl`, `.inc`, `.set`, `.ext`, `.mi`, `.reg`, `.info`, `.tpl` and `.txt`) are read into memory when the pak is mounted. Other entries are unpacked each time the game opens them. A mod with thousands of small text files therefore takes longer to apply.
- If a zip holds the same name twice, the later entry wins.
- Directory entries (names ending in `/`) are ignored. Entry names longer than 1023 bytes are cut.

To look inside a pak without unpacking it, open it in the window: the Archive viewer lists every entry of a `.pak`, `.pat` or `.zip` with its size and packing, and opens one entry in its own viewer ([File viewers](19-toolchain.md#file-viewers)). The Editor can also save a file that lives in your mod's own pak: it rewrites that pak and keeps a restore point, so you can go back.

### In Gates of Hell
<!-- goh: GHVFS-15 GHVFS-16 GHVFS-18 GHVFS-19 -->

Paks are zip files there too, but some details differ:

- Every entry without a CRC value writes the warning `no crc for file in package ... performance may be slowed` to `game.log`. Write real CRC values.
- Entries kept in memory are `.reg`, `.def`, `.inc`, `.set`, `.ext`, `.tpl`, `.info`, `.presets`, `.pattern`, `.ammo`, `.fsm` and `.xml`. They are read on first use, not when the pak is mounted. `.mdl`, `.mi` and `.txt` entries are read from the pak each time.
- An entry that cannot be read stops the game with `Failed to read file from pak <name>`, and the message asks you to verify the game files through Steam. A mod pak that cannot be opened stops the game too.
- The game's own paks sit in `resource/` and in its subfolders, such as `resource/entity/`, each keyed at its own folder (chapter [2](02-install-layout.md#gates-of-hell-summary)).

## 3. Loose files

Anything inside `mods/mymod/resource/` is scanned and added to the index, folder by folder, with the same virtual path it has relative to `resource/`. Folders inside the scan are walked in turn, and paks found there are mounted as paks at their own place. This makes it easy to work: edit loose files while you develop, then pack them for release. See the reference entry [resource/](r01-mod-info-and-folder.md#resource).

Not all loose files are added. The scan skips the extensions `.txt`, `.org`, `.msg`, `.scc`, `.temp` and three similar backup extensions, while `.ply` and `.mtl` are explicitly allowed. It also skips a file named `.gitignore` and folders named `.git` or `.svn`. A loose `.txt` file in your mod is therefore invisible to the game, even though the same file inside a pak would be indexed. If you need a loose text file the game can read, such as a console script for `exec`, name it `.cfg`.

Three warnings about loose files:

1. **A loose folder and a pak in the same folder can both hold the same path.** The game does not sort the folder listing itself; it takes what the operating system returns, which on a normal Windows disk is case-insensitive name order, and the later name wins. As a result a loose folder named `set` beats a pak named `gamelogic.pak` (because `set` sorts after it), while a loose `entity` folder loses to `entity.pak` (because it sorts before it). This order has not been seen in play for every folder (unconfirmed). The safe habit is never to ship the same virtual path twice in one mod. See the reference entry [Loose file against pak](r01-mod-info-and-folder.md#loose-file-against-pak).
2. **Timestamps never decide anything.** A pak that is "newer than your edits" matters only as a reminder to repack. If you have a leftover extracted copy of a file, it stays live, and it can override your freshly repacked pak.
3. **Many loose files are slow.** When a match loads, the game opens every file that the multiplayer comparison covers, one at a time. A mod with tens of thousands of loose text files can take minutes longer to start a match than the same files packed in paks. Pack big trees of text files, and keep only a small set of loose fixes.

### In Gates of Hell
<!-- goh: GHVFS-22 -->

Loose files in a mod's `resource/` folder are added the same way. One cap is new: a loose file of 2 GB or more stops the game with `invalid position`, so keep big files in a pak or below that size. Which extensions the scan skips in Gates of Hell is not mapped.

## 4. The mount order inside one mod

For every active mod, the game first applies the `mod.info` `Delete` lines, then mounts these items in this exact order:

1. `resource.pak` in the mod root, placed at `resource/`
2. The `resource/` folder, scanned recursively (any paks inside it are mounted where they are found)
3. `1.pat`, `2.pat`, and so on, each placed at `resource/`, each with its `.patch` applied (section 5)
4. `localization.pak`, placed at `resource/interface/text/`
5. The `localization/` folder, scanned into `resource/interface/text/`

Because each later item adds its files after the earlier ones, a loose file in `resource/` should replace the same path in the mod's root `resource.pak`. That follows from the order, but it has not been seen in play (unconfirmed), so do not ship the same file both in `resource.pak` and loose: keep each path in one place. See the reference entry [Mount order inside a mod](r01-mod-info-and-folder.md#mount-order-inside-a-mod).

Because patches come after the mod's own pak and folder, a patch can delete files that the mod itself brought. Because localization comes last, it can replace text files the patches did not touch. A `.lng` file in your `localization/` folder replaces the original file of the same name completely, with no merge: keys your copy leaves out show blank or as the key (chapter [14](14-localization.md)).

The original game is mounted by the same steps from the game folder, so the game folder's own `resource/` folder, paks, `localization.pak` and `1.pat` are processed the same way. On the 64-bit build, the folder `as64/core/` follows the original game and comes before every mod. Which copy wins between the language folders and the data is explained for texts in chapter [14](14-localization.md#3-how-the-game-chooses-between-files).

### In Gates of Hell
<!-- goh: GHVFS-04 GHVFS-05 GHLOC-01 -->

Gates of Hell mounts three items per mod, and the same three for the base game:

1. The `resource/` folder, scanned with the paks inside it
2. `1.pat`, `2.pat`, and so on
3. The `localizations/` folder

A `resource.pak` in the mod root, a `localization.pak` and a `localization/` folder are not read. Move the root pak into `resource/` (its entries keep their full virtual paths) and the texts into `localizations/<language code>/`. The language folders are not mounted as they are: the files of `localizations/default/` and then of the selected language are laid over `resource/`, so `localizations/default/interface/text/x` becomes `interface/text/x`. This probably happens after all mods are mounted, which means a file under `localizations/` beats the same path in any mod's `resource/` (not confirmed). The base game without its `localizations/` folder stops with `Failed to mount localization`. Texts there are `.pot`, `.po`, `.mo` or `.lng` files ([chapter 14](14-localization.md#gates-of-hell-summary)).

## 5. Patches: `N.pat` and `.patch`

Sometimes you must remove or rename a file that exists in the original game. Replacing a file is not enough when the game would otherwise find the original, for example when you want a file not to exist at all. For this, the game has patch files.

A **`.pat`** file ([N.pat](r01-mod-info-and-folder.md#npat)) is a zip file, named `1.pat`, `2.pat` and so on, in the mod root. It is mounted like a pak at `resource/`, so it may also carry ordinary content files. It must also contain one **`.patch`** document: a small text file in the same data language as other game data. The game finds it by its ending: any file whose name ends in `.patch` will do, whatever it is called. If a `.pat` holds no `.patch`, the game stops with the error `Wrong patch N`.

A patch looks like this:

```
{Patch
    {id 1}
    {delete "set/stuff/junk/old_rifle"}
    {delete "set/stuff/junk/"}
    {remap "set/stuff/gun/a_gun" "set/stuff/gun/b_gun"}
}
```

| Item | What it does |
|---|---|
| [`{id N}`](r01-mod-info-and-folder.md#id) | Must equal the patch's number, or the game stops with `Wrong patch N version` |
| [`{delete "path"}`](r01-mod-info-and-folder.md#delete-patch) | Removes the file. A path ending in `/` removes everything under that folder. A path that does not exist is not an error |
| [`{remap "from" "to"}`](r01-mod-info-and-folder.md#remap) | Moves a file to a new path. If `from` does not exist, the game stops with `File is not found - <from>` |

All paths are written relative to `resource/` (no leading `resource/`). Backslashes are accepted. Other keys inside `{Patch}` are read and ignored.

Some behaviours matter:

- The patch runs **after** your own pak and `resource/` folder, so a `delete` can erase your own files as well as earlier mods' files and the original game's. A later mod can add a path again, because it mounts afterwards.
- Files inside the same `.pat` are mounted **before** its delete lines run, so they survive unless you list them.
- A delete leaves no marker. If something later asks for the deleted file, the game stops with `File not found - resource/<path>`. Only delete files you know nothing else needs, or ship a replacement.
- Patches are applied in numeric order, and the game keeps counting only while `1.pat`, `2.pat`, `3.pat` all exist. A gap (a `1.pat` and a `3.pat` without a `2.pat`) stops the count at 1, and the later file is never mounted, silently.
- A **loose** `.patch` file in the mod root is **never** read. Pack it into a `.pat` first. You may keep the editable `.patch` in the mod root for convenience, knowing the game ignores it, and zip it into `1.pat` when you build.

The mod's patch count is the number written after the colon in the active list entry (chapter [3](03-mod-folder-and-load-order.md)). After you add a new `.pat` to a mod that is already active, activate it again so that the list picks up the new count.

### A small worked example

You want to remove a weapon, `set/stuff/junk/old_rifle`, from the game. In your mod folder:

1. Create the text file `1.patch` containing `{Patch {id 1} {delete "set/stuff/junk/old_rifle"}}`.
2. Zip it into `mods/mymod/1.pat`. Put `1.patch` at the top of the zip, with no folder in front of it.
3. Activate the mod, or activate it again if it was active.

Anything that still refers to `old_rifle` (a unit's loadout, a roster) now fails to find it. You must change those places in the same mod, which is why the delete line is the last step of a clean removal rather than the first. `ARSENAL refcheck` lists the places that still refer to a name.

### `mod.info` `Delete` instead of a patch

`mod.info` can carry a `{Delete "resource/..."}` line instead (chapter [3](03-mod-folder-and-load-order.md), section 2). It needs no `.pat` and works in the 64-bit build, but it runs before your own files are mounted, so it removes only files of the game and of earlier mods, never your own. Its path must start with `resource/`; without that prefix it matches nothing, without any message. See the reference entry [Delete](r01-mod-info-and-folder.md#delete).

## 6. Map overlays and mission data

Two other places also feed the index, and they matter if you make maps.

- A downloaded or local **map folder** (under the game's `maps` folder) is mounted at `resource/map/multi/<name>/`, after any existing files at that prefix are removed. It uses the same sequence (pak, folder, patches) as a mod.
- A map can carry its own data overlay in a folder named `mod/`. When that map's mission loads, the files under it replace the matching paths under `resource/` for the match. This overlay beats every active mod for that match, and it is undone when the scene closes.

Chapter [13](13-maps.md) covers maps in detail, and the reference entries [map folder](r01-mod-info-and-folder.md#map-folder) and [map mod overlay](r01-mod-info-and-folder.md#map-mod-overlay) give the rules.

### In Gates of Hell
<!-- goh: GHVFS-34 -->

A map folder's `resource.pak` is not mounted in Gates of Hell; only its `resource/` folder and its patches are. A multiplayer map shipped as a `resource.pak` inside its folder is not read there, so put its paks inside `resource/`. Whether a map's `mod/` overlay works there is not mapped.

## 7. Inspecting the effective file set

You do not have to guess which copy of a file the game will use. ARSENAL rebuilds the index the way the game does.

In the window, the Editor page (tab IDE) shows it file by file: its Game view marks every file with the layer it comes from (the game, another mod, or yours), and its "Vanilla only" switch shows the original game's files alone. "Which mod wins" (Alt+W) lists every copy of the open file with the one the game reads, "Same file elsewhere" (Alt+O) opens another copy of the same path, "Compare with vanilla" (Alt+V) shows your file beside the copy it replaces, and "Side by side" (Alt+S) shows two copies next to each other. Mods > Mods > Mod Files (with Advanced on) lists every file of your mod and which file the game really uses.

On the command line:

```
ARSENAL vfs <game folder> --mods othermod,mymod which set/stuff/rifle/example_rifle
ARSENAL vfs <game folder> --mods mymod shadowed --list
ARSENAL conflicts --game <game folder> --mods othermod,mymod
ARSENAL overdiff <game folder>/mods/mymod --game <game folder>
```

The first prints which source supplies a given path, with every copy it hides. The second lists every file your mod replaces. The third shows conflicts between mods key by key. The fourth shows, for each file you replace, exactly which values you changed, and warns when your copy of a whole file drops entries that were in the file it replaces. Together they answer almost every "why does the game not show my change?" question. The `vfs` tool also reports the structural mistakes in this chapter: wrongly rooted pak entries, missing `.patch` documents, unusual zip names and files in the mod root that the game ignores.

A useful number: at the end of every apply, the log prints `Repository: N resources`, where N is the size of the index. If you change a mod and the number does not change, the game did not add or remove any file (it may still have replaced one). Chapter [18](18-testing-and-logs.md#5-the-structure-of-gamelog) explains the rest of the log, and chapter [21](21-troubleshooting.md#3-symptom-listed-activated-but-nothing-changed) lists the usual reasons a change does not show.

### In Gates of Hell
<!-- goh: GHLOG-16 GHLOG-07 GHVFS-04 GHVFS-05 -->

`ARSENAL vfs` recognises a Gates of Hell folder by its program in `binaries/x64/` and mounts it the Gates of Hell way: paks in `resource/` and its subfolders, patches, and the `default` language laid over `resource/`. For example `ARSENAL vfs "<Gates of Hell folder>" which set/registry.reg` names the pak that supplies that file. Under the Gates of Hell button the Editor reads the game the same way.

The log reads differently there. Each line starts with the time, `[hh:mm:ss] `. Instead of a size line per pak, `game.log` writes `Mount package <file> with <n> entries` for each pak it mounts, and `Scanning mods in` and `Found N available mods` when it looks for mods. Whether a line like `Repository: N resources` is written is not mapped.

## 8. Packing for release

While you develop, loose files are fine. For release, the usual pak layout is one pak per area, placed in the mod's `resource/` folder:

| Pak in the mod | Holds |
|---|---|
| `resource/gamelogic.pak` | `set/`, `properties/`, `script/` |
| `resource/entity.pak` | `entity/` |
| `resource/interface.pak` | `interface/` |
| `resource/texture.pak` | `texture/` |
| `resource/sound.pak` | `sound/` |
| `resource/map.pak` | `map/` |

In the window, the Share page's step "Package for friends" shows the plan first and writes the package after you confirm it. On the command line, `ARSENAL packer <mod folder> --dry` plans these paks from your loose files and checks them, writing nothing, and `ARSENAL packer <mod folder> --out <folder>` writes them. `ARSENAL build <mod folder>` runs every check first and packs only when the checks are clean (chapter [20](20-packaging-and-release.md)).

If you use a version control system such as git, keep the loose text sources in it, ignore the finished `.pak` files and big binaries, and tell git not to convert line endings (`* -text` in `.gitattributes` and `core.autocrlf=false`) so that CRLF line endings and the old comment bytes in copied files stay byte-identical. Git does not hold your paks, so copy a pak aside before you overwrite it.

Remove any leftover loose copy of a file after you pack it. If you do not, the loose copy may be the one the game loads, and you will "fix" the pak without seeing any change.

### In Gates of Hell
<!-- goh: GHVFS-04 GHVFS-18 GHLOC-01 -->

The same one-pak-per-area layout works, as long as every pak sits inside the mod's `resource/` folder; a pak in the mod root is not read. Texts go to `localizations/<language code>/`, not into a `localization.pak`. Write real CRC values, or the log fills with `no crc` warnings. When you bring a unit from Gates of Hell into an AS2 mod, ARSENAL's packer refuses that mod while it still holds the files it copied from Gates of Hell, because Gates of Hell files must never be published ([Make a unit from Gates of Hell](p12-unit-from-gates-of-hell.md)). The Share page is not shown under the Gates of Hell button. For a Gates of Hell release use the game's own Workshop program (chapter [3](03-mod-folder-and-load-order.md#gates-of-hell-summary)), and see chapter [20](20-packaging-and-release.md) for the checks before a release.

## Gates of Hell: summary

The Gates of Hell notes in this book have not been tested in a running game. Check them in your own game before you depend on them.

| Section | Gates of Hell | In a few words |
|---|---|---|
| 1. One index, last one wins | [differs](#in-gates-of-hell) | Same rule; names from data files normalized; 1023-byte cap on non-ASCII names |
| 2. Paks are zip files | [differs](#in-gates-of-hell-1) | Warning for a missing CRC; other file kinds kept in memory; a bad entry stops the game |
| 3. Loose files | [differs](#in-gates-of-hell-2) | Loose file of 2 GB or more stops the game; skipped extensions not mapped |
| 4. The mount order inside one mod | [differs](#in-gates-of-hell-3) | Only `resource/`, patches and `localizations/`; language files laid over `resource/` |
| 5. Patches: `N.pat` and `.patch` | same as far as mapped | `N.pat` files are mounted as here |
| 6. Map overlays and mission data | [differs](#in-gates-of-hell-4) | A map folder's `resource.pak` is not mounted; `mod/` overlay not mapped |
| 7. Inspecting the effective file set | [differs](#in-gates-of-hell-5) | `ARSENAL vfs` reads Gates of Hell; other log lines |
| 8. Packing for release | [differs](#in-gates-of-hell-6) | Paks inside `resource/`, texts in `localizations/`; the game's own Workshop program |

## Pitfalls

- **Wrong pak root.** An entry stored as `-vehicle/x` in a mod `entity.pak` does not replace `entity/-vehicle/x`. It adds a new, unused path.
- **Extra top-level folder in the zip.** Zip the contents, not the folder that holds them.
- **The same path loose and packed.** Which copy wins depends on name order in the folder; ship each path once.
- **Loose `.patch`.** It is never read. Use a `.pat`.
- **Gaps in the patch numbers.** Counting stops at the first missing number.
- **A `.pat` without a `.patch`, or with the wrong `id`.** The game stops at mount.
- **Delete without replacement.** The game stops with `File not found - resource/...` when something asks for the file.
- **Skipped extensions.** Loose `.txt`, `.org` and similar files are not indexed.
- **A leftover loose copy.** It can beat a freshly repacked pak.
- **Encoding.** Zip tools and editors can change encoding or line endings. Keep CRLF line endings; string values are UTF-8 in data and `.lng` files alike; leave old cp1251 bytes inside vanilla comments as they are.

## Next

Chapter [5](05-sdl-language.md) teaches the data language that nearly every file in this guide is written in. Terms such as "virtual path" are collected in [22-glossary.md](22-glossary.md).

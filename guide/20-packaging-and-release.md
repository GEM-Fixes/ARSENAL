# 20. Packaging and release

A mod that works on your machine is not yet a mod that works on someone else's. This chapter covers how to arrange your files for release, whether to ship loose files or paks, how to check the result, what multiplayer players need to know, and how Steam Workshop publishing behaves.

The short way: [Pack and share](p15-pack-and-share.md) walks through the Share page of the ARSENAL window, step by step. The keys of `mod.info` named in this chapter are described one by one in [Reference 1, mod.info and the mod folder](r01-mod-info-and-folder.md).

The quick way: in the **Quick Guided Task** row above the tabs, pick "make" and "a release". It asks for the name, the text, the version and the picture, runs the release check, and can make a package for friends, a clean copy for the Workshop uploader and a play card, all in one go. See [Use the Quick Guided Task](p17-quick-guided-task.md) and [chapter 19](19-toolchain.md#quick-guided-task).

## What you will learn

- The difference between loose files and paks, and when each is a good idea.
- How a pak is built and how its internal folder paths decide where files land.
- The encoding rules to verify before you ship.
- The pre-release gate: the Share page, `build`, `packer`, `doctor --release` and `release-check --publish`.
- Why multiplayer mods need extra care.
- What Steam Workshop does with your folder, and how to keep a changelog and version history.

## 1. Loose files or paks

You have two ways to deliver the same content.

**Loose files** are ordinary folders under your mod's `resource/` folder: `resource/set/...`, `resource/entity/...` and so on. They are easy to edit and easy to track in git. The downside is that a mod with thousands of small files is slow to copy and slow to load, and players can accidentally edit them.

**Paks** are single archive files holding those same folders. They are quicker to copy and harder to tamper with. A pak is an ordinary zip file (stored or deflated, no encryption, no special header), so any zip tool can open one.

Many modders work loose and only pack at the end. If you do, remember one rule: the game does not pick between loose and pak by date. A loose file in `resource/` always beats the same path in the mod's root `resource.pak`, because `resource/` is mounted after it. Against a pak that sits inside `resource/` (such as `resource/gamelogic.pak`), the folder scan order decides, and the later name wins: a loose folder `entity/` loses to `entity.pak` next to it. A leftover loose copy of a file you meant to remove keeps overriding your pak. Do not ship the same path both loose and in a pak; the `doctor --release` check below looks for exactly this. See [chapter 4](04-vfs-paks-patches.md) for the full precedence rules.

### In Gates of Hell
<!-- goh: GHVFS-04 GHVFS-22 -->

The choice is the same, but a pak must sit inside `resource/`: Gates of Hell does not read a `resource.pak` in the mod root. A loose file of 2 GB or more stops the game with `invalid position`, so keep very large files in a pak. The full mount list is in the next section.

## 2. How the game mounts a mod

When the game loads a mod, it looks at a fixed set of things, in this order:

1. `resource.pak` in the mod root, mounted at `resource/`.
2. The `resource/` folder, scanned recursively. Paks found inside it are mounted too.
3. Numbered patch archives `1.pat`, `2.pat`, and so on, each applying a `.patch` file.
4. `localization.pak`, mounted at `resource/interface/text/`.
5. The `localization/` folder, scanned into `resource/interface/text/`.

Anything else in the mod root is never mounted. In particular, a loose `.patch` file sitting in the mod root is ignored; it only works once zipped inside a numbered `.pat` archive. A loose `.txt` file is also skipped when loose, although the same file inside a pak is read. Folders named `.git` and `.svn` are skipped.

Patch archives are numbered from 1 and the game stops at the first missing number, so a mod with `1.pat` and `3.pat` silently loses `3.pat`.

### In Gates of Hell
<!-- goh: GHVFS-04 GHVFS-05 GHVFS-27 GHVFS-29 GHVFS-09 PORT-42 -->

Gates of Hell mounts only three things from a mod: the `resource/` folder, the numbered `.pat` archives, and a `localizations/` folder. A root `resource.pak`, a `localization.pak` and a `localization/` folder are never read, so a mod laid out for Assault Squad 2 loses its root pak and its texts. Move the pak into `resource/` and the texts into `localizations/<language code>/interface/text/`.

- A file under `localizations/<code>/` is laid over `resource/` for that language and probably beats the same path in any mod's `resource/` folder (not confirmed in game).
- A mod folder whose name has a space, a letter outside plain ASCII, or any of `<>+()[]{}!@#$%^&*-=;:|'"` is skipped. The log says `Warning: invalid mod folder name`. `my-mod` and `my mod` never load: use letters, digits and `_`.
- An empty or broken `mod.info` skips only that mod (`Warning: empty mod.info file found at`, `Warning: failed to load mod`), where Assault Squad 2 stops the whole game.
- Names are turned to lower case and backslashes to slashes as they are read, so a path written with the wrong case or `\` still finds its file.

## 3. Pak roles and names

The vanilla game splits its data into role-based paks, and a mod can do the same. A role is just a convention for which folders go in which file:

| Pak name | Holds |
|---|---|
| `gamelogic.pak` | `set/`, `properties/`, `script/` |
| `entity.pak` | `entity/` |
| `map.pak` | `map/` |
| `interface.pak` | `interface/` |
| `texture.pak` | `texture/`, plus model definitions, icons and effect definitions |
| `sound.pak` | `sound/` |
| `music.pak` | music |

The `packer` tool plans this split for you from your loose files, and the Share page's "Package for friends" step runs it.

### The zip-root rule

This is the most common packaging mistake, so it is worth an example. The path of an entry inside a pak is added to the folder the pak sits in. A mod pak at `mods/mymod/resource/entity.pak` is mounted in the folder `resource/`, so an entry named `entity/-vehicle/x` becomes `resource/entity/-vehicle/x`. The vanilla entity paks sit one folder deeper (in `resource/entity/`), so their entries leave out the `entity/` prefix. If you copy that habit into your own pak, your files end up one level wrong and the game never sees them. Always include the top folder name (`entity/`, `set/`, ...) inside a pak you place directly in `resource/`.

### Other pak limits

- Entry names longer than 1023 bytes are cut off. `packer` warns about names that are too long.
- A pak larger than 4 GB can be read, because the game reads zip64, but a single file inside it must stay under 4 GB.
- If the same name appears twice in one zip, the later entry wins.
- Smaller text-like entries are loaded into memory at mount time, which is why a huge mod can take a long time to mount (a few minutes is possible).

### In Gates of Hell
<!-- goh: GHVFS-10 GHVFS-15 GHVFS-16 GHVFS-18 GHVFS-34 GHLOG-16 -->

The zip-root rule is the same. The limits differ:

- A name with letters outside plain ASCII may be at most 1023 bytes; a longer one stops with `path is too long`.
- Each pak entry without a CRC writes `no crc for file in package ... performance may be slowed` to the log. Write paks with a tool that stores real CRCs.
- A damaged pak entry stops the game with `Failed to read file from pak <name>`, so it names the pak. In Assault Squad 2 the same damage goes unnoticed.
- Text entries are kept in memory after their first read, not read in at mount time; model entries are read from the pak each time.
- A multiplayer map that carries its own `resource.pak` inside the map folder is not read.
- The log names each pak it mounts: `Mount package <file> with <n> entries`.

## 4. Encoding check

Before you pack, make sure the text files are what the engine expects.

- Text data files (`.def`, `.ext`, `.set`, `.mi`, `.patch`, scripts and similar) use CRLF line endings.
- The 64-bit build reads every string value as UTF-8, in data and `.lng` files alike. A string saved as cp1251 loads without error but shows as boxes on screen.
- Identifiers and keywords must be plain ASCII. Old cp1251 bytes inside `;` comments of vanilla files are skipped by the game; leave them as they are.
- Paks are plain zip files.

Many editors silently change the encoding or line endings when you save, especially on files that contain Russian comments. A UTF-16 byte-order mark in an SDL file is fatal. The game itself reads a bare LF as a line break, so a missing CRLF will not break loading; the CRLF convention matches vanilla files and keeps version-control diffs clean. `packer` checks all of this and reports `.lng` files that are not UTF-8, string values that are not UTF-8, non-ASCII identifiers, UTF-16 or UTF-32 byte-order marks, and non-CRLF text. The `enc` pass of `ARSENAL fix` resaves cp1251 text values as UTF-8 in a patch mod. See [chapter 5](05-sdl-language.md) and [chapter 14](14-localization.md).

### In Gates of Hell
<!-- goh: PORT-42 -->

The game's own texts are `.pot` files (UTF-8), and the game ships no `.lng` files. A `.lng` file of a mod is read only from `localizations/<code>/interface/text/` (section 2). Whether the other encoding rules of this section hold the same way is not mapped; check your mod with the Gates of Hell checks on the **Check** page. See [chapter 14](14-localization.md#gates-of-hell-summary).

## 5. The pre-release gate

**In the window**, the Share page does this in order: "About my mod" fills in `mod.info` (name, description, version, and which game version can load it) and the preview picture; "Ready to share?" runs the release checks (tick the slower check for known crash problems too); "Package for friends" writes a ready mod folder with its paks into a folder you choose; "Workshop" makes a clean copy for the uploader. Each step shows what it will write before it writes.

- **About my mod**: "Show what will change" lists the lines of `mod.info` that would change, and "Save to mod.info" writes them. Lines the form does not know, such as the Workshop ID, are kept as they are. For a mod made from someone else's, the credit line takes "Original mod" and "Original author", and "Add credit line to the description" adds "Ported from ... by ...". "Choose picture..." and "Use this picture" copy a PNG or JPG under 1 MB into the mod as `preview.png` or `preview.jpg`.
- **Ready to share?**: "Check if ready" reads `mod.info`, the version range, the name, the description, the version, the picture, stray files (`.git`, notes, `UPGRADE.md`), Gates of Hell content and whether the files can be packed. Each line says OK, "Look at this" or "Fix this". "Also run the check for known crash problems (slower)" adds the static crash check.
- **Package for friends**: "Show plan" and "Write package" write a ready mod folder (its `mod.info` and its paks) into a folder you choose. The folder may not be inside the game folder or a Steam folder ("Not this folder: ..."). Your friend puts the whole folder into the game's `mods` folder.
- **Before you share** lists the rules for a mod made from someone else's: ask the author first, keep the credit, publish it as a new Workshop item. The Apache licence of ARSENAL covers the tool only and gives no rights to anyone's mod or to game files.

A mod that holds a `GOH-ORIGIN.tsv` file (content ported from Gates of Hell, see [chapter 19](19-toolchain.md#appendix-porting-from-gates-of-hell)) is refused by the package, the clean copy and the release check: "this mod holds Gates of Hell content (GOH-ORIGIN.tsv). That can never be shared, so it is not packed." Such a mod is for your private use only.

**On the command line**, run these from any folder. Replace `G` with your game folder.

```
ARSENAL build "G/mods/mymod" --game "G" --strict --out <pak folder>
ARSENAL packer "G/mods/mymod" --dry
ARSENAL doctor "G/mods/mymod" --game "G" --release
ARSENAL release-check --publish "G/mods/mymod"
```

**`build`** runs the whole linting pipeline (see [chapter 19](19-toolchain.md)) and, only if it passes, writes the paks to the `--out` folder. With `--strict`, warnings count as failures too. The tool refuses to write paks inside a game install, so keep `--out` somewhere else. After writing, it reads each pak back to confirm it is valid.

**`packer --dry`** shows the plan: which loose files would go into which role pak, plus any encoding or name warnings. It also warns when a loose file would shadow an entry in a pak you are shipping. `packer <mod folder> --out <folder>` writes the package.

**`doctor --release`** is the ship checklist. It looks for stray development files and root notes, loose files that duplicate pak entries, a missing `mod.info`, empty folders, unusually large files (use `--big MB` to set the limit), and files that the multiplayer check compares only by size.

**`release-check --publish`** refuses (exit 1) a mod that still holds files ported from Gates of Hell, under their own or another name, or a pak packed for private use. Gates of Hell content can never be shared.

Do not skip this just because the mod runs. A leftover test file or a loose duplicate will not show up in your own testing and will bite someone else.

### In Gates of Hell
<!-- goh: GHVFS-14 GHVFS-27 GHVFS-04 -->

Under the GoH header button the Share page works on a Gates of Hell mod: it fills in `mod.info` with the Gates of Hell version range, packs in the Gates of Hell layout (`packer --goh`) and runs the release checks against the Gates of Hell game; the lobby file check of "Play together" is not read for Gates of Hell. None of this has been tried in a running game, so before you share a Gates of Hell mod, also check three things by hand:

- The mod does not replace `set/registry.reg` or `set/registry/dlc.reg`. Either one stops the game at start with `Resource Error`.
- The mod folder name is plain letters, digits and `_` (section 2).
- Paks sit in `resource/` and texts in `localizations/` (section 2).

## 6. Multiplayer compatibility

If your mod changes gameplay data, every player in a match needs exactly the same data. Before a match, the lobby compares the games' data trees:

- The game tree covers `entity/`, `fx/`, `properties/`, `set/` and `sound/`. A separate map tree covers the single-player, bonus and multiplayer maps.
- For text-like files (`.set`, `.inc`, `.ext`, `.def`, `.mdl`, `.mi`, `.reg`, `.info`, and map files), the lobby compares the contents.
- For model, volume, material, animation, patch and Lua files, it compares only the file size.
- Textures, sounds, localization, `script/` and `interface/` are not compared at all.

The size-only rule has a nasty consequence: if you change a model or volume file and the new file happens to be the same size, the lobby says everything matches, but the match later falls out of sync. If you ship a binary change, also change a text file so that the lobby sees a difference. The tool `mpsync` shows exactly which of your files are compared by content, which by size, and which not at all:

```
ARSENAL mpsync --mod "G/mods/mymod" --game "G"
ARSENAL mpsync --game "G" --mods a,b --export fp.json
ARSENAL mpsync --compare a.json b.json
```

The second and third lines compare two players' setups: each player exports a fingerprint of their game with the mods in order, and `--compare` lists what the lobby sees and what it misses.

The mod list also has to match, in the same order. A player who is missing a listed mod is told which one. Different game builds, for example 32-bit and 64-bit, cannot play together at all. The Share page's "Play together" step makes a short text card for your friends with the mods, their order and the game build. The rules for writing scripts that stay in sync are in [chapter 12](12-missions-and-multiplayer-setup.md), and the symptoms of a desync are in [chapter 21](21-troubleshooting.md#10-symptom-multiplayer-desync-and-lobby-mismatch).

### In Gates of Hell
<!-- goh: GHNET-15 GHNET-22 GHNET-35 GHNET-37 GHNET-28 GHNET-65 GHNET-69 GHNET-88 GHNET-98 GHNET-17 GHNET-66 GHVFS-35 -->

- The mod list a match uses is the list of mods that were loaded and applied, not the names in the options.
- Players must have the same game version and the same build (`x64`). A host of another version is not even listed.
- Gates of Hell and Assault Squad 2 (64-bit or not) never play together, and their chat, replays and saves do not cross.
- By default the game does not compare checksums of the game state during a match (`mp_syncLevel` 0), so a match whose data differs is probably not stopped with a desync message: it just plays out differently on each PC. Treat matching mod files as your own job.
- There is no download of mods inside the game. Every player gets the session's mods from the Workshop, so a multiplayer mod for Gates of Hell must be on the Workshop.
- Whether the lobby compares data files the way described above is not mapped.

## 7. Versions and the minimum game version

`mod.info` carries a name, a description and a supported version range. See [chapter 3](03-mod-folder-and-load-order.md) and [Reference 1](r01-mod-info-and-folder.md) for the keys. Four things matter at release time:

- A legacy mod (for the 3.262 data) needs both `MinGameVersion` and `MaxGameVersion`. Without them it is treated as unsupported, unless the player has turned off the mod version check in the console. A modern mod needs only `MinGameVersion` of 3.301 or higher; its `MaxGameVersion` is ignored.
- The two game modes filter mods by version. A mod whose `MinGameVersion` is 3.301 or higher counts as an Enhanced mod; one written for 3.262 counts as a Classic mod. Wrong-mode mods are switched off without a message. If you want both audiences, ship two copies or follow the guidance in chapter 3.
- Only the parts that both version numbers have are compared, so `3.262.1` and `3.262` count as equal.
- A `mod.info` the game cannot read, for example one with an unescaped quote in the description, stops the game from starting at all, for every player who has it in their `mods` folder.

Use `modinfo` before you release:

```
ARSENAL modinfo "G/mods/mymod"
```

### In Gates of Hell
<!-- goh: GHVFS-26 GHVFS-02 GHVFS-01 GHVFS-36 GHVFS-25 GHVFS-29 PORT-43 -->

- Versions are on the Gates of Hell scale, 1.x (the game is 1.067). An Assault Squad 2 number such as 3.301 is refused with "Unsupported game version". Rewrite both bounds when you move a mod across.
- `MinGameVersion` and `MaxGameVersion` are each optional: a missing bound is open, so a mod with neither loads in any version.
- A `Tags` line holds words separated by spaces. The tag `develop` lifts the version check for that mod, and `no_delete` hides its delete button. The console variable `dev_disableModVersionControl` lifts the check for every mod.
- `Priority` (a whole number, 1 when missing) orders mods that do not depend on each other: a higher number is applied later and wins.
- A `mod.info` the game cannot read skips only that mod, it does not stop the game.

See [Reference 1](r01-mod-info-and-folder.md#gates-of-hell-only) for these keys.

## 8. Steam Workshop

Two uploaders can publish a mod. ARSENAL's own **Workshop uploader** (`workshop_gui.exe`) is the one the Share page sets up and opens; see [The ARSENAL Workshop uploader](#the-arsenal-workshop-uploader) below. The game also ships its own uploader, `mowas_2_workshop.exe` in the game folder. Both take your whole mod folder, with these effects:

- The game's own uploader requires a title, a description of up to 8000 bytes, a preview picture (JPG, PNG or GIF under 1 MB), tags, a visibility setting and a change note.
- It looks for a preview named `preview.jpg`, `.png`, `.gif` or `.jpeg` in your mod folder, otherwise in `mods/previews/<folder>.jpg`. The Share page copies your picture into the mod as `preview.png` or `preview.jpg`.
- **Everything in the folder is uploaded.** That includes a `.git` folder, notes and development files. Upload the clean copy the Share page makes, or exclude them yourself.
- The uploader adds a `{FileId "..."}` line to your `mod.info` the first time. Every other byte is preserved. Leave that line in place on later uploads, because it tells the uploader which Workshop item the folder belongs to.
- The 64-bit build loads a subscribed item in place, from Steam's download folder. The original `mowas_2.exe` instead copies the download into `mods/<Name>/`, where `<Name>` is the `Name` text from your `mod.info`. On the original game, **changing `Name` after publishing changes the folder name on every subscriber's machine**, and any mod or profile that lists yours will then point at a folder that is gone. In a mod list, a Workshop mod is named by its title, not by its item number.
- On the original game, a local mod with the same `Name` as a subscribed one is overwritten on the next sync unless its stamp file is up to date. On the 64-bit build, a `mods/` copy of a subscribed item is ignored and the log says it is an old copy, so a fix you make by hand in that copy never loads: rename it or unsubscribe.

### The ARSENAL Workshop uploader

The **Workshop** step of the Share page ends with the "Workshop uploader" box. The uploader is `workshop_gui.exe`. It works with Assault Squad 2, the 64-bit build and Gates of Hell, and it must sit beside the game program: in the game folder, or in `binaries\x64` for Gates of Hell.

- The box says whether "the uploader is in the game folder", "not the copy ARSENAL has" or "not in the game folder yet". Type "Another game folder, for example Gates of Hell" to set it up for a game other than the one ARSENAL is set to.
- "Put the uploader into the game folder" lists what it would do with three files, and "Copy these files now" does it (the [confirm box](19-toolchain.md#the-confirm-box)). `workshop_gui.exe` is copied, or replaced when a different copy is there. `steam_api64.dll` is copied only when the folder has none, and `steam_appid.txt` is written only when the folder has none, with the Steam id of that game. A `steam_api64.dll` or `steam_appid.txt` that is already in the game folder is never overwritten, and no other game file is touched. This is the one time ARSENAL writes into a game folder.
- "Open the Workshop uploader" starts it. Steam must be running and signed in. Choose your clean copy folder, fill in the title and the picture, and press Upload. On the first upload it writes the Workshop ID into `mod.info`, and it lists the items you already have.
- "This copy of ARSENAL does not hold the uploader files (the workshop_gui folder is missing)" means the `workshop_gui` folder that comes with ARSENAL is not next to the program.

The same from the command line:

```
ARSENAL workshop status "G"
ARSENAL workshop install "G" --dry
ARSENAL workshop install "G"
ARSENAL workshop start "G"
```

`status` says whether the uploader is there and what `install` would do; `--dry` shows the plan without copying. A folder that holds none of `as64.exe`, `mowas_2.exe` or `call_to_arms.exe` is refused: "This is not a game folder of Assault Squad 2 or Gates of Hell". If a copy fails, close the uploader and the game and check that the folder is not read-only.

### The clean copy

"Show what the clean copy holds" counts the files and lists what is left out; "Make clean copy" writes the mod folder into a folder you choose, which must be empty. Left out are the folders `.git`, `.github`, `.vscode`, `.idea`, `node_modules` and `__MACOSX`, the files `UPGRADE.md`, `.gitignore`, `.gitattributes`, `Thumbs.db` and `desktop.ini`, files named `notes`, `note` or `todo` (with any ending), and files ending in `.bak`, `.tmp`, `.orig` or `.log`. Your mod itself is not changed.

The step warns when a Workshop ID exists and the `Name` in `mod.info` differs from the folder name or changed since you last saw it, and when the mod has `UPGRADE.md` (made from another mod: get the original author's permission first). The checklist above the box repeats the rules of this section: upload the clean copy, keep the `FileId` and `Name` lines, a PNG or JPG picture under 1 MB, run "Ready to share?" first, and never Gates of Hell content.

### In Gates of Hell
<!-- goh: GHVFS-24 GHVFS-28 GHVFS-30 GHVFS-35 GHNET-44 GHNET-51 GHLOG-20 -->

- The game ships its own uploader, `call_to_arms_workshop.exe` in `binaries\x64`. The ARSENAL uploader goes into the same folder; the `steam_api64.dll` that Gates of Hell already has there is left alone.
- A Workshop item loads in place, from Steam's download folder. Its mod name is `mod_<item number>`, fixed by the item, so changing `Name` does not move anything. A Workshop item outside a `workshop/content/` folder is skipped with `A workshop mod outside of standard location!`.
- `FileId` in `mod.info` is read by local mods only. A local folder `mods/mod_<item number>` loses to the Workshop item of that number, and the log says `Warning! Duplicate mod found`.
- Workshop tags are split on commas.
- You can also upload your own replays to the Workshop from the replay list.
- The log writes `Workshop item <id> installed successfuly` when an item arrives, and `Steam is in OFFLINE mode. Some features are disabled` without Steam.

## 9. Versioning, changelog and git

Keep a changelog file in your repository, but outside the folder you upload (or exclude it). For each release, note the version, the date, the units and systems you changed and whether the multiplayer data changed, because that tells players whether they must all update together. The Share page's "New version" step raises the version number (small fix, new things, big change), takes a change note and lists the files that changed.

Git works well for mods if you set it up for the game's text files:

- Put the repository at the mod root, above `resource/`.
- Track text sources: `.def`, `.mdl`, `.mtl`, `.vol`, `.set`, `.inc`, `.ext`, `.lng`, `.txt`, extension-less stuff files and `.anm`.
- Ignore `*.pak`, large binaries (`.ply`, `.dds`, `.tga`, `.wav`), terrain data and logs.
- Add a `.gitattributes` with `* -text` and set `core.autocrlf` to false, so CRLF line endings and old comment bytes stay byte-for-byte identical. Without this, git may convert line endings and damage a file.
- Git does not hold your paks, so copy a pak aside before you overwrite it.

When a game update changes vanilla files you build on, two tools tell you what moved:

```
ARSENAL drift stamp "G/mods/mymod" --game "G"
ARSENAL drift check "G/mods/mymod" --game "G"
ARSENAL release-check --replan "G/mods/mymod"
```

`drift stamp` writes a `release.json` fingerprint of the vanilla files you override. After a game update, `drift check` shows which of them changed, so you know which of your overrides need a fresh look: your copy of a whole file hides every update the game makes to it. `release-check` (the Share page's "Game updated?" step) compares the game program with the last known build, and `--replan` shows what the changes hit in your mod.

## 10. Release checklist

1. Edits finished, checked in game ([chapter 18](18-testing-and-logs.md)), game log read.
2. `build --strict` passes, or "Check if ready" on the Share page shows no problems.
3. Encoding verified: CRLF line endings, UTF-8 string values in data and `.lng` files, ASCII identifiers.
4. `doctor --release` shows no stray or duplicate files.
5. `mod.info` has a supported version range and a final `Name`.
6. If multiplayer data changed, `mpsync` run, and a binary-only change paired with a text change.
7. No Gates of Hell content (`release-check --publish` passes).
8. Preview picture present, `.git` and notes excluded.
9. Changelog written; git tag made.

### In Gates of Hell
<!-- goh: GHVFS-04 GHVFS-14 GHVFS-26 GHVFS-27 GHVFS-35 -->

For a Gates of Hell mod, replace points 5 to 8 with these:

1. `mod.info` versions on the 1.x scale, or no bounds at all.
2. Mod folder name of plain letters, digits and `_`; paks in `resource/`, texts in `localizations/`.
3. `set/registry.reg` and `set/registry/dlc.reg` not replaced.
4. For multiplayer, the mod is on the Workshop, because players cannot get it any other way inside the game.

## Gates of Hell: summary
<!-- goh: GHVFS-04 GHVFS-26 GHVFS-36 GHNET-44 GHNET-69 -->

The Gates of Hell notes in this book have not been tested in a running game. Check them in your own game before you depend on them.

| Section | Gates of Hell | In short |
|---|---|---|
| 1. Loose files or paks | [differs](#in-gates-of-hell) | No root `resource.pak`; loose files under 2 GB |
| 2. How the game mounts a mod | [differs](#in-gates-of-hell-1) | Only `resource/`, `.pat` and `localizations/`; strict folder names |
| 3. Pak roles and names | [differs](#in-gates-of-hell-2) | Same zip-root rule; CRC warnings, damaged entries stop the game |
| 4. Encoding check | [differs](#in-gates-of-hell-3) | Texts are `.pot`; mod `.lng` files only under `localizations/` |
| 5. The pre-release gate | [differs](#in-gates-of-hell-4) | Share page packs the GoH layout; registry files must stay vanilla |
| 6. Multiplayer compatibility | [differs](#in-gates-of-hell-5) | Version and build must match; no checksum desync check by default |
| 7. Versions and the minimum game version | [differs](#in-gates-of-hell-6) | 1.x scale, optional bounds, `Tags`, `Priority` |
| 8. Steam Workshop | [differs](#in-gates-of-hell-7) | Items named `mod_<item number>`; own uploader in `binaries\x64` |
| 9. Versioning, changelog and git | not mapped | The git advice holds for any game; game update checks not mapped |
| 10. Release checklist | [differs](#in-gates-of-hell-8) | Four points replace the Assault Squad 2 ones |

### Mod tags and priority

Gates of Hell reads two `mod.info` keys that Assault Squad 2 ignores: `Tags` (`develop`, `no_delete`) and `Priority`. Both are described in section 7. Assault Squad 2 skips them without a message, so a `mod.info` that carries them still loads there.

### Replays on the Workshop

Gates of Hell can upload a replay you played yourself to the Workshop, as public, friends-only or private. The title is the replay's title and the picture is taken from the map preview. Assault Squad 2 has nothing like it.

## Pitfalls

- A forgotten loose copy can override a pak, so delete extracted copies before release.
- A pak placed inside `resource/` needs the top folder name in its entry paths.
- A loose `.patch` file is never read; only one inside a numbered `.pat` is.
- Same-size binary edits pass the lobby and desync during play.
- Changing `Name` after publishing moves the folder name for subscribers on the original game.
- A mod made from someone else's needs that author's permission; name the original mod and its author in the description, and publish it as a new Workshop item.
- Editors that quietly re-encode text files undo all your care.
- On Gates of Hell, a mod folder name with a `-` or a space never loads, and a root `resource.pak` is never read.

Next: [Chapter 21, Troubleshooting](21-troubleshooting.md).

<!-- internal -->

Engine reference: `vfs/mount`, `vfs/workshop`, `testing/packing`, `net/appcrc`.

<!-- /internal -->

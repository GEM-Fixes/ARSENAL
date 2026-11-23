# 14. Localization: Names, Descriptions and Tooltips

The short way: [Add or change text and translate it](p07-text-and-translation.md) gives the steps for naming a unit, writing texts and making a translation. This chapter explains how texts are found and loaded. The file format and every formatting tag have their own entries in [Reference 9, .lng text files](r09-interface-and-localization.md#lng-text-files).

## What you will learn

- Where the game gets every piece of visible text, and how a text is found from a key.
- How to read and write a `.lng` file, including colours and special characters.
- Why `.lng` files must be UTF-8, and what breaks if you forget.
- Which key families exist (unit names, weapon names, tooltips, mission titles) and how to add texts for a new unit step by step.
- How to translate a mod with `lng extract` and `lng merge`, and which tools check your texts.

## 1. Where text comes from

Almost nothing the player reads is stored inside the unit or weapon data itself. A `.def` file says what a unit *is*; the words "Rifle Squad" that appear on its purchase card live in a separate localization file. The game builds a **key** (a slash-separated address such as `desc/squad/riflemans(usa)`) from the data it is showing, then looks that key up in the loaded `.lng` files. If the key is missing, the game does not complain. It prints the raw key on screen instead, so a card that reads `desc/squad/riflemans(usa)` means "I looked, and nobody defined this".

Inside a mod, put your text files in a folder called `localization/`. The game sees that folder as the virtual path `/interface/text/`, so `mods/mymod/localization/desc.lng` is the same file the game would otherwise find in its own `localization.pak` (see [Chapter 4: Virtual File System, Paks and Patches](04-vfs-paks-patches.md) for how mod files layer over vanilla). The vanilla files are `desc.lng` (names), `info.lng` (tooltips), `#dlg_frontend.lng`, `#dlg_ingame.lng`, `#dlg_mp.lng`, `#tips.lng`, `mission.lng`, `campaign.lng` and the single-player mission files under `mission/single/`. The editor's own texts are `#editor.lng` in `interface.pak`. The 64-bit build adds its own texts under `as64/core/localization/as64/`, which only that build has.

The game loads every `.lng` file under `/interface/text/`; there is no language choice inside the game. An installation ships one language set, so a translation is a set of files that replaces the texts (section 6).

### Important encoding rule

Text data files in this game (`.def`, `.ext`, `.set`, `.mi`, `.patch`, scripts) use **CRLF line endings**. The 64-bit build reads every string value as **UTF-8**, in those files and in `.lng` files alike, and draws all text as UTF-8. If you save a `.lng` file as cp1251, the file still loads with no error, but every accented or Cyrillic letter shows as a replacement box on screen. Keys, tags and other identifiers should be plain ASCII. The original data is ASCII outside `;` comments; some comments still hold old cp1251 bytes, which the game skips, so leave them as they are. Many editors change encoding or line endings silently when you save, so check what your editor did, especially after opening a copied vanilla file with Cyrillic comments.

Two more facts to keep in mind:

- A UTF-8 byte-order mark (BOM) at the start of the file is accepted. UTF-16 and UTF-32 files stop the game with "Please resave file in UTF8".
- A `.lng` file must have `{tags ...}` as its root block. A file without it stops the game at startup with "Identifier expected!". Never ship an empty `.lng` file.

### In Gates of Hell

<!-- goh: GHLOC-01 GHLOC-02 GHLOC-03 GHLOC-04 GHLOC-05 GHLOC-09 -->

Gates of Hell has a language choice, so its texts live in one folder per language: `localizations/<code>/interface/text/`, for example `localizations/default/interface/text/` and `localizations/ru/interface/text/`. A `.lng` left at the old `localization/` path is not read there.

- Texts load in two layers. The fallback layer is the default language (`.pot` files, then `.lng`). The primary layer is the chosen language (`.mo`, `.po` and `.lng`). A key is looked up in the primary layer first, then in the fallback.
- The language codes `default` and `en` load only `.pot` and `.lng`, never `.po` or `.mo`.
- Each language folder has a `localization.info` with a `language` group: `order`, `code`, `name`, `steamLanguageCode` and `defaultChatChannel`. A new language is a new folder with this file.
- The language is chosen in this order, each later one winning: the config value `localization/language`, the Steam language (matched by `steamLanguageCode`), then the player's own choice (the `language` value in the `game` group of the profile's options). A code that is not installed falls back to `default`.
- A missing key still shows its own name on screen, but Gates of Hell also writes `Missing text: [key]` to the log, once per key. Assault Squad 2 writes nothing.

For someone who works on both games: an Assault Squad 2 mod's `localization/` folder means nothing to Gates of Hell, and a Gates of Hell language folder means nothing to Assault Squad 2.

## 2. The `.lng` syntax

A `.lng` file is an [SDL](05-sdl-language.md) file with a few extra rules. Here is a small one:

```
{tags
	{"squad"
		{"riflemans(usa)" "Rifle Squad"}
		{"mymod_scouts(usa)" "Scout Team"}
	}
}
```

The rules:

- The root block is always `{tags ...}`.
- Blocks whose children are strings are **texts**. Blocks whose children are other blocks are just levels in the key path.
- The key is the file's name without the extension, followed by the nested names. This file is `desc.lng`, so the first entry above has the key `desc/squad/riflemans(usa)`. A file in a subfolder gets the folder path in front of its name.
- A semicolon starts a comment that runs to the end of the line.
- A string never spans lines. Use `\n` for a line break inside the text. Other escapes are `\"` (a quote), `\\` (a backslash) and `\t` (a tab).
- If a block holds several consecutive strings, they are joined together. This lets you split a long description across several lines of the file.
- Keys are case-insensitive and may contain spaces and parentheses.
- Line endings may be CRLF or plain LF in a `.lng`.
- `(include ...)` and `(define ...)` work as in other data files; they are expanded before the keys are read.
- The file name itself may contain non-ASCII letters, but plain ASCII names are safer inside paks.

### Colours and formatting tags

Inside a text you can use angle-bracket tags:

| Tag | Meaning |
|---|---|
| `<c(RRGGBB)>` or `<c(255 255 255)>` | Set the text colour; `c*(1.5)` changes brightness. `</c>` returns to the default. |
| `<f(font)>`, `<s(28)>`, `<s+2>`, `<s-2>` | Choose a font, set a size, or change the size. |
| `<b>`, `<i>` (`<b->` switches bold off) | Bold, italic. |
| `<e(shadow)>` | Effect: `shadow`, `shadow_ex`, `highlight`, `disabled` or `default`. |
| `<x.>`, `<y+>`, `<p(n)>`, `<t(n)>` | Alignment, letter spacing and tab width. |

Several operations can share one tag, for example `<f(impact)s(28)c(255 255 255)>`. To show a literal `<`, write `<<` or `&lt;`; `&gt;`, `&amp;` and `&quot;` also work. See [Text formatting tags](r09-interface-and-localization.md#text-formatting-tags).

Example of a coloured line:

```
{"hint" {"mymod_note" "Cost: <c(FFCC00)>120 MP</c>\nUnlocks after 5 minutes."}}
```

Be careful with unclosed tags. A tag that is missing its closing `>` swallows the rest of the text, and an unclosed colour tag tints everything after it. Vanilla weapon texts close each colour by switching back to white, `<c(ffffff)>`.

Some texts are filled with numbers by the game, which puts the values into the text's `%` placeholders in order. When you change or translate such a text, keep every placeholder of the original, in the same order; otherwise values go missing or land in the wrong place, with no error.

A character the font does not contain, such as an em dash or a curly quote in some fonts, is drawn as `?`, with no line in the log. The Font viewer of the ARSENAL window shows which characters a font has: type a line and the missing ones show as `?` (see [File viewers](19-toolchain.md#file-viewers) and [Chapter 15, section 7](15-interface-and-icons.md#7-fonts-cursors-and-hud-files)).

### In Gates of Hell

<!-- goh: GHLOC-06 GHLOC-07 GHLOC-09 GHLOC-23 GHLOC-25 GHUI-204 GHUI-205 -->

Gates of Hell still reads `.lng` files with the same rules (`{tags}` root, key = folder plus file title, a `#` title dropped), but its own texts are gettext files: `.pot` for the default language, `.po` or compiled `.mo` for a translation.

- The key of a `.po` or `.pot` entry is its `msgctxt`, read in lower case. An entry without `msgctxt`, or one marked `fuzzy`, gives no text.
- An empty `msgstr` shows the `msgid` instead. The `charset` in the file header is converted to UTF-8, and a UTF-8 BOM is skipped.
- Plural forms do not work. Write one `msgctxt`, `msgid` and `msgstr` per key.
- The text tags are the same, with two changes. A new tag `<M(upper)>`, `<M(lower)>` or `<M(none)>` changes the letter case; Assault Squad 2 shows that tag as plain text. The effects `<e(shadow_ex)>` and `<e(highlight)>` look swapped between the two games.

## 3. How the game chooses between files

Three behaviours matter when your mod ships a `.lng` file.

1. **Same path replaces the whole file.** If your mod has `localization/desc.lng` and vanilla has the same, your file replaces vanilla's entirely. There is no per-key merge. Every vanilla key your copy lacks will now show as raw key text, with no error. This is the most common localization mistake.
2. **Duplicate keys: the later file wins.** Files load in sorted path order. When the same key appears twice, the later one wins and the game logs "Localization key redefinition", even when both texts are the same. A normal vanilla install already logs this message a few hundred times (the editor's texts alone about ten), so it is mostly noise. Because files whose names start with `#` sort before `desc.lng`, a key in your `#mymod.lng` that vanilla's `desc.lng` also defines **loses to the vanilla text**: the buy panel, tooltip and info panel keep showing the vanilla words. To change a vanilla text, ship a full copy of `desc.lng` as in point 1; to add new text, use a new key. See [Chapter 18: Testing and Logs](18-testing-and-logs.md).
3. **The safe approach is a new file.** Instead of replacing `desc.lng`, ship your own file named like `#mymod.lng`. A file whose name starts with `#` drops its own title from the key. So:

```
{tags
	{"desc"
		{"entity"
			{"mymod_tank" "Mark IV Experimental"}
		}
	}
}
```

in `#mymod.lng` produces the key `desc/entity/mymod_tank`, exactly as if it had been written in `desc.lng`. Use new key names for new units this way, and change vanilla names only in a copy of the whole vanilla file. The new mod made by `ARSENAL new` (or the New mod card on the Mods page) already has such a `#<mod>.lng` file.

### In Gates of Hell

<!-- goh: GHLOC-01 GHLOC-08 -->

- Between files, the later file still wins and the log says "Localization key redefinition", naming both places. Files load by kind first, then by sorted name.
- Inside one file the rule is the other way round: the first definition stays. In Assault Squad 2 the later one wins inside a file too.
- Because a key is looked up in the chosen language first and in the default language after, a translation can change single keys without copying the default files.

## 4. Key families

You rarely have to invent a key. The game builds them from your data, so your job is to supply the text under the right name. The full list is in [Reference 9, Text keys](r09-interface-and-localization.md#text-keys).

| Key | Used for |
|---|---|
| `desc/squad/<name>(<side>)` | Squad cards in the multiplayer purchase panel. Vehicle-like cards with a bare name use the bare name with no side. |
| `desc/entity/<model>` | Vehicle and gun names, also the vehicle's purchase-card name. |
| `desc/human/mp/<side>/<breed>` | Individual soldier names. The `_vision` and `_assist` breed variants are separate breeds and need their own keys. |
| `desc/weapon/<tags>`, `desc/ammo/<tags>`, `desc/stuff/<tags>` | Item names. The tags are the item's tags in order, joined by spaces, minus the words grenade, pattern, ammo and weapon. An item tagged `ammo` uses `desc/ammo`, one tagged `weapon` uses `desc/weapon`, anything else `desc/stuff`. An item's own `Desc` field replaces the key. |
| `desc/weapon/type/<type>` | Weapon class names in the vehicle weapon panel. |
| `info/squad/<name>`, `info/entity/<name>` | Tooltip and info-window text. A squad card shows its small "i" button only when the `info/squad` key exists; a vehicle card also shows it for the game's own technical info. A card's `{info X}` points it at the key `X` instead. |
| `info/special/<model>`, `info/armor_angle/<model>/<volume>` | A short class label ("field gun") and armour angle text. |
| `component/...` | Damage report lines, in `#dlg_ingame.lng`. A `damage_report` text that is not a key is printed as written; a misspelt key shows raw. |
| `mission/multi/<map folder>/name`, `mission/single/...` | Map and mission titles. A map in a sub-folder needs the whole path, `mission/multi/<sub>/<map>/name`. |
| `mp/`, `options/`, `actionbar/`, `button/`, `loading/`, `hints/` | Interface texts (see [Chapter 15](15-interface-and-icons.md)). |

When the game needs a unit name it tries several places in order: the text key named in the unit's entry in `set/registry/unit.reg`, then the soldier breed key, then the model key, then the squad key. This is why a vehicle can be named by its model key while an infantry squad is named by its squad key.

### In Gates of Hell

<!-- goh: GHUI-213 GHLOC-14 GHLOC-15 GHLOC-16 GHLOC-17 GHLOC-18 GHLOC-19 GHLOC-21 GHLOC-22 -->

Several families differ, so a text file copied from one game to the other shows raw keys or wrong numbers.

- The unit info window lists the card's vehicles and soldiers, each with its `desc/human/<breed>` name and weapon. It does not read `desc/squad/...` or `info/squad/...` there, and `info/armor_angle/...` is not read at all. Where the game still asks for a squad name and finds none, it shows `???<name>`.
- The weapon panel names a shell by its kind, `desc/ammo/<kind>`. Gates of Hell knows 37 kinds (`he`, `ap`, `apcr`, `heat`, `sm`, `wp` and many more), Assault Squad 2 four (`fg`, `ap`, `atgm`, `heat`).
- The buy tooltip uses `mp/scene/hint_available`, `mp/scene/hint_time2` (Assault Squad 2: `hint_time`) and `mp/scene/hint_requires/<condition>`.
- The pause hint is `mp/scene/pause` (Assault Squad 2: `hints/pause`).
- A team title is only its name; an Assault Squad 2 `mp/team/...` text with `%s` for the army shows the `%s` raw.
- `mp/statistics/result/resources` takes one number (Assault Squad 2: two).
- The mass of an inventory item is written with `humanbar/equipment_mass`.
- New keys for the new game modes, in the `text` group under `mp` and `game`, for example `ammunition_point_enabled` and `evacuation_wavetime`.

## 5. Step by step: adding texts for a new unit

In the window, the Units page does this for one name: pick your mod and the unit, choose Name under "Quick change", type the name, press Preview and then Write. A new key goes into your mod's `#<mod>.lng`; a name that vanilla's `desc.lng` already holds goes into a full copy of `desc.lng` in your mod, so the other names stay. By hand:

1. **Find the identifiers.** You need the `.def` base name (for the model key), the multiplayer card name (the first word of the unit's entry in the multiplayer units data, see [Chapter 12](12-missions-and-multiplayer-setup.md)), and for soldiers the breed name.
2. **Choose the file.** Create `mods/mymod/localization/#mymod.lng` with a `{tags ...}` block, or use the one your mod already has.
3. **Write the keys.** For a vehicle: `desc/entity/<model>` for the name and `info/entity/<name>` for the tooltip. If the card name differs from the model name, add `desc/entity/<card>` too. For a squad: `desc/squad/<name>(<side>)` and `info/squad/<name>(<side>)`.
4. **Search before you add.** Search all `.lng` files for the lowercased key to be sure you are not creating a duplicate.
5. **Escape and close.** Escape quotes and backslashes. Close every colour tag.
6. **No repack needed for a loose folder.** Texts are read when mods are applied, so restart the game or apply the mods again in the Mods screen.
7. **Look in the game.** Start a match ([Chapter 18](18-testing-and-logs.md)), hover over the card, open the info window, and read `game.log` for new warnings.

If a card shows raw `desc/squad/...` text, the key is missing or spelled differently (case does not matter, spaces and brackets do).

The helper tool does steps 2 to 5 for one key:

```
ARSENAL lng-add mods/mymod --file "#mymod.lng" --key desc/entity/mymod_tank --text "Mark IV Experimental" --dry-run
```

It adds or replaces one key, keeps the rest of the file byte for byte (including your line endings and BOM), creates the file with a valid `{tags}` block if it does not exist, and refuses to overwrite an existing key unless you add `--force`. It warns when vanilla defines the same key in another file, since vanilla would then win. `--file` is the path under `localization/`, and `--key` is the full key as the game sees it. Remove `--dry-run` to write. (`ARSENAL <tool>` is a shorthand for running the tool from the toolchain; see [Chapter 19: The Toolchain](19-toolchain.md).)

The quick way: in the window's Quick Guided Task row choose "I want to make" or "change" and then "the game's texts or a translation". It asks for the lines, writes them into your mod's text file and runs the checks of section 7 (`lnglint` and `loccover`). See [Use the Quick Guided Task](p17-quick-guided-task.md) and [Chapter 19, Quick Guided Task](19-toolchain.md#quick-guided-task).

### In Gates of Hell

<!-- goh: GHLOC-01 GHLOC-09 GHLOC-12 GHLOC-24 -->

The steps are the same, with three changes. The file goes into `localizations/default/interface/text/` (or a language folder), not `localization/`. A `.lng` still works there; the game's own files are `.pot`. The console command `dev_l10n_reload` reads the chosen language's texts again, so you can see a change without a restart. The Gates of Hell editor no longer saves `.lng` files.

## 6. Translating a mod

Because the game loads every `.lng` it finds and has no language switch, a translation of your mod is a second set of files at the same paths as your mod's own, shipped as a small "language patch" that players activate together with your mod, so its files replace yours. Two commands make it:

```
ARSENAL lng extract mods/mymod --out mymod_texts.tsv
ARSENAL lng merge mods/mymod mymod_texts_ru.tsv --out mymod_ru --dry-run
ARSENAL lng merge mods/mymod mymod_texts_ru.tsv --out mymod_ru
```

`extract` writes every key of your mod with its text into a tab-separated table that a spreadsheet opens, with an empty column for the translation. `merge` reads the filled table and writes translated copies of your `.lng` files into the `--out` folder, at the same paths; your mod is not written. It warns when a translation drops or reorders `%` placeholders or colour tags. Normally only files with a translated row are written; `--all` writes every file in the table. In the window, the Quick Guided Task "the game's texts or a translation" does both: it makes the table for you, and when you bring the filled table back it checks it (old character set, missing header row, rows whose source text no longer matches the mod) before it merges.

Only one language patch can be active for one mod: two patches hold the same file paths, so one replaces the other whole.

### In Gates of Hell

<!-- goh: GHLOC-01 GHLOC-03 GHLOC-05 GHLOC-06 GHLOC-07 GHLOC-10 GHLOC-11 GHLOC-25 -->

Gates of Hell has a real language choice, so a translation is a language folder, not a patch that replaces files.

- Put the translated texts in `localizations/<code>/interface/text/` as `.po` (or compiled `.mo`) files, with the same `msgctxt` keys as the default `.pot`. Keys you do not translate fall back to the default language.
- A translation for the code `en` must be `.pot` or `.lng`; `.po` files there are ignored.
- `ARSENAL lng extract` also reads Gates of Hell `.pot` and `.po` files under `localizations/<code>/interface/text/`. Its `--lang <code>` option keeps only that language's files. `lnglint` checks `.po` and `.pot` files too, also inside a mod's paks.
- The game's console command `dev_l10n_export_pot` writes every `.lng` below `/interface/text/` (or a folder you name) as `.pot` under `localizations/exported/`. Never give it an empty argument (`""`): the game crashes.

## 7. Checking your work

- `ARSENAL lnglint mods/mymod/localization` checks syntax: encoding and BOM, braces, unclosed tags, a stray `<`, strings that run past the line end, duplicate keys (also ones that differ only in case) and bad escapes. Glyph coverage is reported as information only.
- `ARSENAL loccover mods/mymod` checks that the keys the game will ask for actually exist: a missing card name, a squad card without its info key, a damage-report text that looks like a key but is not defined, and a mod file that replaces a whole vanilla file and drops its keys.
- The game version matters. The 64-bit build has its own text files with extra keys; select that build (`loccover --exe as64`) when you point the tool at the game so it can see those keys. The `--lang` option is accepted but does nothing, because the game loads one set.

See also: [Chapter 18: Testing and Logs](18-testing-and-logs.md) for reading `game.log`, and [Check a mod, fix it, read the log](p14-check-fix-read-log.md).

### In Gates of Hell

<!-- goh: GHLOC-02 GHLOC-12 -->

A missing text is not silent in Gates of Hell: search the log for `Missing text:` to list every key the game asked for and did not find. After a fix, `dev_l10n_reload` in the console loads the texts again without a restart.

## Gates of Hell: summary

The Gates of Hell notes in this book have not been tested in a running game. Check them in your own game before you depend on them.

| Section | Gates of Hell | In short |
|---|---|---|
| 1. Where text comes from | [differs](#in-gates-of-hell) | One folder per language, two layers, `localization.info`, missing keys logged |
| 2. The `.lng` syntax | [differs](#in-gates-of-hell-1) | Own texts are `.pot`/`.po`/`.mo` keyed by `msgctxt`; new `M()` tag; two effects swapped |
| 3. How the game chooses between files | [differs](#in-gates-of-hell-2) | Inside one file the first definition wins; the chosen language overrides single keys |
| 4. Key families | [differs](#in-gates-of-hell-3) | No squad keys on the info card, ammunition by kind, renamed tooltip and pause keys |
| 5. Step by step: adding texts for a new unit | [differs](#in-gates-of-hell-4) | Other folder; `dev_l10n_reload` |
| 6. Translating a mod | [differs](#in-gates-of-hell-5) | A language folder instead of a patch; `dev_l10n_export_pot` |
| 7. Checking your work | [differs](#in-gates-of-hell-6) | `Missing text:` lines in the log |

## Pitfalls

- Saving a `.lng` (or a string in a `.set` or `.def`) as cp1251 turns its non-ASCII letters into boxes, with no error in the log. Keep a mental label: UTF-8 strings, ASCII identifiers, CRLF everywhere, and old comment bytes left alone.
- A `.lng` file without a `{tags}` root stops the game at startup.
- Copying vanilla `desc.lng` into your mod "to edit one line" hides every other vanilla text if you later forget to keep the rest. Prefer a new `#mymod.lng`.
- A key in a `#` file that vanilla's `desc.lng` also has keeps the vanilla text.
- A missing text is silent. Always look at the card on screen.
- A translation that drops a `%` placeholder loses a number on screen without an error.
- An item name key must list the item's tags in the order they are written; the same words in another order give a different key.

**Next:** [Chapter 15: Interface and Icons](15-interface-and-icons.md)

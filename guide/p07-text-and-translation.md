# Add or change text and translate it

Every word the game shows comes from `.lng` files. Your mod's `localization/` folder is where the game looks for them. Each text has a key, a path such as `desc/entity/t34_0`, built from the file's name and the blocks around the text.

## You need

- A mod folder (see [Make a mod and see it in the game](p01-first-mod.md)). The `new` command already made a text file for it, named `#<your mod>.lng`.
- The key of the text, or the unit whose name you want to change.
- An editor that saves UTF-8. Keep Windows (CRLF) line endings.

## The quick way

In the Quick Guided Task row above the tabs, set "I want to" to **make** and choose **new texts or a translation**, or to **change** and choose **the game's texts or a translation**, then press Start. The task asks what to do, then takes the lines as `key = text`, one per row, or a translation table. Review lists every file before Write, and the task checks the mod after. See [Use the Quick Guided Task](p17-quick-guided-task.md). The steps below show each part by hand.

## Steps

1. **Change a unit's name.** On the Units page, pick your mod and the unit, choose Name in "Quick change", type the new name, press Preview, then Write. A new key goes into your mod's `#<mod>.lng`; a name the game's `desc.lng` already holds goes into a full copy of `desc.lng` in your mod, so the other names stay. The command way, for one key:

   ```
   ARSENAL lng-add mymod --file "#mymod.lng" --key desc/entity/my_t34 --text "T-34 Model 1942" --dry-run
   ARSENAL lng-add mymod --file "#mymod.lng" --key desc/entity/my_t34 --text "T-34 Model 1942"
   ```

   `lng-add` refuses a key that already exists unless you add `--force`, and warns when the game's own files define the same key.

2. **Write texts by hand.** Open the Editor page (tab IDE), open your mod's `.lng` file under `localization/`, and add lines in blocks. The Editor checks the file while you type and can also open text files inside your mod's paks. A file starts with [`{tags`](r09-interface-and-localization.md#tags), and the key comes from the blocks ([the `.lng` syntax](14-localization.md#2-the-lng-syntax)): in `desc.lng`, `{"entity" {"my_t34" "T-34 Model 1942"}}` is the key `desc/entity/my_t34`. In a file whose name starts with `#`, the file name is not part of the key. Press Save.

3. **Know which key to use.** All families are in [Key families](14-localization.md#4-key-families).
   - Vehicle or gun name: [`desc/entity/<def name>`](r09-interface-and-localization.md#descentitymodel).
   - Squad name: [`desc/squad/<name>(<army>)`](r09-interface-and-localization.md#descsquadnameside), for example `desc/squad/riflemans(usa)`.
   - Soldier name: [`desc/human/mp/<army>/<breed>`](r09-interface-and-localization.md#deschumanmpsidebreed).
   - Long tooltip behind the "i" button: [`info/entity/<name>`](r09-interface-and-localization.md#infoentityname) or [`info/squad/<name>`](r09-interface-and-localization.md#infosquadname). A squad card shows the button only when its `info/squad/` key exists.
   - Multiplayer map name: `mission/multi/<map folder>/name`.
   - Weapon and ammunition names: `desc/weapon/<tags>` and `desc/ammo/<tags>`, made from the item's tags.

4. **Format a text.** `\n` starts a new line, `\"` writes a quote. Colour with `<c(ffaf00)>` and go back with `<c(ffffff)>` or `</c>`. A literal `<` is written `<<`. Every tag is in [Text formatting tags](r09-interface-and-localization.md#text-formatting-tags) and [Colours and formatting tags](14-localization.md#colours-and-formatting-tags).

5. **Find missing names.** `ARSENAL loccover mymod` lists buy panel cards, squads and soldier types of your mod that have no name key, squads without a tooltip, and a mod `.lng` that replaces a whole game file. `ARSENAL lnglint mymod/localization` checks the files themselves: encoding, braces, strings, duplicate keys and colour tags.

6. **Translate.** The game loads one set of texts, the one for the language it is installed in, and every `.lng` your mod ships. To make your mod read in another language, give translators a table and build a translated copy from it:

   ```
   ARSENAL lng extract mymod --out mymod_texts.tsv
   ARSENAL lng merge mymod mymod_texts_ru.tsv --out mymod_ru --dry-run
   ARSENAL lng merge mymod mymod_texts_ru.tsv --out mymod_ru
   ```

   `extract` writes every key of the mod with its text in a tab-separated table that a spreadsheet opens; the translator fills the translation column. `merge` writes the translated files to a new folder at the same paths as your mod's own files; your mod is not written. It warns when a translation drops or reorders `%` values or colour tags. Ship that folder as a language patch that players put below your mod. More in [Translating a mod](14-localization.md#6-translating-a-mod).

7. **See it.** Text is read when mods are applied, so press Apply again in the game's mod list (no restart is needed), then hover the card in the buy panel.

## What can go wrong

- **All the game's names turn into keys.** A mod file with the same path as a game file, such as `localization/desc.lng`, replaces the game's file whole. Keys you left out show as raw keys. Put new keys in your own `#<mod>.lng`, or copy the whole game file before you change it.
- **Your new name does not show.** If your `#` file uses a key that the game's `desc.lng` also has, the game's file is read later and its text wins. `game.log` then shows `Localization key redefinition`. Change such a name in a copy of `desc.lng`.
- **A key shows instead of text.** A key no file defines is shown as written, with no error. Keys ignore capital letters, so `75mm_41M` and `75mm_41m` are the same key; a second definition of a key replaces the first.
- **Letters show as boxes or question marks.** `.lng` files must be UTF-8. A file in the old Windows Cyrillic encoding loads without an error but shows replacement marks; a UTF-16 file stops the game with "Please resave file in UTF8". Long dashes and curly quotes may show as `?`.
- **The rest of a text disappears.** A colour tag without its closing `>` swallows the rest of the text. One string must stay on one line.
- **Numbers in a text go missing.** Some texts carry `%` values the game fills in order. Keep every `%` value of the original, in the same order.
- **Only one language patch works at a time.** A language patch holds files at the same paths as your mod, so it replaces your mod's files whole. With two language patches active, the lower one in the Activated list wins.

How the game picks between files is in [How the game chooses between files](14-localization.md#3-how-the-game-chooses-between-files); more causes in [Troubleshooting: text is missing or shows as a key](21-troubleshooting.md#6-symptom-text-is-missing-or-shows-as-a-key).

## In Gates of Hell
<!-- goh: GHLOC-01 GHLOC-02 GHLOC-05 GHLOC-06 GHLOC-08 GHLOC-09 GHLOC-10 GHLOC-12 GHLOC-25 -->

The Gates of Hell notes in this book have not been tested in a running game. Check them in your own game before you depend on them.

- **Where texts go.** One folder per language: `localizations/<code>/interface/text/`, for example `localizations/default/interface/text/`. A mod's root `localization/` folder is not read. The default language reads `.pot` and then `.lng` files; the chosen language reads `.mo`, `.po` and `.lng`, and a key missing there comes from the default. `default` and `en` never read `.po` or `.mo`.
- **`.po` and `.pot` files.** The key is the entry's `msgctxt`; an entry without one, or marked `fuzzy`, gives no text, and an empty `msgstr` shows the `msgid`. Plural entries do not work.
- **`.lng` still works** inside that folder, with the same key rule as in Assault Squad 2.
- **Which text wins.** Between files the later one wins, with `Localization key redefinition` in `game.log`. Inside one file the first definition stays.
- **Missing keys are logged.** A key no file defines still shows as the key, and `game.log` gets `Missing text: [key]` once per key.
- **Console.** `dev_l10n_reload` reads the texts again without a restart. `dev_l10n_export_pot` turns every `.lng` below `/interface/text/` into a `.pot` under `localizations/exported/`.
- **In ARSENAL.** Under the GoH button the Editor page opens Gates of Hell text files too, but the text tasks of the Quick Guided Task are greyed out. `gen --target goh` writes its `text` step as a `.pot` under `localizations/default/interface/text/`. `ARSENAL lng extract mymod --out t.tsv --lang <code>` reads the `.pot` files of one language, and `ARSENAL lnglint` checks `.po` and `.pot` files as well as `.lng`.

More in [Localization](14-localization.md#gates-of-hell-summary).

## More

- Part II: [Localization](14-localization.md), [Where text comes from](14-localization.md#1-where-text-comes-from), [Interface and icons](15-interface-and-icons.md).
- Part III: [Interface and localization keys](r09-interface-and-localization.md), entries [`.lng` text files](r09-interface-and-localization.md#lng-text-files) and [Text keys](r09-interface-and-localization.md#text-keys).
- The window: [Editor](19-toolchain.md#ide-all-games).
- Next job: [Icons and interface](p08-icons-and-interface.md).

<!-- Author: Imperator_Aug (ARSENAL) -->

# mow-mod-text-ui: add or change one text (rename a unit)

When: "rename this tank", "give my new unit a name", "change this menu line", "add a description".
Words: `<mod>` = the user's mod folder (write only there), G = game install. MCP write tools preview unless `write: true`.

## Decide first: a new key, or a key the game already has
- NEW key (a unit, squad, weapon the mod added) → the mod's own `#<mod>.lng`. A `#` file drops its title from the key, so it can hold `desc/entity/x` and `info/squad/y` side by side (lim LOC-10, LOC-20 [V])
- key the GAME already defines (rename a vanilla unit) → a `#` file is NOT enough: the mod `#` file loads first, vanilla `desc.lng` loads later and wins (lim LOC-19 [V live]). The text must sit in a mod copy of that vanilla file, which replaces it whole (lim LOC-25, LOC-01). gen does this and says so (info `GEN_TEXT_VANILLA_FILE`); other mods' edits of that file are then shadowed. A mod `#` file against a vanilla `#` file: order is [T]
- never scaffold an empty `desc.lng` / `info.lng`: it wipes every vanilla name (lim LOC-18)

## Steps
1. find the key: MCP `mow_text_find` (`key` = key start, or `q` = shown words)
2. set it
   - unit name in one call: MCP `mow_unit_change` (`mod`, `id` as `mow_unit_find` shows it, `what: "name"`, `value`)
   - any key, new or vanilla: MCP `mow_mod_gen` (`mod`, `ops: [{op:"text", key:"desc/entity/<unit>", text:"..."}]`; or `items` = a list of `{key, text, file}`)
   - one NEW key: MCP `mow_text_set` (`mod`, `key`, `text`; `file` default `#<mod>.lng`, GoH `<mod>.pot`; `loc` = GoH language folder; `force: true` replaces a key the file already holds)
   CLI `node tools/lng-add/lng-add.js <mod> --file "#x.lng" --key k/path --text "t" [--game G] [--exe as64|mowas_2|goh] [--loc <code>] [--force] [--dry-run]`
     byte-preserving; refuses a duplicate key (LNG_KEY_EXISTS); WARN_LNG_KEY_SHADOWS_VANILLA when vanilla would win; LNG_FILE_REPLACES_VANILLA when `--file` is a vanilla path
   CLI spec: `node tools/gen/gen.js --sample rename-unit`, then `node tools/gen/gen.js spec.yaml --target as64|mowas2|goh --plan`
   GUI: Units page (name of a unit); Editor page (a file by hand; AS2 tabs only)
3. text rules: one string per line (lim LOC-06); `\n` = line break, `\"` = quote; close colour tags; keep `%` specs in the vanilla order (lim LOC-28)
4. lint: MCP `mow_mod_check` (`mod`, `only: "lnglint,loccover"`) · CLI `node tools/lnglint/lnglint.js <mod> --game G [--exe as64|mowas_2|mowas2|goh]`
5. restart the game or re-apply the mods: texts are read at load, loose files need no repack (lim LOC-16)

## Per game
| | as64 | mowas2 | goh |
|---|---|---|---|
| mod text file | `localization/#<mod>.lng` | same | `localizations/default/interface/text/<mod>.pot` (GHLOC-01, GHLOC-09) |
| a mod root `localization/` | read | read | never read |
| entry | `{"key part" "text"}`, nested | same | `msgctxt` = key; `.pot`: text in `msgid`, `msgstr ""`; `.po`: text in `msgstr` (GHLOC-06) |
| duplicate key | later wins (LOC-04) | same | across files later wins, in one file the first stays (GHLOC-08) |
| reload without restart | no | no | console `dev_l10n_reload` (GHLOC-12; not run in game) |

## Silent fails
- LOC-19 the new name does not show: the key also exists in vanilla `desc.lng`
- LOC-02 a typo in the key: no error, the raw key is shown
- LOC-03 `75mm_41M` and `75mm_41m` are one key
- LOC-28 a text the game fills with values: missing or reordered `%` specs drop values, no error
- LOC-07 a format tag without `>` swallows the rest of the text

## Verify
- static: `mow_text_find` with `mod` answers the new text from the mod's file
- game.log (AS2): no `Localization key redefinition` line naming the key
- in game: the screen that shows it (buy panel card, tooltip, info window) → skill `mow-mod-test`

Depth: · guide p07-text-and-translation · tools/gen/README.md (text op)

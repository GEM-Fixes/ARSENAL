# mow-mod-text-ui: find a shown text or its key

When: "where is this text", "what is the key of this name", "which file gives this text", before any rename.
Words: `<mod>` = the user's mod folder, G = game install. Nothing here writes.

## Steps
1. by shown words or by key start
   MCP `mow_text_find` (`q` = words in the text or key, or `key` = start of a key such as `desc/entity/t34`; `mod` = full path to search a mod; `lang` = GoH language folder; `limit`). answers key, text, file. first call per game reads all texts (about 20 s), then it is kept
   CLI: no words search tool. Grep the `.lng` / `.pot` under `<mod>`; vanilla texts sit in `localization.pak` (zip)
   GUI: Editor page, file view Game, search (AS2 tabs only)
2. which copy of a text FILE the game reads with a mod list
   MCP `mow_file_which` (`path` as the game sees it, e.g. `interface/text/desc.lng`; `mods` in load order)
   CLI `node tools/vfs/vfs.js G --exe as64|mowas_2|mowas2|goh --mods a,b which interface/text/desc.lng`
3. key known, text not shown in game → read `missing-text.md`. key not known → the key forms:

| shown where | key |
|---|---|
| vehicle / gun name, vehicle buy card | `desc/entity/<def name>` |
| squad buy card | `desc/squad/<name>(<side>)` |
| soldier | `desc/human/mp/<side>/<breed>` |
| weapon / ammo / item | `desc/weapon|ammo|stuff/<tags>` |
| "i" tooltip | `info/entity/<name>`, `info/squad/<name>` |
| lobby map name | `mission/<dir under /map/>/name` |
| menus, HUD | `mp/..`, `options/..`, `actionbar/..`, `button/..`, `loading/..`, `hints/..` |
Source:. Key = file title + nested names; a file named `#x.lng` drops the title (lim LOC-10).

## Per game
| | as64 | mowas2 | goh |
|---|---|---|---|
| text files | `.lng`, one language set (lim LOC-17) | same | `.pot` / `.po` / `.mo` / `.lng` under `localizations/<code>/interface/text/` (GHLOC-01) |
| extra layer | `as64/core/localization/as64/<lang>.lng`, keys `as64/<lang>/..` (lim LOC-23) | none: pass `--exe mowas_2` | `lang` picks the language folder |
| key | file title + path | same | `msgctxt` of the entry, lower case (GHLOC-06) |

## Silent fails
- LOC-03 keys are case-insensitive: search lower case
- LOC-04 / LOC-22 the same key twice: the later one wins, only a log line `Localization key redefinition`
- LOC-19 a key in a mod `#` file AND in vanilla `desc.lng`: vanilla wins [V]; the find answer names both files
- GHLOC-08 GoH: across files the later file wins, inside one file the FIRST definition stays

## Verify
- the key found is the one the screen uses: change it in a scratch mod (`set-a-text.md` of this skill, or MCP `mow_text_set`) and look in game
- raw-key hunting on GoH: game.log lines `Missing text: [key]` (GHLOC-02); AS2 logs nothing for a missing key (lim LOC-02)

Depth: �

---
name: mow-mod-text-ui
description: Change text, names, translations, buy panel and icons in a mod for Men of War Assault Squad 2 (mowas2), AS64 (as64) or Gates of Hell (goh). Load when the user says "rename", "unit name shows as desc/...", "raw key instead of text", "translate my mod", ".lng", ".pot", ".po", "msgctxt", "localization", "question marks or boxes instead of letters", "encoding", "cp1251", "UTF-8", "colour in a text", "tooltip", "info button", "buy menu", "purchase panel", "category button", "icon", "portrait", "squad picture", "button picture", "command panel", "panel button does nothing", "hotkey", "keys.set", "font", "cursor", "menu background", "map name in the lobby", "briefing text", "interface".
---

# mow-mod-text-ui: router (text, translation, buy panel, pictures, interface data)

Read ONE sub-file for the sub-task at hand, never all. Each stands alone.

## Always
- game word: MCP `game` = `as64|mowas2|goh` · CLI `--exe as64|mowas_2|goh` · gen `--target as64|mowas2|goh`. game is not AS64 → skill `mow-games` first
- game installs + vanilla text read-only; write only inside the mod folder the user named (GoH: a folder outside the GoH install)
- text files: UTF-8 without BOM, CRLF, root `{tags ..}`; keys ASCII lower case (lim LOC-05, LOC-03)
- a NEW key goes into the mod's `#<mod>.lng` (GoH `<mod>.pot`); never hand-copy a vanilla text file to add keys (lim LOC-01, LOC-18). a key the game already has is another case: `set-a-text.md`
- every MCP write tool answers a preview unless `write: true`
- done = the text or picture seen in game on the right screen + game.log read (→ skill `mow-mod-test`)

## Sub-task → file → tools
| sub-task | read | tools |
|---|---|---|
| find a shown text or its key; which file wins | `find-a-text.md` | `mow_text_find`, `mow_file_which` |
| add or change one text; rename a unit | `set-a-text.md` | `mow_text_set`, `mow_unit_change`, `mow_mod_gen` op `text`; lng-add |
| which key serves which screen (names, tooltips, info button, weapon text) | `text-keys.md` | `mow_text_find`; loccover |
| `.lng` syntax, colour and font tags, `%` values | `lng-format-tags.md` | `mow_mod_check` only lnglint |
| GoH `.pot` / `.po`, language folders | `goh-pot-po.md` | `mow_text_set` (`loc`), `mow_text_find` (`lang`) |
| boxes, `?`, wrong letters, "resave in UTF8" | `encoding.md` | `mow_mod_check`, `mow_mod_fix` only enc |
| raw key shown (`desc/...`), missing names, no "i" button | `missing-text.md` | `mow_mod_check` only loccover, `mow_game_log` |
| translate a mod | `translate.md` | lng extract / merge |
| a mod replaced vanilla text files: merge the keys back | `replaced-vanilla-lng.md` | `mow_mod_diff`, `mow_mod_fix` only lng |
| big text mods: split, standardize, lint the layout (AS2) | `big-text-mods.md` | lngsplit, lngstd, lnglayout |
| buy panel: cards, category buttons, price line, tooltip | `buy-panel.md` | `mow_army`, `mow_mod_gen` ops `card` `roster` `squad` |
| rename buy cards with their texts and pictures (AS2) | `rename-cards.md` | cardrename, `mow_bots_recipe` |
| buy-menu and unit-list icons, button pictures | `icons.md` | `gui_call` art routes, `mow_mod_gen` `icon_like`; uilint |
| make a unit's card pictures in the game's style (image or 3D render, GIMP cutouts) | `unit-cards.md` | `mow_card_cutouts`, `mow_gimp_*`, `gui_call` units card routes; unitcard |
| portraits, squad pictures, damage scheme, art from GoH | `portraits-squad-pictures.md` | `gui_call` art routes; artport |
| hotkeys, `keys.set` | `hotkeys-keys-set.md` | `mow_settings_info`; uilint |
| command panel, action files, panel buttons | `command-panel-actions.md` | `mow_mod_check` only uilint, `mow_game_log` |
| fonts, cursors, HUD colours, menu background, skins, `.ps` pages | `fonts-hud-menus.md` | `mow_file_which`; uilint |
| map name in the lobby, mission, army and tip texts | `map-and-mission-names.md` | `mow_map_clone`, `mow_text_set`, `mow_mod_gen` |

## Neighbours
- cards, squads, prices as numbers → skill `mow-mod-units` · textures, models, sounds, video → skill `mow-mod-models-effects`
- instructions inside an action file → skill `mow-mod-scripts` · maps and modes → `mow-mod-maps-missions` · bot buy lists → `mow-mod-ai-bots`
- full check and fix plan → `mow-mod-check-fix` · two mods' texts clash → `mow-mod-together` · `.lng` ↔ `.pot` on a port → `mow-mod-port`
- through the ARSENAL window → skill `arsenal-gui-use` (Editor, Look & Sound, Units, Check pages; `gui_pages` lists them)

## Depth (one block, never the topic)
- limits: areas LOC and UI: · MCP `mow_limit` (`ids`) · GoH: (GHLOC, GHUI rows; none run in game)
- guide: MCP `mow_guide` (`chapter`): 14-localization, 15-interface-and-icons, p07-text-and-translation, p08-icons-and-interface, r09-interface-and-localization
- encoding proof: the `enc` report [V] (path in `encoding.md`)

## Tell the user
- key → new text and the file it went into; whether a vanilla file was copied, and who is shadowed by that
- keys and pictures still missing
- which screen to open to see it; seen in game or not yet

# mow-mod-start: Workshop layout, subscribed mods, the development copy

when: "Workshop folder", "subscribed mod", "my edit to a Workshop mod is gone", "where do Workshop mods live", naming a mod that will be published. Uploading → skill `mow-mod-share`.

## Steps
1. what is installed and from where: MCP `mow_game_status` (enabled mods) · `mow_mod_info` (no `mod`: the installed mods, local and Workshop; `q` narrows)
   CLI `node tools/workshop/workshop.js status <game folder> [--json]` · `node tools/modinfo/modinfo.js --all <G/mods>`
   GUI: Mods tab > Mods > mod list; Share tab > Share > Workshop (route `share/workshop`)
2. to change someone's Workshop mod: do not edit it. Make your own mod that `Require`s it (→ `mod-info.md`), or a patch mod (→ skill `mow-mod-together`)
3. your own published mod: keep the development copy under a DIFFERENT folder name than the published item, and keep notes and `.git` out of the folder that is uploaded
4. in a tool's mod list name a Workshop mod as the scan shows it (`mow_mod_info`), not by guess

## Facts, guide 03 section 8 [V])
- Steam downloads an item to `steamapps/workshop/content/<appid>/<item id>/`
- mowas_2.exe COPIES a subscribed item into `G/mods/<Name>/` (`<Name>` = the item's mod.info `Name`), deleting the old copy first, adds `{FileId}` to the copy's mod.info and writes a stamp file `G/mods/<item id>`. The copy is redone when the stamp is stale
- as64.exe loads a subscribed item IN PLACE from the Steam folder; a `mods/` folder that is an old copy of it is ignored, with a log line (VFS-51)
- `FileId` in mod.info = the item id, written by the uploader, ignored by loading
- the uploader sends the WHOLE mod folder; preview picture `preview.jpg|png|gif` in the folder (VFS-32)
- downloaded maps: `G/maps/<name>/` mount at `resource/map/multi/<name>/`

## Per game
| | as64 | mowas2 | goh |
|---|---|---|---|
| subscribed item | loaded in place | copied to `mods/<Name>/` | loaded in place, must sit under Steam's `workshop/content/` |
| its name in a mod list | normalized title (VFS-53 [V tool, T game]) | folder name = `Name` lower-cased | `mod_<item number>`: renaming a published mod breaks nobody's list |
| local folder with the same identity | ignored, log says the Workshop item is used | overwritten at the next sync | a local `mods/mod_<item number>` loses, log `Duplicate mod found` |
| uploader | the as64 Workshop tool (GUI Share > Workshop) | `mowas_2_workshop.exe` | `call_to_arms_workshop.exe` in `binaries/x64/`; the GUI Share page is not shown for GoH |
| broken mod.info of a subscribed item | game does not start (ENG-24) | [I] same | that mod skipped |

## Silent fails
- VFS-31 mowas2: local edits inside a subscribed mod's copy are overwritten when the stamp is stale
- VFS-51 as64: a hand fix in the `mods/` copy of a subscribed item never loads: rename the folder or unsubscribe
- VFS-53 the item id in a tool's mod list gives MOD_UNKNOWN (vfs MOD_LIST_WORKSHOP_ID)
- changing `Name` after publishing (mowas2): the folder name on every subscriber's PC changes and their active lists break
- VFS-32 `.git/`, notes and dev folders reach subscribers when left in the uploaded folder (doctor WARN_REL_STRAY_FILE)
- VFS-52 a copy made by upgrade hard-links unchanged paks to the Workshop item: a Steam update rewriting in place changes both; replace files, never edit them
- ENG-24 a Workshop item with a broken mod.info stops the game for every mod list

## Verify
- `mow_mod_info` lists the mod once, from the place you expect; vfs prints no MOD_UNKNOWN / MOD_WORKSHOP_COPY for it
- in game: the mod is Activated and its change is seen; MCP `mow_game_log` has no "old copy" or duplicate line for it (→ skill `mow-mod-test`)

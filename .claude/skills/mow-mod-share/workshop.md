# mow-mod-share: Steam Workshop upload

when: "upload to the Workshop", "update my workshop item", "where is the uploader", "my upload contains junk".
G = AS2 install, H = GoH install. The uploader is a separate program the user runs and signs in to. Claude prepares the folder and stops: no upload, no login, no account details.

## Steps
1. release check and a clean release folder first (`release-check.md`, `pack.md`): paks or `resource/`, `mod.info`, preview picture, nothing else
2. is the uploader there: `node tools/workshop/workshop.js status <game folder> [--json]` (is `workshop_gui.exe` beside the game programs; AS2 / as64: the game folder, GoH: `binaries/x64`)
3. put it there, ONLY on the user's explicit yes (it writes into the game folder): `node tools/workshop/workshop.js install <game folder> --dry` first, then without `--dry`. It never overwrites an existing `steam_api64.dll` or `steam_appid.txt`
4. start it for the user: `node tools/workshop/workshop.js start <game folder> [--dry]`; they sign in, point it at the release folder, fill title / description / tags, press upload
5. after the first upload the uploader writes `FileId` into mod.info: copy that line back into the working folder so the next upload updates the same item
6. GUI: Share tab > `share` page, Workshop step (`share/workshop`; the `share/uploader` route is blocked for Claude on purpose)

## Facts
- `FileId` in mod.info = the Workshop item id; loading ignores it
- subscribers get the whole uploaded folder into the Steam workshop content folder; the game mounts it like a local mod
- a mod that Requires another: say so in the description, Steam does not enforce the order

## Per game
- as64: uploads go under the MoW:AS2 app id [I]; say in the description that the mod needs the as64 build, and whether it is Classic or Enhanced
- mowas2: uploader beside `mowas_2.exe`
- goh: uploader in `binaries/x64`; the range must hold the exe version or subscribers see "not up to date" (PORT-46)

## Silently fails
- VFS-32 the uploader sends the WHOLE folder: `.git`, notes, backups, scratch go public unless the release folder is clean (the game's mount skips `.git`, the upload does not: VFS-07)
- ENG-24 an unescaped `"` in mod.info Desc stops the game for every subscriber
- a lost `FileId` = a second item instead of an update
- game assets of another game in the upload: held back by the packer's guard; do not add them by hand
- personal paths or names in mod.info / readme: read both before the upload

## Verify
- show the user the exact file list and total size that would go out, and the mod.info text; after their upload, a subscribe-and-start on a clean profile is the real test (theirs to do)

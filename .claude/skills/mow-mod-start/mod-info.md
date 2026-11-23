# mow-mod-start: write or repair mod.info, its keys

when: "mod.info", "what goes in mod.info", "Require", a finding from modinfo (UNKNOWN_KEY, MODINFO_PARSE, DELETE_PREFIX, VER_*).

## Steps
1. read: MCP `mow_mod_info` (`mod` = folder; no `mod` = the installed mods, `q` narrows): name, range, required mods, what it holds, the mod.info check for `game`
   CLI `node tools/modinfo/modinfo.js <mod dir> [--game G] [--game-version VER] [--exe as64|mowas_2|mowas2|goh] [--format F] [-q]`
   GUI: Mods tab > Mods > mod list (routes `GET /api/mods`, `/api/mod?dir=`)
2. change it: a new mod gets it from `mow_mod_new`; an old mod for another target → MCP `mow_mod_upgrade` (a converted COPY). A hand edit of one line is fine: keep ASCII or UTF-8 without BOM, CRLF
3. check every mod.info in the folder (one bad file stops the game): `node tools/modinfo/modinfo.js --all <G/mods>`

## Form
```
{mod
	{Name "My Mod"}
	{Desc "one line\nsecond line"}
	{MinGameVersion "3.301"}
	{Require "other_mod_folder"}
}
```
| key | value | does |
|---|---|---|
| `Name` | string | title shown in the list. mowas_2 also names the Workshop copy's folder after it |
| `Desc` | string | description; `\n` = new line; `<c(rrggbb)>..</c>` colours it |
| `MinGameVersion` `MaxGameVersion` | digits and dots | the version gate → `version-range.md` |
| `Require` | `"folder"` or `"folder:ver"`, repeatable | that mod must be installed AND in the active list; only the name part is compared; puts this mod after it |
| `Delete` | path, repeatable | removes a file or prefix from the index before this mod mounts → `patches-delete.md` |
| `FileId` | number string | Workshop item id, written by the uploader; loading ignores it |
- root block `{mod ..}` or `{Mod ..}`; keys case-insensitive; `;` starts a comment
- each key = exactly one quoted string then `}`; `\"` inside is fine, a bare `"` is not (VFS-49 [V])

## Per game
| | as64 | mowas2 | goh |
|---|---|---|---|
| extra keys | none | none | `Tags` (one string of words; `develop` lifts the version check, GHVFS-02) and `Priority` (whole number, default 1, orders mods that do not require each other, GHVFS-36) [V] |
| broken file | the game does not start, for any mod list (ENG-24 [V]) | [I] same reader | that mod is skipped with a log warning |
| `Require "as64+"` | allowed, names the built-in mod | looked up in `mods/` like any folder: missing | missing; a folder of that name is skipped |
| bounds | modern: Min only | both needed | each optional, set both |
| key case in the game's own template | `{Mod {Name` | same | lower case (`{mod {name {minGameVersion`) |

## Silent fails
- VFS-20 unknown key or a parse slip: skipped, no message (modinfo UNKNOWN_KEY)
- VFS-49 / ENG-24 a stray `"` in `Desc`: no start at all, even with the mod off (modinfo MODINFO_PARSE)
- VFS-17 `Require` of a mod that is not in the active list: this mod is skipped with a dependency warning
- VFS-50 `Require "as64"`, `"legacy"` are not folders: counts as missing (modinfo REQ_MISSING)
- VFS-16 a `Require` cycle drops the WHOLE mod list (`Dependency test error!`)
- VFS-21 `Delete "set/x"` without `resource/` matches nothing (modinfo DELETE_PREFIX)
- saved as UTF-16: the file is broken (guide 03 pitfalls); AS2 ignores `Tags` and `Priority`, so a GoH mod loads in another order there

## Verify
- modinfo prints no finding for the target exe; `--all` on the mods folder is clean
- in game: the title and description show in Options > Mods; game.log has no `was disabled` line (→ skill `mow-mod-test`)

# mow-mod-start: make the empty mod folder

when: "make a mod", "new mod folder", "start a mod for X". Ask for the folder path and the display name when not given.

## Steps
1. where: AS2 usual home `G/mods/<name>`; GoH a folder OUTSIDE the GoH install (tools refuse writes inside it). Folder name: lower case, letters, digits, `_` (safe on all three games)
2. MCP `mow_mod_new` (`dir`, `name`, `deps` = folders it requires, `description`, `game`): answers the plan; again with `write: true` to make it. `dir` must be inside `ARSENAL_WRITE_ROOTS`
   CLI `node tools/newmod/newmod.js <new mod dir> --name "<title>" [--target as64|mowas2|goh] [--game-version V] [--game G] [--deps a,b] [--desc "..."] [--dry-run] [-q]`
   GUI: Mods tab > Mods > New blank mod (route `run new`); not offered on the GoH tab, use the CLI there
3. what it writes: `mod.info` (UTF-8, CRLF), `resource/{entity,set,interface}`, an empty UTF-8 text file `localization/#<slug>.lng`, `.gitignore`, `readme.txt`; then it checks itself with modinfo + lnglint (must be 0 findings)
4. read it back: MCP `mow_mod_info` (`mod`) · CLI `node tools/modinfo/modinfo.js <mod> [--exe as64|mowas_2|mowas2|goh]`
5. put the first content in (→ `first-change.md`), switch it on (→ `enable-mod.md`), run (→ skill `mow-mod-test`)

## Why the text file starts with `#`
- a mod `desc.lng` at the vanilla path replaces the vanilla file whole: an empty one wipes every unit name to raw keys (LOC-01, LOC-18 [V])
- a `.lng` whose name starts with `#` drops the file title from the key, so `#mymod.lng` can hold `desc/entity/x` and adds to vanilla (LOC-10)

## Per game
| | as64 | mowas2 | goh |
|---|---|---|---|
| `--target` | `as64` (default): MinGameVersion 3.301, no Max = Enhanced mod | `mowas2`: the 3.262 range, both bounds | `goh`: both bounds = the version of the GoH exe (`--game H` reads it) |
| text file | `localization/#<slug>.lng` | same | `localizations/default/interface/text/<slug>.pot` (gettext header only; GoH never reads a mod's root `localization/`, GHVFS-04) |
| folder name | free within VFS-05 | same | refused when GoH would skip it: a space, a byte >= 0x80 or one of `<>+()[]{}!@#$%^&*-=;:\|'"` (GHVFS-27): `my_mod` yes, `my-mod` no |
| self-check | modinfo, lnglint | modinfo `--exe mowas_2` | modinfo `--goh` at the written version |
| needs | Enhanced mode (`as64+` listed) → `classic-enhanced.md` | nothing | switch on in GoH's own mod list |

## Silent fails
- VFS-26 only `resource.pak`, `resource/`, `N.pat`, `localization.pak`, `localization/` mount from a mod root: a file beside them is never read
- VFS-20 a typo in a mod.info key does nothing and says nothing
- VFS-32 the Workshop uploader sends the whole folder: notes and `.git` go to subscribers unless kept out (hence the `.gitignore`; mount skips it, upload does not [I])
- VFS-06 a loose `.txt` in the mod is never indexed (readme.txt is safe there)
- `--lang` is accepted for information only: the engine has one `.lng` set, no per-language files (LOC-17)

## Verify
- newmod prints 0 findings; `mow_mod_info` shows the name, the range and the target game
- in game: the mod is in Options > Mods; after Apply the log has no `was disabled` line for it (→ `mod-not-showing.md`)
- an empty mod changes nothing: seeing it in the list is the whole proof at this step

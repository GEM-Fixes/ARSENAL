# mow-mod-check-fix: fixes the fixers can not do

when: the fix plan says "can not fix", repoint found 0 or several candidates, a value must be chosen by a person, or a finding should be accepted, not fixed.

## Steps
1. your own mod, one key: MCP `mow_mod_gen` (`mod`, `ops` = a list of gen ops, e.g. one `set` op with `entity` or `file`, `path`, `value`; preview unless `write: true`; one refused op stops the call). op fields: `node tools/gen/gen.js --schema`
   unit values (price, armour, name ..): MCP `mow_unit_change` → skill `mow-mod-units`; a text key: MCP `mow_text_set` → skill `mow-mod-text-ui`
2. someone else's mod: the edit goes into the patch mod, not into the mod: `node tools/fix/fix.js <mod> apply --out <patch mod> --set file:path=value` (repeat `--set`; gated like every fixer)
3. CLI one key in one file, copy-as-override into a folder you name:
   `node tools/patch-entity/patch-entity.js <mod or patch> --game G [--mods d] (--entity n|--file key) --set p=v|--add p=v|--del p|--set-file p=<file>|--add-file p=<file> [--exe as64|mowas_2|mowas2|goh] [--dry-run]`
   copies the file as an override, splices the value, refuses when sdllint / keylint report a new error, prints the diff. `--set-file` reads the value from a file (for values that start with `/` under Git Bash)
4. GUI: Editor tab opens the file at the line; Units tab for unit values
5. by hand in an editor: only when no tool reaches the place. keep CRLF, UTF-8 strings, ASCII identifiers, the cp1251 comment bytes; when the path is new to the mod, start from the WHOLE vanilla file
6. accept, do not fix: `.lintrc` JSON beside the mod `{"ignore":[{"code":"X","path":"..","line":N,"reason":"why"}]}` (ask the user first)
7. re-check: MCP `mow_mod_check` (`mod`, `with` = patch) · `node tools/check/check.js <mod> [--with <patch>]`

## Common hand cases
| finding | hand fix |
|---|---|
| missing file with several same-name candidates | pick the right one with the user; `--set` the path, or copy the file into the patch |
| unknown weapon / stuff name | find the real name: MCP `mow_weapon_find` (`q`) / `mow_entity_info` (`names`) |
| undefined macro with no vanilla source | find which mod or include defined it (Grep the name in the mod and its required mods); add the include or the define |
| unknown key | take the did-you-mean, or drop the line when the key was never read |
| two mods both replace one file | not a hand edit: → skill `mow-mod-together` |

## Per game
| as64 | mowas2 | goh |
|---|---|---|
| `--exe as64` | `--exe mowas_2` (file view without as64/core) | `--exe goh`; a write inside the GoH install is refused (writeguard line, exit 2): patch folder outside H |

## Silent fails
- VFS-01 the edit makes a full-file override (PATCH_FULL_COPY): everything else in that file is now frozen at today's vanilla
- VFS-41 other mods' edits to that file vanish when the patch loads after them
- SDL-33 a key written in the wrong case is accepted by the editor and ignored by the game
- PORT-15 an editor that saves cp1251 or changes line ends breaks strings with no error
- DMG-06 / GPL-04 an armour `{thickness}` edit does nothing where the armour macro sets that side

## Verify
- patch-entity printed the diff and no new lint code; check with the patch is clean for that file
- in game: the edited thing behaves as set (→ skill `mow-mod-test`)

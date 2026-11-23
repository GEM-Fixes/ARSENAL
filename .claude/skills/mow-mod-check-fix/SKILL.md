---
name: mow-mod-check-fix
description: Check a mod for errors and fix them, for Men of War Assault Squad 2 (mowas2), AS64 (as64) or Gates of Hell (goh). Load when the user says "check my mod", "lint", "validate", "why does my mod crash", "find errors", "fix my mod", "missing file", "broken reference", "unexpected token", "unknown key", "what does this finding mean", "ignore this warning", "old mod to 64-bit", "upgrade a classic mod", "make this mod work on AS64", "Classic or Enhanced", "what does this mod change", "patch mod", "ready to release".
---

# mow-mod-check-fix: router (read ONE sub-file, each stands alone)

game word: MCP `game` = `as64|mowas2|goh` · check `--exe as64,mowas2,goh` · fix `--target as64|classic|mowas2|goh` · upgrade `--to as64|mowas2|goh`. G = AS2 install (as64 + mowas2 share it), H = GoH install, `<mod>` = the mod to check.

## Always
- the checked mod is never written: fixes go into a NEW patch folder the user names; undo = delete that folder
- game installs + vanilla data read-only; no patch or copy folder inside an install (GoH: outside H)
- written text: CRLF, UTF-8 strings, ASCII identifiers; cp1251 comment bytes kept
- a clean check is static: say "loads on paper", never "works". done = a game run + game.log read (→ skill `mow-mod-test`)
- crash class first, then silent, then review, then cosmetic. a code or row id: MCP `mow_limit` (`ids`) � / `-k CODE`
- node only; never `tools/test-all.sh` for mod work

## Sub-task → file → tools
| sub-task | read | tools (MCP · CLI) |
|---|---|---|
| check a mod in one pass, quick or full | one-pass-check.md | `mow_mod_check` · check |
| will it load: REFUSED / LIKELY_CRASH / LOADS_STATIC | read-the-verdict.md | `mow_mod_check` · wouldload |
| what a finding means, classes, orphans, `.lintrc` | reading-findings.md | `mow_limit`, `mow_lookup` · q |
| mod.info: range, Require, Delete, startup crash | mod-info-check.md | `mow_mod_info` · modinfo |
| syntax: "unexpected token", braces, `#`, BOM | lint-syntax.md | `mow_mod_check` `only` · sdllint |
| unknown key, wrong value type, def bones | lint-keys.md | `mow_mod_check` `only` · keylint, defcheck |
| missing file, unknown weapon/stuff, bad mesh header | lint-references.md | `mow_mod_check` `only`, `mow_file_which` · refcheck, binhdr, expcheck |
| text: encoding, raw keys, dropped vanilla keys | lint-text.md | `mow_mod_check` `only` · lnglint, loccover |
| maps, missions, game modes, bot lists | lint-maps-missions-bots.md | `mow_mod_check` `only` · milint |
| interface data and interaction scripts | lint-interface-interaction.md | `mow_mod_check` `only` · uilint, ialint |
| soldiers, chassis, effects and sound, buildings | lint-humans-movement-fx-structures.md | `mow_mod_check` `only` · humlint, movlint, fxlint, strlint |
| every linter with a table; release checklist | doctor-release-check.md | `mow_mod_check` `full` · doctor |
| what the mod changes against the game | what-a-mod-changes.md | `mow_mod_diff`, `mow_file_which` · overdiff |
| plan the automatic fixes, fixer list | fix-plan.md | `mow_mod_fix` · fix plan |
| write the patch mod and re-check with it | patch-mod-apply-recheck.md | `mow_mod_fix` `write`, `mow_mod_check` `with` · fix apply, check --with |
| fixes the fixers can not do | hand-edits.md | `mow_mod_gen` · fix --set, patch-entity |
| old 32-bit era mod → AS64, Classic or Enhanced | upgrade-old-mod.md | `mow_port_plan`, `mow_mod_upgrade` · upgrade, modmove |

## Not here
- run it and read game.log, crash dumps → `mow-mod-test` · two mods clash → `mow-mod-together` · GoH <-> AS2 unit or map port → `mow-mod-port`
- pack for release → `mow-mod-share` · bots do not buy → `mow-mod-ai-bots` · text work → `mow-mod-text-ui`
- model, texture, effect and sound files → see skill mow-mod-models-effects · script logic → see skill mow-mod-scripts · the RobZ mod → see skill mow-robz

## Depth
- guide (MCP `mow_guide` `chapter`): 18-testing-and-logs, 21-troubleshooting, p13-old-mod-to-64-bit, p14-check-fix-read-log
- a tool's full line: Grep `^name ` in tools/index (groups lint, front) · MCP `mow_tools` (`find`)

## Tell the user
- verdict per game in plain words, counts by class, the top crash-class findings with file:line and what each means
- what the fix plan changes, where the patch folder is, how to undo (delete it), what it could not fix
- that the result is static until the game ran it; next step = test run

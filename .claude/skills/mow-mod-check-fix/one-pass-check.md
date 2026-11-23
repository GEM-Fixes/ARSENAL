# mow-mod-check-fix: check a mod in one pass

when: "check my mod", "why does it crash", before a first run, after any edit, before a release.
G = AS2 install, H = GoH install, `<mod>` = mod folder (anywhere on disk). Reads only; the game is not run.

## Steps
1. MCP `mow_mod_check` (`mod` = full path, `game`). default = quick check (under a minute on a small mod); `full: true` = every linter (minutes on a big mod); `only` = linter names (`sdllint,refcheck,lnglint` ..); `with` = a patch mod checked on top; `limit` = rows
   answer: verdict per game + the worst finding kinds with one example each
2. CLI `node tools/check/check.js <mod, anywhere> [--with <patch>] [--only tool,tool] [--fast] [-j n] [--locs N] [--timing] [--pass-limit sec] [--exe as64,mowas2,goh] [--target T] [--game G] [--goh H] [--json f] [--plain [--raw]]`
   - `--fast`: verdict + cheap linters, one SKIPPED line per tool left out; the preflight warnings are not run
   - no time limit by default: a big mod runs as long as it needs. `--pass-limit sec` stops one verdict pass; a stopped tool is named as a timeout
   - `--plain`: plain words, no codes (line 1 = overall result for the target build, then one line per finding kind); `--raw` adds the full report
   - `--json f` always holds `overall {target, verdict: ok|crash|refused|unfinished, crash, silent, text}`
   - exit: 0 = LOADS_STATIC, 1 = LIKELY_CRASH or REFUSED, 2 = usage, a tool failed, no verdict or UNKNOWN
3. GUI: Mods tab > Check & Fix (`arsenal-gui` `gui_pages` finds it, `gui_open` gives the link)
4. read the report: verdict per exe first, then findings sorted crash / silent / review / cosmetic. the report states how many files and paks were read: 0 read = wrong folder
5. work crash class first. a code: MCP `mow_limit` (`words` = the code) �
6. fix plan next: MCP `mow_mod_fix` (preview) · `node tools/fix/fix.js <mod> plan`

## Which game is the target
check picks, in this order: `--target`; the one `--exe`; goh (mod in `<H>/mods`, or every mod.info bound "any" or below 2); mowas2 (MaxGameVersion < 3.3); else as64. The other builds print as info. The linters run for the target game.

## What runs
- verdict: wouldload (sdllint + refcheck per exe)
- doctor: sdllint keylint refcheck modinfo lnglint loccover milint uilint ialint binhdr humlint movlint fxlint strlint expcheck (GoH skips uilint and binhdr)
- preflight (not with `--fast`), review class: PREFLIGHT_SPAWN_NO_ENTITY, PREFLIGHT_PATCH_UNMOUNTED, PREFLIGHT_WEAPON_FILLED_NO_FILLING, PREFLIGHT_STEM_TWO_CLASSES

## Per game
| | as64 | mowas2 | goh |
|---|---|---|---|
| view | AS2 install + as64/core; Enhanced mods beside built-in `as64+` | same install without as64/core and `as64+` (`--exe mowas2`) | `--exe goh --goh H` |
| chosen by itself when | default | Max < 3.3 | mod under `<H>/mods` or bounds below 2 |
| notes | - | - | `--fast` reads a mod outside `<H>/mods` directly (NOTE FAST_DIRECT, no reach gate); HUM rules are [I] |

## Silent fails
- ENG-24 one bad mod.info anywhere in mods/ or Workshop stops the game for every mod, also with the mod off: check sees only the mod it is given → `node tools/modinfo/modinfo.js --all <mods dir>`
- VFS-48 + ENG-26 Classic/Enhanced mismatch of a listed mod = startup crash; it is not a lint line in the mod's files
- VFS-26 files in the mod root other than `resource.pak` `resource/` `N.pat` `localization.pak` `localization/` are ignored (MOD_ROOT_IGNORED)
- orphan crash findings (a file nothing reaches) are listed apart and are not in the verdict: do not chase them first

## Verify
- same command again after a fix: the code is gone and no new code came
- LOADS_STATIC is static only: run the mod and read game.log (→ skill `mow-mod-test`; MCP `mow_game_log`)

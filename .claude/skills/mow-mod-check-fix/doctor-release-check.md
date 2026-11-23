# mow-mod-check-fix: every linter with a table, and the release checklist (doctor)

when: "run everything", a per-linter count table is wanted, a report file for someone else, "is it ready to release".

## Steps
1. MCP `mow_mod_check` (`mod`, `full: true`): every linter, minutes on a big mod. pack checks before sharing: MCP `mow_mod_pack` (`mod`; preview) → skill `mow-mod-share`
2. CLI `node tools/doctor/doctor.js <mod folder> [--game dir] [--exe as64|mowas_2|mowas2|goh] [--goh dir] [--cache-dir dir] [--release] [--only t,..] [--out dir] [-j N] [-q]`
   - one table per run: linter, counts, time. `--exe` is passed to every linter that takes it
   - `--only t,..` = named linters; `-j N` = in parallel; `--out dir` = report files; `--cache-dir` keeps the refcheck entity index between runs
   - `--release [--big MB]` adds the ship checklist
3. the same through check, sorted by class with the verdict on top: `node tools/check/check.js <mod> [--json f]`
4. report formats of a single linter: `--format json|sarif|csv|html -o file` (lnglint, loccover, uilint, ialint, humlint, movlint, fxlint, strlint, overdiff, refcheck)
5. GUI: Mods tab > Check & Fix (full); Share tab for the release side

## Linters doctor runs
sdllint (syntax) · keylint (keys, values) · refcheck (references) · modinfo · lnglint + loccover (text) · milint (maps, missions, bots) · uilint (interface) · ialint (interaction) · binhdr (binary headers) · humlint · movlint · fxlint · strlint · expcheck (exporter limits)

## Release checklist codes (`--release`)
| code | meaning |
|---|---|
| REL_NO_MOD_INFO | no mod.info in the folder |
| REL_STRAY_FILE / WARN_REL_STRAY_FILE | dev files or notes in the mod root (they are not mounted: lim VFS-26) |
| WARN_REL_PAK_LOOSE_DUP | a loose file shadows the same path inside the mod's pak |
| REL_NET_SIZE_ONLY (info) | file kinds the lobby compares by size only (lim NET-01) |
| REL_TOTAL_SIZE, REL_BIG_FILE, REL_EMPTY_DIR (info) | size and tidiness |

`--release` also adds the GoH `localizations/` rules and the MoW:AS2 mod.info rules.

## Per game
| as64 | mowas2 | goh |
|---|---|---|
| all linters | `--exe mowas_2`: all linters on the view without as64/core; `--release` runs modinfo with the mowas_2 rules | `--exe goh --goh H`; uilint and binhdr are skipped (GAME_SKIP); defcheck refuses GoH (lim PORT-171) |

a mod whose mod.info range misses the game version is checked as a plain folder (NOT_MOUNTED; expcheck skipped, EXP_SKIP): fix the range first (`node tools/modinfo/modinfo.js <mod> --exe <game>`).

## Silent fails
- VFS-26 anything in the mod root outside `resource.pak` `resource/` `N.pat` `localization.pak` `localization/` is ignored by the game
- NET-01 some file kinds are compared by size only or not at all in the lobby: two players can pass the lobby and desync later
- VFS-02 names are lower-cased and `\` = `/`: two files differing only by case collide
- ENG-24 one bad mod.info in mods/ stops the game for everyone who installs the mod
- doctor has no load verdict: 0 errors is not "loads". the verdict is wouldload's (`node tools/wouldload/wouldload.js <modDir>`)

## Verify
- the table shows 0 errors for the target game; the release rows are read and accepted
- a full test run with the packed mod, log read (→ skills `mow-mod-test`, `mow-mod-share`)
- depth: guide 19-toolchain, 20-packaging-and-release, p15-pack-and-share · tools/index/lint.md (Grep `^doctor `)

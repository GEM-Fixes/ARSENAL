# mow-mod-check-fix: read findings (classes, codes, orphans, .lintrc)

when: a check printed codes and the user asks "what does this mean", "is this bad", "can I ignore it".

## Steps
1. take the report sorted by class (MCP `mow_mod_check`; CLI `node tools/check/check.js <mod> [--plain]`)
2. meaning of one code or row: MCP `mow_limit` (`ids` = row ids such as SDL-01; `words` = the code) Â· MCP `mow_lookup` (`query`, `mode` words|limit|cite)
   CLI Â
3. open the file:line of the first place; fix one place, re-run only that linter: MCP `mow_mod_check` (`only`) Â· CLI `--only tool`
4. GUI: Mods tab > Check & Fix lists the findings by class with the place

## Classes (registry severity)
| class | plain label (`--plain`) | meaning |
|---|---|---|
| crash | Can crash the game | fatal at load, at spawn (SPAWN) or on use (USE) |
| silent | Silently ignored by the game | the engine skips it with no log line: the change does nothing |
| desync | Can split a multiplayer match | players end up with different game state |
| review | Worth a look | may be intended; needs a human |
| cosmetic | Looks or reads wrong | text, pictures |

## Code shapes
- `WARN_` prefix = warning; bare code = error; info rows are hints (learned-type hints are capped 40 per code in keylint)
- each limits row ends `chk <tool> <CODES>`: so a code leads to its row and a row to its codes
- tags on rows: [V] verified, [I] inferred, [T] needs an in-game test. trust [V]; a [T]/[I] row is a lead, not a proof
- a linter's vanilla baseline is 0 findings (or a few known real ones): a code on a file the mod did not change still belongs to the mod's stack, look at what it replaced

## Orphans
- crash findings are REACHABLE, ORPHAN or UNKNOWN. ORPHAN = no loaded file reaches it; listed apart (ORPHAN_CRASH), not in the verdict
- do not chase orphans first; they matter when the user plans to use that file later

## Noise the user accepts: `.lintrc`
- JSON beside the mod (found walking up from the target dir / cwd): `{"ignore":[{"code":"X","path":"..","line":N,"reason":".."}],"severity":{"CODE":"info|warning|error|off"}}`
- suppressed findings are not counted (`N suppressed`); an unused entry gives info RC_UNUSED_SUPPRESSION; a bad rc = exit 2
- per run: `--rc FILE` / `--no-rc`. tools with their own argument parsing do not read it yet
- ask the user before adding an entry; write a `reason`

## Per game
| as64 | mowas2 | goh |
|---|---|---|
| rows in limits/ (`-l ID`) | same rows; differences: | GoH rows `GH<AREA>-NN`: MCP `mow_limit` with `game: goh` Â; not yet tried in game |

## Silent fails
- VFS-20 an unknown mod.info key or parse slip: nothing in the game log (modinfo UNKNOWN_KEY)
- SDL-33 / MIS-11 data key names are case-sensitive: a wrong-case key is skipped with no message
- LOC-02 a missing text key shows the raw key, no error
- UI-03 a missing picture: stub or nothing, no log line
- PORT-15 cp1251 strings are no error anywhere, just wrong letters (U+FFFD)

## Verify
- the code no longer appears on a re-run and the count line dropped by the right number
- crash class gone on paper = still untested: run the game (â†’ skill `mow-mod-test`)

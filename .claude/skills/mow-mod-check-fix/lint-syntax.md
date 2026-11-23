# mow-mod-check-fix: syntax errors (sdllint)

when: game.log says "unexpected token", "Identifier expected!", "Please resave file in UTF8", a brace count is off, or check lists BLOCK_ / STR_ / HASH_ / IDENT_ / MACRO_ / INCLUDE_ codes. Covers every SDL text file: .def .ext .set .inc .mi .mdl .mtl .lng .info .patch.

## Steps
1. MCP `mow_mod_check` (`mod`, `only: "sdllint"`)
2. CLI `node tools/sdllint/sdllint.js <folder> [--game dir] [--exe as64|mowas_2|mowas2|goh] [--mods a,b] [-q] [--summary]`
   strict engine lexer + reader with define / include / macro arguments emulated; fragments included by others are not linted as roots; `--game` lets includes resolve into vanilla
3. GUI: Mods tab > Check & Fix; open the file in the Editor tab at the line
4. fix by hand at file:line, or let fix do the known slips: MCP `mow_mod_fix` (`only: "syntax,include,macro,spell"`) · `node tools/fix/fix.js <mod> plan --only syntax,include,macro,spell`

## Codes
| code | meaning | row |
|---|---|---|
| BLOCK_UNCLOSED, BLOCK_END_STRAY, CONTROL_BAD, DEFINE_UNCLOSED | brace / control / define not balanced: load aborts | SDL-01 |
| HASH_COMMENT | `#` used as a comment; only `;` starts one | SDL-02 |
| IDENT_SPLIT, STRAY_OPERATOR | `-` `.` `/` `:` in a bare word split it; paths and such names need quotes | SDL-04 |
| STR_NEWLINE, STR_EOF | a string runs over the line end or the file end | SDL-08 |
| BOM_UTF16 | UTF-16/32 file: fatal; resave UTF-8 | SDL-12 |
| MACRO_UNDEFINED | macro call with no define in reach: crash class at an entity root | - |
| INCLUDE_MISSING | `(include ..)` target not found: crash class | - |
| WARN_PAREN_STRAY, WARN_INT_RANGE | review; vanilla has a few real ones | - |

## Per game
| as64 | mowas2 | goh |
|---|---|---|
| `--exe as64`: includes resolve through as64/core too | `--exe mowas_2`: no as64/core, so an include only core has is INCLUDE_MISSING there | `--exe goh` picks the GoH rules; with no `--game` it mounts the GoH install |

## Silent fails
- SDL-01 any syntax error is fatal, the load aborts, nothing is skipped: one bad file that a loaded entity reaches = no game
- SDL-02 `#` outside a string is an invalid character (a `#` in a FILE NAME such as `#mymod.lng` is fine)
- SDL-33 key names are case-sensitive, keywords are not: wrong case parses clean and does nothing (keylint finds it, not sdllint)
- SDL-26 / SDL-29 an arithmetic result or `5.0` in an int field: fatal "Integer expected!" (keylint INT_FIELD_FLOAT)
- PORT-15 strings are read as UTF-8; cp1251 text is not a syntax error, it shows as U+FFFD
- keep CRLF and the vanilla cp1251 comment bytes when you edit a copied file

## Verify
- re-run sdllint on the mod (or with the patch: `node tools/check/check.js <mod> --with <patch> --only sdllint`): 0 errors
- write-back safety of a file a tool edited: `node tools/roundtrip/roundtrip.js <file|dir> [--type .def,.set,...] [-q]` (exit 0 = all equal)
- then a game run: no fatal in game.log (→ skill `mow-mod-test`)
- sdl/reader sdl/macros · guide 05-sdl-language

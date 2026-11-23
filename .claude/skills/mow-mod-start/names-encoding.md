# mow-mod-start: file names, encoding, line ends, files the game skips

when: "boxes or question marks", "Please resave file in UTF8", "file not found but it is there", "can I use spaces / capitals / Cyrillic in a file name", before saving any data file by hand.

## Steps
1. check the names of a mod: `node tools/vfs/vfs.js G --exe as64|mowas_2|mowas2|goh --mods mymod --names -q` (NAME_BAD_CHAR, NAME_SPACE_EDGE, NAME_TOO_LONG, SKIPPED_EXT)
   MCP `mow_mod_check` (`mod`; `only` narrows to linters, e.g. `lnglint,sdllint`): encoding, BOM, braces
   CLI text: `node tools/lnglint/lnglint.js <folder> [--game dir] [--exe as64|mowas_2|mowas2|goh] [-q]` · syntax: `node tools/sdllint/sdllint.js <mod folder>`
   GUI: Mods tab > Check & Fix > Check
2. wrong encoding in many files: the fix plan converts into a patch folder, never the mod: MCP `mow_mod_fix` (`mod`, `out`, `only: "enc"`; plan, `write: true` applies) (→ skill `mow-mod-check-fix`)
3. write files through the tools where one exists (`mow_mod_gen`, `mow_text_set`): they keep CRLF, UTF-8 and the vanilla bytes

## Rules
| what | rule | source |
|---|---|---|
| data text (`.def .ext .set .inc .mi .patch`, scripts, mod.info) | CRLF line ends; string values UTF-8; identifiers plain ASCII | guide README conventions [V] |
| vanilla comments | may hold cp1251 bytes after `;`: keep the bytes, do not re-save the file in another encoding | same |
| `.lng` | UTF-8 without BOM, a `{tags ..}` root | LOC-05 |
| cp1251 string values | no error anywhere; every non-ASCII letter shows as a replacement box | PORT-15 [V] |
| file and folder names | lower-cased by the game, `\` = `/`; letters, digits and `[](){}@$%^-+._ !#&`; no leading or trailing space | VFS-02, VFS-05 |
| name length | over 4096 bytes fatal `path is too long`; zip entry names cut at 1023 bytes | VFS-03, VFS-04 |
| extension and title | extension = text from the LAST dot; title stops at the FIRST dot: `gun42.tif.bmp` has title `gun42`. Files with no extension are legal (weapon files) | vfs/names [V] |
| loose files never read | `.txt .temp .scc. . .org. .msg`, `.gitignore`, folders `.git` `.svn` | VFS-06, VFS-07 |
| paks | plain zip | VFS-10 |

## Per game
| as64 | mowas2 | goh |
|---|---|---|
| every string read as UTF-8, data and `.lng` alike [V] | same file rules; whether the old exe reads strings as UTF-8 everywhere is not proven here: check the text in game | UTF-8 [I]; text in `.pot/.po` under `localizations/`; mod FOLDER name stricter: no space, no byte >= 0x80, none of `<>+()[]{}!@#$%^&*-=;:\|'"` (GHVFS-27) |

## Silent fails
- VFS-02 two files that differ only by case are one name: one of them is lost, no message
- VFS-06 a loose `.txt` data file is invisible to the game (the same file in a pak is read)
- PORT-15 cp1251 strings: no log line, just wrong letters on screen
- LOC-05 is the loud one: UTF-16/32 BOM in a `.lng` = fatal "Please resave file in UTF8"; no `{tags}` root = fatal "Identifier expected!"
- an editor that changes encoding or line ends on save rewrites the cp1251 comment bytes of a copied vanilla file: diff before keeping it
- non-ASCII letters in a file name are accepted by the game but warned by the tools (WARN_NAME_NONASCII): identifiers stay ASCII
- mod.info saved as UTF-16 is broken (→ `mod-info.md`)

## Verify
- vfs `--names` and the check print no name or encoding finding
- in game: the text shows with the right letters on the screen it belongs to; game.log read (→ skill `mow-mod-test`)

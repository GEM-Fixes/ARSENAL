# mow-mod-port: many units at once, icons and portraits, names

when: "port the whole German tank list", "batch port", "bring the GoH icons over", "the ported units have no pictures / raw names".
G = AS2 install, H = GoH install, `<out>` = result mod folder.

## Steps: many units
1. list what to port (one entity name per line). what GoH has by class: `node tools/unitgroups/unitgroups.js` (tools/index/port.md for its line:
2. batch: `node tools/unitmod/unitmod.js --list f --goh D --base H --game G --work D --mod G/mods/x [--jobs 4] [--limit N] [--exe as64|mowas_2]` (`--limit 3` first; `--mod` under the install is the user's explicit choice of folder, never a vanilla folder)
3. one verdict table: `node tools/portverdict/portverdict.js <mod dir> --game G [--goh H] [--json f]`
4. census of what a port leaves: `node tools/portcensus/portcensus.js` (line:
5. test by class group, one process, no clicks (as64): `node tools/edrun/edrun.js --game G --root <dir> --exe as64_ed.exe --pairs pairs.json [--mods as64+,x] [--secs 240] --dry` first; pairs from `node tools/testplan/testplan.js pairs suggest <mod>`

## Steps: pictures
6. GoH icons, portraits, vehicle views into the mod: `node tools/artport/artport.js port --src <scene.pak|dir> --from <goh stem> --to <new stem> --out <dir> [--kinds k,k] [--convert png] [--size 104x52]`; what it can read: `artport formats`, `artport find`
   GUI: Models & Sim tab > `art` page (Look & Sound: icons, portraits, copy, check)
7. buy-menu wiring of the picture → skill `mow-mod-text-ui`

## Steps: names
8. `node tools/goh2as2/unitname.js <mod dir> [--goh H] [--game G] [--file '#goh2as2_names.lng'] [--dry-run] [-q] [--list]`
9. cards that take their name from desc/squad: `node tools/cardrename/cardrename.js plan <modDir> --game <dir> [--exe mowas_2|as64]`, then `apply ... --out <folder>`

## Per game
- as64: all of the above; mowas2: `--exe mowas_2` where the line shows it, static only [I]
- goh as target: none of these; GoH text is `.pot`, GoH icons need no port

## Silently fails
- UI-03 a missing picture gives a stub or nothing, no error
- FMT-04 a stray `.tga` / `.png` beside a `.dds` of the same name replaces it
- LOC-01 a mod `.lng` with the same file name as a game file replaces it whole: names file starts with `#` on purpose
- MIS-50 a card whose vehicle can not be created crashes the match when bought with a crew: verdict before cards
- SDL-30 card `charge level order icon` are int32: a `.0` literal is fatal

## Verify
- per unit: static verdict + the in-game points; pictures and names seen in the buy menu. A batch is reported as counts per verdict, never as "all work"

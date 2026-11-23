# mow-mod-units: rename a unit, change its tooltip

when: "rename a tank", "unit shows as desc/...", "change the description of a squad". Text only, no stats.
game: MCP `game` = `as64|mowas2|goh` · CLI `--exe as64|mowas_2|goh`. `<mod>` = the user's mod folder (full path).

## Steps
1. find the unit and its name key: MCP `mow_unit_find` (`q`, `mod`) then `mow_text_find` (`q` words or `key`, `mod`, `lang`): key, text and the file that wins
2. set the name: MCP `mow_unit_change` (`mod`, `id`, `what: "name"`, `value: "New name"`; GoH `card`), preview then `write: true`
   or by key: MCP `mow_text_set` (`mod`, `key`, `text`, `file`, `loc`, `force`, `write`)
   CLI `node tools/lng-add/lng-add.js <mod> --file #x.lng --key k/path --text t [--exe as64|mowas_2|goh] [--loc <code>] [--force]` (byte-preserving, refuses a duplicate key, warns when it shadows a vanilla key)
   spec: gen op `text` (`key`, `text`, `file`), sample `node tools/gen/gen.js --sample rename-unit`
   GUI: Units tab, name field of the unit
3. what is still unnamed: `node tools/loccover/loccover.js <modDir> [--lang eng] [--vfs --game dir] [--exe as64|mowas_2|goh] [-q] [--summary]`
4. rename the CARD id itself with every reference (AS2 only): `node tools/cardrename/cardrename.js plan|apply <modDir> --game <dir> [--exe mowas_2|as64] [--out <folder>]`

## Keys (shared)
- vehicle or gun: `desc/entity/<id>`; squad card: `desc/squad/<name>`; soldier under the unit bar: `desc/human/..`; tooltip: `info/entity/<info>` or `info/squad/<info>` where `<info>` is the card's `info` field [V]
- put the key in the mod's own `#<slug>.lng`: a file whose name starts with `#` keeps keys as written (LOC-10), so one file can hold `desc/entity/x` and `info/squad/y`
- never copy a vanilla `.lng` into the mod to change a few keys (LOC-01)

## Per game
| | as64 | mowas2 | goh |
|---|---|---|---|
| file | `resource/interface/text/#<slug>.lng`, UTF-8, `{tags}` root | same | `localizations/default/interface/text/<slug>.pot`, entry needs `msgctxt` = the key (GHLOC-01, GHLOC-06) |
| duplicate key | last file wins (LOC-04) | same | across files later wins, inside one file the FIRST stays (GHLOC-08) |
| cardrename | yes | yes | no |

## Silent fails
- LOC-02 an unknown key shows the key text (`desc/squad/...`), no log line
- LOC-01 / LOC-18 a mod `.lng` at a vanilla path replaces the whole file; an empty `desc.lng` wipes every vanilla name
- LOC-03 keys are case-insensitive: two keys differing by case collide
- LOC-05 a UTF-16/32 BOM or a missing `{tags}` root is fatal at start
- cp1251 text parses with no error and shows every non-ASCII letter as U+FFFD [V]
- MIS-32 renaming a card id (not its text) breaks bot lists: bots buy by exact card name `name(side)` and stop silently (→ skill `mow-mod-ai-bots`)

## Verify
- `mow_text_find` (`key`, `mod`) answers the new text and the mod file as the winner
- `node tools/lnglint/lnglint.js <folder> [--game dir [--mods a,b]] [--exe as64|mowas_2|mowas2|goh] [-q]`
- in game: buy panel, tooltip and the unit bar after selecting the unit (→ skill `mow-mod-test`). more on text: skill `mow-mod-text-ui`

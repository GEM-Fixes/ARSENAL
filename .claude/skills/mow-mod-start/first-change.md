# mow-mod-start: first change in the new mod, then check

when: the empty folder exists and the user wants "something to see in game", or asks what to do right after `mow_mod_new`.

## Steps
1. pick one small visible change: a new name for one unit, or the price of one card. Read the real ids first, never from memory: MCP `mow_unit_find` (`q`, `army`, `kind`) · `mow_unit_stats` (`id`)
2. make it: MCP `mow_unit_change` (`mod`, `id`, `what: name` or `price`, `value`; plan, then `write: true`)
   more than one thing: MCP `mow_mod_gen` (`mod`, `ops` = list of gen ops, e.g. `text`, `card`, `clone`, `set`; preview unless `write: true`; one refused op stops the call)
   CLI `node tools/gen/gen.js spec.yaml|json --target as64|mowas2|goh [--plan] [--out dir] [--game G] [--goh H]`; ready specs on real names: `node tools/gen/gen.js --sample list`, then `--sample rename-unit` or `--sample change-price`; check a spec: `--check-spec spec`
   GUI: the Quick Guided Task row above the tabs; Units tab for one unit (routes `/api/x/units/search`, `units/change`; a write needs `write: true` in the body)
3. what the mod now changes against the game: MCP `mow_mod_diff` (`mod`) · CLI `node tools/overdiff/overdiff.js <mod> --summary`
4. static check before the first run: MCP `mow_mod_check` (`mod`, `game`) · CLI `node tools/check/check.js <mod, anywhere> [--exe as64,mowas2,goh] [--fast]`
5. switch it on (→ `enable-mod.md`) and run (→ skill `mow-mod-test`); details of unit work → skill `mow-mod-units`, text → `mow-mod-text-ui`

## What the tools do for you
- a name goes into the mod's own text file (`#<slug>.lng`, GoH `.pot`), never into a copy of `desc.lng` (LOC-01)
- a price or other key of a game file: the mod gets a FULL copy of that file at the same path with the one value changed (VFS-01); gen says so (GEN_SET_FULL_COPY and the like)
- files are written CRLF, UTF-8 strings, vanilla comment bytes kept; nothing outside `<mod>` is touched
- the gen verdict is "static clean" or "partial", never "works"

## Per game
| | as64 | mowas2 | goh |
|---|---|---|---|
| target word | `as64` | `mowas2` (`--exe mowas_2` for readers) | `goh` |
| cards | `set/multiplayer/units/*.set` | same | `units/<period>/units_<army>.set`, other card form (→ skill `mow-mod-units`) |
| names | `#<slug>.lng` | same | `localizations/default/interface/text/<slug>.pot` |
| check | `--exe as64` | `--exe mowas2` (no `as64/core`, no `as64+`) | `--exe goh --goh H`; mod folder outside H |
| not offered | - | - | armour change and some ops answer "not for this game" in plain words |

## Silent fails
- VFS-01 / VFS-41 the full copy hides later changes to that file by the game or an earlier mod: keep the copy small in number, one file per need
- VFS-42 a copied roster file hides other mods' cards in the buy menu
- LOC-02 a card whose name key is missing shows the raw key (`desc/..`), no error
- MIS-32 bots buy by exact card name: a renamed card is silently no longer bought (→ skill `mow-mod-ai-bots`)
- VFS-29 a change under `set/`, `entity/`, `properties/` .. makes the mod matter for multiplayer: every player needs the same files
- VFS-28 a file added while the game runs is seen only after Apply in Options > Mods

## Verify
- `mow_mod_diff` lists exactly the one key; `mow_mod_check` verdict LOADS_STATIC (static, not run)
- in game: open the buy menu of that army, read the new name or price; then MCP `mow_game_log` for the run (→ skill `mow-mod-test`)
- tell the user what was and was not seen in game

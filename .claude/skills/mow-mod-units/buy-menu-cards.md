# mow-mod-units: buy menu (add, hide, move, group, limit a card)

when: "put my unit in the buy menu", "unit not in the purchase panel", "hide a unit", "limit snipers to 2", "unit under the wrong tab", "two units share a cooldown".
game: MCP `game` = `as64|mowas2|goh` · gen `--target as64|mowas2|goh`. `<mod>` = the user's mod folder (full path), G = game install.

## Steps
1. read the panel: MCP `mow_army` (`army`, `class`, `search`, `mod`; goh `period`, `doctrine`); one card: `mow_unit_stats` (`id`, `mod`)
2. new card for a unit: MCP `mow_mod_gen` (`mod`, `ops: [{op:"roster", unit:"<id>", like:"<card to copy>", army:"<tag>", fields:{cost:N}, icon_like:"<card>", bots:{..}}]`, `write`)
3. change, hide or drop a card: op `card` (`unit`, `army`, `fields`, `tags`, `not_for_sale: true`, `basic`, `remove: true`, `icon`, `info`, `list`)
4. per-player limits of a preset: op `preset` (`file`, `name`, `set`), sample `node tools/gen/gen.js --sample preset`
   CLI specs: `node tools/gen/gen.js --sample change-price`, `--sample clone-unit`; run `node tools/gen/gen.js spec.yaml --target as64|mowas2|goh --plan`
   rename card ids with all references (AS2 only): `node tools/cardrename/cardrename.js plan|apply <modDir> --game <dir> [--exe mowas_2|as64] [--out <folder>]`
   GUI: Units tab > buy card (`POST /api/x/units/buy`)
5. lint: `node tools/milint/milint.js <mod folder> [--game dir] [--exe ..]` (cards, limits, bots) and `node tools/uilint/uilint.js <mod folder> [--game dir] [--exe as64|mowas_2|mowas2|goh]` (missing button picture)

## Rules (shared), pricing/economy
- cards are `{"name" ...}` blocks in `set/multiplayer/units/*.set`; the same name twice MERGES (tags merge)
- `tags`: the army tag (must match the player's army), era tags, category tags used by unit sets, limits, cooldown factors and CP pools; the unit name is added as a tag by itself
- `button` = which budget pays and which panel category shows it
- `group` = shared cooldown; same non-zero `icon` number inside a group = a sequence: only one shown, the next appears after purchase
- `not_for_sale` hides; `basic` survives `apply remove`; `remove` deletes the entry once read
- `info` = tooltip key `info/entity/<info>` or `info/squad/<info>`
- unit file choice: the engine loads only the first of `<gameType>.set`, `<gameClass>.set`, `common.set` in `units/` (TST-94)

## Per game
| | as64 | mowas2 | goh |
|---|---|---|---|
| roster | `set/multiplayer/units/*.set` | same | `units/<period>/units_<army>.set`, card `{"id" (macro .. cost(N) ci(N)) ..}` [I] |
| rank lock | `level` | `level` | none (GHMIS-85) |
| extra | - | - | doctrines and research: `node tools/statsheet/statsheet.js --exe goh --sheet research` |
| cardrename | yes | yes | no |

## Silent fails
- VFS-42 a mod roster file replaces the whole vanilla file: cards of the game or of another mod in it are gone from the menu
- TST-94 a mod `units/common.set` replaces the stock unit list whole; two mods shipping it clash
- MIS-32 bots buy by exact card name `name(side)`: rename or drop a card and the bot stops buying, no error
- MIS-11 / GPL-08 wrong-case or unknown card keys are skipped silently
- GPL-09 `unitLimits` / `payback` with the wrong separator drop entries silently (milint MIS_LIMITS_FORMAT); GPL-10 limits count purchases, no refund on death
- MIS-15 `level` is dead in test mode, ranked, for AI and when the mode turns rank limits off
- MIS-07 an army with `id` < 0 is not selectable: its cards never show
- UI-03 a missing card picture is silent (uilint PICTURE_MISSING); LOC-02 a missing name shows the raw key
- a card whose army tag does not match the player's army never shows, no log line [V mp-units]

## Verify
- `mow_army` (`army`, `search: "<id>"`, `mod`) lists the card with class and price
- in game: open the buy panel of that army in a skirmish, find the card under its tab, buy it; read game.log (→ skill `mow-mod-test`)

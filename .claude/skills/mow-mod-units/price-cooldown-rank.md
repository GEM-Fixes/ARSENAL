# mow-mod-units: price, cooldown, rank, head start, CP, score

when: "change the price", "cost", "cooldown", "make it available later", "rank needed", "command points", "kill score".
game: MCP `game` = `as64|mowas2|goh` · gen `--target as64|mowas2|goh`. `<mod>` = the user's mod folder (full path), G = game install.

## Steps
1. read the current card: MCP `mow_unit_stats` (`id`, `mod`)
2. change one value: MCP `mow_unit_change` (`mod`, `id`, `what` = price | cooldown | rank | headstart, `value`; GoH `card`). preview, then `write: true`. answers old → new and the files
3. other card fields (cp, score, group, tags ..): MCP `mow_mod_gen` (`mod`, `ops: [{op:"card", unit:"<id>", army:"<tag>", fields:{cost:N, charge:N, cp:N}}]`, `write`)
   op `card` also takes `price`, `cp`, `score`, `period` (GoH), `not_for_sale`, `remove`
   CLI `node tools/gen/gen.js --sample change-price` shows the spec; run `node tools/gen/gen.js spec.yaml --target as64|mowas2|goh --plan` then without `--plan`
   one key by hand: `node tools/patch-entity/patch-entity.js <mod> --game G --file <set file key> --set p=v --dry-run`
   GUI: Units tab, the unit's card numbers; Balance page for many at once
4. check: `node tools/check/check.js <mod, anywhere> [--exe as64,mowas2,goh]`; fit to its class: MCP `mow_balance_check` (`mod`, `q`)

## Card keys (shared engine)
| key | meaning |
|---|---|
| `cost` | points charged, from the budget that has the card's `button` |
| `charge` | cooldown seconds |
| `fore` | start progress: 1 = ready at start, 0 = full cooldown, negative = longer |
| `level` | rank needed |
| `cp` | command points; a squad's total = sum over `content` |
| `score` | kill score the enemy gets |
| `cw` | capture weight at flags |
| `group` | buying one restarts the cooldown of every available unit of the group (per side) |
- lock at match start = `charge x chargeFactor x (1 - fore)`; chargeFactor comes from the game mode by tag. all cooldowns start once when the match starts, after the countdown
- a unit that becomes available later (unit set change) starts a fresh cooldown, `fore` not used
- economy as the player sees it: MCP `mow_army` (no `army`) ·

## Per game
| | as64 | mowas2 | goh |
|---|---|---|---|
| price | card `cost` | same | own `cost(N)` + members x `squad_cost_factor` (GHGPL-10) |
| rank `level` | yes | yes | none: refused in plain words (GHMIS-85) |
| head start `fore` | yes | yes | none: refused |
| cooldown | `charge` | same | card macro argument, per period card |
| write | `--target as64` | `--target mowas2` writes the 3.262 range | `.set` under `units/<period>/` |
- GoH price parts: `node tools/statsheet/statsheet.js --exe goh --sheet price`

## Silent fails
- MIS-15 `level` is ignored when the mode sets `useUnitLevelRestrictions 0`, in test mode, ranked and for AI: a rank change may show nothing in a test run
- MIS-11 field names are case-sensitive: `Cost` is skipped silently
- GPL-08 unknown multiplayer data keys are skipped silently
- GPL-10 unit limits count purchases, no refund on death
- VFS-42 the mod's copy of the roster file replaces the whole vanilla file: another mod's cards in it vanish
- TST-94 a mod `units/common.set` replaces the stock unit list whole
- test mode and replays have countdown 0 and chargeFactor may be 0: a cooldown can look "not applied" there [V mp-units]

## Verify
- `mow_unit_stats` (`id`, `mod`) shows new value and the game's value
- in game: buy panel price and tooltip; wait at match start in a real skirmish, not test mode (→ skill `mow-mod-test`)
- tell the user old → new, the roster file copied, and that rank / head start were refused on GoH if asked

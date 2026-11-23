# mow-mod-units: squads (members, count, order, price)

when: "bigger squad", "add a medic to the squad", "new squad", "squad price", "who leads the squad".
game: MCP `game` = `as64|mowas2|goh` · gen `--target as64|mowas2|goh`. `<mod>` = the user's mod folder (full path), G = game install.

## Steps
1. read: MCP `mow_unit_find` (`q`, `kind: "squad"`, `army`, `mod`) then `mow_unit_stats` (`id`, `mod`): members with counts, price, files
2. change the count of one member: MCP `mow_unit_change` (`mod`, `id`, `what: "squad"`, `value: <soldier count>`, `breed: "<which member>"`), preview then `write: true`
3. new squad or new member list: MCP `mow_mod_gen` (`mod`, `ops: [{op:"squad", name:"<new>", army:"<tag>", like:"<base squad>", members:["squadleader:1","rifle:5"], display:"Shown name", fields:{cost:N}, bots:true}]`, `write`)
   op `squad` also takes `info`, `content`, `order`, `period` (GoH), `not_for_sale`, `remove`, `change`
   CLI `node tools/gen/gen.js --sample squad`, run with `--plan` first
   GUI: Units tab, the squad's member list (`POST /api/x/units/change`); buy card: `POST /api/x/units/buy`
4. a member that does not exist yet → make the breed first (gen op `breed`, same call, before the squad op)
5. check: `node tools/check/check.js <mod, anywhere> [--exe as64,mowas2,goh]`; price fit: MCP `mow_price` (`mod`, `show: "fit"`; as64 and mowas2) and `mow_balance_check` (`mod`, `q: "squad"`)

## Rules (shared)
- a squad is a card in `set/multiplayer/units/*.set` whose `content` lists `"name[:count] ..."`: a name that is a breed spawns humans, anything else an entity; `*` = the card's own name
- squad command points = sum of `cp` over `content`
- name key `desc/squad/<name>`, tooltip `info/squad/<info>`
- who stands for the squad in the squad bar: the member breed with the highest `icon_priority` [V humans/breeds]
- price is a card field, not computed by the engine on AS2: changing members does not change `cost`

## Per game
| | as64 | mowas2 | goh |
|---|---|---|---|
| card | `{"name" {content ..} {cost ..}}` | same | `{"id" (macro .. cost(N) ci(N)) ..}` in `units/<period>/units_<army>.set` |
| price | card `cost` as written | same | own cost + members x `squad_cost_factor` (GHGPL-10) |
| members | breed `army/name` | same | `army/period/name`, one card per period [I] |
| price model tool | `mow_price` | `mow_price` | AS2 layouts only [I] |

## Silent fails
- HUM-18 a member name that is no breed and no entity: warning only; an unknown breed spawns a `skeleton` soldier
- LOC-02 no `desc/squad/<name>` key: the card shows the raw key
- MIS-32 bots buy by exact card name `name(side)`: a new or renamed squad is not bought until the bot list names it (op `squad` `bots: true`; → skill `mow-mod-ai-bots`)
- VFS-42 the mod's roster copy replaces the whole vanilla file; another mod's squads in that file vanish
- MIS-11 a wrong-case card key is skipped silently
- GPL-09 `unitLimits` entries with the wrong separator are dropped silently: a squad limit may not apply
- same card name in two `{units}` blocks MERGES (tags merge) instead of replacing [V mp-units]: use `remove` to drop an old card first

## Verify
- `mow_unit_stats` (`id`, `mod`) lists the members as written
- in game: buy the squad, count soldiers, check leader, name and price in the buy panel; game.log has no `Unknown breed` (→ skill `mow-mod-test`)

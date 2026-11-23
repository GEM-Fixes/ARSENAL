# mow-mod-text-ui: the buy panel (cards, category buttons, price line, tooltip)

When: "my unit is not in the buy menu", "wrong category button", "change the order / the picture / the tooltip of a card", "can I move the purchase panel".
Card NUMBERS (price, cooldown, squad members) → skill `mow-mod-units`. Here: what the panel shows and where it takes it from.

## What is data, what is built in
- built in (C++): the place and size of the purchase panel, 3 cards per row, the card layout, tooltip structure: a mod cannot move or resize them (lim UI-02, UI-01 [V])
- data: which cards exist, their `button` tag (category), tags, pictures, texts, unlock timers, budgets
- cards live in `set/multiplayer/units/**`: `{"name" ...}` entries, same name = merge. Fields the panel uses:
  `button` (which budget pays + the category column) · `cost` · `charge` (cooldown s) · `fore` (start progress) · `group` + `icon` (same non-zero icon in a group = a sequence, only one shown) · `level` (rank) · `info` (tooltip key) · `tags` (army tag must match the player's army) · `not_for_sale` (hidden) · `content`
- category column: one button per button tag in the local side's budgets (`budget.buttons`) that at least one purchasable card uses
  picture of tag `T` for army `A`, in order: `unit_icon/T(A)` → `unit_icon/T` → the icon of the first card with that button → `unit_icon/stub`. tooltip `mp/scene/hint_<T>`
- card: picture `/interface/scene/unit_icon/<card name>` (4 frames `_00.._03`; squads carry the side: `riflemans(usa)_00.tga`), else `unit_icon/stub`; name `desc/entity/<id>` or `desc/squad/<id>`; cost text `mp/scene/hint_cost2/<budget tag>`; rank on hover `mp/scene/hint_level`; "i" button only when info text exists (lim LOC-11)
- text and picture are independent: one can be right and the other missing

## Steps
1. read the panel as the game builds it: MCP `mow_army` (`army`, `class`, `search`, `mod` = the mod folder on top; goh: `period`, `doctrine`)
   CLI `node tools/statsheet/statsheet.js G [--exe as64|mowas_2|goh] --folder <mod> --units-json` · `node tools/balance/balance.js G --folder <mod> --where "army=ger"`
   GUI: Units page (buy list of an army), Balance page
2. add or change a card: MCP `mow_mod_gen` (`mod`, `ops`): `{op:"card", unit, army, fields:{button:"..", cost:N}, name, info, icon_like, tags, not_for_sale}` · new card for a new unit `{op:"roster", like, army, unit, icon_like}` · squad `{op:"squad", name, army, like, members, display, info}`
   CLI `node tools/gen/gen.js --sample change-price|clone-unit|squad`, then `node tools/gen/gen.js spec.yaml --target as64|mowas2|goh --plan`
3. texts of the card: name + info keys: MCP `mow_text_set` (`mod`, `key: "desc/squad/<name>(<side>)"`, `text`); category tooltip `mp/scene/hint_<tag>` for a NEW button tag
4. pictures: card icon and category picture → `icons.md` of this skill (or gen `icon_like`)
5. check: MCP `mow_mod_check` (`mod`, `only: "loccover,uilint"`) · CLI `node tools/loccover/loccover.js <mod> --game G` (LOC_NAME_MISSING, LOC_INFO_MISSING), `node tools/uilint/uilint.js <mod> --game G` (PICTURE_MISSING)

## Per game
| | as64 | mowas2 | goh |
|---|---|---|---|
| card files | `set/multiplayer/units/*.set` | same | `units/<period>/units_<army>.set`, cards `{"id" (macro .. cost(N) ci(N)) ..}`, one id per period [I] |
| price shown | `cost` | same | own cost + members x `squad_cost_factor`; the button shows the whole squad's price (GHGPL-10) |
| rank / start delay | `level`, `fore` | same | none (gen and `mow_unit_change` refuse them) |
| category tooltip key | `mp/scene/hint_<tag>` | same | `mp/scene/unit_spawn/<type>` (guide 15; not run in game) |
| buy tooltip keys | `hint_time`, `hint_level` | same | `hint_available`, `hint_time2`, `hint_requires/<condition>` (GHLOC-16) |
| HUD layout | C++ | C++ | XML layouts under `interface/layout/` can be rearranged (GHUI-130) [not run in game] |

## Silent fails
- VFS-42 a mod copy of a roster `.set` replaces the whole vanilla file: other mods' cards vanish from the panel
- TST-94 a mod `units/common.set` replaces the stock unit list whole; only the first of `<gameType>.set`, `<gameClass>.set`, `common.set` is read
- UI-03 a missing or misspelt card picture: stub or nothing, no log line
- LOC-02 a missing name: the raw `desc/squad/...` key on the card
- MIS-32 bots buy by exact card name `name(side)`: a renamed card is silently never bought (→ skill `mow-mod-ai-bots`)
- a card whose `button` tag is in no budget of the side: never offered [I]; a card without the army tag: not on that army's panel

## Verify
- `mow_army` with `mod` lists the card with the right class and price
- in game: lobby → match → the category button shows, the card has picture, name, price, "i" (→ skill `mow-mod-test`)

Depth: · guide 15-interface-and-icons (2. The multiplayer purchase card), 12-missions-and-multiplayer-setup

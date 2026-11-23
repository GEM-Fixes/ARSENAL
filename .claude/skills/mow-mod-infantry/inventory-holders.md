# mow-mod-infantry: inventory box, holders, item size and weight

when: "bigger backpack", "how many grenades fit", "item does not stack", "soldier can not pick it up", "helmet slot", "items a dead soldier drops", "weight of the kit".
G = game install, `<mod>` = the user's mod folder (full path). MCP `game` = `as64|mowas2|goh`.
Which items a breed starts with → skill `mow-mod-units` (`inventory-kit.md`).

## Steps
1. the soldier's box and holders: MCP `mow_entity_info {names:["<human entity>"], mod:"<mod>"}`; the file that wins: `mow_file_which {path:"properties/human.ext", mods:[..]}`
2. one item's size and weight: MCP `mow_weapon_find {q:"<item>"}` → its file under `set/stuff`, then Read the `{inventory ..}` block
3. try a kit against the box without writing: MCP `mow_kit_slot {mod:"<mod>", breed:"<army/name>", add:[{item:"<item>", count:6}]}` (the plan says what does not fit)
4. change box or item: copy the file into `<mod>` at the same path, edit (CRLF); one key: `node tools/patch-entity/patch-entity.js <mod> --game G --file <file key> --set p=v --dry-run`
5. lint: `node tools/humlint/humlint.js <mod folder> [--game dir] [--exe as64|mowas_2|mowas2|goh]` (HUM_BOX_SIZE_INT8, WARN_HUM_USER_AMOUNT, HUM_HOLDER_TWO_ITEMS)
6. GUI: Units & Balance tab > `units` page, Equipment card (equipment browser)

## Facts [V unless tagged]
- one box (a grid) + holders (single-item slots: `hand_left`, `hand_right`, `armor` ..) per soldier
- box keys: `{Size w h}` cells, `{Weight W}` weight one cell carries, `{item <tags> [n]}`, `{cell x y}`, `{clear}`; vanilla soldier `Size 6 10`, `Weight 100`
- item (stuff) `{inventory {size w h}{weight f}..}`: `size` = cells covered, `weight` = one unit
- a cell stack holds floor(cell weight / item weight) units [T]; only items tagged `stackable` stack
- placing: cells row by row, first place that fits; if none, the box is re-packed largest first
- total mass (item mass x count + filling) is the load that picks the stamina band (→ `health-stamina.md` in this skill)
- a dead soldier drops stackables as one ground item per stack, others up to a small limit
- vehicles use the same box type for their ammo store

## Per game
- as64 / mowas2: 6 x 10
- goh: 8 x 12 [V data]; ammo counts live in the item's bullets (GHKEY-71).

## Silently fails
- HUM-23 `Size` is stored in 8 bits per side; stacking needs tag `stackable`; a non-stack `{user}` entry with a count other than 1: warning `Invalid amount for non-stack item in holder box`
- HUM-21 what does not fit is dropped silently at spawn
- HUM-24 `pierceAbsorb` sits on the armour HOLDER; any item tagged `armor` switches it on: a new vest can not carry its own value
- HUM-25 one weapon place takes one item
- HUM-26 stuff `{fsm "x"}` names a file `set/stuff/_settings/x.fsm`: unknown = `Unknown fsm state` load error
- HUM-28 carrying a one- or two-hand item can disable prone and squat
- HUM-04 a locked right-hand item forces walking
- a bigger box in `human.ext` is bigger for every soldier, and old saves keep the old layout

## Verify
- in game open the soldier's inventory: grid size, stacks, what is in the holders; pick up and drop the item; kill him and look at the drop; log read (→ skill `mow-mod-test`)

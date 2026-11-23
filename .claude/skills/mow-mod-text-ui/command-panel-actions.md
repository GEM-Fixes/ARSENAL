# mow-mod-text-ui: command panel, action files, panel buttons

When: "add a button to the command panel", "my button shows but does nothing", "button is missing", "Unknown control panel item", "Unknown instruction", "move the panel".

## What is data
- screens are compiled: no new dialog types, no new panel item types, no move / resize of the control bar or the 4 x 3 command grid (lim UI-01, UI-02)
- panel layouts: `set/panel_control/*.set`. the main panel reads `right_main.set`, `right_attack.set`, `right_useitem.set`; `right_special.set` is listed and never loaded (lim UI-07)
- file: root `{panel_control ...}`; each child block name = an item name; fields `position col row` (col 0-3, row 0-2; none = first free cell), `condition` terms, `priority` (same-cell clash: lower kept first)
- condition terms: unit tags `vehicle tank cannon tractor human`; `single`, `multiple`, `commander`; `disabled` = show even when the action is unavailable. any other term logs `Unknown condition term` and the rule is ignored (lim UI-08)
- item name resolves to: an action (compiled, or `interface/action/<name>.set`), else a compiled item type (`gc_cp_..`), else `Unknown control panel item : "<name>"` + a dummy button that does nothing (lim UI-10)
- action file `interface/action/<name>.set`, block `{action ...}`: `cursor`, `button "picture"` (stem under `/interface/scene/panel_control/`, default = action name), `fx`, `item "tags"`, `item_in_box`, flags (`RequireSelect`, `ShowCount`, `AimEntities` ..). a name that is not a compiled action becomes a custom action: `{target ..}`, `{instructions ..}`, `{instant ..}`
- the instructions inside a custom action are interaction script → skill `mow-mod-scripts`
- button hint text: keys `actionbar/<button stem>` (+ `/req` `/action` `/usage`)

## Steps
1. read the game's file: MCP `mow_file_which` (`path: "set/panel_control/right_main.set"`, `mods`)
   CLI `node tools/vfs/vfs.js G --exe as64|mowas_2|mowas2|goh --mods a,b which set/panel_control/right_main.set`
2. copy it into the mod at the same path under `resource/` and edit (whole-file override: keep every item)
   one key without a hand copy: MCP `mow_mod_gen` (`mod`, `ops: [{op:"set", rows:[{file:"set/panel_control/right_main.set", path, value}]}]`; preview first; check the op answer names the file)
   GUI: Editor page, file view Game → "Copy into my mod" → edit → Save (AS2 tabs only)
3. new button: (a) `resource/interface/action/<name>.set`, (b) the item in a panel file with a `position`, (c) pictures `resource/interface/scene/panel_control/<stem>_00..03`, (d) hint text: MCP `mow_text_set` (`mod`, `key: "actionbar/<stem>"`, `text`)
4. lint: MCP `mow_mod_check` (`mod`, `only: "uilint"`)
   CLI `node tools/uilint/uilint.js <mod> [--game G] [--exe as64|mowas_2|mowas2|goh] [--mods a,b] [--summary]`
   codes: PICTURE_MISSING (UI-03), ACTION_INSTRUCTION_UNKNOWN (UI-06, crash class), PANEL_SPECIAL_UNLOADED (UI-07), PANEL_CONDITION_UNKNOWN (UI-08), PANEL_CELL_CLASH / PANEL_CELLS_FULL / WARN_PANEL_CELL_RANGE (UI-09), PANEL_ITEM_UNKNOWN (UI-10), WARN_ACTION_SET_MP_MISMATCH (UI-05)
5. after a run: MCP `mow_game_log` (lines `Unknown control panel item`, `Unknown condition term`, `Unknown instruction`)

## Per game
| | as64 | mowas2 | goh |
|---|---|---|---|
| panel lists loaded | 3 (main, attack, useitem) | same | 6, among them `right_special` and `right_emplacement` (guide p08) |
| condition tags | 5 unit tags, no negation | same | + `helicopter hatch engine`, and `-<tag>` hides (GHUI-75) |
| action keywords | as above | same | + `FxEntity`, `IgnoreEntities`, `AbleRotate`, `HideLdragArrow` (GHUI-40); `Key` gives an own action a hotkey |
| HUD | C++ | C++ | XML layouts `interface/layout/*.xml`, `<DialogRef>` parts (GHUI-130, GHUI-115) |
| uilint | AS2 rules | AS2 rules | GoH tables: no PANEL_SPECIAL_UNLOADED; unknown condition term = info PANEL_CONDITION_TAG; `plant` does nothing (WARN_PLANT_NOOP) |
All GoH rows: untested, not run in game. Under the GoH tab the GUI has no Editor page.

## Silent fails (and two loud ones)
- UI-09 12 cells: an item with no `position` is hidden when the grid is full; the second item in one cell is hidden (same cell is fine when conditions differ)
- UI-10 a typo in an item name: a button that shows and does nothing; in the minimap panel: error + crash
- UI-03 no `button` keyword or a wrong stem: stub picture, no log
- UI-07 edits to `right_special.set` do nothing
- UI-08 an unknown condition term: the rule is ignored
- UI-05 action net ids follow creation order: host and client need the same `interface/action` set or multiplayer breaks
- UI-06 an unknown instruction in a custom action = crash
- UI-14 a custom action can not get a hotkey (AS2)

## Verify
- uilint clean; in game: select a unit the condition fits, the button is in its cell, the hint reads, the action runs; game.log has none of the three `Unknown ..` lines (→ skill `mow-mod-test`)

Depth: · guide 15 (4. Actions, 5. The command panel), r09 (panel_control, action)

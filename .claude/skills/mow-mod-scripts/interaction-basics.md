# mow-mod-scripts: how interaction scripts load and which block a unit gets

when: "where is the script of this tank", "which handlers does my unit run", "my block is ignored", "Unknown props", "inherit or overload".
G = game install, `<mod>` = the user's mod folder (full path). MCP `game` = `as64|mowas2|goh`.

## Steps
1. the unit's tags decide: MCP `mow_entity_info {names:["<id>"], mod:"<mod>"}` → its `props` (from the def and included `.ext`)
2. find blocks and handlers: MCP `mow_script_find {name:"<event | handler | tag>", mod:"<mod>"}` (`scope` = scripts (default) | missions | all; `q` narrows by path) → file, line, text
3. word check: MCP `mow_script_words {kind:"events", q:"<part>"}` (`kind` = all|events|actions|containers; `explain: true` with `q` adds what the word takes)
4. the winning file: MCP `mow_file_which {path:"set/interaction_entity/<file>", mods:[..]}`
5. lint: MCP `mow_script_lint {mod:"<mod>"}` · CLI `node tools/ialint/ialint.js <mod folder> [--game dir] [--exe as64|mowas_2|mowas2|goh] [--mods a,b] [-q] [--summary]`
6. GUI: Editor (opens the file with its outline); Mods tab > Check & Fix

## Facts
- entry `/set/interaction_entity/entity.set` (+ its includes): top-level blocks `{"<tags>" {on <event> [inherit|overload] {actions}} ..}`
- terrain side: `/set/interaction_terrain/effects.set` → `{"name" {on hit|detonate ..}}`, picked by the ground material's effect name
- a block applies when ALL its tags are among the entity's definition tags (`props`), or the tag is `generic` or the entity's own name
- matching is done once per entity description; file order = level order (generic → class → unit)
- per event the highest level that defines it runs; default `inherit` runs the lower levels first, `overload` runs only this one, `{inherited}` inside an overload calls the next lower
- class names (`"tank"`, `"human"`, `"cannon"` ..) are tag sets in data, not engine classes
- `(include ..)` and `(define ..)` macros expand before the engine reads the block
- a command carries optional context: target, instigator, volume, part, bone, value, position, source, bullet, sender. an absent field makes its condition false and its action a no-op

## Per game
- as64 / mowas2: same engine set of events and actions
- goh: more events (`destroy` GHINT-17; `blast_wreaked`, `animation_event`, `hatch` GHINT-45) and its own action list (GHINT-26). in AS2 data those are `unexpected token` / unknown. `mow_script_words {game:"goh"}` lists them

## Silently fails
- INT-01 `{tags add}` at run time does not change which blocks apply; only `{if tagged}` sees it
- INT-02 the same `{on X}` twice in ONE block: error `event already defined`
- props no block mentions: harmless log `Unknown props : ".."`; the unit just gets fewer blocks
- a block placed before a block it should refine: order decides, no message
- a mod's `entity.set` copy drops every other mod's blocks: add an include file and one line, or a patch → skill `mow-mod-together`

## Verify
- `mow_script_find` shows the handler in the winning file; in game cause the event; log has no `event already defined` / `unknown action` (→ skill `mow-mod-test`)

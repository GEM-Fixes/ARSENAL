# mow-mod-scripts: give a new unit its own script block or macro

when: "my cloned tank has no engine sound / no damage reactions", "copy the script of unit A to unit B", "change one macro argument of a unit", "add a handler only for my unit".
G = game install, `<mod>` = the user's mod folder (full path). MCP `game` = `as64|mowas2|goh` · gen `--target as64|mowas2|goh`.

## Why it is needed
A unit gets every block whose tags it carries, plus the block named after the unit itself. Vanilla keeps per-unit blocks (sounds, special reactions) under the unit's own name: a clone under a new name loses that block unless it is copied.

## Steps
1. does the source unit have its own block: MCP `mow_script_find {name:"<source id>", scope:"scripts"}`
2. copy it under the new id: MCP `mow_mod_gen {mod:"<mod>", ops:[{op:"iblock", entity:"my_t34", like:"t34_0"}]}` → plan (every changed line); `write: true` writes
   CLI `node tools/gen/gen.js spec.yaml --target as64|mowas2|goh [--plan] [--out dir] [--game G]` · sample `node tools/gen/gen.js --sample iblock`
3. one macro argument in a def: MCP `mow_mod_gen {mod:"<mod>", ops:[{op:"macro", entity:"t34_0", macro:"tank_trace", arg:"step", value:0.7}]}` · sample `node tools/gen/gen.js --sample macro`
4. a handler of your own: add a block `{"<unit id>" {on <event> {..}}}` in a NEW include file under `<mod>/resource/set/interaction_entity/`, and include it from the mod's copy of the file that lists includes. keep the copied file's other lines byte-equal
5. lint: MCP `mow_script_lint {mod:"<mod>"}` · `node tools/ialint/ialint.js <mod folder> [--game dir] [--exe as64|mowas_2|mowas2|goh]`
6. the general check: MCP `mow_mod_check {mod:"<mod>"}` (GEN_FILE_FULL_COPY = a full vanilla file was copied: other mods' edits to it are shadowed)
7. GUI: Mods tab > `make` page (Generator) runs the same ops; Editor for the hand edit

## Facts
- the block name is a tag list; the unit's own name counts as one of its tags
- `(define "name" ..)` macros are scoped to the top-level file being read; parameters are plain `%name` text substitution with no defaults (GPL-11)
- a def calls a macro as `("name" arg(value) ..)`; later keys in the def override what the macro set
- higher levels run after lower ones unless marked `overload`

## Per game
- as64 / mowas2: `--target as64|mowas2`; same files
- goh: its interaction folders and macro names differ; gen `--target goh` writes the GoH forms; rules there are [I], not yet tried in game.

## Silently fails
- GPL-11 a macro used but not defined in that file's scope: fatal `define not found`
- INT-02 the copied block already defines an event the mod adds again in the same block: `event already defined`
- INT-04 the new block calls a helper handler that lives only in the source unit's file: silent no-op
- two mods that both copy `tank.inc` (or any shared include): the later one wins whole → skill `mow-mod-together`
- gen's verdict "static clean" or "partial" is never "works"

## Verify
- `mow_script_find {name:"<new id>"}` shows the block in the mod; in game the clone sounds and reacts like the source (drive it, hit it); log clean (→ skill `mow-mod-test`)

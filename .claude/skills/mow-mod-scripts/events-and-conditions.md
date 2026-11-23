# mow-mod-scripts: interaction events and conditions

when: "which event fires when a shell hits", "on pierce does not run", "how do I test for X in a script", "unknown condition", "if energy greater than", "and / or in a script".
G = game install, `<mod>` = the user's mod folder (full path). MCP `game` = `as64|mowas2|goh`.
What the hit itself does to armour → skill `mow-mod-weapons-damage` (`hit-events.md`).

## Steps
1. the engine's event list for the game: MCP `mow_script_words {kind:"events"}`; one word with its arguments: `{kind:"events", q:"bullet_hit", explain:true}`
2. how vanilla uses it: MCP `mow_script_find {name:"bullet_hit", q:"tank"}`
3. write the handler in the unit's block (text, CRLF), then lint: MCP `mow_script_lint {mod:"<mod>"}`
   CLI `node tools/ialint/ialint.js <mod folder> [--game dir] [--exe as64|mowas_2|mowas2|goh] [-q] [--summary]`
4. one file while editing: MCP `mow_script_check {file:"<full path>", outline:true}`

## Events
- `spawn` entity created · `bullet_hit` a bullet meets a volume, before penetration (value = hit side) · `pierce` the bullet went through (not sent when the shell detonates)
- `break_armor` / `break_armor_again` an armour volume broke (sender `pierce` or `blast`) · `blast_hit` first blast hit per explosion · `blast` every part hit
- `contact` physics collision (value = speed) · `ground_hit` body meets ground or water (value negative)
- `break` / `repair` a vehicle part changes damage state · `fire "weapon"` a weapon place fires · `blow` melee
- quoted names `{on "name"}` are custom handlers: run by `{call}`, `{delay_effect}`, or by the game itself for a known list (`die`, `burn`, `burn_volume` ..)
- the full closed set is the tool's list (INT-23)

## Conditions
- `{if [not] COND args {..} else COND2 {..} else {..}}`: branches in order, first true wins
- no comparison operators, no and / or: a threshold is built into the word and always means "greater than"; AND = nest `{if}`, OR = chain `else` (INT-06)
- common: `tagged "t"` · `stuff "tags"` (the ammo or weapon has all tags) · `rand p` · `"flag"` · `volume "t"` · `min_energy N` · `effector "tags"` · `hit_side ..` · `component ..`
- ranges are `center [spread]`, not min max: `{delay 2 0.5}` = 1.5 to 2.5 s (INT-18)

## Per game
- as64 / mowas2: 29 events plus quoted names
- goh: adds `destroy`, `blast_wreaked`, `animation_event "name"`, `hatch open|close` (GHINT-17, GHINT-45); AS2 runs `break` where GoH runs `destroy`. ialint marks them INT_EVENT_UNKNOWN on AS2

## Silently fails
- an unknown condition word: fatal `unknown condition` at load; an unknown event: `unexpected token`
- INT-05 terrain event `bullet` never fires: use `hit` / `detonate`
- INT-07 `hit_side` without a bullet knows only front / back
- INT-24 `ground_hit` value is negative, so `min_energy` is likely never true: use `velocity` [I]
- INT-21 `fire "name"` with a place name the unit lacks never fires
- a condition whose context field is absent (no bullet, no volume) is simply false
- ialint: INT_EVENT_DUP, INT_HITSIDE_NOBULLET, INT_TERRAIN_BULLET, INT_GROUND_MIN_ENERGY

## Verify
- put `{con "mark"}` first in the handler (prints to the console and log), cause the event in game, find the mark in game.log, then remove it (→ skill `mow-mod-test`)

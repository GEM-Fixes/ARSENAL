# mow-mod-check-fix: interface data and interaction scripts (uilint, ialint)

when: a button shows no picture, a hotkey does nothing, a custom action crashes the game, "event already defined", "Number of tagged flags overflow", a `{call}` does nothing, PANEL_ / ACTION_ / KEYS_ / PICTURE_ / INT_ findings.

## Steps
1. MCP `mow_mod_check` (`mod`, `only: "uilint,ialint"`)
2. CLI interface: `node tools/uilint/uilint.js <mod folder> [--game dir] [--exe as64|mowas_2|mowas2|goh] [--mods a,b] [-q] [--summary]`
   set/panel_control (unknown item or condition, cell clash / overflow / range), interface/action (unknown instruction, missing button picture), keys.set (unknown token, wrong profile path, custom action with no hotkey), fonts
3. CLI interaction: `node tools/ialint/ialint.js <mod folder> [--game dir] [--exe as64|mowas_2|mowas2|goh] [--mods a,b] [-q] [--summary]`
   reads the interaction entity.set and effects.set trees with includes expanded; the handler set is global, not per entity
4. GUI: Mods tab > Check & Fix
5. fix: by hand at file:line. writing or changing script logic → see skill mow-mod-scripts; icons and panel content → skill `mow-mod-text-ui`

## Codes
| code | meaning | row |
|---|---|---|
| PICTURE_MISSING | button or icon picture not found | UI-03 |
| ACTION_INSTRUCTION_UNKNOWN | unknown instruction in a custom action: crash | UI-06 |
| PANEL_SPECIAL_UNLOADED | `right_special.set` is never loaded | UI-07 |
| KEYS_TOKEN_UNKNOWN | key token the engine does not know | UI-11 |
| INT_EVENT_DUP | `{on X}` twice with the same name and arguments in one block | INT-02 |
| INT_CALL_UNDEFINED | `{call "x"}` with no `{on "x"}` anywhere | INT-04 |
| INT_FLAG_OVERFLOW, INT_ABLE_OVERFLOW | more distinct flag names than the engine holds | INT-10 |
| INT_TERRAIN_BULLET, INT_USE_BLEND_TEX, INT_LOG_NOOP, INT_RTFUNC, INT_KICK_NOOP, INT_KILL_DELAY_EMPTY, INT_EXPLODE_TINY | review / info: dead or weak script lines | - |

## Per game
| | as64 | mowas2 | goh |
|---|---|---|---|
| uilint | yes; vanilla 0 findings | `--exe mowas_2` | GoH tables (GHUI-75/76/251); the full check skips uilint on GoH, run it alone with `--exe goh` (no `--game` = the GoH install); key names for bindings renamed (GHUI-36) |
| ialint | yes; vanilla 0 findings (15 dead-code hits as info) | same | GoH event set adds destroy, blast_wreaked, animation_event, hatch (GHINT-17/45) |

## Silent fails
- UI-03 a missing or misspelt picture: stub or nothing, no log line
- UI-07 editing `right_special.set` does nothing
- UI-11 an unknown key token in keys.set is ignored (action unbound); in a `.ps` `{on key}` the same slip is fatal
- UI-06 an unknown instruction in a custom interface action is a crash, not a warning
- INT-04 a call matches an event NAME, not an on-argument: `{call "hand_right"}` with only `{on fire "hand_right"}` does nothing
- INT-10 the 129th distinct flag name is fatal at load: use `tags`
- INT-02 a second identical `{on X}` in one block = error "event already defined"

## Verify
- re-run the two linters: no crash-class code; info rows read and accepted
- in game: open the panel, see the button picture, press the hotkey, trigger the event (→ skill `mow-mod-test`)
- ui/actions ui/keys-bind interaction/machine interaction/conditions · guide 11-interaction-scripts, 15-interface-and-icons, r09, r10

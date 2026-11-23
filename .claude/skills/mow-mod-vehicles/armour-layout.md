# mow-mod-vehicles: armour layout (which volume is which plate)

when: "which volume is the hull front", "where is this tank thin", "turret armour does not apply", "side skirts", "my thickness is ignored", "see the armour of a unit".
G = game install, `<mod>` = the user's mod folder (full path). MCP `game` = `as64|mowas2|goh`.
Changing thickness, durability and thresholds → skill `mow-mod-weapons-damage` (`armour-volumes.md`); the short way for one unit → skill `mow-mod-units` (`armour.md`). This file is how the layout maps to the model.

## Steps
1. plate by plate in mm and where it is thin: MCP `mow_unit_armor {unit:"<name or id>", mod:"<mod>"}`
2. the volumes behind it: MCP `mow_model_info {model:"<entity>", mod:"<mod>", show:["volumes"]}` (name, bone, tags)
3. the armour block that applies: MCP `mow_entity_info {names:["<entity>"], mod:"<mod>"}` (`armor` settings and the macro that wrote them)
4. a picture or a table: `node tools/armorsim/armorsim.js map <unit> [--view front|rear|left|right|top] [--game G --mods a,b] [--exe as64|mowas_2]` · `table <unit>` · one shot: `shot <unit> --weapon W --ammo A [--range M] [--from az,el]`
5. on paper against a gun: MCP `mow_matchup {attacker:"<unit>", target:"<unit>", range:300, mod:"<mod>"}`
6. GUI: Models & Sim tab > `models` page, Armour (`armor/table`, `armor/map`, `armor/shot`); not for GoH

## Mechanics
```
{armor {setting "turret"
   {thickness 100 45 45 30}      ; front side rear top
   {volumes "turret*" "gun*"}    ; wildcard against each volume's FIRST tag; none = every volume
   {durability ..} {threshold ..}}}
```
- an armour AREA (`setting`) groups volumes by name pattern; the first matching area wins for a volume
- a non-zero side value in the area overrides that volume's own `{thickness}` on that side
- which SIDE a hit counts as comes from the volume: box faces, or the side id stored per triangle in a `.vol`; left and right both read the side value, top and bottom the top value
- a volume moves with its bone: turret plates must be volumes on the turret bone
- a volume needs `able blast` to take blast at all
- vanilla sets most armour through class macros with arguments; read the flattened result, not the macro name

## Per game
- as64 / mowas2: armorsim and `mow_unit_armor` use the simulator
- goh: `mow_unit_armor` answers the values of the unit files; armorsim refuses goh (exit 2); GoH data differs in keys:

## Silently fails
- GPL-04 / KEY-16 where the macro sets a side, per-volume plates on that side are ignored
- FMT-07 a def volume the model lacks is dropped with its armour
- an area pattern that matches no volume's first tag: the setting applies to nothing, no message
- FMT-06 a `.vol` triangle with a side id outside 1..6 reads the wrong side [T]
- KEY-03 / GPL-01 no `able blast` = immune to HE
- KEY-14 volume key `hollow` is registered and ignored
- GPL-05 a huge `pierce_dur` means AP never breaks the area

## Verify
- `mow_unit_armor` shows the intended plates; `mow_matchup` or `armorsim shot` gives the expected result from front, side and rear; then the same shots in game (→ skill `mow-mod-test`; proof of a shot → skill `mow-mod-weapons-damage` `in-game-shot-proof.md`)

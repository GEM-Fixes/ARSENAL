# mow-games: `mod.info`, the version gate, Classic / Enhanced
When: "which game is this mod for", "why is it refused here and not there", "what version do I write".

## Steps
1. `mow_mod_info {game: "as64", mod: "<path>"}` (range, required mods, the check for that game); repeat with the other game.
2. `mow_mod_check {game: "goh", mod: "<path>"}` (load verdict).
CLI: `node tools/modinfo/modinfo.js <mod> --exe as64|mowas2|goh` · `node tools/wouldload/wouldload.js <modDir> --exe as64,mowas2,goh`.
GUI: Mods > Mods (mod card); Mods > Check & Fix > Read Game.log > "Why is my mod not in the list?".

## Facts
- keys AS64, MoW:AS2: Name Desc MinGameVersion MaxGameVersion Delete Require FileId, one quoted string each. VFS-49 [V]
- AS64, MoW:AS2: no Min/Max = refused with no message; an old-style range must hold data version 3.262. PORT-48 VFS-19 [V]
- AS64: Classic mode = old mods; Enhanced = `as64+` plus mods with MinGameVersion 3.301 or more (no Max check). Never mixed; switching empties the enabled list. VFS-47 VFS-48 ENG-26 [V]
- MoW:AS2: a 3.301 mod is off there.
- GoH: the range must hold the exe version on the 1.x scale; AS2 3.x ranges are refused; `Tags "develop"` lifts the check; no mode check. PORT-43 PORT-46 PORT-50 GHVFS-01 GHVFS-02
- one bad `mod.info` stops AS64 and MoW:AS2 at start. ENG-24 [V]
- typos and unknown keys are silent. VFS-20 [V]. `Delete` needs the `resource/` prefix. VFS-21 [V]

## Which game is a mod for (quick read)
| in `mod.info` | made for |
|---|---|
| Min below 3.301, Max 3.262 or more | MoW:AS2, AS64 Classic |
| Min 3.301 or more | AS64 Enhanced only |
| range on the 1.x scale | GoH |
The folders tell too: `localizations/` and `entity/-vehicle/<nation>/` = GoH.

## What goes wrong
- the range edited to "make it load" in another game: the data does not fit; use skill `mow-mod-port` or `mow-mod-check-fix` (upgrade).
- one mod folder meant for both AS64 modes: there is no such range.

## Check
`modinfo` for the target game reports no finding; the game lists the mod.

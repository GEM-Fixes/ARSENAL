# mow-play-setup: AS64 Classic or Enhanced, what `as64+` is
When: the game is AS64 and the person asks about the two modes, `as64+`, "made for X mode: not applied", or why the mod list emptied.

## Rule (AS64 only)
- two modes that never mix. VFS-47 VFS-48 ENG-26 [V]
- Classic = old mods (MinGameVersion below 3.301): mods written for the original Assault Squad 2.
- Enhanced = the built-in mod `as64+` plus mods made for AS64 (MinGameVersion 3.301 or more; no Max check).
- a mod of the wrong mode is "not applied"; mixing can crash before the fonts load. Switching mode empties the enabled list.

## Steps
1. Which mode is a mod for: `mow_mod_info {game: "as64", mod: "<path>"}` (Min 3.301 = AS64 only).
2. What is on now: `mow_game_status {game: "as64"}`.
3. Enhanced list: `mow_mods_enable {game: "as64", mods: ["as64+", "new_mod"], dry: true}`. Classic list: old mods only, no `as64+`.
4. An old mod wanted in Enhanced: it must be upgraded by its author (skill `mow-mod-check-fix`, upgrade); do not just edit its version line.

## CLI
`node tools/modinfo/modinfo.js <mod> --exe as64` · `node tools/modswitch/modswitch.js --game <dir> --exe as64` (flags MOD_MODE mix-ups) · plan an upgrade: `node tools/upgrade/upgrade.js <modDir> --to as64 --plan`.

## GUI
Mods > Upgrade or Port (`run upgrade`, plan first); Mods > Check & Fix > Read Game.log > "Why is my mod not in the list?".

## Per game
- MoW:AS2: no modes; a 3.301 mod is simply off there. The enabled list is shared with AS64, so an Enhanced list confuses MoW:AS2.
- GoH: no such modes; its own version scale.

## What goes wrong
- crash before the menu after enabling a mod: wrong-mode mix. Start in safe mode (no mods), enable one mode's mods only.
- multiplayer: Classic never joins Enhanced; everyone picks the same mode.
- the person thinks `as64+` is a download: it is built in.

## Check
`node tools/modswitch/modswitch.js --game <dir> --exe as64` shows no MOD_MODE line; the log header lists the mods as applied.

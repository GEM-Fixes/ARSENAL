# mow-play-setup: turn mods on or off
When: "how do I enable it", "is my mod active", "turn all mods off".

## In the game (AS2, AS64)
Options -> MODS. Left = off, right = on. Select the mod, `>>`, Apply (about 30 s, no restart). Menu buttons need a double click. Never press Delete there: it removes the mod., TST-01

## By tool
1. Now: `mow_game_status {game: "as64"}` (enabled mods in load order).
2. Plan: `mow_mods_enable {game: "as64", mods: ["as64+", "my_mod"], dry: true}`.
3. Do it (game closed, user said yes, env `ARSENAL_ALLOW_LAUNCH=1`): the same call without `dry`. Empty `mods` = all off. `restore: true` puts back the list from before the first change. `force: true` only when the user accepts the wrong-mode warning.

## CLI
`node tools/modswitch/modswitch.js --game <dir> --exe as64|mowas2|goh --set a,b` (dry run; `--write` only with the game closed, keeps a backup; `--restore` puts the first list back). Send a list to a friend: `--export f.json`, the friend `--import f.json`.

## GUI
Mods > Check & Fix > Read Game.log > "What the game has switched on" (`logs/enabled`); Test, Share & Play > Play > test profile card.

## Proof it is on
- AS2 pair: the `{mods` block of the profile's `options.set`. The AS2 log does not name local mods. TST-02 [V]
- AS64: the log header lists `Mod 'x' from` lines. LOG-17
- GoH: the log says `Mod: activate mod <folder>`.

## Per game
- AS64 and MoW:AS2 share ONE enabled list (one profile). LOG-20 [V]. A list set for AS64 Enhanced (`as64+` first) is wrong for MoW:AS2.
- AS64: switching between Classic and Enhanced empties the enabled list. VFS-48 [V]
- GoH: mods are switched in its own menu; `mow_mods_enable {game: "goh"}` edits its list the same way (game closed).

## What goes wrong
- folder renamed after enabling: its line is dropped from the list; turn it on again. TST-13 [V]
- Apply pressed with the game mid-load: wait for the menu.
- first start after changing mods mounts for a long time (tens of seconds; minutes for a very large mod); the second start is fast. LOG-18 [V]. Not a fault.

## Check
`mow_game_status` lists the mod at the place you set; in the main menu the mod's content shows (a unit, a map, a text).

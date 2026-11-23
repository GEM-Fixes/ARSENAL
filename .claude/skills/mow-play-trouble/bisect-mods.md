# mow-play-trouble: the log shows nothing, find the mod by halving
When: a fault with no clear log line, or several mods on and no culprit.

## Steps
1. Note the list now: `mow_game_status {game}` (keep the order).
2. All mods off. AS2 Steam dialog "Safe mode (no mods)" (= `-no_mods`, VFS-30), or Options -> MODS. Fault gone -> a mod causes it. Still there -> install or `mod.info` problem (`will-not-start.md`).
3. Turn on the first half of the list (keep required parents with their children). Fault back -> it is in that half; else the other half.
4. Halve again until one mod is left. Then that mod with each other mod, to see a pair fault.
5. By tool (game closed, user's yes, env `ARSENAL_ALLOW_LAUNCH=1`): `mow_mods_enable {game: "as64", mods: ["a", "b"], dry: true}`, then without `dry`; at the end `mow_mods_enable {game: "as64", restore: true}`.
6. A pair: `mow_mods_clash {game: "as64", mods: ["a", "b"]}` names what they both change.
CLI: `node tools/modswitch/modswitch.js --game <dir> --exe <game> --set a,b` (`--write` with the game closed; `--restore`). GUI: Test, Share & Play > Share > Mods together.

## Rules
- a mod that names another in `Require` is skipped without it: move pairs together. VFS-17 [V]
- AS64: Classic and Enhanced mods never mix; bisect inside one mode; `as64+` stays first in Enhanced. VFS-48 [V]
- each change of the list makes the next start slow once. LOG-18 [V]
- step 7 is this method.

## Per game
- AS64 and MoW:AS2 share the list: a bisect on one changes the other.
- GoH: switch mods in its own menu or `mow_mods_enable {game: "goh"}`; the log names each activated mod.

## What goes wrong
- the order changed while halving: a load-order fault then hides. Keep the order.
- a save or replay used as the test: it needs its own mods; test with a new skirmish.
- stopping at the first suspect: confirm by turning only that mod on.

## Check
Fault with the one mod (or pair) on, none without; the original list restored.

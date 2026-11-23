# mow-play-singleplayer: direct control
When: "how do I drive the tank myself", "aim by hand", "what does the number at the crosshair mean".

## Steps
1. The person's keys: `mow_settings_info {game: "as64", what: "keys", filter: "control"}`.
2. Manual defaults: select one unit, `E` takes direct control; `W` `S` `A` `D` move; left mouse fires; right mouse next weapon; `Space` next ammo type.
3. Will this shot go through: `mow_matchup {game: "as64", attacker: "<my unit>", target: "<their unit>", range: 300}` (per side and range).
CLI: `node tools/keyprof/keyprof.js --file <keys.set> --list`. GUI: Units > Unit Stats.

## What the screen shows
In direct control the reticle shows the distance and the penetration of the loaded shell at that distance. Compare it with the target's armour: `mow_unit_armor {game: "as64", unit: "<target>"}`.

## Rules
- direct control aims where you point; the gun's spread, the shell's flight and the armour rules stay the same as for the AI (limits DMG, GPL).
- one unit at a time; the rest of the army keeps its orders.
- works in single player and multiplayer on AS2.

## Per game
- MoW:AS2: the same keys (shared profile).
- AS64: aim motion was changed; it can feel different on the same tank.
- GoH: a damage factor applies under direct control (GHDMG-21 GHDMG-22, not yet tried in game); key names differ (GHUI-36).

## What goes wrong
- `E` does nothing: several units selected, or the profile binds another key.
- the shell falls short: the reticle distance is to the point under the cursor, not to the hull.
- "it said it penetrates": angle and the hit part decide too; skill `mow-play-coach` (why no penetration).

## Check
The key from `mow_settings_info` takes control of a selected tank; the reticle shows distance and penetration.

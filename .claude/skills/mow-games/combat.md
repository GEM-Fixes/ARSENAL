# mow-games: combat rules
When: "is armour the same in GoH", "does veterancy work the same", "why does the same tank behave differently".

## Steps
1. A real shot: `mow_matchup {game: "as64", attacker: "<unit>", target: "<unit>", range: 300}`; GoH: `mow_matchup {game: "goh", ...}` answers what it can and says what it cannot.
2. Armour by side: `mow_unit_armor {game, unit: "<unit>"}`.
3. A GH row: `mow_limit {game: "goh", ids: ["GHDMG-37"]}`.
CLI: Â. GUI: Units > Unit Stats; Units > Balance.

## Shared base
Penetration table by range, armour thickness with slope, blast and fragments: limits DMG, GPL, MOV, HUM, AI;, gameplay.

## Where GoH changes it (not yet tried in game)
| area | GoH | rows |
|---|---|---|
| parts | hit points per part | GHDMG-04 GHDMG-05 |
| piercing | damage after a pierce | GHDMG-25 |
| thickness | extra effective-thickness factors (as64 reads none: DMG-20) | GHDMG-37 GHDMG-38 GHDMG-39 |
| cover | a cover roll | GHDMG-23 |
| direct control | damage factor | GHDMG-21 GHDMG-22 |
| blast on soldiers | changed | GHDMG-33 |
| repair, kits | changed | GHGPL-22 GHGPL-23 |
| fuel | changed | GHGPL-27 |
| veterancy | 0..8 (AS2 0..5: HUM-17) | GHHUM-07 |
| squad size | 12 (AS2 10) | GHGPL-04 |
| speed | Slow/Normal/Fast inside `Locomotion`; crew count scales top speed (AS2: MOV-06) | GHMOV-44 GHMOV-46 |

## AS64 against MoW:AS2
Same data rules. AS64 changes aim motion (IK), has no FPS cap, and its multiplayer step floor differs, NET-12).

## What goes wrong
- the armour simulator asked about GoH: GUI Models > Armor on the GoH tab answers one plate at an angle (guns, shells, shot, effects, map) from GoH data and notes, not tested in game [T]; it names the rules it leaves out. The armorsim CLI and the 3D shot stay AS2 only.
- an AS2 number (veterancy bonus, squad size) told to a GoH player.
- a GH row quoted as tested.

## Check
The answer says which game's rules it used; skill `mow-play-coach` for the explanation to a player.

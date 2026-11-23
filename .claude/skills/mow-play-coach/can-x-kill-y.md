# mow-play-coach: can gun X go through vehicle Y
When: "can my X kill their Y", "from how far", "from which side", "where is it thin".

## Steps
1. Names: `mow_unit_find {game: "as64", q: "panther"}` (also `army`, `kind: "vehicle"`).
2. The shot: `mow_matchup {game: "as64", attacker: "pz5g", target: "t34_0", range: 400, mod: "<mod folder>"}`. A gun in place of a unit: `gun: "75mm_kwk42"`; a shell: `ammo: "bullet75 apcr"` (default: the gun's first armour-piercing shell). Answer: front, side, rear, share of hits that go through, furthest range that works.
3. Plates only: `mow_unit_armor {game: "as64", unit: "t34_0", mod: "<mod>"}` (mm per plate, where it is thin).
4. Guns, shells, armour, price of one unit: `mow_unit_stats {game: "as64", id: "pz5g", mod: "<mod>"}`.
5. Run it both ways (can Y shoot back through X's front) and at two ranges: the answer is a range band.

## CLI
- `node tools/armorsim/armorsim.js shot <unit> --weapon "<gun>" --ammo "<tags>" --range <m> --from <az>,<el> --game <dir> --mods a,b --exe as64|mowas_2` (az 0 = front, 90 = left side).
- whole face: `node tools/armorsim/armorsim.js map <unit> --view front|rear|left|right|top ...`; plates: `armorsim.js table <unit>`.
- sheet: `node tools/statsheet/statsheet.js <gameDir> --exe as64|mowas_2|goh --mods a,b --sheet weapons,ammo,armor,price --filter <name regex>`.

## GUI
Models & Sim > Models > Armour (not GoH): `gui_open {page: "models"}`; routes `models/armor/shot`, `armor/map`, `armor/table`.

## Rules behind the answer (AS2 + AS64)
- penetration = a table of mm at set distances per gun and shell, straight line between points, nothing past range + 5 m. GPL-03 DMG-02 [V]
- the plate counts thicker the more the shot slants, capped at 10 times. DMG-03 [V]. A big shell against a thin plate loses most of that slope bonus (overmatch).
- front, side, rear, top is baked into the model face that was hit, not worked out from where the gun stands. DMG-05 [V]
- a hull has several plates (upper and lower front), so "front armour" is not one number. DMG-25 [V]
- a kill is crew out or parts destroyed, not a health bar: vehicles have no health. DMG-26 DMG-27 [V]

## Per game
- MoW:AS2: same as AS64; pass `game: "mowas2"`.
- GoH: armorsim refuses GoH (exit 2). `mow_matchup {game: "goh"}` = flat comparison of penetration against plate thickness; `mow_unit_armor` = the values of the unit files. Add the GoH formula rows (GHDMG-25, GHDMG-37) and say "not yet tried in game estimate, not tested in game". More: `goh-damage-repair.md`.

## What goes wrong
- vanilla numbers quoted under a balance mod: pass `mod`.
- one metre given as the limit: the trace varies with the hit point; give a band.
- "side" assumed from where the gun stood: a corner shot hits whichever face the ray enters.
- the tool gave no number: say that, give the rule, offer the test match (skill `mow-mod-test`, edrun pair on AS64).

## Check
In game, direct control shows the gun's penetration at that range right of the reticle and the enemy's armour when aiming at it: compare with the tool's number.

# mow-play-coach: repair, fuel, ammo supply, capture
When: "how do I repair", "out of fuel", "out of ammo", "can I take that tank".

## Steps
1. What the unit carries: `mow_unit_stats {game, id, mod}` (inventory: repair kit, fuel, shells).
2. The rule: `mow_lookup {query: "repair kit", mode: "words"}` Â; GoH `mow_limit {game: "goh", ids: ["GHGPL-22"]}`.
3. Keys: `mow_settings_info {game, what: "keys", filter: "repair"}` (the player's own bindings win over defaults).
GUI: Units & Balance > Units > Equipment card for what a unit carries.

## AS2 + AS64 (manuals and community notes, [I] unless a row is named;
- repair: a crew member with a repair kit; red zones on the blueprint are field-repairable, grey are not. A red hull can still be fixable. DMG-27 [V]
- fuel and shells are inventory items: carried by supply trucks and crates, moved by hand through the inventory (`X`, then click the vehicle or body). A flashing red icon = out of ammo.
- squads share ammo; vehicle ammo shows left, personal right on the panel.
- capture: empty the vehicle (big HE can kill the crew and leave the tank whole [V in game]), then crew it. Bots never re-crew a bailed vehicle. AI-13 [V]
- a towed gun cannot fire while towed. GPL-17 [I]
- default keys in one custom profile: `Ctrl+R` repair, `Ctrl+E` leave vehicle, `Ctrl+D` attach gun, `X` examine. Bindings differ per profile: read them with the tool.

## GoH (not yet tried in game)
- repair needs a kit in hand and also mends damaged (not only broken) parts; time by health lost. GHGPL-22 GHDMG-09 GHGPL-03
- the kit is looked for within 20 m. GHGPL-23
- supply zones give fuel and repair resources. GHGPL-27 GHGPL-28
- a captured vehicle no longer refunds its buyer. GHGPL-13

## Per game
MoW:AS2 = AS64 here. GoH differs as above.

## What goes wrong
- repair steps given as engine fact for AS2: they are from manuals; say "as the manual has it".
- key names quoted from memory: the profile's `keys.set` wins (UI-13 [V file]); read it.
- "capture gives money back": not in GoH (GHGPL-13).

## Check
In game: the blueprint colours after a hit; the inventory window of the truck.

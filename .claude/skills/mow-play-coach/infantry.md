# mow-play-coach: infantry rules
When: "why are my men pinned", "what does veterancy do", "why can he not go prone", "why do they not shoot".

## Steps
1. The soldier or squad: `mow_unit_find {game, q, kind: "squad"}`, then `mow_unit_stats {game, id, mod}` (members, kit, price).
2. The rule below; read the row: `mow_limit {ids: ["HUM-09"]}` Â.
3. More: `mow_lookup {query: "humans morale", mode: "topic"}`.
GUI: Units & Balance > Units > Equipment card (`units/kit`).

## Rules (AS2 + AS64)
| question | rule | row |
|---|---|---|
| pinned / suppressed | no suppression in the engine; morale only | HUM-09 [V] |
| morale recovery | blocked for 10 s after a hit | HUM-10 [V] |
| bleeding | script data, engine only sets a mark; player units only in one script set | HUM-05 [V] GPL-12 [I] |
| veterancy stacking | highest rank only, ranks 0 to 5 | HUM-17 [V] |
| skill level missing in a mod | soldier gets TOP level (silent buff) | GPL-13 [V] |
| cannot go prone | carrying a 1 or 2 hand item | HUM-28 [V] |
| walks instead of runs | heavy carry forces walk | HUM-04 [V] |
| stamina perks | perks cannot reduce stamina drain | HUM-02 [V] |
| body armour | the armour value belongs to the holder slot, not the item | HUM-24 [V] |
| cover seek unreliable | AI cover seek does nothing 30% of calls | AI-17 [V] |
| shoot only inside range | soldiers you control shoot only inside weapon range; AI soldiers also try beyond it | AI-09 [V] |
| launcher men ignore infantry | no HEAT at infantry on their own | AI-10 [V] |
| direct-control-only actions | ammo-drop grenade, radio signal, plain flamethrower | GPL-16 [I] |
| towed gun silent | cannot fire while towed | GPL-17 [I] |

## Playing advice (manuals, [I];
Squads share ammo; the commander hands it out. Every soldier has a real inventory: loot bodies and vehicles (`X`, then click). Shift+click squad icons merges squads.

## Per game
- MoW:AS2: same rows.
- GoH: ranks 0 to 8 (GHHUM-07); squads up to 12 men, AS2 10 (GHGPL-04); cover and crawling scale damage and add a hit chance roll for bullets (GHDMG-23); soldier damage per body volume, own factor in direct control (GHDMG-21 GHDMG-22). Not yet tried in game.

## What goes wrong
- "suppression" explained as a mechanic: it is morale; say so.
- kit lists quoted from memory: read `mow_unit_stats`; mods change them.
- bleeding and medic rules given as engine fact: script data, differs per mod.

## Check
The squad's card in `mow_unit_stats`; in game the soldier panel (health red, stamina blue, stars per weapon type).

# mow-play-multiplayer: team play
When: "how do I talk to my team", "give my tank to an ally", "who should buy what".

## Keys and clicks (read the person's own bindings first)
1. `mow_settings_info {game: "as64", what: "keys", filter: "chat"}` -> the chat keys of this profile.
2. Manual defaults: `I` team chat, `O` chat to all, `F1` statistics, `E` direct control.
3. Give selected units to an ally: the button in the upper right of the screen.
CLI: `node tools/keyprof/keyprof.js --file <keys.set> --list`. GUI: Tools & Settings > Settings.

## Split the work (advice built on tool answers)
1. What each army is good at: `mow_army {game: "as64", army: "ger", class: "tank"}`, `mow_army {game: "as64", army: "rus", class: "art"}`.
2. Who answers an enemy unit: `mow_unit_counter {game: "as64", unit: "<enemy unit>", army: "usa"}` for each team mate's army.
3. Agree before the start: who holds which flag, who buys anti-tank guns, who saves for armour.

## Rules
- one budget per player; nothing is pooled. Units, not money, are handed over.
- friendly fire is a lobby option; with it on, own shells and mines kill allies.
- a player who leaves hands the units to the host (AS2, AS64: NET-05 [V]) or to team mates (GoH: GHNET-80).
- the match runs at the slowest player's pace. NET-12 [V]
- pause: single player only on AS2 (`Pause` key); GoH lets only the host pause (GHNET-05).

## Per game
- MoW:AS2 and AS64: the same keys (one shared profile).
- GoH: key names differ (GHUI-36); read them with `mow_settings_info {game: "goh", what: "keys"}`.

## What goes wrong
- chat typed to all instead of the team: two different keys.
- units given away by mistake: the ally must give them back; there is no undo.
- three players buying the same class: nobody holds the infantry line.

## Check
A test line in team chat is seen by allies only; a handed-over unit shows the ally's colour.

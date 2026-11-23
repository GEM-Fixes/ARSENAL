# mow-play-singleplayer: difficulty levels
When: "what does hard change", "is the AI smarter on heroic", "which level should I pick".

## Steps
1. The rows: `mow_lookup {query: "difficulty", mode: "words"}` Â.
2. The files of a game or mod: `mow_file_which {game: "as64", path: "resource/set/difficulty/normal.dl", mods: []}` (lists which copy is read; file names from `set/difficulty/`).
3. Bots in a lobby: `mow_bots_info {game: "as64"}` (their levels).
GUI: Mods > Mod Editor (open `set/difficulty`).

## Rules (AS2, AS64)
- single player: the `set/difficulty/*.dl` files scale armour per unit group; your shots and the enemy's are judged against scaled armour on the order of steps).
- multiplayer: the factor is 1; difficulty files do not apply.
- lobby bots: the level (easy to heroic) sets the bot's money, not its tactics.
- AS2 ships 5 difficulty files; data mods may name `dl_<difficulty>` blocks (SDL-25).

## Per game
- MoW:AS2: the same files.
- GoH: 6 difficulty files (PORT-194); Conquest stores its difficulty in the save and adds a vehicle health factor (GHCQ-33 GHCQ-34 GHCQ-35, not yet tried in game).

## How to say it
"Higher difficulty makes enemy armour count for more and yours for less in missions; it does not make the enemy think better. Numbers depend on the mod."

## What goes wrong
- a penetration answer from `mow_matchup` taken as exact for a hard mission: the tool computes the factor-1 case; say so.
- exact factors quoted: read the mod's own `.dl` file.
- difficulty changed mid mission: it is read at mission start.

## Check
The mission's difficulty in the menu is the one the person meant; the mod's `set/difficulty` copy is the one `mow_file_which` names.

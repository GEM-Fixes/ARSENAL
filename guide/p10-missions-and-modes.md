# Missions and multiplayer modes

A multiplayer game mode is two things that must match: a **game card**, the rule file `set/multiplayer/games/<mode>.set`, and a **mode file** in each map, `map/multi/<map>/<mode>.mi`, which places spawn points and flags. This page shows how to give a map another mode, change the starting money and army size, and check a mission before you play it.

## You need

- A mod folder, and a map: a vanilla one or your copy from [Copy and change a map](p09-copy-and-change-a-map.md).
- The game folder known to ARSENAL.
- A text editor, or the Editor page (tab IDE), for hand changes to `.mi` files.

## The quick way

In the [Quick Guided Task](p17-quick-guided-task.md) row above the tabs, set "I want to" to **make** and choose **a multiplayer game mode**, or to **change** and choose **the rules of a multiplayer game mode**. The task asks for the mode to copy, the name in the lobby, the sides, the goals, the rules of the match, new units to buy, teams and alliances, and money and buy limits, and shows the mission file in the Editor. It writes after a review, then checks. It works under the 64-bit build only.

## Steps

1. **See which modes a map has.**
   In the window: the Maps page list has a "Game modes" column and a "Game mode" filter.
   On the command line: `ARSENAL maps list`, or `ARSENAL maps list --map map/multi/<map>`.

2. **Add a mode to a map.**
   In the window: on the Maps page, pick the map, choose the "Game mode" under "2. Make my copy", press "Preview (writes nothing)", then "Write the copy". The modes are:
   - `combat`: two teams fight until one side runs out of points or units; spawn points only.
   - `battle_zones`: teams capture flag zones and earn points while they hold them.
   - `captureflag`: one flag in the middle; hold it long enough to win. It needs two capture areas.
   On the command line:
   ```
   ARSENAL maps mode --map map/multi/<map> --from combat --to battle_zones --out <mod folder> --dry-run
   ```
   Remove `--dry-run` to write. Between `combat` and `battle_zones` the flag points are added or removed; for `captureflag` a centre flag and its ring are added. Other modes, such as `frontline`, are copied as they are and marked as needing hand work.

3. **Make a mode with a new name (command way only).**
   ```
   ARSENAL mission-clone --game <game folder> --map map/multi/<map> --from combat --to <new> --with-mode <new> --title "My mode" --out <mod folder> --dry-run
   ```
   `--with-mode` (the same name as `--to`) writes a new game card based on an existing mode, the map's info entry and the lobby title. The new mode plays by its base mode's rules; it registers, lists the map in the lobby and hosts. Whether the lobby shows its title correctly is unconfirmed. A mode cloned from `combat` gets bots switched on unless you add `--no-bots`.

4. **Write a `captureflag` mission from numbers (command way only).**
   `ARSENAL misgen --map <map folder> --spec spec.json` writes `captureflag.mi`, `captureflag.info` and the two capture areas into the map's `map` file, from one flag position and zone, the spawn points of each side (the same number on both) and optional times. `ARSENAL misgen --check <map folder>` reports a missing area, flag, spawn or key.

5. **Change starting money and army size.**
   In the window: on Game Modes & AI > Game Modes, section "Multiplayer start settings", pick the "Preset file" ("Competitive presets", "All-units presets", "Custom (user) presets" or "Test presets"), find a preset with "Show only names containing", and change "Start money", "Top money", "Army size cap (command points)" or "Seconds to grow from start to top". Press "Preview changes", then "Write into my mod". "Back to stock (remove my copy)" undoes it.
   On the command line: `ARSENAL patch-entity <mod folder> --game <game folder> --file set/multiplayer/games/presets_user.inc --set <path>=<value> --dry-run`.

6. **Write triggers and commands.**
   Edit the map's `.mi`; [chapter 12](12-missions-and-multiplayer-setup.md) and reference page [r11](r11-mission-files.md) describe them.

7. **Check the mission.**
   In the window: Maps page, "Check now".
   On the command line: `ARSENAL milint <mod folder> --game <game folder>`. It compares the game card with the `.mi` and checks player counts, presets, budgets, unit sets, bot orders and mission commands.

8. **Play it.**
   In the window: the Play page, with `multi/<map>:<mode>` in the "Map" field.
   On the command line: `ARSENAL play <mod folder> --map multi/<map>:<mode> --dry`, then without `--dry`. For two players on one computer, start the 64-bit build with `-instance N` (N from 1 to 9); each instance keeps its own settings and `game.log`.

## What can go wrong

- **The map is missing under the mode.** The `.mi` name must match a game card, or the log says `Mission '...' is skipped - game type(...) is undefined`.
- **`captureflag` crashes at the start** with `Clipper 'captureflaga' is not found!` when the capture areas `captureflaga` and `captureflagb` are missing. Use a map that has them, add them in the editor, or use `misgen`.
- **A copied `frontline` or custom mode** needs hand work on its phases and spawn chains.
- **Tool-placed flags** sit at a computed spot; whether they capture as expected is unconfirmed.
- **`minTeamPlayers` and `maxTeamPlayers` are not read.** Player counts come from `map.info`, rounded up to even.
- **Payback lists** need tabs between values and lists of equal length.
- **A unit set that only excludes** matches nothing.
- **`{#` in a `.mi` does not comment out.** Use `;`.
- **Your copy of a preset file replaces the whole file.** If another mod changes it too, only the later mod wins.
- **Multiplayer:** every player needs the same game cards, maps and mod order. Lua and model files are compared by size only, so a same-size change goes out of sync during play.

## In Gates of Hell
<!-- goh: GHMIS-70 GHMIS-71 GHMIS-74 GHMIS-76 GHMIS-94 GHMIS-95 GHMIS-98 GHCQ-03 GHCQ-21 -->

The Gates of Hell notes in this book have not been tested in a running game. Check them in your own game before you depend on them.

- **ARSENAL under the GoH button** has both tabs, with less in them: Missions compares the missions of a Gates of Hell map but cannot add a game mode to it, and Game Modes reads the Gates of Hell mode cards and changes bot difficulty and start money but cannot allow bots in a mode. The game mode task of the Quick Guided Task is greyed. Edit Gates of Hell mode files by hand.
- **Game cards.** Gates of Hell keeps them in `set/multiplayer/games/` too: `ammunition`, `battle_zones`, `campaign_capture_the_flag`, `cooperative`, `evacuation` and `frontlines`, with the presets in `set/multiplayer/games/presets/` (early, mid and late presets, battle zones, frontlines, last stand and alliances).
- **Mode names differ.** The `frontline` mode is called `frontlines` in Gates of Hell, and `combat` is not a mode there. `koth`, `ammunition`, `heroes`, `campaign_capture_the_flag`, `evacuation` and `guerrilla` exist only in Gates of Hell; a game card for one of them makes no game in Assault Squad 2.
- **New game card settings:** `loseOnZeroPoints` (a team at zero points loses), `pauseDuringPreparation` (default on; off lets the battle run during `preparationTime`), and `waveTime` and `firstWaveTime` for `evacuation` waves. `allowRejoin` is not read.
- **Rounds.** A `frontlines` card without `rounds` probably plays one round in Gates of Hell, where Assault Squad 2 plays two (not confirmed).
- **Conquest,** Gates of Hell's own campaign, reads `set/dynamic_campaign` and fights its battles in `campaign_capture_the_flag` against bots. Assault Squad 2 has nothing like it.
- **Copying a Gates of Hell mode into Assault Squad 2:** see the `mapport` and `mission-clone` notes in [Copy and change a map](p09-copy-and-change-a-map.md#in-gates-of-hell).

## More

- Detail: [chapter 12, Missions and multiplayer setup](12-missions-and-multiplayer-setup.md) ([how a game mode is assembled](12-missions-and-multiplayer-setup.md#1-how-a-game-mode-is-assembled), [presets](12-missions-and-multiplayer-setup.md#2-presets), [budgets](12-missions-and-multiplayer-setup.md#3-budgets-and-income), [staying in sync](12-missions-and-multiplayer-setup.md#10-how-multiplayer-stays-in-sync), [Gates of Hell summary](12-missions-and-multiplayer-setup.md#gates-of-hell-summary)), [chapter 13, Maps](13-maps.md), [chapter 17, Balance, pricing and gameplay](17-balance-pricing-gameplay.md). The window: [chapter 19, Quick Guided Task](19-toolchain.md#quick-guided-task).
- Reference: [r11, Mission files](r11-mission-files.md) (the [game mode card](r11-mission-files.md#10-game-mode-card), [`preparationTime`](r11-mission-files.md#preparationtime), [presets](r11-mission-files.md#11-presets-and-team-data), [budgets](r11-mission-files.md#12-budgets), [`payback`](r11-mission-files.md#payback)) and [r12, Bot Lua and console](r12-bot-lua-and-console.md) ([`-instance`](r12-bot-lua-and-console.md#-instance)).
- Before: [Copy and change a map](p09-copy-and-change-a-map.md). Next: [Bots](p11-bots.md).

<!-- Author: Imperator_Aug (ARSENAL) -->

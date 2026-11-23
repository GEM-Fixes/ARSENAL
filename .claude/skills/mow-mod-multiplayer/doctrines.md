# mow-mod-multiplayer: doctrines

when: "doctrine", "add a doctrine", "doctrine list is empty", "unit only for one doctrine", "doctrines in Assault Squad 2", "No doctrines found", "port GoH doctrines".
G = game install, `<mod>` = the user's mod folder (full path). MCP `game` = `as64|mowas2|goh`.
Bot "doctrine" (what bots buy) is a different thing → skill `mow-mod-ai-bots`.

## Steps
1. does the game have them: MCP `mow_game_diff {game:"goh", other:"as64", key:"feature"}` · rows:
2. GoH, what a doctrine offers: MCP `mow_army {army:"<army>", doctrine:"<doctrine>", mod:"<mod>"}`
3. GoH, one unit's doctrine: MCP `mow_unit_stats {id:"<id>", mod:"<mod>"}` (card `doctrine`)
4. as64 / mowas2, the nearest thing: an era or unit-set choice → `presets-limits.md` and `buy-list-and-armies.md` in this skill
5. lint: MCP `mow_mod_check {mod:"<mod>"}`

## Facts → [not yet tried in game]
- GHMIS-88 the lobby doctrine list = the `doctrine` values of the units that carry the mode's unit mode tag and the army, in unit order; a DLC doctrine is filtered by ownership; the random army has none
- GHGPL-05 the buy bar shows a unit only when it is enabled, for sale, and the player's doctrine matches the card's `doctrine` (an empty `doctrine` = every doctrine)
- GHGPL-09 with a unit mode other than "all", the lobby army list holds only "random" and armies that have a doctrine in that unit mode
- GHNET-30 the chosen doctrine travels in the session card per member
- GHMIS-58 bots check the same thing through `BotCommands.IsUnitAvailable`
- so a GoH doctrine is not a file of its own: it is a value on unit cards, and the list builds itself

## Per game
- goh: as above; add a doctrine by giving units a new `doctrine` value plus its text key (→ skill `mow-mod-text-ui`)
- as64 / mowas2: NO doctrine system in the engine. what works instead [V mission/mp-preset]:
  - extra `unitMode` presets with their own `unitset` (the player picks a "doctrine" as the era dropdown; it applies to everyone in the match)
  - per-team presets `teams {a {} b {}}` for asymmetric sides
  - one army per doctrine (a new army reusing units → skill `mow-mod-units` `new-army.md`)
- porting GoH cards to AS2: the `doctrine` key is unknown there and skipped; every doctrine's units show at once (→ skill `mow-mod-port`)

## Silently fails
- goh: no unit with the mode's unit mode tag, the army and a `doctrine`: log `No doctrines found for <mode>, <army>` and the army drops out of the list (GHMIS-88, GHGPL-09)
- goh: a typo in one card's `doctrine` creates a new one-unit doctrine in the list
- goh: a unit with a doctrine the player did not pick is hidden, not greyed
- as64 / mowas2: a `doctrine` key on a card is skipped without a message (MIS-01)
- as64 / mowas2: a per-player choice is not possible with presets: the preset is one lobby setting for all

## Verify
- goh: the lobby shows the doctrine with its name; with it picked, exactly its units plus the doctrine-free ones are on the bar; the log has no `No doctrines found` (→ skill `mow-mod-test`)
- as64 / mowas2: the new era entry shows in the dropdown and the buy list changes with it

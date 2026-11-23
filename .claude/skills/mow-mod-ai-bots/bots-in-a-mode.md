# mow-mod-ai-bots: allow bots in a game mode

when: "no bots in the lobby", "I can only set a slot to Open or Closed", "skirmish with bots on combat", "add bots to my mode".
G = AS2 install, `<mod>` = mod folder.

## Steps
1. is it allowed now: MCP `mow_mode_info {mode:"combat"}` (answers whether bots are allowed; `mod:"<mod>"` reads the mod on top)
2. allow it: MCP `mow_mode_bots {mod:"<mod>", mode:"combat"}` (preview; `write:true` copies the game card into the mod and adds `enableBots`)
   by hand: the mode card `set/multiplayer/games/<mode>.set` needs `{enableBots}` in its settings (lim TST-03 [V])
   GUI: Game Modes & AI tab > `modes` page > Allow bots in a mode (route `modes/bots`, write)
3. limits and budgets of the mode for bots: gen op `preset` (`node tools/gen/gen.js --sample preset`) → skill `mow-mod-multiplayer` (`presets-limits.md`)
4. lint: `node tools/milint/milint.js <mod> [--game G] [-q]`
5. start a lobby and add a bot (→ skill `mow-mod-test`); as64 by pipe `mp_slot`

## Facts
- bots run on the host only; the Lua state is per bot and not sandboxed (MIS-20)
- the bot needs flag points to give orders: allowing bots on a mode without flags gives buying, idle bots (MIS-65)
- `balancingFactorBonus` for bots falls back to `common` only when the entry's `chargeFactors.value` is empty (MIS-02)

## Per game
- as64: the card override is all it takes; army of a bot: `mp_army <army> <userId>` in alliance mode pins it (MIS-73)
- mowas2: same card; add the bot in the lobby by hand or a recorded route (`mow_game_routes {game:"mowas2"}`)
- goh: bots and their difficulty are set on the mode cards and lobby of GoH; `mow_mode_info {game:"goh"}` shows bot difficulty and start money; on GoH the GUI Bots page shows what bots buy (read only) and the difficulty numbers; switching bots on is on Game Modes

## Silently fails
- TST-03 without `{enableBots}` the slot offers only Open / Close: nothing in the log
- MIS-61 bots on a 1v1 lobby end the match in ~17 s
- MIS-01 the card is read by DDA: a misspelt key is skipped with no message; MIS-11 wrong case likewise
- MIS-18 `minTeamPlayers` / `maxTeamPlayers` are not read: use `minTeamSlots` / `maxTeamSlots`
- NET-22 nothing buys for a human slot by pipe: in a scripted test a person buys, or bots buy

## Verify
- the lobby offers a bot for the slot, the bot buys and walks; the card in the mod wins: MCP `mow_file_which {path:"set/multiplayer/games/combat.set", mods:["<modname>"]}`

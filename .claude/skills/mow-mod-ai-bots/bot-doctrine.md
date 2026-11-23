# mow-mod-ai-bots: bot personality and difficulty (doctrine pack)

when: "make the AI harder", "aggressive bot", "defensive bot", "bot doctrine", "bots attack in waves".
G = AS2 install, `<mod>` = mod folder. CLI and GUI only (no MCP tool for doctrine yet). All doctrine output is [T]: plan first, then watch a match.

## Steps
1. what exists: `node tools/doctrine/doctrine.js list` · one persona: `show <persona>` · its chat lines: `voice <persona>` · what the target bot script can take: `profile`
2. plan: `node tools/doctrine/doctrine.js gen --persona P --out <mod> [--profile auto|vanilla|botconfig|conquest] [--base <file|mod>] [--game <dir>] [--exe as64|mowas_2|mowas2|goh] [--scale 0..2] --plan [--json]`
3. write: the same line without `--plan` (refuses `--out` inside an install)
4. check: `node tools/doctrine/doctrine.js check <mod|file> [--exe E] [--json]`
5. then the bot data shape: MCP `mow_bots_recipe {mod:"<mod>"}` (check)
- GUI: Game Modes & AI tab > Bot doctrine page (`doctrine`)

## Facts; tools/index maps.md `doctrine`
- a persona maps small-unit rules to bot settings: the stock bot script takes 3 keys (profile `vanilla`); a larger replacement bot script takes 18 (profile `botconfig`)
- stock difficulty is the lobby's bot level; data-side levers are the purchase stages (what and when) and the few tuning keys the script reads
- single tuning keys seen once in play: `retreat_ratio 0` gave no infantry kills, `advance_ratio 0` showed no change (MIS-68 [V once])

## Per game
- as64 / mowas2: profiles `vanilla` or `botconfig` (auto picks by what the mod ships)
- goh: `--profile conquest` writes GoH ConquestConfig values (GUI page Bot Doctrine: detect, check, gen on the GoH tab too); MP bot scripts differ (`bot.main.lua`, `modes/*.lua`); before promising an effect

## Silently fails
- MIS-82 / MIS-10 a key the bot script never reads does nothing: `profile` says which keys the target reads
- MIS-08 no attack or retreat order exists in the API: a persona can change buying and timing, not tactics the script lacks
- MIS-81 a wrong-shaped global: Lua error (as64 idle bot, mowas2 abort)
- MIS-25 `OrderRotationPeriod` is read by Lua bot data only; engine handling is not proven

## Verify
- two matches, same map and mode, with and without the persona: compare what the bot bought and when (log spawn lines), time to first capture. Say it was one or two games, not a statistic

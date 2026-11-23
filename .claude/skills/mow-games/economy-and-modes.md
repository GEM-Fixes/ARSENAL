# mow-games: economy, doctrines, modes, campaign
When: "does GoH have head start", "what are doctrines", "which modes exist", "what is Conquest".

## Steps
1. Modes and win rules: `mow_mode_info {game: "as64"}` · `mow_mode_info {game: "goh"}`; one: `mow_mode_info {game: "goh", mode: "frontlines"}`.
2. What an army can buy, with prices: `mow_army {game: "goh", army: "ger", period: "mid"}` · `mow_army {game: "as64", army: "ger", class: "tank"}`.
3. Is a mod's price fair: `mow_price {game: "as64", mod: "<path>", show: "fit", q: "<card>"}`.
CLI: `node tools/balance/balance.js <gameDir> --exe as64|mowas_2|goh` �.
GUI: Game Modes & AI > Game Modes; Units > Balance.

## Facts
| | AS64, MoW:AS2 | GoH |
|---|---|---|
| money | manpower (grows) + special points (fixed) | several currencies per card, score factor, research stage |
| wait at start | head start: cooldown x charge factor x (1 - fore) | no head start; reinforcement waves, pause in preparation |
| rank lock | by card `level` | none |
| limits | count purchases | per card |
| doctrines | none | card `doctrine`, lobby list, army choice |
| modes | combat, captureflag, battle_zones (Assault Zones), battle_zones_8x8, frontline, cooperative | battle_zones, frontlines, ammunition, evacuation, guerrilla |
| campaign | single missions | also Conquest (dynamic campaign) |
Rows:, MIS-04 MIS-05 MIS-15 GPL-10 [V]; GHMIS-84 GHMIS-85 GHGPL-07 GHGPL-10 GHGPL-12; GHGPL-05 GHMIS-88 GHGPL-09; GHGPL-18..20; PORT-33, GHCQ rows.

## Same in all
A budget that grows, cards with a price and a cooldown, Lua bots that buy and capture.

## What goes wrong
- `tools/doctrine` taken for GoH doctrines: it is a bot persona pack.
- a wave time or price quoted from a row: mods change them; read `mow_mode_info` / `mow_army` with `mod`.
- AS2 head-start advice given to a GoH player.

## Check
The tool answer names the game and mod it read; the lobby shows the same modes.

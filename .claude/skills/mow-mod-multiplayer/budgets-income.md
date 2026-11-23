# mow-mod-multiplayer: budgets, income, payback

when: "starting resources", "MP income", "manpower grows too slowly", "more points per minute", "resource slider in the lobby", "special points", "second currency", "refund when a unit dies", "payback", "Invalid parameter value".
G = game install, `<mod>` = the user's mod folder (full path). MCP `game` = `as64|mowas2|goh`.
A unit's own `cost` → skill `mow-mod-units` (`price-cooldown-rank.md`).

## Steps
1. the budgets of a mode: MCP `mow_mode_info {mode:"<mode>", mod:"<mod>"}`
2. what prices the income has to pay for: MCP `mow_price {mod:"<mod>", show:"tiers"}`; one army: `mow_army {army:"<army>", mod:"<mod>"}`
3. edit the `budgets {..}` block in the mod's copy of the preset file (CRLF; `cp` and `restore` rows TAB-separated)
4. lint: MCP `mow_mission_lint {mod:"<mod>"}` · CLI `node tools/milint/milint.js --help`
5. the formulas: MCP `mow_lookup {query:"mission/mp-budget", mode:"topic"}`; economy model: `{query:"pricing/economy", mode:"topic"}`

## Facts
```
{budgets {vehicle {buttons "squad1 v1 .."} {mode standard} {tag default}
   {resource {start ..}{finish ..}{growTime ..}{payback {cp ..}{restore ..}}}}}
```
- a unit's `cost` is charged to the FIRST budget that lists the unit's `button`; no budget lists it = free
- `mode`:
  - `standard`: grows from `start` to `finish` over `growTime` seconds
  - `custom`: `finish` = the lobby resource amount (`limitmin`, `limitmax`, `speedset` feed the lobby slider)
  - `with_update`: a wave of the lobby value every `period` seconds
  - `without_update`: fixed amount, no income
  - `fullpayback`: only `start` up front; the rest arrives only as payback
- `growTable`: an income profile over `growTime` (front-loaded or back-loaded); the total stays `finish - start`
- `payback`: when a bought unit is lost, a share of its cost returns over time; the rate steps with command points in use
- everything is scaled by the lobby balance and the team balance factors
- `tag special` splits a budget in the stats and gives it its own hint text

## Per game
- as64 / mowas2: as above
- goh: budgets are read the same way in outline, with extra supply and research costs around them (GHGPL-27 supply zone prices).

## Silently fails
- MIS-05 the budget NAME `vehicle` is hard-coded: bot income, the HUD and king-of-the-hill look it up; rename it and they read nothing (milint MIS_BUDGET_NO_VEHICLE)
- MIS-17 each mode allows only some keys: `standard` needs `period`, `speed`, `limitmin`, `limitmax` at 0; `custom` and `fullpayback` need `period` and `speed` at 0; else `Invalid parameter value` (milint MIS_BUDGET_PARAM)
- MIS-14 `restoreBegin` / `restoreEnd` are dead keys, and rejected in the two update modes unless 0 (milint MIS_RESTORE_DEAD)
- MIS-06 / GPL-09 payback `cp` and `restore` must be TAB-separated: spaces drop the entries (milint MIS_PAYBACK_FORMAT)
- MIS-02 a bot or team bonus without its own `chargeFactors` is not applied (milint MIS_BALANCE_NO_CHARGE)
- payback exists only in `standard` and `custom`
- a unit whose `button` no budget lists is free: check after adding a new buy category

## Verify
- `mow_mission_lint` clean; in a match read the resource counter at the start, after one minute and at `growTime`; lose a unit and watch the payback; log read (→ skill `mow-mod-test`). on as64 the control pipe reads the numbers (→ `test-multiplayer.md` in this skill)

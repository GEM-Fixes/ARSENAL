# mow-mod-multiplayer: presets, unit limits, command points, cooldown factors

when: "presets.inc", "limit tanks to 3", "unit limit", "command points", "CP cap", "raise the population cap", "cooldown factor", "different rules for one team", "bots get more resources", "era preset", "my limit is ignored".
G = game install, `<mod>` = the user's mod folder (full path). MCP `game` = `as64|mowas2|goh`.
Budgets inside a preset → `budgets-income.md` in this skill.

## Steps
1. what a mode's presets hold now: MCP `mow_mode_info {mode:"<mode>", mod:"<mod>"}`
2. edit: copy the stock `set/multiplayer/games/presets*.inc` the mode includes into the mod at the same path and change it there (CRLF; keep tabs where the file has tabs)
3. lint: MCP `mow_mission_lint {mod:"<mod>"}` · CLI `node tools/milint/milint.js --help`
4. one rule explained: MCP `mow_limit {ids:["MIS-22"]}`; all of it: `mow_lookup {query:"mission/mp-preset", mode:"topic"}`

## Facts
```
{"name" {gameMode ..} {unitMode ..} {specMode ..} {apply "units_x"}
   {common {..}} {teams {a {..} b {..}}} {bots {easy normal hard heroic}}}
```
- the name is only a unique key; lobby dropdowns show `gameMode`, `unitMode` (era), `specMode` (CP choice)
- `common`, a team and a bot level share one shape; an empty field falls back to `common`
- `unitset {value "inc1|inc2^exc1|exc2"}`: a unit passes with ANY include tag, NO exclude tag, and the player's army tag
- `commandPoints "tag=table;tag=table"`: `*` is the main pool; a table is `limit` or `sec:limit,sec:limit` (steps up over game time)
- `unitLimits "tag=N;tag=N"`: counts purchases
- `chargeFactors {value "tag=f;*=f"}`: cooldown multiplier, first matching tag wins, then `*`, then 1
- `balancingFactorBonus {cp mp payback}`: multiplies CP limits, budgets and payback; the smaller team also gets a team balance factor
- per-team (`teams {a {} b {}}`) and per-difficulty (`bots {}`) presets work; stock only uses them in frontline

## Per game
- as64 / mowas2: as above
- goh: presets also carry doctrine and research data and the lobby builds the army list from them (GHGPL-09).

## Silently fails
- MIS-03 exclude-only `"^x"` matches NOTHING: write `all^x` and give units the `all` tag (milint MIS_UNITSET_EXCLUDE_ONLY)
- MIS-04 / GPL-09 `unitLimits` entries are `;`-separated: a wrong separator drops the later entries (milint MIS_LIMITS_FORMAT)
- GPL-10 limits count purchases and are never given back on death: a limit of 3 means 3 per match
- MIS-22 a unit is checked against the main pool and only the FIRST pool whose tag it has (milint MIS_CP_POOL_OVERLAP)
- MIS-02 `balancingFactorBonus` in a bot or team entry applies only when that entry also sets `chargeFactors`
- MIS-15 unit `level` (rank needed) is ignored when the mode turns unit level restrictions off, in test mode and for AI (milint WARN_MIS_UNIT_LEVEL_OFF)
- MIS-16 name prefixes `c:` `s:` `f:` mean nothing to the engine
- MIS-01 unknown keys are skipped

## Verify
- `mow_mission_lint` clean; in a match: the lobby shows the preset choices, the CP counter and a limited unit's button behave as set (buy up to the limit, lose one, try again); log read (→ skill `mow-mod-test`)

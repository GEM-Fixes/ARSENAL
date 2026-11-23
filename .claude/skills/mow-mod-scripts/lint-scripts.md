# mow-mod-scripts: lint every script of a mod, or one file while editing

when: "check my scripts", "the game refuses my interaction file", "unexpected token in a .mi", before a test run, after merging scripts of two mods.
G = game install, `<mod>` = the user's mod folder (full path). MCP `game` = `as64|mowas2|goh`. All read-only.

## Steps
1. interaction scripts: MCP `mow_script_lint {mod:"<mod>"}` (`mods:[..]` = other enabled mods, in load order)
   CLI `node tools/ialint/ialint.js <mod folder> [--game dir] [--exe as64|mowas_2|mowas2|goh] [--mods a,b] [-q] [--summary]`
2. missions, map files, mode presets, bot orders: MCP `mow_mission_lint {mod:"<mod>", q:"<map | file | code>"}`
   CLI `node tools/milint/milint.js <mod folder> [--game dir] [--exe as64|mowas_2|goh] [--mods a,b] [-q]`
3. Lua: MCP `mow_lua_check {mod:"<mod>"}`
4. one file (`.def .inc .set .ext .mi .lua .lng .po`): MCP `mow_script_check {file:"<full path>", outline:true}` → syntax errors with line and column, unknown keys, mission command checks. it does not follow other files
   CLI syntax of a folder: `node tools/sdllint/sdllint.js <folder> [--game <gameDir>] [--mods a,b] [--exe as64|mowas_2|goh] [-q]`
5. effect and sound side of scripts: `node tools/fxlint/fxlint.js <mod folder> [--game dir] [--exe ..] [--summary]`
6. everything at once: MCP `mow_mod_check {mod:"<mod>"}` (`only:[..]` = tool names) · CLI `node tools/check/check.js <mod, anywhere> [--exe as64,mowas2,goh]`
7. GUI: Mods tab > Check & Fix; the Editor shows the same findings per file

## Interaction codes (ialint) → limits row
INT_EVENT_DUP (INT-02) · INT_CALL_UNDEFINED (INT-04) · INT_TERRAIN_BULLET (INT-05) · INT_HITSIDE_NOBULLET (INT-07) · INT_USE_BLEND_TEX (INT-08) · INT_FLAG_OVERFLOW (INT-10) · INT_ABLE_OVERFLOW (INT-11) · INT_DELAY_CTX_LOST (INT-13) · INT_KILL_DELAY_EMPTY (INT-17) · INT_EXPLODE_TINY (INT-20) · WARN_FIRE_PLACE (INT-21) · INT_GROUND_MIN_ENERGY (INT-24) · INT_EVENT_UNKNOWN (a GoH-only event on AS2) · IA_ACTION_UNKNOWN (VIS-18, fxlint)

## Mission codes (milint)
MI_CMD_UNKNOWN (MIS-26) · MI_TERM_UNKNOWN (MIS-27) · MI_TRIGGER_KEY (MIS-28) · MI_COND_EXPR (MIS-29) · MI_ACTIONS_EMPTY (MIS-48) · MI_KEY_CASE (MIS-11) · WARN_MI_KEY_UNKNOWN (MIS-31) · WARN_MI_ZONE_REF, WARN_MI_EVENT_REF, WARN_MI_TRIGGER_REF, WARN_MI_WAYPOINT_REF, WARN_MI_TASK_REF, WARN_MI_VAR_REF (MIS-30, MIS-85, MIS-87) · WARN_MI_MID_REF (MIS-86) · INCLUDE_MISSING (crash at load) · WARN_MIS_BOT_ORDER (MIS-08) · MIS_BOT_UNIT_UNKNOWN (MIS-13)

## Read the result
- errors that stop loading first (unknown action, event, command, term; empty actions; flag overflow; missing include)
- then silent no-ops (undefined call, undefined name, lost delay context)
- vanilla itself has some findings (3 undefined calls, dead `log` actions): a finding in a file the mod did not change is not the mod's defect
- one row explained: MCP `mow_limit {ids:["INT-04"]}` �

## Per game
- as64 / mowas2: full rule sets, [V] rules
- goh: `--exe goh` or `game:"goh"` uses GoH word lists (events, actions, commands, bot orders); bot.data checks find nothing there (GHMIS-66); GoH rules are [I], not yet tried in game

## Silently fails
- lint reads data, it does not run it: a handler that never fires because the event never happens is clean
- WARN_MI_KEY_UNKNOWN uses the union of all known field names: a wrong field of the right spelling passes (MIS-31 [I])
- with two mods, lint each alone AND together (`mods`): a later mod's copy of a shared file drops the earlier one's handlers

## Verify
- every tool clean or each finding explained; then the scripted event caused in game and the log read (→ skill `mow-mod-test`)

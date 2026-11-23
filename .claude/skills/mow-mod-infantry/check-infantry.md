# mow-mod-infantry: lint all infantry data of a mod

when: "check my soldiers", after editing `human.ext`, breeds, abilities or items, before a test run, "which of these warnings matter".
G = game install, `<mod>` = the user's mod folder (full path). MCP `game` = `as64|mowas2|goh`. All read-only.

## Steps
1. everything: MCP `mow_mod_check {mod:"<mod>"}` (`only:["humlint","keylint"]` narrows to tool names; `with:[..]` adds other enabled mods)
   CLI `node tools/check/check.js <mod, anywhere> [--exe as64,mowas2,goh]`
2. soldier rules: `node tools/humlint/humlint.js <mod folder> [--game dir] [--mods a,b] [--exe as64|mowas_2|mowas2|goh] [-q] [--summary]`
3. keys and perk levels: `node tools/keylint/keylint.js <mod folder> [--game dir] [--exe as64|mowas_2|mowas2|goh]`
4. references (breeds, items, skins, foot rows): `node tools/refcheck/refcheck.js <gameDir> --mods <mod> --scope mod [--exe ..] [--summary]`
5. soldier scripts: MCP `mow_script_lint {mod:"<mod>"}`
6. models and animations of new skins: MCP `mow_model_check {mod:"<mod>"}`
7. known fixes with a preview: MCP `mow_mod_fix {mod:"<mod>"}` (plan; `out` + `write: true` writes into a folder)
8. GUI: Mods tab > Check & Fix

## humlint codes → limits row
| code | row | means |
|---|---|---|
| HUM_VITALITY_KEY | HUM-01 | unknown key in Health / Stamina: load error |
| HUM_STAMINA_ROW | HUM-03 | unknown `inc` row name writes the first row |
| HUM_DAMAGE_KEY, HUM_THROW_EFFECTS | HUM-07 | damage table key or too few effects |
| HUM_ABILITY_BASE, HUM_ABILITY_NO_LEVELS | HUM-14 | unknown ability base / kind without levels: load error |
| HUM_POSTURE_RELOAD | HUM-16 | inert key |
| WARN_HUM_BREED_UNKNOWN | HUM-18 | breed name nobody defines: skeleton soldier |
| HUM_BOX_SIZE_INT8, WARN_HUM_USER_AMOUNT | HUM-23 | box size, non-stack count |
| HUM_FSM_SPLIT_ORDER, HUM_FSM_DYING_EDGES | HUM-29 | stance graph broken |
| HUM_DURATION_ZERO | HUM-31 | sequence with zero duration |
- also reported: HUM_WEAPON_RELOAD_PERK (HUM-11), HUM_VETERANCY_TIED (HUM-17), HUM_FILLED_N_GLOBAL (HUM-20), HUM_HOLDER_TWO_ITEMS (HUM-25), HUM_WEAPON_NO_TAG (HUM-27)
- keylint WARN_PERK_LEVEL (HUM-13) · refcheck FOOT_ROW_MISSING (HUM-36) · ialint INT_HEALTH_NO_DIE (HUM-06)
- one row explained: MCP `mow_limit {ids:["HUM-20"]}` �

## Order of repair
1. load errors (vitality key, ability base, FSM, duration)
2. silent wrong values (stamina row, perk level, filled N, breed unknown)
3. inert keys (reload perk, posture reload): remove or leave, they do nothing

## Per game
- as64 / mowas2: HUM rules are source-verified [V]
- goh: the same rules run with the GoH file view but are [I] there; HUM_VETERANCY_TIED is not reported for ranks tied at a negative threshold (GoH gives a rank from spawn that way, GHHUM-19)

## Silently fails
- lint does not see behaviour: morale, cover and animation choice are built into the game (no data file)
- a finding in a vanilla file the mod did not copy is not the mod's defect

## Verify
- all tools clean or each finding explained; then one soldier of every changed breed bought and watched in game, log read (→ skill `mow-mod-test`)

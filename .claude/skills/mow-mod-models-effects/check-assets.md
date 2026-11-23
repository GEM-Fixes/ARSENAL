# mow-mod-models-effects: whole-mod art check

when: "check my models", "is anything missing", before a release, after a port or a big art import, "the mod crashes when the unit appears".
G = game install, `<mod>` = the user's mod folder (full path). MCP `game` = `as64|mowas2|goh`. All read-only.

## Steps (run all, then fix by kind)
1. models: MCP `mow_model_check {mod:"<mod>"}` (`checks` = def, export, binary; left out = all) → def volumes and bones against the .mdl, export rules, binary headers
2. missing files: MCP `mow_asset_missing {mod:"<mod>"}` (`all: true` lists every one) → meshes, materials, textures, animations a mod file names and no pak or mod holds
3. effects and weather: MCP `mow_fx_check {mod:"<mod>"}`
4. sound: MCP `mow_sound_check {mod:"<mod>", files:true}`
5. pictures: MCP `mow_icon_check {mod:"<mod>"}`
6. the general check covers the rest: MCP `mow_mod_check {mod:"<mod>"}`
7. after a 3D editor session: MCP `mow_model_edits {record:"<mod>/.arsenal/soedit/<name>.stage.json"}`
CLI, same order:
- `node tools/binhdr/binhdr.js <gameDir> [--exe as64|mowas_2|goh] --mods <mod> [--ext ply,anm,vol,dds] [--strict] [-q] [--summary]`
- `node tools/expcheck/expcheck.js <mod folder> --game dir [--mods a,b] [--exe as64|mowas_2|goh]`
- `node tools/defcheck/defcheck.js --help` (def against mdl) · `node tools/fxlint/fxlint.js <mod folder> [--game dir] [--exe ..] [--summary]`
- `node tools/check/check.js <mod, anywhere> [--exe as64,mowas2,goh]`
GUI: Mods tab > Check & Fix; Models & Sim tab > `models` page (Save lists the file checks), `art` page (`art/check`)

## What each finding class means → limits rows (`mow_limit {ids:[..]}`)
- binary header findings cite FMT rows: FMT-01 chunks, FMT-08 / FMT-24 animation, FMT-10 mesh size, FMT-02 texture format, FMT-04 TEX_EXT_SHADOW
- export: WARN_EXP_SKIN_BONES (FMT-18 / FMT-23), WARN_EXP_ANM_BONES (FMT-09), WARN_EXP_DUP_BONE / WARN_EXP_DUP_VOLUME (FMT-19), WARN_EXP_VOL_MATRIX (FMT-20)
- def: a `{Volume}` or bone the model lacks (FMT-07)
- effects: IA_ACTION_UNKNOWN (VIS-18), FX_TRACER_UNLISTED (VIS-19), WARN_ENV_NO_ENABLE / THUNDER_NO_SOUND (VIS-14), SND_TAG_UNKNOWN (VIS-09)
- pictures: PICTURE_MISSING (UI-03)

## Order of repair
1. anything that stops loading (bad chunk, wrong magic, missing .mtl, unknown action, unknown vision)
2. dropped volumes and bones (the unit works but is wrong)
3. missing textures, sprites, pictures (checker, stub)
4. warnings vanilla also has (mirrored volumes, shared animations with unmatched bones): report, do not "fix"

## Per game
- as64 / mowas2: every check runs
- goh: the def check is not run (PORT-171) and `mow_asset_missing` is not served; binary, export, fx, sound and icon checks run with the GoH file view (rules for goh are [I], not yet tried in game)

## Silently fails
- a clean check is not a load test: missing files in vanilla-shared includes and anything only a running game resolves stay unseen
- loose files that shadow a pak entry of the same mod are checked, the pak entry is not

## Verify
- every tool above answers with no error-level finding, or each remaining one is explained; then the units touched are seen in game and the log read (→ skill `mow-mod-test`)

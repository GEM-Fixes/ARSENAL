# mow-mod-text-ui: raw keys and missing names

When: "unit name shows as desc/...", "raw key instead of text", "all names are gone", "my squad has no i button", after adding units or after another mod was added.

## Causes, most common first
1. the key was never written, or is mistyped / mis-cased: an unknown key shows as the key itself, no error (lim LOC-02)
2. the mod (or another mod) ships a `.lng` at a vanilla path: it replaces the file whole, every key it lacks shows raw (lim LOC-01, VFS-27). An empty `desc.lng` wipes all names (lim LOC-18)
3. wrong key form: squad card needs `desc/squad/<name>(<side>)`, a bare-named (`how` kind) card needs the bare key (lim LOC-13); weapon / ammo key tags in the wrong order (lim LOC-15)
4. the name is there but the OLD one shows: the key also exists in vanilla `desc.lng`, which loads later and wins (lim LOC-19)
5. an `(include "p")` in a `.lng` names no file: those keys are not loaded (lim LOC-21)
6. the mod is not mounted at all (fresh profile, wrong list) → skill `mow-mod-start`

## Steps
1. cover check: MCP `mow_mod_check` (`mod`, `only: "loccover,lnglint"`)
   CLI `node tools/loccover/loccover.js <mod> [--lang eng] [--game G] [--exe as64|mowas_2|mowas2|goh] [-q] [--summary]`
       whole stack: `node tools/loccover/loccover.js --vfs --game G [--mods a,b]`
   codes: LOC_FILE_REPLACED (cause 2), LOC_NAME_MISSING (1), LOC_INFO_MISSING (no "i" button, LOC-11), LOC_HOW_SIDEKEY (3), LOC_STUFF_KEY_ORDER (3), LOC_DAMAGE_KEY, LOC_INCLUDE_MISSING / LOC_INCLUDE_CYCLE (5); info STUFF_KEY_MISSING
2. is the key defined, and where: MCP `mow_text_find` (`key`, `mod`)
3. which mod's file wins: MCP `mow_file_which` (`path: "interface/text/desc.lng"`, `mods` in load order)
   CLI `node tools/vfs/vfs.js G --exe as64 --mods a,b which interface/text/desc.lng`
4. fix by cause
   - 1, 3: add the key: MCP `mow_text_set` (`mod`, `key`, `text`) · CLI `node tools/lng-add/lng-add.js <mod> --file "#x.lng" --key k --text "t"`
   - 2: merge the dropped vanilla keys back: MCP `mow_mod_fix` (`mod`, `out`, `only: "lng"`) · CLI `node tools/fix/fix.js <mod> plan --out <patch> --only lng`
   - 4: MCP `mow_mod_gen` (`ops: [{op:"text", key, text}]`): gen writes the mod copy of the vanilla file
   - two mods: the later mod's text file hides the earlier one's → skill `mow-mod-together`
5. what the game said: MCP `mow_game_log` (AS2: `Localization key redefinition` lines; GoH: `Missing text: [key]`)
GUI: Check page (Check & Fix) lists the same codes; Units page shows a unit's name key

## Per game
| | as64 | mowas2 | goh |
|---|---|---|---|
| missing key in the log | nothing | nothing | `Missing text: [key]`, once per key (GHLOC-02) |
| extra text layer | `as64/core` texts exist only here (lim LOC-23): tools without `--exe as64` miss them | pass `--exe mowas_2` | `localizations/<code>/` layers, fallback to default (GHLOC-01) |
| entry that gives no text | — | — | no `msgctxt`, or `fuzzy` flag (GHLOC-06) |
| loccover | all checks | all checks | card checks on `units/common.set`; stuff key rule skipped (LOC_GOH_STUFF); `.mo` not read |

## Silent fails
- LOC-02 no log for a missing key on AS2
- LOC-01 / LOC-18 one replaced file loses hundreds of names at once
- LOC-11 baseline: some vanilla squads ship without info keys; loccover flags only cards vanilla satisfied
- LOC-16 text edits need a game restart or re-apply of mods: stale text otherwise

## Verify
- loccover: no LOC_NAME_MISSING / LOC_FILE_REPLACED for the mod (with the patch: `mow_mod_check` `with` = patch folder)
- in game: buy panel of each army the mod touches, hover and info window (→ skill `mow-mod-test`)

Depth: (audit categories), localization/keys · guide 21-troubleshooting, p07

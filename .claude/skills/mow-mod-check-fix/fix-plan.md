# mow-mod-check-fix: plan the automatic fixes

when: after a check, "fix my mod", "can you fix these by yourself". The plan writes nothing.

## Steps
1. MCP `mow_mod_fix` (`mod` = full path, `out` = full path of a NEW patch folder beside the mod, `game`): without `write` = the plan. `only` = fixer names · `mods` = mods under `<game>/mods` loaded before it, in order · `limit`
   answer: the files it would fix, per fixer, and what it can not fix
2. CLI `node tools/fix/fix.js <mod> plan [--out <patch mod>] [--game G] [--mods deps] [--only modinfo,lng,repoint,set,include,macro,enc,spell,syntax,asread,stubmtl,quarantine,botkeys,lngdup] [--target as64|classic|mowas2|goh] [--exe as64|mowas_2|mowas2|goh] [--game-version V] [--set file:path=value] [--json f]`
3. GUI: Mods tab > Check & Fix, the fix plan under the findings
4. show the plan to the user: per file what changes and why; wait for a yes; then apply (`write: true` / `fix.js <mod> apply --out <patch mod>`) and re-check with the patch (`mow_mod_check` `with`)

## Fixers
| fixer | does | answers |
|---|---|---|
| lng | merges the vanilla keys a replaced `.lng` dropped | LOC-01, LOC-18 |
| lngdup | removes the earlier copy of a duplicate text key | LOC-03 |
| enc | cp1251 strings to UTF-8 (not for `--target classic`) | PORT-15, LOC-05 |
| syntax | bare `diffuse`, split tags and like slips | SDL rows |
| spell | case of macro and key names | SDL-33 |
| asread | values the engine clamps or rounds, written as read | DMG-19 |
| repoint | a missing path with exactly 1 same-name candidate | FMT-22 |
| include | missing include (crash class) | - |
| macro | MACRO_UNDEFINED with exactly 1 other file defining the name: an `(include)` line added at the top of the using file; else refused | - |
| stubmtl | stub material for a referenced mesh that has none | FMT-03 |
| set | the `--set file:path=value` hand edits: the whole winning file copied, patched byte-exact | VFS-01 |
| botkeys | BOT_DATA_UNUSED_KEY: unused keys removed from the mod bot.data.lua; refused when another Lua file names the key | - |
| modinfo | Min/MaxGameVersion missing or wrong: a corrected copy written as `mod.info.fixed` in the patch; a working range is left alone (CLI `--only` name) | VFS-19 |
| quarantine | removes a still-crashing entity by mod.info Delete; ONLY when named in `--only`; refused for armour and unproven referrers; the report says the verdict is "after removal" | - |

environment presets are repointed too; two fixers on one file are merged.

## Gate
every file is gated before it is written: the target still exists, no NEW sdllint / keylint / milint / refcheck code, structural diff as expected. a file that fails the gate is not written and is named. fix never answers "pass".

## Per game
| as64 | mowas2 | goh |
|---|---|---|
| `--target as64` (default) | `--target mowas2` / `--exe mowas_2`: the view without as64/core. `--target classic` = legacy behaviour on as64.exe: no `enc` | `--target goh`: GoH range, folder name rule, `.pot` merge; the patch folder must be outside H. not run on GoH (each with a plain reason line): enc, syntax, asread, botkeys, lngdup, stubmtl, quarantine |

## Silent fails
- VFS-41 a patch that carries a full file copy drops later edits to that file by other mods: keep the patch last
- repoint does nothing when 0 or 2+ candidates exist: those stay for a hand edit
- quarantine hides a crash by deleting content: say so, never run it unasked
- LOG-07 a reference repointed to a wrong-but-existing stuff loads fine and acts wrong: read the repoint rows
- fix is a static preview until a game test proves it (its own first line)

## Verify
- the plan lists every crash-class finding as fixed or as "can not fix" with the reason
- nothing was written: the mod folder and `out` are unchanged after a plan
- next: apply, re-check with the patch, then a game run (→ skill `mow-mod-test`)

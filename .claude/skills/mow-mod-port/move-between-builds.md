# mow-mod-port: a MoW:AS2 mod onto AS64, or back

when: "old mod on the 64-bit build", "make this classic mod work on AS64", "Classic or Enhanced", "does my as64 mod still run on the original game".
G = AS2 install (mowas_2.exe and as64.exe share it), `<mod>` = source, `<out>` = result folder.

## Steps
1. what must change: `node tools/modmove/modmove.js static <mod> --from mowas2 --to as64` (or the reverse)
2. plan: MCP `mow_port_plan {game:"as64", mod:"<mod>", from:"mowas2"}`
3. converted copy: MCP `mow_mod_upgrade {game:"as64", mod:"<mod>", out:"<out>", from:"mowas2"}` (preview; `write:true`)
   CLI `node tools/upgrade/upgrade.js <modDir> --to as64|mowas2 [--from g[@sha]] (--plan [--out dir] | --out dir [--mode classic|enhanced])`
4. load verdict per exe, no game started: `node tools/wouldload/wouldload.js <modDir> [--exe as64,mowas2] [--game G] [--json f]` (REFUSED, LIKELY_CRASH, LOADS_STATIC, UNKNOWN)
5. check: MCP `mow_mod_check {game:"as64", mod:"<out>"}`; version differences of data: `node tools/verdiff/verdiff.js` (line:
6. run it on the target exe (→ skill `mow-mod-test`)
- GUI: Mods tab > `check` page; `run upgrade` command (Quick Guided Task has an upgrade task, guide p13 / p17)

## Facts; guide p13
- as64 reads a mod in Classic mode (range 3.262, data as the old game) or Enhanced mode (MinGameVersion 3.301, with the built-in `as64+` first and `as64/core` mounted); the mod.info version lines pick between them
- as64 reads every string value as UTF-8: cp1251 strings show as boxes (U+FFFD) until converted; identifiers ASCII; comments may stay cp1251
- the exe-only switches `-console -instance -control -nosound` exist only on as64.exe (TST-19)

## Per game
- → as64: encoding and mod.info are the usual whole of it; keys as64 added are optional
- → mowas2: as64-only keys and `as64/core` content must go; the plan names them; a MoW:AS2 player can not join an as64 host (NET-13)
- goh: not this file → `as2-mod-to-goh.md` / `goh-unit-to-as2.md`

## Silently fails
- ENG-24 / ENG-26 a bad mod.info, or a Classic/Enhanced mismatch of a listed mod: the game dies before the menu
- ENG-24 an unescaped `"` in mod.info Desc stops the game for everyone who has the mod
- LOC-01 a mod `.lng` named like a game file replaces it whole: keys the mod lacks vanish (as64 added keys)
- MIS-33 a bot Lua error: as64 idles the bot, mowas_2 aborts the game: a mod "fine on as64" can kill a mowas2 match
- MIS-34 mission `switch` runs every case on as64 builds before the fix, correct on mowas_2
- TST-13 a renamed mod folder is dropped from the enabled list

## Verify
- on the target exe: the mod is active (as64 `mod_list applied:true`), a match starts, the changed units work, the log has no new error against a vanilla base (`node tools/bootcheck/bootcheck.js`)

# mow-mod-maps-missions: lint a map or mission, see what changed

when: after any map or mission edit, "what did I change on this map", "check my map before I host it".
G = AS2 install, `<mod>` = mod folder. Nothing here writes.

## Steps
1. one call: MCP `mow_mod_check {mod:"<mod>"}` (quick; `full:true` every linter; `only:["milint","refcheck"]` narrows)
2. map and mission lint alone:
   `node tools/milint/milint.js <mod folder> [--game dir] [--exe as64|mowas_2|goh] [--mods a,b] [-q]`
   covers: mode `.set` against `.mi`, `map.info` players, `.materials` against mtl, `Players` / `Helpers` / `xform` / `Clip`, Entity Position arity, net origin, unitset / unitLimits / budget / payback, bot Lua orders
3. what a mod changed on a map: `node tools/misdiff/misdiff.js <a> <b> [--format json] | --game G (--mods m | --mod-dir D) --map <name> [--exe as64|mowas_2|mowas2|goh]`
   GUI: Tools tab > `pro` > Diff (route `pro/misdiff`); Maps tab > `missions` (route `missions/diff`)
4. binary files of the map (`map.net`, `.ply`): `node tools/binhdr/binhdr.js G --mods <modname> --ext net,ply [-q]`
5. entity names the map places exist: `node tools/refcheck/refcheck.js G --folder <mod> --scope mod [-q]`
6. whole mod: `node tools/check/check.js <mod> [--exe as64,mowas2,goh]`

## Codes worth knowing (milint; row in brackets)
- MI_KEY_CASE (MIS-11) wrong-case field, skipped by the game with no message
- MI_TRIGGER_KEY (MIS-28) a trigger key the game does not read
- MI_ACTIONS_EMPTY (MIS-48) fatal at map load
- MIS_BOT_NO_FLAGS (MIS-65) bots idle on this mode
- WARN_MI_KEY_UNKNOWN (MIS-31) a field outside the known union: a typo or a rare key, look
- MIS_DURATION (MIS-21) a `gameDuration` not in the fixed lobby list

## Per game
- as64 / mowas2: all tools; mowas2 view = `--exe mowas_2`
- goh: milint, binhdr, refcheck take `--exe goh` (cell 5 `map.net` valid, GHMAP-06); misdiff reads GoH maps; rules are AS2 rules where GoH has no own table [I]

## Silently fails
- TST-36 binhdr / refcheck with an empty `--mods` list = vanilla scope: 0 findings and no message; give `--folder` or the mod name
- MIS-01 files read by DDA skip unknown keys with no message: a clean load proves nothing about a typo, the lint does

## Verify
- lint clean is static: host the map, play the mode, read the log (→ skill `mow-mod-test`)

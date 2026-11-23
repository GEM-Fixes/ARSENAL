# mow-mod-check-fix: upgrade an old (32-bit era) mod to AS64, or move it between games

when: "old mod to 64-bit", "make this mod work on AS64", "upgrade a classic mod", "Classic or Enhanced", verdict REFUSED on the target game. Single GoH <-> AS2 units or maps → skill `mow-mod-port`.

## Steps
1. what must change, listed only: MCP `mow_port_plan` (`mod`, `game` = the TARGET, `from` = game the mod is for now; default read from its mod.info): what converts by itself, what can not, what needs a look
   CLI `node tools/modmove/modmove.js static <mod> --from X --to Y` (MOVE_* = must, WARN_MOVE_* = likely [I])
2. plan the copy: MCP `mow_mod_upgrade` (`mod`, `out` = full path of a NEW folder, `game` = target, `from`): preview unless `write: true`
   CLI `node tools/upgrade/upgrade.js <modDir> --to as64|mowas2|goh [--from g[@sha]] (--plan [--out dir] | --out dir [--mode classic|enhanced]) [--goh-version V] [--as2 G] [--goh H] [--only p,q] [--drop p,q] [--then-fix] [--no-link] [--json f]`
3. show the plan, then write on the user's yes (`write: true` / drop `--plan`)
   writes a COPY: mod.info range, encoding + CRLF, include renames, `.lng` <-> `.pot`; paks stay in place and unchanged ones are byte-identical (hard-linked unless `--no-link`); the source is never written
   it re-checks the copy and prints before → after per code; rows it can not convert (DLLs, map.net folders) are left out and named; a WARN section lists behaviour that differs on the target
4. `--then-fix` chains fix + check on the copy; or run them yourself: MCP `mow_mod_fix`, then `mow_mod_check` (`with`)
5. GUI: Mods tab > Upgrade
6. verdict: partial (exit 3) or static clean (exit 0); both mean "untested until a game ran it"

## Classic or Enhanced (as64 only)
| mode | mod.info | runs with | pick when |
|---|---|---|---|
| Classic | legacy range holding 3.262 | the legacy data view, without `as64+` | the mod must also run on mowas_2.exe |
| Enhanced | MinGameVersion >= 3.301 | beside the built-in `as64+` mod | AS64 only |

`--mode classic` keeps legacy 3.262 behaviour on as64.exe; `--mode enhanced` writes MinGameVersion 3.301. All listed mods must be of the same mode.

## Per game
| to | does |
|---|---|
| as64 | mode as above; cp1251 strings to UTF-8; as64-only paths |
| mowas2 | legacy range; no as64/core, no `as64+` |
| goh | text becomes `.pot` under `localizations/`; GoH version scale (range must hold 1.067; `--goh-version V`); AS2 forms converted where a rule exists; `out` outside H. not run in game [T] |

## Silent fails
- VFS-48 a modern mod is silently off in Classic and a legacy mod off in Enhanced; listed with the wrong mode = startup crash (ENG-26)
- VFS-19 on a modern mod MaxGameVersion is ignored; an empty Min/Max = unsupported
- PORT-15 old mods carry cp1251 strings: no error, wrong letters. the upgrade converts strings, never comment bytes
- LOC-05 a UTF-16 `.lng` is fatal on load
- PORT-46 GoH refuses a range that does not hold its exe version: the mod shows "not up to date"
- VFS-47 a folder named `as64+` in mods/ is dropped
- ENG-24 a bad mod.info stops the game for every mod: after moving the copy in, run `node tools/modinfo/modinfo.js --all <mods dir>`

## Verify
- `node tools/check/check.js <copy> --exe <target>`: not REFUSED, crash class 0 reachable
- enable the copy alone (old one off), start a match, read the log: MCP `mow_game_log` (→ skill `mow-mod-test`)
- depth: guide p13-old-mod-to-64-bit, 03-mod-folder-and-load-order · porting/static-verdict

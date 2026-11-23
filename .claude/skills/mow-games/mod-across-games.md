# mow-games: does a mod of one game work in another
When: "can I use an AS2 mod in GoH", "old mod on AS64", "AS64 mod in the original game".

## Short answers
| from -> to | answer | why |
|---|---|---|
| MoW:AS2 -> AS64 | yes, in Classic mode, as it is | same data rules; exe differences can still bite |
| MoW:AS2 -> AS64 Enhanced | after an upgrade | Min 3.301 and `as64+` rules (VFS-47 VFS-48 [V]) |
| AS64 Enhanced -> MoW:AS2 | no, as it is | a 3.301 mod is off there; it may use things only AS64 has |
| AS2 / AS64 -> GoH | no, as it is | version scale, mount list, folders, text and interface differ (PORT-43 PORT-50 GHVFS-04) |
| GoH -> AS2 / AS64 | no, as it is; units and maps can be ported | keys as64 does not read, other formulas |

## Steps
1. Which game it is made for: `mow_mod_info {game: "as64", mod: "<path>"}` (range), and its folders.
2. Would it load there: `mow_mod_check {game: "goh", mod: "<path>"}`.
3. Plan a move: `mow_port_plan {game: "goh", mod: "<path>"}` (`game` = the target; what must change). Preview a converted copy: `mow_mod_upgrade {game: "as64", mod: "<path>", out: "<new folder>"}`; `write: true` only on the user's yes.
CLI: `node tools/upgrade/upgrade.js <modDir> --to as64|mowas2|goh --plan` · `node tools/modmove/modmove.js static <mod> --from X --to Y` · `node tools/goh2as2/goh2as2.js --help` · `node tools/as2togoh/as2togoh.js --help`.
GUI: Mods > Upgrade or Port.

## Rules
- a port writes a NEW mod folder the user names; the source mod and both installs stay untouched.
- a ported unit is done only after a run in the target game and a clean log.
- multiplayer: all players need the same game exe and the same mod build.

## What goes wrong
- the version line edited so the mod "loads": it loads and then fails on data.
- an AS2 mod's `localization/` in GoH: not mounted, raw keys.
- a GoH tank in AS2 without its texture mod or donor: checker or crash (skill `mow-mod-port`).

## Check
`mow_mod_check` for the target game is not REFUSED; then the test loop (skill `mow-mod-test`).

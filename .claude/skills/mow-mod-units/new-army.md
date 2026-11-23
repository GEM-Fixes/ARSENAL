# mow-mod-units: a new army (faction) in the lobby

when: "add Finland", "new faction", "new nation", "army does not show in the lobby", "army has an empty buy menu".
game: MCP `game` = `as64|mowas2|goh` · gen `--target as64|mowas2|goh`. `<mod>` = the user's mod folder (full path), G = game install.

## Steps
1. list the armies there are: MCP `mow_army` (no `army`; `mod`)
2. make the army from an existing one: MCP `mow_mod_gen` (`mod`, `ops: [{op:"army", tag:"<new tag>", like:"<base army>", title:"Shown name", icon_like:"<base army>", alliance:"<side>"}]`, `write`); also `id`
   CLI `node tools/gen/gen.js --sample army`, run with `--plan` first
   gives: its own id, lobby name, flag picture and an EMPTY vehicle list
3. fill the buy menu, same call or a later one: op `roster` per unit (`unit`, `like`, `army: "<new tag>"`), op `squad` per squad (`name`, `army`, `like`, `members`), op `breed` for its own soldiers (`name`, `army`, `like`)
4. names: op `text` for every new card; missing ones: `node tools/loccover/loccover.js <modDir> [--lang eng] [--vfs --game dir] [--exe as64|mowas_2|goh] [-q] [--summary]`
5. bots for the new army: they buy nothing until their data lists it (→ skill `mow-mod-ai-bots`; `mow_bots_recipe` `action: "check"`)
6. lint: `node tools/milint/milint.js <mod folder> [--game dir] [--exe ..]` (MIS_ARMY_ID_NEGATIVE, bot army missing) and `node tools/check/check.js <mod, anywhere> [--exe as64,mowas2,goh]`
   GUI: Units tab for the cards; Mods tab > Check & Fix

## Rules (shared)
- army entry: `{army {id N} {title "loc/key"} {icon "path"} {appid_base ..}}`; stock ids 0 usa, 1 ger, 2 rus, 3 eng, 4 jap, 5 ger2
- a card belongs to an army by its army TAG in `tags`; the tag must match the player's army or the card never shows
- rank unlocks are kept per army
- soldiers' names and voice come from the breed's `nationality` (name generator group) and `voice` → a new nation needs these in its breeds or it reuses the base army's

## Per game
| | as64 | mowas2 | goh |
|---|---|---|---|
| op `army` | yes | yes (`--target mowas2`) | AS2-only op: answers `GEN_*_AS2_ONLY`; GoH armies are rus, ger, fin, eng, usa with period folders |
| rosters | `set/multiplayer/units/*.set` | same | `units/<period>/units_<army>.set` |
| names | `#<slug>.lng` | same | `<slug>.pot` |

## Silent fails
- MIS-07 `id` below 0 = not selectable; duplicate ids parse without a word (a mod may reuse a stock id and then shares its rank unlocks); the `flag` key is not read
- MIS-09 a bot `Purchases` stage without the new army buys nothing for it, no error
- MIS-32 bot lists need the exact card names `name(side)` of the new army
- TST-94 registering the army's roster through a mod `units/common.set` replaces the stock unit list whole
- VFS-42 / VFS-01 copies of stock roster or army files replace them whole: with another mod that touches the same file one side loses
- LOC-02 missing lobby or card names show raw keys; UI-03 a missing flag picture is silent
- KEY-24 `.set` files are compared in the multiplayer lobby: every player needs the mod, or the lobby reports a mismatch

## Verify
- `mow_army` (no `army`, `mod`) lists the new army; `mow_army` (`army: "<new tag>"`, `mod`) lists its cards
- in game: pick the army in a skirmish lobby (name and flag shown), open every buy tab, buy one unit of each kind, add a bot of that army and watch it buy; read game.log (→ skill `mow-mod-test`)

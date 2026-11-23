# mow-mod-together: both mods change the same unit, gun or entity name

when: two mods give one key different values (WARN_CONFLICT_MOD_MOD), or both ship an entity of the same name (CONFLICT_ENTITY_NAME_DUP). This is a design choice: ask the user, never merge by guess.

## Steps
1. list: MCP `mow_mods_clash` (`mods` in load order) · CLI `node tools/conflicts/conflicts.js --game G --mods a,b [--exe as64|mowas_2|mowas2|goh] --mods-only --fmt md`
2. show both sides in plain numbers: MCP `mow_unit_stats` (`id`, `mod` = one mod folder) once per mod; raw entity: `mow_entity_info` (`names`, `mods` in load order: winning source, include chain, refs)
   CLI `node tools/entityindex/entityindex.js <gameDir|-> [--exe ..] [--mods a,b] [name...]`
3. same key, different values: the last mod wins today. per key the user picks a side or accepts the winner; patchmod keeps the winner's value unless told: spec `{ files: [{ key, mode: 'merge', prefer: mod, picks: { '<entry path>': mod } }] }`
4. same `.def` name in two folders: the second is ignored with `Entity redefinition`; first mounted wins [V across layers], so the EARLIER source wins [T between two mods] (ENG-04). a same-path override is not a redefinition. fix = one side renamed (its roster card, text key and refs with it) or one side dropped; that is an edit to a copy in the patch, ask
5. write: MCP `mow_mods_patch` (`mods`, `out`, `name`; plan then `write: true`) · CLI `node tools/conflicts/patchmod.js plan|write --game G --mods a,b --out <new folder> --spec f.json`
6. GUI: Share tab > Share page > Mods together, pick per value, then the fix plan (`gui_call` `POST /api/x/share/clashfix` with `files`)

## Per game
| game | note |
|---|---|
| as64 | armour: a nonzero `armor_*` macro side overrides the per-volume `{thickness}` (DMG-06): compare the macro arguments, not only the volumes |
| mowas2 | same; read with `--exe mowas_2` |
| goh | unit cards carry cost in `units/<period>/units_<army>.set` [I]; mods of equal Require count order by `Priority` (GHVFS-25); GoH armour forms are not mapped by the tools |

## Silent fails
- WARN_CONFLICT_MOD_MOD: the loser's value is simply not there; a mod balanced around its own value is now off
- ENG-04 the ignored def logs one `Entity redefinition` line, nothing else: the unit looks like the other mod's
- VFS-15 with no Require between the two, who is "last" can flip between PCs → load-order.md
- MIS-32 renaming a card to split the two units: bots stop buying the old name

## Verify
- `mow_unit_stats` (`id`, `mod` = the patch) shows the picked values
- conflicts with the patch last: the key is CONFLICT_PATCHED, not WARN_CONFLICT_MOD_MOD
- in game: buy the unit, read price and name, fire its gun; game.log read (→ skill `mow-mod-test`); balance side: skill `mow-mod-weapons-damage`

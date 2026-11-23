# mow-mod-weapons-damage: fire, burning, ammo cook-off, vehicle explosion

when: "tanks explode too often", "never burn", "flamethrower does nothing", "more ammo in the tank changed how it dies", "fuel fire", "molotov on the engine deck".
game word: MCP `game` = `as64|mowas2|goh` · CLI `--exe as64|mowas_2|mowas2|goh`. `<mod>` = the user's mod folder. Most of this is script data (`set/interaction_entity/*.inc`): numbers differ per mod, read the mod's files.

## Steps
1. read the rule blocks: MCP `mow_lookup` (`query: "damage cookoff"`, `mode: "topic"`; also `"damage fire"`) · `mow_limit` (`ids: "DMG-17 DMG-18 GPL-14"`)
   CLI �
2. find which file the game reads: MCP `mow_file_which` (`path` e.g. `set/interaction_entity/tank.inc`, `mods`)
3. what a vehicle carries (drives the odds): MCP `mow_unit_stats` (`id`, `mod`); change the ammo box: `mow_kit_slot` (`mod`, `id` / `entity`, `add`, `del`, `write`) (→ skill `mow-mod-units`)
4. change a number: gen op `set` (a key of a file) or `macro` (an argument of a macro call) through MCP `mow_mod_gen` (`mod`, `ops`, `write`)
   CLI `node tools/patch-entity/patch-entity.js <mod> --game G --file <key> --set p=v [--exe as64|mowas_2|mowas2|goh] [--dry-run]`
   rewriting the `{on ..}` handlers themselves → see skill `mow-mod-scripts`
5. fire damage of an item or shell: `damage fire {radius}{heating}{time}` on the stuff (gen ops `shell`, `item`, field `damage_edit`)
6. lint: `node tools/ialint/ialint.js <mod> [--game dir] [--exe as64|mowas_2|mowas2|goh]` (interaction scripts) and `node tools/check/check.js <mod>`
7. GUI: no page for this; Editor tab on the `.inc` file, Mods tab > Check & Fix; pages via `gui_pages`

## Fire (engine) [V]
- a fire is a sphere (`damage fire` on a stuff, or script `{fire radius time heating}`); each update things inside are heated; allies get a reduced factor
- an entity ignites when the heat it gathers passes its `inflammation_time` (script value in seconds); the engine default is "never" (DMG-17): an entity or block with no value does not burn
- ignition fires `burn` and, per volume in the sphere, `burn_volume`; cooling starts after a short delay; fire on water ground ends at once; a fire places a path obstacle
- fire spreads only through new fire spheres spawned by burning things; damage over time is script-driven (a burning soldier dies after a few seconds, vehicles through cook-off or fuel fire)
- `{burn ..}` action: `time`, `fx`, `fake` (effect without ignition), `stop`

## Cook-off (vanilla script design) [V data]
- `explosive_amount` of a vehicle = sum over its inventory of count x charge for EVERY blastwave layer of every item, AP shells too (DMG-18)
- a hit or spall roll calls the ammunition macro with a cap per vehicle class; the amount against that cap picks the chance and the outcome ladder: fire and bail, cook-off, delayed or instant explosion
- so: more shells, bigger HE layers or a lower cap = more and bigger explosions. keep the ammo total constant when you only want to change the loadout
- blast and penetration use separate point ladders: tune both (GPL-14 [I])
- fuel leak → fuel fire → possible cook-off is its own chain
- the explosion size per class is a blast layer in the vehicle script; the turret tears off through `cut_parts`
- mines and bombs have their own short `inflammation_time`: fire sets them off

## Per game
| game | note |
|---|---|
| as64 | as above |
| mowas2 | same engine rules; scripts are the base game's (no `as64/core` layer) |
| goh | vehicle parts have health and their own damage actions (GHDMG-25, GHDMG-49); the AS2 point ladders do not apply as written. ([I], not yet tried in game) |

## Silent fails
- DMG-17 no `inflammation_time` in the matching interaction block = never ignites, no message
- DMG-16 a handler written `{##on ...` is skipped whole (check code DISABLED_ON)
- DMG-14 blast handlers run once per layer: a multi-layer shell adds safety points several times unless a flag dedupes
- GPL-07 `{delay}` re-run restarts the timer and loses the bullet / volume context
- VFS-01 / VFS-41 a mod copy of a shared `.inc` replaces the whole file: other mods' handlers in it vanish
- GPL-16 a plain flamethrower may work only in direct control [I]

## Verify
- in game: console `dbg_interactionEvent 1` shows which events fire [V]; set a fixed test (same gun, same plate, 10 shots) before and after and count burn / explode / bail outcomes; read the log (→ skill `mow-mod-test`)
- chances are random: say how many trials the result rests on

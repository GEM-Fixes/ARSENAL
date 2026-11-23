# mow-mod-weapons-damage: shell kinds, a new shell, per-ammo parameters

when: "add an APCR shell", "new HE shell", "HEAT", "this shell does the wrong damage", "which shells does this gun fire".
game word: MCP `game` = `as64|mowas2|goh` · gen `--target as64|mowas2|goh` · CLI `--exe as64|mowas_2|goh`. `<mod>` = the user's mod folder.

## Steps
1. list the shells and what each gun does with them: MCP `mow_weapon_find` (`q`, `group: "ammo"` or the game's shell folder name, `mod`)
   CLI `node tools/statsheet/statsheet.js [gameDir] [--exe as64|mowas_2|goh] [--folder <mod>] --sheet ammo,weapons --fmt md [--filter re]`
2. a new shell: MCP `mow_mod_gen` (`mod`, `ops`, `write`) with a `shell` op: `id`, `like` (the base shell), then `preset`, `args`, `blast`, `mass`, `cumulative`, `entity`, `tags`, `damage_edit`
   sample on real names: `node tools/gen/gen.js --sample shell` (a heavier HE shell with its own two blast layers)
   CLI `node tools/gen/gen.js spec.yaml|json --target as64|mowas2|goh [--plan] [--out dir] [--game G] [--goh H]`
3. make the gun use it: the gun needs a `parameters "<the shell's tags>"` block (or its top-level values apply), and the unit's inventory / `filling` must hold the shell. gun side: gen op `gun` field `params`, or `set`; unit side: MCP `mow_kit_slot` (`mod`, `id` / `entity`, `add`, `del`, `write`) for the vehicle's ammo box (→ skill `mow-mod-units`)
4. one key of an existing shell: `node tools/patch-entity/patch-entity.js <mod> --game G (--entity n|--file key) --set p=v [--exe as64|mowas_2|mowas2|goh] [--dry-run]`
5. GUI: Units & Balance tab > Units page (equipment / ammo box of a unit); Models tab > Armour to try the shell against a plate (not GoH); routes via `gui_routes`
6. lint: `node tools/check/check.js <mod> [--exe as64,mowas2,goh]`; statsheet codes PARAM_BLOCK_SHADOWED, PARAM_TAG_UNKNOWN, BLASTWAVE_REPLACED

## How a shell kind is told apart (shared engine) [V]
- a shell is a `bullet` stuff; its kind is only its tags (`ap`, `apcr`, `fg`, `heat` ...) plus a few keys:
| kind | what makes it so |
|---|---|
| AP family | no `detonationThickness` (default: never detonates on a plate); penetration from the gun's table for its tags |
| HE (`fg`) | `detonationThickness` small → any real plate or wall stops and detonates it; `damage blastwave` layers; tag `fg` = no ricochet |
| HE with an AP wound | adds `applyProjectile`: also leaves an AP-style armour wound when it detonates after piercing |
| HEAT | `cumulative m`: the jet goes on m metres past the first hit; `no_ricochet`; own blast macro |
| fire, smoke | `damage fire {radius}{heating}{time}`; smoke adds a smokescreen extender |
- the gun picks numbers per shell with `parameters "<tags>"`: exact tag match, first block in file order; same-tag blocks merge, later keys win (DMG-01)
- `damage` effects a stuff accepts: `blastwave` (only `energy`, `area`), `fire`, `flash`, `cumulative`. `projective` and `health` are listed and rejected (KEY-13)
- shell class tags (`shell_medium`, `shell_big` ...) pick the row of the vehicle damage scripts; the penetration margin never reaches a script (DMG-10)
- AP that shatters (script `shell_shatter`, ammo without tag `capped`) detonates with small "ap" layers [V data]

## Per game
| game | note |
|---|---|
| as64 | default |
| mowas2 | same rules; `--exe mowas_2` |
| goh | ammo items `bullet<nation>_<cal>`; per-ammo overmatch tables `OvermatchCalibre/Fixed/Slope` exist only there (GHKEY-59, GHDMG-27); vehicle part health damage is a GoH action with no AS2 key (GHDMG-25, lim PORT-18). Not yet tried in game, not run [I] |

## Silent fails
- DMG-01 `apc` != `apcbc`: a shell with no matching block silently uses the gun's top-level values; an earlier block whose tags are a subset shadows a later one
- KEY-17 / DMG-13 `damage blastwave` without `add` replaces the inherited first layer; two plain lines keep only the last
- KEY-02 any key other than `energy` / `area` inside `damage blastwave` = "unexpected token" error
- KEY-10 ammo whose tag is not `bulletNN` gives no calibre: the gun must set `calibre`
- DMG-11 an HE shell never fires the `pierce` event
- DMG-18 a new blast layer raises `explosive_amount` of every carrier: cook-off odds shift
- LOG-07 a unit filled with a shell name that does not exist: `dummy_checker`, crash on use

## Verify
- statsheet `--sheet ammo --scope mod` lists the shell with the layers you meant
- in game: load the shell (ammo switch), fire at a plate and at soldiers; read the log (→ skill `mow-mod-test`)

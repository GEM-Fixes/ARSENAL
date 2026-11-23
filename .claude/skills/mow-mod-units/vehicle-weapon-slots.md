# mow-mod-units: vehicle ammo box and weapon slots

when: "more shells in the tank", "add HE rounds", "swap the gun of this tank", "put an MG on it", "vehicle has no ammo", "gun does not fire".
game: MCP `game` = `as64|mowas2|goh` · gen `--target as64|mowas2|goh`. `<mod>` = the user's mod folder (full path), G = game install.
Changing the gun's own values (range, reload, penetration) → skill `mow-mod-weapons-damage`.

## Steps
1. read: MCP `mow_unit_stats` (`id`, `show: ["equipment"]`, `mod`): ammo box items and weapon slots; names of guns and shells: `mow_weapon_find` (`q`, `group`, `mod`)
2. ammo box: MCP `mow_kit_slot` (`mod`, `id` or `entity: "<vehicle entity>"`, `add: [{item, count?}]`, `del: ["item"]`), preview then `write: true`
3. swap a weapon slot: MCP `mow_kit_slot` (`mod`, `id` or `entity`, `slots: {"<slot>": "<weapon item>"}`; `false` empties the slot)
   same through `mow_unit_change` (`what: "equipment"`, `add`, `del`, `slots`)
   spec route: gen op `weapon` (`entity`, `weapon`, `place`); a turret from another unit: op `kitbash` (`entity`, `turret_from`, `part`); fields: `node tools/gen/gen.js --schema`
   GUI: Units tab > Equipment card (vehicle box, weapon slots; `POST /api/x/units/kit/slot`). box and slot edits have no CLI of their own: use MCP or the GUI
4. will it fire: `node tools/firecheck/firecheck.js <def> [--exe as64|mowas_2|goh] [--game G] [--dist N] [--json]` (aim bone, foresight, range, casemate; warnings only)
5. check: `node tools/check/check.js <mod, anywhere> [--exe as64,mowas2,goh]` (refcheck: unknown weapon or ammo ref = crash class)

## Rules (shared)
- def `{weaponry {place "gun" {weapon "<stuff tags>" filling "<ammo tags>" N | filled} {gunner ..}{charger ..}{foresight ..} ..}}`; the first place is the basic one
- `filling <tags> <count>` = what is loaded at spawn; `filled` = a full default magazine
- the ammo box is the vehicle's `extender "inventory"` box: `{item <tags> [n]}`; `{user "mount"}` marks an item sitting on a weapon mount
- the gun reloads from box items whose tags hold ALL of the weapon stuff's `filling` tags: a shell with other tags is carried but never loaded
- `gunner` / `charger` name seat groups: an empty seat = no fire or no reload
- `StationaryFiring` = fires only when stopped; `AccuracyByMotion` makes shooting on the move worse (`by*` values at most 1, KEY-18)
- a new gun needs matching bones in the model (foresight, barrel); a model without them can not aim it (see skill `mow-mod-models-effects`)

## Per game
| | as64 | mowas2 | goh |
|---|---|---|---|
| box + slots | `mow_kit_slot` | same | answer names what GoH forms it can write; AS2-only ops say `GEN_*_AS2_ONLY` |
| firecheck | AS2 foresight rules | `--exe mowas_2` | reads `AimBone` (FC_AIMBONE_MISSING) |
| shell choice by calibre | no overmatch tables | same | overmatch tables exist only here (GHDMG-27) |

## Silent fails
- LOG-07 a weapon or ammo name that matches no stuff becomes `dummy_checker`: the unit loads and the game crashes later on use (refcheck REF_WEAPON_UNKNOWN)
- DMG-01 a shell whose tags match no `parameters` block of the gun silently uses the gun's top-level values (`apc` is not `apcbc`)
- HUM-25 two items aimed at one weapon place: the second is ignored
- HUM-23 a non-stackable `{user}` item with a count other than 1 only warns
- KEY-10 ammo not tagged `bulletNN` and without `calibre` gets a wrong calibre
- HUM-21 box items that do not fit are dropped silently
- VFS-01 the def copy made for the change replaces the whole vanilla def: other mods' edits to it vanish

## Verify
- `mow_unit_stats` (`show: ["equipment"]`, `mod`) reads the box and slots back
- in game: buy the vehicle, open its inventory, fire each shell type, let it reload from the box, fire the swapped weapon; read game.log (→ skill `mow-mod-test`)

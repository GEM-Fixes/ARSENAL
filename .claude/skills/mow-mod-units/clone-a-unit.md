# mow-mod-units: add a unit by cloning an existing one

when: "add a unit", "new tank from the T-34", "copy this unit under a new name", "variant of X".
game: MCP `game` = `as64|mowas2|goh` · gen `--target as64|mowas2|goh`. `<mod>` = the user's mod folder (full path), G = game install.
A clone keeps the base model. A new model or a GoH unit: see skill `mow-mod-models-effects` / skill `mow-mod-port`.

## Steps
1. pick the base: MCP `mow_unit_find` (`q`, `army`), then `mow_entity_info` (`names: ["<base>"]`) for its def, includes and refs
2. one call, ops in this order (preview, then `write: true`): MCP `mow_mod_gen` (`mod`, `ops`):
   - `{op:"clone", entity:"<base>", as:"<new id>", name:"Shown name"}` (also `set`, `copy_assets`, `roster`, `material`, `wreck`)
   - `{op:"roster", unit:"<new id>", like:"<base card>", army:"<tag>", fields:{cost:N}}` = its own buy card (also `icon_like`, `tags`, `bots`, `period` on GoH)
   - `{op:"iblock", entity:"<new id>", like:"<base>"}` = engine and track sounds, copied from the base's block in `set/interaction_entity/*.inc`
   - then changes on the clone: `armor`, `set`, `weapon`, `macro`, `text`
   CLI `node tools/gen/gen.js --sample clone-unit` (and `--sample iblock`), run with `--plan` first
   stuff (weapon, item) from a base: `node tools/clone-entity/clone-entity.js --game dir [--mods a,b] [--exe as64|mowas_2|mowas2|goh] --out <mod folder> --stuff "<base tags>" --tags <new.dot.tags> [--name "Display"] [--set key=value ...] [--dry-run] [-q]`
   GUI: Units tab > add a unit (route `POST /api/x/units/add`); Quick Guided Task "add a unit"
3. bots: a new card is bought by bots only if their list names it (roster `bots`; → skill `mow-mod-ai-bots`)
4. check: `node tools/check/check.js <mod, anywhere> [--exe as64,mowas2,goh]`; will it fire: `node tools/firecheck/firecheck.js <def> [--exe as64|mowas_2|goh] [--game G] [--dist N] [--json]`

## What a working clone needs (shared) → guide p03-add-a-unit
- its own def under `resource/entity/..` with an ASCII id (`a-z 0-9 _ - ( ) .`), unique after lower-casing (VFS-02)
- its own name key `desc/entity/<new id>` in the mod's `#` text file
- its own card in a roster the army loads; card `content` empty = the card's own name [V mission/mp-units]
- its interaction block when the base has one by id (sounds, tracks): op `iblock`
- icon: the card's picture; `icon_like` reuses the base's (→ skill `mow-mod-text-ui`)

## Per game
| | as64 | mowas2 | goh |
|---|---|---|---|
| clone, roster | yes | yes (`--target mowas2`, range 3.262) | card, roster forms work; AS2-only ops answer `GEN_*_AS2_ONLY` |
| def path | `entity/-vehicle/..` | same | `entity/-vehicle/<nation>/<class>/` |
| card | `set/multiplayer/units/*.set` | same | `units/<period>/units_<army>.set`, one card per period [I] |
| name | `#<slug>.lng` | same | `<slug>.pot` |
| armour ops on the clone | yes | yes | refused (GoH armour forms not mapped) |

## Silent fails
- KEY-27 a cloned def's model path (`Extension`) is relative to the def's own folder unless it starts with `/`: a clone in another folder finds no model (`Resource not found`), no fallback
- VFS-42 the roster copy replaces the whole vanilla file; VFS-01 same for a def or include: other mods' edits vanish (gen GEN_FILE_FULL_COPY, clone-entity ROSTER_REPLACES)
- LOC-02 no name key = raw key on the card
- LOG-07 an unknown stuff (weapon, ammo) named by the clone becomes `dummy_checker`: loads, crashes on use (refcheck REF_WEAPON_UNKNOWN)
- KEY-17 a cloned stuff's `damage X` without `add` replaces the inherited layer; KEY-19 `{from}` loses `throw_off_always` (clone-entity re-emits it)
- MIS-32 bot lists hold exact card names: a new card is never bought until listed
- TST-94 do not ship `units/common.set` to register a roster: it replaces the stock list whole

## Verify
- `mow_unit_find` (`q: "<new id>"`, `mod`) lists it with name and price; `mow_unit_stats` (`id`, `mod`)
- in game: buy it, see name, icon, model, hear engine, fire the gun; read game.log (→ skill `mow-mod-test`)
- verdict of gen is static; say what was not seen in game

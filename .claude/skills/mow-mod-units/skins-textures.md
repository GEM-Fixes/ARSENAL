# mow-mod-units: skin (uniform) and texture variant (camo)

when: "give them a winter uniform", "another skin", "camo for this tank", "texture variant", "soldier looks like a skeleton", "repaint".
game: MCP `game` = `as64|mowas2|goh` · gen `--target as64|mowas2|goh`. `<mod>` = the user's mod folder (full path), G = game install.
Making or converting the texture files themselves: see skill `mow-mod-models-effects`.

## Steps
1. what the unit has and what its model offers: MCP `mow_unit_stats` (`id`, `breed: "army/name"` for one soldier, `show: ["look"]`, `mod`)
2. another skin on a soldier: MCP `mow_look_set` (`mod`, `id` or `breed`, `skin: "<skin name>"`; GoH `card`), preview then `write: true`
3. a texture variant on a soldier or vehicle: MCP `mow_look_set` (`mod`, `id` / `breed` / `entity: "<vehicle entity>"`, `texture: "<variant>"`; `"none"` clears it)
   same through `mow_unit_change` (`what: "skin"` or `"texture"`, `value`)
4. a NEW skin from an old one: MCP `mow_mod_gen` (`mod`, `ops: [{op:"skin", id:"<new skin>", like:"<base skin>", textures:{diffuse:"<file.dds>"}, texmod:..}]`, `write`); sample `node tools/gen/gen.js --sample skin`
   a vehicle variant from your own .dds: `{op:"skin", id:"<variant>", entity:"<vehicle>", textures:{..}, texmod:true}` writes `<texture>#<id>.dds` beside the model and sets `{texmod "<id>"}` in the def (whole-file copy, GEN_SKIN_FULL_COPY); without `texmod` a mission or map.info picks it (tools/gen/README.md, skin)
   GUI: Units tab > Look card (`POST /api/x/units/look`, `look/skins`, `look/set`); Models tab shows skins and texture variants
5. check: `node tools/check/check.js <mod, anywhere> [--exe as64,mowas2,goh]`

## Rules (shared); headers of tools/gui/ext/units/look.js
- a soldier wears `{skin "name"}` of his breed = `/entity/humanskin/<name>.def` [V]; no skin = `skeleton`
- a texture variant is a file `<texture>#<variant>.<ext>` beside the base texture [V]; the unit names the variant, the model stays the same
- a new skin = its own humanskin def + model views + textures; op `skin` copies them under new names so the base is untouched
- map-wide variant (season) is set per map: gen op `mapinfo` (→ skill `mow-mod-maps-missions`)

## Per game
| | as64 | mowas2 | goh |
|---|---|---|---|
| breed name | `army/name` | same | `army/period/name` |
| skin + variant tools | yes | yes | check the answer: AS2-only ops say `GEN_*_AS2_ONLY` |
| texture formats | `.dds` (and `.tga`) | same | GoH art needs converting before AS2 reads it (→ skill `mow-mod-port`) |

## Silent fails
- HUM-18 an unknown breed, or a skin def that does not exist, leaves the soldier as `skeleton` with at most a warning
- KEY-27 a copied skin def finds its model only relative to its own folder unless the path starts with `/`
- VFS-02 file names are lower-cased: `Tank#Winter.dds` and `tank#winter.dds` are one file
- a variant name with no matching `#<variant>` file shows the base texture, no log line [I]: `mow_unit_stats` `show: ["look"]` lists the variants that exist
- KEY-24 textures (`.dds`) are not compared in the multiplayer lobby: players can see different camo with no desync
- VFS-01 the breed or def copy made for the change replaces the whole vanilla file

## Verify
- `mow_unit_stats` (`show: ["look"]`, `mod`) reads the new skin or variant back
- in game: spawn the unit and look at it close up, on the map season it is meant for; read game.log for `Resource not found` (→ skill `mow-mod-test`)

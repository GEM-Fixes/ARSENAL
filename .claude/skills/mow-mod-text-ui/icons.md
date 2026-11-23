# mow-mod-text-ui: buy-menu and unit-list icons

When: "my unit has no icon", "empty / grey picture on the card", "icon from my PNG", "category button picture", "panel button picture".
Portraits, squad pictures, damage scheme → `portraits-squad-pictures.md` of this skill.

## Which file the game looks for
| picture | path under `resource/interface/scene/` | name |
|---|---|---|
| buy card | `unit_icon/` | the CARD name; squads with side: `riflemans(usa)` |
| in-game unit list (vehicle, gun) | `unit_icon_small/` | the `.def` stem; absent → `icon_stub` |
| category button | `unit_icon/` | `<button tag>(<army>)`, then `<button tag>` |
| command-panel button | `panel_control/` | the action's `button` stem (default = action name) |
| reinforcement bar | `unit_icon/` | `<image>`, fallback `stub` |
- code never writes the extension. frames: `<name>_00` normal, `_01` hover, `_02` pressed, `_03` disabled (`_04` checked on state buttons). panel buttons: up to 4 variants x 4 frames
- formats: `.ebm` / `.tex` first, else the LAST match of `.dds .tga .bmp .jpg .png`; `.gif` and `.psd` are not loaded. names are case-insensitive
- a new vehicle needs `unit_icon/<card id>_00..03` and `unit_icon_small/<def stem>_00..03`

## Steps
1. which files a unit wants and which the mod has: `gui_call` `GET /api/x/art/icons` (query `name` = unit, `mod`)
   GUI: Look & Sound page, job "Change a buy-menu icon", "Icon helper" → "Show icon files"
2. make the frames from a PNG: `gui_call` `POST /api/x/art/icon-png` (body `mod`, `name`, `kind`, `png` = file path, `dry: true` for the preview; kinds on the page: icon (4 frames), squad card (3 frames), portrait, damage scheme; read exact values with `gui_routes`)
   writes `.tga` at the game's size at the right paths in the mod; the preview says when a file replaces one of the mod's
3. a new unit that should look like an old one: MCP `mow_mod_gen` (`mod`, `ops: [{op:"card", unit, army, icon_like:"<old unit>"}]`; `roster` takes `icon_like` too): copies the old unit's icon files
4. by hand (no CLI converts a picture): save the frames as `.tga` at `resource/interface/scene/unit_icon/<card id>_00.tga` .. `_03.tga`, the same in `unit_icon_small/` with the `.def` name
5. check: `gui_call` `POST /api/x/art/check` (Run Art check: picture headers, pictures hidden by another file of the same name)
   MCP `mow_mod_check` (`mod`, `only: "uilint"`) · CLI `node tools/uilint/uilint.js <mod> [--game G] [--exe as64|mowas_2|mowas2|goh]` (PICTURE_MISSING)
6. which copy wins: MCP `mow_file_which` (`path: "interface/scene/unit_icon/<name>_00.tga"`, `mods`)
No GUI running: `gui_status` says so; `gui_start` needs the launch switch → skill `arsenal-gui-use`. Texture work beyond icons → skill `mow-mod-models-effects`.

## Per game
| | as64 | mowas2 | goh |
|---|---|---|---|
| Look & Sound page, icon task | yes | yes | not offered under the GoH tab: make the pictures by hand, check on the Check page |
| frame name rule under `/interface/` | stem + 2 digits, also longer forms (`T_NN`, `TNN`, `T_xNN`, `TNNNN`) | same | only `nameNN` or `name_NN` (guide p08; a set made for one game can animate wrongly in the other) |
| `.dds` kinds | no DX10 layout (guide 15); BC5 warns `Unknown DDS picture format`, texture absent (lim FMT-02) | same | two-channel BC5 loads (GHFMT-03) |
| missing squad icon | silent | silent | logs "Unknown bitmap" (guide 15; not run in game) |
| uilint picture check | error level | error level | info only [I] |

## Silent fails
- UI-03 missing or misspelt picture: stub or nothing, never a log line
- a stray `.tga` / `.png` beside a `.dds` of the same name replaces it (last extension wins): Art check lists hidden files
- a `.dds` saved as DX10, or compressed with sides not a multiple of 4: not loaded / grey dummy (guide 15)
- a 16-bit TGA looks darker; a right-to-left TGA is mirrored; an all-zero alpha counts as no alpha (guide 15)
- wrong folder (not the game's path below `resource/`): never read
- the buy card uses the CARD id, the small icon the DEF name: one right, the other still a stub

## Verify
- `GET /api/x/art/icons` shows every frame present in the mod; uilint has no PICTURE_MISSING
- in game: buy panel (normal, hover, disabled states) and the unit list after buying (→ skill `mow-mod-test`)

Depth: · guide p08-icons-and-interface, 15 (2. Icons)

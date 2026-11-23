# mow-mod-text-ui: portraits, squad pictures, damage scheme, art from Gates of Hell

When: "soldier portrait", "squad card picture", "side marker", "armour scheme picture of my tank", "use Gates of Hell icons in my AS2 mod".
Buy-card and unit-list icons → `icons.md` of this skill.

## Source of each picture
| picture | path under `resource/interface/scene/` | name comes from |
|---|---|---|
| infantry in the unit list / on cards | `squad/` | the breed's portrait stem (set by the breed's `portrait` key) |
| soldier portrait, vehicle crew | `portrait/` | portrait name |
| side / kind marker | `squad/icon_tank(<ng>)`, `icon_cannon(<ng>)`, `icon_vehicle(<ng>)` | `<ng>` = the unit's nation tag; fallback `squad/icon_stub` |
| group numbers, spectator | `squad/icon_hotkey_<n>`, `squad/spectator*` | fixed |
| damage / armour scheme | `structure/<vehicle>/` | the vehicle model |
| vehicle view parts | `vehicle_view/<model>/<part>.ebm`, `<model>/damage/<part>.ebm` | the model |
- a new vehicle without `structure/` art shows a stub; optional
- picture formats and the "last extension wins" rule are the same as for icons: `.ebm` / `.tex` first, else the last of `.dds .tga .bmp .jpg .png`

## Steps
1. which portrait a soldier uses: MCP `mow_unit_stats` (`id`, `breed`) or `mow_entity_info` (`names`); the breed file holds the `portrait` key
2. make the picture from a PNG: `gui_call` `POST /api/x/art/icon-png` (body `mod`, `name`, `kind`, `png`, `dry: true` first). kinds on the page: "portrait" (one file under the breed's portrait name), "squad card (3 frames)" (into `interface/scene/squad/`), "damage scheme" (one `scheme.tga` under `structure/<vehicle>/`); exact field values: `gui_routes`
   GUI: Look & Sound page → "Use my own PNG" → Preview → "Write into my mod"; Quick Guided Task "an icon" covers icon, portrait, squad card, damage scheme
3. give a soldier another portrait: the breed's `portrait` key: MCP `mow_mod_gen` (`mod`, `ops: [{op:"breed", name, army, like, set:{portrait:"<stem>"}}]`; the `set` form of the key is [I]: run it as a preview first) → skill `mow-mod-units` for breeds
4. art from GoH into an AS2 mod: `node tools/artport/artport.js port --src <scene.pak|dir> --from <goh stem> --to <new stem> --out <dir> [--kinds unit_icon,unit_icon_small,squad,portrait,vehicle_view] [--convert png] [--size 104x52]`
   `--from-entity <entity|breed>` picks the stem per kind; `find <scene.pak|dir> <substr>` searches; `census` counts; `convert <in> <out.tga|png> [--size WxH]` converts one file
   `.gif` is not a registered loader in as64: always converted [V]; `.png` goes as is by default [T in game], `--convert png` writes `.tga` instead
   reads GoH, writes only `--out` (+ `art-port.json`); GoH art in a release: mind the owner's rights, packer has a GoH guard → skill `mow-mod-share`
5. check: `gui_call` `POST /api/x/art/check` · MCP `mow_mod_check` (`mod`, `only: "uilint,binhdr"`)

## Per game
| | as64 | mowas2 | goh |
|---|---|---|---|
| portrait kinds | 15 | 15 | 22: new `pistol shotgun assaultrifle autorifle smg2 grenadelauncher at_rifle` (GHUI-71): a set brought from GoH needs them |
| squad icons | as above | same | more under `/interface/scene/squad/` (`icon_flaregun`, `icon_engineer`, `icon_helicopter` ..) (GHUI-54) |
| icons over units | options `ui/show_squad_icons`, `ui/enable_squad_icons` | same | option `game/show_scene_actor_buttons` (GHUI-53) |
| minimap marker | only AI units need able `minimap` | same | every unit needs it (GHUI-64) |
| Look & Sound page | yes | yes | not under the GoH tab |
| artport | target | target | source only |

## Silent fails
- UI-03 a wrong stem: stub or nothing, no log
- the portrait is named by the BREED's portrait key, not by the breed or card name
- a same-name file with another extension hides yours (Art check lists it)
- UI-20 / UI-19 (menu videos, if ported with the art): `.avi` over 1280x720 shows a still [I]; a fourcc other than XVID is not decoded [I]

## Verify
- Art check clean; in game: select the soldier (portrait), buy the squad (card picture), open the vehicle's damage view (→ skill `mow-mod-test`)

Depth: · guide 15 (Where each kind of picture goes), p08 · tools/artport `formats`
